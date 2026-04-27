
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

function updateBattleUnits() {
    if (typeof processSiegeEngines === 'function') processSiegeEngines();
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
        if (typeof updateTowerShooting === 'function') {
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
// 3. Process Each Unit
    units.forEach(unit => {
        // Death Hook
        if (unit.hp <= 0) {
            handleUnitDeath(unit);
            return; 
        }

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
            
            // ---> SIEGE FLEEING OVERRIDE (LEFT/RIGHT ONLY) <---
            if (isFleeingOrWavering && typeof inSiegeBattle !== 'undefined' && inSiegeBattle) {
                // Determine the boundaries of your map
                let mapWidth = typeof BATTLE_WORLD_WIDTH !== 'undefined' ? BATTLE_WORLD_WIDTH : 2000;
                
                // Calculate distance to left and right borders
                let distToLeft = unit.x;
                let distToRight = mapWidth - unit.x;
                
                // Force their target to the closest horizontal edge, keeping their current Y level
                unit.target = { 
                    x: distToLeft < distToRight ? -200 : mapWidth + 200, 
                    y: unit.y, 
                    isDummy: true 
                };
            }
            // ---> END OVERRIDE <---

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
		
		
        // Targeting & Action (Movement or Attack)
        AICategories.processTargeting(unit, units);
        AICategories.processAction(unit, battleEnvironment, currentBattleData, player);

        // Cooldowns
        if (unit.cooldown > 0) unit.cooldown--;
    });

// 4. Collisions
    applyUnitCollisions(units);
    applyWallGravity(units);
    updateRiverPhysics();  

    // =========================================================
    // ---> NEW: THE ABSOLUTE MASTER CLAMP <---
    // Catches any unit pushed out of bounds by collision/gravity
    // =========================================================
    if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle) {
        let southGate = battleEnvironment.cityGates ? battleEnvironment.cityGates.find(g => g.side === "south") : null;
        let isGateBreached = window.__SIEGE_GATE_BREACHED__ || (southGate && (southGate.isOpen || southGate.gateHP <= 0));
        
        if (!isGateBreached) {
            let strictWallLimit = SiegeTopography.wallPixelY - 10;
            
            units.forEach(u => {
                if (u.side === "enemy" && u.hp > 0 && !u.isFalling) {
                    if (u.y > strictWallLimit) {
                        u.y = strictWallLimit; // Hard overwrite back to the North
                        // If they were squeezed into the wall, kill vertical momentum
                        if (u.vy > 0) u.vy = 0; 
                    }
                }
            });
        }
    }
    // =========================================================

    // 5. Update Projectiles & Ground Effects Cleanup
    if (battleEnvironment.projectiles && battleEnvironment.projectiles.length > 0 || battleEnvironment.groundEffects) {
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
	// Force immediate GPU memory release
if (battleEnvironment.bgCanvas) {
    battleEnvironment.bgCanvas.width = 0;
    battleEnvironment.bgCanvas.height = 0;
    battleEnvironment.bgCanvas = null;
}
if (battleEnvironment.fgCanvas) {
    battleEnvironment.fgCanvas.width = 0;
    battleEnvironment.fgCanvas.height = 0;
    battleEnvironment.bgCanvas = null;
}

	
console.log("Leaving battlefield. Restoring overworld state...");
// --- ADD THIS LINE TO SHUT DOWN THE ENEMY GENERAL ---
    if (typeof EnemyTacticalAI !== 'undefined') EnemyTacticalAI.stop();
    if (typeof cleanupSiegeRoofOverlay === 'function') cleanupSiegeRoofOverlay();
    
    // ADD THIS:
    if (typeof cleanupNavalSailCanvas === 'function') cleanupNavalSailCanvas();

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

    // --- 3. CALCULATE BATTLE RESULTS (Keep your existing logic) ---
    let pUnitsAlive = battleEnvironment.units.filter(u => u.side === "player" && !u.isCommander && u.hp > 0).length;
    let eUnitsAlive = battleEnvironment.units.filter(u => u.side === "enemy" && !u.isCommander && u.hp > 0).length; 

    let scale = (currentBattleData && currentBattleData.initialCounts.player > 300) ? 5 : 1; 
    let playerLost = currentBattleData.initialCounts.player - (pUnitsAlive * scale);
    let enemyLost = currentBattleData.initialCounts.enemy - (eUnitsAlive * scale);

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
    // Spacing increased slightly to account for the more detailed profile
    for (let i = 0; i < 5; i++) {
        const spacing = i * 85; 
        drawDetailedChineseWagon(ctx, x + spacing - camera.x, y - camera.y, factionColor);
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

    const pStart = Math.max(1, currentBattleData.initialCounts.player || 0);
    const eStart = Math.max(1, currentBattleData.initialCounts.enemy || 0);

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
        let isDefenderOnWall = typeof inSiegeBattle !== 'undefined' && inSiegeBattle && unit.side === "enemy" && unit.y < (typeof SiegeTopography !== 'undefined' ? SiegeTopography.wallPixelY : 2000);

        if (!isDefenderOnWall) {
            // Normal behavior: Push them South
            unit.vy += 0.5;  
            unit.y += 1.5;   
        } else {
            // Defender behavior: Shake them side-to-side to unstick, DO NOT push South
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