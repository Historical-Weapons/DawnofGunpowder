;(function () {
    'use strict';

    // ============================================================================
    // NAVAL EXPLORATION — open-world procedural sailing minigame
    // ----------------------------------------------------------------------------
    // REPLACES naval_merchant_escort.js (the old "Naval Escort" convoy-defense
    // script). That mode faked its whole world as a single scrolling worldX
    // number with ships lerped into formation — no real map, no real physics
    // while sailing. This module throws that away: the player sails ONE ship
    // through a real, continuous 2D ocean using the ACTUAL naval physics engine
    // (oars: Navalrowing.js, sail: naval_battles.js's updateNavalPhysics), the
    // world is procedurally generated in chunks as the ship advances, and
    // hostile ships use the SAME approach/circle/ram/grapple AI every other
    // naval battle in this codebase already runs — nothing about combat is
    // reinvented here.
    //
    // WHY inBattleMode STAYS TRUE FOR THE WHOLE SESSION (not just fights):
    // updateNavalPhysics() (real oar+sail physics) and updateBattleUnits()
    // (real troop AI/combat) both only run when sandboxmode_update.js's main
    // loop sees inBattleMode===true AND finds a live player commander unit.
    // Rather than faking sailing and only borrowing the real engine during a
    // fight (the old escort file's approach), this mode just IS a naval battle,
    // continuously, from first launch to the moment the player turns back —
    // sailing and boarding are the same continuous state, exactly like a real
    // naval battle already is. See start() below for the full bootstrap.
    //
    // WHY initNavalBattle()/generateNavalMap()/generateCosmetics() ARE NEVER
    // CALLED: those build a full BATTLE_COLS×BATTLE_ROWS grid array sized off
    // BATTLE_WORLD_WIDTH/HEIGHT. An open, "sail as far as you like" world needs
    // BATTLE_WORLD_WIDTH/HEIGHT huge (so updateNavalPhysics()'s own world-bounds
    // ship clamp never bites) — allocating a real grid at that scale would be a
    // multi-hundred-million-cell array. Islands here are stored as a handful of
    // numbers per chunk (center, radius, a seed) instead of a raster, and
    // battleEnvironment.grid is left a tiny inert dummy array — see _neutralize
    // BackgroundCache()/start() for exactly what's skipped and why it's safe
    // (every grid[tx][ty] read left in the engine outside siege code is
    // already null-guarded; confirmed by hand against battlefield_logic.js,
    // ai_categories.js and naval_battles.js before writing this file).
    //
    // REQUIRES (same load-order convention as every other file here — classic
    // <script> tags sharing one global scope, see this codebase's own existing
    // comments to that effect in custom_naval_launcher.js/naval_merchant_escort.js):
    // naval_battles.js, Navalrowing.js, naval_sailing_cosmetics.js,
    // battlefield_logic.js, ai_categories.js, troop_system.js,
    // custom_battle_gui.js (getAvailableUnitsForFaction/FactionUnitRules),
    // custom_naval_launcher.js (cleanupCustomBattleEnvironments). Load this file
    // where naval_merchant_escort.js used to load.
    // ============================================================================

    if (window.__NAVAL_EXPLORATION_LOADED__) return;
    window.__NAVAL_EXPLORATION_LOADED__ = true;

    // ============================================================================
    // 1. CONFIG
    // ============================================================================
    const EXPLORE_CFG = {
        chunkSize: 4096,             // px per chunk edge
        genRadiusChunks: 3,          // chunks within this ring of the player are generated
        islandChance: 0.22,          // chance any given chunk rolls an island at all
        islandMinRadius: 260,        // px — smallest possible island
        islandMaxRadiusSmall: 620,   // small-class cap
        islandMaxRadiusMedium: 1150, // medium-class cap — deliberately capped low: no continents,
                                      // just small/medium islands, per design brief
        mediumChance: 0.35,          // of islands rolled, fraction that are medium instead of small
        decorMin: 4, decorMax: 10,

        worldExtent: 24000000,       // BATTLE_WORLD_WIDTH/HEIGHT — a practically-unbounded ocean.
                                      // At real sail speeds this would take ~100+ real-time hours to
                                      // cross in one direction; it exists only so updateNavalPhysics()'s
                                      // own world-bounds ship clamp never becomes a wall the player can
                                      // actually reach, without needing to patch that clamp.

        anchorRange: 260,            // px from an island's edge the ship must be within to anchor
        anchorMaxSpeed: 0.9,         // px/frame — must be under this to drop anchor

        minDistanceBeforeCulling: 24000, // px the player must have SAILED before any chunk is ever
                                          // deleted — "only happens after significant [ground] covered"

        // Memory-retention aggressiveness scales continuously with the existing
        // LOW..MAX graphics-quality tier (_navGetQual(), 0-100 — the same knob
        // naval_battles.js already gates fish/wave/seagull counts on), using
        // this codebase's own "value = LOW + (MAX-LOW) × pct" convention from
        // settings_ui.js's GRAPHICS_QUALITY_TIERS. LOW forgets fast and close
        // (phones / "getting lost" happens quickly); MAX remembers a wide,
        // long-held wake of explored chunks.
        keepRadiusChunksLOW: 2,
        keepRadiusChunksMAX: 6,
        graceMsLOW: 7000,
        graceMsMAX: 50000,

        hostileCheckMs: 4000,        // how often a new hostile-ship roll is attempted
        hostileMaxActive: 3,         // hostile ships simulated near the player at once
        hostileSpawnChance: 0.35,    // chance a check actually spawns one
        hostileSpawnMinDist: 1400,
        hostileSpawnMaxDist: 2600,
        hostileDespawnDist: 6000,    // beyond this (and not grappled) a hostile ship is culled

        crewCountRange: [5, 8],          // player crew — small, "just you and your ship"
        hostileCrewCountRange: [4, 8],   // base hostile crew size
        hostileCrewDistanceBonus: 3,     // + up to this many extra crew, ramping in with distance sailed
        hostileCrewDistanceBonusAt: 120000, // px sailed to reach the full bonus
    };

    // Real base-game factions (FactionUnitRules is defined in custom_battle_gui.js,
    // loaded before this file — see the header note above). Falls back to a
    // fixed list if that file somehow isn't present yet, so a load-order slip
    // degrades gracefully instead of leaving the faction picker empty.
    const FACTIONS = (typeof FactionUnitRules !== 'undefined' && FactionUnitRules)
        ? Object.keys(FactionUnitRules)
        : ["Tran Realm", "Dab Tribes", "Great Khaganate", "Yamato Clans", "Xiaran Dominion",
           "Hong Dynasty", "Jinlord Confederacy", "Goryun Kingdom"];

    function _randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }

    // Deterministic per-faction color (no canonical color field exists on
    // FactionUnitRules to reuse) — cheap string hash into an HSL hue so the
    // same faction always reads the same color across a session.
    function _factionColor(name) {
        let h = 0;
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
        const hue = h % 360;
        return "hsl(" + hue + ", 42%, 34%)";
    }

    // ============================================================================
    // 2. QUALITY-TIER HELPERS — see EXPLORE_CFG's memory-retention comment above.
    // ============================================================================
    function _explQual() {
        return (typeof _navGetQual === 'function') ? _navGetQual() : 100;
    }
    function _tierLerp(lowVal, maxVal) {
        const pct = Math.max(0, Math.min(1, _explQual() / 100));
        return lowVal + (maxVal - lowVal) * pct;
    }

    // ============================================================================
    // 3. STATE
    // ============================================================================
    const S = {
        active: false,
        state: 'IDLE',      // IDLE | EXPLORING | ANCHORED | DEFEAT | ENDED
        faction: null,
        worldSeed: 0,
        chunks: new Map(),  // "cx,cy" -> { cx, cy, island: {...}|null, lastNearAt, generatedAt }
        totalDistanceCovered: 0,
        lastPlayerPos: null,
        shipsDefeated: 0,
        ashore: false,
        anchoredIslandRef: null,
        nextHostileCheckAt: 0,
        rafId: null,
        onCompleteFired: false,
        startedAt: 0,
        // Loot/quest additions
        inventory: {},      // { "Silk": 3, "Gold Coin": 5, ... }
        quest: null,        // { type, desc, reward, ...type-specific fields }
        visitedIslandIds: null // Set — first-visit bonus tracking
    };

    const LOOT_ITEMS = ["Silk", "Spices", "Porcelain", "Timber", "Gold Coin"];
    const _COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    function _compass(angleRad) {
        // atan2's 0 points +X (east) with +Y typically south on a canvas —
        // close enough for flavor text, not a real navigational instrument.
        let deg = (angleRad * 180 / Math.PI + 360) % 360;
        return _COMPASS[Math.round(deg / 22.5) % 16];
    }

    // ============================================================================
    // 4. PROCEDURAL WORLD — islands are stored parametrically (center, a base
    // radius, a phase seed for an organic per-angle radius wobble, and a short
    // decoration list), NOT as a tile raster. A whole chunk is a few floats.
    // Reuses _hash2D (naval_battles.js, bare top-level function — same shared-
    // global-scope convention this codebase already documents and relies on
    // elsewhere) so island placement uses the identical noise primitive the
    // rest of the game's procedural terrain already does.
    // ============================================================================
    function _chunkKey(cx, cy) { return cx + ',' + cy; }
    function _worldToChunk(x, y) {
        return { cx: Math.floor(x / EXPLORE_CFG.chunkSize), cy: Math.floor(y / EXPLORE_CFG.chunkSize) };
    }
    function _chunkCenter(cx, cy) {
        return { x: (cx + 0.5) * EXPLORE_CFG.chunkSize, y: (cy + 0.5) * EXPLORE_CFG.chunkSize };
    }
    function _h2(a, b) {
        // Local wrapper so a missing _hash2D (load-order slip) degrades to
        // Math.random() instead of throwing — generation stays non-crashing,
        // just non-deterministic in that unlikely case.
        if (typeof _hash2D === 'function') return _hash2D(a, b, S.worldSeed);
        return Math.random();
    }

    function _generateIslandDecorations(cx, cy, baseRadius) {
        const count = EXPLORE_CFG.decorMin + Math.floor(_h2(cx * 53 + 1, cy * 59 + 2) * (EXPLORE_CFG.decorMax - EXPLORE_CFG.decorMin));
        const decs = [];
        for (let i = 0; i < count; i++) {
            const a = _h2(cx * 61 + i * 3, cy * 67 + i * 7) * Math.PI * 2;
            const r = baseRadius * (0.12 + _h2(cx * 71 + i * 5, cy * 73 + i * 9) * 0.58);
            decs.push({
                angle: a,
                dist: r,
                kind: _h2(cx * 79 + i * 2, cy * 83 + i * 4) < 0.72 ? 'palm' : 'rock',
                scale: 0.7 + _h2(cx * 89 + i, cy * 97 + i) * 0.6
            });
        }
        return decs;
    }

    function _generateChunk(cx, cy) {
        const roll = _h2(cx * 97 + 11, cy * 131 + 7);
        let island = null;
        if (roll < EXPLORE_CFG.islandChance) {
            const center = _chunkCenter(cx, cy);
            const ox = (_h2(cx * 3 + 1, cy * 5 + 2) - 0.5) * EXPLORE_CFG.chunkSize * 0.6;
            const oy = (_h2(cx * 7 + 3, cy * 11 + 4) - 0.5) * EXPLORE_CFG.chunkSize * 0.6;
            const isMedium = _h2(cx * 13 + 5, cy * 17 + 9) < EXPLORE_CFG.mediumChance;
            const maxR = isMedium ? EXPLORE_CFG.islandMaxRadiusMedium : EXPLORE_CFG.islandMaxRadiusSmall;
            const baseRadius = EXPLORE_CFG.islandMinRadius + _h2(cx * 19 + 2, cy * 23 + 6) * (maxR - EXPLORE_CFG.islandMinRadius);
            island = {
                id: cx + '_' + cy,
                x: center.x + ox,
                y: center.y + oy,
                baseRadius: baseRadius,
                angleSeed: _h2(cx * 29 + 8, cy * 31 + 12) * 1000,
                isMedium: isMedium,
                decorations: _generateIslandDecorations(cx, cy, baseRadius),
                name: _islandName(cx, cy)
            };
        }
        return { cx: cx, cy: cy, island: island, lastNearAt: performance.now(), generatedAt: performance.now() };
    }

    const _ISLAND_SYLLABLES = ["Mao", "Fen", "Lu", "Shan", "Bao", "Xi", "Jia", "Nan", "Kei", "Ryu", "Tho", "Vinh"];
    function _islandName(cx, cy) {
        const a = _ISLAND_SYLLABLES[Math.floor(_h2(cx * 5, cy * 7) * _ISLAND_SYLLABLES.length)];
        const b = _ISLAND_SYLLABLES[Math.floor(_h2(cx * 11, cy * 13) * _ISLAND_SYLLABLES.length)];
        return a + b + " Isle";
    }

    // Organic (non-circular) coastline: base radius perturbed by a few sine
    // harmonics at seeded phases, so every island reads as hand-shaped rather
    // than a perfect disc, at the cost of a handful of Math.sin calls — no
    // stored boundary points, still just the island's own {baseRadius, angleSeed}.
    function _islandRadiusAtAngle(island, angle) {
        const a = angle + island.angleSeed;
        const wob = 1
            + 0.22 * Math.sin(a * 3 + island.angleSeed)
            + 0.12 * Math.sin(a * 5 + island.angleSeed * 1.7)
            + 0.08 * Math.sin(a * 7 + island.angleSeed * 2.3);
        return island.baseRadius * Math.max(0.55, wob);
    }

    function _ensureChunksNear(x, y) {
        const c = _worldToChunk(x, y);
        const R = EXPLORE_CFG.genRadiusChunks;
        const now = performance.now();
        for (let dx = -R; dx <= R; dx++) {
            for (let dy = -R; dy <= R; dy++) {
                const key = _chunkKey(c.cx + dx, c.cy + dy);
                let chunk = S.chunks.get(key);
                if (!chunk) {
                    chunk = _generateChunk(c.cx + dx, c.cy + dy);
                    S.chunks.set(key, chunk);
                }
                chunk.lastNearAt = now;
            }
        }
    }

    // "Getting lost" — chunks outside the keep radius are dropped from memory
    // once (a) the player has sailed far enough overall for culling to be
    // active at all, and (b) enough real time has passed since the player was
    // last near that specific chunk. An island the player is currently
    // anchored at is never eligible, regardless of the above — "doesn't happen
    // until you leave the island for a while."
    function _cullFarChunks(x, y) {
        if (S.totalDistanceCovered < EXPLORE_CFG.minDistanceBeforeCulling) return;
        const c = _worldToChunk(x, y);
        const keepR = Math.round(_tierLerp(EXPLORE_CFG.keepRadiusChunksLOW, EXPLORE_CFG.keepRadiusChunksMAX));
        const graceMs = _tierLerp(EXPLORE_CFG.graceMsLOW, EXPLORE_CFG.graceMsMAX);
        const now = performance.now();
        S.chunks.forEach(function (chunk, key) {
            const d = Math.max(Math.abs(chunk.cx - c.cx), Math.abs(chunk.cy - c.cy));
            if (d <= keepR) return;
            if (now - chunk.lastNearAt < graceMs) return;
            if (S.anchoredIslandRef && chunk.island && chunk.island.id === S.anchoredIslandRef.id) return;
            S.chunks.delete(key);
        });
    }

    // Nearest island to a world point, searching only the small ring of
    // already-generated chunks around it (never a full S.chunks scan).
    function _nearestIsland(x, y) {
        const c = _worldToChunk(x, y);
        let best = null, bestGap = Infinity;
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                const chunk = S.chunks.get(_chunkKey(c.cx + dx, c.cy + dy));
                if (!chunk || !chunk.island) continue;
                const isl = chunk.island;
                const ddx = x - isl.x, ddy = y - isl.y;
                const dist = Math.hypot(ddx, ddy);
                const angle = Math.atan2(ddy, ddx);
                const edgeR = _islandRadiusAtAngle(isl, angle);
                const gap = dist - edgeR;
                if (gap < bestGap) { bestGap = gap; best = { island: isl, dist: dist, angle: angle, edgeR: edgeR, gap: gap }; }
            }
        }
        return best;
    }

    // ============================================================================
    // 5. SHIP + CREW SPAWNING — same object shape generateShips() builds in
    // naval_battles.js and the same deck-spawn layout math this codebase's own
    // custom_naval_launcher.js/naval_merchant_escort.js already used, so
    // anything spawned here slots into navalEnvironment.ships / battleEnvironment
    // .units and is understood immediately by every existing system (AI,
    // rendering, boarding, drowning).
    // ============================================================================
    function _makeShipObject(hull, side, x, y, heading) {
        return {
            side: side, x: x, y: y,
            width: hull.width, height: hull.height,
            color: hull.color, deck: hull.deck,
            mastCount: hull.mastCount, sailScale: hull.sailScale,
            type: hull.name || hull.type || "Ship",
            heading: heading, speed: 0,
            maxSpeed: 3.4, // above MAX_ROW_SPEED (1.8) with room to spare — wind can meaningfully
                           // outrun oars in good air; oars alone cap out well below this, which is
                           // the existing tuned engine's own rowing-vs-sail balance (see naval_battles
                           // .js's SAIL_POWER comment) — deliberately left untouched rather than
                           // re-tuning the shared physics constants for one mode.
            vx: 0, vy: 0,
            rudderAngle: 0, turnRate: 0.007,
            sailAngle: 0, sailTarget: 0, sailTurnSpeed: 0.02,
            _sailManual: false,
            isPlayerControlled: (side === "player")
            // NOTE: _noOars is deliberately NOT set — unlike the old escort
            // ships, exploration ships keep visible, usable oars (naval_battles
            // .js's oar-draw gate is `if (!s._noOars ...)`), matching "rowing is
            // back, for parking/maneuvering."
        };
    }

    function _deckSpawn(rosterArray, side, faction, color, ship, isFlagship) {
        const spawnList = isFlagship ? ["General"].concat(rosterArray) : rosterArray;
        let cols = Math.ceil(Math.sqrt(spawnList.length * (ship.width / ship.height)));
        if (cols < 1) cols = 1;
        let rows = Math.ceil(spawnList.length / cols);
        if (rows < 1) rows = 1;

        const PERSONAL_SPACE = 22;
        const spacingX = Math.min(PERSONAL_SPACE, (ship.width * 0.85) / cols);
        const spacingY = Math.min(PERSONAL_SPACE, (ship.height * 0.85) / rows);
        const blockW = cols * spacingX, blockH = rows * spacingY;

        const _h = ship.heading || 0;
        const _cos = Math.cos(_h), _sin = Math.sin(_h);

        function _onDeckLocal(lx, ly) {
            const rx = ship.width / 2, ry = ship.height / 2;
            return (Math.pow(Math.abs(lx) / rx, 2.5) + Math.pow(Math.abs(ly) / ry, 2.5)) <= 0.90;
        }

        const spawned = [];
        spawnList.forEach(function (unitKey, i) {
            const template = (typeof UnitRoster !== 'undefined' && UnitRoster.allUnits[unitKey]) || UnitRoster.allUnits["Militia"];
            const isCmdr = (unitKey === "General");

            const row = Math.floor(i / cols), col = i % cols;
            let localX = -blockW / 2 + (col * spacingX) + (spacingX / 2) + (Math.random() - 0.5) * (spacingX * 0.4);
            let localY = -blockH / 2 + (row * spacingY) + (spacingY / 2) + (Math.random() - 0.5) * (spacingY * 0.4);
            if (!_onDeckLocal(localX, localY)) {
                for (let attempt = 0; attempt < 50 && !_onDeckLocal(localX, localY); attempt++) {
                    localX = (Math.random() - 0.5) * (ship.width * 0.20);
                    localY = (Math.random() - 0.5) * (ship.height * 0.20);
                }
                if (!_onDeckLocal(localX, localY)) { localX = 0; localY = 0; }
            }
            const px = ship.x + localX * _cos - localY * _sin;
            const py = ship.y + localX * _sin + localY * _cos;

            const unitStats = Object.assign(new Troop(template.name, template.role, template.isLarge, faction), template);
            unitStats.morale = 20; unitStats.maxMorale = 20; unitStats.faction = faction;
            const safeHP = isCmdr ? 200 : (unitStats.health || unitStats.hp || 100);

            let visType = "peasant";
            const roleStr = String(template.role).toLowerCase();
            if (roleStr.includes("cavalry") || roleStr.includes("mounted")) visType = "cavalry";
            else if (roleStr.includes("horse archer")) visType = "horse_archer";
            else if (roleStr.includes("pike") || unitKey.includes("Glaive")) visType = "spearman";
            else if (roleStr.includes("shield")) visType = "sword_shield";
            else if (roleStr.includes("two-handed")) visType = "two_handed";
            else if (roleStr.includes("crossbow")) visType = "crossbow";
            else if (roleStr.includes("firelance")) visType = "firelance";
            else if (roleStr.includes("archer")) visType = "archer";
            else if (roleStr.includes("gun")) visType = "gun";
            else if (roleStr.includes("bomb")) visType = "bomb";
            else if (roleStr.includes("rocket")) visType = "rocket";

            const unit = {
                id: Math.floor(Math.random() * 999999),
                side: side, faction: faction, color: color,
                unitType: isCmdr ? "General" : unitKey,
                isCommander: isCmdr,
                disableAICombat: (side === 'player' && isCmdr),
                stats: unitStats, hp: safeHP, maxHp: safeHP,
                ammo: isCmdr ? (unitStats.ammo || 24) : (unitStats.ammo || (template && template.ammo) || 0),
                renderType: visType,
                x: px, y: py, vx: 0, vy: 0,
                direction: side === "player" ? 1 : -1,
                target: null, state: "idle", spawnMode: "naval",
                animOffset: Math.random() * 100, cooldown: 170, hasOrders: false,
                anim: Math.floor(Math.random() * 100), frame: 0, isMoving: false,
                overboardTimer: 0, drownTimer: 0, isSwimming: false,
                _explShipRef: ship  // which ship this crew member belongs to — lets us tell when
                                     // ONE hostile ship's crew (not the whole session) is wiped
            };
            battleEnvironment.units.push(unit);
            spawned.push(unit);
        });
        return spawned;
    }

    function _hullFor(size) {
        if (typeof SHIP_TYPES !== 'undefined' && SHIP_TYPES[size]) return SHIP_TYPES[size];
        const fallback = {
            LIGHT: { width: 750, height: 300, color: "#3d2418", deck: "#7a5c3a", mastCount: 2, sailScale: 0.50 },
            MEDIUM: { width: 1200, height: 480, color: "#2e1a0f", deck: "#6e5030", mastCount: 2, sailScale: 0.48 }
        };
        return fallback[size] || fallback.MEDIUM;
    }

    // ============================================================================
    // 6. HOSTILE SHIPS — spawn/despawn/outcome. Everything AFTER spawning
    // (approach, ram, circle, grapple, boarding) is the real engine's own
    // updateNavalPhysics() enemy-ship state machine — adding a ship with
    // isPlayerControlled:false to navalEnvironment.ships is the entire
    // integration surface; nothing about combat itself is reimplemented here.
    // ============================================================================
    function _maybeSpawnHostile(now) {
        if (now < S.nextHostileCheckAt) return;
        S.nextHostileCheckAt = now + EXPLORE_CFG.hostileCheckMs;

        const active = navalEnvironment.ships.filter(function (s) { return !s.isPlayerControlled; });
        if (active.length >= EXPLORE_CFG.hostileMaxActive) return;
        if (Math.random() > EXPLORE_CFG.hostileSpawnChance) return;

        const pShip = navalEnvironment.ships.find(function (s) { return s.isPlayerControlled; });
        if (!pShip) return;

        const ang = Math.random() * Math.PI * 2;
        const dist = EXPLORE_CFG.hostileSpawnMinDist + Math.random() * (EXPLORE_CFG.hostileSpawnMaxDist - EXPLORE_CFG.hostileSpawnMinDist);
        const hx = pShip.x + Math.cos(ang) * dist;
        const hy = pShip.y + Math.sin(ang) * dist;

        const pool = FACTIONS.filter(function (f) { return f !== S.faction; });
        const raiderFaction = pool.length ? pool[Math.floor(Math.random() * pool.length)] : S.faction;

        const hull = _hullFor('LIGHT');
        const ship = _makeShipObject(hull, "enemy", hx, hy, ang + Math.PI);
        ship.type = raiderFaction + " Raider";
        navalEnvironment.ships.push(ship);

        const bonus = Math.floor(Math.min(1, S.totalDistanceCovered / EXPLORE_CFG.hostileCrewDistanceBonusAt) * EXPLORE_CFG.hostileCrewDistanceBonus);
        const crewCount = _randInt(EXPLORE_CFG.hostileCrewCountRange[0], EXPLORE_CFG.hostileCrewCountRange[1]) + bonus;
        const unitPool = (typeof getAvailableUnitsForFaction === 'function') ? getAvailableUnitsForFaction(raiderFaction) : ["Militia"];
        const roster = [];
        for (let i = 0; i < crewCount; i++) roster.push(unitPool[Math.floor(Math.random() * unitPool.length)] || "Militia");
        _deckSpawn(roster, "enemy", raiderFaction, _factionColor(raiderFaction), ship, true);
    }

    function _removeShip(ship) {
        battleEnvironment.units = battleEnvironment.units.filter(function (u) { return u._explShipRef !== ship; });
        const idx = navalEnvironment.ships.indexOf(ship);
        if (idx !== -1) navalEnvironment.ships.splice(idx, 1);
    }

    function _despawnFarHostiles(pShip) {
        navalEnvironment.ships.slice().forEach(function (s) {
            if (s.isPlayerControlled || s._grappled) return;
            const d = Math.hypot(s.x - pShip.x, s.y - pShip.y);
            if (d > EXPLORE_CFG.hostileDespawnDist) _removeShip(s);
        });
    }

    // Per-ship (not per-session) outcome check: a hostile ship whose entire
    // spawned crew is dead is sunk/removed individually — exploration keeps
    // going. Only the PLAYER's own crew being wiped ends the voyage.
    function _checkShipOutcomes() {
        navalEnvironment.ships.slice().forEach(function (s) {
            if (s.isPlayerControlled) return;
            const crew = battleEnvironment.units.filter(function (u) { return u._explShipRef === s; });
            if (crew.length && crew.every(function (u) { return u.hp <= 0; })) {
                _removeShip(s);
                S.shipsDefeated++;
                const looted = _grantLoot(_randInt(1, 2));
                _toast("Enemy crew defeated — salvaged " + looted + ".");
                if (S.quest && S.quest.type === 'hunt') {
                    S.quest.progress++;
                }
            }
        });
        const playerAlive = battleEnvironment.units.some(function (u) { return u.side === 'player' && u.hp > 0; });
        if (!playerAlive && S.active) _triggerDeath();
    }

    // ============================================================================
    // 6b. LOOT + PROCEDURAL QUESTS
    // -----------------------------------------------------------------------
    // A single active objective at a time (S.quest) — reach a heading,
    // collect a target item, or sink a number of raider ships — rather than
    // a whole quest-log system. Completing one immediately rolls the next,
    // so there's always something to sail toward. Rewards are loot items
    // (LOOT_ITEMS), spendable at anchor via the Quartermaster panel (see
    // repairShip()/recruitCrew() and naval_exploration_menu.js).
    // ============================================================================
    function _grantLoot(rolls) {
        const gained = [];
        for (let i = 0; i < rolls; i++) {
            const item = LOOT_ITEMS[Math.floor(Math.random() * LOOT_ITEMS.length)];
            const qty = _randInt(1, 3);
            S.inventory[item] = (S.inventory[item] || 0) + qty;
            gained.push(qty + "x " + item);
        }
        return gained.join(", ");
    }

    function _totalLootCount() {
        let total = 0;
        for (const k in S.inventory) total += S.inventory[k];
        return total;
    }

    function _spendLoot(amount) {
        // Spends from whichever items are most plentiful first — no reason to
        // make the player think about which item pays for what.
        let remaining = amount;
        const keys = Object.keys(S.inventory).sort(function (a, b) { return S.inventory[b] - S.inventory[a]; });
        for (let i = 0; i < keys.length && remaining > 0; i++) {
            const take = Math.min(S.inventory[keys[i]], remaining);
            S.inventory[keys[i]] -= take;
            if (S.inventory[keys[i]] <= 0) delete S.inventory[keys[i]];
            remaining -= take;
        }
        return remaining === 0;
    }

    function _generateQuest() {
        const pShip = navalEnvironment.ships.find(function (s) { return s.isPlayerControlled; });
        const px = pShip ? pShip.x : 0, py = pShip ? pShip.y : 0;
        const roll = Math.random();
        if (roll < 0.34) {
            const ang = Math.random() * Math.PI * 2;
            const dist = 3000 + Math.random() * 4000;
            return {
                type: 'waypoint',
                x: px + Math.cos(ang) * dist, y: py + Math.sin(ang) * dist,
                radius: 350,
                desc: "Chart the waters to the " + _compass(ang),
                reward: 2
            };
        } else if (roll < 0.67) {
            const n = _randInt(1, 3);
            return { type: 'hunt', target: n, progress: 0, desc: "Sink " + n + " raider ship" + (n > 1 ? "s" : ""), reward: n + 1 };
        } else {
            const item = LOOT_ITEMS[Math.floor(Math.random() * LOOT_ITEMS.length)];
            const n = _randInt(3, 6);
            return { type: 'collect', item: item, target: n, desc: "Gather " + n + "x " + item, reward: 2 };
        }
    }

    function _updateQuest() {
        if (!S.quest) {
            S.quest = _generateQuest();
            _toast("New heading set: " + S.quest.desc);
            return;
        }
        const q = S.quest;
        let done = false;
        if (q.type === 'waypoint') {
            const pShip = navalEnvironment.ships.find(function (s) { return s.isPlayerControlled; });
            if (pShip && Math.hypot(pShip.x - q.x, pShip.y - q.y) < q.radius) done = true;
        } else if (q.type === 'collect') {
            if ((S.inventory[q.item] || 0) >= q.target) done = true;
        } else if (q.type === 'hunt') {
            if (q.progress >= q.target) done = true;
        }
        if (done) {
            const looted = _grantLoot(q.reward);
            _toast("Objective complete — " + looted + ".");
            S.quest = null;
        }
    }

    // First-time anchoring at a given island grants a small charting bonus —
    // rewards actually stopping to explore, not just sailing past.
    function _maybeGrantIslandDiscoveryBonus(island) {
        if (!S.visitedIslandIds) S.visitedIslandIds = new Set();
        if (S.visitedIslandIds.has(island.id)) return;
        S.visitedIslandIds.add(island.id);
        const looted = _grantLoot(1);
        _toast("First landing on " + island.name + " — found " + looted + ".");
    }

    // ============================================================================
    // 7. ISLAND COLLISION + ANCHORING
    // ============================================================================
    function _resolveShipIslandCollision(ship) {
        const found = _nearestIsland(ship.x, ship.y);
        if (!found) return null;
        const hullMargin = Math.max(ship.width, ship.height) * 0.42;
        const minDist = found.edgeR + hullMargin;
        if (found.dist < minDist) {
            const nx = Math.cos(found.angle), ny = Math.sin(found.angle);
            const push = minDist - found.dist;
            ship.x += nx * push;
            ship.y += ny * push;
            const vDotN = (ship.vx || 0) * nx + (ship.vy || 0) * ny;
            if (vDotN < 0) { ship.vx -= vDotN * nx; ship.vy -= vDotN * ny; }
            ship.angularVelocity = (ship.angularVelocity || 0) * 0.6; // impact feels heavier, not springy
        }
        return found;
    }

    function _tryAnchor() {
        if (S.state !== 'EXPLORING') { _toast("Nothing to anchor by right now."); return; }
        const pShip = navalEnvironment.ships.find(function (s) { return s.isPlayerControlled; });
        if (!pShip) return;
        if (Math.hypot(pShip.vx || 0, pShip.vy || 0) > EXPLORE_CFG.anchorMaxSpeed) {
            _toast("Too much way on — slow down first.");
            return;
        }
        const found = _nearestIsland(pShip.x, pShip.y);
        if (!found || found.gap > EXPLORE_CFG.anchorRange) {
            _toast("No island close enough to anchor by.");
            return;
        }
        pShip._explAnchored = true;
        pShip.vx = 0; pShip.vy = 0; pShip.angularVelocity = 0; pShip.speed = 0;
        S.anchoredIslandRef = found.island;
        S.state = 'ANCHORED';
        _toast("Anchor dropped off " + found.island.name + ".");
        _maybeGrantIslandDiscoveryBonus(found.island);
    }

    function _weighAnchor() {
        const pShip = navalEnvironment.ships.find(function (s) { return s.isPlayerControlled; });
        if (pShip) pShip._explAnchored = false;
        S.anchoredIslandRef = null;
        S.ashore = false;
        S.state = 'EXPLORING';
        _toast("Anchor up.");
    }

    function _tryDisembark() {
        if (S.state !== 'ANCHORED' || S.ashore) return;
        S.ashore = true;
        _toast("Stepping ashore on " + (S.anchoredIslandRef ? S.anchoredIslandRef.name : "the island") + "...");
    }

    function _returnToShip() {
        if (!S.ashore) return;
        const pShip = navalEnvironment.ships.find(function (s) { return s.isPlayerControlled; });
        S.ashore = false;
        if (pShip && typeof window.player !== 'undefined' && window.player) {
            player.x = pShip.x; player.y = pShip.y;
        }
        _toast("Back aboard.");
    }

    // ============================================================================
    // 7b. QUARTERMASTER — the only thing loot is actually FOR. No second party
    // to trade with out on open water, so "trade" here means spending
    // collected loot on your own ship/crew rather than bartering with anyone
    // — reachable only while anchored (naval_exploration_menu.js renders the
    // panel; these two are what its buttons call).
    // ============================================================================
    const QUARTERMASTER_REPAIR_COST = 3;
    const QUARTERMASTER_RECRUIT_COST = 5;
    const QUARTERMASTER_MAX_CREW = 14;

    function repairShip() {
        if (S.state !== 'ANCHORED') { _toast("Must be anchored to resupply."); return false; }
        if (_totalLootCount() < QUARTERMASTER_REPAIR_COST) { _toast("Not enough loot to resupply (need " + QUARTERMASTER_REPAIR_COST + ")."); return false; }
        _spendLoot(QUARTERMASTER_REPAIR_COST);
        battleEnvironment.units.forEach(function (u) {
            if (u.side === 'player' && u.hp > 0) {
                u.hp = u.maxHp;
                if (typeof u.ammo === 'number' && u.stats && typeof u.stats.ammo === 'number') u.ammo = u.stats.ammo;
            }
        });
        _toast("Crew patched up and resupplied.");
        return true;
    }

    function recruitCrew() {
        if (S.state !== 'ANCHORED') { _toast("Must be anchored to recruit."); return false; }
        const crewCount = battleEnvironment.units.filter(function (u) { return u.side === 'player' && u.hp > 0; }).length;
        if (crewCount >= QUARTERMASTER_MAX_CREW) { _toast("No more room aboard."); return false; }
        if (_totalLootCount() < QUARTERMASTER_RECRUIT_COST) { _toast("Not enough loot to recruit (need " + QUARTERMASTER_RECRUIT_COST + ")."); return false; }
        const pShip = navalEnvironment.ships.find(function (s) { return s.isPlayerControlled; });
        if (!pShip) return false;
        _spendLoot(QUARTERMASTER_RECRUIT_COST);
        const unitPool = (typeof getAvailableUnitsForFaction === 'function') ? getAvailableUnitsForFaction(S.faction) : ["Militia"];
        const pick = unitPool[Math.floor(Math.random() * unitPool.length)] || "Militia";
        _deckSpawn([pick], "player", S.faction, _factionColor(S.faction), pShip, false);
        _toast("A " + pick + " signs aboard.");
        return true;
    }

    // ============================================================================
    // 8. RENDERING — hooked in by wrapping the real engine's own
    // drawNavalBackground() (a bare top-level function in naval_battles.js;
    // wrapping a shared top-level function like this is the same technique
    // optimization-mobile-battles.js already uses on initNavalBattle, per that
    // file's own comments) so islands paint into the exact same already-
    // transformed ctx the ocean/ships/waves do, in the correct draw order
    // (after the ocean fill, before ships), with zero changes to naval_battles.js
    // itself.
    // ============================================================================
    function _neutralizeBackgroundCache() {
        // navalBackgroundCache is `let`-declared at naval_battles.js's top
        // level; classic <script> tags on this page share that lexical scope
        // (the same assumption custom_naval_launcher.js's own bare
        // `navalBackgroundCache = null;` reset already relies on). Pre-filling
        // it here means drawNavalBackground()'s `if (!navalBackgroundCache)`
        // guard is false, so its per-tile loop — sized off BATTLE_COLS×
        // BATTLE_ROWS, which we deliberately do NOT scale to this mode's huge
        // world — never runs against our tiny dummy grid.
        const c = document.createElement('canvas');
        c.width = 2; c.height = 2;
        navalBackgroundCache = c; // bare identifier — see comment above
    }

    let _bgPatched = false;
    function _installBackgroundHook() {
        if (_bgPatched) return;
        if (typeof drawNavalBackground !== 'function') return;
        _bgPatched = true;
        const _orig = drawNavalBackground;
        drawNavalBackground = function (ctx) { // bare reassignment — same pattern as the wrap above
            _orig(ctx);
            if (S.active) _drawWorld(ctx);
        };
    }

    function _drawWorld(ctx) {
        const cw = window.innerWidth, ch = window.innerHeight;
        const z = (typeof zoom === 'number' && zoom > 0) ? zoom : 1;
        const px = (typeof player !== 'undefined' && player) ? player.x : 0;
        const py = (typeof player !== 'undefined' && player) ? player.y : 0;
        const halfW = (cw / 2) / z + 500, halfH = (ch / 2) / z + 500;
        const minX = px - halfW, maxX = px + halfW, minY = py - halfH, maxY = py + halfH;

        const c1 = _worldToChunk(minX, minY), c2 = _worldToChunk(maxX, maxY);
        for (let cx = c1.cx; cx <= c2.cx; cx++) {
            for (let cy = c1.cy; cy <= c2.cy; cy++) {
                const chunk = S.chunks.get(_chunkKey(cx, cy));
                if (chunk && chunk.island) _drawIsland(ctx, chunk.island);
            }
        }

        if (S.quest && S.quest.type === 'waypoint') _drawWaypointMarker(ctx, S.quest, px, py, cw, ch, z);
    }

    function _drawWaypointMarker(ctx, q, px, py, cw, ch, z) {
        const dx = q.x - px, dy = q.y - py;
        const dist = Math.hypot(dx, dy);
        const onScreenX = cw / 2 + dx * z, onScreenY = ch / 2 + dy * z;
        const margin = 60;
        const inView = onScreenX > margin && onScreenX < cw - margin && onScreenY > margin && onScreenY < ch - margin;

        ctx.save();
        if (inView) {
            // Pulsing ring directly on the target, in world space (ctx is
            // already camera-transformed by the caller).
            const pulse = 1 + 0.15 * Math.sin((window.time || 0) * 2.4);
            ctx.strokeStyle = "rgba(245, 215, 110, 0.85)";
            ctx.lineWidth = 3 / z;
            ctx.beginPath();
            ctx.arc(q.x, q.y, q.radius * pulse, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
        // Screen-space edge arrow is drawn by the HUD layer (DOM), not here —
        // see _updateHUD()'s compass line, which reads distance/heading off
        // this same quest object without needing a second canvas pass.
    }

    const _ISLAND_STEPS = 26;
    function _drawIsland(ctx, isl) {
        ctx.save();
        // Beach ring (full radius) — matches navalEnvironment.landColor's
        // existing Coastal-map sand tone, so this reads as consistent with
        // the rest of the game's naval palette.
        ctx.fillStyle = "#c2a672";
        ctx.beginPath();
        for (let i = 0; i <= _ISLAND_STEPS; i++) {
            const a = (i / _ISLAND_STEPS) * Math.PI * 2;
            const r = _islandRadiusAtAngle(isl, a);
            const x = isl.x + Math.cos(a) * r, y = isl.y + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();

        // Green interior, slightly inset so the sand ring shows all around.
        ctx.fillStyle = "#5c7a3a";
        ctx.beginPath();
        for (let i = 0; i <= _ISLAND_STEPS; i++) {
            const a = (i / _ISLAND_STEPS) * Math.PI * 2;
            const r = _islandRadiusAtAngle(isl, a) * 0.82;
            const x = isl.x + Math.cos(a) * r, y = isl.y + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        isl.decorations.forEach(function (d) {
            const x = isl.x + Math.cos(d.angle) * d.dist;
            const y = isl.y + Math.sin(d.angle) * d.dist;
            if (d.kind === 'palm') _drawPalm(ctx, x, y, d.scale);
            else _drawRock(ctx, x, y, d.scale);
        });

        if (S.anchoredIslandRef && S.anchoredIslandRef.id === isl.id) {
            ctx.save();
            ctx.font = "bold 22px Georgia, serif";
            ctx.fillStyle = "#f5d76e";
            ctx.textAlign = "center";
            ctx.shadowColor = "rgba(0,0,0,0.7)";
            ctx.shadowBlur = 4;
            ctx.fillText(isl.name, isl.x, isl.y - isl.baseRadius - 26);
            ctx.restore();
        }
    }

    function _drawPalm(ctx, x, y, scale) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.strokeStyle = "#5a3d1f";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 14);
        ctx.quadraticCurveTo(4, -4, 2, -20);
        ctx.stroke();
        ctx.fillStyle = "#3f6b2a";
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            ctx.save();
            ctx.translate(2, -20);
            ctx.rotate(a);
            ctx.beginPath();
            ctx.ellipse(10, 0, 13, 4.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }

    function _drawRock(ctx, x, y, scale) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.fillStyle = "rgba(0,0,0,0.20)";
        ctx.beginPath(); ctx.ellipse(2, 4, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#7a7a72";
        ctx.beginPath(); ctx.ellipse(0, 0, 10, 7, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#8f8f86";
        ctx.beginPath(); ctx.ellipse(-3, -2, 5, 3.5, 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    // ============================================================================
    // 9. HUD + TOASTS (lightweight DOM overlay — matches this codebase's own
    // "always-on-top button" convention from naval_escort_menu.js's Abandon
    // Voyage button, rather than hand-rolled canvas text).
    // ============================================================================
    let _hud = null, _toastEl = null, _toastTimer = null, _promptEl = null, _questEl = null, _qmBtn = null;

    function _buildHUD() {
        _hud = document.createElement('div');
        _hud.id = 'naval-exploration-hud';
        _hud.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);" +
            "z-index:11400;font-family:Georgia,serif;color:#f0d9a8;background:rgba(20,12,4,0.72);" +
            "border:1px solid #d4b886;border-radius:4px;padding:6px 16px;font-size:13px;" +
            "text-align:center;pointer-events:none;white-space:nowrap;";
        document.body.appendChild(_hud);

        _toastEl = document.createElement('div');
        _toastEl.id = 'naval-exploration-toast';
        _toastEl.style.cssText = "position:fixed;top:56px;left:50%;transform:translateX(-50%);" +
            "z-index:11400;font-family:Georgia,serif;color:#fff;background:rgba(20,12,4,0.85);" +
            "border:1px solid #d4b886;border-radius:4px;padding:6px 14px;font-size:13px;" +
            "text-align:center;pointer-events:none;opacity:0;transition:opacity 0.3s;";
        document.body.appendChild(_toastEl);

        _promptEl = document.createElement('button');
        _promptEl.id = 'naval-exploration-prompt';
        _promptEl.style.cssText = "position:fixed;bottom:110px;left:50%;transform:translateX(-50%);" +
            "z-index:11400;font-family:Georgia,serif;font-weight:bold;color:#f5d76e;" +
            "background:linear-gradient(to bottom,#7b1a1a,#4a0a0a);border:2px solid #d4b886;" +
            "border-radius:4px;padding:10px 22px;font-size:14px;display:none;cursor:pointer;";
        _promptEl.onclick = function () { _onPromptClick(); };
        document.body.appendChild(_promptEl);

        _questEl = document.createElement('div');
        _questEl.id = 'naval-exploration-quest';
        _questEl.style.cssText = "position:fixed;top:44px;left:50%;transform:translateX(-50%);" +
            "z-index:11400;font-family:Georgia,serif;color:#c8e6c9;background:rgba(20,12,4,0.72);" +
            "border:1px solid #4a3a2a;border-radius:4px;padding:4px 14px;font-size:12px;" +
            "text-align:center;pointer-events:none;white-space:nowrap;";
        document.body.appendChild(_questEl);

        _qmBtn = document.createElement('button');
        _qmBtn.id = 'naval-exploration-quartermaster-btn';
        _qmBtn.innerText = "🎒 Quartermaster";
        _qmBtn.style.cssText = "position:fixed;bottom:110px;right:16px;" +
            "z-index:11400;font-family:Georgia,serif;font-weight:bold;color:#f0d9a8;" +
            "background:rgba(20,12,4,0.85);border:1px solid #d4b886;" +
            "border-radius:4px;padding:8px 14px;font-size:12px;display:none;cursor:pointer;";
        _qmBtn.onclick = function () {
            if (typeof window.showNavalQuartermaster === 'function') window.showNavalQuartermaster();
        };
        document.body.appendChild(_qmBtn);
    }

    function _teardownHUD() {
        [_hud, _toastEl, _promptEl, _questEl, _qmBtn].forEach(function (el) { if (el && el.parentNode) el.parentNode.removeChild(el); });
        _hud = _toastEl = _promptEl = _questEl = _qmBtn = null;
    }

    function _toast(msg) {
        if (!_toastEl) return;
        _toastEl.textContent = msg;
        _toastEl.style.opacity = '1';
        if (_toastTimer) clearTimeout(_toastTimer);
        _toastTimer = setTimeout(function () { if (_toastEl) _toastEl.style.opacity = '0'; }, 3200);
    }

    function _onPromptClick() {
        if (S.ashore) _returnToShip();
        else if (S.state === 'ANCHORED') _tryDisembark();
        else if (S.state === 'EXPLORING') _tryAnchor();
    }

    function _inventorySummary() {
        const keys = Object.keys(S.inventory);
        if (!keys.length) return "no cargo";
        return keys.map(function (k) { return S.inventory[k] + "x " + k; }).join(", ");
    }

    function _updateHUD() {
        if (!_hud) return;
        const nm = S.anchoredIslandRef ? (" — anchored off " + S.anchoredIslandRef.name) : "";
        _hud.textContent = S.faction + " · " + Math.round(S.totalDistanceCovered).toLocaleString() +
            "px sailed · " + S.shipsDefeated + " ships defeated" + nm;

        if (_questEl) {
            let questLine = "";
            if (S.quest) {
                questLine = "🧭 " + S.quest.desc;
                if (S.quest.type === 'waypoint') {
                    const pShip = navalEnvironment.ships.find(function (s) { return s.isPlayerControlled; });
                    if (pShip) {
                        const d = Math.hypot(S.quest.x - pShip.x, S.quest.y - pShip.y);
                        questLine += "  (" + Math.round(d).toLocaleString() + "px, bearing " + _compass(Math.atan2(S.quest.y - pShip.y, S.quest.x - pShip.x)) + ")";
                    }
                } else if (S.quest.type === 'hunt') {
                    questLine += "  (" + S.quest.progress + "/" + S.quest.target + ")";
                } else if (S.quest.type === 'collect') {
                    questLine += "  (" + Math.min(S.quest.target, S.inventory[S.quest.item] || 0) + "/" + S.quest.target + ")";
                }
            }
            _questEl.textContent = questLine + "   ·   🎒 " + _inventorySummary();
        }

        if (_qmBtn) _qmBtn.style.display = (S.state === 'ANCHORED') ? 'block' : 'none';

        if (!_promptEl) return;
        if (S.ashore) { _promptEl.style.display = 'block'; _promptEl.textContent = "⛵ Return to Ship"; return; }
        if (S.state === 'ANCHORED') { _promptEl.style.display = 'block'; _promptEl.textContent = "🏝️ Step Ashore  (or press E to weigh anchor)"; return; }
        if (S.state === 'EXPLORING') {
            const pShip = navalEnvironment.ships.find(function (s) { return s.isPlayerControlled; });
            const found = pShip ? _nearestIsland(pShip.x, pShip.y) : null;
            if (found && found.gap <= EXPLORE_CFG.anchorRange) {
                _promptEl.style.display = 'block'; _promptEl.textContent = "⚓ Drop Anchor";
                return;
            }
        }
        _promptEl.style.display = 'none';
    }

    // ============================================================================
    // 10. MINIMAP SUPPRESSION — "no minimap for this specific minigame."
    // minimap.js wasn't among the files provided when this was written, so its
    // exact DOM id/class is unknown; this sweeps for anything minimap-flavored
    // by id/class (case-insensitive substring) and force-hides it while active,
    // restoring on exit. If minimap.js is shared later this can be swapped for
    // an exact, single toggle call instead of a sweep.
    // ============================================================================
    let _minimapSweepId = null;
    function _setMinimapHidden(on) {
        if (_minimapSweepId) { clearInterval(_minimapSweepId); _minimapSweepId = null; }
        if (!on) {
            document.querySelectorAll('[data-navexpl-hidden="1"]').forEach(function (el) {
                el.style.removeProperty('display');
                el.removeAttribute('data-navexpl-hidden');
            });
            return;
        }
        _minimapSweepId = setInterval(function () {
            if (!S.active) return;
            document.querySelectorAll('[id*="minimap" i]:not([data-navexpl-hidden]), [class*="minimap" i]:not([data-navexpl-hidden])').forEach(function (el) {
                el.setAttribute('data-navexpl-hidden', '1');
                el.style.setProperty('display', 'none', 'important');
            });
        }, 500);
    }

    // ============================================================================
    // 11. INPUT
    // ============================================================================
    // Shared by the 'P' key below AND naval_exploration_menu.js's "Return to
    // Port" button (window.NavalExplorationMode.confirmReturnToPort), so
    // there's exactly one confirmation flow instead of two that could drift
    // apart. NOT wired to the engine's own generic P-exit handler — that
    // branch is explicitly disabled for this mode (see sandboxmode_update.js
    // — same guard shape as Survival Mode's) because it assumes a battle with
    // a real starting enemy count and treated "zero enemies" (true from the
    // first frame here) as an instant, unrequested "Victory."
    function _confirmReturnToPort() {
        if (!S.active) return;
        if (!window.confirm("Turn back for port and end this voyage?")) return;
        _endExploration('ended');
    }

    let _inputInstalled = false;
    function _installInputHandlers() {
        if (_inputInstalled) return;
        _inputInstalled = true;
        window.addEventListener('keydown', function (e) {
            if (!S.active) return;
            if (e.code === 'KeyE' || e.key === 'e' || e.key === 'E') {
                if (S.ashore) _returnToShip();
                else if (S.state === 'ANCHORED') _weighAnchor();
                else if (S.state === 'EXPLORING') _tryAnchor();
                e.preventDefault();
            } else if (e.code === 'KeyP' || e.key === 'p' || e.key === 'P') {
                _confirmReturnToPort();
                e.preventDefault();
            }
        });
    }

    // ============================================================================
    // 12. MAIN TICK — runs in its own requestAnimationFrame loop, alongside
    // (not instead of) the game's own main loop. The main loop already drives
    // real physics/combat/rendering once inBattleMode/inNavalBattle are true
    // (see the header note); this tick only owns what the base engine has no
    // concept of — chunk streaming, island collision, hostile spawn/despawn,
    // per-ship outcome checks, and the HUD.
    // ============================================================================
    function _tick() {
        if (!S.active) return;

        // Ship-hull rendering (_drawSingleNavalShip, naval_battles.js) reads a
        // bare top-level `time` for its oar-draw call. In a normal battle that
        // binding is provided by a core file this mode doesn't go through, so
        // without this line every frame throws "time is not defined" the
        // instant a ship with visible oars is drawn (every exploration ship —
        // unlike the old escort mode, oars are deliberately left on here) —
        // aborting that frame's render mid-ship and, because nothing catches
        // it, skipping everything the main draw() call was going to do AFTER
        // that point too (see the fuller note in start()). Set as a real
        // window property (not a local var/let) because this whole file is
        // wrapped in an IIFE — a bare var/let here would be scoped to this
        // closure, not shared script-top-level, and unqualified identifier
        // lookups from other classic scripts fall through to window's own
        // properties regardless of strict mode, so this is reachable as a
        // bare `time` from naval_battles.js either way.
        window.time = Date.now() / 1000;

        const pShip = navalEnvironment.ships.find(function (s) { return s.isPlayerControlled; });
        if (pShip) {
            if (S.lastPlayerPos) {
                S.totalDistanceCovered += Math.hypot(pShip.x - S.lastPlayerPos.x, pShip.y - S.lastPlayerPos.y);
            }
            S.lastPlayerPos = { x: pShip.x, y: pShip.y };

            _ensureChunksNear(pShip.x, pShip.y);
            _cullFarChunks(pShip.x, pShip.y);

            navalEnvironment.ships.forEach(function (s) { _resolveShipIslandCollision(s); });
            navalEnvironment.ships.forEach(function (s) {
                if (s._explAnchored) { s.vx = 0; s.vy = 0; s.angularVelocity = 0; s.speed = 0; }
            });

            const now = performance.now();
            _maybeSpawnHostile(now);
            _despawnFarHostiles(pShip);
            _checkShipOutcomes();
            if (S.state === 'EXPLORING' || S.state === 'ANCHORED') _updateQuest();
        }

        _updateHUD();
        S.rafId = requestAnimationFrame(_tick);
    }

    // ============================================================================
    // 13. START / STOP / END
    // ============================================================================
    function start(opts) {
        opts = opts || {};
        if (typeof battleEnvironment === 'undefined' || typeof navalEnvironment === 'undefined') {
            console.warn('[NavalExplorationMode] naval_battles.js does not appear to be loaded — cannot start.');
            return false;
        }
        stop();

        if (typeof window.cleanupCustomBattleEnvironments === 'function') window.cleanupCustomBattleEnvironments();

        S.active = true;
        S.state = 'EXPLORING';
        S.faction = opts.faction || FACTIONS[0];
        S.worldSeed = (Date.now() & 0xffffffff) >>> 0;
        S.chunks = new Map();
        S.totalDistanceCovered = 0;
        S.shipsDefeated = 0;
        S.ashore = false;
        S.anchoredIslandRef = null;
        S.onCompleteFired = false;
        S.startedAt = performance.now();
        S.inventory = {};
        S.quest = null;
        S.visitedIslandIds = new Set();

        // Mode guard other files check for — see sandboxmode_update.js's P-exit
        // handler and leave_battle_roster.js's leaveBattlefield override, both
        // of which now skip their generic (campaign/arena-battle-shaped) logic
        // whenever this is true, the same way they already do for
        // window.__IS_SURVIVAL_BATTLE__.
        window.__IS_NAVAL_EXPLORATION__ = true;

        _installBackgroundHook();
        _neutralizeBackgroundCache();

        // Sails render on their own separate overlay canvas (#navalSailCanvas,
        // naval_sailing_cosmetics.js) with its own self-contained RAF loop —
        // completely independent of the main canvas / drawNavalShips. That
        // overlay only exists once initSailCanvas() has been called (normally
        // done inside initNavalBattle(), which this mode deliberately never
        // calls — see the file header). Without this, navalEnvironment
        // .sailCanvas stays null forever and no sail ever appears, regardless
        // of anything else in this file. initSailCanvas() starts its own loop
        // internally, so nothing further is needed here — see stop() for the
        // matching teardown.
        if (typeof initSailCanvas === 'function') initSailCanvas();

        window.BATTLE_TILE_SIZE = (typeof BATTLE_TILE_SIZE !== 'undefined' && BATTLE_TILE_SIZE) ? BATTLE_TILE_SIZE : 8;
        BATTLE_WORLD_WIDTH = EXPLORE_CFG.worldExtent;
        BATTLE_WORLD_HEIGHT = EXPLORE_CFG.worldExtent;
        // Deliberately NOT derived from BATTLE_WORLD_WIDTH/TILE_SIZE — kept tiny
        // and decoupled so nothing ever tries to allocate a grid at world scale.
        // See the file header for the full reasoning + the guarded-access audit
        // this relies on.
        BATTLE_COLS = 8;
        BATTLE_ROWS = 8;

        if (typeof window.battleEnvironment === 'undefined' || !window.battleEnvironment) window.battleEnvironment = {};
        battleEnvironment.units = [];
        battleEnvironment.projectiles = [];
        battleEnvironment.groundEffects = [];
        battleEnvironment.grid = Array.from({ length: BATTLE_COLS }, function () { return Array(BATTLE_ROWS).fill(11); });
        battleEnvironment.groundColor = "#1a3344";
        battleEnvironment.bgCanvas = null;
        battleEnvironment.fgCanvas = null;
        battleEnvironment.treeFrontCanvas = null;
        battleEnvironment.cityGates = [];

        navalEnvironment.mapType = "Ocean";
        navalEnvironment.waterColor = "#1a3344";
        navalEnvironment.landColor = "#c2a672";
        navalEnvironment.ships = [];
        navalEnvironment.waves = [];
        navalEnvironment.fishes = [];
        navalEnvironment.seagulls = [];
        navalEnvironment.mapSeed = S.worldSeed;
        navalEnvironment.wind = {
            angle: Math.random() * Math.PI * 2,
            speed: 0.35 + Math.random() * 0.35,
            targetAngle: 0, targetSpeed: 0.5,
            shiftTimer: 600 + Math.floor(Math.random() * 600),
            shiftInterval: 3600,
            gustTimer: 0
        };
        window._navalWindAngle = navalEnvironment.wind.angle;
        window._navalWindSpeed = navalEnvironment.wind.speed;
        window.gotRammed = false;

        const startX = EXPLORE_CFG.worldExtent / 2, startY = EXPLORE_CFG.worldExtent / 2;
        const hull = _hullFor('MEDIUM');
        const pShip = _makeShipObject(hull, "player", startX, startY, Math.random() * Math.PI * 2);
        pShip.type = S.faction + " Explorer";
        navalEnvironment.ships.push(pShip);

        const crewCount = _randInt(EXPLORE_CFG.crewCountRange[0], EXPLORE_CFG.crewCountRange[1]);
        const unitPool = (typeof getAvailableUnitsForFaction === 'function') ? getAvailableUnitsForFaction(S.faction) : ["Militia"];
        const roster = [];
        for (let i = 0; i < crewCount; i++) roster.push(unitPool[Math.floor(Math.random() * unitPool.length)] || "Militia");
        _deckSpawn(roster, "player", S.faction, _factionColor(S.faction), pShip, true);

        if (typeof window.player === 'undefined' || !window.player) {
            window.player = {
                x: pShip.x, y: pShip.y, hp: 150, maxHealth: 150,
                baseSpeed: 23, speed: 23, faction: S.faction,
                state: "idle", frame: 0, direction: 1, isMoving: false,
                stunTimer: 0, onWall: false, roster: []
            };
        }
        const cmdr = battleEnvironment.units.find(function (u) { return u.isCommander && u.side === 'player'; });
        if (cmdr) {
            player.x = cmdr.x; player.y = cmdr.y;
            player.hp = cmdr.hp; player.maxHealth = cmdr.maxHp;
            player.ammo = cmdr.ammo; player.weaponMode = 'ranged';
            player.state = "idle"; player.isMoving = false;
        }
        if (typeof window.camera === 'undefined' || !window.camera) {
            window.camera = {
                get x() { return (typeof player !== 'undefined' && player) ? player.x - (window.innerWidth / 2 / (typeof zoom !== 'undefined' && zoom ? zoom : 1)) : 0; },
                get y() { return (typeof player !== 'undefined' && player) ? player.y - (window.innerHeight / 2 / (typeof zoom !== 'undefined' && zoom ? zoom : 1)) : 0; },
                get width() { return window.innerWidth / (typeof zoom !== 'undefined' && zoom ? zoom : 1); },
                get height() { return window.innerHeight / (typeof zoom !== 'undefined' && zoom ? zoom : 1); }
            };
        }
        if (typeof window.zoom !== 'number' || !window.zoom) window.zoom = 0.35;

        currentBattleData = { // bare — see custom_naval_launcher.js's own identical bare assignment + comment
            playerFaction: S.faction, enemyFaction: "Raiders",
            playerColor: _factionColor(S.faction), enemyColor: "#7a1f1f",
            initialCounts: { player: roster.length + 1, enemy: 0 }
        };

        inBattleMode = true; // bare — see custom_naval_launcher.js's identical bare assignment + comment
        window.inBattleMode = true;
        window.inNavalBattle = true;
        window.__preDeploymentActive = false;
        window._navalBoardingTimer = false;

        _ensureChunksNear(pShip.x, pShip.y);
        S.lastPlayerPos = { x: pShip.x, y: pShip.y };

        const canvas = document.getElementById(opts.canvasId || 'gameCanvas');
        if (canvas) {
            canvas.style.display = 'block';
            canvas.style.visibility = 'visible';
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }

        if (typeof AudioManager !== 'undefined') {
            AudioManager.init();
            AudioManager.playMP3('music/battlemusic.mp3', false);
        }

        // Prime `time` synchronously — _tick() (which refreshes it every
        // frame from here on) hasn't run yet at this point, but the draw()
        // call two lines down is synchronous and would hit the same crash
        // _tick()'s comment above describes on this very first frame otherwise.
        window.time = Date.now() / 1000;

        window.isPaused = false;
        if (!window.__battleLoopStarted) {
            window.__battleLoopStarted = true;
            if (typeof draw === 'function') draw();
        }

        (function _forceHelmWithFallbacks() {
            function _tryForce() { if (window.NavalHelmUI && window.inNavalBattle) window.NavalHelmUI.forceNavalHelm(); }
            _tryForce();
            setTimeout(_tryForce, 100);
            setTimeout(_tryForce, 400);
            setTimeout(_tryForce, 1000);
        })();

        _buildHUD();
        _installInputHandlers();
        _setMinimapHidden(true);
        _toast("Faction chosen: " + S.faction + ". Press E (or the on-screen button) to anchor near land.");
        _showIntroDialogue();

        S.nextHostileCheckAt = performance.now() + EXPLORE_CFG.hostileCheckMs;
        S.rafId = requestAnimationFrame(_tick);
        return true;
    }

    // Borrowed wholesale rather than reimplemented — window.StoryPresentation
    // (storymode_presentation.js) is the same dialogue box the campaign uses,
    // just called with a few narrator-only lines instead of a scripted scene.
    // Fire-and-forget: sailing/physics are already running underneath it, so
    // there's nothing to resume afterward.
    function _showIntroDialogue() {
        if (typeof window.StoryPresentation === 'undefined' || !window.StoryPresentation || typeof window.StoryPresentation.showDialogue !== 'function') return;
        window.StoryPresentation.showDialogue([
            { name: "Narrator", narrator: true, text: "The " + S.faction + " banner snaps taut as your ship clears the harbor mouth, bound for open water." },
            { name: "Narrator", narrator: true, text: "No map exists out here — only what you can see. Small islands and raider sails will resolve out of the haze as you close on them." },
            { name: "Narrator", narrator: true, text: "Trim to the wind to make way; row to close distance, dock, or hold position. Anchor near land (E, or the on-screen prompt) to go ashore." },
            { name: "Narrator", narrator: true, text: "Sink raiders and land on new islands for salvage — spend it with your Quartermaster while at anchor. Chart what you can; the sea forgets what's left too far behind." }
        ], { letterbox: true });
    }

    function stop() {
        S.active = false;
        if (S.rafId) { cancelAnimationFrame(S.rafId); S.rafId = null; }
        _setMinimapHidden(false);
        _teardownHUD();
        if (typeof cleanupNavalSailCanvas === 'function') cleanupNavalSailCanvas();
        window.inNavalBattle = false;
        window._navalBoardingTimer = false;
        window.__IS_NAVAL_EXPLORATION__ = false;
        S.state = 'IDLE';
    }

    // Voluntary end only (Return to Port / P / the button) — always a plain
    // summary, never a win/loss judgment, since this mode has no victory
    // condition. Actual crew death goes through _triggerDeath() below instead,
    // which never calls this.
    function _endExploration(result) {
        if (S.onCompleteFired) return;
        S.onCompleteFired = true;
        S.state = 'ENDED';
        const detail = {
            result: result,
            faction: S.faction,
            distanceCovered: Math.round(S.totalDistanceCovered),
            shipsDefeated: S.shipsDefeated,
            chunksExplored: S.chunks.size
        };
        stop();
        window.dispatchEvent(new CustomEvent('navalExplorationComplete', { detail: detail }));
    }

    // Crew wiped out — the real death screen (leave_battle_roster.js's own
    // GAME OVER overlay + reload), not a custom modal, so it matches what
    // dying means everywhere else in this game. No 'navalExplorationComplete'
    // event fires for this path — triggerPermadeath() owns the entire
    // rest of the experience (including the reload) from here.
    function _triggerDeath() {
        if (S.onCompleteFired) return;
        S.onCompleteFired = true;
        S.state = 'DEFEAT';
        stop();
        if (typeof window.triggerPermadeath === 'function') {
            window.triggerPermadeath();
        } else {
            // Fallback only if that function is somehow unavailable — still
            // needs to end the session visibly rather than leave the player
            // stuck staring at a frozen, unresponsive voyage.
            window.dispatchEvent(new CustomEvent('navalExplorationComplete', {
                detail: {
                    result: 'defeat', faction: S.faction,
                    distanceCovered: Math.round(S.totalDistanceCovered),
                    shipsDefeated: S.shipsDefeated, chunksExplored: S.chunks.size
                }
            }));
        }
    }

    function isActive() { return S.active; }

    function getState() {
        return {
            state: S.state,
            faction: S.faction,
            ashore: S.ashore,
            anchoredIslandName: S.anchoredIslandRef ? S.anchoredIslandRef.name : null,
            distanceCovered: Math.round(S.totalDistanceCovered),
            shipsDefeated: S.shipsDefeated,
            chunksLoaded: S.chunks.size,
            quest: S.quest ? { desc: S.quest.desc, type: S.quest.type } : null,
            inventory: Object.assign({}, S.inventory),
            totalLoot: _totalLootCount()
        };
    }

    window.NavalExplorationMode = {
        start: start,
        stop: stop,
        isActive: isActive,
        getState: getState,
        anchor: _tryAnchor,
        weighAnchor: _weighAnchor,
        disembark: _tryDisembark,
        returnToShip: _returnToShip,
        endVoyage: function () { _endExploration('ended'); },
        confirmReturnToPort: _confirmReturnToPort,
        repairShip: repairShip,
        recruitCrew: recruitCrew,
        quartermasterCosts: { repair: QUARTERMASTER_REPAIR_COST, recruit: QUARTERMASTER_RECRUIT_COST },
        FACTIONS: FACTIONS
    };

})();