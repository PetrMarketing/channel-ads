import aiohttp
import json
from typing import Optional, Dict, Any, List

from ..config import settings

BASE_URL = "https://botapi.max.ru"

_max_api_instance = None


class MaxApi:
    def __init__(self, token: str):
        self.token = token
        self.base_url = BASE_URL

    def _url(self, method: str) -> str:
        sep = "&" if "?" in method else "?"
        return f"{self.base_url}/{method}{sep}access_token={self.token}"

    async def _request(self, method: str, endpoint: str, timeout_seconds: int = 60, **kwargs) -> Dict[str, Any]:
        import asyncio as _aio
        timeout = aiohttp.ClientTimeout(total=timeout_seconds)
        for attempt in range(6):  # up to 5 retries on 429
            try:
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    url = self._url(endpoint)
                    async with session.request(method, url, **kwargs) as resp:
                        data = await resp.json(content_type=None)
                        if resp.status == 429:
                            wait = 1.0 * (2 ** attempt)  # 1, 2, 4, 8, 16, 32 sec
                            await _aio.sleep(wait)
                            continue
                        if resp.status >= 400:
                            print(f"[MAX API] Error {resp.status} {endpoint}: {data}")
                            return {"success": False, "error": data.get("message", str(data))}
                        return {"success": True, "data": data}
            except Exception as e:
                print(f"[MAX API] Request failed {method} {endpoint}: {e}")
                return {"success": False, "error": str(e)}
        return {"success": False, "error": "Rate limited after retries"}

    async def get_me(self) -> Dict[str, Any]:
        return await self._request("GET", "me")

    async def get_chat(self, chat_id: str) -> Dict[str, Any]:
        return await self._request("GET", f"chats/{chat_id}")

    async def get_chats(self) -> Dict[str, Any]:
        return await self._request("GET", "chats")

    async def send_message(
        self, chat_id: str, text: str,
        attachments: Optional[List] = None,
        buttons: Optional[List] = None,
        fmt: str = "markdown",
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {"text": text, "format": fmt}
        if attachments:
            body["attachments"] = list(attachments)
        if buttons:
            # buttons must be list of rows: [[{"type":"link","text":"Open","url":"..."}]]
            # Ensure proper nesting: if first element is a dict, wrap in rows
            if buttons and isinstance(buttons[0], dict):
                buttons = [[btn] for btn in buttons]
            keyboard = {"type": "inline_keyboard", "payload": {"buttons": buttons}}
            if "attachments" not in body:
                body["attachments"] = []
            body["attachments"].append(keyboard)
        return await self._request("POST", f"messages?chat_id={chat_id}", json=body)

    async def edit_message(
        self, message_id: str, text: str,
        attachments: Optional[List] = None,
        buttons: Optional[List] = None,
        fmt: str = "markdown",
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {"text": text, "format": fmt}
        if attachments:
            body["attachments"] = list(attachments)
        if buttons:
            if buttons and isinstance(buttons[0], dict):
                buttons = [[btn] for btn in buttons]
            keyboard = {"type": "inline_keyboard", "payload": {"buttons": buttons}}
            if "attachments" not in body:
                body["attachments"] = []
            body["attachments"].append(keyboard)
        return await self._request("PUT", f"messages?message_id={message_id}", json=body)

    async def send_direct_message(
        self, user_id: str, text: str,
        attachments: Optional[List] = None,
        buttons: Optional[List] = None,
        fmt: str = "markdown",
    ) -> Dict[str, Any]:
        """Try to send message to user. First tries creating chat, then user_id API."""
        # Try creating a new chat via user_id
        result = await self._request("POST", "chats", json={"user_id": int(user_id)})
        if result.get("success"):
            new_chat_id = result.get("data", {}).get("chat_id")
            if new_chat_id:
                return await self.send_message(str(new_chat_id), text, attachments=attachments, buttons=buttons, fmt=fmt)
        # Fallback: try direct user_id param
        body: Dict[str, Any] = {"text": text, "format": fmt}
        if attachments:
            body["attachments"] = list(attachments)
        if buttons:
            if buttons and isinstance(buttons[0], dict):
                buttons = [[btn] for btn in buttons]
            keyboard = {"type": "inline_keyboard", "payload": {"buttons": buttons}}
            if "attachments" not in body:
                body["attachments"] = []
            body["attachments"].append(keyboard)
        return await self._request("POST", f"messages?user_id={user_id}", json=body)

    async def upload_file(self, file_path: str, file_type: str = "file") -> Dict[str, Any]:
        # MAX upload types: image, video, audio, file
        type_map = {"photo": "image", "video": "video", "audio": "audio", "voice": "audio"}
        upload_type = type_map.get(file_type, "file")
        # Step 1: get upload URL + token
        resp = await self._request("POST", f"uploads?type={upload_type}")
        if not resp.get("success"):
            return resp
        upload_url = resp["data"].get("url")
        upload_token = resp["data"].get("token")
        if not upload_url:
            return {"success": False, "error": "No upload URL"}
        # Step 2: upload file
        import os, mimetypes
        async with aiohttp.ClientSession() as session:
            filename = os.path.basename(file_path)
            mime, _ = mimetypes.guess_type(filename)
            if not mime:
                mime_map = {"photo": "image/jpeg", "image": "image/jpeg", "video": "video/mp4"}
                mime = mime_map.get(file_type, "application/octet-stream")
            with open(file_path, "rb") as f:
                data = aiohttp.FormData()
                data.add_field("data", f, filename=filename, content_type=mime)
                async with session.post(upload_url, data=data) as up_resp:
                    raw = await up_resp.text()
                    print(f"[MAX API] upload response status={up_resp.status} type={upload_type} body={raw[:300]}")
                    if up_resp.status >= 400:
                        return {"success": False, "error": raw[:200]}
                    # Video/audio upload returns <retval>1</retval> (OK media API format)
                    # Use the token from step 1 for attachments
                    if upload_type in ("video", "audio"):
                        if "<retval>1</retval>" in raw or raw.strip() == "1":
                            return {"success": True, "data": {"token": upload_token}, "upload_type": upload_type}
                        else:
                            return {"success": False, "error": f"Media upload failed: {raw[:200]}"}
                    # Image/file upload returns JSON
                    try:
                        import json as _json
                        result = _json.loads(raw) if raw.strip() else {}
                    except Exception:
                        return {"success": False, "error": f"Invalid response: {raw[:200]}"}
                    return {"success": True, "data": result}

    async def answer_callback(self, callback_id: str, notification: str = None) -> Dict[str, Any]:
        """Answer a callback query to dismiss the loading state."""
        body: Dict[str, Any] = {"callback_id": callback_id}
        if notification:
            body["notification"] = notification
        return await self._request("POST", "answers", json=body)

    async def remove_chat_member(self, chat_id: str, user_id: str) -> Dict[str, Any]:
        """Remove a user from a chat."""
        return await self._request("DELETE", f"chats/{chat_id}/members?user_id={user_id}")

    async def get_membership(self, chat_id: str) -> Dict[str, Any]:
        return await self._request("GET", f"chats/{chat_id}/members/me")

    async def is_user_member(self, chat_id: str, user_id: str) -> bool:
        """Check if user is a member of a chat/channel."""
        result = await self._request("GET", f"chats/{chat_id}/members?user_ids={user_id}")
        if result.get("success"):
            members = result.get("data", {}).get("members", [])
            return len(members) > 0
        return False

    async def get_invite_link(self, chat_id: str) -> Optional[str]:
        """Get invite link for a chat. Tries chat info first."""
        try:
            result = await self.get_chat(chat_id)
            if result.get("success") and result.get("data"):
                link = result["data"].get("link")
                if link and ("http" in link or "/" in link):
                    return link
        except Exception:
            pass
        return None

    async def get_subscriptions(self) -> Dict[str, Any]:
        return await self._request("GET", "subscriptions")

    async def delete_subscription(self, url: str) -> Dict[str, Any]:
        import urllib.parse
        encoded_url = urllib.parse.quote(url, safe="")
        return await self._request("DELETE", f"subscriptions?url={encoded_url}")

    async def get_updates(self, marker: Optional[int] = None, timeout: int = 30) -> Dict[str, Any]:
        params = f"timeout={timeout}"
        if marker:
            params += f"&marker={marker}"
        return await self._request("GET", f"updates?{params}", timeout_seconds=timeout + 15)


def init_max_api() -> Optional[MaxApi]:
    global _max_api_instance
    token = settings.MAX_BOT_TOKEN
    if not token:
        return None
    _max_api_instance = MaxApi(token)
    return _max_api_instance


def get_max_api() -> Optional[MaxApi]:
    return _max_api_instance
