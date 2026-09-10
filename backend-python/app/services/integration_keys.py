"""Revocable integration credentials. Existing route-level tenant checks remain authoritative."""
import hashlib
import secrets

from fastapi import HTTPException, Request

from ..database import fetch_one, execute

PREFIX = "mmk_"


def new_key():
    token = PREFIX + secrets.token_urlsafe(32)
    return token, hashlib.sha256(token.encode()).hexdigest()


async def authenticate_key(token: str, request: Request):
    if len(token) != 47:
        raise HTTPException(401, "Невалидный API-ключ")
    row = await fetch_one(
        """SELECT id, user_id, modules FROM integration_api_keys
           WHERE key_hash=$1 AND revoked_at IS NULL AND expires_at > NOW()""",
        hashlib.sha256(token.encode()).hexdigest(),
    )
    if not row:
        raise HTTPException(401, "API-ключ не найден, отозван или истёк")
    path = request.url.path
    # Account linking and key issuance/revocation require a browser JWT, never another key.
    if path.startswith("/api/auth/") and path != "/api/auth/me":
        raise HTTPException(403, "Управление аккаунтом требует входа в сервис")
    module = path.split("/")[2] if path.startswith("/api/") else ""
    if not module or ("*" not in row["modules"] and module not in row["modules"]):
        raise HTTPException(403, "API-ключ не имеет доступа к этому разделу")
    user = await fetch_one("SELECT * FROM users WHERE id=$1", row["user_id"])
    if not user:
        raise HTTPException(401, "Пользователь не найден")
    request.state.integration_key_id = row["id"]
    await execute(
        """UPDATE integration_api_keys SET last_used_at=NOW() WHERE id=$1
           AND (last_used_at IS NULL OR last_used_at < NOW() - INTERVAL '1 minute')""",
        row["id"],
    )
    return user
