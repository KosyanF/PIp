// ==========================================
// gm.js — GM-логика: жители, квесты, радио
// ==========================================
// Вынесено из index.html (Фаза 4.2)
// Зависимости: socket (global), AppState, MarkerRegistry
// ==========================================

(function () {
    'use strict';

    const MR = window.MarkerRegistry;

    // ── GM ВКЛАДКИ ──
    let currentGMTab = 'players';
    let gmMapReady   = false;
    const GM_TABS    = ['players', 'quests', 'radio', 'map'];

    window.switchGMTab = function (tab) {
        currentGMTab = tab;
        document.querySelectorAll('.gm-tab').forEach((b, i) => b.classList.toggle('active', GM_TABS[i] === tab));
        document.querySelectorAll('.gm-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(`gm-panel-${tab}`)?.classList.add('active');
        if (tab === 'quests') renderGQPanel();
        if (tab === 'map') {
            // gmMap.js handles initialization
            if (window.initGMMap) window.initGMMap();
        }
    };

    function gmScreenHidden() {
        return document.getElementById('gm-screen').classList.contains('hidden');
    }

    // ── ЛОГИН GM ──
    window.showGMLogin = function () {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('gm-login').classList.remove('hidden');
    };

    window.gmLogin = function () {
        socket.emit('gm_login', document.getElementById('gm-pass').value);
    };

    socket.on('gm_login_success', data => {
        document.getElementById('gm-login').classList.add('hidden');
        document.getElementById('gm-screen').classList.remove('hidden');
        AppState.set('gmPlayersData', data.players);
        renderGMTable();
        gmUpdatePlayerDropdown();
        renderGQPanel();
        socket.emit('map_request_init');
    });

    socket.on('gm_update_players', players => {
        AppState.set('gmPlayersData', players);
        if (!gmScreenHidden()) {
            renderGMTable();
            gmUpdatePlayerDropdown();
            if (currentGMTab === 'quests') renderGQPanel();
        }
    });

    // ── ЛС (GM side) ──
    socket.on('gm_dm_history', h => {
        AppState.set('gmDmLog', h);
        if (!gmScreenHidden() && currentGMTab === 'players') renderGMTable();
    });

    socket.on('gm_update_dm', data => {
        const log = AppState.get('gmDmLog');
        log[data.playerId] = data.history;
        AppState.set('gmDmLog', log);
        if (!gmScreenHidden() && currentGMTab === 'players') renderGMTable();
    });

    // ── КАРТОЧКИ ЖИТЕЛЕЙ (5.2) ──
    function renderGMTable() {
        const container = document.getElementById('gm-players-container');
        if (!container) { console.warn('[GM] gm-players-container не найден'); return; }

        const gmPlayersData = AppState.get('gmPlayersData');
        const gmDmLog = AppState.get('gmDmLog') || {};

        if (!gmPlayersData || typeof gmPlayersData !== 'object') {
            container.innerHTML = '<div class="text-muted text-center p-md">Ошибка: данные игроков не загружены</div>';
            return;
        }

        const ids = Object.keys(gmPlayersData);
        if (!ids.length) {
            container.innerHTML = '<div class="text-muted text-center p-md">Нет подключённых жителей</div>';
            return;
        }

        container.innerHTML = ids.map(id => {
            const p = gmPlayersData[id];
            const dms = gmDmLog[id] || [];

            const dmHTML = dms.length
                ? dms.map((m, i) =>
                    `<div class="gm-dm-entry ${m.fromPlayer ? 'gm-dm-entry--player' : ''}">
                        <span class="gm-dm-entry__meta">[${m.timestamp}]</span>
                        <b>${m.fromPlayer ? `ИГРОК → ${m.npcName || 'НПС'}` : m.npcName}</b>: ${m.message}
                        <button onclick="deleteDMGM('${id}',${i})" class="btn--icon btn--danger gm-dm-entry__delete">X</button>
                    </div>`
                ).join('')
                : '<div class="text-muted">Нет сообщений</div>';

            return `<div class="player-card">
                <div class="player-card__header">
                    <div>
                        <span class="player-card__name">${p.username}</span>
                        <span class="player-card__id">ID: ${id}</span>
                    </div>
                    <button onclick="deletePlayerGM('${id}')" class="btn--compact btn--danger">УДАЛИТЬ</button>
                </div>
                <div class="player-card__dm-section">
                    <div class="panel__header">ПЕРЕПИСКА</div>
                    <div class="gm-dm-box">${dmHTML}</div>
                    <div class="gm-dm-controls">
                        <input type="text" id="dm-npc-${id}" placeholder="НПС" class="input--compact">
                        <input type="text" id="dm-msg-${id}" placeholder="Текст..." class="input--compact">
                    </div>
                    <button onclick="sendDM('${id}')" class="btn--compact w-full">ОТПРАВИТЬ ЛС</button>
                </div>
                <details class="text-muted details-debug">
                    <summary class="fs-sm">Debug JSON</summary>
                    <pre class="gm-debug-json">${JSON.stringify(p.state, null, 2) || '{}'}</pre>
                </details>
            </div>`;
        }).join('');
    }

    window.deletePlayerGM = function (pid) {
        if (confirm('Удалить игрока безвозвратно?')) socket.emit('gm_delete_player', pid);
    };

    window.deleteDMGM = function (pid, idx) {
        if (confirm('Удалить это сообщение?')) socket.emit('gm_delete_dm', { playerId: pid, index: idx });
    };

    window.sendDM = function (pid) {
        const npc = document.getElementById(`dm-npc-${pid}`).value.trim();
        const msg = document.getElementById(`dm-msg-${pid}`).value.trim();
        if (!msg) return;
        socket.emit('send_dm', { targetId: pid, npcName: npc || 'СИСТЕМА СТОЙЛА', message: msg });
        document.getElementById(`dm-msg-${pid}`).value = '';
    };

    // ── РАДИО GM ──
    window.sendRadioGM = function () {
        const s = document.getElementById('gm-radio-sender').value.trim() || 'СИСТЕМА СТОЙЛА';
        const m = document.getElementById('gm-radio-msg').value.trim();
        if (!m) return;
        socket.emit('send_radio', { sender: s, message: m });
        document.getElementById('gm-radio-msg').value = '';
    };

    window.clearRadioGM = function () {
        if (confirm('Удалить всю историю радио?')) socket.emit('clear_radio_history');
    };

    // Подписка на radioLog — обновлять GM-радио автоматически
    AppState.subscribe('radioLog', () => updateGMRadioLog());

    function updateGMRadioLog() {
        const c = document.getElementById('gm-radio-history');
        if (!c) return;
        const radioLog = AppState.get('radioLog');
        if (!radioLog.length) { c.innerHTML = '<div class="text-muted">Эфир пуст...</div>'; return; }
        c.innerHTML = [...radioLog].reverse().map(l =>
            `<div class="gm-dm-entry"><span class="gm-dm-entry__meta">[${l.timestamp}]</span> <b class="text-accent">${l.sender || 'НЕИЗВЕСТНЫЙ'}</b>: ${l.message}</div>`
        ).join('');
    }

    // ── КВЕСТЫ GM ──
    let gqSelectedPlayers = new Set();

    function renderGQPanel() {
        renderGQChips();
        renderGQActiveQuests();
        renderGQMarkerDropdown();
    }

    function renderGQMarkerDropdown() {
        const sel = document.getElementById('gq-link-marker');
        if (!sel) return;
        const gmMarkers = (AppState.get('mapState') || {}).gmMarkers || [];
        const cur = sel.value;
        sel.innerHTML = '<option value="">— без метки —</option>';
        gmMarkers.forEach(m => {
            const sym = MR.getGMSymbol(m.type);
            const label = m.label || `(${m.nx.toFixed(2)}, ${m.ny.toFixed(2)})`;
            const o = document.createElement('option');
            o.value = m.id;
            o.textContent = `${sym} ${label}`;
            if (m.id === cur) o.selected = true;
            sel.appendChild(o);
        });
    }

    function renderGQChips() {
        const wrap = document.getElementById('gq-player-chips');
        if (!wrap) return;
        const gmPlayersData = AppState.get('gmPlayersData');
        const ids = Object.keys(gmPlayersData);
        if (!ids.length) {
            wrap.innerHTML = '<span class="text-muted fs-sm">Нет подключённых игроков</span>';
            return;
        }
        wrap.innerHTML = '';
        for (const id of ids) {
            const btn = document.createElement('button');
            btn.className = 'gq-player-chip' + (gqSelectedPlayers.has(id) ? ' selected' : '');
            btn.textContent = gmPlayersData[id].username;
            btn.onclick = () => {
                if (gqSelectedPlayers.has(id)) gqSelectedPlayers.delete(id);
                else gqSelectedPlayers.add(id);
                renderGQChips();
            };
            wrap.appendChild(btn);
        }
    }

    function renderGQActiveQuests() {
        const wrap = document.getElementById('gq-active-quests-wrap');
        if (!wrap) return;
        const gmPlayersData = AppState.get('gmPlayersData');
        const gmMarkers = AppState.get('mapState').gmMarkers || [];
        const rows = [];

        for (const id in gmPlayersData) {
            const p = gmPlayersData[id];
            const quests = p.state?.home?.quests || [];
            for (let i = 0; i < quests.length; i++) {
                const q = quests[i];
                const marker = gmMarkers.find(m => m.linkedQuest === q && (m.linkedPlayers || []).includes(id));
                rows.push({ playerId: id, playerName: p.username, quest: q, idx: i, marker });
            }
        }

        if (!rows.length) {
            wrap.innerHTML = '<span class="text-muted fs-sm">Нет активных заданий</span>';
            return;
        }

        wrap.innerHTML = `<table id="gq-active-table">
            <thead><tr>
                <th>ИГРОК</th><th>ЗАДАНИЕ</th>
                <th class="col-w-70">МЕТКА</th>
                <th class="col-w-30"></th>
            </tr></thead>
            <tbody>${rows.map(r => `
                <tr>
                    <td class="ws-nowrap">${r.playerName}</td>
                    <td>${r.quest}</td>
                    <td class="gq-quest-row-marker text-center">
                        ${r.marker
                            ? `<span style="color:${MR.getGMColor(r.marker)};" title="${r.marker.label || ''}">${MR.getGMSymbol(r.marker.type)}</span>`
                            : '<span class="text-muted">—</span>'}
                    </td>
                    <td><button onclick="removeQuestGM('${r.playerId}',${r.idx})" class="btn--icon btn--danger">X</button></td>
                </tr>
            `).join('')}</tbody>
        </table>`;
    }

    window.gqAddQuest = function () {
        const text = document.getElementById('gq-quest-text').value.trim();
        if (!text) { alert('Введите текст задания'); return; }
        if (!gqSelectedPlayers.size) { alert('Выберите хотя бы одного игрока'); return; }
        const gmPlayersData = AppState.get('gmPlayersData');
        const playerIds = [...gqSelectedPlayers];

        // Выдать квест каждому выбранному игроку
        for (const id of playerIds) {
            const cur = gmPlayersData[id]?.state?.home?.quests || [];
            socket.emit('gm_update_player', { playerId: id, newState: { home: { quests: [...cur, text] } } });
        }

        // Привязать существующий маркер к квесту и всем выбранным игрокам
        const markerSel = document.getElementById('gq-link-marker');
        if (markerSel && markerSel.value) {
            const markerId = markerSel.value;
            const gmMarkers = (AppState.get('mapState') || {}).gmMarkers || [];
            const marker = gmMarkers.find(m => m.id === markerId);
            if (marker) {
                // Удалить старый маркер и создать обновлённый с привязкой
                socket.emit('gm_remove_map_marker', markerId);
                socket.emit('gm_add_map_marker', {
                    type: marker.type,
                    nx: marker.nx,
                    ny: marker.ny,
                    label: marker.label || text.substring(0, 30),
                    color: marker.color,
                    linkedQuest: text,
                    linkedPlayers: playerIds,
                });
            }
            markerSel.value = '';
        }

        document.getElementById('gq-quest-text').value = '';
    };

    window.gqDeselectAll = function () { gqSelectedPlayers.clear(); renderGQChips(); };

    window.removeQuestGM = function (pid, idx) {
        const gmPlayersData = AppState.get('gmPlayersData');
        const q = gmPlayersData[pid]?.state?.home?.quests;
        if (!q) return;
        const upd = [...q]; upd.splice(idx, 1);
        socket.emit('gm_update_player', { playerId: pid, newState: { home: { quests: upd } } });
    };

    // ── Дропдауны карты (привязка квест↔метка) ──
    function gmUpdatePlayerDropdown() {
        const sel = document.getElementById('gm-marker-link-player');
        if (!sel) return;
        const cur = sel.value;
        const gmPlayersData = AppState.get('gmPlayersData');
        sel.innerHTML = '<option value="">— любой —</option>';
        for (const id in gmPlayersData) {
            const o = document.createElement('option');
            o.value = id; o.textContent = gmPlayersData[id].username;
            if (id === cur) o.selected = true;
            sel.appendChild(o);
        }
    }

    window.gmUpdateQuestDropdown = function (pid) {
        const sel = document.getElementById('gm-marker-link-quest');
        if (!sel) return;
        const gmPlayersData = AppState.get('gmPlayersData');
        sel.innerHTML = '<option value="">— не привязывать —</option>';
        if (!pid || !gmPlayersData[pid]) return;
        (gmPlayersData[pid]?.state?.home?.quests || []).forEach(q => {
            const o = document.createElement('option');
            o.value = q; o.textContent = q.length > 42 ? q.substring(0, 42) + '...' : q;
            sel.appendChild(o);
        });
    };

    // Автообновление dropdown квестов при обновлении данных игроков
    AppState.subscribe('gmPlayersData', () => {
        const sel = document.getElementById('gm-marker-link-player');
        if (sel && sel.value) window.gmUpdateQuestDropdown(sel.value);
    });

    // ── Экспорт для gmMap.js и index.html ──
    window._gm = {
        gmScreenHidden,
        renderGQPanel,
        get currentGMTab() { return currentGMTab; },
    };

})();
