// =============================================================================
// SCENARIO EDITOR – MENU PATCH  (scenario_menu.js)
//
// HOW TO USE:
//   Add <script src="scenario_editor_menu_patch.js"></script> AFTER menu.js
//   and AFTER scenario_editor.js in index.html.
//
// WHAT IT DOES:
//   Hooks into the existing showMainMenu() flow by waiting for the
//   #main-menu-ui-container div to appear (it’s built dynamically by menu.js),
//   then injects a “Scenario Editor” button into the button list.
//
// WHERE THE BUTTON APPEARS:
//   Below the “Custom Battle” button, above the “Load Game” button.
//   It only appears after the user clicks “Manual” (matching the existing
//   window.__isManualUnlocked gating that governs all other gameplay buttons).
//
// FUTURE CLAUDE NOTES:
//   • The actual editor logic lives in scenario_editor.js → window.ScenarioEditor
//   • The button is injected via MutationObserver because showMainMenu() builds
//     its DOM asynchronously and there is no callback/event to hook cleanly.
//   • If the menu structure changes (e.g. uiContainer gets a new id), update
//     the querySelector target in the observer callback below.
//   • Do NOT add this button directly inside menu.js — keep the patch separate
//     so sandbox_overworld.js and story modes stay untouched.
// =============================================================================

// =============================================================================
// SCENARIO EDITOR – MENU PATCH  (scenario_menu.js)
//
// HOW TO USE:
//   Add <script src="scenario_editor_menu_patch.js"></script> AFTER menu.js
//   and AFTER scenario_editor.js in index.html.
//
// WHAT IT DOES:
//   Hooks into the existing showMainMenu() flow by waiting for the
//   #main-menu-ui-container div to appear (it’s built dynamically by menu.js),
//   then injects a “Scenario Editor” button into the button list.
//
// WHERE THE BUTTON APPEARS:
//   Below the “Custom Battle” button, above the “Load Game” button.
//   It only appears after the user clicks “Manual” (matching the existing
//   window.__isManualUnlocked gating that governs all other gameplay buttons).
//
// FUTURE CLAUDE NOTES:
//   • The actual editor logic lives in scenario_editor.js → window.ScenarioEditor
//   • The button is injected via MutationObserver because showMainMenu() builds
//     its DOM asynchronously and there is no callback/event to hook cleanly.
//   • If the menu structure changes (e.g. uiContainer gets a new id), update
//     the querySelector target in the observer callback below.
//   • Do NOT add this button directly inside menu.js — keep the patch separate
//     so sandbox_overworld.js and story modes stay untouched.
// =============================================================================

(function () {
    "use strict";

    // ── Inject button once the menu container exists ────────────────────────
    const observer = new MutationObserver(() => {
        const uiContainer = document.getElementById("main-menu-ui-container");
        if (!uiContainer) return;

        // Guard: don't inject twice
        if (document.getElementById("scenario-editor-btn")) return;

        // ── Build the button in the same style as other menu buttons ─────────
        const btn = document.createElement("button");
        btn.id = "scenario-editor-btn";
        btn.innerText = "🗺 Scenario Editor";

        // Mirrors the style created by createBtn() inside menu.js
        Object.assign(btn.style, {
            background:    "linear-gradient(to bottom, #1a3a5c, #0a1f33)",
            color:         "#a8d8ea",
            border:        "2px solid #4a8fa8",
            padding:       "15px",
            margin:        "10px",
            fontFamily:    "Georgia, serif",
            fontSize:      "1.2rem",
            fontWeight:    "bold",
            cursor:        "pointer",
            borderRadius:  "4px",
            textTransform: "uppercase",
            width:         "min(280px, 85vw)",
            boxSizing:     "border-box",
            transition:    "all 0.2s",
            boxShadow:     "0 4px 6px rgba(0,0,0,0.5)",
            display:       "none",   // hidden until Manual is clicked (matching other btns)
            letterSpacing: "1px"
        });

        btn.onmouseenter = () => {
            btn.style.background  = "linear-gradient(to bottom, #2a5a8c, #1a3a5c)";
            btn.style.color       = "#ffffff";
            btn.style.boxShadow   = "0 0 20px #4a8fa8";
            btn.style.transform   = "scale(1.05)";
        };
        btn.onmouseleave = () => {
            btn.style.background  = "linear-gradient(to bottom, #1a3a5c, #0a1f33)";
            btn.style.color       = "#a8d8ea";
            btn.style.boxShadow   = "0 4px 6px rgba(0,0,0,0.5)";
            btn.style.transform   = "scale(1)";
        };

        btn.onclick = () => {
            // Validate that the editor module loaded
            if (typeof window.ScenarioEditor === "undefined") {
                alert("Scenario Editor module not loaded!\nAdd scenario_editor.js before this patch.");
                return;
            }
            // Hide main menu UI (same pattern as Custom Battle button)
            const menuUI = document.getElementById("main-menu-ui-container");
            if (menuUI) menuUI.style.display = "none";

            window.ScenarioEditor.open();
        };

        // ── Find insertion point: after "Custom Battle" button ───────────────
        // customBattleBtn has no id, so we find by text content
        const allBtns = Array.from(uiContainer.querySelectorAll("button"));
        const customBattleBtn = allBtns.find(b => b.innerText.includes("Custom Battle"));

        if (customBattleBtn && customBattleBtn.nextSibling) {
            uiContainer.insertBefore(btn, customBattleBtn.nextSibling);
        } else {
            // Fallback: append before the Load Game / Options / Quit cluster
            const loadBtn = allBtns.find(b => b.innerText.includes("Load Game"));
            if (loadBtn) {
                uiContainer.insertBefore(btn, loadBtn);
            } else {
                uiContainer.appendChild(btn);
            }
        }

        // ── Patch the Manual button's onclick to also reveal this button ─────
        // The Manual button already runs its own onclick which shows other btns.
        // We watch for the __isManualUnlocked flag being set, then show ours.
        //
        // FUTURE CLAUDE: If you refactor the Manual button to emit a custom
        // event (e.g. dispatchEvent(new Event('manualUnlocked'))), replace
        // this polling with an addEventListener call instead.
        const revealPoll = setInterval(() => {
            if (window.__isManualUnlocked) {
                btn.style.display = "block";
                clearInterval(revealPoll);
            }
        }, 150);

        // Stop the observer once injection is done
        observer.disconnect();
    });

    // Watch the body for the menu container being added
    observer.observe(document.body, { childList: true, subtree: true });

    console.log("[ScenarioEditor] Menu patch loaded — waiting for #main-menu-ui-container.");

})();