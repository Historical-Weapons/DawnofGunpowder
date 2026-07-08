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

// ── GRAPHICAL QUALITY TIER  (0 = LOW / absolute minimum, 100 = HIGH / full fidelity) ──────
// Initialised here (before IS_MOBILE) so settings_ui.js can read/write it even on desktop
// without waiting for this IIFE to finish.  All MB wrappers read it at call-time via
// _mbGetQual() so changes made by the slider take effect on the NEXT rendered frame.
//
// Tier semantics (values are read dynamically — not locked at install time):
//   0%  (LOW)  : current absolute-minimum defaults — maximum frame savings
//   50% (MED)  : sprite-cache frame count ~3× larger, AI runs every frame
//  100% (HIGH) : sprite cache bypassed entirely → fully smooth unit animation
window.mobileBattleQuality = window.mobileBattleQuality ?? 0;

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

// ── Dynamic quality helper — called at render time (not install time) ────────
// Returns current quality 0-100.  All MB constants that affect visual quality
// are computed from this value so the settings slider takes effect live.
function _mbGetQual() {
    return (typeof window.mobileBattleQuality === 'number')
        ? Math.max(0, Math.min(100, window.mobileBattleQuality)) : 0;
}

// Quality→constant mappings (for reference / comments):
//  animFrames  : 4  (q=0)  → 12  (q=50)  — bypassed at q≥80
//  aiSkip      : 2  (q<40) → 1   (q≥40)  — skip-2=half-rate, 1=full
//  lodFullPx   : 400(q=0)  → 800 (q=100) screen-px full-sprite zone
//  groundMax   : 80 (q=0)  → 200 (q=100) ground-effects cap
//  cullMargin  : 120(q=0)  → 300 (q=100) viewport pre-cull margin
//  geMargin    : 200(q=0)  → 400 (q=100) ground-effect distance cull

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

// MB5: AI throttle frame skip for LOW quality (q<40). 2 = 30 Hz simulation.
// MED/HIGH always run at full rate regardless of this constant.
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
    _mb14_sweepAndPrune();
    _mb16_viewportPreCull();
    _mb17_zoomRestrict();  // NEW v2.0 — LOW only: clamp zoom to tight range
    _mb18_projectileCull(); // NEW v2.0 — LOW only: projectile draw radius cull
    _mb19_offscreenAISkip(); // NEW v2.0 — LOW only: off-screen units skip AI ticks

    console.log(
        '%c[OPT-MOBILE-BATTLES v2.0] Mobile mode INSTALLED\n' +
        '  Detection : Capacitor / Android WebView (strict)\n' +
        '  Quality   : window.mobileBattleQuality=' + Math.round(_mbGetQual()) + '%\n' +
        '              LOW(q<40)  : MB1 cache 4-8fr, MB5 30Hz, MB16 0px margin,\n' +
        '                           MB2 250px LOD, MB17 zoom clamp (tight), MB18 proj cull, MB19 AI skip\n' +
        '              MED(q40-79): MB1 bypassed (raw fn), MB5 full rate, MB16 150px, MB2 550px, MB17 zoom clamp (slight)\n' +
        '              HIGH(q≥80) : MB1 bypassed (desktop), MB5 full rate, MB16 300px, MB2 800px, MB17 unrestricted\n' +
        '  MB1 Sprite cache  (inf ' + MB1_INF_W + '×' + MB1_INF_H +
            ', cav ' + MB1_CAV_W + '×' + MB1_CAV_H + ', ' + MB1_CACHE_MAX + ' entries max)\n' +
        '     LOW=4-8 anim frames, MED=bypassed (raw fn), HIGH=bypassed (raw fn)\n' +
        '  MB2 2-tier LOD  LOW=250px, MED=550px, HIGH=800px full-sprite zone\n' +
        '  MB5 updateBattleUnits  LOW=30Hz throttle, MED/HIGH=full rate (desktop)\n' +
        '  MB14 sweep-and-prune collision (land battles, X-gap=' + MB14_MAX_SWEEP_DX + 'px)\n' +
        '  MB16 viewport pre-cull  LOW=0px, MED=150px, HIGH=300px margin\n' +
        '  MB17 zoom restriction  LOW: ' + MB17_LOW_MIN + '\u2013' + MB17_LOW_MAX +
            ', MED: ' + MB17_MED_MIN + '\u2013' + MB17_MED_MAX + ', HIGH: unrestricted\n' +
        '  MB18 projectile draw cull  LOW only: ' + MB18_RADIUS + 'px radius\n' +
        '  MB19 off-screen AI skip  LOW only: ' + MB19_OFFSCREEN_PAD + 'px pad, 1/' + MB19_TICK_DIVISOR + ' rate',
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

    // facingDirY added this session (bird's-eye up/down overhaul): the
    // cached sprite's IDLE/MOVING pose now differs by vertical facing
    // for ported unit types (currently just infantry "spearman" — see
    // infscript.js top-of-file notes), so it must be part of the key or
    // a unit that changes facingDirY while every other key component
    // stays the same would keep showing its stale pre-change pose until
    // TTL eviction. isAttacking frames were already always cache-bypassed
    // (see the `if (isAttacking) return _prevInf...` guard below) so this
    // only affects idle/moving frames, but those DO visibly differ now
    // (e.g. a spearman's idle stance is a diagonal side-hold vs. a
    // straight-down hold) so it still needed fixing.
    function _buildKey(unitType, unitName, side, armorTier, isAttacking, ammoCount,
                       facingDir, animFrame, factionColor, extraTag, facingDirY) {
        return (unitType || 'u') + '|' +
               (unitName || '') + '|' +
               (side || 'p') + '|' +
               armorTier + '|' +
               (isAttacking ? 1 : 0) + '|' +
               ammoCount + '|' +
               (facingDir || 1) + '|' +
               animFrame + '|' +
               (factionColor || '#000') + '|' +
               (extraTag || '') + '|' +
               (facingDirY || 0);
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

        // ── Quality gate ──────────────────────────────────────────────────
        //  MED+ (q ≥ 40) → bypass cache entirely: full desktop animation.
        //    Per-request: only LOW keeps the frame cap; MED and HIGH must
        //    both run completely unthrottled animation.
        //  LOW  (q < 40)  → cache with 4 frames (choppy but light on CPU).
        if (_mbGetQual() >= 40) return _prevInf.apply(this, arguments);
        // ─────────────────────────────────────────────────────────────────

        _gcCache();

        var armorT   = _armorTier((unit.stats.armor !== undefined) ? unit.stats.armor : 2);

        var ammoCount = -1;
        if (unit.stats.isRanged) {
            ammoCount = Math.min(unit.stats.ammo, 4);
            if (ammoCount < 0) ammoCount = 0;
        }

        // Dynamic frame count — LOW only now (q < 40, MED/HIGH bypassed above): 4..8 frames.
        // Modulo (not bitmask) so non-power-of-2 counts work correctly.
        var _mbNF = Math.round(4 + (Math.min(_mbGetQual(), 79) / 79) * 8); // 4..8 in practice (q<40)
        var animF    = moving ? (Math.floor(frame * 0.3) % _mbNF) : 0;
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
                            1, animF, factionColor, extra, unit.facingDirY) +
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

        // ── Quality gate (same as infantry — MED+ bypasses, only LOW capped) ──
        if (_mbGetQual() >= 40) return _prevCav.apply(this, arguments);
        // ─────────────────────────────────────────────────────────────────

        _gcCache();

        var armorT   = _armorTier((unit.stats.armor !== undefined) ? unit.stats.armor : 2);
        var ammoCount = -1;
        if (unit.stats.isRanged) {
            ammoCount = Math.min(unit.stats.ammo, 4);
            if (ammoCount < 0) ammoCount = 0;
        }
        var _mbNF = Math.round(4 + (Math.min(_mbGetQual(), 79) / 79) * 8); // 4..8 in practice (q<40, MED/HIGH bypassed above)
        var animF    = moving ? (Math.floor(frame * 0.3) % _mbNF) : 0;
        var facingDir = (unit.facingDir === -1) ? -1 : 1;
        var extra = (isFleeing ? 'F' : '');

        // NOTE: cavscript.js doesn't read facingDirY yet (see that file's
        // top-of-function notes — only infantry spearman is ported this
        // session), so this has no visible effect today. Included now so
        // the cache doesn't need a second audit once cavalry is ported.
        var key = 'CAV|' + _buildKey(type, unitName, side, armorT, isAttacking, ammoCount,
                                     1, animF, factionColor, extra, unit.facingDirY) +
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

    var _fullSq = MB2_FULL_PX * MB2_FULL_PX; // kept for log compat; runtime uses _mbGetQual()

    function _lodTier(wx, wy, unit) {
        if (unit && unit.isCommander && unit.side === 'player') return 0;
        if (typeof zoom === 'undefined') return 0;

        // Quality-gated LOD full-sprite zone:
        //   LOW  (q < 40)  → 250 px : only units within arm's reach of a
        //     player unit get full sprites; everything else is a dot. On a
        //     zoomed-in view (MB17 zoom restriction) this still covers the
        //     main combat cluster the player cares about.
        //   MED  (q 40-79) → 550 px : comfortable mid-range.
        //   HIGH (q ≥ 80)  → 800 px : same as original high-quality default.
        var q2 = _mbGetQual();
        var lodPx = q2 < 40 ? 250 : q2 < 80 ? 550 : 800;
        var dSq = _minScreenDistSq(wx, wy);
        if (dSq <= lodPx * lodPx) return 0;
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
            // Quality-gated simulation rate:
            //   LOW  (q < 40) : skip every other frame → ~30 Hz simulation.
            //     Halves all AI + physics + projectile CPU cost. The most
            //     impactful single change for shitty phones. Siege + naval
            //     always run at full rate regardless (their AI is heavier and
            //     timing is more sensitive).
            //   MED / HIGH (q ≥ 40) : full rate — identical to desktop.
            var _mbSkip = (_mbGetQual() < 40) ? 2 : 1;
            if (_mbSkip > 1 && (_tick % _mbSkip) !== 0) {
                var inSiege = (typeof inSiegeBattle !== 'undefined' && inSiegeBattle);
                var inNaval = (typeof inNavalBattle !== 'undefined' && inNavalBattle);
                if (!inSiege && !inNaval) return;
            }
            return _orig.apply(this, arguments);
        };

        console.log('[OPT-MOBILE-BATTLES MB5] updateBattleUnits: LOW=30Hz throttle, MED/HIGH=full rate (desktop equiv).');
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

        // Dynamic cap: 80 (q=0/LOW) → 200 (q=100/HIGH)
        var cap = Math.round(80 + (_mbGetQual() / 100) * 120);
        var arr = battleEnvironment.groundEffects;
        if (arr.length > cap) {
            arr.splice(0, arr.length - cap);
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

        // Dynamic margin: 200px (q=0/LOW) → 400px (q=100/HIGH)
        // Larger margin = more ground effects survive (higher quality appearance)
        var margin = Math.round(200 + (_mbGetQual() / 100) * 200);
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
            // Quality-gated viewport cull margin (world-px beyond camera edge):
            //   LOW  (q < 40)  →  0 px : pixel-perfect cull. Units must be
            //     inside the visible camera rect to be drawn at all. Combined
            //     with the zoom restriction (MB17) this keeps the rendered set
            //     tiny on low-end phones. Tiny pop-in is acceptable.
            //   MED  (q 40-79) → 150 px : comfortable pop-in buffer.
            //   HIGH (q ≥ 80)  → 300 px : same as original desktop behaviour.
            var q = _mbGetQual();
            var margin = q < 40 ? 0 : q < 80 ? 150 : 300;

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


// ══════════════════════════════════════════════════════════════════════
// MB17  ZOOM RESTRICTION — LOW (tight) + MED (slight) — HIGH UNRESTRICTED
// ══════════════════════════════════════════════════════════════════════
//
// On LOW, forces the player to stay zoomed in (sees a smaller world slice).
// This directly multiplies the effectiveness of MB16 (viewport cull) and
// MB2 (LOD dot zone) — a tighter view means fewer units survive the cull,
// fewer draw calls, and more units get the dot treatment.
//
// On MED, a much wider — but not unlimited — range applies: enough headroom
// for normal tactical zooming, just not the full extreme desktop range that
// could otherwise pull in far more units at once than a mid-tier phone
// should be asked to render.
//
// HIGH gets zero restriction — identical to desktop.
//
// Range: zoom must stay between _MIN and _MAX for the active tier.
// Default zoom in battles is ~0.8–1.0; MB17_LOW_MIN = 0.7 means you can
// zoom out a little but not far enough to see the whole battlefield at once.
// MB17_LOW_MAX = 2.5 matches the normal close-up zoom cap.
//
// Implementation: a setInterval that clamps `window.zoom` and
// `window.camera.zoom` every frame while on LOW or MED. It also monkey-
// patches the mouse-wheel / pinch handler in sandboxmode_update / RTSControls
// by overriding the global zoom variable so subsequent clamp checks agree.
// ──────────────────────────────────────────────────────────────────────

var MB17_LOW_MIN = 0.7;  // <<< minimum zoom on LOW (can't zoom out much)
var MB17_LOW_MAX = 2.5;  // <<< maximum zoom on LOW (can zoom in further)
var MB17_MED_MIN = 0.5;  // <<< minimum zoom on MED (slight — more room than LOW)
var MB17_MED_MAX = 3.0;  // <<< maximum zoom on MED (slight — more room than LOW)

function _mb17_zoomRestrict() {
    // Only enforces anything on LOW/MED; silently no-ops on HIGH.
    // Checked every frame via rAF so it responds to quality-tier changes.
    var _raf17 = null;

    function _clamp() {
        var q = _mbGetQual();

        if (q >= 80) {
            // HIGH — no restriction whatsoever
            _raf17 = requestAnimationFrame(_clamp);
            return;
        }

        var lo = (q < 40) ? MB17_LOW_MIN : MB17_MED_MIN;
        var hi = (q < 40) ? MB17_LOW_MAX : MB17_MED_MAX;

        // LOW or MED: clamp global zoom to the active tier's range
        if (typeof zoom !== 'undefined') {
            if (zoom < lo) {
                // Assign through window so the outer scope variable is updated
                // in browsers where `zoom` is declared with `var` in global scope.
                window.zoom = lo;
            } else if (zoom > hi) {
                window.zoom = hi;
            }
        }
        if (typeof camera !== 'undefined' && camera) {
            if (camera.zoom != null) {
                camera.zoom = Math.max(lo, Math.min(hi, camera.zoom));
            }
            if (camera.scale != null) {
                camera.scale = Math.max(lo, Math.min(hi, camera.scale));
            }
        }
        _raf17 = requestAnimationFrame(_clamp);
    }

    _raf17 = requestAnimationFrame(_clamp);
    console.log('[OPT-MOBILE-BATTLES MB17] Zoom restriction active — LOW (' +
                MB17_LOW_MIN + '–' + MB17_LOW_MAX + '), MED (' +
                MB17_MED_MIN + '–' + MB17_MED_MAX + '), HIGH unrestricted.');
}


// ══════════════════════════════════════════════════════════════════════
// MB18  PROJECTILE VIEWPORT CULL — LOW QUALITY ONLY  ★★★★☆
// ══════════════════════════════════════════════════════════════════════
//
// On LOW, skips drawing projectiles that are more than MB18_RADIUS world-px
// from the player. troop_draw.js already has a 600px distance cull, but
// that's applied AFTER ctx.save/translate — still spending canvas state
// overhead on every projectile. MB18 wraps the projectiles array with a
// tighter pre-filtered view so the forEach in troop_draw never sees them.
//
// Implementation: wraps drawBattleUnits to temporarily replace
// battleEnvironment.projectiles with a filtered subset, restoring it
// after the draw call — same pattern as MB16 for units.
// ──────────────────────────────────────────────────────────────────────

var MB18_RADIUS = 500; // <<< world-px radius around player for projectile draw on LOW

function _mb18_projectileCull() {
    var _pollN = 0;
    var _pollId = null;
    var _visProj = [];
    var _savedProj = null;

    var _tryWrap = function () {
        if (typeof drawBattleUnits !== 'function') return;
        clearInterval(_pollId);

        var _origDraw = window.drawBattleUnits;

        window.drawBattleUnits = function (ctx) {
            // Only on LOW and only in land battles (naval/siege draw paths differ)
            if (_mbGetQual() >= 40 ||
                typeof inBattleMode === 'undefined' || !inBattleMode ||
                typeof battleEnvironment === 'undefined' ||
                !Array.isArray(battleEnvironment.projectiles) ||
                typeof player === 'undefined') {
                return _origDraw.apply(this, arguments);
            }

            var all = battleEnvironment.projectiles;
            var px = player.x, py = player.y;
            var rSq = MB18_RADIUS * MB18_RADIUS;

            _visProj.length = 0;
            for (var i = 0; i < all.length; i++) {
                var p = all[i];
                if (!p) continue;
                var dx = p.x - px, dy = p.y - py;
                if (dx * dx + dy * dy <= rSq) _visProj.push(p);
            }

            _savedProj = battleEnvironment.projectiles;
            battleEnvironment.projectiles = _visProj;

            var result;
            try {
                result = _origDraw.apply(this, arguments);
            } finally {
                battleEnvironment.projectiles = _savedProj;
                _savedProj = null;
            }
            return result;
        };

        console.log('[OPT-MOBILE-BATTLES MB18] Projectile cull active (LOW only, ' +
                    MB18_RADIUS + 'px radius around player, no-op on MED/HIGH).');
    };

    _pollId = setInterval(function () {
        _pollN++;
        _tryWrap();
        if (_pollN > 100) clearInterval(_pollId);
    }, 300);

    _tryWrap();
}


// ══════════════════════════════════════════════════════════════════════
// MB19  OFF-SCREEN AI TICK SKIP — LOW QUALITY ONLY  ★★★★☆
// ══════════════════════════════════════════════════════════════════════
//
// On LOW, units far outside the camera viewport don't run their per-unit
// AI/physics tick. MB16 already skips DRAWING them; MB19 skips the
// SIMULATION work too (target selection, pathfinding nudges, state
// machine transitions). Off-screen units instead run a reduced-rate tick
// (1-in-8 frames) so they still eventually find targets and don't freeze
// permanently — they just do it less urgently.
//
// Implementation: wraps updateBattleUnits (which iterates all units) by
// temporarily hiding the off-screen subset from battleEnvironment.units
// on 7 of every 8 frames.  On the 8th frame all units run normally.
// Siege / naval are always excluded (their formations depend on global
// unit awareness).
// ──────────────────────────────────────────────────────────────────────

var MB19_OFFSCREEN_PAD = 300; // <<< world-px beyond camera before a unit is considered off-screen
var MB19_TICK_DIVISOR  = 8;   // <<< off-screen units run full AI 1 in this many frames

function _mb19_offscreenAISkip() {
    var _pollN  = 0;
    var _pollId = null;
    var _tick19 = 0;
    var _onScreenUnits  = [];
    var _savedUnitsRef19 = null;

    var _tryWrap = function () {
        if (typeof updateBattleUnits !== 'function') return;
        clearInterval(_pollId);

        var _origUpdate = window.updateBattleUnits;

        window.updateBattleUnits = function () {
            _tick19++;

            // Only on LOW; skip in siege/naval; skip if no camera
            if (_mbGetQual() >= 40 ||
                (typeof inSiegeBattle !== 'undefined' && inSiegeBattle) ||
                (typeof inNavalBattle !== 'undefined' && inNavalBattle) ||
                typeof battleEnvironment === 'undefined' ||
                !Array.isArray(battleEnvironment.units) ||
                typeof camera === 'undefined' || !camera) {
                return _origUpdate.apply(this, arguments);
            }

            // Full-rate tick every MB19_TICK_DIVISOR frames — off-screen units included
            if ((_tick19 % MB19_TICK_DIVISOR) === 0) {
                return _origUpdate.apply(this, arguments);
            }

            // Reduced-rate: filter to on-screen units only
            var pad  = MB19_OFFSCREEN_PAD;
            var left = camera.x - pad, right  = camera.x + camera.width  + pad;
            var top  = camera.y - pad, bottom = camera.y + camera.height + pad;
            var all  = battleEnvironment.units;

            _onScreenUnits.length = 0;
            for (var i = 0; i < all.length; i++) {
                var u = all[i];
                if (!u) continue;
                // CRITICAL: NEVER skip enemy units — the strategy AI (EnemyLandStrategyAI)
                // runs on its OWN setInterval and writes orderType / orderTargetPoint to each
                // unit. Those orders are only CONSUMED inside this forEach via processAction.
                // If an enemy unit is hidden from the simulation here, its move order never
                // executes and the unit stands still until the camera moves over it — exactly
                // the "enemy doesn't advance unless camera is looking at them" bug.
                // Only player units are safe to cull: the player's orders are issued
                // interactively (RTSControls / player input) and survive being skipped for
                // a few frames with no visible consequence.
                if (u.side === 'enemy') { _onScreenUnits.push(u); continue; }
                // Always include commanders regardless of position
                if (u.isCommander) { _onScreenUnits.push(u); continue; }
                if (u.x >= left && u.x <= right && u.y >= top && u.y <= bottom) {
                    _onScreenUnits.push(u);
                }
            }

            _savedUnitsRef19 = battleEnvironment.units;
            battleEnvironment.units = _onScreenUnits;

            var result;
            try {
                result = _origUpdate.apply(this, arguments);
            } finally {
                battleEnvironment.units = _savedUnitsRef19;
                _savedUnitsRef19 = null;
            }
            return result;
        };

        console.log('[OPT-MOBILE-BATTLES MB19] Off-screen AI skip active ' +
                    '(LOW only, ' + MB19_OFFSCREEN_PAD + 'px pad, 1/' + MB19_TICK_DIVISOR +
                    ' rate for off-screen, no-op on MED/HIGH).');
    };

    _pollId = setInterval(function () {
        _pollN++;
        _tryWrap();
        if (_pollN > 100) clearInterval(_pollId);
    }, 300);

    _tryWrap();
}


})();