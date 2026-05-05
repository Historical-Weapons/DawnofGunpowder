// ============================================================================
// HAKATA BAY: DEFENDERS OF KYUSHU — SCENARIO TRIGGERS  v3.2
// ============================================================================
 
// To force-install (e.g. testing from the Scenario Editor):
//   window.__campaignStory1Active = true;
//   window.HakataBayScenario.install();
// ============================================================================

window.HakataBayScenario = (function () {
"use strict";

// ── CRITICAL: Stamp the NPC spawn ban at module-load time ────────────────────
// This fires the instant the <script> tag evaluates — before initializeNPCs(),
// before _applyToLiveEngine(), before the first updateNPCs() rolling tick.
// Without this, the rolling tick in updateNPCs() spawns freely for 1-2 seconds
// because window.__npcSpawnBans is undefined until t0_briefing fires (too late).
//
// The ban covers ALL four procedural roles for ALL factions.  Only story-spawned
// NPCs (spawn_important_npc action) bypass _isSpawnBanned — they go through a
// completely separate code path and are unaffected.
//
// This is intentionally duplicated in DATA.startingNpcBans (read by
// scenario_update._applyToLiveEngine for the initializeNPCs pass) and in the
// t0_briefing trigger's set_npc_spawn_ban action (belt-and-suspenders).
// The module-load stamp here closes the only remaining gap: the rolling tick
// window between script evaluation and the scenario doc being applied.
(function _stampSpawnBanAtLoad() {
    if (!window.__npcSpawnBans) {
        window.__npcSpawnBans = { factions: [], roles: [] };
    }
    var _b = window.__npcSpawnBans;
    // Ban all procedural roles — covers every faction including Yamato Clans.
    ["Commerce", "Patrol", "Civilian", "Military"].forEach(function(r) {
        if (!_b.roles.includes(r)) _b.roles.push(r);
    });
    // Also ban Yuan procedural spawns (Mongol waves only spawn via allow_mongol_waves).
    ["Yuan Dynasty Coalition"].forEach(function(f) {
        if (!_b.factions.includes(f)) _b.factions.push(f);
    });
    console.log("[HakataBay] NPC spawn ban stamped at module load:",
                "roles=" + _b.roles.join(","),
                "| factions=" + _b.factions.join(","));
})();

// ============================================================================
// ██████████████████████████ C O N F I G █████████████████████████████████████
//
//  ALL TWEAKABLE PARAMETERS LIVE HERE.
//  The rest of the file reads from CONFIG — you should not need to edit
//  anything below the "END CONFIG" comment.
//
//  Map: 250 × 187 tiles × 16 px/tile  →  4000 × 2992 px world
//  Geographic center: approximately (2000, 1496)
//
//  City pixel positions (from .dog_scenario.json xPct/yPct × 4000/2992):
//    Hakata City  2096, 1664   ← main bay city
//    Mizuki       3088, 2832   ← fortress in the south-east
//    Dazaifu      3388, 2882   ← granary city (300 px east, 50 px south of Mizuki)
//    Imazu         768, 1408   ← western coastal village  ← PLAYER STARTS HERE
//    Nokonoshima  1120, 1152   ← island in the bay
//    Soharayama   1568, 1904   ← inland supply village
//    Hakozaki     2672, 1552   ← eastern coastal settlement
//    Torikai      1824, 1744   ← coastal village south-west of Hakata
//    Shika        1120,  688   ← watch island
//    Genkai        400,  560   ← far north-west island
//
// ============================================================================

const CONFIG = {

    // ── MAP ──────────────────────────────────────────────────────────────────
    map: {
        tilesX:   250,
        tilesY:   187,
        tileSize:  16       // world = 4000 × 2992 px
    },

    // ── CITY NAME BINDINGS ───────────────────────────────────────────────────
    cities: {
        HOME:     "Hakata City",
        FORTRESS: "Mizuki",
        SUPPLY:   "Soharayama",
        GRANARY:  "Dazaifu",
        VILLAGES: ["Torikai", "Imazu", "Hakozaki"]
    },

    // ── FACTION BINDINGS ─────────────────────────────────────────────────────
    factions: {
        PLAYER: "Kamakura Shogunate",
        ENEMY:  "Yuan Dynasty Coalition"
    },

    // ── PIXEL COORDINATES ────────────────────────────────────────────────────
    coords: {
        // City anchors
        HAKATA:       { x: 2096, y: 1664 },
        HAKOZAKI:     { x: 2672, y: 1552 },
        MIZUKI:       { x: 3088, y: 2832 },
        // ── DAZAIFU — 300 px east and 50 px south of Mizuki ─────────────────
        DAZAIFU:      { x: 3388, y: 2882 },
        TORIKAI:      { x: 1824, y: 1744 },
        IMAZU:        { x:  768, y: 1408 },
        SOHARAYAMA:   { x: 1568, y: 1904 },
        NOKONOSHIMA:  { x: 1120, y: 1152 },
        SHIKA:        { x: 1120, y:  688 },
        GENKAI:       { x:  400, y:  560 },

        // ── PLAYER START — now at Imazu (western coastal village) ─────────────
        // v3.0: Player begins at Imazu. First objective is to march through the
        // coastal villages recruiting militia, then head east to the beach line.
        PLAYER_START:   { x: 268,  y: 1448 },    

        // ── BEACH DEFENSE / RALLY — shifted 200 px SOUTH from v2.x ───────────
        // v2.x had these at y ≈ 1380/1430. Adding 200 moves the defensive line
        // deeper into the beach road. Generals and retainers spawn accordingly.
        BEACH_DEFENSE:  { x: 1980, y: 1580 },   // was (1980, 1380)
        BEACH_RALLY:    { x: 1990, y: 1630 },   // was (1990, 1430)

        // ── MONGOL SPAWN — MAP CENTER with ±5% random offset ─────────────────
        // v3.3: All Mongol commanders spawn at the geographic map center (2000, 1496)
        // with ±5% random jitter (±200 px X, ±150 px Y). They march south to the
        // beach defense line. MONGOL_FLEET_NORTH kept as alias for legacy references.
        MONGOL_FLEET_NORTH: { x: 2000, y: 1496 },  // alias — actual value used in landingPositions

        YUAN_ADVANCE:   { x: 2850, y: 2520 },
        YUAN_RETREAT:   { x: 1400, y:  280 },
        MIZUKI_RALLY:   { x: 3020, y: 2775 }
    },

    // ── MONGOL LANDING WAVES ─────────────────────────────────────────────────
    // v3.0: The 10 commanders spawn at the MAP CENTER (y ≈ 1200–1400) when the
    // player reaches the beach rally point — NOT at scenario start far north.
    // This creates a sudden "they are here!" moment rather than a slow approach.
    mongol: {

        names: [
            "Liu Fuheng",               // 0 — main commander
            "Hong Dagu",                // 1 — Korean general
            "Holdon",                   // 2 — Mongol cavalry wing
            "Kim Bang-gyeong",          // 3 — Korean conscript levy
            "Liu Fuxiang",              // 4 — Han infantry column
            "Arakhan",                  // 5 — Mongol heavy horse
            "Fan Wenhu",                // 6 — Han engineer & bomb corps
            "Atahai",                   // 7 — Mongol eastern flank
            "Goryeo Vanguard Captain",  // 8 — Korean forward troops
            "Yuan Forward Corps"        // 9 — mixed vanguard
        ],

        troopsPerWave: [50, 38, 36, 38, 40, 36, 38, 42, 35, 40],

        // ── MAP-CENTER SPAWN with ±5% random offset ────────────────────────
        // v3.3: All 10 commanders spawn near the geographic center (2000, 1496).
        // Each position below is a base offset; _buildMongolNpcs() adds a
        // further per-unit random jitter of ±5% (±200 px X, ±150 px Y).
        // marchTargets remain on the beach defense line so they march south.
        landingPositions: [
            { x: 2000, y: 1496 },   // 0 — center
            { x: 2000, y: 1496 },   // 1
            { x: 2000, y: 1496 },   // 2
            { x: 2000, y: 1496 },   // 3
            { x: 2000, y: 1496 },   // 4 — center
            { x: 2000, y: 1496 },   // 5
            { x: 2000, y: 1496 },   // 6
            { x: 2000, y: 1496 },   // 7
            { x: 2000, y: 1496 },   // 8
            { x: 2000, y: 1496 }    // 9
        ],

        // ── March targets — shifted 200 px south from v2.x ───────────────────
        // These converge on the new beach defense line (y ≈ 1628–1660).
        marchTargets: [
            { x: 1180, y: 1660 },   // 0
            { x: 1360, y: 1650 },   // 1
            { x: 1540, y: 1640 },   // 2
            { x: 1720, y: 1635 },   // 3
            { x: 1900, y: 1630 },   // 4  ← beach defense zone (new)
            { x: 2060, y: 1628 },   // 5
            { x: 2230, y: 1632 },   // 6
            { x: 2400, y: 1640 },   // 7
            { x: 2560, y: 1650 },   // 8
            { x: 2710, y: 1660 }    // 9
        ],

        rosterPct: {
            "Shielded Infantry":  45,
            "Archer":             22,
            "Horse Archer":        7,
            "Heavy Horse Archer":  3,
            "Bomb":       9,
            "Firelance":           5,
            "Hand Cannoneer":      5,
            "Spearman":            4
        },

        keshigPerNpc: 3,

        // ── ENDLESS REINFORCEMENT SYSTEM ─────────────────────────────────────
        // After the named wave lands, a continuous stream of Mongol soldiers
        // pours south from the north entry zone until the player reaches Mizuki.
        // At most maxOnScreen enemy NPCs are alive simultaneously; whenever any
        // die, the engine spawns a fresh one from one of the reinforcementSpawns.
        maxOnScreen: 10,
        // ── FIXED v3.1: Spawn at TRUE north map edge (y ≈ 60-120) not center ──
        // Reinforcements pour south from the bay coastline, representing endless
        // landing waves arriving by ship from the north.
        reinforcementSpawns: [
            { x: 1420, y:  70 }, { x: 1640, y:  60 }, { x: 1840, y:  55 },
            { x: 2040, y:  60 }, { x: 2240, y:  70 }, { x: 2440, y:  80 },
            { x: 2620, y:  90 }, { x: 2800, y: 105 }, { x: 2940, y: 120 }
        ],
        // March target for reinforcements: well south toward Mizuki fortress
        reinforcementTarget: { x: 3040, y: 2880 },

        stats: {
            hp:      280,
            attack:   20,
            defense:  16,
            armor:    14,
            gold:    100,
            food:    300
        },

        commanderBonus: { hp: 1.25, attack: 1.20, troops: 1.25 }
    },

    // ── JAPANESE DEFENDER NPCs ────────────────────────────────────────────────
    // v3.0: spawn / target coords shifted 200 px south to match BEACH_RALLY.
    defenders: [
        {
            id:     "shoni_sukesada",
            name:   "Shoni Sukesada",
            troops:  40,
            x: 1760, y: 1600,   // spawn (was 1400)
            tx: 1940, ty: 1628, // march target (was 1428)
            hp: 240, attack: 18, defense: 15, armor: 13,
            gold: 150, food: 200
        },
        {
            id:     "otomo_yoriyasu",
            name:   "Otomo Yoriyasu",
            troops:  40,
            x: 2100, y: 1575,   // spawn (was 1375)
            tx: 2080, ty: 1618, // march target (was 1418)
            hp: 220, attack: 17, defense: 14, armor: 12,
            gold: 100, food: 180
        },
        {
            id:     "kikuchi_takefusa",
            name:   "Kikuchi Takefusa",
            troops:  40,
            x: 2550, y: 1588,   // spawn (was 1388)
            tx: 2570, ty: 1635, // march target (was 1435)
            hp: 230, attack: 18, defense: 15, armor: 13,
            gold: 120, food: 180
        }
    ],

    // ── JAPANESE ROSTER PERCENTAGES ───────────────────────────────────────────
    japaneseRosterPct: {
        "Spearman":           30,
        "Glaiveman":          20,
        "Archer":             10,
        "Light Two Handed":   10,
        "Heavy Two Handed":    5,
        "Horse Archer":       15,
        "Heavy Horse Archer":  5,
        "Militia":             5
    },

    // ── HOJO TOKIMUNE ─────────────────────────────────────────────────────────
    hojo: {
        x: 3048, y: 2788,
        troops: 60,
        hp: 260, attack: 22, defense: 18, armor: 16,
        gold: 400, food: 200,
        roster: [
            "Heavy Two Handed","Heavy Two Handed","Heavy Two Handed",
            "Shielded Infantry","Shielded Infantry",
            "Archer","Archer","Archer",
            "Glaiveman","Glaiveman",
            "Spearman","Spearman",
            "Horse Archer","Horse Archer",
            "Heavy Horse Archer",
            "Militia","Militia","Militia","Militia","Militia"
        ]
    },

    // ── PLAYER STARTING STATS ─────────────────────────────────────────────────
    // v3.0: Player starts at Imazu with 40 troops (reduced from 80; the Act 0
    // village recruits bring them up to 70 ish before reaching the beach line).
    player: {
        troops:    40,
        gold:     1000,
        food:     1000,
        hp:       200,
        maxHealth: 200
    },

    // ── VILLAGE RECRUIT ROSTERS ───────────────────────────────────────────────
    // Exactly 20 units each. Same as v2.x — still CSV for give_player_units.
    villageRecruits: {
        Torikai: {
            count: 20,
            flavor: "mountain archers",
            roster: "Archer,Archer,Archer,Archer,Archer,Archer,Archer,Archer," +
                    "Spearman,Spearman,Spearman,Spearman,Spearman,Spearman," +
                    "Militia,Militia,Militia,Militia,Militia,Militia"
        },
        Imazu: {
            count: 20,
            flavor: "coastal spearmen",
            roster: "Glaiveman,Glaiveman,Glaiveman,Glaiveman,Glaiveman," +
                    "Spearman,Spearman,Spearman,Spearman,Spearman," +
                    "Spearman,Spearman,Spearman," +
                    "Militia,Militia,Militia,Militia,Militia,Militia,Militia"
        },
        Hakozaki: {
            count: 20,
            flavor: "eastern shore guardsmen",
            roster: "Archer,Archer,Archer,Archer,Archer,Archer,Archer,Archer," +
                    "Spearman,Spearman,Spearman,Spearman," +
                    "Glaiveman,Glaiveman,Glaiveman,Glaiveman," +
                    "Militia,Militia,Militia,Militia"
        }
    },

    // ── TIMING (all in seconds) ───────────────────────────────────────────────
    // mongolFleetSailDuration is no longer used for fleet sailing (removed in
    // v3.0) but is kept so any external module that references it doesn't break.
    timing: {
        mongolFleetSailDuration: 60,    // legacy alias (unused in v3.0)
        mongolsLandAfterArrival: 60,    // legacy alias
        windRisesAfterReturn:    25,
        stormAfterWind:          10,
        victoryAfterRetreat:     12,
        mongolRevealDelay:        3     // seconds after meeting generals before Mongols appear
    },

    // ── RETREAT THRESHOLDS ────────────────────────────────────────────────────
    thresholds: {
        beachRetreatTroops:  40,
        mizukiSurvivors:     30,
        survivorHp:         140,
        survivorFood:        80
    },

    // ── TRIGGER RADII (px) ────────────────────────────────────────────────────
    radii: {
        beachArrival:   350,
        holdLine:       1050,   // 3× beachArrival — the sq_hold_line quest circle
        cityTrigger:    180,
        villageTrigger: 150,
        npcContact:     320
    },

    // ── DIALOGUE DEFAULTS ────────────────────────────────────────────────────
    dialogue: {
        pauseGame:     true,
        letterbox:     true,
        typewriterCps:  0      // 0 = instant text (no typewriter effect)
    },

    // ── MISC ──────────────────────────────────────────────────────────────────
    debug:             true,
    minRequiredCities: 3
};

// ============================================================================
// END CONFIG
// ============================================================================


// ─── PRIVATE HELPERS ────────────────────────────────────────────────────────

function _buildRoster(spec, total, fixed) {
    fixed = fixed || [];
    const result  = fixed.slice();
    const need    = Math.max(0, total - result.length);
    const entries = Object.entries(spec);
    const wSum    = entries.reduce(function(s, e) { return s + e[1]; }, 0);
    const units   = [];

    entries.forEach(function(e) {
        var n = Math.round(e[1] / wSum * need);
        for (var i = 0; i < n; i++) units.push(e[0]);
    });
    while (units.length < need) units.push(entries[0][0]);
    while (units.length > need) units.pop();

    return result.concat(units);
}

function _dlg(lines, opts) {
    opts = opts || {};
    var D = CONFIG.dialogue;
    return {
        type: "show_dialogue",
        params: {
            letterbox:     (opts.letterbox     !== undefined) ? opts.letterbox     : D.letterbox,
            pauseGame:     (opts.pauseGame      !== undefined) ? opts.pauseGame     : D.pauseGame,
            typewriterCps: (opts.typewriterCps  !== undefined) ? opts.typewriterCps : D.typewriterCps,
            lines: lines
        }
    };
}

function _sub(text, ms, color) {
    return { type: "show_subtitle", params: { text: text, ms: ms || 7000, color: color || "#f5d76e" } };
}

function _log(text, tag) {
    return { type: "log_message", params: { text: text, tag: tag || "general" } };
}


// ─── STORY 1 ART CATALOG ────────────────────────────────────────────────────
var ART_PATHS = {
    armada:           "art/story1/story1_art1.jpg",
    military_prep:    "art/story1/story1_art2.jpg",

    portraits: {
        "You":                   "art/story1/highrank_samurai.jpg",
        "Narrator":              "art/story1/old_man.jpg",
        "Hojo Tokimune":         "art/story1/highrank_samurai.jpg",
        "Shoni Sukesada":        "art/story1/highrank_samurai.jpg",
        "Otomo Yoriyasu":        "art/story1/highrank_samurai.jpg",
        "Kikuchi Takefusa":      "art/story1/highrank_samurai.jpg",
        "Ashigaru Captain":      "art/story1/lowrank_samurai.jpg",
		"Shogunate Messenger":     "art/story1/lowrank_samurai.jpg", // Added 
				"Messenger":     "art/story1/japinfantry.jpg", // 
        "Samurai Retainer":      "art/story1/lowrank_samurai.jpg",
        "Japanese Levy":         "art/story1/japinfantry.jpg",
        "Village Elder":         "art/story1/Jap_Farmer.jpg",
		"Imazu Garrison":         "art/story1/japinfantry.jpg",
		
		
        "Coastal Captain":       "art/story1/lowrank_samurai.jpg",
        "Granary Steward":       "art/story1/Jap_Farmer.jpg",
        "Village Headman":       "art/story1/Jap_Farmer.jpg",
        "Liu Fuheng":            "art/story1/Mongol_Officer1.jpg",
        "Hong Dagu":             "art/story1/Mongol_Officer2.jpg",
        "Holdon":                "art/story1/Mongol_Officer1.jpg",
        "Kim Bang-gyeong":       "art/story1/Mongol_Officer2.jpg",
        "Liu Fuxiang":           "art/story1/Mongol_Officer1.jpg",
        "Arakhan":               "art/story1/Mongol_Officer2.jpg",
        "Fan Wenhu":             "art/story1/Mongol_Officer1.jpg",
        "Atahai":                "art/story1/Mongol_Officer2.jpg",
        "Goryeo Vanguard Captain": "art/story1/Mongol_Infantry2.jpg",
        "Yuan Forward Corps":    "art/story1/Mongol_Infantry1.jpg",
        "Mongol Vanguard":       "art/story1/Mongol_Infantry1.jpg",
        "Yuan Bannerman":        "art/story1/Mongol_Infantry2.jpg",
        // Yuan debate officers — distinct names used in t3_kamikaze dialogue
        "Yuan Officer":          "art/story1/Mongol_Officer2.jpg",
        "Hinto":       "art/story1/Mongol_Officer1.jpg",
        "Kim Bang-gyeong":     "art/story1/Mongol_Officer2.jpg"
    }
};

function _preloadStoryArt() {
    if (!window.StoryPresentation ||
        typeof window.StoryPresentation.registerPortraitsBulk !== "function") {
        setTimeout(_preloadStoryArt, 200);
        return;
    }
    window.StoryPresentation.registerPortraitsBulk(ART_PATHS.portraits);
    console.log("[HakataBay] Story 1 portraits registered:",
                Object.keys(ART_PATHS.portraits).length);
}


// ─── BUILD SAMURAI RETAINERS ─────────────────────────────────────────────────
// v3.0: y coords shifted 200px south to match new BEACH_RALLY.
function _buildSamuraiRetainers() {
    return [
        {
            id:       "samurai_retainer_left",
            name:     "Samurai Retainer",
            faction:  CONFIG.factions.PLAYER,
            x:        1900, y: 1650,   // was (1900, 1450)
            targetX:  1900, targetY: 1650,
            role:     "Military",
            troops:   38,
            roster:   _buildRoster(CONFIG.japaneseRosterPct, 18),
            rosterMode: "hard",
            hp:       180, attack: 16, defense: 14, armor: 12,
            gold:      40, food: 60,
            portraitUrl: ART_PATHS.portraits["Samurai Retainer"]
        },
        {
            id:       "samurai_retainer_right",
            name:     "Samurai Retainer",
            faction:  CONFIG.factions.PLAYER,
            x:        2080, y: 1650,   // was (2080, 1450)
            targetX:  2080, targetY: 1650,
            role:     "Military",
            troops:   38,
            roster:   _buildRoster(CONFIG.japaneseRosterPct, 18),
            rosterMode: "hard",
            hp:       180, attack: 16, defense: 14, armor: 12,
            gold:      40, food: 60,
            portraitUrl: ART_PATHS.portraits["Samurai Retainer"]
        }
    ];
}


// ─── BUILD MONGOL WAVE NPCs ──────────────────────────────────────────────────
// v3.0: rosterMode "hard" added so the exact _buildRoster composition is kept
// when scenario_triggers.js spawn handler calls _expandScenarioRoster.
function _buildMongolNpcs() {
    var m    = CONFIG.mongol;
    var npcs = [];
    m.names.forEach(function(name, i) {
        var isCommander = (i === 0);
        var bonus   = m.commanderBonus;
        var baseTroops = m.troopsPerWave[i];
        var troops  = isCommander ? Math.round(baseTroops * bonus.troops) : baseTroops;
        var stats   = m.stats;

        var keshig = [];
        for (var k = 0; k < m.keshigPerNpc; k++) keshig.push("Keshig");

        npcs.push({
            id:       "mongol_wave_" + i,
            name:     name,
            faction:  CONFIG.factions.ENEMY,
            // ±5% jitter: 5% of 4000 = ±200 px X, 5% of 2992 = ±150 px Y
            x:        m.landingPositions[i].x + (Math.random() * 400 - 200),
            y:        m.landingPositions[i].y + (Math.random() * 300 - 150),
            targetX:  m.marchTargets[i].x,
            targetY:  m.marchTargets[i].y,
            role:     "Military",
            troops:   troops,
            roster:   _buildRoster(m.rosterPct, troops, keshig),
            rosterMode: "hard",   // v3.0: preserve exact composition
            hp:       isCommander ? Math.round(stats.hp     * bonus.hp)     : stats.hp,
            attack:   isCommander ? Math.round(stats.attack * bonus.attack) : stats.attack,
            defense:  stats.defense,
            armor:    stats.armor,
            gold:     stats.gold,
            food:     stats.food,
            portraitUrl: ART_PATHS.portraits[name] || ""
        });
    });
    return npcs;
}

// ─── BUILD JAPANESE DEFENDER NPCs ───────────────────────────────────────────
function _buildDefenderNpcs() {
    return CONFIG.defenders.map(function(d) {
        return {
            id:       d.id,
            name:     d.name,
            faction:  CONFIG.factions.PLAYER,
            x:        d.x,
            y:        d.y,
            targetX:  d.tx,
            targetY:  d.ty,
            role:     "Military",
            troops:   d.troops,
            roster:   _buildRoster(CONFIG.japaneseRosterPct, d.troops),
            rosterMode: "hard",
            hp:       d.hp,
            attack:   d.attack,
            defense:  d.defense,
            armor:    d.armor,
            gold:     d.gold,
            food:     d.food,
            portraitUrl: ART_PATHS.portraits[d.name] || ""
        };
    });
}

// ─── MONGOL ACTION BATCH BUILDERS ───────────────────────────────────────────
function _mongolSpawnActions() {
    return CONFIG.mongol.names.map(function(_, i) {
        return { type: "spawn_important_npc", params: { id: "mongol_wave_" + i } };
    });
}
function _mongolWaypointActions() {
    return CONFIG.mongol.names.map(function(_, i) {
        return {
            type: "set_npc_waypoint",
            params: { id: "mongol_wave_" + i,
                      x: CONFIG.mongol.marchTargets[i].x,
                      y: CONFIG.mongol.marchTargets[i].y }
        };
    });
}
function _mongolDespawnActions() {
    return CONFIG.mongol.names.map(function(_, i) {
        return { type: "remove_important_npc", params: { id: "mongol_wave_" + i } };
    });
}
function _defenderDespawnActions() {
    return CONFIG.defenders.map(function(d) {
        return { type: "remove_important_npc", params: { id: d.id } };
    });
}


// ─── STATIC DATA ─────────────────────────────────────────────────────────────

var C      = CONFIG.coords;
var T      = CONFIG.thresholds;
var TIM    = CONFIG.timing;
var RAD    = CONFIG.radii;
var FAC    = CONFIG.factions;

// ── PLAYER SETUP ──────────────────────────────────────────────────────────────
// v3.0: Starts at IMAZU with 60 troops. Recruits bring this to ~120 before the
// beach line is reached. The re-apply loop in install() ensures this sticks.
var PLAYER_SETUP = {
    x:        C.PLAYER_START.x,
    y:        C.PLAYER_START.y,
    faction:  FAC.PLAYER,
    troops:   CONFIG.player.troops,
    gold:     CONFIG.player.gold,
    food:     CONFIG.player.food,
    hp:       CONFIG.player.hp,
    maxHealth: CONFIG.player.maxHealth,
    enemies:  [FAC.ENEMY, "Bandits"],
    roster:   _buildRoster(CONFIG.japaneseRosterPct, CONFIG.player.troops),
    // ADD THIS LINE BELOW:
    portraitUrl: "art/story1/lowrank_samurai.jpg" 
};

// ── IMPORTANT NPCs ────────────────────────────────────────────────────────────
var IMPORTANT_NPCS = [
    {
        id:       "hojo_tokimune",
        name:     "Hojo Tokimune",
        faction:  FAC.PLAYER,
        x:        CONFIG.hojo.x,
        y:        CONFIG.hojo.y,
        targetX:  CONFIG.hojo.x,
        targetY:  CONFIG.hojo.y,
        role:     "Military",
        troops:   CONFIG.hojo.troops,
        roster:   CONFIG.hojo.roster,
        rosterMode: "hard",
        hp:       CONFIG.hojo.hp,
        attack:   CONFIG.hojo.attack,
        defense:  CONFIG.hojo.defense,
        armor:    CONFIG.hojo.armor,
        gold:     CONFIG.hojo.gold,
        food:     CONFIG.hojo.food,
        portraitUrl: ART_PATHS.portraits["Hojo Tokimune"] || ""
    }
].concat(_buildDefenderNpcs())
 .concat(_buildSamuraiRetainers())
 .concat(_buildMongolNpcs())    // ← Mongol wave NPCs registered for spawn_important_npc


// ── STORY INTRO ───────────────────────────────────────────────────────────────
// v3.0: Subtitle changed to "Western Kyushu" and narrator lines updated to
// reflect the Imazu starting location on the western shore.
var STORY_INTRO = {
    enabled:   true,
    fadeMs:    1400,
    fadeColor: "#000000",
    titleCard: {
        title:    "Bun'ei",
        subtitle: "Western Kyushu — Autumn, 1274",
        ms:       4200
    },
    // story1_art1 (armada) plays first while the narrator describes the fleet.
    // story1_art2 (military prep) swaps in at line index 2 — the moment the
    // dialogue shifts from the enemy fleet to YOUR troops at Imazu.
    // v3.2: art2Caption added so a caption text appears below art2.
    //       art2CrossfadeMs bumped to 1200ms (must exceed the 1000ms cleanup
    //       delay in showArt's finish() to prevent Art 1's stale timer from
    //       overwriting Art 2's backgroundImage).
   art:          "art/story1/story1_art1.jpg",
    art2:         "art/story1/story1_art2.jpg",
    art2OnLine:   2,
    art2CrossfadeMs: 1200,
    art2Caption:  "Japanese forces mobilising — after the fall of Tsushima and Iki",
    artMs:        4500,
    kenburns:     true,
    lines: [
 
        // Line 1 — fleet size (art1 still showing)
        {
            side: "left", name: "Narrator", color: "#d4b886",
            text: "Nine hundred ships. Thirty thousand men. Mongol bannermen, " +
                  "Korean conscripts, Han engineers. Bound for Hakata Bay."
        },
        // Line 2 — art swap trigger: art1 fades, art2 cross-fades in (art2CrossfadeMs after onLine fires)
        {
            side: "left", name: "Narrator", color: "#d4b886",
            text: "Temple bells rang across northern Kyushu. Mounted messengers rode from estate to estate as local gokenin summoned their retainers, and villages along Hakata Bay prepared for the defence."
        },
        // Line 3 — Shogunate Messenger delivers orders (art2 is now showing)
        {
            side: "right", name: "Shogunate Messenger", color: "#c2185b",
            portrait: "art/story1/lowrank_samurai.jpg",
            text: "My Lord! Urgent orders from Kamakura — Mongols are landing soon! " +
                  "Gather every spear, every bow from Imazu to Hakozaki. Fill the beach line " +
                  "before they can set foot on dry ground!"
        },
        // Line 4 — final narrator beat, player agency established
        {
            side: "left", name: "Narrator", color: "#d4b886",
            text: "You are marching east toward Imazu. As one of the closest samurai " +
                  "commanders to the west, you lead a vanguard of forty men. The shogun's order is " +
                  "clear: rally the coast and hold the bay."
        }
    ],
    letterbox:     true,
    typewriterCps: 0,      // 0 = instant text (no typewriter effect)
    // Auto-advance after 9 seconds per line so mobile players never get
    // permanently stuck waiting for a tap-to-advance that the game canvas
    // consumes. Tap or spacebar still advance immediately.
    autoAdvance:   0
};

// ── SCENARIO VARIABLES ────────────────────────────────────────────────────────
//   phase         — "recruit" | "beach" | "retreat" | "quests" | "fort" | "victory"
//   beach_arrived — 1 once player reaches the beach line
//   militia_count — incremented per village visit (0..3)
//   quest_food    — 0=not started  1=active  2=complete
//   storm_started — 1 once the typhoon cinematic fires
var SCENARIO_VARS = {
    phase:         "recruit",   // v3.0: starts in recruit phase (not "beach")
    beach_arrived: 0,
    militia_count: 0,
    quest_food:    0,
    storm_started: 0
};


// ============================================================================
// TRIGGERS
// ============================================================================
// Naming:  t0_*  Act 0 (militia recruitment — NEW in v3.0)
//          t1_*  Act I (beach defense)
//          t2_*  Act II (retreat & supply quest)
//          t3_*  Act III (Mizuki & typhoon)
//          wl_*  win/lose
// ============================================================================

var TRIGGERS = [

    // ══════════════════════════════════════════════════════════════════════════
    // PRE-ACT 0 — VILLAGE RECRUIT LOCKOUT LIFT (Story 1 only)
    // Villages are locked from day 0 (calcRecruitQuota checks __villageRecruitUnlocked).
    // Lifted at 5 real minutes OR when the militia quest completes, whichever is first.
    // ══════════════════════════════════════════════════════════════════════════
    {
        id: "t0_village_recruit_unlock", name: "Act 0 — Village Recruit Lockout Lift (5 min)",
        enabled: true, once: true, activatedBy: null,
        conditions: [
            { type: "scenario_start", params: {} },
            { type: "timer_elapsed",  params: { seconds: 300 } }
        ],
        actions: [
            { type: "custom_js", params: {
                code: "window.__villageRecruitUnlocked = true; " +
                      "console.log('[HakataBay] Village recruit lockout lifted at 5 min.');"
            }}
        ]
    },

    // ══════════════════════════════════════════════════════════════════════════
    // PRE-BOOT PURGE — runs every 2s from game start, no activatedBy.
    //
    // The module-load stamp blocks new procedural spawns, but NPCs that were
    // spawned in the gap between map-load and the stamp (or by ensureAllFactionsSpawned
    // which bypasses spawnNPCFromCity) survive in globalNPCs.  This repeating
    // trigger sweeps them out every 2 game-seconds for the first 30 seconds,
    // then disables itself.
    //
    // It ONLY removes NPCs whose role is one of the banned procedural roles.
    // Story-spawned NPCs (spawn_important_npc path) never have these roles —
    // they use named roles like "Military" with isImportant:true, or they are
    // identified by id prefix.  We guard by id: any NPC whose id starts with
    // a short random hex (the Math.random().toString(36).substr(2,9) pattern
    // from spawnNPCFromCity / spawnBandit) is procedural.  Important NPCs
    // always have a deterministic id set in DATA.importantNpcs.
    // ══════════════════════════════════════════════════════════════════════════
    {
        id: "t0_purge_procedural_npcs",
        name: "Pre-Boot — Purge stray procedural NPCs (repeating, first 30s)",
        enabled: true, once: false, activatedBy: null,
        conditions: [
            // Active for the first 30 game-seconds, before story NPCs exist
            { type: "custom_js", params: {
                code: [
                    "// Fire every 2 elapsed seconds for the first 30 seconds.",
                    "if (typeof window.__hakata_purge_last === 'undefined') window.__hakata_purge_last = 0;",
                    "if (ctx.elapsedSec > 30) return false;",
                    "if (ctx.elapsedSec - window.__hakata_purge_last < 2) return false;",
                    "window.__hakata_purge_last = ctx.elapsedSec;",
                    "return true;"
                ].join("\n")
            }}
        ],
        actions: [
            { type: "custom_js", params: {
                code: [
                    "// Purge any procedural NPC whose role is in the banned set.",
                    "// Procedural NPCs have a random 9-char alphanumeric id.",
                    "// Story NPCs have a deterministic id (e.g. 'hojo_tokimune').",
                    "var _BANNED_ROLES = ['Commerce','Patrol','Civilian','Military'];",
                    "// Known deterministic id prefixes for story NPCs in this scenario:",
                    "var _STORY_ID_PREFIXES = [",
                    "    'hojo_','shoni_','otomo_','kikuchi_','samurai_retainer_',",
                    "    'mongol_wave_','mongol_reinf_'",
                    "];",
                    "function _isStoryNpc(npc) {",
                    "    return _STORY_ID_PREFIXES.some(function(pfx) {",
                    "        return npc.id && npc.id.startsWith(pfx);",
                    "    });",
                    "}",
                    "if (window.globalNPCs) {",
                    "    var _before = window.globalNPCs.length;",
                    "    window.globalNPCs = window.globalNPCs.filter(function(n) {",
                    "        // Keep story NPCs regardless of role.",
                    "        if (_isStoryNpc(n)) return true;",
                    "        // Remove if their role is in the banned procedural list.",
                    "        if (_BANNED_ROLES.includes(n.role)) return false;",
                    "        // Remove if their faction is procedurally banned.",
                    "        if (n.faction === 'Yuan Dynasty Coalition' && !n.isImportant) return false;",
                    "        return true;",
                    "    });",
                    "    var _purged = _before - window.globalNPCs.length;",
                    "    if (_purged > 0) console.log('[HakataBay] Purged', _purged, 'stray procedural NPC(s). Remaining:', window.globalNPCs.length);",
                    "}"
                ].join("\n")
            }}
        ]
    },

    // ══════════════════════════════════════════════════════════════════════════
    // ACT 0 — RECRUIT THE MILITIA  (NEW in v3.0)
    //
    //   Player starts at Imazu. Hojo's order arrives immediately: rally the
    //   three coastal villages before marching to the beach line.
    //
    //   t0_briefing       — scenario_start → Messenger spawns, intro orders, set Imazu waypoint
    //   t0_recruit_imazu  — player at Imazu (already there!) → Imazu recruits
    //   t0_recruit_torikai→ player at Torikai → Torikai recruits
    //   t0_recruit_hakozaki → player at Hakozaki → Hakozaki recruits
    //   t0_militia_ready  — all 3 villages done → march to beach, generals deploy
    // ══════════════════════════════════════════════════════════════════════════

    // T0.A — Scenario start: spawn the messenger, deliver Hojo's orders,
    //         set the first recruitment waypoint to Imazu.
    {
        id: "t0_briefing", name: "Act 0 — Messenger's Orders (Imazu)",
        enabled: true, once: true, activatedBy: null,
        conditions: [
            { type: "scenario_start", params: {} }
        ],
        actions: [
             
            { type: "set_relation", params: { a: FAC.PLAYER, b: FAC.ENEMY, rel: "War" } },

            // ── Initialize player gold & food at scenario start ────────────────
            // Uses set_player_stats (the engine action path) so the values stick
            // even if the runtime re-initialises window.player after install().
            { type: "set_player_stats", params: {
                gold: CONFIG.player.gold,   // 300 — enough to hire a few units
                food: CONFIG.player.food    // 400 — supplies for the march east
            }},

            // MOVED UP: Waypoint set immediately so it isn't blocked
            { type: "story_quest_set", params: {
                id:          "sq_recruit_imazu",
                title:       "Recruit at Imazu",
                description: "Speak to the coastal captain. The village is right here.",
                x:           C.IMAZU.x,
                y:           C.IMAZU.y,
                radius:      RAD.villageTrigger,
                noAutoComplete: true
            }},

            // MOVED UP: Subtitles and Logs 
            _sub("Objective: Rally the coastal militia — start with Imazu.", 8000, "#f5d76e"),
            _log("📜 A Shogunate Messenger delivers orders from Hojo Tokimune: recruit militia from three villages."),
            _log("☞ Begin by going to Imazu, then Torikai, then Hakozaki.", "objective"),

            // MOVED DOWN: Dialogue is now the final action
            _dlg([
                { 
                    side: "right", 
                    name: "Shogunate Messenger", 
                    color: "#c2185b",
                    portrait: "art/story1/lowrank_samurai.jpg",
                    text: "Commander! The fleet is almost offshore. They burned Tsushima and Iki to the ground. " +
                          "Governor Sukekuni's head was taken, and the islanders were massacred. " +
                          "You must reinforce your lines with every man the shore can still give you!" 
                },
                { 
                    side: "right", 
                    name: "Shogunate Messenger", 
                    color: "#c2185b",
                    portrait: "art/story1/lowrank_samurai.jpg",
                    text: "You are practically at Imazu. Torikai and Hakozaki lie to your east. " +
                          "Visit all three. Tell them the Shogunate calls them to arms. Lord Tokimune " +
                          "demands it." 
                },
                { 
                    side: "left", 
                    name: "You", 
                    color: "#ffffff",
                    text: "And when we have mustered these men?" 
                },
                { 
                    side: "right", 
                    name: "Shogunate Messenger", 
                    color: "#c2185b",
                    portrait: "art/story1/lowrank_samurai.jpg",
                    text: "Then you march to the bay. Sukesada and the other generals are already " +
                          "holding the coast road. Find them. I must ride on!" 
                }
            ]),
			
			// FIX v3.1: Ban ALL four procedural NPC roles at scenario start.
            // Patrol, Commerce, Civilian, Military are all inappropriate during a
            // 2-day desperate beach defence — they would have either fled or are
            // already holding the line. Scripted story NPCs (spawn_important_npc)
            // are unaffected because that path bypasses _isSpawnBanned entirely.
            {
                type: "set_npc_spawn_ban",
                params: {
                    // Bans ALL procedural spawns for the Yuan Dynasty Coalition
                    factions: [CONFIG.factions.ENEMY],
                    // Bans all four procedural roles for ALL factions
                    roles:    ["Commerce", "Patrol", "Civilian", "Military"]
                }
            }
        ]
    },

    // T0.B — Imazu recruitment (player is practically on top of it at start).
    {
        id: "t0_recruit_imazu", name: "Act 0 — Imazu Levy",
        enabled: true, once: true, activatedBy: "t0_briefing",
        conditions: [
            { type: "player_at_city", params: { cityName: "Imazu", radius: RAD.villageTrigger } },
            { type: "var_equals",     params: { name: "phase", value: "recruit" } }
        ],
        actions: [
            _dlg([
                { side: "right", name: "Imazu Garrison", color: "#5d4037",
                  text: "The smoke from Tsushima reached us days ago. We knew " +
                        "what it meant. Every able body in Imazu — fishermen, farmers, " +
                        "carpenters — they are yours, commander." },
                { side: "left", name: "You", color: "#ffffff",
                  text: "Kyushu will remember your service." },
                { side: "right", name: "Imazu Garrison", color: "#5d4037",
                  text: "The sea has fed this village for a " +
                        "hundred years. We are not giving it to the Mongols." }
            ], { letterbox: false }),
            { type: "give_player_units", params: {
                roster: CONFIG.villageRecruits.Imazu.roster
            }},
            { type: "increment_var", params: { name: "militia_count", n: 1 } },
            _log("🛡 +20 " + CONFIG.villageRecruits.Imazu.flavor + " from Imazu."),

            // ── v3.2: Bonus militia joining dialogue (10–15 men) ─────────────────
            // Simulates additional townsfolk stepping forward after the formal levy.
            _dlg([
                { side: "right", name: "Militia Volunteer", color: "#6d4c41",
                  portrait: "art/story1/japinfantry.jpg",
                  text: "We are ready to join your ranks, sir. "  }
            ], { letterbox: false }),
            { type: "give_player_units", params: {
                roster: "Spearman,Spearman,Spearman,Militia,Militia,Militia,Militia,Militia,Militia,Militia,Militia,Militia"
            }},
            _log("🛡 +12 additional volunteers joined from Imazu."),
            _sub("Imazu volunteers join your ranks!", 4000, "#8bc34a"),

            // Next waypoint: Torikai
            { type: "story_quest_complete", params: { id: "sq_recruit_imazu" } },
            { type: "story_quest_set", params: {
                id:          "sq_recruit_torikai",
                title:       "Recruit at Torikai",
                description: "March south-east to Torikai for their archers.",
                x:           C.TORIKAI.x,
                y:           C.TORIKAI.y,
                radius:      RAD.villageTrigger,
                noAutoComplete: true
            }},
            _sub("Torikai next — they have some bowmen.", 6000, "#f5d76e")
        ]
    },

    // T0.C — Torikai recruitment.
    {
        id: "t0_recruit_torikai", name: "Act 0 — Torikai Levy",
        enabled: true, once: true, activatedBy: "t0_recruit_imazu",
        conditions: [
            { type: "player_at_city", params: { cityName: "Torikai", radius: RAD.villageTrigger } },
            { type: "var_equals",     params: { name: "phase", value: "recruit" } }
        ],
        actions: [
            _dlg([
                { side: "right", name: "Village Elder", color: "#5d4037",
                  text: "A few among us have hunted with the bow in the hills. Their hands are steady. Take them, commander, and pray their aim serves us now as it once served them." }
            ], { letterbox: false }),
            { type: "give_player_units", params: {
                roster: CONFIG.villageRecruits.Torikai.roster
            }},
            { type: "increment_var", params: { name: "militia_count", n: 1 } },
            _log("🏹 +20 " + CONFIG.villageRecruits.Torikai.flavor + " from Torikai."),

            // ── v3.2: Bonus militia joining dialogue (10–15 men) ─────────────────
            _dlg([
                { side: "right", name: "Militia Volunteer", color: "#6d4c41",
                  portrait: "art/story1/japinfantry.jpg",
                  text: "We are ready to join you, sir! Our village has heard what " +
                        "happened at Tsushima. We will not stand idle while the bay " +
                        "burns. We pledge our arms to you." }
            ], { letterbox: false }),
            { type: "give_player_units", params: {
                roster: "Archer,Archer,Archer,Archer,Archer,Militia,Militia,Militia,Militia,Militia,Spearman,Spearman,Spearman,Archer,Archer"
            }},
            _log("🏹 +15 additional volunteers joined from Torikai."),
            _sub("Torikai volunteers answer the call!", 4000, "#8bc34a"),

            // Next waypoint: Hakozaki
            { type: "story_quest_complete", params: { id: "sq_recruit_torikai" } },
            { type: "story_quest_set", params: {
                id:          "sq_recruit_hakozaki",
                title:       "Recruit at Hakozaki",
                description: "Ride east to Hakozaki.",
                x:           C.HAKOZAKI.x,
                y:           C.HAKOZAKI.y,
                radius:      RAD.villageTrigger,
                noAutoComplete: true
            }},
            _sub("Hakozaki last — the eastern shore guardsmen will round out your line.", 6000, "#f5d76e")
        ]
    },

    // T0.D — Hakozaki recruitment.
    {
        id: "t0_recruit_hakozaki", name: "Act 0 — Hakozaki Levy",
        enabled: true, once: true, activatedBy: "t0_recruit_torikai",
        conditions: [
            { type: "player_at_city", params: { cityName: "Hakozaki", radius: RAD.villageTrigger } },
            { type: "var_equals",     params: { name: "phase", value: "recruit" } }
        ],
        actions: [
            _dlg([
                { side: "right", name: "Village Headman", color: "#5d4037",
                  text: "Take every man who can hold a spear. " +
                        "We would rather die on a beach than burn in our beds." }
            ], { letterbox: false }),
            { type: "give_player_units", params: {
                roster: CONFIG.villageRecruits.Hakozaki.roster
            }},
            { type: "increment_var", params: { name: "militia_count", n: 1 } },
            _log("🏹 +20 " + CONFIG.villageRecruits.Hakozaki.flavor + " from Hakozaki."),

            // ── v3.2: Bonus militia joining dialogue (10–15 men) ─────────────────
            _dlg([
                { side: "right", name: "Militia Volunteer", color: "#6d4c41",
                  portrait: "art/story1/japinfantry.jpg",
                  text: "Commander, we are with you, sir! Young men, dockworkers, " +
                        "off-duty garrison... anyone who can run to the bay has come. " +
                        "We are yours to command." }
            ], { letterbox: false }),
            { type: "give_player_units", params: {
                roster: "Militia,Militia,Militia,Militia,Militia,Militia,Militia,Militia,Spearman,Spearman,Archer,Archer,Glaiveman,Glaiveman,Glaiveman,Glaiveman,Glaiveman,Glaiveman,Glaiveman,Glaiveman"
            }},
            _log("🏹 +20 additional volunteers joined from Hakozaki."),
            _sub("Hakozaki rallies behind you!", 4000, "#8bc34a")
        ]
    },

    // T0.E — All three villages levied. Transition to beach march.
    {
        id: "t0_militia_ready", name: "Act 0 — Militia Mustered, March to Beach",
        enabled: true, once: true, activatedBy: "t0_recruit_hakozaki",
        conditions: [
            { type: "var_above", params: { name: "militia_count", n: 2 } }
        ],
        actions: [
            // Lift village recruit lockout early if quest completes before 5-min timer
            { type: "custom_js", params: {
                code: "window.__villageRecruitUnlocked = true; " +
                      "console.log('[HakataBay] Village recruit lockout lifted early — militia quest complete.');"
            }},

            // Deploy the 3 named generals and 2 retainers at the (shifted) beach line.
            { type: "spawn_important_npc", params: { id: "shoni_sukesada" } },
            { type: "spawn_important_npc", params: { id: "otomo_yoriyasu" } },
            { type: "spawn_important_npc", params: { id: "kikuchi_takefusa" } },
            { type: "spawn_important_npc", params: { id: "samurai_retainer_left"  } },
            { type: "spawn_important_npc", params: { id: "samurai_retainer_right" } },

            // Waypoints for the generals on the NEW beach line (200px south).
            { type: "set_npc_waypoint", params: { id: "shoni_sukesada",   x: 1940, y: 1628 } },
            { type: "set_npc_waypoint", params: { id: "otomo_yoriyasu",   x: 2080, y: 1618 } },
            { type: "set_npc_waypoint", params: { id: "kikuchi_takefusa", x: 2570, y: 1635 } },

            _dlg([
                { side: "left", name: "Narrator", color: "#d4b886",
                  text: "Three villages answered in one morning. The coast road filled " +
                        "with fishermen carrying boat hooks, farmers with scythes reforged " +
                        "into blades. It was not an army. It was a province standing up." }
            ]),

            { type: "set_var", params: { name: "phase", value: "beach" } },

            // Waypoint: march east to the beach rally (200px south of original).
            { type: "story_quest_complete", params: { id: "sq_recruit_hakozaki" } },
            { type: "story_quest_set", params: {
                id:              "sq_march_to_beach",
                title:           "March to the rally point",
                description:     "Your militia is mustered. Join Sukesada, Otomo, and " +
                                 "Kikuchi on the beach line.",
                x:               C.BEACH_RALLY.x,
                y:               C.BEACH_RALLY.y,
                radius:          RAD.beachArrival
            }},

            _sub("All three villages have answered the call. March to the beach line!", 8000, "#8bc34a"),
            _log("✅ Militia mustered. March east to join the generals on the bay.", "objective")
        ]
    },


    // ══════════════════════════════════════════════════════════════════════════
    // ACT I — THE BEACH
    //
    //   t1_meet_generals    — player reaches beach rally → generals briefing
    //                         → MONGOLS SPAWN at map center, march south
    //   t1_wait_for_mongols — atmospheric beat (3s after arrival)
    //   t1_beach_skirmish   — central Mongol wave reaches the line
    //   t1_beach_defeat     — player troops drop below threshold → retreat
    // ══════════════════════════════════════════════════════════════════════════

    // T1.A — Player reaches the beach rally point (shifted 200px south).
    //         Generals deliver the tactical briefing. Then, IMMEDIATELY,
    //         the Mongols are SPAWNED at the map center and given march orders.
    {
        id: "t1_meet_generals", name: "Act I — Meet the Generals",
        enabled: true, once: true, activatedBy: "t0_militia_ready",
        conditions: [
            { type: "player_in_region", params: {
                x: C.BEACH_RALLY.x, y: C.BEACH_RALLY.y, radius: RAD.beachArrival
            }},
            { type: "var_equals", params: { name: "phase", value: "beach" } }
        ],
        actions: [
            _dlg([
                { side: "right", name: "Shoni Sukesada", color: "#c2185b",
                  text: "You came — and you brought men. More than I expected " +
                        "from the western shore. Well done." },
                { side: "left", name: "You", color: "#ffffff",
                  text: "We are honored to defend our homelands. Where do you need them?" },
                { side: "right", name: "Shoni Sukesada", color: "#c2185b",
                  text: "Set your men here, in the center." },
                { side: "right", name: "Otomo Yoriyasu", color: "#e67e22",
                  text: "Their archers outrange our bows. Close the gap. But I heard they are a mixture of soldiers from many cultures from China and Korea, with low cohesion. " +
                        "Reports mentioned thunder sounding devices with smoke and fire, that scare our horses. Try to calm them down if that happens." },
                { side: "right", name: "Kikuchi Takefusa", color: "#27ae60",
                  text: "I will hold the eastern flank near Hakozaki. If the Korean " +
                        "levies waver there, I will push through. Watch my banner." }
            ]),
            { type: "set_var", params: { name: "beach_arrived", value: "1" } },
            { type: "story_quest_complete", params: { id: "sq_march_to_beach" } }
        ]
    },

    // T1.B — Three seconds after meeting the generals, the Mongols appear at the
    //         map center. No slow fleet sail — they MATERIALIZE in the bay.
    //         This fires a dramatic art card + spawn + march orders simultaneously.
    {
        id: "t1_mongols_landing", name: "Act I — The Yuan Materialize at Map Center",
        enabled: true, once: true, activatedBy: "t1_meet_generals",
        conditions: [
            { type: "var_equals", params: { name: "beach_arrived", value: "1" } },
            { type: "custom_js",  params: {
                code: [
                    "if (!ctx.firedById['t1_meet_generals']) return false;",
                    "if (typeof window.__hakata_meet_t0 === 'undefined') {",
                    "    window.__hakata_meet_t0 = ctx.elapsedSec; return false;",
                    "}",
                    "return (ctx.elapsedSec - window.__hakata_meet_t0) >= " + TIM.mongolRevealDelay + ";"
                ].join("\n")
            }}
        ],
        actions: [
            // ── Unlock procedural Yuan spawn tick now that the story moment has arrived
            { type: "allow_mongol_waves", params: {} },

            { type: "fade_flash", params: { color: "#ffffff", ms: 300 } },

            // Art card reveal — the armada is suddenly visible.
            { type: "show_art", params: {
                url:      ART_PATHS.armada,
                ms:       5500,
                kenburns: true
            }},
            { type: "show_title", params: {
                title:    "THE FLEET ARRIVES",
                subtitle: "Twentieth day of the tenth month, 1274",
                ms:       3200
            }}
        ].concat(_mongolSpawnActions())
         .concat(_mongolWaypointActions())
         .concat([
            // Hold-the-line waypoint for player — radius tripled so the circle
            // covers the full beach defensive zone.
            { type: "story_quest_set", params: {
                id:          "sq_hold_line",
                title:       "Hold the line",
                description: "The Yuan host has landed. Stand your ground.",
                x:           C.BEACH_RALLY.x,
                y:           C.BEACH_RALLY.y,
                radius:      RAD.holdLine
            }},
            _sub("The Yuan host has appeared in the bay. They march on your position!", 6000, "#ff5252"),
            _log("⚔ The Yuan force has landed at map center and is advancing!", "war")
         ])
    },

    // T1.C — Atmospheric beat while the Mongol line closes in.
    //         v3.3: When this trigger fires, the player is teleported to BEACH_RALLY
    //         and all Japanese story ally NPCs are locked in a neat line at the shore.
    //         Nobody moves until the beach phase ends.
    {
        id: "t1_wait_for_mongols", name: "Act I — Drums on the Water (Hold the Line)",
        enabled: true, once: true, activatedBy: "t1_mongols_landing",
        conditions: [
            { type: "var_equals", params: { name: "beach_arrived", value: "1" } },
            { type: "custom_js",  params: {
                code: [
                    "if (!ctx.firedById['t1_mongols_landing']) return false;",
                    "if (typeof window.__hakata_drums_t0 === 'undefined') {",
                    "    window.__hakata_drums_t0 = ctx.elapsedSec; return false;",
                    "}",
                    "return (ctx.elapsedSec - window.__hakata_drums_t0) >= 5;"
                ].join("\n")
            }}
        ],
        actions: [
            // ── Teleport player to the rally point so they stand with the line ──
            { type: "set_player_pos", params: { x: C.BEACH_RALLY.x, y: C.BEACH_RALLY.y } },

            // ── Snap all Japanese story allies into a neat east-west line ────────
            // Spacing: 140 px apart centered on BEACH_RALLY.x (1990).
            // Order (west to east): Sukesada, Retainer-L, Player, Retainer-R, Otomo, Kikuchi
            { type: "set_npc_waypoint", params: { id: "shoni_sukesada",        x: 1570, y: C.BEACH_RALLY.y } },
            { type: "set_npc_waypoint", params: { id: "samurai_retainer_left", x: 1710, y: C.BEACH_RALLY.y } },
            { type: "set_npc_waypoint", params: { id: "otomo_yoriyasu",        x: 1990, y: C.BEACH_RALLY.y } },
            { type: "set_npc_waypoint", params: { id: "samurai_retainer_right",x: 2130, y: C.BEACH_RALLY.y } },
            { type: "set_npc_waypoint", params: { id: "kikuchi_takefusa",      x: 2270, y: C.BEACH_RALLY.y } },

            // ── Lock all allies in place (halt movement) ────────────────────────
            { type: "custom_js", params: {
                code: [
                    "// Pin each story ally at their hold position — clear any pending waypoints.",
                    "var _holdIds = ['shoni_sukesada','otomo_yoriyasu','kikuchi_takefusa',",
                    "               'samurai_retainer_left','samurai_retainer_right'];",
                    "(_holdIds).forEach(function(nid) {",
                    "    var _n = (window.globalNPCs || []).find(function(n) { return n.id === nid; });",
                    "    if (_n) {",
                    "        _n.isMoving   = false;",
                    "        _n.waitTimer  = 9999;   // park the AI so it doesn't wander",
                    "        _n.holdLine   = true;   // custom flag — checked by movement clamp below",
                    "    }",
                    "});",
                    "// Also lock the player in place at the line.",
                    "if (window.player) {",
                    "    window.player.holdLine = true;",
                    "    window.player.targetX  = window.player.x;",
                    "    window.player.targetY  = window.player.y;",
                    "}"
                ].join("\n")
            }},

            _sub("Their drums grow louder. The line closes. Hold your position!", 6000, "#ffcc66"),
            _log("☠ The Yuan advance continues. Stand fast — do not break the line.", "war")
        ]
    },

    // T1.C_HOLD — Repeating clamp that keeps the hold-line freeze in effect each tick.
    //   Releases automatically when beach phase ends (phase changes to 'retreat').
    {
        id: "t1_hold_line_clamp", name: "Act I — Hold Line Position Clamp (repeating)",
        enabled: true, once: false, activatedBy: "t1_wait_for_mongols",
        conditions: [
            { type: "var_equals", params: { name: "phase", value: "beach" } },
            { type: "var_equals", params: { name: "beach_arrived", value: "1" } }
        ],
        actions: [
            { type: "custom_js", params: {
                code: [
                    "// Keep locked allies pinned; release if their holdLine flag is cleared.",
                    "var _holdIds = ['shoni_sukesada','otomo_yoriyasu','kikuchi_takefusa',",
                    "               'samurai_retainer_left','samurai_retainer_right'];",
                    "(_holdIds).forEach(function(nid) {",
                    "    var _n = (window.globalNPCs || []).find(function(n) { return n.id === nid; });",
                    "    if (_n && _n.holdLine) {",
                    "        _n.isMoving  = false;",
                    "        _n.waitTimer = 9999;",
                    "    }",
                    "});",
                    "// Player clamp: prevent wandering from hold position.",
                    "if (window.player && window.player.holdLine) {",
                    "    window.player.targetX = window.player.x;",
                    "    window.player.targetY = window.player.y;",
                    "}"
                ].join("\n")
            }}
        ]
    },

    // T1.D — Close-quarters dialogue as the Mongol line closes in.
    //         Changed from npc_at_waypoint(mongol_wave_4) to a 20-second timer
    //         so the skirmish fires reliably even if the central wave NPC is
    //         killed before reaching its march target.
    {
        id: "t1_beach_skirmish", name: "Act I — Skirmish on the Sand",
        enabled: true, once: true, activatedBy: "t1_wait_for_mongols",
        conditions: [
            { type: "custom_js", params: {
                code: [
                    "if (!ctx.firedById['t1_wait_for_mongols']) return false;",
                    "if (typeof window.__hakata_skirm_t0 === 'undefined') {",
                    "    window.__hakata_skirm_t0 = ctx.elapsedSec; return false;",
                    "}",
                    "return (ctx.elapsedSec - window.__hakata_skirm_t0) >= 20;"
                ].join("\n")
            }}
        ],
actions: [
_dlg([
    {
        side: "right",
        name: "Shoni Sukesada",
        color: "#c2185b",
        text:
            "Men of Kyushu, the enemy advances upon our shore. There is no retreat that preserves honor. Only steadfastness remains.\n\n" +
 
            "Samurai, stand foremost and meet them eye to eye. Farmers and militia, support the line behind them. Do not act alone, for disorder brings death.\n\n" +
 
            "If you live, you live with honor. If you die, you die remembered. But if you flee, your name is erased. Hold fast, and let the shore of Hakata bear witness."
    }
])
]
    },

    // T1.E — Beach holds for 1 minute then the line breaks — historical outcome.
    //
    //   v3.1: Condition changed from player_troops_below to a hard 60-second
    //   timer from when the Mongols land (t1_mongols_landing).  This matches the
    //   user request: "hold the beach line trigger is after 1 minute then next
    //   trigger to move south to Mizuki saying we can't hold them."
    //
    //   activatedBy is now t1_mongols_landing (not t1_beach_skirmish) so the
    //   60-second clock starts the moment the fleet arrives, not 20s later.
    {
        id: "t1_beach_defeat", name: "Act I — The Line Breaks (1-minute hold)",
        enabled: true, once: true, activatedBy: "t1_mongols_landing",
        conditions: [
            { type: "var_equals", params: { name: "beach_arrived", value: "1" } },
            { type: "custom_js",  params: {
                code: [
                    "// 60-second clock starts when Mongols first land.",
                    "if (!ctx.firedById['t1_mongols_landing']) return false;",
                    "if (typeof window.__hakata_hold_t0 === 'undefined') {",
                    "    window.__hakata_hold_t0 = ctx.elapsedSec; return false;",
                    "}",
                    "return (ctx.elapsedSec - window.__hakata_hold_t0) >= 60;"
                ].join("\n")
            }}
        ],
        actions: [
            _dlg([
                { side: "right", name: "Shoni Sukesada", color: "#c2185b",
                  text: "Their waves — they DO NOT STOP! We cut one column down and " +
                        "two more step over the bodies. We have been holding this sand " +
                        "for an hour and still they come from the north!" },
                { side: "left", name: "You", color: "#ffffff",
                  text: "There is no end to them, Sukesada-dono. For every man we " +
                        "kill, three more appear on the water line!" },
                { side: "right", name: "Shoni Sukesada", color: "#c2185b",
                  text: "Their second wave is forming on our left — we CANNOT hold! " +
                        "Sound the retreat! Fall back to Mizuki! TO MIZUKI!" },
                { side: "left", name: "You", color: "#ffffff",
                  text: "Sukesada-dono — you must come with us!" },
                { side: "right", name: "Shoni Sukesada", color: "#c2185b",
                  text: "I will buy you the road. GO. Tell Tokimune the bay is lost — This is a shameful display. "   }
            ]),
            _log("💔 The beach line breaks after a full hour. Sukesada covers the retreat.", "war"),
            { type: "story_quest_complete", params: { id: "sq_hold_line" } },
            { type: "fade_out",  params: { ms: 1200, color: "#000000" } },
            { type: "show_title", params: {
                title: "RETREAT", subtitle: "Mizuki Fortress — three hours later", ms: 3500
            }},
            // Block parle before teleport so NPCs at Mizuki can't immediately
            // open the parle panel the instant the player materialises next to them.
            // Lifted automatically after 5 seconds via setTimeout.
            { type: "custom_js", params: {
                code: [
                    "window.__hakata_parleLocked = true;",
                    "if (window.inParleMode) {",
                    "    window.inParleMode = false;",
                    "    var _pp = document.getElementById('parle-panel');",
                    "    if (_pp) _pp.style.display = 'none';",
                    "}",
                    "setTimeout(function() {",
                    "    window.__hakata_parleLocked = false;",
                    "    console.log('[HakataBay] Parle lock lifted after Mizuki teleport.');",
                    "}, 5000);"
                ].join("\n")
            }},
            // ── PRE-TELEPORT SAFETY: exit battle / city if still active ──────────
            // Guards against the glitch where the player is still in battleMode or
            // cityMode when the Mizuki teleport fires, leaving them stuck in the
            // wrong canvas/state at the new position.
            { type: "custom_js", params: {
                code: [
                    "// Auto-exit battle if still in battleMode before teleporting to Mizuki.",
                    "if (typeof inBattleMode !== 'undefined' && inBattleMode) {",
                    "    console.log('[HakataBay] Pre-teleport: force-exiting battle mode.');",
                    "    try {",
                    "        if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle &&",
                    "            typeof concludeSiegeBattlefield === 'function') {",
                    "            concludeSiegeBattlefield(window.player);",
                    "        } else if (typeof leaveBattlefield === 'function') {",
                    "            leaveBattlefield(window.player);",
                    "        } else {",
                    "            // Fallback: manually clear the flags if the functions aren't available.",
                    "            window.inBattleMode = false;",
                    "            if (typeof inSiegeBattle !== 'undefined') window.inSiegeBattle = false;",
                    "        }",
                    "    } catch(e) {",
                    "        console.warn('[HakataBay] leaveBattlefield threw, clearing flags manually:', e);",
                    "        window.inBattleMode = false;",
                    "        if (typeof inSiegeBattle !== 'undefined') window.inSiegeBattle = false;",
                    "    }",
                    "}",
                    "// Auto-exit city if still in cityMode before teleporting to Mizuki.",
                    "if (typeof inCityMode !== 'undefined' && inCityMode) {",
                    "    console.log('[HakataBay] Pre-teleport: force-exiting city mode.');",
                    "    try {",
                    "        if (typeof leaveCity === 'function') {",
                    "            leaveCity(window.player);",
                    "        } else {",
                    "            window.inCityMode = false;",
                    "        }",
                    "    } catch(e) {",
                    "        console.warn('[HakataBay] leaveCity threw, clearing flag manually:', e);",
                    "        window.inCityMode = false;",
                    "    }",
                    "}"
                ].join("\n")
            }},
            { type: "set_player_pos", params: { x: C.MIZUKI_RALLY.x, y: C.MIZUKI_RALLY.y } }
        ].concat(_defenderDespawnActions())
         .concat(_mongolDespawnActions())
         .concat([
            { type: "set_player_stats", params: {
                troops: T.mizukiSurvivors,
                hp:     T.survivorHp,
                food:   T.survivorFood
            }},
            { type: "custom_js", params: {
                code: [
                    "// Clear all reinforcement Mongols when the beach phase ends.",
                    "if (window.globalNPCs) {",
                    "    window.globalNPCs = window.globalNPCs.filter(function(n) {",
                    "        return !n.id || !n.id.startsWith('mongol_reinf_');",
                    "    });",
                    "}",
                    "// Reset reinforcement clock so it can't re-trigger.",
                    "window.__hakata_reinf_last = Infinity;",
                    "// Release all holdLine locks so NPCs and player can move again.",
                    "var _holdIds = ['shoni_sukesada','otomo_yoriyasu','kikuchi_takefusa',",
                    "               'samurai_retainer_left','samurai_retainer_right'];",
                    "(_holdIds).forEach(function(nid) {",
                    "    var _n = (window.globalNPCs || []).find(function(n) { return n.id === nid; });",
                    "    if (_n) { _n.holdLine = false; _n.waitTimer = 0; }",
                    "});",
                    "if (window.player) { window.player.holdLine = false; }",
                    "// Shuffle and trim player roster to " + T.mizukiSurvivors + " survivors.",
                    "if (Array.isArray(player.roster) && player.roster.length > " + T.mizukiSurvivors + ") {",
                    "    for (var i = player.roster.length - 1; i > 0; i--) {",
                    "        var j = Math.floor(Math.random() * (i + 1));",
                    "        var t = player.roster[i]; player.roster[i] = player.roster[j]; player.roster[j] = t;",
                    "    }",
                    "    player.roster.length = " + T.mizukiSurvivors + ";",
                    "}",
                    "player.troops = " + T.mizukiSurvivors + ";",
                    "console.log('[HakataBay] Survivors at Mizuki:', player.troops);"
                ].join("\n")
            }},
            { type: "fade_in", params: { ms: 1400, color: "#000000" } },
            { type: "set_var", params: { name: "phase", value: "retreat" } },
            // Waypoint: march south to Mizuki
            { type: "story_quest_set", params: {
                id:          "sq_retreat_mizuki",
                title:       "Fall back to Mizuki",
                description: "The beach is lost. Rally at Mizuki Fortress.",
                x:           C.MIZUKI_RALLY.x,
                y:           C.MIZUKI_RALLY.y,
                radius:      RAD.cityTrigger
            }}
         ])
    },

    // T1.F — ENDLESS MONGOL REINFORCEMENTS
    //
    //   Fires repeatedly (once: false) while phase === "beach".
    //   Every time it evaluates true, it spawns one fresh Mongol NPC directly
    //   into globalNPCs at a random north-entry position, marching south toward
    //   Mizuki.  A rate-limiter (8-second cooldown) and a hard cap of 10 living
    //   enemies on screen prevent flooding.
    //
    //   Stops automatically when phase changes to "retreat" (first condition
    //   becomes false) or when the player reaches Mizuki (same).
    //   t1_beach_defeat clears all reinforcement NPCs and sets the cap to
    //   Infinity so nothing more can spawn.
    {
        id: "t1_mongol_reinforcements", name: "Act I — Endless Mongol Reinforcements",
        enabled: true, once: false, activatedBy: "t1_mongols_landing",
        conditions: [
            // Only while the beach phase is active
            { type: "var_equals", params: { name: "phase", value: "beach" } },
            { type: "custom_js",  params: {
                code: [
                    "// Rate-limit: one spawn attempt every 8 seconds.",
                    "if (!window.__hakata_reinf_last) window.__hakata_reinf_last = 0;",
                    "if (ctx.elapsedSec - window.__hakata_reinf_last < 8) return false;",
                    "// Hard cap: max " + CONFIG.mongol.maxOnScreen + " living enemy NPCs on screen at once.",
                    "var _alive = (window.globalNPCs || []).filter(function(n) {",
                    "    return n.faction === '" + FAC.ENEMY + "' && n.hp > 0;",
                    "}).length;",
                    "if (_alive >= " + CONFIG.mongol.maxOnScreen + ") return false;",
                    "window.__hakata_reinf_last = ctx.elapsedSec;",
                    "return true;"
                ].join("\n")
            }}
        ],
        actions: [
            { type: "custom_js", params: {
                code: [
                    "// Spawn one Mongol soldier at a random north-entry point, marching south.",
                    "var _SPOS = " + JSON.stringify(CONFIG.mongol.reinforcementSpawns) + ";",
                    "var _NAMES = ['Mongol Vanguard', 'Yuan Bannerman', 'Yuan Forward Corps'];",
                    "var _sp   = _SPOS[Math.floor(Math.random() * _SPOS.length)];",
                    "var _nm   = _NAMES[Math.floor(Math.random() * _NAMES.length)];",
                    "// Build a small but varied Mongol roster",
                    "var _troops = 8 + Math.floor(Math.random() * 12);",
                    "var _roster = [];",
                    "for (var _i = 0; _i < Math.round(_troops * 0.5); _i++) _roster.push({ type: 'Shielded Infantry', exp: 2 });",
                    "for (var _i = 0; _i < Math.round(_troops * 0.3); _i++) _roster.push({ type: 'Archer', exp: 2 });",
                    "for (var _i = 0; _i < Math.round(_troops * 0.1); _i++) _roster.push({ type: 'Firelance', exp: 2 });",
                    "for (var _i = 0; _i < Math.round(_troops * 0.1); _i++) _roster.push({ type: 'Spearman', exp: 2 });",
                    "while (_roster.length < _troops) _roster.push({ type: 'Shielded Infantry', exp: 2 });",
                    "_roster.length = _troops;",
                    "// Resolve faction color safely (FACTIONS may be populated after install)",
                    "var _yuanColor = (window.FACTIONS && window.FACTIONS['" + FAC.ENEMY + "'] && window.FACTIONS['" + FAC.ENEMY + "'].color) || '#1976d2';",
                    "if (!window.globalNPCs) window.globalNPCs = [];",
                    "var _nid = 'mongol_reinf_' + Date.now() + '_' + Math.floor(Math.random() * 9999);",
                    "window.globalNPCs.push({",
                    "    id:           _nid,",
                    "    name:         _nm,",
                    "    faction:      '" + FAC.ENEMY + "',",
                    "    color:        _yuanColor,",
                    "    x:            _sp.x + (Math.random() - 0.5) * 80,",
                    "    y:            _sp.y,",
                    "    targetX:      " + CONFIG.mongol.reinforcementTarget.x + ",",
                    "    targetY:      " + CONFIG.mongol.reinforcementTarget.y + ",",
                    "    role:         'Military',",
                    "    count:        _troops,",
                    "    roster:       _roster,",
                    "    hp:           200 + Math.floor(Math.random() * 60),",
                    "    maxHealth:    260,",
                    "    attack:       17 + Math.floor(Math.random() * 5),",
                    "    defense:      14,",
                    "    armor:        12,",
                    "    gold:         0,",
                    "    food:         80,",
                    "    cargo:        {},",
                    "    size:         24,",
                    "    speed:        0.5,",
                    "    isMoving:     true,",
                    "    anim:         0,",
                    "    waitTimer:    0,",
                    "    decisionTimer: 0,",
                    "    battlingTimer: 0,",
                    "    battleTarget:  null,",
                    "    originCity:    null,",
                    "    targetCity:    null,",
                    "    isImportant:   false,",
                    "    portraitUrl:   'art/story1/Mongol_Infantry1.jpg'",
                    "});",
                    "var _total = (window.globalNPCs || []).filter(function(n) {",
                    "    return n.faction === '" + FAC.ENEMY + "' && n.hp > 0;",
                    "}).length;",
                    "console.log('[HakataBay] Reinforcement spawned:', _nm, 'at', _sp.x, _sp.y,",
                    "    '| Enemies on screen:', _total);"
                ].join("\n")
            }}
        ]
    },


    // ══════════════════════════════════════════════════════════════════════════
    // ACT II — RETREAT & SUPPLY QUEST
    //
    //   v3.0: Militia was already recruited in Act 0, so Act II contains only
    //   the Soharayama food/supply quest.
    //
    //   t2_mizuki_arrival — player reaches Mizuki → Hojo's briefing (food only)
    //   t2_food_complete  — player visits Soharayama → food obtained, phase→fort
    // ══════════════════════════════════════════════════════════════════════════

    // T2.0 — Hojo's briefing at Mizuki: food quest (militia already done).
{
    id: "t2_mizuki_arrival", name: "Act II — Audience at Mizuki",
    enabled: true, once: true, activatedBy: "t1_beach_defeat",
    conditions: [
        { type: "player_at_city", params: { cityName: "Mizuki", radius: RAD.cityTrigger } },
        { type: "var_equals",     params: { name: "phase", value: "retreat" } }
    ],
    actions: [
        _dlg([
            { side: "right", name: "Hojo Tokimune", color: "#c2185b",
              text: "So. The bay is gone." },
            { side: "left", name: "You", color: "#ffffff",
              text: "Sukesada-dono held the rear. I have some men left to defend the fortress. " +
                    "The militia fought well — better than I had any right to expect." },
            { side: "right", name: "Hojo Tokimune", color: "#c2185b",
              text: "Then we remember them. But memory does not hold walls — " +
                    "rice does. These earthworks were raised six hundred years ago. " +
                    "They will see their first siege. We must stock them." },
            { side: "right", name: "Hojo Tokimune", color: "#c2185b",
              text: "One errand before the Yuan find us. Dazaifu's storehouses " +
                    "still stand East of here. Ride there. Bring back " +
                    "everything that keeps through a long siege." },
            { side: "left", name: "You", color: "#ffffff",
              text: "And then?" },
            { side: "right", name: "Hojo Tokimune", color: "#c2185b",
              text: "Then we hold these walls, and we pray. The kami have never " +
                    "abandoned these islands. I am not ready to believe today is " +
                    "the first time." }
        ]),
        { type: "set_var",   params: { name: "phase",      value: "quests" } },
        { type: "set_var",   params: { name: "quest_food", value: "1" } },
        { type: "story_quest_set", params: {
            id:          "sq_resupply_dazaifu",
            title:       "Retrieve supplies from Dazaifu",
            description: "Ride east to the Dazaifu granaries and bring back everything " +
                         "that can keep through a long siege.",
            x:           C.DAZAIFU.x,
            y:           C.DAZAIFU.y,
            radius:      RAD.cityTrigger
        }},
        _sub("Quest: Retrieve supplies from Dazaifu (East).", 8000, "#f5d76e"),
        _log("📜 Quest received: Resupply from Dazaifu.")
    ]
},

// T2.1 — Food quest: visit Dazaifu.
{
    id: "t2_food_complete", name: "Act II — Granaries of Dazaifu",
    enabled: true, once: true, activatedBy: "t2_mizuki_arrival",
    conditions: [
        { type: "player_at_city", params: { cityName: "Dazaifu", radius: RAD.cityTrigger } },
        { type: "var_equals",     params: { name: "quest_food", value: "1" } }
    ],
    actions: [
        _dlg([
            { side: "right", name: "Granary Steward", color: "#8d6e63",
              portrait: "art/story1/Jap_Farmer.jpg",
              text: "The shogun's seal! By the Mountain — it is true then. " +
                    "The Mongols have come." },
            { side: "right", name: "Granary Steward", color: "#8d6e63",
              portrait: "art/story1/Jap_Farmer.jpg",
              text: "Take what you need, commander. Take everything. Better the " +
                    "rice feeds your men than feeds the horde." },
            { side: "left", name: "You", color: "#ffffff",
              text: "Three carts. We will see them safely to Mizuki." }
        ], { letterbox: false }),
        { type: "set_player_stats", params: { food: 600, gold: 450 } },
        _log("📦 Dazaifu granaries: +500 food, +150 gold loaded."),
        { type: "set_var", params: { name: "quest_food", value: "2" } },
        { type: "story_quest_complete", params: { id: "sq_resupply_dazaifu" } },
        { type: "set_var", params: { name: "phase",      value: "fort" } },
        _sub("Supplies secured. Return to Mizuki and make your stand.", 7000, "#8bc34a"),
        _log("✅ Resupply complete. Return to Mizuki.", "peace")
    ]
},

    // ══════════════════════════════════════════════════════════════════════════
    // ACT III — THE TYPHOON (unchanged from v2.x)
    // ══════════════════════════════════════════════════════════════════════════

    // T3.0 — Player returns to Mizuki reinforced. Yuan advance announced.
    {
        id: "t3_return_to_mizuki", name: "Act III — The Yuan March Inland",
        enabled: true, once: true, activatedBy: "t2_food_complete",
        conditions: [
            { type: "player_at_city", params: { cityName: "Mizuki", radius: RAD.cityTrigger } },
            { type: "var_equals",     params: { name: "phase",      value: "fort" } }
        ],
        actions: [
            _dlg([
                { side: "right", name: "Hojo Tokimune", color: "#c2185b",
                  text: "Thank you this will be very helpfuk. They will likely be outside our walls by morning." },
                { side: "right", name: "Hojo Tokimune", color: "#c2185b",
                  text: "I have sent every messenger we have to Kyoto. I have offered " +
                        "every prayer at the bay shrine. I have nothing left to do but " +
                        "wait at this wall." },
                { side: "left", name: "You", color: "#ffffff",
                  text: "Then we wait, my lord. Together." }
            ]),
            { type: "spawn_important_npc", params: { id: "mongol_wave_0" } },
            { type: "set_npc_waypoint",    params: {
                id: "mongol_wave_0", x: C.YUAN_ADVANCE.x, y: C.YUAN_ADVANCE.y
            }},
            _sub("The Yuan host will likely approach Mizuki soon. Hold the walls.", 2000, "#ff5252")
        ]
    },
// T3.1 — The Mongol camp stirs.
{
    id: "t3_wind_rises", name: "Act III — Uneasy Counsel",
    enabled: true, once: true, activatedBy: "t3_return_to_mizuki",
    conditions: [
        { type: "custom_js", params: {
            code: [
                "if (!ctx.firedById['t3_return_to_mizuki']) return false;",
                "if (typeof window.__hakata_wind_t0 === 'undefined') {",
                "    window.__hakata_wind_t0 = ctx.elapsedSec; return false;",
                "}",
                "return (ctx.elapsedSec - window.__hakata_wind_t0) >= " + TIM.windRisesAfterReturn + ";"
            ].join("\n")
        }}
    ],
    actions: [
        _sub("Beyond the walls, the Mongol camp stirs with argument.", 2000, "#a8d8ea"),
        _log("⚔ The Yuan commanders debate their next move after consolidating the landing and wounded."),
        { type: "set_var", params: { name: "storm_started", value: "1" } }
    ]
},

// T3.2 — The Mongol decision.
{
    id: "t3_kamikaze", name: "Act III — The Mongol Decision",
    enabled: true, once: true, activatedBy: "t3_wind_rises",
    conditions: [
        { type: "var_equals", params: { name: "storm_started", value: "1" } },
        { type: "custom_js", params: {
            code: [
                "if (typeof window.__hakata_storm_t0 === 'undefined') {",
                "    if (ctx.vars.storm_started == 1) window.__hakata_storm_t0 = ctx.elapsedSec;",
                "    return false;",
                "}",
                "return (ctx.elapsedSec - window.__hakata_storm_t0) >= " + TIM.stormAfterWind + ";"
            ].join("\n")
        }}
    ],
    actions: [
        { type: "fade_flash", params: { color: "#a8d8ea", ms: 350 } },
        _dlg([
 
{ side: "left", name: "Narrator", color: "#d4b886",
  text: "In the Mongol camp, the commanders bent over their maps and argued in low voices, the discussion tightening into a sharp dispute over whether this coastal hold was worth another day of blood." },

{ side: "right", name: "Liu Fuheng", color: "#1976d2",
  text: "Mizuki is not the objective. It is a stone on the road. We are wasting strength here while the true prize lies beyond these hills." },

{ side: "right", name: "Hinto", color: "#5c6bc0",
  text: "A stone? It is a fortified gate between us and their heartland. If we ignore it, we march with an enemy at our back." },

{ side: "right", name: "Liu Fuheng", color: "#1976d2",
  text: "And if we stay, we bleed out before we ever see their capital. The ships are already strained, the men shaken, and now the general is struck down." },

{ side: "right", name: "Kim Bang-gyeong", color: "#7b1fa2",
  text: "You speak as if retreat is strategy. The Khan did not send us across the sea to circle irrelevant walls." },

{ side: "right", name: "Liu Fuheng", color: "#1976d2",
  text: "Nor did he send us to die outside a minor fortress while the core of their rule remains untouched. We bypass, we advance, we force them to break where it matters." },

{ side: "right", name: "Hinto", color: "#5c6bc0",
  text: "Bypass? Leave an armed enemy at our rear and hope the road stays open? That is not war, that is exposure." },

{ side: "right", name: "Liu Fuheng", color: "#1976d2",
  text: "Then propose an alternative that does not end with half the army buried in these sands before we ever reach their capital." },

{ side: "right", name: "Kim Bang-gyeong", color: "#7b1fa2",
  text: "We take Mizuki properly. We secure the flank, then move in order. The capital will not fall to a force afraid of a gatehouse." },

{ side: "right", name: "Liu Fuheng", color: "#1976d2",
  text: "And how many days for 'properly'? How many die before your 'order' reaches their throne? We are already losing momentum." },

{ side: "right", name: "Hinto", color: "#5c6bc0",
  text: "Momentum is nothing without security. Even grass burns faster when the wind shifts." },

{ side: "right", name: "Liu Fuheng", color: "#1976d2",
  text: "Then you admit it is a question of speed versus certainty. I choose speed. The capital decides the war, not this coastline." },

{ side: "right", name: "Hinto", color: "#5c6bc0",
  text: "And I choose not to march an army into the unknown with a bleeding rear and an unfinished siege." },

{ side: "left", name: "Narrator", color: "#d4b886",
  text: "The argument hardened. Voices rose, then cut off again as maps were slammed flat and re-read. No consensus came easily, only the growing weight of urgency pressing both sides toward a decision neither fully trusted." }

        ]),
        { type: "fade_flash", params: { color: "#ffffff", ms: 250 } },
        { type: "show_title", params: {
            title: "THE MONGOLS RETREAT", subtitle: "It is the will of the Kami!", ms: 4500
        }},
        _dlg([
 
            { side: "right", name: "Liu Fuheng", color: "#1976d2",
              text: "Gather the survivors and the wounded. The tide has destroyed our fleet, and there is no honor in feeding more men to this shore. We will be back..." }
        
        ])
    ]
},

// T3.3 — Mongols withdraw.
{
    id: "t3_mongol_retreat", name: "The Host Withdraws",
    enabled: true, once: true, activatedBy: "t3_kamikaze",
    conditions: [
        { type: "trigger_fired", params: { id: "t3_kamikaze" } }
    ],
    actions: [
        { type: "set_npc_waypoint", params: {
            id: "mongol_wave_0", x: C.YUAN_RETREAT.x, y: C.YUAN_RETREAT.y
        }},
        _sub("The Yuan left Japan for now.", 8000, "#8bc34a"),
        _log("🏯 The Yuan withdraw from the Hakata.", "peace")
    ]
},

    // T3.4 — Victory.
    {
        id: "wl_victory", name: "Victory — The Empire Holds",
        enabled: true, once: true, activatedBy: "t3_mongol_retreat",
        conditions: [
            { type: "custom_js", params: {
                code: [
                    "if (!ctx.firedById['t3_mongol_retreat']) return false;",
                    "if (typeof window.__hakata_victory_t0 === 'undefined') {",
                    "    window.__hakata_victory_t0 = ctx.elapsedSec; return false;",
                    "}",
                    "return (ctx.elapsedSec - window.__hakata_victory_t0) >= " + TIM.victoryAfterRetreat + ";"
                ].join("\n")
            }}
        ],
       actions: [
			_dlg([
				{ side: "left", name: "Messenger", color: "#d4b886",
				  text: "My lord, grant ear to a thing most strange. A black wind fell upon the bay before dawn, and the sea rose as though stirred by wrath from the heavens." },
				{ side: "left", name: "Messenger", color: "#d4b886",
				  text: "Many of the enemy ships were driven upon the rocks and split apart. Some foundered at anchor, others struck one another in the press, and the waves cast men and timbers alike upon the shore." },
				{ side: "left", name: "Messenger", color: "#d4b886",
				  text: "Those who tried to ride out the storm near the mouth of the bay were carried astray by the surge. The tide itself seemed to turn against them, and the great ships could not hold their place." },
				{ side: "left", name: "Messenger", color: "#d4b886",
				  text: "Our men gathered at the beaches and the narrow roads, and when any of the foe tried to come ashore again, they were met, enclosed, and cut off from easy escape." },
				{ side: "left", name: "Messenger", color: "#d4b886",
				  text: "We surrounded the men who were driven back toward the landings, my lord. There was shouting in the dark, and no order remained among them. Many cast away their weapons and prayed to gods that did not answer." },
				{ side: "left", name: "Messenger", color: "#d4b886",
				  text: "From Hakozaki to the outer road, the sea and the storm did more than our spears could have done in many days. The enemy line broke, and their banners were scattered like leaves in rain." },
				{ side: "right", name: "Hojo Tokimune", color: "#c2185b",
				  text: "So the gods have seen fit to judge this war." },
				{ side: "left", name: "You", color: "#ffffff",
				  text: "We are not the ones who broke them, my lord. The kami sent wind and wave upon the invaders, and our men only held the shore where they could." },
				{ side: "right", name: "Hojo Tokimune", color: "#c2185b",
				  text: "Then let the court hear it plainly. We shall send word to Kamakura that Kyushu was defended by brave men, and by the mercy of the Buddhas, the kami, and Hachiman-dai-bosatsu." },
				{ side: "right", name: "Hojo Tokimune", color: "#c2185b",
				  text: "We will make offerings at once. Burn incense, hang prayers at the shrines, and thank the divine powers that spared these islands from the foreign host." },
				{ side: "right", name: "Hojo Tokimune", color: "#c2185b",
				  text: "And we will raise stronger walls around this bay, so that when the foe returns, they will find men standing in stone, not fields left bare to the sea." },
				{ side: "left", name: "Narrator", color: "#d4b886",
				  text: "The first invasion ended beneath storm and darkness. Seven years later, in 1281, the foe would return, and again the sea would rise against them. In the telling of later ages, men would remember these wind-borne victories as kamikaze, the divine wind that shielded the realm." }
			]),
			{ type: "win_scenario", params: {
				title:    "Victory!",
				subtitle: "By the grace of the kami, Kyushu was spared."
			}}
		]
    },


    // ══════════════════════════════════════════════════════════════════════════
    // LOSE CONDITIONS
    // ══════════════════════════════════════════════════════════════════════════

    {
        id: "wl_player_death", name: "Defeat — Commander Slain",
        enabled: true, once: true, activatedBy: null,
        conditions: [
            { type: "player_hp_below_pct", params: { pct: 1 } }
        ],
        actions: [
            { type: "lose_scenario", params: {
                title:    "Defeat",
                subtitle: "The commander has fallen. Kyushu is left undefended."
            }}
        ]
    },

    {
        id: "wl_faction_collapse", name: "Defeat — Kyushu Falls",
        enabled: true, once: true, activatedBy: null,
        conditions: [
            { type: "faction_eliminated", params: { faction: FAC.PLAYER } }
        ],
        actions: [
            { type: "lose_scenario", params: {
                title:    "Defeat",
                subtitle: "Kyushu has fallen. The empire of heaven ends at the surf."
            }}
        ]
    },

    {
        id: "wl_timeout", name: "Defeat — Time Ran Out",
        enabled: false,
        once: true, activatedBy: null,
        conditions: [
            { type: "timer_elapsed", params: { seconds: 1800 } },
            { type: "var_equals",    params: { name: "phase", value: "fort" } }
        ],
        actions: [
            { type: "lose_scenario", params: {
                title:    "Defeat",
                subtitle: "The Yuan reached the inner provinces before you could rally."
            }}
        ]
    }

]; // end TRIGGERS


// ─── WIN/LOSE SUMMARY ────────────────────────────────────────────────────────
var WIN_LOSE = {
    winRules:  [{ type: "trigger_chain_complete", id: "wl_victory" }],
    loseRules: [{ type: "player_dead" }, { type: "all_player_cities_lost" }],
    victoryTitle:    "Victory!",
    victorySubtitle: "The wind defended Kyushu where men could not.",
    defeatTitle:     "Defeat",
    defeatSubtitle:  "The commander has fallen on the coast of Kyushu."
};

// ─── DATA BUNDLE ─────────────────────────────────────────────────────────────
var DATA = {
    meta: {
        name:         "Defenders of Hakata Bay",
        author:       "Hakata Bay Scenario v3.3",
        description:  "Bun'ei 1274 — Rally the coastal militia at Imazu, then defend " +
                      "Hakata Bay against the first Mongol invasion of Japan. " +
                      "v3.3: Dazaifu granary city (east of Mizuki), " +
                      "hold-line freeze, Mongols spawn at map center ±5%, debate dialogue fixed.",
        importedFrom: "story1_revised_v3_3"
    },
    // ── PRE-INIT NPC SPAWN BANS (v3.1) ──────────────────────────────────────
    // Applied by scenario_update._applyToLiveEngine() BEFORE initializeNPCs()
    // runs, so the ban is in effect from the very first frame.  This prevents
    // Commerce, Patrol, Civilian, and Military NPCs from being procedurally
    // generated at all during Scenario 1 — the desperate beach defence happens
    // over ~2 days; civilians fled or are holding the shore, and the NPC budget
    // is reserved entirely for scripted story units.
    // Yuan Dynasty Coalition is also banned here; the only valid Yuan units are
    // those spawned by the t1_mongols_landing trigger via spawn_important_npc.
    startingNpcBans: {
        factions: ["Yuan Dynasty Coalition"],
        roles:    ["Commerce", "Patrol", "Civilian", "Military"]
    },
    playerSetup:   PLAYER_SETUP,
    importantNpcs: IMPORTANT_NPCS,
    storyIntro:    STORY_INTRO,
    scenarioVars:  SCENARIO_VARS,
    winLose:       WIN_LOSE,
    timeline:      [],
    triggers:      TRIGGERS
};


// ─── BINDING RESOLVER ────────────────────────────────────────────────────────
function _resolveBindings(scenario) {
    var log = function() {
        if (CONFIG.debug) console.log.apply(console, ["[HakataBay/resolver]"].concat(Array.prototype.slice.call(arguments)));
    };

    var factionNames  = Object.keys(scenario.factions || {});
    var playerFaction = FAC.PLAYER;
    var enemyFaction  = FAC.ENEMY;

    if (!factionNames.includes(playerFaction)) {
        var pf = factionNames.find(function(n) {
            return n.toLowerCase().includes("kamakura") || n.toLowerCase().includes("japan") || n.toLowerCase().includes("player");
        }) || factionNames.find(function(n) { return n !== "Bandits"; }) || playerFaction;
        log("PLAYER faction remapped to:", pf);
        playerFaction = pf;
    }
    if (!factionNames.includes(enemyFaction)) {
        var ef = factionNames.find(function(n) {
            return n.toLowerCase().includes("yuan") || n.toLowerCase().includes("mongol") || n.toLowerCase().includes("invader");
        }) || factionNames.filter(function(n) { return n !== playerFaction && n !== "Bandits"; })[0] || enemyFaction;
        log("ENEMY faction remapped to:", ef);
        enemyFaction = ef;
    }

    var fRemap = {};
    fRemap[FAC.PLAYER] = playerFaction;
    fRemap[FAC.ENEMY]  = enemyFaction;

    DATA.triggers.forEach(function(tr) {
        (tr.actions || []).forEach(function(a) {
            var p = a.params || {};
            ["faction","a","b"].forEach(function(k) {
                if (typeof p[k] === "string" && fRemap[p[k]]) p[k] = fRemap[p[k]];
            });
        });
        (tr.conditions || []).forEach(function(c) {
            var p = c.params || {};
            if (typeof p.faction === "string" && fRemap[p.faction]) p.faction = fRemap[p.faction];
        });
    });
    DATA.importantNpcs.forEach(function(n) {
        if (fRemap[n.faction]) n.faction = fRemap[n.faction];
    });
    if (DATA.playerSetup) {
        if (fRemap[DATA.playerSetup.faction]) DATA.playerSetup.faction = fRemap[DATA.playerSetup.faction];
        if (Array.isArray(DATA.playerSetup.enemies)) {
            DATA.playerSetup.enemies = DATA.playerSetup.enemies.map(function(e) { return fRemap[e] || e; });
        }
    }

    var cities    = scenario.cities || [];
    var cityRemap = {};
    [CONFIG.cities.HOME, CONFIG.cities.FORTRESS, CONFIG.cities.SUPPLY, CONFIG.cities.GRANARY].concat(CONFIG.cities.VILLAGES)
        .filter(Boolean).forEach(function(name) {
            if (!cities.find(function(c) { return c.name === name; })) {
                var fuzzy = cities.find(function(c) { return c.name && c.name.toLowerCase().includes(name.toLowerCase()); });
                if (fuzzy) { cityRemap[name] = fuzzy.name; log("City remap:", name, "→", fuzzy.name); }
            }
        });

    if (Object.keys(cityRemap).length) {
        DATA.triggers.forEach(function(tr) {
            (tr.actions || []).concat(tr.conditions || []).forEach(function(item) {
                var p = item.params || {};
                if (typeof p.cityName === "string" && cityRemap[p.cityName]) p.cityName = cityRemap[p.cityName];
            });
        });
    }

    log("Binding resolution complete. Player:", playerFaction, "| Enemy:", enemyFaction);
}


// ─── INSTALLER ───────────────────────────────────────────────────────────────
function install() {
    if (!window.__campaignStory1Active) {
        console.log("[HakataBay] Skipping install — not in Story 1 campaign mode.",
                    "(Set window.__campaignStory1Active=true and call install() to force.)");
        return false;
    }

    if (!window.__activeScenario) {
        console.warn("[HakataBay] No active scenario — will retry via auto-install poll.");
        return false;
    }
    var s = window.__activeScenario;

    _preloadStoryArt();
    _resolveBindings(s);

    // ── Re-stamp NPC spawn ban before ScenarioTriggers.start() ───────────────
    // The module-load stamp (top of file) covers the earliest possible window.
    // This re-stamp covers the case where install() runs AFTER initializeNPCs()
    // has already fired and cleared any previous bans (e.g. scenario hot-reload).
    // Belt-and-suspenders: the rolling tick in updateNPCs() must NEVER see an
    // empty __npcSpawnBans during Story 1.
    (function _reStampSpawnBan() {
        if (!window.__npcSpawnBans) {
            window.__npcSpawnBans = { factions: [], roles: [] };
        }
        var _b = window.__npcSpawnBans;
        ["Commerce", "Patrol", "Civilian", "Military"].forEach(function(r) {
            if (!_b.roles.includes(r)) _b.roles.push(r);
        });
        ["Yuan Dynasty Coalition"].forEach(function(f) {
            if (!_b.factions.includes(f)) _b.factions.push(f);
        });
        console.log("[HakataBay] NPC spawn ban re-stamped in install():",
                    "roles=" + _b.roles.join(","),
                    "| factions=" + _b.factions.join(","));
    })();

    if (!Array.isArray(s.triggers)) s.triggers = [];
    var existingIds = new Set(s.triggers.map(function(t) { return t.id; }));
    DATA.triggers.forEach(function(t) { if (!existingIds.has(t.id)) s.triggers.push(t); });

    if (!Array.isArray(s.importantNpcs)) s.importantNpcs = [];
    var npcIds = new Set(s.importantNpcs.map(function(n) { return n.id; }));
    DATA.importantNpcs.forEach(function(n) { if (!npcIds.has(n.id)) s.importantNpcs.push(n); });

    s.playerSetup  = Object.assign({}, s.playerSetup || {}, DATA.playerSetup);

    if (!s.storyIntro || !s.storyIntro.enabled) s.storyIntro = DATA.storyIntro;
    s.scenarioVars = Object.assign({}, DATA.scenarioVars, s.scenarioVars || {});
    if (!s.winLose || (!(s.winLose.winRules || []).length && !(s.winLose.loseRules || []).length)) {
        s.winLose = DATA.winLose;
    }

    if (window.ScenarioTriggers && typeof window.ScenarioTriggers.start === "function") {
        // ── CRITICAL: the engine may have already called ScenarioTriggers.start()
        // on the bare scenario (before this install ran), which marks __introPlayed=true
        // and causes _maybePlayStoryIntro to early-return, skipping the full cinematic.
        // We reset the flag here so our storyIntro actually plays this time.
        s.__introPlayed = false;
        window.ScenarioTriggers.start(s);
        console.log("[HakataBay] ✅ Installed (campaign mode) and trigger runtime restarted.");
    } else {
        console.warn("[HakataBay] ScenarioTriggers not found — triggers spliced but runtime not restarted.");
    }

    // Re-apply player setup at staggered intervals to defeat late sandbox overwrites.
    var _reapplyAttempts = 0;
    function _reapplyPlayer() {
        if (!window.player || !DATA.playerSetup) return;
        var ps = DATA.playerSetup;

        var posMatch = (Math.abs((window.player.x || 0) - ps.x) < 4) &&
                       (Math.abs((window.player.y || 0) - ps.y) < 4);
        var troopMatch = (window.player.troops === ps.troops) ||
                         (Array.isArray(window.player.roster) &&
                          window.player.roster.length === ps.troops);
        if (posMatch && troopMatch && _reapplyAttempts > 0) {
            console.log("[HakataBay] Player setup verified ✓ stable at attempt", _reapplyAttempts);
            return;
        }

        window.player.x         = ps.x;
        window.player.y         = ps.y;
        window.player.gold      = ps.gold;
        window.player.food      = ps.food;
        window.player.hp        = ps.hp;
        window.player.maxHealth = ps.maxHealth;
        if (typeof ps.faction === "string" && ps.faction) {
            window.player.faction = ps.faction;
        }
        if (Array.isArray(ps.enemies)) {
            window.player.enemies = ps.enemies.slice();
        }

        if (Array.isArray(ps.roster)) {
            window.player.roster = ps.roster.map(function(r) {
                return (typeof r === "string") ? { type: r, exp: 1 } :
                       (r && r.type)           ? { type: r.type, exp: r.exp || 1 } :
                                                 { type: "Militia", exp: 1 };
            });
            window.player.troops = window.player.roster.length;
        } else if (typeof ps.roster === "string") {
            var arr = ps.roster.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
            window.player.roster = arr.map(function(t) { return { type: t, exp: 1 }; });
            window.player.troops = arr.length;
        } else if (typeof ps.troops === "number") {
            window.player.troops = ps.troops;
        }

        _reapplyAttempts++;
        console.log("[HakataBay] Player re-applied (attempt " + _reapplyAttempts + "):",
                    "pos=(" + window.player.x + "," + window.player.y + ")",
                    "troops=" + window.player.troops,
                    "faction=" + window.player.faction);
    }

    setTimeout(_reapplyPlayer,  250);
    setTimeout(_reapplyPlayer,  800);
    setTimeout(_reapplyPlayer, 1600);
    setTimeout(_reapplyPlayer, 3200);

    return true;
}


// ── Load-progress helper ─────────────────────────────────────────────────────
// Returns 0-100 if detectable, or -1 if unknown (caller treats -1 as "ready").
function _getLoadPct() {
    if (typeof window.__mapLoadProgress === "number") return window.__mapLoadProgress;
    if (typeof window.DoGLoadProgress   === "number") return window.DoGLoadProgress;
    if (typeof window.__loadProgress    === "number") return window.__loadProgress;
    var el = document.getElementById("loading");
    if (el) {
        if (el.style.display === "none") return 100;
        var m = el.textContent.match(/(\d+(?:\.\d+)?)\s*%/);
        if (m) return parseFloat(m[1]);
    }
    return -1;
}

// ─── AUTO-INSTALL ─────────────────────────────────────────────────────────────
(function _autoInstall() {
    if (window.__hakataBayDisableAutoInstall) return;
    var lastSeen = null, attempts = 0;
    var screened = false;  // true once we've applied the initial black fade

    var interval = setInterval(function() {
        if (++attempts > 75) { clearInterval(interval); return; }
        if (!window.__campaignStory1Active) return;

        // ── Earliest possible black-screen ────────────────────────────────────
        // v3.2: Instead of a 2-3s pure black screen, we:
        //   1. Apply a FAST 500ms fade-to-black (not instant) once ≥95% loaded.
        //   2. Show a "phase 2" loading overlay (spinner + text) immediately so
        //      the player sees feedback rather than dead black. The cinematic's
        //      own fadeIn lifts this once the story intro starts playing.
        if (!screened && window.StoryPresentation &&
                typeof window.StoryPresentation.fadeOut === "function") {
            var _pct = _getLoadPct();
            if (_pct < 0 || _pct >= 95) {
                screened = true;
                // 500ms fade — short enough to not feel stuck, long enough to be smooth.
                window.StoryPresentation.fadeOut(500, "#000000");
                // Phase-2 overlay: show a subtle loading hint so the black screen
                // isn't dead silence. It auto-hides once _maybePlayStoryIntro fires.
                if (typeof window.StoryPresentation.showPhase2Loading === "function") {
                    window.StoryPresentation.showPhase2Loading();
                }
                console.log("[HakataBay] Screen fading (500ms) at " + (_pct < 0 ? "unknown" : _pct) + "% load.");
            }
            // else: not at 95% yet — will retry next poll cycle
        }

        var cur = window.__activeScenario;
        if (!cur || cur === lastSeen) return;
        lastSeen = cur;
        if ((cur.cities || []).length < CONFIG.minRequiredCities) {
            console.log("[HakataBay] Scenario has only", (cur.cities||[]).length,
                        "cities (need ≥", CONFIG.minRequiredCities, "). Skipping auto-install.",
                        "Call window.HakataBayScenario.install() to force.");
            return;
        }
        console.log("[HakataBay] Detected campaign scenario with", (cur.cities||[]).length,
                    "cities. Auto-installing…");
        setTimeout(install, 1200);
        clearInterval(interval);
    }, 800);
})();


// ─── PUBLIC API ───────────────────────────────────────────────────────────────
return {
    install:  install,
    DATA:     DATA,
    CONFIG:   CONFIG,
    VERSION:  "3.4.0"
};

})();

console.log("[HakataBay] hakata_bay_scenario.js v" + window.HakataBayScenario.VERSION + " loaded — awaiting scenario boot.");