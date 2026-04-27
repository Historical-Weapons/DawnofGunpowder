
function checkAssaultLadders(unit) {
  if (!inSiegeBattle || unit.hp <= 0 || unit.onWall) return;
    if (unit.side !== "player" || unit.y < SiegeTopography.wallPixelY) return;
    if (!canUseSiegeEngines(unit)) return; // SURGERY 1: Prevent climbing

    const tx = Math.floor(unit.x / BATTLE_TILE_SIZE);
    const ty = Math.floor(unit.y / BATTLE_TILE_SIZE);

    if (battleEnvironment.grid[tx] && battleEnvironment.grid[tx][ty] === 9) {
        unit.onWall = true;
        unit.y = SiegeTopography.wallPixelY - 20;
        if (unit.isCommander) console.log("Commander has reached the ramparts!");
    }
}

function concludeSiegeBattlefield(playerObj, forceVictory = false) {
   console.log("Concluding Siege Assault...");
    if (typeof cleanupSiegeRoofOverlay === 'function') cleanupSiegeRoofOverlay();
    
    // ADD THIS:
    if (typeof cleanupNavalSailCanvas === 'function') cleanupNavalSailCanvas();
    
   inBattleMode = false;
    inSiegeBattle = false;
    isBattlefieldReady = false; // RESET HERE

    playerObj.isMoving = true; // Ensure movement is unlocked
    playerObj.stunTimer = 0;   // Clear any stuns
    
    if (playerObj.hp <= 0) {
        playerObj.hp = 100; // Give a "second chance" health pool
    }

    let pSurvivors = battleEnvironment.units.filter(u => u.side === "player" && !u.isCommander && u.hp > 0);
    playerObj.roster = [];
    pSurvivors.forEach(u => {
    let exp = u.stats ? (u.stats.experienceLevel || 1) : 1;
        playerObj.roster.push({ type: u.unitType, exp: exp });
    });
    
    // Merge reserves back in if they exist
    if (playerObj.reserveRoster && playerObj.reserveRoster.length > 0) {
        playerObj.roster = playerObj.roster.concat(playerObj.reserveRoster);
        playerObj.reserveRoster = [];
    }
    
    // Force the troop count to equal the living roster
    playerObj.troops = playerObj.roster.length;

    // Calculate accurate losses based on the single source of truth
    let initialCount = (currentBattleData.trueInitialCounts && currentBattleData.trueInitialCounts.player) 
        ? currentBattleData.trueInitialCounts.player 
        : currentBattleData.initialCounts.player;
        
    let playerLost = Math.max(0, initialCount - playerObj.troops);
    let eUnitsAlive = battleEnvironment.units.filter(u => u.side === "enemy" && u.hp > 0).length;
    let didPlayerWin = forceVictory || eUnitsAlive <5;
    let city = currentSiegeCity;
 
    
    // SURGERY: Hard block campaign logic if this is a Custom Battle
    if (!city) {
        console.log("Custom Siege Concluded. Bypassing Campaign Logic.");
        if (typeof window.leaveBattlefield === 'function') window.leaveBattlefield(playerObj);
        return;
    }

    const siegeGui = document.getElementById("siege-gui");
    const statusText = document.getElementById("siege-status-text");
    const guiContinueBtn = document.getElementById("gui-continue-btn");
    const guiAssaultBtn = document.getElementById("gui-assault-btn");
    const guiLeaveBtn = document.getElementById("gui-leave-btn");

    if (didPlayerWin) {
        console.log(`${city.name} has fallen to the Assault!`);
        city.faction = playerObj.faction;
        city.color = (typeof FACTIONS !== 'undefined' && FACTIONS[playerObj.faction]) ? FACTIONS[playerObj.faction].color : "#ffffff";
        
        let occupyingForce = Math.max(5, Math.floor(playerObj.troops * 0.3));
        city.militaryPop = occupyingForce;
        city.troops = occupyingForce;
        playerObj.troops -= occupyingForce;
        city.isUnderSiege = false;
        
        if (typeof activeSieges !== 'undefined') {
            let sIndex = activeSieges.findIndex(s => s.defender === city);
            if (sIndex > -1) activeSieges.splice(sIndex, 1);
        }
        
        if (siegeGui) siegeGui.style.display = 'block';
        if (statusText) statusText.innerHTML = `ASSAULT SUCCESSFUL!<br><span style="font-size:0.9rem; color:#fff;">${city.name} is yours. You lost ${playerLost} troops in the breach. You left ${occupyingForce} men to garrison.</span>`;
        if (guiContinueBtn) guiContinueBtn.style.display = 'none';
        if (guiAssaultBtn) guiAssaultBtn.style.display = 'none';
        if (guiLeaveBtn) {
            guiLeaveBtn.innerText = "Enter City";
            guiLeaveBtn.onclick = () => {
                siegeGui.style.display = 'none';
                playerObj.isSieging = false;
                playerObj.stunTimer = 0;  
            };
        }
} else {
console.log("Assault called off.");
        let initialEnemy = (currentBattleData.trueInitialCounts && currentBattleData.trueInitialCounts.enemy) 
            ? currentBattleData.trueInitialCounts.enemy 
            : 100;
            
        // ---> SURGERY: Use the accurate global scale to reconstruct the city garrison <---
        let scale = window.GLOBAL_BATTLE_SCALE || 1;
        city.militaryPop = Math.max(1, eUnitsAlive * scale);
        city.troops = city.militaryPop;
        
        if (siegeGui) siegeGui.style.display = 'block';
        if (statusText) statusText.innerHTML = `ASSAULT FAILED!<br><span style="font-size:0.9rem; color:#aaa;">You retreated with ${playerLost} casualties.<br>Enemy has ${city.militaryPop} defenders.</span>`;
        
        if (guiContinueBtn) guiContinueBtn.style.display = 'none';
        if (guiAssaultBtn) guiAssaultBtn.style.display = 'none';
        
        if (guiLeaveBtn) {
            guiLeaveBtn.innerText = "Abandon Siege";
            guiLeaveBtn.onclick = () => {
                if (typeof endSiege === 'function') endSiege(false);
                playerObj.isSieging = false;
                playerObj.stunTimer = 0; 
                if (siegeGui) siegeGui.style.display = 'none';
            };
        }

        playerObj.isSieging = true;
        playerObj.stunTimer = 9999; 
        
        if (typeof restoreSiegeAfterBattle === 'function') {
            restoreSiegeAfterBattle(false);
        }
    }

    if (savedWorldPlayerState_Battle.x !== 0) {
        playerObj.x = savedWorldPlayerState_Battle.x;
        playerObj.y = savedWorldPlayerState_Battle.y;
    }

    if (typeof camera !== 'undefined') {
        camera.x = playerObj.x - canvas.width / 2;
        camera.y = playerObj.y - canvas.height / 2;
    }

    currentBattleData = null; 
    currentSiegeCity = null;
    battleEnvironment.units = []; 
    battleEnvironment.projectiles = [];
	    battleEnvironment.groundEffects = [];
}

function monitorSiegeEndState(playerObj) { //obsolete
    if (!inSiegeBattle) return;

    let attackersAlive = battleEnvironment.units.filter(u => u.side === "player" && u.hp > 0).length;
    let defendersAlive = battleEnvironment.units.filter(u => u.side === "enemy" && u.hp > 0).length;

    if (defendersAlive === 0 || attackersAlive === 0 || !isCommanderAlive()) {
        concludeSiegeBattlefield(playerObj); 
        siegeEquipment.rams = [];
        siegeEquipment.ladders = [];
        siegeEquipment.mantlets = [];
        siegeEquipment.trebuchets = [];
    }
}

function applyStuckExtractor(unit) {
    // Initialize tracking variables if they don't exist
    if (!unit.lastPos) {
        unit.lastPos = { x: unit.x, y: unit.y };
        unit.stuckTicks = 0;
        unit.extractorCooldown = 0;
        unit.ignoreCollisionTicks = 0; // NEW: Tracks the 1-second ghost mode
    }

    // Tick down ghost mode if active
    if (unit.ignoreCollisionTicks > 0) {
        unit.ignoreCollisionTicks--;
    }

    // Don't extract if on cooldown from a recent extraction
    if (unit.extractorCooldown > 0) {
        unit.extractorCooldown--;
        unit.lastPos = { x: unit.x, y: unit.y };
        return; 
    }

    // Only apply logic if the unit has a target or is actively trying to move
    if (unit.target || unit.isMoving || unit.state === "moving") {
        let dx = unit.x - unit.lastPos.x;
        let dy = unit.y - unit.lastPos.y;
        let distSq = (dx * dx) + (dy * dy);

        // If distance squared is less than 0.5 pixels over this tick, they are snagged
        if (distSq < 0.5) {
            // ONLY trigger if they are physically touching a Wall (6), Tower (7), or Tree (3)
            let tx = Math.floor(unit.x / BATTLE_TILE_SIZE);
            let ty = Math.floor(unit.y / BATTLE_TILE_SIZE);
            let touchingObstacle = false;

            if (typeof battleEnvironment !== 'undefined' && battleEnvironment.grid) {
                // Check a 3x3 grid around the unit for the specific tiles
                for (let ox = -1; ox <= 1; ox++) {
                    for (let oy = -1; oy <= 1; oy++) {
                        let cx = tx + ox;
                        let cy = ty + oy;
                        if (battleEnvironment.grid[cx] && battleEnvironment.grid[cx][cy] !== undefined) {
                            let tile = battleEnvironment.grid[cx][cy];
                            if (tile === 3 || tile === 6 || tile === 7) {
                                touchingObstacle = true;
                            }
                        }
                    }
                }
            }

            if (touchingObstacle) {
                unit.stuckTicks++;
            } else {
                unit.stuckTicks = 0; // They are snagged on another unit/something else, ignore.
            }
        } else {
            // They are moving normally, reset the stuck counter
            unit.stuckTicks = 0;
        }

        // If snagged for 90 consecutive frames (approx. 1.5 seconds at 60fps)
        if (unit.stuckTicks > 90) {
            // GHOST MODE: Allow them to pass through the snagged tile for 60 frames (1 second)
            unit.ignoreCollisionTicks = 60;
            unit.stuckTicks = 0;
            unit.extractorCooldown = 180; // 3 seconds cooldown before attempting another extract
            
            // Briefly clear their current pathing node to force a smooth repath out of the tile
            if (unit.path) unit.path = null; 
        }
    }
    
    // Update last position for the next frame
    unit.lastPos = { x: unit.x, y: unit.y };
}

function isNeverLadderCarrier(u) {
    if (!u || !u.stats) return true; // Safety fallback: invalid units don't carry ladders

    const txt = String(
        (u.unitType || "") + " " +
        (u.stats.role || "") + " " +
        (u.stats.name || "")
    ).toLowerCase();

    // 1. Explicitly check flags
    if (u.isMounted || u.stats.isLarge || u.isCommander || u.isDummy) {
        return true; 
    }

    // 2. Comprehensive Regex for ANY cavalry terminology
    // Added 'knight' and 'cataphract' just in case
    const isCavalryText = /\b(cav|horse|mounted|camel|eleph|lancer|archer|cataphract)\b/.test(txt);
    
    return isCavalryText;
}

// --- HELPER FUNCTION: Fire this ONLY ONCE when the gate breaks ---
function triggerGateBreach(gate) {
 
    console.log("Gate Breached! Defenders retreating to Plaza.");
    window.__SIEGE_GATE_BREACHED__ = true; // Global Hard Flag

    // 1. Update Gate Data
    gate.isOpen = true;
    gate.gateHP = 0;

// 2. Retreat Defenders & Rush Attackers
    if (battleEnvironment.units) {
        battleEnvironment.units.forEach(u => {
            
           // --- SURGERY: ALL PLAYER UNITS RUSH THE PLAZA (STAGE 1 FUNNEL) ---
            if (u.side === "player" && !u.isCommander) {
                // MANDATORY EXCEPTION: Ladder fanatics keep swarming the walls!
                if (u.siegeRole !== "ladder_fanatic") {
                    u.hasOrders = true;
                    u.orderType = "siege_assault"; 
                    u.siegeRole = "assault_complete"; // Forces them to drop rams
                    u.target = null; // Clears current distractions
                    
                    let gateX = typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelX : 1200;
                    let gateY = typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelY : 2000;
                    
                    // Immediately point them strictly at the gate centroid
                    u.orderTargetPoint = { 
                        x: gateX + (Math.random() - 0.5) * 80, // Tight spread to force the funnel
                        y: gateY - 20 // Pulls them across the threshold
                    };
                }
            }
            
            if (u.side === "enemy") u.retreatToPlaza = true;
        });
    }
// 3. Obliterate Collision Grid (Set to 1 / Road)
    const bounds = gate.bounds;
    if (bounds && battleEnvironment.grid) {
        for (let x = bounds.x0; x <= bounds.x1; x++) {
            // SURGERY: Identify the outer edges (Pillars) and protect them
            let isPillar = (x === bounds.x0 || x === bounds.x1);
            
            for (let y = bounds.y0; y <= bounds.y1; y++) {
                if (!isPillar && battleEnvironment.grid[x]?.[y] !== undefined) {
                    battleEnvironment.grid[x][y] = 1; // Only make the middle walkable
                }
            }
        }
    }

    // 4. Remove from Render Array
    if (battleEnvironment.cityGates) {
        const gateIndex = battleEnvironment.cityGates.findIndex(g => g.side === gate.side);
        if (gateIndex !== -1) {
            battleEnvironment.cityGates.splice(gateIndex, 1);
        }
    }
	
	// --- AUTO-RETREAT TIMER AFTER BREACH ---
if (!window.__SIEGE_AUTO_RETREAT_TRIGGERED__) {
    window.__SIEGE_AUTO_RETREAT_TRIGGERED__ = true;

setTimeout(() => {
        console.log("AUTO-RETREAT: Gate breach timer completed.");

        if (!inSiegeBattle) return;

        // 1. Force state reset so the engine stops trying to run siege AI
        inSiegeBattle = false; 
        if (typeof inBattleMode !== 'undefined') inBattleMode = false;

        battleEnvironment.units.forEach(u => {
            if (u.side === "enemy" && u.hp > 0) {
                u.state = "FLEEING";
                u.target = null;
                u.retreatToPlaza = true;
            }
        });

// 2.1. Check the global flag
// 2.2. Check if the city object is totally missing
// 2.3. Check if the city object is a "Dummy" (missing campaign stats like militaryPop)
const isCustom = window.__CUSTOM_BATTLE_MODE__ || 
                 !currentSiegeCity || 
                 (currentSiegeCity && typeof currentSiegeCity.militaryPop === 'undefined');

console.log(`[SIEGE SYSTEM] Battle Mode Detected: ${isCustom ? "CUSTOM" : "CAMPAIGN"}`);
if (isCustom) {
    console.log("Cleaning up Custom Siege Battle...");

    // SNAPSHOT THE FINAL SIEGE STATE BEFORE CLEARING ANYTHING
    window.__CUSTOM_SIEGE_RESULT__ = "victory";
    window.__CUSTOM_SIEGE_COUNTS__ = {
        pAlive: battleEnvironment.units.filter(u => u.side === "player" && u.hp > 0).length,
        eAlive: battleEnvironment.units.filter(u => u.side === "enemy" && u.hp > 0).length
    };

    // Clear runtime objects
    battleEnvironment.units = [];
    battleEnvironment.projectiles = [];
    battleEnvironment.groundEffects = [];

    // Trigger the UI menu return cleanly
    if (typeof window.leaveBattlefield === 'function') {
        window.leaveBattlefield(typeof player !== 'undefined' ? player : null);
    }
}
		
else {
            console.log("Concluding Campaign Siege...");
            
            // SURGERY: Bulletproof fallback chain for both Campaign and Custom Battles
            let pObj = null;
            if (typeof playerObj !== 'undefined' && playerObj) {
                pObj = playerObj; // Takes priority if passed into the function
            } else if (typeof player !== 'undefined' && player) {
                pObj = player;    // Grabs the Campaign 'let' variable
            } else if (window.player) {
                pObj = window.player; // Grabs the Custom Battle mock object
            }
            
            let victory = (typeof forceVictory !== 'undefined') ? forceVictory : false;

            if (typeof concludeSiegeBattlefield === 'function') {
                concludeSiegeBattlefield(pObj, victory);
            }
        }
        // 3. WIPE TOPOGRAPHY: Prevents the next battle from using old gate/wall positions
        for (let key in SiegeTopography) {
            SiegeTopography[key] = 0;
        }

    }, 5000);
}

}

function prepareLadderLanding(ladder, wallTileY) {
    let tx = Math.floor(ladder.x / BATTLE_TILE_SIZE);
    
    // Create a 4-wide "landing pad" on the wall that is WALKABLE
    // We use tile '10' instead of '1' so ai_categories.js maintains their "onWall" status!
    for(let x = tx - 2; x <= tx + 2; x++) {
        if(battleEnvironment.grid[x]) {
            
            // ---> SURGERY 2: Carve a 12-tile deep path through the Solid Stone (Zone 1) 
            // to connect directly to the Wooden Walkway (Zone 3).
            for(let depth = 0; depth <= 12; depth++) {
                let targetY = wallTileY - depth;
                if(battleEnvironment.grid[x][targetY] !== undefined) {
                    let currentTile = battleEnvironment.grid[x][targetY];
                    
// --- SURGERY: Player Passage Protection ---
                    // If we are near the gate's X coordinate, DO NOT use Tile 10.
                    // Use Tile 1 (Normal Ground) so the player doesn't get blocked.
                    let isGateEntry = Math.abs(x - SiegeTopography.gateTileX) < 5;
                    
                    if (currentTile === 6 || currentTile === 0) {
                        battleEnvironment.grid[x][targetY] = isGateEntry ? 1 : 10; 
                    }
                }
            }
            
            // Guarantee the outer lip is always walkable for the dismount
            if(battleEnvironment.grid[x][wallTileY] !== undefined) battleEnvironment.grid[x][wallTileY] = 10;
            if(battleEnvironment.grid[x][wallTileY - 1] !== undefined) battleEnvironment.grid[x][wallTileY - 1] = 10;
        }
    }
}