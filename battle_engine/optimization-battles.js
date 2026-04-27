;(function OPTIMIZATION_BATTLES() {
'use strict';

// ============================================================================
// optimization_battles.js  v1.1  —  Empire of the 13th Century
// Land Battle + Naval Battle Canvas Performance Patch  (Android / Capacitor)
// ============================================================================
//
// ROOT CAUSE OF BATTLE LAG ON ANDROID WEBVIEW
// ─────────────────────────────────────────────
// Android WebView's canvas runs via the CPU software renderer (Skia software
// path), NOT the GPU-accelerated Chrome compositor.  Every call to
// drawInfantryUnit or drawCavalryUnit issues 100–350 individual canvas state
// mutations:
//   ctx.save / ctx.restore / ctx.translate / ctx.rotate /
//   ctx.beginPath / ctx.moveTo / ctx.lineTo / ctx.arc /
//   ctx.fill / ctx.stroke / ctx.fillStyle = "..." × dozens per unit.
// With 200 visible units at 60 fps that is ~4,000,000–7,000,000 canvas state
// changes per second, all executed on a single CPU core.
//
// THE FIX — distance-based Level of Detail (LOD)
// ──────────────────────────────────────────────
// Any unit beyond PB_LOD_DIST_PX world-pixels from the player is replaced by
// a single ctx.arc call (~5 canvas ops vs 200+).  At typical battle zoom the
// LOD threshold aligns with the screen edge or just beyond it, so the visual
// quality loss is negligible — distant units appear as faction-coloured dots,
// which is identical to how they would look at that zoom level anyway.
//
// ┌───────────────────────────────────────────────────────────────────────┐
// │  CAPACITOR / P6 NOTE                                                  │
// │  P6 (30 fps RAF cap) in optimization.js has been INTENTIONALLY        │
// │  DISABLED because it caused crashes in the Capacitor WebView wrapper. │
// │  This file does NOT re-enable it.  All patches here are designed to   │
// │  be effective even at 60 fps with no frame cap.                       │
// └───────────────────────────────────────────────────────────────────────┘
//
// PATCHES INSTALLED
// ──────────────────
//  LAND + NAVAL BATTLES
//  PB1 ★★★★★  Infantry unit LOD   (dot @ > 400 world-px from player)
//  PB2 ★★★★★  Cavalry unit LOD    (sized dot by mount type)
//  PB7 ★★★☆☆  Blood pool LOD      (skip drawBloodPool for far corpses)
//  PB8 ★★★☆☆  stuckProjectile LOD (stash/restore — no prototype patching)
//  PB9 ★★★☆☆  Supply line wagons  (5 wagons → 2 on native, per frame)
//
//  NAVAL ONLY
//  PB3 ★★★★☆  Naval map 4800×3200 → 3200×2400  (~50 % grid RAM)
//  PB4 ★★★☆☆  Wave render throttle  (skip-2 on native)
//  PB5 ★★★☆☆  Naval fish throttle   (skip-3 on native)
//  PB6 ★★☆☆☆  Seagull throttle      (skip-3 on native)
//
// HOW LOD MATH WORKS
// ──────────────────
// Squared Euclidean distance (dx²+dy²) is compared against
// PB_LOD_DIST_SQ = 400² = 160,000.  No sqrt needed per unit.
// Player's own commander is always exempt (distance ≈ 0).
// Dead units at LOD distance: drawn as nothing — no dot, no blood pool,
// no stuck projectiles.  They cannot be seen at that range.
//
// ============================================================================

// ── Idempotency guard ────────────────────────────────────────────────────
if (window.__OB1__) return;
window.__OB1__ = true;

// ─────────────────────────────────────────────────────────────────────────
// CAPACITOR / ANDROID WEBVIEW DETECTION  (mirrors optimization.js)
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
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────

// PB1 / PB2 — LOD distance threshold in world-pixels.
//
// At battle zoom 1.0 on a 411 px Pixel 2 screen:
//   visible half-width  ≈ 205 world-px  (center to edge)
//   visible half-height ≈ 446 world-px
//   isOnScreen() extends render range by VIEW_PADDING=200 beyond visible area.
//
// A unit at 400 world-px from the player at zoom 1.0:
//   horizontal → 400 screen-px from centre: 195 px off-screen right/left
//   vertical   → 400 screen-px from centre: still within tall mobile viewport
//
// At zoom 0.8 (initial epic-zoom start):
//   visible half-height ≈ 557 world-px
//   Units at 400–557 px are visible but tiny (< 6 screen-px tall).
//   Dot rendering here is visually identical to full sprites at that size.
//
// Conclusion: 800 world-px is a safe, conservative threshold.
var PB_LOD_DIST_PX = 800;
var PB_LOD_DIST_SQ = PB_LOD_DIST_PX * PB_LOD_DIST_PX;  // 160,000 — no sqrt needed

// PB3 — Reduced naval map dimensions.
//
//  ORIGINAL : 4800 × 3200  =  15.36 MP canvas,  600×400 = 240,000 grid cells
//  REDUCED  : 3200 × 2400  =   7.68 MP canvas,  400×300 = 120,000 grid cells
//
// SHIP GEOMETRY VERIFICATION (worst case — HEAVY Dragon, both sides):
//   Ship size : width=1800, height=660
//   centerX = 3200/2 = 1600 ;  centerY = 2400/2 = 1200
//   pShip.y = 1200 + 330 + 125(gap) = 1655  ✓  < 2400
//   eShip.y = 1200 - 330 - 125(gap) =  745  ✓  > 0
//   Space below player ship bottom: 2400-(1655+330) = 415 px  ✓
//   Space above enemy ship top:      745-330         = 415 px  ✓
//   Inter-ship gap: 1325-1075 = 250 px  ✓  boarding distance intact
//
// All spawn logic (deployNavalArmy, _customNavalDeckSpawn, slotForIndex,
// findValidShipDeckPosition, lastResort2) uses ship.x/.y/.width/.height
// directly — not the world dimensions.  Safe to reduce.
var PB_NAVAL_W = 3200;
var PB_NAVAL_H = 2400;

// ─────────────────────────────────────────────────────────────────────────
// SHARED HELPERS  (defined before _install so patches can reference them)
// ─────────────────────────────────────────────────────────────────────────

// A permanently-empty, immutable array used as a safe substitute for
// fish / seagull arrays during throttled frames.
var _EMPTY_ARRAY = Object.freeze([]);

// A mutable empty array used as the temporary replacement for
// unit.stuckProjectiles in PB8 (the const version cannot be used as a
// drop-in replacement where the engine might iterate it with .length checks).
var _EMPTY_MUT = [];

/**
 * _shouldLOD(x, y, unit) → boolean
 *
 * Returns true if the unit at world position (x, y) is far enough from the
 * player to receive simplified (dot) rendering instead of the full sprite.
 *
 * Rules
 *   1. player not defined → never LOD  (safe fallback to full render)
 *   2. unit is the player's commander  → never LOD
 *   3. unit is at player's exact position (±2 px float noise) → never LOD
 *   4. dx²+dy² > PB_LOD_DIST_SQ → LOD
 *   5. Otherwise → full render
 *
 * Uses squared distance to avoid a sqrt per unit per frame.
 * Called up to ~200 times per frame — must be fast.
 */
function _shouldLOD(x, y, unit) {
    if (typeof player === 'undefined' || player === null) return false;

    // Player's own commander always gets the full sprite
    if (unit && unit.isCommander && unit.side === 'player') return false;

    // Position-based identity check (handles ±2 px float rounding)
    if (Math.abs(x - player.x) < 2 && Math.abs(y - player.y) < 2) return false;

    var dx = x - player.x;
    var dy = y - player.y;
    return (dx * dx + dy * dy) > PB_LOD_DIST_SQ;
}

/**
 * _dot(ctx, x, y, color, unit, overrideRadius)
 *
 * Draws a single filled circle at world position (x, y) to represent a unit
 * at LOD distance.  The ctx already has the battle world transform applied
 * (translate + scale) so drawing at (x, y) places the dot correctly.
 *
 * Radius guide
 *   Infantry standard    → 3 px
 *   Cavalry / camel      → 5 px  (overrideRadius=5)
 *   Elephant             → 8 px  (overrideRadius=8)
 *
 * Alpha is reduced for routing units so their broken morale is still
 * visually communicated even at distance.
 */
function _dot(ctx, x, y, color, unit, overrideRadius) {
    var radius = (overrideRadius !== undefined) ? overrideRadius : 3;

    // Routing / broken-morale units get a semi-transparent dot
    var alpha = 1.0;
    if (unit) {
        if (unit.stats && unit.stats.morale <= 0) alpha = 0.55;
        if (unit.state === 'FLEEING' || unit.state === 'routing') alpha = 0.45;
    }

    ctx.save();
    if (alpha < 1.0) ctx.globalAlpha = alpha;
    ctx.fillStyle = color || '#888888';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 6.2832);
    ctx.fill();
    ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────
// BOOT LOOP
// Wait until drawInfantryUnit and drawCavalryUnit are defined.
// These live in infscript.js / cavscript.js which may load after this file.
// Extended to 200 tries (~60 seconds) for slow devices.
// ─────────────────────────────────────────────────────────────────────────
var _bootTries = 0;
var _boot = setInterval(function () {
    _bootTries++;
    if (_bootTries > 200) {
        clearInterval(_boot);
        console.warn('[OPT-BATTLES v1.1] Boot timed out — draw functions never became available.');
        return;
    }
    if (typeof drawInfantryUnit === 'undefined') return;
    if (typeof drawCavalryUnit  === 'undefined') return;
    clearInterval(_boot);
    _install();
}, 300);


// ─────────────────────────────────────────────────────────────────────────
// INSTALL ALL PATCHES
// ─────────────────────────────────────────────────────────────────────────
function _install() {
    _pb1_infantryLOD();
    _pb2_cavalryLOD();
    _pb3_navalMapReduction();
    _pb4_waveThrottle();
    _pb5_fishThrottle();
    _pb6_seagullThrottle();
    _pb7_bloodPoolLOD();
    _pb8_stuckProjectileLOD();
    _pb9_supplyLineReduction();

    console.log(
        '%c[OPT-BATTLES v1.1] Installed successfully\n' +
        '  Native/Capacitor : ' + IS_NATIVE + '\n' +
        '  PB1 Infantry LOD  (' + PB_LOD_DIST_PX + ' px threshold, dot replace)\n' +
        '  PB2 Cavalry LOD   (' + PB_LOD_DIST_PX + ' px threshold, sized dot)\n' +
        '  PB3 Naval map 4800×3200 → ' + PB_NAVAL_W + '×' + PB_NAVAL_H + '\n' +
        '  PB4 Wave throttle  (skip-' + (IS_NATIVE ? 2 : 1) + ')\n' +
        '  PB5 Fish throttle  (skip-' + (IS_NATIVE ? 3 : 1) + ')\n' +
        '  PB6 Seagull throttle (skip-' + (IS_NATIVE ? 3 : 1) + ')\n' +
        '  PB7 Blood pool LOD (skip far corpses)\n' +
        '  PB8 stuckProjectile LOD (stash-restore, no prototype patching)\n' +
        '  PB9 Supply wagons  (' + (IS_NATIVE ? 2 : 5) + ' wagons per side on native)',
        'color:#ff9800;font-weight:bold;font-size:11px'
    );
}


// ════════════════════════════════════════════════════════════════════════
// PB1  INFANTRY UNIT LOD  ★★★★★  THE PRIMARY BATTLE PERF WIN
// ════════════════════════════════════════════════════════════════════════
//
// BEFORE: drawInfantryUnit() fires for every visible unit, every frame.
//   100–250 canvas state changes per call (legs, body, armour layers,
//   pauldrons, headgear, weapon shaft + head, hands, fletchings …).
//   At 200 units × 60 fps = 12,000,000 canvas ops/sec on CPU software path.
//
// AFTER: units beyond PB_LOD_DIST_PX world-pixels from the player render
//   as a single ctx.arc call — 5 canvas ops instead of 200+.
//   Dead units at that range: render NOTHING (0 ops).
//   Player's commander: always exempt (distance ≈ 0).
//
// SAFE CALL SITES
//   drawInfantryUnit is also called from:
//   (a) Custom battle menu unit-card preview — inBattleMode=false → passthrough
//   (b) drawCityCosmeticNPCs — inBattleMode=false → passthrough
//   Neither is affected by this patch.
//
// CTX STATE SAFETY
//   drawInfantryUnit() wraps itself in ctx.save / ctx.restore.
//   When we draw a dot instead, _dot() manages its own save/restore.
//   For dead units at distance (immediate return), the outer save/restore
//   in drawBattleUnits remains intact — we do not interfere with it.
// ────────────────────────────────────────────────────────────────────────
function _pb1_infantryLOD() {
    var _orig = window.drawInfantryUnit;
    if (typeof _orig !== 'function') return;

    // Signature (from infscript.js):
    //   ctx, x, y, moving, frame, factionColor, type, isAttacking,
    //   side, unitName, isFleeing, cooldown, unitAmmo, unit, reloadProgress
    window.drawInfantryUnit = function (ctx, x, y, moving, frame, factionColor,
                                        type, isAttacking, side, unitName,
                                        isFleeing, cooldown, unitAmmo, unit,
                                        reloadProgress) {
        // Guard 1: not in battle — always full quality (menu previews, city NPCs)
        if (typeof inBattleMode === 'undefined' || !inBattleMode) {
            return _orig.apply(this, arguments);
        }

        // Guard 2: within LOD distance — full quality
        if (!_shouldLOD(x, y, unit)) {
            return _orig.apply(this, arguments);
        }

        // ── At LOD distance ──────────────────────────────────────────────

        // Dead units beyond LOD range: draw nothing.
        // Blood pool is handled separately in PB7.
        if (unit && unit.hp <= 0) return;

        // Living unit beyond LOD range: draw a faction-coloured dot.
        // Infantry is always on foot so radius stays at the default 3 px.
        _dot(ctx, x, y, factionColor, unit);
    };
}


// ════════════════════════════════════════════════════════════════════════
// PB2  CAVALRY UNIT LOD  ★★★★★
// ════════════════════════════════════════════════════════════════════════
//
// drawCavalryUnit is significantly more expensive than drawInfantryUnit:
//   Full horse anatomy: quadratic curves per body part, 3 separate leg draw
//   passes (far-side + body + near-side), tail, ears, mane, saddle,
//   chamfron for commander, rider body + armour + headgear + weapon.
//   War Elephants require ~600 individual canvas ops per call.
//   Camels: double-hump path2D + 4 articulated legs × 2 sides ≈ 400+ ops.
//
// LOD dot radius by mount type
//   infantry              → 3 px  (handled in PB1)
//   cavalry / horse_archer→ 5 px
//   camel                 → 5 px
//   elephant              → 8 px  (largest unit in the game)
//
// Player commander exemption
//   The player's mounted general is drawn at (player.x, player.y) so its
//   distance from the player is 0 → always full sprite via _shouldLOD().
// ────────────────────────────────────────────────────────────────────────
function _pb2_cavalryLOD() {
    var _orig = window.drawCavalryUnit;
    if (typeof _orig !== 'function') return;

    // Signature (inferred from troop_draw.js dispatch):
    //   ctx, x, y, moving, frame, factionColor, isAttacking, type,
    //   side, unitName, isFleeing, cooldown, unitAmmo, unit, reloadProgress
    window.drawCavalryUnit = function (ctx, x, y, moving, frame, factionColor,
                                       isAttacking, type, side, unitName,
                                       isFleeing, cooldown, unitAmmo, unit,
                                       reloadProgress) {
        if (typeof inBattleMode === 'undefined' || !inBattleMode) {
            return _orig.apply(this, arguments);
        }

        if (!_shouldLOD(x, y, unit)) {
            return _orig.apply(this, arguments);
        }

        // Dead units beyond LOD range: nothing to draw.
        if (unit && unit.hp <= 0) return;

        // Choose dot radius based on mount type
        var isElephant = (type === 'elephant') ||
                         (unitName && /eleph|elefa/i.test(unitName));
        var dotRadius = isElephant ? 8 : 5;

        _dot(ctx, x, y, factionColor, unit, dotRadius);
    };
}


// ════════════════════════════════════════════════════════════════════════
// PB3  NAVAL MAP DIMENSION REDUCTION  ★★★★☆  (NAVAL ONLY)
// ════════════════════════════════════════════════════════════════════════
//
// ORIGINAL PIPELINE
//   enterBattlefield()       → BATTLE_WORLD_WIDTH = 4800; HEIGHT = 3200;
//   launchCustomNavalBattle()→ BATTLE_WORLD_WIDTH = 4800; HEIGHT = 3200;
//   → both then call initNavalBattle() which calls generateNavalMap() and
//     generateShips() — both read the global dimensions.
//
// PATCH STRATEGY
//   Wrap initNavalBattle().  When our wrapper fires, the globals are already
//   4800×3200 (set by the caller).  We OVERRIDE them to PB_NAVAL_W × PB_NAVAL_H
//   BEFORE calling the original, so generateNavalMap() and generateShips()
//   see the reduced dimensions.  All subsequent code (deployNavalArmy,
//   _customNavalDeckSpawn, clearShipLanes, lastResort2, etc.) then reads
//   the corrected globals.
//
// WHY THIS IS SAFE FOR SPAWN LOGIC
//   • deployNavalArmy calls findValidShipDeckPosition(myShip, ...) which
//     uses ship.x / .y / .width / .height — NOT world dimensions.
//   • _customNavalDeckSpawn uses ship coordinates directly.
//   • slotForIndex calculates positions relative to ship.x / ship.y.
//   • lastResort2 uses world dimensions as bounds — the reduced values are
//     correct since all ships and units are within the smaller map.
//   • navalBackgroundCache is nulled at the start of initNavalBattle, so
//     the cache rebuilds at the new (smaller) dimensions automatically.
//   • initSailCanvas() creates a canvas matching the screen, not world size.
//   • generateCosmetics() spawns fish/waves/seagulls within
//     [0, WORLD_W] × [0, WORLD_H] — correctly bounded to the smaller map.
//
// RIVER BATTLES
//   River battles use the land engine (BATTLE_WORLD_WIDTH=2400, HEIGHT=1200)
//   and are explicitly excluded from this patch (tileType === 'River' check).
//
// MEMORY SAVINGS
//   bgCanvas pixels : 4800×3200 = 15.36 MP → 3200×2400 = 7.68 MP  (−15 MB)
//   Grid array cells: 600×400  = 240,000  → 400×300  = 120,000    (−~1 MB)
// ────────────────────────────────────────────────────────────────────────
function _pb3_navalMapReduction() {
    var _navalPollN  = 0;   // separate counter (setting props on a numeric interval ID doesn't work)
    var _navalPollId = null;

    var _tryWrap = function () {
        if (typeof initNavalBattle !== 'function') return;
        clearInterval(_navalPollId);

        var _origInitNaval = window.initNavalBattle;

        window.initNavalBattle = function (enemyNPC, playerObj, tileType, pCount, eCount) {
            var isRiver = (tileType === 'River');

            if (!isRiver) {
                // At this point BATTLE_WORLD_WIDTH is already 4800 (set by caller).
                // Override it before generateNavalMap / generateShips run.
                BATTLE_WORLD_WIDTH  = PB_NAVAL_W;
                BATTLE_WORLD_HEIGHT = PB_NAVAL_H;

                if (typeof BATTLE_TILE_SIZE !== 'undefined' && BATTLE_TILE_SIZE > 0) {
                    BATTLE_COLS = Math.floor(PB_NAVAL_W / BATTLE_TILE_SIZE);
                    BATTLE_ROWS = Math.floor(PB_NAVAL_H / BATTLE_TILE_SIZE);
                }

                console.log(
                    '[OPT-BATTLES PB3] Naval map reduced to ' +
                    PB_NAVAL_W + '×' + PB_NAVAL_H +
                    ' (COLS=' + BATTLE_COLS + ' ROWS=' + BATTLE_ROWS + ')'
                );
            }

            return _origInitNaval.apply(this, arguments);
        };

        console.log('[OPT-BATTLES PB3] initNavalBattle wrapped for map reduction.');
    };

    _navalPollId = setInterval(function () {
        _navalPollN++;
        _tryWrap();
        if (_navalPollN > 200) clearInterval(_navalPollId);
    }, 300);

    _tryWrap(); // also try immediately in case naval_battles.js already loaded
}


// ════════════════════════════════════════════════════════════════════════
// PB4  WAVE RENDER THROTTLE  ★★★☆☆  (NAVAL ONLY)
// ════════════════════════════════════════════════════════════════════════
//
// drawCosmeticWaves() iterates 300 wave objects every frame:
//   per-wave: Math.sin(time), opacity calc, isOnScreen check,
//   ship-proximity elliptical exclusion (2 nested loops × 2 ships),
//   ctx.stroke() for each visible wave crest.
//   Total: 300 × ~15 ops = ~4,500 ops/frame just for cosmetic waves.
//
// Wave animations complete a full cycle in ~5 seconds.  Skipping every
// other frame is imperceptible — wave position advances by < 0.5 px
// between skipped frames at typical wave speed (0.2–0.6).
//
// Desktop (IS_NATIVE=false): no skip.
// ────────────────────────────────────────────────────────────────────────
function _pb4_waveThrottle() {
    var SKIP = 1;
    var _n4  = 0;

    var _tryWrap = function () {
        if (typeof drawCosmeticWaves !== 'function') return;
        clearInterval(_pollId4);

        var _orig = window.drawCosmeticWaves;

        window.drawCosmeticWaves = function () {
            _n4++;
            if (SKIP > 1 && (_n4 % SKIP !== 0)) return;
            return _orig.apply(this, arguments);
        };
        console.log('[OPT-BATTLES PB4] drawCosmeticWaves throttled (skip-' + SKIP + ').');
    };

    var _pollN4  = 0;
    var _pollId4 = setInterval(function () {
        _pollN4++;
        _tryWrap();
        if (_pollN4 > 100) clearInterval(_pollId4);
    }, 500);

    _tryWrap();
}


// ════════════════════════════════════════════════════════════════════════
// PB5  NAVAL FISH THROTTLE  ★★★☆☆  (NAVAL ONLY)
// ════════════════════════════════════════════════════════════════════════
//
// Fish AI in updateNavalPhysics() runs every frame and includes:
//   _fishAvoidanceVector(): scans a 7-tile radius grid (14×14 = 196 cells)
//   per fish, plus ship proximity hypot for each of 2 ships.
//   Blocked position test against each ship's bounding sphere.
//   Blood splash check against all units (for overboard drowning).
//   With 40 fish objects: ~40 × (196 + 2 hypot + N_units) ops/frame.
//
// Fish move at 0.5–1.5 world-px/frame.  Skipping 2 out of 3 frames means
// fish travel at most ~1 extra world-px before the next AI tick —
// completely invisible to the player.
//
// STRATEGY
//   Temporarily replace navalEnvironment.fishes with an empty array on
//   throttled frames so the forEach inside updateNavalPhysics is a no-op.
//   The saved array is restored in a finally block so data is never lost.
//
// IMPORTANT: We throttle ONLY the fish loop.  Drowning logic for units
//   (overboard timers, drown timers) lives in a different section of
//   updateNavalPhysics and is unaffected because it iterates
//   battleEnvironment.units, not navalEnvironment.fishes.
//
// Desktop: no throttle.
// ────────────────────────────────────────────────────────────────────────
function _pb5_fishThrottle() {
    var SKIP = 1;
    if (SKIP <= 1) return;

    var _n5    = 0;
    var _pollN5  = 0;
    var _pollId5 = null;

    var _tryWrap = function () {
        if (typeof updateNavalPhysics !== 'function') return;
        clearInterval(_pollId5);

        var _origPhysics = window.updateNavalPhysics;

        window.updateNavalPhysics = function () {
            _n5++;
            var doSkipFish   = (_n5 % SKIP !== 0);
            var savedFishes  = null;

            if (doSkipFish &&
                typeof navalEnvironment !== 'undefined' &&
                Array.isArray(navalEnvironment.fishes) &&
                navalEnvironment.fishes.length > 0) {

                savedFishes             = navalEnvironment.fishes;
                navalEnvironment.fishes = _EMPTY_ARRAY;
            }

            try {
                return _origPhysics.apply(this, arguments);
            } finally {
                if (savedFishes !== null) {
                    navalEnvironment.fishes = savedFishes;
                }
            }
        };

        console.log('[OPT-BATTLES PB5] Fish AI throttled (skip-' + SKIP + ').');
    };

    _pollId5 = setInterval(function () {
        _pollN5++;
        _tryWrap();
        if (_pollN5 > 100) clearInterval(_pollId5);
    }, 500);

    _tryWrap();
}


// ════════════════════════════════════════════════════════════════════════
// PB6  SEAGULL THROTTLE  ★★☆☆☆  (NAVAL ONLY)
// ════════════════════════════════════════════════════════════════════════
//
// Seagull rendering draws each of 15 seagulls with: shadow ellipse,
// 2 wing stroke curves, body ellipse, beak triangle.
// Seagulls bank at random intervals and follow long sweeping trajectories.
// Skipping every 3rd AI tick is visually undetectable.
//
// PB4 already halves the render rate of drawCosmeticWaves (which contains
// the seagull draw).  This patch additionally throttles seagull MOVEMENT
// inside updateNavalPhysics so their positions are not updated every frame,
// reducing the per-frame sin/cos banking math.
//
// NOTE: PB5 may already have wrapped updateNavalPhysics.  This patch
// layers on top of whatever is currently at window.updateNavalPhysics,
// so both patches co-exist correctly regardless of load order.
//
// Desktop: no throttle.
// ────────────────────────────────────────────────────────────────────────
function _pb6_seagullThrottle() {
    var SKIP = 1;
    if (SKIP <= 1) return;

    var _n6      = 0;
    var _pollN6  = 0;
    var _pollId6 = null;

    var _tryWrap = function () {
        if (typeof updateNavalPhysics !== 'function') return;
        clearInterval(_pollId6);

        var _prevPhysics = window.updateNavalPhysics; // layers on top of PB5 if present

        window.updateNavalPhysics = function () {
            _n6++;
            var doSkipGull  = (_n6 % SKIP !== 0);
            var savedGulls  = null;

            if (doSkipGull &&
                typeof navalEnvironment !== 'undefined' &&
                Array.isArray(navalEnvironment.seagulls) &&
                navalEnvironment.seagulls.length > 0) {

                savedGulls                = navalEnvironment.seagulls;
                navalEnvironment.seagulls = _EMPTY_ARRAY;
            }

            try {
                return _prevPhysics.apply(this, arguments);
            } finally {
                if (savedGulls !== null) {
                    navalEnvironment.seagulls = savedGulls;
                }
            }
        };

        console.log('[OPT-BATTLES PB6] Seagull AI throttled (skip-' + SKIP + ').');
    };

    _pollId6 = setInterval(function () {
        _pollN6++;
        _tryWrap();
        if (_pollN6 > 100) clearInterval(_pollId6);
    }, 600);

    _tryWrap();
}


// ════════════════════════════════════════════════════════════════════════
// PB7  BLOOD POOL LOD  ★★★☆☆
// ════════════════════════════════════════════════════════════════════════
//
// drawBloodPool() is called in drawBattleUnits for EVERY dead unit every
// frame, regardless of distance.  It draws an ellipse with a randomised
// radius and rotation:
//   with 100 dead bodies → 100 × ~10 canvas ops = 1,000 ops/frame just for
//   corpse blood.
//
// At LOD distance, dead unit sprites are not drawn (PB1/PB2 return early).
// Drawing the blood pool without the body is invisible — the ellipse is
// ~8–16 world-px wide and appears as a sub-pixel smear at that range.
//
// WHY A SEPARATE PATCH IS NEEDED
//   drawBloodPool is called BEFORE drawInfantryUnit/drawCavalryUnit in the
//   drawBattleUnits forEach loop (see troop_draw.js line ~201):
//     if (isDead) { drawBloodPool(ctx, unit); ctx.save(); ... }
//     drawInfantryUnit(...)   ← PB1 intercepts here
//   PB1/PB2 can't suppress the blood pool — only this dedicated wrapper can.
// ────────────────────────────────────────────────────────────────────────
function _pb7_bloodPoolLOD() {
    var _pollN7  = 0;
    var _pollId7 = null;

    var _tryWrap = function () {
        if (typeof drawBloodPool !== 'function') return;
        clearInterval(_pollId7);

        var _orig = window.drawBloodPool;

        window.drawBloodPool = function (ctx, unit) {
            if (typeof inBattleMode === 'undefined' || !inBattleMode) {
                return _orig.apply(this, arguments);
            }
            // If no unit reference, pass through to original
            if (!unit) return _orig.apply(this, arguments);

            // Skip the blood pool draw for distant dead units entirely
            if (_shouldLOD(unit.x, unit.y, unit)) return;

            return _orig.apply(this, arguments);
        };

        console.log('[OPT-BATTLES PB7] drawBloodPool LOD wrap installed.');
    };

    _pollId7 = setInterval(function () {
        _pollN7++;
        _tryWrap();
        if (_pollN7 > 100) clearInterval(_pollId7);
    }, 300);

    _tryWrap();
}


// ════════════════════════════════════════════════════════════════════════
// PB8  STUCK PROJECTILE LOD ON DEAD UNITS  ★★★☆☆
// ════════════════════════════════════════════════════════════════════════
//
// From troop_draw.js (simplified):
//
//   sortedUnitsCache.forEach(unit => {
//     ...
//     let isDead = unit.hp <= 0;
//     if (isDead) {
//       drawBloodPool(ctx, unit);    ← PB7 handles this
//       ctx.save();
//       ctx.translate(unit.x, unit.y);
//       ctx.rotate(unit.deathRotation);
//       ctx.translate(-unit.x, -unit.y);
//     }
//     drawCavalryUnit / drawInfantryUnit(...)   ← PB1/PB2 handle these
//
//     if (unit.stuckProjectiles && unit.stuckProjectiles.length > 0) {
//       ctx.save(); ctx.translate(unit.x, unit.y);
//       unit.stuckProjectiles.forEach(sp => { ... drawStuckProjectileOrEffect ... });
//       ctx.restore();
//     }                                         ← THIS IS WHAT PB8 SUPPRESSES
//
//     if (isDead) { ctx.restore(); return; }
//     ...
//   });
//
// The stuckProjectiles block fires for BOTH living and dead units, including
// dead units at LOD distance whose sprites we have already suppressed.
// Drawing embedded arrows into invisible corpses is pure wasted GPU work.
//
// SAFE STRATEGY — stash / restore on unit objects
//   We wrap drawBattleUnits.  Before calling the original, we iterate
//   battleEnvironment.units directly (not the internal sortedUnitsCache),
//   identify dead units beyond LOD distance that have stuckProjectiles,
//   temporarily replace unit.stuckProjectiles with _EMPTY_MUT (a mutable
//   empty array so .length === 0 and the block is skipped), then restore
//   the original array in a finally block.
//
//   This avoids any patching of Array.prototype.forEach or other global
//   prototype mutations and is fully re-entrant.
//  
function _pb8_stuckProjectileLOD() {
    var _pollN8  = 0;
    var _pollId8 = null;

    // 1. WE CREATE THE ARRAY ONCE, OUTSIDE THE RAPID-FIRE LOOP
    var _stashedProjectiles = [];

    var _tryWrap = function () {
        if (typeof drawBattleUnits !== 'function') return;
        clearInterval(_pollId8);

        var _orig = window.drawBattleUnits;

        window.drawBattleUnits = function (ctx) {
            if (typeof inBattleMode === 'undefined' || !inBattleMode ||
                typeof player === 'undefined' ||
                typeof battleEnvironment === 'undefined' ||
                !Array.isArray(battleEnvironment.units)) {
                return _orig.apply(this, arguments);
            }

            // 2. INSTEAD OF CREATING A NEW ARRAY, WE JUST EMPTY THE EXISTING ONE
            _stashedProjectiles.length = 0;

            for (var i = 0; i < battleEnvironment.units.length; i++) {
                var u = battleEnvironment.units[i];
                if (!u) continue;
                if (u.hp > 0) continue;                    // alive — skip
                if (!u.stuckProjectiles) continue;          // nothing to stash
                if (u.stuckProjectiles.length === 0) continue;
                if (!_shouldLOD(u.x, u.y, u)) continue;   // close — keep visible

                // This unit is: dead + LOD distance + has stuck projectiles
                _stashedProjectiles.push({ unit: u, sp: u.stuckProjectiles });
                u.stuckProjectiles = _EMPTY_MUT;
            }

            // ── Phase 2: run the original draw call ──────────────────────
            var result;
            try {
                result = _orig.apply(this, arguments);
            } finally {
                // ── Phase 3: always restore — even on exception ──────────
                for (var j = 0; j < _stashedProjectiles.length; j++) {
                    _stashedProjectiles[j].unit.stuckProjectiles = _stashedProjectiles[j].sp;
                }
            }

            return result;
        };

        console.log('[OPT-BATTLES PB8] drawBattleUnits wrapped for stuckProjectile LOD.');
    };

    _pollId8 = setInterval(function () {
        _pollN8++;
        _tryWrap();
        if (_pollN8 > 100) clearInterval(_pollId8);
    }, 300);

    _tryWrap();
}


// ════════════════════════════════════════════════════════════════════════
// PB9  SUPPLY LINE WAGON REDUCTION  ★★★☆☆
// ════════════════════════════════════════════════════════════════════════
//
// drawSupplyLines() (battlefield_logic.js) draws 5 supply wagons per call.
// drawBattleUnits calls it TWICE per frame (once for each side), so that is
// 10 wagon draws per frame at all times — even during intense engagements.
// Each drawDetailedChineseWagon call makes ~80–120 canvas ops.
// 10 wagons × ~100 ops × 60 fps = 60,000 ops/sec for purely cosmetic supply
// wagons that are always off-screen at the map edges.
//
// On native we reduce to 2 wagons per line (4 total).  The supply line
// impression is visually maintained since the wagons are always drawn
// starting from centerX — the first 2 wagons are the most visible.
//
// On desktop we keep the full 5 (SKIP=false → fallthrough to original).
// ────────────────────────────────────────────────────────────────────────
function _pb9_supplyLineReduction() {
    var NATIVE_WAGON_COUNT = 2; // wagons per supply line on native (down from 5)
    if (!IS_NATIVE) return;     // desktop: leave drawSupplyLines untouched

    var _pollN9  = 0;
    var _pollId9 = null;

    var _tryWrap = function () {
        if (typeof drawSupplyLines !== 'function') return;
        if (typeof drawDetailedChineseWagon !== 'function') return;
        clearInterval(_pollId9);

        // We replace drawSupplyLines entirely with our own reduced version.
        // The original internal loop was:
        //   for (let i = 0; i < 5; i++) {
        //     const spacing = i * 85;
        //     drawDetailedChineseWagon(ctx, x + spacing - camera.x, y - camera.y, factionColor);
        //   }
        // We replicate that exactly, just with a smaller iteration count.
        window.drawSupplyLines = function (ctx, x, y, factionColor, camera) {
            for (var i = 0; i < NATIVE_WAGON_COUNT; i++) {
                var spacing = i * 85;
                drawDetailedChineseWagon(
                    ctx,
                    x + spacing - camera.x,
                    y - camera.y,
                    factionColor
                );
            }
        };

        console.log('[OPT-BATTLES PB9] drawSupplyLines reduced to ' +
                    NATIVE_WAGON_COUNT + ' wagons per line (native only).');
    };

    _pollId9 = setInterval(function () {
        _pollN9++;
        _tryWrap();
        if (_pollN9 > 100) clearInterval(_pollId9);
    }, 300);

    _tryWrap();
}


})(); // End OPTIMIZATION_BATTLES IIFE


/* ═══════════════════════════════════════════════════════════════════════════
   APPENDIX A — LOADING ORDER
   ═══════════════════════════════════════════════════════════════════════════

   This file MUST load AFTER all other game scripts, identical to
   optimization.js (CAPACITOR_PERF_PATCH.js).  Recommended order:

     <script src="troop_system.js"></script>
     <script src="infscript.js"></script>
     <script src="cavscript.js"></script>
     <script src="battlefield_launch.js"></script>
     <script src="troop_draw.js"></script>
     <script src="battlefield_logic.js"></script>
     <script src="naval_battles.js"></script>
     <script src="custom_battle_gui.js"></script>
     <script src="optimization.js"></script>          ← existing overworld patch
     <script src="optimization_battles.js"></script>  ← THIS FILE (load last)

   Both optimization files coexist without conflict:
     - optimization.js        patches drawCaravan, drawShip, updateNPCs (OVERWORLD)
     - optimization_battles.js patches drawInfantryUnit, drawCavalryUnit,
                                        drawBattleUnits, drawBloodPool,
                                        drawSupplyLines, initNavalBattle,
                                        drawCosmeticWaves, updateNavalPhysics
   There is no function overlap between the two files.

   ═══════════════════════════════════════════════════════════════════════════
   APPENDIX B — PATCHES THAT REQUIRE SOURCE FILE EDITS
   ═══════════════════════════════════════════════════════════════════════════

   The following optimisations cannot be applied from outside without
   replacing entire closures.  Documented here for future reference.

   ── troop_draw.js ────────────────────────────────────────────────────────

   CHANGE 1: Increase SORT_INTERVAL from 100 ms to 200 ms on native.

     // BEFORE:
     const SORT_INTERVAL = 100;

     // AFTER (add IS_NATIVE detection at the top of troop_draw.js):
     const IS_NATIVE_DRAW = (
         typeof window.Capacitor !== 'undefined' ||
         /\bwv\b/.test(navigator.userAgent)
     );
     const SORT_INTERVAL = IS_NATIVE_DRAW ? 200 : 100;

     // Rationale: Units move at 0.25–0.5 world-px/frame in battle.
     // In 200 ms at 30 fps = 6 frames, max Y movement = 3 px.
     // Two adjacent units can only swap Y-sort order if they pass
     // each other — at 3 px total movement this cannot happen.
     // Visual artefact: none detectable.

   NOTE: SORT_INTERVAL and lastSortTime are declared with let/const at the
   top of troop_draw.js (script scope), so they are NOT accessible on window
   and cannot be patched from this external file.

   ── battlefield_logic.js ────────────────────────────────────────────────

   CHANGE 2: Skip projectile rendering beyond a distance threshold.

     // In the projectile forEach block in the draw loop, add:
     battleEnvironment.projectiles.forEach(p => {
         if (isNaN(p.x) || isNaN(p.y)) return;
         if (typeof camera !== 'undefined' && !isOnScreen(p, camera)) return;
         // ADD — distance cull (projectiles > 500 px from player are tiny):
         var _pdx = p.x - player.x, _pdy = p.y - player.y;
         if ((_pdx * _pdx + _pdy * _pdy) > 250000) return; // 500 px squared
         // ... rest of projectile draw ...
     });

   ── naval_battles.js ────────────────────────────────────────────────────

   CHANGE 3: Reduce wave cosmetic count from 300 to 150 on native.

     // In generateCosmetics():
     // BEFORE:
     for (let i = 0; i < 300; i++) { navalEnvironment.waves.push(...); }

     // AFTER:
     const waveCount = IS_NATIVE ? 150 : 300;
     for (let i = 0; i < waveCount; i++) { navalEnvironment.waves.push(...); }

   CHANGE 4: Reduce fish count from 40 to 15 on native.

     // In generateCosmetics():
     // BEFORE:
     for (let i = 0; i < 40; i++) { navalEnvironment.fishes.push(...); }

     // AFTER:
     const fishCount = IS_NATIVE ? 15 : 40;
     for (let i = 0; i < fishCount; i++) { navalEnvironment.fishes.push(...); }

   (Changes 3 and 4 above combine with PB4/PB5 from this file — the throttles
   become even more effective when there are fewer objects to iterate over.)

   ═══════════════════════════════════════════════════════════════════════════
   APPENDIX C — COMBINED PERFORMANCE BUDGET ESTIMATE  (Pixel 2 WebView)
   ═══════════════════════════════════════════════════════════════════════════

   LAND BATTLE (200 units, zoom 0.8, 60 fps):
   ┌──────────────────────────────────────────────────────────────────┐
   │ BEFORE patch:                                                    │
   │   ~200 units visible (all within isOnScreen bounds)             │
   │   ~150 ops/unit (infantry avg) × 200 = 30,000 ops/frame        │
   │   × 60 fps = 1,800,000 canvas ops/second                       │
   │                                                                  │
   │ AFTER PB1/PB2 (LOD at 400 px):                                  │
   │   ~80 units within 400 px → full sprite: 80 × 150 = 12,000     │
   │   ~120 units beyond 400 px → dot:       120 × 5  =    600      │
   │   Total: 12,600 ops/frame × 60 fps = 756,000 ops/sec           │
   │   REDUCTION: ~58 % fewer canvas ops                             │
   └──────────────────────────────────────────────────────────────────┘

   LAND BATTLE supply lines saved (PB9, native):
   ┌──────────────────────────────────────────────────────────────────┐
   │   BEFORE: 10 wagons × ~100 ops × 60 fps = 60,000 ops/sec       │
   │   AFTER:   4 wagons × ~100 ops × 60 fps = 24,000 ops/sec       │
   │   REDUCTION: ~60 % of supply line cost eliminated               │
   └──────────────────────────────────────────────────────────────────┘

   NAVAL BATTLE (80 units, zoom 1.3, 60 fps):
   ┌──────────────────────────────────────────────────────────────────┐
   │ BEFORE patch:                                                    │
   │   Map: 4800×3200 bgCanvas = 15.36 MP                           │
   │   300 waves × ~15 ops = 4,500 ops/frame                        │
   │   40 fish × avoidance math = ~8,000 ops/frame                  │
   │   80 units × ~200 ops (cavalry heavy) = 16,000 ops             │
   │   Total frame cost: ~28,500 ops + large bgCanvas blit           │
   │                                                                  │
   │ AFTER PB1–PB6 + PB9:                                            │
   │   Map: 3200×2400 bgCanvas = 7.68 MP  (50 % smaller blit)      │
   │   Waves: skip-2 throttle → 150 wave ops + PB4 = ~2,250         │
   │   Fish: skip-3 → ~2,670 ops/sec AI                             │
   │   50 units within 400 px: full sprite → 50 × 200 = 10,000      │
   │   30 units beyond 400 px: dot         → 30 × 5  =    150       │
   │   Total frame cost: ~12,400 ops + 50 % less blit work          │
   │   REDUCTION: ~56 % fewer canvas ops + 50 % less blit work      │
   └──────────────────────────────────────────────────────────────────┘

   ═══════════════════════════════════════════════════════════════════════════
*/
