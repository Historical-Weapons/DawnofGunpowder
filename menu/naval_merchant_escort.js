;(function () {
    'use strict';

    // ============================================================================
    // NAVAL MERCHANT ESCORT — PROTOTYPE MODE
    // ----------------------------------------------------------------------------
    // A procedurally-scrolling convoy-defense minigame: escort a group of Song
    // merchant junks (carrying hired militia guards and merchants) sailing east
    // across open water. Pirate ships (Wokou/Japanese, Tran Dai Viet, or Goryeo
    // raider factions, built from the REAL troop_system.js roster — see
    // PIRATE_FACTIONS below) close in periodically; on contact every ship in the
    // encounter drops anchor — no drift, even with wind — and the fight hands off
    // entirely to the EXISTING naval battle engine already in this codebase
    // (battlefield_logic.js's applyNavalWaterCollision/NAVAL BOARDING GATE,
    // drowning_detector.js's getNavalSurfaceAt, ai_categories.js's combat AI,
    // naval_sailing_cosmetics.js's sail rendering) rather than reinventing combat.
    // Reaching the target distance (20,000–50,000px, randomized per run) wins.
    //
    // NOT wired into any menu yet (per direct instruction — that file doesn't
    // exist yet). This module is fully self-contained and self-driving: call
    // window.NavalEscortMode.start() to run it standalone for testing right now.
    // A future menu file only needs to call .start(opts) and listen for the
    // 'navalEscortComplete' CustomEvent on window — see the PUBLIC API section
    // at the bottom for the full contract.
    //
    // REQUIRES (must already be loaded on the page, same as every other naval
    // file in this codebase — battlefield_logic.js, ai_categories.js,
    // battlefield_commands.js, drowning_detector.js, naval_battles.js,
    // naval_sailing_cosmetics.js, troop_system.js): this file leans on their
    // top-level bindings (Troop, UnitRoster, ROLES, navalEnvironment,
    // battleEnvironment, getSafeMapCoordinates, etc.) completely unprefixed,
    // exactly the way customsiegebattle.js and custom_naval_launcher.js already
    // do — classic <script> tags share one global lexical scope, so this is the
    // established convention here, not a new one.
    // ============================================================================

    if (window.__NAVAL_ESCORT_LOADED__) return;
    window.__NAVAL_ESCORT_LOADED__ = true;

    // ============================================================================
    // 1. CONFIG
    // ============================================================================
    const ESCORT_CFG = {
        targetDistanceMin: 20000,   // px — shortest possible crossing
        targetDistanceMax: 50000,   // px — longest possible crossing
        baseConvoySpeed:   2.35,    // px/frame cruising speed at @60fps (~140px/s)
        windSpeedMin:      0.55,    // cosmetic wind modulation on cruise speed
        windSpeedMax:      1.25,
        windShiftEveryMs:  14000,   // how often the prevailing wind slowly re-targets

        cleanupBuffer:     2400,    // px behind the convoy's rear before an object is deleted from memory

        encounterGapMin:      3200, // px of clear sailing between pirate encounters
        encounterGapMax:      6200,
        spawnAheadMin:        1300, // px ahead of the convoy a new pirate group first appears
        spawnAheadMax:        2400,
        pirateCloseSpeed:     0.9,  // px/frame pirates creep toward the convoy once spotted
        encounterTriggerGap:  260,  // px — closing this near triggers the anchor/fight

        arenaWidth:  2400,          // local battle-arena size used only during a handed-off fight
        arenaHeight: 1600,

        escortShipCount:   2,       // default convoy composition (overridable via start(opts))
        merchantShipCount: 3,

        merchantGuardCount: [4, 6],   // min/max hired Militia per merchant ship
        escortCrewCount:    [14, 20], // min/max soldiers per escort warship
        pirateCrewBase:     [8, 14],  // min/max pirates per ship at the START of the voyage
        pirateCrewLateBonus: 8,       // extra max pirates per ship by the END of the voyage (difficulty ramp)

        cargoValueRange: [400, 1200], // taels of silver per merchant ship — reported on completion

        fullSailBoostMult:    1.9,    // cruise-speed multiplier while boosting
        fullSailDurationMs:   6000,
        fullSailCooldownMs:   16000,

        sightingTelegraphDist: 1800,  // px — a distant silhouette becomes visible this far out
        // (the 'sighting' dialogue line itself still fires at 1100px, in
        // _updatePirateApproach — the silhouette is a earlier, wordless cue)

        seaLifeGapMs:        [2200, 4800],   // ambient dolphins/gulls/flying fish — ammon-common
        notableSeaLifeGapMs: [26000, 55000], // rare flavor sighting (whale/shark/bioluminescence)
        passingShipGapMs:    [19000, 42000], // westbound NPC traffic in the shipping lane
        passingShipWreckChance: 0.16,        // chance a "passing ship" is wreckage instead — a
                                              // silent warning that a previous convoy didn't make it
        passingShipHailDist: 700,            // px — how close a passing ship needs to be to hail
    };

    // ============================================================================
    // 2. FACTION / UNIT POOLS — built entirely from the real UnitRoster templates
    // in troop_system.js. Nothing here invents a new unit; each pool just picks
    // existing keys whose flavor text already ties them to a region (Glaiveman is
    // explicitly 13th-century Japanese naginata warfare; Poison Crossbowman and
    // Javelinier are explicitly Dai Viet / southern-tropical-frontier auxiliaries)
    // and tags the SPAWNED instances with a custom .faction label for flavor —
    // Troop's constructor already accepts a faction argument for exactly this,
    // it's just left "Generic" by every call in troop_system.js itself.
    // ============================================================================
    const PIRATE_FACTIONS = [
        {
            label: "Wokou Raiders",
            flag: "#7a1f1f",
            // Naginata-armed raiders with a light bow screen — matches the
            // Glaiveman's own flavor text almost exactly ("13th-century Japanese
            // warfare... counter cavalry while still delivering lethal slashing
            // strikes").
            roster: ["Glaiveman", "Glaiveman", "Militia", "Archer", "Slinger"]
        },
        {
            label: "Tran Dai Viet Raiders",
            flag: "#1f5c33",
            // Poison Crossbowman + Javelinier are both explicitly "southern
            // tropical frontier" / Dai Viet auxiliaries in their own descriptions.
            roster: ["Javelinier", "Poison Crossbowman", "Poison Crossbowman", "Militia", "Javelinier"]
        },
        {
            label: "Goryeo Sea Raiders",
            flag: "#2b3a67",
            // No unit in the roster is explicitly Korean-flavored, so this pool
            // draws from the same general Sinosphere infantry/archer/crossbow mix
            // the roster's own descriptions treat as common across the region —
            // a deliberate reskin (faction label only), not a new stat block.
            roster: ["Spearman", "Crossbowman", "Archer", "Militia", "Shielded Infantry"]
        }
    ];

    // Song Imperial Navy — the player's own escort roster. Reuses the SAME
    // generic troop_system.js roster the rest of the game already treats as
    // Song-flavored by default (Song-dynasty crossbows, Song artwork, etc. run
    // through nearly every description in that file).
    const ESCORT_ROSTER_POOL = ["Shielded Infantry", "Crossbowman", "Spearman", "Archer", "Firelance", "Heavy Crossbowman"];

    // Merchant ships carry hired guards, not soldiers — Militia's own flavor
    // text ("hastily armed... great at soaking up enemy volleys or intimidate
    // bandits, before the professional armies arrive") is a near-perfect fit
    // for "a merchant's onboard security," so that's the only unit type used here.
    const MERCHANT_GUARD_UNIT = "Militia";

    function _pickPirateFaction() {
        return PIRATE_FACTIONS[Math.floor(Math.random() * PIRATE_FACTIONS.length)];
    }

    function _randRosterFrom(pool, count) {
        const out = [];
        for (let i = 0; i < count; i++) out.push(pool[Math.floor(Math.random() * pool.length)]);
        return out;
    }

    function _randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }

    // ============================================================================
    // 3. SHIP TYPE PRESETS
    // Same object shape generateShips() builds in naval_battles.js (width, height,
    // color, deck, mastCount, sailScale) so anything spawned here slots into
    // navalEnvironment.ships without modification the moment combat is handed off.
    // Reuses the real SHIP_TYPES.LIGHT/MEDIUM where available; merchant hulls get
    // their own preset since a wide, low-and-slow cargo junk has no equivalent in
    // the existing combat-ship sizes.
    // ============================================================================
    function _shipTypeFallback(kind) {
        // Only used if SHIP_TYPES (naval_battles.js) hasn't loaded — keeps this
        // file from hard-crashing if load order is ever different, though the
        // real SHIP_TYPES should always be preferred when present.
        const presets = {
            LIGHT:  { width: 140, height: 60, color: "#8a6d3b", deck: "#c2a15a", mastCount: 1, sailScale: 0.8 },
            MEDIUM: { width: 200, height: 90, color: "#6b5636", deck: "#b08f4e", mastCount: 2, sailScale: 1.0 }
        };
        return presets[kind] || presets.MEDIUM;
    }

    function _escortHullPreset() {
        const base = (typeof SHIP_TYPES !== 'undefined' && SHIP_TYPES.MEDIUM) ? SHIP_TYPES.MEDIUM : _shipTypeFallback('MEDIUM');
        return Object.assign({}, base, { name: "Song Escort Junk" });
    }

    function _pirateHullPreset() {
        const base = (typeof SHIP_TYPES !== 'undefined' && SHIP_TYPES.LIGHT) ? SHIP_TYPES.LIGHT : _shipTypeFallback('LIGHT');
        return Object.assign({}, base, { name: "Raider Ship" });
    }

    function _merchantHullPreset() {
        // Wider and lower than either combat hull — reads as a heavy cargo
        // vessel, not a warship. Duller, sun-bleached color palette to visually
        // separate it from the escorts at a glance.
        const base = _escortHullPreset();
        return Object.assign({}, base, {
            name:   "Merchant Junk",
            width:  Math.round(base.width  * 1.15),
            height: Math.round(base.height * 1.05),
            color:  "#7c6a4a",
            deck:   "#a68f5c",
            mastCount: Math.max(1, (base.mastCount || 2) - 1),
            sailScale: (base.sailScale || 1) * 0.85
        });
    }

    // Builds a ship object matching generateShips()'s pShip/eShip shape exactly,
    // so it can be dropped into navalEnvironment.ships and immediately understood
    // by getNavalSurfaceAt, applyNavalWaterCollision, the sail cosmetics system,
    // and every AI file already built around that shape.
    function _makeShipObject(hull, side, x, y, heading) {
        return {
            side: side,
            x: x,
            y: y,
            width:  hull.width,
            height: hull.height,
            color:  hull.color,
            deck:   hull.deck,
            mastCount: hull.mastCount,
            sailScale: hull.sailScale,
            type: hull.name,

            heading: heading,
            speed: 0,
            maxSpeed: 7.00,
            vx: 0,
            vy: 0,
            rudderAngle: 0,
            turnRate: 0.007,
            sailAngle: 0,
            sailTarget: 0,
            sailTurnSpeed: 0.025,
            _sailManual: false,
            isPlayerControlled: (side === "player")
        };
    }

    // ============================================================================
    // 4. STATE
    // ============================================================================
    const S = {
        active: false,
        state: 'IDLE',      // IDLE | SAILING | COMBAT | VICTORY | DEFEAT
        worldX: 0,          // convoy's leading-edge world position == distance traveled (starts at 0)
        targetDistance: 0,
        baseY: 0,           // fixed mid-ocean Y band everything is framed around

        wind: { angle: 0, speed: 0.9, targetAngle: 0, targetSpeed: 0.9, nextShiftAt: 0 },
        fullSail: { active: false, until: 0, readyAt: 0 }, // player-triggerable speed boost — see _updateFullSail()

        convoy: [],         // ship objects tagged with .escortRole ('escort'|'merchant'), .crewStrength (0-1), .lost (bool)
        pirateGroups: [],   // { worldX, ships:[...], faction, spotted:bool, id }
        debris: [],         // cosmetic culled objects: { worldX, ...draw info }
        seaLife: [],        // ambient + notable creature sightings — see _updateSeaLife()
        passingShips: [],   // westbound NPC traffic (or wreckage) sharing the shipping lane
        nextEncounterAtWorldX: 0,
        nextSeaLifeAt: 0,
        nextNotableSeaLifeAt: 0,
        nextPassingShipAt: 0,
        encounterIdSeq: 0,
        milestonesFired: {},  // {25:true, 50:true, 75:true} — see _checkMilestones()

        combat: null,       // bookkeeping while state === 'COMBAT' (see _beginPirateEncounter)

        canvas: null,
        ctx: null,
        rafId: null,
        lastTs: 0,

        onCompleteFired: false
    };

    // ============================================================================
    // 5. DIALOGUE — self-contained, mirrors battle-loading-screen.js's own
    // PRE-BATTLE SOLDIER CHATTER system (same bubble/roundRect/anti-repeat
    // pattern) rather than depending on city_dialogue_system.js / RandomDialogue.js,
    // which this file cannot see and which may not even be loaded on whatever
    // page eventually hosts this minigame.
    // ============================================================================
    const DIALOGUE_LINES = {
        departure: [
            "Cast off! Keep the merchant ships within hailing distance at all times.",
            "The southern waters are calm today — let's keep them that way.",
            "Signal flags up. We sail on the Emperor's word and the merchants' silver.",
            "Watch the horizon, not the harbor. That's behind us now."
        ],
        sighting: [
            "Sail spotted off the bow! Could be raiders — stay sharp.",
            "Unknown hull closing from ahead. All hands to stations.",
            "That's no merchant flag. Ready the crossbows.",
            "Lookout says pirates. Convoy, hold formation."
        ],
        anchor: [
            "Drop anchor! Brace for boarders!",
            "Anchor's down — we hold here and fight.",
            "No running from this one. Shields up, archers loose at will!",
            "They mean to board us. Don't let them near the merchants!"
        ],
        victory: [
            "Raiders repelled! Weigh anchor, resume course.",
            "That's the last of them. Convoy, reform and sail on.",
            "Well fought. Let's not linger — more water to cross.",
            "Anchor up! Back to formation, all ships."
        ],
        merchantLost: [
            "We've lost a merchant ship! Damn it all.",
            "They've taken one of ours — press on, we can't save her now.",
            "The {ship} is boarded and lost. Tighten the formation around what's left."
        ],
        escortLost: [
            "The {ship} is going down! Close the gap she leaves in the line.",
            "We've lost an escort — the convoy's screen is thinner now.",
            "The {ship}'s crew is gone. Reform around the merchants."
        ],
        milestone: [
            "Quarter of the crossing behind us. Steady on.",
            "Halfway across. No turning back now — hold the line.",
            "Three-quarters through. The far shore isn't far now.",
            "Making good time. Keep the formation tight."
        ],
        seaLifeNotable: [
            "A whale surfaces off the port side — mind the wake!",
            "Look there, a shark trailing the hull. Nothing to fear from that.",
            "The water's alive with light tonight — the sailors call it dragon-fire.",
            "Dolphins running with the bow — good omen, the crew says."
        ],
        passingShip: [
            "Convoy hailing from the east — safe travels, they say, but watch past the midpoint.",
            "A homebound trader dips her flag to us. We answer in kind.",
            "They report calm water ahead but raiders active further east.",
            "Fellow captain shouts a warning we can't quite make out over the wind."
        ],
        wreckageSighted: [
            "Wreckage adrift, no survivors. Someone didn't make this crossing.",
            "That's a hull we're passing, not a ship. Keep the crew's eyes forward.",
            "Broken spars and an empty deck. A grim marker — stay alert."
        ],
        arrival: [
            "Land ho! That's the far shore — we've made it!",
            "Signal the harbor — the convoy has arrived safely.",
            "Drop sail. Home waters at last.",
            "Every merchant that survived owes their cargo to this crew."
        ],
        defeat: [
            "The convoy is lost... all merchant ships are gone.",
            "There's nothing left to escort. Fall back.",
            "We failed them. Signal retreat."
        ]
    };

    const dialogueState = { bubbles: [], nextFireAt: 0, historyByCategory: {} };

    function _pickFreshLine(category) {
        const pool = DIALOGUE_LINES[category];
        if (!pool || !pool.length) return null;
        let seen = dialogueState.historyByCategory[category];
        if (!seen) { seen = []; dialogueState.historyByCategory[category] = seen; }
        const maxSeen = Math.max(1, Math.floor(pool.length / 2));
        const fresh = pool.filter(l => seen.indexOf(l) === -1);
        const source = fresh.length ? fresh : pool;
        const chosen = source[Math.floor(Math.random() * source.length)];
        seen.push(chosen);
        if (seen.length > maxSeen) seen.shift();
        return chosen;
    }

    // anchorShip: which convoy ship the bubble floats above (defaults to the
    // flagship / first escort if omitted). vars: optional {token: value} map for
    // simple "{ship}"-style substitution (used by merchantLost).
    function _speak(category, anchorShip, vars) {
        let text = _pickFreshLine(category);
        if (!text) return;
        if (vars) {
            Object.keys(vars).forEach(k => { text = text.replace('{' + k + '}', vars[k]); });
        }
        const ship = anchorShip || S.convoy.find(s => s.escortRole === 'escort') || S.convoy[0];
        if (!ship) return;
        dialogueState.bubbles.push({
            text: text,
            shipRef: ship,
            expiresAt: performance.now() + 4200
        });
    }

    function _updateDialogue(now) {
        dialogueState.bubbles = dialogueState.bubbles.filter(b => now < b.expiresAt && S.convoy.indexOf(b.shipRef) !== -1);
    }

    function _wrapText(ctx, text, maxWidth) {
        const words = text.split(/\s+/);
        const lines = [];
        let line = "";
        for (const word of words) {
            const test = line ? (line + " " + word) : word;
            if (line && ctx.measureText(test).width > maxWidth) { lines.push(line); line = word; }
            else line = test;
        }
        if (line) lines.push(line);
        return lines;
    }

    function _roundRect(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
        ctx.lineTo(x + w, y + h - rr);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        ctx.lineTo(x + rr, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
        ctx.lineTo(x, y + rr);
        ctx.quadraticCurveTo(x, y, x + rr, y);
        ctx.closePath();
    }

    function _drawDialogueBubbles(ctx, w2s) {
        if (!dialogueState.bubbles.length) return;
        ctx.save();
        ctx.font = "bold 12px Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        dialogueState.bubbles.forEach(b => {
            const sp = w2s(b.shipRef.x, b.shipRef.y - (b.shipRef.height || 80) * 0.7);
            const lines = _wrapText(ctx, b.text, 200);
            const lineH = 15;
            const padX = 10, padY = 8;
            const boxW = Math.min(220, Math.max(...lines.map(l => ctx.measureText(l).width)) + padX * 2);
            const boxH = lines.length * lineH + padY * 2;
            const bx = sp.x - boxW / 2, by = sp.y - boxH - 14;

            ctx.fillStyle = "rgba(20,12,4,0.88)";
            ctx.strokeStyle = "rgba(212,184,134,0.7)";
            ctx.lineWidth = 1.5;
            _roundRect(ctx, bx, by, boxW, boxH, 8);
            ctx.fill();
            ctx.stroke();

            // little tail pointing down at the ship
            ctx.beginPath();
            ctx.moveTo(sp.x - 6, by + boxH);
            ctx.lineTo(sp.x + 6, by + boxH);
            ctx.lineTo(sp.x, by + boxH + 10);
            ctx.closePath();
            ctx.fillStyle = "rgba(20,12,4,0.88)";
            ctx.fill();

            ctx.fillStyle = "#f0d9a8";
            lines.forEach((l, i) => ctx.fillText(l, bx + boxW / 2, by + padY + i * lineH));
        });
        ctx.restore();
    }

    // ============================================================================
    // 6. WORLD CULLING — "stuff that passes on the left just gets deleted from
    // memory." Anything (debris, resolved pirate wrecks, spent encounter markers)
    // more than cleanupBuffer behind the convoy's leading edge is spliced out.
    // ============================================================================
    function _cullBehind() {
        const cutoff = S.worldX - ESCORT_CFG.cleanupBuffer;
        if (S.debris.length) {
            for (let i = S.debris.length - 1; i >= 0; i--) {
                if (S.debris[i].worldX < cutoff) S.debris.splice(i, 1);
            }
        }
        // Pirate groups that were spotted, drifted off without ever closing
        // (shouldn't normally happen since they home in on the convoy, but is a
        // real possibility if the convoy is destroyed/stopped some other way)
        // are also culled once they fall behind the cleanup line.
        for (let i = S.pirateGroups.length - 1; i >= 0; i--) {
            if (S.pirateGroups[i].worldX < cutoff) S.pirateGroups.splice(i, 1);
        }
        for (let i = S.seaLife.length - 1; i >= 0; i--) {
            if (S.seaLife[i].worldX < cutoff) S.seaLife.splice(i, 1);
        }
        for (let i = S.passingShips.length - 1; i >= 0; i--) {
            if (S.passingShips[i].worldX < cutoff) S.passingShips.splice(i, 1);
        }
    }

    // ============================================================================
    // 7. SAILING PHYSICS — deliberately lightweight and distinct from the naval
    // battle engine's own oar/rudder combat physics (NavalRowing.js): this is a
    // long-distance cruise, not tactical maneuvering. Wind is cosmetic here (a
    // gentle 0.55x-1.25x speed modulator + sail-orientation hint), not a full
    // force simulation — that level of detail belongs to actual combat, which
    // this mode delegates to the real engine anyway.
    // ============================================================================
    function _updateWind(now) {
        if (now >= S.wind.nextShiftAt) {
            S.wind.targetAngle = (Math.random() - 0.5) * 0.9; // stays broadly "from behind/abeam", not headwind
            S.wind.targetSpeed = ESCORT_CFG.windSpeedMin + Math.random() * (ESCORT_CFG.windSpeedMax - ESCORT_CFG.windSpeedMin);
            S.wind.nextShiftAt = now + ESCORT_CFG.windShiftEveryMs;
        }
        S.wind.angle += (S.wind.targetAngle - S.wind.angle) * 0.01;
        S.wind.speed += (S.wind.targetSpeed - S.wind.speed) * 0.01;
    }

    // "Full Sail" — the one direct piece of player agency during an otherwise
    // autopiloted crossing. Press SPACE (see _installInputHandlers below) for a
    // temporary cruise-speed boost; a cooldown keeps it from just being a
    // permanent speed-up. Returns the current speed multiplier to apply.
    function _updateFullSail(now) {
        if (S.fullSail.active && now >= S.fullSail.until) S.fullSail.active = false;
        return S.fullSail.active ? ESCORT_CFG.fullSailBoostMult : 1;
    }

    function _triggerFullSail() {
        if (S.state !== 'SAILING') return;
        const now = performance.now();
        if (S.fullSail.active || now < S.fullSail.readyAt) return; // already boosting or still cooling down
        S.fullSail.active = true;
        S.fullSail.until = now + ESCORT_CFG.fullSailDurationMs;
        S.fullSail.readyAt = now + ESCORT_CFG.fullSailDurationMs + ESCORT_CFG.fullSailCooldownMs;
    }

    let _inputHandlersInstalled = false;
    function _installInputHandlers() {
        if (_inputHandlersInstalled) return;
        _inputHandlersInstalled = true;
        window.addEventListener('keydown', (e) => {
            if (!S.active) return;
            if (e.code === 'Space' || e.key === ' ') { _triggerFullSail(); e.preventDefault(); }
        });
    }

    function _updateSailingPhysics() {
        const now = performance.now();
        _updateWind(now);

        const boost = _updateFullSail(now);
        const cruiseSpeed = ESCORT_CFG.baseConvoySpeed * S.wind.speed * boost;
        S.worldX += cruiseSpeed;

        // Keep every convoy ship eased toward its formation slot relative to the
        // advancing leading edge — soft lerp, not hard physics, so formation
        // always looks natural without any risk of runaway velocity.
        S.convoy.forEach(ship => {
            if (ship.lost) return;
            const targetX = S.worldX + ship.formationOffsetX;
            const targetY = S.baseY  + ship.formationOffsetY;
            const dx = targetX - ship.x, dy = targetY - ship.y;
            ship.vx = dx * 0.06;
            ship.vy = dy * 0.06;
            ship.x += ship.vx;
            ship.y += ship.vy;
            if (Math.abs(ship.vx) > 0.05 || Math.abs(ship.vy) > 0.05) {
                ship.heading = Math.atan2(ship.vy, ship.vx);
            }
            ship.sailTarget = S.wind.angle - ship.heading;

            // Wake trail — a short, fading breadcrumb of recent positions.
            // Purely cosmetic (drawn in _renderShip), capped so it never grows
            // unbounded regardless of how long a run lasts.
            if (!ship._wake) ship._wake = [];
            ship._wake.push({ x: ship.x, y: ship.y });
            if (ship._wake.length > 18) ship._wake.shift();
        });
    }

    // ============================================================================
    // 8. PIRATE SPAWNING & COLLISION
    // ============================================================================
    function _difficultyProgress() {
        return S.targetDistance > 0 ? Math.min(1, S.worldX / S.targetDistance) : 0;
    }

    function _maybeSpawnPirateGroup() {
        if (S.state !== 'SAILING') return;
        // BUGFIX: previously nothing capped how many pirate groups could be
        // "in flight" at once. encounterGapMin (3200px) is comfortably shorter
        // than the distance a spawned group actually needs to close on the
        // convoy (spawnAhead 1300-2400px, closing at ~3px/frame combined —
        // several thousand more px of travel), so a second group routinely
        // spawned before the first ever reached collision range. Two pirate
        // groups converging on the SAME convoy independently isn't just harder
        // than intended, it also opened a real edge case in
        // _beginPirateEncounter: if the first fight had already sunk every
        // merchant, the second group's encounter would trigger against zero
        // valid targets. One active group at a time removes both problems —
        // encounters are sequential, and the mission-failure check right after
        // a fight resolves is always evaluated before another can ever start.
        if (S.pirateGroups.length > 0) return;
        if (S.worldX < S.nextEncounterAtWorldX) return;
        if (!S.convoy.some(s => s.escortRole === 'merchant' && !s.lost)) return; // nothing left worth raiding

        const faction = _pickPirateFaction();
        const progress = _difficultyProgress();
        const shipCount = 1 + Math.floor(progress * 2 + Math.random() * 1.4); // 1-3, biased up later in the voyage
        const groupWorldX = S.worldX + _randInt(ESCORT_CFG.spawnAheadMin, ESCORT_CFG.spawnAheadMax);

        const ships = [];
        for (let i = 0; i < shipCount; i++) {
            const hull = _pirateHullPreset();
            const y = S.baseY + (i - (shipCount - 1) / 2) * (hull.height * 1.4);
            ships.push(_makeShipObject(hull, "enemy", groupWorldX, y, Math.PI)); // facing west, toward the convoy
        }

        S.pirateGroups.push({
            id: ++S.encounterIdSeq,
            worldX: groupWorldX,
            baseY: S.baseY,
            ships: ships,
            faction: faction,
            spotted: false
        });

        S.nextEncounterAtWorldX = S.worldX + _randInt(ESCORT_CFG.encounterGapMin, ESCORT_CFG.encounterGapMax);
    }

    function _updatePirateApproach() {
        if (S.state !== 'SAILING') return;
        S.pirateGroups.forEach(group => {
            if (!group.spotted && (group.worldX - S.worldX) < 1100) {
                group.spotted = true;
                _speak('sighting', S.convoy.find(s => s.escortRole === 'escort'));
            }
            // Close the gap from both sides — pirates creep in, the convoy's own
            // advance does the rest.
            if (group.worldX > S.worldX) group.worldX -= ESCORT_CFG.pirateCloseSpeed;
        });
    }

    function _checkPirateCollision() {
        if (S.state !== 'SAILING') return;
        const hit = S.pirateGroups.find(g => Math.abs(g.worldX - S.worldX) <= ESCORT_CFG.encounterTriggerGap);
        if (hit) _beginPirateEncounter(hit);
    }

    // ============================================================================
    // 8b. SEA LIFE — purely cosmetic ambient creatures (dolphins, flying fish,
    // gulls) spawn often, for a shipping lane that always feels alive. Rarer
    // "notable" sightings (a whale, a trailing shark, bioluminescence) fire a
    // one-line flavor dialogue when they appear, but never affect the fight or
    // the crossing itself — this is texture, not a mechanic.
    // ============================================================================
    const SEA_LIFE_KINDS = ['dolphins', 'flyingFish', 'gulls'];
    const NOTABLE_SEA_LIFE_KINDS = ['whale', 'shark', 'bioluminescence'];

    function _spawnSeaLife(kind, notable) {
        S.seaLife.push({
            kind: kind,
            notable: !!notable,
            worldX: S.worldX + ESCORT_CFG.spawnAheadMax * 0.4 + Math.random() * 500,
            y: S.baseY + (Math.random() - 0.5) * 420,
            phase: Math.random() * Math.PI * 2,
            speed: 0.6 + Math.random() * 1.4
        });
        if (notable) _speak('seaLifeNotable', null);
    }

    function _updateSeaLife(now) {
        if (now >= S.nextSeaLifeAt) {
            _spawnSeaLife(SEA_LIFE_KINDS[Math.floor(Math.random() * SEA_LIFE_KINDS.length)], false);
            S.nextSeaLifeAt = now + _randInt(ESCORT_CFG.seaLifeGapMs[0], ESCORT_CFG.seaLifeGapMs[1]);
        }
        if (now >= S.nextNotableSeaLifeAt) {
            _spawnSeaLife(NOTABLE_SEA_LIFE_KINDS[Math.floor(Math.random() * NOTABLE_SEA_LIFE_KINDS.length)], true);
            S.nextNotableSeaLifeAt = now + _randInt(ESCORT_CFG.notableSeaLifeGapMs[0], ESCORT_CFG.notableSeaLifeGapMs[1]);
        }
        // Ambient creatures drift roughly westward relative to the world (the
        // convoy is overtaking them, not the other way round) — small, cheap
        // motion, no physics needed.
        S.seaLife.forEach(creature => {
            creature.worldX -= creature.speed;
            creature.phase += 0.05;
        });
    }

    // ============================================================================
    // 8c. PASSING SHIPS — westbound NPC traffic sharing the same shipping lane,
    // making the ocean feel like a real route instead of empty water with only
    // the player's own convoy on it. Occasionally a "passing ship" is wreckage
    // instead of a live vessel — a wordless warning that a previous convoy
    // didn't make this crossing.
    // ============================================================================
    function _spawnPassingShip() {
        const isWreck = Math.random() < ESCORT_CFG.passingShipWreckChance;
        const hull = _merchantHullPreset();
        const ship = _makeShipObject(hull, "neutral", S.worldX + _randInt(ESCORT_CFG.spawnAheadMin, ESCORT_CFG.spawnAheadMax * 1.4), S.baseY + (Math.random() - 0.5) * 700, Math.PI);
        S.passingShips.push({
            worldX: ship.x,
            y: ship.y,
            ship: ship,
            isWreck: isWreck,
            speed: isWreck ? 0.15 : (0.9 + Math.random() * 0.6), // wrecks drift almost in place
            hailed: false
        });
    }

    function _updatePassingShips(now) {
        if (now >= S.nextPassingShipAt) {
            _spawnPassingShip();
            S.nextPassingShipAt = now + _randInt(ESCORT_CFG.passingShipGapMs[0], ESCORT_CFG.passingShipGapMs[1]);
        }
        S.passingShips.forEach(rec => {
            rec.worldX -= rec.speed; // heading west, opposite the convoy
            rec.ship.x = rec.worldX;
            rec.ship.y = rec.y;
            if (!rec.hailed && Math.abs(rec.worldX - S.worldX) <= ESCORT_CFG.passingShipHailDist) {
                rec.hailed = true;
                _speak(rec.isWreck ? 'wreckageSighted' : 'passingShip', null);
            }
        });
    }

    // ============================================================================
    // 9. COMBAT HANDOFF — this is the "similar to how the battlefield is like
    // now" part: everything from here on is the REAL naval battle engine
    // (battlefield_logic.js / ai_categories.js / drowning_detector.js /
    // naval_sailing_cosmetics.js) taking over, exactly as it does for any other
    // naval battle in this codebase. This file's own job is just to build a
    // faithful arena and hand the reins over cleanly, then read the result back.
    // ============================================================================

    // Deck troop spawn — mirrors custom_naval_launcher.js's own
    // _customNavalDeckSpawn() (same superellipse on-deck test, same
    // heading-rotated local->world placement, same battleEnvironment.units
    // shape) since that function is private to that file's closure and can't be
    // called from here directly.
    function _escortDeckSpawn(rosterArray, side, faction, color, ship, isFlagship) {
        const spawnList = isFlagship ? ["General", ...rosterArray] : rosterArray;
        let cols = Math.ceil(Math.sqrt(spawnList.length * (ship.width / ship.height)));
        if (cols < 1) cols = 1;
        let rows = Math.ceil(spawnList.length / cols);
        if (rows < 1) rows = 1;

        const PERSONAL_SPACE = 22;
        const spacingX = Math.min(PERSONAL_SPACE, (ship.width * 0.85) / cols);
        const spacingY = Math.min(PERSONAL_SPACE, (ship.height * 0.85) / rows);
        const blockW = cols * spacingX;
        const blockH = rows * spacingY;

        const _h = ship.heading || 0;
        const _cos = Math.cos(_h), _sin = Math.sin(_h);

        function _isOnDeckLocal(lx, ly) {
            const rx = ship.width / 2, ry = ship.height / 2;
            return (Math.pow(Math.abs(lx) / rx, 2.5) + Math.pow(Math.abs(ly) / ry, 2.5)) <= 0.90;
        }

        const spawned = [];
        spawnList.forEach((unitKey, i) => {
            const template = (typeof UnitRoster !== 'undefined' && UnitRoster.allUnits[unitKey]) || UnitRoster.allUnits["Militia"];
            const isCmdr = (unitKey === "General");

            const row = Math.floor(i / cols), col = i % cols;
            let localX = -blockW / 2 + (col * spacingX) + (spacingX / 2) + (Math.random() - 0.5) * (spacingX * 0.4);
            let localY = -blockH / 2 + (row * spacingY) + (spacingY / 2) + (Math.random() - 0.5) * (spacingY * 0.4);

            if (!_isOnDeckLocal(localX, localY)) {
                for (let attempt = 0; attempt < 50 && !_isOnDeckLocal(localX, localY); attempt++) {
                    localX = (Math.random() - 0.5) * (ship.width * 0.20);
                    localY = (Math.random() - 0.5) * (ship.height * 0.20);
                }
                if (!_isOnDeckLocal(localX, localY)) { localX = 0; localY = 0; }
            }

            const px = ship.x + localX * _cos - localY * _sin;
            const py = ship.y + localX * _sin + localY * _cos;

            const unitStats = Object.assign(new Troop(template.name, template.role, template.isLarge, faction), template);
            unitStats.morale = 20;
            unitStats.maxMorale = 20;
            unitStats.faction = faction;
            const safeHP = isCmdr ? 200 : (unitStats.health || unitStats.hp || 100);

            let visType = "peasant";
            const roleStr = String(template.role).toLowerCase();
            if (roleStr.includes("cavalry") || roleStr.includes("mounted")) visType = "cavalry";
            else if (roleStr.includes("horse archer")) visType = "horse_archer";
            else if (roleStr.includes("pike") || unitKey.includes("Glaive")) visType = "spearman";
            else if (roleStr.includes("shield")) visType = "sword_shield";
            else if (roleStr.includes("two-handed")) visType = "two_handed";
            else if (roleStr.includes("crossbow")) visType = "crossbow";
            else if (roleStr.includes("firelance")) visType = "firelance";
            else if (roleStr.includes("archer")) visType = "archer";
            else if (roleStr.includes("gun")) visType = "gun";
            else if (roleStr.includes("bomb")) visType = "bomb";
            else if (roleStr.includes("rocket")) visType = "rocket";
            else if (roleStr.includes("throwing")) visType = "peasant";

            const unit = {
                id: Math.floor(Math.random() * 999999),
                side: side,
                faction: faction,
                color: color,
                unitType: isCmdr ? "General" : unitKey,
                isCommander: isCmdr,
                disableAICombat: (side === 'player' && isCmdr),
                stats: unitStats,
                hp: safeHP,
                maxHp: safeHP,
                ammo: isCmdr ? (unitStats.ammo || 24) : (unitStats.ammo || (template && template.ammo) || 0),
                renderType: visType,
                x: px, y: py,
                vx: 0, vy: 0,
                direction: side === "player" ? 1 : -1,
                target: null,
                state: "idle",
                spawnMode: "naval",
                animOffset: Math.random() * 100,
                cooldown: 170,
                hasOrders: false,
                anim: Math.floor(Math.random() * 100),
                frame: 0,
                isMoving: false,
                overboardTimer: 0,
                drownTimer: 0,
                isSwimming: false,
                _escortShipRef: ship  // bookkeeping only — lets _pollCombatResolution() tell which ship a survivor belongs to
            };
            battleEnvironment.units.push(unit);
            spawned.push(unit);
        });
        return spawned;
    }

    function _beginPirateEncounter(group) {
        S.state = 'COMBAT';

        // Fresh local battle arena. Sailing-phase worldX values can be enormous
        // (up to 50,000+) by the time a later encounter fires, so participants
        // are rebuilt into a small, sane arena rather than fed those raw
        // coordinates — only ship COUNT/TYPE/crew-strength/roster carry over,
        // not exact pixel position, which the player never sees change since
        // the whole screen transitions into the battle view at this point.
        window.BATTLE_WORLD_WIDTH = ESCORT_CFG.arenaWidth;
        window.BATTLE_WORLD_HEIGHT = ESCORT_CFG.arenaHeight;
        if (typeof BATTLE_TILE_SIZE === 'undefined' || !BATTLE_TILE_SIZE) window.BATTLE_TILE_SIZE = 8;
        window.BATTLE_COLS = Math.floor(ESCORT_CFG.arenaWidth / BATTLE_TILE_SIZE);
        window.BATTLE_ROWS = Math.floor(ESCORT_CFG.arenaHeight / BATTLE_TILE_SIZE);

        if (typeof navalEnvironment === 'undefined') window.navalEnvironment = {};
        navalEnvironment.ships = [];
        navalEnvironment.wind = navalEnvironment.wind || { angle: S.wind.angle, speed: Math.min(1, S.wind.speed) };

        if (typeof battleEnvironment === 'undefined') window.battleEnvironment = {};
        battleEnvironment.units = [];
        battleEnvironment.grid = null;
        battleEnvironment.bgCanvas = null;
        battleEnvironment.fgCanvas = null;
        battleEnvironment.cityGates = [];

        const arenaMidY = ESCORT_CFG.arenaHeight / 2;
        const playerX = ESCORT_CFG.arenaWidth * 0.35;

        const liveConvoy = S.convoy.filter(s => !s.lost);
        const escorts   = liveConvoy.filter(s => s.escortRole === 'escort');
        const merchants = liveConvoy.filter(s => s.escortRole === 'merchant');

        const arenaShips = []; // { origConvoyShip|null, battleShip, side, escortRole }

        // Escorts screen ahead (closer to the enemy approach), merchants held
        // behind them in the same formation shape the player has been watching
        // all voyage.
        escorts.forEach((origShip, i) => {
            const hull = _escortHullPreset();
            const y = arenaMidY + (i - (escorts.length - 1) / 2) * (hull.height * 1.6);
            const bs = _makeShipObject(hull, "player", playerX + hull.width * 0.6, y, 0);
            navalEnvironment.ships.push(bs);
            arenaShips.push({ origConvoyShip: origShip, battleShip: bs, side: 'player', escortRole: 'escort' });
        });
        merchants.forEach((origShip, i) => {
            const hull = _merchantHullPreset();
            const y = arenaMidY + (i - (merchants.length - 1) / 2) * (hull.height * 1.6);
            const bs = _makeShipObject(hull, "player", playerX - hull.width * 0.5, y, 0);
            navalEnvironment.ships.push(bs);
            arenaShips.push({ origConvoyShip: origShip, battleShip: bs, side: 'player', escortRole: 'merchant' });
        });

        // SURGERY: pirates are paired hull-ADJACENT to a specific target ship
        // rather than lined up on a separate firing line ~750px away. The
        // "collision" already happened back in the SAILING phase — that's what
        // triggered this encounter — so by the time the arena exists the pirate
        // hull is already touching its target's, exactly matching "all ships
        // stop moving, drop anchor... and we must fight them" as an immediate
        // boarding action. Without this pairing, window._navalBoardingTimer
        // being pre-set true below would unlock full boarding-charge behavior
        // (see battlefield_logic.js's NAVAL BOARDING GATE) with no adjacent
        // deck for anyone to actually board onto — troops would either stand
        // stuck at their own ship's rail or, since the post-grapple state also
        // lifts the water-collision wall, wade into open water trying to close
        // a gap no normal boarding ever has to cross. Targets are claimed
        // escorts-first (round-robin) so escort ships take the brunt of the
        // raid as a screen, falling back to merchants only once every escort
        // already has a pirate on it.
        const boardTargets = escorts.length ? escorts.slice() : merchants.slice();
        group.ships.forEach((pShipTemplate, i) => {
            const hull = _pirateHullPreset();
            const targetOrigShip = boardTargets.length ? boardTargets[i % boardTargets.length] : null;
            const targetRec = targetOrigShip ? arenaShips.find(r => r.origConvoyShip === targetOrigShip) : null;

            let px, py;
            if (targetRec) {
                // Same lane as the target, hull-to-hull on its seaward (east) side.
                const stack = i >= boardTargets.length ? Math.floor(i / boardTargets.length) : 0;
                px = targetRec.battleShip.x + targetRec.battleShip.width / 2 + hull.width / 2 + stack * (hull.width * 0.15);
                py = targetRec.battleShip.y + (stack % 2 === 0 ? -1 : 1) * (stack * hull.height * 0.5);
            } else {
                // No living player ship to pair against (shouldn't normally
                // happen — encounters never spawn once every merchant is
                // lost, see _maybeSpawnPirateGroup) — fall back to a plain
                // line so this can never throw.
                px = playerX + 260 + hull.width * 0.6;
                py = arenaMidY + (i - (group.ships.length - 1) / 2) * (hull.height * 1.6);
            }

            const bs = _makeShipObject(hull, "enemy", px, py, Math.PI); // facing west, into the target
            navalEnvironment.ships.push(bs);
            arenaShips.push({ origConvoyShip: null, battleShip: bs, side: 'enemy', escortRole: 'pirate' });
        });

        // ── ANCHOR LOCK ── every ship in this encounter is pinned to its spot —
        // "all ships stop moving, drop anchor even with wind" — reasserted every
        // frame in _pollCombatResolution() below so nothing in the underlying
        // naval engine's own wind/current drift can ever move them.
        arenaShips.forEach(rec => {
            rec.battleShip.speed = 0; rec.battleShip.vx = 0; rec.battleShip.vy = 0; rec.battleShip.rudderAngle = 0;
            rec.battleShip._escortAnchorX = rec.battleShip.x;
            rec.battleShip._escortAnchorY = rec.battleShip.y;
        });

        // ── TROOPS ──
        const progress = _difficultyProgress();
        const flagshipRec = arenaShips.find(r => r.escortRole === 'escort');
        let playerTroopTotal = 0, enemyTroopTotal = 0;

        arenaShips.forEach(rec => {
            const strength = rec.origConvoyShip ? rec.origConvoyShip.crewStrength : 1;
            if (rec.escortRole === 'escort') {
                const count = Math.max(3, Math.round(_randInt(ESCORT_CFG.escortCrewCount[0], ESCORT_CFG.escortCrewCount[1]) * strength));
                const roster = _randRosterFrom(ESCORT_ROSTER_POOL, count);
                const spawned = _escortDeckSpawn(roster, 'player', 'Song Imperial Navy', '#1c3f66', rec.battleShip, rec === flagshipRec);
                rec.spawnedUnits = spawned;
                playerTroopTotal += spawned.length;
            } else if (rec.escortRole === 'merchant') {
                const count = Math.max(1, Math.round(_randInt(ESCORT_CFG.merchantGuardCount[0], ESCORT_CFG.merchantGuardCount[1]) * strength));
                const roster = _randRosterFrom([MERCHANT_GUARD_UNIT], count);
                const spawned = _escortDeckSpawn(roster, 'player', 'Merchant Convoy', '#7c6a4a', rec.battleShip, false);
                rec.spawnedUnits = spawned;
                playerTroopTotal += spawned.length;
            } else { // pirate
                const maxCount = ESCORT_CFG.pirateCrewBase[1] + Math.round(ESCORT_CFG.pirateCrewLateBonus * progress);
                const count = _randInt(ESCORT_CFG.pirateCrewBase[0], maxCount);
                const roster = _randRosterFrom(group.faction.roster, count);
                const isFlag = (rec === arenaShips.filter(r => r.escortRole === 'pirate')[0]);
                const spawned = _escortDeckSpawn(roster, 'enemy', group.faction.label, group.faction.flag, rec.battleShip, false);
                if (isFlag && spawned.length) {
                    // One raider captain per encounter (not per ship) — mirrors
                    // the flagship-only commander pattern above without spawning
                    // multiple isCommander units for code elsewhere that expects
                    // to find a single enemy commander.
                    spawned[0].isCommander = true;
                    spawned[0].unitType = "Raider Captain";
                    spawned[0].hp = spawned[0].maxHp = Math.round(spawned[0].maxHp * 1.6);
                }
                rec.spawnedUnits = spawned;
                enemyTroopTotal += spawned.length;
            }
        });

        // ── PLAYER / CAMERA SYNC ── mirrors customsiegebattle.js's own
        // "FIX CAMERA & PLAYER SYNC" pattern so the overworld avatar and camera
        // line up with the flagship's commander the instant combat begins.
        if (flagshipRec && flagshipRec.spawnedUnits) {
            const cmdr = flagshipRec.spawnedUnits.find(u => u.isCommander);
            if (cmdr && typeof player !== 'undefined') {
                player.x = cmdr.x; player.y = cmdr.y;
                player.hp = cmdr.hp; player.maxHealth = cmdr.maxHp || cmdr.hp;
                player.ammo = cmdr.ammo;
                player.state = "idle";
            }
        }

        // window.-prefixed deliberately: this file runs in strict mode (see the
        // top of the IIFE), where a bare `currentBattleData = {...}` would throw
        // a ReferenceError on any page where nothing has touched that global yet
        // (e.g. testing this mode standalone before any siege/naval battle has
        // ever run) — other files can get away with the bare form only because
        // they run in sloppy mode, where it silently creates the same implicit
        // global this achieves explicitly and safely.
        window.currentBattleData = {
            playerFaction: 'Song Imperial Navy',
            enemyFaction: group.faction.label,
            playerColor: '#1c3f66',
            enemyColor: group.faction.flag,
            initialCounts: { player: playerTroopTotal, enemy: enemyTroopTotal }
        };

        window.inBattleMode = true;
        window.inNavalBattle = true;
        window.__preDeploymentActive = false; // ambush — no deploy screen, ships are already grappled
        window._navalBoardingTimer = true;    // immediate boarding — ships are anchored adjacent, not maneuvering
        window.isPaused = false;
        if (typeof startCustomBattleMonitor === 'function') startCustomBattleMonitor();

        S.combat = { group: group, arenaShips: arenaShips, startedAt: performance.now() };
        _speak('anchor', flagshipRec ? flagshipRec.battleShip : null);
    }

    // Called every frame while state === 'COMBAT'. Re-pins anchored ships and
    // watches for the fight's resolution.
    function _pollCombatResolution() {
        if (S.state !== 'COMBAT' || !S.combat) return;

        // Reassert the anchor every frame — bulletproof against any wind/current
        // drift the underlying naval engine might otherwise apply.
        S.combat.arenaShips.forEach(rec => {
            rec.battleShip.x = rec.battleShip._escortAnchorX;
            rec.battleShip.y = rec.battleShip._escortAnchorY;
            rec.battleShip.vx = 0; rec.battleShip.vy = 0; rec.battleShip.speed = 0;
        });

        const enemyAlive = battleEnvironment.units.some(u => u.side === 'enemy' && u.hp > 0);
        const playerAlive = battleEnvironment.units.some(u => u.side === 'player' && u.hp > 0 && !u.isCommander);

        if (!enemyAlive) { _endPirateEncounter('victory'); return; }
        if (!playerAlive) { _endPirateEncounter('routed'); return; }
    }

    function _endPirateEncounter(outcome) {
        const combat = S.combat;
        S.combat = null;

        // Read crew survival back onto each original convoy ship BEFORE tearing
        // the battle state down.
        //
        // BUGFIX: this used to only ever mark MERCHANT ships .lost on a total
        // wipe — an escort warship that lost every soldier aboard kept its
        // crewStrength silently pinned at 0 forever but was never actually
        // removed from the convoy, so it kept occupying a formation slot, kept
        // being offered as a boarding target/troop-count contributor in every
        // later encounter, and kept being rendered as a fully intact ship
        // during SAILING despite having no one left alive on deck. Escorts now
        // get the exact same total-loss handling merchants already had.
        combat.arenaShips.forEach(rec => {
            if (!rec.origConvoyShip) return; // pirate ship — nothing to carry back
            const spawned = rec.spawnedUnits || [];
            const aliveCount = spawned.filter(u => u.hp > 0).length;
            const survivalFrac = spawned.length ? (aliveCount / spawned.length) : 0;
            rec.origConvoyShip.crewStrength = Math.max(0, Math.min(1, rec.origConvoyShip.crewStrength * 0.4 + survivalFrac * 0.6));
            if (aliveCount === 0 && !rec.origConvoyShip.lost) {
                rec.origConvoyShip.lost = true;
                const anchor = S.convoy.find(s => s.escortRole === 'escort' && !s.lost);
                if (rec.escortRole === 'merchant') {
                    _speak('merchantLost', anchor, { ship: rec.origConvoyShip.displayName || "merchant ship" });
                } else {
                    _speak('escortLost', anchor, { ship: rec.origConvoyShip.displayName || "escort ship" });
                }
            }
        });

        window.inNavalBattle = false;
        window._navalBoardingTimer = false;
        battleEnvironment.units = [];
        navalEnvironment.ships = [];

        // Remove the resolved group from the sailing world (culled like any
        // other passed obstacle — see _cullBehind()).
        const idx = S.pirateGroups.indexOf(combat.group);
        if (idx !== -1) S.pirateGroups.splice(idx, 1);

        const anyMerchantsLeft = S.convoy.some(s => s.escortRole === 'merchant' && !s.lost);
        if (outcome === 'routed' || !anyMerchantsLeft) {
            S.state = 'DEFEAT';
            _speak('defeat', null);
            _fireComplete('defeat');
            return;
        }

        S.state = 'SAILING';
        _speak('victory', S.convoy.find(s => s.escortRole === 'escort' && !s.lost));
    }

    // ============================================================================
    // 10. RENDERING (SAILING state only — COMBAT defers entirely to whatever the
    // real naval battle draw loop already does; this file draws nothing during
    // COMBAT except letting the underlying engine's own canvas usage continue).
    // ============================================================================
    function _w2s(cw, ch) {
        // Same convention as every other camera-relative overlay in this
        // codebase (mobileControls.js's AIEmoji, battle-loading-screen.js's
        // chatter bubbles): anchored on window.player.x/y + window.zoom, which
        // this file keeps synced to the convoy's leading edge during SAILING —
        // see _syncCamera() below — so a future menu/HUD that also reads
        // player.x/y for its own purposes stays consistent with this view.
        const z = (typeof window.zoom === 'number' && window.zoom > 0) ? window.zoom : 1;
        const px = S.worldX, py = S.baseY;
        return (wx, wy) => ({ x: (wx - px) * z + cw / 2, y: (wy - py) * z + ch / 2 });
    }

    function _syncCamera() {
        if (typeof window.player === 'undefined' || !window.player) window.player = {};
        window.player.x = S.worldX;
        window.player.y = S.baseY;
        if (typeof window.zoom !== 'number' || !window.zoom) window.zoom = 1;
    }

    function _renderOcean(ctx, cw, ch, w2s) {
        ctx.fillStyle = "#0e3a5c";
        ctx.fillRect(0, 0, cw, ch);

        // Procedural swell bands, seeded per world-X so they scroll believably
        // left-to-right without needing to store per-pixel state anywhere.
        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.lineWidth = 2;
        const bandSpacing = 46;
        const startBand = Math.floor((S.worldX - cw) / bandSpacing);
        const endBand = Math.floor((S.worldX + cw) / bandSpacing);
        for (let b = startBand; b <= endBand; b++) {
            const bx = b * bandSpacing;
            const wobble = Math.sin(b * 12.9898) * 14;
            const sp = w2s(bx, S.baseY + wobble);
            ctx.beginPath();
            ctx.moveTo(sp.x, 0);
            ctx.lineTo(sp.x + wobble, ch);
            ctx.stroke();
        }

        // Far shore becomes visible as the crossing nears its end.
        const remaining = S.targetDistance - S.worldX;
        if (remaining < 2600) {
            const shoreWorldX = S.targetDistance + 400;
            const sp = w2s(shoreWorldX, S.baseY);
            const alpha = Math.max(0, Math.min(1, (2600 - remaining) / 2600));
            ctx.fillStyle = `rgba(58,92,43,${alpha})`;
            ctx.fillRect(sp.x, 0, cw, ch);
        }
    }

    // Distance-based haze — ships/creatures far from the convoy read as hazier,
    // vaguer silhouettes; things close by render crisp. This is what actually
    // gives pirate sails and passing traffic a "distant sighting -> closing in"
    // feel, rather than a hard visibility toggle: anything already inside the
    // camera's view fades in naturally as the gap closes.
    function _hazeAlpha(worldX) {
        const dist = Math.abs(worldX - S.worldX);
        return Math.max(0.35, Math.min(1, 1 - (dist - 500) / 2200));
    }

    function _renderShip(ctx, ship, w2s, opts) {
        opts = opts || {};
        const sp = w2s(ship.x, ship.y);
        const z = (typeof window.zoom === 'number' && window.zoom > 0) ? window.zoom : 1;
        const w = ship.width * z, h = ship.height * z;

        ctx.save();
        ctx.globalAlpha = (opts.alpha != null) ? opts.alpha : 1;

        // Wake trail — drawn in world space (not rotated with the hull), a
        // short fading line of recent positions.
        if (ship._wake && ship._wake.length > 1) {
            ctx.save();
            ctx.strokeStyle = "rgba(220,235,245,0.35)";
            ctx.lineWidth = Math.max(1, 2 * z);
            ctx.beginPath();
            ship._wake.forEach((pt, i) => {
                const wp = w2s(pt.x, pt.y);
                if (i === 0) ctx.moveTo(wp.x, wp.y); else ctx.lineTo(wp.x, wp.y);
            });
            ctx.stroke();
            ctx.restore();
        }

        ctx.translate(sp.x, sp.y);
        // Damage list — a ship running under half crew strength leans slightly,
        // a cheap but readable "this one's hurting" cue without any extra UI.
        const strength = (ship.crewStrength != null) ? ship.crewStrength : 1;
        const list = strength < 1 ? (1 - strength) * 0.22 : 0;
        ctx.rotate((ship.heading || 0) + list);

        ctx.fillStyle = ship.color || "#6b5636";
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = ship.deck || "#a68f5c";
        ctx.beginPath();
        ctx.ellipse(0, 0, w * 0.42, h * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();

        // Battened junk sail per mast — a shallow lens shape with a few batten
        // lines across it, closer to how naval_sailing_cosmetics.js's real
        // combat sails read than a plain rectangle, without duplicating that
        // system's full detail (this is the zoomed-out cruising view).
        const mastCount = ship.mastCount || 1;
        const sailAngle = (ship.sailTarget || 0) * 0.3;
        const damaged = strength < 0.5;
        ctx.fillStyle = ship.side === 'enemy' ? "rgba(122,31,31,0.85)"
            : damaged ? "rgba(180,170,150,0.65)"
            : "rgba(230,220,190,0.9)";
        ctx.strokeStyle = "rgba(60,45,25,0.5)";
        ctx.lineWidth = 1;
        for (let m = 0; m < mastCount; m++) {
            const mx = -w * 0.25 + (m * (w * 0.5 / Math.max(1, mastCount - 1 || 1)));
            const sailW = (h * 0.9) * (ship.sailScale || 1) * (damaged ? 0.7 : 1); // torn/reefed sail if badly hurt
            ctx.save();
            ctx.translate(mx, 0);
            ctx.rotate(sailAngle);
            const battens = 4;
            ctx.beginPath();
            ctx.ellipse(0, 0, 7, sailW / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            for (let b = 1; b < battens; b++) {
                const by = -sailW / 2 + (sailW * b / battens);
                const bx = 7 * Math.sqrt(Math.max(0, 1 - Math.pow(by / (sailW / 2), 2)));
                ctx.moveTo(-bx, by); ctx.lineTo(bx, by);
            }
            ctx.stroke();
            ctx.restore();
        }

        ctx.restore();
    }

    function _renderWreck(ctx, worldX, y, w2s) {
        const sp = w2s(worldX, y);
        const z = (typeof window.zoom === 'number' && window.zoom > 0) ? window.zoom : 1;
        ctx.save();
        ctx.globalAlpha = _hazeAlpha(worldX);
        ctx.fillStyle = "rgba(35,30,25,0.85)";
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.beginPath();
        ctx.ellipse(sp.x, sp.y, 60 * z, 22 * z, 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // A single broken, leaning spar — all that's left of the mast.
        ctx.strokeStyle = "rgba(20,16,12,0.8)";
        ctx.lineWidth = Math.max(1, 3 * z);
        ctx.beginPath();
        ctx.moveTo(sp.x - 10 * z, sp.y);
        ctx.lineTo(sp.x + 4 * z, sp.y - 46 * z);
        ctx.stroke();
        ctx.restore();
    }

    function _renderSeaLife(ctx, w2s) {
        const z = (typeof window.zoom === 'number' && window.zoom > 0) ? window.zoom : 1;
        S.seaLife.forEach(c => {
            const sp = w2s(c.worldX, c.y + Math.sin(c.phase) * 8);
            const alpha = _hazeAlpha(c.worldX);
            ctx.save();
            ctx.globalAlpha = alpha;
            if (c.kind === 'dolphins') {
                ctx.strokeStyle = "rgba(70,90,100,0.8)";
                ctx.lineWidth = Math.max(1, 2 * z);
                for (let i = 0; i < 3; i++) {
                    const dx = sp.x + i * 22 * z, dy = sp.y + Math.sin(c.phase + i) * 10 * z;
                    ctx.beginPath();
                    ctx.arc(dx, dy, 12 * z, Math.PI * 0.15, Math.PI * 0.85);
                    ctx.stroke();
                }
            } else if (c.kind === 'flyingFish') {
                ctx.strokeStyle = "rgba(220,230,235,0.75)";
                ctx.lineWidth = Math.max(1, 1.5 * z);
                for (let i = 0; i < 4; i++) {
                    const dx = sp.x + i * 14 * z, dy = sp.y - Math.abs(Math.sin(c.phase + i * 0.6)) * 14 * z;
                    ctx.beginPath(); ctx.moveTo(dx - 5 * z, dy); ctx.lineTo(dx + 5 * z, dy); ctx.stroke();
                }
            } else if (c.kind === 'gulls') {
                ctx.strokeStyle = "rgba(255,255,255,0.85)";
                ctx.lineWidth = Math.max(1, 1.5 * z);
                for (let i = 0; i < 3; i++) {
                    const dx = sp.x + i * 20 * z, dy = sp.y - 60 * z + Math.sin(c.phase + i) * 10 * z;
                    ctx.beginPath();
                    ctx.moveTo(dx - 8 * z, dy); ctx.lineTo(dx, dy - 5 * z); ctx.lineTo(dx + 8 * z, dy);
                    ctx.stroke();
                }
            } else if (c.kind === 'whale') {
                ctx.fillStyle = "rgba(40,55,65,0.85)";
                ctx.beginPath();
                ctx.ellipse(sp.x, sp.y, 46 * z, 16 * z, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = "rgba(230,240,245,0.7)";
                ctx.lineWidth = Math.max(1, 2 * z);
                const spray = Math.abs(Math.sin(c.phase * 2));
                ctx.beginPath();
                ctx.moveTo(sp.x + 30 * z, sp.y - 10 * z);
                ctx.lineTo(sp.x + 30 * z, sp.y - (10 + spray * 22) * z);
                ctx.stroke();
            } else if (c.kind === 'shark') {
                ctx.fillStyle = "rgba(50,55,60,0.85)";
                ctx.beginPath();
                ctx.moveTo(sp.x, sp.y);
                ctx.lineTo(sp.x - 6 * z, sp.y + 16 * z);
                ctx.lineTo(sp.x + 6 * z, sp.y + 16 * z);
                ctx.closePath();
                ctx.fill();
            } else if (c.kind === 'bioluminescence') {
                const glow = 0.4 + 0.3 * Math.abs(Math.sin(c.phase));
                ctx.fillStyle = "rgba(90,220,210," + glow.toFixed(2) + ")";
                ctx.beginPath();
                ctx.ellipse(sp.x, sp.y, 70 * z, 20 * z, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        });
    }

    function _renderPassingShips(ctx, w2s) {
        S.passingShips.forEach(rec => {
            if (rec.isWreck) { _renderWreck(ctx, rec.worldX, rec.y, w2s); return; }
            _renderShip(ctx, rec.ship, w2s, { alpha: _hazeAlpha(rec.worldX) });
        });
    }

    function _renderConvoy(ctx, w2s) {
        S.convoy.forEach(ship => { if (!ship.lost) _renderShip(ctx, ship, w2s); });
        S.pirateGroups.forEach(group => {
            group.ships.forEach((pShip, i) => {
                // Pirate ships render as a single formation cluster near the
                // group's own worldX (their internal per-ship X isn't tracked
                // during SAILING — only during a handed-off COMBAT arena — a
                // deliberate simplification since the player only ever sees
                // this cluster from a distance before the fight begins). Haze
                // alpha does the "distant sighting closing in" work on its own
                // as group.worldX approaches S.worldX — no separate telegraph
                // state needed.
                const y = S.baseY + (i - (group.ships.length - 1) / 2) * (pShip.height * 1.4);
                _renderShip(ctx, Object.assign({}, pShip, { x: group.worldX, y: y }), w2s, { alpha: _hazeAlpha(group.worldX) });
            });
        });
    }

    function _renderHUD(ctx, cw, ch) {
        const progress = Math.max(0, Math.min(1, S.worldX / S.targetDistance));
        const barW = Math.min(420, cw * 0.6), barH = 14;
        const bx = cw / 2 - barW / 2, by = 18;

        ctx.save();
        ctx.fillStyle = "rgba(10,4,2,0.75)";
        _roundRect(ctx, bx - 4, by - 4, barW + 8, barH + 8, 6);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        _roundRect(ctx, bx, by, barW, barH, 4);
        ctx.fill();
        ctx.fillStyle = "#f5d76e";
        _roundRect(ctx, bx, by, barW * progress, barH, 4);
        ctx.fill();

        ctx.fillStyle = "#f0d9a8";
        ctx.font = "bold 12px Arial, sans-serif";
        ctx.textAlign = "center";
        const merchantsLeft = S.convoy.filter(s => s.escortRole === 'merchant' && !s.lost).length;
        const merchantsTotal = S.convoy.filter(s => s.escortRole === 'merchant').length;
        ctx.fillText(
            Math.round(S.worldX).toLocaleString() + " / " + Math.round(S.targetDistance).toLocaleString() +
            " px  —  " + merchantsLeft + "/" + merchantsTotal + " merchant ships",
            cw / 2, by + barH + 16
        );

        // Threat status — the single most useful thing to read at a glance.
        const nearThreat = S.pirateGroups.find(g => (g.worldX - S.worldX) < ESCORT_CFG.sightingTelegraphDist);
        let status = "Clear waters";
        let statusColor = "#8bc34a";
        if (S.state === 'COMBAT') { status = "ANCHORED — ENGAGING"; statusColor = "#ff5252"; }
        else if (nearThreat && nearThreat.spotted) { status = "Raiders closing — " + nearThreat.faction.label; statusColor = "#ffb74d"; }
        else if (nearThreat) { status = "Sail sighted ahead"; statusColor = "#f5d76e"; }
        ctx.font = "bold 13px Arial, sans-serif";
        ctx.fillStyle = statusColor;
        ctx.fillText(status, cw / 2, by + barH + 34);

        // Wind compass — small arrow, bottom-left, purely informational.
        const wx = 42, wy = ch - 42, wr = 22;
        ctx.strokeStyle = "rgba(212,184,134,0.6)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(wx, wy, wr, 0, Math.PI * 2); ctx.stroke();
        ctx.save();
        ctx.translate(wx, wy);
        ctx.rotate(S.wind.angle);
        ctx.strokeStyle = "#f5d76e";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-wr * 0.7, 0); ctx.lineTo(wr * 0.7, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(wr * 0.7, 0); ctx.lineTo(wr * 0.4, -6); ctx.lineTo(wr * 0.4, 6); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.font = "10px Arial, sans-serif";
        ctx.fillStyle = "#c8b088";
        ctx.fillText("wind", wx, wy + wr + 12);

        // Full Sail indicator — bottom-right, shows availability/cooldown so
        // the SPACE prompt never has to guess at its own state.
        const now = performance.now();
        let sailLabel = "SPACE: Full Sail";
        let sailColor = "#8bc34a";
        if (S.fullSail.active) { sailLabel = "FULL SAIL!"; sailColor = "#f5d76e"; }
        else if (now < S.fullSail.readyAt) { sailLabel = "Full Sail: " + Math.ceil((S.fullSail.readyAt - now) / 1000) + "s"; sailColor = "#888"; }
        ctx.textAlign = "right";
        ctx.font = "bold 12px Arial, sans-serif";
        ctx.fillStyle = sailColor;
        ctx.fillText(sailLabel, cw - 16, ch - 16);

        ctx.restore();
    }

    function _render() {
        if (!S.ctx || !S.canvas) return;
        const cw = S.canvas.width, ch = S.canvas.height;
        const w2s = _w2s(cw, ch);
        const ctx = S.ctx;

        if (S.state === 'COMBAT') return; // real naval battle draw loop owns the canvas now

        _renderOcean(ctx, cw, ch, w2s);
        _renderSeaLife(ctx, w2s);
        _renderPassingShips(ctx, w2s);
        _renderConvoy(ctx, w2s);
        _drawDialogueBubbles(ctx, w2s);
        _renderHUD(ctx, cw, ch);

        if (S.state === 'VICTORY' || S.state === 'DEFEAT') {
            ctx.save();
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            ctx.fillRect(0, 0, cw, ch);
            ctx.fillStyle = "#f5d76e";
            ctx.font = "bold 30px Georgia, serif";
            ctx.textAlign = "center";
            ctx.fillText(S.state === 'VICTORY' ? "Convoy Arrived Safely" : "Convoy Lost", cw / 2, ch / 2);
            if (S.state === 'VICTORY') {
                const cargoDelivered = S.convoy.filter(s => s.escortRole === 'merchant' && !s.lost)
                    .reduce((sum, s) => sum + (s.cargoValue || 0), 0);
                ctx.font = "16px Georgia, serif";
                ctx.fillText(cargoDelivered.toLocaleString() + " taels of cargo delivered", cw / 2, ch / 2 + 34);
            }
            ctx.restore();
        }
    }

    // ============================================================================
    // 11. MAIN LOOP
    // ============================================================================
    // Fires once each as the crossing passes the 25/50/75% marks — breaks up
    // otherwise-silent open stretches between encounters.
    function _checkMilestones() {
        const pct = (S.worldX / S.targetDistance) * 100;
        [25, 50, 75].forEach(mark => {
            if (pct >= mark && !S.milestonesFired[mark]) {
                S.milestonesFired[mark] = true;
                _speak('milestone', S.convoy.find(s => s.escortRole === 'escort' && !s.lost));
            }
        });
    }

    function _tick(ts) {
        if (!S.active) return;
        S.lastTs = ts;
        const now = performance.now();

        if (S.state === 'SAILING') {
            _updateSailingPhysics();
            _maybeSpawnPirateGroup();
            _updatePirateApproach();
            _checkPirateCollision();
            _updateSeaLife(now);
            _updatePassingShips(now);
            _checkMilestones();
            _cullBehind();
            _syncCamera();

            if (S.worldX >= S.targetDistance) {
                S.state = 'VICTORY';
                _speak('arrival', S.convoy.find(s => s.escortRole === 'escort'));
                _fireComplete('victory');
            }
        } else if (S.state === 'COMBAT') {
            _pollCombatResolution();
        }

        _updateDialogue(now);
        _render();

        S.rafId = requestAnimationFrame(_tick);
    }

    function _fireComplete(result) {
        if (S.onCompleteFired) return;
        S.onCompleteFired = true;
        const merchantsLost = S.convoy.filter(s => s.escortRole === 'merchant' && s.lost).length;
        const merchantsTotal = S.convoy.filter(s => s.escortRole === 'merchant').length;
        const escortsLost = S.convoy.filter(s => s.escortRole === 'escort' && s.lost).length;
        const escortsTotal = S.convoy.filter(s => s.escortRole === 'escort').length;
        const cargoDelivered = S.convoy.filter(s => s.escortRole === 'merchant' && !s.lost)
            .reduce((sum, s) => sum + (s.cargoValue || 0), 0);
        const cargoLost = S.convoy.filter(s => s.escortRole === 'merchant' && s.lost)
            .reduce((sum, s) => sum + (s.cargoValue || 0), 0);
        window.dispatchEvent(new CustomEvent('navalEscortComplete', {
            detail: {
                result: result, // 'victory' | 'defeat'
                distanceTraveled: Math.round(S.worldX),
                targetDistance: Math.round(S.targetDistance),
                merchantsLost: merchantsLost,
                merchantsTotal: merchantsTotal,
                escortsLost: escortsLost,
                escortsTotal: escortsTotal,
                cargoDelivered: cargoDelivered,
                cargoLost: cargoLost
            }
        }));
    }

    // ============================================================================
    // 12. PUBLIC API
    // ----------------------------------------------------------------------------
    // window.NavalEscortMode.start(opts?) — begins a run. opts (all optional):
    //   targetDistance    number — override the randomized 20k-50k crossing length
    //   escortShipCount   number — default 2
    //   merchantShipCount number — default 3
    //   canvasId          string — default "gameCanvas" (falls back to the
    //                     first <canvas> on the page if not found)
    //
    // window.NavalEscortMode.stop() — tears down the run and cancels the loop.
    // window.NavalEscortMode.isActive() — bool.
    // window.NavalEscortMode.getState() — read-only snapshot for a HUD/menu.
    // window.NavalEscortMode.testTriggerEncounter() — debug hook: forces the
    //     nearest/next pirate group to spawn immediately and close to contact,
    //     for testing the combat handoff without waiting on the normal timer.
    //
    // Listen for window's 'navalEscortComplete' CustomEvent to learn the result
    // — see _fireComplete() above for its detail shape. This file never assumes
    // anything about how it was launched or what should happen next; that's
    // entirely the future menu file's call.
    // ============================================================================
    function start(opts) {
        opts = opts || {};

        if (typeof Troop === 'undefined' || typeof UnitRoster === 'undefined') {
            console.warn('[NavalEscortMode] troop_system.js does not appear to be loaded — cannot start.');
            return false;
        }
        if (typeof battleEnvironment === 'undefined' || typeof navalEnvironment === 'undefined') {
            console.warn('[NavalEscortMode] naval_battles.js does not appear to be loaded — cannot start.');
            return false;
        }

        stop(); // clean any previous run first

        S.active = true;
        S.state = 'SAILING';
        S.worldX = 0;
        S.baseY = 0;
        S.targetDistance = opts.targetDistance || _randInt(ESCORT_CFG.targetDistanceMin, ESCORT_CFG.targetDistanceMax);
        S.wind = { angle: 0, speed: 0.9, targetAngle: 0, targetSpeed: 0.9, nextShiftAt: performance.now() };
        S.fullSail = { active: false, until: 0, readyAt: 0 };
        S.convoy = [];
        S.pirateGroups = [];
        S.debris = [];
        S.seaLife = [];
        S.passingShips = [];
        S.milestonesFired = {};
        S.combat = null;
        S.onCompleteFired = false;
        dialogueState.bubbles = [];
        dialogueState.historyByCategory = {};

        const escortCount = opts.escortShipCount || ESCORT_CFG.escortShipCount;
        const merchantCount = opts.merchantShipCount || ESCORT_CFG.merchantShipCount;

        for (let i = 0; i < escortCount; i++) {
            const hull = _escortHullPreset();
            const ship = _makeShipObject(hull, "player", S.worldX, S.baseY, 0);
            ship.escortRole = 'escort';
            ship.crewStrength = 1;
            ship.lost = false;
            ship.formationOffsetX = 220 + i * 40; // screening ahead of the merchants
            ship.formationOffsetY = (i - (escortCount - 1) / 2) * (hull.height * 1.6);
            ship.displayName = "Escort Junk " + (i + 1);
            S.convoy.push(ship);
        }
        for (let i = 0; i < merchantCount; i++) {
            const hull = _merchantHullPreset();
            const ship = _makeShipObject(hull, "player", S.worldX, S.baseY, 0);
            ship.escortRole = 'merchant';
            ship.crewStrength = 1;
            ship.lost = false;
            ship.formationOffsetX = -80 - (i % 2) * 40;
            ship.formationOffsetY = (i - (merchantCount - 1) / 2) * (hull.height * 1.7);
            ship.displayName = "Merchant Junk " + (i + 1);
            ship.cargoValue = _randInt(ESCORT_CFG.cargoValueRange[0], ESCORT_CFG.cargoValueRange[1]);
            S.convoy.push(ship);
        }

        S.nextEncounterAtWorldX = _randInt(ESCORT_CFG.encounterGapMin, ESCORT_CFG.encounterGapMax);
        const now = performance.now();
        S.nextSeaLifeAt = now + _randInt(ESCORT_CFG.seaLifeGapMs[0], ESCORT_CFG.seaLifeGapMs[1]);
        S.nextNotableSeaLifeAt = now + _randInt(ESCORT_CFG.notableSeaLifeGapMs[0], ESCORT_CFG.notableSeaLifeGapMs[1]);
        S.nextPassingShipAt = now + _randInt(ESCORT_CFG.passingShipGapMs[0], ESCORT_CFG.passingShipGapMs[1]);

        S.canvas = document.getElementById(opts.canvasId || 'gameCanvas') || document.querySelector('canvas');
        S.ctx = S.canvas ? S.canvas.getContext('2d') : null;
        if (!S.canvas) console.warn('[NavalEscortMode] no canvas found — running headless (state/events still work, nothing will render).');

        _installInputHandlers();
        _syncCamera();
        _speak('departure', S.convoy.find(s => s.escortRole === 'escort'));

        S.rafId = requestAnimationFrame(_tick);
        return true;
    }

    function stop() {
        S.active = false;
        if (S.rafId) { cancelAnimationFrame(S.rafId); S.rafId = null; }
        if (S.state === 'COMBAT') {
            window.inNavalBattle = false;
            window._navalBoardingTimer = false;
        }
        S.state = 'IDLE';
    }

    function isActive() { return S.active; }

    function getState() {
        return {
            state: S.state,
            distanceTraveled: Math.round(S.worldX),
            targetDistance: Math.round(S.targetDistance),
            merchantsLeft: S.convoy.filter(s => s.escortRole === 'merchant' && !s.lost).length,
            merchantsTotal: S.convoy.filter(s => s.escortRole === 'merchant').length,
            escortsLeft: S.convoy.filter(s => s.escortRole === 'escort' && !s.lost).length,
            escortsTotal: S.convoy.filter(s => s.escortRole === 'escort').length,
            cargoAboard: S.convoy.filter(s => s.escortRole === 'merchant' && !s.lost).reduce((sum, s) => sum + (s.cargoValue || 0), 0),
            pirateGroupsActive: S.pirateGroups.length,
            fullSailActive: S.fullSail.active,
            fullSailReadyInMs: Math.max(0, S.fullSail.readyAt - performance.now())
        };
    }

    // Debug/testing only — forces a pirate encounter immediately instead of
    // waiting on the normal spawn timer, so the combat handoff can be verified
    // without sailing thousands of px first. Also exposed so a future menu's
    // own QA pass has the same hook available.
    function testTriggerEncounter() {
        if (S.state !== 'SAILING') { console.warn('[NavalEscortMode] can only force an encounter while SAILING.'); return; }
        if (!S.pirateGroups.length) {
            S.nextEncounterAtWorldX = S.worldX; // force a spawn on the next tick
            _maybeSpawnPirateGroup();
        }
        if (S.pirateGroups.length) {
            const g = S.pirateGroups[0];
            g.worldX = S.worldX + ESCORT_CFG.encounterTriggerGap - 5;
            g.spotted = true;
        }
    }

    window.NavalEscortMode = {
        start: start,
        stop: stop,
        isActive: isActive,
        getState: getState,
        testTriggerEncounter: testTriggerEncounter
    };

})();