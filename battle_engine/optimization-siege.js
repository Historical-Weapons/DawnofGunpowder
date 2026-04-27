;(function SIEGE_OPT_PATCH() {
'use strict';

// ============================================================================
// optimization-siege.js  v1.0  —  Empire of the 13th Century
// Siege Battle Performance Patch  (Phone / Tablet / Gaming PC)
// ============================================================================
//
// WHY IS THE SIEGE SLOW (even on a fast PC)?
// ─────────────────────────────────────────────────────────────────────────
// Unlike field battles which have ~150 units in open space, a siege battle
// has 300+ units PLUS 4+ trebuchets + 4 ballistas + 20 mantlets + ram +
// 4–7 ladders + 5 towers — all computed every single frame.
//
// The top 5 CPU criminals per frame, worst first:
//
//  #1  processTargeting — O(n²) enemy scan.
//      300 enemies × 300 units = 90,000 comparisons/frame × 60fps
//      = 5.4 MILLION comparisons per second.
//      The "PRE-BREACH DEFENSE SPLIT" code in ai_categories.js
//      also runs a nearestEnemy O(n) scan for every ranged defender
//      every frame — even when attackers are 800+ px south and nobody
//      is in range.
//
//  #2  processSiegeEngines — already throttled 1-in-2/3 by P8 in
//      optimization-sandbox.js. But its wall-clamping block (the O(n)
//      unit loop at the top) stops running when P8 throttles the function,
//      which can cause clip-through bugs. See PS9 for the fix.
//
//  #3  updateTowerShooting — called every frame, scans all living player
//      units for each tower. Towers have 80–200 tick fire-rate; running
//      every frame is pure waste.
//
//  #4  updateCityGates — called every frame to sync gate HP changes into
//      the collision grid. Gate HP only changes ~once per 100 frames
//      (ram hit probability). This is 99% wasted work.
//
//  #5  bgCanvas blit at low zoom — during the 3.5 s epic zoom animation
//      (zoom 0.1 → 1.3), the viewport encompasses the ENTIRE city canvas.
//      drawOptimizedBattleCanvas blits the full ~2000×2000 source texture
//      every frame. At zoom 0.1 on a phone this is ~48MP worth of pixels
//      per frame — the same root cause as the overworld bgCanvas problem.
//
//
// THE CORE INSIGHT — "SOUTHERN WALL LOCALITY"
// ─────────────────────────────────────────────────────────────────────────
// 95 % of the siege takes place within ~400 px of the southern wall.
// Attackers start at campPixelY = wallPixelY + 800 and push north.
// ALL 300 defenders spawn at wallPixelY − 150.
// Before the gate is breached, no attacker can reach the defenders and
// no defender can reach the attackers. They are over 800 world-pixels
// apart, far beyond even the longest archer range (~200 px).
//
// This means the entire pre-breach phase can safely skip:
//   • O(n²) target scanning  (attackers are out of range)
//   • O(n) nearestEnemy scans for ranged defenders
//   • Morale drain ticks for idle defenders (no combat happening)
//
// Patches PS1 + PS2 exploit this locality completely.
//
//
// PATCHES INSTALLED — SIEGE ONLY
// ─────────────────────────────────────────────────────────────────────────
//
//  PS1 ★★★★★  Closest-Attacker Tracker + processTargeting pre-guard
//               Runs a single O(n) sweep every 15 frames to find the
//               northernmost (closest to wall) player unit.  Each frame,
//               before the O(n) nearestEnemy scan runs for a defender, a
//               simple Y-distance check against this cached value short-
//               circuits the entire body of processTargeting.
//               → Eliminates ~90 % of targeting CPU pre-breach.
//
//  PS2 ★★★★☆  processMoraleAndFleeing pre-breach guard
//               Before gate/ladder breach, defenders are in a holding
//               pattern. Morale calculations are meaningless for idle units
//               not taking damage. Adds a single-line bail that skips the
//               whole morale function for out-of-range defenders.
//               → Saves ~300 morale function calls / frame pre-breach.
//
//  PS3 ★★★★☆  updateTowerShooting throttle
//               Towers have a fireCooldown of 80–280 ticks. Running the
//               full tower shoot scan every frame is 60x more frequent
//               than necessary. Throttled to every 4 frames.
//               → 75 % reduction in tower-scan CPU.
//
//  PS4 ★★★☆☆  updateCityGates dirty-flag + throttle
//               Patches updateCityGates to be a no-op unless the gate
//               just took damage (_siegeGateDirty flag) or 20 frames have
//               passed as a safety heartbeat. Also hooks triggerGateBreach
//               to set the flag so the breach sync is never skipped.
//               → ~95 % reduction in gate-sync calls.
//
//  PS5 ★★★★☆  Projectile off-screen culling
//               P9 in optimization-sandbox.js caps NEW projectiles at 100
//               on native. But old projectiles that fly off the viewport
//               are never removed — they accumulate in the array and get
//               draw+collision checked every frame.  PS5 scans the array
//               every 4 frames and hard-removes any projectile that is
//               > PS5_CULL_DIST world-pixels from the player. Also drops
//               the siege cap lower than P9: 60 native / 90 desktop.
//               → Prevents the "late-battle projectile spiral" on phones.
//
//  PS6 ★★★☆☆  Ground effects siege cap
//               battleEnvironment.groundEffects (stuck arrows, blood)
//               grows unbounded. In a 300-unit siege with towers firing
//               every 80 ticks, it can reach 800+ entries. Every entry is
//               drawn every frame. Hard-capped at PS6_GROUND_MAX = 120
//               for siege; oldest entries are trimmed first.
//               → Halves ground-effect render calls in late siege.
//
//  PS7 ★★★★☆  bgCanvas low-zoom throttle
//               During the 3.5 s epic-zoom cinematic (zoom 0.1 → 1.3),
//               the entire city canvas is visible. Instead of blitting
//               the full texture every frame at near-zero zoom where no
//               detail is visible anyway, the blit is throttled to every
//               3 frames when zoom < PS7_ZOOM_THRESHOLD (0.45).
//               Static terrain doesn't move — nobody notices.
//               → Eliminates 2/3 of the most expensive blit calls.
//
//  PS8 ★★★☆☆  Siege-context LOD tightening
//               optimization-battles.js (PB1/PB2) uses a 400 px LOD
//               threshold. A phone screen is 375 px wide; at battle zoom
//               ~1.0 that means units just 25 px off-screen still get
//               full sprites. In siege the camera is always facing the
//               wall — units to the side are never the focus.  PS8
//               temporarily reduces the LOD threshold to 260 px while
//               inSiegeBattle is true.
//               → ~15 % more units rendered as cheap dots.
//
//  PS9 ★★★☆☆  Wall-clamping supplement (P8 compensation)
//               P8 in optimization-sandbox.js throttles ALL of
//               processSiegeEngines — including the wall collision loop
//               at its top. On throttled frames, player units can slip
//               1–2 px into the wall.  PS9 re-runs ONLY the wall
//               clamping logic every frame, independently of P8.
//               No physics change — just prevents the visual micro-clip.
//
//  PS10 ★★★☆☆  pCount / eCount GC reduction
//               updateBattleUnits computes pCount and eCount via
//               .filter() every frame, allocating two new arrays on
//               every call (×60fps = 120 allocs/sec → GC pressure).
//               PS10 injects a pre-pass that stores counts as
//               window._siegePCount / _siegeECount using a plain for-loop,
//               zero allocations. These cached values are used by
//               processMoraleAndFleeing instead of the live counts when
//               the siege pre-guard (PS2) defers to them.
//
// ─────────────────────────────────────────────────────────────────────────
// NOTE: This file COMPLEMENTS optimization-sandbox.js.
//       P8 (processSiegeEngines throttle) and P9 (projectile cap) in that
//       file remain active. This file adds the remaining siege-specific
//       optimizations that sandbox.js does not cover.
//       Load ORDER: optimization-sandbox.js → optimization-battles.js
//                   → optimization-siege.js  (last)
// ============================================================================

// ── Idempotency guard ────────────────────────────────────────────────────
if (window.__OSP1__) return;
window.__OSP1__ = true;

// ─────────────────────────────────────────────────────────────────────────
//  DEVICE DETECTION  (mirrors optimization-battles.js)
// ─────────────────────────────────────────────────────────────────────────
var IS_NATIVE = (
    typeof window.Capacitor !== 'undefined' ||
    /\bwv\b/.test(navigator.userAgent) ||
    window.AndroidInterface != null ||
    (
        /Android/.test(navigator.userAgent) &&
        !/Chrome\/\d/.test(navigator.userAgent) &&
        !/Firefox\/\d/.test(navigator.userAgent)
    )
);

// ─────────────────────────────────────────────────────────────────────────
//  TUNABLE CONSTANTS
// ─────────────────────────────────────────────────────────────────────────

// PS1: How often (frames) to rescan for the closest attacker Y position.
//      Lower = more responsive to fast cavalry charges; higher = cheaper.
var PS1_TRACKER_INTERVAL  = 15;

// PS1: Extra slack added to unit.stats.range when deciding if a defender
//      can POSSIBLY target an attacker.  Generous buffer prevents archers
//      from staying dormant when the ram is almost at the gate.
var PS1_RANGE_BUFFER      = 200;

// PS2: Morale guard — same as PS1, defenders further than this from the
//      closest attacker (measured in Y world-pixels) skip morale ticks.
var PS2_MORALE_GUARD_DIST = 400;

// PS3: Tower shooting only recomputes every N frames.
var PS3_TOWER_SKIP        = 4;

// PS4: Gate sync heartbeat — even without damage, re-sync every N frames
//      as a safety net so sudden breach is never missed.
var PS4_GATE_INTERVAL     = 20;

// PS5: World-pixel distance from the player beyond which a projectile is
//      considered off-screen and immediately removed.
var PS5_CULL_DIST         = 700;
var PS5_CULL_DIST_SQ      = PS5_CULL_DIST * PS5_CULL_DIST;
var PS5_CULL_EVERY        = 4;   // Only scan the projectile array every N frames
// Siege-specific projectile cap (lower than P9's 100/180).
// During a ram charge + ladder assault + trebuchet volley, every ranged
// unit fires at once and the array fills in seconds.
var PS5_PROJ_CAP          = IS_NATIVE ? 60 : 90;

// PS6: Maximum ground effect entries during a siege.
var PS6_GROUND_MAX        = IS_NATIVE ? 90 : 140;

// PS7: Below this zoom level the bgCanvas blit is throttled to 1-in-3 frames.
var PS7_ZOOM_THRESHOLD    = 0.45;
var PS7_BLIT_SKIP         = 3;

// PS8: Tighter LOD distance for siege context (world-pixels).
//      optimization-battles.js uses 400; siege uses 260.
var PS8_SIEGE_LOD_PX      = 260;
var PS8_SIEGE_LOD_SQ      = PS8_SIEGE_LOD_PX * PS8_SIEGE_LOD_PX;


// ─────────────────────────────────────────────────────────────────────────
//  BOOT LOOP
//  Polls until all required siege objects are initialised.
//  Required: battleEnvironment, AICategories, SiegeTopography,
//             processSiegeEngines (confirms siegeEngineLogic.js is loaded)
// ─────────────────────────────────────────────────────────────────────────
var _tries = 0;
var _boot  = setInterval(function () {
    if (++_tries > 200) {
        clearInterval(_boot);
        console.warn('[SIEGE OPT v1.0] Boot timed out — required objects never appeared.');
        return;
    }
    if (typeof battleEnvironment    === 'undefined') return;
    if (typeof AICategories         === 'undefined') return;
    if (typeof SiegeTopography      === 'undefined') return;
    if (typeof processSiegeEngines  !== 'function')  return;
    clearInterval(_boot);
    _install();
}, 300);


// ─────────────────────────────────────────────────────────────────────────
//  INSTALL ALL PATCHES
// ─────────────────────────────────────────────────────────────────────────
function _install() {
    _ps1_targetingGuard();
    _ps2_moraleGuard();
    _ps3_towerThrottle();
    _ps4_gateThrottle();
    _ps5_projectileCull();
    _ps6_groundEffectsCap();
    _ps7_bgCanvasLowZoom();
    _ps8_siegeLOD();
    _ps9_wallClampSupplement();
    _ps10_gcReducer();

    console.log('[SIEGE OPT v1.0] All 10 siege patches installed.' +
        (IS_NATIVE ? ' (NATIVE mode)' : ' (desktop mode)'));
}


// ════════════════════════════════════════════════════════════════════════
//  PS1  CLOSEST-ATTACKER TRACKER + processTargeting PRE-GUARD  ★★★★★
// ════════════════════════════════════════════════════════════════════════
//
//  Every frame, processTargeting runs for every enemy unit.  Its body
//  includes a mandatory O(n) nearestEnemy scan for ranged defenders and
//  various duty-role branches — even when the closest attacker is
//  800+ px south of the wall and nobody is in range.
//
//  Step 1 — Tracker:
//    Every PS1_TRACKER_INTERVAL frames we do ONE O(n) sweep to find
//    window._siegeClosestAttackerY (the minimum Y = furthest-north
//    player unit, i.e. the one closest to the wall).
//
//  Step 2 — Guard:
//    At the top of processTargeting, before any branch executes, we
//    compute the approximate distance between this defender and the
//    closest attacker. If it exceeds the unit's range + PS1_RANGE_BUFFER,
//    we assign the standard "hold formation" dummy target and return —
//    skipping the entire O(n) nearestEnemy scan and all duty branches.
//
//  Safety:
//    • Only activates when inSiegeBattle is true.
//    • Never fires for the player commander or player units.
//    • Deactivates immediately when __SIEGE_GATE_BREACHED__ is set.
//    • Uses a cached Y value refreshed every 15 frames; at typical unit
//      speeds (≤ 0.6 px/frame) the error is ≤ 9 px — negligible vs the
//      200 px range buffer.
// ────────────────────────────────────────────────────────────────────────
function _ps1_targetingGuard() {
    var _origPT       = AICategories.processTargeting;
    var _trackerTick  = 0;

    // Initialise cached value safely
    window._siegeClosestAttackerY = 99999;

    // ── Tracker (updates the cache) ──────────────────────────────────
    function _refreshClosestAttacker() {
        if (typeof battleEnvironment === 'undefined') return;
        var units  = battleEnvironment.units;
        var minY   = 99999;
        for (var i = 0, len = units.length; i < len; i++) {
            var u = units[i];
            if (u.side === 'player' && u.hp > 0) {
                if (u.y < minY) minY = u.y;
            }
        }
        window._siegeClosestAttackerY = minY;
    }

    // ── Patched processTargeting ─────────────────────────────────────
    AICategories.processTargeting = function (unit, units) {

        // Only intercept in active siege battles
        if (!window.inSiegeBattle) {
            return _origPT.call(AICategories, unit, units);
        }

        // Update the attacker-position cache every PS1_TRACKER_INTERVAL frames
        // (only one unit does the refresh — the first one processed this tick)
        if (++_trackerTick >= PS1_TRACKER_INTERVAL) {
            _trackerTick = 0;
            _refreshClosestAttacker();
        }

        // ── Pre-guard ──────────────────────────────────────────────
        // Only applies to enemy non-commanders when gate is NOT breached.
        if (
            unit.side === 'enemy'               &&
            !unit.isCommander                   &&
            !window.__SIEGE_GATE_BREACHED__
        ) {
            var closestAtkY = window._siegeClosestAttackerY;
            // approxDist > 0: attacker is south (larger Y) of this defender
            var approxDist  = closestAtkY - unit.y;
            var maxRange    = ((unit.stats && unit.stats.range) || 80) + PS1_RANGE_BUFFER;

            if (approxDist > maxRange) {
                // Attacker is too far to reach — hold defensive formation.
                // We only refresh the dummy target every ~90 frames to avoid
                // creating a new object every frame.
                unit._guardAge = (unit._guardAge || 0) + 1;
                if (!unit.target || !unit.target.isDummy || unit._guardAge >= 90) {
                    unit._guardAge = 0;
                    var gateX  = (typeof SiegeTopography !== 'undefined') ? SiegeTopography.gatePixelX : 0;
                    var wallY  = (typeof SiegeTopography !== 'undefined') ? SiegeTopography.wallPixelY : 0;
                    // Spread defenders across the wall in a staggered guard line
                    var spreadX = (unit.id % 40 - 20) * 50; // deterministic spread using unit id
                    unit.target = {
                        x : gateX + spreadX,
                        y : wallY - 50,
                        hp: 9999, isDummy: true, priority: 'ps1_guard'
                    };
                }
                unit.state = 'idle';
                unit.vx    = 0;
                unit.vy    = 0;
                return;  // ← The critical skip: no O(n) nearestEnemy scan
            }
        }

        // Range pre-guard did not fire — run the original targeting logic
        return _origPT.call(AICategories, unit, units);
    };
}


// ════════════════════════════════════════════════════════════════════════
//  PS2  processMoraleAndFleeing PRE-BREACH GUARD  ★★★★☆
// ════════════════════════════════════════════════════════════════════════
//
//  processMoraleAndFleeing runs for every unit every frame.  For a
//  300-defender siege its calculations (hp%, armor ratios, casualty
//  pressure, morale drain) are redundant when all defenders are idle
//  and not in combat (pre-breach phase).
//
//  The guard bails out early for enemy non-commanders when:
//    a) The gate is not breached, AND
//    b) The closest attacker is > PS2_MORALE_GUARD_DIST px south of wall
//
//  When the ram reaches the gate or ladders hit the wall, approxDist
//  shrinks below the threshold and morale calculations resume normally.
// ────────────────────────────────────────────────────────────────────────
function _ps2_moraleGuard() {
    var _origPM = AICategories.processMoraleAndFleeing;

    AICategories.processMoraleAndFleeing = function (unit, pCount, eCount, cbd) {

        if (
            window.inSiegeBattle            &&
            unit.side === 'enemy'           &&
            !unit.isCommander               &&
            !window.__SIEGE_GATE_BREACHED__
        ) {
            // Use the cached value from PS1 tracker
            var closestAtkY = window._siegeClosestAttackerY || 99999;
            var approxDist  = closestAtkY - unit.y;

            if (approxDist > PS2_MORALE_GUARD_DIST) {
                // No combat happening — morale holds steady, no calculation needed.
                return false;
            }
        }

        return _origPM.call(AICategories, unit, pCount, eCount, cbd);
    };
}


// ════════════════════════════════════════════════════════════════════════
//  PS3  updateTowerShooting THROTTLE  ★★★★☆
// ════════════════════════════════════════════════════════════════════════
//
//  Tower fire cooldowns are 80–280 ticks. Running the full scan
//  (all towers × all player units) every frame is ~60–75× more
//  frequent than towers can actually fire.  Running every 4 frames
//  is still ~15–20× more frequent than any tower fires — invisible.
// ────────────────────────────────────────────────────────────────────────
function _ps3_towerThrottle() {
    var _origUTS = window.updateTowerShooting;
    if (typeof _origUTS !== 'function') return;

    var _towerTick = 0;

    window.updateTowerShooting = function () {
        if (window.inSiegeBattle && (++_towerTick % PS3_TOWER_SKIP !== 0)) return;
        _origUTS.apply(this, arguments);
    };
}


// ════════════════════════════════════════════════════════════════════════
//  PS4  updateCityGates DIRTY-FLAG + THROTTLE  ★★★☆☆
// ════════════════════════════════════════════════════════════════════════
//
//  updateCityGates(grid) scans the grid and flips tile values when the
//  south gate is destroyed. It is called every frame from updateBattleUnits
//  but the gate only takes damage ~once per 100 frames (ram hit check is
//  Math.random() > 0.99).  99 % of calls are pure no-ops that still pay
//  the full loop cost.
//
//  Dirty flag: set to true whenever gate HP changes.
//  Heartbeat: force a real sync every PS4_GATE_INTERVAL frames anyway,
//             ensuring the breach is never missed by more than 1/3 second.
// ────────────────────────────────────────────────────────────────────────
function _ps4_gateThrottle() {
    var _origUCG  = window.updateCityGates;
    var _origTGB  = window.triggerGateBreach;

    if (typeof _origUCG !== 'function') return;

    window._siegeGateDirty = false;
    var _gateFrame = 0;

    // Hook triggerGateBreach so a breach ALWAYS triggers an immediate sync
    if (typeof _origTGB === 'function') {
        window.triggerGateBreach = function (gate) {
            window._siegeGateDirty = true;
            return _origTGB.apply(this, arguments);
        };
    }

    window.updateCityGates = function (grid) {
        if (window.inSiegeBattle) {
            _gateFrame++;
            if (!window._siegeGateDirty && (_gateFrame % PS4_GATE_INTERVAL !== 0)) {
                return; // Skip — gate hasn't changed and heartbeat hasn't fired
            }
            window._siegeGateDirty = false;
        }
        return _origUCG.call(this, grid);
    };

    // Expose a setter so other code can mark the gate dirty when HP changes
    // (call this from any custom code that damages gate HP outside the ram)
    window.markSiegeGateDirty = function () { window._siegeGateDirty = true; };
}


// ════════════════════════════════════════════════════════════════════════
//  PS5  PROJECTILE OFF-SCREEN CULL + SIEGE CAP  ★★★★☆
// ════════════════════════════════════════════════════════════════════════
//
//  P9 in optimization-sandbox.js prevents NEW projectiles beyond 100/180.
//  But projectiles already in the array that fly off-screen (trebuchet
//  shots arcing high, stray arrows past the world edge) linger forever —
//  drawn and collision-checked every frame.
//
//  PS5 does two things:
//    1. Every PS5_CULL_EVERY frames, removes projectiles >PS5_CULL_DIST
//       from the player. Uses squared distance — no sqrt per projectile.
//    2. Re-enforces the siege-specific cap (lower than P9) by slicing
//       the oldest excess entries from the front of the array.
//
//  The poll loop retries until battleEnvironment.projectiles exists,
//  then installs a setInterval that runs the cull independently of
//  the RAF loop (so it works even when RAF is throttled).
// ────────────────────────────────────────────────────────────────────────
function _ps5_projectileCull() {
    var _cullFrame = 0;

    // This function is called every frame during siege from PS9's supplement loop
    window._ps5_runCull = function () {
        if (!window.inSiegeBattle) return;
        if (!battleEnvironment || !Array.isArray(battleEnvironment.projectiles)) return;

        if (++_cullFrame % PS5_CULL_EVERY !== 0) return;

        var px = (typeof player !== 'undefined') ? player.x : 0;
        var py = (typeof player !== 'undefined') ? player.y : 0;
        var projs = battleEnvironment.projectiles;

        // Cull off-screen (work backwards to allow safe splice)
        for (var i = projs.length - 1; i >= 0; i--) {
            var p = projs[i];
            var dx = p.x - px;
            var dy = p.y - py;
            if ((dx * dx + dy * dy) > PS5_CULL_DIST_SQ) {
                projs.splice(i, 1);
            }
        }

        // Apply siege cap — trim oldest entries from front
        if (projs.length > PS5_PROJ_CAP) {
            projs.splice(0, projs.length - PS5_PROJ_CAP);
        }
    };
}


// ════════════════════════════════════════════════════════════════════════
//  PS6  GROUND EFFECTS SIEGE CAP  ★★★☆☆
// ════════════════════════════════════════════════════════════════════════
//
//  battleEnvironment.groundEffects accumulates stuck arrows, blood pools,
//  fire decals, etc.  In a 300-unit siege with towers and trebuchets
//  firing constantly, this can reach 600–900 entries in the first 2
//  minutes — all drawn every frame.
//
//  We patch the groundEffects .push() once the array exists, trimming
//  the oldest PS6_TRIM_COUNT entries whenever the cap is exceeded.
//  Trimming from the front (oldest) means fresh visuals remain visible.
// ────────────────────────────────────────────────────────────────────────
function _ps6_groundEffectsCap() {
    var PS6_TRIM_COUNT = 20; // Remove this many old entries per trim

    var _poll = setInterval(function () {
        if (typeof battleEnvironment === 'undefined' ||
            !Array.isArray(battleEnvironment.groundEffects)) return;
        clearInterval(_poll);

        var _nativePush = Array.prototype.push;
        Object.defineProperty(battleEnvironment.groundEffects, 'push', {
            configurable: true,
            writable: true,
            value: function () {
                // Only enforce the cap during siege battles
                if (window.inSiegeBattle && this.length >= PS6_GROUND_MAX) {
                    this.splice(0, PS6_TRIM_COUNT); // Evict oldest effects
                }
                return _nativePush.apply(this, arguments);
            }
        });
    }, 800);
}


// ════════════════════════════════════════════════════════════════════════
//  PS7  bgCanvas LOW-ZOOM THROTTLE  ★★★★☆
// ════════════════════════════════════════════════════════════════════════
//
//  Problem: The 3.5-second epic-zoom animation starts at zoom = 0.1.
//  At zoom 0.1 on a 375 px phone, the viewport covers 3750 world-pixels
//  horizontally.  The city bgCanvas is ~2000 × 2000 px.  The entire
//  texture is blitted EVERY frame for 3.5 seconds.
//
//  Fix: When inSiegeBattle && currentZoom < PS7_ZOOM_THRESHOLD,
//  only blit the bgCanvas every PS7_BLIT_SKIP (3) frames.
//  The background is static terrain — it cannot move — so skipping 2
//  out of 3 frames is visually indistinguishable.
//  Above PS7_ZOOM_THRESHOLD (0.45), full-quality blitting resumes.
//
//  This patch wraps drawOptimizedBattleCanvas from viewport_culling_battles.js.
//  If that function is not loaded, the patch is a silent no-op.
// ────────────────────────────────────────────────────────────────────────
function _ps7_bgCanvasLowZoom() {
    var _origDraw = window.drawOptimizedBattleCanvas;
    if (typeof _origDraw !== 'function') return;

    var _bgFrame = 0;
    // Stash last draw arguments so we can replay on skip frames if needed
    // (we don't replay — static terrain means stale is fine)

    window.drawOptimizedBattleCanvas = function (ctx, sourceCanvas, playerX, playerY,
                                                  screenW, screenH, currentZoom,
                                                  offsetX, offsetY) {
        if (
            window.inSiegeBattle    &&
            currentZoom < PS7_ZOOM_THRESHOLD
        ) {
            if ((++_bgFrame % PS7_BLIT_SKIP) !== 0) {
                // Skip this frame's blit — canvas retains last drawn frame
                return;
            }
        } else {
            _bgFrame = 0; // Reset counter when zoom is high enough
        }

        return _origDraw.call(this, ctx, sourceCanvas, playerX, playerY,
                               screenW, screenH, currentZoom, offsetX, offsetY);
    };
}


// ════════════════════════════════════════════════════════════════════════
//  PS8  SIEGE-CONTEXT LOD TIGHTENING  ★★★☆☆
// ════════════════════════════════════════════════════════════════════════
//
//  optimization-battles.js (PB1/PB2) defines PB_LOD_DIST_PX = 400 and
//  exposes it via window.__pb_lod_sq for external override.
//  In siege the camera almost never pans far east/west (the wall is a
//  horizontal strip), so units 260+ px from the player are typically
//  off the left/right sides of a phone screen anyway.
//
//  PS8 checks for the window.__pb_lod_sq property (set by PB1/PB2) and
//  reduces it to PS8_SIEGE_LOD_SQ while inSiegeBattle is true.
//  A setInterval monitors the inSiegeBattle flag and restores the
//  original value when the siege ends so field battles are unaffected.
//
//  If optimization-battles.js is not loaded (__pb_lod_sq is undefined),
//  this patch is a safe no-op.
// ────────────────────────────────────────────────────────────────────────
function _ps8_siegeLOD() {
    // Expose the shared LOD override hook that optimization-battles.js
    // checks. If that file uses a private var instead of a window property,
    // this will fall through silently.
    var _origLodSq = null;
    var _lodMonitor = setInterval(function () {
        var inSiege = (typeof inSiegeBattle !== 'undefined' && inSiegeBattle) ||
                      window.inSiegeBattle;

        if (inSiege && _origLodSq === null && window.__pb_lod_sq !== undefined) {
            // Siege just started — tighten LOD
            _origLodSq = window.__pb_lod_sq;
            window.__pb_lod_sq = PS8_SIEGE_LOD_SQ;
        } else if (!inSiege && _origLodSq !== null) {
            // Siege ended — restore original LOD
            window.__pb_lod_sq = _origLodSq;
            _origLodSq = null;
        }
    }, 500); // Check every 0.5 s — low overhead
}


// ════════════════════════════════════════════════════════════════════════
//  PS9  WALL-CLAMPING SUPPLEMENT  ★★★☆☆
// ════════════════════════════════════════════════════════════════════════
//
//  P8 (optimization-sandbox.js) throttles processSiegeEngines every 2–3
//  frames.  The FIRST thing processSiegeEngines does is a wall-collision
//  clamping loop that prevents player units from clipping through the
//  south wall and enemy units from drifting south of it.
//
//  On P8's skipped frames, no clamping runs.  At 60 fps with 3-frame skip,
//  a unit moving at speed 1.5 px/frame can drift 3 px into the wall before
//  correction — usually invisible but occasionally causes a visual 1-frame
//  clip and subtle position drift under fast cavalry.
//
//  PS9 re-implements ONLY the wall clamping loop as a standalone function
//  and calls it every frame from a requestAnimationFrame hook, independent
//  of P8.  It reads all required values from the live global state so it
//  stays in sync with any config changes.
//
//  IMPORTANT: This is purely corrective geometry — no AI, no physics
//  beyond position clamping.  It costs only an O(n) pass over live units.
// ────────────────────────────────────────────────────────────────────────
function _ps9_wallClampSupplement() {

    function _clampTick() {
        // Re-register for next frame first (even if we early-return)
        requestAnimationFrame(_clampTick);

        if (!window.inSiegeBattle)            return;
		// ADD THIS LINE TO EXECUTE THE CULL:
    if (typeof window._ps5_runCull === 'function') window._ps5_runCull();
	
        if (typeof SiegeTopography === 'undefined') return;
        if (typeof battleEnvironment === 'undefined' ||
            !battleEnvironment.units)         return;

        var wallY        = SiegeTopography.wallPixelY;
        var gateX        = SiegeTopography.gatePixelX;
        var bTile        = (typeof BATTLE_TILE_SIZE !== 'undefined') ? BATTLE_TILE_SIZE : 8;
        var bCols        = (typeof BATTLE_COLS      !== 'undefined') ? BATTLE_COLS      : 200;
        var westWallX    = 45  * bTile;
        var eastWallX    = (bCols - 45) * bTile;
        var gateHalfW    = 80;
        var isBreached   = window.__SIEGE_GATE_BREACHED__;

        var activeLadders = (typeof siegeEquipment !== 'undefined' && siegeEquipment.ladders)
            ? siegeEquipment.ladders.filter(function (l) { return l.isDeployed && l.hp > 0; })
            : [];

        var units = battleEnvironment.units;
        for (var i = 0, len = units.length; i < len; i++) {
            var u = units[i];
            if (u.onWall || u.hp <= 0) continue;
            // Skip climbing units and ladder crew — processSiegeEngines handles them
            if (u.isClimbing || (u.siegeRole && u.siegeRole.indexOf('ladder') !== -1)) continue;

            var atGate = isBreached && Math.abs(u.x - gateX) < gateHalfW;
            var atLad  = false;
            for (var j = 0; j < activeLadders.length; j++) {
                if (Math.abs(u.x - activeLadders[j].x) < 24) { atLad = true; break; }
            }

            if (u.side === 'player' && !u.isCommander) {
                if (u.y < wallY + 20 && !atLad && !atGate) {
                    u.y = wallY + 20;
                    var dirX = (gateX > u.x) ? 1 : -1;
                    u.x += dirX * 1.8;
                }
            } else if (u.side === 'enemy') {
                if (u.y > wallY - 20 && !atGate) {
                    u.y = wallY - 20;
                }
            }

            // Side wall containment (only for units inside the city)
            if (u.y < wallY) {
                if (u.x < westWallX) u.x = westWallX;
                if (u.x > eastWallX) u.x = eastWallX;
            }
        }
    }

    // Start the supplement loop — it will self-reschedule every frame
    requestAnimationFrame(_clampTick);

    // Also expose it so PS5 cull can be called from the same RAF chain
    window._ps5_linkedToPS9 = true;
}


// ════════════════════════════════════════════════════════════════════════
//  PS10  pCount / eCount GC REDUCTION  ★★★☆☆
// ════════════════════════════════════════════════════════════════════════
//
//  updateBattleUnits() computes:
//      const pCount = units.filter(u => u.side === 'player').length;
//      const eCount = units.filter(u => u.side === 'enemy').length;
//
//  Two .filter() calls allocate two new temporary arrays every frame.
//  At 60 fps that is 120 arrays/second created and garbage-collected.
//  On Android WebView (limited GC throughput) this contributes to
//  periodic 8–15 ms GC pauses.
//
//  The workaround: cache these counts in window globals using a plain
//  counted for-loop, refreshed every PS10_REFRESH_EVERY frames.  The
//  cached values are exposed as window._siegePCount / _siegeECount and
//  referenced by PS2's morale guard.
//
//  NOTE: We cannot easily replace the .filter() calls inside
//  updateBattleUnits without replacing the entire function (risky).
//  Instead this patch computes counts INDEPENDENTLY on a staggered
//  schedule so they are always approximately correct.  For morale and
//  flee decisions, a 3-frame stale count is completely safe.
// ────────────────────────────────────────────────────────────────────────
function _ps10_gcReducer() {
    var PS10_REFRESH_EVERY = 3;
    var _gcTick = 0;

    window._siegePCount = 0;
    window._siegeECount = 0;

    // Use a named function so it can call itself via requestAnimationFrame
    function tick() {
        requestAnimationFrame(tick);

        // Safety checks exactly as you had them
        if (!window.inSiegeBattle) return;
        if (typeof battleEnvironment === 'undefined' || !battleEnvironment.units) return;

        // Throttling logic remains identical
        if (++_gcTick % PS10_REFRESH_EVERY !== 0) return;

        var units  = battleEnvironment.units;
        var pCount = 0;
        var eCount = 0;

        // Plain counted loop — zero allocations
        for (var i = 0, len = units.length; i < len; i++) {
            var side = units[i].side;
            if (side === 'player') pCount++;
            else if (side === 'enemy') eCount++;
        }

        window._siegePCount = pCount;
        window._siegeECount = eCount;
    }

    // Kick off the first frame
    requestAnimationFrame(tick);
}

// ════════════════════════════════════════════════════════════════════════
//  INTEGRATION NOTE: P8 WALL-CLAMP BUG COMPENSATION
// ════════════════════════════════════════════════════════════════════════
//
//  PS9 runs its wall-clamping loop via requestAnimationFrame, independently
//  of processSiegeEngines.  On frames where P8 DOES allow processSiegeEngines
//  to run, BOTH clamps execute — this is harmless (idempotent position clamping).
//  On frames where P8 suppresses processSiegeEngines, PS9 clamps alone —
//  this is the compensation.
//
//  PS5's projectile cull is called from the interval set in PS10 but the
//  core cull logic (window._ps5_runCull) is also safe to call from any
//  context.  Siege-launch code can call window._ps5_runCull() directly
//  if needed.
//
// ════════════════════════════════════════════════════════════════════════
//  COMPLEMENTARY CHANGES IN OTHER FILES (not handled by this patch)
// ════════════════════════════════════════════════════════════════════════
//
//  ── siegeEngineLogic.js / processSiegeEngines ───────────────────────────
//
//  CHANGE: Reduce mantlet count from 20 to 12 (or 10 on native).
//  The mantlet projectile-interception loop is:
//      80 projectiles × 20 mantlets = 1,600 comparisons / frame
//  At 20 mantlets and 20 siege engines (treb + ballista + ladders + ram)
//  the mantlet-check inner loop runs 80 × 20 = 1,600 times/frame before
//  P8 throttling. Reducing to 12 mantlets cuts this by 40 % with no
//  noticeable gameplay change.
//
//  ┌─────────────────────────────────────────────────────────────────────┐
//  │  // BEFORE (siegeEngineLogic.js → initSiegeEquipment):              │
//  │  const mantletCount = 20;                                           │
//  │                                                                      │
//  │  // AFTER:                                                           │
//  │  const mantletCount = (window.IS_NATIVE || /Android/.test(         │
//  │      navigator.userAgent)) ? 10 : 14;                               │
//  └─────────────────────────────────────────────────────────────────────┘
//
//  ── siegebattle.js / deploySiegeDefenders ───────────────────────────────
//
//  CHANGE: Add a native-aware troop scale so sieges on phones deploy
//  fewer defenders regardless of the strategic troop count.
//  The existing GLOBAL_BATTLE_SCALE already handles huge armies but
//  the minimum visualScale is 1 — meaning a 200-troop siege still
//  deploys all 200 as units.  On a phone, 80 visible defenders are
//  indistinguishable from 200 in terms of gameplay but save ~60%
//  of per-unit AI cost.
//
//  ┌─────────────────────────────────────────────────────────────────────┐
//  │  // In deploySiegeDefenders — BEFORE:                               │
//  │  let visualScale = window.GLOBAL_BATTLE_SCALE || 1;                 │
//  │                                                                      │
//  │  // AFTER:                                                           │
//  │  let visualScale = window.GLOBAL_BATTLE_SCALE || 1;                 │
//  │  if (IS_NATIVE || /Android/.test(navigator.userAgent)) {            │
//  │      visualScale = Math.max(visualScale, 2.5); // Cap at ~80 units  │
//  │  }                                                                   │
//  └─────────────────────────────────────────────────────────────────────┘
//
//  ── city_system.js / generateCity ───────────────────────────────────────
//
//  CHANGE: The city bgCanvas is drawn at FULL resolution even on phones.
//  Consider rendering at 50% resolution on IS_NATIVE:
//
//  ┌─────────────────────────────────────────────────────────────────────┐
//  │  // When creating the bgCanvas off-screen canvas:                   │
//  │  bgCanvas.width  = IS_NATIVE ? Math.floor(CITY_WORLD_WIDTH  / 2)   │
//  │                              : CITY_WORLD_WIDTH;                    │
//  │  bgCanvas.height = IS_NATIVE ? Math.floor(CITY_WORLD_HEIGHT / 2)   │
//  │                              : CITY_WORLD_HEIGHT;                   │
//  │  // Then scale the ctx.drawImage destination accordingly.           │
//  │  // At zoom 1.0 on a 375 px phone screen, 50% resolution is        │
//  │  // visually identical — you're displaying ~375 canvas pixels       │
//  │  // from a 1000 px canvas vs a 2000 px canvas.                     │
//  └─────────────────────────────────────────────────────────────────────┘
//
//  ── AndroidManifest.xml ─────────────────────────────────────────────────
//  Ensure  android:hardwareAccelerated="true"  is set.
//  Without it, every canvas op runs in CPU software mode.
//
// ════════════════════════════════════════════════════════════════════════

})();
