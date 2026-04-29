// ============================================================================
// DAWN OF GUNPOWDER — SAVE / LOAD SYSTEM  (save_system.js)  v4.0
// ============================================================================
//
// DROP-IN: One <script src="save_system.js"></script> tag, LAST in index.html.
//
// ────────────────────────────────────────────────────────────────────────────
// v4.0 CHANGE-LOG vs v3.0
// ────────────────────────────────────────────────────────────────────────────
//  [FIX-8]  TRIPLE-WRAP BUG ELIMINATED.
//            v3.0 and scenario_update.js BOTH wrapped window.initGame —
//            save_system.js via patchInitGame() in bootstrap, and
//            scenario_update.js via _ensureInitHook() + window.load retry.
//            Result: scenario wrapped the already-patched DoG version,
//            breaking the duplicate-launch guard and causing corrupt state.
//
//            Fix: save_system.js is now THE ONLY code that wraps initGame.
//            It exposes a cooperative callback array:
//              window.__DoG_postInitCallbacks  (Array<Function>)
//            Any module that needs post-init work (e.g. ScenarioRuntime)
//            pushes a one-shot function there instead of wrapping initGame.
//            Callbacks are fired after the original initGame resolves and
//            BEFORE any pending save is applied, so scenario data lands first
//            and save data correctly layers on top.
//
//            scenario_update.js must be updated: replace _ensureInitHook()
//            with _ensurePostInitHook() that pushes to __DoG_postInitCallbacks.
//            See the companion patch file (scenario_update_v4.js).
//
//  [FIX-9]  STORY MODE SAVE/LOAD.
//            initGame_story1() is now patched identically to initGame() so
//            the duplicate guard, seeded PRNG, and pending-load logic work
//            in story mode too.  Loading a story save from the main menu
//            correctly launches initGame_story1() instead of initGame().
//
//  [FIX-10] GAME-MODE TAGGING.
//            Every save now records gameMode: "sandbox" | "story" | "custom".
//            The Save/Load panel shows a coloured badge per slot.
//            Loading a save meant for a different mode shows a warning
//            rather than silently corrupting the world state.
//
//  [FIX-11] FIVE SAVE SLOTS (was three).
//            Slot layout:
//              0 = Auto-Save   (written every 5 min; F5 DOES NOT touch this)
//              1 = Quick Save  (F5 write / F9 read)
//              2 = Manual A
//              3 = Manual B
//              4 = Manual C
//
//  [FIX-12] SCENARIO EDITOR ISOLATION (clarification + guard).
//            The scenario editor saves campaign maps as local JSON file
//            downloads — it never touches localStorage, so there is ZERO
//            key-namespace collision with DoG_Save_N player saves.
//            This comment explicitly documents that boundary so future
//            devs don't accidentally merge the two systems.
//
// ────────────────────────────────────────────────────────────────────────────
// SAVE NAMESPACE MAP  (localStorage keys used by this file — nothing else)
// ────────────────────────────────────────────────────────────────────────────
//   DoG_Save_0  … DoG_Save_4   — player progress saves (this file only)
//
// SAVE NAMESPACE MAP  (other systems — do NOT touch these from this file)
//   [none]  — scenario editor writes .dog_scenario.json to disk, not LS
//   [none]  — story1 has no separate localStorage keys
//
// ────────────────────────────────────────────────────────────────────────────
// WHAT IS SAVED (all modes)
//   ✅ gameMode          — "sandbox" | "story" | "custom"
//   ✅ worldSeed         — Mulberry32 seed (sandbox only; story regen from code)
//   ✅ player.*          — position, gold, food, hp, stats, roster, enemies
//   ✅ cities[]          — full runtime state incl. x/y position
//   ✅ FACTION_RELATIONS — live diplomacy matrix
//   ✅ globalNPCs[]      — overworld caravans, patrols, armies, bandits
//   ✅ zoom              — camera zoom level
//   ✅ diplomacyTick     — prevents instant faction wars on load
//   ✅ activeSieges[]    — in-progress city siege state
//   ❌ bgCanvas          — NOT saved; regenerated deterministically via seed
//   ❌ worldMap[][]      — NOT saved; hash/fbm is deterministic given seed
//   ❌ battleEnvironment — NOT saved; save blocked mid-battle
//   ❌ scenario doc      — NOT saved for custom mode (world cannot be restored;
//                          only player stats are preserved cross-session)
// ============================================================================

(function () {
    "use strict";

    // =========================================================================
    // §0  DEVELOPER TOGGLES
    // =========================================================================

    /**
     * CAPACITOR STORAGE TOGGLE
     * Leave false → uses localStorage (works for Capacitor https://localhost).
     * Set  true   → uses @capacitor/preferences for durable native storage.
     */
    const USE_CAPACITOR_STORAGE = false;

    // =========================================================================
    // §1  CONSTANTS
    // =========================================================================

    const SAVE_VERSION   = "4.0";
    const NUM_SLOTS      = 5;          // ← v4.0: was 3
    const KEY_PREFIX     = "DoG_Save_";
    const UI_Z           = 15000;

    /**
     * AUTO_SAVE_SLOT — index 0 is always the auto-save.
     * QUICK_SAVE_SLOT — index 1 is the F5/F9 quick-save target.
     * Slots 2–4 are manual.
     */
    const AUTO_SAVE_SLOT  = 0;
    const QUICK_SAVE_SLOT = 1;

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
        if (IS_CAPACITOR && IS_IOS)     return "iOS (Capacitor)";
        if (IS_ANDROID)        return "Android Browser";
        if (IS_IOS)            return "iOS Browser";
        if (IS_MOBILE)         return "Mobile Browser";
        return "PC Browser";
    }

    // =========================================================================
    // §3  STORAGE ADAPTERS
    // =========================================================================

    const StorageLs = {
        get(key)        { try { return localStorage.getItem(key);            } catch(e) { _storageWarn("get", e); return null;  } },
        set(key, value) { try { localStorage.setItem(key, value); return true; } catch(e) { _storageWarn("set", e); return false; } },
        remove(key)     { try { localStorage.removeItem(key); return true;    } catch(e) { _storageWarn("rm",  e); return false; } }
    };

    let _capWarnedOnce = false;
    const StorageCap = {
        async get(key) {
            const CP = window.Capacitor?.Plugins?.Preferences;
            if (!CP) { _capFallbackWarn(); return StorageLs.get(key); }
            try { const { value } = await CP.get({ key }); return value ?? null; }
            catch(e) { _storageWarn("cap.get", e); return StorageLs.get(key); }
        },
        async set(key, value) {
            const CP = window.Capacitor?.Plugins?.Preferences;
            if (!CP) { _capFallbackWarn(); return StorageLs.set(key, value); }
            try { await CP.set({ key, value }); StorageLs.set(key, value); return true; }
            catch(e) { _storageWarn("cap.set", e); return false; }
        },
        async remove(key) {
            const CP = window.Capacitor?.Plugins?.Preferences;
            if (!CP) { _capFallbackWarn(); return StorageLs.remove(key); }
            try { await CP.remove({ key }); StorageLs.remove(key); return true; }
            catch(e) { _storageWarn("cap.rm", e); return false; }
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

    const Storage = {
        async get(key)        { return USE_CAPACITOR_STORAGE ? StorageCap.get(key)        : StorageLs.get(key);        },
        async set(key, value) { return USE_CAPACITOR_STORAGE ? StorageCap.set(key, value) : StorageLs.set(key, value); },
        async remove(key)     { return USE_CAPACITOR_STORAGE ? StorageCap.remove(key)     : StorageLs.remove(key);     }
    };

    function getSlotMetaSync(slot) {
        const raw = StorageLs.get(getSaveKey(slot));
        if (!raw) return null;
        try {
            const d = JSON.parse(raw);
            return {
                timestamp:    d.timestamp,
                platform:     d.platform,
                gameMode:     d.gameMode     || "sandbox",
                playerX:      d.player && Math.round(d.player.x),
                playerY:      d.player && Math.round(d.player.y),
                playerGold:   d.player && Math.floor(d.player.gold),
                playerTroops: d.player && d.player.troops,
                cityCount:    d.cities && d.cities.length,
                npcCount:     d.globalNPCs && d.globalNPCs.length,
                version:      d.version,
                worldSeed:    d.worldSeed,
                hasScenario:  !!(d.scenarioDoc && (d.scenarioDoc.tilesRLE || d.scenarioDoc.tiles))
            };
        } catch(e) { return null; }
    }

    function getSaveKey(slot) { return KEY_PREFIX + slot; }

    // =========================================================================
    // §4  GAME-MODE DETECTION
    // =========================================================================
    //
    //  window.__DoG_gameMode  is the canonical runtime mode flag.
    //  It is set:
    //    • "sandbox"  — by patchInitGame() wrapper when initGame() runs
    //    • "story"    — by patchInitGame_story1() wrapper when initGame_story1() runs
    //    • "custom"   — by ScenarioRuntime.launch() before engine start
    //
    //  Callers outside this module should ONLY READ this flag, never write it
    //  (except ScenarioRuntime.launch() which must set it before init).

    function detectGameMode() {
        // The runtime flag is always authoritative once set.
        if (window.__DoG_gameMode) return window.__DoG_gameMode;
        // If an active scenario is running (post-launch), classify as custom.
        if (window.__activeScenario) return "custom";
        // Default to sandbox.
        return "sandbox";
    }

    // =========================================================================
    // §5  SEEDED PRNG  (Mulberry32)
    // =========================================================================

    function makeMulberry32(seed) {
        let s = seed >>> 0;
        return function () {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
        };
    }

    let _origMathRandom = null;

    function installSeededRNG(seed) {
        if (_origMathRandom !== null) return;
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
        let base = (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0;
        try {
            const buf = new Uint32Array(1);
            crypto.getRandomValues(buf);
            base ^= buf[0];
        } catch(e) {}
        return base >>> 0;
    }

    // =========================================================================
    // §6  COOPERATIVE POST-INIT CALLBACK SYSTEM
    // =========================================================================
    //
    //  Problem being solved
    //  ────────────────────
    //  Historically, scenario_update.js wrapped window.initGame to apply
    //  scenario data after world generation.  save_system.js ALSO wrapped
    //  window.initGame to inject seeded PRNG and apply pending saves.
    //  When both scripts loaded, the chain became:
    //
    //    ScenarioWrapper → DoG_initGame_patched → original initGame
    //
    //  The duplicate-launch guard inside DoG_initGame_patched ran INSIDE
    //  the ScenarioWrapper — guard flags were visible but the outer wrapper
    //  was unaware of them, leading to race conditions and corrupted state.
    //
    //  Solution
    //  ────────
    //  save_system.js is THE ONLY code that wraps window.initGame and
    //  window.initGame_story1.  All other modules that need to run code
    //  after engine initialisation push a one-shot callback onto:
    //
    //      window.__DoG_postInitCallbacks  (Array<Function>)
    //
    //  Callbacks are fired in push order immediately after the original
    //  initGame resolves, before any pending save is applied.
    //  Each callback is consumed (splice-removed) so it never fires twice.
    //
    //  ScenarioRuntime (scenario_update.js v4+) pushes its apply-step here
    //  instead of wrapping initGame.  See _ensurePostInitHook() in that file.

    // Ensure the array exists — scenario_update.js may push to it earlier.
    if (!Array.isArray(window.__DoG_postInitCallbacks)) {
        window.__DoG_postInitCallbacks = [];
    }

    /** Drain and fire all registered post-init callbacks (one-shot). */
    function _firePostInitCallbacks() {
        const cbs = window.__DoG_postInitCallbacks.splice(0);
        cbs.forEach(fn => {
            try { fn(); }
            catch(e) { console.error("[SaveSystem] postInitCallback threw:", e); }
        });
    }

    // =========================================================================
    // §7  initGame() MONKEY-PATCH  (sandbox mode)
    // =========================================================================

    function patchInitGame() {
        if (typeof window.initGame !== "function") {
            console.warn("[SaveSystem] initGame() not found — patch skipped.");
            return;
        }
        if (window.initGame.__DoG_patched) return;  // idempotent guard

        const _origInit = window.initGame;

        window.initGame = async function DoG_initGame_patched() {
            // ── Duplicate-launch guard ────────────────────────────────────
            if (window.__DoG_gameInitRunning) {
                console.warn("[SaveSystem] initGame() already running — duplicate blocked.");
                return;
            }
            if (window.__DoG_drawLoopActive) {
                console.warn("[SaveSystem] Draw loop active — initGame() duplicate blocked.");
                return;
            }

            window.__DoG_gameInitRunning = true;
            window.__DoG_gameMode = "sandbox";          // ← tag this as sandbox

            // ── Seed selection ────────────────────────────────────────────
            let seedToUse = window.DoG_pendingWorldSeed;
            if (seedToUse === undefined || seedToUse === null) {
                seedToUse = generateNewSeed();
            }
            window.DoG_worldSeed        = seedToUse >>> 0;
            window.DoG_pendingWorldSeed = undefined;

            // ── Inject seeded PRNG ────────────────────────────────────────
            installSeededRNG(seedToUse);

            try {
                await _origInit.apply(this, arguments);
                window.__DoG_drawLoopActive = true;
                console.log("[SaveSystem] initGame() completed (sandbox). Draw loop active.");
            } finally {
                uninstallSeededRNG();
                window.__DoG_gameInitRunning = false;
            }

            // ── Fire post-init callbacks (e.g. ScenarioRuntime applies scenario) ─
            _firePostInitCallbacks();

            // ── Apply pending sandbox save IMMEDIATELY post-init ──────────
            if (_pendingLoad && _pendingLoad.snapshot.gameMode !== "story" && gameIsReady()) {
                const { snapshot } = _pendingLoad;
                _pendingLoad = null;
                console.log("[SaveSystem] Applying pending sandbox save immediately post-init.");
                _applySnapshot(snapshot);
                showToast("✅ Save restored!", 3000);
            }
        };

        window.initGame.__DoG_patched = true;
        console.log("[SaveSystem] initGame() patched ✓ (sandbox mode)");
    }

    // =========================================================================
    // §8  initGame_story1() MONKEY-PATCH  (story mode)
    // =========================================================================
    //
    //  Story mode uses a completely separate entry point (window.initGame_story1)
    //  defined in story1_map_and_update.js.  We patch it with the same
    //  duplicate-launch guard and pending-load logic as sandbox.
    //
    //  Note: initGame_story1 already sets window.__gameStarted = true on its
    //  first line.  Our patch doesn't touch __gameStarted — the original
    //  logic handles that correctly.
    //
    //  When loading a story save from the main menu:
    //    1. _pendingLoad is set with { snapshot, expectedMode: "story" }
    //    2. _triggerGameStartFromMenu("story") calls window.initGame_story1()
    //    3. Our patched wrapper runs, calls the original story init
    //    4. Post-init callbacks fire (none for story normally)
    //    5. Pending story save is applied on top

    function patchInitGame_story1() {
        if (typeof window.initGame_story1 !== "function") {
            // story1 may not be loaded — this is fine; patch will be retried.
            return false;
        }
        if (window.initGame_story1.__DoG_patched) return true;

        const _origStory = window.initGame_story1;

        window.initGame_story1 = async function DoG_initGame_story1_patched() {
            // ── Duplicate-launch guard ────────────────────────────────────
            if (window.__DoG_gameInitRunning) {
                console.warn("[SaveSystem] initGame_story1() already running — duplicate blocked.");
                return;
            }
            if (window.__DoG_drawLoopActive) {
                console.warn("[SaveSystem] Draw loop active — initGame_story1() duplicate blocked.");
                return;
            }

            window.__DoG_gameInitRunning = true;
            window.__DoG_gameMode = "story";            // ← tag this as story

            // Story mode does not use the seeded PRNG — its map is
            // polygon-based (deterministic without randomness injection).
            // We still track the run to prevent duplicates.

            try {
                await _origStory.apply(this, arguments);
                window.__DoG_drawLoopActive = true;
                console.log("[SaveSystem] initGame_story1() completed. Draw loop active.");
            } finally {
                window.__DoG_gameInitRunning = false;
            }

            // ── Fire post-init callbacks ──────────────────────────────────
            _firePostInitCallbacks();

            // ── Apply pending story save IMMEDIATELY post-init ────────────
            if (_pendingLoad && _pendingLoad.snapshot.gameMode === "story" && gameIsReady()) {
                const { snapshot } = _pendingLoad;
                _pendingLoad = null;
                console.log("[SaveSystem] Applying pending story save immediately post-init.");
                _applySnapshot(snapshot);
                showToast("✅ Story save restored!", 3000);
            }
        };

        window.initGame_story1.__DoG_patched = true;
        console.log("[SaveSystem] initGame_story1() patched ✓ (story mode)");
        return true;
    }

    // =========================================================================
    // §9  GAME-READY GUARD
    // =========================================================================

    function gameIsReady() {
        const basicReady = window.__DoG_drawLoopActive === true &&
                           typeof player !== "undefined" &&
                           typeof cities !== "undefined";

        const inAnyBattle = (window.inBattleMode || window.inSiegeBattle || window.inNavalBattle);
        const customBattleMenuOpen = !!document.getElementById("cb-menu-container") ||
                                     !!document.getElementById("custom-battle-menu");

        return basicReady && !inAnyBattle && !customBattleMenuOpen;
    }

    function isOnMainMenu() {
        if (typeof inBattleMode   !== "undefined" && inBattleMode)   return false;
        if (typeof inSiegeBattle  !== "undefined" && inSiegeBattle)  return false;
        if (window.inNavalBattle) return false;
        if (document.getElementById("cb-menu-container") ||
            document.getElementById("custom-battle-menu")) return false;

        const m = document.getElementById("main-menu");
        return !!(m && m.style.opacity !== "0" && m.style.display !== "none" && m.parentNode);
    }

    // =========================================================================
    // §10  SERIALISATION HELPERS
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
            questLog:        player.questLog    || { active: [], completed: [] },
            inventory:       player.inventory   || {},
            cargoCapacity:   player.cargoCapacity || 50,
            cargoUsed:       player.cargoUsed    || 0,
            cohesion:        player.cohesion     !== undefined ? player.cohesion : 100
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
    // §11  DESERIALISATION HELPERS
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

        // Cargo + quest state
        player.questLog      = data.questLog      ?? { active: [], completed: [] };
        player.inventory     = data.inventory     ?? {};
        player.cargoCapacity = data.cargoCapacity ?? 50;
        player.cargoUsed     = data.cargoUsed     ?? 0;
        player.cohesion      = data.cohesion      ?? 100;

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
            saved.forEach((c, i) => { Object.assign(cities[i], c); _fixCityColor(cities[i]); });
        } else {
            console.warn(
                `[SaveSystem] City count mismatch: save has ${saved.length}, ` +
                `generated ${cities.length}. Attempting name-match merge.`
            );
            const nameMap = {};
            cities.forEach((c, i) => { nameMap[c.name] = i; });

            saved.forEach(sc => {
                const idx = nameMap[sc.name];
                if (idx !== undefined) { Object.assign(cities[idx], sc); _fixCityColor(cities[idx]); }
            });

            const limit = Math.min(saved.length, cities.length);
            for (let i = 0; i < limit; i++) {
                if (nameMap[saved[i].name] === undefined) {
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
        globalNPCs.length = 0;
        data.forEach(n => {
            const originCity = (n.originCityIdx >= 0 && cities[n.originCityIdx]) ? cities[n.originCityIdx] : null;
            const targetCity = (n.targetCityIdx >= 0 && cities[n.targetCityIdx]) ? cities[n.targetCityIdx] : null;
            globalNPCs.push({
                id:            n.id || Math.random().toString(36).slice(2, 9),
                role:          n.role || "Patrol",
                count:         n.count || 1,
                faction:       n.faction,
                color:         n.color,
                x:             n.x,
                y:             n.y,
                targetX:       n.targetX ?? n.x,
                targetY:       n.targetY ?? n.y,
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
    // §12b  SCENARIO TILE COMPRESSION  (RLE + palette)
    // =========================================================================
    //
    //  The raw tile grid (e.g. 250×187 = 46,750 tiles × 5+ fields per tile) is
    //  4–6 MB as JSON — well over localStorage's ~5 MB total quota.
    //
    //  We replace scenarioDoc.tiles with a compact tilesRLE structure:
    //
    //    tilesRLE = {
    //      tilesX:  <number>,              — scenario column count
    //      tilesY:  <number>,              — scenario row count
    //      palette: [                      — all DISTINCT tile objects (5–20 entries)
    //                 { name, color, speed, e, m, impassable }, ...
    //               ],
    //      runs:    [ [paletteIdx, count], ... ]   — column-major RLE
    //    }
    //
    //  Column-major order (x outer, y inner) matches _reskinWorldMap's access
    //  pattern so decompression streams tiles in the exact order they are read.
    //
    //  Typical compression: 46,750 tiles → ~400–1,200 runs ≈ 15–50 KB.
    //  That is a 100–300× reduction, well within the 5 MB quota even with
    //  all other save data included.
    //
    //  The original scenarioDoc object is NEVER mutated; we work on a shallow
    //  clone.  If tiles are absent (already stripped, old save) we return the
    //  clone as-is so the restore path degrades gracefully.

    function _compressScenarioTiles(doc) {
        if (!doc || !doc.tiles) return null;

        const sX = doc.dimensions.tilesX;
        const sY = doc.dimensions.tilesY;

        // ── Build palette: unique tile signatures → index ──────────────────
        const paletteMap = new Map();   // signature string → palette index
        const palette    = [];          // palette index → tile object

        function _sig(t) {
            // Stable string key so the same logical tile always maps to the
            // same palette entry regardless of object identity.
            return `${t.name}|${t.color}|${t.speed ?? ""}|${t.e ?? ""}|${t.m ?? ""}|${!!t.impassable}`;
        }

        function _palIdx(t) {
            if (!t) {
                // Missing tile — ensure a "null sentinel" is in the palette.
                // We record it as palette index 0 by convention (first miss
                // becomes index 0 only if no real tile was first).
                const nullSig = "__NULL__";
                if (paletteMap.has(nullSig)) return paletteMap.get(nullSig);
                const idx = palette.length;
                palette.push(null);          // null sentinel
                paletteMap.set(nullSig, idx);
                return idx;
            }
            const s = _sig(t);
            if (paletteMap.has(s)) return paletteMap.get(s);
            const idx = palette.length;
            palette.push({
                name:       t.name,
                color:      t.color,
                speed:      t.speed,
                e:          t.e,
                m:          t.m,
                impassable: !!t.impassable
            });
            paletteMap.set(s, idx);
            return idx;
        }

        // ── Run-length encode in column-major order ────────────────────────
        // x is the outer loop, y is the inner loop — exactly matching
        // _reskinWorldMap so the decompressor can feed tiles in read order.
        const runs = [];
        let curIdx = -1, curCount = 0;

        for (let x = 0; x < sX; x++) {
            for (let y = 0; y < sY; y++) {
                const tile = doc.tiles[x] ? doc.tiles[x][y] : null;
                const idx  = _palIdx(tile);
                if (idx === curIdx) {
                    curCount++;
                } else {
                    if (curCount > 0) runs.push([curIdx, curCount]);
                    curIdx   = idx;
                    curCount = 1;
                }
            }
        }
        if (curCount > 0) runs.push([curIdx, curCount]);

        return { tilesX: sX, tilesY: sY, palette, runs };
    }

    /**
     * Returns a SHALLOW CLONE of scenarioDoc with .tiles replaced by .tilesRLE.
     * The original document is never mutated.
     * If the scenario has no tiles (e.g. already stripped), returns a plain
     * shallow clone so the restore path still works.
     */
    function _compressScenarioForSave(scenarioDoc) {
        if (!scenarioDoc) return null;

        const clone = Object.assign({}, scenarioDoc);    // shallow clone

        if (clone.tiles) {
            const rle = _compressScenarioTiles(scenarioDoc);
            if (rle) {
                clone.tilesRLE = rle;
                delete clone.tiles;                      // drop the bulk array
                console.log(
                    `[SaveSystem] Tiles compressed: ${rle.tilesX}×${rle.tilesY} → ` +
                    `${rle.runs.length} runs, ${rle.palette.length} palette entries.`
                );
            }
            // If compression returned null (shouldn't happen) the raw tiles
            // stay in the clone — better a quota error than silent data loss.
        }

        return clone;
    }
	
	
    // =========================================================================
    // §12  CORE SAVE / LOAD  (async)
    // =========================================================================

    async function saveGame(slot) {
        if (!gameIsReady()) {
            return { success: false, error: "Return to overworld before saving (no mid-battle saves)." };
        }
        try {
            const currentMode = detectGameMode();
            const snapshot = {
                version:          SAVE_VERSION,
                timestamp:        Date.now(),
                platform:         getPlatformLabel(),
                slotLabel:        slot === AUTO_SAVE_SLOT ? "Auto-Save" : `Slot ${slot + 1}`,
                // ── GAME MODE TAG (v4.0) ────────────────────────────────────
                // "sandbox"  — standard procedurally-generated sandbox world
                // "story"    — a story chapter (e.g. Bun'ei 1274)
                // "custom"   — player-created scenario (world NOT saved here;
                //              only player stats persist cross-session)
                gameMode:         currentMode,
                worldSeed:        window.DoG_worldSeed ?? 0,
                player:           serializePlayer(),
                cities:           serializeCities(),
                factionRelations: JSON.parse(JSON.stringify(FACTION_RELATIONS)),
                diplomacyTick:    (typeof diplomacyTick !== "undefined") ? diplomacyTick : 0,
                globalNPCs:       serializeNPCs(),
                activeSieges:     serializeActiveSieges(),
                zoom:             (typeof zoom !== "undefined") ? zoom : 0.8,

// ── SCENARIO DOCUMENT (custom mode only) ─────────────────────
                // Stored so that loading this save can fully restore the scenario
                // world (terrain tiles, bgCanvas, cities, factions) rather than
                // falling back to a plain sandbox with stats-only.
                //
                // The raw tile grid (~46,750 tiles) is several MB and would blow
                // localStorage's ~5 MB quota.  _compressScenarioForSave() strips
                // scenarioDoc.tiles and replaces it with a compact RLE structure
                // (tilesRLE) that is typically 15–50 KB instead of 4–6 MB.
                // _reskinWorldMap in scenario_update.js decompresses on load.
                //
                // null for sandbox / story saves — they don't need it.
                scenarioDoc:      (currentMode === "custom" &&
                                   typeof window.ScenarioRuntime !== "undefined" &&
                                   typeof window.ScenarioRuntime.getActiveScenario === "function")
                                   ? _compressScenarioForSave(window.ScenarioRuntime.getActiveScenario())
                                   : null
            };

            const json  = JSON.stringify(snapshot);
            const bytes = new Blob([json]).size;
            const ok    = await Storage.set(getSaveKey(slot), json);
            if (!ok) return { success: false, error: "Storage write failed — quota exceeded?" };

            console.log(
                `[SaveSystem] Slot ${slot} saved — ${(bytes / 1024).toFixed(1)} KB | ` +
                `mode: ${currentMode} | seed: ${snapshot.worldSeed}`
            );
            return { success: true, bytes, gameMode: currentMode };
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

        if (!gameIsReady()) {
            _pendingLoad = { slot, snapshot };
            if (snapshot.worldSeed !== undefined && snapshot.gameMode !== "story") {
                window.DoG_pendingWorldSeed = snapshot.worldSeed;
            }
            console.log("[SaveSystem] Game not ready; load queued (mode:", snapshot.gameMode, ")");
            return { success: true, queued: true, snapshot };
        }

        _applySnapshot(snapshot);
        return { success: true, data: snapshot };
    }

    function _applySnapshot(snapshot) {
        // Order matters: cities before NPCs so NPC city-refs resolve.
        if (snapshot.player)           applyPlayerData(snapshot.player);
        if (snapshot.cities)           applyCitiesData(snapshot.cities);
        if (snapshot.factionRelations) applyFactionRelationsData(snapshot.factionRelations);

        if (typeof diplomacyTick !== "undefined" && snapshot.diplomacyTick !== undefined) {
            // eslint-disable-next-line no-global-assign
            diplomacyTick = snapshot.diplomacyTick;
        }

        if (snapshot.globalNPCs)   applyNPCData(snapshot.globalNPCs);
        if (snapshot.activeSieges) applyActiveSiegesData(snapshot.activeSieges);

        if (snapshot.zoom !== undefined && typeof zoom !== "undefined") {
            // eslint-disable-next-line no-global-assign
            zoom = snapshot.zoom;
        }

        // Force overworld mode
        if (typeof inBattleMode !== "undefined") inBattleMode = false;
        if (typeof inCityMode   !== "undefined") inCityMode   = false;
        if (typeof inParleMode  !== "undefined") inParleMode  = false;

        // Restore world seed (sandbox only — story seeds are irrelevant)
        if (snapshot.worldSeed !== undefined && snapshot.gameMode !== "story") {
            window.DoG_worldSeed = snapshot.worldSeed;
        }

        // Restore game mode flag
        if (snapshot.gameMode) {
            window.__DoG_gameMode = snapshot.gameMode;
        }

        console.log(
            `[SaveSystem] Snapshot applied ✓ | mode: ${snapshot.gameMode} | ` +
            `seed: ${snapshot.worldSeed} | cities: ${snapshot.cities?.length}`
        );
    }

    async function deleteSlot(slot) {
        await Storage.remove(getSaveKey(slot));
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
    // §13  LOAD-FROM-MAIN-MENU
    // =========================================================================
    //
    //  Routes to the correct engine entry point based on the save's gameMode.
    //
    //  "sandbox"  → initGame()          (standard sandbox world)
    //  "story"    → initGame_story1()   (Bun'ei invasion; add more story modes here)
    //  "custom"   → initGame()          (world cannot be restored; player stats only)
    //                                    + a warning toast is shown
    //
    //  All guards (__DoG_drawLoopActive, __DoG_gameInitRunning, __gameStarted)
    //  are reset before the call because we're launching from a clean menu state.

    function _triggerGameStartFromMenu(gameMode) {
        // Audio unlock
        if (typeof AudioManager !== "undefined") {
            try { AudioManager.init(); AudioManager.stopMP3(); } catch(e) {}
        }

        // Show loading screen
        if (typeof window.showLoadingScreen === "function") {
            window.showLoadingScreen();
        } else {
            const ld = document.getElementById("loading");
            if (ld) { ld.style.display = "block"; ld.innerText = "Loading save…"; }
        }

        // Destroy main menu
        if (typeof window.destroyMainMenuSafe === "function") {
            window.destroyMainMenuSafe();
        } else {
            const menu = document.getElementById("main-menu");
            if (menu) menu.style.display = "none";
        }

        setTimeout(async () => {
            // If the game is already running, just apply the pending load directly.
            if (window.__DoG_drawLoopActive) {
                if (_pendingLoad && gameIsReady()) checkPendingLoad();
                return;
            }

            // Reset all guards — we're starting fresh from the menu.
            window.__DoG_gameInitRunning = false;
            window.__DoG_drawLoopActive  = false;
            window.__gameStarted         = false;

            if (gameMode === "story") {
                // ── Story mode load path ──────────────────────────────────
                if (typeof window.initGame_story1 !== "function") {
                    showToast("❌ Story mode engine not loaded — cannot restore story save.", 6000, true);
                    return;
                }
                window.__DoG_gameMode = "story";
                await window.initGame_story1();

            } else if (gameMode === "custom") {
                // ── Custom / scenario mode load path ─────────────────────
                const snap = _pendingLoad?.snapshot;

                if (snap?.scenarioDoc &&
                    typeof window.ScenarioRuntime !== "undefined" &&
                    typeof window.ScenarioRuntime.prepareRestore === "function") {

                    // ✅ Full world restore path:
                    // The save contains the scenario document.  Queue it to be
                    // applied by ScenarioRuntime after initGame regenerates the
                    // base sandbox world.  The normal post-init pending-save path
                    // then layers the saved player/city/NPC state on top.
                    // No warning needed — the world CAN be restored.
                    console.log("[SaveSystem] Custom save has scenarioDoc — queueing full scenario restore.");
                    window.ScenarioRuntime.prepareRestore(snap.scenarioDoc);
                    if (typeof window.startGameSafe === "function") {
                        window.startGameSafe();
                    } else if (typeof window.initGame === "function") {
                        window.__gameStarted = true;
                        await window.initGame();
                    }

                } else {
                    // ⚠️ Legacy save (pre-fix) — scenarioDoc was never stored.
                    // Fall back: launch sandbox and apply player stats only.
                    showToast(
                        "⚠️ Legacy custom save — scenario world cannot be restored. " +
                        "Starting Sandbox with your saved player stats.",
                        7000, true
                    );
                    window.__DoG_gameMode = "sandbox";
                    if (typeof window.startGameSafe === "function") {
                        window.startGameSafe();
                    } else if (typeof window.initGame === "function") {
                        window.__gameStarted = true;
                        await window.initGame();
                    }
                }

            } else {
                // ── Sandbox load path (default) ───────────────────────────
                if (typeof window.startGameSafe === "function") {
                    window.startGameSafe();
                } else if (typeof window.initGame === "function") {
                    window.__gameStarted = true;
                    await window.initGame();
                }
            }
        }, 150);
    }

    // =========================================================================
    // §14  AUTO-SAVE
    // =========================================================================

    const AUTO_SAVE_INTERVAL = 5 * 60 * 1000;
    let   _autoSaveTimer     = null;

    function startAutoSave() {
        if (_autoSaveTimer) return;
        _autoSaveTimer = setInterval(async () => {
            if (gameIsReady() && window.__DoG_drawLoopActive) {
                const r = await saveGame(AUTO_SAVE_SLOT);
                if (r.success) showToast(`Auto-saved (${_modeBadgeText(r.gameMode)}).`, 2000);
            }
        }, AUTO_SAVE_INTERVAL);
    }

    // =========================================================================
    // §15  UI: TOAST
    // =========================================================================

    function showToast(message, duration = 3000, isError = false) {
        let el = document.getElementById("save-toast");
        if (!el) {
            el = document.createElement("div");
            el.id = "save-toast";
            Object.assign(el.style, {
                position:      "fixed",
                bottom:        IS_MOBILE ? "80px" : "30px",
                left:          "50%",
                transform:     "translateX(-50%)",
                background:    "rgba(20,10,5,0.95)",
                color:         "#f5d76e",
                border:        "1px solid #d4b886",
                borderRadius:  "6px",
                padding:       IS_MOBILE ? "14px 22px" : "10px 20px",
                fontSize:      IS_MOBILE ? "15px" : "14px",
                fontFamily:    "Georgia, serif",
                fontWeight:    "bold",
                zIndex:        String(UI_Z + 10),
                boxShadow:     "0 4px 16px rgba(0,0,0,0.8)",
                pointerEvents: "none",
                transition:    "opacity 0.35s ease",
                textAlign:     "center",
                maxWidth:      "90vw"
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
    // §16  UI: MODE BADGE HELPERS
    // =========================================================================

    function _modeBadgeText(mode) {
        switch (mode) {
            case "story":  return "📖 Story";
            case "custom": return "🎯 Custom";
            default:       return "🗺 Sandbox";
        }
    }

    function _modeBadgeColor(mode) {
        switch (mode) {
            case "story":  return "#9c27b0";
            case "custom": return "#0288d1";
            default:       return "#2e7d32";
        }
    }

    function _modeBadgeHTML(mode) {
        if (!mode) mode = "sandbox";
        return `<span class="sl-mode-badge" style="background:${_modeBadgeColor(mode)};">${_modeBadgeText(mode)}</span>`;
    }

    // =========================================================================
    // §17  UI: SAVE / LOAD PANEL
    // =========================================================================

    function buildSaveUI() {
        if (document.getElementById("save-load-panel")) return;

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
            padding:24px; width:min(660px,96vw);
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
        .sl-mode-badge {
            display:inline-block; font-size:10px; color:#fff;
            border-radius:3px; padding:1px 6px; margin-left:4px;
            font-family:Georgia,serif; font-weight:bold;
        }
        .sl-seed-badge {
            font-size:10px; background:#1a3a0a; color:#8bc34a;
            border-radius:3px; padding:1px 5px; margin-left:6px;
            font-family:monospace;
        }
        .sl-mode-warn {
            font-size:12px; color:#ff9800; margin-top:4px;
            border:1px solid #ff9800; border-radius:3px; padding:4px 8px;
        }
        `;
        document.head.appendChild(style);

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
        // Unhide main menu buttons when returning from the load screen
        const menuUI = document.getElementById("main-menu-ui-container");
        if (menuUI) menuUI.style.display = "flex";
    }

    function renderPanel() {
        const panel = document.getElementById("save-load-panel");
        if (!panel) return;

        const onMenu   = isOnMainMenu();
        const canSave  = gameIsReady() && !onMenu;
        const currMode = detectGameMode();

        // Title reflects context: loading from menu vs saving in-game
        const panelTitle = onMenu ? "💾 Load Game" : "💾 Save Game";

        let html = `
            <h2>${panelTitle}</h2>
            <div class="sl-platform">
                Platform: ${getPlatformLabel()} &nbsp;|&nbsp; Version: ${SAVE_VERSION}
                ${window.DoG_worldSeed && currMode !== "story"
                    ? `&nbsp;|&nbsp; World Seed: <code style="color:#8bc34a">${window.DoG_worldSeed >>> 0}</code>` : ""}
                ${canSave ? `&nbsp;|&nbsp; Current mode: ${_modeBadgeHTML(currMode)}` : ""}
                ${USE_CAPACITOR_STORAGE ? "&nbsp;|&nbsp; <span style='color:#8bc34a'>Capacitor Storage</span>" : ""}
            </div>
        `;

        if (onMenu) {
            html += `<div style="color:#8bc34a;font-size:13px;margin-bottom:12px;border:1px solid #8bc34a;border-radius:4px;padding:8px;">
                ℹ️ <b>Load Game.</b> Select a save slot to launch the game and restore your progress automatically.
                Story saves launch the story engine; Sandbox saves launch the sandbox.
            </div>`;
        } else if (!canSave) {
            html += `<div style="color:#ff5252;font-size:13px;margin-bottom:12px;border:1px solid #ff5252;border-radius:4px;padding:8px;">
                ⚠️ Return to the overworld before saving (no mid-battle or city saves).
            </div>`;
        } else {
            // In-game save panel: loading must be done from the main menu
            html += `<div style="color:#4fc3f7;font-size:clamp(12px,3.5vw,14px);margin-bottom:12px;border:1px solid #4fc3f7;border-radius:4px;padding:10px;text-align:center;line-height:1.5;">
                🔒 To <b>load</b> a save, return to the <b>Main Menu</b> first.
            </div>`;
        }

        for (let i = 0; i < NUM_SLOTS; i++) {
            const meta   = getSlotMetaSync(i);
            const isAuto = (i === AUTO_SAVE_SLOT);
            const isQS   = (i === QUICK_SAVE_SLOT);

            let slotLabel = `Slot ${i + 1}`;
            if (isAuto) slotLabel = `Auto-Save <span class="sl-autosave-badge">AUTO</span>`;
            else if (isQS) slotLabel = `Slot 2 <span class="sl-autosave-badge" style="background:#1a3a5c;color:#4fc3f7;">F5</span>`;

            html += `<div class="sl-slot">`;
            html += `<div class="sl-slot-header"><span class="sl-slot-title">${slotLabel}</span></div>`;

            if (meta) {
                const dtStr    = new Date(meta.timestamp).toLocaleString();
                const raw      = StorageLs.get(getSaveKey(i));
                const kb       = raw ? (new Blob([raw]).size / 1024).toFixed(1) : "?";

                // Seed / scenario badge
                let seedTxt = "";
                if (meta.gameMode === "story") {
                    seedTxt = ""; // story maps are deterministic — no seed displayed
                } else if (meta.gameMode === "custom" && meta.hasScenario) {
                    seedTxt = `<span class="sl-seed-badge" style="background:#1a2a3a;color:#4fc3f7;">🗺 Full Restore</span>`;
                } else if (meta.gameMode === "custom") {
                    seedTxt = `<span class="sl-seed-badge" style="background:#3a1a0a;color:#ff9800;">⚠ Legacy</span>`;
                } else if (meta.worldSeed !== undefined) {
                    seedTxt = `<span class="sl-seed-badge">🌱${meta.worldSeed >>> 0}</span>`;
                }

                html += `<div class="sl-slot-meta">
                    📅 ${dtStr}  ${_modeBadgeHTML(meta.gameMode)}<br>
                    🖥️ ${meta.platform} &nbsp;|&nbsp; v${meta.version} ${seedTxt}<br>
                    📍 Coords: (${meta.playerX}, ${meta.playerY})<br>
                    💰 Gold: ${Math.floor(meta.playerGold)} &nbsp;|&nbsp;
                    ⚔️ Troops: ${meta.playerTroops} &nbsp;|&nbsp;
                    🏙️ Cities: ${meta.cityCount} &nbsp;|&nbsp;
                    🚶 NPCs: ${meta.npcCount} &nbsp;|&nbsp; 📦 ${kb} KB
                </div>`;

                if (onMenu) {
                    // Main menu: Load + Delete only — no Save/Overwrite from menu
                    html += `
                        <button class="sl-btn sl-btn-load" onclick="window.SaveSystem.loadAndRefresh(${i})">▶ Load</button>
                        <button class="sl-btn sl-btn-del"  onclick="window.SaveSystem.deleteAndRefresh(${i})">✕ Delete</button>
                    `;
                } else {
                    // In-game: Save + Delete only — no Load button, no Overwrite label
                    const saveDisabled = canSave ? "" : "disabled";
                    html += `
                        <button class="sl-btn" onclick="window.SaveSystem.saveAndRefresh(${i})" ${saveDisabled}>💾 Save Game</button>
                        <button class="sl-btn sl-btn-del"  onclick="window.SaveSystem.deleteAndRefresh(${i})">✕ Delete</button>
                    `;
                }
            } else {
                html += `<div class="sl-slot-empty">— Empty slot —</div>`;
                if (!isAuto && !onMenu) {
                    html += `<button class="sl-btn" onclick="window.SaveSystem.saveAndRefresh(${i})" ${canSave ? "" : "disabled"}>💾 Save Here</button>`;
                }
            }

            html += `</div>`;
        }

        html += `<button class="sl-btn sl-btn-close" onclick="window.SaveSystem.closePanel()">✕ Close</button>`;
        panel.innerHTML = html;
    }

    // =========================================================================
    // §18  PUBLIC API
    // =========================================================================

    const _public = {

        async saveAndRefresh(slot) {
            const r = await saveGame(slot);
            if (r.success) {
                const label = slot === AUTO_SAVE_SLOT ? "Auto-Save" : `Slot ${slot + 1}`;
                showToast(`✅ Saved to ${label} ${_modeBadgeText(r.gameMode)} (${(r.bytes / 1024).toFixed(1)} KB)`);
            } else {
                showToast(`❌ Save failed: ${r.error}`, 5000, true);
            }
            renderPanel();
        },

        async loadAndRefresh(slot) {
            // ── Guard: loading is only allowed from the main menu ───────────
            if (!isOnMainMenu() && window.__DoG_drawLoopActive) {
                showToast(
                    "🔒 Return to the Main Menu to load a save.",
                    4000, true
                );
                return;
            }

            // ── A) Load while on main menu (or draw loop not active) ────────
            if (isOnMainMenu() || !window.__DoG_drawLoopActive) {
                const raw = StorageLs.get(getSaveKey(slot));
                if (!raw) { showToast("No save in this slot.", 3000, true); return; }

                let snapshot;
                try { snapshot = JSON.parse(raw); }
                catch(e) { showToast("Save file corrupted.", 3000, true); return; }

                const slotLabel = slot === AUTO_SAVE_SLOT ? "Auto-Save" : `Slot ${slot + 1}`;
                const saveMode  = snapshot.gameMode || "sandbox";

                const ok = window.confirm(
                    `Load ${slotLabel}? ${_modeBadgeText(saveMode)}\n\n` +
                    `The game will start and your save will be restored automatically.\n` +
                    (saveMode === "story"
                        ? "This will launch Story Mode."
                        : saveMode === "custom"
                            ? (snapshot.scenarioDoc
                                ? "✅ Scenario world and player stats will be fully restored."
                                : "⚠ Legacy save — only player stats can be restored (scenario world lost).")
                            : `World seed: ${snapshot.worldSeed ?? "legacy (no seed)"}`)
                );
                if (!ok) return;

                _pendingLoad = { slot, snapshot };
                if (snapshot.worldSeed !== undefined && saveMode !== "story") {
                    window.DoG_pendingWorldSeed = snapshot.worldSeed;
                }

                closePanel();
                showToast(`⏳ Starting ${_modeBadgeText(saveMode)} and restoring save…`, 5000);
                _triggerGameStartFromMenu(saveMode);
                return;
            }

            // ── B) In-game load ─────────────────────────────────────────────
            const slotLabel = slot === AUTO_SAVE_SLOT ? "Auto-Save" : `Slot ${slot + 1}`;
            const meta      = getSlotMetaSync(slot);
            const saveMode  = meta?.gameMode || "sandbox";
            const currMode  = detectGameMode();

            let confirmMsg = `Load ${slotLabel}? (${_modeBadgeText(saveMode)})\n\nUnsaved progress will be lost.`;
            if (saveMode !== currMode) {
                confirmMsg += `\n\n⚠️ This save is from ${_modeBadgeText(saveMode)} mode. You are currently in ${_modeBadgeText(currMode)} mode. Proceed with caution.`;
            }

            const ok = window.confirm(confirmMsg);
            if (!ok) return;

            const r = await loadGame(slot);
            if (r.success && !r.queued) {
                showToast(`✅ Loaded from ${slotLabel} ${_modeBadgeText(saveMode)}!`);
                closePanel();
                setTimeout(() => {
                    if (typeof renderDiplomacyMatrix === "function") {
                        const dp = document.getElementById("diplomacy-panel");
                        if (dp && dp.style.display === "block") renderDiplomacyMatrix();
                    }
                }, 200);
            } else if (r.queued) {
                showToast(`⏳ Load queued — starting game…`, 4000);
                closePanel();
                _triggerGameStartFromMenu(saveMode);
            } else {
                showToast(`❌ Load failed: ${r.error}`, 5000, true);
                renderPanel();
            }
        },

        async deleteAndRefresh(slot) {
            const label = slot === AUTO_SAVE_SLOT ? "Auto-Save" : `Slot ${slot + 1}`;
            if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
            await deleteSlot(slot);
            showToast(`🗑️ ${label} deleted.`, 2000);
            renderPanel();
        },

        // ── Keyboard quick-save/load (always targets QUICK_SAVE_SLOT) ────────
        async quickSave() { if (gameIsReady()) await this.saveAndRefresh(QUICK_SAVE_SLOT); },
        async quickLoad() { await this.loadAndRefresh(QUICK_SAVE_SLOT); },

        // ── Expose internals ──────────────────────────────────────────────────
        openPanel,
        closePanel,
        saveGame,
        loadGame,
        showToast,
        getSlotMetaSync,
        detectGameMode,

        get worldSeed() { return window.DoG_worldSeed ?? null; },

        /**
         * resetGuards() — emergency console command if the game gets stuck.
         * Call window.SaveSystem.resetGuards() then manually call initGame()
         * (or initGame_story1() for story mode).
         */
        resetGuards() {
            window.__DoG_gameInitRunning = false;
            window.__DoG_drawLoopActive  = false;
            window.__gameStarted         = false;
            _pendingLoad = null;
            console.log("[SaveSystem] All guards reset. Call initGame() or initGame_story1() to relaunch.");
        }
    };

    // =========================================================================
    // §19  BOOTSTRAP
    // =========================================================================

    function bootstrap() {
        // 1. Ensure post-init callback array exists (may have been set earlier
        //    by scenario_update.js pushing a callback before this script ran).
        if (!Array.isArray(window.__DoG_postInitCallbacks)) {
            window.__DoG_postInitCallbacks = [];
        }

        // 2. Build DOM structure
        buildSaveUI();

        // 3. Patch initGame() — sandbox mode
        patchInitGame();

        // 4. Patch initGame_story1() — story mode.
        //    story1_map_and_update.js may not be loaded yet at DOMContentLoaded,
        //    so we try now and retry after the window "load" event if needed.
        if (!patchInitGame_story1()) {
            window.addEventListener("load", function _story1PatchRetry() {
                patchInitGame_story1();
                window.removeEventListener("load", _story1PatchRetry);
            });
        }

        // 5. Start auto-save
        startAutoSave();

        // 6. Keyboard shortcuts
        window.addEventListener("keydown", e => {
            if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA") return;
            if (e.key === "F5") { e.preventDefault(); _public.quickSave(); }
            if (e.key === "F9") { e.preventDefault(); _public.quickLoad(); }
        });

        // 7. Android: back-button → save panel
        if (IS_ANDROID && IS_CAPACITOR) {
            document.addEventListener("backbutton", e => {
                e.preventDefault();
                if (gameIsReady()) openPanel();
            }, false);
        }

        // 8. Poll every second for pending loads that weren't caught by the
        //    immediate post-init path (e.g. if gameIsReady() was false at the
        //    exact moment initGame finished).
        setInterval(checkPendingLoad, 1000);

        console.log(
            `[SaveSystem] v${SAVE_VERSION} loaded ✓\n` +
            `  Platform: ${getPlatformLabel()}\n` +
            `  Storage:  ${USE_CAPACITOR_STORAGE ? "@capacitor/preferences" : "localStorage"}\n` +
            `  Slots: ${NUM_SLOTS} (0=Auto, 1=QuickSave F5/F9, 2-${NUM_SLOTS-1}=Manual)\n` +
            `  Game modes: sandbox | story | custom\n` +
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
//  Android back btn  → Opens Save/Load panel
//  Auto-save         → Every 5 minutes into Slot 1 (Auto-Save)
//
//  SLOT MAP (v4.0 — 5 slots)
//  ──────────────────────────
//  Slot 0 (index 0) = Auto-Save  — overwritten automatically every 5 min
//  Slot 1 (index 1) = Quick Save — F5 (write) / F9 (read)
//  Slot 2 (index 2) = Manual A   — panel only
//  Slot 3 (index 3) = Manual B   — panel only
//  Slot 4 (index 4) = Manual C   — panel only
//
//  GAME MODES
//  ──────────
//  "sandbox"  — standard sandbox world; world restored via worldSeed
//  "story"    — story chapter save; world rebuilt by running initGame_story1()
//               on load (polygon-based map, always identical)
//  "custom"   — scenario/custom campaign save; scenario world document is NOT
//               stored in the player save, so the world cannot be restored.
//               Only player stats (gold, troops, roster, inventory, etc.) are
//               preserved. The player loads into a fresh Sandbox world.
//               Future improvement: store a reference to the scenario filename
//               so the user can re-load it manually before restoring.
//
//  SCENARIO EDITOR ISOLATION
//  ──────────────────────────
//  The scenario editor (scenario_editor.js) saves campaign maps as local
//  JSON file downloads.  It does NOT use localStorage, so there is ZERO
//  key-namespace collision with DoG_Save_N player saves.
//  Do NOT add localStorage writes to scenario_editor.js — keep these two
//  save systems completely separate.
//
//  COOPERATIVE initGame PATCHING
//  ──────────────────────────────
//  save_system.js is the ONLY module that wraps window.initGame or
//  window.initGame_story1.  If you need to run code after engine init:
//
//      window.__DoG_postInitCallbacks.push(function myPostInit() {
//          // your code here — runs after initGame resolves, before save restore
//      });
//
//  Callbacks are one-shot (consumed on fire).  Push a new one each time
//  you need another run.  See scenario_update.js _ensurePostInitHook().
//
//  CONSOLE DEBUGGING
//  ─────────────────
//  window.SaveSystem.worldSeed          → current world seed (null in story)
//  window.SaveSystem.detectGameMode()   → "sandbox" | "story" | "custom"
//  window.SaveSystem.getSlotMetaSync(0) → metadata for auto-save slot
//  window.DoG_worldSeed                 → raw seed (numeric)
//  window.__DoG_drawLoopActive          → true once draw() is running
//  window.__DoG_gameInitRunning         → true while initGame/story1 in progress
//  window.__DoG_gameMode                → "sandbox" | "story" | "custom"
//  window.__DoG_postInitCallbacks       → array of one-shot callbacks
//
// ============================================================================