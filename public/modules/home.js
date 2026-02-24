(function() {
    const tabList = document.getElementById('nav-tabs');
    const tabId = 'tab-home';

    if (tabList && !document.getElementById(tabId)) {
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.id = tabId;
        tab.innerText = 'ГЛАВНАЯ';
        tab.onclick = () => window.switchTab('home');
        tabList.insertBefore(tab, tabList.firstChild);
    }

    window.modules = window.modules || {};
    window.modules['home'] = {
        render: function(container, state) {
            const s = (state && state.home) ? state.home : {};
            const quests = s.quests || [];
            const radioPreview = s.radio || null;

            const dmLogs = AppState.get('dmLog') || [];
            const lastDMs = dmLogs.slice(-3);
            const msgPreviewHTML = lastDMs.length > 0
                ? lastDMs.map(m => {
                    const who = m.fromPlayer ? 'ВЫ' : (m.npcName || '???');
                    return `<div class="home-dm-preview">
                        <span class="home-dm-preview__meta">[${m.timestamp}] ${who}:</span><br>${m.message}
                    </div>`;
                }).join('')
                : null;

            const currentTime = document.getElementById('clock')?.innerText || '--:--:--';
            const gmMarkers = (AppState.get('mapState') || {}).gmMarkers || [];

            const QUEST_MARKER_ICONS = {
                quest_normal:    { sym: '◈', color: '#4af626' },
                quest_important: { sym: '◆', color: '#ffd700' },
                quest_critical:  { sym: '⬟', color: '#ff3333' },
                triangle_down:   { sym: '▼', color: '#ff6b35' },
                star:            { sym: '★', color: '#ffd700' },
            };

            const questsHTML = quests.length > 0
                ? quests.map((q, idx) => {
                    const linkedMarker = gmMarkers.find(m => m.linkedQuest === q);
                    const markerInfo = linkedMarker ? (QUEST_MARKER_ICONS[linkedMarker.type] || { sym: '▼', color: '#ff6b35' }) : null;

                    const markerBtn = markerInfo
                        ? `<button onclick="window.focusMapMarker('${linkedMarker.id}')"
                                title="Открыть на карте" class="quest-map-btn"
                                style="color:${markerInfo.color};border-color:${markerInfo.color};">
                                ${markerInfo.sym}</button>`
                        : '';

                    return `
                        <li class="quest-item">
                            <span class="quest-marker">▸</span>
                            <span class="quest-text">${q}</span>
                            ${markerBtn}
                            <button onclick="window.removePlayerQuest(${idx})" class="quest-btn" title="Завершить задачу">✓</button>
                        </li>
                    `;
                }).join('')
                : `<li class="quest-empty">Ожидание директив Смотрителя...</li>`;

            container.innerHTML = `
                <div class="home-root">
                    <div class="home-topbar">
                        <div><span class="status-dot"></span>ПОДКЛЮЧЕНО К СЕТИ СТОЙЛА</div>
                        <div>ВРЕМЯ: ${currentTime}</div>
                    </div>

                    <div class="home-quests">
                        <div class="panel__header">Активные задачи</div>
                        <ul class="quest-list">${questsHTML}</ul>
                    </div>

                    <div class="home-emblem">
                        <div class="emblem-ring">
                            <img class="emblem-img" src="/emblem.png" alt="Stable-Tec" draggable="false">
                        </div>
                        <div class="emblem-caption">Stable-Tec&nbsp;&nbsp;OS</div>
                    </div>

                    <div class="home-feeds">
                        <div class="feed-block">
                            <div class="panel__header">Радиоприём</div>
                            <div class="feed-content">${radioPreview || '<span class="feed-empty">нет сигнала</span>'}</div>
                        </div>
                        <div class="feed-block">
                            <div class="panel__header">Личные сообщения</div>
                            <div class="feed-content">${msgPreviewHTML || '<span class="feed-empty">входящих нет</span>'}</div>
                        </div>
                    </div>

                    <div class="home-achievements">
                        <div class="achv-label">Достижения</div>
                        <div class="achv-slot"></div>
                        <div class="achv-slot"></div>
                        <div class="achv-slot"></div>
                        <div class="achv-slot"></div>
                        <div class="achv-slot"></div>
                    </div>
                </div>
            `;
        }
    };
})();
