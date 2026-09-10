"""Integration onboarding and machine-readable API discovery."""
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ..database import fetch_all, execute_returning_row
from ..middleware.auth import get_current_user
from ..services.integration_keys import new_key
from ..services.api_catalog import build_schema, catalog, module_schema, postman_collection

router = APIRouter()


def schema_for(request):
    if not hasattr(request.app.state, "integration_schema"):
        request.app.state.integration_schema = build_schema(request.app)
    return request.app.state.integration_schema


async def session_user(request: Request, user=Depends(get_current_user)):
    if getattr(request.state, "integration_key_id", None) is not None:
        raise HTTPException(403, "Управляйте API-ключами после входа в сервис, не через API-ключ")
    return user


class KeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    expires_in_days: int = Field(default=90, ge=1, le=365)
    modules: List[str] = Field(default_factory=lambda: ["*"], min_length=1, max_length=100)


@router.get("/keys")
async def list_keys(user=Depends(session_user)):
    return {"success": True, "keys": await fetch_all(
        """SELECT id, name, key_prefix, modules, created_at, expires_at, revoked_at, last_used_at
           FROM integration_api_keys WHERE user_id=$1 ORDER BY id DESC""", user["id"])}


@router.post("/keys", status_code=201)
async def create_key(body: KeyCreate, request: Request, response: Response, user=Depends(session_user)):
    response.headers["Cache-Control"] = "no-store"
    modules = sorted(set(body.modules))
    available = {m["id"] for m in catalog(schema_for(request))["modules"]
                 if any(op["access"] == "user" for op in m["operations"])} - {"integration", "admin", "auth"}
    if not body.name.strip() or (modules != ["*"] and not set(modules) <= available):
        raise HTTPException(422, "Укажите название и доступные разделы; * используется отдельно")
    # Serialize key creation per owner to enforce the active-key limit under concurrency.
    from ..database import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.fetchval("SELECT id FROM users WHERE id=$1 FOR UPDATE", user["id"])
            count = await conn.fetchval("SELECT count(*) FROM integration_api_keys WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>NOW()", user["id"])
            if count >= 20:
                raise HTTPException(409, "Не более 20 активных ключей. Отзовите ненужные.")
            token, digest = new_key()
            row = await conn.fetchrow(
                """INSERT INTO integration_api_keys(user_id,name,key_hash,key_prefix,modules,expires_at)
                   VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,key_prefix,modules,expires_at""",
                user["id"], body.name.strip(), digest, token[:12], modules,
                datetime.now(timezone.utc) + timedelta(days=body.expires_in_days),
            )
    return {"success": True, "key": token, "metadata": dict(row), "warning": "Сохраните ключ: повторно показать его нельзя."}


@router.delete("/keys/{key_id}")
async def revoke_key(key_id: int, user=Depends(session_user)):
    row = await execute_returning_row(
        """UPDATE integration_api_keys SET revoked_at=COALESCE(revoked_at,NOW())
           WHERE id=$1 AND user_id=$2 RETURNING id""", key_id, user["id"])
    if not row:
        raise HTTPException(404, "Ключ не найден")
    return {"success": True}


@router.get("/catalog")
async def get_catalog(request: Request):
    return catalog(schema_for(request))


@router.get("/openapi.json", include_in_schema=False)
async def get_schema(request: Request):
    return schema_for(request)


@router.get("/openapi/{module}.json", include_in_schema=False)
async def get_module_schema(module: str, request: Request):
    schema = module_schema(schema_for(request), module)
    if not schema["paths"]:
        raise HTTPException(404, "Раздел не найден")
    return schema


@router.get("/postman.json", include_in_schema=False)
async def get_postman(request: Request):
    return JSONResponse(postman_collection(schema_for(request)), headers={
        "Content-Disposition": 'attachment; filename="max-marketing.postman_collection.json"'})


@router.get("/docs", include_in_schema=False)
async def docs():
    return get_swagger_ui_html(openapi_url="/api/integration/openapi.json", title="MAX Marketing — REST API")
