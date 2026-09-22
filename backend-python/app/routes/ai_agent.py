"""Проектный ИИ Агент: бриф, источники, импорт каталогов и первый пайплайн."""
from __future__ import annotations

import asyncio
import csv
import io
import ipaddress
import json
import os
import re
import secrets
import socket
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict
from urllib.parse import urlparse

import aiohttp
from fastapi import APIRouter, Depends, HTTPException, Request

from ..config import settings
from ..database import execute, fetch_all, fetch_one, get_pool
from ..middleware.auth import get_current_user

router = APIRouter()
AGENT_PRICE = 3990
MAX_FILE_SIZE = 20 * 1024 * 1024
ALLOWED_EXTENSIONS = {".csv", ".xml", ".txt", ".md", ".json", ".pdf"}


async def _channel(tc: str, user_id: int):
    return await fetch_one(
        "SELECT id, title, tracking_code FROM channels WHERE tracking_code=$1 AND user_id=$2 AND deleted_at IS NULL",
        tc, user_id,
    )


async def _project(project_id: int, user_id: int):
    return await fetch_one("SELECT * FROM ai_agent_projects WHERE id=$1 AND user_id=$2", project_id, user_id)


def _json(value, fallback):
    if value is None:
        return fallback
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return fallback
    return value


async def _serialize_project(row):
    if not row:
        return None
    result = dict(row)
    result["brief_json"] = _json(result.get("brief_json"), {})
    result["sources"] = await fetch_all(
        """SELECT id, source_type, category, title, source_url, file_name, mime_type,
                  file_size, status, error_message, created_at
           FROM ai_agent_sources WHERE project_id=$1 ORDER BY id""", result["id"],
    )
    result["deliverables"] = await fetch_all(
        """SELECT id, deliverable_type, title, content_text, content_json, status, version, updated_at
           FROM ai_agent_deliverables WHERE project_id=$1 ORDER BY id""", result["id"],
    )
    result["activity"] = await fetch_all(
        """SELECT id, stage, status, message, created_at FROM ai_agent_activity_log
           WHERE project_id=$1 ORDER BY id DESC LIMIT 50""", result["id"],
    )
    return result


@router.get("/{tc}/current")
async def current_project(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    ch = await _channel(tc, user["id"])
    if not ch:
        raise HTTPException(status_code=404, detail="Канал не найден")
    row = await fetch_one(
        "SELECT * FROM ai_agent_projects WHERE channel_id=$1 ORDER BY created_at DESC LIMIT 1", ch["id"],
    )
    return {"success": True, "project": await _serialize_project(row), "price_tokens": AGENT_PRICE}


@router.post("/{tc}/project")
async def create_project(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    ch = await _channel(tc, user["id"])
    if not ch:
        raise HTTPException(status_code=404, detail="Канал не найден")
    existing = await fetch_one(
        """SELECT * FROM ai_agent_projects WHERE channel_id=$1
           AND status IN ('draft','queued','running','awaiting_approval') ORDER BY id DESC LIMIT 1""", ch["id"],
    )
    if existing:
        return {"success": True, "project": await _serialize_project(existing)}
    row = await fetch_one(
        """INSERT INTO ai_agent_projects(user_id, channel_id, price_tokens)
           VALUES($1,$2,$3) RETURNING *""", user["id"], ch["id"], AGENT_PRICE,
    )
    await execute(
        "INSERT INTO ai_agent_activity_log(project_id,stage,status,message) VALUES($1,'brief','done',$2)",
        row["id"], "Проект создан. Заполните бриф и добавьте источники.",
    )
    return {"success": True, "project": await _serialize_project(row)}


@router.put("/{tc}/project/{project_id}/brief")
async def save_brief(tc: str, project_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    ch = await _channel(tc, user["id"])
    project = await _project(project_id, user["id"])
    if not ch or not project or project["channel_id"] != ch["id"]:
        raise HTTPException(status_code=404, detail="Проект не найден")
    if project["status"] not in ("draft", "awaiting_approval"):
        raise HTTPException(status_code=409, detail="Бриф нельзя менять во время выполнения")
    body = await request.json()
    brief = body.get("brief")
    if not isinstance(brief, dict):
        raise HTTPException(status_code=400, detail="Некорректный бриф")
    raw = json.dumps(brief, ensure_ascii=False)
    if len(raw) > 200_000:
        raise HTTPException(status_code=400, detail="Бриф слишком большой")
    await execute("UPDATE ai_agent_projects SET brief_json=$1, updated_at=NOW() WHERE id=$2", raw, project_id)
    return {"success": True}


def _safe_filename(name: str) -> str:
    base = Path(name or "source").name
    return re.sub(r"[^A-Za-zА-Яа-я0-9._-]+", "_", base)[:120] or "source"


def _extract_file(name: str, content: bytes):
    ext = Path(name).suffix.lower()
    parsed = None
    if ext in (".txt", ".md"):
        text = content.decode("utf-8", errors="replace")
    elif ext == ".json":
        obj = json.loads(content.decode("utf-8-sig"))
        parsed = obj
        text = json.dumps(obj, ensure_ascii=False, indent=2)
    elif ext == ".csv":
        decoded = content.decode("utf-8-sig", errors="replace")
        try:
            dialect = csv.Sniffer().sniff(decoded[:5000], delimiters=",;\t|")
        except csv.Error:
            dialect = csv.excel
        rows = list(csv.DictReader(io.StringIO(decoded), dialect=dialect))[:5000]
        parsed = {"kind": "products", "count": len(rows), "columns": list(rows[0].keys()) if rows else [], "items": rows}
        text = json.dumps(rows[:500], ensure_ascii=False)
    elif ext == ".xml":
        root = ET.fromstring(content)
        items = []
        for node in root.iter():
            children = list(node)
            if children and all(not list(child) for child in children):
                item = {child.tag.split("}")[-1]: (child.text or "").strip() for child in children}
                if len(item) >= 2:
                    items.append(item)
            if len(items) >= 5000:
                break
        parsed = {"kind": "products", "count": len(items), "items": items}
        text = json.dumps(items[:500], ensure_ascii=False)
    elif ext == ".pdf":
        import fitz
        doc = fitz.open(stream=content, filetype="pdf")
        text = "\n".join(page.get_text() for page in doc[:100])
    else:
        raise ValueError("Поддерживаются CSV, XML, JSON, TXT, MD и PDF")
    return text[:500_000], parsed


@router.post("/{tc}/project/{project_id}/source-file")
async def upload_source(tc: str, project_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    ch = await _channel(tc, user["id"])
    project = await _project(project_id, user["id"])
    if not ch or not project or project["channel_id"] != ch["id"]:
        raise HTTPException(status_code=404, detail="Проект не найден")
    if project["status"] != "draft":
        raise HTTPException(status_code=409, detail="Источники можно менять только до запуска")
    form = await request.form()
    upload = form.get("file")
    category = str(form.get("category") or "general")[:40]
    if not upload or not hasattr(upload, "read"):
        raise HTTPException(status_code=400, detail="Файл не передан")
    original = _safe_filename(getattr(upload, "filename", "source"))
    ext = Path(original).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Поддерживаются CSV, XML, JSON, TXT, MD и PDF")
    content = await upload.read()
    if not content or len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Файл пустой или больше 20 МБ")
    try:
        extracted, parsed = _extract_file(original, content)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Не удалось разобрать файл: {str(exc)[:160]}")
    upload_dir = Path(settings.UPLOAD_DIR) / "ai-agent" / str(project_id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored = f"{secrets.token_hex(8)}_{original}"
    path = upload_dir / stored
    path.write_bytes(content)
    row = await fetch_one(
        """INSERT INTO ai_agent_sources(project_id,source_type,category,title,file_name,file_path,mime_type,file_size,extracted_text,parsed_data)
           VALUES($1,'file',$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id""",
        project_id, category, original, original, str(path), getattr(upload, "content_type", ""), len(content),
        extracted, json.dumps(parsed, ensure_ascii=False) if parsed is not None else None,
    )
    return {"success": True, "source_id": row["id"], "file_name": original, "size": len(content)}


async def _assert_public_url(url: str):
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Нужна полная ссылка http:// или https://")
    try:
        infos = await asyncio.to_thread(socket.getaddrinfo, parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM)
        for info in infos:
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                raise HTTPException(status_code=400, detail="Локальные адреса запрещены")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Не удалось проверить адрес сайта")


async def _read_url(url: str):
    await _assert_public_url(url)
    headers = {"User-Agent": "Mozilla/5.0 (compatible; PKMarketingAgent/1.0)"}
    timeout = aiohttp.ClientTimeout(total=20)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url, headers=headers, allow_redirects=False) as resp:
            if resp.status >= 400:
                raise ValueError(f"Сайт вернул HTTP {resp.status}")
            raw = await resp.content.read(2_000_001)
            if len(raw) > 2_000_000:
                raise ValueError("Страница больше 2 МБ")
            ctype = resp.headers.get("content-type", "")
            if "text" not in ctype and "json" not in ctype and "xml" not in ctype:
                raise ValueError("Ссылка ведёт не на текстовую страницу")
            text = raw.decode(resp.charset or "utf-8", errors="replace")
            text = re.sub(r"(?is)<script.*?</script>|<style.*?</style>", " ", text)
            title_match = re.search(r"(?is)<title[^>]*>(.*?)</title>", text)
            title = re.sub(r"<[^>]+>", " ", title_match.group(1)).strip() if title_match else urlparse(url).netloc
            clean = re.sub(r"(?s)<[^>]+>", " ", text)
            clean = re.sub(r"\s+", " ", clean).strip()
            return title[:300], clean[:300_000]


@router.post("/{tc}/project/{project_id}/source-url")
async def add_source_url(tc: str, project_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    ch = await _channel(tc, user["id"])
    project = await _project(project_id, user["id"])
    if not ch or not project or project["channel_id"] != ch["id"]:
        raise HTTPException(status_code=404, detail="Проект не найден")
    if project["status"] != "draft":
        raise HTTPException(status_code=409, detail="Источники можно менять только до запуска")
    body = await request.json()
    url = str(body.get("url") or "").strip()[:2000]
    category = str(body.get("category") or "general")[:40]
    try:
        title, extracted = await _read_url(url)
        status, error = "ready", None
    except HTTPException:
        raise
    except Exception as exc:
        # Соцсети часто закрывают серверный просмотр: ссылку всё равно сохраняем.
        title, extracted, status, error = urlparse(url).netloc, "", "link_only", str(exc)[:200]
    row = await fetch_one(
        """INSERT INTO ai_agent_sources(project_id,source_type,category,title,source_url,extracted_text,status,error_message)
           VALUES($1,'url',$2,$3,$4,$5,$6,$7) RETURNING id""",
        project_id, category, title, url, extracted, status, error,
    )
    return {"success": True, "source_id": row["id"], "status": status, "title": title, "warning": error}


@router.delete("/{tc}/project/{project_id}/source/{source_id}")
async def delete_source(tc: str, project_id: int, source_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    ch = await _channel(tc, user["id"])
    project = await _project(project_id, user["id"])
    if not ch or not project or project["channel_id"] != ch["id"] or project["status"] != "draft":
        raise HTTPException(status_code=404, detail="Источник не найден")
    await execute("DELETE FROM ai_agent_sources WHERE id=$1 AND project_id=$2", source_id, project_id)
    return {"success": True}


def _brief_ready(brief):
    required = ("niche", "business", "audience", "goal")
    return all(str(brief.get(key) or "").strip() for key in required)


@router.post("/{tc}/project/{project_id}/start")
async def start_project(tc: str, project_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    ch = await _channel(tc, user["id"])
    project = await _project(project_id, user["id"])
    if not ch or not project or project["channel_id"] != ch["id"]:
        raise HTTPException(status_code=404, detail="Проект не найден")
    if project["status"] != "draft":
        raise HTTPException(status_code=409, detail="Проект уже запущен")
    brief = _json(project.get("brief_json"), {})
    if not _brief_ready(brief):
        raise HTTPException(status_code=400, detail="Заполните нишу, бизнес, аудиторию и главную цель")
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            locked = await conn.fetchrow("SELECT ai_tokens FROM users WHERE id=$1 FOR UPDATE", user["id"])
            if not locked or (locked["ai_tokens"] or 0) < AGENT_PRICE:
                raise HTTPException(status_code=402, detail=f"Недостаточно ИИ-токенов: нужно {AGENT_PRICE}")
            await conn.execute("UPDATE users SET ai_tokens=ai_tokens-$1 WHERE id=$2", AGENT_PRICE, user["id"])
            await conn.execute(
                "INSERT INTO ai_token_usage(user_id,tokens_used,action,description) VALUES($1,$2,'ai_agent_project',$3)",
                user["id"], AGENT_PRICE, f"ИИ Агент, проект #{project_id}",
            )
            changed = await conn.execute(
                """UPDATE ai_agent_projects SET status='queued',current_stage='research',progress=5,
                   tokens_charged=$1,started_at=NOW(),updated_at=NOW() WHERE id=$2 AND status='draft'""",
                AGENT_PRICE, project_id,
            )
            if not changed.endswith("1"):
                raise HTTPException(status_code=409, detail="Проект уже запущен")
    asyncio.create_task(_run_first_pipeline(project_id))
    return {"success": True, "status": "queued"}


async def _upsert_deliverable(project_id: int, kind: str, title: str, text: str):
    await execute(
        """INSERT INTO ai_agent_deliverables(project_id,deliverable_type,title,content_text,status)
           VALUES($1,$2,$3,$4,'ready')
           ON CONFLICT(project_id,deliverable_type) DO UPDATE SET title=EXCLUDED.title,
           content_text=EXCLUDED.content_text,status='ready',version=ai_agent_deliverables.version+1,updated_at=NOW()""",
        project_id, kind, title, text,
    )


async def _run_first_pipeline(project_id: int):
    try:
        project = await fetch_one("SELECT * FROM ai_agent_projects WHERE id=$1", project_id)
        brief = _json(project.get("brief_json"), {})
        sources = await fetch_all(
            "SELECT title,source_url,category,extracted_text,parsed_data,status FROM ai_agent_sources WHERE project_id=$1 ORDER BY id",
            project_id,
        )
        await execute("UPDATE ai_agent_projects SET status='running',progress=15,updated_at=NOW() WHERE id=$1", project_id)
        await execute(
            "INSERT INTO ai_agent_activity_log(project_id,stage,status,message) VALUES($1,'research','running',$2)",
            project_id, "Анализирую бриф, сайты, соцсети и загруженные каталоги.",
        )
        context_parts = []
        for src in sources:
            content = (src.get("extracted_text") or "")[:35_000]
            context_parts.append(f"ИСТОЧНИК: {src.get('title')} {src.get('source_url') or ''}\n{content}")
        context = "\n\n".join(context_parts)[:120_000]
        from ..services.ai_openrouter import openrouter_chat
        research_prompt = f"""Ты маркетинговый аналитик. Подготовь доказательный первичный анализ бизнеса.
Не выдумывай факты или метрики. Для каждого вывода указывай, на каком приложенном источнике он основан;
если данных нет, явно пиши «нужно исследовать дополнительно». Структура: исходные данные, продукты,
аудитория, конкуренты/референсы, контент и офферы, сильные стороны, пробелы, возможности, список следующих исследований.

БРИФ:\n{json.dumps(brief, ensure_ascii=False)}\n\nИСТОЧНИКИ:\n{context or 'Источники не приложены'}"""
        research = await openrouter_chat(research_prompt, model="openai/gpt-5.4-mini")
        await _upsert_deliverable(project_id, "research", "Первичный анализ и карта источников", research)
        await execute("UPDATE ai_agent_projects SET current_stage='strategy',progress=55,updated_at=NOW() WHERE id=$1", project_id)
        strategy_prompt = f"""Ты стратег продвижения бизнеса в MAX. На основе брифа и исследования разработай
конкретную мастер-стратегию. Не повторяй общие советы. Структура: позиционирование, сегменты,
продуктовая лестница, 5-10 лид-магнитов, воронки, упаковка MAX, сайт с уместной геймификацией,
актуальные чат-боты и мини-приложения, контент-модель на год, рассылки, KPI и приоритетный план на 90 дней.
Отделяй подтверждённые данные от гипотез.

БРИФ:\n{json.dumps(brief, ensure_ascii=False)}\n\nИССЛЕДОВАНИЕ:\n{research[:80_000]}"""
        strategy = await openrouter_chat(strategy_prompt, model="openai/gpt-5.4-mini")
        await _upsert_deliverable(project_id, "strategy", "Мастер-стратегия", strategy)
        await execute(
            """UPDATE ai_agent_projects SET status='awaiting_approval',current_stage='strategy_approval',
               progress=100,updated_at=NOW() WHERE id=$1""", project_id,
        )
        await execute(
            "INSERT INTO ai_agent_activity_log(project_id,stage,status,message) VALUES($1,'strategy','done',$2)",
            project_id, "Первичный анализ и стратегия готовы к проверке.",
        )
    except Exception as exc:
        # Первый обязательный этап не дал результата — возвращаем всю стоимость.
        # Условие tokens_charged > 0 делает возврат идемпотентным.
        failed = await fetch_one("SELECT user_id,tokens_charged FROM ai_agent_projects WHERE id=$1", project_id)
        if failed and (failed.get("tokens_charged") or 0) > 0:
            refund = int(failed["tokens_charged"])
            pool = await get_pool()
            async with pool.acquire() as conn:
                async with conn.transaction():
                    locked = await conn.fetchrow("SELECT tokens_charged FROM ai_agent_projects WHERE id=$1 FOR UPDATE", project_id)
                    if locked and (locked["tokens_charged"] or 0) > 0:
                        await conn.execute("UPDATE users SET ai_tokens=ai_tokens+$1 WHERE id=$2", refund, failed["user_id"])
                        await conn.execute(
                            "INSERT INTO ai_token_usage(user_id,tokens_used,action,description) VALUES($1,$2,'ai_agent_refund',$3)",
                            failed["user_id"], -refund, f"Возврат за проект ИИ Агента #{project_id}",
                        )
                        await conn.execute(
                            """UPDATE ai_agent_projects SET status='failed',tokens_charged=0,error_message=$1,
                               updated_at=NOW() WHERE id=$2""", str(exc)[:500], project_id,
                        )
        else:
            await execute(
                "UPDATE ai_agent_projects SET status='failed',error_message=$1,updated_at=NOW() WHERE id=$2",
                str(exc)[:500], project_id,
            )
        await execute(
            "INSERT INTO ai_agent_activity_log(project_id,stage,status,message) VALUES($1,'pipeline','failed',$2)",
            project_id, f"Ошибка: {str(exc)[:300]}",
        )
