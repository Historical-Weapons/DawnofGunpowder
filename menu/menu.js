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
        menu.style.background = "#3e2723";
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
            tag:      "JAPAN TUTORIAL",
            tagColor: "#c62828",
            available: true
        },
        {
            id:       2,
            title:    "The Silk Road Fractures",
            subtitle: "Central Asia — coming soon",
            desc:     "A vast campaign across the Steppe and Tarim Basin as rival Khanates " +
                      "vie for dominance of the ancient trade routes.",
            tag:      "UNDER CONSTRUCTION",
            tagColor: "#555",
            available: false
        },
        {
            id:       3,
            title:    "The Southern Dynasties",
            subtitle: "Vietnam & Southern China — coming soon",
            desc:     "Navigate the jungle warfare and river deltas of South-East Asia " +
                      "as the Tran Dynasty repels invasion from the north.",
            tag:      "UNDER CONSTRUCTION",
            tagColor: "#555",
            available: false
        },
        {
            id:       4,
            title:    "The Great Divergence",
            subtitle: "Korea — coming soon",
            desc:     "Lead the Goryeo court through decades of Mongol subjugation " +
                      "and fight for the peninsula's independence.",
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


const quitBtn = createBtn("Quit Game", () => {
    quitGame();
});
quitBtn.style.marginTop = "clamp(20px, 5vh, 40px)";
 

// Start hidden to match your "Manual First" flow
customBattleBtn.style.display = "none";


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
        DAWN OF GUNPOWDER:<br><span style="font-size: 0.7em; color: #d4b886;">EMPIRE OF THE 13TH CENTURY</span>
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
        credits.innerText = "by Historical Weapons YouTube Channel";
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
uiContainer.appendChild(loadGameBtn); // Surgery 7: Appended here
uiContainer.appendChild(optionsBtn);
uiContainer.appendChild(quitBtn); // <--- ADD THIS LINE
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
        
        const unitTypes = [
            { type: "gun", name: "Handgunner", isCavalry: false },
            { type: "crossbow", name: "Repeater Crossbowman", isCavalry: false },
            { type: "crossbow", name: "Poison Crossbowman", isCavalry: false },
            { type: "spearman", name: "Firelance", isCavalry: false },
            { type: "peasant", name: "Bomb", isCavalry: false },
            { type: "archer", name: "Rocket", isCavalry: false }
   
        ];

        const headwears = ["none", "rice_hat", "mongol_helmet"];

// REDUCED UNIT COUNT TO 20 (Slightly less crowded)
        for(let i = 0; i < 20; i++) { 
            let uType = unitTypes[Math.floor(Math.random() * unitTypes.length)];
            let fColor = Math.random() > 0.5 ? "#7b1a1a" : "#4a4a4a";
            // Assign Mongol helmets mostly to horse archers/grey faction, Rice hats to red faction
            let hat = "none";
            if (uType.isCavalry) hat = "mongol_helmet";
            else if (fColor === "#7b1a1a" && Math.random() > 0.5) hat = "rice_hat";
            else if (fColor === "#4a4a4a" && Math.random() > 0.5) hat = "mongol_helmet";

backgroundUnits.push({
                x: Math.random() * canvas.width,  // USE CANVAS WIDTH
                y: Math.random() * canvas.height, // USE CANVAS HEIGHT
                vx: 0,
                vy: 0,
                type: uType.type,
                unitName: uType.name,
                isCavalry: uType.isCavalry,
                headwear: hat,
                frame: Math.random() * 100,
                dir: Math.random() > 0.5 ? 1 : -1,
                factionColor: fColor,
                isAttacking: false,
                state: "idle",   // New State Machine
                stateTimer: 0
            });
        }

        function drawEpicUnit(ctx, unit) {
            ctx.save();
            ctx.translate(unit.x, unit.y);
            
            let dir = unit.dir;
            ctx.scale(dir, 1);
            let userDir = 1; 

            let isMoving = (unit.state === "walk");
            let bob = isMoving ? Math.sin(unit.frame * 0.4) * 2 : 0;
            let weaponBob = unit.isAttacking ? Math.sin(unit.frame * 0.8) * 4 : (isMoving ? bob : 0);
            
            let type = unit.type;
            let unitName = unit.unitName;
            let frame = unit.frame;
            let isAttacking = unit.isAttacking;

            // --- CAVALRY RENDERING ---
            if (unit.isCavalry) {
               // --- START OF YOUR HORSE CODE ---
        let legSwing = isMoving ? Math.sin(frame * 0.4) * 8 : 0;
        let bob = isMoving ? Math.sin(frame * 0.4) * 2 : 0;
        let riderBob = isMoving ? Math.sin(frame * 0.4 + 0.5) * 1.5 : 0;

        ctx.lineCap = "round"; ctx.lineJoin = "round";

        let mountColor = "#795548"; // Default Horse Brown

        // 1. BACK LEGS
        ctx.strokeStyle = "#3e2723"; 
        ctx.lineWidth = 1.8; 
        ctx.beginPath(); ctx.moveTo(-4, 2); ctx.lineTo(-6 - legSwing, 10);
        ctx.moveTo(3, 2); ctx.lineTo(1 - legSwing, 10); ctx.stroke();

        // 2. MOUNT BODY
        ctx.fillStyle = mountColor; ctx.strokeStyle = "#3e2723";
        ctx.beginPath(); 
        ctx.ellipse(0, bob, 11, 7, 0, 0, Math.PI * 2); 
        ctx.fill(); ctx.stroke();

        // 3. RIDER 
        ctx.save();
        ctx.translate(-1, -4 + bob + riderBob);
        
        ctx.fillStyle = unit.factionColor; ctx.strokeStyle = "#1a1a1a";
        ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.lineTo(2, -9); ctx.lineTo(-2, -9);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        
        // Head
        ctx.fillStyle = "#ffccbc";
        ctx.beginPath(); ctx.arc(0, -11, 3, 0, Math.PI * 2); ctx.fill();

        // --- ADDING THE HEADWEAR TO THE RIDER ---
        if (unit.headwear === "mongol_helmet") {
            ctx.fillStyle = "#9e9e9e"; ctx.strokeStyle = "#424242"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(0, -11, 4, Math.PI, 0); ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#616161"; ctx.fillRect(-0.5, -16, 1, 3); // Spike
        }

        let weaponBob = isAttacking ? Math.sin(frame * 0.8) * 4 : 0;
        
        // --- WEAPON (Khatra Bow logic) ---
        if (unit.type === "horse_archer") {
            let pull = isAttacking ? (Math.sin(frame * 0.5) * 0.5 + 0.5) : 0;
            ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(2, -14); ctx.quadraticCurveTo(10, -10, 6, -6 + weaponBob);
            ctx.quadraticCurveTo(10, -2, 2, 2); ctx.stroke();
        }
        ctx.restore();
        // --- END OF YOUR HORSE CODE ---
            } 
            // --- INFANTRY RENDERING ---
            else {
                ctx.fillStyle = unit.factionColor;
                ctx.fillRect(-4, -10 + bob, 8, 10); // Torso
                ctx.fillStyle = "#ffccbc"; // Skin
                ctx.beginPath(); ctx.arc(0, -14 + bob, 4, 0, Math.PI*2); ctx.fill(); // Head
            }

            // --- HEADWEAR ---
            let headYOffset = unit.isCavalry ? 3 : 0; // Adjust hat height if on horseback
            if (unit.headwear === "rice_hat") {
                ctx.fillStyle = "#d4b886"; ctx.strokeStyle = "#8d6e63"; ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(-7, -15 + bob + headYOffset);
                ctx.lineTo(7, -15 + bob + headYOffset);
                ctx.lineTo(0, -21 + bob + headYOffset);
                ctx.closePath(); ctx.fill(); ctx.stroke();
            } else if (unit.headwear === "mongol_helmet") {
                ctx.fillStyle = "#9e9e9e"; ctx.strokeStyle = "#424242"; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(0, -14 + bob + headYOffset, 4.5, Math.PI, 0); ctx.fill(); ctx.stroke(); // Dome
                ctx.fillStyle = "#616161";
                ctx.beginPath(); ctx.moveTo(-1.5, -18.5 + bob + headYOffset); ctx.lineTo(1.5, -18.5 + bob + headYOffset); ctx.lineTo(0, -23 + bob + headYOffset); ctx.fill(); // Spike
                // Flaps
                ctx.fillStyle = "#4e342e";
                ctx.fillRect(-5, -14 + bob + headYOffset, 3, 5);
                ctx.fillRect(2, -14 + bob + headYOffset, 3, 5);
            }

            // --- WEAPONS ---
            if (type === "peasant") {
                let tipX = (12 + weaponBob) * userDir;
                let tipY = -12 + weaponBob;
                ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(-2 * userDir, -4); ctx.lineTo(tipX, tipY); ctx.stroke();
            } 
            else if (type === "spearman" || unitName.includes("Firelance")) {
                if (unitName.includes("Firelance")) {
                    ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 1.5;
                    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(21 + weaponBob, -8); ctx.stroke();
                    ctx.fillStyle = "#212121"; ctx.fillRect(14 + weaponBob, -10, 7, 4);
                    ctx.fillStyle = "#9e9e9e"; ctx.beginPath();
                    ctx.moveTo(21 + weaponBob, -8); ctx.lineTo(24 + weaponBob, -10);
                    ctx.lineTo(29 + weaponBob, -8); ctx.lineTo(24 + weaponBob, -6);
                    ctx.closePath(); ctx.fill();
                    if (isAttacking) {
                        ctx.fillStyle = "#ff5722"; ctx.beginPath(); ctx.arc(22 + weaponBob, -8, 1.5 + Math.random() * 1.5, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = "rgba(200, 200, 200, 0.4)";
                        ctx.beginPath(); ctx.arc(24 + weaponBob, -10, 4 + Math.random()*6, 0, Math.PI * 2); ctx.fill();
                    }
                } else {
                    ctx.strokeStyle = "#4e342e"; ctx.lineWidth = 2.5;
                    ctx.beginPath(); ctx.moveTo(-6 * userDir, 4); ctx.lineTo((28 + weaponBob) * userDir, -24 + weaponBob); ctx.stroke();
                }
            }
            else if (type === "gun") {
                ctx.strokeStyle = "#424242"; ctx.lineWidth = 3.5;
                ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(14 + weaponBob, -8); ctx.stroke();
                if (isAttacking) { 
                    ctx.fillStyle = "#ff5722"; ctx.beginPath(); ctx.arc(16 + weaponBob, -9, 2 + Math.random()*2, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = "rgba(180, 180, 180, 0.5)"; 
                    ctx.beginPath(); ctx.arc(20 + weaponBob, -11, 6 + Math.random()*6, 0, Math.PI * 2); ctx.fill();
                }
            }
            else if (type === "crossbow") { 
                if (unitName === "Repeater Crossbowman") {
                    ctx.save();
                    let shakeX = isAttacking ? Math.sin(Date.now() / 30) * 1.5 : 0;
                    let shakeY = isAttacking ? Math.cos(Date.now() / 30) * 1.2 : 0;
                    ctx.translate(shakeX, shakeY);
                    ctx.fillStyle = "#3e2723"; ctx.fillRect(-3, -12 + bob, 6, 6); 
                    ctx.fillStyle = "#4e342e"; ctx.fillRect(3, -11 + bob, 18, 3); 
                    ctx.save();
                    ctx.translate(5, -17 + bob); 
                    ctx.fillStyle = "#5d4037"; ctx.fillRect(0, 0, 14, 6); 
                    ctx.strokeStyle = "#2b1b17"; ctx.lineWidth = 0.8; ctx.strokeRect(0, 0, 14, 6);
                    ctx.restore();
                    ctx.fillStyle = "#212121"; ctx.fillRect(21, -11 + bob, 2, 3); 
                    ctx.restore();
                }
                else if (unitName === "Poison Crossbowman") {
                    ctx.fillStyle = "#5d4037"; ctx.fillRect(0, -10, 12, 3); 
                    ctx.strokeStyle = "#2e7d32"; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(10, -8.5, 6.5, -Math.PI/2, Math.PI/2); ctx.stroke();
                    ctx.strokeStyle = "rgba(200, 255, 200, 0.4)"; ctx.lineWidth = 0.5;
                    ctx.beginPath(); ctx.moveTo(10, -15); ctx.lineTo(10, -2); ctx.stroke();
                }
            }
            else if (type === "horse_archer") {
                let time = isAttacking ? Date.now() / 150 : 0; 
                let pull = isAttacking ? (Math.sin(time) * 0.5 + 0.5) : 0; 
                let khatra = isAttacking ? ((1 - pull) * 0.4) : 0; 
                let handX = 6 + weaponBob;
                let handY = -6; 

                ctx.save();
                ctx.translate(handX, handY);
                ctx.rotate(khatra); 
                ctx.translate(-handX, -handY);

                ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(handX - 4, -14); 
                ctx.quadraticCurveTo(handX + 6, -10, handX, handY); 
                ctx.quadraticCurveTo(handX + 6, -2, handX - 4, 2); 
                ctx.stroke();

                ctx.strokeStyle = "rgba(255, 255, 255, 0.6)"; ctx.lineWidth = 0.5;
                ctx.beginPath(); ctx.moveTo(handX - 4, -14); 
                let stringX = (handX - 4) - (pull * 8); 
                ctx.lineTo(stringX, handY); 
                ctx.lineTo(handX - 4, 2); 
                ctx.stroke();
                ctx.restore();
            }
            else if (unitName === "Bomb" || type === "Bomb") {
                ctx.save();
                if (isAttacking) ctx.rotate(Math.PI / 4); 
                else ctx.rotate(-Math.PI / 10); 
                ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -22); ctx.stroke();
                ctx.fillStyle = "#424242"; ctx.beginPath(); ctx.arc(3, -14, 4, 0, Math.PI * 2); ctx.fill();
                if(isAttacking) { ctx.fillStyle = "#ff9800"; ctx.beginPath(); ctx.arc(3, -16, 2, 0, Math.PI * 2); ctx.fill(); }
                ctx.restore();
            }
            else if (unitName === "Rocket" || type === "Rocket") {
                ctx.save();
                ctx.translate(4 * userDir, -6);
                ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 2;
                for(let i=-1; i<=1; i++) { 
                    ctx.beginPath(); ctx.moveTo(-8 * userDir, i*2); ctx.lineTo(10 * userDir + weaponBob, -4 + i*2); ctx.stroke();
                }
                ctx.fillStyle = "#424242"; ctx.fillRect(-10 * userDir, -3, 4 * userDir, 6); 
                if (isAttacking) {
                    ctx.fillStyle = "rgba(180, 180, 180, 0.6)";
                    for(let j=0; j<4; j++) {
                        ctx.beginPath(); ctx.arc(-14 * userDir - (j*6), 2 + (Math.random()*6-3), 4+j, 0, Math.PI*2); ctx.fill();
                    }
                }
                ctx.strokeStyle = "#ff9800"; ctx.lineWidth = 1; 
                ctx.beginPath(); ctx.moveTo(-10 * userDir, 0); ctx.lineTo(-14 * userDir, 4); ctx.stroke();
                ctx.restore();
            }

            ctx.restore();
        }

        function animateMenu() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            if (Math.random() < 0.2) {
                particles.push({
                    x: Math.random() * canvas.width,
                    y: canvas.height + 10,
                    s: Math.random() * 3 + 1,
                    a: Math.random() * 0.5 + 0.1
                });
            }
            
            ctx.fillStyle = "#ff5722";
            for(let i = particles.length - 1; i >= 0; i--) {
                let p = particles[i];
                p.y -= p.s;
                p.x += Math.sin(p.y / 20) * 2;
                ctx.globalAlpha = p.a;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI*2); ctx.fill();
                if (p.y < -10) particles.splice(i, 1);
            }
            ctx.globalAlpha = 1.0;

            backgroundUnits.sort((a, b) => a.y - b.y);

            backgroundUnits.forEach(unit => {
                unit.frame += 1;

                // --- STATE MACHINE "AI" FOR MORE ACTIVITY ---
                if (unit.stateTimer <= 0) {
                    let roll = Math.random();
                    if (roll < 0.3) {
                        unit.state = "idle";
                        unit.vx = 0; unit.vy = 0;
                        unit.isAttacking = false;
                        unit.stateTimer = 40 + Math.random() * 60;
                    } else if (roll < 0.6) {
                        unit.state = "attack";
                        unit.vx = 0; unit.vy = 0;
                        unit.isAttacking = true;
                        unit.dir = Math.random() > 0.5 ? 1 : -1; // Snap to face an "enemy"
                        unit.stateTimer = 60 + Math.random() * 60;
                    } else {
                        unit.state = "walk";
                        // Cavalry move faster
                        let speedMult = unit.isCavalry ? 3 : 1.5; 
                        unit.vx = (Math.random() - 0.5) * speedMult;
                        unit.vy = (Math.random() - 0.5) * (speedMult / 2);
                        unit.dir = unit.vx > 0 ? 1 : -1;
                        unit.isAttacking = false;
                        unit.stateTimer = 100 + Math.random() * 100;
                    }
                }
                unit.stateTimer--;

                unit.x += unit.vx;
                unit.y += unit.vy;

                // Screen wrapping
                if (unit.x > canvas.width + 20) unit.x = -20;
                if (unit.x < -20) unit.x = canvas.width + 20;
                if (unit.y > canvas.height + 20) unit.y = -20;
                if (unit.y < -20) unit.y = canvas.height + 20;

                ctx.save();
                ctx.translate(unit.x, unit.y);
                ctx.scale(2.5, 2.5); 
                drawEpicUnit(ctx, { ...unit, x: 0, y: 0 });
                ctx.restore();
            });

            menuAnimFrameId = requestAnimationFrame(animateMenu);
        }

        animateMenu();
    };


})();