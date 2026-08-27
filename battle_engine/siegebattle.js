function getSiegePlazaY() {
    if (!(typeof inSiegeBattle !== 'undefined' && inSiegeBattle)) return null;

    const southGate = (typeof overheadCityGates !== 'undefined')
        ? overheadCityGates.find(g => g.side === "south")
        : null;

    // Plaza center fallback if gate data is missing — offset raised 300px to keep cavalry clear of wall
    return southGate
        ? (southGate.y * BATTLE_TILE_SIZE) - 750
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
    campPixelY: 0,
    defenderRallyPixelY: 0 // SURGERY: single source of truth for where defenders spawn/patrol/rally. See DEFENDER_SOUTH_SHIFT below.
};

// SURGERY: how far south (larger Y) of the old gatePixelY-200 anchor the
// defender garrison should sit. Change this ONE number to retune it —
// every spawn/patrol/rally/clamp site now reads SiegeTopography.defenderRallyPixelY
// instead of hardcoding "gatePixelY - 200" separately, which is what let
// the old anchor keep winning: some sites got fixed, others (the pre-deploy
// clamp box especially) didn't, so units kept getting pulled back north.
const DEFENDER_SOUTH_SHIFT = 400;
// SURGERY: pull defenders further north, off the gate line, with a ±10%
// randomized tolerance so they don't land on an identical Y every siege.
const DEFENDER_NORTH_PULLBACK = 300 * (0.9 + Math.random() * 0.2); // 270-330px

let _establishTopoCallCount = 0;

function establishSiegeTopography() {
    _establishTopoCallCount++;
    // DIAGNOSTIC: full overheadCityGates dump, tagged with a call counter.
    // User reports this only breaks on siege #2+ within a session, specifically
    // after a LAND battle ran first — never on a fresh page load straight into
    // a siege. Logging every gate's raw {x,y,side} on every call lets us diff
    // call #1 (works) against call #2 (broken) directly, instead of guessing
    // whether overheadCityGates itself is what changed between them.
    console.log("[SiegeTopography] === establishSiegeTopography call #" + _establishTopoCallCount + " ===",
        "overheadCityGates(" + (typeof overheadCityGates !== 'undefined' && overheadCityGates ? overheadCityGates.length : 'undefined') + " gates)=",
        (typeof overheadCityGates !== 'undefined' ? overheadCityGates.map(g => ({x: g.x, y: g.y, side: g.side})) : undefined));

    // 1. Fallback base based on city_system logic
    let foundWallY = Math.floor(CITY_LOGICAL_ROWS * 0.35); 
    
    // 2. Find the actual gate for pinpoint accuracy
    let southGate = typeof overheadCityGates !== 'undefined' ? overheadCityGates.find(g => g.side === "south") : null;
    
    if (southGate) {
        foundWallY = southGate.y; 
        SiegeTopography.gateTileX = southGate.x;
        SiegeTopography.gateTileY = southGate.y;
    } else {
        console.warn("[SiegeTopography] southGate NOT FOUND — falling back to foundWallY=" + foundWallY +
            " (CITY_LOGICAL_ROWS=" + CITY_LOGICAL_ROWS + "). overheadCityGates=", 
            (typeof overheadCityGates !== 'undefined' ? overheadCityGates : undefined));
        SiegeTopography.gateTileX = Math.floor(BATTLE_COLS / 2);
        SiegeTopography.gateTileY = foundWallY;
    }

    // 3. Bake the absolute coordinates
    SiegeTopography.wallTileY = foundWallY;
    SiegeTopography.wallPixelY = foundWallY * BATTLE_TILE_SIZE;
    SiegeTopography.gatePixelX = SiegeTopography.gateTileX * BATTLE_TILE_SIZE;
    SiegeTopography.gatePixelY = SiegeTopography.gateTileY * BATTLE_TILE_SIZE;
    
    // Plaza is deep inside the city (North) — kept for back-compat, nothing
    // functional reads this anymore (see defenderRallyPixelY below).
    SiegeTopography.plazaPixelY = SiegeTopography.wallPixelY - 600; 
    
    // Camp is outside the walls (South), giving enough room for trebuchets
    SiegeTopography.campPixelY = SiegeTopography.wallPixelY + 800; 

    // SURGERY: the actual defender anchor. Was gatePixelY - 200 everywhere;
    // now gatePixelY - 200 + DEFENDER_SOUTH_SHIFT, computed once here so
    // deploySiegeDefenders, the patrol AI, the gate-breach rally, the
    // enemy commander spawn, and the pre-deploy clamp box all agree.
    SiegeTopography.defenderRallyPixelY = (SiegeTopography.gatePixelY - 200) + DEFENDER_SOUTH_SHIFT - DEFENDER_NORTH_PULLBACK; 
    
    // DIAGNOSTIC: real runtime values, including the raw south gate object
    // straight from overheadCityGates — CITY_LOGICAL_ROWS is confirmed
    // defined (city_system.js:12) and southGate lookup is confirmed to
    // match real data (fortification_system.js:81-92), so this is no
    // longer a "is X undefined" check — it's "what are the ACTUAL numbers
    // this specific run produced." BATTLE_ROWS/BATTLE_COLS logged too since
    // a mismatch between CITY_LOGICAL_ROWS (city gen) and BATTLE_ROWS
    // (battle world size) would show up here as gatePixelY landing outside
    // the actual battle world bounds.
    console.log("[SiegeTopography] southGate=", southGate,
        "| foundWallY(tile)=" + foundWallY,
        "| wallPixelY=" + SiegeTopography.wallPixelY,
        "| gatePixelX=" + SiegeTopography.gatePixelX,
        "| gatePixelY=" + SiegeTopography.gatePixelY,
        "| defenderRallyPixelY=" + SiegeTopography.defenderRallyPixelY,
        "| campPixelY=" + SiegeTopography.campPixelY,
        "| BATTLE_WORLD_HEIGHT=" + (typeof BATTLE_WORLD_HEIGHT !== 'undefined' ? BATTLE_WORLD_HEIGHT : 'undefined'),
        "| BATTLE_ROWS=" + (typeof BATTLE_ROWS !== 'undefined' ? BATTLE_ROWS : 'undefined'),
        "| CITY_LOGICAL_ROWS=" + CITY_LOGICAL_ROWS);
}

function enterSiegeBattlefield(enemyNPC, playerObj, cityObj) {
	
	// ---> SURGERY: Trigger Naval Battle Music
    if (typeof AudioManager !== "undefined") {
        AudioManager.init();
        AudioManager.playMP3('music/battlemusic.mp3', false);
    }
	
	
    console.log(`INITIALIZING SIEGE BATTLE: ${cityObj.name}`);
    window.__SIEGE_AUTO_RETREAT_TRIGGERED__ = false;
    // SURGERY: this was never reset between battles. If the player had
    // breached a gate in ANY prior siege this session, this stayed true
    // forever after, so a brand new siege — fresh gate, gateHP=1000,
    // isOpen=false — would still read gateBreached=true from frame one via
    // the `window.__SIEGE_GATE_BREACHED__ ||` short-circuit in
    // processTacticalOrders, sending every siege_assault unit straight into
    // the gate-funnel/charge logic before the gate had actually been
    // touched. Confirmed root cause of "rush to plaza even though the
    // southern gate is closed."
    window.__SIEGE_GATE_BREACHED__ = false;
    // SURGERY: same staleness bug as __SIEGE_GATE_BREACHED__ above, but for
    // the pillar hitboxes triggerGateBreach() records — without this a
    // fresh siege would inherit the PREVIOUS siege's pillar rectangles
    // (wrong map, wrong gate position) until/unless its own gate breaks.
    window.__siegeGatePillars__ = [];
    
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

    // ── FIX 4: Per-side cap with ratio preservation (siege) ─────────────────
    // Mirrors the identical logic in enterBattlefield so the Settings UI
    // maxSandboxBattleTroops slider works for siege battles too.
    // Custom battles bypass via __IS_CUSTOM_BATTLE__ and keep the old formula.
    let totalCombatants = playerTroops + enemyNPC.count;
    if (window.__IS_CUSTOM_BATTLE__) {
        window.GLOBAL_BATTLE_SCALE = totalCombatants > 400 ? Math.ceil(totalCombatants / 300) : 1;
    } else {
        const _cap = Math.max(20, Math.min(300, window.maxSandboxBattleTroops || 100));
        const _largerSide = Math.max(playerTroops, enemyNPC.count || 0);
        window.GLOBAL_BATTLE_SCALE = (_largerSide > _cap) ? (_largerSide / _cap) : 1;
    }

    deploySiegeAttackers(currentBattleData.playerFaction, playerTroops, "player");
    deploySiegeDefenders(faction, enemyNPC.count, "enemy", enemyNPC.roster);
// Inside enterSiegeBattlefield()
    initSiegeEquipment();
 // ---> NEW SURGERY: INITIALIZE DOM ROOF OVERLAY <---
    if (typeof initSiegeRoofOverlay === 'function') {
        initSiegeRoofOverlay();
    }
	
    // SURGERY: attackers start genuinely frozen — unselected, and excluded
    // from both AI layers this codebase has:
    //   - disableAICombat=true blocks ai_categories.js's processTargeting
    //     (its very first line bails on this) and processTacticalOrders'
    //     100px emergency survival override — the per-unit targeting layer.
    //   - _lazyManual=true excludes them from getLivePlayers() in
    //     autoAttack.js, so _runSiege/_runLand/the emergency guard-ring
    //     never touch them — the macro AI layer.
    // Both clear automatically the moment the player acts: a manual command
    // goes through lazyTakeManualControl() (battlefield_commands.js), the
    // auto-attack button goes through fireAuto() (autoAttack.js) — both
    // updated to clear disableAICombat alongside _lazyManual.
    battleEnvironment.units.forEach(u => {
        if (u.side === "player" && !u.isCommander) {
            u.selected = false;
            u.disableAICombat = true;
            u._lazyManual = true;
        }
    });

    // NOTE: ladder_fanatic / counter_battery role assignment used to happen
    // right here, synchronously, the instant troops were deployed — before
    // the player (or the auto-press timer below) had done anything. Since
    // orderType="ladder_crew" is picked up immediately by ai_categories.js's
    // processTargeting regardless of the auto-attack button, those units
    // were walking to a ladder on their own at siege start — the confirmed
    // source of "some units already moving with no command given." Moved to
    // autoAttack.js's runAssignment() (see _runSiege), the one function that
    // actually runs whether the assault starts from the timer below or a
    // manual button press, so role assignment only happens the moment real
    // automation begins, same as every other siege role.
    // -----------------------------------------------------------------
 
    // 6. CAMERA & AUDIO
    // Place the general deep in the southern camp, safely outside tower range (~450px south of wall).
    // campPixelY = wallPixelY + 800, already well outside range.
    // Hard floor: at least wallPixelY + 600 so smaller maps never pull the general back north.
    // Ceiling: BATTLE_WORLD_HEIGHT - 200 (generous, avoids snapping back toward the wall).
    playerObj.x = SiegeTopography.gatePixelX;
    playerObj.y = Math.min(
        Math.max(SiegeTopography.wallPixelY + 600, SiegeTopography.campPixelY),
        BATTLE_WORLD_HEIGHT - 200
    );

    // Immediately sync the commander unit to playerObj so there is no
    // one-frame mismatch on the first updateBattleUnits tick after loading.
    // deploySiegeAttackers shifted units to a different Y; without this sync
    // towers could lock onto the stale position and fire from unexpected angles.
    const _cmdrUnit = battleEnvironment.units.find(u => u.isCommander && u.side === "player");
    if (_cmdrUnit) {
        _cmdrUnit.x = playerObj.x;
        _cmdrUnit.y = playerObj.y;
        if (_cmdrUnit.target && _cmdrUnit.target.isDummy) {
            _cmdrUnit.target.x = playerObj.x;
            _cmdrUnit.target.y = playerObj.y;
        }
    }

    // IMPORTANT: Do NOT snap enemy units to the player Y here.
    // Defenders are placed inside the city by deploySiegeDefenders.
    // The old "snap to _enemyCampY" code was teleporting all defenders
    // to the player spawn point, causing archers to fire point-blank
    // from every direction the moment the loading screen cleared.

    // ---> SURGERY: LAZY AUTO-SIEGE START — REMOVED <---
    // This used to arm a 1-3s randomized timer that pressed the auto-attack
    // button on the player's behalf. Confirmed requirement now is the
    // opposite: no automation fires on its own for siege attackers at all —
    // see the disableAICombat/_lazyManual freeze pass above. The button
    // still works exactly as before when the player actually clicks it
    // (fireAuto() in autoAttack.js); nothing here calls it for them anymore.

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

function deploySiegeAttackers(faction,totalTroops,side){deployArmy(faction,totalTroops,side);
// RESERVES REMOVED (explicit request): this used to tag every cavalry-like
// unit as "cavalry_reserve" with hasOrders=false at the moment of deployment,
// before executeSiegeAssaultAI ever got a chance to run — meaning cavalry
// started the battle already frozen in the old rear-guard-reserve mechanism
// (see ai_categories.js's PRE-BREACH CAVALRY HARD FREEZE, which keyed off
// this exact role string). Cavalry now deploys the same as every other unit
// and gets a normal assignment (ranged shooter, ram pusher, or ladder queue)
// from executeSiegeAssaultAI once the player presses the siege auto-attack
// button, same as everyone else — no separate reserve treatment.
let expectedSpawnY=BATTLE_WORLD_HEIGHT-300;let shiftY=expectedSpawnY-SiegeTopography.campPixelY+300;battleEnvironment.units.forEach(u=>{if(u.side==="player"){u.y-=shiftY;if(u.target&&u.target.isDummy){u.target.y-=shiftY}}})} //old method here
 
 
 

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
    

// 2. Anchor 200px north of the southern gate, on the gate's own X
        //    (gatePixelY comes from southGate — see establishSiegeTopography;
        //    smaller Y = further north, matching the wallY-40..wallY-4 scan
        //    above and plazaPixelY = wallPixelY - 600)
        const GATE_SPAWN_OFFSET = 200; // kept for the radius math below, no longer used for plazaY itself
        let spawnXCenter = SiegeTopography.gatePixelX;
        let plazaY = SiegeTopography.defenderRallyPixelY;

        // 3. Circular Math, radius scaled to the ±10% tolerance and then
        //    tripled — the previous 20px ceiling packed units glued
        //    together right on top of the gate; this gives them real
        //    room to spread out around the (now further-north) anchor.
        const personalSpace = 26;
        const maxSpreadRadius = GATE_SPAWN_OFFSET * 0.1 * 3; // 60px — tripled spread ceiling
        let angle = (i * 0.5) + (Math.random() * Math.PI * 2);
        let dist = Math.min(Math.sqrt(i) * personalSpace, maxSpreadRadius) + (Math.random() * maxSpreadRadius);

        // 4. Horizontal Compression (* 0.5) to keep them strictly in the center street
        let finalX = spawnXCenter + (Math.cos(angle) * dist * 0.5);
        let finalY = plazaY + (Math.random() - 0.5) * (GATE_SPAWN_OFFSET * 0.1 * 3);

        // 5. Minimal random jitter for a cleaner formation, same tripled bound
        finalX += (Math.random() - 0.5) * (GATE_SPAWN_OFFSET * 0.1 * 3);
        finalY += (Math.random() - 0.5) * (GATE_SPAWN_OFFSET * 0.1 * 3);
		
		
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

// ============================================================================
// INTERIOR OBSTACLE AVOIDANCE (post-breach: gate -> plaza/center)
// ----------------------------------------------------------------------------
// getSiegePathfindingVector (below) only ever handled ONE case: a unit
// outside the wall heading for the gate/a ladder. Once a unit was actually
// INSIDE the walls — which is exactly the post-breach "rush the plaza"
// scenario — it fell straight back to a raw beeline vector with zero
// building/wall avoidance. That's why units visibly walked straight into
// houses and wall stubs and sat there until the reactive "stuck 90 ticks ->
// briefly ghost through" extractor eventually bailed them out.
// This is lightweight steering, not full A* pathfinding: sample a few points
// along the intended heading. If clear, go straight (cheap — the common
// case). If something solid (tile 2 = building, 6 = solid wall/stone,
// 7 = tower base) is in the way, try a small fan of deflection angles and
// take the first clear one, smallest deflection first. The chosen deflection
// is cached for ~15 ticks per unit so it doesn't re-sample every frame and
// doesn't visibly flip-flop between two directions.
// ============================================================================
function _isBlockedGroundTile(wx, wy) {
    if (typeof battleEnvironment === 'undefined' || !battleEnvironment.grid) return false;
    const tx = Math.floor(wx / BATTLE_TILE_SIZE);
    const ty = Math.floor(wy / BATTLE_TILE_SIZE);
    const col = battleEnvironment.grid[tx];
    if (!col) return false;
    const t = col[ty];
    return t === 2 || t === 6 || t === 7;
}

function _siegePathIsClear(x, y, dx, dy, dist) {
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const steps = Math.min(5, Math.ceil(dist / 24));
    for (let i = 1; i <= steps; i++) {
        const sampleDist = Math.min(dist, i * 24);
        if (_isBlockedGroundTile(x + ux * sampleDist, y + uy * sampleDist)) return false;
    }
    return true;
}

function _getInteriorAvoidanceVector(unit, dx, dy, dist) {
    if (dist < 5) return { dx, dy, dist };

    const frameNow = (typeof currentBattleData !== 'undefined' && currentBattleData) ? (currentBattleData.frames || 0) : 0;

    // Reuse a recent steering decision instead of resampling every frame.
    if (unit._siegeAvoidUntil && unit._siegeAvoidUntil > frameNow) {
        const len = Math.hypot(dx, dy) || 1;
        const newAngle = Math.atan2(dy, dx) + (unit._siegeAvoidAngle || 0);
        return { dx: Math.cos(newAngle) * len, dy: Math.sin(newAngle) * len, dist };
    }

    if (_siegePathIsClear(unit.x, unit.y, dx, dy, dist)) {
        unit._siegeAvoidAngle = 0;
        unit._siegeAvoidUntil = 0;
        return { dx, dy, dist };
    }

    // Blocked — try a small fan of deflection angles (~20/40/63/86 degrees),
    // smallest first, alternating sides so there's no permanent turn bias.
    const baseAngle = Math.atan2(dy, dx);
    const len = Math.hypot(dx, dy) || 1;
    const candidates = [0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.5, -1.5];
    for (let i = 0; i < candidates.length; i++) {
        const a = candidates[i];
        const testAngle = baseAngle + a;
        const tdx = Math.cos(testAngle) * len, tdy = Math.sin(testAngle) * len;
        if (_siegePathIsClear(unit.x, unit.y, tdx, tdy, Math.min(dist, 80))) {
            unit._siegeAvoidAngle = a;
            unit._siegeAvoidUntil = frameNow + 15;
            return { dx: tdx, dy: tdy, dist };
        }
    }
    // Nothing clear nearby — fall back to the original heading; the existing
    // applyStuckExtractor() is still there as a last-resort escape.
    return { dx, dy, dist };
}

function getSiegePathfindingVector(unit, target, originalDx, originalDy, originalDist) {
    // FIX (crash report: "Uncaught TypeError: Cannot read properties of
    // null (reading 'y')" at this file's former line 799, hit while
    // dragging a blue-arrow formation move during a siege): this function
    // is called from ai_categories.js's _handleMovement for EVERY moving
    // player unit each frame — including one under a plain move_to_point/
    // formation order, which has no combat target and correctly passes
    // unit.target as null (it's not attacking anything, it's marching
    // where the player pointed). The guard below never checked for that;
    // it only checked side/onWall/isClimbing/ladder-role, so target.y a
    // few lines down threw the instant a targetless player unit took this
    // path during any siege — reliably reproducible any time formation-
    // drag is used while a siege is active and the selection isn't
    // currently locked onto an enemy, not something specific to the gate
    // being open (that only changes what the gate-routing logic below
    // does; it was never what caused the crash itself).
    // No target -> nothing to route around specifically; the original
    // dx/dy/dist already points at wherever the real order (formation
    // waypoint, etc.) wants this unit to go, so that's the correct
    // fallback, same as the other early-outs on this line already do.
    if (!inSiegeBattle || unit.side !== "player" || unit.onWall || unit.isClimbing || (unit.siegeRole && unit.siegeRole.includes('ladder')) || !target) {
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
            // FIX ("attackers cluster in a dot and can't get past the gate"):
            // this used to be one fixed point — SiegeTopography.gatePixelX,
            // gatePixelY + 20 — identical for every player unit. With dozens
            // of units all being steered at the same exact pixel every tick,
            // they physically stack on top of each other right at the wall's
            // outer face and can never disperse (every other multi-unit
            // convergence case in this codebase — ladders in siege_system.js,
            // defenders in siegeEngineLogic.js, archer aim in ai_categories.js
            // — fans units out; this was the one spot that didn't).
            //
            // Also, "+ 20" placed the target SOUTH of the wall (outside it),
            // which is short of wallBoundaryY (wallPixelY - 10) below — so
            // even a unit that reached the old point never satisfied the
            // unit.y < wallBoundaryY handoff into _getInteriorAvoidanceVector,
            // and got re-aimed at the identical point again next tick,
            // forever. battlefield_commands.js's processTacticalOrders had to
            // grow its own 4-second "STUCK-AT-THE-DOOR FAILSAFE" band-aid to
            // cope with exactly this.
            //
            // Fix: give each unit its own lane, anchored to where it's
            // already standing. Land the target solidly past wallBoundaryY
            // so arriving here actually releases the unit into interior
            // movement instead of holding it at the threshold.
            //
            // CORRECTION: this originally clamped the lane to 80px — the
            // gateHalfWidth siegeEngineLogic.js uses to decide when to stop
            // INTERFERING with a unit. That number is deliberately wider
            // than the real doorway (a generous "leave it alone" tolerance
            // is harmless there). It is NOT safe to reuse as an actual
            // destination: the physical opening (fortification_system.js:
            // gateRadius=6 tiles * 8px, minus the outer tile on each side,
            // which is the still-solid door pillar) is only ~40px each way
            // from center. A lane of 65px pointed some units directly at
            // solid wall stone next to the pillars — plain terrain collision
            // (isBattleCollision, battlefield_logic.js) blocks that for
            // EVERYONE regardless of side/siegeRole/breach state, which is
            // exactly the "invisible wall right past the gate, one-way,
            // general exempt" symptom: units aimed outside the true opening
            // simply could never physically get there. Keeping the lane
            // inside the real doorway (with a small margin off the pillars)
            // fixes that while still spreading units instead of stacking them.
            const gateOpeningHalfWidth = 32;
            const lane = Math.max(-gateOpeningHalfWidth, Math.min(gateOpeningHalfWidth, unit.x - SiegeTopography.gatePixelX));
            bestEntryPoint = { x: SiegeTopography.gatePixelX + lane, y: SiegeTopography.wallPixelY - 40 };
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

    // NEW: GATE STAGING — a unit that just cleared the doorway (Stage 0
    // above) used to be handed straight to real-target seeking on the very
    // next tick. With rams, ladders, and the broken door pillars all
    // clustered in that first ~40-80px, immediately trying to navigate
    // toward a real (often distant, often obstructed) enemy target from
    // right in that clutter is what produced the "extremely dumb, doesn't
    // know where to go" wandering — the unit was pathing around siege
    // equipment and enemies at the same time with no clear priority.
    // Requested fix: walk straight to 100px past the gate first (using the
    // same obstacle-dodge fan as real interior movement, so it still sidesteps
    // anything in the way), THEN switch to seek & engage. _siegeStagingCleared
    // latches permanently once reached, so a unit knocked back toward the
    // gate mid-fight doesn't re-trigger this and abandon combat.
    if (window.__SIEGE_GATE_BREACHED__ && unit.y <= wallBoundaryY && !unit._siegeStagingCleared) {
        const stagingY = SiegeTopography.wallPixelY - 100;
        if (unit.y > stagingY) {
            return _getInteriorAvoidanceVector(unit, 0, stagingY - unit.y, Math.abs(stagingY - unit.y));
        }
        unit._siegeStagingCleared = true;
    }

    // Post-breach and already inside the walls: this is the "rush the
    // center" case that previously had zero obstacle avoidance at all.
    if (window.__SIEGE_GATE_BREACHED__ && unit.y < wallBoundaryY) {
        return _getInteriorAvoidanceVector(unit, originalDx, originalDy, originalDist);
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
            // HP tripled (1000 -> 3000) so the ram survives long enough for a
            // capped 5-unit crew to actually break the gate.
            x: midX, y: campY - 350, targetGate: southGate, hp: 3000, speed: 0.65, isBreaking: false,
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
// while preventing them from spawning too close together
// AND preventing them from blocking any siege engine's travel path.

const mantletCount = 10;     
const minSpacing = 85;       // minimum distance between mantlets
const spreadMin = -980;      // left boundary
const spreadMax = 980;       // right boundary
const baseY = campY - 532;
const placed = [];

// Pre-compute the X positions that siege engines will travel through so mantlets
// cannot block them.  Use the same formula the engine spawners use.
// Ram: travels straight north along midX (±55px clearance each side).
// Ladders: spawned at i = -3, -1, +1, +3  → midX + i*120 (±55px clearance).
const _engineBlockedXRanges = [{ cx: midX, half: 55 }]; // ram path
for (let _li = -3; _li <= 3; _li += 2) {
    _engineBlockedXRanges.push({ cx: midX + _li * 120, half: 55 });
}

for (let i = 0; i < mantletCount; i++) {
    let tries = 0;
    let x = 0;

    while (tries < 80) {
        x = midX + (Math.random() * (spreadMax - spreadMin) + spreadMin);
        const tooClose    = placed.some(px => Math.abs(px - x) < minSpacing);
        const inEnginePath = _engineBlockedXRanges.some(r => Math.abs(x - r.cx) < r.half);
        if (!tooClose && !inEnginePath) break;
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
        speed: 0.54,      //  ladder speed
        isDeployed: false,
        hp: 900 // Tripled (300 -> 900) alongside the ram
    });
}
}