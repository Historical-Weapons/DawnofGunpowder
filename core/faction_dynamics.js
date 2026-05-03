// ============================================================================
// FACTION DYNAMICS & DIPLOMACY SYSTEM
// ============================================================================
// This file is responsible for the global diplomacy matrix (who is at War,
// Peace, or Allied with whom) and the per-faction balancing modifiers
// (rubber-banding for tiny factions, friction for huge ones).
//
// SCENARIO COMPATIBILITY:
//   initDiplomacy(factionsList) wipes FACTION_RELATIONS and rebuilds it from
//   scratch using whichever faction dictionary you pass. So when a scenario
//   launches and replaces window.FACTIONS, scenario_update.js calls
//   initDiplomacy(window.FACTIONS) again and the matrix is rebuilt to match.
//   No code changes were needed for this — just a re-call.
//
//   The render function (renderDiplomacyMatrix) reads window.FACTIONS at the
//   moment it draws, so it always reflects whatever faction set is active —
//   sandbox, story 1, or scenario.
// ============================================================================

let FACTION_RELATIONS = {};
let diplomacyTick = 0;

// ── PLAYER FACTION RESOLVER ─────────────────────────────────────────────────
// Canonical name is now "Player" (renamable via the editor). Old saves and
// some legacy modules use "Player's Kingdom" — both resolve to the same
// faction. Use window.PlayerFaction.is(name) instead of literal comparisons.
window.PlayerFaction = {
    DEFAULT: "Player",
    LEGACY:  "Player's Kingdom",
    // Returns the player's current canonical name (whatever the player set).
    name() {
        if (typeof player !== 'undefined' && player && player.faction) return player.faction;
        return this.DEFAULT;
    },
    // True if `n` is the player faction by ANY known name (canonical, legacy,
    // or whatever the player has currently renamed themselves to).
    is(n) {
        if (!n) return false;
        if (n === this.DEFAULT) return true;
        if (n === this.LEGACY)  return true;
        if (typeof player !== 'undefined' && player && player.faction === n) return true;
        return false;
    }
};

// Run this once when the map generates. Safe to call again after a scenario
// is launched — it wipes FACTION_RELATIONS and rebuilds from the new list.
function initDiplomacy(factionsList) {
    if (!factionsList) return;

    // Reset the matrix entirely — this is what makes scenario re-init clean.
    FACTION_RELATIONS = {};

    let names = Object.keys(factionsList);
    names.forEach(f1 => {
        FACTION_RELATIONS[f1] = {};
        names.forEach(f2 => {
            // Everyone explicitly starts at "Peace".
            FACTION_RELATIONS[f1][f2] = (f1 === f2) ? "Ally" : "Peace";
        });
    });
    console.log("Global Diplomacy Matrix Initialized (Peaceful Start) for "
                + names.length + " factions: " + names.join(", "));
}

// ── Programmatic relation setters (used by scenario init & triggers) ────────
// setRelation("Yamato Clans", "Great Khaganate", "War")  → mirrors both ways.
function setRelation(a, b, rel) {
    if (!a || !b || a === b) return;
    if (rel !== "War" && rel !== "Peace" && rel !== "Ally") return;
    if (!FACTION_RELATIONS[a]) FACTION_RELATIONS[a] = {};
    if (!FACTION_RELATIONS[b]) FACTION_RELATIONS[b] = {};
    FACTION_RELATIONS[a][b] = rel;
    FACTION_RELATIONS[b][a] = rel;

    // If one side is the Player, also keep player.enemies in sync.
    if (typeof player !== 'undefined' && player) {
        if (!Array.isArray(player.enemies)) player.enemies = [];
        const playerIs = window.PlayerFaction;
        const isPlayerA = playerIs.is(a), isPlayerB = playerIs.is(b);
        const other = isPlayerA ? b : (isPlayerB ? a : null);
        if (other && other !== "Bandits") {
            const idx = player.enemies.indexOf(other);
            if (rel === "War" && idx === -1)  player.enemies.push(other);
            if (rel !== "War" && idx !== -1)  player.enemies.splice(idx, 1);
        }
    }
}

function getRelation(a, b) {
    if (!a || !b) return "Peace";
    if (a === b) return "Ally";
    if (a === "Bandits" || b === "Bandits") return "War";
    if (FACTION_RELATIONS[a] && FACTION_RELATIONS[a][b]) return FACTION_RELATIONS[a][b];
    return "Peace";
}

// Apply a {A: {B: "War", ...}, ...} matrix in bulk. Used by scenario launch
// to seed the diplomacy state from scenario.initialDiplomacy.
function applyDiplomacyMatrix(matrix) {
    if (!matrix || typeof matrix !== "object") return 0;
    let n = 0;
    Object.keys(matrix).forEach(a => {
        const row = matrix[a] || {};
        Object.keys(row).forEach(b => {
            const rel = row[b];
            if (rel === "War" || rel === "Peace" || rel === "Ally") {
                setRelation(a, b, rel);
                n++;
            }
        });
    });
    console.log("[Diplomacy] Applied initial matrix:", n, "relation(s).");
    return n;
}

// Make initDiplomacy callable from anywhere (scenario_update.js, etc.).
// (function declarations at the top level are already on window in browsers,
// but assigning explicitly keeps it robust if this file is ever wrapped.)
if (typeof window !== "undefined") {
    window.initDiplomacy        = initDiplomacy;
    window.setRelation          = setRelation;
    window.getRelation          = getRelation;
    window.applyDiplomacyMatrix = applyDiplomacyMatrix;
    window.FACTION_RELATIONS_get = () => FACTION_RELATIONS; // accessor for debugging
}

// Global helper to check if two factions want to kill each other
function isHostile(factionA, factionB) {
    if (!factionA || !factionB) return false;
    if (factionA === factionB) return false;

    // Bandits are globally hostile
    if (factionA === "Bandits" || factionB === "Bandits") return true;

    // Player Diplomacy logic — alias-aware via PlayerFaction.is()
    const playerIs = window.PlayerFaction;
    const aIsPlayer = playerIs && playerIs.is(factionA);
    const bIsPlayer = playerIs && playerIs.is(factionB);
    if (aIsPlayer || bIsPlayer) {
        if (typeof player !== 'undefined' && player.enemies) {
            if (aIsPlayer) return player.enemies.includes(factionB);
            if (bIsPlayer) return player.enemies.includes(factionA);
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

    // Filter dynamically — works for renamed Player factions and scenario setups.
    let pFaction = window.PlayerFaction.name();
    let names = Object.keys(FACTION_RELATIONS).filter(f =>
        f !== "Bandits" && !window.PlayerFaction.is(f)
    );
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
            const dPanel = document.getElementById('diplomacy-panel');
            if (dPanel && dPanel.style.display === 'block') {
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

    const isPlayer = window.PlayerFaction.is(city.faction);
    let count = factionCityCounts[city.faction] || 1;
    let draftMultiplier = 1.0;
    let upkeepMultiplier = 1.0;

    if (count <= 2 && city.faction !== "Bandits" && !isPlayer) {
        draftMultiplier = 4.0;
    }

    if (count >= 10 && city.faction !== "Bandits" && !isPlayer) {
        upkeepMultiplier = 1.5;
        city.food -= Math.floor(city.pop * 0.02);
    }

    return { draftMultiplier, upkeepMultiplier };
}

const FACTION_EMOJIS = {
    "Hong Dynasty": "🏯",
    "Dab Tribes": "🐘",
    "Great Khaganate": "🏇",
    "Jinlord Confederacy": "💣",
    "Tran Realm": "🏝️",
    "Goryun Kingdom": "🐯",
    "Xiaran Dominion": "🐫",
    "High Plateau Kingdoms": "⛰️",
    "Yamato Clans": "🌸",
    "Bandits": "🏴‍☠️",
    "Player": "🎮",
    "Player's Kingdom": "🎮"   // legacy alias
};


function renderDiplomacyMatrix() {
    const panel = document.getElementById('diplomacy-panel');
    const container = document.getElementById('diplomacy-table-container');
    if (!panel || !container) return;

    // Read the live FACTIONS object — this is what makes the matrix
    // automatically reflect the active scenario's faction set.
    const liveFactions = (typeof FACTIONS !== 'undefined') ? FACTIONS : (window.FACTIONS || {});

    // Detect Story Mode
    const isStoryMode = !!liveFactions["Kamakura Shogunate"];

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
    let factions = Object.keys(liveFactions).filter(f => f !== "Bandits");

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
            // SANDBOX / SCENARIO: Render Emojis (with a fallback for custom factions)
            let emoji = FACTION_EMOJIS[f] || "🏴";
            tableHTML += `<th title="${f}" style="font-size: 1.2rem; text-align: center; padding: 4px;">${emoji}</th>`;
        }
    });
    tableHTML += `</tr></thead><tbody>`;

    // Generate Matrix Rows
    factions.forEach(f1 => {
        // Adjust the row label: Use <br> for Story Mode, keep emoji logic for Sandbox
        let rowLabel = isStoryMode ? f1.replace(/ /g, '<br>') : `${FACTION_EMOJIS[f1] || "🏴"} ${f1}`;

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

            // Alias-aware player check — works for "Player", "Player's
            // Kingdom", or any custom-renamed Player faction in scenarios.
            let pFaction = (typeof player !== 'undefined' && player.faction)
                            ? player.faction
                            : (isStoryMode ? "Player" : window.PlayerFaction.DEFAULT);

            if (window.PlayerFaction.is(f1) && f2 !== f1) {
                clickableStyle = "cursor: pointer; text-decoration: underline;";
                tableHTML += `<td style="color: ${color}; font-weight: bold; text-align: center; font-size: 0.75rem; padding: 4px 2px; ${clickableStyle}"
                                  onclick="togglePlayerWar('${f2.replace(/'/g, "\\'")}')"
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

// ── AUTO-REFRESH: re-render whenever the diplomacy panel is shown ─────────────
// This ensures the table always reflects the LIVE FACTIONS (including scenario
// renames / deletions) rather than whatever was rendered last time.
(function _watchDiplomacyPanel() {
    function _attachObserver() {
        const panel = document.getElementById('diplomacy-panel');
        if (!panel) return false;
        let lastDisplay = panel.style.display;
        new MutationObserver(() => {
            const cur = panel.style.display;
            if (cur !== 'none' && cur !== lastDisplay) {
                // Panel just became visible — rebuild the table from live FACTIONS
                renderDiplomacyMatrix();
            }
            lastDisplay = cur;
        }).observe(panel, { attributes: true, attributeFilter: ['style'] });
        return true;
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (!_attachObserver()) {
                // Panel may be injected later (mobile UI etc.) — poll briefly
                let t = 0;
                const id = setInterval(() => { if (_attachObserver() || ++t > 50) clearInterval(id); }, 200);
            }
        });
    } else {
        if (!_attachObserver()) {
            let t = 0;
            const id = setInterval(() => { if (_attachObserver() || ++t > 50) clearInterval(id); }, 200);
        }
    }
})();

function togglePlayerWar(targetFaction) {
    if (window.PlayerFaction.is(targetFaction) || targetFaction === "Bandits") return;

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