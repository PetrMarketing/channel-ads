import pytest
from fastapi import HTTPException

from app.routes.ai_office import AGENT_TASKS, CONNECTIONS, PLANS, TASK_COSTS, _known_domain
from app.services.credential_cipher import decrypt_credentials, encrypt_credentials


def test_plan_limits_and_agent_unlocks_are_monotonic():
    plans = [PLANS[code] for code in ("start", "business", "office")]
    assert [p["tokens"] for p in plans] == [300, 1000, 2000]
    assert [p["daily"] for p in plans] == [40, 120, 250]
    assert [len(p["agents"]) for p in plans] == [1, 3, 4]
    assert all(p["weekly"] < p["tokens"] for p in plans)


def test_every_available_task_has_a_positive_cost():
    for tasks in AGENT_TASKS.values():
        for task in tasks:
            assert TASK_COSTS.get(task, 1) > 0


def test_credentials_are_encrypted_and_round_trip():
    secret = {"access_token": "very-secret-token", "client_login": "client"}
    encrypted = encrypt_credentials(secret)
    assert "very-secret-token" not in encrypted
    assert decrypt_credentials(encrypted) == secret


def test_connector_fields_and_ssrf_domain_guard():
    assert set(CONNECTIONS) == {"vk", "yandex_direct", "amocrm", "bitrix24", "max_bot"}
    assert _known_domain("https://team.amocrm.ru", ("amocrm.ru",)) == "team.amocrm.ru"
    with pytest.raises(HTTPException):
        _known_domain("http://127.0.0.1/admin", ("amocrm.ru",))
    with pytest.raises(HTTPException):
        _known_domain("https://amocrm.ru.evil.example", ("amocrm.ru",))
