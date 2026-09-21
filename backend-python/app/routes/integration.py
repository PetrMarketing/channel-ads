"""Integration onboarding and machine-readable API discovery."""
from datetime import datetime, timedelta, timezone
from typing import List
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field

from ..database import fetch_all, fetch_one, execute_returning_row
from ..middleware.admin_auth import get_current_admin
from ..services.integration_keys import new_key
from ..services.api_catalog import build_schema, catalog, module_schema, postman_collection

router = APIRouter()
admin_router = APIRouter()


def schema_for(request):
    if not hasattr(request.app.state, "integration_schema"):
        request.app.state.integration_schema = build_schema(request.app)
    return request.app.state.integration_schema


class KeyCreate(BaseModel):
    user_id: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=120)
    expires_in_days: int = Field(default=90, ge=1, le=365)
    modules: List[str] = Field(default_factory=lambda: ["*"], min_length=1, max_length=100)


@router.api_route("/keys", methods=["GET", "POST"], include_in_schema=False)
@router.delete("/keys/{key_id}", include_in_schema=False)
async def removed_user_key_management(key_id: int = 0):
    """The legacy cabinet endpoints stay explicitly closed instead of falling through to the SPA."""
    raise HTTPException(404, "Управление API-ключами доступно только в админ-панели")


@admin_router.get("/keys")
async def list_keys(
    search: str = Query("", max_length=120),
    admin=Depends(get_current_admin),
):
    needle = search.strip()
    return {"success": True, "keys": await fetch_all(
        """SELECT k.id, k.user_id, k.name, k.key_prefix, k.modules, k.created_at,
                  k.expires_at, k.revoked_at, k.last_used_at,
                  u.username AS owner_username, u.first_name AS owner_name, u.email AS owner_email
           FROM integration_api_keys k
           JOIN users u ON u.id=k.user_id
           WHERE $1='' OR k.name ILIKE '%' || $1 || '%'
              OR k.key_prefix ILIKE '%' || $1 || '%'
              OR COALESCE(u.username, '') ILIKE '%' || $1 || '%'
              OR COALESCE(u.first_name, '') ILIKE '%' || $1 || '%'
              OR COALESCE(u.email, '') ILIKE '%' || $1 || '%'
              OR CAST(u.id AS TEXT)=$1
           ORDER BY k.id DESC LIMIT 500""", needle)}


@admin_router.post("/keys", status_code=201)
async def create_key(body: KeyCreate, request: Request, response: Response, admin=Depends(get_current_admin)):
    response.headers["Cache-Control"] = "no-store"
    modules = sorted(set(body.modules))
    available = {m["id"] for m in catalog(schema_for(request))["modules"]
                 if any(op["access"] == "user" for op in m["operations"])} - {"integration", "admin", "auth"}
    if not body.name.strip() or (modules != ["*"] and not set(modules) <= available):
        raise HTTPException(422, "Укажите название и доступные разделы; * используется отдельно")
    if not await fetch_one("SELECT id FROM users WHERE id=$1", body.user_id):
        raise HTTPException(404, "Пользователь не найден")
    # Serialize key creation per owner to enforce the active-key limit under concurrency.
    from ..database import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.fetchval("SELECT id FROM users WHERE id=$1 FOR UPDATE", body.user_id)
            count = await conn.fetchval("SELECT count(*) FROM integration_api_keys WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>NOW()", body.user_id)
            if count >= 20:
                raise HTTPException(409, "Не более 20 активных ключей. Отзовите ненужные.")
            token, digest = new_key()
            row = await conn.fetchrow(
                """INSERT INTO integration_api_keys(user_id,name,key_hash,key_prefix,modules,expires_at)
                   VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,key_prefix,modules,expires_at""",
                body.user_id, body.name.strip(), digest, token[:12], modules,
                datetime.now(timezone.utc) + timedelta(days=body.expires_in_days),
            )
    return {"success": True, "key": token, "metadata": dict(row), "warning": "Сохраните ключ: повторно показать его нельзя."}


@admin_router.delete("/keys/{key_id}")
async def revoke_key(key_id: int, admin=Depends(get_current_admin)):
    row = await execute_returning_row(
        """UPDATE integration_api_keys SET revoked_at=COALESCE(revoked_at,NOW())
           WHERE id=$1 RETURNING id""", key_id)
    if not row:
        raise HTTPException(404, "Ключ не найден")
    return {"success": True}


@router.get("/catalog")
async def get_catalog(request: Request):
    return catalog(schema_for(request))


@admin_router.get("/catalog")
async def get_admin_catalog(request: Request, admin=Depends(get_current_admin)):
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
    return get_swagger_ui_html(
        openapi_url="/api/integration/openapi.json", title="MAX Marketing — REST API",
        swagger_js_url="/api/integration/assets/swagger-ui-bundle.js",
        swagger_css_url="/api/integration/assets/swagger-ui.css",
        swagger_favicon_url="/favicon.ico",
        swagger_ui_parameters={"docExpansion": "none", "filter": True, "validatorUrl": None},
    )


@router.get("/assets/{filename}", include_in_schema=False)
async def docs_asset(filename: str):
    if filename not in {"swagger-ui-bundle.js", "swagger-ui.css", "LICENSE"}:
        raise HTTPException(404, "Файл не найден")
    path = Path(__file__).resolve().parents[3] / "frontend-react/dist/swagger-ui" / filename
    if not path.is_file():
        raise HTTPException(404, "Сначала соберите frontend")
    return FileResponse(path)
