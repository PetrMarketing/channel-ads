const { Bot, webhookCallback } = require('grammy');
const { getDb } = require('../config/database');

let bot = null;

function initBot() {
    const token = process.env.BOT_TOKEN;
    if (!token) {
        console.warn('BOT_TOKEN not set, bot features disabled');
        return null;
    }

    bot = new Bot(token);

    // Команда /start
    bot.command('start', async (ctx) => {
        const user = ctx.from;
        const db = getDb();

        // Сохраняем или обновляем пользователя
        db.prepare(`
            INSERT INTO users (telegram_id, username, first_name)
            VALUES (?, ?, ?)
            ON CONFLICT(telegram_id) DO UPDATE SET
                username = excluded.username,
                first_name = excluded.first_name
        `).run(user.id, user.username, user.first_name);

        await ctx.reply(
            '👋 Привет! Я помогу отслеживать подписчиков твоих Telegram каналов.\n\n' +
            '📊 Возможности:\n' +
            '• Отслеживание источников подписчиков (UTM метки)\n' +
            '• Интеграция с Яндекс Метрикой\n' +
            '• Интеграция с VK Pixel\n' +
            '• Детальная статистика в личном кабинете\n\n' +
            '➡️ Добавьте меня администратором в ваш канал, чтобы начать отслеживание.',
            {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '📈 Открыть личный кабинет', web_app: { url: process.env.APP_URL + '/dashboard' } }
                    ]]
                }
            }
        );
    });

    // Бот добавлен/удалён из канала
    bot.on('my_chat_member', async (ctx) => {
        const chat = ctx.chat;
        const newStatus = ctx.myChatMember.new_chat_member.status;
        const fromUser = ctx.from;
        const db = getDb();

        if (chat.type === 'channel') {
            if (newStatus === 'administrator') {
                // Бот добавлен как админ
                console.log(`[Bot] Added to channel: ${chat.title} (${chat.id})`);

                // Находим или создаём пользователя
                let user = db.prepare('SELECT id FROM users WHERE telegram_id = ?').get(fromUser.id);
                if (!user) {
                    const result = db.prepare(`
                        INSERT INTO users (telegram_id, username, first_name)
                        VALUES (?, ?, ?)
                    `).run(fromUser.id, fromUser.username, fromUser.first_name);
                    user = { id: result.lastInsertRowid };
                }

                // Генерируем уникальный код для канала
                const trackingCode = generateTrackingCode();

                // Сохраняем канал
                db.prepare(`
                    INSERT INTO channels (channel_id, title, username, owner_id, tracking_code)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(channel_id) DO UPDATE SET
                        title = excluded.title,
                        username = excluded.username,
                        is_active = 1
                `).run(chat.id, chat.title, chat.username, user.id, trackingCode);

                // Уведомляем владельца
                try {
                    await bot.api.sendMessage(fromUser.id,
                        `✅ Канал "${chat.title}" успешно подключен!\n\n` +
                        `🔗 Код отслеживания: ${trackingCode}\n\n` +
                        `Откройте личный кабинет для настройки Яндекс Метрики, VK Pixel и создания ссылок.`,
                        {
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: '⚙️ Настроить канал', web_app: { url: `${process.env.APP_URL}/channel/${trackingCode}` } }
                                ]]
                            }
                        }
                    );
                } catch (e) {
                    console.error('[Bot] Failed to notify owner:', e.message);
                }

            } else if (newStatus === 'left' || newStatus === 'kicked') {
                // Бот удалён из канала
                console.log(`[Bot] Removed from channel: ${chat.title} (${chat.id})`);

                db.prepare(`
                    UPDATE channels SET is_active = 0 WHERE channel_id = ?
                `).run(chat.id);
            }
        }
    });

    // Новый подписчик в канале
    bot.on('chat_member', async (ctx) => {
        const chat = ctx.chat;
        const member = ctx.chatMember;
        const newMember = member.new_chat_member;
        const oldStatus = member.old_chat_member.status;
        const newStatus = newMember.status;

        // Проверяем что это подписка (не был подписан -> подписался)
        const wasNotMember = ['left', 'kicked'].includes(oldStatus);
        const isMember = ['member', 'administrator', 'creator'].includes(newStatus);

        if (wasNotMember && isMember && chat.type === 'channel') {
            const db = getDb();
            const user = newMember.user;

            console.log(`[Bot] New subscriber in ${chat.title}: ${user.username || user.id}`);

            // Находим канал
            const channel = db.prepare('SELECT id FROM channels WHERE channel_id = ?').get(chat.id);
            if (!channel) return;

            // Ищем визит этого пользователя (последний за 7 дней)
            const visit = db.prepare(`
                SELECT id, utm_source, utm_medium, utm_campaign, utm_content, utm_term
                FROM visits
                WHERE channel_id = ? AND telegram_id = ?
                AND visited_at > datetime('now', '-7 days')
                ORDER BY visited_at DESC
                LIMIT 1
            `).get(channel.id, user.id);

            // Сохраняем подписку
            try {
                db.prepare(`
                    INSERT INTO subscriptions (channel_id, telegram_id, username, first_name, visit_id)
                    VALUES (?, ?, ?, ?, ?)
                `).run(channel.id, user.id, user.username, user.first_name, visit?.id || null);

                console.log(`[Bot] Subscription recorded for ${user.id}, visit_id: ${visit?.id || 'none'}`);
            } catch (e) {
                if (!e.message.includes('UNIQUE constraint')) {
                    console.error('[Bot] Error saving subscription:', e.message);
                }
            }
        }
    });

    return bot;
}

function generateTrackingCode() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function getBot() {
    return bot;
}

function getWebhookCallback() {
    if (!bot) return null;
    return webhookCallback(bot, 'express');
}

module.exports = { initBot, getBot, getWebhookCallback };
