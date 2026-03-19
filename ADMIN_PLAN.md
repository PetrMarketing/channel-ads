# План реализации админ-панели

## Обзор

Админ-панель — отдельная подсистема: своя таблица `admin_users`, свой JWT, свои роуты `/api/admin/*` на бэке и `/admin/*` на фронте.

---

## Часть 1: База данных

**Файл:** `backend-python/app/database.py`

### Таблица `admin_users`
```sql
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    role TEXT DEFAULT 'admin',          -- 'superadmin', 'admin', 'viewer'
    is_active INTEGER DEFAULT 1,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
)
```

### Таблица `bot_message_log` (для просмотра диалогов бота с пользователями)
```sql
CREATE TABLE IF NOT EXISTS bot_message_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
    direction TEXT NOT NULL,            -- 'incoming' or 'outgoing'
    platform TEXT DEFAULT 'telegram',
    message_text TEXT,
    telegram_message_id TEXT,
    max_message_id TEXT,
    created_at TIMESTAMP DEFAULT NOW()
)
```

### Индексы
```sql
CREATE INDEX IF NOT EXISTS idx_bot_message_log_user ON bot_message_log(user_id)
CREATE INDEX IF NOT EXISTS idx_bot_message_log_channel ON bot_message_log(channel_id)
CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username)
```

### Сид: суперадмин по умолчанию
- username: `admin`, password: `admin123` (bcrypt-хеш), role: `superadmin`

---

## Часть 2: Конфигурация

**Файл:** `backend-python/app/config.py`

```python
ADMIN_JWT_SECRET: str = os.getenv("ADMIN_JWT_SECRET", "admin-change-me")
```

---

## Часть 3: Middleware авторизации админки

**Новый файл:** `backend-python/app/middleware/admin_auth.py`

- `get_current_admin(credentials)` — декодирует JWT по `ADMIN_JWT_SECRET`, ищет в `admin_users`, 401 если невалидно
- `require_superadmin(admin)` — обёртка, дополнительно проверяет `role == 'superadmin'`
- `create_admin_jwt(admin_id)` — создание токена
- `verify_admin_password(plain, hashed)` / `hash_admin_password(plain)` — bcrypt

---

## Часть 4: Backend — роуты админки

**Новый файл:** `backend-python/app/routes/admin.py`

### 4.1 Авторизация (`/api/admin/auth`)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/auth/login` | Логин username/password → JWT |
| GET | `/auth/me` | Текущий профиль админа |

### 4.2 Пользователи-администраторы приложения (`/api/admin/users`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/users` | Список пользователей с пагинацией и поиском |
| GET | `/users/{user_id}` | Профиль: инфо + каналы + биллинг + стафф |
| GET | `/users/{user_id}/channels` | Каналы пользователя с биллингом |
| GET | `/users/{user_id}/pins` | Закрепы по всем каналам пользователя |
| GET | `/users/{user_id}/broadcasts` | Рассылки по всем каналам |
| GET | `/users/{user_id}/giveaways` | Розыгрыши по всем каналам |
| GET | `/users/{user_id}/lead-magnets` | Лид-магниты по всем каналам |
| PUT | `/users/{user_id}/extend-tariff` | Продлить подписку: `{channel_id, months}` |
| DELETE | `/users/{user_id}/pins/{pin_id}` | Удалить закреп |
| PUT | `/users/{user_id}/pins/{pin_id}` | Редактировать закреп |
| DELETE | `/users/{user_id}/broadcasts/{id}` | Удалить рассылку |
| DELETE | `/users/{user_id}/giveaways/{id}` | Удалить розыгрыш |
| PUT | `/users/{user_id}/giveaways/{id}` | Редактировать розыгрыш |
| DELETE | `/users/{user_id}/lead-magnets/{id}` | Удалить лид-магнит |

### 4.3 Каналы (`/api/admin/channels`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/channels` | Список каналов с пагинацией, поиском, фильтром по платформе |
| GET | `/channels/{channel_id}` | Профиль канала: инфо + биллинг + стафф |
| GET | `/channels/{channel_id}/pins` | Закрепы канала |
| GET | `/channels/{channel_id}/lead-magnets` | Лид-магниты канала |
| GET | `/channels/{channel_id}/content` | Запланированные/опубликованные посты |
| GET | `/channels/{channel_id}/giveaways` | Розыгрыши канала |
| GET | `/channels/{channel_id}/links` | Ссылки канала |
| PUT | `/channels/{channel_id}/links/{link_id}` | Редактировать ссылку |
| DELETE | `/channels/{channel_id}/links/{link_id}` | Удалить ссылку |

### 4.4 Подписчики (`/api/admin/subscribers`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/subscribers` | Список подписок с поиском |
| GET | `/subscribers/{identifier}` | Профиль подписчика |
| GET | `/subscribers/{identifier}/channels` | Каналы, на которые подписан |
| GET | `/subscribers/{identifier}/dialog` | Диалог бота с пользователем |
| DELETE | `/subscribers/{identifier}/dialog/{message_id}` | Удалить сообщение |

### 4.5 Администраторы админ-панели (`/api/admin/admins`) — только superadmin

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/admins` | Список админов панели |
| POST | `/admins` | Создать админа (username, password, role) |
| PUT | `/admins/{admin_id}` | Изменить роль, сбросить пароль |
| DELETE | `/admins/{admin_id}` | Удалить админа (нельзя себя) |

### 4.6 Дашборд (`/api/admin/dashboard`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/dashboard/stats` | Общая статистика: пользователи, каналы, подписчики, активные тарифы |

---

## Часть 5: Логирование сообщений бота

**Файлы для изменения:**
- `backend-python/app/routes/telegram_bot.py`
- `backend-python/app/routes/max_webhook.py`

Добавить `INSERT INTO bot_message_log` при каждом входящем и исходящем сообщении.

---

## Часть 6: Frontend — API сервис админки

**Новый файл:** `frontend-react/src/services/adminApi.js`

Аналог `api.js`, но использует `localStorage.getItem('admin_token')` и редирект на `/admin/login` при 401.

---

## Часть 7: Frontend — контекст авторизации админки

**Новый файл:** `frontend-react/src/contexts/AdminAuthContext.jsx`

Аналог `AuthContext.jsx` с ключами `admin_token` и `admin_user`.

---

## Часть 8: Frontend — лейаут админки

**Новые файлы:**
- `frontend-react/src/components/admin/AdminLayout.jsx` — основной лейаут с сайдбаром
- `frontend-react/src/components/admin/AdminSidebar.jsx` — навигация: Дашборд, Пользователи, Каналы, Подписчики, Администраторы
- `frontend-react/src/components/admin/AdminHeader.jsx` — имя админа + кнопка выхода

---

## Часть 9: Frontend — страницы админки

**Директория:** `frontend-react/src/pages/admin/`

| Файл | Роут | Описание |
|------|------|----------|
| `AdminLoginPage.jsx` | `/admin/login` | Форма логин/пароль |
| `AdminDashboardPage.jsx` | `/admin` | Обзор: пользователи, каналы, подписчики, активные тарифы |
| `AdminUsersPage.jsx` | `/admin/users` | Таблица пользователей с поиском, клик → профиль |
| `AdminUserProfilePage.jsx` | `/admin/users/:userId` | Профиль пользователя: каналы (кликабельны), подписки, стафф. Табы: закрепы, лид-магниты, рассылки, розыгрыши. Кнопка продления тарифа. Удаление/редактирование контента |
| `AdminChannelsPage.jsx` | `/admin/channels` | Таблица каналов с поиском/фильтром |
| `AdminChannelProfilePage.jsx` | `/admin/channels/:channelId` | Профиль канала: инфо, администраторы/стафф, биллинг. Табы: закрепы, лид-магниты, посты, розыгрыши, ссылки (с редактированием/удалением) |
| `AdminSubscribersPage.jsx` | `/admin/subscribers` | Таблица подписчиков с поиском |
| `AdminSubscriberDetailPage.jsx` | `/admin/subscribers/:identifier` | Инфо подписчика, каналы, диалог с ботом (чат-UI с удалением сообщений) |
| `AdminAdminsPage.jsx` | `/admin/admins` | CRUD администраторов панели (только superadmin) |

---

## Часть 10: Интеграция роутера

**Файл:** `frontend-react/src/App.jsx`

```jsx
<Route path="/admin/login" element={<AdminLoginPage />} />
<Route path="/admin" element={<AdminPrivateRoute><AdminLayout /></AdminPrivateRoute>}>
  <Route index element={<AdminDashboardPage />} />
  <Route path="users" element={<AdminUsersPage />} />
  <Route path="users/:userId" element={<AdminUserProfilePage />} />
  <Route path="channels" element={<AdminChannelsPage />} />
  <Route path="channels/:channelId" element={<AdminChannelProfilePage />} />
  <Route path="subscribers" element={<AdminSubscribersPage />} />
  <Route path="subscribers/:identifier" element={<AdminSubscriberDetailPage />} />
  <Route path="admins" element={<AdminAdminsPage />} />
</Route>
```

**Файл:** `frontend-react/src/main.jsx` — обернуть в `<AdminAuthProvider>`

---

## Часть 11: Порядок реализации

| # | Этап | Файлы |
|---|------|-------|
| 1 | БД — таблицы + сид суперадмина | `database.py` |
| 2 | Конфиг | `config.py` |
| 3 | Middleware админ-авторизации | `middleware/admin_auth.py` |
| 4 | Роуты: авторизация | `routes/admin.py` (auth) |
| 5 | Роуты: дашборд, пользователи, каналы, подписчики, администраторы | `routes/admin.py` (остальное) |
| 6 | Логирование сообщений бота | `telegram_bot.py`, `max_webhook.py` |
| 7 | Frontend: adminApi.js | `services/adminApi.js` |
| 8 | Frontend: AdminAuthContext | `contexts/AdminAuthContext.jsx` |
| 9 | Frontend: лейаут (Layout, Sidebar, Header) | `components/admin/` |
| 10 | Frontend: страница логина | `pages/admin/AdminLoginPage.jsx` |
| 11 | Frontend: дашборд | `pages/admin/AdminDashboardPage.jsx` |
| 12 | Frontend: пользователи + профиль | `pages/admin/AdminUsersPage.jsx`, `AdminUserProfilePage.jsx` |
| 13 | Frontend: каналы + профиль | `pages/admin/AdminChannelsPage.jsx`, `AdminChannelProfilePage.jsx` |
| 14 | Frontend: подписчики + диалог | `pages/admin/AdminSubscribersPage.jsx`, `AdminSubscriberDetailPage.jsx` |
| 15 | Frontend: администраторы панели | `pages/admin/AdminAdminsPage.jsx` |
| 16 | Интеграция роутера | `App.jsx`, `main.jsx` |
| 17 | Регистрация роутов на бэке | `main.py` |
| 18 | Пересборка Docker | `docker compose build && up` |
