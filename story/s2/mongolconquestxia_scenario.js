// ============================================================================
// SUZHOU 1226 — The Hexi Corridor
// suzhou_scenario.js  v2.0
// ============================================================================
//
// Campaign: Dawn of Gunpowder — Story 2
//
// ──────────────────────────────────────────────────────────────────────────
// HISTORICAL CONTEXT
// ──────────────────────────────────────────────────────────────────────────
//
// By late 1225, Genghis Khan had assembled approximately 180,000 troops for
// a campaign of systematic punishment against Western Xia (the Tangut Empire),
// who had refused to provide troops for the Khwarezm campaign and whose
// emperor had reportedly called Genghis's armies "weak." This was the final
// campaign. It was designed to destroy a state, not merely defeat it.
//
// The advance began from the north. Khara-Khoto (Heishui Commandary), the
// northernmost Tangut fortress, was taken first. Then the army split:
//
//   • Subutai's western wing pushed through the Hexi Corridor from the
//     northwest — taking Shazhou, Guazhou, and Changle in succession before
//     converging on Suzhou from the west.
//
//   • Genghis's main force drove south toward Suzhou from Khara-Khoto,
//     following the Heishui River into the Corridor.
//
// Western Xia's military commander Asha could not intercept them. The relief
// march from the capital Yinchuan would have covered 500 kilometres of open
// desert — an exhausting, untenable route for a large force. He did not ride.
//
// Suzhou fell after approximately five weeks of siege.
//
// After Suzhou: Genghis moved east to Ganzhou (five months), then to Wuwei,
// then crossed the Helan Shan to lay siege to Lingwu. In the Battle of the
// Yellow River, a 300,000-strong Tangut counterattack was destroyed on the
// frozen river. In 1227, Yinchuan fell. In August 1227, Genghis Khan died
// in the Qilian Mountains — cause unknown. The Western Xia state was
// effectively annihilated.
//
// ──────────────────────────────────────────────────────────────────────────
// SCENARIO DESIGN
// ──────────────────────────────────────────────────────────────────────────
//
// The player is a Tangut officer holding Suzhou's garrison. The scenario
// spans the five-week siege. The player knows:
//   — Shazhou, Guazhou, Changle have already fallen (Subutai)
//   — Khara-Khoto has fallen (main force)
//   — Asha will not ride from Yinchuan
//   — There is no relief
//
// Four acts mirror the historical sequence inside the walls:
//   Act 0 — The corridor closes. Wall tour, first news of the western cities.
//   Act 1 — First demand. Refusal. The ring forms. Refugees.
//   Act 2 — The long middle: engineer's seam, night sortie, second demand.
//   Act 3 — The thunder tube, council debate, final choice.
//
// ──────────────────────────────────────────────────────────────────────────
// ACTIVATION
//   window.__campaignStory2Active = true;
//   window.SuzhouScenario.install();
// ──────────────────────────────────────────────────────────────────────────

window.SuzhouScenario = (function () {
"use strict";

// ── MODULE-LOAD NPC SPAWN BAN STAMP ─────────────────────────────────────────
// Stamped onto window.__npcSpawnBans the moment this script parses.
// Procedural Commerce, Patrol, Civilian, Military NPCs must not appear
// during a five-week desert siege. Mongol Empire NPCs are reserved entirely
// for scripted spawn_important_npc calls.
(function _stampInitialBan() {
    if (!window.__npcSpawnBans) window.__npcSpawnBans = { factions: [], roles: [] };
    var b = window.__npcSpawnBans;
    ["Commerce","Patrol","Civilian","Military"].forEach(function(r) {
        if (!b.roles.includes(r)) b.roles.push(r);
    });
    ["Mongol Empire"].forEach(function(f) {
        if (!b.factions.includes(f)) b.factions.push(f);
    });
    console.log("[Suzhou] NPC spawn ban stamped at module load.",
                "roles=" + b.roles.join(","), "| factions=" + b.factions.join(","));
})();


// ============================================================================
// CONFIG
// ============================================================================
// All tunables in one place. Edit this block freely; nothing below END CONFIG
// needs to change for normal adjustments.
// ============================================================================

const CONFIG = {

    // ── MAP ──────────────────────────────────────────────────────────────────
    // Desert and dune biome for now; player will refine the map separately.
    // World = 4000 × 2992 px (250×187 tiles at 16 px/tile).
    map: {
        tilesX:   250,
        tilesY:   187,
        tileSize:  16
    },

    // ── CITY NAME BINDINGS ───────────────────────────────────────────────────
    // Canonical names used in scenario doc. _resolveBindings() fuzzy-matches
    // them against whatever the player named their cities in the editor.
    cities: {
        HOME:      "Suzhou",          // The Hexi Corridor oasis city — the siege
        EAST_POST: "Ganzhou",         // Eastern city (post-scenario, not playable)
        WEST_1:    "Guazhou",         // Already fallen to Subutai — contextual only
        WEST_2:    "Shazhou",         // Already fallen — contextual only
        NORTH_POST:"Khara-Khoto",     // Already fallen — contextual only
        VILLAGES:  ["Suzhou", "Ganzhou"]  // min 2 for install check
    },

    // ── FACTION BINDINGS ─────────────────────────────────────────────────────
    factions: {
        PLAYER: "Western Xia",
        ENEMY:  "Mongol Empire"
    },

    // ── PIXEL COORDINATES ────────────────────────────────────────────────────
    // Laid out to mirror the Hexi Corridor geography from the campaign map:
    // Suzhou occupies the center. Approaches come from the northwest (Subutai)
    // and northeast (main force via Heishui River). The Qilian Mountains form
    // an impassable wall to the south. Yinchuan is far to the east.
    //
    // Compass orientation:
    //   West  (x≈200–900)   — Hexi Corridor, Subutai's approach
    //   North (y≈200–800)   — Heishui River valley, main force approach
    //   East  (x≈2800–3800) — road to Ganzhou, road to Yinchuan
    //   South (y≈2400–2900) — Qilian Mountains foot (no pass, no relief)
    coords: {
        // ── City center ──────────────────────────────────────────────────────
        SUZHOU:          { x: 2000, y: 1500 },

        // ── Player start: garrison commander's post near the governor's hall ──
        PLAYER_START:    { x: 2000, y: 1500 },
        GOVERNOR_HALL:   { x: 2000, y: 1500 },

        // ── Wall positions ───────────────────────────────────────────────────
        WEST_GATE:       { x: 1680, y: 1500 },   // Gate facing the Hexi approach
        EAST_GATE:       { x: 2320, y: 1500 },   // Gate facing Ganzhou road
        NORTH_GATE:      { x: 2000, y: 1260 },   // Gate facing Heishui River
        SOUTH_WALL:      { x: 2000, y: 1740 },   // Wall facing Qilian Mountains
        EAST_WALL_SEAM:  { x: 2280, y: 1480 },   // Engineer Wei's weak mortar seam
        WALL_TOWER:      { x: 2060, y: 1360 },   // North tower — thunder tube mount

        // ── Road lookout points ──────────────────────────────────────────────
        // Players walk here in Act 0 to "see" the approaching columns.
        WEST_LOOKOUT:    { x: 1500, y: 1500 },   // See Subutai's dust on the horizon
        NORTH_LOOKOUT:   { x: 2000, y: 1100 },   // See the main force coming south
        EAST_ROAD_WATCH: { x: 2600, y: 1500 },   // Empty road to Ganzhou / Yinchuan

        // ── Mongol encirclement camps ────────────────────────────────────────
        // Four camps at compass points. Spawn when the ring closes.
        MONGOL_CAMP_W:   { x:  950, y: 1500 },   // Subutai's western wing remnant
        MONGOL_CAMP_NW:  { x: 1300, y:  900 },   // Main-force vanguard, northwest
        MONGOL_CAMP_N:   { x: 2000, y:  700 },   // Cuts the Heishui River road
        MONGOL_CAMP_E:   { x: 3000, y: 1500 },   // Closes the Ganzhou road / relief

        // ── Sortie target ────────────────────────────────────────────────────
        // Night strike at the western camp — nearest, smallest.
        SORTIE_TARGET:   { x: 1400, y: 1500 },

        // ── Final parley choice positions ─────────────────────────────────────
        SURRENDER_GATE:  { x: 1640, y: 1500 },   // Walk here → yield, open gate
        FORTRESS_HOLD:   { x: 2000, y: 1500 },   // Walk here → refuse, fight on

        // ── Off-map reference points (for dialogue context) ──────────────────
        YINCHUAN_DIR:    { x: 3900, y: 1200 },   // Direction of capital (off-screen)
        QILIAN_SOUTH:    { x: 2000, y: 2800 }    // The mountain wall — no pass
    },

    // ── MONGOL COMMANDERS ────────────────────────────────────────────────────
    // Historical principal officers present in this phase of the campaign.
    // Not all are identified by name in the sources — "Noyan" is the generic
    // Mongolian title for a field officer commanding a tumen (~10,000).
    //
    // Two sub-wings:
    //   Main force (indices 0–2): from Khara-Khoto, down the Heishui valley
    //   Subutai's wing (indices 3–4): from the west via Shazhou/Guazhou
    //   Messenger (index 5): in and out for parley scenes
    mongol: {

        names: [
            "Mongol Noyan",           // 0 — Field commander, main force, NW camp
            "Mongol Tümen Commander", // 1 — North camp, cuts Heishui road
            "Mongol Eastern Screen",  // 2 — East camp, closes Ganzhou road
            "Subutai's Wing",         // 3 — Western camp, Hexi approach
            "Mongol Vanguard",        // 4 — Forward scouts, visible from walls day 1
            "Mongol Messenger"        // 5 — Emissary for parley scenes
        ],

        troopsPerWave: [70, 55, 50, 65, 20, 10],

        // ── Spawn positions ──────────────────────────────────────────────────
        landingPositions: [
            { x: 1300, y:  900 },    // 0 — Main force NW
            { x: 2000, y:  700 },    // 1 — North, Heishui road
            { x: 3000, y: 1500 },    // 2 — East, Ganzhou road
            { x:  950, y: 1500 },    // 3 — West, Subutai's wing
            { x: 1600, y: 1100 },    // 4 — Vanguard scouts
            { x: 1680, y: 1500 }     // 5 — Messenger at west gate
        ],

        // ── March targets (press toward city walls) ──────────────────────────
        marchTargets: [
            { x: 1500, y: 1200 },    // 0 — Closes on NW wall
            { x: 2000, y:  950 },    // 1 — Closes on north gate
            { x: 2700, y: 1500 },    // 2 — Closes on east gate
            { x: 1200, y: 1500 },    // 3 — Closes on west gate
            { x: 1680, y: 1300 },    // 4 — Vanguard probes north wall
            { x: 1720, y: 1500 }     // 5 — Messenger at gate
        ],

        // ── Mongol roster, 1226 ──────────────────────────────────────────────
        // Pre-Yuan Mongol composition: heavy horse-archer dominance.
        // The Tangut firelance / thunder tube is more advanced than anything
        // the Mongols have at this point in the western campaign.
        rosterPct: {
            "Horse Archer":        35,
            "Heavy Horse Archer":  20,
            "Archer":              15,
            "Spearman":            10,
            "Shielded Infantry":   10,
            "Light Two Handed":     7,
            "Militia":              3
        },

        keshigPerNpc:  3,      // Elite Keshig bodyguards per named commander

        // ── Reinforcement system (sortie and late-siege skirmishes) ──────────
        maxOnScreen: 8,
        reinforcementSpawns: [
            { x:  950, y: 1500 },
            { x: 1200, y: 1300 },
            { x: 1200, y: 1700 }
        ],
        reinforcementTarget: { x: 1700, y: 1500 },

        stats: {
            hp:      265,
            attack:   20,
            defense:  15,
            armor:    13,
            gold:    100,
            food:    250
        },

        commanderBonus: { hp: 1.25, attack: 1.22, troops: 1.30 }
    },

    // ── TANGUT GARRISON DEFENDERS ────────────────────────────────────────────
    // Three named captains hold the four walls. The Western Xia army was known
    // for its "Iron Hawks" — disciplined heavy infantry archers. Their cavalry
    // wing was smaller than the Mongols' but still present.
    defenders: [
        {
            id:     "captain_yuan",
            name:   "Captain Yuan",
            desc:   "West gate commander — first to face Subutai's column",
            troops:  35,
            x: 1680, y: 1500,   tx: 1680, ty: 1500,
            hp: 225, attack: 17, defense: 14, armor: 13,
            gold: 80, food: 150
        },
        {
            id:     "captain_tan",
            name:   "Captain Tan",
            desc:   "East wall — watches the Ganzhou road for relief that never comes",
            troops:  30,
            x: 2300, y: 1500,   tx: 2300, ty: 1500,
            hp: 215, attack: 16, defense: 14, armor: 12,
            gold: 70, food: 130
        },
        {
            id:     "captain_bao",
            name:   "Captain Bao",
            desc:   "North gate — watches the Heishui valley road",
            troops:  30,
            x: 2000, y: 1260,   tx: 2000, ty: 1260,
            hp: 210, attack: 16, defense: 13, armor: 12,
            gold: 70, food: 130
        }
    ],

    // ── TANGUT NONCOMBATANTS ─────────────────────────────────────────────────
    governor: {
        id: "governor_li", name: "Tangut Governor",
        x: 2010, y: 1505,
        troops: 10, hp: 180, attack: 12, defense: 12, armor: 10,
        gold: 200, food: 120
    },
    scribe: {
        id: "city_scribe", name: "City Scribe",
        x: 1990, y: 1510,
        troops: 5, hp: 140, attack: 8, defense: 10, armor: 8,
        gold: 50, food: 50
    },
    engineer: {
        id: "engineer_wei", name: "Engineer Wei",
        x: 2280, y: 1480, targetX: 2280, targetY: 1480,
        troops: 6, hp: 155, attack: 10, defense: 11, armor: 9,
        gold: 60, food: 60
    },

    // ── TANGUT ROSTER ────────────────────────────────────────────────────────
    // Iron Hawks tradition: heavy on archers, solid spear line, modest cavalry.
    tangutRosterPct: {
        "Spearman":           30,
        "Archer":             25,
        "Glaiveman":          15,
        "Light Two Handed":   10,
        "Heavy Two Handed":    5,
        "Horse Archer":        5,
        "Militia":            10
    },

    // ── PLAYER STARTING STATS ────────────────────────────────────────────────
    player: {
        troops:    30,
        gold:      350,
        food:      500,
        hp:        220,
        maxHealth: 220
    },

    // ── TIMING (all in seconds) ──────────────────────────────────────────────
    // Game-time compression: five historical weeks ≈ 7–8 minutes of real play.
    timing: {
        ringClosesAfterRefusal:  8,     // sec between refusal and camp spawns
        corridorCutDelay:       50,     // sec → village road cut, refugees
        engineerReportDelay:    80,     // sec → engineer: seam is moving
        sortieOrderDelay:       20,     // sec after engineer report → sortie offer
        secondParleyDelay:     160,     // sec after sortie return → day 21 demand
        thunderTubeDelay:       55,     // sec after 2nd parley → cannon scene
        councilDebateDelay:     70,     // sec after cannon → council, day 34
        finalParleyDelay:       30,     // sec after council → final emissary
        choiceMinDelay:          4      // sec before resist choice can register
    },

    // ── THRESHOLDS ───────────────────────────────────────────────────────────
    thresholds: {
        sortieRetreatTroops: 20,
        finalGarrisonHp:    160
    },

    // ── TRIGGER RADII (px) ───────────────────────────────────────────────────
    radii: {
        wallContact:    190,
        cityContact:    220,
        sortieZone:     310,
        choiceRadius:   150
    },

    // ── DIALOGUE DEFAULTS ────────────────────────────────────────────────────
    dialogue: {
        pauseGame:     true,
        letterbox:     true,
        typewriterCps:  0
    },

    debug:             true,
    minRequiredCities: 2
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
            pauseGame:     (opts.pauseGame     !== undefined) ? opts.pauseGame     : D.pauseGame,
            typewriterCps: (opts.typewriterCps !== undefined) ? opts.typewriterCps : D.typewriterCps,
            lines: lines
        }
    };
}
function _sub(text, ms, color) {
    return { type:"show_subtitle", params:{ text:text, ms:ms||7000, color:color||"#f5d76e" } };
}
function _log(text, tag) {
    return { type:"log_message", params:{ text:text, tag:tag||"general" } };
}


// ─── STORY 2 ART CATALOG ────────────────────────────────────────────────────
// Story 2 uses /art/story2/ for cinematics. Portraits fall back to Story 1
// Mongol officer art until dedicated Tangut portraits are produced.
var ART_PATHS = {
    hexi_corridor:   "art/story2/suzhou_art1.jpg",   // The Hexi Corridor from above
    ring_closes:     "art/story2/suzhou_art2.jpg",   // Four camps at compass points
    walls_at_dusk:   "art/story2/suzhou_art3.jpg",   // Suzhou walls, day 13
    thunder_tube:    "art/story2/suzhou_art4.jpg",   // The proto-cannon firing
    open_gate:       "art/story2/suzhou_art5.jpg",   // Gates open, riders enter
    heishui_river:   "art/story2/suzhou_art6.jpg",   // Heishui valley, army descending

    portraits: {
        "You":                       "art/story1/highrank_samurai.jpg",
        "Narrator":                  "art/story1/old_man.jpg",
        "Tangut Governor":           "art/story1/highrank_samurai.jpg",
        "Tangut Commander":          "art/story1/highrank_samurai.jpg",
        "City Scribe":               "art/story1/Jap_Farmer.jpg",
        "Engineer Wei":              "art/story1/Jap_Farmer.jpg",
        "Captain Yuan":              "art/story1/lowrank_samurai.jpg",
        "Captain Tan":               "art/story1/lowrank_samurai.jpg",
        "Captain Bao":               "art/story1/lowrank_samurai.jpg",
        "Tangut Soldier":            "art/story1/japinfantry.jpg",
        "Garrison Soldier":          "art/story1/japinfantry.jpg",
        "Villager Woman":            "art/story1/Jap_Farmer.jpg",
        "Refugee Elder":             "art/story1/Jap_Farmer.jpg",
        "Caravan Merchant":          "art/story1/Jap_Farmer.jpg",
        // Mongol characters
        "Mongol Noyan":              "art/story1/Mongol_Officer1.jpg",
        "Mongol Messenger":          "art/story1/Mongol_Officer2.jpg",
        "Mongol Vanguard":           "art/story1/Mongol_Infantry1.jpg",
        "Mongol Tümen Commander":    "art/story1/Mongol_Officer1.jpg",
        "Mongol Eastern Screen":     "art/story1/Mongol_Officer2.jpg",
        "Subutai's Wing":            "art/story1/Mongol_Officer1.jpg",
        "Mongol Rider":              "art/story1/Mongol_Infantry2.jpg"
    }
};

function _preloadStoryArt() {
    if (!window.StoryPresentation ||
        typeof window.StoryPresentation.registerPortraitsBulk !== "function") {
        setTimeout(_preloadStoryArt, 200);
        return;
    }
    window.StoryPresentation.registerPortraitsBulk(ART_PATHS.portraits);
    console.log("[Suzhou] Story 2 portraits registered:",
                Object.keys(ART_PATHS.portraits).length);
}


// ─── NPC BUILDERS ───────────────────────────────────────────────────────────

function _buildMongolNpcs() {
    var m = CONFIG.mongol;
    return m.names.map(function(name, i) {
        var isLead = (i === 0);
        var b      = m.commanderBonus;
        var troops = isLead ? Math.round(m.troopsPerWave[i] * b.troops) : m.troopsPerWave[i];
        var stats  = m.stats;
        var keshig = [];
        for (var k = 0; k < m.keshigPerNpc; k++) keshig.push("Keshig");

        return {
            id:       "mongol_wave_" + i,
            name:     name,
            faction:  CONFIG.factions.ENEMY,
            x:        m.landingPositions[i].x + (Math.random() * 80 - 40),
            y:        m.landingPositions[i].y + (Math.random() * 80 - 40),
            targetX:  m.marchTargets[i].x,
            targetY:  m.marchTargets[i].y,
            role:     "Military",
            troops:   troops,
            roster:   _buildRoster(m.rosterPct, troops, keshig),
            rosterMode: "hard",
            hp:       isLead ? Math.round(stats.hp     * b.hp)     : stats.hp,
            attack:   isLead ? Math.round(stats.attack * b.attack) : stats.attack,
            defense:  stats.defense,
            armor:    stats.armor,
            gold:     stats.gold,
            food:     stats.food,
            portraitUrl: ART_PATHS.portraits[name] || ""
        };
    });
}

function _buildDefenderNpcs() {
    return CONFIG.defenders.map(function(d) {
        return {
            id: d.id, name: d.name,
            faction: CONFIG.factions.PLAYER,
            x: d.x, y: d.y, targetX: d.tx, targetY: d.ty,
            role: "Military", troops: d.troops,
            roster: _buildRoster(CONFIG.tangutRosterPct, d.troops),
            rosterMode: "hard",
            hp: d.hp, attack: d.attack, defense: d.defense,
            armor: d.armor, gold: d.gold, food: d.food,
            portraitUrl: ART_PATHS.portraits[d.name] || ""
        };
    });
}

function _buildCivicNpcs() {
    return [CONFIG.governor, CONFIG.scribe, CONFIG.engineer].map(function(d) {
        return {
            id: d.id, name: d.name,
            faction: CONFIG.factions.PLAYER,
            x: d.x, y: d.y,
            targetX: d.targetX || d.x,
            targetY: d.targetY || d.y,
            role: "Military", troops: d.troops,
            roster: _buildRoster(CONFIG.tangutRosterPct, d.troops),
            rosterMode: "hard",
            hp: d.hp, attack: d.attack, defense: d.defense,
            armor: d.armor, gold: d.gold, food: d.food,
            portraitUrl: ART_PATHS.portraits[d.name] || ""
        };
    });
}

// ─── ACTION BATCH BUILDERS ──────────────────────────────────────────────────

function _ringSpawnActions() {
    // Spawn the four encirclement camps simultaneously (indices 0–3).
    return [0,1,2,3].map(function(i) {
        return { type:"spawn_important_npc", params:{ id:"mongol_wave_"+i } };
    });
}
function _ringWaypointActions() {
    return [0,1,2,3].map(function(i) {
        return { type:"set_npc_waypoint", params:{
            id:"mongol_wave_"+i,
            x:CONFIG.mongol.marchTargets[i].x,
            y:CONFIG.mongol.marchTargets[i].y
        }};
    });
}
function _despawnAllMongolActions() {
    return CONFIG.mongol.names.map(function(_,i) {
        return { type:"remove_important_npc", params:{ id:"mongol_wave_"+i } };
    });
}


// ─── STATIC DATA ALIASES ────────────────────────────────────────────────────

var C   = CONFIG.coords;
var T   = CONFIG.thresholds;
var TIM = CONFIG.timing;
var RAD = CONFIG.radii;
var FAC = CONFIG.factions;

// ── PLAYER SETUP ────────────────────────────────────────────────────────────
var PLAYER_SETUP = {
    x:         C.PLAYER_START.x,
    y:         C.PLAYER_START.y,
    faction:   FAC.PLAYER,
    troops:    CONFIG.player.troops,
    gold:      CONFIG.player.gold,
    food:      CONFIG.player.food,
    hp:        CONFIG.player.hp,
    maxHealth: CONFIG.player.maxHealth,
    enemies:   [FAC.ENEMY, "Bandits"],
    roster:    _buildRoster(CONFIG.tangutRosterPct, CONFIG.player.troops),
    portraitUrl: "art/story1/highrank_samurai.jpg"
};

// ── IMPORTANT NPCs ──────────────────────────────────────────────────────────
var IMPORTANT_NPCS = []
    .concat(_buildCivicNpcs())
    .concat(_buildDefenderNpcs())
    .concat(_buildMongolNpcs());


// ── STORY INTRO ─────────────────────────────────────────────────────────────
// Five-screen cinematic covering the full campaign context:
//   Screen 1 (art: Hexi Corridor) — the scale of the advance
//   Screen 2 (art swap: ring closes) — the split, Subutai's wing, why no relief
//   Screen 3–4 — what the player already knows when the scenario opens
var STORY_INTRO = {
    enabled:    true,
    fadeMs:     1400,
    fadeColor:  "#000000",
    titleCard: {
        title:    "The Hexi Corridor",
        subtitle: "Western Xia — Winter, 1226",
        ms:       4500
    },
    art:              ART_PATHS.hexi_corridor,
    art2:             ART_PATHS.ring_closes,
    art2OnLine:       3,
    art2CrossfadeMs:  1200,
    art2Caption:      "Four camps. Two armies. One road that no longer leads anywhere.",
    artMs:            4800,
    kenburns:         true,
    lines: [
        // Line 1 — the scale of the campaign
        {
            side: "left", name: "Narrator", color: "#d4b886",
            text: "In 1225, Genghis Khan assembled approximately 180,000 troops " +
                  "and turned them against Western Xia — the Tangut Empire that had " +
                  "refused him soldiers for the Khwarezm campaign. This was not a " +
                  "raid. It was designed to end a state."
        },
        // Line 2 — the advance route
        {
            side: "left", name: "Narrator", color: "#d4b886",
            text: "The army came from the north. Khara-Khoto fell first. Then " +
                  "Genghis divided his forces. Subutai took the western corridor — " +
                  "Shazhou, Guazhou, Changle — city by city, stripping the Hexi " +
                  "Corridor from the outside in. The main force moved south along " +
                  "the Heishui River."
        },
        // Line 3 — Asha's dilemma (art swap on this line)
        {
            side: "left", name: "Narrator", color: "#d4b886",
            text: "Western Xia's commander Asha could not intercept them. " +
                  "A relief march from the capital, Yinchuan, would have crossed " +
                  "five hundred kilometres of open desert. He did not ride. " +
                  "No one was going to ride."
        },
        // Line 4 — player's situation
        {
            side: "left", name: "Narrator", color: "#d4b886",
            text: "Suzhou stands at the junction of both approaches. Subutai's " +
                  "column is a day's march to the west. The main force is three " +
                  "days north. You are the garrison commander. The governor has " +
                  "summoned the council before dawn."
        },
        // Line 5 — the scribe's opening line
        {
            side: "right", name: "City Scribe", color: "#8d6e63",
            portrait: "art/story1/Jap_Farmer.jpg",
            text: "Commander. The governor says come now. A Mongol messenger " +
                  "is on the road. He will be at the west gate before the " +
                  "second bell."
        }
    ],
    letterbox:     true,
    typewriterCps: 0,
    autoAdvance:   0
};

// ── SCENARIO VARIABLES ──────────────────────────────────────────────────────
//   phase             "council" | "walls" | "siege" | "sortie" | "thunder" | "final" | "end"
//   gates_visited     0..3  (west gate, east gate, north gate = wall tour)
//   parley_count      0..3
//   sortie_done       0 | 1
//   thunder_done      0 | 1
//   ending_chosen     "" | "surrender" | "resist"
var SCENARIO_VARS = {
    phase:          "council",
    gates_visited:  0,
    parley_count:   0,
    sortie_done:    0,
    thunder_done:   0,
    ending_chosen:  ""
};


// ============================================================================
// TRIGGERS
// ============================================================================
// t0_*  Act 0 — Council & wall tour (the corridor is already closing)
// t1_*  Act 1 — First demand. Refusal. The ring forms. Corridor cut.
// t2_*  Act 2 — Seam warning. Night sortie. Second demand.
// t3_*  Act 3 — Thunder tube. Council. Final parley. Player choice.
// wl_*  Win / Lose terminal triggers.
// ============================================================================

var TRIGGERS = [

    // ════════════════════════════════════════════════════════════════════════
    // PRE-ACT: VILLAGE RECRUIT LOCKOUT (3 min timer)
    // ════════════════════════════════════════════════════════════════════════
    {
        id: "t0_village_recruit_unlock",
        name: "Pre-Act — Village Recruit Lockout Lift (3 min)",
        enabled: true, once: true, activatedBy: null,
        conditions: [
            { type: "scenario_start", params: {} },
            { type: "timer_elapsed",  params: { seconds: 180 } }
        ],
        actions: [
            { type: "custom_js", params: {
                code: "window.__villageRecruitUnlocked=true;" +
                      "console.log('[Suzhou] Village recruit lockout lifted at 3 min.');"
            }}
        ]
    },

    // ════════════════════════════════════════════════════════════════════════
    // PRE-BOOT PURGE — sweeps stray procedural NPCs for the first 30 s.
    // ════════════════════════════════════════════════════════════════════════
    {
        id: "t0_purge_procedural_npcs",
        name: "Pre-Boot — Purge stray procedural NPCs (first 30 s)",
        enabled: true, once: false, activatedBy: null,
        conditions: [
            { type: "custom_js", params: {
                code: [
                    "if(typeof window.__sz_purge_last==='undefined') window.__sz_purge_last=0;",
                    "if(ctx.elapsedSec>30) return false;",
                    "if(ctx.elapsedSec-window.__sz_purge_last<2) return false;",
                    "window.__sz_purge_last=ctx.elapsedSec; return true;"
                ].join("\n")
            }}
        ],
        actions: [
            { type: "custom_js", params: {
                code: [
                    "var _BR=['Commerce','Patrol','Civilian','Military'];",
                    "var _SP=['governor_','city_scribe','engineer_',",
                    "         'captain_yuan','captain_tan','captain_bao',",
                    "         'mongol_wave_'];",
                    "function _isSt(n){return _SP.some(function(p){return n.id&&n.id.startsWith(p);});}",
                    "if(window.globalNPCs){",
                    " var _b=window.globalNPCs.length;",
                    " window.globalNPCs=window.globalNPCs.filter(function(n){",
                    "  if(_isSt(n)) return true;",
                    "  if(_BR.includes(n.role)) return false;",
                    "  if(n.faction==='Mongol Empire'&&!n.isImportant) return false;",
                    "  return true;",
                    " });",
                    " var _p=_b-window.globalNPCs.length;",
                    " if(_p>0) console.log('[Suzhou] Purged',_p,'stray NPC(s).');",
                    "}"
                ].join("\n")
            }}
        ]
    },

    // ════════════════════════════════════════════════════════════════════════
    // ACT 0 — THE COUNCIL & WALL TOUR
    //
    // The player is at the governor's hall when the scenario opens.
    // Three gate visits reveal the encirclement in progress:
    //   West gate  — Captain Yuan; Subutai's dust on the horizon
    //   East gate  — Captain Tan;  empty Ganzhou road, no relief
    //   North gate — Captain Bao;  the Heishui valley blocked
    // Then return to the hall. The messenger arrives.
    // ════════════════════════════════════════════════════════════════════════

    // T0.A — Scenario start: spawn civics, captains, vanguard scouts; brief.
    {
        id: "t0_briefing", name: "Act 0 — The Governor's Council",
        enabled: true, once: true, activatedBy: null,
        conditions: [ { type:"scenario_start", params:{} } ],
        actions: [
            { type:"set_relation", params:{ a:FAC.PLAYER, b:FAC.ENEMY, rel:"War" } },
            { type:"set_player_stats", params:{ gold:CONFIG.player.gold, food:CONFIG.player.food } },

            // Spawn civic NPCs at the hall
            { type:"spawn_important_npc", params:{ id:"governor_li"  } },
            { type:"spawn_important_npc", params:{ id:"city_scribe"  } },
            { type:"spawn_important_npc", params:{ id:"engineer_wei" } },

            // Spawn three wall captains at their posts
            { type:"spawn_important_npc", params:{ id:"captain_yuan" } },
            { type:"spawn_important_npc", params:{ id:"captain_tan"  } },
            { type:"spawn_important_npc", params:{ id:"captain_bao"  } },

            // Spawn Mongol vanguard scouts — visible on the horizon from the walls
            { type:"spawn_important_npc", params:{ id:"mongol_wave_4" } },
            { type:"set_npc_waypoint", params:{
                id:"mongol_wave_4", x:C.NORTH_LOOKOUT.x, y:C.NORTH_LOOKOUT.y - 150
            }},

            _sub("Suzhou — the governor's hall, before the second bell.", 6000, "#f5d76e"),

            _dlg([
                { side:"right", name:"Tangut Governor", color:"#c2185b",
                  portrait:"art/story1/highrank_samurai.jpg",
                  text:"Commander. You have seen the reports from the frontier?" },
                { side:"left", name:"You", color:"#ffffff",
                  text:"Khara-Khoto has fallen. Shazhou fell two weeks ago. " +
                       "Guazhou the week before that. Changle yesterday, if the " +
                       "rider's count was right." },
                { side:"right", name:"City Scribe", color:"#8d6e63",
                  portrait:"art/story1/Jap_Farmer.jpg",
                  text:"The rider's count was right. The western corridor is gone. " +
                       "Subutai's wing is converging on us from the Hexi road. " +
                       "The main force is coming south from the Heishui valley." },
                { side:"right", name:"Tangut Governor", color:"#c2185b",
                  portrait:"art/story1/highrank_samurai.jpg",
                  text:"And Yinchuan?" },
                { side:"right", name:"City Scribe", color:"#8d6e63",
                  portrait:"art/story1/Jap_Farmer.jpg",
                  text:"Commander Asha has not moved. The capital road is five " +
                       "hundred kilometres of desert. He cannot march a relief " +
                       "force that far without losing it before it arrives." },
                { side:"left", name:"You", color:"#ffffff",
                  text:"Then we are on our own." },
                { side:"right", name:"Tangut Governor", color:"#c2185b",
                  portrait:"art/story1/highrank_samurai.jpg",
                  text:"Walk the walls before the messenger arrives. Find Yuan, " +
                       "Tan, and Bao at their posts. I want you to see the roads " +
                       "with your own eyes." }
            ]),

            // Spawn ban re-stamp
            { type:"set_npc_spawn_ban", params:{
                factions:[CONFIG.factions.ENEMY],
                roles:   ["Commerce","Patrol","Civilian","Military"]
            }},

            { type:"set_var", params:{ name:"phase", value:"walls" } },

            // First quest marker
            { type:"story_quest_set", params:{
                id:"sq_west_gate", title:"Walk to the west gate",
                description:"Captain Yuan faces Subutai's approach. Hear his report.",
                x:C.WEST_GATE.x, y:C.WEST_GATE.y, radius:RAD.wallContact,
                noAutoComplete:true, isMain:true
            }},

            _log("📜 The governor has briefed you. Walk the three gates before the messenger arrives.", "objective"),
            _sub("Tour the walls: west gate → east gate → north gate.", 7000, "#f5d76e")
        ]
    },

    // T0.B — West gate: Captain Yuan, Subutai's dust on the horizon.
    {
        id: "t0_west_gate", name: "Act 0 — West Gate (Subutai's Approach)",
        enabled: true, once: true, activatedBy: "t0_briefing",
        conditions: [
            { type:"player_in_region", params:{ x:C.WEST_GATE.x, y:C.WEST_GATE.y, radius:RAD.wallContact } },
            { type:"var_equals", params:{ name:"phase", value:"walls" } }
        ],
        actions: [
            _dlg([
                { side:"right", name:"Captain Yuan", color:"#1e5a8c",
                  portrait:"art/story1/lowrank_samurai.jpg",
                  text:"Commander. Look west. See that dust line at the horizon? " +
                       "That is Subutai's column. It was at Changle yesterday. " +
                       "It will be here the day after tomorrow." },
                { side:"left", name:"You", color:"#ffffff",
                  text:"How many?" },
                { side:"right", name:"Captain Yuan", color:"#1e5a8c",
                  portrait:"art/story1/lowrank_samurai.jpg",
                  text:"Riders, mostly. Horse archers and a vanguard screen. " +
                       "Behind them — supply wagons, engineers, more riders. " +
                       "They are not storming. They are encircling." },
                { side:"right", name:"Captain Yuan", color:"#1e5a8c",
                  portrait:"art/story1/lowrank_samurai.jpg",
                  text:"A merchant came in this morning from the Guazhou road. " +
                       "Says the city looked intact from a distance. It was not " +
                       "sacked — it was occupied. They need the cities in the " +
                       "corridor to function for supply." },
                { side:"left", name:"You", color:"#ffffff",
                  text:"So they want Suzhou the same way." },
                { side:"right", name:"Captain Yuan", color:"#1e5a8c",
                  portrait:"art/story1/lowrank_samurai.jpg",
                  text:"They want it standing and obedient. But they will " +
                       "take it broken if they have to." }
            ], { letterbox:false }),
            { type:"increment_var", params:{ name:"gates_visited", n:1 } },
            { type:"story_quest_complete", params:{ id:"sq_west_gate" } },
            { type:"story_quest_set", params:{
                id:"sq_east_gate", title:"East gate — the Ganzhou road",
                description:"Captain Tan watches the road to Ganzhou and Yinchuan.",
                x:C.EAST_GATE.x, y:C.EAST_GATE.y, radius:RAD.wallContact,
                noAutoComplete:true, isMain:true
            }},
            _sub("East gate next — the Ganzhou road.", 5000, "#f5d76e")
        ]
    },

    // T0.C — East gate: Captain Tan, empty road.
    {
        id: "t0_east_gate", name: "Act 0 — East Gate (The Empty Road)",
        enabled: true, once: true, activatedBy: "t0_west_gate",
        conditions: [
            { type:"player_in_region", params:{ x:C.EAST_GATE.x, y:C.EAST_GATE.y, radius:RAD.wallContact } },
            { type:"var_equals", params:{ name:"phase", value:"walls" } }
        ],
        actions: [
            _dlg([
                { side:"right", name:"Captain Tan", color:"#1e5a8c",
                  portrait:"art/story1/lowrank_samurai.jpg",
                  text:"Commander. The Ganzhou road. I have stood on this gate " +
                       "for four days. Not a courier from the capital. Not a " +
                       "forward rider, not a message. Nothing." },
                { side:"left", name:"You", color:"#ffffff",
                  text:"The Mongols have a screen on the eastern road as well?" },
                { side:"right", name:"Captain Tan", color:"#1e5a8c",
                  portrait:"art/story1/lowrank_samurai.jpg",
                  text:"Not yet. The screen hasn't closed here. But it doesn't " +
                       "need to. The road from Yinchuan is five hundred " +
                       "kilometres of open desert. Commander Asha would need " +
                       "months of supply laid down before he could march it." },
                { side:"right", name:"Captain Tan", color:"#1e5a8c",
                  portrait:"art/story1/lowrank_samurai.jpg",
                  text:"He knew the Mongols were coming for a year. The supply " +
                       "was not laid. The relief was not planned. The capital is " +
                       "far away and the desert is wider than ever." },
                { side:"right", name:"Caravan Merchant", color:"#6d4c41",
                  portrait:"art/story1/Jap_Farmer.jpg",
                  text:"Commander — I rode in from Ganzhou this morning. The " +
                       "Mongol eastern screen will close that road within three " +
                       "days. You should know." },
                { side:"left", name:"You", color:"#ffffff",
                  text:"Then we have three days before we are fully surrounded." },
                { side:"right", name:"Caravan Merchant", color:"#6d4c41",
                  portrait:"art/story1/Jap_Farmer.jpg",
                  text:"Two, if their vanguard rides at night." }
            ], { letterbox:false }),
            { type:"increment_var", params:{ name:"gates_visited", n:1 } },
            { type:"story_quest_complete", params:{ id:"sq_east_gate" } },
            { type:"story_quest_set", params:{
                id:"sq_north_gate", title:"North gate — the Heishui valley",
                description:"Captain Bao watches the main force's approach from the north.",
                x:C.NORTH_GATE.x, y:C.NORTH_GATE.y, radius:RAD.wallContact,
                noAutoComplete:true, isMain:true
            }},
            _sub("North gate last — the Heishui River road.", 5000, "#f5d76e")
        ]
    },

    // T0.D — North gate: Captain Bao, the main force approaching.
    {
        id: "t0_north_gate", name: "Act 0 — North Gate (The Main Force)",
        enabled: true, once: true, activatedBy: "t0_east_gate",
        conditions: [
            { type:"player_in_region", params:{ x:C.NORTH_GATE.x, y:C.NORTH_GATE.y, radius:RAD.wallContact } },
            { type:"var_equals", params:{ name:"phase", value:"walls" } }
        ],
        actions: [
            _dlg([
                { side:"right", name:"Captain Bao", color:"#1e5a8c",
                  portrait:"art/story1/lowrank_samurai.jpg",
                  text:"Look north, commander. The scouts say the Heishui River " +
                       "valley is filled with riders two days out. That is the " +
                       "main force — Genghis Khan's column, coming straight down " +
                       "from Khara-Khoto." },
                { side:"left", name:"You", color:"#ffffff",
                  text:"Is there any pass south through the Qilian Mountains?" },
                { side:"right", name:"Captain Bao", color:"#1e5a8c",
                  portrait:"art/story1/lowrank_samurai.jpg",
                  text:"No pass worth the name. The mountains are our southern " +
                       "wall — which means they are also our trap. We cannot " +
                       "withdraw south and the relief cannot reach us from the " +
                       "north." },
                { side:"right", name:"Garrison Soldier", color:"#546e7a",
                  portrait:"art/story1/japinfantry.jpg",
                  text:"Captain — look. Their advance riders. There, at the " +
                       "bend of the valley. You can see the dust." },
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"North: the main force, three days out. West: Subutai, " +
                       "two days. East: the road closing in three days. South: " +
                       "the Qilian Mountains. The city of Suzhou is now a " +
                       "fixed point in a shrinking geometry." }
            ], { letterbox:false }),
            { type:"increment_var", params:{ name:"gates_visited", n:1 } },
            { type:"story_quest_complete", params:{ id:"sq_north_gate" } },
            // Return to hall for the messenger
            { type:"story_quest_set", params:{
                id:"sq_return_hall", title:"Return to the governor's hall",
                description:"The Mongol messenger is at the west gate. He will not wait.",
                x:C.GOVERNOR_HALL.x, y:C.GOVERNOR_HALL.y, radius:RAD.wallContact,
                noAutoComplete:true, isMain:true
            }},
            _sub("Return to the hall. The messenger has arrived.", 5500, "#f5d76e")
        ]
    },

    // T0.E — Back at the hall: the first demand is made.
    {
        id: "t0_first_demand", name: "Act 0 — The First Demand",
        enabled: true, once: true, activatedBy: "t0_north_gate",
        conditions: [
            { type:"player_in_region", params:{ x:C.GOVERNOR_HALL.x, y:C.GOVERNOR_HALL.y, radius:RAD.wallContact } },
            { type:"var_above", params:{ name:"gates_visited", n:2 } }
        ],
        actions: [
            // Spawn messenger, walk him to the hall
            { type:"spawn_important_npc", params:{ id:"mongol_wave_5" } },
            { type:"set_npc_waypoint", params:{
                id:"mongol_wave_5", x:C.GOVERNOR_HALL.x - 80, y:C.GOVERNOR_HALL.y
            }},

            _dlg([
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"The messenger is brought in under guard. He rides for " +
                       "Genghis Khan and does not trouble himself with ceremony." },
                { side:"right", name:"Mongol Messenger", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Officer2.jpg",
                  text:"I speak the words of the Great Khan. To the city of Suzhou: " +
                       "open the gates, submit your garrison, and your houses may " +
                       "remain standing. The corridor behind you already belongs " +
                       "to us. Khara-Khoto fell. Shazhou fell. Guazhou fell. " +
                       "Changle fell. You are next in a sequence, not a prize." },
                { side:"right", name:"Tangut Governor", color:"#c2185b",
                  portrait:"art/story1/highrank_samurai.jpg",
                  text:"And if we refuse?" },
                { side:"right", name:"Mongol Messenger", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Officer2.jpg",
                  text:"Then Suzhou becomes a labour that delays us. That " +
                       "enrages the khan. Cities that delay him tend not to " +
                       "survive the delay." },
                { side:"left", name:"You", color:"#ffffff",
                  text:"You ride too easily through land that is not yours." },
                { side:"right", name:"Mongol Messenger", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Officer2.jpg",
                  text:"We ride through land that no one can defend for you. " +
                       "Your commander Asha is in Yinchuan. He is not coming." },
                { side:"right", name:"Tangut Governor", color:"#c2185b",
                  portrait:"art/story1/highrank_samurai.jpg",
                  text:"Take your answer back. Suzhou does not open its gates " +
                       "to a threat." },
                { side:"right", name:"Mongol Messenger", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Officer2.jpg",
                  text:"Then it will open after hunger. There will be no second " +
                       "chance before the horses move forward." }
            ]),

            { type:"increment_var", params:{ name:"parley_count", n:1 } },
            { type:"set_var", params:{ name:"phase", value:"siege" } },
            { type:"story_quest_complete", params:{ id:"sq_return_hall" } },

            _log("🚪 First demand refused. The Mongol ring will now close.", "war"),
            _sub("The messenger rides back. The ring closes at dawn.", 7000, "#ff5252")
        ]
    },


    // ════════════════════════════════════════════════════════════════════════
    // ACT 1 — THE RING CLOSES
    //
    // Subutai's western wing and the main force northern column converge.
    // Four camps form. The eastern road is cut. Refugees arrive.
    // ════════════════════════════════════════════════════════════════════════

    // T1.A — The four encirclement camps spawn simultaneously.
    {
        id: "t1_ring_closes", name: "Act 1 — The Ring Closes (DAY 1–2)",
        enabled: true, once: true, activatedBy: "t0_first_demand",
        conditions: [
            { type:"var_equals", params:{ name:"phase", value:"siege" } },
            { type:"custom_js",  params:{ code:[
                "if(!ctx.firedById['t0_first_demand']) return false;",
                "if(typeof window.__sz_refusal_t==='undefined'){",
                " window.__sz_refusal_t=ctx.elapsedSec; return false;",
                "}",
                "return (ctx.elapsedSec-window.__sz_refusal_t)>=" + TIM.ringClosesAfterRefusal + ";"
            ].join("\n") }}
        ],
        actions: [
            // Despawn messenger — he rides back to camp
            { type:"remove_important_npc", params:{ id:"mongol_wave_5" } },

            { type:"fade_flash", params:{ color:"#ffffff", ms:350 } },

            { type:"show_art", params:{
                url:ART_PATHS.ring_closes, ms:5500, kenburns:true
            }},
            { type:"show_title", params:{
                title:    "DAY 2 — THE RING",
                subtitle: "Subutai from the west. The main force from the north. Four camps. No exit.",
                ms:       4000
            }}
        ].concat(_ringSpawnActions())
         .concat(_ringWaypointActions())
         .concat([
            { type:"allow_mongol_waves", params:{} },

            _dlg([
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"In the space of a single morning, the roads became walls. " +
                       "Subutai's column closed from the west — riders in long " +
                       "arcs, no assault, just encirclement. The main force " +
                       "screen came down from the Heishui valley and sealed " +
                       "the north. By afternoon the eastern screen Captain Tan " +
                       "had warned of reached the Ganzhou road and closed it." },
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"The Mongols did not storm. They were not there to storm. " +
                       "They were there to sit. And wait. And let the city " +
                       "understand its own loneliness." }
            ]),

            _sub("Four camps surround Suzhou. The city is encircled.", 7000, "#ff5252"),
            _log("⚔ The Mongol ring has formed. Four camps. All roads closed.", "war"),

            // Next beat: corridor cut + refugees
            { type:"story_quest_set", params:{
                id:"sq_west_gate_report", title:"Report to Captain Yuan",
                description:"A sortie from the west gate has gone badly. Yuan is at the gate.",
                x:C.WEST_GATE.x, y:C.WEST_GATE.y, radius:RAD.wallContact,
                noAutoComplete:true, isMain:true
            }}
        ])
    },

    // T1.B — Corridor cut. The militia sortie from the west gate is pinned.
    //         Refugees arrive. The Mongol noyan is briefly seen.
    {
        id: "t1_corridor_cut", name: "Act 1 — Corridor Cut / Refugees",
        enabled: true, once: true, activatedBy: "t1_ring_closes",
        conditions: [
            { type:"player_in_region", params:{ x:C.WEST_GATE.x, y:C.WEST_GATE.y, radius:RAD.wallContact } },
            { type:"custom_js",  params:{ code:[
                "if(!ctx.firedById['t1_ring_closes']) return false;",
                "if(typeof window.__sz_ring_t==='undefined'){",
                " window.__sz_ring_t=ctx.elapsedSec; return false;",
                "}",
                "return (ctx.elapsedSec-window.__sz_ring_t)>=" + TIM.corridorCutDelay + ";"
            ].join("\n") }}
        ],
        actions: [
            _dlg([
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"A small Tangut militia had gone out at dawn to escort " +
                       "refugees in from the irrigation road. The Mongols caught " +
                       "them in the open half a li from the gate." },
                { side:"right", name:"Captain Yuan", color:"#1e5a8c",
                  portrait:"art/story1/lowrank_samurai.jpg",
                  text:"Pull them in! Shut the gate! NOW!" },
                { side:"right", name:"Villager Woman", color:"#6d4c41",
                  portrait:"art/story1/Jap_Farmer.jpg",
                  text:"My son! My son is back there! He was with the militia, " +
                       "he was just behind us—" },
                { side:"right", name:"Captain Yuan", color:"#1e5a8c",
                  portrait:"art/story1/lowrank_samurai.jpg",
                  text:"We cannot go back for him. I am sorry." },
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"The gate closed. A few men stumbled back inside. " +
                       "The city had lost the road." },
                { side:"right", name:"Mongol Noyan", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Officer1.jpg",
                  text:"No heroics. Take the wells. Close the roads. " +
                       "Let the city hear its own loneliness." }
            ]),

            { type:"story_quest_complete", params:{ id:"sq_west_gate_report" } },
            _sub("The corridor is cut. The irrigation road is gone.", 7000, "#ff8a80"),
            _log("🏚 Refugees stranded. Roads closed. The wells outside are now watched.", "war"),

            { type:"story_quest_set", params:{
                id:"sq_engineer_seam", title:"Find Engineer Wei at the east wall seam",
                description:"Days pass. Wei has urgent news about the wall.",
                x:C.EAST_WALL_SEAM.x, y:C.EAST_WALL_SEAM.y, radius:RAD.wallContact,
                noAutoComplete:true, isMain:true
            }}
        ]
    },

    // ════════════════════════════════════════════════════════════════════════
    // ACT 2 — THE LONG MIDDLE
    //
    // Three beats spanning days 6–21:
    //   Day 13 — Engineer Wei's seam warning
    //   Day 14 — Night sortie (the desperate strike)
    //   Day 21 — Mongol noyan's second demand
    // ════════════════════════════════════════════════════════════════════════

    // T2.A — DAY 13: Engineer Wei's wall seam warning.
    {
        id: "t2_engineer_warning", name: "Act 2 — Day 13: The Seam",
        enabled: true, once: true, activatedBy: "t1_corridor_cut",
        conditions: [
            { type:"player_in_region", params:{ x:C.EAST_WALL_SEAM.x, y:C.EAST_WALL_SEAM.y, radius:RAD.wallContact } },
            { type:"custom_js",  params:{ code:[
                "if(!ctx.firedById['t1_corridor_cut']) return false;",
                "if(typeof window.__sz_cut_t==='undefined'){",
                " window.__sz_cut_t=ctx.elapsedSec; return false;",
                "}",
                "return (ctx.elapsedSec-window.__sz_cut_t)>=" + TIM.engineerReportDelay + ";"
            ].join("\n") }}
        ],
        actions: [
            { type:"show_title", params:{
                title:"DAY 13", subtitle:"The walls show wear. The city does not.", ms:3000
            }},

            _dlg([
                { side:"right", name:"Engineer Wei", color:"#5d4037",
                  portrait:"art/story1/Jap_Farmer.jpg",
                  text:"Commander. This seam — where the brick meets the older " +
                       "packed-earth fill underneath. See how the mortar has " +
                       "changed colour here, and here." },
                { side:"left", name:"You", color:"#ffffff",
                  text:"How serious?" },
                { side:"right", name:"Engineer Wei", color:"#5d4037",
                  portrait:"art/story1/Jap_Farmer.jpg",
                  text:"Not a breach. Not yet. But they have torsion engines " +
                       "in the northern camp. If they press this section with " +
                       "repeat strikes, the fill will shift. Then the brick " +
                       "will follow the fill. That is how walls talk." },
                { side:"right", name:"Captain Tan", color:"#1e5a8c",
                  portrait:"art/story1/lowrank_samurai.jpg",
                  text:"Can you shore it?" },
                { side:"right", name:"Engineer Wei", color:"#5d4037",
                  portrait:"art/story1/Jap_Farmer.jpg",
                  text:"With what? Prayer? Mud? More hands that have not slept " +
                       "in four days? I need two things: material and time. " +
                       "We have neither. What I can do is delay it. But I " +
                       "cannot stop it." },
                { side:"right", name:"Engineer Wei", color:"#5d4037",
                  portrait:"art/story1/Jap_Farmer.jpg",
                  text:"There is something else I have been working on. Not " +
                       "for defence. For a different kind of answer. I will " +
                       "show you when it is ready." }
            ], { letterbox:false }),

            { type:"story_quest_complete", params:{ id:"sq_engineer_seam" } },
            { type:"story_quest_set", params:{
                id:"sq_yuan_sortie", title:"Captain Yuan — west gate (night sortie)",
                description:"Yuan wants to lead a night strike on the western camp.",
                x:C.WEST_GATE.x, y:C.WEST_GATE.y, radius:RAD.wallContact,
                noAutoComplete:true, isMain:true
            }},
            _sub("Seam confirmed. Captain Yuan has a proposal.", 5500, "#f5d76e")
        ]
    },

    // T2.B — Captain Yuan briefs the night sortie at the west gate.
    {
        id: "t2_sortie_orders", name: "Act 2 — Night Sortie Orders",
        enabled: true, once: true, activatedBy: "t2_engineer_warning",
        conditions: [
            { type:"player_in_region", params:{ x:C.WEST_GATE.x, y:C.WEST_GATE.y, radius:RAD.wallContact } }
        ],
        actions: [
            _dlg([
                { side:"right", name:"Captain Yuan", color:"#1e5a8c",
                  portrait:"art/story1/lowrank_samurai.jpg",
                  text:"Tonight. Before the third watch. We take thirty men " +
                       "out the postern gate — torches, short blades, nothing " +
                       "heavy. The western camp is the closest and smallest. " +
                       "We can burn their fodder pile and be back before " +
                       "their patrol mounts." },
                { side:"left", name:"You", color:"#ffffff",
                  text:"And if their watch responds faster than we expect?" },
                { side:"right", name:"Captain Yuan", color:"#1e5a8c",
                  portrait:"art/story1/lowrank_samurai.jpg",
                  text:"Then we delay the fear by one more night. That is all " +
                       "a sortie ever was. It does not change the siege. It " +
                       "tells the men we are still capable of doing something." },
                { side:"left", name:"You", color:"#ffffff",
                  text:"Lead it. I'll be with you." },
                { side:"right", name:"Captain Yuan", color:"#1e5a8c",
                  portrait:"art/story1/lowrank_samurai.jpg",
                  text:"Good. The men need to see the commander in the dark " +
                       "as well as on the wall." }
            ], { letterbox:false }),
            { type:"set_var", params:{ name:"phase", value:"sortie" } },
            { type:"story_quest_complete", params:{ id:"sq_yuan_sortie" } },
            { type:"story_quest_set", params:{
                id:"sq_sortie_target", title:"Lead the night sortie",
                description:"Strike the western camp. Burn the fodder. Get back.",
                x:C.SORTIE_TARGET.x, y:C.SORTIE_TARGET.y, radius:RAD.sortieZone,
                isMain:true
            }},
            _sub("Lead the night sortie — strike the western camp.", 6000, "#ffcc66"),
            _log("🌙 Night sortie: lead thirty men to the western camp and back.", "objective")
        ]
    },

    // T2.C — Player reaches the sortie zone: the Noyan's reaction.
    {
        id: "t2_sortie_contact", name: "Act 2 — Sortie Contact",
        enabled: true, once: true, activatedBy: "t2_sortie_orders",
        conditions: [
            { type:"player_in_region", params:{ x:C.SORTIE_TARGET.x, y:C.SORTIE_TARGET.y, radius:RAD.sortieZone } },
            { type:"var_equals", params:{ name:"phase", value:"sortie" } }
        ],
        actions: [
            _dlg([
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"The gate creaked open in the dark. Thirty men, torches " +
                       "unlit. They moved quickly and low. For a moment, " +
                       "they had the silence." },
                { side:"right", name:"Mongol Noyan", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Officer1.jpg",
                  text:"There. They still have courage. Take note of that. " +
                       "It will make the surrender cleaner." },
                { side:"right", name:"Mongol Rider", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Infantry2.jpg",
                  text:"The patrol is closing on them, Noyan. Cut them off?" },
                { side:"right", name:"Mongol Noyan", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Officer1.jpg",
                  text:"Let them strike the fodder pile. Let them feel they " +
                       "did something. Let the survivors carry that home. " +
                       "A city with one victory story is easier to take than " +
                       "a city without hope." }
            ]),
            // Spawn patrol units for combat
            { type:"custom_js", params:{ code:[
                "var _pts=[",
                " {x:"+(C.SORTIE_TARGET.x-90)+",y:"+(C.SORTIE_TARGET.y-70)+"},",
                " {x:"+(C.SORTIE_TARGET.x+90)+",y:"+(C.SORTIE_TARGET.y-50)+"},",
                " {x:"+(C.SORTIE_TARGET.x+60)+",y:"+(C.SORTIE_TARGET.y+100)+"}",
                "];",
                "_pts.forEach(function(p){",
                " try{window.spawnNPC&&window.spawnNPC({",
                "  x:p.x,y:p.y,faction:'Mongol Empire',role:'Military',",
                "  troops:12,hp:190,attack:17,defense:14,armor:12,isImportant:false",
                " });}catch(e){}",
                "});"
            ].join("\n") }},
            _sub("Mongol patrol responds. Strike and withdraw before they can mount.", 7000, "#ff8a80")
        ]
    },

    // T2.D — Return to west gate after sortie.
    {
        id: "t2_sortie_return", name: "Act 2 — Return from Sortie",
        enabled: true, once: true, activatedBy: "t2_sortie_contact",
        conditions: [
            { type:"player_in_region", params:{ x:C.WEST_GATE.x, y:C.WEST_GATE.y, radius:RAD.wallContact } },
            { type:"custom_js",  params:{ code:[
                "if(!ctx.firedById['t2_sortie_contact']) return false;",
                "if(typeof window.__sz_sortie_t==='undefined'){",
                " window.__sz_sortie_t=ctx.elapsedSec; return false;",
                "}",
                "return (ctx.elapsedSec-window.__sz_sortie_t)>=14;"
            ].join("\n") }}
        ],
        actions: [
            _dlg([
                { side:"right", name:"Captain Yuan", color:"#1e5a8c",
                  portrait:"art/story1/lowrank_samurai.jpg",
                  text:"We burned the fodder pile. We took a wagon. We left " +
                       "men in the dust." },
                { side:"left", name:"You", color:"#ffffff",
                  text:"How many?" },
                { side:"right", name:"Captain Yuan", color:"#1e5a8c",
                  portrait:"art/story1/lowrank_samurai.jpg",
                  text:"Enough to feel. Not enough to write down without shame." },
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"The sortie failed. But it had delayed the fear by one " +
                       "more night. The men were quieter coming back in. " +
                       "Quieter, and more serious." }
            ], { letterbox:false }),
            { type:"set_var", params:{ name:"sortie_done", value:"1" } },
            { type:"set_var", params:{ name:"phase",       value:"siege" } },
            { type:"story_quest_complete", params:{ id:"sq_sortie_target" } },
            _sub("The sortie has returned. The siege continues.", 5000, "#aaaaaa"),
            _log("🌙 Sortie returned. Casualties taken. The walls are unchanged.", "war")
        ]
    },

    // T2.E — DAY 21: The second parley. Noyan delivers the demand in person.
    {
        id: "t2_second_parley", name: "Act 2 — Day 21: The Second Demand",
        enabled: true, once: true, activatedBy: "t2_sortie_return",
        conditions: [
            { type:"var_equals", params:{ name:"sortie_done", value:"1" } },
            { type:"custom_js",  params:{ code:[
                "if(!ctx.firedById['t2_sortie_return']) return false;",
                "if(typeof window.__sz_sret_t==='undefined'){",
                " window.__sz_sret_t=ctx.elapsedSec; return false;",
                "}",
                "return (ctx.elapsedSec-window.__sz_sret_t)>=" + TIM.secondParleyDelay + ";"
            ].join("\n") }}
        ],
        actions: [
            { type:"show_title", params:{
                title:"DAY 21", subtitle:"The bread runs short. The wells are watched. No rider has come.", ms:3500
            }},
            { type:"spawn_important_npc", params:{ id:"mongol_wave_5" } },
            { type:"set_npc_waypoint", params:{
                id:"mongol_wave_5", x:C.GOVERNOR_HALL.x-70, y:C.GOVERNOR_HALL.y
            }},

            _dlg([
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"Three weeks in. The wells inside the city still held water. " +
                       "The grain stores were two-thirds gone. The messenger " +
                       "arrived a second time — this time, the noyan himself " +
                       "was visible behind him at the west gate." },
                { side:"right", name:"Mongol Messenger", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Officer2.jpg",
                  text:"The khan asks again. Open the gates before the next " +
                       "circle tightens." },
                { side:"right", name:"Tangut Governor", color:"#c2185b",
                  portrait:"art/story1/highrank_samurai.jpg",
                  text:"We have walls." },
                { side:"right", name:"Mongol Messenger", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Officer2.jpg",
                  text:"So did the villages. Khara-Khoto had walls. Shazhou " +
                       "had walls. They are occupied now." },
                { side:"left", name:"You", color:"#ffffff",
                  text:"Our garrison still stands." },
                { side:"right", name:"Mongol Messenger", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Officer2.jpg",
                  text:"So did the garrisons. What terms?" },
                { side:"right", name:"Tangut Governor", color:"#c2185b",
                  portrait:"art/story1/highrank_samurai.jpg",
                  text:"What terms do you offer?" },
                { side:"right", name:"Mongol Messenger", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Officer2.jpg",
                  text:"Submission. Hostages. Supplies. Silence. Your people " +
                       "live and your streets remain. Those terms do not improve " +
                       "the longer you wait." },
                { side:"left", name:"You", color:"#ffffff",
                  text:"And if we refuse again?" },
                { side:"right", name:"Mongol Messenger", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Officer2.jpg",
                  text:"Then Suzhou becomes an example for Ganzhou and every " +
                       "city between here and Yinchuan. The khan is patient up " +
                       "to the moment he decides not to be." }
            ]),

            { type:"remove_important_npc", params:{ id:"mongol_wave_5" } },

            _dlg([
                { side:"left", name:"You", color:"#ffffff",
                  text:"They want fear to do the siege. They won't storm " +
                       "until the fear is finished working." },
                { side:"right", name:"Tangut Governor", color:"#c2185b",
                  portrait:"art/story1/highrank_samurai.jpg",
                  text:"Fear is already working." }
            ], { letterbox:false }),

            { type:"increment_var", params:{ name:"parley_count", n:1 } },
            _log("🚪 Second demand made. Refused again. Day 21.", "war"),
            _sub("Second demand refused. Engineer Wei has something to show you.", 7000, "#f5d76e"),

            { type:"story_quest_set", params:{
                id:"sq_thunder", title:"Find Engineer Wei at the north tower",
                description:"Wei has finished building something. Meet him at the wall tower.",
                x:C.WALL_TOWER.x, y:C.WALL_TOWER.y, radius:RAD.wallContact,
                noAutoComplete:true, isMain:true
            }}
        ]
    },


    // ════════════════════════════════════════════════════════════════════════
    // ACT 3 — THUNDER & CHOICE
    //
    // Three beats:
    //   Day 22 — The thunder tube fires. Horses scatter. Noyan unmoved.
    //   Day 34 — The last council. The numbers are final.
    //   Day 35 — The final parley. Player chooses.
    // ════════════════════════════════════════════════════════════════════════

    // T3.A — Player at wall tower: Engineer Wei fires the thunder tube.
    {
        id: "t3_thunder_tube", name: "Act 3 — Day 22: The Thunder Tube",
        enabled: true, once: true, activatedBy: "t2_second_parley",
        conditions: [
            { type:"player_in_region", params:{ x:C.WALL_TOWER.x, y:C.WALL_TOWER.y, radius:RAD.wallContact } },
            { type:"custom_js",  params:{ code:[
                "if(!ctx.firedById['t2_second_parley']) return false;",
                "if(typeof window.__sz_p2_t==='undefined'){",
                " window.__sz_p2_t=ctx.elapsedSec; return false;",
                "}",
                "return (ctx.elapsedSec-window.__sz_p2_t)>=" + TIM.thunderTubeDelay + ";"
            ].join("\n") }}
        ],
        actions: [
            { type:"show_title", params:{
                title:"DAY 22", subtitle:"Iron. Powder. A narrow tube pointed at the sky.", ms:3000
            }},

            _dlg([
                { side:"right", name:"Engineer Wei", color:"#5d4037",
                  portrait:"art/story1/Jap_Farmer.jpg",
                  text:"Commander. We built it. The tube — the fire-thunder device. " +
                       "The craftsmen from the south brought the method two years " +
                       "ago. We have had the parts. We needed a reason to finish it." },
                { side:"left", name:"You", color:"#ffffff",
                  text:"Will it stop them?" },
                { side:"right", name:"Engineer Wei", color:"#5d4037",
                  portrait:"art/story1/Jap_Farmer.jpg",
                  text:"No. It will frighten their horses. It will buy an hour " +
                       "of confusion. But they are Mongols — they manage " +
                       "frightened horses for a living." },
                { side:"left", name:"You", color:"#ffffff",
                  text:"Then why show me?" },
                { side:"right", name:"Engineer Wei", color:"#5d4037",
                  portrait:"art/story1/Jap_Farmer.jpg",
                  text:"Because it is the edge of a new thing. And someone " +
                       "should see it work before the city forgets it was here." }
            ], { letterbox:false }),

            { type:"set_var", params:{ name:"phase", value:"thunder" } },

            // Cinematic: the cannon fires
            { type:"fade_flash", params:{ color:"#ffffff", ms:200 } },
            { type:"show_art",   params:{ url:ART_PATHS.thunder_tube, ms:4500, kenburns:true } },
            { type:"show_title", params:{
                title:"A NEW THUNDER",
                subtitle:"Iron and powder in the Hexi Corridor, 1226",
                ms:3500
            }},

            _dlg([
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"A sharp crack. Smoke and shock. A burst of metal noise " +
                       "that had no precedent in the Hexi Corridor. Outside, " +
                       "Mongol horses reared. Two camp fires went out. Riders " +
                       "shouted at each other in the confusion." },
                { side:"right", name:"Mongol Rider", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Infantry2.jpg",
                  text:"Noyan — what was that?!" },
                { side:"right", name:"Mongol Noyan", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Officer1.jpg",
                  text:"A thing they made in fear." },
                { side:"right", name:"Mongol Rider", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Infantry2.jpg",
                  text:"Should we move the camp back?" },
                { side:"right", name:"Mongol Noyan", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Officer1.jpg",
                  text:"No. A city with one new weapon is still a city with " +
                       "no relief. Let them keep it. We have five weeks. " +
                       "Their bread has two." }
            ]),

            { type:"set_var", params:{ name:"thunder_done", value:"1" } },
            { type:"story_quest_complete", params:{ id:"sq_thunder" } },
            _log("⚡ The thunder tube fired. Confusion in the Mongol camp. Brief, but real.", "war"),
            _sub("The thunder spoke. The siege held. The council meets tomorrow.", 7000, "#f5d76e"),

            { type:"story_quest_set", params:{
                id:"sq_council", title:"Return to the governor's hall",
                description:"The governor has called the last full council. Day 34.",
                x:C.GOVERNOR_HALL.x, y:C.GOVERNOR_HALL.y, radius:RAD.wallContact,
                noAutoComplete:true, isMain:true
            }}
        ]
    },

    // T3.B — DAY 34: The last council. Numbers, not arguments.
    {
        id: "t3_council", name: "Act 3 — Day 34: The Last Council",
        enabled: true, once: true, activatedBy: "t3_thunder_tube",
        conditions: [
            { type:"player_in_region", params:{ x:C.GOVERNOR_HALL.x, y:C.GOVERNOR_HALL.y, radius:RAD.wallContact } },
            { type:"var_equals", params:{ name:"thunder_done", value:"1" } }
        ],
        actions: [
            { type:"show_title", params:{
                title:"DAY 34",
                subtitle:"Five weeks. No relief. No bread. No pretense.",
                ms:4000
            }},

            _dlg([
                { side:"right", name:"City Scribe", color:"#8d6e63",
                  portrait:"art/story1/Jap_Farmer.jpg",
                  text:"The grain counts from this morning. We have approximately " +
                       "nine days of rations at current consumption. Six if we " +
                       "account for the garrison's heavier load. The wells still " +
                       "produce. No messenger has broken through. No word from " +
                       "the capital." },
                { side:"left", name:"You", color:"#ffffff",
                  text:"Then the capital has not sent help because there is " +
                       "none to send. Commander Asha did not ride twelve weeks " +
                       "ago and he is not riding now." },
                { side:"right", name:"Captain Yuan", color:"#1e5a8c",
                  portrait:"art/story1/lowrank_samurai.jpg",
                  text:"We can hold the walls another three weeks on discipline " +
                       "alone. But after the food is gone, the walls are still " +
                       "standing and the men are not." },
                { side:"right", name:"Tangut Governor", color:"#c2185b",
                  portrait:"art/story1/highrank_samurai.jpg",
                  text:"And if we submit?" },
                { side:"right", name:"Engineer Wei", color:"#5d4037",
                  portrait:"art/story1/Jap_Farmer.jpg",
                  text:"Khara-Khoto submitted. Shazhou submitted. Guazhou " +
                       "submitted. Those cities are occupied, not burned. " +
                       "The Mongols want the Corridor functioning — they need " +
                       "the wells, the supplies, the roads." },
                { side:"right", name:"Engineer Wei", color:"#5d4037",
                  portrait:"art/story1/Jap_Farmer.jpg",
                  text:"The cities that have resisted too long — Genghis has " +
                       "annihilated them. The countryside around them. " +
                       "The people. Everything." },
                { side:"right", name:"City Scribe", color:"#8d6e63",
                  portrait:"art/story1/Jap_Farmer.jpg",
                  text:"The men are asking whether their children will be spared." },
                { side:"right", name:"Tangut Governor", color:"#c2185b",
                  portrait:"art/story1/highrank_samurai.jpg",
                  text:"Open the gates and the city may survive. Refuse and " +
                       "we may become a lesson for Ganzhou. History will not " +
                       "remember the choice as clean. Only that we stood here " +
                       "while no help came." },
                { side:"right", name:"Tangut Governor", color:"#c2185b",
                  portrait:"art/story1/highrank_samurai.jpg",
                  text:"Commander. The decision is yours. The messenger rides " +
                       "for the wall at first light." }
            ]),

            { type:"set_var", params:{ name:"phase", value:"final" } },
            { type:"story_quest_complete", params:{ id:"sq_council" } },
            _sub("The final decision is yours. Go to the west gate.", 7000, "#f5d76e"),
            _log("⚖ The council has spoken. Walk to the west gate for the final parley.", "objective"),

            { type:"story_quest_set", params:{
                id:"sq_final_gate", title:"The final parley — west gate",
                description:"The Mongol noyan rides to the west gate with the final terms.",
                x:C.WEST_GATE.x, y:C.WEST_GATE.y, radius:RAD.wallContact,
                noAutoComplete:true, isMain:true
            }}
        ]
    },

    // T3.C — The final parley. Two quest markers after dialogue.
    {
        id: "t3_final_parley", name: "Act 3 — Day 35: The Final Parley",
        enabled: true, once: true, activatedBy: "t3_council",
        conditions: [
            { type:"player_in_region", params:{ x:C.WEST_GATE.x, y:C.WEST_GATE.y, radius:RAD.wallContact } },
            { type:"var_equals", params:{ name:"phase", value:"final" } }
        ],
        actions: [
            { type:"spawn_important_npc", params:{ id:"mongol_wave_5" } },
            { type:"set_npc_waypoint", params:{
                id:"mongol_wave_5", x:C.WEST_GATE.x-90, y:C.WEST_GATE.y
            }},

            _dlg([
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"Day thirty-five. The Mongol noyan came to the west gate " +
                       "himself, in full view of the walls. The messenger rode " +
                       "ahead. There were more riders behind him than before." },
                { side:"right", name:"Mongol Messenger", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Officer2.jpg",
                  text:"The khan gives you one last road." },
                { side:"left", name:"You", color:"#ffffff",
                  text:"Speak it." },
                { side:"right", name:"Mongol Messenger", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Officer2.jpg",
                  text:"Yield now. The city remains. Resist, and it is taken. " +
                       "The terms do not improve after today." },
                { side:"left", name:"You", color:"#ffffff",
                  text:"You speak as if the matter were already decided." },
                { side:"right", name:"Mongol Noyan", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Officer1.jpg",
                  text:"It was decided when your relief did not ride. " +
                       "It was decided when Khara-Khoto fell. It was decided " +
                       "when the Hexi Corridor became ours. Suzhou is not a " +
                       "question. It is a pace." },
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"The decision is on you, commander. Walk to the gate " +
                       "to open it. Walk back to the hall to refuse. " +
                       "The city watches where your feet go." }
            ]),

            // Two quest markers — player selects by walking
            { type:"story_quest_set", params:{
                id:"sq_yield", title:"⚐ Yield — open the gate",
                description:"Walk to the gate. The city remains.",
                x:C.SURRENDER_GATE.x, y:C.SURRENDER_GATE.y, radius:RAD.choiceRadius,
                noAutoComplete:true
            }},
            { type:"story_quest_set", params:{
                id:"sq_resist", title:"⚔ Refuse — stand and fight",
                description:"Walk back to the hall. The walls remain for now.",
                x:C.FORTRESS_HOLD.x, y:C.FORTRESS_HOLD.y, radius:RAD.choiceRadius,
                noAutoComplete:true
            }},
            { type:"story_quest_complete", params:{ id:"sq_final_gate" } },

            _sub("Walk to the gate to yield.    Walk to the hall to refuse.", 9000, "#ffcc66"),
            _log("⚐ Yield: walk west toward the gate.    ⚔ Resist: walk east to the hall.", "objective")
        ]
    },


    // ════════════════════════════════════════════════════════════════════════
    // WIN / LOSE TERMINALS
    //
    // wl_surrender  — player walks to SURRENDER_GATE  → Win
    //                 Suzhou yields, the city survives, historical outcome.
    //                 Epilogue covers what comes next: Ganzhou (5 months),
    //                 Wuwei, Lingwu, Yellow River battle, Yinchuan, and
    //                 Genghis Khan's death in the Qilian Mountains, Aug 1227.
    //
    // wl_resist     — player walks to FORTRESS_HOLD   → Lose
    //                 The garrison fights. The seam breaks. City sacked.
    //
    // wl_player_dead — defensive; player killed during sortie or skirmish.
    // wl_timeout     — failsafe for stalled final phase (disabled by default).
    // ════════════════════════════════════════════════════════════════════════

    {
        id: "wl_surrender", name: "Win — Suzhou Yields",
        enabled: true, once: true, activatedBy: "t3_final_parley",
        conditions: [
            { type:"player_in_region", params:{ x:C.SURRENDER_GATE.x, y:C.SURRENDER_GATE.y, radius:RAD.choiceRadius } },
            { type:"var_equals", params:{ name:"phase", value:"final" } }
        ],
        actions: [
            { type:"set_var", params:{ name:"ending_chosen", value:"surrender" } },
            { type:"set_var", params:{ name:"phase", value:"end" } },
            { type:"story_quest_complete", params:{ id:"sq_yield" } },

            { type:"fade_flash", params:{ color:"#ffffff", ms:400 } },
            { type:"show_art",   params:{ url:ART_PATHS.open_gate, ms:6000, kenburns:true } },
            { type:"show_title", params:{
                title:    "YIELD",
                subtitle: "Day 35 — The gate opens before the sun falls",
                ms:       4200
            }},

            _dlg([
                { side:"right", name:"Tangut Governor", color:"#c2185b",
                  portrait:"art/story1/highrank_samurai.jpg",
                  text:"We yield." },
                { side:"right", name:"Mongol Noyan", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Officer1.jpg",
                  text:"Open the gate before the sun falls. Do not make us " +
                       "cross it in anger." },
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"Suzhou fell after five weeks. Mongol riders entered " +
                       "in orderly lines — not a frenzy, but a verdict. " +
                       "The city was occupied. The walls stood. The people lived." },

                // Historical epilogue — what came after
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"Genghis moved east to Ganzhou, hometown of his general " +
                       "Chagaan. Chagaan's father commanded the garrison. The " +
                       "second-in-command staged a coup, killed Chagaan's father, " +
                       "and refused to surrender. Ganzhou took five months to " +
                       "subdue." },
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"In August 1226, Genghis retreated to the Qilian Mountains " +
                       "to escape the summer heat while his armies took Wuwei — " +
                       "which surrendered without a siege. Autumn: Liangzhou fell. " +
                       "November: Lingwu, thirty kilometres from the capital " +
                       "Yinchuan, was besieged." },
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"At Lingwu, Western Xia launched a counterattack across " +
                       "the frozen Yellow River with an estimated force of three " +
                       "hundred thousand troops. The Mongols destroyed them on " +
                       "the ice. Three hundred thousand bodies were counted after " +
                       "the battle." },
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"In 1227, Yinchuan was besieged. Genghis Khan died in " +
                       "August in the Qilian Mountains — cause uncertain to this " +
                       "day. Some sources say illness. Some say a wound. One " +
                       "chronicle says a Western Xia princess. His death was " +
                       "kept secret to prevent the campaign's collapse." },
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"In September 1227, Emperor Mozhu surrendered and was " +
                       "executed. Yinchuan was pillaged. The imperial tombs were " +
                       "plundered. The Western Xia state was annihilated." },
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"The cannon was a rumor of the future. The Mongols were " +
                       "a fact of the present. Between them stood a city with " +
                       "no relief and too much time to understand it." }
            ]),

            { type:"win_scenario", params:{
                title:    "Yield",
                subtitle: "Suzhou stands. The corridor closed, but the city remained."
            }}
        ]
    },

    {
        id: "wl_resist", name: "Defeat — The Walls Are Taken",
        enabled: true, once: true, activatedBy: "t3_final_parley",
        conditions: [
            { type:"player_in_region", params:{ x:C.FORTRESS_HOLD.x, y:C.FORTRESS_HOLD.y, radius:RAD.choiceRadius } },
            { type:"var_equals", params:{ name:"phase", value:"final" } },
            { type:"custom_js",  params:{ code:[
                "if(!ctx.firedById['t3_final_parley']) return false;",
                "if(typeof window.__sz_choice_t==='undefined'){",
                " window.__sz_choice_t=ctx.elapsedSec; return false;",
                "}",
                "return (ctx.elapsedSec-window.__sz_choice_t)>=" + TIM.choiceMinDelay + ";"
            ].join("\n") }}
        ],
        actions: [
            { type:"set_var", params:{ name:"ending_chosen", value:"resist" } },
            { type:"set_var", params:{ name:"phase", value:"end" } },
            { type:"story_quest_complete", params:{ id:"sq_resist" } },

            // The four Mongol camps push on all four walls simultaneously
            { type:"set_npc_waypoint", params:{ id:"mongol_wave_0", x:C.NORTH_GATE.x,     y:C.NORTH_GATE.y     } },
            { type:"set_npc_waypoint", params:{ id:"mongol_wave_1", x:C.NORTH_GATE.x,     y:C.NORTH_GATE.y     } },
            { type:"set_npc_waypoint", params:{ id:"mongol_wave_2", x:C.EAST_GATE.x,      y:C.EAST_GATE.y      } },
            { type:"set_npc_waypoint", params:{ id:"mongol_wave_3", x:C.WEST_GATE.x,      y:C.WEST_GATE.y      } },

            { type:"show_title", params:{
                title:    "REFUSE",
                subtitle: "The east wall seam spoke first",
                ms:       3500
            }},

            _dlg([
                { side:"left", name:"You", color:"#ffffff",
                  text:"Suzhou does not yield." },
                { side:"right", name:"Mongol Noyan", color:"#7c2d12",
                  portrait:"art/story1/Mongol_Officer1.jpg",
                  text:"Then Suzhou becomes the example that saves the khan " +
                       "the trouble of explaining himself to Ganzhou." },
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"The camps moved. The east seam Engineer Wei had " +
                       "warned of opened two hours before any other section. " +
                       "The garrison held the breach for two days." },
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"Then they did not." },
                { side:"left", name:"Narrator", color:"#d4b886",
                  text:"History does not record the names of the defenders. " +
                       "Only that Suzhou was taken, and that the Mongols moved " +
                       "east to Ganzhou three days later." }
            ]),

            { type:"lose_scenario", params:{
                title:    "Refusal",
                subtitle: "The walls fell. The city became an example."
            }}
        ]
    },

    {
        id: "wl_player_dead", name: "Defeat — Commander Falls in Battle",
        enabled: true, once: true, activatedBy: null,
        conditions: [ { type:"player_dead", params:{} } ],
        actions: [
            { type:"lose_scenario", params:{
                title:    "Defeat",
                subtitle: "The commander has fallen. The walls do not save what no one defends."
            }}
        ]
    },

    {
        id: "wl_timeout", name: "Defeat — Stalemate (failsafe, disabled)",
        enabled: false, once: true, activatedBy: null,
        conditions: [
            { type:"timer_elapsed", params:{ seconds:1200 } },
            { type:"var_equals",    params:{ name:"phase", value:"final" } }
        ],
        actions: [
            { type:"lose_scenario", params:{
                title:    "Defeat",
                subtitle: "The Mongols entered before the city could decide."
            }}
        ]
    }

]; // end TRIGGERS


// ─── WIN/LOSE SUMMARY ────────────────────────────────────────────────────────
var WIN_LOSE = {
    winRules:  [{ type:"trigger_chain_complete", id:"wl_surrender" }],
    loseRules: [{ type:"player_dead" }, { type:"all_player_cities_lost" }],
    victoryTitle:    "Yield",
    victorySubtitle: "Suzhou stands. The corridor closed, but the city survived.",
    defeatTitle:     "Defeat",
    defeatSubtitle:  "The walls fell. Suzhou became an example."
};

// ─── DATA BUNDLE ─────────────────────────────────────────────────────────────
var DATA = {
    meta: {
        name:         "The Siege of Suzhou",
        author:       "Suzhou Scenario v2.0 — Dawn of Gunpowder, Story 2",
        description:  "Hexi Corridor, Winter 1226. Subutai's western wing and " +
                      "Genghis Khan's main force converge on Suzhou after taking " +
                      "Khara-Khoto, Shazhou, Guazhou, and Changle. Commander Asha " +
                      "will not march from Yinchuan. Hold the walls through five " +
                      "weeks of encirclement, lead the night sortie, witness the " +
                      "Tangut thunder tube, and choose: yield or resist. Historical " +
                      "epilogue covers Ganzhou, Wuwei, the Battle of Yellow River, " +
                      "Yinchuan, and the death of Genghis Khan.",
        importedFrom: "story2_suzhou_v2_0"
    },
    startingNpcBans: {
        factions: ["Mongol Empire"],
        roles:    ["Commerce","Patrol","Civilian","Military"]
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
        if (CONFIG.debug) console.log.apply(console, ["[Suzhou/resolver]"].concat(Array.prototype.slice.call(arguments)));
    };
    var factionNames  = Object.keys(scenario.factions || {});
    var playerFaction = FAC.PLAYER;
    var enemyFaction  = FAC.ENEMY;

    if (!factionNames.includes(playerFaction)) {
        var pf = factionNames.find(function(n) {
            var l = n.toLowerCase();
            return l.includes("xia") || l.includes("tangut") || l.includes("player");
        }) || factionNames.find(function(n){ return n!=="Bandits"; }) || playerFaction;
        log("PLAYER faction remapped to:", pf);
        playerFaction = pf;
    }
    if (!factionNames.includes(enemyFaction)) {
        var ef = factionNames.find(function(n) {
            var l = n.toLowerCase();
            return l.includes("mongol") || l.includes("genghis");
        }) || factionNames.filter(function(n){ return n!==playerFaction&&n!=="Bandits"; })[0] || enemyFaction;
        log("ENEMY faction remapped to:", ef);
        enemyFaction = ef;
    }

    var fRemap = {};
    fRemap[FAC.PLAYER] = playerFaction;
    fRemap[FAC.ENEMY]  = enemyFaction;

    DATA.triggers.forEach(function(tr){
        (tr.actions||[]).forEach(function(a){
            var p=a.params||{};
            ["faction","a","b"].forEach(function(k){
                if(typeof p[k]==="string"&&fRemap[p[k]]) p[k]=fRemap[p[k]];
            });
        });
        (tr.conditions||[]).forEach(function(c){
            var p=c.params||{};
            if(typeof p.faction==="string"&&fRemap[p.faction]) p.faction=fRemap[p.faction];
        });
    });
    DATA.importantNpcs.forEach(function(n){
        if(fRemap[n.faction]) n.faction=fRemap[n.faction];
    });
    if(DATA.playerSetup){
        if(fRemap[DATA.playerSetup.faction]) DATA.playerSetup.faction=fRemap[DATA.playerSetup.faction];
        if(Array.isArray(DATA.playerSetup.enemies)){
            DATA.playerSetup.enemies=DATA.playerSetup.enemies.map(function(e){ return fRemap[e]||e; });
        }
    }

    var cities=scenario.cities||{};
    var cityNames=cities.map?cities.map(function(c){return c.name;})
                         :Object.keys(cities);
    var cityRemap={};
    [CONFIG.cities.HOME].concat(CONFIG.cities.VILLAGES).filter(Boolean).forEach(function(name){
        if(!cityNames.includes(name)){
            var arr=Array.isArray(cities)?cities:[];
            var fuzzy=arr.find(function(c){ return c.name&&c.name.toLowerCase().includes(name.toLowerCase()); });
            if(fuzzy){ cityRemap[name]=fuzzy.name; log("City remap:",name,"→",fuzzy.name); }
        }
    });
    if(Object.keys(cityRemap).length){
        DATA.triggers.forEach(function(tr){
            (tr.actions||[]).concat(tr.conditions||[]).forEach(function(item){
                var p=item.params||{};
                if(typeof p.cityName==="string"&&cityRemap[p.cityName]) p.cityName=cityRemap[p.cityName];
            });
        });
    }
    log("Binding resolution complete. Player:", playerFaction, "| Enemy:", enemyFaction);
}


// ─── INSTALLER ───────────────────────────────────────────────────────────────
function install() {
    if (!window.__campaignStory2Active) {
        console.log("[Suzhou] Skipping install — set window.__campaignStory2Active=true to activate.");
        return false;
    }
    if (!window.__activeScenario) {
        console.warn("[Suzhou] No active scenario — retrying via auto-install poll.");
        return false;
    }
    var s = window.__activeScenario;

    _preloadStoryArt();
    _resolveBindings(s);

    // Re-stamp NPC bans
    (function _reStamp() {
        if (!window.__npcSpawnBans) window.__npcSpawnBans={ factions:[], roles:[] };
        var b=window.__npcSpawnBans;
        ["Commerce","Patrol","Civilian","Military"].forEach(function(r){ if(!b.roles.includes(r)) b.roles.push(r); });
        ["Mongol Empire"].forEach(function(f){ if(!b.factions.includes(f)) b.factions.push(f); });
        console.log("[Suzhou] NPC spawn ban re-stamped. roles="+b.roles.join(",")+" | factions="+b.factions.join(","));
    })();

    if (!Array.isArray(s.triggers)) s.triggers=[];
    var existIds=new Set(s.triggers.map(function(t){ return t.id; }));
    DATA.triggers.forEach(function(t){ if(!existIds.has(t.id)) s.triggers.push(t); });

    if (!Array.isArray(s.importantNpcs)) s.importantNpcs=[];
    var npcIds=new Set(s.importantNpcs.map(function(n){ return n.id; }));
    DATA.importantNpcs.forEach(function(n){ if(!npcIds.has(n.id)) s.importantNpcs.push(n); });

    s.playerSetup  = Object.assign({}, s.playerSetup||{}, DATA.playerSetup);
    if (!s.storyIntro||!s.storyIntro.enabled) s.storyIntro = DATA.storyIntro;
    s.scenarioVars = Object.assign({}, DATA.scenarioVars, s.scenarioVars||{});
    if (!s.winLose||(!( s.winLose.winRules||[]).length&&!(s.winLose.loseRules||[]).length)) {
        s.winLose = DATA.winLose;
    }

    if (window.ScenarioTriggers && typeof window.ScenarioTriggers.start==="function") {
        s.__introPlayed = false;
        window.ScenarioTriggers.start(s);
        console.log("[Suzhou] ✅ Installed and trigger runtime restarted.");
    } else {
        console.warn("[Suzhou] ScenarioTriggers not found — triggers spliced but runtime not restarted.");
    }

    // Re-apply player setup staggered over 3.2 seconds
    var _attempts=0;
    function _reapply() {
        if (!window.player||!DATA.playerSetup) return;
        var ps=DATA.playerSetup;
        var posOk=(Math.abs((window.player.x||0)-ps.x)<4)&&(Math.abs((window.player.y||0)-ps.y)<4);
        var trpOk=(window.player.troops===ps.troops)||(Array.isArray(window.player.roster)&&window.player.roster.length===ps.troops);
        if (posOk&&trpOk&&_attempts>0){ console.log("[Suzhou] Player setup verified ✓ at attempt",_attempts); return; }
        window.player.x=ps.x; window.player.y=ps.y;
        window.player.gold=ps.gold; window.player.food=ps.food;
        window.player.hp=ps.hp; window.player.maxHealth=ps.maxHealth;
        if (typeof ps.faction==="string"&&ps.faction) window.player.faction=ps.faction;
        if (Array.isArray(ps.enemies)) window.player.enemies=ps.enemies.slice();
        if (Array.isArray(ps.roster)) {
            window.player.roster=ps.roster.map(function(r){
                return (typeof r==="string")?{type:r,exp:1}:(r&&r.type)?{type:r.type,exp:r.exp||1}:{type:"Militia",exp:1};
            });
            window.player.troops=window.player.roster.length;
        } else if (typeof ps.troops==="number") { window.player.troops=ps.troops; }
        _attempts++;
        console.log("[Suzhou] Player re-applied (attempt "+_attempts+") pos=("+window.player.x+","+window.player.y+") troops="+window.player.troops);
    }
    setTimeout(_reapply,  250);
    setTimeout(_reapply,  800);
    setTimeout(_reapply, 1600);
    setTimeout(_reapply, 3200);

    return true;
}

// ─── AUTO-INSTALL ────────────────────────────────────────────────────────────
(function _autoInstall() {
    if (window.__suzhouDisableAutoInstall) return;
    var lastSeen=null, attempts=0, screened=false;

    function _getLoadPct() {
        if (typeof window.__mapLoadProgress==="number") return window.__mapLoadProgress;
        if (typeof window.DoGLoadProgress  ==="number") return window.DoGLoadProgress;
        if (typeof window.__loadProgress   ==="number") return window.__loadProgress;
        var el=document.getElementById("loading");
        if (el) {
            if (el.style.display==="none") return 100;
            var m=el.textContent.match(/(\d+(?:\.\d+)?)\s*%/);
            if (m) return parseFloat(m[1]);
        }
        return -1;
    }

    var iv=setInterval(function(){
        if (++attempts>75){ clearInterval(iv); return; }
        if (!window.__campaignStory2Active) return;

        if (!screened&&window.StoryPresentation&&typeof window.StoryPresentation.fadeOut==="function") {
            var pct=_getLoadPct();
            if (pct<0||pct>=95) {
                screened=true;
                window.StoryPresentation.fadeOut(500,"#000000");
                if (typeof window.StoryPresentation.showPhase2Loading==="function") {
                    window.StoryPresentation.showPhase2Loading();
                }
                console.log("[Suzhou] Screen fading at "+(pct<0?"unknown":pct)+"% load.");
            }
        }

        var cur=window.__activeScenario;
        if (!cur||cur===lastSeen) return;
        lastSeen=cur;
        if ((cur.cities||[]).length<CONFIG.minRequiredCities) {
            console.log("[Suzhou] Only",(cur.cities||[]).length,"cities — need ≥",CONFIG.minRequiredCities,". Skipping auto-install.");
            return;
        }
        console.log("[Suzhou] Detected campaign scenario with",(cur.cities||[]).length,"cities. Auto-installing…");
        setTimeout(install, 1200);
        clearInterval(iv);
    }, 800);
})();


// ─── PUBLIC API ───────────────────────────────────────────────────────────────
return {
    install: install,
    DATA:    DATA,
    CONFIG:  CONFIG,
    VERSION: "2.0.0"
};

})();

console.log("[Suzhou] suzhou_scenario.js v"+window.SuzhouScenario.VERSION+" — module ready.");
