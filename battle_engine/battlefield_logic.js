// =========================================================
// ★ WATER-AS-WALL (shared low-level primitive) ★
// Treats the water's edge as a solid wall: if obj.x/obj.y is currently over
// water, revert to the last position where it was confirmed dry and kill
// velocity — like bumping a hull/riverbank. Falls back to the supplied
// (fallbackX, fallbackY) ONLY the very first time this obj has no confirmed
// dry position recorded yet (e.g. a bad spawn), so it can never get stuck
// reverting to undefined. Shared by BLS_preDeployWaterSafety (pre-deploy)
// and applyNavalWaterCollision (in-battle, pre-boarding) below, and by the
// player commander clamp in sandboxmode_update.js.
// =========================================================
function _waterHullWall(obj, fallbackX, fallbackY) {
    if (!obj || typeof window.getNavalSurfaceAt !== 'function') return false;
    const surf = window.getNavalSurfaceAt(obj.x, obj.y);
    if (surf !== 'WATER' && surf !== 'EDGE') {
        obj._lastDeckX = obj.x;
        obj._lastDeckY = obj.y;
        return false;
    }
    if (obj._lastDeckX != null && obj._lastDeckY != null) {
        obj.x = obj._lastDeckX;
        obj.y = obj._lastDeckY;
    } else if (fallbackX != null && fallbackY != null) {
        obj.x = fallbackX;
        obj.y = fallbackY;
        obj._lastDeckX = fallbackX;
        obj._lastDeckY = fallbackY;
    }
    obj.vx = 0; obj.vy = 0;
    return true;
}
if (typeof window !== 'undefined') window._waterHullWall = _waterHullWall;

// =========================================================
// ★ PRE-DEPLOY WATER SAFETY NET ★
// During pre-deploy (before COMMENCE BATTLE), naval and river units must
// never be standing in water — water acts like a collision boundary during
// this phase. This is deliberately a SEPARATE, redundant check from
// whatever normally keeps units out of water (deck boarding logic,
// applyNavalWaterCollision below, etc.) — it exists specifically as a
// backstop "just in case" that primary mechanism fails to catch every case
// (unit spawn position, a drag-box order dragging a unit toward the zone
// edge, etc). Used for player troops, enemy troops, AND the player
// commander (called from sandboxmode_update.js via
// window.BLS_preDeployWaterSafety, since the commander's x/y live in a
// different file's tick).
//
// SURGERY: previously teleported straight to the zone's CENTROID on every
// water hit. Per direct request, water is now treated as a genuine
// collision wall instead: revert to the last confirmed dry spot (via
// _waterHullWall above), only falling back to the centroid the very first
// time a given unit/commander has no dry position recorded yet this battle.
// Naval and river zones are now handled identically through
// getNavalSurfaceAt (which already knows how to test both a ship hull and
// a river tile), instead of two separate hand-rolled checks.
// =========================================================
function BLS_preDeployWaterSafety(unit, zone) {
    if (!unit || !zone) return false;
    if (zone.type !== "naval" && zone.type !== "river") return false; // land/siege zones have no water concept here
    return _waterHullWall(unit, (zone.minX + zone.maxX) / 2, (zone.minY + zone.maxY) / 2);
}
if (typeof window !== 'undefined') window.BLS_preDeployWaterSafety = BLS_preDeployWaterSafety;

// =========================================================
// ★ IN-BATTLE NAVAL WATER COLLISION ★
// Real hull-as-wall collision for the actual battle (post-COMMENCE), not
// just the pre-deploy backstop above. Per direct request:
//   • Before ships grapple: the hull edge blocks all non-commander units
//     — they can roam the deck freely (see the NAVAL BOARDING GATE rewrite
//     further down) but physically cannot step into the water.
//   • The player/enemy COMMANDER is exempt — they can go overboard.
//   • The instant ships grapple (window._navalBoardingTimer), the wall
//     lifts entirely — units are boarding, crossing between decks.
//   • River battles are untouched here — updateRiverPhysics() already
//     lets everyone swim freely once the battle has commenced; this only
//     ever applies to ocean/coastal naval battles.
// Called once per frame from the main collision pass below (search
// "4. Collisions"), after applyUnitCollisions/applyWallGravity so it has
// the final word even if crowd-pressure shoved a unit toward the rail.
// =========================================================
function applyNavalWaterCollision(units) {
    if (!window.inNavalBattle) return;
    if (window.__preDeploymentActive) return; // pre-deploy uses BLS_preDeployWaterSafety's own call sites instead
    if (window._navalBoardingTimer) return;   // ships have grappled — hull no longer blocks movement
    if (!Array.isArray(units)) return;

    units.forEach(function (unit) {
        if (!unit || unit.hp <= 0 || unit.isCommander) return; // commander can go overboard
        if (unit.isClimbing || unit.settling) return; // never fights with siege-style vertical motion

        let fbX = null, fbY = null;
        if (unit._lastDeckX == null && typeof navalEnvironment !== 'undefined' && navalEnvironment && navalEnvironment.ships) {
            const ship = navalEnvironment.ships.find(function (s) { return s.side === unit.side; }) || navalEnvironment.ships[0];
            if (ship) { fbX = ship.x; fbY = ship.y; }
        }
        _waterHullWall(unit, fbX, fbY);
    });
}
if (typeof window !== 'undefined') window.applyNavalWaterCollision = applyNavalWaterCollision;

// =========================================================
// ★ NAVAL DECK WANDER (melee only, pre-boarding) ★
// Per direct request: melee units left idle on deck before the ships
// grapple should look like they're milling about, not frozen solid — same
// idea as _startIdleWander in battle-loading-screen.js (pre-deploy), just
// running live during the actual battle instead of the loading screen.
// Only nudges a unit that is genuinely idle: orderType is 'hold_position'
// with no real (non-dummy) target, OR it has already arrived at a previous
// wander leg (orderType 'move_to_point' with an isAnchor dummy target — the
// engine's own "I've arrived and settled" state, see processTacticalOrders
// in battlefield_commands.js). A unit mid-walk to a real waypoint, or
// actively fighting a real target, is left completely alone. Player side
// only — enemy keeps its own existing aggro-range hold/attack behavior.
// =========================================================
function _navalDeckWander(unit) {
    if (!unit || unit.side !== 'player') return;
    if (unit.target && !unit.target.isDummy) return; // actively fighting — don't interrupt

    const idle = unit.orderType === 'hold_position' ||
        (unit.orderType === 'move_to_point' && unit.target && unit.target.isAnchor);
    if (!idle) return; // mid-walk to a real waypoint — leave it alone

    unit._navalWanderCooldown = (unit._navalWanderCooldown == null)
        ? (60 + Math.floor(Math.random() * 120))
        : unit._navalWanderCooldown - 1;
    if (unit._navalWanderCooldown > 0) return;
    unit._navalWanderCooldown = 150 + Math.floor(Math.random() * 150); // ~2.5-5s @60fps between legs

    const angle = Math.random() * Math.PI * 2;
    const dist  = 20 + Math.random() * 40;
    unit.orderType        = 'move_to_point';
    unit.hasOrders        = true;
    unit.orderTargetPoint = { x: unit.x + Math.cos(angle) * dist, y: unit.y + Math.sin(angle) * dist };
    unit.formationTimer   = 30;
    unit.reactionDelay    = 0;
}
if (typeof window !== 'undefined') window._navalDeckWander = _navalDeckWander;

function isFlanked(attacker, defender) {
    if (!attacker || !defender) return false;
    if (attacker.hp <= 0 || defender.hp <= 0) return false;
    if (attacker.isDummy || defender.isDummy) return false;

    // If the defender is not actively engaging someone, we cannot infer facing safely.
    const facingTarget = defender.target;
    if (!facingTarget || facingTarget.hp <= 0 || facingTarget.isDummy) return false;

    // Vector from defender -> defender's current target (the way defender is "facing")
    const fx = facingTarget.x - defender.x;
    const fy = facingTarget.y - defender.y;

    // Vector from defender -> attacker
    const ax = attacker.x - defender.x;
    const ay = attacker.y - defender.y;

    const fMag = Math.hypot(fx, fy);
    const aMag = Math.hypot(ax, ay);

    if (fMag < 0.001 || aMag < 0.001) return false;

    let cosTheta = (fx * ax + fy * ay) / (fMag * aMag);

    // Clamp for numerical safety
    cosTheta = Math.max(-1, Math.min(1, cosTheta));

    const angleDeg = Math.acos(cosTheta) * (180 / Math.PI);

    // 120°+ means side/rear attack.
    // Higher number = safer, fewer false positives.
    return angleDeg >= 120;
}

function calculateDamageReceived(attacker, defender, stateString) {
    const states = stateString.split(" ");
    let totalDamage = 0;

    // Check if the attacker is FORCED into melee by their current stance
    const isActuallyRangedAttacking = states.includes("ranged_attack") && attacker.currentStance === "statusrange";

    let attackValue = attacker.meleeAttack || 10;
    let defenseValue = defender.meleeDefense || 10;

    // Add fallback to 0 to prevent NaN damage if a unit has no experience value
    attackValue += ((attacker.experienceLevel || 0) * 2);
    defenseValue += ((defender.experienceLevel || 0) * 2);

    if (states.includes("flanked")) defenseValue *= 0.5;
    if (states.includes("charging")) attackValue += 15;

    // ========================================================================
    // 1. FIRELANCE AMMO DRAIN & BURST FIX
    // ========================================================================

let safeName = attacker.unitType || (attacker.stats && attacker.stats.name) || "";
let safeRole = (attacker.stats && attacker.stats.role) || attacker.role || "";
let isFirelance = safeName.includes("Firelance") || (attacker.name && attacker.name.includes("Firelance"));

if (isFirelance && attacker.ammo > 0) {
    if (attacker.lastAmmoDrainTick !== Date.now()) {
        attacker.ammo -= 1;
        attacker.lastAmmoDrainTick = Date.now();
    }
    attackValue += 40; 
}
    if (isActuallyRangedAttacking) {
        // Ranged Damage Calculation
        if (states.includes("shielded_front") && Math.random() * 100 < defender.shieldBlockChance) return 0;

        let effectiveArmor = Math.max(0, defender.armor - (attacker.missileAPDamage || 0));
        let baseDamageDealt = Math.max(0, (attacker.missileBaseDamage || 0) - (effectiveArmor * 0.5));
        totalDamage = baseDamageDealt + (attacker.missileAPDamage || 0);

        // ========================================================================
        // 2. EXPONENTIAL AREA OF EFFECT (AoE) FOR BOMBS & TREBUCHETS
        // ========================================================================

// This covers both the new 'safe' lookups and your old direct property checks
let isBomb = (safeName === "Bomb" || safeRole === "bomb") || (attacker.name === "Bomb" || attacker.role === "bomb");

let isTrebuchet = safeName.includes("Trebuchet") || (attacker.name && attacker.name.includes("Trebuchet"));


        if (isBomb || isTrebuchet) {
            // Massive direct hit damage
            totalDamage *= 3.5; 

            // Set the blast scale
            let blastRadius = isTrebuchet ? 50 : 30; 
            let maxAoEDamage = isTrebuchet ? 70 : 50;

            // Apply exponential AoE to all surrounding units
            if (typeof battleEnvironment !== 'undefined' && battleEnvironment.units) {
                battleEnvironment.units.forEach(u => {
                    // Skip dead units or the direct target (who already takes totalDamage)
                    if (u.hp <= 0 || u === defender) return; 

                    let dx = u.x - defender.x;
                    let dy = u.y - defender.y;
                    let dist = Math.hypot(dx, dy);

                    if (dist <= blastRadius) {
                        // Exponential drop-off formula: y = e^(-k * dist)
                        // k = 4 ensures damage drops off steeply toward the edge of the blast
                        let dropoff = Math.pow(Math.E, -4 * (dist / blastRadius));
                        
                        let splashDamage = Math.floor(maxAoEDamage * dropoff);
                        
                        if (splashDamage > 0) {
                            u.hp -= splashDamage;
                        }
                    }
                });
            }
        }

        // Rocket bonus vs Large
        if (defender.isLarge && attacker.name && attacker.name.toLowerCase().includes("rocket")) {
            totalDamage += 30;
        }

    } else {
        // Melee Damage Calculation
        let hitChance = Math.max(10, Math.min(90, 40 + (attackValue - defenseValue)));

        if (Math.random() * 100 < hitChance) {
            let weaponDamage = attackValue + (defender.isLarge ? (attacker.bonusVsLarge || 0) : 0);
            totalDamage = Math.max(15, weaponDamage - (defender.armor * 0.3)); 
        }
    }

    if (attacker.stamina < 30) totalDamage *= 0.7;

    return Math.floor(totalDamage);
}

window.updateBattleUnits = function updateBattleUnits() {
    // SURGERY: snapshot every engine's position BEFORE it moves this frame,
    // so the unstick pass right after can push overlapping large units by
    // the engine's actual movement vector (a real "carried along" push),
    // not just teleport them to the box edge after the fact.
    if (typeof _snapshotEnginePrevPositions === 'function') _snapshotEnginePrevPositions();
    // SURGERY: freeze siege engines (rams/ladders/trebuchets/mantlets) during
    // pre-deploy. processSiegeEngines() ran unconditionally here, ahead of
    // the __preDeploymentActive unit-freeze guard further down this function,
    // so rams kept advancing and trebuchets kept firing straight through the
    // deploy phase even after enemy units themselves were frozen. Gate it the
    // same way _installTickPatches() (battle-loading-screen.js) gates
    // updateBattleProjectiles/updateNavalPhysics/updateRiverPhysics.
    if (typeof processSiegeEngines === 'function' &&
        !(typeof window !== 'undefined' && window.__preDeploymentActive)) {
        processSiegeEngines();
    }
    // SURGERY: Engines (esp. the ram retreating after the gate breaks, or
    // ladders/towers rolling forward) can advance or withdraw right through
    // a large unit's current spot. Do the unstick pass immediately after
    // engines move and before anything else touches position this frame, so
    // a general/horse/elephant/camel is never left embedded inside one.
    if (typeof resolveLargeUnitEngineOverlap === 'function') resolveLargeUnitEngineOverlap();
    if (typeof processTacticalOrders === 'function') processTacticalOrders();

    // --- NEW SURGERY: Real-time Collision Grid Synchronization ---
    if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle && battleEnvironment.grid) {
        
        // 1. Sync the Gate Collision (Flips 6 to 1 when destroyed)
        if (typeof updateCityGates === 'function') {
            updateCityGates(battleEnvironment.grid);
        }
        
// 2. Sync Deployed Ladders (Carves through overlapping drawbridge barriers)
        if (typeof siegeEquipment !== 'undefined' && siegeEquipment.ladders) {
            siegeEquipment.ladders.forEach(l => {
                if (l.isDeployed && l.hp > 0) {
                    let bTile = typeof BATTLE_TILE_SIZE !== 'undefined' ? BATTLE_TILE_SIZE : 8;
                    let tx = Math.floor(l.x / bTile);
                    let ty = Math.floor(l.y / bTile);
                    
                    // SURGERY: Expand Y-loop to 'ty - 16' to carve completely through the thick parapet.
                    for (let x = tx - 2; x <= tx + 2; x++) {
                        for (let y = ty - 16; y <= ty + 2; y++) {
                            if (battleEnvironment.grid[x] && battleEnvironment.grid[x][y] !== undefined) {
                                let cTile = battleEnvironment.grid[x][y];
                                
                                // FORCE OVERWRITE solid wall parapets (6), ground (0), towers (7), or wooden platforms (8)
                                if (cTile === 6 || cTile === 0 || cTile === 7 || cTile === 8) {
                                    // If deep into the wall, assign walkable wall (10) to pop them up onto the ramparts.
                                    battleEnvironment.grid[x][y] = (y < ty - 1) ? 10 : 9;
                                }
                            }
                        }
					}
                }
            });
        }

        // 3. Tower auto-shooting (only fires during active siege battles)
        // SURGERY: also gated on __preDeploymentActive — see processSiegeEngines
        // guard above for why. Defending wall towers should not be able to
        // shoot the attacker camp before COMMENCE BATTLE is clicked.
        if (typeof updateTowerShooting === 'function' &&
            !(typeof window !== 'undefined' && window.__preDeploymentActive)) {
            updateTowerShooting();
        }
    } // <--- FIX: This bracket was placed too early! Now it properly closes the 'if (inSiegeBattle)' block.

    // --- END SURGERY ---
	
    const now = Date.now();

    // 1. Clean Dead Units (Surgery intact: keep bodies for 10s, Commander never decays)
    battleEnvironment.units = AICategories.cleanupDeadUnits(battleEnvironment.units, now);
    let units = battleEnvironment.units;

    // 2. Initialize Global Trackers
    AICategories.initBattleTrackers(currentBattleData);

    const pCount = units.filter(u => u.side === 'player').length;
    const eCount = units.filter(u => u.side === 'enemy').length;

updateCasualtyMoralePressure(units, currentBattleData);
    applySiegeMercyDrain(units);
// 3. Process Each Unit
    units.forEach(unit => {
        // Death Hook
        if (unit.hp <= 0) {
            handleUnitDeath(unit);
            return; 
        }

        // =========================================================
        // ★ PRE-DEPLOY GUARD (BLS v4.1) ★
        // During the pre-deploy phase (right after the loading screen, before the
        // player clicks COMMENCE BATTLE), we keep the engine running so player
        // right-click move orders actually work — but with two constraints:
        //   • ENEMY units are fully frozen (no AI, no targeting, no morale, no
        //     movement, no collisions push). Their legs may still animate via
        //     the draw layer's anim counter — that's fine and intentional.
        //   • PLAYER non-commander units run normal AI/movement, then are clamped
        //     to window.__playerDeployZone at the END of this iteration. This
        //     way executeBoxFormationMove's orderType="move_to_point" +
        //     orderTargetPoint flows through processAction → _handleMovement
        //     naturally — same code path as in real battle.
        //   • PLAYER commander uses the same handlePlayerOverride path as
        //     normal battle (already handled below at line ~211).
        // =========================================================
        if (typeof window !== 'undefined' && window.__preDeploymentActive) {
            if (unit.side === "enemy") {
                // ABSOLUTE STILLNESS
                unit.vx = 0;
                unit.vy = 0;
                unit.target = null;
                unit.orderType = "hold_position";
                unit.hasOrders = true;
                unit.orderTargetPoint = null;
                unit.state = "idle";
                unit.reactionDelay = 0;
                unit.formationTimer = 0;
                unit.fleeing = false;
                unit.isFleeing = false;
                if (typeof unit.morale === "number") unit.morale = Math.max(unit.morale, 100);
                if (unit.cooldown > 0) unit.cooldown--;
                // SURGERY: water safety-net backstop for enemy units too — see
                // BLS_preDeployWaterSafety top of file. Enemy units are frozen
                // in place above so this should rarely fire, but covers a bad
                // spawn/formation position landing directly in water.
                if (window.__enemyDeployZone) BLS_preDeployWaterSafety(unit, window.__enemyDeployZone);
                return; // skip ALL processing for enemy units pre-deploy
            }
            // ★ v4.2.2: SUPPRESS COMMANDER COMBAT DURING PRE-DEPLOY
            // Even when clamped to the deploy zone (esp. small naval ship deck),
            // the player commander used to auto-acquire enemy targets via
            // handlePlayerOverride and shoot at them through the deploy gate.
            // Strip target & freeze cooldown each frame so no combat happens
            // before COMMENCE BATTLE is clicked. Movement still flows through
            // the normal handlePlayerOverride path so legs animate.
            if (unit.isCommander && unit.side === "player") {
                unit.target = null;
                // Bump cooldown so even if some other path acquires a target,
                // the attack doesn't release until well after COMMENCE.
                if (!unit.cooldown || unit.cooldown < 30) unit.cooldown = 30;
            }
            // For player non-commander units, suppress fleeing/morale during pre-deploy
            // (a unit's "fleeing" flag shouldn't be set from a fight that hasn't started yet)
            if (!unit.isCommander) {
                unit.fleeing = false;
                unit.isFleeing = false;
                if (typeof unit.morale === "number") unit.morale = Math.max(unit.morale, 100);
                // Strip any target the unit may have auto-acquired — they shouldn't
                // engage anyone until COMMENCE BATTLE. Only keep dummy targets
                // (those come from executeBoxFormationMove move orders).
                if (unit.target && !unit.target.isDummy) {
                    unit.target = null;
                }
            }
            // Player commander + player non-commander units fall through to normal
            // processing below — but we'll clamp them after processAction.
        }
        // =========================================================

        // ---> STUCK PREVENTION INJECTION <---
        if (typeof handleStuckPrevention === 'function') {
            handleStuckPrevention(unit);
        }

// Player Override (Stops AI, updates Animation State)
        if (unit.disableAICombat && unit.isCommander) {
            // FIX: Decrement the commander's cooldown before the early return so they can shoot again!
            if (unit.cooldown > 0) unit.cooldown--;
            
            AICategories.handlePlayerOverride(unit, units, typeof keys !== 'undefined' ? keys : {}, battleEnvironment, player);
            return; 
        }

      // Morale & Cowardice (AI Only)
        if (!unit.isCommander) {
            const isFleeingOrWavering = AICategories.processMoraleAndFleeing(unit, pCount, eCount, currentBattleData);
            
            // ---> SIEGE FLEEING OVERRIDE (NORTH ONLY) <---
            if (isFleeingOrWavering && typeof inSiegeBattle !== 'undefined' && inSiegeBattle) {
                // Defenders always flee NORTH — away from the wall and the attacking
                // army.  Y = -300 is well off the top of the map; the isOutsideBorder
                // check in _handleBrokenFleeing retires the unit once it crosses there.
                // Clear escapeType so _handleBrokenFleeing doesn't reuse a stale
                // south/sideways escapePoint from a previous frame's assignment.
                unit.escapeType  = null;
                unit.escapePoint = {
                    x: unit.x + (Math.random() - 0.5) * 200, // slight X jitter: no stacking
                    y: -300
                };
                // Kill any southward momentum so the master wall-clamp doesn't fight it.
                if (unit.vy > 0) unit.vy = 0;
            }
            // ---> END OVERRIDE <---

            // ---> LAND BATTLE FLEEING OVERRIDE (NEVER FLEE TOWARD THE FIGHT) <---
            // SURGERY: generalized for the random 8-direction spawn system
            // (see computeSpawnGeometry/pickBattleSpawnAssignment in
            // battlefield_launch.js). Previously this only patched enemy
            // units and only checked for "downward," because enemy was
            // guaranteed to spawn at the top and player at the bottom, so
            // "toward larger Y" always meant "through the player's lines."
            // Now either side can spawn at any of 8 positions, so this
            // checks whether the escape point lies in THIS unit's own
            // forward direction (toward the fight) rather than a fixed
            // edge, and — if so — redirects to the nearest edge that ISN'T
            // this side's "most forward" edge (old code hardcoded that
            // excluded edge as "bottom" for enemy; it's now derived from
            // wherever this side actually spawned).
            const _fleeGeo = window.battleSpawnAssignment && window.battleSpawnAssignment[unit.side];
            if (isFleeingOrWavering &&
                !(typeof inSiegeBattle !== 'undefined' && inSiegeBattle) &&
                !(typeof inNavalBattle !== 'undefined' && inNavalBattle) &&
                unit.escapePoint && _fleeGeo) {

                const fwd = _fleeGeo.forward;
                const ex = unit.escapePoint.x - unit.x;
                const ey = unit.escapePoint.y - unit.y;
                const escapeIsForward = (ex * fwd.x + ey * fwd.y) > 0;

                if (escapeIsForward) {
                    const isWavering = (unit.state === "WAVERING");

                    // Which single cardinal edge is most "toward the fight"
                    // for this unit's side? Exclude only that one from the
                    // nearest-edge pick below (old code hardcoded this
                    // exclusion as "bottom" for enemy).
                    const EDGE_DIRS = { top: {x:0,y:-1}, bottom: {x:0,y:1}, left: {x:-1,y:0}, right: {x:1,y:0} };
                    let forwardEdge = null, bestDot = -Infinity;
                    for (const key in EDGE_DIRS) {
                        const d = EDGE_DIRS[key].x * fwd.x + EDGE_DIRS[key].y * fwd.y;
                        if (d > bestDot) { bestDot = d; forwardEdge = key; }
                    }

                    const dists = {
                        left:   unit.x,
                        right:  BATTLE_WORLD_WIDTH - unit.x,
                        top:    unit.y,
                        bottom: BATTLE_WORLD_HEIGHT - unit.y
                    };
                    delete dists[forwardEdge];
                    let nearestEdge = null, nearestDist = Infinity;
                    for (const key in dists) {
                        if (dists[key] < nearestDist) { nearestDist = dists[key]; nearestEdge = key; }
                    }

                    if (nearestEdge === "top") {
                        unit.escapePoint.y = isWavering ? 20 : -2000;
                    } else if (nearestEdge === "bottom") {
                        unit.escapePoint.y = isWavering ? (BATTLE_WORLD_HEIGHT - 20) : (BATTLE_WORLD_HEIGHT + 2000);
                    } else if (nearestEdge === "left") {
                        unit.escapePoint.x = isWavering ? 20 : -2000;
                        unit.escapePoint.y = unit.y;
                    } else { // right
                        unit.escapePoint.x = isWavering ? (BATTLE_WORLD_WIDTH - 20) : (BATTLE_WORLD_WIDTH + 2000);
                        unit.escapePoint.y = unit.y;
                    }
                    // Kill any residual momentum toward the fight so physics doesn't fight the redirect.
                    if ((unit.vx * fwd.x + unit.vy * fwd.y) > 0) { unit.vx = 0; unit.vy = 0; }
                }
            }
            // ---> END LAND OVERRIDE <---

            if (isFleeingOrWavering) return; // Skip normal targeting/combat if they are running away
        }
		
		// --- NEW: A. THE STUCK EXTRACTOR ---
		if (typeof applyStuckExtractor === 'function') {
			applyStuckExtractor(unit);
		}

        // --- NEW: B. MOUNT LADDER DROP CHECK ---
        if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle) {
            let typeStr = String(unit.type || unit.role || "").toLowerCase();
            let isMount = typeStr.match(/(horse|camel|eleph|cav)/) || unit.isLarge;
            
            if (isMount && (unit.carryingLadder || unit.ladderRef)) {
                if (unit.ladderRef) { 
                    unit.ladderRef.isCarried = false; 
                    unit.ladderRef.carriedBy = null; 
                }
                unit.carryingLadder = false;
                unit.ladderRef = null;
                unit.y += 200; // Move 200 pixels backwards
                unit.target = null; // Reset AI so they re-evaluate targets
            }
        }
		
		
        // =========================================================
        // NAVAL BOARDING GATE
        // Runs BEFORE processTargeting so orderType is correct when read.
        // Pre-collision: units roam their own deck freely — the hull edge
        // is enforced as a hard wall by applyNavalWaterCollision (see the
        // "4. Collisions" pass below), so this block no longer needs to
        // freeze anyone in place to keep them dry. It used to force
        // orderTargetPoint back to the unit's exact current spot EVERY
        // frame, which also silently cancelled any real player move order
        // the very next tick — that's why troops couldn't be repositioned
        // before boarding. Now: hand a unit 'hold_position' only the first
        // time it has no order at all, then get out of the way and let the
        // normal pipeline (processTacticalOrders already ran earlier this
        // frame) own it exactly like a land-battle unit — smart in-range
        // auto-targeting, real player move orders, all of it. Idle melee
        // units get a gentle periodic wander via _navalDeckWander so the
        // deck doesn't look frozen solid while the ships close the gap;
        // ranged units are excluded on purpose — they hold and fire.
        // Post-collision: force seek_engage + triple stats.range so troops
        // charge from across the full ship deck instead of standing still.
        // =========================================================
        if (window.inNavalBattle && !unit.isCommander &&
            !(typeof window !== 'undefined' && window.__preDeploymentActive)) {
            if (!window._navalBoardingTimer) {
                if (!unit.hasOrders) {
                    unit.orderType        = 'hold_position';
                    unit.hasOrders        = true;
                    unit.orderTargetPoint = { x: unit.x, y: unit.y };
                }
                if (!(unit.stats && unit.stats.isRanged) && typeof _navalDeckWander === 'function') {
                    _navalDeckWander(unit);
                }
                AICategories.processTargeting(unit, units);
                AICategories.processAction(unit, battleEnvironment, currentBattleData, player);
                if (unit.cooldown > 0) unit.cooldown--;
                return;
            } else {
                if (unit.orderType === 'hold_position' || unit.orderType === 'move_to_point') {
                    unit.orderType        = 'seek_engage';
                    unit.hasOrders        = true;
                    unit.orderTargetPoint = null;
                    unit.isPatrolling     = false;
                }
                if (unit.stats && unit.stats.range) {
                    if (!unit._navalBaseRange) unit._navalBaseRange = unit.stats.range;
                    unit.stats.range = unit._navalBaseRange * 3;
                }
            }
        }

        // Targeting & Action (Movement or Attack)
        AICategories.processTargeting(unit, units);
        AICategories.processAction(unit, battleEnvironment, currentBattleData, player);

        // =========================================================
        // ★ PRE-DEPLOY POSITION CLAMP (BLS v4.1) ★
        // After AI/movement runs, force player units to stay inside the deploy zone.
        // The commander is clamped via sandboxmode_update's player.x/y → pCmdr sync,
        // but non-commander units arrived here via processAction → _handleMovement,
        // so we clamp them now. The clamp also kills any velocity carrying them out.
        // =========================================================
        if (typeof window !== 'undefined' && window.__preDeploymentActive &&
            window.__playerDeployZone && unit.side === "player" && !unit.isCommander) {
            const z = window.__playerDeployZone;
            // SURGERY: water acts as a collision boundary during pre-deploy —
            // naval AND river units must never be standing in water before
            // COMMENCE BATTLE. BLS_preDeployWaterSafety (defined top of file)
            // teleports to the zone's centroid if the unit is found in water;
            // this is a backstop check independent of whatever normally keeps
            // units out of water, run every frame just in case.
            if (!BLS_preDeployWaterSafety(unit, z) && z.type !== "naval") {
                if (unit.x < z.minX) { unit.x = z.minX; unit.vx = 0; }
                if (unit.x > z.maxX) { unit.x = z.maxX; unit.vx = 0; }
                if (unit.y < z.minY) { unit.y = z.minY; unit.vy = 0; }
                if (unit.y > z.maxY) { unit.y = z.maxY; unit.vy = 0; }
            }
        }
        // =========================================================

        // Cooldowns
        if (unit.cooldown > 0) unit.cooldown--;
    });

// 4. Collisions
    applyUnitCollisions(units);
    applyWallGravity(units);
    updateRiverPhysics();
    applyNavalWaterCollision(units); // NEW — hull-as-wall for naval troops, final word this frame

    // SURVIVAL: field-fortification collision (palisade blocks, trench slows,
    // elevation bonus near walls). Self-contained in survivalStructures.js —
    // this file only owns the guarded call site, per that file's own
    // "fully self-contained" design note.
    if (window.__IS_SURVIVAL_BATTLE__ && window.SurvivalStructures &&
        typeof window.SurvivalStructures.applyStructureCollisions === "function") {
        window.SurvivalStructures.applyStructureCollisions(units);
    }

    // =========================================================
    // ★ FINAL PRE-DEPLOY CLAMP — safety net after ALL collision passes ★
    // The BLS v4.1 clamp further up this function (search that tag) runs
    // right after each unit's own AI/movement step — but
    // applyUnitCollisions/applyWallGravity/updateRiverPhysics/
    // applyStructureCollisions all run AFTER that, and every one of them
    // can shove a unit back outside the deploy zone (most visibly: getting
    // pushed off a just-built palisade, or jostled by a crowd of units
    // packed against the boundary). Without this, the position only resets
    // at the START of the NEXT frame — this frame still renders the unit
    // outside the zone, which reads as units actively escaping during
    // predeployment. Runs last, unconditionally, and — unlike the BLS v4.1
    // clamp above — also covers the commander: sandboxmode_update.js
    // normally owns that sync, but it runs BEFORE this file's collision
    // passes each frame, so it has the exact same one-frame gap.
    // =========================================================
    if (typeof window !== 'undefined' && window.__preDeploymentActive && window.__playerDeployZone) {
        const z = window.__playerDeployZone;
        units.forEach(u => {
            if (!u || u.side !== "player" || u.hp <= 0) return;
            if (typeof BLS_preDeployWaterSafety === "function" && BLS_preDeployWaterSafety(u, z)) return;
            if (z.type === "naval") return;
            if (u.x < z.minX) { u.x = z.minX; u.vx = 0; }
            if (u.x > z.maxX) { u.x = z.maxX; u.vx = 0; }
            if (u.y < z.minY) { u.y = z.minY; u.vy = 0; }
            if (u.y > z.maxY) { u.y = z.maxY; u.vy = 0; }
        });
    }

    // SURGERY: Second unstick pass. The top-of-frame call (right after
    // processSiegeEngines) catches engines moving onto a stationary unit,
    // but applyUnitCollisions' crowd pressure above can itself shove a
    // large unit into an engine box later in the SAME frame. Running the
    // pass again here — after all position math for this frame is done —
    // guarantees no large unit is ever left embedded when the frame renders,
    // regardless of what pushed them in.
    if (typeof resolveLargeUnitEngineOverlap === 'function') resolveLargeUnitEngineOverlap();

    // =========================================================
    // ---> THE ABSOLUTE MASTER CLAMP (SIEGE DEFENDERS) <---
    // Catches any defender pushed south of the allowed zone by
    // crowd pressure, collision math, or gravity — runs every frame.
    // Gate-breached units near the gate opening are exempted so
    // they can fight through it; all others held inside the zone.
    //
    // SURGERY: hardWallLimit was a hardcoded wallPixelY - 10 — i.e.
    // "never south of the wall, full stop." That's the actual reason
    // defenders kept snapping back north no matter what the spawn/
    // patrol/commence logic did: this runs every frame of the whole
    // battle, not just pre-deploy, with zero exceptions before breach.
    // Once SiegeTopography.defenderRallyPixelY moved the intended
    // defender anchor south of the wall, this line was clamping every
    // defender back to the wall the very first frame after spawn.
    // Now tracks the same shared anchor (+100 buffer for patrol/
    // spread jitter) so this stays in sync automatically instead of
    // needing its own separate correction every time the anchor moves.
    // =========================================================
    if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle &&
        typeof SiegeTopography !== 'undefined') {

        let southGate = battleEnvironment.cityGates
            ? battleEnvironment.cityGates.find(g => g.side === "south")
            : null;
        let isGateBreached = window.__SIEGE_GATE_BREACHED__ ||
            (southGate && (southGate.isOpen || southGate.gateHP <= 0));
        let hardWallLimit = (SiegeTopography.defenderRallyPixelY || (SiegeTopography.wallPixelY - 10)) + 100;
        let gateX = SiegeTopography.gatePixelX;

        units.forEach(u => {
            // Skip: wall-mounted, climbers, corpses, falling units
            if (u.side !== "enemy" || u.hp <= 0 || u.isFalling ||
                u.onWall || u.isClimbing) return;

            // Allow a corridor near the gate opening when gate is breached
            let nearGateOpening = isGateBreached &&
                Math.abs(u.x - gateX) < 120;
            if (nearGateOpening) return;

            if (u.y > hardWallLimit) {
                u.y = hardWallLimit;
                // Kill southward momentum
                if (u.vy > 0) u.vy = 0;
                // Redirect any southward escapePoint so the unit doesn't
                // re-cross on the next frame
                if (u.escapePoint && u.escapePoint.y > hardWallLimit) {
                    u.escapePoint.y = hardWallLimit - 50;
                }
            }
        });
    }
    // =========================================================

    // 5. Update Projectiles & Ground Effects Cleanup
    if (battleEnvironment.projectiles && battleEnvironment.projectiles.length > 0 || battleEnvironment.groundEffects) {
        // SURVIVAL: palisade walls stop arrows/bolts. Runs first so a blocked
        // shot never reaches the normal hit-resolution pass below it.
        if (window.__IS_SURVIVAL_BATTLE__ && battleEnvironment.projectiles && window.SurvivalStructures &&
            typeof window.SurvivalStructures.blockProjectilesAtPalisades === "function") {
            window.SurvivalStructures.blockProjectilesAtPalisades(battleEnvironment.projectiles);
        }
        AICategories.processProjectilesAndCleanup(battleEnvironment);
    }

 
    let playerCmdr = units.find(u => u.isCommander && u.side === "player");
    if (playerCmdr && playerCmdr.hp > 0) {
        // Force visual direction based on keyboard movement instead of AI targeting
        if (typeof keys !== 'undefined') {
            if (keys['a'] || keys['arrowleft']) playerCmdr.direction = -1;
            else if (keys['d'] || keys['arrowright']) playerCmdr.direction = 1;
        }
        // INTENTION = Clear any AI-assigned targets so it doesn't try to auto-chase
      //  playerCmdr.target = null;
    }

    // Explicitly ensure this is an ENEMY before feeding it to the AI
    let enemyCmdr = units.find(u => u.isCommander && u.side === "enemy");
    if (enemyCmdr && enemyCmdr.hp > 0) {
        if (typeof processEnemyCommanderAI === 'function') processEnemyCommanderAI(enemyCmdr);
    }
}
	

// --- DYNAMIC TIERED COLLISION ENGINE ---
function applyUnitCollisions(units) {
	
 

    for (let i = 0; i < units.length; i++) {
        let u1 = units[i];
        if (u1.hp <= 0 || u1.state === "FLEEING") continue; 

// SURGERY Fix: If u1 is climbing, skip entirely. They are locked to the ladder.
        if (u1.isClimbing) continue;
		
        for (let j = i + 1; j < units.length; j++) {
            let u2 = units[j];
            if (u2.hp <= 0 || u2.state === "FLEEING") continue;
            
            // SURGERY Fix: Also skip if u2 is climbing! 
            // This prevents ground units from pushing climbing units sideways.
            if (u2.isClimbing) continue;

            let minDistance = (u1.stats.radius + u2.stats.radius) * 0.6;
            let dx = u2.x - u1.x;
            let dy = u2.y - u1.y;
            let distSq = dx * dx + dy * dy;

            if (distSq < minDistance * minDistance && distSq > 0) {
                let dist = Math.sqrt(distSq);
                let overlap = minDistance - dist;

                let nx = dx / dist;
                let ny = dy / dist;

                let push1 = 0;
                let push2 = 0;

                // --- THE HIERARCHY RULE ---
                if (u1.stats.weightTier > u2.stats.weightTier) {
                    // u1 is heavier. u2 takes 100% of the displacement.
                    push2 = overlap; 
                    push1 = 0;       
                } 
                else if (u2.stats.weightTier > u1.stats.weightTier) {
                    // u2 is heavier. u1 takes 100% of the displacement.
                    push1 = overlap; 
                    push2 = 0;       
                } 
                // ... (Hierarchy Rule logic remains exactly the same) ...
                else {
                    // Same Tier? Distribute the push based on exact mass.
                    let totalMass = u1.stats.mass + u2.stats.mass;
                    push1 = (u2.stats.mass / totalMass) * overlap;
                    push2 = (u1.stats.mass / totalMass) * overlap;
                }

                // Cache original X positions before displacement
                let oldX1 = u1.x;
                let oldX2 = u2.x;

// Save positions before push
                let x1Before = u1.x, y1Before = u1.y;
                let x2Before = u2.x, y2Before = u2.y;

                u1.x -= nx * push1;
                u1.y -= ny * push1;
                u2.x += nx * push2;
                u2.y += ny * push2;

                // NAVAL GUARD: revert any push that lands a unit off the ship
                // Prevents units being shoved into the hull walls or water
                if (window.inNavalBattle && window.battleEnvironment && window.BATTLE_TILE_SIZE) {
                    let t1x = Math.floor(u1.x / BATTLE_TILE_SIZE);
                    let t1y = Math.floor(u1.y / BATTLE_TILE_SIZE);
                    let tile1 = battleEnvironment.grid[t1x] && battleEnvironment.grid[t1x][t1y];
                    if (tile1 !== 0 && tile1 !== 8) { u1.x = x1Before; u1.y = y1Before; }

                    let t2x = Math.floor(u2.x / BATTLE_TILE_SIZE);
                    let t2y = Math.floor(u2.y / BATTLE_TILE_SIZE);
                    let tile2 = battleEnvironment.grid[t2x] && battleEnvironment.grid[t2x][t2y];
                    if (tile2 !== 0 && tile2 !== 8) { u2.x = x2Before; u2.y = y2Before; }
                }
// =========================================================
                // --- NEW SURGERY: SIEGE DEFENDER GUARD ---
                // =========================================================
                // Revert ANY push that shoves a defender off the wood scaffold
                if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle && window.BATTLE_TILE_SIZE) {
                    
                    // Check Unit 1
                    let st1x = Math.floor(u1.x / BATTLE_TILE_SIZE);
                    let st1y = Math.floor(u1.y / BATTLE_TILE_SIZE);
                    let stile1 = battleEnvironment.grid[st1x] && battleEnvironment.grid[st1x][st1y];
                    
                    if (u1.side === "enemy" && stile1 !== 8) {
                        // DO NOT revert u1.x! Let them slide horizontally.
                        // ONLY revert Y so they cannot be pushed South off the edge.
                        u1.y = y1Before; 
                    }

                    // Check Unit 2
                    let st2x = Math.floor(u2.x / BATTLE_TILE_SIZE);
                    let st2y = Math.floor(u2.y / BATTLE_TILE_SIZE);
                    let stile2 = battleEnvironment.grid[st2x] && battleEnvironment.grid[st2x][st2y];
                    
                    if (u2.side === "enemy" && stile2 !== 8) {
                        // DO NOT revert u2.x!
                        // ONLY revert Y so they cannot be pushed South off the edge.
                        u2.y = y2Before; 
                    }

                    // BUGFIX ("ladder climbers get shoved south after landing on
                    // the wall"): the guard above only ever covered defenders
                    // (side === "enemy"). A player unit that just finished
                    // climbing (onWall === true) stands on the exact same
                    // narrow scaffold tiles and is just as capable of being
                    // shoved south off the wall-top by ordinary crowd pressure
                    // from other units queuing at the same ladder or pressing
                    // in during the fight — nothing was reverting that push for
                    // them. isClimbing units never reach this far (u1/u2 are
                    // both `continue`d out at the top of this function), so
                    // this only ever applies to units that have already landed
                    // and are standing/fighting on the wall — exactly the
                    // population that needs the same south-edge protection
                    // defenders already have.
                    if (u1.side === "player" && u1.onWall) {
                        u1.y = y1Before;
                    }
                    if (u2.side === "player" && u2.onWall) {
                        u2.y = y2Before;
                    }

                    // BUGFIX ("units run south for a few seconds with NO walking
                    // animation, a bit after they start trying to climb"): the
                    // onWall guard above only protects a unit AFTER it has
                    // already landed on the wall. Everyone still approaching or
                    // queued at a ladder (siegeRole ladder_carrier/ladder_fanatic,
                    // not yet isClimbing/onWall) had zero south-push protection
                    // here — the ladder queue system (battlefield_commands.js)
                    // packs 2 active + several waiting units into a tight cluster
                    // only ~22-24px apart, so ordinary mutual push1/push2
                    // resolution alone can shove a queued unit's raw .y south
                    // multiple times a second. That push is a direct position
                    // mutation with no vx/vy and no unit.state change, so
                    // _handleMovement never sees it and the walk animation never
                    // plays — exactly the reported symptom. Worse, being pushed
                    // into a solid wall tile (6/7) this way is then picked up by
                    // applyWallGravity on the very next tick, which "falls" the
                    // unit south at 1.5px/tick — silently, for however long it
                    // takes to clear the wall's tile footprint — which is the
                    // multi-second southward run being reported. Fix: any player
                    // unit assigned to a ladder (carrier or fanatic) that hasn't
                    // climbed yet gets the exact same Y-revert protection as an
                    // onWall unit. X is left free so queued units can still
                    // jostle sideways into their staggered waiting slots.
                    const _isLadderBound = (u) => u.side === "player" && !u.onWall &&
                        (u.siegeRole === "ladder_carrier" || u.siegeRole === "ladder_fanatic");
                    if (_isLadderBound(u1)) {
                        u1.y = y1Before;
                    }
                    if (_isLadderBound(u2)) {
                        u2.y = y2Before;
                    }
                }
                // =========================================================
				
                // =========================================================
                // --- NEW SURGERY: LARGE UNIT vs SIEGE ENGINE GUARD ---
                // =========================================================
                // Crowd pressure must never shove a general/horse/elephant/
                // camel into a siege engine's physical footprint — that's
                // exactly how they'd end up embedded inside a ram or tower.
                // If this push just did that, undo it for that unit only
                // (the other unit's push, if any, still stands).
                if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle && typeof isSiegeEngineBlocking === 'function') {
                    let u1Type = String(u1.type || u1.unitType || u1.role || "").toLowerCase();
                    let u1Large = u1.stats?.isLarge || u1.isMounted || u1Type.match(/(cav|horse|camel|eleph|general|player|commander)/);
                    if (u1Large && isSiegeEngineBlocking(u1.x, u1.y)) { u1.x = x1Before; u1.y = y1Before; }

                    let u2Type = String(u2.type || u2.unitType || u2.role || "").toLowerCase();
                    let u2Large = u2.stats?.isLarge || u2.isMounted || u2Type.match(/(cav|horse|camel|eleph|general|player|commander)/);
                    if (u2Large && isSiegeEngineBlocking(u2.x, u2.y)) { u2.x = x2Before; u2.y = y2Before; }
                }
                // =========================================================

// AFTER — revert ANY X displacement on a climbing unit:
if (u1.isClimbing) u1.x = oldX1;
if (u2.isClimbing) u2.x = oldX2;
            }
        }
    }
}

function applyWallGravity(units) {
    if (!inSiegeBattle || !battleEnvironment.grid) return;

    units.forEach(u => {
        if (u.hp <= 0 || u.isClimbing || u.onWall) {
            u.isFalling = false; // Reset if they regain footing
            return;
        }

// --- DEFENDER IMMUNITY (GATE PROTECTION) ---
        // Prevents units near the gate from being pulled through the floor by gravity glitches,
        // but allows the rest of the wall to use standard physics.
        if (u.side === "enemy") {
            const gateX = typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelX : (typeof BATTLE_WORLD_WIDTH !== 'undefined' ? BATTLE_WORLD_WIDTH / 2 : u.x);
            
            if (Math.abs(u.x - gateX) < 200) {
                u.isFalling = false; 
                return;
            }
        }

        // BUGFIX ("units run south for a few seconds with no walking
        // animation, a bit after they start trying to climb"): defense in
        // depth alongside the applyUnitCollisions fix above, which stops a
        // ladder-bound unit from being pushed into a solid wall tile (6/7)
        // in the first place. If a ladder_carrier/ladder_fanatic ever ends
        // up standing on one anyway (e.g. via some other future code path,
        // not just crowd-push), this function must never be the thing that
        // silently walks them south — same immunity defenders already get
        // above, applied to the pre-climb ladder population.
        if (u.side === "player" && (u.siegeRole === "ladder_carrier" || u.siegeRole === "ladder_fanatic")) {
            u.isFalling = false;
            return;
        }
	
        let tx = Math.floor(u.x / BATTLE_TILE_SIZE);
        let ty = Math.floor(u.y / BATTLE_TILE_SIZE);

        if (tx < 0 || tx >= BATTLE_COLS || ty < 0 || ty >= BATTLE_ROWS) return;

        let currentTile = battleEnvironment.grid[tx][ty];

        // Ground level: first fully-open row south of the wall surface
        const _groundLevelY = typeof SiegeTopography !== 'undefined'
            ? SiegeTopography.wallPixelY + BATTLE_TILE_SIZE
            : (BATTLE_ROWS - 1) * BATTLE_TILE_SIZE;

        // TRIGGER A: unit is inside a solid wall tile (original behaviour)
        const _insideSolidWall = (currentTile === 6 || currentTile === 7);

        // TRIGGER B: "Footstep Seam" — unit is on a walkway tile (8/10) but
        // their pixel-Y has drifted past the wall surface into the grey seam below.
        const _tileBelow     = (ty + 1 < BATTLE_ROWS) ? battleEnvironment.grid[tx][ty + 1] : -1;
        const _onWalkway     = (currentTile === 8 || currentTile === 10);
        const _solidBelow    = (_tileBelow === 6 || _tileBelow === 7);
        const _pastSurface   = (typeof SiegeTopography !== 'undefined') && (u.y >= SiegeTopography.wallPixelY);
        const _inFootstepSeam = _onWalkway && _solidBelow && _pastSurface;

if (_insideSolidWall || _inFootstepSeam || u.isFalling) {
            // NEW GUARD: Do not let gravity pull defenders South of the wall!
            if (u.side === "enemy") {
                u.isFalling = false;
                u.y = SiegeTopography.wallPixelY - 10; // Pop them back up safely
                return;
            }

            u.isFalling = true;
            u.y += 1.5;

            const _nextTy = Math.floor((u.y + 2) / BATTLE_TILE_SIZE);
            if (_nextTy < BATTLE_ROWS) {
                const _groundTile = battleEnvironment.grid[tx][_nextTy];
                const _isOpen = (_groundTile !== 6 && _groundTile !== 7 && _groundTile !== 8 && _groundTile !== 10);
                if (_isOpen || u.y >= _groundLevelY) {
                    u.isFalling = false;
                    u.y = _isOpen ? (_nextTy * BATTLE_TILE_SIZE) : _groundLevelY;
                    u.ignoreCollisionTicks = 30; // bumped from 20 — gives more time to clear the seam
                }
            }
        }
    });
}

// =========================================================
// SURGERY: LARGE/MOUNTED UNIT vs SIEGE ENGINE PHYSICAL COLLISION
// =========================================================
// Rams, siege towers (ladders), trebuchets, ballistas, and mantlets are
// solid physical structures. Horses, elephants, camels, and the general
// should bump into their chassis like any other obstacle instead of
// riding straight through it. Destroyed (hp <= 0) engines are reduced to
// low rubble and are intentionally left passable. Boxes are unrotated
// axis-aligned approximations of each engine's drawn footprint (see
// renderSiegeEngines in drawSiegeEngines.js), padded outward from the
// raw sprite dimensions so the collision reads as solid slightly before
// the edge of the art, not exactly at it. Shared by isSiegeEngineBlocking
// (blocks movement INTO an engine) and resolveLargeUnitEngineOverlap
// (shoves a unit back OUT if an engine's own movement, or crowd pressure,
// lands on top of it).
//
// CHECKED AGAINST renderSiegeEngines (drawSiegeEngines.js):
//   Ram:     chassis fillRect(-22,-28,44,60) + log tip to y=-45  -> ~26x50 half-extents
//   Tower:   chassis fillRect(-26,-45,52,90), wheels to x=+/-29 -> ~30x47 half-extents,
//            PLUS when isDeployed the ramp/door + chains extend another
//            ~48px past the front edge (drawn at local y -50 to -95) — that
//            overhang is real physical structure a horse can't ride through
//            either, so the box below extends forward to cover it while deployed.
//   Trebuchet/Ballista/Mantlet: smaller support structures, boxed generously.
function getSiegeEngineHitboxGroups() {
    if (typeof siegeEquipment === 'undefined' || !siegeEquipment) return [];

    // frontExtra pushes the box's forward (north, -Y) edge out further,
    // without changing where its center/back sits — used for the deployed
    // tower ramp overhang below.
    function box(halfW, halfL, frontExtra) {
        return { halfW, halfL, frontExtra: frontExtra || 0 };
    }

    return [
        { list: siegeEquipment.rams,       ...box(30, 52) },
        { list: siegeEquipment.ladders,    ...box(32, 50), dynamic: (eng) => eng.isDeployed ? box(32, 50, 48) : box(32, 50) },
        { list: siegeEquipment.trebuchets, ...box(22, 40) },
        { list: siegeEquipment.ballistas,  ...box(24, 24) },
        { list: siegeEquipment.mantlets,   ...box(30, 18) }
    ];
}

// Resolves the (possibly per-object) box for one engine instance.
function _engineBox(group, eng) {
    if (group.dynamic) return group.dynamic(eng);
    return group;
}

// Point-in-box test that also accounts for a forward (north) overhang,
// e.g. a deployed siege tower's ramp/chains extending past its chassis.
function _pointInEngineBox(x, y, eng, box) {
    let dx = x - eng.x;
    let dy = y - eng.y;
    if (Math.abs(dx) >= box.halfW) return false;
    // Normal body span, extended forward by frontExtra on the north side.
    let north = -(box.halfL + (box.frontExtra || 0));
    let south = box.halfL;
    return dy >= north && dy <= south;
}

function isSiegeEngineBlocking(x, y) {
    const engineGroups = getSiegeEngineHitboxGroups();

    for (let g = 0; g < engineGroups.length; g++) {
        let group = engineGroups[g];
        if (!group.list || !group.list.length) continue;
        for (let i = 0; i < group.list.length; i++) {
            let eng = group.list[i];
            if (!eng || eng.hp <= 0) continue; // rubble is passable, not an obstacle
            let box = _engineBox(group, eng);
            if (_pointInEngineBox(x, y, eng, box)) return true;
        }
    }
    return false;
}

// =========================================================
// SURGERY: HALT SIEGE ENGINES BLOCKED BY A LARGE UNIT
// =========================================================
// Rather than letting a ram or siege tower keep advancing/retreating
// straight INTO a general/horse/elephant/camel and relying on the push/
// unstick system above to sort it out after the fact — which is exactly
// how a large unit sitting north of the engine's path was getting caught
// and pinned by it — the engine itself should simply refuse to take this
// tick's step whenever a large unit is standing where it's about to move
// to. It resumes the instant that unit clears out. Called directly from
// siegeEngineLogic.js's ram/ladder movement code (not just from this
// file), so it's exposed as a plain global function like the other
// engine-collision helpers above.
function isLargeUnitBlockingEngineMove(eng, nextX, nextY) {
    if (typeof battleEnvironment === 'undefined' || !battleEnvironment || !battleEnvironment.units) return false;

    const engineGroups = getSiegeEngineHitboxGroups();
    let group = engineGroups.find(g => g.list && g.list.indexOf(eng) !== -1);
    if (!group) return false;

    let box = _engineBox(group, eng);
    let prospective = { x: nextX, y: nextY };

    for (let i = 0; i < battleEnvironment.units.length; i++) {
        let u = battleEnvironment.units[i];
        if (!u || u.hp <= 0) continue;
        let typeStr = String(u.type || u.unitType || u.role || "").toLowerCase();
        let isLarge = u.stats?.isLarge || u.isMounted || typeStr.match(/(cav|horse|camel|eleph|general|player|commander)/);
        if (!isLarge) continue;
        if (_pointInEngineBox(u.x, u.y, prospective, box)) return true;
    }
    return false;
}

// =========================================================
// SURGERY: UNSTICK LARGE UNITS FROM MOVING SIEGE ENGINES
// =========================================================
// isSiegeEngineBlocking only stops a unit from walking further INTO an
// engine — it can't help a unit that's already standing where the ram or
// siege tower's box just moved to (e.g. the ram retreating back over a
// general/horse who was pressed up against it). This runs every frame
// right after processSiegeEngines() AND again at the end of the frame
// (after crowd-collision math), and for any large/mounted unit whose
// position is now inside an active engine's box, shoves it straight back
// out along the shallowest overlap axis — the same direction the engine's
// edge is pushing from — so it's carried out of the way as the engine
// advances or withdraws instead of ending up trapped inside it.
//
// Runs a few resolution passes per call (not just one) so a unit pinned
// between two overlapping engine boxes (e.g. a ram and a tower parked
// close together at the breach) gets walked all the way clear instead of
// being resolved against one engine only to land inside the next.
// Snapshots each siege engine's x/y into _prevX/_prevY before it moves this
// frame, so resolveLargeUnitEngineOverlap can push overlapping units by the
// engine's actual per-frame movement vector rather than only edge-snapping.
function _snapshotEnginePrevPositions() {
    const engineGroups = getSiegeEngineHitboxGroups();
    for (let g = 0; g < engineGroups.length; g++) {
        let list = engineGroups[g].list;
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
            let eng = list[i];
            if (!eng) continue;
            eng._prevX = eng.x;
            eng._prevY = eng.y;
        }
    }
}

function resolveLargeUnitEngineOverlap() {
    if (typeof inSiegeBattle === 'undefined' || !inSiegeBattle) return;
    if (typeof battleEnvironment === 'undefined' || !battleEnvironment || !battleEnvironment.units) return;

    const engineGroups = getSiegeEngineHitboxGroups();
    if (!engineGroups.length) return;

    const PUSH_MARGIN = 6; // small buffer past the edge so it doesn't re-trigger next frame
    const MAX_PASSES = 4;  // enough to walk out of a two-engine pocket

    battleEnvironment.units.forEach(u => {
        if (!u || u.hp <= 0) return;

        let typeStr = String(u.type || u.unitType || u.role || "").toLowerCase();
        let isLarge = u.stats?.isLarge || u.isMounted || typeStr.match(/(cav|horse|camel|eleph|general|player|commander)/);
        if (!isLarge) return;

        for (let pass = 0; pass < MAX_PASSES; pass++) {
            let pushedThisPass = false;

            for (let g = 0; g < engineGroups.length; g++) {
                let group = engineGroups[g];
                if (!group.list || !group.list.length) continue;

                for (let i = 0; i < group.list.length; i++) {
                    let eng = group.list[i];
                    if (!eng || eng.hp <= 0) continue;

                    let box = _engineBox(group, eng);
                    let dx = u.x - eng.x;
                    let dy = u.y - eng.y;

                    let north = -(box.halfL + (box.frontExtra || 0));
                    let south = box.halfL;

                    let overlapX = box.halfW - Math.abs(dx);
                    // Vertical overlap against whichever edge (north/south) is closer
                    let overlapY = (dy >= 0) ? (south - dy) : (dy - north);

                    if (overlapX > 0 && overlapY > 0) {
                        // SURGERY: real "carried along" push — move the unit
                        // by the SAME vector the engine itself moved this
                        // frame, so it's visibly shoved out of the way in
                        // the engine's direction of travel (a ram retreating
                        // south pushes anyone in front of it further south;
                        // a tower advancing pushes whoever's in its path
                        // forward), instead of just teleport-snapping to the
                        // nearest edge.
                        let edx = (typeof eng._prevX === 'number') ? (eng.x - eng._prevX) : 0;
                        let edy = (typeof eng._prevY === 'number') ? (eng.y - eng._prevY) : 0;

                        if (edx !== 0 || edy !== 0) {
                            u.x += edx;
                            u.y += edy;
                            dx = u.x - eng.x;
                            dy = u.y - eng.y;
                            overlapX = box.halfW - Math.abs(dx);
                            overlapY = (dy >= 0) ? (south - dy) : (dy - north);
                        }

                        // Hard edge-snap safety net — handles whatever the
                        // carry-along didn't fully clear (engine moved less
                        // than the unit's penetration depth), and also
                        // catches embeds with no engine motion at all, e.g.
                        // a unit shoved in by crowd pressure elsewhere.
                        if (overlapX > 0 && overlapY > 0) {
                            if (overlapX < overlapY) {
                                let dir = dx >= 0 ? 1 : -1;
                                u.x = eng.x + dir * (box.halfW + PUSH_MARGIN);
                            } else {
                                let dir = dy >= 0 ? 1 : -1;
                                u.y = eng.y + dir * ((dir >= 0 ? south : -north) + PUSH_MARGIN);
                            }
                        }
                        // Kill momentum that would just drive them straight
                        // back in next frame.
                        if (typeof u.vx === 'number') u.vx = 0;
                        if (typeof u.vy === 'number') u.vy = 0;
                        pushedThisPass = true;
                    }
                }
            }

            if (!pushedThisPass) break; // fully clear of every engine — stop early
        }
    });
}

function isBattleCollision(x, y, onWall = false, unit = null) {
    let tx = Math.floor(x / BATTLE_TILE_SIZE);
    let ty = Math.floor(y / BATTLE_TILE_SIZE);

    if (tx < 0 || tx >= BATTLE_COLS || ty < 0 || ty >= BATTLE_ROWS) return true;

    let tile = (battleEnvironment.grid && battleEnvironment.grid[tx]) ? battleEnvironment.grid[tx][ty] : null;

    let isLarge = false;
    if (unit) {
        let typeStr = String(unit.type || unit.unitType || unit.role || "").toLowerCase();
        isLarge = unit.stats?.isLarge || unit.isMounted || typeStr.match(/(cav|horse|camel|eleph|general|player|commander)/);
    }

    // Large/mounted units (general, horses, elephants, camels) physically
    // collide with siege engines during a siege — checked before anything
    // else so it applies no matter what tile they're standing over (walls,
    // road, plaza, scaffold), and can never be skipped by a tile-based
    // exception below.
    if (isLarge && typeof inSiegeBattle !== 'undefined' && inSiegeBattle && isSiegeEngineBlocking(x, y)) {
        return true;
    }

if (inSiegeBattle) {
        // =========================================================
        // --- REVISED DEFENDER TERRAIN GUARD ---
        // =========================================================
        if (unit && unit.side === "enemy") {
            // EXPLICITLY BLOCK: Buildings(2), Trees(3), Water(4), Stone Wall(6), Tower Base(7)
            // This allows them to walk freely on Ground(0), Road(1), Plaza(5), and Scaffolds(8, 9, 10, 12)
            if (tile === 2 || tile === 3 || tile === 4 || tile === 6 || tile === 7) {
                return true; 
            }
        }
        // =========================================================
        
        // FIX: Changed LIGHT_WALL_ID from 5 to 99. 
        // Tile 5 is the City Plaza. If it is marked as a wall, units spawn trapped in the ground!
        const LIGHT_WALL_ID = 99; 
        
        const isSolidWall = (tile === 6 || tile === 7 || tile === LIGHT_WALL_ID);

        // 1. MOUNT/LARGE UNIT RESTRICTIONS
        // 1. MOUNT/LARGE UNIT RESTRICTIONS
        if (isLarge && (tile === 9 || tile === 12 || tile === 8 || tile === 10)) return true;

        // 2. LADDER LOCK (No horizontal sliding while climbing)
        if (unit) {
            let currentTx = Math.floor(unit.x / BATTLE_TILE_SIZE);
            let currentTy = Math.floor(unit.y / BATTLE_TILE_SIZE);
            let currentTile = (battleEnvironment.grid && battleEnvironment.grid[currentTx]) ? battleEnvironment.grid[currentTx][currentTy] : null;
            
            let isOnLadder = (currentTile === 9 || currentTile === 12 || unit.isClimbing);
            
            if (isOnLadder && x !== unit.x) return true;
        }

        // ---------------------------------------------------------
        // --- SURGERY 2: THE "GHOST FALL" UPGRADE ---
        // ---------------------------------------------------------
        if (unit && unit.isFalling) {
            // A falling unit must ghost through ALL architectural tiles.
            // If they hit the lighter wall on the way down, this ensures they pass 
            // straight through it instead of getting stuck mid-air.
            if (isSolidWall || tile === 8 || tile === 10) return false;
        }

        // 4. UNIVERSAL PASSABLE TILES
        if (tile === 9 || tile === 12 || tile === 13) return false;

// ---------------------------------------------------------
        // --- SURGERY 3: THE FLEEING EXCEPTION (WITH 5S TIMER) ---
        // ---------------------------------------------------------
        
        // ---> NEW: THE STUCK GHOST BYPASS <---
        if (unit && unit.ghostTimer > 0) {
            return false; // Collision ignored: Let them sink through the geometry!
        }

        // We hoist this to the top of the siege logic so it manages 
        // the transition from "blocked" to "ghosting."
        if (unit && (unit.isFleeing || unit.state === "routing" || unit.state === "fleeing")) {
            
            // 1. Initialize the timer if it doesn't exist yet
            if (unit.fleeCollisionTimer === undefined) {
                unit.fleeCollisionTimer = 0;
            }
            
            // 2. Increment every time the collision check runs
            unit.fleeCollisionTimer++;

            // 3. The 5-Second Gate (300 frames @ 60fps)
            // If they have been panicking for MORE than 5 seconds:
            if (unit.fleeCollisionTimer > 300) {
                return false; // Collision ignored: They finally scramble over the railing
            }
            
            // If they ARE fleeing but the timer is <= 300:
            // We DO NOT return false here. We let the code fall through 
            // to the 'return isSolidWall' logic below so they stay stuck.
            
        } else if (unit) {
            // Safety: Reset the timer if the unit recovers or isn't fleeing
            unit.fleeCollisionTimer = 0;
        }

        // --- Standard Siege Blocking (Active for non-fleeing or early-fleeing units) ---
        if (onWall) {
            // Normal units and "early" fleeing units are blocked by Tiles 6, 7, and Faction Walls
            return isSolidWall;
        } else {
            // While ON the ground:
            if (unit && unit.ignoreCollisionTicks > 0) {
                return isSolidWall; 
            }
            // Standard ground blocking
            return tile === 2 || tile === 3 || tile === 4 || isSolidWall;
        }
    }
    
// --- NAVAL BATTLES ---
    if (window.inNavalBattle) {
        // Tile 0 = ship deck — always walkable
        if (tile === 0) return false;

		if (tile === 8) return false;   // all units treated equally at the hull rail; physics damping handles slowdown

        // Tile 11 = open ocean — NOT a hard collision.
        //   The unit transitions to swimming in updateNavalPhysics on the same frame.
        if (tile === 11) return false;

        // Tile 4 = water (defensive guard; shouldn't appear on a naval grid)
        if (tile === 4) return false;

        // Anything else (null, undefined, boarding plank gap) — passable
        return false;
    }

    // --- STANDARD FIELD BATTLES ---
    if (unit && unit.ignoreCollisionTicks > 0) {
        if (tile === 3 || tile === 6 || tile === 7) return false;
    }

    return tile === 6;
	
}

// Add 'seed' as a third parameter
function drawStuckProjectileOrEffect(ctx, type, seed = 0) {
// Adding 1.1 ensures seed 0 doesn't result in sin(0)
    let rand = Math.abs(Math.sin((seed + 1.1) * 12.9898) * 43758.5453) % 1;

if (type === "javelin") {
    if (rand < 0.60) {
        ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(4, 0); ctx.stroke(); 
    } else if (rand < 0.80) {
        ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-2, 0); ctx.stroke(); 
        ctx.save(); ctx.translate(-1, 3); ctx.rotate(0.5);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(8, 0); ctx.stroke();
        ctx.fillStyle = "#bdbdbd"; ctx.beginPath();
        ctx.moveTo(8, 0); ctx.lineTo(7.33, -0.83); ctx.lineTo(10.67, 0); ctx.lineTo(7.33, 0.83); ctx.fill();
        ctx.restore();
    } else {
        ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(8, 0); ctx.stroke();
        ctx.fillStyle = "#bdbdbd"; ctx.beginPath();
  ctx.moveTo(8, 0); ctx.lineTo(7.33, -0.83); ctx.lineTo(10.67, 0); ctx.lineTo(7.33, 0.83); ctx.fill();
    }
}
	
	
	else if (type === "bolt") {
        if (rand < 0.60) {
            ctx.fillStyle = "#5d4037"; ctx.fillRect(-4, -1, 6, 2); 
            ctx.fillStyle = "#8d6e63"; ctx.fillRect(-5, -1.5, 3, 3);
        } else if (rand < 0.80) {
            ctx.fillStyle = "#5d4037"; ctx.fillRect(-4, -1, 4, 2); 
            ctx.fillStyle = "#8d6e63"; ctx.fillRect(-5, -1.5, 3, 3);
            ctx.save(); ctx.translate(1, 2); ctx.rotate(0.4);
            ctx.fillStyle = "#5d4037"; ctx.fillRect(0, -1, 4, 2);
            ctx.fillStyle = "#757575"; ctx.beginPath(); ctx.moveTo(4, -2); ctx.lineTo(9, 0); ctx.lineTo(4, 2); ctx.fill();
            ctx.restore();
        } else {
            ctx.fillStyle = "#5d4037"; ctx.fillRect(-4, -1, 8, 2);
            ctx.fillStyle = "#757575"; ctx.beginPath(); ctx.moveTo(4, -2); ctx.lineTo(9, 0); ctx.lineTo(4, 2); ctx.fill();
            ctx.fillStyle = "#8d6e63"; ctx.fillRect(-5, -1.5, 3, 3);
        }
    } else if (type === "stone") {
        if (rand < 0.70) {
            ctx.fillStyle = "#9e9e9e"; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#bdbdbd"; ctx.beginPath(); ctx.arc(-0.8, -0.8, 1, 0, Math.PI * 2); ctx.fill();
        } else if (rand < 0.90) {
            ctx.fillStyle = "#9e9e9e"; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#424242"; ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(-1.5, -1.5); ctx.lineTo(1, 1); ctx.moveTo(0, 0); ctx.lineTo(1.8, -0.5); ctx.stroke();
        } else {
            ctx.fillStyle = "#757575"; 
            ctx.beginPath(); ctx.arc(-1.5, 1, 1.2, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(1.5, -0.5, 1, 0, Math.PI * 2); ctx.fill();
            ctx.fillRect(0, 2, 1, 1); ctx.fillRect(-2, -2, 1.2, 1.2);
        }
} else if (type === "rocket") {
        ctx.scale(0.5, 0.5); // Scaled down for sticking
        
        if (rand < 0.45) {
            // 45% Chance: Stuck in ground (Head & Tube buried)
            // Bamboo tube and arrowhead are underground, only the long shaft is visible
            ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 0.6; 
            ctx.beginPath(); ctx.moveTo(-28, 0); ctx.lineTo(-4, 0); ctx.stroke();
        } else if (rand < 0.80) {
            // 35% Chance: Intact / Bounced (Tube & Shaft attached)
            // The full assembly survived the impact
            ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 0.6; 
            ctx.beginPath(); ctx.moveTo(-28, 0); ctx.lineTo(12, 0); ctx.stroke();
            ctx.fillStyle = "#4e342e"; ctx.fillRect(-6, 0.5, 14, 2.2); // Bamboo Tube
            ctx.fillStyle = "#424242"; ctx.beginPath(); // Arrowhead
            ctx.moveTo(12, -1.2); ctx.lineTo(20, 0); ctx.lineTo(12, 1.2); ctx.fill();
        } else if (rand < 0.95) {
            // 15% Chance: Headless Shaft (Tube intact, Arrowhead snapped off)
            // Common in impact; the heavy metal tip breaks off but the tube stays tied
            ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 0.6; 
            ctx.beginPath(); ctx.moveTo(-28, 0); ctx.lineTo(12, 0); ctx.stroke();
            ctx.fillStyle = "#4e342e"; ctx.fillRect(-6, 0.5, 14, 2.2); // Tube remains
        } else {
            // 5% Chance: EXTREMELY RARE (Tube propeller break/separation)
            // The bindings failed and the bamboo tube snapped away from the shaft
            ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 0.6;
            ctx.beginPath(); ctx.moveTo(-28, 0); ctx.lineTo(12, 0); ctx.stroke(); // Bare shaft
            
            ctx.save(); // The propellant tube lying nearby
            ctx.translate(5, 4);
            ctx.rotate(0.8);
            ctx.fillStyle = "#4e342e"; ctx.fillRect(0, 0, 14, 2.2);
            ctx.fillStyle = "#424242"; ctx.beginPath(); 
            ctx.moveTo(14, -1.2); ctx.lineTo(20, 1.1); ctx.lineTo(14, 3.4); ctx.fill();
            ctx.restore();
        }
        
        ctx.scale(2, 2); // Reset scale
} else if (type === "bomb_crater") {
        if (rand < 0.25) {
            // 25% Chance: Heavy Deep Crater (Layered soot + internal debris)
            ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
            ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "rgba(30, 20, 10, 0.5)"; // Earthy undertone
            ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#212121";
            for(let i=0; i<8; i++) {
                let r = 6 + (Math.sin(i + seed) * 6);
                ctx.fillRect(Math.cos(i) * r, Math.sin(i) * r, 2.5, 2.5);
            }
        } else if (rand < 0.45) {
            // 20% Chance: Starburst Scorch (Flash burn with thin radiating lines)
            ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
            ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "rgba(0, 0, 0, 0.6)"; ctx.lineWidth = 0.8;
            for(let i=0; i<12; i++) {
                let angle = (i / 12) * Math.PI * 2 + seed;
                let len = 10 + (Math.cos(i * seed) * 5);
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len); ctx.stroke();
            }
        } else if (rand < 0.65) {
            // 20% Chance: Debris Field (Small central mark with wide shrapnel)
            ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
            ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#424242";
            for(let i=0; i<10; i++) {
                let offX = Math.sin(i * seed) * 15;
                let offY = Math.cos(i * seed) * 15;
                let size = 1 + (Math.abs(Math.sin(i)) * 2);
                ctx.fillRect(offX, offY, size, size);
            }
        } else if (rand < 0.80) {
            // 15% Chance: Skidding/Directional Blast (Elongated oval)
            ctx.save();
            ctx.rotate(seed % Math.PI); // Random orientation
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
            ctx.beginPath(); ctx.ellipse(0, 0, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
            ctx.beginPath(); ctx.ellipse(-4, 0, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        } else if (rand < 0.92) {
            // 12% Chance: Double Impact (Two overlapping small craters)
            for(let i=0; i<2; i++) {
                let offX = (i === 0) ? -4 : 4;
                let offY = (i === 0) ? -2 : 3;
                ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
                ctx.beginPath(); ctx.arc(offX, offY, 7, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = "#1a1a1a";
                ctx.fillRect(offX, offY, 2, 2);
            }
        } else {
            // 8% Chance: "Dud" or Shallow Thud (Faint grey ring)
            ctx.strokeStyle = "rgba(60, 60, 60, 0.4)";
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
            ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
        }
		
} else if (type === "scorch_wall") {
        // Firelance / fire projectile scorch streak burned into a stone or wood surface
        // Uses the impact angle stored in the effect's angle field
        let sLen = 10 + rand * 12;
        let sWid = 3 + rand * 4;

        // Outer glow (hot ember fade)
        let sg = ctx.createLinearGradient(0, 0, sLen, 0);
        sg.addColorStop(0, "rgba(255,160,30,0.55)");
        sg.addColorStop(0.4, "rgba(200,60,0,0.35)");
        sg.addColorStop(1, "rgba(30,30,30,0)");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.ellipse(sLen * 0.4, 0, sLen * 0.5, sWid * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Charred core
        ctx.fillStyle = "rgba(10,6,0,0.80)";
        ctx.beginPath();
        ctx.ellipse(sLen * 0.25, 0, sLen * 0.28, sWid * 0.30, 0, 0, Math.PI * 2);
        ctx.fill();

        // Ember flecks
        ctx.fillStyle = "rgba(255,120,20,0.60)";
        for (let ei = 0; ei < 3; ei++) {
            let ex = (rand * 7 + ei * 5) % (sLen * 0.6);
            let ey = (Math.sin(rand * 9 + ei) * sWid * 0.4);
            ctx.beginPath(); ctx.arc(ex, ey, 0.9 + rand, 0, Math.PI * 2); ctx.fill();
        }
    } else { // arrow
        if (rand < 0.60) {
            ctx.fillStyle = "#8d6e63"; ctx.fillRect(-6, -0.5, 8, 1); 
            ctx.fillStyle = "#4caf50"; ctx.fillRect(-7, -1.5, 4, 1); ctx.fillRect(-7, 0.5, 4, 1);
        } else if (rand < 0.80) {
            ctx.fillStyle = "#8d6e63"; ctx.fillRect(-6, -0.5, 5, 1); 
            ctx.fillStyle = "#4caf50"; ctx.fillRect(-7, -1.5, 4, 1); ctx.fillRect(-7, 0.5, 4, 1);
            ctx.save(); ctx.translate(0, 2); ctx.rotate(0.6);
            ctx.fillStyle = "#8d6e63"; ctx.fillRect(0, -0.5, 6, 1);
            ctx.fillStyle = "#9e9e9e"; ctx.beginPath(); ctx.moveTo(6, -1.5); ctx.lineTo(11, 0); ctx.lineTo(6, 1.5); ctx.fill();
            ctx.restore();
        } else {
            ctx.fillStyle = "#8d6e63"; ctx.fillRect(-6, -0.5, 12, 1);
            ctx.fillStyle = "#9e9e9e"; ctx.beginPath(); ctx.moveTo(6, -1.5); ctx.lineTo(11, 0); ctx.lineTo(6, 1.5); ctx.fill();
            ctx.fillStyle = "#4caf50"; ctx.fillRect(-7, -1.5, 4, 1); ctx.fillRect(-7, 0.5, 4, 1);
        }
    }
}
function leaveBattlefield(playerObj) {
	// --- SURVIVAL MODE GUARD ---
	// Survival Mode temporarily overrides window.leaveBattlefield with its own
	// exit handler, but other files (leave_battle_roster.js's wrapper, or any
	// future caller) can still reach this ORIGINAL function via a bare
	// `leaveBattlefield(...)` identifier call, bypassing that override. This
	// codebase has hit that exact bare-identifier bypass before (see the
	// P-key exit handler fix in sandboxmode_update.js). Rather than trust
	// every call site to route through window.leaveBattlefield, refuse to run
	// the campaign exit/summary flow here directly whenever a Survival wave
	// is active, and hand off to Survival's own (safe) exit handling instead.
	if (typeof window !== 'undefined' && window.__IS_SURVIVAL_BATTLE__) {
		if (typeof window.__survivalForcedExit === 'function') {
			window.__survivalForcedExit();
		}
		return;
	}
	// Force immediate GPU memory release
if (battleEnvironment.bgCanvas) {
    battleEnvironment.bgCanvas.width = 0;
    battleEnvironment.bgCanvas.height = 0;
    battleEnvironment.bgCanvas = null;
}
if (battleEnvironment.fgCanvas) {
    battleEnvironment.fgCanvas.width = 0;
    battleEnvironment.fgCanvas.height = 0;
    battleEnvironment.fgCanvas = null; // FIX: was nulling bgCanvas again (copy-paste typo) — fgCanvas itself was never cleared here
}
if (battleEnvironment.treeFrontCanvas) {
    battleEnvironment.treeFrontCanvas.width = 0;
    battleEnvironment.treeFrontCanvas.height = 0;
    battleEnvironment.treeFrontCanvas = null;
}

	
console.log("Leaving battlefield. Restoring overworld state...");
// --- ADD THIS LINE TO SHUT DOWN THE ENEMY GENERAL ---
    if (typeof EnemyTacticalAI !== 'undefined') EnemyTacticalAI.stop();
    // Mirror: shut down the player-side Lazy General AI heartbeat too (covers
    // the custom-battle path, which calls this original function directly).
    if (typeof stopLazyGeneral === 'function') stopLazyGeneral();
    if (typeof cleanupSiegeRoofOverlay === 'function') cleanupSiegeRoofOverlay();
    
    // ADD THIS:
    if (typeof cleanupNavalSailCanvas === 'function') cleanupNavalSailCanvas();

    // FIX: navalEnvironment.mapSeed was never cleared on leave, so
    // generateNavalMap()'s fallback chain (battleEnvironment.mapSeed ??
    // navalEnvironment.mapSeed ?? Date.now()) kept reusing the very first
    // naval battle's seed for every naval battle afterward in the session —
    // identical coastline every time. Clear it here so the campaign/story
    // naval exit path also gets a fresh seed next battle (mirrors the same
    // fix in custom_naval_launcher.js's cleanupCustomBattleEnvironments).
    if (typeof navalEnvironment !== 'undefined' && navalEnvironment) {
        navalEnvironment.mapSeed = null;
    }

    window.pendingSallyOut = false;
    window.inParleMode = false;
if (typeof player !== 'undefined') player.stunTimer = 0;

    // --- 1. THE MODE SWITCH (CRITICAL FIX) ---
    inBattleMode = false; 
    if (typeof inSiegeBattle !== 'undefined') inSiegeBattle = false; // Reset Siege state

    // --- 2. EMERGENCY COORDINATE & CAMERA RESTORATION ---
    if (playerObj && savedWorldPlayerState_Battle) {
        if (savedWorldPlayerState_Battle.x !== 0 && savedWorldPlayerState_Battle.y !== 0) {
            playerObj.x = savedWorldPlayerState_Battle.x;
            playerObj.y = savedWorldPlayerState_Battle.y;
        }
    }

    // Update camera immediately so the map isn't showing 0,0 for one frame
    if (typeof camera !== 'undefined') {
        camera.x = playerObj.x - canvas.width / 2;
        camera.y = playerObj.y - canvas.height / 2;
    }

    // --- 3. CALCULATE BATTLE RESULTS ---
    let pUnitsAlive = battleEnvironment.units.filter(u => u.side === "player" && !u.isCommander && u.hp > 0).length;
    let eUnitsAlive = battleEnvironment.units.filter(u => u.side === "enemy" && !u.isCommander && u.hp > 0).length;

    // ── FIX: Use trueInitialCounts (full pre-battle army) and initialCounts
    // (deployed count ≤ 150, set by leave_battle_roster.js) to correctly map
    // battlefield survivors back to real-army casualties.
    //
    // Old code used initialCounts (always 0 for sandbox battles) with a
    // hardcoded scale guess — giving 0 casualties every time.
    //
    // The correct math:
    //   survivalRatio = fieldSurvivors / deployedCount          (0..1)
    //   trueSurvivors = round( fullArmy × survivalRatio ) + reserves
    //   lost          = fullArmy - trueSurvivors
    //
    // This preserves proportionality regardless of whether the 150-cap or
    // GLOBAL_BATTLE_SCALE reduced the on-field count.
    const _ic  = (currentBattleData && currentBattleData.initialCounts)      || { player: 0, enemy: 0 };
    const _tic = (currentBattleData && currentBattleData.trueInitialCounts)   || { player: 0, enemy: 0 };

    // Full army that entered battle (trueInitialCounts is set by leave_battle_roster deployArmy)
    const _pTrueInit = _tic.player || _ic.player || 0;
    const _eTrueInit = _tic.enemy  || _ic.enemy  || 0;

    // Units actually spawned on the field (initialCounts is now set by leave_battle_roster deployArmy)
    const _pDeployed = _ic.player || Math.min(_pTrueInit, 150);
    const _eDeployed = _ic.enemy  || Math.min(_eTrueInit, 150);

    // Reserves that sat out the battle (should survive intact)
    const _pReserves = (typeof player !== 'undefined' && player.reserveRoster)
        ? player.reserveRoster.length : 0;
    const _eReserves = (currentBattleData && currentBattleData.enemyRef && currentBattleData.enemyRef.reserveRoster)
        ? currentBattleData.enemyRef.reserveRoster.length : 0;

    // Map field survivors back to the full-army scale
    const _pSurvRatio = _pDeployed > 0 ? pUnitsAlive / _pDeployed : 0;
    const _eSurvRatio = _eDeployed > 0 ? eUnitsAlive / _eDeployed : 0;
    const _pTrueSurv  = Math.round(_pTrueInit * _pSurvRatio) + _pReserves;
    const _eTrueSurv  = Math.round(_eTrueInit * _eSurvRatio) + _eReserves;

    let playerLost = Math.max(0, _pTrueInit - _pTrueSurv);
    let enemyLost  = Math.max(0, _eTrueInit - _eTrueSurv);

    let isFleeing = eUnitsAlive > 0;
    let didPlayerWin = !isFleeing;

    // Apply Overworld Consequences
    playerObj.troops = Math.max(0, (playerObj.troops || 0) - playerLost);

    if (currentBattleData.enemyRef) {
        let overworldNPC = currentBattleData.enemyRef;
        overworldNPC.count -= enemyLost;
        if (overworldNPC.count <= 0 || !isFleeing) {
            overworldNPC.count = 0; 
            overworldNPC.isDead = true; 
        } else {
            let escapeAngle = Math.random() * Math.PI * 2;
            overworldNPC.x += Math.cos(escapeAngle) * 50; 
            overworldNPC.y += Math.sin(escapeAngle) * 50;
            overworldNPC.waitTimer = 0;
            overworldNPC.isMoving = true;
            overworldNPC.targetX = overworldNPC.x + Math.cos(escapeAngle) * 200;
            overworldNPC.targetY = overworldNPC.y + Math.sin(escapeAngle) * 200;
        }
    }

    if (playerObj.hp <= 0) {
        playerObj.hp = playerObj.maxHealth; 
    }

    // --- 4. CONDITIONAL UI BRANCH (THE SIEGE FIX) ---
    // Instead of always showing the summary, we check if you were in a siege
    if (playerObj.isSieging && typeof restoreSiegeAfterBattle === 'function') {
        // This triggers the specific Siege Pause GUI we built
        restoreSiegeAfterBattle(didPlayerWin);
    } else if (typeof createBattleSummaryUI === 'function') {
        // Standard battle summary for non-siege fights
        createBattleSummaryUI(isFleeing ? "Retreat!" : "Victory!", playerLost, enemyLost);
    }

// --- 5. CLEANUP ---
    currentBattleData = null; 
    battleEnvironment.units = []; 
    battleEnvironment.projectiles = [];
	// ADD THIS LINE TO CLEAR CRATERS, STUCK ARROWS, AND SCORCH MARKS
	battleEnvironment.groundEffects = []; 
    battleEnvironment.cityGates = []; // <-- FIX: Wipe gates from memory
   // window.cityTowerPositions = [];   // <-- FIX: Wipe towers from memory
    
    // Safety wipe for any lingering siege engines
    if (typeof siegeEquipment !== 'undefined') {
        siegeEquipment.ladders = [];
        siegeEquipment.rams = [];
        siegeEquipment.trebuchets = [];
        siegeEquipment.ballistas = [];
    }
	lastBattleTime = Date.now();
// ---> SURGERY: Init audio and pass your MP3s to the playlist shuffler
    AudioManager.init();
    
    // Make sure these paths match where your audio files are stored in your project!
const overworldTracks = [
    'music/gameloop1.mp3',
    'music/gameloop2.mp3',
    'music/gameloop3.mp3'
];
    AudioManager.playRandomMP3List(overworldTracks);
	console.log("World Map Resumed at: ", playerObj.x, playerObj.y);
}

function createBattleSummaryUI(title, pLost, eLost) {
	// Survival Mode never uses this popup (it has its own Day-Held / Line-
	// Fallen screens). Belt-and-braces guard in case something still reaches
	// this function directly during a Survival wave.
	if (typeof window !== 'undefined' && window.__IS_SURVIVAL_BATTLE__) return;

    const summaryDiv = document.createElement('div');
	
	// ---> PASTE HERE <---
    if (title === "Victory!") {
        AudioManager.playMusic("Victory");
    } else {
        AudioManager.playMusic("Defeat");
    }
	
    summaryDiv.id = 'battle-summary';
    summaryDiv.style.cssText = `
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: linear-gradient(to bottom, rgba(50, 10, 10, 0.95), rgba(20, 5, 5, 0.98));
        color: #f5d76e; padding: 30px; border: 2px solid #b71c1c; border-radius: 8px;
        text-align: center; z-index: 1000; font-family: 'Georgia', serif; min-width: 300px;
        box-shadow: 0 10px 40px rgba(0,0,0,1);
    `;
    
    summaryDiv.innerHTML = `
        <h2 style="color: ${title === "Victory!" ? "#ffca28" : "#d32f2f"}; font-size: 2.5rem; margin: 0 0 15px 0; text-shadow: 2px 2px 4px #000;">${title}</h2>
        <div style="font-size: 1.2rem; color: #fff; margin-bottom: 10px;">Our Casualties: <span style="color: #f44336;">${Math.max(0, pLost)}</span></div>
        <div style="font-size: 1.2rem; color: #fff; margin-bottom: 25px;">Enemy Casualties: <span style="color: #4caf50;">${Math.max(0, eLost)}</span></div>
        <button id="close-summary-btn" style="
            background: linear-gradient(to bottom, #7b1a1a, #4a0a0a); color: #f5d76e; 
            border: 1px solid #d4b886; padding: 10px 20px; font-weight: bold; cursor: pointer; text-transform: uppercase;">
            Return to World Map
        </button>
    `;
    
    document.body.appendChild(summaryDiv);
    document.getElementById('close-summary-btn').onclick = () => {
        summaryDiv.remove();
    };
}

function drawSupplyLines(ctx, x, y, factionColor, camera) {
    // SURGERY: baggage train is now an irregular ring around the anchor
    // point (was a straight line: x + i*85, y), camp-style, per direct
    // request — and deliberately NEVER a perfect circle. Angle/radius
    // jitter is a fixed function of the wagon index i, not Math.random():
    // this function runs fresh every draw call with no persisted
    // per-wagon state, so live-random jitter would make the ring visibly
    // vibrate every single frame instead of sitting still. The anchor
    // (x, y) itself is computed by the caller (troop_draw.js) — this
    // function only shapes the ring around whatever point it's given.
    const WAGON_COUNT = 5;
    const BASE_RADIUS = 95;
    for (let i = 0; i < WAGON_COUNT; i++) {
        // Deterministic pseudo-jitter unique per wagon slot — never a
        // clean 1/5th-circle grid, so the ring reads as an irregular
        // camp cluster rather than a geometric circle.
        const angleJitter  = Math.sin(i * 12.9898) * 0.5;             // ± ~0.5 rad
        const radiusJitter = Math.sin(i * 78.233 + 1) * 0.5 + 0.5;    // 0..1
        const angle  = (i / WAGON_COUNT) * Math.PI * 2 + angleJitter;
        const radius = BASE_RADIUS * (0.7 + radiusJitter * 0.6);      // ~0.7x-1.3x
        const wx = x + Math.cos(angle) * radius;
        const wy = y + Math.sin(angle) * radius;
        drawDetailedChineseWagon(ctx, wx - camera.x, wy - camera.y, factionColor);
    }
}

function gainPlayerExperience(amount) {
    // 1. Safety check for Level Cap
    if ((player.experienceLevel || 1) >= 20) return;

    // 2. Add XP with safety check for undefined
    player.experience = (player.experience || 0) + (amount*20);
    
    // 3. Calculate dynamic requirement
    let expNeeded = (player.experienceLevel || 1) * 10.0; 

    // 4. The Loop (Handles multi-leveling and carry-over)
    while (player.experience >= expNeeded && (player.experienceLevel || 1) < 20) {
        player.experience -= expNeeded;
        player.experienceLevel = (player.experienceLevel || 1) + 1;
        
        // Permanent stat boosts
        player.meleeAttack = (player.meleeAttack || 10) + 3;
        player.meleeDefense = (player.meleeDefense || 10) + 3;
        player.maxHealth = (player.maxHealth || 100) + 15;
        player.hp = player.maxHealth; // Full heal reward
        
        console.log(`%c LEVEL UP: You are now Level ${player.experienceLevel}!`, "color: #ffca28; font-weight: bold;");
        
        // Update requirement for the NEXT level in the loop
        expNeeded = player.experienceLevel * 10.0;
    }
}


function handleUnitDeath(unit) {
    if (unit.isDeadProcessed) return;

    unit.isDeadProcessed = true;
    unit.deathTime = Date.now();
    unit.state = "dead";
    unit.target = null;
    unit.hasOrders = false;

    // SURVIVAL: looting bodies. Enemy corpses have a chance to drop food/gold,
    // tallied by survivalMode.js into that day's report. Fully guarded — a
    // no-op in every other game mode, and no-op if the roster fns aren't there.
    if (window.__IS_SURVIVAL_BATTLE__ && unit.side === "enemy" &&
        window.SurvivalRun && typeof window.SurvivalRun.registerLoot === "function") {
        window.SurvivalRun.registerLoot(unit);
    }
    
    // 1. Randomize body position & rotation
    unit.deathRotation = Math.random() * Math.PI * 2; 
    unit.deathFlip = Math.random() > 0.5 ? 1 : -1;

    // Add a slight "tumble" offset so they don't land perfectly on the grid
    unit.deathXOffset = (Math.random() - 0.5) * 8; 
    unit.deathYOffset = (Math.random() - 0.5) * 8;

// 2. Pre-calculate unique blood pool stats
// This prevents the blood from "flickering" or changing shape every frame

const tx = Math.floor(unit.x / BATTLE_TILE_SIZE);
const ty = Math.floor(unit.y / BATTLE_TILE_SIZE);
const tile = battleEnvironment?.grid?.[tx]?.[ty];

// only make blood on non-water tiles
const isNotWaterTile = tile !== 4 && tile !== 8 && tile !== 11;

if (isNotWaterTile) {
    unit.bloodStats = {
        radiusX: 8 + Math.random() * 8,
        radiusY: 4 + Math.random() * 4,
        rotation: Math.random() * Math.PI,
        opacity: 0.4 + Math.random() * 0.3
    };
}}

function drawBloodPool(ctx, unit) {
    if (!unit.bloodStats) return;

    const stats = unit.bloodStats;
    ctx.save();
    
    // Position blood under the slightly offset body
    ctx.translate(unit.x + unit.deathXOffset, unit.y + unit.deathYOffset);
    
    // Use the unique pre-calculated stats for this specific death
    ctx.fillStyle = `rgba(100, 0, 0, ${stats.opacity})`; 
    ctx.beginPath();
    
// Draw the randomized ellipse with 20% randomness
const randomFactorX = 1.4 + Math.random() * 0.04;  
const randomFactorY = 1.4 + Math.random() * 0.04;  

ctx.ellipse(
    0, 0, 
    stats.radiusX * randomFactorX, 
    stats.radiusY * randomFactorY, 
    stats.rotation, 
    0, Math.PI * 2
);
    
    ctx.fill();
    ctx.restore();
}


function updateCasualtyMoralePressure(units, currentBattleData) {
    if (!Array.isArray(units) || !currentBattleData || !currentBattleData.initialCounts) return;

    // ── FIX: initialCounts now holds the DEPLOYED count (≤150) set by
    // leave_battle_roster.js deployArmy after the 150-cap slice.
    // Comparing live unit counts against the deployed baseline gives an
    // accurate loss percentage.  Fall back to trueInitialCounts / scale
    // for any edge case where initialCounts was not populated yet.
    const _mcScale = window.GLOBAL_BATTLE_SCALE || 1;
    const pStart = Math.max(1,
        currentBattleData.initialCounts.player ||
        Math.round(((currentBattleData.trueInitialCounts && currentBattleData.trueInitialCounts.player) || 0) / _mcScale)
    );
    const eStart = Math.max(1,
        currentBattleData.initialCounts.enemy  ||
        Math.round(((currentBattleData.trueInitialCounts && currentBattleData.trueInitialCounts.enemy)  || 0) / _mcScale)
    );

    const pAlive = units.filter(u => u && u.side === "player" && u.hp > 0 && !u.isCommander).length;
    const eAlive = units.filter(u => u && u.side === "enemy" && u.hp > 0 && !u.isCommander).length;

    const pLostPct = 1 - (pAlive / pStart);
    const eLostPct = 1 - (eAlive / eStart);

    applyCasualtyPressureToSide(units, "player", pLostPct);
    applyCasualtyPressureToSide(units, "enemy", eLostPct);
}

function applyCasualtyPressureToSide(units, side, casualtyPct) {
    let moraleMultiplier = 1;
    let panicLock = false;

    if (casualtyPct >= 0.80) {
        moraleMultiplier = 13.0;
        panicLock = true;
    } else if (casualtyPct >= 0.55) {
        moraleMultiplier = 5.0;
    } else if (casualtyPct >= 0.30) {
        moraleMultiplier = 1.2;
    }

    units.forEach(u => {
        if (!u || u.side !== side || u.hp <= 0) return;

        // put flags on the unit
        u.casualtyMoraleMultiplier = moraleMultiplier;
        u.forcePanicFromCasualties = panicLock;
        u.casualtyMoralePct = casualtyPct;

        // also put flags on stats in case morale logic reads there
        if (u.stats) {
            u.stats.casualtyMoraleMultiplier = moraleMultiplier;
            u.stats.forcePanicFromCasualties = panicLock;
            u.stats.casualtyMoralePct = casualtyPct;
        }

        // keep morale fields in sync if one of them exists
        if (u.stats && typeof u.stats.morale !== "number" && typeof u.morale === "number") {
            u.stats.morale = u.morale;
        } else if (typeof u.morale !== "number" && u.stats && typeof u.stats.morale === "number") {
            u.morale = u.stats.morale;
        }
    });
}

// =========================================================
// SIEGE MERCY RULE: Quick-kill overwhelmed enemy stragglers
// =========================================================
// Siege-only. Once the enemy is down to a token remnant (< 5 living
// non-commander troops) while the player still fields a large force
// (> 10 living non-commander troops), drain HP off every living enemy
// unit each frame — INCLUDING the enemy general/commander — so the
// last few holdouts die off quickly instead of dragging the siege out.
// Counts intentionally exclude commanders (matches updateCasualtyMoralePressure's
// convention above); the drain itself intentionally includes the enemy
// commander so a lone surviving general can't stall the battle forever.
function applySiegeMercyDrain(units) {
    if (typeof inSiegeBattle === 'undefined' || !inSiegeBattle) return;
    if (!Array.isArray(units)) return;

    const pAlive = units.filter(u => u && u.side === "player" && u.hp > 0 && !u.isCommander).length;
    const eAliveTroops = units.filter(u => u && u.side === "enemy" && u.hp > 0 && !u.isCommander).length;

    if (pAlive > 10 && eAliveTroops < 5) {
        // ~1% of max HP per frame -> roughly 1.5-2s to kill a full-health
        // unit at 60fps, regardless of that unit's max HP total, and faster
        // still for anyone already wounded coming into the mercy window.
        const DRAIN_RATE = 0.012;

        units.forEach(u => {
            if (!u || u.side !== "enemy" || u.hp <= 0) return;
            let maxHp = (u.stats && u.stats.health) || u.maxHp || u.hp;
            u.hp -= Math.max(1, maxHp * DRAIN_RATE);
        });
    }
}

function updateRiverPhysics() {
    // Prevent River Physics from erasing Naval Physics
    if (window.inNavalBattle) return;
    if (!battleEnvironment || !battleEnvironment.units) return;

    battleEnvironment.units.forEach(unit => {
        if (unit.hp <= 0) return;

        let tx = Math.floor(unit.x / BATTLE_TILE_SIZE);
        let ty = Math.floor(unit.y / BATTLE_TILE_SIZE);

        // Safely clamp to prevent errors at the edges of the map
        tx = Math.max(0, Math.min(BATTLE_COLS - 1, tx));
        ty = Math.max(0, Math.min(BATTLE_ROWS - 1, ty));

        // Tile 4 is deep water. Tile 7 is mud (land speed). Tile 0 is grass (land speed).
        let inWater = (battleEnvironment.grid[tx] && battleEnvironment.grid[tx][ty] === 4);

        if (inWater) {
            unit.overboardTimer = (unit.overboardTimer || 0) + 1;
            unit.isSwimming = true;

            // Apply a single, balanced friction penalty for water wading
            unit.vx *= 0.45;
            unit.vy *= 0.45;

            if (!unit.drownTimer) unit.drownTimer = 0;

let drownThreshold = Math.max(150, 1500 - ((unit.stats.weightTier || 1) * 250) - (unit.stats.mass || 10));
 
                drownThreshold *= 10;
 
            unit.drownTimer++;

            if (unit.drownTimer > drownThreshold) {
                if (unit.hp > 0) {
                    unit.hp = 0;
                    unit.state = "dead";
                    unit.target = null;
                    unit.hasOrders = false;
                    unit.isSwimming = false;
                    unit.overboardTimer = 0;

                    if (typeof handleUnitDeath === 'function') {
                        handleUnitDeath(unit);
                    }

                    if (typeof logGameEvent === 'function') {
                        logGameEvent(`${unit.unitType || 'A unit'} drowned in the river!`, "danger");
                    }
                }
            }
        } else {
            // Instantly restore normal movement when hitting land
			// ---> ADD THIS BLOCK <---
            if (unit.isSwimming && typeof BattleAudio !== 'undefined') {
                BattleAudio.playWaterSplash(unit.x, unit.y, false);
            }
            // ------------------------
			
            unit.overboardTimer = 0;
            unit.isSwimming = false;
            if (unit.drownTimer > 0) unit.drownTimer -= 2;
        }
    });
}

/**
 * Call this every frame for every active unit.
 * Assuming your game runs at roughly 60 FPS.
 */
function handleStuckPrevention(unit, FPS = 60) {
    // ═══════════════════════════════════════════════════════════════════════════
    // ★ v4.2.3 FIX: SIEGE-ONLY STUCK PREVENTION
    // ═══════════════════════════════════════════════════════════════════════════
    // This system was designed to unstick units wedged in wall geometry or
    // ladder tile seams during sieges.  In LAND, RIVER, and NAVAL battles there
    // is no terrain that can wedge units, so this system has no legitimate work
    // to do — but its ghost-mode side effect (unit.y += 1.5 every frame while
    // ghostTimer > 0) was firing on enemy units that were intentionally holding
    // still during the FORMING phase of EnemyTacticalAI, pushing them south
    // without leg animation (state stays "moving"/"idle", not driven through
    // the proper animator).  Symptom: "enemies slide south in stages with no
    // leg animation".
    //
    // ALSO GATE: Never trigger on units whose orderType is "hold_position".
    // A unit told to hold should be allowed to stand still without being
    // labeled "stuck" — this was the root cause of the regression once BLS
    // started placing enemy formations and locking them with orderHold.
    //
    // Pre-deploy is already short-circuited by the guard in updateBattleUnits,
    // but we also short-circuit here as a defensive belt-and-suspenders.
    if (typeof window !== 'undefined' && window.__preDeploymentActive) return;
    if (typeof inSiegeBattle === 'undefined' || !inSiegeBattle) return;
    if (unit.orderType === "hold_position") {
        // Reset trackers so they don't accumulate stale "stuckness"
        unit.stuckTimer = 0;
        if (unit.ghostTimer > 0) {
            unit.ghostTimer = 0;
            unit.alpha = 1.0;
        }
        unit.anchorX = unit.x;
        unit.anchorY = unit.y;
        return;
    }

    // BUGFIX ("units run south for a few seconds with no walking animation,
    // a bit after they start trying to climb"): this function's own header
    // comment already documents this EXACT symptom for enemy formation
    // units ("enemies slide south in stages with no leg animation") — the
    // isDefenderOnWall guard below was the fix for that, but it only ever
    // checks `unit.side === "enemy"`, so it never covered the player-side
    // ladder-queue population at all. A unit QUEUED at a ladder (waiting
    // behind the crew cap — see LADDER_CREW_CAP_MATCH below) is SUPPOSED to
    // hold still (within the 3px MOVEMENT_RADIUS) for several seconds while
    // waiting for its slot to open — that's indistinguishable from "stuck"
    // to this detector, which trips after exactly STUCK_THRESHOLD_FRAMES (3
    // seconds — matches "after a few seconds" almost exactly) and then
    // applies `unit.vy += 0.5; unit.y += 1.5;` EVERY FRAME for a full
    // GHOST_DURATION_FRAMES (5 seconds) straight — a continuously
    // accelerating southward push, done as a raw position/velocity
    // mutation with no walk-state change, so the leg animation never
    // plays. A unit actively climbing (isClimbing) or newly landed
    // (settling) can also look "stuck" to a 3px detector since both move
    // in deliberately small increments — same reasoning as the
    // isClimbing/settling exclusion already used in applyStuckExtractor
    // and applyPinballEscape.
    //
    // PRECISION FIX (matches the applyStuckExtractor/applyPinballEscape
    // regression fix): unlike those two functions, this one's ghost-mode
    // is a pure south-push PENALTY with no useful rescue side effect (its
    // "protected" recovery is just a vx shake) — so, unlike the other two,
    // blanket-excluding active crew here was never what caused them to
    // stall at the ladder base. Narrowed to queued-only anyway, purely for
    // correctness/consistency: active crew are genuinely moving, not
    // stuck, and should get real stuck-tracking rather than being
    // permanently marked "not stuck" by role alone.
    const LADDER_CREW_CAP_MATCH = 2; // must match LADDER_CREW_CAP in battlefield_commands.js
    const isQueuedAtLadder = (unit.siegeRole === "ladder_carrier" || unit.siegeRole === "ladder_fanatic") &&
        unit.queuePos != null && unit.queuePos >= LADDER_CREW_CAP_MATCH;

    if (unit.isClimbing || unit.settling || isQueuedAtLadder) {
        unit.stuckTimer = 0;
        if (unit.ghostTimer > 0) {
            unit.ghostTimer = 0;
            unit.alpha = 1.0;
        }
        unit.anchorX = unit.x;
        unit.anchorY = unit.y;
        return;
    }
    // ═══════════════════════════════════════════════════════════════════════════

    // 1. Initialize custom state properties on the unit if they don't exist
    if (typeof unit.stuckTimer === 'undefined') unit.stuckTimer = 0;
    if (typeof unit.ghostTimer === 'undefined') unit.ghostTimer = 0;
    if (typeof unit.anchorX === 'undefined') unit.anchorX = unit.x;
    if (typeof unit.anchorY === 'undefined') unit.anchorY = unit.y;

    const STUCK_THRESHOLD_FRAMES = 3 * FPS; // 3 seconds
    const GHOST_DURATION_FRAMES = 5 * FPS;  // 5 seconds
    const MOVEMENT_RADIUS = 3;              // 3 pixels

// ---------------------------------------------------------
    // RESOLUTION BEHAVIOR (Unit is currently stuck and ghosting)
    // ---------------------------------------------------------
    if (unit.ghostTimer > 0) {
        unit.ghostTimer--;

        // SURGERY: Protect Defenders from the downward shove!
        // BUGFIX: also protect onWall player units (landed climbers) for the
        // exact same reason defenders are protected — see the early-return
        // above for the pre-climb population; this covers a unit that
        // finished climbing and then went stationary long enough on the
        // narrow wall-top scaffold to trip stuckTimer before this function
        // even reaches the early-return checks (onWall was not one of the
        // early-return conditions on purpose, since a landed unit fighting
        // on the wall SHOULD still get real stuck-detection — it just
        // should never be the trigger for a southward shove off the wall).
        // SURGERY: was `unit.y < SiegeTopography.wallPixelY` — "protected"
        // meant strictly north of the wall. Now that defenders' real zone
        // is SiegeTopography.defenderRallyPixelY (south of the wall), that
        // check no longer covered them at all. Matches the same +100
        // buffer as the master clamp above so this and that stay in sync.
        let isDefenderOnWall = typeof inSiegeBattle !== 'undefined' && inSiegeBattle && unit.side === "enemy" && unit.y < (typeof SiegeTopography !== 'undefined' ? (SiegeTopography.defenderRallyPixelY || SiegeTopography.wallPixelY) + 100 : 2000);
        let isPlayerOnWall = typeof inSiegeBattle !== 'undefined' && inSiegeBattle && unit.side === "player" && unit.onWall;

        if (!isDefenderOnWall && !isPlayerOnWall) {
            // Normal behavior: Push them South
            unit.vy += 0.5;  
            unit.y += 1.5;   
        } else {
            // Wall behavior: Shake them side-to-side to unstick, DO NOT push South
            unit.vx += (Math.random() - 0.5) * 2;
        }

        // Visual feedback (optional): make the unit semi-transparent while phasing
        unit.alpha = 0.5;

        if (unit.ghostTimer <= 0) {
            // Ghosting complete: Reset visuals and drop a new anchor
            unit.alpha = 1.0;
            unit.anchorX = unit.x;
            unit.anchorY = unit.y;
        }
        
        // Return early. If they are ghosting, we don't run stuck detection.
        return; 
    }

    // ---------------------------------------------------------
    // DETECTION LOGIC (Checking if the unit is stuck)
    // ---------------------------------------------------------
    
    // Check how far they are from their anchor point
    let distX = Math.abs(unit.x - unit.anchorX);
    let distY = Math.abs(unit.y - unit.anchorY);

    // CRITICAL: We only want to flag them as stuck if they are SUPPOSED to be moving.
    // If they are locked in melee or just idle, they shouldn't trigger the stuck logic.
    let isTryingToMove = (Math.abs(unit.vx) > 0.1 || Math.abs(unit.vy) > 0.1 || unit.hasOrders);
let fightDist = (unit.stats && unit.stats.currentStance === "statusrange") ? (unit.stats.range + 50) : 25;
let isActivelyFighting = (unit.target && Math.hypot(unit.x - unit.target.x, unit.y - unit.target.y) < fightDist) || unit.state === "attacking";
    if (isTryingToMove && !isActivelyFighting) {
        if (distX < MOVEMENT_RADIUS && distY < MOVEMENT_RADIUS) {
            // Unit is struggling to leave the anchor radius
            unit.stuckTimer++;

            if (unit.stuckTimer >= STUCK_THRESHOLD_FRAMES) {
                // STUCK DETECTED! Trigger Resolution.
                unit.ghostTimer = GHOST_DURATION_FRAMES;
                unit.stuckTimer = 0; // Reset for next time
            }
        } else {
            // Unit successfully moved out of the radius. 
            // Reset the anchor to their new position and clear the timer.
            unit.anchorX = unit.x;
            unit.anchorY = unit.y;
            unit.stuckTimer = 0;
        }
    } else {
        // If they are idle or fighting, keep pulling the anchor to them 
        // so they don't instantly trigger a stuck state when they finally move.
        unit.anchorX = unit.x;
        unit.anchorY = unit.y;
        unit.stuckTimer = 0;
    }
}