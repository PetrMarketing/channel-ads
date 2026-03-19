# Channel-Ads — Документация проекта

## Обзор

Платформа для отслеживания рекламы и подписок в каналах Telegram и MAX. Включает дашборд, мини-приложения, ботов, аналитику и систему автоматизаций.

**Стек:** Node.js (Express) + PostgreSQL + HTML/CSS/JS (без фреймворков) + Python (Flask admin)
**Деплой:** Render.com, БД на Timeweb (PostgreSQL)
**Авторизация:** Через Telegram/MAX ботов (без email/password)

---

## Структура проекта

```
channel-ads/
├── backend/                    # Node.js API сервер
│   ├── server.js               # Express приложение, маршруты, проксирование Flask
│   ├── config/
│   │   └── database.js         # PostgreSQL: подключение, схема (1600+ строк)
│   ├── bot/
│   │   └── index.js            # Telegram бот (grammy)
│   ├── middleware/
│   │   ├── auth.js             # JWT + верификация Telegram WebApp
│   │   └── upload.js           # Загрузка файлов (multer)
│   ├── routes/                 # 25 файлов маршрутов (см. раздел API)
│   ├── services/
│   │   ├── maxApi.js           # REST-клиент MAX Messenger Bot API
│   │   ├── funnelProcessor.js  # Фоновая обработка воронок (каждые 10 сек)
│   │   ├── messenger.js        # Форматирование и отправка сообщений
│   │   ├── offlineConversion.js# Офлайн-конверсии Яндекс.Метрики
│   │   ├── imageOverlay.js     # Обработка изображений (sharp)
│   │   └── integrations.js     # InSales, YClients, GetCourse
│   ├── .env                    # Секреты (НЕ коммитить!)
│   ├── .env.example            # Шаблон переменных
│   └── package.json
├── frontend/                   # Фронтенд (статика)
│   ├── index.html              # Главный дашборд (2650 строк)
│   ├── login.html              # Страница входа
│   ├── subscribe.html          # Мини-приложение подписки
│   ├── booking.html            # Запись к специалисту
│   ├── webinar.html            # Вебинарная комната
│   ├── shop.html               # Каталог товаров
│   ├── go.html                 # Универсальный редирект
│   ├── script.js               # Логика дашборда (7160 строк)
│   └── style.css               # Стили (3208 строк)
├── admin/                      # Python Flask админка
│   ├── app.py                  # Flask-приложение
│   ├── requirements.txt        # Flask, PyJWT, psycopg2-binary
│   ├── static/                 # admin.css, admin.js
│   └── templates/              # Jinja2-шаблоны
├── uploads/                    # Загруженные файлы пользователей
├── render.yaml                 # Конфигурация деплоя на Render
├── package.json                # Корневой package.json
└── CLAUDE.md                   # Инструкции для AI-ассистента
```

---

## Переменные окружения (.env)

| Переменная | Назначение | Пример |
|---|---|---|
| `PORT` | Порт Express | `3001` |
| `NODE_ENV` | Окружение | `development` / `production` |
| `BOT_TOKEN` | Токен Telegram-бота | `8301361512:AAGU...` |
| `BOT_USERNAME` | Username Telegram-бота | `PKAds_bot` |
| `MINIAPP_NAME` | Имя Mini App в Telegram | `subscribe` |
| `MAX_BOT_TOKEN` | Токен MAX-бота | `f9LHodD0cOL9...` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `DATABASE_SSL` | SSL для БД | `true` / `false` |
| `JWT_SECRET` | Секрет для подписи JWT | `channel-ads-secret-...` |
| `APP_URL` | URL приложения | `https://channel-ads.onrender.com` |
| `ADMIN_PORT` | Порт Flask-админки | `5000` |
| `UPLOAD_DIR` | Папка загрузок | `./uploads` |
| `OPENROUTER_API_KEY` | API ключ OpenRouter (AI) | *(опционально)* |

---

## Схема базы данных (PostgreSQL)

Схема создаётся автоматически при старте в `backend/config/database.js`.

### Основные таблицы

**users** — Пользователи платформы
- `id` SERIAL PK
- `telegram_id` BIGINT UNIQUE — ID в Telegram
- `max_user_id` TEXT — ID в MAX
- `username`, `first_name`, `email`, `password`

**channels** — Каналы/чаты
- `id` SERIAL PK
- `channel_id` BIGINT UNIQUE
- `user_id` → users, `owner_id`
- `platform` (telegram | max)
- `title`, `username`
- `yandex_metrika_id`, `vk_pixel_id`, `ym_oauth_token`
- `max_chat_id`
- `tracking_code` UNIQUE — ключ дашборда

**tracking_links** — Рекламные ссылки с UTM
- `short_code` UNIQUE
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`
- `ym_counter_id`, `ym_goal_name` — переопределение Метрики на уровне ссылки
- `clicks` — счётчик кликов

**visits** — Клики по рекламным ссылкам
- `tracking_link_id`, `channel_id`
- `telegram_id`, `max_user_id`
- `username`, `first_name`
- Все UTM-метки (наследуются от ссылки)
- `ym_client_id` — ID клиента Яндекс.Метрики
- `ip_address`, `user_agent`, `platform`

**subscriptions** — Подписки на канал
- `channel_id`, `telegram_id`, `max_user_id`
- `visit_id` → visits
- `platform` (telegram | max)
- UNIQUE(channel_id, telegram_id)

**lead_magnets** — Лид-магниты (файлы)
- `code` UNIQUE, `title`, `message_text`
- `file_path`, `telegram_file_id`, `file_type`

**pin_posts** — Закреплённые посты
- `title`, `message_text`, `lead_magnet_id`
- `telegram_message_id`, `status` (draft | published)

**leads** — Получатели лид-магнитов
- `lead_magnet_id`, `telegram_id`

**funnel_steps** — Шаги воронки
- `lead_magnet_id`, `step_number`, `delay_minutes`
- `message_text`, `file_path`, `telegram_file_id`

**funnel_progress** — Прогресс воронки
- `lead_id`, `funnel_step_id`
- `status` (pending | sent), `scheduled_at`, `sent_at`

**offline_conversions** — Офлайн-конверсии для Яндекс.Метрики
- `subscription_id`, `channel_id`, `visit_id`
- `ym_client_id`, `ym_counter_id`, `goal_name`
- `conversion_time`, `uploaded_at`, `upload_error`

**channel_modules** — Переключатели модулей
- `module_type` (links, pins, content, broadcasts, funnels, ...)
- `is_enabled`, `config` JSONB

**broadcasts** — Массовые рассылки
- `title`, `message_text`, `file_path`
- `target_type` (all_leads | specific_lead_magnet)
- `status` (draft | scheduled | active | completed)
- `sent_count`, `failed_count`, `total_count`

**products** — Товары/услуги
- `channel_id`, `product_type`, `title`, `description`, `price`, `currency`

**specialists** — Специалисты для записи
**time_slots** — Слоты для записи
**orders** — Заказы/бронирования

**content_posts** — Публикации контента
- `status` (draft | scheduled | published), `ai_generated`

**content_plans** — AI-планы контента (goal, niche, products, pains...)

**integrations** — Интеграции (InSales, YClients, GetCourse)
- `type`, `config` JSONB

**landing_pages** — Лендинги
- `slug` UNIQUE, `title`, `config` JSONB, `html_content`

**landing_form_submissions** — Заявки с лендингов

**courses** — Онлайн-курсы
**course_modules** — Модули/уроки курсов

---

## API маршруты

### Публичные (без авторизации)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/track/info/:shortCode` | Метаданные ссылки |
| POST | `/api/track/visit` | Записать визит/клик |
| POST | `/api/track/subscribe` | Записать подписку |
| POST | `/api/track/check-subscription-by-visit` | Проверка подписки (polling) |
| GET | `/go/:code` | Редирект рекламной ссылки |
| GET | `/api/health` | Health check |
| GET | `/lp/:slug` | Публичный лендинг |
| POST | `/webhook/max` | Вебхук MAX Messenger |

### Защищённые (JWT в заголовке Authorization: Bearer)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/auth/me` | Текущий пользователь |
| POST | `/api/auth/merge` | Объединение аккаунтов TG + MAX |
| GET | `/api/channels` | Список каналов пользователя |
| GET/PUT | `/api/channels/:trackingCode` | Детали/настройки канала |
| GET/POST/PUT/DELETE | `/api/links/:trackingCode` | CRUD рекламных ссылок |
| GET/PUT | `/api/modules/:trackingCode` | Модули канала |
| GET | `/api/dashboard` | Статистика дашборда |
| GET/POST | `/api/pins/:trackingCode` | Закреплённые посты |
| GET/POST | `/api/broadcasts/:trackingCode` | Рассылки |
| GET/POST | `/api/funnels/:trackingCode` | Воронки |
| GET/POST | `/api/content/:trackingCode` | Контент-календарь |
| GET/POST | `/api/shop/:trackingCode` | Товары |
| GET/POST | `/api/courses/:trackingCode` | Курсы |
| GET/POST | `/api/landings/:trackingCode` | Лендинги |
| GET/POST | `/api/giveaways/:trackingCode` | Розыгрыши |
| GET/POST | `/api/webinars/:trackingCode` | Вебинары |
| GET/POST | `/api/integrations/:trackingCode` | Интеграции |
| GET | `/api/max/status` | Статус MAX бота |
| GET | `/api/max/chats` | Чаты MAX бота |
| POST | `/api/max/connect` | Привязать канал к чату MAX |
| GET/POST | `/api/conversions/:trackingCode` | Офлайн-конверсии |
| GET/POST | `/api/crm/:trackingCode` | CRM-контакты |
| GET/POST | `/api/ecommerce/:trackingCode` | E-commerce |
| GET/POST | `/api/loyalty/:trackingCode` | Лояльность/отзывы |
| GET/POST | `/api/payments/:trackingCode` | Платежи |
| GET/POST | `/api/staff/:trackingCode` | Сотрудники |
| GET/POST | `/api/notifications` | Уведомления |
| GET/POST | `/api/automations/:trackingCode` | Автоматизации |
| GET/POST | `/api/extras/:trackingCode` | Опросы, реферралы |

### Админские (ключ в query: ?key=JWT_SECRET)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/admin/users` | Все пользователи |
| GET | `/api/admin/user-stats/:email` | Статистика пользователя |
| POST | `/api/admin/reassign-channel` | Передача канала |

---

## Аутентификация

```
Telegram Mini App → initData (HMAC-SHA256) → /api/auth → JWT (30 дней)
MAX Web App       → initDataUnsafe         → /api/auth → JWT (30 дней)
```

- Верификация подписи через BOT_TOKEN
- JWT хранится в localStorage браузера
- Аккаунты можно объединить (merge) если есть и TG и MAX
- В dev-режиме верификация подписи пропускается

---

## Внешние сервисы

| Сервис | Назначение | Файлы |
|---|---|---|
| **Telegram Bot API** | Бот, авторизация, отправка сообщений | `bot/index.js` |
| **MAX Messenger Bot API** | Бот, авторизация, вебхуки | `services/maxApi.js`, `routes/max-webhook.js` |
| **Яндекс.Метрика** | Трекинг, цели, офлайн-конверсии | `subscribe.html`, `routes/offline-conversions.js` |
| **VK Pixel** | Трекинг рекламы ВК | `subscribe.html` |
| **OpenRouter** | AI-генерация контента | `routes/content.js`, `routes/landings.js` |
| **InSales** | Синхронизация товаров | `services/integrations.js` |
| **YClients** | Синхронизация слотов записи | `services/integrations.js` |
| **GetCourse** | Вебхуки курсов | `services/integrations.js` |

---

## Деплой (Render.com)

Конфигурация в `render.yaml`:
- **Runtime:** Node.js
- **Region:** Frankfurt
- **Build:** `npm install --prefix channel-ads/backend`
- **Start:** устанавливает Flask зависимости, затем `node server.js`
- **Disk:** 1 GB (для uploads)
- БД: PostgreSQL на Timeweb (внешний)

### Как задеплоить

```bash
# Через Render API
curl -s -X POST "https://api.render.com/v1/services/{SERVICE_ID}/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Accept: application/json" -d '{}'
```

Или — push в main на GitHub (авто-деплой).

---

## Ключевые архитектурные решения

1. **SQLite → PostgreSQL адаптер** — `PgWrapper` в `database.js` конвертирует SQLite-синтаксис (`?` → `$1`, `datetime('now')` → `NOW()`, `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`)

2. **Фоновый процессор воронок** — `funnelProcessor.js` запускается каждые 10 сек, обрабатывает pending-сообщения

3. **Кеширование Telegram file_id** — файлы загружаются один раз, file_id сохраняется для повторных отправок

4. **Модульная система** — `channel_modules` включает/отключает фичи для каждого канала

5. **Аналитическая воронка**: Клик → Visit (с ym_client_id) → Subscription → Offline Conversion → Upload в Метрику

6. **Кросс-платформенный merge** — автоматическая привязка по username между Telegram и MAX

---

## Зависимости

### Backend (Node.js)
- `express` — HTTP-сервер
- `grammy` — Telegram Bot API
- `pg` — PostgreSQL клиент
- `jsonwebtoken` — JWT
- `multer` — загрузка файлов
- `sharp` — обработка изображений
- `helmet` — заголовки безопасности
- `cors` — CORS
- `dotenv` — переменные окружения
- `uuid` — генерация UUID
- `http-proxy-middleware` — проксирование на Flask

### Admin (Python)
- `flask` — HTTP-сервер
- `PyJWT` — JWT
- `psycopg2-binary` — PostgreSQL
- `gunicorn` — WSGI-сервер

### Frontend
- Нет фреймворков — ванильный HTML/CSS/JS
- Chart.js — графики аналитики
