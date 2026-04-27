
(function() {

    // =========================================================================
    // 1. UNIVERSAL BATTLE CLEANUP
    // Strictly obliterates all previous battle data to prevent Engine Bleed
    // =========================================================================
    window.cleanupCustomBattleEnvironments = function() {
        inBattleMode = false;
        inCityMode = false;

        if (typeof inSiegeBattle !== 'undefined') inSiegeBattle = false;
        window.inNavalBattle = false;

        window.__SIEGE_GATE_BREACHED__ = false;
        window.__CUSTOM_BATTLE_ENDED__ = false;

        if (window.cbCustomBattleMonitor) clearInterval(window.cbCustomBattleMonitor);

        if (typeof cleanupCustomSiege === 'function') cleanupCustomSiege();
        if (typeof cleanupNavalSailCanvas === 'function') cleanupNavalSailCanvas();

        if (typeof battleEnvironment !== 'undefined' && battleEnvironment) {
            battleEnvironment.units = [];
            battleEnvironment.projectiles = [];
            battleEnvironment.groundEffects = [];
            battleEnvironment.grid = null;
            battleEnvironment.bgCanvas = null;
            battleEnvironment.fgCanvas = null;
            battleEnvironment.cityGates = [];
        }

        if (typeof navalEnvironment !== 'undefined') {
            navalEnvironment.ships = [];
            navalEnvironment.waves = [];
            navalEnvironment.fishes = [];
            navalEnvironment.seagulls = [];
        }

        unitIdCounter = 0;

        // STRENGTHENED PLAYER RESET
        // NOTE: uses `player` directly — NOT window.player — because player is
        // declared with `let` in update.js and is NOT on the window object.
        if (typeof player !== 'undefined') {
            player.hp = player.maxHealth || 150;
            player.maxHealth = player.maxHealth || 150;
			player.ammo = 24; // <--- SURGERY: HARD RESET AMMO STATE ON EXIT
            player.state = "idle";
            player.isDead = false;
            player.isMoving = false;
            player.stunTimer = 0;
            player.onWall = false;

            if (player.stats) {
                player.stats.morale = 100;
                player.stats.hp = player.maxHealth;
            }
        }

        // Clear any stuck keys
        if (typeof keys !== 'undefined') {
            for (let k in keys) keys[k] = false;
        }
    };

    // =========================================================================
    // 2. THE NAVAL LAUNCH ROUTINE
    // =========================================================================
    window.launchCustomNavalBattle = function(playerSetup, enemySetup, mapType, pShipSize, eShipSize) {
        window.cleanupCustomBattleEnvironments();

        window.inNavalBattle = true;
        inBattleMode = true;
        zoom = 0.1;

        BATTLE_WORLD_WIDTH = 4800;
        BATTLE_WORLD_HEIGHT = 3200;
        BATTLE_COLS = Math.floor(BATTLE_WORLD_WIDTH / (typeof BATTLE_TILE_SIZE !== 'undefined' ? BATTLE_TILE_SIZE : 8));
        BATTLE_ROWS = Math.floor(BATTLE_WORLD_HEIGHT / (typeof BATTLE_TILE_SIZE !== 'undefined' ? BATTLE_TILE_SIZE : 8));

        let pCount = playerSetup.roster.length;
        let eCount = enemySetup.roster.length;

        // MOCK CAMPAIGN OBJECTS: Tricking initNavalBattle into working without a campaign map
        let mockPlayer = { faction: playerSetup.faction, color: playerSetup.color, troops: pCount };
        let mockEnemy  = { faction: enemySetup.faction,  color: enemySetup.color,  count: eCount  };

        // Setup unified data tracker for battle logic
        currentBattleData = {
            playerFaction: playerSetup.faction, enemyFaction: enemySetup.faction,
            playerColor:   playerSetup.color,   enemyColor:   enemySetup.color,
            initialCounts: { player: pCount + 1, enemy: eCount + 1 } // +1 for commanders
        };

        // STEP 1: Initialize base naval map & ships
        if (typeof initNavalBattle === 'function') {
            initNavalBattle(mockEnemy, mockPlayer, mapType, pCount, eCount);
        }

// STEP 2: Apply custom ship sizes from GUI.
        const SHIP_DEFS = {
            LIGHT:  { width: 750,  height: 300, mastCount: 2, sailScale: 0.50, type: "Light Scout"  },
            MEDIUM: { width: 1200, height: 480, mastCount: 3, sailScale: 0.48, type: "Medium Junk"   },
            HEAVY:  { width: 1800, height: 660, mastCount: 3, sailScale: 0.74, type: "Heavy Dragon"  }
        };

        if (navalEnvironment.ships.length >= 2) {
            let pS = SHIP_DEFS[pShipSize] || SHIP_DEFS.MEDIUM;
            let eS = SHIP_DEFS[eShipSize] || SHIP_DEFS.MEDIUM;

            let s0 = navalEnvironment.ships[0]; // Player Ship
            s0.width     = pS.width;
            s0.height    = pS.height;
            s0.mastCount = pS.mastCount;
            s0.sailScale = pS.sailScale;
            s0.type      = pS.type; 

            let s1 = navalEnvironment.ships[1]; // Enemy Ship
            s1.width     = eS.width;
            s1.height    = eS.height;
            s1.mastCount = eS.mastCount;
            s1.sailScale = eS.sailScale;
            s1.type      = eS.type; 

            // =====================================================================
            // FIX 6: DYNAMIC SHIP SPACING
            // Recalculates X/Y coordinates after the GUI resize override to prevent
            // the massive bounding boxes from overlapping in the center.
            // =====================================================================
            let centerX = BATTLE_WORLD_WIDTH / 2;  // 2400
            let centerY = BATTLE_WORLD_HEIGHT / 2; // 1600
            
            // The physical water gap between the bows of the two ships.
            // 250 is the standard campaign boarding distance.
            let engagementGap = 250; 
            
            // Player faces North (-Y), placed at the bottom half of the map
            s0.x = centerX;
            s0.y = centerY + (s0.height / 2) + (engagementGap / 2);
            
            // Enemy faces South (+Y), placed at the top half of the map
            s1.x = centerX;
            s1.y = centerY - (s1.height / 2) - (engagementGap / 2);
        }

        // STEP 3: Clear lanes based on new (correct) ship geometry
        if (typeof clearShipLanes === 'function') clearShipLanes();

        // STEP 4: Wipe any units initNavalBattle might have accidentally spawned
        battleEnvironment.units = [];

        // STEP 5: Spawn EXACT custom rosters on deck
        _customNavalDeckSpawn(playerSetup.roster, "player", playerSetup.faction, playerSetup.color, navalEnvironment.ships[0]);
        _customNavalDeckSpawn(enemySetup.roster,  "enemy",  enemySetup.faction,  enemySetup.color,  navalEnvironment.ships[1]);

        // FIX 4: Zero out all water-state on every freshly spawned unit.
        // Prevents stale flags from triggering false drowning on frame 1.
        battleEnvironment.units.forEach(u => {
            u.overboardTimer = 0;
            u.drownTimer     = 0;
            u.isSwimming     = false;
        });

        // STEP 6: Find the player commander
        let pCmdr = battleEnvironment.units.find(u => u.side === "player" && u.isCommander);

if (pCmdr && typeof player !== 'undefined') {
            player.x         = pCmdr.x;
            player.y         = pCmdr.y;
            player.hp        = pCmdr.hp;
player.maxHealth = pCmdr.maxHp;
        player.ammo      = pCmdr.ammo; 
        player.speed     = 2;
        player.weaponMode = 'ranged'; // <--- FIX: Force ranged stance upon spawn
    }

		else if (typeof player !== 'undefined') {
            // Fallback: no commander found — snap to ship center
            let fallbackShip = navalEnvironment.ships[0];
            if (fallbackShip) {
                player.x = fallbackShip.x;
                player.y = fallbackShip.y;
            }
        }

        // Canvas housekeeping
        const canvas = document.getElementById("gameCanvas");
        if (canvas) {
            canvas.style.display    = "block";
            canvas.style.visibility = "visible";
            canvas.width  = window.innerWidth;
            canvas.height = window.innerHeight;
        }

        // Snap camera (belt-and-suspenders — the draw loop also derives from player.x/y)
        if (pCmdr && typeof camera !== "undefined") {
            camera.x = pCmdr.x - (window.innerWidth  / 2 / (zoom || 1));
            camera.y = pCmdr.y - (window.innerHeight / 2 / (zoom || 1));
        }

        if (typeof AudioManager !== "undefined") {
            AudioManager.playMP3("music/battlemusic.mp3", false);
            AudioManager.playSound("charge");
        }

        if (typeof triggerEpicZoom === "function") triggerEpicZoom(0.1, 1.5, 3500);
        else zoom = 0.8;

        if (typeof startCustomBattleMonitor === 'function') startCustomBattleMonitor();
        window.isPaused = false;

        if (!window.__battleLoopStarted) {
            window.__battleLoopStarted = true;
            if (typeof draw === 'function') draw();
        }
    };

    // =========================================================================
    // 3. CUSTOM DECK SPAWNER
    // Bypasses campaign percentage math — spawns EXACTLY the provided roster.
    // =========================================================================
    function _customNavalDeckSpawn(rosterArray, side, faction, color, ship) {
        if (!ship) return;

        // FIX 5: Build the spawn list WITHOUT sort() before grid calculation.
        // sort() was scrambling index order, pushing units to outer grid cells
        // where they're closest to the hull edge and most likely to miss the
        // safety check. Commander is prepended, then the user's roster in order.
let spawnList = ["General", ...rosterArray];
        let cols = Math.ceil(Math.sqrt(spawnList.length * (ship.width / ship.height)));
        if (cols < 1) cols = 1;
        let rows = Math.ceil(spawnList.length / cols);
        if (rows < 1) rows = 1;

        const PERSONAL_SPACE = 22;
        const spacingX = Math.min(PERSONAL_SPACE, (ship.width * 0.85) / cols);
        const spacingY = Math.min(PERSONAL_SPACE, (ship.height * 0.85) / rows);

        const blockW = cols * spacingX;
        const blockH = rows * spacingY;
        const startX = ship.x - (blockW / 2);
        const startY = ship.y - (blockH / 2);

        // FIX 2: Campaign-proven superellipse hull check.
        // Uses only ship.width / ship.height — immune to s.type mismatches.
        // Matches `pointInShip` in battlefield_launch.js exactly.
        function _isOnDeck(px, py, s) {
            const dx = px - s.x;
            const dy = py - s.y;
            const rx = s.width  / 2;
            const ry = s.height / 2;
            return (Math.pow(Math.abs(dx) / rx, 2.5) + Math.pow(Math.abs(dy) / ry, 2.5)) <= 0.90;
        }

        spawnList.forEach((unitKey, i) => {
            let template = UnitRoster.allUnits[unitKey] || UnitRoster.allUnits["Militia"];
let isCmdr   = (unitKey === "General");

            const row = Math.floor(i / cols);
            const col = i % cols;

            let px = startX + (col * spacingX) + (spacingX / 2) + (Math.random() - 0.5) * (spacingX * 0.4);
            let py = startY + (row * spacingY) + (spacingY / 2) + (Math.random() - 0.5) * (spacingY * 0.4);

            // Tactical role positioning: ranged to front, cavalry to back
            const roleStr2 = String(template.role || "").toLowerCase();
            const shiftAmt = ship.height * 0.05;
            if (side === "player") {
                if (roleStr2.includes("archer") || roleStr2.includes("crossbow") || roleStr2.includes("gun")) py -= shiftAmt;
                if (roleStr2.includes("cavalry") || roleStr2.includes("horse")   || roleStr2.includes("mount")) py += shiftAmt;
            } else {
                if (roleStr2.includes("archer") || roleStr2.includes("crossbow") || roleStr2.includes("gun")) py += shiftAmt;
                if (roleStr2.includes("cavalry") || roleStr2.includes("horse")   || roleStr2.includes("mount")) py -= shiftAmt;
            }

            // Safety net: jitter back onto deck if tactical shift pushed unit off hull
            if (!_isOnDeck(px, py, ship)) {
                for (let attempt = 0; attempt < 50 && !_isOnDeck(px, py, ship); attempt++) {
                    px = ship.x + (Math.random() - 0.5) * (ship.width  * 0.20);
                    py = ship.y + (Math.random() - 0.5) * (ship.height * 0.20);
                }
                // Absolute fallback: dead center on the mast
                if (!_isOnDeck(px, py, ship)) {
                    px = ship.x;
                    py = ship.y;
                }
            }

            let unitStats = Object.assign(new Troop(template.name, template.role, template.isLarge, faction), template);
            unitStats.morale    = 20;
            unitStats.maxMorale = 20;
            unitStats.faction   = faction;
            let safeHP = isCmdr ? 200 : (unitStats.health || unitStats.hp || 100);

            // Visual type mapping for the render system
            let visType  = "peasant";
            let roleStr  = String(template.role).toLowerCase();
            if (roleStr.includes("cavalry") || roleStr.includes("mounted")) {
                visType = unitKey === "War Elephant" ? "elephant" : (unitKey.includes("Camel") ? "camel" : "cavalry");
            } else if (roleStr.includes("horse archer")) visType = "horse_archer";
            else if (roleStr.includes("pike")  || unitKey.includes("Glaive")) visType = "spearman";
            else if (roleStr.includes("shield"))    visType = "sword_shield";
            else if (roleStr.includes("two-handed")) visType = "two_handed";
            else if (roleStr.includes("crossbow"))  visType = "crossbow";
            else if (roleStr.includes("firelance")) visType = "firelance";
            else if (roleStr.includes("archer"))    visType = "archer";
            else if (roleStr.includes("gun"))       visType = "gun";
            else if (roleStr.includes("bomb"))      visType = "bomb";
            else if (roleStr.includes("rocket"))    visType = "rocket";

            battleEnvironment.units.push({
                id:             Math.floor(Math.random() * 999999),
                side:           side,
                faction:        faction,
                color:          color,
                unitType:       isCmdr ? "General" : unitKey,
                isCommander:    isCmdr,
                disableAICombat: (side === 'player' && isCmdr),
                stats:          unitStats,
                hp:             safeHP,
                maxHp:          safeHP,
// SURGERY: Force 24 ammo if template fails, ensuring you never spawn with 0
                ammo:           isCmdr ? (unitStats.ammo || 24) : (unitStats.ammo || (template && template.ammo) || 0),
                renderType:     visType,
                x:              px,
                y:              py,
                vx:             0,
                vy:             0,
                direction:      side === "player" ? 1 : -1,
                target:         null,
                state:          "idle",
                spawnMode:      "naval",
                animOffset:     Math.random() * 100,
                cooldown:       170,
                hasOrders:      false,
                anim:           Math.floor(Math.random() * 100),
                frame:          0,
                isMoving:       false,

                // FIX 4 (pre-zeroed here too, also zeroed in bulk after spawn loop):
                overboardTimer: 0,
                drownTimer:     0,
                isSwimming:     false
            });
        });
    }

})();
