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

        // Reset ship helm input so stale joystick state doesn't bleed
        window._shipHelmInput = { dx: 0, dy: 0 };
        window._shipRotateInput = { dx: 0, dy: 0 };

        if (typeof battleEnvironment !== 'undefined' && battleEnvironment) {
            battleEnvironment.units = [];
            battleEnvironment.projectiles = [];
            battleEnvironment.groundEffects = [];
            battleEnvironment.grid = null;
            battleEnvironment.bgCanvas = null;
            battleEnvironment.fgCanvas = null;
            battleEnvironment.treeFrontCanvas = null;
            battleEnvironment.cityGates = [];
        }

        if (typeof navalEnvironment !== 'undefined') {
            navalEnvironment.ships = [];
            navalEnvironment.waves = [];
            navalEnvironment.fishes = [];
            navalEnvironment.seagulls = [];
            // FIX: mapSeed was never cleared, so generateNavalMap()'s
            // `battleEnvironment.mapSeed ?? navalEnvironment.mapSeed ?? Date.now()`
            // fallback chain kept reusing the FIRST battle's seed forever —
            // every naval battle after the first got an identical coastline
            // (coastSide, rock/reef/kelp placement, water shimmer pattern).
            // Clearing it here forces a fresh Date.now()-derived seed next launch.
            navalEnvironment.mapSeed = null;
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
        // Hide ship joysticks immediately on cleanup
        if (window.NavalHelmUI) window.NavalHelmUI.clearNavalHelm();
    };

    // =========================================================================
    // 2. THE NAVAL LAUNCH ROUTINE
    // =========================================================================
    window.launchCustomNavalBattle = function(playerSetup, enemySetup, mapType, pShipSize, eShipSize) {
        window.cleanupCustomBattleEnvironments();

        window.inNavalBattle = true;
        inBattleMode = true;
        window.inBattleMode = true;  // === EXPLICIT: ensure mobile_ui can detect battle state ===
        zoom = 0.1;

        // === NAVAL BATTLEFIELD 10x LARGER ===
        // 50000×32000 = 1.6 billion sq units (≈10x the old 16000×10000 map)
        // Ships now start at a randomized corner (see FIX 6 below /
        // computeNavalSpawnGeometry in naval_battles.js) — still a vast
        // ocean to sail across either way.
        BATTLE_WORLD_WIDTH = 50000;
        BATTLE_WORLD_HEIGHT = 32000;
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
            MEDIUM: { width: 1200, height: 480, mastCount: 2, sailScale: 0.48, type: "Medium Junk"   },
            HEAVY:  { width: 1800, height: 660, mastCount: 2, sailScale: 0.74, type: "Heavy Dragon"  }
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
            // Ensure sailing properties survive the resize override
            s0.heading   = s0.heading   ?? Math.PI * 1.5;
            s0.speed     = s0.speed     ?? 0;
            s0.maxSpeed  = s0.maxSpeed  ?? 2.5;
            s0.sailTurnSpeed = 0.006;  // SLOW sail rotation — keep in sync with generateShips
            s0.vx = 0; s0.vy = 0;
            s0.isPlayerControlled = true;

            let s1 = navalEnvironment.ships[1]; // Enemy Ship
            s1.width     = eS.width;
            s1.height    = eS.height;
            s1.mastCount = eS.mastCount;
            s1.sailScale = eS.sailScale;
            s1.type      = eS.type; 
            s1.heading   = s1.heading   ?? Math.PI * 0.5;
            s1.speed     = s1.speed     ?? 0;
            s1.maxSpeed  = s1.maxSpeed  ?? 2.5;
            s1.sailTurnSpeed = 0.006;  // SLOW sail rotation — keep in sync with generateShips
            s1.vx = 0; s1.vy = 0;
            s1.isPlayerControlled = false;

            // =====================================================================
            // FIX 6: DYNAMIC SHIP SPACING
            //
            // FIX: this block used to recompute s0.x/s0.y/s1.x/s1.y from
            // window.navalSpawnAssignment.ax/ay, with a centerX/south/north
            // fallback if the assignment was missing. Two problems:
            //
            //  1) It was pure redundancy — generateShips() (called via
            //     initNavalBattle at STEP 1, above) already set pShip.x/y and
            //     eShip.x/y from that exact same assignment. Re-deriving here
            //     added a second read of the same data for no benefit.
            //  2) The fallback path computed centerX from BATTLE_WORLD_WIDTH
            //     AFTER initNavalBattle had already run — and initNavalBattle
            //     can be wrapped (see PB3 in optimization-battles.js) to
            //     override BATTLE_WORLD_WIDTH/HEIGHT to a smaller platform-
            //     fixed size before generateShips runs. So if the assignment
            //     was ever missing, the fallback silently used a DIFFERENT,
            //     un-shrunk world size than the one ships actually spawned
            //     into, which could push the fallback position off-map or
            //     into a corner that only ever resolved one way in practice.
            //
            // s0.x/s0.y/s1.x/s1.y already hold the correct randomized-corner
            // position from generateShips — nothing left to do here.
            // =====================================================================
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

        window.isPaused = false;

        if (!window.__battleLoopStarted) {
            window.__battleLoopStarted = true;
            if (typeof draw === 'function') draw();
        }

        // ── NAVAL JOYSTICK: force-show immediately + deferred fallbacks ──────
        // forceNavalHelm is called synchronously here AND deferred to beat any
        // timing race where NavalHelmUI wasn't ready yet at this exact moment.
        (function _forceHelmWithFallbacks() {
            function _tryForce() {
                if (window.NavalHelmUI && window.inNavalBattle) {
                    window.NavalHelmUI.forceNavalHelm();
                }
            }
            _tryForce();                          // immediate
            setTimeout(_tryForce, 100);           // after first RAF frame
            setTimeout(_tryForce, 400);           // after first 250ms poll cycle
            setTimeout(_tryForce, 1000);          // belt-and-suspenders at 1s
        })();

        // ── BATTLE MONITOR: delayed start so units are present on first tick ─
        // Previously startCustomBattleMonitor ran immediately. Its first 250ms
        // tick could fire before _customNavalDeckSpawn finished populating units,
        // seeing pAlive=0 and eAlive=0 and calling leaveBattlefield() — which
        // clears inNavalBattle=false and hides the joystick buttons.
        // Delaying by 1500ms guarantees units are spawned and visible.
        setTimeout(function() {
            if (window.inNavalBattle && typeof startCustomBattleMonitor === 'function') {
                startCustomBattleMonitor();
            }
        }, 1500);
    };

    // =========================================================================
    // 3. CUSTOM DECK SPAWNER
    // Bypasses campaign percentage math — spawns EXACTLY the provided roster.
    // =========================================================================
    function _customNavalDeckSpawn(rosterArray, side, faction, color, ship) {
        if (!ship) return;

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

        // Ship heading rotation — spawn positions must be rotated into world space
        const _h   = ship.heading || 0;
        const _cos = Math.cos(_h);
        const _sin = Math.sin(_h);

        // On-deck test in SHIP-LOCAL space (unrotated)
        function _isOnDeckLocal(lx, ly) {
            const rx = ship.width  / 2;
            const ry = ship.height / 2;
            return (Math.pow(Math.abs(lx) / rx, 2.5) + Math.pow(Math.abs(ly) / ry, 2.5)) <= 0.90;
        }

        spawnList.forEach((unitKey, i) => {
            let template = UnitRoster.allUnits[unitKey] || UnitRoster.allUnits["Militia"];
            let isCmdr   = (unitKey === "General");

            const row = Math.floor(i / cols);
            const col = i % cols;

            // Calculate position in SHIP-LOCAL space (centered at 0,0, bow at +X)
            let localX = -blockW/2 + (col * spacingX) + (spacingX / 2) + (Math.random() - 0.5) * (spacingX * 0.4);
            let localY = -blockH/2 + (row * spacingY) + (spacingY / 2) + (Math.random() - 0.5) * (spacingY * 0.4);

            // Tactical role positioning along ship length (local X axis)
            const roleStr2 = String(template.role || "").toLowerCase();
            const shiftAmt = ship.width * 0.05;
            if (side === "player") {
                if (roleStr2.includes("archer") || roleStr2.includes("crossbow") || roleStr2.includes("gun")) localX += shiftAmt;
                if (roleStr2.includes("cavalry") || roleStr2.includes("horse")   || roleStr2.includes("mount")) localX -= shiftAmt;
            } else {
                if (roleStr2.includes("archer") || roleStr2.includes("crossbow") || roleStr2.includes("gun")) localX -= shiftAmt;
                if (roleStr2.includes("cavalry") || roleStr2.includes("horse")   || roleStr2.includes("mount")) localX += shiftAmt;
            }

            // Safety net: jitter back onto deck if off hull (in local space)
            if (!_isOnDeckLocal(localX, localY)) {
                for (let attempt = 0; attempt < 50 && !_isOnDeckLocal(localX, localY); attempt++) {
                    localX = (Math.random() - 0.5) * (ship.width  * 0.20);
                    localY = (Math.random() - 0.5) * (ship.height * 0.20);
                }
                if (!_isOnDeckLocal(localX, localY)) {
                    localX = 0; localY = 0; // dead center
                }
            }

            // Rotate local → world and offset by ship center
            let px = ship.x + localX * _cos - localY * _sin;
            let py = ship.y + localX * _sin + localY * _cos;

            // === ABSOLUTE SAFETY CLAMP ===
            // Never spawn outside map bounds. If rotation pushed unit off-map,
            // snap back to ship center. This prevents the "black abyss" bug.
            if (px < 50 || px > BATTLE_WORLD_WIDTH - 50 || py < 50 || py > BATTLE_WORLD_HEIGHT - 50) {
                px = ship.x;
                py = ship.y;
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
                // See custom_battle_gui.js's identical fix — now role-driven
                // instead of keying off unitKey === "Camel Cannon", which
                // broke once the roster key itself was renamed to "Cannon"
                // (not just the .name display field). "mounted_gunner" is
                // unique to the Cannon unit, so this is rename-proof.
                visType = unitKey === "War Elephant" ? "elephant"
                    : roleStr.includes("mounted_gunner") ? "camel_cannon"
                    : (unitKey.includes("Camel") ? "camel" : "cavalry");
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