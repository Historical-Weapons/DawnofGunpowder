// =============================================================================
// NAVAL EXPLORATION — MENU INTEGRATION
// -----------------------------------------------------------------------------
// REPLACES naval_escort_menu.js. Wires window.NavalExplorationMode
// (naval_exploration.js) into the main menu the same way survivalMode.js and
// custom_battle_gui.js wire up their own modes. menu.js's navalEscortBtn
// (revealed on the main menu right after "Manual" is clicked, alongside
// Custom Battle / Survival / Campaign) calls window.showNavalExplorationSetupMenu()
// — this file owns everything downstream of that: faction-select screen,
// launch bootstrap, in-session exit control, and the post-voyage results screen.
//
// Load AFTER: naval_exploration.js, naval_battles.js, battlefield_launch.js,
// custom_battle_gui.js.
// =============================================================================
(function () {
    'use strict';

    function _styleBtn(btn) {
        btn.style.background = "linear-gradient(to bottom, #7b1a1a, #4a0a0a)";
        btn.style.color = "#f5d76e";
        btn.style.border = "2px solid #d4b886";
        btn.style.padding = "12px 28px";
        btn.style.margin = "8px";
        btn.style.fontFamily = "Georgia, serif";
        btn.style.fontSize = "1.05rem";
        btn.style.fontWeight = "bold";
        btn.style.cursor = "pointer";
        btn.style.borderRadius = "4px";
        btn.style.textTransform = "uppercase";
        btn.style.boxShadow = "0 4px 6px rgba(0,0,0,0.5)";
        btn.onmouseenter = function () { btn.style.background = "linear-gradient(to bottom, #b71c1c, #7b1a1a)"; btn.style.color = "#fff"; };
        btn.onmouseleave = function () { btn.style.background = "linear-gradient(to bottom, #7b1a1a, #4a0a0a)"; btn.style.color = "#f5d76e"; };
    }
    function _makeBtn(text, onClick) {
        const b = document.createElement("button");
        b.innerText = text;
        _styleBtn(b);
        b.onclick = onClick;
        return b;
    }
    function _select(labelText, options, defaultValue) {
        const wrap = document.createElement("div");
        wrap.style.margin = "12px";
        wrap.style.display = "inline-block";
        wrap.style.textAlign = "left";
        const label = document.createElement("label");
        label.innerText = labelText;
        label.style.display = "block";
        label.style.color = "#a1887f";
        label.style.fontSize = "12px";
        label.style.textTransform = "uppercase";
        label.style.marginBottom = "4px";
        const sel = document.createElement("select");
        sel.style.background = "#3e2723";
        sel.style.color = "#fff";
        sel.style.border = "1px solid #d4b886";
        sel.style.padding = "6px";
        sel.style.fontFamily = "Georgia, serif";
        sel.style.minWidth = "220px";
        options.forEach(function (opt) {
            const o = document.createElement("option");
            o.value = opt.value; o.innerText = opt.label;
            if (opt.value === defaultValue) o.selected = true;
            sel.appendChild(o);
        });
        wrap.appendChild(label); wrap.appendChild(sel);
        return { wrap: wrap, sel: sel };
    }

    // =========================================================================
    // SETUP SCREEN — faction pick is the only real decision; everything else
    // (the island world, hostile raiders, wind/oar balance) is generated fresh
    // every voyage.
    // =========================================================================
    window.showNavalExplorationSetupMenu = function () {
        const existing = document.getElementById("naval-exploration-menu");
        if (existing) existing.remove();

        window.isPaused = true;
        if (typeof closeParleUI === 'function') closeParleUI();

        const container = document.createElement("div");
        container.id = "naval-exploration-menu";
        container.style.position = "fixed";
        container.style.top = "0"; container.style.left = "0";
        container.style.width = "100%"; container.style.height = "100%";
        container.style.background = "#0e3a5c";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.alignItems = "center";
        container.style.justifyContent = "center";
        container.style.zIndex = "11000";
        container.style.fontFamily = "Georgia, serif";
        container.style.color = "#e0e0e0";
        container.style.textAlign = "center";

        const title = document.createElement("h1");
        title.innerText = "🗺️ NAVAL EXPLORATION";
        title.style.color = "#f5d76e";
        title.style.letterSpacing = "3px";
        title.style.textShadow = "0 0 20px rgba(212,184,134,0.8)";

        const subtitle = document.createElement("p");
        subtitle.innerText = "Sail alone into open water. Islands and raiders appear as you go — nothing is drawn until you're close, and the sea forgets what's far behind you.";
        subtitle.style.maxWidth = "480px";
        subtitle.style.color = "#c8b088";
        subtitle.style.fontSize = "0.95rem";
        subtitle.style.margin = "0 0 20px 0";

        const factions = (window.NavalExplorationMode && window.NavalExplorationMode.FACTIONS && window.NavalExplorationMode.FACTIONS.length)
            ? window.NavalExplorationMode.FACTIONS
            : ["Tran Realm", "Dab Tribes", "Great Khaganate", "Yamato Clans", "Xiaran Dominion", "Hong Dynasty", "Jinlord Confederacy", "Goryun Kingdom"];
        const factionOpts = factions.map(function (f) { return { value: f, label: f }; });
        const factionPick = _select("Sail Under Which Banner", factionOpts, factions[0]);

        const errorEl = document.createElement("div");
        errorEl.style.color = "#ff5252";
        errorEl.style.minHeight = "20px";
        errorEl.style.margin = "6px 0";

        const controlsHint = document.createElement("p");
        controlsHint.innerText = "Row with the helm joystick / IJKL. Sail trims itself to the wind. Press E (or the on-screen prompt) to anchor near land or step ashore. Press P to turn back for port at any time.";
        controlsHint.style.maxWidth = "440px";
        controlsHint.style.color = "#8fa3b0";
        controlsHint.style.fontSize = "0.8rem";
        controlsHint.style.margin = "4px 0 0 0";

        const btnRow = document.createElement("div");
        btnRow.style.marginTop = "18px";

        const backBtn = _makeBtn("🔙 Back", function () {
            container.remove();
            window.isPaused = false;
            const mainMenu = document.getElementById("main-menu");
            const mmUi = document.getElementById("main-menu-ui-container");
            if (mainMenu) mainMenu.style.display = "flex";
            if (mmUi) mmUi.style.display = "flex";
        });

        const sailBtn = _makeBtn("⛵ Set Sail", function () {
            if (typeof window.NavalExplorationMode === "undefined") {
                errorEl.innerText = "Naval Exploration module not loaded!";
                return;
            }
            const opts = { faction: factionPick.sel.value, canvasId: "gameCanvas" };
            container.remove();
            _launchExploration(opts);
        });

        btnRow.appendChild(backBtn);
        btnRow.appendChild(sailBtn);

        container.appendChild(title);
        container.appendChild(subtitle);
        container.appendChild(factionPick.wrap);
        container.appendChild(errorEl);
        container.appendChild(btnRow);
        container.appendChild(controlsHint);
        document.body.appendChild(container);
    };

    function _forceHide(el) {
        if (el) el.style.setProperty('display', 'none', 'important');
    }

    // =========================================================================
    // LAUNCH — same bootstrap-from-main-menu pattern naval_escort_menu.js used
    // (this mode is entered straight from the main menu, not through
    // custom_battle_gui.js's own launchCustomBattle()).
    // =========================================================================
    function _launchExploration(opts) {
        _forceHide(document.getElementById("main-menu"));
        _forceHide(document.getElementById("ui"));
        _forceHide(document.getElementById("diplomacy-container"));
        _forceHide(document.getElementById("pc-detail-btn"));
        _forceHide(document.getElementById("mob-detail-btn"));

        if (typeof window.player === "undefined" || !window.player) {
            window.player = {
                x: 0, y: 0, hp: 150, maxHealth: 150,
                baseSpeed: 23, speed: 23,
                faction: opts.faction,
                state: "idle", frame: 0, direction: 1, isMoving: false,
                stunTimer: 0, onWall: false, roster: []
            };
        }

        window.NavalExplorationMode.start(opts);
        _showVoyageHUD();
    }

    // Small always-on-top "Return to Port" control — naval_exploration.js's own
    // HUD (its distance/faction readout + the anchor/disembark prompt) has no
    // way to exit early otherwise. Matches naval_escort_menu.js's identical
    // Abandon Voyage button in position/style.
    function _showVoyageHUD() {
        const existing = document.getElementById("naval-exploration-exit-btn");
        if (existing) existing.remove();
        const btn = document.createElement("button");
        btn.id = "naval-exploration-exit-btn";
        btn.innerText = "✕ Return to Port";
        btn.style.position = "fixed";
        btn.style.top = "12px";
        btn.style.left = "12px";
        btn.style.zIndex = "11500";
        btn.style.background = "rgba(20,12,4,0.8)";
        btn.style.color = "#f0d9a8";
        btn.style.border = "1px solid #d4b886";
        btn.style.borderRadius = "4px";
        btn.style.padding = "8px 14px";
        btn.style.fontFamily = "Arial, sans-serif";
        btn.style.fontSize = "12px";
        btn.style.cursor = "pointer";
        btn.onclick = function () {
            // Shared with the 'P' key (naval_exploration.js) so there's one
            // confirmation flow, not two that could drift apart.
            if (window.NavalExplorationMode && window.NavalExplorationMode.confirmReturnToPort) {
                window.NavalExplorationMode.confirmReturnToPort();
            }
        };
        document.body.appendChild(btn);
    }

    // =========================================================================
    // QUARTERMASTER — the only thing salvage is actually for. No second party
    // to trade with out on open water, so this spends loot on your own ship/
    // crew rather than bartering with anyone. Reachable only while anchored;
    // naval_exploration.js's HUD shows/hides the 🎒 button that opens this and
    // does the actual cost/effect logic — this is purely the panel.
    // =========================================================================
    window.showNavalQuartermaster = function () {
        const existing = document.getElementById("naval-quartermaster-menu");
        if (existing) existing.remove();
        const NEM = window.NavalExplorationMode;
        if (!NEM || !NEM.isActive || !NEM.isActive()) return;

        const st = NEM.getState();
        const costs = NEM.quartermasterCosts || { repair: 3, recruit: 5 };

        const modalBg = document.createElement("div");
        modalBg.id = "naval-quartermaster-menu";
        modalBg.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;" +
            "background:rgba(0,0,0,0.75);display:flex;justify-content:center;align-items:center;" +
            "z-index:12000;font-family:Georgia,serif;";

        const box = document.createElement("div");
        box.style.cssText = "background:#241a12;border:2px solid #d4b886;padding:28px 32px;" +
            "text-align:center;width:min(420px,90vw);box-sizing:border-box;color:#e0e0e0;";

        const invLines = Object.keys(st.inventory).length
            ? Object.keys(st.inventory).map(function (k) { return st.inventory[k] + "x " + k; }).join("<br>")
            : "Empty hold.";

        box.innerHTML =
            '<h2 style="color:#f5d76e;letter-spacing:2px;margin-top:0;">🎒 Quartermaster</h2>' +
            '<div style="color:#a1887f;font-size:12px;text-transform:uppercase;margin-bottom:6px;">Cargo Hold (' + st.totalLoot + ' total)</div>' +
            '<div style="font-size:14px;line-height:1.6;margin-bottom:18px;">' + invLines + '</div>' +
            '<hr style="border-color:#5d4037;margin:14px 0;">';

        const repairBtn = _makeBtn("⚕️ Repair & Resupply — " + costs.repair, function () {
            NEM.repairShip();
            modalBg.remove();
            window.showNavalQuartermaster();
        });
        const recruitBtn = _makeBtn("⚔️ Recruit Crew — " + costs.recruit, function () {
            NEM.recruitCrew();
            modalBg.remove();
            window.showNavalQuartermaster();
        });
        const closeBtn = _makeBtn("Close", function () { modalBg.remove(); });

        box.appendChild(repairBtn);
        box.appendChild(document.createElement("br"));
        box.appendChild(recruitBtn);
        box.appendChild(document.createElement("br"));
        box.appendChild(closeBtn);
        modalBg.appendChild(box);
        document.body.appendChild(modalBg);
    };

    // =========================================================================
    // RESULTS SCREEN — voluntary end only now (Return to Port / P / this
    // button); crew death goes through the game's own real death screen
    // (window.triggerPermadeath(), see naval_exploration.js's _triggerDeath())
    // instead of this event, so there is no "Victory" vs "defeat" branch here
    // anymore — every voyage that reaches this screen ended the same way, by
    // choice.
    // =========================================================================
    window.addEventListener('navalExplorationComplete', function (e) {
        const d = e.detail || {};
        const exitBtn = document.getElementById("naval-exploration-exit-btn");
        if (exitBtn) exitBtn.remove();

        const modalBg = document.createElement("div");
        modalBg.style.position = "fixed";
        modalBg.style.top = "0"; modalBg.style.left = "0";
        modalBg.style.width = "100%"; modalBg.style.height = "100%";
        modalBg.style.background = "rgba(0,0,0,0.85)";
        modalBg.style.display = "flex";
        modalBg.style.justifyContent = "center";
        modalBg.style.alignItems = "center";
        modalBg.style.zIndex = "12500";
        modalBg.style.fontFamily = "Georgia, serif";

        const box = document.createElement("div");
        box.style.background = "#2b2b2b";
        box.style.border = "2px solid #d4b886";
        box.style.padding = "40px";
        box.style.textAlign = "center";
        box.style.width = "min(500px, 90vw)";
        box.style.boxSizing = "border-box";

        box.innerHTML =
            '<h1 style="color:#f5d76e; letter-spacing:2px; margin-top:0;">Voyage\'s End</h1>' +
            '<hr style="border-color:#5d4037; margin:20px 0;">' +
            '<div style="text-align:left; color:#e0e0e0; font-size:16px; line-height:1.8;">' +
                'Sailing under: <span style="color:#f5d76e;">' + (d.faction || '—') + '</span><br>' +
                'Distance sailed: ' + (d.distanceCovered || 0).toLocaleString() + ' px<br>' +
                'Enemy ships defeated: <span style="color:#4caf50;">' + (d.shipsDefeated || 0) + '</span><br>' +
                'Stretches of sea charted: ' + (d.chunksExplored || 0) +
            '</div>' +
            '<hr style="border-color:#5d4037; margin:20px 0;">';

        const returnBtn = _makeBtn("Return to Main Menu", function () {
            // Full reload guarantees a clean slate — same exit convention this
            // codebase already uses elsewhere (custom_battle_gui.js's battle-end
            // monitor, naval_escort_menu.js's own results screen).
            window.location.reload();
        });
        box.appendChild(returnBtn);
        modalBg.appendChild(box);
        document.body.appendChild(modalBg);
    });

})();