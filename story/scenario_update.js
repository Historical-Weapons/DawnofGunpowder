// =============================================================================
// SCENARIO RUNTIME — scenario_update.js  (v4.0 — cooperative hook edition)
// =============================================================================
// Provides the bridge that takes a scenario document (from the editor or a
// loaded JSON) and boots the game with it.
//
// v4.0 ARCHITECTURE CHANGE — COOPERATIVE POST-INIT HOOK  (FIX-8)
// ─────────────────────────────────────────────────────────────────
//   Previous versions wrapped window.initGame directly (_ensureInitHook).
//   save_system.js ALSO wraps window.initGame.  When both scripts ran, the
//   chain was:
//
//       ScenarioWrapper → DoG_initGame_patched → original initGame
//
//   This caused the save-system's duplicate-launch guard to malfunction
//   (the scenario wrapper was invisible to it) and broke save/load entirely
//   whenever a scenario had been launched in the same session.
//
//   FIX: ScenarioRuntime no longer wraps window.initGame.
//   Instead it pushes a one-shot apply-callback onto:
//
//       window.__DoG_postInitCallbacks  (Array<Function>)
//
//   save_system.js fires those callbacks after the original initGame resolves
//   and BEFORE applying any pending player save.  This gives the correct
//   application order: terrain/cities/factions → player data.
//
// HOW IT STILL WORKS
//   The sandbox engine declares some critical state lexically (worldMap,
//   bgCanvas, cities) inside `sandboxmode_overworld.js`, so we cannot replace
//   them from outside.  The trick is:
//
//     1. save_system.js wraps window.initGame (THE ONLY wrapper).
//        When menu.js's `startGameSafe()` calls `initGame()` it goes through
//        the save-system patch → original initGame.
//     2. The original initGame generates a default world and exposes refs:
//           • `window._tradeWorldRef`     → the live worldMap[][]  (mutable)
//           • `window.cities_sandbox`     → the live cities[]      (mutable)
//     3. save_system.js fires window.__DoG_postInitCallbacks.
//        ScenarioRuntime's callback runs _applyToLiveEngine() here,
//        rewriting cities and re-skinning the worldMap tiles.
//     4. save_system.js then applies any pending player save on top.
//
 
// =============================================================================

window.ScenarioRuntime = (function () {
"use strict";

// ── State ──────────────────────────────────────────────────────────────────
const rt = {
    pending:        null,   // The scenario document waiting to be applied
    active:         null,   // The currently-active scenario (after boot)
    triggers:       [],     // Loaded triggers
    postInitHooked: false   // Whether a one-shot postInitCallback is currently queued
    // NOTE: origInitGame / initHooked removed in v4.0 — we no longer wrap
    //       window.initGame.  save_system.js is the sole initGame wrapper.
    //       Any code that previously called _ensureInitHook() should now call
    //       _ensurePostInitHook() instead.
};

// ── Public: launch — main-menu and editor entry point ─────────────────────
// ── Step 4: Scenario shape migration (v2 → v3) ──────────────────────────────
// v2 had a single `storyIntro` field for the boot cinematic.
// v3 introduces `movies[]` — an array of named movie sequences. movies[0]
// is the boot intro by convention; others are triggered via `play_movie`.
//
// Migration logic:
//   • If `movies` is missing or empty, build movies[0] from `storyIntro`.
//   • storyIntro is preserved for back-compat with any external scenario
//     module that still reads it. Both contain equivalent boot data.
function _migrateScenarioShape(scenarioDoc) {
    if (!scenarioDoc || typeof scenarioDoc !== "object") return;

    // Only run once per scenario doc — flag in version.
    if ((scenarioDoc.version | 0) >= 3) return;

    const intro = scenarioDoc.storyIntro;
    if (!Array.isArray(scenarioDoc.movies) || scenarioDoc.movies.length === 0) {
        scenarioDoc.movies = [_movieFromLegacyIntro(intro || {}, "Intro")];
        console.log("[ScenarioRuntime] Migration v2→v3: created movies[0] from legacy storyIntro " +
                    "(" + (scenarioDoc.movies[0].items.length) + " item(s)).");
    }
    scenarioDoc.version = 3;
}

// Helper for migration. Mirrors scenario_triggers.js _movieFromLegacyIntro
// in shape — kept duplicated here so the runtime module has no hard
// dependency on the editor module being loaded first.
function _movieFromLegacyIntro(intro, name) {
    const m = {
        id:       "movie_" + Date.now() + "_" + Math.floor(Math.random() * 9999),
        name:     name || "Intro",
        enabled:  intro && intro.enabled !== false,
        items:    [],
        letterbox:     intro && intro.letterbox !== false,
        typewriterCps: (intro && typeof intro.typewriterCps === "number") ? intro.typewriterCps : 0,
        fadeMs:        (intro && intro.fadeMs) || 1200,
        fadeColor:     (intro && intro.fadeColor) || "#000000"
    };
    if (!intro) return m;
    if (intro.fadeMs) {
        m.items.push({ type: "fade", direction: "out", fadeMs: 0,
                       fadeColor: intro.fadeColor || "#000000" });
    }
    if (intro.titleCard && intro.titleCard.title) {
        m.items.push({ type: "title",
                       title:    intro.titleCard.title,
                       subtitle: intro.titleCard.subtitle || "",
                       ms:       intro.titleCard.ms || 3500 });
    }
    if (intro.art) {
        m.items.push({ type: "art",
                       art:        intro.art,
                       artMs:      intro.artMs || 5000,
                       kenburns:   !!intro.kenburns,
                       artCaption: intro.artCaption || "" });
    }
    if (Array.isArray(intro.lines)) {
        intro.lines.forEach(ln => m.items.push(Object.assign({ type: "dialogue" }, ln)));
    }
    if (intro.fadeMs) {
        m.items.push({ type: "fade", direction: "in",
                       fadeMs: intro.fadeMs || 1200,
                       fadeColor: intro.fadeColor || "#000000" });
    }
    return m;
}

function launch(scenarioDoc) {
    if (!scenarioDoc) { console.error("[ScenarioRuntime] No scenario provided."); return; }

    // Step 4 migration: bump shape v2 → v3 and promote storyIntro → movies[0].
    _migrateScenarioShape(scenarioDoc);

    rt.pending = scenarioDoc;
    rt.postInitHooked = false; // reset so _ensurePostInitHook always queues a fresh callback

    // Show the loading screen if the engine provides one
    if (typeof window.showLoadingScreen === "function") {
        window.showLoadingScreen();
    }

    // Start the engine the same way the Sandbox button does
    if (typeof window.AudioManager !== "undefined") {
        window.AudioManager.init();
    }

    // Mirror menu.js's destroyMainMenuSafe path if we still have a menu.
    if (typeof window.destroyMainMenuSafe === "function") {
        window.destroyMainMenuSafe();
    } else {
        const m = document.getElementById("main-menu");
        if (m) m.style.display = "none";
    }

    setTimeout(() => {
        if (window.__DoG_drawLoopActive) {
            // Draw loop is already active — the world is fully generated.
            // Apply the scenario directly without going through initGame again.
            console.log("[ScenarioRuntime] Game already running, applying scenario in-place.");
            window.__DoG_gameMode = "custom";
            try {
                _applyToLiveEngine(rt.pending);
                rt.active = rt.pending;
            } catch (err) {
                console.error("[ScenarioRuntime] Failed to apply scenario in-place:", err);
            }
            rt.pending = null;
            return;
        }

        // Game is not yet running — queue a one-shot callback so that
        // save_system.js fires it after initGame resolves, before applying any
        // pending player save.  This is the cooperative v4.0 hook path.
        _ensurePostInitHook();

        // Start the engine (mirrors menu.js's startGameSafe path).
        if (window.__gameStarted) {
            // Defensive: __gameStarted is true but draw loop isn't active yet —
            // reset the flag so the guard inside patchInitGame doesn't block us.
            console.warn("[ScenarioRuntime] __gameStarted=true but draw loop inactive — resetting guard.");
            window.__gameStarted         = false;
            window.__DoG_gameInitRunning = false;
        }
        window.__gameStarted = true;
        if (typeof window.initGame === "function") {
            window.initGame();
        } else {
            console.error("[ScenarioRuntime] window.initGame not found — engine probably not loaded.");
        }
    }, 100);
}

// ── Post-init hook installer (cooperative, v4.0) ───────────────────────────
//
//  REPLACES the old _ensureInitHook() that wrapped window.initGame a second
//  time (the triple-wrap bug described in save_system.js FIX-8).
//
//  Instead of wrapping initGame, this function pushes a ONE-SHOT callback onto
//  window.__DoG_postInitCallbacks.  save_system.js drains that array immediately
//  after the original initGame resolves, before applying any pending player save.
//  This guarantees the correct application order:
//
//     1. initGame() — generates base sandbox world
//     2. _scenarioPostInit() — rewrites terrain/cities/factions for the scenario
//     3. _applySnapshot()   — layers saved player/city/NPC state on top
//
//  Callbacks are one-shot (consumed on fire).  Call this function once per
//  initGame invocation that needs scenario data applied afterward.
function _ensurePostInitHook() {
    if (!Array.isArray(window.__DoG_postInitCallbacks)) {
        window.__DoG_postInitCallbacks = [];
    }

    window.__DoG_postInitCallbacks.push(function _scenarioPostInit() {
        if (!rt.pending) {
            console.warn("[ScenarioRuntime] postInitCallback fired but rt.pending is null — skipping.");
            return;
        }
        console.log("[ScenarioRuntime] Applying scenario post-init:", rt.pending.meta?.name);

        // Override the "sandbox" tag that patchInitGame() set — this run is
        // a custom/scenario game.  Must be set BEFORE _applyToLiveEngine so
        // that detectGameMode() and any save triggered immediately after boot
        // see the correct mode.
        window.__DoG_gameMode = "custom";

        try {
            _applyToLiveEngine(rt.pending);
            rt.active = rt.pending;
        } catch (err) {
            console.error("[ScenarioRuntime] Failed to apply scenario post-init:", err);
        }
        rt.pending        = null;
        rt.postInitHooked = false; // allow re-queuing if launch() is called again
    });

    rt.postInitHooked = true;
    console.log("[ScenarioRuntime] postInitCallback queued ✓  (save_system.js will fire after initGame)");
}
// NOTE: We do NOT eagerly call _ensurePostInitHook() here.
// It is called by launch() and prepareRestore() only when a scenario is
// actively being loaded, immediately before window.initGame() is invoked.


// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ APPLY SCENARIO TO LIVE ENGINE                                            ║
// ║                                                                          ║
// ║ This is the core of the runtime. We mutate the engine's exposed          ║
// ║ references (worldMap, cities) to match scenarioDoc.                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _applyToLiveEngine(scenarioDoc) {
    const worldMap = window._tradeWorldRef;
    const cities   = window.cities_sandbox;
    const TILE_SIZE = window._tradeTileSize || 16;
    const W = window.WORLD_WIDTH_sandbox  || 4000;
    const H = window.WORLD_HEIGHT_sandbox || 3000;

    if (!worldMap || !cities) {
        console.error("[ScenarioRuntime] Engine references missing — was generateMap called?");
        return;
    }

    // 1. Inject the FACTIONS overrides (color + geoWeight). Faction enabled-
    //    flags are honored by filtering down the exposed dictionary.
    if (window.FACTIONS && scenarioDoc.factions) {
        // First REMOVE any existing factions in window.FACTIONS that are NOT
        // in the scenario — this prevents stale defaults (e.g. a sandbox
        // faction the scenario has disabled or renamed) from leaking into the
        // diplomacy / NPC / troop systems.
        const scenarioFactionNames = new Set(Object.keys(scenarioDoc.factions));
        for (const existing of Object.keys(window.FACTIONS)) {
            // Always preserve Bandits and the Player faction (canonical "Player"
            // OR legacy "Player's Kingdom") even if the user disables them —
            // many engine code paths assume they exist.
            if (existing === "Bandits" || existing === "Player" || existing === "Player's Kingdom") continue;
            if (!scenarioFactionNames.has(existing)) {
                delete window.FACTIONS[existing];
            }
        }
        // Now overlay scenario factions on top, preserving any troop comp
        // defaults the engine may have set during init for known factions.
	    for (const fName of Object.keys(scenarioDoc.factions)) {
            const def = scenarioDoc.factions[fName];
            if (!def.enabled) continue;
            const target = window.FACTIONS[fName] || {};
            target.color       = def.color || target.color || "#888888";
            target.geoWeight   = { ...def.geoWeight };
            target.enabled     = true;
            target.uniqueTroop = def.uniqueTroop || target.uniqueTroop; // <-- ADD THIS LINE
            window.FACTIONS[fName] = target;
        }
    }

// 1b. Apply per-faction unique troops to troopGUI.faction_uniques.
    if (typeof troopGUI !== 'undefined' && scenarioDoc.factions) {
        for (const [fName, fData] of Object.entries(scenarioDoc.factions)) {
            if (!fData.enabled) continue;
            const key = fName.toLowerCase();
            
            // Allow overwriting with a specific custom unit, or clearing it if "None" is chosen
            if (fData.uniqueTroop !== undefined) {
                troopGUI.faction_uniques[key] = fData.uniqueTroop || null;
            }
        }
    }

    // 2. Re-skin the worldMap from scenario tiles (resampling if dimensions differ)
    _reskinWorldMap(scenarioDoc, worldMap, TILE_SIZE);

    // 3. Re-paint bgCanvas if exposed (optional hook, see top of file)
    _repaintBgCanvas(scenarioDoc);

    // 3b. Cosmetic detail painting — sprinkles trees, rocks, mountain peaks,
    //     bumps, and grass details onto the scenario map. Pure cosmetic; does
    //     not affect collision or biome data. Runs only if the bgCanvas hook
    //     is exposed (otherwise there is no canvas to paint into).
    _paintCosmeticDetails(scenarioDoc);

    // ── STEP 0 (SPAWN-BAN LOCK) ──────────────────────────────────────────────
    // MUST run before _replaceCities() because that call triggers initAllCities()
    // which immediately begins spawning garrison/patrol/gate NPCs.  If bans land
    // after that, the first wave of faction NPCs is already in globalNPCs.
    //
    // We ALWAYS hard-reset __npcSpawnBans to exactly what this scenario defines —
    // never merge/push onto whatever stale state a previous session left behind.
    // This is the authoritative source of truth for the lifetime of this scenario.
    window.__npcSpawnBans = {
        factions: ((scenarioDoc.startingNpcBans && scenarioDoc.startingNpcBans.factions) || []).slice(),
        roles:    ((scenarioDoc.startingNpcBans && scenarioDoc.startingNpcBans.roles)    || []).slice()
    };
    console.log("[ScenarioRuntime] NPC spawn bans locked (pre-init) → factions:",
        window.__npcSpawnBans.factions, "| roles:", window.__npcSpawnBans.roles);

    // 4. Replace cities array with scenario cities (re-init each via engine API).
    // Bans are already live above — any NPC spawned during initAllCities() inside
    // _replaceCities() will be correctly filtered by _isSpawnBanned().
    _replaceCities(scenarioDoc, cities, W, H);

    // 5. Re-spawn NPCs from the new cities so traders/patrols come from scenario factions.
    // Bans remain in effect from Step 0 above.
    _respawnNPCsFromScenarioCities();

    // 6. Place player.
    _placePlayer(scenarioDoc, W, H);

    // 6b. Re-initialize diplomacy with the scenario's faction set. The original
    //     initDiplomacy(FACTIONS) is called once at sandbox load with the default
    //     factions — that matrix is now stale because we just rewrote FACTIONS
    //     to match the scenario. Calling initDiplomacy again rebuilds the matrix
    //     from the current FACTIONS, which is exactly what we want.
    if (typeof window.initDiplomacy === "function") {
        try { window.initDiplomacy(window.FACTIONS); }
        catch (err) { console.warn("[ScenarioRuntime] initDiplomacy failed:", err); }
    }

    // 6c. Apply the scenario's saved Initial Diplomacy matrix (Step 1).
    //     This was set in the editor's Diplomacy panel: each cell is War/Peace/
    //     Ally between two factions. setRelation() also keeps player.enemies
    //     in sync when the player is on either side of the relation.
    if (scenarioDoc.initialDiplomacy &&
        typeof window.applyDiplomacyMatrix === "function") {
        try { window.applyDiplomacyMatrix(scenarioDoc.initialDiplomacy); }
        catch (err) { console.warn("[ScenarioRuntime] applyDiplomacyMatrix failed:", err); }
    }

    // 7. Save the active scenario for trigger lookup, etc.
    rt.triggers = scenarioDoc.triggers || [];
    window.__activeScenario = scenarioDoc;

    console.log("[ScenarioRuntime] Scenario applied:",
        cities.length, "cities,",
        Object.keys(window.FACTIONS || {}).length, "factions registered.");
}

// ── 2a. Tile decompressor ────────────────────────────────────────────────────
//
//  save_system.js §12b compresses scenarioDoc.tiles into scenarioDoc.tilesRLE
//  (RLE + palette) before writing to localStorage, to stay under the 5 MB
//  quota.  When a save is restored, scenarioDoc.tiles is GONE — only tilesRLE
//  exists.  This function reconstructs the original column-major tiles[x][y]
//  array from the compact encoding so _reskinWorldMap can proceed identically
//  whether the scenario came from a live launch or a save restore.
//
//  Encoding contract (must match save_system._compressScenarioTiles):
//    tilesRLE.palette  — array of unique tile objects (or null sentinel)
//    tilesRLE.runs     — [ [paletteIdx, count], ... ] column-major (x outer, y inner)
//    tilesRLE.tilesX   — scenario column count
//    tilesRLE.tilesY   — scenario row count
function _decompressScenarioTiles(rle) {
    if (!rle || !rle.runs || !rle.palette) {
        console.error("[ScenarioRuntime] _decompressScenarioTiles: invalid RLE — missing runs or palette.");
        return null;
    }

    const { tilesX, tilesY, palette, runs } = rle;

    // Allocate column-major 2D array matching the original scenarioDoc.tiles shape.
    const tiles = new Array(tilesX);
    for (let x = 0; x < tilesX; x++) tiles[x] = new Array(tilesY);

    // Replay the run stream in column-major order (x outer, y inner) —
    // the same scan order used during compression.
    let x = 0, y = 0;
    for (let r = 0; r < runs.length; r++) {
        const idx   = runs[r][0];
        const count = runs[r][1];
        const src   = palette[idx];   // null → null-sentinel, skipped in reskin loop
        for (let k = 0; k < count; k++) {
            if (x < tilesX) tiles[x][y] = src;
            y++;
            if (y >= tilesY) { y = 0; x++; }
        }
    }

    console.log(
        `[ScenarioRuntime] tilesRLE decompressed: ${tilesX}×${tilesY} tiles ` +
        `from ${runs.length} runs (${palette.length} palette entries).`
    );
    return tiles;
}

// ── 2. Re-skin worldMap ─────────────────────────────────────────────────────
//
//  Tile source resolution order:
//    1. scenarioDoc.tiles    — present for live launches (editor / launch())
//    2. scenarioDoc.tilesRLE — present for save-restored scenarios; we
//                              decompress it here and cache back onto the doc
//                              so any subsequent call is free (already tiles[])
//    3. Neither present      — skip gracefully; cities + factions still restore
function _reskinWorldMap(scenarioDoc, worldMap, TILE_SIZE) {
    const engineCols = worldMap.length;
    const engineRows = worldMap[0] ? worldMap[0].length : 0;
    if (!engineCols || !engineRows) return;

    // ── Resolve tile source ──────────────────────────────────────────────────
    let tiles = scenarioDoc.tiles || null;

    if (!tiles && scenarioDoc.tilesRLE) {
        // Save-restore path: tiles were compressed before writing to localStorage.
        // Decompress once, cache back onto the doc so re-calls are instant.
        tiles = _decompressScenarioTiles(scenarioDoc.tilesRLE);
        if (tiles) scenarioDoc.tiles = tiles;   // cache — does not affect localStorage
    }

    if (!tiles) {
        // Neither source present. Cities, factions, and bgCanvas (which reads
        // from worldMap after this function runs) are still restored correctly.
        console.warn(
            "[ScenarioRuntime] _reskinWorldMap: no tile data (tiles & tilesRLE both absent). " +
            "Terrain will reflect procedural sandbox map. Cities/factions still restored."
        );
        return;
    }

    const sX = scenarioDoc.dimensions.tilesX;
    const sY = scenarioDoc.dimensions.tilesY;

    // Scale-sample the scenario tiles into the engine's grid.
    // Engine tile objects are mutated IN PLACE so all existing refs stay valid.
    for (let i = 0; i < engineCols; i++) {
        const sx = Math.floor((i / engineCols) * sX);
        for (let j = 0; j < engineRows; j++) {
            const sy = Math.floor((j / engineRows) * sY);
            const src = tiles[sx] && tiles[sx][sy];
            if (!src) continue;   // null-sentinel or out-of-bounds — keep engine default

            // Mutate the engine's tile object IN PLACE so all engine refs stay valid.
            const dst = worldMap[i][j];
            if (!dst) continue;
            dst.name       = src.name;
            dst.color      = src.color;
            dst.speed      = src.speed;
            dst.impassable = !!src.impassable;
            dst.e          = src.e;
            dst.m          = src.m;
            // We do not touch dst.id (engine may use it).
        }
    }
}

// ── 3. Repaint bgCanvas if exposed ──────────────────────────────────────────
function _repaintBgCanvas(scenarioDoc) {
    const bg  = window.__sandboxBgCanvas;
    const bgc = window.__sandboxBgCtx;
    if (!bg || !bgc) {
        console.info("[ScenarioRuntime] bgCanvas hook not present — visual reflects procedural map only.");
        return;
    }
    const TILE_SIZE = window._tradeTileSize || 16;
    const worldMap  = window._tradeWorldRef;
    if (!worldMap) return;

    const cols = worldMap.length;
    const rows = worldMap[0].length;

    // Solid base
    bgc.fillStyle = "#2b4a5f";
    bgc.fillRect(0, 0, bg.width, bg.height);

    // Bulk-fill each tile with its color
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            const t = worldMap[i][j];
            if (!t) continue;
            bgc.fillStyle = t.color;
            bgc.fillRect(i * TILE_SIZE, j * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    }

    // NOTE: The parchment vignette is intentionally NOT applied here.
    // It is applied at the END of _paintCosmeticDetails, AFTER all the trees,
    // rocks, and mountain peaks have been drawn — this matches the sandbox
    // engine's order of operations and keeps the cosmetic details visible
    // through the parchment overlay.
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ COSMETIC DETAIL PAINTER                                                  ║
// ║                                                                          ║
// ║ After the bgCanvas is filled with flat tile colors, this function        ║
// ║ sprinkles trees, rocks, mountain peaks, and grass details onto the map   ║
// ║ — exactly like sandbox_overworld.js does in its painting loop. This is   ║
// ║ purely cosmetic; collision and biome data live on the worldMap tiles     ║
// ║ themselves and are unaffected.                                           ║
// ║                                                                          ║
// ║ NO buildings or roads are painted (those belong to populateCities and    ║
// ║ are handled separately by initAllCities).                                ║
// ║                                                                          ║
// ║ This function REUSES the engine's drawing helpers if they're on window   ║
// ║ (they are — they're declared at top level in sandbox_overworld.js); if   ║
// ║ those are missing for some reason, we fall back to inline replicas.      ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _paintCosmeticDetails(scenarioDoc) {
    const bg  = window.__sandboxBgCanvas;
    const bgc = window.__sandboxBgCtx;
    if (!bg || !bgc) {
        console.info("[ScenarioRuntime] No bgCanvas hook — skipping cosmetic painting.");
        return;
    }
    const TILE_SIZE = window._tradeTileSize || 16;
    const worldMap  = window._tradeWorldRef;
    if (!worldMap) return;

    const COLS = worldMap.length;
    const ROWS = worldMap[0] ? worldMap[0].length : 0;
    if (!COLS || !ROWS) return;

    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 900;
    const PALETTE_JUNGLE = "#244222";

    // ── Pull engine drawing helpers if available ──────────────────────────
    const drawHighlandTree = window.drawHighlandTree || _fallbackDrawHighlandTree;
    const drawHighlandBump = window.drawHighlandBump || _fallbackDrawHighlandBump;
    const drawMountain     = window.drawMountain     || _fallbackDrawMountain;
    const drawSnowyPeak    = window.drawSnowyPeak    || _fallbackDrawSnowyPeak;

    // Local hash for deterministic-ish per-tile randomness (mirrors sandbox)
    function hash(x, y) { let n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123; return n - Math.floor(n); }

    console.log("[ScenarioRuntime] Painting cosmetic details (" + COLS + "×" + ROWS + " tiles)…");

    // ╔═══════════════════════════════════════════════════════════════════╗
    // ║ MAIN PAINTING LOOP — mirrors sandbox_overworld.js painting pass    ║
    // ╚═══════════════════════════════════════════════════════════════════╝
    for (let j = 0; j < ROWS; j++) {
        for (let i = 0; i < COLS; i++) {
            const tile = worldMap[i][j];
            if (!tile) continue;
            const px = i * TILE_SIZE;
            const py = j * TILE_SIZE;
            const nx = i / COLS;
            const ny = j / ROWS;

            // ── HIGHLANDS ──────────────────────────────────────────────
            if (tile.name === "Highlands") {
                let isNearWater = false;
                if (tile.e < 0.62) {
                    const n = worldMap[i]?.[j - 1]?.name;
                    const s = worldMap[i]?.[j + 1]?.name;
                    const w = worldMap[i - 1]?.[j]?.name;
                    const e_tile = worldMap[i + 1]?.[j]?.name;
                    isNearWater = (
                        n === "Ocean" || n === "Coastal" || n === "River" ||
                        s === "Ocean" || s === "Coastal" || s === "River" ||
                        w === "Ocean" || w === "Coastal" || w === "River" ||
                        e_tile === "Ocean" || e_tile === "Coastal" || e_tile === "River"
                    );
                }
                if (!isNearWater) {
                    const isAridNorth = (nx > 0.3 && nx < 0.7 && ny > 0.3 && ny < 0.6) || (nx < 0.45 && ny < 0.4);
                    const edgeFade = tile.e ? Math.min(1, (tile.e - 0.55) * 5) : 1;
                    if (isAridNorth) {
                        if (Math.random() < 0.03 * edgeFade) drawHighlandBump(bgc, px, py, TILE_SIZE);
                        if (Math.random() > 0.990)           drawHighlandTree(bgc, px, py, "#4a5d3a", 0.3);
                    } else {
                        if (Math.random() < 0.50 * edgeFade) drawHighlandBump(bgc, px, py, TILE_SIZE);
                        if (Math.random() > 0.90 * (2 - edgeFade)) {
                            const treeColor = "#2d4c1e";
                            drawHighlandTree(bgc, px, py, treeColor, 0.4);
                            if (Math.random() > 0.5) drawHighlandTree(bgc, px + 2, py + 1, treeColor, 0.25);
                        }
                    }
                    if (Math.random() > 0.95) {
                        bgc.fillStyle = "rgba(0,0,0,0.03)";
                        bgc.fillRect(px + Math.random() * TILE_SIZE, py + Math.random() * TILE_SIZE, 1, 1);
                    }
                }
            }

            // ── STEPPES & DESERT (small dots / sparse shrubs) ─────────
            else if (tile.name === "Steppes" || tile.name === "Desert") {
                if (nx < 0.45 && ny < 0.4 && Math.random() > 0.995) {
                    bgc.fillStyle = "#364528";
                    bgc.beginPath();
                    bgc.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE * 0.4, 0, Math.PI * 2);
                    bgc.fill();
                } else if (Math.random() > (isMobile ? 0.93 : 0.55)) {
                    bgc.fillStyle = "rgba(0,0,0,0.04)";
                    bgc.beginPath();
                    bgc.arc(
                        px + Math.random() * TILE_SIZE,
                        py + Math.random() * TILE_SIZE,
                        Math.random() * 2 + 0.5, 0, Math.PI * 2
                    );
                    bgc.fill();
                }
            }

            // ── PLAINS / MEADOW (grass tufts + sparkle) ───────────────
            else if (tile.name === "Meadow" || tile.name === "Plains") {
                if (Math.random() > 0.84) {
                    bgc.fillStyle = "#425232";
                    bgc.beginPath();
                    bgc.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE * 0.5, 0, Math.PI, true);
                    bgc.fill();
                } else if (Math.random() > 0.7) {
                    bgc.fillStyle = "rgba(255,255,255,0.15)";
                    bgc.beginPath();
                    bgc.arc(
                        px + Math.random() * TILE_SIZE,
                        py + Math.random() * TILE_SIZE,
                        Math.random() * 2 + 1, 0, Math.PI * 2
                    );
                    bgc.fill();
                }
            }
            // ── Other land tiles get a faint grass stroke ─────────────
            else if (tile.name !== "Ocean" && tile.name !== "River" && tile.name !== "Coastal") {
                if (Math.random() > 0.98) {
                    bgc.strokeStyle = "rgba(30, 50, 20, 0.3)";
                    bgc.lineWidth = 1;
                    let gx = px + Math.random() * TILE_SIZE;
                    let gy = py + Math.random() * TILE_SIZE;
                    bgc.beginPath();
                    bgc.moveTo(gx, gy); bgc.lineTo(gx - 1.5, gy - 3);
                    bgc.moveTo(gx, gy); bgc.lineTo(gx + 1.5, gy - 2.5);
                }
            }

            // ── BIOMATIC FOREST ENGINE ────────────────────────────────
            // Forest tiles get a randomly-chosen tree species per tile,
            // matching latitude/longitude bands like sandbox does.
            if (tile.name && (tile.name.includes("Forest") || tile.color === PALETTE_JUNGLE)) {
                const jurchenFade = Math.max(0, Math.min(1, (nx + (hash(i, j) - 0.5) * 0.1 - 0.45) / 0.35));
                const northCurve = 0.35 + (Math.sin(nx * Math.PI * 4) * 0.03) + (Math.cos(nx * Math.PI * 8) * 0.015);
                const northBlendChance = Math.max(0, Math.min(1, (northCurve + 0.05 - (ny + (hash(i, j) - 0.5) * 0.15)) / 0.25));
                const highlandPerturb = tile.e > 0.55 ? (tile.e - 0.55) * 0.15 : 0;
                const southCurve = 0.70 + (Math.sin(nx * Math.PI * 5) * 0.035) + (Math.cos(nx * Math.PI * 7) * 0.015) - highlandPerturb;
                const southBlendChance = Math.max(0, Math.min(1, ((ny + (hash(j, i) - 0.5) * 0.15) - (southCurve - 0.05)) / 0.25));
                const westCurve = 0.30 + (Math.sin(ny * Math.PI * 4) * 0.03) + (Math.cos(ny * Math.PI * 9) * 0.02);
                const westBlendChance = Math.max(0, Math.min(1, (westCurve + 0.05 - (nx + (hash(i, i) - 0.5) * 0.15)) / 0.25));
                const isFarNorth   = Math.random() < northBlendChance;
                const isJungleTile = tile.color === PALETTE_JUNGLE;
                const isDeepSouth  = Math.random() < southBlendChance || (isJungleTile && Math.random() > 0.15);
                const isAridWest   = Math.random() < westBlendChance;
                const densityThreshold = 0.55 - (jurchenFade * 0.05) - (ny * 0.05);

                if (Math.random() > densityThreshold) {
                    const seedX = hash(i, j);
                    const seedY = hash(j, i);
                    const offsetX = (seedX - 0.5) * (TILE_SIZE * 1.5);
                    const offsetY = (seedY - 0.5) * (TILE_SIZE * 1.5);
                    const cx = px + TILE_SIZE / 2 + offsetX;
                    const cy = py + TILE_SIZE / 2 + offsetY;
                    const treeSize = TILE_SIZE * (0.35 + (jurchenFade * 0.3) + (Math.random() * 0.3));
                    const treeRand = Math.random();
                    bgc.save();
                    if (isFarNorth) {
                        // Manchurian larch — tiered conifer
                        const tiers = 2 + Math.floor(Math.random() * 2);
                        bgc.fillStyle = `rgb(${10 + Math.random() * 10}, ${20 + Math.random() * 10}, 15)`;
                        for (let t = 0; t < tiers; t++) {
                            const ty = cy - (t * (treeSize * 0.4));
                            const tw = treeSize * (1 - (t * 0.3));
                            bgc.beginPath();
                            bgc.moveTo(cx, ty - treeSize);
                            bgc.lineTo(cx - tw, ty);
                            bgc.lineTo(cx + tw, ty);
                            bgc.closePath();
                            bgc.fill();
                        }
                    } else if (isDeepSouth) {
                        if (treeRand > 0.4) {
                            // Ancient banyan
                            const leafColors = ["#0D1F1D", "#1A2F18", "#142414"];
                            for (let l = 0; l < 2; l++) {
                                bgc.fillStyle = leafColors[l];
                                const lx = cx + (Math.random() - 0.5) * treeSize;
                                const ly = cy + (Math.random() - 0.5) * treeSize;
                                bgc.beginPath();
                                bgc.ellipse(lx, ly, treeSize * 0.8, treeSize * 0.5, Math.random() * Math.PI, 0, Math.PI * 2);
                                bgc.fill();
                            }
                        } else {
                            // River bamboo
                            bgc.strokeStyle = "#1B2B12";
                            bgc.lineWidth = 1;
                            for (let b = 0; b < 2; b++) {
                                const bx = cx + (b * 2) - 1;
                                const bh = treeSize * (0.8 + Math.random() * 0.5);
                                bgc.beginPath();
                                bgc.moveTo(bx, cy);
                                bgc.lineTo(bx + (Math.random() - 0.5), cy - bh);
                                bgc.stroke();
                                bgc.fillStyle = "#2D3B1E";
                                bgc.beginPath();
                                bgc.arc(bx, cy - bh, 1.5, 0, Math.PI * 2);
                                bgc.fill();
                            }
                        }
                    } else if (isAridWest) {
                        // Steppe cypress
                        bgc.fillStyle = "#222B1A";
                        bgc.beginPath();
                        bgc.ellipse(cx, cy, treeSize * 0.3, treeSize, 0, 0, Math.PI * 2);
                        bgc.fill();
                    } else {
                        // Central Song willow / oak
                        bgc.fillStyle = `rgb(${25 + Math.random() * 10}, ${35 + Math.random() * 10}, 20)`;
                        bgc.beginPath();
                        bgc.arc(cx, cy, treeSize, 0, Math.PI * 2);
                        if (treeRand > 0.7) {
                            bgc.arc(cx - treeSize * 0.5, cy + treeSize * 0.3, treeSize * 0.6, 0, Math.PI * 2);
                            bgc.arc(cx + treeSize * 0.5, cy + treeSize * 0.3, treeSize * 0.6, 0, Math.PI * 2);
                        }
                        bgc.fill();
                    }
                    bgc.restore();
                }
            }

            // ── MOUNTAIN ICONS & TIMBERLINES ──────────────────────────
            if (tile.name && (tile.name.includes("Mountain") || tile.name.includes("Large Mountains"))) {
                const isDryMountains = tile.name.includes("Large Mountains");
                const isExtremePeak  = tile.name === "Large Mountains";
                const peakSpawnThreshold = isMobile ? 0.991 : 0.984;

                if (hash(i, j) > peakSpawnThreshold) {
                    let isInvalidTerrain = false;
                    if (tile.name.includes("Ocean") || tile.name.includes("Coastal") || tile.name === "River") {
                        isInvalidTerrain = true;
                    }
                    if (!isInvalidTerrain) {
                        for (let ni = -1; ni <= 1 && !isInvalidTerrain; ni++) {
                            for (let nj = -1; nj <= 1 && !isInvalidTerrain; nj++) {
                                const neighbor = worldMap[i + ni] ? worldMap[i + ni][j + nj] : null;
                                if (neighbor) {
                                    const nName = neighbor.name || "";
                                    if (nName.includes("Ocean") || nName.includes("Coastal") || nName === "River") {
                                        isInvalidTerrain = true;
                                    }
                                }
                            }
                        }
                    }
                    if (!isInvalidTerrain) {
                        const scaleMult = isDryMountains ? 4 : 2;
                        const randomXOff = (Math.random() - 0.5) * 120;
                        const randomYOff = (Math.random() - 0.5) * 120;
                        const finalPx = px + randomXOff;
                        const finalPy = py + randomYOff;
                        const heightVar = (Math.random() - 0.5) * (15 * (scaleMult / 4));
                        const widthVar  = (Math.random() - 0.5) * (30 * (scaleMult / 4));
                        const baseHeight = Math.max(8, (tile.e - 0.5) * 25 + 5);
                        const height = (baseHeight * (scaleMult / 2.5)) + heightVar;
                        const width  = (TILE_SIZE * scaleMult) + widthVar;
                        let alpha = 0.75;
                        const taperPad = 500;
                        if (px < taperPad)         alpha = Math.min(alpha, px / taperPad);
                        if (px > bg.width - taperPad)  alpha = Math.min(alpha, (bg.width  - px) / taperPad);
                        if (py < taperPad)         alpha = Math.min(alpha, py / taperPad);
                        if (py > bg.height - taperPad) alpha = Math.min(alpha, (bg.height - py) / taperPad);

                        bgc.save();
                        bgc.globalAlpha = alpha;
                        if (isDryMountains) {
                            drawSnowyPeak(bgc, finalPx, finalPy, width, height, isExtremePeak, TILE_SIZE);
                        } else {
                            drawMountain(bgc, finalPx, finalPy, width, height, TILE_SIZE);
                        }
                        bgc.restore();
                    }
                }

                // Timberline trees on mountain tiles
                const treeDensity = isDryMountains ? 0.95 : 0.60;
                const maxTrees    = isDryMountains ? 1 : 2;
                for (let t = 0; t < maxTrees; t++) {
                    if (Math.random() > treeDensity) {
                        const tX = px + TILE_SIZE / 2 + ((Math.random() - 0.5) * TILE_SIZE * 0.9);
                        const tY = py + TILE_SIZE / 2 + ((Math.random() - 0.5) * TILE_SIZE * 0.9);
                        const treeRand = Math.random();
                        bgc.save();
                        if (isDryMountains) {
                            // Highland pine — tiered
                            const tiers = 2 + Math.floor(Math.random() * 2);
                            const treeWidth = TILE_SIZE * (0.4 + Math.random() * 0.3);
                            bgc.fillStyle = `rgb(${15 + Math.random() * 10}, ${25 + Math.random() * 10}, 20)`;
                            for (let k = 0; k < tiers; k++) {
                                const levelY = tY - (k * 3);
                                const levelW = treeWidth * (1 - (k * 0.3));
                                bgc.beginPath();
                                bgc.moveTo(tX, levelY - 5);
                                bgc.lineTo(tX - levelW, levelY);
                                bgc.lineTo(tX + levelW, levelY);
                                bgc.closePath();
                                bgc.fill();
                            }
                        } else if (treeRand > 0.6) {
                            // Southern banyan
                            const canopy = TILE_SIZE * (0.5 + Math.random() * 0.4);
                            const leafColors = ["#1A2F18", "#0D1F1D", "#223311", "#142414"];
                            for (let k = 0; k < 2; k++) {
                                bgc.fillStyle = leafColors[k];
                                const offX = (Math.random() - 0.5) * canopy;
                                const offY = (Math.random() - 0.5) * canopy;
                                bgc.beginPath();
                                bgc.ellipse(tX + offX, tY + offY, canopy * 0.6, canopy * 0.4, Math.random() * Math.PI, 0, Math.PI * 2);
                                bgc.fill();
                            }
                        } else {
                            // Bamboo thicket
                            for (let s = 0; s < 2; s++) {
                                const sX = tX + (s * 2) - 1;
                                const sH = 6 + Math.random() * 6;
                                bgc.strokeStyle = "#2D3B1E";
                                bgc.lineWidth = 1.2;
                                bgc.beginPath();
                                bgc.moveTo(sX, tY);
                                bgc.lineTo(sX + (Math.random() - 0.5), tY - sH);
                                bgc.stroke();
                                bgc.fillStyle = "#3E4D26";
                                bgc.beginPath();
                                bgc.arc(sX, tY - sH, 1.5, 0, Math.PI * 2);
                                bgc.fill();
                            }
                        }
                        bgc.restore();
                    }
                }
            }
        }
    }

    // ── PARCHMENT VIGNETTE (final) ─────────────────────────────────────
    bgc.globalCompositeOperation = "multiply";
    bgc.fillStyle = "#e0c9a3";
    bgc.fillRect(0, 0, bg.width, bg.height);

    let g = bgc.createRadialGradient(
        bg.width / 2, bg.height / 2, bg.height * 0.3,
        bg.width / 2, bg.height / 2, bg.width  * 0.6
    );
    g.addColorStop(0,   "rgba(255,255,255,0)");
    g.addColorStop(0.7, "rgba(139,69,19,0.4)");
    g.addColorStop(1,   "rgba(0,0,0,0.8)");
    bgc.fillStyle = g;
    bgc.fillRect(0, 0, bg.width, bg.height);
    bgc.globalCompositeOperation = "source-over";

    console.log("[ScenarioRuntime] Cosmetic painting complete.");
}

// ── Fallback drawing helpers (used only if engine helpers aren't on window) ─
function _fallbackDrawHighlandTree(ctx, x, y, color, scale) {
    const TILE_SIZE = window._tradeTileSize || 16;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, TILE_SIZE * scale, 0, Math.PI, true);
    ctx.fill();
}
function _fallbackDrawHighlandBump(ctx, px, py, size) {
    const bumpX = px + (Math.random() * size);
    const bumpY = py + (size * 0.8);
    const bumpW = size * (0.5 + Math.random() * 0.5);
    const bumpH = bumpW * 0.4;
    ctx.fillStyle = `rgba(0, 0, 0, ${0.08 + Math.random() * 0.08})`;
    ctx.beginPath();
    ctx.ellipse(bumpX, bumpY, bumpW, bumpH, 0, 0, Math.PI, true);
    ctx.fill();
}
function _fallbackGetMountainAlpha(size, tileSize) {
    const t = Math.max(0, Math.min(1, size / (tileSize * 2.0)));
    let alpha = 0.78 + (t * 0.18) + ((Math.random() * 0.08) - 0.04);
    return Math.max(0.72, Math.min(0.98, alpha));
}
function _fallbackDrawMountain(ctx, x, y, width, height, tileSize) {
    const alpha = _fallbackGetMountainAlpha(height, tileSize);
    ctx.fillStyle = `rgba(62, 52, 42, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(x - width / 2, y + tileSize);
    ctx.quadraticCurveTo(x, y + tileSize - (height * 1.4), x + width / 2, y + tileSize);
    ctx.fill();
    ctx.fillStyle = `rgba(117, 102, 84, ${Math.min(0.98, alpha + 0.02)})`;
    for (let b = 0; b < 2; b++) {
        const shift = (b - 0.5) * (width * 0.3);
        const bWidth = width * 0.6;
        const bHeight = height * 0.7;
        ctx.beginPath();
        ctx.moveTo(x + shift - bWidth / 2, y + tileSize);
        ctx.quadraticCurveTo(x + shift, y + tileSize - bHeight, x + shift + bWidth / 2, y + tileSize);
        ctx.fill();
    }
}
function _fallbackDrawSnowyPeak(ctx, x, y, width, height, isExtremePeak, tileSize) {
    const alpha = _fallbackGetMountainAlpha(height, tileSize);
    if (alpha <= 0) return;
    const sW = width * 0.25;
    const sH = height * 0.25;
    ctx.fillStyle = `rgba(100, 115, 140, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(x - sW / 2, y + tileSize);
    ctx.lineTo(x - sW * 0.25, y + tileSize - sH * 0.4);
    ctx.lineTo(x, y + tileSize - sH * 1.4);
    ctx.lineTo(x + sW * 0.25, y + tileSize - sH * 0.4);
    ctx.lineTo(x + sW / 2, y + tileSize);
    ctx.fill();
    ctx.fillStyle = isExtremePeak
        ? `rgba(255, 255, 255, ${Math.min(1, alpha + 0.1)})`
        : `rgba(220, 235, 245, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(x, y + tileSize - sH * 1.4);
    ctx.lineTo(x - sW * 0.15, y + tileSize - sH * 0.7);
    ctx.lineTo(x + sW * 0.15, y + tileSize - sH * 0.7);
    ctx.closePath();
    ctx.fill();
}

// ── Architecture colour snapping ────────────────────────────────────────────
// When a scenario faction has a custom colour that does not exactly match any
// built-in faction colour, the city interior (architecture, gates, walls…)
// would receive an unknown faction name and potentially crash or show nothing.
//
// _closestArchFaction(hexColor) converts ANY hex colour into the name of the
// built-in faction whose default colour is nearest in RGB space.  The returned
// name is used as `originalFaction` on each city — this is what enterCity()
// reads to choose architecture.  The city's actual `.faction` (ownership /
// diplomacy) is always the real scenario faction name, unchanged.
//
// Architecture colour palette — exactly mirrors DEFAULT_FACTIONS in
// scenario_editor.js.  If you add a new built-in faction there, add its
// canonical colour here too.
const _ARCH_PALETTE = [
    { name: "Hong Dynasty",          hex: "#d32f2f" },
    { name: "Dab Tribes",            hex: "#00838f" },
    { name: "Great Khaganate",       hex: "#1976d2" },
    { name: "Jinlord Confederacy",   hex: "#455a64" },
    { name: "Tran Realm",            hex: "#388e3c" },
    { name: "Goryun Kingdom",        hex: "#7b1fa2" },
    { name: "Xiaran Dominion",       hex: "#fbc02d" },
    { name: "High Plateau Kingdoms", hex: "#8d6e63" },
    { name: "Yamato Clans",          hex: "#c2185b" },
    { name: "Bandits",               hex: "#222222" },
    { name: "Player",                hex: "#ffffff"  }
];

// Parse "#rrggbb" → [r, g, b] (0-255).  Handles 3- and 6-digit forms.
function _hexToRgb(hex) {
    hex = hex.replace(/^#/, "").toLowerCase();
    if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
    const n = parseInt(hex, 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// Returns the built-in faction name whose default colour is closest (squared
// RGB Euclidean distance) to the supplied hex colour.
function _closestArchFaction(hex) {
    if (!hex) return "Hong Dynasty"; // safe default
    const [r, g, b] = _hexToRgb(hex);
    let best = null, bestDist = Infinity;
    for (const entry of _ARCH_PALETTE) {
        const [er, eg, eb] = _hexToRgb(entry.hex);
        const dist = (r - er) ** 2 + (g - eg) ** 2 + (b - eb) ** 2;
        if (dist < bestDist) { bestDist = dist; best = entry.name; }
    }
    return best || "Hong Dynasty";
}

// Expose for optional use in other modules (e.g. city_system, story scripts)
window._closestArchFaction = _closestArchFaction;

// ── 4. Replace cities ───────────────────────────────────────────────────────
function _replaceCities(scenarioDoc, citiesRef, W, H) {
    // Empty the array (preserve the reference!)
    citiesRef.length = 0;

    scenarioDoc.cities.forEach(c => {
        // Determine the architecture template to use.
        // 1. If the faction colour exactly matches a built-in, we get that
        //    faction's name back (zero-distance hit) — business as usual.
        // 2. If the user picked a custom colour, we silently snap to the
        //    nearest built-in so enterCity() always gets a valid architecture.
        // city.faction stays as the real scenario name for ownership/diplomacy.
        const factionColor = scenarioDoc.factions?.[c.faction]?.color || "#888888";
        const archFaction  = _closestArchFaction(factionColor);

        const newCity = {
            name: c.name,
            faction: c.faction,      // real name — used by diplomacy / NPC / UI
            x: c.xPct * W,
            y: c.yPct * H,
            pop: c.pop || 3000,
            radius: 25,
            // originalFaction is what enterCity() passes to the architecture
            // system.  Always a known built-in name, never a custom string.
            originalFaction: archFaction
        };

        if (typeof window.initializeCityData === "function") {
            window.initializeCityData(newCity, W, H);
        }
        citiesRef.push(newCity);
    });

    // Re-init city interiors (gates, walls, etc.) for each
    if (typeof window.initAllCities === "function" && window.FACTIONS) {
        try {
            // initAllCities is async — we just kick it off
            window.initAllCities(window.FACTIONS);
        } catch (err) {
            console.warn("[ScenarioRuntime] initAllCities failed:", err);
        }
    }
}

// ── 5. Re-spawn NPCs ────────────────────────────────────────────────────────
function _respawnNPCsFromScenarioCities() {
    if (typeof window.initializeNPCs !== "function") return;
    const cities    = window.cities_sandbox;
    const worldMap  = window._tradeWorldRef;
    const TILE_SIZE = window._tradeTileSize || 16;
    const W = window.WORLD_WIDTH_sandbox  || 4000;
    const H = window.WORLD_HEIGHT_sandbox || 3000;
    const COLS = Math.floor(W / TILE_SIZE);
    const ROWS = Math.floor(H / TILE_SIZE);
    const padX = Math.floor(W * 0.03);
    const padY = Math.floor(H * 0.03);

    try {
        // Clear the live globalNPCs array (it's not exposed but initializeNPCs
        // resets it internally).
        window.initializeNPCs(cities, worldMap, TILE_SIZE, COLS, ROWS, padX, padY);
    } catch (err) {
        console.warn("[ScenarioRuntime] NPC re-init failed:", err);
    }
}

// ── 6. Place player ─────────────────────────────────────────────────────────
//
// FIX (Story 1 player-not-updating bug):
// This function originally ignored scenarioDoc.playerSetup entirely. It only
// looked for a "Player's Kingdom" faction city and fell back to a random
// land tile. That meant scenarios like Hakata Bay (which set PLAYER_SETUP
// with explicit x/y/troops/faction) had their player overrides silently
// dropped at world-apply time — the player ended up at Hakata City with
// the sandbox-default 20 units, regardless of what the scenario said.
//
// Now we honor playerSetup FIRST. If the scenario specifies x/y, troops,
// faction, or roster, we apply them directly to window.player here. Only
// if no playerSetup is present do we fall back to the legacy city-anchor
// behavior. This is the AUTHORITATIVE player setup — scenario_triggers.js
// _applyPlayerSetup is the secondary safety-net that runs again later.
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ SHARED ROSTER EXPANSION HELPER                                           ║
// ║                                                                          ║
// ║ Converts a compact roster definition (unit-type list + total count) into ║
// ║ the full {type, exp} array the engine expects.                           ║
// ║                                                                          ║
// ║ Two modes, controlled by ps.rosterMode:                                  ║
// ║                                                                          ║
// ║   "distribute" (default) — typeList defines the unit-type BLUEPRINT.     ║
// ║     Unique types are extracted and the full `totalTroops` count is       ║
// ║     filled with an even split ±20% random jitter.                       ║
// ║     e.g. ["Archer","Spearman"] + troops=80 → ~40 Archers, ~40 Spearmen  ║
// ║                                                                          ║
// ║   "hard" — typeList is treated as the LITERAL exact roster.              ║
// ║     Each entry in typeList = one troop.  Any gap between typeList.length ║
// ║     and `totalTroops` is padded with Militia.                            ║
// ║     e.g. ["Archer","Archer","Spearman"] + troops=80 → 3 explicit +      ║
// ║     77 Militia.                                                           ║
// ║                                                                          ║
// ║ Returns an array of {type, exp:1} objects, or null if typeList is empty. ║
// ║ Exposed as window._expandScenarioRoster so scenario_triggers.js can     ║
// ║ use the same logic without duplicating it.                               ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _expandScenarioRoster(typeList, totalTroops, mode) {
    if (!Array.isArray(typeList) || typeList.length === 0) return null;

    // Normalize each entry to a plain string type name
    const types = typeList
        .map(t => (t && typeof t === "object" && t.type) ? t.type : String(t || "").trim())
        .filter(Boolean);
    if (types.length === 0) return null;

    const total = Math.max(1, totalTroops || types.length);

    // ── Hard mode: literal CSV → pad remainder with Militia ─────────────────
    if (mode === "hard") {
        const result = types.map(t => ({ type: t, exp: 1 }));
        const need = total - result.length;
        for (let i = 0; i < need; i++) result.push({ type: "Militia", exp: 1 });
        if (result.length > total) result.splice(total);
        return result;
    }

    // ── Distribute mode: extract unique types, fill evenly with ±20% jitter ─
    const uniqueTypes = [...new Set(types)];
    const n = uniqueTypes.length;
    const base = Math.floor(total / n);

    // Assign counts with jitter, clamp to ≥ 1
    const counts = uniqueTypes.map(t => {
        const jitter = Math.round(base * 0.2 * (Math.random() * 2 - 1));
        return { type: t, count: Math.max(1, base + jitter) };
    });

    // Normalise sum to exactly `total`
    let diff = total - counts.reduce((a, c) => a + c.count, 0);
    for (let idx = 0; diff !== 0; idx = (idx + 1) % n) {
        if (diff > 0) { counts[idx].count++; diff--; }
        else if (counts[idx].count > 1) { counts[idx].count--; diff++; }
    }

    // Interleave types for variety (Archer, Spearman, Archer, Spearman, …)
    const result = [];
    const maxCount = Math.max(...counts.map(c => c.count));
    for (let slot = 0; slot < maxCount; slot++) {
        counts.forEach(c => {
            if (slot < c.count) result.push({ type: c.type, exp: 1 });
        });
    }

    // Final safety trim / pad (shouldn't be needed but guards edge cases)
    while (result.length > total) result.pop();
    while (result.length < total) {
        result.push({ type: uniqueTypes[result.length % n], exp: 1 });
    }
    return result;
}
// Expose so scenario_triggers.js can use the same expansion logic
window._expandScenarioRoster = _expandScenarioRoster;

function _placePlayer(scenarioDoc, W, H) {
    if (typeof window.player === "undefined") return; // sandbox not loaded yet

    const ps = (scenarioDoc && scenarioDoc.playerSetup) || null;

    // ── Path A: scenario provides explicit playerSetup ─────────────────────
    if (ps) {
        // Editor saves xPct/yPct (0-1 fraction). Convert to world pixels using
        // live world dimensions if absolute x/y are not already present.
        if (typeof ps.x !== "number" && typeof ps.xPct === "number") {
            ps.x = ps.xPct * W;
        }
        if (typeof ps.y !== "number" && typeof ps.yPct === "number") {
            ps.y = ps.yPct * H;
        }
        if (typeof ps.x === "number") window.player.x = ps.x;
        if (typeof ps.y === "number") window.player.y = ps.y;
        if (typeof ps.faction === "string" && ps.faction) {
            window.player.faction = ps.faction;
        }
        if (typeof ps.gold === "number")      window.player.gold      = ps.gold;
        if (typeof ps.food === "number")      window.player.food      = ps.food;
        if (typeof ps.hp === "number")        window.player.hp        = ps.hp;
        if (typeof ps.maxHealth === "number") window.player.maxHealth = ps.maxHealth;
        if (Array.isArray(ps.enemies)) window.player.enemies = ps.enemies.slice();

        // ── Roster expansion ───────────────────────────────────────────────
        // Normalise roster to a type-string array regardless of source format
        // (array-of-strings, array-of-{type}-objects, or CSV string).
        let rawTypes = null;
        if (Array.isArray(ps.roster) && ps.roster.length > 0) {
            rawTypes = ps.roster.map(r =>
                (typeof r === "string") ? r :
                (r && r.type)          ? r.type : "Militia"
            );
        } else if (typeof ps.roster === "string" && ps.roster.trim()) {
            rawTypes = ps.roster.split(",").map(s => s.trim()).filter(Boolean);
        }

        if (rawTypes && rawTypes.length > 0) {
            // Use the shared expansion helper (distribute vs hard mode)
            const totalTroops = (typeof ps.troops === "number" && ps.troops > 0)
                                ? ps.troops : rawTypes.length;
            const rosterArr = _expandScenarioRoster(rawTypes, totalTroops, ps.rosterMode);
            if (rosterArr && rosterArr.length > 0) {
                window.player.roster = rosterArr;
                window.player.troops = rosterArr.length;
            }
        } else if (typeof ps.troops === "number" && ps.troops > 0) {
            // Blank roster → just set the count; keep whatever unit mix exists
            window.player.troops = ps.troops;
        }

        console.log("[ScenarioRuntime] _placePlayer applied playerSetup:",
                    "pos=(" + window.player.x + "," + window.player.y + ")",
                    "troops=" + window.player.troops,
                    "faction=" + window.player.faction,
                    "rosterMode=" + (ps.rosterMode || "distribute"));
        return;
    }

    // ── Path B: legacy fallback — anchor on a city ─────────────────────────
    const cities = window.cities_sandbox || [];
    // Alias-aware: accept "Player" canonical OR legacy "Player's Kingdom"
    let target = cities.find(c =>
        c.faction === "Player" || c.faction === "Player's Kingdom" ||
        (window.PlayerFaction && window.PlayerFaction.is(c.faction))
    );
    if (!target && cities.length > 0) target = cities[0];


    if (target) {
        window.player.x = target.x + (Math.random() - 0.5) * 60;
        window.player.y = target.y + (Math.random() - 0.5) * 60;
    } else {
        // Find any non-ocean tile
        const worldMap = window._tradeWorldRef;
        const TILE_SIZE = window._tradeTileSize || 16;
        if (worldMap) {
            for (let tries = 0; tries < 1000; tries++) {
                let x = Math.random() * W, y = Math.random() * H;
                let i = Math.floor(x / TILE_SIZE), j = Math.floor(y / TILE_SIZE);
                let t = worldMap[i] && worldMap[i][j];
                if (t && t.name !== "Ocean" && t.name !== "Coastal" && t.name !== "River") {
                    window.player.x = x;
                    window.player.y = y;
                    break;
                }
            }
        }
    }
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ TRIGGERS (placeholder logic for future expansion)                        ║
// ║                                                                          ║
// ║ A scenario may include an array of triggers. The trigger schema is       ║
// ║ intentionally open-ended for now:                                        ║
// ║   { id, name, when:"start"|"every_tick"|"city_captured"|..., action:{...} }║
// ║                                                                          ║
// ║ Call ScenarioRuntime.fireTrigger("event_name", contextObj) from any      ║
// ║ engine code to dispatch matching triggers.                               ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function fireTrigger(eventName, ctx) {
    if (!rt.active) return;
    const matching = rt.triggers.filter(t => t && t.when === eventName);
    matching.forEach(t => {
        try {
            if (typeof rt.handlers[t.action?.type] === "function") {
                rt.handlers[t.action.type](t, ctx);
            } else {
                console.log(`[ScenarioRuntime] Trigger fired (no handler):`, t);
            }
        } catch (err) { console.warn("[ScenarioRuntime] Trigger error:", err); }
    });
}

// Trigger handlers can be added by future patches — registered here for now.
const handlers = {
    log: (trigger, ctx) => {
        console.log(`[ScenarioTrigger:${trigger.name || trigger.id}]`, trigger.action.message, ctx);
    },
    spawn_npc: (trigger, ctx) => {
        // Stub: spawn an NPC. Future Claude can flesh this out using
        // window.spawnNPCFromCity / window.globalNPCs.
        console.log(`[ScenarioTrigger] spawn_npc — stub`, trigger, ctx);
    }
};
rt.handlers = handlers;

function registerTriggerHandler(typeKey, fn) {
    handlers[typeKey] = fn;
}

// ── Public API ─────────────────────────────────────────────────────────────
return {
    launch,
    fireTrigger,
    registerTriggerHandler,
    getActiveScenario: () => rt.active,

    /**
     * prepareRestore(scenarioDoc)
     *
     * Called by save_system.js when loading a "custom" save that contains a
     * saved scenarioDoc.  Queues the scenario document to be applied after
     * initGame regenerates the base world (via _ensurePostInitHook), so that
     * the full world — terrain, cities, factions — is correctly restored
     * before the player save data is layered on top.
     *
     * Do NOT call launch() from the save-load path — launch() also destroys
     * the menu and shows the loading screen, which save_system.js already
     * handles in _triggerGameStartFromMenu().  prepareRestore() is the
     * lightweight "just queue the scenario" variant.
     */
    prepareRestore: function(scenarioDoc) {
        if (!scenarioDoc) {
            console.error("[ScenarioRuntime] prepareRestore() called with no scenarioDoc.");
            return;
        }
        rt.pending        = scenarioDoc;
        rt.postInitHooked = false; // allow a fresh callback to be queued
        _ensurePostInitHook();
        console.log("[ScenarioRuntime] prepareRestore() — scenario queued for post-init application.");
    },

    _state: rt
};

})();

console.log("[ScenarioRuntime] scenario_update.js loaded.");