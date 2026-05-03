// ============================================================================
// NPC WAYPOINT RUNTIME — npc_waypoint_runtime.js   (Step 3)
// ============================================================================
//
// Drives per-NPC custom AI scripts and sequential waypoint queues. Both story
// NPCs (spawned by spawn_important_npc) and procedural NPCs (spawned by the
// sandbox) participate. The Player is also pumped here for the editor's
// playerSetup.customScript field.
//
// LOAD ORDER in index.html (after sandbox NPC system + scenario triggers):
//   <script src="sandboxmode/sandboxmode_npc_system.js"></script>
//   <script src="story/scenario_triggers.js"></script>
//   <script src="story/hakata_bay_scenario.js"></script>
//   <script src="story/story_quest_patch.js"></script>
//   <script src="story/npc_waypoint_runtime.js"></script>   <!-- NEW -->
//
// Uses two simple data hooks on each NPC (added by the spawn pipeline in
// scenario_triggers.js — see Step 3 patch):
//   npc.customAI:         JS source string, executed every scriptIntervalMs
//   npc.aiPreset:         "idle" | "patrol" | "repel" | "pathfind"
//   npc.cannotDie:        clamp count to >= 1 each tick
//   npc.scriptIntervalMs: how often to re-run customAI (default 1000)
//   npc.waypointQueue:    [ { x, y, radius?, wait?, onArrive?, if?, label? }, ... ]
//   npc.currentWaypoint:  the active waypoint or null
//   npc.__aiOverride:     true while the runtime owns this NPC's targetX/Y
//                         (sandboxmode_npc_system.js skips its default brain
//                         when this flag is set)
//
// PUBLIC API (window.NpcWaypoints):
//   queue(id, waypoints)     — Append waypoints to the NPC's queue (or
//                              start a new one). Each waypoint is:
//                                { x, y, radius=64, wait=0, onArrive?, if?, label? }
//                              radius:   how close before "arrived" (px)
//                              wait:     ms to pause at the point before next
//                              onArrive: function(npc) called once on arrival
//                              if:       function(npc):bool — skip if false
//                              label:    string for debugging / display
//   replace(id, waypoints)   — Like queue but clears existing queue first.
//   setNow(id, x, y)         — Set immediate target (no queue).
//   clear(id)                — Cancel queue and clear override.
//   getQueue(id)             — Returns the current queue array (live ref).
//   onArrive(id, fn)         — One-shot callback when current waypoint hits.
//
// PUBLIC API (window.NpcAI — preset behaviors used when customAI is empty):
//   register(name, fn(npc, ctx))     — Register a custom preset.
//   apply(npc, name)                 — Apply preset by name (also called
//                                      automatically when npc.aiPreset is set).
//
// SCRIPT BINDINGS (available inside customAI / customScript strings):
//   npc            — the NPC object (or undefined for player scripts)
//   player         — window.player
//   NpcWaypoints   — this runtime's API
//   NpcAI          — preset registry
//   ScenarioTriggers — fire triggers, read/write vars
//   StoryPresentation — show dialogues, art, etc.
//   vars           — shortcut for ScenarioTriggers.vars (live ref)
//   time           — performance.now() at script invocation
//   dt             — ms since last invocation for this NPC
//
// EXAMPLE customAI scripts (paste into the editor's NPC script box):
//
//   // 1) Patrol north then south indefinitely
//   if (!npc.__patrolled) {
//       NpcWaypoints.queue(npc.id, [
//           { x: 1900, y: 1500, radius: 80, wait: 2000, label: "north"  },
//           { x: 1900, y: 1900, radius: 80, wait: 2000, label: "south"  }
//       ]);
//       npc.__patrolled = true;
//   }
//
//   // 2) "First reach Hakata City, then patrol nearby for 3 minutes,
//   //    then move south to Mizuki" — the example you asked about
//   if (!npc.__plan) {
//       NpcWaypoints.queue(npc.id, [
//           { x: 1980, y: 1380, radius: 60, label: "Hakata City" },
//           { x: 1900, y: 1380, radius: 60, wait: 60000 },        // 60s patrol N
//           { x: 2060, y: 1380, radius: 60, wait: 60000 },        // 60s patrol E
//           { x: 1980, y: 1380, radius: 60, wait: 60000 },        // 60s patrol C
//           { x: 3020, y: 2775, radius: 80, label: "Mizuki" }
//       ]);
//       npc.__plan = true;
//   }
//
//   // 3) "If reach within 200px of player, retreat north and despawn"
//   const dx = npc.x - player.x, dy = npc.y - player.y;
//   if (dx*dx + dy*dy < 40000) {        // 200px radius
//       NpcWaypoints.replace(npc.id, [
//           { x: npc.x, y: 200, radius: 50, label: "retreat north",
//             onArrive: (n) => { n.count = 0; }      // count=0 sweeps in next tick
//           }
//       ]);
//   }
// ============================================================================

(function () {
"use strict";

if (window.NpcWaypoints) {
    console.log("[NpcWaypoints] already initialized — skipping double-load.");
    return;
}

const TICK_MS         = 100;     // runtime tick rate (10 Hz — cheap)
const DEFAULT_RADIUS  = 64;
const DEFAULT_AI_INTERVAL_MS = 1000;

// ── Helpers ─────────────────────────────────────────────────────────────────
function _findNpc(id) {
    if (!id || !Array.isArray(window.globalNPCs)) return null;
    // Match either npc.id (exact) or storyId (the editor-set id, mapped to
    // the spawn-time id "<storyId>__story" by the spawn handler).
    return window.globalNPCs.find(n =>
        n && (n.id === id || n.storyId === id)
    ) || null;
}

function _ensureWaypointFields(npc) {
    if (!Array.isArray(npc.waypointQueue)) npc.waypointQueue = [];
    if (typeof npc.waypointStartedAt !== "number") npc.waypointStartedAt = 0;
}

// ── Script execution sandbox ────────────────────────────────────────────────
// Compile each script's source ONCE on first run, then call the cached
// function from then on. Caches per-entity by reference so changing the
// script string forces a recompile.
const _scriptCache = new WeakMap();   // entity → { src, fn }

function _compileScript(entity, src) {
    const cached = _scriptCache.get(entity);
    if (cached && cached.src === src) return cached.fn;
    let fn;
    try {
        // Bindings are passed as named arguments so scripts can reference
        // them by name without `this` games. Last arg is `__ctx` for any
        // future expansion without breaking existing scripts.
        fn = new Function(
            "npc", "player", "NpcWaypoints", "NpcAI",
            "ScenarioTriggers", "StoryPresentation", "vars",
            "time", "dt", "__ctx",
            src
        );
    } catch (e) {
        console.warn("[NpcWaypoints] Script compile error for",
            (entity && (entity.id || entity.name)) || "<unknown>", e);
        fn = null;
    }
    _scriptCache.set(entity, { src, fn });
    return fn;
}

function _runScript(entity, src, npc) {
    if (!src) return;
    const fn = _compileScript(entity, src);
    if (!fn) return;
    const now = performance.now();
    const dt  = now - (entity.__scriptLastRun || now);
    entity.__scriptLastRun = now;

    const tr = window.ScenarioTriggers;
    const vars = (tr && tr._state && tr._state.vars) ? tr._state.vars
              : (tr && tr.getVar)                   ? new Proxy({}, {
                      get: (_, k) => tr.getVar(k),
                      set: (_, k, v) => { tr.setVar(k, v); return true; }
                  })
              : {};

    try {
        fn(npc || null,
           window.player,
           window.NpcWaypoints,
           window.NpcAI,
           window.ScenarioTriggers,
           window.StoryPresentation,
           vars,
           now, dt, {});
    } catch (e) {
        // Swallow per-tick errors but log once per second per entity to
        // avoid spamming the console when a script throws every tick.
        const last = entity.__scriptLastError || 0;
        if (now - last > 1000) {
            entity.__scriptLastError = now;
            console.warn("[NpcWaypoints] Script runtime error for",
                (entity && (entity.id || entity.name)) || "player", e);
        }
    }
}

// ── Waypoint advancement (the FSM that drives targetX/Y) ────────────────────
function _stepWaypoints(npc, now) {
    _ensureWaypointFields(npc);

    // No queue → release override and bail
    if (npc.waypointQueue.length === 0 && !npc.currentWaypoint) {
        npc.__aiOverride = false;
        return;
    }

    // Promote head of queue to current
    if (!npc.currentWaypoint && npc.waypointQueue.length > 0) {
        const next = npc.waypointQueue.shift();
        // "if" gate — skip waypoint when condition is false
        if (typeof next.if === "function") {
            try {
                if (!next.if(npc)) return _stepWaypoints(npc, now);
            } catch (e) { /* fall through; treat as truthy */ }
        }
        npc.currentWaypoint    = next;
        npc.waypointStartedAt  = now;
        npc.__aiOverride       = true;
        npc.targetX            = next.x;
        npc.targetY            = next.y;
        npc.isMoving           = true;
        npc.waitTimer          = 0;
        npc.decisionTimer      = 999;     // suppress sandbox brain
    }

    const wp = npc.currentWaypoint;
    if (!wp) { npc.__aiOverride = false; return; }

    // Re-assert target (in case combat/collision moved it)
    npc.targetX = wp.x;
    npc.targetY = wp.y;
    npc.__aiOverride = true;
    npc.decisionTimer = Math.max(npc.decisionTimer || 0, 30);

    const dx = (npc.x - wp.x), dy = (npc.y - wp.y);
    const distSq = dx*dx + dy*dy;
    const r = wp.radius || DEFAULT_RADIUS;

    if (distSq <= r * r) {
        // Arrived. Fire onArrive once.
        if (!wp.__arrivedFiredAt) {
            wp.__arrivedFiredAt = now;
            if (typeof wp.onArrive === "function") {
                try { wp.onArrive(npc); }
                catch (e) { console.warn("[NpcWaypoints] onArrive error:", e); }
            }
        }
        // Wait period
        const waitMs = wp.wait || 0;
        if (now - wp.__arrivedFiredAt < waitMs) {
            // Hold position — clear isMoving so the engine animates idle
            npc.isMoving = false;
            return;
        }
        // Advance to next
        npc.currentWaypoint = null;
        if (npc.waypointQueue.length === 0) {
            npc.__aiOverride = false;     // release control to sandbox AI
            npc.isMoving = false;
        } else {
            _stepWaypoints(npc, now);
        }
    }
}

// ── AI presets registry ─────────────────────────────────────────────────────
const _presets = {};
function registerPreset(name, fn) { _presets[name] = fn; }
function applyPreset(npc, name) {
    const fn = _presets[name || ""];
    if (typeof fn !== "function") return false;
    try { fn(npc, { time: performance.now() }); }
    catch (e) { console.warn("[NpcAI] preset", name, "error:", e); }
    return true;
}

// idle: do nothing — explicit hold
registerPreset("idle", (npc) => {
    if (npc.currentWaypoint) return;       // let waypoints run
    npc.targetX = npc.x; npc.targetY = npc.y;
    npc.isMoving = false;
    npc.__aiOverride = true;
    npc.decisionTimer = Math.max(npc.decisionTimer || 0, 60);
});

// patrol: random points within radius of spawn
registerPreset("patrol", (npc) => {
    if (npc.currentWaypoint || npc.waypointQueue.length > 0) return;
    if (typeof npc.__spawnX !== "number") { npc.__spawnX = npc.x; npc.__spawnY = npc.y; }
    if (!npc.__patrolNext || performance.now() > npc.__patrolNext) {
        const r = 220;
        const ang = Math.random() * Math.PI * 2;
        const d   = Math.random() * r;
        const tx  = npc.__spawnX + Math.cos(ang) * d;
        const ty  = npc.__spawnY + Math.sin(ang) * d;
        window.NpcWaypoints.queue(npc.id, [
            { x: tx, y: ty, radius: 50, wait: 2500 + Math.random() * 2000, label: "patrol" }
        ]);
        npc.__patrolNext = performance.now() + 3000;
    }
});

// repel: when an enemy faction is within range, flee in opposite direction
registerPreset("repel", (npc) => {
    const list = window.globalNPCs || [];
    const avoidStr = npc.proceduralAvoid || "";
    const avoidSet = new Set(avoidStr.split(",").map(s => s.trim()).filter(Boolean));
    let nearestFoe = null, bestDistSq = 90000;  // 300 px
    for (let j = 0; j < list.length; j++) {
        const o = list[j];
        if (!o || o === npc || (o.count|0) <= 0) continue;
        const isFoe = avoidSet.has(o.faction) ||
                      (typeof window.isHostile === "function" &&
                       window.isHostile(npc.faction, o.faction));
        if (!isFoe) continue;
        const dx = o.x - npc.x, dy = o.y - npc.y;
        const dsq = dx*dx + dy*dy;
        if (dsq < bestDistSq) { bestDistSq = dsq; nearestFoe = o; }
    }
    if (!nearestFoe) return;        // nothing scary nearby
    const ang = Math.atan2(npc.y - nearestFoe.y, npc.x - nearestFoe.x);
    npc.targetX = npc.x + Math.cos(ang) * 240;
    npc.targetY = npc.y + Math.sin(ang) * 240;
    npc.isMoving = true;
    npc.__aiOverride = true;
    npc.decisionTimer = 60;
});

// pathfind: walk straight to npc.targetCity (or whatever target was set)
registerPreset("pathfind", (npc) => {
    if (npc.currentWaypoint) return;
    // Already has a target? trust it.
    if (typeof npc.targetX === "number" && typeof npc.targetY === "number") {
        npc.isMoving = true;
        npc.__aiOverride = true;
    }
});

// aggressive: beelines toward nearest enemy faction unit (procedural NPCs)
registerPreset("aggressive", (npc) => {
    const list = window.globalNPCs || [];
    let best = null, bestDistSq = Infinity;
    for (let j = 0; j < list.length; j++) {
        const o = list[j];
        if (!o || o === npc || (o.count|0) <= 0) continue;
        if (typeof window.isHostile !== "function" ||
            !window.isHostile(npc.faction, o.faction)) continue;
        const dx = o.x - npc.x, dy = o.y - npc.y;
        const dsq = dx*dx + dy*dy;
        if (dsq < bestDistSq) { bestDistSq = dsq; best = o; }
    }
    if (!best) return;
    npc.targetX = best.x;
    npc.targetY = best.y;
    npc.isMoving = true;
    npc.__aiOverride = true;
    npc.decisionTimer = 30;
});

// defensive: stay near spawn; only move to engage if foe is near
registerPreset("defensive", (npc) => {
    if (typeof npc.__spawnX !== "number") { npc.__spawnX = npc.x; npc.__spawnY = npc.y; }
    const dx = npc.x - npc.__spawnX, dy = npc.y - npc.__spawnY;
    if (dx*dx + dy*dy > 250*250) {
        npc.targetX = npc.__spawnX; npc.targetY = npc.__spawnY;
        npc.isMoving = true;
        npc.__aiOverride = true;
        npc.decisionTimer = 60;
    }
});

// wanderer: drift in random direction periodically (like patrol but no anchor)
registerPreset("wanderer", (npc) => {
    if (!npc.__wanderNext || performance.now() > npc.__wanderNext) {
        const ang = Math.random() * Math.PI * 2;
        npc.targetX = npc.x + Math.cos(ang) * 300;
        npc.targetY = npc.y + Math.sin(ang) * 300;
        npc.isMoving = true;
        npc.__aiOverride = true;
        npc.decisionTimer = 30;
        npc.__wanderNext = performance.now() + 4000 + Math.random() * 3000;
    }
});

// ── Player script pump ──────────────────────────────────────────────────────
function _pumpPlayer(now) {
    const p = window.player;
    if (!p) return;

    // cannotDie clamp
    if (p.cannotDie) {
        if ((p.troops|0) < 1) p.troops = 1;
        if ((p.hp|0)     < 1) p.hp = 1;
    }

    if (typeof p.customScript !== "string" || !p.customScript.trim()) return;
    const interval = p.scriptIntervalMs || DEFAULT_AI_INTERVAL_MS;
    if (now - (p.__scriptLastInvoke || 0) < interval) return;
    p.__scriptLastInvoke = now;
    _runScript(p, p.customScript, null /* no npc binding for player scripts */);
}

// ── NPC pump ────────────────────────────────────────────────────────────────
function _pumpNpc(npc, now) {
    if (!npc) return;
    _ensureWaypointFields(npc);

    // cannotDie clamp (also enforced inside sandboxmode_npc_system.js loop)
    if (npc.cannotDie && (npc.count|0) < 1) npc.count = 1;

    // 1) Drive waypoint queue first — it owns targetX/Y while active.
    _stepWaypoints(npc, now);

    // 2) Run customAI script periodically. Scripts can mutate npc and call
    //    NpcWaypoints.queue/replace/clear — they execute regardless of
    //    waypoint state so the script stays in control.
    if (typeof npc.customAI === "string" && npc.customAI.trim()) {
        const interval = npc.scriptIntervalMs || DEFAULT_AI_INTERVAL_MS;
        if (now - (npc.__scriptLastInvoke || 0) >= interval) {
            npc.__scriptLastInvoke = now;
            _runScript(npc, npc.customAI, npc);
        }
        return;
    }

    // 3) Apply preset if set (only when no waypoints active).
    if (!npc.currentWaypoint && npc.waypointQueue.length === 0) {
        if (npc.aiPreset) {
            applyPreset(npc, npc.aiPreset);
            return;
        }
        // Procedural tendency (set per-faction in scenario editor)
        if (npc.proceduralTendency && npc.proceduralTendency !== "default") {
            applyPreset(npc, npc.proceduralTendency);
            return;
        }
        // No override → release control to default sandbox AI
        npc.__aiOverride = false;
    }
}

// ── Main tick ───────────────────────────────────────────────────────────────
let _ticking = false;
function _tick() {
    if (_ticking) return;
    _ticking = true;
    try {
        const now = performance.now();
        _pumpPlayer(now);
        const list = window.globalNPCs || [];
        for (let i = 0; i < list.length; i++) {
            try { _pumpNpc(list[i], now); }
            catch (e) {
                if (now - (list[i].__pumpLastError || 0) > 1000) {
                    list[i].__pumpLastError = now;
                    console.warn("[NpcWaypoints] pump error:", e);
                }
            }
        }
    } finally { _ticking = false; }
}
const _tickInterval = setInterval(_tick, TICK_MS);

// ── Public API ──────────────────────────────────────────────────────────────
function _normalizeWaypoint(wp) {
    if (!wp || typeof wp !== "object") return null;
    if (typeof wp.x !== "number" || typeof wp.y !== "number") return null;
    return {
        x: wp.x, y: wp.y,
        radius:   (typeof wp.radius === "number") ? wp.radius : DEFAULT_RADIUS,
        wait:     (typeof wp.wait   === "number") ? wp.wait   : 0,
        onArrive: (typeof wp.onArrive === "function") ? wp.onArrive : null,
        if:       (typeof wp.if       === "function") ? wp.if       : null,
        label:    wp.label || ""
    };
}

window.NpcWaypoints = {
    VERSION: "1.0.0",

    queue(id, waypoints) {
        const npc = _findNpc(id);
        if (!npc) {
            console.warn("[NpcWaypoints] queue: NPC not found:", id);
            return false;
        }
        _ensureWaypointFields(npc);
        const arr = (Array.isArray(waypoints) ? waypoints : [waypoints])
                        .map(_normalizeWaypoint).filter(Boolean);
        if (arr.length === 0) return false;
        npc.waypointQueue.push(...arr);
        if (!npc.currentWaypoint) {
            // Kick the queue immediately
            _stepWaypoints(npc, performance.now());
        }
        return true;
    },

    replace(id, waypoints) {
        const npc = _findNpc(id);
        if (!npc) return false;
        _ensureWaypointFields(npc);
        npc.waypointQueue.length = 0;
        npc.currentWaypoint = null;
        return this.queue(id, waypoints);
    },

    setNow(id, x, y) {
        const npc = _findNpc(id);
        if (!npc) return false;
        npc.waypointQueue = [];
        npc.currentWaypoint = null;
        npc.targetX = x;
        npc.targetY = y;
        npc.isMoving = true;
        npc.__aiOverride = true;
        npc.decisionTimer = 60;
        return true;
    },

    clear(id) {
        const npc = _findNpc(id);
        if (!npc) return false;
        npc.waypointQueue = [];
        npc.currentWaypoint = null;
        npc.__aiOverride = false;
        return true;
    },

    getQueue(id) {
        const npc = _findNpc(id);
        if (!npc) return null;
        _ensureWaypointFields(npc);
        return npc.waypointQueue.slice();
    },

    onArrive(id, fn) {
        const npc = _findNpc(id);
        if (!npc || typeof fn !== "function") return false;
        if (!npc.currentWaypoint) return false;
        const prev = npc.currentWaypoint.onArrive;
        npc.currentWaypoint.onArrive = (n) => {
            try { if (prev) prev(n); } catch (e) {}
            try { fn(n); } catch (e) {}
        };
        return true;
    },

    // Diagnostic
    _findNpc,
    _findById: _findNpc,
    _stop()  { clearInterval(_tickInterval); }
};

window.NpcAI = {
    register: registerPreset,
    apply:    applyPreset,
    list()    { return Object.keys(_presets); }
};

console.log("[NpcWaypoints] runtime v" + window.NpcWaypoints.VERSION + " ready —",
            Object.keys(_presets).length, "AI presets registered:",
            Object.keys(_presets).join(", "));

})();