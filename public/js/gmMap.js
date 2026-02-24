// ==========================================
// gmMap.js — GM карта (маркеры, pan/zoom)
// ==========================================
// Вынесено из index.html (Фаза 4.2)
// Зависимости: socket, AppState, MarkerRegistry, window._gm
// ==========================================

(function () {
    'use strict';

    const MR = window.MarkerRegistry;
    const _gmMarkerEls = new Map();
    let gmMapScale = 1, gmMapOffX = 0, gmMapOffY = 0;
    let _gmImgReady = false, _gmResizeTimer = null;
    let _inited = false;

    // ── GEOMETRY ──
    function gmGetImgRect() {
        const wrap = document.getElementById('gm-map-canvas-wrap');
        const img = document.getElementById('gm-map-img');
        if (!wrap) return { left: 0, top: 0, width: 1, height: 1 };
        const cW = wrap.clientWidth, cH = wrap.clientHeight;
        const aspect = (_gmImgReady && img?.naturalWidth) ? img.naturalWidth / img.naturalHeight : 16 / 9;
        let iW, iH;
        if (cW / cH > aspect) { iH = cH; iW = cH * aspect; } else { iW = cW; iH = cW / aspect; }
        return { left: (cW - iW) / 2, top: (cH - iH) / 2, width: iW, height: iH };
    }

    function gmGetMinScale() {
        const wrap = document.getElementById('gm-map-canvas-wrap');
        if (!wrap) return 0.1;
        const r = gmGetImgRect();
        return Math.min(wrap.clientWidth / r.width, wrap.clientHeight / r.height) * 0.9;
    }

    function gmNormToScreen(nx, ny) {
        const r = gmGetImgRect();
        return { sx: (r.left + nx * r.width) * gmMapScale + gmMapOffX, sy: (r.top + ny * r.height) * gmMapScale + gmMapOffY };
    }

    function gmScreenToNorm(sx, sy) {
        const r = gmGetImgRect();
        return { nx: ((sx - gmMapOffX) / gmMapScale - r.left) / r.width, ny: ((sy - gmMapOffY) / gmMapScale - r.top) / r.height };
    }

    function gmApplyTransform() {
        const inner = document.getElementById('gm-map-canvas-inner');
        if (inner) inner.style.transform = `translate(${gmMapOffX}px,${gmMapOffY}px) scale(${gmMapScale})`;
        gmPositionAllMarkers();
    }

    // ── PUBLIC CONTROLS ──
    window.gmMapZoom = function (d) {
        gmMapScale = Math.max(gmGetMinScale(), Math.min(20, gmMapScale + d));
        gmApplyTransform();
    };
    window.gmMapReset = function () { gmMapScale = 1; gmMapOffX = 0; gmMapOffY = 0; gmApplyTransform(); };
    window.gmMapClearAll = function () {
        if (confirm('Удалить ВСЕ метки GM с карты?')) socket.emit('gm_clear_map_markers');
    };

    window.gmUpdateMarkerTypeUI = function () {
        const type = document.getElementById('gm-marker-type')?.value;
        const colorSel = document.getElementById('gm-marker-color');
        if (!colorSel) return;
        const isQuest = MR.isQuestType(type);
        colorSel.style.opacity = isQuest ? '0.3' : '1';
        colorSel.style.pointerEvents = isQuest ? 'none' : 'auto';
    };

    // ── MARKERS ──
    function gmPositionAllMarkers() {
        const markers = AppState.get('mapState').gmMarkers || [];
        for (const m of markers) {
            const el = _gmMarkerEls.get(m.id);
            if (!el) continue;
            const { sx, sy } = gmNormToScreen(m.nx, m.ny);
            el.style.left = sx + 'px';
            el.style.top = sy + 'px';
        }
    }

    function gmSyncMarkers() {
        const overlay = document.getElementById('gm-map-markers-overlay');
        if (!overlay) return;

        const markers = AppState.get('mapState').gmMarkers || [];
        const ids = new Set(markers.map(m => m.id));

        // Remove stale
        for (const [id, el] of _gmMarkerEls) {
            if (!ids.has(id)) { el.remove(); _gmMarkerEls.delete(id); }
        }

        // Add new
        for (const m of markers) {
            if (!_gmMarkerEls.has(m.id)) {
                const el = MR.createGMMarkerEl(m, {
                    onClick: (marker) => {
                        if (confirm('Удалить эту метку?')) socket.emit('gm_remove_map_marker', marker.id);
                    }
                });
                overlay.appendChild(el);
                _gmMarkerEls.set(m.id, el);
            }
        }

        gmPositionAllMarkers();
        gmRenderMarkersList();
    }

    function gmRenderMarkersList() {
        const list = document.getElementById('gm-map-markers-list');
        if (!list) return;
        const markers = AppState.get('mapState').gmMarkers || [];
        const gmPlayersData = AppState.get('gmPlayersData');

        if (!markers.length) { list.innerHTML = '<span class="text-muted">Меток нет</span>'; return; }

        list.innerHTML = markers.map(m => {
            const sym = MR.getGMSymbol(m.type), color = MR.getGMColor(m);
            const linked = m.linkedQuest ? ` → ${m.linkedQuest.substring(0, 25)}...` : '';
            const players = (m.linkedPlayers || []).map(pid => gmPlayersData[pid]?.username || pid).join(', ');
            return `<div class="gm-marker-list-entry">
                <span class="gm-marker-list-entry__sym" style="color:${color};">${sym}</span>
                <span class="gm-marker-list-entry__text">${m.label || '—'}${linked}${players ? ' (' + players + ')' : ''}</span>
                <button onclick="socket.emit('gm_remove_map_marker','${m.id}')" class="btn--icon btn--danger">✕</button>
            </div>`;
        }).join('');
    }

    // ── MARKERS CHANGED (from socket events) ──
    function onGMMarkersChanged() {
        gmSyncMarkers();
        // Всегда обновлять dropdown маркеров для квестовой панели
        if (!window._gm.gmScreenHidden()) {
            window._gm.renderGQPanel();
        }
    }

    socket.on('map_init', d => { AppState.merge('mapState', { gmMarkers: d.gmMarkers || [] }); onGMMarkersChanged(); });
    socket.on('map_gm_marker_add', m => { AppState.get('mapState').gmMarkers.push(m); onGMMarkersChanged(); });
    socket.on('map_gm_marker_remove', id => {
        const ms = AppState.get('mapState');
        ms.gmMarkers = ms.gmMarkers.filter(m => m.id !== id);
        onGMMarkersChanged();
    });
    socket.on('map_gm_markers_all', ms => { AppState.merge('mapState', { gmMarkers: ms }); onGMMarkersChanged(); });

    // ── INTERACTION ──
    function initGMMapInteraction() {
        const wrap = document.getElementById('gm-map-canvas-wrap');
        const img = document.getElementById('gm-map-img');
        if (!wrap || wrap.dataset.inited) return;
        wrap.dataset.inited = '1';

        _gmImgReady = img.complete && !!img.naturalWidth;
        if (!_gmImgReady) img.addEventListener('load', () => { _gmImgReady = true; gmPositionAllMarkers(); }, { once: true });

        const THRESHOLD = 4;

        // === MOUSE ===
        let dragging = false, mx0, my0, ox0, oy0;
        wrap.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            dragging = false; mx0 = e.clientX; my0 = e.clientY; ox0 = gmMapOffX; oy0 = gmMapOffY;
            function mm(em) {
                const dx = em.clientX - mx0, dy = em.clientY - my0;
                if (!dragging && (Math.abs(dx) > THRESHOLD || Math.abs(dy) > THRESHOLD)) dragging = true;
                if (dragging) { gmMapOffX = ox0 + dx; gmMapOffY = oy0 + dy; gmApplyTransform(); }
            }
            function mu(eu) {
                document.removeEventListener('mousemove', mm);
                document.removeEventListener('mouseup', mu);
                if (!dragging) gmHandleClick(eu, wrap);
            }
            document.addEventListener('mousemove', mm);
            document.addEventListener('mouseup', mu);
        });

        // === WHEEL ===
        wrap.addEventListener('wheel', e => {
            e.preventDefault();
            const r = wrap.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
            const d = e.deltaY < 0 ? 0.15 : -0.15, minS = gmGetMinScale();
            const ns = Math.max(minS, Math.min(20, gmMapScale + d)), ratio = ns / gmMapScale;
            gmMapOffX = px - ratio * (px - gmMapOffX); gmMapOffY = py - ratio * (py - gmMapOffY);
            gmMapScale = ns; gmApplyTransform();
        }, { passive: false });

        // === TOUCH ===
        let tDrag = false, t1 = null, tOX, tOY, pDist = 0, pScale = 1;
        wrap.addEventListener('touchstart', e => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                pDist = Math.sqrt(dx*dx + dy*dy); pScale = gmMapScale; tDrag = true;
            } else if (e.touches.length === 1) {
                tDrag = false;
                t1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                tOX = gmMapOffX; tOY = gmMapOffY;
            }
        }, { passive: false });

        wrap.addEventListener('touchmove', e => {
            e.preventDefault();
            if (e.touches.length === 2 && pDist > 0) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                gmMapScale = Math.max(gmGetMinScale(), Math.min(20, pScale * Math.sqrt(dx*dx+dy*dy) / pDist));
                gmApplyTransform();
            } else if (e.touches.length === 1 && t1) {
                const dx = e.touches[0].clientX - t1.x, dy = e.touches[0].clientY - t1.y;
                if (!tDrag && (Math.abs(dx) > THRESHOLD || Math.abs(dy) > THRESHOLD)) tDrag = true;
                if (tDrag) { gmMapOffX = tOX + dx; gmMapOffY = tOY + dy; gmApplyTransform(); }
            }
        }, { passive: false });

        wrap.addEventListener('touchend', e => {
            if (!tDrag && e.changedTouches.length === 1) gmHandleClick(e.changedTouches[0], wrap);
            if (e.touches.length === 0) { pDist = 0; t1 = null; tDrag = false; }
        }, { passive: true });

        new ResizeObserver(() => { clearTimeout(_gmResizeTimer); _gmResizeTimer = setTimeout(gmPositionAllMarkers, 80); }).observe(wrap);
        gmApplyTransform();
        gmSyncMarkers();
    }

    function gmHandleClick(e, wrap) {
        const r = wrap.getBoundingClientRect();
        const { nx, ny } = gmScreenToNorm(e.clientX - r.left, e.clientY - r.top);
        if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;

        const type = document.getElementById('gm-marker-type').value;
        const def = MR.GM_MARKER_DEFS[type];
        const color = def?.autoColor || document.getElementById('gm-marker-color').value;
        const label = document.getElementById('gm-marker-label').value.trim();
        const linkedPlayer = document.getElementById('gm-marker-link-player').value;
        const linkedQuest = document.getElementById('gm-marker-link-quest').value;

        socket.emit('gm_add_map_marker', {
            type, color, nx, ny,
            label: label || linkedQuest || '',
            linkedPlayers: linkedPlayer ? [linkedPlayer] : [],
            linkedQuest: linkedQuest || null
        });
        document.getElementById('gm-marker-label').value = '';
    }

    // ── PUBLIC INIT (called by switchGMTab) ──
    window.initGMMap = function () {
        // Обновить dropdown квестов при переключении на карту
        const sel = document.getElementById('gm-marker-link-player');
        if (sel && sel.value) window.gmUpdateQuestDropdown(sel.value);
        
        if (!_inited) {
            _inited = true;
            requestAnimationFrame(() => { initGMMapInteraction(); gmPositionAllMarkers(); });
        } else {
            requestAnimationFrame(() => gmPositionAllMarkers());
        }
    };

})();
