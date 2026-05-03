// =============================================================================
// SCENARIO EDITOR — scenario_menu_adder.js
// =============================================================================
// Adds two main-menu buttons:
//   1. "Launch Scenario"    — file-picker → loads a saved scenario into the engine
//   2. "🗺 Scenario Editor"  — opens the editor workspace
//
// The editor:
//   • Setup screen for map size, factions, cities, map data
//   • Editor canvas with WASD/mouse pan + scroll zoom
//   • Paint/Erase brushes that adjust ELEVATION + MOISTURE (e/m) and re-classify
//     tiles using the same biome rules as sandbox_overworld.js
//   • City placement / editing / deletion
//   • Faction roster editing post-generation
//   • Trigger placeholder panel (logic to be added later)
//   • Save (JSON download) / Load (file picker) / Exit (refresh)
//   • Movable, resizable, minimizable, maximizable Windows-style panels
//
// All systems are MODULAR (object-oriented namespaces) for future patching.
// Bridge file: scenario_update.js handles "Launch Scenario" runtime hooks.
// =============================================================================

window.ScenarioEditor = (function () {
"use strict";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ CONSTANTS — pulled directly from sandbox_overworld.js (DO NOT INVENT)    ║
// ╚══════════════════════════════════════════════════════════════════════════╝
const PALETTE = {
    ocean:     "#2b4a5f", coastal:   "#3a5f75",
    desert:    "#bfa373", dune:      "#cfae7e",
    plains:    "#a3a073", meadow:    "#6b7a4a",
    forest:    "#425232", jungle:    "#244222",
    highlands: "#626b42", mountains: "#3E2723", snow: "#7B5E3F"
};

// All troop types known to the engine (used for the per-faction "Unique Troop"
// dropdown in the setup screen). This list mirrors troopGUI.hierarchy keys plus
// the canonical unique units.
const ALL_TROOP_TYPES = [
    // Core / standard tree
    "Militia",
    "Crossbowman", "Heavy Crossbowman",
    "Javelinier", "Firelance", "Heavy Firelance",
    "Spearman", "Lancer", "Heavy Lancer",
    "Archer", "Horse Archer", "Heavy Horse Archer",
    "Shielded Infantry", "Light Two Handed", "Heavy Two Handed",
    "Bomb", "Hand Cannoneer",
    // Standard faction uniques
    "Repeater Crossbowman", "War Elephant", "Keshig", "Elite Lancer",
    "Poison Crossbowman", "Rocket", "Camel Cannon", "Slinger", "Glaiveman"
];

// Default factions (mirrors npc_system.js definitions). Each faction now also
// carries a default cityCount and uniqueTroop value used by the editor.
//
// cityCount default = 4 for normal factions, 1 for Player, 0 for Bandits
// (Bandits roam without cities; Player gets one starting city.)
const DEFAULT_FACTIONS = {
    "Hong Dynasty":          { color: "#d32f2f", geoWeight: { north: 0.40, south: 0.60, west: 0.40, east: 0.60 }, enabled: true, cityCount: 4, uniqueTroop: "Repeater Crossbowman" },
    "Dab Tribes":            { color: "#00838f", geoWeight: { north: 0.01, south: 0.99, west: 0.70, east: 0.30 }, enabled: true, cityCount: 4, uniqueTroop: "War Elephant" },
    "Great Khaganate":       { color: "#1976d2", geoWeight: { north: 0.85, south: 0.15, west: 0.60, east: 0.40 }, enabled: true, cityCount: 4, uniqueTroop: "Keshig" },
    "Jinlord Confederacy":   { color: "#455a64", geoWeight: { north: 0.88, south: 0.12, west: 0.05, east: 0.95 }, enabled: true, cityCount: 4, uniqueTroop: "Elite Lancer" },
    "Tran Realm":            { color: "#388e3c", geoWeight: { north: 0.01, south: 0.99, west: 0.30, east: 0.70 }, enabled: true, cityCount: 4, uniqueTroop: "Poison Crossbowman" },
    "Goryun Kingdom":        { color: "#7b1fa2", geoWeight: { north: 0.40, south: 0.60, west: 0.05, east: 0.85 }, enabled: true, cityCount: 4, uniqueTroop: "Rocket" },
    "Xiaran Dominion":       { color: "#fbc02d", geoWeight: { north: 0.75, south: 0.25, west: 0.90, east: 0.10 }, enabled: true, cityCount: 4, uniqueTroop: "Camel Cannon" },
    "High Plateau Kingdoms": { color: "#8d6e63", geoWeight: { north: 0.10, south: 0.90, west: 0.98, east: 0.02 }, enabled: true, cityCount: 4, uniqueTroop: "Slinger" },
    "Yamato Clans":          { color: "#c2185b", geoWeight: { north: 0.15, south: 0.65, west: 0.02, east: 0.98 }, enabled: true, cityCount: 4, uniqueTroop: "Glaiveman" },
    "Bandits":               { color: "#222222", geoWeight: { north: 0.50, south: 0.50, west: 0.50, east: 0.50 }, enabled: true, cityCount: 0, uniqueTroop: "" },
    "Player":      { color: "#FFFFFF", geoWeight: { north: 0.45, south: 0.45, west: 0.30, east: 0.70 }, enabled: true, cityCount: 1, uniqueTroop: "", locked: true }
};

// Biome painting targets. Painting "Plains" pushes e/m toward (0.45, 0.50).
// These (e,m) values were chosen so they fall cleanly inside the classifyTile
// thresholds below — change these and the brush will paint a different biome.
const BIOME_TARGETS = {
    "Ocean":           { e: 0.10, m: 0.50 },
    "Coastal":         { e: 0.30, m: 0.50 },
    "Desert":          { e: 0.45, m: 0.10 },
    "Dunes":           { e: 0.45, m: 0.30 },
    "Plains":          { e: 0.45, m: 0.50 },
    "Steppes":         { e: 0.45, m: 0.40 },
    "Forest":          { e: 0.45, m: 0.65 },
    "Highlands":       { e: 0.65, m: 0.30 },
    "Dense Forest":    { e: 0.65, m: 0.55 },
    "Mountains":       { e: 0.78, m: 0.20 },
    "Large Mountains": { e: 0.90, m: 0.10 },
    "River":           { e: 0.30, m: 0.85 } // marked specially below
};

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ TILE CLASSIFICATION  — exact mirror of sandbox_overworld.js lines 854+   ║
// ╚══════════════════════════════════════════════════════════════════════════╝
// Given an elevation (e), moisture (m), and a "isRiver" flag, return a tile
// object. Exposed as a public method so plugins / tests can use it.
function classifyTile(e, m, isRiver) {
    let tile = { id: 0, color: "", speed: 1.0, impassable: false, name: "", e, m, isRiver: !!isRiver };
    if (e < 0.25)            { tile.name = "Ocean";   tile.color = PALETTE.ocean;   tile.speed = 1.5; }
    else if (e < 0.35)       { tile.name = "Coastal"; tile.color = PALETTE.coastal; tile.speed = 1.3; }
    else if (isRiver)        { tile.name = "River";   tile.color = PALETTE.coastal; tile.speed = 1.5; }
    else if (e > 0.82)       { tile.name = "Large Mountains"; tile.color = PALETTE.snow;      tile.speed = 0.3; }
    else if (e > 0.72)       { tile.name = "Mountains";       tile.color = PALETTE.mountains; tile.speed = 0.4; }
    else if (e > 0.58) {
        if      (m < 0.2)    { tile.name = "Highlands";    tile.color = PALETTE.highlands; tile.speed = 0.45; }
        else if (m > 0.4)    { tile.name = "Dense Forest"; tile.color = PALETTE.jungle;    tile.speed = 0.30; }
        else                 { tile.name = "Highlands";    tile.color = PALETTE.highlands; tile.speed = 0.45; }
    } else {
        if      (m < 0.25)   { tile.name = "Desert"; tile.color = PALETTE.desert; tile.speed = 0.40; }
        else if (m < 0.35)   { tile.name = "Dunes";  tile.color = PALETTE.dune;   tile.speed = 0.65; }
        else if (m > 0.55)   { tile.name = "Forest"; tile.color = PALETTE.forest; tile.speed = 0.40; }
        else if (m > 0.42)   { tile.name = "Plains"; tile.color = PALETTE.meadow; tile.speed = 0.85; }
        else                 { tile.name = "Steppes"; tile.color = PALETTE.plains; tile.speed = 0.80; }
    }
    return tile;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ NOISE — minimal FBM for "random map" mode (lighter than overworld.js)    ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _hash(x, y) { let n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123; return n - Math.floor(n); }
function _noise(x, y) {
    let ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    let ux = fx*fx*(3-2*fx), uy = fy*fy*(3-2*fy);
    let n00 = _hash(ix,iy), n10 = _hash(ix+1,iy);
    let n01 = _hash(ix,iy+1), n11 = _hash(ix+1,iy+1);
    let nx0 = n00*(1-ux) + n10*ux;
    let nx1 = n01*(1-ux) + n11*ux;
    return nx0*(1-uy) + nx1*uy;
}
function _fbm(x, y, octaves = 4) {
    let v = 0, a = 0.5, f = 1;
    for (let i = 0; i < octaves; i++) { v += a * _noise(x*f, y*f); f *= 2; a *= 0.5; }
    return v;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ NAME GENERATOR — uses a tiny syllable pool per faction                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝
const NAME_SYLLABLES = {
    "Hong Dynasty":          ["Han","Zhuo","Mei","Ling","Xian","Yue","Lu","Feng","Bai","Shan","Qiao","He","Jin","Dao","Tong","An"],
    "Dab Tribes":            ["Pao","Vang","Tou","Mee","Nao","Chue","Kou","Leng","Ntxa","Plig"],
    "Great Khaganate":       ["Or","Kar","Batu","Sar","Tem","Alt","Bor","Khan","Ur","Tol","Dar","Mur","Nog"],
    "Jinlord Confederacy":   ["Cira","Nuru","Guda","Bi","Bisi","Muke","Tala","Siri","Hada","Hula","Hete","Boro"],
    "Tran Realm":            ["Nguyen","Tran","Le","Pham","Hoang","Phan","Vu","Dang","Bui","Do","Ho","Ngo"],
    "Goryun Kingdom":        ["Gyeong","Han","Nam","Seong","Hae","Pak","Cheon","Il","Sung","Jeon","Gwang","Dong"],
    "Xiaran Dominion":       ["Xi","Ran","Bao","Ling","Tao","Yun","Hai","Shuo","Gu","Lan","Zhi","Min"],
    "High Plateau Kingdoms": ["Lha","Tse","Nor","Gar","Ri","Do","Shar","Lang","Zang","Yul","Cham","Phu"],
    "Yamato Clans":          ["Aki","Naga","Hara","Kawa","Matsu","Yama","Saka","Taka","Kiri","Shima","Oka"],
    "Bandits":               ["Black","Red","Iron","Crow","Wolf","Bone","Ash","Razor","Cinder"],
    "Player":      ["Tsim","Sha","Tsui","Mong","Kok","Sham","Shui","Po","Kwun","Tong","Yuen","Long"]
};
function _genCityName(faction) {
    const pool = NAME_SYLLABLES[faction] || NAME_SYLLABLES["Hong Dynasty"];
    let n = ""; const count = Math.random() < 0.85 ? 2 : 3;
    for (let i = 0; i < count; i++) n += pool[Math.floor(Math.random() * pool.length)];
    return n;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ STATE — the single source of truth for the editor session                ║
// ╚══════════════════════════════════════════════════════════════════════════╝
// Anything in `state.scenario` is what gets serialized to JSON on save.
// Anything outside of it (cam, tool selection, etc.) is editor-only.
const state = {
    open:      false,
    rootEl:    null,        // The full-screen container
    scenario:  null,        // The current scenario document (see _newScenarioDoc)

    // Camera (panning + zoom around the scenario canvas)
    cam: { x: 0, y: 0, zoom: 3.0 },

    // Active tool: "paint" | "erase" | "place_city" | "select" | "move_city" | "delete_city"
    tool: "paint",
    brush: { size: 12, biome: "Plains", strength: 0.6 },

    // Mouse state
    mouse: { x: 0, y: 0, down: false, button: 0 },

    // Selection
    selectedCity: null,

    // Cached canvas references (set in _buildEditor)
    canvas: null, ctx: null, mapCanvas: null, mapCtx: null,

    // Currently-pressed keys for WASD pan
    keys: {},

    // Animation handle for the editor render loop
    rafId: null
};

function _newScenarioDoc(opts) {
    // Default scenario document. opts is the form data from setup screen.
    const doc = {
        version: 3,   // Step 11: now at v3 (movies + storyQuests + parlerLines)
        meta: {
            name: opts.name || "Untitled Scenario",
            created: new Date().toISOString(),
            author: opts.author || "Unknown",
            description: opts.description || ""
        },
        dimensions: { tilesX: opts.tilesX, tilesY: opts.tilesY },
        factions: {},
        cities: [],
        tiles: [],
        triggers: [],
        mapData: opts.mapData || "blank",
        cityStrategy: opts.cityStrategy || "random",
        seed: Math.floor(Math.random() * 1e9),

        // ── Step 1: Initial diplomacy matrix ──────────────────────────────────
        initialDiplomacy: opts.initialDiplomacy || {},

        // ── Step 4: Movies (cinematics) array ────────────────────────────────
        // movies[0] is the boot intro; others fire via play_movie trigger action.
        movies: [],
        // Legacy storyIntro kept for backwards-compat; movies[] is canonical.
        storyIntro: {
            enabled: false, fadeMs: 1200, fadeColor: "#000000",
            titleCard: { title: "", subtitle: "", ms: 3500 },
            art: "", artMs: 5000, kenburns: false,
            lines: [], letterbox: true, typewriterCps: 0
        },

        // ── Step 7: Story quest catalogue ────────────────────────────────────
        // Each entry: { id, title, description, x, y, radius,
        //               triggerOnArrive, varOnArrive, isMain, autoActivate, dependsOn }
        storyQuests: [],

        // ── Step 10: Per-role Parler greeting lines ───────────────────────────
        // Falls through to RandomDialogue when a role's array is empty.
        parlerLines: { Civilian:[], Patrol:[], Military:[], Trader:[], Bandit:[], Special:[] },

        // ── Scenario logic ────────────────────────────────────────────────────
        scenarioVars: {},
        winLose: { winRules: [], loseRules: [] },
        timeline: [],

        // ── Entity setup ──────────────────────────────────────────────────────
        importantNpcs:        [],
        playerSetup:          {},
        proceduralAITendency: {}
    };

    // opts.factionsArr is the ordered array from the setup screen. If not
    // provided (e.g. legacy load), fall back to DEFAULT_FACTIONS dict order.
    const arr = opts.factionsArr || Object.entries(DEFAULT_FACTIONS).map(([n, d], i) => ({
        name: n, ...JSON.parse(JSON.stringify(d)), order: i
    }));

    arr.forEach((f, idx) => {
        doc.factions[f.name] = {
            color:      f.color,
            geoWeight:  { ...f.geoWeight },
            enabled:    !!f.enabled,
            locked:     !!f.locked,
            order:      (typeof f.order === "number") ? f.order : idx,
            cityCount:  (typeof f.cityCount === "number") ? f.cityCount : 4,
            uniqueTroop: f.uniqueTroop || ""
        };
    });

    return doc;
}

// Helper: return [name, data] tuples for scenario.factions sorted by .order.
function _orderedFactions(scenario) {
    return Object.entries(scenario.factions)
        .sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
}


// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ MAP GENERATION — populates scenario.tiles[][]                            ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _generateScenarioTiles(scenario) {
    const X = scenario.dimensions.tilesX;
    const Y = scenario.dimensions.tilesY;
    const tiles = new Array(X);
    if (scenario.mapData === "blank") {
        // All plains. Player can paint freely.
        for (let i = 0; i < X; i++) {
            tiles[i] = new Array(Y);
            for (let j = 0; j < Y; j++) {
                tiles[i][j] = classifyTile(0.45, 0.50, false);
            }
        }
    } else {
        // "random" — simple 2-channel noise (e + m) → biome
        const seed = scenario.seed || 1234;
        for (let i = 0; i < X; i++) {
            tiles[i] = new Array(Y);
            for (let j = 0; j < Y; j++) {
                let nx = i / X, ny = j / Y;
                // Continental coastline: more land on the right side
                let coast = 0.30 + (_fbm(ny*4 + seed*0.0001, 0) - 0.5) * 0.25;
                let baseE = Math.pow(_fbm(nx*3.5 + seed*0.001, ny*3.5) * 2.2, 1.3) * 0.22;
                if (nx > coast) baseE += (nx - coast) * 0.55;
                let m = _fbm(nx*4 + 10, ny*4 + 10);
                m += (0.6 - ny) * 0.15;

                // Mild river streaks
                let isRiver = false;
                if (baseE >= 0.36 && baseE < 0.65 && m > 0.45) {
                    let r = Math.abs(_fbm(nx*15+5, ny*15+5) - 0.5) * 2;
                    if (r < 0.025 + (m * 0.025)) isRiver = true;
                }
                tiles[i][j] = classifyTile(baseE, m, isRiver);
            }
        }
    }
    scenario.tiles = tiles;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ FACTION-FROM-GEO — mirrors npc_system.js getFactionByGeography           ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _factionForLocation(scenario, x01, y01) {
    let best = null, bestScore = Infinity;
    for (const [name, data] of _orderedFactions(scenario)) {
        if (!data.enabled) continue;
        if (name === "Bandits" || name === "Player") continue;
        let dx = x01 - data.geoWeight.east;
        let dy = y01 - data.geoWeight.south;
        let dist = Math.sqrt(dx*dx + dy*dy);
        let noise = Math.random() * 0.02;
        let score = dist + noise;
        if (score < bestScore) { bestScore = score; best = name; }
    }
    return best || "Hong Dynasty";
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ CITY POPULATION                                                          ║
// ║                                                                          ║
// ║ Honors per-faction cityCount. Strategy options:                          ║
// ║   "random"          — each enabled faction gets its own cityCount        ║
// ║   "prioritize_top"  — top-listed enabled faction gets 2× cityCount;      ║
// ║                       all others use their declared cityCount            ║
// ║   "none"            — no auto-placement (manual editor only)             ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _autoPopulateCities(scenario, opts) {
    opts = opts || {};
    const strategy = opts.strategy || scenario.cityStrategy || "random";
    if (strategy === "none") { scenario.cities = []; return; }

    scenario.cities = [];
    const X = scenario.dimensions.tilesX;
    const Y = scenario.dimensions.tilesY;

    // Build the placement list, honoring order, enabled flag, and excluding
    // Bandits (which never get cities). Player DOES get cities now,
    // since the setup screen lets the user set their own count (default 1).
    const ordered = _orderedFactions(scenario)
        .filter(([n, d]) => d.enabled && n !== "Bandits");

    // Find the "top" non-player faction for prioritize_top
    const topFaction = ordered.find(([n]) => n !== "Player")?.[0];

    ordered.forEach(([fName, fData]) => {
        let count = (typeof fData.cityCount === "number") ? fData.cityCount : 4;
        if (strategy === "prioritize_top" && fName === topFaction) {
            count = Math.max(count, count * 2);   // top faction gets a 2× boost
        }
        if (count <= 0) return;

        let placed = 0, attempts = 0;
        while (placed < count && attempts < 600) {
            attempts++;
            // Roll near (geoWeight.east, geoWeight.south) with ±0.15 jitter
            let cx = fData.geoWeight.east  + (Math.random() - 0.5) * 0.30;
            let cy = fData.geoWeight.south + (Math.random() - 0.5) * 0.30;
            cx = Math.max(0.02, Math.min(0.98, cx));
            cy = Math.max(0.02, Math.min(0.98, cy));
            const ti = Math.floor(cx * X), tj = Math.floor(cy * Y);
            const tile = scenario.tiles[ti] && scenario.tiles[ti][tj];
            if (!tile) continue;
            if (tile.name === "Ocean" || tile.name === "Coastal" || tile.name === "River") continue;
            // No clumping: min distance check (in % space)
            let tooClose = scenario.cities.some(c => Math.hypot(c.xPct - cx, c.yPct - cy) < 0.05);
            if (tooClose) continue;
            scenario.cities.push({
                name: _genCityName(fName),
                faction: fName,
                xPct: cx, yPct: cy,
                pop: Math.floor(Math.random() * 8000) + 2000,
                custom: false
            });
            placed++;
        }
    });
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ BUILDER : SETUP SCREEN                                                   ║
// ║                                                                          ║
// ║ Major sections:                                                          ║
// ║   • Scenario Info (name / author / desc)                                 ║
// ║   • Map Size (X, Y in tiles 100-1000)                                    ║
// ║   • Initial Map Data (blank vs random)                                   ║
// ║   • Factions — rename, reorder (▲▼), add custom, set unique troop,       ║
// ║                set per-faction city count, edit geo weights              ║
// ║                NOTE: color is NOT editable here; it is editable from     ║
// ║                inside the editor's Faction panel after launch            ║
// ║   • City Strategy (random / prioritize_top / none)                       ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _buildSetupScreen() {
    const wrap = document.createElement("div");
    wrap.id = "se-setup-screen";
    Object.assign(wrap.style, {
        position: "fixed", inset: "0", background: "#1a1f2a", color: "#cfd8dc",
        zIndex: "10001", overflowY: "auto", fontFamily: "Tahoma, Verdana, sans-serif",
        padding: "20px"
    });

    // The setup screen works off a temporary ARRAY of faction entries (each
    // with name + the standard fields + order). When "Create" is clicked we
    // convert the array to scenario.factions dict via _newScenarioDoc.
    // This array model makes rename, reorder, and add operations clean.
    const seedFactionsArr = Object.entries(DEFAULT_FACTIONS).map(([n, d], i) => ({
        name:        n,
        color:       d.color,
        geoWeight:   { ...d.geoWeight },
        enabled:     !!d.enabled,
        locked:      !!d.locked,
        cityCount:   (typeof d.cityCount === "number") ? d.cityCount : 4,
        uniqueTroop: d.uniqueTroop || "",
        order:       i
    }));

    // Mutable working copy
    const setupState = {
        factionsArr: seedFactionsArr.slice()
    };

    wrap.innerHTML = `
      <div style="max-width:1100px;margin:0 auto;">
        <h1 style="color:#f5d76e;border-bottom:1px solid #4a8fa8;padding-bottom:8px;">
          Scenario Editor — Setup
        </h1>
        <p style="color:#8aa;">Configure the parameters for your new scenario.
           All values can be edited later from the editor workspace.</p>

        <!-- META -->
        <fieldset style="border:1px solid #4a8fa8;padding:10px;margin-bottom:10px;">
          <legend style="color:#f5d76e;">Scenario Info</legend>
          <label>Name:    <input id="se-cfg-name"   type="text"  value="My Scenario" style="width:240px;"></label>
          <label style="margin-left:18px;">Author: <input id="se-cfg-author" type="text" value="" style="width:160px;"></label>
          <br><br>
          <label>Description:<br><textarea id="se-cfg-desc" rows="2" style="width:100%;"></textarea></label>
        </fieldset>

        <!-- DIMENSIONS -->
        <fieldset style="border:1px solid #4a8fa8;padding:10px;margin-bottom:10px;">
          <legend style="color:#f5d76e;">Map Size (tiles)</legend>
          <label>X (100–1000): <input id="se-cfg-tx" type="number" min="100" max="1000" value="250" style="width:80px;"></label>
          <label style="margin-left:18px;">Y (100–1000): <input id="se-cfg-ty" type="number" min="100" max="1000" value="187" style="width:80px;"></label>
          <span style="color:#8aa;margin-left:18px;">(Default 250×187 matches the sandbox dimensions.)</span>
        </fieldset>

        <!-- MAP DATA -->
        <fieldset style="border:1px solid #4a8fa8;padding:10px;margin-bottom:10px;">
          <legend style="color:#f5d76e;">Initial Map Data</legend>
          <label><input type="radio" name="se-mapdata" value="blank" checked> Blank (all plains)</label>
          <label style="margin-left:18px;"><input type="radio" name="se-mapdata" value="random"> Random (procedural)</label>
        </fieldset>

        <!-- FACTIONS -->
        <fieldset style="border:1px solid #4a8fa8;padding:10px;margin-bottom:10px;">
          <legend style="color:#f5d76e;">Factions</legend>
          <p style="color:#8aa;font-size:0.9em;margin-top:0;">
            Rename, rearrange (▲▼), enable/disable, and add custom factions.
            Set a unique troop type and starting city count per faction.
            All factions including Player and Bandits can be deleted.
            Color is set later inside the editor (kept off this screen to keep things simple).
          </p>
          <div id="se-fac-list" style="display:flex;flex-direction:column;gap:6px;"></div>
          <div style="margin-top:10px;display:flex;gap:8px;align-items:center;">
            <button id="se-fac-add" style="padding:6px 14px;background:#1a3a5c;color:#a8d8ea;border:2px solid #4a8fa8;cursor:pointer;font-weight:bold;">
              ＋ Add New Faction
            </button>
            <button id="se-fac-reset" style="padding:6px 14px;background:#3a1a1a;color:#ffaaaa;border:1px solid #aa4444;cursor:pointer;">
              Reset to Defaults
            </button>
          </div>
        </fieldset>

        <!-- CITIES -->
        <fieldset style="border:1px solid #4a8fa8;padding:10px;margin-bottom:10px;">
          <legend style="color:#f5d76e;">City Placement</legend>
          <label>Strategy:
            <select id="se-cfg-citymode">
              <option value="random">Random per faction (use each faction's city count)</option>
              <option value="prioritize_top">Prioritize Top Faction (top-listed faction gets 2× cities)</option>
              <option value="none">None (place cities manually after launch)</option>
            </select>
          </label>
          <p style="color:#8aa;font-size:0.85em;margin:6px 0 0 0;">
            Each faction's individual city count is set in its faction row above.
            Default: 4 cities for normal factions, 1 for Player, 0 for Bandits.
          </p>
        </fieldset>

        <!-- BUTTONS -->
       <div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px;">
          <button id="se-setup-load" style="padding:8px 16px;background:#253a55;color:#a8d8ea;border:1px solid #4a8fa8;cursor:pointer;">
            📂 Load Existing Scenario
          </button>
          <div>
            <button id="se-setup-cancel" style="padding:8px 16px;margin-right:8px;">Cancel</button>
            <button id="se-setup-create" style="padding:8px 24px;background:#1a3a5c;color:#a8d8ea;border:2px solid #4a8fa8;font-weight:bold;cursor:pointer;">
              Create Scenario →
            </button>
          </div>
        </div>
      </div>
    `;

    // ────────────────────────────────────────────────────────────────────────
    // FACTION-LIST RENDERER
    //
    // A faction row layout:
    //   ╔════════════════════════════════════════════════════════════════════╗
    //   ║ [#] [▲][▼]  [Name input]   [☑ enabled]    [✗ delete (custom only)] ║
    //   ║      Unique: [▼ Repeater Crossbowman]  Cities: [4]                ║
    //   ║      Geo: N[0.40] S[0.60] W[0.40] E[0.60]                         ║
    //   ╚════════════════════════════════════════════════════════════════════╝
    // ────────────────────────────────────────────────────────────────────────
    function isLocked(f) { return false; }          // no faction is name-locked in setup
    function isUndeletable(f) { return false; }     // all factions (incl. Player & Bandits) are deletable

    function renderFactionList() {
        // Re-stamp .order so the array index matches order each time
        setupState.factionsArr.forEach((f, i) => f.order = i);

        const list = wrap.querySelector("#se-fac-list");
        list.innerHTML = "";

        setupState.factionsArr.forEach((f, idx) => {
            const row = document.createElement("div");
            row.style.cssText = `
                background:#222a36;border:1px solid #3a4658;border-radius:4px;
                padding:8px;display:flex;flex-direction:column;gap:4px;
            `;

            // Build the unique-troop dropdown options
            const uniqueOpts = ['<option value="">— None —</option>']
                .concat(ALL_TROOP_TYPES.map(u =>
                    `<option value="${u}" ${f.uniqueTroop === u ? "selected" : ""}>${u}</option>`
                )).join("");

            row.innerHTML = `
              <!-- TOP ROW: order #, up/down, name, enable, delete -->
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="background:#0e1218;color:#f5d76e;width:24px;text-align:center;
                             padding:2px;border-radius:2px;font-weight:bold;">${idx + 1}</span>
                <button data-act="up"   ${idx === 0 ? "disabled" : ""}
                        style="padding:2px 6px;background:#1a3a5c;color:#cfd8dc;border:1px solid #4a8fa8;cursor:pointer;">▲</button>
                <button data-act="down" ${idx === setupState.factionsArr.length - 1 ? "disabled" : ""}
                        style="padding:2px 6px;background:#1a3a5c;color:#cfd8dc;border:1px solid #4a8fa8;cursor:pointer;">▼</button>
                <input type="text" data-field="name" value="${_escapeAttr(f.name)}" ${isLocked(f) ? "disabled" : ""}
                       style="flex:1;padding:4px 6px;background:#0e1218;color:#f5d76e;border:1px solid #4a8fa8;font-weight:bold;">
                <label style="font-size:0.85em;color:#8aa;">
                  <input type="checkbox" data-field="enabled" ${f.enabled ? "checked" : ""} ${isLocked(f) ? "disabled" : ""}> Enabled
                </label>
                <button data-act="del"
                        style="padding:2px 8px;background:#3a1a1a;color:#ffaaaa;border:1px solid #7a3a3a;cursor:pointer;font-weight:bold;">✗</button>
              </div>
              <!-- MIDDLE ROW: unique troop, city count -->
              <div style="display:flex;align-items:center;gap:12px;font-size:0.9em;">
                <label>Unique Troop:
                  <select data-field="uniqueTroop" style="background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:2px;">
                    ${uniqueOpts}
                  </select>
                </label>
                <label>Cities:
                  <input type="number" data-field="cityCount" min="0" max="50" step="1"
                         value="${f.cityCount}" style="width:60px;background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:2px 4px;">
                </label>
                ${f.name === "Bandits" ? '<span style="color:#8aa;font-size:0.85em;">(Bandits roam without cities — set 0)</span>' : ""}
              </div>
              <!-- BOTTOM ROW: geo weights -->
              <div style="display:flex;align-items:center;gap:8px;font-size:0.85em;color:#8aa;">
                <span>Geo:</span>
                <label>N:<input type="number" step="0.05" min="0" max="1" data-geo="north" value="${f.geoWeight.north}" style="width:55px;"></label>
                <label>S:<input type="number" step="0.05" min="0" max="1" data-geo="south" value="${f.geoWeight.south}" style="width:55px;"></label>
                <label>W:<input type="number" step="0.05" min="0" max="1" data-geo="west"  value="${f.geoWeight.west}"  style="width:55px;"></label>
                <label>E:<input type="number" step="0.05" min="0" max="1" data-geo="east"  value="${f.geoWeight.east}"  style="width:55px;"></label>
              </div>
            `;

            // Wire up events
            row.querySelector('[data-act="up"]').onclick = () => {
                if (idx === 0) return;
                _swapArr(setupState.factionsArr, idx, idx - 1);
                renderFactionList();
            };
            row.querySelector('[data-act="down"]').onclick = () => {
                if (idx === setupState.factionsArr.length - 1) return;
                _swapArr(setupState.factionsArr, idx, idx + 1);
                renderFactionList();
            };
            row.querySelector('[data-act="del"]').onclick = () => {
                if (!confirm(`Delete faction "${f.name}"?`)) return;
                setupState.factionsArr.splice(idx, 1);
                renderFactionList();
            };
            row.querySelector('[data-field="name"]').oninput = (e) => {
                const newName = e.target.value.trim();
                if (!newName) return;
                // Avoid name collisions
                if (setupState.factionsArr.some((g, i) => i !== idx && g.name === newName)) {
                    e.target.style.borderColor = "#aa4444";
                } else {
                    e.target.style.borderColor = "#4a8fa8";
                    f.name = newName;
                }
            };
            row.querySelector('[data-field="enabled"]').onchange = (e) => { f.enabled = e.target.checked; };
            row.querySelector('[data-field="uniqueTroop"]').onchange = (e) => { f.uniqueTroop = e.target.value; };
            row.querySelector('[data-field="cityCount"]').oninput = (e) => {
                f.cityCount = Math.max(0, parseInt(e.target.value) || 0);
            };
            row.querySelectorAll("input[data-geo]").forEach(inp => {
                inp.oninput = (e) => {
                    const v = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                    f.geoWeight[e.target.dataset.geo] = v;
                };
            });

            list.appendChild(row);
        });
    }

    // ── Add/Reset wiring ────────────────────────────────────────────────────
    wrap.querySelector("#se-fac-add").onclick = () => {
        // Pick a default unique that's not yet assigned
        const usedUniques = new Set(setupState.factionsArr.map(f => f.uniqueTroop).filter(Boolean));
        const freshUnique = ALL_TROOP_TYPES.find(t => !usedUniques.has(t)) || "";
        // Ensure the new name is unique
        let baseName = "New Faction", n = 1, candidate = baseName;
        while (setupState.factionsArr.some(f => f.name === candidate)) {
            n++; candidate = `${baseName} ${n}`;
        }
        setupState.factionsArr.push({
            name:        candidate,
            color:       _randomFactionColor(),
            geoWeight:   { north: 0.50, south: 0.50, west: 0.50, east: 0.50 },
            enabled:     true,
            locked:      false,
            cityCount:   4,
            uniqueTroop: freshUnique,
            order:       setupState.factionsArr.length
        });
        renderFactionList();
    };
    wrap.querySelector("#se-fac-reset").onclick = () => {
        if (!confirm("Reset all factions to defaults?")) return;
        setupState.factionsArr = Object.entries(DEFAULT_FACTIONS).map(([n, d], i) => ({
            name: n, color: d.color, geoWeight: { ...d.geoWeight },
            enabled: !!d.enabled, locked: !!d.locked,
            cityCount: (typeof d.cityCount === "number") ? d.cityCount : 4,
            uniqueTroop: d.uniqueTroop || "", order: i
        }));
        renderFactionList();
    };

// LOAD → harvest JSON, skip default creation, switch to editor
    wrap.querySelector("#se-setup-load").onclick = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.onchange = () => {
            const f = input.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const raw = JSON.parse(reader.result);
                    // 1. Populate state.scenario with the loaded data
                    _restoreScenarioFromCompact(raw);
                    // 2. Ensure new-format fields exist so ScenarioToolsPanel never crashes
                    if (!Array.isArray(state.scenario.importantNpcs))    state.scenario.importantNpcs = [];
                    if (!state.scenario.playerSetup || typeof state.scenario.playerSetup !== "object") state.scenario.playerSetup = {};
                    if (!state.scenario.proceduralAITendency || typeof state.scenario.proceduralAITendency !== "object") state.scenario.proceduralAITendency = {};
                    // 3. Kill the setup screen
                    wrap.remove();
                    // 4. Boot the editor workspace (it will naturally draw what is in state.scenario)
                    _buildEditor();
                } catch (e) {
                    alert("Failed to parse scenario file:\n" + e.message);
                }
            };
            reader.readAsText(f);
        };
        input.click();
    };
	
    // CANCEL → back to main menu
    wrap.querySelector("#se-setup-cancel").onclick = () => {
        wrap.remove();
        const ui = document.getElementById("main-menu-ui-container");
        if (ui) ui.style.display = "flex";
    };

    // CREATE → harvest form, build scenario doc, switch to editor
    wrap.querySelector("#se-setup-create").onclick = () => {
        // Validate: must have at least one non-Player non-Bandits faction
        const realFactions = setupState.factionsArr.filter(f =>
            f.enabled && f.name !== "Bandits" && f.name !== "Player"
        );
        if (realFactions.length === 0) {
            alert("You need at least one enabled faction (besides Player and Bandits).");
            return;
        }
        // Re-stamp order
        setupState.factionsArr.forEach((f, i) => f.order = i);

        const opts = {
            name:        wrap.querySelector("#se-cfg-name").value.trim() || "Untitled",
            author:      wrap.querySelector("#se-cfg-author").value.trim(),
            description: wrap.querySelector("#se-cfg-desc").value.trim(),
            tilesX: Math.max(100, Math.min(1000, parseInt(wrap.querySelector("#se-cfg-tx").value) || 250)),
            tilesY: Math.max(100, Math.min(1000, parseInt(wrap.querySelector("#se-cfg-ty").value) || 187)),
            mapData: wrap.querySelector('input[name="se-mapdata"]:checked').value,
            cityStrategy: wrap.querySelector("#se-cfg-citymode").value,
            factionsArr: setupState.factionsArr
        };

        state.scenario = _newScenarioDoc(opts);
        _generateScenarioTiles(state.scenario);

        // Auto-populate cities according to strategy (unless "none")
        if (opts.cityStrategy !== "none") {
            _autoPopulateCities(state.scenario, { strategy: opts.cityStrategy });
        }

        wrap.remove();
        _buildEditor();
    };

    // Initial render
    setTimeout(renderFactionList, 0);

    return wrap;
}

// ── Setup-screen helpers ────────────────────────────────────────────────────
function _swapArr(a, i, j) { const t = a[i]; a[i] = a[j]; a[j] = t; }
function _escapeAttr(s)    { return String(s).replace(/"/g, "&quot;").replace(/</g, "&lt;"); }
function _randomFactionColor() {
    const palette = ["#d32f2f", "#388e3c", "#1976d2", "#7b1fa2", "#fbc02d", "#00838f",
                     "#c2185b", "#5d4037", "#455a64", "#f57c00", "#8d6e63", "#0288d1"];
    return palette[Math.floor(Math.random() * palette.length)];
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ WINDOW MANAGER  — drag, resize, minimize, maximize for any panel         ║
// ╚══════════════════════════════════════════════════════════════════════════╝
const WindowManager = {
    _z: 1100,
    create(opts) {
        const { id, title, x = 20, y = 80, w = 260, h = 380, content = "" } = opts;
        const win = document.createElement("div");
        win.className = "se-window";
        win.id = id;
        Object.assign(win.style, {
            position: "fixed", left: x + "px", top: y + "px",
            width: w + "px", height: h + "px",
            background: "#262e3a", color: "#cfd8dc",
            border: "1px solid #5d7a90",
            boxShadow: "2px 2px 6px rgba(0,0,0,0.6)",
            zIndex: String(++this._z),
            display: "flex", flexDirection: "column",
            fontFamily: "Tahoma, Verdana, sans-serif",
            fontSize: "12px",
            minWidth: "180px", minHeight: "60px"
        });

        // Title bar
        const bar = document.createElement("div");
        bar.className = "se-window-bar";
        Object.assign(bar.style, {
            background: "linear-gradient(to bottom, #3a5475, #1e2d40)",
            color: "#fff", padding: "4px 6px",
            cursor: "move", userSelect: "none",
            display: "flex", alignItems: "center", gap: "4px"
        });
        bar.innerHTML = `<span style="flex:1;font-weight:bold;">${title}</span>`;
        const btnMin = document.createElement("button");
        btnMin.textContent = "_"; btnMin.title = "Minimize";
        btnMin.style.cssText = "width:22px;height:18px;font-weight:bold;cursor:pointer;";
        const btnMax = document.createElement("button");
        btnMax.textContent = "□"; btnMax.title = "Maximize";
        btnMax.style.cssText = "width:22px;height:18px;font-weight:bold;cursor:pointer;";
        bar.appendChild(btnMin); bar.appendChild(btnMax);
        win.appendChild(bar);

        // Body
        const body = document.createElement("div");
        body.className = "se-window-body";
        Object.assign(body.style, {
            flex: "1", overflow: "auto", padding: "6px"
        });
        if (typeof content === "string") body.innerHTML = content;
        else if (content) body.appendChild(content);
        win.appendChild(body);

        // Resize handle (bottom-right)
        const grip = document.createElement("div");
        Object.assign(grip.style, {
            position: "absolute", right: "0", bottom: "0",
            width: "14px", height: "14px",
            cursor: "nwse-resize",
            background: "linear-gradient(135deg, transparent 50%, #5d7a90 50%)"
        });
        win.appendChild(grip);

        // Click-to-focus
        win.addEventListener("mousedown", () => { win.style.zIndex = String(++this._z); });

        // ── Drag ──
        let dragging = false, dx = 0, dy = 0;
        bar.addEventListener("mousedown", (e) => {
            if (e.target !== bar && e.target.tagName !== "SPAN") return;
            dragging = true;
            dx = e.clientX - win.offsetLeft;
            dy = e.clientY - win.offsetTop;
            e.preventDefault();
        });
        // Touch drag support (mobile-friendly)
        bar.addEventListener("touchstart", (e) => {
            const t = e.touches[0];
            dragging = true;
            dx = t.clientX - win.offsetLeft;
            dy = t.clientY - win.offsetTop;
        }, { passive: true });
        document.addEventListener("mousemove", (e) => {
            if (!dragging) return;
            win.style.left = Math.max(0, Math.min(window.innerWidth - 50, e.clientX - dx)) + "px";
            win.style.top  = Math.max(0, Math.min(window.innerHeight - 30, e.clientY - dy)) + "px";
        });
        document.addEventListener("touchmove", (e) => {
            if (!dragging) return;
            const t = e.touches[0];
            win.style.left = Math.max(0, Math.min(window.innerWidth  - 50, t.clientX - dx)) + "px";
            win.style.top  = Math.max(MENU_H, Math.min(window.innerHeight - 30, t.clientY - dy)) + "px";
        }, { passive: true });
        document.addEventListener("mouseup",  () => { dragging = false; });
        document.addEventListener("touchend", () => { dragging = false; });

        // ── Resize ──
        let resizing = false, sw = 0, sh = 0, sx = 0, sy = 0;
        grip.addEventListener("mousedown", (e) => {
            resizing = true;
            sw = win.offsetWidth; sh = win.offsetHeight;
            sx = e.clientX; sy = e.clientY;
            e.preventDefault(); e.stopPropagation();
        });
        grip.addEventListener("touchstart", (e) => {
            resizing = true;
            sw = win.offsetWidth; sh = win.offsetHeight;
            const t = e.touches[0];
            sx = t.clientX; sy = t.clientY;
            e.stopPropagation();
        }, { passive: true });
        document.addEventListener("mousemove", (e) => {
            if (!resizing) return;
            win.style.width  = Math.max(180, sw + (e.clientX - sx)) + "px";
            win.style.height = Math.max(60,  sh + (e.clientY - sy)) + "px";
        });
        document.addEventListener("touchmove", (e) => {
            if (!resizing) return;
            const t = e.touches[0];
            win.style.width  = Math.max(150, sw + (t.clientX - sx)) + "px";
            win.style.height = Math.max(60,  sh + (t.clientY - sy)) + "px";
        }, { passive: true });
        document.addEventListener("mouseup",  () => { resizing = false; });
        document.addEventListener("touchend", () => { resizing = false; });

        // ── Minimize / Maximize — proper Windows logic ──
        //   State machine: normal ↔ minimized, normal ↔ maximized
        //   Maximizing a minimized window restores first, then maximizes.
        //   _min and _maxed are independent flags.
        let _min   = false;
        let _maxed = false;
        let _savedGeom = null;   // { left, top, width, height } before maximize
        let _savedH    = null;   // height before minimize

        function _saveGeom() {
            return { left: win.style.left, top: win.style.top,
                     width: win.style.width, height: win.style.height };
        }
        function _restore() {
            // Restore to normal from either min or max state
            if (_maxed && _savedGeom) {
                Object.assign(win.style, _savedGeom);
                _maxed = false; _savedGeom = null;
            }
            if (_min) {
                body.style.display = "flex";
                grip.style.display = "block";
                if (_savedH !== null) win.style.height = _savedH;
                _min = false; _savedH = null;
            }
        }

        btnMin.onclick = () => {
            if (_min) {
                // Restore from minimized
                _restore();
            } else {
                // Minimize — first un-maximize if needed (keeping geom)
                if (_maxed) { Object.assign(win.style, _savedGeom); _maxed = false; _savedGeom = null; }
                _savedH = win.style.height || (win.offsetHeight + "px");
                body.style.display = "none";
                grip.style.display = "none";
                win.style.height = bar.offsetHeight + "px";
                _min = true;
            }
        };
        btnMax.onclick = () => {
            if (_maxed) {
                // Restore from maximized
                _restore();
            } else {
                // Maximize — first un-minimize so body is visible
                if (_min) {
                    body.style.display = "flex";
                    grip.style.display = "block";
                    if (_savedH !== null) win.style.height = _savedH;
                    _min = false; _savedH = null;
                }
                _savedGeom = _saveGeom();
                Object.assign(win.style, { left: "0px", top: MENU_H + "px",
                    width: "100vw", height: "calc(100vh - " + MENU_H + "px)" });
                _maxed = true;
            }
        };

        return { root: win, body, bar };
    }
};

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ MENU BAR  — Windows-inspired top menu bar (File / Edit / View / Help)    ║
// ╚══════════════════════════════════════════════════════════════════════════╝
const MENU_H = 30; // Global height constant for the top bar

function _buildMenuBar(root) {
    const bar = document.createElement("div");
    Object.assign(bar.style, {
        position: "absolute", 
        top: "0", 
        left: "0", 
        right: "0",
        height: MENU_H + "px",
        background: "#1a2538", // Solid dark background to prevent bleed
        borderBottom: "1px solid #3a5a7a",
        display: "flex", 
        alignItems: "stretch", 
        zIndex: "2000", // Highest priority layer
        fontFamily: "Tahoma, Verdana, sans-serif",
        userSelect: "none",
        overflow: "visible" // Allow dropdowns to show
    });

    // ── Scenario title (left label) ─────────────────────────────────────────
    const titleArea = document.createElement("div");
    Object.assign(titleArea.style, {
        display: "flex", alignItems: "center", padding: "0 10px 0 12px",
        color: "#f5d76e", fontWeight: "bold", fontSize: "12px",
        borderRight: "1px solid #3a5a7a", whiteSpace: "nowrap",
        flexShrink: "0", gap: "5px", maxWidth: "260px",
        overflow: "hidden", textOverflow: "ellipsis"
    });
    titleArea.id = "se-menu-title";
    const _tIcon = document.createElement("span");
    _tIcon.textContent = "🗺";
    _tIcon.style.fontSize = "13px";
    titleArea.appendChild(_tIcon);
    const _tText = document.createElement("span");
    _tText.id = "se-title-text";
    _tText.textContent = "Scenario: " + (state.scenario ? state.scenario.meta.name : "—");
    _tText.style.cssText = "overflow:hidden;text-overflow:ellipsis;";
    titleArea.appendChild(_tText);
    bar.appendChild(titleArea);

    // ── Active dropdown tracker ─────────────────────────────────────────────
    let _activeDd  = null;
    let _activeBtn = null;
    function _closeAll() {
        if (_activeDd)  { _activeDd.style.display  = "none"; _activeDd  = null; }
        if (_activeBtn) { _activeBtn.style.background = "none"; _activeBtn = null; }
    }
    document.addEventListener("click", _closeAll);

function _makeMenu(label, items) {
		const wrapper = document.createElement("div");
		// THE SURGERY: Added position: relative so the absolute dropdown anchors here
		Object.assign(wrapper.style, {
			display: "flex",
			position: "relative" 
		});
        const btn = document.createElement("button");
        btn.textContent = label;
        Object.assign(btn.style, {
            background: "none", 
            border: "none", // Removed border-right to prevent vertical lines
            color: "#cfd8dc", 
            padding: "0 15px", 
            cursor: "pointer",
            fontSize: "11px",
            height: MENU_H + "px",
            position: "relative"
        });

        const dd = document.createElement("div");
        Object.assign(dd.style, {
            display: "none", 
            position: "absolute", 
            top: (MENU_H - 1) + "px", // Slight overlap to hide border
            left: "0",
            background: "#141d2c",
            border: "1px solid #3a5a7a",
            minWidth: "200px", 
            zIndex: "2001", // Higher than the bar itself
            boxShadow: "0 4px 10px rgba(0,0,0,0.5)"
        });
        dd.addEventListener("click", (e) => e.stopPropagation());

        function _open() {
            _closeAll();
            _activeDd  = dd;
            _activeBtn = btn;
            dd.style.display    = "block";
            btn.style.background = "#2a5a8c";
        }
        function _toggle() {
            dd.style.display === "none" ? _open() : _closeAll();
        }

        btn.onclick = (e) => { e.stopPropagation(); _toggle(); };
        btn.onmouseenter = () => {
            btn.style.background = "#2a5a8c";
            if (_activeDd && _activeDd !== dd) _open();
        };
        btn.onmouseleave = () => {
            if (_activeDd !== dd) btn.style.background = "none";
        };

        // Build items
        items.forEach(item => {
            if (item === "---") {
                const sep = document.createElement("div");
                sep.style.cssText = "border-top:1px solid #3a5a7a;margin:4px 0;";
                dd.appendChild(sep); return;
            }
            if (typeof item === "string" && item.startsWith("##")) {
                const hdr = document.createElement("div");
                hdr.style.cssText = "padding:5px 12px 2px;color:#7a9ab8;font-size:10px;text-transform:uppercase;letter-spacing:1px;pointer-events:none;";
                hdr.textContent = item.slice(2).trim();
                dd.appendChild(hdr); return;
            }
            const mi = document.createElement("div");
            mi.style.cssText = `
                padding:5px 20px 5px 34px;cursor:pointer;color:#cfd8dc;
                position:relative;white-space:nowrap;font-size:12px;
                font-family:Tahoma,Verdana,sans-serif;
            `;
            if (item.toggle) {
                const chk = document.createElement("span");
                chk.style.cssText = "position:absolute;left:10px;color:#4aafd8;font-weight:bold;top:4px;font-size:13px;";
                chk.textContent = (item.initChecked !== false) ? "✓" : "";
                mi.appendChild(chk);
                mi.appendChild(document.createTextNode(" " + item.label));
                mi.onclick = (e) => {
                    e.stopPropagation();
                    const wasOn = chk.textContent === "✓";
                    chk.textContent = wasOn ? "" : "✓";
                    item.action(!wasOn);
                };
            } else {
                mi.textContent = item.label;
                mi.onclick = () => { _closeAll(); item.action(); };
            }
            mi.onmouseenter = () => { mi.style.background = "#1e4a7a"; mi.style.color = "#fff"; };
            mi.onmouseleave = () => { mi.style.background = "none"; mi.style.color = "#cfd8dc"; };
            dd.appendChild(mi);
        });

        wrapper.appendChild(btn);
        wrapper.appendChild(dd);
        bar.appendChild(wrapper);
    }

    // ── Panel visibility toggle ─────────────────────────────────────────────
    function _panelToggle(id) {
        const w = document.getElementById(id);
        if (!w) return;
        w.style.display = (w.style.display === "none") ? "flex" : "none";
    }

    // ── FILE menu ───────────────────────────────────────────────────────────
    _makeMenu("File", [
        { label: "💾 Save Scenario",        action: _save },
        { label: "📂 Load Scenario",        action: _load },
        "---",
        { label: "ℹ File Info / Metadata", action: () => {
            if (!state.scenario) { alert("No scenario loaded."); return; }
            const m = state.scenario.meta;
            const d = state.scenario.dimensions;
            const en = Object.values(state.scenario.factions).filter(f => f.enabled).length;
            const ct = state.scenario.cities.length;
            alert(
                "SCENARIO INFO\n" +
                "══════════════════════\n" +
                "Name:     " + m.name + "\n" +
                "Author:   " + (m.author || "Unknown") + "\n" +
                "Version:  " + (state.scenario.version || 1) + "\n" +
                "Created:  " + (m.created  ? m.created.slice(0, 10)  : "—") + "\n" +
                "Modified: " + (m.modified ? m.modified.slice(0, 10) : "—") + "\n\n" +
                "Map Size:  " + d.tilesX + " × " + d.tilesY + " tiles\n" +
                "Factions:  " + en + " enabled\n" +
                "Cities:    " + ct + "\n" +
                "Triggers:  " + (state.scenario.triggers || []).length + "\n\n" +
                "Description:\n" + (m.description || "(none)")
            );
        }}
    ]);

    // ── EDIT menu (tool / panel toggles) ────────────────────────────────────
    _makeMenu("Edit", [
        "## Tool Panels",
        { label: "Tools Panel",      toggle: true, initChecked: true, action: () => _panelToggle("se-win-tools") },
        { label: "Brush Panel",      toggle: true, initChecked: true, action: () => _panelToggle("se-win-brush") },
        { label: "Navigation Panel", toggle: true, initChecked: false, action: () => _panelToggle("se-win-nav") },
        "## Data Panels",
        { label: "Factions Panel",   toggle: true, initChecked: true, action: () => _panelToggle("se-win-factions") },
        { label: "Cities Panel",     toggle: true, initChecked: true, action: () => _panelToggle("se-win-cities") },
        { label: "Triggers Panel",   toggle: true, initChecked: true, action: () => _panelToggle("se-win-triggers") },
        { label: "⚔ Diplomacy Panel", toggle: true, initChecked: true, action: () => _panelToggle("se-win-diplomacy") },
        "## Entity Panels",
        {
            label: "👤 Story NPCs…",
            action: () => {
                if (window.ScenarioToolsPanel && window.ScenarioToolsPanel.openStoryNpcPanel) {
                    window.ScenarioToolsPanel.openStoryNpcPanel();
                } else {
                    alert("Scenario Tools Panel not loaded.\nAdd <script src=\"story/scenario_tools_panel.js\"> after scenario_editor.js in index.html.");
                }
            }
        },
        {
            label: "🎮 Player Setup…",
            action: () => {
                if (window.ScenarioToolsPanel && window.ScenarioToolsPanel.openDropPlayer) {
                    window.ScenarioToolsPanel.openDropPlayer(0.5, 0.5);
                } else {
                    alert("Scenario Tools Panel not loaded.");
                }
            }
        },
        {
            label: "🤖 Procedural AI…",
            action: () => {
                if (window.ScenarioToolsPanel && window.ScenarioToolsPanel.openProceduralAI) {
                    window.ScenarioToolsPanel.openProceduralAI();
                } else {
                    alert("Scenario Tools Panel not loaded.");
                }
            }
        }
    ]);

    // ── VIEW menu ───────────────────────────────────────────────────────────
    _makeMenu("View", [
        { label: "⊡ Snap Panels to Edges",  action: _snapPanelsToEdges },
        { label: "◧ Snap All Left",         action: _snapPanelsLeft },
        { label: "◨ Snap All Right",        action: _snapPanelsRight },
        "---",
        { label: "↺ Reset Panel Positions", action: _resetPanelPositions }
    ]);

    // ── HELP menu ───────────────────────────────────────────────────────────
    _makeMenu("Help", [
        { label: "🖌 Paint Biome",         action: () => alert("🖌 PAINT BIOME\n\nDrag on the canvas to paint the selected biome. Adjust brush size, strength, and active biome in the Brush panel.") },
        { label: "🧽 Erase",              action: () => alert("🧽 ERASE\n\nDrag to reset tiles back to Plains. Useful for correcting paint mistakes.") },
        { label: "⬆ Elevate / ⬇ Lower", action: () => alert("⬆ ELEVATE / ⬇ LOWER\n\nAdjust tile altitude. High elevation → mountains; low → coastal/ocean. Biome is auto-reclassified.") },
        { label: "💧 Moisten / 🌵 Dry",  action: () => alert("💧 MOISTEN / 🌵 DRY\n\nAdjust tile moisture. High moisture → forest/jungle; low → desert/dunes.") },
        { label: "〰 Paint River",         action: () => alert("〰 PAINT RIVER\n\nMark tiles as river tiles. Rivers appear coastal-coloured and affect movement speed.") },
        { label: "🏰 Place City",          action: () => alert("🏰 PLACE CITY\n\nClick any non-ocean tile to place a new city. You will be prompted for name and faction.") },
        { label: "✥ Move City",           action: () => alert("✥ MOVE CITY\n\nClick and drag a city marker to reposition it on the map.") },
        { label: "✖ Delete City",         action: () => alert("✖ DELETE CITY\n\nClick on a city marker to permanently remove it from the scenario.") },
        "---",
        { label: "⌨ Keyboard Shortcuts",  action: () => alert(
"KEYBOARD SHORTCUTS\n\n" +
"── Desktop ──────────────────────────\n" +
"WASD / Arrow Keys  — Pan camera\n" +
"Scroll Wheel       — Zoom in / out\n" +
"Right-click drag   — Pan camera\n" +
"Left-click drag    — Use active tool\n\n" +
"── Mobile / Touch ───────────────────\n" +
"Touch-drag canvas  — Use active tool\n" +
"Two-finger drag    — Pan camera\n" +
"▲ ▼ ◀ ▶ buttons   — Pan camera\n" +
"＋ / ─ buttons    — Zoom in / out\n\n" +
"(Show the Navigation panel via Edit menu\n" +
" for on-screen arrow and zoom controls)"
) },
        "---",
        { label: "ℹ Launching a Scenario", action: () => alert("LAUNCHING A SCENARIO\n\nScenario testing is done from the Main Menu — not inside the editor.\n\n1.  Save your scenario (File → Save Scenario)\n2.  Exit the editor (✕ Exit button)\n3.  From the Main Menu, click 'Launch Scenario'\n4.  Select your saved .dog_scenario.json file\n\nThe game will load and begin playing your scenario.") }
    ]);

    // ── EXIT — styled as a menu button, positioned after Help ──────────────
    (function() {
        const wrapper = document.createElement("div");
        Object.assign(wrapper.style, { position: "relative", display: "flex", alignItems: "stretch" });

const exitBtn = document.createElement("button");
exitBtn.textContent = "Exit";
Object.assign(exitBtn.style, {
    background: "none", border: "none",
    /* borderRight removed to stop the bleeding line */
    color: "#ff8888", padding: "0 10px", cursor: "pointer",
            fontSize: "10.2px", fontFamily: "Tahoma, Verdana, sans-serif",
            height: MENU_H + "px", whiteSpace: "nowrap", letterSpacing: "0.3px",
            fontWeight: "bold"
        });
        exitBtn.onmouseenter = () => { exitBtn.style.background = "#4a1515"; exitBtn.style.color = "#ffcccc"; };
        exitBtn.onmouseleave = () => { exitBtn.style.background = "none";    exitBtn.style.color = "#ff8888"; };
        exitBtn.onclick = _exit;
        wrapper.appendChild(exitBtn);
        bar.appendChild(wrapper);
    })();

    root.appendChild(bar);
    return bar;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ PANEL SNAP / LAYOUT HELPERS                                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _snapPanelsToEdges() {
    const W = window.innerWidth, H = window.innerHeight;
    const TOP = MENU_H, BOT = 22, AVAIL = H - TOP - BOT;
    const isMobile = W < 640;

    const LW = isMobile ? Math.min(160, Math.floor(W * 0.44)) : Math.min(210, Math.floor(W * 0.18));
    const RW = isMobile ? Math.min(175, Math.floor(W * 0.46)) : Math.min(270, Math.floor(W * 0.21));
    const RX = W - RW;

    const toolsH = Math.max(120, Math.floor(AVAIL * 0.58));
    const brushH = Math.max(60,  AVAIL - toolsH);
    const facH   = Math.max(100, Math.floor(AVAIL * 0.38));
    const cityH  = Math.max(80,  Math.floor(AVAIL * 0.34));
    const trigH  = Math.max(50,  Math.floor(AVAIL * 0.10));
    const dipH   = Math.max(80,  AVAIL - facH - cityH - trigH);

    const ids = {
        tools:    { id: "se-win-tools",     x: 0,   y: TOP,                        w: LW, h: toolsH },
        brush:    { id: "se-win-brush",     x: 0,   y: TOP + toolsH,               w: LW, h: brushH },
        factions: { id: "se-win-factions",  x: RX,  y: TOP,                        w: RW, h: facH   },
        cities:   { id: "se-win-cities",    x: RX,  y: TOP + facH,                 w: RW, h: cityH  },
        triggers: { id: "se-win-triggers",  x: RX,  y: TOP + facH + cityH,         w: RW, h: trigH  },
        diplomacy:{ id: "se-win-diplomacy", x: RX,  y: TOP + facH + cityH + trigH, w: RW, h: dipH   }
    };
    Object.values(ids).forEach(({ id, x, y, w, h }) => {
        const el = document.getElementById(id);
        if (el && el.style.display !== "none") {
            Object.assign(el.style, {
                left: x + "px", top: y + "px", width: w + "px", height: h + "px"
            });
        }
    });
}

function _snapPanelsLeft() {
    const W = window.innerWidth, H = window.innerHeight;
    const TOP = MENU_H, BOT = 22, AVAIL = H - TOP - BOT;
    const PW = Math.min(210, Math.floor(W * 0.20));
    const visIds = ["se-win-tools","se-win-brush","se-win-factions","se-win-cities","se-win-triggers","se-win-diplomacy"]
        .filter(id => { const el = document.getElementById(id); return el && el.style.display !== "none"; });
    const perH = Math.floor(AVAIL / (visIds.length || 1));
    visIds.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el) Object.assign(el.style, { left:"0", top:(TOP + i * perH)+"px", width:PW+"px", height:perH+"px" });
    });
}

function _snapPanelsRight() {
    const W = window.innerWidth, H = window.innerHeight;
    const TOP = MENU_H, BOT = 22, AVAIL = H - TOP - BOT;
    const PW = Math.min(270, Math.floor(W * 0.22));
    const RX = W - PW;
    const visIds = ["se-win-tools","se-win-brush","se-win-factions","se-win-cities","se-win-triggers","se-win-diplomacy"]
        .filter(id => { const el = document.getElementById(id); return el && el.style.display !== "none"; });
    const perH = Math.floor(AVAIL / (visIds.length || 1));
    visIds.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el) Object.assign(el.style, { left:RX+"px", top:(TOP + i * perH)+"px", width:PW+"px", height:perH+"px" });
    });
}

function _resetPanelPositions() {
    ["se-win-tools","se-win-brush","se-win-factions","se-win-cities","se-win-triggers","se-win-diplomacy"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "flex";
    });
    _snapPanelsToEdges();
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ EDITOR WORKSPACE                                                         ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _buildEditor() {
    state.open = true;
    window.isPaused = true;
// Main Root Container
    const root = document.createElement("div");
    root.id = "se-editor-root";
    Object.assign(root.style, {
        position: "fixed", inset: "0", background: "#0e1218",
        zIndex: "10001"
    });
    state.rootEl = root;

    // 1. Build Menu Bar first (Z-Index 2000)
    _buildMenuBar(root);

    // 2. Build Canvas (Z-Index 1, Lowered)
    const canvas = document.createElement("canvas");
    canvas.id = "se-canvas";
    Object.assign(canvas.style, {
        position: "absolute",
        top: MENU_H + "px", // Starts EXACTLY where menu ends
        left: "0",
        right: "0",
        bottom: "22px", // Space for status bar
        cursor: "crosshair",
        zIndex: "1" // Force below all UI elements
    });
    
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight - MENU_H - 22;
    root.appendChild(canvas);
    state.canvas = canvas;
    state.ctx    = canvas.getContext("2d");

    // Off-screen "map canvas" — the rasterized scenario tiles, painted once and re-painted on edit
    state.mapCanvas = document.createElement("canvas");
    state.mapCtx    = state.mapCanvas.getContext("2d", { alpha: false });
    _resizeMapCanvas();
    _paintAllTiles();

    // Center camera on the map at the default zoom
    (function() {
        const mapW = state.scenario.dimensions.tilesX * TILE_PX;
        const mapH = state.scenario.dimensions.tilesY * TILE_PX;
        const vpW  = window.innerWidth;
        const vpH  = window.innerHeight - MENU_H;
        state.cam.x = (mapW / 2) - (vpW  / 2 / state.cam.zoom);
        state.cam.y = (mapH / 2) - (vpH  / 2 / state.cam.zoom);
    })();

    // Status bar
    const status = document.createElement("div");
    status.id = "se-status";
    Object.assign(status.style, {
        position: "absolute", bottom: "0", left: "0", right: "0", height: "22px",
        background: "#1a2030", borderTop: "1px solid #4a8fa8",
        padding: "2px 10px", fontSize: "11px", color: "#8aa",
        zIndex: "1200"
    });
    status.innerHTML = `<span id="se-st-pos">(0,0)</span> | <span id="se-st-tile">—</span> | <span id="se-st-tool">PAINT</span> | <span id="se-st-zoom">1.0×</span>`;
    root.appendChild(status);

    // Tool panel (left – default position; snap will refine it)
    const toolsBody = document.createElement("div");
    toolsBody.appendChild(_buildToolsPanel());
    const toolsWin = WindowManager.create({
        id: "se-win-tools", title: "Tools",
        x: 0, y: MENU_H, w: 210, h: 440,
        content: toolsBody
    });
    root.appendChild(toolsWin.root);

    // Brush panel (left, below tools)
    const brushWin = WindowManager.create({
        id: "se-win-brush", title: "Brush",
        x: 0, y: MENU_H + 440, w: 210, h: 240,
        content: _buildBrushPanel()
    });
    root.appendChild(brushWin.root);

    // Faction panel (right)
    const facWin = WindowManager.create({
        id: "se-win-factions", title: "Factions",
        x: window.innerWidth - 270, y: MENU_H, w: 270, h: 320,
        content: _buildFactionPanel()
    });
    root.appendChild(facWin.root);

    // Cities panel (right, below factions)
    const cityWin = WindowManager.create({
        id: "se-win-cities", title: "Cities",
        x: window.innerWidth - 270, y: MENU_H + 320, w: 270, h: 280,
        content: _buildCityPanel()
    });
    root.appendChild(cityWin.root);

    // Triggers panel (right, below cities) — placeholder
    const trigWin = WindowManager.create({
        id: "se-win-triggers", title: "Triggers",
        x: window.innerWidth - 270, y: MENU_H + 600, w: 270, h: 80,
        content: _buildTriggersPanel()
    });
    root.appendChild(trigWin.root);

    // Diplomacy panel (right, below triggers) — set launch-time faction relations
    const dipWin = WindowManager.create({
        id: "se-win-diplomacy", title: "⚔ Diplomacy",
        x: window.innerWidth - 270, y: MENU_H + 680, w: 270, h: 260,
        content: _buildDiplomacyPanel()
    });
    root.appendChild(dipWin.root);

    // Navigation panel — mobile D-pad + zoom buttons
    const navWin = WindowManager.create({
        id: "se-win-nav", title: "Navigation",
        x: Math.floor(window.innerWidth / 2) - 80, y: window.innerHeight - 240,
        w: 176, h: 220,
        content: _buildNavPanel()
    });
    root.appendChild(navWin.root);

    document.body.appendChild(root);

    // Snap all panels to their default edge positions (responsive to viewport)
    setTimeout(_snapPanelsToEdges, 0);
    // Navigation panel is hidden by default; user shows it via Edit menu
    setTimeout(() => {
        const navEl = document.getElementById("se-win-nav");
        if (navEl) navEl.style.display = "none";
    }, 10);

    _attachEditorEvents();
    _startEditorLoop();

    console.log("[ScenarioEditor] Editor opened.");
}

function _titleSpan(text) {
    const s = document.createElement("span");
    s.textContent = text;
    s.style.cssText = "color:#f5d76e;font-weight:bold;";
    return s;
}
function _spacer() { const s = document.createElement("span"); s.style.flex = "1"; return s; }

// ── TOOLS PANEL ─────────────────────────────────────────────────────────────
function _buildToolsPanel() {
    const wrap = document.createElement("div");
    const tools = [
        { key: "paint",        label: "🖌 Paint Biome",      hint: "LMB to paint with brush biome" },
        { key: "erase",        label: "🧽 Erase (→Plains)",   hint: "LMB to reset to default plains" },
        { key: "elevate",      label: "⬆ Elevate (e+)",       hint: "Raise altitude" },
        { key: "lower",        label: "⬇ Lower (e−)",         hint: "Lower altitude" },
        { key: "moisten",      label: "💧 Moisten (m+)",      hint: "Increase moisture" },
        { key: "dry",          label: "🌵 Dry (m−)",          hint: "Decrease moisture" },
        { key: "river_paint",  label: "〰 Paint River",        hint: "Mark tile as a river" },
        { key: "place_city",   label: "🏰 Place City",        hint: "LMB to drop a new city" },
        { key: "move_city",    label: "✥ Move City",         hint: "LMB-drag to relocate" },
        { key: "delete_city",  label: "✖ Delete City",       hint: "LMB on a city to remove" },
        { key: "select",       label: "👆 Select / Inspect", hint: "Click any tile or city" }
    ];
    tools.forEach(t => {
        const b = document.createElement("button");
        b.dataset.tool = t.key;
        b.title = t.hint;
        b.textContent = t.label;
        b.style.cssText = `
            display:block;width:100%;text-align:left;
            padding:5px 8px;margin:2px 0;
            background:#1a3a5c;color:#cfd8dc;
            border:1px solid #4a8fa8;cursor:pointer;font-size:12px;
        `;
        b.onclick = () => _setTool(t.key);
        wrap.appendChild(b);
    });
    setTimeout(() => _refreshToolButtons(), 0);
    return wrap;
}
function _refreshToolButtons() {
    document.querySelectorAll("button[data-tool]").forEach(b => {
        b.style.background = (b.dataset.tool === state.tool) ? "#2a5a8c" : "#1a3a5c";
        b.style.color      = (b.dataset.tool === state.tool) ? "#ffffff" : "#cfd8dc";
    });
}
function _setTool(t) {
    state.tool = t;
    _refreshToolButtons();
    const st = document.getElementById("se-st-tool");
    if (st) st.textContent = t.toUpperCase();
}

// ── BRUSH PANEL ─────────────────────────────────────────────────────────────
function _buildBrushPanel() {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
        <div style="margin-bottom:6px;">
            <label>Size:
                <input type="range" id="se-brush-size" min="1" max="64" value="${state.brush.size}" style="width:100px;">
                <span id="se-brush-size-val">${state.brush.size}</span>
            </label>
        </div>
        <div style="margin-bottom:6px;">
            <label>Strength:
                <input type="range" id="se-brush-strength" min="0.05" max="1.0" step="0.05" value="${state.brush.strength}" style="width:100px;">
                <span id="se-brush-strength-val">${state.brush.strength.toFixed(2)}</span>
            </label>
        </div>
        <div style="margin-bottom:6px;font-weight:bold;color:#f5d76e;">Biome (for Paint tool):</div>
        <div id="se-brush-biome-list"></div>
    `;
    setTimeout(() => {
        const list = wrap.querySelector("#se-brush-biome-list");
        Object.keys(BIOME_TARGETS).forEach(name => {
            const t = classifyTile(BIOME_TARGETS[name].e, BIOME_TARGETS[name].m, name === "River");
            const b = document.createElement("button");
            b.dataset.biome = name;
            b.style.cssText = `
                display:flex;align-items:center;gap:6px;width:100%;text-align:left;
                padding:3px 6px;margin:1px 0;background:#1a3a5c;color:#cfd8dc;
                border:1px solid #4a8fa8;cursor:pointer;font-size:11px;
            `;
            b.innerHTML = `
                <span style="width:14px;height:14px;background:${t.color};border:1px solid #000;display:inline-block;"></span>
                ${name}
            `;
            b.onclick = () => {
                state.brush.biome = name;
                _refreshBiomeButtons();
            };
            list.appendChild(b);
        });
        _refreshBiomeButtons();

        wrap.querySelector("#se-brush-size").oninput = (e) => {
            state.brush.size = parseInt(e.target.value);
            wrap.querySelector("#se-brush-size-val").textContent = state.brush.size;
        };
        wrap.querySelector("#se-brush-strength").oninput = (e) => {
            state.brush.strength = parseFloat(e.target.value);
            wrap.querySelector("#se-brush-strength-val").textContent = state.brush.strength.toFixed(2);
        };
    }, 0);
    return wrap;
}
function _refreshBiomeButtons() {
    document.querySelectorAll("button[data-biome]").forEach(b => {
        b.style.background = (b.dataset.biome === state.brush.biome) ? "#2a5a8c" : "#1a3a5c";
    });
}

// ── FACTION PANEL ───────────────────────────────────────────────────────────
// In-editor panel. Lets the user toggle, recolor, rename, reorder, and edit
// the unique troop / city count for any faction after the scenario is built.
function _buildFactionPanel() {
    const wrap = document.createElement("div");
    wrap.id = "se-faction-panel-body";
    _renderFactionPanel(wrap);
    return wrap;
}
function _renderFactionPanel(wrap) {
    if (!wrap) wrap = document.getElementById("se-faction-panel-body");
    if (!wrap) return;
    wrap.innerHTML = "";

    const ordered = _orderedFactions(state.scenario);
    ordered.forEach(([fName, fData], idx) => {
        const row = document.createElement("div");
        row.style.cssText = "border-bottom:1px dotted #444;padding:5px 0;";
        const cnt = state.scenario.cities.filter(c => c.faction === fName).length;
        const isLocked = false;        // no faction is name-locked in the editor
        const isUndeletable = false;   // all factions including Player & Bandits are deletable

        const uniqueOpts = ['<option value="">— None —</option>']
            .concat(ALL_TROOP_TYPES.map(u =>
                `<option value="${u}" ${fData.uniqueTroop === u ? "selected" : ""}>${u}</option>`
            )).join("");

        row.innerHTML = `
            <div style="display:flex;align-items:center;gap:3px;">
                <button data-act="up"   ${idx === 0 ? "disabled" : ""}
                        style="padding:0 4px;background:#1a3a5c;color:#cfd8dc;border:1px solid #4a8fa8;cursor:pointer;font-size:10px;">▲</button>
                <button data-act="down" ${idx === ordered.length - 1 ? "disabled" : ""}
                        style="padding:0 4px;background:#1a3a5c;color:#cfd8dc;border:1px solid #4a8fa8;cursor:pointer;font-size:10px;">▼</button>
                <input type="checkbox" data-fac-en="${fName}" ${fData.enabled ? "checked" : ""} ${isLocked ? "disabled" : ""}>
                <input type="color" data-fac-color="${fName}" value="${fData.color}" style="width:24px;height:18px;border:0;background:transparent;cursor:pointer;" title="Pick faction colour (architecture auto-matches nearest built-in style)">
                <input type="text" data-fac-rename="${fName}" value="${_escapeAttr(fName)}" ${isLocked ? "disabled" : ""}
                       style="flex:1;font-weight:bold;font-size:11px;background:#0e1218;color:#f5d76e;border:1px solid #4a8fa8;padding:1px 3px;">
                <button data-act="del"
                        style="padding:0 5px;background:#3a1a1a;color:#ffaaaa;border:1px solid #7a3a3a;cursor:pointer;font-size:10px;">✗</button>
            </div>
            <div style="display:flex;align-items:center;gap:6px;font-size:10px;color:#8aa;margin-top:3px;">
                <label>Unique:<select data-fac-unique="${fName}" style="background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;font-size:10px;max-width:110px;">${uniqueOpts}</select></label>
                <label>Cities target:<input type="number" data-fac-citycount="${fName}" value="${fData.cityCount || 0}" min="0" max="50" style="width:36px;background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;font-size:10px;"></label>
                <span>(now: ${cnt})</span>
            </div>
        `;
        wrap.appendChild(row);
    });

    // Wire events
    wrap.querySelectorAll("input[data-fac-en]").forEach(cb => {
        cb.onchange = () => {
            state.scenario.factions[cb.dataset.facEn].enabled = cb.checked;
        };
    });
    // Colour picker — user may pick ANY colour.  The display colour is stored
    // as-is.  Architecture snapping (mapping to the nearest built-in faction
    // style so city interiors never crash) is handled at launch time inside
    // scenario_update.js _replaceCities(), so there is nothing dangerous here.
    wrap.querySelectorAll("input[data-fac-color]").forEach(cp => {
        cp.onchange = () => {
            const fName = cp.dataset.facColor;
            state.scenario.factions[fName].color = cp.value;
            // Keep live window.FACTIONS in sync so the world map dot colours
            // update immediately without requiring a full re-launch.
            if (window.FACTIONS && window.FACTIONS[fName]) {
                window.FACTIONS[fName].color = cp.value;
            }
            // Recolor any cities already placed in the scenario
            state.scenario.cities.forEach(c => { if (c.faction === fName) c.color = cp.value; });
        };
    });
    wrap.querySelectorAll("input[data-fac-rename]").forEach(inp => {
        inp.onchange = () => {
            const oldName = inp.dataset.facRename;
            const newName = inp.value.trim();
            if (!newName || newName === oldName) return;
            if (state.scenario.factions[newName]) { alert("That faction name is already in use."); inp.value = oldName; return; }
            // Re-key the dict
            const data = state.scenario.factions[oldName];
            delete state.scenario.factions[oldName];
            state.scenario.factions[newName] = data;
            // Migrate cities
            state.scenario.cities.forEach(c => { if (c.faction === oldName) c.faction = newName; });
            // FIX: keep live window.FACTIONS in sync so rename is immediately
            // visible in the diplomacy table without requiring a full launch.
            if (window.FACTIONS && window.FACTIONS[oldName]) {
                window.FACTIONS[newName] = window.FACTIONS[oldName];
                delete window.FACTIONS[oldName];
                if (typeof window.initDiplomacy === 'function') {
                    window.initDiplomacy(window.FACTIONS);
                }
            }
            // Migrate initialDiplomacy keys
            if (state.scenario.initialDiplomacy) {
                const dip = state.scenario.initialDiplomacy;
                if (dip[oldName]) { dip[newName] = dip[oldName]; delete dip[oldName]; }
                Object.keys(dip).forEach(k => {
                    if (dip[k][oldName] !== undefined) { dip[k][newName] = dip[k][oldName]; delete dip[k][oldName]; }
                });
            }
            _renderFactionPanel(); _renderCityPanel(); _renderDiplomacyPanel();
        };
    });
    wrap.querySelectorAll("select[data-fac-unique]").forEach(sel => {
        sel.onchange = () => {
            state.scenario.factions[sel.dataset.facUnique].uniqueTroop = sel.value;
        };
    });
    wrap.querySelectorAll("input[data-fac-citycount]").forEach(inp => {
        inp.oninput = () => {
            state.scenario.factions[inp.dataset.facCitycount].cityCount = Math.max(0, parseInt(inp.value) || 0);
        };
    });
    wrap.querySelectorAll('button[data-act="up"]').forEach((b, idx) => {
        b.onclick = () => {
            if (idx === 0) return;
            const arr = _orderedFactions(state.scenario);
            const a = arr[idx - 1][0], c = arr[idx][0];
            const tmp = state.scenario.factions[a].order;
            state.scenario.factions[a].order = state.scenario.factions[c].order;
            state.scenario.factions[c].order = tmp;
            _renderFactionPanel();
        };
    });
    wrap.querySelectorAll('button[data-act="down"]').forEach((b, idx) => {
        b.onclick = () => {
            const arr = _orderedFactions(state.scenario);
            if (idx >= arr.length - 1) return;
            const a = arr[idx + 1][0], c = arr[idx][0];
            const tmp = state.scenario.factions[a].order;
            state.scenario.factions[a].order = state.scenario.factions[c].order;
            state.scenario.factions[c].order = tmp;
            _renderFactionPanel();
        };
    });
    wrap.querySelectorAll('button[data-act="del"]').forEach((b, idx) => {
        b.onclick = () => {
            const arr = _orderedFactions(state.scenario);
            const fName = arr[idx][0];
            if (!confirm(`Delete faction "${fName}" and all of its cities?`)) return;
            delete state.scenario.factions[fName];
            state.scenario.cities = state.scenario.cities.filter(c => c.faction !== fName);
            // Remove this faction from initialDiplomacy too
            if (state.scenario.initialDiplomacy) {
                delete state.scenario.initialDiplomacy[fName];
                Object.values(state.scenario.initialDiplomacy).forEach(row => delete row[fName]);
            }
            // Keep live window.FACTIONS in sync
            if (window.FACTIONS && window.FACTIONS[fName]) {
                delete window.FACTIONS[fName];
                if (typeof window.initDiplomacy === 'function') window.initDiplomacy(window.FACTIONS);
            }
            _renderFactionPanel(); _renderCityPanel(); _renderDiplomacyPanel();
        };
    });


    const actions = document.createElement("div");
    actions.style.cssText = "margin-top:8px;display:flex;flex-direction:column;gap:4px;";
    actions.innerHTML = `
        <button id="se-fac-add-inline" style="padding:5px;background:#1a3a5c;color:#a8d8ea;border:1px solid #4a8fa8;cursor:pointer;font-size:11px;">＋ Add Faction</button>
        <button id="se-fac-repop"      style="padding:5px;background:#1a3a5c;color:#cfd8dc;border:1px solid #4a8fa8;cursor:pointer;font-size:11px;">🔄 Auto-Repopulate Cities</button>
    `;
    wrap.appendChild(actions);

    actions.querySelector("#se-fac-add-inline").onclick = () => {
        const name = prompt("New faction name:");
        if (!name) return;
        const trimmed = name.trim();
        if (!trimmed || state.scenario.factions[trimmed]) { alert("Bad or duplicate name."); return; }
        const orderMax = Math.max(0, ..._orderedFactions(state.scenario).map(([, d]) => d.order || 0));
        state.scenario.factions[trimmed] = {
            color: _randomFactionColor(),
            geoWeight: { north: 0.5, south: 0.5, west: 0.5, east: 0.5 },
            enabled: true,
            locked: false,
            order: orderMax + 1,
            cityCount: 4,
            uniqueTroop: ""
        };
        _renderFactionPanel(); _renderDiplomacyPanel();
    };
    actions.querySelector("#se-fac-repop").onclick = () => {
        if (confirm("This will REPLACE all cities with a fresh auto-population. Continue?")) {
            _autoPopulateCities(state.scenario, { strategy: state.scenario.cityStrategy || "random" });
            _renderCityPanel();
            _renderFactionPanel();
        }
    };
}

// ── DIPLOMACY PANEL ─────────────────────────────────────────────────────────
// Shows every unique faction pair with an Ally / Neutral / Enemy dropdown.
// Reads/writes state.scenario.initialDiplomacy.
// Re-rendered by _renderFactionPanel() so it stays in sync after rename/add/delete.
function _buildDiplomacyPanel() {
    const wrap = document.createElement("div");
    wrap.id = "se-diplomacy-panel-body";
    _renderDiplomacyPanel(wrap);
    return wrap;
}

// Map display values ↔ stored values (mirrors faction_dynamics.js relations)
function _dipDisplayToRaw(display) {
    if (display === "Ally")   return "Ally";
    if (display === "Enemy")  return "War";
    return "Peace"; // Neutral
}
function _dipRawToDisplay(raw) {
    if (raw === "Ally") return "Ally";
    if (raw === "War")  return "Enemy";
    return "Neutral";
}
function _getDipRel(a, b) {
    const d = state.scenario.initialDiplomacy || {};
    const raw = (d[a] && d[a][b]) || (d[b] && d[b][a]) || "Peace";
    return _dipRawToDisplay(raw);
}
function _setDipRel(a, b, display) {
    if (!state.scenario.initialDiplomacy) state.scenario.initialDiplomacy = {};
    const raw = _dipDisplayToRaw(display);
    if (!state.scenario.initialDiplomacy[a]) state.scenario.initialDiplomacy[a] = {};
    if (!state.scenario.initialDiplomacy[b]) state.scenario.initialDiplomacy[b] = {};
    state.scenario.initialDiplomacy[a][b] = raw;
    state.scenario.initialDiplomacy[b][a] = raw;
}

function _renderDiplomacyPanel(wrap) {
    if (!wrap) wrap = document.getElementById("se-diplomacy-panel-body");
    if (!wrap) return;
    wrap.innerHTML = "";

    if (!state.scenario) {
        wrap.innerHTML = '<div style="color:#8aa;font-size:10px;padding:4px;">No scenario loaded.</div>';
        return;
    }

    const factions = _orderedFactions(state.scenario);
    if (factions.length < 2) {
        wrap.innerHTML = '<div style="color:#8aa;font-size:10px;padding:4px;">Need at least 2 factions.</div>';
        return;
    }

    const hint = document.createElement("div");
    hint.style.cssText = "color:#8aa;font-size:10px;padding:2px 0 6px 0;";
    hint.textContent = "Set starting diplomacy at scenario launch. Bandits are always hostile.";
    wrap.appendChild(hint);

    const REL_COLORS = { Ally: "#4aafd8", Neutral: "#8aa", Enemy: "#d44" };

    // Generate every unique pair (i < j)
    for (let i = 0; i < factions.length; i++) {
        for (let j = i + 1; j < factions.length; j++) {
            const [nameA, dataA] = factions[i];
            const [nameB, dataB] = factions[j];

            const curRel = _getDipRel(nameA, nameB);

            const row = document.createElement("div");
            row.style.cssText = "display:flex;align-items:center;gap:4px;padding:3px 2px;border-bottom:1px dotted #333;";

            // Faction A dot + name
            const dotA = document.createElement("span");
            dotA.style.cssText = `width:8px;height:8px;background:${dataA.color};border:1px solid #000;display:inline-block;flex-shrink:0;`;
            const lblA = document.createElement("span");
            lblA.style.cssText = "font-size:10px;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
            lblA.title = nameA;
            lblA.textContent = nameA;

            const sep = document.createElement("span");
            sep.style.cssText = "font-size:9px;color:#5a7a9a;flex-shrink:0;";
            sep.textContent = "↔";

            // Faction B dot + name
            const dotB = document.createElement("span");
            dotB.style.cssText = `width:8px;height:8px;background:${dataB.color};border:1px solid #000;display:inline-block;flex-shrink:0;`;
            const lblB = document.createElement("span");
            lblB.style.cssText = "font-size:10px;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;";
            lblB.title = nameB;
            lblB.textContent = nameB;

            // Relation select
            const sel = document.createElement("select");
            sel.style.cssText = `background:#0e1218;color:${REL_COLORS[curRel]};border:1px solid #4a8fa8;font-size:10px;padding:1px 2px;flex-shrink:0;`;
            ["Ally", "Neutral", "Enemy"].forEach(opt => {
                const o = document.createElement("option");
                o.value = opt;
                o.textContent = opt;
                o.style.color = REL_COLORS[opt];
                if (opt === curRel) o.selected = true;
                sel.appendChild(o);
            });
            sel.onchange = () => {
                _setDipRel(nameA, nameB, sel.value);
                sel.style.color = REL_COLORS[sel.value] || "#cfd8dc";
            };

            row.appendChild(dotA); row.appendChild(lblA);
            row.appendChild(sep);
            row.appendChild(dotB); row.appendChild(lblB);
            row.appendChild(sel);
            wrap.appendChild(row);
        }
    }

    // Quick-set buttons
    const quickRow = document.createElement("div");
    quickRow.style.cssText = "display:flex;gap:4px;margin-top:8px;flex-wrap:wrap;";
    [
        { label: "All Neutral", action: () => {
            factions.forEach(([a], i) => factions.slice(i+1).forEach(([b]) => _setDipRel(a, b, "Neutral")));
            _renderDiplomacyPanel();
        }},
        { label: "All Ally",    action: () => {
            factions.forEach(([a], i) => factions.slice(i+1).forEach(([b]) => _setDipRel(a, b, "Ally")));
            _renderDiplomacyPanel();
        }},
        { label: "All Enemy",   action: () => {
            factions.forEach(([a], i) => factions.slice(i+1).forEach(([b]) => _setDipRel(a, b, "Enemy")));
            _renderDiplomacyPanel();
        }}
    ].forEach(({ label, action }) => {
        const btn = document.createElement("button");
        btn.textContent = label;
        btn.style.cssText = "padding:3px 8px;background:#1a3a5c;color:#cfd8dc;border:1px solid #4a8fa8;cursor:pointer;font-size:10px;";
        btn.onclick = action;
        quickRow.appendChild(btn);
    });
    wrap.appendChild(quickRow);
}


function _buildCityPanel() {
    const wrap = document.createElement("div");
    wrap.id = "se-city-panel-body";
    _renderCityPanel(wrap);
    return wrap;
}
function _renderCityPanel(wrap) {
    if (!wrap) wrap = document.getElementById("se-city-panel-body");
    if (!wrap) return;
    wrap.innerHTML = `<div style="margin-bottom:6px;color:#8aa;font-size:10px;">Total: ${state.scenario.cities.length}</div>`;

    state.scenario.cities.forEach((c, idx) => {
        const row = document.createElement("div");
        const sel = state.selectedCity === c;
        row.style.cssText = `
            display:flex;align-items:center;gap:4px;padding:3px;
            background:${sel ? "#2a5a8c" : "transparent"};
            border-bottom:1px dotted #444;cursor:pointer;font-size:11px;
        `;
        row.innerHTML = `
            <span style="width:10px;height:10px;background:${state.scenario.factions[c.faction]?.color || "#888"};display:inline-block;border:1px solid #000;"></span>
            <span style="flex:1;">${c.name}</span>
            <span style="color:#8aa;">${(c.pop/1000).toFixed(1)}k</span>
        `;
        row.onclick = () => {
            state.selectedCity = c;
            _renderCityPanel();
            // Center camera on city
            const X = state.scenario.dimensions.tilesX, Y = state.scenario.dimensions.tilesY;
            state.cam.x = c.xPct * X * 4 - state.canvas.width  / 2 / state.cam.zoom;
            state.cam.y = c.yPct * Y * 4 - state.canvas.height / 2 / state.cam.zoom;
        };
        row.ondblclick = () => _editCityDialog(c);
        wrap.appendChild(row);
    });

    if (state.selectedCity) {
        const c = state.selectedCity;
        const det = document.createElement("div");
        det.style.cssText = "margin-top:8px;padding:6px;background:#0e1218;border:1px solid #4a8fa8;";
        det.innerHTML = `
            <div style="font-weight:bold;color:#f5d76e;">${c.name}</div>
            <div>Faction:
                <select data-edit="faction" style="width:100%;">
                    ${Object.keys(state.scenario.factions).map(f => `<option ${c.faction===f?"selected":""}>${f}</option>`).join("")}
                </select>
            </div>
            <div>Name: <input data-edit="name" type="text" value="${c.name}" style="width:100%;"></div>
            <div>Pop:  <input data-edit="pop" type="number" value="${c.pop}" style="width:100%;"></div>
            <div style="margin-top:4px;">
                <button data-act="del" style="width:100%;padding:3px;background:#7b1a1a;color:#fff;border:1px solid #d4b886;cursor:pointer;">Delete City</button>
            </div>
        `;
        wrap.appendChild(det);
        det.querySelector('[data-edit="name"]').oninput   = (e) => { c.name    = e.target.value;            _renderCityPanel(); };
        det.querySelector('[data-edit="pop"]').oninput    = (e) => { c.pop     = parseInt(e.target.value)||0; };
        det.querySelector('[data-edit="faction"]').onchange = (e) => { c.faction = e.target.value;          _renderCityPanel(); _renderFactionPanel(); };
        det.querySelector('[data-act="del"]').onclick     = () => {
            const i = state.scenario.cities.indexOf(c);
            if (i >= 0) state.scenario.cities.splice(i, 1);
            state.selectedCity = null;
            _renderCityPanel();
            _renderFactionPanel();
        };
    }
}
function _editCityDialog(c) {
    const newName = prompt("City name:", c.name);
    if (newName) c.name = newName.trim();
    _renderCityPanel();
}

// ── TRIGGERS PANEL (placeholder) ────────────────────────────────────────────
// ── NAVIGATION PANEL (mobile + keyboard-free users) ─────────────────────────
function _buildNavPanel() {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:6px;padding:6px 4px;user-select:none;";

    function _makeNavBtn(label, title, action) {
        const b = document.createElement("button");
        b.title = title;
        b.innerHTML = label;
        b.style.cssText = [
            "width:42px;height:38px;",
            "background:linear-gradient(to bottom,#253a55,#162030);",
            "color:#a8d8ea;border:1px solid #4a8fa8;",
            "border-radius:4px;cursor:pointer;font-size:15px;",
            "display:flex;align-items:center;justify-content:center;",
            "box-shadow:0 2px 4px rgba(0,0,0,0.5);transition:background 0.1s;"
        ].join("");
        b.onmouseenter = () => b.style.background = "linear-gradient(to bottom,#2a5a8c,#1a3a5c)";
        b.onmouseleave = () => b.style.background = "linear-gradient(to bottom,#253a55,#162030)";
        let _timer = null;
        function _start() { action(); _timer = setInterval(action, 80); }
        function _stop()  { clearInterval(_timer); _timer = null; }
        b.addEventListener("mousedown",  _start);
        b.addEventListener("mouseup",    _stop);
        b.addEventListener("mouseleave", _stop);
        b.addEventListener("touchstart", (e) => { e.preventDefault(); _start(); }, { passive: false });
        b.addEventListener("touchend",   (e) => { e.preventDefault(); _stop();  }, { passive: false });
        return b;
    }

    const PAN = () => 12 / state.cam.zoom;
    const Z_IN  = () => {
        const f=1.18, old=state.cam.zoom;
        state.cam.zoom = Math.min(8, old*f);
        const cx = state.canvas ? state.canvas.width/2  : 0;
        const cy = state.canvas ? state.canvas.height/2 : 0;
        state.cam.x += (cx/old - cx/state.cam.zoom);
        state.cam.y += (cy/old - cy/state.cam.zoom);
    };
    const Z_OUT = () => {
        const f=1/1.18, old=state.cam.zoom;
        state.cam.zoom = Math.max(0.15, old*f);
        const cx = state.canvas ? state.canvas.width/2  : 0;
        const cy = state.canvas ? state.canvas.height/2 : 0;
        state.cam.x += (cx/old - cx/state.cam.zoom);
        state.cam.y += (cy/old - cy/state.cam.zoom);
    };

    const _blank = () => { const d=document.createElement("div"); d.style.cssText="width:42px;height:38px;"; return d; };
    const rowTop  = document.createElement("div"); rowTop.style.cssText  = "display:flex;gap:4px;";
    const rowMid  = document.createElement("div"); rowMid.style.cssText  = "display:flex;gap:4px;align-items:center;";
    const rowBot  = document.createElement("div"); rowBot.style.cssText  = "display:flex;gap:4px;";
    const rowZoom = document.createElement("div"); rowZoom.style.cssText = "display:flex;gap:8px;margin-top:4px;";

    rowTop.appendChild(_blank());
    rowTop.appendChild(_makeNavBtn("▲","Pan Up",    () => state.cam.y -= PAN()));
    rowTop.appendChild(_blank());

    rowMid.appendChild(_makeNavBtn("◀","Pan Left",  () => state.cam.x -= PAN()));
    const ctrIcon = document.createElement("div");
    ctrIcon.style.cssText = "width:42px;height:38px;background:#0e1218;border:1px solid #2a3a50;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#4a8fa8;font-size:18px;";
    ctrIcon.textContent = "✛";
    rowMid.appendChild(ctrIcon);
    rowMid.appendChild(_makeNavBtn("▶","Pan Right", () => state.cam.x += PAN()));

    rowBot.appendChild(_blank());
    rowBot.appendChild(_makeNavBtn("▼","Pan Down",  () => state.cam.y += PAN()));
    rowBot.appendChild(_blank());

    const zoomInBtn  = _makeNavBtn("＋","Zoom In",  Z_IN);
    const zoomOutBtn = _makeNavBtn("－","Zoom Out", Z_OUT);
    zoomInBtn.style.width  = "58px";
    zoomOutBtn.style.width = "58px";
    rowZoom.appendChild(zoomOutBtn);
    rowZoom.appendChild(zoomInBtn);

    wrap.appendChild(rowTop); wrap.appendChild(rowMid); wrap.appendChild(rowBot);
    const divider = document.createElement("div");
    divider.style.cssText = "width:100%;border-top:1px solid #2a3a50;margin:2px 0;";
    wrap.appendChild(divider);
    wrap.appendChild(rowZoom);

    const tip = document.createElement("div");
    tip.style.cssText = "font-size:9.5px;color:#5a7a9a;text-align:center;margin-top:4px;line-height:1.5;white-space:pre-line;";
    tip.textContent = "Touch-drag → paint / erase\nTwo-finger drag → pan";
    wrap.appendChild(tip);

    return wrap;
}

  function _buildTriggersPanel() {
              const wrap = document.createElement("div");
              wrap.innerHTML = `
                  <button id="se-trig-open" style="width:100%;padding:8px;
                      background:#1a3a5c;color:#cfd8dc;border:1px solid #4a8fa8;
                     cursor:pointer;font-weight:bold;">
                     ⚡ Open Trigger Editor
                 </button>`;
             setTimeout(() => {
                 wrap.querySelector("#se-trig-open").onclick = () => {
                     if (window.ScenarioTriggers && window.ScenarioTriggers.openEditor) {
                          window.ScenarioTriggers.openEditor(window.ScenarioEditor._state.scenario);
                      } else {
                          alert("ScenarioTriggers module not loaded.");
                      }
                  };
              }, 0);
              return wrap;
          }

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ PAINTING / RENDERING                                                     ║
// ╚══════════════════════════════════════════════════════════════════════════╝
const TILE_PX = 4; // each tile is 4×4 px on the offscreen canvas
function _resizeMapCanvas() {
    state.mapCanvas.width  = state.scenario.dimensions.tilesX * TILE_PX;
    state.mapCanvas.height = state.scenario.dimensions.tilesY * TILE_PX;
}

function _paintAllTiles() {
    const X = state.scenario.dimensions.tilesX;
    const Y = state.scenario.dimensions.tilesY;
    for (let i = 0; i < X; i++) {
        for (let j = 0; j < Y; j++) {
            _paintTile(i, j, state.scenario.tiles[i][j]);
        }
    }
}
function _paintTile(i, j, tile) {
    state.mapCtx.fillStyle = tile.color;
    state.mapCtx.fillRect(i * TILE_PX, j * TILE_PX, TILE_PX, TILE_PX);
}

function _applyBrushAt(tileI, tileJ, tool) {
    // Apply the brush at (tileI, tileJ) using the current state.brush settings.
    const X = state.scenario.dimensions.tilesX;
    const Y = state.scenario.dimensions.tilesY;
    const r = state.brush.size;
    const r2 = r * r;
    const strength = state.brush.strength;
    const target = BIOME_TARGETS[state.brush.biome];

    for (let i = Math.max(0, tileI - r); i < Math.min(X, tileI + r + 1); i++) {
        for (let j = Math.max(0, tileJ - r); j < Math.min(Y, tileJ + r + 1); j++) {
            let dx = i - tileI, dy = j - tileJ;
            let d2 = dx * dx + dy * dy;
            if (d2 > r2) continue;
            // Falloff: 1 at center, 0 at edge
            let falloff = 1 - Math.sqrt(d2) / r;
            let amount = strength * falloff;
            const t = state.scenario.tiles[i][j];

            switch (tool) {
                case "paint":
                    t.e = t.e * (1 - amount) + target.e * amount;
                    t.m = t.m * (1 - amount) + target.m * amount;
                    t.isRiver = (state.brush.biome === "River") ? true : false;
                    break;
                case "erase":
                    // Blend toward Plains target
                    t.e = t.e * (1 - amount) + 0.45 * amount;
                    t.m = t.m * (1 - amount) + 0.50 * amount;
                    t.isRiver = false;
                    break;
                case "elevate":
                    t.e = Math.min(1, t.e + amount * 0.2);
                    break;
                case "lower":
                    t.e = Math.max(0, t.e - amount * 0.2);
                    break;
                case "moisten":
                    t.m = Math.min(1, t.m + amount * 0.2);
                    break;
                case "dry":
                    t.m = Math.max(0, t.m - amount * 0.2);
                    break;
                case "river_paint":
                    if (amount > 0.1) t.isRiver = true;
                    break;
            }

            // Re-classify the tile based on new e/m/isRiver
            const reclass = classifyTile(t.e, t.m, t.isRiver);
            t.name      = reclass.name;
            t.color     = reclass.color;
            t.speed     = reclass.speed;
            t.impassable = reclass.impassable;
            _paintTile(i, j, t);
        }
    }
}

// Convert screen coordinates into scenario-tile coordinates
function _screenToTile(sx, sy) {
    const cx = (sx + state.cam.x * state.cam.zoom) / (state.cam.zoom * TILE_PX);
    const cy = (sy + state.cam.y * state.cam.zoom) / (state.cam.zoom * TILE_PX);
    // Wait — my math above is off. Let me re-derive based on the draw method.
    // Draw method: ctx.translate(-cam.x, -cam.y); ctx.scale(zoom, zoom); drawImage(mapCanvas)
    // So world-pixel = (screen / zoom) + cam
    const wx = sx / state.cam.zoom + state.cam.x;
    const wy = sy / state.cam.zoom + state.cam.y;
    return {
        i: Math.floor(wx / TILE_PX),
        j: Math.floor(wy / TILE_PX),
        wx, wy
    };
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ EDITOR INPUT EVENTS                                                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _attachEditorEvents() {
    const c = state.canvas;

    // Resize handling
    state._onResize = () => {
        c.width  = window.innerWidth;
        c.height = window.innerHeight - MENU_H;
        _snapPanelsToEdges();
    };
    window.addEventListener("resize", state._onResize);

    // Mouse move — track + paint while dragging
    state._onMouseMove = (e) => {
        const rect = c.getBoundingClientRect();
        state.mouse.x = e.clientX - rect.left;
        state.mouse.y = e.clientY - rect.top;
        const t = _screenToTile(state.mouse.x, state.mouse.y);

        // Status bar
        const stPos = document.getElementById("se-st-pos");
        const stTile = document.getElementById("se-st-tile");
        if (stPos) stPos.textContent = `(${t.i},${t.j})`;
        if (stTile && state.scenario.tiles[t.i] && state.scenario.tiles[t.i][t.j]) {
            const tile = state.scenario.tiles[t.i][t.j];
            stTile.textContent = `${tile.name} e=${tile.e.toFixed(2)} m=${tile.m.toFixed(2)}`;
        }

        if (state.mouse.down && state.mouse.button === 0) {
            // LMB drag — paint or move city
            if (["paint","erase","elevate","lower","moisten","dry","river_paint"].includes(state.tool)) {
                if (t.i >= 0 && t.j >= 0 && t.i < state.scenario.dimensions.tilesX && t.j < state.scenario.dimensions.tilesY) {
                    _applyBrushAt(t.i, t.j, state.tool);
                }
            } else if (state.tool === "move_city" && state._dragCity) {
                const X = state.scenario.dimensions.tilesX;
                const Y = state.scenario.dimensions.tilesY;
                state._dragCity.xPct = Math.max(0.01, Math.min(0.99, t.i / X));
                state._dragCity.yPct = Math.max(0.01, Math.min(0.99, t.j / Y));
            }
        } else if (state.mouse.down && state.mouse.button === 2) {
            // RMB drag — pan
            state.cam.x -= (e.movementX || 0) / state.cam.zoom;
            state.cam.y -= (e.movementY || 0) / state.cam.zoom;
        }
    };
    c.addEventListener("mousemove", state._onMouseMove);

    state._onMouseDown = (e) => {
        e.preventDefault();
        state.mouse.down = true;
        state.mouse.button = e.button;
        const rect = c.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        const t = _screenToTile(sx, sy);
        if (e.button !== 0) return;

        const X = state.scenario.dimensions.tilesX;
        const Y = state.scenario.dimensions.tilesY;
        if (t.i < 0 || t.j < 0 || t.i >= X || t.j >= Y) return;

        switch (state.tool) {
            case "paint":
            case "erase":
            case "elevate":
            case "lower":
            case "moisten":
            case "dry":
            case "river_paint":
                _applyBrushAt(t.i, t.j, state.tool);
                break;
            case "place_city":
                _placeCityAt(t.i / X, t.j / Y);
                break;
            case "move_city": {
                const c = _findCityNear(t.i / X, t.j / Y);
                if (c) state._dragCity = c;
                break;
            }
            case "delete_city": {
                const c = _findCityNear(t.i / X, t.j / Y);
                if (c) {
                    const idx = state.scenario.cities.indexOf(c);
                    if (idx >= 0) state.scenario.cities.splice(idx, 1);
                    state.selectedCity = null;
                    _renderCityPanel();
                    _renderFactionPanel();
                }
                break;
            }
            case "select": {
                const c = _findCityNear(t.i / X, t.j / Y);
                if (c) {
                    state.selectedCity = c;
                    _renderCityPanel();
                }
                break;
            }
        }
    };
    c.addEventListener("mousedown", state._onMouseDown);

    state._onMouseUp = (e) => {
        state.mouse.down = false;
        state._dragCity = null;
    };
    c.addEventListener("mouseup", state._onMouseUp);

    state._onContext = (e) => e.preventDefault();
    c.addEventListener("contextmenu", state._onContext);

    state._onWheel = (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        const oldZoom = state.cam.zoom;
        const newZoom = Math.max(0.15, Math.min(8, oldZoom * factor));
        // Zoom around cursor
        const rect = c.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        const wxBefore = sx / oldZoom + state.cam.x;
        const wyBefore = sy / oldZoom + state.cam.y;
        state.cam.zoom = newZoom;
        const wxAfter = sx / newZoom + state.cam.x;
        const wyAfter = sy / newZoom + state.cam.y;
        state.cam.x += (wxBefore - wxAfter);
        state.cam.y += (wyBefore - wyAfter);
        const stZoom = document.getElementById("se-st-zoom");
        if (stZoom) stZoom.textContent = state.cam.zoom.toFixed(2) + "×";
    };
    c.addEventListener("wheel", state._onWheel, { passive: false });

    // WASD pan
    state._onKeyDown = (e) => { state.keys[e.key.toLowerCase()] = true; };
    state._onKeyUp   = (e) => { state.keys[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", state._onKeyDown);
    window.addEventListener("keyup",   state._onKeyUp);

    // ── Touch events on canvas (mobile) ─────────────────────────────────────
    // Single finger → treat like mouse-down + drag (use active tool)
    // Two fingers   → pinch-zoom + pan
    let _lastTouches = null;
    c.addEventListener("touchstart", (e) => {
        e.preventDefault();
        _lastTouches = e.touches;
        if (e.touches.length === 1) {
            const rect = c.getBoundingClientRect();
            const t = e.touches[0];
            const sx = t.clientX - rect.left, sy = t.clientY - rect.top;
            const tile = _screenToTile(sx, sy);
            state.mouse.down   = true;
            state.mouse.button = 0;
            state.mouse.x      = sx;
            state.mouse.y      = sy;
            const X = state.scenario.dimensions.tilesX;
            const Y = state.scenario.dimensions.tilesY;
            if (tile.i < 0 || tile.j < 0 || tile.i >= X || tile.j >= Y) return;
            if (["paint","erase","elevate","lower","moisten","dry","river_paint"].includes(state.tool)) {
                _applyBrushAt(tile.i, tile.j, state.tool);
            } else if (state.tool === "place_city") {
                _placeCityAt(tile.i / X, tile.j / Y);
            } else if (state.tool === "move_city") {
                const city = _findCityNear(tile.i / X, tile.j / Y);
                if (city) state._dragCity = city;
            } else if (state.tool === "delete_city") {
                const city = _findCityNear(tile.i / X, tile.j / Y);
                if (city) {
                    const idx = state.scenario.cities.indexOf(city);
                    if (idx >= 0) state.scenario.cities.splice(idx, 1);
                    state.selectedCity = null; _renderCityPanel(); _renderFactionPanel();
                }
            } else if (state.tool === "select") {
                const city = _findCityNear(tile.i / X, tile.j / Y);
                if (city) { state.selectedCity = city; _renderCityPanel(); }
            }
        }
    }, { passive: false });

    c.addEventListener("touchmove", (e) => {
        e.preventDefault();
        const rect = c.getBoundingClientRect();
        if (e.touches.length === 1) {
            // Single finger — paint/erase drag
            const t = e.touches[0];
            const sx = t.clientX - rect.left, sy = t.clientY - rect.top;
            state.mouse.x = sx; state.mouse.y = sy;
            const tile = _screenToTile(sx, sy);
            const X = state.scenario.dimensions.tilesX;
            const Y = state.scenario.dimensions.tilesY;
            if (state.mouse.down && state.mouse.button === 0) {
                if (["paint","erase","elevate","lower","moisten","dry","river_paint"].includes(state.tool)) {
                    if (tile.i >= 0 && tile.j >= 0 && tile.i < X && tile.j < Y) {
                        _applyBrushAt(tile.i, tile.j, state.tool);
                    }
                } else if (state.tool === "move_city" && state._dragCity) {
                    state._dragCity.xPct = Math.max(0.01, Math.min(0.99, tile.i / X));
                    state._dragCity.yPct = Math.max(0.01, Math.min(0.99, tile.j / Y));
                }
            }
        } else if (e.touches.length === 2 && _lastTouches && _lastTouches.length === 2) {
            // Two-finger pan + pinch-zoom
            const t1 = e.touches[0], t2 = e.touches[1];
            const p1 = _lastTouches[0],  p2 = _lastTouches[1];
            // Midpoint pan
            const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
            const midY = (t1.clientY + t2.clientY) / 2 - rect.top;
            const prevMidX = (p1.clientX + p2.clientX) / 2 - rect.left;
            const prevMidY = (p1.clientY + p2.clientY) / 2 - rect.top;
            state.cam.x -= (midX - prevMidX) / state.cam.zoom;
            state.cam.y -= (midY - prevMidY) / state.cam.zoom;
            // Pinch zoom
            const dist     = Math.hypot(t1.clientX-t2.clientX, t1.clientY-t2.clientY);
            const prevDist = Math.hypot(p1.clientX-p2.clientX, p1.clientY-p2.clientY);
            if (prevDist > 0) {
                const scale = dist / prevDist;
                const oldZoom = state.cam.zoom;
                const newZoom = Math.max(0.15, Math.min(8, oldZoom * scale));
                state.cam.x += (midX / oldZoom - midX / newZoom);
                state.cam.y += (midY / oldZoom - midY / newZoom);
                state.cam.zoom = newZoom;
                const stZoom = document.getElementById("se-st-zoom");
                if (stZoom) stZoom.textContent = state.cam.zoom.toFixed(2) + "×";
            }
        }
        _lastTouches = e.touches;
    }, { passive: false });

    c.addEventListener("touchend", (e) => {
        e.preventDefault();
        state.mouse.down = false; state._dragCity = null; _lastTouches = null;
    }, { passive: false });
}

function _placeCityAt(xPct, yPct) {
    const ti = Math.floor(xPct * state.scenario.dimensions.tilesX);
    const tj = Math.floor(yPct * state.scenario.dimensions.tilesY);
    const tile = state.scenario.tiles[ti] && state.scenario.tiles[ti][tj];
    if (!tile) return;
    if (tile.name === "Ocean") { alert("Cannot place a city on the ocean."); return; }

    const fac = _factionForLocation(state.scenario, xPct, yPct);
    const city = {
        name: _genCityName(fac), faction: fac,
        xPct, yPct,
        pop: Math.floor(Math.random() * 8000) + 2000,
        custom: true
    };
    state.scenario.cities.push(city);
    state.selectedCity = city;
    _renderCityPanel();
    _renderFactionPanel();
}
function _findCityNear(xPct, yPct, tol = 0.015) {
    let best = null, bestD = Infinity;
    for (const c of state.scenario.cities) {
        const d = Math.hypot(c.xPct - xPct, c.yPct - yPct);
        if (d < tol && d < bestD) { bestD = d; best = c; }
    }
    return best;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ RENDER LOOP                                                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _startEditorLoop() {
    const tick = () => {
        if (!state.open) return;
        _processWASD();
        _drawEditor();
        state.rafId = requestAnimationFrame(tick);
    };
    tick();
}
function _processWASD() {
    const speed = 6 / state.cam.zoom;
    if (state.keys["w"] || state.keys["arrowup"])    state.cam.y -= speed;
    if (state.keys["s"] || state.keys["arrowdown"])  state.cam.y += speed;
    if (state.keys["a"] || state.keys["arrowleft"])  state.cam.x -= speed;
    if (state.keys["d"] || state.keys["arrowright"]) state.cam.x += speed;
}
function _drawEditor() {
    const ctx = state.ctx;
    const c = state.canvas;
    ctx.fillStyle = "#0e1218";
    ctx.fillRect(0, 0, c.width, c.height);

    // Camera + draw map
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.scale(state.cam.zoom, state.cam.zoom);
    ctx.translate(-state.cam.x, -state.cam.y);
    ctx.drawImage(state.mapCanvas, 0, 0);

    // Draw cities
    const X = state.scenario.dimensions.tilesX;
    const Y = state.scenario.dimensions.tilesY;
    state.scenario.cities.forEach(city => {
        const px = city.xPct * X * TILE_PX;
        const py = city.yPct * Y * TILE_PX;
        const fcol = state.scenario.factions[city.faction]?.color || "#888";
        ctx.fillStyle   = fcol;
        ctx.strokeStyle = (city === state.selectedCity) ? "#ffeb3b" : "#000";
        ctx.lineWidth   = 1 / state.cam.zoom;
        const r = 3 / Math.max(0.5, state.cam.zoom * 0.5);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i;
            const xx = px + r * Math.cos(a);
            const yy = py + r * Math.sin(a);
            if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Labels at adequate zoom
        if (state.cam.zoom > 0.6) {
            ctx.fillStyle = "#fff";
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 2 / state.cam.zoom;
            ctx.font = `${Math.max(8, 10/state.cam.zoom)}px Tahoma`;
            ctx.textAlign = "center";
            ctx.strokeText(city.name, px, py - r - 2);
            ctx.fillText(city.name,   px, py - r - 2);
        }
    });

    // Brush preview circle
    if (["paint","erase","elevate","lower","moisten","dry","river_paint"].includes(state.tool)) {
        const t = _screenToTile(state.mouse.x, state.mouse.y);
        ctx.strokeStyle = "#ffeb3b";
        ctx.lineWidth = 1 / state.cam.zoom;
        ctx.beginPath();
        ctx.arc(t.i * TILE_PX + TILE_PX/2, t.j * TILE_PX + TILE_PX/2,
                state.brush.size * TILE_PX, 0, Math.PI * 2);
        ctx.stroke();
    }

    // ── Post-draw hook: scenario_tools_panel.js registers here so its NPC/Player
    //    overlay renders INSIDE this save/scale/translate block (same coordinate
    //    space as cities above) rather than racing via a separate setInterval.
    if (typeof state._postDrawHook === "function") {
        try { state._postDrawHook(ctx, state.cam); }
        catch (_e) { /* silently ignore overlay errors so editor never freezes */ }
    }

    ctx.restore();
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ SAVE / LOAD                                                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _save() {
    if (!state.scenario) { alert("No scenario loaded."); return; }
    state.scenario.meta.modified = new Date().toISOString();

    // For tile data — store ONLY e/m/isRiver to keep file size sane.
    const compact = {
        ...state.scenario,
        tiles: state.scenario.tiles.map(col => col.map(t => ({ e: +t.e.toFixed(3), m: +t.m.toFixed(3), r: !!t.isRiver })))
    };
    const json = JSON.stringify(compact, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (state.scenario.meta.name.replace(/[^a-z0-9_-]/gi, "_") || "scenario") + ".dog_scenario.json";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);

    console.log("[ScenarioEditor] Saved.");
    alert("Scenario downloaded!\n\nMove the file to your Documents folder if desired —\nyour browser saved it to your default Downloads location.");
}

function _load() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
        const f = input.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const raw = JSON.parse(reader.result);
                _restoreScenarioFromCompact(raw);
                _resizeMapCanvas();
                _paintAllTiles();
                _renderFactionPanel();
                _renderCityPanel();
                _renderDiplomacyPanel();
                // FIX (Bug 2): Ensure new scenario fields are initialised so
                // ScenarioToolsPanel can immediately read importantNpcs / playerSetup.
                if (!Array.isArray(state.scenario.importantNpcs))    state.scenario.importantNpcs = [];
                if (!state.scenario.playerSetup || typeof state.scenario.playerSetup !== "object") state.scenario.playerSetup = {};
                if (!state.scenario.proceduralAITendency || typeof state.scenario.proceduralAITendency !== "object") state.scenario.proceduralAITendency = {};
                if (!state.scenario.initialDiplomacy || typeof state.scenario.initialDiplomacy !== "object") state.scenario.initialDiplomacy = {};
                // Update menu title to reflect newly loaded scenario name
                const titleEl = document.getElementById("se-title-text");
                if (titleEl) titleEl.textContent = "Scenario: " + (state.scenario.meta.name || "—");
                // Center camera at default zoom
                {
                    const mapW = state.scenario.dimensions.tilesX * TILE_PX;
                    const mapH = state.scenario.dimensions.tilesY * TILE_PX;
                    state.cam.zoom = 3.0;
                    state.cam.x = (mapW / 2) - (state.canvas.width  / 2 / state.cam.zoom);
                    state.cam.y = (mapH / 2) - (state.canvas.height / 2 / state.cam.zoom);
                }
                console.log("[ScenarioEditor] Loaded:", state.scenario.meta.name,
                            "— importantNpcs:", state.scenario.importantNpcs.length,
                            "— playerSetup:", JSON.stringify(state.scenario.playerSetup).slice(0,80));
            } catch (e) {
                alert("Failed to parse scenario file:\n" + e.message);
            }
        };
        reader.readAsText(f);
    };
    input.click();
}
function _restoreScenarioFromCompact(raw) {
    // tiles[i][j] = {e,m,r} → expand back to full tile object via classifyTile
    const tiles = raw.tiles.map(col => col.map(t => classifyTile(t.e, t.m, t.r)));

    // Migrate factions from older saves: ensure each faction has order,
    // cityCount, uniqueTroop. Older saves did not have these fields.
    const migratedFactions = {};
    let i = 0;
    Object.entries(raw.factions || {}).forEach(([fName, fData]) => {
        const def = DEFAULT_FACTIONS[fName] || {};
        migratedFactions[fName] = {
            color:       fData.color       || def.color || "#888888",
            geoWeight:   fData.geoWeight   || def.geoWeight || { north: 0.5, south: 0.5, west: 0.5, east: 0.5 },
            enabled:     ("enabled" in fData) ? !!fData.enabled : true,
            locked:      !!fData.locked,
            order:       (typeof fData.order === "number") ? fData.order : i,
            cityCount:   (typeof fData.cityCount === "number") ? fData.cityCount
                          : (typeof def.cityCount === "number" ? def.cityCount : 4),
            uniqueTroop: fData.uniqueTroop || def.uniqueTroop || ""
        };
        i++;
    });

    state.scenario = {
        // Bump to 3 so scenario_update.js doesn't re-migrate on launch.
        version: Math.max(raw.version || 1, 3),
        meta: raw.meta || { name: "Loaded Scenario" },
        dimensions: raw.dimensions,
        factions: migratedFactions,
        cities: raw.cities || [],
        tiles,
        triggers: raw.triggers || [],
        mapData: raw.mapData || "blank",
        cityStrategy: raw.cityStrategy || "random",
        seed: raw.seed,
        // ── Story & cinematics (Step 4, Step 7, Step 10) ─────────────────────
        // These were silently dropped in older saves. Every field is explicitly
        // preserved so the editor round-trips cleanly.
        movies:               Array.isArray(raw.movies)           ? raw.movies          : [],
        storyIntro:           (raw.storyIntro && typeof raw.storyIntro === "object") ? raw.storyIntro : {
                                  enabled: false, fadeMs: 1200, fadeColor: "#000000",
                                  titleCard: { title: "", subtitle: "", ms: 3500 },
                                  art: "", artMs: 5000, kenburns: false, lines: [],
                                  letterbox: true, typewriterCps: 0 },
        storyQuests:          Array.isArray(raw.storyQuests)      ? raw.storyQuests     : [],
        parlerLines:          (raw.parlerLines && typeof raw.parlerLines === "object") ? raw.parlerLines
                                : { Civilian:[], Patrol:[], Military:[], Trader:[], Bandit:[], Special:[] },
        // ── Scenario logic ────────────────────────────────────────────────────
        scenarioVars:         (raw.scenarioVars && typeof raw.scenarioVars === "object") ? raw.scenarioVars : {},
        winLose:              (raw.winLose && typeof raw.winLose === "object") ? raw.winLose : { winRules:[], loseRules:[] },
        timeline:             Array.isArray(raw.timeline)         ? raw.timeline        : [],
        // ── Entity setup ──────────────────────────────────────────────────────
        importantNpcs:        Array.isArray(raw.importantNpcs)    ? raw.importantNpcs   : [],
        playerSetup:          (raw.playerSetup && typeof raw.playerSetup === "object") ? raw.playerSetup : {},
        proceduralAITendency: (raw.proceduralAITendency && typeof raw.proceduralAITendency === "object") ? raw.proceduralAITendency : {},
        // ── Diplomacy (Step 1) ─────────────────────────────────────────────────
        initialDiplomacy:     (raw.initialDiplomacy && typeof raw.initialDiplomacy === "object") ? raw.initialDiplomacy : {}
    };
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ LAUNCH                                                                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _launch(scenario) {
    if (!scenario) { alert("No scenario."); return; }
    if (typeof window.ScenarioRuntime === "undefined") {
        alert("ScenarioRuntime not loaded! Make sure scenario_update.js is included.");
        return;
    }

    // Clean up the editor
    _exitNoConfirm();

    // Hand off to runtime
    window.ScenarioRuntime.launch(scenario);
}

function _exit() {
    if (!confirm("Exit the Scenario Editor? Unsaved changes will be lost.")) return;
    location.reload();   // Per spec — refresh game back to main menu
}
function _exitNoConfirm() {
    state.open = false;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    window.removeEventListener("resize", state._onResize);
    window.removeEventListener("keydown", state._onKeyDown);
    window.removeEventListener("keyup",   state._onKeyUp);
    if (state.rootEl && state.rootEl.parentNode) state.rootEl.parentNode.removeChild(state.rootEl);
    state.rootEl = null;
    window.isPaused = false;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ ENTRY POINT                                                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function open() {
    if (state.open) return;
    document.body.appendChild(_buildSetupScreen());
}

return {
    // Public surface
    open,
    classifyTile,
    PALETTE,
    BIOME_TARGETS,
    DEFAULT_FACTIONS,
    ALL_TROOP_TYPES,
    _state: state           // exposed for debugging
};

})();

console.log("[ScenarioEditor] scenario_menu_adder.js — module ready.");

// ════════════════════════════════════════════════════════════════════════════
// MAIN-MENU INTEGRATION  — adds "Launch Scenario" + "Scenario Editor" buttons
// ════════════════════════════════════════════════════════════════════════════
(function () {
    "use strict";

    const observer = new MutationObserver(() => {
        const ui = document.getElementById("main-menu-ui-container");
        if (!ui) return;
        if (document.getElementById("scenario-editor-btn") && document.getElementById("launch-scenario-btn")) return;

        // ────── Helper: build a button matching menu.js style ──────────────
        const buildBtn = (id, label, onClick) => {
            const btn = document.createElement("button");
            btn.id = id;
            btn.innerText = label;
            Object.assign(btn.style, {
                background:    "linear-gradient(to bottom, #1a3a5c, #0a1f33)",
                color:         "#a8d8ea",
                border:        "2px solid #4a8fa8",
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
                btn.style.background = "linear-gradient(to bottom, #2a5a8c, #1a3a5c)";
                btn.style.color      = "#ffffff";
                btn.style.boxShadow  = "0 0 20px #4a8fa8";
                btn.style.transform  = "scale(1.05)";
            };
            btn.onmouseleave = () => {
                btn.style.background = "linear-gradient(to bottom, #1a3a5c, #0a1f33)";
                btn.style.color      = "#a8d8ea";
                btn.style.boxShadow  = "0 4px 6px rgba(0,0,0,0.5)";
                btn.style.transform  = "scale(1)";
            };
            btn.onclick = onClick;
            return btn;
        };

        // ────── 1) "Launch Scenario" button ────────────────────────────────
        const launchBtn = buildBtn("launch-scenario-btn", "Launch Scenario", () => {
            if (typeof window.ScenarioRuntime === "undefined") {
                alert("ScenarioRuntime not loaded — include scenario_update.js");
                return;
            }
            // File picker
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json,application/json";
            input.onchange = () => {
                const f = input.files[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const raw = JSON.parse(reader.result);
                        // Restore tiles from compact form (.r → .isRiver)
                        const tiles = raw.tiles.map(col => col.map(t => window.ScenarioEditor.classifyTile(t.e, t.m, t.r)));

                        // Migrate factions for older save files (v1 had no
                        // order/cityCount/uniqueTroop fields).
                        const migratedFactions = {};
                        let i = 0;
                        Object.entries(raw.factions || {}).forEach(([fName, fData]) => {
                            const def = window.ScenarioEditor.DEFAULT_FACTIONS[fName] || {};
                            migratedFactions[fName] = {
                                color:       fData.color || def.color || "#888888",
                                geoWeight:   fData.geoWeight || def.geoWeight || { north: 0.5, south: 0.5, west: 0.5, east: 0.5 },
                                enabled:     ("enabled" in fData) ? !!fData.enabled : true,
                                locked:      !!fData.locked,
                                order:       (typeof fData.order === "number") ? fData.order : i,
                                cityCount:   (typeof fData.cityCount === "number") ? fData.cityCount
                                              : (typeof def.cityCount === "number" ? def.cityCount : 4),
                                uniqueTroop: fData.uniqueTroop || def.uniqueTroop || ""
                            };
                            i++;
                        });

                        // ── Pre-expand the player roster ─────────────────────────────────
                        // The JSON stores a compact CSV blueprint: ["Spearman","Archer"].
                        // A secondary _applyPlayerSetup safety-net in scenario_update.js
                        // re-applies playerSetup after initGame and, without expansion,
                        // would literally set player.troops = roster.length (= 2 instead
                        // of 80). We expand here so the scenario passed to ScenarioRuntime
                        // already carries the full {type,exp}[] army array.
                        let playerSetupResolved = raw.playerSetup || {};
                        if (
                            playerSetupResolved &&
                            typeof window._expandScenarioRoster === "function"
                        ) {
                            const ps = playerSetupResolved;
                            const rawTypes = (Array.isArray(ps.roster) ? ps.roster : [])
                                .map(t => (t && typeof t === "object" && t.type)
                                    ? t.type : String(t || "").trim())
                                .filter(Boolean);
                            if (rawTypes.length > 0) {
                                const total = (typeof ps.troops === "number" && ps.troops > 0)
                                    ? ps.troops : rawTypes.length;
                                const expanded = window._expandScenarioRoster(
                                    rawTypes, total, ps.rosterMode || "distribute"
                                );
                                if (expanded && expanded.length > 0) {
                                    playerSetupResolved = {
                                        ...ps,
                                        roster: expanded,
                                        troops: expanded.length
                                    };
                                    console.log(
                                        "[ScenarioEditor] Player roster pre-expanded:",
                                        expanded.length, "troops | mode:", ps.rosterMode || "distribute"
                                    );
                                }
                            }
                        }

                        const scenario = {
                            ...raw,
                            tiles,
                            factions: migratedFactions,
                            cityStrategy: raw.cityStrategy || "random",
                            playerSetup: playerSetupResolved
                        };

                        // Hide menu UI, show loading screen
                        const menuUI = document.getElementById("main-menu-ui-container");
                        if (menuUI) menuUI.style.display = "none";
                        if (typeof window.showLoadingScreen === 'function') window.showLoadingScreen();

                        // Hand off
                        window.ScenarioRuntime.launch(scenario);
                    } catch (e) {
                        alert("Failed to load scenario:\n" + e.message);
                    }
                };
                reader.readAsText(f);
            };
            input.click();
        });

        // ────── 2) "Scenario Editor" button ────────────────────────────────
        const editorBtn = buildBtn("scenario-editor-btn", "Scenario Editor", () => {
            if (typeof window.ScenarioEditor === "undefined") {
                alert("ScenarioEditor module not loaded!");
                return;
            }
            const menuUI = document.getElementById("main-menu-ui-container");
            if (menuUI) menuUI.style.display = "none";
            window.ScenarioEditor.open();
        });

        // ────── Insertion: after "Custom Battle", before "Load Game" ───────
        const allBtns = Array.from(ui.querySelectorAll("button"));
        const customBattleBtn = allBtns.find(b => b.innerText.includes("Custom Battle"));
        if (customBattleBtn && customBattleBtn.nextSibling) {
            ui.insertBefore(launchBtn, customBattleBtn.nextSibling);
            ui.insertBefore(editorBtn, launchBtn.nextSibling);
        } else {
            const loadBtn = allBtns.find(b => b.innerText.includes("Load Game"));
            if (loadBtn) {
                ui.insertBefore(launchBtn, loadBtn);
                ui.insertBefore(editorBtn, loadBtn);
            } else {
                ui.appendChild(launchBtn);
                ui.appendChild(editorBtn);
            }
        }

        // ────── Reveal after Manual is read ────────────────────────────────
        const poll = setInterval(() => {
            if (window.__isManualUnlocked) {
                launchBtn.style.display = "block";
                editorBtn.style.display = "block";
                clearInterval(poll);
            }
        }, 150);

        observer.disconnect();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log("[ScenarioEditor] Menu patch active — waiting for #main-menu-ui-container.");
})();