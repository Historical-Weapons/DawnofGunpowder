// ============================================================================
// SURVIVAL MODE — "Hold the Southern Line"
// ============================================================================
// Endless wave-defense game mode. Player picks a faction and spends an
// adjustable (100-1000, "Easy" to "Hard") starting-gold budget on a roster
// (troop_system.js prices), then
// defends the south edge of the map against successive waves of procedurally
// generated raiders spawning from the north. All player units (troops +
// commander) dead = run over. Clearing a wave returns to a "prepare for the
// next day" interstitial — NOT the main menu — with the surviving roster
// carried forward at full health/ammo (each day spawns fresh unit objects,
// so "regeneration" falls out naturally). No mid-wave reinforcement spawning:
// a wave's full roster spawns once, up front, during predeployment.
//
// v1 scope, deliberately kept simple:
//   - Land battles only. No siege, no naval, no river.
//   - Enemy faction is re-rolled at random each day (see pickDailyEnemyFaction)
//     from the same real faction list Custom Battle uses, and that day's wave
//     composition is restricted to units that faction can actually field
//     (getUnitsForFaction) layered on top of the day/difficulty tier gate.
//     "Bandits" is only used as a last-resort fallback identity.
//   - Player spawn is fixed South, enemy spawn is fixed North (thematic,
//     not the usual random 4-corner assignment).
//
// REUSE, NOT REWRITE: this file leans hard on the exact same battle-engine
// primitives Custom Battle uses (generateBattlefield, computeSpawnGeometry,
// battleEnvironment, EnemyTacticalAI) and on three small exports added to
// custom_battle_gui.js (getAvailableUnitsForFaction, FactionUnitRules,
// customSpawnLoop, lastResort) rather than duplicating that logic here.
// Predeployment reuses the engine's existing window.__preDeploymentActive /
// window.__playerDeployZone freeze system (see battlefield_logic.js) instead
// of building a new one.
// ============================================================================

(function () {

    // ------------------------------------------------------------------
    // CONSTANTS
    // ------------------------------------------------------------------
    // Adjustable via a slider on the setup screen (100-1000, "Easy" to
    // "Hard" as it climbs - see goldDifficultyLabel). Default sits at the
    // low end of the range so a first-time player isn't handed a huge
    // roster budget without asking for it.
    let SURVIVAL_STARTING_GOLD = 200;
    const SURVIVAL_GOLD_MIN = 100;
    const SURVIVAL_GOLD_MAX = 1000;
    function goldDifficultyLabel(v) {
        const t = (v - SURVIVAL_GOLD_MIN) / (SURVIVAL_GOLD_MAX - SURVIVAL_GOLD_MIN); // 0..1
if (t < 0.2) return "Very Hard";
if (t < 0.45) return "Hard";
if (t < 0.7) return "Normal";
return "Easy";
    }
    const SURVIVAL_MAPS = ["Plains", "Forest", "Dense Forest", "Steppe", "Desert", "Highlands", "Large Mountains"];
    const ENEMY_FACTION = "Bandits";
    const ENEMY_FALLBACK_COLOR = "#7a4a2f";
    const DEPLOY_ZONE_HALF = 380; // player's predeployment box, half-width/height

    // ------------------------------------------------------------------
    // ECONOMY — food, labor, wounds/desertion, loot. Gold stays recruit-shop
    // -only (see SURVIVAL_STARTING_GOLD above); structures now cost labor,
    // not gold (see computeLaborBudget / window.SurvivalRun.getLabor).
    // ------------------------------------------------------------------
    const SURVIVAL_STARTING_FOOD = 150;
    const FOOD_PER_TROOP_PER_DAY = 1;        // full ration, active/fightable troops
    const FOOD_PER_WOUNDED_PER_DAY = 0.4;    // smaller portion while healing, per spec
    const WEEKLY_FOOD_SHIPMENT_INTERVAL = 7; // arrives on day 7, 14, 21...
    const WEEKLY_FOOD_SHIPMENT_AMOUNT = 120;
    const STARVE_DAYS_TO_DESERT = 3;         // consecutive unfed days before desertion
    const STARVE_STAT_PENALTY_PER_DAY = 0.08; // -8%/day, multiplicative, resets once fed
    const MAX_STARVE_STAT_PENALTY = STARVE_STAT_PENALTY_PER_DAY * (STARVE_DAYS_TO_DESERT - 1);
    const WOUND_INSTEAD_OF_DEATH_CHANCE = 0.35; // else it's a real death
    const HEAL_DAYS_MIN = 1, HEAL_DAYS_MAX = 7;
    const DAILY_GOLD_LUMP_SUM = 25;          // flat daily supply-train trickle
    const LABOR_PER_TROOP = 1.5;             // today's build budget = active troops * this
    const LABOR_BASE_MINIMUM = 6;            // ...never less than this, even at 1-2 survivors
    const LOOT_FOOD_CHANCE_PER_KILL = 0.12;
    const LOOT_FOOD_AMOUNT = [2, 6];         // [min, max], inclusive
    const LOOT_GOLD_CHANCE_PER_KILL = 0.10;
    const LOOT_GOLD_AMOUNT = [3, 10];

    // ------------------------------------------------------------------
    // NIGHT RAID — a surprise attack that can trigger WHILE the interday
    // (day-prep) menu is open, before the player clicks Begin Wave.
    // Skips predeployment entirely — no time to arrange a line, the enemy
    // is already inside the perimeter when the alert sounds.
    // ------------------------------------------------------------------
    const NIGHT_RAID_CHANCE_PER_SECOND = 0.01; // ADJUST HERE — default ~1% roll, once per second, while day-prep is open
    const NIGHT_RAID_MIN_DAY = 3;              // impossible during prep for Day 2 (i.e. the first night) — first possible roll is prep for Day 3 onward
    const NIGHT_RAID_COOLDOWN_DAYS = 4;        // near-immunity for this many days after a raid fires
    const NIGHT_RAID_ENEMY_COUNT = [3, 6];     // small — a scouting party that slipped the perimeter, not a wave
    const NIGHT_RAID_SPAWN_INTERVAL_MS = 1100; // how often another sleepy defender reaches the fight
    const NIGHT_RAID_INITIAL_DEFENDERS = 2;    // sentries already awake/armed the instant the alert sounds
    const NIGHT_RAID_REWARD_GOLD = [60, 130];  // "reward huge" per spec — well above a normal day's take
    const NIGHT_RAID_REWARD_FOOD = [30, 70];

    // ------------------------------------------------------------------
    // CAMP TENTS — persistent condition, separate from the ephemeral tent
    // POSITIONS generated fresh each raid (window.__nightRaidTents). Raiders
    // who reach a tent during a night raid can set it alight; burnt tents
    // slowly rebuild day by day, and the camp's overall damage level
    // applies a real morale/HP penalty to EVERY defender you field —
    // normal waves included — until it's repaired. Gives real weight to
    // actually defending the tents during a raid, not just killing raiders.
    // ------------------------------------------------------------------
    const CAMP_TENT_COUNT = 5;
    const CAMP_TENT_MAX_HP = 100;
    const TENT_IGNITE_CHANCE_PER_TICK = 0.025; // ADJUST HERE — per nearby-enemy, per 500ms tick during a raid
    const TENT_IGNITE_RADIUS = 70;             // how close a raider needs to be to risk lighting a tent
    const TENT_FIRE_DAMAGE = [18, 35];         // burst damage per ignition event
    const TENT_FIRE_FLASH_MS = 3200;           // how long the flame visual plays after an ignition
    const TENT_REGEN_PER_DAY = 14;             // hp restored per tent, per day — "rebuilt overtime"
    const CAMP_DAMAGE_MORALE_PENALTY_MAX = 0.35; // up to -35% morale at a fully-burnt camp
    const CAMP_DAMAGE_HP_PENALTY_MAX = 0.18;     // up to -18% max HP at a fully-burnt camp

    function randRange([lo, hi]) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }

    // ------------------------------------------------------------------
    // FOOD/GOLD BALANCING — two independent scaling factors on top of
    // FOOD_PER_TROOP_PER_DAY, plus a gold upkeep split by unit role:
    //
    //   1. TYPE multiplier — elite/expensive units eat a bit more than
    //      cheap ones, but capped modestly (a Militia at 15 gold and an
    //      Elite Lancer at 190 gold both just need to eat; a well-fed elite
    //      soldier isn't THAT much hungrier). Scales with the unit's own
    //      recruit cost relative to Militia's, capped at +20% once cost
    //      reaches FOOD_TYPE_COST_NORM — so "Noble"-tier units land right
    //      around +20%, not scaled all the way out to War Elephant's 500.
    //   2. ROSTER-SIZE multiplier — applies to the WHOLE army's food bill,
    //      not per-unit type, and grows with total troop count. This is
    //      the actual "don't just spam Militia" lever: a 10-troop army
    //      pays close to the flat rate, a 40-troop army pays roughly
    //      double per head, a 70-troop army roughly triple. Cheap or
    //      expensive, a bloated roster gets expensive to feed.
    //   3. Gold maintenance — ranged units need resupplied ammunition,
    //      melee units barely need anything. Charged daily alongside food.
    // ------------------------------------------------------------------
    const FOOD_TYPE_MAX_BONUS = 0.20;   // elite units cap at +20% food vs. Militia
    const FOOD_TYPE_COST_NORM = 150;    // recruit-gold cost at which that +20% cap is reached
    const ROSTER_SIZE_FOOD_GROWTH = 0.02; // +2% to the WHOLE army's food bill per troop on the roster
    function foodTypeMultiplier(typeKey) {
        const template = UnitRoster.allUnits[typeKey];
        const militiaCost = (UnitRoster.allUnits["Militia"] && UnitRoster.allUnits["Militia"].cost) || 15;
        const cost = (template && template.cost) || militiaCost;
        const t = Math.max(0, Math.min(1, (cost - militiaCost) / (FOOD_TYPE_COST_NORM - militiaCost)));
        return 1 + FOOD_TYPE_MAX_BONUS * t;
    }

    const GOLD_MAINTENANCE_MELEE_PER_DAY = 0.2;  // "barely any" — mostly flavor/pressure at scale
    const GOLD_MAINTENANCE_RANGED_PER_DAY = 2.0; // ammunition resupply — 10x melee's upkeep
    const GOLD_MAINTENANCE_HEALING_FACTOR = 0.4; // wounded troops still need re-fletched arrows, just fewer
    function isRangedType(typeKey) {
        const template = UnitRoster.allUnits[typeKey];
        return !!(template && template.isRanged);
    }

    // Same "what counts as gunpowder" definition battlefield_commands.js's
    // getTacticalRole uses for its own composition analysis (role match OR
    // name/type text match) — kept in sync so a unit is never gunpowder in
    // one system and not the other.
    function isGunpowderType(typeKey) {
        const template = UnitRoster.allUnits[typeKey];
        if (!template) return false;
        const r = String(template.role || "").toUpperCase();
        const text = String((template.name || "") + " " + typeKey + " " + (template.role || "")).toLowerCase();
        return ["BOMB", "ROCKET", "FIRELANCE", "GUNNER", "MOUNTED_GUNNER"].includes(r) || /(bomb|rocket|fire|cannon|gun)/.test(text);
    }

    // ------------------------------------------------------------------
    // LOGISTICS REALISM — mounts eat too, terrain affects how hard an army
    // is to feed, seasons shift both logistics and weather over a long run.
    // All additive on top of the existing type/roster-size food math above;
    // none of this touches anything outside survivalMode.js/survivalStructures.js.
    // ------------------------------------------------------------------
    const MOUNT_FOOD_SURCHARGE = 0.35; // +35% food for anything that rides — feeding the horse too
    function isMountedType(typeKey) {
        const template = UnitRoster.allUnits[typeKey];
        if (!template) return false;
        const r = String(template.role || "").toLowerCase();
        const cavalryRole = (typeof ROLES !== "undefined" && ROLES.CAVALRY) || "cavalry";
        const horseArcherRole = (typeof ROLES !== "undefined" && ROLES.HORSE_ARCHER) || "horse_archer";
        const mountedGunnerRole = (typeof ROLES !== "undefined" && ROLES.MOUNTED_GUNNER) || "mounted_gunner";
        return r === cavalryRole || r === horseArcherRole || r === mountedGunnerRole;
    }

    // Real terrain choice (picked at the setup screen, fixed for the whole
    // run) affects how hard the army is to keep fed — grazing steppe is
    // cheap, a desert or mountain campaign is brutal on supply.
    const TERRAIN_FOOD_MODIFIER = {
        "Steppe": -0.10,
        "Plains": -0.05,
        "Forest": 0,
        "Dense Forest": 0.05,
        "Highlands": 0.10,
        "Large Mountains": 0.15,
        "Desert": 0.20
    };
    function terrainFoodMultiplier() {
        return 1 + (TERRAIN_FOOD_MODIFIER[run && run.background] || 0);
    }

    // Long runs pass through seasons — affects logistics (winter is harsher
    // on supply) and biases which weather can roll (see survivalStructures.js's
    // weatherForDay, which derives the same season independently from day
    // number using this identical cycle length so the two files never drift).
    const SEASON_LENGTH_DAYS = 20;
    const SEASON_NAMES = ["Spring", "Summer", "Autumn", "Winter"];
    function seasonForDay(day) {
        return SEASON_NAMES[Math.floor(((day || 1) - 1) / SEASON_LENGTH_DAYS) % 4];
    }
    const SEASON_FOOD_MODIFIER = { Spring: 0, Summer: -0.05, Autumn: 0.05, Winter: 0.15 };
    const SEASON_SHIPMENT_MODIFIER = { Spring: 1, Summer: 1.1, Autumn: 0.95, Winter: 0.75 };

    // Shared cost-tier unlock schedule — used for BOTH what the enemy wave
    // can roll and what the player can recruit at the day-prep shop, so the
    // two progress on the same curve. Cheap units are always in; pricier
    // tiers only unlock on/after the listed day, so top tiers are
    // mathematically near-impossible to see until deep into a run.
    const TIER_THRESHOLDS = [
        { max: 60, day: 1 },    // Tier 1 - always available
        { max: 100, day: 3 },   // Tier 2
        { max: 160, day: 7 },   // Tier 3
        { max: 250, day: 15 },  // Tier 4
        { max: Infinity, day: 25 } // Tier 5 - War Elephant, etc.
    ];
    function unlockDayForCost(cost) {
        for (const t of TIER_THRESHOLDS) { if (cost <= t.max) return t.day; }
        return 25;
    }
    function isUnitUnlockedForDay(cost, day) { return day >= unlockDayForCost(cost); }
    // Units whose unlock threshold is exactly this day - i.e. newly available
    // starting today. Used to announce new recruits on the day-prep screen.
    function unitsUnlockingOnDay(day) {
        return Object.keys(UnitRoster.allUnits).filter(key => {
            if (["Commander", "General", "Mounted General"].includes(key)) return false;
            const t = UnitRoster.allUnits[key];
            return t && unlockDayForCost(t.cost || 9999) === day;
        }).sort();
    }

    // ------------------------------------------------------------------
    // STATE
    // ------------------------------------------------------------------
    let survivalActive = false;          // true from "Begin Defense" until defeat
    let survivalUiOpen = false;           // guards the intro/setup screens
    let originalLeaveBattlefield_Survival = null;
    let survivalMonitorInterval = null;
    let survivalWaveResolved = false;     // guards against double-firing wave end
    // Loot picked up THIS wave (see registerLoot, called from
    // battlefield_logic.js's handleUnitDeath on every enemy corpse). Folded
    // into run.food/run.gold immediately as it happens; this is just the
    // running tally for that day's report, reset at the top of each wave.
    let currentWaveLoot = { food: 0, gold: 0 };
    // Night raid state — see NIGHT_RAID_* constants above and
    // startNightRaidWatch/triggerNightRaid further down.
    let nightRaidWatchInterval = null;
    let nightRaidActive = false;
    let nightRaidSpawnTimer = null;
    let nightRaidSpawnQueue = [];
    let nightRaidMonitorInterval = null;
    let nightRaidTentSnapshot = [];

    let run = null;      // the current run's persistent state (see freshRunState)
    let draft = null;    // the in-progress setup-screen selection, pre-"Begin Defense"

    function freshRunState() {
        return {
            day: 1,
            faction: "Hong Dynasty",
            color: "#d32f2f",
            background: "Plains",
            // SURGERY: array of roster-ENTRY objects (see makeRosterEntry), not
            // bare unit-type strings — a soldier now needs to carry level/exp,
            // wound/heal status, and starvation streak across days, so each one
            // needs real per-individual identity instead of just a type label.
            roster: [],
            rosterUidCounter: 1,
            preWaveCount: 0,  // roster size going into the wave that just ended, for the recap
            gold: 0,          // leftover starting gold + wave/daily rewards, spendable at the day-prep shop
            food: 0,          // set to SURVIVAL_STARTING_FOOD in beginSurvivalRun
            laborRemainingToday: 0, // this day's build budget, set once predeployment begins
            lastDayReport: null,    // most recent resolveDayEconomy() + handleWaveCleared() report
            nightRaidCooldown: 0,   // days remaining before another night raid can roll
            campTents: []           // persistent tent condition, populated in beginSurvivalRun
        };
    }

    // A single persistent soldier. type is the key into UnitRoster.allUnits;
    // everything else is per-individual state that survives across days.
    function makeRosterEntry(typeKey) {
        return {
            uid: run.rosterUidCounter++,
            type: typeKey,
            experience: 0,
            experienceLevel: 1,
            wounded: false,
            healDaysLeft: 0,   // >0 = recovering, sits out battles, eats less
            starveDays: 0,     // consecutive days without a full ration
            statPenaltyPct: 0  // cumulative stat penalty from starvation, resets once fed
        };
    }
    function rosterIsFightable(entry) { return !entry.healDaysLeft || entry.healDaysLeft <= 0; }

    // 0 (pristine) to 1 (every tent burnt to nothing) — the single source
    // of truth for how damaged the camp currently is. Read by both battle
    // spawners to apply the morale/HP penalty, and by resolveDayEconomy's
    // daily regen tick.
    function campDamageFraction() {
        if (!run || !Array.isArray(run.campTents) || run.campTents.length === 0) return 0;
        let totalMax = 0, totalHp = 0;
        run.campTents.forEach(t => { totalMax += t.maxHp; totalHp += t.hp; });
        return totalMax > 0 ? Math.max(0, 1 - (totalHp / totalMax)) : 0;
    }

    // Today's structure-building budget: scales with how many troops are
    // actually standing (wounded/healing troops can't swing a shovel either).
    function computeLaborBudget(roster) {
        const active = roster.filter(rosterIsFightable).length;
        return Math.max(LABOR_BASE_MINIMUM, Math.round(active * LABOR_PER_TROOP));
    }

    // ------------------------------------------------------------------
    // SMALL SHARED UI HELPERS (match the game's existing Georgia/gold look)
    // ------------------------------------------------------------------
    function svBtn(text, onClick, opts) {
        opts = opts || {};
        const btn = document.createElement("button");
        btn.innerText = text;
        btn.style.background = "linear-gradient(to bottom, #7b1a1a, #4a0a0a)";
        btn.style.color = "#f5d76e";
        btn.style.border = "1px solid #d4b886";
        btn.style.padding = opts.small ? "8px 16px" : "12px 28px";
        btn.style.fontFamily = "Georgia, serif";
        btn.style.fontSize = opts.small ? "13px" : "16px";
        btn.style.letterSpacing = "1px";
        btn.style.cursor = "pointer";
        btn.style.borderRadius = "3px";
        btn.onmouseenter = () => btn.style.background = "linear-gradient(to bottom, #b71c1c, #7b1a1a)";
        btn.onmouseleave = () => btn.style.background = "linear-gradient(to bottom, #7b1a1a, #4a0a0a)";
        btn.onclick = () => {
            if (typeof AudioManager !== "undefined") AudioManager.playSound("ui_click");
            onClick();
        };
        return btn;
    }

    function svOverlay(id) {
        const old = document.getElementById(id);
        if (old) old.remove();
        const el = document.createElement("div");
        el.id = id;
        el.style.position = "fixed";
        el.style.top = "0"; el.style.left = "0";
        el.style.width = "100%"; el.style.height = "100%";
        el.style.background = "rgba(10, 5, 5, 0.92)";
        el.style.zIndex = "99990";
        el.style.display = "flex";
        el.style.flexDirection = "column";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        el.style.fontFamily = "Georgia, serif";
        el.style.color = "#f5d76e";
        document.body.appendChild(el);
        return el;
    }

    function squareDeployZone(anchorX, anchorY) {
        const W = BATTLE_WORLD_WIDTH, H = BATTLE_WORLD_HEIGHT;
        const margin = 60;
        const cx = Math.max(margin + DEPLOY_ZONE_HALF, Math.min(W - margin - DEPLOY_ZONE_HALF, anchorX));
        const cy = Math.max(margin + DEPLOY_ZONE_HALF, Math.min(H - margin - DEPLOY_ZONE_HALF, anchorY));
        return {
            type: "land",
            minX: Math.max(margin, cx - DEPLOY_ZONE_HALF),
            maxX: Math.min(W - margin, cx + DEPLOY_ZONE_HALF),
            minY: Math.max(margin, cy - DEPLOY_ZONE_HALF),
            maxY: Math.min(H - margin, cy + DEPLOY_ZONE_HALF)
        };
    }

    // ------------------------------------------------------------------
    // FACTION / UNIT HELPERS — delegate to custom_battle_gui.js's exports
    // ------------------------------------------------------------------
    function getFactionList() {
        if (typeof FACTIONS !== "undefined") {
            return Object.keys(FACTIONS).filter(f => f !== "Bandits" && f !== "Player's Kingdom" && f !== "Player");
        }
        return ["Generic"];
    }

    function getUnitsForFaction(factionName) {
        if (typeof window.getAvailableUnitsForFaction === "function") {
            return window.getAvailableUnitsForFaction(factionName);
        }
        // Fallback if custom_battle_gui.js hasn't loaded for some reason
        return Object.keys(UnitRoster.allUnits)
            .filter(k => !["Commander", "General", "Mounted General"].includes(k))
            .sort();
    }

    function factionColor(factionName) {
        return (typeof FACTIONS !== "undefined" && FACTIONS[factionName]) ? FACTIONS[factionName].color : "#d32f2f";
    }

    // Picks a random real faction to raid THIS day (rather than the old fixed
    // "Bandits" for the whole run). Avoids mirror-matching the player's own
    // faction when another option exists, purely so "today's enemy" reads as
    // a distinct rival rather than a copy of your own army.
    function pickDailyEnemyFaction() {
        const factions = getFactionList();
        if (factions.length === 0) return ENEMY_FACTION;
        const pool = factions.length > 1 ? factions.filter(f => f !== run.faction) : factions;
        const chosen = pool.length > 0 ? pool : factions;
        return chosen[Math.floor(Math.random() * chosen.length)];
    }

    // ------------------------------------------------------------------
    // ENEMY IDENTITY & VARIETY — each real faction gets a short, historically
    // -flavored fighting style (loosely inspired by the real polities this
    // setting's names echo, kept general rather than claiming precise
    // historical events) plus an "elite" formation name used when a
    // notable raid rolls a commander. Purely flavor + light composition
    // bias — none of this touches AI/targeting logic in the shared engine
    // files, so custom/siege/sandbox battles are untouched.
    // ------------------------------------------------------------------
    const FACTION_FLAVOR = {
        "Hong Dynasty": { style: "disciplined ranks of crossbows and gunpowder", eliteName: "Palace Guard" },
        "Dab Tribes": { style: "swift horsemen out of the open steppe", eliteName: "Chieftain's Honor Guard" },
        "Great Khaganate": { style: "horse archers who strike and vanish before you can answer", eliteName: "Keshig" },
        "Jinlord Confederacy": { style: "armored lancers backed by disciplined foot", eliteName: "Iron Vanguard" },
        "Tran Realm": { style: "jungle-hardened skirmishers and war elephants", eliteName: "Royal Elephant Corps" },
        "Goryun Kingdom": { style: "fortress-drilled spearmen and archers", eliteName: "Palace Sworn" },
        "Xiaran Dominion": { style: "desert cavalry bred for long marches", eliteName: "Sand Wolves" },
        "High Plateau Kingdoms": { style: "hardy mountain warriors who never tire", eliteName: "Highland Oathsworn" },
        "Yamato Clans": { style: "disciplined swordsmen bound by honor", eliteName: "Blade Retinue" },
        "Bandits": { style: "opportunists with more numbers than discipline", eliteName: "Bandit Captain's Crew" }
    };
    function factionFlavor(factionName) {
        return FACTION_FLAVOR[factionName] || { style: "a raiding column of mixed troops", eliteName: "Vanguard" };
    }

    // One-time narrative beats at specific day thresholds — pure flavor,
    // shown once on the day-prep screen for the day about to begin. Gives
    // a long run a sense of escalating stakes instead of every day reading
    // identically past the numbers changing.
    const CAMPAIGN_MILESTONES = {
        5: "Word spreads of your stand. Enemy scouts grow bolder from here on.",
        10: "Ten days held. Rival warbands take notice — do not be surprised if a genuine warlord's banner appears soon.",
        15: "Fifteen days. Whispers among the raiders speak of numbers being gathered that no simple raid would explain.",
        20: "Twenty days. Few commanders hold a frontier line this long. The enemy is no longer testing you.",
        25: "Twenty-five days. Even the hardiest raiding chiefs are running low on patience — and supplies of their own.",
        30: "Thirty days held. Word of this stand has reached the capital. You have already outlasted every expectation."
    };
    function campaignMilestoneNote(day) {
        if (CAMPAIGN_MILESTONES[day]) return CAMPAIGN_MILESTONES[day];
        if (day > 30 && day % 10 === 0) return `Day ${day} held. An old commander's tale in the making.`;
        return null;
    }

    // Rolls whether today's raid is a routine skirmish or something bigger.
    // Winter gets a bump — desperate raiders pressing harder when their own
    // supplies run thin is the historically-grounded justification, mirrors
    // the food-upkeep Winter penalty already applied to the player's own side.
    const NOTABLE_RAID_BASE_CHANCE = 0.12;
    const NOTABLE_RAID_WINTER_BONUS = 0.06;
    function rollNotableRaid(day, season) {
        if (day < 4) return null; // let the player get established first
        const chance = NOTABLE_RAID_BASE_CHANCE + (season === "Winter" ? NOTABLE_RAID_WINTER_BONUS : 0);
        if (Math.random() > chance) return null;
        return Math.random() < 0.6 ? "warband" : "elite";
    }

    // dummyUnit for static card rendering (mirrors custom_battle_gui.js's own copy)
    const dummyUnit = { id: 1, stats: { ammo: 10 }, ammo: 10, state: "idle" };

    function visTypeFor(unitKey, template) {
        let visType = "peasant";
        const role = template.role;
        const R = (typeof ROLES !== "undefined") ? ROLES : {};
        if (role === R.CAVALRY || role === R.MOUNTED_GUNNER) {
            visType = unitKey === "War Elephant" ? "elephant"
                : role === R.MOUNTED_GUNNER ? "camel_cannon"
                : (unitKey.includes("Camel") ? "camel" : "cavalry");
        } else if (role === R.HORSE_ARCHER) visType = "horse_archer";
        else if (role === R.PIKE || unitKey.includes("Glaive")) visType = "spearman";
        else if (role === R.SHIELD) visType = "sword_shield";
        else if (role === R.TWO_HANDED) visType = "two_handed";
        else if (role === R.CROSSBOW) visType = "crossbow";
        else if (role === R.FIRELANCE) visType = "firelance";
        else if (role === R.ARCHER) visType = "archer";
        else if (role === R.THROWING) visType = "throwing";
        else if (role === R.GUNNER) visType = "gun";
        else if (role === R.BOMB) visType = "bomb";
        else if (role === R.ROCKET) visType = "rocket";
        return visType;
    }

    // ========================================================================
    // SELF-CONTAINED SPAWNER — deliberately NOT reusing custom_battle_gui.js's
    // customSpawnLoop/lastResort. Adapted from that file's proven logic, but
    // duplicated here so Survival never depends on another file's internal
    // exports existing at runtime (see the SURGERY note at the call site).
    // ========================================================================
    function survivalSpawnLoop(rosterArray, side, faction, color, raidType) {
        let startY = side === "player" ? BATTLE_WORLD_HEIGHT - 40 : Math.min(600, BATTLE_WORLD_HEIGHT * 0.15);
        let centerX = BATTLE_WORLD_WIDTH / 2;
        let rankDir = side === "player" ? 1 : -1;
        let spacingX = 22;
        let spacingY = 18;
        let currentX = centerX - (10 * spacingX) / 2;
        let currentY = startY;
        let col = 0;

        // SURGERY: rosterArray is roster-ENTRY objects for the player side now
        // (see makeRosterEntry), still plain unit-type strings for the enemy
        // side (generateEnemyWaveRoster is unchanged) — sort by type either way.
        let sortedRoster = [...rosterArray].sort((a, b) => {
            const ak = (a && typeof a === "object") ? a.type : a;
            const bk = (b && typeof b === "object") ? b.type : b;
            return String(ak).localeCompare(String(bk));
        });
        const geo = window.battleSpawnAssignment ? window.battleSpawnAssignment[side] : null;
        const oldForwardSign = (side === "player") ? -1 : 1;

        // SURGERY: weather is constant for the whole battle, so it's looked
        // up ONCE here instead of per-unit inside the loop below. Rain now
        // does three things, all data-driven off the same weather profile
        // survivalStructures.js's visual rain overlay already uses:
        //   - Gunpowder units (Bomb/Rocket/Firelance/Gunner/Mounted Gunner)
        //     lose their ammo entirely — wet powder.
        //   - Everyone moves a bit slower — mud.
        //   - Bow/crossbow-type ranged units lose some accuracy — wet
        //     bowstrings, a real historical factor (see: Agincourt).
        // Applies to both sides equally; rain doesn't pick favorites.
        const RAIN_SPEED_PENALTY = 0.12;
        const RAIN_BOWSTRING_ACCURACY_PENALTY = 0.18;
        let currentWeather = null;
        if (window.SurvivalStructures && typeof window.SurvivalStructures.getWeather === "function") {
            currentWeather = window.SurvivalStructures.getWeather();
        }
        // Snow counts as precipitation too — a blizzard wets gunpowder and
        // slows movement at least as much as rain does, not "technically
        // not rain so it's exempt."
        const isRaining = !!(currentWeather && ((currentWeather.rain || 0) > 0 || (currentWeather.snow || 0) > 0));

        sortedRoster.forEach(item => {
            const isEntry = item && typeof item === "object";
            const unitKey = isEntry ? item.type : item;

            let template = UnitRoster.allUnits[unitKey] || UnitRoster.allUnits["Militia"];
            let unitStats = Object.assign(new Troop(template.name, template.role, template.isLarge, faction), template);
            unitStats.morale = 20;
            unitStats.maxMorale = 20;

            if (isEntry) {
                // Persisted progress: seed exp/level from the roster entry, then
                // replay the stat bumps gainExperience() would have already
                // granted (+2 melee atk/def, +10 health per level) — units are
                // rebuilt from template fresh every spawn in this file, so the
                // bumps themselves aren't stored, just the level that earned them.
                unitStats.experience = item.experience || 0;
                unitStats.experienceLevel = item.experienceLevel || 1;
                const levelsEarned = Math.max(0, unitStats.experienceLevel - 1);
                if (levelsEarned > 0) {
                    unitStats.meleeAttack = (unitStats.meleeAttack || 0) + levelsEarned * 2;
                    unitStats.meleeDefense = (unitStats.meleeDefense || 0) + levelsEarned * 2;
                    unitStats.health = (unitStats.health || 100) + levelsEarned * 10;
                }
                // Starvation penalty — multiplicative, applied fresh each spawn
                // (statPenaltyPct itself resets to 0 in resolveDayEconomy the
                // first day the unit is properly fed again).
                if (item.statPenaltyPct > 0) {
                    const mult = 1 - item.statPenaltyPct;
                    unitStats.meleeAttack *= mult;
                    unitStats.meleeDefense *= mult;
                    unitStats.speed *= mult;
                    unitStats.accuracy *= mult;
                    unitStats.missileBaseDamage *= mult;
                }
                // Camp damage penalty — a burnt camp saps morale and health
                // for EVERY defender fielded, not just night-raid ones, until
                // the tents are rebuilt (see campDamageFraction).
                const campDmg = campDamageFraction();
                if (campDmg > 0) {
                    unitStats.morale = Math.round((unitStats.morale || 20) * (1 - CAMP_DAMAGE_MORALE_PENALTY_MAX * campDmg));
                    unitStats.maxMorale = Math.round((unitStats.maxMorale || 20) * (1 - CAMP_DAMAGE_MORALE_PENALTY_MAX * campDmg));
                    unitStats.health = Math.round((unitStats.health || 100) * (1 - CAMP_DAMAGE_HP_PENALTY_MAX * campDmg));
                }
            }

            let tacOffset = { x: 0, y: 0 };
            if (typeof getTacticalPosition === "function") {
                tacOffset = getTacticalPosition(template.role, side, unitKey) || { x: 0, y: 0 };
            }

            let safeHP = unitStats.health || unitStats.hp || unitStats.maxHealth || template.health || 100;
            let visType = visTypeFor(unitKey, template);

            // Rain soaks gunpowder entirely, slows everyone a bit (mud),
            // and specifically wets bowstrings (bow/crossbow accuracy) —
            // gunpowder units are excluded from the bowstring penalty since
            // they already lose their ammo outright above.
            let effectiveAmmo = unitStats.ammo || template.ammo || 0;
            if (isRaining) {
                if (isGunpowderType(unitKey)) {
                    effectiveAmmo = 0;
                } else if (unitStats.isRanged) {
                    unitStats.accuracy = (unitStats.accuracy || 0) * (1 - RAIN_BOWSTRING_ACCURACY_PENALTY);
                }
                unitStats.speed = (unitStats.speed || 0) * (1 - RAIN_SPEED_PENALTY);
            }

            let unitX, unitY;
            if (geo) {
                const acrossOffsetTotal = (currentX - centerX) + tacOffset.x;
                const forwardOffsetTotal = (tacOffset.y * oldForwardSign) - (currentY - startY);
                unitX = geo.ax + geo.across.x * acrossOffsetTotal + geo.forward.x * forwardOffsetTotal;
                unitY = geo.ay + geo.across.y * acrossOffsetTotal + geo.forward.y * forwardOffsetTotal;
            } else {
                unitX = currentX + tacOffset.x;
                unitY = currentY + tacOffset.y;
            }

            battleEnvironment.units.push({
                id: Math.floor(Math.random() * 999999),
                side: side, faction: faction, color: color, unitType: unitKey,
                disableAICombat: false,
                stats: unitStats,
                hp: safeHP, maxHp: safeHP,
                ammo: effectiveAmmo,
                renderType: visType,
                x: unitX + (Math.random() - 0.5) * 5,
                y: unitY + (Math.random() - 0.5) * 5,
                vx: 0, vy: 0,
                direction: rankDir,
                anim: Math.floor(Math.random() * 100),
                frame: 0, isMoving: false, target: null, state: "idle",
                animOffset: Math.random() * 100, cooldown: 0,
                // Player defenders default to "hold the line": no auto-charge
                // toward the enemy the instant combat starts. They still
                // self-defend and fire at anything in range (hold_position
                // is the same state the "Stand Ground" RTS command uses) -
                // this only blocks the automatic advance, not combat. Enemy
                // raiders keep their normal aggressive default.
                hasOrders: side === "player",
                orderType: side === "player" ? "hold_position" : undefined,
                // SURGERY: ties this battle unit back to its persistent roster
                // entry so handleWaveCleared can harvest exp/level and resolve
                // wound-vs-death onto the RIGHT individual soldier afterward.
                _survivalRosterUid: isEntry ? item.uid : undefined
            });

            col++;
            currentX += spacingX;
            if (col >= 10) {
                col = 0;
                currentX = centerX - (10 * spacingX) / 2;
                currentY += spacingY * rankDir;
            }
        });

        // Commander
        let disableAICombatSide = side === "player";
        let cmdrName = "General";
        let baseGeneral = UnitRoster.allUnits[cmdrName] || {};
        let cmdrRole = baseGeneral.role || (typeof ROLES !== "undefined" ? ROLES.HORSE_ARCHER : "horse_archer");
        let cmdrStats = Object.assign(new Troop(cmdrName, cmdrRole, true, faction), baseGeneral);
        cmdrStats.health = cmdrStats.health || 140;
        cmdrStats.meleeAttack = cmdrStats.meleeAttack || 22;
        cmdrStats.meleeDefense = cmdrStats.meleeDefense || 5;
        cmdrStats.missileBaseDamage = cmdrStats.missileBaseDamage || 14;
        cmdrStats.missileAPDamage = cmdrStats.missileAPDamage || 8;
        cmdrStats.armor = cmdrStats.armor || 20;
        cmdrStats.accuracy = cmdrStats.accuracy || 72;
        cmdrStats.range = cmdrStats.range || 700;
        cmdrStats.ammo = cmdrStats.ammo || 24;
        cmdrStats.morale = cmdrStats.morale || 95;
        cmdrStats.speed = cmdrStats.speed || 2.0;
        cmdrStats.experienceLevel = cmdrStats.experienceLevel || 5;

        // SURGERY: notable raids get a named, tougher enemy commander —
        // display name only (stats.name, already preferred by the hover
        // tooltip over unitType), so unitType stays "General" for any
        // game-logic lookups elsewhere in the shared engine. Stat bump is
        // modest for a "warband" vanguard leader, bigger for a genuine
        // "elite" formation commander.
        if (side === "enemy" && raidType) {
            const flavor = factionFlavor(faction);
            cmdrStats.name = raidType === "elite" ? flavor.eliteName : `${flavor.eliteName} Vanguard`;
            const bonus = raidType === "elite" ? 1.35 : 1.15;
            cmdrStats.health = Math.round(cmdrStats.health * bonus);
            cmdrStats.meleeAttack = Math.round(cmdrStats.meleeAttack * bonus);
            cmdrStats.meleeDefense = Math.round(cmdrStats.meleeDefense * bonus);
            cmdrStats.armor = Math.round(cmdrStats.armor * bonus);
            cmdrStats.experienceLevel = Math.min(10, cmdrStats.experienceLevel + (raidType === "elite" ? 3 : 1));
        }
        let finalMaxHp = cmdrStats.health || 200;
        let finalAmmo = cmdrStats.ammo || 24;

        battleEnvironment.units.push({
            id: disableAICombatSide ? 999999 : 888888 + Math.floor(Math.random() * 1000),
            side: side, faction: faction, color: color, unitType: cmdrName, isCommander: true,
            disableAICombat: (side === "player"),
            stats: cmdrStats,
            hp: finalMaxHp, maxHp: finalMaxHp, ammo: finalAmmo,
            renderType: "horse_archer",
            x: geo ? (geo.ax + geo.forward.x * 80) : centerX,
            y: geo ? (geo.ay + geo.forward.y * 80) : (startY - (80 * rankDir)),
            vx: 0, vy: 0, direction: rankDir, anim: 0, frame: 0, isMoving: false,
            target: null, state: "idle", animOffset: Math.random() * 100, cooldown: 0, hasOrders: false
        });

        if (disableAICombatSide && typeof player !== "undefined") {
            player.hp = finalMaxHp;
            player.maxHealth = finalMaxHp;
            player.ammo = finalAmmo;
        }
    }

    function survivalLastResort(unit, worldWidth, worldHeight, side, index) {
        const PADDING = 100;
        const STAGGER_GAP = 35;
        const UNITS_PER_ROW = 10;
        const isOutOfBounds = (unit.x < 0 || unit.x > worldWidth || unit.y < 0 || unit.y > worldHeight);
        if (!isOutOfBounds) return;

        const row = Math.floor(index / UNITS_PER_ROW);
        const col = index % UNITS_PER_ROW;
        const offsetAcross = col * STAGGER_GAP;
        const offsetRear = row * STAGGER_GAP;
        const geo = window.battleSpawnAssignment ? window.battleSpawnAssignment[side] : null;

        if (geo) {
            unit.x = geo.ax + geo.across.x * offsetAcross + geo.rear.x * offsetRear;
            unit.y = geo.ay + geo.across.y * offsetAcross + geo.rear.y * offsetRear;
            unit.x = Math.max(PADDING, Math.min(worldWidth - PADDING, unit.x));
            unit.y = Math.max(PADDING, Math.min(worldHeight - PADDING, unit.y));
        } else if (side === "player") {
            unit.x = PADDING + offsetAcross;
            unit.y = worldHeight - PADDING - offsetRear;
        } else {
            unit.x = worldWidth - PADDING - offsetAcross;
            unit.y = PADDING + offsetRear;
        }
    }

    // Builds the visual card (canvas portrait + name/cost labels) with no
    // click behavior attached — shared by the setup-screen catalog and the
    // day-prep recruit shop, which each wire up their own onclick.
    function buildUnitCardVisual(unitKey, color) {
        const template = UnitRoster.allUnits[unitKey];
        if (!template) return null;
        const cost = template.cost || 50;

        const card = document.createElement("div");
        card.style.width = "70px";
        card.style.height = "100px";
        card.style.background = "linear-gradient(to bottom, #d4b886, #8d6e63)";
        card.style.border = "1px solid #3e2723";
        card.style.borderRadius = "4px";
        card.style.cursor = "pointer";
        card.style.position = "relative";
        card.style.boxShadow = "2px 2px 5px rgba(0,0,0,0.5)";
        card.style.transition = "transform 0.1s";
        card.onmouseenter = () => card.style.transform = "scale(1.05)";
        card.onmouseleave = () => card.style.transform = "scale(1)";

        const canvas = document.createElement("canvas");
        canvas.width = 70; canvas.height = 70;
        canvas.style.position = "absolute";
        canvas.style.top = "0px"; canvas.style.left = "0px";
        const ctx = canvas.getContext("2d");
        ctx.translate(35, 55);

        const visType = visTypeFor(unitKey, template);
        if (["cavalry", "elephant", "camel", "horse_archer", "camel_cannon"].includes(visType)) {
            drawCavalryUnit(ctx, 0, 0, false, 10, color, false, visType, "player", unitKey, false, 0, 10, dummyUnit, 0);
        } else {
            drawInfantryUnit(ctx, 0, 0, false, 10, color, visType, false, "player", unitKey, false, 0, 10, dummyUnit, 0);
        }

        const nameLabel = document.createElement("div");
        nameLabel.innerText = unitKey;
        nameLabel.style.position = "absolute";
        nameLabel.style.bottom = "12px"; nameLabel.style.width = "100%";
        nameLabel.style.textAlign = "center"; nameLabel.style.fontSize = "9px";
        nameLabel.style.fontWeight = "bold"; nameLabel.style.color = "#111";
        nameLabel.style.background = "rgba(255,255,255,0.7)";

        const costLabel = document.createElement("div");
        costLabel.innerText = `🪙 ${cost}`;
        costLabel.style.position = "absolute";
        costLabel.style.bottom = "0"; costLabel.style.width = "100%";
        costLabel.style.textAlign = "center"; costLabel.style.fontSize = "10px";
        costLabel.style.background = "#2b2b2b"; costLabel.style.color = "#f5d76e";

        card.appendChild(canvas);
        card.appendChild(nameLabel);
        card.appendChild(costLabel);
        return { card, cost };
    }

    // Setup-screen card — operates on the pre-run `draft` budget/roster.
    function createSurvivalUnitCard(unitKey, color, isCatalog) {
        const visual = buildUnitCardVisual(unitKey, color);
        if (!visual) return document.createElement("div");
        const { card, cost } = visual;
        card.onclick = () => {
            if (isCatalog) {
                if (draft.cost + cost > SURVIVAL_STARTING_GOLD) return;
                if (draft.roster.length >= 100) return;
                draft.roster.push(unitKey);
                draft.cost += cost;
                draft.roster.sort();
                if (typeof AudioManager !== "undefined") AudioManager.playSound("gold_buy");
            } else {
                const idx = draft.roster.indexOf(unitKey);
                if (idx > -1) {
                    draft.roster.splice(idx, 1);
                    draft.cost -= cost;
                }
            }
            refreshSetupUI();
        };
        return card;
    }

    // Day-prep recruit-shop card — operates on the live `run` gold/roster.
    // Clicking always buys (there's no "tray" here; recruits go straight
    // into the standing roster carried into the next wave).
    function createRecruitCard(unitKey, color) {
        const visual = buildUnitCardVisual(unitKey, color);
        if (!visual) return document.createElement("div");
        const { card, cost } = visual;
        if (run.gold < cost) card.style.opacity = "0.45";
        card.onclick = () => {
            if (run.gold < cost) {
                if (typeof AudioManager !== "undefined") AudioManager.playSound("error");
                return;
            }
            run.gold -= cost;
            run.roster.push(makeRosterEntry(unitKey));
            run.roster.sort((a, b) => a.type.localeCompare(b.type));
            if (typeof AudioManager !== "undefined") AudioManager.playSound("gold_buy");
            refreshPrepUI();
        };
        return card;
    }

    // Faction-legal units the player can currently recruit, gated by the
    // same day-based tier schedule the enemy wave generator uses.
    function getRecruitableUnits(day, faction) {
        return getUnitsForFaction(faction).filter(unitKey => {
            const t = UnitRoster.allUnits[unitKey];
            return t && isUnitUnlockedForDay(t.cost || 9999, day);
        });
    }

    // Filled in by buildSurvivalSetupUI()/showDayPrepMenu(); called on every
    // draft/run mutation to re-render the relevant screen in place.
    let refreshSetupUI = function () {};
    let refreshPrepUI = function () {};

    // SURVIVAL STRUCTURES: read/spend accessor for the run's gold, so
    // battle_engine/survival_structures.js can charge for fortifications
    // without needing access to the private `run` variable in this closure.
    // Arrow functions here close over the `run` binding, not its current
    // value, so this is safe to define before a run actually exists.
    window.SurvivalRun = {
        getGold: () => (run ? run.gold : 0),
        spendGold: (amount) => {
            if (!run || run.gold < amount) return false;
            run.gold -= amount;
            updateSurvivalResourceHud();
            return true;
        },
        // Used to undo an in-progress spend, e.g. cancelling a drag-drawn
        // trench line mid-stroke refunds the segments already committed.
        refundGold: (amount) => {
            if (!run || !amount) return;
            run.gold += amount;
            updateSurvivalResourceHud();
        },

        // SURGERY: food + labor accessors, added alongside the gold ones
        // above. Labor is survivalStructures.js's build currency now (see
        // that file's getLabor/spendLabor/refundLabor) — same shape as gold
        // on purpose, just a different pool with its own daily refill.
        getFood: () => (run ? run.food : 0),
        getLabor: () => (run ? run.laborRemainingToday : 0),
        spendLabor: (amount) => {
            if (!run || run.laborRemainingToday < amount) return false;
            run.laborRemainingToday -= amount;
            updateSurvivalResourceHud();
            return true;
        },
        refundLabor: (amount) => {
            if (!run || !amount) return;
            run.laborRemainingToday += amount;
            updateSurvivalResourceHud();
        },

        // Corpse looting. Called once per enemy death from battlefield_logic.js's
        // handleUnitDeath — rolls independent chances for a small food and/or
        // gold drop, applied immediately and tallied for the day's report.
        registerLoot: (deadUnit) => {
            if (!run || !survivalActive) return;
            if (Math.random() < LOOT_FOOD_CHANCE_PER_KILL) {
                const amt = randRange(LOOT_FOOD_AMOUNT);
                run.food += amt;
                currentWaveLoot.food += amt;
            }
            if (Math.random() < LOOT_GOLD_CHANCE_PER_KILL) {
                const amt = randRange(LOOT_GOLD_AMOUNT);
                run.gold += amt;
                currentWaveLoot.gold += amt;
            }
            updateSurvivalResourceHud();
        }
    };

    // ========================================================================
    // ENTRY POINT — called from the main menu button
    // ========================================================================
    window.showSurvivalSetupMenu = function () {
        if (survivalUiOpen || survivalActive) return;
        survivalUiOpen = true;
        window.isPaused = true;
        inBattleMode = false; // guard against stale LOD/state from a previous mode

        draft = { faction: "Hong Dynasty", color: factionColor("Hong Dynasty"), background: "Plains", roster: [], cost: 0 };

        showSurvivalIntro(() => {
            buildSurvivalSetupUI();
        });
    };

    // ------------------------------------------------------------------
    // STORY INTRO
    // ------------------------------------------------------------------
    function showSurvivalIntro(onContinue) {
        const el = svOverlay("survival-intro");
        el.innerHTML = `
            <div style="max-width: 640px; text-align: center; padding: 30px; border: 1px solid #d4b886; background: rgba(20,20,20,0.7);">
                <div style="font-size: 34px; letter-spacing: 6px; color: #f5d76e;">SURVIVAL</div>
                <div style="font-size: 15px; letter-spacing: 3px; color: #a1887f; margin-top: 4px;">HOLD THE SOUTHERN LINE</div>
                <div style="line-height: 1.7; font-size: 15px; color: #d4b886; margin-top: 22px; text-align: left;">
                    Word has reached the capital: a horde is gathering beyond the frontier, and it does not stop coming.
                    You have been handed a single line to hold, a war chest of gold, and whatever
                    soldiers you can muster with it. Choose how deep that war chest runs on the next screen.
                    <br><br>
                    Choose your banner. Choose your ground. Choose your men — carefully. There is no reinforcement, and no road back
                    to the capital until the line finally breaks.
                    <br><br>
                    Hold, Commander, for as many days as you can.
                </div>
                <div style="line-height: 1.6; font-size: 13px; color: #a1887f; margin-top: 18px; text-align: left; padding: 12px 14px; background: rgba(0,0,0,0.3); border: 1px solid #4a3a2a; border-radius: 4px;">
                    <span style="color:#e8b04a; letter-spacing:1px;">⚔ A WORD OF CAUTION</span><br>
                    Enemy scouts watch your camp from a distance — they can gauge how <em>large</em> your force has grown, though
                    not what it's actually made of. A bigger army draws a bigger response: mass your numbers unwisely and the
                    raids sent against you grow to match. Quality and quantity both matter — a smaller, well-trained line
                    can hold ground that a sprawling horde of conscripts would draw disaster fielding.
                </div>
            </div>
        `;
        const btnRow = document.createElement("div");
        btnRow.style.marginTop = "26px";
        btnRow.style.display = "flex";
        btnRow.style.gap = "16px";
        btnRow.appendChild(svBtn("Take Command", () => { el.remove(); onContinue(); }));
        btnRow.appendChild(svBtn("Cancel", () => {
    window.location.reload();
}, { small: true }));
		
        el.appendChild(btnRow);
    }

    // ------------------------------------------------------------------
    // SETUP SCREEN — faction, background, gold-based roster
    // ------------------------------------------------------------------
    function buildSurvivalSetupUI() {
        const el = svOverlay("survival-setup");
        el.style.justifyContent = "flex-start";
        el.style.padding = "20px 0";

        const header = document.createElement("div");
        header.style.textAlign = "center";
        header.style.marginBottom = "10px";
        header.innerHTML = `
            <div style="font-size: 22px; letter-spacing: 3px; color: #f5d76e;">SURVIVAL SETUP</div>
            <div id="sv-gold-wisely-line" style="font-size: 12px; color: #a1887f; letter-spacing: 1px;">Spend your ${SURVIVAL_STARTING_GOLD} gold wisely — this is the only shopping trip you get.</div>
        `;
        el.appendChild(header);

        const goldRow = document.createElement("div");
        goldRow.style.display = "flex";
        goldRow.style.alignItems = "center";
        goldRow.style.justifyContent = "center";
        goldRow.style.gap = "10px";
        goldRow.style.marginBottom = "10px";
        goldRow.innerHTML = `
            <label style="color:#a1887f; font-size:13px;">Starting Gold:</label>
            <input id="sv-gold-slider" type="range" min="${SURVIVAL_GOLD_MIN}" max="${SURVIVAL_GOLD_MAX}" step="50" value="${SURVIVAL_STARTING_GOLD}" style="width:220px;">
            <span id="sv-gold-slider-value" style="color:#f5d76e; font-size:13px; min-width:40px;">${SURVIVAL_STARTING_GOLD}</span>
            <span id="sv-gold-slider-label" style="font-size:12px; letter-spacing:1px; min-width:70px; color:#8bc34a;">${goldDifficultyLabel(SURVIVAL_STARTING_GOLD)}</span>
        `;
        el.appendChild(goldRow);

        const controls = document.createElement("div");
        controls.style.display = "flex";
        controls.style.gap = "24px";
        controls.style.alignItems = "center";
        controls.style.marginBottom = "12px";
        controls.innerHTML = `
            <label style="color:#a1887f; font-size:13px;">Faction:
                <select id="sv-faction-select" style="background:#3e2723; color:#fff; border:1px solid #d4b886; padding:5px; margin-left:6px;">
                    ${getFactionList().map(f => `<option value="${f}" ${f === draft.faction ? "selected" : ""}>${f}</option>`).join("")}
                </select>
            </label>
            <label style="color:#a1887f; font-size:13px;">Battleground:
                <select id="sv-map-select" style="background:#3e2723; color:#fff; border:1px solid #d4b886; padding:5px; margin-left:6px;">
                    ${SURVIVAL_MAPS.map(m => `<option value="${m}" ${m === draft.background ? "selected" : ""}>${m}</option>`).join("")}
                </select>
            </label>
            <div style="font-size:16px; color:#f5d76e;">Gold Left: <span id="sv-gold-left">${SURVIVAL_STARTING_GOLD - draft.cost}</span></div>
            <div style="font-size:13px; color:#a1887f;">Roster: <span id="sv-roster-count">0</span></div>
        `;
        el.appendChild(controls);

        const body = document.createElement("div");
        body.style.display = "flex";
        body.style.gap = "10px";
        body.style.width = "min(1100px, 92vw)";
        body.style.height = "min(500px, 55vh)";
        body.style.background = "rgba(20,20,20,0.8)";
        body.style.border = "1px solid #d4b886";

        const catalog = document.createElement("div");
        catalog.style.flex = "1.3";
        catalog.style.overflowY = "auto";
        catalog.style.padding = "12px";
        catalog.style.display = "grid";
        catalog.style.gridTemplateColumns = "repeat(auto-fill, minmax(70px, 1fr))";
        catalog.style.gap = "10px";
        catalog.style.alignContent = "start";
        catalog.style.borderRight = "2px solid #d4b886";

        const trayContainer = document.createElement("div");
        trayContainer.style.flex = "1";
        trayContainer.style.display = "flex";
        trayContainer.style.flexDirection = "column";
        trayContainer.style.padding = "12px";
        trayContainer.style.minHeight = "0";

        const trayHeader = document.createElement("div");
        trayHeader.style.display = "flex";
        trayHeader.style.justifyContent = "space-between";
        trayHeader.style.alignItems = "center";
        trayHeader.style.marginBottom = "8px";
        trayHeader.innerHTML = `<div style="color:#a1887f; font-size:12px;">YOUR STARTING FORCE</div>`;
        const clearBtn = document.createElement("button");
        clearBtn.innerText = "✖ Clear";
        clearBtn.style.background = "rgba(244,67,54,0.4)";
        clearBtn.style.color = "#fff";
        clearBtn.style.border = "1px solid #f44336";
        clearBtn.style.fontSize = "11px";
        clearBtn.style.padding = "5px 10px";
        clearBtn.style.cursor = "pointer";
        clearBtn.style.fontFamily = "Georgia, serif";
        clearBtn.onclick = () => { draft.roster = []; draft.cost = 0; refreshSetupUI(); };
        trayHeader.appendChild(clearBtn);
        trayContainer.appendChild(trayHeader);

        const tray = document.createElement("div");
        tray.style.display = "flex";
        tray.style.flexWrap = "wrap";
        tray.style.gap = "5px";
        tray.style.overflowY = "auto";
        tray.style.alignContent = "flex-start";
        trayContainer.appendChild(tray);

        body.appendChild(catalog);
        body.appendChild(trayContainer);
        el.appendChild(body);

        const errorLine = document.createElement("div");
        errorLine.style.color = "#f44336";
        errorLine.style.fontSize = "13px";
        errorLine.style.height = "18px";
        errorLine.style.marginTop = "10px";
        el.appendChild(errorLine);

        const footer = document.createElement("div");
        footer.style.display = "flex";
        footer.style.gap = "16px";
        footer.style.marginTop = "8px";
        const beginBtn = svBtn("⚔ BEGIN DEFENSE", () => {
            if (draft.roster.length === 0) {
                errorLine.innerText = "You need at least one soldier to hold the line.";
                if (typeof AudioManager !== "undefined") AudioManager.playSound("error");
                return;
            }
            if (draft.cost > SURVIVAL_STARTING_GOLD) {
                errorLine.innerText = "You're over budget — drop some troops or raise your starting gold.";
                if (typeof AudioManager !== "undefined") AudioManager.playSound("error");
                return;
            }
            el.remove();
            survivalUiOpen = false;
            beginSurvivalRun();
        });
        const backBtn = svBtn("🔙 Main Menu", () => {
            window.location.reload();
        }, { small: true });
        footer.appendChild(beginBtn);
        footer.appendChild(backBtn);
        el.appendChild(footer);

        refreshSetupUI = function () {
            const goldEl = document.getElementById("sv-gold-left");
            if (goldEl) {
                const left = SURVIVAL_STARTING_GOLD - draft.cost;
                goldEl.innerText = left;
                goldEl.style.color = left < 0 ? "#f44336" : "#f5d76e";
            }
            const wiselyEl = document.getElementById("sv-gold-wisely-line");
            if (wiselyEl) wiselyEl.innerText = `Spend your ${SURVIVAL_STARTING_GOLD} gold wisely — this is the only shopping trip you get.`;
            const countEl = document.getElementById("sv-roster-count");
            if (countEl) countEl.innerText = draft.roster.length;

            tray.innerHTML = "";
            draft.roster.forEach(unitKey => tray.appendChild(createSurvivalUnitCard(unitKey, draft.color, false)));

            catalog.innerHTML = "";
            getUnitsForFaction(draft.faction).forEach(unitKey => catalog.appendChild(createSurvivalUnitCard(unitKey, draft.color, true)));

            if (draft.cost <= SURVIVAL_STARTING_GOLD) errorLine.innerText = "";
        };

        setTimeout(() => {
            const factionSelect = document.getElementById("sv-faction-select");
            if (factionSelect) {
                factionSelect.addEventListener("change", e => {
                    draft.faction = e.target.value;
                    draft.color = factionColor(draft.faction);
                    draft.roster = [];
                    draft.cost = 0;
                    refreshSetupUI();
                });
            }
            const mapSelect = document.getElementById("sv-map-select");
            if (mapSelect) {
                mapSelect.addEventListener("change", e => { draft.background = e.target.value; });
            }
            const goldSlider = document.getElementById("sv-gold-slider");
            if (goldSlider) {
                goldSlider.addEventListener("input", e => {
                    SURVIVAL_STARTING_GOLD = parseInt(e.target.value, 10) || SURVIVAL_GOLD_MIN;
                    const valEl = document.getElementById("sv-gold-slider-value");
                    if (valEl) valEl.innerText = SURVIVAL_STARTING_GOLD;
                    const lblEl = document.getElementById("sv-gold-slider-label");
                    if (lblEl) lblEl.innerText = goldDifficultyLabel(SURVIVAL_STARTING_GOLD);
                    refreshSetupUI();
                });
            }
            refreshSetupUI();
        }, 0);
    }

    // ========================================================================
    // BEGIN A NEW RUN
    // ========================================================================
    function beginSurvivalRun() {
        run = freshRunState();
        window.__survivalDay = run.day;
        // SURGERY: per-run weather seed — so "day 7" doesn't look identical
        // across every run, while staying deterministic *within* a run (see
        // weatherForDay in survivalStructures.js).
        window.__survivalWeatherSeed = Math.floor(Math.random() * 100000);
        run.faction = draft.faction;
        run.color = draft.color;
        run.background = draft.background;
        // SURGERY: draft.roster is still plain unit-type strings (the setup
        // screen never needed per-soldier identity) — convert to persistent
        // roster-entry objects exactly once, here, at the draft→run boundary.
        run.roster = draft.roster.map(unitKey => makeRosterEntry(unitKey));
        run.gold = SURVIVAL_STARTING_GOLD - draft.cost; // leftover carries forward into day 1's prep shop
        run.food = SURVIVAL_STARTING_FOOD;
        // Persistent camp tent condition — separate from the fresh
        // positions generated each night raid. See CAMP_TENT_* constants.
        run.campTents = [];
        for (let i = 0; i < CAMP_TENT_COUNT; i++) {
            run.campTents.push({ id: i, hp: CAMP_TENT_MAX_HP, maxHp: CAMP_TENT_MAX_HP });
        }
        survivalActive = true;
        survivalWaveResolved = false;
        currentWaveLoot = { food: 0, gold: 0 };
        // SURVIVAL STRUCTURES: clear any fortifications from a previous run
        // (only relevant on "Try Again" — page reload already wipes this).
        if (window.SurvivalStructures && typeof window.SurvivalStructures.resetAll === "function") {
            window.SurvivalStructures.resetAll();
        }
        launchSurvivalDay();
    }

    // ========================================================================
    // LAUNCH THE CURRENT DAY'S WAVE
    // ========================================================================
    function launchSurvivalDay() {
        // SURGERY: hide the canvas FIRST, before anything else — belt and
        // suspenders against the "flash of map mid-generation" bug. The
        // transition overlay covering it via z-index should already be
        // enough, but display:none guarantees the canvas contributes zero
        // pixels to any paint regardless of exact opacity/transition timing,
        // so there's no way to ever see terrain generation in progress.
        const preHideCanvas = document.getElementById("gameCanvas");
        if (preHideCanvas) preHideCanvas.style.display = "none";

        // SURGERY: mini loading screen — fades in the instant "Begin Day N"
        // is clicked, covers battlefield generation, fades back out at the
        // end of afterSurvivalGenerate() right before predeployment shows.
        // Mirrors loading-screen.js's mechanics/cosmetics (see
        // menu/survival-day-transition.js) but pulls from the player's own
        // surviving roster instead of the encyclopedia.
        if (typeof window.showSurvivalDayTransition === "function") {
            window.showSurvivalDayTransition(run.day, run.roster, run.color);
        }
        currentWaveLoot = { food: 0, gold: 0 };
        const canvas = document.getElementById("gameCanvas");

        if (typeof window.cleanupCustomBattleEnvironments === "function") {
            window.cleanupCustomBattleEnvironments();
        }

        window.inNavalBattle = false;
        window.inRiverBattle = false;
        if (typeof inSiegeBattle !== "undefined") inSiegeBattle = false;
        if (typeof inCityMode !== "undefined") inCityMode = false;

        battleEnvironment.units = [];
        battleEnvironment.projectiles = [];
        unitIdCounter = 0;

        inBattleMode = true;
        window.inBattleMode = true;
        // Read by troop_draw.js to skip drawing the decorative baggage-train
        // wagons — Survival's wave-defense scenes don't want caravan dressing.
        window.__IS_SURVIVAL_BATTLE__ = true;

        if (typeof window.player === "undefined" || !window.player) {
            window.player = {
                x: 0, y: 0, hp: 150, maxHealth: 150,
                baseSpeed: 23, speed: 23,
                faction: run.faction, state: "idle", frame: 0, direction: 1,
                roster: run.roster
            };
        }
        window.player.baseSpeed = 23;
        window.player.speed = 23;
        window.player.faction = run.faction;
        window.player.roster = run.roster;

        window.camera = {
            get x() { return typeof player !== "undefined" && canvas ? player.x - (canvas.width / 2 / (typeof zoom !== "undefined" ? zoom : 1)) : 0; },
            get y() { return typeof player !== "undefined" && canvas ? player.y - (canvas.height / 2 / (typeof zoom !== "undefined" ? zoom : 1)) : 0; },
            get width() { return canvas ? canvas.width / (typeof zoom !== "undefined" ? zoom : 1) : window.innerWidth; },
            get height() { return canvas ? canvas.height / (typeof zoom !== "undefined" ? zoom : 1) : window.innerHeight; }
        };

        if (!window.__battleLoopStarted) {
            window.__battleLoopStarted = true;
            draw();
        }

        const mainMenu = document.getElementById("main-menu");
        if (mainMenu) mainMenu.style.display = "none";
        const overworldUI = document.getElementById("ui");
        if (overworldUI) overworldUI.style.display = "none";
        const dipContainer = document.getElementById("diplomacy-container");
        if (dipContainer) dipContainer.style.display = "none";

        if (!originalLeaveBattlefield_Survival) originalLeaveBattlefield_Survival = window.leaveBattlefield;
        window.leaveBattlefield = handleSurvivalForcedExit;
        // Stable reference the campaign-side guards can call even if a bare
        // `leaveBattlefield(...)` identifier call bypasses the override above.
        window.__survivalForcedExit = handleSurvivalForcedExit;

        BATTLE_WORLD_WIDTH = 2400;
        BATTLE_WORLD_HEIGHT = 2400;
        BATTLE_COLS = Math.floor(BATTLE_WORLD_WIDTH / (typeof BATTLE_TILE_SIZE !== "undefined" ? BATTLE_TILE_SIZE : 8));
        BATTLE_ROWS = Math.floor(BATTLE_WORLD_HEIGHT / (typeof BATTLE_TILE_SIZE !== "undefined" ? BATTLE_TILE_SIZE : 8));

        window.battleSpawnAssignment = {
            player: computeSpawnGeometry("S"),
            enemy: computeSpawnGeometry("N")
        };

        generateBattlefield(run.background || "Plains", afterSurvivalGenerate);

        function afterSurvivalGenerate() {
            zoom = 0.4;
            battleEnvironment.groundEffects = [];

            // Random enemy faction each day - composition below is drawn
            // from THIS faction's real roster, not a free-for-all.
            const dailyEnemyFaction = pickDailyEnemyFaction();
            run.enemyFaction = dailyEnemyFaction;
            const enemyColor = factionColor(dailyEnemyFaction) || ENEMY_FALLBACK_COLOR;

            // SURGERY: notable raid roll — decided ONCE per day, then
            // threaded through composition (generateEnemyWaveRoster),
            // commander naming (survivalSpawnLoop below), and the
            // predeployment banner, so all three agree on what kind of day
            // this is instead of independently re-rolling.
            const raidType = rollNotableRaid(run.day, seasonForDay(run.day));
            run.todayRaidType = raidType;
            const enemyRoster = generateEnemyWaveRoster(run.day, dailyEnemyFaction, raidType);

            // SURGERY: wounded/healing roster entries (healDaysLeft > 0) sit
            // this wave out entirely — they never spawn, and the casualty
            // baselines below need to reflect who's actually on the field,
            // not the full roster including soldiers back at camp healing.
            const fightableRoster = run.roster.filter(rosterIsFightable);

            currentBattleData = {
                playerFaction: run.faction,
                enemyFaction: dailyEnemyFaction,
                playerColor: run.color,
                enemyColor: enemyColor,
                initialCounts: { player: fightableRoster.length + 1, enemy: enemyRoster.length + 1 }
            };
            preBattleStats = {
                playerTotalHP: 0, enemyTotalHP: 0,
                playerMen: fightableRoster.length + 1,
                enemyMen: enemyRoster.length + 1
            };

            // SURGERY: previously called window.customSpawnLoop (exported
            // from custom_battle_gui.js) here. That cross-file dependency
            // broke twice in practice when a different version of
            // custom_battle_gui.js was loaded without the export line,
            // silently leaving battleEnvironment.units empty — which then
            // read as an instant "enemy wiped" victory with no player
            // commander ever spawned (see "Player General is fallen or not
            // found!" spam). Survival now spawns its own units directly and
            // no longer depends on custom_battle_gui.js being loaded at all.
            survivalSpawnLoop(fightableRoster, "player", run.faction, run.color);
            survivalSpawnLoop(enemyRoster, "enemy", dailyEnemyFaction, enemyColor, raidType);

            battleEnvironment.units.forEach((unit, index) => {
                survivalLastResort(unit, BATTLE_WORLD_WIDTH, BATTLE_WORLD_HEIGHT, unit.side, index);
            });

            const playerCommander = battleEnvironment.units.find(u => u.isCommander && u.side === "player");
            if (playerCommander) {
                player.x = playerCommander.x;
                player.y = playerCommander.y;
                player.hp = playerCommander.hp;
                player.maxHealth = playerCommander.maxHp || playerCommander.hp;
                player.ammo = playerCommander.ammo;
            }

            if (canvas) {
                canvas.style.display = "block";
                canvas.style.visibility = "visible";
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }

            window.isPaused = false;

            // SURGERY: today's structure-building budget — sized off whoever's
            // actually standing in fightableRoster, not counting anyone still
            // healing back at camp. Consumed by survivalStructures.js via
            // window.SurvivalRun.getLabor()/spendLabor() during predeployment.
            run.laborRemainingToday = computeLaborBudget(run.roster);

            // SURGERY: Day/Food/Gold/Labor HUD — visible from right now
            // (predeployment) straight through the wave itself, unlike the
            // "PREPARE YOUR LINE" banner just below, which dismisses on
            // Begin Wave. Kept live via startSurvivalMonitor's tick.
            showSurvivalResourceHud();

            // --- PREDEPLOYMENT: reuse the engine's own freeze system so enemies
            // stand in "absolute stillness" while the player arranges their line.
            window.__preDeploymentActive = true;
            window.__playerDeployZone = squareDeployZone(window.battleSpawnAssignment.player.ax, window.battleSpawnAssignment.player.ay);

            // SURGERY: terrain + units are ready — fade the mini loading
            // screen back out right before the predeployment banner appears.
            if (typeof window.hideSurvivalDayTransition === "function") {
                window.hideSurvivalDayTransition();
            }

            showPredeploymentOverlay(run.day, dailyEnemyFaction, () => {
                window.__preDeploymentActive = false;
                window.__playerDeployZone = null;

                if (typeof AudioManager !== "undefined") {
                    AudioManager.init();
                    AudioManager.playMP3("music/battlemusic.mp3", false);
                    AudioManager.playSound("charge");
                }
                if (typeof triggerEpicZoom === "function") {
                    triggerEpicZoom(zoom, 0.7, 1200);
                }
                if (typeof EnemyTacticalAI !== "undefined") {
                    EnemyTacticalAI.start({ skipForming: true });
                }

                survivalWaveResolved = false;
                startSurvivalMonitor();
            });
        }
    }

    // ------------------------------------------------------------------
    // LIVE RESOURCE HUD — Day / Food / Gold / Labor, visible continuously
    // from predeployment straight through the wave itself (the "PREPARE
    // YOUR LINE" banner dismisses on Begin Wave; this doesn't). Refreshed
    // from startSurvivalMonitor's existing 250ms tick further down.
    // ------------------------------------------------------------------
    function showSurvivalResourceHud() {
        let hud = document.getElementById("survival-resource-hud");
        if (!hud) {
            hud = document.createElement("div");
            hud.id = "survival-resource-hud";
            hud.style.position = "fixed";
            hud.style.top = "10px";
            hud.style.right = "10px";
            hud.style.zIndex = "99970";
            hud.style.fontFamily = "Georgia, serif";
            hud.style.fontSize = "12px";
            hud.style.color = "#d4b886";
            hud.style.background = "rgba(12,10,10,0.72)";
            hud.style.border = "1px solid #4a3a2a";
            hud.style.borderRadius = "4px";
            hud.style.padding = "6px 12px";
            hud.style.display = "flex";
            hud.style.gap = "12px";
            hud.style.pointerEvents = "none";
            hud.style.letterSpacing = "0.5px";
            document.body.appendChild(hud);
        }
        hud.style.display = "flex";
        updateSurvivalResourceHud();
    }

    function updateSurvivalResourceHud() {
        const hud = document.getElementById("survival-resource-hud");
        if (!hud || !run) return;
        const laborTotal = computeLaborBudget(run.roster);
        const season = seasonForDay(run.day);
        const seasonIcon = { Spring: "🌱", Summer: "☀", Autumn: "🍂", Winter: "❄" }[season] || "";
        const campDmgPct = Math.round(campDamageFraction() * 100);
        hud.innerHTML = `
            <span style="color:#f5d76e;">DAY ${run.day} ${seasonIcon}</span>
            <span>🌾 ${fmtNum(run.food)}</span>
            <span>🪙 ${run.gold}</span>
            <span>🪏 ${run.laborRemainingToday}/${laborTotal}</span>
            ${campDmgPct > 0 ? `<span style="color:#ffb74d;" title="Camp damage — reduces morale/HP for every soldier fielded">🔥 ${campDmgPct}%</span>` : ""}
        `;
    }

    function hideSurvivalResourceHud() {
        const hud = document.getElementById("survival-resource-hud");
        if (hud) hud.style.display = "none";
    }

    // ------------------------------------------------------------------
    // PREDEPLOYMENT OVERLAY — "Prepare your line, Commander"
    // ------------------------------------------------------------------
    function showPredeploymentOverlay(day, enemyFactionName, onBegin) {
        const old = document.getElementById("survival-predeploy");
        if (old) old.remove();
        const banner = document.createElement("div");
        banner.id = "survival-predeploy";
        banner.style.position = "fixed";
        banner.style.top = "0"; banner.style.left = "0"; banner.style.width = "100%";
        banner.style.zIndex = "99980";
        banner.style.display = "flex";
        banner.style.flexDirection = "column";
        banner.style.alignItems = "center";
        banner.style.padding = "16px";
        banner.style.background = "linear-gradient(to bottom, rgba(10,5,5,0.85), rgba(10,5,5,0))";
        banner.style.fontFamily = "Georgia, serif";
        banner.style.pointerEvents = "none";

        const label = document.createElement("div");
        label.style.color = "#f5d76e";
        label.style.fontSize = "18px";
        label.style.letterSpacing = "2px";
        // SURGERY: notable raids get a more alarming header instead of the
        // routine "prepare your line" phrasing — signals to the player
        // this specific day is a bigger deal before they even open the
        // scouting text below.
        const raidType = run ? run.todayRaidType : null;
        if (raidType === "elite") {
            label.style.color = "#e57373";
            label.innerText = `DAY ${day} — ⚠ ELITE FORCE SIGHTED`;
        } else if (raidType === "warband") {
            label.style.color = "#ffb74d";
            label.innerText = `DAY ${day} — ⚠ FULL WAR BAND SIGHTED`;
        } else {
            label.innerText = `DAY ${day} — PREPARE YOUR LINE, COMMANDER`;
        }
        banner.appendChild(label);

        const sub = document.createElement("div");
        sub.style.color = "#d4b886";
        sub.style.fontSize = "13px";
        sub.style.marginTop = "4px";
        if (enemyFactionName) {
            const flavor = factionFlavor(enemyFactionName);
            sub.innerText = `Scouts report ${enemyFactionName} — ${flavor.style}. The enemy will not move until you give the order.`;
        } else {
            sub.innerText = "Position your troops. The enemy will not move until you give the order.";
        }
        banner.appendChild(sub);

        if (raidType && enemyFactionName) {
            const flavor = factionFlavor(enemyFactionName);
            const cmdrLine = document.createElement("div");
            cmdrLine.style.color = raidType === "elite" ? "#e57373" : "#ffb74d";
            cmdrLine.style.fontSize = "12px";
            cmdrLine.style.marginTop = "4px";
            cmdrLine.style.fontStyle = "italic";
            cmdrLine.innerText = raidType === "elite"
                ? `Their banner marks the ${flavor.eliteName} — few in number, but the best this enemy fields.`
                : `A ${flavor.eliteName} vanguard leads a larger force than usual today.`;
            banner.appendChild(cmdrLine);
        }

        // SURGERY: qualitative (not exact-number) estimate of enemy force
        // size, tied to the same troop-quantity scaling generateEnemyWaveRoster
        // actually uses. Deliberately vague per spec — scouts can gauge
        // roughly how large a force is approaching, not give the player a
        // precise headcount, and definitely nothing about its composition.
        if (run) {
            const activeCount = run.roster.filter(rosterIsFightable).length;
            const mult = 1 + 0.025 * activeCount;
            let sizeNote = null;
            if (mult >= 1.6) sizeNote = "Scouts warn this is an unusually large force — your own numbers have drawn attention.";
            else if (mult >= 1.3) sizeNote = "Scouts estimate a considerable force — larger than a typical raid.";
            else if (mult >= 1.15) sizeNote = "Scouts estimate a modestly larger force than usual.";
            if (sizeNote) {
                const sizeLine = document.createElement("div");
                sizeLine.style.color = "#e8b04a";
                sizeLine.style.fontSize = "12px";
                sizeLine.style.marginTop = "4px";
                sizeLine.style.fontStyle = "italic";
                sizeLine.innerText = sizeNote;
                banner.appendChild(sizeLine);
            }
        }

        // SURGERY: season + weather line — communicates the rain/snow
        // gunpowder mechanic up front instead of leaving the player to
        // discover their cannons silently won't fire.
        const season = seasonForDay(day);
        const seasonLine = document.createElement("div");
        seasonLine.style.fontSize = "11px";
        seasonLine.style.marginTop = "4px";
        seasonLine.style.color = "#8d6e63";
        seasonLine.style.letterSpacing = "1px";
        seasonLine.innerText = `${{ Spring: "🌱", Summer: "☀", Autumn: "🍂", Winter: "❄" }[season] || ""} ${season}`;
        banner.appendChild(seasonLine);

        if (window.SurvivalStructures && typeof window.SurvivalStructures.getWeather === "function") {
            const weather = window.SurvivalStructures.getWeather();
            const precipitation = weather && ((weather.rain || 0) > 0 || (weather.snow || 0) > 0);
            if (weather && weather.label && !/^(Clear|Frosty Clear)$/.test(weather.label)) {
                const weatherLine = document.createElement("div");
                weatherLine.style.fontSize = "12px";
                weatherLine.style.marginTop = "6px";
                weatherLine.style.color = precipitation ? "#90caf9" : "#a1887f";
                const icon = weather.snow > 0 ? "🌨" : (weather.rain > 0 ? "🌧" : "☁");
                weatherLine.innerText = precipitation
                    ? `${icon} ${weather.label} — gunpowder units' powder is wet and won't fire today.`
                    : `${icon} ${weather.label}`;
                banner.appendChild(weatherLine);
            }
        }

        const btn = svBtn("⚔ BEGIN WAVE", () => {
            // SURGERY: cancel any active building/placement UI immediately —
            // don't rely on the 400ms poll noticing predeployment ended,
            // which could leave a stuck ghost/picker visible for a moment
            // into the actual battle.
            if (window.SurvivalStructures && typeof window.SurvivalStructures.cancelBuildMode === "function") {
                window.SurvivalStructures.cancelBuildMode();
            }
            const picker = document.getElementById("svs-build-picker");
            if (picker) picker.remove();
            const launcherRow = document.getElementById("svs-launcher-row");
            if (launcherRow) launcherRow.style.display = "none";

            banner.remove();
            onBegin();
        });
        btn.style.marginTop = "12px";
        btn.style.pointerEvents = "auto";
        banner.appendChild(btn);

        document.body.appendChild(banner);
    }

    // ========================================================================
    // ENEMY WAVE GENERATION
    // ========================================================================
    function generateEnemyWaveRoster(day, enemyFactionName, raidType) {
        if (day === 1) {
            const count = 4 + Math.floor(Math.random() * 3); // 4-6, "a few militia"
            return Array(count).fill("Militia");
        }

        // Hard tier gates: keep the expensive/elite units mathematically
        // near-impossible to roll until many days in, on top of the weighting
        // below (which already skews heavily toward cheap troops). Shares
        // TIER_THRESHOLDS/isUnitUnlockedForDay with the player recruit shop
        // so both progress on the same curve.
        function isUnlocked(cost) { return isUnitUnlockedForDay(cost, day); }

        // Unit composition now obeys BOTH the day's randomly-chosen enemy
        // faction (via the same getUnitsForFaction helper the player's own
        // recruit shop uses) AND the difficulty/tier gate above - a raiding
        // party can only field what that faction can actually field, and
        // only at the power level this day has unlocked.
        const excluded = ["Commander", "General", "Mounted General"];
        const factionUnitSet = new Set(getUnitsForFaction(enemyFactionName || ENEMY_FACTION));
        let pool = Object.keys(UnitRoster.allUnits).filter(key => {
            if (excluded.includes(key)) return false;
            if (!factionUnitSet.has(key)) return false;
            const t = UnitRoster.allUnits[key];
            return t && isUnlocked(t.cost || 9999);
        });
        // A faction with a very small roster could plausibly have nothing
        // unlocked yet on an early day - fall back to militia rather than
        // an empty wave.
        if (pool.length === 0) pool = ["Militia"];

        // Weighted pick: cheaper units are far more likely by default. The
        // exponent flattens gradually as days pass, so pricier troops
        // become relatively less rare over time without ever being common.
        // SURGERY: an "elite" notable raid FLIPS this — negative exponent
        // skews the pick toward the most expensive units this day has
        // unlocked instead, for a small, dangerous, quality-only formation.
        const baseExponent = Math.max(1.1, 1.9 - day * 0.03);
        const exponent = (raidType === "elite") ? -0.6 : baseExponent;
        function weightedPick() {
            let totalWeight = 0;
            const weights = pool.map(key => {
                const cost = UnitRoster.allUnits[key].cost || 50;
                const w = 1 / Math.pow(cost, exponent);
                totalWeight += w;
                return w;
            });
            let roll = Math.random() * totalWeight;
            for (let i = 0; i < pool.length; i++) {
                roll -= weights[i];
                if (roll <= 0) return pool[i];
            }
            return pool[pool.length - 1];
        }

        // Wave "budget" (in gold-equivalent) grows with day; headcount and
        // power both emerge from it naturally.
        // SURGERY: "warband" notable raids just scale the routine budget up
        // — same composition style, bigger numbers. "elite" raids spend the
        // SAME budget but on much pricier picks (see exponent flip above),
        // so headcount comes out low even though total strength is high.
        const raidBudgetMult = (raidType === "warband") ? 1.6 : (raidType === "elite" ? 1.25 : 1);
        const budget = Math.round((90 + (day - 1) * 35) * raidBudgetMult);
        const maxUnits = 90; // engine/perf ceiling

        // SURGERY: troop-QUANTITY scaling — the more active (fielded, not
        // healing) troops the player has amassed, the bigger this wave gets,
        // independent of day. Deliberately reads ONLY .length here, never
        // unit type/level/stats — per spec, enemy scouts can estimate how
        // large your force LOOKS from a distance, not what it's actually
        // made of. This is the real "don't just spam cheap Militia" check on
        // the enemy side, mirroring the food-crowding one on the economy
        // side: a bigger army costs more to feed AND draws a bigger fight.
        const TROOP_QUANTITY_SCALING = 0.025; // +2.5% wave budget per active troop
        const activeTroopCount = run ? run.roster.filter(rosterIsFightable).length : 0;
        const quantityMultiplier = 1 + TROOP_QUANTITY_SCALING * activeTroopCount;
        const scaledBudget = Math.round(budget * quantityMultiplier);

        const roster = [];
        let spent = 0, guard = 0;
        while (spent < scaledBudget && roster.length < maxUnits && guard < 500) {
            guard++;
            const pick = weightedPick();
            const cost = UnitRoster.allUnits[pick].cost || 50;
            if (spent + cost > scaledBudget && roster.length > 0) break;
            roster.push(pick);
            spent += cost;
        }
        if (roster.length === 0) roster.push("Militia");
        return roster;
    }

    // ========================================================================
    // WAVE MONITOR — wipe/clear detection
    // ========================================================================
    function startSurvivalMonitor() {
        if (survivalMonitorInterval) clearInterval(survivalMonitorInterval);
        survivalMonitorInterval = setInterval(() => {
            if (!survivalActive || survivalWaveResolved) { clearInterval(survivalMonitorInterval); return; }
            updateSurvivalResourceHud();
            if (!inBattleMode || !battleEnvironment || !Array.isArray(battleEnvironment.units)) return;

            const pAlive = battleEnvironment.units.filter(u => u.side === "player" && u.hp > 0).length;
            const eAlive = battleEnvironment.units.filter(u => u.side === "enemy" && u.hp > 0).length;

            if (pAlive <= 0) {
                survivalWaveResolved = true;
                clearInterval(survivalMonitorInterval);
                handleSurvivalDefeat();
            } else if (eAlive <= 0) {
                survivalWaveResolved = true;
                clearInterval(survivalMonitorInterval);
                handleWaveCleared();
            }
        }, 250);
    }

    // Safety net: if some other engine path calls window.leaveBattlefield()
    // directly during a survival wave (rather than going through our own
    // monitor above), treat it the same as a defeat rather than falling
    // through to whatever the pre-survival handler expected.
    function handleSurvivalForcedExit() {
        if (survivalWaveResolved) return;
        survivalWaveResolved = true;
        if (survivalMonitorInterval) clearInterval(survivalMonitorInterval);
        handleSurvivalDefeat();
    }

    // ========================================================================
    // WAVE CLEARED — sync survivors, show "prepare for next day"
    // ========================================================================
    function handleWaveCleared() {
        if (typeof EnemyTacticalAI !== "undefined") EnemyTacticalAI.stop();
        if (typeof stopLazyGeneral === "function") stopLazyGeneral();

        run.preWaveCount = run.roster.length;

        // SURGERY: match each pre-battle roster entry back to its spawned
        // battle unit via _survivalRosterUid (stamped in survivalSpawnLoop),
        // so exp/level/wounds land on the SAME individual soldier instead of
        // the old "just re-derive the roster from unitType" pass, which had
        // no memory of who specifically survived.
        const killedTypes = [];
        const newlyWounded = [];
        const nextRoster = [];

        run.roster.forEach(entry => {
            // Already-healing entries sat this wave out entirely — never
            // spawned, so there's nothing to resolve for them here.
            if (!rosterIsFightable(entry)) { nextRoster.push(entry); return; }

            const unit = battleEnvironment.units.find(u => u._survivalRosterUid === entry.uid);
            if (!unit) { nextRoster.push(entry); return; } // defensive fallback

            if (unit.hp > 0) {
                entry.experience = unit.stats.experience || entry.experience;
                entry.experienceLevel = unit.stats.experienceLevel || entry.experienceLevel;
                nextRoster.push(entry);
            } else if (Math.random() < WOUND_INSTEAD_OF_DEATH_CHANCE) {
                entry.wounded = true;
                entry.healDaysLeft = HEAL_DAYS_MIN + Math.floor(Math.random() * (HEAL_DAYS_MAX - HEAL_DAYS_MIN + 1));
                entry.experience = unit.stats.experience || entry.experience;
                entry.experienceLevel = unit.stats.experienceLevel || entry.experienceLevel;
                newlyWounded.push({ type: entry.type, days: entry.healDaysLeft });
                nextRoster.push(entry);
            } else {
                killedTypes.push(entry.type);
                // not pushed — gone for good
            }
        });
        run.roster = nextRoster;

        const clearedDay = run.day;
        const goldReward = 40 + clearedDay * 15;
        run.gold += goldReward;
        run.day += 1;
        window.__survivalDay = run.day;

        // Food/labor economy for the day that's now starting — weekly
        // shipment, ration consumption, starvation → desertion, healing
        // countdown, daily gold trickle. Operates on run.roster AFTER the
        // wound/death resolution above, so healing soldiers already eat the
        // smaller ration this same day.
        const economyReport = resolveDayEconomy();
        const report = Object.assign(
            { clearedDay: clearedDay, goldReward: goldReward, killed: killedTypes, wounded: newlyWounded },
            economyReport
        );
        run.lastDayReport = report;

        inBattleMode = false;
        window.inBattleMode = false;
        battleEnvironment.units = [];
        battleEnvironment.projectiles = [];

        const canvas = document.getElementById("gameCanvas");
        if (canvas) canvas.style.display = "none";

        hideSurvivalResourceHud();

        // SURGERY: same dramatic fade transition on the way OUT of battle
        // back to the day-prep menu — previously this was an abrupt cut.
        // The day-prep overlay is built immediately (synchronous, instant —
        // there's no real loading to hide here, unlike launchSurvivalDay's
        // fade-in), just visually covered by the transition for a beat
        // before revealing it, mirroring that same darken -> reveal rhythm.
        if (typeof window.showSurvivalDayTransition === "function") {
            window.showSurvivalDayTransition(report.clearedDay, run.roster, run.color);
            showDayPrepMenu(report);
            setTimeout(() => {
                if (typeof window.hideSurvivalDayTransition === "function") window.hideSurvivalDayTransition();
            }, 550);
        } else {
            showDayPrepMenu(report);
        }
    }

    // Resolves one day's food/labor economy: weekly shipment, ration
    // consumption (full ration for active troops, FOOD_PER_WOUNDED_PER_DAY
    // for anyone healing per spec), starvation → escalating stat penalty →
    // desertion after STARVE_DAYS_TO_DESERT consecutive unfed days, the
    // healing-days-left countdown, and the flat daily gold trickle. Called
    // once per day from handleWaveCleared, after that wave's survivors are
    // already folded into run.roster.
    function resolveDayEconomy() {
        // Night raid cooldown ticks down once per day, same cadence as
        // everything else in this function.
        if (run.nightRaidCooldown > 0) run.nightRaidCooldown -= 1;

        // Camp tents slowly rebuild — "get rebuilt overtime" per spec.
        // Purely passive, no labor cost — this is home-base upkeep, not a
        // player-built structure.
        let tentsRepaired = 0;
        if (Array.isArray(run.campTents)) {
            run.campTents.forEach(t => {
                if (t.hp < t.maxHp) {
                    t.hp = Math.min(t.maxHp, t.hp + TENT_REGEN_PER_DAY);
                    tentsRepaired++;
                }
            });
        }

        const report = {
            foodStart: run.food,
            foodConsumed: 0,
            foodFromShipment: 0,
            foodFromLoot: currentWaveLoot.food,
            goldFromLoot: currentWaveLoot.gold,
            goldFromLumpSum: DAILY_GOLD_LUMP_SUM,
            goldMaintenance: 0,
            rosterSizeMultiplier: 1,
            deserted: [],
            healedUp: [],
            wentHungry: false,
            shipmentArrived: false,
            tentsRepaired: tentsRepaired,
            campDamagePct: Math.round(campDamageFraction() * 100)
        };

        // 1. Weekly shipment, checked against the day that's now starting.
        if (run.day % WEEKLY_FOOD_SHIPMENT_INTERVAL === 0) {
            const shipmentMult = SEASON_SHIPMENT_MODIFIER[seasonForDay(run.day)] || 1;
            const shipmentAmount = Math.round(WEEKLY_FOOD_SHIPMENT_AMOUNT * shipmentMult);
            run.food += shipmentAmount;
            report.foodFromShipment = shipmentAmount;
            report.shipmentArrived = true;
        }

        // 2. Ration consumption. Two multiplicative factors on top of the
        // flat per-troop base:
        //   - foodTypeMultiplier(entry.type): elite units eat a bit more
        //     (capped at +20%, see FOOD_TYPE_MAX_BONUS).
        //   - rosterMult: the WHOLE army's bill scales up with total troop
        //     count, so a big roster (spammed cheap or not) costs
        //     disproportionately more per head — the actual "sweet spot"
        //     lever. n=10 ≈ 1.2x, n=40 ≈ 1.8x, n=70 ≈ 2.4x.
        const rosterMult = 1 + ROSTER_SIZE_FOOD_GROWTH * run.roster.length;
        report.rosterSizeMultiplier = rosterMult;
        const terrainMult = terrainFoodMultiplier();
        const season = seasonForDay(run.day);
        const seasonMult = 1 + (SEASON_FOOD_MODIFIER[season] || 0);
        report.season = season;
        report.terrainMultiplier = terrainMult;
        report.seasonMultiplier = seasonMult;
        let need = 0;
        let goldUpkeep = 0;
        run.roster.forEach(entry => {
            const baseRation = (entry.healDaysLeft > 0) ? FOOD_PER_WOUNDED_PER_DAY : FOOD_PER_TROOP_PER_DAY;
            const mountMult = isMountedType(entry.type) ? (1 + MOUNT_FOOD_SURCHARGE) : 1;
            need += baseRation * foodTypeMultiplier(entry.type) * mountMult * rosterMult * terrainMult * seasonMult;

            const rangedUpkeep = isRangedType(entry.type) ? GOLD_MAINTENANCE_RANGED_PER_DAY : GOLD_MAINTENANCE_MELEE_PER_DAY;
            goldUpkeep += (entry.healDaysLeft > 0) ? rangedUpkeep * GOLD_MAINTENANCE_HEALING_FACTOR : rangedUpkeep;
        });
        need = Math.round(need * 10) / 10;
        report.foodConsumed = need;
        const hadEnough = run.food >= need;
        run.food = Math.max(0, run.food - need);
        report.wentHungry = !hadEnough;

        // 2b. Gold maintenance — ranged ammunition resupply, charged
        // alongside rations. Melee units cost next to nothing to keep
        // fielded; a ranged-heavy roster visibly eats into gold reserves.
        goldUpkeep = Math.round(goldUpkeep * 10) / 10;
        report.goldMaintenance = goldUpkeep;
        run.gold = Math.max(0, run.gold - goldUpkeep);

        // 3. Starvation / desertion — only bites when rations genuinely ran
        // short today. A fully-fed day resets everyone's streak and penalty.
        if (!hadEnough) {
            for (let i = run.roster.length - 1; i >= 0; i--) {
                const entry = run.roster[i];
                entry.starveDays = (entry.starveDays || 0) + 1;
                if (entry.starveDays >= STARVE_DAYS_TO_DESERT) {
                    report.deserted.push({ type: entry.type });
                    run.roster.splice(i, 1);
                } else {
                    entry.statPenaltyPct = Math.min(MAX_STARVE_STAT_PENALTY, entry.starveDays * STARVE_STAT_PENALTY_PER_DAY);
                }
            }
        } else {
            run.roster.forEach(entry => { entry.starveDays = 0; entry.statPenaltyPct = 0; });
        }

        // 4. Healing countdown.
        run.roster.forEach(entry => {
            if (entry.healDaysLeft > 0) {
                entry.healDaysLeft -= 1;
                if (entry.healDaysLeft <= 0) {
                    entry.healDaysLeft = 0;
                    entry.wounded = false;
                    report.healedUp.push({ type: entry.type });
                }
            }
        });

        // 5. Daily gold trickle — independent of the per-wave clear reward
        // (handleWaveCleared adds that one separately).
        run.gold += DAILY_GOLD_LUMP_SUM;

        // This wave's loot is now folded into the report above — the next
        // wave's tally starts fresh.
        currentWaveLoot = { food: 0, gold: 0 };

        report.foodEnd = run.food;
        return report;
    }

    // Groups a list of {type} records into "N× Type" strings, sorted by type.
    function groupByType(list) {
        const counts = {};
        list.forEach(item => { counts[item.type] = (counts[item.type] || 0) + 1; });
        return Object.keys(counts).sort().map(k => `${counts[k]}× ${k}`);
    }
    function fmtNum(n) { return Number.isInteger(n) ? n : Math.round(n * 10) / 10; }

    // ---- ROSTER HOVER PANEL (wounded/healing detail) --------------------
    // Delegated single listener on the roster box rather than one listener
    // per row — rosterBox.innerHTML gets fully rebuilt on every prep-menu
    // render (new day, recruit purchase, etc.), which would silently drop
    // per-row listeners; delegation on the stable container sidesteps that.
    // Reuses unit-hover-tooltip.js's panel visuals for a consistent look,
    // but is intentionally a separate small panel/element — this hovers
    // roster rows (data-roster-idx), not battlefield canvas sprites, and
    // wounded status (healDaysLeft) has no meaning on a live battlefield
    // unit in the first place (a wounded roster entry doesn't fight that
    // day, so there's never a corresponding sprite to hover instead).
    let _svRosterTipEl = null;
    function _svRosterTip() {
        if (_svRosterTipEl && document.body.contains(_svRosterTipEl)) return _svRosterTipEl;
        const el = document.createElement("div");
        el.id = "sv-roster-hover-tip";
        Object.assign(el.style, {
            position: "fixed", zIndex: "99980", display: "none", pointerEvents: "none",
            fontFamily: "Georgia, serif", fontSize: "12px", color: "#fff",
            background: "rgba(12,10,10,0.9)", border: "1px solid #7b1a1a", borderRadius: "4px",
            padding: "8px 10px", minWidth: "150px", maxWidth: "220px",
            boxShadow: "0 4px 14px rgba(0,0,0,0.5)"
        });
        document.body.appendChild(el);
        _svRosterTipEl = el;
        return el;
    }
    function _svRosterHoverInstall(rosterBox, sortedForDisplay) {
        // Desktop-only, matching unit-hover-tooltip.js — touch devices never
        // get a hover state to begin with, so there's nothing to gate there.
        if (!window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

        const tip = _svRosterTip();
        const hide = () => { tip.style.display = "none"; };

        rosterBox.addEventListener("mousemove", (e) => {
            if (!window.__hoverPanelActive) { hide(); return; }
            const row = e.target.closest("[data-roster-idx]");
            if (!row) { hide(); return; }
            const entry = sortedForDisplay[Number(row.getAttribute("data-roster-idx"))];
            if (!entry) { hide(); return; }

            const wounded = entry.healDaysLeft > 0;
            const hungry = !wounded && entry.statPenaltyPct > 0;
            const statusLine = wounded
                ? `<span style="color:#ffb74d;">Healing — ${entry.healDaysLeft} day${entry.healDaysLeft === 1 ? "" : "s"} left</span>`
                : hungry
                    ? `<span style="color:#e57373;">Hungry — stats -${Math.round(entry.statPenaltyPct * 100)}%</span>`
                    : `<span style="color:#8bc34a;">Ready for battle</span>`;

            tip.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom:1px solid #4a3a2a; padding-bottom:4px; margin-bottom:4px;">
                    <span style="color:#f5d76e; font-size:13px;">${entry.type}</span>
                    <span style="color:#f5d76e; font-size:11px;">Lv ${entry.experienceLevel || 1}</span>
                </div>
                <div>${statusLine}</div>
            `;
            tip.style.display = "block";
            const OFFSET = 16;
            let left = e.clientX + OFFSET, top = e.clientY + OFFSET;
            const rect = tip.getBoundingClientRect();
            if (left + rect.width > window.innerWidth) left = e.clientX - rect.width - OFFSET;
            if (top + rect.height > window.innerHeight) top = e.clientY - rect.height - OFFSET;
            tip.style.left = Math.max(4, left) + "px";
            tip.style.top = Math.max(4, top) + "px";
        });
        rosterBox.addEventListener("mouseleave", hide);
    }

    function showDayPrepMenu(report) {
        const clearedDay = report.clearedDay;
        const el = svOverlay("survival-prep");
        el.style.justifyContent = "flex-start";
        el.style.padding = "20px 0";

        const activeRoster = run.roster.filter(rosterIsFightable);
        const healingRoster = run.roster.filter(e => !rosterIsFightable(e));
        const activeLines = groupByType(activeRoster).join(" &nbsp;·&nbsp; ") || "No troops remain — only your commander stands.";
        const healingLines = groupByType(healingRoster).join(" &nbsp;·&nbsp; ");
        const totalCasualties = report.killed.length + report.deserted.length;
        const newlyUnlocked = unitsUnlockingOnDay(run.day);
        const laborPreview = computeLaborBudget(run.roster);

        // ---- HEADER: outcome + rewards ----
        const header = document.createElement("div");
        header.style.textAlign = "center";
        header.style.maxWidth = "680px";
        header.style.padding = "0 20px";
        header.innerHTML = `
            <div style="font-size: 26px; letter-spacing: 3px; color: #f5d76e;">DAY ${clearedDay} HELD</div>
            <div style="font-size: 13px; color: #a1887f; margin-top: 6px;">
                ${totalCasualties > 0
                    ? `${report.killed.length} killed &nbsp;·&nbsp; ${report.deserted.length} deserted${report.wounded.length ? ` &nbsp;·&nbsp; ${report.wounded.length} wounded` : ""}`
                    : (report.wounded.length ? `${report.wounded.length} wounded, none lost.` : "Not a single soldier lost.")}
            </div>
            <div style="font-size: 13px; color: #a1887f; margin-top: 2px;">
                Spoils: <span style="color:#f5d76e;">+${report.goldReward} gold</span> (wave)
                &nbsp;·&nbsp; <span style="color:#f5d76e;">+${report.goldFromLumpSum} gold</span> (supply)
                ${report.goldFromLoot ? ` &nbsp;·&nbsp; <span style="color:#f5d76e;">+${report.goldFromLoot} gold</span> (looted)` : ""}
                ${report.goldMaintenance ? ` &nbsp;·&nbsp; <span style="color:#e57373;">-${report.goldMaintenance} gold</span> (ammo upkeep)` : ""}
            </div>
        `;
        el.appendChild(header);

        // ---- RESOURCES: food / gold / labor ----
        const resources = document.createElement("div");
        resources.style.display = "flex";
        resources.style.gap = "18px";
        resources.style.flexWrap = "wrap";
        resources.style.justifyContent = "center";
        resources.style.marginTop = "14px";
        resources.style.fontSize = "13px";
        resources.innerHTML = `
            <div style="color:#d4b886;">🌾 Food: <span style="color:#f5d76e;">${fmtNum(report.foodEnd)}</span>
                <span style="color:#8d6e63; font-size:11px;">(-${fmtNum(report.foodConsumed)} eaten${report.rosterSizeMultiplier > 1.05 ? `, ×${fmtNum(report.rosterSizeMultiplier)} crowding` : ""}${report.seasonMultiplier && report.seasonMultiplier !== 1 ? `, ${report.season} ${report.seasonMultiplier > 1 ? "+" : ""}${Math.round((report.seasonMultiplier - 1) * 100)}%` : ""}${report.terrainMultiplier && report.terrainMultiplier !== 1 ? `, ${run.background} ${report.terrainMultiplier > 1 ? "+" : ""}${Math.round((report.terrainMultiplier - 1) * 100)}%` : ""}${report.foodFromLoot ? `, +${report.foodFromLoot} looted` : ""}${report.shipmentArrived ? `, +${report.foodFromShipment} shipment` : ""})</span></div>
            <div style="color:#d4b886;">🪙 Gold: <span style="color:#f5d76e;">${run.gold}</span></div>
            <div style="color:#d4b886;">🪏 Labor tomorrow: <span style="color:#f5d76e;">~${laborPreview}</span></div>
        `;
        el.appendChild(resources);

        // ---- DAY REPORT: hunger / desertion / wounds / healing, stays on
        // screen the whole interim day — nothing here auto-dismisses. ----
        const noticeLines = [];
        if (report.wentHungry) noticeLines.push(`<div style="color:#f44336;">⚠ Rations ran short — the whole camp went hungry today.</div>`);
        if (report.deserted.length) noticeLines.push(`<div style="color:#f44336;">${report.deserted.length} soldier${report.deserted.length === 1 ? "" : "s"} deserted after ${STARVE_DAYS_TO_DESERT} days without food: ${groupByType(report.deserted).join(", ")}.</div>`);
        if (report.wounded.length) noticeLines.push(`<div style="color:#ffb74d;">${report.wounded.length} wounded, recovering: ${report.wounded.map(w => `${w.type} (${w.days}d)`).join(", ")}.</div>`);
        if (report.healedUp.length) noticeLines.push(`<div style="color:#8bc34a;">${report.healedUp.length} soldier${report.healedUp.length === 1 ? "" : "s"} recovered and rejoin the line: ${groupByType(report.healedUp).join(", ")}.</div>`);
        if (report.shipmentArrived) noticeLines.push(`<div style="color:#8bc34a;">🚚 The weekly supply shipment arrived: +${report.foodFromShipment} food.</div>`);
        if (report.tentsRepaired > 0) noticeLines.push(`<div style="color:#8bc34a;">🏕 Camp crews patched up ${report.tentsRepaired} tent${report.tentsRepaired === 1 ? "" : "s"} overnight.</div>`);
        if (report.campDamagePct > 0) noticeLines.push(`<div style="color:#ffb74d;">🔥 Camp damage: ${report.campDamagePct}% — every soldier fields with reduced morale and HP until it's rebuilt.</div>`);
        if (noticeLines.length) {
            const notices = document.createElement("div");
            notices.style.width = "min(680px, 90vw)";
            notices.style.marginTop = "14px";
            notices.style.padding = "10px 14px";
            notices.style.background = "rgba(0,0,0,0.35)";
            notices.style.border = "1px solid #4a3a2a";
            notices.style.borderRadius = "4px";
            notices.style.fontSize = "12px";
            notices.style.lineHeight = "1.6";
            notices.innerHTML = noticeLines.join("");
            el.appendChild(notices);
        }

        if (newlyUnlocked.length) {
            const unlock = document.createElement("div");
            unlock.style.marginTop = "12px";
            unlock.style.padding = "10px";
            unlock.style.border = "1px solid #f5d76e";
            unlock.style.background = "rgba(245,215,110,0.08)";
            unlock.style.width = "min(680px, 90vw)";
            unlock.innerHTML = `
                <div style="color:#f5d76e; font-size:13px; letter-spacing:1px;">🔓 NEW RECRUITS AVAILABLE</div>
                <div style="color:#d4b886; font-size:12px; margin-top:4px;">${newlyUnlocked.join(", ")}</div>
            `;
            el.appendChild(unlock);
        }

        // SURGERY: campaign milestone — one-time narrative beat for the day
        // about to begin, purely flavor (see CAMPAIGN_MILESTONES).
        const milestoneNote = campaignMilestoneNote(run.day);
        if (milestoneNote) {
            const milestone = document.createElement("div");
            milestone.style.marginTop = "12px";
            milestone.style.padding = "10px 14px";
            milestone.style.border = "1px solid #8d6e63";
            milestone.style.background = "rgba(141,110,99,0.1)";
            milestone.style.width = "min(680px, 90vw)";
            milestone.style.fontSize = "12px";
            milestone.style.fontStyle = "italic";
            milestone.style.color = "#d4b886";
            milestone.style.textAlign = "center";
            milestone.innerText = milestoneNote;
            el.appendChild(milestone);
        }

        // ---- ROSTER & LEVELS: one row per soldier, status + level visible
        // at a glance — this is the "stats and levels of each friendly". ----
        const rosterHeader = document.createElement("div");
        rosterHeader.style.width = "min(680px, 90vw)";
        rosterHeader.style.marginTop = "16px";
        rosterHeader.style.fontSize = "12px";
        rosterHeader.style.color = "#a1887f";
        rosterHeader.style.letterSpacing = "1px";
        rosterHeader.innerText = "YOUR ROSTER";
        el.appendChild(rosterHeader);

        const rosterBox = document.createElement("div");
        rosterBox.style.width = "min(680px, 90vw)";
        rosterBox.style.maxHeight = "160px";
        rosterBox.style.overflowY = "auto";
        rosterBox.style.marginTop = "4px";
        rosterBox.style.padding = "6px 10px";
        rosterBox.style.background = "rgba(20,20,20,0.8)";
        rosterBox.style.border = "1px solid #4a3a2a";
        rosterBox.style.fontSize = "12px";
        const sortedForDisplay = [...run.roster].sort((a, b) => {
            if (rosterIsFightable(a) !== rosterIsFightable(b)) return rosterIsFightable(a) ? -1 : 1;
            return a.type.localeCompare(b.type);
        });
        rosterBox.innerHTML = sortedForDisplay.map((entry, idx) => {
            const statusHtml = entry.healDaysLeft > 0
                ? `<span style="color:#ffb74d;">Healing (${entry.healDaysLeft}d)</span>`
                : (entry.statPenaltyPct > 0
                    ? `<span style="color:#e57373;">Hungry (-${Math.round(entry.statPenaltyPct * 100)}%)</span>`
                    : `<span style="color:#8bc34a;">Ready</span>`);
            // data-roster-idx: index into sortedForDisplay (rebuilt on every
            // render, so this stays valid for the delegated hover handler
            // below — see _svRosterHoverInstall).
            return `<div data-roster-idx="${idx}" style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.08); padding:3px 0;">
                <span style="color:#f5d76e;">${entry.type}</span>
                <span style="color:#d4b886;">Lv ${entry.experienceLevel || 1}</span>
                ${statusHtml}
            </div>`;
        }).join("") || `<div style="color:#8d6e63; padding:4px 0;">Only your commander remains.</div>`;
        el.appendChild(rosterBox);

        // ---- ROSTER HOVER PANEL: wounded/healing detail on hover. Kept
        // deliberately SEPARATE from menu/unit-hover-tooltip.js (the
        // battlefield panel) per direct request — woundedness is a roster
        // concept (healDaysLeft), not a live-battlefield-unit concept, and
        // is shown ONLY here in the roster/base UI, never on a battlefield
        // sprite. Reuses that file's visual style for consistency but is
        // its own small delegated-hover handler since it hovers roster
        // rows, not canvas sprites. Gated on __hoverPanelActive too, for
        // one consistent "hold Space / hover-toggle to see stats" rule
        // across both the roster screen and the battlefield.
        _svRosterHoverInstall(rosterBox, sortedForDisplay);

        // ---- RECRUIT SHOP ----
        const shopHeader = document.createElement("div");
        shopHeader.style.display = "flex";
        shopHeader.style.justifyContent = "space-between";
        shopHeader.style.alignItems = "center";
        shopHeader.style.width = "min(900px, 90vw)";
        shopHeader.style.marginTop = "18px";
        shopHeader.innerHTML = `
            <div style="color:#a1887f; font-size:12px; letter-spacing:1px;">RECRUIT MORE TROOPS</div>
            <div style="font-size:16px; color:#f5d76e;">Gold: <span id="sv-prep-gold">${run.gold}</span></div>
        `;
        el.appendChild(shopHeader);

        const shop = document.createElement("div");
        shop.style.width = "min(900px, 90vw)";
        shop.style.height = "min(260px, 32vh)";
        shop.style.overflowY = "auto";
        shop.style.padding = "10px";
        shop.style.display = "grid";
        shop.style.gridTemplateColumns = "repeat(auto-fill, minmax(70px, 1fr))";
        shop.style.gap = "8px";
        shop.style.alignContent = "start";
        shop.style.background = "rgba(20,20,20,0.8)";
        shop.style.border = "1px solid #d4b886";
        el.appendChild(shop);

        const beginBtn = svBtn(`⚔ BEGIN DAY ${run.day}`, () => {
            stopNightRaidWatch();
            el.remove();
            launchSurvivalDay();
        });
        beginBtn.style.marginTop = "20px";
        el.appendChild(beginBtn);

        refreshPrepUI = function () {
            const goldEl = document.getElementById("sv-prep-gold");
            if (goldEl) goldEl.innerText = run.gold;

            shop.innerHTML = "";
            getRecruitableUnits(run.day, run.faction).forEach(unitKey => {
                shop.appendChild(createRecruitCard(unitKey, run.color));
            });
        };
        refreshPrepUI();

        // SURGERY: night raid watch starts now that the day-prep screen is
        // actually up — see startNightRaidWatch below for the full system.
        startNightRaidWatch();
    }

    // ========================================================================
    // NIGHT RAID — a surprise attack that can trigger while the interday
    // (day-prep) screen is open. Small enemy force, no predeployment (no
    // time to arrange a line), player defenders wake up and join gradually
    // instead of all spawning at once. See NIGHT_RAID_* constants near the
    // top of this file for tuning.
    // ========================================================================
    function startNightRaidWatch() {
        stopNightRaidWatch();
        if (!run) return;
        if (run.day < NIGHT_RAID_MIN_DAY) return;      // "impossible the first day/night"
        if (run.nightRaidCooldown > 0) return;         // recent raid — near-immunity window

        nightRaidWatchInterval = setInterval(() => {
            // Bail cleanly if the prep screen closed some other way (e.g.
            // page navigation) without going through the Begin Day handler.
            if (!document.getElementById("survival-prep")) { stopNightRaidWatch(); return; }
            if (Math.random() < NIGHT_RAID_CHANCE_PER_SECOND) {
                stopNightRaidWatch();
                triggerNightRaid();
            }
        }, 1000);
    }

    function stopNightRaidWatch() {
        if (nightRaidWatchInterval) { clearInterval(nightRaidWatchInterval); nightRaidWatchInterval = null; }
    }

    // Small raiding-party roster — same faction-pool + tier-gate logic as
    // the main wave generator, but a hard small headcount instead of a
    // budget loop, since this is meant to read as "a scouting party that
    // slipped the perimeter," not a real assault.
    function generateNightRaidRoster(day, factionName) {
        function isUnlocked(cost) { return isUnitUnlockedForDay(cost, day); }
        const excluded = ["Commander", "General", "Mounted General"];
        const factionUnitSet = new Set(getUnitsForFaction(factionName || ENEMY_FACTION));
        let pool = Object.keys(UnitRoster.allUnits).filter(key => {
            if (excluded.includes(key)) return false;
            if (!factionUnitSet.has(key)) return false;
            const t = UnitRoster.allUnits[key];
            return t && isUnlocked(t.cost || 9999);
        });
        if (pool.length === 0) pool = ["Militia"];

        const exponent = Math.max(1.1, 1.9 - day * 0.03); // same cheap-favoring curve as the main wave
        function weightedPick() {
            let totalWeight = 0;
            const weights = pool.map(key => {
                const cost = UnitRoster.allUnits[key].cost || 50;
                const w = 1 / Math.pow(cost, exponent);
                totalWeight += w;
                return w;
            });
            let roll = Math.random() * totalWeight;
            for (let i = 0; i < pool.length; i++) {
                roll -= weights[i];
                if (roll <= 0) return pool[i];
            }
            return pool[pool.length - 1];
        }

        const count = randRange(NIGHT_RAID_ENEMY_COUNT);
        const roster = [];
        for (let i = 0; i < count; i++) roster.push(weightedPick());
        return roster;
    }

    // Builds ONE enemy raider directly (no roster-entry concept on that
    // side). Deliberately a separate, self-contained function rather than
    // reusing survivalSpawnLoop's batch logic — this file's own convention
    // for anything spawn-adjacent that needs to behave differently (see
    // the loot/collision helpers elsewhere for the same reasoning).
    function buildNightRaidEnemy(unitKey, faction, color, x, y) {
        const template = UnitRoster.allUnits[unitKey] || UnitRoster.allUnits["Militia"];
        const unitStats = Object.assign(new Troop(template.name, template.role, template.isLarge, faction), template);
        unitStats.morale = 20; unitStats.maxMorale = 20;
        const safeHP = unitStats.health || unitStats.hp || unitStats.maxHealth || template.health || 100;
        const visType = visTypeFor(unitKey, template);
        const unit = {
            id: Math.floor(Math.random() * 999999),
            side: "enemy", faction: faction, color: color, unitType: unitKey,
            disableAICombat: false, stats: unitStats, hp: safeHP, maxHp: safeHP,
            ammo: unitStats.ammo || template.ammo || 0, renderType: visType,
            x: x, y: y, vx: 0, vy: 0, direction: -1,
            anim: Math.floor(Math.random() * 100), frame: 0, isMoving: false, target: null, state: "idle",
            animOffset: Math.random() * 100, cooldown: 0, hasOrders: false
        };
        battleEnvironment.units.push(unit);
        return unit;
    }

    // Builds ONE player defender from a persistent roster entry — a
    // deliberately separate, simplified duplicate of survivalSpawnLoop's
    // per-unit logic (experience/level replay, starvation penalty) rather
    // than a shared refactor, so this new, less-tested code path can never
    // risk breaking the main wave spawner. No "hold position" order here —
    // during a scramble to repel raiders inside the walls, defenders fight
    // whatever's nearest immediately rather than holding a line.
    function buildNightRaidDefender(entry, faction, color, x, y) {
        const unitKey = entry.type;
        const template = UnitRoster.allUnits[unitKey] || UnitRoster.allUnits["Militia"];
        const unitStats = Object.assign(new Troop(template.name, template.role, template.isLarge, faction), template);
        unitStats.morale = 20; unitStats.maxMorale = 20;
        unitStats.experience = entry.experience || 0;
        unitStats.experienceLevel = entry.experienceLevel || 1;
        const levelsEarned = Math.max(0, unitStats.experienceLevel - 1);
        if (levelsEarned > 0) {
            unitStats.meleeAttack = (unitStats.meleeAttack || 0) + levelsEarned * 2;
            unitStats.meleeDefense = (unitStats.meleeDefense || 0) + levelsEarned * 2;
            unitStats.health = (unitStats.health || 100) + levelsEarned * 10;
        }
        if (entry.statPenaltyPct > 0) {
            const mult = 1 - entry.statPenaltyPct;
            unitStats.meleeAttack *= mult;
            unitStats.meleeDefense *= mult;
            unitStats.speed *= mult;
            unitStats.accuracy *= mult;
            unitStats.missileBaseDamage *= mult;
        }
        // Camp damage penalty — read LIVE at spawn time. Since defenders
        // trickle in over the raid's duration and tents can be actively
        // burning right now, later reinforcements can arrive more
        // demoralized than the first responders if the fire keeps spreading.
        const campDmg = campDamageFraction();
        if (campDmg > 0) {
            unitStats.morale = Math.round((unitStats.morale || 20) * (1 - CAMP_DAMAGE_MORALE_PENALTY_MAX * campDmg));
            unitStats.maxMorale = Math.round((unitStats.maxMorale || 20) * (1 - CAMP_DAMAGE_MORALE_PENALTY_MAX * campDmg));
            unitStats.health = Math.round((unitStats.health || 100) * (1 - CAMP_DAMAGE_HP_PENALTY_MAX * campDmg));
        }
        const safeHP = unitStats.health || unitStats.hp || unitStats.maxHealth || template.health || 100;
        const visType = visTypeFor(unitKey, template);
        const unit = {
            id: Math.floor(Math.random() * 999999),
            side: "player", faction: faction, color: color, unitType: unitKey,
            disableAICombat: false, stats: unitStats, hp: safeHP, maxHp: safeHP,
            ammo: unitStats.ammo || template.ammo || 0, renderType: visType,
            x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8,
            vx: 0, vy: 0, direction: 1,
            anim: Math.floor(Math.random() * 100), frame: 0, isMoving: false, target: null, state: "idle",
            animOffset: Math.random() * 100, cooldown: 0, hasOrders: false,
            _survivalRosterUid: entry.uid
        };
        battleEnvironment.units.push(unit);
        return unit;
    }

    // Defenders wake up and join one at a time instead of all spawning at
    // once — a couple are "on watch" already, the rest trickle in from the
    // tents on a timer. If the enemy is wiped before everyone's awake, the
    // spawn loop is simply cancelled — no harm in a few troops sleeping
    // through the whole thing.
    function beginStaggeredDefenderSpawn(fightableRoster, tentPositions, faction, color) {
        nightRaidSpawnQueue = fightableRoster.slice();
        if (nightRaidSpawnTimer) { clearInterval(nightRaidSpawnTimer); nightRaidSpawnTimer = null; }

        function spawnOne() {
            if (!nightRaidActive || nightRaidSpawnQueue.length === 0) {
                if (nightRaidSpawnTimer) { clearInterval(nightRaidSpawnTimer); nightRaidSpawnTimer = null; }
                return;
            }
            const entry = nightRaidSpawnQueue.shift();
            const tent = tentPositions[Math.floor(Math.random() * tentPositions.length)];
            buildNightRaidDefender(entry, faction, color, tent.x, tent.y);
        }

        for (let i = 0; i < Math.min(NIGHT_RAID_INITIAL_DEFENDERS, nightRaidSpawnQueue.length); i++) spawnOne();
        nightRaidSpawnTimer = setInterval(spawnOne, NIGHT_RAID_SPAWN_INTERVAL_MS);
    }

    function startNightRaidMonitor() {
        if (nightRaidMonitorInterval) clearInterval(nightRaidMonitorInterval);
        nightRaidMonitorInterval = setInterval(() => {
            if (!nightRaidActive || typeof battleEnvironment === "undefined" || !battleEnvironment) return;

            tickTentFires();

            const enemyAlive = battleEnvironment.units.filter(u => u.side === "enemy" && u.hp > 0).length;
            const playerAlive = battleEnvironment.units.filter(u => u.side === "player" && u.hp > 0).length;

            if (enemyAlive === 0) {
                clearInterval(nightRaidMonitorInterval); nightRaidMonitorInterval = null;
                handleNightRaidOutcome(true);
            } else if (playerAlive === 0 && nightRaidSpawnQueue.length === 0) {
                // Only a true loss once no more sleepy reinforcements are coming.
                clearInterval(nightRaidMonitorInterval); nightRaidMonitorInterval = null;
                handleNightRaidOutcome(false);
            }
        }, 500);
    }

    // Enemies lingering near a tent risk setting it alight. Damage is an
    // immediate burst (not a sustained drain) — simpler than tracking a
    // burning-duration timer, while still creating real risk: the longer
    // raiders roam near the camp core, the more ignition rolls they get.
    function tickTentFires() {
        if (!Array.isArray(window.__nightRaidTents) || !run || !Array.isArray(run.campTents)) return;
        window.__nightRaidTents.forEach(tentPos => {
            const rec = run.campTents.find(t => t.id === tentPos.tentId);
            if (!rec || rec.hp <= 0) { if (rec) tentPos.hp = rec.hp; return; } // already burnt out — nothing left to catch

            const enemyNear = battleEnvironment.units.some(u =>
                u.side === "enemy" && u.hp > 0 && Math.hypot(u.x - tentPos.x, u.y - tentPos.y) < TENT_IGNITE_RADIUS);

            if (enemyNear && Math.random() < TENT_IGNITE_CHANCE_PER_TICK) {
                const dmg = randRange(TENT_FIRE_DAMAGE);
                rec.hp = Math.max(0, rec.hp - dmg);
                tentPos.fireFlashUntil = Date.now() + TENT_FIRE_FLASH_MS;
            }
            tentPos.hp = rec.hp; // keep the render-side copy in sync either way
        });
    }

    function showNightRaidAlertBanner() {
        const el = document.createElement("div");
        el.id = "night-raid-alert";
        el.style.position = "fixed";
        el.style.top = "18%";
        el.style.left = "50%";
        el.style.transform = "translateX(-50%)";
        el.style.zIndex = "99996";
        el.style.textAlign = "center";
        el.style.fontFamily = "Georgia, serif";
        el.style.padding = "16px 30px";
        el.style.background = "rgba(60,5,5,0.92)";
        el.style.border = "2px solid #e57373";
        el.style.borderRadius = "6px";
        el.style.boxShadow = "0 0 30px rgba(200,0,0,0.5)";
        el.innerHTML = `
            <div style="font-size:22px; letter-spacing:2px; color:#ff5252;">⚠ SENTRY ALERTED!</div>
            <div style="font-size:14px; color:#ffcdd2; margin-top:6px;">Enemies climbed over the walls — fight them off!!</div>
        `;
        document.body.appendChild(el);
        setTimeout(() => { el.style.transition = "opacity 500ms ease"; el.style.opacity = "0"; setTimeout(() => el.remove(), 550); }, 3200);
    }

    function showNightRaidResultBanner(won, goldReward, foodReward, killedTypes, tentsBurnedDown, tentsDamaged) {
        const el = document.createElement("div");
        el.id = "night-raid-result";
        el.style.position = "fixed";
        el.style.top = "50%";
        el.style.left = "50%";
        el.style.transform = "translate(-50%,-50%)";
        el.style.zIndex = "99997";
        el.style.textAlign = "center";
        el.style.fontFamily = "Georgia, serif";
        el.style.padding = "22px 34px";
        el.style.background = "rgba(10,5,0,0.94)";
        el.style.border = `2px solid ${won ? "#8bc34a" : "#e57373"}`;
        el.style.borderRadius = "6px";
        el.style.boxShadow = "0 0 30px rgba(0,0,0,0.7)";
        const lostLine = killedTypes.length
            ? `<div style="color:#e57373; font-size:12px; margin-top:6px;">Lost: ${groupByType(killedTypes).join(", ")}</div>`
            : `<div style="color:#8bc34a; font-size:12px; margin-top:6px;">No losses.</div>`;
        let tentLine = "";
        if (tentsBurnedDown > 0) {
            tentLine = `<div style="color:#ff8a65; font-size:12px; margin-top:4px;">🔥 ${tentsBurnedDown} tent${tentsBurnedDown === 1 ? "" : "s"} burnt down${tentsDamaged > tentsBurnedDown ? `, ${tentsDamaged - tentsBurnedDown} more scorched` : ""}.</div>`;
        } else if (tentsDamaged > 0) {
            tentLine = `<div style="color:#ffb74d; font-size:12px; margin-top:4px;">🔥 ${tentsDamaged} tent${tentsDamaged === 1 ? "" : "s"} scorched.</div>`;
        } else {
            tentLine = `<div style="color:#8bc34a; font-size:12px; margin-top:4px;">Camp untouched.</div>`;
        }
        el.innerHTML = won ? `
            <div style="font-size:22px; letter-spacing:2px; color:#8bc34a;">✓ RAID REPELLED</div>
            <div style="font-size:14px; color:#f5d76e; margin-top:8px;">+${goldReward} gold &nbsp;·&nbsp; +${foodReward} food</div>
            ${lostLine}
            ${tentLine}
        ` : `
            <div style="font-size:22px; letter-spacing:2px; color:#e57373;">THE CAMP WAS OVERRUN</div>
            <div style="font-size:13px; color:#d4b886; margin-top:8px;">The raiders melt back into the dark before your reinforcements can finish them.</div>
            ${lostLine}
            ${tentLine}
        `;
        document.body.appendChild(el);
        setTimeout(() => { el.style.transition = "opacity 500ms ease"; el.style.opacity = "0"; setTimeout(() => el.remove(), 550); }, 3600);
    }

    function handleNightRaidOutcome(won) {
        nightRaidActive = false;
        window.__IS_NIGHT_RAID__ = false;
        window.__nightRaidTents = null;
        if (nightRaidSpawnTimer) { clearInterval(nightRaidSpawnTimer); nightRaidSpawnTimer = null; }
        nightRaidSpawnQueue = [];

        // Harvest survivors' exp/level, same uid-matching pattern as a
        // normal wave clear. No wound/desert roll here — this isn't a day
        // boundary, so nobody "heals" or "starves" from this fight alone;
        // a defender who died is just gone.
        const killedTypes = [];
        const nextRoster = [];
        run.roster.forEach(entry => {
            if (!rosterIsFightable(entry)) { nextRoster.push(entry); return; } // was asleep, untouched
            const unit = battleEnvironment.units.find(u => u._survivalRosterUid === entry.uid);
            if (!unit) { nextRoster.push(entry); return; } // never got called up before the fight ended
            if (unit.hp > 0) {
                entry.experience = unit.stats.experience || entry.experience;
                entry.experienceLevel = unit.stats.experienceLevel || entry.experienceLevel;
                nextRoster.push(entry);
            } else {
                killedTypes.push(entry.type);
            }
        });
        run.roster = nextRoster;

        let goldReward = 0, foodReward = 0;
        if (won) {
            goldReward = randRange(NIGHT_RAID_REWARD_GOLD);
            foodReward = randRange(NIGHT_RAID_REWARD_FOOD);
            run.gold += goldReward;
            run.food += foodReward;
        }
        // Cooldown applies either way — a repelled or failed raid both mean
        // "leave the camp alone for a while" narratively.
        run.nightRaidCooldown = NIGHT_RAID_COOLDOWN_DAYS;

        // Tent damage caused specifically by THIS raid, vs. the snapshot
        // taken at its start — separate from campDamageFraction, which is
        // the camp's total accumulated (possibly multi-raid) condition.
        let tentsBurnedDown = 0, tentsDamaged = 0;
        run.campTents.forEach((t, i) => {
            const before = nightRaidTentSnapshot[i];
            if (before === undefined || t.hp >= before) return;
            tentsDamaged++;
            if (t.hp <= 0 && before > 0) tentsBurnedDown++;
        });
        nightRaidTentSnapshot = [];

        battleEnvironment.units = [];
        battleEnvironment.projectiles = [];
        const canvas = document.getElementById("gameCanvas");
        if (canvas) canvas.style.display = "none";
        hideSurvivalResourceHud();

        showNightRaidResultBanner(won, goldReward, foodReward, killedTypes, tentsBurnedDown, tentsDamaged);

        // Reopen the day-prep screen — merge the CURRENT (post-reward)
        // food/gold into the last real day-transition report rather than
        // rebuilding one from scratch, so the resources row reads correctly
        // without needing a fake day-boundary economy pass.
        const baseReport = run.lastDayReport || {
            clearedDay: run.day - 1, goldReward: 0, killed: [], wounded: [],
            foodConsumed: 0, foodFromShipment: 0, foodFromLoot: 0, goldFromLoot: 0,
            goldFromLumpSum: 0, goldMaintenance: 0, rosterSizeMultiplier: 1,
            deserted: [], healedUp: [], wentHungry: false, shipmentArrived: false
        };
        const mergedReport = Object.assign({}, baseReport, { foodEnd: run.food });
        showDayPrepMenu(mergedReport);
    }

    function triggerNightRaid() {
        if (!run || nightRaidActive) return;
        const prepEl = document.getElementById("survival-prep");
        if (prepEl) prepEl.remove();

        window.__IS_SURVIVAL_BATTLE__ = true;
        generateBattlefield(run.background || "Plains", afterNightRaidGenerate);
    }

    function afterNightRaidGenerate() {
        zoom = 0.5;
        battleEnvironment.groundEffects = [];
        battleEnvironment.projectiles = [];
        window.__IS_NIGHT_RAID__ = true;
        window.__preDeploymentActive = false; // no predeployment — surprise attack, per spec

        const enemyFactionName = run.enemyFaction || pickDailyEnemyFaction();
        const enemyColor = factionColor(enemyFactionName) || ENEMY_FALLBACK_COLOR;
        const enemyRoster = generateNightRaidRoster(run.day, enemyFactionName);
        const fightableRoster = run.roster.filter(rosterIsFightable);

        currentBattleData = {
            playerFaction: run.faction, enemyFaction: enemyFactionName,
            playerColor: run.color, enemyColor: enemyColor,
            initialCounts: { player: fightableRoster.length + 1, enemy: enemyRoster.length }
        };
        preBattleStats = {
            playerTotalHP: 0, enemyTotalHP: 0,
            playerMen: fightableRoster.length + 1, enemyMen: enemyRoster.length
        };

        // Tent positions near the player's usual spawn anchor — defenders
        // wake up and walk out of these one at a time. Read by
        // survivalStructures.js's render hook to draw them + the night tint.
        // Each position is linked (by index) to its PERSISTENT condition
        // record in run.campTents, so this run's actual accumulated fire
        // damage is what renders and burns further — not fresh state
        // every raid.
        if (!Array.isArray(run.campTents) || run.campTents.length === 0) {
            run.campTents = [];
            for (let i = 0; i < CAMP_TENT_COUNT; i++) run.campTents.push({ id: i, hp: CAMP_TENT_MAX_HP, maxHp: CAMP_TENT_MAX_HP });
        }
        const geo = window.battleSpawnAssignment ? window.battleSpawnAssignment.player : null;
        const anchorX = geo ? geo.ax : BATTLE_WORLD_WIDTH / 2;
        const anchorY = geo ? geo.ay : BATTLE_WORLD_HEIGHT - 80;
        const tentPositions = run.campTents.map((rec, i) => ({
            x: anchorX + (i - (run.campTents.length - 1) / 2) * 26 + (Math.random() - 0.5) * 10,
            y: anchorY + (Math.random() - 0.5) * 16,
            tentId: rec.id,
            hp: rec.hp,
            maxHp: rec.maxHp,
            fireFlashUntil: 0
        }));
        window.__nightRaidTents = tentPositions;

        // Enemy raiders — already inside the perimeter, close to camp, and
        // hostile from frame one (nothing freezes them, since predeployment
        // was never activated for this battle).
        enemyRoster.forEach((unitKey, i) => {
            const angle = (i / Math.max(1, enemyRoster.length)) * Math.PI * 2;
            const dist = 90 + Math.random() * 50;
            buildNightRaidEnemy(unitKey, enemyFactionName, enemyColor,
                anchorX + Math.cos(angle) * dist, anchorY + Math.sin(angle) * dist - 40);
        });

        // Commander is always "on duty" — spawns immediately at the first
        // tent, unlike the rank and file who wake up gradually.
        const cmdrTent = tentPositions[0];
        const cmdrTemplate = UnitRoster.allUnits["General"] || {};
        const cmdrRole = cmdrTemplate.role || (typeof ROLES !== "undefined" ? ROLES.HORSE_ARCHER : "horse_archer");
        const cmdrStats = Object.assign(new Troop("General", cmdrRole, true, run.faction), cmdrTemplate);
        cmdrStats.health = cmdrStats.health || 140;
        cmdrStats.experienceLevel = cmdrStats.experienceLevel || 5;
        battleEnvironment.units.push({
            id: 999999, side: "player", faction: run.faction, color: run.color, unitType: "General",
            isCommander: true, disableAICombat: false, stats: cmdrStats,
            hp: cmdrStats.health || 200, maxHp: cmdrStats.health || 200, ammo: cmdrStats.ammo || 24,
            renderType: "horse_archer", x: cmdrTent.x, y: cmdrTent.y,
            vx: 0, vy: 0, direction: 1, anim: 0, frame: 0, isMoving: false, target: null, state: "idle",
            animOffset: Math.random() * 100, cooldown: 0, hasOrders: false
        });

        if (typeof player !== "undefined") {
            player.x = cmdrTent.x; player.y = cmdrTent.y;
            player.hp = cmdrStats.health || 200;
            player.maxHealth = cmdrStats.health || 200;
            player.ammo = cmdrStats.ammo || 24;
            player.state = "idle";
        }

        const canvas = document.getElementById("gameCanvas");
        if (canvas) {
            canvas.style.display = "block";
            canvas.style.visibility = "visible";
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        if (typeof camera !== "undefined") {
            camera.x = cmdrTent.x - (window.innerWidth / 2 / zoom);
            camera.y = cmdrTent.y - (window.innerHeight / 2 / zoom);
        }

        inBattleMode = true;
        window.inBattleMode = true;
        window.isPaused = false;
        nightRaidActive = true;
        nightRaidTentSnapshot = run.campTents.map(t => t.hp);
        showSurvivalResourceHud();

        showNightRaidAlertBanner();
        beginStaggeredDefenderSpawn(fightableRoster, tentPositions, run.faction, run.color);
        startNightRaidMonitor();

        if (typeof AudioManager !== "undefined") {
            try { AudioManager.playMP3('music/battlemusic.mp3', false); } catch (e) {}
        }
    }

    // ========================================================================
    // DEFEAT
    // ========================================================================
    function handleSurvivalDefeat() {
        hideSurvivalResourceHud();
        stopNightRaidWatch();
        if (typeof EnemyTacticalAI !== "undefined") EnemyTacticalAI.stop();
        if (typeof stopLazyGeneral === "function") stopLazyGeneral();

        // Defensive: guarantees these are cleared even if defeat was reached
        // via handleSurvivalForcedExit mid-predeployment rather than the
        // normal post-wave monitor path.
        window.__preDeploymentActive = false;
        window.__playerDeployZone = null;
        window.__IS_SURVIVAL_BATTLE__ = false;

        inBattleMode = false;
        window.inBattleMode = false;
        battleEnvironment.units = [];
        battleEnvironment.projectiles = [];

        const canvas = document.getElementById("gameCanvas");
        if (canvas) canvas.style.display = "none";

        if (originalLeaveBattlefield_Survival) {
            window.leaveBattlefield = originalLeaveBattlefield_Survival;
            originalLeaveBattlefield_Survival = null;
        }

        const daysHeld = run ? run.day - 1 : 0;
        survivalActive = false;
        showSurvivalGameOver(daysHeld);
    }

    function showSurvivalGameOver(daysHeld) {
        const el = svOverlay("survival-gameover");
        el.innerHTML = `
            <div style="max-width: 600px; text-align: center; padding: 30px; border: 1px solid #d4b886; background: rgba(20,20,20,0.7);">
                <div style="font-size: 30px; letter-spacing: 4px; color: #f44336;">THE LINE HAS FALLEN</div>
                <div style="line-height: 1.7; font-size: 15px; color: #d4b886; margin-top: 20px;">
                    You held the southern line for <b style="color:#f5d76e;">${daysHeld} day${daysHeld === 1 ? "" : "s"}</b>
                    before the last of your men fell.
                </div>
            </div>
        `;
        const btnRow = document.createElement("div");
        btnRow.style.marginTop = "24px";
        btnRow.style.display = "flex";
        btnRow.style.gap = "16px";
        btnRow.appendChild(svBtn("⚔ Try Again", () => {
            el.remove();
            run = null;
            window.showSurvivalSetupMenu();
        }));
        btnRow.appendChild(svBtn("🔙 Main Menu", () => {
            window.location.reload();
        }, { small: true }));
        el.appendChild(btnRow);
    }

})();