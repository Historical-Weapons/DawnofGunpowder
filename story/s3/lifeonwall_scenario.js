// =============================================================================
// STORY 3 — LIFE ON THE WALL  (songJinwar_scenario.js)
// =============================================================================
//
// "Life on the Wall" — Liaodong frontier, 1578.
//
// HISTORICAL CONTEXT
// ──────────────────
// By the 1570s the Ming's northeastern frontier ran through Liaodong, the
// wedge of territory between the Liao River and the forested hills that were
// home to the Jurchen tribes — Nurhaci's people, though Nurhaci himself is
// still a teenager in 1578 and nobody on the wall has heard his name yet.
// The Jurchens are divided into rival confederations (Jianzhou, Haixi,
// Yeren) who raid each other as often as they raid the Ming.
//
// The dominant fact of this frontier is General Li Chengliang, Liaodong's
// regional commander since 1570. In 1575 his forces killed the Jianzhou
// chieftain Wang Gao, the most powerful Jurchen leader of his generation —
// a decisive Ming victory that broke Jianzhou unity for a decade. The
// frontier in 1578 is the UNEASY QUIET that followed: smaller chieftains and
// their sons feuding over what Wang Gao left behind, occasionally raiding
// Ming border posts for grain, horses, and iron, while Li Chengliang's
// garrisons hold the wall and wait to see who rises next.
//
// Nobody on the wall knows that in five years one of those minor chieftains'
// grandsons — a boy currently being raised in the household of a Ming-allied
// Jurchen rival — will avenge his father and grandfather, unite the
// Jianzhou tribes, and in two generations his descendants will rule China.
// They only know the frontier is quiet this year, and quiet years end.
//
// TECHNOLOGY
// ──────────
// This is a live weapons-transition on the frontier. Hand cannon and heavy
// crossbows are the old standard. What's new: the Folangji (佛郎機) —
// Portuguese-derived breech-loading swivel cannon, adopted by the Ming
// military from the 1520s onward and now standard artillery on northern
// garrisons — and matchlock arquebuses (鳥銃, "bird guns"), still expensive
// and issued only to picked frontier troops rather than the general levy.
// Both are on this wall. Neither is common enough yet that a green recruit
// starts out carrying one.
//
// This is the LULL. 90% boredom. 10% sudden terror.
//
// PLAYER  —  Liu Sheng (劉勝), age 20
//   Second son of a poor farming family from the Wei valley. Older brother
//   inherits the land. Liu Sheng gets nothing. His father served under Li
//   Chengliang in the 1575 campaign against Wang Gao and came home with a
//   crippled hand and a permanent wariness of the forest line, and he warns
//   his son:
//     "Men who praise war have never smelled a burned village. If they offer
//      you a uniform, take it. But if they offer you glory, run."
//   Liu Sheng joins the army anyway. The wages are stable. So they say.
//
// STARTING POST  —  Fushun Suo (撫順所)
//   Small frontier fort on the wall itself, in the Kaiyuan sector of the
//   Liaodong defense line. 400 men on paper. ~170 in reality. The rest:
//   dead in old skirmishes, deserted, on fake payrolls, or skimmed by
//   corrupt officers. Quintessential Ming frontier bureaucracy.
//
// CHAPTER STRUCTURE
// ─────────────────
//   1. ARRIVAL          —  Captain Yu hands you a shovel. Wall repair.
//   2. DAILY LIFE       —  Stolen sheep · Tax escort · Beacon · Deserters · Powder
//   3. FIRST RAID        —  A small Jianzhou raiding party hits a hamlet at night.
//   4. THE NEW GUNS     —  Folangji cannon convoy from Liaoyang. Officer Shi.
//                          Field test: bandits at the abandoned watchtower.
//   5. FALSE ALARM      —  Beacon lit. Cook burned the millet.
//   6. CORRUPTION       —  Commander Xu's ghost soldiers exposed.
//   7. REAL SCOUTS      —  Wei sees real Jurchen riders. Nobody believes him.
//   8. THE QUIET        —  Veteran Wei on the parapet: "Hear that silence?"
//   9. MOBILIZATION     —  Word from Liaoyang. The frontier is moving again.
//
// LOAD ORDER (index.html):
//   sandboxmode_overworld.js        (provides FACTIONS, PALETTE, world dims)
//   sandboxmode_npc_system.js
//   scenario_triggers.js            (ScenarioTriggers runtime)
//   scenario_update.js              (ScenarioRuntime)
//   storymode_presentation.js       (StoryPresentation cinematic player)
//   quest_system.js                 (StoryQuests log + waypoints)
//   story_quest_patch.js
//   songJinwar_scenario.js          ← THIS FILE
//   story3_map_and_update.js        ← entry point initGame_story3()
//
// =============================================================================
// ⚠️ DIVERGENCE NOTICE — read before writing/merging any new chapters
// =============================================================================
// A SEPARATE session is independently continuing Story 3's narrative past
// Chapter 9, so there are (or will be) TWO divergent continuations of this
// same file in the wild. Nothing past Chapter 9 was added here in THIS
// session on purpose, specifically to avoid creating a third, conflicting
// branch — Chapters 1–9 below are unmodified except for one small, purely
// mechanical fix (see "SESSION CHANGES" just below); no new chapters, quests,
// or dialogue were authored here.
//
// RECOMMENDED FUSION APPROACH, once the other session's version is in hand:
//   1. Treat Chapters 1–9 in THIS file as the shared baseline — both
//      versions should already agree on these verbatim (nothing here changed
//      them). If they've diverged even here, diff first and reconcile before
//      touching anything past Chapter 9.
//   2. Chapter 9's cliffhanger ("the frontier moves again... to be
//      continued") is the actual fork point. Pull the other session's
//      Chapter 10+ trigger/quest/NPC blocks in as a clearly separate,
//      labelled section below (e.g. "CHAPTER 10+ — CANDIDATE A") rather than
//      interleaving them chapter-by-chapter with anything written here — that
//      keeps a side-by-side comparison possible instead of a silent overwrite.
//   3. Watch for id collisions on merge: trigger ids (t_*), quest ids (sq3_*),
//      and IMPORTANT_NPCS ids all need to stay globally unique within this
//      file. If both sessions independently invented a "Chapter 10", they
//      almost certainly reused similar id patterns (t_the_raid_arrive,
//      sq3_the_raid, etc.) — rename one set before merging, don't just
//      concatenate.
//   4. Pick per-beat, not per-file: it's fine (expected, even) to take the
//      stronger take on one beat from one version and a different beat from
//      the other — the two aren't necessarily "keep one, discard the other."
//
// SESSION CHANGES (this session only):
//   - CONFIG.wall.nxStart/nxEnd corrected from 0.02/0.98 to 0.0/1.0, and
//     CONFIG.wallOpenings trimmed from 3 entries to the 1 real gate. This is
//     a pure bug fix matching story3_map_and_update.js's actual rendered
//     wall (which no longer stops short of the map edges and no longer has
//     the two extra "patrol gap" breaks) — not narrative content, safe to
//     keep regardless of which chapter-10+ version wins.
// =============================================================================

(function () {
"use strict";

if (window.SongJinScenario) {
    console.log("[MingFrontier] Already initialised — skipping double-load.");
    return;
}

// =============================================================================
// CONFIG — single source of truth for tunable scenario constants
// =============================================================================
var CONFIG = {

    // ── FACTIONS ─────────────────────────────────────────────────────────────
    factions: {
        PLAYER: "Ming Dynasty",
        ENEMY:  "Jianzhou Jurchens",
        BANDIT: "Bandits"
    },

    // ── PLAYER  (Liu Sheng) ──────────────────────────────────────────────────
    // Fresh recruit — small kit, light infantry roster.
    // Fushun Suo sits ~40px south of the wall band's south face (moved
    // closer to the wall from the old ~150px gap — kept in sync with
    // FIXED_SETTLEMENTS_story3 in story3_map_and_update.js).
    player: {
        x:          1680,
        y:          1237,
        troops:     12,
        gold:       50,
        food:       80,
        hp:         200,
        maxHealth:  200,
        rosterPct: {
            "Spearman":          50,
            "Archer":            25,
            "Shielded Infantry": 25
        }
    },

    // ── WORLD ANCHORS (px coords for editor + map module) ────────────────────
    //
    // World: 4000×3000 px. The wall runs across the upper-middle of the map;
    // story locations sit SOUTH of the wall except for the northern forest frontier
    // anchors used for "scout tracking" quests. The wall has no gate — only
    // sparse, narrow patrol paths between segments (~32 px walkable gaps).
    //
    locations: {
        FUSHUN_SUO:       { name: "Fushun Suo",        x: 1680, y: 1237 },
        DATONG:                { name: "Kaiyuan Garrison",       x: 1080, y: 1880 },
        XUANFU:                { name: "Liaoyang",               x: 2600, y: 2020 },
        JUYONG_PASS:           { name: "Fushun Pass Tower",      x: 1920, y: 1266 },
        NORTH_BEACON:          { name: "North Beacon Tower",     x: 1680, y: 1270 }, // just south of wall
        SHEEP_HAMLET:          { name: "Sheep Hamlet (Yangwa)",  x: 2000, y: 1500 },
        HORSE_VILLAGE:         { name: "Horse Village (Mawang)", x: 1280, y: 1520 },
        TAX_POST:              { name: "Grain Tax Post",         x: 1520, y: 1760 },
        // Matches the "Powder Magazine" custom-location building placed on
        // the story3 overworld map (see FIXED_SETTLEMENTS_story3 in
        // story3_map_and_update.js) — same coordinates, same building.
        POWDER_MAGAZINE:       { name: "Powder Magazine",        x: 1160, y: 1258 },
        // Burned hamlet sits just south of the wall — closest civilian
        // settlement to the forest frontier. Jurchen riders reach it through
        // a narrow gap between wall segments.
        BURNED_HAMLET:         { name: "Old Border Hamlet",      x: 2200, y: 1280 },
        ABANDONED_WATCHTOWER:  { name: "Ruined Watchtower",      x:  720, y: 1340 },
        // Jianzhou camp is far north — reached only via wall gaps. The "real
        // scouts" trigger fires when the player gets near (1480, 750) which
        // is reachable via the central wall opening at x=1680.
        MONGOL_CAMP:           { name: "Jianzhou War Camp",      x: 1680, y:  540 },
        REAL_SCOUT_TRAIL:      { name: "Scout Trail (north)",    x: 1480, y:  750 },
        // Final-scene fade marker
        BEIJING_ROAD_MARKER:   { name: "Beijing Road Marker",    x: 2200, y: 2780 },
        // Extra Ming settlements (no quests; just to make the map feel alive)
        WEI_VILLAGE:           { name: "Wei Village",            x:  600, y: 1880 },
        TIAN_VILLAGE:          { name: "Tian Village",           x: 2900, y: 1540 },
        DING_HAMLET:           { name: "Ding Hamlet",            x: 3300, y: 1720 },
        WEN_VILLAGE:           { name: "Wen Village",            x:  900, y: 1420 },
        QUARRY_OUTPOST:        { name: "Stone Quarry Outpost",   x: 3500, y: 1320 }
    },

    // ── WALL GEOMETRY  (matches story3_map_and_update.js exactly) ────────────
    // nxStart/nxEnd updated to 0.0/1.0 — the wall now runs flush to both map
    // edges (previously stopped 2% short on each side).
    wall: {
        nyTop:     0.389,     // y ≈ 1167
        nyBottom:  0.411,     // y ≈ 1233
        nxStart:   0.0,
        nxEnd:     1.0
    },

    // ── WALL OPENINGS (the one real gate — NOT patrol paths) ─────────────────
    // The two "patrol path" gaps (western/eastern) were removed — the wall is
    // now one continuous band with only this single closable gate as an
    // opening, directly north of Fushun Suo.
    wallOpenings: [
        { x: 1680, width: 32 }  // central — directly north of Fushun Suo
    ],

    // ── ART (placeholder paths — files don't exist yet; fallbacks will play) ──
    artBase: "art/story3/"
};

// =============================================================================
// FACTION REGISTRY
// =============================================================================
var FACTIONS_story3 = {
    "Ming Dynasty": {
        color: "#b71c1c",
        geoWeight: { north: 0.20, south: 0.85, west: 0.50, east: 0.50 }
    },
    "Jianzhou Jurchens": {
        color: "#455a64",
        // Off-map weights so procedural city seeding never assigns the
        // Jurchens a city. They only exist through explicit story patrols.
        geoWeight: { north: 0.02, south: 0.05, west: 0.02, east: 0.08 }
    },
    "Bandits": {
        color: "#5d4037",
        geoWeight: { north: 0.50, south: 0.50, west: 0.50, east: 0.50 }
    }
};

var SYLLABLE_POOLS_story3 = {
    "Ming Dynasty": [
        "Yan","Jing","Tai","Yuan","Kai","Feng","Xiang","Ji","Hua","Zhou",
        "Cang","An","Yong","Heng","Ping","Bao","Ding","Tong","Wei","Long",
        "Ze","Shun","Qing","Shen","Yang","Hu","Min","Jie","Zhao","Mei",
        "Zhen","Ning","Chang","Sui","Xin","Ru","De","Cheng","Wen","Tian"
    ],
    "Jianzhou Jurchens": [
        "Nurha","Taksi","Giocang","Fiongdon","Eidu","Šose","Buyan","Cangg",
        "Ata","Wang","Gao","Nikan","Wailan","Fulgi","Yehe","Hada","Ula",
        "Hoifa","Möngke","Girin","Šurhaci","Dudu","Anfiyanggu","Yangginu"
    ],
    "Bandits": [
        "Hei","Lang","Sha","Du","Mang","Ku","Huo","Dao","Zei","Kuang",
        "Wei","Ye","Mo","Luan","Jie","Yin","Yama","Kuro"
    ]
};

function applyStory3Factions() {
    if (typeof FACTIONS === 'undefined' || typeof SYLLABLE_POOLS === 'undefined') {
        console.error("[MingFrontier] FACTIONS / SYLLABLE_POOLS not present — sandboxmode_overworld.js must load first.");
        return;
    }
    Object.keys(FACTIONS).forEach(k => delete FACTIONS[k]);
    Object.assign(FACTIONS, FACTIONS_story3);
    Object.keys(SYLLABLE_POOLS).forEach(k => delete SYLLABLE_POOLS[k]);
    Object.assign(SYLLABLE_POOLS, SYLLABLE_POOLS_story3);
    if (typeof initDiplomacy === 'function') initDiplomacy(FACTIONS);
    console.log("[MingFrontier] Factions applied:", Object.keys(FACTIONS).join(", "));
}

// =============================================================================
// NPC SPAWN BAN
// =============================================================================
// Story 3 wants:
//   • Ming procedural NPCs  ENABLED  (civilians + patrols south of the wall)
//   • Jianzhou Jurchens         BANNED   (only explicit story patrols)
//   • Bandits               BANNED   (only explicit ambush groups)
function _stampInitialBan() {
    if (!window.__npcSpawnBans) {
        window.__npcSpawnBans = { factions: [], roles: [] };
    }
    ["Jianzhou Jurchens", "Bandits"].forEach(function (f) {
        if (!window.__npcSpawnBans.factions.includes(f)) {
            window.__npcSpawnBans.factions.push(f);
        }
    });
    console.log("[MingFrontier] NPC spawn ban stamped:",
                "factions=" + JSON.stringify(window.__npcSpawnBans.factions));
}
_stampInitialBan();

// =============================================================================
// HELPERS
// =============================================================================
function _buildRoster(pct, count) {
    var pool = [];
    Object.keys(pct).forEach(function (type) {
        var n = Math.round((pct[type] / 100) * count);
        for (var i = 0; i < n; i++) pool.push({ type: type, exp: 1 });
    });
    while (pool.length < count) pool.push({ type: "Spearman", exp: 1 });
    return pool.slice(0, count);
}
function _sub(text, ms, color) {
    return { type: "show_subtitle", params: { text: text, ms: ms || 5000, color: color || "#f5d76e" } };
}
function _log(text, category) {
    return { type: "log_message", params: { text: text, tag: category || "general" } };
}
function _line(side, name, color, portrait, text) {
    return { side: side, name: name, color: color, portrait: portrait, text: text };
}
function _dlg(lines) {
    return { type: "show_dialogue", params: { lines: lines } };
}

// =============================================================================
// ART PATHS
// ─────────────────────────────────────────────────────────────────────────────
// Scene keys marked ✅ have a real file on disk (carried over from prior build).
// Portrait keys marked ✅ have a real file on disk.
// Unmarked keys are placeholders — engine falls back to defaults if missing.
// =============================================================================
var ART_PATHS = {

    // ── SCENE / BACKGROUND ART ───────────────────────────────────────────────

    // Placeholder — no file yet; will be replaced when frontier art arrives
    forest_horizon:       CONFIG.artBase + "northern_forest_horizon.jpg",
    fushun_suo:     CONFIG.artBase + "fushun_suo.jpg",
    burning_hamlet:      CONFIG.artBase + "burning_border_hamlet.jpg",
    cannon_yard:         CONFIG.artBase + "bronze_cannon_yard.jpg",
    jurchen_campfires:    CONFIG.artBase + "jurchen_campfires_north.jpg",

    // ✅ PROVIDED — soldiers watching from the parapet at dusk
    //    Used in: STORY_INTRO art3, Ch5 false alarm, Ch8 quiet moment
    on_walls_watching:   CONFIG.artBase + "onthewallswatching.jpg",
    night_watch:         CONFIG.artBase + "onthewallswatching.jpg",   // alias

    // ✅ PROVIDED — garrison soldiers at daily tasks on the wall
    //    Used in: STORY_INTRO art2, Ch1 wall repair, Ch2 beacon repair
    everyday_life_walls: CONFIG.artBase + "everydaylifeonthewalls1.png",

    // ✅ PROVIDED — mountain wall fortification, towers, archers on the heights
    //    Used in: Ch7 real scouts, Ch8 quiet moment, Ch9 mobilization
    mountain_defence:    CONFIG.artBase + "mountain defence.png",

    // ✅ PROVIDED — grain wagons and supply carts moving along the road
    //    Used in: Ch2 tax escort, Ch2 catch deserters, Ch4 cannon convoy
    supply_caravan:      CONFIG.artBase + "supplies caravans nearby.png",

    // ✅ PROVIDED — melee skirmish at the wall face, shields and spears
    //    Used in: Ch3 first raid, Ch4 cannon test
    skirmish_wall:       CONFIG.artBase + "skirmish at wall1.png",

    // ── PORTRAIT ART ─────────────────────────────────────────────────────────

    portraits: {
        // ✅ PROVIDED
        "Narrator":            CONFIG.artBase + "old_man_narrator.jpg",
        // ✅ PROVIDED
        "Liu Sheng":           CONFIG.artBase + "song_recruit.jpg",
        // ✅ PROVIDED — standing farmer, fits Liu Sheng's father
        "Liu Sheng's Father":  CONFIG.artBase + "Farmer2.jpg",
        // ✅ PROVIDED — high-ranking officer in full uniform (re-used for Ming)
        "Captain Yu":          CONFIG.artBase + "Song_HighRankOfficer.jpg",
        // ✅ PROVIDED — weathered veteran officer face
        "Veteran Wei":         CONFIG.artBase + "Officer3.jpg",
        // Placeholder — no file yet
        "Cook Han":            CONFIG.artBase + "song_cook.jpg",
        // Placeholder — no file yet
        "Clerk Ma":            CONFIG.artBase + "song_clerk.jpg",
        // Placeholder — no file yet
        "Quartermaster Du":    CONFIG.artBase + "song_officer.jpg",
        // Placeholder — no file yet (artillery officer, frontier artillery)
        "Officer Shi":         CONFIG.artBase + "song_engineer.jpg",
        // ✅ PROVIDED — rice-hat farmer, village woman archetype
        "Old Woman":           CONFIG.artBase + "ricehat_Farmer.jpg",
        // Placeholder — no file yet
        "Deserter Bo":         CONFIG.artBase + "ragged_soldier.jpg",
        // ✅ PROVIDED — general in command armour (Commander Xu)
        "Commander Xu":        CONFIG.artBase + "Song_General.jpg",
        // ✅ PROVIDED — forest rider, used for Jurchen scouts & outriders
        "Jurchen Scout":        CONFIG.artBase + "Jin1.jpg",
        // ✅ PROVIDED — second forest rider, used for Ch7 real-scout confrontation
        "Jurchen Raider":       CONFIG.artBase + "Jin2.jpg",
        // Placeholder — no file yet
        "Bandit Leader":       CONFIG.artBase + "bandit_leader.jpg"
    }
};

// =============================================================================
// PLAYER_SETUP
// =============================================================================
var PLAYER_SETUP = {
    x:           CONFIG.player.x,
    y:           CONFIG.player.y,
    faction:     CONFIG.factions.PLAYER,
    troops:      CONFIG.player.troops,
    gold:        CONFIG.player.gold,
    food:        CONFIG.player.food,
    hp:          CONFIG.player.hp,
    maxHealth:   CONFIG.player.maxHealth,
    enemies:     [CONFIG.factions.ENEMY, CONFIG.factions.BANDIT],
    roster:      _buildRoster(CONFIG.player.rosterPct, CONFIG.player.troops),
    rosterMode:  "hard",
    portraitUrl: ART_PATHS.portraits["Liu Sheng"]
};

// =============================================================================
// IMPORTANT NPCs
// =============================================================================
// Captain Yu, Veteran Wei, Commander Xu, Quartermaster Du, and Cook Han are
// always-present at Fushun Suo from boot. The rest are spawned on-demand
// by chapter triggers when the player walks into the relevant proximity radius.
var IMPORTANT_NPCS = [
    // ── ALWAYS-ON  (autoSpawn: true) ─────────────────────────────────────────
    {
        id:          "captain_yu",
        name:        "Captain Yu",
        faction:     CONFIG.factions.PLAYER,
        x:           CONFIG.locations.FUSHUN_SUO.x + 20,
        y:           CONFIG.locations.FUSHUN_SUO.y - 20,
        targetX:     CONFIG.locations.FUSHUN_SUO.x + 20,
        targetY:     CONFIG.locations.FUSHUN_SUO.y - 20,
        role:        "Military",
        troops:      18,
        roster:      _buildRoster({ "Spearman": 70, "Archer": 30 }, 18),
        rosterMode:  "hard",
        hp: 180, attack: 14, defense: 12, armor: 8,
        gold: 50, food: 60,
        autoSpawn:   true,
        portraitUrl: ART_PATHS.portraits["Captain Yu"]
    },
    {
        id:          "veteran_wei",
        name:        "Veteran Wei",
        faction:     CONFIG.factions.PLAYER,
        x:           CONFIG.locations.FUSHUN_SUO.x - 25,
        y:           CONFIG.locations.FUSHUN_SUO.y + 10,
        targetX:     CONFIG.locations.FUSHUN_SUO.x - 25,
        targetY:     CONFIG.locations.FUSHUN_SUO.y + 10,
        role:        "Military",
        troops:      10,
        roster:      _buildRoster({ "Archer": 60, "Spearman": 40 }, 10),
        rosterMode:  "hard",
        hp: 160, attack: 12, defense: 10, armor: 8,
        autoSpawn:   true,
        portraitUrl: ART_PATHS.portraits["Veteran Wei"]
    },
    {
        id:          "commander_xu",
        name:        "Commander Xu",
        faction:     CONFIG.factions.PLAYER,
        x:           CONFIG.locations.FUSHUN_SUO.x + 60,
        y:           CONFIG.locations.FUSHUN_SUO.y + 40,
        targetX:     CONFIG.locations.FUSHUN_SUO.x + 60,
        targetY:     CONFIG.locations.FUSHUN_SUO.y + 40,
        role:        "Military",
        troops:      20,
        roster:      _buildRoster({ "Shielded Infantry": 60, "Spearman": 40 }, 20),
        rosterMode:  "hard",
        hp: 220, attack: 16, defense: 14, armor: 12,
        autoSpawn:   true,
        portraitUrl: ART_PATHS.portraits["Commander Xu"]
    },
    {
        id:          "quartermaster_du",
        name:        "Quartermaster Du",
        faction:     CONFIG.factions.PLAYER,
        x:           CONFIG.locations.FUSHUN_SUO.x + 80,
        y:           CONFIG.locations.FUSHUN_SUO.y + 80,
        targetX:     CONFIG.locations.FUSHUN_SUO.x + 80,
        targetY:     CONFIG.locations.FUSHUN_SUO.y + 80,
        role:        "Commerce",
        troops:      5,
        roster:      _buildRoster({ "Spearman": 100 }, 5),
        rosterMode:  "hard",
        hp: 100, gold: 400, food: 200,
        autoSpawn:   true,
        portraitUrl: ART_PATHS.portraits["Quartermaster Du"]
    },
    {
        id:          "cook_han",
        name:        "Cook Han",
        faction:     CONFIG.factions.PLAYER,
        x:           CONFIG.locations.FUSHUN_SUO.x + 100,
        y:           CONFIG.locations.FUSHUN_SUO.y + 110,
        targetX:     CONFIG.locations.FUSHUN_SUO.x + 100,
        targetY:     CONFIG.locations.FUSHUN_SUO.y + 110,
        role:        "Civilian",
        troops:      2,
        roster:      _buildRoster({ "Spearman": 100 }, 2),
        rosterMode:  "hard",
        hp: 80, food: 90,
        autoSpawn:   true,
        portraitUrl: ART_PATHS.portraits["Cook Han"]
    },

    // ── ON-DEMAND  (spawned by trigger actions) ──────────────────────────────
    {
        id:          "raider_probe",
        name:        "Jianzhou Raider Probe",
        faction:     CONFIG.factions.ENEMY,
        x:           CONFIG.locations.FUSHUN_SUO.x,
        y:           CONFIG.locations.FUSHUN_SUO.y - 260, // just north of the gate
        role:        "Military",
        troops:      7,
        roster:      _buildRoster({ "Lancer": 60, "Horse Archer": 40 }, 7),
        rosterMode:  "hard",
        hp: 90, gold: 0, food: 0,
        portraitUrl: ART_PATHS.portraits["Jurchen Raider"]
    },
    {
        id:          "deserter_bo",
        name:        "Deserter Bo",
        faction:     CONFIG.factions.BANDIT,
        x:           CONFIG.locations.TAX_POST.x - 60,
        y:           CONFIG.locations.TAX_POST.y + 40,
        role:        "Military",
        troops:      9,
        roster:      _buildRoster({ "Spearman": 60, "Archer": 40 }, 9),
        rosterMode:  "hard",
        hp: 110, attack: 11, defense: 8, armor: 6,
        portraitUrl: ART_PATHS.portraits["Deserter Bo"]
    },
    {
        id:          "officer_shi",
        name:        "Officer Shi",
        faction:     CONFIG.factions.PLAYER,
        x:           CONFIG.locations.XUANFU.x - 20,
        y:           CONFIG.locations.XUANFU.y - 25,
        role:        "Military",
        troops:      6,
        roster:      _buildRoster({ "Archer": 60, "Spearman": 40 }, 6),
        rosterMode:  "hard",
        hp: 110, gold: 30, food: 30,
        portraitUrl: ART_PATHS.portraits["Officer Shi"]
    },
    {
        id:          "bandit_watchtower",
        name:        "Watchtower Bandits",
        faction:     CONFIG.factions.BANDIT,
        x:           CONFIG.locations.ABANDONED_WATCHTOWER.x,
        y:           CONFIG.locations.ABANDONED_WATCHTOWER.y,
        role:        "Military",
        troops:      16,
        roster:      _buildRoster({ "Spearman": 50, "Archer": 50 }, 16),
        rosterMode:  "hard",
        hp: 130, attack: 12, defense: 9, armor: 6,
        portraitUrl: ART_PATHS.portraits["Bandit Leader"]
    },
    {
        id:          "jurchen_first_raid",
        name:        "Jianzhou Raiding Party",
        faction:     CONFIG.factions.ENEMY,
        x:           CONFIG.locations.BURNED_HAMLET.x + 80,
        y:           CONFIG.locations.BURNED_HAMLET.y - 20,
        role:        "Military",
        troops:      12,
        roster:      _buildRoster({ "Horse Archer": 70, "Lancer": 30 }, 12),
        rosterMode:  "hard",
        hp: 140, attack: 18, defense: 10, armor: 8,
        portraitUrl: ART_PATHS.portraits["Jurchen Scout"]
    },
    {
        id:          "jurchen_real_scouts",
        name:        "Jianzhou Reconnaissance",
        faction:     CONFIG.factions.ENEMY,
        x:           CONFIG.locations.REAL_SCOUT_TRAIL.x,
        y:           CONFIG.locations.REAL_SCOUT_TRAIL.y,
        role:        "Military",
        troops:      8,
        roster:      _buildRoster({ "Horse Archer": 100 }, 8),
        rosterMode:  "hard",
        hp: 130, attack: 16, defense: 10, armor: 8,
        portraitUrl: ART_PATHS.portraits["Jurchen Scout"]
    },
    {
        id:          "burned_hamlet_survivor",
        name:        "Burned Hamlet Survivor",
        faction:     CONFIG.factions.PLAYER,
        x:           CONFIG.locations.BURNED_HAMLET.x,
        y:           CONFIG.locations.BURNED_HAMLET.y + 25,
        role:        "Civilian",
        troops:      1,
        roster:      _buildRoster({ "Spearman": 100 }, 1),
        rosterMode:  "hard",
        hp: 50,
        portraitUrl: ART_PATHS.portraits["Old Woman"]
    }
];

// =============================================================================
// STORY INTRO
// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: this intro is designed so the background ART NEVER goes black
// during the dialogue. The fade-to-black is reserved for the very first and
// very last beat only (engine handles fadeIn/fadeOut around the whole intro).
// The art1 / art2 / art3 slots are scheduled to overlap with the dialogue
// timeline so a backdrop image is always on screen — the engine cross-fades
// between them on `artNOnLine` rather than cutting to black.
//
// If your presentation engine ever stalls on a black frame between line
// changes, the fix is on the engine side: keep the previous art visible
// until the next art has fully faded in. Do NOT set art1/2/3 to empty.
// =============================================================================
var STORY_INTRO = {
    enabled:   true,
    fadeMs:    1600,                 // only at the very start / very end
    fadeColor: "#000000",
    holdArtThroughDialogue: true,    // engine hint — keep last art alive
    noBlackBetweenArt:      true,    // engine hint — cross-fade, never cut

    titleCard: {
        title:    "Life on the Wall",
        subtitle: "Liaodong frontier — 1578.",
        ms:       4800
    },

    // Three backdrop images cycle across the intro. The engine should
    // cross-fade between them at art2OnLine and art3OnLine — at no point
    // should the canvas show pure black behind the dialogue box.
    art:         ART_PATHS.mountain_defence,        // wall + watchtowers, opening
    art2:        ART_PATHS.everyday_life_walls,     // garrison routine, mid-intro
    art2OnLine:  4,
    art2Caption: "Fushun Suo. Life on the wall. 400 men on paper. 170 in fact.",
    art3:        ART_PATHS.on_walls_watching,       // parapet at dusk, final beats
    art3OnLine:  6,
    art3Caption: "The watch fires north of the wall. Quiet. Always quiet. Until they aren't.",

    artMs:    5200,
    kenburns: true,

    lines: [
        _line("left", "Narrator", "#d4b886", ART_PATHS.portraits["Narrator"],
            "In 1575, General Li Chengliang — Liaodong's regional commander — led Ming forces " +
            "against Wang Gao, the most powerful Jianzhou Jurchen chieftain in a generation. " +
            "Wang Gao was killed and his stronghold burned. For the first time in years, " +
            "the frontier dared to hope the raiding might actually stop."),

        _line("left", "Narrator", "#d4b886", ART_PATHS.portraits["Narrator"],
            "It didn't stop for long. Wang Gao's sons and rivals turned on each other for " +
            "what he'd left behind, and the raiding never fully ended — it just got smaller, " +
            "harder to predict. The men who had to hold the wall while the Jianzhou sorted out " +
            "their own succession were sent north — to Kaiyuan, to Liaoyang, to the wall itself."),

        _line("left", "Narrator", "#d4b886", ART_PATHS.portraits["Narrator"],
            "You are Liu Sheng. Second son of a poor farming family in the Wei valley. " +
            "Your older brother inherits the land. You get nothing. " +
            "Your father marched with Li Chengliang against Wang Gao in '75 and came home with " +
            "a crippled hand and a permanent wariness of the tree line. He has one piece of " +
            "advice for you, repeated every day of your childhood:"),

        _line("right", "Liu Sheng's Father", "#7a6840", ART_PATHS.portraits["Liu Sheng's Father"],
            "Men who praise war have never smelled a burned village. " +
            "If they offer you a uniform, take it. " +
            "But if they offer you glory, run."),

        _line("left", "Narrator", "#d4b886", ART_PATHS.portraits["Narrator"],
            "You joined the army anyway. The wages were stable. Or so the recruiter said. " +
            "They posted you to Fushun Suo, a day's ride from Kaiyuan, on the wall itself. " +
            "You expected to fight Jurchens. You expected to be a hero."),

        _line("left", "Narrator", "#d4b886", ART_PATHS.portraits["Narrator"],
            "What you got instead was a shovel."),

        _line("right", "Captain Yu", "#b71c1c", ART_PATHS.portraits["Captain Yu"],
            "You're Liu Sheng? Good. The north parapet collapsed in the last storm. " +
            "Pick up that shovel. " +
            "Welcome to the wall.")
    ],

    letterbox:     true,
    typewriterCps: 0,
    autoAdvance:   0
};

// =============================================================================
// SCENARIO VARS — runtime state read by trigger conditions
// =============================================================================
var SCENARIO_VARS = {
    phase:              "arrival",
    wall_repaired:      0,
    sheep_recovered:    0,
    tax_escort_done:    0,
    beacon_repaired:    0,
    deserter_caught:    0,
    powder_dried:       0,
    first_raid_done:    0,
    cannon_received:    0,
    watchtower_cleared: 0,
    false_alarm_done:   0,
    corruption_exposed: 0,
    real_scout_seen:    0,
    mobilization_done:  0
};

// =============================================================================
// STORY QUESTS
// =============================================================================
// Linear chain via dependsOn. Each quest auto-activates when its predecessor
// completes; the player sees a yellow marker on the map and an objective
// banner. Walking into the proximity radius fires the named trigger.
var STORY_QUESTS = [
    // CHAPTER 1
    {
        id:              "sq3_repair_wall",
        title:           "Repair the north parapet",
        description:     "Captain Yu handed you a shovel. The north parapet collapsed in the last storm.",
        x:               CONFIG.locations.NORTH_BEACON.x,
        y:               CONFIG.locations.NORTH_BEACON.y,
        radius:          180,
        isMain:          true,
        autoActivate:    true,
        triggerOnArrive: "t_repair_wall_arrive",
        noAutoComplete:  true
    },
    // CHAPTER 2 — DAILY LIFE
    {
        id:              "sq3_missing_sheep",
        title:           "The missing sheep",
        description:     "Yangwa villagers report three sheep gone. Suspect: hungry soldiers.",
        x:               CONFIG.locations.SHEEP_HAMLET.x,
        y:               CONFIG.locations.SHEEP_HAMLET.y,
        radius:          260,
        autoActivate:    true,
        dependsOn:       "sq3_repair_wall",
        triggerOnArrive: "t_missing_sheep_arrive",
        noAutoComplete:  true
    },
    {
        id:              "sq3_raiders_at_gate",
        title:           "Drive off the raiders beyond the gate",
        description:     "A handful of Jianzhou riders are probing the wall near the gate. Captain Yu has granted you leave to pass and drive them off.",
        x:               CONFIG.locations.FUSHUN_SUO.x,
        y:               CONFIG.locations.FUSHUN_SUO.y - 260,
        radius:          150,
        autoActivate:    true,
        dependsOn:       "sq3_missing_sheep",
        triggerOnArrive: "t_raiders_at_gate_arrive",
        noAutoComplete:  true
    },
    {
        id:              "sq3_repair_beacon",
        title:           "Repair the North Beacon",
        description:     "Signal fires keep failing. Rotten wood. Someone sold the good supplies.",
        x:               CONFIG.locations.NORTH_BEACON.x,
        y:               CONFIG.locations.NORTH_BEACON.y,
        radius:          200,
        autoActivate:    true,
        dependsOn:       "sq3_raiders_at_gate",
        triggerOnArrive: "t_beacon_repair_arrive",
        noAutoComplete:  true
    },
    {
        id:              "sq3_catch_deserters",
        title:           "Run the deserters off the tax road",
        description:     "Deserter Bo and his men have been shaking down carts on the tax road.",
        x:               CONFIG.locations.TAX_POST.x,
        y:               CONFIG.locations.TAX_POST.y,
        radius:          260,
        autoActivate:    true,
        dependsOn:       "sq3_repair_beacon",
        triggerOnArrive: "t_catch_deserters_arrive",
        noAutoComplete:  true
    },
    {
        id:              "sq3_dry_powder",
        title:           "Dry and inventory the powder magazine",
        description:     "Damp powder cakes up and won't fire. Air it out, count it, log it.",
        x:               CONFIG.locations.POWDER_MAGAZINE.x,
        y:               CONFIG.locations.POWDER_MAGAZINE.y,
        radius:          240,
        autoActivate:    true,
        dependsOn:       "sq3_catch_deserters",
        triggerOnArrive: "t_dry_powder_arrive",
        noAutoComplete:  true
    },
    // CHAPTER 3 — FIRST RAID
    {
        id:              "sq3_first_raid",
        title:           "Ride to the burning hamlet",
        description:     "Bells in the night. A border hamlet burns. Ride.",
        x:               CONFIG.locations.BURNED_HAMLET.x,
        y:               CONFIG.locations.BURNED_HAMLET.y,
        radius:          280,
        autoActivate:    true,
        dependsOn:       "sq3_dry_powder",
        triggerOnArrive: "t_first_raid_arrive",
        noAutoComplete:  true
    },
    // CHAPTER 4 — THE NEW BRONZE CANNON
    {
        id:              "sq3_cannon_arrival",
        title:           "Receive the Liaoyang gun convoy",
        description:     "Officer Shi is bringing Folangji breech-loaders and matchlocks up from the Liaoyang yards. Meet the convoy.",
        x:               CONFIG.locations.XUANFU.x - 20,
        y:               CONFIG.locations.XUANFU.y - 25,
        radius:          240,
        autoActivate:    true,
        dependsOn:       "sq3_first_raid",
        triggerOnArrive: "t_cannon_arrival_arrive",
        noAutoComplete:  true
    },
    {
        id:              "sq3_clear_watchtower",
        title:           "Field-test the cannon at the ruined watchtower",
        description:     "Bandits hold the ruined watchtower west of Kaiyuan. Drag a gun out there.",
        x:               CONFIG.locations.ABANDONED_WATCHTOWER.x,
        y:               CONFIG.locations.ABANDONED_WATCHTOWER.y,
        radius:          240,
        autoActivate:    true,
        dependsOn:       "sq3_cannon_arrival",
        triggerOnArrive: "t_clear_watchtower_arrive",
        noAutoComplete:  true
    },
    // CHAPTER 5 — FALSE ALARM
    {
        id:              "sq3_false_alarm",
        title:           "Beacon signal — ride to the wall",
        description:     "A beacon was lit. Three hundred men have been mobilized. Get to the wall.",
        x:               CONFIG.locations.NORTH_BEACON.x,
        y:               CONFIG.locations.NORTH_BEACON.y,
        radius:          240,
        autoActivate:    true,
        dependsOn:       "sq3_clear_watchtower",
        triggerOnArrive: "t_false_alarm_arrive",
        noAutoComplete:  true
    },
    // CHAPTER 6 — CORRUPTION
    {
        id:              "sq3_corruption",
        title:           "Confront Commander Xu",
        description:     "The fake casualty reports trace to Commander Xu. Confront him at the fort.",
        x:               CONFIG.locations.FUSHUN_SUO.x + 60,
        y:               CONFIG.locations.FUSHUN_SUO.y + 40,
        radius:          200,
        autoActivate:    true,
        dependsOn:       "sq3_false_alarm",
        triggerOnArrive: "t_corruption_arrive",
        noAutoComplete:  true
    },
    // CHAPTER 7 — REAL JURCHEN SCOUTS
    {
        id:              "sq3_real_scouts",
        title:           "Track the real Jurchen scouts",
        description:     "Veteran Wei spotted real Jurchen riders. After the false alarm, nobody believes him.",
        x:               CONFIG.locations.REAL_SCOUT_TRAIL.x,
        y:               CONFIG.locations.REAL_SCOUT_TRAIL.y,
        radius:          360,
        autoActivate:    true,
        dependsOn:       "sq3_corruption",
        triggerOnArrive: "t_real_scouts_arrive",
        noAutoComplete:  true
    },
    // CHAPTER 9 — MOBILIZATION
    {
        id:              "sq3_mobilization",
        title:           "Return to Fushun Suo — news from Liaoyang",
        description:     "Word from Liaoyang: the frontier is moving again. Report to Captain Yu.",
        x:               CONFIG.locations.FUSHUN_SUO.x,
        y:               CONFIG.locations.FUSHUN_SUO.y,
        radius:          180,
        autoActivate:    true,
        dependsOn:       "sq3_real_scouts",
        triggerOnArrive: "t_mobilization_arrive",
        noAutoComplete:  true
    }
];

// =============================================================================
// TRIGGERS
// =============================================================================
var TRIGGERS = [

    // ─────────────────────────────────────────────────────────────────────────
    // T0_BOOT
    // ─────────────────────────────────────────────────────────────────────────
    {
        id: "t0_boot",
        name: "Boot — arrival at Fushun Suo",
        enabled: true, once: true, activatedBy: null,
        conditions: [ { type: "scenario_start", params: {} } ],
        actions: [
            { type: "set_var", params: { name: "phase", value: "arrival" } },
            _log("📜 1578 — You arrive at Fushun Suo on the Liaodong frontier.", "general"),
            _sub("Fushun Suo — Liaodong frontier, 1578.", 6000, "#f5d76e"),
            _dlg([
                _line("right", "Captain Yu", "#b71c1c", ART_PATHS.portraits["Captain Yu"],
                    "Liu Sheng. So you're our new recruit. Good. " +
                    "I won't ask what you expected. I'll just tell you what you'll do. " +
                    "The north parapet collapsed in the last storm. Take a shovel from the supply tent."),
                _line("left", "Liu Sheng", "#ffffff", ART_PATHS.portraits["Liu Sheng"],
                    "Sir — I trained with the spear. The recruiter said —"),
                _line("right", "Captain Yu", "#b71c1c", ART_PATHS.portraits["Captain Yu"],
                    "The recruiter is in Beijing. He gets paid to lie. " +
                    "On this wall you'll dig, you'll patch, you'll drain the latrines, " +
                    "and if you're lucky you'll never need the spear strapped to your back. " +
                    "Now MOVE.")
            ])
        ]
    },

    // ─────────────────────────────────────────────────────────────────────────
    // CHAPTER 1 — WALL REPAIR
    // ─────────────────────────────────────────────────────────────────────────
    {
        id: "t_repair_wall_arrive",
        name: "Chapter 1 — repairing the parapet",
        enabled: true, once: true, activatedBy: "t0_boot",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            { type: "show_scene_art", params: { url: ART_PATHS.everyday_life_walls, ms: 4500, caption: "Three days of shovel work. The north parapet of Fushun Suo.", kenburns: true } },
            _sub("The north parapet — three days of shovel work.", 5500, "#a89060"),
            _log("🛠️ You spend three days patching the north parapet.", "general"),
            _dlg([
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "You're holding the shovel wrong. " +
                    "Heel of the hand on the shaft, not the palm. You'll blister in an hour the way you grip it."),
                _line("left", "Liu Sheng", "#ffffff", ART_PATHS.portraits["Liu Sheng"],
                    "How long have you been on this wall?"),
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "Fourteen years. I was here for the Wang Gao campaign. " +
                    "I was supposed to be in the column that marched on his stronghold under General Li. " +
                    "Captain Yu wrote me off the muster the week before. " +
                    "Every man he wrote off lived. Every man on that list died at the walls."),
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "You thought you'd fight Jurchens. " +
                    "The most dangerous thing on this wall is dysentery. Pace yourself.")
            ]),
            { type: "set_var", params: { name: "wall_repaired", value: 1 } },
            { type: "set_var", params: { name: "phase",         value: "daily" } },
            { type: "story_quest_complete", params: { id: "sq3_repair_wall" } },
            _log("✅ The parapet is patched. Captain Yu mutters something about sheep.", "general")
        ]
    },

    // ─────────────────────────────────────────────────────────────────────────
    // CHAPTER 2 — DAILY LIFE QUESTS
    // ─────────────────────────────────────────────────────────────────────────

    // Sheep
    {
        id: "t_missing_sheep_arrive",
        name: "Daily quest — the missing sheep",
        enabled: true, once: true, activatedBy: "t_repair_wall_arrive",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            _sub("Sheep Hamlet (Yangwa) — three sheep missing.", 5500, "#a89060"),
            _dlg([
                _line("right", "Old Woman", "#7a6840", ART_PATHS.portraits["Old Woman"],
                    "Three sheep, soldier. Three. Gone in one night. " +
                    "Find them. Or find who took them."),
                _line("left", "Liu Sheng", "#ffffff", ART_PATHS.portraits["Liu Sheng"],
                    "Jurchens?"),
                _line("right", "Old Woman", "#7a6840", ART_PATHS.portraits["Old Woman"],
                    "Jurchens don't take three sheep and leave the goats. " +
                    "Jurchens don't leave army-issue bootprints. " +
                    "Find your own men, soldier. They're the thieves.")
            ]),
            _sub("You track the bootprints back toward Fushun Suo.", 5000, "#a89060"),
            _dlg([
                _line("right", "Cook Han", "#5e554c", ART_PATHS.portraits["Cook Han"],
                    "All right, all right. It was us. The millet ration's been cut twice this month. " +
                    "Tell the old woman we'll pay her back. Slowly. In flour."),
                _line("left", "Liu Sheng", "#ffffff", ART_PATHS.portraits["Liu Sheng"],
                    "Three sheep is a flogging offence, Cook."),
                _line("right", "Cook Han", "#5e554c", ART_PATHS.portraits["Cook Han"],
                    "Then go tell Captain Yu. " +
                    "But the pot's empty. Today's stew contains rat. " +
                    "...only one rat. So far.")
            ]),
            { type: "set_var", params: { name: "sheep_recovered", value: 1 } },
            { type: "story_quest_complete", params: { id: "sq3_missing_sheep" } },
            _log("🐑 You sorted the sheep business. Cook Han owes you. Captain Yu does not need to know.", "general"),
            _sub("A lookout calls down from the parapet — riders, just past the gate.", 5000, "#cc2200"),
            _dlg([
                _line("right", "Captain Yu", "#b71c1c", ART_PATHS.portraits["Captain Yu"],
                    "Six, maybe eight. Testing us — see how fast we answer, then gone before we close " +
                    "the distance. They do this every few weeks."),
                _line("left", "Liu Sheng", "#ffffff", ART_PATHS.portraits["Liu Sheng"],
                    "Let me go out after them, sir."),
                _line("right", "Captain Yu", "#b71c1c", ART_PATHS.portraits["Captain Yu"],
                    "...Granted. Wei — open the gate for him. " +
                    "Liu Sheng, you have leave to pass. Drive them off and get back inside " +
                    "before it shuts on you.")
            ]),
            { type: "custom_js", params: { code:
                "if (typeof window.s3SetGateOpen === 'function') window.s3SetGateOpen(true);"
            } },
            _sub("The gate creaks open. The guards wave you through.", 4000, "#a89060")
        ]
    },

    // Raiders beyond the gate
    {
        id: "t_raiders_at_gate_arrive",
        name: "Daily quest — drive off the raiders beyond the gate",
        enabled: true, once: true, activatedBy: "t_missing_sheep_arrive",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            { type: "spawn_important_npc", params: { id: "raider_probe" } },
            { type: "show_scene_art", params: { url: ART_PATHS.skirmish_wall, ms: 4500, caption: "Beyond the gate — a handful of Jianzhou riders circling just out of bowshot.", kenburns: true } },
            _sub("North of the wall — the raiders scatter as you close on them.", 5500, "#cc2200"),
            _dlg([
                _line("right", "Jurchen Raider", "#455a64", ART_PATHS.portraits["Jurchen Raider"],
                    "..."),
                _line("left", "Liu Sheng", "#ffffff", ART_PATHS.portraits["Liu Sheng"],
                    "They're not even trying to fight. They're just — watching us. Counting us.")
            ]),
            _sub("The riders peel off north in twos and threes, unhurried. They got what they came for: a good look.", 5000, "#a89060"),
            { type: "custom_js", params: { code:
                "if (typeof window.s3SetGateOpen === 'function') window.s3SetGateOpen(true);"
            } },
            _sub("The gate opens again to let you back inside. It shuts the moment you clear it.", 4000, "#a89060"),
            { type: "set_var", params: { name: "raiders_driven_off", value: 1 } },
            { type: "story_quest_complete", params: { id: "sq3_raiders_at_gate" } },
            _log("⚔️ You drove off the probing riders. Nobody caught. Wei doesn't like how little they fought for it.", "general")
        ]
    },

    // Beacon repair
    {
        id: "t_beacon_repair_arrive",
        name: "Daily quest — repair the North Beacon",
        enabled: true, once: true, activatedBy: "t_raiders_at_gate_arrive",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            { type: "show_scene_art", params: { url: ART_PATHS.everyday_life_walls, ms: 4000, caption: "The beacon tower — rebuilt every spring with whatever the storms haven't taken.", kenburns: true } },
            _sub("The North Beacon — the signal fires keep failing.", 5500, "#a89060"),
            _dlg([
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "Look at this wood. " +
                    "This is willow. Willow ROTS in a wet summer. " +
                    "Beacon timber is supposed to be pine, brought up from the south. " +
                    "Where do you think the pine went?"),
                _line("left", "Liu Sheng", "#ffffff", ART_PATHS.portraits["Liu Sheng"],
                    "Quartermaster Du?"),
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "Du sold the pine three winters ago. He sold the iron nails too. " +
                    "We rebuild the same beacon every spring with whatever the wind hasn't already taken. " +
                    "Don't bother telling the Captain. He knows.")
            ]),
            { type: "set_var", params: { name: "beacon_repaired", value: 1 } },
            { type: "story_quest_complete", params: { id: "sq3_repair_beacon" } },
            _log("🔥 The beacon stands again. For now. You note Quartermaster Du for later.", "general")
        ]
    },

    // Catch deserters
    {
        id: "t_catch_deserters_arrive",
        name: "Daily quest — run the deserters off the tax road",
        enabled: true, once: true, activatedBy: "t_beacon_repair_arrive",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            { type: "spawn_important_npc", params: { id: "deserter_bo" } },
            { type: "show_scene_art", params: { url: ART_PATHS.supply_caravan, ms: 4500, caption: "Grain Tax Post — wagons held at knifepoint.", kenburns: true } },
            _sub("Grain Tax Post — Deserter Bo's men hold the road.", 5500, "#a89060"),
            _dlg([
                _line("right", "Deserter Bo", "#5e554c", ART_PATHS.portraits["Deserter Bo"],
                    "Liu Sheng. I know your name. I served under your captain three years. " +
                    "Don't draw that spear. We won't fight you. " +
                    "We just want the grain we're owed."),
                _line("left", "Liu Sheng", "#ffffff", ART_PATHS.portraits["Liu Sheng"],
                    "You're a deserter, Bo. They'll hang you."),
                _line("right", "Deserter Bo", "#5e554c", ART_PATHS.portraits["Deserter Bo"],
                    "They stopped paying us six months ago. " +
                    "Half my squad died fighting the Jianzhou two winters back. Names still on the roll. " +
                    "Tell Captain Yu we'll vanish if our names come off his ledger. That's the bargain.")
            ]),
            _sub("You let Bo and his men go. Captain Yu will pretend not to notice.", 4500, "#a89060"),
            { type: "set_var", params: { name: "deserter_caught", value: 1 } },
            { type: "story_quest_complete", params: { id: "sq3_catch_deserters" } },
            _log("⚔️ The road is reopened. Bo's name is quietly removed from the muster roll.", "general")
        ]
    },

    // Dry powder
    {
        id: "t_dry_powder_arrive",
        name: "Daily quest — dry and inventory the powder magazine",
        enabled: true, once: true, activatedBy: "t_catch_deserters_arrive",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            { type: "show_scene_art", params: { url: ART_PATHS.everyday_life_walls, ms: 4500, caption: "The powder magazine — barrels laid out, mats opened, prayers said.", kenburns: true } },
            _sub("The Powder Magazine — the air smells like sulphur and wet rope.", 5500, "#a89060"),
            _dlg([
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "Pull every barrel out into the sun. Open them. Spread the powder thin on the mats. " +
                    "Don't smoke. Don't strike steel. Don't sneeze. " +
                    "Damp powder cakes up. A caked charge in a hand cannon means a burst barrel " +
                    "and a face full of bronze."),
                _line("left", "Liu Sheng", "#ffffff", ART_PATHS.portraits["Liu Sheng"],
                    "How often do you do this?"),
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "Every dry day in spring. Every dry day in autumn. " +
                    "More often if it rains in storage. " +
                    "Hand cannons aren't fussy gentleman's weapons — they're tools. " +
                    "Boring, dirty, temperamental tools. You feed them, you clean them, " +
                    "and you don't let the powder get wet.")
            ]),
            _sub("Six barrels caked solid. Du logs them as 'expended in training.' Of course.", 4500, "#a89060"),
            _dlg([
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "Look at this caking. This isn't humidity. This was wet when it was barrelled. " +
                    "Someone sold the dry powder out the back gate at Kaiyuan and replaced it with river-bottom. " +
                    "Write it down. Don't say a word. You'll need it later.")
            ]),
            { type: "set_var", params: { name: "powder_dried", value: 1 } },
            { type: "story_quest_complete", params: { id: "sq3_dry_powder" } },
            _log("🧂 You dried the powder. Six barrels caked solid. You wrote it down.", "general")
        ]
    },

    // ─────────────────────────────────────────────────────────────────────────
    // CHAPTER 3 — FIRST RAID (the 10 % sudden terror moment)
    // ─────────────────────────────────────────────────────────────────────────
    {
        id: "t_first_raid_arrive",
        name: "Chapter 3 — the first raid",
        enabled: true, once: true, activatedBy: "t_dry_powder_arrive",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            { type: "spawn_important_npc", params: { id: "jurchen_first_raid" } },
            { type: "spawn_important_npc", params: { id: "burned_hamlet_survivor" } },
            { type: "show_scene_art", params: { url: ART_PATHS.skirmish_wall, ms: 5500, caption: "Jianzhou riders slip through the wall gap. Twelve men. Gone before dawn.", kenburns: true } },
            _sub("Horse bells in the night. Screaming. Smoke on the horizon.", 6000, "#cc2200"),
            _log("🔥 1578 — A Jianzhou raiding party hits a border hamlet. You ride out — too late.", "general"),
            _dlg([
                _line("right", "Captain Yu", "#b71c1c", ART_PATHS.portraits["Captain Yu"],
                    "BOOTS ON. SPEARS. NOW. " +
                    "The border hamlet north of here is burning. " +
                    "We ride.")
            ]),
            _sub("You arrive at the burning hamlet. The riders are vanishing back through the wall gap.", 5500, "#cc2200"),
            _dlg([
                _line("right", "Old Woman", "#7a6840", ART_PATHS.portraits["Old Woman"],
                    "Twelve riders. Maybe fifteen. They came at the third watch. " +
                    "They took the grain. They took my son. They burned everything else."),
                _line("left", "Liu Sheng", "#ffffff", ART_PATHS.portraits["Liu Sheng"],
                    "How did they know where the grain was stored?"),
                _line("right", "Old Woman", "#7a6840", ART_PATHS.portraits["Old Woman"],
                    "They went straight to the granary. They did not look. They knew. " +
                    "Soldier — somebody told them where to look.")
            ]),
            _dlg([
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "Twelve men. A scout-strength raid. They wanted grain and prisoners, not the wall. " +
                    "But they had a map. A real one. Drawn by somebody close.")
            ]),
            { type: "set_var", params: { name: "first_raid_done", value: 1 } },
            { type: "story_quest_complete", params: { id: "sq3_first_raid" } },
            _log("💀 The hamlet is ash. Somebody on our side told them where to strike.", "general")
        ]
    },

    // ─────────────────────────────────────────────────────────────────────────
    // CHAPTER 4 — THE FOLANGJI BREECH-LOADER
    //
    // Hand cannon are NOT new — standard issue for decades. Matchlock
    // arquebuses (鳥銃, "bird guns") are newer and more accurate, but slow
    // and costly to produce, so only a handful of picked men on this wall
    // carry one. The genuinely NEW thing this chapter delivers is the
    // Folangji (佛郎機) — a Portuguese-derived breech-loading swivel gun the
    // Ming have been adopting onto northern garrisons since the 1520s. Its
    // trick: the powder chamber is a separate, removable "child gun" that
    // slots into the breech from behind. Swap in a fresh pre-loaded chamber
    // and fire again — no ramming powder and ball down the muzzle between
    // shots, which is what makes it worth the cost against a fast cavalry
    // charge.
    // ─────────────────────────────────────────────────────────────────────────
    {
        id: "t_cannon_arrival_arrive",
        name: "Chapter 4 — the Liaoyang gun convoy",
        enabled: true, once: true, activatedBy: "t_first_raid_arrive",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            { type: "spawn_important_npc", params: { id: "officer_shi" } },
            { type: "show_scene_art", params: { url: ART_PATHS.supply_caravan, ms: 5500, caption: "Liaoyang — the gun convoy. Two mules per swivel-gun, iron chambers wrapped in oilcloth.", kenburns: true } },
            _sub("Liaoyang yard — Officer Shi waves you over. Short iron tubes, each with a boxy chamber at the back.", 5500, "#f5d76e"),
            _dlg([
                _line("right", "Officer Shi", "#7a6840", ART_PATHS.portraits["Officer Shi"],
                    "Liu Sheng, is it? Good. Help me count the chambers — every one. " +
                    "Five 'child guns' per barrel, and if even one goes missing on the road, " +
                    "Liaoyang will have my rank for it.")
            ]),
            _sub("Officer Shi pats the iron barrel. Shorter than the old bronze pieces, and lighter — a man can nearly lift one alone.", 5500, "#f5d76e"),
            _dlg([
                _line("right", "Officer Shi", "#7a6840", ART_PATHS.portraits["Officer Shi"],
                    "Don't let the size fool you. It isn't a smaller version of the old gun — " +
                    "it's a different idea entirely. Forget half of what you know about hand cannon."),
                _line("left", "Liu Sheng", "#ffffff", ART_PATHS.portraits["Liu Sheng"],
                    "Sir — how does it reload so fast?"),
                _line("right", "Officer Shi", "#7a6840", ART_PATHS.portraits["Officer Shi"],
                    "You don't reload the barrel at all. You reload the CHAMBER — separately, off " +
                    "the gun, while the last one's still smoking in the breech. Swap it in, wedge it, " +
                    "fire. No ramrod, no swabbing between shots. That's the whole trick. Portuguese " +
                    "design. We've been building our own since my grandfather's day."),
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "So why bother with hand cannon and crossbows at all, if this is so much faster?"),
                _line("right", "Officer Shi", "#7a6840", ART_PATHS.portraits["Officer Shi"],
                    "Because a chamber costs what a hand cannon costs, and every wall section wants " +
                    "six. The court wants these on every garrison within two years. Whether Liaoyang " +
                    "can cast that many chambers is a different question. " +
                    "— And I've brought something else. Six matchlocks. Bird guns. " +
                    "Picked men only — Wei, you and five others start training on them tomorrow. " +
                    "Don't drop one in the mud. It's worth more than you are.")
            ]),
            _sub("Two Folangji swivel-guns and six matchlock arquebuses are unloaded at Fushun Suo. Quartermaster Du complains about the cartage fee anyway.", 5500, "#a89060"),
            { type: "set_var", params: { name: "cannon_received", value: 1 } },
            { type: "story_quest_complete", params: { id: "sq3_cannon_arrival" } },
            _log("⚙️ Two Folangji breech-loaders and six matchlocks delivered. Officer Shi attached to the fort. Field-test ordered.", "general")
        ]
    },
    {
        id: "t_clear_watchtower_arrive",
        name: "Chapter 4 — field-test the guns",
        enabled: true, once: true, activatedBy: "t_cannon_arrival_arrive",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            { type: "spawn_important_npc", params: { id: "bandit_watchtower" } },
            { type: "show_scene_art", params: { url: ART_PATHS.skirmish_wall, ms: 4500, caption: "The ruined watchtower west of Kaiyuan — bandits hold the upper floor.", kenburns: true } },
            _sub("Ruined Watchtower — bandits hold the upper floor.", 5500, "#cc2200"),
            _dlg([
                _line("right", "Officer Shi", "#7a6840", ART_PATHS.portraits["Officer Shi"],
                    "We range at eighty paces. Matchlocks and hand cannon to suppress, the swivel-gun " +
                    "to crack the stonework. Mind your match cord near the powder horns — " +
                    "I have seen a careless man take off his own eyebrows.")
            ]),
            _dlg([
                _line("right", "Bandit Leader", "#5e554c", ART_PATHS.portraits["Bandit Leader"],
                    "Imperial dogs! You hide behind foreign toys now? " +
                    "Come closer. Fight like men."),
                _line("right", "Officer Shi", "#7a6840", ART_PATHS.portraits["Officer Shi"],
                    "We will not be coming closer.")
            ]),
            _sub("Officer Shi seats the loaded chamber into the breech and drives the wedge home. A crack like a falling tree — and no time lost readying the next shot.", 5500, "#cc2200"),
            _dlg([
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "First shot — into the stonework. Second shot — before I'd have finished " +
                    "sponging the old gun, and it's already back in the wall. " +
                    "The upper floor is coming apart."),
                _line("right", "Officer Shi", "#7a6840", ART_PATHS.portraits["Officer Shi"],
                    "Chamber out, chamber in. Matchlocks — keep suppressing the windows, don't let " +
                    "them nock an arrow. Hand cannon teams, pursue when the wall opens. " +
                    "Take prisoners if you can.")
            ]),
            _sub("The bandits surrender. The barrel is too hot to touch; the spent chambers cool in the grass, already being swabbed for the next load.", 5500, "#a89060"),
            _dlg([
                _line("right", "Officer Shi", "#7a6840", ART_PATHS.portraits["Officer Shi"],
                    "Successful field test. One cracked wedge-pin. One singed sleeve from a matchlock " +
                    "flare-up — Wei's man, not serious. Acceptable. Write it up. Send a copy to Liaoyang."),
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "And the cost?"),
                _line("right", "Officer Shi", "#7a6840", ART_PATHS.portraits["Officer Shi"],
                    "Five chambers fired, five pounds of powder between the swivel-gun and the " +
                    "matchlocks, one day's rations for the mules. For a ruined watchtower full of " +
                    "bandits, it is too much. For a Jurchen cavalry charge coming in fast, it is " +
                    "nothing — because we put a second shot into it before they close the distance.")
            ]),
            { type: "set_var", params: { name: "watchtower_cleared", value: 1 } },
            { type: "story_quest_complete", params: { id: "sq3_clear_watchtower" } },
            _log("⚔️ The watchtower is rubble. Officer Shi declares the Folangji 'operational.' Quartermaster Du complains about the powder.", "general")
        ]
    },

    // ─────────────────────────────────────────────────────────────────────────
    // CHAPTER 5 — FALSE ALARM
    // ─────────────────────────────────────────────────────────────────────────
    {
        id: "t_false_alarm_arrive",
        name: "Chapter 5 — false alarm at the wall",
        enabled: true, once: true, activatedBy: "t_clear_watchtower_arrive",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            { type: "show_scene_art", params: { url: ART_PATHS.on_walls_watching, ms: 5000, caption: "Three hundred men on the wall at dawn. The forest line is quiet.", kenburns: true } },
            _sub("The North Beacon is lit. Three hundred men ride through the night.", 6000, "#cc2200"),
            _log("🚨 BEACON SIGNAL! Every man at Fushun Suo boots up and rides for the wall.", "general"),
            _dlg([
                _line("right", "Captain Yu", "#b71c1c", ART_PATHS.portraits["Captain Yu"],
                    "Form on the wall. Form ON the wall. " +
                    "Archers up. Spears down. Cannon crews to the platforms. " +
                    "Where's the cavalry — WHERE'S THE CAVALRY?"),
                _line("left", "Liu Sheng", "#ffffff", ART_PATHS.portraits["Liu Sheng"],
                    "Captain — there's nothing out there. There's nobody out there."),
                _line("right", "Captain Yu", "#b71c1c", ART_PATHS.portraits["Captain Yu"],
                    "Then WHY IS THE BEACON LIT.")
            ]),
            _sub("Dawn. The forest line is still quiet. A messenger arrives from the beacon tower.", 5500, "#a89060"),
            _dlg([
                _line("right", "Cook Han", "#5e554c", ART_PATHS.portraits["Cook Han"],
                    "Captain — sorry, Captain — the beacon — " +
                    "it was the breakfast fire. I was burning the millet. The wind shifted. " +
                    "Nobody told me the watchman had stepped off for —"),
                _line("right", "Captain Yu", "#b71c1c", ART_PATHS.portraits["Captain Yu"],
                    "We mobilized three hundred men because somebody burned MILLET. " +
                    "...nobody is to mention this to Liaoyang. Nobody.")
            ]),
            { type: "set_var", params: { name: "false_alarm_done", value: 1 } },
            { type: "story_quest_complete", params: { id: "sq3_false_alarm" } },
            _log("🍚 False alarm. Three hundred men, one pot of millet. Captain Yu will not be writing this report.", "general")
        ]
    },

    // ─────────────────────────────────────────────────────────────────────────
    // CHAPTER 6 — CORRUPTION UNCOVERED
    // ─────────────────────────────────────────────────────────────────────────
    {
        id: "t_corruption_arrive",
        name: "Chapter 6 — confront Commander Xu",
        enabled: true, once: true, activatedBy: "t_false_alarm_arrive",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            _sub("Fushun Suo — you spread the ledger on Commander Xu's table.", 6000, "#a89060"),
            _dlg([
                _line("left", "Liu Sheng", "#ffffff", ART_PATHS.portraits["Liu Sheng"],
                    "Commander. The casualty reports do not match the burial registers. " +
                    "Twelve names on this month's roll were buried last AUTUMN. " +
                    "Some were never here at all. And the powder ledgers — six barrels of river-bottom " +
                    "logged as 'expended in training.'"),
                _line("right", "Commander Xu", "#b71c1c", ART_PATHS.portraits["Commander Xu"],
                    "Recruit. You are very young. " +
                    "Very young men sometimes get assigned to the western patrol. " +
                    "Bandits there. Bad place. Many do not return."),
                _line("left", "Liu Sheng", "#ffffff", ART_PATHS.portraits["Liu Sheng"],
                    "Quartermaster Du told me everything. " +
                    "He'd rather testify than swing alone.")
            ]),
            _dlg([
                _line("right", "Commander Xu", "#b71c1c", ART_PATHS.portraits["Commander Xu"],
                    "...Du is a coward. " +
                    "Fine. Fine. The ghost soldiers — yes. The fake raids — yes. The powder — yes. " +
                    "You think I'm the only commander on this wall who does this? " +
                    "Beijing pays late. Beijing pays half. " +
                    "If I report 170 men they cut us to 90. If I report 400 we EAT. " +
                    "This is the wall, Liu Sheng. Every commander between here and the Yellow River does this. " +
                    "Every single one."),
                _line("right", "Captain Yu", "#b71c1c", ART_PATHS.portraits["Captain Yu"],
                    "That is for the Censor to decide, sir. Not us. " +
                    "Liu Sheng — go. I'll take it from here.")
            ]),
            _sub("Commander Xu is recalled to Liaoyang under guard. His replacement arrives in a week.", 5500, "#a89060"),
            { type: "set_var", params: { name: "corruption_exposed", value: 1 } },
            { type: "story_quest_complete", params: { id: "sq3_corruption" } },
            _log("📜 Commander Xu is recalled to Liaoyang. The ghost soldiers are struck from the rolls. The wages do not improve.", "general"),
            _dlg([
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "With Xu gone somebody has to actually walk the wall's flank and see what's " +
                    "really out there. I'm going. You're coming with me."),
                _line("right", "Captain Yu", "#b71c1c", ART_PATHS.portraits["Captain Yu"],
                    "Granted. Open the gate for them.")
            ]),
            { type: "custom_js", params: { code:
                "if (typeof window.s3SetGateOpen === 'function') window.s3SetGateOpen(true);"
            } },
            _sub("The gate opens onto the forest frontier. Wei is already moving.", 4000, "#a89060")
        ]
    },

    // ─────────────────────────────────────────────────────────────────────────
    // CHAPTER 7 — REAL JURCHEN SCOUTS
    // ─────────────────────────────────────────────────────────────────────────
    {
        id: "t_real_scouts_arrive",
        name: "Chapter 7 — track the real Jurchen scouts",
        enabled: true, once: true, activatedBy: "t_corruption_arrive",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            { type: "spawn_important_npc", params: { id: "jurchen_real_scouts" } },
            { type: "show_scene_art", params: { url: ART_PATHS.mountain_defence, ms: 5000, caption: "North of the wall. Fresh hoofprints in the forest mud. Eight horses, shod differently from ours.", kenburns: true } },
            _sub("North of the wall — Veteran Wei points at fresh hoofprints in the mud.", 5500, "#cc2200"),
            _dlg([
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "Eight horses. Unshod or shod different. Jurchen-style. " +
                    "They were here last night. They came south, then split. " +
                    "They are mapping us, Liu Sheng. " +
                    "They are mapping the wall."),
                _line("left", "Liu Sheng", "#ffffff", ART_PATHS.portraits["Liu Sheng"],
                    "We tell Captain Yu."),
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "We do. He won't believe us."),
                _line("right", "Jurchen Raider", "#455a64", ART_PATHS.portraits["Jurchen Raider"],
                    "...")
            ]),
            _sub("The Jurchen scout watches from the ridge a moment — then turns and rides north. Gone.", 5500, "#455a64"),
            _dlg([
                _line("right", "Captain Yu", "#b71c1c", ART_PATHS.portraits["Captain Yu"],
                    "Liu Sheng. Two weeks ago we mobilized three hundred men for burnt millet. " +
                    "Last week we arrested Commander Xu for inventing eighty raids in one year. " +
                    "And now you tell me eight horses. Eight."),
                _line("left", "Liu Sheng", "#ffffff", ART_PATHS.portraits["Liu Sheng"],
                    "Captain — they were real. Jurchen-shod. Wei is sure."),
                _line("right", "Captain Yu", "#b71c1c", ART_PATHS.portraits["Captain Yu"],
                    "I believe you, recruit. I do. " +
                    "But Liaoyang will not. And Beijing will not. " +
                    "We watch the wall. We say nothing. We wait.")
            ]),
            { type: "set_var", params: { name: "real_scout_seen", value: 1 } },
            { type: "story_quest_complete", params: { id: "sq3_real_scouts" } },
            _log("👁️ Real Jurchen scouts confirmed. Nobody upchain will act. You watch the wall and wait.", "general")
        ]
    },

    // ─────────────────────────────────────────────────────────────────────────
    // CHAPTER 8 — THE QUIET MOMENT (timer-based, fires 30s after Ch 7)
    // ─────────────────────────────────────────────────────────────────────────
    {
        id: "t_quiet_moment",
        name: "Chapter 8 — the quiet moment on the wall",
        enabled: true, once: true, activatedBy: "t_real_scouts_arrive",
        conditions: [ { type: "custom_js", params: { code:
            "if (!window.__sj_ch8_armed) { window.__sj_ch8_armed = Date.now(); return false; }\n" +
            "return (Date.now() - window.__sj_ch8_armed) > 30000;"
        } } ],
        actions: [
            { type: "show_scene_art", params: { url: ART_PATHS.on_walls_watching, ms: 6000, caption: "Night. The parapet. The fires burn low north of the wall.", kenburns: true } },
            _sub("Night. The wall. The fires burn low. Veteran Wei joins you on the parapet.", 6500, "#a89060"),
            _dlg([
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "Do you hear that?"),
                _line("left", "Liu Sheng", "#ffffff", ART_PATHS.portraits["Liu Sheng"],
                    "...I don't hear anything."),
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "Exactly. " +
                    "That silence — that's why men go mad on borders. " +
                    "The Jurchens are not raiding tonight. " +
                    "They are not raiding tonight because they are getting ready not to raid for a while. " +
                    "They are getting ready to come."),
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "The wall isn't a magic line, Liu Sheng. It's just where the army happens to be standing. " +
                    "If they want to come around it, they go around it. " +
                    "If they want to come through it, they come through it. " +
                    "All the wall does is slow them down enough that someone in Beijing can hear about it before it's over.")
            ]),
            _log("🌙 The watch is quiet. Too quiet. Wei stares north for a long time.", "general")
        ]
    },

    // ─────────────────────────────────────────────────────────────────────────
    // CHAPTER 9 — MOBILIZATION
    // ─────────────────────────────────────────────────────────────────────────
    {
        id: "t_mobilization_arrive",
        name: "Chapter 9 — the frontier moves again",
        enabled: true, once: true, activatedBy: "t_quiet_moment",
        conditions: [ { type: "custom_js", params: { code: "return false;" } } ],
        actions: [
            { type: "show_scene_art", params: { url: ART_PATHS.mountain_defence, ms: 5500, caption: "1578 — Word arrives from Liaoyang. The frontier is being reinforced.", kenburns: true } },
            _sub("Fushun Suo — Captain Yu reads a courier's scroll, then reads it again.", 6500, "#cc2200"),
            _log("📜 1578 — Word from Liaoyang. The northern command is mobilising every garrison.", "general"),
            _dlg([
                _line("right", "Captain Yu", "#b71c1c", ART_PATHS.portraits["Captain Yu"],
                    "Liaoyang has issued a general alert. " +
                    "Every garrison between Kaiyuan and Fushun Pass to full strength. " +
                    "Conscription quotas doubled. Gun and powder convoys moved to weekly. " +
                    "Twelve new Folangji guns assigned to this wall section alone."),
                _line("left", "Liu Sheng", "#ffffff", ART_PATHS.portraits["Liu Sheng"],
                    "Are we marching?"),
                _line("right", "Captain Yu", "#b71c1c", ART_PATHS.portraits["Captain Yu"],
                    "No. WE are not marching. " +
                    "We are doing what we were always going to do. " +
                    "We are repairing the parapet, drying the powder, escorting the tax clerk, " +
                    "and waiting on the wall. " +
                    "Someone in Beijing decides when the army moves. " +
                    "Out here, we just keep the lights on.")
            ]),
            _sub("The villages do not empty. The supply wagons run more often. The wall is the same wall.", 7000, "#a89060"),
            _dlg([
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "Liu Sheng. Look north."),
                _line("left", "Liu Sheng", "#ffffff", ART_PATHS.portraits["Liu Sheng"],
                    "...campfires. More than last week.")
            ]),
            { type: "show_scene_art", params: { url: ART_PATHS.on_walls_watching, ms: 6000, caption: "More fires every night, just past the horizon. The wall watches. The wall waits.", kenburns: true } },
            _dlg([
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "I survived the Wang Gao campaign by being marked off the muster the week before. " +
                    "I have survived every quiet spell on this wall since, and there have been a few."),
                _line("right", "Veteran Wei", "#c8a200", ART_PATHS.portraits["Veteran Wei"],
                    "Whatever they are getting ready for out there — " +
                    "I am not sure I survive that one.")
            ]),
            _sub("The fires burn north. Liu Sheng watches them. The wall waits.", 7000, "#cc2200"),
            _sub("To be continued.", 5000, "#ffffff"),
            { type: "set_var", params: { name: "mobilization_done", value: 1 } },
            { type: "story_quest_complete", params: { id: "sq3_mobilization" } },
            _log("📜 End of Chapter — the frontier holds. For now. (To be continued.)", "general")
        ]
    }
];

// =============================================================================
// DATA  — the master export consumed by install()
// =============================================================================
var DATA = {
    meta:             { campaignScript: 'story3', importedFrom: 'story3' },
    playerSetup:      PLAYER_SETUP,
    importantNpcs:    IMPORTANT_NPCS,
    storyIntro:       STORY_INTRO,
    scenarioVars:     SCENARIO_VARS,
    storyQuests:      STORY_QUESTS,
    triggers:         TRIGGERS,
    startingNpcBans:  { factions: ["Jianzhou Jurchens", "Bandits"], roles: [] },
    factions:         FACTIONS_story3
};

// =============================================================================
// INSTALL — wire the scenario into the live engine
// =============================================================================
function install() {
    if (window.__sj_installed) {
        console.log("[MingFrontier] install() already ran — skipping.");
        return;
    }
    window.__sj_installed = true;

    _stampInitialBan();

    // Build (or reuse) the active-scenario shell. ScenarioTriggers.start()
    // reads everything off this object — including factions, scenarioVars,
    // triggers, importantNpcs, storyQuests, storyIntro, startingNpcBans.
    var s = window.__activeScenario;
    if (!s) {
        s = {};
        window.__activeScenario = s;
    }

    // Wire campaign DATA into the live scenario object. ALL fields are
    // assigned — never merged — because we want the campaign to be the
    // authoritative source. Any editor-set values are overridden.
    s.meta            = DATA.meta;
    s.storyIntro      = DATA.storyIntro;
    s.playerSetup     = DATA.playerSetup;
    s.importantNpcs   = DATA.importantNpcs;
    s.scenarioVars    = DATA.scenarioVars;
    s.storyQuests     = DATA.storyQuests;
    s.startingNpcBans = DATA.startingNpcBans;
    s.factions        = (typeof FACTIONS !== 'undefined') ? FACTIONS : DATA.factions;

    // Splice our triggers in alongside anything the editor left in place.
    var _existing = (s.triggers || []).filter(function (t) {
        return !DATA.triggers.some(function (ours) { return ours.id === t.id; });
    });
    s.triggers = DATA.triggers.concat(_existing);

    // Reset the intro flag so the cinematic actually plays.
    s.__introPlayed = false;
    window.__introPlayed = false;

    if (window.ScenarioTriggers && typeof window.ScenarioTriggers.start === "function") {
        try {
            window.ScenarioTriggers.start(s);
            console.log("[MingFrontier] ✅ ScenarioTriggers started — Liu Sheng's tour begins.");
        } catch (err) {
            console.error("[MingFrontier] ScenarioTriggers.start threw:", err);
        }
    } else {
        console.warn("[MingFrontier] ScenarioTriggers not found — DATA spliced but runtime not started.");
    }
}

// =============================================================================
// PUBLIC SURFACE
// ─────────────────────────────────────────────────────────────────────────────
// We keep the SAME public name (window.SongJinScenario) so story3_map_and_update
// and any other engine glue that already references it keeps working without
// edits. The story underneath has just been re-skinned to the Ming frontier.
// =============================================================================
window.SongJinScenario = {
    DATA:          DATA,
    CONFIG:        CONFIG,
    LOCATIONS:     CONFIG.locations,
    WALL_GEOMETRY: CONFIG.wall,
    WALL_OPENINGS: CONFIG.wallOpenings,
    applyFactions: applyStory3Factions,
    install:       install,
    VERSION: "3.2.0-ming"
};

// Backwards-compatible alias — some engine modules may check for a MingFrontier
// hook explicitly.
window.MingFrontierScenario = window.SongJinScenario;

// Auto-install safety net.
(function _autoInstall() {
    if (window.__campaignStory3Active && !window.__sj_installed) {
        install();
        return;
    }
    setTimeout(_autoInstall, 500);
})();

console.log("[MingFrontier] songJinwar_scenario.js v" + window.SongJinScenario.VERSION +
            " loaded — Liaodong frontier scenario active. " +
            "Settlement coords: window.SongJinScenario.LOCATIONS");

})();