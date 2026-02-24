// ==========================================
// appState.js — Централизованное состояние
// ==========================================
// Паттерн Observable store.
// Заменяет: window.radioLog, window.dmLog, window.mapState,
//           window.modules, window.currentTab, myId, myState,
//           window.gmDmLog, gmPlayersData
// ==========================================

(function () {
    'use strict';

    const _state = {
        // Игрок
        playerId:    null,
        playerState: null,
        currentTab:  null,

        // Данные
        radioLog:    [],
        dmLog:       [],
        mapState:    { gmMarkers: [] },

        // GM
        gmPlayersData: {},
        gmDmLog:       {},

        // Модули (регистрируются при загрузке)
        modules: {},
    };

    const _listeners = new Map(); // key → Set<callback>

    const AppState = {
        get(key) {
            return _state[key];
        },

        set(key, value) {
            const old = _state[key];
            _state[key] = value;
            _notify(key, value, old);
        },

        /**
         * Обновить вложенное значение (merge на первом уровне)
         * Пример: AppState.merge('mapState', { gmMarkers: [...] })
         */
        merge(key, partial) {
            if (typeof _state[key] === 'object' && _state[key] !== null) {
                _state[key] = { ..._state[key], ...partial };
            } else {
                _state[key] = partial;
            }
            _notify(key, _state[key]);
        },

        /**
         * Подписаться на изменения ключа.
         * callback(newValue, oldValue)
         * Возвращает функцию отписки.
         */
        subscribe(key, callback) {
            if (!_listeners.has(key)) _listeners.set(key, new Set());
            _listeners.get(key).add(callback);
            return () => _listeners.get(key)?.delete(callback);
        },

        /**
         * Одноразовый вызов всех слушателей ключа
         */
        notify(key) {
            _notify(key, _state[key]);
        },
    };

    function _notify(key, value, old) {
        const set = _listeners.get(key);
        if (!set) return;
        for (const cb of set) {
            try { cb(value, old); } catch (e) { console.error('[AppState] Ошибка в слушателе:', key, e); }
        }
    }

    // ── Совместимость: сохраняем window-алиасы для модулей, которые ещё не переведены ──
    // Эти getter/setter делегируют в AppState, убирая необходимость менять всё сразу.

    Object.defineProperty(window, 'radioLog', {
        get() { return AppState.get('radioLog'); },
        set(v) { AppState.set('radioLog', v); },
        configurable: true,
    });

    Object.defineProperty(window, 'dmLog', {
        get() { return AppState.get('dmLog'); },
        set(v) { AppState.set('dmLog', v); },
        configurable: true,
    });

    Object.defineProperty(window, 'mapState', {
        get() { return AppState.get('mapState'); },
        set(v) { AppState.set('mapState', v); },
        configurable: true,
    });

    Object.defineProperty(window, 'modules', {
        get() { return AppState.get('modules'); },
        set(v) { AppState.set('modules', v); },
        configurable: true,
    });

    Object.defineProperty(window, 'currentTab', {
        get() { return AppState.get('currentTab'); },
        set(v) { AppState.set('currentTab', v); },
        configurable: true,
    });

    Object.defineProperty(window, 'gmDmLog', {
        get() { return AppState.get('gmDmLog'); },
        set(v) { AppState.set('gmDmLog', v); },
        configurable: true,
    });

    // Expose globally
    window.AppState = AppState;

})();
