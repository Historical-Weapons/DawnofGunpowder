
function canUseSiegeEngines(unit) {
	
	
    if (!unit || !unit.stats) return false; 
    if (unit.isCommander) return false; // SURGERY 1: Hard block commander

    const txt = String(
        (unit.unitType || "") + " " + 
        (unit.stats?.role || "") + " " + 
        (unit.stats?.name || "")
    ).toLowerCase();

    const isCavalry = /(cav|horse|mounted|camel|eleph|lancer|keshig)/.test(txt);
    if (unit.stats.isLarge || unit.isMounted || isCavalry) return false;
   

const unitLabel = txt.toLowerCase();
const isRanged = unit.stats.isRanged || /\b(archer|bow|crossbow|slinger|rocket)\b/.test(unitLabel);

const isSpecialist = /\b(firelance|bomb|javelinier|repeater)\b/.test(unitLabel);

if (isRanged && !isSpecialist) {
    if (unit.siegeRole === "treb_crew" || unit.siegeRole === "trebuchet_crew" || unit.siegeRole === "counter_battery") return true;
    
    // Standard archers only touch equipment if explicitly forced
    if (unit.siegeRole === "ram_pusher" || unit.siegeRole === "ladder_carrier" || unit.siegeRole === "ladder_fanatic") return true;
    
    return false; 
}

// Firelances, Bombs, and Javelins now count as "Infantry" for siege purposes!
return true;
}

function siegeDefenseRoll(unit) {
    const seed = String(
        unit.id ?? unit.uid ?? unit.name ?? unit.unitType ?? unit.stats?.name ?? ""
    );
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
        h = ((h << 5) - h) + seed.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h) % 100;
}

function isSiegeRangedDefender(unit) {
    const txt = String(
        (unit.unitType || "") + " " +
        (unit.stats?.role || "") + " " +
        (unit.stats?.name || "")
    ).toLowerCase();

    return Boolean(
        unit.stats?.isRanged ||
        /\b(archer|bow|crossbow|slinger|gunpowder|gunner|musket|hand cannon|rocket)\b/.test(txt)
    );
}


const AICategories = {

    cleanupDeadUnits: function(units, now) {
        return units.filter(u => {
            if (u.removeFromBattle) return false;
            if (u.hp <= 0) {
                if (!u.deathTime) handleUnitDeath(u);
   
                if (u.isCommander) return true;
                return (now - u.deathTime) < 1000;
            }
            return true;
        });
    },

    initBattleTrackers: function(currentBattleData) {
        if (!currentBattleData.fledCounts) currentBattleData.fledCounts = { player: 0, enemy: 0 };
        if (!currentBattleData.frames) currentBattleData.frames = 0;
        currentBattleData.frames++;
    },

handlePlayerOverride: function(unit, units, keys, battleEnv, player) {
        if (!unit.target || unit.target.hp <= 0) {
            let nearestDist = Infinity;
            units.forEach(other => {
                if (other.side !== unit.side && other.hp > 0 && !other.isDummy) {
                    let d = Math.hypot(unit.x - other.x, unit.y - other.y);
                    if (d < nearestDist) {
                        nearestDist = d;
                        unit.target = other;
                    }
                }
            });
        }

        if (unit.target) {
            let distToTarget = Math.hypot(unit.target.x - unit.x, unit.target.y - unit.y);
			
			// ---> SMART SURGERY: Prevent crash on loaded saves (Instance 2)
if (typeof unit.stats.updateStance === 'function') {
    unit.stats.updateStance(distToTarget);
} else {
    // FALLBACK: Manual stance logic matching troop_system.js
    if (!unit.stats.isRanged) {
        unit.stats.currentStance = "statusmelee";
    } else {
        const MELEE_ENGAGEMENT_DISTANCE = 15; 
        if ((unit.stats.ammo !== undefined && unit.stats.ammo <= 0) || distToTarget <= MELEE_ENGAGEMENT_DISTANCE) {
            unit.stats.currentStance = "statusmelee";
        } else {
            unit.stats.currentStance = "statusrange";
        }
    }
}
			
            let effectiveRange = unit.stats.currentStance === "statusmelee" ? 30 : unit.stats.range;

            if (distToTarget <= effectiveRange) {
                // SURGERY: Force the combat execution to run for the player commander
                this._handleCombatExecution(unit, unit.target.x - unit.x, unit.target.y - unit.y, distToTarget, battleEnv, player);
                unit.state = "attacking";
            } else {
                unit.state = (keys['w'] || keys['a'] || keys['s'] || keys['d']) ? "moving" : "idle";
            }
        } else {
            unit.state = "idle";
        }
    },

processMoraleAndFleeing: function(unit, pCount, eCount, currentBattleData) {
    let hpPct = unit.hp / unit.stats.health;
    let armorEffect = Math.min(unit.stats.armor / 50, 1.0);
    let baseTick = (hpPct <= 0.1) ? 0.12 : (hpPct <= 0.8 ? 0.04 : 0);

    const weOutnumberEnemy = (unit.side === 'player' && pCount > eCount) || (unit.side === 'enemy' && eCount > pCount);

    if (weOutnumberEnemy) {
        baseTick = 0;
    } else if ((unit.side === 'player' && eCount >= pCount * 5) || (unit.side === 'enemy' && pCount >= eCount * 5)) {
        baseTick = 0.2; 
    }

    if (unit.stats.armor >= 30 && currentBattleData.frames < 18000) baseTick *= 0.01;
    if (unit.stats.armor < 5 && unit.target && hpPct < 0.9 && !weOutnumberEnemy) baseTick += 0.02;

    // --- CASUALTY MORALITY DEBUFF ---
    const casualtyPct = unit.casualtyMoralePct || 0;
    const casualtyMult = unit.casualtyMoraleMultiplier || 1;

    if (casualtyPct >= 0.60) {
        baseTick *= casualtyMult;
    }

    if (baseTick > 0) {
        unit.stats.morale -= baseTick * Math.max(0.1, (1.1 - armorEffect));
    } else if (unit.stats.morale < 20) {
        unit.stats.morale += 0.005;
    }

    // Hard panic from casualties
    if (unit.forcePanicFromCasualties === true && unit.stats.morale <= 0) {
        this._handleBrokenFleeing(unit, currentBattleData);
        return true;
    }

    if (unit.stats.morale <= 0) {
        this._handleBrokenFleeing(unit, currentBattleData);
        return true; 
    } 
    else if (unit.stats.morale <= 3) {
        this._handleWavering(unit);
        return true;
    }
    
    unit.escapePoint = null;
    unit.escapeType = null;
    return false; 
},

processTargeting: function(unit, units) {
	// 1. Move the inSiege check ABOVE the ram validation
let inSiege = typeof inSiegeBattle !== 'undefined' && inSiegeBattle;

    // SURGERY 1: Protect all manual field commands from the AI target scanner
    if (unit.disableAICombat || ["siege_assault", "follow", "retreat", "move_to_point", "hold_position"].includes(unit.orderType)) {
        return; 
    }
// --- NEW GUARD: PACIFY EARLY-GAME WALL DEFENDERS (PATCHED) ---
        let southGate = (typeof battleEnvironment !== 'undefined' && battleEnvironment.cityGates) 
            ? battleEnvironment.cityGates.find(g => g.side === "south") : null;
        let isGateBreached = window.__SIEGE_GATE_BREACHED__ || (southGate && (southGate.isOpen || southGate.gateHP <= 0));

        if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle && unit.side === "enemy") {
            let areLaddersDeployed = typeof siegeEquipment !== 'undefined' && 
                                     siegeEquipment.ladders && 
                                     siegeEquipment.ladders.some(l => l.isDeployed && l.hp > 0);
                                     
            // Wake up if ladders hit the wall OR the gate is smashed
            if (!unit.stats.isRanged && !areLaddersDeployed && !isGateBreached) {
                unit.vx = 0;
                unit.vy = 0;
                unit.state = "idle"; 
                unit.target = null;
                return; 
            }
        }
        // LADDER CREW: Assign the nearest undeployed ladder as target, then move to it
        if (unit.orderType === "ladder_crew") {
            if (typeof siegeEquipment !== 'undefined' && siegeEquipment.ladders) {
                let undeployedLadders = siegeEquipment.ladders.filter(l => !l.isDeployed && l.hp > 0);
                if (undeployedLadders.length > 0) {
                    let closest = undeployedLadders.reduce((prev, curr) =>
                        Math.hypot(curr.x - unit.x, curr.y - unit.y) < Math.hypot(prev.x - unit.x, prev.y - unit.y) ? curr : prev
                    );
                    unit.target = closest;
                    unit.hasOrders = true;
                }
            }
            return;
        }
 // --- NEW ANCHOR PROTECTION ---
        // Prevents the 5% random dummy reassignment from hijacking settled units
        if (unit.target && unit.target.isAnchor) {
            return;
        }


// --- RAM CREW VALIDATION ---
// Only run this if we are actually in a siege battle
if (inSiege && (unit.type === "ram" || unit.siegeRole === "battering_ram")) {
    const crewTouchDistance = 60; 
    
    // Ensure we use 'unit' here, not 'ram'
    const hasActiveCrew = units.some(other => 
        other.side === unit.side && 
        other !== unit && 
        other.hp > 0 && 
        !other.isDummy &&
        Math.hypot(unit.x - other.x, unit.y - other.y) < crewTouchDistance
    );

    if (!hasActiveCrew) {
        unit.target = null;
        unit.hasOrders = false;
        unit.state = "idle"; 
        return; 
    }
}
		
// --- CREW REINTEGRATION (ATTACKERS & DEFENDERS) ---
// Wraps engine crew check in the same inSiege check to prevent land battle errors
if (inSiege && (unit.siegeRole === "treb_crew" || unit.siegeRole === "trebuchet_crew" || unit.siegeRole === "engine_crew")) {
    let myEngine = (unit.target && (unit.target.isTrebuchet || unit.target.isBallista || unit.target.type === "trebuchet" || unit.target.type === "ballista")) ? unit.target : null;
    
    // If the target engine doesn't exist or is destroyed, clear their duty.
    if (!myEngine || myEngine.hp <= 0) {
        unit.siegeRole = "infantry";
        unit.target = null;
        unit.hasOrders = false;
    }
}
 
        //clear the gate gathering dummy
		const now = Date.now();

		if (inSiege && unit.side === "enemy" && battleEnvironment) {
			if (!battleEnvironment.defenderGateDummyDisabled) {
				const startedAt = battleEnvironment.defenderGateDummyStartedAt || now;
				if (now - startedAt > 3000) {
					battleEnvironment.defenderGateDummyDisabled = true;
				}
			}

			if (battleEnvironment.defenderGateDummyDisabled && unit.target && unit.target.isDummy) {
				const p = unit.target.priority || "";
				if (p === "gate_plug" || p === "gate_patrol" || p === "ranged_line" || p === "plaza") {
					unit.target = null;
					unit.hasOrders = false;
				}
			}
		}

		// ==========================================
        // SIEGE MACRO-TARGETING OVERHAUL
        // ==========================================
      // ==========================================
        // SIEGE MACRO-TARGETING OVERHAUL
        // ==========================================
        if (inSiege) {
            let gateX = typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelX : BATTLE_WORLD_WIDTH / 2;
            let gateY = typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelY : BATTLE_WORLD_HEIGHT / 2;

            let gateTarget = { x: gateX, y: gateY - 20, hp: 9999, isDummy: true, priority: "gate_funnel" };
            let plazaTarget = { x: gateX, y: typeof SiegeTopography !== 'undefined' ? SiegeTopography.plazaPixelY : BATTLE_WORLD_HEIGHT / 2, hp: 9999, isDummy: true, priority: "plaza" };
// ATTACKER COMMON GOAL (OVERHAULED FOR LADDERS & PLAZA)
            // ATTACKER COMMON GOAL
if (unit.side === "player") {
    
    // 1. Define who is "On Duty" (These units ignore your follow/retreat orders to finish the siege task)
    const isActiveCrew = ["ram_pusher", "ladder_carrier", "battering_ram", "engine_crew"].includes(unit.siegeRole);

    // 2. THE SURGERY: If I'm NOT a crew member, and I have a MANUAL command (Follow, Stop, or Retreat)
    // we EXIT this AI block immediately so they obey you.
    // NOTE: We do NOT include "move_to_point" here so that your "5-q" attack still uses Siege Logic.
    const hasManualCommand = unit.hasOrders && ["follow", "retreat", "hold_position"].includes(unit.orderType);

    if (!isActiveCrew && hasManualCommand) {
        return; // Stop the Siege AI from overriding. Unit moves naturally to your target!
    }

    // ---------------------------------------------------------
    // 3. SIEGE MACRO LOGIC (Only runs if no manual command is active)
    // ---------------------------------------------------------
    
    // Calculate Gate Centroid
    const gateCentroid = southGate && southGate.pixelRect
        ? { x: southGate.pixelRect.x + (southGate.pixelRect.w / 2), y: southGate.pixelRect.y + (southGate.pixelRect.h / 2) }
        : { x: gateX, y: gateY };

                    // Check if any ladders are successfully deployed against the walls
                    const areLaddersDeployed = typeof siegeEquipment !== 'undefined' && 
                                               siegeEquipment.ladders && 
                                               siegeEquipment.ladders.some(l => l.isDeployed && l.hp > 0);

                    // PRE-DEPLOYMENT MAGNET: Pull eligible infantry toward undeployed ladders like magnets
                    const hasUndeployedLadders = typeof siegeEquipment !== 'undefined' &&
                                                  siegeEquipment.ladders &&
                                                  siegeEquipment.ladders.some(l => !l.isDeployed && l.hp > 0);

                    if (!areLaddersDeployed && hasUndeployedLadders && canUseSiegeEngines(unit) && !unit.isClimbing && !unit.onWall) {
                        let undeployedLadders = siegeEquipment.ladders.filter(l => !l.isDeployed && l.hp > 0);
                        let bestLadder = undeployedLadders.reduce((prev, curr) =>
                            Math.hypot(curr.x - unit.x, curr.y - unit.y) < Math.hypot(prev.x - unit.x, prev.y - unit.y) ? curr : prev
                        );
                        unit.target = bestLadder;
                        unit.orderType = "ladder_crew";
                        unit.hasOrders = true;
                        return;
                    }

                    // Look for the "1. GATE BREACHED" block inside processTargeting
                    if (isGateBreached) {
                        // Force role swap — even active ladder-climbers drop their task
                        unit.siegeRole        = "gate_charger";
                        unit.isClimbing       = false;
                        unit.onWall           = false;
                        unit.hasOrders        = true;
                        unit.orderType        = "move_to_point";
                        unit.breachRush       = true;
                        unit.priorityOverride = true; // tells processAction to skip engagement logic

                        // Simply move everyone to the old gate centroid to funnel through the gap
                        unit.target = { 
                            x: gateCentroid.x, 
                            y: gateCentroid.y,
                            hp: 99, 
                            isDummy: true, 
                            priority: "gate_funnel" 
                        };
                        return;
                    }

                    // 2. LADDERS DEPLOYED (GATE INTACT) -> STORM THE LADDERS (Two-Phase Charge)
                    if (areLaddersDeployed && canUseSiegeEngines(unit)) {
                        
                        // Find the closest active ladder to use as our "Centroid"
                        let activeLadders = typeof siegeEquipment !== 'undefined' ? 
                                            siegeEquipment.ladders.filter(l => l.isDeployed && l.hp > 0) : [];
                        let bestLadder = activeLadders[0] || {x: gateCentroid.x, y: gateCentroid.y};
                        
                        if (activeLadders.length > 0) {
                            bestLadder = activeLadders.reduce((prev, curr) => 
                                Math.hypot(curr.x - unit.x, curr.y - unit.y) < Math.hypot(prev.x - unit.x, prev.y - unit.y) ? curr : prev
                            );
                        }

                        // Only apply this to units not already locked into climbing
                        if (!unit.isClimbing && !unit.onWall) {
                            unit.siegeRole        = "ladder_charger";
                            unit.hasOrders        = true;
                            unit.orderType        = "move_to_point";
                            unit.breachRush       = true;
                            unit.priorityOverride = true; // tells processAction to skip engagement logic

                            const _centroidX = bestLadder.x;
                            const _centroidY = bestLadder.y - 10; // Aim right at the ladder's base
                            const _distToCentroid = Math.hypot(unit.x - _centroidX, unit.y - _centroidY);

                            if (_distToCentroid > 20) {
                                // PHASE A — march directly to the ladder base
                                unit.target = { 
                                    x: _centroidX, 
                                    y: _centroidY,
                                    hp: 9999, 
                                    isDummy: true, 
                                    priority: "ladder_centroid",
                                    isLadderAssault: true // Hooks into the fast-track climbing physics
                                };
                            } else {
                                // PHASE B — once at the ladder, push through to the city plaza
                                unit.target = plazaTarget;
                            }
                            return;
                        }
                    }

                    // 3. PRE-BREACH & PRE-LADDER -> RANGED FORMATIONS HOLD LINE
                    if (!canUseSiegeEngines(unit)) {
                        let wallY = typeof SiegeTopography !== 'undefined' ? SiegeTopography.wallPixelY : 2000;
                        unit.target = {
                            x: unit.x,
                            y: wallY + 120,
                            hp: 9999,
                            isDummy: true,
                            priority: "wall_shoot_line"
                        };
                        return;
                    }
               
            }
						
		// ==========================================
            // DEFENDER COMMON GOAL (PATCHED)
            // ==========================================
            if (unit.side === "enemy") {
                
                if (isGateBreached && !unit.onWall) {
                    if (!unit.target || unit.target.priority !== "plaza") {
                        unit.target = plazaTarget;
                    }
                    return;
                }

                // PRE-BREACH DEFENSE SPLIT: No 3-second skipping allowed.
                if (!isGateBreached) {
                    const duty = siegeDefenseRoll(unit);
                    const ranged = isSiegeRangedDefender(unit);
                    const siegeCrew = canUseSiegeEngines(unit);
                    let wallY = typeof SiegeTopography !== 'undefined' ? SiegeTopography.wallPixelY : gateY;

                    // --- 1. ENGINE CREW ALLOCATION ---
                    let availableEngines = [];
                    if (typeof siegeEquipment !== 'undefined') {
                        if (siegeEquipment.trebuchets) availableEngines.push(...siegeEquipment.trebuchets.filter(t => t.side === 'enemy' && t.hp > 0));
                        if (siegeEquipment.ballistas) availableEngines.push(...siegeEquipment.ballistas.filter(b => b.side === 'enemy' && b.hp > 0));
                    }
                    if (availableEngines.length > 0 && duty < 50) { 
                        let engine = availableEngines[duty % availableEngines.length];
                        unit.target = engine; 
                        unit.siegeRole = "engine_crew";
                        unit.disableAICombat = true; 
                        return;
                    }

                    // Scan for real threats to establish Aggro Radius
                    let nearestEnemy = null;
                    let nearestDist = Infinity;
                    units.forEach(other => {
                        if (other.side !== unit.side && other.hp > 0 && !other.isDummy) {
                            const d = Math.hypot(unit.x - other.x, unit.y - other.y);
                            if (d < nearestDist) {
                                nearestDist = d;
                                nearestEnemy = other;
                            }
                        }
                    });

                    // --- 2. RANGED LOGIC ---
                    if (ranged) {
                        if (nearestEnemy && nearestDist < unit.stats.range + 100) {
                            unit.target = nearestEnemy; // Engage if in range
                        } else {
                            unit.target = {
                                x: gateX + ((Math.random() - 0.5) * 1600), 
                                y: wallY + 10,
                                hp: 9999, isDummy: true, priority: "ranged_line"
                            };
                        }
                        return;
                    }

                    // --- 3. LADDER RUSH ---
                    let activeLadders = typeof siegeEquipment !== 'undefined' && siegeEquipment.ladders 
                                        ? siegeEquipment.ladders.filter(l => l.isDeployed && l.hp > 0) : [];

                    if (activeLadders.length > 0 && !ranged && !siegeCrew) {
                        let bestLadder = activeLadders.reduce((prev, curr) => 
                            Math.hypot(curr.x - unit.x, curr.y - unit.y) < Math.hypot(prev.x - unit.x, prev.y - unit.y) ? curr : prev
                        );
                        unit.target = { x: bestLadder.x, y: wallY + 10, hp: 9999, isDummy: true, priority: "ladder_defense" };
                        return;
                    }

                    // --- 4. MELEE FORMATION (WITH AGGRO RADIUS) ---
                    // If an enemy gets extremely close (e.g., climbs the wall), break formation and attack!
                    if (nearestEnemy && nearestDist < 120) {
                        unit.target = nearestEnemy;
                        return;
                    }

                    // Otherwise, hold the line indefinitely (No more 3-second disabling!)
                    if (siegeCrew || duty < 3) { 
                        unit.target = { x: gateX + ((duty % 2 === 0 ? -1 : 1) * 80), y: wallY - 50, hp: 9999, isDummy: true, priority: "gate_plug" };
                        return;
                    }
                    if (duty < 10) { 
                        unit.target = { x: gateX + ((Math.random() - 0.5) * 1600), y: wallY - 50, hp: 9999, isDummy: true, priority: "gate_patrol" };
                        return;
                    }
                }
            }
        }
 
		// ==========================================
        // COUNTER-BATTERY TARGET OVERRIDE
        // ==========================================
        if (unit.siegeRole === "counter_battery" && !unit.disableAICombat) {
            let bestSnipeTarget = null;
            let bestSnipeScore = Infinity; // Lower score is better

            units.forEach(other => {
                if (other.side !== unit.side && other.hp > 0 && !other.isDummy) {
                    let isEnemyRanged = other.stats?.isRanged || String(other.stats?.role || "").toLowerCase().includes("archer");
                    let dist = Math.hypot(unit.x - other.x, unit.y - other.y);

                    let score = isEnemyRanged ? (dist - 5000) : dist;
                    
                    if (score < bestSnipeScore) {
                        bestSnipeScore = score;
                        bestSnipeTarget = other;
                    }
                }
            });

            if (bestSnipeTarget) {
                unit.target = bestSnipeTarget;
                return;
            }
        }
 
        let currentTargetDist = (unit.target && unit.target.hp > 0 && !unit.target.isDummy) 
            ? Math.hypot(unit.x - unit.target.x, unit.y - unit.target.y) 
            : Infinity;

// PERFORMANCE: Only re-scan for a new target if the current one is gone, or on a low-probability random check.
        // Skip the scan entirely if this unit has a healthy real target — saves many CPU cycles per frame.
        const hasHealthyTarget = unit.target && unit.target.hp > 0 && !unit.target.isDummy;
        if (!hasHealthyTarget || Math.random() < 0.008 || (unit.target.isDummy && Math.random() < 0.04)) {
            let nearestDist = Infinity;
            let nearestEnemy = null;
            units.forEach(other => {

                if (other.side !== unit.side && other.hp > 0 && !other.isDummy) {
                    let dist = Math.hypot(unit.x - other.x, unit.y - other.y);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestEnemy = other;
                    }
                }
            });
            
            if (nearestEnemy && nearestDist < currentTargetDist) {
                unit.target = nearestEnemy;
            }
        }
    },

processAction: function(unit, battleEnv, currentBattleData, player) {

// PERFORMANCE: Skip heavy AI for units not visible on screen.
        // Exception: ladder/ram pushers must always process regardless of camera position.
        const _isActivePusher = (unit.siegeRole === "ladder_fanatic" || unit.orderType === "ladder_crew");
        if (!_isActivePusher && typeof camera !== 'undefined' && typeof isOnScreen === 'function' && !isOnScreen(unit, camera)) {
            if (unit.cooldown > 0) unit.cooldown--;
            return;
        }

// ---> SURGERY: Evaluate the gate status FIRST before the ladder logic
        let southGate = (typeof battleEnvironment !== 'undefined' && battleEnvironment.cityGates) 
            ? battleEnvironment.cityGates.find(g => g.side === "south") : null;
        let isGateBreached = window.__SIEGE_GATE_BREACHED__ || (southGate && (southGate.isOpen || southGate.gateHP <= 0));

if (!isGateBreached && unit.side === "player" && unit.target && !unit.target.isDummy && unit.onWall !== unit.target.onWall && canUseSiegeEngines(unit)) {
	

    if (!unit.onWall) { 
        const activeLadders = typeof siegeEquipment !== 'undefined' ? 
            siegeEquipment.ladders.filter(l => l.isDeployed && l.hp > 0) : [];
        
        if (activeLadders.length > 0) {
            let bestLadder = activeLadders.reduce((prev, curr) => {
                let scorePrev = Math.hypot(prev.x - unit.x, prev.y - unit.y) + (Math.random() * 50);
                let scoreCurr = Math.hypot(curr.x - unit.x, curr.y - unit.y) + (Math.random() * 50);
                return scoreCurr < scorePrev ? curr : prev;
            });

            unit.target = { 
                x: bestLadder.x, 
                y: bestLadder.y - 20, // Always point to the base to climb up
                onWall: true, 
                isDummy: true,
                isLadderAssault: true
            };
            unit.state = "moving";
            unit.hasOrders = true;
			
		 unit.targetLadder = bestLadder;  // cache ref so X-lock always has it
            // Snap ladder-specialists into the correct approach lane immediately
            if (unit.siegeRole === "ladder_fanatic" || unit.siegeRole === "ladder_carrier") {
				const _maxNudge = (unit.stats?.speed ?? 2) * 1.5; // max px per frame
				const _rawNudge = (bestLadder.x - unit.x) * 0.20;
				unit.x += Math.max(-_maxNudge, Math.min(_maxNudge, _rawNudge));
            }
        }
    }
}
		let oldX = unit.x;
        let oldY = unit.y;
        
        let inSiege = typeof inSiegeBattle !== "undefined" && inSiegeBattle;

        // =========================================================
        // ---> FIX: PRE-BREACH CAVALRY HARD FREEZE <---
        // =========================================================
        if (inSiege && unit.side === "player" && unit.siegeRole === "cavalry_reserve") {
            let southGate = (typeof battleEnvironment !== 'undefined' && battleEnvironment.cityGates) 
                ? battleEnvironment.cityGates.find(g => g.side === "south") : null;
            let isGateBreached = window.__SIEGE_GATE_BREACHED__ || (southGate && (southGate.isOpen || southGate.gateHP <= 0));

            if (!isGateBreached) {
                unit.vx = 0;
                unit.vy = 0;
                unit.state = "idle";
                // Restore stamina while resting, but absolutely NO pathfinding, pinballing, or attacking
                if (unit.stats.stamina < 100 && Math.random() > 0.9) unit.stats.stamina++;
                return; 
            }
        }
  
       // ---> SURGERY 2: THE COMBAT/ACTION HARD BLOCK <---
        // Kept the hard block ONLY for pure pacifist roles like ladder carriers
        if (unit.disableAICombat || unit.orderType === "ladder_crew") {
            if (unit.target) {
                let dx = unit.target.x - unit.x;
                let dy = unit.target.y - unit.y;
                let dist = Math.hypot(dx, dy);
                this._handleMovement(unit, dx, dy, dist, battleEnv);
                let hasMoved = Math.abs(unit.x - oldX) > 0.1 || Math.abs(unit.y - oldY) > 0.1;
                unit.state = hasMoved ? "moving" : "idle";
            }
            return; 
        }

// SURGERY 2: Add 'follow' and 'retreat' so units don't drop into combat logic against their own waypoints
        if (unit.priorityOverride || ((["siege_assault", "move_to_point", "follow", "retreat"].includes(unit.orderType)) && unit.target && unit.target.isDummy)) {

             let dx = unit.target.x - unit.x;
             let dy = unit.target.y - unit.y;
             let dist = Math.hypot(dx, dy);
             this._handleMovement(unit, dx, dy, dist, battleEnv);
             let hasMoved = Math.abs(unit.x - oldX) > 0.1 || Math.abs(unit.y - oldY) > 0.1;
             unit.state = hasMoved ? "moving" : "idle";
             return;
        }
         
        const txt = String(
            (unit.unitType || "") + " " +
            (unit.stats?.role || "") + " " +
            (unit.stats?.name || "")
        ).toLowerCase();

        const isMountedOrLarge = Boolean(
            unit.stats?.isLarge ||
            unit.isMounted ||
            /\b(cav|horse|mounted|camel|eleph|lancer)\b/.test(txt)
        );

        if (unit.target) {
            if (inSiege && unit.side === "player" && isMountedOrLarge) {
                if (unit.target.isDummy || unit.target.hp <= 0) {
                    
                    // Look for enemies if safe, otherwise chill
                    let nearestEnemy = null;
                    let nearestDist = Infinity;
                    if (battleEnv && battleEnv.units) {
                        for (let other of battleEnv.units) {
                            if (!other || other.hp <= 0 || other.side === unit.side || other.isDummy) continue;
                            let d = Math.hypot(other.x - unit.x, other.y - unit.y);
                            if (d < nearestDist) { nearestDist = d; nearestEnemy = other; }
                        }
                    }

                    if (nearestEnemy && nearestDist < 400) { // Only engage if relatively close
                        unit.target = nearestEnemy;
                    } else {
                        unit.state = "idle";
                        if (unit.stats.stamina < 100 && Math.random() > 0.9) unit.stats.stamina++;
                        return;
                    }
                }
            }

            let dx = unit.target.x - unit.x;
            let dy = unit.target.y - unit.y;
            let dist = Math.hypot(dx, dy);

// ---> SURGERY: Prevent crash on loaded saves (Hydration Fix)
if (typeof unit.stats.updateStance === 'function') {
    unit.stats.updateStance(dist);
} else {
    // Fallback logic: if the function was lost during JSON load, 
    // we manually determine the stance so the AI doesn't break.
    const meleeRange = 40; 
    unit.stats.currentStance = (dist < meleeRange) ? "statusmelee" : "statusrange";
}

            let effectiveRange = unit.stats.currentStance === "statusmelee" ? 30 : unit.stats.range;

			let isAlreadyAttacking = (unit.state === "attacking" && unit.stats.currentStance === "statusrange");
            let rangeThreshold = isAlreadyAttacking ? (effectiveRange * 0.95) : (effectiveRange * 0.8);

            // ---> SURGERY: HOLD & FOLLOW CAN ENGAGE AT 100% MAXIMUM DEFINED RANGE <---
            if ((unit.orderType === "hold_position" || unit.orderType === "follow") && unit.stats.currentStance === "statusrange") {
                rangeThreshold = effectiveRange;
            }

			if (dist > rangeThreshold) {
                // SURGERY 3: The "E" Command Leg-Lock
                let isMeleeSelfDefense = (!unit.stats.isRanged && dist < 70); 

             if (unit.orderType === "hold_position" && !isMeleeSelfDefense) {
                    unit.vx = 0; 
                    unit.vy = 0;
                    unit.state = "idle";
                } else {
                    // ---> SURGERY: STANDARD MOVEMENT FOR ALL <---
                    this._handleMovement(unit, dx, dy, dist, battleEnv);
                }
			} else {
// EXTREME STOP: For ranged units in range, kill velocity completely so the animation locks cleanly
                if (unit.stats.currentStance === "statusrange") {
                    
                    // ---> SURGERY: ALL ARCHERS STOP DEAD TO SHOOT <---
                    unit.vx = 0;
                    unit.vy = 0;
                    // Force state to prevent the engine from jittering the animation if residual velocity exists
                    unit.state = "attacking"; 
                    // -----------------------------------------
                    
                }
                this._handleCombatExecution(unit, dx, dy, dist, battleEnv, player);
            }
			
			
            let hasMoved = Math.abs(unit.x - oldX) > 0.1 || Math.abs(unit.y - oldY) > 0.1;
            if (hasMoved) {
                unit.state = "moving";
            } else if (unit.state !== "attacking") {
                unit.state = "idle";
            }
        } else {
            if (!unit.isCommander) unit.state = "idle";
            if (unit.stats.stamina < 100 && Math.random() > 0.9) unit.stats.stamina++;
        }
		
		
// --- MOUNT & INFANTRY AUDIO ---
        const isAnimal = unit.stats?.isLarge || unit.isMounted || String(unit.unitType).toLowerCase().match(/(cav|horse|camel|eleph)/);
        
        if (isAnimal && unit.state !== "FLEEING") {
            let mType = "horse";
            let nameStr = String(unit.unitType).toLowerCase();
            if (nameStr.includes("elephant")) mType = "elephant";
            else if (nameStr.includes("camel")) mType = "camel";

            if (unit.state === "idle") {
                BattleAudio.playMountIdle(unit.x, unit.y, mType);
            } else if (unit.state === "moving" && mType === "horse") {
                // Throttle handles the spam, just pass the requested speed
                let currentSpeed = Math.hypot(unit.vx || 0, unit.vy || 0);
                let speedType = (currentSpeed > 1.2) ? "gallop" : "trot";
                BattleAudio.playMountMove(unit.x, unit.y, speedType);
            }
        } else if (!isAnimal && unit.state === "moving") {
            // INFANTRY FOOTSTEPS ONLY (No idle sounds)
            let wTier = unit.stats?.weightTier || 1; // Default to light infantry if undefined
            BattleAudio.playFootmarch(unit.x, unit.y, wTier);
        }
		
    },

    // --- INTERNAL HELPER FUNCTIONS ---

    _handleBrokenFleeing: function(unit, currentBattleData) {
        unit.state = "FLEEING";
        let inSiege = typeof inSiegeBattle !== 'undefined' && inSiegeBattle;

        if (!unit.escapePoint || unit.escapeType !== "OUTER") {
            unit.escapeType = "OUTER";
            unit.fleeTimer = 0;

            if (inSiege && unit.side === "enemy" && typeof battleEnvironment !== 'undefined' && battleEnvironment.cityGates) {
                let northGate = battleEnvironment.cityGates.find(g => g.side === "north");
                if (northGate && northGate.pixelRect) {
                    unit.escapePoint = { x: northGate.pixelRect.x + (northGate.pixelRect.w / 2), y: -500 };
                }
            } else {
                let distToLeft = unit.x;
                let distToRight = BATTLE_WORLD_WIDTH - unit.x;
                let distToTop = unit.y;
                let distToBottom = BATTLE_WORLD_HEIGHT - unit.y;
                let minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
                let padding = -2000;

                if (minDist === distToLeft) unit.escapePoint = { x: padding, y: unit.y };
                else if (minDist === distToRight) unit.escapePoint = { x: BATTLE_WORLD_WIDTH - padding, y: unit.y };
                else if (minDist === distToTop) unit.escapePoint = { x: unit.x, y: padding };
                else unit.escapePoint = { x: unit.x, y: BATTLE_WORLD_HEIGHT - padding };
            }
        }

// Check if we are in a siege and the unit is a defender (enemy)
if (inSiege && unit.side === "enemy" && typeof battleEnvironment !== 'undefined' && battleEnvironment.cityGates) {
    
    // Find the North Gate
    const northGate = battleEnvironment.cityGates.find(g => g.side === "north");

    // Only proceed if the gate exists, is currently CLOSED, and has valid hitboxes
    if (northGate && !northGate.isOpen && northGate.pixelRect) {
        
        // Calculate center once using the pixelRect
        const gateCenterX = northGate.pixelRect.x + (northGate.pixelRect.w / 2);
        const gateCenterY = northGate.pixelRect.y + (northGate.pixelRect.h / 2);
        
        // Use squared distance for better performance (avoids Math.sqrt/hypot every frame)
        const distSq = Math.pow(unit.x - gateCenterX, 2) + Math.pow(unit.y - gateCenterY, 2);

        if (distSq < 10000) { // 100 * 100 = 10000
            // 1. Flip the state immediately to prevent other units from re-triggering this loop
            northGate.isOpen = true; 
            northGate.hp = 0; // Ensure it's treated as "destroyed" by targeting AI

            // 2. Update the Pathfinding Grid
            const bounds = northGate.bounds;
            if (bounds && battleEnvironment.grid) {
                for (let x = bounds.x0; x <= bounds.x1; x++) {
                    // Check if column exists
                    if (!battleEnvironment.grid[x]) continue;

                    for (let y = bounds.y0; y <= bounds.y1; y++) {
                        // Keep the pillars solid, but make the gate pathable (1)
                        const isPillar = (x === bounds.x0 || x === bounds.x1);
                        if (!isPillar) {
                            battleEnvironment.grid[x][y] = 1; 
                        }
                    }
                }
            }

            console.log("Defenders have thrown open the North Gate to escape!");
            
            // 3. Audio/Visual feedback (Optional)
            if (typeof playSound === 'function') playSound("gate_creak");
        }
    }
}
        let dx = unit.escapePoint.x - unit.x;
        let dy = unit.escapePoint.y - unit.y;
        let dist = Math.hypot(dx, dy);

        if (dist > 8) {
            unit.x += (dx / dist + (Math.random() - 0.5) * 0.3) * (unit.stats.speed * 2.5);
            unit.y += (dy / dist + (Math.random() - 0.5) * 0.3) * (unit.stats.speed * 2.5);
        }

        let isOutsideBorder = unit.x < 0 || unit.x > BATTLE_WORLD_WIDTH || unit.y < 0 || unit.y > BATTLE_WORLD_HEIGHT;
        if (isOutsideBorder) {
            unit.fleeTimer = (unit.fleeTimer || 0) + 1;
            if (unit.fleeTimer >= 300) {
                unit.state = "retreated";
                unit.removeFromBattle = true;
                unit.target = null;
                unit.cooldown = 0;

                let sideTotal = currentBattleData.initialCounts[unit.side] || 0;
                let scale = sideTotal > 300 ? 5 : 1;
                currentBattleData.fledCounts[unit.side] += scale;
            }
        }
    },

    _handleWavering: function(unit) {
        unit.state = "WAVERING";
        if (!unit.escapePoint || unit.escapeType !== "INNER") {
            let distToLeft = unit.x;
            let distToRight = BATTLE_WORLD_WIDTH - unit.x;
            let distToTop = unit.y;
            let distToBottom = BATTLE_WORLD_HEIGHT - unit.y;
            let minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
            let p = 20;

            if (minDist === distToLeft) unit.escapePoint = { x: p, y: unit.y };
            else if (minDist === distToRight) unit.escapePoint = { x: BATTLE_WORLD_WIDTH - p, y: unit.y };
            else if (minDist === distToTop) unit.escapePoint = { x: unit.x, y: p };
            else unit.escapePoint = { x: unit.x, y: BATTLE_WORLD_HEIGHT - p };

            unit.escapeType = "INNER";
        }

        let dx = unit.escapePoint.x - unit.x;
        let dy = unit.escapePoint.y - unit.y;
        let dist = Math.hypot(dx, dy);

        if (dist > 8) {
            unit.x += (dx / dist) * (unit.stats.speed * 1.5);
            unit.y += (dy / dist) * (unit.stats.speed * 1.5);
        } else {
            unit.state = "idle";
        }
    },
    
_handleMovement: function(unit, dx, dy, dist, battleEnv) {
        if (unit.isCommander) return;
        // If distance is microscopically small, halt movement to prevent NaN math corruption
        if (dist < 0.1) {
            unit.vx = 0;
            unit.vy = 0;
            return;
        }
		
		
        let shouldHold = false;
        let inSiege = typeof inSiegeBattle !== 'undefined' && inSiegeBattle;
        let speedMod = 1.0;
        let isLargeUnit = unit.stats?.isLarge || unit.isMounted || (unit.unitType && unit.unitType.toLowerCase().includes("cav"));

// AFTER — catches ALL climbing units regardless of siege role:
if (unit.isClimbing) {
	
	// ============================================================================
// 1. LADDER SUPER-GLUE (Prevent Sideways Pushing)
// ============================================================================
if (unit.isClimbing && unit.targetLadder) {
    // 1. Force the unit's X coordinate to perfectly match the ladder's center X
    const _ldrHalfW = (unit.targetLadder.width != null) ? unit.targetLadder.width / 2 : (typeof BATTLE_TILE_SIZE !== 'undefined' ? BATTLE_TILE_SIZE / 2 : 8);
    unit.x = Math.max(unit.targetLadder.x - _ldrHalfW, Math.min(unit.targetLadder.x + _ldrHalfW, unit.x));
	
    
    // 2. Kill any horizontal velocity so physics don't fight the lock
    if (unit.vx !== undefined) {
        unit.vx = 0; 
    }
    
    // 3. Temporarily make them ignore being pushed by other units
    // (Depending on your engine, you might need to set a flag here)
    unit.ignoreSeparation = true; 
} else {
    // Turn normal bumping back on when they finish climbing
    unit.ignoreSeparation = false; 
}
        
        // 1. Calculate the Centroid of the current ladder tile
        // This ensures they are perfectly aligned with the gap in the wall
        if (typeof BATTLE_TILE_SIZE !== 'undefined') {
            let tx = Math.floor(unit.x / BATTLE_TILE_SIZE);
            let ladderCenterX = (tx * BATTLE_TILE_SIZE) + (BATTLE_TILE_SIZE / 2);
            
            // Physical Snap: Force X to the center of the rail
            unit.x = ladderCenterX;
        }

        // 2. Kill all horizontal velocity
        unit.vx = 0; 
        
        // 3. Force strictly upward momentum (Negative Y)
        // We use Math.abs to ensure no "falling" logic can override this
        let baseSpeed = unit.stats?.speed || 1;
        unit.vy = -Math.abs(baseSpeed * 1.4); 

        // 4. Hard Block: Prevent any other movement logic from running
        return;
	}
        // --- 1. LADDER TRANSITION STATE CHECK ---
        let isOnLadderTile = false;
        if (inSiege && unit.side === "player" && canUseSiegeEngines(unit) && battleEnv.grid && typeof BATTLE_TILE_SIZE !== 'undefined') {
            let tx = Math.floor(unit.x / BATTLE_TILE_SIZE);
            let ty = Math.floor(unit.y / BATTLE_TILE_SIZE);
            let currentTile = (battleEnv.grid[tx] && battleEnv.grid[tx][ty] !== undefined) ? battleEnv.grid[tx][ty] : 0;

            if (currentTile === 9) {
                isOnLadderTile = true;
                if (!unit.onWall && unit.side === "player") {
                    unit.onWall = true;
                    // THE POP: Throws them up onto the landing pad we just carved
                    let safeWallY = typeof SiegeTopography !== 'undefined' ? SiegeTopography.wallPixelY : (unit.y - 40);
                    unit.y = safeWallY - 20; 
                }
            }
            // ---> SURGERY: Safeguard 'onWall' stripping <---
            else if (currentTile === 1 || currentTile === 5 || currentTile === 0) {
                // ONLY strip 'onWall' if they are clearly SOUTH of the wall. 
                // If they are physically north of the boundary, let them stay on the wall.
                if (!(inSiege && unit.y <= SiegeTopography.wallPixelY)) {
                    unit.onWall = false; 
                }
            }
else if (currentTile === 8 || currentTile === 10) unit.onWall = true;  
            
            if (currentTile === 4) speedMod = 0.4; 
            if (currentTile === 7) speedMod = 0.6; 
        }

        // === DEFENDER WALL DETECTION (mirrors the attacker block above for enemy units) ===
        if (inSiege && unit.side === "enemy" && battleEnv.grid && typeof BATTLE_TILE_SIZE !== 'undefined') {
            let defTx = Math.floor(unit.x / BATTLE_TILE_SIZE);
            let defTy = Math.floor(unit.y / BATTLE_TILE_SIZE);
            let defTile = (battleEnv.grid[defTx] && battleEnv.grid[defTx][defTy] !== undefined) ? battleEnv.grid[defTx][defTy] : 0;
            if (defTile === 8 || defTile === 10) {
                unit.onWall = true;
            } else if (defTile === 0 || defTile === 1 || defTile === 5) {
                unit.onWall = false;
            }
        }

		if (unit.side === "player" && !unit.hasOrders) {
			
			
	    // =========================================================
        // NAVAL AI OVERRIDE (Hold Ship Position / Avoid Water)
        // =========================================================
        if (typeof inNavalBattle !== 'undefined' && inNavalBattle) {
            let isRanged = unit.stats.isRanged;
            // Cavalry & Commanders are completely paralyzed so they don't drown
            let isCavalry = isLargeUnit || unit.isCommander || String(unit.unitType).toLowerCase().includes("cav");
            
            if (isCavalry) {
                shouldHold = true;
                unit.vx = 0; unit.vy = 0;
            } else if (isRanged) {
                // Ranged units hold firm unless explicitly commanded, avoiding the plank gap
                if (dist > 30 && !unit.hasOrders) {
                    shouldHold = true;
                    unit.vx = 0; unit.vy = 0;
                }
            } else {
                // Melee units hold the choke point near the planks. 
                // They will only pursue if an enemy gets extremely close (150px)
                if (dist > 150 && !unit.hasOrders) {
                    shouldHold = true;
                    unit.vx = 0; unit.vy = 0;
                }
            }
        }
        // =========================================================
		// Land battles  (unit.side === "player" && !unit.hasOrders) 
		// =========================================================
				
            // Allow archers to move to their auto-assigned positions near the wall
            if (unit.stats.isRanged) {
                // Only hold if they are already close to their waypoint
                if (dist < 20) shouldHold = true; 
            }
            else if (dist > 50) shouldHold = true; 
        }
			// =========================================================
			// SIEGE MOVEMENT & ANTI-STUCK OVERHAUL
			// =========================================================
			if (inSiege) {

						// ---> SURGERY: DETECT CLIMBING TILE <---
						let tx = Math.floor(unit.x / BATTLE_TILE_SIZE);
						let ty = Math.floor(unit.y / BATTLE_TILE_SIZE);
						let currentTile = (battleEnvironment.grid[tx] && battleEnvironment.grid[tx][ty]) ? battleEnvironment.grid[tx][ty] : 0;
						isOnLadderTile = (currentTile === 9 || currentTile === 12);
						
						// Determine if unit is cavalry/large
					  
					  // If they are on the wall, their target is on the ground, and they are out of range, STOP moving.
			if (unit.onWall && unit.target && !unit.target.onWall && !unit.target.isDummy) {
				let effRange = unit.stats.currentStance === "statusmelee" ? 30 : unit.stats.range;
				if (dist > effRange * 0.8) {
					
					// SURGERY: Only DEFENDERS should hold the wall. Attackers must push inward!
					if (unit.side === "enemy") { 
						shouldHold = true;
						unit.vx = 0; 
						unit.vy = 0;
					}
				}
			}
            // Anti-Stuck Tracking: Monitors physical coordinate changes over time
            if (!unit.stuckLog) unit.stuckLog = { x: unit.x, y: unit.y, ticks: 0 };
            
            let distMovedInLog = Math.hypot(unit.x - unit.stuckLog.x, unit.y - unit.stuckLog.y);
            if (distMovedInLog < 1.0) {
                unit.stuckLog.ticks++;
            } else {
                unit.stuckLog.x = unit.x;
                unit.stuckLog.y = unit.y;
                unit.stuckLog.ticks = 0;
            }

// DEFENDER COHESION
if (unit.side === "enemy") {
    let southGate = battleEnvironment.cityGates ? battleEnvironment.cityGates.find(g => g.side === "south") : null;
    let isGateBreached = !southGate || southGate.isOpen;
    
    if (!isGateBreached) {
        // Pre-Breach: Form an organized shield wall. 
        // We removed the Math.random() jitter here. They now smoothly march to the coordinates assigned in targeting!
        if (unit.target && unit.target.isDummy) {
            dx = unit.target.x - unit.x;
            dy = unit.target.y - unit.y;
            dist = Math.hypot(dx, dy);
        }

        if (dist < 30) shouldHold = true; 

        let isMelee = !unit.stats.isRanged;
        // Defend the line - hold formation
        if (isMelee && !unit.onWall && dist < 40) {
            shouldHold = true;
            unit.vx = 0; 
            unit.vy = 0;
        }

    } else {
                    // Post-Breach Fallback
                    if (!unit.breachTimestamp) unit.breachTimestamp = Date.now();
                    if (Date.now() - unit.breachTimestamp < 10000) speedMod *= 1.30; 

                    let plazaX = typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelX : BATTLE_WORLD_WIDTH / 2;
                    let plazaY = typeof SiegeTopography !== 'undefined' ? SiegeTopography.plazaPixelY : BATTLE_WORLD_HEIGHT / 2;
                    let distToPlaza = Math.hypot(plazaX - unit.x, plazaY - unit.y);

                    if (distToPlaza > 200) {
                        shouldHold = false;
                        if (unit.onWall && !isOnLadderTile && typeof cityLadders !== 'undefined' && cityLadders.length > 0) {
                            let closestLadder = cityLadders.reduce((prev, curr) => Math.hypot(curr.x - unit.x, curr.y - unit.y) < Math.hypot(prev.x - unit.x, prev.y - unit.y) ? curr : prev);
                            dx = closestLadder.x - unit.x;
                            dy = closestLadder.y - unit.y;
                            dist = Math.hypot(dx, dy);
                        } 
                    } else {
                        // Organized Stand at Plaza
                        if (unit.target && unit.target.priority === "plaza") shouldHold = true; 
                    }
                }
            }
        }
        // =========================================================

        if (shouldHold) {
            unit.state = "idle";
            if (unit.stats.stamina < 100 && Math.random() > 0.9) unit.stats.stamina++;
        } else {
            if (Math.random() > 0.9) unit.stats.stamina = Math.max(0, unit.stats.stamina - 1);
            
            let moveVector = { dx: dx, dy: dy, dist: dist };
            if (inSiege && typeof getSiegePathfindingVector === 'function') {
                moveVector = getSiegePathfindingVector(unit, unit.target, dx, dy, dist);
            }

// ... (Inside _handleMovement, below the moveVector calculation) ...
            
            // Calculate base velocity
            let vx = (moveVector.dx / moveVector.dist) * (unit.stats.speed * speedMod);
            let vy = (moveVector.dy / moveVector.dist) * (unit.stats.speed * speedMod);

            // ---> SURGERY: LADDER PHYSICS ENGINE <---
            if (isOnLadderTile) {
                if (isLargeUnit) {
                    vx = 0; vy = 0; unit.vx = 0; unit.vy = 0;
                } else {
                    vx = 0; 
                    vy *= 0.30;
                }
            }

            if (unit.stats.morale > 3 && unit.stats.morale < 10) {
                let dir = unit.side === "player" ? 1 : -1;
                let safeEdge = unit.side === "player" ? BATTLE_WORLD_HEIGHT - 100 : 100;
                let notAtEdge = unit.side === "player" ? unit.y < safeEdge : unit.y > safeEdge;

                if (notAtEdge) {
                    vy = (unit.stats.speed * speedMod * 0.5) * dir;
                    vx = (Math.random() - 0.5);
                } else {
                    vx = 0; vy = 0;
                }
            }

// --- EXTREME RANDOMNESS FOR ATTACKERS NEAR THE GATE ---
if (inSiege && unit.side === "player") {
    let southGate = typeof battleEnvironment !== 'undefined' && battleEnvironment.cityGates ? battleEnvironment.cityGates.find(g => g.side === "south") : null;
    let gateX = southGate && southGate.pixelRect ? southGate.pixelRect.x + (southGate.pixelRect.w / 2) : (typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelX : BATTLE_WORLD_WIDTH / 2);
    let gateY = southGate && southGate.pixelRect ? southGate.pixelRect.y + (southGate.pixelRect.h / 2) : (typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelY : BATTLE_WORLD_HEIGHT / 2);
    
    let distToGate = Math.hypot(unit.x - gateX, unit.y - gateY);

    // FIX: Only trigger the "Panic Shuffle" if the unit hasn't moved for at least 1 second (60 ticks)
    if (distToGate < 50 && unit.stuckLog && unit.stuckLog.ticks > 160) {
        // Massive, chaotic movement around the breach as a last resort
        vx += (Math.random() - 0.5) * (unit.stats.speed * 4.5);
        vy += (Math.random() - 0.5) * (unit.stats.speed * 4.5);
    }
}

// --- STUCK PREVENTION OVERHAUL (STRICTER & CALIBRATED) ---
            if (inSiege && unit.stuckLog) {
                
                // 1. LADDER SPECIFIC - 5 SECOND (600 TICKS) UNSTICK FALLBACK
                // Added !unit.unstickCooldown to ensure we don't trigger while already recovering
                if ((isOnLadderTile || unit.isClimbing || unit.onWall) && !unit.unstickCooldown) {
                    
                    if (unit.stuckLog.ticks > 300) { 
                        if (!unit.unstickAttempts) unit.unstickAttempts = 0;
                        unit.unstickAttempts++;

                      // Phase 2: Only trigger after Phase 1 (the jump back) has already failed
                        if (unit.unstickAttempts > 1) {
                            // Panic for ~2.5 seconds (150 ticks) instead of 30 seconds
                            unit.randomPanicTimer = 150; 
                            unit.unstickAttempts = 0; 
                            
                            // Cooldown: prevent this unit from triggering any unstick logic 
                            // for the next 10 seconds (600 ticks) to let them settle
                            unit.unstickCooldown = 600; 
                        } else {
                            // Phase 1: Smooth vertical slide down (24 frames * 5px = 120px)
                            unit.ladderSlideTimer = 24; 
                            
                            // Strip states immediately so they detach from the ladder logic
                            unit.isClimbing = false;
                            unit.onWall = false;
                            unit.stuckLog.ticks = 0;
                        }
                    }
                } 
// 2. STANDARD LATERAL OVERRIDE FOR GROUND UNITS (1 SEC)
                // SURGERY: Ignore lateral unstick if actively retreating to stop border sliding
                else if (unit.stuckLog.ticks > 60 && !unit.unstickCooldown && unit.orderType !== "retreat") {
                    let perpX = -vy;
                    let perpY = vx;
                    vx = perpX * 1.5 + ((Math.random() - 0.5) * unit.stats.speed);
                    vy = perpY * 1.5 + ((Math.random() - 0.5) * unit.stats.speed);
                    
                    if (unit.stuckLog.ticks > 180) {
                        unit.target = null;
                        unit.stuckLog.ticks = 0;
                        unit.unstickCooldown = 120; // Short 2-second rest
                    }
                }
            } 

            // Tick down the cooldown
            if (unit.unstickCooldown > 0) {
                unit.unstickCooldown--;
            }

                       // --- LADDER approach VECTOR (Fast-Track for specialists) ---
            if (inSiege && unit.side === "player" && !unit.onWall && unit.target && unit.target.isLadderAssault) {
                const _isSpecialist = (unit.siegeRole === "ladder_fanatic" || unit.siegeRole === "ladder_carrier");
                const _ldrRef  = unit.targetLadder || unit.target;
                const _ftDx    = _ldrRef.x - unit.x;
                const _ftDy    = (_ldrRef.y != null ? _ldrRef.y - 10 : unit.target.y - 15) - unit.y;
                const _ftDist  = Math.hypot(_ftDx, _ftDy) || 1;

                if (_isSpecialist && _ftDist < 280) {
                    // FAST-TRACK: bypass flocking — perfectly straight line to ladder base
                    unit.ignoreSeparation = true;
                    vx = (_ftDx / _ftDist) * (unit.stats.speed * 1.6);
                    vy = (_ftDy / _ftDist) * (unit.stats.speed * 1.6);
                } else {
                    unit.ignoreSeparation = false;
                    vx = (_ftDx / _ftDist) * (unit.stats.speed * 1.2);
                    vy = (_ftDy / _ftDist) * (unit.stats.speed * 1.2);
                }
            }


          // --- SHORT PANIC MOVEMENT (2.5 SECONDS) ---
            if (unit.randomPanicTimer && unit.randomPanicTimer > 0) {
                // Reduced multiplier to 3.5x so they don't look like they are teleporting
                vx = (Math.random() - 0.5) * (unit.stats.speed * 1.1);
                vy = (Math.random() - 0.5) * (unit.stats.speed * 1.1);
                unit.randomPanicTimer--;

                // CRITICAL: Clear stuck ticks when panic ends so they don't immediately re-trigger
                if (unit.randomPanicTimer <= 0) {
                    unit.stuckLog.ticks = 0;
                }
            }

            // --- NEW SURGERY: SMOOTH VERTICAL LADDER RECOVERY ---
            if (unit.ladderSlideTimer && unit.ladderSlideTimer > 0) {
                vx = 0; // Cancel normal velocity calculation
                vy = 0; 
                
                // Directly edit position to bypass collision entirely (5px micro-teleports)
                unit.x += (Math.random() - 0.5) * 0.5; // Slight visual shake side-to-side
                unit.y += 1; // Drop straight down 5 pixels
                
                unit.ladderSlideTimer--;
            }

         let nextX = unit.x + vx;
            let nextY = unit.y + vy;

            // SURGERY: THE IRON CAGE (Universal Boundary Clamp)
            // Mathematically forbids flocking from pushing units into the void
            if (unit.state !== "FLEEING" && unit.state !== "retreated") {
                const mapMargin = 15; 
                const maxW = typeof BATTLE_WORLD_WIDTH !== 'undefined' ? BATTLE_WORLD_WIDTH : 2400;
                const maxH = typeof BATTLE_WORLD_HEIGHT !== 'undefined' ? BATTLE_WORLD_HEIGHT : 1600;

                if (nextX < mapMargin) { nextX = mapMargin; vx = 0; }
                if (nextX > maxW - mapMargin) { nextX = maxW - mapMargin; vx = 0; }
                if (nextY < mapMargin) { nextY = mapMargin; vy = 0; }
                if (nextY > maxH - mapMargin) { nextY = maxH - mapMargin; vy = 0; }
            }

// SURGERY 3: Defender Hard-Line — EXTREME MEASURE (NO EXCEPTIONS)
            if (inSiege && unit.side === "enemy" && !unit.isFalling) {
				
                let southGate = typeof battleEnvironment !== 'undefined' && battleEnvironment.cityGates ? battleEnvironment.cityGates.find(g => g.side === "south") : null;
                let isGateBreached = !southGate || southGate.isOpen || southGate.gateHP <= 0 || window.__SIEGE_GATE_BREACHED__;
                
                // If the gate is still alive, absolutely NO defender crosses the wall boundary.
                if (!isGateBreached) {
                    const StrictWallY = (typeof SiegeTopography !== 'undefined' ? SiegeTopography.wallPixelY : 2000) - 15; // 85px safety buffer
                    
                    if (nextY > StrictWallY) {
                        nextY = StrictWallY; // Hard mathematical clamp
                        vy = 0;              // Destroy forward momentum
                        
                        // For melee units that hit the invisible wall, force them to stop walking entirely
                        if (!unit.stats.isRanged) {
                            unit.vx = 0; 
                            unit.state = "idle";
                        }
                    }
                }
            }


			if (typeof isBattleCollision === 'function') {
                // 1. Determine if this unit should phase through others (Ladders/Stairs)
                // Tile 9 = Ground Ladders, Tile 12 = Tower Wrap-around Ladders
                let ignoreCollision = (unit.siegeRole === "ladder_fanatic" || isOnLadderTile);

                // 2. SURGERY: CAVALRY BAN LOGIC
                // If the unit is large/mounted and they are on a ladder tile, 
                // we FORCE canMove to false so they cannot overlap with the ladder.
                let isBlockedCavalry = (isLargeUnit && isOnLadderTile);

                let canMoveX = !isBlockedCavalry && (ignoreCollision || !isBattleCollision(nextX, unit.y, unit.onWall, unit));
                let canMoveY = !isBlockedCavalry && (ignoreCollision || !isBattleCollision(unit.x, nextY, unit.onWall, unit));

                if (canMoveX) unit.x = nextX;
                if (canMoveY) unit.y = nextY;

                // 3. SURGERY: STUCK PROTECTION FOR LADDERS
                // If a large unit somehow ends up stuck inside Tile 12, push them back
                if (isBlockedCavalry) {
                    unit.vx = 0; unit.vy = 0;
                    // Optional: nudge them slightly south to get them off the ladder tile
                    unit.y += 2; 
                }

            } else {
                // Fallback for when collision function is missing
                if (!(isLargeUnit && isOnLadderTile)) {
                    unit.x = nextX;
                    unit.y = nextY;
                }
            }

            if (typeof applyPinballEscape === 'function') {
                applyPinballEscape(unit);
            }
        }
    },
_handleCombatExecution: function(unit, dx, dy, dist, battleEnv, player) {
        // HARD GUARD: Abort combat if target is a dummy, an engine, or lacks stats entirely
        if (!unit.target || unit.target.isDummy || !unit.target.stats) {
            if (!unit.isCommander) unit.state = "idle";
            if (unit.stats && unit.stats.stamina < 100 && Math.random() > 0.9) unit.stats.stamina++;
            return;
        }

        if (!unit.isCommander || !player.isMoving) {
            unit.state = "attacking";
        }

        if (unit.cooldown <= 0) {
            if (unit.stats.currentStance === "statusrange" && unit.stats.ammo <= 0) {
                unit.stats.currentStance = "statusmelee";
            }

          if (unit.stats.currentStance === "statusrange") {
                
                // --- UNIVERSAL MAGAZINE SURGERY ---
                // 1. Get the max magazine size (Defaults to 1 for standard archers)
                let maxMag = (unit.stats && unit.stats.magazine) ? unit.stats.magazine : 1;
                
                // 2. Initialize current magazine if it doesn't exist
                if (unit.currentMag === undefined) {
                    unit.currentMag = maxMag;
                }

                // 3. Spend ammo
                unit.currentMag--;
                unit.stats.ammo--;

                // 4. Cooldown Routing
                if (unit.currentMag <= 0) {
                    // Magazine Empty: Trigger the full reload (e.g., 300 for repeater, 170 for archers)
                    unit.cooldown = getReloadTime(unit);
                    unit.currentMag = maxMag; // Refill the internal magazine
                } else {
                    // Magazine has ammo: Trigger the rapid burst
                    unit.cooldown = 50; 
                }
                // ----------------------------------

                let spread = (100 - unit.stats.accuracy) * 2.5;
                let targetX = unit.target.x + (Math.random() - 0.5) * spread;
                let targetY = unit.target.y + (Math.random() - 0.5) * spread;
                let angle = Math.atan2(targetY - unit.y, targetX - unit.x);
                let speed = 12; 

                battleEnv.projectiles.push({
                    x: unit.x, y: unit.y,
                    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                    startX: unit.x, startY: unit.y,
                    maxRange: unit.stats.range + 50,
                    attackerStats: unit.stats,
                    side: unit.side,
                    projectileType: (unit.unitType === "Rocket") ? "Archer" : unit.unitType,
                    isFire: ["Firelance", "Bomb", "Rocket"].includes(unit.unitType)
                });

				const ut = String(unit.unitType).toLowerCase();
                const ur = String(unit.stats?.role || "").toLowerCase();
                
                if (ut === "bomb") BattleAudio.playBombChain(unit.x, unit.y, 1);
                else if (ut.includes("firelance")) BattleAudio.playFirelanceBurst(unit.x, unit.y, ut.includes("heavy"));
                else if (ut.includes("rocket")) BattleAudio.playRocketVolley(unit.x, unit.y, 5); 
                else if (ur.includes("gunner") || ut.includes("cannon")) BattleAudio.playGunpowderShot(unit.x, unit.y, ut.includes("cannon"));
                else if (ur.includes("crossbow") || ur.includes("repeater")) BattleAudio.playCrossbowRelease(unit.x, unit.y);
                else if (ur.includes("throwing") || ut.includes("slinger") || ut.includes("javelin")) BattleAudio.playSlingerRelease(unit.x, unit.y);
                else BattleAudio.playArcheryRelease(unit.x, unit.y);

            } else {
                unit.cooldown = getReloadTime(unit);
             let stateStr = "melee_attack";

                // SURGERY: Timer-based Charge Bonus (Prevents infinite charging)
                if (typeof ROLES !== 'undefined' ) {
                    if (typeof unit.engagedTicks === 'undefined') unit.engagedTicks = 0;
                    unit.engagedTicks++;
                    
                    // Charge bonus lasts for the first ~3 seconds of melee contact (roughly 180 frames)
                    if (unit.engagedTicks < 180) {
                        stateStr += " charging";
                    }
                }
                
                if (typeof isFlanked !== 'undefined' && isFlanked(unit, unit.target)) stateStr += " flanked";
                
                let dmg = typeof calculateDamageReceived !== 'undefined' ? calculateDamageReceived(unit.stats, unit.target.stats, stateStr) : 10;
                unit.target.hp -= dmg;

                if (unit.side === "player" && unit.stats.gainExperience) {
                    let baseExp = unit.isCommander ? 0.05 : 0.35;
                    if (unit.target.hp <= 0) baseExp *= 3;
                    unit.stats.gainExperience(baseExp);

                    if (unit.isCommander && typeof gainPlayerExperience === 'function') {
                        gainPlayerExperience(baseExp);
                    }
                }

                if (dmg > (unit.target.stats.health * 0.25)) {
                    unit.target.stats.morale -= 5;
                }

				const utMelee = String(unit.unitType).toLowerCase();
                const urMelee = String(unit.stats?.role || "").toLowerCase();
                const isHeavy = urMelee.includes("two_handed") || urMelee.includes("heavy");
                
                // 1. Attack Swing/Thrust
                if (urMelee.includes("pike") || utMelee.includes("glaive") || utMelee.includes("spear")) {
                    BattleAudio.playPolearm(unit.x, unit.y, urMelee.includes("pike"));
                } else if (unit.unitType === "War Elephant") {
                    BattleAudio.playMountIdle(unit.x, unit.y, "elephant"); 
                } else {
                    BattleAudio.playMeleeAttack(unit.x, unit.y, isHeavy);
                }

                // 2. Impact
                if (dmg > 0) {
                    let armorType = unit.target.stats.armor > 10 ? "armor" : "flesh";
                    BattleAudio.playMeleeHit(unit.x, unit.y, armorType);
                } else {
                    BattleAudio.playMeleeParry(unit.x, unit.y);
                }

                unit.target.x += (dx / dist) * 5;
                unit.target.y += (dy / dist) * 5;
            }
        }
    
	},
	
	processProjectilesAndCleanup: function(battleEnvironment) {
        // ---> 30 SECOND CLEANUP LOGIC <---
        const THIRTY_SECONDS = 30000;
        const nowTime = Date.now();
        let units = battleEnvironment.units;

        if (battleEnvironment.groundEffects) {
            battleEnvironment.groundEffects = battleEnvironment.groundEffects.filter(g => (nowTime - g.timestamp) < THIRTY_SECONDS);
        }

        units.forEach(u => {
            if (u.stuckProjectiles) {
                u.stuckProjectiles = u.stuckProjectiles.filter(sp => (nowTime - sp.timestamp) < THIRTY_SECONDS);
            }
        });

/* 4. UPDATE PROJECTILES (PHYSICS BASED COLLISION) */
        for (let i = battleEnvironment.projectiles.length - 1; i >= 0; i--) {
            let p = battleEnvironment.projectiles[i];

            // 1. Save previous position for Continuous Collision Detection
            let prevX = p.x;
            let prevY = p.y;

            // Move projectile along its vector
            p.x += p.vx;
            p.y += p.vy;

            let role = p.attackerStats ? p.attackerStats.role : "";
            let name = p.attackerStats ? p.attackerStats.name : "";

            let isJavelin = name === "Javelinier";
            let isBolt = role === "crossbow" || role === "crossbowman";
            let isArrow = role === "archer" || role === "horse_archer";
            let isSlinger = name === "Slinger";
            let isRocket = (p.projectileType === "rocket") || (p.attackerStats && p.attackerStats.name.includes("Rocket"));
            let isBomb = role === "bomb" || name === "Bomb";

            // 2. Range & Bounds Check (Hit the Ground)
            let distFlown = Math.hypot(p.x - p.startX, p.y - p.startY);
            if (distFlown > p.maxRange ||
                p.x < -200 || p.x > (typeof BATTLE_WORLD_WIDTH !== 'undefined' ? BATTLE_WORLD_WIDTH : 2000) + 200 ||
                p.y < -200 || p.y > (typeof BATTLE_WORLD_HEIGHT !== 'undefined' ? BATTLE_WORLD_HEIGHT : 2000) + 200) {

                if (isJavelin || isBolt || isArrow || isSlinger || isRocket || isBomb) {
                    if (!battleEnvironment.groundEffects) battleEnvironment.groundEffects = [];
                    if (battleEnvironment.groundEffects.length < 400) {

                        let effectType = isJavelin ? "javelin"
                            : (isBolt ? "bolt"
                                : (isSlinger ? "stone"
                                    : (isRocket ? "rocket"
                                        : (isBomb ? "bomb_crater" : "arrow"))));

                        const bounceChance = 0.30;
                        const landedX = p.x + (Math.random() - 0.5) * 18;
                        const landedY = p.y + (Math.random() - 0.5) * 18;

                        let landedAngle = Math.atan2(p.vy, p.vx) + (Math.random() - 0.5) * 0.9;

                        // 30% of the time, add a stronger "bounce" style angle shift
                        if (Math.random() < bounceChance) {
                            landedAngle += (Math.random() > 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.7);
                        }

                        battleEnvironment.groundEffects.push({
                            type: effectType,
                            x: landedX,
                            y: landedY,
                            angle: landedAngle,
                            timestamp: Date.now()
                        });
                    }
                }

				if (isBomb) {
                    BattleAudio.playBombChain(p.x, p.y, 1);
                } else if (isRocket || p.projectileType === "firelance") {
                    BattleAudio.playFirelanceBurst(p.x, p.y, false);
                } else {
                    BattleAudio.playProjectileHit(p.x, p.y, "miss");
                }
				
				
                battleEnvironment.projectiles.splice(i, 1);
                continue;
            }
// 3. Physical Hitbox Collision (Upgraded to Raycasting)
            let hitMade = false;

            for (let j = 0; j < units.length; j++) {
                let u = units[j];

                // Only check living enemies
                if (u.hp > 0 && u.side !== p.side && !u.isFalling) {
                    let hitbox = u.stats && u.stats.isLarge ? 16 : 8;
                    
                    // Raycast from the previous frame's coordinates to the current coordinates
                    let isHit = lineIntersectsCircle(prevX, prevY, p.x, p.y, u.x, u.y, hitbox);

                    if (isHit) {
                        // 1. Anti-Multi-Hit Guard: Prevent piercing projectiles from hitting the same unit every frame
                        if (!p.hitList) p.hitList = new Set();
                        if (p.hitList.has(u.id || u)) continue; // Use u.id if available, fallback to object ref

                        // 2. Pass-Through (Pierce) Logic
                        let inSiege = typeof inSiegeBattle !== 'undefined' && inSiegeBattle;
                        let pierceChance = inSiege ? 0.30 : 0.10; // 10% pierce on land, 30% in siege
                        let doesPierce = Math.random() < pierceChance;

                        // Deal Damage
                        let dmg = typeof calculateDamageReceived === 'function' ? calculateDamageReceived(p.attackerStats, u.stats, "ranged_attack") : 1;
                        u.hp -= dmg;
                        
                        p.hitList.add(u.id || u); // Mark unit as hit

                        // 3. Handle Stopping vs Piercing
                        if (!doesPierce) {
                            hitMade = true; // Mark to destroy the projectile later

                            // Stick to Unit Bodies ONLY if the projectile stops inside them
                            if (isJavelin || isBolt || isArrow || isRocket) {
                                if (!u.stuckProjectiles) u.stuckProjectiles = [];
                                if (u.stuckProjectiles.length < 4) {
                                    let effectType = isJavelin ? "javelin" : (isBolt ? "bolt" : (isSlinger ? "stone" : (isRocket ? "rocket" : "arrow")));
                                    u.stuckProjectiles.push({
                                        type: effectType,
                                        offsetX: p.x - u.x,
                                        offsetY: p.y - u.y,
                                        angle: Math.atan2(p.vy, p.vx),
                                        timestamp: Date.now()
                                    });
                                }
                            }
                        }

                        // Bomb direct hits create craters directly under the unit (Always happens)
                        if (isBomb) {
                            if (!battleEnvironment.groundEffects) battleEnvironment.groundEffects = [];
                            battleEnvironment.groundEffects.push({
                                type: "bomb_crater",
                                x: p.x, y: p.y, angle: 0, timestamp: Date.now()
                            });
                        }

                        // 4. EXP and Audio Logic
                        let attackerUnit = units.find(a => a.stats === p.attackerStats);
                        if (attackerUnit && attackerUnit.side === "player" && p.attackerStats.gainExperience) {
                            let baseExp = attackerUnit.isCommander ? 0.05 : 0.35;
                            if (u.hp <= 0) baseExp *= 3;
                            p.attackerStats.gainExperience(baseExp);
                            if (attackerUnit.isCommander && typeof gainPlayerExperience === 'function') gainPlayerExperience(baseExp);
                        }

					if (isBomb) {
                            BattleAudio.playBombChain(p.x, p.y, 1);
                        } else {
                            let armorType = u.stats.armor > 10 ? "armor" : "flesh";
                            if (dmg > 0) {
                                BattleAudio.playProjectileHit(p.x, p.y, armorType);
                            } else {
                                BattleAudio.playProjectileHit(p.x, p.y, "shield");
                            }
                        }
						
                        // If it stopped, break the loop. If it pierced, keep checking other units behind them!
                        if (!doesPierce) {
                            break; 
                        }
                    }
                }
            }

            // ════════════════════════════════════════════════════════════════
            // STRUCTURE COLLISION — Walls, Towers, Walkways, Siege Engines
            // Runs only if the projectile didn't already hit a unit.
            // ════════════════════════════════════════════════════════════════
            
            let minStickDist = (isArrow || isBolt) ? 100 : 30;
            let canHitStructure = distFlown >= minStickDist;

            if (!hitMade && canHitStructure && typeof BATTLE_TILE_SIZE !== 'undefined' && battleEnvironment.grid) {
                let ptx  = Math.floor(p.x / BATTLE_TILE_SIZE);
                let pty  = Math.floor(p.y / BATTLE_TILE_SIZE);
                let tile = (battleEnvironment.grid[ptx] && battleEnvironment.grid[ptx][pty] !== undefined)
                           ? battleEnvironment.grid[ptx][pty] : -1;

                let hitsWall     = (tile === 6 || tile === 7); 
                let hitsWalkway  = (tile === 8 || tile === 12); 
                let impactAngle = Math.atan2(p.vy, p.vx);

                // ── WALL & WALKWAY collision ──────────────────────────────────
                if (hitsWall || hitsWalkway) {
                    let stickChance = 0;
                    if (p.side === "enemy") {
                        stickChance = 0.05; 
                    } else {
                        stickChance = hitsWall ? 0.10 : 0.20;
                    }
                    
                    if (Math.random() <= stickChance) {
                        hitMade = true;
                        if (!battleEnvironment.groundEffects) battleEnvironment.groundEffects = [];

                        if (isBomb) {
                            if (battleEnvironment.groundEffects.length < 500) {
                                battleEnvironment.groundEffects.push({
                                    type: "bomb_crater", x: p.x, y: p.y, angle: 0,
                                    stuckOnStructure: true, structureTile: tile, timestamp: Date.now()
                                });
                            }
                            if (window.cityTowerPositions) {
                                for (let twr of window.cityTowerPositions) {
                                    let d = Math.hypot(twr.pixelX - p.x, twr.pixelY - p.y);
                                    if (d < 90) {
                                        if ((twr.hp ?? 300) <= 0) continue; 
                                        twr.hp = (twr.hp ?? 300) - 70;
                                        if (twr.hp < 0) twr.hp = 0;
                                    }
                                }
                            }
							
						
// GOOD
BattleAudio.playBombChain(p.x, p.y, 1);


                        } else if (p.projectileType === "firelance" || (p.projectileType && p.projectileType.includes("Firelance"))) {
                            if (battleEnvironment.groundEffects.length < 500) {
                                battleEnvironment.groundEffects.push({
                                    type: "scorch_wall", x: p.x, y: p.y, angle: impactAngle,
                                    stuckOnStructure: true, structureTile: tile, timestamp: Date.now()
                                });
                            }
                        } else if (isJavelin || isBolt || isRocket || isSlinger || isArrow) {
                            let efType = isJavelin ? "javelin" : isBolt ? "bolt" : isRocket ? "rocket" : isSlinger ? "stone" : "arrow";
                            if (battleEnvironment.groundEffects.length < 500) {
                                battleEnvironment.groundEffects.push({
                                    type: efType, x: p.x, y: p.y, angle: impactAngle,
                                    stuckOnStructure: true, structureTile: tile, timestamp: Date.now()
                                });
                            }
                        }
                    }
                }

               // ── SIEGE ENGINE collision ────────────────────────────────────
                if (!hitMade && typeof siegeEquipment !== 'undefined') {
                    let hitModifier = (p.side === "player") ? 0.05 : 1.0;

                    if (siegeEquipment.ladders) {
                        for (let ldr of siegeEquipment.ladders) {
                            if (!ldr.isDeployed || ldr.hp <= 0) continue;
                            let d = Math.hypot(p.x - ldr.x, p.y - ldr.y);
                            if (d < 16) {
                                let hitChance = (p.side === "player") ? 0.05 : 0.95;
                                
                                if (Math.random() <= hitChance) {
                                    hitMade = true;
                                    ldr.hp -= isBomb ? 60 : 12;
                                    
                                    let isStickingProjectile = isJavelin || isBolt || isArrow;
                                    if (isStickingProjectile && battleEnvironment.groundEffects && battleEnvironment.groundEffects.length < 500) {
                                        let efType = isJavelin ? "javelin" : isBolt ? "bolt" : "arrow";
                                        battleEnvironment.groundEffects.push({
                                            type: efType, x: p.x, y: p.y, angle: impactAngle,
                                            stuckOnStructure: true, structureTile: 98, timestamp: Date.now()
                                        });
                                    }
                                }
                                break; 
                            }
                        }
                    }
                    if (!hitMade && siegeEquipment.rams) {
                        for (let ram of siegeEquipment.rams) {
                            if (ram.hp <= 0) continue;
                            let d = Math.hypot(p.x - ram.x, p.y - ram.y);
                            if (d < 20) {
                                if (Math.random() <= (0.60 * hitModifier)) {
                                    hitMade = true;
                                    ram.hp -= isBomb ? 80 : 10;
                                    if (battleEnvironment.groundEffects && battleEnvironment.groundEffects.length < 500) {
                                        let efType = isJavelin ? "javelin" : isBolt ? "bolt" : isArrow ? "arrow" : "stone";
                                        battleEnvironment.groundEffects.push({
                                            type: efType, x: p.x, y: p.y, angle: impactAngle,
                                            stuckOnStructure: true, structureTile: 98, timestamp: Date.now()
                                        });
                                    }
                                }
                                break;
                            }
                        }
                    }
                }
            } // <--- FIX: This bracket safely closes the Structure Collision block

            // ════════════════════════════════════════════════════════════════
            // THE FIX: Deletion is now outside the structure block!
            // ════════════════════════════════════════════════════════════════
            if (hitMade) {
                battleEnvironment.projectiles.splice(i, 1);
            }
        }
    }
};
 // This closing brace for the AICategories object was missing!

// =========================================================
// AI PINBALL ESCAPE SYSTEM (Anti-Stuck Fallback)
// =========================================================

function applyPinballEscape(unit) {
    // 1. Initialize trackers
    if (!unit.positionHistory) unit.positionHistory = [];
    if (!unit.pinballTimer) unit.pinballTimer = 0;

// 2. Are we currently in Pinball Mode?
    if (unit.pinballTimer > 0) {
        // Violently bounce them in the saved random direction
        unit.x += unit.pinballVector.x;
        unit.y += unit.pinballVector.y;
        
        // SURGERY: Clamp pinball bounces so they don't blast through the map border
        const mapMargin = 15; 
        const maxW = typeof BATTLE_WORLD_WIDTH !== 'undefined' ? BATTLE_WORLD_WIDTH : 2400;
        const maxH = typeof BATTLE_WORLD_HEIGHT !== 'undefined' ? BATTLE_WORLD_HEIGHT : 1600;
        
        if (unit.x < mapMargin) unit.x = mapMargin;
        if (unit.x > maxW - mapMargin) unit.x = maxW - mapMargin;
        if (unit.y < mapMargin) unit.y = mapMargin;
        if (unit.y > maxH - mapMargin) unit.y = maxH - mapMargin;

        unit.pinballTimer--;
        return true; // We moved them, skip normal movement this frame!
    }
    // 3. Track their history (Save last 30 frames)
    unit.positionHistory.push({ x: unit.x, y: unit.y });
    if (unit.positionHistory.length > 30) {
        unit.positionHistory.shift(); // Keep array size small
    }

    // 4. Check if they are stuck
    // If they have a target but haven't moved more than 5 pixels in 30 frames
    if (unit.positionHistory.length === 30 && unit.hasOrders) {
        let oldPos = unit.positionHistory[0];
        let dx = unit.x - oldPos.x;
        let dy = unit.y - oldPos.y;
        let distanceMovedSq = (dx * dx) + (dy * dy);
	if (distanceMovedSq < 9) { // 5 pixels squared
            
// Replace the old isDummy block with this:

if (unit.target && unit.target.isDummy) {
    // Increased from 16 to 45 to accommodate the 40px 'shouldHold' formation radius
    let distToDummy = Math.hypot(unit.x - unit.target.x, unit.y - unit.target.y);
    if (distToDummy < 45) { 
        unit.positionHistory = []; 
        return false; 
    }
}

// ---> ADD THIS CRITICAL SAFEGUARD HERE <---
// Never pinball a unit that is actively climbing a ladder
if (unit.isClimbing) {
    unit.positionHistory = [];
    return false;
}

// --- NEW GUARD: DO NOT BOUNCE INTENTIONALLY IDLE UNITS OR LADDER SWARMERS! ---
// Added "hold_position" alongside retreat to prevent units from bouncing into the abyss.
if ( unit.state === "idle" || unit.state === "attacking" || unit.disableAICombat || unit.orderType === "retreat" || unit.orderType === "hold_position" || unit.siegeRole === "cavalry_reserve" || unit.siegeRole === "treb_crew" || unit.siegeRole === "trebuchet_crew" || unit.siegeRole === "engine_crew") {
    unit.positionHistory = []; // Clear history to prevent memory bloat
    return false; // Abort the pinball logic entirely for this unit
}
// UNIT IS STUCK! INITIATE PINBALL BOUNCE!
            let bounceAngle;
            if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle && unit.side === "enemy") {
                // DEFENDERS BOUNCE NORTH (Between -45 and -135 degrees)
                bounceAngle = -Math.PI/2 + ((Math.random() - 0.5) * Math.PI/2);
            } else {
                // EVERYONE ELSE BOUNCES SOUTH
                bounceAngle = (Math.PI / 4) + (Math.random() * (Math.PI / 2));
            }
            let bounceForce = 1.3;
unit.pinballVector = {
    x: Math.cos(bounceAngle) * bounceForce,
    y: Math.sin(bounceAngle) * bounceForce
};

unit.pinballTimer = 5; 
unit.positionHistory = []; 

return true; // Use a semicolon here, NOT a comma.
        }
    }
    
    return false; // Not stuck, proceed with normal movement
}

// Add this helper function at the bottom of the file
function lineIntersectsCircle(x1, y1, x2, y2, cx, cy, r) {
    let dx = x2 - x1;
    let dy = y2 - y1;
    let fx = x1 - cx;
    let fy = y1 - cy;

    let a = dx * dx + dy * dy;
    let b = 2 * (fx * dx + fy * dy);
    let c = (fx * fx + fy * fy) - (r * r);

    let discriminant = b * b - 4 * a * c;
    
    // No intersection
    if (discriminant < 0) return false;

    // Ray didn't miss, check if the intersection is within the segment length
    discriminant = Math.sqrt(discriminant);
    let t1 = (-b - discriminant) / (2 * a);
    let t2 = (-b + discriminant) / (2 * a);

    // If either t1 or t2 is between 0 and 1, the projectile passed through the circle this frame
    return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

// =========================================================
// TACTICAL AI ROLE TRANSLATOR
// =========================================================
window.getTacticalRole = function(unit) {
    if (!unit || !unit.stats) return 'INFANTRY';
    
    const roleStr = String(unit.stats.role || "").toUpperCase();
    const typeStr = String(unit.unitType || unit.stats.name || "").toUpperCase();
    
    // Cavalry Check
    if (unit.stats.isLarge || unit.isMounted || /(CAV|HORSE|MOUNTED|CAMEL|ELEPH|LANCER|KESHIG)/.test(typeStr) || /(CAVALRY)/.test(roleStr)) {
        return 'CAVALRY';
    }
    // Gunpowder Check
    if (/(FIRELANCE|BOMB|ROCKET|GUNNER|HAND CANNONEER|MUSKET)/.test(typeStr) || /(BOMB|GUNPOWDER)/.test(roleStr)) {
        return 'GUNPOWDER';
    }
    // Standard Ranged Check
    if (unit.stats.isRanged || /(ARCHER|BOW|CROSSBOW|SLINGER)/.test(typeStr) || /(RANGED)/.test(roleStr)) {
        return 'RANGED';
    }
    // Default everyone else to Infantry
    return 'INFANTRY';
};