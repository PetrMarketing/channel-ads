const crypto = require('crypto');
const { getDb } = require('../config/database');

// Верификация данных от Telegram Web App и получение пользователя
function verifyTelegramAuth(req, res, next) {
    const initData = req.headers['x-telegram-init-data'];

    if (!initData) {
        return res.status(401).json({ success: false, error: 'Требуется авторизация через Telegram' });
    }

    // В dev режиме можно пропустить верификацию
    if (process.env.NODE_ENV !== 'production') {
        // Парсим данные без верификации
        try {
            const params = new URLSearchParams(initData);
            const userStr = params.get('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                const db = getDb();

                // Находим или создаём пользователя
                let dbUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(user.id);

                if (!dbUser) {
                    const result = db.prepare(`
                        INSERT INTO users (telegram_id, username, first_name)
                        VALUES (?, ?, ?)
                    `).run(user.id, user.username, user.first_name);
                    dbUser = { id: result.lastInsertRowid, telegram_id: user.id, username: user.username };
                }

                req.user = dbUser;
                return next();
            }
        } catch (e) {
            console.error('[Auth] Dev parse error:', e.message);
        }
    }

    // Production верификация
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        params.delete('hash');

        // Сортируем параметры
        const sortedParams = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        // Создаём HMAC
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(process.env.BOT_TOKEN)
            .digest();

        const calculatedHash = crypto
            .createHmac('sha256', secretKey)
            .update(sortedParams)
            .digest('hex');

        if (calculatedHash !== hash) {
            return res.status(401).json({ success: false, error: 'Неверная подпись данных' });
        }

        // Проверяем время (данные не старше 1 часа)
        const authDate = parseInt(params.get('auth_date'), 10);
        if (Date.now() / 1000 - authDate > 3600) {
            return res.status(401).json({ success: false, error: 'Данные авторизации устарели' });
        }

        // Парсим пользователя
        const userStr = params.get('user');
        if (!userStr) {
            return res.status(401).json({ success: false, error: 'Нет данных пользователя' });
        }

        const user = JSON.parse(userStr);
        const db = getDb();

        // Находим или создаём пользователя
        let dbUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(user.id);

        if (!dbUser) {
            const result = db.prepare(`
                INSERT INTO users (telegram_id, username, first_name)
                VALUES (?, ?, ?)
            `).run(user.id, user.username, user.first_name);
            dbUser = { id: result.lastInsertRowid, telegram_id: user.id, username: user.username };
        }

        req.user = dbUser;
        next();

    } catch (e) {
        console.error('[Auth] Error:', e.message);
        res.status(401).json({ success: false, error: 'Ошибка авторизации' });
    }
}

module.exports = { verifyTelegramAuth };
