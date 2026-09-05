"""Регрессии по обращениям поддержки и изменениям MAX API 2026."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _read(relative: str) -> str:
    """Прочитать исходник относительно backend-python."""
    return (ROOT / relative).read_text(encoding="utf-8")


def test_max_api_uses_current_domain_and_header_auth():
    """Клиент не должен возвращаться на старый домен или query-авторизацию."""
    source = _read("app/services/max_api.py")
    assert 'BASE_URL = "https://platform-api2.max.ru"' in source
    assert '"Authorization": self.token' in source
    assert "access_token=" not in source


def test_removed_get_chats_is_not_called_by_routes():
    """После удаления GET /chats маршруты работают с webhook-базой каналов."""
    route_sources = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (ROOT / "app/routes").glob("*.py")
    )
    assert ".get_chats()" not in route_sources


def test_staff_is_validated_before_subscription_is_shortened():
    """Неверный PKid не может уменьшить оплаченный срок подписки."""
    source = _read("app/routes/billing.py")
    block = source[source.index("async def add_staff"):source.index("async def update_staff_role")]
    validate_pos = block.index('if not target_user:')
    shorten_pos = block.index('UPDATE channel_billing SET max_users')
    assert validate_pos < shorten_pos


def test_giveaway_draw_publishes_results_to_channel():
    """После выбора победителей должен отправляться итоговый пост в канал."""
    source = _read("app/routes/giveaways.py")
    block = source[source.index("async def draw_winner"):]
    assert "Итоги розыгрыша" in block
    assert 'max_api.send_message(str(channel["max_chat_id"]), result_text)' in block
    assert '"resultPublished"' in block


def test_max_attachments_use_image_not_photo():
    """Внешний MAX payload должен преобразовывать внутренний photo в image."""
    source = _read("app/services/max_api.py")
    assert 'type_map = {"photo": "image"' in source


def test_reconnecting_channel_restores_it_without_touching_billing():
    """Повторное bot_added возвращает канал из корзины и сохраняет billing."""
    source = _read("app/routes/max_webhook.py")
    block = source[source.index('# === bot_added ==='):source.index('# === bot_removed ===')]
    assert "deleted_at = NULL" in block
    assert "DELETE FROM channel_billing" not in block
    assert "UPDATE channel_billing" not in block


def test_max_subscription_attribution_requires_exact_user_visit():
    """Органический подписчик не должен присваиваться последнему клику канала."""
    source = _read("app/routes/max_webhook.py")
    block = source[source.index('# === user_added / chat_member_joined ==='):]
    assert "max_user_id = $2" in block
    assert "max_user_id = $2 OR username" not in block
    assert "visited_at > NOW() - INTERVAL '1 hour'" not in block
    assert "ON CONFLICT DO NOTHING" in block
    assert "reusing existing sub_id" not in block


def test_scheduled_broadcast_is_claimed_atomically():
    """Два раннера не могут одновременно отправить одну рассылку."""
    source = _read("app/services/funnel_processor.py")
    block = source[source.index("async def _send_broadcast"):source.index("async def process_scheduled_broadcasts")]
    assert "AND status = 'scheduled'" in block
    assert "RETURNING id" in block
    assert "if not claimed:" in block


def test_channel_scan_returns_actionable_diagnostics():
    source = _read("app/routes/channels.py")
    block = source[source.index("async def scan_channels"):source.index('@router.get("/trash")')]
    assert '"diagnostics"' in block
    assert '"bot_not_admin"' in block
    assert '"max_account_not_linked"' in block
