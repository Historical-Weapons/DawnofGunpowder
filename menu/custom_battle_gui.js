// ============================================================================
// EMPIRE OF THE 13TH CENTURY - CUSTOM BATTLE SYSTEM (ROME 2 STYLE UI)
// ============================================================================
function isValidSiegeUnit(unitName, unitData) {
    if (!unitData) return false;
    const name = String(unitName).toLowerCase();
    const role = String(unitData.role || "").toLowerCase();
    const combined = name + " " + role;

    // EXCEPTION: Always allow Generals/Commanders
    if (combined.match(/(general|commander)/) || unitData.isCommander) return true;

    // BAN: Any unit matching these strings
    const cavRegex = /(cav|cavalry|keshig|horse|lancer|mount|camel|eleph|knight)/;
    if (cavRegex.test(combined)) return false;

    return true;
}
// Apply this inside your Randomize/Auto-fill loop:
function autoFillRoster(setup, budget) {
    let currentCost = 0;
    const availableUnits = Object.keys(UnitRoster.allUnits);
    
    // Safety counter to prevent infinite loops if roster is empty
    let attempts = 0; 
    
    while (currentCost < budget && attempts < 500) {
        attempts++;
        let randomUnitName = availableUnits[Math.floor(Math.random() * availableUnits.length)];
        let unitData = UnitRoster.allUnits[randomUnitName];

        // --- THE FIX: Skip if it's a Siege and the unit is Cavalry ---
        if (customBattleMode === "siege") {
            if (!isValidSiegeUnit(randomUnitName, unitData)) {
                continue; // Skip to next attempt without spending budget or slots
            }
        }

        if (currentCost + unitData.cost <= budget) {
            setup.roster.push(randomUnitName);
            currentCost += unitData.cost;
        }
    }
}

(function () {
 let customBattleMode = "field"; // Can be "field" or "siege"
    // --- STATE MANAGEMENT ---
    let customBattleActive = false;
// Give siege way bigger budget
if (customBattleMode === "siege") {
    customFunds = 3000;    
} else {
    customFunds = 1000;
}
    
    let playerSetup = { faction: "Hong Dynasty", color: "#d32f2f", roster: [], cost: 0 };
    let enemySetup = { faction: "Great Khaganate", color: "#1976d2", roster: [], cost: 0 };
    
    let selectedMap = "Plains";
    let originalLeaveBattlefield = null; 
    let preBattleStats = {}; // For the post-battle report

const MAP_TYPES = [
        "Plains", "Forest", "Dense Forest", "Steppe", 
        "Desert", "Highlands", "Large Mountains",
        "River", "Coastal", "Ocean" // <-- ADDED NAVAL/RIVER
    ];
    let pNavalShipSize = "MEDIUM";
    let eNavalShipSize = "MEDIUM";


const FactionUnitRules = {
        
"Tran Realm": {
    bannedRoles: [], // Clear this to allow roles like Cavalry (which Elephants use)
    bannedUnits: [
        "Horse Archer", "War Elephant", "Slinger","Heavy Horse Archer", "Lancer", "Heavy Lancer", 
        "Elite Lancer", "Keshig", "Camel Cannon", "Hand Cannoneer", "Rocket","Heavy Crossbowman", "Repeater Crossbowman", "Glaiveman","Heavy Two Handed"
    ] // Manually exclude all "Horse-like" names and specific tech
},

"Dab Tribes": {
    bannedRoles: [], // Clear this to allow elephants
    bannedUnits: [
        "Horse Archer", "Heavy Horse Archer", "Lancer", "Heavy Lancer", 
        "Elite Lancer", "Keshig", "Camel Cannon","Heavy Firelance", "Firelance", "Bomb", "Slinger", "Hand Cannoneer", "Rocket","Heavy Crossbowman", "Repeater Crossbowman", "Glaiveman"
    ] 
},
        "Great Khaganate": {
            // "Only Cavalry and Militia"
            // We ban every role that ISN'T cavalry, horse_archer, or basic infantry.
            bannedRoles: [
                 "pike", "two_handed", "crossbow", "throwing", "bomb", 
                "Rocket", "Repeater Crossbowman"
            ],
            // Then we ban all "Infantry" role units EXCEPT the "Militia"
            bannedUnits: ["Glaiveman", "War Elephant", "Slinger","Camel Cannon","Elite Lancer"] 
        },

        "Yamato Clans": {
            // No gunpowder, no crossbows, no elephants.
            bannedRoles: ["gunner", "mounted_gunner", "firelance", "Rocket", "crossbow"],
            bannedUnits: ["War Elephant", "Poison Crossbowman", "Repeater Crossbowman", "Camel Cannon", "Keshig","Slinger","Elite Lancer","Shielded Infantry", "Javelinier"]
        },

        "Xiaran Dominion": {
              bannedRoles: [], 
            bannedUnits: ["War Elephant", "Keshig","Slinger","Javelinier", "Poison Crossbowman","Elite Lancer", "Repeater Crossbowman","Heavy Crossbowman","Heavy Firelance", "Heavy Lancer","Heavy Horse Archer", "Glaiveman","Heavy Two Handed","Rocket"]
        },

        "Hong Dynasty": {
            bannedRoles: [], 
            // Banned Xia's unique tech and the nomad elites
            bannedUnits: ["War Elephant", "Keshig", "Camel Cannon","Slinger","Javelinier", "Poison Crossbowman","Elite Lancer", "Hand Cannoneer", "Lancer", "Heavy Lancer","Horse Archer","Heavy Firelance"] 
        },

        "Jinlord Confederacy": {
            bannedRoles: ["Rocket", "bomb"], 
            bannedUnits: ["War Elephant","Heavy Lancer", "Camel Cannon", "Keshig","Slinger","Javelinier", "Poison Crossbowman", "Repeater Crossbowman", "Glaiveman","Lancer","Crossbowman"]
        },

        "Goryun Kingdom": {
            bannedRoles: ["mounted_gunner", "gunner"],
            bannedUnits: ["War Elephant", "Camel Cannon", "Hand Cannoneer", "Keshig","Slinger","Javelinier", "Poison Crossbowman","Elite Lancer","Heavy Horse Archer","Heavy Lancer","Heavy Two Handed", "Heavy Crossbowman", "Glaiveman","Light Two Handed","Lancer"]
        },

        "High Plateau Kingdoms": {
            bannedRoles: ["gunner", "mounted_gunner", "Rocket", "bomb", "firelance"],
            bannedUnits: ["War Elephant", "Camel Cannon", "Hand Cannoneer", "Heavy Lancer", "Elite Lancer", "Keshig", "Poison Crossbowman", "Repeater Crossbowman","Crossbowman","Heavy Crossbowman","Heavy Two Handed", "Glaiveman","Heavy Horse Archer"]
        }
    };

// --- NEW FUNCTION: Filters and Sorts units based on the rules above ---
    function getAvailableUnitsForFaction(factionName) {
        let available = [];
        const rules = FactionUnitRules[factionName] || { bannedRoles: [], bannedUnits: [] };
        const bannedRoles = rules.bannedRoles || [];
        const bannedUnits = rules.bannedUnits || [];

        const roleCav = typeof ROLES !== 'undefined' ? ROLES.CAVALRY : "Cavalry";
        const roleHorseArch = typeof ROLES !== 'undefined' ? ROLES.HORSE_ARCHER : "Horse Archer";
        const roleMountedGun = typeof ROLES !== 'undefined' ? ROLES.MOUNTED_GUNNER : "Mounted Gunner";

        for (let unitKey in UnitRoster.allUnits) {
            // Never put commanders in the standard catalog
            if (["Commander", "General", "Mounted General"].includes(unitKey)) continue;

            let template = UnitRoster.allUnits[unitKey];
            let role = template.role;

            // ---> NEW HOOK: STRICT SIEGE BAN <---
            // Completely strips cavalry/mounted units from the pool if in Siege Mode
            if (typeof customBattleMode !== 'undefined' && customBattleMode === "siege") {
                if (!isValidSiegeUnit(unitKey, template)) continue;
            }

            // 1. Check if unit is specifically banned
            if (bannedUnits.includes(unitKey)) continue;

            // 2. Check if the unit's role is banned
            if (bannedRoles.includes(role)) continue; 

            // (Optional) Catch-all for hardcoded string bans vs constant bans
            if (bannedRoles.includes("Cavalry") && role === roleCav) continue;
            if (bannedRoles.includes("Horse Archer") && role === roleHorseArch) continue;
            if (bannedRoles.includes("Mounted Gunner") && role === roleMountedGun) continue;

            available.push(unitKey);
        }

        return available.sort();
    }

    // Dummy unit object to prevent render crashes in infscript/cavscript
    const dummyUnit = { id: 1, stats: { ammo: 10 }, ammo: 10, state: "idle" };

    // --- MAIN ENTRY POINT ---
    window.showCustomBattleMenu = function (reportData = null) {
		
		const menu = document.createElement("div");
    menu.id = "custom-battle-menu"; // <--- This MUST match the ID used in save_system.js
    // ...
		
        if (customBattleActive && !reportData) return;
        customBattleActive = true;

        // Ensure global game is paused
        window.isPaused = true;
        if (typeof closeParleUI === 'function') closeParleUI();

        // Cleanup existing menu if re-opening
        const existing = document.getElementById("cb-menu-container");
        if (existing) existing.remove();

        // 1. MAIN CONTAINER (The Rome II Vibe)
        const container = document.createElement("div");
        container.id = "cb-menu-container";
        container.style.position = "fixed";
        container.style.top = "0"; container.style.left = "0";
        container.style.width = "100%"; container.style.height = "100%";
        container.style.background = "#1a1a1a"; // Fallback to dark grey
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.zIndex = "11000";
        container.style.fontFamily = "Georgia, serif";
        container.style.color = "#e0e0e0";

        // 2. HEADER (Settings & Funds)
        const header = document.createElement("div");
        header.style.height = "80px";
        header.style.background = "linear-gradient(to bottom, #2b2b2b, #111)";
        header.style.borderBottom = "2px solid #d4b886";
        header.style.display = "flex";
        header.style.justifyContent = "space-between";
        header.style.alignItems = "center";
        header.style.padding = "0 30px";
        header.style.boxShadow = "0 4px 15px rgba(0,0,0,0.8)";

        const titleBox = document.createElement("div");
        titleBox.innerHTML = `<h1 style="margin: 0; color: #f5d76e; letter-spacing: 3px; font-size: 24px;">CUSTOM BATTLE</h1>`;
        
        const settingsBox = document.createElement("div");
        settingsBox.style.display = "flex";
        settingsBox.style.gap = "5px";
        settingsBox.style.alignItems = "center";

settingsBox.innerHTML = `
        <div>
            <label style="color: #a1887f; font-size: 12px; text-transform: uppercase;">Map</label><br>
            <select id="cb-map-select" 
                style="background: #3e2723; color: #fff; border: 1px solid #d4b886; padding: 5px; font-family: Georgia; ${customBattleMode === "siege" ? "opacity: 0.5;" : ""}" 
                ${customBattleMode === "siege" ? "disabled" : ""}> 
                ${customBattleMode === "siege" 
                    ? `<option>Defender's City</option>` 
                    : MAP_TYPES.map(m => `<option value="${m}" ${m === selectedMap ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
        </div>
        <div>
            <label style="color: #a1887f; font-size: 12px; text-transform: uppercase;">Type</label><br>
            <select id="cb-mode-select" style="background: #3e2723; color: #ff9800; border: 1px solid #d4b886; padding: 5px;">
                <option value="field" ${customBattleMode === "field" ? 'selected' : ''}>Skirmish</option>
                <option value="siege" ${customBattleMode === "siege" ? 'selected' : ''}>Siege</option>
            </select>
        </div>

        <div id="cb-ship-box" style="display: none; gap: 5px;">
            <div>
                <label style="color: #4caf50; font-size: 12px; text-transform: uppercase;">P. Ship</label><br>
                <select id="cb-pship-select" style="background: #3e2723; color: #fff; border: 1px solid #d4b886; padding: 5px;">
                    <option value="LIGHT">Light</option>
                    <option value="MEDIUM" selected>Medium</option>
                    <option value="HEAVY">Heavy</option>
                </select>
            </div>
            <div>
                <label style="color: #f44336; font-size: 12px; text-transform: uppercase;">E. Ship</label><br>
                <select id="cb-eship-select" style="background: #3e2723; color: #fff; border: 1px solid #d4b886; padding: 5px;">
                    <option value="LIGHT">Light</option>
                    <option value="MEDIUM" selected>Medium</option>
                    <option value="HEAVY">Heavy</option>
                </select>
            </div>
        </div>

        <div>
            <label style="color: #a1887f; font-size: 12px; text-transform: uppercase;">Funds</label><br>
            <input id="cb-funds-input" type="number" value="${customFunds}" min="100" max="4000" step="100"style="background: #3e2723; color: #f5d76e; border: 1px solid #d4b886; padding: 5px; width: 100px; font-family: Georgia; text-align: right;">
        </div>
        `;

const actionBox = document.createElement("div");
        const backBtn = createCBBtn("Main Menu", () => exitCustomBattleMenu());
        const randomBtn = createCBBtn("🎲 Random Battle", () => launchRandomBattle());
        const startBtn = createCBBtn("Start Battle", () => launchCustomBattle());
        
        actionBox.appendChild(backBtn);
        actionBox.appendChild(randomBtn);
        actionBox.appendChild(startBtn);

        header.appendChild(titleBox);
        header.appendChild(settingsBox);
        header.appendChild(actionBox);

 // 3. ARMIES SPLIT SCREEN
        const body = document.createElement("div");
        body.style.display = "flex";
        body.style.flex = "1";
        body.style.overflow = "hidden";

        // Left: Player | Right: Enemy
        const playerPanel = createArmyPanel("ATTACKER (YOU)", playerSetup, "player");
        const enemyPanel = createArmyPanel("DEFENDER (AI)", enemySetup, "enemy");

        playerPanel.style.borderRight = "2px solid #000";

        body.appendChild(playerPanel);
        body.appendChild(enemyPanel);

        container.appendChild(header);
        container.appendChild(body);
        document.body.appendChild(container);

        // --- REVISED EVENT LISTENERS ---
        document.getElementById("cb-funds-input").addEventListener("change", (e) => {
            let val = parseInt(e.target.value) || 1000;
            
 
            customFunds = Math.max(100, Math.min(4000, val));
            
            // Sync the input box display so it doesn't show the illegal number
            e.target.value = customFunds; 
            
            updateUI();
        });
		
document.getElementById("cb-mode-select").addEventListener("change", (e) => {
    customBattleMode = e.target.value;

    const mapSelect = document.getElementById("cb-map-select");
    if (mapSelect) {
        if (customBattleMode === "siege") {
			selectedMap = "Siege City"; // <--- ADD THIS LINE
            // Lock the dropdown and override the text to explain why
            mapSelect.disabled = true;
            mapSelect.style.opacity = "0.5";
            mapSelect.innerHTML = `<option>Defender's City</option>`;
        } else {
            // Unlock and restore the standard field maps
            mapSelect.disabled = false;
            mapSelect.style.opacity = "1";
            mapSelect.innerHTML = MAP_TYPES.map(m => 
                `<option value="${m}" ${m === selectedMap ? 'selected' : ''}>${m}</option>`
            ).join('');
        }
        
        // Handle the visual toggle for the naval ships box
        const shipBox = document.getElementById("cb-ship-box");
        if (shipBox) {
            shipBox.style.display = (customBattleMode === "field" && ["Ocean", "Coastal"].includes(selectedMap)) ? "flex" : "none";
        }
    }

    // 🔴 SIMPLE FIX: WIPE ALL UNITS when switching mode
    playerSetup.roster = [];
    playerSetup.cost = 0;
    enemySetup.roster = [];
    enemySetup.cost = 0;

    // Refresh BOTH unit-card panels so visuals update
    if (window.__cbPanels?.player) {
        window.__cbPanels.player.refreshCatalog();
        window.__cbPanels.player.updateUI();
    }
    if (window.__cbPanels?.enemy) {
        window.__cbPanels.enemy.refreshCatalog();
        window.__cbPanels.enemy.updateUI();
    }
});


document.getElementById("cb-map-select").addEventListener("change", (e) => {
    selectedMap = e.target.value;
    
    // Show/Hide ship selectors based on map AND mode
    const shipBox = document.getElementById("cb-ship-box");
    if (shipBox) {
        shipBox.style.display = (customBattleMode === "field" && (selectedMap === "Ocean" || selectedMap === "Coastal")) ? "flex" : "none";
    }
});


        // Ensure it runs once on UI load to show/hide correctly
        const shipBox = document.getElementById("cb-ship-box");
        if (shipBox) shipBox.style.display = (selectedMap === "Ocean" || selectedMap === "Coastal") ? "flex" : "none";

        // Listen for ship size changes
        document.getElementById("cb-pship-select").addEventListener("change", (e) => pNavalShipSize = e.target.value);
        document.getElementById("cb-eship-select").addEventListener("change", (e) => eNavalShipSize = e.target.value);
		
        updateUI();

        // 4. POST BATTLE REPORT OVERLAY
        if (reportData) {
            showReportModal(container, reportData);
        }
    };

 
   // --- PANEL CREATION (Updated with Clear All Button) ---
   function createArmyPanel(title, setupObj, side) {
    const panel = document.createElement("div");
    panel.style.flex = "1";
    panel.style.display = "flex";
    panel.style.flexDirection = "column";
	panel.style.minHeight = "0";
	panel.style.overflow = "hidden";

    panel.style.background = "rgba(20, 20, 20, 0.8)";
    
    // Header setup
    const pHeader = document.createElement("div");
    pHeader.style.padding = "10px";
    pHeader.style.background = "rgba(0,0,0,0.5)";
    pHeader.style.textAlign = "center";
    pHeader.innerHTML = `
        <div style="font-size: 14px; color: #a1887f; letter-spacing: 2px;">${title}</div>
        <div style="display: flex; justify-content: center; gap: 20px; margin-top: 10px; align-items: center;">
<select id="cb-faction-${side}" style="background: #3e2723; color: #fff; border: 1px solid #d4b886; padding: 5px;">
    ${Object.keys(typeof FACTIONS !== 'undefined' ? FACTIONS : {"Generic":{color:"#fff"}})
        .filter(f => f !== "Bandits" && f !== "Player's Kingdom") // Filter out these two
        .map(f => 
            `<option value="${f}" ${f === setupObj.faction ? 'selected' : ''}>${f}</option>`
        ).join('')}
</select>
            <div style="font-size: 16px; color: #f5d76e;">Funds Left: <span id="cb-funds-left-${side}">${customFunds - setupObj.cost}</span></div>
        </div>
    `;

// Catalog Grid (Available Units)
    const catalog = document.createElement("div");
catalog.style.flex = "1 1 0";
 
catalog.style.minHeight = "0";
catalog.style.overflowY = "auto";
catalog.style.overflowX = "hidden";
    catalog.style.padding = "15px";
    catalog.style.display = "grid";
    catalog.style.gridTemplateColumns = "repeat(auto-fill, minmax(70px, 1fr))";
    catalog.style.gap = "10px";
    catalog.style.borderBottom = "2px solid #d4b886";
    
    // --- NEW: Snap cards to the top-left to prevent gaps from banned units ---
    catalog.style.alignContent = "start";   
    catalog.style.justifyContent = "start";
    
    // Tray for selected units
    const trayContainer = document.createElement("div");
    trayContainer.style.flex = "1";
    trayContainer.style.background = "rgba(0,0,0,0.8)";
    trayContainer.style.padding = "10px";
	trayContainer.style.flex = "1 1 0";
trayContainer.style.minHeight = "0";
trayContainer.style.overflow = "hidden";
    
    const trayHeader = document.createElement("div");
    trayHeader.style.display = "flex";
    trayHeader.style.justifyContent = "space-between";
    trayHeader.style.alignItems = "center";
    trayHeader.style.marginBottom = "10px";

    const trayTitle = document.createElement("div");
trayTitle.style.color = "#a1887f";
trayTitle.style.fontSize = "12px";

// Create dynamic text
const countSpan = document.createElement("span");
countSpan.id = `cb-count-${side}`;
countSpan.style.color = "#f5d76e";
countSpan.style.marginLeft = "8px";

trayTitle.innerHTML = `SELECTED ROSTER (Max 100) `;
trayTitle.appendChild(countSpan);
    trayTitle.style.color = "#a1887f";
    trayTitle.style.fontSize = "12px";

    // --- FAT CLEAR BUTTON ---
    const clearBtn = document.createElement("button");
    clearBtn.innerText = "✖ REMOVE ALL";
    clearBtn.style.background = "rgba(244, 67, 54, 0.4)";
    clearBtn.style.color = "#fff";
    clearBtn.style.border = "2px solid #f44336";
    clearBtn.style.fontSize = "14px";
    clearBtn.style.padding = "10px 20px";
    clearBtn.style.fontWeight = "bold";
    clearBtn.style.cursor = "pointer";
    clearBtn.style.fontFamily = "Georgia, serif";
    clearBtn.style.position = "relative";
    clearBtn.style.zIndex = "9999";
    clearBtn.style.pointerEvents = "auto";
	
const tray = document.createElement("div");
    tray.id = `cb-tray-${side}`;
    tray.style.display = "flex";
    tray.style.flexWrap = "wrap";
    tray.style.gap = "5px";
tray.style.overflowY = "auto";
tray.style.overflowX = "hidden";
tray.style.minHeight = "0";
    tray.style.maxHeight = "calc(100% - 25px)";
    
    // --- NEW: Snap selected roster rows to the top-left ---
    tray.style.alignContent = "flex-start";

	tray.style.maxHeight = "calc(100% - 25px)";

    // --- INTERNAL LOGIC FUNCTIONS ---
    // These must be INSIDE createArmyPanel to see 'catalog', 'side', and 'setupObj'

    const updateUI = () => {
        // Update Funds Display
        const fundsLabel = document.getElementById(`cb-funds-left-${side}`);
        if (fundsLabel) fundsLabel.innerText = customFunds - setupObj.cost;

        // Clear and rebuild the Tray
        tray.innerHTML = "";
        setupObj.roster.forEach((unitKey, index) => {
            // side, index helps the card know which unit to remove if clicked
            const card = createUnitCard(unitKey, setupObj.color, false, side, index);
            tray.appendChild(card);
        });
    };

    const refreshCatalog = () => {
        catalog.innerHTML = ""; 
        let allowedUnits = getAvailableUnitsForFaction(setupObj.faction);
        
        allowedUnits.forEach(unitKey => {
            // 'true' tells the card it is for the catalog (click to add)
            const card = createUnitCard(unitKey, setupObj.color, true, side);
            catalog.appendChild(card);
        });
    };
	
	window.__cbPanels = window.__cbPanels || {};
window.__cbPanels[side] = {
    refreshCatalog,
    updateUI
};

    // Button Events
    clearBtn.onmousedown = (e) => {
        e.stopPropagation();
        setupObj.roster = [];
        setupObj.cost = 0;
        updateUI();
        console.log("Roster Cleared!");
    };
    clearBtn.onmouseenter = () => clearBtn.style.background = "rgba(244, 67, 54, 0.8)";
    clearBtn.onmouseleave = () => clearBtn.style.background = "rgba(244, 67, 54, 0.4)";

    // Final Assembly
    trayHeader.appendChild(trayTitle);
    trayHeader.appendChild(clearBtn);
    trayContainer.appendChild(trayHeader);
    trayContainer.appendChild(tray);

    panel.appendChild(pHeader);
    panel.appendChild(catalog);
    panel.appendChild(trayContainer);

    // Initialization and Faction Change Listener
    setTimeout(() => {
        const factionSelect = document.getElementById(`cb-faction-${side}`);
        if (factionSelect) {
            factionSelect.addEventListener("change", (e) => {
                setupObj.faction = e.target.value;
                if (typeof FACTIONS !== 'undefined' && FACTIONS[setupObj.faction]) {
                    setupObj.color = FACTIONS[setupObj.faction].color;
                }
                setupObj.roster = [];
                setupObj.cost = 0;
                
                updateUI();
                refreshCatalog();
            });
        }
        refreshCatalog(); 
        updateUI();
    }, 0);

    return panel;
}

    // --- UNIT CARD GENERATOR (Dynamic Canvas Render) ---
    function createUnitCard(unitKey, color, isCatalog, side) {
        const template = UnitRoster.allUnits[unitKey];
        const cost = template.cost || 50;

        const card = document.createElement("div");
        card.style.width = "70px";
        card.style.height = "100px";
        card.style.background = "linear-gradient(to bottom, #d4b886, #8d6e63)";
        card.style.border = "1px solid #3e2723";
        card.style.borderRadius = "4px";
        card.style.cursor = "pointer";
        card.style.position = "relative";
        card.style.boxShadow = "2px 2px 5px rgba(0,0,0,0.5)";
        card.style.transition = "transform 0.1s";

        card.onmouseenter = () => card.style.transform = "scale(1.05)";
        card.onmouseleave = () => card.style.transform = "scale(1)";

        // Live Render Canvas
        const canvas = document.createElement("canvas");
		canvas.width = 70;
		canvas.height = 70;

        canvas.style.position = "absolute";
        canvas.style.top = "0px"; canvas.style.left = "0px";
       

	   
        const ctx = canvas.getContext("2d");
      ctx.translate(35, 55);

        // Map role to visual type
        let visType = "peasant";
        const role = template.role;
        if (role === ROLES.CAVALRY || role === ROLES.MOUNTED_GUNNER) {
            visType = unitKey === "War Elephant" ? "elephant" : (unitKey.includes("Camel") ? "camel" : "cavalry");
        } else if (role === ROLES.HORSE_ARCHER) visType = "horse_archer";
        else if (role === ROLES.PIKE || unitKey.includes("Glaive")) visType = "spearman";
        else if (role === ROLES.SHIELD) visType = "sword_shield";
        else if (role === ROLES.TWO_HANDED) visType = "two_handed";
        else if (role === ROLES.CROSSBOW) visType = "crossbow";
        else if (role === ROLES.FIRELANCE) visType = "firelance";
        else if (role === ROLES.ARCHER) visType = "archer";
        else if (role === ROLES.THROWING) visType = "throwing";
        else if (role === ROLES.GUNNER) visType = "gun";
        else if (role === ROLES.BOMB) visType = "bomb";
        else if (role === ROLES.ROCKET) visType = "rocket";

        // Draw it statically (Frame 10, not moving)
        if (["cavalry", "elephant", "camel", "horse_archer"].includes(visType)) {
            drawCavalryUnit(ctx, 0, 0, false, 10, color, false, visType, side, unitKey, false, 0, 10, dummyUnit, 0);
        } else {
            drawInfantryUnit(ctx, 0, 0, false, 10, color, visType, false, side, unitKey, false, 0, 10, dummyUnit, 0);
        }

        // Labels
        const nameLabel = document.createElement("div");
        nameLabel.innerText = unitKey;
        nameLabel.style.position = "absolute";
        nameLabel.style.bottom = "12px"; nameLabel.style.width = "100%";
        nameLabel.style.textAlign = "center"; nameLabel.style.fontSize = "9px";
        nameLabel.style.fontWeight = "bold"; nameLabel.style.color = "#111";
        nameLabel.style.background = "rgba(255,255,255,0.7)";

        const costLabel = document.createElement("div");
        costLabel.innerText = `🪙 ${cost}`;
        costLabel.style.position = "absolute";
        costLabel.style.bottom = "0"; costLabel.style.width = "100%";
        costLabel.style.textAlign = "center"; costLabel.style.fontSize = "10px";
        costLabel.style.background = "#2b2b2b"; costLabel.style.color = "#f5d76e";

        card.appendChild(canvas);
        card.appendChild(nameLabel);
        card.appendChild(costLabel);

// Click logic
        card.onclick = () => {
            let setup = side === "player" ? playerSetup : enemySetup;
            if (isCatalog) {
                if (setup.cost + cost > customFunds) return; // Ignore if it exceeds funds
                if (setup.roster.length >= 100) return; // Engine soft limit
                
                setup.roster.push(unitKey);
                setup.cost += cost;

                // --- NEW HOOK: Auto-sort the array alphabetically every time a unit is added ---
                setup.roster.sort(); 
                
            } else {
                // Remove from tray
                const idx = setup.roster.indexOf(unitKey);
                if (idx > -1) {
                    setup.roster.splice(idx, 1);
                    setup.cost -= cost;
                }
            }
            updateUI();
        };
        return card;
    }

    // --- SYNCHRONIZE UI STATE ---
    function updateUI() {
        ["player", "enemy"].forEach(side => {
            const setup = side === "player" ? playerSetup : enemySetup;
            
            // Update funds text
            const fundsEl = document.getElementById(`cb-funds-left-${side}`);
            if (fundsEl) {
                fundsEl.innerText = customFunds - setup.cost;
                fundsEl.style.color = (customFunds - setup.cost) < 0 ? "#f44336" : "#f5d76e";
            }

const countEl = document.getElementById(`cb-count-${side}`);
if (countEl) {
    countEl.innerText = `[${setup.roster.length} / 100]`;
}
	
            // Update faction dropdown
            const factionEl = document.getElementById(`cb-faction-${side}`);
            if (factionEl) {
                factionEl.value = setup.faction;
            }

            // Update map dropdown
            const mapEl = document.getElementById(`cb-map-select`);
            if (mapEl) {
                mapEl.value = selectedMap;
            }

            // Update Tray
            const tray = document.getElementById(`cb-tray-${side}`);
            if (tray) {
                tray.innerHTML = "";
                setup.roster.forEach(unitKey => {
                    tray.appendChild(createUnitCard(unitKey, setup.color, false, side));
                });
            }
        });
    }
// --- RANDOM BATTLE GENERATOR ---
    function launchRandomBattle() {
        // 1. HARD RESET: Clear all manual selections and influence
        customFunds = (customBattleMode === "siege") ? 3000 : 1000;
        const fundsInput = document.getElementById("cb-funds-input");
        if (fundsInput) fundsInput.value = customFunds;

        playerSetup.roster = [];
        playerSetup.cost = 0;
        enemySetup.roster = [];
        enemySetup.cost = 0;

// 2. Randomize Map
        if (customBattleMode === "siege") {
            // Added "River" to the exclusion list for Siege battles
            const landMaps = MAP_TYPES.filter(m => m !== "Ocean" && m !== "Coastal" && m !== "River");
            selectedMap = landMaps[Math.floor(Math.random() * landMaps.length)];
        } else {
            selectedMap = MAP_TYPES[Math.floor(Math.random() * MAP_TYPES.length)];
        }
		
        // 3. Faction Selection (Excluding neutral/special factions)
        const factionNames = typeof FACTIONS !== 'undefined' ? 
            Object.keys(FACTIONS).filter(f => f !== "Bandits" && f !== "Player's Kingdom") : 
            ["Generic"];

// 4. Procedural Army Population
        const setups = [playerSetup, enemySetup];
        
        for (let i = 0; i < setups.length; i++) {
            let setup = setups[i];

            setup.faction = factionNames[Math.floor(Math.random() * factionNames.length)];
            setup.color = (typeof FACTIONS !== 'undefined' && FACTIONS[setup.faction]) ? 
                FACTIONS[setup.faction].color : "#ffffff";
            
            let allowedUnits = (typeof getAvailableUnitsForFaction === 'function') ? 
                getAvailableUnitsForFaction(setup.faction) : 
                Object.keys(UnitRoster.allUnits).filter(k => k !== "Commander");

            let attempts = 0;
            
            // --- NEW: ASYMMETRICAL SIEGE UNIT CAPS ---
            let maxUnits = 100; // Default field battle cap
            if (customBattleMode === "siege") {
                if (setup === playerSetup) {
                    maxUnits = 40; // Attackers reduced 
                } else if (setup === enemySetup) {
                    maxUnits = 30; // Defenders reduced  
                }
            }

            while (setup.roster.length < maxUnits && attempts < 200) {
                attempts++;

                let unitKey = allowedUnits[Math.floor(Math.random() * allowedUnits.length)];
                let unitData = UnitRoster.allUnits[unitKey];

                // ---> NEW HOOK: EXPLICIT RANDOMIZER SAFETY NET <---
                // If it accidentally picks a horse/elephant/camel in siege mode, skip it.
                // We keep trying (up to 500 attempts) without counting this against the roster!
                if (customBattleMode === "siege" && !isValidSiegeUnit(unitKey, unitData)) {
                    continue; 
                }

                let cost = unitData ? (unitData.cost || 50) : 50;

                // Only add if it fits the remaining budget
                if (setup.cost + cost <= customFunds) {
                    setup.roster.push(unitKey);
                    setup.cost += cost;
                }
            }
            
            setup.roster.sort();
        }

        // 5. Sync UI and Launch
        updateUI(); 
        launchCustomBattle();
    }

function startCustomBattleMonitor() {
    if (window.cbCustomBattleMonitor) {
        clearInterval(window.cbCustomBattleMonitor);
    }

    window.__CUSTOM_BATTLE_ENDED__ = false;

    window.cbCustomBattleMonitor = setInterval(() => {
        if (!inBattleMode || window.__CUSTOM_BATTLE_ENDED__) {
            clearInterval(window.cbCustomBattleMonitor);
            return;
        }

        const units = (battleEnvironment && battleEnvironment.units) ? battleEnvironment.units : [];
        const pAlive = units.filter(u => u.side === "player" && u.hp > 0).length;
        const eAlive = units.filter(u => u.side === "enemy" && u.hp > 0).length;

        if (pAlive <= 0 || eAlive <= 0) {
            window.__CUSTOM_BATTLE_ENDED__ = true;   // lock immediately
            clearInterval(window.cbCustomBattleMonitor);

            if (typeof window.leaveBattlefield === "function") {
                window.leaveBattlefield();
            }
        }
    }, 250);
}

   
function launchCustomBattle() {
window.__IS_CUSTOM_BATTLE__ = true; // <--- NEW SURGERY
        // 🔴 FIX 1: FETCH CANVAS FIRST TO PREVENT TDZ CRASH
        const canvas = document.getElementById("gameCanvas");

        // 🔴 FIX 2: RUN THE WIPE FIRST
        if (typeof window.cleanupCustomBattleEnvironments === 'function') {
            window.cleanupCustomBattleEnvironments();
        }

        inBattleMode = true;
        inCityMode = false;
        customBattleActive = false;
        
        // ---> SURGERY: WAKE UP THE RIVER ENGINE <---
        window.inNavalBattle = false;
        window.inRiverBattle = (selectedMap === "River");
        // Clear the slate
        battleEnvironment.units = [];
        battleEnvironment.projectiles = [];
        unitIdCounter = 0; 
// ==========================================================
        // ENHANCED PRE-FLIGHT VALIDATION (Siege, Coastal, Ocean)
        // ==========================================================
        
        // Clear any old errors first
        const errorEl = document.getElementById("battle-validation-error");
        if (errorEl) errorEl.innerText = "";

        const playerCount = playerSetup.roster.length;
        const enemyCount = enemySetup.roster.length;

        // 1. Hard Minimum for any battle
        if (playerCount === 0 || enemyCount === 0) {
            displayBattleError("Error: Both sides NEED units!");
            return;
        }

        // 2. Siege Requirement (10 units)
        if (customBattleMode === "siege") {
            if (playerCount < 10 || enemyCount < 10) {
                displayBattleError("Siege Requirement: At least 10 units needed to man equipment.");
                return;
            }
        }

        // 3. Coastal & Ocean Requirement (5 units)
        // Checks if the selected map name contains coastal or ocean keywords
        const mapType = selectedMap.toLowerCase();
        if (mapType.includes("coastal") || mapType.includes("ocean") || mapType.includes("sea")) {
            if (playerCount < 5 || enemyCount < 5) {
                displayBattleError("Naval Requirement: 5+ units needed to fill transport ships.");
                return;
            }
        }
        
        // ==========================================================
		
		
        if (playerSetup.cost > customFunds || enemySetup.cost > customFunds) {
            alert("Funds exceeded! Please remove some units.");
            return;
        }

        if (typeof player !== 'undefined') {
            player.hp = 100; 
        }
        
        if (typeof window.player === "undefined" || !window.player) {
            window.player = { 
                x: BATTLE_WORLD_WIDTH / 2, 
                y: BATTLE_WORLD_HEIGHT - 100, 
                hp: 150, 
                maxHealth: 150, 
                baseSpeed: 2, 
                speed: 2,     
                faction: playerSetup.faction,
                state: "idle",  
                frame: 0,
                direction: 1,
                roster: playerSetup.roster
            };
        }

        // 🔴 FIX 3: DEFINE CAMERA *BEFORE* DRAW IS CALLED
        window.camera = {
            get x() { return typeof player !== 'undefined' && canvas ? player.x - (canvas.width / 2 / (typeof zoom !== 'undefined' ? zoom : 1)) : 0; },
            get y() { return typeof player !== 'undefined' && canvas ? player.y - (canvas.height / 2 / (typeof zoom !== 'undefined' ? zoom : 1)) : 0; },
            get width() { return canvas ? canvas.width / (typeof zoom !== 'undefined' ? zoom : 1) : window.innerWidth; },
            get height() { return canvas ? canvas.height / (typeof zoom !== 'undefined' ? zoom : 1) : window.innerHeight; }
        };

        // 🔴 FIX 4: START RENDER LOOP ONLY AFTER CAMERA IS SAFE
        if (!window.__battleLoopStarted) {
            window.__battleLoopStarted = true;
            draw();
        }

        // UI cleanup
        const cbContainer = document.getElementById("cb-menu-container");
        if (cbContainer) cbContainer.remove();

        const mainMenu = document.getElementById("main-menu");
        if (mainMenu) mainMenu.style.display = "none";

        const overworldUI = document.getElementById("ui");
        if (overworldUI) overworldUI.style.display = "none";
        const dipContainer = document.getElementById("diplomacy-container");
        if (dipContainer) dipContainer.style.display = "none";

// Hijack exit
        if (!originalLeaveBattlefield) originalLeaveBattlefield = window.leaveBattlefield;
        window.leaveBattlefield = handleCustomBattleExit;
	
        // ---> SURGERY: Safely pull initial counts directly from the roster arrays
        // instead of waiting for currentBattleData to be built later.
        preBattleStats = {
            playerTotalHP: 0, // Not needed at spawn since units are empty here
            enemyTotalHP: 0,
            playerMen: playerSetup.roster.length + 1, // +1 for the Commander
            enemyMen: enemySetup.roster.length + 1    // +1 for the Commander
        };	
		
		if (customBattleMode === "siege" && typeof window.launchCustomSiege === "function") {
		window.launchCustomSiege(playerSetup, enemySetup, selectedMap);
			return; 
		}

        else if (selectedMap === "Ocean" || selectedMap === "Coastal") {
            window.launchCustomNavalBattle(playerSetup, enemySetup, selectedMap, pNavalShipSize, eNavalShipSize);
		return; }
else {
            // --- EXISTING FIELD BATTLE LOGIC ---
            // FIX: Set dimensions BEFORE generation so the canvas and arrays are built correctly!
            BATTLE_WORLD_WIDTH = 2400;
            // SURGERY: Assign 1200 to River, 1800 to Land
            BATTLE_WORLD_HEIGHT = (selectedMap === "River") ? 1200 : 1800; 
            BATTLE_COLS = Math.floor(BATTLE_WORLD_WIDTH / (typeof BATTLE_TILE_SIZE !== 'undefined' ? BATTLE_TILE_SIZE : 8));
            BATTLE_ROWS = Math.floor(BATTLE_WORLD_HEIGHT / (typeof BATTLE_TILE_SIZE !== 'undefined' ? BATTLE_TILE_SIZE : 8));

            // Generate the Map Canvas NOW, using the correct dimensions
            if (typeof generateBattlefield === 'function') {
                generateBattlefield(selectedMap || "Plains");
            }
            
            zoom = 0.1;

            // Reset battle container
            if (typeof battleEnvironment === "undefined" || !battleEnvironment) {
                window.battleEnvironment = {};
            }
            battleEnvironment.units = [];
            battleEnvironment.projectiles = [];
            battleEnvironment.groundEffects = [];

            currentBattleData = {
                playerFaction: playerSetup.faction,
                enemyFaction: enemySetup.faction,
                playerColor: playerSetup.color,
                enemyColor: enemySetup.color,
                initialCounts: {
                    player: playerSetup.roster.length + 1,
                    enemy: enemySetup.roster.length + 1
                }
            };
            
            // Spawn armies
            customSpawnLoop(playerSetup.roster, "player", playerSetup.faction, playerSetup.color);
            customSpawnLoop(enemySetup.roster, "enemy", enemySetup.faction, enemySetup.color);

// --- SURGICAL HOOK: Abyss Check ---
            battleEnvironment.units.forEach((unit, index) => {
                lastResort(unit, BATTLE_WORLD_WIDTH, BATTLE_WORLD_HEIGHT, unit.side, index);
            });
			
            // Lazy General Auto-Charge
            battleEnvironment.units.forEach(u => {
                if (u.side === "player" && !u.isCommander && !u.disableAICombat) {
                    u.selected = true;           
                    u.hasOrders = true;          
                    u.orderType = "seek_engage"; 
                    u.orderTargetPoint = null;   
                    u.formationTimer = 120;      
                }
            });
        }

// Use the player commander as the battle anchor
        const playerCommander = battleEnvironment.units.find(
            u => u.isCommander && u.side === "player"
        );

        if (playerCommander && typeof player !== "undefined") {
            player.x = playerCommander.x;
            player.y = playerCommander.y;
            player.hp = playerCommander.hp;
            player.maxHealth = playerCommander.maxHp || playerCommander.hp;
            player.ammo = playerCommander.ammo; // <--- SURGERY: SYNC AMMO TO GLOBAL PLAYER
        }


        // 🔴 FIX 5: Canvas is already defined at the top, just assign properties here
        if (canvas) {
            canvas.style.display = "block";
            canvas.style.visibility = "visible";
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
    
        // Fix Camera Centering
        if (playerCommander && typeof camera !== "undefined") {
            camera.x = playerCommander.x - (window.innerWidth / 2 / (zoom || 1));
            camera.y = playerCommander.y - (window.innerHeight / 2 / (zoom || 1));
        }
    
        // Fix the "Invisibility" Zoom
        if (typeof triggerEpicZoom !== 'function') {
            zoom = 0.8; 
        } else {
            triggerEpicZoom(0.1, 0.8, 3000); 
        }
        
        // Audio / cinematic
        if (typeof AudioManager !== "undefined") {
            AudioManager.playMP3("music/battlemusic.mp3", false);
            AudioManager.playSound("charge");
        }
        if (typeof triggerEpicZoom === "function") {
            triggerEpicZoom(0.1, 1.5, 3500);
        }

        window.isPaused = false;
		
		// ---> SURGERY: Trigger Siege Battle Music
    if (typeof AudioManager !== "undefined") {
        AudioManager.init();
        AudioManager.playMP3('music/battlemusic.mp3', false);
    }
	
		// --- NEW: START ENEMY TACTICAL AI FOR CUSTOM BATTLES ---
        if (typeof EnemyTacticalAI !== 'undefined') EnemyTacticalAI.start();
		
        startCustomBattleMonitor();
        console.log("Custom Battle Launched: Units Spawned =", battleEnvironment.units.length);
    }

// --- CUSTOM SPAWNER FOR THIS UI (REWRITTEN: MIRRORED COMMANDER & FALLBACK ARMOR) ---
    function customSpawnLoop(rosterArray, side, faction, color) {
        // SURGERY: Scaled Enemy Spawning
        let startY = side === 'player' ? BATTLE_WORLD_HEIGHT - 40 : Math.min(600, BATTLE_WORLD_HEIGHT * 0.15);
        let centerX = BATTLE_WORLD_WIDTH / 2;
        
        // FIX: Prevent River Drowning by shifting armies to opposite banks
        if (typeof window.inRiverBattle !== 'undefined' && window.inRiverBattle) {
            centerX = side === 'player' ? BATTLE_WORLD_WIDTH * 0.25 : BATTLE_WORLD_WIDTH * 0.75;
        }
        
        let rankDir = side === 'player' ? 1 : -1;
        let spacingX = 22; 
        let spacingY = 18;

        let currentX = centerX - (10 * spacingX) / 2;
        let currentY = startY;
        let col = 0;

        // Group identical units together so formations look clean
        let sortedRoster = [...rosterArray].sort();

        sortedRoster.forEach(unitKey => {
            let template = UnitRoster.allUnits[unitKey] || UnitRoster.allUnits["Militia"];
            let unitStats = Object.assign(new Troop(template.name, template.role, template.isLarge, faction), template);
            
            unitStats.morale = 20;    
            unitStats.maxMorale = 20; 

            // Tactical offsets for unit roles
            let tacOffset = {x: 0, y: 0};
            if (typeof getTacticalPosition === 'function') {
                tacOffset = getTacticalPosition(template.role, side, unitKey) || {x: 0, y: 0};
            }

            let safeHP = unitStats.health || unitStats.hp || unitStats.maxHealth || template.health || 100;

            // Map visual render types
            let visType = "peasant";
            const role = template.role;
            if (role === (typeof ROLES !== 'undefined' ? ROLES.CAVALRY : "Cavalry") || role === (typeof ROLES !== 'undefined' ? ROLES.MOUNTED_GUNNER : "Mounted Gunner")) {
                visType = unitKey === "War Elephant" ? "elephant" : (unitKey.includes("Camel") ? "camel" : "cavalry");
            } else if (role === (typeof ROLES !== 'undefined' ? ROLES.HORSE_ARCHER : "Horse Archer")) visType = "horse_archer";
            else if (role === (typeof ROLES !== 'undefined' ? ROLES.PIKE : "Pikeman") || unitKey.includes("Glaive")) visType = "spearman";
            else if (role === (typeof ROLES !== 'undefined' ? ROLES.SHIELD : "Shield")) visType = "sword_shield";
            else if (role === (typeof ROLES !== 'undefined' ? ROLES.TWO_HANDED : "Two-Handed")) visType = "two_handed";
            else if (role === (typeof ROLES !== 'undefined' ? ROLES.CROSSBOW : "Crossbow")) visType = "crossbow";
            else if (role === (typeof ROLES !== 'undefined' ? ROLES.FIRELANCE : "Firelance")) visType = "firelance";
            else if (role === (typeof ROLES !== 'undefined' ? ROLES.ARCHER : "Archer")) visType = "archer";
            else if (role === (typeof ROLES !== 'undefined' ? ROLES.THROWING : "Throwing")) visType = "throwing";
            else if (role === (typeof ROLES !== 'undefined' ? ROLES.GUNNER : "Gunner")) visType = "gun";
            else if (role === (typeof ROLES !== 'undefined' ? ROLES.BOMB : "Bombardier")) visType = "bomb";
            else if (role === (typeof ROLES !== 'undefined' ? ROLES.ROCKET : "Rocket")) visType = "rocket";

            battleEnvironment.units.push({
                id: Math.floor(Math.random() * 999999), 
                side: side,
                faction: faction,
                color: color,
                unitType: unitKey,
				disableAICombat: false,
                stats: unitStats,
                hp: safeHP,
                maxHp: safeHP, 
                ammo: unitStats.ammo || template.ammo || 0, 
                renderType: visType, 
                x: currentX + tacOffset.x + (Math.random() - 0.5) * 5,
                y: currentY + tacOffset.y + (Math.random() - 0.5) * 5,
                vx: 0, vy: 0,
                direction: rankDir, 
                anim: Math.floor(Math.random() * 100),
                frame: 0, 
                isMoving: false, 
                target: null,
                state: "idle",
                animOffset: Math.random() * 100,
                cooldown: 0,
                hasOrders: false
            });
            
            col++;
            currentX += spacingX;
            if (col >= 10) { 
                col = 0;
                currentX = centerX - (10 * spacingX) / 2;
                currentY += spacingY * rankDir;
            }
        });

// ========================================================================
        // COMMANDER SPAWN (USING NEW 'GENERAL' ROSTER UNIT)
        // ========================================================================
        let disableAICombatSide = side === "player";
        let cmdrName = "General"; 
        
        // Pull the dedicated General stats you created in troop_system.js
        let baseGeneral = UnitRoster.allUnits[cmdrName] || {}; 
        let cmdrRole = baseGeneral.role || (typeof ROLES !== 'undefined' ? ROLES.HORSE_ARCHER : "horse_archer");
        
        // Create the unit stats based on the roster template
        let cmdrStats = Object.assign(new Troop(cmdrName, cmdrRole, true, faction), baseGeneral);
        // SURGERY: Fallback stats to prevent NaN Invincibility
cmdrStats.health = cmdrStats.health || 140;
cmdrStats.meleeAttack = cmdrStats.meleeAttack || 22;
cmdrStats.meleeDefense = cmdrStats.meleeDefense || 5;
cmdrStats.missileBaseDamage = cmdrStats.missileBaseDamage || 14;
cmdrStats.missileAPDamage = cmdrStats.missileAPDamage || 8;
cmdrStats.armor = cmdrStats.armor || 20; // Assuming ARMOR_TIERS.PARTIAL_LAMELLAR is ~20
cmdrStats.accuracy = cmdrStats.accuracy || 72;
cmdrStats.range = cmdrStats.range || 700;
cmdrStats.ammo = cmdrStats.ammo || 24;
cmdrStats.morale = cmdrStats.morale || 95;
cmdrStats.speed = cmdrStats.speed || 2.0;
cmdrStats.experienceLevel = cmdrStats.experienceLevel || 5;
        // Dynamically pull the health and ammo values from the template
        let finalMaxHp = cmdrStats.health || 200;
        let finalAmmo = cmdrStats.ammo || 24;

        battleEnvironment.units.push({
            id: disableAICombatSide ? 999999 : 888888 + Math.floor(Math.random() * 1000), 
            side: side,
            faction: faction,
            color: color,
            unitType: cmdrName, 
            isCommander: true,
           // SURGERY: THIS MUST BE TRUE FOR THE PLAYER SIDE!
            disableAICombat: (side === "player"),
            stats: cmdrStats,
            hp: finalMaxHp,       // Pulls 200 directly from your General stats
            maxHp: finalMaxHp,    
            ammo: finalAmmo,      // Pulls 24 directly from your General stats
            renderType: "horse_archer", 
            x: centerX,
            // FIX: Change the minus (-) to a plus (+) to spawn BEHIND the army
            y: startY -(80 * rankDir),
            vx: 0,
            vy: 0,
            direction: rankDir, 
            anim: 0,
            frame: 0,
            isMoving: false,
            target: null,
            state: "idle",
            animOffset: Math.random() * 100,
            cooldown: 0,
            hasOrders: false
        });

// Final global sync for player health so UI matches the General's HP
        if (disableAICombatSide && typeof player !== 'undefined') {
            player.hp = finalMaxHp;
            player.maxHealth = finalMaxHp;
            player.ammo = finalAmmo; // <--- SURGERY: SYNC AMMO ON SPAWN
        }
    }

function handleCustomBattleExit() {
    if (window.__CUSTOM_BATTLE_EXITING__) return;
    window.__CUSTOM_BATTLE_EXITING__ = true;
window.__IS_CUSTOM_BATTLE__ = false; // <--- NEW SURGERY
    if (window.cbRegicideMonitor) {
        clearInterval(window.cbRegicideMonitor);
        window.cbRegicideMonitor = null;
    }
if (window.cbCustomBattleMonitor) {
        clearInterval(window.cbCustomBattleMonitor);
        window.cbCustomBattleMonitor = null;
    }
    window.GLOBAL_BATTLE_SCALE = 1;
	window.CURRENT_MOBILE_RATIO = 0;
    // --- NEW: STOP ENEMY TACTICAL AI WHEN EXITING CUSTOM BATTLE ---
    if (typeof EnemyTacticalAI !== 'undefined') EnemyTacticalAI.stop();

    let pAlive = 0, pHP = 0;
    let eAlive = 0, eHP = 0;

if (customBattleMode === "siege") {
        // SURGERY: Force the map state back to Siege City so the UI matches the mode
selectedMap = "Siege City"; // <--- ADD THIS LINE
}else {
    selectedMap = "Plains"; // This handles the switch-back!
     
}
    // If siege breach already decided the result, use the snapshot.
    if (window.__CUSTOM_SIEGE_RESULT__ === "victory" && window.__CUSTOM_SIEGE_COUNTS__) {
        pAlive = window.__CUSTOM_SIEGE_COUNTS__.pAlive || 0;
        eAlive = window.__CUSTOM_SIEGE_COUNTS__.eAlive || 0;
        pHP = 0;
        eHP = 0;
    } else if (typeof battleEnvironment !== "undefined" && battleEnvironment?.units) {
        battleEnvironment.units.forEach(u => {
            if (u && u.hp > 0) {
                if (u.side === "player") { pAlive++; pHP += u.hp; }
                else if (u.side === "enemy") { eAlive++; eHP += u.hp; }
            }
        });
    }

    const pMen = preBattleStats?.playerMen ?? 0;
    const eMen = preBattleStats?.enemyMen ?? 0;

    const pLosses = Math.max(0, pMen - pAlive);
    const eLosses = Math.max(0, eMen - eAlive);

    let isVictory = false;
    let isDefeat = false;
    let resultStr = "Battle Ended";

    if (window.__CUSTOM_SIEGE_RESULT__ === "victory") {
        isVictory = true;
        resultStr = "Gate breached!";
    } else {
        const playerWiped = pAlive <= 0;
        const enemyWiped = eAlive <= 0;

        isVictory = enemyWiped && !playerWiped;
        isDefeat = playerWiped && !enemyWiped;

        if (isVictory && isDefeat) {
            resultStr = "Mutual Destruction";
        } else if (isDefeat) {
            resultStr = "Defeat! (Your army was wiped)";
        } else if (isVictory) {
            resultStr = "Victory! (Enemy army was wiped)";
        }
    }

    let reportData = {
        resultStr,
        resultColor: isVictory ? "#4caf50" : (isDefeat ? "#f44336" : "#ff9800"),
        pMen,
        pAlive,
        pLosses,
        eMen,
        eAlive,
        eLosses
    };

    window.leaveBattlefield = originalLeaveBattlefield;
    originalLeaveBattlefield = null;

    inBattleMode = false;
    inCityMode = false;
    if (typeof inSiegeBattle !== "undefined") inSiegeBattle = false;
    if (typeof currentBattleData !== "undefined") currentBattleData = null;

    if (typeof battleEnvironment !== "undefined" && battleEnvironment) {
        battleEnvironment.units = [];
        if (typeof window.cleanupCustomSiege === "function") window.cleanupCustomSiege();
        battleEnvironment.projectiles = [];
        battleEnvironment.groundEffects = [];
        battleEnvironment.grid = null;
        battleEnvironment.bgCanvas = null;
        battleEnvironment.fgCanvas = null;
    }

    zoom = 0.8;
    if (typeof camera !== "undefined") {
        camera.x = 0;
        camera.y = 0;
    }

    if (typeof keys !== "undefined") {
        Object.keys(keys).forEach(k => keys[k] = false);
    }

    player.hp = Math.max(1, player.maxHealth || 100);
    player.isMoving = false;
    player.stunTimer = 0;
    player.onWall = false;

const overworldUI = document.getElementById("ui");
    if (overworldUI) overworldUI.style.display = "block";

    // ---> SURGERY: Restore Main Menu Music
    if (typeof AudioManager !== 'undefined') {
        AudioManager.init();
        AudioManager.playMP3('music/menu_noloop.mp3', false);
    }

    window.showCustomBattleMenu(reportData);

    window.__CUSTOM_SIEGE_RESULT__ = null;
    window.__CUSTOM_SIEGE_COUNTS__ = null;
    window.__CUSTOM_BATTLE_EXITING__ = false;
}

    // --- POST BATTLE REPORT MODAL ---
    function showReportModal(parentContainer, data) {
        const modalBg = document.createElement("div");
        modalBg.style.position = "absolute";
        modalBg.style.top = "0"; modalBg.style.left = "0";
        modalBg.style.width = "100%"; modalBg.style.height = "100%";
        modalBg.style.background = "rgba(0,0,0,0.85)";
        modalBg.style.display = "flex";
        modalBg.style.justifyContent = "center";
        modalBg.style.alignItems = "center";
        modalBg.style.zIndex = "12000";

        const box = document.createElement("div");
        box.style.background = "#2b2b2b";
        box.style.border = "2px solid #d4b886";
        box.style.padding = "40px";
        box.style.textAlign = "center";
        box.style.width = "500px";

        box.innerHTML = `
            <h1 style="color: ${data.resultColor}; letter-spacing: 2px; margin-top:0;">${data.resultStr}</h1>
            <hr style="border-color: #5d4037; margin: 20px 0;">
            <div style="display: flex; justify-content: space-between; font-size: 18px; color: #fff;">
                <div style="text-align: left;">
                    <h3 style="color: #2196f3; margin-bottom: 5px;">ATTACKERS</h3>
                    Deployed: ${data.pMen}<br>
                    Lost: <span style="color: #f44336;">${data.pLosses}</span><br>
                    Remaining: ${data.pAlive}
                </div>
                <div style="text-align: right;">
                    <h3 style="color: #f44336; margin-bottom: 5px;">DEFENDERS</h3>
                    Deployed: ${data.eMen}<br>
                    Lost: <span style="color: #f44336;">${data.eLosses}</span><br>
                    Remaining: ${data.eAlive}
                </div>
            </div>
            <hr style="border-color: #5d4037; margin: 20px 0;">
        `;

        const closeBtn = createCBBtn("Return to Setup", () => {
            modalBg.remove();
        });
        box.appendChild(closeBtn);
        modalBg.appendChild(box);
        parentContainer.appendChild(modalBg);
    }

// --- UTILITIES ---
    function exitCustomBattleMenu() {
        // A full page reload guarantees a 100% clean slate, destroying all ghost 
        // loops and variables. Save files in localStorage remain completely safe.
        window.location.reload();
    }
    function createCBBtn(text, onClick) {
        const btn = document.createElement("button");
        btn.innerText = text;
        btn.style.background = "linear-gradient(to bottom, #7b1a1a, #4a0a0a)";
        btn.style.color = "#f5d76e";
        btn.style.border = "1px solid #d4b886";
        btn.style.padding = "10px 20px";
        btn.style.fontFamily = "Georgia, serif";
        btn.style.cursor = "pointer";
        btn.onclick = onClick;
        
        btn.onmouseenter = () => btn.style.background = "linear-gradient(to bottom, #b71c1c, #7b1a1a)";
 btn.onmouseleave = () => btn.style.background = "linear-gradient(to bottom, #7b1a1a, #4a0a0a)";
        
        return btn;
    }

function lastResort(unit, worldWidth, worldHeight, side, index) {
    const PADDING = 100; // Increased padding for safety
    const STAGGER_GAP = 35;
    const UNITS_PER_ROW = 10;

    // Use the worldHeight passed in (which is 2000 for rivers)
    const isOutOfBounds = (unit.x < 0 || unit.x > worldWidth || unit.y < 0 || unit.y > worldHeight);

    if (isOutOfBounds) {
        const row = Math.floor(index / UNITS_PER_ROW);
        const col = index % UNITS_PER_ROW;
        
        const offsetX = col * STAGGER_GAP;
        const offsetY = row * STAGGER_GAP;

        if (side === "player") {
            unit.x = PADDING + offsetX;
            // SURGERY: Always spawn relative to the ACTUAL map bottom
            unit.y = worldHeight - PADDING - offsetY; 
        } else {
            unit.x = worldWidth - PADDING - offsetX;
            // SURGERY: Always spawn relative to the ACTUAL map top
            unit.y = PADDING + offsetY; 
        }
        
        console.warn(`Abyss Fix: Relocated ${unit.unitType} to Y:${unit.y} (Map Height: ${worldHeight})`);
    }
}
})(); // <- ONLY ONE of these! It closes the massive (function () { at the top.

function showBattleEndText(text) {
    let el = document.createElement("div");
    el.id = "battle-end-text";
    el.innerText = text;

    el.style.position = "fixed";
    el.style.top = "50%";
    el.style.left = "50%";
    el.style.transform = "translate(-50%, -50%)";
    el.style.fontSize = "48px";
    el.style.color = "#fff";
    el.style.fontFamily = "Georgia, serif";
    el.style.background = "rgba(0,0,0,0.7)";
    el.style.padding = "20px 40px";
    el.style.border = "2px solid #d4b886";
    el.style.zIndex = "99999";
    el.style.textAlign = "center";

    document.body.appendChild(el);
}

// --- SURGERY: REVISED UI ERROR MESSAGE HELPER ---
function displayBattleError(message) {
    let errorEl = document.getElementById("battle-validation-error");
    if (!errorEl) {
        errorEl = document.createElement("div");
        errorEl.id = "battle-validation-error";
        // Styling to ensure it floats ABOVE the menu (z-index 12000 > 11000)
        errorEl.style.position = "fixed";
        errorEl.style.bottom = "50px";
        errorEl.style.left = "50%";
        errorEl.style.transform = "translateX(-50%)";
        errorEl.style.backgroundColor = "rgba(220, 53, 69, 0.95)"; // Solid warning red
        errorEl.style.color = "white";
        errorEl.style.padding = "12px 25px";
        errorEl.style.borderRadius = "8px";
        errorEl.style.boxShadow = "0 4px 15px rgba(0,0,0,0.5)";
        errorEl.style.zIndex = "12000"; 
        errorEl.style.fontWeight = "bold";
        errorEl.style.fontSize = "16px";
        errorEl.style.border = "1px solid #ffc107";
        errorEl.style.textAlign = "center";
        errorEl.style.pointerEvents = "none"; // Player can click through it
        
        document.body.appendChild(errorEl);
    }
    
    errorEl.innerText = message;
    errorEl.style.display = "block";
    
    // Auto-clear after 5 seconds
    setTimeout(() => { 
        if (errorEl) errorEl.style.display = "none"; 
    }, 5000);
}


// ─────────────────────────────────────────────────────────────────────────
// SCENARIO TRIGGER HOOK  —  called by scenario_triggers.js force_battle action
// ─────────────────────────────────────────────────────────────────────────
window.ScenarioForceBattle = function (spec) {
    // spec = {
    //   enemyRoster:  ["Militia","Spearman", ...],  ← array of unit-type strings
    //   enemyFaction: "Bandits",
    //   map:          "Plains",
    //   mode:         "field" | "siege"
    // }

    // Pre-fill the custom battle state variables that launchCustomBattle() reads.
    // These are the same vars declared at line 57–60 inside the IIFE, but
    // because showCustomBattleMenu runs inside the same IIFE closure, calling
    // it re-initializes those vars fresh — so we set them BEFORE calling launch.

    if (typeof window.showCustomBattleMenu !== "function") {
        console.warn("[ScenarioForceBattle] showCustomBattleMenu not ready.");
        return;
    }

    // Open the menu first so the IIFE's playerSetup/enemySetup/selectedMap
    // variables are created in the current closure instance.
    window.showCustomBattleMenu();

    // Wait one tick for the menu DOM to build, then overwrite the dropdowns
    // and immediately fire the launch — skipping the player clicking "Start Battle".
    setTimeout(() => {
        // Set map
        const mapSel = document.getElementById("cb-map-select");
        if (mapSel) { mapSel.value = spec.map || "Plains"; mapSel.dispatchEvent(new Event("change")); }

        // Set mode
        const modeSel = document.getElementById("cb-mode-select");
        if (modeSel) { modeSel.value = spec.mode || "field"; modeSel.dispatchEvent(new Event("change")); }

        // Set enemy faction dropdown
        const eFac = document.getElementById("cb-faction-enemy");
        if (eFac) { eFac.value = spec.enemyFaction || "Bandits"; eFac.dispatchEvent(new Event("change")); }

        // Click "Random Battle" first to fill player side with something valid,
        // then overwrite the enemy side with spec.enemyRoster.
        const randomBtn = document.querySelector("#cb-menu-container button");
        // Instead: just call launchCustomBattle directly after injecting rosters.
        // We reach into the closure via the Start Battle button's click handler.
        const allBtns = document.querySelectorAll("#cb-menu-container button");
        let startBtn = null;
        allBtns.forEach(b => { if (b.textContent.trim() === "Start Battle") startBtn = b; });
        if (startBtn) startBtn.click();   // fires launchCustomBattle() via its onclick
    }, 80);
};