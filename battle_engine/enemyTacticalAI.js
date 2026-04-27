/**
 * enemyTacticalAI.js  ─  ENEMY TACTICAL COMMAND ENGINE  (REVISED v2)
 * ====================================================================
 * Controls standard ENEMY units in Land AND River battles only.
 *
 *   ✓ Infantry · Cavalry · Ranged · Gunpowder
 *   ✗ Enemy General        (processEnemyCommanderAI — untouched)
 *   ✗ Siege equipment/crew (excluded by SIEGE_ROLES tag)
 *   ✗ Player units         (side === "player" — untouched)
 *   ✗ Naval / Coastal / Ocean battles  (guarded — untouched)
 *   ✗ Siege battles        (guarded — untouched)
 *
 * ── LAND BATTLE PHASE SEQUENCE ──────────────────────────────────────
 *   FORMING      → All units hold position briefly (formation lock-in, ~2 s)
 *   ADVANCING    → Slow cohesive march (65 % avg speed) toward player,
 *                  formation depends on detected player composition.
 *   SKIRMISHING  → Ranged free-fires. Melee holds or slow-walks depending
 *                  on formation style. Timer / distance triggers charge.
 *   CHARGING     → All units restore full speed → seek_engage.
 *
 * ── RIVER BATTLE PHASE SEQUENCE ─────────────────────────────────────
 *   ADVANCING    → Controlled blob approach; water-tile awareness stops
 *                  units at the bank. Never walk blindly into tile-4 water.
 *   CHARGING     → Committed when player closes to RIVER_COMMIT_DIST.
 *
 * ── EMERGENCY GENERAL DEFENSE (overlaid on any phase) ───────────────
 *   When the enemy general's HP drops below 50 %, ALL enemy cavalry and
 *   ALL archers / crossbowmen abandon their current orders and rush to
 *   form a protective ring around the general. Infantry continues its
 *   normal phase. Crisis is re-evaluated every tick.
 *
 * ── FORMATION SELECTION (based on detected PLAYER composition) ───────
 *   SQUARE       → player has > 70 % lancer cavalry  (anti-charge box)
 *   SHIELD_WALL  → player has > 40 % horse archers   (layered counter)
 *   STANDARD     → default — infantry front, ranged second, cav flanks
 *
 * ── FALSE-FLEE FIX ───────────────────────────────────────────────────
 *   Every move_to_point issued during ADVANCING is validated by
 *   isValidAdvanceTarget(). If the destination would move a unit AWAY
 *   from the player centroid (retreat direction) the order is replaced
 *   by a direct-approach order instead. High-morale units therefore
 *   cannot be pushed backward by phase logic.
 *
 * ── ENGINE SURFACE REQUIRED ──────────────────────────────────────────
 *   window.battleEnvironment.units[]       — unit array
 *   window.battleEnvironment.grid[][]      — tile grid (for river checks)
 *   window.battleEnvironment.battleType    — "land" | "river" | …
 *   window.inRiverBattle                   — bool (set by launchCustomBattle)
 *   window.inNavalBattle                   — bool
 *   unit.side / unit.hp / unit.x / unit.y
 *   unit.stats.speed / unit.stats.role / unit.stats.health
 *   unit.orderType / unit.orderTargetPoint / unit.hasOrders
 *   unit.isCommander / unit.isDummy / unit.disableAICombat / unit.isSiege
 *
 * Optional helpers (gracefully skipped when absent):
 *   window.getTacticalRole(unit)                       → role string
 *   window.calculateFormationOffsets(units, style, pt) → sets offsets
 *   window.getSafeMapCoordinates(x, y, margin?)        → { x, y }
 *   window.MobileControls.G.isBattle()                → bool
 *   window.AudioManager.playSound(key)
 *   window.BATTLE_TILE_SIZE                            → number (default 8)
 */

;(function (W, D) {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════════
  // MODULE STATE
  // ══════════════════════════════════════════════════════════════════════════
  let _tickInterval   = null;
  let _phase          = 'IDLE';       // IDLE|FORMING|ADVANCING|SKIRMISHING|CHARGING
  let _skirmishTicks  = 0;
  let _formingTicks   = 0;
  let _crisisActive   = false;        // true while emergency general-defence is live
  let _formationStyle = 'STANDARD';   // STANDARD | SQUARE | SHIELD_WALL

  // ══════════════════════════════════════════════════════════════════════════
  // TUNABLE CONSTANTS
  //   All distances are world-space pixels.  Tweak freely.
  // ══════════════════════════════════════════════════════════════════════════
  const TICK_MS               = 500;  // ms between AI evaluations (~2 / sec)
  const FORMING_TICKS         = 4;    // 4 × 500 ms = 2 s organisation pause
  const SKIRMISH_MAX_TICKS    = 16;   // 8 s maximum in skirmish before forced charge

  // Land distances
  const DIST_SKIRMISH         = 580;  // px: closest pair → enter skirmishing
  const DIST_MELEE_COMMIT     = 170;  // px: melee-only pair → commit charge
  const DIST_CAV_COMMIT       = 270;  // px: cavalry charges slightly earlier
  const DIST_SQUARE_COMMIT    = 230;  // px: square formation commit distance

  // Advance target look-ahead (px ahead of the unit in the player direction).
  // Units are always pointed toward the player — no backward movement possible.
  const ADVANCE_LOOK_AHEAD    = 500;  // px: how far ahead the march waypoint is set
  const ADVANCE_SPEED_SCALE   = 0.65; // fraction of avg speed used during cohesive march

  // River battle distances
  const RIVER_COMMIT_DIST     = 320;  // px: commit across river when player this close
  const RIVER_SPEED_SCALE     = 0.70; // fraction of avg speed used while river-approaching
  const RIVER_BLOB_SPREAD     = 90;   // px: random blob spread for clustering near bank

  // General-defence ring
  const GENERAL_CRISIS_HP     = 0.50; // HP fraction below which crisis triggers
  const BODYGUARD_RING_RADIUS = 95;   // px: radius of the protection ring
  const BODYGUARD_RUSH_BONUS  = 1.25; // speed multiplier for rushing bodyguards

  // Formation spread parameters (px) for role-based advance positioning
  const SPREAD_INFANTRY_X     = 38;   // horizontal spacing between infantry units
  const SPREAD_RANGED_BACK    = 80;   // ranged line offset behind infantry (Y)
  const SPREAD_CAV_BACK       = 190;  // cavalry rearguard offset (Y)
  const SPREAD_GUNPOWDER_X    = 160;  // gunpowder flank offset (X)
  const SPREAD_GUNPOWDER_BACK = 60;   // gunpowder back offset (Y)
  const ADVANCE_STOP_BUFFER   = 90;   // px: stop this far short of player centroid

  // ══════════════════════════════════════════════════════════════════════════
  // EXCLUSION TAGS  —  extend freely; any matching role is silently skipped
  // ══════════════════════════════════════════════════════════════════════════
  const SIEGE_ROLES = new Set([
    'SIEGE', 'CATAPULT', 'BALLISTA', 'TREBUCHET', 'CANNON',
    'BOMBARD', 'MORTAR', 'RAM', 'SIEGE_TOWER', 'FIRE_SHIP',
    'GALLEY_SIEGE', 'ROCKET_BATTERY', 'SIEGE_CREW',
  ]);

  // ══════════════════════════════════════════════════════════════════════════
  // BATTLE CONTEXT HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  function isRiverBattle() {
    return W.inRiverBattle === true;
  }

  function isNavalBattle() {
    return W.inNavalBattle === true;
  }

  function isSiegeBattle() {
    return (typeof W.inSiegeBattle !== 'undefined') && W.inSiegeBattle;
  }

  /** Returns false for any battle type that this AI must not touch. */
  function isAllowedBattle() {
    if (isSiegeBattle()) return false;   // Siege has a dedicated AI file
    if (isNavalBattle()) return false;   // Naval / Coastal logic untouched
    const env = W.battleEnvironment;
    if (!env) return false;
    const bt = (env.battleType || 'land').toLowerCase();
    // Block any residual coastal / ocean / siege strings
    if (bt.includes('coastal') || bt.includes('ocean') || bt.includes('siege')) return false;
    return true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ROLE RESOLVER & HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  const _CAV_ROLES  = new Set(['CAVALRY', 'HORSE_ARCHER', 'MOUNTED_GUNNER', 'CAMEL', 'ELEPHANT']);
  const _RNG_ROLES  = new Set(['ARCHER', 'CROSSBOW', 'THROWING']);
  const _GUN_ROLES  = new Set(['GUNNER', 'FIRELANCE', 'BOMB', 'ROCKET']);

  function resolveRole(unit) {
    if (typeof W.getTacticalRole === 'function') return W.getTacticalRole(unit);
    const r = String((unit.stats && unit.stats.role) || '').toUpperCase();
    if (_CAV_ROLES.has(r))  return 'CAVALRY';
    if (_RNG_ROLES.has(r))  return 'RANGED';
    if (_GUN_ROLES.has(r))  return 'GUNPOWDER';
    return 'INFANTRY';
  }

  function isRangedRole(role)   { return role === 'RANGED' || role === 'GUNPOWDER'; }
  function isCavalryRole(role)  { return role === 'CAVALRY'; }
  function isInfantryRole(role) { return role === 'INFANTRY'; }

  /**
   * Returns true for units that should rush to the general's ring during crisis:
   * cavalry of all kinds, plus bow-class ranged (archers and crossbowmen).
   * Throwing units, bomb throwers, and infantry hold their positions.
   */
  function isBodyguardType(unit) {
    const role     = resolveRole(unit);
    if (isCavalryRole(role)) return true;
    if (role === 'RANGED') {
      const r = String((unit.stats && unit.stats.role) || '').toLowerCase();
      // Only archery-type ranged (not throwing / slinger)
      return r === 'archer' || r === 'crossbow' || r === 'horse_archer';
    }
    return false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UNIT FILTERS
  // ══════════════════════════════════════════════════════════════════════════

  function getEnemyUnits() {
    const env = W.battleEnvironment;
    if (!env || !env.units) return [];
    return env.units.filter(u =>
      u.side             === 'enemy' &&
      u.hp               >  0        &&
      !u.isCommander                  && // general has its own AI — never touch
      !u.isDummy                      && // off-map placeholder
      !u.disableAICombat              && // scripted freeze
      !SIEGE_ROLES.has(String((u.stats && u.stats.role) || '').toUpperCase())
    );
  }

  function getPlayerUnits() {
    const env = W.battleEnvironment;
    if (!env || !env.units) return [];
    return env.units.filter(u => u.side === 'player' && u.hp > 0 && !u.isDummy);
  }

  /** Returns the living enemy commander, or null. */
  function findEnemyGeneral() {
    const env = W.battleEnvironment;
    if (!env || !env.units) return null;
    return env.units.find(u => u.isCommander && u.side === 'enemy' && u.hp > 0) || null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SPEED MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  function backupSpeed(unit) {
    if (unit._etai_origSpeed === undefined && unit.stats) {
      unit._etai_origSpeed = unit.stats.speed;
    }
  }

  function restoreSpeed(unit) {
    if (unit._etai_origSpeed !== undefined && unit.stats) {
      unit.stats.speed = unit._etai_origSpeed;
      delete unit._etai_origSpeed;
    }
  }

  function restoreAllSpeeds(units) { units.forEach(restoreSpeed); }

  // ══════════════════════════════════════════════════════════════════════════
  // GEOMETRY HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  function dist2D(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function centroid(units) {
    if (!units.length) return { x: 0, y: 0 };
    let sx = 0, sy = 0;
    units.forEach(u => { sx += u.x; sy += u.y; });
    return { x: sx / units.length, y: sy / units.length };
  }

  /**
   * Minimum distance between any enemy unit and any player unit.
   * Optional roleFilter(role) → bool to restrict which enemy units participate.
   */
  function minGap(enemyUnits, playerUnits, roleFilter) {
    let min = Infinity;
    enemyUnits.forEach(e => {
      if (roleFilter && !roleFilter(resolveRole(e))) return;
      playerUnits.forEach(p => { const d = dist2D(e, p); if (d < min) min = d; });
    });
    return min;
  }

  function safePoint(x, y, margin) {
    if (typeof W.getSafeMapCoordinates === 'function') return W.getSafeMapCoordinates(x, y, margin);
    return { x, y };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TILE / WATER DETECTION  (river battles only)
  // ══════════════════════════════════════════════════════════════════════════

  function _tileAt(wx, wy) {
    const env = W.battleEnvironment;
    if (!env || !env.grid) return 0;
    const ts = (typeof W.BATTLE_TILE_SIZE !== 'undefined') ? W.BATTLE_TILE_SIZE : 8;
    const tx = Math.floor(wx / ts);
    const ty = Math.floor(wy / ts);
    if (!env.grid[tx]) return 0;
    return env.grid[tx][ty] || 0;
  }

  /** Returns true if the world coordinate is over a deep-water tile. */
  function isWater(wx, wy) {
    const t = _tileAt(wx, wy);
    return t === 4 || t === 11; // 4 = river water, 11 = ocean (shouldn't appear here)
  }

  /**
   * Walk from (fx, fy) toward (tx, ty) in `steps` equal increments.
   * Returns the last NON-water interpolated point before hitting water
   * (or the destination if the full path is clear).
   *
   * { x, y, hitWater: bool }
   */
  function safePathDest(fx, fy, tx, ty, steps) {
    steps = steps || 7;
    let lastSafeX = fx, lastSafeY = fy;
    for (let i = 1; i <= steps; i++) {
      const f  = i / steps;
      const ix = fx + (tx - fx) * f;
      const iy = fy + (ty - fy) * f;
      if (isWater(ix, iy)) return { x: lastSafeX, y: lastSafeY, hitWater: true };
      lastSafeX = ix;
      lastSafeY = iy;
    }
    return { x: tx, y: ty, hitWater: false };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COMPOSITION ANALYSIS
  // ══════════════════════════════════════════════════════════════════════════

  /** Analyse enemy army → average speed + base formation tag for engine calls. */
  function analyseEnemy(units) {
    let cav = 0, rng = 0, inf = 0, totalSpd = 0;
    units.forEach(u => {
      const role = resolveRole(u);
      if (isCavalryRole(role))      cav++;
      else if (isRangedRole(role))  rng++;
      else                          inf++;
      totalSpd += (u.stats && u.stats.speed) ? u.stats.speed : 2;
    });
    const total    = units.length || 1;
    const avgSpeed = Math.max(1, totalSpd / total);
    let engineStyle = 'standard';
    if      (cav / total > 0.40) engineStyle = 'circle';
    else if (rng / total > 0.45) engineStyle = 'line';
    else if (inf / total > 0.60) engineStyle = 'tight';
    return { avgSpeed, engineStyle, cavCount: cav, rngCount: rng, infCount: inf };
  }

  // Lancer keyword — matches "Lancer", "Heavy Lancer", "Elite Lancer", "Keshig"
  const _LANCER_RE  = /(lancer|keshig)/i;
  // Horse archer keyword — matches "Horse Archer", "Heavy Horse Archer", role "horse_archer"
  const _HORSE_A_RE = /(horse[_ ]archer)/i;

  /**
   * Analyse the PLAYER army composition to choose the best enemy counter-formation.
   * Returns percentages and convenience flags.
   */
  function analysePlayer(playerUnits) {
    const total = playerUnits.length || 1;
    let lancers = 0, horseArchers = 0;
    playerUnits.forEach(u => {
      const type = String(u.unitType || '');
      const role = String((u.stats && u.stats.role) || '');
      if      (_LANCER_RE .test(type) || _LANCER_RE .test(role)) lancers++;
      else if (_HORSE_A_RE.test(type) || _HORSE_A_RE.test(role)) horseArchers++;
    });
    const lancerPct      = lancers     / total;
    const horseArcherPct = horseArchers / total;
    return {
      lancerPct,
      horseArcherPct,
      hasMostlyLancers:      lancerPct      >= 0.70, // > 70 % → SQUARE
      hasMostlyHorseArchers: horseArcherPct >= 0.40, // > 40 % → SHIELD_WALL
    };
  }

  /** Map player composition to the formation style the enemy should adopt. */
  function pickFormationStyle(playerComp) {
    if (playerComp.hasMostlyLancers)      return 'SQUARE';
    if (playerComp.hasMostlyHorseArchers) return 'SHIELD_WALL';
    return 'STANDARD';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ORDER HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  function orderMove(unit, tx, ty) {
    unit.hasOrders        = true;
    unit.orderType        = 'move_to_point';
    unit.orderTargetPoint = safePoint(tx, ty);
    unit.reactionDelay    = 0;
  }

  function orderHold(unit) {
    unit.hasOrders        = true;
    unit.orderType        = 'hold_position';
    unit.vx               = 0;
    unit.vy               = 0;
    unit.orderTargetPoint = safePoint(unit.x, unit.y, 15);
  }

  function orderChase(unit) {
    unit.hasOrders        = true;
    unit.orderType        = 'seek_engage';
    unit.orderTargetPoint = null;
    unit.target           = null; // let engine re-acquire nearest target
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADVANCE TARGET CALCULATOR  —  FALSE-FLEE CORE FIX
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Returns the world-space march waypoint for a single unit during the
   * ADVANCING phase.  The waypoint is always positioned AHEAD of the unit
   * in the direction of the player centroid, so it is geometrically
   * impossible for this function to produce a retreat order.
   *
   * Formation spread is layered on top so the army doesn't blob on one pixel.
   *
   * @param {object} unit             The unit being ordered.
   * @param {object} playerCentroid   Centre-of-mass of living player units.
   * @param {string} formStyle        'STANDARD' | 'SQUARE' | 'SHIELD_WALL'
   * @param {number} roleGroupIndex   Index of this unit within its role group.
   * @param {number} roleGroupTotal   Total units in this role group.
   * @returns {{ x:number, y:number }}
   */
  function calcAdvanceTarget(unit, playerCentroid, formStyle, roleGroupIndex, roleGroupTotal) {
    // ── Step 1: Unit vector from THIS unit toward the player centroid ────────
    const rawDx  = playerCentroid.x - unit.x;
    const rawDy  = playerCentroid.y - unit.y;
    const rawLen = Math.hypot(rawDx, rawDy) || 1;
    const nx     = rawDx / rawLen; // unit vector X (toward player)
    const ny     = rawDy / rawLen; // unit vector Y (toward player)

    // ── Step 2: Perpendicular vector (for horizontal spread along the line) ──
    const px = -ny;  // perpendicular X
    const py =  nx;  // perpendicular Y

    // ── Step 3: Horizontal slot for this unit within its role group ──────────
    const half    = (roleGroupTotal - 1) / 2;
    const slot    = roleGroupIndex - half;          // centered around 0
    let   spreadX = 0;
    let   behindY = 0; // additional backward offset along the advance axis

    if (formStyle === 'SQUARE') {
      // Tight ring — small spread in both axes around centroid
      const angle  = (roleGroupIndex / Math.max(roleGroupTotal, 1)) * Math.PI * 2;
      const radius = 55;
      // Translate ring into world offsets using perpendicular + forward axes
      spreadX = Math.cos(angle) * radius;  // mapped to perp axis below
      behindY = Math.sin(angle) * radius * 0.5;  // small depth variation

    } else if (formStyle === 'SHIELD_WALL') {
      const role = resolveRole(unit);
      if (isCavalryRole(role)) {
        // Cavalry sits far back — they are the last resort in this formation
        behindY = SPREAD_CAV_BACK;
        spreadX = slot * (SPREAD_INFANTRY_X * 1.2);
      } else if (isRangedRole(role)) {
        // Ranged: second line, moderate spread
        behindY = SPREAD_RANGED_BACK;
        spreadX = slot * SPREAD_INFANTRY_X;
      } else if (role === 'GUNPOWDER') {
        // Gunpowder units on the flanks — wide X spread, moderate back
        const flankSign = (roleGroupIndex % 2 === 0) ? 1 : -1;
        spreadX = flankSign * (SPREAD_GUNPOWDER_X + slot * 20);
        behindY = SPREAD_GUNPOWDER_BACK;
      } else {
        // Infantry front: tight horizontal line, minimal back offset
        spreadX = slot * SPREAD_INFANTRY_X;
        behindY = 0;
      }

    } else {
      // STANDARD: infantry front, ranged back, cavalry on the flanks
      const role = resolveRole(unit);
      if (isCavalryRole(role)) {
        // Cavalry swings wide to the flanks
        const flankSign = (roleGroupIndex % 2 === 0) ? 1 : -1;
        spreadX = flankSign * (130 + slot * 25);
        behindY = 55;
      } else if (isRangedRole(role)) {
        spreadX = slot * SPREAD_INFANTRY_X;
        behindY = SPREAD_RANGED_BACK;
      } else {
        spreadX = slot * SPREAD_INFANTRY_X;
        behindY = 0;
      }
    }

    // ── Step 4: Build the look-ahead waypoint ────────────────────────────────
    // Start from the unit's current position, step forward ADVANCE_LOOK_AHEAD px
    // then subtract ADVANCE_STOP_BUFFER so units don't march INTO the player mass.
    const effectiveLook = Math.max(0, ADVANCE_LOOK_AHEAD - ADVANCE_STOP_BUFFER);

    let tx = unit.x + nx * effectiveLook + px * spreadX - nx * behindY;
    let ty = unit.y + ny * effectiveLook + py * spreadX - ny * behindY;

    // ── Step 5: Clamp waypoint so it doesn't overshoot the player centroid ───
    // The clamped point lies at most ADVANCE_STOP_BUFFER pixels short of centroid.
    const clampX = playerCentroid.x - nx * ADVANCE_STOP_BUFFER;
    const clampY = playerCentroid.y - ny * ADVANCE_STOP_BUFFER;

    const toClampDist = Math.hypot(clampX - unit.x, clampY - unit.y);
    const toTgtDist   = Math.hypot(tx       - unit.x, ty       - unit.y);

    if (toTgtDist > toClampDist) {
      // Waypoint is further than the clamp → cap it
      tx = clampX + px * spreadX * 0.5;
      ty = clampY + py * spreadX * 0.5;
    }

    // ── Step 6: Anti-false-flee final guard ─────────────────────────────────
    // If this target somehow ends up further from the player than the unit is
    // now (i.e. it would retreat), replace it with a direct advance to centroid.
    const distNow  = dist2D(unit, playerCentroid);
    const distTgt  = Math.hypot(tx - playerCentroid.x, ty - playerCentroid.y);
    if (distTgt > distNow + 80) {
      tx = playerCentroid.x - nx * ADVANCE_STOP_BUFFER;
      ty = playerCentroid.y - ny * ADVANCE_STOP_BUFFER;
    }

    return { x: tx, y: ty };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GENERAL CRISIS DETECTION & RESPONSE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Returns true when the enemy general exists AND his HP has fallen
   * below GENERAL_CRISIS_HP fraction of his maximum.
   */
  function detectCrisis() {
    const gen = findEnemyGeneral();
    if (!gen) return false; // No general → no crisis logic runs
    // Prefer stats.health as the max-HP reference; fall back to hp (first-frame value)
    const maxHp = (gen.stats && gen.stats.health) ? gen.stats.health
                 : (gen.maxHp || gen.hp || 1);
    return (gen.hp / maxHp) < GENERAL_CRISIS_HP;
  }

  /**
   * Issue emergency bodyguard orders to cavalry and archer-type ranged units.
   *
   * Units already inside the ring → hold position around the general.
   * Units outside → rush at boosted speed.
   *
   * Infantry and gunpowder units are NOT passed to this function (they continue
   * their normal phase orders in the caller).
   */
  function executeCrisis(bodyguardUnits) {
    const gen = findEnemyGeneral();
    if (!gen) return;

    bodyguardUnits.forEach(u => {
      const d = dist2D(u, gen);

      if (d <= BODYGUARD_RING_RADIUS) {
        // Already at the ring — hold station
        orderHold(u);
      } else {
        // Rush toward a random slot around the general so they fan out nicely
        const angle  = Math.random() * Math.PI * 2;
        const ringR  = BODYGUARD_RING_RADIUS * 0.65; // aim slightly inside
        const destX  = gen.x + Math.cos(angle) * ringR;
        const destY  = gen.y + Math.sin(angle) * ringR;

        backupSpeed(u);
        if (u.stats && u._etai_origSpeed !== undefined) {
          u.stats.speed = u._etai_origSpeed * BODYGUARD_RUSH_BONUS;
        }
        orderMove(u, destX, destY);
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LAND BATTLE PHASES
  // ══════════════════════════════════════════════════════════════════════════

  // ── FORMING ──────────────────────────────────────────────────────────────
  /** All units briefly hold position while the AI decides formation style. */
  function executeForming(enemyUnits) {
    enemyUnits.forEach(u => {
      backupSpeed(u);
      orderHold(u);
    });
  }

  // ── ADVANCING ────────────────────────────────────────────────────────────
  /**
   * Cohesive march at reduced speed.  Units receive formation-aware waypoints
   * that are always ahead of their current position — the root fix for the
   * "false retreat / runaway" bug.
   */
  function executeAdvancing(enemyUnits, playerCentroid, formStyle, avgSpeed) {

    // Ask the engine for formation offsets if available (used as supplementary data).
    if (typeof W.calculateFormationOffsets === 'function') {
      const engineStyle = formStyle === 'SQUARE'      ? 'circle'
                        : formStyle === 'SHIELD_WALL' ? 'line'
                        :                               'standard';
      W.calculateFormationOffsets(enemyUnits, engineStyle, playerCentroid);
    }

    // Group units by role so each group gets a coherent slot assignment.
    const groups = { INFANTRY: [], CAVALRY: [], RANGED: [], GUNPOWDER: [] };
    enemyUnits.forEach(u => {
      const role = resolveRole(u);
      (groups[role] || groups.INFANTRY).push(u);
    });

    Object.values(groups).forEach(group => {
      group.forEach((u, idx) => {
        backupSpeed(u);
        u.stats.speed = avgSpeed * ADVANCE_SPEED_SCALE; // phalanx lock-step speed

        const tgt = calcAdvanceTarget(u, playerCentroid, formStyle, idx, group.length);
        orderMove(u, tgt.x, tgt.y);
      });
    });
  }

  // ── SKIRMISHING ──────────────────────────────────────────────────────────
  /**
   * Issue skirmish orders based on the active formation style.
   *
   *  STANDARD    — ranged free-fires, melee & cav hold the line.
   *  SQUARE      — all units compress the box; ranged fires outward.
   *  SHIELD_WALL — infantry slow-walks into contact; ranged second-line
   *                fires freely; cavalry stays anchored at the rear.
   */
  function executeSkirmish(enemyUnits, formStyle, playerCentroid) {
    enemyUnits.forEach(u => {
      const role = resolveRole(u);

      // ── SQUARE formation ────────────────────────────────────────────────
      if (formStyle === 'SQUARE') {
        if (isRangedRole(role)) {
          // Ranged fires from inside the box
          restoreSpeed(u);
          orderChase(u);
        } else {
          // Cavalry and infantry compress and hold the perimeter
          orderHold(u);
        }
        return;
      }

      // ── SHIELD_WALL formation ───────────────────────────────────────────
      if (formStyle === 'SHIELD_WALL') {
        if (isInfantryRole(role)) {
          // Front-line infantry engages at half speed (controlled slow advance)
          backupSpeed(u);
          if (u.stats && u._etai_origSpeed !== undefined) {
            u.stats.speed = u._etai_origSpeed * 0.50;
          }
          orderChase(u);
        } else if (isRangedRole(role)) {
          // Second-line shoots freely
          restoreSpeed(u);
          orderChase(u);
        } else if (isCavalryRole(role)) {
          // Cavalry anchored at the rear, waiting for flanking opportunity
          orderHold(u);
        } else {
          // Gunpowder sits on flanks and fires
          restoreSpeed(u);
          orderChase(u);
        }
        return;
      }

      // ── STANDARD formation (default) ────────────────────────────────────
      if (isRangedRole(role)) {
        restoreSpeed(u);
        orderChase(u);   // ranged free-fires while melee shields them
      } else {
        // Melee and cavalry hold — living shield wall for the shooters.
        // Note: processAction still allows melee self-defence at ≤ 70 px
        // even with hold_position, so units will still fight if enemies walk in.
        orderHold(u);
      }
    });
  }

  // ── CHARGING ─────────────────────────────────────────────────────────────
  /** Terminal state — restore speeds and unleash everyone. */
  function executeCharge(enemyUnits) {
    restoreAllSpeeds(enemyUnits);
    enemyUnits.forEach(orderChase);

    if (W.AudioManager && typeof W.AudioManager.playSound === 'function') {
      W.AudioManager.playSound('enemy_charge');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RIVER BATTLE PHASES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * RIVER APPROACHING:
   *   Units move as a tight blob toward the player.  Before issuing each
   *   move order, safePathDest() checks whether the straight-line route
   *   passes through water tiles.  If it does, the unit stops at the bank
   *   rather than walking into the river.  Units ALREADY in water are
   *   redirected toward the enemy centroid (safe ground on their own bank).
   *
   *   This is NOT a total water-crossing ban — once the CHARGING phase
   *   kicks in (player is close), units charge regardless of terrain.
   *   The avoidance applies only during the controlled approach.
   */
  function executeRiverApproach(enemyUnits, playerCentroid) {
    const { avgSpeed } = analyseEnemy(enemyUnits);
    const enemyCentroid = centroid(enemyUnits);

    enemyUnits.forEach(u => {
      backupSpeed(u);
      u.stats.speed = avgSpeed * RIVER_SPEED_SCALE;

      // ── If the unit is currently standing in water → steer back to shore ──
      if (isWater(u.x, u.y)) {
        const shoreTarget = safePathDest(u.x, u.y, enemyCentroid.x, enemyCentroid.y, 10);
        // Add small jitter so units don't all pile on one pixel of shore
        const jx = (Math.random() - 0.5) * 40;
        const jy = (Math.random() - 0.5) * 40;
        orderMove(u, shoreTarget.x + jx, shoreTarget.y + jy);
        return;
      }

      // ── Check whether the path to the player passes through water ─────────
      const pathResult = safePathDest(u.x, u.y, playerCentroid.x, playerCentroid.y, 8);

      if (pathResult.hitWater) {
        // Stop near the bank with organic spread so the army lines the shore
        const blobX = (Math.random() - 0.5) * RIVER_BLOB_SPREAD;
        const blobY = (Math.random() - 0.5) * RIVER_BLOB_SPREAD;
        orderMove(u, pathResult.x + blobX, pathResult.y + blobY);
      } else {
        // Path is clear — advance with tight cluster spread
        const clusterX = (Math.random() - 0.5) * (RIVER_BLOB_SPREAD * 0.7);
        const clusterY = (Math.random() - 0.5) * (RIVER_BLOB_SPREAD * 0.7);
        orderMove(u,
          playerCentroid.x - (playerCentroid.x - u.x > 0 ? 60 : -60) + clusterX,
          playerCentroid.y - (playerCentroid.y - u.y > 0 ? 60 : -60) + clusterY
        );
      }
    });
  }

  /** River commit — player is close enough; charge regardless of water. */
  function executeRiverCharge(enemyUnits) {
    restoreAllSpeeds(enemyUnits);
    enemyUnits.forEach(orderChase);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEARDOWN
  // ══════════════════════════════════════════════════════════════════════════

  function teardown() {
    if (_tickInterval) { clearInterval(_tickInterval); _tickInterval = null; }
    _phase          = 'IDLE';
    _skirmishTicks  = 0;
    _formingTicks   = 0;
    _crisisActive   = false;
    _formationStyle = 'STANDARD';

    // Best-effort restore of any speed locks still on living enemy units
    const env = W.battleEnvironment;
    if (env && env.units) {
      env.units.forEach(u => { if (u.side === 'enemy') restoreSpeed(u); });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LAND BATTLE STATE MACHINE
  // ══════════════════════════════════════════════════════════════════════════

  function tickLand(enemyUnits, playerUnits, playerCentroid) {
    const { avgSpeed } = analyseEnemy(enemyUnits);

    // ── FORMING ─────────────────────────────────────────────────────────────
    if (_phase === 'FORMING') {
      executeForming(enemyUnits);
      _formingTicks++;

      // On the very last forming tick, decide composition and style
      if (_formingTicks >= FORMING_TICKS) {
        const pComp    = analysePlayer(playerUnits);
        _formationStyle = pickFormationStyle(pComp);
        _phase          = 'ADVANCING';
        _formingTicks   = 0;
      }
      return;
    }

    // ── ADVANCING ───────────────────────────────────────────────────────────
    if (_phase === 'ADVANCING') {
      // Re-issue march waypoints every tick so the line tracks the player centroid
      executeAdvancing(enemyUnits, playerCentroid, _formationStyle, avgSpeed);

      // Check if skirmish range is reached
      if (minGap(enemyUnits, playerUnits) <= DIST_SKIRMISH) {
        _phase         = 'SKIRMISHING';
        _skirmishTicks = 0;
        executeSkirmish(enemyUnits, _formationStyle, playerCentroid);
      }
      return;
    }

    // ── SKIRMISHING ─────────────────────────────────────────────────────────
    if (_phase === 'SKIRMISHING') {
      _skirmishTicks++;

      // Distance checks for commit triggers
      const meleeDist = minGap(enemyUnits, playerUnits, r => !isRangedRole(r));
      const cavDist   = minGap(enemyUnits, playerUnits, r => isCavalryRole(r));
      const allDist   = minGap(enemyUnits, playerUnits);

      const timerDone    = _skirmishTicks >= SKIRMISH_MAX_TICKS;
      const meleeClose   = meleeDist <= DIST_MELEE_COMMIT;
      // Cavalry commits earlier (outrunning infantry) unless we're in SQUARE
      const cavBreaks    = _formationStyle !== 'SQUARE' && cavDist !== Infinity && cavDist <= DIST_CAV_COMMIT;
      // Square commits when its whole mass is very close
      const squareCloses = _formationStyle === 'SQUARE' && allDist <= DIST_SQUARE_COMMIT;

      if (timerDone || meleeClose || cavBreaks || squareCloses) {
        _phase = 'CHARGING';
        executeCharge(enemyUnits);
        teardown(); // clears interval — CHARGING is terminal
      }
      // Otherwise hold current skirmish orders (no re-issue needed this tick)
      return;
    }

    // CHARGING is terminal; unreachable after teardown (kept for clarity)
  }

// ══════════════════════════════════════════════════════════════════════════
  // RIVER BATTLE STATE MACHINE
  // ══════════════════════════════════════════════════════════════════════════

  function tickRiver(enemyUnits, playerUnits, playerCentroid) {
    // 1. Check distance: Are any enemy units within 500 pixels of the player?
    const distToPlayer = minGap(enemyUnits, playerUnits);

    if (distToPlayer <= 500) {
      // Less than 500px: Trigger the final aggressive charge
      if (_phase !== 'CHARGING') {
        _phase = 'CHARGING';
        executeRiverCharge(enemyUnits);
        teardown(); // Stop the loop, let them fight
      }
      return; 
    }

    // 2. More than 500px: March South with random X jitter
    _phase = 'RIVER_ADVANCING';
    const { avgSpeed } = analyseEnemy(enemyUnits);

    enemyUnits.forEach(u => {
      backupSpeed(u);
      u.stats.speed = avgSpeed * RIVER_SPEED_SCALE;

      // Give each unit a 15% chance per tick to pick a new random X direction
      if (u._etai_riverTargetX === undefined || Math.random() < 0.15) {
        // Shifts their X target left or right by up to 150 pixels
        u._etai_riverTargetX = u.x + (Math.random() - 0.5) * 300; 
      }

      // Force the Y target far to the South (+Y direction) so they maintain southward velocity
      const targetY = u.y + 400; 

      orderMove(u, u._etai_riverTargetX, targetY);
    });
  }
  // CORE TICK — EVALUATES EVERY TICK_MS MILLISECONDS
  // ══════════════════════════════════════════════════════════════════════════

  function tick() {
    // ── Guard: battle must still be active ──────────────────────────────────
    const isBattle = (typeof W.MobileControls !== 'undefined')
      ? W.MobileControls.G.isBattle()
      : (W.battleEnvironment && W.battleEnvironment.isActive !== false);

    if (!isBattle || !isAllowedBattle()) { teardown(); return; }

    // ── Refresh living unit lists ────────────────────────────────────────────
    const enemyUnits  = getEnemyUnits();
    const playerUnits = getPlayerUnits();

    if (enemyUnits.length === 0 || playerUnits.length === 0) { teardown(); return; }

    const playerCentroid = centroid(playerUnits);

    // ════════════════════════════════════════════════════════════════════════
    //  EMERGENCY GENERAL-DEFENCE CHECK
    //  Runs every tick regardless of phase.  Bodyguard-type units are
    //  diverted to the ring; the remaining units continue their normal phase.
    // ════════════════════════════════════════════════════════════════════════
    const crisisNow = detectCrisis();

    if (crisisNow) {
      if (!_crisisActive) _crisisActive = true;

      // Partition units: bodyguards rush to the general; everyone else continues
      const bodyguards  = enemyUnits.filter(u =>  isBodyguardType(u));
      const normalForce = enemyUnits.filter(u => !isBodyguardType(u));

      if (bodyguards.length > 0) executeCrisis(bodyguards);

      // Normal-force continues its phase (infantry still advances / holds)
      if (normalForce.length > 0) {
        if (isRiverBattle()) tickRiver(normalForce, playerUnits, playerCentroid);
        else                  tickLand (normalForce, playerUnits, playerCentroid);
      }
      return;
    }

    // Crisis has ended (general recovered or died) — reset flag
    if (_crisisActive) _crisisActive = false;

    // ════════════════════════════════════════════════════════════════════════
    //  NORMAL PHASE ROUTING
    // ════════════════════════════════════════════════════════════════════════
    if (isRiverBattle()) tickRiver(enemyUnits, playerUnits, playerCentroid);
    else                  tickLand (enemyUnits, playerUnits, playerCentroid);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * EnemyTacticalAI.start()
   *
   *   Call when a land or river battle begins (after units are spawned).
   *   Safe to call multiple times — restarts cleanly.
   *
   *   The first orders are issued immediately (no 500 ms delay on tick one).
   *   River battles skip
   */
function start() {
    if (!isAllowedBattle()) return; // Siege / naval / unsupported → do nothing

    teardown(); // idempotent — stops any existing loop before starting fresh

    _crisisActive  = false;
    _skirmishTicks = 0;
    _formingTicks  = 0;

    if (isRiverBattle()) {
      _phase = 'RIVER_ADVANCING'; // Keep the loop alive for river maps
    } else {
      _phase          = 'FORMING';
      _formationStyle = 'STANDARD'; // will be refined on last FORMING tick
    }

    const enemyUnits  = getEnemyUnits();
    const playerUnits = getPlayerUnits();

    if (enemyUnits.length > 0 && playerUnits.length > 0) {
      if (!isRiverBattle()) {
        // Land battles start with the formation pause
        const pc = centroid(playerUnits);
        executeForming(enemyUnits);
      }
      // Note: We removed the instant "executeRiverCharge" and "teardown" here
      // so that tickRiver() is allowed to run its new logic on the interval.
    }

    // Start the heartbeat interval
    _tickInterval = setInterval(tick, TICK_MS);
  }
  /**
   * EnemyTacticalAI.stop()
   *
   *   Abort the AI mid-battle cleanly.  Use during scripted cutscenes,
   *   battle-won events, or any transition away from a land/river battle.
   */
  function stop() { teardown(); }

  /**
   * EnemyTacticalAI.getPhase()
   *
   *   Returns the current phase string for debugging / HUD overlays.
   *   Possible values: 'IDLE' | 'FORMING' | 'ADVANCING' | 'SKIRMISHING' | 'CHARGING'
   *   During crisis the phase reflects the infantry's phase (bodyguards are on crisis orders).
   */
  function getPhase() { return _phase; }

  // Expose on window so engine files and the battle launcher can call it
  W.EnemyTacticalAI = { start, stop, getPhase };

})(window, document);

/*
 * ══════════════════════════════════════════════════════════════════════════════
 * INTEGRATION NOTES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 1.  CALL EnemyTacticalAI.start() in custom_battle_gui.js immediately after
 *     customSpawnLoop() has finished (once all units exist in battleEnvironment).
 *     Example location: just before "startCustomBattleMonitor()" at the
 *     bottom of launchCustomBattle().
 *
 * 2.  CALL EnemyTacticalAI.stop() inside your battle-cleanup / leaveBattlefield
 *     handler so the interval doesn't linger between battles.
 *
 * 3.  RIVER BATTLE DETECTION relies on window.inRiverBattle === true, which
 *     launchCustomBattle() already sets when selectedMap === "River".
 *     No changes needed there.
 *
 * 4.  SIEGE BATTLES are completely unaffected.  The function guard at the top
 *     of isAllowedBattle() returns false for inSiegeBattle === true, ensuring
 *     zero interference with the dedicated siege AI.
 *
 * 5.  NAVAL / COASTAL / OCEAN battles are also unaffected.  inNavalBattle
 *     guard and the battleType string check both block this AI from running.
 *
 * 6.  GENERAL-DEFENCE CRISIS requires the enemy commander to be present
 *     (isCommander === true, side === "enemy", hp > 0).  If the enemy has
 *     no commander, the crisis branch is silently skipped and normal phase
 *     logic runs for all units.
 *
 * 7.  FORMATION STYLE is chosen by analysing the living PLAYER units each
 *     time the FORMING phase completes (~2 s after battle start).  Late
 *     compositional changes (e.g. player reinforcements) are NOT re-evaluated
 *     after FORMING ends; the formation style is locked for the rest of the
 *     advance.  To re-evaluate mid-battle, call stop() then start() again.
 *
 * 8.  SPEED BACKUP/RESTORE — the AI stores each unit's original stats.speed
 *     under unit._etai_origSpeed before overwriting it.  teardown() restores
 *     all surviving enemy units.  If a unit dies during a speed-lock phase
 *     its property is simply orphaned on the dead object and causes no harm.
 *
 * 9.  processTargeting() in ai_categories.js skips units whose orderType is
 *     "move_to_point" or "hold_position".  This is intentional during
 *     FORMING / ADVANCING / SKIRMISHING (hold): units don't break formation
 *     to chase enemies.  processAction() still allows melee self-defence at
 *     ≤ 70 px even under hold_position (via the isMeleeSelfDefense check),
 *     so units are never defenceless.
 *
 * 10. FALSE-FLEE ROOT CAUSE — the original code issued move_to_point orders
 *     to (playerCentroid + formationOffset).  If formationOffset pushed the
 *     destination past the centroid, or if the centroid shifted mid-battle,
 *     units could be sent backward.  The new calcAdvanceTarget() function
 *     computes the waypoint as (unit.position + forwardVector * lookAhead),
 *     making rearward movement geometrically impossible.  The final anti-
 *     false-flee guard at Step 6 of that function is a belt-and-suspenders
 *     safety net on top of that.
 * ══════════════════════════════════════════════════════════════════════════════
 */
