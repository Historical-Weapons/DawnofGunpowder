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
    dx /= dist; dy /= dist;

    const ts = (typeof BATTLE_TILE_SIZE !== 'undefined') ? BATTLE_TILE_SIZE : 8;
    const lookX = unit.x + dx * ts * 1.5;
    const lookY = unit.y + dy * ts * 1.5;

    if (lazyIsWallTile(lookX, lookY)) {
        let gateX = typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelX : unit.x;
        let gateY = typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelY : unit.y;
        let distToGate = Math.hypot(unit.x - gateX, unit.y - gateY);

        if (distToGate > 60) {
            // Can't get past this wall from here — head back to the gate first.
            return { x: gateX + (Math.random() - 0.5) * 40, y: gateY, hp: 9999, isDummy: true, priority: "wall_recover_gate" };
        }
        // Back at the gate — resume heading north into the city so this
        // doesn't just orbit the gate forever once wall-recovery kicks in.
        return { x: gateX + (Math.random() - 0.5) * 60, y: gateY - 100, hp: 9999, isDummy: true, priority: "wall_recover_north" };
    }

    if (lazyIsBuildingTile(lookX, lookY)) {
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
function lazyRestoreSpeed(u) {
    if (u._lazyOrigSpeed !== undefined && u.stats) { u.stats.speed = u._lazyOrigSpeed; delete u._lazyOrigSpeed; }
    // SURGERY: autoAttack.js's smart-target speed adjustments (and the new
    // siege pace boost) use a differently-named backup (origSmartSpeed), so
    // a unit scaled through that system wasn't being reverted here at all —
    // meaning selecting it manually left it stuck at whatever autoAttack.js
    // last set. Cross-check both, same reasoning as restoreSpeeds() in
    // autoAttack.js checking this file's property.
    if (u.origSmartSpeed !== undefined && u.stats) { u.stats.speed = u.origSmartSpeed; delete u.origSmartSpeed; }
}
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
            const ammoLeft = Math.max(u.ammo || 0, u.stats?.ammo || 0);
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
            const ammoLeft = Math.max(u.ammo || 0, u.stats?.ammo || 0);
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
    if (!lazyIsAllowedBattle()) return; // Siege / naval never run this AI

    if (lazyGeneralTickInterval) clearInterval(lazyGeneralTickInterval);

    lazyGeneralFormingTicks   = 0;
    lazyGeneralSkirmishTicks  = 0;
    lazyGeneralStrategyTick   = 0;
    lazyGeneralCrisisActive   = false;
    lazyGeneralDoctrine       = 'COMBINED_ARMS';
    lazyGeneralFormationShape = 'LINE';
    lazyGeneralPersonality    = lazyPickPersonality();
    lazyGeneralPersonalityMod = LAZY_PERSONALITIES[lazyGeneralPersonality] || LAZY_PERSONALITIES.BALANCED;
    lazyGeneralIsRiverCached  = lazyIsRiverBattle();
    lazyGeneralPhase          = lazyGeneralIsRiverCached ? 'RIVER_ADVANCING' : 'FORMING';

    if (typeof battleEnvironment !== 'undefined' && battleEnvironment && battleEnvironment.units) {
        battleEnvironment.units.forEach(u => {
            if (u.side === "player" && !u.isCommander) {
                u._lazyManual = false;
                delete u._lazyOrigSpeed;
                delete u._lazyKiteSign;
                delete u._lazyEscortFor;
            }
        });
    }

    lazyGeneralTickInterval = setInterval(lazyGeneralTick, LAZY_TICK_MS);
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
function lazyReleaseManualControl(unit) {
    if (unit) unit._lazyManual = false;
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
    const playerUnits = battleEnvironment.units.filter(u => u.side === "player" && !u.isCommander && !u.disableAICombat && u.hp > 0);
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
    // Z, X, C, V, B: FORMATIONS (ANCHORED TO GENERAL)
    // =========================
    if (["z", "x", "v", "c", "b"].includes(key)) {
        
        if (selectedUnits.length <= 1) return;

        lazyTakeManualControl(selectedUnits);
        _mc3RevertRobotOnCommand(); // real formation command — robot reverts to manual

        if (key === "z") currentFormationStyle = "tight";  
        if (key === "x") currentFormationStyle = "standard";  
        if (key === "v") currentFormationStyle = "line";   
        if (key === "c") currentFormationStyle = "circle"; 
        if (key === "b") currentFormationStyle = "square"; 
        
        // SURGERY: Anchor the offsets to the General instead of a static map centroid
        calculateFormationOffsets(selectedUnits, currentFormationStyle, commander);

        // SURGERY: Automatically apply the "Follow" command (Mirroring 'F')
        selectedUnits.forEach(u => {
            u.hasOrders = true;
            u.orderType = "follow"; 
            u.orderTargetPoint = null; 
            u.formationTimer = 240; 
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
                // Define the raw target
                let targetX = u.x;
                let targetY = BATTLE_WORLD_HEIGHT - 50 - stagger;

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
        let emergencyThreshold = 100;
		const isStrictCommand = unit.hasOrders && ["retreat", "follow", "move_to_point"].includes(unit.orderType);

        // SURGERY: same exemption shape as stillEnRouteToSiegeEquipment further
        // down this function — a unit actively committed to reaching a live
        // ram/ladder/trebuchet must not get hijacked into fighting whichever
        // defender happens to be within 100px. This IS the "very difficult to
        // climb" bug: defenders stand on/near the wall right where the ladders
        // are, so this check fired on nearly every approach, swapped the
        // dummy target for a real enemy reference, and processAction's
        // siege-movement call site requires target.isDummy — a real enemy
        // target fails that check, so the unit falls into ordinary combat
        // instead of ever reaching the ladder tile. Deliberately NOT using
        // disableAICombat here (that's the ladder_fanatic pattern) — that
        // flag makes this whole function bail on the unit before it ever
        // reaches the switch-case below that actually sets their destination.
        const committedToSiegeCharge =
            (unit.siegeRole === "ram_pusher" || unit.siegeRole === "ladder_carrier" ||
             unit.siegeRole === "trebuchet_crew") &&
            unit.siegeTarget && unit.siegeTarget.hp > 0 && !unit.onWall;

        // ====================================================================
        // SURVIVAL OVERRIDE: 100px Emergency Self-Defense
        // ====================================================================
        if (nearestDist < emergencyThreshold && nearestEnemy && !isStrictCommand && !unit.disableAICombat && !committedToSiegeCharge) {
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

                // SMART TARGET SELECTION among everyone within aggro range — was
                // "lock onto whoever is physically nearest". A holding archer
                // with three targets in range should still prefer the wounded
                // or isolated one, not just the closest. See pickSmartCombatTarget().
                const holdTarget = pickSmartCombatTarget(unit, battleEnvironment.units, aggroLimit);
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
                // SMART TARGET SELECTION — was a flat `unit.target = nearestEnemy`
                // (pure distance). See pickSmartCombatTarget() above.
                const smartTarget = pickSmartCombatTarget(unit, battleEnvironment.units);
                const chosenTarget = smartTarget || nearestEnemy; // naval, or nothing scored — fall back to nearest
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

                // Ensure we catch the global breach flag too
                let gateBreached = window.__SIEGE_GATE_BREACHED__ || (southGate && (southGate.gateHP <= 0 || southGate.isOpen));
				
				// ---> SURGERY: MANDATORY PLAZA RUSH OVERRIDE (2-STAGE FUNNEL) <---
                if (gateBreached && unit.siegeRole !== "ladder_fanatic") {
                    unit.siegeRole = "assault_complete";

                    let gateX = typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelX : 1200;
                    let gateY = typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelY : 2000;

                    // Check if unit has crossed the gate threshold into the city
                    let isInsideCity = unit.y < gateY + 20;

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
                        if (unit.siegeRole === "cavalry_reserve" && unit.y > wallBoundaryY && southGate) {
                            unit.target = { x: southGate.x * BATTLE_TILE_SIZE, y: southGate.y * BATTLE_TILE_SIZE - 50, isDummy: true };
                        }
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
                            unit.siegeRole = "infantry_reserve"; 
                        }
                        break;

                   case "ladder_carrier":
                        if (unit.siegeTarget && unit.siegeTarget.hp > 0) {
                            if (!unit.siegeTarget.isDeployed) {
                                // SURGERY: Total swarm logic. No queues, no orderly lines.
                                destX = unit.siegeTarget.x + (Math.random() - 0.5) * 60;
                                destY = unit.siegeTarget.y + (Math.random() - 0.5) * 50;
                            } else {
                                destX = unit.siegeTarget.x;
                                destY = unit.siegeTarget.y - 10;
                            }
                        } else {
                            unit.siegeRole = "infantry_reserve";
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

						case "infantry_reserve":
                        // If siegebattle.js pushed them forward to funnel, respect it!
                        if (unit.target && unit.target.isDummy && unit.target.y < wallBoundaryY + 200) {
                            destX = unit.target.x;
                            destY = unit.target.y;
                        } else {
                            // SURGERY: this used to beeline for a fixed point near the
                            // wall every single frame, which reads as a slow, steady
                            // forward creep even though these units have no real order
                            // yet. Give them a small randomized idle wander instead,
                            // refreshed every ~2-4s around a stable anchor (their first
                            // resting spot), so they hold position and look alive
                            // without marching toward the wall until reassigned.
                            const nowT = Date.now();
                            if (!unit._reserveWanderUntil || nowT > unit._reserveWanderUntil) {
                                if (typeof unit._reserveWanderAnchorX !== 'number') {
                                    unit._reserveWanderAnchorX = unit.x;
                                    unit._reserveWanderAnchorY = unit.y;
                                }
                                unit._reserveWanderX = unit._reserveWanderAnchorX + (Math.random() - 0.5) * 100;
                                unit._reserveWanderY = unit._reserveWanderAnchorY + (Math.random() - 0.5) * 100;
                                unit._reserveWanderUntil = nowT + 2000 + Math.random() * 2000;
                            }
                            destX = unit._reserveWanderX;
                            destY = unit._reserveWanderY;
                        }
                        break;

					case "cavalry_reserve":
                        // BUGFIX: this case never actually checked gateBreached, so
                        // cavalry staged behind camp had no live path toward the gate
                        // once it opened — the only "head to gate" code lived in the
                        // pre-breach intercept above, gated on unit.y > wallBoundaryY,
                        // which cavalry resting 500px behind camp never satisfies.
                        // Fixed here: once the gate is open, cavalry advance through it.
                        if (gateBreached && southGate) {
                            let gateDestX = (typeof SiegeTopography !== 'undefined')
                                ? SiegeTopography.gatePixelX : southGate.x * BATTLE_TILE_SIZE;
                            let gateDestY = (typeof SiegeTopography !== 'undefined')
                                ? SiegeTopography.gatePixelY : southGate.y * BATTLE_TILE_SIZE;
                            destX = gateDestX + (Math.random() - 0.5) * 80;
                            destY = gateDestY + 40; // just south of the gate, ready to pour through
                            break;
                        }

                        let destX2 = unit.x;
                        // FIX: Ensure they are staging behind the camp, not just the wall boundary
                        let safeCampY = typeof SiegeTopography !== 'undefined' ? SiegeTopography.campPixelY : wallBoundaryY + 300;
                        let destY2 = safeCampY + 500;

                        // Check if already at destination
                        if (Math.hypot(unit.x - destX2, unit.y - destY2) < 5) {
                            unit.hasOrders = false;       
                            unit.orderType = null;        
                            unit.target = null;           
                            unit.state = "idle";          
                        }
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

function isSiegeGateBreached() {

    // If not a siege, always allow
    if (typeof inSiegeBattle === "undefined" || !inSiegeBattle) {
        return true;
    }

    // FIX: prefer the live battle gate (see note on the identical pattern in
    // processTacticalOrders above) — overheadCityGates alone is a stale,
    // disconnected copy in Custom Siege Battle.
    let southGate = (typeof battleEnvironment !== 'undefined' && battleEnvironment.cityGates && battleEnvironment.cityGates.length > 0)
        ? battleEnvironment.cityGates.find(g => g.side === "south")
        : (typeof overheadCityGates !== "undefined" ? overheadCityGates.find(g => g.side === "south") : null);

    return (
        window.__SIEGE_GATE_BREACHED__ === true ||
        (southGate && (southGate.isOpen || southGate.gateHP <= 0))
    );
}

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
    const gateBreached = window.__SIEGE_GATE_BREACHED__;

    // --- FIX 1: Initialize ALL required arrays and variables ---
    let meleeInfantry = [];
    let gunpowder = [];
    let archers = [];
    let cavalry = [];
    let artilleryCrews = []; 
    
    let trebCount = (siegeEquipment.trebuchets) ? siegeEquipment.trebuchets.length : 0;

    // 1. Categorize Troops (REVISED)
    units.forEach(u => {
        let role = getTacticalRole(u);
        let textCheck = String((u.stats?.name || "") + " " + (u.unitType || "") + " " + (u.stats?.role || "")).toLowerCase();
        
        // PRIORITY 1: Identify Artillery Crews first so they aren't drafted as infantry
        if (u.siegeRole === "treb_crew" || u.siegeRole === "trebuchet_crew" || textCheck.includes("crew")) {
            artilleryCrews.push(u);
            return;
        }

        // PRIORITY 2: Is it a beast/horse? Sort them to Cavalry immediately.
        if (role === "CAVALRY" || u.stats?.isLarge || textCheck.match(/(cav|horse|mount|camel|lancer|eleph|keshig)/)) {
            cavalry.push(u);
            
            // If gate isn't broken, make them stay put unless ordered
            if (!gateBreached && !u.hasOrders) {
                u.state = "idle";
                u.target = null;
            }
            return; 
        } 
// PRIORITY 3: Sort remaining humans
        let isSpecialist = textCheck.match(/(firelance|bomb|javelin|repeater)/);

        if (role === "GUNPOWDER" && !isSpecialist) {
            gunpowder.push(u);
        } else if (role === "RANGED" && !isSpecialist) {
            archers.push(u);
        } else {
            meleeInfantry.push(u); // Specialists go to the meatgrinder!
        }
    });

    // 2. MEATGRINDER DRAFT: Only pull from ranged if melee is critical (< 20)
    //
    // REVISED: archers (non-gunpowder ranged) now keep a protected floor —
    // a small percentage always stays on the walls shooting instead of being
    // fully drafted into the ladder/ram meatgrinder. Gunpowder units are
    // drafted first when troops are needed, since the "stay ranged" ask was
    // specifically about non-gunpowder ranged (archers/crossbow).
    const ARCHER_RANGED_RESERVE_PCT = 0.20; // ~20% of archers always stay ranged_support
    if (meleeInfantry.length < 20) {
        let neededTroops = 60 - meleeInfantry.length;

        // Draft gunpowder first — they're not the group we're protecting.
        let draftedGunners = gunpowder.splice(0, neededTroops);
        let stillNeeded = Math.max(0, neededTroops - draftedGunners.length);

        // Only draft archers down to their protected reserve floor, even if
        // more troops are "needed" — the reserve takes priority over hitting
        // the 60-troop meatgrinder target exactly.
        let archerReserveFloor = Math.ceil(archers.length * ARCHER_RANGED_RESERVE_PCT);
        let archerDraftable = Math.max(0, archers.length - archerReserveFloor);
        let draftedArchers = archers.splice(0, Math.min(stillNeeded, archerDraftable));

        meleeInfantry.push(...draftedGunners, ...draftedArchers);
    }

    // 3. Assign Orders
    let ramIndex = 0;
    let ladderIndex = 0;

    // RAM CREW CAP: 5 per ram — this is the top limit for the whole player
    // siege attacker AI (mirrors the physical crew cap in siegeEngineLogic.js).
    // Used to be a flat 25 regardless of ram count, which massively over-
    // assigned ram_pusher: only 5 can ever count as crew, so the other ~20
    // just stood around the ram with nothing to do. The freed-up slots now
    // go to ladders instead, which is exactly where that manpower is useful.
    const RAM_CREW_CAP = 5;
    const maxRamPushers = siegeEquipment.rams.length * RAM_CREW_CAP;

    // Distribute Melee Infantry to Rams & Ladders
    meleeInfantry.forEach((u, index) => {
        u.hasOrders = true;
        u.orderType = "siege_assault";
        u.siegeRole = "infantry_reserve";
        
        if (siegeEquipment.rams.length > 0 && index < maxRamPushers) { 
            u.siegeRole = "ram_pusher";
            u.siegeTarget = siegeEquipment.rams[ramIndex % siegeEquipment.rams.length];
            u.queuePos = index; 
            ramIndex++;
        } 
        else if (siegeEquipment.ladders.length > 0) {
            u.siegeRole = "ladder_carrier";
            u.siegeTarget = siegeEquipment.ladders[ladderIndex % siegeEquipment.ladders.length];
            u.queuePos = index - maxRamPushers;
            ladderIndex++;
        }
    });

    // --- FIX 2: Assign Artillery Crews (Safely uses trebCount) ---
    if (trebCount > 0) {
        artilleryCrews.forEach((u, index) => {
            u.hasOrders = true;
            u.orderType = "siege_assault";
            u.siegeRole = "trebuchet_crew";
            u.siegeTarget = siegeEquipment.trebuchets[index % trebCount];
        });
    }

    // Distribute remaining Ranged as Support
    [...gunpowder, ...archers].forEach(u => {
        u.hasOrders = true;
        u.orderType = "siege_assault";
        u.siegeRole = "ranged_support";
    });

// Distribute Cavalry (Rear Guard)
    // FIX: same live-gate preference as processTacticalOrders/isSiegeGateBreached above.
    let southGate = (typeof battleEnvironment !== 'undefined' && battleEnvironment.cityGates && battleEnvironment.cityGates.length > 0)
        ? battleEnvironment.cityGates.find(g => g.side === "south")
        : (typeof overheadCityGates !== 'undefined' ? overheadCityGates.find(g => g.side === "south") : null);
    let campY = typeof SiegeTopography !== 'undefined' ? SiegeTopography.campPixelY : (BATTLE_WORLD_HEIGHT - 500); // <-- ADD THIS
    cavalry.forEach(u => {
        u.hasOrders = true;
        u.orderType = "siege_assault";
        u.siegeRole = "cavalry_reserve";
        if (southGate) {
            // FIX: Point them 500px behind the camp, not the wall
            u.orderTargetPoint = { x: southGate.x * BATTLE_TILE_SIZE, y: campY + 500 }; 
        }
    });

    if (typeof AudioManager !== 'undefined') AudioManager.playSound('charge');
}
// ============================================================================
// RTS MOUSE CONTROLS (SELECTION & MOVEMENT) - TOTAL WAR STYLE
// ============================================================================

let isBoxSelecting = false;
let selectionBoxStart = { x: 0, y: 0 };
let selectionBoxScreenStart = { x: 0, y: 0 };
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

// --- DESKTOP VISUAL BOX OVERLAY ---
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

// --- MOUSE DOWN (Start Box) ---
document.addEventListener('mousedown', (e) => {
    if (!inBattleMode || !battleEnvironment) return;
    if (e.target.tagName !== 'CANVAS') return; 
    if (!isCommanderAlive()) return;

    if (e.button === 0) { 
        isBoxSelecting = true;
        selectionBoxStart = getBattleMousePos(e);
        selectionBoxScreenStart = { x: e.clientX, y: e.clientY };
    }
});

// --- MOUSE MOVE (Draw Box) ---
document.addEventListener('mousemove', (e) => {
    if (!inBattleMode || !isBoxSelecting) return;
    
    const dragDist = Math.hypot(e.clientX - selectionBoxScreenStart.x, e.clientY - selectionBoxScreenStart.y);
    if (dragDist > 10) {
        const boxEl = getDesktopBoxEl();
        const hasSelection = battleEnvironment.units.some(u => u.side === "player" && !u.isCommander && u.hp > 0 && u.selected);
        
        // Contextual Box Colors
        if (hasSelection) {
            boxEl.style.border = '2px dashed rgba(66, 135, 245, 0.82)'; // Blue = Move
            boxEl.style.background = 'rgba(66, 135, 245, 0.15)';
            boxEl.style.boxShadow = 'inset 0 0 10px rgba(66, 135, 245, 0.2)';
        } else {
            boxEl.style.border = '2px dashed rgba(245,215,110,0.82)'; // Gold = Select
            boxEl.style.background = 'rgba(245,215,110,0.06)';
            boxEl.style.boxShadow = 'inset 0 0 10px rgba(245,215,110,0.08)';
        }

        boxEl.style.display = 'block';
        boxEl.style.left = Math.min(e.clientX, selectionBoxScreenStart.x) + 'px';
        boxEl.style.top = Math.min(e.clientY, selectionBoxScreenStart.y) + 'px';
        boxEl.style.width = Math.abs(e.clientX - selectionBoxScreenStart.x) + 'px';
        boxEl.style.height = Math.abs(e.clientY - selectionBoxScreenStart.y) + 'px';
    }
});

// --- MOUSE UP (Process Actions) ---
document.addEventListener('mouseup', (e) => {
    const boxEl = getDesktopBoxEl();
    boxEl.style.display = 'none';

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
            // ACTION: FORMATION MOVE TO RECTANGLE
            (window.executeBoxFormationMove || executeBoxFormationMove)(selectedUnits, minX, maxX, minY, maxY);
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

// --- RECTANGLE FORMATION MATHEMATICS ---
window.executeBoxFormationMove = function executeBoxFormationMove(units, minX, maxX, minY, maxY) {
    if (!units || units.length === 0) return;
    
    lazyTakeManualControl(units);

    const boxWidth = Math.max(30, maxX - minX);
    const boxHeight = Math.max(30, maxY - minY);
    const centerX = minX + boxWidth / 2;
    const centerY = minY + boxHeight / 2;

    // Tactical sort so melee stands up front
    let shields = [], infantry = [], ranged = [], gunpowder = [], cavalry = [];
    units.forEach(u => {
        let r = getTacticalRole(u);
        if (r === "SHIELD") shields.push(u);
        else if (r === "INFANTRY") infantry.push(u);
        else if (r === "RANGED") ranged.push(u);
        else if (r === "GUNPOWDER") gunpowder.push(u);
        else cavalry.push(u);
    });
    const sortedUnits = [...shields, ...infantry, ...ranged, ...gunpowder, ...cavalry];
    const N = sortedUnits.length;

    // Determine how many fit per row based on box width
    const minSpacing = 35; 
    let cols = Math.max(1, Math.floor(boxWidth / minSpacing));
    cols = Math.min(cols, N); // Can't have more columns than units
    let rows = Math.ceil(N / cols);

    // Distribute perfectly into the drawn space
    const actualSpacingX = Math.min(60, boxWidth / cols);
    const actualSpacingY = Math.min(60, boxHeight / rows);

    const startXOffset = -((cols - 1) * actualSpacingX) / 2;
    const startYOffset = -((rows - 1) * actualSpacingY) / 2;

    sortedUnits.forEach((u, i) => {
        let r = Math.floor(i / cols);
        let c = i % cols;
        
        // Auto-center the final incomplete row
        let unitsInThisRow = Math.min(N - (r * cols), cols);
        let rowStartX = -((unitsInThisRow - 1) * actualSpacingX) / 2;

        let offX = rowStartX + (c * actualSpacingX);
        let offY = startYOffset + (r * actualSpacingY);

        u.hasOrders = true;
        u.orderType = "move_to_point";
        u.reactionDelay = Math.floor(Math.random() * 15) + 2;
        u.formationTimer = 200;

        let rawDestX = centerX + offX;
        let rawDestY = centerY + offY;

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
function calculateFormationOffsets(units, style, centerPoint) {
    if (!units || units.length === 0) return;

    // 1. Establish Map Dimensions & Center Data
    const mapWidth = typeof BATTLE_WORLD_WIDTH !== 'undefined' ? BATTLE_WORLD_WIDTH : 2400;
    const cp = centerPoint || { x: mapWidth / 2, y: (typeof BATTLE_WORLD_HEIGHT !== 'undefined' ? BATTLE_WORLD_HEIGHT : 1600) / 2 };

    // 2. Progressive Angular Offset Logic (Lines become diagonal near map edges)
 
    let distFromCenterX = cp.x - (mapWidth / 2);
    let normalizedDist = distFromCenterX / (mapWidth / 2); // Ranges from -1 (Left) to 1 (Right)

    // 1. FLIP THE ANGLE (Negative sign ensures Left = \ and Right = /)
    // 2. FLAT CENTER (Cubing the distance keeps the center 80% perfectly flat, only curving at extreme edges)
    let mapAngle = -(Math.pow(normalizedDist, 3)) * 1.13; 

    // Disable diagonal rotation entirely for geometric shapes
    if (style === "square" || style === "circle") {
        mapAngle = 0;
    }

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
// --- GEOMETRY STYLES ---
    // SURGERY: Ratio-based override for large mounted groups
    const cavalryRatio = largeUnits.length / units.length;
    const forceUnifiedShape = (cavalryRatio > 0.40);

    switch (style) {
        case "tight": 
            assignBlock(shields, -40, 16, 16, 30); 
            assignBlock(infantry, -20, 16, 16, 30);
            assignBlock(ranged, 0, 16, 16, 30);
            assignBlock(gunpowder, 20, 18, 16, 15); 
            assignBlock(cavalry, 60, 20, 20, 40);                  
            break;

        case "standard":
            assignBlock([...shields, ...infantry], -30, 40, 30, 20);
            assignBlock(ranged, -60, 40, 30, 20);
            assignBlock(gunpowder, 0, 40, 30, 15);
            assignBlock(cavalry, 40, 50, 40, 10); 
            break;

        case "line":
            let lineGroup = [...shields, ...infantry, ...ranged, ...gunpowder, ...cavalry];
            assignBlock(lineGroup, 0, 35, 30, 40); 
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
function canUseSiegeEngines(unit) {
    const role = getTacticalRole(unit);
    // Cavalry and Large Beasts cannot push rams or climb ladders
    return !(role === "CAVALRY" || (unit.stats && unit.stats.isLarge));
}

function isCavalryUnit(unit) {
    if (!unit || !unit.stats) return false;
    // Exception: Always allow selection of the General
    if (unit.isCommander || unit.unitType === "General") return false;

    const txt = String(unit.unitType + " " + (unit.stats.role || "")).toLowerCase();
    const cavRegex = /(cav|cavalry|keshig|horse|lancer|mount|camel|eleph|knight)/;
    return cavRegex.test(txt);
}