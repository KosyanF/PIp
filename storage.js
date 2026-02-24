// ==========================================
// storage.js — Асинхронный storage layer
// ==========================================
//
// - Атомарная запись (temp file → rename)
// - Debounce: множественные save за 100мс → одна запись
// - Ротация данных (лимиты на радио/ЛС)
// ==========================================

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { LIMITS } = require('./validation');

const DATA_DIR  = path.join(__dirname, 'data');
const FILES = {
    radio:   path.join(DATA_DIR, 'radio.json'),
    dm:      path.join(DATA_DIR, 'dm_history.json'),
    players: path.join(DATA_DIR, 'players.json'),
    markers: path.join(DATA_DIR, 'map_markers.json'),
};

// ── Инициализация ──

function ensureDataFiles() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILES.radio))   fs.writeFileSync(FILES.radio,   '[]');
    if (!fs.existsSync(FILES.dm))      fs.writeFileSync(FILES.dm,      '{}');
    if (!fs.existsSync(FILES.players)) fs.writeFileSync(FILES.players, '{}');
    if (!fs.existsSync(FILES.markers)) fs.writeFileSync(FILES.markers, '[]');
}

function loadSync(key) {
    try {
        return JSON.parse(fs.readFileSync(FILES[key], 'utf8'));
    } catch (e) {
        console.error(`[STORAGE] Ошибка чтения ${key}:`, e.message);
        const fallbacks = { radio: [], dm: {}, players: {}, markers: [] };
        return fallbacks[key];
    }
}

// ── Асинхронная атомарная запись ──

const _pendingWrites = new Map(); // key → timeout
const _writeQueue    = new Map(); // key → data (последнее значение)

const DEBOUNCE_MS = 100;

async function _doWrite(key) {
    const data = _writeQueue.get(key);
    if (data === undefined) return;
    _writeQueue.delete(key);

    const filePath = FILES[key];
    const tmpPath  = filePath + '.tmp';

    try {
        const json = JSON.stringify(data, null, 2);
        await fsp.writeFile(tmpPath, json, 'utf8');
        await fsp.rename(tmpPath, filePath);
    } catch (e) {
        console.error(`[STORAGE] Ошибка записи ${key}:`, e.message);
        // Попытка удалить tmp файл
        try { await fsp.unlink(tmpPath); } catch (_) {}
    }
}

function save(key, data) {
    _writeQueue.set(key, data);

    if (_pendingWrites.has(key)) {
        clearTimeout(_pendingWrites.get(key));
    }

    _pendingWrites.set(key, setTimeout(() => {
        _pendingWrites.delete(key);
        _doWrite(key);
    }, DEBOUNCE_MS));
}

// ── Принудительный flush (для graceful shutdown) ──

async function flushAll() {
    // Очистить все pending таймеры и записать немедленно
    for (const [key, timeout] of _pendingWrites) {
        clearTimeout(timeout);
    }
    _pendingWrites.clear();

    const promises = [];
    for (const [key] of _writeQueue) {
        promises.push(_doWrite(key));
    }
    await Promise.all(promises);
}

// ── Ротация данных ──

function rotateRadio(radioHistory) {
    if (radioHistory.length > LIMITS.MAX_RADIO) {
        radioHistory.splice(0, radioHistory.length - LIMITS.MAX_RADIO);
    }
    return radioHistory;
}

function rotateDM(dmHistory, playerId) {
    if (dmHistory[playerId] && dmHistory[playerId].length > LIMITS.MAX_DM_PER_PLAYER) {
        dmHistory[playerId] = dmHistory[playerId].slice(-LIMITS.MAX_DM_PER_PLAYER);
    }
    return dmHistory;
}

// ── Convenience методы ──

module.exports = {
    ensureDataFiles,

    loadPlayers:  () => loadSync('players'),
    loadRadio:    () => loadSync('radio'),
    loadDM:       () => loadSync('dm'),
    loadMarkers:  () => loadSync('markers'),

    savePlayers:  (data) => save('players', data),
    saveRadio:    (data) => save('radio', data),
    saveDM:       (data) => save('dm', data),
    saveMarkers:  (data) => save('markers', data),

    rotateRadio,
    rotateDM,
    flushAll,

    // Экспорт для тестирования
    _FILES: FILES,
};
