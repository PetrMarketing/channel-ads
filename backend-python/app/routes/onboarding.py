"""Онбординг — прогресс обучения пользователя."""
import json as json_mod
from typing import Dict, Any

from fastapi import APIRouter, Request, Depends

from ..database import fetch_one, execute
from ..middleware.auth import get_current_user

router = APIRouter()


@router.get("/state")
async def get_state(user: Dict[str, Any] = Depends(get_current_user)):
    row = await fetch_one(
        "SELECT onboarding_completed_steps, onboarding_skipped, onboarding_finished FROM users WHERE id=$1",
        user["id"],
    )
    if not row:
        return {"success": True, "completed_steps": [], "skipped": False, "finished": False}
    completed = row.get("onboarding_completed_steps") or []
    if isinstance(completed, str):
        try:
            completed = json_mod.loads(completed)
        except Exception:
            completed = []
    return {
        "success": True,
        "completed_steps": completed,
        "skipped": bool(row.get("onboarding_skipped")),
        "finished": bool(row.get("onboarding_finished")),
    }


@router.post("/complete-step")
async def complete_step(request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    body = await request.json()
    step_id = body.get("step_id")
    if not step_id:
        return {"success": False}

    row = await fetch_one("SELECT onboarding_completed_steps FROM users WHERE id=$1", user["id"])
    completed = []
    if row:
        completed = row.get("onboarding_completed_steps") or []
        if isinstance(completed, str):
            try:
                completed = json_mod.loads(completed)
            except Exception:
                completed = []
    if step_id not in completed:
        completed.append(step_id)
    await execute(
        "UPDATE users SET onboarding_completed_steps=$1 WHERE id=$2",
        json_mod.dumps(completed), user["id"],
    )
    return {"success": True, "completed_steps": completed}


@router.post("/skip")
async def skip_onboarding(user: Dict[str, Any] = Depends(get_current_user)):
    await execute("UPDATE users SET onboarding_skipped=TRUE WHERE id=$1", user["id"])
    return {"success": True}


@router.post("/finish")
async def finish_onboarding(user: Dict[str, Any] = Depends(get_current_user)):
    await execute("UPDATE users SET onboarding_finished=TRUE WHERE id=$1", user["id"])
    return {"success": True}


@router.post("/reset")
async def reset_onboarding(user: Dict[str, Any] = Depends(get_current_user)):
    await execute(
        "UPDATE users SET onboarding_completed_steps='[]', onboarding_skipped=FALSE, onboarding_finished=FALSE WHERE id=$1",
        user["id"],
    )
    return {"success": True}
