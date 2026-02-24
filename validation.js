// ==========================================
// validation.js — Валидация входящих данных
// ==========================================

const LIMITS = {
    USERNAME_MAX:    20,
    MESSAGE_MAX:     2000,
    LABEL_MAX:       40,
    NPC_NAME_MAX:    60,
    RADIO_SENDER_MAX:60,
    QUEST_TEXT_MAX:  500,
    MAX_QUESTS:      20,
    MAX_RADIO:       500,
    MAX_DM_PER_PLAYER:200,
};

// Допустимые типы маркеров
const VALID_MARKER_TYPES = new Set([
    'quest_normal', 'quest_important', 'quest_critical',
    'skull', 'star', 'exclamation', 'eye', 'flag', 'cross_gm',
]);

// Допустимые цвета маркеров
const VALID_MARKER_COLORS = new Set([
    '#ff6b35', '#ff3333', '#ffd700', '#4af626',
    '#00bfff', '#ff69b4', '#ffffff',
]);

function isString(v, maxLen) {
    if (typeof v !== 'string') return null;
    return v.substring(0, maxLen || 200);
}

function isNonEmptyString(v, maxLen) {
    const s = isString(v, maxLen);
    if (!s || !s.trim()) return null;
    return s.trim();
}

function isNumber(v, min, max) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (min !== undefined && n < min) return null;
    if (max !== undefined && n > max) return null;
    return n;
}

function isValidMarkerId(id) {
    return typeof id === 'string' && /^gm_\d+$/.test(id);
}

function isValidMarkerType(type) {
    return VALID_MARKER_TYPES.has(type);
}

function isValidMarkerColor(color) {
    return VALID_MARKER_COLORS.has(color);
}

// Валидация данных для добавления маркера на карту
function validateMarkerData(data, playersState) {
    if (!data || typeof data !== 'object') return null;

    const type = isValidMarkerType(data.type) ? data.type : 'quest_normal';
    const nx = isNumber(data.nx, 0, 1);
    const ny = isNumber(data.ny, 0, 1);
    if (nx === null || ny === null) return null;

    const color = isValidMarkerColor(data.color) ? data.color : '#4af626';
    const label = isString(data.label, LIMITS.LABEL_MAX) || '';
    const linkedQuest = isString(data.linkedQuest, LIMITS.QUEST_TEXT_MAX) || null;

    // linkedPlayers — массив валидных ID
    let linkedPlayers = [];
    if (Array.isArray(data.linkedPlayers)) {
        linkedPlayers = data.linkedPlayers
            .filter(id => typeof id === 'string' && playersState[id])
            .slice(0, 10);
    } else if (typeof data.linkedPlayer === 'string' && playersState[data.linkedPlayer]) {
        linkedPlayers = [data.linkedPlayer];
    }

    return { type, nx, ny, color, label, linkedQuest, linkedPlayers };
}

// Валидация данных ЛС
function validateDMData(data) {
    if (!data || typeof data !== 'object') return null;

    const targetId = isNonEmptyString(data.targetId, 100);
    if (!targetId) return null;

    const npcName = isNonEmptyString(data.npcName, LIMITS.NPC_NAME_MAX) || 'НЕИЗВЕСТНЫЙ';
    const message = isNonEmptyString(data.message, LIMITS.MESSAGE_MAX);
    if (!message) return null;

    return { targetId, npcName, message };
}

// Валидация данных радио
function validateRadioData(data) {
    if (!data || typeof data !== 'object') return null;

    const message = isNonEmptyString(data.message, LIMITS.MESSAGE_MAX);
    if (!message) return null;

    const sender = isNonEmptyString(data.sender, LIMITS.RADIO_SENDER_MAX) || 'СИСТЕМА СТОЙЛА';

    return { sender, message };
}

// Валидация ответа игрока
function validatePlayerReply(data) {
    if (!data || typeof data !== 'object') return null;

    const playerId = isNonEmptyString(data.playerId, 100);
    if (!playerId) return null;

    const message = isNonEmptyString(data.message, LIMITS.MESSAGE_MAX);
    if (!message) return null;

    const targetNpc = isNonEmptyString(data.targetNpc, LIMITS.NPC_NAME_MAX) || 'НЕИЗВЕСТНЫЙ';

    return { playerId, message, targetNpc };
}

// Валидация username при логине
function validateUsername(raw) {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > LIMITS.USERNAME_MAX) return null;
    return trimmed;
}

// Генерация playerId из username
function usernameToPlayerId(username) {
    return username
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^\p{L}0-9_]/gu, '');
}

// Валидация обновления state игрока
function validateStateUpdate(data, playersState) {
    if (!data || typeof data !== 'object') return null;

    const playerId = isNonEmptyString(data.playerId, 100);
    if (!playerId || !playersState[playerId]) return null;

    const newState = data.newState;
    if (!newState || typeof newState !== 'object') return null;

    // Проверяем разумность: не более 10 модулей, ключи — строки
    const keys = Object.keys(newState);
    if (keys.length > 10) return null;

    // Проверяем лимит квестов
    if (newState.home && Array.isArray(newState.home.quests)) {
        if (newState.home.quests.length > LIMITS.MAX_QUESTS) {
            newState.home.quests = newState.home.quests.slice(0, LIMITS.MAX_QUESTS);
        }
        // Обрезаем текст каждого квеста
        newState.home.quests = newState.home.quests
            .filter(q => typeof q === 'string')
            .map(q => q.substring(0, LIMITS.QUEST_TEXT_MAX));
    }

    return { playerId, newState };
}

module.exports = {
    LIMITS,
    isString,
    isNonEmptyString,
    isNumber,
    isValidMarkerId,
    isValidMarkerType,
    isValidMarkerColor,
    validateMarkerData,
    validateDMData,
    validateRadioData,
    validatePlayerReply,
    validateUsername,
    usernameToPlayerId,
    validateStateUpdate,
};
