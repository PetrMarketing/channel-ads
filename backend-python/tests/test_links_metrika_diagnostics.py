"""Regression tests for safe Metrika configuration and truthful link diagnostics."""

import asyncio
from pathlib import Path
import sys

import pytest
from fastapi import HTTPException


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.routes import links


def test_yandex_setting_validation_matches_documented_identifier_rules():
    assert links.validate_yandex_settings("12345678", "subscribe_channel")["valid"] is True
    assert links.validate_yandex_settings("00123", "subscribe_channel")["valid"] is False
    assert links.validate_yandex_settings("123", "bad/goal")["valid"] is False
    assert links.validate_yandex_settings("123", "bad+goal")["valid"] is False
    assert links.validate_yandex_settings("", "")["valid"] is False


def test_safe_check_never_writes_or_sends_goal(monkeypatch):
    writes = []

    async def owned_channel(tc, uid):
        return {"id": 9}

    async def fake_fetch_one(query, *args):
        return {"id": 12, "link_type": "landing"}

    async def forbidden_execute(*args, **kwargs):
        writes.append((args, kwargs))

    monkeypatch.setattr(links, "_get_owned_channel", owned_channel)
    monkeypatch.setattr(links, "fetch_one", fake_fetch_one)
    monkeypatch.setattr(links, "execute", forbidden_execute)

    result = asyncio.run(links.check_metrika_settings(
        "tc", 12,
        {"ym_counter_id": "12345678", "ym_goal_name": "subscribe_channel"},
        {"id": 5},
    ))

    assert result["safe"] is True
    assert result["sent_goal"] is False
    assert result["check"]["valid"] is True
    assert result["manual_confirmation_required"] is True
    assert writes == []


def test_invalid_yandex_settings_are_rejected_before_update(monkeypatch):
    writes = []

    async def owned_channel(tc, uid):
        return {"id": 9}

    async def fake_fetch_one(query, *args):
        return {"id": 12}

    async def fake_execute(*args, **kwargs):
        writes.append((args, kwargs))

    monkeypatch.setattr(links, "_get_owned_channel", owned_channel)
    monkeypatch.setattr(links, "fetch_one", fake_fetch_one)
    monkeypatch.setattr(links, "execute", fake_execute)

    with pytest.raises(HTTPException) as error:
        asyncio.run(links.update_metrika(
            "tc", 12,
            {"ym_counter_id": "not-a-counter", "ym_goal_name": "bad/goal"},
            {"id": 5},
        ))
    assert error.value.status_code == 422
    assert writes == []


def test_valid_yandex_settings_are_trimmed_and_saved(monkeypatch):
    writes = []

    async def owned_channel(tc, uid):
        return {"id": 9}

    async def fake_fetch_one(query, *args):
        return {"id": 12}

    async def fake_execute(query, *args):
        writes.append((query, args))

    monkeypatch.setattr(links, "_get_owned_channel", owned_channel)
    monkeypatch.setattr(links, "fetch_one", fake_fetch_one)
    monkeypatch.setattr(links, "execute", fake_execute)

    result = asyncio.run(links.update_metrika(
        "tc", 12,
        {"ym_counter_id": " 12345678 ", "ym_goal_name": " subscribe_channel "},
        {"id": 5},
    ))
    assert result["success"] is True
    assert result["yandex_check"]["valid"] is True
    assert writes[0][1][:2] == ("12345678", "subscribe_channel")


def test_link_list_keeps_conversion_stages_separate(monkeypatch):
    async def owned_channel(tc, uid):
        return {"id": 9}

    async def fake_fetch_all(query, *args):
        assert "confirmed_subscription_count" in query
        assert "attributed_subscription_count" in query
        assert "ym_undelivered_count" in query
        assert "ym_transport_accepted_count" in query
        assert "ym_accounting_confirmed_count" in query
        return [{
            "id": 12,
            "ym_counter_id": "12345678",
            "ym_goal_name": "subscribe_channel",
            "confirmed_subscription_count": 4,
            "attributed_subscription_count": 3,
            "ym_undelivered_count": 1,
            "ym_transport_accepted_count": 2,
            "ym_accounting_confirmed_count": 0,
        }]

    async def fake_fetch_one(query, *args):
        return {"count": 7}

    monkeypatch.setattr(links, "_get_owned_channel", owned_channel)
    monkeypatch.setattr(links, "fetch_all", fake_fetch_all)
    monkeypatch.setattr(links, "fetch_one", fake_fetch_one)

    result = asyncio.run(links.list_links("tc", {"id": 5}))
    row = result["links"][0]
    assert row["confirmed_subscription_count"] == 4
    assert row["attributed_subscription_count"] == 3
    assert row["ym_transport_accepted_count"] == 2
    assert row["ym_accounting_confirmed_count"] == 0
    assert result["conversion_summary"]["unattributed_subscriptions"] == 7


def test_frontend_never_labels_transport_as_accounted_goal():
    source = (ROOT.parent / "frontend-react/src/pages/LinksPage.jsx").read_text()
    assert "Передано браузером" in source
    assert "учтена Метрикой" not in source
    assert "Проверить настройку без отправки цели" in source
    assert "Подтверждены без рекламной привязки" in source
