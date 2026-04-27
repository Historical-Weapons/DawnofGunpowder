
function getSiegePlazaY() {
    if (!(typeof inSiegeBattle !== 'undefined' && inSiegeBattle)) return null;

    const southGate = (typeof overheadCityGates !== 'undefined')
        ? overheadCityGates.find(g => g.side === "south")
        : null;

    // Plaza center fallback if gate data is missing
    return southGate
        ? (southGate.y * BATTLE_TILE_SIZE) - 450
        : (BATTLE_WORLD_HEIGHT / 2);
}

function isPlazaUnit(baseTemplate, comp) {
    const role = (baseTemplate?.role || "").toLowerCase();
    const type = (comp?.type || "").toLowerCase();

    return (
        baseTemplate?.isLarge === true ||
        role.includes("cavalry") ||
		        role.includes("keshig") ||
						        role.includes("lancer") ||
        role.includes("horse") ||
        type.includes("camel") ||
        type.includes("elephant")
    );
}

function getSiegePlazaOverride({ side, baseTemplate, comp, row, col, spawnXCenter, currentLineXOffset, spacingX }) {
    if (!(typeof inSiegeBattle !== 'undefined' && inSiegeBattle)) return null;

    // --- DEFENDER LOGIC (Keep whatever existing logic you have here) ---
    if (side === "enemy") {
        if (isPlazaUnit(baseTemplate, comp)) {
            let plazaY = getSiegePlazaY()-100;
            let safeX = Math.max(100, Math.min(BATTLE_WORLD_WIDTH - 100, spawnXCenter + currentLineXOffset));
            return { x: safeX, y: plazaY + (row * spacingX) };
        }
    }

    // --- NEW: ATTACKER CAVALRY REAR-GUARD SURGERY ---
    // Force player cavalry to clump at the absolute bottom edge of the map, behind the commander.
    if (side === "player" && isPlazaUnit(baseTemplate, comp)) {
        const bottomEdge = (typeof BATTLE_WORLD_HEIGHT !== 'undefined' ? BATTLE_WORLD_HEIGHT : 1600);
        
        const isCommander = baseTemplate?.isCommander === true;

        // Commander stands 120 pixels from the back edge.
        // Rest of the cavalry is clamped tightly at 40 pixels from the back edge (BEHIND the commander).
        const targetY = bottomEdge - (isCommander ? 120 : 40);

        // Discard the wide 'currentLineXOffset' and clump them tightly behind the center
        // Using modulo math to arrange them into a dense block rather than a long line
        const clumpSpacing = 15; 
        const targetX = spawnXCenter + ((col % 15) - 7) * clumpSpacing;

        return {
            x: targetX,
            y: targetY + (Math.random() * 10) // Tiny organic scatter to prevent exact overlapping
        };
    }

    return null; // Return null so infantry follow normal line-spawning rules
}


// ============================================================================
// FACTION COMPOSITIONS
// ============================================================================

const FACTION_COMPOSITIONS = {
    siege: {
        "Great Khaganate": [
            {type: "Archer", pct: 0.50},
            {type: "Heavy Crossbowman", pct: 0.20},
            {type: "Heavy Two Handed", pct: 0.10},
            {type: "Spearman", pct: 0.15},
            {type: "Shielded Infantry", pct: 0.05}
        ],

        "Dab Tribes": [
            {type: "Shielded Infantry", pct: 0.35},
            {type: "Poison Crossbowman", pct: 0.25},
            {type: "Javelinier", pct: 0.15},
            {type: "Spearman", pct: 0.25}
        ],

        "Hong Dynasty": [
            {type: "Shielded Infantry", pct: 0.30},
            {type: "Heavy Crossbowman", pct: 0.25},
            {type: "Rocket", pct: 0.15},
            {type: "Firelance", pct: 0.05},
            {type: "Repeater Crossbowman", pct: 0.05},
            {type: "Heavy Firelance", pct: 0.05},
            {type: "Bomb", pct: 0.05},
            {type: "Archer", pct: 0.05}
        ],

        "Tran Realm": [
            {type: "Firelance", pct: 0.10},
            {type: "Poison Crossbowman", pct: 0.25},
            {type: "Javelinier", pct: 0.20},
            {type: "Archer", pct: 0.15},
            {type: "Spearman", pct: 0.30}
        ],

        "Jinlord Confederacy": [
            {type: "Archer", pct: 0.20},
            {type: "Heavy Crossbowman", pct: 0.30},
            {type: "Shielded Infantry", pct: 0.20},
            {type: "Hand Cannoneer", pct: 0.15},
            {type: "Heavy Two Handed", pct: 0.10},
            {type: "Spearman", pct: 0.05}
        ],

        "Xiaran Dominion": [
            {type: "Hand Cannoneer", pct: 0.40},
            {type: "Slinger", pct: 0.25},
            {type: "Spearman", pct: 0.20},
            {type: "Shielded Infantry", pct: 0.15}
        ],

        "Goryun Kingdom": [
            {type: "Archer", pct: 0.40},
            {type: "Spearman", pct: 0.20},
            {type: "Shielded Infantry", pct: 0.20},
            {type: "Rocket", pct: 0.10},
            {type: "Hand Cannoneer", pct: 0.05},
            {type: "Repeater Crossbowman", pct: 0.05}
        ],

        "High Plateau Kingdoms": [
            {type: "Slinger", pct: 0.30},
            {type: "Archer", pct: 0.45},
            {type: "Shielded Infantry", pct: 0.25}
        ],

        "Yamato Clans": [
            {type: "Glaiveman", pct: 0.40},
            {type: "Heavy Two Handed", pct: 0.20},
            {type: "Archer", pct: 0.40}
        ],

        "Bandits": [
            {type: "Militia", pct: 0.70},
            {type: "Slinger", pct: 0.15},
            {type: "Javelinier", pct: 0.15}
        ],

        default: [
            {type: "Shielded Infantry", pct: 0.25},
            {type: "Spearman", pct: 0.30},
            {type: "Archer", pct: 0.20},
            {type: "Crossbowman", pct: 0.15},
            {type: "Light Two Handed", pct: 0.10}
        ]
    },

    field: {
        "Great Khaganate": [
            {type: "Horse Archer", pct: 0.50},
            {type: "Heavy Horse Archer", pct: 0.20},
            {type: "Keshig", pct: 0.10},
            {type: "Lancer", pct: 0.15},
            {type: "Heavy Lancer", pct: 0.05}
        ],

        "Dab Tribes": [
            {type: "War Elephant", pct: 0.05},
            {type: "Poison Crossbowman", pct: 0.25},
            {type: "Javelinier", pct: 0.15},
            {type: "Spearman", pct: 0.25},
            {type: "Shielded Infantry", pct: 0.30}
        ],

        "Hong Dynasty": [
            {type: "Shielded Infantry", pct: 0.30},
            {type: "Heavy Crossbowman", pct: 0.25},
            {type: "Rocket", pct: 0.15},
            {type: "Firelance", pct: 0.05},
            {type: "Repeater Crossbowman", pct: 0.05},
            {type: "Heavy Firelance", pct: 0.05},
            {type: "Bomb", pct: 0.05},
            {type: "Archer", pct: 0.05}
        ],

        "Tran Realm": [
            {type: "Firelance", pct: 0.10},
            {type: "Poison Crossbowman", pct: 0.25},
            {type: "Javelinier", pct: 0.20},
            {type: "Archer", pct: 0.15},
            {type: "Spearman", pct: 0.30}
        ],

        "Jinlord Confederacy": [
            {type: "Archer", pct: 0.20},
            {type: "Heavy Crossbowman", pct: 0.30},
            {type: "Shielded Infantry", pct: 0.20},
            {type: "Hand Cannoneer", pct: 0.15},
            {type: "Heavy Lancer", pct: 0.10},
            {type: "Elite Lancer", pct: 0.05}
        ],

        "Xiaran Dominion": [
            {type: "Camel Cannon", pct: 0.20},
            {type: "Hand Cannoneer", pct: 0.20},
            {type: "Slinger", pct: 0.25},
            {type: "Spearman", pct: 0.20},
            {type: "Lancer", pct: 0.15}
        ],

        "Goryun Kingdom": [
            {type: "Archer", pct: 0.40},
            {type: "Spearman", pct: 0.20},
            {type: "Shielded Infantry", pct: 0.20},
            {type: "Rocket", pct: 0.10},
            {type: "Hand Cannoneer", pct: 0.05},
            {type: "Repeater Crossbowman", pct: 0.05}
        ],

        "High Plateau Kingdoms": [
            {type: "Slinger", pct: 0.30},
            {type: "Heavy Horse Archer", pct: 0.20},
            {type: "Archer", pct: 0.25},
            {type: "Shielded Infantry", pct: 0.25}
        ],

        "Yamato Clans": [
            {type: "Glaiveman", pct: 0.40},
            {type: "Heavy Two Handed", pct: 0.20},
            {type: "Archer", pct: 0.30},
            {type: "Heavy Horse Archer", pct: 0.10}
        ],

        "Bandits": [
            {type: "Militia", pct: 0.70},
            {type: "Slinger", pct: 0.15},
            {type: "Javelinier", pct: 0.15}
        ],

        default: [
            {type: "Shielded Infantry", pct: 0.25},
            {type: "Spearman", pct: 0.20},
            {type: "Archer", pct: 0.20},
            {type: "Crossbowman", pct: 0.15},
            {type: "Lancer", pct: 0.10},
            {type: "Light Two Handed", pct: 0.10}
        ]
    }
};

function getFactionComposition(faction, isSiege = false) {
    const rosterSet = isSiege ? FACTION_COMPOSITIONS.siege : FACTION_COMPOSITIONS.field;
    return rosterSet[faction] || rosterSet.default;
}


let inSiegeBattle = false;
let currentSiegeCity = null;

// --- SINGLE SOURCE OF TRUTH FOR SIEGE DIMENSIONS ---
const SiegeTopography = {
    wallTileY: 0,
    wallPixelY: 0,
    gateTileX: 0,
    gateTileY: 0,
    gatePixelX: 0,
    gatePixelY: 0,
    plazaPixelY: 0,
    campPixelY: 0
};

function establishSiegeTopography() {
    // 1. Fallback base based on city_system logic
    let foundWallY = Math.floor(CITY_LOGICAL_ROWS * 0.35); 
    
    // 2. Find the actual gate for pinpoint accuracy
    let southGate = typeof overheadCityGates !== 'undefined' ? overheadCityGates.find(g => g.side === "south") : null;
    
    if (southGate) {
        foundWallY = southGate.y; 
        SiegeTopography.gateTileX = southGate.x;
        SiegeTopography.gateTileY = southGate.y;
    } else {
        SiegeTopography.gateTileX = Math.floor(BATTLE_COLS / 2);
        SiegeTopography.gateTileY = foundWallY;
    }

    // 3. Bake the absolute coordinates
    SiegeTopography.wallTileY = foundWallY;
    SiegeTopography.wallPixelY = foundWallY * BATTLE_TILE_SIZE;
    SiegeTopography.gatePixelX = SiegeTopography.gateTileX * BATTLE_TILE_SIZE;
    SiegeTopography.gatePixelY = SiegeTopography.gateTileY * BATTLE_TILE_SIZE;
    
    // Plaza is deep inside the city (North)
    SiegeTopography.plazaPixelY = SiegeTopography.wallPixelY - 600; 
    
    // Camp is outside the walls (South), giving enough room for trebuchets
    SiegeTopography.campPixelY = SiegeTopography.wallPixelY + 800; 
    
    console.log("Siege Topography Established: Wall at Y=" + SiegeTopography.wallPixelY + ", Camp at Y=" + SiegeTopography.campPixelY);
}

function enterSiegeBattlefield(enemyNPC, playerObj, cityObj) {
	
	// ---> SURGERY: Trigger Naval Battle Music
    if (typeof AudioManager !== "undefined") {
        AudioManager.init();
        AudioManager.playMP3('music/battlemusic.mp3', false);
    }
	
	
    console.log(`INITIALIZING SIEGE BATTLE: ${cityObj.name}`);
    window.__SIEGE_AUTO_RETREAT_TRIGGERED__ = false;
    
    // ADD THIS:
    window.inNavalBattle = false; 
    // 
    // SURGERY: Only snapshot coordinates if we are in Campaign Mode (playerObj exists)
    if (playerObj && typeof savedWorldPlayerState_Battle !== 'undefined') {
        savedWorldPlayerState_Battle.x = playerObj.x;
        savedWorldPlayerState_Battle.y = playerObj.y;
    }
    if (typeof closeParleUI === 'function') {
        closeParleUI(); 
    } else {
        const panel = document.getElementById('parle-panel');
        if (panel) panel.style.display = 'none';
        inParleMode = false;
        if (player) player.isMapPaused = true; 
    }

    // 1. STATE HIJACK
    inBattleMode = true;
    inSiegeBattle = true;
    currentSiegeCity = cityObj;

    BATTLE_WORLD_WIDTH = CITY_WORLD_WIDTH;  
    BATTLE_WORLD_HEIGHT = CITY_WORLD_HEIGHT; 
    BATTLE_COLS = CITY_COLS;
    BATTLE_ROWS = CITY_ROWS;

    // 2. COPY CITY ENVIRONMENT
    let faction = cityObj.originalFaction || cityObj.faction;
    
if (typeof generateCity === 'function') {
    window.cityTowerPositions = []; // Force-clear so buildCityWalls always re-registers towers
    delete cityDimensions[faction]; // Bust the cache so generateCity rebuilds fully
    generateCity(faction);
        if (typeof city_system_troop_storage !== 'undefined') {
            city_system_troop_storage[faction] = []; 
        }
    }
	//window.cityTowerPositions.forEach(t => {    t.hp = t.maxHp ?? 300;    t.fireCooldown = Math.floor(Math.random() * 200 + 80); //im not sure if this one needs to be added again

    
    battleEnvironment.grid = JSON.parse(JSON.stringify(cityDimensions[faction].grid));
    battleEnvironment.bgCanvas = cityDimensions[faction].bgCanvas;
    battleEnvironment.fgCanvas = null; 
    battleEnvironment.groundColor = "#000000";
    battleEnvironment.visualPadding = 0;
	battleEnvironment.defenderGateDummyStartedAt = Date.now();
	battleEnvironment.defenderGateDummyDisabled = false;	
    // ---> ADD THIS LINE <---
    battleEnvironment.cityGates = typeof overheadCityGates !== 'undefined' ? overheadCityGates : [];
    // 3. CALIBRATE TOPOGRAPHY
    establishSiegeTopography();
// ---> NEW: HEAL ALL TOWERS FOR NEW BATTLE
    if (window.cityTowerPositions) {
        window.cityTowerPositions.forEach(t => {
            t.hp = t.maxHp || 300;
            t.fireCooldown = Math.floor(Math.random() * 200 + 80);
        });
    }
    currentBattleData = {
        enemyRef: enemyNPC, 
        playerFaction: playerObj.faction || "Hong Dynasty",
        enemyFaction: faction,
        initialCounts: { player: 0, enemy: 0 },
        playerColor: (typeof FACTIONS !== 'undefined' && FACTIONS[playerObj.faction]) ? FACTIONS[playerObj.faction].color : "#ffffff",
        enemyColor: (typeof FACTIONS !== 'undefined' && FACTIONS[faction]) ? FACTIONS[faction].color : "#000000"
    };

// 4. initialize THE GATES
if (typeof overheadCityGates !== 'undefined') {
    overheadCityGates.forEach(gate => {
        gate.gateHP = 1000; // <--- Change this to 1000
        gate.isOpen = false; // <--- Change this to false
    });
    updateCityGates(battleEnvironment.grid); 
}

// 5. DEPLOY ARMIES
    let playerTroops = playerObj.troops || 0;

    // ---> NEW: GLOBAL BATTLE SCALE <---
    let totalCombatants = playerTroops + enemyNPC.count;
    window.GLOBAL_BATTLE_SCALE = totalCombatants > 400 ? Math.ceil(totalCombatants / 300) : 1;

    deploySiegeAttackers(currentBattleData.playerFaction, playerTroops, "player");
    deploySiegeDefenders(faction, enemyNPC.count, "enemy", enemyNPC.roster);
// Inside enterSiegeBattlefield()
    initSiegeEquipment();
 // ---> NEW SURGERY: INITIALIZE DOM ROOF OVERLAY <---
    if (typeof initSiegeRoofOverlay === 'function') {
        initSiegeRoofOverlay();
    }
	
    // --- NEW LOGIC: ASSIGN 20% FLY-SWARM AND COUNTER-BATTERY ROLES ---
    let pUnitsForRoles = battleEnvironment.units.filter(u => u.side === "player" && !u.isCommander);
    let validClimbers = pUnitsForRoles.filter(u => !u.stats?.isRanged && canUseSiegeEngines(u));
    let rangedTroops = pUnitsForRoles.filter(u => u.stats?.isRanged || String(u.stats?.role).toLowerCase().includes("archer"));

// Assign 10% of eligible melee to be Ladder Fanatics (minimum 4 guaranteed)
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

    // Assign 20% of eligible ranged to be Counter-Battery Snipers
    let sniperCount = Math.floor(rangedTroops.length * 0.20);
    for (let i = 0; i < sniperCount; i++) {
        let rIdx = Math.floor(Math.random() * rangedTroops.length);
        let u = rangedTroops.splice(rIdx, 1)[0];
        if (u) {
            u.siegeRole = "counter_battery";
        }
    }
    // -----------------------------------------------------------------
 
    // 6. CAMERA & AUDIO
    playerObj.x = SiegeTopography.gatePixelX;
    playerObj.y = SiegeTopography.campPixelY + 500; 

    // ---> SURGERY: LAZY AUTO-SIEGE START <---
    // Automatically order all troops to begin the assault so the player doesn't have to manually spam Q
    let pUnits = battleEnvironment.units.filter(u => u.side === "player" && !u.isCommander && !u.disableAICombat);
    if (typeof executeSiegeAssaultAI === 'function') {
       // executeSiegeAssaultAI(pUnits);
    }

    if (typeof AudioManager !== 'undefined') {
        AudioManager.init();
        AudioManager.playMP3('music/battlemusic.mp3', false);
        AudioManager.playSound("charge"); 
    }

    if (typeof triggerEpicZoom === 'function') {
        triggerEpicZoom(0.1, 1.3, 3500);
    }
	
	isBattlefieldReady = true;
}

function deploySiegeAttackers(faction,totalTroops,side){deployArmy(faction,totalTroops,side);let cavCount=0;battleEnvironment.units.forEach(u=>{if(u.side==="player"&&!u.isCommander){let checkStr=String((u.stats?.role||"")+" "+(u.unitType||"")).toLowerCase();if(u.stats?.isLarge||checkStr.match(/(cav|cavalry|keshig|horse|lancer|mount|camel|eleph|knight)/)){u.siegeRole="cavalry_reserve";u.hasOrders=false;cavCount++}}});if(cavCount>0){console.log(`[SIEGE SYSTEM] Detected ${cavCount} Cavalry units. Moved to Rear-Guard Reserve.`)}let expectedSpawnY=BATTLE_WORLD_HEIGHT-300;let shiftY=expectedSpawnY-SiegeTopography.campPixelY+300;battleEnvironment.units.forEach(u=>{if(u.side==="player"){u.y-=shiftY;if(u.target&&u.target.isDummy){u.target.y-=shiftY}}})} //old method here
 
 
 

function deploySiegeDefenders(faction, totalTroops, side, npcRoster) {
    currentBattleData.initialCounts[side] += totalTroops;
    
    let color = currentBattleData.enemyColor;
    let grid = battleEnvironment.grid;
    
    let wallTiles = [];
    let groundTiles = [];

  // --- TRUE TOPOGRAPHY SCAN ---
    let wallY = SiegeTopography.wallTileY;
    
    for (let x = 20; x < BATTLE_COLS - 20; x++) {
        // 1. Wall Parapets (Shifted to stay strictly on/behind the wall)
        for (let y = wallY - 2; y <= wallY; y++) { // <--- CHANGE THIS LINE
            if (grid[x] && (grid[x][y] === 6 || grid[x][y] === 8 || grid[x][y] === 10)) {
                wallTiles.push({x, y}); 
            }
        }
        
        // 2. City Interior (Strictly NORTH of the wall)
        for (let y = wallY - 40; y <= wallY - 4; y++) { 
            if (grid[x] && (grid[x][y] === 0 || grid[x][y] === 1 || grid[x][y] === 5)) {
                groundTiles.push({x, y}); 
            }
        }
    }
    wallTiles.sort(() => Math.random() - 0.5);
    groundTiles.sort(() => Math.random() - 0.5);

// Replace the dead window.CURRENT_MOBILE_RATIO check with:
let visualScale = window.GLOBAL_BATTLE_SCALE || 1;

// SURGERY: Apply native-device scale floor (mirrors optimization-siege.js IS_NATIVE pattern)
const _isNativeDevice = (
    typeof window.Capacitor !== 'undefined' ||
    /\bwv\b/.test(navigator.userAgent) ||
    window.AndroidInterface != null ||
    (/Android/.test(navigator.userAgent) &&
     !/Chrome\/\d/.test(navigator.userAgent) &&
     !/Firefox\/\d/.test(navigator.userAgent))
);
if (_isNativeDevice) {
    visualScale = Math.max(visualScale, 2.5); // caps native at ~80 visible units
    window.CURRENT_MOBILE_RATIO = visualScale; // write it so it's accessible to other systems
}

let unitsToSpawn = Math.round(totalTroops / Math.max(1, visualScale));

// Inside function deploySiegeDefenders(faction, totalTroops, side, npcRoster)
for (let i = 0; i < unitsToSpawn; i++) {
    let unitType = npcRoster[i % npcRoster.length].type;

// --- SURGERY: NO MOUNTED/LARGE UNITS IN SIEGE (ENEMY) ---
    let checkTemplate = UnitRoster.allUnits[unitType] || UnitRoster.allUnits["Spearman"];
    let checkStr = String((checkTemplate.role || "") + " " + (unitType || "")).toLowerCase();
    
    // ---> Added !checkTemplate.isCommander safeguard <---
    if (!checkTemplate.isCommander && (checkTemplate.isLarge || checkStr.match(/(keshig|horse|lancer|mount|camel|eleph|knight|cav)/))) {
        unitType = "Spearman"; // Force conversion FOR DEFENDERS ONLY
    }

    let baseTemplate = UnitRoster.allUnits[unitType] || UnitRoster.allUnits["Spearman"];
    // ... remainder of the existing stats generation logic ...
        let unitStats = Object.assign(new Troop(baseTemplate.name, baseTemplate.role, baseTemplate.isLarge, faction), baseTemplate);
        unitStats.morale = 25; 
        unitStats.maxMorale = 25;
        
        let spawnSpot = null;
        let isElevated = false;
		
// =========================================================
        // --- NEW SURGERY: TIGHT PLAZA BLOB (NO WALL SPAWNS) ---
        // =========================================================
        
        // 1. normal
        let currentRole = "normal"; 
    

        // 2. Set the target anchor deep in the plaza (900px North of the wall)
        let spawnXCenter = SiegeTopography.gatePixelX || (BATTLE_COLS * BATTLE_TILE_SIZE / 2);
        let plazaY = SiegeTopography.wallPixelY - 150; 

        // 3. Tight Circular Math (from your previous edits)
        const personalSpace = 26; 
        let angle = (i * 0.5) + (Math.random() * Math.PI * 2);
        let dist = (Math.sqrt(i) * personalSpace) + (Math.random() * 800);

        // 4. Horizontal Compression (* 0.5) to keep them strictly in the center street
        let finalX = spawnXCenter + (Math.cos(angle) * dist * 0.5); 
        let finalY = plazaY + (Math.random() - 0.5) * 35; 

        // 5. Minimal random jitter for a cleaner formation
        finalX += (Math.random() - 0.5) * 350; 
        finalY += (Math.random() - 0.5) * 10;
		
		
        battleEnvironment.units.push({
            id: unitIdCounter++,
            side: side,
            faction: faction,
            color: color,
            unitType: unitType, 
            stats: unitStats, 
            hp: unitStats.health,
            x: finalX,
            y: finalY-30,
          startX: finalX, // Store original position
            startY: finalY, // Store original position
            siegeRole: currentRole, // Assign the new role
            target: { x: finalX, y: finalY + 50, isDummy: true },
            state: "idle",
            animOffset: Math.random() * 100,
            cooldown: 0,
            hasOrders: false,
            onWall: isElevated 
        });
    }
}

function getSiegePathfindingVector(unit, target, originalDx, originalDy, originalDist) {
    if (!inSiegeBattle || unit.side !== "player" || unit.onWall || unit.isClimbing || (unit.siegeRole && unit.siegeRole.includes('ladder'))) {
        return { dx: originalDx, dy: originalDy, dist: originalDist };
    }

    const wallBoundaryY = SiegeTopography.wallPixelY - 10;

    if (unit.y > wallBoundaryY && target.y < wallBoundaryY) {
        
       let southGate = overheadCityGates.find(g => g.side === "south");
       // NEW: Check the global breach flag so we don't rely on the deleted gate object
       let isGateBreached = window.__SIEGE_GATE_BREACHED__ || (southGate && (southGate.isOpen || southGate.gateHP <= 0));
       
        let activeLadders = typeof siegeEquipment !== 'undefined' ? siegeEquipment.ladders.filter(l => l.isDeployed && l.hp > 0) : [];
        let bestEntryPoint = null;

        if (isGateBreached) {
            bestEntryPoint = { x: SiegeTopography.gatePixelX, y: SiegeTopography.gatePixelY + 20 };
        } else if (activeLadders.length > 0 && canUseSiegeEngines(unit)) {
            let closestLadder = activeLadders.reduce((prev, curr) => {
                return Math.hypot(curr.x - unit.x, curr.y - unit.y) < Math.hypot(prev.x - unit.x, prev.y - unit.y) ? curr : prev;
            });
            bestEntryPoint = { x: closestLadder.x, y: closestLadder.y - 10 }; 
        }

        if (bestEntryPoint) {
            let distToEntry = Math.hypot(bestEntryPoint.x - unit.x, bestEntryPoint.y - unit.y);
            if (distToEntry > 15) {
                return {
                    dx: bestEntryPoint.x - unit.x,
                    dy: bestEntryPoint.y - unit.y,
                    dist: distToEntry
                };
            }
        }
    }
    
    return { dx: originalDx, dy: originalDy, dist: originalDist };
}
 
function initSiegeEquipment() {
siegeEquipment = { rams: [], trebuchets: [], mantlets: [], ladders: [], ballistas: [] };
    
  // --- GATE BREACH CHECK: No siege equipment spawns if gate is already broken ---
    let isGlobalBreach = window.__SIEGE_GATE_BREACHED__ === true;
    
    // FIX: Safely check the localized environment gates first so Custom Battles don't read dead global gates
    let gatePool = (typeof battleEnvironment !== 'undefined' && battleEnvironment.cityGates && battleEnvironment.cityGates.length > 0) 
        ? battleEnvironment.cityGates 
        : (typeof overheadCityGates !== 'undefined' ? overheadCityGates : []);
        
    let southGate = gatePool.find(g => g.side === "south");
    let isGateBrokenBeforeBattle = isGlobalBreach || (southGate && (southGate.isOpen || southGate.gateHP <= 0));

    if (isGateBrokenBeforeBattle) {
        console.log("Gate was broken prior to deployment! Skipping siege equipment spawn.");
        return; // Leave all arrays empty, immediately aborting engine deployment
    }

    if (southGate) {
        southGate.gateHP = 1000; 
        southGate.isOpen = false;
        updateCityGates(battleEnvironment.grid); 
    }

    let campY = SiegeTopography.campPixelY;
    let midX = SiegeTopography.gatePixelX; 

    // (Spawn Rams, Trebuchets, Mantlets, and Ladders as usual...)
    if (southGate) {
        siegeEquipment.rams.push({
            x: midX, y: campY - 350, targetGate: southGate, hp: 1000, speed: 0.65, isBreaking: false,
            shieldHP: 220, shieldMaxHP: 220, shieldW: 54, shieldH: 28, shieldOffsetX: 0, shieldOffsetY: -52
        });
    }

// --- PLAYER TREBUCHETS ---
    for (let i = -1; i <= 1; i += 2) {
        siegeEquipment.trebuchets.push({
            x: midX + (i * 300), 
            y: campY - 150, 
            hp: 150, 
            cooldown: Math.random() * 100, 
            fireRate: 450,
            side: "player", // <--- Added explicitly
			crewAssigned: []
        });
    }

// --- ENEMY TREBUCHETS j(NEW) ---
const TREB_COUNT_PER_SIDE = 2;
const NO_TREB_RADIUS = 200;
const SPACING = 250;

let positions = [];

// Left side (negative direction)
for (let i = 0; i < TREB_COUNT_PER_SIDE; i++) {
    positions.push(midX - NO_TREB_RADIUS - (i + 1) * SPACING);
}

// Right side (positive direction)
for (let i = 0; i < TREB_COUNT_PER_SIDE; i++) {
    positions.push(midX + NO_TREB_RADIUS + (i + 1) * SPACING);
}

// Spawn them
positions.forEach(xPos => {
    siegeEquipment.trebuchets.push({
        x: xPos,
        y: SiegeTopography.wallPixelY - 220,  
    hp: Math.floor(150 * (0.8 + Math.random() * 0.4)),
        cooldown: Math.random() * 100,
        fireRate: 450,
        side: "enemy",
        crewAssigned: []
    });
}); // <--- SURGERY: CLOSE TREBUCHET LOOP HERE

// ---> SURGERY: EXACTLY 2 BALLISTAS, STRICTLY > 400px FROM GATE
let ballistaXPositions = [midX - 450, midX + 450];

ballistaXPositions.forEach(baseX => {
    let balX = baseX + ((Math.random() - 0.5) * 50); // Small organic offset
    let balY = SiegeTopography.wallPixelY - 80;

    // Push Ballistas away if they land on a Tower
    if (window.cityTowerPositions) {
        for (let twr of window.cityTowerPositions) {
            if (Math.abs(balX - twr.pixelX) < 120) {
                balX += (balX > twr.pixelX) ? 120 : -120; 
            }
        }
    }

    siegeEquipment.ballistas.push({
        x: balX,
        y: balY, 
     hp: Math.floor(150 * (0.8 + Math.random() * 0.4)),
        cooldown: Math.random() * 100,
        fireRate: 350,
        side: "enemy",
        crewAssigned: [],
        aimAngle: Math.PI / 2 // Default aiming South
    });
});
// --- SURGERY: RANDOM MANTLET SPAWN, IGNORE LADDER GAPS ---
// Spawns many more mantlets randomly across the siege line,
// while preventing them from spawning too close together.

const mantletCount = 10;     
const minSpacing = 85;       // minimum distance between mantlets
const spreadMin = -980;      // left boundary
const spreadMax = 980;       // right boundary
const baseY = campY - 532;
const placed = [];

for (let i = 0; i < mantletCount; i++) {
    let tries = 0;
    let x = 0;

    while (tries < 80) {
        x = midX + (Math.random() * (spreadMax - spreadMin) + spreadMin);
        const tooClose = placed.some(px => Math.abs(px - x) < minSpacing);
        if (!tooClose) break;
        tries++;
    }

    placed.push(x);

    siegeEquipment.mantlets.push({
        x: x + (Math.random() - 0.5) * 12,
        y: baseY + (Math.random() - 0.5) * 80,
        hp: 1000
    });
}
for (let i = -3; i <= 3; i += 2) {

    // Base spacing
    let baseX = midX + (i * 120);
    let baseY = campY + 180;

    // 5% positional randomness (based on 120 spacing)
    let randomOffsetX = (Math.random() - 0.5) * 120 * 0.05; // ±3 px
    let randomOffsetY = (Math.random() - 0.5) * 120 * 0.05; // ±3 px

siegeEquipment.ladders.push({
        x: baseX + randomOffsetX,
        y: baseY + randomOffsetY - 350,
        crewAssigned: [], // NEW: Track the dedicated pushers
        speed: 0.37,      // NEW: Store speed here
        isDeployed: false,
        hp: 400
    });
}
}
