// ============================================================================
// DAWN OF GUNPOWDER — SAVE / LOAD SYSTEM  (save_system.js)  v3.0
// ============================================================================
//
// DROP-IN: One <script src="save_system.js"></script> tag, LAST in index.html.
//
// ────────────────────────────────────────────────────────────────────────────
// v3.0 CHANGE-LOG vs v1.2
// ────────────────────────────────────────────────────────────────────────────
//  [FIX-1]  SEEDED PRNG (Mulberry32) injected as Math.random during world
//            generation so cities land at IDENTICAL positions on every load.
//            v1.2 wrongly documented the world as "fully deterministic" —
//            populateCities() and bgCanvas decorations both call Math.random().
//
//  [FIX-2]  worldSeed persisted in every save-slot JSON. On load the seed is
//            restored before initGame() runs → same terrain deco, same city
//            placement → save data is then applied on top (faction/pop/gold).
//
//  [FIX-3]  LOAD FROM MAIN MENU now works. loadAndRefresh() detects the
//            main-menu state, stores a pending load, destroys the menu,
//            shows the loading screen, and triggers initGame() itself.
//            Users no longer have to click "Sandbox Game" manually first.
//
//  [FIX-4]  ANTI-DUPLICATE initGame() / draw() GUARD. Monkey-patching the
//            global initGame() prevents a second concurrent call (caused by
//            double-click or external trigger) from spawning a second RAF loop.
//            Duplicate RAF loops were the primary source of frame-rate collapse.
//
//  [FIX-5]  Pending-load is applied IMMEDIATELY after initGame() resolves
//            (inside the patched wrapper) rather than waiting for the 1-second
//            polling interval, eliminating a visible "wrong world flash".
//
//  [FIX-6]  ANDROID / CAPACITOR STORAGE — two pluggable storage adapters:
//            • StorageLs   — localStorage  (default; works on https:// WebView)
//            • StorageCap  — @capacitor/preferences async API (toggle below)
//            Toggle USE_CAPACITOR_STORAGE = true when serving from file://
//            origin. All saves are mirrored to localStorage so the metadata
//            panel (getSlotMeta) remains a fast synchronous read.
//
//  [FIX-7]  City-count safety: when saved city count ≠ generated count, the
//            system now logs a clear warning and merges by name-matching before
//            falling back to index-based overwrite.
//
// ────────────────────────────────────────────────────────────────────────────
// PLATFORM STRATEGY
//   Android APK / Capacitor (https://localhost origin)  → localStorage (default)
//   Android APK / Capacitor (file:// origin)            → @capacitor/preferences
//   PC Electron                                          → localStorage
//   Web browser (Kongregate / Newgrounds / itch.io)     → localStorage
//
// ────────────────────────────────────────────────────────────────────────────
// WHAT IS SAVED
//   ✅ worldSeed           — Mulberry32 seed for deterministic world regen
//   ✅ player.*            — position, gold, food, hp, stats, roster, enemies
//   ✅ cities[]            — full runtime state incl. x/y position
//   ✅ FACTION_RELATIONS   — live diplomacy matrix
//   ✅ globalNPCs[]        — overworld caravans, patrols, armies, bandits
//   ✅ zoom                — camera zoom level
//   ✅ diplomacyTick       — prevents instant faction wars on load
//   ✅ activeSieges[]      — in-progress city siege state
//   ❌ bgCanvas            — NOT saved; regenerated deterministically via seed
//   ❌ worldMap[][]        — NOT saved; hash/fbm is deterministic given seed
//   ❌ battleEnvironment   — NOT saved; save blocked mid-battle
// ============================================================================

(function () {
    "use strict";

    // =========================================================================
    // §0  DEVELOPER TOGGLES
    // =========================================================================

    /**
     * CAPACITOR STORAGE TOGGLE
     *
     * Leave false  → uses localStorage (works for Capacitor https://localhost).
     * Set  true    → uses @capacitor/preferences for durable native storage.
     *               Required when your Capacitor app uses a file:// origin or
     *               you find Android clearing WebView storage between sessions.
     *
     * SETUP (when enabling):
     *   npm install @capacitor/preferences
     *   npx cap sync
     *   Then ensure capacitor.config.json has the plugin listed.
     *
     * NOTE: When enabled, saves are MIRRORED to localStorage so the UI panel
     *       can still do fast synchronous metadata reads.  The Capacitor store
     *       is the authoritative copy; localStorage is the read-cache only.
     */
    const USE_CAPACITOR_STORAGE = false; // ← flip to true for file:// Capacitor

    // =========================================================================
    // §1  CONSTANTS
    // =========================================================================

    const SAVE_VERSION   = "3.0";
    const NUM_SLOTS      = 3;
    const KEY_PREFIX     = "DoG_Save_";
    const UI_Z           = 15000;

    // =========================================================================
    // §2  PLATFORM DETECTION
    // =========================================================================

    const _ua          = navigator.userAgent || "";
    const IS_ANDROID   = /Android/i.test(_ua);
    const IS_IOS       = /iPhone|iPad/i.test(_ua);
    const IS_MOBILE    = IS_ANDROID || IS_IOS || window.innerWidth < 900;
    const IS_ELECTRON  = typeof window.process === "object" &&
                         window.process?.type === "renderer";
    const IS_CAPACITOR = typeof window.Capacitor !== "undefined" &&
                         window.Capacitor?.isNativePlatform?.();

    function getPlatformLabel() {
        if (IS_ELECTRON)       return "PC (Electron)";
        if (IS_CAPACITOR && IS_ANDROID) return `Android (Capacitor ${window.Capacitor?.version ?? ""})`;
        if (IS_CAPACITOR && IS_IOS)     return `iOS (Capacitor)`;
        if (IS_ANDROID)        return "Android Browser";
        if (IS_IOS)            return "iOS Browser";
        if (IS_MOBILE)         return "Mobile Browser";
        return "PC Browser";
    }

    // =========================================================================
    // §3  STORAGE ADAPTERS
    // =========================================================================

    // ── 3a.  localStorage adapter (synchronous) ──────────────────────────────
    const StorageLs = {
        get(key)        { try { return localStorage.getItem(key);       } catch(e) { _storageWarn("get",  e); return null;  } },
        set(key, value) { try { localStorage.setItem(key, value); return true; } catch(e) { _storageWarn("set",  e); return false; } },
        remove(key)     { try { localStorage.removeItem(key); return true;     } catch(e) { _storageWarn("rm",   e); return false; } }
    };

    // ── 3b.  Capacitor Preferences adapter (async) ────────────────────────────
    //
    //  This adapter is INERT when USE_CAPACITOR_STORAGE === false.
    //  Swap in by setting the toggle above. The adapter automatically mirrors
    //  every write to localStorage so synchronous metadata reads still work.
    //
    //  If @capacitor/preferences is not installed, it falls back silently to
    //  localStorage and logs a one-time warning.
    //
    //  ALTERNATIVE (sqlite):
    //  For very large save files (>5 MB) or complex offline-first needs,
    //  swap the body of each method below to use capacitor-community/sqlite.
    //  Example: https://github.com/capacitor-community/sqlite
    //  The API surface is identical — just replace Preferences.get/set/remove.
    //
    let _capWarnedOnce = false;
    const StorageCap = {
        async get(key) {
            const CapPrefs = window.Capacitor?.Plugins?.Preferences;
            if (!CapPrefs) { _capFallbackWarn(); return StorageLs.get(key); }
            try {
                const { value } = await CapPrefs.get({ key });
                return value ?? null;
            } catch(e) { _storageWarn("cap.get", e); return StorageLs.get(key); }
        },
        async set(key, value) {
            const CapPrefs = window.Capacitor?.Plugins?.Preferences;
            if (!CapPrefs) { _capFallbackWarn(); return StorageLs.set(key, value); }
            try {
                await CapPrefs.set({ key, value });
                // Mirror to localStorage for fast sync metadata reads
                StorageLs.set(key, value);
                return true;
            } catch(e) { _storageWarn("cap.set", e); return false; }
        },
        async remove(key) {
            const CapPrefs = window.Capacitor?.Plugins?.Preferences;
            if (!CapPrefs) { _capFallbackWarn(); return StorageLs.remove(key); }
            try {
                await CapPrefs.remove({ key });
                StorageLs.remove(key);
                return true;
            } catch(e) { _storageWarn("cap.rm", e); return false; }
        }
    };

    function _storageWarn(op, e) { console.warn(`[SaveSystem] Storage.${op} failed:`, e); }
    function _capFallbackWarn() {
        if (_capWarnedOnce) return;
        _capWarnedOnce = true;
        console.warn(
            "[SaveSystem] USE_CAPACITOR_STORAGE=true but @capacitor/preferences not found.\n" +
            "Run: npm install @capacitor/preferences && npx cap sync\n" +
            "Falling back to localStorage."
        );
    }

    // ── 3c.  Unified async interface (routes to correct adapter) ─────────────
    const Storage = {
        async get(key)        { return USE_CAPACITOR_STORAGE ? StorageCap.get(key)        : StorageLs.get(key);        },
        async set(key, value) { return USE_CAPACITOR_STORAGE ? StorageCap.set(key, value) : StorageLs.set(key, value); },
        async remove(key)     { return USE_CAPACITOR_STORAGE ? StorageCap.remove(key)     : StorageLs.remove(key);     }
    };

    // Synchronous metadata read (always from localStorage mirror — fast)
    function getSlotMetaSync(slot) {
        const raw = StorageLs.get(getSaveKey(slot));
        if (!raw) return null;
        try {
            const d = JSON.parse(raw);
            return {
                timestamp:    d.timestamp,
                platform:     d.platform,
                playerX:      d.player && Math.round(d.player.x),
                playerY:      d.player && Math.round(d.player.y),
                playerGold:   d.player && Math.floor(d.player.gold),
                playerTroops: d.player && d.player.troops,
                cityCount:    d.cities && d.cities.length,
                npcCount:     d.globalNPCs && d.globalNPCs.length,
                version:      d.version,
                worldSeed:    d.worldSeed
            };
        } catch(e) { return null; }
    }

    function getSaveKey(slot) { return KEY_PREFIX + slot; }

    // =========================================================================
    // §4  SEEDED PRNG  (Mulberry32 — fast, high quality, 32-bit state)
    // =========================================================================
    //
    //  Injected as window.Math.random for the duration of initGame() so that
    //  populateCities() and bgCanvas decoration calls produce IDENTICAL output
    //  for a given seed.  The original Math.random is restored afterwards.
    //
    //  NOTE: hash() / fbm() in sandbox_overworld.js are already deterministic
    //  (pure functions of x,y).  Only the decoration calls and city placement
    //  need seeding.

    function makeMulberry32(seed) {
        // Returns a 0..1 closure compatible with Math.random signature.
        let s = seed >>> 0; // force unsigned 32-bit
        return function () {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
        };
    }

    let _origMathRandom = null;

    function installSeededRNG(seed) {
        if (_origMathRandom !== null) return; // already installed — don't double-wrap
        _origMathRandom = Math.random;
        Math.random = makeMulberry32(seed);
        console.log(`[SaveSystem] Seeded PRNG installed (seed: ${seed >>> 0})`);
    }

    function uninstallSeededRNG() {
        if (_origMathRandom === null) return;
        Math.random = _origMathRandom;
        _origMathRandom = null;
        console.log("[SaveSystem] Seeded PRNG removed — Math.random restored.");
    }

    function generateNewSeed() {
        // Mix time + crypto bytes for unpredictability
        let base = (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0;
        try {
            const buf = new Uint32Array(1);
            crypto.getRandomValues(buf);
            base ^= buf[0];
        } catch(e) { /* crypto not available — base alone is fine */ }
        return base >>> 0;
    }

    // =========================================================================
    // §5  initGame() MONKEY-PATCH
    //      — anti-duplicate guard
    //      — seeded PRNG injection
    //      — immediate pending-load application post-init
    // =========================================================================

    // Called once at bootstrap, after all game scripts have loaded.
    function patchInitGame() {
        if (typeof initGame !== "function") {
            console.warn("[SaveSystem] initGame() not found — cannot patch. Save features will still work but duplicate-launch guard is disabled.");
            return;
        }
        if (window.initGame.__DoG_patched) return; // guard against double bootstrap

        const _origInit = window.initGame;

        window.initGame = async function DoG_initGame_patched() {
            // ── Duplicate-launch guard ────────────────────────────────────────
            if (window.__DoG_gameInitRunning) {
                console.warn("[SaveSystem] initGame() already running — duplicate call blocked.");
                return;
            }
            if (window.__DoG_drawLoopActive) {
                console.warn("[SaveSystem] Draw loop already active — initGame() duplicate blocked.");
                return;
            }

            window.__DoG_gameInitRunning = true;

            // ── Seed selection ────────────────────────────────────────────────
            let seedToUse = window.DoG_pendingWorldSeed; // set by loadAndRefresh when loading a save
            if (seedToUse === undefined || seedToUse === null) {
                // Fresh game — generate a new seed and store it globally
                seedToUse = generateNewSeed();
            }
            window.DoG_worldSeed        = seedToUse >>> 0;
            window.DoG_pendingWorldSeed = undefined;

            // ── Inject seeded PRNG ────────────────────────────────────────────
            installSeededRNG(seedToUse);

            try {
                await _origInit.apply(this, arguments);
                window.__DoG_drawLoopActive = true;
                console.log("[SaveSystem] initGame() completed. Draw loop active.");
            } finally {
                // Always restore Math.random even if initGame throws
                uninstallSeededRNG();
                window.__DoG_gameInitRunning = false;
            }

            // ── Apply pending save IMMEDIATELY (no 1-second wait) ─────────────
            if (_pendingLoad && gameIsReady()) {
                const { snapshot } = _pendingLoad;
                _pendingLoad = null;
                console.log("[SaveSystem] Applying pending save immediately post-initGame.");
                _applySnapshot(snapshot);
                showToast("✅ Save restored!", 3000);
            }
        };

        window.initGame.__DoG_patched = true;
        console.log("[SaveSystem] initGame() patched ✓");
    }

    // =========================================================================
    // §6  GAME-READY GUARD
    // =========================================================================

function gameIsReady() {
    // 1. Must have an active draw loop and world data
    const basicReady = window.__DoG_drawLoopActive === true && 
                       typeof player !== "undefined" && 
                       typeof cities !== "undefined";

    // 2. BLOCK if in any form of battle
    const inAnyBattle = (window.inBattleMode || window.inSiegeBattle || window.inNavalBattle);

    // 3. BLOCK if the Custom Battle Menu is currently open
    // FIX: Look for 'cb-menu-container' which is the actual ID appended to the DOM
    const customBattleMenuOpen = !!document.getElementById("cb-menu-container") || !!document.getElementById("custom-battle-menu");

    // NOTE: City mode is intentionally NOT blocked — quest accepts and cargo
    // changes happen inside cities and must be preserved in saves.
    return basicReady && !inAnyBattle && !customBattleMenuOpen;
}

function isOnMainMenu() {
        // 1. HARD BLOCK: If the engine is in any type of battle, we are NOT on the main menu
        if (typeof inBattleMode !== "undefined" && inBattleMode) return false;
        if (typeof inSiegeBattle !== "undefined" && inSiegeBattle) return false;
        if (window.inNavalBattle) return false;

        // 2. HARD BLOCK: If the Custom Battle GUI is open, we are NOT on the main menu
        if (document.getElementById("cb-menu-container") || document.getElementById("custom-battle-menu")) return false;

        const m = document.getElementById("main-menu");
        
        // 3. ENHANCED CHECK: Ensure menu exists, isn't faded out, AND isn't hidden by display:none
        return !!(m && m.style.opacity !== "0" && m.style.display !== "none" && m.parentNode);
    }

    // =========================================================================
    // §7  SERIALISATION HELPERS
    // =========================================================================

    function serializeStats(stats) {
        if (!stats) return null;
        const KEYS = [
            "name","role","isLarge","faction","health","meleeAttack","meleeDefense",
            "armor","shieldBlockChance","bonusVsLarge","isRanged","ammo","accuracy",
            "reloadSpeed","missileBaseDamage","missileAPDamage","speed","range",
            "morale","maxMorale","stamina","weightTier","mass","radius",
            "experienceLevel","experience","level","cost","desc"
        ];
        const out = {};
        KEYS.forEach(k => { if (k in stats) out[k] = stats[k]; });
        return out;
    }

    function serializePlayer() {
        return {
            x:               player.x,
            y:               player.y,
            gold:            player.gold,
            food:            player.food,
            maxFood:         player.maxFood,
            troops:          player.troops,
            hp:              player.hp,
            maxHealth:       player.maxHealth,
            meleeAttack:     player.meleeAttack,
            meleeDefense:    player.meleeDefense,
            armor:           player.armor,
            color:           player.color,
            experience:      player.experience       || 0,
            experienceLevel: player.experienceLevel  || 1,
            faction:         player.faction,
            enemies:         Array.isArray(player.enemies) ? [...player.enemies] : [],
            roster: Array.isArray(player.roster)
                ? player.roster.map(u => ({
                    type:  u.type  || u.name || "Militia",
                    exp:   u.exp   || 1,
                    count: u.count !== undefined ? u.count : 1
                  }))
                : [],
stats_snapshot: serializeStats(player.stats),
            baseSpeed:       player.baseSpeed,
            size:            player.size,
            questLog:        player.questLog || { active: [], completed: [] },
            inventory:       player.inventory || {},
            cargoCapacity:   player.cargoCapacity || 50,
            cargoUsed:       player.cargoUsed || 0,
            cohesion:        player.cohesion !== undefined ? player.cohesion : 100
        };
    }

    function serializeCities() {
        return cities.map(c => ({
            name:             c.name,
            pop:              c.pop,
            x:                c.x,
            y:                c.y,
            radius:           c.radius           || 25,
            color:            c.color,
            faction:          c.faction,
            originalFaction:  c.originalFaction  || c.faction,
            gold:             c.gold              || 0,
            food:             c.food              || 0,
            troops:           c.troops            || 0,
            militaryPop:      c.militaryPop       || 0,
            civilianPop:      c.civilianPop       || 0,
            conscriptionRate: c.conscriptionRate  || 0.04,
            recoveryTimer:    c.recoveryTimer      || 0,
            isUnderSiege:     c.isUnderSiege       || false
        }));
    }

    function serializeNPCs() {
        return (globalNPCs || []).map(n => {
            const originIdx = n.originCity ? cities.indexOf(n.originCity) : -1;
            const targetIdx = n.targetCity ? cities.indexOf(n.targetCity) : -1;
            return {
                id:            n.id,
                role:          n.role,
                count:         n.count,
                faction:       n.faction,
                color:         n.color,
                x:             n.x,
                y:             n.y,
                targetX:       n.targetX,
                targetY:       n.targetY,
                gold:          n.gold          || 0,
                food:          n.food          || 0,
                speed:         n.speed         || 0.5,
                isSieging:     n.isSieging     || false,
                waitTimer:     n.waitTimer      || 0,
                travelDist:    n.travelDist     || 0,
                decisionTimer: n.decisionTimer  || 0,
                roster: Array.isArray(n.roster)
                    ? n.roster.map(u => ({ type: u.type || "Militia", exp: u.exp || 1 }))
                    : [],
                originCityIdx: originIdx,
                targetCityIdx: targetIdx
            };
        });
    }

    function serializeActiveSieges() {
        if (typeof activeSieges === "undefined" || !Array.isArray(activeSieges)) return [];
        return activeSieges.map(s => ({
            cityIdx:       cities.indexOf(s.city || s.targetCity),
            attackerNPCId: s.attacker ? (s.attacker.id || null) : null,
            strength:      s.strength  || 0,
            siegeDays:     s.siegeDays || 0
        })).filter(s => s.cityIdx !== -1);
    }

    // =========================================================================
    // §8  DESERIALISATION HELPERS
    // =========================================================================

    function applyPlayerData(data) {
        player.x               = data.x               ?? player.x;
        player.y               = data.y               ?? player.y;
        player.gold            = data.gold             ?? player.gold;
        player.food            = data.food             ?? player.food;
        player.maxFood         = data.maxFood          ?? player.maxFood;
        player.troops          = data.troops           ?? player.troops;
        player.hp              = data.hp               ?? player.hp;
        player.maxHealth       = data.maxHealth        ?? player.maxHealth;
        player.meleeAttack     = data.meleeAttack      ?? player.meleeAttack;
        player.meleeDefense    = data.meleeDefense     ?? player.meleeDefense;
        player.armor           = data.armor            ?? player.armor;
        player.color           = data.color            ?? player.color;
        player.experience      = data.experience       ?? 0;
        player.experienceLevel = data.experienceLevel  ?? 1;
        player.faction         = data.faction          ?? player.faction;
        player.enemies         = Array.isArray(data.enemies) ? [...data.enemies] : [];
        player.roster          = Array.isArray(data.roster)
            ? data.roster.map(u => ({ type: u.type, exp: u.exp || 1, count: u.count || 1 }))
            : [];
			
			// --- NEW FEATURES RESTORED HERE ---
        player.questLog        = data.questLog      ?? { active: [], completed: [] };
        player.inventory       = data.inventory     ?? {};
        player.cargoCapacity   = data.cargoCapacity ?? 50;
        player.cargoUsed       = data.cargoUsed     ?? 0;
        player.cohesion        = data.cohesion      ?? 100;
        // ----------------------------------
		
        if (data.baseSpeed !== undefined) player.baseSpeed = data.baseSpeed;
        if (data.size      !== undefined) player.size      = data.size;
        if (data.stats_snapshot) {
            if (!player.stats) player.stats = {};
            Object.assign(player.stats, data.stats_snapshot);
        }
    }

    function applyCitiesData(saved) {
        if (!Array.isArray(saved) || saved.length === 0) return;

        if (saved.length === cities.length) {
            // Perfect match — overwrite in-place; NPC city-index refs stay valid
            saved.forEach((c, i) => {
                Object.assign(cities[i], c);
                _fixCityColor(cities[i]);
            });

        } else {
            // Count mismatch — try name-matching first, then fall back to index
            console.warn(
                `[SaveSystem] City count mismatch: save has ${saved.length}, ` +
                `generated ${cities.length}. Attempting name-match merge.`
            );

            // Build a name→liveIndex map
            const nameMap = {};
            cities.forEach((c, i) => { nameMap[c.name] = i; });

            saved.forEach(sc => {
                const idx = nameMap[sc.name];
                if (idx !== undefined) {
                    Object.assign(cities[idx], sc);
                    _fixCityColor(cities[idx]);
                }
            });

            // Second pass: index-overwrite any that weren't name-matched
            const limit = Math.min(saved.length, cities.length);
            for (let i = 0; i < limit; i++) {
                if (!nameMap[saved[i].name] && nameMap[saved[i].name] !== 0) {
                    Object.assign(cities[i], saved[i]);
                    _fixCityColor(cities[i]);
                }
            }
        }
    }

    function _fixCityColor(city) {
        if (typeof FACTIONS !== "undefined" && FACTIONS[city.faction]) {
            city.color = FACTIONS[city.faction].color;
        }
    }

    function applyFactionRelationsData(data) {
        if (!data || typeof data !== "object") return;
        Object.keys(data).forEach(f1 => {
            if (!FACTION_RELATIONS[f1]) FACTION_RELATIONS[f1] = {};
            Object.assign(FACTION_RELATIONS[f1], data[f1]);
        });
    }

    function applyNPCData(data) {
        if (!Array.isArray(data)) return;
        // Wipe existing NPCs; replace entirely with saved set
        globalNPCs.length = 0;

        data.forEach(n => {
            const originCity = (n.originCityIdx >= 0 && cities[n.originCityIdx])
                ? cities[n.originCityIdx] : null;
            const targetCity = (n.targetCityIdx >= 0 && cities[n.targetCityIdx])
                ? cities[n.targetCityIdx] : null;

            globalNPCs.push({
                id:            n.id            || Math.random().toString(36).slice(2, 9),
                role:          n.role          || "Patrol",
                count:         n.count         || 1,
                faction:       n.faction,
                color:         n.color,
                x:             n.x,
                y:             n.y,
                targetX:       n.targetX       ?? n.x,
                targetY:       n.targetY       ?? n.y,
                gold:          n.gold          || 0,
                food:          n.food          || 0,
                speed:         n.speed         || 0.5,
                isSieging:     n.isSieging     || false,
                waitTimer:     n.waitTimer      || 0,
                travelDist:    n.travelDist     || 0,
                decisionTimer: n.decisionTimer  || 0,
                anim:          Math.floor(Math.random() * 100),
                isMoving:      true,
                battlingTimer: 0,
                battleTarget:  null,
                roster:        Array.isArray(n.roster) ? n.roster : [],
                originCity,
                targetCity
            });
        });
    }

    function applyActiveSiegesData(data) {
        if (typeof activeSieges === "undefined") return;
        activeSieges.length = 0;
        if (!Array.isArray(data)) return;
        data.forEach(s => {
            const city     = cities[s.cityIdx];
            if (!city) return;
            const attacker = globalNPCs.find(n => n.id === s.attackerNPCId) || null;
            activeSieges.push({ city, attacker, strength: s.strength || 0, siegeDays: s.siegeDays || 0 });
        });
    }

    // =========================================================================
    // §9  CORE SAVE / LOAD  (async)
    // =========================================================================

    async function saveGame(slot) {
        if (!gameIsReady()) {
            return { success: false, error: "Return to overworld before saving (no mid-battle or city saves)." };
        }
        try {
            const snapshot = {
                version:          SAVE_VERSION,
                timestamp:        Date.now(),
                platform:         getPlatformLabel(),
                slotLabel:        `Slot ${slot + 1}`,
                worldSeed:        window.DoG_worldSeed ?? 0,   // ← NEW: persist seed
                player:           serializePlayer(),
                cities:           serializeCities(),
                factionRelations: JSON.parse(JSON.stringify(FACTION_RELATIONS)),
                diplomacyTick:    (typeof diplomacyTick !== "undefined") ? diplomacyTick : 0,
                globalNPCs:       serializeNPCs(),
                activeSieges:     serializeActiveSieges(),
                zoom:             (typeof zoom !== "undefined") ? zoom : 0.8
            };

            const json  = JSON.stringify(snapshot);
            const bytes = new Blob([json]).size;

            const ok = await Storage.set(getSaveKey(slot), json);
            if (!ok) return { success: false, error: "Storage write failed — quota exceeded?" };

            console.log(`[SaveSystem] Slot ${slot + 1} saved — ${(bytes / 1024).toFixed(1)} KB | seed: ${snapshot.worldSeed}`);
            return { success: true, bytes };
        } catch(e) {
            console.error("[SaveSystem] saveGame error:", e);
            return { success: false, error: String(e) };
        }
    }

    async function loadGame(slot) {
        const raw = await Storage.get(getSaveKey(slot));
        if (!raw) return { success: false, error: "No save data in this slot." };

        let snapshot;
        try { snapshot = JSON.parse(raw); }
        catch(e) { return { success: false, error: "Save file is corrupted." }; }

        if (!snapshot.version) {
            return { success: false, error: "Save has no version tag (too old to load)." };
        }

        // ── Not in game yet — queue load and signal caller ─────────────────
        if (!gameIsReady()) {
            _pendingLoad = { slot, snapshot };
            if (snapshot.worldSeed !== undefined) {
                window.DoG_pendingWorldSeed = snapshot.worldSeed;
            }
            console.log("[SaveSystem] Game not ready; load queued.");
            return { success: true, queued: true, snapshot };
        }

        // ── In-game: apply immediately ──────────────────────────────────────
        _applySnapshot(snapshot);
        return { success: true, data: snapshot };
    }

    function _applySnapshot(snapshot) {
        // Order matters: cities before NPCs so NPC city-refs resolve.
        if (snapshot.player)          applyPlayerData(snapshot.player);
        if (snapshot.cities)          applyCitiesData(snapshot.cities);
        if (snapshot.factionRelations) applyFactionRelationsData(snapshot.factionRelations);

        if (typeof diplomacyTick !== "undefined" && snapshot.diplomacyTick !== undefined) {
            // eslint-disable-next-line no-global-assign
            diplomacyTick = snapshot.diplomacyTick;
        }

        if (snapshot.globalNPCs)    applyNPCData(snapshot.globalNPCs);
        if (snapshot.activeSieges)  applyActiveSiegesData(snapshot.activeSieges);

        if (snapshot.zoom !== undefined && typeof zoom !== "undefined") {
            // eslint-disable-next-line no-global-assign
            zoom = snapshot.zoom;
        }

        // Force overworld mode — no mid-battle/city loads
        if (typeof inBattleMode !== "undefined") inBattleMode = false;
        if (typeof inCityMode   !== "undefined") inCityMode   = false;
        if (typeof inParleMode  !== "undefined") inParleMode  = false;

        // Restore world seed to the global (used by next save)
        if (snapshot.worldSeed !== undefined) {
            window.DoG_worldSeed = snapshot.worldSeed;
        }

        console.log(`[SaveSystem] Snapshot applied ✓ | seed: ${snapshot.worldSeed} | cities: ${snapshot.cities?.length}`);
    }

    function deleteSlot(slot) {
        Storage.remove(getSaveKey(slot));
    }

    // Pending-load state
    let _pendingLoad = null;

    function checkPendingLoad() {
        if (!_pendingLoad || !gameIsReady()) return;
        const { snapshot } = _pendingLoad;
        _pendingLoad = null;
        _applySnapshot(snapshot);
        showToast("✅ Game state restored from save!", 3000);
    }

    // =========================================================================
    // §10  LOAD-FROM-MAIN-MENU  (the critical new flow)
    // =========================================================================
    //
    //  When the user is on the main menu and clicks "Load" in the save panel,
    //  we must:
    //    1. Store the pending load + seed.
    //    2. Destroy the main menu DOM element (mirroring what destroyMenu() does
    //       internally — we can't call that private closure function directly).
    //    3. Show the Skyrim-style loading screen if available.
    //    4. Wait a frame, then call initGame() (our patched version).
    //
    //  After initGame resolves, §5's post-init block fires _applySnapshot()
    //  immediately with no delay.

function _triggerGameStartFromMenu() {
        // Start AudioManager on Android (needs user-gesture unlock)
        if (typeof AudioManager !== "undefined") {
            try { AudioManager.init(); AudioManager.stopMP3(); } catch(e) {}
        }

        // Show Skyrim-style loading screen if it exists
        if (typeof window.showLoadingScreen === "function") {
            window.showLoadingScreen();
        } else {
            // Fallback
            const ld = document.getElementById("loading");
            if (ld) { ld.style.display = "block"; ld.innerText = "Loading save…"; }
        }

        // SAFELY destroy the menu and kill the background CPU loop
        if (typeof window.destroyMainMenuSafe === "function") {
            window.destroyMainMenuSafe();
        } else {
            // Fallback if menu.js isn't updated
            const menu = document.getElementById("main-menu");
            if (menu) menu.style.display = "none";
        }

        // Give the browser time to paint the loading screen, then start the engine
        setTimeout(async () => {
            if (window.__DoG_gameInitRunning || window.__DoG_drawLoopActive) {
                if (_pendingLoad && gameIsReady()) checkPendingLoad();
                return;
            }

            // Use the same safe starter that "Sandbox Game" uses
            if (typeof window.startGameSafe === "function") {
                window.startGameSafe();
            } else if (typeof initGame === "function") {
                window.__gameStarted = true;
                await initGame();
            }
        }, 150);
    }

    // =========================================================================
    // §11  AUTO-SAVE
    // =========================================================================

    const AUTO_SAVE_SLOT     = 0;
    const AUTO_SAVE_INTERVAL = 5 * 60 * 1000;
    let   _autoSaveTimer     = null;

    function startAutoSave() {
        if (_autoSaveTimer) return;
        _autoSaveTimer = setInterval(async () => {
            if (gameIsReady() && window.__DoG_drawLoopActive) {
                const r = await saveGame(AUTO_SAVE_SLOT);
                if (r.success) showToast("Auto-saved.", 2000);
            }
        }, AUTO_SAVE_INTERVAL);
    }

    // =========================================================================
    // §12  UI: TOAST
    // =========================================================================

    function showToast(message, duration = 3000, isError = false) {
        let el = document.getElementById("save-toast");
        if (!el) {
            el = document.createElement("div");
            el.id = "save-toast";
            Object.assign(el.style, {
                position:     "fixed",
                bottom:       IS_MOBILE ? "80px" : "30px",
                left:         "50%",
                transform:    "translateX(-50%)",
                background:   "rgba(20,10,5,0.95)",
                color:        "#f5d76e",
                border:       "1px solid #d4b886",
                borderRadius: "6px",
                padding:      IS_MOBILE ? "14px 22px" : "10px 20px",
                fontSize:     IS_MOBILE ? "15px" : "14px",
                fontFamily:   "Georgia, serif",
                fontWeight:   "bold",
                zIndex:       String(UI_Z + 10),
                boxShadow:    "0 4px 16px rgba(0,0,0,0.8)",
                pointerEvents:"none",
                transition:   "opacity 0.35s ease",
                textAlign:    "center",
                maxWidth:     "90vw"
            });
            document.body.appendChild(el);
        }
        el.innerText     = message;
        el.style.color   = isError ? "#ff5252" : "#f5d76e";
        el.style.opacity = "1";
        clearTimeout(el._t);
        el._t = setTimeout(() => { el.style.opacity = "0"; }, duration);
    }

    // =========================================================================
    // §13  UI: SAVE / LOAD PANEL
    // =========================================================================

    function buildSaveUI() {
        if (document.getElementById("save-load-panel")) return;

        // ── CSS ────────────────────────────────────────────────────────────
        const style = document.createElement("style");
        style.textContent = `
        #save-load-overlay {
            display:none; position:fixed; inset:0;
            background:rgba(0,0,0,.78); z-index:${UI_Z + 1};
            touch-action:none;
        }
        #save-load-overlay.open { display:flex; align-items:center; justify-content:center; }

        #save-load-panel {
            background:linear-gradient(to bottom,#1a0d0d,#0d0806);
            border:2px solid #d4b886; border-radius:10px;
            padding:24px; width:min(620px,96vw);
            max-height:92vh; overflow-y:auto;
            font-family:Georgia,serif; color:#d4b886;
            box-shadow:0 10px 40px rgba(0,0,0,.92);
        }
        #save-load-panel h2 {
            color:#f5d76e; margin:0 0 6px 0;
            font-size:clamp(1.1rem,4vw,1.6rem);
            border-bottom:1px solid #5d4037; padding-bottom:10px;
        }
        #save-load-panel .sl-platform { font-size:11px; color:#888; margin-bottom:18px; }

        .sl-slot {
            background:rgba(0,0,0,.5); border:1px solid #3e2723;
            border-radius:6px; padding:14px; margin-bottom:14px;
        }
        .sl-slot-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
        .sl-slot-title  { font-weight:bold; font-size:clamp(13px,3.5vw,16px); color:#ffca28; }
        .sl-slot-meta   { font-size:clamp(10px,2.5vw,12px); color:#aaa; margin-bottom:10px; line-height:1.6; }
        .sl-slot-empty  { font-size:12px; color:#666; font-style:italic; }

        .sl-btn {
            background:linear-gradient(to bottom,#7b1a1a,#4a0a0a);
            color:#f5d76e; border:1px solid #d4b886; border-radius:4px;
            padding:9px 14px; font-family:Georgia,serif;
            font-size:clamp(11px,3vw,13px); font-weight:bold;
            text-transform:uppercase; cursor:pointer; letter-spacing:1px;
            touch-action:manipulation; margin-right:6px; margin-top:4px;
        }
        .sl-btn:hover { background:linear-gradient(to bottom,#b71c1c,#7b1a1a); }
        .sl-btn-load { background:linear-gradient(to bottom,#1a4a0a,#0a2a04); border-color:#8bc34a; color:#8bc34a; }
        .sl-btn-load:hover { background:linear-gradient(to bottom,#2e7d32,#1a4a0a); }
        .sl-btn-del  { background:linear-gradient(to bottom,#212121,#111); border-color:#555; color:#888; font-size:11px; }
        .sl-btn-del:hover { border-color:#ff5252; color:#ff5252; }
        .sl-btn-close {
            width:100%; margin-top:16px; background:transparent;
            border:1px solid #5d4037; color:#888;
            font-size:clamp(11px,3vw,13px);
        }
        .sl-btn-close:hover { border-color:#d4b886; color:#d4b886; }
        .sl-autosave-badge {
            font-size:10px; background:#4a0a0a; color:#ff7043;
            border-radius:3px; padding:1px 5px; margin-left:6px;
        }
        .sl-seed-badge {
            font-size:10px; background:#1a3a0a; color:#8bc34a;
            border-radius:3px; padding:1px 5px; margin-left:6px;
            font-family:monospace;
        }
        `;
        document.head.appendChild(style);

        // ── Overlay + panel ─────────────────────────────────────────────────
        const overlay    = document.createElement("div");
        overlay.id       = "save-load-overlay";
        overlay.onclick  = e => { if (e.target === overlay) closePanel(); };
        const panel      = document.createElement("div");
        panel.id         = "save-load-panel";
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
    }

    function openPanel() {
        const ov = document.getElementById("save-load-overlay");
        if (!ov) return;
        ov.classList.add("open");
        renderPanel();
    }

function closePanel() {
        const ov = document.getElementById("save-load-overlay");
        if (ov) ov.classList.remove("open");
        
        // SURGERY: Unhide main menu buttons when returning from the load screen
        const menuUI = document.getElementById("main-menu-ui-container");
        if (menuUI) menuUI.style.display = "flex";
    }
	
    function renderPanel() {
        const panel = document.getElementById("save-load-panel");
        if (!panel) return;

        const onMenu  = isOnMainMenu();
        const canSave = gameIsReady() && !onMenu;

        let html = `
            <h2>💾 Save / Load Game</h2>
            <div class="sl-platform">
                Platform: ${getPlatformLabel()} &nbsp;|&nbsp; Version: ${SAVE_VERSION}
                ${window.DoG_worldSeed ? `&nbsp;|&nbsp; World Seed: <code style="color:#8bc34a">${window.DoG_worldSeed >>> 0}</code>` : ""}
                ${USE_CAPACITOR_STORAGE ? "&nbsp;|&nbsp; <span style='color:#8bc34a'>Capacitor Storage</span>" : ""}
            </div>
        `;

        if (onMenu) {
            html += `<div style="color:#8bc34a;font-size:13px;margin-bottom:12px;border:1px solid #8bc34a;border-radius:4px;padding:8px;">
                ℹ️ <b>Load-from-Menu mode.</b> Clicking ▶ Load will launch the game and restore your save automatically.
            </div>`;
        } else if (!canSave) {
            html += `<div style="color:#ff5252;font-size:13px;margin-bottom:12px;border:1px solid #ff5252;border-radius:4px;padding:8px;">
                ⚠️ Return to the overworld before saving (no mid-battle or city saves).
            </div>`;
        }

        for (let i = 0; i < NUM_SLOTS; i++) {
            const meta    = getSlotMetaSync(i);
            const isAuto  = (i === AUTO_SAVE_SLOT);
            const label   = isAuto
                ? `Auto-Save <span class="sl-autosave-badge">AUTO</span>`
                : `Slot ${i + 1}`;

            html += `<div class="sl-slot">`;
            html += `<div class="sl-slot-header"><span class="sl-slot-title">${label}</span></div>`;

            if (meta) {
                const dtStr = new Date(meta.timestamp).toLocaleString();
                const raw   = StorageLs.get(getSaveKey(i));
                const kb    = raw ? (new Blob([raw]).size / 1024).toFixed(1) : "?";
                const seed  = meta.worldSeed !== undefined
                    ? `<span class="sl-seed-badge">🌱${meta.worldSeed >>> 0}</span>` : "";

                html += `<div class="sl-slot-meta">
                    📅 ${dtStr}<br>
                    🖥️ ${meta.platform} &nbsp;|&nbsp; v${meta.version} ${seed}<br>
                    📍 Coords: (${meta.playerX}, ${meta.playerY})<br>
                    💰 Gold: ${Math.floor(meta.playerGold)} &nbsp;|&nbsp; ⚔️ Troops: ${meta.playerTroops}<br>
                    🏙️ Cities: ${meta.cityCount} &nbsp;|&nbsp; 🚶 NPCs: ${meta.npcCount} &nbsp;|&nbsp; 📦 ${kb} KB
                </div>`;

                const saveDisabled = canSave ? "" : "disabled";
                html += `
                    <button class="sl-btn" onclick="window.SaveSystem.saveAndRefresh(${i})" ${saveDisabled}>💾 Overwrite</button>
                    <button class="sl-btn sl-btn-load" onclick="window.SaveSystem.loadAndRefresh(${i})">▶ Load</button>
                    <button class="sl-btn sl-btn-del"  onclick="window.SaveSystem.deleteAndRefresh(${i})">✕ Delete</button>
                `;
            } else {
                html += `<div class="sl-slot-empty">— Empty slot —</div>`;
                if (!isAuto) {
                    html += `<button class="sl-btn" onclick="window.SaveSystem.saveAndRefresh(${i})" ${canSave ? "" : "disabled"}>💾 Save Here</button>`;
                }
            }

            html += `</div>`;
        }

        html += `<button class="sl-btn sl-btn-close" onclick="window.SaveSystem.closePanel()">✕ Close</button>`;
        panel.innerHTML = html;
    }

    // =========================================================================
    // §14  PUBLIC API  (called from inline onclick handlers & external code)
    // =========================================================================

    const _public = {

        async saveAndRefresh(slot) {
            const r = await saveGame(slot);
            if (r.success) {
                showToast(`✅ Saved to ${slot === 0 ? "Auto-Save" : "Slot " + (slot + 1)}! (${(r.bytes / 1024).toFixed(1)} KB)`);
            } else {
                showToast(`❌ Save failed: ${r.error}`, 5000, true);
            }
            renderPanel();
        },

        async loadAndRefresh(slot) {
            // ── A) Load while on main menu ─────────────────────────────────
            if (isOnMainMenu() || !window.__DoG_drawLoopActive) {
                const raw = StorageLs.get(getSaveKey(slot));
                if (!raw) { showToast("No save in this slot.", 3000, true); return; }

                let snapshot;
                try { snapshot = JSON.parse(raw); }
                catch(e) { showToast("Save file corrupted.", 3000, true); return; }

                const slotLabel = slot === 0 ? "Auto-Save" : `Slot ${slot + 1}`;
                const ok = window.confirm(
                    `Load ${slotLabel}?\n\n` +
                    `The game will start and your save will be restored automatically.\n` +
                    `World seed: ${snapshot.worldSeed ?? "legacy (no seed)"}`
                );
                if (!ok) return;

                // Queue the load and start the engine
                _pendingLoad = { slot, snapshot };
                if (snapshot.worldSeed !== undefined) {
                    window.DoG_pendingWorldSeed = snapshot.worldSeed;
                }

                closePanel();
                showToast("⏳ Starting game and restoring save…", 5000);
                _triggerGameStartFromMenu();
                return;
            }

            // ── B) In-game load ────────────────────────────────────────────
            const slotLabel = slot === 0 ? "Auto-Save" : `Slot ${slot + 1}`;
            const ok = window.confirm(`Load ${slotLabel}?\n\nUnsaved progress will be lost.`);
            if (!ok) return;

            const r = await loadGame(slot);
            if (r.success && !r.queued) {
                showToast(`✅ Game loaded from ${slotLabel}!`);
                closePanel();
                // Refresh diplomacy UI if open
                setTimeout(() => {
                    if (typeof renderDiplomacyMatrix === "function") {
                        const dp = document.getElementById("diplomacy-panel");
                        if (dp && dp.style.display === "block") renderDiplomacyMatrix();
                    }
                }, 200);
            } else if (r.queued) {
                showToast(`⏳ Load queued — starting game…`, 4000);
                closePanel();
                _triggerGameStartFromMenu();
            } else {
                showToast(`❌ Load failed: ${r.error}`, 5000, true);
                renderPanel();
            }
        },

        async deleteAndRefresh(slot) {
            if (!window.confirm(`Delete ${slot === 0 ? "Auto-Save" : "Slot " + (slot + 1)}? This cannot be undone.`)) return;
            await deleteSlot(slot);
            showToast(`🗑️ ${slot === 0 ? "Auto-Save" : "Slot " + (slot + 1)} deleted.`, 2000);
            renderPanel();
        },

        // ── Keyboard quick-save/load helpers ──────────────────────────────
        async quickSave()  { if (gameIsReady()) await this.saveAndRefresh(1); },
        async quickLoad()  { await this.loadAndRefresh(1); },

        // ── Expose internals for console debugging ─────────────────────────
        openPanel,
        closePanel,
        saveGame,
        loadGame,
        showToast,
        getSlotMetaSync,

        /** Return the current world seed (useful for sharing reproducible worlds) */
        get worldSeed() { return window.DoG_worldSeed ?? null; },

        /** Force-reset all duplicate-launch guards (call from console if stuck) */
        resetGuards() {
            window.__DoG_gameInitRunning = false;
            window.__DoG_drawLoopActive  = false;
            _pendingLoad = null;
            console.log("[SaveSystem] Guards reset. Call initGame() to relaunch if needed.");
        }
    };

    // =========================================================================
    // §16  BOOTSTRAP
    // =========================================================================

    function bootstrap() {
        // 1. Build DOM structure
        buildSaveUI();

        // 2. Patch initGame() — must run after sandbox_overworld.js has defined it
        patchInitGame();

        // 3. Start auto-save
        startAutoSave();

        // 4. Keyboard shortcuts
        window.addEventListener("keydown", e => {
            if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA") return;

            if (e.key === "F5") {
                e.preventDefault();
                _public.quickSave();
            }
            if (e.key === "F9") {
                e.preventDefault();
                _public.quickLoad();
            }
        });

        // 5. Android: prevent back-button from killing the game
        if (IS_ANDROID && IS_CAPACITOR) {
            document.addEventListener("backbutton", e => {
                e.preventDefault();
                if (gameIsReady()) {
                    openPanel(); // Show save panel on back-press instead of exiting
                }
            }, false);
        }

        console.log(
            `[SaveSystem] v${SAVE_VERSION} loaded ✓\n` +
            `  Platform: ${getPlatformLabel()}\n` +
            `  Storage:  ${USE_CAPACITOR_STORAGE ? "@capacitor/preferences" : "localStorage"}\n` +
            `  F5 = Quick Save (Slot 2) | F9 = Quick Load (Slot 2)\n` +
            `  Auto-save every 5 min → Auto-Save slot\n` +
            `  window.SaveSystem.resetGuards() — if a load gets stuck`
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bootstrap);
    } else {
        bootstrap();
    }

    window.SaveSystem = _public;

})();

// ============================================================================
// USAGE NOTES FOR DEVELOPER
// ============================================================================
//
//  QUICK REFERENCE
//  ───────────────
//  F5                → Quick Save to Slot 2
//  F9                → Quick Load from Slot 2
//  Android back btn  → Opens Save/Load panel (vs exiting app)
//  Auto-save         → Every 5 minutes into Slot 1 (Auto-Save)
//
//  SLOT MAP
//  ────────
//  Slot 1 (index 0) = Auto-Save  — overwritten automatically
//  Slot 2 (index 1) = Quick Save — F5 / F9 shortcut
//  Slot 3 (index 2) = Manual     — panel only
//
//  SEEDED WORLD GENERATION  (FIX-1 / FIX-2)
//  ─────────────────────────────────────────
//  On every fresh game, a Mulberry32 seed is generated from crypto.getRandomValues.
//  This seed is saved in the JSON and restored before generateMap() runs on load.
//  Result: cities appear at identical positions, terrain decorations look the same.
//  The seed is visible in the Save/Load panel and as window.DoG_worldSeed.
//
//  ANDROID CAPACITOR  (FIX-6)
//  ──────────────────────────
//  Default (USE_CAPACITOR_STORAGE = false): uses localStorage, which works on
//  the standard Capacitor https://localhost WebView origin.
//
//  To enable Capacitor Preferences (for file:// origin or extra durability):
//    1. Set USE_CAPACITOR_STORAGE = true at line ~59
//    2. npm install @capacitor/preferences
//    3. npx cap sync
//    4. capacitor.config.json: add "Preferences" to the plugins list
//  Saves are mirrored to localStorage for fast UI reads either way.
//
//  ALTERNATIVE SQLITE STORAGE (for files > 5 MB):
//  Swap the bodies of StorageCap.get/set/remove to use:
//    capacitor-community/sqlite — https://github.com/capacitor-community/sqlite
//  The interface is identical; only the async method calls change.
//
//  DUPLICATE WORLD BUG  (FIX-4)
//  ─────────────────────────────
//  initGame() is monkey-patched to block concurrent calls.  If you see the
//  game stuck (black screen, no cities), run in console:
//    window.SaveSystem.resetGuards()
//  then manually call initGame().
//
//  CONSOLE DEBUGGING
//  ─────────────────
//  window.SaveSystem.worldSeed         → current world seed
//  window.SaveSystem.getSlotMetaSync(0) → metadata for slot 0
//  window.DoG_worldSeed                → raw seed (numeric)
//  window.__DoG_drawLoopActive         → true once draw() is running
//  window.__DoG_gameInitRunning        → true while initGame() is in progress
//
// ============================================================================