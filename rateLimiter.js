// ==========================================
// rateLimiter.js — Ограничение частоты событий
// ==========================================

class RateLimiter {
    constructor() {
        // socketId → { eventName → lastTimestamp }
        this._map = new Map();
    }

    // Лимиты: событие → минимальный интервал в мс
    // GM-события не ограничиваются (GM — авторизован)
    static LIMITS = {
        'send_radio':        2000,
        'send_dm':           1000,
        'player_login':      3000,
        'player_reply':      1000,
        'player_update_state':500,
    };

    /**
     * Проверяет, можно ли выполнить событие.
     * @returns {boolean} true — можно, false — заблокировано
     */
    check(socketId, eventName) {
        const minInterval = RateLimiter.LIMITS[eventName];
        if (!minInterval) return true; // нет лимита для этого события

        const now = Date.now();

        if (!this._map.has(socketId)) {
            this._map.set(socketId, {});
        }

        const socketLimits = this._map.get(socketId);
        const lastTime = socketLimits[eventName] || 0;

        if (now - lastTime < minInterval) {
            return false; // слишком рано
        }

        socketLimits[eventName] = now;
        return true;
    }

    /**
     * Удалить данные для отключившегося сокета
     */
    remove(socketId) {
        this._map.delete(socketId);
    }

    /**
     * Количество отслеживаемых сокетов (для диагностики)
     */
    get size() {
        return this._map.size;
    }
}

module.exports = RateLimiter;
