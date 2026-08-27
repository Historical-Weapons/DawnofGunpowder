/**
 * enemyLandStrategyAI.js  ─  ENEMY LAND STRATEGY ENGINE  (v1.0)
 * ============================================================================
 *  A higher-level *strategic* AI layer that REPLACES the LAND-battle branch of
 *  the older EnemyTacticalAI for normal (non-siege, non-naval, non-river)
 *  battles.  River, naval, and siege battles are explicitly handed back to the
 *  legacy AI -- this file ONLY changes how the enemy fights on open land.
 *
 *  The enemy commander (processEnemyCommanderAI) continues to run unchanged.
 *  Siege equipment, naval crews, dummies and the enemy general are all
 *  excluded the same way the legacy AI excluded them.
 *
 *  KEY UPGRADES OVER LEGACY TACTICAL AI
 *  ------------------------------------
 *  1. COMPOSITION-AWARE DOCTRINE
 *       Both armies are scored into 6 buckets:
 *           melee_cav     (lancers, knights, melee horse)
 *           ranged_cav    (horse archers, mounted gunners)
 *           melee_inf     (swordsmen, spears, halberds...)
 *           ranged_inf    (archers, crossbows)
 *           gunpowder     (firelance, handgunners, bombards-on-foot)
 *           shields       (shieldbearers / heavy infantry with shield flag)
 *       A *doctrine* (battle plan) is selected from the ratios of the PLAYER
 *       buckets vs the enemy buckets:
 *           ANTI_CAV_RING       -> player melee_cav heavy
 *           SKIRMISH_HUNT       -> player ranged_cav heavy
 *           SHIELD_PUSH         -> player ranged heavy
 *           HAMMER_AND_ANVIL    -> player infantry heavy, enemy has cav
 *           COMBINED_ARMS       -> balanced default
 *           DEFENSIVE_HOLD      -> player vastly outnumbers / outranges
 *
 *  2. PERSONALITY VARIANCE
 *       At battle start the AI rolls one of five personalities:
 *           AGGRESSIVE   -- short skirmish, fast commits, low retreat
 *           TIMID        -- long skirmish, holds longer, kites
 *           BALANCED     -- middle of the road
 *           FEINT        -- advances then pulls back once before committing
 *           OPPORTUNIST  -- commits the instant any player unit is isolated
 *       This makes successive battles *feel different* even with the same army.
 *
 *  3. GROUP ORCHESTRATION
 *       Units are sorted into named GROUPS each tick:
 *           FRONT_LINE   = shields + melee infantry
 *           SHOOTERS     = ranged infantry + gunpowder
 *           HEAVY_CAV    = melee cavalry
 *           LIGHT_CAV    = ranged cavalry (horse archers)
 *       Each group has its own micro-routine.  The shooters always have an
 *       *escort assignment* -- the nearest FRONT_LINE units are tagged to stay
 *       in front of them.  Heavy cav waits behind/flank until the front line
 *       has bled the player line, then flanks.  Light cav kites freely at
 *       ideal range.
 *
 *  4. MOBILE-FRIENDLY THROTTLING
 *       One strategy tick = STRAT_TICK_MS (default 500 ms).  Per-unit micro
 *       updates are issued only on relevant strategy ticks; in-between the
 *       engine handles motion and combat using the standing order.
 *       Hot paths use Math.hypot only when necessary; squared distances are
 *       used for sorts/filters.
 *
 *  5. MODULAR / DROP-IN
 *       Loads after enemyTacticalAI.js in index.html.  At start() it patches
 *       the global EnemyTacticalAI public API so existing callers
 *       (battlefield_launch.js, battlefield_logic.js cleanup) continue working
 *       with zero edits required.  If the battle is river/siege/naval, the
 *       call is forwarded to the legacy implementation.
 *
 *  6. POST-CHARGE COHESION (regrouping during ongoing melee)
 *       CHARGING is still a single irreversible commit -- every unit gets
 *       one orderChase and the engine's own combat loop takes it from there.
 *       What's NEW is that the strategy AI no longer tears itself down the
 *       instant that happens. A slower "COHESION" heartbeat (~1 Hz instead
 *       of the normal 2 Hz) keeps running for the rest of the battle. It
 *       NEVER touches a unit that is currently fighting (engine state
 *       "attacking", or already adjacent to a live target) -- it only acts
 *       on units that have finished a fight or never found one and have
 *       drifted away from every ally. Those get walked back toward the
 *       nearest friendly cluster instead of wandering solo or freezing.
 *       This is what actually produces visible "regrouping" once the lines
 *       have crashed together, instead of every unit being on its own for
 *       good the moment the charge begins.
 *
 *  ENGINE SURFACE
 *  --------------
 *  Same as the legacy AI:
 *      window.battleEnvironment.units[] / .grid / .battleType
 *      window.inSiegeBattle / window.inNavalBattle / window.inRiverBattle
 *      unit.side / unit.hp / unit.x / unit.y / unit.stats
 *      unit.orderType / unit.orderTargetPoint / unit.hasOrders / unit.target
 *      unit.isCommander / unit.isDummy / unit.disableAICombat / unit.isSiege
 *      window.getTacticalRole(unit) (preferred), fallback to local resolver
 *      window.BATTLE_WORLD_WIDTH / window.BATTLE_WORLD_HEIGHT
 *      window.MobileControls.G.isBattle()  (optional)
 *      window.AudioManager.playSound(key)  (optional)
 * ============================================================================
 */

;(function (W) {
  'use strict';

  // ════════════════════════════════════════════════════════════════════════
  //  TUNABLE CONSTANTS
  // ════════════════════════════════════════════════════════════════════════
  const STRAT_TICK_MS         = 500;   // strategy heartbeat (2 Hz)
  const MICRO_TICK_DIVISOR    = 1;     // micro orders every Nth strat tick (1=every)
  const FORMING_TICKS         = 4;     // ~2 s if not skipped
  const SKIRMISH_MAX_TICKS    = 18;    // upper bound on skirmish phase (~9 s)

  // Distance thresholds (world-px)
  const DIST_SKIRMISH         = 600;
  const DIST_MELEE_COMMIT     = 170;
  const DIST_HEAVYCAV_COMMIT  = 270;
  const DIST_RING_COMMIT      = 220;

  // Formation spread (world-px)
  const SPREAD_FRONT_X        = 42;    // horizontal spacing between front-liners
  const SPREAD_SHOOTER_BACK   = 80;    // shooter line behind front
  const SPREAD_HEAVYCAV_BACK  = 220;   // heavy cav held back this far
  const SPREAD_HEAVYCAV_FLANK = 280;   // heavy cav flank offset (perp)
  const SPREAD_LIGHTCAV_KITE  = 320;   // ideal stand-off for light cav (px from nearest threat)
  const SPREAD_LIGHTCAV_MIN   = 190;   // minimum gap: retreat if closer than this
  const SPREAD_LIGHTCAV_MAX   = 420;   // maximum gap: close in if farther than this
  const LIGHTCAV_ORBIT_STEP   = 260;   // px per kite-arc step (tangential movement)
  const RANGED_INF_FLEE_TRIGGER_DIST = 110; // foot shooters retreat once a melee threat closes inside this
  const RANGED_INF_FLEE_DIST         = 130; // distance covered per retreat step
  const ADVANCE_LOOK_AHEAD    = 480;
  const ADVANCE_STOP_BUFFER   = 95;
  const ADVANCE_SPEED_SCALE   = 0.65;

  // Hammer & Anvil
  const ANVIL_ENGAGE_DIST     = 130;   // front line must be this close before hammer drops
  const HAMMER_FLANK_LEAD     = 220;   // hammer aims this far past player flank

  // General-defence (kept from legacy behaviour)
  const GENERAL_CRISIS_HP     = 0.50;
  const BODYGUARD_RING_RADIUS = 95;
  const BODYGUARD_RUSH_BONUS  = 1.25;

  // ── POST-CHARGE COHESION (regrouping during ongoing melee) ───────────────
  // CHARGING used to be terminal -- this AI tore itself down the instant the
  // army committed, leaving every unit to fend for itself via the engine's
  // dumb per-unit nearest-target scan for the rest of the battle (no
  // coordination, no reaction to how the fight develops). COHESION keeps a
  // much lighter heartbeat running afterward: it never interrupts a unit
  // that's actually fighting, but it pulls back stragglers/lone units who
  // have drifted away from any ally and aren't currently engaged, so the
  // army keeps presenting *some* shape instead of fully dissolving.
  const COHESION_TICK_MS       = 900;   // slower heartbeat once melee is general (less CPU, less micromanagement)
  const COHESION_LONE_RADIUS   = 260;   // a unit with no ally within this radius is "isolated"
  const COHESION_ENGAGED_DIST  = 70;    // unit within this of a live enemy target counts as "in combat" -- leave it alone
  const COHESION_REGROUP_SPEED = 1.0;   // full speed home to the nearest cluster
  const COHESION_MIN_GROUP     = 2;     // don't bother regrouping if fewer than this many strays exist

  // Personality modifiers (multipliers on base thresholds)
  const PERSONALITIES = {
    AGGRESSIVE : { skirmishTicks: 0.55, commitDist: 1.20, retreatGain: 0.70, hammerHold: 0.60, kiteRange: 0.85 },
    TIMID      : { skirmishTicks: 1.50, commitDist: 0.80, retreatGain: 1.30, hammerHold: 1.40, kiteRange: 1.15 },
    BALANCED   : { skirmishTicks: 1.00, commitDist: 1.00, retreatGain: 1.00, hammerHold: 1.00, kiteRange: 1.00 },
    FEINT      : { skirmishTicks: 1.20, commitDist: 0.90, retreatGain: 1.10, hammerHold: 1.10, kiteRange: 1.00 },
    OPPORTUNIST: { skirmishTicks: 0.85, commitDist: 1.05, retreatGain: 0.85, hammerHold: 0.75, kiteRange: 0.95 },
  };

  // ════════════════════════════════════════════════════════════════════════
  //  MODULE STATE
  // ════════════════════════════════════════════════════════════════════════
  let _tickInterval     = null;
  let _cohesionInterval = null;  // separate, slower heartbeat that runs DURING/after CHARGING
  let _phase            = 'IDLE';   // IDLE|FORMING|ADVANCING|SKIRMISHING|CHARGING|COHESION
  let _formingTicks     = 0;
  let _skirmishTicks    = 0;
  let _doctrine         = 'COMBINED_ARMS';
  let _formationShape   = 'LINE';   // LINE | BLOCK -- see pickFormationShape()
  let _personality      = 'BALANCED';
  let _personalityMod   = PERSONALITIES.BALANCED;
  let _crisisActive     = false;
  let _routedToLegacy   = false;   // when river/etc, hand off to legacy AI
  let _feintTriggered   = false;   // FEINT personality state
  let _feintTickAt      = 0;
  let _strategyTick     = 0;

  // ════════════════════════════════════════════════════════════════════════
  //  BATTLE CONTEXT GUARDS
  // ════════════════════════════════════════════════════════════════════════
  function isSiegeBattle () { return (typeof W.inSiegeBattle  !== 'undefined') && W.inSiegeBattle;  }
  function isNavalBattle () { return (typeof W.inNavalBattle  !== 'undefined') && W.inNavalBattle;  }
  function isRiverBattle () { return (typeof W.inRiverBattle  !== 'undefined') && W.inRiverBattle;  }

  /** This new AI ONLY handles LAND (non-river, non-siege, non-naval). */
  function isLandBattle () {
    if (isSiegeBattle() || isNavalBattle() || isRiverBattle()) return false;
    const env = W.battleEnvironment;
    if (!env) return false;
    const bt = String(env.battleType || 'land').toLowerCase();
    if (bt.includes('coastal') || bt.includes('ocean') || bt.includes('siege') || bt.includes('river')) return false;
    return true;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  ROLE RESOLUTION
  // ════════════════════════════════════════════════════════════════════════
  const _LANCER_RE  = /(lancer|keshig|knight|cataphract|mamluk)/i;
  const _HORSE_A_RE = /(horse[_ ]?archer|mounted[_ ]?archer|skirmish[_ ]?cav)/i;
  const _GUN_RE     = /(firelance|bomb|rocket|gunner|handgun|musket|hand[_ ]?cannon)/i;
  const _SHIELD_RE  = /(shield|spear[_ ]?wall|hoplite|pavise)/i;

  /** Returns broad role: INFANTRY / CAVALRY / RANGED / GUNPOWDER (engine compat) */
  function resolveBroadRole (unit) {
    if (typeof W.getTacticalRole === 'function') return W.getTacticalRole(unit);
    const r = String((unit.stats && unit.stats.role) || '').toUpperCase();
    const t = String((unit.unitType || (unit.stats && unit.stats.name) || '')).toUpperCase();
    if (unit.stats && unit.stats.isLarge) return 'CAVALRY';
    if (/(CAV|HORSE|MOUNTED|CAMEL|ELEPH|LANCER|KESHIG)/.test(t) || /(CAVALRY)/.test(r)) return 'CAVALRY';
    if (_GUN_RE.test(t) || /(GUNPOWDER|BOMB)/.test(r)) return 'GUNPOWDER';
    if ((unit.stats && unit.stats.isRanged) || /(ARCHER|BOW|CROSSBOW|SLINGER)/.test(t) || /(RANGED)/.test(r)) return 'RANGED';
    return 'INFANTRY';
  }

  /**
   * Returns the strategic sub-role used by THIS AI:
   *   MELEE_CAV / RANGED_CAV / MELEE_INF / RANGED_INF / GUNPOWDER / SHIELD
   * Each unit gets one and only one sub-role.
   */
  function resolveSubRole (unit) {
    const broad = resolveBroadRole(unit);
    const typeStr = String((unit.unitType || (unit.stats && unit.stats.name) || '')).toLowerCase();
    const roleStr = String((unit.stats && unit.stats.role) || '').toLowerCase();
    const isUnitRanged = !!(unit.stats && unit.stats.isRanged);

    if (broad === 'CAVALRY') {
      if (isUnitRanged || _HORSE_A_RE.test(typeStr) || _HORSE_A_RE.test(roleStr)) return 'RANGED_CAV';
      return 'MELEE_CAV';
    }
    if (broad === 'GUNPOWDER') return 'GUNPOWDER';
    if (broad === 'RANGED')    return 'RANGED_INF';
    // INFANTRY
    if (_SHIELD_RE.test(typeStr) || _SHIELD_RE.test(roleStr)) return 'SHIELD';
    return 'MELEE_INF';
  }

  // ════════════════════════════════════════════════════════════════════════
  //  UNIT FILTERS
  // ════════════════════════════════════════════════════════════════════════
  const SIEGE_ROLES = new Set([
    'SIEGE','CATAPULT','BALLISTA','TREBUCHET','CANNON','BOMBARD','MORTAR',
    'RAM','SIEGE_TOWER','FIRE_SHIP','GALLEY_SIEGE','ROCKET_BATTERY','SIEGE_CREW'
  ]);

  function isExcludedEnemy (u) {
    if (u.side !== 'enemy')       return true;
    if (!(u.hp > 0))              return true;
    if (u.isCommander)            return true; // commander AI separate
    if (u.isDummy)                return true;
    if (u.disableAICombat)        return true;
    if (u.isSiege)                return true;
    const rl = String((u.stats && u.stats.role) || '').toUpperCase();
    if (SIEGE_ROLES.has(rl))      return true;
    return false;
  }

  function getEnemyUnits () {
    const env = W.battleEnvironment;
    if (!env || !env.units) return [];
    const out = [];
    for (let i = 0; i < env.units.length; i++) {
      const u = env.units[i];
      if (!isExcludedEnemy(u)) out.push(u);
    }
    return out;
  }

  function getPlayerUnits () {
    const env = W.battleEnvironment;
    if (!env || !env.units) return [];
    const out = [];
    for (let i = 0; i < env.units.length; i++) {
      const u = env.units[i];
      if (u.side === 'player' && u.hp > 0 && !u.isDummy) out.push(u);
    }
    return out;
  }

  function findEnemyGeneral () {
    const env = W.battleEnvironment;
    if (!env || !env.units) return null;
    for (let i = 0; i < env.units.length; i++) {
      const u = env.units[i];
      if (u.isCommander && u.side === 'enemy' && u.hp > 0) return u;
    }
    return null;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  GEOMETRY
  // ════════════════════════════════════════════════════════════════════════
  function centroid (units) {
    if (!units.length) return { x: 0, y: 0 };
    let sx = 0, sy = 0;
    for (let i = 0; i < units.length; i++) { sx += units[i].x; sy += units[i].y; }
    return { x: sx / units.length, y: sy / units.length };
  }

  function dist (a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  /** Squared distance for fast sorting/filtering. */
  function dist2 (a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx*dx + dy*dy; }

  function clampToMap (x, y, margin) {
    margin = margin || 60;
    const mW = (typeof W.BATTLE_WORLD_WIDTH  !== 'undefined') ? W.BATTLE_WORLD_WIDTH  : 2400;
    const mH = (typeof W.BATTLE_WORLD_HEIGHT !== 'undefined') ? W.BATTLE_WORLD_HEIGHT : 2400;
    return {
      x: Math.max(margin, Math.min(mW - margin, x)),
      y: Math.max(margin, Math.min(mH - margin, y)),
    };
  }

  function safePoint (x, y, margin) {
    if (typeof W.getSafeMapCoordinates === 'function') return W.getSafeMapCoordinates(x, y, margin);
    return clampToMap(x, y, margin);
  }

  /**
   * Minimum gap from any enemy in `enemyArr` to any player in `playerArr`.
   * Optional filter(u) -> bool to scope which enemies count.
   */
  function minGap (enemyArr, playerArr, filterFn) {
    let m2 = Infinity;
    for (let i = 0; i < enemyArr.length; i++) {
      const e = enemyArr[i];
      if (filterFn && !filterFn(e)) continue;
      for (let j = 0; j < playerArr.length; j++) {
        const d2 = dist2(e, playerArr[j]);
        if (d2 < m2) m2 = d2;
      }
    }
    return (m2 === Infinity) ? Infinity : Math.sqrt(m2);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  COMPOSITION ANALYSIS
  // ════════════════════════════════════════════════════════════════════════
  function emptyComp () {
    return {
      total: 0, melee_cav: 0, ranged_cav: 0, melee_inf: 0, ranged_inf: 0,
      gunpowder: 0, shield: 0, avgSpeed: 0
    };
  }

  function analyseComposition (units) {
    const c = emptyComp();
    if (!units.length) return c;
    let totalSpd = 0;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const sub = resolveSubRole(u);
      c[sub.toLowerCase()] = (c[sub.toLowerCase()] || 0) + 1;
      totalSpd += (u.stats && u.stats.speed) ? u.stats.speed : 2;
    }
    c.total    = units.length;
    c.avgSpeed = Math.max(1, totalSpd / units.length);
    // Convenience ratios
    c.r_melee_cav  = c.melee_cav  / c.total;
    c.r_ranged_cav = c.ranged_cav / c.total;
    c.r_melee_inf  = c.melee_inf  / c.total;
    c.r_ranged_inf = c.ranged_inf / c.total;
    c.r_gunpowder  = c.gunpowder  / c.total;
    c.r_shield     = c.shield     / c.total;
    c.r_total_cav  = (c.melee_cav + c.ranged_cav) / c.total;
    c.r_total_rng  = (c.ranged_inf + c.gunpowder + c.ranged_cav) / c.total;
    c.r_total_mel  = (c.melee_inf + c.shield + c.melee_cav) / c.total;
    return c;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  DOCTRINE SELECTION
  // ════════════════════════════════════════════════════════════════════════
  /**
   * Pick a doctrine based on player composition + own composition.
   * The doctrine is locked at battle start (re-evaluated only on stop/start).
   */
  function pickDoctrine (playerComp, enemyComp) {
    // 1. Massive cavalry threat -> anti-cav ring (only if we have ranged worth protecting)
    if (playerComp.r_melee_cav >= 0.50 && (enemyComp.r_ranged_inf + enemyComp.r_gunpowder) >= 0.20) {
      return 'ANTI_CAV_RING';
    }
    // 2. Horse archer heavy -> hunt them with our own cav, tight shield wall
    if (playerComp.r_ranged_cav >= 0.35) {
      return 'SKIRMISH_HUNT';
    }
    // 3. Player is mostly ranged on foot -> shield push them down
    if ((playerComp.r_ranged_inf + playerComp.r_gunpowder) >= 0.50) {
      return 'SHIELD_PUSH';
    }
    // 4. Player is mostly infantry, and we have cavalry -> hammer & anvil.
    //    Use a low cav threshold (10%) -- even a token cavalry force is enough
    //    to make hammer-and-anvil the better choice than a flat infantry brawl.
    if ((playerComp.r_melee_inf + playerComp.r_shield) >= 0.55 && enemyComp.r_melee_cav >= 0.10) {
      return 'HAMMER_AND_ANVIL';
    }
    // 5. Heavy underdog -> defensive hold (waiting for the player to overextend)
    if (enemyComp.total > 0 && playerComp.total / enemyComp.total >= 1.5) {
      return 'DEFENSIVE_HOLD';
    }
    // 6. Default
    return 'COMBINED_ARMS';
  }

  function pickPersonality () {
    // Weighted random: balanced/aggressive most common, others rarer for variety
    const r = Math.random();
    if (r < 0.32) return 'BALANCED';
    if (r < 0.55) return 'AGGRESSIVE';
    if (r < 0.75) return 'TIMID';
    if (r < 0.88) return 'OPPORTUNIST';
    return 'FEINT';
  }

  // ════════════════════════════════════════════════════════════════════════
  //  FORMATION SHAPE SELECTION
  // ════════════════════════════════════════════════════════════════════════
  /**
   * Picks how the FRONT_LINE (shield/melee infantry) arranges itself:
   *   LINE  -- a single wide rank (existing default). Needed whenever there
   *            are ranged/gunpowder allies behind that need a wall to screen
   *            them, or against a heavy-cavalry threat that a thin line is
   *            actually better suited to spread out and absorb without
   *            collapsing all at once.
   *   BLOCK -- a tight, multi-rank grid. Realistic when the enemy force is
   *            mostly a pure melee blob with little or no ranged of its own
   *            to protect — a dense block hits harder per square foot of
   *            frontage and isn't leaving a backline exposed for nothing.
   * A personality-driven random nudge is layered on top of the composition
   * threshold so two battles with near-identical compositions don't always
   * resolve to the same shape — real opposing commanders wouldn't always
   * make the identical call at the margin either.
   */
  function pickFormationShape (enemyComp, personality) {
    const screenNeed = enemyComp.r_ranged_inf + enemyComp.r_gunpowder;
    const heavyCavThreat = enemyComp.r_melee_cav; // own cav ratio isn't relevant here, kept simple/composition-only

    // Strong signal either way: no ambiguity, no randomness needed.
    if (screenNeed >= 0.30) return 'LINE';   // meaningful ranged backline to screen -> must use a wide wall
    if (screenNeed <= 0.05 && enemyComp.r_total_mel >= 0.70) return 'BLOCK'; // near-pure melee blob -> go dense

    // Marginal case: lean on personality + a random nudge instead of a hard
    // deterministic cutoff, so otherwise-identical compositions can still
    // produce different formations from battle to battle.
    const aggressiveBias = (personality === 'AGGRESSIVE' || personality === 'OPPORTUNIST') ? 0.20 : 0;
    const timidBias       = (personality === 'TIMID') ? -0.20 : 0;
    const roll = Math.random() + aggressiveBias + timidBias;
    return (roll >= 0.5) ? 'BLOCK' : 'LINE';
  }

  // ════════════════════════════════════════════════════════════════════════
  //  CAVALRY PREY SCORING  (shared with the SKIRMISHING-phase approach maneuver)
  // ════════════════════════════════════════════════════════════════════════
  /**
   * Mirrors the perpetual scoring bias added to ai_categories.js's enemy
   * seek_engage handler (rout preference + anti-cavalry-stat avoidance), so
   * the strategic layer's pre-charge MANEUVERING (safe, multi-tick, during
   * SKIRMISHING) walks heavy cavalry toward the same kind of target the
   * always-on low-level scan will keep preferring for the rest of the fight
   * once CHARGING hands off combat entirely to that scan. Keeping both
   * layers aligned on the same criteria means cavalry arrive ALREADY close
   * to a good target instead of needing a second chance to correct course
   * that — by design — they will never get (CHARGING only runs once).
   *
   * Returns the best available player unit to approach, or null if every
   * candidate is either out of range entirely or this list is empty.
   */
  function scoreCavalryProspect (cavUnit, candidate) {
    const d = dist(cavUnit, candidate);
    let score = d;
    if (candidate.state === 'FLEEING' || candidate.state === 'WAVERING') score -= 220;
    const sub = resolveSubRole(candidate);
    const antiCav = Math.max(
      (candidate.stats && candidate.stats.bonusVsLarge) || 0,
      (candidate.stats && candidate.stats.antiLargeDamage) || 0
    );
    score += antiCav * 14;
    if ((sub === 'RANGED_INF' || sub === 'GUNPOWDER') && antiCav < 15) score -= 110;
    return score;
  }

  function pickCavalryProspect (cavUnit, playerUnits) {
    let best = null, bestScore = Infinity;
    for (let i = 0; i < playerUnits.length; i++) {
      const p = playerUnits[i];
      if (p.hp <= 0 || p.isDummy) continue;
      const s = scoreCavalryProspect(cavUnit, p);
      if (s < bestScore) { bestScore = s; best = p; }
    }
    return best;
  }

  /**
   * Computes a SKIRMISHING-phase (multi-tick-safe) approach waypoint that
   * swings wide of the player's front-line mass instead of beelining
   * straight through it to reach a backline prospect. Falls back to the
   * supplied default (fx, fy) — the existing flank-the-centroid point — if
   * no prospect can be identified, so behaviour degrades gracefully rather
   * than producing a nonsensical waypoint.
   */
  function calcCavalryHuntWaypoint (cavUnit, prospect, frontCentroid, fallbackX, fallbackY) {
    if (!prospect) return { x: fallbackX, y: fallbackY };
    const fdx = prospect.x - frontCentroid.x;
    const fdy = prospect.y - frontCentroid.y;
    const L = Math.hypot(fdx, fdy) || 1;
    const sideX = fdx / L, sideY = fdy / L;
    const swingDist = 150; // how far past the prospect, continuing the same lateral direction, to swing wide
    return { x: prospect.x + sideX * swingDist, y: prospect.y + sideY * swingDist };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  SPEED MANAGEMENT  (kept compatible with legacy markers)
  // ════════════════════════════════════════════════════════════════════════
  function backupSpeed (u) {
    if (u._elsai_origSpeed === undefined && u.stats) u._elsai_origSpeed = u.stats.speed;
  }
  function restoreSpeed (u) {
    if (u._elsai_origSpeed !== undefined && u.stats) {
      u.stats.speed = u._elsai_origSpeed;
      delete u._elsai_origSpeed;
    }
    // Defensive: also clear legacy marker if it exists from a prior battle.
    if (u._etai_origSpeed !== undefined && u.stats) {
      u.stats.speed = u._etai_origSpeed;
      delete u._etai_origSpeed;
    }
  }
  function restoreAllSpeeds (units) { for (let i=0;i<units.length;i++) restoreSpeed(units[i]); }

  function setSpeedScale (u, scale) {
    backupSpeed(u);
    if (u.stats && u._elsai_origSpeed !== undefined) {
      u.stats.speed = u._elsai_origSpeed * scale;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  ORDER PRIMITIVES  (engine-compatible, dummy-target synthesized)
  // ════════════════════════════════════════════════════════════════════════
  function orderMove (unit, tx, ty) {
    const safe = clampToMap(tx, ty);
    unit.hasOrders        = true;
    unit.orderType        = 'move_to_point';
    unit.orderTargetPoint = safePoint(safe.x, safe.y);
    unit.reactionDelay    = 0;
    // Synthesize the dummy target that ai_categories.js's move_to_point branch
    // needs in order to animate movement (see legacy AI comments for the long
    // explanation -- enemy units aren't processed by processTacticalOrders,
    // so we must do this here, exactly as the legacy AI did).
    unit.target = {
      x: safe.x,
      y: safe.y,
      hp: 9999,
      isDummy: true,
      stats: { meleeDefense: 0, armor: 0, health: 9999 },
    };
  }

  function orderHold (unit) {
    unit.hasOrders        = true;
    unit.orderType        = 'hold_position';
    unit.vx               = 0;
    unit.vy               = 0;
    unit.orderTargetPoint = safePoint(unit.x, unit.y, 15);
    // CRITICAL: clear the stale dummy target left over from a previous
    // orderMove() call.  If we don't, the engine's combat block (in
    // ai_categories.processAction) computes dist against the old dummy
    // (often 500+ px away) and the unit stands frozen — never engaging
    // real enemies that walk into self-defence range.  Setting to null
    // forces the engine's nearest-enemy scanner (allowed for hold units
    // via the random retarget at processTargeting's tail) to find a
    // real player unit; combined with the hold_position 100%-range
    // engage rule, ranged units will fire at full range while held.
    if (unit.target && unit.target.isDummy) unit.target = null;
  }

  function orderChase (unit) {
    unit.hasOrders        = true;
    unit.orderType        = 'seek_engage';
    unit.orderTargetPoint = null;
    // Clear any stale dummy; engine's seek_engage handler (added to
    // ai_categories.js) will pick the real nearest player every tick.
    if (unit.target && unit.target.isDummy) unit.target = null;
  }

  /**
   * Stationary shooter: like orderHold (full-range engage, stay put)
   * but explicitly intended for skirmishing shooters in formations.
   * Mechanically identical to orderHold — the dual name documents intent.
   */
  function orderShootInPlace (unit) {
    orderHold(unit);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  ADVANCE TARGET CALCULATOR
  //  Always returns a waypoint AHEAD of the unit in the player direction so
  //  a unit can never be ordered backward (same anti-false-flee design as
  //  the legacy AI, retained intact).
  // ════════════════════════════════════════════════════════════════════════
  function calcAdvanceTarget (unit, playerCentroid, subRole, idx, total, doctrine, formationShape) {
    const rawDx = playerCentroid.x - unit.x;
    const rawDy = playerCentroid.y - unit.y;
    const rawLen = Math.hypot(rawDx, rawDy) || 1;
    const nx = rawDx / rawLen, ny = rawDy / rawLen;
    const px = -ny,            py = nx;

    const half = (total - 1) / 2;
    const slot = idx - half;
    let spreadX = 0, behindY = 0;

    // ── BLOCK FORMATION ─────────────────────────────────────────────────
    // Only applies to front-line melee (SHIELD/MELEE_INF), and only outside
    // ANTI_CAV_RING (which already has its own dedicated ring layout above)
    // and DEFENSIVE_HOLD (intentionally a shallow, defensive crouch, not a
    // deep push formation). A real multi-rank grid, not just tighter spacing
    // within the same single-rank line: units behind the first rank are
    // pulled forward as that rank advances, giving genuine depth.
    const wantsBlock = formationShape === 'BLOCK' &&
                        (subRole === 'SHIELD' || subRole === 'MELEE_INF') &&
                        doctrine !== 'ANTI_CAV_RING' && doctrine !== 'DEFENSIVE_HOLD';
    if (wantsBlock) {
      const cols = Math.max(1, Math.round(Math.sqrt(total * 1.6))); // wider than tall -- still presents a frontage
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const colsInThisRow = Math.min(cols, total - row * cols);
      const rowHalf = (colsInThisRow - 1) / 2;
      spreadX = (col - rowHalf) * (SPREAD_FRONT_X * 0.55); // tighter than a LINE's per-slot spacing
      behindY = row * (SPREAD_FRONT_X * 0.5);              // each successive rank sits further back (depth)

      const lookAhead = Math.max(0, ADVANCE_LOOK_AHEAD - ADVANCE_STOP_BUFFER);
      let tx = unit.x + nx * lookAhead + px * spreadX - nx * behindY;
      let ty = unit.y + ny * lookAhead + py * spreadX - ny * behindY;
      const clampX = playerCentroid.x - nx * ADVANCE_STOP_BUFFER;
      const clampY = playerCentroid.y - ny * ADVANCE_STOP_BUFFER;
      const toClampDist = Math.hypot(clampX - unit.x, clampY - unit.y);
      const toTgtDist   = Math.hypot(tx     - unit.x, ty     - unit.y);
      if (toTgtDist > toClampDist) { tx = clampX + px * spreadX * 0.5; ty = clampY + py * spreadX * 0.5; }
      const distNow = Math.hypot(unit.x - playerCentroid.x, unit.y - playerCentroid.y);
      const distTgt = Math.hypot(tx     - playerCentroid.x, ty     - playerCentroid.y);
      if (distTgt > distNow + 80) { tx = playerCentroid.x - nx * ADVANCE_STOP_BUFFER; ty = playerCentroid.y - ny * ADVANCE_STOP_BUFFER; }
      return { x: tx, y: ty };
    }

    if (doctrine === 'ANTI_CAV_RING') {
      // Ring: shooters cluster at center, melee form a perimeter ring
      if (subRole === 'RANGED_INF' || subRole === 'GUNPOWDER') {
        const angR = (idx / Math.max(total, 1)) * Math.PI * 2;
        spreadX = Math.cos(angR) * 30;
        behindY = Math.sin(angR) * 30;
      } else if (subRole === 'SHIELD' || subRole === 'MELEE_INF') {
        const angI = (idx / Math.max(total, 1)) * Math.PI * 2;
        const ringR = 110;
        spreadX = Math.cos(angI) * ringR;
        behindY = Math.sin(angI) * ringR * 0.55;
      } else if (subRole === 'MELEE_CAV') {
        // Heavy cav sits well behind the ring -- they'll counter-charge
        const flank = (idx % 2 === 0) ? 1 : -1;
        spreadX = flank * (SPREAD_HEAVYCAV_FLANK + slot * 25);
        behindY = SPREAD_HEAVYCAV_BACK;
      } else { // RANGED_CAV
        const flank = (idx % 2 === 0) ? 1 : -1;
        spreadX = flank * 200;
        behindY = 120;
      }
    } else if (doctrine === 'SHIELD_PUSH') {
      // Aggressive: shields/melee_inf push forward, shooters trail closely
      if (subRole === 'SHIELD' || subRole === 'MELEE_INF') {
        spreadX = slot * SPREAD_FRONT_X;
        behindY = -10;
      } else if (subRole === 'RANGED_INF' || subRole === 'GUNPOWDER') {
        spreadX = slot * SPREAD_FRONT_X;
        behindY = SPREAD_SHOOTER_BACK;
      } else if (subRole === 'MELEE_CAV') {
        const flank = (idx % 2 === 0) ? 1 : -1;
        spreadX = flank * (SPREAD_HEAVYCAV_FLANK + slot * 20);
        behindY = SPREAD_HEAVYCAV_BACK * 0.6;
      } else { // RANGED_CAV
        const flank = (idx % 2 === 0) ? 1 : -1;
        spreadX = flank * 240;
        behindY = 80;
      }
    } else if (doctrine === 'SKIRMISH_HUNT') {
      // Tight shield wall, cav hunts wide on the flanks
      if (subRole === 'SHIELD' || subRole === 'MELEE_INF') {
        spreadX = slot * (SPREAD_FRONT_X * 0.9);
        behindY = 0;
      } else if (subRole === 'RANGED_INF' || subRole === 'GUNPOWDER') {
        spreadX = slot * SPREAD_FRONT_X;
        behindY = SPREAD_SHOOTER_BACK;
      } else if (subRole === 'MELEE_CAV') {
        const flank = (idx % 2 === 0) ? 1 : -1;
        spreadX = flank * (SPREAD_HEAVYCAV_FLANK + 60 + slot * 25);
        behindY = 60; // closer than other doctrines: they're the hunters
      } else { // RANGED_CAV -- mirror player kiting
        const flank = (idx % 2 === 0) ? 1 : -1;
        spreadX = flank * 300;
        behindY = 20;
      }
    } else if (doctrine === 'HAMMER_AND_ANVIL') {
      // Anvil = front + shooters. Hammer = heavy cav, held back further
      if (subRole === 'SHIELD' || subRole === 'MELEE_INF') {
        spreadX = slot * SPREAD_FRONT_X;
        behindY = 0;
      } else if (subRole === 'RANGED_INF' || subRole === 'GUNPOWDER') {
        spreadX = slot * SPREAD_FRONT_X;
        behindY = SPREAD_SHOOTER_BACK;
      } else if (subRole === 'MELEE_CAV') {
        // Held WAY back, deep flank -- they wait for the anvil to engage.
        const flank = (idx % 2 === 0) ? 1 : -1;
        spreadX = flank * (SPREAD_HEAVYCAV_FLANK + 40);
        behindY = SPREAD_HEAVYCAV_BACK + 60;
      } else { // RANGED_CAV
        const flank = (idx % 2 === 0) ? 1 : -1;
        spreadX = flank * 260;
        behindY = 100;
      }
    } else if (doctrine === 'DEFENSIVE_HOLD') {
      // Hardly advance at all -- give units a short forward step only
      if (subRole === 'SHIELD' || subRole === 'MELEE_INF') {
        spreadX = slot * (SPREAD_FRONT_X * 0.85);
        behindY = -20;
      } else if (subRole === 'RANGED_INF' || subRole === 'GUNPOWDER') {
        spreadX = slot * SPREAD_FRONT_X;
        behindY = SPREAD_SHOOTER_BACK - 20;
      } else if (subRole === 'MELEE_CAV') {
        const flank = (idx % 2 === 0) ? 1 : -1;
        spreadX = flank * (SPREAD_HEAVYCAV_FLANK + slot * 20);
        behindY = SPREAD_HEAVYCAV_BACK;
      } else {
        const flank = (idx % 2 === 0) ? 1 : -1;
        spreadX = flank * 220;
        behindY = 100;
      }
    } else {
      // COMBINED_ARMS (default) -- mirrors legacy STANDARD
      if (subRole === 'SHIELD' || subRole === 'MELEE_INF') {
        spreadX = slot * SPREAD_FRONT_X;
        behindY = 0;
      } else if (subRole === 'RANGED_INF' || subRole === 'GUNPOWDER') {
        spreadX = slot * SPREAD_FRONT_X;
        behindY = SPREAD_SHOOTER_BACK;
      } else if (subRole === 'MELEE_CAV') {
        const flank = (idx % 2 === 0) ? 1 : -1;
        spreadX = flank * (130 + slot * 25);
        behindY = 60;
      } else { // RANGED_CAV
        const flank = (idx % 2 === 0) ? 1 : -1;
        spreadX = flank * 200;
        behindY = 50;
      }
    }

    // Defensive hold = much shorter look-ahead
    const lookAhead = (doctrine === 'DEFENSIVE_HOLD')
      ? Math.max(0, ADVANCE_LOOK_AHEAD * 0.35 - ADVANCE_STOP_BUFFER)
      : Math.max(0, ADVANCE_LOOK_AHEAD - ADVANCE_STOP_BUFFER);

    let tx = unit.x + nx * lookAhead + px * spreadX - nx * behindY;
    let ty = unit.y + ny * lookAhead + py * spreadX - ny * behindY;

    // Clamp so we don't overshoot the player mass
    const clampX = playerCentroid.x - nx * ADVANCE_STOP_BUFFER;
    const clampY = playerCentroid.y - ny * ADVANCE_STOP_BUFFER;
    const toClampDist = Math.hypot(clampX - unit.x, clampY - unit.y);
    const toTgtDist   = Math.hypot(tx     - unit.x, ty     - unit.y);
    if (toTgtDist > toClampDist) {
      tx = clampX + px * spreadX * 0.5;
      ty = clampY + py * spreadX * 0.5;
    }

    // Final anti-false-flee guard: never further from player than now.
    const distNow = Math.hypot(unit.x - playerCentroid.x, unit.y - playerCentroid.y);
    const distTgt = Math.hypot(tx     - playerCentroid.x, ty     - playerCentroid.y);
    if (distTgt > distNow + 80) {
      tx = playerCentroid.x - nx * ADVANCE_STOP_BUFFER;
      ty = playerCentroid.y - ny * ADVANCE_STOP_BUFFER;
    }
    return { x: tx, y: ty };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  RANGED-PROTECTION ASSIGNMENT
  //  For each shooter, designate the nearest 1-2 melee infantry as escorts.
  //  Escorts are tagged via u._elsai_escortFor pointing at the shooter.
  // ════════════════════════════════════════════════════════════════════════
  function assignProtection (groups) {
    // Reset old tags
    const allMelee = groups.SHIELD.concat(groups.MELEE_INF);
    for (let i = 0; i < allMelee.length; i++) allMelee[i]._elsai_escortFor = null;

    const shooters = groups.RANGED_INF.concat(groups.GUNPOWDER);
    if (!shooters.length || !allMelee.length) return;

    // Greedy: each shooter claims the nearest unclaimed melee, up to 1 escort each.
    const claimed = new Set();
    for (let s = 0; s < shooters.length; s++) {
      const sh = shooters[s];
      let best = null, bestD2 = Infinity;
      for (let m = 0; m < allMelee.length; m++) {
        const me = allMelee[m];
        if (claimed.has(me)) continue;
        const d2 = dist2(sh, me);
        if (d2 < bestD2) { bestD2 = d2; best = me; }
      }
      if (best) {
        best._elsai_escortFor = sh;
        claimed.add(best);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  GROUPING
  //  Sort enemy units into the six sub-role buckets, plus convenient supersets.
  // ════════════════════════════════════════════════════════════════════════
  function groupUnits (enemyUnits) {
    const groups = {
      MELEE_CAV: [], RANGED_CAV: [], MELEE_INF: [],
      RANGED_INF: [], GUNPOWDER: [], SHIELD: []
    };
    for (let i = 0; i < enemyUnits.length; i++) {
      const u = enemyUnits[i];
      const sub = resolveSubRole(u);
      (groups[sub] || groups.MELEE_INF).push(u);
    }
    groups.FRONT_LINE = groups.SHIELD.concat(groups.MELEE_INF);
    groups.SHOOTERS   = groups.RANGED_INF.concat(groups.GUNPOWDER);
    // Sub-split for microShooters: non-gunpowder ranged get full hit-and-run
    // kiting (like horse archers); gunpowder stays behind the front line.
    groups.RANGED_INF_ONLY  = groups.RANGED_INF;
    groups.GUNPOWDER_ONLY   = groups.GUNPOWDER;
    return groups;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  CRISIS RESPONSE  (general low HP)
  // ════════════════════════════════════════════════════════════════════════
  function detectCrisis () {
    const gen = findEnemyGeneral();
    if (!gen) return false;
    const maxHp = (gen.stats && gen.stats.health) ? gen.stats.health : (gen.maxHp || gen.hp || 1);
    return (gen.hp / maxHp) < GENERAL_CRISIS_HP;
  }

  function isBodyguardType (u) {
    const sub = resolveSubRole(u);
    if (sub === 'MELEE_CAV' || sub === 'RANGED_CAV') return true;
    // Bow-class archers only; throwing/sling are kept on the line.
    if (sub === 'RANGED_INF') {
      const r = String((u.stats && u.stats.role) || '').toLowerCase();
      return r === 'archer' || r === 'crossbow' || r === 'horse_archer';
    }
    return false;
  }

  function executeCrisis (bodyguardUnits) {
    const gen = findEnemyGeneral();
    if (!gen) return;
    for (let i = 0; i < bodyguardUnits.length; i++) {
      const u = bodyguardUnits[i];
      const d = dist(u, gen);
      if (d <= BODYGUARD_RING_RADIUS) {
        orderHold(u);
      } else {
        const angle = Math.random() * Math.PI * 2;
        const ringR = BODYGUARD_RING_RADIUS * 0.65;
        backupSpeed(u);
        if (u.stats && u._elsai_origSpeed !== undefined) {
          u.stats.speed = u._elsai_origSpeed * BODYGUARD_RUSH_BONUS;
        }
        orderMove(u, gen.x + Math.cos(angle) * ringR, gen.y + Math.sin(angle) * ringR);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  GROUP MICRO-ROUTINES
  // ════════════════════════════════════════════════════════════════════════

  // ── FRONT LINE: shields + melee infantry ────────────────────────────────
  function microFrontLine (groups, playerCentroid, doctrine, avgSpeed, phase) {
    const front = groups.FRONT_LINE;
    if (!front.length) return;

    if (phase === 'ADVANCING') {
      for (let i = 0; i < front.length; i++) {
        const u = front[i];
        setSpeedScale(u, ADVANCE_SPEED_SCALE);
        const sub = resolveSubRole(u);
        // If this unit is an escort, anchor it just in front of its shooter,
        // pointed toward the player.
        if (u._elsai_escortFor && u._elsai_escortFor.hp > 0) {
          const sh = u._elsai_escortFor;
          const dx = playerCentroid.x - sh.x;
          const dy = playerCentroid.y - sh.y;
          const L = Math.hypot(dx, dy) || 1;
          const fx = sh.x + (dx / L) * 55;
          const fy = sh.y + (dy / L) * 55;
          orderMove(u, fx, fy);
        } else {
          const tgt = calcAdvanceTarget(u, playerCentroid, sub, i, front.length, doctrine, _formationShape);
          orderMove(u, tgt.x, tgt.y);
        }
      }
      return;
    }

    if (phase === 'SKIRMISHING') {
      // Front line holds (living shield for shooters) in most doctrines,
      // but for SHIELD_PUSH and ANTI_CAV_RING the behaviours differ.
      if (doctrine === 'SHIELD_PUSH') {
        // Continue grinding forward at half speed
        for (let i = 0; i < front.length; i++) {
          setSpeedScale(front[i], 0.55);
          orderChase(front[i]);
        }
      } else if (doctrine === 'ANTI_CAV_RING') {
        // Compress the ring -- everyone holds
        for (let i = 0; i < front.length; i++) orderHold(front[i]);
      } else if (doctrine === 'DEFENSIVE_HOLD') {
        for (let i = 0; i < front.length; i++) orderHold(front[i]);
      } else {
        // COMBINED_ARMS / HAMMER_AND_ANVIL / SKIRMISH_HUNT: hold and shield shooters
        for (let i = 0; i < front.length; i++) orderHold(front[i]);
      }
      return;
    }

    if (phase === 'CHARGING') {
      for (let i = 0; i < front.length; i++) {
        restoreSpeed(front[i]);
        orderChase(front[i]);
      }
    }
  }

  // ── SHOOTERS: ranged infantry + gunpowder ───────────────────────────────
  // RANGED_INF (archers, crossbows, slingers) → full hit-and-run kiting.
  // GUNPOWDER  (firelances, handgunners, bombards) → hold position behind
  //   the front line and fire from a fixed anchor (slow reload, high damage,
  //   no agility — kiting doesn't suit them).
  function microShooters (groups, playerCentroid, doctrine, avgSpeed, phase) {
    const shooters = groups.SHOOTERS;
    if (!shooters.length) return;

    // ── Tune these to control ranged-inf hit-and-run aggressiveness ─────────
    const RI_KITE_IDEAL   = 320;  // px: preferred engagement distance
    const RI_KITE_TOO_CLOSE = 160; // px: emergency retreat trigger
    const RI_KITE_TOO_FAR  = 500;  // px: close-in if further than this
    const RI_FLEE_DIST     = 150;  // px: retreat step size
    const RI_ORBIT_STEP    = 200;  // px: lateral arc step while firing
    // ────────────────────────────────────────────────────────────────────────

    if (phase === 'ADVANCING') {
      for (let i = 0; i < shooters.length; i++) {
        const u = shooters[i];
        setSpeedScale(u, ADVANCE_SPEED_SCALE);
        const sub = resolveSubRole(u);
        const tgt = calcAdvanceTarget(u, playerCentroid, sub, i, shooters.length, doctrine, _formationShape);
        orderMove(u, tgt.x, tgt.y);
      }
      return;
    }

    if (phase === 'SKIRMISHING') {
      const env = W.battleEnvironment;

      // ── GUNPOWDER: hold-and-fire (unchanged) ──────────────────────────────
      const gp = groups.GUNPOWDER_ONLY || [];
      for (let i = 0; i < gp.length; i++) {
        const u = gp[i];
        restoreSpeed(u);
        let nearestThreatDist = Infinity;
        let nearestThreat = null;
        if (env && env.units) {
          for (let k = 0; k < env.units.length; k++) {
            const p = env.units[k];
            if (p.side !== 'player' || p.hp <= 0 || p.isDummy) continue;
            const d = dist(u, p);
            if (d < nearestThreatDist) { nearestThreatDist = d; nearestThreat = p; }
          }
        }
        if (nearestThreat && nearestThreatDist <= RANGED_INF_FLEE_TRIGGER_DIST) {
          const tdx = u.x - nearestThreat.x, tdy = u.y - nearestThreat.y;
          const L = Math.hypot(tdx, tdy) || 1;
          let awayX = tdx / L, awayY = tdy / L;
          if (groups.FRONT_LINE.length) {
            const fc = centroid(groups.FRONT_LINE);
            const bdx = fc.x - u.x, bdy = fc.y - u.y;
            const bL = Math.hypot(bdx, bdy) || 1;
            awayX = awayX * 0.70 + (bdx / bL) * 0.30;
            awayY = awayY * 0.70 + (bdy / bL) * 0.30;
            const nrm = Math.hypot(awayX, awayY) || 1;
            awayX /= nrm; awayY /= nrm;
          }
          orderMove(u, u.x + awayX * RANGED_INF_FLEE_DIST, u.y + awayY * RANGED_INF_FLEE_DIST);
        } else if (nearestThreat && nearestThreatDist <= RANGED_INF_FLEE_TRIGGER_DIST * 1.8) {
          orderShootInPlace(u);
        } else {
          orderChase(u);
        }
      }

      // ── RANGED_INF: hit-and-run kiting (mirrors microLightCav) ────────────
      const ri = groups.RANGED_INF_ONLY || [];
      for (let i = 0; i < ri.length; i++) {
        const u = ri[i];
        restoreSpeed(u);

        // No ammo → commit to melee like light cav does
        const ammoLeft = Math.max((u.ammo || 0), (u.stats && u.stats.ammo) || 0);
        if (ammoLeft <= 0) { orderChase(u); continue; }

        // Find closest player threat
        let closestThreat = null, closestThreatDist = Infinity;
        if (env && env.units) {
          for (let k = 0; k < env.units.length; k++) {
            const p = env.units[k];
            if (p.side !== 'player' || p.hp <= 0 || p.isDummy) continue;
            const d = dist(u, p);
            if (d < closestThreatDist) { closestThreatDist = d; closestThreat = p; }
          }
        }
        if (!closestThreat) { orderChase(u); continue; }

        const dx = closestThreat.x - u.x;
        const dy = closestThreat.y - u.y;
        const L  = Math.hypot(dx, dy) || 1;
        const nx = dx / L, ny = dy / L;   // toward threat
        const px = -ny,    py =  nx;       // perpendicular (CCW)

        // Stable per-unit orbit direction (same pattern as horse archers)
        if (u._kiteSign === undefined) u._kiteSign = (i % 2 === 0) ? 1 : -1;

        if (closestThreatDist < RI_KITE_TOO_CLOSE) {
          // Emergency retreat — diagonal arc away, same as light cav
          const escX = u.x + (-nx * 0.6 + px * u._kiteSign * 0.80) * RI_FLEE_DIST * 1.4;
          const escY = u.y + (-ny * 0.6 + py * u._kiteSign * 0.80) * RI_FLEE_DIST * 1.4;
          orderMove(u, escX, escY);
          u._kiteSign *= -1;

        } else if (closestThreatDist > RI_KITE_TOO_FAR) {
          // Too far — close in at an angle
          const closeX = u.x + (nx * 0.85 + px * u._kiteSign * 0.20) * 180;
          const closeY = u.y + (ny * 0.85 + py * u._kiteSign * 0.20) * 180;
          orderMove(u, closeX, closeY);

        } else {
          // In ideal range — fire while strafing laterally
          // Foot archers are slower than horse archers so orbit step is smaller.
          if (_strategyTick % 2 === 0) {
            // Strafe: mostly perpendicular, slight backward lean to hold range
            const arcX = u.x + (px * u._kiteSign * 0.85 + (-nx) * 0.15) * RI_ORBIT_STEP;
            const arcY = u.y + (py * u._kiteSign * 0.85 + (-ny) * 0.15) * RI_ORBIT_STEP;
            orderMove(u, arcX, arcY);
          } else {
            // Alternate ticks: acquire target so engine fires projectile
            orderChase(u);
          }
        }
      }
      return;
    }

    if (phase === 'CHARGING') {
      for (let i = 0; i < shooters.length; i++) {
        restoreSpeed(shooters[i]);
        orderChase(shooters[i]);
      }
    }
  }

  // ── HEAVY (MELEE) CAVALRY -- the hammer ─────────────────────────────────
  function microHeavyCav (groups, playerUnits, playerCentroid, doctrine, phase) {
    const cav = groups.MELEE_CAV;
    if (!cav.length) return;

    // For HAMMER_AND_ANVIL: hold WAY back until the anvil (front line) is engaged.
    const front = groups.FRONT_LINE;
    let anvilEngaged = false;
    if (front.length && playerUnits.length) {
      const g = minGap(front, playerUnits);
      anvilEngaged = (g <= ANVIL_ENGAGE_DIST);
    }

    if (phase === 'ADVANCING') {
      for (let i = 0; i < cav.length; i++) {
        const u = cav[i];
        setSpeedScale(u, ADVANCE_SPEED_SCALE);
        const tgt = calcAdvanceTarget(u, playerCentroid, 'MELEE_CAV', i, cav.length, doctrine, _formationShape);
        orderMove(u, tgt.x, tgt.y);
      }
      return;
    }

    if (phase === 'SKIRMISHING') {
      if (doctrine === 'HAMMER_AND_ANVIL' && !anvilEngaged) {
        // Hold position behind anvil -- they wait
        for (let i = 0; i < cav.length; i++) orderHold(cav[i]);
        return;
      }
      if (doctrine === 'ANTI_CAV_RING') {
        // Wait inside / near ring for a counter-charge opportunity -- this
        // doctrine's purpose is defensive (counter-charge whoever attacks
        // the ring), not hunting the backline, so it keeps its own behaviour.
        for (let i = 0; i < cav.length; i++) orderHold(cav[i]);
        return;
      }
      if (doctrine === 'SKIRMISH_HUNT') {
        // Hunt player horse archers -- chase freely. orderChase is always
        // safe (self-correcting forever, unlike orderMove), and the
        // perpetual smart-targeting scan in ai_categories.js now also
        // biases this toward soft/fleeing/flankable targets automatically.
        for (let i = 0; i < cav.length; i++) {
          restoreSpeed(cav[i]);
          orderChase(cav[i]);
        }
        return;
      }
      if (doctrine === 'DEFENSIVE_HOLD') {
        // Intentionally passive -- wait for the player to overextend.
        for (let i = 0; i < cav.length; i++) orderHold(cav[i]);
        return;
      }

      // COMBINED_ARMS / SHIELD_PUSH / HAMMER_AND_ANVIL-once-anvil-engaged:
      // actively maneuver toward a flanking approach on the best available
      // soft/isolated/already-routing target, instead of just holding still
      // until CHARGING. SKIRMISHING runs every tick for as long as the
      // skirmish lasts, so this is the SAFE place to do this kind of
      // multi-step positioning -- orderMove here gets re-evaluated and
      // self-corrected continuously. (CHARGING, by contrast, only ever
      // fires once before the whole strategy AI tears itself down, so any
      // unit left walking toward an orderMove waypoint at that exact moment
      // would freeze there forever with no future tick to switch it to
      // combat -- see the CHARGING branch below for the fix to that
      // specific, separate latent bug.)
      const fc = front.length ? centroid(front) : playerCentroid;
      for (let i = 0; i < cav.length; i++) {
        const u = cav[i];
        restoreSpeed(u);
        const prospect = pickCavalryProspect(u, playerUnits);
        const d = prospect ? dist(u, prospect) : Infinity;

        if (prospect && d <= 260) {
          // Already close enough to the chosen prey that orderChase's own
          // nearest-enemy scan will correctly resolve to them (or something
          // even better/closer/flanking, per the same scoring bias) -- safe
          // to commit now rather than keep maneuvering.
          orderChase(u);
        } else {
          // Still maneuvering into position. Swing wide of the front-line
          // mass toward the prey's side rather than cutting straight through
          // it. Falls back to the existing flank-the-centroid point used by
          // HAMMER_AND_ANVIL if no prospect is identifiable yet.
          const flank = (i % 2 === 0) ? 1 : -1;
          const dx = playerCentroid.x - fc.x, dy = playerCentroid.y - fc.y;
          const L = Math.hypot(dx, dy) || 1;
          const fnx = dx / L, fny = dy / L;
          const fpx = -fny, fpy = fnx;
          const fallbackX = playerCentroid.x + fpx * flank * HAMMER_FLANK_LEAD;
          const fallbackY = playerCentroid.y + fpy * flank * HAMMER_FLANK_LEAD;
          const wp = calcCavalryHuntWaypoint(u, prospect, fc, fallbackX, fallbackY);
          orderMove(u, wp.x, wp.y);
        }
      }
      return;
    }

    if (phase === 'CHARGING') {
      // FINAL COMMIT. This branch only ever executes ONCE per battle --
      // EnemyLandStrategyAI tears itself down immediately afterward, so
      // there is no future tick to correct a bad order here. orderChase is
      // the only safe choice (self-sufficient and self-correcting forever
      // via the engine's own targeting loop); orderMove is NOT, since a
      // unit that hasn't arrived by the time this single tick ends would
      // hover at its waypoint, indefinitely, for the rest of the battle.
      //
      // (Previously HAMMER_AND_ANVIL used "if far: orderMove toward a flank
      // waypoint, else: orderChase" -- exactly the unsafe one-shot pattern
      // above. Any rider further than 380px from playerCentroid at this
      // exact instant would have been permanently stranded mid-flank. The
      // flank positioning now happens safely above, during SKIRMISHING;
      // by the time CHARGING fires, riders should already be close to a
      // good target, so a plain orderChase is both safe AND well-aimed.)
      for (let i = 0; i < cav.length; i++) {
        restoreSpeed(cav[i]);
        orderChase(cav[i]);
      }
    }
  }

  // ── LIGHT (RANGED) CAVALRY -- the kiters ────────────────────────────────
  function microLightCav (groups, playerUnits, playerCentroid, doctrine, phase) {
    const lcav = groups.RANGED_CAV;
    if (!lcav.length) return;

    const kiteMin   = SPREAD_LIGHTCAV_MIN   * _personalityMod.kiteRange;
    const kiteIdeal = SPREAD_LIGHTCAV_KITE  * _personalityMod.kiteRange;
    const kiteMax   = SPREAD_LIGHTCAV_MAX   * _personalityMod.kiteRange;

    if (phase === 'ADVANCING' || phase === 'SKIRMISHING') {
      for (let i = 0; i < lcav.length; i++) {
        const u = lcav[i];
        restoreSpeed(u); // light cav always at full speed — kiting requires it

        // ── AMMO CHECK: no ammo → stop kiting, commit to melee ────────────
        const ammoLeft = Math.max((u.ammo || 0), (u.stats && u.stats.ammo) || 0);
        if (ammoLeft <= 0) {
          orderChase(u);
          continue;
        }

        // ── Find closest threat among ALL player units (not just current target) ──
        // This is critical — a unit that switched target or has stale target
        // data will otherwise never detect a melee threat closing from the side.
        let closestThreat = null, closestThreatDist = Infinity;
        for (let j = 0; j < playerUnits.length; j++) {
          const p = playerUnits[j];
          const d = Math.hypot(u.x - p.x, u.y - p.y);
          if (d < closestThreatDist) { closestThreatDist = d; closestThreat = p; }
        }
        if (!closestThreat) { orderChase(u); continue; }

        const dx = closestThreat.x - u.x;
        const dy = closestThreat.y - u.y;
        const L  = Math.hypot(dx, dy) || 1;
        const nx = dx / L, ny = dy / L;   // toward threat
        const px = -ny,    py =  nx;       // perpendicular (CCW)

        // ── Persistent orbit direction per unit ────────────────────────────
        // Each unit gets a stable _kiteSign that flips only when it's forced
        // to retreat directly (to avoid ping-pong oscillation). Without this
        // every alternate tick was reversing the arc making horse archers
        // visibly jitter left-right instead of orbiting.
        if (u._kiteSign === undefined) u._kiteSign = (i % 2 === 0) ? 1 : -1;

        if (closestThreatDist < kiteMin) {
          // ── TOO CLOSE: emergency retreat ──────────────────────────────────
          // Diagonal escape: primarily away, with a strong perpendicular arc
          // component so we circle rather than flee in a straight line (a
          // straight retreat lets faster melee cavalry simply follow and
          // outrun us over distance; the arc keeps them working harder).
          const escX = u.x + (-nx * 0.55 + px * u._kiteSign * 0.85) * 280;
          const escY = u.y + (-ny * 0.55 + py * u._kiteSign * 0.85) * 280;
          orderMove(u, escX, escY);
          // Flip orbit direction after each panic retreat so patterns don't
          // become predictable (alternating arcs is harder to intercept).
          u._kiteSign *= -1;

        } else if (closestThreatDist > kiteMax) {
          // ── TOO FAR: close to ideal range ─────────────────────────────────
          // Move directly toward the threat but with a slight lateral bias
          // so we approach on an angle (less telegraphed, harder to block).
          const closeX = u.x + (nx * 0.9 + px * u._kiteSign * 0.15) * 200;
          const closeY = u.y + (ny * 0.9 + py * u._kiteSign * 0.15) * 200;
          orderMove(u, closeX, closeY);

        } else {
          // ── IN IDEAL RANGE: fire while orbiting ───────────────────────────
          // The unit IS in range and HAS ammo. We want it to fire (handled by
          // the engine's _handleCombatExecution when it has a valid target)
          // but also to keep moving in its orbit so it doesn't stop dead.
          // orderChase sets target for shooting; the processAction isRangedCav
          // fix in ai_categories.js then lets it keep its orbit velocity.
          // We additionally issue a short arc waypoint on every other tick so
          // the unit physically moves while shooting instead of hovering.
          if (_strategyTick % 2 === 0) {
            // Arc movement: mostly perpendicular, slight backward lean to
            // maintain or slightly increase gap (don't drift into melee range
            // just because we're orbiting).
            const arcX = u.x + (px * u._kiteSign * 0.80 + (-nx) * 0.20) * LIGHTCAV_ORBIT_STEP;
            const arcY = u.y + (py * u._kiteSign * 0.80 + (-ny) * 0.20) * LIGHTCAV_ORBIT_STEP;
            orderMove(u, arcX, arcY);
          } else {
            // Alternate ticks: orderChase so the engine assigns a real target
            // and the combat execution fires an arrow.
            orderChase(u);
          }
        }
      }
      return;
    }

    if (phase === 'CHARGING') {
      // Final commit. Check ammo: if any ammo left, keep kiting (post-charge
      // cohesion heartbeat will maintain this); if dry, melee charge.
      for (let i = 0; i < lcav.length; i++) {
        const u = lcav[i];
        restoreSpeed(u);
        const ammoLeft = Math.max((u.ammo || 0), (u.stats && u.stats.ammo) || 0);
        if (ammoLeft > 0) {
          // Stay ranged — orderChase so they keep finding targets.
          // cohesionTick will re-issue kite orders on the COHESION heartbeat.
          orderChase(u);
        } else {
          orderChase(u); // Out of ammo: fight in melee like everyone else
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  PHASE EXECUTORS
  // ════════════════════════════════════════════════════════════════════════
  function executeForming (enemyUnits) {
    for (let i = 0; i < enemyUnits.length; i++) {
      backupSpeed(enemyUnits[i]);
      orderHold(enemyUnits[i]);
    }
  }

  function executePhase (phase, groups, playerUnits, playerCentroid) {
    const ec = analyseComposition(groups.FRONT_LINE.concat(groups.SHOOTERS, groups.MELEE_CAV, groups.RANGED_CAV));
    const avgSpeed = ec.avgSpeed;

    microFrontLine(groups, playerCentroid, _doctrine, avgSpeed, phase);
    microShooters  (groups, playerCentroid, _doctrine, avgSpeed, phase);
    microHeavyCav  (groups, playerUnits, playerCentroid, _doctrine, phase);
    microLightCav  (groups, playerUnits, playerCentroid, _doctrine, phase);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  TEARDOWN
  // ════════════════════════════════════════════════════════════════════════
  function teardown () {
    if (_tickInterval) { clearInterval(_tickInterval); _tickInterval = null; }
    if (_cohesionInterval) { clearInterval(_cohesionInterval); _cohesionInterval = null; }
    _phase           = 'IDLE';
    _formingTicks    = 0;
    _skirmishTicks   = 0;
    _crisisActive    = false;
    _feintTriggered  = false;
    _feintTickAt     = 0;
    _strategyTick    = 0;
    const env = W.battleEnvironment;
    if (env && env.units) {
      for (let i = 0; i < env.units.length; i++) {
        const u = env.units[i];
        if (u.side === 'enemy') {
          restoreSpeed(u);
          if (u._elsai_escortFor !== undefined) delete u._elsai_escortFor;
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  STATE MACHINE
  // ════════════════════════════════════════════════════════════════════════
  function tick () {
    const isBattle = (typeof W.MobileControls !== 'undefined' && W.MobileControls.G && typeof W.MobileControls.G.isBattle === 'function')
      ? W.MobileControls.G.isBattle()
      : (W.battleEnvironment && W.battleEnvironment.isActive !== false);
    if (!isBattle || !isLandBattle()) {
      if (W.__ELSAI_DEBUG__) {
        console.log('[EnemyLandStrategyAI] tick() teardown — isBattle=' + isBattle +
          ' isLandBattle=' + isLandBattle() +
          ' (siege=' + isSiegeBattle() + ' naval=' + isNavalBattle() + ' river=' + isRiverBattle() + ')');
      }
      teardown();
      return;
    }

    const enemyUnits  = getEnemyUnits();
    const playerUnits = getPlayerUnits();
    if (!enemyUnits.length || !playerUnits.length) {
      if (W.__ELSAI_DEBUG__) {
        console.log('[EnemyLandStrategyAI] tick() teardown — enemyUnits=' + enemyUnits.length +
          ' playerUnits=' + playerUnits.length +
          ' (raw env.units=' + ((W.battleEnvironment && W.battleEnvironment.units) ? W.battleEnvironment.units.length : 'NO ENV') + ')');
      }
      teardown();
      return;
    }

    _strategyTick++;
    const playerCentroid = centroid(playerUnits);

    if (W.__ELSAI_DEBUG__ && _strategyTick % 6 === 0) {
      // Heartbeat every ~3s (6 ticks @ 500ms) -- shows phase/doctrine/group
      // sizes without spamming the console every 500ms forever.
      const _g = groupUnits(enemyUnits);
      console.log('[EnemyLandStrategyAI] HEARTBEAT tick=' + _strategyTick +
        ' phase=' + _phase + ' doctrine=' + _doctrine + ' personality=' + _personality +
        ' | FRONT_LINE=' + _g.FRONT_LINE.length +
        ' SHOOTERS=' + _g.SHOOTERS.length +
        ' MELEE_CAV=' + _g.MELEE_CAV.length +
        ' RANGED_CAV=' + _g.RANGED_CAV.length +
        ' | enemyUnits=' + enemyUnits.length + ' playerUnits=' + playerUnits.length +
        ' | minGap=' + Math.round(minGap(enemyUnits, playerUnits)));
    }

    // Crisis: bodyguards rush the general; the rest follow their normal phase.
    const crisisNow = detectCrisis();
    if (crisisNow) {
      if (!_crisisActive) _crisisActive = true;
      const bodyguards  = [];
      const normalForce = [];
      for (let i = 0; i < enemyUnits.length; i++) {
        if (isBodyguardType(enemyUnits[i])) bodyguards.push(enemyUnits[i]);
        else                                 normalForce.push(enemyUnits[i]);
      }
      if (bodyguards.length) executeCrisis(bodyguards);
      if (normalForce.length) {
        const groups = groupUnits(normalForce);
        assignProtection(groups);
        runPhase(groups, normalForce, playerUnits, playerCentroid);
      }
      return;
    }
    if (_crisisActive) _crisisActive = false;

    const groups = groupUnits(enemyUnits);
    assignProtection(groups);
    runPhase(groups, enemyUnits, playerUnits, playerCentroid);
  }

  function runPhase (groups, enemyUnits, playerUnits, playerCentroid) {
    // ── FORMING ───────────────────────────────────────────────────────────
    if (_phase === 'FORMING') {
      executeForming(enemyUnits);
      _formingTicks++;
      if (_formingTicks >= FORMING_TICKS) {
        const playerComp = analyseComposition(playerUnits);
        const enemyComp  = analyseComposition(enemyUnits);
        _doctrine      = pickDoctrine(playerComp, enemyComp);
        _formationShape = pickFormationShape(enemyComp, _personality);
        _phase       = 'ADVANCING';
        _formingTicks = 0;
        if (W.__ELSAI_DEBUG__) {
          console.log('[EnemyLandStrategyAI] FORMING -> ADVANCING | doctrine=' + _doctrine + ' formation=' + _formationShape);
        }
      }
      return;
    }

    // ── ADVANCING ─────────────────────────────────────────────────────────
    if (_phase === 'ADVANCING') {
      executePhase('ADVANCING', groups, playerUnits, playerCentroid);
      // FEINT personality: after some advance, fake a pull-back once
      if (_personality === 'FEINT' && !_feintTriggered) {
        const gap = minGap(enemyUnits, playerUnits);
        if (gap <= 720 && gap >= 540) {
          _feintTriggered = true;
          _feintTickAt = _strategyTick;
          // Pull the front line back briefly
          const front = groups.FRONT_LINE;
          for (let i = 0; i < front.length; i++) {
            const u = front[i];
            const dx = u.x - playerCentroid.x, dy = u.y - playerCentroid.y;
            const L = Math.hypot(dx, dy) || 1;
            orderMove(u, u.x + (dx/L) * 80, u.y + (dy/L) * 80);
          }
        }
      }
      // End feint after ~2 ticks
      if (_feintTriggered && (_strategyTick - _feintTickAt) > 2) {
        // resume normal advance next tick (no-op here; next tick re-advances)
      }

      // Trigger skirmish when minimum gap drops below threshold
      const skirmDist = DIST_SKIRMISH * _personalityMod.commitDist;
      if (minGap(enemyUnits, playerUnits) <= skirmDist) {
        // MID-BATTLE RE-EVALUATION: re-run doctrine/formation selection with
        // CURRENT compositions rather than the stale snapshot taken back at
        // FORMING. Casualties from an early ranged exchange during the
        // advance, or simply the player's own losses, can meaningfully
        // change which doctrine is actually the right call by the time
        // skirmishing starts -- a doctrine picked once at the very start and
        // never revisited can't adapt to any of that. This mirrors the
        // existing FORMING->ADVANCING precedent (which already re-picks
        // once); this just adds one more honest re-check at the next safe
        // transition boundary, not a per-tick re-roll that would risk
        // flip-flopping orders constantly.
        const curPlayerComp = analyseComposition(playerUnits);
        const curEnemyComp  = analyseComposition(enemyUnits);
        _doctrine       = pickDoctrine(curPlayerComp, curEnemyComp);
        _formationShape = pickFormationShape(curEnemyComp, _personality);

        _phase = 'SKIRMISHING';
        _skirmishTicks = 0;
        if (W.__ELSAI_DEBUG__) {
          console.log('[EnemyLandStrategyAI] ADVANCING -> SKIRMISHING | gap=' + Math.round(minGap(enemyUnits, playerUnits)) +
            ' threshold=' + Math.round(skirmDist) + ' doctrine=' + _doctrine);
        }
        executePhase('SKIRMISHING', groups, playerUnits, playerCentroid);
      }
      return;
    }

    // ── SKIRMISHING ───────────────────────────────────────────────────────
    if (_phase === 'SKIRMISHING') {
      _skirmishTicks++;
      executePhase('SKIRMISHING', groups, playerUnits, playerCentroid);

      // Adjusted thresholds by personality
      const maxTicks    = Math.round(SKIRMISH_MAX_TICKS * _personalityMod.skirmishTicks);
      const meleeCommit = DIST_MELEE_COMMIT * _personalityMod.commitDist;
      const cavCommit   = DIST_HEAVYCAV_COMMIT * _personalityMod.commitDist;
      const ringCommit  = DIST_RING_COMMIT * _personalityMod.commitDist;

      const meleeGap  = minGap(groups.FRONT_LINE, playerUnits);
      const cavGap    = minGap(groups.MELEE_CAV,  playerUnits);
      const allGap    = minGap(enemyUnits,        playerUnits);

      const timerDone   = _skirmishTicks >= maxTicks;
      const meleeClose  = meleeGap <= meleeCommit;
      const cavBreaks   = (_doctrine !== 'ANTI_CAV_RING' && _doctrine !== 'DEFENSIVE_HOLD') && cavGap !== Infinity && cavGap <= cavCommit;
      const ringCloses  = _doctrine === 'ANTI_CAV_RING' && allGap <= ringCommit;

      // OPPORTUNIST: if any single player unit is isolated (>250px from its centroid), commit early
      let opportunistFire = false;
      if (_personality === 'OPPORTUNIST') {
        for (let i = 0; i < playerUnits.length; i++) {
          const pu = playerUnits[i];
          if (dist(pu, playerCentroid) > 260) { opportunistFire = true; break; }
        }
      }

      if (timerDone || meleeClose || cavBreaks || ringCloses || opportunistFire) {
        if (W.__ELSAI_DEBUG__) {
          const reason = timerDone ? 'timerDone' : meleeClose ? 'meleeClose' : cavBreaks ? 'cavBreaks' : ringCloses ? 'ringCloses' : 'opportunistFire';
          console.log('[EnemyLandStrategyAI] SKIRMISHING -> CHARGING | reason=' + reason +
            ' skirmishTicks=' + _skirmishTicks + '/' + maxTicks +
            ' meleeGap=' + Math.round(meleeGap) + '/' + Math.round(meleeCommit) +
            ' cavGap=' + Math.round(cavGap) + '/' + Math.round(cavCommit) +
            ' doctrine=' + _doctrine + ' personality=' + _personality);
        }
        _phase = 'CHARGING';
        executePhase('CHARGING', groups, playerUnits, playerCentroid);
        if (W.AudioManager && typeof W.AudioManager.playSound === 'function') {
          W.AudioManager.playSound('enemy_charge');
        }
        // CHARGING itself is still a single irreversible commit (every unit
        // gets one orderChase and the engine drives combat from here) -- but
        // unlike before, we no longer kill the AI entirely. Stop the normal
        // 2 Hz strategy heartbeat (its formation/doctrine logic has nothing
        // left to do once everyone's in open combat) and hand off to the
        // slower COHESION heartbeat, which only ever touches units that
        // AREN'T currently fighting -- see cohesionTick() for why this is
        // safe to leave running for the rest of the battle.
        if (_tickInterval) { clearInterval(_tickInterval); _tickInterval = null; }
        _phase = 'COHESION';
        if (!_cohesionInterval) {
          _cohesionInterval = setInterval(cohesionTick, COHESION_TICK_MS);
        }
      }
      return;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  COHESION  (post-charge regrouping -- replaces the old hard teardown)
  // ════════════════════════════════════════════════════════════════════════
  // CHARGING is still the single irreversible commit -- every unit gets one
  // orderChase and the engine's own combat/targeting loop takes over moment
  // to moment, exactly as before. The difference is this file no longer
  // calls teardown() right after. Instead it keeps a slower, lighter
  // heartbeat (COHESION_TICK_MS, ~1 Hz vs the normal 2 Hz) alive that only
  // ever touches units which are CURRENTLY NOT FIGHTING -- anyone mid-combat
  // (engine state "attacking", or close enough to a live target to be about
  // to be) is left completely alone, so this never interrupts a swing or
  // yanks a unit out of melee. What it DOES do: any unit who has finished a
  // fight (target dead) or never found one and has drifted away from every
  // ally beyond COHESION_LONE_RADIUS gets walked back toward the nearest
  // friendly cluster instead of wandering off alone or freezing in place --
  // the closest this architecture can safely get to "reform after the
  // charge" without re-introducing the one-shot-orderMove stranding bug
  // that CHARGING's own comments already warned about.
  function isUnitCurrentlyFighting (u) {
    if (u.state === 'attacking') return true;
    if (u.target && u.target.hp > 0 && !u.target.isDummy) {
      if (dist(u, u.target) <= COHESION_ENGAGED_DIST) return true;
    }
    return false;
  }

  function cohesionTick () {
    const isBattle = (typeof W.MobileControls !== 'undefined' && W.MobileControls.G && typeof W.MobileControls.G.isBattle === 'function')
      ? W.MobileControls.G.isBattle()
      : (W.battleEnvironment && W.battleEnvironment.isActive !== false);
    if (!isBattle || !isLandBattle()) { teardownCohesion(); return; }

    const enemyUnits = getEnemyUnits();
    if (enemyUnits.length < COHESION_MIN_GROUP) { teardownCohesion(); return; }
    const playerUnits = getPlayerUnits();
    if (!playerUnits.length) { teardownCohesion(); return; } // battle's basically over

    // Bodyguard/crisis behaviour still takes priority even post-charge.
    if (detectCrisis()) {
      const bodyguards = [];
      for (let i = 0; i < enemyUnits.length; i++) {
        if (isBodyguardType(enemyUnits[i]) && !isUnitCurrentlyFighting(enemyUnits[i])) bodyguards.push(enemyUnits[i]);
      }
      if (bodyguards.length) executeCrisis(bodyguards);
    }

    // Split into idle (not fighting) vs engaged. Engaged units are never touched.
    const idle = [];
    for (let i = 0; i < enemyUnits.length; i++) {
      if (!isUnitCurrentlyFighting(enemyUnits[i])) idle.push(enemyUnits[i]);
    }
    if (!idle.length) return; // everyone's busy -- nothing to regroup

    for (let i = 0; i < idle.length; i++) {
      const u = idle[i];
      // Distance to the nearest ally (any enemy unit, fighting or not --
      // an ally mid-fight is still a valid anchor point to rally toward).
      let nearestAllyD = Infinity, nearestAlly = null;
      for (let j = 0; j < enemyUnits.length; j++) {
        const other = enemyUnits[j];
        if (other === u) continue;
        const d = dist(u, other);
        if (d < nearestAllyD) { nearestAllyD = d; nearestAlly = other; }
      }

      if (nearestAllyD <= COHESION_LONE_RADIUS || !nearestAlly) {
        // Close enough to the army (or alone in the world).
        // RANGED_CAV with ammo: re-issue a kite orbit order rather than
        // a plain orderChase — processAction's stop-dead block is bypassed
        // for them, but we still want them actively circling, not hovering.
        const sub = resolveSubRole(u);
        const ammoLeft = Math.max((u.ammo || 0), (u.stats && u.stats.ammo) || 0);
        if (sub === 'RANGED_CAV' && ammoLeft > 0) {
          // Find nearest player threat
          const playerUnits = getPlayerUnits();
          let closestThreat = null, closestD = Infinity;
          for (let k = 0; k < playerUnits.length; k++) {
            const d = dist(u, playerUnits[k]);
            if (d < closestD) { closestD = d; closestThreat = playerUnits[k]; }
          }
          if (closestThreat) {
            const dx = closestThreat.x - u.x, dy = closestThreat.y - u.y;
            const L  = Math.hypot(dx, dy) || 1;
            const nx = dx / L, ny = dy / L;
            const px = -ny, py = nx;
            const kiteSign = (u._kiteSign !== undefined) ? u._kiteSign : 1;
            if (closestD < SPREAD_LIGHTCAV_MIN) {
              // Emergency retreat
              orderMove(u, u.x + (-nx * 0.55 + px * kiteSign * 0.85) * 280,
                           u.y + (-ny * 0.55 + py * kiteSign * 0.85) * 280);
            } else {
              // Orbit arc
              orderMove(u, u.x + (px * kiteSign * 0.80 + (-nx) * 0.20) * LIGHTCAV_ORBIT_STEP,
                           u.y + (py * kiteSign * 0.80 + (-ny) * 0.20) * LIGHTCAV_ORBIT_STEP);
            }
            continue;
          }
        }
        orderChase(u);
        continue;
      }

      // Isolated: walk back toward the ally cluster rather than the
      // player's general direction, so strays rejoin a friendly group
      // instead of soloing into the enemy. orderMove is safe here (unlike
      // inside the single-shot CHARGING branch) because this heartbeat
      // keeps re-running and will re-issue/correct the order every tick
      // for as long as the unit stays idle.
      backupSpeed(u);
      if (u.stats && u._elsai_origSpeed !== undefined) {
        u.stats.speed = u._elsai_origSpeed * COHESION_REGROUP_SPEED;
      }
      orderMove(u, nearestAlly.x, nearestAlly.y);
    }
  }

  function teardownCohesion () {
    if (_cohesionInterval) { clearInterval(_cohesionInterval); _cohesionInterval = null; }
    if (_phase === 'COHESION') _phase = 'IDLE';
  }

  // ════════════════════════════════════════════════════════════════════════
  //  POST-PRE-DEPLOY DEEP RESET  (copied from legacy AI -- same rationale)
  //  Wipes both AI-side and engine-side stale state so units actually move on
  //  the very first frame after COMMENCE BATTLE.
  // ════════════════════════════════════════════════════════════════════════
  function deepResetUnits (enemyUnits) {
    for (let i = 0; i < enemyUnits.length; i++) {
      const u = enemyUnits[i];
      u.hasOrders        = false;
      u.orderType        = null;
      u.orderTargetPoint = null;
      u.target           = null;
      u.state            = 'idle';
      u.vx               = 0;
      u.vy               = 0;
      u.fleeing          = false;
      u.isFleeing        = false;
      u.formationTimer   = 0;
      u.reactionDelay    = 0;
      restoreSpeed(u);
      if (u._etai_riverTargetX !== undefined) delete u._etai_riverTargetX;
      if (u._elsai_escortFor   !== undefined) delete u._elsai_escortFor;

      if (u.anchorX !== undefined) u.anchorX = u.x;
      if (u.anchorY !== undefined) u.anchorY = u.y;
      u.stuckTimer = 0;
      u.ghostTimer = 0;
      if (u.alpha !== undefined && u.alpha < 1) u.alpha = 1.0;
      if (u.stuckLog) { u.stuckLog.x = u.x; u.stuckLog.y = u.y; u.stuckLog.ticks = 0; }
      u.priorityOverride = false;
      u.unstickCooldown  = 0;
      u.randomPanicTimer = 0;
      u.ladderSlideTimer = 0;
      u.escapePoint      = null;
      u.escapeType       = null;
      u.breachTimestamp  = null;
      if (u.cooldown > 30) u.cooldown = 0;
      if (u.state === 'FLEEING' || u.state === 'retreated') u.state = 'idle';
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ════════════════════════════════════════════════════════════════════════
  function start (opts) {
    // Battle type routing
    if (!isLandBattle()) {
      // River / siege / naval -> hand off to the legacy AI if it's available.
      _routedToLegacy = true;
      if (typeof console !== 'undefined' && console.log) {
        console.log('[EnemyLandStrategyAI] start() ROUTED TO LEGACY — isLandBattle()=false ' +
          '(siege=' + isSiegeBattle() + ' naval=' + isNavalBattle() + ' river=' + isRiverBattle() +
          ' battleType=' + (W.battleEnvironment ? W.battleEnvironment.battleType : 'NO ENV') + '). ' +
          'The advanced AI (doctrine/formations/hit-and-run) will NOT run for this battle.');
      }
      if (W._EnemyTacticalAILegacy && typeof W._EnemyTacticalAILegacy.start === 'function') {
        return W._EnemyTacticalAILegacy.start(opts);
      }
      return;
    }
    _routedToLegacy = false;

    teardown();

    _crisisActive   = false;
    _skirmishTicks  = 0;
    _formingTicks   = 0;
    _strategyTick   = 0;
    _feintTriggered = false;
    _personality    = pickPersonality();
    _personalityMod = PERSONALITIES[_personality] || PERSONALITIES.BALANCED;

    const skipForming = !!(opts && opts.skipForming);

    const enemyUnits  = getEnemyUnits();
    const playerUnits = getPlayerUnits();

    // Pick doctrine immediately so the first ADVANCING orders use the right shape.
    if (playerUnits.length) {
      const playerComp = analyseComposition(playerUnits);
      const enemyComp  = analyseComposition(enemyUnits);
      _doctrine       = pickDoctrine(playerComp, enemyComp);
      _formationShape = pickFormationShape(enemyComp, _personality);
    } else {
      _doctrine       = 'COMBINED_ARMS';
      _formationShape = 'LINE';
    }

    if (skipForming) {
      _phase = 'ADVANCING';
    } else {
      _phase = 'FORMING';
    }

    if (enemyUnits.length && playerUnits.length) {
      deepResetUnits(enemyUnits);
      const groups = groupUnits(enemyUnits);
      assignProtection(groups);
      if (skipForming) {
        const playerCentroid = centroid(playerUnits);
        executePhase('ADVANCING', groups, playerUnits, playerCentroid);
      } else {
        executeForming(enemyUnits);
      }
    }

    _tickInterval = setInterval(tick, STRAT_TICK_MS);

    if (typeof console !== 'undefined' && console.log) {
      console.log('[EnemyLandStrategyAI] start() OK -> doctrine=' + _doctrine +
        ' personality=' + _personality + ' formation=' + _formationShape +
        ' phase=' + _phase + ' skipForming=' + skipForming +
        ' | enemyUnits=' + enemyUnits.length + ' playerUnits=' + playerUnits.length);
      if (!enemyUnits.length || !playerUnits.length) {
        console.warn('[EnemyLandStrategyAI] WARNING: started with ' + enemyUnits.length +
          ' enemy / ' + playerUnits.length + ' player units. The tick() function will ' +
          'teardown() on its first run if either is still 0 once it fires — set ' +
          'window.__ELSAI_DEBUG__ = true and watch for "tick() teardown" logs.');
      }
    }
  }

  function stop () {
    if (typeof console !== 'undefined' && console.log) {
      console.log('[EnemyLandStrategyAI] stop() called' + (_routedToLegacy ? ' (was routed to legacy)' : ''));
    }
    if (_routedToLegacy && W._EnemyTacticalAILegacy && typeof W._EnemyTacticalAILegacy.stop === 'function') {
      W._EnemyTacticalAILegacy.stop();
      _routedToLegacy = false;
      return;
    }
    teardown();
  }

  function getPhase () { return _phase; }
  function getDoctrine () { return _doctrine; }
  function getPersonality () { return _personality; }
  function isRoutedToLegacy () { return _routedToLegacy; }

  // ════════════════════════════════════════════════════════════════════════
  //  INSTALL  --  patch EnemyTacticalAI so existing callers route through us
  // ════════════════════════════════════════════════════════════════════════
  // Preserve the legacy object so we can forward river/siege/naval to it.
  if (W.EnemyTacticalAI && !W._EnemyTacticalAILegacy) {
    W._EnemyTacticalAILegacy = W.EnemyTacticalAI;
  }

  W.EnemyLandStrategyAI = { start, stop, getPhase, getDoctrine, getPersonality, isRoutedToLegacy };

  // Override the public surface used by battlefield_launch.js / battlefield_logic.js.
  // For LAND battles, our advanced AI runs.  For river/naval/siege, we forward
  // to the legacy implementation so its battle-specific phases keep working.
  W.EnemyTacticalAI = {
    start:           start,
    stop:            stop,
    getPhase:        getPhase,
    getDoctrine:     getDoctrine,
    getPersonality:  getPersonality,
    isRoutedToLegacy: isRoutedToLegacy,
  };

  // DEBUG: set window.__ELSAI_DEBUG__ = true in the browser console (before
  // or during a battle) to turn on verbose phase-transition / heartbeat
  // logging. Leave it false/unset for normal play -- it's silent by default.
  // Useful console commands while debugging:
  //   window.__ELSAI_DEBUG__ = true
  //   window.EnemyLandStrategyAI.getPhase()        -> 'FORMING'/'ADVANCING'/'SKIRMISHING'/'CHARGING'/'COHESION'/'IDLE'
  //   window.EnemyLandStrategyAI.getDoctrine()     -> e.g. 'HAMMER_AND_ANVIL'
  //   window.EnemyLandStrategyAI.isRoutedToLegacy() -> true means the OLD AI is running, not this file

})(window);

/*
 * ============================================================================
 * INTEGRATION NOTES
 * ============================================================================
 *
 * 1. SCRIPT ORDER
 *    Load AFTER enemyTacticalAI.js so we can preserve its API as a legacy
 *    fallback for river/naval/siege:
 *      <script src="battle_engine/enemyCommanderAI.js"></script>
 *      <script src="battle_engine/enemyTacticalAI.js"></script>
 *      <script src="battle_engine/enemyLandStrategyAI.js"></script>   <-- new
 *      <script src="battle_engine/ai_categories.js"></script>
 *
 * 2. NO CALLER CHANGES REQUIRED
 *    battlefield_launch.js calls EnemyTacticalAI.start() and battlefield_logic.js
 *    calls EnemyTacticalAI.stop().  This file overrides those entry points and
 *    routes them appropriately, so no changes are needed in those files.
 *
 * 3. BATTLE TYPE ROUTING
 *      LAND (default, custom, sandbox)  -> THIS AI runs
 *      RIVER                            -> legacy AI runs (river logic intact)
 *      SIEGE                            -> nothing runs (siege has its own AI)
 *      NAVAL / COASTAL / OCEAN          -> nothing runs (naval has its own AI)
 *
 * 4. COMMANDER UNTOUCHED
 *    processEnemyCommanderAI continues to run; we explicitly skip isCommander
 *    units in every group/order routine.  The crisis bodyguard logic still
 *    pulls cav + archers to the general when his HP drops below 50%.
 *
 * 5. SANDBOX / CUSTOM BATTLE COMPATIBLE
 *    The AI keys off window.battleEnvironment, the same surface custom and
 *    sandbox battles use.  No mode-specific code paths.
 *
 * 6. MOBILE PERFORMANCE
 *      - One strategy tick = 500 ms (2 Hz) up through CHARGING.
 *      - After CHARGING, a separate COHESION heartbeat runs at ~900 ms
 *        (slower; only scans idle units, see section below) instead of the
 *        AI shutting down entirely -- still cheap (skips anyone fighting).
 *      - Squared-distance comparisons used wherever distances are only sorted.
 *      - Group arrays are rebuilt per tick (cheap; typical N<60) instead of
 *        kept in cross-tick state, which would race against unit deaths.
 *      - No allocations inside inner loops (Math.hypot / Math.atan2 only).
 *
 * 7. DOCTRINES AT A GLANCE
 *      ANTI_CAV_RING    -> ring of melee around shooters, cav in reserve
 *      SHIELD_PUSH      -> aggressive infantry push against ranged armies
 *      SKIRMISH_HUNT    -> hunt enemy horse archers with own cav
 *      HAMMER_AND_ANVIL -> infantry pins, cav waits then flanks
 *      DEFENSIVE_HOLD   -> outnumbered fallback; shorten advance, hold ground
 *      COMBINED_ARMS    -> default balanced approach
 *
 * 8. PERSONALITIES
 *      Picked at random at start().  Each modulates skirmish duration, commit
 *      distances, retreat instinct, hammer-hold timing, and kite range.  This
 *      makes back-to-back battles with the same army feel different.
 *
 * 8b. PHASES
 *      IDLE -> FORMING -> ADVANCING -> SKIRMISHING -> CHARGING -> COHESION
 *      COHESION is NOT terminal -- it runs for the rest of the battle (or
 *      until stop()/teardown() is called), continuously pulling isolated,
 *      not-currently-fighting units back toward the nearest ally cluster.
 *      Tune via COHESION_TICK_MS / COHESION_LONE_RADIUS / COHESION_ENGAGED_DIST.
 *
 * 9. EXTENDING
 *      To add a new doctrine: add a branch in pickDoctrine(), add positioning
 *      branches in calcAdvanceTarget(), and (optionally) micro-routine
 *      behaviours in the four micro* functions.
 *
 * ============================================================================
 */