"""Opt-in PostgreSQL smoke: only temporary tables inside a rolled-back transaction.

RUN_INTEGRATION_DB_TESTS=1 PYTHONPATH=backend-python python -m unittest discover \
    -s backend-python/tests -p test_integration_db.py -v
No real users, channels, messages or payments are touched.
"""
import os
import unittest
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import patch

import asyncpg
import httpx

from app.config import settings
from app.main import app
from app.middleware.admin_auth import create_admin_jwt


class TemporaryPool:
    def __init__(self, conn):
        self.fetch = conn.fetch
        self.fetchrow = conn.fetchrow
        self.execute = conn.execute
        self.conn = conn

    @asynccontextmanager
    async def acquire(self):
        yield self.conn


@unittest.skipUnless(os.getenv("RUN_INTEGRATION_DB_TESTS") == "1", "Opt-in isolated PostgreSQL test")
class IntegrationDatabaseTests(unittest.IsolatedAsyncioTestCase):
    async def test_key_lifecycle_with_real_sql(self):
        conn = await asyncpg.connect(settings.DATABASE_URL)
        transaction = conn.transaction()
        await transaction.start()
        try:
            await conn.execute("SET LOCAL search_path=pg_temp")
            await conn.execute("CREATE TEMP TABLE users(id INTEGER PRIMARY KEY, username TEXT, first_name TEXT, email TEXT)")
            await conn.execute("INSERT INTO users VALUES(1,'owner','Owner','owner@example.com'),(2,'other','Other','other@example.com')")
            await conn.execute("CREATE TEMP TABLE admin_users(id INTEGER PRIMARY KEY, username TEXT, display_name TEXT, role TEXT, is_active INTEGER)")
            await conn.execute("INSERT INTO admin_users VALUES(10,'admin','Admin','superadmin',1)")
            migration = Path(__file__).resolve().parents[1] / "migrations/093_integration_api_keys.sql"
            await conn.execute(migration.read_text())
            # Prove that the shadow tables are temporary, never the public app tables.
            self.assertEqual(await conn.fetchval("SELECT relpersistence::text FROM pg_class WHERE oid='integration_api_keys'::regclass"), 't')
            with patch("app.database.pool", TemporaryPool(conn)):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                    jwt = {"Authorization": "Bearer " + create_admin_jwt(10)}
                    res = await client.post("/api/admin/integration/keys", headers=jwt, json={"user_id": 1, "name": "Smoke", "modules": ["*"]})
                    self.assertEqual(res.status_code, 201, res.text)
                    self.assertEqual(res.headers["cache-control"], "no-store")
                    body = res.json()
                    key_id = body["metadata"]["id"]
                    api_key = {"Authorization": "Bearer " + body["key"]}
                    self.assertEqual((await client.get("/api/auth/me", headers=api_key)).status_code, 200)
                    listed = (await client.get("/api/admin/integration/keys", headers=jwt)).json()
                    self.assertNotIn(body["key"], str(listed))
                    self.assertNotIn("key_hash", str(listed))
                    self.assertEqual((await client.post("/api/admin/integration/keys", headers=api_key, json={"user_id": 1, "name": "Forbidden"})).status_code, 401)
                    self.assertEqual((await client.delete(f"/api/admin/integration/keys/{key_id}", headers=jwt)).status_code, 200)
                    self.assertEqual((await client.get("/api/auth/me", headers=api_key)).status_code, 401)
                    res = await client.post("/api/admin/integration/keys", headers=jwt, json={"user_id": 1, "name": "Expiry"})
                    body = res.json()
                    await conn.execute("UPDATE integration_api_keys SET expires_at=NOW()-INTERVAL '1 day' WHERE id=$1", body["metadata"]["id"])
                    self.assertEqual((await client.get("/api/auth/me", headers={"Authorization": "Bearer " + body["key"]})).status_code, 401)
                    self.assertEqual((await client.post("/api/admin/integration/keys", headers=jwt, json={"user_id": 1, "name": "Bad", "modules": ["admin"]})).status_code, 422)
        finally:
            await transaction.rollback()
            await conn.close()


if __name__ == "__main__":
    unittest.main()
