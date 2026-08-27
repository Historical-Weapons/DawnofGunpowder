// ============================================================================
// EMPIRE OF THE 13TH CENTURY - COMMAND & TACTICS ENGINE (REVISED)
// ============================================================================

let currentSelectionGroup = null; 
let currentFormationStyle = "line"; 
// --- SURGERY: ADD THIS LINE ---
let activeBattleFormation = null;
let isRightDragging = false;
let dragStartPos = { x: 0, y: 0 };
let dragCurrentPos = { x: 0, y: 0 };

// ============================================================================
// --- LAZY GENERAL AI (LAND / RIVER ONLY) ---
// ----------------------------------------------------------------------------
// Default behavior for every player unit that hasn't been given a manual
// order: an intelligent, composition-aware autopilot mirroring how the enemy
// tactical AI (enemyLandStrategyAI.js) fights its own battles. UPDATED:
// selecting a unit now DOES interrupt this immediately, on its own, for that
// unit only — you no longer have to issue an explicit order first (see the
// 1-5 selection handler below). Every other, still-unselected unit keeps
// obeying whichever AI already had it (this autopilot, or the robot-tactical
// AI in autoAttack.js if the robot button is on). Deselecting a manually
// controlled unit immediately hands it back to the autopilot on the very
// next AI tick.
//
// Excluded entirely: Siege battles and Naval/Coastal/Ocean battles keep
// their existing dedicated control schemes untouched (lazyIsAllowedBattle()
// gates every entry point below).
// ============================================================================

// --- Heartbeat / session state ---
let lazyGeneralTickInterval  = null;   // ~2Hz strategy heartbeat, runs for the whole battle
let lazyGeneralPhase         = 'IDLE'; // IDLE | FORMING | ADVANCING | SKIRMISHING | CHARGING | RIVER_ADVANCING
let lazyGeneralFormingTicks  = 0;
let lazyGeneralSkirmishTicks = 0;
let lazyGeneralDoctrine       = 'COMBINED_ARMS';
let lazyGeneralFormationShape = 'LINE';
let lazyGeneralPersonality    = 'BALANCED';
let lazyGeneralCrisisActive   = false;
let lazyGeneralIsRiverCached  = false;
let lazyGeneralStrategyTick   = 0;

const LAZY_TICK_MS       = 500;
const LAZY_FORMING_TICKS = 4;
const LAZY_SKIRMISH_MAX_TICKS = 18;

const LAZY_DIST_SKIRMISH        = 600;
const LAZY_DIST_MELEE_COMMIT    = 170;
const LAZY_DIST_HEAVYCAV_COMMIT = 270;
const LAZY_DIST_RING_COMMIT     = 220;

const LAZY_SPREAD_FRONT_X        = 42;
const LAZY_SPREAD_SHOOTER_BACK   = 80;
const LAZY_SPREAD_HEAVYCAV_BACK  = 220;
const LAZY_SPREAD_HEAVYCAV_FLANK = 280;
const LAZY_SPREAD_LIGHTCAV_MIN   = 190;
const LAZY_SPREAD_LIGHTCAV_MAX   = 420;
const LAZY_RANGED_INF_FLEE_TRIGGER = 110;
const LAZY_RANGED_INF_FLEE_DIST    = 130;
const LAZY_ADVANCE_LOOK_AHEAD  = 480;
const LAZY_ADVANCE_STOP_BUFFER = 95;
const LAZY_ADVANCE_SPEED_SCALE = 0.65;

const LAZY_ANVIL_ENGAGE_DIST = 130;
const LAZY_HAMMER_FLANK_LEAD = 220;

const LAZY_GENERAL_CRISIS_HP     = 0.50;
const LAZY_BODYGUARD_RING_RADIUS = 95;
const LAZY_BODYGUARD_RUSH_BONUS  = 1.25;

// River
const LAZY_RIVER_COMMIT_DIST = 320;
const LAZY_RIVER_SPEED_SCALE = 0.70;
const LAZY_RIVER_BLOB_SPREAD = 90;

const LAZY_PERSONALITIES = {
    AGGRESSIVE : { skirmishTicks: 0.55, commitDist: 1.20, kiteRange: 0.85 },
    TIMID      : { skirmishTicks: 1.50, commitDist: 0.80, kiteRange: 1.15 },
    BALANCED   : { skirmishTicks: 1.00, commitDist: 1.00, kiteRange: 1.00 },
    FEINT      : { skirmishTicks: 1.20, commitDist: 0.90, kiteRange: 1.00 },
    OPPORTUNIST: { skirmishTicks: 0.85, commitDist: 1.05, kiteRange: 0.95 },
};
let lazyGeneralPersonalityMod = LAZY_PERSONALITIES.BALANCED;

// ── BATTLE CONTEXT GUARDS ────────────────────────────────────────────────
function lazyIsSiegeBattle() { return typeof inSiegeBattle !== 'undefined' && inSiegeBattle; }
function lazyIsNavalBattle() { return typeof inNavalBattle !== 'undefined' && inNavalBattle; }
function lazyIsRiverBattle() { return typeof inRiverBattle !== 'undefined' && inRiverBattle; }

function lazyIsAllowedBattle() {
    if (lazyIsSiegeBattle() || lazyIsNavalBattle()) return false;
    if (typeof battleEnvironment === 'undefined' || !battleEnvironment) return false;
    const bt = String(battleEnvironment.battleType || 'land').toLowerCase();
    if (bt.includes('coastal') || bt.includes('ocean') || bt.includes('siege')) return false;
    return true;
}

// ── ROLE / SUB-ROLE RESOLUTION (builds on getTacticalRole() already in this file) ──
function lazyResolveSubRole(unit) {
    const broad = getTacticalRole(unit);
    if (broad === 'CAVALRY') {
        const txt = String((unit.stats?.role || '') + ' ' + (unit.unitType || '')).toLowerCase();
        const isRangedMount = unit.stats?.isRanged || /(horse_archer|mounted_gunner)/.test(txt);
        return isRangedMount ? 'RANGED_CAV' : 'MELEE_CAV';
    }
    if (broad === 'GUNPOWDER') return 'GUNPOWDER';
    if (broad === 'RANGED')    return 'RANGED_INF';
    if (broad === 'SHIELD')    return 'SHIELD';
    return 'MELEE_INF';
}

// ── UNIT FILTERS ─────────────────────────────────────────────────────────
function getLazyControlledUnits() {
    if (!battleEnvironment || !battleEnvironment.units) return [];
    return battleEnvironment.units.filter(u =>
        u.side === "player" &&
        u.hp > 0 &&
        !u.isCommander &&
        !u.disableAICombat &&
        !u._lazyManual &&
        u.siegeRole !== "ladder_fanatic" &&
        u.siegeRole !== "counter_battery" &&
        u.siegeRole !== "treb_crew" &&
        u.siegeRole !== "trebuchet_crew"
    );
}

function getLazyOpposingUnits() {
    if (!battleEnvironment || !battleEnvironment.units) return [];
    return battleEnvironment.units.filter(u => u.side === "enemy" && u.hp > 0 && !u.isDummy);
}

function findLazyPlayerCommander() {
    if (!battleEnvironment || !battleEnvironment.units) return null;
    return battleEnvironment.units.find(u =>
        u.side?.toLowerCase() === 'player' &&
        (
            u.isCommander ||
            ['commander', 'general', 'player', 'captain'].includes(u.unitType?.toLowerCase()) ||
            ['commander', 'general', 'player', 'captain'].includes(u.name?.toLowerCase())
        )
    ) || null;
}

// ── GEOMETRY HELPERS ─────────────────────────────────────────────────────
function lazyCentroid(units) {
    if (!units.length) return { x: 0, y: 0 };
    let sx = 0, sy = 0;
    units.forEach(u => { sx += u.x; sy += u.y; });
    return { x: sx / units.length, y: sy / units.length };
}
function lazyDist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function lazyDist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
function lazyMinGap(fromArr, toArr, roleFilter) {
    let m2 = Infinity;
    fromArr.forEach(a => {
        if (roleFilter && !roleFilter(lazyResolveSubRole(a))) return;
        toArr.forEach(b => { const d2 = lazyDist2(a, b); if (d2 < m2) m2 = d2; });
    });
    return (m2 === Infinity) ? Infinity : Math.sqrt(m2);
}

// ── RIVER TILE / WATER DETECTION ─────────────────────────────────────────
function lazyTileAt(wx, wy) {
    if (!battleEnvironment || !battleEnvironment.grid) return 0;
    const ts = (typeof BATTLE_TILE_SIZE !== 'undefined') ? BATTLE_TILE_SIZE : 8;
    const tx = Math.floor(wx / ts), ty = Math.floor(wy / ts);
    if (!battleEnvironment.grid[tx]) return 0;
    return battleEnvironment.grid[tx][ty] || 0;
}
function lazyIsWater(wx, wy) { const t = lazyTileAt(wx, wy); return t === 4 || t === 11; }
function lazySafePathDest(fx, fy, tx, ty, steps) {
    steps = steps || 7;
    let lastX = fx, lastY = fy;
    for (let i = 1; i <= steps; i++) {
        const f = i / steps, ix = fx + (tx - fx) * f, iy = fy + (ty - fy) * f;
        if (lazyIsWater(ix, iy)) return { x: lastX, y: lastY, hitWater: true };
        lastX = ix; lastY = iy;
    }
    return { x: tx, y: ty, hitWater: false };
}

// ── CITY INTERIOR NAVIGATION (walls & buildings, post-breach only) ──────
// Open-field land battles never have buildings or interior walls on the
// grid, so the normal seek_engage movement (walk straight at
// pickSmartCombatTarget's pick) was never built to route around them. This
// gives assault_complete units (attackers who made it through the southern
// gate — see the gateBreached handoff above) a lightweight steering layer
// on top of that same "walk straight at your target" behavior every other
// land unit uses, gated on what's actually in front of them:
//   - WALL tile (6 solid stone / 7 tower — NOT 8, that's the walkable wall-
//     top platform) in the way -> can't go over it, fall back toward the
//     southern gate, then resume heading toward the real target (north,
//     deeper into the city) once clear of the gate.
//   - BUILDING tile (2) in the way -> simpler: sidestep around it, holding
//     a side for under a second so units don't all pick the identical
//     detour and jam against each other, with a bit of random jitter.
// Every other seek_engage unit (every normal, non-siege land battle) never
// calls this at all.
function lazyIsWallTile(wx, wy) { const t = lazyTileAt(wx, wy); return t === 6 || t === 7; }
function lazyIsBuildingTile(wx, wy) { const t = lazyTileAt(wx, wy); return t === 2; }

function getCityNavTarget(unit, realTarget) {
    if (!realTarget) return realTarget;

    let dx = realTarget.x - unit.x;
    let dy = realTarget.y - unit.y;
    let dist = Math.hypot(dx, dy);
    if (dist < 1) return realTarget;

    // SURGERY: combat always wins over path-finding detours. A unit already
    // within striking distance of realTarget must never get swapped onto a
    // dummy steering point instead — dummies (isDummy:true) aren't real
    // combatants, so nothing the unit "attacks" while carrying one ever
    // resolves as a hit. That was silently preventing attacks from landing
    // for any assault_complete unit whose look-ahead ray clipped a wall/
    // building tile while already toe-to-toe with an enemy.
    const meleeRange = (unit.stats && unit.stats.range) ? Math.max(unit.stats.range, 40) : 40;
    if (dist <= meleeRange) return realTarget;

    dx /= dist; dy /= dist;

    const ts = (typeof BATTLE_TILE_SIZE !== 'undefined') ? BATTLE_TILE_SIZE : 8;
    const lookX = unit.x + dx * ts * 1.5;
    const lookY = unit.y + dy * ts * 1.5;

    // SURGERY: the old wall-handling branch assumed the ONLY wall tile a
    // unit could ever run into was the south gate's own — "far from the
    // gate -> go back to the gate, near the gate -> head 100px past it" —
    // and routed back toward SiegeTopography's fixed south-gate coordinates
    // no matter where the blocking tile actually was. fortification_
    // system.js stamps tile 6/7 along the ENTIRE city perimeter (all four
    // walls, every tower, every other gate), so brushing the north wall, a
    // tower base, or the far side of the plaza — all common once a unit is
    // actually fighting deep in the city — triggered the exact same "go
    // back to the south gate" reroute. That's the "walking toward the
    // plaza but never actually landing a hit" symptom: every few frames the
    // target silently swapped from the real enemy to a dummy point back
    // near the gate, so the unit kept drifting rather than closing in and
    // fighting.
    //
    // Fix: treat any blocked tile — wall or building — the same way, with
    // no assumption about WHERE the obstacle is: sidestep it laterally,
    // exactly like the building-detour case just below already does. A
    // continuous wall won't clear in one sidestep the way a discrete
    // building does, but the unit will keep re-evaluating every frame and
    // walk itself along the wall face until it finds the gap, instead of
    // being teleported in target-choice back to a fixed point far away.
    if (lazyIsWallTile(lookX, lookY) || lazyIsBuildingTile(lookX, lookY)) {
        const now = Date.now();
        if (!unit._bldgDetourUntil || now > unit._bldgDetourUntil) {
            unit._bldgDetourSide = Math.random() < 0.5 ? -1 : 1;
            unit._bldgDetourUntil = now + 800 + Math.random() * 800;
        }
        const perpX = -dy * unit._bldgDetourSide;
        const perpY = dx * unit._bldgDetourSide;
        const step = ts * 2;
        return {
            x: unit.x + perpX * step + (Math.random() - 0.5) * 20,
            y: unit.y + perpY * step + (Math.random() - 0.5) * 20,
            hp: 9999, isDummy: true, priority: "building_detour"
        };
    }

    return realTarget; // clear path — same as normal land AI
}

// ── COMPOSITION ANALYSIS & DOCTRINE ──────────────────────────────────────
function lazyAnalyseComposition(units) {
    const c = { total: 0, melee_cav: 0, ranged_cav: 0, melee_inf: 0, ranged_inf: 0, gunpowder: 0, shield: 0, avgSpeed: 0 };
    if (!units.length) return c;
    let totalSpd = 0;
    units.forEach(u => {
        const sub = lazyResolveSubRole(u).toLowerCase();
        c[sub] = (c[sub] || 0) + 1;
        totalSpd += (u.stats && u.stats.speed) ? u.stats.speed : 2;
    });
    c.total = units.length;
    c.avgSpeed = Math.max(1, totalSpd / units.length);
    c.r_melee_cav  = c.melee_cav  / c.total;
    c.r_ranged_cav = c.ranged_cav / c.total;
    c.r_melee_inf  = c.melee_inf  / c.total;
    c.r_ranged_inf = c.ranged_inf / c.total;
    c.r_gunpowder  = c.gunpowder  / c.total;
    c.r_shield     = c.shield     / c.total;
    c.r_total_mel  = (c.melee_inf + c.shield + c.melee_cav) / c.total;
    return c;
}

// opposingComp = the army we're fighting; ownComp = our own player army.
function lazyPickDoctrine(opposingComp, ownComp) {
    if (opposingComp.r_melee_cav >= 0.50 && (ownComp.r_ranged_inf + ownComp.r_gunpowder) >= 0.20) return 'ANTI_CAV_RING';
    if (opposingComp.r_ranged_cav >= 0.35) return 'SKIRMISH_HUNT';
    if ((opposingComp.r_ranged_inf + opposingComp.r_gunpowder) >= 0.50) return 'SHIELD_PUSH';
    if ((opposingComp.r_melee_inf + opposingComp.r_shield) >= 0.55 && ownComp.r_melee_cav >= 0.10) return 'HAMMER_AND_ANVIL';
    if (ownComp.total > 0 && opposingComp.total / ownComp.total >= 1.5) return 'DEFENSIVE_HOLD';
    return 'COMBINED_ARMS';
}

function lazyPickFormationShape(opposingComp, personality) {
    const screenNeed = opposingComp.r_ranged_inf + opposingComp.r_gunpowder;
    if (screenNeed >= 0.30) return 'LINE';
    if (screenNeed <= 0.05 && opposingComp.r_total_mel >= 0.70) return 'BLOCK';
    const aggressiveBias = (personality === 'AGGRESSIVE' || personality === 'OPPORTUNIST') ? 0.20 : 0;
    const timidBias = (personality === 'TIMID') ? -0.20 : 0;
    return (Math.random() + aggressiveBias + timidBias >= 0.5) ? 'BLOCK' : 'LINE';
}

function lazyPickPersonality() {
    const r = Math.random();
    if (r < 0.32) return 'BALANCED';
    if (r < 0.55) return 'AGGRESSIVE';
    if (r < 0.75) return 'TIMID';
    if (r < 0.88) return 'OPPORTUNIST';
    return 'FEINT';
}

// ── ORDER PRIMITIVES (feed the existing processTacticalOrders() executor below) ──
// These only ever set hasOrders/orderType/orderTargetPoint — processTacticalOrders()
// recomputes unit.target fresh every single frame from whatever orderType currently
// is, so there's no dummy-target bookkeeping to manage here (unlike the enemy AI,
// which has to hand-manage it because enemy units go through a different executor).
function lazyOrderMove(u, tx, ty) {
    const safe = getSafeMapCoordinates(tx, ty);
    u.hasOrders = true;
    u.orderType = "move_to_point";
    u.orderTargetPoint = safe;
    u.reactionDelay = 0;
    u.formationTimer = 0; // let ranged units fire opportunistically while marching
}
function lazyOrderHold(u) {
    u.hasOrders = true;
    u.orderType = "hold_position";
    u.orderTargetPoint = null;
    u.reactionDelay = 0;
    u.vx = 0; u.vy = 0;
}
function lazyOrderEngage(u) {
    u.hasOrders = true;
    u.orderType = "seek_engage";
    u.orderTargetPoint = null;
    u.reactionDelay = 0;
}

// ── SPEED SCALING (advance/skirmish pacing without permanently touching base stats) ──
function lazyBackupSpeed(u) { if (u._lazyOrigSpeed === undefined && u.stats) u._lazyOrigSpeed = u.stats.speed; }
function lazyRestoreSpeed(u) { if (u._lazyOrigSpeed !== undefined && u.stats) { u.stats.speed = u._lazyOrigSpeed; delete u._lazyOrigSpeed; } }
function lazySetSpeedScale(u, scale) { lazyBackupSpeed(u); if (u.stats && u._lazyOrigSpeed !== undefined) u.stats.speed = u._lazyOrigSpeed * scale; }

// ── ADVANCE WAYPOINT MATH (role + doctrine + formation-shape aware) ──────
function lazyCalcAdvanceTarget(unit, targetCentroid, subRole, idx, total, doctrine, formationShape) {
    const rawDx = targetCentroid.x - unit.x, rawDy = targetCentroid.y - unit.y;
    const rawLen = Math.hypot(rawDx, rawDy) || 1;
    const nx = rawDx / rawLen, ny = rawDy / rawLen;
    const px = -ny, py = nx;
    const half = (total - 1) / 2;
    const slot = idx - half;
    let spreadX = 0, behindY = 0;

    const wantsBlock = formationShape === 'BLOCK' &&
        (subRole === 'SHIELD' || subRole === 'MELEE_INF') &&
        doctrine !== 'ANTI_CAV_RING' && doctrine !== 'DEFENSIVE_HOLD';

    if (wantsBlock) {
        const cols = Math.max(1, Math.round(Math.sqrt(total * 1.6)));
        const row = Math.floor(idx / cols), col = idx % cols;
        const colsInThisRow = Math.min(cols, total - row * cols);
        const rowHalf = (colsInThisRow - 1) / 2;
        spreadX = (col - rowHalf) * (LAZY_SPREAD_FRONT_X * 0.55);
        behindY = row * (LAZY_SPREAD_FRONT_X * 0.5);
    } else if (doctrine === 'ANTI_CAV_RING') {
        if (subRole === 'RANGED_INF' || subRole === 'GUNPOWDER') {
            const angR = (idx / Math.max(total, 1)) * Math.PI * 2;
            spreadX = Math.cos(angR) * 30; behindY = Math.sin(angR) * 30;
        } else if (subRole === 'SHIELD' || subRole === 'MELEE_INF') {
            const angI = (idx / Math.max(total, 1)) * Math.PI * 2, ringR = 110;
            spreadX = Math.cos(angI) * ringR; behindY = Math.sin(angI) * ringR * 0.55;
        } else if (subRole === 'MELEE_CAV') {
            const flank = (idx % 2 === 0) ? 1 : -1;
            spreadX = flank * (LAZY_SPREAD_HEAVYCAV_FLANK + slot * 25); behindY = LAZY_SPREAD_HEAVYCAV_BACK;
        } else {
            const flank = (idx % 2 === 0) ? 1 : -1;
            spreadX = flank * 200; behindY = 120;
        }
    } else if (doctrine === 'SHIELD_PUSH') {
        if (subRole === 'SHIELD' || subRole === 'MELEE_INF') { spreadX = slot * LAZY_SPREAD_FRONT_X; behindY = -10; }
        else if (subRole === 'RANGED_INF' || subRole === 'GUNPOWDER') { spreadX = slot * LAZY_SPREAD_FRONT_X; behindY = LAZY_SPREAD_SHOOTER_BACK; }
        else { const flank = (idx % 2 === 0) ? 1 : -1; spreadX = flank * (LAZY_SPREAD_HEAVYCAV_FLANK + slot * 20); behindY = LAZY_SPREAD_HEAVYCAV_BACK; }
    } else if (doctrine === 'HAMMER_AND_ANVIL' || doctrine === 'SKIRMISH_HUNT') {
        if (subRole === 'SHIELD' || subRole === 'MELEE_INF') { spreadX = slot * LAZY_SPREAD_FRONT_X; behindY = 0; }
        else if (subRole === 'RANGED_INF' || subRole === 'GUNPOWDER') { spreadX = slot * LAZY_SPREAD_FRONT_X; behindY = LAZY_SPREAD_SHOOTER_BACK - 20; }
        else if (subRole === 'MELEE_CAV') { const flank = (idx % 2 === 0) ? 1 : -1; spreadX = flank * (LAZY_SPREAD_HEAVYCAV_FLANK + slot * 20); behindY = LAZY_SPREAD_HEAVYCAV_BACK; }
        else { const flank = (idx % 2 === 0) ? 1 : -1; spreadX = flank * 220; behindY = 100; }
    } else { // COMBINED_ARMS / DEFENSIVE_HOLD default spread
        if (subRole === 'SHIELD' || subRole === 'MELEE_INF') { spreadX = slot * LAZY_SPREAD_FRONT_X; behindY = 0; }
        else if (subRole === 'RANGED_INF' || subRole === 'GUNPOWDER') { spreadX = slot * LAZY_SPREAD_FRONT_X; behindY = LAZY_SPREAD_SHOOTER_BACK; }
        else if (subRole === 'MELEE_CAV') { const flank = (idx % 2 === 0) ? 1 : -1; spreadX = flank * (130 + slot * 25); behindY = 60; }
        else { const flank = (idx % 2 === 0) ? 1 : -1; spreadX = flank * 200; behindY = 50; }
    }

    const lookAhead = (doctrine === 'DEFENSIVE_HOLD')
        ? Math.max(0, LAZY_ADVANCE_LOOK_AHEAD * 0.35 - LAZY_ADVANCE_STOP_BUFFER)
        : Math.max(0, LAZY_ADVANCE_LOOK_AHEAD - LAZY_ADVANCE_STOP_BUFFER);

    let tx = unit.x + nx * lookAhead + px * spreadX - nx * behindY;
    let ty = unit.y + ny * lookAhead + py * spreadX - ny * behindY;

    const clampX = targetCentroid.x - nx * LAZY_ADVANCE_STOP_BUFFER;
    const clampY = targetCentroid.y - ny * LAZY_ADVANCE_STOP_BUFFER;
    const toClampDist = Math.hypot(clampX - unit.x, clampY - unit.y);
    const toTgtDist   = Math.hypot(tx - unit.x, ty - unit.y);
    if (toTgtDist > toClampDist) { tx = clampX + px * spreadX * 0.5; ty = clampY + py * spreadX * 0.5; }

    const distNow = Math.hypot(unit.x - targetCentroid.x, unit.y - targetCentroid.y);
    const distTgt = Math.hypot(tx - targetCentroid.x, ty - targetCentroid.y);
    if (distTgt > distNow + 80) { tx = targetCentroid.x - nx * LAZY_ADVANCE_STOP_BUFFER; ty = targetCentroid.y - ny * LAZY_ADVANCE_STOP_BUFFER; }

    return { x: tx, y: ty };
}

// ── GROUPING & ESCORT ASSIGNMENT ──────────────────────────────────────────
function lazyGroupUnits(units) {
    const groups = { MELEE_CAV: [], RANGED_CAV: [], MELEE_INF: [], RANGED_INF: [], GUNPOWDER: [], SHIELD: [] };
    units.forEach(u => { const sub = lazyResolveSubRole(u); (groups[sub] || groups.MELEE_INF).push(u); });
    groups.FRONT_LINE = groups.SHIELD.concat(groups.MELEE_INF);
    groups.SHOOTERS   = groups.RANGED_INF.concat(groups.GUNPOWDER);
    return groups;
}

function lazyAssignProtection(groups) {
    const allMelee = groups.SHIELD.concat(groups.MELEE_INF);
    allMelee.forEach(u => { u._lazyEscortFor = null; });
    const shooters = groups.RANGED_INF.concat(groups.GUNPOWDER);
    if (!shooters.length || !allMelee.length) return;
    const claimed = new Set();
    shooters.forEach(sh => {
        let best = null, bestD2 = Infinity;
        allMelee.forEach(me => {
            if (claimed.has(me)) return;
            const d2 = lazyDist2(sh, me);
            if (d2 < bestD2) { bestD2 = d2; best = me; }
        });
        if (best) { best._lazyEscortFor = sh; claimed.add(best); }
    });
}

// ── GENERAL-CRISIS DEFENSE (mirrors the enemy AI's below-50%-HP ring) ────
function lazyDetectCrisis() {
    const gen = findLazyPlayerCommander();
    if (!gen || gen.hp <= 0) return false;
    const maxHp = (gen.stats && gen.stats.health) ? gen.stats.health : (gen.maxHp || gen.hp || 1);
    return (gen.hp / maxHp) < LAZY_GENERAL_CRISIS_HP;
}
function lazyIsBodyguardType(u) {
    const sub = lazyResolveSubRole(u);
    if (sub === 'MELEE_CAV' || sub === 'RANGED_CAV') return true;
    if (sub === 'RANGED_INF') {
        const r = String(u.stats?.role || '').toLowerCase();
        return r === 'archer' || r === 'crossbow' || r === 'horse_archer';
    }
    return false;
}
function lazyExecuteCrisis(bodyguards) {
    const gen = findLazyPlayerCommander();
    if (!gen) return;
    bodyguards.forEach(u => {
        const d = lazyDist(u, gen);
        if (d <= LAZY_BODYGUARD_RING_RADIUS) {
            lazyOrderHold(u);
        } else {
            const angle = Math.random() * Math.PI * 2;
            const ringR = LAZY_BODYGUARD_RING_RADIUS * 0.65;
            lazyBackupSpeed(u);
            if (u.stats && u._lazyOrigSpeed !== undefined) u.stats.speed = u._lazyOrigSpeed * LAZY_BODYGUARD_RUSH_BONUS;
            lazyOrderMove(u, gen.x + Math.cos(angle) * ringR, gen.y + Math.sin(angle) * ringR);
        }
    });
}

// ── HEAVY CAVALRY PROSPECT SCORING ────────────────────────────────────────
function lazyScoreCavalryProspect(cavUnit, candidate) {
    let score = lazyDist(cavUnit, candidate);
    if (candidate.state === 'FLEEING' || candidate.state === 'WAVERING') score -= 220;
    const sub = lazyResolveSubRole(candidate);
    const antiCav = Math.max((candidate.stats?.bonusVsLarge) || 0, (candidate.stats?.antiLargeDamage) || 0);
    score += antiCav * 14;
    if ((sub === 'RANGED_INF' || sub === 'GUNPOWDER') && antiCav < 15) score -= 110;
    return score;
}
function lazyPickCavalryProspect(cavUnit, opposing) {
    let best = null, bestScore = Infinity;
    opposing.forEach(p => { if (p.hp <= 0 || p.isDummy) return; const s = lazyScoreCavalryProspect(cavUnit, p); if (s < bestScore) { bestScore = s; best = p; } });
    return best;
}
function lazyCalcCavalryHuntWaypoint(prospect, frontCentroid, fallbackX, fallbackY) {
    if (!prospect) return { x: fallbackX, y: fallbackY };
    const fdx = prospect.x - frontCentroid.x, fdy = prospect.y - frontCentroid.y;
    const L = Math.hypot(fdx, fdy) || 1;
    return { x: prospect.x + (fdx / L) * 150, y: prospect.y + (fdy / L) * 150 };
}

// ── GROUP MICRO-ROUTINES ──────────────────────────────────────────────────
function lazyMicroFrontLine(groups, opposingCentroid, doctrine, phase) {
    const front = groups.FRONT_LINE;
    if (!front.length) return;
    if (phase === 'ADVANCING') {
        front.forEach((u, i) => {
            lazySetSpeedScale(u, LAZY_ADVANCE_SPEED_SCALE);
            const sub = lazyResolveSubRole(u);
            if (u._lazyEscortFor && u._lazyEscortFor.hp > 0) {
                const sh = u._lazyEscortFor;
                const dx = opposingCentroid.x - sh.x, dy = opposingCentroid.y - sh.y;
                const L = Math.hypot(dx, dy) || 1;
                lazyOrderMove(u, sh.x + (dx / L) * 55, sh.y + (dy / L) * 55);
            } else {
                const tgt = lazyCalcAdvanceTarget(u, opposingCentroid, sub, i, front.length, doctrine, lazyGeneralFormationShape);
                lazyOrderMove(u, tgt.x, tgt.y);
            }
        });
        return;
    }
    if (phase === 'SKIRMISHING') {
        if (doctrine === 'SHIELD_PUSH') {
            front.forEach(u => { lazySetSpeedScale(u, 0.55); lazyOrderEngage(u); });
        } else {
            front.forEach(u => lazyOrderHold(u));
        }
        return;
    }
    if (phase === 'CHARGING') {
        front.forEach(u => { lazyRestoreSpeed(u); lazyOrderEngage(u); });
    }
}

function lazyMicroShooters(groups, opposingUnits, opposingCentroid, doctrine, phase) {
    const shooters = groups.SHOOTERS;
    if (!shooters.length) return;
    const KITE_IDEAL = 320, KITE_TOO_CLOSE = 160, KITE_TOO_FAR = 500, ORBIT_STEP = 200;

    if (phase === 'ADVANCING') {
        shooters.forEach((u, i) => {
            lazySetSpeedScale(u, LAZY_ADVANCE_SPEED_SCALE);
            const sub = lazyResolveSubRole(u);
            const tgt = lazyCalcAdvanceTarget(u, opposingCentroid, sub, i, shooters.length, doctrine, lazyGeneralFormationShape);
            lazyOrderMove(u, tgt.x, tgt.y);
        });
        return;
    }

    if (phase === 'SKIRMISHING') {
        // Gunpowder: hold-and-fire from a fixed anchor, retreat only if a threat closes in dangerously.
        groups.GUNPOWDER.forEach(u => {
            lazyRestoreSpeed(u);
            let nearestD = Infinity, nearest = null;
            opposingUnits.forEach(p => { const d = lazyDist(u, p); if (d < nearestD) { nearestD = d; nearest = p; } });
            if (nearest && nearestD <= LAZY_RANGED_INF_FLEE_TRIGGER) {
                const tdx = u.x - nearest.x, tdy = u.y - nearest.y;
                const L = Math.hypot(tdx, tdy) || 1;
                let awayX = tdx / L, awayY = tdy / L;
                if (groups.FRONT_LINE.length) {
                    const fc = lazyCentroid(groups.FRONT_LINE);
                    const bdx = fc.x - u.x, bdy = fc.y - u.y, bL = Math.hypot(bdx, bdy) || 1;
                    awayX = awayX * 0.70 + (bdx / bL) * 0.30; awayY = awayY * 0.70 + (bdy / bL) * 0.30;
                    const nrm = Math.hypot(awayX, awayY) || 1; awayX /= nrm; awayY /= nrm;
                }
                lazyOrderMove(u, u.x + awayX * LAZY_RANGED_INF_FLEE_DIST, u.y + awayY * LAZY_RANGED_INF_FLEE_DIST);
            } else if (nearest && nearestD <= LAZY_RANGED_INF_FLEE_TRIGGER * 1.8) {
                lazyOrderHold(u);
            } else {
                lazyOrderEngage(u);
            }
        });

        // Ranged infantry (archers/crossbows): real hit-and-run kiting, same shape as horse archers.
        groups.RANGED_INF.forEach((u, i) => {
            lazyRestoreSpeed(u);
            // BUGFIX: was Math.max(u.ammo || 0, u.stats?.ammo || 0) — u.ammo is a
            // one-time snapshot stamped at spawn in battlefield_launch.js and never
            // updated again (real combat only ever decrements u.stats.ammo, see
            // ai_categories.js's _handleCombatExecution). Taking the max against
            // that stale, permanently-high value meant ammoLeft could never actually
            // reach 0 as long as the snapshot was positive — this branch kept
            // treating the unit as having ammo forever, part of the "almost all
            // units have infinite ammo" report. Read the live stat directly.
            const ammoLeft = (u.stats && typeof u.stats.ammo === 'number') ? u.stats.ammo : (u.ammo || 0);
            if (ammoLeft <= 0) { lazyOrderEngage(u); return; }
            let closest = null, closestD = Infinity;
            opposingUnits.forEach(p => { const d = lazyDist(u, p); if (d < closestD) { closestD = d; closest = p; } });
            if (!closest) { lazyOrderEngage(u); return; }
            const dx = closest.x - u.x, dy = closest.y - u.y, L = Math.hypot(dx, dy) || 1;
            const nx = dx / L, ny = dy / L, px = -ny, py = nx;
            if (u._lazyKiteSign === undefined) u._lazyKiteSign = (i % 2 === 0) ? 1 : -1;

            if (closestD < KITE_TOO_CLOSE) {
                const ex = u.x + (-nx * 0.6 + px * u._lazyKiteSign * 0.80) * LAZY_RANGED_INF_FLEE_DIST * 1.4;
                const ey = u.y + (-ny * 0.6 + py * u._lazyKiteSign * 0.80) * LAZY_RANGED_INF_FLEE_DIST * 1.4;
                lazyOrderMove(u, ex, ey);
                u._lazyKiteSign *= -1;
            } else if (closestD > KITE_TOO_FAR) {
                lazyOrderMove(u, u.x + (nx * 0.85 + px * u._lazyKiteSign * 0.20) * 180, u.y + (ny * 0.85 + py * u._lazyKiteSign * 0.20) * 180);
            } else {
                if (lazyGeneralStrategyTick % 2 === 0) {
                    lazyOrderMove(u, u.x + (px * u._lazyKiteSign * 0.85 + (-nx) * 0.15) * ORBIT_STEP, u.y + (py * u._lazyKiteSign * 0.85 + (-ny) * 0.15) * ORBIT_STEP);
                } else {
                    lazyOrderEngage(u);
                }
            }
        });
        return;
    }

    if (phase === 'CHARGING') {
        shooters.forEach(u => { lazyRestoreSpeed(u); lazyOrderEngage(u); });
    }
}

function lazyMicroHeavyCav(groups, opposingUnits, opposingCentroid, doctrine, phase) {
    const cav = groups.MELEE_CAV;
    if (!cav.length) return;
    const front = groups.FRONT_LINE;
    let anvilEngaged = false;
    if (front.length && opposingUnits.length) anvilEngaged = (lazyMinGap(front, opposingUnits) <= LAZY_ANVIL_ENGAGE_DIST);

    if (phase === 'ADVANCING') {
        cav.forEach((u, i) => { lazySetSpeedScale(u, LAZY_ADVANCE_SPEED_SCALE); const tgt = lazyCalcAdvanceTarget(u, opposingCentroid, 'MELEE_CAV', i, cav.length, doctrine, lazyGeneralFormationShape); lazyOrderMove(u, tgt.x, tgt.y); });
        return;
    }
    if (phase === 'SKIRMISHING') {
        if (doctrine === 'HAMMER_AND_ANVIL' && !anvilEngaged) { cav.forEach(u => lazyOrderHold(u)); return; }
        if (doctrine === 'ANTI_CAV_RING' || doctrine === 'DEFENSIVE_HOLD') { cav.forEach(u => lazyOrderHold(u)); return; }
        if (doctrine === 'SKIRMISH_HUNT') { cav.forEach(u => { lazyRestoreSpeed(u); lazyOrderEngage(u); }); return; }

        const fc = front.length ? lazyCentroid(front) : opposingCentroid;
        cav.forEach((u, i) => {
            lazyRestoreSpeed(u);
            const prospect = lazyPickCavalryProspect(u, opposingUnits);
            const d = prospect ? lazyDist(u, prospect) : Infinity;
            if (prospect && d <= 260) { lazyOrderEngage(u); }
            else {
                const flank = (i % 2 === 0) ? 1 : -1;
                const dx = opposingCentroid.x - fc.x, dy = opposingCentroid.y - fc.y, L = Math.hypot(dx, dy) || 1;
                const fpx = -(dy / L), fpy = dx / L;
                const fallbackX = opposingCentroid.x + fpx * flank * LAZY_HAMMER_FLANK_LEAD;
                const fallbackY = opposingCentroid.y + fpy * flank * LAZY_HAMMER_FLANK_LEAD;
                const wp = lazyCalcCavalryHuntWaypoint(prospect, fc, fallbackX, fallbackY);
                lazyOrderMove(u, wp.x, wp.y);
            }
        });
        return;
    }
    if (phase === 'CHARGING') { cav.forEach(u => { lazyRestoreSpeed(u); lazyOrderEngage(u); }); }
}

// Horse archers — ALWAYS kite, regardless of doctrine, exactly like the enemy AI.
function lazyMicroLightCav(groups, opposingUnits, opposingCentroid, doctrine, phase) {
    const lcav = groups.RANGED_CAV;
    if (!lcav.length) return;
    const kiteMin = LAZY_SPREAD_LIGHTCAV_MIN * lazyGeneralPersonalityMod.kiteRange;
    const kiteMax = LAZY_SPREAD_LIGHTCAV_MAX * lazyGeneralPersonalityMod.kiteRange;

    if (phase === 'ADVANCING' || phase === 'SKIRMISHING') {
        lcav.forEach((u, i) => {
            lazyRestoreSpeed(u);
            // BUGFIX: same stale-snapshot issue as the RANGED_INF branch above —
            // u.ammo never updates after spawn, so Math.max against it masked the
            // real depleting u.stats.ammo value. Read the live stat directly.
            const ammoLeft = (u.stats && typeof u.stats.ammo === 'number') ? u.stats.ammo : (u.ammo || 0);
            if (ammoLeft <= 0) { lazyOrderEngage(u); return; }
            let closest = null, closestD = Infinity;
            opposingUnits.forEach(p => { const d = Math.hypot(u.x - p.x, u.y - p.y); if (d < closestD) { closestD = d; closest = p; } });
            if (!closest) { lazyOrderEngage(u); return; }
            const dx = closest.x - u.x, dy = closest.y - u.y, L = Math.hypot(dx, dy) || 1;
            const nx = dx / L, ny = dy / L, px = -ny, py = nx;
            if (u._lazyKiteSign === undefined) u._lazyKiteSign = (i % 2 === 0) ? 1 : -1;

            if (closestD < kiteMin) {
                const ex = u.x + (-nx * 0.55 + px * u._lazyKiteSign * 0.85) * 280;
                const ey = u.y + (-ny * 0.55 + py * u._lazyKiteSign * 0.85) * 280;
                lazyOrderMove(u, ex, ey);
                u._lazyKiteSign *= -1;
            } else if (closestD > kiteMax) {
                lazyOrderMove(u, u.x + nx * 220, u.y + ny * 220);
            } else {
                if (lazyGeneralStrategyTick % 2 === 0) {
                    lazyOrderMove(u, u.x + px * u._lazyKiteSign * 260, u.y + py * u._lazyKiteSign * 260);
                } else {
                    lazyOrderEngage(u);
                }
            }
        });
        return;
    }
    if (phase === 'CHARGING') { lcav.forEach(u => { lazyRestoreSpeed(u); lazyOrderEngage(u); }); }
}

function lazyExecuteForming(units) { units.forEach(u => { lazyBackupSpeed(u); lazyOrderHold(u); }); }

function lazyExecutePhase(phase, groups, opposingUnits, opposingCentroid) {
    lazyMicroFrontLine(groups, opposingCentroid, lazyGeneralDoctrine, phase);
    lazyMicroShooters(groups, opposingUnits, opposingCentroid, lazyGeneralDoctrine, phase);
    lazyMicroHeavyCav(groups, opposingUnits, opposingCentroid, lazyGeneralDoctrine, phase);
    lazyMicroLightCav(groups, opposingUnits, opposingCentroid, lazyGeneralDoctrine, phase);
}

// ── LAND PHASE MACHINE ────────────────────────────────────────────────────
function lazyTickLand(units, opposingUnits, opposingCentroid) {
    lazyGeneralStrategyTick++;

    if (lazyGeneralPhase === 'CHARGING') {
        // Non-terminal by design: seek_engage is self-correcting forever via the
        // engine's own nearest-enemy scan, so we just make sure every currently
        // controlled unit has it — including any unit freed back to us mid-melee
        // by a deselect. Cheap and idempotent.
        units.forEach(u => { lazyRestoreSpeed(u); lazyOrderEngage(u); });
        return;
    }

    const groups = lazyGroupUnits(units);

    if (lazyGeneralPhase === 'FORMING') {
        lazyExecuteForming(units);
        lazyGeneralFormingTicks++;
        if (lazyGeneralFormingTicks >= LAZY_FORMING_TICKS) {
            const opposingComp = lazyAnalyseComposition(opposingUnits);
            const ownComp      = lazyAnalyseComposition(units);
            lazyGeneralDoctrine       = lazyPickDoctrine(opposingComp, ownComp);
            lazyGeneralFormationShape = lazyPickFormationShape(opposingComp, lazyGeneralPersonality);
            lazyAssignProtection(groups);
            lazyGeneralPhase = 'ADVANCING';
            lazyGeneralFormingTicks = 0;
        }
        return;
    }

    if (lazyGeneralPhase === 'ADVANCING') {
        lazyAssignProtection(groups);
        lazyExecutePhase('ADVANCING', groups, opposingUnits, opposingCentroid);
        if (lazyMinGap(units, opposingUnits) <= LAZY_DIST_SKIRMISH) {
            lazyGeneralPhase = 'SKIRMISHING';
            lazyGeneralSkirmishTicks = 0;
            lazyExecutePhase('SKIRMISHING', groups, opposingUnits, opposingCentroid);
        }
        return;
    }

    if (lazyGeneralPhase === 'SKIRMISHING') {
        lazyGeneralSkirmishTicks++;
        lazyExecutePhase('SKIRMISHING', groups, opposingUnits, opposingCentroid);

        const meleeDist = lazyMinGap(units, opposingUnits, r => r !== 'RANGED_INF' && r !== 'GUNPOWDER' && r !== 'RANGED_CAV');
        const cavDist   = lazyMinGap(units, opposingUnits, r => r === 'MELEE_CAV');
        const allDist   = lazyMinGap(units, opposingUnits);
        const maxTicks    = LAZY_SKIRMISH_MAX_TICKS * lazyGeneralPersonalityMod.skirmishTicks;
        const commitScale = lazyGeneralPersonalityMod.commitDist;

        const timerDone  = lazyGeneralSkirmishTicks >= maxTicks;
        const meleeClose = meleeDist <= LAZY_DIST_MELEE_COMMIT * commitScale;
        const cavBreaks  = lazyGeneralDoctrine !== 'ANTI_CAV_RING' && cavDist !== Infinity && cavDist <= LAZY_DIST_HEAVYCAV_COMMIT * commitScale;
        const ringCloses = lazyGeneralDoctrine === 'ANTI_CAV_RING' && allDist <= LAZY_DIST_RING_COMMIT * commitScale;

        if (timerDone || meleeClose || cavBreaks || ringCloses) {
            lazyGeneralPhase = 'CHARGING';
            units.forEach(u => { lazyRestoreSpeed(u); lazyOrderEngage(u); });
        }
        return;
    }
}

// ── RIVER PHASE MACHINE (bank-aware approach, mirrors enemyTacticalAI.js's
//    intended executeRiverApproach/executeRiverCharge water-avoidance design) ──
function lazyTickRiver(units, opposingUnits, opposingCentroid) {
    lazyGeneralStrategyTick++;

    if (lazyGeneralPhase === 'CHARGING') {
        units.forEach(u => { lazyRestoreSpeed(u); lazyOrderEngage(u); });
        return;
    }

    if (lazyMinGap(units, opposingUnits) <= LAZY_RIVER_COMMIT_DIST) {
        lazyGeneralPhase = 'CHARGING';
        units.forEach(u => { lazyRestoreSpeed(u); lazyOrderEngage(u); });
        return;
    }

    lazyGeneralPhase = 'RIVER_ADVANCING';
    const ownCentroid = lazyCentroid(units);

    units.forEach(u => {
        lazySetSpeedScale(u, LAZY_RIVER_SPEED_SCALE);
        if (lazyIsWater(u.x, u.y)) {
            // Already standing in water somehow — path back to the nearest safe ground.
            const shore = lazySafePathDest(u.x, u.y, ownCentroid.x, ownCentroid.y, 10);
            lazyOrderMove(u, shore.x + (Math.random() - 0.5) * 40, shore.y + (Math.random() - 0.5) * 40);
            return;
        }
        const path = lazySafePathDest(u.x, u.y, opposingCentroid.x, opposingCentroid.y, 8);
        if (path.hitWater) {
            // Blob up along the near bank rather than wading in.
            lazyOrderMove(u, path.x + (Math.random() - 0.5) * LAZY_RIVER_BLOB_SPREAD, path.y + (Math.random() - 0.5) * LAZY_RIVER_BLOB_SPREAD);
        } else {
            const cx = (Math.random() - 0.5) * (LAZY_RIVER_BLOB_SPREAD * 0.7);
            const cy = (Math.random() - 0.5) * (LAZY_RIVER_BLOB_SPREAD * 0.7);
            lazyOrderMove(u,
                opposingCentroid.x - (opposingCentroid.x - u.x > 0 ? 60 : -60) + cx,
                opposingCentroid.y - (opposingCentroid.y - u.y > 0 ? 60 : -60) + cy
            );
        }
    });
}

// ── MASTER TICK ────────────────────────────────────────────────────────────
function lazyGeneralTick() {
    if (typeof inBattleMode === 'undefined' || !inBattleMode || typeof battleEnvironment === 'undefined' || !battleEnvironment) { stopLazyGeneral(); return; }
    if (!lazyIsAllowedBattle()) { stopLazyGeneral(); return; }

    const units = getLazyControlledUnits();
    const opposingUnits = getLazyOpposingUnits();
    if (units.length === 0 || opposingUnits.length === 0) return; // nothing to command / no one left — keep the heartbeat alive, battle may still resolve

    const opposingCentroid = lazyCentroid(opposingUnits);

    // General-crisis check runs first and overrides doctrine/phase, every tick.
    if (lazyDetectCrisis()) {
        lazyGeneralCrisisActive = true;
        const bodyguards  = units.filter(lazyIsBodyguardType);
        const normalForce = units.filter(u => !lazyIsBodyguardType(u));
        if (bodyguards.length) lazyExecuteCrisis(bodyguards);
        if (normalForce.length) {
            if (lazyGeneralIsRiverCached) lazyTickRiver(normalForce, opposingUnits, opposingCentroid);
            else lazyTickLand(normalForce, opposingUnits, opposingCentroid);
        }
        return;
    }
    lazyGeneralCrisisActive = false;

    if (lazyGeneralIsRiverCached) lazyTickRiver(units, opposingUnits, opposingCentroid);
    else lazyTickLand(units, opposingUnits, opposingCentroid);
}

// ── START / STOP ─────────────────────────────────────────────────────────
function startLazyGeneral() {
    // REMOVED: Lazy General AI no longer runs, in any battle type. Player
    // attacker units that aren't selected simply stay idle with no orders
    // until the player commands them — no autopilot forming/advancing/
    // skirmishing/charging behavior runs on their behalf anymore.
    return;
}

function stopLazyGeneral() {
    if (lazyGeneralTickInterval) { clearInterval(lazyGeneralTickInterval); lazyGeneralTickInterval = null; }
    lazyGeneralPhase = 'IDLE';
    lazyGeneralCrisisActive = false;
    if (typeof battleEnvironment !== 'undefined' && battleEnvironment && battleEnvironment.units) {
        battleEnvironment.units.forEach(u => { if (u.side === "player") lazyRestoreSpeed(u); });
    }
}

// Called from every manual command handler below — flags units as player-controlled
// so the autopilot skips them from this point on.
function lazyTakeManualControl(units) {
    (units || []).forEach(u => {
        u._lazyManual = true;
        u.disableAICombat = false; // frozen-at-siege-start units need this cleared or a manual seek_engage order silently does nothing
        lazyRestoreSpeed(u); // hand back full speed; the player is in charge now
    });
}

// Called wherever a unit is deselected — hands it straight back to the autopilot.
//
// FIX ("shield/hold units barely move"): this used to unconditionally clear
// _lazyManual on every deselect, with NO aiTacticGroup guard, despite
// RTSControls.js's own AI-TACTIC-GROUPS doc comment claiming one existed
// here ("never on mere deselection — see lazyReleaseManualControl's
// aiTacticGroup guard"). Since deselecting happens constantly during normal
// play (clicking empty ground, selecting a different group, drag-box
// missing a unit), a Shield/Hold/Skirm/Charge-tagged unit got silently
// re-admitted to getLivePlayers() — the shared autoAttack.js engine — the
// moment it was deselected, even though it still had its OWN dedicated
// tactic logic actively driving it (the Shield tick interval, HOLD's
// formation lock-in, etc.). Two controllers fighting over the same unit
// every tick is what read as "barely moves." A unit with an independent
// tactic tag must stay opted out of the shared engine regardless of
// selection state — only a real Cancel (Cmd.cancelAiTactic), the tactic
// owner dying, or the battle ending should ever hand it back.
function lazyReleaseManualControl(unit) {
    if (!unit) return;
    if (unit.aiTacticGroup && unit.aiTacticGroup !== 'auto') return;
    unit._lazyManual = false;
}

// Bridges the desktop Q/E/R/F/Z/X/V/C/B command handlers (above/below) to the
// robot-emoji button's state in autoAttack.js. That file exposes
// window.MC3TacticalAI.revertToManualOnCommand() specifically so this file
// doesn't need to reach into autoAttack.js's closed-over IIFE state directly.
// Guarded with typeof/existence checks throughout since autoAttack.js's UI
// only initializes when the mobile controls bar is present (see its own
// poll loop) — on a desktop-only session this may simply never exist, and
// that's fine: there's no robot button to revert.
function _mc3RevertRobotOnCommand() {
    if (typeof window !== 'undefined' && window.MC3TacticalAI &&
        typeof window.MC3TacticalAI.revertToManualOnCommand === 'function') {
        window.MC3TacticalAI.revertToManualOnCommand();
    }
}
// --- END LAZY GENERAL AI ---

const COMMAND_GROUPS = {
    1: [ROLES.SHIELD, ROLES.PIKE, ROLES.INFANTRY, ROLES.TWO_HANDED, ROLES.THROWING], // Infantry & Skirmishers
    2: [ROLES.ARCHER, ROLES.CROSSBOW], // Ranged
    3: [ROLES.CAVALRY, ROLES.HORSE_ARCHER, ROLES.MOUNTED_GUNNER, ROLES.CAMEL, ROLES.ELEPHANT], // Cavalry & Beasts
    4: [ROLES.GUNNER, ROLES.FIRELANCE, ROLES.BOMB, ROLES.ROCKET] // Artillery/Gunpowder
};

// --- CORE INPUT LISTENER ---
document.addEventListener("keydown", (event) => {
    // 1. TOP-LEVEL SAFETY CHECK (Must come first to prevent crashes)
    if (!inBattleMode || !event || !battleEnvironment || !Array.isArray(battleEnvironment.units)) return;

    // POLISH: guard against typing into any text field stealing these
    // single-letter shortcuts (1-5, Z/X/V/C/B all double as ordinary
    // characters someone could be typing). No known text input is created
    // by THIS file during battle, but the scenario/dialogue/parley systems
    // loaded alongside it plausibly could show one without this file's
    // knowledge — and unlike this listener, unit-hover-tooltip.js's own
    // spacebar listener already guards exactly this way, so this brings
    // the two in line rather than leaving one keyboard path unprotected.
    // Cheap insurance either way: typing "box" into any future text field
    // during a battle should never silently reformat the player's army.
    const activeTag = event.target && event.target.tagName;
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT' ||
        (event.target && event.target.isContentEditable)) return;

    const key = (typeof event.key === "string") ? event.key.toLowerCase() : null;
    if (!key) return;

// 2. REVISED CHAIN OF COMMAND CHECK
// We look for the unit that is BOTH a commander and on the player's side
const activeCommander = battleEnvironment.units.find(u =>
  u.side?.toLowerCase() === 'player' &&
  (
    u.isCommander ||
    ['commander', 'general', 'player', 'captain'].includes(u.unitType?.toLowerCase()) ||
    ['commander', 'general', 'player', 'captain'].includes(u.name?.toLowerCase())
  )
);
    if (!activeCommander || activeCommander.hp <= 0) {
        console.log("Command failed: Player General is fallen or not found!");
        return; 
    }

    // 3. DEFINE SCOPES
    // BUGFIX ("1-5 keys and the selection buttons select nothing at the
    // start of a siege battle"): this used to exclude disableAICombat
    // units. customsiegebattle.js's launch routine deliberately sets
    // disableAICombat=true on every player unit at siege start (a freeze,
    // lifted only by pressing the auto-attack button or by drag-box
    // selecting a unit), so at that point every unit in the battle was
    // being filtered out here — the 1-5 handler and any UI button that
    // reuses this same scope had nothing left to select, no matter what
    // was pressed. Land battles never set disableAICombat at launch, which
    // is why 1-5 always worked there from the first frame.
    // Drag-box selection (below, ~line 2303) never had this exclusion —
    // it selects on side/commander/hp alone — which is why dragging a box
    // worked immediately and "unstuck" 1-5 afterward: lazyTakeManualControl()
    // (called whenever a unit actually becomes selected, here or via drag-box)
    // already clears disableAICombat on the units it touches; the bug was
    // units never becoming selectable in the first place. Matching the
    // drag-box scope exactly (dropping the disableAICombat check) fixes this
    // for every command that shares this variable, not just 1-5.
    const playerUnits = battleEnvironment.units.filter(u => u.side === "player" && !u.isCommander && u.hp > 0);
    const commander = activeCommander; // Alias for use in formation math

    // =========================
    // 1-5: UNIT SELECTION
    // =========================
    if (["1", "2", "3", "4", "5"].includes(key)) {
        let groupNum = parseInt(key);
        
        if (currentSelectionGroup === groupNum) {
            currentSelectionGroup = null;
            playerUnits.forEach(u => {
                if (u.selected) {
                    u.selected = false;
                    lazyReleaseManualControl(u); // hand back to the autopilot immediately
                    if (u.hasOrders && u.orderType === "follow") {
                        u.orderType = "hold_position";
                        u.orderTargetPoint = {
                            x: commander.x + (u.formationOffsetX || 0),
                            y: commander.y + (u.formationOffsetY || 0)
                        };
                    }
                }
            });
            return;
        }
	
	// =========================
        // 1-5: UNIT SELECTION (REVISED AGAIN)
        // =========================
        // UPDATED: selecting a unit now immediately opts it out of every
        // autopilot (this Lazy General AI, and the robot-tactical AI in
        // autoAttack.js) via lazyTakeManualControl() — no explicit order is
        // required first. Only the unit(s) that become selected are
        // affected; everything else keeps running under whichever AI was
        // already controlling it. Deselecting still hands a unit straight
        // back via lazyReleaseManualControl().
        currentSelectionGroup = groupNum;
        playerUnits.forEach(u => {
            let roleCat = getTacticalRole(u);
            let willBeSelected = false;
            
            if (groupNum === 5) willBeSelected = true;
            if (groupNum === 1 && ["INFANTRY", "SHIELD"].includes(roleCat)) willBeSelected = true;
            if (groupNum === 2 && roleCat === "RANGED") willBeSelected = true;
            if (groupNum === 3 && isMountedOrBeast(u)) willBeSelected = true;
            if (groupNum === 4 && roleCat === "GUNPOWDER") willBeSelected = true;

            // STRICT OVERRIDE: Check the central logic gate
            if (willBeSelected && !canSelectUnitNow(u)) {
                willBeSelected = false;
            }
            
            if (u.selected && !willBeSelected) {
                lazyReleaseManualControl(u); // hand back to the autopilot immediately
                if (u.hasOrders && u.orderType === "follow") {
                    u.orderType = "hold_position";
                    u.orderTargetPoint = { x: commander.x + (u.formationOffsetX || 0), y: commander.y + (u.formationOffsetY || 0) };
                }
            }
            // Selection alone now takes THIS unit out of every autopilot —
            // it doesn't wait for an explicit order (see comment above).
            if (willBeSelected && !u.selected) {
                lazyTakeManualControl([u]);
            }
            
            u.selected = willBeSelected;
        });
        
        return;
    }

    const selectedUnits = playerUnits.filter(u => u.selected);
    if (selectedUnits.length === 0) return;

   // =========================
    // Z, X, C, V, B: FORMATIONS (ANCHORED TO SELECTION CENTROID)
    // =========================
    if (["z", "x", "v", "c", "b"].includes(key)) {
        
        if (selectedUnits.length <= 1) return;

        lazyTakeManualControl(selectedUnits);
        _mc3RevertRobotOnCommand(); // real formation command — robot reverts to manual

        // Formation keys put units in a shape and STOP — a "form up here"
        // command, not an order to advance. lazyTakeManualControl above
        // opts the unit out of autoAttack.js's own tactical engine, but
        // that alone isn't enough: any leftover brain-emoji AI tactic
        // (SKIRM/HOLD/CHARGE/ADAPT/SHIELD) from an earlier command is
        // still tagged on the unit via aiTacticGroup/aiTacticNumber, and
        // ai_categories.js keys its own per-frame behavior off exactly
        // that tag — so the instant this one-time move order finishes,
        // an old CHARGE tag (say) would resume driving the unit straight
        // at the enemy. Clearing it here is what makes "form up" actually
        // mean "stop," not just "pause before resuming whatever I was
        // doing before."
        if (window.MobileControls && window.MobileControls.Cmd &&
            typeof window.MobileControls.Cmd._clearAiTacticSilent === 'function') {
            window.MobileControls.Cmd._clearAiTacticSilent(selectedUnits);
        }

        if (key === "z") currentFormationStyle = "tight";  
        if (key === "x") currentFormationStyle = "standard";  
        if (key === "v") currentFormationStyle = "line";   
        if (key === "c") currentFormationStyle = "circle"; 
        if (key === "b") currentFormationStyle = "square"; 
        
        // FIX: anchor the offsets to the centroid of the SELECTED units, not
        // the commander. Previously every formation press also forced
        // orderType = "follow", which re-derives each unit's target every
        // tick as commander.x/y + offset — so units never actually "formed
        // up" where they stood, they permanently chased the commander's
        // position instead (and snapped into a new shape any time the
        // commander moved). Now: compute the centroid once, bake the
        // formation shape onto that fixed point, and give each unit a
        // one-time move_to_point order to its own spot in the shape — a
        // real, stable formation the units walk into and hold.
        const selectionCentroid = lazyCentroid(selectedUnits);
        calculateFormationOffsets(selectedUnits, currentFormationStyle, selectionCentroid);

        selectedUnits.forEach(u => {
            u.hasOrders = true;
            u.orderType = "move_to_point";
            u.orderTargetPoint = {
                x: selectionCentroid.x + (u.formationOffsetX || 0),
                y: selectionCentroid.y + (u.formationOffsetY || 0)
            };
            u.formationTimer = 240; 
            // Remember what shape this unit is currently holding, per-unit —
            // lets a later drag-to-form (see executeBoxFormationMove) detect
            // "this selection already has a formation" and redraw/preserve
            // that same shape instead of always falling back to a fresh
            // varied line.
            u.assignedFormationStyle = currentFormationStyle;
			//u.reactionDelay = Math.floor(Math.random() * 15) + 5; // Add this line
        });
		
 
        return;
    }
    // =========================
    // Q, E, R, F: TACTICAL ORDERS
    // =========================
    switch (key) {

case "f": // FOLLOW COMMANDER
    if (!commander) break;
    lazyTakeManualControl(selectedUnits);
    _mc3RevertRobotOnCommand(); // real order issued — robot reverts to manual
    selectedUnits.forEach(u => {
        u.hasOrders = true;
        u.orderType = "follow";
        u.orderTargetPoint = null;
        u.formationTimer = 240; 
        
        // --- ADD HESITATION HERE ---
     //   u.reactionDelay = Math.floor(Math.random() * 22); // ~0.4 second max delay
    });
	 
    calculateFormationOffsets(selectedUnits, currentFormationStyle, commander);
    break;

        case "q": // SEEK & ENGAGE or SMART SIEGE ASSAULT

            lazyTakeManualControl(selectedUnits);
            _mc3RevertRobotOnCommand(); // real order issued — robot reverts to manual

            if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle) {
                // Initialize the complex Siege Assault logic
                executeSiegeAssaultAI(selectedUnits);
            } else {
                // Standard Field Battle Charge
                selectedUnits.forEach(u => {
                    u.hasOrders = true;
                    u.orderType = "seek_engage"; 
                    u.orderTargetPoint = null;   
                    u.formationTimer = 120;    
 				
                });
            }
            break;

        case "r": // RETREAT 
            
        lazyTakeManualControl(selectedUnits);
        _mc3RevertRobotOnCommand(); // real order issued — robot reverts to manual
    
            selectedUnits.forEach(u => {
                u.hasOrders = true;
                u.orderType = "retreat";
                let stagger = (Math.random() * 20); 
                // SURGERY: retreat toward the player's own assigned spawn
                // direction (was hardcoded to the bottom of the map, which
                // assumed the player always spawned south). Each unit keeps
                // its own lateral spread -- it falls back toward its own
                // column on the rear line rather than regrouping to one
                // point, matching the old "targetX = u.x unchanged" feel.
                const geo = window.battleSpawnAssignment && window.battleSpawnAssignment.player;
                let targetX, targetY;
                if (geo) {
                    const acrossOffset = (u.x - geo.ax) * geo.across.x + (u.y - geo.ay) * geo.across.y;
                    targetX = geo.ax + geo.across.x * acrossOffset - geo.rear.x * stagger;
                    targetY = geo.ay + geo.across.y * acrossOffset - geo.rear.y * stagger;
                } else {
                    targetX = u.x;
                    targetY = BATTLE_WORLD_HEIGHT - 50 - stagger;
                }

                // HOOK CLAMP HERE
                u.orderTargetPoint = getSafeMapCoordinates(targetX, targetY);
 
                u.formationTimer = 240;
		 
            });
            break;

case "e": // STOP / HOLD GROUND
            lazyTakeManualControl(selectedUnits);
            _mc3RevertRobotOnCommand(); // real order issued — robot reverts to manual
    
            selectedUnits.forEach(u => {
                u.hasOrders = true;             
                u.orderType = "hold_position";  
                u.orderTargetPoint = null;
                u.target = null;
                u.formationTimer = 0;
                
                // SURGERY: Hard-kill momentum instantly and clamp physically to the map
                u.vx = 0;
                u.vy = 0;
                let safeCoords = getSafeMapCoordinates(u.x, u.y, 15);
                u.x = safeCoords.x;
                u.y = safeCoords.y;

                if (u.originalRange) {
                    u.stats.range = u.originalRange;
                    u.originalRange = null;
                }
		 
            });
            break;
    }
});
function getTacticalRole(unit) {
    if (!unit) return "INFANTRY";
    
    // 1. Setup the identifiers
    let r = unit.stats && unit.stats.role ? String(unit.stats.role).toUpperCase() : "";
    let textCheck = String((unit.stats?.name || "") + " " + (unit.unitType || "") + " " + (unit.stats?.role || "")).toLowerCase();
    
    // 2. CAVALRY & BEASTS (The "Never Siege" Group)
    // We check for keywords like 'lancer', 'eleph', and 'keshig' here.
    if (["CAVALRY", "HORSE_ARCHER", "MOUNTED_GUNNER", "CAMEL", "ELEPHANT"].includes(r) || 
        unit.stats?.isLarge || 
        textCheck.match(/(cav|horse|mount|camel|lancer|eleph|keshig)/)) {
        return "CAVALRY";
    }

    // 3. GUNPOWDER
    if (["BOMB", "ROCKET", "FIRELANCE", "GUNNER"].includes(r) || textCheck.match(/(bomb|rocket|fire|cannon|gun)/)) {
        return "GUNPOWDER";
    }

    // 4. RANGED
    if (["ARCHER", "CROSSBOW", "THROWING"].includes(r) || textCheck.match(/(archer|bow|crossbow|sling|javelin)/)) {
        return "RANGED";
    }

    // 5. SHIELD
    if (r === "SHIELD" || textCheck.match(/(shield)/)) {
        return "SHIELD";
    }
    
    return "INFANTRY"; // Default for everyone else
}
// ============================================================================
// SMART COMBAT TARGETING (player seek_engage)
// ----------------------------------------------------------------------------
// Mirrors the tactical scoring AICategories.processTargeting (ai_categories.js)
// already applies to ENEMY units in seek_engage — wounded/fleeing preference,
// flanking, isolation, anti-cav avoidance for cavalry, low-armor preference
// for ranged, exposed-backs for melee — plus a new capped focus-fire bonus,
// so the player's own auto-fighting troops judge targets the same way the
// enemy AI already does, instead of blindly walking at whoever is nearest.
// Lower score wins. Kept separate from ai_categories.js (rather than shared)
// since that file's version is side-hardcoded and heavily tuned already —
// if the scoring formula changes, update both.
// Naval is deliberately left alone: real naval combat targeting lives in
// _handleMovement / the naval-specific files, not here.
// ============================================================================
function pickSmartCombatTarget(unit, allUnits, maxRange) {
    if (typeof inNavalBattle !== 'undefined' && inNavalBattle) return null;
    maxRange = (typeof maxRange === 'number') ? maxRange : Infinity;

    const txt = String((unit.unitType || "") + " " + (unit.stats?.role || "") + " " + (unit.stats?.name || "")).toLowerCase();
    const scannerIsMounted = Boolean(unit.stats?.isLarge || unit.isMounted || /\b(cav|horse|mounted|camel|eleph|lancer)\b/.test(txt));
    const scannerIsRanged  = !!(unit.stats?.isRanged);
    const scannerIsMelee   = !scannerIsRanged;

    let bestScore  = Infinity;
    let bestTarget = null;

    for (let i = 0; i < allUnits.length; i++) {
        const other = allUnits[i];
        if (other.side === unit.side || other.hp <= 0 || other.isDummy) continue;

        const baseDist = Math.hypot(unit.x - other.x, unit.y - other.y);
        if (baseDist > maxRange) continue; // outside aggro/engagement range — not a candidate at all

        let score = baseDist;

        // Prefer routing/wavering targets — they die fast and barely fight back
        if (other.state === 'FLEEING' || other.state === 'WAVERING') score -= 280;

        // Prefer wounded targets (stacks at very low HP)
        const otherMaxHp  = (other.stats && other.stats.health) ? other.stats.health : (other.maxHp || other.hp || 1);
        const otherHpPct  = other.hp / otherMaxHp;
        if (otherHpPct < 0.5)  score -= 130;
        if (otherHpPct < 0.25) score -= 80;

        // Flanking bonus — isFlanked() halves their defense, so it's a real edge
        if (typeof isFlanked !== 'undefined' && isFlanked(unit, other)) score -= 90;

        // Isolation (target has no nearby allies of its own) + focus-fire
        // (MY allies already on this target) — one combined scan.
        let isIsolated = true;
        let alliesAlreadyOnTarget = 0;
        for (let k = 0; k < allUnits.length; k++) {
            const scanUnit = allUnits[k];
            if (scanUnit === other || scanUnit.hp <= 0) continue;
            if (scanUnit.side === other.side) {
                if (Math.hypot(scanUnit.x - other.x, scanUnit.y - other.y) < 120) isIsolated = false;
            } else if (scanUnit.side === unit.side && scanUnit.target === other) {
                alliesAlreadyOnTarget++;
            }
        }
        if (isIsolated) score -= 100;
        // Capped so the whole army doesn't dog-pile one unit while the rest
        // of the enemy line walks in unopposed.
        if (alliesAlreadyOnTarget > 0) score -= Math.min(alliesAlreadyOnTarget, 3) * 35;

        // Mounted: avoid anti-cav specialists, prefer the soft ranged backline
        if (scannerIsMounted) {
            const antiCav = Math.max((other.stats && other.stats.bonusVsLarge) || 0, (other.stats && other.stats.antiLargeDamage) || 0);
            score += antiCav * 14;
            if (other.stats && other.stats.isRanged && !other.stats.isLarge && antiCav < 15) score -= 110;
            if (typeof isFlanked !== 'undefined' && isFlanked(unit, other)) score -= 60;
        }

        // Ranged: avoid friendly-fire-risk targets already in melee, prefer low armor
        if (scannerIsRanged && !scannerIsMounted) {
            let otherInMelee = false;
            if (other.state === 'attacking' || other.state === 'moving') {
                for (let k = 0; k < allUnits.length; k++) {
                    const a = allUnits[k];
                    if (a.side !== unit.side || a.hp <= 0 || a.isCommander) continue;
                    if (Math.hypot(a.x - other.x, a.y - other.y) < 45) { otherInMelee = true; break; }
                }
            }
            if (otherInMelee) score += 80;
            const otherArmor = (other.stats && other.stats.armor) || 0;
            if (otherArmor < 5)  score -= 70;
            if (otherArmor < 15) score -= 30;
        }

        // Melee: prefer targets whose back is turned (already fighting someone else)
        if (scannerIsMelee && !scannerIsMounted) {
            if (other.state === 'attacking') score -= 60;
        }

        if (score < bestScore) { bestScore = score; bestTarget = other; }
    }

    return bestTarget;
}

function processTacticalOrders() {
    if (!inBattleMode || !battleEnvironment.units) return;
    
const commander = battleEnvironment.units.find(u =>
  u.side?.toLowerCase() === 'player' &&
  (
    u.isCommander ||
    ['commander', 'general', 'player', 'captain'].includes(u.unitType?.toLowerCase()) ||
    ['commander', 'general', 'player', 'captain'].includes(u.name?.toLowerCase())
  )
);

    battleEnvironment.units.forEach(unit => {
        // SURGERY 1: Protect specialized AI crews from having their targets wiped by formation logic
        if (unit.side !== "player" || unit.isCommander || unit.disableAICombat || unit.hp <= 0) return;

        // FORMATION-LOCK: a unit currently marching to a Total War-style
        // drag-waypoint (see battlefield_commands.js's executeBoxFormationMove
        // and ai_categories.js's processAction) must be completely invisible
        // to this function. This is a SEPARATE function from processAction —
        // it has its own top-level filter here and is called independently
        // once per frame (battlefield_logic.js), so ai_categories.js's own
        // _formationLocked gate (which only protects code *inside*
        // processAction) never actually stopped this file's "canShootWhileMoving"
        // branch and 100px survival override from reassigning unit.target to
        // whatever enemy was nearby and letting ranged units fire mid-march —
        // which is what was pulling units off their ordered line toward
        // whatever they could see/shoot instead of the drawn waypoint. This
        // unit's own leftover AI tactic was already cleared the moment the
        // order was issued (executeBoxFormationMove), so there is nothing
        // legitimate left for this function to do with it until it arrives —
        // ai_categories.js hands it to hold_position on arrival, and THIS
        // function's hold_position branch (below) picks back up from there.
        if (unit._formationLocked) return;

        // BUGFIX ("ladder units retreat south with no animation"): this
        // function used to run unconditionally for units mid-climb
        // (unit.isClimbing) or in the post-climb settle drift
        // (unit.settling — see ai_categories.js's _handleMovement SETTLE
        // PHASE). Neither flag sets disableAICombat, so the 100px emergency
        // survival override a few lines below could fire on a unit that is
        // physics-locked to a ladder rail or mid-settle and hijack
        // unit.target to the nearest defender — usually a wall archer,
        // since ladders sit right against the wall. ai_categories.js's own
        // climb/settle blocks hard-return before checking unit.target, so
        // the hijack didn't break the climb itself, but it left a stale
        // target reference sitting on the unit that could survive into the
        // very first "seek_engage" tick after settling completes, and it
        // wasted a tactical-orders pass on a unit this file has no business
        // touching yet. onWall units are also skipped here now — once a
        // unit has actually landed on the wall it either still holds a real
        // siege_assault order (handled later in this function, which is
        // already onWall-aware) or has just been handed seek_engage by the
        // settle-completion code, in which case the seek_engage branch below
        // is the only thing that should pick its target. Units performing
        // their real orders are otherwise completely unaffected by this
        // guard: siege_assault, hold_position, follow, retreat, etc. never
        // set isClimbing/settling and are not onWall until they've genuinely
        // reached the wall top.
        if (unit.isClimbing || unit.settling) return;

        // Decrement formation timer
        if (unit.formationTimer > 0) unit.formationTimer--;

        let nearestDist = Infinity;
        let nearestEnemy = null;
        
        battleEnvironment.units.forEach(other => {
            if (other.side !== unit.side && other.hp > 0 && !other.isDummy) {
                let dist = Math.hypot(unit.x - other.x, unit.y - other.y);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestEnemy = other;
                }
            }
        });

        if (!nearestEnemy && !unit.hasOrders) {
            unit.target = null;
            return;
        }

const tacticalRole = getTacticalRole(unit);
        // SURGERY: Ensure Horse Archers/Mounted Gunners are recognized as ranged units
        // even though they are grouped as CAVALRY tactically.
        const isRanged = (tacticalRole === "RANGED" || tacticalRole === "GUNPOWDER" || isRangedType(unit) || unit.stats?.isRanged);
        // FIX ("ranged units still shoot even when I try to move them with
        // blue arrows — they should listen and move, unless within a
        // reasonable fraction of their own max range" — direct request):
        // this used to be one flat 100px radius for every unit regardless
        // of type. That's already wrong in both directions for a ranged
        // unit specifically — a short-range skirmisher (e.g. range 200)
        // got a self-defense zone nearly HALF its own weapon range, so it
        // would "emergency" stop-and-shoot a full move order for a threat
        // it could easily have marched past; a long-range crossbowman
        // (range 800+) got a radius under 15% of its range, arguably too
        // tight the other way. Now it's derived per-unit from the unit's
        // own stats.range: 20% of that range, with a 50px floor so a
        // short-ranged/melee unit (whose .range is really just melee
        // reach, e.g. Militia's 15) still gets a sane minimum — 50px
        // matches the existing floor conventions elsewhere in this file
        // (hold_position's own melee aggroLimit a few lines below is 70px,
        // so 50 sits comfortably under that as a strictly emergency-only,
        // even-smaller trigger for a unit that's supposed to be marching
        // through, not holding). Ranged units in particular now get a
        // radius that actually scales with their weapon — an 800-range
        // crossbowman's true "someone is right on top of me" zone is 160px,
        // not a flat 100 that was already inside comfortable firing
        // distance for that same unit, which is exactly how a move order
        // was getting silently swallowed into a stand-and-shoot: the old
        // flat threshold could sit well within a long-ranged unit's real
        // rangeThreshold (ai_categories.js), so nearestDist < 100 fired,
        // unit.target got set, and the subsequent dist-vs-rangeThreshold
        // check downstream saw a target already comfortably in range and
        // fired instead of honoring the still-active move_to_point order.
        const emergencyThreshold = Math.max(50, (unit.stats?.range || 0) * 0.2);
		const isStrictCommand = unit.hasOrders && ["retreat", "follow", "move_to_point", "hold_position"].includes(unit.orderType);
        // FIX: ladder_carrier (and ram_pusher/trebuchet_crew, same exposure)
        // never get disableAICombat=true the way ladder_fanatic does — so the
        // instant a defender came within 100px (guaranteed near a wall lined
        // with archers), this override hijacked unit.target to that defender
        // and the unit stopped advancing to fight instead of climbing. That's
        // most of your ladder force, since ladder_fanatic is only ~10% of
        // climbers (see the fanaticCount roll in autoAttack.js's _runSiege).
        // Committed siege-equipment crew now finish the job they were
        // assigned instead of getting dragged into a fight mid-approach.
        const isCommittedSiegeCrew = ["ladder_carrier", "ram_pusher", "trebuchet_crew"].includes(unit.siegeRole);
        // FIX ("HOLD-tagged units still charge"): hold_position now added to
        // isStrictCommand above. Previously this 100px survival override ran
        // BEFORE the "2. EXECUTE ORDERS" -> hold_position branch below and had
        // no exemption for it, so any enemy that wandered within 100px of a
        // holding unit got hard-assigned as unit.target and the function
        // returned immediately — completely bypassing hold_position's own
        // pickSmartCombatTarget() logic and the aggro-range/formation-lock
        // behavior that's supposed to define what "holding" looks like.
        // Downstream movement/attack execution then had no way to tell that
        // target apart from a real seek_engage/charge target, so a holding
        // unit could visibly close distance and fight just like a charging
        // one. hold_position's own handler (a few lines down) already does
        // smart nearby-target selection using the correct aggroLimit for the
        // unit type, so it's safe — and correct — to let it run instead of
        // being preempted here.
        // FIX ("even hold obeys self-preservation, but ranged units should
        // keep executing a movement order rather than stopping to shoot
        // anything past 100px" — direct request): a bare unit (no brain-
        // emoji tactic tag — includes every unit after 🛑 GLOBAL STOP,
        // which now clears tactic tags too, see autoAttack.js) executing a
        // plain movement order (move_to_point/retreat/follow) previously
        // got ZERO self-defense here at all, since those three order types
        // were unconditionally exempted via isStrictCommand above — an
        // AI-disabled unit mid-march could get freely pelted with no
        // reaction. Tactic-tagged units are deliberately still excluded:
        // each tactic already has its own bespoke self-defense-while-
        // marching logic (see ai_categories.js's per-tactic blocks), and
        // this generic override firing on top would fight those.
        // hold_position remains excluded here regardless of tag too — it's
        // always handled by its own dedicated aggro logic a few lines
        // below (70px melee / full weapon range ranged), the correct
        // behavior for a fully-stopped unit. Setting unit.target here
        // (same pattern hold_position's own handler uses below) only
        // ENABLES attacking if the target is already in real weapon range
        // on a later pass — it does not redirect this unit's own
        // movement, which stays driven by orderTargetPoint — so a ranged
        // unit ordered to move keeps walking through anything beyond its
        // own emergencyThreshold (now the per-unit range-fraction radius
        // defined above, not a flat 100) instead of stopping to shoot it,
        // exactly as specified. (A melee unit inside its own trigger but
        // still outside its own ~30px reach just doesn't act on it — same
        // "detects but can't yet reach" gap hold_position's own 70px
        // melee aggro zone already has today; not new.)
        const isTacticControlled = !!(unit.aiTacticGroup && unit.aiTacticGroup !== 'auto');
        const bareMovementOrder = isStrictCommand && unit.orderType !== "hold_position" && !isTacticControlled;
        // ====================================================================
        // SURVIVAL OVERRIDE: Emergency Self-Defense (20% of own range, 50px floor)
        // ====================================================================
        if ((!isStrictCommand || bareMovementOrder) && nearestDist < emergencyThreshold && nearestEnemy && !unit.disableAICombat && !isCommittedSiegeCrew) {
            if (unit.originalRange) {
                unit.stats.range = unit.originalRange;
                unit.originalRange = null;
            }
            
            unit.reactionDelay = 0; 
            unit.formationTimer = 0; 
            unit.target = nearestEnemy;
            return; // Halts waypoint logic so they fight immediately
        }

        // ====================================================================
        // STAGGERED REACTION DELAY
        // ====================================================================
        if (unit.reactionDelay > 0) {
            unit.reactionDelay--;
            return; 
        }

      // 2. EXECUTE ORDERS
        if (unit.hasOrders) {
            
			if (unit.orderType === "hold_position") {
                // SURGERY: Force range restoration so they evaluate max defined range immediately!
                if (unit.originalRange) {
                    unit.stats.range = unit.originalRange;
                    unit.originalRange = null;
                }

                // Ranged units use max range, melee units use an emergency 70px self-defense radius
                let aggroLimit = isRanged ? unit.stats.range : 70;

                // PERF (direct request — "make sure somewhat optimized so
                // doesn't slow down too much on PC"): pickSmartCombatTarget
                // does an O(n) scan with a nested O(n) isolation/focus-fire
                // check per candidate — a real cost with large armies — and
                // this ran fully unthrottled every single frame for every
                // hold_position unit (which includes every SHIELD-locked
                // unit once it's within its own weapon range, per that
                // tactic's own comment). A held unit's surroundings don't
                // meaningfully change frame-to-frame, so re-running the
                // full scan only every 4th frame (~65ms at 60fps —
                // imperceptible reaction lag for a stationary unit) cuts
                // this cost 75% for anything holding still. Falls straight
                // through to a fresh scan immediately if the cached target
                // died or wandered outside aggroLimit, so losing/
                // re-acquiring a target is never stale.
                unit._holdScanTick = ((unit._holdScanTick || 0) + 1) % 4;
                const cachedTarget = unit.target;
                const cachedStillValid = cachedTarget && cachedTarget.hp > 0 &&
                    Math.hypot(unit.x - cachedTarget.x, unit.y - cachedTarget.y) <= aggroLimit;
                // SMART TARGET SELECTION among everyone within aggro range — was
                // "lock onto whoever is physically nearest". A holding archer
                // with three targets in range should still prefer the wounded
                // or isolated one, not just the closest. See pickSmartCombatTarget().
                const holdTarget = (unit._holdScanTick !== 0 && cachedStillValid)
                    ? cachedTarget
                    : pickSmartCombatTarget(unit, battleEnvironment.units, aggroLimit);
                if (holdTarget) {
                    unit.target = holdTarget;
                    return; // Locks on and executes combat
                }
                
                // No one in range? Stand perfectly still.
                let safeAnchor = typeof getSafeMapCoordinates === 'function' ? getSafeMapCoordinates(unit.x, unit.y, 15) : { x: unit.x, y: unit.y };
				
                unit.target = { 
                    x: safeAnchor.x, 
                    y: safeAnchor.y, 
                    hp: 9999, 
                    isDummy: true,
                    isAnchor: true
                };
                
                // SURGERY: Bypassing normal movement skips the Iron Cage clamp. We must enforce it here!
                unit.x = safeAnchor.x;
                unit.y = safeAnchor.y;
                unit.vx = 0;
                unit.vy = 0;
                unit.state = "idle";
                return;
            }

            // ==========================
            // SEEK & ENGAGE (The only order where they are allowed to be distracted)
            // ==========================
            if (unit.orderType === "seek_engage") {
                // ── AI TACTIC: SKIRMISH ISOLATION TARGETING (melee only) ──
                // Per direct request: "mele units will only try to pic
                // isolated units of enemies, within 200 pixels distance
                // count how many units of each group, and only prioritize
                // picking the isolated units. while charge is a stupid
                // banzai charge lol at the closest unit." A skirmish-tagged
                // melee unit now picks strictly by lowest same-side-ally
                // count within 200px of the CANDIDATE enemy (not the
                // scanning unit) — the enemy standing furthest from support
                // wins, ties broken by distance to the scanning unit so it's
                // not picking an equally-isolated target on the far side of
                // the map. This is a hard override, not a scoring nudge —
                // unlike pickSmartCombatTarget's existing isolation bonus
                // (a soft -100 among many other factors, fixed 120px radius,
                // and disabled outright in naval battles), this is the
                // ENTIRE selection criterion, at the 200px radius specified,
                // for melee/skirmish only. CHARGE is completely untouched —
                // it never enters this branch (isMeleeSkirmish requires
                // aiTacticGroup === 'skirmish') and keeps the existing
                // pickSmartCombatTarget-or-nearest picker below, i.e. the
                // "dumb charge at the closest unit" the request explicitly
                // wants preserved. Ranged skirmish units are also untouched
                // here — their tactic is expressed entirely through the
                // kiting distance-keeping in ai_categories.js, not target
                // choice, so this only branches for non-ranged units.
                const isMeleeSkirmish = unit.aiTacticGroup === 'skirmish' && !unit.stats.isRanged;
                let chosenTarget = null;
                if (isMeleeSkirmish) {
                    let bestIsolation = Infinity;
                    let bestDist = Infinity;
                    for (let ti = 0; ti < battleEnvironment.units.length; ti++) {
                        const cand = battleEnvironment.units[ti];
                        if (cand.side === unit.side || cand.hp <= 0 || cand.isDummy) continue;
                        let allyCount = 0;
                        for (let tj = 0; tj < battleEnvironment.units.length; tj++) {
                            const ally = battleEnvironment.units[tj];
                            if (ally === cand || ally.hp <= 0 || ally.side !== cand.side) continue;
                            if (Math.hypot(ally.x - cand.x, ally.y - cand.y) <= 200) allyCount++;
                        }
                        const candDist = Math.hypot(unit.x - cand.x, unit.y - cand.y);
                        if (allyCount < bestIsolation ||
                            (allyCount === bestIsolation && candDist < bestDist)) {
                            bestIsolation = allyCount;
                            bestDist = candDist;
                            chosenTarget = cand;
                        }
                    }
                }
                if (!chosenTarget) {
                    // SMART TARGET SELECTION — was a flat `unit.target = nearestEnemy`
                    // (pure distance). See pickSmartCombatTarget() above.
                    const smartTarget = pickSmartCombatTarget(unit, battleEnvironment.units);
                    chosenTarget = smartTarget || nearestEnemy; // naval, or nothing scored — fall back to nearest
                }
                if (chosenTarget) {
                    // SURGERY: post-breach city attackers (siegeRole stays
                    // "assault_complete" from the gate handoff above) need
                    // wall/building steering that open-field land battles
                    // never required — see getCityNavTarget(). Every other
                    // seek_engage unit (every normal land battle) is untouched.
                    unit.target = (unit.siegeRole === "assault_complete")
                        ? getCityNavTarget(unit, chosenTarget)
                        : chosenTarget;
                }
                return; 
            }
            
			// ==========================
            // SMART SIEGE ASSAULT LOGIC
            // ==========================
            if (unit.orderType === "siege_assault") {
                let wallBoundaryY = (typeof CITY_LOGICAL_HEIGHT !== 'undefined' ? CITY_LOGICAL_HEIGHT : 3200) - 40;
                // FIX: read the LIVE battle gate first. Custom Siege Battle deep-clones
                // overheadCityGates into battleEnvironment.cityGates (see customsiegebattle.js),
                // so in that mode overheadCityGates is a stale, disconnected copy — mutating
                // it here would never be seen by the ram, the renderer, or collision checks.
                // Standard siege battles assign battleEnvironment.cityGates = overheadCityGates
                // by reference, so this is identical behavior there, just resolved through the
                // one source that's always correct for the battle actually running.
                let southGate = (typeof battleEnvironment !== 'undefined' && battleEnvironment.cityGates && battleEnvironment.cityGates.length > 0)
                    ? battleEnvironment.cityGates.find(g => g.side === "south")
                    : (typeof overheadCityGates !== 'undefined' ? overheadCityGates.find(g => g.side === "south") : null);

                // Now sourced from the single canonical isSiegeGateBreached()
                // helper (ai_categories.js) — it already implements this exact
                // same live-gate-first / overheadCityGates-fallback logic, plus
                // the global-flag check, so every part of the codebase agrees.
                let gateBreached = isSiegeGateBreached();
				
				// ---> SURGERY: MANDATORY PLAZA RUSH OVERRIDE (2-STAGE FUNNEL) <---
                if (gateBreached && unit.siegeRole !== "ladder_fanatic") {
                    unit.siegeRole = "assault_complete";

                    let gateX = typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelX : 1200;
                    let gateY = typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelY : 2000;

                    // Check if unit has crossed the gate threshold into the city
                    let isInsideCity = unit.y < gateY + 20;

                    // SURGERY: STUCK-AT-THE-DOOR FAILSAFE. Stage 1 below aims
                    // every not-yet-crossed unit at nearly the same ~60px-wide
                    // point every single frame AND sets disableAICombat=true
                    // (sprint, ignore combat entirely). If the doorway is
                    // jammed — several units all converging on the same tight
                    // target simultaneously, unit-collision blocking forward
                    // movement — a unit can sit here making no real progress,
                    // forever undefended, which is exactly the persistent
                    // cluster of frozen units piling up right at the gate
                    // mouth. Track real forward progress (unit.y decreasing —
                    // camp is south/larger-y, city is north/smaller-y); if a
                    // unit hasn't meaningfully advanced in 4 seconds, stop
                    // trusting the strict Y-threshold and hand it to Stage 2
                    // anyway, exactly as if it had made it through.
                    if (!isInsideCity) {
                        if (unit._gateFunnelLastY === undefined || (unit._gateFunnelLastY - unit.y) > 5) {
                            unit._gateFunnelLastY = unit.y;
                            unit._gateFunnelStuckSince = Date.now();
                        }
                        if (Date.now() - unit._gateFunnelStuckSince > 4000) {
                            isInsideCity = true; // jammed too long — force the handoff
                        }
                    }

                    if (!isInsideCity) {
                        // STAGE 1: FUNNEL TO THE EXACT GATE
                        unit.target = { 
                            x: gateX + (Math.random() - 0.5) * 60, // Tight squeeze through the doors
                            y: gateY - 20, // Aim slightly inside so they actually cross the threshold
                            hp: 9999,
                            isDummy: true,
                            priority: "gate_funnel" 
                        };
                        unit.orderTargetPoint = null; 
                        // FIX: this was `false` despite the comment saying "ignore
                        // defenders, sprint to the gate" — false leaves AI combat ON,
                        // so the 100px emergency survival override earlier in this
                        // function could still hijack unit.target to a nearby
                        // defender on any frame one got close, derailing the unit
                        // off the gate line. That's the actual guarantee-breaker:
                        // true is what the comment always meant.
                        unit.disableAICombat = true; // Ignore defenders outside, sprint to the gate
                        return; // Halts the rest of the targeting logic
                    } else {
                        // SURGERY: through the gate — hand off to the exact same
                        // order type every normal (non-siege) land battle uses,
                        // instead of continuing with a siege-only dummy-point rush
                        // toward the plaza. From this frame on, this unit is fully
                        // owned by the seek_engage branch above (pickSmartCombatTarget)
                        // and whatever movement/pathfinding land units already get —
                        // buildings included — rather than a synthetic {x,y} point.
                        // siegeRole stays "assault_complete" (not cleared) purely so
                        // the wall/gate hard-collision clamp in siegeEngineLogic.js
                        // keeps exempting them if combat later carries them back near
                        // the gate's x-line.
                        unit.disableAICombat = false;
                        unit.orderType = "seek_engage";
                        unit.hasOrders = true;
                        unit.target = nearestEnemy || null;
                        // Done funneling — drop the stuck-tracking fields so a
                        // later re-entry into Stage 1 (unlikely, but possible
                        // if combat ever pushes the unit back south) starts
                        // its own-progress clock fresh instead of inheriting a
                        // timestamp from this pass through the gate.
                        delete unit._gateFunnelLastY;
                        delete unit._gateFunnelStuckSince;
                        return;
                    }
                }


              // --- Pre-Breach Backup Logic ---
                // BUGFIX: this used to fire for EVERY unit at/past wallBoundaryY or
                // onWall, unconditionally — including ram_pushers/ladder_carriers who
                // still had a live siegeTarget they hadn't reached yet. That silently
                // overrode their destination with "just fight nearest enemy" every
                // tick, so they never actually walked to their assigned ram/ladder.
                // Fix: skip this intercept for units still actively en route to a
                // live ram/ladder/trebuchet target — let the switch below keep
                // moving them. Everyone else (no assignment, or target already
                // destroyed/reached) still gets the original "fight nearby" behavior.
                const stillEnRouteToSiegeEquipment =
                    (unit.siegeRole === "ram_pusher" || unit.siegeRole === "ladder_carrier" ||
                     unit.siegeRole === "trebuchet_crew") &&
                    unit.siegeTarget && unit.siegeTarget.hp > 0 && !unit.onWall;

                if ((unit.y < wallBoundaryY || unit.onWall) && !stillEnRouteToSiegeEquipment) {
                    const unitRole = unit.stats.role;
                    const isRangedAssault = (
                        unitRole === "archer" || 
                        unitRole === "horse_archer" || 
                        unitRole === "crossbow" || 
                        unitRole === "gunner" || 
                        unitRole === "mounted_gunner" || 
                        unitRole === "Rocket" 
                    );

                    // ---> SURGERY: REMOVED THE RANGE 10 NERF! <---
                    // We deleted the block that forced them into melee. 
                    // Let them keep their bows out!

                    // --- NEW: WALL-CLIMB → GATE RUSH ---
                    // A friendly attacker who has successfully climbed onto the wall
                    // (onWall === true) should immediately head for the gate, UNLESS
                    // a defender is close enough to be an immediate threat — in that
                    // case, deal with them first rather than run past an active fight.
                    // "Immediate threat" reuses the same nearestDist already computed
                    // for this unit above; MELEE_ENGAGE_RANGE approximates "close
                    // enough that ignoring them would look unrealistic."
                    const MELEE_ENGAGE_RANGE = 60;
                    if (unit.onWall && !gateBreached && southGate &&
                        !(nearestEnemy && nearestDist < MELEE_ENGAGE_RANGE)) {
                        let gateRushX = (typeof SiegeTopography !== 'undefined')
                            ? SiegeTopography.gatePixelX : southGate.x * BATTLE_TILE_SIZE;
                        let gateRushY = (typeof SiegeTopography !== 'undefined')
                            ? SiegeTopography.gatePixelY : southGate.y * BATTLE_TILE_SIZE;
                        unit.target = {
                            x: gateRushX + (Math.random() - 0.5) * 50,
                            y: gateRushY,
                            hp: 9999,
                            isDummy: true,
                            priority: "gate_rush_climber"
                        };
                        unit.headingToGate = true; // flag read by the gate-open check below

                        // Once close enough to the gate, this climber forces it open —
                        // FIX: route through triggerGateBreach() instead of hand-setting
                        // isOpen/the global flag. The old version never zeroed gateHP,
                        // so anything that renders the gate off of HP (a destroyed-gate
                        // sprite/collision state) kept drawing it fully intact even
                        // though every AI/collision check correctly treated it as open.
                        const GATE_OPEN_TRIGGER_RANGE = 70;
                        let distToGate = Math.hypot(unit.x - gateRushX, unit.y - gateRushY);
                        if (distToGate < GATE_OPEN_TRIGGER_RANGE && southGate.gateHP > 0) {
                            if (typeof triggerGateBreach === 'function') {
                                triggerGateBreach(southGate);
                            } else {
                                // Fallback if the helper isn't loaded for some reason —
                                // still zero the HP so render/collision agree with isOpen.
                                southGate.isOpen = true;
                                southGate.gateHP = 0;
                                window.__SIEGE_GATE_BREACHED__ = true;
                            }
                            if (typeof AudioManager !== 'undefined') AudioManager.playSound('gate_break');
                        }
                        return;
                    }
                    // --- END WALL-CLIMB → GATE RUSH ---

                    if (nearestEnemy) {
                        unit.target = nearestEnemy;
                    }
                    return; 
                }

                let destX = unit.x;
                let destY = unit.y;

                switch (unit.siegeRole) {
                    case "ram_pusher":
                        if (unit.siegeTarget && unit.siegeTarget.hp > 0) {
                            destX = unit.siegeTarget.x + (Math.random() - 0.5) * 15;
                            let queueOffset = unit.queuePos > 6 ? (unit.queuePos * 4) : 0; 
                            destY = unit.siegeTarget.y + 15 + queueOffset;
                        } else {
                            // Ram died/gone — RESERVES REMOVED, so this unit becomes
                            // ladder crew instead of parking in a reserve role that no
                            // longer exists. It will be picked up and given a real
                            // ladder assignment (with a proper queue position) the next
                            // time executeSiegeAssaultAI runs, since a unit with
                            // siegeRole "ram_pusher" but a dead/missing siegeTarget
                            // matches autoAttack.js's needsAssignment filter. Until
                            // then, hold it in place rather than snapping to (0,0)-ish
                            // stale coordinates.
                            unit.siegeRole = null;
                            unit.siegeTarget = null;
                            destX = unit.x;
                            destY = unit.y;
                        }
                        break;

                   case "ladder_carrier":
                        if (unit.siegeTarget && unit.siegeTarget.hp > 0) {
                            // LADDER QUEUE (replaces old "total swarm, no queues" logic):
                            // queuePos is assigned round-robin in executeSiegeAssaultAI.
                            // Positions within the crew cap walk straight to the ladder;
                            // positions beyond it hold at a waiting spot a short distance
                            // behind the ladder, staggered so units queue in a visible
                            // line instead of stacking on the exact same point or
                            // swarming randomly around the base.
                            const LADDER_CREW_CAP = 2;
                            let isActiveCrew = (unit.queuePos == null) || (unit.queuePos < LADDER_CREW_CAP);

                            if (!unit.siegeTarget.isDeployed) {
                                // Ladder not yet deployed/carried into place — everyone
                                // assigned to it (active crew or queued) converges to help
                                // carry it, same as before. A small, tight jitter (not a
                                // wide swarm) keeps them from perfectly overlapping.
                                destX = unit.siegeTarget.x + (Math.random() - 0.5) * 30;
                                destY = unit.siegeTarget.y + (Math.random() - 0.5) * 25;
                            } else if (isActiveCrew) {
                                // Deployed and this unit has an open crew slot — go climb.
                                destX = unit.siegeTarget.x;
                                destY = unit.siegeTarget.y - 10;
                            } else {
                                // Deployed but this unit is queued behind the crew cap —
                                // hold at a staggered waiting spot a short distance south
                                // of the ladder base instead of walking up to (and
                                // crowding) the climb point. Recomputed only when the
                                // queue position changes so it doesn't jitter every tick.
                                let queueRank = unit.queuePos - LADDER_CREW_CAP;
                                let waitDestX = unit.siegeTarget.x + ((queueRank % 3) - 1) * 24;
                                let waitDestY = unit.siegeTarget.y + 40 + Math.floor(queueRank / 3) * 22;
                                destX = waitDestX;
                                destY = waitDestY;
                            }
                        } else {
                            // Ladder died/gone — same fix as ram_pusher above: fall
                            // through to a fresh ladder assignment next AI pass rather
                            // than a reserve role that no longer exists.
                            unit.siegeRole = null;
                            unit.siegeTarget = null;
                            destX = unit.x;
                            destY = unit.y;
                        }
                        break;
						
                    case "trebuchet_crew":
                        if (unit.siegeTarget && unit.siegeTarget.hp > 0) {
                            destX = unit.siegeTarget.x + (Math.random() - 0.5) * 25;
                            destY = unit.siegeTarget.y + 20 + (Math.random() * 10)+80;
                        } else {
                            unit.siegeRole = "ranged_support";
                        }
                        break;
						
					case "ranged_support":
                        let isShortRange = String((unit.stats?.role || "") + " " + (unit.unitType || "")).toLowerCase().match(/(firelance|bomb|hand cannon)/);
                        
                        // Let short-range support keep their pushed-up target from siegebattle.js
                        if (isShortRange && unit.target && unit.target.isDummy && unit.target.y < wallBoundaryY + 150) {
                            destX = unit.target.x;
                            destY = unit.target.y;
                        } else {
                            destX = unit.x; 
                            // ---> SURGERY: PUSH ARCHERS TO THE FRONT LINE <---
                            destY = wallBoundaryY + 90; // Moved from +150/+300 down to +90 to guarantee they have range on defenders
                        }
                        
                        if (nearestEnemy && nearestEnemy.onWall) {
                            let dist = Math.hypot(unit.x - nearestEnemy.x, unit.y - nearestEnemy.y);
                            if (dist < unit.stats.range * 0.9) {
                                unit.target = nearestEnemy;
                                unit.orderTargetPoint = { x: unit.x, y: unit.y }; 
                                return;
                            }
                        } else if (nearestEnemy && Math.hypot(unit.x - nearestEnemy.x, unit.y - nearestEnemy.y) < unit.stats.range) {
                            unit.target = nearestEnemy;
                            return;
                        }
                        break;

                    default:
                        // No siegeRole assigned yet (e.g. no rams/ladders exist at
                        // all yet, very start of the battle before equipment has
                        // spawned — see executeSiegeAssaultAI's fallback, and
                        // autoAttack.js's needsAssignment filter for the fix that
                        // makes sure this is only ever a brief, one-tick state.
                        //
                        // BUGFIX ("units flicker left-right within a few pixels,
                        // hesitant to do anything"): this used to compute
                        // `destX = unit.x + (Math.random()-0.5)*40` FRESH every
                        // single tick with no caching — every tick this unit
                        // spent here (which, before the needsAssignment fix,
                        // could be the entire rest of the battle) it got handed
                        // a brand new random +/-20px target immediately, which
                        // is a literal random walk with no persistence — exactly
                        // the reported flicker. Cache the waypoint once, the
                        // same pattern the "follow" case below already uses for
                        // its own commander-relative waypoint, so a unit sitting
                        // in this fallback for even one extra tick holds still
                        // and walks toward the wall in a straight line instead
                        // of vibrating in place.
                        if (unit._noRoleWaypointX === undefined) {
                            unit._noRoleWaypointX = unit.x + (Math.random() - 0.5) * 40;
                            unit._noRoleWaypointY = wallBoundaryY + 200;
                        }
                        destX = unit._noRoleWaypointX;
                        destY = unit._noRoleWaypointY;
                        break;

				}
                unit.target = { 
                    x: destX, 
                    y: destY, 
                    hp: 100, 
                    isDummy: true,
                    side: unit.side, 
                    stats: { meleeDefense: 0, armor: 0, health: 100 } 
                };
                
                return; 
            }

            // ==========================
            // STANDARD / FIELD MOVEMENT
            // ==========================
            let rawDestX = unit.x;
            let rawDestY = unit.y;

if (unit.orderType === "follow" && commander) {
                // Initialize the brain delay timer 
                if (unit.followDelayTimer === undefined) unit.followDelayTimer = 0;

                let distToCmdr = Math.hypot(unit.x - commander.x, unit.y - commander.y);

                // Update waypoint only if timer runs out, OR if they get way too far away (safety catch)
                if (unit.followDelayTimer <= 0 || distToCmdr > 250) {
                    unit.cachedFollowX = commander.x + (unit.formationOffsetX || 0);
                    unit.cachedFollowY = commander.y + (unit.formationOffsetY || 0);
                    
                    // Add random variation (120 to 180 ticks = 2 to 3 seconds) so they don't all march at the exact same frame
                    unit.followDelayTimer = 50 + Math.floor(Math.random() * 60); 
                } else {
                    unit.followDelayTimer--;
                }

                rawDestX = unit.cachedFollowX;
                rawDestY = unit.cachedFollowY;
            } else if (unit.orderTargetPoint) {
                rawDestX = unit.orderTargetPoint.x;
                rawDestY = unit.orderTargetPoint.y;
            }
			let safeDest = getSafeMapCoordinates(rawDestX, rawDestY);
            let destX3 = safeDest.x;
            let destY3 = safeDest.y;

          



			let distToDest = Math.hypot(unit.x - destX3, unit.y - destY3);

// ====================================================================
            // HYSTERESIS BUFFER (The Flicker Fix) - UPGRADED TO DUAL-THRESHOLD
            // ====================================================================
            // 1. Identify if it's a horse/cavalry
            const isCavalry = tacticalRole === "CAVALRY" || (unit.stats && unit.stats.role === "horse_archer");
            
            // 2. Set TWO boundaries: A tight one to stop, a loose one to wake up
            const stopDistance = isCavalry ? 35 : 18;
            const wakeDistance = isCavalry ? 75 : 30; // The unit must fall this far behind to start running again

            // 3. State toggle (The Rubber Band)
            if (distToDest <= stopDistance) unit.isSettled = true;
            if (distToDest > wakeDistance) unit.isSettled = false;

            if (unit.isSettled) {
                // Restore range if they were previously "marching"
                if (unit.originalRange) {
                    unit.stats.range = unit.originalRange;
                    unit.originalRange = null;
                }

                // ENABLE SHOOTING WHILE SETTLED
                let engagedEnemy = false;
                if (isRanged && nearestEnemy) {
                    let actualRange = unit.stats.range;
                    let distToEnemy = Math.hypot(unit.x - nearestEnemy.x, unit.y - nearestEnemy.y);
                    if (distToEnemy <= actualRange) {
                        unit.target = nearestEnemy;
                        engagedEnemy = true;
                    }
                }

                if (!engagedEnemy) {
                    // Force the unit to stay at its current position and stop moving
                    unit.target = { x: unit.x, y: unit.y, hp: 9999, isDummy: true, isAnchor: true };
                    unit.vx *= 0.5; // Smoothly damp velocity instead of a jarring 0
                    unit.vy *= 0.5;
                    
                    // IF WITHIN THE BUFFER: FORCE IDLE ANIMATION
                    unit.state = "idle"; 
                }

                // If they are following you or retreating, don't clear the order, just stay in idle/shooting state
                if (unit.orderType === "follow" || unit.orderType === "move_to_point" || unit.orderType === "retreat") {
                    return; 
                }

                unit.hasOrders = false;
                unit.orderType = null;
                unit.orderTargetPoint = null;
                return;
            }
			
			
			
			
			
            let shouldFocusOnShooting = false;
			if (distToDest > 20) {
			// SURGERY: Ranged units MUST NOT shoot while actively trying to reach the Commander during a Follow command.
							let canShootWhileMoving = isRanged && unit.formationTimer <= 0 && unit.orderType !== "follow";
			if (canShootWhileMoving) {
                    if (unit.originalRange) {
                        unit.stats.range = unit.originalRange;
                        unit.originalRange = null;
                    }
                    if (nearestEnemy) {
                        let distToEnemy = Math.hypot(unit.x - nearestEnemy.x, unit.y - nearestEnemy.y);
                        if (distToEnemy <= unit.stats.range) {
                            
// ---> SURGERY: UNIFIED RELOAD-WALK LOGIC FOR ALL RANGED UNITS <---
                            let isReloading = unit.cooldown && unit.cooldown > 0;

                            // ALL ranged units (foot and horse) MUST keep walking if they are reloading
                            if (isReloading && unit.orderType === "follow") {
                                // Do NOT focus on shooting. Skip so they default to moving to dummy waypoint.
                            } else {
                                unit.target = nearestEnemy;
                                shouldFocusOnShooting = true; 
                                
                                if (unit.orderType === "follow") {
                                    // ALL ranged units lock their feet to fire properly
                                    unit.vx = 0; 
                                    unit.vy = 0;
                                }
                            }
                            // -----------------------------------------------------------------
                            
                        }
                    }
                }

                if (!shouldFocusOnShooting) {
                    if (!unit.originalRange && unit.stats.range > 20) {
                        unit.originalRange = unit.stats.range;
                    }
                    unit.stats.range = 10; 
                }
          } 
		  
		  
		  else {
                if (unit.originalRange) {
                    unit.stats.range = unit.originalRange;
                    unit.originalRange = null; 
                }
            }

            if (!shouldFocusOnShooting) {
                unit.target = { 
                    x: destX3, 
                    y: destY3, 
                    hp: 100, 
                    isDummy: true,
                    side: unit.side, 
                    stats: { meleeDefense: 0, armor: 0, health: 100, experienceLevel: 0, currentStance: "statusmelee" } 
                };
                // Do NOT force statusmelee here if they are archers!
                if (!isRanged) unit.stats.currentStance = "statusmelee"; 
            }
            
        } else {
            if (unit.originalRange) {
                unit.stats.range = unit.originalRange;
                unit.originalRange = null;
            }
        }
    });
}
// ============================================================================
// SIEGE ASSAULT COMMAND ENGINE (REVISED & FIXED)
// ============================================================================

// NOTE: isSiegeGateBreached() used to be (re)defined here too — a second,
// orphaned copy with zero callers anywhere in the codebase and DIFFERENT
// semantics (it returned true for any non-siege battle, rather than false).
// Two same-named top-level functions across separately-loaded <script> files
// share one global scope, so whichever loaded second would silently win —
// exactly the kind of invisible collision that made a simple gate check
// unreliable before. The one real implementation now lives in
// ai_categories.js, attached to window.isSiegeGateBreached; every call site
// in this file uses that one.

function isMountedOrBeast(unit) {
    if (!unit || !unit.stats) return false;
    if (unit.isCommander) return false; // Commander is exempt from "mounted" restrictions
    
    const role = (unit.stats.role || "").toLowerCase();
    const type = (unit.unitType || "").toLowerCase();
    const combined = `${role} ${type}`;
    
    // Check for "Large" flag or specific unit keywords
    return unit.stats.isLarge || 
           combined.match(/(cav|horse|lancer|mount|camel|eleph|beast|keshig|cataphract|zamburak)/);
}

function canSelectUnitNow(unit) {
    // 1. Core safety check: Only select living units
    if (!unit || unit.hp <= 0) return false;
    
    // 2. SURGERY: Removed the isMountedOrBeast / gateBreached blockers.
    // All living units are now universally selectable in all battle modes.
    
    return true;
}

function executeSiegeAssaultAI(units) {
    if (!siegeEquipment) return;
    // Was: `window.__SIEGE_GATE_BREACHED__` only — missed the gate object's
    // own isOpen/gateHP state entirely, so this could disagree with every
    // other system if the flag hadn't been (re)set yet. Now uses the same
    // canonical helper as everywhere else.
    const gateBreached = isSiegeGateBreached();

    // BUGFIX ("ladder units retreat south with no animation"), DEFENSE IN
    // DEPTH: autoAttack.js's needsAssignment filter is the primary fix and
    // already excludes onWall/isClimbing/settling units before they ever
    // reach this function, but this function can also be called directly
    // (see its other call site) without going through that filter. A unit
    // that already climbed a ladder and landed onWall has finished its
    // siege-equipment job; re-categorizing it here can hand it a fresh
    // ram_pusher/ladder_carrier assignment pointing back at a ram or a
    // ladder base — silently relocating a unit that should be fighting
    // inside the city. Strip those units out up front so this function can
    // never draft them, regardless of what the caller passed in.
    //
    // ladder_fanatic/counter_battery/ladder_crew units are also excluded
    // here for the same reason — they're managed by a separate, self-
    // contained one-time role roll (autoAttack.js) plus siegeEngineLogic.js's
    // ladder-dragging logic, which already reverts them to a normal
    // assignment once their ladder is deployed. Re-categorizing a
    // ladder_fanatic here mid-drag was overwriting its role before the
    // ladder it was hauling ever reached the wall.
    //
    // SAME BUG, GATE VERSION: a unit tagged "assault_complete" already made
    // it through the breached gate and was handed off to seek_engage —
    // that's a real target, fighting inside the city. Without this
    // exclusion, the very next periodic sweep (see autoAttack.js) saw its
    // orderType was no longer "siege_assault", decided it "needsAssignment",
    // and handed it right back a ram/ladder to walk to — silently undoing
    // the gate handoff and pulling successful attackers back to the doorway
    // in a loop. That's the persistent cluster of units piling up at the
    // gate mouth: every unit that makes it through gets yanked back within
    // moments, so nothing ever accumulates on the city side.
    units = units.filter(u => !u.onWall && !u.isClimbing && !u.settling &&
        u.siegeRole !== 'ladder_fanatic' && u.siegeRole !== 'counter_battery' &&
        u.siegeRole !== 'assault_complete' &&
        u.orderType !== 'ladder_crew');
    if (!units.length) return;

    // ========================================================================
    // RESERVES REMOVED ENTIRELY (explicit request).
    // ------------------------------------------------------------------------
    // Previously there were THREE separate, overlapping "hold units back"
    // mechanisms in this codebase, all fighting each other and all
    // contributing to units visibly walking toward a ladder, getting yanked
    // far away, and walking back later:
    //   1. TOTAL_FORCE_RESERVE_PCT here — randomly drafted ~2% of the whole
    //      army every time this function ran (which is often — see
    //      autoAttack.js's interval) into "cavalry_reserve", teleport-
    //      assigning them a waypoint at the siege camp, deep south of the
    //      wall. A unit mid-approach to a ladder could be swept into this
    //      draft the next time it re-entered needsAssignment (e.g. its
    //      ladder was momentarily reassigned) and get yanked to camp.
    //   2. A 100%-of-cavalry hard freeze (ai_categories.js, keyed on
    //      siegeRole === "cavalry_reserve") that parked every mounted unit
    //      immobile until the gate broke.
    //   3. A SECOND, fully independent siege-attacker AI driver that used to
    //      live in siegeEngineLogic.js (the old "3. ATTACKER AI (PLAYER)"
    //      block, gated on `siegeAITick % 4 === 0`) — a completely separate
    //      system re-classifying units by its own rules (including an
    //      arbitrary `unit.id % 5 === 0` "equipment crew" check with no
    //      relation to actual siegeRole) and maintaining its OWN separate
    //      "reserve line" standing spot at wallY + 450. That block has been
    //      deleted outright — see the BUGFIX comment left in its place in
    //      siegeEngineLogic.js. Two systems independently overwriting the
    //      same unit.target every few ticks is what produced the
    //      approach → get pulled away → return loop.
    // None of that exists anymore. Every unit this function receives gets a
    // real, permanent-until-it-dies-or-completes assignment: ranged shooter,
    // ram pusher, or ladder crew (active or queued). Nothing here ever sends
    // a unit back toward the camp or holds it out of the fight.
    // ========================================================================

    let ladderBound = [];    // everyone: melee infantry, specialists, cavalry, AND ranged shooters
    let artilleryCrews = [];

    let trebCount = (siegeEquipment.trebuchets) ? siegeEquipment.trebuchets.length : 0;

    // 1. Categorize: artillery crew first (unchanged); everyone else — ranged
    // included, see BUGFIX below — goes into ladderBound. Cavalry gets no
    // special case either: a mounted unit is just as much "everyone else" as
    // a spearman or an archer, and joins the ladder queue like anyone else.
    units.forEach(u => {
        let textCheck = String((u.stats?.name || "") + " " + (u.unitType || "") + " " + (u.stats?.role || "")).toLowerCase();

        if (u.siegeRole === "treb_crew" || u.siegeRole === "trebuchet_crew" || textCheck.includes("crew")) {
            artilleryCrews.push(u);
            return;
        }

        // BUGFIX (ranged units vibrating/spinning near the gate): ranged
        // shooters used to be pulled out here and given a static
        // "ranged_support" firing-line role (hold position at
        // wallBoundaryY + 90, near the gate). That role sat inside the
        // same "near the gate" radius as the EXTREME RANDOMNESS panic-
        // shuffle in ai_categories.js's _handleMovement — any ranged unit
        // that held still long enough to trip that stuck-detector got hit
        // with a repeating chaotic velocity kick every tick, which reads
        // as exactly the "hesitant left-right, ends up spinning" behavior
        // being reported. Per request, ranged units are no longer split
        // into a separate holding role at all — they fold into
        // ladderBound below and get a real ladder assignment (crew or
        // queued) like every other unit, so they walk to a ladder instead
        // of parking near the gate.
        ladderBound.push(u);
    });

    // --- FIX: Assign Artillery Crews (unchanged) ---
    if (trebCount > 0) {
        artilleryCrews.forEach((u, index) => {
            u.hasOrders = true;
            u.orderType = "siege_assault";
            u.siegeRole = "trebuchet_crew";
            u.siegeTarget = siegeEquipment.trebuchets[index % trebCount];
        });
    } else {
        // No trebuchets deployed — artillery crew units still need
        // something to do rather than sitting idle; fold them into the
        // ladder queue like anyone else.
        ladderBound.push(...artilleryCrews);
    }

    // 2. Ranged shooters no longer get a separate holding role — see the
    // BUGFIX comment above. They're already inside ladderBound and get
    // assigned exactly like everyone else in the pass below.

    // 3. Everyone: ram pushers first (capped), then ladder crew,
    // evenly distributed across all available ladders with a real queue
    // position — see the "LADDER CREW QUEUE" section in siegeEngineLogic.js
    // (crewAssigned array, crew cap) for how queuePos is consumed to hold
    // a unit waiting in line rather than swarming the ladder base.
    //
    // RAM CREW CAP: 5 per ram — mirrors the physical crew cap in
    // siegeEngineLogic.js. Only 5 can ever count as crew per ram, so the
    // rest go to ladders where the manpower is actually useful.
    const RAM_CREW_CAP = 5;
    const maxRamPushers = siegeEquipment.rams.length * RAM_CREW_CAP;

    // LADDER CREW CAP: how many units can be actively assigned to a single
    // ladder (carrying/climbing) before additional units queue instead of
    // piling onto the same ladder. Matches the cap already used in
    // siegeEngineLogic.js's crewAssigned tracking.
    const LADDER_CREW_CAP = 2;
    const ladderCount = siegeEquipment.ladders.length;

    let ramIndex = 0;
    let ladderAssignCounts = new Array(ladderCount).fill(0);

    ladderBound.forEach((u, index) => {
        u.hasOrders = true;
        u.orderType = "siege_assault";
        // Real assignment incoming — clear the cached "no role yet" waypoint
        // from the default-case fallback above, so it doesn't linger as
        // stale state on a unit that's now been given a proper ram/ladder
        // target.
        u._noRoleWaypointX = undefined;
        u._noRoleWaypointY = undefined;

        if (siegeEquipment.rams.length > 0 && index < maxRamPushers) {
            u.siegeRole = "ram_pusher";
            u.siegeTarget = siegeEquipment.rams[ramIndex % siegeEquipment.rams.length];
            u.queuePos = index;
            ramIndex++;
            return;
        }

        if (ladderCount > 0) {
            // Round-robin assign to whichever ladder currently has the
            // fewest units already assigned to it, so crews spread evenly
            // across all available ladders instead of stacking one ladder
            // deep while others sit empty.
            let targetLadderIdx = 0;
            let fewest = Infinity;
            for (let i = 0; i < ladderCount; i++) {
                if (ladderAssignCounts[i] < fewest) {
                    fewest = ladderAssignCounts[i];
                    targetLadderIdx = i;
                }
            }
            u.siegeRole = "ladder_carrier";
            u.siegeTarget = siegeEquipment.ladders[targetLadderIdx];
            // queuePos beyond LADDER_CREW_CAP tells processTacticalOrders'
            // ladder_carrier case (battlefield_commands.js) to hold this
            // unit at a waiting spot near the ladder instead of walking
            // straight to the (already occupied) climb point — see the
            // queue-position handling there.
            u.queuePos = ladderAssignCounts[targetLadderIdx];
            ladderAssignCounts[targetLadderIdx]++;
            return;
        }

        // No rams and no ladders exist at all yet (e.g. very start of the
        // battle before equipment has spawned). Nothing to assign to —
        // leave hasOrders/orderType set so the unit isn't picked up as
        // "uncommanded" and frozen, but give it no siegeRole/siegeTarget.
        // processTacticalOrders' siege_assault handler already has a plain
        // "walk toward the wall" fallback for a unit with no valid
        // siegeTarget (see the ram_pusher/ladder_carrier "target died,
        // fall back" cases) which will pick this unit up the moment
        // equipment becomes available and this function reassigns it.
        u.siegeRole = null;
        u.siegeTarget = null;
    });

    if (typeof AudioManager !== 'undefined') AudioManager.playSound('charge');
}
// ============================================================================
// RTS MOUSE CONTROLS (SELECTION & MOVEMENT) - TOTAL WAR STYLE
// ============================================================================

let isBoxSelecting = false;
let selectionBoxStart = { x: 0, y: 0 };
let selectionBoxScreenStart = { x: 0, y: 0 };
// Live rotation offset (radians) applied to the drag line while blue arrows
// are on screen — adjusted via the J/K keys (see the keydown handler below)
// and reset every time a new drag starts. Only ever non-zero mid-drag; the
// mouseup handler bakes it into the final endpoint it hands to
// executeBoxFormationMove, so nothing downstream needs to know it exists.
let _dragRotationOffset = 0;
// Last screen-space mouse position seen during the current drag, so J/K can
// redraw the preview immediately without waiting for the mouse to move.
let _lastDragScreenPos = { x: 0, y: 0 };
let lastClickTime = 0;

// --- BULLETPROOF COORDINATE MAPPER ---
function getBattleMousePos(e) {
    const canvas = document.querySelector('canvas'); 
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let rawX = (e.clientX - rect.left) * (canvas.width / rect.width);
    let rawY = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    let currentZoom = typeof zoom !== 'undefined' ? zoom : 1;
    let camX = typeof player !== 'undefined' ? player.x : 0;
    let camY = typeof player !== 'undefined' ? player.y : 0;

    let worldX = ((rawX - (canvas.width / 2)) / currentZoom) + camX;
    let worldY = ((rawY - (canvas.height / 2)) / currentZoom) + camY;
    return { x: worldX, y: worldY };
}

function isCommanderAlive() {
    return battleEnvironment.units.some(u => u.isCommander && u.hp > 0);
}

// --- DESKTOP VISUAL OVERLAYS: rectangle (box-select) + line+arrow (formation drag) ---
function getDesktopBoxEl() {
    let el = document.getElementById('desktop-selbox');
    if (!el) {
        el = document.createElement('div');
        el.id = 'desktop-selbox';
        el.style.position = 'fixed';
        el.style.pointerEvents = 'none';
        el.style.zIndex = 9590;
        el.style.display = 'none';
        document.body.appendChild(el);
    }
    return el;
}

// SURGERY: Total War-style per-unit arrow grid, replacing both the old
// rectangle AND the single line+arrowhead. One small blue arrow per
// selected unit, arranged in the same row/col grid calculateFormationOffsets'
// "dragGrid" case will actually commit to on mouseup — the preview never
// lies about where units will end up. Rendered as a fixed SVG overlay in
// SCREEN space (decoupled from camera/zoom) so it stays simple; only the
// real commit converts through getBattleMousePos into world space.
function getDesktopFormationLineEl() {
    let el = document.getElementById('desktop-formline');
    if (!el) {
        el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        el.id = 'desktop-formline';
        el.style.position = 'fixed';
        el.style.left = '0';
        el.style.top = '0';
        el.style.width = '100vw';
        el.style.height = '100vh';
        el.style.pointerEvents = 'none';
        el.style.zIndex = 9591;
        el.style.display = 'none';
        document.body.appendChild(el);
    }
    return el;
}

// Pure geometry, no unit objects needed — mirrors the row/col/spacing math
// calculateFormationOffsets' "dragGrid" case uses on assignBlock, so the
// preview always matches the real commit exactly. count = how many arrows
// to draw (one per selected unit); (sx,sy)->(ex,ey) is the drag in
// whichever space the caller wants (desktop passes screen px).
function computeDragGridSlots(count, startX, startY, endX, endY, depth) {
    const dx = endX - startX, dy = endY - startY;
    const dragLen = Math.hypot(dx, dy);
    let angle = 0;
    if (dragLen > 5) angle = Math.atan2(dx, -dy);
    const anchor = { x: (startX + endX) / 2, y: (startY + endY) / 2 };

    const N = Math.max(1, count);
    const rows = Math.max(1, Math.min(Math.round(depth) || 2, N));
    const cols = Math.ceil(N / rows);
    const spacingX = cols > 1 ? Math.max(20, dragLen / (cols - 1)) : 0;
    const spacingY = Math.max(28, spacingX || 32);

    const applyRotation = (x, y) => {
        if (angle === 0) return { x: x, y: y };
        return {
            x: x * Math.cos(angle) - y * Math.sin(angle),
            y: x * Math.sin(angle) + y * Math.cos(angle)
        };
    };

    const slots = [];
    for (let i = 0; i < N; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const unitsInThisRow = Math.min(N - (r * cols), cols);
        const rawX = (c - (unitsInThisRow - 1) / 2) * spacingX;
        const rawY = r * spacingY;
        const rot = applyRotation(rawX, rawY);
        slots.push({ x: anchor.x + rot.x, y: anchor.y + rot.y });
    }
    return { slots: slots, angle: angle, anchor: anchor };
}

// Reads which formation shape (if any) the current selection has "memory"
// of — the exact same rule executeBoxFormationMove uses to decide whether
// to redraw a preserved shape or fall back to the plain drag grid. Shared
// by the preview code below AND executeBoxFormationMove itself (see its
// call further down) so the two can never drift out of sync the way the
// old battle-loading-screen.js box-clamp patch drifted from this file's
// own coordinate convention.
function _getSharedDragFormationStyle(units) {
    let sharedStyle = units[0] ? units[0].assignedFormationStyle : null;
    for (let i = 1; i < units.length; i++) {
        if (units[i].assignedFormationStyle !== sharedStyle) { sharedStyle = null; break; }
    }
    const preservableStyles = ["square", "circle", "tight", "standard", "loose", "line"];
    return (sharedStyle && preservableStyles.indexOf(sharedStyle) !== -1) ? sharedStyle : "dragGrid";
}

// Rotates (px,py) around (ox,oy) by angle radians. Used to bake the live
// J/K rotation offset into a drag's endpoint before computing/committing a
// formation, so nothing downstream needs its own rotation concept.
function _rotatePointAround(px, py, ox, oy, angle) {
    if (!angle) return { x: px, y: py };
    const dx = px - ox, dy = py - oy;
    return {
        x: ox + dx * Math.cos(angle) - dy * Math.sin(angle),
        y: oy + dx * Math.sin(angle) + dy * Math.cos(angle)
    };
}

// Concentric-ring circle preview — same basic idea as
// calculateFormationOffsets' real "circle" case (units spaced evenly
// around a ring, arrows pointing straight outward), generalized to
// `depth` rings instead of that case's hardcoded inner/outer split, since
// this is preview-only and doesn't need to replicate its role-based
// inner/outer-ring logic. Returns LOCAL offsets (ring center = 0,0) with
// an outward-facing unit normal per slot — the caller adds the drag's own
// anchor point. Deliberately ignores drag angle/rotation entirely, same as
// the real case ("since it's a circle, we don't apply mapAngle rotation
// here... North of the ring is always North of the map") — so J/K
// rotation is correctly a no-op here, matching what actually happens on
// commit.
function computeCircleRingSlots(count, depth) {
    const N = Math.max(1, count);
    const rings = Math.max(1, Math.min(Math.round(depth) || 1, N));
    const base = Math.floor(N / rings);
    let remainder = N - base * rings;
    const ringCounts = [];
    for (let r = 0; r < rings; r++) { ringCounts.push(base + (r < remainder ? 1 : 0)); }

    const RING_GAP = 26;
    const baseRadius = Math.max(40, (ringCounts[0] || 1) * 9);
    const slots = [];
    for (let r = 0; r < rings; r++) {
        const radius = baseRadius + r * RING_GAP;
        const rc = ringCounts[r];
        if (rc <= 0) continue;
        for (let i = 0; i < rc; i++) {
            const ang = (i / rc) * Math.PI * 2;
            const nx = Math.cos(ang), ny = Math.sin(ang);
            slots.push({ x: nx * radius, y: ny * radius, fx: nx, fy: ny });
        }
    }
    return slots;
}

// Hollow-square-perimeter preview — same "depth = concentric rings" idea
// as the circle above, walking a square's edge instead. Each arrow's
// facing is perpendicular to whichever side it's standing on, pointing
// away from the square's center. Also deliberately rotation-invariant,
// matching the real "square" case (its own SIMPLIFIED BLOB math never
// applies mapAngle either — see calculateFormationOffsets).
function computeSquareRingSlots(count, depth) {
    const N = Math.max(1, count);
    const rings = Math.max(1, Math.min(Math.round(depth) || 1, N));
    const base = Math.floor(N / rings);
    let remainder = N - base * rings;
    const ringCounts = [];
    for (let r = 0; r < rings; r++) { ringCounts.push(base + (r < remainder ? 1 : 0)); }

    const RING_GAP = 26;
    const baseHalf = Math.max(35, (ringCounts[0] || 1) * 7);
    const slots = [];
    for (let r = 0; r < rings; r++) {
        const half = baseHalf + r * RING_GAP;
        const rc = ringCounts[r];
        if (rc <= 0) continue;
        const perimeter = half * 8; // 4 sides of length 2*half
        for (let i = 0; i < rc; i++) {
            const d = (i / rc) * perimeter;
            slots.push(_squarePerimeterPoint(d, half));
        }
    }
    return slots;
}

// Walks clockwise from the top-left corner: top edge (L→R), right edge
// (T→B), bottom edge (R→L), left edge (B→T). Returns the point AND the
// outward-facing unit normal for whichever edge it landed on.
function _squarePerimeterPoint(d, half) {
    const side = half * 2;
    if (d < side) return { x: -half + d, y: -half, fx: 0, fy: -1 };
    d -= side;
    if (d < side) return { x: half, y: -half + d, fx: 1, fy: 0 };
    d -= side;
    if (d < side) return { x: half - d, y: half, fx: 0, fy: 1 };
    d -= side;
    return { x: -half, y: half - d, fx: -1, fy: 0 };
}

// TIGHT/STANDARD/LOOSE preview — fixed real-formation-scale spacing that
// deliberately IGNORES the depth toggle and drag length entirely,
// mirroring the real tight/standard/line cases in calculateFormationOffsets
// (all three use a constant spacingX/Y and a fixed maxCols regardless of
// how far the player dragged OR what the depth toggle is set to — Depth
// has no effect on any of the three real cases, which is why the button is
// hidden whenever one of these three is the active formation; see
// RTSControls.js's depth-visibility check). `maxCols` mirrors each real
// case's own column cap (tight/standard approximate their 5 role-banded
// sub-blocks as one uniform block — close enough to preview "this will be
// noticeably denser/looser" without duplicating the whole role-sorting
// engine; line/loose is a flat unsorted list in both the real case and
// here, so this is an EXACT match for that one, not an approximation).
function _computeFixedSpacingPreviewSlots(count, sx, sy, ex, ey, spacingX, spacingY, maxCols) {
    const dx = ex - sx, dy = ey - sy;
    let angle = 0;
    if (Math.hypot(dx, dy) > 5) angle = Math.atan2(dx, -dy);
    const anchor = { x: (sx + ex) / 2, y: (sy + ey) / 2 };
    const N = Math.max(1, count);
    const cols = Math.max(1, Math.min(maxCols, N));
    const fx = Math.sin(angle), fy = -Math.cos(angle);
    const slots = [];
    for (let i = 0; i < N; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const unitsInThisRow = Math.min(N - (r * cols), cols);
        const rawX = (c - (unitsInThisRow - 1) / 2) * spacingX;
        const rawY = r * spacingY;
        let rx = rawX, ry = rawY;
        if (angle !== 0) {
            rx = rawX * Math.cos(angle) - rawY * Math.sin(angle);
            ry = rawX * Math.sin(angle) + rawY * Math.cos(angle);
        }
        slots.push({ x: anchor.x + rx, y: anchor.y + ry, fx: fx, fy: fy });
    }
    return { slots: slots, angle: angle, anchor: anchor };
}

// SHARED preview geometry — the single source of truth for what the blue
// arrows look like, branched by the selection's remembered formation style
// (see _getSharedDragFormationStyle above). Both the desktop preview
// (renderFormationArrowPreview, right below) and the mobile touch preview
// (RTSControls.js's _move handler) call this exact function so the two
// platforms can never show different shapes for the same drag — same
// principle as computeDragGridSlots already followed for the plain
// default case, just extended to the other rememberable shapes.
// Coordinates are in whatever space the caller passes (screen px for both
// current callers). `depth` (window._mc3FormationDepth) is ONLY meaningful
// for the final default/"dragGrid" fallback below — none of the five named
// styles (tight/standard/line/circle/square) read it in the real
// calculateFormationOffsets, so none of them read it here either; circle/
// square instead derive a sensible ring count from unit count alone
// (the real case's exact cavalry-ratio nuance needs actual unit role data
// this preview doesn't have — close enough for a preview), and
// tight/standard/line use a fixed column cap instead (see
// _computeFixedSpacingPreviewSlots above).
function computeFormationPreviewSlots(count, sx, sy, ex, ey, depth, style) {
    if (style === "circle" || style === "square") {
        const anchor = { x: (sx + ex) / 2, y: (sy + ey) / 2 };
        const rings = count > 12 ? 2 : 1;
        const local = (style === "circle")
            ? computeCircleRingSlots(count, rings)
            : computeSquareRingSlots(count, rings);
        return {
            slots: local.map(p => ({ x: anchor.x + p.x, y: anchor.y + p.y, fx: p.fx, fy: p.fy })),
            angle: 0,
            anchor: anchor
        };
    }
    if (style === "tight" || style === "standard" || style === "line") {
        const SPACING = {
            tight:    { x: 16, y: 18, maxCols: 30 },
            standard: { x: 36, y: 30, maxCols: 20 },
            line:     { x: 60, y: 48, maxCols: 40 } // "Loose" in the UI
        }[style];
        return _computeFixedSpacingPreviewSlots(count, sx, sy, ex, ey,
            SPACING.x, SPACING.y, SPACING.maxCols);
    }
    // default / "dragGrid" (no shared style) — the ONLY case that actually
    // reads the depth toggle, unchanged original math via the existing
    // helper, so the plain default case's shape/spacing never changed.
    const grid = computeDragGridSlots(count, sx, sy, ex, ey, depth);
    const fx = Math.sin(grid.angle), fy = -Math.cos(grid.angle);
    return {
        slots: grid.slots.map(s => ({ x: s.x, y: s.y, fx: fx, fy: fy })),
        angle: grid.angle,
        anchor: grid.anchor
    };
}

// Rebuilds the per-unit arrow grid preview. Blue, always — never reuses
// the gold/yellow box-select color. `style` (optional) selects among the
// five preview shapes via computeFormationPreviewSlots — omitted/unknown
// falls through to the original plain drag grid.
function renderFormationArrowPreview(unitCount, sx, sy, ex, ey, depth, style) {
    const el = getDesktopFormationLineEl();
    const grid = computeFormationPreviewSlots(unitCount, sx, sy, ex, ey, depth, style);
    const ARROW_HALF_LEN = 9; // screen px
    let html = '<defs><marker id="mc3-arrowhead" markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto">' +
        '<path d="M0,0 L8,4 L0,8 L2.5,4 Z" fill="rgba(66,135,245,0.95)"/></marker></defs>';
    grid.slots.forEach(s => {
        const x1 = s.x - s.fx * ARROW_HALF_LEN, y1 = s.y - s.fy * ARROW_HALF_LEN;
        const x2 = s.x + s.fx * ARROW_HALF_LEN, y2 = s.y + s.fy * ARROW_HALF_LEN;
        html += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" ' +
            'stroke="rgba(66,135,245,0.9)" stroke-width="2.5" stroke-linecap="round" ' +
            'marker-end="url(#mc3-arrowhead)" />';
    });
    el.innerHTML = html;
    el.style.display = 'block';
}

// --- MOUSE DOWN (Start Box) ---
document.addEventListener('mousedown', (e) => {
    if (!inBattleMode || !battleEnvironment) return;
    if (e.target.tagName !== 'CANVAS') return; 
    if (!isCommanderAlive()) return;

    if (e.button === 0) { 
        isBoxSelecting = true;
        selectionBoxStart = getBattleMousePos(e);
        selectionBoxScreenStart = { x: e.clientX, y: e.clientY };
        _dragRotationOffset = 0;
        _lastDragScreenPos = { x: e.clientX, y: e.clientY };
    }
});

// --- MOUSE MOVE (Draw Arrow Grid or Box) ---
// NOTE: the unit-hover stats tooltip that used to live here (mc3-unit-hover-
// tip) has been removed — it duplicated menu/unit-hover-tooltip.js, which is
// now the ONE hover panel for the whole game (spacebar or the RTS hover-
// toggle button activates it; see that file for the full explanation).
document.addEventListener('mousemove', (e) => {
    if (!inBattleMode || !isBoxSelecting) return;
    
    _lastDragScreenPos = { x: e.clientX, y: e.clientY };
    const dragDist = Math.hypot(e.clientX - selectionBoxScreenStart.x, e.clientY - selectionBoxScreenStart.y);
    if (dragDist > 10) {
        const selectedUnitsForPreview = battleEnvironment.units.filter(u => u.side === "player" && !u.isCommander && u.hp > 0 && u.selected);
        const selectedCount = selectedUnitsForPreview.length;

        if (selectedCount > 0) {
            // FORMATION DRAG: one small blue arrow per selected unit,
            // arranged in the exact grid/shape executeBoxFormationMove will
            // commit to on mouseup — count units, not just draw one line.
            // Style comes from the selection's own formation memory (see
            // _getSharedDragFormationStyle) so a remembered circle/square/
            // tight/standard shape previews correctly instead of always
            // showing the plain default grid. The endpoint is rotated by
            // any live J/K offset before anything downstream sees it.
            getDesktopBoxEl().style.display = 'none';
            const depth = (typeof window._mc3FormationDepth === 'number') ? window._mc3FormationDepth : 2;
            const style = _getSharedDragFormationStyle(selectedUnitsForPreview);
            const rotEnd = _rotatePointAround(e.clientX, e.clientY, selectionBoxScreenStart.x, selectionBoxScreenStart.y, _dragRotationOffset);
            renderFormationArrowPreview(selectedCount, selectionBoxScreenStart.x, selectionBoxScreenStart.y, rotEnd.x, rotEnd.y, depth, style);
        } else {
            // BOX-SELECT: unchanged rectangle for selecting units on the map.
            getDesktopFormationLineEl().style.display = 'none';
            const boxEl = getDesktopBoxEl();
            boxEl.style.border = '2px dashed rgba(245,215,110,0.82)'; // Gold = Select
            boxEl.style.background = 'rgba(245,215,110,0.06)';
            boxEl.style.boxShadow = 'inset 0 0 10px rgba(245,215,110,0.08)';
            boxEl.style.display = 'block';
            boxEl.style.left = Math.min(e.clientX, selectionBoxScreenStart.x) + 'px';
            boxEl.style.top = Math.min(e.clientY, selectionBoxScreenStart.y) + 'px';
            boxEl.style.width = Math.abs(e.clientX - selectionBoxScreenStart.x) + 'px';
            boxEl.style.height = Math.abs(e.clientY - selectionBoxScreenStart.y) + 'px';
        }
    }
});

// --- MOUSE UP (Process Actions) ---
document.addEventListener('mouseup', (e) => {
    const boxEl = getDesktopBoxEl();
    boxEl.style.display = 'none';
    getDesktopFormationLineEl().style.display = 'none';

    if (!inBattleMode || !battleEnvironment || !isBoxSelecting) {
        isBoxSelecting = false;
        return;
    }
    
    isBoxSelecting = false;
    if (!isCommanderAlive()) return;

    const pos = getBattleMousePos(e);
    const playerUnits = battleEnvironment.units.filter(u => u.side === "player" && !u.isCommander && u.hp > 0);
    
    const dx = pos.x - selectionBoxStart.x;
    const dy = pos.y - selectionBoxStart.y;
    const dragDistance = Math.hypot(dx, dy);

    // DRAG BOX LOGIC
    if (dragDistance > 10) { 
        const minX = Math.min(selectionBoxStart.x, pos.x);
        const maxX = Math.max(selectionBoxStart.x, pos.x);
        const minY = Math.min(selectionBoxStart.y, pos.y);
        const maxY = Math.max(selectionBoxStart.y, pos.y);

        const selectedUnits = playerUnits.filter(u => u.selected);

        if (selectedUnits.length > 0) {
            // ACTION: FORMATION LINE — drag defines facing angle + width;
            // depth (rows) is derived from unit count, not drag height.
            // Bake in any live J/K rotation offset before committing, so
            // executeBoxFormationMove sees exactly the (rotated) line the
            // preview was already showing.
            const rotatedEnd = _rotatePointAround(pos.x, pos.y, selectionBoxStart.x, selectionBoxStart.y, _dragRotationOffset);
            (window.executeBoxFormationMove || executeBoxFormationMove)(
                selectedUnits, selectionBoxStart.x, selectionBoxStart.y, rotatedEnd.x, rotatedEnd.y
            );
        } else {
            // ACTION: SELECT UNITS IN RECTANGLE
            playerUnits.forEach(u => {
                const willBeSelected = (u.x >= minX && u.x <= maxX && u.y >= minY && u.y <= maxY && canSelectUnitNow(u));
                // Same per-unit override as the 1-5 handler: units entering
                // the box become manual immediately; units leaving a prior
                // selection are handed back to the autopilot.
                if (u.selected && !willBeSelected) lazyReleaseManualControl(u);
                if (willBeSelected && !u.selected) lazyTakeManualControl([u]);
                u.selected = willBeSelected;
            });
        }
        
        currentSelectionGroup = null; 
        if (typeof AudioManager !== 'undefined') AudioManager.playSound('ui_click');
    } 
    // SINGLE CLICK LOGIC (Double click to multi-select is permanently removed)
    else {
        let clickedUnit = null;
        let closestDist = Infinity;
        
        playerUnits.forEach(u => {
            if (!canSelectUnitNow(u)) return;
            let hitbox = (u.stats.radius || 10) + 20;
            let d = Math.hypot(u.x - pos.x, u.y - pos.y);
            if (d < hitbox && d < closestDist) {
                closestDist = d;
                clickedUnit = u;
            }
        });

        if (clickedUnit) {
            playerUnits.forEach(u => { u.selected = false; lazyReleaseManualControl(u); });
            clickedUnit.selected = true;
            lazyTakeManualControl([clickedUnit]); // selection alone opts this unit out of the autopilot
            if (typeof AudioManager !== 'undefined') AudioManager.playSound('ui_click');
        } else {
            playerUnits.forEach(u => { u.selected = false; lazyReleaseManualControl(u); });
        }
        
        currentSelectionGroup = null;
    }
});

// --- DRAG-LINE FORMATION MATHEMATICS (Total War style) ---
// Replaces the old fixed rectangle: the player drags a LINE, not a box.
// The line's angle sets which way the formation faces; its length sets how
// wide the front row spreads. Depth (rows) is derived from unit count inside
// calculateFormationOffsets' assignVariedLine, not from a second dragged
// dimension — there is no "box height" anymore, only how far you dragged.

// PRE-DEPLOY DESTINATION CLIP — direction-preserving.
// First attempt at the pre-deploy out-of-zone bug independently clamped
// destX/destY (Math.max/min per axis). That stops the unit ending up
// outside the zone, but it does NOT preserve the direction of travel:
// clamping each axis separately effectively drags the destination toward
// whichever zone CORNER is nearest, which can point a unit in a visibly
// different direction than the arrow actually drawn (reported: "before
// commence they might end up running different direction than the blue
// arrow"). What the player actually wants is the unit walking the exact
// line they drew and simply stopping if that line would leave the zone.
// So instead: walk the ray from the unit's OWN current position toward
// the raw (unclamped) destination, and stop exactly at the point where
// that ray exits the deploy-zone rectangle (or at the destination itself,
// if it's already inside). Standard parametric box-exit test — since the
// unit's current x/y is always inside the zone during pre-deploy (the
// per-frame PRE-DEPLOY POSITION CLAMP in battlefield_logic.js guarantees
// that), we only need the smallest exit fraction t in [0,1], not a full
// segment/box intersection.
function _clipDestToZoneAlongRay(ux, uy, tx, ty, z) {
    const dx = tx - ux, dy = ty - uy;
    let t = 1;
    if (dx > 0)      t = Math.min(t, (z.maxX - ux) / dx);
    else if (dx < 0) t = Math.min(t, (z.minX - ux) / dx);
    if (dy > 0)      t = Math.min(t, (z.maxY - uy) / dy);
    else if (dy < 0) t = Math.min(t, (z.minY - uy) / dy);
    t = Math.max(0, t);
    return { x: ux + dx * t, y: uy + dy * t };
}

window.executeBoxFormationMove = function executeBoxFormationMove(units, startX, startY, endX, endY) {
    if (!units || units.length === 0) return;

    lazyTakeManualControl(units);

    // Disable any previously-assigned AI tactic (brain-emoji hold/skirm/
    // charge/shield/adapt) AND any stale combat target for these units. The
    // player is issuing a direct manual order right now — that must fully
    // supersede a stale tactic/target, not just out-rank it temporarily
    // while _formationLocked is active below (that lock already stops
    // ai_categories.js's own processAction from acting on either one, but
    // it doesn't erase them — see the matching _formationLocked guard added
    // to processTacticalOrders()/processTargeting() so nothing else acts on
    // them either). Bridges into RTSControls.js's Cmd exactly like the
    // existing _mc3RevertRobotOnCommand() bridge does elsewhere in this
    // file; no-ops harmlessly if that file hasn't booted yet.
    if (window.MobileControls && window.MobileControls.Cmd &&
        typeof window.MobileControls.Cmd._clearAiTacticSilent === 'function') {
        window.MobileControls.Cmd._clearAiTacticSilent(units);
    }
    units.forEach(u => { u.target = null; });

    const dx = endX - startX;
    const dy = endY - startY;
    const dragLength = Math.max(30, Math.hypot(dx, dy));
    // Anchor the formation at the midpoint of the drawn line, not just the
    // drop point — this keeps the shape centered under where the player
    // actually dragged, the same way Total War's line anchors on the drag.
    const anchor = { x: (startX + endX) / 2, y: (startY + endY) / 2 };

    // Facing angle: same convention as calculateFormationOffsets'
    // enemy-facing math (0 = facing "up"/negative-Y). A drag of near-zero
    // length has no meaningful direction — treat it as "no override" so
    // calculateFormationOffsets falls back to its own enemy-facing logic.
    let dragAngle = null;
    if (Math.hypot(dx, dy) > 5) {
        dragAngle = Math.atan2(dx, -dy);
    }

    // FORMATION MEMORY: if every selected unit already shares the same
    // assigned GEOMETRIC shape (square/circle/tight/standard/loose), redraw
    // that same shape relative to the new drag instead of resetting to a
    // plain grid. Units with no assigned style yet, or a selection with
    // mixed styles, fall through to the new ignore-type/ignore-size grid —
    // "now ignore unit type and size, every arrow merely represents one
    // unit" — see calculateFormationOffsets' "dragGrid" case.
    const styleToUse = _getSharedDragFormationStyle(units);

    calculateFormationOffsets(units, styleToUse, anchor, dragAngle, dragLength);

    units.forEach(u => {
        u.hasOrders = true;
        u.orderType = "move_to_point";
        u.reactionDelay = Math.floor(Math.random() * 15) + 2;
        u.formationTimer = 200;
        u.assignedFormationStyle = styleToUse;
        // FORMATION-LOCK: ignore this unit's own AI (including "stop to
        // shoot" for ranged units) until it physically reaches this
        // waypoint — see the top of ai_categories.js's processAction.
        // Clears itself on arrival; Cmd.stop()/cancelAiTactic()/any AI
        // tactic assignment in RTSControls.js also clears it explicitly
        // if the player interrupts the march early.
        u._formationLocked = true;

        let rawDestX = anchor.x + (u.formationOffsetX || 0);
        let rawDestY = anchor.y + (u.formationOffsetY || 0);

        // PRE-DEPLOY CLAMP: same underlying bug the Shield formation tactic
        // was already fixed for (RTSControls.js's Cmd._clampToDeployZone —
        // "chance some units can exit out of the deployment zone"). This
        // plain Total-War-style drag-line command (the blue arrow) never
        // got the same treatment, so a drag toward/past the zone edge
        // during pre-deployment set orderTargetPoint OUTSIDE
        // window.__playerDeployZone. The unit is still _formationLocked
        // (see ai_categories.js processAction), so it walks straight at
        // that far point every frame — but battlefield_logic.js's own
        // PRE-DEPLOY POSITION CLAMP forces the unit's x/y back inside the
        // zone every single frame. The two fight forever: during
        // deployment the unit pins itself against the zone edge nearest
        // the arrow and never arrives. Then the instant COMMENCE clears
        // window.__preDeploymentActive, the position clamp stops fighting
        // it and the unit resumes walking the entire remaining distance to
        // that original (uncapped, often enemy-ward) point in one
        // uninterrupted march — which is what read as units "charging
        // straight up" the moment battle commences.
        //
        // Uses _clipDestToZoneAlongRay (defined above) rather than a plain
        // per-axis Math.max/min clamp: clamping X and Y independently
        // effectively yanks the destination toward whichever zone CORNER
        // is nearest, which can point the unit in a visibly different
        // direction than the arrow actually drawn. Clipping along the ray
        // from the unit's own current position keeps it walking the exact
        // line the player drew, just stopping it at the zone edge instead
        // of the full distance. Naval decks are skipped, matching
        // Cmd._clampToDeployZone.
        if (typeof window !== 'undefined' && window.__preDeploymentActive &&
            window.__playerDeployZone && window.__playerDeployZone.type !== 'naval') {
            const _clipped = _clipDestToZoneAlongRay(u.x, u.y, rawDestX, rawDestY, window.__playerDeployZone);
            rawDestX = _clipped.x;
            rawDestY = _clipped.y;
        }

// Use the safety wrapper if it exists, otherwise raw coords
        if (typeof getSafeMapCoordinates === 'function') {
            u.orderTargetPoint = getSafeMapCoordinates(rawDestX, rawDestY);
        } else {
            u.orderTargetPoint = { x: rawDestX, y: rawDestY };
        }
		
    });
}
// ============================================================================
// UNIVERSAL MAP BOUNDARY CLAMP ENGINE (THE RED LINE)
// ============================================================================
function getSafeMapCoordinates(targetX, targetY, margin = 50) {
    // Fallbacks in case city variables or normal variables are missing
    const maxWidth = typeof BATTLE_WORLD_WIDTH !== 'undefined' ? BATTLE_WORLD_WIDTH : 2400;
    const maxHeight = typeof BATTLE_WORLD_HEIGHT !== 'undefined' ? BATTLE_WORLD_HEIGHT : 1600;

    let safeX = targetX;
    let safeY = targetY;

    // Clamp X (Prevents walking past the Left and Right Red Lines)
    if (safeX < margin) safeX = margin;
    if (safeX > maxWidth - margin) safeX = maxWidth - margin;

    // Clamp Y (Prevents walking past the Top and Bottom Red Lines)
    if (safeY < margin) safeY = margin;
    if (safeY > maxHeight - margin) safeY = maxHeight - margin;

    return { x: safeX, y: safeY };
}

// --- FORMATION MATH (CENTROID & ROTATION ENGINE) ---
function calculateFormationOffsets(units, style, centerPoint, angleOverride, lineWidth) {
    if (!units || units.length === 0) return;

    // 1. Establish Map Dimensions & Center Data
    const mapWidth = typeof BATTLE_WORLD_WIDTH !== 'undefined' ? BATTLE_WORLD_WIDTH : 2400;
    const cp = centerPoint || { x: mapWidth / 2, y: (typeof BATTLE_WORLD_HEIGHT !== 'undefined' ? BATTLE_WORLD_HEIGHT : 1600) / 2 };

    // 2. FACE-THE-ENEMY ANGLE (replaces the old map-position heuristic)
    // ------------------------------------------------------------------
    // FIX: this used to derive the line's diagonal tilt purely from the
    // selection's X position on the map (distance from map-center), on the
    // old assumption that the player always starts south and the enemy is
    // always due north — so "rotate toward map center" was a stand-in for
    // "rotate to face the enemy." Spawn sides are randomized now, so that
    // assumption no longer holds: a line formation needs to actually face
    // wherever the enemy currently is, not wherever "north" used to mean.
    //
    // Row depth in assignBlock (its startY/rawY axis) was built around the
    // convention "more negative Y = further toward the enemy" (shields get
    // the most-negative startY, cavalry the most-positive, i.e. furthest
    // back). mapAngle=0 always meant "facing due north" in that convention.
    // So: find the live enemy centroid, compute the real-world angle from
    // the selection's centroid (cp) to it, and rotate so that direction
    // maps to "local negative Y" — the same slot the old due-north
    // assumption used to fill. If no enemy can be found (e.g. none left,
    // or called before battleEnvironment exists), fall back to the old
    // map-position heuristic rather than defaulting to a fixed direction.
    let mapAngle = 0;
    let facingResolved = false;
    // EXPLICIT ANGLE OVERRIDE: when the player has drawn a direction by hand
    // (the Total War-style drag-line), that drawn direction always wins over
    // both enemy-auto-facing and the old map-position fallback below — the
    // player pointed the arrow somewhere on purpose, honor it exactly.
    if (typeof angleOverride === 'number' && !isNaN(angleOverride)) {
        mapAngle = angleOverride;
        facingResolved = true;
    }
    if (!facingResolved && typeof battleEnvironment !== 'undefined' && battleEnvironment && Array.isArray(battleEnvironment.units)) {
        const enemyUnits = battleEnvironment.units.filter(u => u && u.side === "enemy" && u.hp > 0);
        if (enemyUnits.length > 0) {
            const ec = lazyCentroid(enemyUnits);
            const dx = ec.x - cp.x, dy = ec.y - cp.y;
            if (Math.hypot(dx, dy) > 1) {
                // atan2 measured from "straight up" (negative Y = 0 rad),
                // matching the old mapAngle=0-means-due-north convention.
                mapAngle = Math.atan2(dx, -dy);
                facingResolved = true;
            }
        }
    }
    if (!facingResolved) {
        // FALLBACK: no live enemy centroid available — keep the old
        // map-position-derived tilt so formations still get SOME sensible
        // diagonal near map edges instead of always defaulting to flat.
        let distFromCenterX = cp.x - (mapWidth / 2);
        let normalizedDist = distFromCenterX / (mapWidth / 2); // Ranges from -1 (Left) to 1 (Right)
        mapAngle = -(Math.pow(normalizedDist, 3)) * 1.13;
    }

    // Disable diagonal rotation for circle (rotationally symmetric — angle is
    // meaningless) and for square UNLESS the caller passed an explicit
    // angleOverride (the drag line can rotate a square to face the drawn
    // direction; keyboard/button square stays flat exactly as before).
    const hasExplicitAngle = (typeof angleOverride === 'number' && !isNaN(angleOverride));
    if (style === "circle" && !hasExplicitAngle) {
        mapAngle = 0;
    }
    if (style === "square" && !hasExplicitAngle) {
        mapAngle = 0;
    }

    // Stamp the fully-resolved facing angle onto every unit passed in —
    // consumed by ai_categories.js's _formationLocked arrival handler to
    // snap a Total War-style drag-waypoint unit's final rendered facing to
    // match this formation's actual orientation once it arrives, instead
    // of whatever direction its last approach step happened to leave it
    // facing. Uses the exact same 0-rad-is-"up" convention as
    // renderFormationArrowPreview's fx/fy math, so the arrival pose matches
    // the blue preview arrow shown during the drag itself.
    units.forEach(u => { u._formationFacingAngle = mapAngle; });

    // Helper: Rotates coordinates around a 0,0 center based on the map angle
    const applyRotation = (x, y) => {
        if (mapAngle === 0) return { x: x, y: y }; // Bypass math entirely for flat lines & squares
        return {
            x: x * Math.cos(mapAngle) - y * Math.sin(mapAngle),
            y: x * Math.sin(mapAngle) + y * Math.cos(mapAngle)
        };
    };

    // 3. Sort Units into Tactical Groups
    let shields = [], infantry = [], ranged = [], gunpowder = [], cavalry = [], largeUnits = [];

    units.forEach(u => {
        let role = getTacticalRole(u);
        let isLarge = u.stats && u.stats.isLarge; 
        
        // Group large mounts and beasts for specialized concentric rings
        if (role === "CAVALRY" || isLarge) largeUnits.push(u); 

        if (role === "CAVALRY") cavalry.push(u);
        else if (role === "GUNPOWDER") gunpowder.push(u);
        else if (role === "RANGED") ranged.push(u);
        else if (role === "SHIELD") shields.push(u);
        else infantry.push(u);
    });

    // --- FORMATION GENERATORS ---
    const assignBlock = (group, startY, spacingX, spacingY, maxCols) => {
        let rows = Math.ceil(group.length / maxCols);
        group.forEach((u, i) => {
            let r = Math.floor(i / maxCols);
            let c = i % maxCols;
            
            // Auto-center the row mathematically based on unit count
            let unitsInThisRow = Math.min(group.length - (r * maxCols), maxCols);
            let rawX = (c - (unitsInThisRow - 1) / 2) * spacingX;
            let rawY = startY + (r * spacingY);
            


            // Apply angular diagonal rotation
            let rotated = applyRotation(rawX, rawY);
            u.formationOffsetX = rotated.x;
            u.formationOffsetY = rotated.y;
        });
    };

    const assignRing = (group, radius) => {
        group.forEach((u, i) => {
            // Pure geometric circle math - ignores mapWidth/mapAngle entirely
            let angle = (i / group.length) * Math.PI * 2;
           u.formationOffsetX = Math.cos(angle) * radius + (Math.random() - 0.5) * 2;
           u.formationOffsetY = Math.sin(angle) * radius + (Math.random() - 0.5) * 2;
            
            // Logic check: Since it's a circle, we don't apply the 'mapAngle' rotation here.
            // This ensures the "North" of the circle is always the "North" of the map.
        });
    };

    // VARIED LINE: the drag-to-form default. Cavalry anchors both flanks,
    // shields/infantry hold the front-center, ranged/gunpowder stack in rows
    // behind them. The dragged line's length sets how WIDE the front row
    // spreads; depth (how many rows deep) falls out of unit count divided by
    // that width — so a short drag with many units packs deep, a long drag
    // with few units stays a thin, wide line, matching how far the player
    // physically dragged their finger/mouse.
    const assignVariedLine = (lineWidth) => {
        const frontLine = [...shields, ...infantry];
        const backLine  = [...ranged, ...gunpowder];
        const spacingX = 32, spacingY = 34;

        // Columns implied by the drawn line's length, clamped so a tiny drag
        // doesn't force everyone into one degenerate column and a huge drag
        // doesn't spread a 4-unit selection across an absurd empty gap.
        let targetRowWidth = Math.max(1, Math.round((lineWidth || 0) / spacingX));
        const minCols = Math.max(2, Math.round(Math.sqrt(Math.max(1, frontLine.length))));
        const maxCols = Math.max(minCols, frontLine.length || 1);
        targetRowWidth = Math.min(maxCols, Math.max(minCols, targetRowWidth));

        assignBlock(frontLine, 0, spacingX, spacingY, targetRowWidth);
        // Back row(s) sit further from the enemy (positive local Y, per the
        // "more negative Y = toward the enemy" convention used everywhere
        // else in this function) and are narrower — skirmishers bunch in
        // rather than matching the melee line's full width.
        const backRowWidth = Math.max(2, Math.round(targetRowWidth * 0.85));
        const frontDepthRows = Math.ceil(frontLine.length / targetRowWidth) || 1;
        assignBlock(backLine, frontDepthRows * spacingY, spacingX, spacingY, backRowWidth);

        // Flanks: cavalry splits evenly left/right and sits just past the
        // front line's own width so it visibly wraps the melee line's ends
        // rather than forming its own separate row.
        const halfWidth = ((Math.min(targetRowWidth, frontLine.length || 1) - 1) / 2) * spacingX;
        const flankX = halfWidth + spacingX * 1.5;
        const half = Math.ceil(cavalry.length / 2);
        cavalry.forEach((u, i) => {
            const onLeft = i < half;
            const sideIndex = onLeft ? i : i - half;
            const rawX = (onLeft ? -1 : 1) * (flankX + sideIndex * spacingX);
            const rawY = -spacingY * 0.4 + Math.floor(sideIndex / 4) * spacingY;
            let rotated = applyRotation(rawX, rawY);
            u.formationOffsetX = rotated.x;
            u.formationOffsetY = rotated.y;
        });
    };

// --- GEOMETRY STYLES ---
    // SURGERY: Ratio-based override for large mounted groups
    const cavalryRatio = largeUnits.length / units.length;
    const forceUnifiedShape = (cavalryRatio > 0.40);

    // FIX ("rank depth is NOT working... depths should correspond to the
    // blue arrow depth... trying to match the closest equivalent" — direct
    // request): TIGHT/STANDARD/LOOSE used to hardcode maxCols per role-group
    // (e.g. tight's shields always capped at 30-wide), completely ignoring
    // window._mc3FormationDepth — the DEPTH button visibly did nothing for
    // these three shapes, only for a plain unnamed drag. assignBlock's own
    // row math (rows = Math.ceil(group.length / maxCols)) is invertible:
    // given a group size and a WANTED row count, solve back for the maxCols
    // that produces it. Math.ceil (not round/floor) on both the forward and
    // inverse formula is what makes this hit the closest achievable depth
    // rather than either always-undershooting or always-overshooting — e.g.
    // 5 units at a requested depth of 4 can't split into exactly 4 full
    // rows, but ceil-based solving lands on 3 (2/2/1), the nearest shape
    // actually reachable, instead of silently falling back to some other
    // count. depthCols(n, oldMaxCols) caps at the style's own original
    // maxCols as an upper bound, so an extreme depth request (e.g. DEPTH 1
    // on a 40-unit group) can't blow past how wide that formation's spacing
    // was tuned to look — it'll go as shallow as 1 row allows within that
    // width limit, not spread into a single absurd 40-wide line.
    const _reqDepth = (typeof window._mc3FormationDepth === 'number' && window._mc3FormationDepth >= 1)
        ? window._mc3FormationDepth : 2;
    const depthCols = (n, oldMaxCols) => {
        if (n <= 0) return oldMaxCols;
        return Math.min(oldMaxCols, Math.max(1, Math.ceil(n / _reqDepth)));
    };

    switch (style) {
        case "tight": 
            assignBlock(shields, -40, 16, 16, depthCols(shields.length, 30)); 
            assignBlock(infantry, -20, 16, 16, depthCols(infantry.length, 30));
            assignBlock(ranged, 0, 16, 16, depthCols(ranged.length, 30));
            assignBlock(gunpowder, 20, 18, 16, depthCols(gunpowder.length, 15)); 
            assignBlock(cavalry, 60, 20, 20, depthCols(cavalry.length, 40));                  
            break;

        case "standard":
            assignBlock([...shields, ...infantry], -30, 40, 30, depthCols(shields.length + infantry.length, 20));
            assignBlock(ranged, -60, 40, 30, depthCols(ranged.length, 20));
            assignBlock(gunpowder, 0, 40, 30, depthCols(gunpowder.length, 15));
            assignBlock(cavalry, 40, 50, 40, depthCols(cavalry.length, 10)); 
            break;

        case "variedLine":
            assignVariedLine(lineWidth);
            break;

        case "line":
            // LOOSE (UI-facing name — see RTSControls.js's formation tray).
            // Internal style key stays "line" so drag-formation memory
            // (assignedFormationStyle) round-trips unchanged; only the
            // button's label/emoji changed. Widened from the old fixed
            // 35/30 spacing to 60/48 specifically so Loose reads as
            // CLEARLY more spread out than Standard's ~40/30 — the old
            // numbers were actually tighter than Standard, which would
            // have broken the required Tight < Standard < Loose ordering
            // if left alone under the new name.
            let lineGroup = [...shields, ...infantry, ...ranged, ...gunpowder, ...cavalry];
            assignBlock(lineGroup, 0, 60, 48, depthCols(lineGroup.length, 40)); 
            break;
            
        case "circle":
            // SURGERY: If cavalry ratio > 40%, ignore roles and form one big circle
            if (forceUnifiedShape) {
                assignRing(units, Math.max(70, units.length * 5));
            } else {
                let nonLarge = [...shields, ...infantry, ...ranged, ...gunpowder];
                if (units.length <= 12) {
                    largeUnits.forEach(u => {
                        u.formationOffsetX = (Math.random() - 0.5) * 15;
                        u.formationOffsetY = (Math.random() - 0.5) * 15;
                    });
                    assignRing(nonLarge, Math.max(50, units.length * 8));
                } else {
                    let innerRadius = Math.max(60, nonLarge.length * 3.5);
                    assignRing(nonLarge, innerRadius);
                    if (largeUnits.length > 0) {
                        let outerRadius = innerRadius + 60 + (largeUnits.length * 1.5);
                        assignRing(largeUnits, outerRadius);
                    }
                }
            }
            break;
case "square":
            // SURGERY: Simplified Blob. No sorting or extra arrays.
            const sideSize = Math.ceil(Math.sqrt(units.length));
            const spacing =30; // Personal spacing
            
            units.forEach((u, i) => {
                const col = i % sideSize;
                const row = Math.floor(i / sideSize);
                
                // Center the blob and add high jitter (20) for the "blob" look
                u.formationOffsetX = (col - sideSize / 2) * spacing + (Math.random() - 0.5) * 20;
                u.formationOffsetY = (row - sideSize / 2) * spacing + (Math.random() - 0.5) * 20;
            });
            break;

        case "loose":
            // LOOSE — used by AI TACTIC: HOLD when the enemy is
            // ranged-heavy (see RTSControls.js's _pickHoldFormationStyle).
            // Deliberately no role structure and no tight packing: units
            // scatter uniformly across a disc around the centroid so one
            // volley/AoE can't collapse the whole group the way a tight
            // circle/square/line would. Still holds in place once formed —
            // this only changes the SHAPE, not the never-advance discipline.
            const looseRadius = Math.max(70, units.length * 12);
            units.forEach(u => {
                const ang = Math.random() * Math.PI * 2;
                const r = Math.sqrt(Math.random()) * looseRadius; // uniform-in-disc, not radius-biased
                u.formationOffsetX = Math.cos(ang) * r;
                u.formationOffsetY = Math.sin(ang) * r;
            });
            break;

        case "dragGrid":
            // TOTAL WAR STYLE DRAG DEFAULT — "ignore unit type and size,
            // every arrow merely represents one unit." No role sorting at
            // all: assignBlock runs directly on the full, unsorted units
            // array. Depth (rows) is the RTSControls formation-depth toggle
            // (window._mc3FormationDepth, cycled 1/2/3/4, default 2 —
            // "generally aim for 2-3 lines unless barely any units are
            // selected," which the row-count clamp below covers since rows
            // can never exceed unit count). Width comes directly from how
            // far the player dragged (lineWidth, world px) — "based on how
            // wide u drag."
            {
                const depthToggle = (typeof window !== 'undefined' && typeof window._mc3FormationDepth === 'number')
                    ? window._mc3FormationDepth : 2;
                const dgRows = Math.max(1, Math.min(Math.round(depthToggle) || 2, units.length));
                const dgCols = Math.ceil(units.length / dgRows);
                const dgSpacingX = dgCols > 1 ? Math.max(20, (lineWidth || 0) / (dgCols - 1)) : 0;
                const dgSpacingY = Math.max(28, dgSpacingX || 32);
                assignBlock(units, 0, dgSpacingX, dgSpacingY, dgCols);
            }
            break;
    }
}

function applyFormationAdjustment() {
    if (typeof inBattleMode === 'undefined' || !inBattleMode || !battleEnvironment || !battleEnvironment.units) return;

    // SURGERY: Filter for all selected units in this formation, 
    // even if they have already arrived (u.hasOrders is now preserved).
    let adjustingUnits = battleEnvironment.units.filter(u =>
        u.side === "player" &&
        u.selected &&
        u.hp > 0 &&
        u.orderType === "move_to_point" &&
        u.orderTargetPoint
    );

    if (adjustingUnits.length <= 1) return; 

    // Enemy check (Strictly preserved)
    let inDanger = false;
    let emergencyThreshold = 150; 
    for (let u of adjustingUnits) {
        let nearestDist = Infinity;
        battleEnvironment.units.forEach(other => {
            if (other.side !== u.side && other.hp > 0 && !other.isDummy) {
                let dist = Math.hypot(u.x - other.x, u.y - other.y);
                if (dist < nearestDist) nearestDist = dist;
            }
        });
        if (nearestDist < emergencyThreshold) {
            inDanger = true;
            break; 
        }
    }
    if (inDanger) return; 

    // BOUNDARY SHIFT: Calculate stable bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    adjustingUnits.forEach(u => {
        if (u.orderTargetPoint.x < minX) minX = u.orderTargetPoint.x;
        if (u.orderTargetPoint.x > maxX) maxX = u.orderTargetPoint.x;
        if (u.orderTargetPoint.y < minY) minY = u.orderTargetPoint.y;
        if (u.orderTargetPoint.y > maxY) maxY = u.orderTargetPoint.y;
    });

    const maxWidth = typeof BATTLE_WORLD_WIDTH !== 'undefined' ? BATTLE_WORLD_WIDTH : 2400;
    const maxHeight = typeof BATTLE_WORLD_HEIGHT !== 'undefined' ? BATTLE_WORLD_HEIGHT : 1600;
    const margin = 60; 

    let shiftX = 0;
    let shiftY = 0;
    if (minX < margin) shiftX = margin - minX; 
    if (maxX > maxWidth - margin) shiftX = (maxWidth - margin) - maxX; 
    if (minY < margin) shiftY = margin - minY; 
    if (maxY > maxHeight - margin) shiftY = (maxHeight - margin) - maxY; 

    // Apply the shift only if the whole formation is out of bounds
    if (shiftX !== 0 || shiftY !== 0) {
        adjustingUnits.forEach(u => {
            // --- PROTECT SIEGE LOGIC ---
            if (u.siegeRole === "ladder_fanatic") return; 
            
            if (u.siegeRole === "counter_battery" && u.orderType === "attack") {
                // Ignore shift to keep sniping
            } else {
                 u.orderType = "move_to_point"; // Use engine-standard string
                 
                 let rawDestX = u.orderTargetPoint.x + shiftX;
                 let rawDestY = u.orderTargetPoint.y + shiftY;
                 
                 if (typeof getSafeMapCoordinates === 'function') {
                     u.orderTargetPoint = getSafeMapCoordinates(rawDestX, rawDestY);
                 } else {
                     u.orderTargetPoint = {x: rawDestX, y: rawDestY};
                 }
            }
        });
    }
}

function isRangedType(unit) {
    if (!unit || !unit.stats) return false;
    const r = unit.stats.role;
   // SURGERY: Remove Firelances, Bombs, and Javelins from the "Ranged Stand-by" list
// This prevents them from clumping in the back line.
return ["archer", "horse_archer", "crossbow", "gunner", "mounted_gunner", "Rocket"].includes(r);
}

// ============================================================================
// --- SURGERY 4: SIEGE EQUIPMENT HELPER ---
// ============================================================================
// BUGFIX ("ladder climbers get stuck / can't climb"): this file used to
// declare its OWN canUseSiegeEngines(unit) here — a plain top-level
// `function` declaration, exactly like the one in ai_categories.js. Two
// files each declaring a global function with the identical name is a
// silent collision: whichever <script> tag loads second simply overwrites
// the other in the global scope, so every call site in BOTH files ends up
// running whatever definition happened to load last, regardless of which
// file it's textually written in. That's non-deterministic from the
// codebase's point of view (it depends purely on page load order) and the
// two versions disagree in real ways:
//   - ai_categories.js's version additionally allows ranged/specialist units
//     to use siege equipment when they've been explicitly given a siege
//     role (ram_pusher/ladder_carrier/ladder_fanatic/trebuchet_crew), and
//     always allows firelance/bomb/javelin specialists.
//   - This file's old version was a blunt stub: cavalry/large is blocked,
//     everyone else allowed — no siegeRole awareness at all.
// ai_categories.js's climb-entry gate (isOnLadderTile detection in
// _handleMovement) calls canUseSiegeEngines(unit) before it will ever flip
// isClimbing on. If this file's stub happened to be the one that won the
// load-order race, any unit whose role that stub misjudges (or that relied
// on the siegeRole-based exceptions the stub didn't know about) would fail
// that check, silently skip the entire climb-entry branch, and just stand
// at the ladder base forever — no error, no animation, just stuck.
// FIX: the duplicate declaration is deleted outright. ai_categories.js's
// canUseSiegeEngines is a plain top-level function, so it is already
// globally callable from this file (and everywhere else) with no import
// needed — there is now exactly one implementation in the whole codebase,
// so there is nothing left for load order to race.
// REQUIRES: ai_categories.js must be loaded on the page (it already is,
// for all the other AI logic this file depends on).

function isCavalryUnit(unit) {
    if (!unit || !unit.stats) return false;
    // Exception: Always allow selection of the General
    if (unit.isCommander || unit.unitType === "General") return false;

    const txt = String(unit.unitType + " " + (unit.stats.role || "")).toLowerCase();
    const cavRegex = /(cav|cavalry|keshig|horse|lancer|mount|camel|eleph|knight)/;
    return cavRegex.test(txt);
}