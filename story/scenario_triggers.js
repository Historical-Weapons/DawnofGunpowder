// ============================================================================
// SCENARIO TRIGGERS  —  scenario_triggers.js
// ============================================================================
//
// REPLACES the old "Open Triggers Editor (placeholder)" tool inside the
// Scenario Editor with a full Age-of-Empires-2-style trigger system.
//
//   ▷ Authoring side (Editor):
//       A movable, resizable, mobile-friendly modal opened from the existing
//       Triggers panel button.  Has tabs:
//
//          • Story         — intro art / dialogue / fade-in / title card
//          • Player        — starting position, faction, troops, roster, gold
//          • NPCs          — important named NPCs, stats, portraits, waypoints
//          • Triggers      — list + per-trigger Conditions/Actions editor
//          • Win / Lose    — high-level victory / defeat conditions (compiled
//                            into triggers automatically)
//          • Timeline      — time-based events on a single timeline view
//          • Custom JS     — raw JS textbox per trigger ("custom_js" action)
//          • Help          — list of every condition + action with explanation
//
//   ▷ Runtime side (live game):
//       At scenario boot, ScenarioRuntime fires `scenario_start` and we
//       install:
//          - A condition evaluator that ticks every game frame (~60 Hz, but
//            polled at 6 Hz for performance — see TRIGGER_TICK_HZ).
//          - Action handlers for every supported action type.
//          - Hooks into existing engine events (city_captured,
//            battle_won/lost, npc_killed, …) via globals or polling fallback.
//
//   ▷ Save format:
//       Triggers live in scenario.triggers[].  We also add three sibling
//       fields to scenarioDoc that the editor and runtime both read/write:
//
//         scenario.storyIntro     — { enabled, art, lines, fadeMs, ... }
//         scenario.playerSetup    — { x, y, faction, troops, roster, gold }
//         scenario.importantNpcs  — [ { id, name, faction, x, y, ... } ]
//         scenario.scenarioVars   — { [string]: any }   (trigger-set variables)
//
//       These are added LAZILY when the editor first writes to them, so older
//       scenario files (pre-trigger-system) load without modification.
//
// HOOKING (zero-touch ideal — but two tiny optional one-liners help)
//   1) index.html  — add this AFTER scenario_update.js and AFTER
//      sandboxmode_overworld.js (so both ScenarioRuntime and logGameEvent
//      exist by the time we load):
//
//          <script src="story/storymode_presentation.js"></script>
//          <script src="story/scenario_triggers.js"></script>
//
//   2) scenario_editor.js  — REPLACE the body of `_buildTriggersPanel()` with:
//
//          function _buildTriggersPanel() {
//              const wrap = document.createElement("div");
//              wrap.innerHTML = `
//                  <button id="se-trig-open" style="width:100%;padding:8px;
//                      background:#1a3a5c;color:#cfd8dc;border:1px solid #4a8fa8;
//                      cursor:pointer;font-weight:bold;">
//                      ⚡ Open Trigger Editor
//                  </button>`;
//              setTimeout(() => {
//                  wrap.querySelector("#se-trig-open").onclick = () => {
//                      if (window.ScenarioTriggers && window.ScenarioTriggers.openEditor) {
//                          window.ScenarioTriggers.openEditor(window.ScenarioEditor._state.scenario);
//                      } else {
//                          alert("ScenarioTriggers module not loaded.");
//                      }
//                  };
//              }, 0);
//              return wrap;
//          }
//
//      That's the only edit to existing files.  Everything else is in this
//      file, plus storymode_presentation.js.
//
//   3) The existing ScenarioRuntime.fireTrigger() in scenario_update.js
//      already calls our handlers via registerTriggerHandler().  We use it.
//
// PHILOSOPHY
//   Triggers are PURE DATA — JSON-serializable conditions + actions.  This
//   means scenarios stay portable, sharable, and developer-readable.  The
//   trigger editor is essentially a visual DSL, but anyone can also edit the
//   raw JSON directly, OR drop in a "custom_js" action with their own code
//   for total flexibility.
//
//   Compiled triggers are valid JS that future devs can fold into hand-written
//   campaign code (export view in editor: "Export as JS").
//
// ============================================================================

window.ScenarioTriggers = (function () {
"use strict";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ CONFIGURATION                                                            ║
// ╚══════════════════════════════════════════════════════════════════════════╝
const TRIGGER_TICK_HZ      = 6;       // condition polling rate (Hz)
const TRIGGER_TICK_MS      = Math.floor(1000 / TRIGGER_TICK_HZ);
const MAX_HISTORY          = 200;     // game-event history kept for triggers
const DEFAULT_PORTRAIT_BG  = "#3a2f1f";
const VERSION              = "1.0";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ CONDITION + ACTION CATALOGS                                              ║
// ║                                                                          ║
// ║  Each catalog entry has a metadata block describing its parameters.      ║
// ║  The editor reads these to render a parameter form automatically — so    ║
// ║  adding a new condition or action is a one-stop registration.            ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// Each entry: { label, desc, params: [{key,label,type,default,...}], evaluate }
const CONDITIONS = {
    // ── ALWAYS / TIMING ────────────────────────────────────────────────────
    "always":              {
        label: "Always (every check)",
        desc:  "Always passes. Useful for background timers / actions.",
        params: [],
        evaluate: () => true
    },
    "scenario_start":      {
        label: "Scenario Start",
        desc:  "Fires once on the first tick AFTER the opening cinematic / intro "
             + "fully completes (including the final fade-in that reveals the world). "
             + "If the scenario has no intro, fires on the very first tick. "
             + "Always mark triggers that use this condition with once:true so they "
             + "fire exactly once per scenario boot.",
        params: [],
        // ── IMPORTANT ───────────────────────────────────────────────────────────
        // We deliberately do NOT use `ctx.tick === 1` here.  The tick counter
        // increments even while rt.storyPlaying is true (the condition evaluator
        // just returns early), so by the time the intro ends tick is already
        // in the 40-50 range and tick===1 would NEVER be true.
        //
        // Instead we gate on window.__DoG_introDone, which _maybePlayStoryIntro
        // sets in its finally block after the last fadeIn completes.  For
        // scenarios that have no intro, _maybePlayStoryIntro sets the flag
        // immediately so the trigger fires on the next evaluation cycle.
        // ──────────────────────────────────────────────────────────────────────
        evaluate: (p, ctx) => ctx.introComplete
    },
    "timer_elapsed":       {
        label: "Timer (seconds elapsed)",
        desc:  "Game-time seconds since scenario start ≥ value.",
        params: [
            { key: "seconds", label: "Seconds", type: "number", default: 5, min: 0 }
        ],
        evaluate: (p, ctx) => ctx.elapsedSec >= (p.seconds || 0)
    },
    "timer_between":       {
        label: "Timer (seconds between A–B)",
        desc:  "True only between the given seconds since start (inclusive).",
        params: [
            { key: "from", label: "From sec", type: "number", default: 0  },
            { key: "to",   label: "To sec",   type: "number", default: 30 }
        ],
        evaluate: (p, ctx) => ctx.elapsedSec >= (p.from || 0) && ctx.elapsedSec <= (p.to || 0)
    },

    // ── PLAYER POSITION / STATE ────────────────────────────────────────────
    "player_in_region":    {
        label: "Player inside circular region",
        desc:  "Player is within radius of (x,y) in WORLD pixels.",
        params: [
            { key: "x",      label: "World X",  type: "number", default: 2000 },
            { key: "y",      label: "World Y",  type: "number", default: 1500 },
            { key: "radius", label: "Radius",   type: "number", default: 400  }
        ],
        evaluate: (p) => {
            if (typeof window.player === "undefined") return false;
            const dx = window.player.x - (p.x || 0);
            const dy = window.player.y - (p.y || 0);
            return Math.hypot(dx, dy) <= (p.radius || 0);
        }
    },
    "player_at_city":      {
        label: "Player near city",
        desc:  "Player within 200px of the named city.",
        params: [
            { key: "cityName", label: "City Name", type: "string", default: "" },
            { key: "radius",   label: "Radius",    type: "number", default: 200 }
        ],
        evaluate: (p) => {
            if (typeof window.player === "undefined") return false;
            const cities = window.cities_sandbox || [];
            const c = cities.find(c => c.name === p.cityName);
            if (!c) return false;
            return Math.hypot(window.player.x - c.x, window.player.y - c.y) <= (p.radius || 50);
        }
    },
    "player_in_city_mode": {
        label: "Player inside any city",
        desc:  "Player has entered any city interior (city mode active).",
        params: [],
        evaluate: () => (typeof window.inCityMode !== "undefined") && !!window.inCityMode
    },
    "player_in_battle":    {
        label: "Player in battle",
        desc:  "Battle mode is currently active.",
        params: [],
        evaluate: () => (typeof window.inBattleMode !== "undefined") && !!window.inBattleMode
    },

    // ── PLAYER STATS ───────────────────────────────────────────────────────
    "player_troops_above": {
        label: "Player troops > N",
        desc:  "Player has STRICTLY MORE THAN N troops.",
        params: [{ key: "n", label: "Troops", type: "number", default: 100 }],
        evaluate: (p) => (window.player?.troops || 0) > (p.n || 0)
    },
    "player_troops_below": {
        label: "Player troops < N",
        desc:  "Player has STRICTLY LESS THAN N troops.",
        params: [{ key: "n", label: "Troops", type: "number", default: 50 }],
        evaluate: (p) => (window.player?.troops || 0) < (p.n || 0)
    },
    "player_gold_above":   {
        label: "Player gold > N",
        desc:  "Player gold strictly above value.",
        params: [{ key: "n", label: "Gold", type: "number", default: 1000 }],
        evaluate: (p) => (window.player?.gold || 0) > (p.n || 0)
    },
    "player_food_above":   {
        label: "Player food > N",
        desc:  "Player food strictly above value.",
        params: [{ key: "n", label: "Food", type: "number", default: 500 }],
        evaluate: (p) => (window.player?.food || 0) > (p.n || 0)
    },
    "player_hp_below_pct": {
        label: "Player HP < % of max",
        desc:  "Player HP / maxHealth < given percent.",
        params: [{ key: "pct", label: "Percent", type: "number", default: 30, min: 0, max: 100 }],
        evaluate: (p) => {
            if (!window.player) return false;
            const ratio = (window.player.hp || 0) / Math.max(1, window.player.maxHealth || 1);
            return ratio * 100 < (p.pct || 0);
        }
    },

    // ── FACTION / DIPLOMACY ────────────────────────────────────────────────
    "faction_alive":       {
        label: "Faction has cities",
        desc:  "Named faction owns ≥ 1 city.",
        params: [{ key: "faction", label: "Faction", type: "string", default: "" }],
        evaluate: (p) => {
            const cities = window.cities_sandbox || [];
            return cities.some(c => c.faction === p.faction);
        }
    },
    "faction_eliminated":  {
        label: "Faction eliminated (no cities)",
        desc:  "Named faction owns 0 cities.",
        params: [{ key: "faction", label: "Faction", type: "string", default: "" }],
        evaluate: (p) => {
            const cities = window.cities_sandbox || [];
            return !cities.some(c => c.faction === p.faction);
        }
    },
    "city_owned_by":       {
        label: "City owned by faction",
        desc:  "Specific city is currently held by faction.",
        params: [
            { key: "cityName", label: "City",    type: "string", default: "" },
            { key: "faction",  label: "Faction", type: "string", default: "" }
        ],
        evaluate: (p) => {
            const cities = window.cities_sandbox || [];
            const c = cities.find(c => c.name === p.cityName);
            return !!(c && c.faction === p.faction);
        }
    },
    "factions_at_war":     {
        label: "Factions A & B at War",
        desc:  "FACTION_RELATIONS[A][B] === 'War'.",
        params: [
            { key: "a", label: "Faction A", type: "string", default: "" },
            { key: "b", label: "Faction B", type: "string", default: "" }
        ],
        evaluate: (p) => {
            const rel = (typeof window.FACTION_RELATIONS_get === "function")
                        ? window.FACTION_RELATIONS_get() : {};
            return rel?.[p.a]?.[p.b] === "War";
        }
    },

    // ── NPCS ───────────────────────────────────────────────────────────────
    "npc_at_waypoint":     {
        label: "Important NPC near (x,y)",
        desc:  "An importantNpc with this id is within radius of (x,y).",
        params: [
            { key: "id",     label: "NPC ID",  type: "string", default: "" },
            { key: "x",      label: "X",       type: "number", default: 0  },
            { key: "y",      label: "Y",       type: "number", default: 0  },
            { key: "radius", label: "Radius",  type: "number", default: 100 }
        ],
        evaluate: (p) => {
            const npc = _findImportantNpcLive(p.id);
            if (!npc) return false;
            return Math.hypot(npc.x - p.x, npc.y - p.y) <= (p.radius || 100);
        }
    },
    "npc_killed":          {
        label: "Important NPC killed",
        desc:  "An importantNpc with this id was killed (count drops to 0).",
        params: [{ key: "id", label: "NPC ID", type: "string", default: "" }],
        evaluate: (p, ctx) => {
            const npc = _findImportantNpcLive(p.id);
            if (!npc) return ctx.killedNpcs.has(p.id);  // remembered after deletion
            return (npc.count || 0) <= 0;
        }
    },
    "npc_alive":           {
        label: "Important NPC alive",
        desc:  "An importantNpc with this id is still alive.",
        params: [{ key: "id", label: "NPC ID", type: "string", default: "" }],
        evaluate: (p) => {
            const npc = _findImportantNpcLive(p.id);
            return !!(npc && (npc.count || 0) > 0);
        }
    },

    // ── EVENT HISTORY ──────────────────────────────────────────────────────
    "battle_won_against":  {
        label: "Battle won against faction",
        desc:  "A battle was won against this faction at any point.",
        params: [{ key: "faction", label: "Faction", type: "string", default: "" }],
        evaluate: (p, ctx) => ctx.history.some(h =>
            h.type === "battle_won" && h.faction === p.faction
        )
    },
    "battle_lost":         {
        label: "Player lost a battle",
        desc:  "Player has lost ≥ 1 battle since scenario start.",
        params: [],
        evaluate: (p, ctx) => ctx.history.some(h => h.type === "battle_lost")
    },
    "city_captured_by_player": {
        label: "Player captured a city",
        desc:  "Player has captured ≥ 1 city (since scenario start).",
        params: [{ key: "cityName", label: "City Name (blank = any)", type: "string", default: "" }],
        evaluate: (p, ctx) => ctx.history.some(h =>
            h.type === "city_captured" &&
            h.byFaction === (window.player?.faction || "Player") &&
            (!p.cityName || h.cityName === p.cityName)
        )
    },

    // ── TRIGGER CHAINING / SCENARIO VARS ───────────────────────────────────
    "trigger_fired":       {
        label: "Trigger has fired",
        desc:  "Another trigger (by id) has fired at least once.",
        params: [{ key: "id", label: "Trigger ID", type: "string", default: "" }],
        evaluate: (p, ctx) => !!ctx.firedById[p.id]
    },
    "var_equals":          {
        label: "Scenario var equals",
        desc:  "Scenario variable === value (string or number).",
        params: [
            { key: "name",  label: "Var Name", type: "string", default: "" },
            { key: "value", label: "Value",    type: "string", default: "" }
        ],
        evaluate: (p, ctx) => {
            const v = ctx.vars[p.name];
            // Coerce: if both look numeric, compare as numbers
            const a = (typeof v === "number") ? v : v;
            const b = isNaN(parseFloat(p.value)) ? p.value : parseFloat(p.value);
            // eslint-disable-next-line eqeqeq
            return a == b;
        }
    },
    "var_above":           {
        label: "Scenario var > N",
        desc:  "Scenario variable strictly greater than N.",
        params: [
            { key: "name", label: "Var Name", type: "string", default: "" },
            { key: "n",    label: "N",        type: "number", default: 0  }
        ],
        evaluate: (p, ctx) => (parseFloat(ctx.vars[p.name]) || 0) > (p.n || 0)
    },

    // ── CUSTOM JS ──────────────────────────────────────────────────────────
    "custom_js":           {
        label: "Custom JS condition",
        desc:  "Evaluates a JS expression. `return true` to pass. `player`, "
             + "`cities`, `vars`, `npcs`, `ctx` are in scope.",
        params: [{ key: "code", label: "JS Code", type: "longtext", default: "return true;" }],
        evaluate: (p, ctx) => {
            try {
                const fn = new Function("player", "cities", "vars", "npcs", "ctx", p.code || "return false;");
                return !!fn(window.player, window.cities_sandbox || [], ctx.vars, _liveImportantNpcs(), ctx);
            } catch (e) {
                console.warn("[ScenarioTriggers] custom_js condition error:", e);
                return false;
            }
        }
    }
};

// ── Action catalog ──────────────────────────────────────────────────────────
const ACTIONS = {
    // ── PRESENTATION ───────────────────────────────────────────────────────
    "show_dialogue": {
        label: "Show dialogue (NPC portraits)",
        desc:  "Display a sequence of dialogue lines using StoryPresentation.",
        params: [
            { key: "lines", label: "Lines",
              type: "dialogue_lines",
              default: [{ name: "Narrator", text: "...", side: "left" }] },
            { key: "letterbox",   label: "Cinematic bars", type: "bool",   default: true  },
            { key: "typewriterCps", label: "Chars/sec",    type: "number", default: 40    }
        ]
    },
    "fade_in": {
        label: "Fade IN (uncover screen)",
        desc:  "Fade from a solid color to transparent over <ms>.",
        params: [
            { key: "ms",    label: "Milliseconds", type: "number", default: 1000 },
            { key: "color", label: "Color",        type: "color",  default: "#000000" }
        ]
    },
    "fade_out": {
        label: "Fade OUT (cover screen)",
        desc:  "Fade from transparent to a solid color, and stay there.",
        params: [
            { key: "ms",    label: "Milliseconds", type: "number", default: 1000 },
            { key: "color", label: "Color",        type: "color",  default: "#000000" }
        ]
    },
    "fade_flash": {
        label: "Screen flash",
        desc:  "Brief screen flash of color (e.g. white for cannon fire).",
        params: [
            { key: "color", label: "Color",        type: "color",  default: "#ffffff" },
            { key: "ms",    label: "Total ms",     type: "number", default: 250 }
        ]
    },
    "show_art": {
        label: "Show full-screen art card",
        desc:  "Display a full-screen image. URL or data: URI.",
        params: [
            { key: "url",      label: "Image URL / data: URI", type: "image",   default: "" },
            { key: "ms",       label: "Auto-dismiss ms (0=manual)", type: "number", default: 5000 },
            { key: "kenburns", label: "Ken-Burns zoom",        type: "bool",    default: false },
            { key: "caption",  label: "Caption text (shown below image)", type: "longtext", default: "" }
        ]
    },
    "show_title": {
        label: "Show title card",
        desc:  "Big centered title card (e.g. 'Chapter I — Hakata 1274').",
        params: [
            { key: "title",    label: "Title",    type: "string", default: "Chapter I" },
            { key: "subtitle", label: "Subtitle", type: "string", default: "" },
            { key: "ms",       label: "Hold ms",  type: "number", default: 3500 }
        ]
    },
    "play_movie": {
        label: "Play a Movie",
        desc:  "Plays one of the scenario's movies (Story tab). Lookup by id, " +
               "name, or numeric index. Use this for cutscenes that fire mid-game.",
        params: [
            { key: "movie", label: "Movie id, name, or index", type: "string", default: "Intro" }
        ]
    },
    "show_subtitle": {
        label: "Show bottom subtitle",
        desc:  "Persistent subtitle line at bottom of screen.",
        params: [
            { key: "text",  label: "Text",  type: "string", default: "" },
            { key: "ms",    label: "Show ms (0=until cleared)", type: "number", default: 4000 },
            { key: "color", label: "Color", type: "color",  default: "#f5e6c8" }
        ]
    },
    "letterbox": {
        label: "Cinematic bars on/off",
        desc:  "Toggle the top/bottom black bars.",
        params: [{ key: "on", label: "Enable bars", type: "bool", default: true }]
    },
    "log_message": {
        label: "Log message to event log",
        desc:  "Posts a line into the in-game event log.",
        params: [
            { key: "text", label: "Text", type: "string", default: "Story event!" },
            { key: "tag",  label: "Tag (general/war/peace)", type: "string", default: "general" }
        ]
    },

    // ── PLAYER ─────────────────────────────────────────────────────────────
    "set_player_pos": {
        label: "Teleport player",
        desc:  "Move the player to (x,y) in world pixels.",
        params: [
            { key: "x", label: "World X", type: "number", default: 2000 },
            { key: "y", label: "World Y", type: "number", default: 1500 }
        ]
    },
    "set_player_stats": {
        label: "Set player stats",
        desc:  "Override one or more player stats (blank = leave unchanged).",
        params: [
            { key: "troops",      label: "Troops",      type: "number", default: null },
            { key: "gold",        label: "Gold",        type: "number", default: null },
            { key: "food",        label: "Food",        type: "number", default: null },
            { key: "hp",          label: "HP",          type: "number", default: null },
            { key: "maxHealth",   label: "Max HP",      type: "number", default: null }
        ]
    },
    "give_player_units": {
        label: "Give player troops",
        desc:  "Add an array of unit-type strings to player.roster.",
        params: [
            { key: "roster", label: "Roster (csv)", type: "longtext",
              default: "Militia,Militia,Militia,Spearman,Spearman" }
        ]
    },
    "remove_player_units": {
        label: "Remove player troops by type",
        desc:  "Remove up to N units of the given type from player.roster.",
        params: [
            { key: "type", label: "Unit Type", type: "string", default: "Militia" },
            { key: "n",    label: "Count",     type: "number", default: 5 }
        ]
    },

    // ── DIPLOMACY ──────────────────────────────────────────────────────────
    "set_relation": {
        label: "Set faction relation",
        desc:  "Set diplomacy between two factions: War / Peace / Ally.",
        params: [
            { key: "a",   label: "Faction A", type: "string", default: "" },
            { key: "b",   label: "Faction B", type: "string", default: "" },
            { key: "rel", label: "Relation",  type: "select", default: "War",
              options: ["War", "Peace", "Ally"] }
        ]
    },
    "set_player_enemy": {
        label: "Set player enemy",
        desc:  "Add or remove a faction from the player.enemies list.",
        params: [
            { key: "faction", label: "Faction", type: "string", default: "" },
            { key: "hostile", label: "Hostile?", type: "bool",  default: true }
        ]
    },
    "transfer_city": {
        label: "Transfer city to faction",
        desc:  "Reassign ownership of a named city.",
        params: [
            { key: "cityName", label: "City Name", type: "string", default: "" },
            { key: "faction",  label: "New Owner", type: "string", default: "" }
        ]
    },

    // ── NPCS ───────────────────────────────────────────────────────────────
    "spawn_important_npc": {
        label: "Spawn / activate important NPC",
        desc:  "Spawn an NPC defined in the scenario's importantNpcs list.",
        params: [{ key: "id", label: "Important NPC ID", type: "string", default: "" }]
    },
    "remove_important_npc": {
        label: "Remove important NPC",
        desc:  "Despawn an important NPC if currently alive on the map.",
        params: [{ key: "id", label: "Important NPC ID", type: "string", default: "" }]
    },
    "set_npc_waypoint": {
        label: "Send important NPC to (x,y)",
        desc:  "Update an important NPC's targetX/targetY.",
        params: [
            { key: "id", label: "Important NPC ID", type: "string", default: "" },
            { key: "x",  label: "World X",          type: "number", default: 2000 },
            { key: "y",  label: "World Y",          type: "number", default: 1500 }
        ]
    },
    "set_npc_spawn_ban": {
        label: "Ban procedural NPC spawns",
        desc:  "Block specific factions and/or roles from spawning procedurally "
             + "for the rest of this scenario session. Comma-separated lists. "
             + "Leave a field blank to leave it unchanged. Pass 'CLEAR' to a "
             + "field to remove all bans for that category.",
        params: [
            { key: "factions", label: "Ban factions (csv, or CLEAR)",
              type: "longtext",
              default: "",
              placeholder: "e.g. Yuan Dynasty Coalition, Great Khaganate" },
            { key: "roles",    label: "Ban roles (csv, or CLEAR)",
              type: "longtext",
              default: "",
              placeholder: "e.g. Commerce, Patrol" }
        ]
    },

    // ── MONGOL WAVE GATE ──────────────────────────────────────────────────────
    "allow_mongol_waves": {
        label: "Allow Mongol wave spawning",
        desc:  "Sets window.__mongolWaveAllowed = true so sandboxmode_npc_system.js "
             + "starts periodic Yuan Dynasty Coalition spawn ticks. Call this once "
             + "from the trigger that signals the Mongol invasion (e.g. the coastal "
             + "landing cutscene). To re-ban, pair with set_npc_spawn_ban.",
        params: []
    },

    // ── BATTLES ────────────────────────────────────────────────────────────
    "force_battle": {
        label: "Force a custom battle",
        desc:  "Launch a Custom-Battle-style fight using current player roster "
             + "vs. the supplied enemy roster. Uses the existing "
             + "custom_battle_gui logic. Result is fed back through the "
             + "battle_won_against / battle_lost history.",
        params: [
            { key: "enemyRoster",  label: "Enemy roster (csv unit-types)",
              type: "longtext", default: "Militia,Militia,Spearman,Archer" },
            { key: "enemyFaction", label: "Enemy faction",
              type: "string", default: "Bandits" },
            { key: "map",          label: "Battle map",
              type: "select", default: "Plains",
              options: ["Plains","Forest","Highlands","Desert","River","Snow","Coastal","Ocean","Siege City"] },
            { key: "mode",         label: "Mode",
              type: "select", default: "field",
              options: ["field","siege"] }
        ]
    },

    // ── FLOW CONTROL ───────────────────────────────────────────────────────
    "fire_trigger": {
        label: "Manually fire another trigger",
        desc:  "Bypasses conditions on the named trigger and runs its actions.",
        params: [{ key: "id", label: "Trigger ID", type: "string", default: "" }]
    },
    "enable_trigger": {
        label: "Enable trigger by id",
        desc:  "Re-enables a trigger so its conditions can pass again.",
        params: [{ key: "id", label: "Trigger ID", type: "string", default: "" }]
    },
    "disable_trigger": {
        label: "Disable trigger by id",
        desc:  "Stops a trigger from firing further.",
        params: [{ key: "id", label: "Trigger ID", type: "string", default: "" }]
    },
    "set_var": {
        label: "Set scenario variable",
        desc:  "Assign a value to a scenario-scoped variable.",
        params: [
            { key: "name",  label: "Name",  type: "string", default: "" },
            { key: "value", label: "Value", type: "string", default: "" }
        ]
    },
    "increment_var": {
        label: "Increment scenario variable",
        desc:  "Add N to a variable (defaulting from 0). N can be negative.",
        params: [
            { key: "name", label: "Name", type: "string", default: "" },
            { key: "n",    label: "N",    type: "number", default: 1  }
        ]
    },

    // ── SCENARIO END ───────────────────────────────────────────────────────
    "win_scenario": {
        label: "Win scenario",
        desc:  "Display a victory card and stop trigger processing.",
        params: [
            { key: "title",    label: "Title",    type: "string", default: "Victory!" },
            { key: "subtitle", label: "Subtitle", type: "string", default: "Your scenario goals were achieved." }
        ]
    },
    "lose_scenario": {
        label: "Lose scenario",
        desc:  "Display a defeat card and stop trigger processing.",
        params: [
            { key: "title",    label: "Title",    type: "string", default: "Defeat" },
            { key: "subtitle", label: "Subtitle", type: "string", default: "Your scenario was lost." }
        ]
    },

    // ── STORY QUESTS ───────────────────────────────────────────────────────
    "story_quest_set": {
        label: "Set yellow waypoint marker",
        desc:  "Show a pulsing yellow waypoint at (x,y) on the world map. " +
               "When the player enters the radius, optionally fires a trigger " +
               "or sets a variable. Replaces any existing story-quest waypoint.",
        params: [
            { key: "id",              label: "Quest ID",        type: "string", default: "" },
            { key: "title",           label: "Banner title",    type: "string", default: "Objective" },
            { key: "description",     label: "Banner subtext",  type: "longtext", default: "" },
            { key: "x",               label: "World X",         type: "number", default: 2000 },
            { key: "y",               label: "World Y",         type: "number", default: 1500 },
            { key: "radius",          label: "Arrive radius",   type: "number", default: 320 },
            { key: "triggerOnArrive", label: "Fire trigger on arrive (id)", type: "string", default: "" },
            { key: "varOnArrive",     label: "Set var on arrive (name=value)", type: "string", default: "" }
        ]
    },
    "story_quest_complete": {
        label: "Complete a story quest",
        desc:  "Hide the waypoint marker and log it as completed.",
        params: [
            { key: "id", label: "Quest ID (blank = current)", type: "string", default: "" }
        ]
    },
    "story_quest_clear": {
        label: "Clear all story quests",
        desc:  "Removes any active story waypoint without marking complete.",
        params: []
    },

    // ── CUSTOM ─────────────────────────────────────────────────────────────
    "custom_js": {
        label: "Custom JS action",
        desc:  "Run arbitrary JS. `player`, `cities`, `vars`, `npcs`, `ctx`, "
             + "`trig`, and `StoryPresentation` are in scope. Async OK — "
             + "return a Promise to await.",
        params: [{ key: "code", label: "JS Code", type: "longtext",
                  default: "// console.log('hello!');" }]
    }
};

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ RUNTIME STATE                                                            ║
// ╚══════════════════════════════════════════════════════════════════════════╝
const rt = {
    active:        false,
    scenario:      null,    // ref to live scenarioDoc (with triggers, npcs, …)
    triggers:      [],      // array of trigger objects (live ref)
    firedOnce:     {},      // { triggerId: true } once fired
    firedById:     {},      // alias for the condition evaluator
    history:       [],      // { type, ... } event ring buffer
    killedNpcs:    new Set(),
    spawnedNpcs:   {},      // id -> live npc reference (so we can find again)
    vars:          {},      // scenario variables
    bootMs:        0,
    elapsedSec:    0,
    tick:          0,
    intervalId:    null,
    paused:        false,
    pendingForceBattle: null,
    storyPlaying:  false    // set true while a dialogue / fade is running so
                            // we don't pile multiple presentations on top
};

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ INTERNAL HELPERS                                                         ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _liveImportantNpcs() {
    if (!rt.scenario) return [];
    return rt.scenario.importantNpcs || [];
}

// Find a live NPC instance (in globalNPCs) that was spawned from importantNpc id.
function _findImportantNpcLive(id) {
    if (!id) return null;
    const ref = rt.spawnedNpcs[id];
    if (ref) {
        // Confirm still alive
        if (typeof window.globalNPCs !== "undefined" && window.globalNPCs.includes(ref)) {
            return ref;
        }
        // Stale; mark as killed.
        rt.killedNpcs.add(id);
        delete rt.spawnedNpcs[id];
        return null;
    }
    return null;
}

function _pushHistory(entry) {
    rt.history.push(entry);
    if (rt.history.length > MAX_HISTORY) rt.history.shift();
}

function _logToGameLog(text, tag) {
    if (typeof window.logGameEvent === "function") {
        window.logGameEvent(text, tag || "general");
    } else {
        console.log("[Trigger]", text);
    }
}

// Build the context object passed to evaluator functions.
function _ctx() {
    return {
        tick:          rt.tick,
        elapsedSec:    rt.elapsedSec,
        firedById:     rt.firedById,
        history:       rt.history,
        killedNpcs:    rt.killedNpcs,
        vars:          rt.vars,
        // True once _maybePlayStoryIntro has fully completed (including the
        // final fadeIn that reveals the world).  False during the intro and
        // false before it has started.  Used by the scenario_start condition so
        // t0_briefing and similar "fires once at game start" triggers only
        // evaluate AFTER the player can actually see and control the game.
        introComplete: !!window.__DoG_introDone
    };
}

// Evaluate ALL conditions on a trigger; AND-logic.
function _evaluateTrigger(trig) {
    const conds = Array.isArray(trig.conditions) ? trig.conditions : [];
    if (conds.length === 0) return false;   // no conditions = never fires automatically
    const ctx = _ctx();
    for (let i = 0; i < conds.length; i++) {
        const c = conds[i];
        const def = CONDITIONS[c.type];
        if (!def) {
            console.warn("[ScenarioTriggers] Unknown condition type:", c.type);
            return false;
        }
        try {
            if (!def.evaluate(c.params || {}, ctx)) return false;
        } catch (e) {
            console.warn("[ScenarioTriggers] Condition error:", c.type, e);
            return false;
        }
    }
    return true;
}

// expose the catalogs for the editor
function _getCatalogs() { return { CONDITIONS, ACTIONS }; }
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ ACTION EXECUTION                                                         ║
// ║                                                                          ║
// ║  Each action handler takes (params, trigger).  They CAN be async.        ║
// ║  Returning a Promise causes the trigger executor to await before         ║
// ║  running the next action — so dialogue lines play in order.              ║
// ╚══════════════════════════════════════════════════════════════════════════╝
const ACTION_HANDLERS = {

    "show_dialogue": async (p) => {
        if (typeof window.StoryPresentation === "undefined") {
            console.warn("[ScenarioTriggers] StoryPresentation not loaded — show_dialogue skipped.");
            return;
        }
        rt.storyPlaying = true;
        try {
            await window.StoryPresentation.showDialogue(p.lines || [], {
                letterbox:     p.letterbox !== false,
                // Use typeof so typewriterCps:0 (instant text) is respected
                typewriterCps: (typeof p.typewriterCps === "number") ? p.typewriterCps : 0
            });
        } finally {
            rt.storyPlaying = false;
        }
    },

    "fade_in": async (p) => {
        if (window.StoryPresentation) {
            await window.StoryPresentation.fadeIn(p.ms || 1000, p.color || "#000000");
        }
    },
    "fade_out": async (p) => {
        if (window.StoryPresentation) {
            await window.StoryPresentation.fadeOut(p.ms || 1000, p.color || "#000000");
        }
    },
    "fade_flash": async (p) => {
        if (window.StoryPresentation) {
            await window.StoryPresentation.fadeFlash(p.color || "#ffffff", p.ms || 250);
        }
    },
    "show_art": async (p) => {
        if (!window.StoryPresentation || !p.url) return;
        rt.storyPlaying = true;
        try {
            await window.StoryPresentation.showArt(p.url, {
                ms:       (typeof p.ms === "number") ? p.ms : 5000,
                kenburns: !!p.kenburns,
                caption:  p.caption || ""
            });
        } finally {
            rt.storyPlaying = false;
        }
    },
    "show_title": async (p) => {
        if (!window.StoryPresentation) return;
        rt.storyPlaying = true;
        try {
            await window.StoryPresentation.showTitle({
                title:    p.title || "",
                subtitle: p.subtitle || "",
                ms:       (typeof p.ms === "number") ? p.ms : 3500
            });
        } finally {
            rt.storyPlaying = false;
        }
    },
    "show_subtitle": async (p) => {
        if (!window.StoryPresentation) return;
        await window.StoryPresentation.showSubtitle(p.text || "", p.ms || 4000, p.color);
    },
    "play_movie": async (p) => {
        const s = window.__activeScenario;
        if (!s || !Array.isArray(s.movies) || s.movies.length === 0) {
            console.warn("[ScenarioTriggers] play_movie: scenario has no movies.");
            return;
        }
        const ref = (p.movie || "").toString().trim();
        let m = null;
        // Numeric index?
        if (/^\d+$/.test(ref)) {
            m = s.movies[parseInt(ref, 10)] || null;
        }
        // Match by id, then by name
        if (!m) m = s.movies.find(x => x && x.id === ref) || null;
        if (!m) m = s.movies.find(x => x && x.name === ref) || null;
        if (!m) {
            console.warn("[ScenarioTriggers] play_movie: not found:", ref);
            return;
        }
        await _playMovie(m);
    },
    "letterbox": (p) => {
        if (window.StoryPresentation) window.StoryPresentation.showLetterbox(!!p.on);
    },
    "log_message": (p) => {
        _logToGameLog(p.text || "", p.tag || "general");
    },

    // ── PLAYER ─────────────────────────────────────────────────────────────
    "set_player_pos": (p) => {
        if (typeof window.player === "undefined") return;
        if (typeof p.x === "number") window.player.x = p.x;
        if (typeof p.y === "number") window.player.y = p.y;
    },
    "set_player_stats": (p) => {
        if (typeof window.player === "undefined") return;
        ["troops","gold","food","hp","maxHealth"].forEach(k => {
            if (p[k] !== null && p[k] !== undefined && p[k] !== "") {
                window.player[k] = +p[k] || 0;
            }
        });
        // Clamp HP within max
        if (window.player.maxHealth && window.player.hp > window.player.maxHealth) {
            window.player.hp = window.player.maxHealth;
        }
    },
    "give_player_units": (p) => {
        if (typeof window.player === "undefined") return;
        if (!Array.isArray(window.player.roster)) window.player.roster = [];
        const csv = (p.roster || "").trim();
        if (!csv) return;
        const types = csv.split(",").map(s => s.trim()).filter(Boolean);
        types.forEach(t => window.player.roster.push({ type: t, exp: 1 }));
        window.player.troops = (window.player.troops || 0) + types.length;
    },
    "remove_player_units": (p) => {
        if (typeof window.player === "undefined" || !Array.isArray(window.player.roster)) return;
        let n = +p.n || 0;
        const before = window.player.roster.length;
        for (let i = window.player.roster.length - 1; i >= 0 && n > 0; i--) {
            if (window.player.roster[i].type === p.type) {
                window.player.roster.splice(i, 1);
                n--;
            }
        }
        const removed = before - window.player.roster.length;
        window.player.troops = Math.max(0, (window.player.troops || 0) - removed);
    },

    // ── DIPLOMACY ──────────────────────────────────────────────────────────
    "set_relation": (p) => {
        if (!p.a || !p.b) return;
        // FACTION_RELATIONS is private to faction_dynamics.js, but the matrix
        // is mutated in place by getter/setter through the global accessor.
        const get = window.FACTION_RELATIONS_get;
        if (typeof get !== "function") {
            console.warn("[ScenarioTriggers] FACTION_RELATIONS_get unavailable.");
            return;
        }
        const matrix = get();
        if (!matrix) return;
        if (!matrix[p.a]) matrix[p.a] = {};
        if (!matrix[p.b]) matrix[p.b] = {};
        const rel = (p.rel === "Ally" || p.rel === "War" || p.rel === "Peace") ? p.rel : "Peace";
        matrix[p.a][p.b] = rel;
        matrix[p.b][p.a] = rel;
        // Refresh diplomacy panel if open
        if (typeof window.renderDiplomacyMatrix === "function") {
            try { window.renderDiplomacyMatrix(); } catch(e){}
        }
        _logToGameLog(`${p.a} and ${p.b} are now: ${rel}`,
            rel === "War" ? "war" : (rel === "Ally" ? "peace" : "general"));
    },
    "set_player_enemy": (p) => {
        if (typeof window.player === "undefined") return;
        if (!Array.isArray(window.player.enemies)) window.player.enemies = [];
        const list = window.player.enemies;
        const has = list.includes(p.faction);
        if (p.hostile && !has) list.push(p.faction);
        else if (!p.hostile && has) {
            window.player.enemies = list.filter(f => f !== p.faction);
        }
    },
    "transfer_city": (p) => {
        const cities = window.cities_sandbox || [];
        const c = cities.find(c => c.name === p.cityName);
        if (!c) {
            console.warn("[ScenarioTriggers] transfer_city: city not found:", p.cityName);
            return;
        }
        const old = c.faction;
        c.faction = p.faction;
        // Re-color if FACTIONS provides a color
        if (window.FACTIONS && window.FACTIONS[p.faction]) {
            c.color = window.FACTIONS[p.faction].color || c.color;
        }
        _pushHistory({ type: "city_captured", cityName: c.name, byFaction: p.faction, fromFaction: old });
        _logToGameLog(`${c.name} now belongs to ${p.faction}.`, "general");
    },

    // ── NPCS ───────────────────────────────────────────────────────────────
    "spawn_important_npc": (p) => {
        if (!rt.scenario) return;
        const def = (rt.scenario.importantNpcs || []).find(n => n.id === p.id);
        if (!def) {
            console.warn("[ScenarioTriggers] spawn_important_npc: id not found:", p.id);
            return;
        }
        if (rt.spawnedNpcs[p.id]) {
            console.log("[ScenarioTriggers] NPC already spawned:", p.id);
            return;
        }
        if (typeof window.globalNPCs === "undefined") {
            console.warn("[ScenarioTriggers] globalNPCs not present yet.");
            return;
        }
        // ── Roster expansion (FIX: respects troops count + rosterMode) ──────
        // rosterMode "distribute" (default): CSV defines unit-type blueprint.
        //   Engine fills `def.troops` slots with an even split of those types ±20%.
        //   e.g. roster=["Archer","Spearman"], troops=80 → ~40 Archers, ~40 Spearmen.
        // rosterMode "hard": CSV is the LITERAL roster; remaining slots padded with Militia.
        //   e.g. roster=["Archer","Archer","Spearman"], troops=80 → 3 exact + 77 Militia.
        let roster = [];
        let count  = Math.max(1, def.troops || 1);

        const rawTypeList = (() => {
            if (Array.isArray(def.roster) && def.roster.length > 0) {
                return def.roster.map(t => (typeof t === "string") ? t : (t.type || "Militia"));
            }
            if (typeof def.roster === "string" && def.roster.trim()) {
                return def.roster.split(",").map(s => s.trim()).filter(Boolean);
            }
            return [];
        })();

        if (rawTypeList.length > 0 && typeof window._expandScenarioRoster === "function") {
            // Use the shared roster expansion helper (defined in scenario_update.js)
            roster = window._expandScenarioRoster(rawTypeList, count, def.rosterMode || "distribute");
        } else if (rawTypeList.length > 0) {
            // Fallback if helper not loaded (should never happen in normal usage)
            if (def.rosterMode === "hard") {
                roster = rawTypeList.map(t => ({ type: t, exp: 1 }));
                const need = count - roster.length;
                for (let i = 0; i < need; i++) roster.push({ type: "Militia", exp: 1 });
                if (roster.length > count) roster.splice(count);
            } else {
                // distribute: fill count with evenly-split types from rawTypeList
                const unique = [...new Set(rawTypeList)];
                const base = Math.floor(count / unique.length);
                for (let i = 0; i < count; i++) roster.push({ type: unique[i % unique.length], exp: 1 });
            }
        }

        // Guard: never spawn with 0 count (updateNPCs filters count<=0 next tick)
        count = Math.max(1, roster.length > 0 ? roster.length : count);
        if (roster.length === 0) {
            // Fallback: militia-only roster sized to count
            for (let i = 0; i < count; i++) roster.push({ type: "Militia", exp: 1 });
        }
        const factionColor = (window.FACTIONS && window.FACTIONS[def.faction]
                               && window.FACTIONS[def.faction].color) || "#888888";

        const npcObj = {
            id: p.id + "__story",
            storyId: p.id,                        // back-reference for triggers
            isImportant: true,
            name:    def.name || "Important NPC",
            role:    def.role || "Military",
            count:   count,
            roster:  roster,
            faction: def.faction || "Bandits",
            color:   factionColor,
            originCity: null,
            targetCity: null,
            // ── Coordinate resolution: editor saves xPct/yPct (0-1 fraction of
            //    map size). At spawn time, convert to absolute world pixels using
            //    the live world dimensions. Falls back to def.x/def.y if set by
            //    legacy JSON, then to a safe default (center of default map).
            x: (function() {
                if (typeof def.x === "number") return def.x;
                if (typeof def.xPct === "number") {
                    return def.xPct * (window.WORLD_WIDTH_sandbox  || 4000);
                }
                return 2000;
            })(),
            y: (function() {
                if (typeof def.y === "number") return def.y;
                if (typeof def.yPct === "number") {
                    return def.yPct * (window.WORLD_HEIGHT_sandbox || 3000);
                }
                return 1500;
            })(),
            targetX: (function() {
                if (typeof def.targetX === "number") return def.targetX;
                if (typeof def.x === "number") return def.x;
                if (typeof def.xPct === "number") {
                    return def.xPct * (window.WORLD_WIDTH_sandbox  || 4000);
                }
                return 2000;
            })(),
            targetY: (function() {
                if (typeof def.targetY === "number") return def.targetY;
                if (typeof def.y === "number") return def.y;
                if (typeof def.yPct === "number") {
                    return def.yPct * (window.WORLD_HEIGHT_sandbox || 3000);
                }
                return 1500;
            })(),
            speed: 0.5,
            anim: 0,
            isMoving: !!def.targetX,
            waitTimer: 0,
            battlingTimer: 0,
            battleTarget: null,
            gold: def.gold || 0,
            food: (def.food || count * 10),
            cargo: {},
            decisionTimer: 0,
            // story stats (used for force_battle / display)
            stats: {
                hp:      def.hp      || 200,
                attack:  def.attack  || 15,
                defense: def.defense || 10,
                armor:   def.armor   || 10
            },
            portraitUrl: def.portraitUrl || null,

            // ── Step 3: per-NPC AI script and waypoint runtime hooks ────────
            // customAI:      JS source string, executed every scriptIntervalMs
            //                by window.NpcWaypoints. Available bindings inside
            //                the script: npc, player, NpcWaypoints, NpcAI,
            //                ScenarioTriggers, vars, dt, time.
            // aiPreset:      "idle"|"patrol"|"repel"|"pathfind" — applied by
            //                NpcAI when no customAI is set. Falls through to
            //                sandbox default (existing AI in updateNPCs) when
            //                aiPreset is empty/missing.
            // cannotDie:     If true, count is clamped to ≥ 1 every tick.
            // scriptIntervalMs: How often to re-run customAI (default 1000ms).
            customAI:         def.customAI || "",
            aiPreset:         def.aiPreset || "",
            cannotDie:        !!def.cannotDie,
            scriptIntervalMs: def.scriptIntervalMs || 1000,
            // Waypoint queue lives on the NPC. Managed by window.NpcWaypoints.
            // Each entry: { x, y, radius?, wait?, onArrive?, if?, label? }
            waypointQueue:    [],
            currentWaypoint:  null,
            waypointStartedAt: 0
        };
        window.globalNPCs.push(npcObj);
        rt.spawnedNpcs[p.id] = npcObj;

        // If the NPC has a portrait, register it for dialogue lines that
        // address them by name.
        if (def.portraitUrl && window.StoryPresentation) {
            window.StoryPresentation.registerPortrait(def.name, def.portraitUrl);
        }

        _logToGameLog(`${def.name} has appeared!`, "general");
    },
    "remove_important_npc": (p) => {
        const ref = rt.spawnedNpcs[p.id];
        if (!ref) return;
        if (typeof window.globalNPCs !== "undefined") {
            const i = window.globalNPCs.indexOf(ref);
            if (i >= 0) window.globalNPCs.splice(i, 1);
        }
        delete rt.spawnedNpcs[p.id];
        rt.killedNpcs.add(p.id);
    },
    "set_npc_waypoint": (p) => {
        const npc = _findImportantNpcLive(p.id);
        if (!npc) return;
        npc.targetX = p.x;
        npc.targetY = p.y;
        npc.isMoving = true;
        npc.waitTimer = 0;
    },

    // ── PROCEDURAL NPC SPAWN BANS ──────────────────────────────────────────
    // Writes to window.__npcSpawnBans, which sandboxmode_npc_system.js reads
    // at every spawn call (_isSpawnBanned helper).
    //
    // params.factions — comma-separated faction names to ban (additive).
    //                   Pass "CLEAR" to wipe all faction bans.
    // params.roles    — comma-separated role names to ban (additive).
    //                   Pass "CLEAR" to wipe all role bans.
    //
    // Additive means repeated calls accumulate — e.g. you can ban "Commerce"
    // in t0_briefing and ban "Patrol" in t1_mongols_landing without the second
    // call overwriting the first.
    "set_npc_spawn_ban": (p) => {
        if (!window.__npcSpawnBans) {
            window.__npcSpawnBans = { factions: [], roles: [] };
        }
        const bans = window.__npcSpawnBans;

        // ── factions field ─────────────────────────────────────────────────
        // FIX: accept either an Array (e.g. [CONFIG.factions.ENEMY]) or a
        // comma-separated string (e.g. "Yuan Dynasty Coalition,Bandits").
        // Previously only strings were handled, so array inputs silently
        // failed because Array.prototype.trim is undefined.
        const _toStrArray = (v) => {
            if (!v) return [];
            if (Array.isArray(v)) return v.map(s => String(s).trim()).filter(Boolean);
            return String(v).split(",").map(s => s.trim()).filter(Boolean);
        };

        const factionsList = _toStrArray(p.factions);
        if (factionsList.length === 1 && factionsList[0].toUpperCase() === "CLEAR") {
            bans.factions = [];
            console.log("[ScenarioTriggers] set_npc_spawn_ban: faction bans cleared.");
        } else {
            factionsList.forEach(f => {
                if (!bans.factions.includes(f)) bans.factions.push(f);
            });
        }

        // ── roles field ────────────────────────────────────────────────────
        const rolesList = _toStrArray(p.roles);
        if (rolesList.length === 1 && rolesList[0].toUpperCase() === "CLEAR") {
            bans.roles = [];
            console.log("[ScenarioTriggers] set_npc_spawn_ban: role bans cleared.");
        } else {
            rolesList.forEach(r => {
                if (!bans.roles.includes(r)) bans.roles.push(r);
            });
        }

        console.log("[ScenarioTriggers] set_npc_spawn_ban → factions:", bans.factions,
                    "| roles:", bans.roles);
    },
    // ── allow_mongol_waves ────────────────────────────────────────────────────
    // Unlocks the periodic Yuan Dynasty Coalition spawn tick in updateNPCs.
    // This should be fired by the trigger that plays the Mongol landing
    // cutscene — NOT at scenario start.  Pairs with set_npc_spawn_ban to
    // keep Yuan units off the map until the story moment arrives.
    "allow_mongol_waves": (_p) => {
        window.__mongolWaveAllowed = true;
        console.log("[ScenarioTriggers] allow_mongol_waves → Yuan Dynasty Coalition spawn tick ENABLED.");
    },
    //
    //  We launch the existing custom battle by populating the same window
    //  references the Custom Battle GUI uses, then bypass the menu and call
    //  the battle launcher.  After the battle exits, the result is detected
    //  via window.__CUSTOM_SIEGE_RESULT__ or by polling preBattleStats and
    //  pushed into our event history (which feeds battle_won_against /
    //  battle_lost conditions).
    "force_battle": (p) => {
        // We don't currently auto-launch from JS — that would require a deep
        // integration pass on custom_battle_gui.  Instead we LOG the request,
        // mark it pending, and surface a button-style call.  This keeps the
        // trigger system safe while exposing the full hook for modders.
        rt.pendingForceBattle = {
            enemyRoster:   (p.enemyRoster || "").split(",").map(s => s.trim()).filter(Boolean),
            enemyFaction:  p.enemyFaction || "Bandits",
            map:           p.map || "Plains",
            mode:          p.mode || "field",
            startedAt:     Date.now()
        };
        _logToGameLog(`A scenario battle has been triggered: ${p.enemyFaction} (${p.map}).`, "war");

        // Hand off to integration helper if available
        if (typeof window.ScenarioForceBattle === "function") {
            try { window.ScenarioForceBattle(rt.pendingForceBattle); }
            catch (e) { console.warn("[ScenarioTriggers] ScenarioForceBattle error:", e); }
        } else {
            // Best-effort: pop the custom battle menu pre-filled.  Modders can
            // call window.ScenarioForceBattle(pending) themselves to replace.
            console.warn("[ScenarioTriggers] No ScenarioForceBattle handler — pending battle stored on rt.pendingForceBattle. Add window.ScenarioForceBattle = fn to launch.");
        }
    },

    // ── FLOW CONTROL ───────────────────────────────────────────────────────
    "fire_trigger": async (p) => {
        const target = rt.triggers.find(t => t.id === p.id);
        if (!target) {
            console.warn("[ScenarioTriggers] fire_trigger: no trigger with id", p.id);
            return;
        }
        await _runTrigger(target, /*forced=*/true);
    },
    "enable_trigger": (p) => {
        const t = rt.triggers.find(x => x.id === p.id);
        if (t) { t.enabled = true; t.fired = false; delete rt.firedOnce[p.id]; delete rt.firedById[p.id]; }
    },
    "disable_trigger": (p) => {
        const t = rt.triggers.find(x => x.id === p.id);
        if (t) t.enabled = false;
    },
    "set_var": (p) => {
        if (!p.name) return;
        // Try numeric coercion
        const n = parseFloat(p.value);
        rt.vars[p.name] = (!isNaN(n) && String(n) === String(p.value).trim()) ? n : p.value;
    },
    "increment_var": (p) => {
        if (!p.name) return;
        const cur = parseFloat(rt.vars[p.name]) || 0;
        rt.vars[p.name] = cur + (+p.n || 0);
    },

    // ── SCENARIO END ───────────────────────────────────────────────────────
    "win_scenario": async (p) => {
        rt.paused = true;
        if (window.StoryPresentation) {
            await window.StoryPresentation.fadeOut(800, "#0a2010");
            await window.StoryPresentation.showTitle({
                title: p.title || "Victory!",
                subtitle: p.subtitle || "",
                ms: 5000
            });
            await window.StoryPresentation.fadeIn(1000, "#0a2010");
        }
        _logToGameLog("🏆 Scenario Won: " + (p.title || "Victory!"), "peace");
        // Stop further trigger evaluation
        stop();
    },
    "lose_scenario": async (p) => {
        rt.paused = true;
        if (window.StoryPresentation) {
            await window.StoryPresentation.fadeOut(800, "#1a0808");
            await window.StoryPresentation.showTitle({
                title: p.title || "Defeat",
                subtitle: p.subtitle || "",
                ms: 5000
            });
            await window.StoryPresentation.fadeIn(1000, "#1a0808");
        }
        _logToGameLog("💀 Scenario Lost: " + (p.title || "Defeat"), "war");
        stop();
    },

    // ── STORY QUESTS (yellow waypoint markers — see story_quest_patch.js) ──
    "story_quest_set": (p) => {
        if (!window.StoryQuests || typeof window.StoryQuests.set !== "function") {
            console.warn("[ScenarioTriggers] story_quest_set: StoryQuests not loaded — load story_quest_patch.js");
            return;
        }
        window.StoryQuests.set({
            id:              p.id || "story_quest_" + Date.now(),
            title:           p.title || "Objective",
            description:     p.description || "",
            x:               +p.x || 0,
            y:               +p.y || 0,
            radius:          +p.radius || 320,
            triggerOnArrive: p.triggerOnArrive || "",
            varOnArrive:     p.varOnArrive || "",
            noAutoComplete:  !!p.noAutoComplete
        });
    },
    "story_quest_complete": (p) => {
        if (!window.StoryQuests || typeof window.StoryQuests.complete !== "function") return;
        window.StoryQuests.complete(p.id || null);
    },
    "story_quest_clear": () => {
        if (!window.StoryQuests || typeof window.StoryQuests.clear !== "function") return;
        window.StoryQuests.clear();
    },

    // ── CUSTOM ─────────────────────────────────────────────────────────────
    "custom_js": async (p, trig) => {
        try {
            const fn = new Function(
                "player", "cities", "vars", "npcs", "ctx", "trig", "StoryPresentation",
                p.code || ""
            );
            const result = fn(
                window.player,
                window.cities_sandbox || [],
                rt.vars,
                _liveImportantNpcs(),
                _ctx(),
                trig,
                window.StoryPresentation
            );
            // Allow the script to return a Promise
            if (result && typeof result.then === "function") await result;
        } catch (e) {
            console.warn("[ScenarioTriggers] custom_js action error:", e);
            _logToGameLog("Custom JS error: " + (e.message || e), "war");
        }
    }
};

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ TRIGGER EXECUTION                                                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝
async function _runTrigger(trig, forced) {
    if (!trig || !rt.active) return;
    if (rt.paused) return;
    if (!forced && trig.fired && trig.once !== false) return;

    trig.fired = true;
    rt.firedOnce[trig.id] = true;
    rt.firedById[trig.id] = true;

    const actions = Array.isArray(trig.actions) ? trig.actions : [];
    for (let i = 0; i < actions.length; i++) {
        const a = actions[i];
        const handler = ACTION_HANDLERS[a.type];
        if (!handler) {
            console.warn("[ScenarioTriggers] Unknown action type:", a.type);
            continue;
        }
        try {
            const result = handler(a.params || {}, trig);
            if (result && typeof result.then === "function") {
                await result;
            }
        } catch (e) {
            console.warn("[ScenarioTriggers] Action failed:", a.type, e);
        }
    }
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ TICK LOOP — evaluates all enabled, un-fired triggers every TICK_MS       ║
// ╚══════════════════════════════════════════════════════════════════════════╝
async function _tick() {
    if (!rt.active || rt.paused) return;

    rt.tick++;
    rt.elapsedSec = (Date.now() - rt.bootMs) / 1000;

    // Don't pile up presentations: skip evaluation while a story scene plays.
    // (Conditions are still re-evaluated on the next tick, so nothing lost.)
    if (rt.storyPlaying) return;

    // Snapshot the trigger list (a trigger action could disable others)
    const list = rt.triggers.slice();
    for (let i = 0; i < list.length; i++) {
        const trig = list[i];
        if (!trig.enabled) continue;
        if (trig.fired && trig.once !== false) continue;

        // Activation gate — must be unlocked by another trigger first
        if (trig.activatedBy) {
            if (!rt.firedById[trig.activatedBy]) continue;
        }

        if (_evaluateTrigger(trig)) {
            // Fire (await for sequential dialogue / fade actions)
            await _runTrigger(trig, false);
            if (rt.paused) break;  // win/lose actions pause
        }
    }
}

// ── Local sleep utility ─────────────────────────────────────────────────────
// storymode_presentation.js defines _sleep inside its own closure, so we
// need our own copy here for use in _maybePlayStoryIntro.
function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Map-load progress helper ────────────────────────────────────────────────
// Returns a 0–100 number if the load percentage is detectable, or -1 if
// unknown (caller should treat unknown as "go ahead / already done").
function _getMapLoadProgress() {
    // Common global variable names used by the engine
    if (typeof window.__mapLoadProgress === "number") return window.__mapLoadProgress;
    if (typeof window.DoGLoadProgress   === "number") return window.DoGLoadProgress;
    if (typeof window.__loadProgress    === "number") return window.__loadProgress;
    // Parse the #loading div text  e.g. "Loading map... (87%)"
    const el = document.getElementById("loading");
    if (el) {
        if (el.style.display === "none") return 100; // hidden → done
        const m = el.textContent.match(/(\d+(?:\.\d+)?)\s*%/);
        if (m) return parseFloat(m[1]);
    }
    return -1; // unknown — treat as complete so we don't block forever
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ START / STOP                                                             ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function start(scenarioDoc) {
    if (!scenarioDoc) return;
    stop(); // ensure clean slate

    rt.active      = true;
    rt.paused      = false;
    rt.scenario    = scenarioDoc;
    rt.triggers    = scenarioDoc.triggers || [];
    rt.firedOnce   = {};
    rt.firedById   = {};
    rt.history     = [];
    rt.killedNpcs  = new Set();
    rt.spawnedNpcs = {};
    rt.vars        = Object.assign({}, scenarioDoc.scenarioVars || {});
    rt.bootMs      = Date.now();
    rt.elapsedSec  = 0;
    rt.tick        = 0;
    rt.storyPlaying = false;

    // Reset intro-gate flags so a scenario re-launch restarts the full guard
    // sequence.  __DoG_introDone is what scenario_start's introComplete reads;
    // __DoG_introEndTime drives the 3-second post-intro parle cooldown.
    window.__DoG_introDone    = false;
    window.__DoG_introEndTime = null;

    // Reset the intro-done flag so a re-started scenario re-runs its guards
    // correctly (e.g. when the player restarts a campaign from the menu).
    window.__DoG_introDone = false;

    // Immediately black the screen so the player NEVER sees NPCs/world in their
    // default positions before the story intro plays.  Only fires once per
    // scenario object (guard also prevents re-blacking if start() is called a
    // second time by hakata_bay_scenario.install() while the intro is running).
    // We wait until ≥95% of the map has loaded before applying the black screen
    // so the player doesn't see a jarring instant-black before the map appears.
    if (window.StoryPresentation && !scenarioDoc.__introPlayed) {
        const _hasIntro =
            (Array.isArray(scenarioDoc.movies) && scenarioDoc.movies.length > 0 &&
             scenarioDoc.movies[0] && scenarioDoc.movies[0].enabled !== false &&
             Array.isArray(scenarioDoc.movies[0].items) && scenarioDoc.movies[0].items.length > 0) ||
            (scenarioDoc.storyIntro && scenarioDoc.storyIntro.enabled);
        if (_hasIntro) {
            const _fadeColor = (scenarioDoc.storyIntro && scenarioDoc.storyIntro.fadeColor) || "#000000";
            // Poll until ≥95% loaded, then apply the pre-story black screen
            (function _waitForLoad() {
                const pct = _getMapLoadProgress();
                if (pct < 0 || pct >= 95) {
                    window.StoryPresentation.fadeOut(0, _fadeColor);
                } else {
                    setTimeout(_waitForLoad, 200);
                }
            })();
        }
    }

    // Reset "fired" flags on each trigger (in case scenario was relaunched)
    rt.triggers.forEach(t => {
        t.fired = false;
        if (t.enabled === undefined) t.enabled = true;
        if (!t.id) t.id = "trig_" + Math.random().toString(36).substr(2, 7);
        if (!Array.isArray(t.conditions)) t.conditions = [];
        if (!Array.isArray(t.actions))    t.actions    = [];
    });

    // Register portraits from importantNpcs
    if (window.StoryPresentation && Array.isArray(scenarioDoc.importantNpcs)) {
        scenarioDoc.importantNpcs.forEach(n => {
            if (n.portraitUrl && n.name) {
                window.StoryPresentation.registerPortrait(n.name, n.portraitUrl);
            }
        });
    }

    // Apply playerSetup overrides (fires immediately at boot, BEFORE triggers
    // see scenario_start).  This is *separate* from triggers because it must
    // happen synchronously with world apply.
    _applyPlayerSetup(scenarioDoc);
// Near the top of the start() function, after _applyPlayerSetup(scenarioDoc):
window.__DoG_scenarioBootTime = Date.now();

// Force-close any parle panel that leaked open from a previous session:
if (typeof inParleMode !== 'undefined') inParleMode = false;
const _staleParle = document.getElementById('parle-panel');
if (_staleParle) _staleParle.style.display = 'none';
    // Safety-net: enterOverworldMode() (called by initGame or the game-loop
    // state machine) resets player.x = worldW * 0.5 AFTER initGame resolves.
    // We re-apply the scenario's playerSetup 1.5 s later to guarantee the
    // scenario position sticks, no matter when enterOverworldMode fires.
setTimeout(() => _applyPlayerSetup(scenarioDoc), 200);

    // ── Auto-spawn: NPCs placed via the scenario editor's "Drop NPC" tool are
    //    marked autoSpawn:true. They appear immediately when the scenario loads
    //    (the player placed them on the map intentionally). Trigger-gated NPCs
    //    (autoSpawn not set) still require an explicit spawn_important_npc action.
    //    Deferred slightly so globalNPCs is populated and the world is ready.
    const _autoSpawnList = (scenarioDoc.importantNpcs || []).filter(n => n.autoSpawn);
    if (_autoSpawnList.length) {
        setTimeout(() => {
            _autoSpawnList.forEach(n => {
                try {
                    // Call the handler directly — _executeAction is not a defined
                    // function in this scope; ACTION_HANDLERS is the correct path.
                    ACTION_HANDLERS["spawn_important_npc"]({ id: n.id }, {});
                } catch (e) {
                    console.warn("[ScenarioTriggers] auto-spawn failed for", n.id, e);
                }
            });
            console.log("[ScenarioTriggers] Auto-spawned", _autoSpawnList.length, "editor-placed NPC(s).");
        }, 800);   // 800ms: world fully painted, globalNPCs ready
    }

    // Run the optional intro sequence (see Story tab in editor).  We do this
    // as a deferred async run so that the world is fully drawn first.
    setTimeout(() => _maybePlayStoryIntro(scenarioDoc), 700);

    // Start tick interval
    rt.intervalId = setInterval(_tick, TRIGGER_TICK_MS);
    console.log(`[ScenarioTriggers] Started — ${rt.triggers.length} triggers, `
                + `${(scenarioDoc.importantNpcs || []).length} important NPCs.`);
}

function stop() {
    rt.active = false;
    if (rt.intervalId) {
        clearInterval(rt.intervalId);
        rt.intervalId = null;
    }
}

function pause()  { rt.paused = true;  }
function resume() { rt.paused = false; }

// ── Player setup at boot ────────────────────────────────────────────────────
function _applyPlayerSetup(scenarioDoc) {
    if (typeof window.player === "undefined") {
        // Engine not ready yet — retry shortly
        setTimeout(() => _applyPlayerSetup(scenarioDoc), 250);
        return;
    }
    const ps = scenarioDoc.playerSetup;
    if (!ps) return;

    // The editor saves xPct/yPct (0-1 fraction of world size).
    // _placePlayer in scenario_update.js mutates ps.x/ps.y at apply time,
    // but _applyPlayerSetup may run before that conversion happens (or the
    // mutation may have been overridden by enterOverworldMode). Convert here
    // defensively so this function is always self-sufficient.
    const _W = window.WORLD_WIDTH_sandbox  || 4000;
    const _H = window.WORLD_HEIGHT_sandbox || 3000;
    if (typeof ps.x !== "number" && typeof ps.xPct === "number") ps.x = ps.xPct * _W;
    if (typeof ps.y !== "number" && typeof ps.yPct === "number") ps.y = ps.yPct * _H;

    if (typeof ps.x === "number")    window.player.x = ps.x;
    if (typeof ps.y === "number")    window.player.y = ps.y;
    if (typeof ps.troops === "number") window.player.troops = ps.troops;
    if (typeof ps.gold === "number")   window.player.gold   = ps.gold;
    if (typeof ps.food === "number")   window.player.food   = ps.food;
    if (typeof ps.hp === "number")     window.player.hp     = ps.hp;
    if (typeof ps.maxHealth === "number") window.player.maxHealth = ps.maxHealth;
    if (typeof ps.faction === "string" && ps.faction) window.player.faction = ps.faction;
    if (Array.isArray(ps.enemies))   window.player.enemies = ps.enemies.slice();

    // Roster: accept either an Array of strings/objects OR a CSV string.
    // hakata_bay_scenario.js's _buildRoster() returns CSV; the editor's saves
    // emit arrays. We handle both so neither shape silently drops the troops.
    let rosterArr = null;
    if (Array.isArray(ps.roster)) {
        rosterArr = ps.roster.map(r =>
            (typeof r === "string") ? { type: r, exp: 1 } :
            (r && r.type)           ? { type: r.type, exp: r.exp || 1 } :
                                      { type: "Militia", exp: 1 }
        );
    } else if (typeof ps.roster === "string" && ps.roster.trim()) {
        rosterArr = ps.roster.split(",")
            .map(s => s.trim()).filter(Boolean)
            .map(t => ({ type: t, exp: 1 }));
    }
    if (rosterArr && rosterArr.length > 0) {
        window.player.roster = rosterArr;
        window.player.troops = rosterArr.length;
    }

    // ── Step 3: per-Player customScript and cannotDie ──────────────────────
    // customScript = JS source pumped by window.NpcWaypoints every ~1s with
    // bindings (player, vars, ScenarioTriggers, NpcWaypoints, time, dt).
    // cannotDie    = clamp player.troops ≥ 1 every tick (engine death gate).
    if (typeof ps.customScript === "string") {
        window.player.customScript = ps.customScript;
        window.player.scriptIntervalMs = ps.scriptIntervalMs || 1000;
    }
    if (typeof ps.cannotDie !== "undefined") {
        window.player.cannotDie = !!ps.cannotDie;
    }

    console.log("[ScenarioTriggers] PlayerSetup applied:",
                window.player.x, window.player.y, "troops:", window.player.troops);
}

// ── Optional story intro ────────────────────────────────────────────────────
async function _maybePlayStoryIntro(scenarioDoc) {
    if (!window.StoryPresentation) {
        // No presentation layer — treat as "no intro"
        _onIntroDone();
        return;
    }

    // Guard: prevent running twice if start() is called a second time (e.g.
    // by hakata_bay_scenario.install()) while the first intro is still playing.
    // We mark the scenarioDoc object itself so the flag survives the second
    // start() call (which uses the same object reference).
    if (scenarioDoc.__introPlayed) return;
    scenarioDoc.__introPlayed = true;

    // Step 4: Prefer the new movies[] format. movies[0] is the boot intro by
    // convention. If the scenario has no movies, fall back to the legacy
    // storyIntro shape so older scenarios keep working.
    if (Array.isArray(scenarioDoc.movies) && scenarioDoc.movies.length > 0) {
        const m = scenarioDoc.movies[0];
        if (m && m.enabled !== false && Array.isArray(m.items) && m.items.length > 0) {
            await _playMovie(m);
            _onIntroDone("movies");
            return;
        }
    }

    const intro = scenarioDoc.storyIntro;
    if (!intro || !intro.enabled) {
        // No intro configured — signal immediately so scenario_start fires on
        // the very next tick and nothing is ever blocked.
        _onIntroDone("none");
        return;
    }

    rt.storyPlaying = true;
    try {
        if (intro.fadeMs) {
            // Start fully black then fade in
            await window.StoryPresentation.fadeOut(0, intro.fadeColor || "#000000");
        }
        if (intro.titleCard && intro.titleCard.title) {
            await window.StoryPresentation.showTitle({
                title:    intro.titleCard.title,
                subtitle: intro.titleCard.subtitle || "",
                ms:       intro.titleCard.ms || 3500
            });
        }
        if (intro.art) {
            const _hasLines = Array.isArray(intro.lines) && intro.lines.length > 0;

            if (_hasLines) {
                // ── Background-art mode ────────────────────────────────────────
                // Show art WITHOUT auto-dismiss (ms:0, no click-advance).
                // Ken-Burns zoom plays while we wait; dialogue runs on top
                // (z-index 18004 > art 18002).
                //
                // Two-art support: if intro.art2 + intro.art2OnLine are defined,
                // art1 plays for the opening lines, then at line art2OnLine we
                // dismiss art1 and cross-fade to art2, so the visuals mirror the
                // dialogue shift (e.g. "enemy fleet" → "your troops").
                // background:true bypasses the FIFO queue so showArt and
                // showDialogue can run concurrently (art behind dialogue).
                window.StoryPresentation.showArt(intro.art, {
                    ms:             0,
                    background:     true,
                    kenburns:       !!intro.kenburns,
                    caption:        intro.artCaption || "",
                    clickToAdvance: false
                });
                // Let the Ken-Burns zoom-in settle before opening dialogue
                await _sleep(3000);

                // Build optional mid-dialogue art-swap callback
                var _onLineArtSwitch = null;
                if (intro.art2 && typeof intro.art2OnLine === "number") {
                    var _art2Shown = false;
                    _onLineArtSwitch = function(lineIdx) {
                        if (!_art2Shown && lineIdx === intro.art2OnLine) {
                            _art2Shown = true;
                            // Dismiss art1 — this starts the 1000ms CSS fade-out +
                            // a 1000ms delayed cleanup in showArt's finish().
                            window.StoryPresentation.dismissArt();
                            // ── Cross-fade delay must exceed the 1000ms cleanup
                            // timeout in showArt's finish() — otherwise Art 1's
                            // stale cleanup timer fires AFTER Art 2's _begin() and
                            // clears the new backgroundImage, blanking Art 2.
                            // art2CrossfadeMs defaults to 1200ms for safety.
                            var _xfadeMs = (typeof intro.art2CrossfadeMs === "number")
                                           ? intro.art2CrossfadeMs : 1200;
                            setTimeout(function() {
                                window.StoryPresentation.showArt(intro.art2, {
                                    ms:             0,
                                    background:     true,
                                    kenburns:       !!intro.kenburns,
                                    caption:        intro.art2Caption || "",
                                    clickToAdvance: false
                                });
                            }, _xfadeMs);
                        }
                    };
                }

                // Dialogue plays over the lingering art background
                await window.StoryPresentation.showDialogue(intro.lines, {
                    letterbox:     intro.letterbox !== false,
                    typewriterCps: (typeof intro.typewriterCps === "number") ? intro.typewriterCps : 0,
                    autoAdvanceMs: (typeof intro.autoAdvance === "number")   ? intro.autoAdvance   : 0,
                    onLine:        _onLineArtSwitch
                });

                // Dialogue done → dismiss whichever art is still showing,
                // then wait for the fade-out CSS transition to finish.
                window.StoryPresentation.dismissArt();
                await _sleep(900);
            } else {
                // No dialogue — art plays fully and auto-dismisses (original behaviour)
                await window.StoryPresentation.showArt(intro.art, {
                    ms:       intro.artMs || 5000,
                    kenburns: !!intro.kenburns,
                    caption:  intro.artCaption || ""
                });
            }
        } else if (Array.isArray(intro.lines) && intro.lines.length > 0) {
            // Art-less dialogue (e.g. text-only intro)
            await window.StoryPresentation.showDialogue(intro.lines, {
                letterbox:     intro.letterbox !== false,
                typewriterCps: (typeof intro.typewriterCps === "number") ? intro.typewriterCps : 0,
                autoAdvanceMs: (typeof intro.autoAdvance   === "number") ? intro.autoAdvance   : 0
            });
        }
        if (intro.fadeMs) {
            await window.StoryPresentation.fadeIn(intro.fadeMs || 1200,
                                                   intro.fadeColor || "#000000");
        }
    } finally {
        rt.storyPlaying = false;
        _onIntroDone("storyIntro");
    }
}

// ── Shared post-intro cleanup called by every _maybePlayStoryIntro exit path ──
//
// Sets the flags that gate scenario_start (introComplete), parle (3s buffer),
// and city-panel (5s campaign guard).  Also hard-closes any parle session that
// leaked open while the player's starting position was being settled during the
// cinematic — proximity triggers near Imazu often fire a parle before the
// intro has even shown the first frame.
function _onIntroDone(source) {
    source = source || "unknown";

    // ── 1. Mark intro done so scenario_start evaluates to true ───────────────
    window.__DoG_introDone    = true;
    // ── 2. Stamp the end time so parle cooldown and city-panel guard can check ─
    window.__DoG_introEndTime = Date.now();

    console.log("[ScenarioTriggers] Intro done (" + source + ") — "
                + "__DoG_introDone=true, __DoG_introEndTime=" + window.__DoG_introEndTime);

    // ── 3. Hard-close any parle panel that leaked in during the cinematic ─────
    // The player spawns at Imazu (right next to city/NPC proximity triggers).
    // Those triggers may have opened the parle panel before the intro was done.
    // We force everything shut here so the player starts with a clean slate.
    try {
        const _pp = document.getElementById('parle-panel');
        if (_pp) {
            _pp.style.display = 'none';
            console.log("[ScenarioTriggers] Post-intro: force-closed parle panel.");
        }
        // Reset ALL parle state globals (defined at module scope in parler_system.js)
        if (typeof window.inParleMode          !== 'undefined') window.inParleMode          = false;
        if (typeof window.isDiplomacyProcessing !== 'undefined') window.isDiplomacyProcessing = false;
        if (typeof window.currentParleNPC       !== 'undefined') window.currentParleNPC       = null;
        if (typeof window.savedParleTile        !== 'undefined') window.savedParleTile        = null;

        // ── 4. Un-pause player movement — intro may have left it paused ─────
        if (window.player) {
            window.player.isMapPaused = false;
            // Stamp the time so the parle system's post-intro 3s cooldown starts NOW
            window.__DoG_introEndTime = Date.now();
        }

        // ── 5. Ensure storyPlaying is clear so triggers tick normally ─────────
        rt.storyPlaying = false;

        // ── 6. Force StoryPresentation into a clean state ────────────────────
        // clear() resets pointer-events on sp-root and hides all overlay layers
        // so nothing from the cinematic blocks game-UI clicks.
        if (window.StoryPresentation && typeof window.StoryPresentation.clear === 'function') {
            window.StoryPresentation.clear();
        }

        // ── 7. Re-enable city-settlement and parler-system buttons ───────────
        // In some code paths a button may have been left disabled (e.g. by a
        // prior updateRecruitButton / updateBuyFoodButton call that ran while
        // the player's gold/food was still being initialised).  We refresh both
        // helpers so the buttons reflect the current player state, and we also
        // strip any residual pointer-events:none or opacity:0.5 from the city
        // panel and related containers so the player can click immediately.
        try {
            // Re-run the engine's own button-state helpers if available
            if (typeof window.updateRecruitButton === 'function') window.updateRecruitButton();
            if (typeof window.updateBuyFoodButton  === 'function') window.updateBuyFoodButton();

            // Belt-and-suspenders: force-enable every named city/parle button
            [
                'recruit-militia-btn', 'buy-food-btn', 'trade-btn',
                'siege-button', 'assault-button', 'peace-button',
                'gui-continue-btn', 'gui-assault-btn', 'gui-leave-btn'
            ].forEach(function(id) {
                var el = document.getElementById(id);
                if (!el) return;
                // Only clear the disabled flag — don't override legitimate
                // state that updateRecruitButton/updateBuyFoodButton just set.
                // (Those helpers re-disable when the player genuinely can't afford.)
                if (el.disabled && !el.dataset.scenarioDisabled) {
                    el.disabled = false;
                }
                el.style.pointerEvents = '';
                el.style.opacity       = '';
            });

            // Restore pointer-events on the city panel and UI sidebar so clicks
            // are never swallowed by a lingering overlay from the cinematic.
            ['city-panel', 'ui', 'recruit-box', 'hostile-box'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) el.style.pointerEvents = '';
            });
        } catch (e2) {
            console.warn("[ScenarioTriggers] Post-intro button re-enable error:", e2);
        }
    } catch (e) {
        console.warn("[ScenarioTriggers] Post-intro parle flush error:", e);
    }
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ ENGINE EVENT HOOKS                                                       ║
// ║                                                                          ║
// ║   We push entries into rt.history when interesting things happen so      ║
// ║   conditions like battle_won_against / city_captured / npc_killed can    ║
// ║   match later.  These hooks are best-effort wrappers — they degrade      ║
// ║   gracefully if the underlying engine functions don't exist.             ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _installEngineHooks() {
    // -- Battle exit hook (custom_battle_gui) --
    // The custom battle GUI exposes a status flag window.__CUSTOM_SIEGE_RESULT__
    // and calls window.showCustomBattleMenu(reportData) on exit.  We poll for
    // result transitions because we cannot wrap that function from here
    // without disrupting other patches.
    let lastBattleId = null;
    setInterval(() => {
        // Active battle?
        const pending = window.preBattleStats;
        if (pending && window.__CUSTOM_BATTLE_EXITING__ === false && pending.playerMen > 0) {
            lastBattleId = pending;
        }
        // Finished battle: __CUSTOM_BATTLE_EXITING__ flips back to false AFTER
        // exit completes, and a report data may still be available.
    }, 1000);

    // -- Hook leaveBattlefield to record outcome --
    if (typeof window.leaveBattlefield === "function" && !window.__triggerLeaveBattleHooked) {
        const orig = window.leaveBattlefield;
        window.leaveBattlefield = function (...args) {
            // Record battle result snapshot before tear-down
            try {
                const env = window.battleEnvironment;
                if (env && env.units) {
                    let pAlive = 0, eAlive = 0;
                    let enemyFaction = null;
                    env.units.forEach(u => {
                        if (u.hp > 0) {
                            if (u.side === "player") pAlive++;
                            else if (u.side === "enemy") {
                                eAlive++;
                                if (!enemyFaction && u.faction) enemyFaction = u.faction;
                            }
                        }
                    });
                    if (pAlive > 0 && eAlive === 0) {
                        _pushHistory({ type: "battle_won", faction: enemyFaction || "Unknown" });
                    } else if (pAlive === 0 && eAlive > 0) {
                        _pushHistory({ type: "battle_lost", faction: enemyFaction || "Unknown" });
                    }
                }
            } catch (e) { console.warn("[ScenarioTriggers] battle hook error:", e); }
            return orig.apply(this, args);
        };
        window.__triggerLeaveBattleHooked = true;
    }

    // -- Hook a city-captured detector via city.faction polling --
    let lastFactions = {};
    setInterval(() => {
        if (!rt.active) return;
        const cities = window.cities_sandbox || [];
        cities.forEach(c => {
            if (!c || !c.name) return;
            const prev = lastFactions[c.name];
            if (prev && prev !== c.faction) {
                _pushHistory({
                    type: "city_captured",
                    cityName: c.name,
                    fromFaction: prev,
                    byFaction: c.faction
                });
                _logToGameLog(`${c.name} captured by ${c.faction}.`, "war");
            }
            lastFactions[c.name] = c.faction;
        });
    }, 1500);

    // -- NPC kill detection --
    setInterval(() => {
        if (!rt.active) return;
        Object.keys(rt.spawnedNpcs).forEach(id => {
            const ref = rt.spawnedNpcs[id];
            if (!ref) return;
            const stillThere = window.globalNPCs && window.globalNPCs.includes(ref);
            if (!stillThere || (ref.count || 0) <= 0) {
                rt.killedNpcs.add(id);
                delete rt.spawnedNpcs[id];
                _pushHistory({ type: "npc_killed", id: id, name: ref.name });
            }
        });
    }, 2000);
}

// ── Wire up to ScenarioRuntime so we boot at the right moment ──────────────
function _installScenarioRuntimeHook() {
    // Strategy: poll for ScenarioRuntime, then patch its launch path so we
    // start triggers AFTER the scenario has been applied.  Since
    // ScenarioRuntime sets window.__activeScenario at the very end of
    // _applyToLiveEngine, we just watch that field.
    let lastActive = null;
    setInterval(() => {
        const cur = window.__activeScenario;
        if (cur && cur !== lastActive) {
            lastActive = cur;
            // Boot a small delay after world apply so cities etc. are present
            setTimeout(() => {
                if (window.__activeScenario === cur) start(cur);
            }, 600);
        }
        if (!cur && lastActive) {
            // Scenario cleared (e.g. quit to menu) — stop ticks
            stop();
            lastActive = null;
        }
    }, 600);
}

// Install hooks at module load
_installEngineHooks();
_installScenarioRuntimeHook();
// ============================================================================
// ║                                                                          ║
// ║                    EDITOR UI                                             ║
// ║                                                                          ║
// ║  openEditor(scenarioDoc) — opens a full-screen modal with tabs:          ║
// ║    Story | Player | NPCs | Triggers | Win/Lose | Timeline | JS | Help    ║
// ║                                                                          ║
// ║  All edits are written DIRECTLY into scenarioDoc, so the existing        ║
// ║  scenario_editor.js Save flow picks them up without changes.             ║
// ║                                                                          ║
// ║  All UI is movable / resizable on desktop; full-screen on mobile.        ║
// ║                                                                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

let editorState = null;   // active editor session

function openEditor(scenarioDoc) {
    if (!scenarioDoc) {
        alert("No scenario loaded — cannot open Trigger Editor.");
        return;
    }
    if (editorState) {
        // Already open — just bring to front
        editorState.root.style.display = "flex";
        return;
    }
    _ensureScenarioFields(scenarioDoc);
    _injectEditorCss();

    const root = document.createElement("div");
    root.id = "st-editor-root";
    root.className = "st-editor-root";
    document.body.appendChild(root);

    editorState = {
        root, scenario: scenarioDoc,
        currentTab: "Story",
        currentTriggerId: null
    };

    _buildEditorChrome(root);
    _switchTab("Story");
}

// Lazy-init scenario fields the editor uses

// ── Step 4: Movie shape ────────────────────────────────────────────────────
// A movie is an ordered sequence of cinematic items. Each item has a `type`
// ("fade" | "title" | "art" | "dialogue") and the type-specific fields. The
// player executes them in array order; reordering an item moves where it
// runs in the cinematic. Fields not relevant to a type are ignored.
//
// Item shapes:
//   { type: "fade",     fadeMs, fadeColor, direction: "in"|"out" }
//   { type: "title",    title, subtitle, ms }
//   { type: "art",      art, artMs, kenburns, artCaption }
//   { type: "dialogue", name, text, side, portrait, color, narrator: bool }
function _newMovie(name) {
    return {
        id:       "movie_" + Date.now() + "_" + Math.floor(Math.random() * 9999),
        name:     name || "Movie",
        enabled:  true,
        items:    [],            // array of cinematic items (fade/title/art/dialogue)
        // Per-movie playback options (read by the playback pipeline).
        letterbox:     true,
        typewriterCps: 0,       // 0 = instant text (no typewriter effect)
        // (legacy) flat fadeMs/fadeColor used as defaults when "fade" items
        // omit their own; not strictly required but kept for convenience.
        fadeMs:        1200,
        fadeColor:     "#000000"
    };
}

// Convert the legacy storyIntro shape into a "movies[0]" entry. Order:
// fade-out (start black) → title → art → dialogue → fade-in.
function _movieFromLegacyIntro(intro, name) {
    const m = _newMovie(name || "Intro");
    m.enabled       = intro.enabled !== false;
    m.letterbox     = intro.letterbox !== false;
    m.typewriterCps = (typeof intro.typewriterCps === "number") ? intro.typewriterCps : 0;
    m.fadeMs        = intro.fadeMs || 1200;
    m.fadeColor     = intro.fadeColor || "#000000";

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

// Play a movie with the StoryPresentation API. Used by both the boot intro
// and the play_movie action.
async function _playMovie(movie) {
    if (!movie || !Array.isArray(movie.items) || movie.items.length === 0) return;
    if (!window.StoryPresentation) return;
    if (movie.enabled === false) return;
    rt.storyPlaying = true;

    // ── Default fade settings for auto-wrapping ──────────────────────────────
    const _dfColor = movie.fadeColor || "#000000";
    const _dfOutMs = movie.fadeMs   || 800;   // fade-to-black before each art
    const _dfInMs  = movie.fadeMs   || 1000;  // fade-from-black after each art

    // ── Helper: peek at the next ENABLED item ────────────────────────────────
    const _nextEnabled = (fromIdx) => {
        for (let k = fromIdx + 1; k < movie.items.length; k++) {
            const nx = movie.items[k];
            if (nx && nx.enabled !== false) return nx;
        }
        return null;
    };

    // ── Track whether the screen is currently faded-out (black) ─────────────
    let _screenBlack = false;

    try {
        for (let i = 0; i < movie.items.length; i++) {
            const it = movie.items[i];
            if (!it || it.enabled === false) continue;
            try {
                if (it.type === "fade") {
                    // ── Explicit fade item ──────────────────────────────────────
                    if ((it.direction || "out") === "out") {
                        await window.StoryPresentation.fadeOut(
                            it.fadeMs || 0, it.fadeColor || _dfColor);
                        _screenBlack = true;
                    } else {
                        await window.StoryPresentation.fadeIn(
                            it.fadeMs || _dfInMs,
                            it.fadeColor || _dfColor);
                        _screenBlack = false;
                    }

                } else if (it.type === "title" && it.title) {
                    // ── Title card ─────────────────────────────────────────────
                    await window.StoryPresentation.showTitle({
                        title:    it.title,
                        subtitle: it.subtitle || "",
                        ms:       it.ms || 3500
                    });

                } else if (it.type === "art" && it.art) {
                    // ── Art card — auto fade-out BEFORE, fade-in AFTER ──────────
                    //
                    // Every art transition passes through black so images never
                    // hard-cut to each other or to the game world.
                    //
                    // 1. Pre-fade: go black if we are not already
                    if (!_screenBlack) {
                        await window.StoryPresentation.fadeOut(_dfOutMs, _dfColor);
                        _screenBlack = true;
                    }

                    // 2. Fade-IN to reveal the art
                    await window.StoryPresentation.fadeIn(_dfInMs, _dfColor);
                    _screenBlack = false;

                    // 3. Show the art (blocks until dismissed or auto-closed)
                    await window.StoryPresentation.showArt(it.art, {
                        ms:       (typeof it.artMs === "number") ? it.artMs : 5000,
                        kenburns: !!it.kenburns,
                        caption:  it.artCaption || ""
                    });

                    // 4. Post-fade: always return to black after art closes
                    //    so there is never a hard-cut to the next item.
                    await window.StoryPresentation.fadeOut(_dfOutMs, _dfColor);
                    _screenBlack = true;

                    // 5. If the next item is dialogue (not art), lift the black
                    //    now so dialogue appears over the world, not darkness —
                    //    unless an explicit fade-in is coming right after.
                    const _next = _nextEnabled(i);
                    if (_next && _next.type === "dialogue") {
                        await window.StoryPresentation.fadeIn(_dfInMs, _dfColor);
                        _screenBlack = false;
                    }

                } else if (it.type === "dialogue") {
                    // ── Dialogue line ──────────────────────────────────────────
                    // If the screen is still black when we reach dialogue,
                    // fade it in so the player can see the world behind the card.
                    if (_screenBlack) {
                        await window.StoryPresentation.fadeIn(_dfInMs, _dfColor);
                        _screenBlack = false;
                    }
                    await window.StoryPresentation.showDialogue([it], {
                        letterbox:     movie.letterbox !== false,
                        typewriterCps: (typeof movie.typewriterCps === "number") ? movie.typewriterCps : 0,
                        autoAdvanceMs: (typeof it.autoAdvanceMs   === "number") ? it.autoAdvanceMs
                                     : (typeof movie.autoAdvanceMs === "number") ? movie.autoAdvanceMs : 0
                    });
                }
            } catch (e) {
                console.warn("[ScenarioTriggers] _playMovie item failed:", it, e);
            }
        }

        // ── End of movie: lift any residual black screen ─────────────────────
        if (_screenBlack) {
            try {
                await window.StoryPresentation.fadeIn(_dfInMs, _dfColor);
            } catch (e) {
                console.warn("[ScenarioTriggers] _playMovie end-fade-in failed:", e);
            }
        }
    } finally {
        rt.storyPlaying = false;
    }
}

function _ensureScenarioFields(s) {
    if (!Array.isArray(s.triggers))       s.triggers       = [];
    if (!Array.isArray(s.importantNpcs))  s.importantNpcs  = [];
    if (!s.playerSetup)   s.playerSetup   = {
        x: null, y: null, faction: "Player", troops: 20, gold: 500,
        food: 100, hp: 200, maxHealth: 200, enemies: ["Bandits"], roster: []
    };
    if (!s.storyIntro)    s.storyIntro    = {
        enabled: false, fadeMs: 1200, fadeColor: "#000000",
        titleCard: { title: "", subtitle: "", ms: 3500 },
        art: "", artMs: 5000, kenburns: false,
        lines: [], letterbox: true, typewriterCps: 40
    };

    // ── Step 4: Movies array. Migrates legacy storyIntro → movies[0]. ───────
    // A "movie" is an ordered sequence of cinematics: fades, title cards,
    // art cards, and dialogue lines, all interleaved. The boot movie is
    // movies[0] (named "Intro" by convention). Other movies are triggered
    // explicitly via the play_movie action, so a scenario can have any
    // number of cutscenes that fire mid-game.
    if (!Array.isArray(s.movies) || s.movies.length === 0) {
        // Build movie #0 from the legacy storyIntro fields. We preserve the
        // top-level storyIntro for any code/scenario module that still reads
        // it (back-compat); but the editor now writes to movies[0] instead.
        const intro = s.storyIntro || {};
        s.movies = [_movieFromLegacyIntro(intro, "Intro")];
    }
    if (!s.scenarioVars)  s.scenarioVars  = {};
    if (!s.initialDiplomacy) s.initialDiplomacy = {};
    if (!s.winLose)       s.winLose       = {
        winRules: [],
        loseRules: []
    };
    if (!s.timeline)      s.timeline      = [];
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ STYLE INJECTION                                                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _injectEditorCss() {
    if (document.getElementById("st-editor-css")) return;
    const style = document.createElement("style");
    style.id = "st-editor-css";
    style.textContent = `
        .st-editor-root {
            position: fixed; inset: 0;
            background: #1a1f2a;
            z-index: 16000;
            font-family: Tahoma, Verdana, sans-serif;
            font-size: 12px;
            color: #cfd8dc;
            display: flex; flex-direction: column;
        }
        .st-editor-bar {
            height: 38px;
            background: linear-gradient(to bottom, #3a5475, #1e2d40);
            display: flex; align-items: stretch;
            border-bottom: 1px solid #4a6680;
            user-select: none;
        }
        .st-editor-bar .st-tab {
            padding: 0 14px;
            display: flex; align-items: center;
            cursor: pointer;
            color: #cfd8dc;
            font-weight: bold;
            border-right: 1px solid rgba(0,0,0,0.3);
            font-size: 12px;
            letter-spacing: 0.4px;
        }
        .st-editor-bar .st-tab:hover { background: rgba(255,255,255,0.06); color: #fff; }
        .st-editor-bar .st-tab.active {
            background: #1a1f2a;
            color: #f5d76e;
            border-bottom: 2px solid #f5d76e;
        }
        .st-editor-bar .st-spacer { flex: 1; }
        .st-editor-bar .st-close {
            padding: 0 16px;
            background: #4a1515; color: #ffcccc;
            font-weight: bold; cursor: pointer;
            display: flex; align-items: center;
            border: none;
        }
        .st-editor-bar .st-close:hover { background: #6a2020; color: #fff; }

        .st-editor-body {
            flex: 1;
            overflow: auto;
            padding: 16px;
            background: #1a1f2a;
        }

        .st-editor-body fieldset {
            border: 1px solid #4a8fa8;
            margin: 0 0 14px 0;
            padding: 12px;
        }
        .st-editor-body legend {
            color: #f5d76e;
            font-weight: bold;
            padding: 0 6px;
        }

        .st-editor-body label {
            display: inline-block;
            margin: 4px 12px 4px 0;
            color: #cfd8dc;
        }
        .st-editor-body input[type=text],
        .st-editor-body input[type=number],
        .st-editor-body select,
        .st-editor-body textarea {
            background: #262e3a;
            color: #cfd8dc;
            border: 1px solid #4a6680;
            padding: 4px 6px;
            font-family: Tahoma, Verdana, sans-serif;
            font-size: 12px;
        }
        .st-editor-body textarea {
            font-family: monospace;
            width: 100%;
        }
        .st-editor-body input[type=color] {
            background: none; border: 1px solid #4a6680; vertical-align: middle;
            width: 36px; height: 22px; padding: 0;
        }

        .st-btn {
            background: #1a3a5c; color: #cfd8dc;
            border: 1px solid #4a8fa8;
            padding: 5px 10px;
            cursor: pointer;
            font-family: Tahoma, Verdana, sans-serif;
            font-size: 12px;
        }
        .st-btn:hover { background: #2a5a8c; color: #fff; }
        .st-btn.danger { background: #4a1515; color: #ffcccc; border-color: #6a2020; }
        .st-btn.danger:hover { background: #6a2020; color: #fff; }
        .st-btn.primary { background: #1a5a2c; border-color: #4aaa4a; color: #b8ffb8; }
        .st-btn.primary:hover { background: #2a7a3c; color: #fff; }

        .st-trig-layout {
            display: grid;
            grid-template-columns: 280px 1fr;
            gap: 14px;
            min-height: 560px;
        }
        .st-trig-list {
            background: #232a36;
            border: 1px solid #4a6680;
            padding: 8px;
            max-height: 75vh;
            overflow-y: auto;
        }
        .st-trig-list-item {
            padding: 6px 8px;
            margin: 2px 0;
            border: 1px solid transparent;
            cursor: pointer;
            border-radius: 2px;
        }
        .st-trig-list-item:hover  { background: #2a3445; }
        .st-trig-list-item.active { background: #2a4a6c; border-color: #4a8fa8; color: #fff; }
        .st-trig-list-item.disabled { opacity: 0.45; font-style: italic; }
        .st-trig-list-item .st-fired { color: #4caf50; font-size: 10px; }

        .st-cond-row, .st-action-row {
            background: #262e3a;
            border: 1px solid #3a5475;
            padding: 8px;
            margin: 6px 0;
        }
        .st-cond-row .st-row-head, .st-action-row .st-row-head {
            display: flex; gap: 8px; align-items: center;
            margin-bottom: 6px;
        }
        .st-cond-row .st-row-title, .st-action-row .st-row-title {
            color: #f5d76e; font-weight: bold;
        }
        .st-row-fields {
            display: flex; flex-wrap: wrap; gap: 8px;
        }
        .st-row-fields > .st-field {
            display: flex; flex-direction: column; gap: 2px;
            font-size: 11px;
        }
        .st-row-fields > .st-field label { font-size: 11px; color: #8aa; margin: 0; }

        .st-section-title {
            color: #f5d76e; font-size: 14px; font-weight: bold;
            margin: 16px 0 6px 0;
            border-bottom: 1px dashed #4a6680;
            padding-bottom: 3px;
        }

        .st-help h3 { color: #f5d76e; margin-top: 18px; }
        .st-help table { border-collapse: collapse; width: 100%; }
        .st-help th, .st-help td {
            text-align: left; padding: 4px 8px;
            border-bottom: 1px solid #3a4456;
            vertical-align: top;
        }
        .st-help th { color: #f5d76e; font-weight: bold; }
        .st-help code { color: #88ccff; }

        .st-dialogue-line-card {
            background: #2c2418;
            border: 1px solid #5a4220;
            padding: 8px;
            margin: 4px 0;
        }

        .st-npc-card {
            background: #232a36;
            border: 1px solid #4a6680;
            padding: 8px;
            margin: 6px 0;
        }
        .st-portrait-thumb {
            width: 64px; height: 64px;
            border: 2px solid #5a4220;
            background: #1a1208 center/cover no-repeat;
            display: inline-block; vertical-align: middle;
        }

        @media (max-width: 720px) {
            .st-trig-layout { grid-template-columns: 1fr; }
            .st-editor-bar .st-tab { padding: 0 8px; font-size: 11px; }
        }
    `;
    document.head.appendChild(style);
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ CHROME — Tabs, Close, Body container                                     ║
// ╚══════════════════════════════════════════════════════════════════════════╝
const TABS = ["Story", "Player", "NPCs", "Diplomacy", "Triggers", "Win/Lose", "Timeline", "Code Export", "Help"];

function _buildEditorChrome(root) {
    root.innerHTML = `
        <div class="st-editor-bar">
            ${TABS.map(t => `<div class="st-tab" data-tab="${t}">${t}</div>`).join("")}
            <div class="st-spacer"></div>
            <button class="st-close" id="st-close-btn">✕ Close</button>
        </div>
        <div class="st-editor-body" id="st-editor-body"></div>
    `;
    root.querySelectorAll(".st-tab").forEach(el => {
        el.addEventListener("click", () => _switchTab(el.dataset.tab));
    });
    root.querySelector("#st-close-btn").addEventListener("click", _closeEditor);
}

function _closeEditor() {
    if (!editorState) return;
    if (editorState.root && editorState.root.parentNode) {
        editorState.root.parentNode.removeChild(editorState.root);
    }
    editorState = null;
}

function _switchTab(name) {
    if (!editorState) return;
    editorState.currentTab = name;
    editorState.root.querySelectorAll(".st-tab").forEach(t =>
        t.classList.toggle("active", t.dataset.tab === name));

    const body = editorState.root.querySelector("#st-editor-body");
    body.innerHTML = "";
    switch (name) {
        case "Story":      _renderStoryTab(body); break;
        case "Player":     _renderPlayerTab(body); break;
        case "NPCs":       _renderNpcsTab(body); break;
        case "Diplomacy":  _renderDiplomacyTab(body); break;
        case "Triggers":   _renderTriggersTab(body); break;
        case "Win/Lose":   _renderWinLoseTab(body); break;
        case "Timeline":   _renderTimelineTab(body); break;
        case "Code Export": _renderExportTab(body); break;
        case "Help":       _renderHelpTab(body); break;
    }
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ DIPLOMACY TAB — set starting War / Peace / Ally between factions         ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _renderDiplomacyTab(host) {
    const s = editorState.scenario;
    if (!s.initialDiplomacy) s.initialDiplomacy = {};

    // Collect enabled factions (excluding Bandits — always at war by engine rule)
    const factions = Object.keys(s.factions || {}).filter(f =>
        s.factions[f].enabled && f !== "Bandits"
    );

    // Normalise player faction name for matching
    const isPlayer = (n) => n === "Player" || n === "Player's Kingdom" ||
                            (typeof window !== "undefined" && window.PlayerFaction && window.PlayerFaction.is(n));

    // Helper: get saved relation for pair (a, b), defaulting to Peace
    const getRel = (a, b) => {
        if (a === b) return "Self";
        return (s.initialDiplomacy[a] && s.initialDiplomacy[a][b]) || "Peace";
    };
    const setRel = (a, b, rel) => {
        if (!s.initialDiplomacy[a]) s.initialDiplomacy[a] = {};
        if (!s.initialDiplomacy[b]) s.initialDiplomacy[b] = {};
        s.initialDiplomacy[a][b] = rel;
        s.initialDiplomacy[b][a] = rel;
    };

    const REL_OPTIONS = ["Peace", "War", "Ally"];
    const REL_COLORS  = { "Peace": "#d4b886", "War": "#ff5252", "Ally": "#8bc34a", "Self": "#666" };

    function renderTable() {
        host.innerHTML = `
            <fieldset>
                <legend>Initial Faction Diplomacy</legend>
                <p style="color:#8aa;font-size:11px;">
                    Set the starting diplomatic relationship between every pair of factions.
                    These values are applied when the scenario loads, before any triggers run.
                    <br>• <strong style="color:#d4b886;">Peace</strong> — neutral (no combat between factions)
                    <br>• <strong style="color:#ff5252;">War</strong> — hostile (NPCs attack each other on sight)
                    <br>• <strong style="color:#8bc34a;">Ally</strong> — friendly (assist each other, won't attack)
                    <br>Click a cell to cycle through states. The matrix is symmetric — changing A↔B also changes B↔A.
                </p>
                ${factions.length < 2 ? `<p style="color:#f5d76e;">⚠ Need at least 2 non-Bandit factions to configure diplomacy. Go to the scenario editor Factions panel and enable more factions.</p>` : ""}
                <div style="overflow-x:auto;margin-top:12px;">
                <table id="diplo-table" style="border-collapse:collapse;font-size:11px;">
                    <thead>
                        <tr>
                            <th style="padding:4px 8px;text-align:right;color:#aaa;"></th>
                            ${factions.map(f => `<th style="padding:4px 6px;text-align:center;color:#cfd8dc;max-width:80px;word-break:break-word;" title="${_esc(f)}">${_esc(f.length > 12 ? f.slice(0,11)+"…" : f)}</th>`).join("")}
                        </tr>
                    </thead>
                    <tbody>
                        ${factions.map(f1 => `
                        <tr>
                            <td style="padding:4px 8px;text-align:right;color:#cfd8dc;white-space:nowrap;">${_esc(f1)}</td>
                            ${factions.map(f2 => {
                                const rel = getRel(f1, f2);
                                if (rel === "Self") {
                                    return `<td style="background:#222;text-align:center;padding:4px 6px;color:#444;">—</td>`;
                                }
                                const color = REL_COLORS[rel] || "#d4b886";
                                const pairKey = `${f1}|||${f2}`;
                                return `<td data-pair="${_esc(pairKey)}"
                                            style="text-align:center;padding:4px 6px;cursor:pointer;
                                                   background:#1c2530;color:${color};font-weight:bold;
                                                   border:1px solid #3a4456;"
                                            title="Click to cycle: Peace → War → Ally → Peace">
                                            ${rel.toUpperCase()}
                                        </td>`;
                            }).join("")}
                        </tr>`).join("")}
                    </tbody>
                </table>
                </div>
            </fieldset>

            <fieldset style="margin-top:10px;">
                <legend>Quick Presets</legend>
                <p style="color:#8aa;font-size:11px;">Apply a relationship between the Player and all other factions at once.</p>
                <button class="st-btn" id="diplo-all-peace">All Factions → Peace</button>
                <button class="st-btn danger" id="diplo-all-war">Player vs All → War</button>
                <button class="st-btn primary" id="diplo-all-ally">Player + All → Ally</button>
                <button class="st-btn" id="diplo-reset">Reset All to Default (Peace)</button>
            </fieldset>
        `;

        // Cell click: cycle relation
        const table = host.querySelector("#diplo-table");
        if (table) {
            table.addEventListener("click", e => {
                const td = e.target.closest("[data-pair]");
                if (!td) return;
                const [f1, f2] = td.dataset.pair.split("|||");
                const cur = getRel(f1, f2);
                const next = REL_OPTIONS[(REL_OPTIONS.indexOf(cur) + 1) % REL_OPTIONS.length];
                setRel(f1, f2, next);
                renderTable(); // re-render to show new state
            });
        }

        // Quick presets
        const playerFaction = factions.find(isPlayer) || factions[0];
        host.querySelector("#diplo-all-peace").onclick = () => {
            for (let i = 0; i < factions.length; i++)
                for (let j = i+1; j < factions.length; j++)
                    setRel(factions[i], factions[j], "Peace");
            renderTable();
        };
        host.querySelector("#diplo-all-war").onclick = () => {
            if (!playerFaction) return;
            factions.filter(f => f !== playerFaction).forEach(f => setRel(playerFaction, f, "War"));
            renderTable();
        };
        host.querySelector("#diplo-all-ally").onclick = () => {
            if (!playerFaction) return;
            factions.filter(f => f !== playerFaction).forEach(f => setRel(playerFaction, f, "Ally"));
            renderTable();
        };
        host.querySelector("#diplo-reset").onclick = () => {
            s.initialDiplomacy = {};
            renderTable();
        };
    }

    renderTable();
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ STORY TAB — intro art / dialogue / fade / title card                     ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _renderStoryTab(host) {
    const s = editorState.scenario;
    if (!Array.isArray(s.movies) || s.movies.length === 0) {
        s.movies = [_movieFromLegacyIntro(s.storyIntro || {}, "Intro")];
    }
    if (typeof editorState.currentMovieIdx !== "number" ||
        editorState.currentMovieIdx >= s.movies.length) {
        editorState.currentMovieIdx = 0;
    }

    host.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;
                    border-bottom:1px solid #3a4858;padding-bottom:6px;">
            <strong style="color:#f5d76e;">Movies:</strong>
            <div id="movies-tabbar" style="display:flex;gap:2px;flex-wrap:wrap;flex:1;"></div>
            <button class="st-btn primary" id="movie-add">+ Movie</button>
            <button class="st-btn"         id="movie-rename">Rename</button>
            <button class="st-btn"         id="movie-dup">Duplicate</button>
            <button class="st-btn danger"  id="movie-del">Delete</button>
        </div>
        <div id="movie-body"></div>
    `;

    function renderTabBar() {
        const bar = host.querySelector("#movies-tabbar");
        bar.innerHTML = "";
        s.movies.forEach((m, i) => {
            const btn = document.createElement("div");
            btn.dataset.idx = i;
            const active = (i === editorState.currentMovieIdx);
            btn.style.cssText = `
                padding:4px 10px;cursor:pointer;
                border:1px solid ${active ? "#f5d76e" : "#4a8fa8"};
                background:${active ? "#3a2a0a" : "#1a3a5c"};
                color:${active ? "#f5d76e" : "#cfd8dc"};
                border-radius:4px 4px 0 0;font-size:12px;font-weight:${active ? "bold" : "normal"};
                user-select:none;
            `;
            btn.textContent = (m.enabled === false ? "⊘ " : "") + (m.name || `Movie ${i+1}`);
            btn.title = `id: ${m.id}\n${m.items.length} item(s)\nClick to switch · double-click to rename`;
            btn.onclick = () => {
                editorState.currentMovieIdx = i;
                render();
            };
            btn.ondblclick = (e) => { e.stopPropagation(); renameMovie(); };
            bar.appendChild(btn);
        });
    }

    function renameMovie() {
        const m = s.movies[editorState.currentMovieIdx];
        if (!m) return;
        const nm = prompt("Movie name:", m.name || "");
        if (nm == null) return;
        m.name = nm.trim() || ("Movie " + (editorState.currentMovieIdx + 1));
        render();
    }

    host.querySelector("#movie-add").onclick = () => {
        const m = _newMovie("Movie " + (s.movies.length + 1));
        s.movies.push(m);
        editorState.currentMovieIdx = s.movies.length - 1;
        render();
    };
    host.querySelector("#movie-rename").onclick = renameMovie;
    host.querySelector("#movie-dup").onclick = () => {
        const m = s.movies[editorState.currentMovieIdx];
        if (!m) return;
        const copy = JSON.parse(JSON.stringify(m));
        copy.id   = "movie_" + Date.now() + "_" + Math.floor(Math.random() * 9999);
        copy.name = (m.name || "Movie") + " (copy)";
        s.movies.splice(editorState.currentMovieIdx + 1, 0, copy);
        editorState.currentMovieIdx++;
        render();
    };
    host.querySelector("#movie-del").onclick = () => {
        if (s.movies.length <= 1) {
            alert("At least one movie must exist. Disable it instead, or clear its items.");
            return;
        }
        const m = s.movies[editorState.currentMovieIdx];
        if (!confirm(`Delete movie "${m.name}"? This cannot be undone.`)) return;
        s.movies.splice(editorState.currentMovieIdx, 1);
        editorState.currentMovieIdx = Math.min(editorState.currentMovieIdx, s.movies.length - 1);
        render();
    };

    function render() {
        renderTabBar();
        renderBody();
    }

    function renderBody() {
        const m = s.movies[editorState.currentMovieIdx];
        const body = host.querySelector("#movie-body");
        if (!m) { body.innerHTML = "<em style='color:#8aa'>No movie selected.</em>"; return; }

        body.innerHTML = `
            <fieldset>
                <legend>${_esc(m.name)} — Settings</legend>
                <label><input type="checkbox" id="mov-enabled" ${m.enabled !== false ? "checked" : ""}> Enabled</label>
                <span style="margin-left:14px;color:#8aa;font-size:11px;">
                    Movie #0 plays at scenario start; others play via the
                    <code>play_movie</code> trigger action.
                </span>
                <div style="margin-top:8px;">
                    <label><input type="checkbox" id="mov-letterbox" ${m.letterbox !== false ? "checked" : ""}> Letterbox during dialogue</label>
                    <label style="margin-left:14px;">Typewriter cps:
                        <input type="number" id="mov-tcps" value="${m.typewriterCps || 40}" min="0" style="width:60px;">
                    </label>
                    <label style="margin-left:14px;">Default fade ms:
                        <input type="number" id="mov-fadems" value="${m.fadeMs || 1200}" min="0" style="width:80px;">
                    </label>
                    <label style="margin-left:14px;">Default fade color:
                        <input type="color" id="mov-fadecolor" value="${m.fadeColor || "#000000"}">
                    </label>
                </div>
            </fieldset>

            <fieldset>
                <legend>Items (${m.items.length}) — runs in order top → bottom</legend>
                <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
                    <button class="st-btn primary" id="mov-add-fade">+ Fade</button>
                    <button class="st-btn primary" id="mov-add-title">+ Title</button>
                    <button class="st-btn primary" id="mov-add-art">+ Art</button>
                    <button class="st-btn primary" id="mov-add-dlg">+ Dialogue</button>
                    <span style="flex:1;"></span>
                    <button class="st-btn" id="mov-test">▶ Test This Movie</button>
                </div>
                <div id="mov-items"></div>
            </fieldset>
        `;

        body.querySelector("#mov-enabled").onchange   = e => { m.enabled = e.target.checked; renderTabBar(); };
        body.querySelector("#mov-letterbox").onchange = e => { m.letterbox = e.target.checked; };
        body.querySelector("#mov-tcps").oninput       = e => { m.typewriterCps = +e.target.value || 40; };
        body.querySelector("#mov-fadems").oninput     = e => { m.fadeMs = +e.target.value || 0; };
        body.querySelector("#mov-fadecolor").oninput  = e => { m.fadeColor = e.target.value; };

        body.querySelector("#mov-add-fade").onclick  = () => addItem({ type:"fade", direction:"in", fadeMs: m.fadeMs || 1200, fadeColor: m.fadeColor || "#000000" });
        body.querySelector("#mov-add-title").onclick = () => addItem({ type:"title", title:"Chapter I", subtitle:"", ms: 3500 });
        body.querySelector("#mov-add-art").onclick   = () => addItem({ type:"art", art:"", artMs: 5000, kenburns: false, artCaption: "" });
        body.querySelector("#mov-add-dlg").onclick   = () => addItem({ type:"dialogue", name: "Narrator", text: "...", side: "left", portrait: "", color: "#d4b886", narrator: true });
        body.querySelector("#mov-test").onclick      = async () => {
            if (!window.StoryPresentation) { alert("StoryPresentation not loaded."); return; }
            await _playMovie(m);
        };

        renderItems();

        function addItem(item) {
            m.items.push(item);
            renderItems();
        }

        function renderItems() {
            const list = body.querySelector("#mov-items");
            list.innerHTML = "";
            if (m.items.length === 0) {
                list.innerHTML = '<div style="color:#666;padding:8px;">No items yet — use the buttons above to add Fade / Title / Art / Dialogue.</div>';
                return;
            }
            m.items.forEach((it, idx) => list.appendChild(buildItemCard(it, idx)));
        }

        function buildItemCard(it, idx) {
            const card = document.createElement("div");
            card.className = "st-mov-item";
            card.style.cssText = `
                border:1px solid #4a8fa8;background:#0e1a26;
                padding:6px 8px;margin:5px 0;border-radius:4px;
            `;
            const head = document.createElement("div");
            head.style.cssText = "display:flex;align-items:center;gap:6px;flex-wrap:wrap;";
            const isEnabled = it.enabled !== false;
            head.innerHTML = `
                <span style="background:#3a2a0a;color:#f5d76e;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:bold;">
                    #${idx + 1}
                </span>
                <span style="background:${_typeColor(it.type)};color:#fff;padding:1px 6px;border-radius:3px;font-size:11px;text-transform:uppercase;">
                    ${it.type}
                </span>
                <span style="flex:1;color:${isEnabled ? "#cfd8dc" : "#666"};font-style:italic;">${_typeSummary(it)}</span>
                <button class="st-btn st-mi-up"   ${idx === 0 ? "disabled" : ""} title="Move up">▲</button>
                <button class="st-btn st-mi-down" ${idx === m.items.length - 1 ? "disabled" : ""} title="Move down">▼</button>
                <button class="st-btn st-mi-dup"  title="Duplicate">⧉</button>
                <button class="st-btn st-mi-en"   title="Toggle enabled">${isEnabled ? "✓" : "○"}</button>
                <button class="st-btn danger st-mi-del" title="Delete">✕</button>
            `;
            card.appendChild(head);

            const editor = document.createElement("div");
            editor.style.cssText = "margin-top:6px;";
            editor.appendChild(_buildMovieItemEditor(it, idx, () => renderItems()));
            card.appendChild(editor);

            head.querySelector(".st-mi-up").onclick   = () => { if (idx === 0) return; [m.items[idx-1], m.items[idx]] = [m.items[idx], m.items[idx-1]]; renderItems(); };
            head.querySelector(".st-mi-down").onclick = () => { if (idx === m.items.length - 1) return; [m.items[idx+1], m.items[idx]] = [m.items[idx], m.items[idx+1]]; renderItems(); };
            head.querySelector(".st-mi-dup").onclick  = () => { m.items.splice(idx + 1, 0, JSON.parse(JSON.stringify(it))); renderItems(); };
            head.querySelector(".st-mi-en").onclick   = () => { it.enabled = (it.enabled === false); renderItems(); };
            head.querySelector(".st-mi-del").onclick  = () => { if (!confirm("Delete this item?")) return; m.items.splice(idx, 1); renderItems(); };

            return card;
        }
    }

    render();
}

function _typeColor(type) {
    return type === "fade"     ? "#5a4a2a"
         : type === "title"    ? "#3a5475"
         : type === "art"      ? "#5a2a4a"
         : type === "dialogue" ? "#2a5a3a"
         : "#444";
}
function _typeSummary(it) {
    if (it.type === "fade") return `${it.direction || "in"} · ${it.fadeMs || 0}ms · ${it.fadeColor || "#000"}`;
    if (it.type === "title") return `"${it.title || ""}"${it.subtitle ? " — " + it.subtitle : ""} · ${it.ms || 0}ms`;
    if (it.type === "art") return `${it.art ? "[image]" : "(no image)"} · ${it.artMs || 0}ms${it.kenburns ? " · ken-burns" : ""}${it.artCaption ? " · captioned" : ""}`;
    if (it.type === "dialogue") {
        const speaker = it.narrator ? "Narrator" : (it.name || "?");
        const text    = (it.text || "").slice(0, 60);
        return `${speaker} (${it.side || "left"}): "${text}${(it.text || "").length > 60 ? "…" : ""}"`;
    }
    return "(unknown type)";
}

// Build the editor body for one movie item, dispatching by type.
function _buildMovieItemEditor(it, idx, onChange) {
    const wrap = document.createElement("div");
    if (it.type === "fade") {
        wrap.innerHTML = `
            <label>Direction:
                <select class="mi-dir">
                    <option value="in"  ${it.direction === "in"  ? "selected" : ""}>Fade In  (clear from color)</option>
                    <option value="out" ${it.direction === "out" ? "selected" : ""}>Fade Out (to color)</option>
                </select>
            </label>
            <label style="margin-left:10px;">Duration (ms):
                <input type="number" class="mi-fadems" value="${it.fadeMs || 0}" style="width:80px;" min="0">
            </label>
            <label style="margin-left:10px;">Color:
                <input type="color" class="mi-fadecolor" value="${it.fadeColor || "#000000"}">
            </label>
        `;
        wrap.querySelector(".mi-dir").onchange       = e => { it.direction = e.target.value; onChange(); };
        wrap.querySelector(".mi-fadems").oninput     = e => { it.fadeMs = +e.target.value || 0; onChange(); };
        wrap.querySelector(".mi-fadecolor").oninput  = e => { it.fadeColor = e.target.value; onChange(); };
    } else if (it.type === "title") {
        wrap.innerHTML = `
            <label>Title:    <input type="text" class="mi-title"    value="${_esc(it.title || "")}"    style="width:300px;"></label>
            <label>Subtitle: <input type="text" class="mi-subtitle" value="${_esc(it.subtitle || "")}" style="width:300px;"></label>
            <label>Hold ms:  <input type="number" class="mi-titlems" value="${it.ms || 3500}" style="width:80px;" min="0"></label>
        `;
        wrap.querySelector(".mi-title").oninput    = e => { it.title = e.target.value; onChange(); };
        wrap.querySelector(".mi-subtitle").oninput = e => { it.subtitle = e.target.value; onChange(); };
        wrap.querySelector(".mi-titlems").oninput  = e => { it.ms = +e.target.value || 0; onChange(); };
    } else if (it.type === "art") {
        wrap.innerHTML = `
            <div>
                <input type="file" class="mi-art-file" accept="image/*">
                <button class="st-btn mi-art-clear">Clear</button>
                <span class="mi-art-preview-wrap" style="margin-left:8px;"></span>
            </div>
            <div style="margin-top:6px;">
                <label>Hold ms (0 = wait for click):
                    <input type="number" class="mi-artms" value="${it.artMs || 5000}" style="width:80px;" min="0">
                </label>
                <label style="margin-left:10px;">
                    <input type="checkbox" class="mi-kenburns" ${it.kenburns ? "checked" : ""}> Ken-Burns zoom
                </label>
            </div>
            <div style="margin-top:6px;">
                <label>Caption (optional):</label>
                <textarea class="mi-artcaption" rows="2" style="width:99%;">${_esc(it.artCaption || "")}</textarea>
            </div>
        `;
        const setPreview = () => {
            wrap.querySelector(".mi-art-preview-wrap").innerHTML = it.art
                ? `<img src="${it.art}" style="max-width:240px;max-height:140px;border:2px solid #5a4220;background:#000;vertical-align:middle;">`
                : `<span style="color:#666;">(no art)</span>`;
        };
        setPreview();
        wrap.querySelector(".mi-art-file").onchange = e => {
            const f = e.target.files[0];
            if (!f) return;
            _readFileAsDataURL(f, (url) => { it.art = url; setPreview(); onChange(); });
        };
        wrap.querySelector(".mi-art-clear").onclick    = () => { it.art = ""; setPreview(); onChange(); };
        wrap.querySelector(".mi-artms").oninput        = e => { it.artMs = +e.target.value || 0; onChange(); };
        wrap.querySelector(".mi-kenburns").onchange    = e => { it.kenburns = e.target.checked; onChange(); };
        wrap.querySelector(".mi-artcaption").oninput   = e => { it.artCaption = e.target.value; onChange(); };
    } else if (it.type === "dialogue") {
        wrap.innerHTML = `
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <label><input type="checkbox" class="mi-narr" ${it.narrator ? "checked" : ""}> Narrator (top of screen)</label>
                <label>Side:
                    <select class="mi-side">
                        <option value="left"  ${it.side !== "right" ? "selected" : ""}>Left</option>
                        <option value="right" ${it.side === "right" ? "selected" : ""}>Right</option>
                    </select>
                </label>
                <label>Speaker:
                    <input type="text" class="mi-name" value="${_esc(it.name || "")}" style="width:140px;">
                </label>
                <label>Color:
                    <input type="color" class="mi-color" value="${it.color || "#8a6a3a"}">
                </label>
                <label>Portrait:
                    <input type="file" class="mi-portrait-file" accept="image/*" style="width:140px;">
                </label>
                <span class="mi-portrait-thumb" style="display:inline-block;width:36px;height:36px;border:1px solid #5a4220;background:#1a1208 center/cover no-repeat;${it.portrait ? `background-image:url('${it.portrait}');` : ""}"></span>
            </div>
            <div style="margin-top:6px;">
                <textarea class="mi-text" rows="2" style="width:99%;">${_esc(it.text || "")}</textarea>
            </div>
        `;
        wrap.querySelector(".mi-narr").onchange  = e => { it.narrator = e.target.checked; onChange(); };
        wrap.querySelector(".mi-side").onchange  = e => { it.side = e.target.value; onChange(); };
        wrap.querySelector(".mi-name").oninput   = e => { it.name = e.target.value; onChange(); };
        wrap.querySelector(".mi-color").oninput  = e => { it.color = e.target.value; onChange(); };
        wrap.querySelector(".mi-text").oninput   = e => { it.text = e.target.value; onChange(); };
        wrap.querySelector(".mi-portrait-file").onchange = e => {
            const f = e.target.files[0];
            if (!f) return;
            _readFileAsDataURL(f, (url) => {
                it.portrait = url;
                wrap.querySelector(".mi-portrait-thumb").style.backgroundImage = `url('${url}')`;
                onChange();
            });
        };
    }
    return wrap;
}

// ── Dialogue line editor card (used in Story tab AND show_dialogue actions) ─
function _buildDialogueLineEditor(line, idx, onDelete) {
    const card = document.createElement("div");
    card.className = "st-dialogue-line-card";
    card.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <strong style="color:#f5d76e;">Line ${idx + 1}</strong>
            <label>Side:
                <select class="st-dl-side">
                    <option value="left"  ${line.side !== "right" ? "selected" : ""}>Left</option>
                    <option value="right" ${line.side === "right" ? "selected" : ""}>Right</option>
                </select>
            </label>
            <label>Speaker name:
                <input type="text" class="st-dl-name" value="${_esc(line.name || "")}" style="width:140px;">
            </label>
            <label>Portrait:
                <input type="file" class="st-dl-portrait-file" accept="image/*" style="width:140px;">
            </label>
            <span class="st-dl-portrait-thumb" style="display:inline-block;width:36px;height:36px;border:1px solid #5a4220;background:#1a1208 center/cover no-repeat;${line.portrait ? `background-image:url('${line.portrait}');` : ""}"></span>
            <label>Color:
                <input type="color" class="st-dl-color" value="${line.color || "#8a6a3a"}">
            </label>
            <button class="st-btn danger st-dl-del">Delete</button>
        </div>
        <div style="margin-top:6px;">
            <textarea class="st-dl-text" rows="2" style="width:99%;">${_esc(line.text || "")}</textarea>
        </div>
    `;

    const sync = () => {
        line.side = card.querySelector(".st-dl-side").value;
        line.name = card.querySelector(".st-dl-name").value;
        line.text = card.querySelector(".st-dl-text").value;
        line.color = card.querySelector(".st-dl-color").value;
    };
    card.querySelector(".st-dl-side").addEventListener("change", sync);
    card.querySelector(".st-dl-name").addEventListener("input", sync);
    card.querySelector(".st-dl-text").addEventListener("input", sync);
    card.querySelector(".st-dl-color").addEventListener("input", sync);
    card.querySelector(".st-dl-portrait-file").addEventListener("change", e => {
        const f = e.target.files[0];
        if (!f) return;
        _readFileAsDataURL(f, (url) => {
            line.portrait = url;
            const thumb = card.querySelector(".st-dl-portrait-thumb");
            thumb.style.backgroundImage = `url('${url}')`;
        });
    });
    card.querySelector(".st-dl-del").addEventListener("click", onDelete);
    return card;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ PLAYER TAB                                                               ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _renderPlayerTab(host) {
    const s = editorState.scenario;
    const ps = s.playerSetup;

    // Live world dimensions for human-readable hints
    const W = window.WORLD_WIDTH_sandbox  || 4000;
    const H = window.WORLD_HEIGHT_sandbox || 3000;

    host.innerHTML = `
        <fieldset>
            <legend>Player Starting Setup</legend>
            <p style="color:#8aa;">
                These values are applied BEFORE any triggers fire. They override the engine
                defaults set in <code>sandboxmode_update.js</code>.
                World dimensions: ${W} × ${H} (use these for x/y).
            </p>
            <div class="st-row-fields">
                <div class="st-field"><label>Faction</label>${_factionSelectHTML("ps-faction", ps.faction || "Player")}</div>
                <div class="st-field"><label>Start X</label><input id="ps-x" type="number" value="${ps.x ?? ""}" placeholder="(default: city)" style="width:90px;"></div>
                <div class="st-field"><label>Start Y</label><input id="ps-y" type="number" value="${ps.y ?? ""}" placeholder="(default: city)" style="width:90px;"></div>
                <div class="st-field"><label>Troops</label><input id="ps-troops" type="number" value="${ps.troops ?? 20}" style="width:80px;"></div>
                <div class="st-field"><label>Gold</label><input id="ps-gold" type="number" value="${ps.gold ?? 500}" style="width:80px;"></div>
                <div class="st-field"><label>Food</label><input id="ps-food" type="number" value="${ps.food ?? 100}" style="width:80px;"></div>
                <div class="st-field"><label>HP</label><input id="ps-hp" type="number" value="${ps.hp ?? 200}" style="width:80px;"></div>
                <div class="st-field"><label>Max HP</label><input id="ps-maxhp" type="number" value="${ps.maxHealth ?? 200}" style="width:80px;"></div>
            </div>
        </fieldset>

        <fieldset>
            <legend>Initial Enemies</legend>
            <p style="color:#8aa;">Comma-separated faction names. The player begins at war with these factions.</p>
            <input id="ps-enemies" type="text" value="${_esc((ps.enemies || []).join(", "))}" style="width:99%;">
        </fieldset>

        <fieldset>
            <legend>Starting Roster</legend>
            <p style="color:#8aa;">
                Comma-separated unit-type names from the engine's UnitRoster. Each entry becomes
                one troop. e.g. <code>Militia, Militia, Spearman, Crossbowman, Crossbowman</code>.
                Leave blank to use the engine default (20 Militia).
            </p>
            <textarea id="ps-roster" rows="4" style="width:99%;">${_esc(_rosterToCsv(ps.roster))}</textarea>
            <div style="margin-top:6px;">
                <button class="st-btn" id="ps-quick-mil">+10 Militia</button>
                <button class="st-btn" id="ps-quick-spear">+10 Spearman</button>
                <button class="st-btn" id="ps-quick-cb">+10 Crossbowman</button>
                <button class="st-btn" id="ps-quick-cav">+10 Lancer</button>
                <button class="st-btn danger" id="ps-quick-clear">Clear</button>
            </div>
        </fieldset>

        <button class="st-btn primary" id="ps-save">Apply Player Setup</button>
    `;

    function append(csv) {
        const ta = host.querySelector("#ps-roster");
        const cur = ta.value.trim();
        ta.value = cur ? cur + ", " + csv : csv;
    }
    host.querySelector("#ps-quick-mil").onclick   = () => append(Array(10).fill("Militia").join(", "));
    host.querySelector("#ps-quick-spear").onclick = () => append(Array(10).fill("Spearman").join(", "));
    host.querySelector("#ps-quick-cb").onclick    = () => append(Array(10).fill("Crossbowman").join(", "));
    host.querySelector("#ps-quick-cav").onclick   = () => append(Array(10).fill("Lancer").join(", "));
    host.querySelector("#ps-quick-clear").onclick = () => { host.querySelector("#ps-roster").value = ""; };

    host.querySelector("#ps-save").onclick = () => {
        ps.faction   = host.querySelector("#ps-faction").value;
        ps.x         = _numOrNull(host.querySelector("#ps-x").value);
        ps.y         = _numOrNull(host.querySelector("#ps-y").value);
        ps.troops    = +host.querySelector("#ps-troops").value || 0;
        ps.gold      = +host.querySelector("#ps-gold").value   || 0;
        ps.food      = +host.querySelector("#ps-food").value   || 0;
        ps.hp        = +host.querySelector("#ps-hp").value     || 0;
        ps.maxHealth = +host.querySelector("#ps-maxhp").value  || 0;
        ps.enemies   = host.querySelector("#ps-enemies").value
                            .split(",").map(s => s.trim()).filter(Boolean);
        ps.roster    = host.querySelector("#ps-roster").value
                            .split(",").map(s => s.trim()).filter(Boolean);
        alert("Player setup saved.");
    };
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ NPCS TAB                                                                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _renderNpcsTab(host) {
    const s = editorState.scenario;

    host.innerHTML = `
        <p style="color:#8aa;">
            Important NPCs are named characters with portraits and stats.
            They aren't placed on the map at scenario start — instead, you
            <em>spawn</em> them via the <code>spawn_important_npc</code> action
            in a trigger (e.g. when the player enters a region, or after a dialogue ends).
        </p>
        <div id="npc-list"></div>
        <button class="st-btn primary" id="npc-add">+ Add Important NPC</button>
    `;

    function refresh() {
        const list = host.querySelector("#npc-list");
        list.innerHTML = "";
        (s.importantNpcs || []).forEach((npc, idx) => {
            list.appendChild(_buildNpcCard(npc, idx, refresh));
        });
    }
    refresh();

    host.querySelector("#npc-add").onclick = () => {
        s.importantNpcs.push({
            id: "npc_" + Math.random().toString(36).substr(2, 6),
            name: "New NPC",
            faction: "Bandits",
            x: 2000, y: 1500,
            targetX: 2000, targetY: 1500,
            role: "Military",
            troops: 30,
            roster: "",
            hp: 200, attack: 15, defense: 10, armor: 10,
            gold: 0, food: 100,
            portraitUrl: ""
        });
        refresh();
    };
}

function _buildNpcCard(npc, idx, refreshFn) {
    const card = document.createElement("div");
    card.className = "st-npc-card";
    card.innerHTML = `
        <div id="npc-header-${idx}" style="font-weight:bold;color:#8fc88f;font-size:13px;margin-bottom:8px;
                    border-bottom:1px solid #2a4a2a;padding-bottom:5px;">
            📜 ${_esc(npc.name || "Story NPC")}
            <span style="color:#5a8a5a;font-weight:normal;font-size:11px;margin-left:8px;">
                id: ${_esc(npc.id)}
            </span>
        </div>
        <div style="display:flex;gap:10px;align-items:flex-start;">
            <div>
                <div class="st-portrait-thumb" id="npc-portrait-${idx}"
                     style="${npc.portraitUrl ? `background-image:url('${npc.portraitUrl}');` : ""}"></div>
                <input type="file" id="npc-portrait-file-${idx}" accept="image/*" style="margin-top:4px;width:120px;">
            </div>
            <div style="flex:1;">
                <div class="st-row-fields">
                    <div class="st-field"><label>ID (unique)</label><input id="npc-id-${idx}" type="text" value="${_esc(npc.id)}" style="width:120px;"></div>
                    <div class="st-field"><label>Display Name</label><input id="npc-name-${idx}" type="text" value="${_esc(npc.name)}" style="width:160px;"></div>
                    <div class="st-field"><label>Faction</label>${_factionSelectHTML(`npc-faction-${idx}`, npc.faction)}</div>
                    <div class="st-field"><label>Role</label>
                        <select id="npc-role-${idx}">
                            ${["Military","Patrol","Civilian","Commerce","Bandit"].map(r =>
                                `<option value="${r}" ${npc.role === r ? "selected" : ""}>${r}</option>`).join("")}
                        </select>
                    </div>
                    <div class="st-field"><label>Spawn X</label><input id="npc-x-${idx}" type="number" value="${npc.x ?? 2000}" style="width:80px;"></div>
                    <div class="st-field"><label>Spawn Y</label><input id="npc-y-${idx}" type="number" value="${npc.y ?? 1500}" style="width:80px;"></div>
                    <div class="st-field"><label>Move-To X</label><input id="npc-tx-${idx}" type="number" value="${npc.targetX ?? npc.x ?? 2000}" style="width:80px;"></div>
                    <div class="st-field"><label>Move-To Y</label><input id="npc-ty-${idx}" type="number" value="${npc.targetY ?? npc.y ?? 1500}" style="width:80px;"></div>
                </div>
                <div class="st-row-fields" style="margin-top:6px;">
                    <div class="st-field"><label>Troops (when no roster)</label><input id="npc-troops-${idx}" type="number" value="${npc.troops ?? 30}" style="width:80px;"></div>
                    <div class="st-field"><label>HP</label><input id="npc-hp-${idx}" type="number" value="${npc.hp ?? 200}" style="width:70px;"></div>
                    <div class="st-field"><label>Attack</label><input id="npc-atk-${idx}" type="number" value="${npc.attack ?? 15}" style="width:70px;"></div>
                    <div class="st-field"><label>Defense</label><input id="npc-def-${idx}" type="number" value="${npc.defense ?? 10}" style="width:70px;"></div>
                    <div class="st-field"><label>Armor</label><input id="npc-arm-${idx}" type="number" value="${npc.armor ?? 10}" style="width:70px;"></div>
                    <div class="st-field"><label>Gold</label><input id="npc-gold-${idx}" type="number" value="${npc.gold ?? 0}" style="width:80px;"></div>
                    <div class="st-field"><label>Food</label><input id="npc-food-${idx}" type="number" value="${npc.food ?? 100}" style="width:80px;"></div>
                </div>
                <div style="margin-top:6px;">
                    <label style="display:block;color:#8aa;font-size:11px;">
                        Roster (csv unit-types — overrides "Troops" count). Leave blank to use Troops×Militia.
                    </label>
                    <textarea id="npc-roster-${idx}" rows="2" style="width:99%;font-family:monospace;font-size:11px;">${_esc(npc.roster || "")}</textarea>
                </div>
                <div style="margin-top:8px;">
                    <button class="st-btn" id="npc-save-${idx}">Save</button>
                    <button class="st-btn danger" id="npc-del-${idx}">Delete</button>
                </div>
            </div>
        </div>
    `;

    card.querySelector(`#npc-portrait-file-${idx}`).addEventListener("change", e => {
        const f = e.target.files[0];
        if (!f) return;
        _readFileAsDataURL(f, (url) => {
            npc.portraitUrl = url;
            card.querySelector(`#npc-portrait-${idx}`).style.backgroundImage = `url('${url}')`;
        });
    });
    card.querySelector(`#npc-save-${idx}`).onclick = () => {
        npc.id      = card.querySelector(`#npc-id-${idx}`).value.trim() || npc.id;
        npc.name    = card.querySelector(`#npc-name-${idx}`).value;
        npc.faction = card.querySelector(`#npc-faction-${idx}`).value;
        npc.role    = card.querySelector(`#npc-role-${idx}`).value;
        npc.x       = +card.querySelector(`#npc-x-${idx}`).value;
        npc.y       = +card.querySelector(`#npc-y-${idx}`).value;
        npc.targetX = +card.querySelector(`#npc-tx-${idx}`).value;
        npc.targetY = +card.querySelector(`#npc-ty-${idx}`).value;
        npc.troops  = +card.querySelector(`#npc-troops-${idx}`).value;
        npc.hp      = +card.querySelector(`#npc-hp-${idx}`).value;
        npc.attack  = +card.querySelector(`#npc-atk-${idx}`).value;
        npc.defense = +card.querySelector(`#npc-def-${idx}`).value;
        npc.armor   = +card.querySelector(`#npc-arm-${idx}`).value;
        npc.gold    = +card.querySelector(`#npc-gold-${idx}`).value;
        npc.food    = +card.querySelector(`#npc-food-${idx}`).value;
        npc.roster  = card.querySelector(`#npc-roster-${idx}`).value.trim();
        // Refresh the 📜 header to reflect the updated name/id
        const hdr = card.querySelector(`#npc-header-${idx}`);
        if (hdr) hdr.innerHTML = `📜 ${_esc(npc.name || "Story NPC")} <span style="color:#5a8a5a;font-weight:normal;font-size:11px;margin-left:8px;">id: ${_esc(npc.id)}</span>`;
        alert("NPC saved: " + npc.name);
    };
    card.querySelector(`#npc-del-${idx}`).onclick = () => {
        if (!confirm("Delete '" + npc.name + "'?")) return;
        editorState.scenario.importantNpcs.splice(idx, 1);
        refreshFn();
    };

    return card;
}
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ TRIGGERS TAB                                                             ║
// ║                                                                          ║
// ║   Two-pane layout:                                                       ║
// ║     left:  list of all triggers (clickable; reorder buttons)             ║
// ║     right: editor for the currently-selected trigger                     ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _renderTriggersTab(host) {
    const s = editorState.scenario;

    host.innerHTML = `
        <div style="margin-bottom:8px;">
            <button class="st-btn primary" id="trg-add">+ New Trigger</button>
            <button class="st-btn" id="trg-dup">⎘ Duplicate Selected</button>
            <button class="st-btn" id="trg-up">▲ Move Up</button>
            <button class="st-btn" id="trg-down">▼ Move Down</button>
            <button class="st-btn danger" id="trg-del">Delete Selected</button>
            <span style="margin-left:14px;color:#8aa;">${(s.triggers || []).length} triggers total</span>
        </div>
        <div class="st-trig-layout">
            <div class="st-trig-list" id="trg-list"></div>
            <div id="trg-editor"></div>
        </div>
    `;

    function refreshList() {
        const listEl = host.querySelector("#trg-list");
        listEl.innerHTML = "";
        (s.triggers || []).forEach(trig => {
            const item = document.createElement("div");
            const cls = ["st-trig-list-item"];
            if (editorState.currentTriggerId === trig.id) cls.push("active");
            if (trig.enabled === false) cls.push("disabled");
            item.className = cls.join(" ");
            item.innerHTML = `
                <div style="display:flex;justify-content:space-between;">
                    <span><b>${_esc(trig.name || "(unnamed)")}</b></span>
                    <span class="st-fired">${trig.enabled === false ? "OFF" : ""}</span>
                </div>
                <div style="font-size:10px;color:#8aa;">
                    ${(trig.conditions || []).length} cond · ${(trig.actions || []).length} actions
                    ${trig.once === false ? " · ↻" : ""}
                </div>
                <div style="font-size:10px;color:#666;">${_esc(trig.id)}</div>
            `;
            item.onclick = () => {
                editorState.currentTriggerId = trig.id;
                refreshList();
                refreshEditor();
            };
            listEl.appendChild(item);
        });
    }

    function refreshEditor() {
        const wrap = host.querySelector("#trg-editor");
        const trig = (s.triggers || []).find(t => t.id === editorState.currentTriggerId);
        if (!trig) {
            wrap.innerHTML = `<div style="color:#888;padding:30px;text-align:center;">
                Select a trigger from the list, or click <strong>+ New Trigger</strong>.
            </div>`;
            return;
        }
        wrap.innerHTML = `
            <fieldset>
                <legend>Trigger Properties</legend>
                <div class="st-row-fields">
                    <div class="st-field"><label>ID</label><input id="trg-id" type="text" value="${_esc(trig.id)}" style="width:160px;"></div>
                    <div class="st-field"><label>Name</label><input id="trg-name" type="text" value="${_esc(trig.name || "")}" style="width:240px;"></div>
                    <div class="st-field"><label>Enabled</label><input id="trg-enabled" type="checkbox" ${trig.enabled !== false ? "checked" : ""}></div>
                    <div class="st-field"><label>Run Once</label><input id="trg-once" type="checkbox" ${trig.once !== false ? "checked" : ""}></div>
                    <div class="st-field"><label>Activated By (trigger ID, optional)</label>
                        <input id="trg-activated" type="text" value="${_esc(trig.activatedBy || "")}" style="width:160px;" placeholder="(empty = always active)">
                    </div>
                </div>
                <div style="font-size:11px;color:#8aa;margin-top:6px;">
                    "Activated By" gates this trigger so it only starts checking conditions
                    once the named trigger has fired. Useful for chaining story beats.
                </div>
            </fieldset>

            <div class="st-section-title">Conditions <span style="font-size:11px;color:#8aa;">— ALL must be true (AND)</span></div>
            <div id="trg-conds"></div>
            <button class="st-btn" id="trg-add-cond">+ Add Condition</button>

            <div class="st-section-title" style="margin-top:18px;">Actions <span style="font-size:11px;color:#8aa;">— run sequentially top-to-bottom</span></div>
            <div id="trg-actions"></div>
            <button class="st-btn" id="trg-add-action">+ Add Action</button>

            <div style="margin-top:14px;">
                <button class="st-btn primary" id="trg-save">Save Trigger</button>
                <button class="st-btn" id="trg-test">▶ Test (run actions now)</button>
            </div>
        `;

        function rebuildCondRows() {
            const condBox = wrap.querySelector("#trg-conds");
            condBox.innerHTML = "";
            (trig.conditions || []).forEach((c, i) => {
                condBox.appendChild(_buildConditionRow(c, i, () => {
                    trig.conditions.splice(i, 1);
                    rebuildCondRows();
                }));
            });
        }
        rebuildCondRows();

        function rebuildActionRows() {
            const actBox = wrap.querySelector("#trg-actions");
            actBox.innerHTML = "";
            (trig.actions || []).forEach((a, i) => {
                actBox.appendChild(_buildActionRow(a, i,
                    () => { trig.actions.splice(i, 1); rebuildActionRows(); },
                    () => { if (i > 0) { [trig.actions[i-1], trig.actions[i]] = [trig.actions[i], trig.actions[i-1]]; rebuildActionRows(); } },
                    () => { if (i < trig.actions.length - 1) { [trig.actions[i+1], trig.actions[i]] = [trig.actions[i], trig.actions[i+1]]; rebuildActionRows(); } }
                ));
            });
        }
        rebuildActionRows();

        wrap.querySelector("#trg-add-cond").onclick = () => {
            if (!Array.isArray(trig.conditions)) trig.conditions = [];
            trig.conditions.push({ type: "always", params: {} });
            rebuildCondRows();
        };
        wrap.querySelector("#trg-add-action").onclick = () => {
            if (!Array.isArray(trig.actions)) trig.actions = [];
            trig.actions.push({ type: "log_message", params: { text: "Hello, world!", tag: "general" } });
            rebuildActionRows();
        };
        wrap.querySelector("#trg-save").onclick = () => {
            const newId = wrap.querySelector("#trg-id").value.trim() || trig.id;
            if (newId !== trig.id) {
                if (s.triggers.some(t => t !== trig && t.id === newId)) {
                    alert("Trigger ID '" + newId + "' is already in use!");
                    return;
                }
                s.triggers.forEach(t => { if (t.activatedBy === trig.id) t.activatedBy = newId; });
                trig.id = newId;
                editorState.currentTriggerId = newId;
            }
            trig.name        = wrap.querySelector("#trg-name").value;
            trig.enabled     = wrap.querySelector("#trg-enabled").checked;
            trig.once        = wrap.querySelector("#trg-once").checked;
            trig.activatedBy = wrap.querySelector("#trg-activated").value.trim() || null;
            alert("Trigger saved: " + trig.name);
            refreshList();
        };
        wrap.querySelector("#trg-test").onclick = async () => {
            wrap.querySelector("#trg-save").click();
            if (!rt.scenario) rt.scenario = s;
            await _runTrigger(trig, /*forced=*/true);
        };
    }

    refreshList();
    refreshEditor();

    host.querySelector("#trg-add").onclick = () => {
        const id = "trig_" + Math.random().toString(36).substr(2, 6);
        const t = {
            id, name: "New Trigger",
            enabled: true, once: true,
            activatedBy: null,
            conditions: [{ type: "scenario_start", params: {} }],
            actions:    [{ type: "log_message",    params: { text: "Trigger fired!", tag: "general" } }]
        };
        if (!Array.isArray(s.triggers)) s.triggers = [];
        s.triggers.push(t);
        editorState.currentTriggerId = id;
        refreshList(); refreshEditor();
    };
    host.querySelector("#trg-dup").onclick = () => {
        const cur = (s.triggers || []).find(t => t.id === editorState.currentTriggerId);
        if (!cur) return;
        const copy = JSON.parse(JSON.stringify(cur));
        copy.id   = "trig_" + Math.random().toString(36).substr(2, 6);
        copy.name = (cur.name || "") + " (copy)";
        s.triggers.push(copy);
        editorState.currentTriggerId = copy.id;
        refreshList(); refreshEditor();
    };
    host.querySelector("#trg-del").onclick = () => {
        const idx = (s.triggers || []).findIndex(t => t.id === editorState.currentTriggerId);
        if (idx < 0) return;
        if (!confirm("Delete '" + s.triggers[idx].name + "'?")) return;
        s.triggers.splice(idx, 1);
        editorState.currentTriggerId = s.triggers[0]?.id || null;
        refreshList(); refreshEditor();
    };
    host.querySelector("#trg-up").onclick = () => {
        const idx = s.triggers.findIndex(t => t.id === editorState.currentTriggerId);
        if (idx <= 0) return;
        [s.triggers[idx-1], s.triggers[idx]] = [s.triggers[idx], s.triggers[idx-1]];
        refreshList();
    };
    host.querySelector("#trg-down").onclick = () => {
        const idx = s.triggers.findIndex(t => t.id === editorState.currentTriggerId);
        if (idx < 0 || idx >= s.triggers.length - 1) return;
        [s.triggers[idx+1], s.triggers[idx]] = [s.triggers[idx], s.triggers[idx+1]];
        refreshList();
    };
}

// ── Condition row builder ───────────────────────────────────────────────────
function _buildConditionRow(cond, idx, onDelete) {
    const row = document.createElement("div");
    row.className = "st-cond-row";

    const def = CONDITIONS[cond.type] || CONDITIONS["always"];

    const head = document.createElement("div");
    head.className = "st-row-head";
    head.innerHTML = `
        <span class="st-row-title">Cond ${idx + 1}</span>
        <select class="st-cond-type">
            ${Object.keys(CONDITIONS).map(k => `<option value="${k}" ${k === cond.type ? "selected" : ""}>${CONDITIONS[k].label}</option>`).join("")}
        </select>
        <button class="st-btn danger st-cond-del">×</button>
    `;
    row.appendChild(head);

    const fields = document.createElement("div");
    fields.className = "st-row-fields";
    row.appendChild(fields);

    const desc = document.createElement("div");
    desc.style.cssText = "font-size:11px;color:#8aa;margin-top:4px;";
    desc.textContent = def.desc || "";
    row.appendChild(desc);

    function rebuildFields() {
        fields.innerHTML = "";
        if (!cond.params) cond.params = {};
        const d = CONDITIONS[cond.type] || CONDITIONS["always"];
        d.params.forEach(pdef => fields.appendChild(_buildParamField(pdef, cond.params)));
        desc.textContent = d.desc || "";
    }
    rebuildFields();

    head.querySelector(".st-cond-type").addEventListener("change", e => {
        cond.type = e.target.value;
        const d = CONDITIONS[cond.type];
        cond.params = {};
        (d.params || []).forEach(p => cond.params[p.key] = p.default);
        rebuildFields();
    });
    head.querySelector(".st-cond-del").addEventListener("click", onDelete);

    return row;
}

// ── Action row builder (with up/down reorder) ───────────────────────────────
function _buildActionRow(act, idx, onDelete, onUp, onDown) {
    const row = document.createElement("div");
    row.className = "st-action-row";

    const def = ACTIONS[act.type] || ACTIONS["log_message"];

    const head = document.createElement("div");
    head.className = "st-row-head";
    head.innerHTML = `
        <span class="st-row-title">Action ${idx + 1}</span>
        <select class="st-act-type">
            ${Object.keys(ACTIONS).map(k => `<option value="${k}" ${k === act.type ? "selected" : ""}>${ACTIONS[k].label}</option>`).join("")}
        </select>
        <button class="st-btn st-act-up">▲</button>
        <button class="st-btn st-act-dn">▼</button>
        <button class="st-btn danger st-act-del">×</button>
    `;
    row.appendChild(head);

    const fields = document.createElement("div");
    fields.className = "st-row-fields";
    row.appendChild(fields);

    const desc = document.createElement("div");
    desc.style.cssText = "font-size:11px;color:#8aa;margin-top:4px;";
    desc.textContent = def.desc || "";
    row.appendChild(desc);

    function rebuildFields() {
        fields.innerHTML = "";
        if (!act.params) act.params = {};
        const d = ACTIONS[act.type] || ACTIONS["log_message"];
        d.params.forEach(pdef => {
            if (pdef.type === "dialogue_lines") {
                fields.appendChild(_buildDialogueLinesEditor(act.params, pdef.key));
            } else {
                fields.appendChild(_buildParamField(pdef, act.params));
            }
        });
        desc.textContent = d.desc || "";
    }
    rebuildFields();

    head.querySelector(".st-act-type").addEventListener("change", e => {
        act.type = e.target.value;
        const d = ACTIONS[act.type];
        act.params = {};
        (d.params || []).forEach(p => {
            if (p.type === "dialogue_lines") act.params[p.key] = JSON.parse(JSON.stringify(p.default || []));
            else act.params[p.key] = p.default;
        });
        rebuildFields();
    });
    head.querySelector(".st-act-del").addEventListener("click", onDelete);
    head.querySelector(".st-act-up").addEventListener("click", onUp);
    head.querySelector(".st-act-dn").addEventListener("click", onDown);

    return row;
}

// ── Param-field renderer (string / number / select / bool / color / image / longtext) ─
function _buildParamField(pdef, paramsObj) {
    const wrap = document.createElement("div");
    wrap.className = "st-field";
    const lbl = document.createElement("label");
    lbl.textContent = pdef.label;
    wrap.appendChild(lbl);

    const cur = paramsObj[pdef.key];
    const val = (cur === undefined) ? pdef.default : cur;

    let input;
    switch (pdef.type) {
        case "number": {
            input = document.createElement("input");
            input.type = "number";
            if (typeof pdef.min === "number") input.min = pdef.min;
            if (typeof pdef.max === "number") input.max = pdef.max;
            input.value = (val === null || val === undefined) ? "" : val;
            input.style.width = "100px";
            input.addEventListener("input", () => {
                const v = input.value.trim();
                paramsObj[pdef.key] = v === "" ? null : (parseFloat(v) || 0);
            });
            break;
        }
        case "bool": {
            input = document.createElement("input");
            input.type = "checkbox";
            input.checked = !!val;
            input.addEventListener("change", () => paramsObj[pdef.key] = input.checked);
            break;
        }
        case "select": {
            input = document.createElement("select");
            (pdef.options || []).forEach(o => {
                const opt = document.createElement("option");
                opt.value = o; opt.textContent = o;
                if (val === o) opt.selected = true;
                input.appendChild(opt);
            });
            input.addEventListener("change", () => paramsObj[pdef.key] = input.value);
            break;
        }
        case "color": {
            input = document.createElement("input");
            input.type = "color";
            input.value = val || "#000000";
            input.addEventListener("input", () => paramsObj[pdef.key] = input.value);
            break;
        }
        case "longtext": {
            input = document.createElement("textarea");
            input.rows = 3;
            input.value = val || "";
            input.style.width = "320px";
            input.style.fontFamily = "monospace";
            input.addEventListener("input", () => paramsObj[pdef.key] = input.value);
            break;
        }
        case "image": {
            const holder = document.createElement("div");
            const preview = document.createElement("img");
            preview.style.cssText = "max-width:160px;max-height:90px;border:1px solid #5a4220;background:#000;display:block;margin-top:4px;";
            if (val) preview.src = val;
            const fileInput = document.createElement("input");
            fileInput.type = "file"; fileInput.accept = "image/*";
            fileInput.addEventListener("change", e => {
                const f = e.target.files[0];
                if (!f) return;
                _readFileAsDataURL(f, (url) => {
                    paramsObj[pdef.key] = url;
                    preview.src = url;
                });
            });
            const clear = document.createElement("button");
            clear.className = "st-btn"; clear.textContent = "Clear";
            clear.onclick = () => { paramsObj[pdef.key] = ""; preview.removeAttribute("src"); };
            holder.appendChild(fileInput);
            holder.appendChild(clear);
            holder.appendChild(preview);
            wrap.appendChild(holder);
            return wrap;
        }
        default: { // string
            // Special case: NPC ID fields → smart dropdown of importantNpcs with 📜 prefix
            const isNpcId = pdef.key === "id" &&
                            editorState && editorState.scenario &&
                            Array.isArray(editorState.scenario.importantNpcs) &&
                            editorState.scenario.importantNpcs.length > 0;
            if (isNpcId) {
                input = document.createElement("select");
                input.style.width = "220px";
                // Blank / manual-entry sentinel
                const blankOpt = document.createElement("option");
                blankOpt.value = ""; blankOpt.textContent = "— choose Story NPC —";
                if (!val) blankOpt.selected = true;
                input.appendChild(blankOpt);
                editorState.scenario.importantNpcs.forEach(n => {
                    const opt = document.createElement("option");
                    opt.value = n.id;
                    opt.textContent = `📜 ${n.name || n.id}  (${n.id})`;
                    if (val === n.id) opt.selected = true;
                    input.appendChild(opt);
                });
                input.addEventListener("change", () => paramsObj[pdef.key] = input.value);
            } else {
                input = document.createElement("input");
                input.type = "text";
                input.value = (val === null || val === undefined) ? "" : val;
                input.style.width = "180px";
                input.addEventListener("input", () => paramsObj[pdef.key] = input.value);
            }
        }
    }
    wrap.appendChild(input);
    return wrap;
}

// ── Dialogue lines sub-editor (used only inside show_dialogue action) ──────
function _buildDialogueLinesEditor(paramsObj, key) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "width:100%;border:1px dashed #4a6680;padding:6px;";
    wrap.innerHTML = `<div style="color:#8aa;font-size:11px;margin-bottom:4px;">
        <strong>Dialogue Lines</strong> — each line can have a portrait, speaker name, and text.
    </div>`;
    const list = document.createElement("div");
    wrap.appendChild(list);
    const addBtn = document.createElement("button");
    addBtn.className = "st-btn primary";
    addBtn.textContent = "+ Add Line";
    wrap.appendChild(addBtn);

    function refresh() {
        if (!Array.isArray(paramsObj[key])) paramsObj[key] = [];
        list.innerHTML = "";
        paramsObj[key].forEach((ln, i) => {
            list.appendChild(_buildDialogueLineEditor(ln, i, () => {
                paramsObj[key].splice(i, 1);
                refresh();
            }));
        });
    }
    addBtn.onclick = () => {
        if (!Array.isArray(paramsObj[key])) paramsObj[key] = [];
        paramsObj[key].push({ name: "", text: "...", side: "left" });
        refresh();
    };
    refresh();
    return wrap;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ WIN / LOSE TAB                                                           ║
// ║                                                                          ║
// ║   This tab is a high-level shortcut for compiling common victory /       ║
// ║   defeat conditions into actual triggers.  Pressing "Compile" appends    ║
// ║   the auto-generated triggers to scenario.triggers (replacing previous   ║
// ║   compiled ones, identified by the "compiled_winlose:" id prefix).       ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _renderWinLoseTab(host) {
    const s = editorState.scenario;
    const wl = s.winLose;

    host.innerHTML = `
        <p style="color:#8aa;">
            High-level victory and defeat conditions. When you press <strong>Compile to Triggers</strong>,
            these rules become actual triggers in the Triggers tab (with IDs prefixed
            <code>compiled_winlose:</code>). You can leave them as-is, or edit/delete them
            in the Triggers tab afterwards.
        </p>

        <fieldset>
            <legend>Victory Rules <span style="font-size:11px;color:#8aa;">(any one fulfilled = win)</span></legend>
            <div id="wl-win-list"></div>
            <button class="st-btn primary" id="wl-add-win">+ Add Victory Rule</button>
        </fieldset>

        <fieldset>
            <legend>Defeat Rules <span style="font-size:11px;color:#8aa;">(any one fulfilled = lose)</span></legend>
            <div id="wl-lose-list"></div>
            <button class="st-btn primary" id="wl-add-lose">+ Add Defeat Rule</button>
        </fieldset>

        <fieldset>
            <legend>Result Cards</legend>
            <label>Victory title:    <input id="wl-vtitle" type="text" value="${_esc(wl.victoryTitle    || "Victory!")}" style="width:240px;"></label>
            <label>Victory subtitle: <input id="wl-vsub"   type="text" value="${_esc(wl.victorySubtitle || "Your scenario goals were achieved.")}" style="width:340px;"></label>
            <br>
            <label>Defeat title:     <input id="wl-dtitle" type="text" value="${_esc(wl.defeatTitle     || "Defeat")}" style="width:240px;"></label>
            <label>Defeat subtitle:  <input id="wl-dsub"   type="text" value="${_esc(wl.defeatSubtitle  || "Your scenario was lost.")}" style="width:340px;"></label>
        </fieldset>

        <button class="st-btn primary" id="wl-compile">⚙ Compile to Triggers</button>
        <button class="st-btn danger"  id="wl-uncompile">Remove Compiled Triggers</button>
    `;

    const RULE_TYPES = [
        { v: "capture_city",        l: "Player captures specific city",        params: ["cityName"] },
        { v: "eliminate_faction",   l: "Faction eliminated (no cities)",       params: ["faction"] },
        { v: "survive_seconds",     l: "Survive N seconds",                    params: ["seconds"] },
        { v: "kill_npc",            l: "Important NPC killed",                 params: ["id"] },
        { v: "player_troops_below", l: "Player troops drop below N",           params: ["n"] },
        { v: "player_dead",         l: "Player HP reaches 0",                  params: [] },
        { v: "all_player_cities_lost", l: "Player loses all cities",           params: [] }
    ];

    function buildRuleRow(rule, list, refreshFn) {
        const card = document.createElement("div");
        card.className = "st-cond-row";
        card.innerHTML = `
            <div class="st-row-head">
                <select class="wl-rt">${RULE_TYPES.map(rt =>
                    `<option value="${rt.v}" ${rule.type === rt.v ? "selected" : ""}>${rt.l}</option>`).join("")}</select>
                <button class="st-btn danger wl-del">×</button>
            </div>
            <div class="st-row-fields wl-fields"></div>
        `;
        function rebuild() {
            const meta = RULE_TYPES.find(r => r.v === rule.type);
            const fwrap = card.querySelector(".wl-fields");
            fwrap.innerHTML = "";
            if (!meta) return;
            meta.params.forEach(pname => {
                const cell = document.createElement("div");
                cell.className = "st-field";
                let lbl = pname;
                if (pname === "cityName") lbl = "City Name";
                else if (pname === "faction") lbl = "Faction";
                else if (pname === "seconds") lbl = "Seconds";
                else if (pname === "id") lbl = "Important NPC ID";
                else if (pname === "n") lbl = "N";
                cell.innerHTML = `<label>${lbl}</label>`;
                const inp = document.createElement("input");
                inp.type = (pname === "seconds" || pname === "n") ? "number" : "text";
                inp.value = (rule[pname] !== undefined && rule[pname] !== null) ? rule[pname] : "";
                inp.style.width = "160px";
                inp.addEventListener("input", () => {
                    rule[pname] = (inp.type === "number") ? (parseFloat(inp.value) || 0) : inp.value;
                });
                cell.appendChild(inp);
                fwrap.appendChild(cell);
            });
        }
        rebuild();
        card.querySelector(".wl-rt").addEventListener("change", e => {
            rule.type = e.target.value;
            // Strip params not used by the new rule type
            const meta = RULE_TYPES.find(r => r.v === rule.type);
            const keep = new Set(["type"].concat(meta ? meta.params : []));
            Object.keys(rule).forEach(k => { if (!keep.has(k)) delete rule[k]; });
            rebuild();
        });
        card.querySelector(".wl-del").addEventListener("click", () => {
            const idx = list.indexOf(rule);
            if (idx >= 0) list.splice(idx, 1);
            refreshFn();
        });
        return card;
    }

    function refreshLists() {
        const wL = host.querySelector("#wl-win-list");
        const lL = host.querySelector("#wl-lose-list");
        wL.innerHTML = ""; lL.innerHTML = "";
        wl.winRules  = wl.winRules  || [];
        wl.loseRules = wl.loseRules || [];
        wl.winRules.forEach(r  => wL.appendChild(buildRuleRow(r, wl.winRules,  refreshLists)));
        wl.loseRules.forEach(r => lL.appendChild(buildRuleRow(r, wl.loseRules, refreshLists)));
    }
    refreshLists();

    host.querySelector("#wl-add-win").onclick = () => {
        wl.winRules.push({ type: "eliminate_faction", faction: "" });
        refreshLists();
    };
    host.querySelector("#wl-add-lose").onclick = () => {
        wl.loseRules.push({ type: "player_dead" });
        refreshLists();
    };
    host.querySelector("#wl-compile").onclick = () => {
        // Capture title/subtitle text fields
        wl.victoryTitle    = host.querySelector("#wl-vtitle").value;
        wl.victorySubtitle = host.querySelector("#wl-vsub").value;
        wl.defeatTitle     = host.querySelector("#wl-dtitle").value;
        wl.defeatSubtitle  = host.querySelector("#wl-dsub").value;

        _compileWinLoseToTriggers(s);
        alert("Win/Lose rules compiled to triggers. See the Triggers tab.");
    };
    host.querySelector("#wl-uncompile").onclick = () => {
        if (!confirm("Remove all compiled win/lose triggers?")) return;
        s.triggers = (s.triggers || []).filter(t => !String(t.id).startsWith("compiled_winlose:"));
        alert("Compiled triggers removed.");
    };
}

// Convert wl rules into real triggers and append to s.triggers
function _compileWinLoseToTriggers(s) {
    // Strip any previously compiled rules
    s.triggers = (s.triggers || []).filter(t => !String(t.id).startsWith("compiled_winlose:"));

    const wl = s.winLose;
    const winT = wl.victoryTitle    || "Victory!";
    const winS = wl.victorySubtitle || "";
    const loseT = wl.defeatTitle    || "Defeat";
    const loseS = wl.defeatSubtitle || "";

    const ruleToConditions = (rule) => {
        switch (rule.type) {
            case "capture_city":
                return [{ type: "city_captured_by_player", params: { cityName: rule.cityName || "" } }];
            case "eliminate_faction":
                return [{ type: "faction_eliminated", params: { faction: rule.faction || "" } }];
            case "survive_seconds":
                return [{ type: "timer_elapsed", params: { seconds: +rule.seconds || 0 } }];
            case "kill_npc":
                return [{ type: "npc_killed", params: { id: rule.id || "" } }];
            case "player_troops_below":
                return [{ type: "player_troops_below", params: { n: +rule.n || 0 } }];
            case "player_dead":
                return [{ type: "player_hp_below_pct", params: { pct: 1 } }];
            case "all_player_cities_lost":
                return [{ type: "faction_eliminated", params: {
                    faction: (s.playerSetup && s.playerSetup.faction) || "Player"
                } }];
            default: return [];
        }
    };

    (wl.winRules || []).forEach((r, i) => {
        s.triggers.push({
            id: "compiled_winlose:win_" + i,
            name: "Victory: " + (r.type),
            enabled: true, once: true, activatedBy: null,
            conditions: ruleToConditions(r),
            actions: [{ type: "win_scenario", params: { title: winT, subtitle: winS } }]
        });
    });
    (wl.loseRules || []).forEach((r, i) => {
        s.triggers.push({
            id: "compiled_winlose:lose_" + i,
            name: "Defeat: " + (r.type),
            enabled: true, once: true, activatedBy: null,
            conditions: ruleToConditions(r),
            actions: [{ type: "lose_scenario", params: { title: loseT, subtitle: loseS } }]
        });
    });
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ TIMELINE TAB                                                             ║
// ║                                                                          ║
// ║   Visual sequencer: a horizontal time axis with draggable time-points    ║
// ║   that compile into triggers.  Each point pairs a scenario-time stamp    ║
// ║   with a single action (or a reference to an existing trigger to fire). ║
// ║                                                                          ║
// ║   Stored in scenario.timeline = [{ atSec, action }] and recompiled to    ║
// ║   real triggers via _compileTimelineToTriggers().                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _renderTimelineTab(host) {
    const s = editorState.scenario;
    if (!Array.isArray(s.timeline)) s.timeline = [];

    host.innerHTML = `
        <p style="color:#8aa;">
            Add fixed-time scenario events (in seconds since scenario start). Each
            timeline event becomes a trigger with a <code>timer_elapsed</code> condition.
            IDs use the prefix <code>compiled_timeline:</code>.
        </p>
        <fieldset>
            <legend>Timeline</legend>
            <div id="tl-track" style="
                position: relative;
                height: 80px;
                background: linear-gradient(to right, #1a2535 0%, #2a4060 100%);
                border: 1px solid #4a6680;
                margin-bottom: 14px;
                overflow: hidden;
            "></div>
            <div style="font-size:11px;color:#8aa;margin-bottom:8px;">
                Timeline range: 0–<input id="tl-max" type="number" value="600" min="30" style="width:70px;"> seconds.
                Click on the bar to add an event at that time.
            </div>
            <div id="tl-list"></div>
            <button class="st-btn primary" id="tl-add">+ Add Event at 30s</button>
            <button class="st-btn primary" id="tl-compile">⚙ Compile Timeline to Triggers</button>
            <button class="st-btn danger"  id="tl-uncompile">Remove Compiled Triggers</button>
        </fieldset>
    `;

    const maxInput = host.querySelector("#tl-max");
    const track    = host.querySelector("#tl-track");

    function getMax() { return Math.max(30, parseInt(maxInput.value, 10) || 600); }

    function refreshTrack() {
        const max = getMax();
        track.innerHTML = "";
        // Tick marks every 60s
        for (let t = 0; t <= max; t += 60) {
            const tick = document.createElement("div");
            tick.style.cssText = `
                position: absolute; top: 0; bottom: 0;
                left: ${(t / max) * 100}%; width: 1px;
                background: rgba(255,255,255,0.15);
            `;
            const lbl = document.createElement("div");
            lbl.style.cssText = `
                position: absolute; bottom: 2px;
                left: ${(t / max) * 100}%; transform: translateX(-50%);
                color: #8aa; font-size: 9px; pointer-events: none;
            `;
            lbl.textContent = (t >= 60) ? `${Math.floor(t/60)}m` : "0";
            track.appendChild(tick);
            track.appendChild(lbl);
        }
        // Event markers
        s.timeline.forEach((ev, idx) => {
            const x = Math.max(0, Math.min(1, (ev.atSec || 0) / max));
            const m = document.createElement("div");
            m.title = `${ev.atSec}s: ${ev.action?.type || "?"}`;
            m.style.cssText = `
                position: absolute;
                top: 12px; left: ${x * 100}%;
                transform: translateX(-50%);
                width: 18px; height: 32px;
                background: #f5d76e;
                border: 1px solid #aa9020;
                clip-path: polygon(50% 0%, 100% 30%, 100% 100%, 0% 100%, 0% 30%);
                cursor: pointer;
            `;
            m.onclick = () => {
                editorState.timelineSelectedIdx = idx;
                refreshList(true);
            };
            const tag = document.createElement("div");
            tag.style.cssText = `
                position: absolute;
                top: 50px; left: ${x * 100}%; transform: translateX(-50%);
                color: #f5d76e; font-size: 10px; pointer-events: none;
                white-space: nowrap;
            `;
            tag.textContent = `${ev.atSec}s`;
            track.appendChild(m);
            track.appendChild(tag);
        });
    }

    track.onclick = (e) => {
        if (e.target !== track) return;
        const r = track.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        const sec = Math.round(pct * getMax());
        s.timeline.push({
            atSec: sec,
            action: { type: "log_message", params: { text: `Event at ${sec}s`, tag: "general" } }
        });
        refreshAll();
    };

    function refreshList(scrollTo) {
        const list = host.querySelector("#tl-list");
        list.innerHTML = "";
        s.timeline.sort((a, b) => (a.atSec || 0) - (b.atSec || 0));
        s.timeline.forEach((ev, idx) => {
            const row = document.createElement("div");
            row.className = "st-action-row";
            row.innerHTML = `
                <div class="st-row-head">
                    <span class="st-row-title">@ <input class="tl-sec" type="number" value="${ev.atSec || 0}" style="width:70px;"> sec</span>
                    <select class="tl-act">
                        ${Object.keys(ACTIONS).map(k => `<option value="${k}" ${ev.action?.type === k ? "selected" : ""}>${ACTIONS[k].label}</option>`).join("")}
                    </select>
                    <button class="st-btn danger tl-del">×</button>
                </div>
                <div class="tl-fields"></div>
            `;
            const fields = row.querySelector(".tl-fields");
            function rebuildFields() {
                fields.innerHTML = "";
                if (!ev.action) ev.action = { type: "log_message", params: {} };
                if (!ev.action.params) ev.action.params = {};
                const def = ACTIONS[ev.action.type] || ACTIONS["log_message"];
                def.params.forEach(pdef => {
                    if (pdef.type === "dialogue_lines") {
                        fields.appendChild(_buildDialogueLinesEditor(ev.action.params, pdef.key));
                    } else {
                        fields.appendChild(_buildParamField(pdef, ev.action.params));
                    }
                });
            }
            rebuildFields();
            row.querySelector(".tl-sec").addEventListener("input", e => {
                ev.atSec = parseFloat(e.target.value) || 0;
                refreshTrack();
            });
            row.querySelector(".tl-act").addEventListener("change", e => {
                ev.action = { type: e.target.value, params: {} };
                const d = ACTIONS[ev.action.type];
                (d.params || []).forEach(p => {
                    if (p.type === "dialogue_lines") ev.action.params[p.key] = JSON.parse(JSON.stringify(p.default || []));
                    else ev.action.params[p.key] = p.default;
                });
                rebuildFields();
            });
            row.querySelector(".tl-del").addEventListener("click", () => {
                s.timeline.splice(idx, 1);
                refreshAll();
            });
            list.appendChild(row);
            if (scrollTo && idx === editorState.timelineSelectedIdx) {
                row.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        });
    }

    function refreshAll() { refreshTrack(); refreshList(); }
    refreshAll();

    maxInput.addEventListener("input", refreshTrack);
    host.querySelector("#tl-add").onclick = () => {
        s.timeline.push({
            atSec: 30,
            action: { type: "log_message", params: { text: "Timeline event!", tag: "general" } }
        });
        refreshAll();
    };
    host.querySelector("#tl-compile").onclick = () => {
        _compileTimelineToTriggers(s);
        alert("Timeline compiled into triggers. See the Triggers tab.");
    };
    host.querySelector("#tl-uncompile").onclick = () => {
        if (!confirm("Remove all compiled timeline triggers?")) return;
        s.triggers = (s.triggers || []).filter(t => !String(t.id).startsWith("compiled_timeline:"));
        alert("Compiled timeline triggers removed.");
    };
}

function _compileTimelineToTriggers(s) {
    s.triggers = (s.triggers || []).filter(t => !String(t.id).startsWith("compiled_timeline:"));
    (s.timeline || []).forEach((ev, i) => {
        s.triggers.push({
            id: "compiled_timeline:t" + i,
            name: `Timeline @ ${ev.atSec}s`,
            enabled: true, once: true, activatedBy: null,
            conditions: [{ type: "timer_elapsed", params: { seconds: +ev.atSec || 0 } }],
            actions:    [ev.action || { type: "log_message", params: { text: "(empty)" } }]
        });
    });
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ CODE EXPORT TAB                                                          ║
// ║                                                                          ║
// ║   Generates a self-contained JS module of the current scenario's         ║
// ║   triggers — useful for power users / Skywind to fold into hand-written  ║
// ║   campaign files alongside Story Mode.                                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _renderExportTab(host) {
    const s = editorState.scenario;
    host.innerHTML = `
        <p style="color:#8aa;">
            Export the current scenario's <strong>triggers</strong>, <strong>importantNpcs</strong>,
            <strong>playerSetup</strong>, and <strong>storyIntro</strong> as a
            standalone JS file you can include directly in a developer-built campaign.
        </p>
        <button class="st-btn primary" id="exp-make">⚙ Generate JS</button>
        <button class="st-btn"         id="exp-copy">⎘ Copy to Clipboard</button>
        <button class="st-btn"         id="exp-download">💾 Download .js</button>
        <textarea id="exp-out" rows="22" style="width:99%;font-family:monospace;font-size:11px;margin-top:10px;"></textarea>
    `;
    const out = host.querySelector("#exp-out");

    function generate() {
        const json = JSON.stringify({
            meta:           s.meta,
            playerSetup:    s.playerSetup,
            importantNpcs:  s.importantNpcs,
            // Step 4: Prefer the new movies[] array. We keep storyIntro for
            // back-compat with any external scenario module that still reads
            // it; both contain the same boot intro data.
            movies:         s.movies,
            storyIntro:     s.storyIntro,
            scenarioVars:   s.scenarioVars,
            winLose:        s.winLose,
            timeline:       s.timeline,
            triggers:       s.triggers
        }, null, 2);

        const safeName = ((s.meta?.name || "MyScenario").replace(/[^a-zA-Z0-9]/g, "")) || "MyScenario";

        out.value =
`// ============================================================================
// ${s.meta?.name || "Custom Scenario"} — auto-generated by ScenarioTriggers v${VERSION}
// Author: ${s.meta?.author || "Unknown"}
// Created: ${new Date().toISOString()}
// ============================================================================
//
// This file packages the scenario's trigger logic as a runtime-installable
// module. Drop it after scenario_triggers.js + storymode_presentation.js in
// your index.html, then call:  window.${safeName}.install();
//
// Triggers, important NPCs, and player setup will be merged into the
// currently-active scenario.
// ============================================================================

window.${safeName} = (function () {
"use strict";

const data = ${json};

function install() {
    if (!window.__activeScenario) {
        console.warn("[${safeName}] No active scenario — install() should be called from a scenario boot hook.");
        return;
    }
    const s = window.__activeScenario;
    s.triggers       = (s.triggers || []).concat(data.triggers || []);
    s.importantNpcs  = (s.importantNpcs || []).concat(data.importantNpcs || []);
    s.playerSetup    = Object.assign(s.playerSetup || {}, data.playerSetup || {});
    if (Array.isArray(data.movies) && data.movies.length > 0) s.movies = data.movies;
    s.storyIntro     = data.storyIntro     || s.storyIntro;
    s.scenarioVars   = Object.assign(s.scenarioVars || {}, data.scenarioVars || {});
    s.winLose        = data.winLose        || s.winLose;
    s.timeline       = data.timeline       || s.timeline;
    if (window.ScenarioTriggers && window.ScenarioTriggers.start) {
        window.ScenarioTriggers.start(s);
    }
    console.log("[${safeName}] Installed.");
}

return { install, data };
})();
`;
    }

    host.querySelector("#exp-make").onclick = generate;
    host.querySelector("#exp-copy").onclick = () => {
        if (!out.value) generate();
        out.select();
        document.execCommand("copy");
        alert("Copied!");
    };
    host.querySelector("#exp-download").onclick = () => {
        if (!out.value) generate();
        const blob = new Blob([out.value], { type: "text/javascript" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const safeName = ((s.meta?.name || "scenario").replace(/[^a-zA-Z0-9]/g, "_")) || "scenario";
        a.href = url; a.download = safeName + "_triggers.js";
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    };

    generate();
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ HELP TAB                                                                 ║
// ║                                                                          ║
// ║   Auto-generated reference of every condition and action with their      ║
// ║   parameters and descriptions. The editor is a thin DSL over this        ║
// ║   data so the help is always up to date.                                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _renderHelpTab(host) {
    const condRows = Object.entries(CONDITIONS).map(([k, def]) => {
        const params = (def.params || []).map(p =>
            `<code>${p.key}</code><span style="color:#888"> (${p.type})</span>`
        ).join(", ") || "<em style='color:#666;'>none</em>";
        return `<tr><td><code>${k}</code></td><td>${_esc(def.label)}</td><td>${_esc(def.desc || "")}</td><td>${params}</td></tr>`;
    }).join("");

    const actRows = Object.entries(ACTIONS).map(([k, def]) => {
        const params = (def.params || []).map(p =>
            `<code>${p.key}</code><span style="color:#888"> (${p.type})</span>`
        ).join(", ") || "<em style='color:#666;'>none</em>";
        return `<tr><td><code>${k}</code></td><td>${_esc(def.label)}</td><td>${_esc(def.desc || "")}</td><td>${params}</td></tr>`;
    }).join("");

    host.innerHTML = `
    <div class="st-help">
        <h2 style="color:#f5d76e;">Trigger System Reference</h2>
        <p style="color:#8aa;">
            Triggers are made of <strong>Conditions</strong> (checked every ${TRIGGER_TICK_MS}ms;
            ALL must be true) and <strong>Actions</strong> (run sequentially when the trigger fires).
            Triggers are stored in <code>scenario.triggers[]</code> and serialize as JSON.
        </p>

        <h3>How a trigger flows</h3>
        <ol style="color:#cfd8dc;line-height:1.6;">
            <li>If <em>Activated By</em> is set, wait until the named trigger fires.</li>
            <li>Once active, the runtime evaluates all conditions every ~${TRIGGER_TICK_MS}ms.</li>
            <li>If ALL conditions pass at once, the trigger fires and runs its actions in order.</li>
            <li>Async actions (dialogue, fade, art card) <em>await</em> — others between them
                wait politely.</li>
            <li>If <em>Run Once</em> is checked (default), the trigger never fires again
                unless re-enabled by another trigger.</li>
        </ol>

        <h3>Working with Important NPCs</h3>
        <p style="color:#cfd8dc;">
            Defined in the <strong>NPCs</strong> tab. Not on the map at scenario start —
            you use <code>spawn_important_npc</code> to add them, then
            <code>set_npc_waypoint</code> to move them, and check
            <code>npc_killed</code> / <code>npc_alive</code> conditions to react.
            If the NPC has a portrait, it auto-registers with StoryPresentation, so
            any dialogue line that names them gets the right portrait automatically.
        </p>

        <h3>Story intro art &amp; portraits</h3>
        <p style="color:#cfd8dc;">
            Upload JPG/PNG via the file pickers in the Story tab and per-NPC. Files
            are inlined as <code>data:</code> URIs and travel with the scenario JSON
            (no asset paths needed). Large images bloat the file — keep below 200 KB
            each for sane scenario file sizes.
        </p>

        <h3>Custom JS</h3>
        <p style="color:#cfd8dc;">
            Both conditions and actions support <code>custom_js</code>. You get
            <code>player</code>, <code>cities</code>, <code>vars</code>,
            <code>npcs</code>, <code>ctx</code>, <code>trig</code>, and
            <code>StoryPresentation</code> in scope. Conditions: <code>return true/false</code>.
            Actions: anything goes — return a Promise to await.
        </p>

        <h3>Conditions catalog</h3>
        <table>
            <thead><tr><th>Type</th><th>Label</th><th>Description</th><th>Params</th></tr></thead>
            <tbody>${condRows}</tbody>
        </table>

        <h3>Actions catalog</h3>
        <table>
            <thead><tr><th>Type</th><th>Label</th><th>Description</th><th>Params</th></tr></thead>
            <tbody>${actRows}</tbody>
        </table>

        <h3>Param types</h3>
        <table>
            <tbody>
                <tr><td><code>string</code></td><td>Plain text input.</td></tr>
                <tr><td><code>number</code></td><td>Numeric input. Empty = null.</td></tr>
                <tr><td><code>bool</code></td><td>Checkbox.</td></tr>
                <tr><td><code>select</code></td><td>Dropdown from a fixed list.</td></tr>
                <tr><td><code>color</code></td><td>HTML color picker (returns "#rrggbb").</td></tr>
                <tr><td><code>longtext</code></td><td>Multi-line monospace box (used for code &amp; CSV rosters).</td></tr>
                <tr><td><code>image</code></td><td>File picker → inlines as data:URI.</td></tr>
                <tr><td><code>dialogue_lines</code></td><td>Array of {portrait, name, text, side, color} cards.</td></tr>
            </tbody>
        </table>

        <h3>Engine globals available at runtime</h3>
        <p style="color:#cfd8dc;">
            <code>window.player</code>, <code>window.cities_sandbox</code>,
            <code>window.globalNPCs</code>, <code>window.FACTIONS</code>,
            <code>window.FACTION_RELATIONS_get()</code>,
            <code>window.WORLD_WIDTH_sandbox</code> (4000),
            <code>window.WORLD_HEIGHT_sandbox</code> (3000),
            <code>window.inBattleMode</code>, <code>window.inCityMode</code>,
            <code>window.logGameEvent(text, tag)</code>,
            <code>window.StoryPresentation</code>.
        </p>

        <h3>Scenario data added by this module</h3>
        <p style="color:#cfd8dc;">
            <code>scenario.triggers[]</code> · <code>scenario.importantNpcs[]</code> ·
            <code>scenario.playerSetup</code> · <code>scenario.storyIntro</code> ·
            <code>scenario.scenarioVars</code> · <code>scenario.winLose</code> ·
            <code>scenario.timeline</code>. Older scenario files (pre-trigger-system)
            still load — these fields are added lazily on first edit.
        </p>

        <h3>Force-launching a custom battle from a trigger</h3>
        <p style="color:#cfd8dc;">
            The <code>force_battle</code> action stores its request on
            <code>ScenarioTriggers._state.pendingForceBattle</code> and calls
            <code>window.ScenarioForceBattle(spec)</code> if defined. To wire that up
            to your custom-battle UI, register a handler:
            <br>
            <code>window.ScenarioForceBattle = (spec) =&gt; { ...launch with spec.enemyRoster, .map, .mode... };</code>
            <br>
            The trigger system already records battle outcomes via
            <code>battle_won_against</code> / <code>battle_lost</code> conditions,
            regardless of how the battle was launched.
        </p>

        <h3>Hotkeys (in dialogue)</h3>
        <p style="color:#cfd8dc;">
            <code>Click / Space / Enter</code> — advance line · <code>ESC</code> — skip remaining lines.
        </p>
    </div>
    `;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ UTILITY HELPERS                                                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _esc(s) {
    if (s === null || s === undefined) return "";
    return String(s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function _readFileAsDataURL(file, cb) {
    const reader = new FileReader();
    reader.onload = () => cb(reader.result);
    reader.onerror = () => alert("Failed to read file: " + file.name);
    reader.readAsDataURL(file);
}

function _numOrNull(v) {
    if (v === "" || v === null || v === undefined) return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
}

function _rosterToCsv(roster) {
    if (!Array.isArray(roster) || roster.length === 0) return "";
    return roster.map(r => (typeof r === "string") ? r : (r?.type || "Militia")).join(", ");
}

// Build a <select> populated from the scenario's faction list (if available)
// or from the engine's live FACTIONS object as a fallback.
function _factionSelectHTML(id, currentValue) {
    let names = [];
    const sce = editorState && editorState.scenario;
    if (sce && sce.factions) {
        names = Object.keys(sce.factions);
    } else if (typeof window.FACTIONS !== "undefined") {
        names = Object.keys(window.FACTIONS);
    }
    // Always include common defaults so dropdown isn't empty in fresh scenarios
    ["Player","Bandits","Hong Dynasty","Dab Tribes","Great Khaganate"]
        .forEach(n => { if (!names.includes(n)) names.push(n); });

    const opts = names.map(n =>
        `<option value="${_esc(n)}" ${n === currentValue ? "selected" : ""}>${_esc(n)}</option>`
    ).join("");
    return `<select id="${id}">${opts}</select>`;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ RUNTIME REGISTRATION + PUBLIC API                                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// Register every action handler with ScenarioRuntime so its fireTrigger() API
// (used by other modules) routes correctly.  This is purely cooperative — our
// own _runTrigger() runs handlers directly without needing this.
function _registerWithScenarioRuntime() {
    if (!window.ScenarioRuntime || typeof window.ScenarioRuntime.registerTriggerHandler !== "function") {
        // Try again later — ScenarioRuntime may not be loaded yet
        setTimeout(_registerWithScenarioRuntime, 500);
        return;
    }
    Object.keys(ACTION_HANDLERS).forEach(key => {
        try {
            window.ScenarioRuntime.registerTriggerHandler(key, (trigger, ctx) => {
                return ACTION_HANDLERS[key](trigger.action?.params || {}, trigger);
            });
        } catch (e) { console.warn("[ScenarioTriggers] Could not register", key, e); }
    });
}
_registerWithScenarioRuntime();

// ── PUBLIC API ──────────────────────────────────────────────────────────────
return {
    // Editor
    openEditor,
    closeEditor: _closeEditor,

    // Runtime control
    start, stop, pause, resume,

    // Story-playing status (used by parler_system guard and external modules)
    isStoryPlaying: function () { return !!rt.storyPlaying; },

    // Manual firing (also exposed as a callable from external modules)
    fireTrigger: function (id) {
        const t = rt.triggers.find(x => x.id === id);
        if (t) return _runTrigger(t, /*forced=*/true);
    },

    // History / variable access
    pushHistory: _pushHistory,
    getVar:      (name) => rt.vars[name],
    setVar:      (name, value) => { rt.vars[name] = value; },

    // Catalog accessors (so modders can extend conditions/actions at runtime)
    getCatalogs: _getCatalogs,
    registerCondition: function (key, def) { CONDITIONS[key] = def; },
    registerAction:    function (key, def, handler) {
        ACTIONS[key] = def;
        if (typeof handler === "function") ACTION_HANDLERS[key] = handler;
    },

    // For developers / debugging
    _state:    rt,
    _editor:   () => editorState,
    VERSION
};

})();

console.log("[ScenarioTriggers] scenario_triggers.js v" + window.ScenarioTriggers.VERSION + " loaded — ready.");

// ============================================================================
// PATCH: scenario_editor.js _buildTriggersPanel() replacement
// ============================================================================
//
// Rather than make you edit scenario_editor.js by hand, we monkey-patch the
// existing button at runtime as soon as it appears in the DOM. This way the
// hooking story is "just include the script" and nothing else.
//
// We watch for the `#se-trig-open` button (the placeholder button inside the
// Triggers panel) and swap its click handler to open OUR full editor.
// ============================================================================
(function _patchEditorButton() {
    function _swap(btn) {
        if (!btn || btn.__stPatched) return;
        btn.__stPatched = true;
        btn.textContent = "⚡ Open Trigger Editor";
        btn.style.fontWeight = "bold";
        btn.style.background = "#1a5a2c";
        btn.style.borderColor = "#4aaa4a";
        btn.style.color = "#b8ffb8";
        // Replace, not just override, in case the original handler did
        // event.stopPropagation gymnastics.
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener("click", () => {
            const sce = window.ScenarioEditor && window.ScenarioEditor._state
                        && window.ScenarioEditor._state.scenario;
            if (!sce) {
                alert("No scenario loaded — please create or load one first.");
                return;
            }
            window.ScenarioTriggers.openEditor(sce);
        });
    }

    // Poll for the placeholder button; this fires both on initial editor open
    // AND after the user opens a different scenario (DOM gets rebuilt).
    setInterval(() => {
        const btn = document.getElementById("se-trig-open");
        if (btn && !btn.__stPatched) _swap(btn);
    }, 800);
})();