"""Cross-platform messenger service.

Abstracts Telegram and MAX bot API differences for sending messages.
"""
import os
import re
from typing import Optional, Dict, Any

import aiohttp

from ..config import settings


def sanitize_html_for_telegram(html: str) -> str:
    """Convert browser contentEditable HTML to Telegram-compatible HTML."""
    if not html:
        return ""
    text = html
    # Convert <span style="font-weight: 700/bold"> to <b>
    text = re.sub(r'<span[^>]*font-weight:\s*(?:700|bold)[^>]*>([\s\S]*?)</span>', r'<b>\1</b>', text, flags=re.I)
    text = re.sub(r'<span[^>]*font-style:\s*italic[^>]*>([\s\S]*?)</span>', r'<i>\1</i>', text, flags=re.I)
    # <br> with any attributes -> newline
    text = re.sub(r"<br[^>]*/?>", "\n", text, flags=re.I)
    # Block-level closing tags -> newline
    text = re.sub(r"</(?:div|p|li|tr|h[1-6]|blockquote)>", "\n", text, flags=re.I)
    # Remove opening block tags
    text = re.sub(
        r"<(?:div|p(?!re)|li|ul|ol|tr|td|th|table|thead|tbody|h[1-6]|blockquote|section|article|header|footer|nav|main|figure|figcaption|details|summary)(?:\s[^>]*)?\s*>",
        "", text, flags=re.I,
    )
    # <strong>/<b> -> <b>, <em>/<i> -> <i> (strip attributes)
    text = re.sub(r"<(?:strong|b)(?:\s[^>]*)?>", "<b>", text, flags=re.I)
    text = re.sub(r"</(?:strong|b)>", "</b>", text, flags=re.I)
    text = re.sub(r"<(?:em|i)(?:\s[^>]*)?>", "<i>", text, flags=re.I)
    text = re.sub(r"</(?:em|i)>", "</i>", text, flags=re.I)
    # <strike>/<del>/<s> -> <s>
    text = re.sub(r"<(?:strike|del|s)(?:\s[^>]*)?>", "<s>", text, flags=re.I)
    text = re.sub(r"</(?:strike|del|s)>", "</s>", text, flags=re.I)
    # <ins> -> <u>, <u> with attrs -> <u>
    text = re.sub(r"<ins[^>]*>", "<u>", text, flags=re.I)
    text = re.sub(r"</ins>", "</u>", text, flags=re.I)
    text = re.sub(r"<u(?:\s[^>]*)?>", "<u>", text, flags=re.I)
    # Strip <span> wrappers (editor artifacts)
    text = re.sub(r"</?span(?:\s[^>]*)?>", "", text, flags=re.I)
    # Clean <a>: keep only href
    text = re.sub(r'<a\s+[^>]*href="([^"]*)"[^>]*>', r'<a href="\1">', text, flags=re.I)
    # Clean <code>/<pre> attributes
    text = re.sub(r"<(code|pre)[^>]*>", r"<\1>", text, flags=re.I)
    # Strip unsupported tags
    allowed = re.compile(r"^/?(b|i|u|s|code|pre|a|tg-spoiler)(\s|>|/|$)", re.I)
    def _strip(m):
        inner = m.group(1)
        if allowed.match(inner):
            return m.group(0)
        return ""
    text = re.sub(r"</?([^>]+)>", _strip, text)
    # Decode HTML entities
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    text = text.replace("&quot;", '"').replace("&#39;", "'").replace("&nbsp;", " ")
    # Max 2 consecutive newlines
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def html_to_max_markdown(html: str) -> str:
    """Convert rich HTML (from editor) to MAX markdown using a proper parser."""
    if not html:
        return ""
    # Pre-process: normalize &nbsp; to space
    html = html.replace('&nbsp;', ' ')
    # Convert styled spans to semantic tags
    html = re.sub(r'<span[^>]*font-weight:\s*(?:700|bold)[^>]*>([\s\S]*?)</span>', r'<b>\1</b>', html, flags=re.I)
    html = re.sub(r'<span[^>]*font-style:\s*italic[^>]*>([\s\S]*?)</span>', r'<i>\1</i>', html, flags=re.I)
    # Strip remaining spans (with any attributes)
    html = re.sub(r'</?span[^>]*>', '', html, flags=re.I)
    # Move <br> outside formatting tags: <b>text<br></b> -> <b>text</b><br>
    _fmt_close = r'</(?:b|i|u|s|strong|em|strike|del|ins|a)>'
    for _ in range(5):
        html = re.sub(r'(\s*(?:&nbsp;)?\s*)<br[^>]*>(\s*)(' + _fmt_close + r')', r'\3\1<br>\2', html, flags=re.I)
    # Remove trailing spaces before closing tags and <br>
    html = re.sub(r'\s+(' + _fmt_close + r')', r'\1', html, flags=re.I)
    html = re.sub(r'\s+(<br[^>]*/?>)', r'<br>', html, flags=re.I)
    from html.parser import HTMLParser

    # MAX markdown markers for each tag type
    TAG_MAP = {
        "b": "**", "strong": "**",
        "i": "*", "em": "*",
        "s": "~~", "strike": "~~", "del": "~~",
        "u": "++", "ins": "++",
        "code": "`",
    }

    class MaxMarkdownConverter(HTMLParser):
        def __init__(self):
            super().__init__()
            self.result = []
            self.link_href = None
            self.fmt_stack = []  # active formatting tags

        def _close_formats(self):
            """Close all active formatting markers (for line breaks)."""
            markers = []
            for tag in reversed(self.fmt_stack):
                if tag in TAG_MAP:
                    markers.append(TAG_MAP[tag])
            return "".join(markers)

        def _reopen_formats(self):
            """Reopen all active formatting markers (after line break)."""
            markers = []
            for tag in self.fmt_stack:
                if tag in TAG_MAP:
                    markers.append(TAG_MAP[tag])
            return "".join(markers)

        def handle_starttag(self, tag, attrs):
            tag = tag.lower()
            attrs_dict = dict(attrs)

            if tag in ("br",):
                self.result.append("\n")
            elif tag in ("div", "p"):
                if self.result and self.result[-1] not in ("\n", ""):
                    self.result.append("\n")
            elif tag == "a":
                self.link_href = attrs_dict.get("href", "")
                self.result.append("[")
            elif tag == "pre":
                self.result.append("```\n")
            elif tag in TAG_MAP:
                self.result.append(TAG_MAP[tag])
                self.fmt_stack.append(tag)

        def handle_endtag(self, tag):
            tag = tag.lower()

            if tag in ("div", "p"):
                if self.result and self.result[-1] != "\n":
                    self.result.append("\n")
            elif tag == "a":
                href = self.link_href or ""
                self.link_href = None
                # Remove trailing newlines before closing bracket
                trailing_newlines = []
                while self.result and self.result[-1] == "\n":
                    trailing_newlines.append(self.result.pop())
                self.result.append(f"]({href})")
                self.result.extend(trailing_newlines)
            elif tag == "pre":
                self.result.append("\n```")
            elif tag in TAG_MAP:
                marker = TAG_MAP[tag]
                if marker:
                    # Move trailing whitespace outside the marker
                    # so **text ** becomes **text** (MAX requires marker next to text)
                    trailing = []
                    while self.result and self.result[-1] in ("\n", " ", "\t"):
                        trailing.append(self.result.pop())
                    self.result.append(marker)
                    self.result.extend(reversed(trailing))
                # Remove from stack (find last matching)
                norm = tag
                for i in range(len(self.fmt_stack) - 1, -1, -1):
                    t = self.fmt_stack[i]
                    if TAG_MAP.get(t) == TAG_MAP.get(norm):
                        self.fmt_stack.pop(i)
                        break

        def handle_data(self, data):
            # Split by newlines so trailing \n detection works for closing markers
            parts = data.split("\n")
            for i, part in enumerate(parts):
                if part:
                    self.result.append(part)
                if i < len(parts) - 1:
                    self.result.append("\n")

        def get_result(self):
            text = "".join(self.result)
            text = text.replace("\u00a0", " ")
            text = re.sub(r"\n{3,}", "\n\n", text)
            # Fix trailing spaces inside markers (per-line only, don't cross newlines)
            for _ in range(3):
                text = re.sub(r'\*\*([^\n*]+?)[ \t]+\*\*', r'**\1** ', text)
                text = re.sub(r'(?<!\*)\*(?!\*)([^\n*]+?)[ \t]+\*(?!\*)', r'*\1* ', text)
                text = re.sub(r'\+\+([^\n+]+?)[ \t]+\+\+', r'++\1++ ', text)
                text = re.sub(r'~~([^\n~]+?)[ \t]+~~', r'~~\1~~ ', text)
            # Remove empty markers
            for empty in ("****", "~~~~", "++++", "``", "**\n**", "++\n++", "*\n*"):
                text = text.replace(empty, "\n" if "\n" in empty else "")
            text = re.sub(r"\n{3,}", "\n\n", text)
            return text.strip()

    converter = MaxMarkdownConverter()
    converter.feed(html)
    return converter.get_result()


def file_url(file_path: str) -> Optional[str]:
    if not file_path:
        return None
    upload_dir = settings.UPLOAD_DIR
    rel = os.path.relpath(file_path, upload_dir)
    return f"{settings.APP_URL}/uploads/{rel.replace(os.sep, '/')}"


async def send_telegram_message(chat_id: int, text: str, **kwargs):
    """Send a message via Telegram Bot API."""
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return None
    url = f"{settings.TELEGRAM_API_URL}/bot{token}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML", **kwargs}
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload) as resp:
            return await resp.json()


async def send_telegram_photo(chat_id: int, photo, caption: str = "", **kwargs):
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return None
    url = f"{settings.TELEGRAM_API_URL}/bot{token}/sendPhoto"
    if isinstance(photo, str) and not os.path.exists(photo):
        # file_id
        payload = {"chat_id": chat_id, "photo": photo, "caption": caption, "parse_mode": "HTML", **kwargs}
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                return await resp.json()
    else:
        data = aiohttp.FormData()
        data.add_field("chat_id", str(chat_id))
        data.add_field("caption", caption)
        data.add_field("parse_mode", "HTML")
        if kwargs.get("reply_markup"):
            import json as _j
            data.add_field("reply_markup", _j.dumps(kwargs["reply_markup"]))
        with open(photo, "rb") as f:
            data.add_field("photo", f, filename=os.path.basename(photo))
            async with aiohttp.ClientSession() as session:
                async with session.post(url, data=data) as resp:
                    return await resp.json()


async def send_telegram_document(chat_id: int, document, caption: str = "", **kwargs):
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return None
    url = f"{settings.TELEGRAM_API_URL}/bot{token}/sendDocument"
    if isinstance(document, str) and not os.path.exists(document):
        payload = {"chat_id": chat_id, "document": document, "caption": caption, "parse_mode": "HTML", **kwargs}
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                return await resp.json()
    else:
        data = aiohttp.FormData()
        data.add_field("chat_id", str(chat_id))
        data.add_field("caption", caption)
        data.add_field("parse_mode", "HTML")
        if kwargs.get("reply_markup"):
            import json as _j
            data.add_field("reply_markup", _j.dumps(kwargs["reply_markup"]))
        with open(document, "rb") as f:
            data.add_field("document", f, filename=os.path.basename(document))
            async with aiohttp.ClientSession() as session:
                async with session.post(url, data=data) as resp:
                    return await resp.json()


async def send_telegram_video(chat_id: int, video, caption: str = "", **kwargs):
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return None
    url = f"{settings.TELEGRAM_API_URL}/bot{token}/sendVideo"
    if isinstance(video, str) and not os.path.exists(video):
        payload = {"chat_id": chat_id, "video": video, "caption": caption, "parse_mode": "HTML", **kwargs}
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                return await resp.json()
    else:
        data = aiohttp.FormData()
        data.add_field("chat_id", str(chat_id))
        data.add_field("caption", caption)
        data.add_field("parse_mode", "HTML")
        if kwargs.get("reply_markup"):
            import json as _j
            data.add_field("reply_markup", _j.dumps(kwargs["reply_markup"]))
        with open(video, "rb") as f:
            data.add_field("video", f, filename=os.path.basename(video))
            async with aiohttp.ClientSession() as session:
                async with session.post(url, data=data) as resp:
                    return await resp.json()


async def send_telegram_voice(chat_id: int, voice, caption: str = "", **kwargs):
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return None
    url = f"{settings.TELEGRAM_API_URL}/bot{token}/sendVoice"
    if isinstance(voice, str) and not os.path.exists(voice):
        payload = {"chat_id": chat_id, "voice": voice, "caption": caption, "parse_mode": "HTML", **kwargs}
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                return await resp.json()
    else:
        data = aiohttp.FormData()
        data.add_field("chat_id", str(chat_id))
        data.add_field("caption", caption)
        data.add_field("parse_mode", "HTML")
        if kwargs.get("reply_markup"):
            import json as _j
            data.add_field("reply_markup", _j.dumps(kwargs["reply_markup"]))
        with open(voice, "rb") as f:
            data.add_field("voice", f, filename=os.path.basename(voice))
            async with aiohttp.ClientSession() as session:
                async with session.post(url, data=data) as resp:
                    return await resp.json()


async def send_telegram_video_note(chat_id: int, video_note, **kwargs):
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return None
    url = f"{settings.TELEGRAM_API_URL}/bot{token}/sendVideoNote"
    if isinstance(video_note, str) and not os.path.exists(video_note):
        payload = {"chat_id": chat_id, "video_note": video_note, **kwargs}
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                return await resp.json()
    else:
        data = aiohttp.FormData()
        data.add_field("chat_id", str(chat_id))
        with open(video_note, "rb") as f:
            data.add_field("video_note", f, filename=os.path.basename(video_note))
            async with aiohttp.ClientSession() as session:
                async with session.post(url, data=data) as resp:
                    return await resp.json()


def _extract_max_file_token(data: dict) -> str | None:
    """Extract file token from MAX API upload response (handles nested formats).

    MAX returns different shapes depending on upload type:
      - file/video: {"token": "..."} (top-level)
      - image: {"photos": {"<size>": {"token": "...", "url": "..."}}} (dict of sizes)
      - sometimes: {"photos": [{"token": "..."}]} (list)
    """
    if not data:
        return None
    token = data.get("token")
    if token:
        return token
    for key in ("photos", "images", "videos", "files"):
        items = data.get(key)
        if not items:
            continue
        if isinstance(items, list) and len(items) > 0:
            token = items[0].get("token")
            if token:
                return token
        elif isinstance(items, dict):
            # Direct {"photos": {"token": "..."}}
            token = items.get("token")
            if token:
                return token
            # Nested by size: {"photos": {"default": {"token": "..."}, "small": {"token": "..."}}}
            for val in items.values():
                if isinstance(val, dict):
                    token = val.get("token")
                    if token:
                        return token
    return None


def _resolve_send_type(file_type: str, attach_type: str = None) -> str:
    """Determine the send method type. attach_type overrides file_type if set."""
    if attach_type and attach_type in ("photo", "video", "document", "voice", "video_note"):
        return attach_type
    return file_type or "document"


def build_reply_markup(inline_buttons):
    """Parse inline_buttons JSON into Telegram reply_markup."""
    if not inline_buttons:
        return None
    import json as _json
    try:
        buttons = _json.loads(inline_buttons) if isinstance(inline_buttons, str) else inline_buttons
        if not isinstance(buttons, list) or len(buttons) == 0:
            return None
        rows = []
        for btn in buttons:
            if btn.get("url"):
                rows.append([{"text": btn["text"], "url": btn["url"]}])
        return {"inline_keyboard": rows} if rows else None
    except Exception:
        return None


def build_max_inline_buttons(inline_buttons):
    """Parse inline_buttons JSON into MAX API format: [[btn1], [btn2]] (list of rows)."""
    if not inline_buttons:
        return None
    import json as _json
    try:
        buttons = _json.loads(inline_buttons) if isinstance(inline_buttons, str) else inline_buttons
        if not isinstance(buttons, list) or len(buttons) == 0:
            return None
        # MAX API expects buttons as list of rows: [[{btn}], [{btn}]]
        result = []
        for btn in buttons:
            if btn.get("type") == "callback" and btn.get("payload"):
                # Callback button — bot receives message_callback event
                result.append([{"type": "callback", "text": btn["text"], "payload": btn["payload"]}])
            elif btn.get("url"):
                result.append([{"type": "link", "text": btn["text"], "url": btn["url"]}])
        return result if result else None
    except Exception:
        return None


async def send_to_user(
    user_id, platform: str, text: str,
    file_path: str = None, file_type: str = None,
    telegram_file_id: str = None, inline_buttons=None,
    attach_type: str = None, max_file_token: str = None,
):
    """Send a DM to a user on the correct platform."""
    text = sanitize_html_for_telegram(text)
    send_type = _resolve_send_type(file_type, attach_type)

    # Restore file from DB if missing on disk (Render ephemeral FS)
    if file_path and not os.path.exists(file_path):
        from .file_storage import ensure_file as _ensure
        from ..database import fetch_one as _fetch_file
        # Try to restore from funnel_steps or lead_magnets file_data
        file_path = _ensure(file_path, None)
        if not file_path:
            file_path = None

    if platform == "max":
        from .max_api import get_max_api
        max_api = get_max_api()
        if not max_api:
            raise RuntimeError("MAX bot not configured")
        max_text = html_to_max_markdown(text)
        attachments = None
        _max_type_map = {"photo": "image", "video": "video", "audio": "audio", "voice": "audio"}
        max_attach_type = _max_type_map.get(send_type, "file")
        # Use cached max_file_token if available
        if max_file_token:
            attachments = [{"type": max_attach_type, "payload": {"token": max_file_token}}]
        elif file_path:
            upload_result = await max_api.upload_file(file_path, file_type or "file")
            if upload_result.get("success"):
                file_token = _extract_max_file_token(upload_result.get("data", {}))
                if file_token:
                    attachments = [{"type": max_attach_type, "payload": {"token": file_token}}]
                else:
                    print(f"[Messenger] WARNING: MAX upload succeeded but token extraction failed. data={upload_result.get('data')}")
            else:
                print(f"[Messenger] WARNING: MAX upload failed: {upload_result.get('error')}")
        max_buttons = build_max_inline_buttons(inline_buttons)
        # Try using stored dialog chat_id first (more reliable than user_id)
        from ..database import fetch_one as _fetch
        user_row = await _fetch("SELECT max_dialog_chat_id FROM users WHERE max_user_id = $1", str(user_id))
        dialog_chat_id = user_row.get("max_dialog_chat_id") if user_row else None
        if dialog_chat_id:
            return await max_api.send_message(dialog_chat_id, max_text, attachments, max_buttons)
        return await max_api.send_direct_message(str(user_id), max_text, attachments, max_buttons)
    else:
        reply_markup = build_reply_markup(inline_buttons)
        kwargs = {}
        if reply_markup:
            kwargs["reply_markup"] = reply_markup
        if file_path or telegram_file_id:
            source = telegram_file_id or file_path
            if send_type == "photo":
                return await send_telegram_photo(user_id, source, caption=text, **kwargs)
            elif send_type == "video":
                return await send_telegram_video(user_id, source, caption=text, **kwargs)
            elif send_type == "voice":
                return await send_telegram_voice(user_id, source, caption=text, **kwargs)
            elif send_type == "video_note":
                return await send_telegram_video_note(user_id, source, **kwargs)
            else:
                return await send_telegram_document(user_id, source, caption=text, **kwargs)
        else:
            return await send_telegram_message(user_id, text, **kwargs)


async def send_to_channel(channel: Dict[str, Any], text: str, **kwargs):
    """Send a message to a channel on the correct platform."""
    text = sanitize_html_for_telegram(text)
    file_path = kwargs.get("file_path")
    file_type = kwargs.get("file_type")
    telegram_file_id = kwargs.get("telegram_file_id")
    inline_buttons = kwargs.get("inline_buttons")
    attach_type_override = kwargs.get("attach_type")
    max_file_token = kwargs.get("max_file_token")
    send_type = _resolve_send_type(file_type, attach_type_override)

    # Restore file from DB if missing on disk (Render ephemeral FS)
    if file_path and not os.path.exists(file_path):
        from .file_storage import ensure_file as _ensure_ch
        file_path = _ensure_ch(file_path, None)
        if not file_path:
            file_path = None

    if channel.get("platform") == "max":
        from .max_api import get_max_api
        max_api = get_max_api()
        if not max_api:
            raise RuntimeError("MAX bot not configured")
        chat_id = channel.get("max_chat_id") or channel.get("channel_id")
        max_text = html_to_max_markdown(text)
        attachments = None
        _max_type_map = {"photo": "image", "video": "video", "audio": "audio", "voice": "audio"}
        max_attach_type = _max_type_map.get(send_type, "file")
        # Use cached max_file_token if available
        if max_file_token:
            attachments = [{"type": max_attach_type, "payload": {"token": max_file_token}}]
        elif file_path:
            upload_result = await max_api.upload_file(file_path, file_type or "file")
            if upload_result.get("success"):
                file_token = _extract_max_file_token(upload_result.get("data", {}))
                if file_token:
                    attachments = [{"type": max_attach_type, "payload": {"token": file_token}}]
                else:
                    print(f"[Messenger] WARNING: MAX channel upload succeeded but token extraction failed. data={upload_result.get('data')}")
            else:
                print(f"[Messenger] WARNING: MAX channel upload failed: {upload_result.get('error')}")
        max_buttons = build_max_inline_buttons(inline_buttons)
        result = await max_api.send_message(str(chat_id), max_text, attachments, max_buttons)
        if not result.get("success"):
            # Retry without attachments if upload failed
            if attachments:
                print(f"[Messenger] MAX send with attachment failed, retrying without: {result.get('error')}")
                result = await max_api.send_message(str(chat_id), max_text, None, max_buttons)
            if not result.get("success"):
                raise RuntimeError(result.get("error", "MAX API error"))
        data = result.get("data", {})
        mid = (data.get("body", {}).get("mid")
               or data.get("message", {}).get("body", {}).get("mid")
               or data.get("mid"))
        return {"message_id": mid}
    else:
        chat_id = channel.get("channel_id")
        reply_markup = build_reply_markup(inline_buttons)
        kw: Dict[str, Any] = {}
        if reply_markup:
            kw["reply_markup"] = reply_markup
        source = telegram_file_id or file_path
        # If source is a local path that no longer exists, skip file send
        if source and not telegram_file_id and not os.path.exists(source):
            source = None
        if source:
            if send_type == "photo":
                return await send_telegram_photo(chat_id, source, caption=text, **kw)
            elif send_type == "video":
                return await send_telegram_video(chat_id, source, caption=text, **kw)
            elif send_type == "voice":
                return await send_telegram_voice(chat_id, source, caption=text, **kw)
            elif send_type == "video_note":
                return await send_telegram_video_note(chat_id, source, **kw)
            else:
                return await send_telegram_document(chat_id, source, caption=text, **kw)
        else:
            return await send_telegram_message(chat_id, text, **kw)


async def notify_owner(channel_id: int, text: str):
    """Notify channel owner about an event."""
    from ..database import fetch_one
    owner = await fetch_one(
        """SELECT u.telegram_id, u.max_user_id, u.max_dialog_chat_id, c.platform
           FROM users u JOIN channels c ON c.user_id = u.id WHERE c.id = $1""",
        channel_id,
    )
    if not owner:
        return
    # Prefer Telegram if user has telegram_id; fall back to MAX
    sent = False
    if owner.get("telegram_id"):
        try:
            await send_telegram_message(owner["telegram_id"], text)
            sent = True
        except Exception:
            pass
    if not sent and owner.get("max_user_id"):
        from .max_api import get_max_api
        max_api = get_max_api()
        if max_api:
            try:
                dialog_chat_id = owner.get("max_dialog_chat_id")
                if dialog_chat_id:
                    await max_api.send_message(dialog_chat_id, text)
                else:
                    await max_api.send_direct_message(owner["max_user_id"], text)
            except Exception:
                pass
