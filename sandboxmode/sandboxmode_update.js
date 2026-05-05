let economyTick = 0;
 let uiSyncTick = 0;
 
let wasInCity = false; // Tracks the previous frame state
function calculateMovement(speed, map, tileSize, cols, rows, isCity = false) {
    if (window.isMobileDrawerOpen) {
        player.isMoving = false;
        return;
    }

    if ((player.isSieging && !inBattleMode) || player.stunTimer > 0) {
        if (player.stunTimer > 0) player.stunTimer--;
        player.isMoving = false;
        return;
    }

    let dx = 0, dy = 0;
    player.isMoving = false;
    let currentSpeed = speed;
    let isClimbing = false;
    let isMounted = false;
 
    if (window.inCampMode) {
        currentSpeed *= 0.4; //useless
		
    }
	
    let activeUnit = player;
    if (inBattleMode && typeof battleEnvironment !== 'undefined') {
        let pCmdr = battleEnvironment.units.find(u => u.isCommander && u.side === "player");
        if (pCmdr) activeUnit = pCmdr;
    }

    isMounted = activeUnit.stats?.isLarge || activeUnit.isMounted || String(activeUnit.unitType || "").toLowerCase().match(/(cav|horse|camel|eleph)/);

    if (inCityMode && !inBattleMode) {
        const tx = Math.floor(player.x / CITY_TILE_SIZE);
        const ty = Math.floor(player.y / CITY_TILE_SIZE);
        const currentTile = cityDimensions[currentActiveCityFaction]?.grid?.[tx]?.[ty];

        if (!isMounted && (currentTile === 9 || currentTile === 12)) {
            isClimbing = true;
        }
    } else if (inBattleMode) {
        const tx = Math.floor(player.x / BATTLE_TILE_SIZE);
        const ty = Math.floor(player.y / BATTLE_TILE_SIZE);
        const tile = battleEnvironment.grid[tx]?.[ty];

        if (!isMounted && (tile === 9 || tile === 12)) isClimbing = true;
    }
 
    currentSpeed *= 0.5;
    
    // ---> SURGERY: TRIPLE PLAYER SPEED IN CITIES <---
    if (inCityMode && !inBattleMode) {
        currentSpeed *= 3.0; 
    }

    if (isClimbing) {
        currentSpeed *= 0.20;
    }

    if (inCityMode && !inBattleMode && keys['p']) {
        keys['p'] = false;
        if (typeof leaveCity === 'function') leaveCity(player);
        return;
    }

    if (player.hp > 0) {
        if (keys['w'] || keys['arrowup']) {
            dy -= currentSpeed;
            player.isMoving = true;
        }
        if (keys['s'] || keys['arrowdown']) {
            dy += currentSpeed;
            player.isMoving = true;
        }
        if (keys['a'] || keys['arrowleft']) {
            dx -= currentSpeed;
            player.isMoving = true;
        }
        if (keys['d'] || keys['arrowright']) {
            dx += currentSpeed;
            player.isMoving = true;
        }
        if (player.isMoving) player.anim++;
    }

    const nextX = player.x + dx;
    const nextY = player.y + dy;

    if (inCityMode && !inBattleMode) {
        const outOfBounds = (
            nextX < 0 ||
            nextX >= CITY_WORLD_WIDTH ||
            nextY < 0 ||
            nextY >= CITY_WORLD_HEIGHT
        );

        if (nextY >= CITY_WORLD_HEIGHT - 5) {
            if (typeof leaveCity === 'function') leaveCity(player);
            return;
        }

        const curTx = Math.floor(player.x / CITY_TILE_SIZE);
        const curTy = Math.floor(player.y / CITY_TILE_SIZE);
        const currentTile = cityDimensions[currentActiveCityFaction]?.grid?.[curTx]?.[curTy];

        const nextTx = Math.floor(nextX / CITY_TILE_SIZE);
        const nextTy = Math.floor(nextY / CITY_TILE_SIZE);
        const destTile = cityDimensions[currentActiveCityFaction]?.grid?.[nextTx]?.[nextTy];

        if (!isMounted) {
            if (currentTile === 9 || currentTile === 12) {
                if (destTile === 8 || destTile === 10) player.onWall = true;
                else if (destTile === 0 || destTile === 1 || destTile === 5) player.onWall = false;
            } else if (currentTile === 8 || currentTile === 10) {
                player.onWall = true;
            } else {
                player.onWall = false;
            }
        }

        const isColliding = isCityCollision(nextX, nextY, currentActiveCityFaction, player.onWall);

        if (!outOfBounds && !isColliding) {
            player.x = nextX;
            player.y = nextY;
            player.isMoving = true;
        } else {
            player.isMoving = false;
        }

        return;
    } else if (inBattleMode) {
        const bW = (typeof BATTLE_WORLD_WIDTH !== 'undefined') ? BATTLE_WORLD_WIDTH : 2000;
        const bH = (typeof BATTLE_WORLD_HEIGHT !== 'undefined') ? BATTLE_WORLD_HEIGHT : 2000;

        let tileX = battleEnvironment.grid[Math.floor(nextX / BATTLE_TILE_SIZE)]?.[Math.floor(player.y / BATTLE_TILE_SIZE)];
        let tileY = battleEnvironment.grid[Math.floor(player.x / BATTLE_TILE_SIZE)]?.[Math.floor(nextY / BATTLE_TILE_SIZE)];

        let bypassGateCollision = false;
        if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle && typeof SiegeTopography !== 'undefined') {
            let isBreached = window.__SIEGE_GATE_BREACHED__;
            if (isBreached) {
                let distToGateX = Math.abs(nextX - SiegeTopography.gatePixelX);
                let distToGateY = Math.abs(nextY - SiegeTopography.gatePixelY);
                if (distToGateX < 45 && distToGateY < 250) bypassGateCollision = true;
            }
        }

        const tile8Blocks = !window.inNavalBattle;
        const canMoveX = bypassGateCollision || (!isBattleCollision(nextX, player.y, player.onWall, activeUnit) && (!tile8Blocks || tileX !== 8));
        const canMoveY = bypassGateCollision || (!isBattleCollision(player.x, nextY, player.onWall, activeUnit) && (!tile8Blocks || tileY !== 8));

        if (canMoveX) player.x = Math.max(0, Math.min(nextX, bW));
        if (canMoveY) player.y = Math.max(0, Math.min(nextY, bH));

        if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle && battleEnvironment?.grid) {
            const pTx = Math.floor(player.x / BATTLE_TILE_SIZE);
            const pTy = Math.floor(player.y / BATTLE_TILE_SIZE);
            const tile = battleEnvironment.grid[pTx]?.[pTy];

            if (tile === 1 || tile === 5) {
                player.onWall = false;
            } else {
                player.onWall = false;
            }
        }
    } else if (isCity) {
        const cityW = (typeof CITY_WORLD_WIDTH !== 'undefined') ? CITY_WORLD_WIDTH : 2000;

        if (nextX > 25 && nextX < cityW - 25 && nextY > 25) {
            const txx = Math.floor(nextX / CITY_TILE_SIZE);
            const tyy = Math.floor(nextY / CITY_TILE_SIZE);
            const nextTile = cityDimensions[currentActiveCityFaction]?.grid?.[txx]?.[tyy];

            const isWallFloor = (nextTile === 8);
            const isStoneWall = (nextTile === 6);
            const isAccessTile = (nextTile === 10 || nextTile === 12);
            const isStairs = (nextTile === 9);

            const curTx = Math.floor(player.x / CITY_TILE_SIZE);
            const curTy = Math.floor(player.y / CITY_TILE_SIZE);
            const currentTile = cityDimensions[currentActiveCityFaction]?.grid?.[curTx]?.[curTy];
            const currentlyOnStairs = (currentTile === 9);
            const currentlyInAccess = (currentTile === 10 || currentTile === 12);

            let canMove = false;

            if (isAccessTile) {
                canMove = true;
            } else if (currentlyInAccess || currentlyOnStairs) {
                canMove = !isCityCollision(nextX, nextY, currentActiveCityFaction, player.onWall);
            } else if (!isWallFloor && !isStoneWall) {
                canMove = !isCityCollision(nextX, nextY, currentActiveCityFaction, player.onWall);
            }

            if (canMove) {
                player.x = nextX;
                player.y = nextY;
            }
        }
    } else if (map?.length > 0) {
        const ntx = Math.floor(nextX / tileSize);
        const nty = Math.floor(nextY / tileSize);
        const destTile = map[ntx]?.[nty];
        // Water tiles (Ocean/Coastal/River) are always navigable on the overworld —
        // the player is shown as a ship. Story1 marks them impassable:true for NPC
        // city-placement only, so we bypass that check here.
        const isWaterTile = destTile && ["Ocean", "Coastal", "River", "Sea", "Deep Ocean"].includes(destTile.name);

        if (
            ntx >= 0 &&
            ntx < (cols || 0) &&
            nty >= 0 &&
            nty < (rows || 0) &&
            (destTile?.impassable === false || isWaterTile)
        ) {
            player.x = nextX;
            player.y = nextY;
        }
    }
}

const SAFE_WIDTH = typeof WORLD_WIDTH !== 'undefined' ? WORLD_WIDTH : 2000;
const SAFE_HEIGHT = typeof WORLD_HEIGHT !== 'undefined' ? WORLD_HEIGHT : 2000;

//overworld PLAYER STUFF HERE MAN
var player = {
    // --- POSITION & PHYSICS ---
    x: SAFE_WIDTH * 0.5,
    y: SAFE_HEIGHT * 0.45,
    size: 24,
    distTrack: 0,       

    // --- MOVEMENT & STATE ---
    baseSpeed: 15,  //overworld    
    speed: 15, //overworld
    isMoving: false,
    stunTimer: 0,
    anim: 0,
    color: "#ffffff",

    // --- RESOURCES ---
    gold: 500,
    food: 100,
    maxFood: 2000,
    troops: 20, //>>>>>>>>>>>>>>>>>>>>>>>>>>>>>dpnt forget
	inventory: { 
	"leather_hides": 3,   // 🟫 Common Steppe resource
    "timber_logs": 3,    // 🪵 Common Forest resource
    "sea_salt": 3,        // 🧂 Common Ocean resource
    "linen_cloth": 3,     // 🧵 Common Plains resource
    "clay_pots": 3      	},   
    cargoCapacity: 50,     // Corrected: Key/Value format
    cargoUsed: 0,          // Corrected: Key/Value format
	
	// ---> ADD THIS RIGHT HERE <---
    questLog: { active: [], completed: [] },
	
    // --- PROGRESSION ---
    experience: 0,
    experienceLevel: 1,

    // --- COMBAT STATS ---
    hp: 200,
    maxHealth: 200,
    meleeAttack: 15,
    meleeDefense: 15,
    armor: 20,

    // --- DIPLOMACY ---
    faction: "Player's Kingdom",
    enemies: ["Bandits"],
 //roster: ["Militia", "Crossbowman", "Heavy Crossbowman", "Bomb", "Spearman", "Firelance", "Heavy Firelance", "Archer", "Horse Archer", "Heavy Horse Archer", "General", "Shielded Infantry", "Light Two Handed", "Heavy Two Handed", "Lancer", "Heavy Lancer", "Elite Lancer", "Rocket", "Keshig", "Hand Cannoneer", "Camel Cannon", "Poison Crossbowman", "War Elephant", "Repeater Crossbowman", "Slinger", "Glaiveman", "Javelinier", "Militia", "Militia", "Militia", "Militia", "Militia", "Militia", "Militia", "Militia", "Militia", "Militia", "Militia", "Militia", "Militia", "Spearman", "Spearman", "Spearman", "Spearman", "Spearman", "Spearman", "Spearman", "Spearman", "Spearman", "Spearman", "Spearman", "Spearman", "Spearman", "Spearman", "Spearman", "Spearman", "Shielded Infantry", "Shielded Infantry", "Shielded Infantry", "Shielded Infantry", "Shielded Infantry", "Shielded Infantry", "Shielded Infantry", "Shielded Infantry", "Crossbowman", "Crossbowman", "Crossbowman", "Crossbowman", "Crossbowman", "Crossbowman", "Crossbowman", "Crossbowman", "Crossbowman", "Crossbowman", "Crossbowman", "Crossbowman", "Heavy Crossbowman", "Heavy Crossbowman", "Heavy Crossbowman", "Heavy Crossbowman", "Heavy Crossbowman", "Heavy Crossbowman", "Archer", "Archer", "Archer", "Archer", "Archer", "Archer", "Firelance", "Firelance", "Firelance", "Firelance", "Heavy Firelance", "Heavy Firelance", "Bomb", "Repeater Crossbowman", "Repeater Crossbowman", "Repeater Crossbowman", "Poison Crossbowman", "Slinger"].map(unitName => ({ type: unitName, exp: 1 })),
 
 roster: [
     
    "Militia", "Militia", "Militia", "Militia", "Militia",
    "Militia", "Militia", "Militia", "Militia", "Militia",
    "Militia", "Militia", "Militia", "Militia", "Militia",
    "Militia", "Militia", "Militia", "Militia", "Militia"
].map(unitName => ({ type: unitName, exp: 1 })),

    // --- SYSTEM ---
    isInitialized: false
};
	
const keys = {};

// Add an initialization function
function initPlayer() {
    // Check if overworld constants exist, otherwise use defaults
    const worldW = typeof WORLD_WIDTH !== 'undefined' ? WORLD_WIDTH : 2000;
    const worldH = typeof WORLD_HEIGHT !== 'undefined' ? WORLD_HEIGHT : 2000;
    
    player.x = worldW * 0.5;
    player.y = worldH * 0.45;
}

// AFTER — only reset position if no scenario is active:
function enterOverworldMode() {
    // SANDBOX SAFETY: clear stale NPC spawn bans only when NOT in Scenario 1.
    // __campaignStory1Active is true for the entire duration of a Story 1 session,
    // so this is a no-op during scenario play.
    // IMPORTANT: do NOT touch __activeScenario here — clearing it mid-session
    // destroys the trigger/dialogue system every time the player exits a battle.
    if (!window.__campaignStory1Active) {
        window.__npcSpawnBans      = null;
        window.__mongolWaveAllowed = false;
    }

    const w = (typeof WORLD_WIDTH !== 'undefined') ? WORLD_WIDTH : 2000;
    const h = (typeof WORLD_HEIGHT !== 'undefined') ? WORLD_HEIGHT : 2000;
    
    // Do NOT reset position if a scenario supplies its own playerSetup.
    // Scenario position is applied by _placePlayer() in scenario_update.js and
    // _applyPlayerSetup() in scenario_triggers.js — resetting here would clobber it.
    const _hasScenarioPos = (() => {
        const ps = window.__DoG_pendingScenario?.playerSetup || window.__activeScenario?.playerSetup;
        return ps && (typeof ps.x === "number" || typeof ps.xPct === "number");
    })();
    if (!_hasScenarioPos) {
        player.x = w * 0.5;
        player.y = h * 0.45;
    }

    player.hp = Math.max(1, player.maxHealth || 100);
    player.stunTimer = 0;
    player.isMoving = false;
    player.isInitialized = true;
    AudioManager.init();
    AudioManager.stopMusic();
    
    // ---> SURGERY: Nuke all battlefield SFX instantly upon re-entering the map
    if (typeof SfxManager !== 'undefined') {
        SfxManager.stopAll();
    }
}
// 1. ADD THIS: Tell the game when a key is pressed!
window.onkeydown = (e) => keys[e.key.toLowerCase()] = true;
window.onkeyup = (e) => keys[e.key.toLowerCase()] = false;
window.onwheel = (e) => {
    // SURGERY 1: Block zoom if in Diplomacy OR the Mobile Detail Drawer is open
    if ((typeof inParleMode !== 'undefined' && inParleMode) || window.isMobileDrawerOpen) {
        return;
    }


    // 2. If player scrolls normally, cancel cinematic instantly
    if (window.isZoomAnimating) { 
        window.isZoomAnimating = false; 
    }      
    zoom = Math.max(0.17, Math.min(3, zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
};

function update() {
 
	let uiElement = document.getElementById("ui");
	if (uiElement) {    uiElement.style.display = inBattleMode ? "none" : "block";}


    const aliveEnemies = battleEnvironment.units.filter(u => u.side !== 'player' && u.hp > 0).length;
    let pCmdr = battleEnvironment.units.find(u => u.isCommander && u.side === "player");
    let disableAICombatDefeated = pCmdr ? (pCmdr.hp <= 0) : (player.hp <= 0);

    // SURGERY 2: Freeze the entire game loop if in Diplomacy OR the Mobile Detail Drawer is open
    if ((typeof inParleMode !== 'undefined' && inParleMode) || window.isMobileDrawerOpen) return;

// ⬇ ADD THIS IMMEDIATELY AFTER:
	if (window.inCampMode) return;  
    if (window.inTradeMode) return; // <-- ADD THIS
	
    const parlePanel = document.getElementById('parle-panel');
    if ((inBattleMode || (typeof inCityMode !== 'undefined' && inCityMode)) && parlePanel?.style.display !== 'none') {
        parlePanel.style.display = 'none';
        inParleMode = false;
    }

    if ((typeof troopGUI !== 'undefined' && troopGUI.isOpen) || (typeof pendingSallyOut !== 'undefined' && pendingSallyOut)) return;

    const cityPanel = document.getElementById('city-panel');
    if (inBattleMode || (typeof inCityMode !== 'undefined' && inCityMode)) {
        if (cityPanel?.style.display !== 'none') cityPanel.style.display = 'none';
    }

    const isUIBusy = (typeof troopGUI !== 'undefined' && troopGUI.isOpen) || inBattleMode || (typeof inCityMode !== 'undefined' && inCityMode);
    const dipBtn = document.getElementById('diplomacy-container');
    if (dipBtn) dipBtn.style.display = (!isUIBusy && document.getElementById('loading')?.style.display === 'none') ? 'block' : 'none';

    const siegeGui = document.getElementById('siege-gui');
    if (siegeGui && player.isSieging && !inBattleMode && !(typeof inCityMode !== 'undefined' && inCityMode)) {
        if (siegeGui.style.display === 'none') siegeGui.style.display = 'block';
    }

    if (typeof inParleMode !== 'undefined' && inParleMode) return;
    
   if (inBattleMode) 
	{
					if (!battleEnvironment?.grid || typeof pCmdr === 'undefined' || !pCmdr) return;
					
			// --- NAVAL / RIVER PHYSICS HOOK ---
			// Check for Ocean/Coastal mode
					if (typeof window.inNavalBattle !== 'undefined' && window.inNavalBattle) {
						updateNavalPhysics();
					} 
					// Check for River mode (Safe against undefined)
					else if (typeof window.inRiverBattle !== 'undefined' && window.inRiverBattle) {
						// This runs the river drowning/swimming logic
						updateRiverPhysics();
					}
					// --- END NAVAL / RIVER PHYSICS HOOK ---
					
					player.size = 24;

					// ---> SURGERY: STRICT TILE CHECK FOR PLAYER WATER SLOWDOWN <---
					// Safely clamp coordinates to prevent out-of-bounds array checks
					let pTx = Math.floor(player.x / (typeof BATTLE_TILE_SIZE !== 'undefined' ? BATTLE_TILE_SIZE : 8));
					let pTy = Math.floor(player.y / (typeof BATTLE_TILE_SIZE !== 'undefined' ? BATTLE_TILE_SIZE : 8));
					pTx = Math.max(0, Math.min(BATTLE_COLS - 1, pTx));
					pTy = Math.max(0, Math.min(BATTLE_ROWS - 1, pTy));
					
					let playerTile = (battleEnvironment.grid[pTx] && battleEnvironment.grid[pTx][pTy]) ? battleEnvironment.grid[pTx][pTy] : 0;
					let waterSpeedMulti = 1.0;

					// NAVAL FIX: The grid is 100% water. Rely on exact 3D deck math instead!
					if (window.inNavalBattle && typeof window.getNavalSurfaceAt === 'function') {
						let surface = window.getNavalSurfaceAt(player.x, player.y);
						if (surface === 'WATER' || surface === 'EDGE') {
							waterSpeedMulti = 0.40;
						}
					} else {
						// Standard field/river battles: ONLY slow down on raw water (4) or ocean (11)
						// Land (0), Mud (7), and Grass (10) will retain 1.0x normal speed.
						if (playerTile === 4 || playerTile === 11) {
							waterSpeedMulti = 0.40; 
						}
					}

					// Apply movement: On land, waterSpeedMulti is 1.0 so they move at normal battle speed
					calculateMovement(((player.baseSpeed / 4) * 0.70) * waterSpeedMulti, null, typeof BATTLE_TILE_SIZE !== 'undefined' ? BATTLE_TILE_SIZE : 8, null, null, true);
					
					if (typeof updateBattleUnits === 'function') updateBattleUnits();

					// (NOTE: The secondary 'UNIVERSAL WATER SLOWDOWN FOR ALL TROOPS' loop has been 
					// completely removed from here, as updateRiverPhysics handles it properly!)
					
					pCmdr = battleEnvironment.units.find(u => u.isCommander && u.side === "player");
					
					
					if (pCmdr && player) {
						player.hp = pCmdr.hp;
						disableAICombatDefeated = (pCmdr.hp <= 0); 
						
					if (!disableAICombatDefeated) {
						pCmdr.x = player.x; pCmdr.y = player.y;
						pCmdr.isMoving = player.isMoving;
						if (player.isMoving) pCmdr.state = "moving";
						if (keys['a'] || keys['arrowleft']) {
							pCmdr.direction = player.direction = -1;
							// Set facingDir directly from input — more reliable than _prevX delta
							// for the commander since position is force-synced every frame.
							// troop_draw.js negates this for cavalry render — so set logical value here.
							pCmdr.facingDir = -1; // facing LEFT
							// // UP placeholder   : future — if (keys['w']) pCmdr.facingDirY = -1;
							// // DOWN placeholder : future — if (keys['s']) pCmdr.facingDirY = 1;
						}
						if (keys['d'] || keys['arrowright']) {
							pCmdr.direction = player.direction = 1;
							pCmdr.facingDir = 1;  // facing RIGHT
							// // UP placeholder   : future — if (keys['w']) pCmdr.facingDirY = -1;
							// // DOWN placeholder : future — if (keys['s']) pCmdr.facingDirY = 1;
						}
						pCmdr.vx = pCmdr.vy = 0; 
						
			// SURGERY REVISION: Hold the attack lock, BUT drop it if the enemy dies, flees, or runs out of range!
			if (pCmdr.target) {
				let distToTarget = Math.hypot(pCmdr.target.x - pCmdr.x, pCmdr.target.y - pCmdr.y);
				let maxRange = pCmdr.stats.range || 700;
				
				if (pCmdr.target.hp <= 0 || pCmdr.target.state === "FLEEING" || distToTarget > maxRange) {
					pCmdr.target = null;
				}
			}
					}

						else {
							player.x = pCmdr.x; player.y = pCmdr.y; player.isMoving = false;
						}
					}
					
					if (keys['p']) {
						const scale = currentBattleData?.initialCounts?.player > 300 ? 5 : 1; 
						const enemyNetCount = aliveEnemies * scale;
						const enemyInitial = currentBattleData?.initialCounts?.enemy || 1;

						if (disableAICombatDefeated || (enemyNetCount / enemyInitial < 0.10) || (enemyNetCount < 5)) {
							(typeof inSiegeBattle !== 'undefined' && inSiegeBattle) ? concludeSiegeBattlefield(player) : leaveBattlefield(player);
						}
						keys['p'] = false;
					}

					if (disableAICombatDefeated || aliveEnemies === 0) {
						ctx.save();
						ctx.setTransform(1, 0, 0, 1, 0, 0); 
						ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
						ctx.fillRect(0, window.innerHeight - 80, window.innerWidth, 80);
						ctx.fillStyle = disableAICombatDefeated ? "#ff5252" : "#ffca28"; 
						ctx.font = "bold 24px Georgia"; ctx.textAlign = "center"; ctx.shadowColor = "black"; ctx.shadowBlur = 4;
						ctx.fillText(`${disableAICombatDefeated ? "DEFEAT - COMMANDER FALLEN" : "VICTORY - ENEMIES ROUTED"} - Press [P] to Exit Battlefield`, window.innerWidth / 2, window.innerHeight - 45);
						ctx.restore();
					}
    } 
	
// --- REPLACE THAT ENTIRE SECTION WITH THIS ---
  else if (typeof inCityMode !== 'undefined' && inCityMode) {
        // ==========================================
        // 🏰 CITY VISITING MODE
        // ==========================================
        player.size = 24;
        
        // Constant speed in city (No overworld penalties)
        player.speed = player.baseSpeed * 0.60; 

        // calculateMovement handles city wall/stairs collision internally
        calculateMovement(player.speed / 4, worldMap, TILE_SIZE, COLS, ROWS, false);

        // Throttle UI updates to prevent lag
        if (++uiSyncTick % 15 === 0) { 
            let locEl = document.getElementById('loc-text');
            if (locEl) {
                if (locEl.parentElement) locEl.parentElement.style.display = 'block';
                locEl.innerText = `${Math.round(player.x)}, ${Math.round(player.y)}`;
            }

            let terrainEl = document.getElementById('terrain-text');
            if (terrainEl) terrainEl.innerText = "City";

            const speedEl = document.getElementById('speed-text');
            if (speedEl) speedEl.style.display = 'none';

            let zoomEl = document.getElementById('zoom-text');
            if (zoomEl) zoomEl.innerText = zoom.toFixed(2) + "x";
        }
		
					// ============================================================================
			// CITY MUSIC STATE ENGINE
			// ============================================================================
			if (inCityMode && !inBattleMode) {
				// TRIGGER: Runs only ONCE the moment you enter a city
				if (!wasInCity) {
					if (typeof AudioManager !== 'undefined') {
						AudioManager.playCityPlaylist();
					}
					wasInCity = true;
				}
			} else {
				// TRIGGER: Runs only ONCE the moment you leave a city
				if (wasInCity) {
					console.log("🌲 Leaving City: Reverting music.");
					
					// Return to your standard game loops
					if (typeof AudioManager !== 'undefined') {
						AudioManager.currentMusicType = "world"; // Clear the city lock
						AudioManager.playRandomMP3List([
							'music/gameloop1.mp3', 'music/gameloop2.mp3', 'music/gameloop3.mp3', 
							'music/gameloop4.mp3', 'music/gameloop5.mp3', 'music/gameloop6.mp3', 
							'music/gameloop7.mp3', 'music/gameloop8.mp3', 'music/gameloop9.mp3', 
							'music/gameloop10.mp3'
						]);
					}
					wasInCity = false;
				}
			}

    } else {
        // ==========================================
        // 🌍 OVERWORLD MODE
        // ==========================================
        player.size = 24;

        // Overworld-only system updates
        if (++economyTick > 300) {
            updateCityEconomies(cities);
            economyTick = 0;
        }
        if (typeof updateDiplomacy === 'function') updateDiplomacy();
        if (typeof updateSieges === 'function') updateSieges();

        // Overworld Terrain Lookup
        const tx = Math.max(0, Math.min(COLS - 1, Math.floor(player.x / TILE_SIZE)));
        const ty = Math.max(0, Math.min(ROWS - 1, Math.floor(player.y / TILE_SIZE)));
        const currentTile = worldMap?.[tx]?.[ty] || { name: "Plains", speed: 1 };

        const oldX = player.x, oldY = player.y;

        // Overworld Speed Penalties
        let starvPenalty = player.food > 0 ? 1.0 : 0.6;
        let troopPenalty = Math.max(0.4, 1.0 - (player.troops * 0.002));
        player.speed = player.baseSpeed * starvPenalty * troopPenalty * currentTile.speed * 0.60;

        calculateMovement(player.speed / 4, worldMap, TILE_SIZE, COLS, ROWS, false);
        const step = Math.hypot(player.x - oldX, player.y - oldY);

        // Cohesion decay from moving
        if (step > 0) {
            player.cohesion = Math.max(0, (player.cohesion || 100) - (0.002 * step));
        }
    
        // OVERWORLD ATTRITION & RESOURCES LOGIC
        if (step > 0 && (player.distTrack += step) >= 1000) {
            player.distTrack = 0;
            
            let desertFactor = (typeof window.campCohesionDesertionFactor === 'function') ? window.campCohesionDesertionFactor() : 1;
            let diffMulti = (typeof window.attritionDifficultyMultiplier !== 'undefined') ? window.attritionDifficultyMultiplier : 1.0;

            // --- PRECISE WAGE CALCULATION ---
            let totalWageCost = 0;
            if (player.roster && player.roster.length > 0) {
                for (let t of player.roster) {
                    let baseCost = (typeof UnitRoster !== 'undefined' && UnitRoster.allUnits[t.type] && UnitRoster.allUnits[t.type].cost) 
                                   ? UnitRoster.allUnits[t.type].cost : 20;
                    totalWageCost += (baseCost / 10);
                }
            } else if (player.troops > 0) {
                totalWageCost = player.troops * (20 / 10);
            }

            totalWageCost *= diffMulti;
            player.pendingWages = (player.pendingWages || 0) + totalWageCost;
            let wagesToPay = Math.floor(player.pendingWages);

            let outOfGold = (player.gold <= 0);
            let outOfFood = (player.food <= 0);

            if (wagesToPay >= 1) {
                if (player.gold >= wagesToPay) {
                    player.gold -= wagesToPay;
                } else {
                    player.gold = 0;
                    outOfGold = true;
                }
                player.pendingWages -= wagesToPay;
            }

            let foodCost = (2 + Math.floor(player.troops / 3)) * diffMulti;

            // CASCADING FAILURES
            if (outOfGold) {
                foodCost *= 2.0; 
                player.cohesion = Math.max(0, (player.cohesion || 100) - (8 * diffMulti));
            }
            if (outOfFood) {
                let stolenGold = Math.floor(player.troops * 1.5 * diffMulti); 
                player.gold = Math.max(0, player.gold - stolenGold);
                player.cohesion = Math.max(0, (player.cohesion || 100) - (8 * diffMulti));
            }

            player.food = Math.max(0, player.food - foodCost);
            outOfFood = (player.food <= 0); 

            // EXPONENTIAL DESERTION LOGIC
            if (!outOfFood && !outOfGold) {
                if (desertFactor > 1.5 && Math.random() < (0.05 * desertFactor * diffMulti) && player.troops > 0) {
                    player.troops--;
                    if (player.roster && player.roster.length > 0) player.roster.pop();
                }
            } else if (player.troops > 0) {
                let cohesionPenaltyExp = Math.pow(2, (100 - Math.max(0, player.cohesion || 0)) / 25);
                let doubleCrisisMulti = (outOfFood && outOfGold) ? 3.0 : 1.0;
                let desertionCount = Math.floor(player.troops * 0.05 * cohesionPenaltyExp * doubleCrisisMulti * diffMulti);
                
                if (desertionCount < 1 && diffMulti > 0) desertionCount = 1;

                for (let i = 0; i < desertionCount; i++) {
                    if (player.troops > 0) {
                        player.troops--;
                        if (player.roster && player.roster.length > 0) player.roster.pop();
                    }
                }
            }
        }
        
        updateNPCs(cities);

        // --- OPTIMIZED OVERWORLD PROXIMITY & UI SYNC ---
        if (++uiSyncTick % 15 === 0) { 
            if (typeof globalNPCs !== 'undefined' && player) {
                let closestDistSq = 1000000;
                let closestEnemy = null;

                for (let npc of globalNPCs) {
                    if (npc.faction !== player.faction) {
                        let dx = npc.x - player.x;
                        let dy = npc.y - player.y;
                        let dSq = (dx * dx) + (dy * dy); 
                        
                        if (dSq < closestDistSq) {
                            closestDistSq = dSq;
                            closestEnemy = npc;
                        }
                    }
                }

                if (typeof AudioManager !== 'undefined') {
                    AudioManager.playRandomMP3List([
                        'music/gameloop1.mp3', 'music/gameloop2.mp3', 'music/gameloop3.mp3', 
                        'music/gameloop4.mp3', 'music/gameloop5.mp3', 'music/gameloop6.mp3', 
                        'music/gameloop7.mp3', 'music/gameloop8.mp3', 'music/gameloop9.mp3', 
                        'music/gameloop10.mp3'
                    ]);
                }
            }

            let locEl = document.getElementById('loc-text');
            if (locEl) {
                let topGuiContainer = locEl.parentElement;
                if (topGuiContainer) topGuiContainer.style.display = player.isSieging ? 'none' : 'block';
                locEl.innerText = `${Math.round(player.x)}, ${Math.round(player.y)}`;
            }

            let terrainEl = document.getElementById('terrain-text');
            if (terrainEl) terrainEl.innerText = currentTile.name;

            const speedEl = document.getElementById('speed-text');
            if (speedEl) {
                speedEl.style.display = 'block';
                speedEl.innerText = currentTile.speed + "x";
            }

            let zoomEl = document.getElementById('zoom-text');
            if (zoomEl) zoomEl.innerText = zoom.toFixed(2) + "x";

            // FAST CITY COLLISION
            let touchingCity = null;
            for (let c of cities) {
                let dx = player.x - c.x;
                let dy = player.y - c.y;
                let rLimit = c.radius + player.size;
                if ((dx * dx) + (dy * dy) < (rLimit * rLimit)) {
                    touchingCity = c;
                    break;
                }
            }

            const cityPanel = document.getElementById('city-panel');
            if (touchingCity) {
                // Story-mode guard: never open the city panel during a cinematic or
                // dialogue. Preserve activeCity so the panel won't auto-reopen when
                // the story ends — player must leave and re-enter the city.
                const _storyActive = typeof window.ScenarioTriggers !== 'undefined' &&
                    typeof window.ScenarioTriggers.isStoryPlaying === 'function' &&
                    window.ScenarioTriggers.isStoryPlaying();

                // Campaign intro guard: also block for 5 seconds after scenario boot
                // (or until the intro is explicitly marked done) so the city panel
                // can't pop up during the opening cinematic.  Sandbox mode is
                // unaffected — the guard only activates when __campaignStory1Active
                // is set.
                const _introDone   = !!window.__DoG_introDone;
                const _bootMs      = window.__DoG_scenarioBootTime;
                const _inCampaign  = !!window.__campaignStory1Active;
                const _bootBlocking = _inCampaign && !_introDone &&
                    _bootMs && (Date.now() - _bootMs) < 5000;

                if (!_storyActive && !_bootBlocking && activeCity !== touchingCity) {
                    activeCity = touchingCity;
                    document.getElementById('city-name').innerText = activeCity.name;
                    document.getElementById('city-name').style.color = activeCity.color;
                    document.getElementById('city-faction').innerText = activeCity.faction;
                    if (cityPanel) cityPanel.style.display = 'block';

                    const isEnemy = player.enemies?.includes(activeCity.faction);
                    const recruitBox = document.getElementById('recruit-box');
                    const hostileBox = document.getElementById('hostile-box');

                    if (recruitBox) {
                        recruitBox.style.opacity = isEnemy ? '0.3' : '1';
                        recruitBox.style.pointerEvents = isEnemy ? 'none' : 'auto';
                    }
                    if (hostileBox) hostileBox.style.display = isEnemy ? 'flex' : 'none';

                    if (isEnemy) {
                        player.stunTimer = 60;
                        keys['w'] = keys['a'] = keys['s'] = keys['d'] = keys['arrowup'] = keys['arrowleft'] = keys['arrowdown'] = keys['arrowright'] = false;
                    }

                    // Refresh recruit + food button state whenever we enter a new city
                    if (typeof updateRecruitButton === 'function') updateRecruitButton();
                    if (typeof updateBuyFoodButton === 'function') updateBuyFoodButton();
                }

                // Guard: activeCity may still be null during story mode if the
                // player was teleported into a city before activeCity was set.
                if (activeCity) {
                    document.getElementById('city-pop').innerText = Math.floor(activeCity.pop).toLocaleString();
                    document.getElementById('city-garrison').innerText = Math.floor(activeCity.troops).toLocaleString();
                    document.getElementById('city-gold').innerText = Math.floor(activeCity.gold).toLocaleString();
                    document.getElementById('city-food').innerText = Math.floor(activeCity.food).toLocaleString();
                }
            } else if (activeCity !== null) {
                activeCity = null;
                if (cityPanel) cityPanel.style.display = 'none';
            }
        }
    }

    if (++uiSyncTick % 30 === 0) syncSiegeUIVisibility();
}

function draw() {
    if (!player || isNaN(player.x) || isNaN(player.y)) {
        console.warn("NaN caught in draw! Healing coordinates to prevent black screen.");
        player.x = 800;
        player.y = 800;
        if (isNaN(zoom) || zoom <= 0) zoom = 0.8;
    }

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-player.x, -player.y);

	if (inBattleMode) {
			if (typeof inNavalBattle !== 'undefined' && inNavalBattle) {
				
				
    // ── SAIL OVERLAY CAMERA SYNC ─────────────────────────────────────────
    // The sail canvas mirrors the main ctx transform each frame.
    // main ctx does: translate(w/2, h/2) → scale(zoom) → translate(-player)
    // So: sailCanvas pixel = cameraX + zoom * worldX  =>  cameraX = w/2 - zoom*player.x
    navalEnvironment.cameraX     = canvas.width  / 2 - zoom * player.x;
    navalEnvironment.cameraY     = canvas.height / 2 - zoom * player.y;
    navalEnvironment.cameraScale = zoom;
    // ─────────────────────────────────────────────────────────────────────



				// --- FIX 1: THE BLACK ABYSS ---
				// 1. Paint the infinite background pure black
				ctx.fillStyle = "#000000"; 
				ctx.fillRect(-3000, -3000, 8400, 7600);
				
				// 2. Paint the actual playable naval grid with water
				ctx.fillStyle = navalEnvironment.waterColor;
				ctx.fillRect(0, 0, BATTLE_WORLD_WIDTH, BATTLE_WORLD_HEIGHT);

				drawNavalBackground(ctx);
				drawNavalShips(ctx);
				drawCosmeticWaves(ctx);
} else {
                // 1. Draw Infinite Floor (LAND)
                ctx.fillStyle = battleEnvironment.groundColor || "#767950";
                ctx.fillRect(-3000, -3000, 8400, 7600);

                // 2. Draw Background Terrain (LAND) - OPTIMIZED
                if (battleEnvironment.bgCanvas) {
                    if (typeof drawOptimizedBattleCanvas === 'function') {
                        let pad = -battleEnvironment.visualPadding;
                        drawOptimizedBattleCanvas(ctx, battleEnvironment.bgCanvas, player.x, player.y, canvas.width, canvas.height, zoom, pad, pad);
                    } else {
                        ctx.drawImage(battleEnvironment.bgCanvas, -battleEnvironment.visualPadding, -battleEnvironment.visualPadding);
                    }
                }
            }

			// 3. Draw Units
			ctx.save();
            
			// --- FIX 2 & 3: CANVAS LEAK & SHIP SWAY ---
			if (typeof inNavalBattle !== 'undefined' && inNavalBattle) {
                // Apply the wave bobbing to the troops so they stay pinned to the swaying deck
                ctx.translate(navalEnvironment.shipSwayX, navalEnvironment.shipSwayY);
                
                // DELETED the broken unit loop with unmatched ctx.save() and ctx.clip() calls. 
                // Any water clipping MUST be handled individually inside troop_system.js per unit.
			}
            
			drawBattleUnits(ctx);
			ctx.restore();

// 4. Draw Foreground Terrain (Trees/Canopy) - ONLY ON LAND - OPTIMIZED
            if (!(typeof inNavalBattle !== 'undefined' && inNavalBattle) && battleEnvironment.fgCanvas) {
                if (typeof drawOptimizedBattleCanvas === 'function') {
                    let pad = -battleEnvironment.visualPadding;
                    drawOptimizedBattleCanvas(ctx, battleEnvironment.fgCanvas, player.x, player.y, canvas.width, canvas.height, zoom, pad, pad);
                } else {
                    ctx.drawImage(battleEnvironment.fgCanvas, -battleEnvironment.visualPadding, -battleEnvironment.visualPadding);
                }
            }
        
// 5. Draw Dynamic Assets (Gates & Engines)
        if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle) {
            if (typeof renderDynamicGates === 'function') renderDynamicGates(ctx);
            if (typeof renderSiegeEngines === 'function') renderSiegeEngines(ctx);
        }


// 5. Draw Dynamic Assets (Gates, Engines, & Towers)
// Logic: Draw if (Siege OR City) AND NOT Naval
const canDrawForts = !(typeof inNavalBattle !== 'undefined' && inNavalBattle) && 
                     ((typeof inSiegeBattle !== 'undefined' && inSiegeBattle) || (typeof inCityMode !== 'undefined' && inCityMode));

if (canDrawForts) {
    // Gates and Towers appear in both Sieges and City Exploration
    if (typeof renderDynamicGates === 'function') renderDynamicGates(ctx);
    if (typeof renderDynamicTowers === 'function') renderDynamicTowers(ctx);

    // Siege Engines (Rams/Towers) usually only appear during active Siege Battles
    if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle) {
        if (typeof renderSiegeEngines === 'function') renderSiegeEngines(ctx);
    }
}

        // 6. Draw Battle UI overlays
        const aliveEnemies = battleEnvironment.units.filter(u => u.side !== 'player' && u.hp > 0).length;

 




} else if (inCityMode) {

        // 1. Draw city background FIRST
        let cityData = cityDimensions[currentActiveCityFaction];
        if (cityData && cityData.bgCanvas) {
            ctx.drawImage(cityData.bgCanvas, 0, 0);
        }

        // 2. Draw forts/towers ON TOP of background (correct order)
        if (typeof renderDynamicGates === 'function') renderDynamicGates(ctx);
        if (typeof renderDynamicTowers === 'function') renderDynamicTowers(ctx);

        if (typeof drawCityCosmeticNPCs === 'function') {
            drawCityCosmeticNPCs(ctx, currentActiveCityFaction, drawCaravan, zoom);
        }

        let pColor = "#d32f2f";
        if (typeof FACTIONS !== 'undefined' && player.faction && FACTIONS[player.faction]) {
            pColor = FACTIONS[player.faction].color;
        }

        if (typeof drawHuman === 'function') {
            drawHuman(ctx, player.x, player.y, player.isMoving, player.anim, pColor);
        }
		
		if (typeof cityDialogueRender === 'function') {
    cityDialogueRender(ctx);
}

        ctx.save();
        ctx.font = "bold 16px Georgia";
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(canvas.width / 2 - 150, 20, 300, 30);
        ctx.fillStyle = "#f5d76e";
        ctx.textAlign = "center";
        ctx.fillText("Press P or walk South to exit", canvas.width / 2, 40);
        ctx.restore();

} else {
        // WORLD MAP MODE
        ctx.imageSmoothingEnabled = true;
        
        // --- SURGERY: Replaced expensive full-canvas draw with FOV Optimizer ---
        if (typeof drawOptimizedBackground === 'function') {
            drawOptimizedBackground(ctx, bgCanvas, player.x, player.y, canvas.width, canvas.height, zoom);
        } else {
            // Fallback just in case the script fails to load
            ctx.drawImage(bgCanvas, 0, 0); 
        }
        // -----------------------------------------------------------------------

        if (typeof drawSiegeVisuals === 'function') drawSiegeVisuals(ctx);
        let halfWidth = (canvas.width / 2) / zoom;
        let halfHeight = (canvas.height / 2) / zoom;
        let camLeft = player.x - halfWidth - 150;
        let camRight = player.x + halfWidth + 150;
        let camTop = player.y - halfHeight - 150;
        let camBottom = player.y + halfHeight + 150;

        cities.forEach(c => {
            if (c.x < camLeft || c.x > camRight || c.y < camTop || c.y > camBottom) return;

            ctx.lineWidth = 3;
            ctx.fillStyle = c.color;
            ctx.strokeStyle = "#ffca28";

            const r = 14;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = Math.PI / 3 * i;
                const px = c.x + r * Math.cos(angle);
                const py = c.y + r * Math.sin(angle);
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
            ctx.fill();

            let fontSize = Math.max(12, 20 / zoom);
            ctx.font = `bold ${fontSize}px Georgia`;
            ctx.textAlign = "center";
            ctx.fillStyle = "#111";
            ctx.fillText(c.name, c.x + 2, c.y - 18);
            ctx.fillStyle = c.color;
            ctx.fillText(c.name, c.x, c.y - 20);
        });

        drawAllNPCs(ctx, drawCaravan, drawShip, zoom, camLeft, camRight, camTop, camBottom);

        let tx = Math.floor(player.x / TILE_SIZE);
        let ty = Math.floor(player.y / TILE_SIZE);

        let currentTile = (worldMap[tx] && worldMap[tx][ty]) ? worldMap[tx][ty] : { name: "Plains" };
        if (currentTile.name === "Coastal" || currentTile.name === "River" || currentTile.name === "Ocean") {
            drawShip(player.x, player.y, player.isMoving, player.anim, player.color);
        } else {
            drawCaravan(player.x, player.y, player.isMoving, player.anim, player.color);
        }

        let nameFontSize = Math.max(10, 14 / zoom);
        let detailFontSize = Math.max(8, 12 / zoom);
        ctx.textAlign = "center";

        ctx.font = `italic ${detailFontSize}px Georgia`;
        let goldText = `G: ${Math.floor(player.gold)}`;
        let foodText = `F: ${Math.floor(player.food)}`;
        let statGap = 8;

        ctx.fillStyle = "#ffca28";
        ctx.fillText(goldText, player.x - (ctx.measureText(foodText).width / 2) - (statGap / 2), player.y - 38);

        if (typeof isSieging === 'undefined' || !isSieging) {
            ctx.fillStyle = "#8bc34a";
            ctx.fillText(foodText, player.x + (ctx.measureText(goldText).width / 2) + (statGap / 2), player.y - 38);
        }

        ctx.font = `bold ${nameFontSize}px Georgia`;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`YOU (${player.troops})`, player.x, player.y - 26);
        ctx.font = "10px Arial";
    }
 

    if (uiSyncTick % 30 === 0) syncSiegeUIVisibility();
	
    ctx.restore();

    requestAnimationFrame(() => {
        update();
        draw();
    });

    updateAndDrawPlayerSystems(ctx, player, zoom, WORLD_WIDTH, WORLD_HEIGHT, typeof globalNPCs !== 'undefined' ? globalNPCs : []);
	updateCitySystems();

    // World-map overlays (story quest waypoints etc.) must ONLY render on the
    // overworld.  City mode and battle mode both reuse the canvas with their own
    // coordinate spaces — drawing world-map markers there would show waypoints
    // at wrong positions inside cities or on the battlefield.
    //
    // FIX Bug#2: added typeof guard for inBattleMode (was bare !inBattleMode,
    //            which evaluates to true when inBattleMode is undefined).
    // FIX Bug#5: moved this call to AFTER updateCitySystems() so that any
    //            city/battle mode transition committed this frame is already
    //            reflected in the flags before we test them.
    if (typeof drawPlayerOverlay === 'function' &&
        !(typeof inBattleMode !== 'undefined' && inBattleMode) &&
        !(typeof inCityMode   !== 'undefined' && inCityMode)) {
        drawPlayerOverlay(ctx, player, zoom);
    }
	
drawMasterStateOverlay(ctx, canvas.width, canvas.height);
drawVictoryStateOverlay(ctx, canvas.width, canvas.height);
}



// A dedicated function that ONLY runs at the very end of the frame
function drawMasterStateOverlay(ctx, canvasWidth, canvasHeight) {
    if (typeof inBattleMode === 'undefined' || !inBattleMode) return;
    if (typeof battleEnvironment === 'undefined' || !battleEnvironment.units) return;

    let pCmdr = battleEnvironment.units.find(u => u.isCommander && u.side === "player");
    if (!pCmdr) return;

    if (pCmdr.hp <= 0) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // --- CENTER DEATH TEXT ---
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        let mainFontSize = Math.min(64, canvasWidth * 0.1); 
        ctx.fillStyle = "#ff3333"; 
        ctx.font = `bold ${mainFontSize}px Georgia, serif`;
        ctx.shadowBlur = 10;
        ctx.fillText("YOU HAVE FALLEN", canvasWidth / 2, canvasHeight / 2 - 20);

        let subFontSize = Math.min(24, canvasWidth * 0.04);
        ctx.fillStyle = "#ffca28";
        ctx.font = `italic ${subFontSize}px Georgia, serif`;
        ctx.shadowBlur = 5;
        ctx.fillText("Press [P] or ↩️ to end Battle.", canvasWidth / 2, canvasHeight / 2 + 40);

        ctx.restore();
    }
}

function drawVictoryStateOverlay(ctx, canvasWidth, canvasHeight) {
    // 1. Guards: Ensure we are in battle and the environment exists
    if (typeof inBattleMode === 'undefined' || !inBattleMode) return;
    if (typeof battleEnvironment === 'undefined' || !battleEnvironment.units) return;

    // 2. Count alive enemies (excluding the player's side)
    const aliveEnemies = battleEnvironment.units.filter(u => u.side !== 'player' && u.hp > 0).length;

    // 3. Trigger overlay only when no enemies remain
    if (aliveEnemies < 1) {
        ctx.save();
        
        // Full-screen semi-transparent wash
        ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // --- CENTER VICTORY TEXT ---
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        // Main Title: Gold/Amber for Victory
        let mainFontSize = Math.min(64, canvasWidth * 0.1); 
        ctx.fillStyle = "#ffca28"; 
        ctx.font = `bold ${mainFontSize}px Georgia, serif`;
        ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
        ctx.shadowBlur = 10;
        ctx.fillText("VICTORY", canvasWidth / 2, canvasHeight / 2 - 20);

        // Subtext: Exit instructions following your [P] key logic
        let subFontSize = Math.min(24, canvasWidth * 0.04);
        ctx.fillStyle = "#ffffff";
        ctx.font = `italic ${subFontSize}px Georgia, serif`;
        ctx.shadowBlur = 5;
        ctx.fillText("Press [P] or ↩️ to return to the Overworld.", canvasWidth / 2, canvasHeight / 2 + 40);

        ctx.restore();
    }
}


//initGame();
showMainMenu();
 
 function updateCitySystems() {
    if (!inCityMode || inBattleMode || !currentActiveCityFaction) return;

    // 1. Process Dialogue Timers
    if (typeof cityDialogueUpdate === 'function') {
        cityDialogueUpdate();
    }

    // 2. Check for Proximity Triggers (Frame-by-Frame)
    if (typeof cityDialogueSystem !== 'undefined') {
        cityDialogueSystem.tryAutoCityContact(player, currentActiveCityFaction, { radius: 25 }); // Slightly increased radius for better feel
    }
}

function refreshCityUI() {
    // 1. Update the Player's Global UI (Top left/Overlay)
    const globalGold = document.getElementById('gold-text');
    const globalFood = document.getElementById('food-text');
    
    if (globalGold) globalGold.innerText = Math.floor(player.gold);
    if (globalFood) globalFood.innerText = Math.floor(player.food);

    // 2. Update the City Panel specifically (if it's open)
    const cityGoldDisp = document.getElementById('city-gold-display');
    const cityFoodDisp = document.getElementById('city-food-display');

    if (cityGoldDisp) cityGoldDisp.innerText = `Gold: ${Math.floor(player.gold)}`;
    if (cityFoodDisp) cityFoodDisp.innerText = `Food: ${Math.floor(player.food)}`;
}

// Define the missing function to stop the background crashing
function enforceNPCBounds(npc, maxWidth, maxHeight) {
    if (npc.x < 0) npc.x = 0;
    if (npc.x > maxWidth) npc.x = maxWidth;
    if (npc.y < 0) npc.y = 0;
    if (npc.y > maxHeight) npc.y = maxHeight;
}

function toggleDiplomacyMenu() {
    const panel = document.getElementById('diplomacy-panel');
    
    // Check if currently open
    const isOpen = panel.style.display === 'block';
    
    if (!isOpen) {
        panel.style.display = 'block';
        inParleMode = true; // FREEZES THE GAME
        renderDiplomacyMatrix(); // Fills the table with data
    } else {
        panel.style.display = 'none';
        inParleMode = false; // UNFREEZES THE GAME
    }
}

function syncSiegeUIVisibility() {
    const siegeGui = document.getElementById('siege-gui');
    if (!siegeGui) return;

    // If player is technically sieging but the GUI is hidden, bring it back
    if (player.isSieging && siegeGui.style.display === 'none' && !inBattleMode) {
        // Find the active siege record for the player
        const currentSiege = activeSieges.find(s => s.attacker === player || s.attacker.disableAICombat);
		if (currentSiege) {
                    console.log("Restoring Siege GUI after interruption...");
                    // SURGERY: Just show the GUI directly, the function didn't exist
                    siegeGui.style.display = 'block'; 
                } else {
            // Safety: if no siege object found, reset player state
            player.isSieging = false;
        }
    }
}

// Add this inside your script tag to handle the UI toggle
function updateCityPanelUI(city) {
	if (typeof refreshTradeButton === 'function') refreshTradeButton(city);
    const recruitBox = document.getElementById('recruit-box');
    const hostileBox = document.getElementById('hostile-box');
    
    // Check if the city belongs to a faction you are at war with
    // This assumes your faction_dynamics.js is loaded
    const isHostile = player.enemies.includes(city.faction);

    if (isHostile) {
        recruitBox.style.display = 'none';
        hostileBox.style.display = 'flex';
    } else {
        recruitBox.style.display = 'flex';
        hostileBox.style.display = 'none';
    }

    // Always refresh the recruit + food button states when diplomacy changes
    if (typeof updateRecruitButton === 'function') updateRecruitButton();
    if (typeof updateBuyFoodButton === 'function') updateBuyFoodButton();
}
// --- SURGERY: MISSING RIVER PHYSICS ENGINE REBUILT ---
window.updateRiverPhysics = function() {
    if (!window.inRiverBattle || !battleEnvironment.units) return;

    battleEnvironment.units.forEach(unit => {
        if (unit.hp <= 0) return;
        
        let surface = 'LAND'; 

        // Only use the complex naval 'ship deck' detector if it's a true Ocean/Coastal battle
        if (window.inNavalBattle && (navalEnvironment.mapType === "Ocean" || navalEnvironment.mapType === "Coastal")) {
            if (typeof window.getNavalSurfaceAt === 'function') {
                surface = window.getNavalSurfaceAt(unit.x, unit.y);
            }
        } 
        // Otherwise, check the actual terrain grid tiles (River battles live here)
        else if (battleEnvironment && battleEnvironment.grid) {
            const tx = Math.floor(unit.x / (typeof BATTLE_TILE_SIZE !== 'undefined' ? BATTLE_TILE_SIZE : 8));
            const ty = Math.floor(unit.y / (typeof BATTLE_TILE_SIZE !== 'undefined' ? BATTLE_TILE_SIZE : 8));
            
            // ---> THE FIX: Check for BOTH River (4) and Ocean (11) <---
            if (battleEnvironment.grid[tx] && (battleEnvironment.grid[tx][ty] === 11 || battleEnvironment.grid[tx][ty] === 4)) {
                surface = 'WATER';
            }
        }

        if (surface === 'WATER') {
            unit.overboardTimer = (unit.overboardTimer || 0) + 1;
            unit.isSwimming = true;
            
            // Apply water friction
            unit.vx *= 0.15;
            unit.vy *= 0.15;

// Drown threshold calculation
if (!unit.drownTimer) unit.drownTimer = 0;

// Base naval is ~150 to 1500. We multiply the base limits by 10 for Rivers!
let drownThreshold = Math.max(1500, 15000 - ((unit.stats.weightTier||1)*2500) - (unit.stats.mass||100));
            unit.drownTimer++;
            
            if (unit.drownTimer > drownThreshold) {
                unit.hp = 0; 
                unit.deathRotation = 0; 
                unit._drownedSilently = true; 
            }
        } else {
            // Unit is on Land
            unit.overboardTimer = 0;
            unit.isSwimming = false;
            if (unit.drownTimer > 0) unit.drownTimer -= 1;
        }
    });
};

// Optimized: Run bounds check every 100ms instead of every frame (Lag Fix)
setInterval(() => {if (typeof globalNPCs !== 'undefined') {globalNPCs.forEach(npc => enforceNPCBounds(npc, WORLD_WIDTH, WORLD_HEIGHT));}}, 100);

// ============================================================================
// CAMP HOOKS: EXP & MORALE BOOST (FIXED)
// ============================================================================
setInterval(() => {
    // Only patch if the function exists and hasn't been patched yet
    if (typeof window.packUpCamp === 'function' && !window._packUpPatched) {
        const originalPackUp = window.packUpCamp;
        
        window.packUpCamp = function() {
            // ONLY apply buffs if we are currently IN the camp mode
            // This prevents the "Camp Broken" log when initializing the camp state
            if (window.inCampMode) { 
                if (player.roster && player.roster.length > 0) {
                    player.roster.forEach(troop => {
                        troop.exp = (troop.exp || 1) + 2;
                        let maxM = troop.maxMorale || 20;
                        troop.morale = Math.min(maxM, (troop.morale || maxM * 0.5) + 5);
                    });
                    
                    console.log("Camp broken: Troops are well-rested. (+EXP, +Morale)");
                    if (typeof logGameEvent === 'function') {
                        logGameEvent("The army breaks camp. Troops are well-rested.", "positive");
                    }
                }
            }
            
            // Execute the actual visual/state pack up
            originalPackUp(); 
        };
        window._packUpPatched = true;
    }
}, 1000);


// ============================================================================
// CARGO OVERLOAD ENFORCER (Mobile-Optimized)
// Runs every 3 seconds. Exponentially decays items if capacity is exceeded.
// ============================================================================
setInterval(() => {
    // --- 1. GLOBAL NPCS ---
    if (typeof globalNPCs !== 'undefined') {
        // Standard for-loop is vastly faster on old mobile CPUs than .forEach()
        for (let j = 0; j < globalNPCs.length; j++) {
            let npc = globalNPCs[j];
            if (!npc.cargo) continue;

            let currentLoad = 0;
            let keys = Object.keys(npc.cargo);
            for (let i = 0; i < keys.length; i++) {
                currentLoad += npc.cargo[keys[i]];
            }

            // Calculate Max Capacity (Commerce units = 20, everyone else = 2)
            let baseCap = (npc.role === "Commerce") ? 20 : 2;
            let maxCap = Math.max(10, (npc.count || 1) * baseCap);

            if (currentLoad > maxCap) {
                let severity = currentLoad / maxCap;
                // Exponential drop: the higher the severity, the steeper the drop.
                // Floor limit is the exact ratio to instantly drop to max capacity if insanely overloaded.
                let keepRatio = Math.max(maxCap / currentLoad, 1.0 - (0.05 * (severity * severity)));

                for (let i = 0; i < keys.length; i++) {
                    let rid = keys[i];
                    let newQty = Math.floor(npc.cargo[rid] * keepRatio);
                    if (newQty <= 0) {
                        delete npc.cargo[rid];
                    } else {
                        npc.cargo[rid] = newQty;
                    }
                }
            }
        }
    }

    // --- 2. PLAYER ---
    if (typeof player !== 'undefined' && player.inventory) {
        let currentLoad = 0;
        let keys = Object.keys(player.inventory);
        for (let i = 0; i < keys.length; i++) {
            currentLoad += player.inventory[keys[i]];
        }

        // Sync player capacity dynamically based on troop count
        player.cargoCapacity = Math.max(10, (player.troops || 1) * 2);
        let maxCap = player.cargoCapacity;

        if (currentLoad > maxCap) {
            let severity = currentLoad / maxCap;
            let keepRatio = Math.max(maxCap / currentLoad, 1.0 - (0.05 * (severity * severity)));

            for (let i = 0; i < keys.length; i++) {
                let rid = keys[i];
                let newQty = Math.floor(player.inventory[rid] * keepRatio);
                if (newQty <= 0) {
                    delete player.inventory[rid];
                } else {
                    player.inventory[rid] = newQty;
                }
            }
            
            // Recalculate cargoUsed so the Trade UI immediately reflects the dropped goods
            player.cargoUsed = Object.values(player.inventory).reduce((sum, val) => sum + val, 0);
            
            // Optional: You could trigger a Toast message here if you want to warn the player 
            // that they are shedding goods on the trail.
        } else {
            // Keep it accurate even when not overloaded
            player.cargoUsed = currentLoad;
        }
    }
}, 5000); // 3000ms (3 seconds) ensures zero frame drops on mobile
// ============================================================================
// RECRUITMENT & FOOD RATE-LIMITING SYSTEM
// ============================================================================
// Design rules:
//   NEUTRAL  — 5 militia per 1000 pop per 5-min window, ALSO capped at 1% garrison
//   ALLY     — double the quota (×2 on both checks)
//   ENEMY    — cannot recruit at all (recruit-box already hidden by updateCityPanelUI)
//   FOOD     — city can sell max 10% of its food stock per 5-min window
//
// Each city gets a transient recruitWindow object:
//   { time: timestamp, recruited: n, foodSold: n }
// The window resets automatically after RECRUIT_WINDOW_MS ms.
// ============================================================================

const RECRUIT_WINDOW_MS   = 5 * 60 * 1000; // 5 real-time minutes
const MILITIA_COST_EACH   = 10;             // Gold per militia
const FOOD_BUY_AMOUNT     = 10;             // Food units per purchase
const FOOD_BUY_COST       = 10;             // Gold per purchase

// ---------------------------------------------------------------------------
// HELPER: returns "enemy" | "ally" | "neutral" for the active city
// ---------------------------------------------------------------------------
function getRecruitRelation(city) {
    if (!city) return "none";
    const pFaction = (typeof player !== 'undefined' && player.faction) ? player.faction : "Player's Kingdom";

    // Enemy check: player.enemies array is the ground truth
    if (player.enemies && player.enemies.includes(city.faction)) return "enemy";

    // Ally check: use FACTION_RELATIONS if available
    if (typeof FACTION_RELATIONS !== 'undefined') {
        const rel = FACTION_RELATIONS[pFaction] && FACTION_RELATIONS[pFaction][city.faction];
        if (rel === "Ally") return "ally";
    }

    return "neutral";
}

// ---------------------------------------------------------------------------
// HELPER: ensure a city has a fresh recruit window object
// ---------------------------------------------------------------------------
function _ensureRecruitWindow(city) {
    const now = Date.now();
    if (!city.recruitWindow || (now - city.recruitWindow.time > RECRUIT_WINDOW_MS)) {
        city.recruitWindow = { time: now, recruited: 0, foodSold: 0 };
    }
}

// ---------------------------------------------------------------------------
// CORE QUOTA CALCULATOR
// Returns { canRecruit, amount, reason, cost, relation, quota, alreadyUsed }
// ---------------------------------------------------------------------------
function calcRecruitQuota(city) {
    if (!city) return { canRecruit: false, amount: 0, reason: "No city selected.", cost: 0 };

    const relation = getRecruitRelation(city);
    if (relation === "enemy") {
        return { canRecruit: false, amount: 0, reason: "At war — cannot recruit here!", cost: 0 };
    }

    _ensureRecruitWindow(city);

    const pop      = Math.max(1, city.pop     || 500);
    const garrison = Math.max(0, city.troops  || 0);

    if (garrison <= 0) {
        return { canRecruit: false, amount: 0, reason: "No garrison soldiers to recruit from!", cost: 0 };
    }

    // Base quota: 5 militia per 1 000 pop per window
    let popQuota      = Math.max(1, Math.floor((pop / 1000) * 5));
    // Garrison cap: max 1% of garrison per window
    let garrisonCap   = Math.max(1, Math.floor(garrison * 0.01));

    // Ally bonus: double both limits
    if (relation === "ally") {
        popQuota    *= 2;
        garrisonCap *= 2;
    }

    // Final window quota is the LOWER of the two (most restrictive wins)
    const windowQuota  = Math.min(popQuota, garrisonCap);
    const alreadyUsed  = city.recruitWindow.recruited;
    const remaining    = Math.max(0, windowQuota - alreadyUsed);

    if (remaining <= 0) {
        const msLeft   = RECRUIT_WINDOW_MS - (Date.now() - city.recruitWindow.time);
        const minLeft  = Math.max(1, Math.ceil(msLeft / 60000));
        return {
            canRecruit:   false,
            amount:       0,
            reason:       `Try again in ~${minLeft} min. (${alreadyUsed}/${windowQuota} recruited)`,
            cost:         0,
            relation,
            quota:        windowQuota,
            alreadyUsed
        };
    }

    // Button recruits 1–10 militia depending on garrison size, capped by remaining quota
    const btnAmount = Math.max(1, Math.min(10, Math.floor(garrison / 100), remaining));
    const totalCost = btnAmount * MILITIA_COST_EACH;

    return {
        canRecruit:  true,
        amount:      btnAmount,
        reason:      "",
        cost:        totalCost,
        relation,
        quota:       windowQuota,
        alreadyUsed
    };
}

// ---------------------------------------------------------------------------
// UI: Update the recruit militia button text + disabled state
// ---------------------------------------------------------------------------
function updateRecruitButton() {
    const btn = document.getElementById('recruit-militia-btn');
    if (!btn) return;
    const city = (typeof activeCity !== 'undefined') ? activeCity : null;
    if (!city) {
        btn.disabled  = true;
        btn.innerHTML = "Recruit Militia";
        return;
    }

    const info       = calcRecruitQuota(city);
    const allyLabel  = info.relation === "ally" ? " <span style='color:#8bc34a;font-size:0.8em;'>(ALLY ×2)</span>" : "";

    if (!info.canRecruit) {
        btn.disabled          = true;
        btn.style.opacity     = "0.55";
        btn.style.cursor      = "not-allowed";
        btn.innerHTML         = `🚫 Recruit Militia<br><small style="font-size:0.72em;color:#ff9999;font-weight:normal;">${info.reason}</small>`;
    } else {
        const canAfford       = player.gold >= info.cost;
        btn.disabled          = !canAfford;
        btn.style.opacity     = canAfford ? "1" : "0.55";
        btn.style.cursor      = canAfford ? "pointer" : "not-allowed";

        const quotaNote       = `(${info.alreadyUsed + info.amount}/${info.quota} used)`;
        if (canAfford) {
            btn.innerHTML = `Recruit ${info.amount} Militia (${info.cost}g)${allyLabel}<br><small style="font-size:0.72em;color:#aaa;font-weight:normal;">${quotaNote} — reduces garrison</small>`;
        } else {
            btn.innerHTML = `<span style='color:#ff9999;'>Need ${info.cost}g</span> → ${info.amount} Militia${allyLabel}<br><small style="font-size:0.72em;color:#aaa;font-weight:normal;">${quotaNote}</small>`;
        }
    }
}

// ---------------------------------------------------------------------------
// ACTION: Player recruits militia from current city
// ---------------------------------------------------------------------------
function recruitMilitiaFromCity() {
    const city = (typeof activeCity !== 'undefined') ? activeCity : null;
    if (!city) return;

    const info = calcRecruitQuota(city);

    if (!info.canRecruit) {
        showGameToast(info.reason, true);
        if (typeof AudioManager !== 'undefined') AudioManager.playSound('error');
        return;
    }

    if (player.gold < info.cost) {
        showGameToast(`Need ${info.cost} Gold to recruit! (Have ${Math.floor(player.gold)}g)`, true);
        if (typeof AudioManager !== 'undefined') AudioManager.playSound('error');
        return;
    }

    // ── Transaction ──────────────────────────────────────────────────────────
    if (typeof AudioManager !== 'undefined') AudioManager.playSound('gold_buy');

    player.gold   -= info.cost;
    player.troops += info.amount;
    if (!player.roster) player.roster = [];
    for (let i = 0; i < info.amount; i++) {
        player.roster.push({ type: 'Militia', name: 'Militia', experienceLevel: 1 });
    }

    // Garrison loses the conscripted soldiers
    city.troops   = Math.max(0, (city.troops || 0) - info.amount);
    city.pop      = Math.max(0, (city.pop    || 0) - info.amount);
    // City treasury receives the payment
    city.gold     = (city.gold || 0) + info.cost;

    // Track in window
    _ensureRecruitWindow(city);
    city.recruitWindow.recruited += info.amount;

    // ── UI Refresh ───────────────────────────────────────────────────────────
    const popEl      = document.getElementById('city-pop');
    const garEl      = document.getElementById('city-garrison');
    const goldEl     = document.getElementById('city-gold');
    if (popEl)  popEl.innerText  = Math.floor(city.pop).toLocaleString();
    if (garEl)  garEl.innerText  = Math.floor(city.troops).toLocaleString();
    if (goldEl) goldEl.innerText = Math.floor(city.gold).toLocaleString();

    updateRecruitButton();
    showGameToast(`Recruited ${info.amount} Militia for ${info.cost}g.`, false);
}

// ---------------------------------------------------------------------------
// UI: Update the food buy button text + disabled state
// ---------------------------------------------------------------------------
function updateBuyFoodButton() {
    const btn = document.getElementById('buy-food-btn');
    if (!btn) return;
    const city = (typeof activeCity !== 'undefined') ? activeCity : null;
    if (!city) { btn.disabled = true; btn.innerHTML = "Buy Food (10 Gold)"; return; }

    const relation = getRecruitRelation(city);
    if (relation === "enemy") {
        btn.disabled      = true;
        btn.style.opacity = "0.55";
        btn.innerHTML     = `🚫 Buy Food<br><small style="font-size:0.72em;color:#ff9999;font-weight:normal;">At war — no trade!</small>`;
        return;
    }

    _ensureRecruitWindow(city);
    const maxFoodWindow   = Math.max(FOOD_BUY_AMOUNT, Math.floor((city.food || 0) * 0.10));
    const remainingQuota  = Math.max(0, maxFoodWindow - (city.recruitWindow.foodSold || 0));
    const cityHasFood     = (city.food || 0) >= FOOD_BUY_AMOUNT;
    const canAfford       = player.gold >= FOOD_BUY_COST;

    if (!cityHasFood) {
        btn.disabled      = true;
        btn.style.opacity = "0.55";
        btn.innerHTML     = `🚫 Buy Food<br><small style="font-size:0.72em;color:#ff9999;font-weight:normal;">City has no food to sell!</small>`;
    } else if (remainingQuota < FOOD_BUY_AMOUNT) {
        const msLeft  = RECRUIT_WINDOW_MS - (Date.now() - city.recruitWindow.time);
        const minLeft = Math.max(1, Math.ceil(msLeft / 60000));
        btn.disabled      = true;
        btn.style.opacity = "0.55";
        btn.innerHTML     = `🚫 Buy Food<br><small style="font-size:0.72em;color:#ff9999;font-weight:normal;">Supply limited — ~${minLeft} min wait</small>`;
    } else if (!canAfford) {
        btn.disabled      = true;
        btn.style.opacity = "0.55";
        btn.innerHTML     = `<span style='color:#ff9999;'>Need ${FOOD_BUY_COST}g</span> — Buy Food (10 Gold)`;
    } else {
        btn.disabled      = false;
        btn.style.opacity = "1";
        btn.style.cursor  = "pointer";
        btn.innerHTML     = `Buy Food (${FOOD_BUY_COST} Gold)`;
    }
}

// ---------------------------------------------------------------------------
// ACTION: Player buys food from current city (rate-limited)
// ---------------------------------------------------------------------------
function buyFoodFromCity() {
    const city = (typeof activeCity !== 'undefined') ? activeCity : null;
    if (!city) return;

    const relation = getRecruitRelation(city);
    if (relation === "enemy") {
        showGameToast("Cannot buy supplies from an enemy!", true);
        if (typeof AudioManager !== 'undefined') AudioManager.playSound('error');
        return;
    }

    _ensureRecruitWindow(city);

    const maxFoodWindow  = Math.max(FOOD_BUY_AMOUNT, Math.floor((city.food || 0) * 0.10));
    const remainingQuota = Math.max(0, maxFoodWindow - (city.recruitWindow.foodSold || 0));

    if (remainingQuota < FOOD_BUY_AMOUNT) {
        const msLeft  = RECRUIT_WINDOW_MS - (Date.now() - city.recruitWindow.time);
        const minLeft = Math.max(1, Math.ceil(msLeft / 60000));
        showGameToast(`City rationing supplies — wait ~${minLeft} min before buying more food.`, true);
        if (typeof AudioManager !== 'undefined') AudioManager.playSound('error');
        return;
    }

    if ((city.food || 0) < FOOD_BUY_AMOUNT) {
        showGameToast("The city has no food left to sell!", true);
        if (typeof AudioManager !== 'undefined') AudioManager.playSound('error');
        return;
    }

    if (player.gold < FOOD_BUY_COST) {
        showGameToast(`Need ${FOOD_BUY_COST} Gold for rations! (Have ${Math.floor(player.gold)}g)`, true);
        if (typeof AudioManager !== 'undefined') AudioManager.playSound('error');
        return;
    }

    // ── Transaction ──────────────────────────────────────────────────────────
    if (typeof AudioManager !== 'undefined') AudioManager.playSound('gold_buy');

    player.food  += FOOD_BUY_AMOUNT;
    player.gold  -= FOOD_BUY_COST;
    city.food    -= FOOD_BUY_AMOUNT;
    city.gold     = (city.gold || 0) + FOOD_BUY_COST;
    city.recruitWindow.foodSold = (city.recruitWindow.foodSold || 0) + FOOD_BUY_AMOUNT;

    // ── UI Refresh ───────────────────────────────────────────────────────────
    refreshCityUI();
    const goldEl = document.getElementById('city-gold');
    const foodEl = document.getElementById('city-food');
    if (goldEl) goldEl.innerText = Math.floor(city.gold).toLocaleString();
    if (foodEl) foodEl.innerText = Math.floor(city.food).toLocaleString();

    updateBuyFoodButton();
    showGameToast(`Bought ${FOOD_BUY_AMOUNT} food for ${FOOD_BUY_COST}g.`, false);
}

// ---------------------------------------------------------------------------
// UTILITY: Mobile-friendly toast notification (replaces alert())
// ---------------------------------------------------------------------------
function showGameToast(msg, isError) {
    let el = document.getElementById('game-toast-msg');
    if (!el) {
        el = document.createElement('div');
        el.id = 'game-toast-msg';
        el.style.cssText = [
            'position:fixed',
            'bottom:130px',
            'left:50%',
            'transform:translateX(-50%)',
            'max-width:min(340px,88vw)',
            'padding:9px 16px',
            'border-radius:20px',
            'font-family:Georgia,serif',
            'font-size:clamp(12px,3.5vw,14px)',
            'z-index:10200',
            'pointer-events:none',
            'text-align:center',
            'transition:opacity 0.4s',
            'line-height:1.35'
        ].join(';');
        document.body.appendChild(el);
    }
    el.textContent      = msg;
    el.style.background = isError ? 'rgba(120,0,0,0.93)' : 'rgba(20,60,20,0.93)';
    el.style.color      = '#fff';
    el.style.border     = isError ? '1px solid #ff5252' : '1px solid #8bc34a';
    el.style.opacity    = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, isError ? 3000 : 2000);
}

// Expose to global scope (called from index.html inline onclick fallbacks)
window.recruitMilitiaFromCity = recruitMilitiaFromCity;
window.buyFoodFromCity        = buyFoodFromCity;
window.updateRecruitButton    = updateRecruitButton;
window.updateBuyFoodButton    = updateBuyFoodButton;
window.showGameToast          = showGameToast;