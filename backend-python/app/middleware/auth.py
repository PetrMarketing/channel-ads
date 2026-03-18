import hashlib
import hmac
import json
from urllib.parse import parse_qs, unquote
from typing import Optional, Dict, Any

from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

from ..config import settings
from ..database import fetch_one, execute_returning_id

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Dict[str, Any]:
    """Verify JWT token and return user dict. Raises 401 if invalid."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Невалидный токен")

    user_id = payload.get("userId")
    if not user_id:
        raise HTTPException(status_code=401, detail="Невалидный токен")

    user = await fetch_one("SELECT * FROM users WHERE id = $1", user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Пользователь не найден")

    return user


async def optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[Dict[str, Any]]:
    """Try to verify JWT; return user or None (no error)."""
    if not credentials:
        return None
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None


def verify_telegram_webapp(init_data: str) -> Optional[Dict[str, Any]]:
    """Verify Telegram WebApp initData using HMAC-SHA256."""
    bot_token = settings.TELEGRAM_BOT_TOKEN
    if not bot_token:
        return None

    parsed = parse_qs(init_data)
    received_hash = parsed.get("hash", [None])[0]
    if not received_hash:
        return None

    # Build check string: sort all params except hash, join with \n
    items = []
    for key, vals in parsed.items():
        if key == "hash":
            continue
        items.append(f"{key}={vals[0]}")
    items.sort()
    data_check_string = "\n".join(items)

    # HMAC secret: HMAC_SHA256(bot_token, "WebAppData")
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        return None

    # Parse user JSON
    user_str = parsed.get("user", [None])[0]
    if not user_str:
        return None

    try:
        return json.loads(unquote(user_str))
    except (json.JSONDecodeError, TypeError):
        return None


async def find_or_create_tg_user(tg_user: Dict[str, Any]) -> Dict[str, Any]:
    """Look up or create a user from Telegram data, returning user dict and JWT."""
    tg_id = tg_user.get("id")
    username = tg_user.get("username")
    first_name = tg_user.get("first_name", "")

    user = await fetch_one("SELECT * FROM users WHERE telegram_id = $1", tg_id)
    if not user:
        uid = await execute_returning_id(
            "INSERT INTO users (telegram_id, username, first_name) VALUES ($1, $2, $3) RETURNING id",
            tg_id, username, first_name,
        )
        user = await fetch_one("SELECT * FROM users WHERE id = $1", uid)

    token = jwt.encode({"userId": user["id"]}, settings.JWT_SECRET, algorithm="HS256")
    return {"user": user, "token": token}


async def find_or_create_max_user(max_user_id: str, name: str = "", dialog_chat_id: str = "") -> Dict[str, Any]:
    """Look up or create a user from MAX data, returning user dict and JWT."""
    user = await fetch_one("SELECT * FROM users WHERE max_user_id = $1", max_user_id)
    if not user:
        uid = await execute_returning_id(
            "INSERT INTO users (max_user_id, first_name) VALUES ($1, $2) RETURNING id",
            max_user_id, name,
        )
        user = await fetch_one("SELECT * FROM users WHERE id = $1", uid)

    # Store dialog chat_id for future messaging
    if dialog_chat_id and user:
        from ..database import execute
        try:
            await execute("UPDATE users SET max_dialog_chat_id = $1 WHERE id = $2", dialog_chat_id, user["id"])
        except Exception:
            pass  # Column might not exist yet

    token = jwt.encode({"userId": user["id"]}, settings.JWT_SECRET, algorithm="HS256")
    return {"user": user, "token": token}


def create_jwt(user_id: int) -> str:
    return jwt.encode({"userId": user_id}, settings.JWT_SECRET, algorithm="HS256")
