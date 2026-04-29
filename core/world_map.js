// ============================================================================
// WORLD MAP SYSTEM — world_map.js  (REWRITTEN)
//
// Renders the ACTUAL game world that's currently being played.
//
// The previous version generated its own procedural China-style terrain,
// which meant the World Map button always showed the sandbox map even when
// you were playing a scenario with a totally different layout. This version
// reads from `window._tradeWorldRef` (the live worldMap[][] that the engine
// exposes) and downsamples it into a parchment minimap. It also reads
// `window.cities_sandbox` for cities, so it works in both sandbox AND
// scenario mode automatically.
//
// Public API:
//   WorldMap.open()   — opens the overlay
//   WorldMap.close()  — closes it
//   WorldMap.invalidate() — marks the cached minimap as stale (call this
//                           after a scenario is launched so the next open
//                           re-samples the new terrain)
//
// Close button is in the TOP LEFT corner.
// Pinch-to-zoom + drag-to-pan supported on mobile and desktop.
// ============================================================================

(function () {
    "use strict";

    // ── DISPLAY DIMENSIONS ────────────────────────────────────────────────
    // The minimap canvas is a fixed-size, downsampled version of the live
    // worldMap. We keep a 4 : 3 aspect ratio (matching WORLD_WIDTH / HEIGHT)
    // and sample one pixel per tile for crisp edges.
    const WM_TILE_PX  = 8;          // minimap pixels per source tile
    let WM_COLS       = 250;        // updated dynamically when sampling
    let WM_ROWS       = 187;
    let DISPLAY_W     = WM_COLS * WM_TILE_PX;
    let DISPLAY_H     = WM_ROWS * WM_TILE_PX;

    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent)
                   || window.innerWidth < 900;

    // ── MODULE STATE ──────────────────────────────────────────────────────
    let cachedBgCanvas    = null;   // Pre-rendered minimap parchment
    let cachedSourceSig   = null;   // Hash of source dims so we re-render on change
    let overlayEl         = null;
    let mainCanvas        = null;
    let mainCtx           = null;
    let drawerObserver    = null;
    let autoCloseTimeout  = null;
    let countdownInterval = null;
    let secondsLeft       = 20;

    // ── ZOOM & PAN STATE ──────────────────────────────────────────────────
    let mapCam      = { x: 0, y: 0, zoom: 1 };
    let isPanning   = false;
    let lastMousePos = { x: 0, y: 0 };

    // ── PALETTE FALLBACK ──────────────────────────────────────────────────
    // Used only if a worldMap tile happens to be missing a `.color` field.
    const PALETTE_FALLBACK = {
        Ocean:     "#2b4a5f", Coastal:   "#3a5f75",
        Desert:    "#bfa373", Dunes:     "#cfae7e",
        Plains:    "#a3a073", Steppes:   "#a3a073", Meadow: "#6b7a4a",
        Forest:    "#425232", "Dense Forest": "#244222",
        Highlands: "#626b42", Mountains: "#3E2723", "Large Mountains": "#7B5E3F",
        River:     "#3a5f75"
    };

    // ── JOYSTICK TOGGLE (preserve old behavior) ───────────────────────────
    function toggleJoysticks(show) {
        const joysticks = document.querySelectorAll(
            '#joystick-zone, #nipple-container, .joystick-container, #mobile-controls'
        );
        joysticks.forEach(el => { el.style.display = show ? '' : 'none'; });
    }

    // ╔══════════════════════════════════════════════════════════════════════╗
    // ║ MINIMAP SAMPLING                                                     ║
    // ║                                                                      ║
    // ║ Downsamples the live worldMap into a parchment-styled canvas.        ║
    // ║ Strategy: one minimap pixel per source tile (or block-averaged if    ║
    // ║ the source is huge). Then a parchment vignette is overlaid.          ║
    // ║                                                                      ║
    // ║ THIS IS THE KEY DIFFERENCE from the old world_map.js: we read the    ║
    // ║ engine's actual worldMap rather than running our own noise pass.     ║
    // ╚══════════════════════════════════════════════════════════════════════╝
    function sampleEngineWorldMap() {
        const worldMap = window._tradeWorldRef;
        if (!worldMap || !worldMap.length) {
            // Engine not booted (or no scenario / sandbox loaded yet). Show
            // a stub canvas with a friendly message.
            return null;
        }

        const srcCols = worldMap.length;
        const srcRows = worldMap[0] ? worldMap[0].length : 0;
        if (!srcCols || !srcRows) return null;

        // Update minimap dims to match source aspect (capped to keep canvas reasonable)
const maxSide = isMobile ? 1024 : 2048; //  
        const ratio   = Math.min(maxSide / (srcCols * WM_TILE_PX), maxSide / (srcRows * WM_TILE_PX));
        const tilePx  = Math.max(1, Math.floor(WM_TILE_PX * Math.min(1, ratio)));

        WM_COLS    = srcCols;
        WM_ROWS    = srcRows;
        DISPLAY_W  = WM_COLS * tilePx;
        DISPLAY_H  = WM_ROWS * tilePx;

        const bg  = document.createElement('canvas');
        bg.width  = DISPLAY_W;
        bg.height = DISPLAY_H;
        const bgc = bg.getContext('2d', { alpha: false });

        // ── PASS 1: paint the tile colors ─────────────────────────────────
        for (let i = 0; i < srcCols; i++) {
            for (let j = 0; j < srcRows; j++) {
                const t = worldMap[i][j];
                if (!t) continue;
                bgc.fillStyle = t.color || PALETTE_FALLBACK[t.name] || "#888888";
                bgc.fillRect(i * tilePx, j * tilePx, tilePx, tilePx);
            }
        }

        // ── PASS 2: minimal cosmetic dotting ──────────────────────────────
        // We don't try to replicate the full sandbox painting pass at this
        // size — at 4 px/tile it would just look like noise. Instead we add
        // small forest dots and mountain marks for readability.
        for (let i = 0; i < srcCols; i++) {
            for (let j = 0; j < srcRows; j++) {
                const t = worldMap[i][j];
                if (!t) continue;
                const px = i * tilePx, py = j * tilePx;
                if (t.name && (t.name.includes("Mountain") || t.name === "Large Mountains")) {
                    if (Math.random() > 0.85) {
                        bgc.fillStyle = "rgba(40,30,20,0.6)";
                        bgc.fillRect(px + tilePx * 0.25, py - tilePx * 0.2,
                                     tilePx * 0.5, tilePx * 0.7);
                    }
                } else if (t.name && (t.name.includes("Forest") || t.name === "Dense Forest")) {
                    if (Math.random() > 0.7) {
                        bgc.fillStyle = "rgba(20,40,15,0.5)";
                        bgc.beginPath();
                        bgc.arc(px + tilePx / 2, py + tilePx / 2, tilePx * 0.35, 0, Math.PI * 2);
                        bgc.fill();
                    }
                }
            }
        }

        // ── PASS 3: parchment vignette (matches sandbox + scenario styling)
        bgc.globalCompositeOperation = "multiply";
        bgc.fillStyle = "#e0c9a3";
        bgc.fillRect(0, 0, DISPLAY_W, DISPLAY_H);

        const grad = bgc.createRadialGradient(
            DISPLAY_W / 2, DISPLAY_H / 2, DISPLAY_H * 0.3,
            DISPLAY_W / 2, DISPLAY_H / 2, DISPLAY_W  * 0.6
        );
        grad.addColorStop(0,   "rgba(255, 255, 255, 0)");
        grad.addColorStop(0.7, "rgba(139, 69, 19, 0.4)");
        grad.addColorStop(1,   "rgba(0, 0, 0, 0.8)");
        bgc.fillStyle = grad;
        bgc.fillRect(0, 0, DISPLAY_W, DISPLAY_H);
        bgc.globalCompositeOperation = "source-over";

        cachedBgCanvas  = bg;
        cachedSourceSig = `${srcCols}x${srcRows}x${tilePx}`;
        return bg;
    }

    // ── PLAYER / CITY / COMPASS DRAWING ──────────────────────────────────
    function drawPlayer(ctx) {
        if (typeof window.player === 'undefined') return;
        const WW = window.WORLD_WIDTH_sandbox  || 4000;
        const WH = window.WORLD_HEIGHT_sandbox || 3000;
        const px = (window.player.x / WW) * DISPLAY_W;
        const py = (window.player.y / WH) * DISPLAY_H;
        ctx.save();
        ctx.shadowColor = '#ffca28'; ctx.shadowBlur = 15;
        ctx.strokeStyle = '#ffca28'; ctx.lineWidth = 3.0 / mapCam.zoom;
        ctx.beginPath(); ctx.arc(px, py, 12 / mapCam.zoom, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(px, py, 6 / mapCam.zoom, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    function drawCities(ctx) {
        const cities = window.cities_sandbox || [];
        if (!cities.length) return;
        const WW = window.WORLD_WIDTH_sandbox  || 4000;
        const WH = window.WORLD_HEIGHT_sandbox || 3000;
        const FACTIONS = window.FACTIONS || {};

        cities.forEach(city => {
            if (!city) return;
            const cx = (city.x / WW) * DISPLAY_W;
            const cy = (city.y / WH) * DISPLAY_H;

            // Faction color — prefer FACTIONS lookup over city.color so a
            // post-launch faction recolor immediately reflects on the map.
            const fac = FACTIONS[city.faction] || {};
            const color = fac.color || city.color || "#f5d76e";

            ctx.beginPath();
            ctx.arc(cx, cy, 4 / mapCam.zoom, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = "#1a1a1a";
            ctx.lineWidth = 1.5 / mapCam.zoom;
            ctx.stroke();

            // Show city names when zoomed in enough
            if (mapCam.zoom > 1.4 && city.name) {
                const fontSize = Math.max(8, 14 / mapCam.zoom);
                ctx.font = `bold ${fontSize}px Georgia`;
                ctx.textAlign = "center";
                ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
                ctx.lineWidth = 3 / mapCam.zoom;
                ctx.strokeText(city.name, cx, cy - (8 / mapCam.zoom));
                ctx.fillStyle = "#ffffff";
                ctx.fillText(city.name, cx, cy - (8 / mapCam.zoom));
            }
        });
    }
function drawCompass(ctx) {
        ctx.save();
        
        // 1. Move to the top right corner — offset increased to accommodate the
        //    larger compass (3× previous size: scale 0.6 instead of 0.2).
        //    Furthest drawn point is r+18 = 42 units; at 0.6 scale that is
        //    ~25 px, so we need at least 30 px margin from each edge.
        ctx.translate(DISPLAY_W - 50, 50); 
        
        // 2. Scale: was 0.2 (5× shrink); now 0.6 = 3× bigger than before.
        ctx.scale(0.6, 0.6); 

        // 3. Draw exactly as before, but relative to our new 0,0 center
        const cx = 0, cy = 0, r = 24;
        
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6;
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#bf9540'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.strokeStyle = '#eeeeee';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - r + 4); ctx.stroke();
        ctx.strokeStyle = '#ff3333';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + r - 4); ctx.stroke();
        ctx.font = 'bold 14px Georgia';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ff3333'; ctx.fillText('S', cx, cy + r + 18);
        ctx.fillStyle = '#aaa';
        ctx.fillText('N', cx, cy - r - 18);
        ctx.fillText('E', cx + r + 16, cy);
        ctx.fillText('W', cx - r - 16, cy);
        
        ctx.restore();
    }
    // ── MAIN RENDER LOOP ─────────────────────────────────────────────────
    function redrawMap() {
        if (!mainCtx) return;

        // Re-sample the engine map if our cache is stale (or never built)
        if (!cachedBgCanvas) {
            const sampled = sampleEngineWorldMap();
            if (!sampled) {
                // No engine data yet — show a friendly placeholder
                mainCanvas.width  = 480;
                mainCanvas.height = 360;
                mainCtx.fillStyle = '#2b4a5f';
                mainCtx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);
                mainCtx.fillStyle = '#f5d76e';
                mainCtx.font = 'bold 18px Georgia';
                mainCtx.textAlign = 'center';
                mainCtx.fillText('World map not yet available', mainCanvas.width / 2, mainCanvas.height / 2 - 10);
                mainCtx.font = '14px Georgia';
                mainCtx.fillText('(Start a game first)', mainCanvas.width / 2, mainCanvas.height / 2 + 20);
                return;
            }
            // Resize the visible canvas to match
            mainCanvas.width  = DISPLAY_W;
            mainCanvas.height = DISPLAY_H;
        }

        mainCtx.save();
        mainCtx.clearRect(0, 0, DISPLAY_W, DISPLAY_H);

        // Apply camera transform (zoom around center, then pan)
        mainCtx.translate(DISPLAY_W / 2, DISPLAY_H / 2);
        mainCtx.scale(mapCam.zoom, mapCam.zoom);
        mainCtx.translate(-DISPLAY_W / 2 + mapCam.x, -DISPLAY_H / 2 + mapCam.y);

        mainCtx.imageSmoothingEnabled = false;
        mainCtx.drawImage(cachedBgCanvas, 0, 0, DISPLAY_W, DISPLAY_H);
        drawCities(mainCtx);
        drawPlayer(mainCtx);

        mainCtx.restore();

        // Compass is drawn in screen space
        drawCompass(mainCtx);
    }

    // ── BUILD OVERLAY DOM ────────────────────────────────────────────────
    function buildOverlay() {
        if (document.getElementById('world-map-overlay')) {
            overlayEl = document.getElementById('world-map-overlay');
            return;
        }

        overlayEl = document.createElement('div');
        overlayEl.id = 'world-map-overlay';
        overlayEl.style.cssText = [
            'display:none', 'position:fixed', 'inset:0',
            'background:rgba(5,5,10,0.98)', 'z-index:9999',
            'flex-direction:column', 'align-items:center',
            'justify-content:center', 'overflow:hidden',
            'font-family:Georgia,serif',
        ].join(';');

        // CLOSE BUTTON — top left
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
            position: absolute; top: 15px; left: 15px;
            width: 50px; height: 50px; border-radius: 50%;
            background: #900000; border: 3px solid #ffca28; color: #fff;
            font-size: 24px; font-weight: bold; z-index: 10001;
            box-shadow: 0 4px 15px rgba(0,0,0,0.8);
            cursor: pointer; touch-action: manipulation;
            display: flex; align-items: center; justify-content: center;
        `;
        closeBtn.addEventListener('click', closeMap);
        overlayEl.appendChild(closeBtn);

        // Active-scenario name banner (shows the user what they're looking at)
        const banner = document.createElement('div');
        banner.id = 'world-map-banner';
        banner.style.cssText = `
            position: absolute; top: 25px; left: 50%; transform: translateX(-50%);
            color: #f5d76e; font-size: 14px; font-weight: bold;
            text-shadow: 0 2px 4px rgba(0,0,0,0.9); z-index: 10001;
            background: rgba(0,0,0,0.5); padding: 5px 15px; border-radius: 20px;
            border: 1px solid #d4b886; max-width: 60vw;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        `;
        overlayEl.appendChild(banner);

        // Auto-close countdown
        const timerText = document.createElement('div');
        timerText.id = 'world-map-timer';
        timerText.style.cssText = `
            position: absolute; bottom: 15px; left: 50%; transform: translateX(-50%);
            color: #aaa; font-size: 12px; z-index: 10001;
            background: rgba(0,0,0,0.5); padding: 4px 10px; border-radius: 12px;
        `;
        overlayEl.appendChild(timerText);

        // Map canvas
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:100%;max-width:1000px;display:flex;align-items:center;justify-content:center;padding:10px;box-sizing:border-box;';

        mainCanvas = document.createElement('canvas');
        mainCanvas.width  = 480;
        mainCanvas.height = 360;
        mainCanvas.style.cssText = 'border:3px solid #d4b886;border-radius:6px;width:100%;height:auto;max-height:85vh;object-fit:contain;background:#2b4a5f;box-shadow:0 10px 30px rgba(0,0,0,0.8);';
        mainCtx = mainCanvas.getContext('2d');

        wrapper.appendChild(mainCanvas);
        overlayEl.appendChild(wrapper);
        document.body.appendChild(overlayEl);
    }

    // ── INTERACTION (pan + zoom) ─────────────────────────────────────────
    function addMapControls() {
        // Mouse wheel zoom
        overlayEl.addEventListener('wheel', e => {
            e.preventDefault();
            mapCam.zoom -= e.deltaY * 0.0015;
            mapCam.zoom = Math.min(Math.max(mapCam.zoom, 1), 5);
            redrawMap();
        }, { passive: false });

        // Mouse pan
        overlayEl.addEventListener('mousedown', e => {
            isPanning = true;
            lastMousePos = { x: e.clientX, y: e.clientY };
        });
        window.addEventListener('mousemove', e => {
            if (!isPanning || overlayEl.style.display === 'none') return;
            const dx = (e.clientX - lastMousePos.x) / mapCam.zoom;
            const dy = (e.clientY - lastMousePos.y) / mapCam.zoom;
            mapCam.x += dx; mapCam.y += dy;
            lastMousePos = { x: e.clientX, y: e.clientY };
            redrawMap();
        });
        window.addEventListener('mouseup',    () => isPanning = false);
        window.addEventListener('mouseleave', () => isPanning = false);

        // Mobile: pan + pinch zoom
        let initialPinchDist = null;
        let initialZoom = 1;
        overlayEl.addEventListener('touchstart', e => {
            if (e.touches.length === 1) {
                isPanning = true;
                lastMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            } else if (e.touches.length === 2) {
                isPanning = false;
                initialPinchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                initialZoom = mapCam.zoom;
            }
        }, { passive: false });
        overlayEl.addEventListener('touchmove', e => {
            e.preventDefault();
            if (isPanning && e.touches.length === 1) {
                const dx = (e.touches[0].clientX - lastMousePos.x) / mapCam.zoom;
                const dy = (e.touches[0].clientY - lastMousePos.y) / mapCam.zoom;
                mapCam.x += dx; mapCam.y += dy;
                lastMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                redrawMap();
            } else if (e.touches.length === 2 && initialPinchDist) {
                const cur = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                mapCam.zoom = Math.min(Math.max(initialZoom * (cur / initialPinchDist), 1), 5);
                redrawMap();
            }
        }, { passive: false });
        overlayEl.addEventListener('touchend', () => {
            isPanning = false;
            initialPinchDist = null;
        });
    }

    // ── OPEN / CLOSE ─────────────────────────────────────────────────────
    function openMap() {
        buildOverlay();
        if (!mainCtx) return;

        if (!window._mapControlsAdded) {
            addMapControls();
            window._mapControlsAdded = true;
        }

        // Update the banner with active scenario name (or "Sandbox")
        const banner = document.getElementById('world-map-banner');
        if (banner) {
            const sc = window.__activeScenario;
            banner.textContent = sc ? `🗺 ${sc.meta?.name || 'Scenario'}` : '🗺 Sandbox World';
        }

        window.isMobileDrawerOpen = true;
        toggleJoysticks(false);
        overlayEl.style.display = 'flex';

        // Auto-close timer
        secondsLeft = 20;
        const timerEl = document.getElementById('world-map-timer');
        if (timerEl) timerEl.innerText = `Auto-closing in ${secondsLeft}s`;
        clearInterval(countdownInterval); clearTimeout(autoCloseTimeout);
        countdownInterval = setInterval(() => {
            secondsLeft--;
            if (timerEl) timerEl.innerText = `Auto-closing in ${secondsLeft}s`;
            if (secondsLeft <= 0) clearInterval(countdownInterval);
        }, 1000);
        autoCloseTimeout = setTimeout(() => closeMap(), 20000);

        // Reset camera each time so users see the full map
        mapCam = { x: 0, y: 0, zoom: 1 };

        // Render
        if (!cachedBgCanvas) {
            mainCtx.fillStyle = '#2b4a5f';
            mainCtx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);
            mainCtx.fillStyle = '#f5d76e';
            mainCtx.font = 'bold 24px Georgia';
            mainCtx.textAlign = 'center';
            mainCtx.fillText('Loading World Map...', mainCanvas.width / 2, mainCanvas.height / 2);
            requestAnimationFrame(() => requestAnimationFrame(redrawMap));
        } else {
            requestAnimationFrame(redrawMap);
        }
    }

    function closeMap() {
        clearInterval(countdownInterval);
        clearTimeout(autoCloseTimeout);
        if (overlayEl) overlayEl.style.display = 'none';
        window.isMobileDrawerOpen = false;
        toggleJoysticks(true);
        if (window.mobileUI && typeof window.mobileUI.openDetailDrawer === 'function') {
            window.mobileUI.openDetailDrawer();
        }
    }

    // ── INVALIDATE (call after a scenario launches) ──────────────────────
    function invalidate() {
        cachedBgCanvas  = null;
        cachedSourceSig = null;
        console.log("[WorldMap] Cache invalidated — next open will re-sample engine map.");
    }

    // Auto-invalidate when ScenarioRuntime finishes applying a scenario.
    // We poll briefly because scenario_update.js may load before us.
    (function watchScenarioChanges() {
        let lastSig = null;
        setInterval(() => {
            const sc = window.__activeScenario;
            const sig = sc ? `${sc.meta?.name}:${sc.dimensions?.tilesX}x${sc.dimensions?.tilesY}` : null;
            if (sig !== lastSig) {
                lastSig = sig;
                if (sig) invalidate();
            }
        }, 1000);
    })();

    // ── INJECT BUTTON INTO MOBILE DRAWER ─────────────────────────────────
    function injectButton() {
        if (document.getElementById('mob-worldmap-btn')) return;

 

        const dipBtn = document.getElementById('mob-dip-btn');
        if (!dipBtn) return;

        const btn = document.createElement('button');
        btn.id = 'mob-worldmap-btn';
        btn.className = 'menu-btn';
        btn.style.cssText = 'width:100%;margin-top:10px;padding:14px 10px;background:linear-gradient(to bottom,#0a2040,#040f20);border:1px solid #4a90d9;color:#6ab4ff;font-family:Georgia,serif;font-size:15px;font-weight:bold;text-transform:uppercase;cursor:pointer;border-radius:4px;';
        btn.innerHTML = '🗺️ World Map';
        btn.addEventListener('click', () => {
            if (window.mobileUI) window.mobileUI.closeDetailDrawer();
            setTimeout(openMap, 150);
        });

        dipBtn.insertAdjacentElement('afterend', btn);
    }

    function init() {
        const body = document.getElementById('mob-detail-body');
        if (body) {
            injectButton();
            drawerObserver = new MutationObserver(() => injectButton());
            drawerObserver.observe(body, { childList: true });
            return;
        }
        let tries = 0;
        const poll = setInterval(() => {
            const b = document.getElementById('mob-detail-body');
            if (b) {
                clearInterval(poll);
                injectButton();
                drawerObserver = new MutationObserver(() => injectButton());
                drawerObserver.observe(b, { childList: true });
            } else if (++tries > 100) clearInterval(poll);
        }, 100);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.WorldMap = { open: openMap, close: closeMap, invalidate };

    console.log("[WorldMap] world_map.js loaded — renders live engine worldMap.");
})();
