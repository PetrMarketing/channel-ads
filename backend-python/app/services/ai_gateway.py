"""API429 primary, OpenRouter only on transient provider failure.

Buffered responses ensure body read timeouts are handled before returning to
callers. Credentials and request contents must never be written to logs.
"""
import asyncio
import json as jsonlib
import logging
import os
from contextlib import asynccontextmanager

import aiohttp
from fastapi import HTTPException

logger = logging.getLogger(__name__)
MODEL_MAP = {
    'openai/gpt-5.4-nano': 'gpt-5.4-mini',
    'openai/gpt-4o-mini': 'gpt-5.4-mini',
    'openai/gpt-4o': 'gpt-5.4',
    'anthropic/claude-sonnet-4': 'claude-sonnet-4-6',
    'google/gemini-3.1-flash-lite-image': 'gemini-3.1-flash-image',
}


def primary_key():
    return os.environ.get('API429_API_KEY', '').strip()


class Response:
    def __init__(self, status, raw):
        self.status, self.raw = status, raw

    async def text(self):
        return self.raw

    async def json(self):
        return jsonlib.loads(self.raw)


@asynccontextmanager
async def post(session, url, *, json, headers, proxy=None):
    key = primary_key()
    primary_result = None
    if key:
        payload = dict(json)
        model = str(payload.get('model', ''))
        payload['model'] = MODEL_MAP.get(model, model.split('/', 1)[-1])
        timeout = 180 if 'image' in payload.get('modalities', []) else 90
        try:
            async with session.post(
                'https://gateway.api429.com/v1/chat/completions',
                json=payload,
                headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'},
                timeout=aiohttp.ClientTimeout(total=timeout),
            ) as response:
                raw = await response.text()
                status = response.status
            if status == 429 or status >= 500 or status == 408:
                logger.warning('AI primary unavailable status=%s; using OpenRouter', status)
            elif status >= 400:
                # Do not mask access/balance/validation failures with paid fallback.
                logger.warning('AI primary rejected request status=%s model=%s', status, payload['model'])
                raise HTTPException(502, 'API429 отклонил запрос. Проверьте баланс, доступ к модели и настройки API.')
            else:
                try:
                    data = jsonlib.loads(raw)
                    valid = isinstance(data, dict) and isinstance(data.get('choices'), list) and bool(data['choices'])
                except ValueError:
                    valid = False
                if valid and not data.get('error'):
                    logger.info('AI provider=api429 model=%s status=%s', payload['model'], status)
                    primary_result = Response(status, raw)
                else:
                    logger.warning('AI primary invalid response; using OpenRouter')
        except (aiohttp.ClientError, asyncio.TimeoutError):
            logger.warning('AI primary network failure; using OpenRouter')
    if primary_result is not None:
        yield primary_result
        return
    # Keep original model, credentials and proxy for the backup provider.
    if not headers.get('Authorization', '').removeprefix('Bearer ').strip():
        raise HTTPException(503, 'ИИ временно недоступен; резервный провайдер не настроен')
    async with session.post(url, json=json, headers=headers, proxy=proxy) as response:
        result = Response(response.status, await response.text())
    yield result
