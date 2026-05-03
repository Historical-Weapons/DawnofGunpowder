// ============================================================================
// SCENARIO TOOLS PANEL — scenario_tools_panel.js   (Step 2 of trigger refactor)
// ============================================================================
//
// Drop-in extension for the Scenario Editor that adds:
//   • Drop NPC tool      — click-to-place an NPC anywhere on the map
//   • Drop Player tool   — click-to-place / move the player spawn point
//   • Inspect tool       — click any NPC, city, or the player to open a panel
//   • Move tool          — drag NPCs / Player / cities to new positions
//   • Delete tool        — click NPCs/cities to remove (player is undeletable)
//   • Procedural AI Tendency window — per-faction frequency / category /
//     tendency / waypoint hints. Saved into scenario.proceduralAITendency.
//
// Persistence: NPCs go on `state.scenario.importantNpcs`. The player spawn is
// `state.scenario.playerSetup` (created if missing). Both are JSON-serializable
// and survive save/load. The custom-AI script box on each entity is saved
// as `customAI` (a string of JS source).
//
// LOAD ORDER in index.html (after scenario_editor.js, before menu.js):
//   <script src="story/scenario_editor.js"></script>
//   <script src="story/scenario_tools_panel.js"></script>   <!-- NEW -->
//
// ============================================================================

(function () {
"use strict";

if (window.ScenarioToolsPanel) {
    console.log("[ScenarioToolsPanel] already initialized — skipping.");
    return;
}

const VERSION = "1.0.0";

// ── Wait until ScenarioEditor exists, then patch ────────────────────────────
function _whenReady(cb) {
    if (window.ScenarioEditor && window.ScenarioEditor._state) { cb(); return; }
    let tries = 0;
    const id = setInterval(() => {
        if ((window.ScenarioEditor && window.ScenarioEditor._state) || ++tries > 200) {
            clearInterval(id);
            if (window.ScenarioEditor && window.ScenarioEditor._state) cb();
            else console.warn("[ScenarioToolsPanel] ScenarioEditor never appeared — aborting init.");
        }
    }, 100);
}

_whenReady(() => {
    const ED = window.ScenarioEditor;
    const state = ED._state;

    // ── Ensure the scenario doc has the new fields ──────────────────────────
    function _ensureFields(s) {
        if (!s) return;
        if (!Array.isArray(s.importantNpcs))     s.importantNpcs = [];
        if (!s.playerSetup || typeof s.playerSetup !== "object") s.playerSetup = {};
        if (!s.proceduralAITendency || typeof s.proceduralAITendency !== "object") {
            s.proceduralAITendency = {};
        }
    }

    // ── Helpers: world↔tile↔percent (the editor uses xPct/yPct) ─────────────
    // Cities use xPct/yPct; for consistency we also store NPC positions as
    // xPct/yPct on the editor side. At launch time, scenario_update.js or the
    // scenario module converts to absolute world pixels.
    function _findNpcNear(xPct, yPct, threshold) {
        const s = state.scenario; if (!s || !s.importantNpcs) return null;
        threshold = threshold || 0.025;   // ~2.5% of map
        let best = null, bestD = threshold * threshold;
        s.importantNpcs.forEach(n => {
            if (typeof n.xPct !== "number" || typeof n.yPct !== "number") return;
            const dx = n.xPct - xPct, dy = n.yPct - yPct;
            const d = dx*dx + dy*dy;
            if (d < bestD) { bestD = d; best = n; }
        });
        return best;
    }
    function _isPlayerNear(xPct, yPct, threshold) {
        const ps = state.scenario && state.scenario.playerSetup;
        if (!ps || typeof ps.xPct !== "number" || typeof ps.yPct !== "number") return false;
        threshold = threshold || 0.025;
        const dx = ps.xPct - xPct, dy = ps.yPct - yPct;
        return (dx*dx + dy*dy) < (threshold * threshold);
    }
    function _esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // ── 1) Inject the new tool buttons into the existing Tools panel ────────
    // We rebuild _buildToolsPanel by wrapping the original — additive only.
    const _origBuildToolsPanel = ED._state._buildToolsPanel ||
                                 (window._buildToolsPanel /* if hoisted */);
    // Since _buildToolsPanel is a private function in the editor's IIFE, we
    // can't override it directly. Instead, we observe the Tools window and
    // append our buttons whenever it appears.
    function _injectToolButtons() {
        const win = document.getElementById("se-win-tools");
        if (!win) return false;
        if (win.__toolsPanelExtended) return true;
        const body = win.querySelector(".se-window-body") || win;
        // Find the inner button container (whatever the editor used)
        // — the editor appends a flat <div> of buttons; we just append inside.
        const NEW_TOOLS = [
            { key: "drop_npc",     label: "👤 Drop NPC",         hint: "LMB to place an NPC at the cursor" },
            { key: "drop_player",  label: "🎮 Drop / Move Player", hint: "LMB to set the player spawn" },
            { key: "move_entity",  label: "✥ Move (NPC/Player/City)", hint: "LMB-drag any entity" },
            { key: "delete_entity", label: "✖ Delete (NPC or City)", hint: "Player cannot be deleted" }
        ];
        const sep = document.createElement("div");
        sep.style.cssText = "margin-top:8px;border-top:1px solid #4a8fa8;padding-top:6px;color:#f5d76e;font-size:11px;font-weight:bold;";
        sep.textContent = "─ Entities ─";
        body.appendChild(sep);

        NEW_TOOLS.forEach(t => {
            const b = document.createElement("button");
            b.dataset.tool = t.key;
            b.title = t.hint;
            b.textContent = t.label;
            b.style.cssText = `
                display:block;width:100%;text-align:left;
                padding:5px 8px;margin:2px 0;
                background:#1a3a5c;color:#cfd8dc;
                border:1px solid #4a8fa8;cursor:pointer;font-size:12px;
            `;
            b.onclick = () => {
                state.tool = t.key;
                // Refresh button highlight
                document.querySelectorAll("button[data-tool]").forEach(bb => {
                    const sel = bb.dataset.tool === state.tool;
                    bb.style.background = sel ? "#2a5a8c" : "#1a3a5c";
                    bb.style.color      = sel ? "#ffffff" : "#cfd8dc";
                });
                const st = document.getElementById("se-st-tool");
                if (st) st.textContent = t.key.toUpperCase();
            };
            body.appendChild(b);
        });

        // Procedural AI button (separate group)
        const sep2 = document.createElement("div");
        sep2.style.cssText = "margin-top:8px;border-top:1px solid #4a8fa8;padding-top:6px;color:#f5d76e;font-size:11px;font-weight:bold;";
        sep2.textContent = "─ Procedural ─";
        body.appendChild(sep2);
        const proc = document.createElement("button");
        proc.textContent = "🤖 AI Tendencies…";
        proc.title = "Per-faction procedural NPC frequency / category / behaviour";
        proc.style.cssText = `display:block;width:100%;text-align:left;padding:5px 8px;margin:2px 0;background:#3a5c1a;color:#dfffd0;border:1px solid #7aaa4a;cursor:pointer;font-size:12px;`;
        proc.onclick = () => _openProceduralAIWindow();
        body.appendChild(proc);

        // Player edit quick-access (Fix 3: player setup always editable)
        const sep3 = document.createElement("div");
        sep3.style.cssText = "margin-top:8px;border-top:1px solid #4a8fa8;padding-top:6px;color:#f5d76e;font-size:11px;font-weight:bold;";
        sep3.textContent = "─ Player ─";
        body.appendChild(sep3);
        const editPlayer = document.createElement("button");
        editPlayer.textContent = "✏ Edit Player Setup";
        editPlayer.title = "Open the Player spawn / troops / roster editor directly";
        editPlayer.style.cssText = `display:block;width:100%;text-align:left;padding:5px 8px;margin:2px 0;background:#2a3a1c;color:#c8f0a0;border:1px solid #6aaa3a;cursor:pointer;font-size:12px;`;
        editPlayer.onclick = () => _openInspectPlayer();
        body.appendChild(editPlayer);

        win.__toolsPanelExtended = true;
        return true;
    }
    // Poll until the Tools window exists, then inject.
    let injectTries = 0;
    const injectInterval = setInterval(() => {
        if (_injectToolButtons() || ++injectTries > 100) clearInterval(injectInterval);
    }, 200);

    // ── 2) Patch the canvas mousedown via wrapping the editor's existing
    //       handler. We add new tool branches (drop_npc / drop_player /
    //       move_entity / delete_entity) and let the editor's handler run
    //       first for the legacy tools.
    function _patchCanvasHandlers() {
        const c = state.canvas;
        if (!c) return false;
        if (c.__toolsPanelPatched) return true;

        const _screenToTile = (sx, sy) => {
            // Reuse the editor's transform: scale by cam.zoom, translate cam.x/y.
            const wx = (sx / state.cam.zoom) + state.cam.x;
            const wy = (sy / state.cam.zoom) + state.cam.y;
            const TILE_PX = 4;   // matches scenario_editor.js TILE_PX
            return { i: Math.floor(wx / TILE_PX), j: Math.floor(wy / TILE_PX) };
        };

        // Wrap mousedown
        const origDown = state._onMouseDown;
        state._onMouseDown = function (e) {
            e.preventDefault();
            const rect = c.getBoundingClientRect();
            const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
            const t = _screenToTile(sx, sy);
            const X = state.scenario.dimensions.tilesX;
            const Y = state.scenario.dimensions.tilesY;
            if (t.i < 0 || t.j < 0 || t.i >= X || t.j >= Y) {
                if (origDown) return origDown(e);
                return;
            }
            const xPct = t.i / X, yPct = t.j / Y;
            _ensureFields(state.scenario);

            // New tools first
            if (state.tool === "drop_npc") {
                if (e.button !== 0) return;
                _openDropNpcModal(xPct, yPct);
                return;
            }
            if (state.tool === "drop_player") {
                if (e.button !== 0) return;
                _openDropPlayerModal(xPct, yPct);
                return;
            }
            if (state.tool === "move_entity") {
                if (e.button !== 0) { if (origDown) return origDown(e); return; }
                state.mouse.down = true; state.mouse.button = 0;
                // Try NPC first, then player, then city
                const npc = _findNpcNear(xPct, yPct);
                if (npc) { state._dragNpc = npc; return; }
                if (_isPlayerNear(xPct, yPct)) {
                    state._dragPlayer = true; return;
                }
                // Fall through to city move
                state.tool = "move_city";
                if (origDown) origDown(e);
                state.tool = "move_entity";
                return;
            }
            if (state.tool === "delete_entity") {
                if (e.button !== 0) return;
                const npc = _findNpcNear(xPct, yPct);
                if (npc) {
                    if (confirm(`Delete NPC "${npc.name || npc.id}"?`)) {
                        const idx = state.scenario.importantNpcs.indexOf(npc);
                        if (idx >= 0) state.scenario.importantNpcs.splice(idx, 1);
                    }
                    return;
                }
                if (_isPlayerNear(xPct, yPct)) {
                    alert("The Player cannot be deleted (only moved or renamed).");
                    return;
                }
                // Fall through to city delete
                state.tool = "delete_city";
                if (origDown) origDown(e);
                state.tool = "delete_entity";
                return;
            }
            // Inspect: extend the legacy "select" tool to also pick NPCs/Player
            if (state.tool === "select") {
                const npc = _findNpcNear(xPct, yPct);
                if (npc) { _openInspectNpc(npc); return; }
                if (_isPlayerNear(xPct, yPct)) { _openInspectPlayer(); return; }
                if (origDown) return origDown(e);
                return;
            }

            // Legacy tools — delegate
            if (origDown) origDown(e);
        };
        c.removeEventListener("mousedown", origDown);
        c.addEventListener("mousedown", state._onMouseDown);

        // Wrap mousemove to support NPC/Player drag for move_entity
        const origMove = state._onMouseMove;
        state._onMouseMove = function (e) {
            const rect = c.getBoundingClientRect();
            const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
            state.mouse.x = sx; state.mouse.y = sy;
            const t = _screenToTile(sx, sy);
            const X = state.scenario.dimensions.tilesX;
            const Y = state.scenario.dimensions.tilesY;

            if (state.mouse.down && state.tool === "move_entity") {
                if (state._dragNpc) {
                    state._dragNpc.xPct = Math.max(0.01, Math.min(0.99, t.i / X));
                    state._dragNpc.yPct = Math.max(0.01, Math.min(0.99, t.j / Y));
                    return;
                }
                if (state._dragPlayer) {
                    _ensureFields(state.scenario);
                    state.scenario.playerSetup.xPct = Math.max(0.01, Math.min(0.99, t.i / X));
                    state.scenario.playerSetup.yPct = Math.max(0.01, Math.min(0.99, t.j / Y));
                    return;
                }
            }
            if (origMove) origMove(e);
        };
        c.removeEventListener("mousemove", origMove);
        c.addEventListener("mousemove", state._onMouseMove);

        // Wrap mouseup to clear drag state
        const origUp = state._onMouseUp;
        state._onMouseUp = function (e) {
            state._dragNpc = null;
            state._dragPlayer = false;
            if (origUp) origUp(e);
        };
        c.removeEventListener("mouseup", origUp);
        c.addEventListener("mouseup", state._onMouseUp);

        c.__toolsPanelPatched = true;
        return true;
    }
    let patchTries = 0;
    const patchInterval = setInterval(() => {
        if (_patchCanvasHandlers() || ++patchTries > 200) clearInterval(patchInterval);
    }, 200);

    // ── 3) Render hook — draw NPCs and Player marker on top of the editor canvas
    // We register as state._postDrawHook which _drawEditor() calls INSIDE its
    // ctx.save / ctx.scale(zoom) / ctx.translate(-cam.x, -cam.y) block.
    // Therefore we must NOT do our own save/scale/translate — the transform is
    // already active. Using a setInterval here would race with the RAF clear.
    function _drawOverlayInTransform(ctx, cam) {
        if (!state || !state.scenario) return;
        const X = state.scenario.dimensions.tilesX;
        const Y = state.scenario.dimensions.tilesY;
        if (!X || !Y) return;
        const TILE_PX = 4;

        // ── Draw NPCs ──────────────────────────────────────────────────────
        (state.scenario.importantNpcs || []).forEach(n => {
            if (typeof n.xPct !== "number") return;
            const px = n.xPct * X * TILE_PX;
            const py = n.yPct * Y * TILE_PX;
            const fcol = (state.scenario.factions[n.faction] && state.scenario.factions[n.faction].color) || "#888";
            ctx.fillStyle = fcol;
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 1 / cam.zoom;
            const r = 2.5 / Math.max(0.5, cam.zoom * 0.5);
            // Diamond shape — distinct from city hexagon
            ctx.beginPath();
            ctx.moveTo(px,     py - r);
            ctx.lineTo(px + r, py);
            ctx.lineTo(px,     py + r);
            ctx.lineTo(px - r, py);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            if (n.cannotDie) {
                ctx.strokeStyle = "#f5d76e";
                ctx.lineWidth = 0.5 / cam.zoom;
                ctx.beginPath();
                ctx.arc(px, py, r * 1.6, 0, Math.PI * 2);
                ctx.stroke();
            }
            if (cam.zoom > 0.7) {
                ctx.fillStyle   = "#fff";
                ctx.strokeStyle = "#000";
                ctx.lineWidth   = 1.5 / cam.zoom;
                ctx.font        = `${Math.max(7, 9 / cam.zoom)}px Tahoma, "Segoe UI Emoji", Arial`;
                ctx.textAlign   = "center";
                // 📜 prefix distinguishes Story NPCs from procedural ones in the editor
                const lbl = "📜 " + (n.name || n.id || "NPC");
                ctx.strokeText(lbl, px, py - r - 2);
                ctx.fillText(lbl,   px, py - r - 2);
            }
        });

        // ── Draw Player marker ────────────────────────────────────────────
        const ps = state.scenario.playerSetup;
        if (ps && typeof ps.xPct === "number") {
            const px = ps.xPct * X * TILE_PX;
            const py = ps.yPct * Y * TILE_PX;
            const r = 4 / Math.max(0.5, cam.zoom * 0.5);
            // 5-pointed star
            ctx.fillStyle   = "#f5d76e";
            ctx.strokeStyle = "#000";
            ctx.lineWidth   = 1.2 / cam.zoom;
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const a  = -Math.PI / 2 + i * (2 * Math.PI / 5);
                const xx = px + r * Math.cos(a);
                const yy = py + r * Math.sin(a);
                if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            if (cam.zoom > 0.5) {
                ctx.fillStyle   = "#fff";
                ctx.strokeStyle = "#000";
                ctx.lineWidth   = 2 / cam.zoom;
                ctx.font        = `bold ${Math.max(8, 11 / cam.zoom)}px Tahoma`;
                ctx.textAlign   = "center";
                ctx.strokeText("PLAYER", px, py - r - 3);
                ctx.fillText("PLAYER",   px, py - r - 3);
            }
        }
    }
    // Register as the post-draw hook so _drawEditor() calls us inside its
    // already-active camera transform. This is the ONLY correct way — a
    // setInterval races with the RAF clear and produces invisible/flickering markers.
    state._postDrawHook = _drawOverlayInTransform;

    // ── 4) Drop NPC modal ───────────────────────────────────────────────────
    function _openDropNpcModal(xPct, yPct) {
        _ensureFields(state.scenario);
        const facList = Object.keys(state.scenario.factions || {});
        const facOpts = facList.map(n => `<option value="${_esc(n)}">${_esc(n)}</option>`).join("");
        const id = "modal-drop-npc";
        const existing = document.getElementById(id);
        if (existing) existing.remove();

        const wrap = document.createElement("div");
        wrap.id = id;
        wrap.style.cssText = `
            position:fixed;inset:0;z-index:30000;
            background:rgba(0,0,0,0.7);
            display:flex;align-items:center;justify-content:center;
            font-family:Tahoma,Verdana,sans-serif;
        `;
        wrap.innerHTML = `
            <div style="background:#1a1f2a;border:2px solid #4a8fa8;border-radius:6px;
                        max-width:560px;width:92vw;max-height:90vh;overflow:auto;
                        color:#cfd8dc;padding:0;">
                <div style="padding:10px 14px;background:linear-gradient(to bottom,#3a5475,#1e2d40);
                            border-bottom:1px solid #4a6680;display:flex;justify-content:space-between;align-items:center;">
                    <strong style="color:#f5d76e;">Drop NPC at (${(xPct*100).toFixed(1)}%, ${(yPct*100).toFixed(1)}%)</strong>
                    <button id="dn-close" style="background:#4a1515;color:#ffcccc;border:none;padding:3px 9px;cursor:pointer;font-weight:bold;">✕</button>
                </div>
                <div style="padding:14px;display:grid;grid-template-columns:max-content 1fr;gap:8px 12px;align-items:center;font-size:13px;">
                    <label>ID</label>
                    <input id="dn-id" type="text" placeholder="auto" style="background:#0e1218;color:#f5d76e;border:1px solid #4a8fa8;padding:4px 6px;">
                    <label>Display name</label>
                    <input id="dn-name" type="text" placeholder="Patrol Captain" style="background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:4px 6px;">
                    <label>Faction</label>
                    <select id="dn-fac" style="background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:4px 6px;">${facOpts}</select>
                    <label>Role</label>
                    <select id="dn-role" style="background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:4px 6px;">
                        <option value="Patrol">Patrol</option>
                        <option value="Military" selected>Military</option>
                        <option value="Trader">Trader</option>
                        <option value="Civilian">Civilian</option>
                    </select>
                    <label>Troops</label>
                    <input id="dn-troops" type="number" value="20" min="0" max="9999" style="background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:4px 6px;width:80px;">
                    <label>HP / Atk / Def / Armor</label>
                    <div>
                        <input id="dn-hp"  type="number" value="100" style="width:55px;background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:3px;">
                        <input id="dn-atk" type="number" value="10"  style="width:55px;background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:3px;">
                        <input id="dn-def" type="number" value="8"   style="width:55px;background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:3px;">
                        <input id="dn-arm" type="number" value="4"   style="width:55px;background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:3px;">
                    </div>
                    <label>Roster (CSV)</label>
                    <input id="dn-roster" type="text" placeholder="Spearman,Spearman,Archer,…" style="background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:4px 6px;">
                    <label>Roster Mode</label>
                    <div>
                        <label style="font-size:11px;color:#cfd8dc;cursor:pointer;">
                            <input id="dn-hard" type="checkbox">
                            <strong>Hard Placement</strong>
                        </label>
                        <div id="dn-roster-hint" style="font-size:10px;color:#8aa;margin-top:3px;">
                            <em>Distribute (default):</em> CSV defines troop <u>types</u> — engine fills "Troops" count with an even split ±20% random.<br>
                            <em>Hard:</em> CSV is the <u>exact</u> roster; remaining slots up to "Troops" are padded with Militia.
                        </div>
                    </div>
                    <label>AI preset</label>
                    <select id="dn-ai" style="background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:4px 6px;">
                        <option value="idle">Idle (stand still)</option>
                        <option value="patrol" selected>Patrol (random nearby)</option>
                        <option value="repel">Repel (flee from enemies)</option>
                        <option value="pathfind">Pathfind to target</option>
                    </select>
                    <label>Cannot Die</label>
                    <label style="font-size:11px;color:#8aa;">
                        <input id="dn-cannotdie" type="checkbox"> Treat as invincible (HP floored at 1)
                    </label>
                    <label>Portrait URL</label>
                    <input id="dn-portrait" type="text" placeholder="art/story1/old_man.jpg" style="background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:4px 6px;">
                    <label style="vertical-align:top;">Custom AI script</label>
                    <textarea id="dn-script" rows="6" placeholder="// JS executed every NPC tick. Available: npc, player, NpcWaypoints, ScenarioTriggers&#10;// e.g. NpcWaypoints.queue(npc.id, [{x:1900,y:1500}])" style="background:#0a0d12;color:#a8d8ea;border:1px solid #4a8fa8;padding:5px;font-family:Consolas,monospace;font-size:11px;"></textarea>
                </div>
                <div style="padding:10px 14px;background:#141821;border-top:1px solid #4a6680;text-align:right;">
                    <button id="dn-cancel" style="padding:5px 12px;background:#3a3a3a;color:#cfd8dc;border:none;cursor:pointer;margin-right:6px;">Cancel</button>
                    <button id="dn-save" style="padding:5px 14px;background:#1a3a5c;color:#a8d8ea;border:1px solid #4a8fa8;cursor:pointer;font-weight:bold;">Drop NPC</button>
                </div>
            </div>
        `;
        document.body.appendChild(wrap);

        const close = () => wrap.remove();
        wrap.querySelector("#dn-close").onclick = close;
        wrap.querySelector("#dn-cancel").onclick = close;
        wrap.querySelector("#dn-save").onclick = () => {
            const id    = wrap.querySelector("#dn-id").value.trim() || ("npc_" + Date.now());
            const name  = wrap.querySelector("#dn-name").value.trim() || "NPC";
            const fac   = wrap.querySelector("#dn-fac").value;
            const role  = wrap.querySelector("#dn-role").value;
            const troops = +wrap.querySelector("#dn-troops").value || 0;
            const hp    = +wrap.querySelector("#dn-hp").value || 100;
            const atk   = +wrap.querySelector("#dn-atk").value || 10;
            const def   = +wrap.querySelector("#dn-def").value || 8;
            const armor = +wrap.querySelector("#dn-arm").value || 4;
            const rosterCsv = wrap.querySelector("#dn-roster").value.trim();
            const hardMode  = wrap.querySelector("#dn-hard").checked;
            const ai    = wrap.querySelector("#dn-ai").value;
            const cannotDie = wrap.querySelector("#dn-cannotdie").checked;
            const portrait = wrap.querySelector("#dn-portrait").value.trim();
            const script = wrap.querySelector("#dn-script").value;

            const npc = {
                id, name, faction: fac, role, troops,
                hp, attack: atk, defense: def, armor,
                xPct, yPct,
                roster: rosterCsv ? rosterCsv.split(",").map(s => s.trim()).filter(Boolean) : [],
                // rosterMode: "hard" → literal CSV + Militia padding up to troops count
                //             "distribute" → CSV defines type blueprint; engine fills troops count evenly ±20%
                rosterMode: hardMode ? "hard" : "distribute",
                aiPreset: ai,
                cannotDie: !!cannotDie,
                portraitUrl: portrait,
                customAI: script,   // executed by npc_waypoint_runtime.js (Step 3)
                autoSpawn: true     // auto-spawned at scenario launch (no trigger needed)
            };
            // Dedup by id
            state.scenario.importantNpcs = state.scenario.importantNpcs.filter(n => n.id !== id);
            state.scenario.importantNpcs.push(npc);
            close();
        };
    }

    // ── 5) Drop Player modal ────────────────────────────────────────────────
    function _openDropPlayerModal(xPct, yPct) {
        _ensureFields(state.scenario);
        const ps = state.scenario.playerSetup;
        const facList = Object.keys(state.scenario.factions || {});
        const facOpts = facList.map(n =>
            `<option value="${_esc(n)}" ${ps.faction === n ? "selected" : ""}>${_esc(n)}</option>`
        ).join("");
        const id = "modal-drop-player";
        const existing = document.getElementById(id);
        if (existing) existing.remove();
        const wrap = document.createElement("div");
        wrap.id = id;
        wrap.style.cssText = `
            position:fixed;inset:0;z-index:30000;background:rgba(0,0,0,0.7);
            display:flex;align-items:center;justify-content:center;
            font-family:Tahoma,Verdana,sans-serif;
        `;
        wrap.innerHTML = `
            <div style="background:#1a1f2a;border:2px solid #4a8fa8;border-radius:6px;
                        max-width:540px;width:90vw;max-height:90vh;overflow:auto;
                        color:#cfd8dc;padding:0;">
                <div style="padding:10px 14px;background:linear-gradient(to bottom,#3a5475,#1e2d40);
                            border-bottom:1px solid #4a6680;display:flex;justify-content:space-between;align-items:center;">
                    <strong style="color:#f5d76e;">Set Player Spawn — (${(xPct*100).toFixed(1)}%, ${(yPct*100).toFixed(1)}%)</strong>
                    <button id="dp-close" style="background:#4a1515;color:#ffcccc;border:none;padding:3px 9px;cursor:pointer;font-weight:bold;">✕</button>
                </div>
                <div style="padding:14px;display:grid;grid-template-columns:max-content 1fr;gap:8px 12px;align-items:center;font-size:13px;">
                    <label>Display name</label>
                    <input id="dp-name" type="text" value="${_esc(ps.name || "Player")}" style="background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:4px 6px;">
                    <label>Faction</label>
                    <select id="dp-fac" style="background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:4px 6px;">${facOpts}</select>
                    <label>Troops</label>
                    <input id="dp-troops" type="number" value="${ps.troops || 80}" style="background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:4px 6px;width:80px;">
                    <label>Gold / Food</label>
                    <div>
                        <input id="dp-gold" type="number" value="${ps.gold || 500}" style="width:80px;background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:4px 6px;">
                        <input id="dp-food" type="number" value="${ps.food || 200}" style="width:80px;background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:4px 6px;">
                    </div>
                    <label>HP / Max HP</label>
                    <div>
                        <input id="dp-hp"  type="number" value="${ps.hp || 200}"        style="width:80px;background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:4px 6px;">
                        <input id="dp-max" type="number" value="${ps.maxHealth || 200}" style="width:80px;background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:4px 6px;">
                    </div>
                    <label>Roster (CSV)</label>
                    <input id="dp-roster" type="text" value="${_esc((Array.isArray(ps.roster) ? ps.roster.map(r => r.type || r) : (ps.roster || [])).join(","))}" placeholder="Spearman,Archer,…" style="background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:4px 6px;">
                    <label>Roster Mode</label>
                    <div>
                        <label style="font-size:11px;color:#cfd8dc;cursor:pointer;">
                            <input id="dp-hard" type="checkbox" ${ps.rosterMode === "hard" ? "checked" : ""}>
                            <strong>Hard Placement</strong>
                        </label>
                        <div style="font-size:10px;color:#8aa;margin-top:3px;">
                            <em>Distribute (default):</em> CSV = troop type blueprint — fills "Troops" count evenly ±20%.<br>
                            <em>Hard:</em> CSV is exact roster; remaining slots padded with Militia up to "Troops" count.
                        </div>
                    </div>
                    <label>Cannot Die</label>
                    <label style="font-size:11px;color:#8aa;"><input id="dp-cannotdie" type="checkbox" ${ps.cannotDie ? "checked":""}> Treat as invincible (HP floored at 1, troops floored at 1)</label>
                    <label style="vertical-align:top;">Custom script</label>
                    <textarea id="dp-script" rows="7" placeholder="// JS executed periodically. Available: player, vars, ScenarioTriggers, NpcWaypoints, StoryPresentation&#10;// e.g. if (player.troops < 20) ScenarioTriggers.fireTrigger('reinforcements')" style="background:#0a0d12;color:#a8d8ea;border:1px solid #4a8fa8;padding:5px;font-family:Consolas,monospace;font-size:11px;">${_esc(ps.customScript || "")}</textarea>
                </div>
                <div style="padding:10px 14px;background:#141821;border-top:1px solid #4a6680;text-align:right;">
                    <button id="dp-cancel" style="padding:5px 12px;background:#3a3a3a;color:#cfd8dc;border:none;cursor:pointer;margin-right:6px;">Cancel</button>
                    <button id="dp-save" style="padding:5px 14px;background:#1a3a5c;color:#a8d8ea;border:1px solid #4a8fa8;cursor:pointer;font-weight:bold;">Set Player Spawn</button>
                </div>
            </div>
        `;
        document.body.appendChild(wrap);
        const close = () => wrap.remove();
        wrap.querySelector("#dp-close").onclick = close;
        wrap.querySelector("#dp-cancel").onclick = close;
        wrap.querySelector("#dp-save").onclick = () => {
            const ps = state.scenario.playerSetup;
            ps.name      = wrap.querySelector("#dp-name").value.trim() || "Player";
            ps.faction   = wrap.querySelector("#dp-fac").value;
            ps.xPct      = xPct;
            ps.yPct      = yPct;
            ps.troops    = +wrap.querySelector("#dp-troops").value || 0;
            ps.gold      = +wrap.querySelector("#dp-gold").value   || 0;
            ps.food      = +wrap.querySelector("#dp-food").value   || 0;
            ps.hp        = +wrap.querySelector("#dp-hp").value     || 0;
            ps.maxHealth = +wrap.querySelector("#dp-max").value    || 0;
            const rosterCsv = wrap.querySelector("#dp-roster").value.trim();
            ps.roster    = rosterCsv ? rosterCsv.split(",").map(s => s.trim()).filter(Boolean) : [];
            ps.rosterMode = wrap.querySelector("#dp-hard").checked ? "hard" : "distribute";
            ps.cannotDie = wrap.querySelector("#dp-cannotdie").checked;
            ps.customScript = wrap.querySelector("#dp-script").value;
            close();
        };
    }

    // ── 6) Inspect panels ───────────────────────────────────────────────────
    function _openInspectNpc(npc) {
        // Re-uses Drop NPC modal but pre-filled — easiest path.
        // We call _openDropNpcModal at the NPC's current position, then
        // overwrite the form fields with the NPC's stored values, and have
        // the Save button replace by id.
        const oldXPct = npc.xPct, oldYPct = npc.yPct;
        _openDropNpcModal(oldXPct, oldYPct);
        const wrap = document.getElementById("modal-drop-npc");
        if (!wrap) return;
        wrap.querySelector("#dn-id").value         = npc.id;
        wrap.querySelector("#dn-id").readOnly      = true;
        wrap.querySelector("#dn-name").value       = npc.name || "";
        wrap.querySelector("#dn-fac").value        = npc.faction || wrap.querySelector("#dn-fac").value;
        wrap.querySelector("#dn-role").value       = npc.role || "Military";
        wrap.querySelector("#dn-troops").value     = npc.troops || 0;
        wrap.querySelector("#dn-hp").value         = npc.hp || 100;
        wrap.querySelector("#dn-atk").value        = npc.attack || 10;
        wrap.querySelector("#dn-def").value        = npc.defense || 8;
        wrap.querySelector("#dn-arm").value        = npc.armor || 4;
        wrap.querySelector("#dn-roster").value     = (Array.isArray(npc.roster) ? npc.roster : (npc.roster || "").split(",")).map(r => r && r.type ? r.type : r).join(",");
        wrap.querySelector("#dn-hard").checked      = (npc.rosterMode === "hard");
        wrap.querySelector("#dn-ai").value         = npc.aiPreset || "patrol";
        wrap.querySelector("#dn-cannotdie").checked = !!npc.cannotDie;
        wrap.querySelector("#dn-portrait").value   = npc.portraitUrl || "";
        wrap.querySelector("#dn-script").value     = npc.customAI || "";
        wrap.querySelector("#dn-save").textContent = "Update NPC";
        // Also add a Delete button
        const footer = wrap.querySelector("#dn-cancel").parentElement;
        const del = document.createElement("button");
        del.textContent = "Delete";
        del.style.cssText = "padding:5px 12px;background:#3a1a1a;color:#ffaaaa;border:1px solid #7a3a3a;cursor:pointer;margin-right:6px;";
        del.onclick = () => {
            if (!confirm(`Delete NPC "${npc.name || npc.id}"?`)) return;
            const arr = state.scenario.importantNpcs || [];
            const idx = arr.indexOf(npc);
            if (idx >= 0) arr.splice(idx, 1);
            wrap.remove();
        };
        footer.insertBefore(del, footer.firstChild);
    }

    function _openInspectPlayer() {
        const ps = state.scenario.playerSetup || {};
        _openDropPlayerModal(ps.xPct || 0.5, ps.yPct || 0.5);
    }

    // ── 7) Procedural AI Tendency window ────────────────────────────────────
    function _openProceduralAIWindow() {
        _ensureFields(state.scenario);
        const id = "modal-proc-ai";
        const existing = document.getElementById(id);
        if (existing) existing.remove();
        const facList = Object.keys(state.scenario.factions || {})
            .filter(n => n !== "Bandits");
        const tend = state.scenario.proceduralAITendency || {};
        // Ensure a row exists for each faction
        facList.forEach(n => {
            if (!tend[n]) tend[n] = {
                frequency: 1.0,        // multiplier on default spawn rate
                category:  "mixed",    // patrol / military / trader / civilian / mixed
                tendency:  "default",  // default / aggressive / defensive / wanderer / repel
                avoidFactions: ""      // CSV of factions to flee from
            };
        });
        state.scenario.proceduralAITendency = tend;

        const wrap = document.createElement("div");
        wrap.id = id;
        wrap.style.cssText = `
            position:fixed;inset:0;z-index:30000;background:rgba(0,0,0,0.7);
            display:flex;align-items:center;justify-content:center;
            font-family:Tahoma,Verdana,sans-serif;
        `;
        const rows = facList.map(n => {
            const v = tend[n];
            return `
              <tr>
                <td style="padding:4px 8px;color:#f5d76e;font-weight:bold;">${_esc(n)}</td>
                <td style="padding:4px 8px;">
                    <input data-fac="${_esc(n)}" data-key="frequency" type="number" step="0.1" min="0" max="5" value="${v.frequency}" style="width:60px;background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:3px;">
                </td>
                <td style="padding:4px 8px;">
                    <select data-fac="${_esc(n)}" data-key="category" style="background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:3px;">
                        <option value="mixed"    ${v.category==="mixed"?"selected":""}>Mixed</option>
                        <option value="patrol"   ${v.category==="patrol"?"selected":""}>Patrol</option>
                        <option value="military" ${v.category==="military"?"selected":""}>Military</option>
                        <option value="trader"   ${v.category==="trader"?"selected":""}>Trader</option>
                        <option value="civilian" ${v.category==="civilian"?"selected":""}>Civilian</option>
                    </select>
                </td>
                <td style="padding:4px 8px;">
                    <select data-fac="${_esc(n)}" data-key="tendency" style="background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:3px;">
                        <option value="default"    ${v.tendency==="default"?"selected":""}>Default</option>
                        <option value="aggressive" ${v.tendency==="aggressive"?"selected":""}>Aggressive</option>
                        <option value="defensive"  ${v.tendency==="defensive"?"selected":""}>Defensive</option>
                        <option value="wanderer"   ${v.tendency==="wanderer"?"selected":""}>Wanderer</option>
                        <option value="repel"      ${v.tendency==="repel"?"selected":""}>Repel from enemies</option>
                    </select>
                </td>
                <td style="padding:4px 8px;">
                    <input data-fac="${_esc(n)}" data-key="avoidFactions" type="text" value="${_esc(v.avoidFactions || "")}" placeholder="Bandits,Mongols" style="width:140px;background:#0e1218;color:#cfd8dc;border:1px solid #4a8fa8;padding:3px;">
                </td>
              </tr>
            `;
        }).join("");
        wrap.innerHTML = `
            <div style="background:#1a1f2a;border:2px solid #4a8fa8;border-radius:6px;
                        max-width:760px;width:94vw;max-height:90vh;overflow:auto;
                        color:#cfd8dc;padding:0;">
                <div style="padding:10px 14px;background:linear-gradient(to bottom,#3a5475,#1e2d40);
                            border-bottom:1px solid #4a6680;display:flex;justify-content:space-between;align-items:center;">
                    <strong style="color:#f5d76e;">Procedural NPC AI Tendency</strong>
                    <button id="pa-close" style="background:#4a1515;color:#ffcccc;border:none;padding:3px 9px;cursor:pointer;font-weight:bold;">✕</button>
                </div>
                <div style="padding:14px;font-size:12px;color:#8aa;">
                    Configures the procedurally-spawned NPCs (those WITHOUT named portraits) per faction.
                    Read by <code>sandboxmode_npc_system.js</code> on each spawn.
                    Frequency = multiplier on default spawn rate. AvoidFactions = CSV list to flee from when "Repel" tendency is set.
                </div>
                <div style="padding:0 14px 12px 14px;overflow:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:12px;">
                        <thead>
                            <tr style="background:#253549;">
                                <th style="padding:5px 8px;text-align:left;color:#a8d8ea;">Faction</th>
                                <th style="padding:5px 8px;text-align:left;color:#a8d8ea;">Frequency</th>
                                <th style="padding:5px 8px;text-align:left;color:#a8d8ea;">Category</th>
                                <th style="padding:5px 8px;text-align:left;color:#a8d8ea;">Tendency</th>
                                <th style="padding:5px 8px;text-align:left;color:#a8d8ea;">Avoid Factions</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <div style="padding:10px 14px;background:#141821;border-top:1px solid #4a6680;text-align:right;">
                    <button id="pa-cancel" style="padding:5px 12px;background:#3a3a3a;color:#cfd8dc;border:none;cursor:pointer;margin-right:6px;">Close</button>
                    <button id="pa-save" style="padding:5px 14px;background:#1a3a5c;color:#a8d8ea;border:1px solid #4a8fa8;cursor:pointer;font-weight:bold;">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(wrap);
        const close = () => wrap.remove();
        wrap.querySelector("#pa-close").onclick = close;
        wrap.querySelector("#pa-cancel").onclick = close;
        wrap.querySelector("#pa-save").onclick = () => {
            wrap.querySelectorAll("[data-fac][data-key]").forEach(inp => {
                const f = inp.getAttribute("data-fac");
                const k = inp.getAttribute("data-key");
                if (!tend[f]) tend[f] = {};
                let v = inp.value;
                if (k === "frequency") v = parseFloat(v) || 1;
                tend[f][k] = v;
            });
            close();
        };
    }

    // ── 8) Story NPC list panel — "Edit → Story NPCs…" ──────────────────────
    // Shows all importantNpcs as a table with Add / Edit / Delete buttons.
    // "Edit" re-uses _openInspectNpc (which pre-fills the Drop NPC modal).
    function _openStoryNpcListPanel() {
        _ensureFields(state.scenario);
        const id = "modal-story-npc-list";
        const existing = document.getElementById(id);
        if (existing) existing.remove();

        function _buildRows() {
            const list = state.scenario.importantNpcs || [];
            if (!list.length) {
                return `<tr><td colspan="6" style="padding:10px;color:#8aa;text-align:center;">
                    No Story NPCs yet. Use 👤 Drop NPC or click Add below.
                </td></tr>`;
            }
            return list.map((n, idx) => `
              <tr data-idx="${idx}" style="border-bottom:1px solid #1e2d40;">
                <td style="padding:4px 8px;color:#f5d76e;font-weight:bold;">${_esc(n.id)}</td>
                <td style="padding:4px 8px;">${_esc(n.name || "—")}</td>
                <td style="padding:4px 8px;">${_esc(n.faction || "—")}</td>
                <td style="padding:4px 8px;">${_esc(n.role || "—")}</td>
                <td style="padding:4px 8px;">${n.troops || 0}</td>
                <td style="padding:4px 8px;white-space:nowrap;">
                  <button data-action="edit"   data-idx="${idx}" style="padding:2px 8px;background:#1a3a5c;color:#a8d8ea;border:1px solid #4a8fa8;cursor:pointer;margin-right:3px;">✏ Edit</button>
                  <button data-action="delete" data-idx="${idx}" style="padding:2px 8px;background:#3a1a1a;color:#ffaaaa;border:1px solid #7a3a3a;cursor:pointer;">✕ Del</button>
                </td>
              </tr>`).join("");
        }

        const wrap = document.createElement("div");
        wrap.id = id;
        wrap.style.cssText = `
            position:fixed;inset:0;z-index:30000;background:rgba(0,0,0,0.7);
            display:flex;align-items:center;justify-content:center;
            font-family:Tahoma,Verdana,sans-serif;
        `;
        wrap.innerHTML = `
          <div style="background:#1a1f2a;border:2px solid #4a8fa8;border-radius:6px;
                      max-width:780px;width:95vw;max-height:90vh;overflow:auto;color:#cfd8dc;padding:0;">
            <div style="padding:10px 14px;background:linear-gradient(to bottom,#3a5475,#1e2d40);
                        border-bottom:1px solid #4a6680;display:flex;justify-content:space-between;align-items:center;">
              <strong style="color:#f5d76e;">👤 Story NPCs (Important NPCs)</strong>
              <button id="snl-close" style="background:#4a1515;color:#ffcccc;border:none;padding:3px 9px;cursor:pointer;font-weight:bold;">✕</button>
            </div>
            <div style="padding:8px 14px;font-size:11px;color:#8aa;">
              These NPCs are spawned during gameplay via triggers (<code>spawn_important_npc</code>)
              or automatically at launch if they have <strong>Auto-spawn</strong> enabled (set by Drop NPC tool).
              Click ✏ Edit to inspect/change any NPC's stats, AI script, or position.
            </div>
            <div id="snl-table-wrap" style="padding:0 14px 8px;overflow:auto;">
              <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                  <tr style="background:#253549;">
                    <th style="padding:5px 8px;text-align:left;color:#a8d8ea;">ID</th>
                    <th style="padding:5px 8px;text-align:left;color:#a8d8ea;">Name</th>
                    <th style="padding:5px 8px;text-align:left;color:#a8d8ea;">Faction</th>
                    <th style="padding:5px 8px;text-align:left;color:#a8d8ea;">Role</th>
                    <th style="padding:5px 8px;text-align:left;color:#a8d8ea;">Troops</th>
                    <th style="padding:5px 8px;text-align:left;color:#a8d8ea;">Actions</th>
                  </tr>
                </thead>
                <tbody id="snl-tbody">${_buildRows()}</tbody>
              </table>
            </div>
            <div style="padding:10px 14px;background:#141821;border-top:1px solid #4a6680;display:flex;justify-content:space-between;align-items:center;">
              <button id="snl-add" style="padding:5px 14px;background:#1a3a5c;color:#a8d8ea;border:1px solid #4a8fa8;cursor:pointer;font-weight:bold;">+ Add NPC</button>
              <button id="snl-close2" style="padding:5px 12px;background:#3a3a3a;color:#cfd8dc;border:none;cursor:pointer;">Close</button>
            </div>
          </div>
        `;
        document.body.appendChild(wrap);

        const close = () => wrap.remove();
        wrap.querySelector("#snl-close").onclick  = close;
        wrap.querySelector("#snl-close2").onclick = close;

        // "Add NPC" button — opens Drop NPC modal centered (xPct 0.5, yPct 0.5)
        wrap.querySelector("#snl-add").onclick = () => {
            close();
            _openDropNpcModal(0.5, 0.5);
        };

        // Table row buttons — delegated
        wrap.querySelector("#snl-tbody").addEventListener("click", e => {
            const btn = e.target.closest("button[data-action]");
            if (!btn) return;
            const idx = parseInt(btn.getAttribute("data-idx"), 10);
            const npc = (state.scenario.importantNpcs || [])[idx];
            if (!npc) return;
            if (btn.getAttribute("data-action") === "edit") {
                close();
                _openInspectNpc(npc);
            } else if (btn.getAttribute("data-action") === "delete") {
                if (confirm(`Delete NPC "${npc.name || npc.id}"?`)) {
                    state.scenario.importantNpcs.splice(idx, 1);
                    wrap.querySelector("#snl-tbody").innerHTML = _buildRows();
                }
            }
        });
    }

    // ── Public API ──────────────────────────────────────────────────────────
    window.ScenarioToolsPanel = {
        VERSION,
        openDropNpc:    (xPct, yPct) => _openDropNpcModal(xPct || 0.5, yPct || 0.5),
        openDropPlayer: (xPct, yPct) => _openDropPlayerModal(xPct || 0.5, yPct || 0.5),
        openProceduralAI: _openProceduralAIWindow,
        // Called from Edit menu → "Story NPCs…" — opens a list panel of all
        // importantNpcs currently in the scenario, with Add / Edit / Delete buttons.
        openStoryNpcPanel: _openStoryNpcListPanel
    };
    console.log("[ScenarioToolsPanel] v" + VERSION + " ready.");
});

})();