require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const { initDatabase } = require('./config/database');
const { initBot, getWebhookCallback } = require('./bot');

// Initialize database
initDatabase();

// Initialize bot
const bot = initBot();

// Create Express app
const app = express();

// Security
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false
}));

// CORS
app.use(cors({
    origin: '*',
    credentials: true
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Telegram webhook
if (bot) {
    app.use('/webhook/telegram', getWebhookCallback());
}

// API Routes
app.use('/api/channels', require('./routes/channels'));
app.use('/api/links', require('./routes/links'));
app.use('/api/track', require('./routes/tracking'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Channel Ads API',
        botConnected: !!bot
    });
});

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// SPA fallback
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../frontend/index.html'));
    } else {
        res.status(404).json({ success: false, error: 'Endpoint not found' });
    }
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'development' ? err.message : 'Внутренняя ошибка сервера'
    });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║       Channel Ads Tracker Backend             ║
╠═══════════════════════════════════════════════╣
║  Server running on port: ${PORT}                  ║
║  Bot: ${bot ? 'Connected' : 'Not configured'}                          ║
╚═══════════════════════════════════════════════╝
    `);

    // Set webhook for bot (if in production)
    if (bot && process.env.NODE_ENV === 'production' && process.env.APP_URL) {
        try {
            await bot.api.setWebhook(`${process.env.APP_URL}/webhook/telegram`);
            console.log('Telegram webhook set');
        } catch (e) {
            console.error('Failed to set webhook:', e.message);
        }
    } else if (bot) {
        // Start polling in development
        bot.start();
        console.log('Bot started in polling mode');
    }
});

module.exports = app;
