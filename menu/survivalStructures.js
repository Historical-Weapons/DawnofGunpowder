// ============================================================================
// SURVIVAL FIELD FORTIFICATIONS — palisade walls, trenches, and (future)
// siege equipment the player can build during the "day" (predeployment)
// phase between waves.
// ============================================================================
// DESIGN NOTES:
//   - Fully self-contained. Deliberately does NOT insert structures into
//     battleEnvironment.units (that array feeds a lot of unit-specific
//     physics/animation/morale/AI code across several other large files this
//     change didn't touch — disguising a wall as a "unit" there risks subtle
//     breakage in systems we haven't audited). Structures live in their own
//     window.survivalStructures array instead, rendered and ticked entirely
//     by this file.
//   - Costs LABOR, not gold — see getLabor/spendLabor/refundLabor below,
//     backed by window.SurvivalRun.getLabor() in survival_mode.js (a daily
//     pool sized off living troop count). Gold is recruit-shop-only now.
//   - Real collision, real cosmetics: applyStructureCollisions(units) and
//     blockProjectilesAtPalisades(projectiles) are exposed on
//     window.SurvivalStructures and called every real frame from
//     battlefield_logic.js's main loop (guarded to survival battles only —
//     see that file's "SURVIVAL:" comments). Palisades physically block
//     movement AND stop arrows; trenches only slow (no push-out, no HP bar,
//     no enemy "attacks" it — see STRUCTURE_TYPES[...].noStructureCombat —
//     it's a moat, not a fighting position, per spec). Player units braced
//     near a wall/tower/emplacement get a temporary elevation defense bonus
//     (STRUCTURE_TYPES[...].elevationBonus) that cleanly reverts on leaving.
//   - Cosmetic pass done for the two buildable types: palisade renders as
//     tapered timber stakes + binding rail, trench as a shaded ditch with
//     spoil-mounds on both edges (see drawPalisadeShape/drawTrenchShape).
//     Watchtower/Ballista Emplacement stay simple placeholder blocks since
//     they're still `available: false` pending their own equipment pass.
//   - Enemy-vs-structure "combat" (palisade/tower/emplacement only, NOT
//     trenches) is still a simplified direct-HP-damage tick, not routed
//     through the real melee/projectile pipeline. // TODO: wire into the
//     real attack pipeline once we're ready for a fuller visual/audio pass.
//   - Two structure types are buildable now (Palisade Wall, Trench). Two
//     more are modeled but intentionally locked (`available: false`) as
//     placeholders for future siege equipment — see STRUCTURE_TYPES.
// ============================================================================

(function () {

    // ------------------------------------------------------------------
    // STRUCTURE REGISTRY
    // ------------------------------------------------------------------
    const STRUCTURE_TYPES = {
        "Palisade Wall": {
            key: "palisade",
            shape: "rect",
            w: 70, h: 14,
            laborCost: 8,          // SURGERY: gold cost removed — structures are now built with
                                    // labor (see computeLaborBudget in survival_mode.js), scaled
                                    // roughly to the old gold costs' relative proportions.
            maxHp: 40, // SURGERY: way less HP per spec (was 260) — a palisade should crumble fast
            buildSeconds: 2.5, // SURGERY: 10x faster (was 25)
            color: "#6d4c2b",
            edgeColor: "#3e2b16",
            description: "Sharpened timber stakes. Blocks the line and arrows, moderate health.",
            unlockDay: 1,
            available: true,
            drawable: true,        // SURGERY: line-drawing is no longer Trench-exclusive — any
                                    // wall-type structure can be dragged out as a run, not just
                                    // placed one segment at a time.
            blocksMovement: true,   // solid — units and enemies physically cannot pass through
            elevationBonus: 0.20     // player units braced close behind it fight with +20% defense
        },
        "Trench": {
            key: "trench",
            shape: "rect",
            w: 90, h: 22,
            laborCost: 5,
            maxHp: 800,             // SURGERY: 20x Palisade's new HP per spec (was 900, now exact ratio)
            buildSeconds: 3.5, // SURGERY: 10x faster (was 35)
            color: "#3e3226",
            edgeColor: "#241c15",
            description: "A deep ditch — more moat than fighting position. Not garrisoned; it just slows anyone crossing it.",
            unlockDay: 1,
            available: true,
            drawable: true,        // supports click-and-drag line building (see beginLineDraw)
            blocksMovement: false, // NOT a wall — units can enter it
            slowsMovement: true,   // ...but it drags them down while they're inside
            slowFactor: 0.35,      // effective speed while inside (35% of normal)
            elevationBonus: 0,     // per spec: not designed to be fought FROM, no combat bonus
            noStructureCombat: true // enemies don't bother "attacking" a ditch — see tick()
        },
        // SURGERY: Watchtower/Ballista used to be permanently available:false
        // "coming soon" placeholders with no real path to ever becoming
        // buildable. They're genuinely buildable now, gated behind
        // unlockDay instead — using the exact same collision/elevation
        // systems every other structure already runs on (no new attack/
        // firing mechanic needed for that to be a real, useful upgrade: a
        // tall fighting position with a big defense bonus, and a fixed
        // heavy emplacement that's brutally tough to knock down).
        "Watchtower": {
            key: "watchtower",
            shape: "rect",
            w: 30, h: 30,
            laborCost: 22,
            maxHp: 260,
            buildSeconds: 8,
            color: "#5d4037",
            edgeColor: "#2e1f19",
            description: "A raised timber platform. Tallest vantage point on the field — the single best elevation bonus of any structure.",
            unlockDay: 5,
            available: true,
            blocksMovement: true,
            elevationBonus: 0.35    // tallest vantage point on the field
        },
        "Ballista Emplacement": {
            key: "ballista",
            shape: "rect",
            w: 26, h: 26,
            laborCost: 28,
            maxHp: 320,
            buildSeconds: 10,
            color: "#4e342e",
            edgeColor: "#241a16",
            description: "A fixed heavy timber-and-iron emplacement. Expensive and slow to raise, but the toughest defensive position available.",
            unlockDay: 10,
            available: true,
            blocksMovement: true,
            elevationBonus: 0.15
        },
        "Spike Barrier": {
            key: "spikes",
            shape: "rect",
            w: 50, h: 10,
            laborCost: 4,
            maxHp: 18,
            buildSeconds: 1.5,
            color: "#5a5044",
            edgeColor: "#2a2620",
            description: "Angled stakes planted to gore charging horses. Cheap and fragile, but murder on cavalry that hits it.",
            unlockDay: 1,
            available: true,
            drawable: true,
            blocksMovement: true,
            elevationBonus: 0,
            hazardDamage: 14 // chip damage dealt to any unit shoved back by this barrier
        },
        "Stone Barricade": {
            key: "stonewall",
            shape: "rect",
            w: 70, h: 16,
            laborCost: 16,
            maxHp: 140,
            buildSeconds: 6,
            color: "#78766f",
            edgeColor: "#3a3833",
            description: "Stacked quarry stone — slower to raise than a palisade, but far sturdier and a better defensive perch.",
            unlockDay: 3,
            available: true,
            drawable: true,
            blocksMovement: true,
            elevationBonus: 0.28
        }
    };

    // A structure is buildable once BOTH its unlockDay has passed AND its
    // own available flag allows it (available now only ever turns a type
    // off entirely — every currently-defined type is available:true; the
    // flag stays as a kill-switch for future use, not a lock mechanism —
    // unlockDay is the lock mechanism now).
    function isStructureUnlocked(def) {
        const day = window.__survivalDay || 1;
        return !!(def && def.available && day >= (def.unlockDay || 1));
    }

    // ------------------------------------------------------------------
    // STATE
    // ------------------------------------------------------------------
    window.survivalStructures = window.survivalStructures || [];
    let structureIdCounter = 1;

    let buildMode = {
        active: false,
        mode: "point",     // "point" (single ghost, rotate+confirm) | "line" (click-drag trench drawing)
        typeName: null,   // key into STRUCTURE_TYPES
        x: 0, y: 0,       // world coords, ghost position
        angle: 0,          // radians
        lineActive: false,     // currently mid-drag (line mode)
        lineLastPoint: null,   // {x,y} of the most recently placed segment, line mode
        lineSegmentIds: []     // structure ids committed during the CURRENT unfinished stroke (for cancel/refund)
    };

    let tickInterval = null;
    let uiPollInterval = null;
    let lastPreDeployState = null; // tracks the day->wave transition edge

    // ------------------------------------------------------------------
    // LABOR ACCESS — survival_mode.js exports window.SurvivalRun for this.
    // SURGERY: structures used to spend the run's gold; they now spend the
    // day's labor pool instead (gold is recruit-shop-only now). Same
    // accessor pattern, new resource.
    // ------------------------------------------------------------------
    function getLabor() {
        return (window.SurvivalRun && typeof window.SurvivalRun.getLabor === "function")
            ? window.SurvivalRun.getLabor() : 0;
    }
    function spendLabor(amount) {
        return (window.SurvivalRun && typeof window.SurvivalRun.spendLabor === "function")
            ? window.SurvivalRun.spendLabor(amount) : false;
    }
    function refundLabor(amount) {
        if (window.SurvivalRun && typeof window.SurvivalRun.refundLabor === "function") {
            window.SurvivalRun.refundLabor(amount);
        }
    }

    // ------------------------------------------------------------------
    // GATING — only during Survival's "day" (predeployment) phase
    // ------------------------------------------------------------------
    function isBuildAllowed() {
        return !!(window.__IS_SURVIVAL_BATTLE__ && window.__preDeploymentActive);
    }

    // REMOVED: getSelectedPlayerUnits/getBuilderUnit and the "freeze a unit
    // at the build site" concept they fed. That was the actual root cause
    // of units appearing to "teleport" onto newly built structures —
    // confirmPlacement used to literally set a unit's x/y to the
    // structure's coordinates. Construction is now instant and never
    // touches any unit's position, selection, or AI state — "invisible
    // handymen" build it, per direct request.

    // ------------------------------------------------------------------
    // COORDINATE CONVERSION
    // ------------------------------------------------------------------
    function screenToWorld(clientX, clientY) {
        const canvas = document.getElementById("gameCanvas");
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const canvasX = (clientX - rect.left) * scaleX;
        const canvasY = (clientY - rect.top) * scaleY;
        const z = (typeof zoom !== "undefined" && zoom) ? zoom : 1;
        const cam = window.camera || { x: 0, y: 0 };
        return { x: canvasX / z + cam.x, y: canvasY / z + cam.y };
    }

    // ========================================================================
    // FLOATING "BUILD" BUTTON + PICKER UI
    // ========================================================================
    function svsBtn(text, onClick, opts) {
        opts = opts || {};
        const btn = document.createElement("button");
        btn.innerText = text;
        btn.style.background = "linear-gradient(to bottom, #7b1a1a, #4a0a0a)";
        btn.style.color = "#f5d76e";
        btn.style.border = "1px solid #d4b886";
        btn.style.padding = opts.small ? "8px 14px" : "10px 20px";
        btn.style.fontFamily = "Georgia, serif";
        btn.style.fontSize = opts.small ? "12px" : "14px";
        btn.style.cursor = "pointer";
        btn.style.borderRadius = "3px";
        btn.onmouseenter = () => btn.style.background = "linear-gradient(to bottom, #b71c1c, #7b1a1a)";
        btn.onmouseleave = () => btn.style.background = "linear-gradient(to bottom, #7b1a1a, #4a0a0a)";
        btn.onclick = (e) => {
            e.stopPropagation();
            if (typeof AudioManager !== "undefined") AudioManager.playSound("ui_click");
            onClick();
        };
        return btn;
    }

    // SURGERY: one shared row container for all four launcher buttons
    // (Build/Repair/Cancel/Demolish) instead of separately absolute-
    // positioned buttons with hand-computed offsets — much easier to keep
    // aligned as buttons get added.
    function ensureLauncherRow() {
        let row = document.getElementById("svs-launcher-row");
        if (row) return row;
        row = document.createElement("div");
        row.id = "svs-launcher-row";
        row.style.position = "fixed";
        row.style.left = "50%";
        row.style.bottom = "90px";
        row.style.transform = "translateX(-50%)";
        row.style.zIndex = "5000";
        row.style.display = "none";
        row.style.gap = "8px";
        document.body.appendChild(row);
        return row;
    }

    function makeLauncherButton(id, text, bgGrad, borderColor, textColor, onclick) {
        let btn = document.getElementById(id);
        if (btn) return btn;
        btn = document.createElement("button");
        btn.id = id;
        btn.innerText = text;
        btn.style.background = bgGrad;
        btn.style.color = textColor;
        btn.style.border = `2px solid ${borderColor}`;
        btn.style.borderRadius = "22px";
        btn.style.padding = "10px 16px";
        btn.style.fontFamily = "Georgia, serif";
        btn.style.fontSize = "13px";
        btn.style.cursor = "pointer";
        btn.style.boxShadow = "0 3px 10px rgba(0,0,0,0.6)";
        btn.style.whiteSpace = "nowrap";
        btn.onclick = onclick;
        ensureLauncherRow().appendChild(btn);
        return btn;
    }

    function ensureBuildLauncherButton() {
        return makeLauncherButton(
            "svs-build-launcher", "🔨 Build",
            "linear-gradient(to bottom, #7b1a1a, #4a0a0a)", "#d4b886", "#f5d76e",
            (e) => {
                e.stopPropagation();
                if (typeof AudioManager !== "undefined") AudioManager.playSound("ui_click");
                openBuildPicker();
            }
        );
    }

    // SURGERY: repairs the most-damaged built structure using labor at a
    // discount vs. building fresh — the whole incentive to patch a wall up
    // instead of just building a brand new one over it.
    function ensureRepairLauncherButton() {
        return makeLauncherButton(
            "svs-repair-launcher", "🔧 Repair",
            "linear-gradient(to bottom, #2e5d34, #1a3a1f)", "#8bc34a", "#c8e6a0",
            (e) => { e.stopPropagation(); repairMostDamaged(); }
        );
    }

    // Cancels whatever structure is currently still under construction
    // (state==="building"), refunding its FULL labor cost — placement
    // spends labor all at once at confirm time, not incrementally, so a
    // full refund is the correct one (nothing partial was ever "used up").
    function ensureCancelConstructionButton() {
        return makeLauncherButton(
            "svs-cancel-construction-launcher", "🚫 Cancel Build",
            "linear-gradient(to bottom, #5d2e2e, #3a1a1a)", "#e57373", "#ffcdd2",
            (e) => { e.stopPropagation(); cancelMostRecentConstruction(); }
        );
    }

    // Removes an already-built structure. Cheap (1-3 labor) and has a
    // chance to salvage some gold back, per spec.
    function ensureDemolishLauncherButton() {
        return makeLauncherButton(
            "svs-demolish-launcher", "💥 Demolish",
            "linear-gradient(to bottom, #4a4a4a, #2a2a2a)", "#9e9e9e", "#e0e0e0",
            (e) => { e.stopPropagation(); demolishNearest(); }
        );
    }

    const REPAIR_LABOR_DISCOUNT = 0.5; // half the per-HP labor cost of building fresh

    function repairMostDamaged() {
        const candidates = window.survivalStructures.filter(s => s.state === "built" && s.hp > 0 && s.hp < s.maxHp);
        if (candidates.length === 0) {
            // FIX: was showSvsHint, which writes into an element that's
            // display:none outside active placement mode — i.e. always,
            // when clicking this button. The message was firing and
            // invisible. showSvsToast is a real standalone notification.
            showSvsToast("Nothing needs repair right now.", "info");
            return;
        }
        // Most-damaged (lowest %) first — that's where labor does the most good.
        candidates.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
        const target = candidates[0];
        const def = STRUCTURE_TYPES[target.type];
        if (!def) return;

        const costPerHp = (def.laborCost / def.maxHp) * REPAIR_LABOR_DISCOUNT;
        const missingHp = target.maxHp - target.hp;
        const affordableHp = Math.floor(getLabor() / costPerHp);
        const hpToRepair = Math.min(missingHp, affordableHp);

        if (hpToRepair <= 0) {
            if (typeof AudioManager !== "undefined") AudioManager.playSound("error");
            showSvsToast(`Not enough labor to repair ${target.type} (need at least ${Math.ceil(costPerHp)}, have ${getLabor()}).`, "error");
            return;
        }

        const laborCost = Math.max(1, Math.ceil(hpToRepair * costPerHp));
        if (!spendLabor(laborCost)) return;
        target.hp = Math.min(target.maxHp, target.hp + hpToRepair);
        if (typeof AudioManager !== "undefined") AudioManager.playSound("ui_click");
        if (typeof updateSurvivalResourceHud === "function") updateSurvivalResourceHud();
        showSvsToast(`Repaired ${target.type}: +${hpToRepair} HP for ${laborCost} labor (${Math.round((1 - REPAIR_LABOR_DISCOUNT) * 100)}% cheaper than rebuilding).`, "success");
    }

    function cancelMostRecentConstruction() {
        const candidates = window.survivalStructures.filter(s => s.state === "building");
        if (candidates.length === 0) {
            showSvsToast("Nothing is currently under construction.", "info");
            return;
        }
        candidates.sort((a, b) => b.buildStartedAt - a.buildStartedAt); // most recently started first
        const target = candidates[0];
        const def = STRUCTURE_TYPES[target.type];
        const idx = window.survivalStructures.indexOf(target);
        if (idx !== -1) window.survivalStructures.splice(idx, 1);
        const refund = def ? def.laborCost : 0;
        if (refund) refundLabor(refund);
        if (typeof AudioManager !== "undefined") AudioManager.playSound("ui_click");
        if (typeof updateSurvivalResourceHud === "function") updateSurvivalResourceHud();
        showSvsToast(`Cancelled ${target.type} — ${refund} labor refunded.`, "success");
    }

    function demolishNearest() {
        const candidates = window.survivalStructures.filter(s => s.state === "built");
        if (candidates.length === 0) {
            showSvsToast("No finished structures to demolish.", "info");
            return;
        }
        const px = (typeof player !== "undefined" && player) ? player.x : 0;
        const py = (typeof player !== "undefined" && player) ? player.y : 0;
        candidates.sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py));
        const target = candidates[0];
        const def = STRUCTURE_TYPES[target.type];
        if (!def) return;

        const demolishCost = Math.min(3, Math.max(1, Math.round(def.laborCost * 0.1)));
        if (getLabor() < demolishCost) {
            showSvsToast(`Not enough labor to demolish ${target.type} (needs ${demolishCost}, have ${getLabor()}).`, "error");
            return;
        }
        if (!spendLabor(demolishCost)) return;

        const idx = window.survivalStructures.indexOf(target);
        if (idx !== -1) window.survivalStructures.splice(idx, 1);

        // Small chance of salvaging some gold from the materials.
        const DEMOLISH_GOLD_CHANCE = 0.3;
        const salvageAmount = Math.max(1, Math.round(def.laborCost * 0.4));
        let salvageMsg = "";
        if (Math.random() < DEMOLISH_GOLD_CHANCE && window.SurvivalRun && typeof window.SurvivalRun.refundGold === "function") {
            window.SurvivalRun.refundGold(salvageAmount);
            salvageMsg = ` Salvaged ${salvageAmount} gold.`;
        }
        if (typeof AudioManager !== "undefined") AudioManager.playSound("ui_click");
        if (typeof updateSurvivalResourceHud === "function") updateSurvivalResourceHud();
        showSvsToast(`Demolished ${target.type} for ${demolishCost} labor.${salvageMsg}`, "success");
    }

    // Polls selection + day/night state to show/hide the floating Build button.
    // (A poll rather than a hook into unit-selection code, which lives in a
    // control file this change doesn't touch — see file header.)
    function startUiPoll() {
        if (uiPollInterval) clearInterval(uiPollInterval);
        uiPollInterval = setInterval(() => {
            // Defensive re-assert: other files (perf/optimization passes) can
            // reassign window.drawBattleUnits after boot, which would silently
            // drop this wrap. installRenderHook() is a cheap no-op once
            // already wrapped, so re-running it here just guarantees the
            // ghost/structure render hook heals itself within one tick if
            // that ever happens.
            installRenderHook();

            ensureBuildLauncherButton();
            ensureRepairLauncherButton();
            ensureCancelConstructionButton();
            ensureDemolishLauncherButton();
            const row = ensureLauncherRow();
            // Building/repairing/etc. is only ever offered during
            // predeployment — not once a wave is actually live. The row
            // itself owns visibility now rather than each button separately.
            const allowed = isBuildAllowed() && !buildMode.active;
            row.style.display = allowed ? "flex" : "none";
            if (!isBuildAllowed()) {
                const picker = document.getElementById("svs-build-picker");
                if (picker) picker.remove();
            }
        }, 400);
    }

    function openBuildPicker() {
        const existing = document.getElementById("svs-build-picker");
        if (existing) existing.remove();

        const panel = document.createElement("div");
        panel.id = "svs-build-picker";
        panel.style.position = "fixed";
        panel.style.left = "50%";
        panel.style.bottom = "150px";
        panel.style.transform = "translateX(-50%)";
        panel.style.zIndex = "5001";
        panel.style.display = "flex";
        panel.style.flexDirection = "column";
        panel.style.gap = "10px";
        panel.style.padding = "14px";
        panel.style.background = "rgba(20,20,20,0.92)";
        panel.style.border = "1px solid #d4b886";
        panel.style.borderRadius = "6px";
        panel.style.fontFamily = "Georgia, serif";
        panel.style.maxWidth = "92vw";

        // SURGERY: labor remaining, front and center — previously only
        // shown per-card as a cost, with nothing telling the player their
        // actual remaining budget without checking the top HUD.
        const laborHeader = document.createElement("div");
        laborHeader.id = "svs-build-labor-header";
        laborHeader.style.textAlign = "center";
        laborHeader.style.color = "#f5d76e";
        laborHeader.style.fontSize = "13px";
        laborHeader.style.letterSpacing = "1px";
        laborHeader.innerText = `🪏 Labor Remaining: ${getLabor()}`;
        panel.appendChild(laborHeader);

        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.gap = "10px";
        row.style.overflowX = "auto";
        panel.appendChild(row);

        Object.keys(STRUCTURE_TYPES).forEach(typeName => {
            const def = STRUCTURE_TYPES[typeName];
            const unlocked = isStructureUnlocked(def);
            const day = window.__survivalDay || 1;
            const canAffordThis = getLabor() >= def.laborCost;

            const card = document.createElement("div");
            card.style.width = "110px";
            card.style.flex = "0 0 auto";
            card.style.textAlign = "center";
            card.style.opacity = unlocked ? "1" : "0.45";
            card.style.cursor = unlocked ? "pointer" : "not-allowed";

            // SURGERY: real mini-preview of the structure's actual shape
            // (same draw functions used on the battlefield itself) instead
            // of a flat color swatch that told you nothing about its form.
            const previewCanvas = document.createElement("canvas");
            previewCanvas.width = 110;
            previewCanvas.height = 44;
            previewCanvas.style.width = "100%";
            previewCanvas.style.height = "44px";
            previewCanvas.style.background = "#1a1512";
            previewCanvas.style.border = `2px solid ${def.edgeColor}`;
            previewCanvas.style.borderRadius = "3px";
            drawStructurePreview(previewCanvas, def);
            card.appendChild(previewCanvas);

            const label = document.createElement("div");
            label.innerText = typeName;
            label.style.color = "#f5d76e";
            label.style.fontSize = "12px";
            label.style.marginTop = "6px";
            card.appendChild(label);

            // SURGERY: every card ALWAYS shows a clear state — cost when
            // buildable, exact unlock day when locked. Never silent.
            const sub = document.createElement("div");
            sub.innerText = unlocked ? `🪏${def.laborCost} · ${def.buildSeconds}s` : `🔒 Unlocks Day ${def.unlockDay}`;
            sub.style.color = unlocked ? (canAffordThis ? "#a1887f" : "#e57373") : "#8d6e63";
            sub.style.fontSize = "10px";
            card.appendChild(sub);

            // Description tooltip via native title attribute — the "what
            // does this do" requirement, always present regardless of state.
            card.title = def.description;

            if (unlocked) {
                card.onclick = (e) => {
                    e.stopPropagation();
                    if (!canAffordThis) {
                        showSvsToast(`Not enough labor: ${typeName} needs ${def.laborCost}, you have ${getLabor()}.`, "error");
                        return;
                    }
                    beginPlacement(typeName);
                    panel.remove();
                };
                if (def.drawable) {
                    const drawBtn = document.createElement("button");
                    drawBtn.innerText = "✏️ Draw";
                    drawBtn.style.marginTop = "6px";
                    drawBtn.style.width = "100%";
                    drawBtn.style.background = "rgba(255,235,59,0.15)";
                    drawBtn.style.color = "#ffeb3b";
                    drawBtn.style.border = "1px solid #ffeb3b";
                    drawBtn.style.borderRadius = "3px";
                    drawBtn.style.fontSize = "10px";
                    drawBtn.style.padding = "4px 0";
                    drawBtn.style.cursor = "pointer";
                    drawBtn.style.fontFamily = "Georgia, serif";
                    drawBtn.onclick = (e) => {
                        e.stopPropagation();
                        if (!canAffordThis) {
                            showSvsToast(`Not enough labor: ${typeName} needs ${def.laborCost}, you have ${getLabor()}.`, "error");
                            return;
                        }
                        beginLineDraw(typeName);
                        panel.remove();
                    };
                    card.appendChild(drawBtn);
                }
            } else {
                // Locked cards still respond — clicking explains why instead
                // of doing nothing, per "never leave the player guessing."
                card.onclick = (e) => {
                    e.stopPropagation();
                    showSvsToast(`${typeName} unlocks on Day ${def.unlockDay} (currently Day ${day}).`, "info");
                };
            }
            row.appendChild(card);
        });

        document.body.appendChild(panel);
    }

    // Renders a small static preview of a structure type onto its build-
    // picker card, reusing the exact same shape-drawing functions the real
    // battlefield render uses — so what you pick is what you actually get.
    function drawStructurePreview(canvas, def) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const pad = 8;
        const scale = Math.min(1, (canvas.width - pad * 2) / def.w, (canvas.height - pad * 2) / def.h);
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(scale, scale);
        const mockStructure = { w: def.w, h: def.h, color: def.color, edgeColor: def.edgeColor, angle: 0 };
        if (def.key === "palisade") {
            drawPalisadeShape(ctx, mockStructure);
        } else if (def.key === "trench") {
            drawTrenchShape(ctx, mockStructure);
        } else if (def.key === "spikes") {
            drawSpikeBarrierShape(ctx, mockStructure);
        } else if (def.key === "stonewall") {
            drawStoneBarricadeShape(ctx, mockStructure);
        } else if (def.key === "watchtower") {
            drawWatchtowerShape(ctx, mockStructure);
        } else if (def.key === "ballista") {
            drawBallistaShape(ctx, mockStructure);
        } else {
            ctx.fillStyle = def.color;
            ctx.strokeStyle = def.edgeColor;
            ctx.lineWidth = 2;
            ctx.fillRect(-def.w / 2, -def.h / 2, def.w, def.h);
            ctx.strokeRect(-def.w / 2, -def.h / 2, def.w, def.h);
        }
        ctx.restore();
    }

    // ========================================================================
    // PLACEMENT MODE — yellow ghost silhouette, rotate, confirm/cancel
    // ========================================================================
    function beginPlacement(typeName) {
        const def = STRUCTURE_TYPES[typeName];
        if (!def) return;
        if (!isStructureUnlocked(def)) {
            showSvsToast(`${typeName} unlocks on Day ${def.unlockDay} (currently Day ${window.__survivalDay || 1}).`, "info");
            return;
        }
        if (getLabor() < def.laborCost) {
            if (typeof AudioManager !== "undefined") AudioManager.playSound("error");
            showSvsToast(`Not enough labor: ${typeName} needs ${def.laborCost}, you have ${getLabor()}.`, "error");
            return;
        }

        // Ghost starts near the player/commander position as a reasonable
        // default to drag from — this does NOT select, assign, or track any
        // unit as a "builder." No unit is affected by placement in any way.
        const px = (typeof player !== "undefined" && player) ? player.x : 0;
        const py = (typeof player !== "undefined" && player) ? player.y : 0;

        buildMode = {
            active: true,
            mode: "point",
            typeName: typeName,
            x: px,
            y: py,
            angle: 0,
            lineActive: false,
            lineLastPoint: null,
            lineSegmentIds: []
        };

        showPlacementControls("point");
        showSvsHint("Drag to position, tap ↺/↻ to rotate, then ✓ Build — or ✕ Cancel.");
        { const _row = document.getElementById("svs-launcher-row"); if (_row) _row.style.display = "none"; }
    }

    // Click-and-drag line building — currently used by Trench. Places a
    // segment immediately where the drag starts, then a new segment every
    // def.w world units the pointer travels, spending gold live per segment.
    // Stops extending automatically the instant gold runs out — the player
    // can keep dragging, it just won't add any more trench.
    function beginLineDraw(typeName) {
        const def = STRUCTURE_TYPES[typeName];
        if (!def || !def.drawable) return;
        if (!isStructureUnlocked(def)) {
            showSvsToast(`${typeName} unlocks on Day ${def.unlockDay} (currently Day ${window.__survivalDay || 1}).`, "info");
            return;
        }
        if (getLabor() < def.laborCost) {
            if (typeof AudioManager !== "undefined") AudioManager.playSound("error");
            showSvsToast(`Not enough labor: ${typeName} needs ${def.laborCost}, you have ${getLabor()}.`, "error");
            return;
        }

        buildMode = {
            active: true,
            mode: "line",
            typeName: typeName,
            x: 0, y: 0,
            angle: 0,
            lineActive: false,
            lineLastPoint: null,
            lineSegmentIds: []
        };

        showPlacementControls("line");
        showSvsHint("Drag along the ground to dig. Runs out when your labor does. ✕ Cancel to stop.");
        { const _row = document.getElementById("svs-launcher-row"); if (_row) _row.style.display = "none"; }
    }

    function cancelPlacement() {
        // Refund any segments committed during an unfinished line-drag
        // stroke (segments from strokes the player already released stay —
        // this only undoes the CURRENT, still-in-progress drag).
        if (buildMode.mode === "line" && buildMode.lineSegmentIds && buildMode.lineSegmentIds.length > 0) {
            const def = STRUCTURE_TYPES[buildMode.typeName];
            buildMode.lineSegmentIds.forEach(id => {
                const idx = window.survivalStructures.findIndex(s => s.id === id);
                if (idx !== -1) {
                    window.survivalStructures.splice(idx, 1);
                    if (def) refundLabor(def.laborCost);
                }
            });
        }

        buildMode.active = false;
        buildMode.mode = "point";
        buildMode.typeName = null;
        buildMode.lineActive = false;
        buildMode.lineLastPoint = null;
        buildMode.lineSegmentIds = [];

        const controls = document.getElementById("svs-rotate-controls");
        if (controls) controls.style.display = "none";
        resetPlacementControlsVisibility(); // so rotate/confirm show again next time, without re-showing the bar now
    }

    function confirmPlacement() {
        if (!buildMode.active || buildMode.mode !== "point") return; // line mode has no explicit confirm step
        const def = STRUCTURE_TYPES[buildMode.typeName];
        if (!def) { cancelPlacement(); return; }
        if (!spendLabor(def.laborCost)) {
            if (typeof AudioManager !== "undefined") AudioManager.playSound("error");
            cancelPlacement();
            return;
        }

        const structure = {
            id: structureIdCounter++,
            type: buildMode.typeName,
            typeKey: def.key,
            shape: def.shape,
            x: buildMode.x,
            y: buildMode.y,
            w: def.w,
            h: def.h,
            angle: buildMode.angle,
            hp: 0,
            maxHp: def.maxHp,
            side: "player",
            state: "building",
            buildProgress: 0,
            buildSeconds: def.buildSeconds,
            buildStartedAt: Date.now(),
            color: def.color,
            edgeColor: def.edgeColor
        };
        window.survivalStructures.push(structure);

        if (typeof AudioManager !== "undefined") AudioManager.playSound("gold_buy");
        cancelPlacement();
    }

    // Places one Trench segment (or whatever buildMode.typeName is) at the
    // given world point, spending gold immediately. Returns the structure,
    // or null if unaffordable. No dedicated builder unit is frozen for
    // drag-drawn segments — abstractly "your sappers" dig the whole line.
    function placeLineSegment(wx, wy, angle, def) {
        if (getLabor() < def.laborCost || !spendLabor(def.laborCost)) return null;
        const structure = {
            id: structureIdCounter++,
            type: buildMode.typeName,
            typeKey: def.key,
            shape: def.shape,
            x: wx, y: wy,
            w: def.w, h: def.h,
            angle: angle,
            hp: 0,
            maxHp: def.maxHp,
            side: "player",
            state: "building",
            buildProgress: 0,
            buildSeconds: def.buildSeconds,
            buildStartedAt: Date.now(),
            color: def.color,
            edgeColor: def.edgeColor
        };
        window.survivalStructures.push(structure);
        buildMode.lineSegmentIds.push(structure.id);
        return structure;
    }

    function startLineDraw(wx, wy) {
        if (!buildMode.active || buildMode.mode !== "line") return;
        const def = STRUCTURE_TYPES[buildMode.typeName];
        if (!def) return;
        buildMode.lineActive = true;
        buildMode.x = wx;
        buildMode.y = wy;
        const placed = placeLineSegment(wx, wy, buildMode.angle || 0, def);
        if (placed) {
            buildMode.lineLastPoint = { x: wx, y: wy };
            if (typeof AudioManager !== "undefined") AudioManager.playSound("gold_buy");
        } else {
            // Nothing placeable (out of gold right at the start) — still
            // track the anchor so dragging shows the (red) ghost correctly,
            // but no segment exists yet to extend from.
            buildMode.lineLastPoint = { x: wx, y: wy };
            if (typeof AudioManager !== "undefined") AudioManager.playSound("error");
        }
    }

    function extendLineDraw(wx, wy) {
        if (!buildMode.active || buildMode.mode !== "line" || !buildMode.lineActive) return;
        const def = STRUCTURE_TYPES[buildMode.typeName];
        if (!def || !buildMode.lineLastPoint) return;

        const dxPrev = wx - buildMode.lineLastPoint.x;
        const dyPrev = wy - buildMode.lineLastPoint.y;
        // Keep the live ghost following the pointer even when no new
        // segment is placeable yet (still gives affordability feedback).
        buildMode.x = wx;
        buildMode.y = wy;
        if (Math.hypot(dxPrev, dyPrev) > 2) {
            buildMode.angle = Math.atan2(dyPrev, dxPrev);
        }

        const spacing = def.w; // segments tile roughly edge-to-edge
        let guard = 0;
        while (guard++ < 200) {
            const dx = wx - buildMode.lineLastPoint.x;
            const dy = wy - buildMode.lineLastPoint.y;
            const dist = Math.hypot(dx, dy);
            if (dist < spacing) break;
            if (getLabor() < def.laborCost) break; // out of labor — stop extending, per spec

            const angle = Math.atan2(dy, dx);
            const stepX = buildMode.lineLastPoint.x + Math.cos(angle) * spacing;
            const stepY = buildMode.lineLastPoint.y + Math.sin(angle) * spacing;
            const placed = placeLineSegment(stepX, stepY, angle, def);
            if (!placed) break;
            buildMode.lineLastPoint = { x: stepX, y: stepY };
            if (typeof AudioManager !== "undefined") AudioManager.playSound("gold_buy");
        }
    }

    function endLineDraw() {
        if (!buildMode.active || buildMode.mode !== "line") return;
        buildMode.lineActive = false;
        // The stroke that just ended is final — clear per-stroke refund
        // tracking so a later Cancel only ever undoes a NEW, still-active
        // drag, not work the player already finished and released.
        buildMode.lineSegmentIds = [];
    }

    // ------------------------------------------------------------------
    // Floating mobile rotate/confirm/cancel controls + contextual hint
    // ------------------------------------------------------------------
    function ensureFloatingRotateControls() {
        let bar = document.getElementById("svs-rotate-controls");
        if (bar) return bar;

        bar = document.createElement("div");
        bar.id = "svs-rotate-controls";
        bar.style.position = "fixed";
        bar.style.left = "50%";
        bar.style.bottom = "90px";
        bar.style.transform = "translateX(-50%)";
        bar.style.zIndex = "5002";
        bar.style.display = "none";
        bar.style.flexDirection = "column";
        bar.style.alignItems = "center";
        bar.style.gap = "8px";

        const hint = document.createElement("div");
        hint.id = "svs-build-hint";
        hint.style.color = "#f5d76e";
        hint.style.fontSize = "12px";
        hint.style.textAlign = "center";
        hint.style.maxWidth = "80vw";
        hint.style.textShadow = "1px 1px 3px #000, 0 0 6px #000";
        bar.appendChild(hint);

        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.gap = "10px";

        const rotLeft = svsBtn("↺", () => { buildMode.angle -= Math.PI / 12; }, { small: true });
        rotLeft.id = "svs-rot-left";
        const rotRight = svsBtn("↻", () => { buildMode.angle += Math.PI / 12; }, { small: true });
        rotRight.id = "svs-rot-right";
        const confirm = svsBtn("✓ Build", () => confirmPlacement());
        confirm.id = "svs-confirm-btn";
        // Cancel is deliberately the most visually distinct control here —
        // labeled (not just an icon) and red-tinted, so it reads unambiguously
        // as "back out of this" at a glance.
        const cancel = svsBtn("✕ Cancel", () => cancelPlacement(), { small: true });
        cancel.id = "svs-cancel-btn";
        cancel.style.background = "linear-gradient(to bottom, #6b1414, #3a0808)";
        cancel.style.borderColor = "#f44336";
        cancel.style.color = "#ffcdd2";
        cancel.onmouseenter = () => cancel.style.background = "linear-gradient(to bottom, #a11f1f, #6b1414)";
        cancel.onmouseleave = () => cancel.style.background = "linear-gradient(to bottom, #6b1414, #3a0808)";

        row.appendChild(rotLeft);
        row.appendChild(rotRight);
        row.appendChild(confirm);
        row.appendChild(cancel);
        bar.appendChild(row);
        document.body.appendChild(bar);
        return bar;
    }

    function showSvsHint(text) {
        const h = document.getElementById("svs-build-hint");
        if (h) h.innerText = text;
    }

    // FIX: showSvsHint above only writes into an element that lives inside
    // the placement-mode rotate/confirm/cancel bar — which is display:none
    // any time the player ISN'T actively dragging a ghost. Every "explain
    // why" requirement (repair had nothing to fix, build blocked, demolish/
    // cancel confirmations) fires from a plain button click, NOT mid-
    // placement, so showSvsHint was silently a no-op for all of them. This
    // is a fully standalone toast, visible regardless of placement state.
    let svsToastTimer = null;
    function showSvsToast(text, kind) {
        let el = document.getElementById("svs-toast");
        if (!el) {
            el = document.createElement("div");
            el.id = "svs-toast";
            el.style.position = "fixed";
            el.style.left = "50%";
            el.style.bottom = "150px";
            el.style.transform = "translateX(-50%)";
            el.style.zIndex = "5010";
            el.style.padding = "10px 18px";
            el.style.borderRadius = "6px";
            el.style.fontFamily = "Georgia, serif";
            el.style.fontSize = "13px";
            el.style.textAlign = "center";
            el.style.maxWidth = "80vw";
            el.style.pointerEvents = "none";
            el.style.boxShadow = "0 3px 10px rgba(0,0,0,0.6)";
            el.style.transition = "opacity 200ms ease";
            document.body.appendChild(el);
        }
        const palette = {
            error: { bg: "rgba(74,10,10,0.95)", border: "#e57373", color: "#ffcdd2" },
            success: { bg: "rgba(26,58,31,0.95)", border: "#8bc34a", color: "#c8e6a0" },
            info: { bg: "rgba(20,20,20,0.95)", border: "#d4b886", color: "#f5d76e" }
        }[kind || "info"];
        el.style.background = palette.bg;
        el.style.border = `1px solid ${palette.border}`;
        el.style.color = palette.color;
        el.innerText = text;
        el.style.display = "block";
        el.style.opacity = "1";
        if (svsToastTimer) clearTimeout(svsToastTimer);
        svsToastTimer = setTimeout(() => {
            el.style.opacity = "0";
            setTimeout(() => { el.style.display = "none"; }, 220);
        }, 2600);
    }

    // Toggles which sub-buttons are relevant without touching the bar's
    // overall show/hide state — used both when entering a mode and when
    // cancelling out (so the bar stays hidden but is correctly configured
    // for whichever mode is picked next time).
    function resetPlacementControlsVisibility(mode) {
        const rl = document.getElementById("svs-rot-left");
        const rr = document.getElementById("svs-rot-right");
        const cf = document.getElementById("svs-confirm-btn");
        const showPointControls = mode !== "line";
        if (rl) rl.style.display = showPointControls ? "" : "none";
        if (rr) rr.style.display = showPointControls ? "" : "none";
        if (cf) cf.style.display = showPointControls ? "" : "none";
    }

    // Shows the controls bar and toggles which buttons are relevant for the
    // given mode: line-drawing has no rotate/confirm step (orientation comes
    // from the drag direction, and building commits live per-segment), point
    // placement uses all four.
    function showPlacementControls(mode) {
        const bar = ensureFloatingRotateControls();
        bar.style.display = "flex";
        resetPlacementControlsVisibility(mode);
    }

    // ------------------------------------------------------------------
    // INPUT — desktop mouse + keyboard, mobile touch
    // ------------------------------------------------------------------
    let lastTapTime = 0;
    let lastTapPos = { x: 0, y: 0 };

    // SURGERY: browsers commonly fire a synthetic mousedown/click ~300ms
    // after a real touch tap (since touchstart below is intentionally
    // {passive:true} and never calls preventDefault). Without this guard,
    // the new left-click-to-confirm handler below would ALSO fire from a
    // single mobile tap and confirm immediately — breaking the existing
    // double-tap-to-confirm mobile flow. Any real touch event marks a short
    // window during which mousedown is ignored; genuine desktop mice never
    // touch this path at all.
    let recentTouch = false;
    let recentTouchTimer = null;
    function markRecentTouch() {
        recentTouch = true;
        if (recentTouchTimer) clearTimeout(recentTouchTimer);
        recentTouchTimer = setTimeout(() => { recentTouch = false; }, 800);
    }

    function installInputHandlers() {
        const canvas = document.getElementById("gameCanvas");
        if (!canvas || canvas.__svsInputInstalled) return;
        canvas.__svsInputInstalled = true;

        canvas.addEventListener("mousedown", (e) => {
            if (!buildMode.active || recentTouch) return;

            // SURGERY: without this, battlefield_commands.js's OWN
            // document-level mousedown/mouseup box-select+formation-move
            // listener ALSO fires on this same click. Any drag distance
            // while lining up the ghost (near-guaranteed — positioning a
            // structure isn't a perfectly still click) then reads as a
            // formation drag and issues a real move order to whatever
            // units are currently selected, which looked like those units
            // "teleporting" to the just-built structure. Build mode and
            // unit selection/movement should be mutually exclusive inputs
            // on this canvas. stopImmediatePropagation also blocks any
            // other same-element listener, not just ancestor ones.
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();

            // Right click cancels — works in either mode, mirrors the
            // left-click-to-build gesture below. contextmenu is suppressed
            // separately so the browser's native menu doesn't also pop up.
            if (e.button === 2) {
                e.preventDefault();
                cancelPlacement();
                return;
            }
            if (e.button !== 0) return; // ignore middle-click etc.

            if (buildMode.mode === "line") {
                const w = screenToWorld(e.clientX, e.clientY);
                startLineDraw(w.x, w.y);
                return;
            }

            // Point mode: left click anywhere while the yellow ghost is
            // showing confirms the build at its current position — quicker
            // and more intuitive than hunting for the ✓ Build button
            // (which, along with double-click, still works too). Units are
            // NOT selected/moved by this click — see the propagation stop
            // above. There's also no unit teleport here at all: the
            // structure is simply created at buildMode.x/y (see
            // confirmPlacement) — during predeployment "invisible handymen"
            // build it, no actual unit walks to the site.
            confirmPlacement();
        });

        canvas.addEventListener("contextmenu", (e) => {
            if (buildMode.active) e.preventDefault();
        });

        canvas.addEventListener("mousemove", (e) => {
            if (!buildMode.active) return;
            const w = screenToWorld(e.clientX, e.clientY);
            if (buildMode.mode === "line") {
                if (buildMode.lineActive) extendLineDraw(w.x, w.y);
                else { buildMode.x = w.x; buildMode.y = w.y; }
            } else {
                buildMode.x = w.x;
                buildMode.y = w.y;
            }
        });

        canvas.addEventListener("mouseup", () => {
            if (!buildMode.active || buildMode.mode !== "line") return;
            endLineDraw();
        });

        canvas.addEventListener("dblclick", (e) => {
            if (!buildMode.active || buildMode.mode !== "point") return;
            e.preventDefault();
            confirmPlacement();
        });

        canvas.addEventListener("touchstart", (e) => {
            markRecentTouch();
            if (!buildMode.active || buildMode.mode !== "line" || !e.touches || !e.touches[0]) return;
            const t = e.touches[0];
            const w = screenToWorld(t.clientX, t.clientY);
            startLineDraw(w.x, w.y);
        }, { passive: true });

        canvas.addEventListener("touchmove", (e) => {
            markRecentTouch();
            if (!buildMode.active || !e.touches || !e.touches[0]) return;
            const t = e.touches[0];
            const w = screenToWorld(t.clientX, t.clientY);
            if (buildMode.mode === "line") {
                if (buildMode.lineActive) extendLineDraw(w.x, w.y);
                else { buildMode.x = w.x; buildMode.y = w.y; }
            } else {
                buildMode.x = w.x;
                buildMode.y = w.y;
            }
        }, { passive: true });

        canvas.addEventListener("touchend", (e) => {
            markRecentTouch();
            if (!buildMode.active) return;
            if (buildMode.mode === "line") {
                endLineDraw();
                return;
            }
            const now = Date.now();
            const touch = (e.changedTouches && e.changedTouches[0]) || null;
            const pos = touch ? { x: touch.clientX, y: touch.clientY } : lastTapPos;
            const dt = now - lastTapTime;
            const dist = Math.hypot(pos.x - lastTapPos.x, pos.y - lastTapPos.y);
            if (dt < 350 && dist < 40) {
                confirmPlacement();
                lastTapTime = 0;
            } else {
                lastTapTime = now;
                lastTapPos = pos;
            }
        });

        document.addEventListener("keydown", (e) => {
            if (!buildMode.active) return;
            if (e.key === "[") buildMode.angle -= Math.PI / 12;
            else if (e.key === "]") buildMode.angle += Math.PI / 12;
            else if (e.key === "Escape") cancelPlacement();
        });
    }

    // ========================================================================
    // COLLISION GEOMETRY — oriented-rect helpers shared by movement blocking,
    // the trench slow zone, elevation-bonus proximity, and projectile blocking.
    // Self-contained: no dependency on any other file's collision system.
    // ========================================================================
    // Transforms a world point into a structure's local (unrotated) space,
    // centered on the structure. In local space the structure is just an
    // axis-aligned w×h box, which makes every test below trivial.
    function toLocalSpace(px, py, s) {
        const dx = px - s.x, dy = py - s.y;
        const cos = Math.cos(-(s.angle || 0)), sin = Math.sin(-(s.angle || 0));
        return { lx: dx * cos - dy * sin, ly: dx * sin + dy * cos };
    }

    function pointInStructure(px, py, s, pad) {
        pad = pad || 0;
        const { lx, ly } = toLocalSpace(px, py, s);
        return Math.abs(lx) <= s.w / 2 + pad && Math.abs(ly) <= s.h / 2 + pad;
    }

    // Circle-vs-oriented-box push-out. Returns {x,y} world-space displacement
    // to move the circle fully outside the box along the shallowest axis, or
    // null if there's no overlap.
    function circlePushOutOfStructure(px, py, radius, s) {
        const { lx, ly } = toLocalSpace(px, py, s);
        const halfW = s.w / 2, halfH = s.h / 2;
        const clampedX = Math.max(-halfW, Math.min(halfW, lx));
        const clampedY = Math.max(-halfH, Math.min(halfH, ly));
        const dx = lx - clampedX, dy = ly - clampedY;
        const distSq = dx * dx + dy * dy;
        if (distSq > radius * radius) return null; // not touching

        // Push along the axis with the least penetration so units slide off
        // corners naturally instead of popping straight backward.
        const penX = halfW + radius - Math.abs(lx);
        const penY = halfH + radius - Math.abs(ly);
        let localPushX = 0, localPushY = 0;
        if (penX < penY) {
            localPushX = (lx >= 0 ? 1 : -1) * penX;
        } else {
            localPushY = (ly >= 0 ? 1 : -1) * penY;
        }
        // Rotate the local push vector back into world space.
        const cos = Math.cos(s.angle || 0), sin = Math.sin(s.angle || 0);
        return { x: localPushX * cos - localPushY * sin, y: localPushX * sin + localPushY * cos };
    }

    // ========================================================================
    // PER-FRAME STRUCTURE COLLISION — called every real frame from
    // battlefield_logic.js's main loop (guarded to survival battles only).
    // Handles all three fortification effects in one unit pass:
    //   1. Palisade walls physically block movement (circle push-out).
    //   2. Trenches slow anyone crossing them (moat behavior, not a fighting
    //      position — no push-out, no elevation bonus, see STRUCTURE_TYPES).
    //   3. Player units braced near a wall/tower/emplacement get a temporary
    //      elevation defense bonus that cleanly reverts the instant they
    //      step away (base stats are tracked, never compounded).
    // ========================================================================
    function applyStructureCollisions(units) {
        if (!Array.isArray(units) || !window.survivalStructures) return;
        const built = window.survivalStructures.filter(s => s.state === "built" && s.hp > 0);
        const blockers = built.filter(s => STRUCTURE_TYPES[s.type] && STRUCTURE_TYPES[s.type].blocksMovement);
        const slowZones = built.filter(s => STRUCTURE_TYPES[s.type] && STRUCTURE_TYPES[s.type].slowsMovement);
        const elevationSources = built.filter(s => STRUCTURE_TYPES[s.type] && STRUCTURE_TYPES[s.type].elevationBonus > 0);
        const ELEVATION_RANGE = 46; // world units — roughly "standing right behind it"

        units.forEach(u => {
            if (!u || u.hp <= 0) return;
            const radius = (u.stats && u.stats.radius) || 6;
            // SURGERY: the commander's actual RENDERED position is driven by
            // the separate window.player.x/y global, synced FROM it every
            // frame by sandboxmode_update.js's player→pCmdr sync (not the
            // other way around) — so any push/slow this function applies to
            // u.x/u.y alone gets silently overwritten again next frame. The
            // commander was visually walking straight through palisades and
            // trenches even though their unit entry here was being clamped
            // correctly the whole time. Tracking the total delta and
            // mirroring it onto player.x/y below fixes that.
            const isPlayerCommander = !!(u.isCommander && u.side === "player");
            const beforeX = u.x, beforeY = u.y;

            // --- 1. Trench slow: dampen whatever movement already happened
            // this frame, by comparing against last frame's tracked position.
            // This needs no knowledge of how movement/velocity actually works
            // elsewhere in the engine — it just retroactively shaves down the
            // net displacement, which reads identically to "wading through mud."
            if (slowZones.length && typeof u._svsPrevX === "number") {
                const inTrench = slowZones.some(s => pointInStructure(u.x, u.y, s));
                if (inTrench) {
                    const def = STRUCTURE_TYPES[slowZones.find(s => pointInStructure(u.x, u.y, s)).type];
                    const factor = (def && def.slowFactor) || 0.35;
                    u.x = u._svsPrevX + (u.x - u._svsPrevX) * factor;
                    u.y = u._svsPrevY + (u.y - u._svsPrevY) * factor;
                }
            }
            u._svsPrevX = u.x;
            u._svsPrevY = u.y;

            // --- 2. Palisade hard block: push fully back out, kill momentum
            // into the wall so units don't vibrate against it every frame.
            for (const s of blockers) {
                const push = circlePushOutOfStructure(u.x, u.y, radius, s);
                if (push) {
                    u.x += push.x;
                    u.y += push.y;
                    if (typeof u.vx === "number") u.vx *= 0.15;
                    if (typeof u.vy === "number") u.vy *= 0.15;

                    // Hazard structures (Spike Barrier) chip damage on
                    // contact, on a cooldown so leaning on it doesn't melt
                    // a unit in one frame — reads as "ouch, spikes" every
                    // half-second or so rather than a single instant kill.
                    const hazardDef = STRUCTURE_TYPES[s.type];
                    if (hazardDef && hazardDef.hazardDamage) {
                        const now = Date.now();
                        if (!u._svsLastHazardHit || now - u._svsLastHazardHit > 500) {
                            u._svsLastHazardHit = now;
                            u.hp = Math.max(0, u.hp - hazardDef.hazardDamage);
                        }
                    }
                    break; // one wall resolved per frame is plenty — avoids jitter between two adjacent segments
                }
            }

            // --- 3. Elevation bonus: player units near a qualifying built
            // structure fight with boosted defense/accuracy. Base values are
            // stamped once so re-applying every frame never compounds, and
            // are restored the instant the unit leaves every zone.
            if (u.side === "player" && u.stats) {
                const elevated = elevationSources.some(s => {
                    const def = STRUCTURE_TYPES[s.type];
                    const pad = ELEVATION_RANGE + (def.w + def.h) / 4;
                    return pointInStructure(u.x, u.y, s, pad);
                });
                if (elevated && !u._svsElevated) {
                    u._svsBaseMeleeDefense = u.stats.meleeDefense;
                    u._svsBaseAccuracy = u.stats.accuracy;
                    const bestBonus = Math.max(...elevationSources
                        .filter(s => pointInStructure(u.x, u.y, s, ELEVATION_RANGE + (STRUCTURE_TYPES[s.type].w + STRUCTURE_TYPES[s.type].h) / 4))
                        .map(s => STRUCTURE_TYPES[s.type].elevationBonus));
                    u.stats.meleeDefense = u._svsBaseMeleeDefense * (1 + bestBonus);
                    if (typeof u._svsBaseAccuracy === "number") u.stats.accuracy = Math.min(100, u._svsBaseAccuracy * (1 + bestBonus * 0.5));
                    u._svsElevated = true;
                } else if (!elevated && u._svsElevated) {
                    u.stats.meleeDefense = u._svsBaseMeleeDefense;
                    if (typeof u._svsBaseAccuracy === "number") u.stats.accuracy = u._svsBaseAccuracy;
                    u._svsElevated = false;
                }
            }

            if (isPlayerCommander && window.player && (u.x !== beforeX || u.y !== beforeY)) {
                window.player.x += (u.x - beforeX);
                window.player.y += (u.y - beforeY);
            }
        });
    }

    // ========================================================================
    // TICK — build progress, day-end auto-complete, simplified enemy attacks
    // ========================================================================
    function tick() {
        const now = Date.now();
        const dayEnding = (lastPreDeployState === true && window.__preDeploymentActive === false);
        lastPreDeployState = window.__preDeploymentActive;

        window.survivalStructures.forEach(s => {
            if (s.state !== "building") return;

            const elapsedSec = (now - s.buildStartedAt) / 1000;
            s.buildProgress = Math.min(1, elapsedSec / s.buildSeconds);
            s.hp = Math.floor(s.maxHp * s.buildProgress);

            // Per spec: if the day (predeployment) ends while still under
            // construction, it just counts as successfully built.
            if (s.buildProgress >= 1 || dayEnding) {
                s.state = "built";
                s.buildProgress = 1;
                s.hp = s.maxHp;
            }
        });

        // Simplified enemy-vs-structure damage tick — only while a wave is
        // actually live (not during the day/predeployment phase).
        // flag for later: this is a naive random-preference placeholder.
        // Real implementation should weigh chokepoint value, line-of-sight,
        // and route through the normal melee/projectile pipeline instead of
        // subtracting hp directly.
        if (window.__IS_SURVIVAL_BATTLE__ && !window.__preDeploymentActive
            && typeof battleEnvironment !== "undefined" && battleEnvironment
            && Array.isArray(battleEnvironment.units)) {

            // SURGERY: trenches are terrain, not a garrisoned target — no enemy
            // "attacks" a ditch (see STRUCTURE_TYPES[...].noStructureCombat).
            const liveStructures = window.survivalStructures.filter(s =>
                s.state === "built" && s.hp > 0 && !(STRUCTURE_TYPES[s.type] && STRUCTURE_TYPES[s.type].noStructureCombat));
            if (liveStructures.length > 0) {
                const ENGAGE_RANGE = 60;
                const ATTACK_CHANCE_PER_TICK = 0.02; // ~ once every few seconds per nearby enemy
                const STRUCTURE_DAMAGE_PER_HIT = 6;

                battleEnvironment.units.forEach(u => {
                    if (u.side !== "enemy" || u.hp <= 0) return;
                    for (const s of liveStructures) {
                        if (s.hp <= 0) continue;
                        const d = Math.hypot(u.x - s.x, u.y - s.y);
                        if (d > ENGAGE_RANGE) continue;
                        // //flag for later ai refinement: coin-flip between
                        // attacking the structure or leaving it to the real
                        // combat AI to pick a unit target instead.
                        if (Math.random() < ATTACK_CHANCE_PER_TICK && Math.random() < 0.5) {
                            s.hp = Math.max(0, s.hp - STRUCTURE_DAMAGE_PER_HIT);
                        }
                        break;
                    }
                });
            }
        }

        // Drop fully destroyed structures.
        window.survivalStructures = window.survivalStructures.filter(s => s.hp > 0 || s.state === "building");
    }

    // REMOVED: releaseBuilder — construction never assigns, freezes, or
    // repositions a unit, so there's nothing to release.

    // ========================================================================
    // RENDER — wraps window.drawBattleUnits so structures draw underneath
    // units, using the same already-camera/zoom-transformed ctx (see
    // troop_draw.js: drawBattleUnits is called from inside a transformed
    // context, and individual draw calls use raw world coordinates). The
    // ghost placement silhouette is drawn separately, AFTER units, so it's
    // never occluded by unit sprites standing near the cursor.
    // ========================================================================
    function drawSurvivalStructures(ctx) {
        if (!window.__IS_SURVIVAL_BATTLE__) return;

        window.survivalStructures.forEach(s => {
            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.rotate(s.angle || 0);

            const def = STRUCTURE_TYPES[s.type];
            const key = (def && def.key) || s.typeKey;

            if (key === "palisade") {
                drawPalisadeShape(ctx, s);
            } else if (key === "trench") {
                drawTrenchShape(ctx, s);
            } else if (key === "spikes") {
                drawSpikeBarrierShape(ctx, s);
            } else if (key === "stonewall") {
                drawStoneBarricadeShape(ctx, s);
            } else if (key === "watchtower") {
                drawWatchtowerShape(ctx, s);
            } else if (key === "ballista") {
                drawBallistaShape(ctx, s);
            } else {
                // Fallback for any future structure type without its own
                // dedicated draw function yet.
                ctx.fillStyle = s.color;
                ctx.strokeStyle = s.edgeColor;
                ctx.lineWidth = 2;
                ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
                ctx.strokeRect(-s.w / 2, -s.h / 2, s.w, s.h);
            }

            // Under-construction fill overlay (rises left-to-right with progress)
            if (s.state === "building") {
                ctx.fillStyle = "rgba(255,255,255,0.25)";
                ctx.fillRect(-s.w / 2, -s.h / 2, s.w * (1 - s.buildProgress), s.h);
            }
            ctx.restore();

            // HP bar — only for structures that are actually a fought-over
            // target. Trenches are terrain (see noStructureCombat) and never
            // take damage, so a bar under one would just be visual noise.
            if (s.state === "built" && s.hp < s.maxHp && !(def && def.noStructureCombat)) {
                const barW = s.w;
                const pct = Math.max(0, s.hp / s.maxHp);
                ctx.save();
                ctx.translate(s.x - barW / 2, s.y - s.h / 2 - 8);
                ctx.fillStyle = "rgba(0,0,0,0.6)";
                ctx.fillRect(0, 0, barW, 4);
                ctx.fillStyle = pct > 0.3 ? "#4caf50" : "#f44336";
                ctx.fillRect(0, 0, barW * pct, 4);
                ctx.restore();
            }
        });
    }

    // Sharpened timber stakes lashed by a binding rail — reads as a hand-built
    // field fortification instead of a flat slab. Post variance is derived
    // from index (deterministic), not Math.random(), so the wall doesn't
    // shimmer/flicker as it redraws every frame.
    function drawPalisadeShape(ctx, s) {
        const w = s.w, h = s.h;
        const postCount = Math.max(4, Math.round(w / 11));
        const gap = w / postCount;
        const postW = gap * 0.62;

        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.ellipse(0, h / 2 + 2, w / 2, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        for (let i = 0; i < postCount; i++) {
            const cx = -w / 2 + gap * (i + 0.5);
            const jitter = ((i * 37) % 5) - 2; // deterministic per-post variance
            const topY = -h / 2 - 2 + jitter * 0.4;
            const postH = h + 4 - jitter * 0.3;

            ctx.save();
            ctx.translate(cx, 0);
            ctx.rotate(jitter * 0.03);

            const grad = ctx.createLinearGradient(-postW / 2, 0, postW / 2, 0);
            grad.addColorStop(0, "#4a331c");
            grad.addColorStop(0.5, s.color);
            grad.addColorStop(1, "#3e2b16");
            ctx.fillStyle = grad;
            ctx.fillRect(-postW / 2, topY, postW, postH);

            ctx.beginPath();
            ctx.moveTo(-postW / 2, topY);
            ctx.lineTo(0, topY - 6);
            ctx.lineTo(postW / 2, topY);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = s.edgeColor;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        }

        ctx.fillStyle = s.edgeColor;
        ctx.fillRect(-w / 2 - 1, -1.5, w + 2, 3);
    }

    // Dug earthwork ditch — dark gradient interior reads as a depression
    // rather than a solid object, with raised spoil-mounds (displaced earth)
    // along both long edges. Deliberately NOT drawn like a defended wall —
    // per spec this is a moat, not a fighting position.
    function drawTrenchShape(ctx, s) {
        const w = s.w, h = s.h;

        ctx.fillStyle = "#5a4a34";
        ctx.beginPath();
        ctx.ellipse(0, -h / 2, w / 2 + 4, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0, h / 2, w / 2 + 4, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
        grad.addColorStop(0, "#241c15");
        grad.addColorStop(0.5, s.color);
        grad.addColorStop(1, "#1a140e");
        ctx.fillStyle = grad;
        ctx.fillRect(-w / 2, -h / 2, w, h);

        ctx.fillStyle = "rgba(0,0,0,0.35)";
        for (let i = 0; i < 6; i++) {
            const fx = -w / 2 + (((i * 53) % 100) / 100) * w;
            const fy = -h / 2 + (((i * 29) % 100) / 100) * h;
            ctx.beginPath();
            ctx.ellipse(fx, fy, 3, 1.6, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.strokeStyle = s.edgeColor;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
    }

    // Low row of sharply angled stakes, all leaning the SAME direction
    // (toward the approach) — visually distinct from the palisade's
    // straight vertical posts, reads as a ground hazard rather than a wall.
    function drawSpikeBarrierShape(ctx, s) {
        const w = s.w, h = s.h;
        const count = Math.max(5, Math.round(w / 8));
        const gap = w / count;

        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.ellipse(0, h / 2 + 1, w / 2, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        for (let i = 0; i < count; i++) {
            const cx = -w / 2 + gap * (i + 0.5);
            const jitter = ((i * 41) % 5) - 2;
            ctx.save();
            ctx.translate(cx, jitter * 0.3);
            ctx.rotate(0.5 + jitter * 0.04); // consistent forward lean, per-stake variance
            ctx.fillStyle = s.color;
            ctx.strokeStyle = s.edgeColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-1.5, h / 2);
            ctx.lineTo(1.5, h / 2);
            ctx.lineTo(0, -h);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    }

    // Roughly stacked quarry stone — three staggered courses of blocks with
    // visible mortar gaps, clearly heavier/sturdier-reading than the timber
    // palisade even before checking HP numbers.
    function drawStoneBarricadeShape(ctx, s) {
        const w = s.w, h = s.h;
        const courses = 3;
        const courseH = h / courses;

        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.ellipse(0, h / 2 + 2, w / 2, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        for (let c = 0; c < courses; c++) {
            const rowY = -h / 2 + c * courseH;
            const stagger = (c % 2 === 0) ? 0 : 6;
            const blockW = 14;
            let bx = -w / 2 - stagger;
            let i = 0;
            while (bx < w / 2) {
                const thisW = Math.min(blockW, w / 2 - bx);
                if (thisW > 1) {
                    const shade = 0.9 + (((c * 7 + i) * 13) % 10) / 100;
                    ctx.fillStyle = s.color;
                    ctx.globalAlpha = shade;
                    ctx.fillRect(Math.max(-w / 2, bx), rowY, thisW - 1.5, courseH - 1.5);
                    ctx.globalAlpha = 1;
                }
                bx += blockW;
                i++;
            }
        }

        ctx.strokeStyle = s.edgeColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
    }

    // Raised timber platform on four corner legs, reads as "tall" even in
    // a top-down view via a smaller inset roof shape suggesting height.
    function drawWatchtowerShape(ctx, s) {
        const w = s.w, h = s.h;

        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath();
        ctx.ellipse(0, 0, w / 2 + 2, h / 2 + 2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Four corner support legs
        ctx.fillStyle = "#3e2b16";
        [[-w / 2 + 3, -h / 2 + 3], [w / 2 - 3, -h / 2 + 3], [-w / 2 + 3, h / 2 - 3], [w / 2 - 3, h / 2 - 3]]
            .forEach(([lx, ly]) => {
                ctx.beginPath();
                ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
                ctx.fill();
            });

        // Base platform
        ctx.fillStyle = s.color;
        ctx.strokeStyle = s.edgeColor;
        ctx.lineWidth = 2;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.strokeRect(-w / 2, -h / 2, w, h);

        // Inset roof, smaller — reads as "viewed from below, roof recedes
        // upward" and gives the shape a distinct silhouette from a flat wall.
        const inset = w * 0.28;
        ctx.fillStyle = "#4a3520";
        ctx.strokeStyle = s.edgeColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -h / 2 + inset * 0.4);
        ctx.lineTo(w / 2 - inset * 0.5, h / 2 - inset * 0.4);
        ctx.lineTo(-w / 2 + inset * 0.5, h / 2 - inset * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // Heavy braced timber-and-iron frame — angular cross-bracing reads as
    // "fixed siege equipment" rather than a simple wall or platform.
    function drawBallistaShape(ctx, s) {
        const w = s.w, h = s.h;

        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath();
        ctx.ellipse(0, h / 2 + 1, w / 2, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = s.color;
        ctx.strokeStyle = s.edgeColor;
        ctx.lineWidth = 2;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.strokeRect(-w / 2, -h / 2, w, h);

        // Cross-bracing
        ctx.strokeStyle = "#241a16";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 3, -h / 2 + 3);
        ctx.lineTo(w / 2 - 3, h / 2 - 3);
        ctx.moveTo(w / 2 - 3, -h / 2 + 3);
        ctx.lineTo(-w / 2 + 3, h / 2 - 3);
        ctx.stroke();

        // Iron bands at the corners
        ctx.fillStyle = "#6d6d6d";
        [[-w / 2 + 2, -h / 2 + 2], [w / 2 - 2, -h / 2 + 2], [-w / 2 + 2, h / 2 - 2], [w / 2 - 2, h / 2 - 2]]
            .forEach(([lx, ly]) => {
                ctx.beginPath();
                ctx.arc(lx, ly, 2, 0, Math.PI * 2);
                ctx.fill();
            });
    }

    // Ghost placement silhouette. Drawn on top of everything (units included)
    // so it's always clearly visible regardless of what's standing near the
    // cursor. Pulses and shows a bright outer glow so it reads clearly even
    // at Survival's small default zoom; turns red when the current gold
    // can't afford it (which, in line-draw mode, is also the "why did it
    // stop extending" signal).
    function drawSurvivalGhost(ctx) {
        if (!window.__IS_SURVIVAL_BATTLE__ || !buildMode.active) return;
        const def = STRUCTURE_TYPES[buildMode.typeName];
        if (!def) return;

        const canAfford = getLabor() >= def.laborCost;
        const pulse = 0.35 + 0.30 * Math.abs(Math.sin(Date.now() / 300));
        const mainColor = canAfford ? "255, 235, 59" : "244, 67, 54";
        const strokeColor = canAfford ? "#ffeb3b" : "#f44336";

        ctx.save();
        ctx.translate(buildMode.x, buildMode.y);
        ctx.rotate(buildMode.angle || 0);

        // Outer glow, unrotated stroke width scaling not needed at this size.
        ctx.strokeStyle = `rgba(${mainColor}, 0.9)`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-def.w / 2 - 5, -def.h / 2 - 5, def.w + 10, def.h + 10);

        ctx.fillStyle = `rgba(${mainColor}, ${pulse})`;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.fillRect(-def.w / 2, -def.h / 2, def.w, def.h);
        ctx.strokeRect(-def.w / 2, -def.h / 2, def.w, def.h);
        ctx.setLineDash([]);
        ctx.restore();
    }

    function installRenderHook() {
        if (typeof window.drawBattleUnits !== "function" || window.drawBattleUnits.__svsWrapped) return;
        const original = window.drawBattleUnits;
        const wrapped = function (ctx) {
            drawSurvivalStructures(ctx);
            drawNightRaidTents(ctx);
            original(ctx);
            drawSurvivalGhost(ctx);
            drawSurvivalWeather(ctx);
            drawNightRaidOverlay(ctx);
        };
        wrapped.__svsWrapped = true;
        window.drawBattleUnits = wrapped;
    }

    // ========================================================================
    // WEATHER — each day gets a slightly different look: an overcast sky, a
    // rain shower, a warm late sunset, a cold grey dawn. Deterministic per
    // (day, run) via a tiny seeded hash — same day always looks the same
    // within a run, but varies run to run (see window.__survivalWeatherSeed,
    // set once in beginSurvivalRun). Purely a screen-space visual overlay
    // drawn last, on top of terrain/structures/units — doesn't touch the
    // actual terrain generator, gameplay, or collision in any way.
    // ========================================================================
    const WEATHER_PROFILES = [
        { label: "Clear",       tint: null,                        rain: 0 },
        { label: "Overcast",    tint: "rgba(120,130,140,0.16)",     rain: 0 },
        { label: "Light Rain",  tint: "rgba(90,105,120,0.22)",      rain: 0.35 },
        { label: "Heavy Rain",  tint: "rgba(55,65,80,0.34)",        rain: 0.85 },
        { label: "Golden Dusk", tint: "rgba(255,150,80,0.14)",      rain: 0 },
        { label: "Grey Dawn",   tint: "rgba(160,180,200,0.15)",     rain: 0 },
        { label: "Amber Haze",  tint: "rgba(210,160,90,0.12)",      rain: 0 }
    ];

    // SURGERY: winter gets its own pool — snow instead of rain, colder
    // tints. seasonForDay below duplicates survivalMode.js's identical
    // SEASON_LENGTH_DAYS/cycle logic on purpose (small, self-contained
    // helper — same reasoning as every other cross-file duplication in
    // this project) so the two files can never drift apart on which day
    // is which season.
    const WINTER_WEATHER_PROFILES = [
        { label: "Frosty Clear",  tint: "rgba(180,200,220,0.10)",  rain: 0, snow: 0 },
        { label: "Overcast",      tint: "rgba(130,140,150,0.18)",  rain: 0, snow: 0 },
        { label: "Snowfall",      tint: "rgba(200,210,225,0.16)",  rain: 0, snow: 0.35 },
        { label: "Blizzard",      tint: "rgba(160,175,195,0.30)",  rain: 0, snow: 0.9 },
        { label: "Grey Dawn",     tint: "rgba(160,180,200,0.15)",  rain: 0, snow: 0 }
    ];

    const SEASON_LENGTH_DAYS = 20;
    function seasonForDayLocal(day) {
        const names = ["Spring", "Summer", "Autumn", "Winter"];
        return names[Math.floor(((day || 1) - 1) / SEASON_LENGTH_DAYS) % 4];
    }

    // Tiny deterministic hash (mulberry32-style) — no external deps, same
    // (day, seed) always yields the same weather.
    function seededWeatherIndex(day, seed, poolLength) {
        let h = (Math.imul(day + 1, 2654435761) ^ Math.imul(seed + 1, 0x9E3779B1)) >>> 0;
        h ^= h >>> 15; h = Math.imul(h, 0x85EBCA6B);
        h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35);
        h ^= h >>> 16;
        // FIX: Math.imul returns a SIGNED 32-bit int, so h can go negative
        // here — and JS's % preserves the dividend's sign, so a negative h
        // produced a negative array index, making pool[index] undefined and
        // crashing the very next line (profile.tint on undefined). This was
        // the exact "Cannot read properties of undefined (reading 'tint')"
        // crash. >>> 0 forces h back to unsigned before the modulo.
        return (h >>> 0) % poolLength;
    }

    function weatherForDay(day) {
        const seed = (typeof window.__survivalWeatherSeed === "number") ? window.__survivalWeatherSeed : 0;
        const pool = (seasonForDayLocal(day) === "Winter") ? WINTER_WEATHER_PROFILES : WEATHER_PROFILES;
        return pool[seededWeatherIndex(day || 1, seed, pool.length)] || WEATHER_PROFILES[0]; // fallback: Clear
    }

    // Rain particles are simple screen-space falling streaks, regenerated
    // whenever intensity/canvas size changes and advanced every draw call.
    let rainParticles = [];
    let rainCanvasKey = "";
    function ensureRainParticles(intensity, w, h) {
        const key = `${Math.round(intensity * 100)}:${w}:${h}`;
        if (key === rainCanvasKey) return;
        rainCanvasKey = key;
        const count = Math.round(intensity * 220);
        rainParticles = [];
        for (let i = 0; i < count; i++) {
            rainParticles.push({
                x: Math.random() * w,
                y: Math.random() * h,
                len: 10 + Math.random() * 14,
                speed: 7 + Math.random() * 6
            });
        }
    }

    // Snow drifts slowly with a gentle horizontal sway instead of falling
    // in straight diagonal streaks like rain — visually distinct enough at
    // a glance that you never mistake a blizzard for a downpour.
    let snowParticles = [];
    let snowCanvasKey = "";
    function ensureSnowParticles(intensity, w, h) {
        const key = `${Math.round(intensity * 100)}:${w}:${h}`;
        if (key === snowCanvasKey) return;
        snowCanvasKey = key;
        const count = Math.round(intensity * 160);
        snowParticles = [];
        for (let i = 0; i < count; i++) {
            snowParticles.push({
                x: Math.random() * w,
                y: Math.random() * h,
                r: 1.5 + Math.random() * 2.5,
                speed: 1.2 + Math.random() * 1.8,
                sway: Math.random() * Math.PI * 2,
                swaySpeed: 0.02 + Math.random() * 0.03
            });
        }
    }

    function drawSurvivalWeather(ctx) {
        if (!window.__IS_SURVIVAL_BATTLE__ || !window.__survivalDay) return;
        const profile = weatherForDay(window.__survivalDay);
        if (!profile.tint && !profile.rain && !profile.snow) return;

        const canvas = document.getElementById("gameCanvas");
        if (!canvas) return;
        const w = canvas.width, h = canvas.height;

        // Screen-space: reset the transform so this covers the actual visible
        // viewport regardless of camera pan/zoom, matching how the rest of
        // this file draws in world space via ctx.translate per-structure.
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        if (profile.tint) {
            ctx.fillStyle = profile.tint;
            ctx.fillRect(0, 0, w, h);
        }

        if (profile.rain > 0) {
            ensureRainParticles(profile.rain, w, h);
            ctx.strokeStyle = `rgba(200,215,230,${0.25 + profile.rain * 0.25})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            rainParticles.forEach(p => {
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - 3, p.y + p.len);
                p.y += p.speed;
                p.x -= 1.2;
                if (p.y > h) { p.y = -p.len; p.x = Math.random() * w; }
                if (p.x < -10) p.x = w + 10;
            });
            ctx.stroke();
        }

        if (profile.snow > 0) {
            ensureSnowParticles(profile.snow, w, h);
            ctx.fillStyle = `rgba(255,255,255,${0.5 + profile.snow * 0.35})`;
            snowParticles.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
                p.sway += p.swaySpeed;
                p.x += Math.sin(p.sway) * 0.6;
                p.y += p.speed;
                if (p.y > h) { p.y = -p.r; p.x = Math.random() * w; }
                if (p.x < -5) p.x = w + 5;
                if (p.x > w + 5) p.x = -5;
            });
        }

        ctx.restore();
    }

    // ========================================================================
    // NIGHT RAID VISUALS — tent silhouettes (world-space, under units) and a
    // dark tint + vignette (screen-space, on top of everything). Loosely
    // inspired by camp_system.js's dusk/lantern lighting language, but a
    // self-contained, much simpler version — this is a quick battlefield
    // event, not the full standalone encampment scene that file renders.
    // Both gated entirely on window.__IS_NIGHT_RAID__, set only by
    // survival_mode.js's triggerNightRaid/afterNightRaidGenerate.
    // ========================================================================
    function drawNightRaidTents(ctx) {
        if (!window.__IS_NIGHT_RAID__ || !Array.isArray(window.__nightRaidTents)) return;
        const now = Date.now();
        window.__nightRaidTents.forEach(t => {
            const hpPct = (t.maxHp > 0) ? Math.max(0, t.hp / t.maxHp) : 1;
            const destroyed = t.hp <= 0;
            const onFire = !destroyed && t.fireFlashUntil && now < t.fireFlashUntil;

            ctx.save();
            ctx.translate(t.x, t.y);

            // Lantern glow underneath — dims as the tent takes damage, gone
            // entirely once destroyed (nothing left to light).
            if (!destroyed) {
                const glow = ctx.createRadialGradient(0, -8, 0, 0, -8, 46);
                glow.addColorStop(0, `rgba(255,190,80,${0.35 * hpPct})`);
                glow.addColorStop(1, "rgba(255,140,0,0)");
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(0, -8, 46, 0, Math.PI * 2);
                ctx.fill();
            }

            // Tent body — darkens/scorches proportional to accumulated
            // damage; a fully destroyed tent is a flat charred husk.
            const scorch = 1 - hpPct; // 0 = pristine, 1 = fully charred
            const bodyCol = destroyed ? "#1a1512" : lerpColor("#2a2016", "#0d0908", scorch);
            ctx.fillStyle = bodyCol;
            ctx.beginPath();
            if (destroyed) {
                // Collapsed husk — low, flattened silhouette instead of the
                // standing A-frame, reads clearly as "burnt out" at a glance.
                ctx.moveTo(-14, 6); ctx.lineTo(-6, -4); ctx.lineTo(8, -2); ctx.lineTo(14, 6);
            } else {
                ctx.moveTo(-14, 6); ctx.lineTo(0, -20); ctx.lineTo(14, 6);
            }
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = destroyed ? "#000" : "#4a3520";
            ctx.lineWidth = 1;
            ctx.stroke();

            // Entrance flap glow — only on a tent still standing and not
            // actively on fire (the flame animation below replaces it).
            if (!destroyed && !onFire) {
                ctx.fillStyle = `rgba(255,180,80,${0.5 * hpPct})`;
                ctx.beginPath();
                ctx.moveTo(-3, 6); ctx.lineTo(0, -6); ctx.lineTo(3, 6);
                ctx.closePath();
                ctx.fill();
            }

            // Active flame animation — plays for TENT_FIRE_FLASH_MS after an
            // ignition event, simple flicker built from a couple of
            // overlapping triangles rather than a full particle system.
            if (onFire) {
                const flicker = Math.sin(now * 0.02) * 2;
                const flicker2 = Math.cos(now * 0.017) * 2;
                ctx.fillStyle = "#e05c00";
                ctx.beginPath();
                ctx.moveTo(-6, 4); ctx.quadraticCurveTo(-3 + flicker, -14, 0, -22); ctx.quadraticCurveTo(3 - flicker, -12, 6, 4);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = "#ffbb00";
                ctx.beginPath();
                ctx.moveTo(-3, 3); ctx.quadraticCurveTo(-1 + flicker2, -8, 0, -14); ctx.quadraticCurveTo(1 - flicker2, -7, 3, 3);
                ctx.closePath(); ctx.fill();

                // Rising smoke for a few embers
                ctx.fillStyle = "rgba(80,80,80,0.35)";
                for (let i = 0; i < 3; i++) {
                    const st = ((now / 900) + i * 0.33) % 1;
                    ctx.beginPath();
                    ctx.arc((i - 1) * 4, -20 - st * 30, 2 + st * 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            ctx.restore();
        });
    }

    // Tiny hex-color lerp helper for the scorch effect above — self-
    // contained rather than reusing another file's color-math helper.
    function lerpColor(a, b, t) {
        const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
        const ar = (pa >> 16) & 0xff, ag = (pa >> 8) & 0xff, ab = pa & 0xff;
        const br = (pb >> 16) & 0xff, bg = (pb >> 8) & 0xff, bb = pb & 0xff;
        const rr = Math.round(ar + (br - ar) * t), rg = Math.round(ag + (bg - ag) * t), rb = Math.round(ab + (bb - ab) * t);
        return `rgb(${rr},${rg},${rb})`;
    }

    function drawNightRaidOverlay(ctx) {
        if (!window.__IS_NIGHT_RAID__) return;
        const canvas = document.getElementById("gameCanvas");
        if (!canvas) return;
        const w = canvas.width, h = canvas.height;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        ctx.fillStyle = "rgba(5,8,25,0.42)";
        ctx.fillRect(0, 0, w, h);

        const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
        vg.addColorStop(0, "rgba(0,0,0,0)");
        vg.addColorStop(1, "rgba(0,0,0,0.45)");
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, w, h);

        ctx.restore();
    }

    window.SurvivalStructures = {
        resetAll: function () {
            window.survivalStructures = [];
            cancelPlacement();
        },
        list: function () { return window.survivalStructures; },
        applyStructureCollisions: applyStructureCollisions,
        // SURGERY: lets other input-handling files (battlefield_commands.js's
        // unit-selection/move-order listeners) check "is the player currently
        // placing a structure?" and bail out, instead of also acting on the
        // same click — see the mousedown handler above for the actual bug
        // this fixes.
        isBuilding: function () { return !!buildMode.active; },
        // Lets survivalMode.js force-cancel any in-progress ghost placement
        // — used when the player clicks Begin Wave, so no stuck build UI
        // survives into the actual battle.
        cancelBuildMode: function () { if (buildMode.active) cancelPlacement(); },
        // Lets survivalMode.js check today's weather (e.g. to zero gunpowder
        // units' ammo on a rainy day) without duplicating the seeded-hash
        // weather logic in another file.
        getWeather: function () { return weatherForDay(window.__survivalDay || 1); }
    };

    // ------------------------------------------------------------------
    // BOOTSTRAP — install the render hook and input handlers once the
    // canvas exists, and start the polling loops. Safe to run at script
    // load; everything above gates on window.__IS_SURVIVAL_BATTLE__ /
    // __preDeploymentActive so nothing fires outside a Survival run.
    // ------------------------------------------------------------------
    function bootstrap() {
        installRenderHook();
        installInputHandlers();
        if (!tickInterval) tickInterval = setInterval(tick, 200);
        if (!uiPollInterval) startUiPoll();
    }

    // The canvas/drawBattleUnits may not exist yet at script-load time
    // (this file can load before the first battle starts), so retry a
    // few times rather than failing silently once.
    let bootAttempts = 0;
    const bootTimer = setInterval(() => {
        bootAttempts++;
        const ready = document.getElementById("gameCanvas") && typeof window.drawBattleUnits === "function";
        if (ready) {
            bootstrap();
            clearInterval(bootTimer);
        } else if (bootAttempts > 150) { // ~30s at 200ms — give up quietly
            clearInterval(bootTimer);
        }
    }, 200);

})();


// survival-day-transition.js
// ============================================================================
// Mini loading screen shown between survival-mode days. Fades IN the instant
// "Begin Day N" is clicked (see launchSurvivalDay in survival_mode.js), stays
// up while the battlefield terrain generates, and fades OUT right before the
// predeployment banner appears (see afterSurvivalGenerate).
//
// Deliberately mirrors menu/loading-screen.js's mechanics and cosmetics
// (same dark background, Georgia serif, gold header, portrait + stats-grid
// layout, same drawCavalryUnit/drawInfantryUnit render path) rather than
// reusing that file directly — loading-screen.js's showLoadingScreen/
// hideLoadingScreen are wired to window.getEncyclopediaData() for other
// call sites elsewhere in the app; hijacking those globals here risks
// clobbering whatever else already calls them. This is its own small,
// self-contained sibling instead, wired to the player's own surviving
// roster rather than the full encyclopedia.
// ============================================================================
(function () {
    if (window.__survivalDayTransitionInstalled) return;
    window.__survivalDayTransitionInstalled = true;

    const STAT_ORDER = [
        "weightClass", "isRanged", "ammo", "health", "meleeAttack", "meleeDefense",
        "missileBaseDamage", "missileAPDamage", "accuracy", "armor", "bonusVsLarge", "speed", "range", "morale", "cost"
    ];
    const STAT_LABELS = {
        weightClass: "Weight", isRanged: "Ranged", ammo: "Ammo", health: "Health",
        meleeAttack: "Melee Atk", meleeDefense: "Melee Def", missileBaseDamage: "Missile Dmg",
        missileAPDamage: "AP Dmg", accuracy: "Accuracy", armor: "Armor", bonusVsLarge: "Bonus vs Large",
        speed: "Moving Speed", range: "Effective Range (m)", morale: "Morale", cost: "Cost"
    };

    const FADE_MS = 380;

    function create(tag, style) {
        const el = document.createElement(tag);
        if (style) Object.assign(el.style, style);
        return el;
    }

    // FIX: weightClass isn't a string/number — it's one of the {tier,mass,
    // radius} objects from WEIGHT_CLASSES in troop_system.js. Falling
    // through to String(value) rendered the literal text "[object Object]"
    // as the Weight row. Reverse-lookup the object identity against
    // WEIGHT_CLASSES to recover its real name (LIGHT_INF -> "Light
    // Infantry", etc.) instead.
    const WEIGHT_CLASS_LABELS = {
        LIGHT_INF: "Light Infantry",
        HEAVY_INF: "Heavy Infantry",
        CAV: "Cavalry",
        HEAVY_CAV: "Heavy Cavalry",
        ELEPHANT: "Elephant"
    };
    function weightClassLabel(value) {
        if (!value || typeof value !== "object" || typeof WEIGHT_CLASSES === "undefined") return null;
        for (const k of Object.keys(WEIGHT_CLASSES)) {
            if (WEIGHT_CLASSES[k] === value) return WEIGHT_CLASS_LABELS[k] || k;
        }
        return null;
    }

    function prettyValue(key, value) {
        if (value === true) return "Yes";
        if (value === false) return "No";
        if (value === null || typeof value === "undefined") return "—";
        if (key === "weightClass") return weightClassLabel(value) || "—";
        if (typeof value === "number") {
            if (key === "range") return String(Math.round(value / 5) * 5);
            return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "");
        }
        if (typeof value === "object") return "—"; // never render "[object Object]" for anything unexpected
        return String(value);
    }

    // Same visual-spec resolution loading-screen.js uses, so a soldier looks
    // identical here as it does on the encyclopedia loading screen.
    function resolvePreviewSpec(name, template) {
        const lower = (name || "").trim().toLowerCase();
        const ammo = (template && template.ammo) || 0;
        if (lower === "bomb") return { mode: "infantry", type: "bomb", ammo, zoom: 2.2, xBias: 0.5, yBias: 0.75 };
        if (lower.includes("rocket") || lower.includes("hwacha")) return { mode: "infantry", type: "rocket", ammo, zoom: 2.0, xBias: 0.5, yBias: 0.75 };
        if (lower.includes("firelance")) return { mode: "infantry", type: "firelance", ammo, zoom: 2.0, xBias: 0.5, yBias: 0.75 };
        if (lower === "glaiveman" || lower.includes("glaive")) return { mode: "infantry", type: "spearman", ammo, zoom: 2.0, xBias: 0.5, yBias: 0.75 };
        if (lower.includes("repeater crossbowman")) return { mode: "infantry", type: "crossbow", ammo, zoom: 2.0, xBias: 0.5, yBias: 0.75 };
        if (lower.includes("crossbowman")) return { mode: "infantry", type: "crossbow", ammo, zoom: 2.0, xBias: 0.5, yBias: 0.75 };
        if (lower.includes("hand cannoneer")) return { mode: "infantry", type: "gun", ammo, zoom: 2.0, xBias: 0.5, yBias: 0.75 };
        if (lower.includes("slinger") || lower.includes("javelinier")) return { mode: "infantry", type: "throwing", ammo, zoom: 2.0, xBias: 0.5, yBias: 0.75 };
        if (lower.includes("archer") && !lower.includes("horse")) return { mode: "infantry", type: "archer", ammo, zoom: 2.0, xBias: 0.5, yBias: 0.75 };
        if (lower.includes("shielded infantry")) return { mode: "infantry", type: "sword_shield", ammo, zoom: 2.0, xBias: 0.5, yBias: 0.75 };
        if (lower.includes("two handed")) return { mode: "infantry", type: "two_handed", ammo, zoom: 2.0, xBias: 0.5, yBias: 0.75 };
        if (lower.includes("spearman")) return { mode: "infantry", type: "spearman", ammo, zoom: 2.0, xBias: 0.5, yBias: 0.75 };
        if (lower === "militia") return { mode: "infantry", type: "peasant", ammo, zoom: 2.0, xBias: 0.5, yBias: 0.75 };
        if (lower === "cannon") return { mode: "cavalry", type: "camel_cannon", ammo, zoom: 1.6, xBias: 0.5, yBias: 0.75 };
        if (lower.includes("elephant")) return { mode: "cavalry", type: "elephant", ammo, zoom: 1.3, xBias: 0.5, yBias: 0.75 };
        if (lower.includes("keshig") || lower.includes("horse archer")) return { mode: "cavalry", type: "horse_archer", ammo, zoom: 1.6, xBias: 0.5, yBias: 0.75 };
        if (lower.includes("lancer")) return { mode: "cavalry", type: "lancer", ammo, zoom: 1.6, xBias: 0.5, yBias: 0.75 };
        return {
            mode: template && template.mounted ? "cavalry" : "infantry",
            type: (template && template.renderType) || (template && template.mounted ? "lancer" : "peasant"),
            ammo, zoom: template && template.mounted ? 1.6 : 2.0, xBias: 0.5, yBias: 0.75
        };
    }

    function renderPortrait(canvas, name, template, color) {
        if (!canvas || !template) return;
        const ctx = canvas.getContext("2d");
        const cssW = canvas.clientWidth || 400;
        const cssH = canvas.clientHeight || 400;
        const dpr = window.devicePixelRatio || 1;

        canvas.width = Math.max(1, Math.floor(cssW * dpr));
        canvas.height = Math.max(1, Math.floor(cssH * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);

        const spec = resolvePreviewSpec(name, template);
        const baseX = cssW * spec.xBias;
        const baseY = cssH * spec.yBias;

        ctx.save();
        ctx.translate(baseX, baseY);
        ctx.scale(spec.zoom, spec.zoom);
        try {
            if (spec.mode === "cavalry" && typeof drawCavalryUnit === "function") {
                drawCavalryUnit(ctx, 0, 0, false, 0, color, false, spec.type, "player", name, false, 0, spec.ammo, { id: name, lastAttackTime: 0, stats: template.stats || template || {} }, 0);
            } else if (typeof drawInfantryUnit === "function") {
                drawInfantryUnit(ctx, 0, 0, false, 0, color, spec.type, false, "player", name, false, 0, spec.ammo, { id: name, lastAttackTime: 0, stats: template.stats || template || {} }, 0);
            }
        } catch (err) {
            console.warn("Survival day-transition portrait render failed:", err);
        }
        ctx.restore();
    }

    function build() {
        const existing = document.getElementById("survival-transition-wrapper");
        if (existing) return existing;

        const wrapper = create("div", {
            position: "fixed", top: "0", left: "0", width: "100%", height: "100vh",
            display: "none", flexDirection: "column", alignItems: "center",
            justifyContent: "flex-start", paddingTop: "5vh",
            // SURGERY: was 10000 — below survival_mode.js's day-prep overlay
            // (z-index 99990), so this transition would render UNDERNEATH
            // the day-prep menu instead of covering it during the
            // return-to-menu fade. Bumped above both that and the resource
            // HUD (99970).
            background: "#0c0a0a", zIndex: "99995", color: "#fff",
            fontFamily: "Georgia, serif", overflow: "hidden",
            opacity: "0", transition: `opacity ${FADE_MS}ms ease`
        });
        wrapper.id = "survival-transition-wrapper";

        const header = create("div", {
            fontSize: "clamp(1.5rem, 6vw, 1.8rem)", fontWeight: "700", color: "#f5d76e",
            letterSpacing: "8px", marginBottom: "4px",
            textShadow: "0 0 15px rgba(245, 215, 110, 0.4)", textAlign: "center"
        });
        header.id = "svt-header";

        const subheader = create("div", {
            fontSize: "clamp(0.75rem, 3vw, 0.9rem)", color: "#a1887f",
            letterSpacing: "3px", marginBottom: "8px", textAlign: "center", fontStyle: "italic"
        });
        subheader.id = "svt-subheader";
        subheader.textContent = "Holding the line...";

        const content = create("div", {
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: "10px",
            width: "clamp(300px, 90vw, 600px)"
        });

        const canvasContainer = create("div", {
            width: "100%", height: "clamp(180px, 35vh, 320px)",
            display: "flex", justifyContent: "center", alignItems: "center",
            marginBottom: "10px", flexShrink: "0", position: "relative"
        });
        const canvas = create("canvas", { width: "100%", height: "100%", display: "block" });
        canvasContainer.appendChild(canvas);

        const infoPanel = create("div", { width: "100%", textAlign: "center" });
        const unitName = create("div", { fontSize: "clamp(1.2rem, 5vw, 1.5rem)", color: "#fff", borderBottom: "1px solid #7b1a1a", paddingBottom: "4px", marginBottom: "6px" });
        const unitDesc = create("div", { fontSize: "clamp(0.75rem, 3vw, 0.85rem)", color: "#d4b886", fontStyle: "italic", marginBottom: "10px" });
        const statsGrid = create("div", { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" });

        infoPanel.appendChild(unitName);
        infoPanel.appendChild(unitDesc);
        infoPanel.appendChild(statsGrid);

        content.appendChild(canvasContainer);
        content.appendChild(infoPanel);

        wrapper.appendChild(header);
        wrapper.appendChild(subheader);
        wrapper.appendChild(content);
        document.body.appendChild(wrapper);

        let hideTimer = null;

        window.showSurvivalDayTransition = function (dayNumber, roster, color) {
            if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

            header.textContent = `DAY ${dayNumber || "?"}`;
            const flavorLines = [
                "Sharpening blades before the next assault...",
                "Scouts report movement on the horizon...",
                "The camp readies itself for another day...",
                "Reinforcing the line before dawn..."
            ];
            subheader.textContent = flavorLines[Math.floor(Math.random() * flavorLines.length)];

            // Pick a random FIGHTABLE soldier from the player's own surviving
            // roster (not the full encyclopedia) — anyone still healing sits
            // this preview out too, same as they sit the battle out.
            const pool = (Array.isArray(roster) ? roster : []).filter(e => !e.healDaysLeft || e.healDaysLeft <= 0);
            const entry = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
            const template = entry && window.UnitRoster && window.UnitRoster.allUnits
                ? window.UnitRoster.allUnits[entry.type] : null;

            wrapper.style.display = "flex";
            // SURGERY: the initial reveal must be INSTANT, not eased in.
            // Combined with launchSurvivalDay's canvas.style.display="none"
            // (belt and suspenders), this guarantees there is no possible
            // frame where the overlay is still partially transparent while
            // terrain generation is happening underneath — which is exactly
            // what caused the reported "flash of the map mid-load." The
            // fade stays dramatic on the way OUT (see hideSurvivalDayTransition)
            // since by then the battle is already fully ready to reveal.
            wrapper.style.transition = "none";
            void wrapper.offsetWidth; // force the display:flex + no-transition to land first
            wrapper.style.opacity = "1";
            void wrapper.offsetWidth; // and force THAT to land before transitions come back
            wrapper.style.transition = `opacity ${FADE_MS}ms ease`;

            if (entry && template) {
                unitName.textContent = `${template.name || entry.type}${entry.experienceLevel > 1 ? ` — Lv ${entry.experienceLevel}` : ""}`;
                unitDesc.textContent = template.desc ? `"${template.desc}"` : "";

                statsGrid.innerHTML = "";
                const stats = template.stats || template || {};
                for (const key of STAT_ORDER) {
                    if (!(key in stats)) continue;
                    statsGrid.innerHTML += `
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.1); padding:3px 0; font-size:clamp(0.7rem, 2.5vw, 0.8rem);">
                            <span style="color:#d4b886;">${STAT_LABELS[key]}</span>
                            <span style="color:#fff;">${prettyValue(key, stats[key])}</span>
                        </div>`;
                }
                setTimeout(() => renderPortrait(canvas, entry.type, template, color || "#d32f2f"), 50);
            } else {
                // No fightable troops left to preview (down to just the
                // commander) — keep the transition simple rather than blank.
                unitName.textContent = "The Last Stand";
                unitDesc.textContent = "Only the commander remains to hold the line.";
                statsGrid.innerHTML = "";
                const ctx = canvas.getContext("2d");
                if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        };

        window.hideSurvivalDayTransition = function () {
            wrapper.style.opacity = "0";
            hideTimer = setTimeout(() => {
                wrapper.style.display = "none";
                hideTimer = null;
            }, FADE_MS);
        };

        return wrapper;
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", build);
    } else {
        build();
    }
})();