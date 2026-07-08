/**
 * autoAttack.js  —  INTELLIGENT TACTICAL ENGINE  (v3 — Cohesive March)
 *
 *  LAND BATTLE PHASES:
 *    ASSESS → FORM_UP → COHESIVE_MARCH → SKIRMISH → CHARGE
 *
 *    KEY CHANGE (v3): COHESIVE_MARCH replaces the old MARCH.
 *    The formation centre only steps forward when _armyFormed() returns true
 *    (≥65 % of units are within tolerance of their slots).  Fast units (cavalry,
 *    mounted gunners) reach their rear slots and *wait* while slow infantry
 *    catches up to the front.  The whole line then advances as one.
 *    A safety valve forces a step after 10 consecutive "not formed" ticks so
 *    the AI never deadlocks against extremely slow or lagging units.
 *
 *  SPECIAL LAND SITUATIONS:
 *    SQUARE       – when enemy >70% melee cavalry (lancers/cataphracts)
 *    SHIELD_LINE  – when enemy >50% horse archers (keshig/zamburak)
 *    STANDARD     – default disciplined battle line
 *
 *  RIVER BATTLE:
 *    RIVER_BLOB → RIVER_ADVANCE → RIVER_FORM_UP → RIVER_CHARGE
 *    Units prefer dry ground but will cross water if they have been stuck
 *    (position delta < 6 px for 3+ consecutive ticks).  Stuck units receive
 *    a direct move order that bypasses water-nudging, letting them wade
 *    through rather than freeze indefinitely.
 *
 *  EMERGENCY PROTOCOL (any phase, any battle type):
 *    If player general HP < 20 % → cavalry and archers form a protective ring.
 *    (Was checking 95% in code despite this comment saying 50% — fired on
 *    almost any scratch. Both now match at 20%.)
 *
 *  BUG FIX — "units run away despite high morale":
 *    The retreatDetected killswitch has been permanently removed.
 *    The interval stops only on explicit manual override or battle end.
 *
 *  UNTOUCHED: Naval and Siege logic are unchanged.
 */
;(function (W, D) {
  'use strict';

  // ═════════════ 
  //  MODULE STATE
  // ═════════════ 
  let tacticalInterval = null;
  let autoBtn          = null;
  let manualBtn        = null;
  let isManualMode     = false;
  let autoRunning      = false;

  // ══════════════════════════════════════════════════════════════════════════
  //  POLL: Wait for Mobile Controls UI before injecting buttons
  // ══════════════════════════════════════════════════════════════════════════
  const poll = setInterval(() => {
    if (W.MobileControls && D.getElementById('mc3-hrow')) {
      clearInterval(poll);
      initLazyButtons();
    }
  }, 500);

  // ══════════════════════════════════════════════════════════════════════════
  //  BUTTON SETUP
  // ══════════════════════════════════════════════════════════════════════════
  function initLazyButtons() {
    if (D.getElementById('mc3-tactical-container')) return;
    const hrow = D.getElementById('mc3-hrow');

    const container = D.createElement('div');
    container.id = 'mc3-tactical-container';
    container.style.cssText =
      'display:flex;gap:8px;align-items:center;margin:0 5px;';

    autoBtn = D.createElement('button');
    autoBtn.id = 'mc3-lazy-auto';
    autoBtn.setAttribute('type', 'button');
    autoBtn.className = 'mc3-btn mc3-toggle-btn';
    autoBtn.innerHTML = '🤖';
// AFTER
    autoBtn.style.cssText =
      'color:#ff5722;border-color:#ffca28;flex:1;transition:opacity 0.2s;pointer-events:auto;opacity:1;' +
      'display:flex;align-items:center;justify-content:center;padding:4px;' + // Ensure centering
 'font-size:clamp(28px, 10vw, 48px);line-height:1;font-family:"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;';

    manualBtn = D.createElement('button');
    manualBtn.id = 'mc3-manual-override';
    manualBtn.setAttribute('type', 'button');
    manualBtn.className = 'mc3-btn mc3-toggle-btn';
    manualBtn.innerHTML = '🛑';
// AFTER
    manualBtn.style.cssText =
      'color:#f44336;border-color:#f44336;flex:1;transition:opacity 0.2s;pointer-events:none;opacity:0.4;' +
      'display:flex;align-items:center;justify-content:center;padding:4px;' + // Ensure centering
  'font-size:clamp(28px, 10vw, 48px);line-height:1;font-family:"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;';
    let lastFire = 0;

    // ── Auto button (turn ON) ───────────────────────────────────────────────
    const fireAuto = (ev) => {
      if (autoRunning) return;

      // Sieges are now supported (Smart Siege Assault AI) — the old
      // "Disabled in sieges" block/toast has been removed. isSiegeNow()
      // further down just picks which branch triggerTacticalAssault() runs.

      const now = Date.now();
      if (now - lastFire < 500) return;
      lastFire = now;
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      autoBtn.classList.add('pressed');
      setTimeout(() => autoBtn.classList.remove('pressed'), 130);

      autoRunning  = true;
      isManualMode = false;
      autoBtn.style.pointerEvents  = 'none';
      manualBtn.style.pointerEvents = 'auto';
      manualBtn.style.opacity       = '1';

      // Pressing the robot button hands the WHOLE army to the AI: clear any
      // leftover selection / per-unit manual override so no unit is stranded
      // outside its control. NOTE: group buttons 1-5 are deliberately left
      // enabled here (the old "SURGERY 1: disable" block was removed) —
      // the player must still be able to select units WHILE the robot runs,
      // in order to peel individual units into manual control (see
      // getLivePlayers()'s _lazyManual check and lazyTakeManualControl()).
      {
        const env0 = _env();
        if (env0 && env0.units) {
          env0.units.forEach(u => {
            if (u.side === 'player') { u.selected = false; u._lazyManual = false; u.disableAICombat = false; }
          });
        }
      }

      triggerTacticalAssault();
    };

    // ── Manual button (killswitch) ──────────────────────────────────────────
    const toggleManual = (ev) => {
      if (!autoRunning) return;
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
     autoRunning  = false;
      isManualMode = true;
      autoBtn.style.pointerEvents  = 'auto';
      autoBtn.innerHTML            = '🤖';
      manualBtn.style.pointerEvents = 'none';
      manualBtn.style.opacity       = '0.4';

      // SURGERY 2: Re-enable RTSControls group buttons 1-5
      for (let i = 1; i <= 5; i++) {
        let gBtn = D.getElementById('mc3-g' + i);
        if (gBtn) { gBtn.style.pointerEvents = 'auto'; gBtn.style.opacity = '1'; }
      }

      if (tacticalInterval) { clearInterval(tacticalInterval); tacticalInterval = null; }

      let env = _env();
      if (env && env.units) {
        const pu = env.units.filter(u => u.side === 'player');
        restoreSpeeds(pu);
        pu.forEach(u => {
          // _lazyManual = true here is what makes this the true GLOBAL stop:
          // it excludes every unit from getLivePlayers() above AND from
          // Lazy General AI's getLazyControlledUnits() in
          // battlefield_commands.js, so nothing keeps moving them.
          u.selected = false; u.hasOrders = true; u._lazyManual = true;
          u.orderType = 'hold_position'; u.vx = 0; u.vy = 0;
          u.orderTargetPoint = _safe(u.x, u.y);
        });
        if (typeof currentSelectionGroup !== 'undefined') currentSelectionGroup = null;
        const UC = W.MobileControls && W.MobileControls.UnitCards;
        if (UC) { UC._snap = ''; UC.update(); }
      }
    };

    // ── Command-triggered revert (NEW) ──────────────────────────────────────
    // Distinct from toggleManual() above on purpose: toggleManual() is what
    // the 🛑 button does, and it deliberately force-overwrites EVERY player
    // unit's order to hold_position — that's correct for an explicit "stop
    // everything" press, but wrong here. This function is called right after
    // the player has already issued a real order/formation/move command (see
    // RTSControls.js Cmd.* and the desktop keydown switch in
    // battlefield_commands.js) — the order itself has already gone through,
    // so this must ONLY flip the robot button back to manual/off. It must
    // NOT touch unit orders, or it would silently undo the very command the
    // player just gave.
    // REVISED: this used to force-flip the GLOBAL robot flag to "off" (and
    // kill tacticalInterval outright) the instant ANY single unit received a
    // manual command — which stopped the robot AI for the WHOLE army, not
    // just the commanded unit(s). That directly conflicted with the per-unit
    // model: selecting/commanding a unit should only pull THAT unit out of
    // the robot's control; every other unit must keep running the robot AI
    // untouched, in every battle type (land/river/siege/naval).
    //
    // The per-unit exclusion now happens on its own: battlefield_commands.js
    // sets unit._lazyManual = true the moment a unit is selected or given an
    // order (lazyTakeManualControl), and getLivePlayers() above filters
    // _lazyManual units out of every tick automatically. So this hook no
    // longer needs to touch autoRunning/isManualMode or the interval at all.
    // Kept as a no-op (instead of deleted) purely so the existing callers in
    // battlefield_commands.js (_mc3RevertRobotOnCommand) keep working.
    const revertToManualOnCommand = () => {
      // Intentionally does nothing to global state anymore — see comment above.
    };

    // Small public surface so other files (RTSControls.js Cmd.*, and the
    // desktop keydown handler in battlefield_commands.js) can trigger the
    // revert without reaching into this IIFE's closed-over state.
    W.MC3TacticalAI = W.MC3TacticalAI || {};
    W.MC3TacticalAI.isAutoRunning = () => autoRunning;
    W.MC3TacticalAI.revertToManualOnCommand = revertToManualOnCommand;
    // Lets a siege-start choke point (see siegebattle.js) simulate a real press
    // of the 🤖/🏯 button after a short randomized delay, instead of duplicating
    // fireAuto's setup (clearing selection/_lazyManual, flipping button state,
    // calling triggerTacticalAssault). Passing no event is safe — fireAuto only
    // touches ev when one is provided.
    W.MC3TacticalAI.triggerAutoPress = () => { if (!autoRunning) fireAuto(null); };

    autoBtn.addEventListener('touchstart',   fireAuto,     { passive: false });
    autoBtn.addEventListener('pointerdown',  fireAuto);
    manualBtn.addEventListener('touchstart', toggleManual, { passive: false });
    manualBtn.addEventListener('pointerdown',toggleManual);

    container.appendChild(autoBtn);
    container.appendChild(manualBtn);
    const g5 = D.getElementById('mc3-g5');
    if (g5) g5.after(container); else hrow.appendChild(container);

    // ── Battle / Siege state watcher ────────────────────────────────────────
    setInterval(() => {
      const inBattle = W.MobileControls && W.MobileControls.G.isBattle();
      container.style.display = inBattle ? 'flex' : 'none';
      if (inBattle) {
        const isSiege = typeof inSiegeBattle !== 'undefined' && inSiegeBattle;
        // 🏯 is now just a "you're in a siege" indicator, not a disabled state —
        // pressing it still runs Smart Siege Assault AI, same as 🤖 elsewhere.
        if (!autoRunning) {
          autoBtn.innerHTML = isSiege ? '🏯' : '🤖';
          autoBtn.style.opacity = '1';
        }
      }
if (!inBattle) {
        if (tacticalInterval) { clearInterval(tacticalInterval); tacticalInterval = null; }
        autoRunning = false; isManualMode = false;
        autoBtn.style.pointerEvents  = 'auto';
        autoBtn.innerHTML            = '🤖';
        autoBtn.style.opacity        = '1';
        manualBtn.style.pointerEvents = 'none';
        manualBtn.style.opacity       = '0.4';

        // SURGERY 3: Fail-safe reset for next battle
        for (let i = 1; i <= 5; i++) {
          let gBtn = D.getElementById('mc3-g' + i);
          if (gBtn) { gBtn.style.pointerEvents = 'auto'; gBtn.style.opacity = '1'; }
        }
      }
    }, 1000);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SHARED UTILITIES
  // ══════════════════════════════════════════════════════════════════════════

  function _env() {
    return (typeof battleEnvironment !== 'undefined') ? battleEnvironment : W.battleEnvironment;
  }

function _safe(x, y, margin = 50) {
    if (typeof W.getSafeMapCoordinates === 'function') {
      return W.getSafeMapCoordinates(x, y, margin);
    }
    
    // Default fallbacks
    let w = 2400;
    let h = 1600;
    
    // SURGERY: Dynamically read exact borders directly from the engine's canvas
    const env = _env();
    if (env && env.bgCanvas) {
      w = env.bgCanvas.width;
      h = env.bgCanvas.height;
    } else {
      // Legacy fallback just in case canvas isn't ready
      if (typeof BATTLE_WORLD_WIDTH !== 'undefined') w = BATTLE_WORLD_WIDTH;
      if (typeof BATTLE_WORLD_HEIGHT !== 'undefined') h = BATTLE_WORLD_HEIGHT;
    }
    
    return { 
      x: Math.max(margin, Math.min(x, w - margin)),
      y: Math.max(margin, Math.min(y, h - margin)) 
    };
  }

  function getFallbackRole(unit) {
    if (typeof W.getTacticalRole === 'function') return W.getTacticalRole(unit);
    if (typeof getTacticalRole === 'function') return getTacticalRole(unit);
    const r = String((unit.stats && unit.stats.role) || '').toUpperCase();
    if (['CAVALRY','HORSE_ARCHER','MOUNTED_GUNNER','CAMEL','ELEPHANT'].includes(r)) return 'CAVALRY';
    if (['ARCHER','CROSSBOW','THROWING'].includes(r))                                return 'RANGED';
    if (['GUNNER','FIRELANCE','BOMB','ROCKET'].includes(r))                          return 'GUNPOWDER';
    return 'INFANTRY';
  }

  function restoreSpeeds(units) {
    (units || []).forEach(u => {
      if (u.origSmartSpeed !== undefined && u.stats) {
        u.stats.speed = u.origSmartSpeed;
        delete u.origSmartSpeed;
      }
      // SURGERY: battlefield_commands.js's lazyBackupSpeed/lazySetSpeedScale
      // use a differently-named backup (_lazyOrigSpeed), so a unit whose
      // speed was scaled through that system wasn't being reverted by this
      // global kill-switch path at all. Cross-check both so neither system
      // can leave a unit permanently stuck at a scaled speed.
      if (u._lazyOrigSpeed !== undefined && u.stats) {
        u.stats.speed = u._lazyOrigSpeed;
        delete u._lazyOrigSpeed;
      }
    });
  }

  /** Centroid of unit array */
  function _centroid(units) {
    if (!units || !units.length) return { x: 0, y: 0 };
    let sx = 0, sy = 0;
    units.forEach(u => { sx += u.x; sy += u.y; });
    return { x: sx / units.length, y: sy / units.length };
  }

  /** Perpendicular vector (90° CCW rotation) */
  function _perp(ux, uy) { return { x: -uy, y: ux }; }

  /**
   * Check if a world coordinate lands on a deep-water tile (tile ID 4).
   */
  function _isWater(wx, wy) {
    const env = _env();
    if (!env || !env.grid) return false;
    const ts = typeof BATTLE_TILE_SIZE !== 'undefined' ? BATTLE_TILE_SIZE : 8;
    const tx = Math.floor(wx / ts);
    const ty = Math.floor(wy / ts);
    if (!env.grid[tx]) return false;
    return env.grid[tx][ty] === 4;
  }

  /** True if any water tile is within `radius` px of the unit */
  function _nearWater(unit, radius) {
    radius = radius || 180;
    for (let dx = -radius; dx <= radius; dx += 24) {
      for (let dy = -radius; dy <= radius; dy += 24) {
        if (_isWater(unit.x + dx, unit.y + dy)) return true;
      }
    }
    return false;
  }

  /** True when ≥65% of units are within `tol` px of their orderTargetPoint */
  function _armyFormed(units, tol) {
    tol = tol || 80;
    if (!units.length) return true;
    let ok = 0;
    units.forEach(u => {
      if (!u.orderTargetPoint) { ok++; return; }
      if (Math.hypot(u.x - u.orderTargetPoint.x, u.y - u.orderTargetPoint.y) < tol) ok++;
    });
    return (ok / units.length) >= 0.65;
  }

  /** Sort player units into tactical buckets */
  function _bucket(units) {
    const b = { shields: [], infantry: [], ranged: [], gunpowder: [], cavalry: [] };
    units.forEach(u => {
      const r   = getFallbackRole(u);
      const txt = String((u.unitType || '') + ' ' + (u.stats && u.stats.role || '')).toLowerCase();
      if      (r === 'CAVALRY')   b.cavalry.push(u);
      else if (r === 'GUNPOWDER') b.gunpowder.push(u);
      else if (r === 'RANGED')    b.ranged.push(u);
      else if (txt.match(/shield|pike|spear/)) b.shields.push(u);
      else                                      b.infantry.push(u);
    });
    return b;
  }

  /**
   * Assign a move_to_point order to one unit.
   * Caps march speed at `speed` if provided.
   */
  function _orderMove(unit, wx, wy, speed) {
    if (unit.origSmartSpeed === undefined && unit.stats) unit.origSmartSpeed = unit.stats.speed;
    if (speed && unit.stats) unit.stats.speed = Math.min(unit.stats.speed, speed);
    unit.hasOrders       = true;
    unit.orderType       = 'move_to_point';
    unit.selected        = true;
    unit.reactionDelay   = Math.floor(Math.random() * 8);
    unit.formationTimer  = 200;
    unit.orderTargetPoint = _safe(wx, wy);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  ENEMY COMPOSITION ANALYSIS
  //   Returns: { strategy, meleeCavPct, horseArchPct }
  //   strategy = "STANDARD" | "SQUARE" | "SHIELD_LINE"
  // ══════════════════════════════════════════════════════════════════════════
  function _analyzeEnemy(enemyUnits) {
    let meleeCav = 0, horseArch = 0;
    const total = Math.max(1, enemyUnits.length);

    enemyUnits.forEach(e => {
      const r   = getFallbackRole(e);
      const txt = String((e.unitType || '') + ' ' + (e.stats && e.stats.role || '') + ' ' +
                         (e.stats && e.stats.name || '')).toLowerCase();
      const isRangedCav = /\b(horse.?archer|keshig|zamburak|mounted.?gun)\b/.test(txt);

      if (r === 'CAVALRY') {
        if (isRangedCav) horseArch++;
        else             meleeCav++;
      }
    });

    const mCavPct  = meleeCav  / total;
    const hArchPct = horseArch / total;

    let strategy = 'STANDARD';
    if (mCavPct  > 0.70) strategy = 'SQUARE';
    else if (hArchPct > 0.50) strategy = 'SHIELD_LINE';

    return { strategy, meleeCavPct: mCavPct, horseArchPct: hArchPct };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  FORMATION BUILDERS
  //  All builders write formationOffsetX/Y onto each unit AND issue the
  //  initial move_to_point order.
  //
  //  Coordinate convention:
  //    (cx, cy)  = center of the formation on the map
  //    frontDir  = unit vector pointing TOWARD enemy
  //    sideDir   = perpendicular (left flank direction)
  //    ROW_STEP  = spacing between rows (positive = AWAY from enemy)
  //    COL_STEP  = spacing between units within a row
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * STANDARD battle line — infantry front, ranged second, cav rear.
   */
  function _buildStandardLine(units, cx, cy, frontDir, MARCH_SPEED) {
    const b    = _bucket(units);
    const side = _perp(frontDir.x, frontDir.y);
    const CSPC = 42;
    const RSPC = 55;

    const rows = [
      [...b.shields, ...b.infantry],
      [...b.ranged],
      [...b.gunpowder],
      [...b.cavalry],
    ];

    rows.forEach((group, rowIdx) => {
      if (!group.length) return;
      const rowCX = cx + (-frontDir.x) * RSPC * rowIdx;
      const rowCY = cy + (-frontDir.y) * RSPC * rowIdx;

      group.forEach((u, i) => {
        const colOff = (i - (group.length - 1) / 2) * CSPC;
        const wx = rowCX + side.x * colOff;
        const wy = rowCY + side.y * colOff;
        u.formationOffsetX = side.x * colOff + (-frontDir.x) * RSPC * rowIdx;
        u.formationOffsetY = side.y * colOff + (-frontDir.y) * RSPC * rowIdx;
        _orderMove(u, wx, wy, MARCH_SPEED);
      });
    });
  }

  /**
   * SQUARE formation — vs massed melee cavalry.
   * Infantry + shields on outer ring, ranged inside, cavalry at corners.
   */
  function _buildSquare(units, cx, cy, MARCH_SPEED) {
    const b = _bucket(units);

    const inner     = [...b.ranged, ...b.gunpowder];
    const innerSide = Math.ceil(Math.sqrt(Math.max(1, inner.length)));
    const innerSpc  = 30;
    inner.forEach((u, i) => {
      const col = i % innerSide;
      const row = Math.floor(i / innerSide);
      const ox = (col - (innerSide - 1) / 2) * innerSpc;
      const oy = (row - (innerSide - 1) / 2) * innerSpc;
      u.formationOffsetX = ox; u.formationOffsetY = oy;
      _orderMove(u, cx + ox, cy + oy, MARCH_SPEED);
    });

    const outer     = [...b.shields, ...b.infantry];
    const outerSide = Math.max(2, Math.ceil(Math.sqrt(Math.max(1, outer.length))));
    const outerSpc  = 44;
    outer.forEach((u, i) => {
      const col = i % outerSide;
      const row = Math.floor(i / outerSide);
      const ox = (col - (outerSide - 1) / 2) * outerSpc;
      const oy = (row - (outerSide - 1) / 2) * outerSpc;
      u.formationOffsetX = ox; u.formationOffsetY = oy;
      _orderMove(u, cx + ox, cy + oy, MARCH_SPEED);
    });

    const corners = [
      { ox: -(outerSide * outerSpc / 2 + 40), oy: -(outerSide * outerSpc / 2 + 40) },
      { ox:  (outerSide * outerSpc / 2 + 40), oy: -(outerSide * outerSpc / 2 + 40) },
      { ox: -(outerSide * outerSpc / 2 + 40), oy:  (outerSide * outerSpc / 2 + 40) },
      { ox:  (outerSide * outerSpc / 2 + 40), oy:  (outerSide * outerSpc / 2 + 40) },
    ];
    b.cavalry.forEach((u, i) => {
      const c = corners[i % corners.length];
      const jitter = { x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 20 };
      u.formationOffsetX = c.ox + jitter.x;
      u.formationOffsetY = c.oy + jitter.y;
      _orderMove(u, cx + c.ox + jitter.x, cy + c.oy + jitter.y, MARCH_SPEED);
    });
  }

  /**
   * SHIELD_LINE — vs horse archers.
   * Wide front, ranged second row, cavalry rear center, gunpowder at flanks.
   */
  function _buildShieldLine(units, cx, cy, frontDir, MARCH_SPEED) {
    const b    = _bucket(units);
    const side = _perp(frontDir.x, frontDir.y);
    const WIDE = 65;
    const RSPC = 60;

    const front = [...b.shields, ...b.infantry];
    front.forEach((u, i) => {
      const colOff = (i - (front.length - 1) / 2) * WIDE;
      const wx = cx + side.x * colOff;
      const wy = cy + side.y * colOff;
      u.formationOffsetX = side.x * colOff;
      u.formationOffsetY = side.y * colOff;
      _orderMove(u, wx, wy, MARCH_SPEED);
    });

    const halfFrontWidth = ((front.length - 1) / 2) * WIDE;
    b.ranged.forEach((u, i) => {
      const colOff = (i - (b.ranged.length - 1) / 2) * 44;
      const wx = cx + side.x * colOff + (-frontDir.x) * RSPC;
      const wy = cy + side.y * colOff + (-frontDir.y) * RSPC;
      u.formationOffsetX = side.x * colOff + (-frontDir.x) * RSPC;
      u.formationOffsetY = side.y * colOff + (-frontDir.y) * RSPC;
      _orderMove(u, wx, wy, MARCH_SPEED);
    });

    b.cavalry.forEach((u, i) => {
      const colOff = (i - (b.cavalry.length - 1) / 2) * 50;
      const wx = cx + side.x * colOff + (-frontDir.x) * RSPC * 2;
      const wy = cy + side.y * colOff + (-frontDir.y) * RSPC * 2;
      u.formationOffsetX = side.x * colOff + (-frontDir.x) * RSPC * 2;
      u.formationOffsetY = side.y * colOff + (-frontDir.y) * RSPC * 2;
      _orderMove(u, wx, wy, MARCH_SPEED);
    });

    const flankBase = halfFrontWidth + 60;
    b.gunpowder.forEach((u, i) => {
      const flip  = (i % 2 === 0) ? 1 : -1;
      const depth = Math.floor(i / 2) * 40;
      const colOff = flip * (flankBase + depth);
      const wx = cx + side.x * colOff + frontDir.x * 20;
      const wy = cy + side.y * colOff + frontDir.y * 20;
      u.formationOffsetX = side.x * colOff + frontDir.x * 20;
      u.formationOffsetY = side.y * colOff + frontDir.y * 20;
      _orderMove(u, wx, wy, MARCH_SPEED);
    });
  }

  /**
   * Re-issue move orders for all units based on their stored formationOffset*
   * relative to a new centre (advX, advY).  Used each time the march centre
   * is stepped forward during COHESIVE_MARCH.
   */
  function _marchFormation(units, advX, advY, MARCH_SPEED) {
    units.forEach(u => {
      if (u.origSmartSpeed === undefined && u.stats) u.origSmartSpeed = u.stats.speed;
      if (MARCH_SPEED && u.stats) u.stats.speed = Math.min(u.stats.speed, MARCH_SPEED);
      const ox = u.formationOffsetX || 0;
      const oy = u.formationOffsetY || 0;
      u.hasOrders        = true;
      u.orderType        = 'move_to_point';
      u.selected         = true;
      u.reactionDelay    = 0;
      u.orderTargetPoint = _safe(advX + ox, advY + oy);
    });
  }

  // ── Formation dispatcher ─────────────────────────────────────────────────
  function _applyFormation(units, cx, cy, frontDir, strategy, MARCH_SPEED) {
    if (strategy === 'SQUARE')           _buildSquare(units, cx, cy, MARCH_SPEED);
    else if (strategy === 'SHIELD_LINE') _buildShieldLine(units, cx, cy, frontDir, MARCH_SPEED);
    else                                 _buildStandardLine(units, cx, cy, frontDir, MARCH_SPEED);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  EMERGENCY GUARD RING
  // ══════════════════════════════════════════════════════════════════════════
  function _emergencyGuard(playerUnits, general) {
    const gx = general.x, gy = general.y;
    const b  = _bucket(playerUnits);

    b.cavalry.forEach((u, i) => {
      const angle = (i / Math.max(1, b.cavalry.length)) * Math.PI * 2;
      u.hasOrders = true; u.orderType = 'move_to_point';
      u.selected = true; u.reactionDelay = 0;
      u.orderTargetPoint = _safe(gx + Math.cos(angle) * 80, gy + Math.sin(angle) * 80);
    });

    b.ranged.forEach((u, i) => {
      const angle = (i / Math.max(1, b.ranged.length)) * Math.PI * 2;
      u.hasOrders = true; u.orderType = 'move_to_point';
      u.selected = true; u.reactionDelay = 0;
      u.orderTargetPoint = _safe(gx + Math.cos(angle) * 130, gy + Math.sin(angle) * 130);
    });

    [...b.shields, ...b.infantry, ...b.gunpowder].forEach(u => {
      if (u.orderType !== 'seek_engage') {
        u.hasOrders = true; u.orderType = 'seek_engage';
        u.orderTargetPoint = null; u.target = null;
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  MAIN ENTRY POINT
  // ══════════════════════════════════════════════════════════════════════════
  function triggerTacticalAssault() {
    if (isManualMode) return;
    const MC = W.MobileControls;
    if (!MC || !MC.G.isBattle()) return;

    let isForcedCharge = false;
    if (tacticalInterval) {
      clearInterval(tacticalInterval);
      tacticalInterval = null;
      isForcedCharge = true;
    }

    const env = _env();
    if (!env || !env.units) return;

    const getLivePlayers = () => env.units.filter(u => {
      const t = String(u.unitType || '').toLowerCase();
      return u.side === 'player' && u.hp > 0 && u !== W.player
        && !u.isCommander && t !== 'commander' && t !== 'general'
        // PER-UNIT OVERRIDE: a unit the player has selected/commanded is
        // flagged _lazyManual (see lazyTakeManualControl in
        // battlefield_commands.js) and must be left alone by every robot
        // branch below (_runLand/_runRiver/_runSiege/_runNaval) — it is
        // re-checked every tick since this function is called repeatedly.
        && !u._lazyManual;
    });
    const getLiveEnemies = () =>
      env.units.filter(u => u.side === 'enemy' && u.hp > 0 && !u.isDummy);
    const getGeneral = () =>
      env.units.find(u => u.side === 'player' && u.isCommander && u.hp > 0);

    let pUnits = getLivePlayers();
    let eUnits = getLiveEnemies();
    if (!pUnits.length || !eUnits.length) return;

    // ── Siege branch (NEW — Smart Siege Assault AI) ───────────────────────
    // Checked first: a siege is never naval/river, and must not fall through
    // to the naval/river/land branches below (those are for field battles).
    if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle) {
      _runSiege(env, MC, getLivePlayers, getLiveEnemies);
      return;
    }

    // ── Naval branch (UNTOUCHED) ──────────────────────────────────────────
    if (W.inNavalBattle) {
      _runNaval(env, MC, getLivePlayers, getLiveEnemies);
      return;
    }

    // ── Detect river via water tiles near player spawn area ───────────────
    const isRiver = (() => {
      if (typeof inRiverBattle !== 'undefined' && inRiverBattle) return true;
      let found = false;
      pUnits.slice(0, 6).forEach(u => { if (_nearWater(u, 220)) found = true; });
      return found;
    })();

    if (isRiver) {
      _runRiver(env, MC, getLivePlayers, getLiveEnemies, getGeneral);
    } else {
      _runLand(env, MC, getLivePlayers, getLiveEnemies, getGeneral, isForcedCharge);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SIEGE LOGIC  (NEW — Smart Siege Assault AI)
  //
  //  Reuses executeSiegeAssaultAI() from battlefield_commands.js, which does
  //  the actual troop categorization + ram/ladder/cavalry-reserve assignment.
  //  This function's job is just: (1) select everyone so the assignment call
  //  has something to work with, (2) run the assignment once immediately so
  //  units engage siege equipment right away instead of waiting idle, and
  //  (3) keep re-checking on a light interval so newly-arrived reinforcements
  //  or units whose ram/ladder got destroyed are picked back up automatically
  //  — without constantly reshuffling units that are already correctly busy.
  // ══════════════════════════════════════════════════════════════════════════
  function _runSiege(env, MC, getLivePlayers, getLiveEnemies) {
    if (typeof currentSelectionGroup !== 'undefined') currentSelectionGroup = 5;
    autoBtn.innerHTML = '🏯';
    // One-time guard for the fanatic/sniper role assignment below — this
    // runs on every runAssignment() tick (light interval), but the roll
    // should only happen once per siege, not re-roll every re-check.
    let fanaticSniperRolesAssigned = false;

    const runAssignment = () => {
      let pUnits = getLivePlayers();
      if (!pUnits.length) return;

      // SURGERY: +30% pace for units under active siege auto-attack control.
      // Reuses lazySetSpeedScale (battlefield_commands.js) rather than a new
      // ad-hoc multiplier — it already backs up/restores correctly, and both
      // revert paths (this file's global kill-switch, and
      // lazyTakeManualControl on manual selection) now check both backup
      // systems, so a unit can't get stuck boosted no matter which path the
      // player exits through. Idempotent: re-running this on an
      // already-boosted unit is a no-op beyond re-asserting 1.3x, so it's
      // safe to call on every light-interval tick, not just once.
      if (typeof lazySetSpeedScale === 'function') {
        pUnits.forEach(u => lazySetSpeedScale(u, 1.3));
      }

      // Only hand units to executeSiegeAssaultAI if they don't already have a
      // live siege assignment — this is what keeps the interval from fighting
      // its own previous assignment every tick. A unit needs (re)assignment if:
      //   - it has no siege_assault order yet (fresh unit / first press), or
      //   - its assigned ram/ladder/trebuchet has died (siegeTarget.hp <= 0), or
      //   - it's a ram_pusher/ladder_carrier stuck with no siegeTarget at all.
      const needsAssignment = pUnits.filter(u => {
        if (u.orderType !== 'siege_assault') return true;
        if ((u.siegeRole === 'ram_pusher' || u.siegeRole === 'ladder_carrier' ||
             u.siegeRole === 'trebuchet_crew') &&
            (!u.siegeTarget || u.siegeTarget.hp <= 0)) return true;
        return false;
      });

      if (needsAssignment.length && typeof W.executeSiegeAssaultAI === 'function') {
        W.executeSiegeAssaultAI(needsAssignment);
      } else if (needsAssignment.length && typeof executeSiegeAssaultAI === 'function') {
        executeSiegeAssaultAI(needsAssignment);
      }

      // SURGERY: ladder_fanatic / counter_battery roles used to be assigned
      // synchronously in enterSiegeBattlefield (siegebattle.js) the instant
      // troops were deployed, before the player or this function had done
      // anything — and orderType="ladder_crew" is picked up immediately by
      // ai_categories.js's processTargeting regardless of the auto-attack
      // button, so those units walked to a ladder on their own at siege
      // start. Moved here so it only happens the moment real automation
      // actually begins (this function runs whether that's the 1-3s
      // auto-press timer or a manual button press) — once per siege.
      if (!fanaticSniperRolesAssigned && typeof canUseSiegeEngines === 'function') {
        fanaticSniperRolesAssigned = true;
        let pUnitsForRoles = pUnits.filter(u => !u.isCommander);
        let validClimbers = pUnitsForRoles.filter(u => !u.stats?.isRanged && canUseSiegeEngines(u));
        let rangedTroops = pUnitsForRoles.filter(u => u.stats?.isRanged || String(u.stats?.role).toLowerCase().includes("archer"));

        let fanaticCount = Math.max(4, Math.floor(validClimbers.length * 0.1));
        for (let i = 0; i < fanaticCount; i++) {
          let rIdx = Math.floor(Math.random() * validClimbers.length);
          let u = validClimbers.splice(rIdx, 1)[0];
          if (u) {
            u.siegeRole = "ladder_fanatic";
            u.orderType = "ladder_crew";
            u.disableAICombat = true; // Ignore enemies, prioritize ladder entirely
          }
        }

        let sniperCount = Math.floor(rangedTroops.length * 0.20);
        for (let i = 0; i < sniperCount; i++) {
          let rIdx = Math.floor(Math.random() * rangedTroops.length);
          let u = rangedTroops.splice(rIdx, 1)[0];
          if (u) {
            u.siegeRole = "counter_battery";
          }
        }
      }
    };

    // Fire once immediately — this is the fix for units sitting idle after
    // the button is pressed instead of moving on rams/ladders right away.
    runAssignment();

    tacticalInterval = setInterval(() => {
      if (!MC.G.isBattle() || isManualMode) { _stopAI(getLivePlayers()); return; }
      if (typeof inSiegeBattle !== 'undefined' && !inSiegeBattle) {
        // Battle transitioned out of siege (shouldn't normally happen mid-battle,
        // but stop cleanly rather than keep calling siege-only assignment logic).
        clearInterval(tacticalInterval); tacticalInterval = null;
        triggerTacticalAssault();
        return;
      }
      const pUnits = getLivePlayers();
      const eUnits = getLiveEnemies();
      if (!pUnits.length || !eUnits.length) {
        clearInterval(tacticalInterval); tacticalInterval = null;
        autoBtn.innerHTML = '⏳';
        return;
      }
      runAssignment();
    }, 1500); // lighter cadence than field-battle AI — this is upkeep, not micro
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  NAVAL LOGIC  (UNTOUCHED)
  // ══════════════════════════════════════════════════════════════════════════
  function _runNaval(env, MC, getLivePlayers, getLiveEnemies) {
    if (typeof currentSelectionGroup !== 'undefined') currentSelectionGroup = 5;
    autoBtn.innerHTML = '⚓';
    let pUnits = getLivePlayers();

    tacticalInterval = setInterval(() => {
      if (!MC.G.isBattle() || isManualMode) { _stopAI(pUnits); return; }
      pUnits = getLivePlayers();
      const eUnits = getLiveEnemies();
      if (!pUnits.length || !eUnits.length) {
        clearInterval(tacticalInterval); tacticalInterval = null;
        autoBtn.innerHTML = '⏳'; return;
      }

      const cmdr   = env.units.find(u => u.side === 'player' && u.isCommander && u.hp > 0);
      const myShip = W.navalEnvironment && W.navalEnvironment.ships &&
                     W.navalEnvironment.ships.find(s => s.side === 'player');
      const fallback   = cmdr || myShip || pUnits[0];
      const safeAnchor = { x: fallback.x, y: fallback.y };

      // ── BOARDING: collision timer fired — fight like a normal land battle ────
      // _navalBoardingTimer is set by naval_battles.js the instant ships touch.
      // Matches the same flag checked by battlefield_logic.js for enemy units.
      // Force seek_engage and clear stale hold_position so processTargeting
      // (in battlefield_logic) can assign targets this frame.
      if (W._navalBoardingTimer) {
        pUnits.forEach(u => {
          if (u.isSwimming) {
            u.orderType = 'move_to_point'; u.target = null;
            u.orderTargetPoint = safeAnchor; return;
          }
          u.selected = true; u.hasOrders = true; u.isPatrolling = false;
          if (u.orderType === 'hold_position' || u.orderType === 'move_to_point' || !u.orderType) {
            u.orderType = 'seek_engage'; u.orderTargetPoint = null; u.target = null;
          }
        });
        const UC = MC.UnitCards;
        if (UC) { UC._snap = ''; UC.update(); }
        return;
      }

      pUnits.forEach(u => {
        u.selected = true; u.hasOrders = true;
        const surface = typeof W.getNavalSurfaceAt === 'function'
          ? W.getNavalSurfaceAt(u.x, u.y) : 'DECK';

        if (u.isSwimming || surface === 'WATER') {
          u.orderType = 'move_to_point'; u.target = null;
          u.orderTargetPoint = safeAnchor; return;
        }

        const r   = getFallbackRole(u);
        let near  = Infinity;
        eUnits.forEach(e => { const d = Math.hypot(u.x - e.x, u.y - e.y); if (d < near) near = d; });

        // Also measure how far away the enemy ship itself is (ship-to-ship distance
        // mirrors the 200px aggro threshold used on the enemy side in ai_categories.js,
        // so both sides start charging at the same moment as ships close in, not only
        // once grapple has already occurred).
        let enemyShipDist = Infinity;
        if (W.navalEnvironment && W.navalEnvironment.ships) {
          const eShip = W.navalEnvironment.ships.find(s => !s.isPlayerControlled);
          if (eShip) enemyShipDist = Math.hypot(u.x - eShip.x, u.y - eShip.y);
        }
        const nearAggroDist = Math.min(near, enemyShipDist);

        if ((r === 'INFANTRY' || r === 'CAVALRY') && nearAggroDist < 200) {
          u.orderType = 'seek_engage'; u.orderTargetPoint = null; u.isPatrolling = false;
        } else {
          const dtp = u.orderTargetPoint
            ? Math.hypot(u.x - u.orderTargetPoint.x, u.y - u.orderTargetPoint.y) : 0;
          if (!u.isPatrolling || dtp < 20) {
            let tx = safeAnchor.x, ty = safeAnchor.y;
            for (let i = 0; i < 8; i++) {
              const rx = safeAnchor.x + (Math.random() - 0.5) * 400;
              const ry = safeAnchor.y + (Math.random() - 0.5) * 400;
              if (typeof W.getNavalSurfaceAt === 'function' && W.getNavalSurfaceAt(rx, ry) === 'DECK') {
                tx = rx; ty = ry; break;
              }
            }
            u.orderType = 'move_to_point'; u.orderTargetPoint = { x: tx, y: ty };
            u.isPatrolling = true;
          }
        }
      });
      const UC = MC.UnitCards;
      if (UC) { UC._snap = ''; UC.update(); }
    }, 500);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  RIVER LOGIC  (v3)
  //
  //  Water is non-preferred: the pathfinder always tries dry routes first
  //  (forward → left → right → back).  However, if a unit has not moved
  //  more than STUCK_THRESHOLD px in STUCK_TICKS consecutive ticks it is
  //  considered "stuck" and its next order is issued without water-nudging
  //  so it can wade through rather than freeze in place forever.
  //
  //  Phases: RIVER_BLOB → RIVER_ADVANCE → RIVER_FORM_UP → RIVER_CHARGE
  // ══════════════════════════════════════════════════════════════════════════

  /** How little movement (px) in one tick counts as "stuck" */
  const STUCK_THRESHOLD = 6;
  /** How many consecutive stuck ticks before we allow water crossing */
  const STUCK_TICKS     = 3;

  function _runRiver(env, MC, getLivePlayers, getLiveEnemies, getGeneral) {
    let pUnits = getLivePlayers();
    let eUnits = getLiveEnemies();
    const pCent0 = _centroid(pUnits);
    const eCent0 = _centroid(eUnits);

    const raw = { x: eCent0.x - pCent0.x, y: eCent0.y - pCent0.y };
    const mag  = Math.max(1, Math.hypot(raw.x, raw.y));
    const fwd  = { x: raw.x / mag, y: raw.y / mag };

    // Safe staging point: step backward from centroid until on dry ground
    let stageX = pCent0.x, stageY = pCent0.y;
    for (let s = 0; s <= 10; s++) {
      const tx = pCent0.x - fwd.x * s * 18;
      const ty = pCent0.y - fwd.y * s * 18;
      if (!_isWater(tx, ty)) { stageX = tx; stageY = ty; }
    }

    let phase           = 'RIVER_BLOB';
    let emergencyActive = false;

    // Per-unit stuck tracking: Map<unit, { px, py, count }>
    const stuckTrack = new Map();

    autoBtn.innerHTML = '⏳';
    _issueBlobOrders(pUnits, stageX, stageY, stuckTrack);

    tacticalInterval = setInterval(() => {
      if (!MC.G.isBattle() || isManualMode) { _stopAI(getLivePlayers()); return; }

      pUnits = getLivePlayers();
      eUnits = getLiveEnemies();
      if (!pUnits.length || !eUnits.length) {
        clearInterval(tacticalInterval); tacticalInterval = null;
        autoBtn.innerHTML = '⏳'; return;
      }

      // ── Update stuck counters ──────────────────────────────────────────
      _updateStuck(pUnits, stuckTrack);

      // ── Emergency general guard ────────────────────────────────────────
      const gen = getGeneral();
      if (gen && gen.stats) {
        const maxHP  = gen.stats.health || gen.stats.maxHealth || 100;
        const hpPct  = gen.hp / maxHP;
        if (hpPct < 0.20 && !emergencyActive) {
          emergencyActive = true;
          autoBtn.innerHTML = '🆘';
        }
      }
      if (emergencyActive) {
        if (!gen || gen.hp <= 0) { emergencyActive = false; }
        else { _emergencyGuard(pUnits, gen); return; }
      }

      const pC   = _centroid(pUnits);
      const eC   = _centroid(eUnits);
      const dist = Math.hypot(pC.x - eC.x, pC.y - eC.y);

      // ── RIVER_BLOB ─────────────────────────────────────────────────────
      if (phase === 'RIVER_BLOB') {
        autoBtn.innerHTML = '🚩';
        if (_armyFormed(pUnits, 85) || dist < 480) {
          phase = 'RIVER_ADVANCE';
        } else {
          _issueBlobOrders(pUnits, pC.x, stageY, stuckTrack);
        }

      // ── RIVER_ADVANCE ──────────────────────────────────────────────────
      } else if (phase === 'RIVER_ADVANCE') {
        autoBtn.innerHTML = '🚶';

        if (dist <= 1000) {
          // Close enough — form up before charging
          phase = 'RIVER_FORM_UP';
          autoBtn.innerHTML = '🚩';
          const toE = { x: eC.x - pC.x, y: eC.y - pC.y };
          const toM = Math.max(1, Math.hypot(toE.x, toE.y));
          const frontDir = { x: toE.x / toM, y: toE.y / toM };
          _applyFormation(pUnits, pC.x, pC.y, frontDir, 'STANDARD', 1.3);
        } else {
          // Pathfind forward, prefer dry ground, allow water if stuck
          const toE  = { x: eC.x - pC.x, y: eC.y - pC.y };
          const toM  = Math.max(1, Math.hypot(toE.x, toE.y));
          const fwdV = { x: toE.x / toM, y: toE.y / toM };
          const left = _perp(fwdV.x, fwdV.y);

          let nx = pC.x + fwdV.x * 28;
          let ny = pC.y + fwdV.y * 28;

          if (_isWater(nx, ny)) {
            // Try left
            nx = pC.x + left.x * 28; ny = pC.y + left.y * 28;
            if (_isWater(nx, ny)) {
              // Try right
              nx = pC.x - left.x * 28; ny = pC.y - left.y * 28;
              if (_isWater(nx, ny)) {
                // Back — unstick
                nx = pC.x - fwdV.x * 28; ny = pC.y - fwdV.y * 28;
              }
            }
          }
          _issueBlobOrders(pUnits, nx, ny, stuckTrack);
        }

      // ── RIVER_FORM_UP ──────────────────────────────────────────────────
      } else if (phase === 'RIVER_FORM_UP') {
        const riverFormed = _armyFormed(pUnits, 80);
        autoBtn.innerHTML = riverFormed ? '🚩' : '🤔';
        if (riverFormed) {
          phase = 'RIVER_CHARGE';
        }

      // ── RIVER_CHARGE ───────────────────────────────────────────────────
      } else if (phase === 'RIVER_CHARGE') {
        autoBtn.innerHTML = '⚔️';
        restoreSpeeds(pUnits);
        pUnits.forEach(u => {
          u.hasOrders = true; u.orderType = 'seek_engage';
          u.orderTargetPoint = null; u.target = null; u.selected = false;
        });
        if (typeof currentSelectionGroup !== 'undefined') currentSelectionGroup = null;
        if (typeof W.AudioManager !== 'undefined') W.AudioManager.playSound('charge');
        clearInterval(tacticalInterval); tacticalInterval = null;
        setTimeout(() => { if (autoBtn && !isManualMode) autoBtn.innerHTML = '⏳'; }, 2000);
      }

    }, 500);
  }

  /**
   * Increment stuck counters for units that have barely moved.
   * Resets counter when movement is detected.
   */
  function _updateStuck(units, stuckTrack) {
    units.forEach(u => {
      const prev = stuckTrack.get(u);
      if (!prev) {
        stuckTrack.set(u, { px: u.x, py: u.y, count: 0 });
        return;
      }
      const moved = Math.hypot(u.x - prev.px, u.y - prev.py);
      if (moved < STUCK_THRESHOLD) {
        prev.count++;
      } else {
        prev.count = 0;
      }
      prev.px = u.x;
      prev.py = u.y;
    });
  }

  /**
   * Issue compact blob orders toward (cx, cy).
   *
   * Water avoidance: each slot is nudged inward (toward centre) if it lands
   * on water — UNLESS the unit is considered stuck (stuckTrack.count ≥
   * STUCK_TICKS), in which case the nudge is skipped and the unit wades
   * through to escape its frozen state.
   */
  function _issueBlobOrders(units, cx, cy, stuckTrack) {
    const N    = units.length;
    const side = Math.ceil(Math.sqrt(N));
    const SPC  = 34;

    units.forEach((u, i) => {
      const col = i % side;
      const row = Math.floor(i / side);
      let ox = (col - (side - 1) / 2) * SPC + (Math.random() - 0.5) * 8;
      let oy = (row - (side - 1) / 2) * SPC + (Math.random() - 0.5) * 8;

      // Only water-nudge if this unit is NOT stuck
      const stuck = stuckTrack && stuckTrack.get(u);
      const isStuck = stuck && stuck.count >= STUCK_TICKS;

      if (!isStuck) {
        for (let step = 1; step <= 8 && _isWater(cx + ox, cy + oy); step++) {
          ox *= 0.75; oy *= 0.75;
        }
      }
      // If still on water after nudging (or unit is stuck), proceed anyway —
      // the unit is allowed to wade through to break the deadlock.

      u.hasOrders = true; u.orderType = 'move_to_point';
      u.selected  = true; u.reactionDelay = Math.floor(Math.random() * 5);
      u.orderTargetPoint = _safe(cx + ox, cy + oy);
      if (u.origSmartSpeed === undefined && u.stats) u.origSmartSpeed = u.stats.speed;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  LAND BATTLE LOGIC  (v3 — COHESIVE MARCH)
  //
  //  PHASES:
  //    FORM_UP         – units move to initial slots ~180 px ahead of centroid.
  //    COHESIVE_MARCH  – the formation centre advances 25 px per step ONLY
  //                      when _armyFormed() returns true (≥65 % at slots).
  //                      Fast cavalry reach their rear slots and hold until the
  //                      infantry line fills in before the whole formation
  //                      moves.  A safety valve forces a step after 10
  //                      consecutive "not formed" ticks to prevent deadlock.
  //    SKIRMISH        – ranged fires freely; melee + cav hold the line.
  //    CHARGE          – all seek_engage; interval terminates.
  // ══════════════════════════════════════════════════════════════════════════
  function _runLand(env, MC, getLivePlayers, getLiveEnemies, getGeneral, isForcedCharge) {
    let pUnits = getLivePlayers();
    let eUnits = getLiveEnemies();

    const MARCH_SPEED    = 1.3;  // px/frame cap during cohesive advance
    const MARCH_STEP     = 25;   // px the formation centre moves per tick when formed
    const FORM_TOL       = 78;   // px — tolerance for _armyFormed in FORM_UP
    const MARCH_TOL      = 85;   // px — tolerance for _armyFormed in COHESIVE_MARCH
    const STUCK_VALVE    = 10;   // ticks before forcing a step despite not formed
    const SKIRMISH_DIST  = 440;  // px from nearest enemy — stop advancing
    const CHARGE_DIST    = 175;  // px — release the charge
    const BASE_SKIM_TICK = 10;   // ticks of skirmish at 500ms each

    // ── 1. Assess enemy composition and pick strategy ──────────────────────
    const comp     = _analyzeEnemy(eUnits);
    const strategy = comp.strategy;
    const SKIM_TICKS = strategy === 'SQUARE'       ? Math.round(BASE_SKIM_TICK * 1.5)
                     : strategy === 'SHIELD_LINE'  ? Math.round(BASE_SKIM_TICK * 2.0)
                     : BASE_SKIM_TICK;

    // ── 2. Calculate initial staging positions ─────────────────────────────
    const pCent  = _centroid(pUnits);
    const eCent  = _centroid(eUnits);
    const rawDir = { x: eCent.x - pCent.x, y: eCent.y - pCent.y };
    const rawMag = Math.max(1, Math.hypot(rawDir.x, rawDir.y));
    const frontDir = { x: rawDir.x / rawMag, y: rawDir.y / rawMag };

    // Formation centre starts 180 px in front of the player centroid
    let marchX = pCent.x + frontDir.x * 180;
    let marchY = pCent.y + frontDir.y * 180;

    // ── 3. Issue initial form-up orders ────────────────────────────────────
    let phase          = isForcedCharge ? 'CHARGE' : 'FORM_UP';
    let skirmTicks     = 0;
    let emergActive    = false;
    let stuckMarchTick = 0; // safety valve counter for COHESIVE_MARCH

    if (phase === 'FORM_UP') {
      autoBtn.innerHTML = '🚩';
      _applyFormation(pUnits, marchX, marchY, frontDir, strategy, MARCH_SPEED);
    }

    if (typeof currentSelectionGroup !== 'undefined') currentSelectionGroup = 5;

    // ── 4. Tactical interval ───────────────────────────────────────────────
    tacticalInterval = setInterval(() => {

      if (!MC.G.isBattle() || isManualMode) {
        _stopAI(getLivePlayers()); return;
      }

      pUnits = getLivePlayers();
      eUnits = getLiveEnemies();
      if (!pUnits.length || !eUnits.length) {
        clearInterval(tacticalInterval); tacticalInterval = null;
        autoBtn.innerHTML = '⏳'; return;
      }

      // ── Emergency general guard (overrides any phase) ──────────────────
      const gen = getGeneral();
      if (gen && gen.stats) {
        const maxHP = gen.stats.health || gen.stats.maxHealth || 100;
        if (gen.hp / maxHP < 0.20 && !emergActive) {
          emergActive = true;
          autoBtn.innerHTML = '🆘';
        }
      }
      if (emergActive) {
        if (!gen || gen.hp <= 0) { emergActive = false; }
        else { _emergencyGuard(pUnits, gen); return; }
      }

      // ── Distances ─────────────────────────────────────────────────────
      const pC      = _centroid(pUnits);
      const eC      = _centroid(eUnits);
      let minDist   = Infinity;
      let meleeDist = Infinity;
      pUnits.forEach(p => {
        const rp = getFallbackRole(p);
        eUnits.forEach(e => {
          const d = Math.hypot(p.x - e.x, p.y - e.y);
          if (d < minDist) minDist = d;
          if (rp !== 'RANGED' && rp !== 'GUNPOWDER' && d < meleeDist) meleeDist = d;
        });
      });

      // ── FORM_UP ────────────────────────────────────────────────────────
      if (phase === 'FORM_UP') {
        autoBtn.innerHTML = '🚩';
        const formed = _armyFormed(pUnits, FORM_TOL);
        if (formed || minDist < SKIRMISH_DIST + 120) {
          phase = 'COHESIVE_MARCH';
          autoBtn.innerHTML = '🚶';
          // Anchor the march centre to the army's actual current position
          marchX = pC.x + frontDir.x * 60;
          marchY = pC.y + frontDir.y * 60;
          stuckMarchTick = 0;
        } else {
          // Waiting on stragglers — units are genuinely holding position
          // here, not stuck/broken, so say so instead of leaving 🚩 up.
          autoBtn.innerHTML = '🤔';
          // Re-nudge any unit that has drifted very far from its slot
          pUnits.forEach(u => {
            if (!u.orderTargetPoint) return;
            if (Math.hypot(u.x - u.orderTargetPoint.x, u.y - u.orderTargetPoint.y) > 260) {
              _orderMove(u, u.orderTargetPoint.x, u.orderTargetPoint.y, MARCH_SPEED);
            }
          });
        }
        return;
      }

      // ── COHESIVE_MARCH ─────────────────────────────────────────────────
      //
      //  Core principle: only advance the formation centre when the army is
      //  sufficiently formed.  This forces fast units (cavalry, mounted
      //  gunners) to hold their rear slots while slower infantry catches up,
      //  so the entire line moves as one cohesive body rather than having
      //  fast units sprint ahead alone.
      //
      if (phase === 'COHESIVE_MARCH') {
        autoBtn.innerHTML = '🚶';

        // Transition to SKIRMISH when close enough
        if (minDist <= SKIRMISH_DIST) {
          phase = 'SKIRMISH';
          autoBtn.innerHTML = '🏹';
          skirmTicks = 0;
          _issueSkirmishOrders(pUnits);
          return;
        }

        const formed = _armyFormed(pUnits, MARCH_TOL);

        if (formed) {
          // ✓ Army is in position → step the formation centre forward
          autoBtn.innerHTML = '🚶';
          stuckMarchTick = 0;
          const toE = { x: eC.x - marchX, y: eC.y - marchY };
          const toM = Math.max(1, Math.hypot(toE.x, toE.y));
          marchX += (toE.x / toM) * MARCH_STEP;
          marchY += (toE.y / toM) * MARCH_STEP;
          _marchFormation(pUnits, marchX, marchY, MARCH_SPEED);
        } else {
          // ✗ Army not yet formed → nudge stragglers, wait for them.
          // The formation centre isn't stepping this tick, so say so —
          // otherwise this reads as frozen/stuck rather than deliberately
          // holding for slower units to catch up.
          autoBtn.innerHTML = '🤔';
          stuckMarchTick++;

          // Re-issue orders only to units that have significantly drifted
          // from their target slot (avoids spamming every unit every tick)
          pUnits.forEach(u => {
            if (!u.orderTargetPoint) return;
            const d = Math.hypot(u.x - u.orderTargetPoint.x,
                                  u.y - u.orderTargetPoint.y);
            // If a unit is very far from its slot, refresh its order so it
            // doesn't give up and wander
            if (d > 120) {
              _orderMove(u, u.orderTargetPoint.x, u.orderTargetPoint.y, MARCH_SPEED);
            }
          });

          // Safety valve: if too many ticks pass with the army not formed
          // (e.g. a unit is permanently stuck on terrain), force the step
          // anyway so the advance doesn't deadlock forever.
          if (stuckMarchTick >= STUCK_VALVE) {
            autoBtn.innerHTML = '🚶'; // forcing the step — actually moving again
            stuckMarchTick = 0;
            const toE = { x: eC.x - marchX, y: eC.y - marchY };
            const toM = Math.max(1, Math.hypot(toE.x, toE.y));
            marchX += (toE.x / toM) * MARCH_STEP;
            marchY += (toE.y / toM) * MARCH_STEP;
            _marchFormation(pUnits, marchX, marchY, MARCH_SPEED);
          }
        }
        return;
      }

      // ── SKIRMISH ───────────────────────────────────────────────────────
      if (phase === 'SKIRMISH') {
        autoBtn.innerHTML = '🏹';
        skirmTicks++;

        // Refresh skirmish orders every 3 ticks (ranged targets shift)
        if (skirmTicks % 3 === 0) _issueSkirmishOrders(pUnits);

        if (skirmTicks >= SKIM_TICKS || meleeDist <= CHARGE_DIST) {
          phase = 'CHARGE';
        }
        return;
      }

      // ── CHARGE ─────────────────────────────────────────────────────────
      if (phase === 'CHARGE') {
        autoBtn.innerHTML = '⚔️';
        restoreSpeeds(pUnits);
        pUnits.forEach(u => {
          u.hasOrders = true; u.orderType = 'seek_engage';
          u.orderTargetPoint = null; u.target = null; u.selected = false;
        });
        if (typeof currentSelectionGroup !== 'undefined') currentSelectionGroup = null;
        const UC = MC.UnitCards;
        if (UC) { UC._snap = ''; UC.update(); }
        if (typeof W.AudioManager !== 'undefined') W.AudioManager.playSound('charge');
        clearInterval(tacticalInterval); tacticalInterval = null;
        setTimeout(() => { if (autoBtn && !isManualMode) autoBtn.innerHTML = '⏳'; }, 2000);
      }

    }, 500);
  }

  /**
   * Skirmish-phase orders:
   *   – Ranged + gunpowder → seek_engage (fire at will)
   *   – Melee infantry + shields → hold_position (stand the line)
   *   – Cavalry → hold_position (held back for the charge impact)
   */
function _issueSkirmishOrders(units) {
    units.forEach(u => {
      const r      = getFallbackRole(u);
      const isRngd = r === 'RANGED' || r === 'GUNPOWDER';

      if (isRngd) {
        // Restore original speed if they had one
        if (u.origSmartSpeed !== undefined && u.stats) {
          u.stats.speed = u.origSmartSpeed; delete u.origSmartSpeed;
        }
        // SURGERY: Force them to hold position instead of seeking engagement
        u.hasOrders = true; 
        u.orderType = 'hold_position';
        u.vx = 0; u.vy = 0;
        u.orderTargetPoint = _safe(u.x, u.y);
      } else {
        u.hasOrders = true; 
        u.orderType = 'hold_position';
        u.vx = 0; u.vy = 0;
        u.orderTargetPoint = _safe(u.x, u.y);
      }
    });
  }

  // ── Shared "stop AI" helper ───────────────────────────────────────────────
  function _stopAI(units) {
    clearInterval(tacticalInterval); tacticalInterval = null;
    autoRunning = false;
    autoBtn.style.pointerEvents  = 'auto';
    autoBtn.innerHTML            = '🤖';
    manualBtn.style.pointerEvents = 'none';
    manualBtn.style.opacity       = '0.4';
    restoreSpeeds(units || []);
  }

})(window, document);