"""Encryption-at-rest for user supplied integration credentials."""
import base64
import hashlib
import json

from cryptography.fernet import Fernet, InvalidToken

from ..config import settings


def _cipher() -> Fernet:
    # JWT_SECRET is already a private production secret. Derive a separate,
    # domain-separated key so encrypted credentials never use JWT material raw.
    material = hashlib.sha256(f"ai-office-connectors:v1:{settings.JWT_SECRET}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(material))


def encrypt_credentials(value: dict) -> str:
    raw = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()
    return _cipher().encrypt(raw).decode()


def decrypt_credentials(value: str) -> dict:
    try:
        return json.loads(_cipher().decrypt(value.encode()).decode())
    except (InvalidToken, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError("Не удалось расшифровать подключение") from exc
