// ==========================================
// markerRegistry.js — Единый реестр маркеров
// ==========================================
// Используется и player-картой (map.js), и GM-картой (gm.js / gmMap.js)
// Устраняет дублирование определений типов, символов и цветов.
// ==========================================

(function () {
    'use strict';

    // ── Типы GM-маркеров ──
    const GM_MARKER_DEFS = {
        quest_normal:    { sym: '◈', autoColor: '#4af626', category: 'quest', label: 'Обычное задание' },
        quest_important: { sym: '◆', autoColor: '#ffd700', category: 'quest', label: 'Важное задание' },
        quest_critical:  { sym: '⬟', autoColor: '#ff3333', category: 'quest', label: 'Критическое' },
        skull:           { sym: '☠', autoColor: null,      category: 'gm',    label: 'Опасность' },
        star:            { sym: '★', autoColor: null,      category: 'gm',    label: 'Интерес' },
        exclamation:     { sym: '!', autoColor: null,      category: 'gm',    label: 'Внимание' },
        eye:             { sym: '◉', autoColor: null,      category: 'gm',    label: 'Наблюдение' },
        flag:            { sym: '⚑', autoColor: null,      category: 'gm',    label: 'Флаг' },
        cross_gm:        { sym: '✛', autoColor: null,      category: 'gm',    label: 'Медпункт' },
        // Legacy
        triangle_down:   { sym: '▼', autoColor: null,      category: 'gm',    label: 'Метка' },
    };

    // ── Типы игрокских маркеров ──
    const PLAYER_MARKER_DEFS = {
        circle:  { label: '●  ТОЧКА', svg: (c) => `<circle cx="${c}" cy="${c}" r="${c*0.55}" fill="currentColor"/>` },
        diamond: { label: '◆  РОМБ',  svg: (c) => `<polygon points="${c},${c*0.2} ${c*1.8},${c} ${c},${c*1.8} ${c*0.2},${c}" fill="currentColor"/>` },
        cross:   { label: '✛  КРЕСТ', svg: (c) => {
            return `<rect x="${c*0.35}" y="${c*0.05}" width="${c*0.3}" height="${c*0.9}" fill="currentColor"/>` +
                   `<rect x="${c*0.05}" y="${c*0.35}" width="${c*0.9}" height="${c*0.3}" fill="currentColor"/>`;
        }},
    };

    // ── Публичные функции ──

    /**
     * Символ GM-маркера по типу
     */
    function getGMSymbol(type) {
        return GM_MARKER_DEFS[type]?.sym || '●';
    }

    /**
     * Цвет GM-маркера: autoColor из определения, иначе цвет из данных, иначе fallback
     */
    function getGMColor(marker) {
        const def = GM_MARKER_DEFS[marker.type];
        return (def?.autoColor) || marker.color || '#ff6b35';
    }

    /**
     * Является ли тип квестовым (влияет на автоцвет в UI)
     */
    function isQuestType(type) {
        return GM_MARKER_DEFS[type]?.category === 'quest';
    }

    /**
     * Создать DOM-элемент метки GM-маркера (для overlay)
     * @param {Object} marker — данные маркера { id, type, color, label, ... }
     * @param {Object} opts — { onClick?: (marker) => void }
     */
    function createGMMarkerEl(marker, opts) {
        const el = document.createElement('div');
        el.className = 'gm-map-marker';
        el.dataset.id = marker.id;
        el.title = marker.label || '';

        const sym = getGMSymbol(marker.type);
        const color = getGMColor(marker);
        el.innerHTML = `<span class="marker-sym-gm" style="color:${color};">${sym}</span>`;

        if (marker.label) {
            const lb = document.createElement('div');
            lb.className = 'marker-label';
            lb.textContent = marker.label;
            el.appendChild(lb);
        }

        el.addEventListener('mousedown', e => e.stopPropagation());
        if (opts?.onClick) {
            el.addEventListener('click', e => { e.stopPropagation(); opts.onClick(marker); });
        }

        return el;
    }

    /**
     * Создать DOM-элемент метки игрока (для overlay в player map)
     * @param {Object} marker — { id, type, label, ... source:'player' }
     * @param {Object} opts — { onClick?: (marker) => void }
     */
    function createPlayerMarkerEl(marker, opts) {
        const el = document.createElement('div');
        el.className = 'map-marker-overlay';
        el.dataset.id = marker.id;
        el.dataset.source = 'player';

        const c = 10;
        const td = PLAYER_MARKER_DEFS[marker.type] || PLAYER_MARKER_DEFS.circle;
        el.innerHTML = `<svg width="20" height="20" viewBox="0 0 ${c*2} ${c*2}" class="marker-svg-player">
            ${td.svg(c)}</svg>`;

        if (marker.label) {
            const lbl = document.createElement('div');
            lbl.className = 'marker-label';
            lbl.textContent = marker.label;
            el.appendChild(lbl);
        }

        el.addEventListener('mousedown', e => e.stopPropagation());
        if (opts?.onClick) {
            el.addEventListener('click', e => { e.stopPropagation(); opts.onClick(marker); });
        }

        return el;
    }

    /**
     * Создать DOM-элемент метки GM-маркера для player overlay (в player map)
     * Похож на createGMMarkerEl но с CSS классом player-стороны
     */
    function createGMMarkerElForPlayer(marker) {
        const el = document.createElement('div');
        el.className = 'map-marker-overlay';
        el.dataset.id = marker.id;
        el.dataset.source = 'gm';

        const color = getGMColor(marker);
        const sym = getGMSymbol(marker.type);
        el.innerHTML = `<span class="marker-sym-gm--sm" style="color:${color};">${sym}</span>`;

        if (marker.label) {
            const lbl = document.createElement('div');
            lbl.className = 'marker-label';
            lbl.textContent = marker.label;
            el.appendChild(lbl);
        }

        el.addEventListener('mousedown', e => e.stopPropagation());
        return el;
    }

    // ── Экспорт ──
    window.MarkerRegistry = {
        GM_MARKER_DEFS,
        PLAYER_MARKER_DEFS,
        getGMSymbol,
        getGMColor,
        isQuestType,
        createGMMarkerEl,
        createPlayerMarkerEl,
        createGMMarkerElForPlayer,
    };

})();
