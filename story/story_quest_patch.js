// ============================================================================
// STORY QUEST PATCH — story_quest_patch.js
// ============================================================================
//
// Adds a yellow pulsing waypoint marker to the world map for STORY QUESTS
// (different from quest_system.js's procedural city-anchored quests).
//
// Story quests are world-space markers placed by scenario triggers via the
// `story_quest_set` action (see scenario_triggers.js).  They:
//   • Render as a pulsing yellow ring + downward arrow on the world map
//     at exact world coordinates (NOT a city anchor).
//   • Show a banner at the top of the screen with title + description.
//   • Detect player proximity (configurable radius) and fire a follow-up
//     trigger or set a scenario var when the player arrives.
//
// LOAD ORDER (in index.html):
//   <script src="story/scenario_triggers.js"></script>
//   <script src="story/hakata_bay_scenario.js"></script>
//   <script src="core/quest_system.js"></script>
//   <script src="story/story_quest_patch.js"></script>   ← here
//
// PUBLIC API:
//   StoryQuests.set({ id, title, description, x, y, radius,
//                     triggerOnArrive, varOnArrive })
//   StoryQuests.complete(id?)
//   StoryQuests.clear()
//   StoryQuests.current() → currently-active quest descriptor or null
//   StoryQuests.list()    → array of all quests (active + completed)
//
// HOW IT HOOKS THE RENDER LOOP:
//   sandboxmode_update.js's draw() calls drawPlayerOverlay(ctx, player, zoom)
//   if it exists. We define drawPlayerOverlay (or wrap an existing one) and
//   render the marker AFTER ctx.restore() — meaning we paint into screen
//   space, with the player at canvas-center. We re-derive the world→screen
//   transform from window.player, window.zoom, and the canvas dimensions.
//
// ============================================================================

(function () {
"use strict";

if (window.StoryQuests) {
    console.log("[StoryQuests] Already initialized — skipping double-load.");
    return;
}

// ── State ───────────────────────────────────────────────────────────────────
const state = {
    active:    null,      // { id, title, description, x, y, radius, triggerOnArrive, varOnArrive }
    completed: [],        // log of completed quest ids
    history:   [],        // every quest ever set (for debugging)
    bannerEl:  null,      // top-of-screen banner DOM node
    arriveLatched: false  // becomes true once player has entered the radius for current quest
};

// ── DOM banner ──────────────────────────────────────────────────────────────
function _ensureBanner() {
    if (state.bannerEl && document.body.contains(state.bannerEl)) return;
    const el = document.createElement("div");
    el.id = "story-quest-banner";
    el.style.cssText = [
        "position:fixed",
        "top:14px",
        "left:50%",
        "transform:translateX(-50%)",
        "min-width:280px",
        "max-width:78vw",
        "padding:10px 22px",
        "background:linear-gradient(to bottom, rgba(20,15,8,0.92), rgba(35,25,10,0.96))",
        "border:2px solid #d4b886",
        "border-radius:6px",
        "color:#f5d76e",
        "font-family:Georgia,'Times New Roman',serif",
        "text-align:center",
        "box-shadow:0 4px 16px rgba(0,0,0,0.65)",
        "z-index:9000",
        "pointer-events:none",
        "display:none",
        "opacity:0",
        "transition:opacity 400ms ease"
    ].join(";");
    el.innerHTML = `
        <div class="sq-title" style="font-size:14px;font-weight:bold;letter-spacing:0.6px;color:#f5d76e;text-shadow:0 2px 4px #000;"></div>
        <div class="sq-desc"  style="font-size:12px;color:#d4b886;margin-top:3px;line-height:1.3;text-shadow:0 1px 2px #000;"></div>
    `;
    document.body.appendChild(el);
    state.bannerEl = el;
}

function _showBanner(title, desc) {
    // FIX Bug#3: DOM banner is not canvas-scoped, so we must guard it
    // explicitly. Never show the banner while inside a city or a battle —
    // the world-map objective has no meaning in those coordinate spaces.
    const _isBattle = (typeof inBattleMode !== 'undefined' && !!inBattleMode);
    const _isCity   = (typeof inCityMode   !== 'undefined' && !!inCityMode);
    if (_isBattle || _isCity) return;
    _ensureBanner();
    state.bannerEl.querySelector(".sq-title").textContent = title || "";
    state.bannerEl.querySelector(".sq-desc").textContent  = desc  || "";
    state.bannerEl.style.display = "block";
    void state.bannerEl.offsetWidth;   // force reflow for transition
    state.bannerEl.style.opacity = "1";
}

function _hideBanner() {
    if (!state.bannerEl) return;
    state.bannerEl.style.opacity = "0";
    setTimeout(() => {
        if (state.bannerEl && state.bannerEl.style.opacity === "0") {
            state.bannerEl.style.display = "none";
        }
    }, 450);
}

// ── Public API ──────────────────────────────────────────────────────────────
function set(spec) {
    if (!spec || typeof spec.x !== "number" || typeof spec.y !== "number") {
        console.warn("[StoryQuests] set() requires {x, y}", spec);
        return null;
    }

    // Replace any existing active quest (the latest set wins)
    state.active = {
        id:              spec.id || ("sq_" + Date.now()),
        title:           spec.title || "Objective",
        description:     spec.description || "",
        x:               spec.x,
        y:               spec.y,
        radius:          spec.radius || 320,
        triggerOnArrive: spec.triggerOnArrive || "",
        varOnArrive:     spec.varOnArrive || "",
        noAutoComplete:  !!spec.noAutoComplete,  // if true, proximity arrival won't auto-complete — caller must call story_quest_complete explicitly
        startedAt:       Date.now()
    };
    state.arriveLatched = false;
    state.history.push({ event: "set", id: state.active.id, t: Date.now() });

    _showBanner(state.active.title, state.active.description);
    console.log("[StoryQuests] Set:", state.active.id,
                "→ (" + spec.x + "," + spec.y + ") r=" + state.active.radius);
    return state.active;
}

function complete(id) {
    if (!state.active) return;
    if (id && state.active.id !== id) {
        console.log("[StoryQuests] complete(" + id + ") skipped — current is " + state.active.id);
        return;
    }
    state.completed.push(state.active.id);
    state.history.push({ event: "complete", id: state.active.id, t: Date.now() });
    console.log("[StoryQuests] Completed:", state.active.id);
    state.active = null;
    state.arriveLatched = false;
    _hideBanner();
}

function clear() {
    if (state.active) {
        state.history.push({ event: "clear", id: state.active.id, t: Date.now() });
        state.active = null;
    }
    state.arriveLatched = false;
    _hideBanner();
}

function current() { return state.active; }
function list()    { return state.history.slice(); }

// ── Proximity detection (the "fires the next scene" mechanism) ──────────────
// Polls 4× per second. When the player enters the radius of the active quest,
// we fire the configured trigger AND/OR set the configured var. Latch flag
// prevents re-firing while the player lingers in the radius.
//
// IMPORTANT: This check ONLY runs in the overworld. City mode and battle mode
// both reuse player.x/y for local-space coordinates that have nothing to do
// with world-map positions — triggering here would cause false arrivals.
function _proximityTick() {
    if (!state.active) return;
    if (state.arriveLatched) return;
    // Overworld-only guard: skip entirely when inside a city or a battle.
    // FIX Bug#4: use typeof guards so the check works regardless of whether
    // these are window properties or scoped variables.
    if ((typeof inBattleMode !== 'undefined' && !!inBattleMode) ||
        (typeof inCityMode   !== 'undefined' && !!inCityMode)) return;
    const p = window.player;
    if (!p || typeof p.x !== "number" || typeof p.y !== "number") return;

    const dx = p.x - state.active.x;
    const dy = p.y - state.active.y;
    if (dx*dx + dy*dy > state.active.radius * state.active.radius) return;

    // Player has arrived
    state.arriveLatched = true;
    console.log("[StoryQuests] Player arrived at:", state.active.id);

    // Set var if requested ("name=value")
    if (state.active.varOnArrive) {
        const eq = state.active.varOnArrive.indexOf("=");
        if (eq > 0 && window.ScenarioTriggers &&
            typeof window.ScenarioTriggers.setVar === "function") {
            const name  = state.active.varOnArrive.slice(0, eq).trim();
            const value = state.active.varOnArrive.slice(eq + 1).trim();
            try { window.ScenarioTriggers.setVar(name, value); }
            catch (e) { console.warn("[StoryQuests] setVar failed:", e); }
        }
    }

    // Fire trigger by id if requested
    if (state.active.triggerOnArrive && window.ScenarioTriggers &&
        typeof window.ScenarioTriggers.fireTrigger === "function") {
        try { window.ScenarioTriggers.fireTrigger(state.active.triggerOnArrive); }
        catch (e) { console.warn("[StoryQuests] fireTrigger failed:", e); }
    }

    // Step 7: auto-chain — mark this quest complete then activate next quest
    // whose dependsOn === this quest's id. Lets you build linear story chains
    // purely from the editor without extra trigger actions.
    // noAutoComplete: skipped — the trigger's own story_quest_complete action
    // will call complete() once units/dialogue have been delivered.
    const arrivedId = state.active.id;
    if (state.active.noAutoComplete) {
        console.log("[StoryQuests] Arrived at", arrivedId, "— noAutoComplete set, waiting for explicit complete()");
        return;
    }
    setTimeout(() => {
        complete(arrivedId);
        const next = _catalogue.list.find(q =>
            q.dependsOn === arrivedId &&
            !state.completed.includes(q.id) &&
            q.autoActivate !== false
        );
        if (next) {
            console.log("[StoryQuests] Chaining to:", next.id);
            set(next);
        }
    }, 80);
}

setInterval(_proximityTick, 250);

// ── Step 7: Catalogue — loads from scenario.storyQuests on boot ─────────────
// The catalogue holds every quest definition from the Scenario Editor's
// Quests tab. At scenario launch we poll for __activeScenario and then build
// a by-id index from scenario.storyQuests[]. The main quest (isMain=true)
// auto-activates immediately; sub-quests wait for their dependsOn to complete.
const _catalogue = { byId: {}, list: [] };
let _catalogueLoaded = false;

function _loadCatalogue() {
    const s = window.__activeScenario;
    if (!s || !Array.isArray(s.storyQuests)) return false;
    _catalogue.byId  = {};
    _catalogue.list  = [];
    s.storyQuests.forEach(q => {
        if (!q || !q.id) return;
        const entry = {
            id:              q.id,
            title:           q.title       || "Quest",
            description:     q.description || "",
            x:               +q.x          || 0,
            y:               +q.y          || 0,
            radius:          +q.radius     || 320,
            triggerOnArrive: q.triggerOnArrive || "",
            varOnArrive:     q.varOnArrive     || "",
            isMain:          !!q.isMain,
            autoActivate:    q.autoActivate !== false,
            dependsOn:       q.dependsOn   || ""
        };
        _catalogue.byId[entry.id] = entry;
        _catalogue.list.push(entry);
    });
    _catalogueLoaded = true;
    console.log("[StoryQuests] Catalogue loaded:", _catalogue.list.length, "quest(s).");

    // Auto-activate the main quest (or first auto-activate quest with no deps).
    const main = _catalogue.list.find(q => q.isMain && q.autoActivate);
    if (main) { set(main); return true; }
    const first = _catalogue.list.find(q => q.autoActivate && !q.dependsOn);
    if (first) set(first);
    return true;
}

// Poll until __activeScenario appears (typically < 2 s after launch).
const _cataloguePoll = setInterval(() => {
    if (_catalogueLoaded) { clearInterval(_cataloguePoll); return; }
    if (window.__activeScenario && Array.isArray(window.__activeScenario.storyQuests)) {
        _loadCatalogue();
        clearInterval(_cataloguePoll);
    }
}, 400);

function activate(id) {
    const q = _catalogue.byId[id];
    if (!q) { console.warn("[StoryQuests] activate: id not in catalogue:", id); return false; }
    set(q); return true;
}
function getMainQuest()  { return _catalogue.list.find(q => q.isMain) || null; }
function getCatalogue()  { return _catalogue.list.slice(); }

// ── World→screen transform (re-derived from camera state each frame) ───────
//
// sandboxmode_update.js's draw() does:
//     ctx.translate(canvas.width/2, canvas.height/2);
//     ctx.scale(zoom, zoom);
//     ctx.translate(-player.x, -player.y);
//     ... draw world ...
//     ctx.restore();
//     drawPlayerOverlay(ctx, player, zoom);   ← we render here, in screen space
//
// So at the overlay call, ctx is back in identity transform (pixel space) and
// we have to manually project (worldX, worldY) → (screenX, screenY).
function _worldToScreen(wx, wy) {
    const canvas = document.querySelector("canvas");
    if (!canvas || !window.player) return null;
    const z = (typeof window.zoom === "number" && window.zoom > 0) ? window.zoom : 0.8;
    const sx = canvas.width  / 2 + (wx - window.player.x) * z;
    const sy = canvas.height / 2 + (wy - window.player.y) * z;
    return { x: sx, y: sy, z: z };
}

// ── Render: pulsing yellow ring + downward arrow + distance label ──────────
// Belt-and-suspenders: _render must never run outside the overworld.
// The primary guard is in sandboxmode_update.js (drawPlayerOverlay is only
// called when !inBattleMode && !inCityMode), but we check here too so that
// any other caller of drawPlayerOverlay can't accidentally draw waypoints
// on a city or battle canvas where player.x/y are in local-space.
function _render(ctx) {
    if (!state.active || !ctx) return;
    // Overworld-only: skip during city exploration and all battle modes.
    // FIX Bug#1: use identical typeof guards for both flags so the check is
    // immune to whether the variable is a window property or a scoped var.
    const _isBattle = (typeof inBattleMode !== 'undefined' && !!inBattleMode);
    const _isCity   = (typeof inCityMode   !== 'undefined' && !!inCityMode);
    if (_isBattle || _isCity) return;
    const proj = _worldToScreen(state.active.x, state.active.y);
    if (!proj) return;

    const t = (Date.now() % 1400) / 1400;          // 0…1, 1.4s loop
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);

    // Distance from player (in world units)
    const px = window.player.x, py = window.player.y;
    const dist = Math.round(Math.hypot(state.active.x - px, state.active.y - py));

    // Decide whether the marker is on-screen or off-screen
    const margin = 40;
    const onScreen = (proj.x > margin && proj.x < ctx.canvas.width - margin &&
                      proj.y > margin && proj.y < ctx.canvas.height - margin);

    ctx.save();

    if (onScreen) {
        // ── On-screen: pulsing ring + descending arrow + label ──────────────
        const baseRadius = Math.max(18, state.active.radius * proj.z * 0.28);
        const ringR = baseRadius + pulse * 14;

        // Outer translucent disc
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, ringR + 6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(245,215,110," + (0.10 + pulse * 0.10).toFixed(2) + ")";
        ctx.fill();

        // Pulsing ring
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = "#f5d76e";
        ctx.lineWidth = 3 + pulse * 1.5;
        ctx.shadowColor = "#f5d76e";
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Inner solid dot
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();

        // Descending arrow above the ring (pulsing y-offset)
        const arrowY = proj.y - ringR - 18 - pulse * 6;
        ctx.beginPath();
        ctx.moveTo(proj.x, arrowY + 18);
        ctx.lineTo(proj.x - 10, arrowY);
        ctx.lineTo(proj.x + 10, arrowY);
        ctx.closePath();
        ctx.fillStyle = "#f5d76e";
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 4;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Distance label below
        ctx.font = "bold 12px Georgia, serif";
        ctx.fillStyle = "#000";
        ctx.textAlign = "center";
        ctx.fillText(dist  , proj.x + 1, proj.y + ringR + 19);
        ctx.fillStyle = "#f5d76e";
        ctx.fillText(dist , proj.x, proj.y + ringR + 18);
    } else {
        // ── Off-screen: edge arrow pointing toward the waypoint ─────────────
        const cx = ctx.canvas.width / 2, cy = ctx.canvas.height / 2;
        const dx = proj.x - cx, dy = proj.y - cy;
        const ang = Math.atan2(dy, dx);

        // Clamp to screen edge with margin
        const mx = ctx.canvas.width  / 2 - 60;
        const my = ctx.canvas.height / 2 - 60;
        const k = Math.min(mx / Math.max(1, Math.abs(dx)),
                           my / Math.max(1, Math.abs(dy)));
        const ex = cx + dx * k;
        const ey = cy + dy * k;

        ctx.translate(ex, ey);
        ctx.rotate(ang);

        // Arrow body
        ctx.beginPath();
        ctx.moveTo(20, 0);
        ctx.lineTo(-12, -10);
        ctx.lineTo(-6, 0);
        ctx.lineTo(-12, 10);
        ctx.closePath();
        ctx.fillStyle = "#f5d76e";
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.rotate(-ang);
        ctx.font = "bold 12px Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#000";
        ctx.fillText(dist , 1, 25);
        ctx.fillStyle = "#f5d76e";
        ctx.fillText(dist , 0, 24);
    }

    ctx.restore();
}

// ── Hook into the draw loop via drawPlayerOverlay ──────────────────────────
//
// sandboxmode_update.js calls drawPlayerOverlay(ctx, player, zoom) AFTER the
// world is drawn. We wrap any existing implementation so quest_system.js or
// other patches that also use this hook keep working.
const _prevOverlay = (typeof window.drawPlayerOverlay === "function")
                     ? window.drawPlayerOverlay : null;

window.drawPlayerOverlay = function (ctx, player, zoom) {
    // Run any earlier overlay first (chain-friendly)
    if (_prevOverlay) {
        try { _prevOverlay(ctx, player, zoom); }
        catch (e) { console.warn("[StoryQuests] previous overlay error:", e); }
    }
    try { _render(ctx); }
    catch (e) { console.warn("[StoryQuests] render error:", e); }
};

// ── Cleanup on quit-to-menu ─────────────────────────────────────────────────
// If the engine ever exposes a "back to menu" event, clear active quests.
// For now we listen for the campaign flag flipping false.
// FIX Bug#3 (continued): also hide the DOM banner whenever the player enters
// a non-overworld context so it never floats over a city or battlefield.
setInterval(() => {
    if (!window.__campaignStory1Active && state.active) {
        clear();
        return;
    }
    // Hide the banner if the player is currently inside a city or battle.
    // It will reappear automatically the next time _showBanner() is called
    // while back on the overworld (e.g. on quest chain advance).
    if (state.bannerEl && state.bannerEl.style.display !== "none") {
        const _isBattle = (typeof inBattleMode !== 'undefined' && !!inBattleMode);
        const _isCity   = (typeof inCityMode   !== 'undefined' && !!inCityMode);
        if (_isBattle || _isCity) _hideBanner();
    }
}, 250);

// ── Public surface ──────────────────────────────────────────────────────────
window.StoryQuests = {
    // Core (existing)
    set,
    complete,
    clear,
    current,
    list,
    // Step 7 additions
    activate,
    getMainQuest,
    getCatalogue,
    loadCatalogue:   _loadCatalogue,
    VERSION: "1.2.0"
};

console.log("[StoryQuests] story_quest_patch.js v" + window.StoryQuests.VERSION + " loaded.");

})();