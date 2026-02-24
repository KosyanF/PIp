// Модуль Радио (Широковещательный приемник)
(function() {
    const tabList = document.getElementById('nav-tabs');
    const tabId = 'tab-radio';

    if (tabList && !document.getElementById(tabId)) {
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.id = tabId;
        tab.innerText = 'РАДИО';
        tab.onclick = () => window.switchTab('radio');
        tabList.appendChild(tab);
    }

    window.modules = window.modules || {};
    window.modules['radio'] = {
        render: function(container, state) {
            const logs = AppState.get('radioLog') || [];
            const reversedLogs = [...logs].reverse();

            let logHTML = reversedLogs.map(l => {
                const senderName = l.sender || 'НЕИЗВЕСТНЫЙ';
                return `
                <div class="radio-entry">
                    <div class="radio-entry__header">
                        [${l.timestamp}] ПЕРЕДАТЧИК: <span class="radio-entry__sender">${senderName.toUpperCase()}</span>
                    </div>
                    <div class="radio-entry__body">${l.message}</div>
                </div>
                `;
            }).join('');

            if (logs.length === 0) {
                logHTML = `<div class="radio-empty">[ ЭФИР ПУСТ. СИГНАЛОВ НЕ ОБНАРУЖЕНО ]</div>`;
            }

            container.style.position = 'relative';

            container.innerHTML = `
                <div class="radio-wrap">
                    <h2 class="radio-title">РАДИОПРИЕМНИК ПИП-БОЯ</h2>
                    <div id="radio-log-container" class="radio-log">
                        ${logHTML}
                    </div>
                </div>
            `;
        }
    };
})();
