import asyncpg
import ssl as ssl_module
from typing import Optional, Any, List, Dict
from .config import settings


pool: Optional[asyncpg.Pool] = None


async def init_database():
    global pool
    dsn = settings.DATABASE_URL
    if not dsn:
        raise RuntimeError("DATABASE_URL environment variable is required")

    kwargs: Dict[str, Any] = {
        "dsn": dsn,
        "min_size": 2,
        "max_size": 20,
        "command_timeout": 30,
    }
    if settings.DATABASE_SSL:
        ssl_ctx = ssl_module.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl_module.CERT_NONE
        kwargs["ssl"] = ssl_ctx

    pool = await asyncpg.create_pool(**kwargs)
    print(f"PostgreSQL connected: {dsn.split('@')[-1] if '@' in dsn else dsn}")

    from .migrator import run_migrations
    await run_migrations()


async def get_pool() -> asyncpg.Pool:
    if pool is None:
        raise RuntimeError("Database not initialized")
    return pool


async def close_database():
    global pool
    if pool:
        await pool.close()
        pool = None


# ---------- helpers for routes ----------

async def fetch_one(query: str, *args) -> Optional[Dict[str, Any]]:
    p = await get_pool()
    row = await p.fetchrow(query, *args)
    return dict(row) if row else None


async def fetch_all(query: str, *args) -> List[Dict[str, Any]]:
    p = await get_pool()
    rows = await p.fetch(query, *args)
    return [dict(r) for r in rows]


async def execute(query: str, *args) -> str:
    p = await get_pool()
    return await p.execute(query, *args)


async def execute_returning_id(query: str, *args) -> Optional[int]:
    """Execute INSERT ... RETURNING id and return the id."""
    p = await get_pool()
    row = await p.fetchrow(query, *args)
    return row["id"] if row else None


async def execute_returning_row(query: str, *args) -> Optional[Dict[str, Any]]:
    p = await get_pool()
    row = await p.fetchrow(query, *args)
    return dict(row) if row else None
