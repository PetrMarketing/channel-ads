"""ИИ-Помощник: REST endpoints.

POST /api/ai-assistant/parse     — распознать запрос → план + смета токенов
POST /api/ai-assistant/{id}/confirm — подтвердить → выполнить шаги в фоне
GET  /api/ai-assistant/tasks     — история задач юзера
GET  /api/ai-assistant/{id}      — статус конкретной задачи
"""
import asyncio
import json
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request

from ..database import execute, execute_returning_id, fetch_all, fetch_one
from ..middleware.auth import get_current_user
from ..services import ai_assistant as svc


router = APIRouter()


@router.post("/parse")
async def parse_query(request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    body = await request.json()
    query = (body.get("query") or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Пустой запрос")
    if len(query) > 2000:
        raise HTTPException(status_code=400, detail="Запрос слишком длинный (макс 2000 символов)")

    # Списываем 1 токен за распознавание
    u = await fetch_one("SELECT ai_tokens FROM users WHERE id = $1", user["id"])
    if not u or (u["ai_tokens"] or 0) < svc.PARSE_COST:
        raise HTTPException(status_code=402, detail=f"Недостаточно ИИ-токенов (нужно {svc.PARSE_COST})")
    await execute("UPDATE users SET ai_tokens = ai_tokens - $1 WHERE id = $2", svc.PARSE_COST, user["id"])
    await execute(
        "INSERT INTO ai_token_usage (user_id, tokens_used, action, description) VALUES ($1,$2,$3,$4)",
        user["id"], svc.PARSE_COST, "ai_assistant_parse", query[:200],
    )

    try:
        plan = await svc.parse_query_with_llm(query, {"user_id": user["id"]})
    except Exception as e:
        # Возвращаем токен — расход был, результата нет
        await execute("UPDATE users SET ai_tokens = ai_tokens + $1 WHERE id = $2", svc.PARSE_COST, user["id"])
        raise HTTPException(status_code=502, detail=f"Ошибка LLM: {str(e)[:200]}")

    # Считаем смету шагов
    total_est = 0
    steps_with_cost = []
    for step in plan["steps"]:
        cost = svc.estimate_step_cost(step["tool"], step["args"])
        steps_with_cost.append({**step, "est_tokens": cost})
        total_est += cost

    task_id = await execute_returning_id(
        """INSERT INTO ai_assistant_tasks (user_id, raw_query, plan_json, confirm_summary, status, tokens_used)
           VALUES ($1, $2, $3, $4, 'parsed', $5) RETURNING id""",
        user["id"], query,
        json.dumps({"steps": steps_with_cost}, ensure_ascii=False),
        plan["confirm_summary"], svc.PARSE_COST,
    )

    return {
        "success": True,
        "task_id": task_id,
        "summary": plan["confirm_summary"],
        "steps": steps_with_cost,
        "total_estimated_tokens": total_est,
        "tokens_remaining": (u["ai_tokens"] or 0) - svc.PARSE_COST,
    }


@router.post("/{task_id}/confirm")
async def confirm_task(task_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    task = await fetch_one(
        "SELECT * FROM ai_assistant_tasks WHERE id = $1 AND user_id = $2",
        task_id, user["id"],
    )
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if task["status"] != "parsed":
        raise HTTPException(status_code=400, detail=f"Задача уже в статусе {task['status']}")

    plan = task["plan_json"]
    if isinstance(plan, str):
        plan = json.loads(plan)
    steps = plan.get("steps") or []

    # Считаем суммарную стоимость steps
    total_cost = sum(int(s.get("est_tokens") or 0) for s in steps)
    u = await fetch_one("SELECT ai_tokens FROM users WHERE id = $1", user["id"])
    if (u["ai_tokens"] or 0) < total_cost:
        raise HTTPException(status_code=402, detail=f"Недостаточно ИИ-токенов (нужно {total_cost})")

    if total_cost > 0:
        await execute("UPDATE users SET ai_tokens = ai_tokens - $1 WHERE id = $2", total_cost, user["id"])
        await execute(
            "INSERT INTO ai_token_usage (user_id, tokens_used, action, description) VALUES ($1,$2,$3,$4)",
            user["id"], total_cost, "ai_assistant_execute", f"Task #{task_id}",
        )

    await execute(
        "UPDATE ai_assistant_tasks SET status = 'executing', confirmed_at = NOW(), tokens_used = tokens_used + $1 WHERE id = $2",
        total_cost, task_id,
    )

    # Запускаем выполнение в фоне
    asyncio.create_task(_run_task(task_id, user["id"], steps))

    return {"success": True, "task_id": task_id, "status": "executing"}


async def _run_task(task_id: int, user_id: int, steps: list) -> None:
    results = []
    sections_touched = set()
    ok_steps = 0
    for step in steps:
        try:
            r = await svc.execute_step(user_id, step)
            results.append({"tool": step["tool"], **r})
            if r.get("ok"):
                ok_steps += 1
                if r.get("link"):
                    # /content → "Контент", /links → "Ссылки" и т.д.
                    parts = r["link"].strip("/").split("/")[0]
                    sections_touched.add(_section_label(parts))
        except Exception as e:
            results.append({"tool": step["tool"], "ok": False, "error": str(e)[:300]})

    status = "done" if ok_steps == len(steps) else ("failed" if ok_steps == 0 else "done")
    await execute(
        """UPDATE ai_assistant_tasks SET status = $1, steps_results = $2,
           finished_at = NOW() WHERE id = $3""",
        status, json.dumps(results, ensure_ascii=False), task_id,
    )

    # Нотификация в бот
    task = await fetch_one("SELECT raw_query FROM ai_assistant_tasks WHERE id = $1", task_id)
    summary = (task["raw_query"][:120] + "…") if task and len(task["raw_query"]) > 120 else (task["raw_query"] if task else "Задача")
    await svc.notify_user_done(user_id, summary, sorted(sections_touched))


def _section_label(path_part: str) -> str:
    return {
        "content": "Контент",
        "links": "Ссылки",
        "broadcasts": "Рассылки",
        "ai-content": "ИИ Контент",
    }.get(path_part, path_part)


@router.get("/tasks")
async def list_tasks(user: Dict[str, Any] = Depends(get_current_user), limit: int = 20):
    rows = await fetch_all(
        """SELECT id, raw_query, confirm_summary, status, tokens_used,
                  plan_json, steps_results,
                  created_at, confirmed_at, finished_at
           FROM ai_assistant_tasks WHERE user_id = $1
           ORDER BY created_at DESC LIMIT $2""",
        user["id"], min(limit, 100),
    )
    return {"success": True, "tasks": rows}


@router.get("/{task_id}")
async def get_task(task_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    task = await fetch_one(
        "SELECT * FROM ai_assistant_tasks WHERE id = $1 AND user_id = $2",
        task_id, user["id"],
    )
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    return {"success": True, "task": task}
