const express = require('express');
const router = express.Router();
const { getDb } = require('../config/database');
const { verifyTelegramAuth } = require('../middleware/auth');

// Получить все ссылки канала
router.get('/:trackingCode', verifyTelegramAuth, (req, res) => {
    const db = getDb();

    const channel = db.prepare(`
        SELECT id FROM channels WHERE tracking_code = ? AND owner_id = ?
    `).get(req.params.trackingCode, req.user.id);

    if (!channel) {
        return res.status(404).json({ success: false, error: 'Канал не найден' });
    }

    const links = db.prepare(`
        SELECT l.*,
            (SELECT COUNT(*) FROM visits WHERE tracking_link_id = l.id) as visits_count,
            (SELECT COUNT(*) FROM subscriptions s
             JOIN visits v ON v.id = s.visit_id
             WHERE v.tracking_link_id = l.id) as subscribers_count
        FROM tracking_links l
        WHERE l.channel_id = ?
        ORDER BY l.created_at DESC
    `).all(channel.id);

    res.json({ success: true, links });
});

// Создать новую ссылку
router.post('/:trackingCode', verifyTelegramAuth, (req, res) => {
    const { name, utm_source, utm_medium, utm_campaign, utm_content, utm_term } = req.body;
    const db = getDb();

    const channel = db.prepare(`
        SELECT id, username FROM channels WHERE tracking_code = ? AND owner_id = ?
    `).get(req.params.trackingCode, req.user.id);

    if (!channel) {
        return res.status(404).json({ success: false, error: 'Канал не найден' });
    }

    if (!name || !utm_source) {
        return res.status(400).json({ success: false, error: 'Укажите название и utm_source' });
    }

    // Генерируем короткий код
    const shortCode = generateShortCode();

    const result = db.prepare(`
        INSERT INTO tracking_links (channel_id, name, utm_source, utm_medium, utm_campaign, utm_content, utm_term, short_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(channel.id, name, utm_source, utm_medium || null, utm_campaign || null, utm_content || null, utm_term || null, shortCode);

    const link = db.prepare('SELECT * FROM tracking_links WHERE id = ?').get(result.lastInsertRowid);

    // Формируем полный URL
    const botUsername = process.env.BOT_USERNAME || 'your_bot';
    const miniAppName = process.env.MINIAPP_NAME || 'subscribe';
    const fullUrl = `https://t.me/${botUsername}/${miniAppName}?startapp=${shortCode}`;

    res.json({
        success: true,
        link: {
            ...link,
            full_url: fullUrl
        }
    });
});

// Удалить ссылку
router.delete('/:trackingCode/:linkId', verifyTelegramAuth, (req, res) => {
    const db = getDb();

    const channel = db.prepare(`
        SELECT id FROM channels WHERE tracking_code = ? AND owner_id = ?
    `).get(req.params.trackingCode, req.user.id);

    if (!channel) {
        return res.status(404).json({ success: false, error: 'Канал не найден' });
    }

    const result = db.prepare(`
        DELETE FROM tracking_links WHERE id = ? AND channel_id = ?
    `).run(req.params.linkId, channel.id);

    if (result.changes === 0) {
        return res.status(404).json({ success: false, error: 'Ссылка не найдена' });
    }

    res.json({ success: true, message: 'Ссылка удалена' });
});

function generateShortCode() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 10; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

module.exports = router;
