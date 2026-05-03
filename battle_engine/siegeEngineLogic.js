
let siegeAITick = 0;

function processSiegeEngines() {
    if (!inSiegeBattle) return;
    
    siegeAITick++; 

    let units = battleEnvironment.units;
    let playerUnits = units.filter(u => u.side === "player" && u.hp > 0);
    let allAliveEnemies = units.filter(u => u.side === "enemy" && u.hp > 0);
    let wallEnemies = allAliveEnemies.filter(u => u.onWall);

    let southGate = battleEnvironment.cityGates 
        ? battleEnvironment.cityGates.find(g => g.side === "south") 
        : null;

    // TRUE breach detection
    let isGateBreached = window.__SIEGE_GATE_BREACHED__ || !southGate || southGate.isOpen || southGate.gateHP <= 0;
    let activeLadders = siegeEquipment.ladders.filter(l => l.isDeployed && l.hp > 0);
    let isWallBreached = activeLadders.length > 0;

    // HARD NPC COLLISION CLAMP (Funneling logic)
    let wallPixelY = SiegeTopography.wallPixelY; 
    let westWallX = 45 * BATTLE_TILE_SIZE; 
    let eastWallX = (BATTLE_COLS - 45) * BATTLE_TILE_SIZE;
 let gateHalfWidth = 80; // SURGERY: Massively widened so they don't clip the gate frame

    battleEnvironment.units.forEach(u => {
        if (!u.onWall && u.hp > 0) {
			
			  // SURGERY 2-E: never apply gate-magnet slide to a climbing/ladder unit
            if (u.isClimbing || (u.siegeRole && u.siegeRole.includes('ladder'))) return;
            
            let atOpenGate = (isGateBreached && Math.abs(u.x - SiegeTopography.gatePixelX) < gateHalfWidth);
            let atLadder = activeLadders.some(l => Math.abs(u.x - l.x) < 24);

         // 1. FRONT WALL COLLISION
                    if (u.side === "player" && !u.isCommander) {
                        if (u.y < wallPixelY + 20 && !atLadder && !atOpenGate) {
                            u.y = wallPixelY + 20; // Hard clamp on the Y axis
                            
                            // NEW SURGERY: Slide towards the ladder if assigned, otherwise slide to gate
                            if (u.target && u.target.isLadderAssault) {
                                let dirX = (u.target.x > u.x) ? 1 : -1;
                                u.x += dirX * 1.8;
                            } else {
                                let dirX = (SiegeTopography.gatePixelX > u.x) ? 1 : -1;
                                u.x += dirX * 1.8; 
                            }
                        }
                    } else if (u.side === "enemy") {
                if (u.y > wallPixelY - 20 && !atOpenGate) {
                    u.y = wallPixelY - 20; 
                }
            }

            // 2. SIDE WALL COLLISION
            if (u.y < wallPixelY) { 
                if (u.x < westWallX) u.x = westWallX; 
                if (u.x > eastWallX) u.x = eastWallX; 
            }
        }
    });

    // ============================================================================
  // A. RAM ASSAULT LOGIC
    // ============================================================================
    siegeEquipment.rams.forEach(ram => {
        if (ram.hp <= 0) return;

        // ---> NEW: ENFORCE PHYSICAL CREW PRESENCE <---
        // Check if there are any living player units within 60 pixels
        let physicallyPresentCrew = playerUnits.filter(u => 
            !u.isCommander && 
            Math.hypot(u.x - ram.x, u.y - ram.y) < 60
        );

        if (physicallyPresentCrew.length === 0) {
            ram.isBreaking = false;
            ram.state = "idle";
            return; // Abort this loop iteration. No movement, no damage.
        }
        // ---------------------------------------------

        const exactGateY = SiegeTopography.gatePixelY;
        const safeRetreatY = exactGateY + 150; 
        const ramSpeed = ram.speed || ram.stats?.speed || 0.6;
        // ... rest of the existing ram logic

        const isGateBroken = !ram.targetGate || ram.targetGate.gateHP <= 0 || window.__SIEGE_GATE_BREACHED__;
        
        if (!isGateBroken) {
            if (ram.y > exactGateY+30) {
                ram.state = "moving_to_gate";
                ram.isBreaking = false;
                ram.y -= ramSpeed;
BattleAudio.playSiegeMovement(ram.x, ram.y, true);				
            } else {
                ram.y = exactGateY+30; 
                ram.state = "attacking_gate";
                ram.isBreaking = true;
                
                if (Math.random() > 0.99) { 
                    ram.targetGate.gateHP -= 35;  //slow
BattleAudio.playRamHit(ram.x, ram.y);
                    
                    if (ram.targetGate.gateHP <= 0) {
                        triggerGateBreach(ram.targetGate);
                        ram.targetGate = null; 
                    }
                }
            }
        } else {
            // RETREATING
            ram.isBreaking = false;
            ram.targetGate = null; 
            ram.hasOrders = true;  
            ram.stuckTicks = 0;
            if (ram.path) ram.path = null;

            if (ram.y < safeRetreatY) {
                ram.state = "retreating";
                ram.y += (ramSpeed * 0.5); 
            } else {
                ram.state = "idle";
                ram.hasOrders = false; 
            }
        }
    });

// RAM SHIELD INTERCEPTION
    for (let i = battleEnvironment.projectiles.length - 1; i >= 0; i--) {
        let p = battleEnvironment.projectiles[i];
        if (p.stuck) continue; 

        // Enemies hitting from the front, OR Players hitting the back (5% chance)
        let hitChance = (p.side === "enemy" && p.vy > 0) ? 1.0 : ((p.side === "player" && Math.random() < 0.05) ? 1.0 : 0);

        if (hitChance > 0) {
            for (let ram of siegeEquipment.rams) {
                if (ram.hp <= 0 || ram.shieldHP <= 0) continue;

                const shieldX = ram.x + (ram.shieldOffsetX || 0);
                const shieldY = ram.y + (ram.shieldOffsetY || 0);

                if (Math.abs(p.x - shieldX) < (ram.shieldW || 54) / 2 && Math.abs(p.y - shieldY) < (ram.shieldH || 28) / 2) {
                    ram.shieldHP -= p.attackerStats?.missileBaseDamage || 10;
                    
                    // ---> VISUAL STICKING <---
                    if (battleEnvironment.groundEffects && battleEnvironment.groundEffects.length < 500) {
                        let role = p.attackerStats?.role || "";
                        let isBolt = role === "crossbow" || role === "crossbowman";
                        let isJavelin = p.attackerStats?.name === "Javelinier";
                        let efType = isJavelin ? "javelin" : isBolt ? "bolt" : "arrow";
                        
                        battleEnvironment.groundEffects.push({
                            type: efType, x: p.x, y: p.y, angle: Math.atan2(p.vy, p.vx),
                            stuckOnStructure: true, structureTile: 98, timestamp: Date.now()
                        });
                    }

                    battleEnvironment.projectiles.splice(i, 1);
                    if (ram.shieldHP <= 0) ram.shieldHP = 0;
                    break;
                }
            }
        }
    }

   // ============================================================================
    // B. LADDER ASSAULT LOGIC (UPGRADED FLY-SWARM AI)
    // ============================================================================
    let undeployedLadders = siegeEquipment.ladders.filter(l => !l.isDeployed && l.hp > 0);

    // 1. Force the  Ladder Fanatics to swarm undeployed ladders
    playerUnits.forEach(u => {
        if (u.siegeRole === "ladder_fanatic") {
            if (undeployedLadders.length > 0) {
                // Find the absolute closest ladder
                let closestLadder = undeployedLadders.reduce((prev, curr) => 
                    Math.hypot(curr.x - u.x, curr.y - u.y) < Math.hypot(prev.x - u.x, prev.y - u.y) ? curr : prev
                );
                
               // Only update the target if the unit does not already have a stable one pointing here
                let distToLadder = Math.hypot(u.x - closestLadder.x, u.y - closestLadder.y);
                if (!u.target || u.target.isDummy === undefined || distToLadder > 80) {
                    u.target = { x: closestLadder.x, y: closestLadder.y, isDummy: true };
                }
                u.state = "moving";
                u.hasOrders = true;
                u.disableAICombat = true;
                u.orderType = "ladder_crew";
            } else {
                // Ladders are up or destroyed! Revert back to bloodthirsty mode.
                u.siegeRole = "normal";
                u.disableAICombat = false;
                u.orderType = "siege_assault";
            }
        }
    });

// 2. Process physical ladder movement and deployment
    siegeEquipment.ladders.forEach(ladder => {
        if (ladder.hp <= 0 || ladder.isDeployed) return;

        // A. Assign exactly 2 crew members if we have shortages
        if (ladder.crewAssigned.length < 2) {
            let available = playerUnits.filter(u => 
                u.orderType === "ladder_crew" && 
                u.hp > 0 && 
                !u.onWall &&
                !siegeEquipment.ladders.some(l => l.crewAssigned.includes(u)) // Not already on a ladder
            );
            
            // Push closest available men into the crew
            for (let i = 0; i < available.length && ladder.crewAssigned.length < 2; i++) {
                ladder.crewAssigned.push(available[i]);
            }
        }

        // B. Filter out dead crew
        ladder.crewAssigned = ladder.crewAssigned.filter(u => u.hp > 0);

// C. ANY player unit within 55px counts as a pusher — not just crewAssigned
        let activePushers = playerUnits.filter(u => 
            !u.isCommander &&
            !u.onWall &&
            Math.hypot(u.x - ladder.x, u.y - ladder.y) < 55
        );

        let targetPixelY = SiegeTopography.wallPixelY - 5;
        
        // D. Move if ANYONE is touching it
        if (activePushers.length > 0 && ladder.y > targetPixelY) {
            ladder.y -= ladder.speed;
            ladder.lastY = ladder.y;
           BattleAudio.playSiegeMovement(ladder.x, ladder.y, true); 
            // Pull touching pushers along with the ladder
            activePushers.forEach(u => {
                u.target = { x: ladder.x, y: ladder.y + 10, isDummy: true };
                u.y -= ladder.speed;
            });
        }

        if (ladder.y <= targetPixelY && !ladder.isDeployed) {
            deployAssaultLadder(ladder);
            return; 
        }
    });
// ============================================================================
    // C. MANTLET, LADDER, TREBUCHET & BALLISTA PROJECTILE INTERCEPTION
    // ============================================================================
    for (let i = battleEnvironment.projectiles.length - 1; i >= 0; i--) {
        let p = battleEnvironment.projectiles[i];
        if (p.stuck) continue;

        let hitEngine = false;

        // 1. MANTLET LOGIC (Directional Blocking)
        let mantletHitChance = (p.side === "enemy" && p.vy > 0) ? 1.0 : ((p.side === "player" && Math.random() < 0.05) ? 1.0 : 0);
        if (mantletHitChance > 0) {
            for (let m of siegeEquipment.mantlets) {
                if (m.hp > 0 && Math.abs(p.x - m.x) < 30 && Math.abs(p.y - m.y) < 20) {
                    if (Math.random() < 0.50) { 
                        m.hp -= p.attackerStats?.missileBaseDamage || 10;
                        hitEngine = true;
                        break; 
                    }
                }
            }
        }

        // 2. LADDERS, TREBUCHETS, BALLISTAS (Bulky Multi-Directional Hitboxes)
        if (!hitEngine) {
            // "attacker projectiles only have a 5% chance to stick where enemy projectiles have a 80 % chance to stick"
            let stickChance = (p.side === "enemy") ? 0.80 : 0.25;

            if (Math.random() <= stickChance) {
                // Check Ladders
                for (let l of siegeEquipment.ladders) {
                    if (l.hp > 0 && Math.abs(p.x - l.x) < 25 && Math.abs(p.y - l.y) < 45) {
                        l.hp -= p.attackerStats?.missileBaseDamage || 10;
                        hitEngine = true; break;
                    }
                }
// Check Trebuchets
                if (!hitEngine) {
                    for (let t of siegeEquipment.trebuchets) {
                        if (t.hp > 0 && Math.abs(p.x - t.x) < 25 && Math.abs(p.y - t.y) < 40) {
                            if (p.startX === t.x && p.startY === t.y) continue; // <--- ADD THIS FIX
                            t.hp -= p.attackerStats?.missileBaseDamage || 10;
                            hitEngine = true; break;
                        }
                    }
                }
                // Check Ballistas
                if (!hitEngine) {
                    for (let b of siegeEquipment.ballistas) {
                        if (b.hp > 0 && Math.abs(p.x - b.x) < 20 && Math.abs(p.y - b.y) < 25) {
                            if (p.startX === b.x && p.startY === b.y) continue; // <--- ADD THIS FIX
                            b.hp -= p.attackerStats?.missileBaseDamage || 10;
                            hitEngine = true; break;
                        }
                    }
                }
            }
        }

        if (hitEngine) {
            // ---> VISUAL STICKING <---
            if (battleEnvironment.groundEffects && battleEnvironment.groundEffects.length < 500) {
                let role = p.attackerStats?.role || "";
                let isBolt = role === "crossbow" || role === "crossbowman";
                let isJavelin = p.attackerStats?.name === "Javelinier";
                let efType = isJavelin ? "javelin" : isBolt ? "bolt" : "arrow";
                
                battleEnvironment.groundEffects.push({
                    type: efType, x: p.x, y: p.y, angle: Math.atan2(p.vy, p.vx),
                    stuckOnStructure: true, structureTile: 98, timestamp: Date.now()
                });
            }

            battleEnvironment.projectiles.splice(i, 1); 
        }
    }
// ============================================================================
    // TREBUCHET LOGIC & CREW AI MANAGER
    // ============================================================================
// ============================================================================
// TREBUCHET LOGIC & VISUAL CREW (NO REAL UNIT REQUIREMENT)
// ============================================================================
siegeEquipment.trebuchets.forEach(treb => {
    if (treb.hp <= 0) {
        treb.isManned = false;
        return;
    }

    const isEnemyTreb = treb.side === "enemy";
    const targetPool = isEnemyTreb
        ? playerUnits
        : (wallEnemies.length > 0 ? wallEnemies : allAliveEnemies);

    // Crew is visual only now. No live-unit presence check.
    treb.isManned = true;
    treb.cooldown = Math.max(0, treb.cooldown - 1);

    if (targetPool.length > 0 && treb.cooldown <= 0) {
        treb.cooldown = treb.fireRate;

        let target = targetPool[Math.floor(Math.random() * targetPool.length)];
        let dx = target.x - treb.x;
        let dy = target.y - treb.y;
        let dist = Math.hypot(dx, dy);
        let speed = 6;

        battleEnvironment.projectiles.push({
            x: treb.x, y: treb.y,
            vx: (dx / dist) * speed, vy: (dy / dist) * speed,
            startX: treb.x, startY: treb.y,
            maxRange: 1000,
            attackerStats: {
                role: "bomb",
                missileAPDamage: 1,
                missileBaseDamage: 35,
                name: "Trebuchet Boulder",
                currentStance: "statusrange",
                isRanged: true
            },
            side: treb.side,
            projectileType: "Bomb",
            isFire: false
        });

 
    }
});

 
// ============================================================================
// BALLISTA LOGIC & VISUAL 1-MAN CREW
// ============================================================================
siegeEquipment.ballistas.forEach(bal => {
    if (bal.hp <= 0) {
        bal.isManned = false;
        return;
    }

    const targetPool = playerUnits;

    // Crew is visual only now. No live-unit presence check.
    bal.isManned = true;
    bal.cooldown = Math.max(0, bal.cooldown - 1);

    if (targetPool.length > 0) {
        let target = targetPool.reduce((prev, curr) =>
            Math.hypot(curr.x - bal.x, curr.y - bal.y) < Math.hypot(prev.x - bal.x, prev.y - bal.y) ? curr : prev
        );

        let rawAngle = Math.atan2(target.y - bal.y, target.x - bal.x);

        let minAngle = 10 * Math.PI / 180;
        let maxAngle = 170 * Math.PI / 180;

        if (rawAngle < 0) {
            rawAngle = (rawAngle > -Math.PI / 2) ? minAngle : maxAngle;
        }

        bal.aimAngle = Math.max(minAngle, Math.min(maxAngle, rawAngle));

        if (bal.cooldown <= 0) {
            bal.cooldown = bal.fireRate;
            let speed = 15;

            let projVx = Math.cos(bal.aimAngle) * speed;
            let projVy = Math.sin(bal.aimAngle) * speed;

            battleEnvironment.projectiles.push({
                x: bal.x, y: bal.y,
                vx: projVx, vy: projVy,
                startX: bal.x, startY: bal.y,
                maxRange: 700,
                attackerStats: {
                    role: "crossbowman",
                    missileAPDamage: 12,
                    missileBaseDamage: 30,
                    name: "Crossbowman",
                    currentStance: "statusrange",
                    isRanged: true
                },
                side: bal.side,
                projectileType: "arrow",
                isFire: false
            });

// Point to the instance created in soundeffects.js
BattleAudio.playCrossbowRelease(bal.x, bal.y);
        }
    }
});
	// ============================================================================
// 2. DEFENDER AI (ENEMY)
// ============================================================================
if (siegeAITick % 6 === 0) {
    allAliveEnemies.forEach(u => {
        
        if (u.siegeRole === "treb_crew") return;
        
        let roleStr = String((u.stats?.role || "") + " " + (u.unitType || "") + " " + (u.stats?.name || "")).toLowerCase();
        let isLarge = u.stats?.isLarge || roleStr.match(/(cav|horse|mount|camel|eleph)/);

        // ---> PIN WALL DEFENDERS TO THEIR POSTS (Upgraded Aggro) <---
        if (u.siegeRole === "wall_defender") {
            let localThreats = battleEnvironment.units.filter(p => 
                p.side === "player" && p.hp > 0 && 
                Math.hypot(p.x - u.x, p.y - u.y) < 250
            );
            
            if (localThreats.length === 0) {
                let distToStart = Math.hypot(u.startX - u.x, u.startY - u.y);
                if (distToStart > 10) {
                    u.target = { x: u.startX, y: u.startY, isDummy: true }; 
                    u.state = "moving";
                } else {
                    u.state = "idle";
                }
                u.hasOrders = true; 
                return; 
            }
        }

        // ---> HOLD RESERVE UNTIL BREACH <---
        // ---> HOLD RESERVE UNTIL BREACH <---
        if (u.siegeRole === "gate_reserve") {
            let southGate = overheadCityGates.find(g => g.side === "south");
            if (southGate && !southGate.isOpen && southGate.gateHP > 200) {
                let emergencyThreat = playerUnits.find(p => Math.hypot(p.x - u.x, p.y - u.y) < 100);
                if (!emergencyThreat) {
                    u.target = { x: u.startX, y: u.startY, isDummy: true };
                    u.hasOrders = true;
                    return;
                }
            }
        }

        if (!isGateBreached) {
            // GATE INTACT
if (u.onWall) {
                if (Math.random() < 0.2 && (u.state === "idle" || !u.hasOrders)) {
                    u.target = { 
                        x: SiegeTopography.gatePixelX + (Math.random() - 0.5) * 600, 
                        y: SiegeTopography.wallPixelY - 100, 
                        isDummy: true 
                    };
                    u.state = "moving";
                    u.hasOrders = true;
                }
        } else {
                // ---> NEW SURGERY: WIDE PATROL & PROXIMITY AGGRO <---
                let attackRange = isSiegeRangedDefender(u) ? (u.stats.range || 400) : 50;
                let closestAttacker = null;
                let minDist = Infinity;
                
// 1. Scan for nearby enemies to aggro — GROUND ONLY, skip wall climbers
                for (let i = 0; i < playerUnits.length; i++) {
                    let attacker = playerUnits[i];
                    // Never chase attackers who are on the wall scaffold — defenders can't follow them up there
                    if (attacker.onWall) continue;
                    let dist = Math.hypot(u.x - attacker.x, u.y - attacker.y);
                    if (dist < minDist) { minDist = dist; closestAttacker = attacker; }
                }

                // 2. If a ground enemy is within range, attack immediately
                if (closestAttacker && minDist <= attackRange) {
                    u.target = closestAttacker;
                    u.state = "attacking";
                    u.hasOrders = true;
                }
                // 3. Otherwise, perform a wide patrol behind the wall
                else {
                    let isPatrolling = (u.state === "moving" && u.target && u.target.isDummy);
                    
                    if (u.state === "idle" || !u.hasOrders || !isPatrolling) {
                        // Spread out across 80% of the map width, and varying depths behind the wall
                        let spreadWidth = BATTLE_WORLD_WIDTH * 0.8;
                        let targetX = (BATTLE_WORLD_WIDTH / 2) + ((Math.random() - 0.5) * spreadWidth);
                        let targetY = SiegeTopography.wallPixelY - 150 - (Math.random() * 400); // Deep patrol depth

                        u.target = { x: targetX, y: targetY, isDummy: true };
                        u.state = "moving";
                        u.hasOrders = true;
                    } else {
                        // Stop moving once they reach their random patrol waypoint
                        let distToTarget = Math.hypot(u.x - u.target.x, u.y - u.target.y);
                        if (distToTarget < 30) {
                            u.state = "idle";
                            u.target.x = u.x;
                            u.target.y = u.y;
                            u.vx = 0; 
                            u.vy = 0;
                        }
                    }
                }
		}}
		else {
            // GATE IS BROKEN: FALLBACK TO PLAZA OR ATTACK
            let plazaX = SiegeTopography.gatePixelX; 
            let plazaY = SiegeTopography.plazaPixelY;
            let distToPlaza = Math.hypot(plazaX - u.x, plazaY - u.y);

            // ---> LARGE UNITS EARLY PLAZA RETURN <---
            if (isLarge && distToPlaza > 150) {
                // Force cavalry/elephants out of the gate choke point immediately
                u.target = {
                    x: plazaX + (Math.random() - 0.5) * 400, 
                    y: plazaY + (Math.random() - 0.5) * 200, 
                    isDummy: true
                };
                u.state = "moving";
                u.hasOrders = true;
            } else {
                // Standard Infantry Aggro / Hysteresis
                let closestAttacker = null;
                let minDist = Infinity;
                
                let currentTargetDist = (u.target && !u.target.isDummy && u.target.hp > 0) 
                    ? Math.hypot(u.x - u.target.x, u.y - u.target.y) 
                    : Infinity;
                
                for (let i = 0; i < playerUnits.length; i++) {
                    let attacker = playerUnits[i];
                    let dist = Math.hypot(u.x - attacker.x, u.y - attacker.y);
                    if (dist < minDist) { minDist = dist; closestAttacker = attacker; }
                }

                let stickToCurrentTarget = (currentTargetDist < minDist + 40) && currentTargetDist < 300;

                if (stickToCurrentTarget) {
                    u.state = "attacking"; 
                } else if (closestAttacker && minDist < 400) { 
                    u.target = closestAttacker; 
                    u.state = "moving";
                    u.hasOrders = true;
                } else if (distToPlaza > 250 && !u.onWall) {
                    u.target = {
                        x: plazaX + (Math.random() - 0.5) * 350, 
                        y: plazaY + (Math.random() - 0.5) * 200, 
                        isDummy: true
                    };
                    u.state = "moving";
                    u.hasOrders = true;
                } else if (u.state === "idle" || !u.hasOrders) {
                    u.target = { x: u.x + (Math.random() - 0.5) * 20, y: u.y + (Math.random() - 0.5) * 20, isDummy: true };
                    u.state = "idle";
                    u.hasOrders = true;
                }
            }
        }

        // ========================================================================
        // ---> ABSOLUTE LAVA OVERRIDE (NEVER WALK SOUTH OF THIS LINE) <---
        // ========================================================================
        let lavaBoundaryY = SiegeTopography.gatePixelY + 5; // <<<<<<< TWEAK BUFFER HERE

if (u.y > lavaBoundaryY) {
            u.target = { x: u.x, y: SiegeTopography.wallPixelY - 120, isDummy: true };
            u.state = "moving";
            u.hasOrders = true;
        }
        // 2. If their target is past the line, intercept their movement
        else if (u.target && u.target.y > lavaBoundaryY) {
            let isRanged = roleStr.includes("ranged") || roleStr.includes("archer");
            
            if (isRanged) {
                // Ranged units keep their target so they can shoot down, but we kill their velocity at the edge
                if (u.y > lavaBoundaryY - 20) {
                    u.state = "idle";
                    u.vx = 0; 
                    u.vy = 0;
                }
            } else {
                // Melee units must abandon the target and hold the line at the edge
                u.target = { x: u.target.x, y: lavaBoundaryY - 15, isDummy: true };
                if (u.state === "attacking") u.state = "moving";
                u.hasOrders = true;
            }
        }

    });
}
// ============================================================================
// 3. ATTACKER AI (PLAYER)
// ============================================================================
if (siegeAITick % 4 === 0) {
    playerUnits.forEach((u, index) => {
        if (u.isCommander || u.disableAICombat || u.selected) return; 
        if (u.hasOrders && !["siege_assault", "seek_engage", "ladder_crew"].includes(u.orderType)) return; 
        if (u.state === "attacking" && u.target && !u.target.isDummy && u.target.hp > 0) return; // Prevent target hesitation
		
		
// Ladder crew units may still receive updated destinations — do NOT block them entirely
        // Only skip them if they are already close enough to their ladder (within 40px)
        if (u.orderType === "ladder_crew" && !isGateBreached && !isWallBreached) {
            let myLadder = siegeEquipment.ladders.find(l => !l.isDeployed && l.hp > 0);
            if (myLadder) {
                let d = Math.hypot(u.x - myLadder.x, u.y - myLadder.y);
                if (d < 40) return; // Already touching — let the push logic handle it
                // Not close yet — fall through so they get directed below
            } else {
                return; // No undeployed ladders left, skip
            }
        }
		
        const roleStr = String((u.stats?.role || "") + " " + (u.unitType || "") + " " + (u.stats?.name || "")).toLowerCase();
        const isCavalry = u.stats?.isLarge || roleStr.match(/(cav|horse|mount|camel|eleph)/);
        const isRanged = roleStr.includes("ranged") || roleStr.includes("archer");
        const isEquipmentCrew = (u.id % 5 === 0);

        let isOperatingEquipment = siegeEquipment.ladders.some(l => l.carriedBy === u) || 
                                   siegeEquipment.rams.some(r => r.carriedBy && r.carriedBy.includes(u));

        if ((isGateBreached || isWallBreached) && !isOperatingEquipment) {
            let closestEnemy = null;
            let minDist = Infinity;
            
            // Hysteresis calculation for attackers
            let currentTargetDist = (u.target && !u.target.isDummy && u.target.hp > 0) 
                ? Math.hypot(u.x - u.target.x, u.y - u.target.y) 
                : Infinity;
            
            for (let i = 0; i < allAliveEnemies.length; i++) {
                let enemy = allAliveEnemies[i];
                let dist = Math.hypot(u.x - enemy.x, u.y - enemy.y);
                if (dist < minDist) { minDist = dist; closestEnemy = enemy; }
            }
            
            let switchTarget = minDist < (currentTargetDist - 30); // Need strong reason to switch

            if (isRanged) {
                // Ensure they never get stuck in forced melee mode
                u.forceMelee = false;
                let attackRange = u.stats.range || 150; // Fallback range if undefined

                if (isGateBreached || siegeAITick >= 1200) {
                    let bestEntry = null;
                    let minEntryDist = Infinity;

                    if (isGateBreached) {
                        minEntryDist = Math.hypot(u.x - SiegeTopography.gatePixelX, u.y - SiegeTopography.gatePixelY);
                        bestEntry = { x: SiegeTopography.gatePixelX, y: SiegeTopography.gatePixelY + 20 };
                    }
                    
                    if (canUseSiegeEngines(u)) {
                        activeLadders.forEach(l => {
                            let d = Math.hypot(u.x - l.x, u.y - l.y);
                            if (d < minEntryDist) { minEntryDist = d; bestEntry = { x: l.x, y: l.y + 10 }; }
                        });
                    }

                    // 1. If an enemy is in range, prioritize targeting them directly (stay at a distance)
                    if (closestEnemy && minDist <= attackRange) {
                        if (switchTarget || !u.target || u.target.isDummy) {
                            u.target = closestEnemy;
                            u.state = "moving";
                            u.hasOrders = true;
                        }
                    }
                    // 2. If out of range, move to the breach to get inside/get line of sight (Remaining Ranged)
                    else if (bestEntry && minEntryDist > 80) {
                        u.target = { x: bestEntry.x, y: bestEntry.y, isDummy: true };
                        u.state = "moving";
                        u.hasOrders = true;
                    } 
                    // 3. Otherwise, track the closest enemy
                    else if (closestEnemy && minDist > 35 && (switchTarget || u.target.isDummy)) {
                        u.target = closestEnemy;
                        u.state = "moving";
                        u.hasOrders = true;
                    }
                } else {
                    if (closestEnemy && (switchTarget || !u.target || u.target.isDummy)) { 
                        u.target = closestEnemy; 
                        u.state = "moving"; 
                        u.hasOrders = true; 
                    }
                }
            } else {
                // Melee post-breach logic
                if (closestEnemy && minDist > 35 && (switchTarget || !u.target || u.target.isDummy)) {
                    u.target = closestEnemy;
                    u.state = "moving";
                    u.hasOrders = true;
                }
            }
        } 
        else if (!isOperatingEquipment) {
            // PRE-BREACH LOGIC
            let gateX = SiegeTopography.gatePixelX;
            let wallY = SiegeTopography.wallPixelY;

// ALL ladder_crew units: direct to the nearest undeployed ladder before any other logic runs
            if (u.orderType === "ladder_crew" && !isRanged) {
                let undeployedLadders = siegeEquipment.ladders.filter(l => !l.isDeployed && l.hp > 0);
                if (undeployedLadders.length > 0) {
                    let closestLadder = undeployedLadders.reduce((prev, curr) =>
                        Math.hypot(curr.x - u.x, curr.y - u.y) < Math.hypot(prev.x - u.x, prev.y - u.y) ? curr : prev
                    );
                    u.target = { x: closestLadder.x, y: closestLadder.y, isDummy: true };
                    u.state = "moving";
                    u.hasOrders = true;
                }
                return;
            }
            
            if (isCavalry) {
                // Completely freeze them until the breach. 
                // ai_categories.js will guide them to the back line, this kills the vibrating slide.
                u.vx = 0;
                u.vy = 0;
                u.state = "idle";
                u.hasOrders = true;
                return; // Abort further targeting logic so they stay perfectly still
            } else if (isEquipmentCrew && !isRanged) {
                let undeployedLadders = siegeEquipment.ladders.filter(l => !l.isDeployed && l.hp > 0);
                if (undeployedLadders.length > 0) {
                    let closestLadder = undeployedLadders.reduce((prev, curr) =>
                        Math.hypot(curr.x - u.x, curr.y - u.y) < Math.hypot(prev.x - u.x, prev.y - u.y) ? curr : prev
                    );
                    u.target = { x: closestLadder.x, y: closestLadder.y + 15, isDummy: true };
                    u.state = "moving";
                    u.hasOrders = true;
                    u.orderType = "ladder_crew";
                }
            } else if (isRanged) {
                // Pre-breach ranged behavior (unchanged, works as intended)
                u.forceMelee = false; // Added safeguard

                if (!u.target || u.target.hp <= 0 || u.target.isDummy) {
                    let targetEnemy = null;
                    let minWDist = Infinity;
                    wallEnemies.forEach(e => {
                        let d = Math.hypot(u.x - e.x, u.y - e.y);
                        if (d < minWDist) { minWDist = d; targetEnemy = e; }
                    });

                    if (targetEnemy) {
                        u.target = targetEnemy;
                        u.state = "moving";
                        u.hasOrders = true;
                   } else if (u.state === "idle" || !u.hasOrders) {
                        // ---> SURGERY 4A: Send short-ranged Firelances/Bombs to the front line!
                        let isShortRange = roleStr.includes("firelance") || roleStr.includes("bomb") || roleStr.includes("hand cannoneer");
                        if (isShortRange) {
                            u.target = { x: gateX + ((Math.random() - 0.5) * 200), y: wallY + 80 + (Math.random() * 40), isDummy: true };
                        } else {
                            // Standard archers stay back
                            u.target = { x: gateX + ((index % 20) - 10) * 45, y: wallY + 280 + (Math.floor(index / 20) * 35), isDummy: true };
                        }
                        u.state = "moving";
                        u.hasOrders = true;
                    }
                }
} else {
                // Melee pre-breach logic
                
                // === WALL GUARD: Units already on the scaffold fight enemies there. ===
                // They must NEVER be given a target south of the wall or they walk off the edge.
                if (u.onWall) {
                    // Find the closest enemy to fight on or near the wall
                    let closestWallEnemy = null;
                    let minWallDist = Infinity;
                    for (let i = 0; i < allAliveEnemies.length; i++) {
                        let d = Math.hypot(u.x - allAliveEnemies[i].x, u.y - allAliveEnemies[i].y);
                        if (d < minWallDist) { minWallDist = d; closestWallEnemy = allAliveEnemies[i]; }
                    }
                    if (closestWallEnemy && minWallDist < 300) {
                        // Attack the nearest enemy from the wall
                        u.target = closestWallEnemy;
                        u.state = "moving";
                        u.hasOrders = true;
                    } else {
                        // No nearby enemy — patrol along the wall top (stay at wallY - 40 or higher, NEVER go south)
                        if (u.state === "idle" || !u.hasOrders || (u.target && u.target.isDummy && u.target.y > wallY - 20)) {
                            u.target = { 
                                x: gateX + ((Math.random() - 0.5) * 400), 
                                y: wallY - 40 - (Math.random() * 30),
                                isDummy: true 
                            };
                            u.state = "moving";
                            u.hasOrders = true;
                        }
                    }
                    return; // STOP. Do not fall through to any ground-level targeting below.
                }
                
// Melee reserve pre-breach logic
let availableLadders = typeof activeLadders !== "undefined" ? activeLadders : siegeEquipment.ladders.filter(l => l.isDeployed && l.hp > 0);

if (availableLadders.length > 0 && canUseSiegeEngines(u)) {
    let bestLadder = availableLadders.reduce((prev, curr) => 
        Math.hypot(curr.x - u.x, curr.y - u.y) < Math.hypot(prev.x - u.x, prev.y - u.y) ? curr : prev
    );
    u.target = { x: bestLadder.x, y: bestLadder.y - 15, isDummy: true };
    u.state = "moving";
    u.hasOrders = true;
} else if (u.state === "idle" || !u.hasOrders || (u.target && u.target.isDummy && u.target.y > wallY + 500)) {
    // REVISED: Form a tight reserve line just behind the archers (wallY + 450)
    // Spread them across a 800px wide line to look like an organized army
    u.target = { 
        x: gateX + ((Math.random() - 0.5) * 800), 
        y: wallY + 450 + (Math.random() * 80), // Stay out of tower range
        isDummy: true 
    };
    u.state = "moving";
    u.hasOrders = true;
}
            }
        }
    });
}
}

function applyDamageToGate(gateId, damageAmount) {
    // Find the specific gate being attacked
    const gateIndex = battleEnvironment.cityGates.findIndex(g => g.id === gateId || g.side === gateId);
    if (gateIndex === -1) return; 

    const targetGate = battleEnvironment.cityGates[gateIndex];
    targetGate.gateHP -= damageAmount;

    // Check for destruction
    if (targetGate.gateHP <= 0) {
        targetGate.isOpen = true; // Signals render to draw open/destroyed

        // STEP 1: Erase the collision
        let bounds = targetGate.bounds;
        if (bounds) {
            for (let x = bounds.x0; x <= bounds.x1; x++) {
                for (let y = bounds.y0; y <= bounds.y1; y++) {
                    let isPillar = (x === bounds.x0 || x === bounds.x1);
                    if (!isPillar && battleEnvironment.grid[x] && battleEnvironment.grid[x][y] !== undefined) {
                        battleEnvironment.grid[x][y] = 1; // 1 = Road
                    }
                }
            }
        }
    }
}

function deployAssaultLadder(ladder) {
    ladder.isDeployed = true;
    
    if (ladder.carriedBy && isNeverLadderCarrier(ladder.carriedBy)) {
        ladder.carriedBy.disableAICombat = false;
        ladder.carriedBy = null;
    }

    let tileX = Math.floor(ladder.x / BATTLE_TILE_SIZE);
    let tileY = Math.floor(ladder.y / BATTLE_TILE_SIZE); 

    // ---> SURGERY 1: Paint the ladder deep into the dirt (y + 6) so ground troops can actually step on it!
    for (let x = tileX - 2; x <= tileX + 2; x++) {
        for (let y = tileY - 8; y <= tileY + 6; y++) {
            if (battleEnvironment.grid[x] && battleEnvironment.grid[x][y] !== undefined) {
                battleEnvironment.grid[x][y] = 9; // 9 = Ladder Tile
            }
        }
    }

    if (typeof cityLadders !== 'undefined') {
        cityLadders.push({ x: ladder.x, y: ladder.y - 20 });
    }

    // SURGERY: Remove the '- 20' offset so it carves the TRUE outer lip of the wall
    let wallTileY = Math.floor(SiegeTopography.wallPixelY / BATTLE_TILE_SIZE); 
    prepareLadderLanding(ladder, wallTileY);
}

 
