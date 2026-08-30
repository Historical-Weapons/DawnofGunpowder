// =============================================================================
// SESSION CHANGELOG (for fusion with the other diverging Story 3 session)
// =============================================================================
//   - Added the missing `if (story.id === 2)` launch block. It was absent
//     entirely (only id===1 and id===3 existed), so Story 2 never called
//     window.initGame_story2() and silently failed to load. Not narrative —
//     pure engine wiring, safe to keep regardless of which Story 3
//     continuation wins.
// =============================================================================

(function () {
    let menuActive = false;
    let menuAnimFrameId = null;
    let backgroundUnits = [];
    let particles = [];
    let countdownInterval; // <--- ADD THIS HERE

window.showMainMenu = function () {
        if (menuActive) return;
        menuActive = true;
        window.__isManualUnlocked = false; // <--- ADD THIS FLAG INITIALIZER


const startStandaloneMusic = () => {
    if (!menuActive) return;



    // 1. Initialize the global manager
    if (typeof AudioManager !== 'undefined') {
        AudioManager.init();
        AudioManager.playMP3('music/menu_noloop.mp3', false);
    }

    // 3. Remove listeners so it only triggers once
    window.removeEventListener('mousedown', startStandaloneMusic);
    window.removeEventListener('keydown', startStandaloneMusic);
};



// --- ADD THESE LINES TO HOOK IT UP ---
window.addEventListener('mousedown', startStandaloneMusic);
window.addEventListener('keydown', startStandaloneMusic);

        // --- REST OF YOUR MENU CODE ---
        
        // PAUSE NPC MOVEMENT: Set a global flag that index.html can check
        window.isPaused = true; 

        // --- MAIN CONTAINER ---
        const menu = document.createElement("div");
        menu.id = "main-menu";
        menu.style.position = "fixed";
        menu.style.top = "0";
        menu.style.left = "0";
        menu.style.width = "100%";
        menu.style.height = "100%";
        menu.style.background = "#080614";
        menu.style.display = "flex";
        menu.style.flexDirection = "column";
        menu.style.alignItems = "center";
        menu.style.justifyContent = "center";
        menu.style.zIndex = "10000";
        menu.style.transition = "opacity 0.5s ease";
        // CRITICAL FIX FOR SNAPPED WINDOWS/MOBILE: Allows scrolling if screen is too small
        menu.style.overflowY = "auto";
        menu.style.overflowX = "hidden";
        menu.style.WebkitOverflowScrolling = "touch";
        menu.style.boxSizing = "border-box";
        menu.style.padding = "20px 0"; 


        // --- EPIC BACKGROUND CANVAS ---
        const canvas = document.createElement("canvas");
        canvas.style.position = "fixed"; // Changed from absolute to fixed so it stays in background when scrolling
        canvas.style.top = "0";
        canvas.style.left = "0";
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.zIndex = "-1";
        canvas.style.pointerEvents = "none"; // CRITICAL: Ensures canvas never blocks button/scrollbar clicks
        menu.appendChild(canvas);

        const ctx = canvas.getContext("2d");
        
        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        // --- UI CONTAINER ---
        const uiContainer = document.createElement("div");
		uiContainer.id = "main-menu-ui-container"; // <--- ADD THIS LINE
        uiContainer.style.display = "flex";
        uiContainer.style.flexDirection = "column";
        uiContainer.style.alignItems = "center";
        uiContainer.style.zIndex = "1";
        uiContainer.style.width = "100%";
        uiContainer.style.maxWidth = "600px";
        uiContainer.style.padding = "10px";
        uiContainer.style.boxSizing = "border-box";
        
        // --- TITLE ---
        const title = document.createElement("h1");
        title.innerText = "DAWN OF GUNPOWDER";
        title.style.color = "#f5d76e";
        title.style.fontFamily = "Georgia, serif";
        // RESPONSIVE FIX: Scales smoothly between 2rem and 4rem depending on screen width
        title.style.fontSize = "clamp(2rem, 6vw, 4rem)";
        title.style.margin = "0 0 clamp(20px, 4vw, 40px) 0";
        title.style.textAlign = "center";
        title.style.letterSpacing = "clamp(2px, 2vw, 8px)";
        title.style.textShadow = "0 0 20px rgba(212, 184, 134, 0.8), 0 5px 15px rgba(123, 26, 26, 0.9)";
        title.style.border = "none";
        title.style.borderBottom = "none";
        title.style.width = "100%";
        title.style.boxSizing = "border-box";

        // --- BUTTON CREATOR ---
        function createBtn(text, onClick) {
            const btn = document.createElement("button");
            btn.innerText = text;
            btn.style.background = "linear-gradient(to bottom, #7b1a1a, #4a0a0a)";
            btn.style.color = "#f5d76e";
            btn.style.border = "2px solid #d4b886";
            btn.style.padding = "15px clamp(10px, 4vw, 40px)";
            btn.style.margin = "10px";
            btn.style.fontFamily = "Georgia, serif";
            btn.style.fontSize = "1.2rem";
            btn.style.fontWeight = "bold";
            btn.style.cursor = "pointer";
            btn.style.borderRadius = "4px";
            btn.style.textTransform = "uppercase";
            // RESPONSIVE FIX: Fits perfectly on iPhone 11 (caps at 280px on PC, scales down on mobile)
            btn.style.width = "min(280px, 85vw)";
            btn.style.boxSizing = "border-box";
            btn.style.transition = "all 0.2s";
            btn.style.boxShadow = "0 4px 6px rgba(0,0,0,0.5)";

            btn.onmouseenter = () => {
                btn.style.transform = "scale(1.05)";
                btn.style.background = "linear-gradient(to bottom, #b71c1c, #7b1a1a)";
                btn.style.color = "#fff";
                btn.style.boxShadow = "0 0 20px #d4b886";
            };

            btn.onmouseleave = () => {
                btn.style.transform = "scale(1)";
                btn.style.background = "linear-gradient(to bottom, #7b1a1a, #4a0a0a)";
                btn.style.color = "#f5d76e";
                btn.style.boxShadow = "0 4px 6px rgba(0,0,0,0.5)";
            };

            btn.onclick = onClick;
            return btn;
        }
		
function quitGame() {
    console.log("Quit requested");

    try {
        // Capacitor native app path
        if (window.Capacitor?.isNativePlatform?.() && window.Capacitor?.Plugins?.App) {
            if (typeof window.Capacitor.Plugins.App.exitApp === "function") {
                window.Capacitor.Plugins.App.exitApp();
                return;
            }

            if (typeof window.Capacitor.Plugins.App.minimizeApp === "function") {
                window.Capacitor.Plugins.App.minimizeApp();
                return;
            }
        }

        // Cordova fallback
        if (window.navigator?.app?.exitApp) {
            window.navigator.app.exitApp();
            return;
        }
    } catch (err) {
        console.error("Quit failed:", err);
    }

    // Browser fallback only
    if (window.opener) {
        window.close();
    } else {
        location.href = "about:blank";
    }
}

function destroyMenu() {
    // Stop the MP3 if it's still playing
    if (typeof AudioManager !== 'undefined') {
        AudioManager.stopMP3();
    }

    menu.style.opacity = "0";
    if (menuAnimFrameId) {
        cancelAnimationFrame(menuAnimFrameId);
        menuAnimFrameId = null;
    }
    backgroundUnits = [];
    particles = [];
    window.removeEventListener('resize', resizeCanvas);

    setTimeout(() => {
        if (menu.parentNode) menu.parentNode.removeChild(menu);
        menuActive = false;
        window.isPaused = false; 
    }, 500);
	// ADD THIS LINE HERE:
window.destroyMainMenuSafe = destroyMenu;
}

const playBtn = createBtn("Sandbox Game", () => {
    
    // SURGERY: Trigger the new Skyrim-style loading screen
    if (typeof window.showLoadingScreen === 'function') {
        window.showLoadingScreen();
    }
 
  //  if (document.documentElement.requestFullscreen) {
 //       document.documentElement.requestFullscreen().then(() => {
            // FIX ZOOM: Force the game to recalculate size after entering fullscreen
            //setTimeout(() => {
              //  window.dispatchEvent(new Event('resize'));
          //  }, 150);
   //     }).catch(err => console.warn(err));
  //  }

    if (typeof AudioManager !== 'undefined') {
        AudioManager.init();
    }

    destroyMenu();

    setTimeout(() => {
        if (typeof startGameSafe === 'function') startGameSafe();
    }, 100); 
});
// Ensure it starts hidden
playBtn.style.display = "none";


// --- NEW CUSTOM BATTLE BUTTON ---
const customBattleBtn = createBtn("Custom Battle", () => {
    // This calls the GUI function from the custom_battle_gui.js script
    if (typeof showCustomBattleMenu === "function") {
        showCustomBattleMenu();
        uiContainer.style.display = "none"; // Hide the main menu buttons
    } else {
        alert("Custom Battle module not loaded!");
    }
});

// --- SURVIVAL MODE BUTTON ---
const survivalBtn = createBtn("🏹 Survival", () => {
    // This calls the GUI function from battle_engine/survival_mode.js
    if (typeof window.showSurvivalSetupMenu === "function") {
        window.showSurvivalSetupMenu();
        uiContainer.style.display = "none"; // Hide the main menu buttons
    } else {
        alert("Survival module not loaded!");
    }
});

// --- NAVAL EXPLORATION BUTTON ---
const navalEscortBtn = createBtn("🗺️ Naval Exploration", () => {
    // This calls the GUI function from menu/naval_exploration_menu.js
    if (typeof window.showNavalExplorationSetupMenu === "function") {
        window.showNavalExplorationSetupMenu();
        uiContainer.style.display = "none"; // Hide the main menu buttons
    } else {
        alert("Naval Exploration module not loaded!");
    }
});

// ── CAMPAIGN BUTTON ────────────────────────────────────────────────────────
const campaignBtn = createBtn("⚔️ Campaign Mode", () => {
    uiContainer.style.display = "none";
    showCampaignScreen(menu, () => {
        // Back callback: restore main menu
        uiContainer.style.display = "flex";
    }, destroyMenu);
});
campaignBtn.style.display  = "none"; // revealed after Manual is read
 

// ── CAMPAIGN SELECTION SCREEN ──────────────────────────────────────────────
function showCampaignScreen(menuEl, onBack, onLaunch) {
    const panel = document.createElement("div");
    panel.id    = "campaign-screen";
    panel.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(10,15,25,0.97);
        display: flex; flex-direction: column;
        align-items: center; justify-content: flex-start;
        overflow-y: auto; overflow-x: hidden;
        z-index: 20000;
        padding: 20px 10px 40px;
        box-sizing: border-box;
        font-family: Georgia, serif;
    `;

    // Title
    const ttl = document.createElement("h1");
    ttl.innerText = "CAMPAIGN MODE";
    ttl.style.cssText = `
        color: #f5d76e; font-size: clamp(1.6rem,5vw,3rem);
        letter-spacing: 6px; margin: 0 0 6px; text-align:center;
        text-shadow: 0 0 18px rgba(212,184,134,0.7);
    `;
    panel.appendChild(ttl);

    const sub = document.createElement("div");
    sub.innerText = "Choose your era — forge your legend";
    sub.style.cssText = `color:#a0836a; font-size:0.95rem; letter-spacing:2px;
        margin-bottom:30px; text-align:center;`;
    panel.appendChild(sub);

    // ── Story definition list ──────────────────────────────────────────────
    const stories = [
        {
            id:       1,
            title:    "The Bun'ei Invasion",
            subtitle: "Kyūshū, Japan — 1274",
            desc:     "The Mongol-Goryeo fleet has crossed the Korea Strait. " +
 "Rally militia from nearby coastal villages, hold the beach line, " +
     "the kami will decide the rest.",
            tag:      "JAPAN LANDING",
            tagColor: "#c62828",
            available: true
        },
{
            id:       2,
            title:    "The Fall of Western Xia",
            subtitle: "Genghis Khan's Final Campaign",
            desc:     "Lead the brutal 1225 invasion to crush the Xia dynasty, besiege Yinchuan, and secure the Mongol Empire's dominance.",
            tag:      "TANGUT SIEGE",
            tagColor: "#b5451b",
            available: true,
            underConstruction: true
        },
{
    id:       3,
    title:    "Life on the Wall",
    subtitle: "Liaodong Frontier — 1578",
    desc:     "You are Liu Sheng, a young Ming recruit stationed at Fushun Suo " +
              "on the restless northeastern frontier. Repair the walls, drill with the " +
              "garrison, and endure the long quiet between raids. The border is calm " +
              "for now—but quiet years do not last forever.",
    tag:      "MING FRONTIER",
    tagColor: "#5d4037",
    available: true,
    underConstruction: true
},
        {
            id:       4,
            title:    "??",
            subtitle: " — coming soon",
            desc:     "??.",
            tag:      "UNDER CONSTRUCTION",
            tagColor: "#555",
            available: false
        }
    ];

    // ── Render story cards ─────────────────────────────────────────────────
    const grid = document.createElement("div");
    grid.style.cssText = `
        display: flex; flex-direction: column; gap: 16px;
        width: 100%; max-width: 680px;
    `;

    stories.forEach(story => {
        const card = document.createElement("div");
        card.style.cssText = `
            background: ${story.available
                ? "linear-gradient(135deg, rgba(30,20,10,0.95), rgba(60,25,15,0.95))"
                : "rgba(20,20,20,0.80)"};
            border: 2px solid ${story.available ? "#d4b886" : "#333"};
            border-radius: 6px;
            padding: 18px 20px;
            cursor: ${story.available ? "pointer" : "not-allowed"};
            transition: all 0.25s;
            opacity: ${story.available ? "1" : "0.55"};
            position: relative;
            overflow: hidden;
        `;

        // Tag badge
        const badge = document.createElement("div");
        badge.innerText = story.tag;
        badge.style.cssText = `
            position: absolute; top: 12px; right: 14px;
            background: ${story.tagColor};
            color: #fff; font-size: 0.7rem; letter-spacing: 1.5px;
            padding: 3px 8px; border-radius: 3px; font-weight: bold;
        `;
        card.appendChild(badge);

        const cardTitle = document.createElement("div");
        cardTitle.innerText = story.title;
        cardTitle.style.cssText = `
            color: ${story.available ? "#f5d76e" : "#888"};
            font-size: clamp(1rem,3vw,1.4rem);
            font-weight: bold; margin-bottom: 4px;
        `;
        card.appendChild(cardTitle);

        const cardSub = document.createElement("div");
        cardSub.innerText = story.subtitle;
        cardSub.style.cssText = `
            color: ${story.available ? "#c8a876" : "#555"};
            font-size: 0.85rem; letter-spacing: 1px; margin-bottom: 10px;
        `;
        card.appendChild(cardSub);

        const cardDesc = document.createElement("div");
        cardDesc.innerText = story.desc;
        cardDesc.style.cssText = `
            color: ${story.available ? "#bbb" : "#444"};
            font-size: 0.88rem; line-height: 1.55;
        `;
        card.appendChild(cardDesc);

        if (story.underConstruction) {
            const wip = document.createElement("div");
            wip.innerText = "🚧 Under Construction — content is incomplete";
            wip.style.cssText = `
                margin-top: 10px;
                color: #e6a817;
                font-size: 0.78rem;
                letter-spacing: 1px;
                font-style: italic;
                opacity: 0.85;
            `;
            card.appendChild(wip);
        }

        if (story.available) {
            const playArrow = document.createElement("div");
            playArrow.innerText = "▶  Begin Campaign";
            playArrow.style.cssText = `
                margin-top: 14px; color: #f5d76e;
                font-size: 0.9rem; letter-spacing: 1px; font-weight: bold;
            `;
            card.appendChild(playArrow);

            card.onmouseenter = () => {
                card.style.borderColor = "#fff";
                card.style.transform   = "scale(1.015)";
                card.style.boxShadow   = "0 0 24px rgba(212,184,134,0.4)";
            };
            card.onmouseleave = () => {
                card.style.borderColor = "#d4b886";
                card.style.transform   = "scale(1)";
                card.style.boxShadow   = "none";
            };

card.onclick = async () => {
    // 1. UI Cleanup
    if (panel.parentNode) panel.parentNode.removeChild(panel);

    // 2. Trigger your new loading screen
    if (typeof window.showLoadingScreen === 'function') {
        window.showLoadingScreen();
    }

    if (typeof AudioManager !== 'undefined') AudioManager.init();

    // 3. Destroy main menu
    if (typeof onLaunch === 'function') onLaunch();

    // 4. NEW METHOD: Replicate the working "Launch Scenario" path EXACTLY.
    //
    //    Why this is the only reliable path:
    //    The .json/.js file stores tiles in compact form { e, m, r } to keep
    //    the file small. ScenarioRuntime._reskinWorldMap (in scenario_update.js)
    //    expects FULL tile objects with .name, .color, .speed, .impassable —
    //    it does NOT expand compact tiles itself. If we hand raw compact tiles
    //    straight to ScenarioRuntime.launch, every tile gets its name/color/
    //    impassable mutated to `undefined`, the renderer falls back to its
    //    ocean default, and the player sees an all-water map.
    //
    //    The "Launch Scenario" file picker in scenario_editor.js works
    //    correctly because it runs the JSON through TWO transforms:
    //      a. tiles via window.ScenarioEditor.classifyTile(e, m, r)  (compact → full)
    //      b. factions backfilled from window.ScenarioEditor.DEFAULT_FACTIONS
    //         (older saves are missing order/cityCount/uniqueTroop)
    //    We do the SAME transforms here, with a hardcoded data source instead
    //    of a file picker, so the campaign launches with one tap.
    //
    //    Data source: try window.Story_1_Data first (loaded by the
    //    <script src="story/Story_1_Dev.js"> tag in index.html). If that
    //    isn't present, fall back to fetching story/Story_1_Dev.json. Either
    //    a .js or .json source is fine — only the post-load transforms matter.
    if (story.id === 1) {
        try {
            // ── (0) Campaign-mode gate — REQUIRED for HakataBay install ──────
            //  HakataBayScenario auto-installs ONLY when this flag is true,
            //  so loading the same JSON via Sandbox or Scenario Editor will
            //  NOT splice the Hakata triggers in. Cleared on quit-to-menu.
            //  Without this, the trigger system never starts → no spawn_npc
            //  actions ever fire → empty world.
            window.__campaignStory1Active = true;
            window.__campaignStoryId      = 1;
            console.log("[Campaign] Campaign-mode flag set → Story 1.");

            // ── (a) Acquire raw scenario data ────────────────────────────────
            let raw = null;
            if (window.Story_1_Data && typeof window.Story_1_Data === "object") {
                raw = window.Story_1_Data;
                console.log("[Campaign] Using window.Story_1_Data (loaded via <script>).");
            } else {
                console.log("[Campaign] window.Story_1_Data not present — fetching JSON…");
                const path = "story/Story_1_Dev.json";
                const response = await fetch(path);
                if (!response.ok) throw new Error("HTTP " + response.status + " for " + path);
                raw = await response.json();
            }

            if (!raw || !raw.tiles || !raw.factions) {
                throw new Error("Scenario data missing required fields (tiles / factions). " +
                                "Re-export from the Scenario Editor.");
            }

            // ── (b) Validate the editor module is loaded ─────────────────────
            //  classifyTile + DEFAULT_FACTIONS live in scenario_editor.js.
            //  index.html loads scenario_editor.js BEFORE menu.js, so this
            //  should always be present, but we guard for it explicitly so
            //  the failure mode is a clear alert rather than a silent
            //  all-water map.
            if (!window.ScenarioEditor ||
                typeof window.ScenarioEditor.classifyTile !== "function" ||
                !window.ScenarioEditor.DEFAULT_FACTIONS) {
                throw new Error("window.ScenarioEditor is not loaded. " +
                                "Ensure scenario_editor.js is included BEFORE menu.js.");
            }
            const classifyTile     = window.ScenarioEditor.classifyTile;
            const DEFAULT_FACTIONS = window.ScenarioEditor.DEFAULT_FACTIONS;

            // ── (c) Expand compact tiles → full tiles (THE critical step) ────
            //  Compact:  { e: 0.42, m: 0.61, r: false }
            //  Full:     { name, color, speed, impassable, e, m, isRiver, ... }
            const tiles = raw.tiles.map(function (col) {
                return col.map(function (t) {
                    return classifyTile(t.e, t.m, t.r);
                });
            });

            // ── (d) Faction migration (matches editor's Launch Scenario) ─────
            const migratedFactions = {};
            let i = 0;
            Object.entries(raw.factions || {}).forEach(function (entry) {
                const fName = entry[0], fData = entry[1];
                const def   = DEFAULT_FACTIONS[fName] || {};
                migratedFactions[fName] = {
                    color:       fData.color     || def.color     || "#888888",
                    geoWeight:   fData.geoWeight || def.geoWeight || { north: 0.5, south: 0.5, west: 0.5, east: 0.5 },
                    enabled:     ("enabled" in fData) ? !!fData.enabled : true,
                    locked:      !!fData.locked,
                    order:       (typeof fData.order === "number") ? fData.order : i,
                    cityCount:   (typeof fData.cityCount === "number") ? fData.cityCount
                                  : (typeof def.cityCount === "number" ? def.cityCount : 4),
                    uniqueTroop: fData.uniqueTroop || def.uniqueTroop || ""
                };
                i++;
            });

            // ── (e) Build the scenario object the runtime expects ────────────
            const scenario = Object.assign({}, raw, {
                tiles:        tiles,
                factions:     migratedFactions,
                cityStrategy: raw.cityStrategy || "random"
            });

            console.log("[Campaign] Loaded scenario:",
                        "meta:",     scenario.meta && scenario.meta.name,
                        "| tiles:",  tiles.length + "×" + (tiles[0] ? tiles[0].length : 0),
                        "| cities:", (scenario.cities || []).length,
                        "| triggers:", (scenario.triggers || []).length,
                        "| importantNpcs:", (scenario.importantNpcs || []).length);

            // ── (f) Hand off to the runtime ──────────────────────────────────
            setTimeout(function () {
                if (window.ScenarioRuntime && typeof window.ScenarioRuntime.launch === "function") {
                    window.ScenarioRuntime.launch(scenario);
                } else {
                    console.error("[Campaign] ScenarioRuntime not found!");
                    alert("Engine Error: ScenarioRuntime module missing.\n" +
                          "Ensure scenario_update.js is included before menu.js.");
                }
            }, 120);

        } catch (err) {
            console.error("[Campaign] Load Failed:", err);
            alert("Failed to load Story 1 campaign.\n\nReason: " +
                  (err && err.message ? err.message : String(err)));
        }
    }

    // ── Story 2: The Fall of Western Xia ─────────────────────────────────────
    // Uses initGame_story2() from story2_map_and_update.js — generates the
    // Hexi Corridor map procedurally (no .json file needed).
    // SuzhouScenario.install() is called inside initGame_story2 once the flag
    // __campaignStory2Active is set here.
    //
    // To add Story 3: copy this block, replace every "2" with "3", point it at
    // window.initGame_story3 and set window.__campaignStory3Active = true.
    if (story.id === 2) {
        try {
            window.__campaignStory2Active = true;
            window.__campaignStoryId      = 2;
            console.log("[Campaign] Campaign-mode flag set → Story 2.");

            if (typeof window.initGame_story2 !== 'function') {
                throw new Error(
                    "window.initGame_story2() not found.\n" +
                    "Ensure story2_map_and_update.js is loaded in index.html " +
                    "AFTER sandboxmode_overworld.js and AFTER mongolconquestxia_scenario.js."
                );
            }

            setTimeout(function () {
                window.initGame_story2();
            }, 120);

        } catch (err) {
            console.error("[Campaign] Story 2 load failed:", err);
            alert("Failed to load Story 2 campaign.\n\nReason: " +
                  (err && err.message ? err.message : String(err)));
        }
    }

    // ── Story 3: Life on the Wall ────────────────────────────────────────────
    // Uses initGame_story3() from story3_map_and_update.js — generates the
    // Song-Jin frontier wall map procedurally (no .json file needed for now;
    // an editor-exported map can be wired in later just like Story 2 does
    // with window.Story_2_Data).
    // SongJinScenario.install() will be called inside initGame_story3 once
    // the flag __campaignStory3Active is set here.
    if (story.id === 3) {
        try {
            window.__campaignStory3Active = true;
            window.__campaignStoryId      = 3;
            console.log("[Campaign] Campaign-mode flag set → Story 3.");

            if (typeof window.initGame_story3 !== 'function') {
                throw new Error(
                    "window.initGame_story3() not found.\n" +
                    "Ensure story3_map_and_update.js is loaded in index.html " +
                    "AFTER sandboxmode_overworld.js and AFTER songJinWar_scenario.js."
                );
            }

            setTimeout(function () {
                window.initGame_story3();
            }, 120);

        } catch (err) {
            console.error("[Campaign] Story 3 load failed:", err);
            alert("Failed to load Story 3 campaign.\n\nReason: " +
                  (err && err.message ? err.message : String(err)));
        }
    }
};
        }

        grid.appendChild(card);
    });

    panel.appendChild(grid);

    // ── Back button ────────────────────────────────────────────────────────
    const backBtn = document.createElement("button");
    backBtn.innerText = "← Back to Main Menu";
    backBtn.style.cssText = `
        margin-top: 28px;
        background: linear-gradient(to bottom, #4a2a0a, #2d1500);
        color: #f5d76e; border: 2px solid #d4b886;
        padding: 12px 32px; border-radius: 4px;
        font-family: Georgia, serif; font-size: 1rem;
        font-weight: bold; cursor: pointer; letter-spacing: 1px;
        transition: all 0.2s;
    `;
    backBtn.onmouseenter = () => {
        backBtn.style.background = "linear-gradient(to bottom, #7b4a1a, #4a2a0a)";
        backBtn.style.color = "#fff";
    };
    backBtn.onmouseleave = () => {
        backBtn.style.background = "linear-gradient(to bottom, #4a2a0a, #2d1500)";
        backBtn.style.color = "#f5d76e";
    };
    backBtn.onclick = () => {
        if (panel.parentNode) panel.parentNode.removeChild(panel);
        if (typeof onBack === 'function') onBack();
    };
    panel.appendChild(backBtn);

    // Insert campaign panel INTO the same menu element so it sits on top
    menuEl.appendChild(panel);
}

const loadGameBtn = createBtn("💾 Load Game", () => {
    if (window.SaveSystem) {
        // 1. Hide the main menu buttons so they don't overlap the load slots
        uiContainer.style.display = "none"; 

        // 2. Lower menu priority slightly to ensure the save overlay is on top
        menu.style.zIndex = "1000"; 

        // 3. Call the correct exposed function from save_system.js (v3.0)
        if (typeof window.SaveSystem.openPanel === "function") {
            window.SaveSystem.openPanel();
        } else {
            console.error("SaveSystem.openPanel is not available!");
        }

        // Note: If the user closes the load panel without loading, 
        // you might want a way to unhide 'uiContainer' here, 
        // but this gets the panel open!
    }
});

loadGameBtn.style.display = "none";

// --- OPTIONS BUTTON ---
const optionsBtn = createBtn("Options", () => {
    if (window.SettingsUI) {
        window.SettingsUI.toggle();
    } else {
        alert("Settings module not loaded!");
    }
});
// You can set this to "none" if you want it to appear only after clicking "Manual" 
// like your other buttons, or leave it visible.
optionsBtn.style.display = "block";


 

// Start hidden to match your "Manual First" flow
customBattleBtn.style.display = "none";
survivalBtn.style.display = "none";
navalEscortBtn.style.display = "none";


// --- ENHANCED START ENGINE WRAPPER ---
function startGameSafe() {
    // Prevent double-starts if the user double-clicks the button
    if (window.__gameStarted) return;
    window.__gameStarted = true;

    console.log("Handoff successful: Starting Game Engine...");

    if (typeof initGame === "function") {
        initGame();
    } else {
        // Fallback for debugging if the main script isn't ready
        console.error("Critical Error: initGame() not found. Ensure index.html scripts are loaded.");
        alert("Game Engine failed to initialize. Please refresh.");
    }
} 
        playBtn.style.display = "none";
		
 

const instrBtn = createBtn("Manual", () => {
    // 1. Unlock buttons
	window.__isManualUnlocked = true; // <--- ADD THIS LINE HERE
	instrBtn.remove(); // <--- NEW SURGERY: DESTROYS THE MANUAL BUTTON AFTER CLICKING
    playBtn.style.display = "block";
    customBattleBtn.style.display = "block"; 
    survivalBtn.style.display = "block";
    navalEscortBtn.style.display = "block"; // Naval Exploration now revealed here, on the main menu, right after Manual is read — same as Custom Battle / Survival / Campaign
    campaignBtn.style.display = "block"; // STORY1: show campaign button
    const unitsBtn = document.getElementById("units-guide-btn");
    if (unitsBtn) unitsBtn.style.display = "block";
	optionsBtn.style.display = "block"; // <--- ADD THIS LINE HERE

// Surgery 8: Only show Load button if save data exists
    const hasSaveData = [0, 1, 2].some(i => !!localStorage.getItem("DoG_Save_" + i));
    if (hasSaveData) {
        loadGameBtn.style.display = "block";
    }
	
    // 2. Open the manual
    manualModal.style.display = "flex";
    uiContainer.style.display = "none";
    window.dispatchEvent(new Event('resize'));

    // 3. RESET & START TIMER
    let countdown = 20;
    
    // Set text immediately so it doesn't wait 1 second to appear
    closeBtn.innerText = `Close Manual (${countdown})`;

    // Kill any existing timer to prevent it from counting down double-speed
    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            closeBtn.innerText = `Close Manual (${countdown})`;
        } else {
            clearInterval(countdownInterval);
            closeBtn.click(); 
        }
    }, 2000);
});

// --- CUSTOM SCROLLBAR CSS (Removed manual-content scrollbar since it won't scroll anymore) ---
const style = document.createElement('style');
style.innerHTML = `
    #main-menu::-webkit-scrollbar { width: 8px; }
    #main-menu::-webkit-scrollbar-track { background: #3e2723; }
    #main-menu::-webkit-scrollbar-thumb { background: #7b1a1a; border-radius: 4px; }
    #main-menu::-webkit-scrollbar-thumb:hover { background: #d4b886; }
`;
document.head.appendChild(style);

// --- IN-GAME MANUAL MODAL GUI ---
const manualModal = document.createElement("div");
manualModal.style.display = "none"; 
manualModal.style.flexDirection = "column";
// Keep your existing styling for background, border, etc., but CHANGE these:

// 1. Shrink the max-height so it doesn't take up the whole screen
manualModal.style.width = "min(900px, 95vw)";
manualModal.style.height = "min(800px, 80vh)"; // Changed from 95vh to 80vh

// 2. Force it to the bottom by swallowing all empty space at the top
manualModal.style.marginTop = "auto"; 
manualModal.style.marginBottom = "5vh"; // Leaves a small 5% gap at the very bottom
manualModal.style.marginLeft = "auto";
manualModal.style.marginRight = "auto";

manualModal.style.background = "linear-gradient(to bottom, rgba(62, 39, 35, 0.95), rgba(74, 10, 10, 0.95))";
manualModal.style.border = "3px solid #d4b886";
manualModal.style.borderRadius = "8px";
manualModal.style.padding = "clamp(10px, 3vh, 30px)";
manualModal.style.boxSizing = "border-box";
manualModal.style.boxShadow = "0 10px 40px rgba(0,0,0,0.8)";
manualModal.style.zIndex = "10";
manualModal.style.color = "#f5d76e";
manualModal.style.fontFamily = "Georgia, serif";

// 2. REVISED MARGIN: "auto" on top pushes it down; "20px" on bottom leaves a small anchor gap
manualModal.style.margin = "auto auto 20px auto";

const manualContent = document.createElement("div");
manualContent.id = "manual-content";
manualContent.style.overflow = "hidden"; // SURGERY: No more scrolling!
manualContent.style.display = "flex";
manualContent.style.flexDirection = "column";
manualContent.style.justifyContent = "space-evenly"; // Spreads text out nicely to fill whatever height it has
manualContent.style.flexGrow = "1";

// SURGERY: Replaced hard px/rem font sizes with fluid clamp() and vh/vw units
manualContent.innerHTML = `
    <h2 style="text-align: center; border-bottom: 2px solid #d4b886; padding-bottom: clamp(5px, 1.5vh, 15px); margin: 0; letter-spacing: 2px; font-size: clamp(1.2rem, 3.5vh, 2.5rem);">
        DAWN OF GUNPOWDER:<br><span style="font-size: 0.7em; color: #d4b886;">RTS OF THE 13TH CENTURY</span>
    </h2>

    <div style="line-height: 1.6; font-size: clamp(0.8rem, 2.2vh, 1.1rem); margin-top: clamp(10px, 2.5vh, 25px); color: #d4b886;">
        <strong>DAWN OF GUNPOWDER</strong> is a tactical strategy game set in a 13th-century world of conquest and shifting alliances. 
        <br><br>
        


        <strong style="color: #d4b886; letter-spacing: 1px;">THE STRATEGY</strong><br>
        • <b>Diverse Terrain:</b> Combat across steppes, oceans, and cities.<br>
        • <b>Veterancy:</b> Armies gain strength through battle experience.<br>
        • <b>Tactical Choice:</b> Success depends on composition and environment.
    </div>
`;

const closeBtn = createBtn("Close Manual", () => {
    clearInterval(countdownInterval); // Stop timer if clicked early
    manualModal.style.display = "none";
    uiContainer.style.display = "flex"; // Show main UI again
});
closeBtn.style.margin = "clamp(10px, 2vh, 20px) auto 0 auto";
// Z-Index fix to make absolutely sure nothing overlaps it
closeBtn.style.position = "relative";
closeBtn.style.zIndex = "99999";

manualModal.appendChild(manualContent);
manualModal.appendChild(closeBtn);

// --- SURGERY END ---








        // --- CREDITS TEXT ---
        const credits = document.createElement("div");
        credits.innerText = "by Historical Weapons YouTube Channel. V0.5";
        // RESPONSIVE FIX: position changed so it doesn't overlap on extremely short screens
        credits.style.position = "relative";
        credits.style.marginTop = "clamp(20px, 4vh, 40px)";
        credits.style.marginBottom = "20px";
        credits.style.color = "#d4b886";
        credits.style.fontFamily = "Georgia, serif";
        credits.style.fontSize = "0.9rem";
        credits.style.opacity = "0.7";
        credits.style.letterSpacing = "1px";

uiContainer.appendChild(title);
uiContainer.appendChild(instrBtn);
uiContainer.appendChild(playBtn);
uiContainer.appendChild(campaignBtn);
uiContainer.appendChild(customBattleBtn);
uiContainer.appendChild(survivalBtn);
uiContainer.appendChild(navalEscortBtn);
uiContainer.appendChild(loadGameBtn); // Surgery 7: Appended here
uiContainer.appendChild(optionsBtn);
        menu.appendChild(uiContainer);

        menu.appendChild(manualModal); // Append Modal to menu
        menu.appendChild(credits);     // Append Credits to menu
 

        // CRITICAL: Append the menu to the webpage FIRST
        document.body.appendChild(menu);

        // NOW inject the units guide, so the script can successfully find the menu and build the data table
        if (typeof window.injectUnitsGuide === "function") {
            window.injectUnitsGuide();
        }

        // ==========================================
        // EPIC BACKGROUND ANIMATION LOGIC
        // ==========================================

        // Diverse cultural unit pool — a handful of each archetype.
        // factionColor drives helmet / armor style in infscript & cavscript:
        //   #1976d2 = Mongol/Steppe   #c2185b = Yamato/Japan   #455a64 = Jin/Jurchen
        //   #00838f = Dali Kingdom/yunan     #7b1fa2 = Goryun/Korea   #7b1a1a = Song/Ming
        //   #fbc02d = Xiaran/tangut   #d32f2f = Hong Dynasty
        const MENU_UNIT_POOL = [
            // ── INFANTRY ────────────────────────────────────────────────────────
            { type: "archer",       unitName: "Archer",               factionColor: "#c2185b", armor: 12, side: "player", isCavalry: false }, // Japanese ashigaru
            { type: "archer",       unitName: "Archer",               factionColor: "#7b1fa2", armor:  8, side: "enemy",  isCavalry: false }, // Goryun bowman
            { type: "archer",       unitName: "Archer",               factionColor: "#1976d2", armor:  5, side: "enemy",  isCavalry: false }, // Mongol foot archer
            { type: "spearman",     unitName: "Glaiveman",            factionColor: "#00838f", armor: 10, side: "enemy",  isCavalry: false }, // Dali glaive
            { type: "spearman",     unitName: "Spearman",             factionColor: "#455a64", armor:  6, side: "enemy",  isCavalry: false }, // Jin footman
            { type: "sword_shield", unitName: "Swordsman",            factionColor: "#d32f2f", armor: 18, side: "player", isCavalry: false }, // Hong shieldman
            { type: "two_handed",   unitName: "Heavy Swordsman",      factionColor: "#455a64", armor: 28, side: "enemy",  isCavalry: false }, // Jin heavy
            { type: "gun",          unitName: "Handgunner",           factionColor: "#7b1a1a", armor:  5, side: "player", isCavalry: false }, // Ming hand cannon
            { type: "crossbow",     unitName: "Repeater Crossbowman", factionColor: "#7b1a1a", armor:  8, side: "player", isCavalry: false }, // Song repeater
            // ── CAVALRY ─────────────────────────────────────────────────────────
            { type: "horse_archer", unitName: "Horse Archer",         factionColor: "#1976d2", armor:  5, side: "enemy",  isCavalry: true  }, // Mongol mounted archer
            { type: "horse_archer", unitName: "Horse Archer",         factionColor: "#455a64", armor: 20, side: "enemy",  isCavalry: true  }, // Jin mounted archer
            { type: "lancer",       unitName: "Lancer",               factionColor: "#c2185b", armor: 28, side: "player", isCavalry: true  }, // Japanese cavalry
            { type: "cataphract",   unitName: "Cataphract",           factionColor: "#fbc02d", armor: 40, side: "enemy",  isCavalry: true  }, // Xiaran heavy horse
        ];

        // Fewer units on mobile — saves GPU and battery on 2026 phones.
        const _menuIsMobile = window.innerWidth < 768;
        // Half the original counts (mobile: 5, desktop: 8) ± a few random units
        const UNIT_COUNT   = _menuIsMobile
            ? 5  + Math.floor(Math.random() * 5) - 2   // range 3–7
            : 8  + Math.floor(Math.random() * 7) - 3;  // range 5–11
        // Render scale: sprites look best at 2–2.5× the native draw size.
        const RENDER_SCALE = _menuIsMobile ? 2.0 : 2.5;

        // ── UNIT FACTORY ──────────────────────────────────────────────────────
        // Spawns a unit just outside one of the left/right screen edges,
        // then gives it an initial velocity pointing inward.
        // A short immunity timer prevents the magnetic-delete zone from
        // immediately destroying the unit before it fully enters the screen.
        function spawnUnit(poolIndex) {
            const tpl = MENU_UNIT_POOL[poolIndex % MENU_UNIT_POOL.length];
            const groundMin = canvas.height * 0.64;
            const groundMax = canvas.height * 0.92;

            // Pick left or right edge
            const fromLeft = Math.random() < 0.5;
            const spawnX   = fromLeft ? -60 : canvas.width + 60;
            const spawnY   = groundMin + Math.random() * (groundMax - groundMin);

            // Initial walk-in velocity
            const spd    = tpl.isCavalry ? 2.2 : 1.0;
            const spawnVx = fromLeft ? spd * (0.8 + Math.random() * 0.5)
                                     : -spd * (0.8 + Math.random() * 0.5);

            const mockUnit = {
                stats:        { armor: tpl.armor },
                facingDir:    fromLeft ? 1 : -1,
                side:         tpl.side,
                state:        "idle",
                cooldown:     0,
                ammo:         10,
                unitType:     tpl.type,
                _visType:     0,
                isCommander:  false,
                id:           Math.floor(Math.random() * 9999) + 1,
                _weaponSeed:  Math.floor(Math.random() * 10),
            };

            backgroundUnits.push({
                x:            spawnX,
                y:            spawnY,
                vx:           spawnVx,
                vy:           0,
                vy_gravity:   0,          // accumulated gravity / jump velocity
                type:         tpl.type,
                unitName:     tpl.unitName,
                factionColor: tpl.factionColor,
                isCavalry:    tpl.isCavalry,
                armor:        tpl.armor,
                side:         tpl.side,
                frame:        Math.random() * 200,
                isAttacking:  false,
                state:        "walk",     // start walking in
                stateTimer:   60 + Math.random() * 60,
                mockUnit:     mockUnit,
                // Immunity frames: during this window the magnetic force is off
                // so the unit can enter from outside without being deleted.
                immunityTimer: 120,       // ~2 s at 60 fps
                // Jump state
                isOnGround:   true,
                jumpCooldown: Math.floor(Math.random() * 400), // stagger first jump
            });
        }

        for (let i = 0; i < UNIT_COUNT; i++) {
            // Stagger spawns over the first few seconds so they don't all
            // march in simultaneously.  We plant a lightweight stub now and
            // schedule the real spawn.
            const delay = i * (60 + Math.floor(Math.random() * 60)); // frames
            // We use frame-counted deferred spawns tracked in a queue.
            if (!window._menuSpawnQueue) window._menuSpawnQueue = [];
            window._menuSpawnQueue.push({ at: delay, index: i });
        }

        // ── PROCEDURAL DAWN LANDSCAPE ───────────────────────────────────────────
        // Generated ONCE per menu session — static geometry reused every frame.
        // Only clouds drift; everything else is stable for performance.
        // ────────────────────────────────────────────────────────────────────────
        let _lseed = (Date.now() ^ 0x9e3779b9) >>> 0;
        const _lr = () => {
            _lseed = Math.imul(_lseed, 1664525) + 1013904223 | 0;
            return (_lseed >>> 0) / 0x100000000;
        };

        const DAWN = (() => {
            // Sun horizontal position: biased toward center, never at edges
            const sunFX = 0.28 + _lr() * 0.44;

            // Pick a colour theme (orange / rose / gold)
            const themes = [
                { top:'#060414', mid:'#2a0e3c', hor:'#d44a08', grd:'#f5960a', sun:'#ffe898' },
                { top:'#04060e', mid:'#180e34', hor:'#b82040', grd:'#e86018', sun:'#ffd878' },
                { top:'#060410', mid:'#1c0c30', hor:'#c03808', grd:'#e87a10', sun:'#ffeaa0' },
            ];
            const theme = themes[Math.floor(_lr() * themes.length)];

            // Build a ridge as an array of normalised {x,y} waypoints.
            // Clamps to [yMin, yMax] with Gaussian-ish random walk.
            const ridge = (n, yMin, yMax, roughness) => {
                const pts = [];
                let y = yMin + _lr() * (yMax - yMin);
                for (let i = 0; i <= n; i++) {
                    pts.push({ x: i / n, y });
                    y = Math.max(yMin, Math.min(yMax, y + (_lr() - 0.5) * roughness));
                }
                return pts;
            };

            return {
                sunFX, theme,
                // Mountain layers: far (tallest, farthest) → near (lowest)
                far:  ridge(16, 0.16, 0.42, 0.26),
                mid:  ridge(12, 0.34, 0.54, 0.20),
                near: ridge(9,  0.48, 0.64, 0.16),
                // Foreground dark earth bumps
                fore: ridge(7,  0.62, 0.70, 0.09),
                // Drifting clouds: x/y/w/h in [0,1] fractions, spd normalised
                clouds: Array.from({ length: 8 }, () => ({
                    x:   _lr() * 1.2 - 0.1,
                    y:   0.05 + _lr() * 0.24,
                    w:   0.09 + _lr() * 0.17,
                    h:   0.022 + _lr() * 0.032,
                    spd: 0.00012 + _lr() * 0.00010,
                    a:   0.40 + _lr() * 0.38,
                    blobs: 3 + Math.floor(_lr() * 3),   // 3–5 overlapping ellipses
                })),
                // Stars — visible near the top where the sky is still dark
                stars: Array.from({ length: 32 }, () => ({
                    x: _lr(), y: _lr() * 0.32,
                    r: 0.4 + _lr() * 1.1,
                    phase: _lr() * Math.PI * 2,
                })),
                // Pine-tree silhouettes planted along the near ridge
                pines: Array.from({ length: 26 }, () => ({
                    fx: _lr(),
                    h:  0.050 + _lr() * 0.065,
                    w:  0.007 + _lr() * 0.006,
                })),
            };
        })();

        // ── DRAW FUNCTION (called every frame with current time t) ────────────
        function drawDawnBackground(ctx, W, H, t) {
            const D        = DAWN;
            const horizY   = H * 0.595;          // horizon line
            const sunX     = D.sunFX * W;
            const sunY     = horizY - H * 0.048; // just above horizon

            // Interpolate a ridge point's canvas Y at a given x-fraction
            const ridgeYAt = (pts, fx) => {
                let i = 0;
                while (i < pts.length - 2 && pts[i + 1].x < fx) i++;
                const A = pts[i], B = pts[Math.min(i + 1, pts.length - 1)];
                const frac = B.x > A.x ? (fx - A.x) / (B.x - A.x) : 0;
                return (A.y + frac * (B.y - A.y)) * H;
            };

            // ── SKY GRADIENT ──────────────────────────────────────────────
            const sky = ctx.createLinearGradient(0, 0, 0, horizY);
            sky.addColorStop(0.00, D.theme.top);
            sky.addColorStop(0.48, D.theme.mid);
            sky.addColorStop(0.82, D.theme.hor);
            sky.addColorStop(1.00, D.theme.grd);
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, W, horizY);

            // Brightness lift — semi-transparent warm wash over the whole sky
            const lift = ctx.createLinearGradient(0, 0, 0, horizY);
            lift.addColorStop(0.0, 'rgba(60,30,10,0.18)');
            lift.addColorStop(1.0, 'rgba(255,180,60,0.22)');
            ctx.fillStyle = lift;
            ctx.fillRect(0, 0, W, horizY);

            // ── SUN GLOW (broad radial bloom) ────────────────────────────
            const glowR  = H * 0.52;
            const glow   = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, glowR);
            glow.addColorStop(0.00, 'rgba(255,252,210,0.98)');
            glow.addColorStop(0.07, 'rgba(255,200,70,0.75)');
            glow.addColorStop(0.22, 'rgba(225,90,25,0.38)');
            glow.addColorStop(0.50, 'rgba(180,30,60,0.16)');
            glow.addColorStop(1.00, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, W, horizY);

            // Sun disc
            const sunR    = Math.max(5, H * 0.021);
            const sunDisc = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
            sunDisc.addColorStop(0,   D.theme.sun);
            sunDisc.addColorStop(0.6, D.theme.grd);
            sunDisc.addColorStop(1,   D.theme.hor);
            ctx.fillStyle = sunDisc;
            ctx.beginPath();
            ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
            ctx.fill();

            // Horizon light spill (warm band just above & below horizon)
            const spill = ctx.createLinearGradient(0, horizY - H * 0.09, 0, horizY);
            spill.addColorStop(0, 'rgba(255,200,70,0)');
            spill.addColorStop(1, 'rgba(255,200,70,0.42)');
            ctx.fillStyle = spill;
            ctx.fillRect(0, horizY - H * 0.09, W, H * 0.09);

            // ── STARS ─────────────────────────────────────────────────────
            ctx.fillStyle = '#ffffff';
            D.stars.forEach(s => {
                const twinkle = 0.55 + 0.45 * Math.sin(t * 0.0014 + s.phase);
                ctx.globalAlpha = (s.y < 0.18 ? 0.6 : 0.25) * twinkle;
                ctx.beginPath();
                ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;

            // ── CLOUDS ────────────────────────────────────────────────────
            D.clouds.forEach(c => {
                c.x = ((c.x + c.spd + 0.1) % 1.2) - 0.1; // slow rightward drift, wrap
                const cx = c.x * W, cy = c.y * H;
                const cw = c.w * W, ch = c.h * H;
                // Bottom edge catches the most dawn light
                const cg = ctx.createLinearGradient(cx, cy - ch, cx, cy + ch);
                cg.addColorStop(0.0, `rgba(50,28,55,${c.a * 0.45})`);
                cg.addColorStop(0.5, `rgba(150,72,35,${c.a * 0.55})`);
                cg.addColorStop(1.0, `rgba(230,148,50,${c.a})`);
                ctx.fillStyle = cg;
                for (let b = 0; b < c.blobs; b++) {
                    const bx = cx + (b - (c.blobs - 1) * 0.5) * cw * 0.4;
                    const by = cy - Math.sin(b * 1.3) * ch * 0.4;
                    const bw = cw * (0.45 + Math.abs(Math.sin(b * 0.85)) * 0.22) * 0.5;
                    const bh = ch * (0.65 + Math.cos(b * 1.5) * 0.18) * 0.5;
                    ctx.beginPath();
                    ctx.ellipse(bx, by, Math.max(1, bw), Math.max(1, bh), 0, 0, Math.PI * 2);
                    ctx.fill();
                }
            });

            // ── FAR MOUNTAINS ─────────────────────────────────────────────
            ctx.beginPath();
            ctx.moveTo(0, H);
            D.far.forEach(p => ctx.lineTo(p.x * W, p.y * H));
            ctx.lineTo(W, H);
            ctx.closePath();
            // Silhouette tinted slightly by the dawn glow
            const farG = ctx.createLinearGradient(0, D.far.reduce((m,p)=>Math.min(m,p.y),1)*H, 0, horizY);
            farG.addColorStop(0, 'rgba(22,10,38,0.97)');
            farG.addColorStop(1, 'rgba(45,20,48,0.80)');
            ctx.fillStyle = farG;
            ctx.fill();

            // ── MID MOUNTAINS ─────────────────────────────────────────────
            ctx.beginPath();
            ctx.moveTo(0, H);
            D.mid.forEach(p => ctx.lineTo(p.x * W, p.y * H));
            ctx.lineTo(W, H);
            ctx.closePath();
            ctx.fillStyle = 'rgba(14,8,24,0.95)';
            ctx.fill();

            // ── NEAR HILLS ────────────────────────────────────────────────
            ctx.beginPath();
            ctx.moveTo(0, H);
            D.near.forEach(p => ctx.lineTo(p.x * W, p.y * H));
            ctx.lineTo(W, H);
            ctx.closePath();
            ctx.fillStyle = '#0a0616';
            ctx.fill();

            // ── PINE SILHOUETTES (planted on near ridge) ──────────────────
            ctx.fillStyle = '#050310';
            D.pines.forEach(pine => {
                const px  = pine.fx * W;
                const gy  = ridgeYAt(D.near, pine.fx);  // ground y at this pine's x
                const ph  = pine.h * H;
                const pw  = pine.w * W;
                // Two stacked triangles give a classic pine profile
                ctx.beginPath();
                ctx.moveTo(px,       gy - ph);
                ctx.lineTo(px - pw,  gy - ph * 0.40);
                ctx.lineTo(px + pw,  gy - ph * 0.40);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(px,            gy - ph * 0.52);
                ctx.lineTo(px - pw * 1.4, gy);
                ctx.lineTo(px + pw * 1.4, gy);
                ctx.closePath();
                ctx.fill();
            });

            // ── FOREGROUND EARTH ──────────────────────────────────────────
            ctx.beginPath();
            ctx.moveTo(0, H);
            D.fore.forEach(p => ctx.lineTo(p.x * W, p.y * H));
            ctx.lineTo(W, H);
            ctx.closePath();
            ctx.fillStyle = '#030208';
            ctx.fill();

            // ── HORIZON ATMOSPHERIC HAZE ──────────────────────────────────
            const haze = ctx.createLinearGradient(0, horizY - H * 0.04, 0, horizY + H * 0.07);
            haze.addColorStop(0,   'rgba(0,0,0,0)');
            haze.addColorStop(0.4, `rgba(200,100,30,0.14)`);
            haze.addColorStop(1,   'rgba(0,0,0,0)');
            ctx.fillStyle = haze;
            ctx.fillRect(0, horizY - H * 0.04, W, H * 0.11);
        }
        // ── END DAWN LANDSCAPE ───────────────────────────────────────────────

        // Deferred-spawn frame counter
        let _menuFrame = 0;

        function animateMenu() {
            const _t = Date.now();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawDawnBackground(ctx, canvas.width, canvas.height, _t);

            // ── DEFERRED SPAWN QUEUE ──────────────────────────────────────────
            if (window._menuSpawnQueue && window._menuSpawnQueue.length > 0) {
                window._menuSpawnQueue = window._menuSpawnQueue.filter(entry => {
                    if (_menuFrame >= entry.at) {
                        spawnUnit(entry.index);
                        return false; // remove from queue
                    }
                    return true;
                });
            }
            _menuFrame++;

            // Y-sort for painter's-algorithm depth
            backgroundUnits.sort((a, b) => a.y - b.y);

            // ── GROUND BAND (pixels) ──────────────────────────────────────────
            const _groundMin = canvas.height * 0.64;   // sky ceiling / horizon
            const _groundMax = canvas.height * 0.92;   // visible ground floor

            // Magnetic-pull parameters
            const EDGE_MARGIN   = 80;   // px from screen edge that activates pull
            const PULL_STRENGTH = 0.18; // acceleration per frame toward the edge
            const FALL_MARGIN   = 60;   // px below groundMax before fall-delete pull
            const GRAVITY       = 0.25; // px/frame² downward
            const JUMP_VY       = -5.5; // px/frame upward impulse
            const JUMP_CHANCE   = 0.003;// probability per frame of jumping (when on ground)

            const toDelete = [];

            backgroundUnits.forEach((unit, idx) => {
                unit.frame += 1;
                if (unit.immunityTimer > 0) unit.immunityTimer--;

                // ── STATE-MACHINE AI ──────────────────────────────────────────
                if (unit.stateTimer <= 0) {
                    const roll = Math.random();
                    if (roll < 0.28) {
                        unit.state = "idle";
                        unit.vx = 0;
                        unit.isAttacking = false;
                        unit.stateTimer = 50 + Math.random() * 70;
                    } else if (roll < 0.55) {
                        unit.state = "attack";
                        unit.vx = 0;
                        unit.isAttacking = true;
                        unit.mockUnit.facingDir = Math.random() > 0.5 ? 1 : -1;
                        unit.stateTimer = 80 + Math.random() * 100;
                    } else {
                        unit.state = "walk";
                        const spd = unit.isCavalry ? 2.4 : 1.1;
                        unit.vx = (Math.random() - 0.5) * spd * 2;
                        unit.isAttacking = false;
                        unit.stateTimer = 90 + Math.random() * 120;
                    }
                }
                unit.stateTimer--;

                // Sync facing direction with horizontal movement
                if (Math.abs(unit.vx) > 0.05) {
                    unit.mockUnit.facingDir = unit.vx > 0 ? 1 : -1;
                }

                // ── JUMP / GRAVITY ────────────────────────────────────────────
                // Ground level for this unit = _groundMax (flat gameplay band)
                const unitGroundY = _groundMax;

                // Spontaneous jump when on the ground
                if (unit.isOnGround && unit.jumpCooldown <= 0) {
                    if (Math.random() < JUMP_CHANCE) {
                        unit.vy_gravity = JUMP_VY;
                        unit.isOnGround = false;
                        unit.jumpCooldown = 180 + Math.floor(Math.random() * 300);
                    }
                }
                if (unit.jumpCooldown > 0) unit.jumpCooldown--;

                // Apply gravity
                if (!unit.isOnGround) {
                    unit.vy_gravity += GRAVITY;
                }

                // Integrate vertical position (gravity channel only)
                unit.y += unit.vy_gravity;

                // Sky ceiling — hard stop
                if (unit.y < _groundMin) {
                    unit.y = _groundMin;
                    unit.vy_gravity = Math.abs(unit.vy_gravity) * 0.3; // small bounce
                }

                // Ground landing
                if (unit.y >= unitGroundY) {
                    unit.y = unitGroundY;
                    unit.vy_gravity = 0;
                    unit.isOnGround = true;
                }

                // ── HORIZONTAL MOVEMENT ───────────────────────────────────────
                unit.x += unit.vx;

                // ── MAGNETIC EDGE FORCES & DELETION ──────────────────────────
                // Only active once immunity has expired (unit fully on-screen)
                if (unit.immunityTimer <= 0) {
                    let pulled = false;

                    // Left magnetic zone
                    if (unit.x < EDGE_MARGIN) {
                        unit.vx -= PULL_STRENGTH; // accelerate toward left edge
                        pulled = true;
                    }
                    // Right magnetic zone
                    if (unit.x > canvas.width - EDGE_MARGIN) {
                        unit.vx += PULL_STRENGTH; // accelerate toward right edge
                        pulled = true;
                    }

                    // Delete once fully outside the screen
                    if (unit.x < -100 || unit.x > canvas.width + 100) {
                        toDelete.push(idx);
                        return;
                    }

                    // Bottom fall zone — pull downward then delete
                    if (unit.y > _groundMax + FALL_MARGIN) {
                        toDelete.push(idx);
                        return;
                    }
                }

                // ── SYNC MOCK-UNIT STATE FOR ANIMATION DRIVERS ───────────────
                const mu          = unit.mockUnit;
                const isMoving    = (unit.state === "walk") || !unit.isOnGround;
                const isAttacking = unit.isAttacking;

                if (isAttacking) {
                    mu.state = "attacking";
                    const maxCd = (unit.type === "archer" || unit.type === "horse_archer") ? 170 : 300;
                    mu.cooldown = Math.max(1, maxCd - ((unit.frame * 2) % maxCd));
                } else {
                    mu.state    = "idle";
                    mu.cooldown = 0;
                }

                // ── DRAW ──────────────────────────────────────────────────────
                ctx.save();
                ctx.translate(unit.x, unit.y);
                ctx.scale(RENDER_SCALE, RENDER_SCALE);

                try {
                    if (unit.isCavalry) {
                        if (typeof drawCavalryUnit === "function") {
                            drawCavalryUnit(
                                ctx, 0, 0,
                                isMoving,
                                unit.frame,
                                unit.factionColor,
                                isAttacking,
                                unit.type,
                                mu.side,
                                unit.unitName,
                                /*isFleeing*/     false,
                                mu.cooldown,
                                /*unitAmmo*/      10,
                                mu,
                                /*reloadProgress*/0
                            );
                        }
                    } else {
                        if (typeof drawInfantryUnit === "function") {
                            drawInfantryUnit(
                                ctx, 0, 0,
                                isMoving,
                                unit.frame,
                                unit.factionColor,
                                unit.type,
                                isAttacking,
                                mu.side,
                                unit.unitName,
                                /*isFleeing*/     false,
                                mu.cooldown,
                                /*unitAmmo*/      10,
                                mu,
                                /*reloadProgress*/0
                            );
                        }
                    }
                } catch (e) {
                    // Silently swallow rare draw errors
                }

                ctx.restore();
            });

            // ── REMOVE DELETED UNITS (reverse order to keep indices valid) ────
            for (let i = toDelete.length - 1; i >= 0; i--) {
                backgroundUnits.splice(toDelete[i], 1);
            }

            // ── REPLENISH: spawn a new unit for each one deleted ──────────────
            const deficit = UNIT_COUNT - backgroundUnits.length
                          - (window._menuSpawnQueue ? window._menuSpawnQueue.length : 0);
            for (let s = 0; s < deficit; s++) {
                // Short delay so they don't all pour in at once
                const poolIdx = Math.floor(Math.random() * MENU_UNIT_POOL.length);
                if (!window._menuSpawnQueue) window._menuSpawnQueue = [];
                window._menuSpawnQueue.push({
                    at: _menuFrame + 30 + Math.floor(Math.random() * 90),
                    index: poolIdx
                });
            }

            menuAnimFrameId = requestAnimationFrame(animateMenu);
        }

        animateMenu();
    };


})();