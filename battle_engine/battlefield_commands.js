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

// --- LAZY GENERAL FEATURE ---
let activeLazyGeneralInterval = null;

function startLazyGeneral() {
    if (activeLazyGeneralInterval) clearInterval(activeLazyGeneralInterval);
    activeLazyGeneralInterval = setInterval(() => {
        if (!inBattleMode || !battleEnvironment) {
            stopLazyGeneral();
            return;
        }
        
      const selectedUnits = battleEnvironment.units.filter(u => 
            u.side === "player" && 
            u.selected && 
            u.hp > 0 && 
            !u.isCommander && 
            !u.disableAICombat &&
            u.siegeRole !== "ladder_fanatic" && 
            u.siegeRole !== "counter_battery" &&
            u.siegeRole !== "treb_crew" &&       // SURGERY 3: Keep crews on the artillery!
            u.siegeRole !== "trebuchet_crew" 
        );

        if (selectedUnits.length === 0) return;

        if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle) {
            if (typeof executeSiegeAssaultAI === 'function') {
                executeSiegeAssaultAI(selectedUnits);
            }
        } else {
            selectedUnits.forEach(u => {
                u.hasOrders = true;
                u.orderType = "seek_engage"; 
                u.orderTargetPoint = null; 
            });
        }
    }, 1000);
}

function stopLazyGeneral() {
    if (activeLazyGeneralInterval) {
        clearInterval(activeLazyGeneralInterval);
        activeLazyGeneralInterval = null;
    }
}
// --- END LAZY GENERAL FEATURE ---

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
        // 1-5: UNIT SELECTION (REVISED)
        // =========================
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
                if (u.hasOrders && u.orderType === "follow") {
                    u.orderType = "hold_position";
                    u.orderTargetPoint = { x: commander.x + (u.formationOffsetX || 0), y: commander.y + (u.formationOffsetY || 0) };
                }
            }
            
            u.selected = willBeSelected;
            
            // ---> NEW SURGERY: BREAK THE LAZY CHARGE UPON SELECTION <---
            if (u.selected && u.orderType === "seek_engage") {
                u.hasOrders = false;
                u.orderType = null; 
                u.orderTargetPoint = null;
                u.target = null; // Forces them to clear dynamic targets and await orders
            }
        });
        
        // Temporarily pause the interval so it doesn't instantly hijack your selection
        stopLazyGeneral(); 
        return;
    }

    const selectedUnits = playerUnits.filter(u => u.selected);
    if (selectedUnits.length === 0) return;

   // =========================
    // Z, X, C, V, B: FORMATIONS (ANCHORED TO GENERAL)
    // =========================
    if (["z", "x", "v", "c", "b"].includes(key)) {
        
        stopLazyGeneral(); 
         
        if (selectedUnits.length <= 1) return;

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
    stopLazyGeneral(); 
    if (!commander) break;
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
            startLazyGeneral();//reactivate
            break;

        case "r": // RETREAT 
            
        stopLazyGeneral(); // Disable lazy spam if manual formation ordered
    
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
            stopLazyGeneral(); 
    
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
        // ====================================================================
        // SURVIVAL OVERRIDE: 100px Emergency Self-Defense
        // ====================================================================
        if (nearestDist < emergencyThreshold && nearestEnemy && !isStrictCommand && !unit.disableAICombat) {
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

                if (nearestEnemy) {
                    let distToEnemy = Math.hypot(unit.x - nearestEnemy.x, unit.y - nearestEnemy.y);
                    // Ranged units use max range, melee units use an emergency 70px self-defense radius
                    let aggroLimit = isRanged ? unit.stats.range : 70;
                    
                    if (distToEnemy <= aggroLimit) {
                        unit.target = nearestEnemy;
                        return; // Locks on and executes combat
                    }
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
                if (nearestEnemy) {
                    unit.target = nearestEnemy;
                    if (unit.stats.morale > 5) {
                        let dx = nearestEnemy.x - unit.x;
                        let dy = nearestEnemy.y - unit.y;
                        let dist = Math.hypot(dx, dy);

                        if (dist > unit.stats.range * 0.9) {
                            unit.target = nearestEnemy;
                        }
                    }
                }
                return; 
            }
            
			// ==========================
            // SMART SIEGE ASSAULT LOGIC
            // ==========================
            if (unit.orderType === "siege_assault") {
                let wallBoundaryY = (typeof CITY_LOGICAL_HEIGHT !== 'undefined' ? CITY_LOGICAL_HEIGHT : 3200) - 40;
                let southGate = typeof overheadCityGates !== 'undefined' ? overheadCityGates.find(g => g.side === "south") : null;

                // Ensure we catch the global breach flag too
                let gateBreached = window.__SIEGE_GATE_BREACHED__ || (southGate && (southGate.gateHP <= 0 || southGate.isOpen));
				
				// ---> SURGERY: MANDATORY PLAZA RUSH OVERRIDE (2-STAGE FUNNEL) <---
                if (gateBreached && unit.siegeRole !== "ladder_fanatic") {
                    unit.siegeRole = "assault_complete";

                    let gateX = typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelX : 1200;
                    let gateY = typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelY : 2000;
                    let plazaX = gateX;
                    let plazaY = typeof SiegeTopography !== 'undefined' ? SiegeTopography.plazaPixelY : 800;

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
                        unit.disableAICombat = false; // Ignore defenders outside, sprint to the gate
                        return; // Halts the rest of the targeting logic
                    } else {
                        // STAGE 2: SPREAD OUT AND RUSH THE PLAZA
                        let distToPlaza = Math.hypot(unit.x - plazaX, unit.y - plazaY);

                        // If they are far from the plaza, force them to ignore everything and run
                        if (distToPlaza > 250) {
                            unit.target = { 
                                x: plazaX + (Math.random() - 0.5) * 350, 
                                y: plazaY + (Math.random() - 0.5) * 300, 
                                hp: 9999,
                                isDummy: true,
                                priority: "plaza" 
                            };
                            unit.orderTargetPoint = null; 
                            unit.disableAICombat = true; // Pacifist mode ensures they sprint past defenders
                            return; 
                        } else {
                            // They have arrived at the plaza! Release the hounds!
                            unit.disableAICombat = false;
                            if (nearestEnemy) {
                                unit.target = nearestEnemy;
                            } else {
                                unit.target = null;
                            }
                            return;
                        }
                    }
                }

              // --- Pre-Breach Backup Logic ---
                if (unit.y < wallBoundaryY || unit.onWall) {
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
                            destX = unit.x;
                            destY = wallBoundaryY + 200; 
                        }
                        break;

					case "cavalry_reserve":
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

    let southGate =
        typeof overheadCityGates !== "undefined"
            ? overheadCityGates.find(g => g.side === "south")
            : null;

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
    if (meleeInfantry.length < 20) {
        let neededTroops = 60 - meleeInfantry.length;
        // Splice from archers first, then gunpowder
        let draftedArchers = archers.splice(0, neededTroops);
        let draftedGunners = gunpowder.splice(0, Math.max(0, neededTroops - draftedArchers.length));
        
        meleeInfantry.push(...draftedArchers, ...draftedGunners);
    }

    // 3. Assign Orders
    let ramIndex = 0;
    let ladderIndex = 0;

    // Distribute Melee Infantry to Rams & Ladders
    meleeInfantry.forEach((u, index) => {
        u.hasOrders = true;
        u.orderType = "siege_assault";
        u.siegeRole = "infantry_reserve";
        
        if (siegeEquipment.rams.length > 0 && index < 25) { 
            u.siegeRole = "ram_pusher";
            u.siegeTarget = siegeEquipment.rams[ramIndex % siegeEquipment.rams.length];
            u.queuePos = index; 
            ramIndex++;
        } 
        else if (siegeEquipment.ladders.length > 0 && index >= 25 && index < 60) {
            u.siegeRole = "ladder_carrier";
            u.siegeTarget = siegeEquipment.ladders[ladderIndex % siegeEquipment.ladders.length];
            u.queuePos = index - 25;
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
    let southGate = typeof overheadCityGates !== 'undefined' ? overheadCityGates.find(g => g.side === "south") : null;
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
            executeBoxFormationMove(selectedUnits, minX, maxX, minY, maxY);
        } else {
            // ACTION: SELECT UNITS IN RECTANGLE
            playerUnits.forEach(u => {
                u.selected = (u.x >= minX && u.x <= maxX && u.y >= minY && u.y <= maxY && canSelectUnitNow(u));
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
            playerUnits.forEach(u => u.selected = false);
            clickedUnit.selected = true;
            if (typeof AudioManager !== 'undefined') AudioManager.playSound('ui_click');
        } else {
            playerUnits.forEach(u => u.selected = false);
        }
        
        currentSelectionGroup = null;
    }
});

// --- RECTANGLE FORMATION MATHEMATICS ---
function executeBoxFormationMove(units, minX, maxX, minY, maxY) {
    if (!units || units.length === 0) return;
    
    if (typeof stopLazyGeneral === 'function') stopLazyGeneral(); 

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