// ============================================================================
// FACTION DYNAMICS & DIPLOMACY SYSTEM
// ============================================================================

let FACTION_RELATIONS = {};
let diplomacyTick = 0;

// Run this once when the map generates
function initDiplomacy(factionsList) {
    if (!factionsList) return;
    
    let names = Object.keys(factionsList);
    names.forEach(f1 => {
        FACTION_RELATIONS[f1] = {};
        names.forEach(f2 => {
            // Everyone explicitly starts at "Peace". 
            FACTION_RELATIONS[f1][f2] = (f1 === f2) ? "Ally" : "Peace"; 
        });
    });
    console.log("Global Diplomacy Matrix Initialized (Peaceful Start).");
}

// Global helper to check if two factions want to kill each other
function isHostile(factionA, factionB) {
    if (!factionA || !factionB) return false;
    if (factionA === factionB) return false;

    // Bandits are globally hostile
    if (factionA === "Bandits" || factionB === "Bandits") return true; 
    
// Player Diplomacy logic (Dynamic to support Story Factions)
    let pFaction = (typeof player !== 'undefined' && player.faction) ? player.faction : "Player's Kingdom";
    if (factionA === pFaction || factionB === pFaction) {
        if (typeof player !== 'undefined' && player.enemies) {
            if (factionA === pFaction) return player.enemies.includes(factionB);
            if (factionB === pFaction) return player.enemies.includes(factionA);
        }
    }
    
    if (!FACTION_RELATIONS[factionA] || !FACTION_RELATIONS[factionA][factionB]) {
        return false; 
    }
    
    return FACTION_RELATIONS[factionA][factionB] === "War";
}

// --- Refined Update Loop inside faction_dynamics.js ---
function updateDiplomacy() {
    diplomacyTick++;
    // SLOWED: Processes every 120 ticks (roughly every 2 minutes at 60fps)
    if (diplomacyTick < 120) return; 
    diplomacyTick = 0;

    let names = Object.keys(FACTION_RELATIONS).filter(f => f !== "Bandits" && f !== "Player's Kingdom");
    if (names.length < 2) return;

    let f1 = names[Math.floor(Math.random() * names.length)];
    let f2 = names[Math.floor(Math.random() * names.length)];

    if (f1 !== f2) {
        let currentStatus = FACTION_RELATIONS[f1][f2] || "Peace";
        
        // LOGIC: Hostile factions go to peace (30% chance) 
        // Peace factions go to war (only 4% chance - very rare)
        let rand = Math.random();
        let newStatus = currentStatus;

        if (currentStatus === "War" && rand < 0.30) {
            newStatus = "Peace";
        } else if (currentStatus === "Peace" && rand < 0.04) {
            newStatus = "War";
        }

if (currentStatus !== newStatus) {
            FACTION_RELATIONS[f1][f2] = newStatus;
            FACTION_RELATIONS[f2][f1] = newStatus;
            
            // ---> NEW: Send the event to the UI Log <---
            if (typeof logGameEvent === 'function') {
                if (newStatus === "War") {
                    logGameEvent(`${f1} has declared war on the ${f2}!`, "war");
                } else if (newStatus === "Peace") {
                    logGameEvent(`${f1} and ${f2} have signed a peace treaty.`, "peace");
                }
            }
            
            // Refresh table if open
            if(document.getElementById('diplomacy-panel').style.display === 'block') {
                renderDiplomacyMatrix();
            }
        }
    }
}

// Counts how many cities each faction owns for the balancing mechanics
function getFactionCityCounts(cities) {
    let counts = {};
    if (!cities) return counts;
    
    cities.forEach(c => {
        if (c && c.faction) {
            counts[c.faction] = (counts[c.faction] || 0) + 1;
        }
    });
    return counts;
}

// Calculates Rubber-Banding and Friction 
function applyFactionModifiers(city, factionCityCounts) {
    if (!city || !city.faction) return { draftMultiplier: 1.0, upkeepMultiplier: 1.0 };
    
    let count = factionCityCounts[city.faction] || 1;
    let draftMultiplier = 1.0;
    let upkeepMultiplier = 1.0;

    if (count <= 2 && city.faction !== "Bandits" && city.faction !== "Player's Kingdom") {
        draftMultiplier = 4.0; 
    }

    if (count >= 10 && city.faction !== "Bandits" && city.faction !== "Player's Kingdom") {
        upkeepMultiplier = 1.5; 
        city.food -= Math.floor(city.pop * 0.02); 
    }

    return { draftMultiplier, upkeepMultiplier };
}

const FACTION_EMOJIS = {
    "Hong Dynasty": "🏯",
    "Shahdom of Iransar": "🦁",
    "Great Khaganate": "🏇",
    "Jinlord Confederacy": "💣",
    "Vietan Realm": "🏝️",
    "Goryun Kingdom": "🐯",
    "Xiaran Dominion": "🐪",
    "High Plateau Kingdoms": "⛰️",
    "Yamato Clans": "🌸",
    "Bandits": "🏴‍☠️",
    "Player's Kingdom": "🎮"
};


function renderDiplomacyMatrix() {
    const panel = document.getElementById('diplomacy-panel');
    const container = document.getElementById('diplomacy-table-container');
    if (!panel || !container) return;

    // Detect Story Mode
    const isStoryMode = !!FACTIONS["Kamakura Shogunate"]; 

    // 1. Re-build Header with a responsive, scrollable container
    panel.innerHTML = `
        <div id="dip-panel-header">
            <h2>Geopolitical Relations</h2>
            <button class="dip-close-btn" onclick="toggleDiplomacyMenu()">✕</button>
        </div>
        <div id="diplomacy-table-container" style="overflow-x: auto; max-width: 100%; padding-bottom: 5px;"></div>
    `;

    const tableBox = document.getElementById('diplomacy-table-container');
    
    // Filter out Bandits
    let factions = Object.keys(FACTIONS).filter(f => f !== "Bandits");
    
    let tableHTML = `<table class="dip-table" style="width: 100%; border-collapse: collapse; margin: 0 auto;"><thead><tr><th></th>`;

    // Generate Top Row (Headers)
    factions.forEach(f => {
        if (isStoryMode) {
            // STORY: Replace spaces with <br> to force vertical stacking and keep columns slim
            let stackedName = f.replace(/ /g, '<br>');
            
            tableHTML += `
                <th title="${f}" style="
                    padding: 4px 2px; 
                    font-size: 0.70rem; 
                    text-align: center; 
                    vertical-align: bottom; 
                    line-height: 1.1;">
                    ${stackedName}
                </th>`;
        } else {
            // SANDBOX: Render Emojis
            let emoji = FACTION_EMOJIS[f] || "🏳️";
            tableHTML += `<th title="${f}" style="font-size: 1.2rem; text-align: center; padding: 4px;">${emoji}</th>`; 
        }
    });
    tableHTML += `</tr></thead><tbody>`;

    // Generate Matrix Rows
    factions.forEach(f1 => {
        // Adjust the row label: Use <br> for Story Mode, keep emoji logic for Sandbox
        // We removed 'white-space: nowrap;' so the <br> actually works!
        let rowLabel = isStoryMode ? f1.replace(/ /g, '<br>') : `${FACTION_EMOJIS[f1] || "🏳️"} ${f1}`;
        
        tableHTML += `<tr><td class="dip-row-label" style="font-size: 0.75rem; padding-right: 8px; text-align: right; vertical-align: middle; line-height: 1.1;">${rowLabel}</td>`;
        
        factions.forEach(f2 => {
            let rel = "Peace";
            
            // Force the table to respect the global 'isHostile' check first
            if (isHostile(f1, f2)) {
                rel = "War";
            } else {
                rel = (typeof getRelation === 'function') ? getRelation(f1, f2) : (FACTION_RELATIONS[f1]?.[f2] || "Peace");
            }

            if (f1 === f2) rel = "-";

            let color = "#d4b886"; // Neutral/Peace
            if (rel === "War") color = "#ff5252";
            if (rel === "Ally") color = "#8bc34a";
            
            let cellContent = (rel === "-") ? "-" : rel.toUpperCase();
            let clickableStyle = "";

            // Dynamic Player check to account for "Player" (Story) vs "Player's Kingdom" (Sandbox)
            let pFaction = (typeof player !== 'undefined' && player.faction) ? player.faction : (isStoryMode ? "Player" : "Player's Kingdom");
            
            // Reduce font-size and padding on mobile cells to ensure the whole matrix fits
            if (f1 === pFaction && f2 !== f1) {
                clickableStyle = "cursor: pointer; text-decoration: underline;";
                tableHTML += `<td style="color: ${color}; font-weight: bold; text-align: center; font-size: 0.75rem; padding: 4px 2px; ${clickableStyle}" 
                                  onclick="togglePlayerWar('${f2}')" 
                                  title="Tap to toggle War/Peace">
                                  ${cellContent}
                              </td>`;
            } else {
                tableHTML += `<td style="color: ${color}; font-weight: bold; text-align: center; font-size: 0.75rem; padding: 4px 2px;">${cellContent}</td>`;
            }
        });
        tableHTML += `</tr>`;
    });

    tableHTML += `</tbody></table>`;
    tableBox.innerHTML = tableHTML;
}

// NEW: Function to handle Player-specific diplomatic changes
function togglePlayerWar(targetFaction) {
    if (targetFaction === "Player's Kingdom" || targetFaction === "Bandits") return;

    if (!player.enemies) player.enemies = []; // Safety check

    const isCurrentlyWar = player.enemies.includes(targetFaction);
    
    if (isCurrentlyWar) {
        // --- MAKE PEACE ---
        player.enemies = player.enemies.filter(e => e !== targetFaction);
        
        if (typeof logGameEvent === 'function') {
            logGameEvent(`PEACE: You have signed a peace treaty with ${targetFaction}.`, "peace");
        }
    } else {
        // --- DECLARE WAR ---
        player.enemies.push(targetFaction);
        
        if (typeof logGameEvent === 'function') {
            logGameEvent(`WAR: You have formally declared war on ${targetFaction}!`, "war");
        }
    }

    // Refresh the UI so the table colors update immediately
    renderDiplomacyMatrix();
}