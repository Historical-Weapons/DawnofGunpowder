// ============================================================================
// MONGOL CONQUEST OF WESTERN XIA — THE MARCH SOUTH
// mongolconquestxia_scenario.js  v6.0
// ============================================================================
//
// Campaign: Dawn of Gunpowder — Story 2  (Mongol perspective)
//
// WHAT CHANGED in v6.0  — "The KharaKhoto Siege & Messenger Arc"
// ─────────────────────────────────────────────────────────────
// SPEED REVISION:
//   All convoy speeds halved from v5.x values:
//     leaderPxSec:   7   (was 15)
//     followerPxSec: 10  (was 20)
//   Spacing tightened:
//     convoy.spacing:  5  (was 8)
//     NEW_SPACING_PX:  5, NEW_COL_GAP: 4, NEW_ROW_GAP: 7
//   Follower patch colGap/rowGap updated to match.
//
// STORY RESTRUCTURE — new 5-phase arc:
//
//   PHASE 1 — KharaKhoto COMMANDARY (new)
//     The convoy arrives at KharaKhoto Commandary and SIEGES it.
//     20-second sack timer plays out before the army moves on.
//
//   PHASE 2 — ARMY DIVIDE AT RUO SHUI BEND
//     Genghis Khan's main force breaks EAST toward Suzhou and begins
//     a prolonged siege with no timer — Suzhou will not fall until
//     player + Subutai rejoin.
//     Subutai takes player WEST through the corridor cities.
//
//   PHASE 3 — SUBUTAI'S WESTERN CORRIDOR (player follows Subutai)
//     Cities are sacked in westward order from the divide point:
//       Yanchi Pass Fort → Changle → Guazhou → Shazhou (farthest west)
//     At SHAZHOU, Subutai gets pinned — the siege stalls.
//     Subutai asks the player to ride east as MESSENGER to Genghis Khan:
//       report the prior sackings and the ongoing Shazhou siege.
//
//   PHASE 4 — PLAYER AS MESSENGER (new)
//     Player rides east alone.  Near Suzhou, player meets Genghis Khan's
//     besieging force (ongoing, no timer).
//     Player delivers Subutai's report.  Genghis Khan and player together
//     assault Suzhou.  Suzhou falls.
//
//   PHASE 5 — REUNIFICATION & EASTERN MARCH
//     All forces (Subutai arrives from the west) converge.
//     March east: Ganzhou (Chagaan coup drama) → Xiliang → Xingqing.
//
// CONVOY ROUTE (v6.0):
//   KharaKhoto Commandary   → t_arrive_KharaKhoto       (siege + 20 s sack)
//   [Army Divide Point]  → t_arrive_divide         (Genghis east / Subutai west)
//   Yanchi Pass Fort     → t_mission_yanchi        (Mission 1)
//   Changle              → t_mission_changle_ultimatum  (Mission 2)
//   Guazhou              → t_mission_guazhou_screen     (Mission 3)
//   Shazhou              → t_mission_shazhou_stuck       (Subutai stuck; player messengers)
//   [Player messenger arc — no convoy stop, custom_js transition]
//   Suzhou               → t_arrive_suzhou         (player + Genghis siege together)
//   Ganzhou              → t_arrive_ganzhou         (Chagaan coup + 5-month siege)
//   Xiliang              → t_arrive_xiliang         (surrender)
//   Xingqing (Zhongxing) → t_arrive_xingqing        (capital + Genghis's death)
//
// TRIGGER MAP (v6.0):
//   t0_purge              — sweep stray procedural NPCs (first 45 s)
//   t0_boot               — convoy spawns, escort arms, route loads
//   t0_escort_warn        — player dist > 200 px → warning every 5 s
//   t0_escort_fail        — player dist > 500 px → defeat + menu reload
//   t0_spawn_ban_restamp  — re-stamp NPC role ban every 60 s
//   t_arrive_KharaKhoto      — KharaKhoto siege + 20-second sack sequence
//   t_arrive_divide       — army divides; Genghis east, Subutai + player west
//   t_mission_yanchi      — Mission 1: raid Yanchi Pass granary fort
//   t_mission_yanchi_done — Mission 1 complete; Subutai issues Mission 2
//   t_mission_changle_ultimatum — Mission 2: deliver ultimatum to Changle
//   t_mission_changle_done      — Changle falls; Mission 3 issued
//   t_mission_guazhou_screen    — Mission 3: screen Guazhou from Xia scouts
//   t_mission_guazhou_done      — Guazhou clear; Mission 4 issued
//   t_mission_shazhou_stuck     — Shazhou siege stalls; player sent as messenger
//   t_player_messenger_depart   — player breaks east alone; escort pauses
//   t_arrive_suzhou       — player meets Genghis; joint siege of Suzhou
//   t_arrive_ganzhou      — Temür rejoins full force; Chagaan drama begins
//   t_arrive_xiliang      — Wuwei surrenders; rest + rearm
//   t_arrive_xingqing     — Capital siege; Genghis's failing health; end
//
// LOAD ORDER:
//   1. scenario_triggers.js               (registers ScenarioTriggers)
//   2. scenario_triggers_convoy_patch.js  (registers convoy conditions/actions)
//   3. story_quest_patch.js               (registers StoryQuests waypoints)
//   4. mongolconquestxia_scenario.js      (this file)
// ============================================================================

window.MongolConquestScenario = (function () {
"use strict";

// ── MODULE-LOAD NPC SPAWN BAN ────────────────────────────────────────────────
// Stamped the instant this script parses.
(function _stampInitialBan() {
    if (!window.__npcSpawnBans) window.__npcSpawnBans = { factions: [], roles: [] };
    var b = window.__npcSpawnBans;
    ["Commerce", "Patrol", "Civilian", "Military"].forEach(function (r) {
        if (!b.roles.includes(r)) b.roles.push(r);
    });
    // ── STORY 2 FIX: Ban Mongol Empire from procedural city seeding ──────────
    // The player IS Mongol Empire and there are no static Mongol cities in
    // this scenario. Without this ban, ensureAllFactionsSpawned() in
    // sandboxmode_npc_system.js force-converts the Xiaran city closest to
    // Mongol Empire's geoWeight pole into a Mongol city — producing the
    // "random Mongol city" bug. Adding the faction here makes the ban
    // authoritative across both NPC spawning and city seeding.
    if (!b.factions.includes("Mongol Empire")) b.factions.push("Mongol Empire");
    console.log("[MongolConquest] NPC spawn ban stamped at module load. roles=" +
                b.roles.join(",") + " | factions=" + b.factions.join(","));
})();


// ============================================================================
// LEGACY show_dialogue ADAPTER  (single-line speaker → lines[] one-liner)
// ----------------------------------------------------------------------------
// All show_dialogue actions in this file were authored with the shape:
//
//   { type: "show_dialogue", params: { speaker, portrait, text, color, side? } }
//
// But the runtime handler in scenario_triggers.js expects:
//
//   { type: "show_dialogue", params: { lines: [{name, portrait, text, color, side}],
//                                       letterbox?, typewriterCps? } }
//
// Without `lines`, the runtime resolves `p.lines || []` to an empty array and
// skips rendering — symptom: dialogue cards stop appearing after KharaKhoto (the
// intro plays correctly because it goes through _maybePlayStoryIntro instead).
//
// _normalizeShowDialogueAction rewrites a single legacy action in place.
// _normalizeAllDialogueInTriggers walks every trigger's actions array and
// applies the rewrite to all show_dialogue entries.
//
// Side defaults follow the intro's convention:
//   • Temür Noyan and Narrator render on the LEFT
//   • everyone else (Mongol leaders, Xia defenders/officers) on the RIGHT
// Explicit `side` in the call site always wins.
// ============================================================================
function _normalizeShowDialogueAction(action) {
    if (!action || action.type !== "show_dialogue") return action;
    var p = action.params || {};

    // Already in the correct shape — leave alone.
    if (Array.isArray(p.lines) && p.lines.length > 0) return action;

    // Legacy shape: speaker / portrait / text / color directly on params.
    if (typeof p.speaker !== "string" && typeof p.text !== "string") return action;

    var leftNames = { "Temür Noyan": 1, "Narrator": 1 };
    var name = p.speaker || "Narrator";
    var side = p.side || (leftNames[name] ? "left" : "right");

    action.params = {
        lines: [{
            name:     name,
            portrait: p.portrait || "",
            text:     p.text || "",
            color:    p.color || "#d4b886",
            side:     side
        }],
        letterbox:     (p.letterbox !== false),
        typewriterCps: (typeof p.typewriterCps === "number") ? p.typewriterCps : 0
    };
    return action;
}

function _normalizeAllDialogueInTriggers(triggers) {
    if (!Array.isArray(triggers)) return 0;
    var count = 0;
    triggers.forEach(function(trig) {
        if (!trig || !Array.isArray(trig.actions)) return;
        trig.actions = trig.actions.map(function(a) {
            var normalized = _normalizeShowDialogueAction(a);
            if (normalized !== a || (a && a.type === "show_dialogue" &&
                normalized && normalized.params && Array.isArray(normalized.params.lines))) {
                if (a && a.type === "show_dialogue" &&
                    !(a.params && Array.isArray(a.params.lines) && a.params.lines.length > 0)) {
                    count++;
                }
            }
            return normalized;
        });
    });
    return count;
}


// ============================================================================
// CONFIG
// ============================================================================

var CONFIG = {

    map: { tilesX: 250, tilesY: 187, tileSize: 16 },

    factions: {
        PLAYER: "Mongol Empire",
        ENEMY:  "Xiaran Dominion"
    },

    // ── CONVOY ───────────────────────────────────────────────────────────────
    //
    // 15 story NPCs in a single-file train heading south.
    // World: 250*16 = 4000 px wide, 187*16 = 2992 px tall.
    // KharaKhoto valley road ≈ x=1720.
    //
    // Positions:
    //   NPC 0 (Genghis Khan):   y = 110   ← convoy HEAD / LEADER
    //   NPC 14 (tail):          y = 1020
    //   Player (Temür Noyan):   y = 1085  (20 px east: x = 1740)
    //
    // The convoy system (start_npc_convoy) takes over movement after boot.
    // spacingPx=65 matches the spawn gap so NPCs don't teleport at start.
    convoy: {
        startX:  1720,
        startY:   110,
        spacing:    5,   // v6.0 — very tight, almost touching

        names: [
            "Genghis Khan",          //  0 — leader
            "Subutai",               //  1
            "Tolui Khan",            //  2
            "Ögedei Khan",           //  3
            "Chagaan Noyan",         //  4
            "Muqali's Successor",    //  5
            "Jebe's Vanguard",       //  6
            "Right Tümen Noyan",     //  7
            "Center Tümen Noyan",    //  8
            "Left Tümen Noyan",      //  9
            "Keshig Commander",      // 10
            "Siege Train Captain",   // 11
            "Supply Train Noyan",    // 12
            "Rearguard Noyan",       // 13
            "Messenger Corps Chief"  // 14 — tail (escort reference NPC)
        ],

        troops:  100,
        gold:   1000,
        food:   1000,

        rosterPct: {
            "Heavy Horse Archer": 35,
            "Horse Archer":       30,
            "Lancer":             15,
            "Keshig":             10,
            "Shielded Infantry":  10
        },

        stats: {
            hp:      300,
            attack:   22,
            defense:  18,
            armor:    15
        },

        leaderBonus:  { hp: 1.60, attack: 1.45 },
        subutaiBonus: { hp: 1.40, attack: 1.35 }
    },

    // ── CONVOY MARCH ROUTE ────────────────────────────────────────────────────
    // Defines the city route the convoy follows.
    // v6.0 — NEW ARC: KharaKhoto siege → divide → Subutai west → player messengers
    //         east → player + Genghis siege Suzhou → all converge → Ganzhou →
    //         Xiliang → Xingqing.
    //
    // HISTORICAL SEQUENCE (1225–1226):
    //   KharaKhoto Commandary   — first siege; 20-second sack sequence
    //   [Army Divide Point]  — Genghis east (Suzhou); Subutai west with player
    //
    //   ── SUBUTAI'S WESTERN CORRIDOR (player follows Subutai's detachment) ──
    //   Yanchi Pass Fort   — Mission 1: raid granary fort
    //   Changle            — Mission 2: deliver ultimatum; city surrenders
    //   Guazhou            — Mission 3: screen Xia scouting party
    //   Shazhou            — Subutai stalls; player sent as messenger east
    //
    //   ── PLAYER RIDES EAST AS MESSENGER → meets Genghis at Suzhou ────────
    //   Suzhou             — player + Genghis siege Suzhou together (no prior timer)
    //   Ganzhou            — 5-month siege; Chagaan negotiation + coup
    //   Xiliang            — Wuwei; surrenders
    //   Xingqing (Zhongxing) — capital siege; Genghis dies during siege
    //
    convoyRoute: [
        { cityName: "Khara-Khoto",    stayMs: 28000,  onArriveTriggerId: "t_arrive_KharaKhoto"             },
        { cityName: "Army Divide Point",     stayMs:  9000,  onArriveTriggerId: "t_arrive_divide"              },
        // ── Subutai's western corridor: westward order from divide point ───────
        { cityName: "Yanchi Pass Fort",      stayMs: 18000,  onArriveTriggerId: "t_mission_yanchi"             },
        { cityName: "Changle",               stayMs: 22000,  onArriveTriggerId: "t_mission_changle_ultimatum"  },
        { cityName: "Guazhou",               stayMs: 16000,  onArriveTriggerId: "t_mission_guazhou_screen"     },
        { cityName: "Shazhou",               stayMs: 35000,  onArriveTriggerId: "t_mission_shazhou_stuck"      },
        // ── Player rides east alone; rejoins Genghis near Suzhou ─────────────
        { cityName: "Suzhou",                stayMs: 25000,  onArriveTriggerId: "t_arrive_suzhou"              },
        { cityName: "Ganzhou",               stayMs: 38000,  onArriveTriggerId: "t_arrive_ganzhou"             },
        { cityName: "Xiliang",               stayMs: 10000,  onArriveTriggerId: "t_arrive_xiliang"             },
        { cityName: "Xingqing (Zhongxing)",  stayMs: 45000,  onArriveTriggerId: "t_arrive_xingqing"           },
    ],

    // ── CONVOY MOVEMENT SPEEDS ────────────────────────────────────────────────
    // Half-speed march pace for v6.0 — slow, realistic column movement.
    // followerPxSec slightly above leader so stragglers gradually close up.
    convoySpeed: {
        leaderPxSec:    7,
        followerPxSec: 10,
        arrivalPx:       8
    },

    // ── PLAYER ────────────────────────────────────────────────────────────────
    player: {
        troops:    100,
        gold:      500,
        food:      800,
        hp:        270,
        maxHealth: 270,
        rosterPct: {
            "Heavy Horse Archer": 35,
            "Horse Archer":       30,
            "Lancer":             15,
            "Keshig":             10,
            "Shielded Infantry":  10
        }
    },

    // ── ESCORT DISTANCES (player ↔ convoy tail NPC) ───────────────────────────
    escort: {
        tailId:   "convoy_npc_14",  // storyId of the tail NPC
        warnPx:   200,              // beyond this → warning every 5 s
        failPx:   500               // beyond this → defeat + menu reload
    },

    minRequiredCities: 2
};


// ============================================================================
// ART PATHS
// ============================================================================

var ART_PATHS = {
    marching_desert: "art/story2/story2_walkingdesertmongolarmy.jpg",
    hexi_mountains:  "art/story2/story2_walkingalongheximountains.jpg",
    siege_prepare:   "art/story2/story2_gettingreadytosiegetangutcity.jpg",

    portraits: {
        // ── Mongol leaders ───────────────────────────────────────────────────
        "Temür Noyan":               "art/story2/Mongol_General.jpg",
        "Narrator":                  "art/story2/old_man.jpg",
        "Genghis Khan":              "art/story2/Mongol_General.jpg",
        "Subutai":                   "art/story2/Mongol_Officer1.jpg",
        "Tolui Khan":                "art/story2/Mongol_Officer2.jpg",
        "Ögedei Khan":               "art/story2/Mongol_Officer2.jpg",
        "Chagaan Noyan":             "art/story2/Mongol_Officer1.jpg",
        "Muqali's Successor":        "art/story2/Mongol_Officer2.jpg",
        "Jebe's Vanguard":           "art/story2/Mongol_Infantry1.jpg",
        "Right Tümen Noyan":         "art/story2/Mongol_Officer2.jpg",
        "Center Tümen Noyan":        "art/story2/Mongol_Infantry1.jpg",
        "Left Tümen Noyan":          "art/story2/Mongol_Infantry2.jpg",
        "Keshig Commander":          "art/story2/Mongol_Infantry1.jpg",
        "Siege Train Captain":       "art/story2/Mongol_Infantry2.jpg",
        "Supply Train Noyan":        "art/story2/Mongol_Infantry2.jpg",
        "Rearguard Noyan":           "art/story2/Mongol_Infantry2.jpg",
        "Messenger Corps Chief":     "art/story2/Mongol_Infantry1.jpg",
        // ── Generic Xia NPCs ─────────────────────────────────────────────────
        "Tangut General":            "art/story2/Tangut_General.jpg",
        "Tangut Defender":           "art/story2/Tangut_Inf.jpg",
        "Tangut Messenger":          "art/story2/turban_peasant.jpg",
        "City Elder":                "art/story2/old_man.jpg",
        // ── Mission-specific Xia NPCs (v5.0) — spawned fresh per mission ─────
        "Fort Captain Bao Liang":    "art/story2/Tangut_General.jpg",
        "Beacon Master Wen Ju":      "art/story2/Tangut_Inf.jpg",
        "Scout Commander Dali":      "art/story2/Tangut_General.jpg",
        "Gate Warden Huo Qian":      "art/story2/Tangut_General.jpg",
        "Changle Elder":             "art/story2/old_man.jpg",
        "General Chagaan's Father":  "art/story2/Tangut_General.jpg",
        "Deputy Wei Bochang":        "art/story2/Tangut_General.jpg",
        "Emperor Xianzong":          "art/story2/Tangut_General.jpg",
        "Asha":                      "art/story2/Tangut_General.jpg"
    }
};

function _preloadStoryArt() {
    if (!window.StoryPresentation ||
        typeof window.StoryPresentation.registerPortraitsBulk !== "function") {
        setTimeout(_preloadStoryArt, 200);
        return;
    }
    window.StoryPresentation.registerPortraitsBulk(ART_PATHS.portraits);
    console.log("[MongolConquest] Story 2 portraits registered:", Object.keys(ART_PATHS.portraits).length);
}


// ============================================================================
// HELPERS
// ============================================================================

function _buildRoster(pct, count) {
    var pool = [];
    Object.keys(pct).forEach(function (type) {
        var n = Math.round((pct[type] / 100) * count);
        for (var i = 0; i < n; i++) pool.push({ type: type, exp: 1 });
    });
    while (pool.length < count) pool.push({ type: "Horse Archer", exp: 1 });
    return pool.slice(0, count);
}

function _sub(text, ms, color) {
    return { type: "show_subtitle", params: { text: text, ms: ms || 5000, color: color || "#f5d76e" } };
}
function _log(text, category) {
    return { type: "log_event", params: { text: text, category: category || "general" } };
}


// ============================================================================
// NPC BUILDERS
// ============================================================================

function _buildConvoyNpcs() {
    var c   = CONFIG.convoy;
    var map = CONFIG.map;

    // All NPC units start clustered at the same world position:
    //   x = 30% of map width  ± 5% random jitter
    //   y = 1%  of map height  (fixed — top of the corridor)
    // Pixel dimensions: mapWidth = tilesX * tileSize, mapHeight = tilesY * tileSize
    var mapW = map.tilesX * map.tileSize;   // 250 * 16 = 4000 px
    var mapH = map.tilesY * map.tileSize;   // 187 * 16 = 2992 px

    var baseX = 0.30 * mapW;               // 1200 px
    var baseY = 0.01 * mapH;               //   ~30 px

    return c.names.map(function (name, i) {
        var isGenghis = (i === 0);
        var isSubutai = (i === 1);

        var hpMult  = isGenghis ? c.leaderBonus.hp     : isSubutai ? c.subutaiBonus.hp     : 1;
        var atkMult = isGenghis ? c.leaderBonus.attack  : isSubutai ? c.subutaiBonus.attack : 1;

        // ±5% random jitter on X so units aren't pixel-perfect stacked
        // (range: -0.05…+0.05 of mapW)
        var jitterX = (Math.random() - 0.5) * 0.10 * mapW;  // ±5%
        var spawnX  = Math.round(baseX + jitterX);
        var spawnY  = Math.round(baseY);

        return {
            id:          "convoy_npc_" + i,
            name:        name,
            faction:     CONFIG.factions.PLAYER,
            x:           spawnX,
            y:           spawnY,
            targetX:     spawnX,
            targetY:     spawnY,
            role:        "Military",
            troops:      c.troops,
            roster:      _buildRoster(c.rosterPct, c.troops),
            rosterMode:  "hard",
            hp:          Math.round(c.stats.hp     * hpMult),
            attack:      Math.round(c.stats.attack * atkMult),
            defense:     c.stats.defense,
            armor:       c.stats.armor,
            gold:        c.gold,
            food:        c.food,
            isImportant: true,
            portraitUrl: ART_PATHS.portraits[name] || "art/story2/Mongol_Infantry2.jpg"
        };
    });
}

// Player starts just east (+20 px) of the convoy cluster, same Y as baseY
// baseY = 0.01 * mapH = 0.01 * (187 * 16) ≈ 30 px
var _MAP_W    = CONFIG.map.tilesX * CONFIG.map.tileSize;  // 4000
var _MAP_H    = CONFIG.map.tilesY * CONFIG.map.tileSize;  // 2992
var _PLAYER_X = Math.round(0.30 * _MAP_W) + 20;          // cluster x + 20 px east
var _PLAYER_Y = Math.round(0.01 * _MAP_H);               // same top-of-corridor Y


// ============================================================================
// PLAYER SETUP
// ============================================================================

var PLAYER_SETUP = {
    x:          _PLAYER_X,
    y:          _PLAYER_Y,
    faction:    CONFIG.factions.PLAYER,
    troops:     CONFIG.player.troops,
    gold:       CONFIG.player.gold,
    food:       CONFIG.player.food,
    hp:         CONFIG.player.hp,
    maxHealth:  CONFIG.player.maxHealth,
    enemies:    [CONFIG.factions.ENEMY, "Bandits"],
    roster:     _buildRoster(CONFIG.player.rosterPct, CONFIG.player.troops),
    rosterMode: "hard",
    portraitUrl: ART_PATHS.portraits["Temür Noyan"]
};


// ============================================================================
// IMPORTANT NPCs
// ============================================================================

var IMPORTANT_NPCS = _buildConvoyNpcs().concat([
    // ── WESTERN CORRIDOR MISSION NPCs (v5.1) ─────────────────────────────────
    // Each of these is spawned on-demand when the relevant mission trigger fires.
    // Positions are approximate city-pixel anchors from story2_map_and_update.js
    // (world: 4000 × 2992; nx*4000, ny*2992 for Hexi Corridor map proportions).
    {
        id:       "xia_yanchi_captain",
        name:     "Fort Captain Bao Liang",
        faction:  CONFIG.factions.ENEMY,
        x: 350, y: 980,   // near Yanchi Pass Fort (west of Shazhou corridor)
        targetX: 350, targetY: 980,
        role:    "Military",
        troops:  28,
        roster:  _buildRoster({ "Shielded Infantry": 60, "Archer": 40 }, 28),
        rosterMode: "hard",
        hp: 180, attack: 14, defense: 12, armor: 10,
        gold: 80, food: 120,
        portraitUrl: ART_PATHS.portraits["Fort Captain Bao Liang"]
    },
    {
        id:       "xia_beacon_master",
        name:     "Beacon Master Wen Ju",
        faction:  CONFIG.factions.ENEMY,
        x: 285, y: 1048,   // Shazhou outer wall (nx≈0.07, ny≈0.35)
        targetX: 285, targetY: 1048,
        role:    "Military",
        troops:  15,
        roster:  _buildRoster({ "Archer": 60, "Spearman": 40 }, 15),
        rosterMode: "hard",
        hp: 140, attack: 12, defense: 10, armor: 8,
        gold: 50, food: 80,
        portraitUrl: ART_PATHS.portraits["Beacon Master Wen Ju"]
    },
    {
        id:       "xia_scout_commander",
        name:     "Scout Commander Dali",
        faction:  CONFIG.factions.ENEMY,
        x: 725, y: 1017,   // Guazhou (nx≈0.18, ny≈0.34)
        targetX: 725, targetY: 1017,
        role:    "Military",
        troops:  22,
        roster:  _buildRoster({ "Horse Archer": 70, "Spearman": 30 }, 22),
        rosterMode: "hard",
        hp: 160, attack: 15, defense: 11, armor: 9,
        gold: 70, food: 100,
        portraitUrl: ART_PATHS.portraits["Scout Commander Dali"]
    }
]);


// ============================================================================
// STORY INTRO  (unchanged from v3)
// ============================================================================

var STORY_INTRO = {
    enabled:   true,
    fadeMs:    1600,
    fadeColor: "#000000",

    titleCard: {
        title:    "The Wrath of the Khan",
        subtitle: "Second invasion of Western Xia — 1225.",
        ms:       4800
    },

    art:             ART_PATHS.marching_desert,
    art2:            ART_PATHS.hexi_mountains,
    art2OnLine:      4,
    art2CrossfadeMs: 1300,
    art2Caption:     "The KharaKhoto valley. One hundred and eighty thousand men. North to south.",

    artMs:    5200,
    kenburns: true,

    lines: [
{
    side: "left", name: "Narrator", color: "#d4b886",
    portrait: "art/story2/old_man.jpg",
    text: "In 1210, Genghis Khan demanded Western Xia to kneel. They did. " +
          "He demanded soldiers for his war against the Jin Dynasty. They gave them. " +
          "But in 1218, when he turned west toward Khwarazm — a campaign that would " +
          "swallow Persia whole — the Tangut Emperor Shenzong refused. " +
          "At his court stood Asha, commander of Western Xia's armies, who openly mocked the demand. " +
          "'If you lack the strength to fight, do not make war,' they told the Great Khan. " +
          "Whether spoken by the emperor or Asha himself, those words were remembered."
},
{
    keepLetterbox: true,
    side: "left", name: "Narrator", color: "#d4b886",
    portrait: "art/story2/old_man.jpg",
    text: "By 1221, Khwarazm lay in ruins. Samarkand, Urgench, Merv... cities that had " +
          "stood for centuries, gone in seasons. The Mongol machine had proven it could " +
          "devour empires. Now Genghis turned his attention back to the Tanguts. " +
          "In 1223, Emperor Shenzong, sensing what was coming, stepped down from power. " +
          "His son Xianzong took the throne, inheriting a kingdom with a death warrant " +
          "already written."
},
        {
            keepLetterbox: true,
            side: "left", name: "Narrator", color: "#d4b886",
            portrait: "art/story2/old_man.jpg",
            text: "The Western Xia Empire controlled the Hexi Corridor — the narrow strip of " +
                  "land between the Qilian Mountains and the Gobi Desert, the only viable road " +
                  "between China and Central Asia. Silk Road cities: Khara-Khoto, Shazhou, Guazhou, " +
                  "Suzhou, Ganzhou, Xiliang. To hold the Hexi Corridor was to tax every caravan " +
                  "that passed between East and West. The Mongols now wanted that road."
        },
{
    keepLetterbox: true,
    side: "left", name: "Narrator", color: "#d4b886",
    portrait: "art/story2/old_man.jpg",
    text: "In 1225, Genghis Khan crossed the Gobi with one hundred and eighty thousand men. " +
          "It was not an expedition. It was an extinction event. " +
          "Khara-Khoto, the Black Water City, is a northern fortress of the Western Xia frontier. " +
          "Asha, commander of the Tangut armies, could not march five hundred kilometres of desert to meet the Mongols in open battle, and so the frontier was left to hold until it broke, while he withdrew his frontier forces to the inner cities of Western Xia to strengthen their defences."
},
{
    keepLetterbox: true,
    side: "left", name: "Narrator", color: "#d4b886",
    portrait: "art/story2/old_man.jpg",
    text: "Genghis Khan understood the weakness of such a defense. Without a field army to meet, " +
          "the Mongols could choose their targets one by one, drawing prisoners, grain, weapons, and engineers " +
          "from each fallen city to strengthen the next siege. " +
          "You will play as Tëmur Noyan, a local commander riding under Genghis Khan and Subutai, " +
          "gathered before the assault on Khara-Khoto. " +
          "Behind you lies the desert they have already stripped bare."
},
        {
            keepLetterbox: true,
            side: "right", name: "Subutai", color: "#c0392b",
            portrait: "art/story2/Mongol_Officer1.jpg",
            text: "We are close to Khara-Khoto, the first city of the Tanguts."
        },
      {
    keepLetterbox: true,
    side: "right", name: "Genghis Khan", color: "#c8a200",
    portrait: "art/story2/Mongol_General.jpg",
    text: "The Tanguts bent the knee when it suited them, then mistook mercy for weakness. " +
          "They withheld men when I marched against the Jin. They believed distance and desert would protect them. " +
          "Now they hide behind their walls and wait for us to tire. " +
          "We have crossed the Gobi to teach them what happens to those who mistake patience for fear."
},
{
    keepLetterbox: true,
    side: "right", name: "Subutai", color: "#c0392b",
    portrait: "art/story2/Mongol_Officer1.jpg",
    text: "Khara-Khoto comes first. It guards the northern gate of the Hexi Corridor and anchors their frontier. " +
          
          "We break it first, take its grain, prisoners, and engineers, then decide how best to drive deeper into their lands."
},
{
    keepLetterbox: true,
    side: "left", name: "Temür Noyan", color: "#ffffff",
    portrait: "art/story2/Mongol_General.jpg",
    text: "Understood. I will follow the Great Khan and strike where commanded. " +
           
          "Then we make ready for whatever road south the Great Khan chooses."
}
    ],

    letterbox:     true,
    typewriterCps: 0,
    autoAdvance:   0
};


// ============================================================================
// SCENARIO VARS
// ============================================================================

var SCENARIO_VARS = {
    phase:         "march",
    escort_active: 0,
    intro_done:    0
};


// ============================================================================
// DATA
// ============================================================================

var DATA = {
    playerSetup:   PLAYER_SETUP,
    importantNpcs: IMPORTANT_NPCS,
    storyIntro:    STORY_INTRO,
    scenarioVars:  SCENARIO_VARS,
    triggers:      null
};

var FAC = CONFIG.factions;
var ESC = CONFIG.escort;
var SPD = CONFIG.convoySpeed;


// ============================================================================
// PRE-BUILD CONVOY SPAWN ACTIONS
// ============================================================================

var _CONVOY_SPAWN_ACTIONS = [];
for (var _ci = 0; _ci < CONFIG.convoy.names.length; _ci++) {
    _CONVOY_SPAWN_ACTIONS.push({
        type: "spawn_important_npc",
        params: { id: "convoy_npc_" + _ci }
    });
}

// ── Build add_convoy_stop actions from CONFIG.convoyRoute ────────────────────
// This keeps the editable route data in CONFIG (not buried in trigger JSON)
// while still using the registered action type.
var _CONVOY_STOP_ACTIONS = CONFIG.convoyRoute.map(function (stop) {
    return {
        type: "add_convoy_stop",
        params: {
            cityName:          stop.cityName,
            stayMs:            stop.stayMs,
            onArriveTriggerId: stop.onArriveTriggerId || ""
        }
    };
});


// ============================================================================
// TRIGGERS
//
// Naming convention:
//   t0_*      Boot / setup triggers (fire at or just after scenario_start)
//   t_arrive_* City arrival dialogue + siege activity triggers
//   wl_*      Win / Lose terminal triggers (future phases)
//
// Active triggers in this file (v6.0):
//   t0_purge              — sweep stray procedural NPCs (first 45 s)
//   t0_boot               — scenario_start: spawn convoy, start convoy system,
//                           add route stops, enable escort after grace period
//   t0_escort_warn        — player dist > 200 px → warning every 5 s
//   t0_escort_fail        — player dist > 500 px → defeat + menu reload
//   t0_spawn_ban_restamp  — re-stamp NPC role ban every 60 s
//   t_arrive_KharaKhoto      — KharaKhoto Commandary siege + 20-second sack sequence
//   t_arrive_divide       — army divides; Genghis east (Suzhou siege begins);
//                           Subutai + player head west
//   t_mission_yanchi      — Mission 1: raid Yanchi Pass granary fort
//   t_mission_yanchi_done — Mission 1 done; Subutai issues Mission 2
//   t_mission_changle_ultimatum — Mission 2: deliver ultimatum to Changle
//   t_mission_changle_done      — Changle surrenders; Mission 3 issued
//   t_mission_guazhou_screen    — Mission 3: screen Guazhou from Xia scouts
//   t_mission_guazhou_done      — Guazhou clear; Mission 4 / Shazhou march
//   t_mission_shazhou_stuck     — Shazhou stalls Subutai; player sent as messenger
//   t_arrive_suzhou       — player meets Genghis; joint siege of Suzhou
//   t_arrive_ganzhou      — Chagaan negotiation, coup, 5-month siege, mercy
//   t_arrive_xiliang      — Wuwei surrenders; brief rest
//   t_arrive_xingqing     — Capital siege; Genghis's health fails
// ============================================================================

var TRIGGERS = [

    // ════════════════════════════════════════════════════════════════════════
    // T0.PRE — PURGE STRAY PROCEDURAL NPCs (first 45 s, every 2 s)
    // ════════════════════════════════════════════════════════════════════════
    {
        id: "t0_purge",
        name: "Pre-Boot — Purge Stray Procedural NPCs",
        enabled: true, once: false, activatedBy: null,
        conditions: [
            { type: "custom_js", params: {
                code: [
                    "if (typeof window.__mc_purgeLast === 'undefined') window.__mc_purgeLast = -99;",
                    "if (ctx.elapsedSec > 45) return false;",
                    "if (ctx.elapsedSec - window.__mc_purgeLast < 2) return false;",
                    "window.__mc_purgeLast = ctx.elapsedSec;",
                    "return true;"
                ].join("\n")
            }}
        ],
        actions: [
            { type: "custom_js", params: {
                code: [
                    "var _banRoles = ['Commerce','Patrol','Civilian','Military'];",
                    "function _isConvoy(n) { return n.id && n.id.indexOf('convoy_npc_') === 0; }",
                    "if (window.globalNPCs) {",
                    "    var _b = window.globalNPCs.length;",
                    "    window.globalNPCs = window.globalNPCs.filter(function(n) {",
                    "        if (_isConvoy(n)) return true;",
                    "        if (_banRoles.indexOf(n.role) !== -1) return false;",
                    "        if (n.faction === 'Xiaran Dominion' && !n.isImportant) return false;",
                    "        return true;",
                    "    });",
                    "    var _p = _b - window.globalNPCs.length;",
                    "    if (_p > 0) console.log('[MongolConquest] Purged', _p, 'stray NPC(s).');",
                    "}"
                ].join("\n")
            }}
        ]
    },

    // ════════════════════════════════════════════════════════════════════════
    // T0.BOOT — SCENARIO START  (fires once, after intro completes)
    //
    //  1. Set war relation
    //  2. Set player gold/food
    //  3. Spawn all 15 convoy NPCs
    //  4. Purge any Mongol-owned cities (one-shot via start_npc_convoy param)
    //  5. START convoy system (start_npc_convoy) — boots tick loop, formation
    //  6. ADD all route stops (add_convoy_stop × N)
    //  7. Enable escort after 4 s grace period
    //  8. Subtitle + log
    //  9. Set vars + spawn ban restamp
    // ════════════════════════════════════════════════════════════════════════
    {
        id: "t0_boot",
        name: "Phase 0 — Convoy Deploys at KharaKhoto",
        enabled: true, once: true, activatedBy: null,
        conditions: [ { type: "scenario_start", params: {} } ],
        actions: (function () {
            var acts = [];

            // 1. War relation
            acts.push({ type: "set_relation", params: { a: FAC.PLAYER, b: FAC.ENEMY, rel: "War" } });

            // 2. Player resources
            acts.push({ type: "set_player_stats", params: { gold: CONFIG.player.gold, food: CONFIG.player.food } });

            // 3. Spawn all 15 convoy NPCs
            _CONVOY_SPAWN_ACTIONS.forEach(function (a) { acts.push(a); });

            // 4 + 5. Start convoy system — purgeOwnedCities removes any
            //         Mongol Empire city that spawned during map gen.
            //         Formation is built automatically from followerIds (NPC 1–14).
            //         Leader = convoy_npc_0 (Genghis Khan).
            acts.push({
                type: "start_npc_convoy",
                params: {
                    leaderId:          "convoy_npc_0",
                    followerIds:       (function () {
                        // Build comma-separated list "convoy_npc_1,convoy_npc_2,...,convoy_npc_14"
                        var ids = [];
                        for (var i = 1; i < CONFIG.convoy.names.length; i++) ids.push("convoy_npc_" + i);
                        return ids.join(",");
                    })(),
                    spacingPx:          CONFIG.convoy.spacing,    // 65 — matches spawn gap
                    leaderSpeedPxSec:   SPD.leaderPxSec,          // 80
                    followerSpeedPxSec: SPD.followerPxSec,        // 110
                    arrivalRadiusPx:    SPD.arrivalPx,            // 8
                    purgeOwnedCities:   FAC.PLAYER                // "Mongol Empire"
                }
            });

            // 5b. BULLET-PROOF FOLLOWER PATCH
            // Overrides _tickFollowers on the live convoy state object so that:
            //   • Followers use safe, NaN-guarded math
            //   • Each follower target has ±1% x/y randomness (dithered per tick)
            //   • window.player is NEVER touched — guard checks unit identity
            //   • Overshooting is clamped (step ≥ dist → snap to target exactly)
            //   • Missing NPCs are skipped silently
            // The patch REPLACES the rAF tick loop so closure references are intercepted.
            acts.push({ type: "custom_js", params: {
                code: [
                    "(function _patchConvoyFollowers() {",
                    "    var _S = window.__ScenarioConvoy;",
                    "    if (!_S) {",
                    "        console.warn('[MC] __ScenarioConvoy not ready — follower patch retrying…');",
                    "        setTimeout(_patchConvoyFollowers, 300);",
                    "        return;",
                    "    }",
                    "",
                    "    // Per-follower smooth-random phase offsets (stable across frames)",
                    "    var _phases = [];",
                    "",
                    "    // ── Helpers (self-contained — no closure deps on convoy internals) ──",
                    "    function _findNpc(id) {",
                    "        var arr = window.globalNPCs;",
                    "        if (!arr) return null;",
                    "        for (var i = 0; i < arr.length; i++) {",
                    "            if (arr[i] && (arr[i].storyId === id || arr[i].id === id + '__story')) return arr[i];",
                    "        }",
                    "        return null;",
                    "    }",
                    "    function _cityPos(name) {",
                    "        var arr = window.cities_sandbox || window.cities || [];",
                    "        for (var i = 0; i < arr.length; i++) {",
                    "            if (arr[i].name === name) return arr[i];",
                    "        }",
                    "        return null;",
                    "    }",
                    "    function _dist2(ax, ay, bx, by) {",
                    "        var dx = ax - bx, dy = ay - by;",
                    "        var d = Math.sqrt(dx * dx + dy * dy);",
                    "        return isFinite(d) ? d : 0;",
                    "    }",
                    "    function _stepUnit(npc, tx, ty, speedPxSec, dt) {",
                    "        var dx = tx - npc.x, dy = ty - npc.y;",
                    "        var d = _dist2(npc.x, npc.y, tx, ty);",
                    "        if (d <= _S.arrivalRadiusPx) { npc.x = tx; npc.y = ty; return true; }",
                    "        var step = (speedPxSec * dt) / 1000;",
                    "        if (!isFinite(step) || step <= 0) return false;",
                    "        if (step >= d) { npc.x = tx; npc.y = ty; return true; }",
                    "        npc.x += (dx / d) * step;",
                    "        npc.y += (dy / d) * step;",
                    "        npc.targetX = tx; npc.targetY = ty;",
                    "        return false;",
                    "    }",
                    "",
                    "    // ── 3-Column formation slot builder ────────────────────────────────────",
                    "    // 14 followers (indices 0–13) laid out as 3 columns:",
                    "    //   Col L (−colGap): indices 0,3,6,9,12",
                    "    //   Col C (0):       indices 1,4,7,10,13",
                    "    //   Col R (+colGap): indices 2,5,8,11",
                    "    // Each row is rowGap px deeper than the one before.",
                    "    // A small per-NPC random wobble (±wobble px, sin-wave) keeps the",
                    "    // formation from looking mechanical without breaking cohesion.",
                    "    var _colGap  = 4;    // px lateral gap L/R from centre (v6.0 tight)",
                    "    var _rowGap  = 7;    // px depth per row (v6.0 tight)",
                    "    var _wobble  = 2;    // px amplitude of organic wobble (reduced for tight column)",
                    "    var _phases  = [];   // per-follower sin phase",
                    "    // Column assignment: 3 columns cycling 0→L, 1→C, 2→R",
                    "    var _colOffsets = [-_colGap, 0, _colGap];",
                    "",
                    "    function _slotFor3Col(i) {",
                    "        var col = i % 3;",
                    "        var row = Math.floor(i / 3) + 1;",
                    "        return { dx: _colOffsets[col], dy: row * _rowGap };",
                    "    }",
                    "",
                    "    // Initialise slots at 3-column layout",
                    "    (function _initSlots() {",
                    "        if (!_S.formationSlots) _S.formationSlots = [];",
                    "        for (var i = 0; i < _S.followerIds.length; i++) {",
                    "            _S.formationSlots[i] = _slotFor3Col(i);",
                    "        }",
                    "        window.__mc_formation = '3col';",
                    "        console.log('[MC] Formation initialised: 3-column (' + _S.followerIds.length + ' followers)');",
                    "    })();",
                    "",
                    "    // ── Safe follower tick ──────────────────────────────────────────────────",
                    "    function _safeFollowers(leader, dt) {",
                    "        if (!leader || !isFinite(leader.x) || !isFinite(leader.y)) return;",
                    "",
                    "        // March direction unit vector: leader → current city stop",
                    "        var mx = 0, my = 1;",
                    "        var stop = _S.route[_S.routeIndex];",
                    "        if (stop) {",
                    "            var tp = _cityPos(stop.cityName);",
                    "            if (tp && isFinite(tp.x) && isFinite(tp.y)) {",
                    "                var ddx = tp.x - leader.x, ddy = tp.y - leader.y;",
                    "                var dlen = _dist2(leader.x, leader.y, tp.x, tp.y);",
                    "                if (dlen > 0.1) { mx = ddx / dlen; my = ddy / dlen; }",
                    "            }",
                    "        }",
                    "        // Perpendicular (lateral) axis",
                    "        var px = -my, py = mx;",
                    "",
                    "        for (var i = 0; i < _S.followerIds.length; i++) {",
                    "            var npc = _findNpc(_S.followerIds[i]);",
                    "            if (!npc || npc === window.player) continue;",
                    "            if (!isFinite(npc.x) || !isFinite(npc.y)) { npc.x = leader.x; npc.y = leader.y; continue; }",
                    "",
                    "            var slot = _S.formationSlots[i] || _slotFor3Col(i);",
                    "            var slotDy = isFinite(slot.dy) ? slot.dy : (Math.floor(i/3)+1) * _rowGap;",
                    "            var slotDx = isFinite(slot.dx) ? slot.dx : _colOffsets[i % 3];",
                    "",
                    "            // Formation target: leader + slot projected onto march/lateral axes",
                    "            var tx = leader.x + (-mx) * slotDy + px * slotDx;",
                    "            var ty = leader.y + (-my) * slotDy + py * slotDx;",
                    "",
                    "            // Organic wobble: slow sin-wave per follower (±8 px, ~4 s cycle)",
                    "            if (!_phases[i]) _phases[i] = Math.random() * Math.PI * 2;",
                    "            _phases[i] += 0.0016;   // ~4 s full cycle at 60 Hz",
                    "            tx += Math.sin(_phases[i])                 * _wobble;",
                    "            ty += Math.sin(_phases[i] + Math.PI / 3)   * _wobble;",
                    "",
                    "            if (!isFinite(tx) || !isFinite(ty)) continue;",
                    "            _stepUnit(npc, tx, ty, _S.followerSpeedPxSec, dt);",
                    "        }",
                    "    }",
                    "",
                    "    // ── Replace rAF tick with a patched version ──────────────────────────",
                    "    // Stop existing loop, install new tick that calls _safeFollowers instead",
                    "    // of the original closure-bound _tickFollowers.",
                    "    function _patchedConvoyTick(timestamp) {",
                    "        if (!_S.active) return;",
                    "        if (_S._lastMs === null) _S._lastMs = timestamp;",
                    "        var dt = Math.min(timestamp - _S._lastMs, 100);",
                    "        _S._lastMs = timestamp;",
                    "",
                    "        var leader = _findNpc(_S.leaderId);",
                    "",
                    "        if (_S.staying || !leader) {",
                    "            if (leader) _safeFollowers(leader, dt);",
                    "            _S._rafId = requestAnimationFrame(_patchedConvoyTick);",
                    "            return;",
                    "        }",
                    "",
                    "        var stop = _S.route[_S.routeIndex];",
                    "        if (!stop) {",
                    "            _S.active = false;",
                    "            _safeFollowers(leader, dt);",
                    "            console.log('[MC-Convoy] Route complete.');",
                    "            return;",
                    "        }",
                    "",
                    "        var target = _cityPos(stop.cityName);",
                    "        if (!target) { _S.routeIndex++; _S._rafId = requestAnimationFrame(_patchedConvoyTick); return; }",
                    "",
                    "        // Move leader",
                    "        var ldx = target.x - leader.x, ldy = target.y - leader.y;",
                    "        var ld = _dist2(leader.x, leader.y, target.x, target.y);",
                    "        var arrived = false;",
                    "        if (ld <= _S.arrivalRadiusPx) {",
                    "            arrived = true;",
                    "        } else {",
                    "            var lstep = (_S.leaderSpeedPxSec * dt) / 1000;",
                    "            if (lstep >= ld) { leader.x = target.x; leader.y = target.y; arrived = true; }",
                    "            else { leader.x += (ldx / ld) * lstep; leader.y += (ldy / ld) * lstep; }",
                    "            leader.targetX = target.x; leader.targetY = target.y;",
                    "        }",
                    "        _safeFollowers(leader, dt);",
                    "",
                    "        if (arrived) {",
                    "            console.log('[MC-Convoy] Reached ' + stop.cityName + ' — staying ' + stop.stayMs + 'ms');",
                    "            _S.staying = true;",
                    "            _S.completedStops.push(_S.routeIndex);",
                    "            if (stop.onArriveTriggerId && window.ScenarioTriggers && window.ScenarioTriggers.fireTrigger) {",
                    "                window.ScenarioTriggers.fireTrigger(stop.onArriveTriggerId);",
                    "            }",
                    "            _S.stayHandle = setTimeout(function () {",
                    "                _S.staying = false; _S.routeIndex++;",
                    "                var nxt = _S.route[_S.routeIndex];",
                    "                console.log('[MC-Convoy] Departing → ' + (nxt ? nxt.cityName : '(done)'));",
                    "            }, stop.stayMs);",
                    "        }",
                    "        _S._rafId = requestAnimationFrame(_patchedConvoyTick);",
                    "    }",
                    "",
                    "    // Hot-swap: cancel old rAF, restart with patched tick",
                    "    if (_S._rafId) { cancelAnimationFrame(_S._rafId); _S._rafId = null; }",
                    "    if (_S.active) {",
                    "        _S._lastMs = null;",
                    "        _S._rafId  = requestAnimationFrame(_patchedConvoyTick);",
                    "        console.log('[MC] ✅ Bullet-proof convoy tick installed (1% follower randomness, player-safe).');",
                    "    } else {",
                    "        // Convoy not yet active — wait for it then re-run patch",
                    "        var _waitActive = setInterval(function () {",
                    "            if (!_S.active) return;",
                    "            clearInterval(_waitActive);",
                    "            if (_S._rafId) { cancelAnimationFrame(_S._rafId); _S._rafId = null; }",
                    "            _S._lastMs = null;",
                    "            _S._rafId  = requestAnimationFrame(_patchedConvoyTick);",
                    "            console.log('[MC] ✅ Bullet-proof convoy tick installed (deferred, 1% follower randomness).');",
                    "        }, 200);",
                    "    }",
                    "})();"
                ].join("\n")
            }});

            // 6. Push all route stops (order defines march sequence)
            _CONVOY_STOP_ACTIONS.forEach(function (a) { acts.push(a); });

            // 7. Grace-period escort enable (4 s after start, via custom_js timer)
            //    We keep this as custom_js because setTimeout isn't a trigger action
            //    and the 4 s grace is UX-only, not logic-bearing.
            acts.push({ type: "custom_js", params: {
                code: [
                    "window.__mc_escortActive = false;",
                    "console.log('[MongolConquest] Escort INACTIVE (4 s grace period).');",
                    "setTimeout(function () {",
                    "    window.__mc_escortActive = true;",
                    "    console.log('[MongolConquest] Escort ACTIVE.');",
                    "    if (window.StoryPresentation && window.StoryPresentation.showSubtitle) {",
                    "        window.StoryPresentation.showSubtitle(",
                    "            '🐴 Follow the column. Do not fall behind.',",
                    "            5000, '#f5d76e'",
                    "        );",
                    "    }",
                    "}, 4000);"
                ].join("\n")
            }});

            // 8a. Subtitle at boot
            acts.push(_sub(
                "KharaKhoto Commandary — Autumn 1225.  Follow Genghis Khan's column south.",
                8000, "#f5d76e"
            ));

            // 8b. Log event
            acts.push(_log(
                "🏹 1225 — The Great Khan's column departs KharaKhoto Commandary. " +
                "Temür Noyan rides at the rear. Follow the convoy south. Do not fall behind.",
                "general"
            ));

            // 9. Vars + spawn ban restamp
            acts.push({ type: "set_var", params: { name: "phase",         value: "march" } });
            acts.push({ type: "set_var", params: { name: "intro_done",    value: 1 } });
            acts.push({ type: "set_var", params: { name: "escort_active", value: 1 } });
            acts.push({ type: "set_npc_spawn_ban", params: {
                roles: ["Commerce", "Patrol", "Civilian", "Military"],
                factions: []
            }});

            return acts;
        })()
    },

    // ════════════════════════════════════════════════════════════════════════
    // T0.ESCORT_WARN — DISTANCE WARNING (repeating, every 5 s)
    //
    // Fires when player is between warnPx (200) and failPx (500) from the tail.
    // ════════════════════════════════════════════════════════════════════════
    {
        id: "t0_escort_warn",
        name: "Escort — Distance Warning (> " + ESC.warnPx + " px from tail)",
        enabled: true, once: false, activatedBy: "t0_boot",
        conditions: [
            { type: "custom_js", params: {
                code: [
                    "if (!window.__mc_escortActive) return false;",
                    "if (typeof window.__mc_warnLast === 'undefined') window.__mc_warnLast = -99;",
                    "if (ctx.elapsedSec - window.__mc_warnLast < 5) return false;",
                    "var _npc = (window.globalNPCs || []).find(function(n) {",
                    "    return n.storyId === '" + ESC.tailId + "' || n.id === '" + ESC.tailId + "__story';",
                    "});",
                    "if (!_npc || !window.player) return false;",
                    "var _dx = window.player.x - _npc.x, _dy = window.player.y - _npc.y;",
                    "window.__mc_escortDist = Math.sqrt(_dx*_dx + _dy*_dy);",
                    "return window.__mc_escortDist > " + ESC.warnPx + " && window.__mc_escortDist <= " + ESC.failPx + ";"
                ].join("\n")
            }}
        ],
        actions: [
            { type: "custom_js", params: {
                code: [
                    "window.__mc_warnLast = ctx.elapsedSec;",
                    "var _d = Math.round(window.__mc_escortDist || 0);",
                    "if (typeof window.logGameEvent === 'function') {",
                    "    window.logGameEvent(",
                    "        '⚠️ Temür! You are falling behind the column! Distance: ' + _d + ' px',",
                    "        'warning'",
                    "    );",
                    "}",
                    "if (window.StoryPresentation && window.StoryPresentation.showSubtitle) {",
                    "    window.StoryPresentation.showSubtitle(",
                    "        '⚠️  You are falling behind the column! Close up!',",
                    "        4000, '#ff8c00'",
                    "    );",
                    "}"
                ].join("\n")
            }}
        ]
    },

    // ════════════════════════════════════════════════════════════════════════
    // T0.ESCORT_FAIL — SEPARATION DEFEAT (once)
    //
    // Player is beyond failPx (500) from the tail.
    // Shows message, fades to black, then reloads to the main menu.
    // ════════════════════════════════════════════════════════════════════════
    {
        id: "t0_escort_fail",
        name: "Escort — Separation Defeat (> " + ESC.failPx + " px from tail)",
        enabled: true, once: true, activatedBy: "t0_boot",
        conditions: [
            { type: "custom_js", params: {
                code: [
                    "if (!window.__mc_escortActive) return false;",
                    "var _npc = (window.globalNPCs || []).find(function(n) {",
                    "    return n.storyId === '" + ESC.tailId + "' || n.id === '" + ESC.tailId + "__story';",
                    "});",
                    "if (!_npc || !window.player) return false;",
                    "var _dx = window.player.x - _npc.x, _dy = window.player.y - _npc.y;",
                    "return Math.sqrt(_dx*_dx + _dy*_dy) > " + ESC.failPx + ";"
                ].join("\n")
            }}
        ],
        actions: [
            { type: "stop_npc_convoy", params: {} },
            { type: "custom_js", params: {
                code: [
                    "window.__mc_escortActive = false;",
                    "if (typeof window.logGameEvent === 'function') {",
                    "    window.logGameEvent(",
                    "        '☠️  Temür Noyan lost contact with the column. The army marches on.',",
                    "        'defeat'",
                    "    );",
                    "}",
                    "// Show subtitle then fade and reload to menu",
                    "if (window.StoryPresentation && window.StoryPresentation.showSubtitle) {",
                    "    window.StoryPresentation.showSubtitle(",
                    "        '☠️  You have lost the column.  The Great Khan does not look back.',",
                    "        0, '#cc0000'",
                    "    );",
                    "}",
                    "setTimeout(function () {",
                    "    if (window.StoryPresentation && window.StoryPresentation.fadeOut) {",
                    "        window.StoryPresentation.fadeOut(2000, '#000000');",
                    "    }",
                    "    setTimeout(function () {",
                    "        // Return to menu — cleanest retry path",
                    "        try { window.location.reload(); }",
                    "        catch(e) { window.location.href = window.location.href; }",
                    "    }, 2200);",
                    "}, 1800);"
                ].join("\n")
            }}
        ]
    },

    // ════════════════════════════════════════════════════════════════════════
    // T0.SPAWN_BAN_RESTAMP — re-stamp NPC role ban every 60 s
    // ════════════════════════════════════════════════════════════════════════
    {
        id: "t0_spawn_ban_restamp",
        name: "Ongoing — NPC Spawn Ban Restamp (every 60 s)",
        enabled: true, once: false, activatedBy: null,
        conditions: [
            { type: "custom_js", params: {
                code: [
                    "if (typeof window.__mc_banLast === 'undefined') window.__mc_banLast = 0;",
                    "if (ctx.elapsedSec - window.__mc_banLast < 60) return false;",
                    "window.__mc_banLast = ctx.elapsedSec;",
                    "return true;"
                ].join("\n")
            }}
        ],
        actions: [
            { type: "set_npc_spawn_ban", params: {
                roles: ["Commerce", "Patrol", "Civilian", "Military"],
                factions: []
            }}
        ]
    },

    // ════════════════════════════════════════════════════════════════════════
    // CITY ARRIVAL TRIGGERS
    // Each fires once when the convoy arrives at its stop (via onArriveTriggerId).
    // Sequences use staggered subtitles + a log entry to simulate siege activity.
    // ════════════════════════════════════════════════════════════════════════

    // ── KharaKhoto COMMANDARY — siege, 20-second sack timer, then army divide ───
    // activatedBy: "t0_boot" ensures this trigger only becomes eligible after boot.
    // conditions: "return false" means it NEVER fires from the condition-eval loop —
    // it fires ONLY when the convoy system calls ScenarioTriggers.fireTrigger(id).
    // FIX (v6.1): Full siege dialogue + "KharaKhoto is sacked" text only fires AFTER
    // the 20-second timer, NOT immediately on arrival. Army then splits into two
    // clearly labelled armies: Genghis Khan's eastern force and Subutai's western
    // detachment, with a proper handoff dialogue sequence.
    {
        id: "t_arrive_KharaKhoto",
        name: "Arrival — KharaKhoto Commandary (Khara-Khoto) — Siege + Sack Timer",
        enabled: true, once: true, activatedBy: "t0_boot",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            // ── Arrival: Siege begins ─────────────────────────────────────────
            _log("⚔️ 1225 — The Mongol vanguard reaches KharaKhoto Commandary (Khara-Khoto). Siege engines are brought forward. The walls are manned.", "general"),
            { type: "show_dialogue", params: {
                speaker: "Genghis Khan", portrait: ART_PATHS.portraits["Genghis Khan"],
                text: "KharaKhoto Commandary. The northern anchor of the Xia defence line. " +
                      "If it stands, every city south of here will believe the walls can hold. " +
                      "It must not stand. Bring up the siege engines. I want this over before the cold sets in.",
                color: "#c8a200"
            }},
            { type: "show_dialogue", params: {
                speaker: "Subutai", portrait: ART_PATHS.portraits["Subutai"],
                text: "The garrison has closed the gates. They have water, food for two weeks, maybe three. " +
                      "We do not need to wait them out. We cut the water channel first, " +
                      "then we breach the north gate. Temür — watch the east wall. " +
                      "If any rider gets out, they warn Suzhou.",
                color: "#c0392b"
            }},
            { type: "show_dialogue", params: {
                speaker: "Tangut Defender", portrait: ART_PATHS.portraits["Tangut Defender"],
                text: "Hold the north gate! Archers to the walls — do not let them reach the ram! " +
                      "Send a rider east — someone must warn Suzhou and Ganzhou that the Mongols are here!",
                color: "#8b0000"
            }},
            { type: "show_dialogue", params: {
                speaker: "Temür Noyan", portrait: ART_PATHS.portraits["Temür Noyan"],
                text: "We cut down the messenger before he clears the east road. " +
                      "The ram is at the gate. The walls are thin here — this will not take long.",
                color: "#ffffff"
            }},
            // ── 20-second siege timeline ──────────────────────────────────────
            // "KharaKhoto is sacked" text is withheld until the timer runs out.
            { type: "custom_js", params: {
                code: [
                    "// Staggered siege subtitles — begins AFTER dialogue resolves.",
                    "// The final 'KharaKhoto is sacked' line fires only at t=20s,",
                    "// matching the convoy stayMs (28000ms) so the army does not",
                    "// depart before the sack is announced.",
                    "var SP = window.StoryPresentation;",
                    "var subs = [",
                    "    [4000,  '🪨 Mongol catapults breach the north-wall parapet. Garrison archers retreat from the battlements.'],",
                    "    [8000,  '🔥 Water channel diverted. The cisterns will be dry by nightfall.'],",
                    "    [12000, '⚔️ Ram reaches the north gate. Tangut defenders fight street by street inside the walls.'],",
                    "    [16000, '🏴 The garrison commander is cut down in the market square. Resistance collapses.'],",
                    "    [20000, '🏴 KharaKhoto Commandary is sacked. Khara-Khoto — the Black City — falls to the Mongol Empire.']",
                    "];",
                    "(function _waitDialogueThenSubs() {",
                    "    if (window.__ST_dialogueBusy) { setTimeout(_waitDialogueThenSubs, 200); return; }",
                    "    subs.forEach(function(s) {",
                    "        setTimeout(function() {",
                    "            if (SP && SP.showSubtitle) SP.showSubtitle(s[1], 4500, s[0] >= 20000 ? '#ff4444' : '#e8a030');",
                    "            if (typeof window.logGameEvent === 'function') window.logGameEvent(s[1], s[0] >= 20000 ? 'war' : 'general');",
                    "        }, s[0]);",
                    "    });",
                    "    // Set the sack-done flag so the post-sack divide dialogue can fire.",
                    "    setTimeout(function() { window.__mc_KharaKhoto_sacked = true; }, 21000);",
                    "})();"
                ].join("\n")
            }},
            // ── Post-sack: army divide dialogue (fires after sack text) ──────
            { type: "custom_js", params: {
                code: [
                    "// Wait for both dialogue and sack timer before showing divide dialogue.",
                    "var SP = window.StoryPresentation;",
                    "(function _waitForSackThenDivide() {",
                    "    if (!window.__mc_KharaKhoto_sacked || window.__ST_dialogueBusy) {",
                    "        setTimeout(_waitForSackThenDivide, 300);",
                    "        return;",
                    "    }",
                    "    // Short pause after sack text before the commanders speak.",
                    "    setTimeout(function() {",
                    "        if (!window.ScenarioTriggers || !window.ScenarioTriggers.fireTrigger) return;",
                    "        window.ScenarioTriggers.fireTrigger('t_arrive_KharaKhoto_divide_dialogue');",
                    "    }, 2000);",
                    "})();"
                ].join("\n")
            }}
        ]
    },

    // ── KharaKhoto POST-SACK: ARMY DIVIDE DIALOGUE (auto-fired from t_arrive_KharaKhoto) ──
    // Shows after the 20-second sack timer. Clearly communicates that the army
    // splits into two forces — Genghis Khan east, Subutai west — before the
    // convoy resumes its march south.
    {
        id: "t_arrive_KharaKhoto_divide_dialogue",
        name: "Post-Sack — KharaKhoto Army Divide Dialogue",
        enabled: true, once: true, activatedBy: "t_arrive_KharaKhoto",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            { type: "show_dialogue", params: {
                speaker: "Narrator", portrait: ART_PATHS.portraits["Narrator"],
                text: "KharaKhoto Commandary has fallen. The Great Khan surveys the burning city from the north gate. " +
                      "The corridor south is open. 180,000 men wait for orders. " +
                      "This is the moment the campaign divides — two armies, two roads, one objective.",
                color: "#d4b886"
            }},
            { type: "show_dialogue", params: {
                speaker: "Genghis Khan", portrait: ART_PATHS.portraits["Genghis Khan"],
                text: "Subutai. Here is where we separate. " +
                      "You take your tümen — ten thousand riders — and sweep the western corridor. " +
                      "Shazhou, Guazhou, Changle. Strip them clean, leave no garrison standing. " +
                      "I take the main force east along the Ruo Shui toward Suzhou. " +
                      "We meet again at Ganzhou — nothing between here and there survives.",
                color: "#c8a200"
            }},
            { type: "show_dialogue", params: {
                speaker: "Subutai", portrait: ART_PATHS.portraits["Subutai"],
                text: "Understood. My tümen takes the western road at dawn. " +
                      "Every city in the western corridor will fall before the Great Khan reaches Suzhou. " +
                      "The Xia will have no supply line, no relief route, and no hope from the west.",
                color: "#c0392b"
            }},
            { type: "show_dialogue", params: {
                speaker: "Genghis Khan", portrait: ART_PATHS.portraits["Genghis Khan"],
                text: "Temür Noyan rides with Subutai until the western work is done. " +
                      "When Subutai has no more use for him, he finds me at Ganzhou. " +
                      "Those are your orders, Temür. Follow Subutai's column. Do not lose him.",
                color: "#c8a200"
            }},
            { type: "show_dialogue", params: {
                speaker: "Temür Noyan", portrait: ART_PATHS.portraits["Temür Noyan"],
                text: "I ride with Subutai's western force. " +
                      "One hundred cavalry — what I was given at the start of this campaign. " +
                      "I will be where Subutai points me, and I will rejoin the Great Khan at Ganzhou.",
                color: "#ffffff"
            }},
            { type: "show_dialogue", params: {
                speaker: "Narrator", portrait: ART_PATHS.portraits["Narrator"],
                text: "Two armies depart from the ruins of KharaKhoto Commandary. " +
                      "Genghis Khan's main host — the bulk of 180,000 — drives south along the Ruo Shui toward Suzhou. " +
                      "Subutai's western tümen turns southwest into the Gobi desert. " +
                      "The Hexi Corridor is about to be taken from both ends simultaneously.",
                color: "#d4b886"
            }},
            _sub("The army divides. Genghis Khan rides east — Subutai takes the western corridor.", 8000, "#f5d76e"),
            _log("⚔️ 1225 — Khara-Khoto falls. The Mongol host divides: Genghis Khan drives south toward Suzhou; Subutai's tümen sweeps the western corridor.", "general")
        ]
    },

    // ── ARMY DIVIDE POINT — Subutai splits west ──────────────────────────────
    {
        id: "t_arrive_divide",
        name: "Arrival — Army Divide Point (Ruo Shui bend)",
        enabled: true, once: true, activatedBy: "t0_boot",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            _sub("The Ruo Shui bends east. The army divides.", 7000, "#f5d76e"),
            _log("⚔️ 1226 — At the great bend of the Ruo Shui, Genghis divides the host. Subutai takes the western corridor. The main force drives east.", "general"),
            { type: "show_dialogue", params: {
                speaker: "Genghis Khan", portrait: ART_PATHS.portraits["Genghis Khan"],
                text: "Subutai. Shazhou. Guazhou. Changle. Strip them from the west. " +
                      "Leave nothing standing that did not kneel. We take Suzhou from the east.",
                color: "#c8a200"
            }},
            { type: "show_dialogue", params: {
                speaker: "Subutai", portrait: ART_PATHS.portraits["Subutai"],
                text: "It will be done. I take my tümen west. We will close the corridor " +
                      "like a fist from both sides. Suzhou will have nowhere to send for help.",
                color: "#c0392b"
            }},
            { type: "show_dialogue", params: {
                speaker: "Narrator", portrait: ART_PATHS.portraits["Narrator"],
                text: "The western force peels away into the desert haze. The main column — " +
                      "Genghis, Tolui, Ögedei, and the centre tümens — swings east. " +
                      "You ride with the centre. Suzhou is three days' march ahead.",
                color: "#d4b886"
            }},
            // Shift formation to 2-column after Subutai departs
            { type: "custom_js", params: {
                code: [
                    "// After Subutai (NPC 1) departs the main column, shift remaining",
                    "// followers to a tighter 2-column formation.",
                    "var _S = window.__ScenarioConvoy;",
                    "if (_S && _S.formationSlots) {",
                    "    var col = 55;  // px lateral gap between columns",
                    "    var gap = 70;  // px depth per row",
                    "    // followerIds[0] was Subutai (convoy_npc_1) — keep its slot but",
                    "    // the NPC is gone; remaining NPCs 2–14 (indices 1–13) get 2-col layout",
                    "    for (var i = 0; i < _S.followerIds.length; i++) {",
                    "        var col2 = (i % 2 === 0) ? -col : col;",
                    "        var row2 = Math.floor(i / 2) + 1;",
                    "        _S.formationSlots[i] = { dx: col2, dy: row2 * gap };",
                    "    }",
                    "    window.__mc_formation = '2col';",
                    "    console.log('[MC] Formation shifted to 2-column after army divide.');",
                    "}"
                ].join("\n")
            }}
        ]
    },

    // ════════════════════════════════════════════════════════════════════════
    // SUBUTAI'S WESTERN CORRIDOR — MISSION TRIGGERS  (v5.0)
    //
    // The convoy splits at the Ruo Shui bend. Subutai's detachment takes the
    // player west through four cities before rejoining the main force at Ganzhou.
    //
    // Each mission trigger fires via the convoy's fireTrigger(onArriveTriggerId).
    // conditions: "return false" — never self-fires; only via fireTrigger().
    // activatedBy: "t0_boot"    — won't even evaluate until boot completes.
    //
    // The staggered subtitles inside each trigger wait for any open dialogue to
    // complete (_waitDialogueThenSubs pattern) before starting their timer chain.
    // ════════════════════════════════════════════════════════════════════════

    // ── YANCHI PASS FORT — Mission 1: Raid the granary ───────────────────────
    {
        id: "t_mission_yanchi",
        name: "Mission 1 — Yanchi Pass Fort (raid granary)",
        enabled: true, once: true, activatedBy: "t0_boot",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            _sub("Yanchi Pass Fort — raid the granary before it warns Shazhou.", 7000, "#e8a030"),
            _log("⚔️ Mission 1 — Subutai orders: storm the Yanchi Pass granary fort. Silence it before it can send riders to warn Shazhou.", "general"),
            { type: "show_dialogue", params: {
                speaker: "Subutai", portrait: ART_PATHS.portraits["Subutai"],
                text: "The fort at Yanchi Pass holds grain stocks and a signal relay. " +
                      "If they ride south to warn Shazhou we lose three days. " +
                      "Temür — take your hundred cavalry. Kill the relay riders first, " +
                      "then take the gate. Do not let a single man out.",
                color: "#c0392b"
            }},
            { type: "show_dialogue", params: {
                speaker: "Fort Captain Bao Liang", portrait: ART_PATHS.portraits["Fort Captain Bao Liang"],
                text: "Mongol outriders! Close the gate — send the smoke signal — " +
                      "someone ride to Shazhou! We cannot hold this alone!",
                color: "#8b0000"
            }},
            { type: "spawn_important_npc", params: { id: "xia_yanchi_captain" } },
            { type: "custom_js", params: {
                code: [
                    "// Staggered raid-activity subtitles — wait for dialogue to finish first.",
                    "var SP = window.StoryPresentation;",
                    "var subs = [",
                    "    [4000,  '🐴 Mongol outriders cut down the relay riders on the south road.'],",
                    "    [9000,  '🔥 The granary gate is breached. Garrison falls back to the keep.'],",
                    "    [14000, '🏳️ Captain Bao Liang is captured. The fort is yours.']",
                    "];",
                    "(function _waitDialogueThenSubs() {",
                    "    if (window.__ST_dialogueBusy) { setTimeout(_waitDialogueThenSubs, 200); return; }",
                    "    subs.forEach(function(s) {",
                    "        setTimeout(function() {",
                    "            if (SP && SP.showSubtitle) SP.showSubtitle(s[1], 4000, '#e8a030');",
                    "            if (typeof window.logGameEvent === 'function') window.logGameEvent(s[1], 'general');",
                    "        }, s[0]);",
                    "    });",
                    "    // Set mission-complete flag after last sub so t_mission_yanchi_done can fire.",
                    "    setTimeout(function() { window.__mc_yanchi_done = true; }, 16000);",
                    "})();"
                ].join("\n")
            }}
        ]
    },

    // ── YANCHI DONE — Subutai issues Mission 2 ───────────────────────────────
    {
        id: "t_mission_yanchi_done",
        name: "Mission 1 Done — Subutai issues Mission 2 (Shazhou beacon)",
        enabled: true, once: true, activatedBy: "t_mission_yanchi",
        conditions: [ { type: "custom_js", params: { code: "return !!window.__mc_yanchi_done;" } } ],
        actions: [
            _sub("Yanchi silenced. Subutai issues Mission 2: Shazhou beacon tower.", 6000, "#e8a030"),
            { type: "show_dialogue", params: {
                speaker: "Subutai", portrait: ART_PATHS.portraits["Subutai"],
                text: "Good. Shazhou has its own fire-signal tower on the outer wall. " +
                      "That beacon is the relay between every city in the western corridor. " +
                      "I want it destroyed before we arrive at the gates. " +
                      "Ride ahead — quietly — and knock it down.",
                color: "#c0392b"
            }},
            _log("📜 Mission 2 issued — destroy the Shazhou outer-wall beacon tower before the main column arrives.", "objective")
        ]
    },

    // ── SHAZHOU — Mission 2: Destroy the beacon tower ────────────────────────
    {
        id: "t_mission_shazhou_beacon",
        name: "Mission 2 — Shazhou (destroy beacon tower)",
        enabled: true, once: true, activatedBy: "t0_boot",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            _sub("Shazhou — destroy the beacon tower on the outer wall.", 7000, "#e8a030"),
            _log("⚔️ Mission 2 — Shazhou's outer wall beacon tower must fall before the city can warn Guazhou or Suzhou.", "general"),
            { type: "show_dialogue", params: {
                speaker: "Beacon Master Wen Ju", portrait: ART_PATHS.portraits["Beacon Master Wen Ju"],
                text: "Riders in the dark! Light the beacon — light it now — " +
                      "Guazhou must know the Mongols have crossed the corridor!",
                color: "#8b0000"
            }},
            { type: "show_dialogue", params: {
                speaker: "Temür Noyan", portrait: ART_PATHS.portraits["Temür Noyan"],
                text: "They light it before we can reach the tower. " +
                      "Subutai will want to know. But the beacon master is still alive — " +
                      "we can take him and strip the tower so it cannot signal again.",
                color: "#ffffff"
            }},
            { type: "spawn_important_npc", params: { id: "xia_beacon_master" } },
            { type: "custom_js", params: {
                code: [
                    "var SP = window.StoryPresentation;",
                    "var subs = [",
                    "    [3000,  '🔥 The beacon fires. A column of smoke rises above Shazhou.'],",
                    "    [8000,  '⚔️ Mongol cavalry storm the outer wall. Beacon Master Wen Ju is cornered.'],",
                    "    [14000, '✅ The tower is torn down. Shazhou\\'s outer gate opens to Subutai\\'s column.']",
                    "];",
                    "(function _waitDialogueThenSubs() {",
                    "    if (window.__ST_dialogueBusy) { setTimeout(_waitDialogueThenSubs, 200); return; }",
                    "    subs.forEach(function(s) {",
                    "        setTimeout(function() {",
                    "            if (SP && SP.showSubtitle) SP.showSubtitle(s[1], 4000, '#e8a030');",
                    "            if (typeof window.logGameEvent === 'function') window.logGameEvent(s[1], 'general');",
                    "        }, s[0]);",
                    "    });",
                    "    setTimeout(function() { window.__mc_shazhou_done = true; }, 16000);",
                    "})();"
                ].join("\n")
            }}
        ]
    },

    // ── SHAZHOU DONE — Subutai issues Mission 3 ──────────────────────────────
    {
        id: "t_mission_shazhou_done",
        name: "Mission 2 Done — Subutai issues Mission 3 (Guazhou screen)",
        enabled: true, once: true, activatedBy: "t_mission_shazhou_beacon",
        conditions: [ { type: "custom_js", params: { code: "return !!window.__mc_shazhou_done;" } } ],
        actions: [
            _sub("Shazhou falls. Mission 3: screen Guazhou from Xia scouts.", 6000, "#e8a030"),
            { type: "show_dialogue", params: {
                speaker: "Subutai", portrait: ART_PATHS.portraits["Subutai"],
                text: "The smoke from that beacon will have told Guazhou everything. " +
                      "Their scouts are already riding the desert road. " +
                      "I need you ahead of them — cut off whoever they send west to rally help. " +
                      "Screen the city until I bring the column up.",
                color: "#c0392b"
            }},
            _log("📜 Mission 3 issued — intercept Xia scouts riding west from Guazhou before they can rally reinforcements.", "objective")
        ]
    },

    // ── GUAZHOU — Mission 3: Screen from Xia scouts ──────────────────────────
    {
        id: "t_mission_guazhou_screen",
        name: "Mission 3 — Guazhou (screen from Xia scouts)",
        enabled: true, once: true, activatedBy: "t0_boot",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            _sub("Guazhou — intercept the Xia scouting party before they break west.", 7000, "#e8a030"),
            _log("⚔️ Mission 3 — Xia scout cavalry are riding west from Guazhou to rally help. They must be stopped.", "general"),
            { type: "show_dialogue", params: {
                speaker: "Scout Commander Dali", portrait: ART_PATHS.portraits["Scout Commander Dali"],
                text: "We cannot hold Guazhou. Ride! Split into three groups — " +
                      "someone must reach Changle and Suzhou. Tell them what is coming. " +
                      "The Mongols have crossed the corridor!",
                color: "#8b0000"
            }},
            { type: "show_dialogue", params: {
                speaker: "Temür Noyan", portrait: ART_PATHS.portraits["Temür Noyan"],
                text: "They are fast and they split. We can catch two of the three groups. " +
                      "The third will reach Changle — there is nothing to be done about that. " +
                      "Subutai will not be pleased, but two out of three is what we can manage.",
                color: "#ffffff"
            }},
            { type: "spawn_important_npc", params: { id: "xia_scout_commander" } },
            { type: "custom_js", params: {
                code: [
                    "var SP = window.StoryPresentation;",
                    "var subs = [",
                    "    [4000,  '🐴 Mongol outriders run down the first scout group on the desert road.'],",
                    "    [9000,  '🐴 Second group cornered in a dry ravine. Eliminated.'],",
                    "    [13000, '💨 Third group escapes west. Changle will know we are coming.']",
                    "];",
                    "(function _waitDialogueThenSubs() {",
                    "    if (window.__ST_dialogueBusy) { setTimeout(_waitDialogueThenSubs, 200); return; }",
                    "    subs.forEach(function(s) {",
                    "        setTimeout(function() {",
                    "            if (SP && SP.showSubtitle) SP.showSubtitle(s[1], 4000, '#e8a030');",
                    "            if (typeof window.logGameEvent === 'function') window.logGameEvent(s[1], 'general');",
                    "        }, s[0]);",
                    "    });",
                    "    setTimeout(function() { window.__mc_guazhou_done = true; }, 15000);",
                    "})();"
                ].join("\n")
            }}
        ]
    },

    // ── GUAZHOU DONE — Subutai issues Mission 4 ──────────────────────────────
    {
        id: "t_mission_guazhou_done",
        name: "Mission 3 Done — Subutai issues Mission 4 (Changle ultimatum)",
        enabled: true, once: true, activatedBy: "t_mission_guazhou_screen",
        conditions: [ { type: "custom_js", params: { code: "return !!window.__mc_guazhou_done;" } } ],
        actions: [
            _sub("Guazhou screened. Mission 4: deliver Subutai's ultimatum to Changle Gate.", 6000, "#e8a030"),
            { type: "show_dialogue", params: {
                speaker: "Subutai", portrait: ART_PATHS.portraits["Subutai"],
                text: "Changle already knows we are here — your scouts made sure of that. " +
                      "Ride to the Changle Gate under a white flag. Deliver this message exactly: " +
                      "'Open the gates and take the Mongol oath within the hour, or there will be no walls " +
                      "left to shelter behind.' Nothing more. Nothing less.",
                color: "#c0392b"
            }},
            _log("📜 Mission 4 issued — ride to Changle Gate under white flag and deliver Subutai's surrender ultimatum.", "objective")
        ]
    },

    // ── CHANGLE — Mission 4: Deliver ultimatum ───────────────────────────────
    {
        id: "t_mission_changle_ultimatum",
        name: "Mission 4 — Changle (deliver surrender ultimatum)",
        enabled: true, once: true, activatedBy: "t0_boot",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            _sub("Changle — deliver Subutai's ultimatum at the gate.", 7000, "#e8a030"),
            _log("⚔️ Mission 4 — Temür rides to Changle Gate under white flag. The garrison knows what happened at Yanchi, Shazhou, and Guazhou.", "general"),
            { type: "show_dialogue", params: {
                speaker: "Gate Warden Huo Qian", portrait: ART_PATHS.portraits["Gate Warden Huo Qian"],
                text: "We have heard what you did to Yanchi. We have seen Shazhou's smoke. " +
                      "Changle is not Yanchi. Our walls are stronger and our garrison is larger. " +
                      "Take your flag and your threats and leave.",
                color: "#8b0000"
            }},
            { type: "show_dialogue", params: {
                speaker: "Changle Elder", portrait: ART_PATHS.portraits["Changle Elder"],
                text: "Warden — wait. The Mongol column is less than a day's march away. " +
                      "Asha is not coming. No relief is coming. " +
                      "If we fight and lose, there is nothing left. Perhaps we should hear their terms.",
                color: "#a8a07c"
            }},
            { type: "show_dialogue", params: {
                speaker: "Gate Warden Huo Qian", portrait: ART_PATHS.portraits["Gate Warden Huo Qian"],
                text: "... Give me until morning. If the column does not move by then, " +
                      "I will speak with the Elder again.",
                color: "#8b0000"
            }},
            { type: "custom_js", params: {
                code: [
                    "var SP = window.StoryPresentation;",
                    "var subs = [",
                    "    [3000,  '🏳️ The Changle garrison council debates through the night.'],",
                    "    [9000,  '📜 At dawn, the Elder overrules the Warden. The gate opens.'],",
                    "    [14000, '✅ Changle surrenders. The western corridor is clear.']",
                    "];",
                    "(function _waitDialogueThenSubs() {",
                    "    if (window.__ST_dialogueBusy) { setTimeout(_waitDialogueThenSubs, 200); return; }",
                    "    subs.forEach(function(s) {",
                    "        setTimeout(function() {",
                    "            if (SP && SP.showSubtitle) SP.showSubtitle(s[1], 4500, '#e8a030');",
                    "            if (typeof window.logGameEvent === 'function') window.logGameEvent(s[1], 'general');",
                    "        }, s[0]);",
                    "    });",
                    "    setTimeout(function() { window.__mc_changle_done = true; }, 16000);",
                    "})();"
                ].join("\n")
            }}
        ]
    },

    // ── CHANGLE DONE — Subutai releases player, rides east ───────────────────
    {
        id: "t_mission_changle_done",
        name: "Mission 4 Done — Subutai releases player to rejoin Genghis at Ganzhou",
        enabled: true, once: true, activatedBy: "t_mission_changle_ultimatum",
        conditions: [ { type: "custom_js", params: { code: "return !!window.__mc_changle_done;" } } ],
        actions: [
            _sub("The western corridor is yours. Subutai releases you — ride east to Ganzhou.", 7000, "#f5d76e"),
            { type: "show_dialogue", params: {
                speaker: "Subutai", portrait: ART_PATHS.portraits["Subutai"],
                text: "Yanchi. Shazhou. Guazhou. Changle. Four nails, four hammers. " +
                      "You did not lose a man I couldn't spare. " +
                      "The western corridor is closed. I have no more use for you here. " +
                      "Ride east. Find the Great Khan at Ganzhou. " +
                      "Tell him the west is clear. Do not dawdle.",
                color: "#c0392b"
            }},
            { type: "show_dialogue", params: {
                speaker: "Temür Noyan", portrait: ART_PATHS.portraits["Temür Noyan"],
                text: "Understood. We ride east.",
                color: "#ffffff"
            }},
            _log("📜 1226 — Subutai's western corridor is complete. Temür Noyan and his hundred cavalry break east to rejoin the main force at Ganzhou.", "general")
        ]
    },

    // ── SUZHOU — 5-week siege ────────────────────────────────────────────────
    {
        id: "t_arrive_suzhou",
        name: "Arrival — Suzhou (five-week siege)",
        enabled: true, once: true, activatedBy: "t0_boot",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            _sub("Suzhou — the city closes its gates.", 6000, "#f5d76e"),
            _log("⚔️ 1226 — The Mongol host reaches Suzhou. The walls are manned. The siege begins.", "general"),
            { type: "show_dialogue", params: {
                speaker: "Genghis Khan", portrait: ART_PATHS.portraits["Genghis Khan"],
                text: "They choose walls. Good. Every man who dies on a wall is a man " +
                      "who cannot warn the next city. Bring up the siege engines.",
                color: "#c8a200"
            }},
            { type: "show_dialogue", params: {
                speaker: "Tangut General", portrait: ART_PATHS.portraits["Tangut General"],
                text: "The walls of Suzhou have held armies before. Hold your positions. " +
                      "Asha will send relief. We need only endure.",
                color: "#8b0000"
            }},
            { type: "custom_js", params: {
                code: [
                    "// Staggered siege-activity subtitles — wait for dialogue to finish first",
                    "// (_waitDialogueThenSubs polls __ST_dialogueBusy, then starts the timeline",
                    "// from that point — matching the Hakata Bay presentation pattern).",
                    "var SP = window.StoryPresentation;",
                    "var subs = [",
                    "    [4000,  '🪨 Week 1 — Catapults batter the north wall. Tangut archers return fire.'],",
                    "    [8000,  '🔥 Week 2 — A sally is repulsed. Three hundred Tangut cavalry cut down in the field.'],",
                    "    [12000, '⚔️ Week 3 — The outer gate is breached. Fighting in the streets.'],",
                    "    [16000, '🏳️ Week 4 — No relief from Asha. The garrison commander parleys.'],",
                    "    [20000, '✅ Week 5 — Suzhou falls. Prisoners are conscripted into the siege train.']",
                    "];",
                    "(function _waitDialogueThenSubs() {",
                    "    if (window.__ST_dialogueBusy) { setTimeout(_waitDialogueThenSubs, 200); return; }",
                    "    subs.forEach(function(s) {",
                    "        setTimeout(function() {",
                    "            if (SP && SP.showSubtitle) SP.showSubtitle(s[1], 3800, '#e8d080');",
                    "            if (typeof window.logGameEvent === 'function') window.logGameEvent(s[1], 'general');",
                    "        }, s[0]);",
                    "    });",
                    "})();"
                ].join("\n")
            }},
            { type: "show_dialogue", params: {
                speaker: "Narrator", portrait: ART_PATHS.portraits["Narrator"],
                text: "Suzhou holds for five weeks before falling. Mongol engineers strip the city " +
                      "of its siege weapons. Defectors and prisoners swell the army. " +
                      "The host is now larger and better armed than when it left Khara-Khoto.",
                color: "#d4b886"
            }}
        ]
    },

    // ── GANZHOU — Chagaan negotiation + 5-month siege ────────────────────────
    {
        id: "t_arrive_ganzhou",
        name: "Arrival — Ganzhou (Chagaan negotiation, five-month siege)",
        enabled: true, once: true, activatedBy: "t0_boot",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            _sub("Ganzhou — Chagaan Noyan's hometown. His father commands the garrison.", 7000, "#f5d76e"),
            _log("⚔️ 1226 — The army reaches Ganzhou. General Chagaan Noyan recognises the city — it is his birthplace, and his father commands its walls.", "general"),
            { type: "show_dialogue", params: {
                speaker: "Chagaan Noyan", portrait: ART_PATHS.portraits["Chagaan Noyan"],
                text: "Great Khan. Give me leave to ride to the gate. My father is in there. " +
                      "I know these walls. I know this garrison. Let me negotiate. " +
                      "Ganzhou does not need to become a ruin.",
                color: "#7a9e5c"
            }},
            { type: "show_dialogue", params: {
                speaker: "Genghis Khan", portrait: ART_PATHS.portraits["Genghis Khan"],
                text: "Go, then. But I will not wait long. If the gates are not open " +
                      "before I finish my tea, I will begin with the north tower.",
                color: "#c8a200"
            }},
            { type: "custom_js", params: {
                code: [
                    "// Staggered 5-month siege subtitles — wait for dialogue to clear first.",
                    "var SP = window.StoryPresentation;",
                    "var subs = [",
                    "    [3000,  '🗣️ Chagaan rides to the gate under a white banner. His father appears on the parapet.'],",
                    "    [8000,  '⚔️ The second-in-command of the garrison stages a coup. Chagaan\\'s father is killed.'],",
                    "    [12000, '🚫 The coup commanders refuse to surrender. The siege begins.'],",
                    "    [18000, '🪨 Month 1–2 — Siege engines pound the walls day and night. The garrison holds.'],",
                    "    [24000, '🔥 Month 3 — Famine inside the walls. Civilians eat leather and bark.'],",
                    "    [30000, '⚔️ Month 4 — A breakout attempt is destroyed in the field. The commanders are captured.'],",
                    "    [35000, '🏳️ Month 5 — The garrison surrenders. Genghis threatens annihilation.'],",
                    "    [39000, '🕊️ Chagaan pleads for mercy. Genghis relents — only the 35 coup conspirators are executed.']",
                    "];",
                    "(function _waitDialogueThenSubs() {",
                    "    if (window.__ST_dialogueBusy) { setTimeout(_waitDialogueThenSubs, 200); return; }",
                    "    subs.forEach(function(s) {",
                    "        setTimeout(function() {",
                    "            if (SP && SP.showSubtitle) SP.showSubtitle(s[1], 4000, '#e8d080');",
                    "            if (typeof window.logGameEvent === 'function') window.logGameEvent(s[1], 'general');",
                    "        }, s[0]);",
                    "    });",
                    "})();"
                ].join("\n")
            }},
            { type: "show_dialogue", params: {
                speaker: "Chagaan Noyan", portrait: ART_PATHS.portraits["Chagaan Noyan"],
                text: "Great Khan. The men who killed my father are dead. " +
                      "The rest — the soldiers, the people — they were not part of the treachery. " +
                      "I ask that they live.",
                color: "#7a9e5c"
            }},
            { type: "show_dialogue", params: {
                speaker: "Genghis Khan", portrait: ART_PATHS.portraits["Genghis Khan"],
                text: "You have served me well, Chagaan. And a city that lives feeds us. " +
                      "A city that burns feeds no one. The conspirators only. " +
                      "The rest take the oath. Move on.",
                color: "#c8a200"
            }},
            _log("🕊️ 1226 — Ganzhou falls after five months. Only the 35 coup leaders are executed. The city is spared.", "general")
        ]
    },

    // ── XILIANG (WUWEI) — surrender without siege ─────────────────────────────
    {
        id: "t_arrive_xiliang",
        name: "Arrival — Xiliang / Wuwei (surrender)",
        enabled: true, once: true, activatedBy: "t0_boot",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            _sub("Xiliang — the city gates open before the first arrow is fired.", 6000, "#f5d76e"),
            _log("🏳️ 1226 — Xiliang (Wuwei) surrenders without a siege. Its garrison watched what happened to Ganzhou.", "general"),
            { type: "show_dialogue", params: {
                speaker: "City Elder", portrait: ART_PATHS.portraits["City Elder"],
                text: "We have heard what befell Suzhou. We have heard what befell Ganzhou. " +
                      "Xiliang opens its gates. We take the oath. We ask only that our temple be spared.",
                color: "#a8a07c"
            }},
            { type: "show_dialogue", params: {
                speaker: "Genghis Khan", portrait: ART_PATHS.portraits["Genghis Khan"],
                text: "Wise. Xiliang feeds us now. Conscript their engineers. " +
                      "We will need them at Xingqing. Move the column south.",
                color: "#c8a200"
            }},
            // Trailing subtitle deferred via _waitDialogueThenSubs so it does not
            // immediately overwrite the opening subtitle before it has been read.
            // Previous version had two back-to-back _sub() calls which collided —
            // the second fired as a synchronous action and clobbered the first.
            { type: "custom_js", params: {
                code: [
                    "var SP = window.StoryPresentation;",
                    "(function _waitDialogueThenSubs() {",
                    "    if (window.__ST_dialogueBusy) { setTimeout(_waitDialogueThenSubs, 200); return; }",
                    "    // Single trailing subtitle — shown only after dialogue is fully dismissed.",
                    "    if (SP && SP.showSubtitle) {",
                    "        SP.showSubtitle(",
                    "            'The Hexi Corridor is ours. Xingqing — the Tangut capital — lies ahead.',",
                    "            7000, '#f5d76e'",
                    "        );",
                    "    }",
                    "    if (typeof window.logGameEvent === 'function') {",
                    "        window.logGameEvent('The Hexi Corridor is ours. Xingqing lies ahead.', 'general');",
                    "    }",
                    "})();"
                ].join("\n")
            }}
        ]
    },

    // ── XINGQING (ZHONGXING) — capital siege ─────────────────────────────────
    {
        id: "t_arrive_xingqing",
        name: "Arrival — Xingqing / Zhongxing (capital siege)",
        enabled: true, once: true, activatedBy: "t0_boot",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            _sub("Xingqing — the Tangut capital. The final siege begins.", 7000, "#cc2200"),
            _log("⚔️ 1227 — The Mongol host encircles Xingqing (Zhongxing), capital of Western Xia. Emperor Xianzong is inside.", "general"),
            { type: "show_dialogue", params: {
                speaker: "Narrator", portrait: ART_PATHS.portraits["Narrator"],
                text: "Asha finally moves his army east to relieve the capital. " +
                      "On the frozen Yellow River, the Mongols destroy it utterly. " +
                      "The last field army of Western Xia is gone.",
                color: "#d4b886"
            }},
            { type: "show_dialogue", params: {
                speaker: "Genghis Khan", portrait: ART_PATHS.portraits["Genghis Khan"],
                text: "Surround it. Divert the river against the walls. " +
                      "They cannot be re-supplied, they cannot be reinforced. " +
                      "We will outlast them.",
                color: "#c8a200"
            }},
            { type: "custom_js", params: {
                code: [
                    "// Staggered capital-siege subtitles — wait for dialogue to clear first.",
                    "var SP = window.StoryPresentation;",
                    "var subs = [",
                    "    [5000,  '⚔️ The Yellow River is diverted — floodwaters undermine the southern wall.'],",
                    "    [12000, '💀 Genghis Khan falls ill during the siege. He does not leave his tent.'],",
                    "    [20000, '🏳️ Emperor Xianzong dies inside the city, possibly by his own hand.'],",
                    "    [28000, '🏳️ The new Tangut emperor surrenders. Western Xia ceases to exist.'],",
                    "    [36000, '💀 Genghis Khan dies — August 1227 — before the surrender envoy arrives at his tent.'],",
                    "    [42000, '📜 His death is concealed. The army carries out his final orders. Western Xia is annihilated.']",
                    "];",
                    "(function _waitDialogueThenSubs() {",
                    "    if (window.__ST_dialogueBusy) { setTimeout(_waitDialogueThenSubs, 200); return; }",
                    "    subs.forEach(function(s) {",
                    "        setTimeout(function() {",
                    "            if (SP && SP.showSubtitle) SP.showSubtitle(s[1], 4500, '#cc4444');",
                    "            if (typeof window.logGameEvent === 'function') window.logGameEvent(s[1], 'general');",
                    "        }, s[0]);",
                    "    });",
                    "})();"
                ].join("\n")
            }},
            { type: "show_dialogue", params: {
                speaker: "Narrator", portrait: ART_PATHS.portraits["Narrator"],
                text: "Genghis Khan dies before he can receive the Tangut surrender in person. " +
                      "His generals conceal the death and carry out his last order: " +
                      "Western Xia is to be erased — its cities, its records, its royal line. " +
                      "The campaign you rode with ends here. The world will not be the same.",
                color: "#d4b886"
            }},
            _log("📜 1227 — Western Xia is destroyed. The campaign is complete. Genghis Khan dies in his tent.", "general")
        ]
    }

];

// ── Apply legacy show_dialogue adapter to every trigger ─────────────────────
// Rewrites all 39 legacy {speaker, portrait, text, color} call sites into the
// {lines: [{...}]} shape the runtime expects. See header at top of file.
(function _applyDialogueAdapter() {
    var _normCount = _normalizeAllDialogueInTriggers(TRIGGERS);
    console.log("[MongolConquest] show_dialogue adapter applied — normalized " +
                _normCount + " legacy dialogue action(s).");
})();

DATA.triggers = TRIGGERS;


// ============================================================================
// CONDITION EVALUATOR PATCH  (unchanged from v3)
// ============================================================================

function _patchConditionEvaluator() {
    if (!window.ScenarioTriggers) return;

    var _key = null;
    if (typeof window.ScenarioTriggers._evalCondition    === "function") _key = "_evalCondition";
    else if (typeof window.ScenarioTriggers.evalCondition     === "function") _key = "evalCondition";
    else if (typeof window.ScenarioTriggers.evaluateCondition === "function") _key = "evaluateCondition";

    function _customEval(cond) {
        if (!cond) return false;
        if (cond.type === "player_dead") {
            return !!(window.player && (window.player.hp <= 0 || window.player.dead === true));
        }
        if (cond.type === "all_player_cities_lost") {
            if (!window.cities || !window.player) return false;
            var pf = window.player.faction || FAC.PLAYER;
            return !window.cities.some(function (c) { return c.faction === pf; });
        }
        return null;
    }

    if (_key) {
        var _orig = window.ScenarioTriggers[_key];
        window.ScenarioTriggers[_key] = function (cond) {
            var custom = _customEval(cond);
            if (custom !== null) return custom;
            return _orig.call(window.ScenarioTriggers, cond);
        };
        console.log("[MongolConquest] ✓ Wrapped ScenarioTriggers." + _key);
    } else {
        window.__scenarioConditionOverrides = window.__scenarioConditionOverrides || {};
        window.__scenarioConditionOverrides["player_dead"] = function () {
            return !!(window.player && (window.player.hp <= 0 || window.player.dead === true));
        };
        window.__scenarioConditionOverrides["all_player_cities_lost"] = function () {
            if (!window.cities || !window.player) return false;
            var pf = window.player.faction || FAC.PLAYER;
            return !window.cities.some(function (c) { return c.faction === pf; });
        };
        console.log("[MongolConquest] ✓ Registered __scenarioConditionOverrides.");
    }
}


// ============================================================================
// INSTALL  (unchanged from v3 — no changes to boot sequence needed)
// ============================================================================

function install() {
    console.log("[MongolConquest] install() called…");

    var s = window.__activeScenario;
    if (!s) {
        console.warn("[MongolConquest] No __activeScenario — creating empty shell.");
        s = {};
        window.__activeScenario = s;
    }

    _preloadStoryArt();

    s.storyIntro    = DATA.storyIntro;
    s.playerSetup   = DATA.playerSetup;
    s.importantNpcs = DATA.importantNpcs;
    s.scenarioVars  = DATA.scenarioVars;

    var _existing = (s.triggers || []).filter(function (t) {
        return !DATA.triggers.some(function (ours) { return ours.id === t.id; });
    });
    s.triggers = DATA.triggers.concat(_existing);

    _patchConditionEvaluator();

    if (window.ScenarioTriggers && typeof window.ScenarioTriggers.start === "function") {
        window.__introPlayed = false;
        window.ScenarioTriggers.start(s);
        console.log("[MongolConquest] ✅ Installed — trigger runtime restarted.");
    } else {
        console.warn("[MongolConquest] ScenarioTriggers not found — triggers spliced but runtime not restarted.");
    }

    // Player setup with staggered retries (unchanged)
    var _attempts = 0;
    function _reapply() {
        if (!window.player || !DATA.playerSetup) return;
        var ps = DATA.playerSetup;
        var posOk = (Math.abs((window.player.x || 0) - ps.x) < 4) &&
                    (Math.abs((window.player.y || 0) - ps.y) < 4);
        var trpOk = (window.player.troops === ps.troops) ||
                    (Array.isArray(window.player.roster) && window.player.roster.length === ps.troops);
        if (posOk && trpOk && _attempts > 0) {
            console.log("[MongolConquest] Player setup verified ✓ at attempt", _attempts);
            return;
        }
        window.player.x         = ps.x;
        window.player.y         = ps.y;
        window.player.gold      = ps.gold;
        window.player.food      = ps.food;
        window.player.hp        = ps.hp;
        window.player.maxHealth = ps.maxHealth;
        if (typeof ps.faction === "string" && ps.faction) window.player.faction = ps.faction;
        if (Array.isArray(ps.enemies)) window.player.enemies = ps.enemies.slice();
        if (Array.isArray(ps.roster)) {
            window.player.roster = ps.roster.map(function (r) {
                return (typeof r === "string") ? { type: r, exp: 1 } :
                       (r && r.type)           ? { type: r.type, exp: r.exp || 1 } :
                                                 { type: "Horse Archer", exp: 1 };
            });
            window.player.troops = window.player.roster.length;
        } else if (typeof ps.troops === "number") {
            window.player.troops = ps.troops;
        }
        _attempts++;
        console.log("[MongolConquest] Player re-applied (attempt " + _attempts + ")" +
                    " pos=(" + window.player.x + "," + window.player.y + ")" +
                    " troops=" + window.player.troops);
    }
    setTimeout(_reapply,  300);
    setTimeout(_reapply,  900);
    setTimeout(_reapply, 1800);
    setTimeout(_reapply, 3600);

    return true;
}


// ============================================================================
// AUTO-INSTALL  (unchanged from v3)
// ============================================================================
(function _autoInstall() {
    if (window.__mongolConquestDisableAutoInstall) return;

    var lastSeen = null, attempts = 0, screened = false;

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

    var iv = setInterval(function () {
        // FIX (Bug 2): ceiling raised from 90 → 180 attempts (144 s total).
        // applyDevScenario() is async and can take >72 s on slow devices,
        // causing the original limit to silently give up before the scenario
        // was ever populated — convoy never spawned, loading screen froze.
        if (++attempts > 180) {
            console.warn("[MongolConquest] Auto-install timed out after 180 attempts.");
            clearInterval(iv);
            return;
        }
        if (!window.__campaignStory2Active) return;

        if (!screened && window.StoryPresentation &&
            typeof window.StoryPresentation.fadeOut === "function") {
            var pct = _getLoadPct();
            if (pct < 0 || pct >= 95) {
                screened = true;
                window.StoryPresentation.fadeOut(500, "#000000");
                if (typeof window.StoryPresentation.showPhase2Loading === "function") {
                    window.StoryPresentation.showPhase2Loading();
                }
                console.log("[MongolConquest] Screen fading at " + (pct < 0 ? "unknown" : pct) + "% load.");
            }
        }

        var cur = window.__activeScenario;
        if (!cur || cur === lastSeen) return;
        lastSeen = cur;

        if ((cur.cities || []).length < CONFIG.minRequiredCities) {
            console.log("[MongolConquest] Only", (cur.cities || []).length,
                        "cities — need ≥", CONFIG.minRequiredCities, ". Skipping.");
            return;
        }

        // FIX (Bug 3): guard against double-install.
        // initGame_story2 calls install() directly AND this interval can fire
        // concurrently (since __campaignStory2Active is now set before
        // applyDevScenario completes). Without the guard, triggers register
        // twice, causing doubled events and a potential trigger-engine crash.
        if (window.__mc_installed) {
            clearInterval(iv);
            return;
        }

        console.log("[MongolConquest] Detected campaign scenario with",
                    (cur.cities || []).length, "cities. Auto-installing…");
        window.__mc_installed = true;
        setTimeout(install, 1200);
        clearInterval(iv);
    }, 800);
})();


// ── PUBLIC API ────────────────────────────────────────────────────────────────
return {
    install: install,
    DATA:    DATA,
    CONFIG:  CONFIG,
    VERSION: "5.1.0"
};

})();

console.log("[MongolConquest] mongolconquestxia_scenario.js v" +
            window.MongolConquestScenario.VERSION + " — module ready.");
			
			// ============================================================================
// MONGOL CONQUEST PATCH — mongolconquest_patch_v1.js
// ============================================================================
//
// WHAT THIS FILE FIXES (apply all patches at once by loading after
// mongolconquestxia_scenario.js and sandboxmode_update.js):
//
//  1. EVENT TEXT SYNC
//     Bottom-of-screen coloured subtitle/event text (no portrait, no dialogue)
//     was firing immediately at convoy arrival, BEFORE the dialogue sequence
//     completed.  Now each arrival trigger wraps its _sub() opening line inside
//     a dialogue-done callback so it only displays after the last dialogue line
//     resolves.  The staggered internal siege subtitles are preserved as-is.
//
//  2. CONVOY SPACING — almost-touching formation
//     Reduces colGap, rowGap, and spacingPx so followers are 1–5 px apart
//     rather than 55–72 px apart.  Updated in both the convoy START params
//     and inside the bullet-proof follower patch that runs at boot.
//
//  3. CONVOY SPEED — 1/3 of previous
//     leaderPxSec: 45 → 15    (was 45 in CONFIG.convoySpeed)
//     followerPxSec: 60 → 20  (was 60)
//     The patch hot-swaps these on the live __ScenarioConvoy state object if
//     the convoy is already running, so it works even if this file loads late.
//
//  4. SIEGE EMOJI + OUTCOME TEXT
//     When the player (or an NPC) is sieging a city the city's world-map icon
//     now shows a ⚔️ siege indicator above it.  When a siege concludes with:
//       • "Sacked"    — shown in red;   city stays its current faction
//       • "Withdrawn" — shown in grey;  no faction change
//       • "Overtaken" — shown in green; city.faction switches to the attacker
//     Text persists for 4 seconds then fades.  Faction swap on Overtaken works
//     for both player-led and AI-led sieges.
//
//  5. PROCEDURAL MONGOL CITY — belt-and-suspenders removal
//     The city filter in initGame_story2 (lines 1776-1784) already strips any
//     "Mongol Empire" city that leaks through from the JSON import or from
//     ScenarioRuntime.applyDevScenario().  This patch stamps a secondary guard
//     on window.cities immediately at install time and again 3 s later, so
//     even async city generation paths are covered.  The existing
//     purgeOwnedCities param in start_npc_convoy is left intact as a third
//     safety net inside the trigger runtime.
//
// LOAD ORDER:
//   mongolconquestxia_scenario.js  ←  defines MongolConquestScenario + DATA
//   mongolconquest_patch_v1.js     ←  THIS FILE  (patches after the scenario)
// ============================================================================

(function _MongolPatch() {
"use strict";

// ═══════════════════════════════════════════════════════════════════════════
// PATCH 1 – EVENT TEXT SYNC
// Replace the actions array of each arrival trigger so that the leading
// _sub() call fires AFTER the dialogue sequence, not before it.
//
// Strategy: instead of `show_subtitle` as the first action, we move the
// opening subtitle into a `custom_js` action that calls
//   window.StoryPresentation.showSubtitle()
// deferred by a small timeout that accounts for the dialogue rendering time.
// We use window.__ST_dialogueBusy (set by ScenarioTriggers while a dialogue
// sequence is playing) to poll until it's clear.
// ═══════════════════════════════════════════════════════════════════════════

function _deferredSubAction(text, ms, color) {
    var escaped_text  = JSON.stringify(text);
    var escaped_color = JSON.stringify(color || "#f5d76e");
    return {
        type: "custom_js",
        params: {
            code: [
                "(function _deferSub() {",
                "    var _text  = " + escaped_text  + ";",
                "    var _ms    = " + (ms || 5000)  + ";",
                "    var _color = " + escaped_color + ";",
                "    function _tryShow() {",
                "        // Poll until any running dialogue is finished.",
                "        // __ST_dialogueBusy is set by ScenarioTriggers during show_dialogue.",
                "        if (window.__ST_dialogueBusy) {",
                "            setTimeout(_tryShow, 200);",
                "            return;",
                "        }",
                "        var SP = window.StoryPresentation;",
                "        if (SP && SP.showSubtitle) SP.showSubtitle(_text, _ms, _color);",
                "        if (typeof window.logGameEvent === 'function') {",
                "            window.logGameEvent(_text, 'general');",
                "        }",
                "    }",
                "    _tryShow();",
                "})();"
            ].join("\n")
        }
    };
}

// Patch each arrival trigger's actions: remove the leading show_subtitle
// action and replace it with a deferred equivalent that fires after dialogue.
function _patchArrivalTriggerSubtitles() {
    var scenario = window.MongolConquestScenario;
    if (!scenario || !scenario.DATA || !Array.isArray(scenario.DATA.triggers)) {
        console.warn("[MongolPatch] DATA.triggers not found — subtitle sync patch skipped.");
        return;
    }

    // Map of triggerId → { text, ms, color } for the leading subtitle.
    // These exactly match the _sub() calls in the original trigger actions.
    // v5.1: extended to cover the four new western-corridor mission triggers.
    var ARRIVAL_SUBS = {
        "t_arrive_KharaKhoto_divide_dialogue": { text: "After Khara-Khoto is taken, Genghis Khan will ride Southeast — while Subutai takes the Southwestern corridor.", ms: 8000, color: "#f5d76e" },
        "t_arrive_KharaKhoto":           { text: "Khara-Khoto — siege begins. Bring up the ram.", ms: 7000, color: "#e8a030" },
        "t_arrive_divide":            { text: "The Ruo Shui bends east. The army divides.", ms: 7000, color: "#f5d76e" },
        "t_mission_yanchi":           { text: "Yanchi Pass Fort — raid the granary before it warns Shazhou.", ms: 7000, color: "#e8a030" },
        "t_mission_yanchi_done":      { text: "Yanchi silenced. Subutai issues Mission 2: Shazhou beacon tower.", ms: 6000, color: "#e8a030" },
        "t_mission_shazhou_beacon":   { text: "Shazhou — destroy the beacon tower on the outer wall.", ms: 7000, color: "#e8a030" },
        "t_mission_shazhou_done":     { text: "Shazhou falls. Mission 3: screen Guazhou from Xia scouts.", ms: 6000, color: "#e8a030" },
        "t_mission_guazhou_screen":   { text: "Guazhou — intercept the Xia scouting party before they break west.", ms: 7000, color: "#e8a030" },
        "t_mission_guazhou_done":     { text: "Guazhou screened. Mission 4: deliver Subutai's ultimatum to Changle Gate.", ms: 6000, color: "#e8a030" },
        "t_mission_changle_ultimatum":{ text: "Changle — deliver Subutai's ultimatum at the gate.", ms: 7000, color: "#e8a030" },
        "t_mission_changle_done":     { text: "The western corridor is yours. Subutai releases you — ride east to Ganzhou.", ms: 7000, color: "#f5d76e" },
        "t_arrive_suzhou":            { text: "Suzhou — the city closes its gates.", ms: 6000, color: "#f5d76e" },
        "t_arrive_ganzhou":           { text: "Ganzhou — Chagaan Noyan's hometown. His father commands the garrison.", ms: 7000, color: "#f5d76e" },
        "t_arrive_xiliang":           { text: "Xiliang — the city gates open before the first arrow is fired.", ms: 6000, color: "#f5d76e" },
        "t_arrive_xingqing":          { text: "Xingqing — the Tangut capital. The final siege begins.", ms: 7000, color: "#cc2200" }
    };

    // Note: the trailing subtitle in t_arrive_xiliang ("The Hexi Corridor is ours…")
    // has been moved into a _waitDialogueThenSubs custom_js block in v5.1 and is no
    // longer a bare show_subtitle action — no special handling needed here for it.

    var patched = 0;
    scenario.DATA.triggers.forEach(function (trig) {
        var subSpec = ARRIVAL_SUBS[trig.id];
        if (!subSpec || !Array.isArray(trig.actions)) return;

        // Find the first show_subtitle action in the actions array
        for (var i = 0; i < trig.actions.length; i++) {
            if (trig.actions[i].type === "show_subtitle") {
                // Replace it with a deferred version
                trig.actions[i] = _deferredSubAction(subSpec.text, subSpec.ms, subSpec.color);
                patched++;
                break;
            }
        }
    });

    console.log("[MongolPatch] ✅ Subtitle sync patch applied to " + patched + " arrival triggers.");

    // Also patch the live __activeScenario.triggers if it has already been
    // installed into the runtime (same logic, different array reference).
    if (window.__activeScenario && Array.isArray(window.__activeScenario.triggers)) {
        var livePatched = 0;
        window.__activeScenario.triggers.forEach(function (trig) {
            var subSpec = ARRIVAL_SUBS[trig.id];
            if (!subSpec || !Array.isArray(trig.actions)) return;
            for (var i = 0; i < trig.actions.length; i++) {
                if (trig.actions[i].type === "show_subtitle") {
                    trig.actions[i] = _deferredSubAction(subSpec.text, subSpec.ms, subSpec.color);
                    livePatched++;
                    break;
                }
            }
        });
        if (livePatched > 0)
            console.log("[MongolPatch]   ↳ Also patched " + livePatched + " live trigger(s) in __activeScenario.");
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// PATCH 2 + 3 — CONVOY SPACING (almost-touching) + SPEED (×1/6 of original)
//
// Target values (v6.0 — half of v5.x, which was already 1/3 of original):
//   spacingPx       :  5  (was 8 in v5.x)
//   colGap          :  4  (was 8 in v5.x)
//   rowGap          :  7  (was 12 in v5.x)
//   leaderPxSec     :  7  (was 15 in v5.x)
//   followerPxSec   : 10  (was 20 in v5.x)
//
// The spacing injected into start_npc_convoy's params won't retroactively
// fix an already-running convoy — we hot-swap onto _S directly.
// ═══════════════════════════════════════════════════════════════════════════

var NEW_SPACING_PX       =  5;
var NEW_COL_GAP          =  4;
var NEW_ROW_GAP          =  7;
var NEW_LEADER_SPEED     =  7;
var NEW_FOLLOWER_SPEED   = 10;

function _patchConvoySpeedAndSpacing() {
    // 1. Update CONFIG so future start_npc_convoy actions use the new values
    if (window.MongolConquestScenario && window.MongolConquestScenario.CONFIG) {
        var cfg = window.MongolConquestScenario.CONFIG;
        cfg.convoy.spacing              = NEW_SPACING_PX;
        cfg.convoySpeed.leaderPxSec     = NEW_LEADER_SPEED;
        cfg.convoySpeed.followerPxSec   = NEW_FOLLOWER_SPEED;
        console.log("[MongolPatch] CONFIG convoy speeds/spacing updated.");
    }

    // 2. Update the live convoy state object if it's already running
    function _applyToLive() {
        var _S = window.__ScenarioConvoy;
        if (!_S) {
            setTimeout(_applyToLive, 300);
            return;
        }
        _S.spacingPx          = NEW_SPACING_PX;
        _S.leaderSpeedPxSec   = NEW_LEADER_SPEED;
        _S.followerSpeedPxSec = NEW_FOLLOWER_SPEED;

        // Rebuild formation slots to use new colGap / rowGap
        if (Array.isArray(_S.formationSlots) && Array.isArray(_S.followerIds)) {
            var colOffsets = [-NEW_COL_GAP, 0, NEW_COL_GAP];
            for (var i = 0; i < _S.followerIds.length; i++) {
                var col = i % 3;
                var row = Math.floor(i / 3) + 1;
                _S.formationSlots[i] = {
                    dx: colOffsets[col],
                    dy: row * NEW_ROW_GAP
                };
            }
            console.log("[MongolPatch] ✅ Live convoy formation slots rebuilt with colGap=" +
                        NEW_COL_GAP + " rowGap=" + NEW_ROW_GAP + ".");
        }

        // Also update __mc_formation metadata string
        window.__mc_formation = "3col-tight";
        console.log("[MongolPatch] ✅ Live convoy speed: leader=" + NEW_LEADER_SPEED +
                    " follower=" + NEW_FOLLOWER_SPEED + " px/sec.");
    }
    _applyToLive();
}


// ═══════════════════════════════════════════════════════════════════════════
// PATCH 4 — SIEGE EMOJI + OUTCOME TEXT
//
// Two parts:
//   A) Rendering — draw ⚔️ above any city that has an active siege.
//      We hook into the city drawing loop inside sandboxmode_update.js's
//      draw() by wrapping window.drawSiegeVisuals (which is already called
//      from the draw loop).
//
//   B) Outcome detection — we intercept the siege resolution logic to:
//      • Show "⚔️ Sacked!"     (red)   when pop is drained but city holds
//      • Show "⚔️ Withdrawn"   (grey)  when attacker retreats
//      • Show "🏴 Overtaken!"  (green) when faction changes
//      For "Overtaken" we also switch city.faction to the attacker.
//
// activeSieges is declared in the sandbox scope — we poll for it safely.
// ═══════════════════════════════════════════════════════════════════════════

// Store active siege outcome messages: cityName → { msg, color, expires }
window.__mc_siegeOutcomes = window.__mc_siegeOutcomes || {};

// ── Part A: Siege icon rendering ──────────────────────────────────────────

function _installSiegeRenderer() {
    // Wrap the existing drawSiegeVisuals or define it from scratch.
    var _orig = (typeof window.drawSiegeVisuals === "function")
        ? window.drawSiegeVisuals
        : null;

    window.drawSiegeVisuals = function (ctx) {
        // Call original if it existed
        if (_orig) { try { _orig(ctx); } catch (e) {} }

        var now        = Date.now();
        var citiesArr  = window.cities_sandbox || window.cities || [];
        var sieges     = window.activeSieges || [];
        var zoom       = window.zoom || 1;
        var px         = window.player ? window.player.x : 0;
        var py         = window.player ? window.player.y : 0;
        var halfW      = ((window.canvas ? window.canvas.width : 800) / 2) / zoom;
        var halfH      = ((window.canvas ? window.canvas.height : 600) / 2) / zoom;
        var camLeft    = px - halfW - 200;
        var camRight   = px + halfW + 200;
        var camTop     = py - halfH - 200;
        var camBottom  = py + halfH + 200;

        // Collect names of cities currently under active siege
        var siegedCities = {};
        sieges.forEach(function (s) {
            if (s && s.target && s.target.name) {
                siegedCities[s.target.name] = s;
            }
        });
        // Also mark if player is sieging a city (player siege may not be in activeSieges array)
        if (window.player && window.player.isSieging && window.player.siegeTarget) {
            var st = window.player.siegeTarget;
            if (st && st.name) siegedCities[st.name] = { target: st, attacker: window.player };
        }

        ctx.save();
        ctx.textAlign = "center";

        // ── Draw ⚔️ siege icon above besieged cities ─────────────────────
        citiesArr.forEach(function (c) {
            if (c.x < camLeft || c.x > camRight || c.y < camTop || c.y > camBottom) return;
            if (!siegedCities[c.name]) return;

            var fontSize = Math.max(14, 22 / zoom);
            ctx.font = fontSize + "px serif";
            ctx.fillText("⚔️", c.x, c.y - 34);
        });

        // ── Draw outcome banners ─────────────────────────────────────────
        var outcomes = window.__mc_siegeOutcomes;
        Object.keys(outcomes).forEach(function (cityName) {
            var entry = outcomes[cityName];
            if (!entry) return;
            if (now > entry.expires) {
                delete outcomes[cityName];
                return;
            }
            // Find city position
            var city = null;
            for (var i = 0; i < citiesArr.length; i++) {
                if (citiesArr[i].name === cityName) { city = citiesArr[i]; break; }
            }
            if (!city) return;
            if (city.x < camLeft || city.x > camRight || city.y < camTop || city.y > camBottom) return;

            // Alpha fade-out over last 1000 ms
            var remaining = entry.expires - now;
            var alpha = Math.min(1, remaining / 1000);

            var fontSize = Math.max(12, 18 / zoom);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = "bold " + fontSize + "px Georgia";
            // Shadow
            ctx.fillStyle = "rgba(0,0,0,0.7)";
            ctx.fillText(entry.msg, city.x + 1, city.y - 52);
            // Text
            ctx.fillStyle = entry.color;
            ctx.fillText(entry.msg, city.x, city.y - 53);
            ctx.restore();
        });

        ctx.restore();
    };

    console.log("[MongolPatch] ✅ Siege renderer installed.");
}

// ── Part B: Siege outcome interception ───────────────────────────────────

function _showSiegeOutcome(cityName, type, attackerFaction) {
    var DISPLAY_MS = 4000;
    var config = {
        "sacked":    { msg: "⚔️ Sacked!",    color: "#ff4444" },
        "withdrawn": { msg: "💨 Withdrawn",   color: "#aaaaaa" },
        "overtaken": { msg: "🏴 Overtaken!",  color: "#44dd88" }
    };
    var entry = config[type];
    if (!entry) return;

    window.__mc_siegeOutcomes[cityName] = {
        msg:     entry.msg,
        color:   entry.color,
        expires: Date.now() + DISPLAY_MS
    };

    // If overtaken: switch city faction to attacker
    if (type === "overtaken" && attackerFaction) {
        var citiesArr = window.cities_sandbox || window.cities || [];
        for (var i = 0; i < citiesArr.length; i++) {
            if (citiesArr[i].name === cityName) {
                citiesArr[i].faction = attackerFaction;
                // Try to match faction color
                var factions = window.FACTIONS || {};
                if (factions[attackerFaction] && factions[attackerFaction].color) {
                    citiesArr[i].color = factions[attackerFaction].color;
                }
                console.log("[MongolPatch] City '" + cityName +
                            "' faction switched to '" + attackerFaction + "'.");
                break;
            }
        }
    }

    // Also log to game event log
    if (typeof window.logGameEvent === "function") {
        var icons = { sacked: "⚔️", withdrawn: "💨", overtaken: "🏴" };
        window.logGameEvent(
            (icons[type] || "⚔️") + " " + cityName + " — " +
            entry.msg.replace(/^[^\s]+\s/, ""),  // strip leading emoji
            type === "overtaken" ? "war" : "general"
        );
    }
}

// Wrap the global updateSieges function so we can detect outcome transitions.
// updateSieges is called from the main draw loop in sandboxmode_update.js.
function _installSiegeOutcomeDetector() {
    function _tryWrap() {
        if (typeof window.updateSieges !== "function") {
            setTimeout(_tryWrap, 500);
            return;
        }
        if (window.__mc_siegeOutcomePatched) return;
        window.__mc_siegeOutcomePatched = true;

        var _origUpdate = window.updateSieges;

        // Track which cities were under siege last tick
        var _prevSiegedCities = {};

        window.updateSieges = function () {
            // Record which cities were besieged BEFORE the update
            var siegesBefore = {};
            var before = window.activeSieges || [];
            before.forEach(function (s) {
                if (s && s.target && s.target.name) {
                    siegesBefore[s.target.name] = {
                        faction:         s.target.faction,
                        attackerFaction: s.attacker ? s.attacker.faction : null,
                        attackerCount:   s.attacker ? (s.attacker.count || s.attacker.troops || 0) : 0,
                        targetPop:       s.target.militaryPop || s.target.pop || 0
                    };
                }
            });

            // Run the real update
            var result;
            try { result = _origUpdate.apply(this, arguments); }
            catch (e) { console.error("[MongolPatch] updateSieges error:", e); }

            // Compare AFTER — detect resolved sieges
            var after = window.activeSieges || [];
            var siegesAfter = {};
            after.forEach(function (s) {
                if (s && s.target && s.target.name) {
                    siegesAfter[s.target.name] = true;
                }
            });

            // Any city that was under siege before but not after → siege resolved
            Object.keys(siegesBefore).forEach(function (cityName) {
                if (siegesAfter[cityName]) return;  // still ongoing

                var before = siegesBefore[cityName];

                // Check current city faction vs. attacker faction
                var citiesArr = window.cities_sandbox || window.cities || [];
                var city = null;
                for (var i = 0; i < citiesArr.length; i++) {
                    if (citiesArr[i].name === cityName) { city = citiesArr[i]; break; }
                }

                if (!city) return;

                var attackerFaction = before.attackerFaction;
                var outcomeType;

                if (attackerFaction && city.faction === attackerFaction) {
                    // Faction changed to attacker → Overtaken
                    outcomeType = "overtaken";
                } else if (before.targetPop <= 10 && city.faction !== attackerFaction) {
                    // City was nearly empty but attacker withdrew / lost
                    outcomeType = "sacked";
                } else {
                    // Attacker retreated
                    outcomeType = "withdrawn";
                }

                _showSiegeOutcome(cityName, outcomeType, attackerFaction);
            });

            return result;
        };

        console.log("[MongolPatch] ✅ Siege outcome detector installed.");
    }
    _tryWrap();
}

// Also patch the direct city-faction-swap inside sandboxmode_npc_system.js
// (line 1318: tc.faction = npc.faction) — we intercept via the cities proxy.
// Since that code runs synchronously in updateNPCs, we poll for faction changes
// on sieged cities instead, which is handled by the outcome detector above.


// ═══════════════════════════════════════════════════════════════════════════
// PATCH 5 — BELT-AND-SUSPENDERS MONGOL CITY REMOVAL
// Stamps a guard that removes any "Mongol Empire"-faction city from
// window.cities and window.cities_sandbox the moment this patch runs,
// and again 3 s later to catch async population.
// ═══════════════════════════════════════════════════════════════════════════

function _removeMongolCities() {
    var removed = 0;
    ["cities", "cities_sandbox"].forEach(function (key) {
        if (!Array.isArray(window[key])) return;
        var prev = window[key].length;
        window[key] = window[key].filter(function (c) {
            return c.faction !== "Mongol Empire";
        });
        removed += prev - window[key].length;
    });
    if (removed > 0) {
        console.log("[MongolPatch] Removed " + removed + " Mongol Empire city(ies) from cities array.");
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// INSTALL ALL PATCHES
// ═══════════════════════════════════════════════════════════════════════════

function _install() {
    console.log("[MongolPatch] Installing all patches…");

    // Patch 1: subtitle sync (can run immediately — operates on DATA.triggers)
    _patchArrivalTriggerSubtitles();

    // Patches 2+3: convoy spacing + speed
    _patchConvoySpeedAndSpacing();

    // Patch 4: siege rendering + outcomes
    _installSiegeRenderer();
    _installSiegeOutcomeDetector();

    // Patch 5: Mongol city removal
    _removeMongolCities();
    setTimeout(_removeMongolCities, 1500);   // catch applyDevScenario async path
    setTimeout(_removeMongolCities, 3000);   // catch any late procedural spawn

    console.log("[MongolPatch] ✅ All patches installed.");
}

// Run immediately if MongolConquestScenario is already present,
// otherwise wait for it.
function _waitAndInstall() {
    if (window.MongolConquestScenario) {
        _install();
    } else {
        var _iv = setInterval(function () {
            if (window.MongolConquestScenario) {
                clearInterval(_iv);
                _install();
            }
        }, 200);
    }
}

_waitAndInstall();

})();  // end _MongolPatch IIFE