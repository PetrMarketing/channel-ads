from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Dict, Any

from ..middleware.auth import (
    get_current_user, verify_telegram_webapp,
    find_or_create_tg_user, find_or_create_max_user, create_jwt,
)
from ..database import fetch_one, execute

router = APIRouter()


@router.get("/me")
async def get_me(user: Dict[str, Any] = Depends(get_current_user)):
    """Return current user profile."""
    return {"success": True, "user": user}


@router.post("/telegram")
async def auth_telegram(request: Request):
    """Authenticate via Telegram WebApp initData."""
    body = await request.json()
    init_data = body.get("initData", "")
    tg_user = verify_telegram_webapp(init_data)
    if not tg_user:
        raise HTTPException(status_code=401, detail="Invalid Telegram auth data")
    result = await find_or_create_tg_user(tg_user)
    return {"success": True, "token": result["token"], "user": result["user"]}


@router.post("/max")
async def auth_max(request: Request):
    """Authenticate via MAX user ID."""
    body = await request.json()
    max_user_id = body.get("max_user_id")
    name = body.get("name", "")
    if not max_user_id:
        raise HTTPException(status_code=400, detail="max_user_id required")
    result = await find_or_create_max_user(max_user_id, name)
    return {"success": True, "token": result["token"], "user": result["user"]}


@router.post("/merge")
async def merge_accounts(request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Merge accounts across platforms (TG + MAX)."""
    from jose import jwt as jose_jwt, JWTError
    from ..config import settings as app_settings

    body = await request.json()
    merge_token = body.get("mergeToken")
    platform = body.get("platform")

    other_user = None

    # Support mergeToken flow (from LoginPage: token of the other account)
    if merge_token:
        try:
            payload = jose_jwt.decode(merge_token, app_settings.JWT_SECRET, algorithms=["HS256"])
            other_user_id = payload.get("userId")
            if other_user_id:
                other_user = await fetch_one("SELECT * FROM users WHERE id = $1", other_user_id)
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid merge token")
        if not other_user:
            raise HTTPException(status_code=404, detail="User from merge token not found")
        # Determine platform from other_user
        if other_user.get("telegram_id") and not user.get("telegram_id"):
            platform = "telegram"
        elif other_user.get("max_user_id") and not user.get("max_user_id"):
            platform = "max"
    elif platform == "telegram":
        init_data = body.get("init_data", "")
        tg_user = verify_telegram_webapp(init_data)
        if not tg_user:
            raise HTTPException(status_code=401, detail="Invalid Telegram auth")
        other_user = await fetch_one("SELECT * FROM users WHERE telegram_id = $1", tg_user["id"])
        if not other_user:
            # Just update current user
            await execute("UPDATE users SET telegram_id = $1, username = $2 WHERE id = $3",
                          tg_user["id"], tg_user.get("username"), user["id"])
            updated = await fetch_one("SELECT * FROM users WHERE id = $1", user["id"])
            return {"success": True, "user": updated}
    elif platform == "max":
        max_user_id = body.get("max_user_id")
        if not max_user_id:
            raise HTTPException(status_code=400, detail="max_user_id required")
        other_user = await fetch_one("SELECT * FROM users WHERE max_user_id = $1", max_user_id)
        if not other_user:
            await execute("UPDATE users SET max_user_id = $1 WHERE id = $2", max_user_id, user["id"])
            updated = await fetch_one("SELECT * FROM users WHERE id = $1", user["id"])
            return {"success": True, "user": updated}
    else:
        raise HTTPException(status_code=400, detail="Provide mergeToken or platform")

    if other_user and other_user["id"] != user["id"]:
        # Transfer channels from other_user to current user
        await execute("UPDATE channels SET user_id = $1 WHERE user_id = $2", user["id"], other_user["id"])
        await execute("UPDATE channels SET owner_id = $1 WHERE owner_id = $2", user["id"], other_user["id"])
        # Merge fields
        if platform == "telegram" and other_user.get("telegram_id"):
            await execute("UPDATE users SET telegram_id = $1, username = COALESCE(username, $2) WHERE id = $3",
                          other_user["telegram_id"], other_user.get("username"), user["id"])
        elif platform == "max" and other_user.get("max_user_id"):
            await execute("UPDATE users SET max_user_id = $1 WHERE id = $2",
                          other_user["max_user_id"], user["id"])
        # Delete merged user
        await execute("DELETE FROM users WHERE id = $1", other_user["id"])

    updated = await fetch_one("SELECT * FROM users WHERE id = $1", user["id"])
    return {"success": True, "user": updated, "token": create_jwt(user["id"])}
