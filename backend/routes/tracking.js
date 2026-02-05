const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDb } = require('../config/database');

// Верификация данных от Telegram Web App
function verifyTelegramWebAppData(initData) {
    if (!initData || !process.env.BOT_TOKEN) return false;

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

        return calculatedHash === hash;
    } catch (e) {
        console.error('[Track] Verification error:', e.message);
        return false;
    }
}

// Получить данные для Mini App по короткому коду
router.get('/info/:shortCode', (req, res) => {
    const db = getDb();

    const link = db.prepare(`
        SELECT l.*, c.channel_id, c.title as channel_title, c.username as channel_username,
               c.yandex_metrika_id, c.vk_pixel_id
        FROM tracking_links l
        JOIN channels c ON c.id = l.channel_id
        WHERE l.short_code = ? AND c.is_active = 1
    `).get(req.params.shortCode);

    if (!link) {
        return res.status(404).json({ success: false, error: 'Ссылка не найдена' });
    }

    res.json({
        success: true,
        channel: {
            id: link.channel_id,
            title: link.channel_title,
            username: link.channel_username
        },
        utm: {
            source: link.utm_source,
            medium: link.utm_medium,
            campaign: link.utm_campaign,
            content: link.utm_content,
            term: link.utm_term
        },
        analytics: {
            yandex_metrika_id: link.yandex_metrika_id,
            vk_pixel_id: link.vk_pixel_id
        }
    });
});

// Записать визит из Mini App
router.post('/visit', (req, res) => {
    const { shortCode, initData, telegramId, username, firstName } = req.body;

    // Верификация данных Telegram (опционально в dev режиме)
    if (process.env.NODE_ENV === 'production' && !verifyTelegramWebAppData(initData)) {
        return res.status(401).json({ success: false, error: 'Invalid Telegram data' });
    }

    const db = getDb();

    // Находим ссылку
    const link = db.prepare(`
        SELECT l.*, c.id as channel_db_id, c.yandex_metrika_id, c.vk_pixel_id
        FROM tracking_links l
        JOIN channels c ON c.id = l.channel_id
        WHERE l.short_code = ?
    `).get(shortCode);

    if (!link) {
        return res.status(404).json({ success: false, error: 'Ссылка не найдена' });
    }

    // Записываем визит
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = db.prepare(`
        INSERT INTO visits (tracking_link_id, channel_id, telegram_id, username, first_name,
                           utm_source, utm_medium, utm_campaign, utm_content, utm_term,
                           ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        link.id,
        link.channel_db_id,
        telegramId,
        username,
        firstName,
        link.utm_source,
        link.utm_medium,
        link.utm_campaign,
        link.utm_content,
        link.utm_term,
        ip,
        userAgent
    );

    console.log(`[Track] Visit recorded: user=${telegramId}, link=${shortCode}, visit_id=${result.lastInsertRowid}`);

    res.json({
        success: true,
        visitId: result.lastInsertRowid,
        analytics: {
            yandex_metrika_id: link.yandex_metrika_id,
            vk_pixel_id: link.vk_pixel_id
        }
    });
});

// Записать подписку (вызывается после проверки подписки в Mini App)
router.post('/subscribe', (req, res) => {
    const { shortCode, initData, telegramId, username, firstName, visitId } = req.body;

    if (process.env.NODE_ENV === 'production' && !verifyTelegramWebAppData(initData)) {
        return res.status(401).json({ success: false, error: 'Invalid Telegram data' });
    }

    const db = getDb();

    const link = db.prepare(`
        SELECT l.*, c.id as channel_db_id
        FROM tracking_links l
        JOIN channels c ON c.id = l.channel_id
        WHERE l.short_code = ?
    `).get(shortCode);

    if (!link) {
        return res.status(404).json({ success: false, error: 'Ссылка не найдена' });
    }

    try {
        db.prepare(`
            INSERT INTO subscriptions (channel_id, telegram_id, username, first_name, visit_id)
            VALUES (?, ?, ?, ?, ?)
        `).run(link.channel_db_id, telegramId, username, firstName, visitId || null);

        console.log(`[Track] Subscription recorded: user=${telegramId}, channel=${link.channel_db_id}`);

        res.json({ success: true });
    } catch (e) {
        if (e.message.includes('UNIQUE constraint')) {
            res.json({ success: true, message: 'Already subscribed' });
        } else {
            throw e;
        }
    }
});

module.exports = router;
