// ==========================================
// МОДУЛЬ ЛИЧНЫХ СООБЩЕНИЙ v2
// Инкрементальное обновление: добавляем сообщения
// без пересоздания DOM (устранение мерцания)
// ==========================================

(function () {
    'use strict';

    const tabList = document.getElementById('nav-tabs');
    const tabId = 'tab-messages';

    if (tabList && !document.getElementById(tabId)) {
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.id = tabId;
        tab.innerHTML = '<span>ПОЧТА</span><span id="mail-badge" class="badge"></span>';
        tab.onclick = () => window.switchTab('messages');
        tabList.appendChild(tab);
    }

    window.modules = window.modules || {};

    let activeChat = null;
    let lastSeenMap = JSON.parse(localStorage.getItem('pipboy_lastSeen') || '{}');
    let _lastRenderedCount = 0;  // сколько сообщений было при последнем полном рендере
    let _currentChatEl = null;   // кэш DOM scroll-контейнера

    function getGrouped() {
        const logs = AppState.get('dmLog') || [];
        const grouped = {};
        logs.forEach(msg => {
            const npc = msg.npcName;
            if (!npc) return;
            if (!grouped[npc]) grouped[npc] = [];
            grouped[npc].push(msg);
        });
        return grouped;
    }

    function updateBadge(grouped) {
        const badge = document.getElementById('mail-badge');
        if (!badge) return;
        let total = 0;
        for (const npc in grouped) {
            const seen = lastSeenMap[npc] ?? -1;
            const unread = grouped[npc].length - (seen + 1);
            if (unread > 0) total += unread;
        }
        if (total > 0) {
            badge.className = 'badge badge--visible';
            badge.textContent = total;
        } else {
            badge.className = 'badge';
            badge.textContent = '';
        }
    }

    function makeBubbleHTML(m) {
        const dir = m.fromPlayer ? 'out' : 'in';
        return `<div class="msg-bubble msg-bubble--${dir}">
            <div class="msg-bubble__content">
                <div class="msg-bubble__time">[${m.timestamp}]</div>
                ${m.message}
            </div>
        </div>`;
    }

    // Попробовать добавить только новые сообщения без полного пересоздания
    function tryIncrementalUpdate() {
        // Проверка: элемент всё ещё в DOM (не detached после переключения вкладки)
        if (!_currentChatEl || !activeChat) return false;
        if (!document.contains(_currentChatEl)) {
            _currentChatEl = null;
            _lastRenderedCount = 0;
            return false;
        }

        const grouped = getGrouped();
        const msgs = grouped[activeChat] || [];

        // Если кол-во сообщений уменьшилось (удаление) или чат изменился — полный ребилд
        if (msgs.length < _lastRenderedCount) return false;

        // Добавить только новые
        const newMsgs = msgs.slice(_lastRenderedCount);
        if (newMsgs.length === 0) return true; // ничего нового

        for (const m of newMsgs) {
            const div = document.createElement('div');
            div.innerHTML = makeBubbleHTML(m);
            _currentChatEl.appendChild(div.firstElementChild);
        }

        _lastRenderedCount = msgs.length;
        _currentChatEl.scrollTop = _currentChatEl.scrollHeight;

        // Обновить badge и sidebar (непрочитанные)
        if (grouped[activeChat]) {
            lastSeenMap[activeChat] = grouped[activeChat].length - 1;
            localStorage.setItem('pipboy_lastSeen', JSON.stringify(lastSeenMap));
        }
        updateBadge(grouped);
        updateSidebar(grouped);

        return true;
    }

    function updateSidebar(grouped) {
        const sidebar = document.getElementById('msg-chat-list');
        if (!sidebar) return;

        const npcList = Object.keys(grouped).sort((a, b) => {
            const aL = grouped[a][grouped[a].length - 1], bL = grouped[b][grouped[b].length - 1];
            return bL.timestamp.localeCompare(aL.timestamp);
        });

        sidebar.innerHTML = npcList.map(npc => {
            const seen = lastSeenMap[npc] ?? -1;
            const unread = grouped[npc].length - (seen + 1);
            const isActive = npc === activeChat;
            return `<div onclick="selectChat('${npc}')" class="msg-chat-item ${isActive ? 'msg-chat-item--active' : ''}">
                <span>${npc}</span>
                ${unread > 0 ? `<span class="msg-chat-item__badge">${unread}</span>` : ''}
            </div>`;
        }).join('') || '<div class="msg-empty">Нет диалогов</div>';
    }

    window.modules['messages'] = {
        render(container) {
            const grouped = getGrouped();

            // Инкрементальное обновление: только если DOM кэш валиден и является потомком текущего container
            if (_currentChatEl && activeChat && container.contains(_currentChatEl)) {
                if (tryIncrementalUpdate()) return;
            }

            // Полный рендер
            const npcList = Object.keys(grouped).sort((a, b) => {
                const aL = grouped[a][grouped[a].length - 1], bL = grouped[b][grouped[b].length - 1];
                return bL.timestamp.localeCompare(aL.timestamp);
            });

            if (!activeChat && npcList.length > 0) {
                activeChat = npcList[0];
                lastSeenMap[activeChat] = grouped[activeChat].length - 1;
                localStorage.setItem('pipboy_lastSeen', JSON.stringify(lastSeenMap));
            }

            if (activeChat && grouped[activeChat]) {
                lastSeenMap[activeChat] = grouped[activeChat].length - 1;
                localStorage.setItem('pipboy_lastSeen', JSON.stringify(lastSeenMap));
            }

            const chatListHTML = npcList.map(npc => {
                const seen = lastSeenMap[npc] ?? -1;
                const unread = grouped[npc].length - (seen + 1);
                const isActive = npc === activeChat;
                return `<div onclick="selectChat('${npc}')" class="msg-chat-item ${isActive ? 'msg-chat-item--active' : ''}">
                    <span>${npc}</span>
                    ${unread > 0 ? `<span class="msg-chat-item__badge">${unread}</span>` : ''}
                </div>`;
            }).join('') || '<div class="msg-empty">Нет диалогов</div>';

            const activeMessages = grouped[activeChat] || [];
            const messagesHTML = activeMessages.map(makeBubbleHTML).join('');

            container.innerHTML = `
                <div class="msg-wrap">
                    <div class="msg-sidebar">
                        <div class="msg-sidebar__title">ДИАЛОГИ</div>
                        <div id="msg-chat-list">${chatListHTML}</div>
                    </div>
                    <div class="msg-main">
                        <div class="msg-header">${activeChat || 'Нет выбранного диалога'}</div>
                        <div id="chat-scroll" class="msg-scroll">
                            ${messagesHTML || '<div class="msg-empty">Сообщений нет</div>'}
                        </div>
                        <div class="msg-input-bar">
                            <input type="text" id="player-reply-input" placeholder="Введите сообщение..."
                                   onkeydown="if(event.key==='Enter')sendReply()">
                            <button onclick="sendReply()">ОТПРАВИТЬ</button>
                        </div>
                    </div>
                </div>
            `;

            _currentChatEl = document.getElementById('chat-scroll');
            _lastRenderedCount = activeMessages.length;

            updateBadge(grouped);

            setTimeout(() => { if (_currentChatEl) _currentChatEl.scrollTop = _currentChatEl.scrollHeight; }, 0);
        }
    };

    window.selectChat = function (npc) {
        activeChat = npc;
        _lastRenderedCount = 0;  // force full rebuild
        _currentChatEl = null;

        const grouped = getGrouped();
        if (grouped[npc]) {
            lastSeenMap[npc] = grouped[npc].length - 1;
            localStorage.setItem('pipboy_lastSeen', JSON.stringify(lastSeenMap));
        }

        if (AppState.get('currentTab') === 'messages') {
            window.modules['messages'].render(document.getElementById('module-content'));
        }
        if (window.recalcMailBadge) window.recalcMailBadge();
    };

    window.sendReply = function () {
        const input = document.getElementById('player-reply-input');
        if (!input || !activeChat) return;
        const text = input.value.trim();
        if (!text) return;
        if (window.sendPlayerReply) window.sendPlayerReply(text, activeChat);
        input.value = '';
    };

    window.recalcMailBadge = function () {
        updateBadge(getGrouped());
    };

})();
