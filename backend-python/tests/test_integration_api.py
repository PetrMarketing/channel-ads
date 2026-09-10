"""No external services, DB writes, paid generations or messages."""
import hashlib
import re
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import HTTPException
from starlette.requests import Request
from starlette.routing import Match

from app.main import app
from app.services.api_catalog import api_routes, build_schema, catalog, module_schema, postman_collection
from app.services.integration_keys import new_key, authenticate_key
from app.routes.integration import session_user


def request(path="/api/shop/demo/products", method="GET"):
    return Request({"type": "http", "method": method, "path": path, "headers": [], "app": app})


class CatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schema = build_schema(app)

    def test_all_registered_api_operations_are_represented(self):
        expected = {(r.path_format, m.lower()) for r in api_routes(app) if r.include_in_schema for m in r.methods}
        actual = {(p, m) for p, ops in self.schema["paths"].items() for m in ops}
        self.assertEqual(expected, actual)

    def test_no_shadowed_or_duplicate_api_routes(self):
        for target in api_routes(app):
            for method in target.methods:
                path = re.sub(r"\{[^}]+\}", "123", target.path)
                scope = {"type": "http", "method": method, "path": path, "root_path": "", "headers": []}
                first = next(r for r in app.routes if r.matches(scope)[0] == Match.FULL)
                self.assertIs(first, target, (method, target.path))

    def test_operation_ids_unique(self):
        ids = [o["operationId"] for ops in self.schema["paths"].values() for o in ops.values()]
        self.assertEqual(len(ids), len(set(ids)))

    def test_legacy_fields_and_multipart_files(self):
        op = self.schema["paths"]["/api/content/{tc}"]["post"]
        self.assertIn("message_text", op["x-source-fields"]["application/json"])
        files = op["requestBody"]["content"]["multipart/form-data"]["schema"]["properties"]["files"]
        self.assertEqual(files["items"]["format"], "binary")

    def test_independent_specs_and_postman_cover_everything(self):
        cat = catalog(self.schema)
        self.assertGreater(cat["total"], 500)
        self.assertTrue(all(p.startswith("/api/shop/") for p in module_schema(self.schema, "shop")["paths"]))
        coll = postman_collection(self.schema)
        self.assertEqual(sum(len(f["item"]) for f in coll["item"]), cat["total"])
        self.assertEqual(coll["variable"][1]["value"], "")

    def test_separate_admin_and_metrics_credentials(self):
        metrics = self.schema["paths"]["/api/metrics/overview"]["get"]
        self.assertEqual(metrics["security"], [{"MetricsKey": []}])
        for p, ops in self.schema["paths"].items():
            for op in ops.values():
                if op["x-access"] in {"admin", "superadmin"}:
                    self.assertEqual(op["security"], [{"AdminBearer": []}])


class KeyTests(unittest.IsolatedAsyncioTestCase):
    def test_random_key_hash_only(self):
        token, digest = new_key()
        self.assertEqual(len(token), 47)
        self.assertEqual(hashlib.sha256(token.encode()).hexdigest(), digest)
        self.assertNotIn(token, digest)
        self.assertNotEqual(token, new_key()[0])

    async def test_valid_key_uses_existing_user_and_module(self):
        token, digest = new_key()
        row = {"id": 1, "user_id": 20, "modules": ["shop"]}
        with patch("app.services.integration_keys.fetch_one", AsyncMock(side_effect=[row, {"id": 20}])) as read, patch("app.services.integration_keys.execute", AsyncMock()):
            req = request()
            self.assertEqual((await authenticate_key(token, req))["id"], 20)
            self.assertEqual(req.state.integration_key_id, 1)
            self.assertEqual(read.call_args_list[0].args[1], digest)
            self.assertIn("revoked_at IS NULL AND expires_at > NOW()", read.call_args_list[0].args[0])

    async def test_revoked_expired_or_unknown_key_rejected(self):
        with patch("app.services.integration_keys.fetch_one", AsyncMock(return_value=None)):
            with self.assertRaises(HTTPException) as err:
                await authenticate_key(new_key()[0], request())
            self.assertEqual(err.exception.status_code, 401)

    async def test_module_denied_and_account_management_denied(self):
        for path, modules in [("/api/content/demo", ["shop"]), ("/api/auth/merge", ["*"])]:
            with patch("app.services.integration_keys.fetch_one", AsyncMock(return_value={"id": 1, "user_id": 20, "modules": modules})):
                with self.assertRaises(HTTPException) as err:
                    await authenticate_key(new_key()[0], request(path))
                self.assertEqual(err.exception.status_code, 403)

    async def test_cannot_manage_keys_using_another_key(self):
        req = request("/api/integration/keys")
        req.state.integration_key_id = 1
        with self.assertRaises(HTTPException) as err:
            await session_user(req, {"id": 20})
        self.assertEqual(err.exception.status_code, 403)

    async def test_http_unauthorized_and_documentation(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            for url in ["/api/integration/keys", "/api/channels/"]:
                self.assertEqual((await client.get(url)).status_code, 401)
            self.assertEqual((await client.get("/api/integration/catalog")).status_code, 200)
            self.assertEqual((await client.get("/api/integration/openapi/shop.json")).status_code, 200)
            self.assertEqual((await client.get("/api/integration/openapi/missing.json")).status_code, 404)

    async def test_http_key_reaches_existing_channel_permission_checks(self):
        headers = {"Authorization": "Bearer " + new_key()[0]}
        with patch("app.services.integration_keys.fetch_one", AsyncMock(side_effect=[
            {"id": 1, "user_id": 20, "modules": ["shop"]}, {"id": 20}
        ])), patch("app.services.integration_keys.execute", AsyncMock()), patch("app.routes.shop._get_owned_channel", AsyncMock(return_value=None)) as owned:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                res = await client.get("/api/shop/foreign/products", headers=headers)
            self.assertEqual(res.status_code, 404)
            owned.assert_awaited_once_with("foreign", 20)

    async def test_api_key_cannot_be_admin(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/admin/users", headers={"Authorization": "Bearer " + new_key()[0]})
            self.assertEqual(res.status_code, 401)


if __name__ == "__main__":
    unittest.main()
