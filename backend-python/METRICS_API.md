# Metrics REST API

REST API для получения ключевых метрик платформы из внешней админки.

**Base URL:** `https://max.pkmarketing.ru/api/metrics`

## Авторизация

Все запросы требуют заголовок `X-API-Key`:

```
X-API-Key: <METRICS_API_KEY>
```

| Код ответа | Описание |
|---|---|
| 200 | Успешный запрос |
| 401 | Неверный API-ключ |
| 422 | Отсутствует заголовок X-API-Key |
| 400 | Неверный формат параметров (например, дата) |
| 503 | METRICS_API_KEY не настроен на сервере |

---

## Общие параметры фильтрации

Большинство эндпоинтов поддерживают следующие query-параметры:

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| `days` | int (1-365) | 30 | Период в днях назад от текущего момента |
| `date_from` | string | — | Начало периода в формате `YYYY-MM-DD`. Приоритетнее `days` |
| `date_to` | string | — | Конец периода в формате `YYYY-MM-DD`. Приоритетнее `days` |
| `channel_id` | int | — | Фильтр по ID конкретного канала |
| `platform` | string | — | Фильтр по платформе: `telegram` или `max` |

---

## Эндпоинты

### 1. GET /overview

Общая сводка ключевых счётчиков по всей системе.

**Параметры:** `channel_id`, `platform`

**Пример запроса:**
```bash
curl -H "X-API-Key: <key>" "https://max.pkmarketing.ru/api/metrics/overview?channel_id=25"
```

**Пример ответа:**
```json
{
  "users": 319,
  "channels": 47,
  "active_channels": 41,
  "subscriptions": 3184,
  "leads": 221,
  "active_billings": 20,
  "orders": 0,
  "clients": 0,
  "total_revenue": 2901.0,
  "total_orders_revenue": 0.0
}
```

---

### 2. GET /users

Динамика регистраций пользователей, источники, список новых с датами.

**Параметры:** `days`, `date_from`, `date_to`, `platform`

**Пример запроса:**
```bash
curl -H "X-API-Key: <key>" "https://max.pkmarketing.ru/api/metrics/users?date_from=2026-04-01&date_to=2026-04-10"
```

**Пример ответа:**
```json
{
  "total": 319,
  "new": 210,
  "period": {
    "from": "2026-04-01T00:00:00",
    "to": "2026-04-10T23:59:59"
  },
  "by_day": [
    {"date": "2026-04-01", "count": 9},
    {"date": "2026-04-02", "count": 18}
  ],
  "by_source": [
    {"source": "direct", "count": 210}
  ],
  "recent_users": [
    {
      "id": 342,
      "telegram_id": null,
      "max_user_id": "12230649",
      "username": null,
      "first_name": "Влад",
      "email": null,
      "source": null,
      "created_at": "2026-04-10T19:09:46.327797"
    }
  ]
}
```

---

### 3. GET /channels

Каналы: распределение по тарифам, платформам, динамика создания.

**Параметры:** `days`, `date_from`, `date_to`, `platform`

**Пример ответа:**
```json
{
  "total": 47,
  "new": 43,
  "period": {"from": "...", "to": "..."},
  "by_plan": [
    {"plan": "trial", "status": "expired", "count": 22},
    {"plan": "paid", "status": "active", "count": 8}
  ],
  "by_day": [
    {"date": "2026-04-08", "count": 8}
  ],
  "by_platform": [
    {"platform": "max", "count": 43},
    {"platform": "telegram", "count": 4}
  ],
  "recent_channels": [
    {
      "id": 56,
      "title": "Тестовый канал",
      "username": "test_channel",
      "platform": "max",
      "is_active": 1,
      "created_at": "2026-04-08T10:00:00",
      "plan": "trial",
      "billing_status": "active",
      "billing_started_at": "2026-04-08T10:00:00",
      "billing_expires_at": "2026-04-10T10:00:00"
    }
  ]
}
```

---

### 4. GET /revenue

Выручка: биллинг-платежи и заказы по дням, средний чек, список платежей.

**Параметры:** `days`, `date_from`, `date_to`, `channel_id`

**Пример ответа:**
```json
{
  "period": {"from": "...", "to": "..."},
  "billing": {
    "total": 2901.0,
    "count": 7,
    "avg_check": 414.43,
    "by_day": [
      {"date": "2026-04-08", "amount": 1421.0, "count": 3}
    ],
    "payments": [
      {
        "id": 54,
        "amount": 490.0,
        "currency": "RUB",
        "channel_id": 25,
        "channel_title": "Канал",
        "created_at": "2026-04-09T22:10:17.410081"
      }
    ]
  },
  "orders": {
    "total": 0.0,
    "count": 0,
    "avg_check": 0,
    "by_day": []
  },
  "combined_total": 2901.0
}
```

---

### 5. GET /engagement

Визиты, клики, лиды, подписки за период. Топ трекинг-ссылок.

**Параметры:** `days`, `date_from`, `date_to`, `channel_id`, `platform`

**Пример ответа:**
```json
{
  "period": {"from": "...", "to": "..."},
  "visits": 14667,
  "clicks": 30911,
  "new_leads": 218,
  "new_subscriptions": 3183,
  "leads_by_day": [
    {"date": "2026-04-08", "count": 3}
  ],
  "subscriptions_by_day": [
    {"date": "2026-04-08", "count": 143}
  ],
  "top_links": [
    {
      "id": 29,
      "name": "Яндекс",
      "utm_source": "",
      "utm_campaign": "",
      "total_clicks": 30463,
      "period_visits": 14399,
      "created_at": "2026-03-25T10:00:00"
    }
  ]
}
```

---

### 6. GET /billing

Биллинг: активные/истекающие подписки, MRR, распределение по тарифам.

**Параметры:** `channel_id`

**Пример ответа:**
```json
{
  "active_subscriptions": 20,
  "expiring_7d": 6,
  "expired_not_renewed": 0,
  "total_ever_subscribed": 44,
  "estimated_mrr": 9800.0,
  "by_plan": [
    {"plan": "trial", "count": 11},
    {"plan": "paid", "count": 8}
  ],
  "active_subscriptions_list": [
    {
      "id": 1,
      "channel_id": 25,
      "channel_title": "Канал",
      "plan": "paid",
      "billing_months": 1,
      "max_users": 1,
      "started_at": "2026-04-01T00:00:00",
      "expires_at": "2026-05-01T00:00:00",
      "created_at": "2026-04-01T00:00:00"
    }
  ],
  "recent_payments": [
    {
      "id": 54,
      "amount": 490.0,
      "currency": "RUB",
      "status": "paid",
      "channel_id": 25,
      "channel_title": "Канал",
      "created_at": "2026-04-09T22:10:17"
    }
  ]
}
```

---

### 7. GET /lead-magnets

Эффективность лид-магнитов: топ по клеймам, динамика, последние клеймы.

**Параметры:** `days`, `date_from`, `date_to`, `channel_id`

**Пример ответа:**
```json
{
  "period": {"from": "...", "to": "..."},
  "top_lead_magnets": [
    {
      "id": 36,
      "title": "Чек-лист по упаковке канала",
      "code": "6fb5cd110aaf",
      "channel_id": 38,
      "channel_title": "Пресняков Маркетинг",
      "claims_count": 114,
      "created_at": "2026-04-10T15:53:37"
    }
  ],
  "claims_by_day": [
    {"date": "2026-04-10", "count": 118}
  ],
  "recent_claims": [
    {
      "id": 221,
      "telegram_id": null,
      "max_user_id": "12230649",
      "username": null,
      "first_name": "Влад",
      "platform": "max",
      "lead_magnet_title": "Чек-лист",
      "channel_id": 38,
      "claimed_at": "2026-04-10T19:09:46"
    }
  ]
}
```

---

### 8. GET /giveaways

Розыгрыши: список с участниками, статусы, даты проведения.

**Параметры:** `days`, `date_from`, `date_to`, `channel_id`

**Пример ответа:**
```json
{
  "period": {"from": "...", "to": "..."},
  "giveaways": [
    {
      "id": 28,
      "title": "Розыгрыш от 08.04.2026",
      "status": "finished",
      "winner_count": 1,
      "participant_count": 1,
      "channel_id": 56,
      "channel_title": "Тестовый канал",
      "created_at": "2026-04-08T12:22:53",
      "published_at": "2026-04-08T12:23:40",
      "drawn_at": "2026-04-08T12:27:40",
      "ends_at": "2026-04-08T15:25:00"
    }
  ],
  "by_status": [
    {"status": "finished", "count": 3, "total_participants": 3},
    {"status": "draft", "count": 3, "total_participants": 0}
  ]
}
```

---

### 9. GET /broadcasts

Рассылки: статистика доставки, список с датами.

**Параметры:** `days`, `date_from`, `date_to`, `channel_id`

**Пример ответа:**
```json
{
  "period": {"from": "...", "to": "..."},
  "total_broadcasts": 2,
  "total_sent": 1,
  "total_failed": 0,
  "total_recipients": 1,
  "delivery_rate": 100.0,
  "broadcasts": [
    {
      "id": 20,
      "title": "Рассылки",
      "status": "completed",
      "target_type": "all_leads",
      "sent_count": 1,
      "failed_count": 0,
      "total_count": 1,
      "channel_id": 18,
      "channel_title": "Тест канала",
      "created_at": "2026-03-19T09:43:32",
      "scheduled_at": null,
      "started_at": "2026-03-19T09:44:32",
      "completed_at": "2026-03-19T09:44:32"
    }
  ]
}
```

---

### 10. GET /funnels

Воронки автоматизации: шаги, прогресс отправки.

**Параметры:** `days`, `date_from`, `date_to`, `channel_id`

**Пример ответа:**
```json
{
  "period": {"from": "...", "to": "..."},
  "steps": [
    {
      "id": 5,
      "channel_id": 18,
      "channel_title": "Тест канала",
      "step_number": 1,
      "delay_minutes": 1,
      "is_active": 1,
      "lead_magnet_title": "Тестовый лм",
      "created_at": "2026-03-19T10:54:30"
    }
  ],
  "progress_by_status": {
    "sent": 1,
    "pending": 0,
    "failed": 0
  }
}
```

---

### 11. GET /paid-chats

Платные чаты: подписчики, выручка, планы, платежи.

**Параметры:** `days`, `date_from`, `date_to`, `channel_id`

**Пример ответа:**
```json
{
  "period": {"from": "...", "to": "..."},
  "active_members": 1,
  "new_members": 1,
  "revenue": 2600.0,
  "payments_count": 1,
  "by_plan": [
    {
      "plan_title": "Месячная подписка",
      "plan_type": "recurring",
      "price": 2600.0,
      "members_count": 1
    }
  ],
  "recent_payments": [
    {
      "id": 50,
      "amount": 2600.0,
      "currency": "RUB",
      "status": "paid",
      "username": "natalya_vik",
      "first_name": "Наталья",
      "platform": "telegram",
      "created_at": "2026-04-05T01:20:53",
      "paid_at": "2026-04-05T01:23:47"
    }
  ]
}
```

---

### 12. GET /courses

Курсы: записи, прогресс, сертификаты.

**Параметры:** `days`, `date_from`, `date_to`, `channel_id`

**Пример ответа:**
```json
{
  "period": {"from": "...", "to": "..."},
  "new_enrollments": 5,
  "certificates_issued": 2,
  "courses": [
    {
      "id": 1,
      "title": "Курс по маркетингу",
      "status": "published",
      "price": 9900.0,
      "currency": "RUB",
      "channel_id": 25,
      "channel_title": "Канал",
      "enrollments_count": 15,
      "completed_count": 3,
      "avg_progress": 45.2,
      "created_at": "2026-03-15T10:00:00"
    }
  ]
}
```

---

### 13. GET /top-channels

Топ каналов по ключевым метрикам за период.

**Параметры:** `days`, `date_from`, `date_to`, `platform`, `limit` (1-100, по умолчанию 20), `sort_by`

**Значения `sort_by`:**
- `subscriptions` (по умолчанию) — по количеству подписок
- `leads` — по количеству лидов
- `visits` — по количеству визитов
- `revenue` — по выручке

**Пример запроса:**
```bash
curl -H "X-API-Key: <key>" "https://max.pkmarketing.ru/api/metrics/top-channels?sort_by=subscriptions&limit=5&platform=max"
```

**Пример ответа:**
```json
{
  "period": {"from": "...", "to": "..."},
  "sort_by": "subscriptions",
  "channels": [
    {
      "id": 22,
      "title": "Руслан Рунов / Дома в Краснодаре",
      "username": "https://max.ru/ruslanrunov",
      "platform": "max",
      "plan": "paid",
      "billing_status": "active",
      "billing_expires_at": "2029-04-14T16:34:13",
      "subscriptions": 1450,
      "leads": 0,
      "visits": 0,
      "revenue": 0.0,
      "created_at": "2026-03-23T14:09:01"
    }
  ]
}
```

---

### 14. GET /conversion-funnel

Воронка конверсии: визиты -> лиды -> подписки -> платежи с процентами.

**Параметры:** `days`, `date_from`, `date_to`, `channel_id`

**Пример ответа:**
```json
{
  "period": {"from": "...", "to": "..."},
  "funnel": [
    {"stage": "visits", "count": 14667, "rate": 100.0},
    {"stage": "leads", "count": 218, "rate": 1.49},
    {"stage": "subscriptions", "count": 3183, "rate": 21.7},
    {"stage": "payments", "count": 7, "rate": 0.05}
  ],
  "payments_total": 2901.0
}
```

---

## Примеры использования

### Получить общую сводку по конкретному каналу
```bash
curl -H "X-API-Key: <key>" "https://max.pkmarketing.ru/api/metrics/overview?channel_id=25"
```

### Получить выручку за конкретный период
```bash
curl -H "X-API-Key: <key>" "https://max.pkmarketing.ru/api/metrics/revenue?date_from=2026-03-01&date_to=2026-03-31"
```

### Получить топ-5 каналов по лидам для платформы MAX
```bash
curl -H "X-API-Key: <key>" "https://max.pkmarketing.ru/api/metrics/top-channels?sort_by=leads&limit=5&platform=max"
```

### Воронка конверсии по конкретному каналу за неделю
```bash
curl -H "X-API-Key: <key>" "https://max.pkmarketing.ru/api/metrics/conversion-funnel?channel_id=25&days=7"
```

---

## Запуск тестов

```bash
docker exec -e METRICS_TEST_URL=http://127.0.0.1:8000/api/metrics channel-ads \
  python -m pytest /app/tests/test_metrics_api.py -v
```
