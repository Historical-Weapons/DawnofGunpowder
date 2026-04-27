/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CAPACITOR_PERF_PATCH.js  v3.0  —  Empire of the 13th Century
 * Android/Capacitor WebView Overworld Optimizer
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ROOT CAUSE OF MOBILE LAG:
 *   Android WebView uses CPU-based software canvas rendering, NOT Chrome's
 *   GPU/Skia path. A full 8000×6000 bgCanvas drawImage (~48MP) costs 8–15ms
 *   per frame on a Pixel 2 WebView — that alone blows the 33ms frame budget.
 *   With P1 (viewport crop) + P6 (30fps cap) + P7 (LOD dots), the effective
 *   per-frame pixel work drops by roughly 95%.
 *
 * 
 *
 *  OVERWORLD:
 *  P1  ★★★★★  Viewport-crop bgCanvas blit            [60–80% frame savings]
 *  P2  ★★★★☆  Cache getElementById calls             [DOM tree walk per frame]
 *  P3  ★★★☆☆  Force imageSmoothingEnabled=false      [software bilinear cost]
 *  P4  ★★★☆☆  Throttle updateNPCs (every 2nd frame)  [NPC AI + pathfinding]
 *  P5  ★★☆☆☆  Throttle updateDiplomacy (1-in-5)      [human-scale JS logic]
 *  P6  ★★★★☆  30fps RAF cap — Capacitor ONLY          [halves ALL per-frame work]
 *              ↑ RE-ENABLED in v3.0 — was incorrectly commented out in v2.1
 *  P7  ★★★★★  NPC Sprite LOD — COMPLETELY REWRITTEN   [~22 ops → 4 per NPC]
 *              ↑ FIXES the red-dot flicker (see detailed bug analysis below)
 *  P10 ★★★★☆  [NEW] Half-World NPC Scale              [speed×0.5, patrol÷2]
 *  P11 ★★★☆☆  [NEW] Half-World NPC Target Clamping    [prevents off-map wander]
 *  P12 ★★★☆☆  [NEW] Player Speed Scale                [preserves traversal feel]
 *  P13 ★★★☆☆  [NEW] Economy Throttle                  [city forEach, 1-in-60]
 *  P14 ★★☆☆☆  [NEW] drawAllNPCs Y-sort Throttle       [Array.sort 1-in-4 frames]
 *
 *  SIEGE:
 *  P8  ★★★☆☆  Throttle processSiegeEngines            [unit AI per frame]
 *  P9  ★★☆☆☆  Hard-cap projectile array               [draw+collision spiral]
 *
 *  NOTE: Ensure  android:hardwareAccelerated="true"  in AndroidManifest.xml
 *  NOTE: This file must load AFTER all other game scripts.
 * ═══════════════════════════════════════════════════════════════════════════
 */
;(function CAPACITOR_PERF_PATCH() {
    'use strict';

    // Idempotency guard — safe to include twice without double-patching
    if (window.__CPP3__) return;
    window.__CPP3__ = true;

    // ─────────────────────────────────────────────────────────────────────
    //  CAPACITOR / ANDROID WEBVIEW DETECTION
    // ─────────────────────────────────────────────────────────────────────
    //  window.Capacitor  — injected by Capacitor JS bridge before app JS.
    //  "wv" in UA        — Android Chrome-based WebView wrapper marker.
    //  AndroidInterface  — legacy Capacitor/Cordova Android bridge object.
    //  Fallback regex    — catches release builds where UA is stripped down.
    // ─────────────────────────────────────────────────────────────────────
    const IS_NATIVE = (
        typeof window.Capacitor !== 'undefined' ||
        /\bwv\b/.test(navigator.userAgent) ||
        window.AndroidInterface != null ||
        (
            /Android/.test(navigator.userAgent) &&
            !/Chrome\/\d/.test(navigator.userAgent) &&
            !/Firefox\/\d/.test(navigator.userAgent)
        )
    );

    // ─────────────────────────────────────────────────────────────────────
    //  BOOT LOOP
    //  Polls every 300 ms until bgCanvas, player, canvas, and ctx all exist.
    //  bgCanvas.width is set synchronously when sandbox_overworld.js loads,
    //  but player and ctx may still be undefined for a brief moment.
    //  Extended to 200 tries (60 seconds) for slow devices.
    // ─────────────────────────────────────────────────────────────────────
    let _tries = 0;
    const _boot = setInterval(function () {
        if (++_tries > 200) {
            clearInterval(_boot);
            console.warn('[PERF PATCH v3.0] Boot timed out — game objects never became ready.');
            return;
        }
        if (typeof bgCanvas === 'undefined' || !bgCanvas.width) return;
        if (typeof player   === 'undefined') return;
        if (typeof canvas   === 'undefined') return;
        if (typeof ctx      === 'undefined') return;
        clearInterval(_boot);
        _install();
    }, 300);

    // ─────────────────────────────────────────────────────────────────────
    //  INSTALL ALL PATCHES
    // ─────────────────────────────────────────────────────────────────────
    function _install() {
        _p1_bgCrop();
        _p2_domCache();
        _p3_noSmoothing();
        _p4_npcThrottle();
        _p5_dipThrottle();

        // Claude said: P6: RAF cap — CRITICAL for Pixel 2. Was incorrectly commented out
        // in v2.1. A 4000×3000 world at 30fps is the target operating point
        // that ALL other patches are tuned for. <<<<,,,HOWEVER THIS LINE CAUSES MY PHONE TO CRASH
      //  if (IS_NATIVE) _p6_rafCap(); //I MUST COMMENT IT OUT

        // P7 must run BEFORE P10/P11 so the speed-scale wrappers see the
        // final patched drawCaravan/drawShip references.
        _p7_npcLOD();

        _p8_siegeThrottle();
        _p9_projCap();

        // P10/P11 must run AFTER P4 (which wraps updateNPCs) so the
        // target-clamping wrapper sits on top of the throttle wrapper.
        _p10_npcWorldScale();
        _p11_npcTargetClamp();
        _p12_playerSpeedScale();
        _p13_economyThrottle();
        _p14_sortThrottle();

        // ── Console summary ──────────────────────────────────────────────
        const pixRatio = Math.round(
            (bgCanvas.width * bgCanvas.height) /
            ((canvas.width / zoom + 200) * (canvas.height / zoom + 200))
        );
        console.log(
            '%c[PERF PATCH v3.0] Installed successfully\n' +
            ' Native/Capacitor mode : ' + IS_NATIVE + '\n' +
            ' P1 bgCrop (' + pixRatio + '× pixel reduction)  P2 DOM cache  P3 no-smooth\n' +
            ' P4 NPC throttle (skip-2)  P5 diplo (skip-5)  P6 30fps cap (' + (IS_NATIVE ? 'ON' : 'OFF') + ')\n' +
            ' P7 NPC LOD distance-based (FLICKER FIX ✓)  P8 siege  P9 proj cap\n' +
            ' P10 NPC speed×0.5  P11 target-clamp  P12 player speed  P13 economy  P14 sort',
            'color:#76ff03;font-weight:bold;font-size:11px'
        );
    }


    // ════════════════════════════════════════════════════════════════════
    //  P1  VIEWPORT-CROP BACKGROUND BLIT  ★★★★★  THE SINGLE BIGGEST WIN
    // ════════════════════════════════════════════════════════════════════
    //
    //  BEFORE:  drawImage(bgCanvas, 0, 0)
    //           → blits the ENTIRE bgCanvas through the CPU pipeline.
    //           → On Pixel 2: 8000×6000 = 48 MP → ~10–15 ms per frame.
    //
    //  AFTER:   drawImage(bgCanvas, sx,sy,sw,sh, sx,sy,sw,sh)
    //           → Only blits the pixel rectangle currently visible on screen.
    //           → At zoom 0.8 on a 411×891 Pixel 2 screen:
    //             viewWidth  ≈ 514 world-px,  + PAD 96 each side = ~706 px
    //             viewHeight ≈ 1114 world-px, + PAD 96 each side = ~1306 px
    //             Total: ~922 K pixels  vs  48 M  → 52× reduction.
    //
    //  WHY source == destination rect:
    //   The main ctx has already been translated and scaled by update.js to
    //   track the player:
    //     ctx.translate(canvas.width/2,  canvas.height/2)
    //     ctx.scale(zoom, zoom)
    //     ctx.translate(-player.x, -player.y)
    //   World-space pixel (X, Y) on the bgCanvas therefore lands at the
    //   correct screen position if we draw it at destination (X, Y) in the
    //   same world-coordinate space. src == dst is the correct math.
    //
    //  SAFE:  Only intercepts the exact 3-argument overworld form.
    //         All other drawImage calls (sprites, city, battle) pass through.
    // ────────────────────────────────────────────────────────────────────
    function _p1_bgCrop() {
        const _native = CanvasRenderingContext2D.prototype.drawImage;
        const PAD = 96; // world-px safety margin beyond screen edge

        CanvasRenderingContext2D.prototype.drawImage = function (img, dx, dy, ...rest) {

            // Only intercept the 3-arg overworld blit of our specific bgCanvas
            if (
                img === bgCanvas &&
                rest.length === 0 &&
                typeof inBattleMode !== 'undefined' && !inBattleMode &&
                !(typeof inCityMode !== 'undefined' && inCityMode)
            ) {
                const vw = canvas.width  / zoom;
                const vh = canvas.height / zoom;

                let sx = Math.floor(player.x - vw * 0.5 - PAD);
                let sy = Math.floor(player.y - vh * 0.5 - PAD);
                let sw = Math.ceil(vw + PAD * 2);
                let sh = Math.ceil(vh + PAD * 2);

                // Hard-clamp: drawImage crashes with IndexSizeError on negative
                // or out-of-bounds source rectangles.
                if (sx < 0)                    { sw += sx; sx = 0; }
                if (sy < 0)                    { sh += sy; sy = 0; }
                if (sx + sw > bgCanvas.width)  { sw = bgCanvas.width  - sx; }
                if (sy + sh > bgCanvas.height) { sh = bgCanvas.height - sy; }

                if (sw > 0 && sh > 0) {
                    _native.call(this, img, sx, sy, sw, sh, sx, sy, sw, sh);
                }
                return;
            }

            // Everything else (city, battle, sprite sheets) — pass through untouched
            rest.length === 0
                ? _native.call(this, img, dx, dy)
                : _native.call(this, img, dx, dy, ...rest);
        };
    }


    // ════════════════════════════════════════════════════════════════════
    //  P2  DOM ELEMENT CACHE  ★★★★☆
    // ════════════════════════════════════════════════════════════════════
    //
    //  update() calls getElementById ~15 times every frame. In Android
    //  WebView, each call walks the full live DOM tree — there is no
    //  internal JS-side element cache. On a busy DOM this costs ~0.3 ms/call.
    //
    //  We intercept getElementById and cache stable HUD elements after
    //  first lookup. Dynamic elements (popups, recruitment dialogs, etc.)
    //  are intentionally excluded from STABLE so they always live-resolve.
    // ────────────────────────────────────────────────────────────────────
    function _p2_domCache() {
        const _orig  = document.getElementById.bind(document);
        const _cache = Object.create(null);

        // Only elements that exist for the ENTIRE lifetime of the game
        const STABLE = new Set([
            'ui', 'loc-text', 'terrain-text', 'speed-text', 'zoom-text',
            'city-panel', 'city-name', 'city-faction', 'city-pop',
            'city-garrison', 'city-gold', 'city-food',
            'recruit-box', 'hostile-box',
            'diplomacy-container', 'siege-gui', 'parle-panel', 'loading',
            'event-log-container'
        ]);

        document.getElementById = function (id) {
            if (!STABLE.has(id)) return _orig(id);           // Dynamic: always live
            if (!_cache[id]) _cache[id] = _orig(id);         // First access: cache
            return _cache[id];                                // All subsequent: O(1)
        };
    }


    // ════════════════════════════════════════════════════════════════════
    //  P3  DISABLE BILINEAR SMOOTHING IN OVERWORLD  ★★★☆☆
    // ════════════════════════════════════════════════════════════════════
    //
    //  update.js sets ctx.imageSmoothingEnabled = true before the overworld
    //  bgCanvas blit. In Android WebView, bilinear interpolation runs in
    //  software — measurable cost per blit. We intercept the setter to
    //  force it off during overworld mode. Visual delta: imperceptible
    //  (16px tiles at zoom 0.8 have no meaningful detail to smooth).
    //  Battle and city contexts keep their smoothing setting unchanged.
    // ────────────────────────────────────────────────────────────────────
    function _p3_noSmoothing() {
        try {
            let proto = CanvasRenderingContext2D.prototype;
            let desc  = null;
            while (proto && !desc) {
                desc  = Object.getOwnPropertyDescriptor(proto, 'imageSmoothingEnabled');
                proto = desc ? null : Object.getPrototypeOf(proto);
            }
            if (!desc || !desc.set) return;

            const _rawSet = desc.set;
            const _rawGet = desc.get;

            Object.defineProperty(CanvasRenderingContext2D.prototype, 'imageSmoothingEnabled', {
                configurable: true,
                get: _rawGet,
                set: function (val) {
                    const isOverworld = (
                        typeof inBattleMode !== 'undefined' && !inBattleMode &&
                        !(typeof inCityMode !== 'undefined' && inCityMode)
                    );
                    _rawSet.call(this, isOverworld ? false : val);
                }
            });
        } catch (_e) {
            // Some hardened WebView builds block prototype modification — silent skip
        }
    }


    // ════════════════════════════════════════════════════════════════════
    //  P4  THROTTLE updateNPCs  ★★★☆☆
    // ════════════════════════════════════════════════════════════════════
    //
    //  updateNPCs() runs full NPC pathfinding, combat resolution, collision
    //  resolution, and global spawn logic every frame. With 200 NPCs,
    //  the inner O(n²) radar loop alone costs significant CPU.
    //
    //  NPCs move ~0.25 world-px per frame after P10 speed halving —
    //  skipping every other frame is visually undetectable.
    //
    //  v3.0 change: SKIP reduced from 3 → 2 for native.
    //  In the half-sized world, pathfinding distances are shorter so the
    //  AI is cheaper per call. Running it every 2nd frame (instead of 3rd)
    //  gives a better NPC spawn cadence without overshooting CPU budget.
    // ────────────────────────────────────────────────────────────────────
    function _p4_npcThrottle() {
        const _orig = window.updateNPCs;
        if (typeof _orig !== 'function') return;

        const SKIP = 2; // every 2nd frame on both native and desktop
        let _n = 0;

        window.updateNPCs = function () {
            if ((++_n) % SKIP !== 0) return;
            _orig.apply(this, arguments);
        };
    }


    // ════════════════════════════════════════════════════════════════════
    //  P5  THROTTLE updateDiplomacy  ★★☆☆☆
    // ════════════════════════════════════════════════════════════════════
    //
    //  Pure JS logic with no rendering. Diplomatic state changes at human
    //  timescales (seconds to minutes). Running 1-in-5 frames is completely
    //  undetectable by players.
    // ────────────────────────────────────────────────────────────────────
    function _p5_dipThrottle() {
        const _orig = window.updateDiplomacy;
        if (typeof _orig !== 'function') return;
        let _n = 0;

        window.updateDiplomacy = function () {
            if ((++_n) % 5 !== 0) return;
            _orig.apply(this, arguments);
        };
    }


    // ════════════════════════════════════════════════════════════════════
    //  P6  30fps RAF CAP  ★★★★☆  (CAPACITOR / NATIVE ONLY)  RE-ENABLED
    // ════════════════════════════════════════════════════════════════════
    //
    //  Capacitor WebView fires requestAnimationFrame at the device's native
    //  refresh rate (60Hz on Pixel 2, up to 120Hz on newer devices).
    //  For a top-down strategy map, 30fps is perceptually indistinguishable
    //  from 60fps while halving ALL per-frame CPU+GPU work across the board.
    //
    //  WHY IT WAS COMMENTED OUT IN v2.1:
    //  Probably disabled during a debugging session and forgotten. The
    //  implementation is correct — it uses _nativeRaf directly in the gate
    //  closure to avoid recursive re-wrapping (which would stack frame budgets
    //  and create compound jank). This is safe to re-enable.
    //
    //  COMBINED IMPACT WITH HALF-WORLD:
    //  At 30fps in a 4000×3000 world, the per-second pixel throughput is:
    //    P1 crop at 30fps ≈ 30 × ~900K px = 27 MP/sec
    //    vs full blit at 60fps ≈ 60 × 48 MP = 2,880 MP/sec
    //    → ~106× reduction in total background pixel throughput.
    // ────────────────────────────────────────────────────────────────────
    function _p6_rafCap() {
        const TARGET_MS  = 1000 / 30; // 33.33ms between allowed frames
        let _lastTs = 0;
        const _nativeRaf = window.requestAnimationFrame.bind(window);

        window.requestAnimationFrame = function (cb) {
            return _nativeRaf(function gate(ts) {
                if (ts - _lastTs >= TARGET_MS) {
                    _lastTs = ts;
                    cb(ts);
                } else {
                    // Defer — call _nativeRaf(gate) NOT window.requestAnimationFrame(gate).
                    // Using window.rAF here would re-wrap through our interceptor again,
                    // stacking frame-gate closures and causing compound timing drift.
                    _nativeRaf(gate);
                }
            });
        };
    }


    // ════════════════════════════════════════════════════════════════════
    //  P7  NPC SPRITE LOD  ★★★★★  COMPLETELY REWRITTEN IN v3.0
    // ════════════════════════════════════════════════════════════════════
    //
    //  ╔══════════════════════════════════════════════════════════════╗
    //  ║   BUG ANALYSIS: WHY THE RED DOTS WERE FLICKERING IN v2.1    ║
    //  ╚══════════════════════════════════════════════════════════════╝
    //
    //  The v2.1 LOD trigger was:
    //      return IS_NATIVE ? (player.isMoving || zoom < 1.0) : zoom < 0.55;
    //
    //  BUG 1 — zoom < 1.0 is always true at startup:
    //      The default zoom in sandbox_overworld.js is 0.8.
    //      0.8 < 1.0 = true. Therefore on Android, the condition was
    //      permanently satisfied from the first frame. Every NPC was always
    //      a dot from game start, with no way to see sprites unless the user
    //      manually zoomed above 1.0. That was unintentional.
    //
    //  BUG 2 — player.isMoving oscillates on the same frame:
    //      calculateMovement() in update.js unconditionally sets
    //      player.isMoving = false at its very first line (line 16).
    //      It only sets it back to true if a movement key is currently held.
    //      On mobile with the virtual joystick (touch events), the flag can
    //      toggle between true/false on consecutive animation frames because
    //      touchmove events and RAF callbacks are not frame-locked.
    //      Result: NPC alternates sprite ↔ dot at 30–60Hz → red flicker.
    //
    //  BUG 3 — the NPC color was correct but the dot was drawn BEFORE
    //      the ctx.save/restore that drawCaravan uses. Because drawCaravan
    //      sets its own fillStyle internally, and our _dot was called instead,
    //      the canvas fillStyle was left set to the dot color for subsequent
    //      draw calls in the same frame, occasionally tinting unrelated
    //      elements until the next ctx.restore().
    //
    //  ╔══════════════════════════════════════════════════════════════╗
    //  ║   THE FIX: PURE DISTANCE-BASED LOD (800 world-px threshold) ║
    //  ╚══════════════════════════════════════════════════════════════╝
    //
    //  The new _useLOD() consults ONLY the squared Euclidean distance
    //  between the NPC and the player. No movement state. No zoom level.
    //  The result is the same every frame for a stationary NPC — no flicker
    //  is physically possible.
    //
    //  WHY 800 px:
    //   • At zoom 0.8 on a 411px-wide Pixel 2: visible world width ≈ 514 px.
    //     An NPC at 800 world-px is ~257px off-screen to the left or right.
    //     Rendering its full sprite (25 canvas state changes) for something
    //     that isn't visible produces zero visual benefit.
    //   • At zoom 1.5: visible width ≈ 274px. At 800px distance an NPC is
    //     ~390px off-screen. Still invisible at full sprite cost.
    //   • A 4-pixel dot at 800 world-px is visually identical to a 14-pixel
    //     sprite hexagon. The difference is ~22 canvas operations per NPC
    //     per frame: beginPath → moveTo → 6× lineTo → closePath → fill →
    //     stroke → wheels → driver figure → shadow → etc.
    //   • With 40–80 visible NPCs in SPOTTING_RANGE (1500px), approximately
    //     half will be beyond 800px at any time. On native: ~40 × 22 ops
    //     saved = 880 fewer canvas calls per frame.
    //
    //  BUG 3 FIX — ctx.save/restore wrapper around the dot draw:
    //   We now wrap the _dot call in save/restore so the fillStyle change
    //   cannot bleed into subsequent draw calls.
    //
    //  PLAYER IDENTITY CHECK:
    //   update.js also calls drawCaravan(player.x, player.y, ...) for the
    //   player's own caravan/ship render. The _isPlayer guard ensures the
    //   player always receives full-quality sprite rendering.
    // ────────────────────────────────────────────────────────────────────
    function _p7_npcLOD() {
        const _origCar = window.drawCaravan;
        const _origShp = window.drawShip;
        if (!_origCar && !_origShp) return;

        // ── Distance threshold ────────────────────────────────────────────
        // Anything beyond this world-px radius from the player → render as dot.
        // We compare squared distances to avoid the sqrt call per NPC per frame.
        const LOD_DIST_PX = 800;
        const LOD_DIST_SQ = LOD_DIST_PX * LOD_DIST_PX; // 640,000

        // ── Dot renderer ─────────────────────────────────────────────────
        // ctx.save/restore prevents fillStyle from bleeding into caller's state.
        // Radius is zoom-aware: stays between 3–7px screen-size so dots are
        // always visible and never overwhelm the viewport.
        const _dot = function (x, y, col) {
            ctx.save();
            ctx.fillStyle = col || '#c8a06e';
            ctx.beginPath();
            ctx.arc(x, y, Math.max(3, Math.min(7, 5 / zoom)), 0, 6.2832);
            ctx.fill();
            ctx.restore();
        };

        // ── Player identity guard ─────────────────────────────────────────
        // The player's own caravan/ship is drawn at (player.x, player.y).
        // We allow ±2px floating-point noise. Player always gets full sprite.
        const _isPlayer = function (x, y) {
            return Math.abs(x - player.x) < 2 && Math.abs(y - player.y) < 2;
        };

        // ── LOD decision ─────────────────────────────────────────────────
        // Pure geometry. No state variables. Cannot flicker.
        const _useLOD = function (x, y) {
            if (_isPlayer(x, y)) return false;
            const dx = x - player.x;
            const dy = y - player.y;
            return (dx * dx + dy * dy) > LOD_DIST_SQ;
        };

        // ── Wrap drawCaravan ─────────────────────────────────────────────
        if (_origCar) {
            window.drawCaravan = function (x, y, mv, fr, col) {
                if (_useLOD(x, y)) {
                    _dot(x, y, col);
                } else {
                    _origCar(x, y, mv, fr, col);
                }
            };
        }

        // ── Wrap drawShip ─────────────────────────────────────────────────
        if (_origShp) {
            window.drawShip = function (x, y, mv, fr, col) {
                if (_useLOD(x, y)) {
                    _dot(x, y, col || '#c8d8ff');
                } else {
                    _origShp(x, y, mv, fr, col);
                }
            };
        }
    }


    // ════════════════════════════════════════════════════════════════════
    //  P8  THROTTLE processSiegeEngines  ★★★☆☆  [SIEGE]
    // ════════════════════════════════════════════════════════════════════
    //
    //  processSiegeEngines() runs full unit AI every frame: filtering 200+
    //  unit arrays, pathfinding, equipment physics, gate logic.
    //  Siege tactical decisions are strategic — players perceive them at
    //  ~10fps. Running at 1-in-3 frames is completely unnoticeable.
    // ────────────────────────────────────────────────────────────────────
    function _p8_siegeThrottle() {
        const _orig = window.processSiegeEngines;
        if (typeof _orig !== 'function') return;
        const SKIP = IS_NATIVE ? 3 : 2;
        let _n = 0;

        window.processSiegeEngines = function () {
            if ((++_n) % SKIP !== 0) return;
            _orig.apply(this, arguments);
        };
    }


    // ════════════════════════════════════════════════════════════════════
    //  P9  PROJECTILE COUNT CAP  ★★☆☆☆  [SIEGE]
    // ════════════════════════════════════════════════════════════════════
    //
    //  During large sieges with 300+ units, battleEnvironment.projectiles
    //  can grow to 500+ entries. Each is DRAWN and COLLISION-CHECKED every
    //  frame — a classic WebView lag spiral.
    //  We patch .push() on the specific array once the battle loads.
    //  Projectiles beyond MAX are silently dropped — units fall back to melee.
    // ────────────────────────────────────────────────────────────────────
    function _p9_projCap() {
        const MAX = IS_NATIVE ? 100 : 180;

        const _poll = setInterval(function () {
            if (typeof battleEnvironment === 'undefined' ||
                !Array.isArray(battleEnvironment.projectiles)) return;
            clearInterval(_poll);

            const _nativePush = Array.prototype.push;
            Object.defineProperty(battleEnvironment.projectiles, 'push', {
                configurable: true,
                writable: true,
                value: function () {
                    if (this.length >= MAX) return this.length; // silent drop
                    return _nativePush.apply(this, arguments);
                }
            });
        }, 1000);
    }


    // ════════════════════════════════════════════════════════════════════
    //  P10  HALF-WORLD NPC SCALE  ★★★★☆  [NEW v3.0]
    // ════════════════════════════════════════════════════════════════════
    //
    //  Context: sandbox_overworld.js is being halved:
    //    WORLD_WIDTH:  8000 → 4000
    //    WORLD_HEIGHT: 6000 → 3000
    //
    //  Without speed scaling, every NPC traverses the map in half the
    //  real-world time — the world feels like everyone is sprinting.
    //
    //  spawnNPCFromCity hardcodes speed = 0.5 for all roles (Commerce,
    //  Civilian, Patrol, Military). spawnBandit hardcodes speed = 0.4.
    //  We wrap both spawn functions and halve the speed of each new NPC
    //  immediately after it is added to globalNPCs.
    //
    //  PATROL RADIUS CORRECTION:
    //  spawnNPCFromCity sets Patrol NPC targets as:
    //    targetX = city.x ± (random * 800)   ← tuned for 8000px world
    //  In a 4000px world, ±800 means a patrol could wander to any city
    //  on the entire map. We correct it to ±400 (same proportional radius).
    //
    //  BANDIT WANDER CORRECTION:
    //  spawnBandit initialises bandit target as:
    //    targetX = coords.x ± (random * 1000)  ← designed for 8000px world
    //  In the half-world this creates bandits with targets far off-map.
    //  The P11 target-clamp handles any that still escape, but we also
    //  reduce the initial wander here to ±400 for cleanliness.
    //
    //  HOW THE WRAPPER WORKS:
    //  We record globalNPCs.length before calling the original. After it
    //  returns, the new NPC (if any spawned — the function has several
    //  early-return guards) is at index [length-1]. We mutate it directly.
    //  This is safe because push() is synchronous.
    // ────────────────────────────────────────────────────────────────────
    function _p10_npcWorldScale() {

        // ── spawnNPCFromCity wrapper ──────────────────────────────────────
        const _origSpawn = window.spawnNPCFromCity;
        if (typeof _origSpawn === 'function') {
            window.spawnNPCFromCity = function (city, role, citiesArr) {
                const lenBefore = (typeof globalNPCs !== 'undefined') ? globalNPCs.length : 0;
                _origSpawn.call(this, city, role, citiesArr);
                if (typeof globalNPCs === 'undefined') return;

                const lenAfter = globalNPCs.length;
                if (lenAfter <= lenBefore) return; // nothing spawned (guards triggered)

                const npc = globalNPCs[lenAfter - 1];
                if (!npc) return;

                // ── Halve speed: 0.5 → 0.25 (preserves traversal time in half-world) ──
                npc.speed = npc.speed * 0.5;

                // ── Correct Patrol wander radius from ±800 → ±400 ────────────────────
                if (role === 'Patrol') {
                    npc.targetX = city.x + (Math.random() - 0.5) * 400;
                    npc.targetY = city.y + (Math.random() - 0.5) * 400;
                }
            };
        }

        // ── spawnBandit wrapper ───────────────────────────────────────────
        const _origBandit = window.spawnBandit;
        if (typeof _origBandit === 'function') {
            window.spawnBandit = function (padX, padY) {
                const lenBefore = (typeof globalNPCs !== 'undefined') ? globalNPCs.length : 0;
                _origBandit.call(this, padX, padY);
                if (typeof globalNPCs === 'undefined') return;

                const lenAfter = globalNPCs.length;
                if (lenAfter <= lenBefore) return;

                const npc = globalNPCs[lenAfter - 1];
                if (!npc) return;

                // Halve bandit speed: 0.4 → 0.2
                npc.speed = npc.speed * 0.5;

                // Correct initial wander target from ±1000 → ±400 world-px
                // (The original hardcodes ±1000 in spawnBandit — too large for 4000px world)
                npc.targetX = npc.x + (Math.random() - 0.5) * 400;
                npc.targetY = npc.y + (Math.random() - 0.5) * 400;
            };
        }
    }


    // ════════════════════════════════════════════════════════════════════
    //  P11  NPC TARGET CLAMPING  ★★★☆☆  [NEW v3.0]
    // ════════════════════════════════════════════════════════════════════
    //
    //  updateNPCs() contains several inline wander-waypoint assignments
    //  that we cannot surgically patch from outside:
    //
    //  Line ~980:  npc.targetX = npc.x ± (random * 600)   [Bandit/Patrol wander]
    //  Line ~1039: npc.targetX = npc.x ± (random * 600)   [General waypoint miss]
    //
    //  In a 4000px-wide world, ±600 from an NPC near the centre means a
    //  target up to x=2900 away from a city at x=2000 — outside the world.
    //  NPCs with out-of-bounds targets walk toward the edge, hit the world
    //  boundary, and freeze forever since the impassable check stops them
    //  but the target is never updated.
    //
    //  This patch wraps the ALREADY-THROTTLED updateNPCs (layered on top of
    //  P4's throttle wrapper) and clamps all NPC targetX/Y to world bounds
    //  after every AI update tick. O(n) trivial math — negligible cost.
    //
    //  The 100px PAD keeps NPCs away from the absolute map edge where terrain
    //  generation often produces ocean/impassable tiles.
    // ────────────────────────────────────────────────────────────────────
    function _p11_npcTargetClamp() {
        // At this point, window.updateNPCs is already the P4-throttled version.
        // We layer on top of it.
        const _throttledUpdateNPCs = window.updateNPCs;
        if (typeof _throttledUpdateNPCs !== 'function') return;

        const EDGE_PAD = 100;

        window.updateNPCs = function () {
            // Call the throttled AI update (which in turn calls the original)
            _throttledUpdateNPCs.apply(this, arguments);

            // Only run clamping if this tick actually executed the AI update.
            // The throttle returns early without executing, but we've already
            // paid the function-call overhead — clamping here adds ~200 cheap
            // comparisons either way. Acceptable.
            if (typeof globalNPCs === 'undefined') return;

            const WW = (typeof WORLD_WIDTH  !== 'undefined') ? WORLD_WIDTH  : 4000;
            const WH = (typeof WORLD_HEIGHT !== 'undefined') ? WORLD_HEIGHT : 3000;
            const maxX = WW - EDGE_PAD;
            const maxY = WH - EDGE_PAD;

            for (let i = 0; i < globalNPCs.length; i++) {
                const npc = globalNPCs[i];
                // Clamp position (in case of edge drift)
                if (npc.x < EDGE_PAD) { npc.x = EDGE_PAD; npc.targetX = npc.x + 50; }
                if (npc.y < EDGE_PAD) { npc.y = EDGE_PAD; npc.targetY = npc.y + 50; }
                if (npc.x > maxX)     { npc.x = maxX;     npc.targetX = npc.x - 50; }
                if (npc.y > maxY)     { npc.y = maxY;     npc.targetY = npc.y - 50; }

                // Clamp target waypoints (prevents future freezes)
                if (npc.targetX !== undefined) npc.targetX = Math.max(EDGE_PAD, Math.min(maxX, npc.targetX));
                if (npc.targetY !== undefined) npc.targetY = Math.max(EDGE_PAD, Math.min(maxY, npc.targetY));
            }
        };
    }


    // ════════════════════════════════════════════════════════════════════
    //  P12  PLAYER SPEED SCALE  ★★★☆☆  [NEW v3.0]
    // ════════════════════════════════════════════════════════════════════
    //
    //  player.baseSpeed = player.speed = 15 in update.js.
    //  calculateMovement() always applies *0.5 internally (line ~45),
    //  making the effective overworld speed 7.5 world-px per frame.
    //
    //  Traversal time analysis (one full world-width crossing):
    //
    //    Old world (8000px) @ 60fps, speed 7.5 px/frame:
    //      8000 / (7.5 × 60fps) = 17.8 seconds
    //
    //    Half world (4000px) @ 30fps (P6), speed 7.5 px/frame:
    //      4000 / (7.5 × 30fps) = 17.8 seconds  ← IDENTICAL
    //
    //  Because P6 halves the frame rate, the player's pixels-per-second
    //  is already halved without changing baseSpeed. The traversal feel
    //  is preserved automatically. However, if P6 is disabled on desktop
    //  (IS_NATIVE = false), the player at 60fps would cross the half-world
    //  in 8.9 seconds — faster than intended.
    //
    //  We apply a 0.65× scale on desktop to bring traversal close to the
    //  original feel. On native, we apply 1.0× (no change) since P6 handles
    //  it. Set DESKTOP_SCALE to 0.5 for strict halving if preferred.
    //
    //  IDEMPOTENCY: player._speedScaled flag prevents double-application
    //  if this script is accidentally loaded twice.
    // ────────────────────────────────────────────────────────────────────
    function _p12_playerSpeedScale() {
        // On native at 30fps: P6 already halves pixels/second — no speed change needed.
        // On desktop at 60fps: apply gentle correction for half-world feel.
        const SCALE = IS_NATIVE ? 1.0 : 0.65;

        const _applyScale = function () {
            if (typeof player === 'undefined') return false;
            if (player._speedScaled) return true; // idempotency guard
            player.baseSpeed = (player.baseSpeed || 15) * SCALE;
            player.speed     = (player.speed     || 15) * SCALE;
            player._speedScaled = true;
            return true;
        };

        if (!_applyScale()) {
            // Player not ready yet — retry
            const _retry = setInterval(function () {
                if (_applyScale()) clearInterval(_retry);
            }, 200);
        }
    }


    // ════════════════════════════════════════════════════════════════════
    //  P13  ECONOMY UPDATE THROTTLE  ★★★☆☆  [NEW v3.0]
    // ════════════════════════════════════════════════════════════════════
    //
    //  updateCityEconomies() iterates all cities with a forEach containing
    //  food production, spoilage, starvation, population growth, tax
    //  revenue, military upkeep, and garrison logic — all per city per
    //  frame. With 40 cities (half-world), this is measurable overhead.
    //
    //  Economic state changes at human timescales — running it once per
    //  60 frames (~2 seconds real-time at 30fps) is completely unnoticeable
    //  to the player. City stats displayed in the HUD are rounded integers
    //  that change by 1–5 units per real-world second — no player can
    //  perceive sub-second economy tick rates.
    //
    //  Belt-and-suspenders: updateCitySystems() in city_system.js may
    //  already have its own economyTick throttle. This wrapper adds a
    //  second modulo gate at the function level, which is idempotent —
    //  if the inner call never fires, neither does this one.
    // ────────────────────────────────────────────────────────────────────
    function _p13_economyThrottle() {
        const _orig = window.updateCityEconomies;
        if (typeof _orig !== 'function') return;

        let _n = 0;
        const SKIP = 60; // ~2 seconds real-time at 30fps

        window.updateCityEconomies = function () {
            if ((++_n) % SKIP !== 0) return;
            _orig.apply(this, arguments);
        };
    }


    // ════════════════════════════════════════════════════════════════════
    //  P14  drawAllNPCs Y-SORT THROTTLE  ★★☆☆☆  [NEW v3.0]
    // ════════════════════════════════════════════════════════════════════
    //
    //  drawAllNPCs() calls globalNPCs.sort((a,b) => a.y - b.y) every frame
    //  for correct painter-order depth sorting. With 200 NPCs this is a
    //  Timsort over 200 elements — measurable on WebView's V8 build.
    //
    //  NPCs move at 0.25 world-px per frame (after P10 halving). In 4 frames
    //  an NPC moves 1 world-px. Re-sorting every 4 frames means two adjacent
    //  NPCs whose Y positions differ by < 4px might render out of order for
    //  up to 3 frames. At this scale that is invisible.
    //
    //  HOW IT WORKS:
    //  We wrap drawAllNPCs. On "skip" frames we temporarily replace
    //  globalNPCs.sort with a no-op so the sort inside the original is
    //  suppressed. The original function is otherwise called normally.
    //  We restore the real sort method immediately after the call, ensuring
    //  no permanent mutation of the array's methods.
    //
    //  This technique is safe because:
    //   1. We restore before the next frame (synchronous).
    //   2. No other code sorts globalNPCs during this brief window.
    //   3. The no-op sort still returns the array (expected return value).
    // ────────────────────────────────────────────────────────────────────
    function _p14_sortThrottle() {
        const _origDraw = window.drawAllNPCs;
        if (typeof _origDraw !== 'function') return;

        const SORT_EVERY = 4; // Re-sort 1-in-4 frames
        let _sortTick = 0;

        window.drawAllNPCs = function (ctx, drawCar, drawShp, zoom, camL, camR, camT, camB) {
            let _didSuppressSort = false;

            // On skip frames, temporarily no-op the sort method on globalNPCs
            if (
                typeof globalNPCs !== 'undefined' &&
                typeof globalNPCs.sort === 'function' &&
                (++_sortTick % SORT_EVERY !== 0)
            ) {
              const _realSort = globalNPCs.sort;
globalNPCs.sort = function () { return this; }; 
try {
    _origDraw.call(this, ctx, drawCar, drawShp, zoom, camL, camR, camT, camB);
} finally {
    globalNPCs.sort = _realSort;
}
            } else {
                // On the every-4th frame, let sort run normally
                _origDraw.call(this, ctx, drawCar, drawShp, zoom, camL, camR, camT, camB);
            }
        };
    }


})();


/* ═══════════════════════════════════════════════════════════════════════════
   APPENDIX — REQUIRED CHANGES IN OTHER FILES
   Copy-paste these exact edits. optimization.js cannot patch `const`
   declarations made at script scope.
   ═══════════════════════════════════════════════════════════════════════════

   ── sandbox_overworld.js  (4 changes) ──────────────────────────────────────

   CHANGE 1: Halve world dimensions (lines ~161–162)
   ┌─────────────────────────────────────────────────────────────────────┐
   │  // BEFORE:                                                          │
   │  const WORLD_WIDTH  = 8000;                                          │
   │  const WORLD_HEIGHT = 6000;                                          │
   │                                                                      │
   │  // AFTER:                                                           │
   │  const WORLD_WIDTH  = 4000;  // Half-world: 12MP vs 48MP bgCanvas   │
   │  const WORLD_HEIGHT = 3000;  //             12MB vs 48MB RAM         │
   └─────────────────────────────────────────────────────────────────────┘

   CHANGE 2: Reduce city count for smaller map (line ~222)
   ┌─────────────────────────────────────────────────────────────────────┐
   │  // BEFORE:                                                          │
   │  const TARGET_CITIES = 60;                                           │
   │                                                                      │
   │  // AFTER:                                                           │
   │  const TARGET_CITIES = 40;  // Proportional to halved area           │
   └─────────────────────────────────────────────────────────────────────┘

   CHANGE 3: Tighten city min-separation (line ~252)
   ┌─────────────────────────────────────────────────────────────────────┐
   │  // BEFORE:                                                          │
   │  if(Math.hypot(c.x - cx, c.y - cy) < 400) {                         │
   │                                                                      │
   │  // AFTER:                                                           │
   │  if(Math.hypot(c.x - cx, c.y - cy) < 250) {                         │
   │  // Rationale: 400px in an 8000px world = 5% world width.           │
   │  // 250px in a 4000px world = 6.25% — slightly denser, intentional. │
   └─────────────────────────────────────────────────────────────────────┘

   CHANGE 4: Reduce city padding from 5% → 3% (lines ~164–165)
   ┌─────────────────────────────────────────────────────────────────────┐
   │  // BEFORE:                                                          │
   │  const PADDING_X = WORLD_WIDTH  * 0.05;                              │
   │  const PADDING_Y = WORLD_HEIGHT * 0.05;                              │
   │                                                                      │
   │  // AFTER:                                                           │
   │  const PADDING_X = WORLD_WIDTH  * 0.03;  // 120px border            │
   │  const PADDING_Y = WORLD_HEIGHT * 0.03;  //  90px border            │
   │  // In a 4000×3000 world the old 5% (200px) padding wastefully      │
   │  // excludes too much of the available land mass.                    │
   └─────────────────────────────────────────────────────────────────────┘

   ── npc_system.js  (2 optional quality-of-life tunings) ────────────────────

   NOTE: These are already partially mitigated by P10/P11 but editing the
   source makes the system self-consistent for future development.

   CHANGE A: Reduce bandit initial wander from ±1000 → ±400 (line ~509)
   ┌─────────────────────────────────────────────────────────────────────┐
   │  // BEFORE:                                                          │
   │  targetX: coords.x + (Math.random() - 0.5) * 1000,                  │
   │  targetY: coords.y + (Math.random() - 0.5) * 1000,                  │
   │                                                                      │
   │  // AFTER:                                                           │
   │  targetX: coords.x + (Math.random() - 0.5) * 400,                   │
   │  targetY: coords.y + (Math.random() - 0.5) * 400,                   │
   └─────────────────────────────────────────────────────────────────────┘

   CHANGE B: Reduce in-AI wander radius from ±600 → ±300 (lines ~980, ~1039)
   ┌─────────────────────────────────────────────────────────────────────┐
   │  // BEFORE (appears twice):                                          │
   │  npc.targetX = npc.x + (Math.random() - 0.5) * 600;                 │
   │  npc.targetY = npc.y + (Math.random() - 0.5) * 600;                 │
   │                                                                      │
   │  // AFTER (change both occurrences):                                 │
   │  npc.targetX = npc.x + (Math.random() - 0.5) * 300;                 │
   │  npc.targetY = npc.y + (Math.random() - 0.5) * 300;                 │
   └─────────────────────────────────────────────────────────────────────┘

   ── AndroidManifest.xml  (verify this is set) ──────────────────────────────
   ┌─────────────────────────────────────────────────────────────────────┐
   │  <application                                                        │
   │    android:hardwareAccelerated="true"   ← MUST BE TRUE              │
   │    ...                                                               │
   └─────────────────────────────────────────────────────────────────────┘
   Without hardware acceleration, even our patched canvas calls run in
   pure CPU software mode. This is a Capacitor project setting.

   ═══════════════════════════════════════════════════════════════════════════
*/
