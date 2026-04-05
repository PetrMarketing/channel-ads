import random

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


@router.post("/set-source")
async def set_source(request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Set source_landing for user (from landing page)."""
    body = await request.json()
    source = body.get("source", "")
    if source and not user.get("source_landing"):
        await execute("UPDATE users SET source_landing = $1 WHERE id = $2", source, user["id"])
    return {"success": True}


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
        other_id = other_user["id"]
        other_tg_id = other_user.get("telegram_id")
        other_max_id = other_user.get("max_user_id")
        other_username = other_user.get("username")
        other_dialog = other_user.get("max_dialog_chat_id")

        # Transfer channels from other_user to current user
        await execute("UPDATE channels SET user_id = $1 WHERE user_id = $2", user["id"], other_id)
        await execute("UPDATE channels SET owner_id = $1 WHERE owner_id = $2", user["id"], other_id)
        # Transfer other references
        await execute("UPDATE subscriptions SET telegram_id = NULL WHERE telegram_id IS NOT NULL AND telegram_id IN (SELECT telegram_id FROM users WHERE id = $1)", other_id)
        await execute("UPDATE account_link_codes SET user_id = $1 WHERE user_id = $2", user["id"], other_id)

        # Clear unique fields on old user BEFORE delete (avoids FK constraint issues)
        await execute("UPDATE users SET telegram_id = NULL, max_user_id = NULL WHERE id = $1", other_id)
        # Delete merged user
        await execute("DELETE FROM users WHERE id = $1", other_id)

        # Now safely set fields on current user
        if platform == "telegram" and other_tg_id:
            await execute("UPDATE users SET telegram_id = $1, username = COALESCE(username, $2) WHERE id = $3",
                          other_tg_id, other_username, user["id"])
        elif platform == "max" and other_max_id:
            await execute("UPDATE users SET max_user_id = $1, max_dialog_chat_id = COALESCE(max_dialog_chat_id, $2) WHERE id = $3",
                          other_max_id, other_dialog, user["id"])

    updated = await fetch_one("SELECT * FROM users WHERE id = $1", user["id"])
    return {"success": True, "user": updated, "token": create_jwt(user["id"])}


@router.post("/unlink")
async def generate_unlink_code(request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Generate a 6-digit code for unlinking a platform. User sends it to the bot being unlinked."""
    body = await request.json()
    platform = body.get("platform")
    if platform not in ("telegram", "max"):
        raise HTTPException(status_code=400, detail="platform must be 'telegram' or 'max'")

    if platform == "telegram" and not user.get("max_user_id"):
        raise HTTPException(status_code=400, detail="Нельзя отвязать единственную платформу")
    if platform == "max" and not user.get("telegram_id"):
        raise HTTPException(status_code=400, detail="Нельзя отвязать единственную платформу")

    # Invalidate previous codes
    await execute(
        "UPDATE account_link_codes SET used = TRUE WHERE user_id = $1 AND target_platform = $2 AND used = FALSE",
        user["id"], f"unlink_{platform}",
    )

    code = str(random.randint(100000, 999999))
    await execute(
        "INSERT INTO account_link_codes (user_id, code, target_platform) VALUES ($1, $2, $3)",
        user["id"], code, f"unlink_{platform}",
    )

    return {"success": True, "code": code, "platform": platform}


@router.post("/generate-link-code")
async def generate_link_code(request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Generate a 6-digit code for linking another platform account."""
    body = await request.json()
    platform = body.get("platform")
    if platform not in ("telegram", "max"):
        raise HTTPException(status_code=400, detail="platform must be 'telegram' or 'max'")

    # Check user doesn't already have this platform linked
    if platform == "telegram" and user.get("telegram_id"):
        raise HTTPException(status_code=400, detail="Telegram already linked")
    if platform == "max" and user.get("max_user_id"):
        raise HTTPException(status_code=400, detail="MAX already linked")

    # Invalidate any previous unused codes for this user+platform
    await execute(
        "UPDATE account_link_codes SET used = TRUE WHERE user_id = $1 AND target_platform = $2 AND used = FALSE",
        user["id"], platform,
    )

    code = str(random.randint(100000, 999999))
    await execute(
        "INSERT INTO account_link_codes (user_id, code, target_platform) VALUES ($1, $2, $3)",
        user["id"], code, platform,
    )

    return {"success": True, "code": code}


@router.post("/verify-link-code")
async def verify_link_code(request: Request):
    """Verify a link code and return the associated user_id. For internal use by bot handlers."""
    body = await request.json()
    code = body.get("code", "").strip()
    platform = body.get("platform")
    platform_id = body.get("platform_id")

    if not code or not platform or not platform_id:
        raise HTTPException(status_code=400, detail="code, platform, platform_id required")

    row = await fetch_one(
        "SELECT * FROM account_link_codes WHERE code = $1 AND target_platform = $2 AND used = FALSE AND expires_at > NOW()",
        code, platform,
    )
    if not row:
        return {"success": False, "error": "Invalid or expired code"}

    user_id = row["user_id"]

    # Link the platform account
    if platform == "telegram":
        await execute("UPDATE users SET telegram_id = $1 WHERE id = $2", int(platform_id), user_id)
    elif platform == "max":
        await execute("UPDATE users SET max_user_id = $1 WHERE id = $2", str(platform_id), user_id)

    # Mark code as used
    await execute("UPDATE account_link_codes SET used = TRUE WHERE id = $1", row["id"])

    updated_user = await fetch_one("SELECT * FROM users WHERE id = $1", user_id)
    return {"success": True, "user": updated_user}
