(function () { //customBATTLE version OF enter siege battle
window.launchCustomSiege = function(playerSetup, enemySetup, selectedMap) {
     // SURGERY: Hard-reset scale so no campaign siege bleeds into custom
    window.GLOBAL_BATTLE_SCALE = 1;
    window.CURRENT_MOBILE_RATIO = 0; // also clear the mobile ratio (see BUG 4)
    // ... rest unchanged
    inBattleMode = true;    // CRITICAL: Tells the engine we are in a tactical battle
    inSiegeBattle = true;
    zoom = 0.1;             // Start at "Clouds" level for the zoom effect
	
// ---> SURGERY: Trigger Siege Battle Music
    if (typeof AudioManager !== "undefined") {
        AudioManager.init();
        AudioManager.playMP3('music/battlemusic.mp3', false);
    }
	
    BATTLE_COLS = Math.floor(BATTLE_WORLD_WIDTH / 8);
    BATTLE_ROWS = Math.floor(BATTLE_WORLD_HEIGHT / 8);
      
        window.__SIEGE_GATE_BREACHED__ = false;
        window.__SIEGE_AUTO_RETREAT_TRIGGERED__ = false; // FIX: Hard reset the win-timer flag

        // 1. Setup Siege Dimensions
        BATTLE_WORLD_WIDTH = CITY_WORLD_WIDTH;  
        BATTLE_WORLD_HEIGHT = CITY_WORLD_HEIGHT; 
        BATTLE_COLS = CITY_COLS;
        BATTLE_ROWS = CITY_ROWS;

// 2. Generate the visual city for the Defender's faction (fresh, no cached data)
        window.cityTowerPositions = []; // Clear towers so they re-register cleanly
        delete cityDimensions[enemySetup.faction]; // Bust the cache so city rebuilds fully
        if (typeof generateCity === 'function') generateCity(enemySetup.faction);

        // Heal all towers for this fresh battle
        if (window.cityTowerPositions) {
            window.cityTowerPositions.forEach(t => {
                t.hp = t.maxHp || 300;
                t.fireCooldown = Math.floor(Math.random() * 200 + 80);
            });
        }

        // 3. Copy city environment — bgCanvas MUST be the city canvas, not the field terrain
        battleEnvironment.grid = JSON.parse(JSON.stringify(cityDimensions[enemySetup.faction].grid));
        battleEnvironment.bgCanvas = cityDimensions[enemySetup.faction].bgCanvas;
        battleEnvironment.fgCanvas = null;
        battleEnvironment.groundColor = "#000000";
        battleEnvironment.visualPadding = 0;
        battleEnvironment.defenderGateDummyStartedAt = Date.now();
        battleEnvironment.defenderGateDummyDisabled = false;

        battleEnvironment.cityGates = typeof overheadCityGates !== 'undefined' ? 
            JSON.parse(JSON.stringify(overheadCityGates)) : [];
            
        if (battleEnvironment.cityGates) {
            battleEnvironment.cityGates.forEach(g => { g.gateHP = 1000; g.isOpen = false; });
            if (typeof updateCityGates === 'function') updateCityGates(battleEnvironment.grid); 
        }

        establishSiegeTopography();

        // ---> ADD THIS MISSING INITIALIZATION BLOCK <---
        currentBattleData = {
            playerFaction: playerSetup.faction,
            enemyFaction: enemySetup.faction,
            playerColor: playerSetup.color,
            enemyColor: enemySetup.color,
            initialCounts: { 
                player: playerSetup.roster.length + 1, // +1 for the commander
                enemy: 0 // deploySiegeDefenders will add the enemy count to this
            }
        };

        // 4. Deploy Defenders (Using existing logic from siegebattle.js)
        let formattedEnemyRoster = enemySetup.roster.map(u => ({ type: u }));
        deploySiegeDefenders(enemySetup.faction, enemySetup.roster.length, "enemy", formattedEnemyRoster);
        // Spawn Enemy General in the Plaza
        spawnSiegeCommander("enemy", enemySetup.faction, enemySetup.color, SiegeTopography.gatePixelX, SiegeTopography.plazaPixelY);

        // 5. Deploy Attackers (Player) at the siege camp
        let pStartY = SiegeTopography.campPixelY + 200;
        spawnAttackerCamp(playerSetup.roster, playerSetup.faction, playerSetup.color, pStartY);
        spawnSiegeCommander("player", playerSetup.faction, playerSetup.color, BATTLE_WORLD_WIDTH / 2, pStartY + 80);

 

// 3. FIX CAMERA & PLAYER SYNC
        const playerCommander = battleEnvironment.units.find(u => u.isCommander && u.side === "player");
        if (playerCommander && typeof player !== "undefined") {
            player.x = playerCommander.x;
            player.y = playerCommander.y;
            player.hp = playerCommander.hp;
            player.maxHealth = playerCommander.maxHp || playerCommander.hp;
            player.ammo = playerCommander.ammo; // <--- SURGERY: SYNC SIEGE AMMO
            player.state = "idle"; // Reset global player state
        }

    if (typeof camera !== "undefined" && playerCommander) {
        camera.x = playerCommander.x - (window.innerWidth / 2 / zoom);
        camera.y = playerCommander.y - (window.innerHeight / 2 / zoom);
    }

    // 4. TRIGGER THE DRAMATIC ZOOM
    if (typeof triggerEpicZoom === "function") {
        triggerEpicZoom(0.1, 1.5, 3500); // Zoom from 0.1 to 1.5 over 3.5 seconds
    } else {
        zoom = 0.8;
    }
	window.isPaused = false;
    if (typeof startCustomBattleMonitor === 'function') startCustomBattleMonitor(); //referee

 
        // 6. Initialize Assets & AI
        initSiegeEquipment();

        let pUnits = battleEnvironment.units.filter(u => u.side === "player" && !u.isCommander);
        if (typeof executeSiegeAssaultAI === 'function') {
            executeSiegeAssaultAI(pUnits);
        } else {
            pUnits.forEach(u => { u.hasOrders = true; u.orderType = "siege_assault"; });
        }
    };

    // --- BULLETPROOF CLEANUP HOOK ---
    window.cleanupCustomSiege = function() {
        // Hard reset all global siege flags
        inSiegeBattle = false;
        window.__SIEGE_GATE_BREACHED__ = false;

        // Eradicate siege engines to prevent ghost spawns in the next battle
        if (typeof siegeEquipment !== 'undefined') {
            siegeEquipment.rams = [];
            siegeEquipment.ladders = [];
            siegeEquipment.mantlets = [];
            siegeEquipment.trebuchets = [];
        }

        if (typeof cityLadders !== 'undefined') cityLadders = [];
        if (typeof siegeAITick !== 'undefined') siegeAITick = 0;

        // Nullify city specific environment variables
        if (battleEnvironment) {
            battleEnvironment.grid = null;
            battleEnvironment.cityGates = [];
        }
        
        // Reset player climbing state
        if (typeof player !== 'undefined') player.onWall = false;
    };

    // --- LOCAL HELPERS ---
    
    // Custom isolated spawn loop for attackers to avoid needing to un-IIFE custom_battle_gui.js
    function spawnAttackerCamp(rosterArray, faction, color, startY) {
        let centerX = BATTLE_WORLD_WIDTH / 2;
        let spacingX = 22; let spacingY = 18;
        let currentX = centerX - (10 * spacingX) / 2;
        let currentY = startY;
        let col = 0;

        let sortedRoster = [...rosterArray].sort();

        sortedRoster.forEach(unitKey => {
            let template = UnitRoster.allUnits[unitKey] || UnitRoster.allUnits["Militia"];
            let unitStats = Object.assign(new Troop(template.name, template.role, template.isLarge, faction), template);
            unitStats.morale = 20; unitStats.maxMorale = 20; 

            let tacOffset = {x: 0, y: 0};
            if (typeof getTacticalPosition === 'function') tacOffset = getTacticalPosition(template.role, "player", unitKey) || {x: 0, y: 0};

            let safeHP = unitStats.health || unitStats.hp || unitStats.maxHealth || 100;
            
            // Map visual roles (same mapping as your field battle)
            let visType = "peasant";
            const role = template.role;
            if (role === (typeof ROLES !== 'undefined' ? ROLES.CAVALRY : "Cavalry") || role === (typeof ROLES !== 'undefined' ? ROLES.MOUNTED_GUNNER : "Mounted Gunner")) {
                visType = unitKey === "War Elephant" ? "elephant" : (unitKey.includes("Camel") ? "camel" : "cavalry");
            } else if (role === (typeof ROLES !== 'undefined' ? ROLES.HORSE_ARCHER : "Horse Archer")) visType = "horse_archer";
            else if (role === (typeof ROLES !== 'undefined' ? ROLES.PIKE : "Pikeman") || unitKey.includes("Glaive")) visType = "spearman";
            else if (role === (typeof ROLES !== 'undefined' ? ROLES.SHIELD : "Shield")) visType = "sword_shield";
            else if (role === (typeof ROLES !== 'undefined' ? ROLES.TWO_HANDED : "Two-Handed")) visType = "two_handed";
            else if (role === (typeof ROLES !== 'undefined' ? ROLES.CROSSBOW : "Crossbow")) visType = "crossbow";
            else if (role === (typeof ROLES !== 'undefined' ? ROLES.FIRELANCE : "Firelance")) visType = "firelance";
            else if (role === (typeof ROLES !== 'undefined' ? ROLES.ARCHER : "Archer")) visType = "archer";
            else if (role === (typeof ROLES !== 'undefined' ? ROLES.GUNNER : "Gunner")) visType = "gun";
            else if (role === (typeof ROLES !== 'undefined' ? ROLES.BOMB : "Bombardier")) visType = "bomb";
            else if (role === (typeof ROLES !== 'undefined' ? ROLES.ROCKET : "Rocket")) visType = "rocket";

            battleEnvironment.units.push({
                id: Math.floor(Math.random() * 999999), 
                side: "player", faction: faction, color: color, unitType: unitKey,
                disableAICombat: false, stats: unitStats, hp: safeHP, maxHp: safeHP, 
                ammo: unitStats.ammo || template.ammo || 0, renderType: visType, 
                x: currentX + tacOffset.x + (Math.random() - 0.5) * 5,
                y: currentY + tacOffset.y + (Math.random() - 0.5) * 5,
                vx: 0, vy: 0, direction: 1, anim: Math.floor(Math.random() * 100),
                frame: 0, isMoving: false, target: null, state: "idle",
                animOffset: Math.random() * 100, cooldown: 0, hasOrders: false
            });
            
            col++;
            currentX += spacingX;
            if (col >= 10) { 
                col = 0; currentX = centerX - (10 * spacingX) / 2; currentY += spacingY;
            }
        });
    }

    function spawnSiegeCommander(side, faction, color, x, y) {
        let cmdrName = "General"; 
        let baseGeneral = UnitRoster.allUnits[cmdrName] || {}; 
        let cmdrRole = baseGeneral.role || (typeof ROLES !== 'undefined' ? ROLES.HORSE_ARCHER : "horse_archer");
        let cmdrStats = Object.assign(new Troop(cmdrName, cmdrRole, true, faction), baseGeneral);

        battleEnvironment.units.push({
            id: side === "player" ? 999999 : 888888 + Math.floor(Math.random() * 1000), 
            side: side, faction: faction, color: color, unitType: cmdrName, 
            isCommander: true, disableAICombat: side === "player", 
            stats: cmdrStats, hp: 200, maxHp: 200, ammo: 24,      
            renderType: "horse_archer", x: x, y: y,
            vx: 0, vy: 0, direction: side === "player" ? 1 : -1, 
            anim: 0, frame: 0, isMoving: false, target: null, state: "idle",
            animOffset: Math.random() * 100, cooldown: 0, hasOrders: false
        });
    }

})();