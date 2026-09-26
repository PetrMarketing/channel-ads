"""Regression tests for evidence-based MAX advertising attribution."""

import asyncio
from pathlib import Path
import sys
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.routes import tracking


class FakeRequest:
    def __init__(self, body):
        self._body = body
        self.client = SimpleNamespace(host="127.0.0.1")
        self.headers = {"user-agent": "test-agent", "content-type": "application/json"}

    async def json(self):
        return self._body


def test_two_parallel_visitors_bind_only_their_own_visit(monkeypatch):
    """The old channel FIFO could swap these users between two ad links."""
    visits = {
        "token-a": {"visit_id": 101, "visit_token": "token-a", "max_user_id": None,
                    "id": 11, "channel_id": 7, "platform": "max", "is_paused": 0,
                    "join_link": "https://max.ru/chats/test", "channel_title": "T"},
        "token-b": {"visit_id": 202, "visit_token": "token-b", "max_user_id": None,
                    "id": 22, "channel_id": 7, "platform": "max", "is_paused": 0,
                    "join_link": "https://max.ru/chats/test", "channel_title": "T"},
    }
    updates = []

    async def fake_fetch_one(query, token):
        assert "WHERE v.visit_token = $1" in query
        return visits[token]

    async def fake_execute(query, *args):
        updates.append((query, args))

    monkeypatch.setattr(tracking, "fetch_one", fake_fetch_one)
    monkeypatch.setattr(tracking, "execute", fake_execute)
    monkeypatch.setattr(
        tracking, "verify_max_webapp",
        lambda value: {"user_id": value.removeprefix("signed-")},
    )

    async def run():
        await asyncio.gather(
            tracking.miniapp_visit(FakeRequest({"visit_token": "token-a", "init_data": "signed-user-a"})),
            tracking.miniapp_visit(FakeRequest({"visit_token": "token-b", "init_data": "signed-user-b"})),
        )

    asyncio.run(run())
    bindings = {(args[0], args[3]) for query, args in updates if "UPDATE visits" in query}
    assert bindings == {("user-a", 101), ("user-b", 202)}


def test_unverified_miniapp_identity_never_binds_visit(monkeypatch):
    updates = []

    async def fake_fetch_one(query, token):
        return {"visit_id": 101, "visit_token": token, "max_user_id": None,
                "id": 11, "channel_id": 7, "platform": "max", "is_paused": 0,
                "join_link": "https://max.ru/chats/test", "channel_title": "T"}

    async def fake_execute(query, *args):
        updates.append((query, args))

    monkeypatch.setattr(tracking, "fetch_one", fake_fetch_one)
    monkeypatch.setattr(tracking, "execute", fake_execute)
    monkeypatch.setattr(tracking, "verify_max_webapp", lambda value: None)

    result = asyncio.run(tracking.miniapp_visit(FakeRequest({
        "visit_token": "token-a", "init_data": '{"user":{"id":"forged"}}',
    })))
    assert result["success"] is True
    assert not any("UPDATE visits" in query for query, _ in updates)


def test_polling_does_not_turn_another_channel_subscription_into_conversion(monkeypatch):
    """A channel counter increase alone must not satisfy an unrelated visit."""
    queries = []

    async def fake_fetch_one(query, *args):
        queries.append(query)
        if "FROM visits" in query:
            return {"id": 101, "channel_id": 7, "max_user_id": "user-a"}
        return None

    monkeypatch.setattr(tracking, "fetch_one", fake_fetch_one)
    result = asyncio.run(tracking.check_subscription_by_visit(visit_id=101))
    assert result["subscribed"] is False
    assert all("max_user_id = $2" not in query for query in queries)
    assert all("created_at >=" not in query for query in queries)


def test_late_client_id_is_saved_on_visit_and_pending(monkeypatch):
    updates = []

    async def fake_fetch_one(query, *args):
        return {"platform": "max", "visit_token": "token-a"}

    async def fake_execute(query, *args):
        updates.append((query, args))

    monkeypatch.setattr(tracking, "fetch_one", fake_fetch_one)
    monkeypatch.setattr(tracking, "execute", fake_execute)
    result = asyncio.run(tracking.update_visit_ym_client_id(
        101, FakeRequest({"ym_client_id": "123456789", "visit_token": "token-a"}),
    ))
    assert result["success"] is True
    assert any("UPDATE visits" in query for query, _ in updates)
    assert any("UPDATE pending_conversions" in query for query, _ in updates)
    assert all(args == ("123456789", 101) for _, args in updates)


def test_source_carries_visit_token_and_has_no_channel_fifo():
    click_page = (ROOT.parent / "frontend-react/src/pages/public/ClickLandingPage.jsx").read_text()
    webhook = (ROOT / "app/routes/max_webhook.py").read_text()
    migration = (ROOT / "migrations/095_verified_visit_attribution.sql").read_text()

    assert "`v_${visitToken}`" in click_page
    assert "identity_verified_at IS NOT NULL" in webhook
    user_added = webhook[webhook.index('# === user_added / chat_member_joined ==='):]
    assert "claim_pending_and_fire_safe" not in user_added
    assert "attribution_status" in user_added
    assert "attribution_key TEXT" in migration
    assert "ON CONFLICT (attribution_key)" in (ROOT / "app/routes/tracking.py").read_text()
    assert "UPDATE visits SET" not in migration  # no historical attribution backfill
