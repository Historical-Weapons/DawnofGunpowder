// ============================================================================
// MONGOL CONQUEST OF WESTERN XIA — THE MARCH SOUTH
// mongolconquestxia_scenario.js  v7.4  (engine-integrated + ending)
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

        // v7.0 — reduced from 15 down to 5 NPCs total (leader + 4 followers).
        //         Kept the high-profile commanders the dialogues reference.
        names: [
            "Genghis Khan",          //  0 — leader
            "Subutai",               //  1
            "Tolui Khan",            //  2
            "Chagaan Noyan",         //  3
            "Messenger Corps Chief"  //  4 — tail (escort reference NPC)
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
    // v7.0 — ISSUE 7 FIX: convoy route now ENDS at Shazhou (Subutai lingers).
    //         Genghis Khan's detachment is split off at the divide trigger and
    //         heads to Suzhou via a separate auto-march loop, where it begins
    //         its own siege independently. The player travels with Subutai's
    //         column. After Shazhou the convoy stops and Subutai stays there.
    convoyRoute: [
        { cityName: "Heishui Commandary",    stayMs: 28000,  onArriveTriggerId: "t_arrive_KharaKhoto"            },
        { cityName: "Army Divide Point",     stayMs:  9000,  onArriveTriggerId: "t_arrive_divide"                },
        { cityName: "Yanchi Pass Fort",      stayMs: 18000,  onArriveTriggerId: "t_mission_yanchi"               },
        // Subutai's western corridor terminal — convoy lingers indefinitely.
        { cityName: "Shazhou",               stayMs: 9999999,onArriveTriggerId: "t_mission_shazhou_beacon"       },
    ],

    // ── CONVOY MOVEMENT SPEEDS ────────────────────────────────────────────────
    // Half-speed march pace for v6.0 — slow, realistic column movement.
    // followerPxSec slightly above leader so stragglers gradually close up.
    // v7.3 R1 — Mongol NPC speeds +30%: leader 7→9, follower 10→13.
    convoySpeed: {
        leaderPxSec:    9,
        followerPxSec: 13,
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
        // v7.0 — tail is now convoy_npc_4 (was _14) after roster reduction.
        tailId:   "convoy_npc_4",   // storyId of the tail NPC
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

    art:         ART_PATHS.marching_desert,
    art2:        ART_PATHS.hexi_mountains,
    art2OnLine:  4,          // Narrator: "Genghis Khan understood the weakness of such a defence"
    art2Caption: "The KharaKhoto valley. One hundred and eighty thousand men. North to south.",

    art3:        ART_PATHS.siege_prepare,
    art3OnLine:  5,          // Subutai: "We are close to Khara-Khoto, the first city of the Tanguts"
    art3Caption: "The Mongol vanguard masses before the walls of Khara-Khoto.",

    // art2CrossfadeMs is intentionally removed.  The old dismiss+setTimeout approach
    // left a 1300 ms black void between images.  scenario_triggers.js now performs an
    // instant background-image swap (showArt directly, no dismissArt call), so no
    // cross-fade delay is needed and the property is unused.

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

// v7.0 — ISSUE 10: STORY QUEST CATALOGUE
// Mirrors how Hakata Bay (Story 1) defines a top-level storyQuests array that
// the StoryQuests module loads and auto-advances. Each entry is anchored to a
// city; triggers call story_quest_set / story_quest_complete to step the chain.
var STORY_QUESTS = [
    {
        id:           "sq2_sack_kharakhoto",
        title:        "Sack Khara-Khoto (Heishui Commandary)",
        description:  "Breach the Black City and break the northern Xia frontier.",
        x:            1720, y: 598,
        radius:       320,
        isMain:       true,
        autoActivate: true,
        noAutoComplete: true
    },
    {
        id:           "sq2_follow_subutai",
        title:        "Follow Subutai west",
        description:  "Stay close to Subutai's tümen through the western corridor.",
        x:            900, y: 1000,
        radius:       400,
        autoActivate: true,
        dependsOn:    "sq2_sack_kharakhoto",
        noAutoComplete: true
    },
    {
        id:           "sq2_raid_yanchi",
        title:        "Raid Yanchi Pass Fort",
        description:  "Storm the granary fort before it signals Shazhou.",
        x:            900, y: 1000,
        radius:       320,
        autoActivate: true,
        dependsOn:    "sq2_follow_subutai",
        noAutoComplete: true
    },
    {
        id:           "sq2_take_shazhou",
        title:        "Take Shazhou with Subutai",
        description:  "Destroy the beacon and break Shazhou's outer wall.",
        x:            285, y: 1048,
        radius:       320,
        autoActivate: true,
        dependsOn:    "sq2_raid_yanchi",
        noAutoComplete: true
    },
    {
        id:           "sq2_message_to_khan",
        title:        "Messenger ride east to Genghis Khan",
        description:  "Subutai lingers in Shazhou. Carry word east to the Great Khan at Suzhou.",
        x:            1160, y: 1257,
        radius:       360,
        autoActivate: true,
        dependsOn:    "sq2_take_shazhou",
        triggerOnArrive: "t_arrive_suzhou",
        noAutoComplete: true
    },
    {
        id:           "sq2_ganzhou",
        title:        "Reach Ganzhou with Genghis Khan",
        description:  "Chagaan Noyan's birthplace — march east with the host.",
        x:            1700, y: 1450,
        radius:       360,
        autoActivate: true,
        dependsOn:    "sq2_message_to_khan",
        triggerOnArrive: "t_arrive_ganzhou",
        noAutoComplete: true
    },
    {
        id:           "sq2_xingqing",
        title:        "The Capital Siege — Xingqing",
        description:  "March on Xingqing. Finish the campaign.",
        x:            2400, y: 1900,
        radius:       400,
        autoActivate: true,
        dependsOn:    "sq2_ganzhou",
        triggerOnArrive: "t_arrive_xingqing",
        noAutoComplete: true
    }
];

var DATA = {
    playerSetup:   PLAYER_SETUP,
    importantNpcs: IMPORTANT_NPCS,
    storyIntro:    STORY_INTRO,
    scenarioVars:  SCENARIO_VARS,
    storyQuests:   STORY_QUESTS,
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


// v7.2 — ENGINE FIX E4: AUTO-TAKEOVER HELPER
// _mcStoryTake(cityName, attackerColor) — flips city.faction to Mongol Empire,
// sets color, marks __mc_storyProtected, and pushes an "Overtaken" banner via
// the existing siege-outcome system. Called from every arrival trigger AFTER
// surrender dialogue but BEFORE the player can interact with the city.
function _mcStoryTake(cityName, attackerColor) {
    return { type: "custom_js", params: {
        code: [
            "var cName = " + JSON.stringify(cityName) + ";",
            "var col   = " + JSON.stringify(attackerColor || "#c8a200") + ";",
            "var arrs = [window.cities_sandbox, window.cities];",
            "var found = false;",
            "arrs.forEach(function(arr) {",
            "    if (!Array.isArray(arr)) return;",
            "    for (var i = 0; i < arr.length; i++) {",
            "        if (arr[i] && arr[i].name === cName) {",
            "            arr[i].faction = 'Mongol Empire';",
            "            arr[i].color = col;",
            "            arr[i].isUnderSiege = false;",
            "            arr[i].__mc_storyProtected = true;   // siege button refused for this city",
            "            found = true;",
            "        }",
            "    }",
            "});",
            "if (!found) console.warn('[MC] _mcStoryTake — city not found: ' + cName);",
            "else console.log('[MC] Story take-over: ' + cName + ' is now Mongol Empire (color=' + col + ', protected).');",
            "window.__mc_siegeOutcomes = window.__mc_siegeOutcomes || {};",
            "window.__mc_siegeOutcomes[cName] = { msg: '🏴 Overtaken!', color: '#44dd88', expires: Date.now() + 4000 };",
            "if (typeof window.logGameEvent === 'function') {",
            "    window.logGameEvent('🏴 ' + cName + ' has fallen to the Mongol Empire.', 'war');",
            "}"
        ].join("\n")
    }};
}

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

            // 0. Inject virtual waypoints ───────────────────────────────────────────
            // "Army Divide Point" and "Yanchi Pass Fort" are narrative story locations
            // that have no named city entry in story2_map_and_update.js.  The patched
            // convoy tick calls _cityPos(stop.cityName) which does an exact string
            // match against window.cities_sandbox / window.cities.  Without these
            // entries the convoy silently skips both stops (routeIndex++) and jumps
            // straight to the first real city it recognises.
            // We push lightweight objects with just the fields the convoy needs
            // (name, x, y) into both city arrays here, before start_npc_convoy runs,
            // so _cityPos finds them.  isVirtual:true prevents siege/UI systems from
            // treating them as real population centres.
            // Pixel coordinates (world: 4000 × 2992):
            //   Army Divide Point  — south of Heishui (1720,598), north of Suzhou (1160,1257)
            //   Yanchi Pass Fort   — west of the divide, east of Guazhou (720,1018)
            // v7.2 — ENGINE FIX E3: waypoint cities Army Divide Point / Yanchi Pass
            // Fort are NEVER pushed to window.cities or window.cities_sandbox.  The
            // sandbox draw loop iterates the cities array and draws every entry; the
            // only way to guarantee invisibility is to keep them OUT of that array.
            // The convoy's _cityPos() helper resolves them from a static lookup table
            // (see the _VIRT_POS object inside the patched convoy tick below).
            //
            // Yanchi Pass Fort *was* drawn before because we added it as a city for
            // the convoy. Now it lives only in _VIRT_POS — the convoy still arrives,
            // fires its trigger, but the player sees nothing at that pixel.
            acts.push({ type: "custom_js", params: {
                code: "console.log('[MC] v7.2 — virtual waypoints kept out of cities array; rendered only via _VIRT_POS lookup.');"
            }});

            // v7.3 R0 — also wrap moveNpc / moveOneNPC if engine exposes them.
            // Some games run their movement loop separately from updateNPCs;
            // covering more entry points makes the dialogue freeze airtight.
            acts.push({ type: "custom_js", params: {
                code: [
                    "if (!window.__mc_moveLoop_patched) {",
                    "    window.__mc_moveLoop_patched = true;",
                    "    ['moveNPC','moveOneNPC','tickNPC','updateOneNPC','npcStep'].forEach(function(fn) {",
                    "        if (typeof window[fn] !== 'function') return;",
                    "        var _orig = window[fn];",
                    "        window[fn] = function() { if (window.__ST_dialogueBusy) return; return _orig.apply(this, arguments); };",
                    "        console.log('[MC] v7.3 — wrapped ' + fn + ' to honour dialogue pause.');",
                    "    });",
                    "}"
                ].join("\n")
            }});

            // v7.3 R0 — ALSO log every main quest into quest_system.js's player.questLog
            // (not just StoryQuests). Hakata-style players use this log; v7.2 only
            // added story_quest_set which is a separate waypoint system.
            acts.push({ type: "custom_js", params: {
                code: [
                    "function _mcAddQuestLog(q) {",
                    "    if (typeof window.player === 'undefined' || !window.player) return;",
                    "    if (!window.player.questLog) window.player.questLog = { active: [], completed: [] };",
                    "    var L = window.player.questLog;",
                    "    if (L.active.some(function(x){return x.id===q.id;}) || L.completed.some(function(x){return x.id===q.id;})) return;",
                    "    L.active.push(q);",
                    "    if (typeof window.logGameEvent === 'function') window.logGameEvent('📜 Quest: ' + q.title, 'objective');",
                    "    console.log('[MC] v7.3 — quest logged in player.questLog: ' + q.id);",
                    "}",
                    "window._mcAddQuestLog = _mcAddQuestLog;",
                    "function _mcCompleteQuestLog(id) {",
                    "    if (!window.player || !window.player.questLog) return;",
                    "    var L = window.player.questLog;",
                    "    for (var i = 0; i < L.active.length; i++) {",
                    "        if (L.active[i].id === id) {",
                    "            var q = L.active.splice(i, 1)[0];",
                    "            q.completedAt = Date.now();",
                    "            L.completed.push(q);",
                    "            if (typeof window.logGameEvent === 'function') window.logGameEvent('✅ Quest complete: ' + q.title, 'objective');",
                    "            return;",
                    "        }",
                    "    }",
                    "}",
                    "window._mcCompleteQuestLog = _mcCompleteQuestLog;",
                    "// Update a live quest's description text (called at each story beat)",
                    "function _mcUpdateQuestDesc(id, desc) {",
                    "    if (!window.player || !window.player.questLog) return;",
                    "    var q = window.player.questLog.active.find(function(x){ return x.id === id; });",
                    "    if (q) { q.description = desc; }",
                    "}",
                    "window._mcUpdateQuestDesc = _mcUpdateQuestDesc;",
                    "// Seed the seven main story quests immediately",
                    "var _quests = [",
                    "    { id:'sq2_sack_kharakhoto',  title:'Sack Khara-Khoto (Heishui Commandary)', type:'main', description:'The convoy has arrived at Heishui Commandary. Hold position while the siege unfolds — the city must fly Mongol colours before we march south.' },",
                    "    { id:'sq2_follow_subutai',   title:'Follow Subutai west', type:'main', description:'Genghis Khan drives south. You ride with Subutai\\'s tümen along the western corridor. Keep pace with the column — do not fall behind.' },",
                    "    { id:'sq2_raid_yanchi',      title:'Raid Yanchi Pass Fort', type:'main', description:'Subutai orders you to clear Yanchi Pass Fort. Strike fast — the garrison must not be allowed to warn the cities west.' },",
                    "    { id:'sq2_take_shazhou',     title:'Take Shazhou with Subutai', type:'main', description:'Ride with Subutai\\'s column to Shazhou. The city controls the western end of the Hexi Corridor.' },",
                    "    { id:'sq2_message_to_khan',  title:'Messenger ride east to Genghis Khan', type:'main', description:'Shazhou is taken. Subutai holds the west. Ride east alone to Suzhou — find the Great Khan and report the western corridor is sealed.' },",
                    "    { id:'sq2_ganzhou',          title:'Reach Ganzhou with Genghis Khan', type:'main', description:'Genghis Khan has taken Suzhou and marches east. Join the main host at Ganzhou — Chagaan Noyan\\'s birthplace awaits.' },",
                    "    { id:'sq2_xingqing',         title:'The Capital Siege — Xingqing', type:'main', description:'The final march. Xingqing, capital of the Western Xia, must fall. End the campaign.' }",
                    "];",
                    "setTimeout(function() {",
                    "    _mcAddQuestLog(_quests[0]);   // open first quest now; rest unlock at story beats",
                    "}, 2000);",
                    "console.log('[MC] v7.3 — Quest log helpers installed.');"
                ].join("\n")
            }});

            // v7.2 — ENGINE FIX E1: PAUSE ALL NPCs DURING DIALOGUE
            // Wraps window.updateNPCs so the entire NPC simulation freezes whenever
            // a dialogue card is on screen. Previously the convoy tick was paused
            // but every other NPC (cosmetic civilians, enemy garrisons, etc.) kept
            // moving — making the world look alive while a "frozen" cutscene played.
            acts.push({ type: "custom_js", params: {
                code: [
                    "if (!window.__mc_updateNPCs_paused_patched) {",
                    "    window.__mc_updateNPCs_paused_patched = true;",
                    "    var _wait = setInterval(function() {",
                    "        if (typeof window.updateNPCs !== 'function') return;",
                    "        clearInterval(_wait);",
                    "        var _origUpdate = window.updateNPCs;",
                    "        window.updateNPCs = function() {",
                    "            if (window.__ST_dialogueBusy) return;   // freeze every NPC while dialogue shows",
                    "            return _origUpdate.apply(this, arguments);",
                    "        };",
                    "        console.log('[MC] v7.2 — updateNPCs now pauses on dialogue.');",
                    "    }, 250);",
                    "}"
                ].join("\n")
            }});

            // v7.4 — fur-cap wrapper removed: engine-side drawFactionHat() handles all factions now.

// v7.2 — ENGINE FIX E2: BLOCK 'Camp beside Settlement' (siege menu) for
            // any city flagged __mc_storyProtected. Story arrivals flip this flag
            // before the player can reach the settlement panel; the button still
            // shows but the call is short-circuited so the player can't get stuck
            // in a story-controlled siege state.
            acts.push({ type: "custom_js", params: {
                code: [
                    "if (!window.__mc_initiatePlayerSiege_patched) {",
                    "    window.__mc_initiatePlayerSiege_patched = true;",
                    "    var _waitSiege = setInterval(function() {",
                    "        if (typeof window.initiatePlayerSiege !== 'function') return;",
                    "        clearInterval(_waitSiege);",
                    "        var _origSiege = window.initiatePlayerSiege;",
                    "        window.initiatePlayerSiege = function(city) {",
                    "            if (city && city.__mc_storyProtected) {",
                    "                if (window.StoryPresentation && window.StoryPresentation.showSubtitle) {",
                    "                    window.StoryPresentation.showSubtitle(",
                    "                        '⚔️ This city is being taken by the Mongol host. Stand aside.',",
                    "                        4000, '#f5d76e');",
                    "                }",
                    "                console.log('[MC] Player siege blocked for story-protected city: ' + city.name);",
                    "                return;",
                    "            }",
                    "            return _origSiege.apply(this, arguments);",
                    "        };",
                    "        console.log('[MC] v7.2 — initiatePlayerSiege now refuses story-protected cities.');",
                    "    }, 250);",
                    "}"
                ].join("\n")
            }});

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
                    "    // v7.0 — also resolve invisible waypoints from a static table",
                    "    // so we never depend on them being in window.cities.",
                    "    var _VIRT_POS = {",
                    "        'Army Divide Point': { x: 1440, y: 850 },",
                    "        'Yanchi Pass Fort':  { x:  900, y:1000 }",
                    "    };",
                    "    function _cityPos(name) {",
                    "        if (_VIRT_POS[name]) return _VIRT_POS[name];",
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
                    "            // v7.0 — ISSUE 7 FIX: skip detached NPCs (Genghis's eastern army).",
                    "            if (npc.__mc_detached) continue;",
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
                    "        // v7.0 — ISSUE 0 FIX: PAUSE EVERYTHING DURING DIALOGUE",
                    "        // Whenever a dialogue is on-screen, freeze the leader AND",
                    "        // every follower in place so the convoy doesn't keep marching",
                    "        // off-camera while the player reads the lines.",
                    "        if (window.__ST_dialogueBusy) {",
                    "            _S._rafId = requestAnimationFrame(_patchedConvoyTick);",
                    "            return;",
                    "        }",
                    "",
                    "        var leader = _findNpc(_S.leaderId);",
                    "",
                    "        if (_S.staying || !leader) {",
                    "            // LAYER 1 FREEZE: While __mc_heishuiFreeze is active, NPCs do NOT",
                    "            // move at all — not even the formation-holding _safeFollowers tick.",
                    "            if (!window.__mc_heishuiFreeze && leader) _safeFollowers(leader, dt);",
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
                "Heishui Commandary (Khara-Khoto) — Autumn 1225.  Follow Genghis Khan's column south.",
                8000, "#f5d76e"
            ));

            // 8b. Log event
            acts.push(_log(
                "🏹 1225 — The Great Khan's column departs KharaKhoto Commandary. " +
                "Temür Noyan rides at the rear. Follow the convoy south. Do not fall behind.",
                "general"
            ));

            // v7.0 — ISSUE 10: open first main quest in the log
            acts.push({ type: "story_quest_set", params: {
                id:          "sq2_sack_kharakhoto",
                title:       "Sack Khara-Khoto (Heishui Commandary)",
                description: "Breach the Black City and break the northern Xia frontier.",
                x: 1720, y: 598, radius: 320,
                noAutoComplete: true
            }});

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
                    "// v7.0 — ISSUE 3 FIX: respect the permanent-disable flag set",
                    "// when Heishui Commandary falls.",
                    "if (window.__mc_escortPermDisabled) return false;",
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
                    "// v7.0 — ISSUE 3 FIX: never trigger menu-reload after Heishui falls.",
                    "if (window.__mc_escortPermDisabled) return false;",
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
    // T0.FOOD_REPLENISH — v7.0 ISSUE 5
    //
    // Every 30 s, top off the food of every convoy NPC AND the player if it
    // has fallen below the replenish threshold. Models foraging / supply
    // trains so the campaign doesn't end early to starvation. Threshold
    // 200, replenished up to 800.
    // ════════════════════════════════════════════════════════════════════════
    {
        id: "t0_food_replenish",
        name: "Ongoing — Mongol Food Replenish (every 30 s)",
        enabled: true, once: false, activatedBy: null,
        conditions: [
            { type: "custom_js", params: {
                code: [
                    "if (typeof window.__mc_foodLast === 'undefined') window.__mc_foodLast = 0;",
                    "if (ctx.elapsedSec - window.__mc_foodLast < 30) return false;",
                    "window.__mc_foodLast = ctx.elapsedSec;",
                    "return true;"
                ].join("\n")
            }}
        ],
        actions: [
            { type: "custom_js", params: {
                code: [
                    "var THRESHOLD = 200, REFILL = 800;",
                    "var topped = 0;",
                    "(window.globalNPCs || []).forEach(function(n) {",
                    "    if (!n) return;",
                    "    var isConvoy = (n.storyId && n.storyId.indexOf('convoy_npc_') === 0) ||",
                    "                   (n.id && n.id.indexOf('convoy_npc_') === 0);",
                    "    if (!isConvoy) return;",
                    "    if (typeof n.food === 'number' && n.food < THRESHOLD) {",
                    "        n.food = REFILL; topped++;",
                    "    }",
                    "});",
                    "if (window.player && typeof window.player.food === 'number' && window.player.food < THRESHOLD) {",
                    "    window.player.food = REFILL; topped++;",
                    "}",
                    "if (topped > 0) console.log('[MC] Food replenished for ' + topped + ' unit(s).');"
                ].join("\n")
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
                    "// ══════════════════════════════════════════════════════════════",
                    "// TRIPLE-LAYER NPC FREEZE — holds ALL convoy NPCs stationary at",
                    "// Heishui until the city faction confirms 'Mongol Empire'.",
                    "// Cleared only inside the verified faction-switch block below.",
                    "// ══════════════════════════════════════════════════════════════",
                    "// LAYER 1: __mc_heishuiFreeze — read by the patched convoy tick;",
                    "//          skips _safeFollowers entirely so NPCs don't wobble.",
                    "window.__mc_heishuiFreeze = true;",
                    "// LAYER 2: pin every convoy NPC position right now so they can't",
                    "//          drift between this tick and the freeze check.",
                    "(function _pinConvoyNPCs() {",
                    "    var ids = (window.__ScenarioConvoy && window.__ScenarioConvoy.followerIds) || [];",
                    "    var leaderId = window.__ScenarioConvoy && window.__ScenarioConvoy.leaderId;",
                    "    var allIds = leaderId ? [leaderId].concat(ids) : ids;",
                    "    allIds.forEach(function(sid) {",
                    "        var npc = (window.globalNPCs || []).find(function(n) {",
                    "            return n && (n.storyId === sid || n.id === sid || n.id === sid + '__story');",
                    "        });",
                    "        if (!npc) return;",
                    "        npc.__mc_frozenX = npc.x;",
                    "        npc.__mc_frozenY = npc.y;",
                    "        npc.__mc_frozen  = true;",
                    "    });",
                    "    console.log('[MC] Heishui freeze: pinned ' + allIds.length + ' convoy NPCs.');",
                    "})();",
                    "// LAYER 3: an interval that re-applies frozen positions every 50ms",
                    "//          as a hard backstop in case any other system moves NPCs.",
                    "var _freezeInterval = setInterval(function() {",
                    "    if (!window.__mc_heishuiFreeze) { clearInterval(_freezeInterval); return; }",
                    "    (window.globalNPCs || []).forEach(function(npc) {",
                    "        if (!npc || !npc.__mc_frozen) return;",
                    "        npc.x = npc.__mc_frozenX;",
                    "        npc.y = npc.__mc_frozenY;",
                    "        npc.isMoving = false;",
                    "        npc.targetX  = npc.__mc_frozenX;",
                    "        npc.targetY  = npc.__mc_frozenY;",
                    "    });",
                    "}, 50);",
                    "var subs = [",
                    "    [4000,  '🪨 Mongol catapults breach the north-wall parapet. Garrison archers retreat from the battlements.'],",
                    "    [8000,  '🔥 Water channel diverted. The cisterns will be dry by nightfall.'],",
                    "    [12000, '⚔️ Ram reaches the north gate. Tangut defenders fight street by street inside the walls.'],",
                    "    [16000, '🏴 The garrison commander is cut down in the market square. Resistance collapses.'],",
                    "    [20000, '🏴 Heishui Commandary (Khara-Khoto) is OVERTAKEN — the Black City now flies Mongol colours.']",
                    "];",
                    "// v7.0 — ISSUE 2 FIX: guaranteed city take-over at the end of the",
                    "// 20-second sack timer. We flip the city's faction + color (just",
                    "// like siege_system.js does on a successful conquest) and trigger",
                    "// the Overtaken banner via __mc_siegeOutcomes so the world map",
                    "// reflects the take-over before the army-divide phase begins.",
                    "setTimeout(function() {",
                    "    var arrs = [window.cities_sandbox, window.cities];",
                    "    var attackerFaction = 'Mongol Empire';",
                    "    var attackerColor = null;",
                    "    if (window.FACTIONS && window.FACTIONS[attackerFaction] && window.FACTIONS[attackerFaction].color) {",
                    "        attackerColor = window.FACTIONS[attackerFaction].color;",
                    "    }",
                    "    arrs.forEach(function(arr) {",
                    "        if (!Array.isArray(arr)) return;",
                    "        for (var i = 0; i < arr.length; i++) {",
                    "            if (arr[i] && arr[i].name === 'Heishui Commandary') {",
                    "                arr[i].faction = attackerFaction;",
                    "                if (attackerColor) arr[i].color = attackerColor;",
                    "                arr[i].isUnderSiege = false;",
                    "                arr[i].__mc_storyProtected = true;   // v7.2 — block player siege menu",
                    "                console.log('[MC] Heishui Commandary OVERTAKEN by Mongol Empire (faction+color updated).');",
                    "            }",
                    "        }",
                    "    });",
                    "    // ── CLEAR ALL THREE FREEZE LAYERS ─────────────────────────────────",
                    "    // City is now confirmed Mongol — unpin NPCs and release the freeze.",
                    "    window.__mc_heishuiFreeze = false;",
                    "    (window.globalNPCs || []).forEach(function(npc) {",
                    "        if (!npc || !npc.__mc_frozen) return;",
                    "        delete npc.__mc_frozen;",
                    "        delete npc.__mc_frozenX;",
                    "        delete npc.__mc_frozenY;",
                    "    });",
                    "    console.log('[MC] Heishui freeze RELEASED — all layers cleared, Mongol faction confirmed.');",
                    "    // Banner via siege outcome system (Overtaken green text)",
                    "    if (window.__mc_siegeOutcomes) {",
                    "        window.__mc_siegeOutcomes['Heishui Commandary'] = {",
                    "            msg:'🏴 Overtaken!', color:'#44dd88',",
                    "            expires: Date.now() + 4000",
                    "        };",
                    "    }",
                    "    // ISSUE 3: disable the too-far-away escort fail FOREVER after",
                    "    // Heishui falls. Player follows Subutai for the rest of Story 2.",
                    "    window.__mc_escortActive = false;",
                    "    window.__mc_escortPermDisabled = true;",
                    "    console.log('[MC] Escort fail disabled permanently — Heishui has fallen.');",
                    "    // v7.3 R3 — fade + teleport player to Subutai, then stick-mode until messenger arc.",
                    "    var SP = window.StoryPresentation;",
                    "    if (SP && SP.fadeOut) SP.fadeOut(900, '#000000');",
                    "    setTimeout(function() {",
                    "        var subutai = (window.globalNPCs || []).find(function(n) {",
                    "            return n.storyId === 'convoy_npc_1' || n.id === 'convoy_npc_1__story';",
                    "        });",
                    "        if (subutai && window.player) {",
                    "            var rx = (Math.random() * 7 + 3) * (Math.random() < 0.5 ? -1 : 1);",
                    "            var ry = (Math.random() * 7 + 3) * (Math.random() < 0.5 ? -1 : 1);",
                    "            window.player.x = subutai.x + rx;",
                    "            window.player.y = subutai.y + ry;",
                    "            console.log('[MC] v7.3 R3 — player teleported to Subutai at offset (' + rx.toFixed(1) + ',' + ry.toFixed(1) + ')');",
                    "        }",
                    "        if (SP && SP.fadeIn) SP.fadeIn(900);",
                    "        // Activate stick-mode: v7.3 R4 — setInterval(100ms) replaces rAF to stop bouncing.",
                    "        // Correction is skipped whenever the player is pressing WASD so there is no",
                    "        // invisible-force fighting the input every frame.",
                    "        window.__mc_stickToSubutai = true;",
                    "        // ── FOLLOW HUD label ─────────────────────────────────────────────────",
                    "        // Create a persistent on-screen reminder shown only while the player",
                    "        // is idle (no WASD) and the drift correction is actively nudging them.",
                    "        var _followHUD = document.getElementById('mc-follow-hud');",
                    "        if (!_followHUD) {",
                    "            _followHUD = document.createElement('div');",
                    "            _followHUD.id = 'mc-follow-hud';",
                    "            _followHUD.style.cssText = [",
                    "                'position:fixed',",
                    "                'bottom:18%',",
                    "                'left:50%',",
                    "                'transform:translateX(-50%)',",
                    "                'background:rgba(0,0,0,0.72)',",
                    "                'border:1px solid #e8a030',",
                    "                'color:#e8a030',",
                    "                'font-family:Georgia,serif',",
                    "                'font-size:13px',",
                    "                'font-style:italic',",
                    "                'padding:7px 18px',",
                    "                'border-radius:5px',",
                    "                'z-index:9200',",
                    "                'pointer-events:none',",
                    "                'display:none',",
                    "                'text-align:center',",
                    "                'letter-spacing:0.5px'",
                    "            ].join(';');",
                    "            _followHUD.textContent = '🐎 Follow Subutai';",
                    "            document.body.appendChild(_followHUD);",
                    "        }",
                    "        var _stickInterval = setInterval(function() {",
                    "            if (!window.__mc_stickToSubutai) {",
                    "                clearInterval(_stickInterval);",
                    "                if (_followHUD) _followHUD.style.display = 'none';",
                    "                console.log('[MC] v7.3 R4 — stick-to-Subutai released.');",
                    "                return;",
                    "            }",
                    "            if (window.__ST_dialogueBusy) { if (_followHUD) _followHUD.style.display = 'none'; return; }",
                    "            var sub = (window.globalNPCs || []).find(function(n) {",
                    "                return n.storyId === 'convoy_npc_1' || n.id === 'convoy_npc_1__story';",
                    "            });",
                    "            if (!sub || !window.player || window.player.disableAICombat) { if (_followHUD) _followHUD.style.display = 'none'; return; }",
                    "            // KEY FIX: skip correction while player is actively pressing WASD/arrows",
                    "            var ks = window.keys || {};",
                    "            var playerMoving = ks['w'] || ks['s'] || ks['a'] || ks['d'] ||",
                    "                               ks['arrowup'] || ks['arrowdown'] || ks['arrowleft'] || ks['arrowright'];",
                    "            var dx = sub.x - window.player.x, dy = sub.y - window.player.y;",
                    "            var dist = Math.sqrt(dx*dx + dy*dy);",
                    "            // Show the 'Follow Subutai' label only when the player is idle AND drifting",
                    "            if (_followHUD) _followHUD.style.display = (!playerMoving && dist > 60) ? 'block' : 'none';",
                    "            if (playerMoving) return;",
                    "            if (dist > 300) {",
                    "                // Safety-net hard snap only when very far away",
                    "                window.player.x = sub.x + 4; window.player.y = sub.y + 4;",
                    "            } else if (dist > 60) {",
                    "                // Gentle drift toward Subutai when player is idle",
                    "                window.player.x += dx * 0.18; window.player.y += dy * 0.18;",
                    "            }",
                    "        }, 100);",
                    "    }, 1100);",
                    "// v7.3 R4: Fire at 12 500ms (when the garrison commander falls — subtitle index 3).",
                    "// This is well before the convoy departs at 28 000ms, so the world-map city",
                    "// icon already shows Mongol colours BEFORE the army starts heading south.",
                    "}, 12500);",
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
            // v7.0 — ISSUE 10: advance the quest log past Khara-Khoto
            { type: "story_quest_complete", params: { id: "sq2_sack_kharakhoto" } },
            { type: "story_quest_set", params: {
                id:          "sq2_follow_subutai",
                title:       "Follow Subutai west",
                description: "Stay close to Subutai's tümen through the western corridor.",
                x: 900, y: 1000, radius: 400,
                noAutoComplete: true
            }},
            { type: "custom_js", params: { code: [
                "if (typeof window._mcCompleteQuestLog === 'function') window._mcCompleteQuestLog('sq2_sack_kharakhoto');",
                "if (typeof window._mcUpdateQuestDesc === 'function')",
                "    window._mcUpdateQuestDesc('sq2_follow_subutai', 'The army has divided. Genghis Khan drives south — you ride with Subutai westward. Keep pace with the column and do not fall behind.');"
            ].join("\n") }},
            _sub("The army divides. Genghis Khan rides east — Subutai takes the western corridor.", 8000, "#f5d76e"),
            _log("⚔️ 1225 — Khara-Khoto falls. The Mongol host divides: Genghis Khan drives south toward Suzhou; Subutai's tümen sweeps the western corridor.", "general"),
            // v7.0 — ISSUE 3 FIX: surface a clear notice that the escort-fail",
            // mechanic is gone for the western corridor. Player follows Subutai",
            // closely until Shazhou; later a quest will redirect them to Genghis.",
            _sub("📜 You now follow Subutai's column closely until Shazhou. The 'too-far' fail is OFF.", 7000, "#8bd8a0"),
            _log("🛡 Escort restriction lifted — keep near Subutai until Shazhou is reached.", "general")
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
            // v7.0 — ISSUE 7 FIX: GENGHIS DETACHMENT BREAKS EAST TO SUZHOU
            // Spawn an independent auto-march loop for Genghis Khan + Tolui Khan
            // + Chagaan Noyan. They detach from the player's convoy, march east
            // to Suzhou, and start their own siege. Subutai (NPC 1) becomes the
            // new convoy leader; player's column heads west.
            { type: "custom_js", params: {
                code: [
                    "(function _splitArmies() {",
                    "    function _findNpc(id) {",
                    "        var arr = window.globalNPCs || [];",
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
                    "    var suzhou = _cityPos('Suzhou');",
                    "    if (!suzhou) { console.warn('[MC] Suzhou not found for Genghis detachment'); return; }",
                    "    var detachIds = ['convoy_npc_0', 'convoy_npc_2', 'convoy_npc_3'];",
                    "    var detach = detachIds.map(_findNpc).filter(Boolean);",
                    "    if (detach.length === 0) { console.warn('[MC] no detachment NPCs found'); return; }",
                    "    // Mark these NPCs so the convoy patched tick ignores them",
                    "    detach.forEach(function(n) { n.__mc_detached = true; });",
                    "    // Hot-swap convoy leader to Subutai (convoy_npc_1) so the column",
                    "    // continues west under his command with the player following.",
                    "    var _S = window.__ScenarioConvoy;",
                    "    if (_S) {",
                    "        _S.leaderId = 'convoy_npc_1';",
                    "        _S.followerIds = ['convoy_npc_4'];   // only the messenger remains",
                    "        console.log('[MC] Convoy leader handed to Subutai; messenger trails. Detachment count=' + detach.length);",
                    "    }",
                    "    // v7.3 R2 — rAF-driven smooth movement (was 200ms setTimeout — choppy)",
                    "    // v7.3 R1 — +30% speed (was 6, now 8 px/sec)",
                    "    var speed = 8;",
                    "    var arrivedAtSuzhou = false;",
                    "    var _lastTs = null;",
                    "    function _detTick(ts) {",
                    "        if (!detach[0] || !suzhou) return;",
                    "        if (window.__ST_dialogueBusy) { _lastTs = null; requestAnimationFrame(_detTick); return; }",
                    "        if (_lastTs === null) _lastTs = ts;",
                    "        var dt = Math.min((ts - _lastTs) / 1000, 0.05);   // cap at 50 ms",
                    "        _lastTs = ts;",
                    "        var leader = detach[0];",
                    "        var dx = suzhou.x - leader.x, dy = suzhou.y - leader.y;",
                    "        var d = Math.sqrt(dx*dx + dy*dy);",
                    "        if (d > 8) {",
                    "            var step = speed * dt;",
                    "            leader.x += (dx / d) * step;",
                    "            leader.y += (dy / d) * step;",
                    "            leader.targetX = suzhou.x;",
                    "            leader.targetY = suzhou.y;",
                    "        } else if (!arrivedAtSuzhou) {",
                    "            arrivedAtSuzhou = true;",
                    "            leader.x = suzhou.x; leader.y = suzhou.y;",
                    "            console.log('[MC] Genghis detachment reached Suzhou — starting siege.');",
                    "            // Start a siege on Suzhou via siege_system if available",
                    "            if (typeof window.startSiege === 'function') {",
                    "                try { window.startSiege(leader, suzhou); }",
                    "                catch (e) { console.warn('[MC] startSiege threw:', e); }",
                    "            }",
                    "            // Banner — Genghis is now sieging Suzhou independently",
                    "            if (window.StoryPresentation && window.StoryPresentation.showSubtitle) {",
                    "                window.StoryPresentation.showSubtitle(",
                    "                    '⚔️ Genghis Khan begins his siege of Suzhou (independent army).',",
                    "                    7000, '#e8a030');",
                    "            }",
                    "            if (typeof window.logGameEvent === 'function') {",
                    "                window.logGameEvent('⚔️ Genghis Khan\\'s detachment has laid siege to Suzhou.', 'general');",
                    "            }",
                    "        }",
                    "        // Drag followers right behind the leader (tight column)",
                    "        for (var i = 1; i < detach.length; i++) {",
                    "            var f = detach[i];",
                    "            if (!f) continue;",
                    "            var bx = leader.x - (i * 6);",
                    "            var by = leader.y - (i * 4);",
                    "            f.x = bx; f.y = by;",
                    "            f.targetX = bx; f.targetY = by;",
                    "        }",
                    "        requestAnimationFrame(_detTick);",
                    "    }",
                    "    requestAnimationFrame(_detTick);",
                    "    window.__mc_genghisDetachStarted = true;",
                    "})();"
                ].join("\n")
            }},
            // Shift formation to 2-column after Subutai departs
            { type: "custom_js", params: {
                code: [
                    "// v7.0 — ISSUE 4 FIX: ULTRA-TIGHT column after army divide.",
                    "// Was col=55, gap=70 — far too spread. Match the pre-divide tight",
                    "// 3-col values (colGap 4 / rowGap 7) so the column stays compact.",
                    "var _S = window.__ScenarioConvoy;",
                    "if (_S && _S.formationSlots) {",
                    "    var col = 3;   // px lateral gap between columns (was 55)",
                    "    var gap = 6;   // px depth per row (was 70)",
                    "    for (var i = 0; i < _S.followerIds.length; i++) {",
                    "        var col2 = (i % 2 === 0) ? -col : col;",
                    "        var row2 = Math.floor(i / 2) + 1;",
                    "        _S.formationSlots[i] = { dx: col2, dy: row2 * gap };",
                    "    }",
                    "    window.__mc_formation = '2col-tight';",
                    "    console.log('[MC] Formation shifted to tight 2-column after army divide (col=' + col + ', gap=' + gap + ').');",
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
            // v7.0 — ISSUE 10: open Yanchi quest in the log
            { type: "story_quest_complete", params: { id: "sq2_follow_subutai" } },
            { type: "story_quest_set", params: {
                id:          "sq2_raid_yanchi",
                title:       "Raid Yanchi Pass Fort",
                description: "Storm the granary fort before it signals Shazhou.",
                x: 900, y: 1000, radius: 320,
                noAutoComplete: true
            }},
            { type: "custom_js", params: { code: [
                "if (typeof window._mcCompleteQuestLog === 'function') window._mcCompleteQuestLog('sq2_follow_subutai');",
                "if (typeof window._mcUpdateQuestDesc === 'function')",
                "    window._mcUpdateQuestDesc('sq2_raid_yanchi', 'Storm the Yanchi Pass granary fort. Kill the relay riders first, then take the gate — do not let a single man warn Shazhou.');"
            ].join("\n") }},
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
            // v7.2 — ENGINE FIX E4: auto-take Yanchi BEFORE settlement menu can open
            _mcStoryTake("Yanchi Pass Fort", "#c8a200"),
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
            // v7.0 — ISSUE 10: advance log to Shazhou objective
            { type: "story_quest_complete", params: { id: "sq2_raid_yanchi" } },
            { type: "story_quest_set", params: {
                id:          "sq2_take_shazhou",
                title:       "Take Shazhou with Subutai",
                description: "Destroy the beacon and break Shazhou's outer wall.",
                x: 285, y: 1048, radius: 320,
                noAutoComplete: true
            }},
            { type: "custom_js", params: { code: [
                "if (typeof window._mcCompleteQuestLog === 'function') window._mcCompleteQuestLog('sq2_raid_yanchi');",
                "if (typeof window._mcUpdateQuestDesc === 'function')",
                "    window._mcUpdateQuestDesc('sq2_take_shazhou', 'Advance on Shazhou with Subutai. Destroy the beacon tower on the outer wall and take the city.');"
            ].join("\n") }},
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
            // v7.2 — ENGINE FIX E4: auto-take Shazhou
            _mcStoryTake("Shazhou", "#c0392b"),
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
            // v7.0 — ISSUE 10: Shazhou taken; quest log redirects player east to Genghis
            { type: "story_quest_complete", params: { id: "sq2_take_shazhou" } },
            { type: "story_quest_set", params: {
                id:          "sq2_message_to_khan",
                title:       "Messenger ride east to Genghis Khan",
                description: "Shazhou has fallen. Subutai holds the western corridor. Ride east to Suzhou — approach within 100 paces of the Great Khan and report: the west is sealed.",
                x: 1160, y: 1257, radius: 360,
                noAutoComplete: true
            }},
            { type: "custom_js", params: { code: [
                "if (typeof window._mcCompleteQuestLog === 'function') window._mcCompleteQuestLog('sq2_take_shazhou');",
                "if (typeof window._mcUpdateQuestDesc === 'function')",
                "    window._mcUpdateQuestDesc('sq2_message_to_khan', 'Shazhou has fallen. Subutai holds the western corridor. Ride east to Suzhou — approach within 100 paces of the Great Khan and report: the west is sealed.');"
            ].join("\n") }},
            // v7.0 — ISSUE 7: route the player east to Genghis Khan now that
            // Subutai's western corridor has terminated at Shazhou.
            _sub("Shazhou taken. Subutai releases you — ride east alone to Genghis Khan.", 7000, "#f5d76e"),
            { type: "show_dialogue", params: {
                speaker: "Subutai", portrait: ART_PATHS.portraits["Subutai"],
                text: "The western corridor is sealed, Temür. Yanchi. Shazhou. Every wall along the Hexi is ours — " +
                      "you helped take them all. The Great Khan needs to hear this from a man who was there. " +
                      "Ride east. Find him at Suzhou. Tell him his western flank is safe and the cities are ours.",
                color: "#c0392b"
            }},
            { type: "show_dialogue", params: {
                speaker: "Subutai", portrait: ART_PATHS.portraits["Subutai"],
                text: "I am consolidating our gains here — I cannot spare the column. " +
                      "But I can spare YOU and your men. Take your hundred cavalry east " +
                      "as reinforcement for the Khan's siege at Suzhou. You are worth more to him there than here.",
                color: "#c0392b"
            }},
            { type: "show_dialogue", params: {
                speaker: "Temür Noyan", portrait: ART_PATHS.portraits["Temür Noyan"],
                text: "Understood. We ride east to the Great Khan at Suzhou. " +
                      "I will tell him the western corridor is closed and that your tümen holds every city.",
                color: "#ffffff"
            }},
            // The escort fail-on-distance is already disabled (issue 3); reaffirm it.
            { type: "custom_js", params: {
                code: [
                    "window.__mc_escortActive = false;",
                    "window.__mc_escortPermDisabled = true;",
                    "window.__mc_stickToSubutai = false;   // v7.3 R3 — release stick-mode",
                    "// Hide the Follow Subutai HUD if still visible",
                    "var hud = document.getElementById('mc-follow-hud');",
                    "if (hud) hud.style.display = 'none';",
                    "// ── GENGHIS PROXIMITY POLL ───────────────────────────────────────────────",
                    "// Fire t_arrive_suzhou when the player rides within 100 px of Genghis Khan",
                    "// (convoy_npc_0) at Suzhou. Also accepts proximity to the Suzhou city point",
                    "// as a fallback in case the NPC has been removed/detached.",
                    "window.__mc_gengisProximityActive = true;",
                    "var _gpInterval = setInterval(function() {",
                    "    if (!window.__mc_gengisProximityActive) { clearInterval(_gpInterval); return; }",
                    "    if (!window.player) return;",
                    "    // Find Genghis NPC",
                    "    var genghis = (window.globalNPCs || []).find(function(n) {",
                    "        return n && (n.storyId === 'convoy_npc_0' || n.id === 'convoy_npc_0__story');",
                    "    });",
                    "    var tx, ty;",
                    "    if (genghis && isFinite(genghis.x)) {",
                    "        tx = genghis.x; ty = genghis.y;",
                    "    } else {",
                    "        // Fallback: Suzhou city position",
                    "        var suz = (window.cities_sandbox || window.cities || []).find(function(c){ return c.name === 'Suzhou'; });",
                    "        if (!suz) return;",
                    "        tx = suz.x; ty = suz.y;",
                    "    }",
                    "    var dx = window.player.x - tx, dy = window.player.y - ty;",
                    "    if (dx*dx + dy*dy <= 100*100) {",
                    "        window.__mc_gengisProximityActive = false;",
                    "        clearInterval(_gpInterval);",
                    "        console.log('[MC] Player within 100 px of Genghis Khan — firing t_arrive_suzhou.');",
                    "        if (window.ScenarioTriggers && window.ScenarioTriggers.fireTrigger) {",
                    "            window.ScenarioTriggers.fireTrigger('t_arrive_suzhou');",
                    "        }",
                    "    }",
                    "}, 250);",
                    "console.log('[MC] Player released from Subutai — riding east as messenger + reinforcement. Proximity poll active.');"
                ].join("\n")
            }},
            { type: "custom_js", params: { code: [
                "// ── v7.4 R1: XIA CAVALRY AMBUSH GROUPS ─────────────────────────────────",
                "// Spawn 3 groups of Xia cavalry between Shazhou (x~280) and Suzhou (x~1160).",
                "// Groups are spread along the route so the player encounters them while",
                "// riding east as messenger. Each group spawns with a proximity dialogue:",
                "// 'He rides alone — Xia cavalry, go get him!'",
                "(function _spawnXiaAmbush() {",
                "    if (window.__mc_xiaAmbushSpawned) return;",
                "    window.__mc_xiaAmbushSpawned = true;",
                "    function _randBetween(a,b){ return a + Math.random()*(b-a); }",
                "    // Three ambush groups placed along the Shazhou→Suzhou corridor",
                "    // Shazhou nx=0.07 (x≈280), Suzhou nx=0.29 (x≈1160); World H=3000",
                "    // Spread groups at nx≈0.11, 0.17, 0.23 (y stays near corridor ny≈0.38-0.42)",
                "    var groups = [",
                "        { x: 440,  y: _randBetween(1100,1200), troops: _randBetween(20,28)|0 },",
                "        { x: 680,  y: _randBetween(1150,1280), troops: _randBetween(22,32)|0 },",
                "        { x: 920,  y: _randBetween(1100,1220), troops: _randBetween(24,40)|0 }",
                "    ];",
                "    var rosterTypes = ['Lancer','Lancer','Horse Archer','Horse Archer'];",
                "    var spoken = [false, false, false];",
                "    groups.forEach(function(g, gIdx) {",
                "        if (!window.globalNPCs) return;",
                "        var count = g.troops;",
                "        var roster = [];",
                "        for (var i=0;i<count;i++) roster.push({ type: rosterTypes[i%4], exp:1 });",
                "        var npc = {",
                "            id: 'xia_ambush_' + gIdx,",
                "            storyId: 'xia_ambush_' + gIdx,",
                "            isImportant: true,",
                "            name: 'Xia Cavalry ' + (gIdx+1),",
                "            role: 'Military',",
                "            count: count,",
                "            roster: roster,",
                "            faction: 'Xiaran Dominion',",
                "            color: '#fbc02d',",
                "            originCity: null,",
                "            targetCity: null,",
                "            x: g.x, y: g.y,",
                "            targetX: g.x, targetY: g.y,",
                "            hp: 120, maxHealth: 120,",
                "            attack: 18, defense: 14, armor: 8,",
                "            speed: 1.2,",
                "            __mc_xiaAmbush: true,",
                "            __aiOverride: false,",
                "            aiPreset: 'patrol'",
                "        };",
                "        window.globalNPCs.push(npc);",
                "    });",
                "    // Proximity poll: when player nears an ambush group, show dialogue once",
                "    var _xiaProxTimer = setInterval(function() {",
                "        if (!window.player) return;",
                "        var allDead = true;",
                "        groups.forEach(function(g, gIdx) {",
                "            var npc = (window.globalNPCs||[]).find(function(n){ return n && n.id === 'xia_ambush_'+gIdx; });",
                "            if (!npc || npc.count <= 0) { return; } // dead/gone",
                "            allDead = false;",
                "            if (spoken[gIdx]) return;",
                "            var dx=window.player.x-npc.x, dy=window.player.y-npc.y;",
                "            if (dx*dx+dy*dy <= 280*280) {",
                "                spoken[gIdx]=true;",
                "                var SP = window.StoryPresentation;",
                "                if (SP && SP.showSubtitle)",
                "                    SP.showSubtitle('\u26a0\uFE0F Xia cavalry spotted! He is isolated — cut him off!', 4500, '#cc2200');",
                "                if (typeof window.logGameEvent === 'function')",
                "                    window.logGameEvent('\u26a0\uFE0F Xia cavalry patrol: \u201CHe rides alone — Xia cavalry, go get him!\u201D', 'general');",
                "                // Set the NPC to chase the player",
                "                npc.targetX = window.player.x;",
                "                npc.targetY = window.player.y;",
                "                npc.aiPreset = 'repel';",
                "                npc.__aiOverride = false;",
                "            }",
                "        });",
                "        if (allDead) clearInterval(_xiaProxTimer);",
                "    }, 350);",
                "    window.__mc_xiaProxTimer = _xiaProxTimer;",
                "    console.log('[MC XiaAmbush v7.4] 3 Xia cavalry ambush groups spawned between Shazhou and Suzhou.');",
                "})();"
            ].join("\n") }},
            _log("📜 Mission — ride east alone to meet Genghis Khan at Suzhou. Your men ride with you as reinforcement. Approach Genghis within 100 paces to report.", "objective")
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
            // v7.2 — ENGINE FIX E4: Suzhou taken by Genghis's eastern detachment
            _mcStoryTake("Suzhou", "#c8a200"),
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
            // v7.2 — ENGINE FIX E4: Ganzhou taken
            _mcStoryTake("Ganzhou", "#c8a200"),
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
            // v7.2 — ENGINE FIX E4: Xiliang surrenders peacefully
            _mcStoryTake("Xiliang", "#c8a200"),
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
            }},
            // v7.4 R1: chain to Xingqing quest marker after Xiliang is taken
            { type: "story_quest_set", params: {
                id:          "sq2_xingqing_march",
                title:       "The Final March — Xingqing",
                description: "The Hexi Corridor is ours. March east to Xingqing, capital of Western Xia. End the campaign.",
                x: 2880, y: 1620, radius: 400,
                triggerOnArrive: "t_arrive_xingqing",
                noAutoComplete: false
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
            // v7.2 — ENGINE FIX E4: Xingqing (capital) eventually taken
            _mcStoryTake("Xingqing (Zhongxing)", "#c8a200"),
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
    },
// ════════════════════════════════════════════════════════════════════════
    // v7.3 R5 — STORY 2 ENDING SEQUENCE (after Ganzhou)
    // ════════════════════════════════════════════════════════════════════════
    // Plays a cinematic narrator sequence covering the historical ending:
    //   Aug 1226 Qilian Mountains → Wuwei surrender → Emperor Xianzong dies →
    //   Liangzhou taken → Helan Shan crossing → Nov 1226 Lingwu siege →
    //   Battle of Yellow River (300k Xia dead) → 1227 Yinchuan siege →
    //   Ögedei + Chagaan push into Jin / Wei River / Shaanxi →
    //   Genghis & Subutai split: Subutai through Tao River + Lanzhou;
    //   Genghis through Qing Shui river / Liupan / Longde →
    //   Chagaan negotiates with Mozhu while Genghis secretly plans his death →
    //   August 1227 Genghis Khan dies (cause uncertain — illness, fall, arrow) →
    //   Sept 1227 Emperor Mozhu surrenders, is executed →
    //   Yinchuan sacked, Western Xia annihilated.
    {
        id: "t_story_ending",
        name: "ENDING — Genghis Khan's Death and the Annihilation of Western Xia",
        enabled: true, once: true, activatedBy: "t_arrive_ganzhou",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            { type: "custom_js", params: {
                code: [
                    "if (window.StoryPresentation && window.StoryPresentation.fadeOut) {",
                    "    window.StoryPresentation.fadeOut(2000, '#000000');",
                    "}"
                ].join("\n")
            }},
            _sub("August 1226 — the Qilian Mountains.", 6000, "#f5d76e"),
            _log("📜 1226 — Ganzhou subdued. The campaign turns toward the heart of Western Xia.", "general"),
            { type: "show_dialogue", params: {
                speaker: "Narrator", portrait: ART_PATHS.portraits["Narrator"],
                text: "Genghis Khan escapes the summer heat in the Qilian Mountains while his armies " +
                      "approach Wuwei — the second-largest city of the Western Xia empire. No relief " +
                      "comes from the capital. Wuwei surrenders rather than be erased.",
                color: "#d4b886"
            }},
            { type: "show_dialogue", params: {
                speaker: "Narrator", portrait: ART_PATHS.portraits["Narrator"],
                text: "Inside the capital, Emperor Xianzong dies — exhausted, broken, or simply old. " +
                      "His successor Mozhu inherits a kingdom whose collapse is now a matter of months.",
                color: "#d4b886"
            }},
            { type: "show_dialogue", params: {
                speaker: "Narrator", portrait: ART_PATHS.portraits["Narrator"],
                text: "In autumn, Genghis rejoins his column, takes Liangzhou, crosses the Helan Shan " +
                      "desert, and in November lays siege to Lingwu — only thirty kilometres from " +
                      "the Tangut capital of Yinchuan.",
                color: "#d4b886"
            }},
            _sub("Battle of the Yellow River — November 1226.", 6000, "#cc2200"),
            { type: "show_dialogue", params: {
                speaker: "Narrator", portrait: ART_PATHS.portraits["Narrator"],
                text: "On the frozen Yellow River and its canals, the last great Western Xia field army " +
                      "— three hundred thousand strong — counter-attacks. The Mongols destroy them. " +
                      "Three hundred thousand Xia soldiers are counted in the snow afterwards. " +
                      "The Xia have no more armies to lose.",
                color: "#d4b886"
            }},
            { type: "show_dialogue", params: {
                speaker: "Genghis Khan", portrait: ART_PATHS.portraits["Genghis Khan"],
                text: "Yinchuan is alone. Surround it. We will outlast them. " +
                      "Meanwhile — Ögedei and Chagaan ride south, into Jin territory. " +
                      "Subutai breaks the Tao River and Lanzhou. I will follow the Qing Shui " +
                      "and meet whoever still believes a sword can save them.",
                color: "#c8a200"
            }},
            _sub("1227 — the siege of Yinchuan lasts six months.", 6000, "#cc2200"),
            { type: "show_dialogue", params: {
                speaker: "Narrator", portrait: ART_PATHS.portraits["Narrator"],
                text: "Six months Yinchuan holds. Genghis directs the siege of Longde, then sends " +
                      "Chagaan Noyan to negotiate. Mozhu agrees to surrender — but asks one month " +
                      "to prepare suitable gifts. Genghis accepts. In private, he plans the emperor's " +
                      "execution.",
                color: "#d4b886"
            }},
            { type: "show_dialogue", params: {
                speaker: "Chagaan Noyan", portrait: ART_PATHS.portraits["Chagaan Noyan"],
                text: "He believes the gift will buy him a life. He does not understand what kind " +
                      "of man he is dealing with.",
                color: "#7a9e5c"
            }},
            _sub("August 1227 — Liupan Mountains.", 6000, "#cc2200"),
            { type: "show_dialogue", params: {
                speaker: "Narrator", portrait: ART_PATHS.portraits["Narrator"],
                text: "Then, in August 1227, in the Liupan Mountains near Guyuan, Genghis Khan dies.",
                color: "#d4b886"
            }},
            { type: "show_dialogue", params: {
                speaker: "Narrator", portrait: ART_PATHS.portraits["Narrator"],
                text: "How? No one knows for certain. Illness — perhaps. A fall from a horse — perhaps. " +
                      "An arrow wound that festered, in some accounts. A Tangut princess hidden in his " +
                      "tent with a small dagger, in others. The Mongols never tell. The Tanguts never " +
                      "learn. The truth dies with him.",
                color: "#d4b886"
            }},
            { type: "show_dialogue", params: {
                speaker: "Subutai", portrait: ART_PATHS.portraits["Subutai"],
                text: "Tell no one. The campaign is not finished. Until Mozhu is in our hands the " +
                      "Great Khan lives. Do you understand me, Temür? The Great Khan LIVES.",
                color: "#c0392b"
            }},
            { type: "show_dialogue", params: {
                speaker: "Temür Noyan", portrait: ART_PATHS.portraits["Temür Noyan"],
                text: "He lives, commander. Until the work is done.",
                color: "#ffffff"
            }},
            _sub("September 1227 — Emperor Mozhu surrenders.", 6000, "#cc2200"),
            { type: "show_dialogue", params: {
                speaker: "Narrator", portrait: ART_PATHS.portraits["Narrator"],
                text: "September 1227. Mozhu rides out of Yinchuan with his gifts and his pleas. " +
                      "He is executed at the gate. The Mongols then pillage Yinchuan, slaughter its " +
                      "population, plunder the imperial tombs west of the city, and complete the " +
                      "effective annihilation of the Western Xia state.",
                color: "#d4b886"
            }},
            { type: "show_dialogue", params: {
                speaker: "Narrator", portrait: ART_PATHS.portraits["Narrator"],
                text: "Within a generation, the Tangut script will be unreadable. Their books will be " +
                      "scattered. Their kingdom will be a list of cities on a map and a footnote in " +
                      "the histories of their conquerors.",
                color: "#d4b886"
            }},
            { type: "show_dialogue", params: {
                speaker: "Narrator", portrait: ART_PATHS.portraits["Narrator"],
                text: "Temür Noyan lives. He marries into the Keshig, the imperial guard. He sees " +
                      "Ögedei crowned. He sees the campaign against the Jin completed. He outlives " +
                      "Subutai by three years and is buried in the steppe with his sword and his bow.",
                color: "#d4b886"
            }},
            { type: "show_dialogue", params: {
                speaker: "Narrator", portrait: ART_PATHS.portraits["Narrator"],
                text: "The world the Great Khan crossed the Gobi to teach a lesson no longer exists. " +
                      "The lesson was learned. By everyone.",
                color: "#d4b886"
            }},
            _sub("THE END — The Wrath of the Khan — Story 2 complete.", 12000, "#cc2200"),
            _log("📜 1227 — Genghis Khan dies. Western Xia is annihilated. The campaign of " +
                 "Temür Noyan is complete.", "general"),
            { type: "custom_js", params: {
                code: [
                    "if (window._mcCompleteQuestLog) {",
                    "    ['sq2_sack_kharakhoto','sq2_follow_subutai','sq2_raid_yanchi',",
                    "     'sq2_take_shazhou','sq2_message_to_khan','sq2_ganzhou','sq2_xingqing']",
                    "    .forEach(function(id) { try { window._mcCompleteQuestLog(id); } catch(e){} });",
                    "}",
                    "console.log('[MC] v7.3 R5 — Story 2 ending sequence complete.');"
                ].join("\n")
            }}
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
    s.storyQuests   = DATA.storyQuests;   // v7.0 — quest log catalogue (Issue 10)

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
    VERSION: "7.0.0"
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
        "t_mission_changle_done":     { text: "Changle yields. Subutai releases you — ride east with 300 cavalry reinforcements for the Khan.", ms: 8000, color: "#f5d76e" },
        "t_arrive_suzhou":            { text: "Suzhou — already fallen. Genghis Khan's column is encamped in the ruins.", ms: 7000, color: "#f5d76e" },
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


// =============================================================================
// story2_ganzhou_expansion_patch.js  v7.2 (compact rewrite, original was truncated)
// =============================================================================
(function () {
    "use strict";
    var P = {
        genghis:        "art/story2/Mongol_General.jpg",
        subutai:        "art/story2/Mongol_Officer1.jpg",
        temur:          "art/story2/Mongol_General.jpg",
        narrator:       "art/story2/old_man.jpg",
        chagaan:        "art/story2/Mongol_Officer1.jpg",
        messenger:      "art/story2/Mongol_Infantry1.jpg"
    };
    function _dlg(lines) { return { type: "show_dialogue", params: { lines: lines } }; }
    function _L(speaker, portrait, text, color) {
        return { speaker: speaker, portrait: portrait, text: text, color: color || "#d4b886" };
    }
    function _sub(text, ms, color) {
        return { type: "show_subtitle", params: { text: text, ms: ms || 5000, color: color || "#f5d76e" } };
    }
    function _log(text, cat) { return { type: "log_message", params: { text: text, category: cat || "general" } }; }
    var OVERRIDES = {};

    // ── v7.4 R1 FIX: t_arrive_suzhou — boots east march + Xia ambush NPCs spawn
    // Previously the OVERRIDE set the quest marker but never launched the NPC march loop.
    // This version:
    //   1. Plays reunion dialogue.
    //   2. Takes Suzhou for Mongol Empire.
    //   3. Boots east-march loop: Genghis detachment → Ganzhou → Xiliang → Xingqing.
    //   4. Sets proximity polls so arrival triggers fire when the PLAYER nears each city.
    OVERRIDES["t_arrive_suzhou"] = {
        name: "Arrival — Suzhou (player messenger meets Genghis Khan, joint siege)",
        actions: [
            _sub("\u2694\uFE0F Suzhou — you ride into the Great Khan's camp.", 7000, "#f5d76e"),
            _log("\u2694\uFE0F 1226 — Tem\u00FCr Noyan reaches Suzhou. Genghis Khan's siege is already underway.", "general"),
            { type: "story_quest_complete", params: { id: "sq2_message_to_khan" } },
            { type: "custom_js", params: { code: [
                "if (typeof window._mcCompleteQuestLog === 'function') window._mcCompleteQuestLog('sq2_message_to_khan');",
                "if (typeof window._mcUpdateQuestDesc === 'function')",
                "    window._mcUpdateQuestDesc('sq2_ganzhou', 'Suzhou has fallen. March east with Genghis Khan to Ganzhou.');",
                "window.__mc_gengisProximityActive = false;"
            ].join("\n") }},
            _dlg([_L("Genghis Khan", P.genghis,
                "Tem\u00FCr. You came from the west. Subutai sent you? Good. " +
                "Tell me \u2014 what did you take?",
                "#c8a200")]),
            _dlg([_L("Tem\u00FCr Noyan", P.temur,
                "Great Khan \u2014 Yanchi Pass Fort, Shazhou, Guazhou, Changle. " +
                "The entire western corridor is ours. Subutai holds every city and consolidates. " +
                "He sent my hundred east as reinforcement for your siege here.",
                "#ffffff")]),
            _dlg([_L("Genghis Khan", P.genghis,
                "The west is sealed. Then Suzhou is the last wall between us and Ganzhou. " +
                "Your men join my siege train. Suzhou will not hold another week.",
                "#c8a200")]),
            // Auto-take Suzhou
            { type: "custom_js", params: { code: [
                "var arrs = [window.cities_sandbox, window.cities];",
                "arrs.forEach(function(arr) {",
                "    if (!Array.isArray(arr)) return;",
                "    var c = arr.find(function(x){ return x && x.name === 'Suzhou'; });",
                "    if (!c) return;",
                "    c.faction = 'Mongol Empire';",
                "    c.isUnderSiege = false;",
                "    c.__mc_storyProtected = true;",
                "    if (window.FACTIONS && window.FACTIONS['Mongol Empire']) c.color = window.FACTIONS['Mongol Empire'].color;",
                "    console.log('[MC] Suzhou taken — Mongol Empire.');",
                "});",
                "if (window.__mc_siegeOutcomes) {",
                "    window.__mc_siegeOutcomes['Suzhou'] = { msg:'\u2694\uFE0F Suzhou Taken!', color:'#c8a200', expires: Date.now()+4000 };",
                "}"
            ].join("\n") }},
            // ── v7.4 R1: Boot east march — Genghis + detachment → Ganzhou → Xiliang → Xingqing
            { type: "custom_js", params: { code: [
                "(function _bootEastMarch() {",
                "    function _cp(name) {",
                "        var arr = window.cities_sandbox || window.cities || [];",
                "        return arr.find(function(c){ return c && c.name === name; }) || null;",
                "    }",
                "    function _np(id) {",
                "        return (window.globalNPCs || []).find(function(n){",
                "            return n && (n.storyId === id || n.id === id + '__story');",
                "        }) || null;",
                "    }",
                "    function _takecity(name) {",
                "        var arrs = [window.cities_sandbox, window.cities];",
                "        arrs.forEach(function(arr) {",
                "            if (!Array.isArray(arr)) return;",
                "            var c = arr.find(function(x){ return x && x.name === name; });",
                "            if (!c) return;",
                "            c.faction = 'Mongol Empire';",
                "            c.isUnderSiege = false;",
                "            c.__mc_storyProtected = true;",
                "            if (window.FACTIONS && window.FACTIONS['Mongol Empire']) c.color = window.FACTIONS['Mongol Empire'].color;",
                "        });",
                "        if (window.__mc_siegeOutcomes)",
                "            window.__mc_siegeOutcomes[name] = { msg:'\u2694\uFE0F ' + name + ' Taken!', color:'#c8a200', expires: Date.now()+4000 };",
                "        console.log('[MC EastMarch] City taken:', name);",
                "    }",
                "    var EAST_ROUTE       = ['Ganzhou', 'Xiliang', 'Xingqing (Zhongxing)'];",
                "    var EAST_TRIGGERS    = ['t_arrive_ganzhou', 't_arrive_xiliang', 't_arrive_xingqing'];",
                "    var EAST_STAY_MS     = [5000, 4000, 4000];",
                "    var eastIdx = 0;",
                "    var speed   = 9;",
                "    var _lastTs = null;",
                "    var _staying = false;",
                "    var _triggered = [false, false, false];",
                "    var detachIds = ['convoy_npc_0', 'convoy_npc_2', 'convoy_npc_3'];",
                "    var detach = detachIds.map(_np).filter(Boolean);",
                "    detach.forEach(function(n){ n.__mc_detached = true; });",
                "    function _fireTrigger(idx) {",
                "        if (_triggered[idx]) return;",
                "        _triggered[idx] = true;",
                "        _takecity(EAST_ROUTE[idx]);",
                "        var tid = EAST_TRIGGERS[idx];",
                "        if (window.ScenarioTriggers && window.ScenarioTriggers.fireTrigger && tid)",
                "            try { window.ScenarioTriggers.fireTrigger(tid); } catch(e){}",
                "        console.log('[MC EastMarch] Fired:', tid);",
                "    }",
                "    function _marchTick(ts) {",
                "        if (_staying) return;",
                "        if (eastIdx >= EAST_ROUTE.length) return;",
                "        var tgt = _cp(EAST_ROUTE[eastIdx]);",
                "        if (!tgt) { eastIdx++; requestAnimationFrame(_marchTick); return; }",
                "        if (_lastTs === null) _lastTs = ts;",
                "        var dt = Math.min((ts - _lastTs) / 1000, 0.08);",
                "        _lastTs = ts;",
                "        var leader = detach.length > 0 ? detach[0] : null;",
                "        if (!leader) { eastIdx++; requestAnimationFrame(_marchTick); return; }",
                "        var dx = tgt.x - leader.x, dy = tgt.y - leader.y;",
                "        var d = Math.sqrt(dx*dx + dy*dy);",
                "        if (d > 14) {",
                "            var step = speed * dt;",
                "            leader.x += (dx/d)*step; leader.y += (dy/d)*step;",
                "            leader.targetX = tgt.x; leader.targetY = tgt.y;",
                "            for (var i=1;i<detach.length;i++) {",
                "                var f=detach[i]; if(!f) continue;",
                "                f.x=leader.x-(i*7); f.y=leader.y-(i*5);",
                "                f.targetX=f.x; f.targetY=f.y;",
                "            }",
                "            requestAnimationFrame(_marchTick);",
                "        } else {",
                "            leader.x=tgt.x; leader.y=tgt.y;",
                "            var arrivedIdx=eastIdx; eastIdx++;",
                "            _staying=true;",
                "            _fireTrigger(arrivedIdx);",
                "            setTimeout(function(){ _staying=false; _lastTs=null; requestAnimationFrame(_marchTick); }, EAST_STAY_MS[arrivedIdx]||4000);",
                "        }",
                "    }",
                "    // Proximity poll — also fires triggers when PLAYER walks into each city",
                "    var _proxIdx = 0;",
                "    var _proxTimer = setInterval(function() {",
                "        if (_proxIdx >= EAST_ROUTE.length) { clearInterval(_proxTimer); return; }",
                "        if (!window.player) return;",
                "        var tgt = _cp(EAST_ROUTE[_proxIdx]);",
                "        if (!tgt) return;",
                "        var pdx=window.player.x-tgt.x, pdy=window.player.y-tgt.y;",
                "        if (pdx*pdx+pdy*pdy <= 320*320) {",
                "            var idx=_proxIdx; _proxIdx++;",
                "            _fireTrigger(idx);",
                "        }",
                "    }, 400);",
                "    window.__mc_eastProxTimer = _proxTimer;",
                "    requestAnimationFrame(_marchTick);",
                "    window.__mc_eastMarchStarted = true;",
                "    console.log('[MC EastMarch v7.4] Booted: Ganzhou → Xiliang → Xingqing.');",
                "})();"
            ].join("\n") }},
            { type: "story_quest_set", params: {
                id:          "sq2_ganzhou",
                title:       "Reach Ganzhou with Genghis Khan",
                description: "Suzhou has fallen. Follow Genghis Khan east to Ganzhou.",
                x: 1560, y: 1500, radius: 360,
                noAutoComplete: true
            }}
        ]
    };

    // ── v7.4 R1 FIX: t_arrive_ganzhou — chains to Xiliang quest after dialogue
    OVERRIDES["t_arrive_ganzhou"] = {
        name: "Arrival — Ganzhou (Chagaan drama, compact)",
        actions: [
            _sub("Ganzhou — Chagaan's father commands the walls.", 7000, "#f5d76e"),
            _log("\u2694\uFE0F 1226 — The army reaches Ganzhou. Chagaan Noyan's father commands its walls.", "general"),
            _dlg([_L("Chagaan Noyan", P.chagaan, "Great Khan, let me speak with my father.", "#7a9e5c"),
                  _L("Genghis Khan", P.genghis, "Go. You have until midday.", "#c8a200")]),
            _sub("An hour passes. Then shouting from within the walls.", 5000, "#a89060"),
            _dlg([_L("Chagaan Noyan", P.chagaan, "My father is dead. Wei Bochang killed him in the council hall. Thirty-five officers stood by.", "#7a9e5c")]),
            _dlg([_L("Genghis Khan", P.genghis, "Then those thirty-five will die. The rest live, on Chagaan's plea. Begin the siege.", "#c8a200")]),
            _log("\u1F54A\uFE0F 1226 — After five months, Ganzhou opens. 35 conspirators executed at the gate; the city is spared.", "general"),
            { type: "story_quest_complete", params: { id: "sq2_ganzhou" } },
            { type: "custom_js", params: { code: [
                "if (typeof window._mcCompleteQuestLog === 'function') window._mcCompleteQuestLog('sq2_ganzhou');"
            ].join("\n") }},
            { type: "story_quest_set", params: {
                id:          "sq2_xiliang_march",
                title:       "March to Xiliang",
                description: "Ganzhou is ours. The host presses east — Xiliang (Wuwei) surrenders without a siege.",
                x: 2040, y: 1800, radius: 360,
                triggerOnArrive: "t_arrive_xiliang",
                noAutoComplete: false
            }}
        ]
    };

    var _patchedIds = [];
    function _applyPatch() {
        if (!window.ScenarioTriggers || !window.ScenarioTriggers._state) { setTimeout(_applyPatch, 120); return; }
        var triggers = window.ScenarioTriggers._state.triggers;
        if (!Array.isArray(triggers) || triggers.length === 0) { setTimeout(_applyPatch, 120); return; }
        triggers.forEach(function (t) {
            var ov = OVERRIDES[t.id];
            if (!ov) return;
            t.actions = ov.actions;
            if (ov.name) t.name = ov.name;
            _patchedIds.push(t.id);
        });
        console.log("[GanzhouPatch v7.2] Applied: " + _patchedIds.join(", "));
    }
    setTimeout(_applyPatch, 0);
    window.__story2GanzhouPatch = { apply: _applyPatch, patched: function () { return _patchedIds.slice(); } };
    console.log("[GanzhouPatch v7.2] story2_ganzhou_expansion_patch.js loaded.");
})();