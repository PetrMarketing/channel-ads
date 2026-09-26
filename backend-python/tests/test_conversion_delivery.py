"""Regression tests for durable, truthful conversion delivery state."""

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services import conversion_pixels as delivery


class RecordingConnection:
    def __init__(self, rows=None, fetch_rows=None):
        self.rows = list(rows or [])
        self.fetch_rows = list(fetch_rows or [])
        self.executed = []

    @asynccontextmanager
    async def transaction(self):
        yield self

    async def fetchrow(self, query, *args):
        self.executed.append((query, args))
        return self.rows.pop(0) if self.rows else None

    async def fetch(self, query, *args):
        self.executed.append((query, args))
        return self.fetch_rows.pop(0) if self.fetch_rows else []

    async def execute(self, query, *args):
        self.executed.append((query, args))
        return "UPDATE 1"


class FakePool:
    def __init__(self, conn):
        self.conn = conn

    @asynccontextmanager
    async def acquire(self):
        yield self.conn


def install_pool(monkeypatch, conn):
    async def fake_get_pool():
        return FakePool(conn)
    monkeypatch.setattr(delivery, "get_pool", fake_get_pool)


def test_vk_network_failure_is_retry_not_success(monkeypatch):
    conn = RecordingConnection()
    install_pool(monkeypatch, conn)
    claim = {"pending_id": 7, "attempt_no": 1, "attempt_token": "tok"}
    asyncio.run(delivery._finish_vk(claim, None, "TimeoutError"))
    pending_update = next((args for query, args in conn.executed
                           if "UPDATE pending_conversions" in query), None)
    assert pending_update is not None
    assert pending_update[1] == "retry_scheduled"
    assert pending_update[4] is False
    assert all("transport_accepted" not in str(args) for _, args in conn.executed)


def test_vk_http_success_is_only_transport_acceptance(monkeypatch):
    conn = RecordingConnection()
    install_pool(monkeypatch, conn)
    claim = {"pending_id": 7, "attempt_no": 1, "attempt_token": "tok"}
    asyncio.run(delivery._finish_vk(claim, 200, None))
    pending_update = next(args for query, args in conn.executed
                          if "UPDATE pending_conversions" in query)
    assert pending_update[1] == "transport_accepted"
    assert pending_update[4] is True
    assert "accounting_confirmed_at" not in next(
        query for query, _ in conn.executed if "UPDATE pending_conversions" in query
    )


def test_yandex_timeout_retries_and_never_confirms_accounting(monkeypatch):
    conn = RecordingConnection(rows=[{
        "id": 9, "ym_attempt_count": 1, "ym_attempt_token": "attempt-a",
    }])
    install_pool(monkeypatch, conn)
    result = asyncio.run(delivery.finish_yandex_browser_delivery(
        12, "visit-token", "attempt-a", "outcome_unknown", "callback timeout",
    ))
    assert result == {"success": True, "status": "retry_scheduled", "accounting_confirmed": False}
    pending_update = next(args for query, args in conn.executed
                          if "UPDATE pending_conversions" in query)
    assert pending_update[1] == "retry_scheduled"
    assert pending_update[2] is False


def test_closed_browser_lease_is_preserved_as_unknown(monkeypatch):
    conn = RecordingConnection(fetch_rows=[[{
        "id": 9, "ym_attempt_token": "attempt-a", "ym_attempt_count": 3,
    }]])
    install_pool(monkeypatch, conn)
    asyncio.run(delivery._reconcile_expired_yandex_leases())
    pending_update = next(args for query, args in conn.executed
                          if "UPDATE pending_conversions" in query)
    assert pending_update[1] == "outcome_unknown_exhausted"
    assert any("browser closed or callback timed out" in query
               for query, _ in conn.executed)


def test_restart_preserves_unknown_vk_attempt_and_schedules_retry(monkeypatch):
    conn = RecordingConnection(fetch_rows=[[{
        "id": 11, "vk_attempt_token": "vk-attempt", "vk_attempt_count": 1,
    }]])
    install_pool(monkeypatch, conn)
    asyncio.run(delivery._reconcile_expired_vk_leases())
    pending_update = next(args for query, args in conn.executed
                          if "UPDATE pending_conversions" in query)
    assert pending_update[1] == "retry_scheduled"
    assert any("server stopped before result was persisted" in query
               for query, _ in conn.executed)


def test_repeat_confirmation_uses_one_visit_scoped_row(monkeypatch):
    async def fake_fetch_one(query, subscription_id):
        return {"subscription_id": subscription_id, "channel_id": 2, "visit_id": 3,
                "link_id": 4, "ym_client_id": "cid", "landing_url": "https://example.test",
                "user_agent": "ua", "ym_counter_id": "123", "vk_pixel_id": "456"}

    returned = {"id": 8, "vk_delivery_status": "transport_accepted"}
    conn = RecordingConnection(rows=[returned.copy(), returned.copy()])
    install_pool(monkeypatch, conn)
    monkeypatch.setattr(delivery, "fetch_one", fake_fetch_one)
    first = asyncio.run(delivery._ensure_delivery_for_subscription(10))
    second = asyncio.run(delivery._ensure_delivery_for_subscription(10))
    assert first["id"] == second["id"] == 8
    inserts = [query for query, _ in conn.executed if "INSERT INTO pending_conversions" in query]
    assert len(inserts) == 2
    assert all("ON CONFLICT (attribution_key)" in query for query in inserts)
    assert all("COALESCE(pending_conversions.subscription_id" in query for query in inserts)
    assert all("$3::bigint" in query for query in inserts)


def test_concurrency_and_restart_guards_are_present():
    source = (ROOT / "app/services/conversion_pixels.py").read_text()
    main = (ROOT / "app/main.py").read_text()
    migration = (ROOT / "migrations/096_conversion_delivery_state.sql").read_text()
    frontend = (ROOT.parent / "frontend-react/src/hooks/useTrackingPixels.js").read_text()

    assert "FOR UPDATE OF p SKIP LOCKED" in source
    assert "WHERE id=$1 AND vk_attempt_token=$7" in source
    assert "WHERE id=$1 AND ym_attempt_token=$6" in source
    assert "start_conversion_delivery_worker()" in main
    assert "_reconcile_confirmed_subscriptions()" in source
    assert "s.subscribed_at >= COALESCE" in source
    assert "096_conversion_delivery_state.sql" in source
    assert "conversion_delivery_attempts" in migration
    assert "Yandex reachGoal callback timeout" in frontend
    assert "_ymp/watch" not in frontend
    assert "mc.yandex.ru/watch" not in source
    assert "offline_conversions" not in source
    assert "OAuth" not in source
    assert '@app.get("/_ymp/' not in main


def test_vk_url_contract_is_unchanged():
    url = delivery._build_vk_url("42", "paid subscribe")
    assert url == "https://top-fwz1.mail.ru/counter?id=42&type=reachGoal&goal=paid+subscribe&js=na"
