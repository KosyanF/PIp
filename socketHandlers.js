// ==========================================
// socketHandlers.js — Все обработчики сокетов
// Фаза 3.3: Модуляризация
// ==========================================

const log = require('./logger');
const V = require('./validation');

module.exports = function setupSocketHandlers(io, socket, ctx) {
    const { rateLimiter, playersState, dmHistory, radioHistory, gmMapMarkers, storage, GM_PASSWORD, config } = ctx;

    function rateCheck(event) {
        if (!rateLimiter.check(socket.id, event)) {
            log.debug('RATE', `Заблокировано: ${event} от ${socket.id}`);
            return false;
        }
        return true;
    }

    function requireGM() {
        if (socket.data.role !== 'gm') {
            log.warn('AUTH', `Отклонено: не-GM сокет ${socket.id}`);
            return false;
        }
        return true;
    }

    function requirePlayer(playerId) {
        if (socket.data.role !== 'player') return false;
        if (socket.data.playerId !== playerId) {
            log.warn('AUTH', `Отклонено: ${socket.data.playerId} → ${playerId}`);
            return false;
        }
        return true;
    }

    function updatePlayerState(playerId, newState) {
        if (!playersState()[playerId]) return false;
        const ps = playersState();
        if (!ps[playerId].state) ps[playerId].state = {};
        for (const mod in newState) {
            ps[playerId].state[mod] = { ...(ps[playerId].state[mod] || {}), ...newState[mod] };
        }
        storage.savePlayers(ps);
        io.to(playerId).emit('server_event', { type: 'state_update', target: playerId, payload: ps[playerId].state });
        io.emit('gm_update_players', ps);
        return true;
    }

    // ===== LOGIN ИГРОКА =====
    socket.on('player_login', (data) => {
        if (!rateCheck('player_login')) return;
        const username = V.validateUsername(data?.username);
        if (!username) { socket.emit('login_error', 'Введите корректное имя.'); return; }
        const playerId = V.usernameToPlayerId(username);
        if (!playerId) { socket.emit('login_error', 'Некорректное имя.'); return; }
        const ps = playersState();
        if (!ps[playerId]) {
            if (Object.keys(ps).length >= config.maxPlayers) { socket.emit('login_error', 'Достигнут лимит жителей Стойла.'); return; }
        }
        // Уникальность сессии
        const room = io.sockets.adapter.rooms.get(playerId);
        if (room && room.size > 0) {
            for (const sid of room) {
                const old = io.sockets.sockets.get(sid);
                if (old && old.id !== socket.id) {
                    old.leave(playerId); old.emit('login_error', 'Выполнен вход с другого устройства.');
                    old.data.role = null; old.data.playerId = null;
                    log.info('AUTH', `Сессия ${sid} вытеснена для ${playerId}`);
                }
            }
        }
        if (ps[playerId]) { ps[playerId].username = username; }
        else { ps[playerId] = { id: playerId, username, state: {} }; log.info('AUTH', `Новый игрок: ${username}`); }
        storage.savePlayers(ps);
        socket.data.role = 'player'; socket.data.playerId = playerId; socket.join(playerId);
        socket.emit('login_success', { id: playerId, username, state: ps[playerId].state });
        socket.emit('radio_history', radioHistory());
        socket.emit('dm_history', dmHistory()[playerId] || []);
        socket.emit('map_init', { gmMarkers: gmMapMarkers() });
        io.emit('gm_update_players', ps);
        log.info('AUTH', `Вход: ${username} (${playerId})`);
    });

    // ===== LOGIN GM =====
    socket.on('gm_login', (pass) => {
        if (pass === GM_PASSWORD) {
            socket.data.role = 'gm';
            socket.emit('gm_login_success', { players: playersState() });
            socket.emit('radio_history', radioHistory());
            socket.emit('gm_dm_history', dmHistory());
            socket.emit('map_init', { gmMarkers: gmMapMarkers() });
            log.info('AUTH', `GM авторизован: ${socket.id}`);
        } else {
            socket.emit('login_error', 'ОШИБКА: ОТКАЗАНО В ДОСТУПЕ');
            log.warn('AUTH', `Неудачная попытка GM: ${socket.id}`);
        }
    });

    // ===== КАРТА =====
    socket.on('map_request_init', () => { socket.emit('map_init', { gmMarkers: gmMapMarkers() }); });

    socket.on('gm_add_map_marker', (markerData) => {
        if (!requireGM() || !rateCheck('gm_add_map_marker')) return;
        const v = V.validateMarkerData(markerData, playersState());
        if (!v) return;
        const marker = { id: 'gm_' + Date.now(), type: v.type, nx: v.nx, ny: v.ny, label: v.label, color: v.color, linkedQuest: v.linkedQuest, linkedPlayers: v.linkedPlayers };
        ctx._pushMarker(marker);
        io.emit('map_gm_marker_add', marker);
        for (const pid of v.linkedPlayers) {
            io.to(pid).emit('server_event', { type: 'quest_marker_added', payload: { markerId: marker.id, questText: marker.linkedQuest } });
        }
        log.info('GM', `Метка: ${marker.type} "${marker.label}"`);
    });

    socket.on('gm_remove_map_marker', (markerId) => {
        if (!requireGM()) return;
        if (!V.isValidMarkerId(markerId)) return;
        ctx._removeMarker(markerId);
        io.emit('map_gm_marker_remove', markerId);
        log.info('GM', `Метка удалена: ${markerId}`);
    });

    socket.on('gm_clear_map_markers', () => {
        if (!requireGM()) return;
        ctx._clearMarkers();
        io.emit('map_gm_markers_all', []);
        log.info('GM', 'Метки очищены');
    });

    // ===== STATE =====
    socket.on('gm_update_player', (data) => {
        if (!requireGM() || !rateCheck('gm_update_player')) return;
        const v = V.validateStateUpdate(data, playersState());
        if (!v) return;
        updatePlayerState(v.playerId, v.newState);
        log.info('GM', `State: ${v.playerId}`);
    });

    socket.on('player_update_state', (data) => {
        if (!rateCheck('player_update_state')) return;
        const v = V.validateStateUpdate(data, playersState());
        if (!v) return;
        if (!requirePlayer(v.playerId)) return;
        updatePlayerState(v.playerId, v.newState);
    });

    // ===== ЛС =====
    socket.on('send_dm', (data) => {
        if (!requireGM() || !rateCheck('send_dm')) return;
        const v = V.validateDMData(data);
        if (!v || !playersState()[v.targetId]) return;
        const msg = { npcName: v.npcName, message: v.message, timestamp: new Date().toLocaleTimeString('ru-RU') };
        const dm = dmHistory();
        if (!dm[v.targetId]) dm[v.targetId] = [];
        dm[v.targetId].push(msg);
        storage.rotateDM(dm, v.targetId); storage.saveDM(dm);
        io.to(v.targetId).emit('receive_dm', msg);
        io.emit('gm_update_dm', { playerId: v.targetId, history: dm[v.targetId] });
    });

    socket.on('player_reply', (data) => {
        if (!rateCheck('player_reply')) return;
        const v = V.validatePlayerReply(data);
        if (!v || !requirePlayer(v.playerId) || !playersState()[v.playerId]) return;
        const msg = { npcName: v.targetNpc, message: v.message, timestamp: new Date().toLocaleTimeString('ru-RU'), fromPlayer: true };
        const dm = dmHistory();
        if (!dm[v.playerId]) dm[v.playerId] = [];
        dm[v.playerId].push(msg);
        storage.rotateDM(dm, v.playerId); storage.saveDM(dm);
        io.to(v.playerId).emit('receive_dm', msg);
        io.emit('gm_update_dm', { playerId: v.playerId, history: dm[v.playerId] });
    });

    socket.on('gm_delete_dm', (data) => {
        if (!requireGM()) return;
        const playerId = V.isNonEmptyString(data?.playerId, 100);
        const index = V.isNumber(data?.index, 0, 10000);
        if (!playerId || index === null) return;
        const dm = dmHistory();
        if (!dm[playerId] || index >= dm[playerId].length) return;
        dm[playerId].splice(index, 1); storage.saveDM(dm);
        io.to(playerId).emit('dm_history', dm[playerId]);
        io.emit('gm_update_dm', { playerId, history: dm[playerId] });
        log.info('GM', `ЛС удалено: ${playerId}[${index}]`);
    });

    socket.on('gm_delete_player', (playerId) => {
        if (!requireGM()) return;
        const id = V.isNonEmptyString(playerId, 100);
        const ps = playersState();
        if (!id || !ps[id]) return;
        delete ps[id];
        const dm = dmHistory();
        if (dm[id]) { delete dm[id]; storage.saveDM(dm); }
        storage.savePlayers(ps);
        io.emit('gm_update_players', ps);
        log.info('GM', `Игрок удалён: ${id}`);
    });

    // ===== РАДИО =====
    socket.on('send_radio', (data) => {
        if (!rateCheck('send_radio')) return;
        const v = V.validateRadioData(data);
        if (!v) return;
        const msg = { sender: v.sender, message: v.message, timestamp: new Date().toLocaleTimeString('ru-RU') };
        const rh = radioHistory();
        rh.push(msg); storage.rotateRadio(rh); storage.saveRadio(rh);
        io.emit('receive_radio', msg);
    });

    socket.on('clear_radio_history', () => {
        if (!requireGM()) return;
        ctx._clearRadio();
        io.emit('radio_history', []);
        log.info('GM', 'Радио очищено');
    });

    socket.on('add_marker', (d) => { io.emit('new_marker', d); });

    // ===== DISCONNECT =====
    socket.on('disconnect', () => {
        rateLimiter.remove(socket.id);
        if (socket.data.role === 'player') log.info('AUTH', `Отключён: ${socket.data.playerId}`);
        else if (socket.data.role === 'gm') log.info('AUTH', `GM отключён: ${socket.id}`);
    });
};
