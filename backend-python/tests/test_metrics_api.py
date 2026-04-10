"""
Интеграционные тесты для REST API метрик.
Проверяет все эндпоинты /api/metrics/* с разными параметрами фильтрации.
Запускать: pytest tests/test_metrics_api.py -v
"""

import os
import requests
import pytest

# Базовый URL и API-ключ из переменных окружения или дефолты
BASE_URL = os.getenv("METRICS_TEST_URL", "http://127.0.0.1:8010/api/metrics")
API_KEY = os.getenv("METRICS_API_KEY", "M7dM8RZQE9-Oc_UT3UZc2Ta04hrKMhA_MDNsEqKylZk")
HEADERS = {"X-API-Key": API_KEY}

# Отключаем прокси для локальных запросов
PROXIES = {"http": None, "https": None}


# ---------------------------------------------------------------------------
# Хелперы
# ---------------------------------------------------------------------------

def get(endpoint: str, params: dict = None) -> dict:
    """Выполняет GET-запрос к эндпоинту метрик и возвращает JSON."""
    r = requests.get(f"{BASE_URL}{endpoint}", headers=HEADERS, params=params, proxies=PROXIES)
    assert r.status_code == 200, f"{endpoint} вернул {r.status_code}: {r.text}"
    return r.json()


def get_status(endpoint: str, params: dict = None, headers: dict = None) -> int:
    """Возвращает HTTP-статус запроса."""
    r = requests.get(
        f"{BASE_URL}{endpoint}",
        headers=headers or HEADERS,
        params=params,
        proxies=PROXIES,
    )
    return r.status_code


# ===========================================================================
# Тесты авторизации
# ===========================================================================

class TestAuth:
    """Проверка авторизации по API-ключу."""

    def test_no_key_returns_error(self):
        """Запрос без ключа — 422 (missing header)."""
        # Передаём фиктивный header, чтобы гарантировать отсутствие X-API-Key
        r = requests.get(
            f"{BASE_URL}/overview",
            headers={"Accept": "application/json"},
            proxies=PROXIES,
        )
        assert r.status_code == 422, f"Ожидали 422, получили {r.status_code}"

    def test_wrong_key_returns_401(self):
        """Неверный ключ — 401."""
        assert get_status("/overview", headers={"X-API-Key": "wrong"}) == 401

    def test_valid_key_returns_200(self):
        """Правильный ключ — 200."""
        assert get_status("/overview") == 200


# ===========================================================================
# Тесты /overview
# ===========================================================================

class TestOverview:
    """Общая сводка метрик."""

    def test_basic(self):
        """Базовый запрос — все ключевые поля присутствуют."""
        data = get("/overview")
        required = [
            "users", "channels", "active_channels", "subscriptions",
            "leads", "active_billings", "orders", "clients",
            "total_revenue", "total_orders_revenue",
        ]
        for key in required:
            assert key in data, f"Отсутствует поле {key}"

    def test_with_channel_filter(self):
        """Фильтр по channel_id уменьшает счётчики."""
        all_data = get("/overview")
        filtered = get("/overview", {"channel_id": 25})
        # С фильтром каналов должно быть <= 1
        assert filtered["channels"] <= all_data["channels"]

    def test_with_platform_filter(self):
        """Фильтр по платформе."""
        data = get("/overview", {"platform": "max"})
        assert data["channels"] >= 0

    def test_nonexistent_channel(self):
        """Несуществующий канал — нули."""
        data = get("/overview", {"channel_id": 999999})
        assert data["channels"] == 0
        assert data["subscriptions"] == 0


# ===========================================================================
# Тесты /users
# ===========================================================================

class TestUsers:
    """Метрики пользователей."""

    def test_default_30_days(self):
        """30 дней по умолчанию."""
        data = get("/users")
        assert "total" in data
        assert "new" in data
        assert "period" in data
        assert "by_day" in data
        assert "by_source" in data
        assert "recent_users" in data

    def test_different_periods(self):
        """Разные периоды: 7, 30, 90, 365 дней."""
        for days in [7, 30, 90, 365]:
            data = get("/users", {"days": days})
            assert data["new"] >= 0
            # Чем больше период, тем больше (или равно) пользователей
            assert data["new"] <= data["total"]

    def test_date_range_filter(self):
        """Фильтр по конкретному диапазону дат."""
        data = get("/users", {"date_from": "2026-04-01", "date_to": "2026-04-10"})
        assert "period" in data
        assert data["period"]["from"] == "2026-04-01T00:00:00"
        assert data["period"]["to"] == "2026-04-10T23:59:59"
        assert data["new"] >= 0

    def test_recent_users_have_dates(self):
        """Каждый юзер в списке содержит created_at."""
        data = get("/users", {"days": 30})
        for user in data["recent_users"]:
            assert "created_at" in user, "У пользователя отсутствует created_at"
            assert user["created_at"] is not None

    def test_narrow_date_range(self):
        """Узкий диапазон — один день."""
        data = get("/users", {"date_from": "2026-04-01", "date_to": "2026-04-01"})
        assert data["new"] >= 0
        # by_day должен содержать максимум 1 запись
        assert len(data["by_day"]) <= 1


# ===========================================================================
# Тесты /channels
# ===========================================================================

class TestChannels:
    """Метрики каналов."""

    def test_basic(self):
        """Все ключевые поля."""
        data = get("/channels")
        assert "total" in data
        assert "by_plan" in data
        assert "by_platform" in data
        assert "recent_channels" in data

    def test_platform_filter(self):
        """Фильтр по платформе max."""
        data = get("/channels", {"platform": "max"})
        assert data["new"] >= 0

    def test_recent_channels_have_dates(self):
        """Каналы содержат все даты."""
        data = get("/channels", {"days": 60})
        for ch in data["recent_channels"]:
            assert "created_at" in ch
            assert "billing_started_at" in ch
            assert "billing_expires_at" in ch


# ===========================================================================
# Тесты /revenue
# ===========================================================================

class TestRevenue:
    """Метрики выручки."""

    def test_basic_structure(self):
        """Структура ответа: billing, orders, combined_total."""
        data = get("/revenue")
        assert "billing" in data
        assert "orders" in data
        assert "combined_total" in data
        assert "avg_check" in data["billing"]
        assert "payments" in data["billing"]

    def test_with_channel_filter(self):
        """Фильтр по каналу."""
        data = get("/revenue", {"channel_id": 25})
        assert data["billing"]["total"] >= 0

    def test_payments_have_dates(self):
        """Платежи содержат created_at."""
        data = get("/revenue", {"days": 60})
        for p in data["billing"]["payments"]:
            assert "created_at" in p

    def test_different_periods(self):
        """Разные периоды."""
        r7 = get("/revenue", {"days": 7})
        r365 = get("/revenue", {"days": 365})
        assert r365["billing"]["total"] >= r7["billing"]["total"]


# ===========================================================================
# Тесты /engagement
# ===========================================================================

class TestEngagement:
    """Визиты, клики, лиды, подписки."""

    def test_basic(self):
        """Все метрики присутствуют."""
        data = get("/engagement")
        for key in ["visits", "clicks", "new_leads", "new_subscriptions",
                     "leads_by_day", "subscriptions_by_day", "top_links"]:
            assert key in data, f"Отсутствует {key}"

    def test_channel_filter(self):
        """Фильтр по конкретному каналу."""
        data = get("/engagement", {"channel_id": 25, "days": 60})
        assert data["visits"] >= 0
        assert data["new_leads"] >= 0

    def test_top_links_have_dates(self):
        """Топ-ссылки содержат created_at."""
        data = get("/engagement", {"days": 30})
        for link in data["top_links"]:
            assert "created_at" in link

    def test_platform_filter(self):
        """Фильтр по платформе."""
        data = get("/engagement", {"platform": "telegram"})
        assert data["new_subscriptions"] >= 0


# ===========================================================================
# Тесты /billing
# ===========================================================================

class TestBilling:
    """Биллинг, подписки, MRR."""

    def test_basic(self):
        """Все поля присутствуют."""
        data = get("/billing")
        for key in ["active_subscriptions", "expiring_7d", "expired_not_renewed",
                     "estimated_mrr", "by_plan", "active_subscriptions_list",
                     "recent_payments"]:
            assert key in data, f"Отсутствует {key}"

    def test_subscriptions_have_dates(self):
        """Подписки содержат starts_at, expires_at, created_at."""
        data = get("/billing")
        for sub in data["active_subscriptions_list"]:
            assert "started_at" in sub
            assert "expires_at" in sub
            assert "created_at" in sub

    def test_payments_have_dates(self):
        """Платежи содержат created_at."""
        data = get("/billing")
        for p in data["recent_payments"]:
            assert "created_at" in p

    def test_channel_filter(self):
        """Фильтр по каналу."""
        data = get("/billing", {"channel_id": 25})
        assert data["active_subscriptions"] >= 0


# ===========================================================================
# Тесты /lead-magnets
# ===========================================================================

class TestLeadMagnets:
    """Метрики лид-магнитов."""

    def test_basic(self):
        """Структура ответа."""
        data = get("/lead-magnets")
        assert "top_lead_magnets" in data
        assert "claims_by_day" in data
        assert "recent_claims" in data

    def test_lead_magnets_have_dates(self):
        """Лид-магниты содержат created_at."""
        data = get("/lead-magnets", {"days": 60})
        for lm in data["top_lead_magnets"]:
            assert "created_at" in lm

    def test_claims_have_dates(self):
        """Клеймы содержат claimed_at."""
        data = get("/lead-magnets", {"days": 60})
        for c in data["recent_claims"]:
            assert "claimed_at" in c

    def test_channel_filter(self):
        """Фильтр по каналу."""
        data = get("/lead-magnets", {"channel_id": 25, "days": 60})
        assert isinstance(data["top_lead_magnets"], list)


# ===========================================================================
# Тесты /giveaways
# ===========================================================================

class TestGiveaways:
    """Метрики розыгрышей."""

    def test_basic(self):
        """Структура ответа."""
        data = get("/giveaways", {"days": 90})
        assert "giveaways" in data
        assert "by_status" in data

    def test_giveaways_have_dates(self):
        """Розыгрыши содержат все даты."""
        data = get("/giveaways", {"days": 90})
        for g in data["giveaways"]:
            for date_field in ["created_at", "published_at", "drawn_at", "ends_at"]:
                assert date_field in g, f"Отсутствует {date_field}"


# ===========================================================================
# Тесты /broadcasts
# ===========================================================================

class TestBroadcasts:
    """Метрики рассылок."""

    def test_basic(self):
        """Структура и ключевые поля."""
        data = get("/broadcasts", {"days": 60})
        assert "total_broadcasts" in data
        assert "delivery_rate" in data
        assert "broadcasts" in data

    def test_broadcasts_have_dates(self):
        """Рассылки содержат все даты."""
        data = get("/broadcasts", {"days": 60})
        for b in data["broadcasts"]:
            for f in ["created_at", "scheduled_at", "started_at", "completed_at"]:
                assert f in b


# ===========================================================================
# Тесты /funnels
# ===========================================================================

class TestFunnels:
    """Метрики воронок."""

    def test_basic(self):
        """Структура ответа."""
        data = get("/funnels", {"days": 60})
        assert "steps" in data
        assert "progress_by_status" in data

    def test_steps_have_dates(self):
        """Шаги воронок содержат created_at."""
        data = get("/funnels", {"days": 60})
        for s in data["steps"]:
            assert "created_at" in s


# ===========================================================================
# Тесты /paid-chats
# ===========================================================================

class TestPaidChats:
    """Метрики платных чатов."""

    def test_basic(self):
        """Структура ответа."""
        data = get("/paid-chats")
        assert "active_members" in data
        assert "revenue" in data
        assert "by_plan" in data
        assert "recent_payments" in data

    def test_payments_have_dates(self):
        """Платежи содержат created_at и paid_at."""
        data = get("/paid-chats", {"days": 60})
        for p in data["recent_payments"]:
            assert "created_at" in p
            assert "paid_at" in p


# ===========================================================================
# Тесты /courses
# ===========================================================================

class TestCourses:
    """Метрики курсов."""

    def test_basic(self):
        """Структура ответа."""
        data = get("/courses", {"days": 90})
        assert "new_enrollments" in data
        assert "certificates_issued" in data
        assert "courses" in data

    def test_courses_have_dates(self):
        """Курсы содержат created_at."""
        data = get("/courses", {"days": 90})
        for c in data["courses"]:
            assert "created_at" in c


# ===========================================================================
# Тесты /top-channels
# ===========================================================================

class TestTopChannels:
    """Топ каналов."""

    def test_sort_by_subscriptions(self):
        """Сортировка по подпискам."""
        data = get("/top-channels", {"sort_by": "subscriptions", "limit": 5})
        assert len(data["channels"]) <= 5
        # Проверяем убывание
        counts = [ch["subscriptions"] for ch in data["channels"]]
        assert counts == sorted(counts, reverse=True)

    def test_sort_by_leads(self):
        """Сортировка по лидам."""
        data = get("/top-channels", {"sort_by": "leads", "limit": 5})
        counts = [ch["leads"] for ch in data["channels"]]
        assert counts == sorted(counts, reverse=True)

    def test_sort_by_visits(self):
        """Сортировка по визитам."""
        data = get("/top-channels", {"sort_by": "visits", "limit": 5})
        counts = [ch["visits"] for ch in data["channels"]]
        assert counts == sorted(counts, reverse=True)

    def test_sort_by_revenue(self):
        """Сортировка по выручке."""
        data = get("/top-channels", {"sort_by": "revenue", "limit": 5})
        amounts = [ch["revenue"] for ch in data["channels"]]
        assert amounts == sorted(amounts, reverse=True)

    def test_channels_have_dates(self):
        """Каналы содержат created_at и billing_expires_at."""
        data = get("/top-channels", {"limit": 3})
        for ch in data["channels"]:
            assert "created_at" in ch
            assert "billing_expires_at" in ch

    def test_platform_filter(self):
        """Фильтр по платформе."""
        data = get("/top-channels", {"platform": "telegram", "limit": 5})
        for ch in data["channels"]:
            assert ch["platform"] == "telegram"


# ===========================================================================
# Тесты /conversion-funnel
# ===========================================================================

class TestConversionFunnel:
    """Воронка конверсии."""

    def test_basic(self):
        """4 стадии воронки."""
        data = get("/conversion-funnel")
        assert len(data["funnel"]) == 4
        stages = [s["stage"] for s in data["funnel"]]
        assert stages == ["visits", "leads", "subscriptions", "payments"]

    def test_rates_are_valid(self):
        """Rates в пределах 0-100."""
        data = get("/conversion-funnel")
        for stage in data["funnel"]:
            assert 0 <= stage["rate"] <= 100

    def test_with_channel_filter(self):
        """Фильтр по каналу."""
        data = get("/conversion-funnel", {"channel_id": 25, "days": 60})
        assert len(data["funnel"]) == 4

    def test_different_periods(self):
        """Разные периоды."""
        for days in [7, 30, 90]:
            data = get("/conversion-funnel", {"days": days})
            assert len(data["funnel"]) == 4


# ===========================================================================
# Кросс-тесты: комбинации фильтров
# ===========================================================================

class TestCombinedFilters:
    """Проверка комбинаций фильтров на всех эндпоинтах."""

    @pytest.mark.parametrize("endpoint", [
        "/overview", "/users", "/channels", "/revenue",
        "/engagement", "/lead-magnets", "/giveaways",
        "/broadcasts", "/funnels", "/paid-chats", "/courses",
        "/top-channels", "/conversion-funnel",
    ])
    def test_all_endpoints_respond_200(self, endpoint):
        """Каждый эндпоинт возвращает 200 с дефолтными параметрами."""
        status = get_status(endpoint, {"days": 30})
        assert status == 200, f"{endpoint} вернул {status}"

    @pytest.mark.parametrize("endpoint", [
        "/engagement", "/lead-magnets", "/giveaways",
        "/broadcasts", "/funnels", "/paid-chats",
        "/conversion-funnel",
    ])
    def test_channel_filter_on_all(self, endpoint):
        """Фильтр channel_id=25 работает на всех эндпоинтах."""
        status = get_status(endpoint, {"channel_id": 25, "days": 30})
        assert status == 200, f"{endpoint} с channel_id=25 вернул {status}"

    @pytest.mark.parametrize("endpoint", [
        "/users", "/channels", "/revenue", "/engagement",
        "/lead-magnets", "/giveaways", "/broadcasts",
        "/funnels", "/paid-chats", "/courses",
        "/top-channels", "/conversion-funnel",
    ])
    def test_date_range_on_all(self, endpoint):
        """Фильтр date_from/date_to работает на всех эндпоинтах."""
        status = get_status(endpoint, {"date_from": "2026-03-01", "date_to": "2026-04-10"})
        assert status == 200, f"{endpoint} с date_range вернул {status}"

    def test_invalid_date_format(self):
        """Неверный формат даты — 400."""
        status = get_status("/users", {"date_from": "not-a-date"})
        assert status == 400
