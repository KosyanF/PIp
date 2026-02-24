// ==========================================
// МОДУЛЬ КАРТЫ — Pip-Buck v8
// Исправлено: drag мышью и touch, корректное разделение drag/click
// ==========================================

(function () {
    'use strict';

    const MR = window.MarkerRegistry;

    // ── TAB ──
    const tabList = document.getElementById('nav-tabs');
    if (tabList && !document.getElementById('tab-map')) {
        const tab = document.createElement('div');
        tab.className = 'tab'; tab.id = 'tab-map'; tab.innerText = 'КАРТА';
        tab.onclick = () => window.switchTab('map');
        const rt = document.getElementById('tab-radio');
        if (rt && rt.nextSibling) tabList.insertBefore(tab, rt.nextSibling);
        else tabList.appendChild(tab);
    }

    window.modules = window.modules || {};

    // ── PERSISTENT STATE ──
    let playerMarkers = JSON.parse(localStorage.getItem('pipboy_player_markers') || '[]');
    let selectedType = 'circle';
    let focusedMarkerId = null;
    let offX = 0, offY = 0, scale = 1;
    let deleteMode = false;

    // ── DOM CACHE ──
    let _wrap = null, _inner = null, _layer = null, _img = null;
    let _imgReady = false;
    let _resizeTimer = null;
    let _listenersAttached = false;  // true if we attached to current _wrap
    const _els = new Map();

    // ── SOCKET (once) ──
    if (!window._mapSockInit) {
        window._mapSockInit = true;
        socket.on('map_init',            d  => { setGM(d.gmMarkers || []); syncMarkers(); });
        socket.on('map_gm_marker_add',   m  => { getGM().push(m); syncMarkers(); refreshHome(); });
        socket.on('map_gm_marker_remove',id => { const s = AppState.get('mapState'); s.gmMarkers = s.gmMarkers.filter(x=>x.id!==id); syncMarkers(); refreshHome(); });
        socket.on('map_gm_markers_all',  a  => { setGM(a); syncMarkers(); refreshHome(); });
    }

    function getGM() { return (AppState.get('mapState') || {}).gmMarkers || []; }
    function setGM(arr) { AppState.merge('mapState', { gmMarkers: arr }); }
    function refreshHome() {
        if (AppState.get('currentTab') === 'home') {
            const m = AppState.get('modules');
            if (m.home) m.home.render(document.getElementById('module-content'), AppState.get('playerState'));
        }
    }

    // ── GEOMETRY ──
    function imgRect() {
        if (!_wrap || !_img) return { left:0, top:0, width:1, height:1 };
        const cW = _wrap.clientWidth, cH = _wrap.clientHeight;
        const a = (_imgReady && _img.naturalWidth) ? _img.naturalWidth / _img.naturalHeight : 16/9;
        let iW, iH;
        if (cW/cH > a) { iH = cH; iW = cH * a; } else { iW = cW; iH = cW / a; }
        return { left:(cW-iW)/2, top:(cH-iH)/2, width:iW, height:iH };
    }
    function n2s(nx,ny) { const r = imgRect(); return { sx: (r.left + nx*r.width)*scale + offX, sy: (r.top + ny*r.height)*scale + offY }; }
    function s2n(sx,sy) { const r = imgRect(); return { nx: ((sx-offX)/scale - r.left)/r.width, ny: ((sy-offY)/scale - r.top)/r.height }; }
    function getMinScale() { if (!_wrap) return 0.1; const r = imgRect(); return Math.min(_wrap.clientWidth/r.width, _wrap.clientHeight/r.height)*0.9; }

    function applyTransform() {
        if (_inner) _inner.style.transform = `translate(${offX}px,${offY}px) scale(${scale})`;
        positionAll();
    }

    // ── MARKERS ──
    function allMarkers() {
        return [
            ...playerMarkers.map(m => ({...m, source:'player'})),
            ...getGM().map(m => ({...m, source:'gm'}))
        ];
    }

    function createMarkerEl(m) {
        if (m.source === 'gm') return MR.createGMMarkerElForPlayer(m);
        return MR.createPlayerMarkerEl(m, {
            onClick: (marker) => {
                if (!deleteMode) return;
                playerMarkers = playerMarkers.filter(p => p.id !== marker.id);
                savePlayerMarkers();
                const el = _els.get(marker.id);
                if (el) { el.remove(); _els.delete(marker.id); }
                updateDeleteBtn();
            }
        });
    }

    function syncMarkers() {
        if (!_layer) return;
        const all = allMarkers();
        const ids = new Set(all.map(m => m.id));
        for (const [id, el] of _els) { if (!ids.has(id)) { el.remove(); _els.delete(id); } }
        for (const m of all) {
            if (!_els.has(m.id)) {
                const el = createMarkerEl(m);
                _layer.appendChild(el);
                _els.set(m.id, el);
            }
        }
        positionAll();
    }

    function positionAll() {
        for (const m of allMarkers()) {
            const el = _els.get(m.id);
            if (!el) continue;
            const {sx, sy} = n2s(m.nx, m.ny);
            el.style.left = sx + 'px';
            el.style.top = sy + 'px';
        }
    }

    function savePlayerMarkers() { localStorage.setItem('pipboy_player_markers', JSON.stringify(playerMarkers)); }

    // ── UI BUTTONS ──
    function updateTypeButtons() {
        Object.keys(MR.PLAYER_MARKER_DEFS).forEach(k => {
            const btn = document.getElementById('maptype-' + k);
            if (!btn) return;
            btn.style.background = k === selectedType ? 'var(--pip-green)' : 'transparent';
            btn.style.color = k === selectedType ? '#051505' : 'var(--pip-green)';
        });
    }
    function updateDeleteBtn() {
        const btn = document.getElementById('map-delete-mode-btn');
        const toast = document.getElementById('map-delete-toast');
        if (btn) { btn.style.background = deleteMode ? '#ff3333':'transparent'; btn.style.color = deleteMode ? '#051505':'#ff3333'; }
        if (toast) toast.style.display = deleteMode ? 'block':'none';
    }

    // ── PUBLIC API ──
    window.mapZoom = function(d) { scale = Math.max(getMinScale(), Math.min(20, scale+d)); applyTransform(); };
    window.mapReset = function() { scale=1; offX=0; offY=0; applyTransform(); };
    window.mapSelectType = function(t) { selectedType = t; updateTypeButtons(); };
    window.mapToggleDeleteMode = function() { deleteMode = !deleteMode; updateDeleteBtn(); };
    window.focusMapMarker = function(id) { focusedMarkerId = id; window.switchTab('map'); };
    window.getQuestMarker = function(qt) { return getGM().find(m => m.linkedQuest === qt) || null; };

    // ── INTERACTION ──
    function attachListeners() {
        if (_listenersAttached) return;
        _listenersAttached = true;
        const w = _wrap;

        // === MOUSE: drag + click ===
        // Drag detected by distance. If no drag happened -> click (place marker).
        let dragging = false;
        let startX, startY, startOffX, startOffY;
        const DRAG_THRESHOLD = 4;

        w.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            // Don't prevent default — allows text selection in toolbar etc.
            // But we WILL track mouse movement
            dragging = false;
            startX = e.clientX;
            startY = e.clientY;
            startOffX = offX;
            startOffY = offY;

            function onMove(ev) {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                if (!dragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
                    dragging = true;
                }
                if (dragging) {
                    offX = startOffX + dx;
                    offY = startOffY + dy;
                    applyTransform();
                }
            }

            function onUp(ev) {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                if (!dragging) {
                    // It was a click, not a drag
                    handleClick(ev.clientX, ev.clientY);
                }
            }

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        // === WHEEL: zoom ===
        w.addEventListener('wheel', function(e) {
            e.preventDefault();
            const rect = w.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const delta = e.deltaY < 0 ? 0.15 : -0.15;
            const newScale = Math.max(getMinScale(), Math.min(20, scale + delta));
            const ratio = newScale / scale;
            offX = mx - ratio * (mx - offX);
            offY = my - ratio * (my - offY);
            scale = newScale;
            applyTransform();
        }, { passive: false });

        // === TOUCH: drag + pinch zoom ===
        let touchDragging = false;
        let touch1Start = null;
        let touchStartOffX, touchStartOffY;
        let pinchStartDist = 0, pinchStartScale = 1;

        w.addEventListener('touchstart', function(e) {
            if (e.touches.length === 2) {
                // Pinch start
                e.preventDefault();
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                pinchStartDist = Math.sqrt(dx*dx + dy*dy);
                pinchStartScale = scale;
                touchDragging = true; // prevent click
            } else if (e.touches.length === 1) {
                touchDragging = false;
                touch1Start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                touchStartOffX = offX;
                touchStartOffY = offY;
            }
        }, { passive: false }); // non-passive to allow preventDefault on pinch

        w.addEventListener('touchmove', function(e) {
            e.preventDefault(); // prevent page scroll while on map
            if (e.touches.length === 2 && pinchStartDist > 0) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.sqrt(dx*dx + dy*dy);
                scale = Math.max(getMinScale(), Math.min(20, pinchStartScale * dist / pinchStartDist));
                applyTransform();
            } else if (e.touches.length === 1 && touch1Start) {
                const dx = e.touches[0].clientX - touch1Start.x;
                const dy = e.touches[0].clientY - touch1Start.y;
                if (!touchDragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
                    touchDragging = true;
                }
                if (touchDragging) {
                    offX = touchStartOffX + dx;
                    offY = touchStartOffY + dy;
                    applyTransform();
                }
            }
        }, { passive: false });

        w.addEventListener('touchend', function(e) {
            if (!touchDragging && e.changedTouches.length === 1) {
                handleClick(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
            }
            if (e.touches.length === 0) {
                pinchStartDist = 0;
                touch1Start = null;
                touchDragging = false;
            }
        }, { passive: true });

        // Resize observer
        new ResizeObserver(() => { clearTimeout(_resizeTimer); _resizeTimer = setTimeout(positionAll, 80); }).observe(w);
    }

    function handleClick(clientX, clientY) {
        if (deleteMode) return;
        const rect = _wrap.getBoundingClientRect();
        const sx = clientX - rect.left;
        const sy = clientY - rect.top;
        const {nx, ny} = s2n(sx, sy);
        if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;

        const labelInput = document.getElementById('map-label-input');
        const label = labelInput ? labelInput.value.trim() : '';
        const m = { id: 'pm_' + Date.now(), type: selectedType, nx, ny, label, source: 'player' };
        playerMarkers.push({ id: m.id, type: m.type, nx, ny, label });
        savePlayerMarkers();
        if (labelInput) labelInput.value = '';

        const el = createMarkerEl(m);
        _layer.appendChild(el);
        _els.set(m.id, el);
        const {sx: ex, sy: ey} = n2s(nx, ny);
        el.style.left = ex + 'px';
        el.style.top = ey + 'px';
    }

    // ── BUILD DOM ──
    function buildDOM(container) {
        const wrap = document.createElement('div');
        wrap.id = 'map-wrap';

        const btns = Object.entries(MR.PLAYER_MARKER_DEFS).map(([k, v]) =>
            `<button id="maptype-${k}" onclick="window.mapSelectType('${k}')" class="btn--compact"
                style="background:${selectedType === k ? 'var(--pip-green)' : 'transparent'};color:${selectedType === k ? '#051505' : 'var(--pip-green)'};">
                ${v.label}</button>`
        ).join('');

        wrap.innerHTML = `
            <div id="map-toolbar">
                <span class="toolbar-label">Метка:</span>${btns}
                <input id="map-label-input" type="text" placeholder="Подпись" maxlength="30">
                <button id="map-delete-mode-btn" onclick="window.mapToggleDeleteMode()">✕ УДАЛИТЬ</button>
            </div>
            <div id="map-canvas-wrap">
                <div id="map-canvas-inner">
                    <img id="map-img" src="/map.webp" crossorigin="anonymous" alt="Карта" draggable="false">
                    <div class="scanline-map"></div>
                </div>
                <div id="map-markers-overlay"></div>
                <div id="map-zoom-controls">
                    <button onclick="window.mapZoom(0.25)">+</button>
                    <button onclick="window.mapZoom(-0.25)">−</button>
                    <button onclick="window.mapReset()" class="btn-zoom-reset">↺</button>
                </div>
                <div id="map-hint">ЛКМ/тап — метка | зажать — перемещение | колесо/pinch — зум</div>
                <div id="map-delete-toast">РЕЖИМ УДАЛЕНИЯ: нажмите на свою метку</div>
            </div>`;

        container.appendChild(wrap);

        // Cache DOM refs
        _wrap = wrap.querySelector('#map-canvas-wrap');
        _inner = wrap.querySelector('#map-canvas-inner');
        _layer = wrap.querySelector('#map-markers-overlay');
        _img = wrap.querySelector('#map-img');
        _imgReady = _img.complete && !!_img.naturalWidth;
        if (!_imgReady) _img.addEventListener('load', () => { _imgReady = true; positionAll(); }, { once: true });

        // Attach listeners once to this DOM
        _listenersAttached = false;
    }

    // ── RENDER (called on tab switch) ──
    window.modules['map'] = {
        render: function(container) {
            socket.emit('map_request_init');

            const existing = document.getElementById('map-wrap');
            if (existing) {
                // Re-parent existing DOM
                container.innerHTML = '';
                container.appendChild(existing);
            } else {
                container.innerHTML = '';
                buildDOM(container);
            }

            applyTransform();
            attachListeners();
            syncMarkers();
            updateDeleteBtn();
            updateTypeButtons();

            // Focus on specific marker
            if (focusedMarkerId) {
                const all = [...playerMarkers, ...getGM()];
                const target = all.find(m => m.id === focusedMarkerId);
                if (target && _wrap) {
                    scale = 2.5;
                    const r = imgRect();
                    const lx = r.left + target.nx * r.width;
                    const ly = r.top + target.ny * r.height;
                    offX = _wrap.clientWidth / 2 - lx * scale;
                    offY = _wrap.clientHeight / 2 - ly * scale;
                    applyTransform();
                }
                focusedMarkerId = null;
            }
        }
    };

    socket.emit('map_request_init');
})();
