import asyncio
import json
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from app.services import ai_gateway


class Reply:
    def __init__(self, status=200, body=None, error=None):
        self.status = status
        self.body = body if body is not None else {'choices': [{'message': {'content': 'OK'}}]}
        self.error = error

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def text(self):
        if self.error:
            raise self.error
        return json.dumps(self.body)


class Session:
    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self.replies.pop(0)


class GatewayTests(unittest.IsolatedAsyncioTestCase):
    async def call(self, session):
        with patch.dict('os.environ', {'API429_API_KEY': 'primary-test'}):
            async with ai_gateway.post(session, 'https://openrouter.ai/api/v1/chat/completions',
                json={'model': 'openai/gpt-5.4-nano'},
                headers={'Authorization': 'Bearer backup-test'}, proxy='http://backup-proxy') as r:
                return await r.json()

    async def test_primary_success_has_no_backup_and_correct_credentials(self):
        s = Session(Reply())
        await self.call(s)
        self.assertEqual(len(s.calls), 1)
        self.assertEqual(s.calls[0][1]['json']['model'], 'gpt-5.4-mini')
        self.assertEqual(s.calls[0][1]['headers']['Authorization'], 'Bearer primary-test')
        self.assertNotIn('proxy', s.calls[0][1])

    async def test_transient_failure_retains_backup_model_credentials_proxy(self):
        for reply in (Reply(503), Reply(429), Reply(error=asyncio.TimeoutError()), Reply(body={})): 
            s = Session(reply, Reply())
            await self.call(s)
            self.assertEqual(len(s.calls), 2)
            self.assertEqual(s.calls[1][1]['json']['model'], 'openai/gpt-5.4-nano')
            self.assertEqual(s.calls[1][1]['headers']['Authorization'], 'Bearer backup-test')
            self.assertEqual(s.calls[1][1]['proxy'], 'http://backup-proxy')

    async def test_permanent_errors_do_not_spend_on_backup(self):
        for code in (400, 401, 402, 403, 404):
            s = Session(Reply(code))
            with self.assertRaises(HTTPException):
                await self.call(s)
            self.assertEqual(len(s.calls), 1)

    async def test_consumer_error_does_not_start_backup(self):
        s = Session(Reply())
        with patch.dict('os.environ', {'API429_API_KEY': 'test'}):
            with self.assertRaises(asyncio.TimeoutError):
                async with ai_gateway.post(s, 'backup', json={}, headers={}):
                    raise asyncio.TimeoutError()
        self.assertEqual(len(s.calls), 1)

    async def test_image_and_tools_payloads_are_preserved(self):
        for fields in ({'modalities': ['image', 'text'], 'messages': [{'role': 'user', 'content': [{'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,abc'}}]}]}, {'tools': [{'type': 'function'}], 'tool_choice': 'auto'}):
            s = Session(Reply())
            with patch.dict('os.environ', {'API429_API_KEY': 'test'}):
                async with ai_gateway.post(s, 'backup', json={'model': 'google/gemini-3.1-flash-image', **fields}, headers={}):
                    pass
            for key, val in fields.items():
                self.assertEqual(s.calls[0][1]['json'][key], val)
