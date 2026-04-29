// ============================================================================
// senario_devmade_import.js — Developer-made map → custom scenario importer
// ============================================================================
//
// PURPOSE
// -------
// The Scenario Editor lets you build new maps from scratch, or load .json
// scenario files. But the game also ships TWO hand-built dev maps that aren't
// scenarios at all — they're hard-coded:
//
//   1. Sandbox        — the big procedural-China continent (sandboxmode_*.js)
//   2. Story 1: 1274  — the historical Bun'ei invasion of Kyushu  (story1_map_and_update.js)
//
// Neither of those has a trigger system attached — they just boot, drop the
// player on the map, and let you do whatever. Great for free play, useless
// for storytelling.
//
// THIS module bridges the gap: it captures the LIVE state of one of those
// maps (worldMap, cities, factions) and writes it out as a normal .dog_scenario.json
// file. Once you have that file, you can:
//
//     • Open the Scenario Editor → File → Load Scenario → pick the file.
//     • Use the Trigger Editor (Open Trigger Editor button in the Triggers panel)
//       to build dialogue, intro art, win/lose conditions, important NPCs,
//       timeline events, etc — exactly the same as for any other scenario.
//     • Save the result with your story baked in.
//     • Launch it from Main Menu → Launch Scenario.
//
// The scenario produced is fully compatible with scenario_triggers.js and
// scenario_update.js. Triggers run on the imported map exactly as they would
// on a hand-built one. Both Sandbox AND Story 1 currently run with NO triggers
// at all — this tool lets you add them.
//
// HOW THE IMPORT WORKS
// --------------------
// We piggyback on the dev map's own boot pipeline. Trying to re-implement
// 1500+ lines of biome generators here would be a nightmare. Instead:
//
//     1. User clicks "Import Sandbox / Story 1 to Scenario" on the main menu.
//     2. We hide the menu, show the loading screen, and call the dev map's
//        own initGame() / initGame_story1() — same function the regular
//        "Sandbox" or "Story 1" buttons call. The map fully generates.
//     3. We poll for completion (window._tradeWorldRef populated, cities
//        populated). Polling — not setTimeout — because mobile takes longer.
//     4. We snapshot worldMap → tile e/m/isRiver per scenario column, and
//        cities → xPct/yPct/faction/pop. We snapshot window.FACTIONS → the
//        scenario factions dict (color + geoWeight + enabled).
//     5. We assemble a .dog_scenario.json blob with the SAME schema the
//        editor's _save() function produces, so the editor's _load() reads
//        it back transparently.
//     6. We trigger a download, then offer to reload the page so the user
//        can land back at the main menu cleanly.
//
// We deliberately do NOT try to keep the game running and "switch" to the
// editor — the engine is hard to put back in a clean state once initGame
// has fired. Reload + re-load-from-file is bulletproof.
//
// PUBLIC API
// ----------
//   window.ScenarioDevImport = {
//     importSandbox()       → kicks off sandbox capture flow (UI dialog)
//     importStory1()        → kicks off story 1 capture flow (UI dialog)
//     captureCurrentToFile(metaOpts?)  → low-level: capture WHATEVER map is
//                                         currently live and download it.
//                                         metaOpts = { name, author, description }
//     buildScenarioDoc(metaOpts?)      → low-level: returns the scenario doc
//                                         object (NOT compressed yet) without
//                                         downloading. For programmatic use.
//     VERSION
//   }
//
// ============================================================================

window.ScenarioDevImport = (function () {
"use strict";

const VERSION = "1.0.0";

// ────────────────────────────────────────────────────────────────────────────
// CONFIG
// ────────────────────────────────────────────────────────────────────────────

// Scenario tile dimensions to write out. Sandbox internally is ~250x187, so
// we keep the imported scenario at the same default to preserve fidelity.
// Story 1 also uses the same 4000x3000 world so 250x187 maps cleanly.
const DEFAULT_SCENARIO_TILES_X = 250;
const DEFAULT_SCENARIO_TILES_Y = 187;

// Polling interval / timeout for "is the map done generating yet?".
const POLL_INTERVAL_MS = 250;
const POLL_TIMEOUT_MS  = 60000; // 60s — Story 1 + mobile can be slow

// ────────────────────────────────────────────────────────────────────────────
// FACTION DEFAULTS
//
// scenario_editor.js exposes its DEFAULT_FACTIONS via
//   window.ScenarioEditor.DEFAULT_FACTIONS
// We use that as the authoritative source for cityCount / uniqueTroop / locked
// fields when a faction we capture happens to match a known default. Anything
// captured that ISN'T in the defaults (e.g. "Kamakura Shogunate", "Yuan Dynasty
// Coalition") gets sensible fallbacks.
// ────────────────────────────────────────────────────────────────────────────

function _defaultsForFaction(name) {
    const ed = window.ScenarioEditor && window.ScenarioEditor.DEFAULT_FACTIONS;
    if (ed && ed[name]) return ed[name];
    return null;
}

// Fallback geoWeight if a captured faction has none (e.g. legacy data).
function _fallbackGeoWeight() {
    return { north: 0.50, south: 0.50, west: 0.50, east: 0.50 };
}

// ────────────────────────────────────────────────────────────────────────────
// LOGGING
// ────────────────────────────────────────────────────────────────────────────

function _log(...args)  { console.log("[ScenarioDevImport]", ...args); }
function _warn(...args) { console.warn("[ScenarioDevImport]", ...args); }
function _err(...args)  { console.error("[ScenarioDevImport]", ...args); }

// ────────────────────────────────────────────────────────────────────────────
// LIVE-ENGINE READERS
//
// These pull the current state from whatever map is live. They're agnostic to
// whether sandbox or story1 is running — both expose the same window globals
// after their respective initGames complete (sandbox does it directly; story1
// explicitly mirrors with `window.cities_sandbox = cities; window._tradeWorldRef = worldMap;`).
// ────────────────────────────────────────────────────────────────────────────

function _liveWorldMap() {
    // sandboxmode_overworld.js exposes worldMap[][] under different names
    // depending on whether scenario_update.js has been loaded.
    return window._tradeWorldRef
        || window.worldMap
        || null;
}

function _liveCities() {
    return window.cities_sandbox || window.cities || null;
}

function _liveWorldDims() {
    return {
        W: window.WORLD_WIDTH_sandbox  || 4000,
        H: window.WORLD_HEIGHT_sandbox || 3000,
        TILE_SIZE: window._tradeTileSize || 16
    };
}

function _liveFactions() {
    return window.FACTIONS || {};
}

function _liveGlobalNPCs() {
    // globalNPCs is `let` inside sandboxmode_npc_system.js's IIFE — but the
    // module also exposes a getter sometimes. Try a couple of paths.
    if (Array.isArray(window.globalNPCs)) return window.globalNPCs;
    if (typeof window.getGlobalNPCs === "function") return window.getGlobalNPCs();
    return [];
}

// ────────────────────────────────────────────────────────────────────────────
// READINESS CHECK
//
// "Is the map fully generated yet?" — used by _waitForMapReady().
// ────────────────────────────────────────────────────────────────────────────

function _isMapReady() {
    const wm = _liveWorldMap();
    const cs = _liveCities();
    if (!wm || !Array.isArray(wm) || wm.length === 0) return false;
    if (!Array.isArray(wm[0]) || wm[0].length === 0) return false;
    // worldMap is built before cities populate, so wait for at least 1 city.
    if (!cs || !Array.isArray(cs) || cs.length === 0) return false;
    // Also wait for the draw loop so the user sees something.
    return true;
}

function _waitForMapReady(timeoutMs) {
    timeoutMs = timeoutMs || POLL_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
        const t0 = performance.now();
        const tick = () => {
            if (_isMapReady()) {
                _log("Map ready after", Math.round(performance.now() - t0), "ms");
                resolve();
                return;
            }
            if (performance.now() - t0 > timeoutMs) {
                reject(new Error("Timed out waiting for dev map to finish generating."));
                return;
            }
            setTimeout(tick, POLL_INTERVAL_MS);
        };
        tick();
    });
}

// ────────────────────────────────────────────────────────────────────────────
// TILE SAMPLER
//
// The scenario format wants tilesX × tilesY tile objects. The live worldMap
// is a different size (250×187 for sandbox @ TILE_SIZE 16, but tilesX is
// derived as floor(WORLD_WIDTH/TILE_SIZE) = 250 — they match). We still
// resample defensively in case dimensions ever differ.
//
// Each scenario tile keeps the FULL tile object the editor expects (id,
// color, speed, impassable, name, e, m, isRiver). When _save() compresses
// later, only e / m / isRiver actually go to disk — but we leave the full
// objects in place so the editor can render the scenario immediately on load
// without re-running classifyTile.
// ────────────────────────────────────────────────────────────────────────────

function _sampleTilesFromWorldMap(worldMap, scenarioTilesX, scenarioTilesY) {
    const srcCols = worldMap.length;
    const srcRows = worldMap[0].length;

    const tiles = new Array(scenarioTilesX);
    for (let i = 0; i < scenarioTilesX; i++) {
        tiles[i] = new Array(scenarioTilesY);
        const sx = Math.min(srcCols - 1, Math.floor((i / scenarioTilesX) * srcCols));

        for (let j = 0; j < scenarioTilesY; j++) {
            const sy = Math.min(srcRows - 1, Math.floor((j / scenarioTilesY) * srcRows));
            const src = worldMap[sx] && worldMap[sx][sy];

            if (!src) {
                // Gap — drop a Plains tile so editor doesn't crash.
                tiles[i][j] = {
                    id: 0, color: "#a3a073", speed: 0.85, impassable: false,
                    name: "Plains", e: 0.45, m: 0.50, isRiver: false
                };
                continue;
            }

            // Clone and normalize. Some sandbox tiles don't have isRiver field
            // explicitly — we infer from name === "River".
            tiles[i][j] = {
                id:         src.id || 0,
                color:      src.color || "#a3a073",
                speed:      typeof src.speed === "number" ? src.speed : 1.0,
                impassable: !!src.impassable,
                name:       src.name || "Plains",
                e:          typeof src.e === "number" ? src.e : 0.45,
                m:          typeof src.m === "number" ? src.m : 0.50,
                isRiver:    src.isRiver || src.name === "River" || false
            };
        }
    }
    return tiles;
}

// ────────────────────────────────────────────────────────────────────────────
// CITY EXPORT
//
// Live engine cities have:   { name, x, y, faction, pop, color, ... }   (px coords)
// Scenario format wants:     { name, xPct, yPct, faction, pop, custom: bool }
//
// We strip live-engine-only fields (radius, conscriptionRate, troops, ...)
// because those get re-derived by initializeCityData() when the scenario boots.
// Keeping them in would cause double-counting on next launch.
// ────────────────────────────────────────────────────────────────────────────

function _exportCities(liveCities, worldW, worldH) {
    const out = [];
    liveCities.forEach(c => {
        if (!c || typeof c.x !== "number" || typeof c.y !== "number") return;

        out.push({
            name:    c.name || "Settlement",
            faction: c.faction || "Bandits",
            xPct:    Math.max(0.001, Math.min(0.999, c.x / worldW)),
            yPct:    Math.max(0.001, Math.min(0.999, c.y / worldH)),
            pop:     typeof c.pop === "number" ? Math.max(100, Math.floor(c.pop)) : 3000,
            // 'custom: true' tells the editor that this city was placed by the
            // user (not auto-populated). We mark imported cities as custom so
            // the editor won't try to overwrite them via _autoPopulateCities.
            custom:  true
        });
    });
    return out;
}

// ────────────────────────────────────────────────────────────────────────────
// FACTION EXPORT
//
// Captures window.FACTIONS plus any defaults from the editor's DEFAULT_FACTIONS
// dict. The captured set is the union of:
//   • Every faction currently in window.FACTIONS (live)
//   • Every faction that owns at least one captured city (in case a faction
//     exists ONLY in cities, not in window.FACTIONS — defensive).
//   • Bandits + Player's Kingdom (always present in DEFAULT_FACTIONS).
//
// For each faction, we resolve order, color, geoWeight, enabled, cityCount,
// uniqueTroop using the editor defaults as a fallback.
// ────────────────────────────────────────────────────────────────────────────

function _exportFactions(liveFactions, exportedCities, opts) {
    opts = opts || {};
    const factionsOut = {};
    const allNames = new Set();

    Object.keys(liveFactions || {}).forEach(n => allNames.add(n));
    exportedCities.forEach(c => { if (c.faction) allNames.add(c.faction); });
    // Player's Kingdom and Bandits should always exist for engine compatibility.
    allNames.add("Player's Kingdom");
    allNames.add("Bandits");

    let order = 0;
    allNames.forEach(name => {
        const live = liveFactions && liveFactions[name];
        const def  = _defaultsForFaction(name) || {};

        // Color: live wins, then editor default, then a neutral grey.
        const color =
            (live && live.color) ||
            def.color ||
            "#888888";

        // geoWeight: live wins, then editor default, then a centered fallback.
        let geoWeight =
            (live && live.geoWeight) ||
            def.geoWeight ||
            _fallbackGeoWeight();

        // Clone so future mutations don't leak back.
        geoWeight = {
            north: typeof geoWeight.north === "number" ? geoWeight.north : 0.50,
            south: typeof geoWeight.south === "number" ? geoWeight.south : 0.50,
            west:  typeof geoWeight.west  === "number" ? geoWeight.west  : 0.50,
            east:  typeof geoWeight.east  === "number" ? geoWeight.east  : 0.50
        };

        // cityCount: count cities that this faction actually owns in the
        // captured data. This way the imported scenario reflects the dev map
        // honestly. Player's Kingdom usually has 0 cities in dev maps —
        // we set it to 1 so the player has somewhere to start in scenario mode.
        let cityCount = exportedCities.filter(c => c.faction === name).length;
        if (name === "Player's Kingdom" && cityCount === 0) cityCount = 1;
        if (name === "Bandits") cityCount = 0;

        const uniqueTroop = (live && live.uniqueTroop) || def.uniqueTroop || "";

        factionsOut[name] = {
            color:       color,
            geoWeight:   geoWeight,
            enabled:     true,
            locked:      !!def.locked,
            order:       order,
            cityCount:   cityCount,
            uniqueTroop: uniqueTroop
        };
        order++;
    });

    return factionsOut;
}

// ────────────────────────────────────────────────────────────────────────────
// IMPORTANT NPCs (optional)
//
// The trigger system supports an importantNpcs[] array — story-significant
// characters with portraits, custom rosters, named identities, etc. The dev
// maps have plenty of generic globalNPCs (military patrols, traders, bandits)
// but none are "story-significant" by default — they're randomly generated.
//
// We DON'T auto-promote random NPCs to important. That'd litter the imported
// scenario with junk like "Settlement Patrol #34". Instead, importantNpcs
// starts empty and the scenario author adds them via the trigger editor's
// NPCs tab. This keeps imports clean.
//
// However, we DO offer the option in the dialog: "include named patrol/Bandit
// NPCs as starting important NPCs?" — if the user checks it, we promote them.
// Power-user flag; unchecked by default.
// ────────────────────────────────────────────────────────────────────────────

function _exportImportantNpcs(liveNpcs, opts) {
    if (!opts || !opts.includeNPCs) return [];
    if (!Array.isArray(liveNpcs) || liveNpcs.length === 0) return [];

    const out = [];
    liveNpcs.forEach((n, idx) => {
        if (!n || typeof n.x !== "number" || typeof n.y !== "number") return;
        // Skip Bandits in default include — they're noisy. User can enable
        // "include bandits" in the dialog.
        if (n.faction === "Bandits" && !opts.includeBandits) return;

        out.push({
            id:         "imported_npc_" + (n.id || idx),
            name:       n.name || (n.faction + " " + (n.role || "Unit") + " " + idx),
            faction:    n.faction || "Bandits",
            x:          n.x,
            y:          n.y,
            targetX:    typeof n.targetX === "number" ? n.targetX : n.x,
            targetY:    typeof n.targetY === "number" ? n.targetY : n.y,
            role:       n.role || "Military",
            troops:     typeof n.count === "number" ? n.count : 30,
            // Convert live roster (array of unit-type strings or objects) to
            // CSV string — that's what the trigger editor's NPC card uses.
            roster:     _rosterArrayToCsv(n.roster),
            hp:         200,
            attack:     15,
            defense:    10,
            armor:      10,
            gold:       n.gold || 0,
            food:       n.food || 100,
            portraitUrl: ""
        });
    });
    return out;
}

function _rosterArrayToCsv(roster) {
    if (!Array.isArray(roster) || roster.length === 0) return "";
    return roster.map(r => {
        if (typeof r === "string") return r;
        if (r && typeof r === "object") return r.type || r.name || "Militia";
        return "Militia";
    }).join(", ");
}

// ────────────────────────────────────────────────────────────────────────────
// PLAYER SETUP EXPORT
//
// scenario_triggers.js's "Player" tab populates scenario.playerSetup{x,y,
// faction,troops,gold,food,hp,maxHealth,enemies,roster}. We capture the
// player's CURRENT live state so the imported scenario starts the player in
// the same spot the dev map would.
// ────────────────────────────────────────────────────────────────────────────

function _exportPlayerSetup() {
    const p = window.player;
    if (!p) return null;
    return {
        x:         typeof p.x === "number" ? p.x : 2000,
        y:         typeof p.y === "number" ? p.y : 1500,
        faction:   p.faction   || "Player's Kingdom",
        troops:    typeof p.troops === "number" ? p.troops : 30,
        gold:      typeof p.gold === "number" ? p.gold : 1000,
        food:      typeof p.food === "number" ? p.food : 1000,
        hp:        typeof p.hp === "number" ? p.hp : 150,
        maxHealth: typeof p.maxHealth === "number" ? p.maxHealth : 150,
        enemies:   Array.isArray(p.enemies) ? p.enemies.slice() : ["Bandits"],
        roster:    _rosterArrayToCsv(p.roster) || ""
    };
}

// ────────────────────────────────────────────────────────────────────────────
// SCENARIO DOC ASSEMBLY
//
// Everything above flows into here. The result is a scenario doc IDENTICAL
// in shape to what _newScenarioDoc + _generateScenarioTiles + _autoPopulateCities
// produce — meaning the editor's _save() / _load() handles it natively.
//
// We also add the trigger-system fields (storyIntro, scenarioVars, winLose,
// timeline, importantNpcs, playerSetup) so the scenario has placeholder
// scaffolding ready for trigger editing. They're empty / default values —
// the user fills them in via the Trigger Editor.
// ────────────────────────────────────────────────────────────────────────────

function buildScenarioDoc(metaOpts) {
    metaOpts = metaOpts || {};

    const worldMap = _liveWorldMap();
    const cities   = _liveCities();
    const dims     = _liveWorldDims();

    if (!worldMap) throw new Error("No live worldMap to capture. Boot a dev map first.");
    if (!cities)   throw new Error("No live cities to capture. Boot a dev map first.");

    const tilesX = metaOpts.tilesX || DEFAULT_SCENARIO_TILES_X;
    const tilesY = metaOpts.tilesY || DEFAULT_SCENARIO_TILES_Y;

    _log("Building scenario doc:", {
        sourceMap: tilesX + "x" + tilesY,
        liveWorldMap: worldMap.length + "x" + (worldMap[0]?.length || 0),
        liveCities: cities.length,
        liveFactions: Object.keys(_liveFactions()).length
    });

    const exportedCities = _exportCities(cities, dims.W, dims.H);
    const exportedFactions = _exportFactions(_liveFactions(), exportedCities, metaOpts);
    const tiles = _sampleTilesFromWorldMap(worldMap, tilesX, tilesY);

    const importantNpcs = _exportImportantNpcs(_liveGlobalNPCs(), {
        includeNPCs:    !!metaOpts.includeNPCs,
        includeBandits: !!metaOpts.includeBandits
    });

    const playerSetup = _exportPlayerSetup() || {
        x: dims.W / 2, y: dims.H / 2,
        faction: "Player's Kingdom",
        troops: 30, gold: 1000, food: 1000,
        hp: 150, maxHealth: 150,
        enemies: ["Bandits"], roster: ""
    };

    const scenario = {
        version: 2,

        meta: {
            name:        metaOpts.name        || "Imported Scenario",
            author:      metaOpts.author      || "Imported",
            description: metaOpts.description || "Captured from a developer-built map.",
            created:     new Date().toISOString(),
            modified:    new Date().toISOString(),
            // Tag where this came from so future tools can know.
            importedFrom: metaOpts.source || "unknown"
        },

        dimensions: { tilesX: tilesX, tilesY: tilesY },
        factions:   exportedFactions,
        cities:     exportedCities,
        tiles:      tiles,

        // Trigger-system scaffolding. All empty / default — the user populates
        // these via the Trigger Editor (Triggers panel → Open Trigger Editor).
        triggers:      [],
        importantNpcs: importantNpcs,
        playerSetup:   playerSetup,
        storyIntro: {
            enabled:      false,
            fadeMs:       1500,
            fadeColor:    "#000000",
            titleCard:    { title: "", subtitle: "", ms: 3500 },
            art:          "",
            artMs:        4000,
            kenburns:     true,
            lines:        [],
            letterbox:    true,
            typewriterCps: 35
        },
        scenarioVars: {},
        winLose: {
            winRules:        [],
            loseRules:       [],
            victoryTitle:    "Victory!",
            victorySubtitle: "Your scenario goals were achieved.",
            defeatTitle:     "Defeat",
            defeatSubtitle:  "Your scenario was lost."
        },
        timeline: [],

        mapData:      "imported",
        cityStrategy: "none",  // imported cities are explicit; don't re-roll
        seed:         Math.floor(Math.random() * 1e9)
    };

    return scenario;
}

// ────────────────────────────────────────────────────────────────────────────
// COMPRESS + DOWNLOAD
//
// Mirrors scenario_editor.js's _save() compression so the file the editor
// produces and the file we produce are byte-identical in schema. Editor's
// _load → _restoreScenarioFromCompact reads e/m/r per tile and rebuilds the
// full tile object via classifyTile.
// ────────────────────────────────────────────────────────────────────────────

function _downloadScenarioJSON(scenarioDoc) {
    const compact = {
        ...scenarioDoc,
        tiles: scenarioDoc.tiles.map(col =>
            col.map(t => ({
                e: +t.e.toFixed(3),
                m: +t.m.toFixed(3),
                r: !!t.isRiver
            }))
        )
    };
    const json = JSON.stringify(compact, null, 2);

    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");

    const safeName = (scenarioDoc.meta.name.replace(/[^a-z0-9_-]/gi, "_") || "imported")
                     + ".dog_scenario.json";
    a.href     = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 200);

    _log("Downloaded:", safeName, "(" + Math.round(json.length / 1024) + " KB)");
    return safeName;
}

function captureCurrentToFile(metaOpts) {
    const doc = buildScenarioDoc(metaOpts);
    return _downloadScenarioJSON(doc);
}

// ────────────────────────────────────────────────────────────────────────────
// UI — Main-menu buttons + import dialogs
//
// Two new buttons go on the main menu, after the existing "Scenario Editor"
// button. Clicking either opens a dialog that lets the user fill in the new
// scenario's name/author/description, choose what to include, and confirm.
//
// We follow the same MutationObserver pattern that scenario_editor.js uses
// so we don't fight with menu.js for ordering.
// ────────────────────────────────────────────────────────────────────────────

function _styleMenuBtn(btn) {
    Object.assign(btn.style, {
        background:    "linear-gradient(to bottom, #2a3a1c, #15200a)",
        color:         "#c8e0a8",
        border:        "2px solid #6a8a4a",
        padding:       "15px",
        margin:        "10px",
        fontFamily:    "Georgia, serif",
        fontSize:      "1.2rem",
        fontWeight:    "bold",
        cursor:        "pointer",
        borderRadius:  "4px",
        textTransform: "uppercase",
        width:         "min(280px, 85vw)",
        boxSizing:     "border-box",
        transition:    "all 0.2s",
        boxShadow:     "0 4px 6px rgba(0,0,0,0.5)",
        display:       "none",
        letterSpacing: "1px"
    });
    btn.onmouseenter = () => {
        btn.style.background = "linear-gradient(to bottom, #3a5a2c, #2a3a1c)";
        btn.style.color      = "#ffffff";
        btn.style.boxShadow  = "0 0 20px #6a8a4a";
        btn.style.transform  = "scale(1.05)";
    };
    btn.onmouseleave = () => {
        btn.style.background = "linear-gradient(to bottom, #2a3a1c, #15200a)";
        btn.style.color      = "#c8e0a8";
        btn.style.boxShadow  = "0 4px 6px rgba(0,0,0,0.5)";
        btn.style.transform  = "scale(1)";
    };
}

// ── The pre-import dialog ───────────────────────────────────────────────────
//
// Asks for scenario name/author/description, plus checkboxes for optional
// includes. Returns a Promise that resolves to the metaOpts object, or null
// if the user cancelled.
function _showImportDialog(sourceLabel, sourceKey, defaultName) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        Object.assign(overlay.style, {
            position: "fixed", inset: "0", background: "rgba(0,0,0,0.85)",
            zIndex: "20000", display: "flex", alignItems: "center",
            justifyContent: "center", fontFamily: "Tahoma, Verdana, sans-serif"
        });

        const panel = document.createElement("div");
        Object.assign(panel.style, {
            background: "#1a1f2a", border: "2px solid #6a8a4a",
            borderRadius: "6px", padding: "24px",
            maxWidth: "min(560px, 92vw)", width: "100%",
            color: "#cfd8dc", boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
            maxHeight: "90vh", overflowY: "auto"
        });
        panel.innerHTML = `
            <h2 style="margin-top:0;color:#c8e0a8;border-bottom:1px solid #6a8a4a;padding-bottom:8px;">
                Import ${sourceLabel} → Custom Scenario
            </h2>

            <p style="color:#aac;font-size:0.92em;line-height:1.5;">
                This will boot the <strong>${sourceLabel}</strong> map briefly to capture its
                terrain, cities, and factions, then download a <code>.dog_scenario.json</code>
                file that you can open in the Scenario Editor.
                <br><br>
                Once captured, open the editor and use <strong>File → Load Scenario</strong>
                to start adding triggers, dialogue, intro art, and win/lose conditions on top
                of this map.
            </p>

            <fieldset style="border:1px solid #4a6a4a;padding:10px;margin-top:14px;">
                <legend style="color:#c8e0a8;">Scenario Info</legend>

                <label style="display:block;margin-bottom:6px;">
                    Name:&nbsp;
                    <input id="dim-name" type="text" value="${_esc(defaultName)}"
                           style="width:300px;background:#0e1218;color:#cfd8dc;border:1px solid #4a6a4a;padding:4px;">
                </label>

                <label style="display:block;margin-bottom:6px;">
                    Author:&nbsp;
                    <input id="dim-author" type="text" value=""
                           style="width:200px;background:#0e1218;color:#cfd8dc;border:1px solid #4a6a4a;padding:4px;">
                </label>

                <label style="display:block;margin-bottom:6px;">
                    Description:<br>
                    <textarea id="dim-desc" rows="2"
                              style="width:96%;background:#0e1218;color:#cfd8dc;border:1px solid #4a6a4a;padding:4px;"
                    >Imported from the ${sourceLabel} dev map. Add your story here.</textarea>
                </label>
            </fieldset>

            <fieldset style="border:1px solid #4a6a4a;padding:10px;margin-top:10px;">
                <legend style="color:#c8e0a8;">Map Resolution</legend>
                <label>Tiles X: <input id="dim-tx" type="number" min="100" max="1000" value="${DEFAULT_SCENARIO_TILES_X}" style="width:80px;"></label>
                <label style="margin-left:18px;">Tiles Y: <input id="dim-ty" type="number" min="100" max="1000" value="${DEFAULT_SCENARIO_TILES_Y}" style="width:80px;"></label>
                <p style="font-size:0.85em;color:#8aa;margin:6px 0 0 0;">
                    250×187 matches the live engine grid 1:1. Lower values = smaller file but blurrier.
                </p>
            </fieldset>

            <fieldset style="border:1px solid #4a6a4a;padding:10px;margin-top:10px;">
                <legend style="color:#c8e0a8;">Optional Captures</legend>

                <label style="display:block;margin-bottom:4px;">
                    <input id="dim-npcs" type="checkbox">
                    Include live NPC patrols/traders as <strong>important NPCs</strong>
                    <br><span style="color:#888;font-size:0.85em;margin-left:24px;">
                        Off by default — they're random and noisy. Mostly useful for testing.
                    </span>
                </label>

                <label style="display:block;margin-bottom:4px;">
                    <input id="dim-bandits" type="checkbox">
                    ...also include Bandit NPCs in that list
                    <span style="color:#888;font-size:0.85em;">(only if above is checked)</span>
                </label>
            </fieldset>

            <div style="margin-top:18px;text-align:right;">
                <button id="dim-cancel"
                        style="padding:8px 16px;margin-right:8px;background:#3a1a1a;color:#ffaaaa;border:1px solid #aa4444;cursor:pointer;">
                    Cancel
                </button>
                <button id="dim-go"
                        style="padding:8px 24px;background:#1a3a5c;color:#c8e0a8;border:2px solid #6a8a4a;font-weight:bold;cursor:pointer;">
                    Capture &amp; Download →
                </button>
            </div>

            <p style="color:#aa6;font-size:0.82em;margin-top:14px;">
                ⚠ The page will reload after capture so the engine returns to a clean main-menu state.
                The downloaded file goes to your browser's default Downloads folder.
            </p>
        `;
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        // Wire buttons
        panel.querySelector("#dim-cancel").onclick = () => {
            overlay.remove();
            resolve(null);
        };
        panel.querySelector("#dim-go").onclick = () => {
            const opts = {
                source:         sourceKey,
                name:           panel.querySelector("#dim-name").value.trim() || defaultName,
                author:         panel.querySelector("#dim-author").value.trim(),
                description:    panel.querySelector("#dim-desc").value.trim(),
                tilesX:         Math.max(100, Math.min(1000, parseInt(panel.querySelector("#dim-tx").value, 10) || DEFAULT_SCENARIO_TILES_X)),
                tilesY:         Math.max(100, Math.min(1000, parseInt(panel.querySelector("#dim-ty").value, 10) || DEFAULT_SCENARIO_TILES_Y)),
                includeNPCs:    panel.querySelector("#dim-npcs").checked,
                includeBandits: panel.querySelector("#dim-bandits").checked
            };
            overlay.remove();
            resolve(opts);
        };
    });
}

function _esc(s) {
    if (s === null || s === undefined) return "";
    return String(s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Progress overlay ────────────────────────────────────────────────────────
//
// Replaces the menu while we boot the dev map and capture. Shows a status
// line and a console-mirror so the user sees what's happening on slow
// devices.
function _showProgress(stepText) {
    let ov = document.getElementById("scenario-import-progress");
    if (!ov) {
        ov = document.createElement("div");
        ov.id = "scenario-import-progress";
        Object.assign(ov.style, {
            position: "fixed", inset: "0", background: "#0a0e14",
            color: "#c8e0a8", zIndex: "30000",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", fontFamily: "Georgia, serif",
            fontSize: "1.3rem", textAlign: "center", padding: "20px"
        });
        ov.innerHTML = `
            <h2 style="color:#c8e0a8;border-bottom:1px solid #6a8a4a;padding-bottom:8px;margin-bottom:18px;">
                Importing dev map…
            </h2>
            <div id="scenario-import-step" style="margin-bottom:14px;font-size:1.1rem;color:#aac;">${_esc(stepText)}</div>
            <div style="font-size:0.9em;color:#888;max-width:560px;line-height:1.5;">
                Booting the dev map fully so its terrain &amp; cities can be captured. This may take 5–30 seconds.
                <br><br>
                When the capture finishes, a <code>.dog_scenario.json</code> file will download
                automatically and the page will reload.
            </div>
        `;
        document.body.appendChild(ov);
    } else {
        ov.querySelector("#scenario-import-step").textContent = stepText;
    }
}

function _hideProgress() {
    const ov = document.getElementById("scenario-import-progress");
    if (ov) ov.remove();
}

// ────────────────────────────────────────────────────────────────────────────
// IMPORT FLOWS
// ────────────────────────────────────────────────────────────────────────────

async function importSandbox() {
    const opts = await _showImportDialog("Sandbox (Procedural China)", "sandbox",
                                          "Sandbox Custom Scenario");
    if (!opts) return;

    if (typeof window.initGame !== "function") {
        alert("initGame() not found — sandbox map module not loaded.");
        return;
    }

    _showProgress("Booting Sandbox map…");

    // Hide main menu
    const menuUI = document.getElementById("main-menu-ui-container");
    if (menuUI) menuUI.style.display = "none";
    if (typeof window.destroyMainMenuSafe === "function") {
        try { window.destroyMainMenuSafe(); } catch(e){}
    }

    if (typeof window.AudioManager !== "undefined") {
        try { window.AudioManager.init(); } catch(e){}
    }

    try {
        // Match the regular Sandbox boot path so save_system.js's
        // patchInitGame wrapper sets gameMode="sandbox" cleanly.
        if (window.__gameStarted) {
            _warn("__gameStarted=true, resetting before re-boot");
            window.__gameStarted = false;
        }
        window.__gameStarted = true;
        await window.initGame();

        _showProgress("Waiting for terrain and cities to settle…");
        await _waitForMapReady();

        _showProgress("Capturing scenario data…");
        await new Promise(r => setTimeout(r, 500)); // brief settle for NPCs

        const fileName = captureCurrentToFile(opts);

        _showProgress("Done — downloaded " + fileName + ". Reloading in 3 seconds…");
        await new Promise(r => setTimeout(r, 3000));
        location.reload();
    } catch (err) {
        _err("Sandbox import failed:", err);
        _hideProgress();
        alert("Sandbox import failed:\n" + err.message + "\n\nReloading.");
        location.reload();
    }
}

async function importStory1() {
    const opts = await _showImportDialog("Story 1: Bun'ei Invasion 1274", "story1",
                                          "Story 1 Custom Scenario");
    if (!opts) return;

    if (typeof window.initGame_story1 !== "function") {
        alert("initGame_story1() not found — story1 module not loaded.");
        return;
    }

    _showProgress("Booting Story 1 map…");

    // Hide main menu
    const menuUI = document.getElementById("main-menu-ui-container");
    if (menuUI) menuUI.style.display = "none";
    if (typeof window.destroyMainMenuSafe === "function") {
        try { window.destroyMainMenuSafe(); } catch(e){}
    }

    if (typeof window.AudioManager !== "undefined") {
        try { window.AudioManager.init(); } catch(e){}
    }

    try {
        if (window.__gameStarted) {
            _warn("__gameStarted=true, resetting before re-boot");
            window.__gameStarted = false;
        }
        // Note: initGame_story1 sets __gameStarted=true on its own first line
        // and bails if it was true. So we leave it false here.
        await window.initGame_story1();

        _showProgress("Waiting for terrain and settlements to settle…");
        await _waitForMapReady();

        _showProgress("Capturing scenario data…");
        await new Promise(r => setTimeout(r, 500));

        const fileName = captureCurrentToFile(opts);

        _showProgress("Done — downloaded " + fileName + ". Reloading in 3 seconds…");
        await new Promise(r => setTimeout(r, 3000));
        location.reload();
    } catch (err) {
        _err("Story 1 import failed:", err);
        _hideProgress();
        alert("Story 1 import failed:\n" + err.message + "\n\nReloading.");
        location.reload();
    }
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN-MENU INTEGRATION
//
// MutationObserver pattern (mirrors scenario_editor.js). Inserts our two
// buttons immediately after the existing "Scenario Editor" button.
// ────────────────────────────────────────────────────────────────────────────

(function _installMenuButtons() {
    const observer = new MutationObserver(() => {
        const ui = document.getElementById("main-menu-ui-container");
        if (!ui) return;
        if (document.getElementById("import-sandbox-btn") &&
            document.getElementById("import-story1-btn")) {
            return;  // already installed
        }

        // Build the two buttons
        const sandboxBtn = document.createElement("button");
        sandboxBtn.id = "import-sandbox-btn";
        sandboxBtn.innerText = "Import Sandbox to Scenario";
        _styleMenuBtn(sandboxBtn);
        sandboxBtn.onclick = () => importSandbox();

        const story1Btn = document.createElement("button");
        story1Btn.id = "import-story1-btn";
        story1Btn.innerText = "Import Story 1 to Scenario";
        _styleMenuBtn(story1Btn);
        story1Btn.onclick = () => importStory1();

        // Insert after "Scenario Editor" button (created by scenario_editor.js's
        // own observer). If that button isn't there yet, fall back to before
        // "Load Game", or finally just append.
        const allBtns = Array.from(ui.querySelectorAll("button"));
        const editorBtn = document.getElementById("scenario-editor-btn") ||
                          allBtns.find(b => b.innerText && b.innerText.toLowerCase().includes("scenario editor"));

        if (editorBtn && editorBtn.nextSibling) {
            ui.insertBefore(sandboxBtn, editorBtn.nextSibling);
            ui.insertBefore(story1Btn, sandboxBtn.nextSibling);
        } else {
            const loadBtn = allBtns.find(b => b.innerText && b.innerText.includes("Load Game"));
            if (loadBtn) {
                ui.insertBefore(sandboxBtn, loadBtn);
                ui.insertBefore(story1Btn, loadBtn);
            } else {
                ui.appendChild(sandboxBtn);
                ui.appendChild(story1Btn);
            }
        }

        // Reveal after the manual is read (same gate scenario_editor.js uses)
        const poll = setInterval(() => {
            if (window.__isManualUnlocked) {
                sandboxBtn.style.display = "block";
                story1Btn.style.display  = "block";
                clearInterval(poll);
            }
        }, 150);

        // Don't disconnect the observer immediately — DoG's main menu can
        // re-render in some flows (e.g., after destroyMainMenuSafe). We let
        // the early-return guard at the top handle re-entry.
    });

    observer.observe(document.body, { childList: true, subtree: true });
    _log("Menu patch active — waiting for #main-menu-ui-container.");
})();

// ────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ────────────────────────────────────────────────────────────────────────────

return {
    importSandbox,
    importStory1,
    captureCurrentToFile,
    buildScenarioDoc,
    VERSION
};

})();

console.log("[ScenarioDevImport] senario_devmade_import.js v" +
            window.ScenarioDevImport.VERSION + " loaded.");