const express = require('express');
const router = express.Router();
const { getDb } = require('../config/database');
const { verifyTelegramAuth } = require('../middleware/auth');

// Получить все каналы пользователя
router.get('/', verifyTelegramAuth, (req, res) => {
    const db = getDb();
    const channels = db.prepare(`
        SELECT c.*,
            (SELECT COUNT(*) FROM subscriptions WHERE channel_id = c.id) as subscribers_count,
            (SELECT COUNT(*) FROM visits WHERE channel_id = c.id) as visits_count
        FROM channels c
        WHERE c.owner_id = ? AND c.is_active = 1
        ORDER BY c.created_at DESC
    `).all(req.user.id);

    res.json({ success: true, channels });
});

// Получить канал по tracking_code
router.get('/:trackingCode', verifyTelegramAuth, (req, res) => {
    const db = getDb();
    const channel = db.prepare(`
        SELECT c.*,
            (SELECT COUNT(*) FROM subscriptions WHERE channel_id = c.id) as subscribers_count,
            (SELECT COUNT(*) FROM visits WHERE channel_id = c.id) as visits_count
        FROM channels c
        WHERE c.tracking_code = ? AND c.owner_id = ?
    `).get(req.params.trackingCode, req.user.id);

    if (!channel) {
        return res.status(404).json({ success: false, error: 'Канал не найден' });
    }

    res.json({ success: true, channel });
});

// Обновить настройки канала (Яндекс Метрика, VK Pixel)
router.put('/:trackingCode', verifyTelegramAuth, (req, res) => {
    const { yandex_metrika_id, vk_pixel_id } = req.body;
    const db = getDb();

    const channel = db.prepare(`
        SELECT id FROM channels WHERE tracking_code = ? AND owner_id = ?
    `).get(req.params.trackingCode, req.user.id);

    if (!channel) {
        return res.status(404).json({ success: false, error: 'Канал не найден' });
    }

    db.prepare(`
        UPDATE channels SET yandex_metrika_id = ?, vk_pixel_id = ?
        WHERE id = ?
    `).run(yandex_metrika_id || null, vk_pixel_id || null, channel.id);

    res.json({ success: true, message: 'Настройки сохранены' });
});

// Получить статистику канала
router.get('/:trackingCode/stats', verifyTelegramAuth, (req, res) => {
    const { dateFrom, dateTo, groupBy } = req.query;
    const db = getDb();

    const channel = db.prepare(`
        SELECT id FROM channels WHERE tracking_code = ? AND owner_id = ?
    `).get(req.params.trackingCode, req.user.id);

    if (!channel) {
        return res.status(404).json({ success: false, error: 'Канал не найден' });
    }

    // Общая статистика
    const totals = db.prepare(`
        SELECT
            (SELECT COUNT(*) FROM visits WHERE channel_id = ?) as total_visits,
            (SELECT COUNT(*) FROM subscriptions WHERE channel_id = ?) as total_subscribers
    `).get(channel.id, channel.id);

    // Статистика по UTM
    const utmStats = db.prepare(`
        SELECT
            v.utm_source,
            v.utm_medium,
            v.utm_campaign,
            COUNT(DISTINCT v.id) as visits,
            COUNT(DISTINCT s.id) as subscribers,
            ROUND(COUNT(DISTINCT s.id) * 100.0 / NULLIF(COUNT(DISTINCT v.id), 0), 2) as conversion
        FROM visits v
        LEFT JOIN subscriptions s ON s.visit_id = v.id
        WHERE v.channel_id = ?
        ${dateFrom ? "AND v.visited_at >= ?" : ""}
        ${dateTo ? "AND v.visited_at <= ?" : ""}
        GROUP BY v.utm_source, v.utm_medium, v.utm_campaign
        ORDER BY visits DESC
    `).all(channel.id, ...[dateFrom, dateTo].filter(Boolean));

    // Статистика по дням
    const dailyStats = db.prepare(`
        SELECT
            DATE(v.visited_at) as date,
            COUNT(DISTINCT v.id) as visits,
            COUNT(DISTINCT s.id) as subscribers
        FROM visits v
        LEFT JOIN subscriptions s ON s.visit_id = v.id AND DATE(s.subscribed_at) = DATE(v.visited_at)
        WHERE v.channel_id = ?
        ${dateFrom ? "AND v.visited_at >= ?" : ""}
        ${dateTo ? "AND v.visited_at <= ?" : ""}
        GROUP BY DATE(v.visited_at)
        ORDER BY date DESC
        LIMIT 30
    `).all(channel.id, ...[dateFrom, dateTo].filter(Boolean));

    res.json({
        success: true,
        totals,
        utmStats,
        dailyStats
    });
});

// Получить список подписчиков
router.get('/:trackingCode/subscribers', verifyTelegramAuth, (req, res) => {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const db = getDb();

    const channel = db.prepare(`
        SELECT id FROM channels WHERE tracking_code = ? AND owner_id = ?
    `).get(req.params.trackingCode, req.user.id);

    if (!channel) {
        return res.status(404).json({ success: false, error: 'Канал не найден' });
    }

    const subscribers = db.prepare(`
        SELECT
            s.telegram_id,
            s.username,
            s.first_name,
            s.subscribed_at,
            v.utm_source,
            v.utm_medium,
            v.utm_campaign
        FROM subscriptions s
        LEFT JOIN visits v ON v.id = s.visit_id
        WHERE s.channel_id = ?
        ORDER BY s.subscribed_at DESC
        LIMIT ? OFFSET ?
    `).all(channel.id, limit, offset);

    const total = db.prepare(`
        SELECT COUNT(*) as count FROM subscriptions WHERE channel_id = ?
    `).get(channel.id);

    res.json({
        success: true,
        subscribers,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total: total.count
        }
    });
});

module.exports = router;
