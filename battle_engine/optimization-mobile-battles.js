;(function MOBILE_BATTLE_PATCH() {
'use strict';

// ============================================================================
// optimization-mobile-battles.js  v1.7  —  Empire of the 13th Century
// MOBILE-ONLY Battle Performance Mega-Patch  (Pixel 3 / low-end Android)
// ============================================================================
//
// v1.6 CHANGELOG — BUG FIXES (Issues 1, 2, 3) + FUNDAMENTAL PERF (Issue 5)
// ──────────────────────────────────────────────────────────────────────────
//
//  ★ BUG FIX (Issue 1 — DROWNING VISUALS ON SHIP): The MB1 sprite cache was
//    contaminated by drowning_visuals.js because Phase A's 16ms setInterval
//    fired AFTER DOMContentLoaded, by which time drowning_visuals had already
//    wrapped window.drawInfantryUnit. The cache then baked a waterline/ripple
//    clip into the canvas for the first unit of each type to render while
//    swimming. That contaminated canvas was reused for ALL units of that type.
//
//    Root cause (JS event loop order):
//      1. All <script> tags execute synchronously.
//         → infscript.js defines drawInfantryUnit (raw).
//         → drowning_visuals.js registers a DOMContentLoaded listener.
//         → opt-mobile-battles.js registers a 16ms setInterval (Phase A).
//      2. DOMContentLoaded fires (after ALL sync scripts complete).
//         → drowning_visuals._installHooks() wraps drawInfantryUnit.
//      3. THEN the 16ms interval fires.
//         → Phase A captures the DROWNING-WRAPPED function. ❌
//
//    FIX A (primary): Synchronous capture. At the top of this IIFE, before
//    any setInterval or DOMContentLoaded can run, we immediately snapshot
//    window.drawInfantryUnit / drawCavalryUnit. At this moment all sync
//    scripts have run (so both functions are defined) but DOMContentLoaded
//    has NOT fired yet (so drowning_visuals has not wrapped them). Capture
//    is guaranteed to be the raw original.
//
//    FIX B (belt-and-suspenders): Even if the synchronous capture somehow
//    got the drowning-wrapped version, MB1's infantry and cavalry wrappers
//    now check unit.isSwimming / unit.overboardTimer BEFORE entering the
//    cache path and bail out to the live wrapper chain. Swimming units are
//    never cached — their drowning visuals are positionally dependent and
//    must render fresh every frame.
//
//  ★ BUG FIX (Issue 2 — UNIT "BLUR"): ctx.drawImage of an 80×80 cache
//    canvas onto a zoom-2 context applies bilinear upscaling by default
//    (the canvas renders it at 160×160 screen-px). This manifests as soft,
//    blurry unit sprites at the planned mobile zoom lock of ~2x.
//    FIX: ctx.imageSmoothingEnabled = false is applied around every cache
//    blit (infantry and cavalry). Sprites are now pixel-crisp at any zoom.
//    The on/off toggle is scoped inside ctx.save/ctx.restore so it never
//    leaks to other draw calls.
//    NOTE: At zoom < 1 (downscaling) disabling smoothing has no visible
//    effect — downscaled images are already sharp enough.
//
//  ★ BUG FIX (Issue 3 — CROSSBOW RELOAD FLICKER): The cache bypass guard
//    was: `unit.stats.isRanged && unit.cooldown > 0 && reloadProgress > 0`
//    But reloadProgress is 0 when unit.state === "moving" (troop_draw.js
//    only sets it when state === "attacking"). A crossbow that just fired
//    moves to "moving" state immediately, but its cooldown continues to
//    count down. The animation phase (p = 1 - cooldown/maxCool) keeps
//    changing as the unit walks — but the cache key includes animFrame
//    (0..3 walk cycle) and NOT the cooldown phase, so each of the 4 walk
//    frames might snap a different animation phase (bolt loaded vs not
//    loaded), causing visible flicker between hasBolt:true and false.
//    FIX: Guard changed to `unit.stats.isRanged && unit.cooldown > 0`.
//    Now any ranged unit with any active cooldown bypasses the cache,
//    regardless of state. Applied to both infantry and cavalry wrappers.
//    This correctly handles crossbows, repeaters, archers, horse archers,
//    firelances, hand cannoneers, and throwing units uniformly.
//
//  ★ NEW MB14 — SWEEP-AND-PRUNE COLLISION (Issue 5 — simulation cost):
//    applyUnitCollisions() runs a brute-force O(N²) double-loop: at 200
//    units that is 40,000 distance checks per frame. MB14 replaces this
//    with a sort-based sweep on X position. After sorting, the inner loop
//    breaks early the moment u2.x - u1.x exceeds the maximum possible
//    collision distance (any pair with gap > MAX_SWEEP_DX cannot overlap).
//    In practice, each unit only checks 3–8 neighbours instead of 200.
//    Applied to standard land battles only. Siege and naval use the
//    original function (which has extra tile-grid guard logic that the
//    sweep does not replicate, to avoid risk of bugs).
//    Expected speedup: 10–20× reduction in collision checks per frame.
//
//  ★ NEW MB16 — VIEWPORT PRE-CULL FOR drawBattleUnits (Issue 5 — render):
//    troop_draw.js creates sortedUnitsCache = [...battleEnvironment.units]
//    and then iterates it per frame. With 200 units and zoom locked at 2x,
//    only ~20-40 units are actually on screen. The remaining 160+ units
//    still pay for: array spread + sort + forEach + isOnScreen check +
//    function call overhead per unit. MB16 wraps drawBattleUnits (outermost
//    wrapper) and temporarily replaces battleEnvironment.units with a
//    viewport-filtered subset. The inner draw path then spreads, sorts, and
//    iterates only visible units. Units array is restored in a finally block.
//    Expected render-side speedup: 4–8× reduction in sortedUnitsCache size.
//    NOTE: MB12 (dead unit LOD flush) is now largely superseded by MB16
//    for the dead-unit skip case, but both are retained since MB12's
//    _mbDeadSkip flag is also checked by the MB2/MB1 unit draw wrappers
//    (useful edge case for units right at the camera edge that slip through).
//
// ──────────────────────────────────────────────────────────────────────────
// v1.5 CHANGELOG — BLUR REMOVED + SEED/AMMO CACHE KEY FIXES
// (see previous version for full v1.5 notes — all patches retained below)
// ──────────────────────────────────────────────────────────────────────────
//
// ─────────────────────────────────────────────────────────────────────────
// LOAD ORDER ARCHITECTURE (CRITICAL — do not reorder)
// ─────────────────────────────────────────────────────────────────────────
//
//  This file installs via two phases:
//
//  PHASE 0  — Synchronous capture (NEW in v1.6). Runs inline as the script
//             loads, before any setInterval or DOMContentLoaded fires.
//             This is the correct moment: infscript.js has already defined
//             drawInfantryUnit (it loads earlier), but drowning_visuals.js
//             has only REGISTERED its DOMContentLoaded hook — it hasn't
//             run _installHooks() yet. So we get the true raw functions.
//
//  PHASE A  — Polling fallback (16ms setInterval). Fires only if Phase 0
//             did not find the functions (shouldn't happen in normal load
//             order). Kept for robustness.
//
//  PHASE B  — All remaining patches (_install) fire after 400ms from
//             first successful capture, giving optimization-battles.js
//             (PB1 at 300ms setInterval) time to install its wrappers.
//             MB1 then wraps on top of PB1/PB2 but its render path uses
//             the raw functions from Phase 0/A exclusively.
//
// ─────────────────────────────────────────────────────────────────────────
// MOBILE DETECTION  (STRICT — matches optimization-sandbox.js / -battles.js)
// ─────────────────────────────────────────────────────────────────────────

if (window.__MBP1__) return;
window.__MBP1__ = true;

var IS_MOBILE = (
    window.__FORCE_MOBILE_BATTLES__ === true ||
    typeof window.Capacitor !== 'undefined' ||
    /\bwv\b/.test(navigator.userAgent) ||
    window.AndroidInterface != null ||
    (
        /Android/.test(navigator.userAgent) &&
        !/Chrome\/\d/.test(navigator.userAgent) &&
        !/Firefox\/\d/.test(navigator.userAgent)
    )
);

if (!IS_MOBILE) {
    console.log('%c[OPT-MOBILE-BATTLES] Desktop / non-Capacitor environment detected — patch inactive.',
                'color:#888;font-style:italic;');
    return;
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 0 — SYNCHRONOUS RAW FUNCTION CAPTURE  (v1.6 PRIMARY FIX)
// ══════════════════════════════════════════════════════════════════════
//
// Runs RIGHT NOW, synchronously, before any setInterval or DOMContentLoaded.
//
// WHY THIS WORKS
// ──────────────
// At the moment this line executes, the JS engine has synchronously run
// every <script> tag in order:
//   infscript.js   → window.drawInfantryUnit = <raw function>  ✓ defined
//   cavscript.js   → window.drawCavalryUnit  = <raw function>  ✓ defined
//   drowning_visuals.js → registered DOMContentLoaded listener  (not fired!)
//
// DOMContentLoaded has NOT fired yet. drowning_visuals._installHooks()
// has NOT run. So window.drawInfantryUnit IS the raw original here.
//
// This eliminates the Phase A race entirely.
// Phase A polling is kept as a fallback for unusual load orders.
// ──────────────────────────────────────────────────────────────────────

(function _phase0_syncCapture() {
    if (typeof window.drawInfantryUnit === 'function' && !window.__MB1_RAW_INF__) {
        window.__MB1_RAW_INF__ = window.drawInfantryUnit;
        console.log('[OPT-MOBILE-BATTLES MB1] Raw drawInfantryUnit captured (PHASE 0 — synchronous, pre-DOMContentLoaded). ✓');
    }
    if (typeof window.drawCavalryUnit === 'function' && !window.__MB1_RAW_CAV__) {
        window.__MB1_RAW_CAV__ = window.drawCavalryUnit;
        console.log('[OPT-MOBILE-BATTLES MB1] Raw drawCavalryUnit captured (PHASE 0 — synchronous, pre-DOMContentLoaded). ✓');
    }
})();


// ──────────────────────────────────────────────────────────────────────
// TUNABLE CONSTANTS
// ──────────────────────────────────────────────────────────────────────

// MB1: Pre-render cache settings
var MB1_INF_W        = 80;
var MB1_INF_H        = 80;
var MB1_CAV_W        = 140;
var MB1_CAV_H        = 90;
var MB1_ANIM_FRAMES  = 4;
var MB1_CACHE_TTL_MS = 5000;
var MB1_CACHE_MAX    = 200;

// MB2: 2-tier LOD based on SCREEN-PIXEL distance to the nearest player-side unit.
//
//  Distance is measured in SCREEN PIXELS (world-px * zoom) so the tiers
//  feel the same regardless of zoom level.
//
//  Blur tier removed: the game already has a dot feature for far-away units,
//  and blurring nearby units causes visual confusion. Two tiers only:
//
//  Tier 0 — <= MB2_FULL_PX screen-px : full sprite
//  Tier 2 — >  MB2_FULL_PX screen-px : dot only
//
//  Distance is to the NEAREST player unit, not just the commander.
//  A thin player-unit position cache is refreshed once per drawBattleUnits
//  call (not per unit), so the nearest-neighbor scan is O(N) per frame.
var MB2_FULL_PX = 400;   // screen-px — full sprite zone; beyond this → dot
// MB2_BLUR_PX kept for log message compatibility but no longer used as a tier
var MB2_BLUR_PX = MB2_FULL_PX; // (unused — blur removed)

// MB3: processTargeting cull radius
var MB3_CULL_PADDING = 250;

// MB5: AI throttle frame skip (2 = half rate, land battles only)
var MB5_AI_SKIP = 2;

// MB10: Ground effects total cap on mobile
var MB10_GROUND_MAX = 80;

// MB13: Extra margin beyond screen edge before culling ground effects (world-px).
var MB13_GE_MARGIN = 200;

// MB14: Sweep-and-prune max X-gap before early exit (world-px).
// Largest possible collision distance: (r_elephant + r_elephant) * 0.6 ≈ 24.
// Use 30 for a safe margin above the maximum.
var MB14_MAX_SWEEP_DX = 30;

// MB16: Viewport margin (world-px) added around camera rect when pre-culling.
// Keeps units near the camera edge visible and prevents pop-in during fast
// cavalry movement. Higher = more units drawn, less pop-in risk.
var MB16_CULL_MARGIN = 120;


// ══════════════════════════════════════════════════════════════════════
// PHASE A — RAW FUNCTION CAPTURE (POLLING FALLBACK)
// Fires only if Phase 0 did not capture both functions.
// ══════════════════════════════════════════════════════════════════════

var _rawCaptureTries = 0;
var _rawCaptureId    = null;

// If Phase 0 already captured both, skip straight to Phase B.
if (window.__MB1_RAW_INF__ && window.__MB1_RAW_CAV__) {
    setTimeout(_install, 400);
} else {
    // Phase A polling fallback
    _rawCaptureId = setInterval(function () {
        _rawCaptureTries++;

        if (window.__MB1_RAW_INF__ && window.__MB1_RAW_CAV__) {
            clearInterval(_rawCaptureId);
            return;
        }

        var gotInf = typeof window.drawInfantryUnit === 'function';
        var gotCav = typeof window.drawCavalryUnit  === 'function';

        if (gotInf && !window.__MB1_RAW_INF__) {
            window.__MB1_RAW_INF__ = window.drawInfantryUnit;
            console.log('[OPT-MOBILE-BATTLES MB1] Raw drawInfantryUnit captured (Phase A fallback, try ' + _rawCaptureTries + ').');
        }
        if (gotCav && !window.__MB1_RAW_CAV__) {
            window.__MB1_RAW_CAV__ = window.drawCavalryUnit;
            console.log('[OPT-MOBILE-BATTLES MB1] Raw drawCavalryUnit captured (Phase A fallback, try ' + _rawCaptureTries + ').');
        }

        if (window.__MB1_RAW_INF__ && window.__MB1_RAW_CAV__) {
            clearInterval(_rawCaptureId);
            setTimeout(_install, 400);
            return;
        }

        if (_rawCaptureTries > 500) {  // ~8 seconds
            clearInterval(_rawCaptureId);
            console.warn('[OPT-MOBILE-BATTLES] Phase A timed out — raw function capture failed.');
        }
    }, 16);
}


function _install() {
    _mb1_spriteCache();
    _mb2_tighterLOD();
    _mb3_targetingCull();
    _mb4_cachedVisType();
    _mb5_rafCap();
    _mb6_supplyCull();
    _mb7_bloodPoolJitter();
    _mb8_sortInPlace();
    _mb9_selectionFast();
    _mb10_groundCap();
    _mb12_deadUnitFlush();
    _mb13_groundEffectDistanceCull();
    _mb14_sweepAndPrune();   // NEW v1.6
    _mb16_viewportPreCull(); // NEW v1.6

    console.log(
        '%c[OPT-MOBILE-BATTLES v1.6] Mobile mode INSTALLED\n' +
        '  Detection : Capacitor / Android WebView (strict)\n' +
        '  Phase 0   : Synchronous raw fn capture (pre-DOMContentLoaded — drowning race FIXED)\n' +
        '  MB1 Sprite cache — raw fn captured BEFORE PB1/PB2 wrap\n' +
        '     (inf ' + MB1_INF_W + '×' + MB1_INF_H +
            ', cav ' + MB1_CAV_W + '×' + MB1_CAV_H +
            ', ' + MB1_ANIM_FRAMES + ' anim frames, ' + MB1_CACHE_MAX + ' entries max)\n' +
        '     FIXED v1.6: swimming units bypass cache (drowning visual contamination)\n' +
        '     FIXED v1.6: ranged cooldown > 0 bypasses cache (crossbow flicker)\n' +
        '     FIXED v1.7: zoom-pre-scaled cache canvas + explicit dWidth/dHeight blit (blur eliminated)\n' +
        '  MB2 2-tier proximity LOD: full<=' + MB2_FULL_PX + 'px, dot beyond (screen-px to nearest player unit)\n' +
        '     Blur tier REMOVED — game has its own dot system; blurring was unwanted\n' +
        '  MB3 processTargeting viewport cull\n' +
        '  MB4 visType resolved via MB1 cache keys\n' +
        '  MB5 updateBattleUnits throttled ~30Hz (land battles)\n' +
        '  MB6 supply line off-screen cull\n' +
        '  MB7 blood pool jitter fix\n' +
        '  MB8 sort optimization (deferred)\n' +
        '  MB9 selection ring micro-opt (deferred)\n' +
        '  MB10 ground FX count cap @ ' + MB10_GROUND_MAX + '\n' +
        '  MB12 dead unit LOD early-flush (viewport-rect, skips all dead-unit work off-screen)\n' +
        '  MB13 ground FX off-screen cull (margin=' + MB13_GE_MARGIN + 'px, 2s interval)\n' +
        '  MB14 sweep-and-prune collision (land battles, X-sorted, early-exit at ' + MB14_MAX_SWEEP_DX + 'px)\n' +
        '  MB16 viewport pre-cull for drawBattleUnits (margin=' + MB16_CULL_MARGIN + 'px)',
        'color:#76ff03;font-weight:bold;font-size:11px'
    );
}


// ══════════════════════════════════════════════════════════════════════
// MB1  PRE-RENDERED SPRITE CACHE  ★★★★★  THE AOE2 TRICK
// ══════════════════════════════════════════════════════════════════════
//
// v1.6 CHANGES
// ────────────
//  • Swimming bypass: if unit.isSwimming || unit.overboardTimer > 0, bail
//    to _prevInf immediately. Drowning visuals render per-frame at the
//    unit's CURRENT world position — baking them into a cache canvas would
//    either contaminate the cache with stale waterlines or skip the visuals
//    entirely on cache-hit frames. Neither is acceptable.
//
//  • Ranged cooldown bypass: changed from
//      unit.stats.isRanged && unit.cooldown > 0 && reloadProgress > 0
//    to
//      unit.stats.isRanged && unit.cooldown > 0
//    reloadProgress is only set when state === "attacking" (troop_draw.js).
//    A crossbow that fired and returned to "moving" has cooldown > 0 but
//    reloadProgress = 0, so it entered the cache path and produced a stale
//    animation snapshot causing the bolt-loaded/not-loaded flicker.
//
//  • imageSmoothingEnabled = false: applied around ctx.drawImage for both
//    infantry and cavalry blits. At zoom 2x the 80×80 cache canvas was
//    bilinearly upscaled to 160×160 screen-px, appearing blurry. Now crisp.
//
// FIX v1.2: Cache render now calls window.__MB1_RAW_INF__ / __MB1_RAW_CAV__
// (the true originals from Phase 0/A) instead of `_origInf`.
// ──────────────────────────────────────────────────────────────────────

var _spriteCache = new Map();
var _cacheGCTick = 0;

function _mb1_spriteCache() {
    var _rawInf = window.__MB1_RAW_INF__;
    var _rawCav = window.__MB1_RAW_CAV__;

    if (typeof _rawInf !== 'function' || typeof _rawCav !== 'function') {
        console.warn('[OPT-MOBILE-BATTLES MB1] Raw functions not available — sprite cache skipped.');
        return;
    }

    function _buildKey(unitType, unitName, side, armorTier, isAttacking, ammoCount,
                       facingDir, animFrame, factionColor, extraTag) {
        return (unitType || 'u') + '|' +
               (unitName || '') + '|' +
               (side || 'p') + '|' +
               armorTier + '|' +
               (isAttacking ? 1 : 0) + '|' +
               ammoCount + '|' +
               (facingDir || 1) + '|' +
               animFrame + '|' +
               (factionColor || '#000') + '|' +
               (extraTag || '');
    }

    function _armorTier(val) {
        if (val >= 40) return 40;
        if (val >= 25) return 25;
        if (val >= 15) return 15;
        if (val >= 8)  return 8;
        return 2;
    }

    function _evictOldest() {
        var oldestKey = null;
        var oldestT = Infinity;
        _spriteCache.forEach(function (e, k) {
            if (e.t < oldestT) { oldestT = e.t; oldestKey = k; }
        });
        if (oldestKey) _spriteCache.delete(oldestKey);
    }

    function _getCachedInfFrame(key, unit, moving, frame, factionColor,
                                 type, isAttacking, side, unitName,
                                 isFleeing, cooldown, unitAmmo, reloadProgress) {
        var entry = _spriteCache.get(key);
        var now = performance.now();

        if (entry && (now - entry.t) < MB1_CACHE_TTL_MS) {
            entry.t = now;
            return entry.cv;
        }

        if (_spriteCache.size >= MB1_CACHE_MAX) _evictOldest();

        try {
            // v1.7 BLUR FIX: pre-scale canvas by zoom so blit is always 1:1 pixels.
            // The main ctx has scale(zoom) applied; drawing a 1x cache canvas upscales
            // it by zoom causing bilinear blur. Instead we render at zoom resolution so
            // ctx.drawImage(cv, x, y, W, H) maps (W*zoom × H*zoom) src pixels onto
            // (W ctx-units × zoom px/unit) = (W*zoom) screen px — exact 1:1, no interpolation.
            var _cz = (typeof zoom !== 'undefined' && zoom > 0) ? zoom : 1;
            var _scaledW = Math.round(MB1_INF_W * _cz);
            var _scaledH = Math.round(MB1_INF_H * _cz);
            var cv = (entry && entry.cv) ? entry.cv : document.createElement('canvas');
            cv.width  = _scaledW;
            cv.height = _scaledH;
            var c = cv.getContext('2d');
            c.clearRect(0, 0, _scaledW, _scaledH);
            c.save();
            c.scale(_cz, _cz); // pre-scale: draw at zoom resolution
            c.translate(MB1_INF_W / 2, MB1_INF_H / 2 + 12);

            var savedFacing = unit.facingDir;
            unit.facingDir = 1;
            try {
                // *** USES RAW FUNCTION — bypasses ALL LOD wrappers ***
                _rawInf.call(null, c, 0, 0, moving, frame, factionColor,
                             type, isAttacking, side, unitName, isFleeing,
                             cooldown, unitAmmo, unit, reloadProgress);
            } finally {
                unit.facingDir = savedFacing;
            }

            c.restore();
            _spriteCache.set(key, { cv: cv, t: now });
            return cv;
        } catch (e) {
            _spriteCache.delete(key);
            return null;
        }
    }

    function _getCachedCavFrame(key, unit, moving, frame, factionColor,
                                 isAttacking, type, side, unitName,
                                 isFleeing, cooldown, unitAmmo, reloadProgress) {
        var entry = _spriteCache.get(key);
        var now = performance.now();
        if (entry && (now - entry.t) < MB1_CACHE_TTL_MS) {
            entry.t = now;
            return entry.cv;
        }

        if (_spriteCache.size >= MB1_CACHE_MAX) _evictOldest();

        try {
            // v1.7 BLUR FIX: same zoom pre-scale as infantry (see _getCachedInfFrame).
            var _cz = (typeof zoom !== 'undefined' && zoom > 0) ? zoom : 1;
            var _scaledW = Math.round(MB1_CAV_W * _cz);
            var _scaledH = Math.round(MB1_CAV_H * _cz);
            var cv = (entry && entry.cv) ? entry.cv : document.createElement('canvas');
            cv.width  = _scaledW;
            cv.height = _scaledH;
            var c = cv.getContext('2d');
            c.clearRect(0, 0, _scaledW, _scaledH);
            c.save();
            c.scale(_cz, _cz); // pre-scale: draw at zoom resolution
            c.translate(MB1_CAV_W / 2, MB1_CAV_H / 2 + 16);

            var savedFacing = unit.facingDir;
            unit.facingDir = 1;
            try {
                // *** USES RAW FUNCTION — bypasses ALL LOD wrappers ***
                _rawCav.call(null, c, 0, 0, moving, frame, factionColor,
                             isAttacking, type, side, unitName, isFleeing,
                             cooldown, unitAmmo, unit, reloadProgress);
            } finally {
                unit.facingDir = savedFacing;
            }

            c.restore();
            _spriteCache.set(key, { cv: cv, t: now });
            return cv;
        } catch (e) {
            _spriteCache.delete(key);
            return null;
        }
    }

    function _gcCache() {
        _cacheGCTick++;
        if ((_cacheGCTick % 600) !== 0) return;
        var now = performance.now();
        _spriteCache.forEach(function (entry, key) {
            if ((now - entry.t) > MB1_CACHE_TTL_MS * 3) {
                _spriteCache.delete(key);
            }
        });
    }

    // ── INFANTRY CACHED RENDER ───────────────────────────────────────
    var _prevInf = window.drawInfantryUnit;  // may be PB1's wrapper — fine for pass-through
    window.drawInfantryUnit = function (ctx, x, y, moving, frame, factionColor,
                                        type, isAttacking, side, unitName,
                                        isFleeing, cooldown, unitAmmo, unit,
                                        reloadProgress) {
        if (typeof inBattleMode === 'undefined' || !inBattleMode ||
            document.getElementById('cb-menu-container') ||
            !unit || !unit.stats) {
            return _prevInf.apply(this, arguments);
        }
        if (unit.isCommander && unit.side === 'player') {
            return _prevInf.apply(this, arguments);
        }
        if (unit.hp <= 0) {
            return _prevInf.apply(this, arguments);
        }

        // ── v1.6 FIX: Swimming / overboard bypass ─────────────────────
        // Drowning visuals apply per-frame clipping + waterlines at the
        // unit's CURRENT world position. Caching would bake stale waterlines
        // or skip the visuals entirely on cache-hit frames. Either is wrong.
        if (unit.isSwimming || (unit.overboardTimer && unit.overboardTimer > 0)) {
            return _prevInf.apply(this, arguments);
        }
        // ──────────────────────────────────────────────────────────────

        // Skip cache for attacking units (swing/fire animation is time-based)
        if (isAttacking) {
            return _prevInf.apply(this, arguments);
        }

        // ── v1.6 FIX: Ranged cooldown bypass (was: && reloadProgress > 0) ──
        // Any ranged unit with active cooldown has a multi-phase reload
        // animation (crossbow spanning, gun reload, throw wind-up). The
        // cooldown phase is NOT encoded in the cache key. Crossing the
        // bypass on cooldown alone catches the "moving + cooldown" case
        // that the old guard missed.
        if (unit.stats.isRanged && unit.cooldown > 0) {
            return _prevInf.apply(this, arguments);
        }
        // ────────────────────────────────────────────────────────────────

        _gcCache();

        var armorT   = _armorTier((unit.stats.armor !== undefined) ? unit.stats.armor : 2);

        var ammoCount = -1;
        if (unit.stats.isRanged) {
            ammoCount = Math.min(unit.stats.ammo, 4);
            if (ammoCount < 0) ammoCount = 0;
        }

        var animF    = moving ? (Math.floor(frame * 0.3) & (MB1_ANIM_FRAMES - 1)) : 0;
        var facingDir = (unit.facingDir === -1) ? -1 : 1;

        var extra = (isFleeing ? 'F' : '');
        if (type === 'peasant') {
            var unitSeed = 0;
            if (typeof unit.id === 'number') {
                unitSeed = Math.abs(unit.id) % 10;
            } else if (typeof unit.id === 'string') {
                for (var ci = 0; ci < unit.id.length; ci++) {
                    unitSeed += unit.id.charCodeAt(ci);
                }
                unitSeed = unitSeed % 10;
            } else if (typeof unit._weaponSeed !== 'undefined') {
                unitSeed = unit._weaponSeed % 10;
            }
            extra += 'S' + unitSeed;
        }

        var key = _buildKey(type, unitName, side, armorT, isAttacking, ammoCount,
                            1, animF, factionColor, extra) +
                  '|Z' + (Math.round((typeof zoom !== 'undefined' ? zoom : 1) * 4) / 4);

        var cv = _getCachedInfFrame(key, unit, moving, frame, factionColor,
                                    type, isAttacking, side, unitName,
                                    isFleeing, cooldown, unitAmmo, reloadProgress);
        if (!cv) {
            return _prevInf.apply(this, arguments);
        }

        // v1.7: cache canvas is pre-scaled to zoom resolution; blit with explicit
        // dWidth/dHeight = unzoomed dims so the src (W*zoom px) maps to
        // (W ctx-units × zoom px/unit) = W*zoom screen px — perfect 1:1, no blur.
        // imageSmoothingEnabled toggles removed: 1:1 blit needs no interpolation.
        ctx.save();
        ctx.translate(x, y);
        if (facingDir === -1) ctx.scale(-1, 1);
        ctx.drawImage(cv, -MB1_INF_W / 2, -MB1_INF_H / 2 - 12, MB1_INF_W, MB1_INF_H);
        ctx.restore();
    };

    // ── CAVALRY CACHED RENDER ────────────────────────────────────────
    var _prevCav = window.drawCavalryUnit;
    window.drawCavalryUnit = function (ctx, x, y, moving, frame, factionColor,
                                       isAttacking, type, side, unitName,
                                       isFleeing, cooldown, unitAmmo, unit,
                                       reloadProgress) {
        if (typeof inBattleMode === 'undefined' || !inBattleMode ||
            document.getElementById('cb-menu-container') ||
            !unit || !unit.stats) {
            return _prevCav.apply(this, arguments);
        }
        if (unit.isCommander && unit.side === 'player') {
            return _prevCav.apply(this, arguments);
        }
        if (unit.hp <= 0) {
            return _prevCav.apply(this, arguments);
        }

        // ── v1.6 FIX: Swimming / overboard bypass (same as infantry) ──
        if (unit.isSwimming || (unit.overboardTimer && unit.overboardTimer > 0)) {
            return _prevCav.apply(this, arguments);
        }
        // ──────────────────────────────────────────────────────────────

        if (isAttacking) {
            return _prevCav.apply(this, arguments);
        }

        // ── v1.6 FIX: Ranged cooldown bypass (was: && reloadProgress > 0) ──
        if (unit.stats.isRanged && unit.cooldown > 0) {
            return _prevCav.apply(this, arguments);
        }
        // ────────────────────────────────────────────────────────────────

        _gcCache();

        var armorT   = _armorTier((unit.stats.armor !== undefined) ? unit.stats.armor : 2);
        var ammoCount = -1;
        if (unit.stats.isRanged) {
            ammoCount = Math.min(unit.stats.ammo, 4);
            if (ammoCount < 0) ammoCount = 0;
        }
        var animF    = moving ? (Math.floor(frame * 0.3) & (MB1_ANIM_FRAMES - 1)) : 0;
        var facingDir = (unit.facingDir === -1) ? -1 : 1;
        var extra = (isFleeing ? 'F' : '');

        var key = 'CAV|' + _buildKey(type, unitName, side, armorT, isAttacking, ammoCount,
                                     1, animF, factionColor, extra) +
                  '|Z' + (Math.round((typeof zoom !== 'undefined' ? zoom : 1) * 4) / 4);

        var cv = _getCachedCavFrame(key, unit, moving, frame, factionColor,
                                    isAttacking, type, side, unitName,
                                    isFleeing, cooldown, unitAmmo, reloadProgress);
        if (!cv) {
            return _prevCav.apply(this, arguments);
        }

        // v1.7: same 1:1 blit strategy as infantry — explicit dWidth/dHeight, no imageSmoothingEnabled.
        ctx.save();
        ctx.translate(x, y);
        if (facingDir === -1) ctx.scale(-1, 1);
        ctx.drawImage(cv, -MB1_CAV_W / 2, -MB1_CAV_H / 2 - 16, MB1_CAV_W, MB1_CAV_H);
        ctx.restore();
    };

    console.log('[OPT-MOBILE-BATTLES MB1] Sprite cache active (v1.7: zoom-pre-scaled canvas, 1:1 blit, blur eliminated).');
}


// ══════════════════════════════════════════════════════════════════════
// MB2  2-TIER DISTANCE LOD ON MOBILE  ★★★★★
// ══════════════════════════════════════════════════════════════════════
//
// v1.5 REWRITE: player-unit proximity tiers instead of viewport-rect.
// Blur tier removed. Two tiers: full sprite (< MB2_FULL_PX screen-px
// from nearest player unit) and dot (beyond). Unchanged in v1.6.
// ──────────────────────────────────────────────────────────────────────

// Frame-local player position snapshot (rebuilt each drawBattleUnits call)
var _mb2PlayerPositions = [];
var _mb2PlayerPosDirty  = true;

function _mb2_tighterLOD() {
    var _prevInf = window.drawInfantryUnit;
    var _prevCav = window.drawCavalryUnit;
    if (typeof _prevInf !== 'function' || typeof _prevCav !== 'function') return;

    function _refreshPlayerPositions() {
        _mb2PlayerPositions.length = 0;
        if (typeof battleEnvironment === 'undefined' || !battleEnvironment) return;
        if (!Array.isArray(battleEnvironment.units)) return;
        var units = battleEnvironment.units;
        for (var i = 0; i < units.length; i++) {
            var u = units[i];
            if (u && u.side === 'player' && u.hp > 0) {
                _mb2PlayerPositions.push(u.x, u.y);
            }
        }
    }

    function _minScreenDistSq(wx, wy) {
        var pos  = _mb2PlayerPositions;
        var len  = pos.length;
        if (len === 0) return Infinity;

        var z = (typeof zoom !== 'undefined') ? zoom : 1;
        var minSq = Infinity;
        for (var i = 0; i < len; i += 2) {
            var dx = (wx - pos[i])     * z;
            var dy = (wy - pos[i + 1]) * z;
            var dSq = dx * dx + dy * dy;
            if (dSq < minSq) minSq = dSq;
        }
        return minSq;
    }

    var _fullSq = MB2_FULL_PX * MB2_FULL_PX;

    function _lodTier(wx, wy, unit) {
        if (unit && unit.isCommander && unit.side === 'player') return 0;
        if (typeof zoom === 'undefined') return 0;

        var dSq = _minScreenDistSq(wx, wy);
        if (dSq <= _fullSq) return 0;
        return 2;
    }

    function _drawDot(ctx, x, y, color, unit, radius) {
        var alpha = 1.0;
        if (unit) {
            if (unit.stats && unit.stats.morale <= 0) alpha = 0.55;
            if (unit.state === 'FLEEING' || unit.state === 'routing') alpha = 0.45;
        }
        ctx.save();
        if (alpha < 1.0) ctx.globalAlpha = alpha;
        ctx.fillStyle = color || '#888';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 6.2832);
        ctx.fill();
        ctx.restore();
    }

    // Wrap drawBattleUnits to refresh the position cache once/frame
    var _pollId2 = null;
    var _pollN2 = 0;
    var _tryWrapBU = function () {
        if (typeof drawBattleUnits !== 'function') return;
        clearInterval(_pollId2);
        var _origDraw = window.drawBattleUnits;
        window.drawBattleUnits = function (ctx) {
            _refreshPlayerPositions();
            return _origDraw.apply(this, arguments);
        };
    };
    _pollId2 = setInterval(function () {
        _pollN2++;
        _tryWrapBU();
        if (_pollN2 > 100) clearInterval(_pollId2);
    }, 300);
    _tryWrapBU();

    // Infantry wrapper
    window.drawInfantryUnit = function (ctx, x, y, moving, frame, factionColor,
                                        type, isAttacking, side, unitName,
                                        isFleeing, cooldown, unitAmmo, unit,
                                        reloadProgress) {
        if (typeof inBattleMode === 'undefined' || !inBattleMode ||
            document.getElementById('cb-menu-container')) {
            return _prevInf.apply(this, arguments);
        }

        var tier = _lodTier(x, y, unit);

        if (tier === 2) {
            if (unit && unit.hp <= 0) return;
            _drawDot(ctx, x, y, factionColor, unit, 3);
            return;
        }

        return _prevInf.apply(this, arguments);
    };

    // Cavalry wrapper
    window.drawCavalryUnit = function (ctx, x, y, moving, frame, factionColor,
                                       isAttacking, type, side, unitName,
                                       isFleeing, cooldown, unitAmmo, unit,
                                       reloadProgress) {
        if (typeof inBattleMode === 'undefined' || !inBattleMode ||
            document.getElementById('cb-menu-container')) {
            return _prevCav.apply(this, arguments);
        }

        var tier = _lodTier(x, y, unit);

        if (tier === 2) {
            if (unit && unit.hp <= 0) return;
            var isElephant = (type === 'elephant') ||
                             (unitName && /eleph|elefa/i.test(unitName));
            _drawDot(ctx, x, y, factionColor, unit, isElephant ? 8 : 5);
            return;
        }

        return _prevCav.apply(this, arguments);
    };

    console.log('[OPT-MOBILE-BATTLES MB2] 2-tier proximity LOD active ' +
                '(full<=' + MB2_FULL_PX + 'px, dot beyond, screen-px to nearest player unit). Blur removed.');
}


// ══════════════════════════════════════════════════════════════════════
// MB3  PROCESSTARGETING VIEWPORT CULL  ★★★★☆
// ══════════════════════════════════════════════════════════════════════
//
// (unchanged from v1.1 — see original comments)
// ──────────────────────────────────────────────────────────────────────

function _mb3_targetingCull() {
    var _pollN = 0;
    var _pollId = null;

    var _tryWrap = function () {
        if (typeof AICategories === 'undefined') return;
        if (typeof AICategories.processTargeting !== 'function') return;
        clearInterval(_pollId);

        var _orig = AICategories.processTargeting;

        AICategories.processTargeting = function (unit, units) {
            if (!unit) return;

            if (unit.isCommander) return _orig.call(this, unit, units);
            if (unit.orderType === 'ladder_crew'      ||
                unit.siegeRole === 'ladder_fanatic'   ||
                unit.siegeRole === 'ladder_carrier'   ||
                unit.siegeRole === 'ram_pusher'       ||
                unit.siegeRole === 'engine_crew')      return _orig.call(this, unit, units);
            if (unit.disableAICombat)                  return _orig.call(this, unit, units);

            if (typeof camera !== 'undefined' && camera) {
                var pad = MB3_CULL_PADDING;
                if (unit.x < camera.x - pad ||
                    unit.x > camera.x + camera.width + pad ||
                    unit.y < camera.y - pad ||
                    unit.y > camera.y + camera.height + pad) {
                    var hasGoodTarget = unit.target && unit.target.hp > 0 && !unit.target.isDummy;
                    if (hasGoodTarget) return;
                    if (Math.random() > 0.02) return;
                }
            }

            return _orig.call(this, unit, units);
        };

        console.log('[OPT-MOBILE-BATTLES MB3] processTargeting culled.');
    };

    _pollId = setInterval(function () {
        _pollN++;
        _tryWrap();
        if (_pollN > 100) clearInterval(_pollId);
    }, 300);

    _tryWrap();
}


// ══════════════════════════════════════════════════════════════════════
// MB4  CACHED visType  ★★★★☆  (deferred — handled by MB1 key)
// ══════════════════════════════════════════════════════════════════════

function _mb4_cachedVisType() {
    console.log('[OPT-MOBILE-BATTLES MB4] visType resolution offset to MB1 cache keys.');
}


// ══════════════════════════════════════════════════════════════════════
// MB5  SAFE 30 FPS AI UPDATE THROTTLE  ★★★★☆
// ══════════════════════════════════════════════════════════════════════
//
// Wraps updateBattleUnits at half rate for land battles.
// MB14 (sweep-and-prune) is now the primary simulation speedup.
// MB5 remains as a coarse complement — run together they give both
// O(N²)→O(Nk) collision cost reduction AND reduced per-frame AI load.
// ──────────────────────────────────────────────────────────────────────

function _mb5_rafCap() {
    var _pollN = 0;
    var _pollId = null;
    var _tick = 0;

    var _tryWrap = function () {
        if (typeof updateBattleUnits !== 'function') return;
        clearInterval(_pollId);

        var _orig = window.updateBattleUnits;

        window.updateBattleUnits = function () {
            _tick++;
            if (MB5_AI_SKIP > 1 && (_tick % MB5_AI_SKIP) !== 0) {
                var inSiege = (typeof inSiegeBattle !== 'undefined' && inSiegeBattle);
                var inNaval = (typeof inNavalBattle !== 'undefined' && inNavalBattle);
                if (!inSiege && !inNaval) return;
            }
            return _orig.apply(this, arguments);
        };

        console.log('[OPT-MOBILE-BATTLES MB5] updateBattleUnits throttled (skip-' +
                    MB5_AI_SKIP + ', land battles only).');
    };

    _pollId = setInterval(function () {
        _pollN++;
        _tryWrap();
        if (_pollN > 100) clearInterval(_pollId);
    }, 300);

    _tryWrap();
}


// ══════════════════════════════════════════════════════════════════════
// MB6  SUPPLY LINE OFFSCREEN CULL  ★★★☆☆
// ══════════════════════════════════════════════════════════════════════

function _mb6_supplyCull() {
    var _pollN = 0;
    var _pollId = null;

    var _tryWrap = function () {
        if (typeof drawSupplyLines !== 'function') return;
        clearInterval(_pollId);

        var _orig = window.drawSupplyLines;

        window.drawSupplyLines = function (ctx, x, y, factionColor, camera) {
            if (typeof player !== 'undefined' && player &&
                typeof canvas !== 'undefined' && canvas &&
                typeof zoom !== 'undefined') {
                var halfH = (canvas.height / zoom) / 2;
                var padY  = 200;
                if (y < player.y - halfH - padY ||
                    y > player.y + halfH + padY) {
                    return;
                }
            }
            return _orig.apply(this, arguments);
        };

        console.log('[OPT-MOBILE-BATTLES MB6] drawSupplyLines off-screen cull installed.');
    };

    _pollId = setInterval(function () {
        _pollN++;
        _tryWrap();
        if (_pollN > 100) clearInterval(_pollId);
    }, 300);

    _tryWrap();
}


// ══════════════════════════════════════════════════════════════════════
// MB7  BLOOD POOL JITTER FIX  ★★☆☆☆
// ══════════════════════════════════════════════════════════════════════

function _mb7_bloodPoolJitter() {
    var _pollN = 0;
    var _pollId = null;

    var _tryWrap = function () {
        if (typeof drawBloodPool !== 'function') return;
        clearInterval(_pollId);

        var _orig = window.drawBloodPool;

        window.drawBloodPool = function (ctx, unit) {
            if (!unit || !unit.bloodStats) return _orig.apply(this, arguments);

            if (unit.bloodStats._mbBaked !== true) {
                unit.bloodStats._rfX     = 1.4 + Math.random() * 0.04;
                unit.bloodStats._rfY     = 1.4 + Math.random() * 0.04;
                unit.bloodStats._mbBaked = true;
            }

            var stats = unit.bloodStats;
            ctx.save();
            ctx.translate(unit.x + unit.deathXOffset, unit.y + unit.deathYOffset);
            ctx.fillStyle = 'rgba(100, 0, 0, ' + stats.opacity + ')';
            ctx.beginPath();
            ctx.ellipse(0, 0,
                stats.radiusX * stats._rfX,
                stats.radiusY * stats._rfY,
                stats.rotation,
                0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        };

        console.log('[OPT-MOBILE-BATTLES MB7] Blood pool jitter fixed.');
    };

    _pollId = setInterval(function () {
        _pollN++;
        _tryWrap();
        if (_pollN > 100) clearInterval(_pollId);
    }, 300);

    _tryWrap();
}


// ══════════════════════════════════════════════════════════════════════
// MB8  IN-PLACE SORT CACHE  ★★★☆☆  (deferred)
// ══════════════════════════════════════════════════════════════════════
//
// NOTE: The [...battleEnvironment.units].sort() allocation in troop_draw.js
// happens at module scope (sortedUnitsCache / lastSortTime are private to
// the module). MB16's viewport pre-cull reduces the array being spread from
// ~200 units to ~30, which cuts allocation cost by ~85% without needing to
// touch the internals. MB8 formal implementation deferred.
// ──────────────────────────────────────────────────────────────────────

function _mb8_sortInPlace() {
    console.log('[OPT-MOBILE-BATTLES MB8] Sort optimization superseded by MB16 viewport pre-cull.');
}


// ══════════════════════════════════════════════════════════════════════
// MB9  SELECTION RING FAST PATH  ★★☆☆☆  (deferred)
// ══════════════════════════════════════════════════════════════════════

function _mb9_selectionFast() {
    console.log('[OPT-MOBILE-BATTLES MB9] Selection ring micro-opt deferred.');
}


// ══════════════════════════════════════════════════════════════════════
// MB10  GROUND EFFECTS HARD CAP ON MOBILE  ★★☆☆☆
// ══════════════════════════════════════════════════════════════════════

function _mb10_groundCap() {
    setInterval(function () {
        if (typeof inBattleMode === 'undefined' || !inBattleMode) return;
        if (typeof battleEnvironment === 'undefined' || !battleEnvironment) return;
        if (!Array.isArray(battleEnvironment.groundEffects)) return;

        var arr = battleEnvironment.groundEffects;
        if (arr.length > MB10_GROUND_MAX) {
            arr.splice(0, arr.length - MB10_GROUND_MAX);
        }
    }, 1000);

    console.log('[OPT-MOBILE-BATTLES MB10] Ground FX count cap @ ' + MB10_GROUND_MAX + '.');
}


// ══════════════════════════════════════════════════════════════════════
// MB12  DEAD UNIT EARLY FLUSH  ★★★☆☆  NEW IN v1.2
// ══════════════════════════════════════════════════════════════════════
//
// Pre-marks dead units outside the camera with _mbDeadSkip=true so
// drawBloodPool / drawInfantryUnit / drawCavalryUnit return immediately
// for them, eliminating ctx save/translate/rotate/restore overhead.
//
// v1.6 NOTE: MB16 (viewport pre-cull) now filters battleEnvironment.units
// to only visible units BEFORE the sort/forEach in drawBattleUnits, so
// most off-screen dead units never reach the draw loop at all. MB12 is
// now a secondary safety net for dead units right at the camera margin.
// ──────────────────────────────────────────────────────────────────────

function _mb12_deadUnitFlush() {
    var _pollN = 0;
    var _pollId = null;

    var _tryWrap = function () {
        if (typeof drawBattleUnits !== 'function') return;
        clearInterval(_pollId);

        var _origDraw = window.drawBattleUnits;

        window.drawBattleUnits = function (ctx) {
            if (typeof inBattleMode === 'undefined' || !inBattleMode ||
                typeof player === 'undefined' ||
                typeof battleEnvironment === 'undefined' ||
                !Array.isArray(battleEnvironment.units)) {
                return _origDraw.apply(this, arguments);
            }

            var flagged = [];
            var margin = 120;
            var units = battleEnvironment.units;

            if (typeof camera !== 'undefined' && camera) {
                var left   = camera.x - margin;
                var right  = camera.x + camera.width  + margin;
                var top    = camera.y - margin;
                var bottom = camera.y + camera.height + margin;

                for (var i = 0; i < units.length; i++) {
                    var u = units[i];
                    if (!u || u.hp > 0) continue;
                    if (u.isCommander && u.side === 'player') continue;
                    if (u.x < left || u.x > right || u.y < top || u.y > bottom) {
                        u._mbDeadSkip = true;
                        flagged.push(u);
                    }
                }
            }

            var result;
            try {
                result = _origDraw.apply(this, arguments);
            } finally {
                for (var j = 0; j < flagged.length; j++) {
                    flagged[j]._mbDeadSkip = false;
                }
            }
            return result;
        };

        var _prevBP = window.drawBloodPool;
        window.drawBloodPool = function (ctx, unit) {
            if (unit && unit._mbDeadSkip) return;
            return _prevBP.apply(this, arguments);
        };

        var _prevInf12 = window.drawInfantryUnit;
        window.drawInfantryUnit = function (ctx, x, y, moving, frame, factionColor,
                                            type, isAttacking, side, unitName,
                                            isFleeing, cooldown, unitAmmo, unit,
                                            reloadProgress) {
            if (unit && unit._mbDeadSkip) return;
            return _prevInf12.apply(this, arguments);
        };

        var _prevCav12 = window.drawCavalryUnit;
        window.drawCavalryUnit = function (ctx, x, y, moving, frame, factionColor,
                                           isAttacking, type, side, unitName,
                                           isFleeing, cooldown, unitAmmo, unit,
                                           reloadProgress) {
            if (unit && unit._mbDeadSkip) return;
            return _prevCav12.apply(this, arguments);
        };

        console.log('[OPT-MOBILE-BATTLES MB12] Dead unit LOD early-flush installed.');
    };

    _pollId = setInterval(function () {
        _pollN++;
        _tryWrap();
        if (_pollN > 100) clearInterval(_pollId);
    }, 300);

    _tryWrap();
}


// ══════════════════════════════════════════════════════════════════════
// MB13  GROUND EFFECTS DISTANCE CULL  ★★★☆☆  NEW IN v1.2
// ══════════════════════════════════════════════════════════════════════

function _mb13_groundEffectDistanceCull() {
    setInterval(function () {
        if (typeof inBattleMode === 'undefined' || !inBattleMode) return;
        if (typeof battleEnvironment === 'undefined' || !battleEnvironment) return;
        if (!Array.isArray(battleEnvironment.groundEffects)) return;
        if (typeof player === 'undefined' || !player) return;
        if (typeof camera === 'undefined' || !camera) return;

        var margin = MB13_GE_MARGIN;
        var left   = camera.x - margin;
        var right  = camera.x + camera.width  + margin;
        var top    = camera.y - margin;
        var bottom = camera.y + camera.height + margin;
        var arr    = battleEnvironment.groundEffects;

        for (var i = arr.length - 1; i >= 0; i--) {
            var ge = arr[i];
            if (!ge) { arr.splice(i, 1); continue; }
            if (ge.x < left || ge.x > right || ge.y < top || ge.y > bottom) {
                arr.splice(i, 1);
            }
        }
    }, 2000);

    console.log('[OPT-MOBILE-BATTLES MB13] Ground FX viewport cull active (margin=' + MB13_GE_MARGIN + 'px, 2s interval).');
}


// ══════════════════════════════════════════════════════════════════════
// MB14  SWEEP-AND-PRUNE COLLISION  ★★★★★  NEW IN v1.6
// ══════════════════════════════════════════════════════════════════════
//
// WHY applyUnitCollisions IS THE HIDDEN BOTTLENECK
// ─────────────────────────────────────────────────
// The brute-force double-loop runs N*(N-1)/2 distance checks per frame.
// At N=200 that is 19,900 checks; at N=100 it is 4,950. MB5 halves
// the frame rate of updateBattleUnits (which calls applyUnitCollisions),
// but each invocation still does O(N²) work.
//
// ALGORITHM — X-sorted sweep-and-prune
// ──────────────────────────────────────
// 1. Collect all collision-eligible units (alive, not FLEEING, not climbing)
//    into a pre-allocated scratch array and sort by X position.
// 2. For each unit u1, scan forward through the sorted list (u2, u3 ...):
//      if (u2.x - u1.x > MAX_SWEEP_DX) → BREAK.
//    No pair beyond that threshold can possibly collide (their X gap alone
//    exceeds the largest possible collision distance).
// 3. For pairs that pass the X gate, run the full distance check + physics.
//
// In practice each unit checks 3–8 neighbours instead of 200.
// Expected: ~15–25× fewer distance checks per frame vs brute-force.
//
// SAFETY — Land battles only
// ──────────────────────────
// Siege and naval have extra tile-grid collision guards (naval deck revert,
// siege scaffold revert, climbing X revert) that are tightly coupled to the
// original function's structure. Rather than replicate and risk divergence,
// MB14 falls back to the original function in those modes. The original
// is still called at half-rate via MB5 in all modes.
//
// MAX_SWEEP_DX derivation
// ────────────────────────
// Largest radius: elephant ~20px. Max minDistance = (20+20)*0.6 = 24px.
// MB14_MAX_SWEEP_DX = 30 gives a 25% safety margin for float drift.
// ──────────────────────────────────────────────────────────────────────

function _mb14_sweepAndPrune() {
    var _pollN  = 0;
    var _pollId = null;
    var _sweepArr = []; // Pre-allocated scratch array — reused every frame

    var _tryWrap = function () {
        if (typeof applyUnitCollisions !== 'function') return;
        clearInterval(_pollId);

        var _orig = window.applyUnitCollisions;

        window.applyUnitCollisions = function (units) {
            if (!units || units.length < 2) return;

            // Safety: fall through to original in siege/naval — they have
            // extra tile-grid guards we do not replicate here.
            var inSiege = (typeof inSiegeBattle !== 'undefined' && inSiegeBattle);
            var inNaval = (typeof inNavalBattle !== 'undefined' && inNavalBattle);
            if (inSiege || inNaval) {
                return _orig.apply(this, arguments);
            }

            // ── Build sorted scratch list ───────────────────────────
            _sweepArr.length = 0;
            for (var i = 0; i < units.length; i++) {
                var u = units[i];
                // Mirror the outer-loop skip conditions from the original function:
                //   hp <= 0, state === "FLEEING", isClimbing
                if (u && u.hp > 0 && u.state !== 'FLEEING' && !u.isClimbing &&
                    u.stats && typeof u.stats.radius === 'number') {
                    _sweepArr.push(u);
                }
            }

            if (_sweepArr.length < 2) return;

            // Sort ascending by X (in-place on the scratch array, not the live units array)
            _sweepArr.sort(function (a, b) {
                var ax = a.x || 0;
                var bx = b.x || 0;
                return ax - bx;
            });

            var MAX_DX = MB14_MAX_SWEEP_DX;
            var len = _sweepArr.length;

            for (var i = 0; i < len; i++) {
                var u1 = _sweepArr[i];

                for (var j = i + 1; j < len; j++) {
                    var u2 = _sweepArr[j];

                    // ── EARLY EXIT: X gap alone rules out any collision ──
                    var xGap = (u2.x || 0) - (u1.x || 0);
                    if (xGap > MAX_DX) break;

                    // Also skip if either unit died or fled mid-loop
                    // (possible if processAction ran between iterations)
                    if (u2.hp <= 0 || u2.state === 'FLEEING' || u2.isClimbing) continue;

                    // ── Distance check ───────────────────────────────────
                    var minDistance = (u1.stats.radius + u2.stats.radius) * 0.6;
                    var dx = (u2.x - u1.x);
                    var dy = (u2.y - u1.y);
                    var distSq = dx * dx + dy * dy;

                    if (distSq < minDistance * minDistance && distSq > 0) {
                        var dist = Math.sqrt(distSq);
                        var overlap = minDistance - dist;

                        var nx = dx / dist;
                        var ny = dy / dist;

                        var push1 = 0;
                        var push2 = 0;

                        // Weight-tier hierarchy (mirrors battlefield_logic.js exactly)
                        if (u1.stats.weightTier > u2.stats.weightTier) {
                            push2 = overlap;
                            push1 = 0;
                        } else if (u2.stats.weightTier > u1.stats.weightTier) {
                            push1 = overlap;
                            push2 = 0;
                        } else {
                            var totalMass = (u1.stats.mass || 1) + (u2.stats.mass || 1);
                            push1 = ((u2.stats.mass || 1) / totalMass) * overlap;
                            push2 = ((u1.stats.mass || 1) / totalMass) * overlap;
                        }

                        // Cache X before push for climbing guard
                        var oldX1 = u1.x;
                        var oldX2 = u2.x;

                        u1.x -= nx * push1;
                        u1.y -= ny * push1;
                        u2.x += nx * push2;
                        u2.y += ny * push2;

                        // Climbing X revert (unit can only move vertically while on ladder)
                        if (u1.isClimbing) u1.x = oldX1;
                        if (u2.isClimbing) u2.x = oldX2;
                    }
                }
            }
        };

        console.log('[OPT-MOBILE-BATTLES MB14] Sweep-and-prune collision active ' +
                    '(land battles, max X-gap=' + MB14_MAX_SWEEP_DX + 'px, siege/naval → original).');
    };

    _pollId = setInterval(function () {
        _pollN++;
        _tryWrap();
        if (typeof applyUnitCollisions === 'function') clearInterval(_pollId);
        if (_pollN > 100) clearInterval(_pollId);
    }, 300);

    _tryWrap();
}


// ══════════════════════════════════════════════════════════════════════
// MB16  VIEWPORT PRE-CULL FOR drawBattleUnits  ★★★★★  NEW IN v1.6
// ══════════════════════════════════════════════════════════════════════
//
// THE PROBLEM
// ────────────
// troop_draw.js:
//   sortedUnitsCache = [...battleEnvironment.units].sort((a,b) => a.y - b.y);
//   sortedUnitsCache.forEach(unit => {
//     if (!isOnScreen(unit, camera)) return;   // <-- culls, but still pays forEach overhead
//     ... 300+ canvas ops per unit ...
//   });
//
// With 200 units at zoom 2x (your mobile lock), ~30 are on screen.
// The other 170 still pay: array spread element reference, forEach callback
// invocation, isOnScreen() function call, property reads (unit.x, unit.y).
// At 30 fps × 170 units × ~8 ops = 40,800 needless property reads/sec.
// The spread itself ([...arr]) also allocates a 200-element array every
// 200ms (SORT_INTERVAL on mobile), creating GC pressure.
//
// THE FIX
// ────────
// MB16 wraps drawBattleUnits (installs as the outermost wrapper, after MB12).
// Before calling the inner chain, it:
//   1. Computes camera world bounds + MB16_CULL_MARGIN.
//   2. Builds a filtered array of units that are within bounds.
//   3. Temporarily replaces battleEnvironment.units with the filtered array.
//   4. Calls the inner drawBattleUnits (which now sees only ~30 units).
//   5. Restores battleEnvironment.units in a finally block (never leaks).
//
// SAFETY
// ───────
// drawBattleUnits in troop_draw.js uses battleEnvironment.units for:
//   • The spread + sort (line 38) → now sorts ~30 entries instead of 200.
//   • The sortedUnitsCache.forEach → iterates ~30 entries instead of 200.
//   • Nothing else inside drawBattleUnits reads battleEnvironment.units.
//
// updateBattleUnits (battlefield_logic.js) captures `let units =
// battleEnvironment.units` at the top of its frame and operates on that
// snapshot. It is NOT inside drawBattleUnits, so the swap does NOT affect
// the simulation. Only the render path is affected.
//
// The MB2 _refreshPlayerPositions() wraps drawBattleUnits below MB16.
// It reads battleEnvironment.units after MB16 has swapped it in, so it
// only sees the visible subset. This is fine — MB2's LOD only needs to
// know player unit positions, and the player commander is always within
// the camera view (so always in the visible subset).
//
// MB16_CULL_MARGIN (120 world-px) prevents cavalry pop-in at the edge.
// Increase this value if units disappear too abruptly during fast scrolls.
// ──────────────────────────────────────────────────────────────────────

function _mb16_viewportPreCull() {
    var _pollN  = 0;
    var _pollId = null;

    // Pre-allocated visible units array — reused every frame to avoid allocation
    var _visibleUnits = [];
    // Holds the full array ref during the swap so we can restore it
    var _savedUnitsRef = null;

    var _tryWrap = function () {
        if (typeof drawBattleUnits !== 'function') return;
        clearInterval(_pollId);

        var _origDraw = window.drawBattleUnits;

        window.drawBattleUnits = function (ctx) {
            // Bail out if we don't have what we need for culling
            if (typeof inBattleMode === 'undefined' || !inBattleMode ||
                typeof battleEnvironment === 'undefined' ||
                !Array.isArray(battleEnvironment.units) ||
                typeof camera === 'undefined' || !camera) {
                return _origDraw.apply(this, arguments);
            }

            var units = battleEnvironment.units;
            var margin = MB16_CULL_MARGIN;

            // Camera bounds in world space
            var left   = camera.x - margin;
            var right  = camera.x + camera.width  + margin;
            var top    = camera.y - margin;
            var bottom = camera.y + camera.height + margin;

            // Build the visible subset into the pre-allocated array
            _visibleUnits.length = 0;
            for (var i = 0; i < units.length; i++) {
                var u = units[i];
                if (!u) continue;
                // Include dead units within camera margin so blood pools still render
                // Include all units within the padded camera rect
                if (u.x >= left && u.x <= right && u.y >= top && u.y <= bottom) {
                    _visibleUnits.push(u);
                }
            }

            // Swap battleEnvironment.units → visible subset
            _savedUnitsRef = battleEnvironment.units;
            battleEnvironment.units = _visibleUnits;

            var result;
            try {
                result = _origDraw.apply(this, arguments);
            } finally {
                // ALWAYS restore — even on exception — so simulation never sees a stale subset
                battleEnvironment.units = _savedUnitsRef;
                _savedUnitsRef = null;
            }

            return result;
        };

        console.log('[OPT-MOBILE-BATTLES MB16] Viewport pre-cull for drawBattleUnits active ' +
                    '(margin=' + MB16_CULL_MARGIN + 'px, outermost wrapper).');
    };

    _pollId = setInterval(function () {
        _pollN++;
        _tryWrap();
        if (typeof drawBattleUnits === 'function') clearInterval(_pollId);
        if (_pollN > 100) clearInterval(_pollId);
    }, 300);

    _tryWrap();
}


})();