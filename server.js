// ==========================================
// Pip-Buck SERVER v8 — Thin entry point
// Логика обработчиков — в socketHandlers.js
// ==========================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const storage = require('./storage');
const RateLimiter = require('./rateLimiter');
const log = require('./logger');
const setupSocketHandlers = require('./socketHandlers');

// ===== КОНФИГ =====

const CONFIG_PATH = path.join(__dirname, 'config', 'settings.json');
let config = { port: 3000, maxPlayers: 5, gmPassword: 'admin' };
try {
    config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
} catch (e) {
    log.warn('CONFIG', 'settings.json не найден, значения по умолчанию');
}

const PORT = process.env.PORT || config.port || 3000;
const GM_PASSWORD = process.env.GM_PASSWORD || config.gmPassword || 'admin';

// ===== ИНИЦИАЛИЗАЦИЯ =====

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rateLimiter = new RateLimiter();

app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

storage.ensureDataFiles();

let radioHistory = storage.loadRadio();
let dmHistory    = storage.loadDM();
let playersState = storage.loadPlayers();
let gmMapMarkers = storage.loadMarkers();

// ===== КОНТЕКСТ ДЛЯ ОБРАБОТЧИКОВ =====

const ctx = {
    rateLimiter, storage, GM_PASSWORD, config,
    // Геттеры для мутабельных данных (обработчики работают по ссылке)
    playersState: () => playersState,
    dmHistory:    () => dmHistory,
    radioHistory: () => radioHistory,
    gmMapMarkers: () => gmMapMarkers,
    // Мутаторы для массивов (clear/push/filter — меняют ссылку)
    _pushMarker(m) { gmMapMarkers.push(m); storage.saveMarkers(gmMapMarkers); },
    _removeMarker(id) { gmMapMarkers = gmMapMarkers.filter(m => m.id !== id); storage.saveMarkers(gmMapMarkers); },
    _clearMarkers() { gmMapMarkers = []; storage.saveMarkers(gmMapMarkers); },
    _clearRadio() { radioHistory = []; storage.saveRadio(radioHistory); },
};

// ===== SOCKET =====

io.on('connection', (socket) => setupSocketHandlers(io, socket, ctx));

// ===== GRACEFUL SHUTDOWN =====

async function shutdown(signal) {
    log.info('SERVER', `${signal}, завершение...`);
    try { await storage.flushAll(); log.info('SERVER', 'Данные сохранены'); }
    catch (e) { log.error('SERVER', 'Ошибка сохранения', e.message); }
    server.close(() => { log.info('SERVER', 'Остановлен'); process.exit(0); });
    setTimeout(() => process.exit(1), 5000);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ===== ЗАПУСК =====

server.listen(PORT, () => {
    log.info('SERVER', '=========================================');
    log.info('SERVER', `Stable-Tec Server / Pip-Buck v8 запущен`);
    log.info('SERVER', `Адрес: http://localhost:${PORT}`);
    log.info('SERVER', `Макс. игроков: ${config.maxPlayers}`);
    log.info('SERVER', '=========================================');
});
