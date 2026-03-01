// ==========================================
// discord.js — Discord Bot уведомления
// ==========================================
//
// Два режима доставки:
//
// 1. ЛС → Discord DM (личное сообщение через бота)
//    Пользователь указывает свой Discord User ID при логине.
//    Бот отправляет DM — видит только получатель.
//
// 2. Радио → Канал (embed в указанный текстовый канал)
//    Если канал не настроен — fallback на webhook.
//
// Конфигурация (settings.json → discord):
//   botToken     — токен бота
//   channelId    — ID канала для радиосводок
//   webhookUrl   — fallback для радио если бот не подключён
//   enabled      — true/false
//
// Также поддерживает env: DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID, DISCORD_WEBHOOK
// ==========================================

const https = require('https');

let log = { info: () => {}, warn: () => {} };

// ── State ──
let client = null;     // discord.js Client
let botReady = false;
let channelId = null;
let webhookUrl = null;

// ── Init ──

function init(logger, config) {
    if (logger) log = logger;

    const dc = config?.discord || {};
    const token = dc.botToken || process.env.DISCORD_BOT_TOKEN || '';
    channelId = dc.channelId || process.env.DISCORD_CHANNEL_ID || '';
    webhookUrl = dc.webhookUrl || process.env.DISCORD_WEBHOOK
        || 'https://discord.com/api/webhooks/1475949157159010466/D-H4aVEOQ5D_tlAzABPXY5qtBXbUAxsBvezeN7lDTKjB7WlsOBOeWrPKkyii0fKjuCtf';

    if (dc.enabled === false) {
        log.info('DISCORD', 'Отключён в конфиге');
        return;
    }

    if (!token) {
        log.info('DISCORD', 'Bot token не задан — только webhook для радио, DM недоступны');
        return;
    }

    // Ленивая загрузка discord.js — не ломает сервер если пакет не установлен
    try {
        const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

        client = new Client({
            intents: [GatewayIntentBits.Guilds],
        });

        client.once('ready', () => {
            botReady = true;
            log.info('DISCORD', `Бот подключён: ${client.user.tag}`);
        });

        client.on('error', err => {
            log.warn('DISCORD', `Ошибка клиента: ${err.message}`);
        });

        client.login(token).catch(err => {
            log.warn('DISCORD', `Не удалось войти: ${err.message}`);
            client = null;
        });

    } catch (err) {
        log.warn('DISCORD', `discord.js не установлен: ${err.message}. Используйте: npm install discord.js`);
        client = null;
    }
}

// ── Helpers ──

function makeEmbed(title, description, color, fields, footer) {
    // Работает и с discord.js EmbedBuilder, и с обычным объектом
    const embed = {
        title,
        description,
        color,
        fields: fields || [],
        footer: footer ? { text: footer } : undefined,
        timestamp: new Date().toISOString(),
    };
    return embed;
}

/**
 * Fallback: отправить через webhook (для радио если бот не подключён)
 */
function sendWebhook(payload) {
    return new Promise((resolve) => {
        if (!webhookUrl) { resolve(false); return; }

        try {
            const parsed = new URL(webhookUrl);
            const postData = JSON.stringify(payload);

            const req = https.request({
                hostname: parsed.hostname,
                port: 443,
                path: parsed.pathname + parsed.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                },
            }, (res) => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(true);
                    } else {
                        log.warn('DISCORD', `Webhook ${res.statusCode}: ${body.substring(0, 200)}`);
                        resolve(false);
                    }
                });
            });

            req.on('error', (err) => {
                log.warn('DISCORD', `Webhook ошибка: ${err.message}`);
                resolve(false);
            });

            req.setTimeout(5000, () => { req.destroy(); resolve(false); });
            req.write(postData);
            req.end();
        } catch (err) {
            log.warn('DISCORD', `Webhook exception: ${err.message}`);
            resolve(false);
        }
    });
}

// ── Public API ──

/**
 * ЛС → Discord DM (личное сообщение, видит только получатель)
 *
 * @param {string} playerName  — Имя игрока в Pip-Boy
 * @param {string} discordId   — Discord User ID (числовой, 17-20 цифр)
 * @param {string} npcName     — Имя НПС-отправителя
 * @param {string} message     — Текст сообщения
 */
async function notifyDM(playerName, discordId, npcName, message) {
    if (!discordId || !botReady || !client) return false;

    // Validate Discord User ID format
    if (!/^\d{17,20}$/.test(discordId)) {
        log.warn('DISCORD', `Невалидный Discord ID: ${discordId} (игрок: ${playerName})`);
        return false;
    }

    try {
        const user = await client.users.fetch(discordId);
        if (!user) {
            log.warn('DISCORD', `Пользователь не найден: ${discordId}`);
            return false;
        }

        const msgPreview = message.length > 300 ? message.substring(0, 300) + '...' : message;

        const embed = makeEmbed(
            '📨 Новое сообщение в Pip-Boy',
            `**${npcName}** отправил вам сообщение:`,
            0x4af626,
            [
                { name: 'Сообщение', value: msgPreview },
                { name: 'Персонаж', value: playerName, inline: true },
            ],
            'Stable-Tec Messaging System'
        );

        await user.send({ embeds: [embed] });
        log.info('DISCORD', `DM: ${npcName} → ${playerName} (${discordId})`);
        return true;

    } catch (err) {
        // 50007 = Cannot send messages to this user (DMs закрыты)
        if (err.code === 50007) {
            log.warn('DISCORD', `DM закрыты у ${discordId} (${playerName})`);
        } else {
            log.warn('DISCORD', `DM ошибка: ${err.message}`);
        }
        return false;
    }
}

/**
 * Радио → Канал (или webhook fallback)
 *
 * @param {string} sender  — Имя станции
 * @param {string} message — Текст передачи
 */
async function notifyRadio(sender, message) {
    const msgPreview = message.length > 800 ? message.substring(0, 800) + '...' : message;

    const embed = makeEmbed(
        '📻 Радиосводка',
        msgPreview,
        0xffd700,
        [{ name: 'Передатчик', value: sender, inline: true }],
        'Stable-Tec Radio Network'
    );

    // Попробовать через бота в канал
    if (botReady && client && channelId) {
        try {
            const channel = await client.channels.fetch(channelId);
            if (channel && channel.isTextBased()) {
                await channel.send({ embeds: [embed] });
                log.info('DISCORD', `Радио в канал: ${sender}`);
                return true;
            }
        } catch (err) {
            log.warn('DISCORD', `Канал ошибка: ${err.message}, fallback на webhook`);
        }
    }

    // Fallback: webhook
    if (webhookUrl) {
        const payload = {
            username: 'Stable-Tec Radio',
            embeds: [embed],
        };
        const ok = await sendWebhook(payload);
        if (ok) log.info('DISCORD', `Радио webhook: ${sender}`);
        return ok;
    }

    return false;
}

module.exports = { init, notifyDM, notifyRadio };
