// menu/unit-hover-tooltip.js
// ============================================================================
// THE ONE hover panel — merged from what used to be two separate systems:
//   1. This file's own original stat-row panel (kept as the visual base —
//      richer than the other system's 3-line version).
//   2. battlefield_commands.js's inline "mc3-unit-hover-tip" listener,
//      which duplicated the same idea with a different (and, per the
//      engine's own getBattleMousePos, less accurate) screen->world
//      mapping. That block has been DELETED from battlefield_commands.js —
//      this file is now the only unit-hover tooltip in the codebase.
//
// Reads only battleEnvironment.units / unit.stats, which every battle mode
// populates the same way (survival, custom, siege, sandbox), so this one
// file covers all of them instead of being wired into any single mode.
//
// VISIBILITY GATE (per direct request):
//   - Battlefield hover only ever shows up in an active battle — gated on
//     inBattleMode, which is true during survival-mode battles AND regular/
//     custom/siege/sandbox battles, and false on the overworld/NPC map (the
//     overworld never sets inBattleMode = true — confirmed against every
//     mode file), so "survival or battles, never the overworld" falls out
//     of that one flag automatically.
//   - Even inside a battle, hovering shows NOTHING unless the player is
//     actively holding Space OR has the new hover-toggle button (RTSControls
//     .js, next to the unit-card-toggle 🪪) turned on. Neither active =
//     no tooltip, full stop — there is no passive/minimal fallback state.
//     window.__hoverPanelActive is the single shared flag both inputs
//     write to; RTSControls.js's button toggles the same flag.
//
// WOUNDED STATUS: deliberately NOT handled in this file. Woundedness
// (healDaysLeft) is a survival-mode ROSTER concept, not a live-battlefield-
// unit concept — a wounded roster entry sits out of battle entirely, so
// there is never a wounded battlefield sprite to hover in the first place.
// Per direct request, that status is shown only in the survival roster/
// base UI itself — see the small dedicated hover handler added directly in
// survivalMode.js's roster box, which reuses this file's panel look but is
// a separate attach point since it hovers roster rows, not canvas sprites.
//
// Desktop only, on purpose: gated behind a (hover: hover) and (pointer:
// fine) media query check at install time, so it never even attaches
// listeners on a touch-primary device (spacebar/hover has no mobile
// equivalent — mobile only ever gets the tap-driven unit cards).
// ============================================================================
(function () {
    if (window.__unitHoverTooltipInstalled) return;
    window.__unitHoverTooltipInstalled = true;

    if (!window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
        return; // touch-primary device — skip entirely, per spec
    }

    // Shared activation flag — spacebar (this file) and the RTS hover-toggle
    // button (RTSControls.js) both write to this same flag, so either input
    // turns the panel on/off identically. Read fresh every mousemove rather
    // than cached, since RTSControls.js can flip it at any time.
    if (typeof window.__hoverPanelActive !== "boolean") window.__hoverPanelActive = false;

    const STAT_ROWS = [
        { key: "meleeAttack", label: "Melee Atk" },
        { key: "meleeDefense", label: "Melee Def" },
        { key: "armor", label: "Armor" },
        { key: "accuracy", label: "Accuracy", rangedOnly: true },
        { key: "missileBaseDamage", label: "Missile Dmg", rangedOnly: true },
        { key: "missileAPDamage", label: "AP Dmg", rangedOnly: true },
        { key: "bonusVsLarge", label: "Bonus vs Large" },
        { key: "speed", label: "Speed" },
        { key: "range", label: "Range" }
    ];

    function fmt(v) {
        if (v === undefined || v === null) return "—";
        if (typeof v === "number") return Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toString();
        return String(v);
    }

    // Screen->world mapping. Prefers getBattleMousePos (battlefield_commands
    // .js) when it's loaded — that's the SAME function driving real
    // click/selection/order logic, so hovering agrees with whatever the
    // engine considers "the unit under the cursor" instead of drifting from
    // it. Falls back to a local calc only if that global isn't defined yet
    // (load-order edge case), using the plain zoom/camera-offset form.
    function screenToWorld(e) {
        if (typeof getBattleMousePos === "function") {
            const w = getBattleMousePos(e); // only reads e.clientX/e.clientY
            const z = (typeof zoom !== "undefined" && zoom) ? zoom : 1;
            return { x: w.x, y: w.y, zoom: z };
        }
        const canvas = document.querySelector("canvas") || document.getElementById("gameCanvas");
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;
        const z = (typeof zoom !== "undefined" && zoom) ? zoom : 1;
        const cam = window.camera || { x: 0, y: 0 };
        return { x: canvasX / z + cam.x, y: canvasY / z + cam.y, zoom: z };
    }

    function findHoveredUnit(worldX, worldY, screenZoom) {
        if (typeof battleEnvironment === "undefined" || !battleEnvironment || !Array.isArray(battleEnvironment.units)) return null;
        const HIT_RADIUS_SCREEN_PX = 20;
        const hitRadiusWorld = HIT_RADIUS_SCREEN_PX / (screenZoom || 1);
        let best = null, bestDist = hitRadiusWorld;
        for (const u of battleEnvironment.units) {
            if (!u || u.hp <= 0 || u.isDummy) continue;
            const d = Math.hypot(u.x - worldX, u.y - worldY);
            if (d < bestDist) { bestDist = d; best = u; }
        }
        return best;
    }

    function buildTooltip() {
        const el = document.createElement("div");
        el.id = "unit-hover-tooltip";
        Object.assign(el.style, {
            position: "fixed",
            zIndex: "99980",
            display: "none",
            pointerEvents: "none",
            fontFamily: "Georgia, serif",
            fontSize: "12px",
            color: "#fff",
            background: "rgba(12,10,10,0.9)",
            border: "1px solid #7b1a1a",
            borderRadius: "4px",
            padding: "8px 10px",
            minWidth: "170px",
            maxWidth: "220px",
            boxShadow: "0 4px 14px rgba(0,0,0,0.5)"
        });
        document.body.appendChild(el);
        return el;
    }

    function renderTooltip(el, unit) {
        const stats = unit.stats || {};
        const level = (typeof stats.experienceLevel === "number") ? stats.experienceLevel
                    : (typeof unit.experienceLevel === "number") ? unit.experienceLevel
                    : (typeof unit.level === "number") ? unit.level : 1;
        const xp = (typeof stats.experience === "number") ? stats.experience
                 : (typeof unit.experience === "number") ? unit.experience : null;
        const sideColor = unit.side === "player" ? "#8bc34a" : "#e57373";
        const maxHp = stats.health || unit.maxHp || unit.hp;
        const hpPct = maxHp ? Math.max(0, Math.round((unit.hp / maxHp) * 100)) : null;
        const isRanged = !!stats.isRanged;
        const name = stats.name || unit.unitType || "Unit";

        const rows = STAT_ROWS
            .filter(r => !r.rangedOnly || isRanged)
            .filter(r => stats[r.key] !== undefined)
            .map(r => `
                <div style="display:flex; justify-content:space-between; padding:1px 0;">
                    <span style="color:#a1887f;">${r.label}</span>
                    <span style="color:#fff;">${fmt(stats[r.key])}</span>
                </div>`)
            .join("");

        el.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom:1px solid #4a3a2a; padding-bottom:4px; margin-bottom:4px;">
                <span style="color:#f5d76e; font-size:13px;">${name}</span>
                <span style="color:#f5d76e; font-size:11px;">Lv ${level}${xp !== null ? ` &nbsp;·&nbsp; XP ${xp}` : ""}</span>
            </div>
            <div style="color:${sideColor}; font-size:11px; margin-bottom:4px;">
                ${unit.side === "player" ? "Ally" : "Enemy"}${hpPct !== null ? ` &nbsp;·&nbsp; HP ${Math.max(0, Math.round(unit.hp))}/${Math.round(maxHp)} (${hpPct}%)` : ""}
            </div>
            ${rows}
        `;
    }

    function positionTooltip(el, clientX, clientY) {
        const OFFSET = 16;
        const vw = window.innerWidth, vh = window.innerHeight;
        const rect = el.getBoundingClientRect();
        let left = clientX + OFFSET;
        let top = clientY + OFFSET;
        if (left + rect.width > vw) left = clientX - rect.width - OFFSET;
        if (top + rect.height > vh) top = clientY - rect.height - OFFSET;
        el.style.left = Math.max(4, left) + "px";
        el.style.top = Math.max(4, top) + "px";
    }

    function install() {
        const canvas = document.querySelector("canvas") || document.getElementById("gameCanvas");
        if (!canvas) { setTimeout(install, 500); return; } // engine may not have booted yet
        if (canvas.__hoverTooltipInstalled) return;
        canvas.__hoverTooltipInstalled = true;

        const tooltip = buildTooltip();
        let hoveredId = null;

        function hide() {
            tooltip.style.display = "none";
            hoveredId = null;
        }

        // Spacebar is one of the two activation inputs (the other is the
        // RTS hover-toggle button, which writes the same flag directly).
        // Held-down semantics: on while held, off on release — no toggle
        // latch here, that's what the button is for.
        document.addEventListener("keydown", (e) => {
            if (e.code !== "Space" && e.key !== " ") return;
            if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return; // don't hijack typing
            window.__hoverPanelActive = true;
        });
        document.addEventListener("keyup", (e) => {
            if (e.code !== "Space" && e.key !== " ") return;
            // Only release the flag if the button isn't independently holding
            // it on — RTSControls.js tracks its own button state and calls
            // window.__setHoverButtonHeld(); the flag here is just OR'd.
            if (!window.__hoverButtonHeld) window.__hoverPanelActive = false;
        });
        // Losing window focus while Space is held (alt-tab, etc.) must not
        // leave the panel stuck on.
        window.addEventListener("blur", () => {
            if (!window.__hoverButtonHeld) window.__hoverPanelActive = false;
        });

        canvas.addEventListener("mousemove", (e) => {
            if (typeof inBattleMode !== "undefined" && !inBattleMode) { hide(); return; }
            if (!window.__hoverPanelActive) { hide(); return; }

            const w = screenToWorld(e);
            if (!w) return;
            const unit = findHoveredUnit(w.x, w.y, w.zoom);
            if (!unit) { hide(); return; }

            hoveredId = unit.id;
            renderTooltip(tooltip, unit); // always refresh — hp/xp change live while hovering
            tooltip.style.display = "block";
            positionTooltip(tooltip, e.clientX, e.clientY);
        });

        canvas.addEventListener("mouseleave", hide);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", install);
    } else {
        install();
    }
})();