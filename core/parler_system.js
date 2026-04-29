
let inParleMode = false;
let currentParleNPC = null;
let savedParleTile = null; 
let isDiplomacyProcessing = false; // NEW: Prevents button spamming

function getTopExpensiveNPCUnits(npc, count = 3) {
    if (!npc.roster || npc.roster.length === 0) return [];

    // Assumption: FACTIONS data is defined globally or in npc_system.js
    // Assumption: UnitRoster.allUnits is defined in troop_system.js

    // 1. Create a map of Unit Type -> Cost (referencing Troop System)
    let unitDataArr = [];
    npc.roster.forEach(unitEntry => {
        let type = unitEntry.type;
        let baseTemplate = null;

        if (typeof UnitRoster !== 'undefined' && UnitRoster.allUnits && UnitRoster.allUnits[type]) {
            baseTemplate = UnitRoster.allUnits[type];
        }

        // Add to array with cost; fallback to 0 if cost is not specified in Troop System
        unitDataArr.push({
            type: type,
            cost: (baseTemplate && baseTemplate.cost) ? baseTemplate.cost : 0
        });
    });

    // 2. Sort the array descending by cost
    unitDataArr.sort((a, b) => b.cost - a.cost);

    // 3. Return only unique types to prevent displaying multiple 'Elite Lancer' entries
    let uniqueTypes = [];
    let topUnits = [];
    for (let data of unitDataArr) {
        if (!uniqueTypes.includes(data.type)) {
            uniqueTypes.push(data.type);
            topUnits.push(data);
            if (topUnits.length >= count) break; 
        }
    }

    return topUnits;
}

/**
 * Returns a tailored dialogue string for the 'Hello' choice based on the NPC role.
 */
function generateNPCDialogue(npc, choice) {
    // UPDATED: Dynamically check standings
    const isEnemy = player.enemies && player.enemies.includes(npc.faction);
    const isAlly = npc.faction === player.faction;

    if (choice === "Hello") {
        if (npc.faction === "Bandits" || npc.role === "Bandit") {
            return "What do you think you're doing? Hand over everything!";
        } else if (npc.role === "Civilian" || npc.role === "Commerce") {
            return "We are simple folk, just passing through.";
        } else if (npc.role === "Patrol" || npc.role === "Military") {
            if (isAlly) {
                // Assumption: player.faction is defined in the global player object
                return "Commander! The region is stable. Our forces stand ready.";
            } else if (isEnemy) {
                return "You stand on hostile ground. Explain your presence, or we will remove you, dead or alive!";
            } else {
                // Neutral military response
                return `Halt. We represent the ${npc.faction}. We seek no quarrel, provided you keep your weapons sheathed.`;
            }
        } else {
            // Neutral/Default response
            return `Hello there. Safe travels in these parts.`;
        }
    }
    
    return "...";
}

function generateNPCDialogue(npc, choice) { //new version
       if (choice !== "Hello") return "...";
       const isEnemy = player.enemies && player.enemies.includes(npc.faction);
       const isAlly  = npc.faction === player.faction;
       return RandomDialogue.generateHello({
           faction:       npc.faction,
           playerFaction: player.faction,
           playerNumbers: player.troops || 0,
           npcNumbers:    npc.count    || 0,
           npcType:       npc.role,
           isEnemy,
           isAlly
      }, npc);
  }

function handleDiplomacyAction(npc, actionType) {
if (isDiplomacyProcessing) return; // EXIT if we are already transitioning

    if (typeof AudioManager !== 'undefined') AudioManager.playSound('ui_click');
    // UPDATED: Define different scenarios based on dynamic faction standing
    const isEnemy = player.enemies && player.enemies.includes(npc.faction);
    const isAlly = npc.faction === player.faction;
    const isNeutral = !isEnemy && !isAlly;
    const isBandit = npc.faction === "Bandits" || npc.role === "Bandit";

    // NEW: Calculate Overwhelming Odds (3:1 ratio)
    const playerTroops = player.troops || 0;
    const npcTroops = npc.count || 0;
    const isOverwhelmingOdds = playerTroops >= (npcTroops * 3);

    const parleDialogue = document.getElementById('parle-dialogue');
    parleDialogue.innerText = ""; // Clear current string

    switch (actionType) {
        case "HELLO":
            parleDialogue.innerText = generateNPCDialogue(npc, "Hello");
            break;

case "RANDOM":
            if (typeof RandomDialogue !== 'undefined' && typeof RandomDialogue.generate === 'function') {
                // Pass the npc object reference as the second argument to track spam/re-encounters
                parleDialogue.innerText = RandomDialogue.generate({
                    faction: npc.faction,
                    playerFaction: player.faction,
                    playerNumbers: playerTroops,
                    npcNumbers: npcTroops,
                    npcType: npc.role,
                    isEnemy: isEnemy,
                    isAlly: isAlly
                }, npc);
            } else {
                parleDialogue.innerText = "There is much to discuss, but perhaps another time.";
            }
            break;
case "DECLARE_WAR":
            isDiplomacyProcessing = true;
            parleDialogue.innerText = `Quick, send a messenger! The ${npc.faction} must declare war!`;
            if (!player.enemies) player.enemies = [];
            if (!player.enemies.includes(npc.faction)) {
                player.enemies.push(npc.faction);
            }
            setTimeout(() => {
                showPreBattleOptions(npc); // <-- CHANGED from executeAttackAction
            }, 1500);
            break;

        case "LEAVE": {
            const isCivilianOrCommerce = npc.role === "Civilian" || npc.role === "Commerce";
            const isHostileCombatType = (npc.role === "Bandit" || npc.role === "Military" || npc.role === "Patrol");

            if (isCivilianOrCommerce) {
                isDiplomacyProcessing = true;
                parleDialogue.innerText = `Goodbye.`;
                setTimeout(() => { leaveParle(player); }, 1200);
            } else if ((isEnemy || isBandit || isHostileCombatType) && isOverwhelmingOdds) {
                isDiplomacyProcessing = true;
                parleDialogue.innerText = `You left with confidence.`;
                setTimeout(() => { leaveParle(player); }, 2000);
            } else if (isAlly || isNeutral) {
                isDiplomacyProcessing = true;
                leaveParle(player);
            } else {
                isDiplomacyProcessing = true;
                parleDialogue.innerText = `You can't walk away from us, you fool. We'll take what is ours! Prepare yourself!`;
                setTimeout(() => {
                    showPreBattleOptions(npc); // <-- CHANGED from executeAttackAction
                }, 1500);
            }
            break;
        }

        case "ATTACK":
            isDiplomacyProcessing = true; 
            parleDialogue.innerText = `Prepare for Battle!`;
            setTimeout(() => {
                showPreBattleOptions(npc); // <-- CHANGED from executeAttackAction
            }, 1000);
            break;
    }
}

function showPreBattleOptions(npc) {
    const actionBox = document.getElementById('parle-action-box');
    const parleDialogue = document.getElementById('parle-dialogue');
    
    // Clear existing dialogue and buttons
    actionBox.innerHTML = '';
    parleDialogue.innerText = `The forces are ready. Will you take to the field, or send your troops to resolve this?`;
    
    // Allow clicking again
    isDiplomacyProcessing = false; 

    // Button 1: Send Troops (Autoresolve)
    const sendTroopsBtn = createDiplomacyButton("Send Troops (Autoresolve)", () => {
        if (isDiplomacyProcessing) return;
        startAutoresolve(npc);
    });
	// THE FIX: Change or remove the troop count check
// If you want to allow it even with 1 troop, use:
if (player.troops < 1) { 
    sendTroopsBtn.disabled = true;
    sendTroopsBtn.style.opacity = "0.5";
    sendTroopsBtn.title = "Cannot Autoresolve";
}

    sendTroopsBtn.style.background = "linear-gradient(to bottom, #d4a373, #faedcd)";
    sendTroopsBtn.style.color = "#333";
    actionBox.appendChild(sendTroopsBtn);

    // Button 2: Lead Troops (Manual Battle)
    const leadTroopsBtn = createDiplomacyButton("Lead Troops (Take the field)", () => {
        if (isDiplomacyProcessing) return;
        isDiplomacyProcessing = true;
        parleDialogue.innerText = "To battle!";
        setTimeout(() => {
            executeAttackAction(npc);
        }, 800);
    }, true); // Red attack styling
    actionBox.appendChild(leadTroopsBtn);
}

function executeAttackAction(npc) {
    const tile = savedParleTile || { name: "Plains" }; // Fallback

    // Check external references: enterBattlefield, player (from index.html scope)
    if (typeof enterBattlefield === 'function') {
        leaveParle(player, true); // Close diplomacy state, but flag that we are going to battle (don't set BATTLE_COOLDOWN)
		
		// --- AUDIO SURGERY: SILENCE START ---
    if (typeof AudioManager !== 'undefined') {
        const now = Date.now();
        AudioManager._sfxGateTime = now + 1200;    // 1.2 seconds of total silence
        AudioManager._combatGateTime = now + 2500; // 2.5 seconds of no clashing/swings
        
        // Kill any sounds currently hanging over from the world map
        if (AudioManager.activeOscillators) {
            AudioManager.activeOscillators.forEach(osc => { try { osc.stop(); } catch(e) {} });
            AudioManager.activeOscillators = [];
        }
    }
    // --- END SURGERY ---
	
	
        enterBattlefield(npc, player, tile); // Launch Battlefield System
    } else {
        console.error("Battlefield System (enterBattlefield) not found! Diplomacy aborted.");
        leaveParle(player);
    }
}

function initiateParleWithNPC(npc, tile) {
	
if (typeof inBattleMode !== 'undefined' && inBattleMode) return;
    if (typeof inCityMode !== 'undefined' && inCityMode) return; 
    isHoveringPlayer = false;
    window.isRosterOpen = false;
	
    if (typeof lastBattleTime !== 'undefined' && typeof BATTLE_COOLDOWN !== 'undefined') {
        if (Date.now() - lastBattleTime < BATTLE_COOLDOWN) {
            return; // Exit silently, giving the player time to walk away
        }
    }

    isDiplomacyProcessing = false; // Reset lock on new encounter
    inParleMode = true;
    currentParleNPC = npc;
    savedParleTile = tile;

    if (player) player.isMapPaused = true;
    if (typeof AudioManager !== 'undefined') AudioManager.playSound('ui_parle_open'); 

    document.getElementById('parle-panel').style.display = 'block';
    
    // NPC Name
    document.getElementById('parle-npc-name').innerText = npc.role;
    
    // --- FACTION LOGIC ---
    let factionName = npc.faction;
    const standingEl = document.getElementById('parle-faction-standing');
    
    // Special check for Independent / Player Kingdom
    if (factionName === "Independent") {
        factionName = "Player's Kingdom";
    }
    document.getElementById('parle-npc-faction').innerText = factionName;

    // Standing Indicator
    const isEnemy = player.enemies && player.enemies.includes(npc.faction);
    const isAlly = npc.faction === player.faction;

    if (isAlly) {
        standingEl.innerText = "Ally";
        standingEl.style.backgroundColor = "#2e7d32"; // Green
        standingEl.style.color = "#fff";
    } else if (isEnemy) {
        standingEl.innerText = "Hostile";
        standingEl.style.backgroundColor = "#c62828"; // Red
        standingEl.style.color = "#fff";
    } else {
        standingEl.innerText = "Neutral";
        standingEl.style.backgroundColor = "#616161"; // Grey
        standingEl.style.color = "#fff";
    }

    const npcFactionData = (typeof FACTIONS !== 'undefined' && FACTIONS[npc.faction]) ? FACTIONS[npc.faction] : { color: "#777" };
    document.getElementById('parle-npc-name').style.color = npcFactionData.color;

    // Reset Dialogue & Scroll to top
    const diagBox = document.getElementById('parle-dialogue');
    diagBox.innerText = `You have encountered ${npc.role}. The region is ${tile.name}. What is your approach?`;
    diagBox.scrollTop = 0; // Reset scroll position for new encounters

    // Troop Counts
    document.getElementById('parle-player-troops').innerText = player.troops || 0;
    document.getElementById('parle-npc-troops').innerText = npc.count || 0;

    // NPC Units List
    const unitListUL = document.getElementById('parle-npc-top-units');
    unitListUL.innerHTML = '';
    const topUnits = getTopExpensiveNPCUnits(npc, 3);
    if (topUnits.length > 0) {
        topUnits.forEach(unit => {
            let li = document.createElement('li');
            li.innerHTML = `<span style="color:#d4b886;">${unit.cost}G</span> - ${unit.type}`;
            unitListUL.appendChild(li);
        });
    } else {
        unitListUL.innerHTML = `<li style="color:#666;">No notable units</li>`;
    }

    populateParleButtons(npc);
	// --- SURGERY: Inject NPC Cargo into the Parley UI ---
    if (npc.cargo && Object.keys(npc.cargo).length > 0 && typeof RESOURCE_CATALOG !== 'undefined') {
        let cargoLi = document.createElement('li');
        cargoLi.style.marginTop = "8px";
        cargoLi.style.borderTop = "1px solid rgba(212, 184, 134, 0.3)";
        cargoLi.style.paddingTop = "6px";
        
        let cargoStrings = [];
        for (let rid in npc.cargo) {
            if (npc.cargo[rid] > 0 && RESOURCE_CATALOG[rid]) {
                cargoStrings.push(`${npc.cargo[rid]}x ${RESOURCE_CATALOG[rid].emoji} ${RESOURCE_CATALOG[rid].label}`);
            }
        }
        
        if (cargoStrings.length > 0) {
            cargoLi.innerHTML = `<span style="color:#888; font-size:11px; text-transform:uppercase; letter-spacing:1px;">Caravan Cargo:</span><br><span style="color:#d4b886; font-size:13px;">${cargoStrings.join('<br>')}</span>`;
            unitListUL.appendChild(cargoLi);
        }
    }
    // ----------------------------------------------------
}

function populateParleButtons(npc) {
    const actionBox = document.getElementById('parle-action-box');
    actionBox.innerHTML = ''; // Clear previous buttons

    // UPDATED: Dynamic faction standings
    const isEnemy = player.enemies && player.enemies.includes(npc.faction);
    const isAlly = npc.faction === player.faction;
    const isNeutral = !isEnemy && !isAlly;
    const isBandit = npc.faction === "Bandits" || npc.role === "Bandit";

    // NEW: Calculate Odds for button context
    const playerTroops = player.troops || 0;
    const npcTroops = npc.count || 0;
    const isOverwhelmingOdds = playerTroops >= (npcTroops * 3);

    // Create buttons (similar to Bannerlord options)

    // Button 1: Saying Hello
    actionBox.appendChild(createDiplomacyButton("Greetings... (Saying Hello)", () => {
        handleDiplomacyAction(npc, "HELLO");
    }));

    // Button 2: Updated Text - Prepared for external random dialogue integration
    actionBox.appendChild(createDiplomacyButton("There is something I want to discuss.", () => {
        handleDiplomacyAction(npc, "RANDOM");
    }));

    // Button 3: Hostile Actions (Dynamic based on standing)
    if (isEnemy) {
        actionBox.appendChild(createDiplomacyButton("I am attacking you. (Force Attack)", () => {
            handleDiplomacyAction(npc, "ATTACK");
        }, true)); // Flag as attack action for styling
    } else if (isNeutral) {
        actionBox.appendChild(createDiplomacyButton("Your lands are forfeit! (Declare War)", () => {
            handleDiplomacyAction(npc, "DECLARE_WAR");
        }, true)); // Flag as attack action for styling
    }

let leaveText = "Leave.";

const isCivilianOrCommerce =
    npc.role === "Civilian" || npc.role === "Commerce";

const isHostileCombatType =
    npc.role === "Bandit" ||
    npc.role === "Military" ||
    npc.role === "Patrol";

/* --- PRIORITY: ALLIES FIRST --- */
if (isAlly) {

    leaveText = "Goodbye.";

}

/* --- HOSTILE FORCES --- */
else if (isEnemy || isHostileCombatType) {

    leaveText = isOverwhelmingOdds
        ? "Leave. (They are intimidated)"
        : "Attempt to Leave.";

}

/* --- CIVILIANS / NEUTRALS --- */
else if (isCivilianOrCommerce || isNeutral) {

    leaveText = "Leave.";

}
    
    actionBox.appendChild(createDiplomacyButton(leaveText, () => {
        handleDiplomacyAction(npc, "LEAVE");
    }));
}

/**
 * Clean up the diplomacy screen and resume the world map.
 */
function leaveParle(playerObj, isGoingToBattle = false) {
    inParleMode = false;

    // NEW: Reset the random dialogue spam checker for the next encounter
    if (typeof RandomDialogue !== 'undefined') {
        RandomDialogue.resetSession();
    }
 
    // ---> THE FIX: Push the NPC away to prevent infinite Parle loops <---
    if (!isGoingToBattle && currentParleNPC) {
        let angle = Math.random() * Math.PI * 2;
        currentParleNPC.x += Math.cos(angle) * 30;
        currentParleNPC.y += Math.sin(angle) * 30;
        currentParleNPC.waitTimer = 0; // Make them walk away immediately
        currentParleNPC.targetX = currentParleNPC.x + Math.cos(angle) * 100;
        currentParleNPC.targetY = currentParleNPC.y + Math.sin(angle) * 100;
    }

    currentParleNPC = null;
    savedParleTile = null;

    // ---> RESUME MAP MOVEMENTS <---
    if (playerObj) playerObj.isMapPaused = false; 

    if (typeof AudioManager !== 'undefined') AudioManager.playSound('ui_parle_close'); 

    if (!isGoingToBattle) {
        if (typeof lastBattleTime !== 'undefined' && typeof BATTLE_COOLDOWN !== 'undefined') {
            lastBattleTime = Date.now(); // Prevents instant encounter re-trigger
        }
    }

    // HIDE THE UI
    document.getElementById('parle-panel').style.display = 'none';
    console.log("World Map Resumed.");
}

// HELPER: Create standard Parle/Diplomacy styled button
function createDiplomacyButton(text, clickHandler, isAttack = false) {
    const btn = document.createElement('button');
    btn.className = 'menu-btn'; // Standard styled button class from index.html
    btn.style.textTransform = "none"; // Preserve capitalization for these Bannerlord-like options
    btn.innerText = text;
    btn.onclick = clickHandler;

    // Special styling for the 'Attack' choice (red highlight)
    if (isAttack) {
        btn.style.background = "linear-gradient(to bottom, #d32f2f, #b71c1c)";
        btn.style.borderColor = "#fff";
        btn.style.color = "#fff";
    }

    return btn;
}

 function closeParleUI() {
    // Force state reset
    inParleMode = false;
    currentParleNPC = null;
    savedParleTile = null;
    isDiplomacyProcessing = false;

    // HARD target the correct GUI
    const panel = document.getElementById('parle-panel');
    if (panel) {
        panel.style.display = 'none';
    }

    // Resume game
    if (player) player.isMapPaused = false;

    // Optional: clear dialogue so it doesn't "ghost"
    const dialogue = document.getElementById('parle-dialogue');
    if (dialogue) dialogue.innerText = "";

    console.log("Parle UI force-closed.");
}


/* =========================================================================
   AUTORESOLVE SYSTEM
   Appended to Parler System
========================================================================= */

function startAutoresolve(npc) {
    isDiplomacyProcessing = true; // Lock UI
    const actionBox = document.getElementById('parle-action-box');
    const parleDialogue = document.getElementById('parle-dialogue');

    actionBox.innerHTML = ''; // Clear buttons
    parleDialogue.innerText = "The battle is raging. Waiting for the dust to settle...";

    // Create Progress Bar UI
    const progressContainer = document.createElement('div');
    progressContainer.style.width = "100%";
    progressContainer.style.height = "20px";
    progressContainer.style.backgroundColor = "#222";
    progressContainer.style.border = "1px solid #555";
    progressContainer.style.marginTop = "15px";
    progressContainer.style.position = "relative";

    const progressBar = document.createElement('div');
    progressBar.style.width = "0%";
    progressBar.style.height = "100%";
    progressBar.style.backgroundColor = "#8b0000"; // Deep red for battle
    progressBar.style.transition = "width 0.1s linear";

    const progressText = document.createElement('div');
    progressText.style.position = "absolute";
    progressText.style.width = "100%";
    progressText.style.textAlign = "center";
    progressText.style.color = "#fff";
    progressText.style.fontSize = "12px";
    progressText.style.top = "2px";
    progressText.innerText = "Calculating Tactics...";

    progressContainer.appendChild(progressBar);
    progressContainer.appendChild(progressText);
    actionBox.appendChild(progressContainer);

    // Simulate Calculation over 2.5 seconds
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 5 + 2; // Random increments
        if (progress > 30) progressText.innerText = "Clashing lines...";
        if (progress > 60) progressText.innerText = "Counting casualties...";
        
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            progressBar.style.width = progress + "%";
            
            setTimeout(() => {
                processAutoresolveMath(npc);
            }, 500);
        } else {
            progressBar.style.width = progress + "%";
        }
    }, 100);
}

function processAutoresolveMath(npc) {
    // 1. Analyze Armies
    const playerStats = analyzeArmy(player.roster || []);
    const npcStats = analyzeArmy(npc.roster || []);

    // 2. Apply Rock-Paper-Scissors (RPS) Modifiers
    // Infantry > Cav (+25%), Cav > Ranged (+25%), Ranged > Infantry (+25%)
    const applyRPS = (attacker, defender) => {
        let bonus = 0;
        bonus += Math.min(attacker.infantryPower, defender.cavalryPower) * 0.25;
        bonus += Math.min(attacker.cavalryPower, defender.rangedPower) * 0.25;
        bonus += Math.min(attacker.rangedPower, defender.infantryPower) * 0.25;
        return bonus;
    };

    let playerEffectivePower = playerStats.totalPower + applyRPS(playerStats, npcStats);
    let npcEffectivePower = npcStats.totalPower + applyRPS(npcStats, playerStats);
playerEffectivePower *= 1.10;//10 percent bonus
    // Add slight RNG variance (+/- 10%)
    playerEffectivePower *= (0.9 + Math.random() * 0.2);
    npcEffectivePower *= (0.9 + Math.random() * 0.2);

    // Prevent divide by zero
    if (playerEffectivePower < 1) playerEffectivePower = 1;
    if (npcEffectivePower < 1) npcEffectivePower = 1;

    // 3. Determine Winner & Casualties using Lanchester's Square Law logic
    let playerWon = playerEffectivePower >= npcEffectivePower;
    
    let playerLossPercent = 0;
    let npcLossPercent = 0;

    const baseCasualtyCap = 0.6; // Max 60% loss for the winner in an even fight

    if (playerWon) {
        const powerRatio = npcEffectivePower / playerEffectivePower; // e.g. 0.1 for 10x outnumber
        playerLossPercent = Math.pow(powerRatio, 2) * baseCasualtyCap;
        npcLossPercent = 1.0; // Loser gets wiped (or you can set this to 0.8 to leave survivors)
        
        // Failsafe constraint: 10x ratio = max 2% loss
        if (playerEffectivePower >= npcEffectivePower * 10) {
            playerLossPercent = Math.min(playerLossPercent, 0.02);
        }
    } else {
        const powerRatio = playerEffectivePower / npcEffectivePower;
        npcLossPercent = Math.pow(powerRatio, 2) * baseCasualtyCap;
        playerLossPercent = 1.0; 

        if (npcEffectivePower >= playerEffectivePower * 10) {
            npcLossPercent = Math.min(npcLossPercent, 0.02);
        }
    }

    // 4. Apply Casualties to Rosters
    const playerCasualties = inflictCasualties(player.roster, playerLossPercent);
    const npcCasualties = inflictCasualties(npc.roster, npcLossPercent);

    // Recalculate totals
    player.troops = getRosterTotal(player.roster);
    npc.count = getRosterTotal(npc.roster);

    displayAutoresolveResults(npc, playerWon, playerCasualties, npcCasualties);
}
function analyzeArmy(roster) {
    let stats = {
        totalPower: 0,
        infantryPower: 0,
        rangedPower: 0,
        cavalryPower: 0,
        totalTroops: 0
    };

    roster.forEach(unit => {
        // FIX: Default to 1 if it's a flat roster array without a count property
        const count = unit.count !== undefined ? unit.count : 1;
        stats.totalTroops += count;

        let baseCost = 10; // Fallback
        let unitClass = "Infantry"; // Fallback
        
        // Grab template data from global UnitRoster
        if (typeof UnitRoster !== 'undefined' && UnitRoster.allUnits[unit.type]) {
            const template = UnitRoster.allUnits[unit.type];
            baseCost = template.cost || baseCost;
            
            // FIX: Map your native 'role' system to the RPS logic
            const roleStr = String(template.role || "").toLowerCase();
            if (roleStr.match(/(cav|horse|mount|elephant)/)) {
                unitClass = "Cavalry";
            } else if (roleStr.match(/(archer|crossbow|gun|bomb|throw|rocket)/)) {
                unitClass = "Ranged";
            } else {
                unitClass = "Infantry";
            }
        }

        // Exp factor: Check both exp and level for compatibility
        const levelFactor = 1 + ((unit.exp || unit.level || 1) * 0.1); 
        const unitPower = count * baseCost * levelFactor;

        stats.totalPower += unitPower;

        if (unitClass === "Infantry") stats.infantryPower += unitPower;
        else if (unitClass === "Ranged") stats.rangedPower += unitPower;
        else if (unitClass === "Cavalry") stats.cavalryPower += unitPower;
    });

    return stats;
}

function inflictCasualties(roster, lossPercent) {
    if (!roster || roster.length === 0) return 0;
    if (lossPercent <= 0) return 0;

    let totalTroops = getRosterTotal(roster);
    let expectedLoss = totalTroops * lossPercent;
    
    // Floor it, then roll probability for the decimal remainder
    let definiteLoss = Math.floor(expectedLoss);
    let chanceForExtraLoss = expectedLoss - definiteLoss;
    
    if (Math.random() < chanceForExtraLoss) {
        definiteLoss += 1;
    }

    // Ensure we don't kill more than exist
    definiteLoss = Math.min(definiteLoss, totalTroops);
    let totalLost = 0;

    // FIX: Properly handle both Flat Rosters (splice) and Stacked Rosters (decrement)
    for (let i = 0; i < definiteLoss; i++) {
        if (roster.length === 0) break;
        
        // Pick a random soldier/stack to take the hit
        let randIndex = Math.floor(Math.random() * roster.length);
        let unit = roster[randIndex];
        let count = unit.count !== undefined ? unit.count : 1;
        
        if (count > 1) {
            unit.count--; // Shrink the stack
        } else {
            roster.splice(randIndex, 1); // Kill the individual soldier
        }
        totalLost++;
    }

    return totalLost;
}

function getRosterTotal(roster) {
    if (!roster) return 0;
    // FIX: Safely sum up troops whether they use counts or are flat arrays
    return roster.reduce((sum, unit) => sum + (unit.count !== undefined ? unit.count : 1), 0);
}
function displayAutoresolveResults(npc, playerWon, playerLosses, npcLosses) {
    const actionBox = document.getElementById('parle-action-box');
    const parleDialogue = document.getElementById('parle-dialogue');
    
    // Update UI troop numbers instantly
    document.getElementById('parle-player-troops').innerText = player.troops || 0;
    document.getElementById('parle-npc-troops').innerText = npc.count || 0;

    actionBox.innerHTML = ''; // Clear progress bar

    let resultHtml = "";
    if (playerWon) {
		player.cohesion = Math.min(100, (player.cohesion || 100) + 15); //   BUFF
		
        parleDialogue.innerText = `Victory! The enemy forces have been routed or destroyed.`;
        resultHtml = `
            <div style="padding: 10px; background: rgba(0,255,0,0.1); border: 1px solid #2e7d32; margin-bottom: 10px;">
                <p><strong>Outcome: Victory</strong></p>
                <p style="color: #ffcccc;">Your Casualties: -${playerLosses}</p>
                <p style="color: #99ff99;">Enemy Casualties: -${npcLosses}</p>
            </div>
        `;
        
// --- SURGERY: AUTORESOLVE LOOT SYSTEM ---
        console.log("[AUTORESOLVE] Victory! Calculating loot...");
        
        let winSeverity = npcLosses / Math.max(1, (npcLosses + (npc.roster ? npc.roster.length : 0)));
        let randMod = 0.8 + (Math.random() * 0.4);
        
        // 1. Gold & Food Transfer
        let stolenGold = Math.floor((npc.gold || 0) * winSeverity * randMod);
        let stolenFood = Math.floor((npc.food || 0) * winSeverity * randMod);
        let bountyGold = Math.floor(npcLosses * 5 * randMod); // Battlefield scavenging
        
        player.gold += (stolenGold + bountyGold);
        player.food = (player.food || 0) + stolenFood;
        
        console.log(`[AUTORESOLVE] Gained ${stolenGold + bountyGold} Gold and ${stolenFood} Food.`);

// 2. Cargo/Inventory Transfer
        if (npc.cargo && Object.keys(npc.cargo).length > 0) {
            let currentCargoLoad = Object.values(player.inventory || {}).reduce((a, b) => a + b, 0);
            
            // ---> THE FIX: STRICT CARGO ENFORCEMENT <---
            // Use the global formula. Do NOT overwrite player.cargoCapacity, just use it for math.
            let strictCapacity = Math.max(10, (player.troops || (player.roster ? player.roster.length : 1)) * 2);

            Object.keys(npc.cargo).forEach(rid => {
                let qty = npc.cargo[rid];
                if (qty > 0) {
                    let stolenQty = Math.floor(qty * winSeverity * randMod);
                    if (stolenQty < 1 && Math.random() < winSeverity) stolenQty = 1;

                    // ---> BULLETPROOF CAPACITY CHECK <---
                    let freeSpace = strictCapacity - currentCargoLoad;
                    if (stolenQty > freeSpace) stolenQty = Math.max(0, freeSpace);

                    if (stolenQty > 0) {
                        if (!player.inventory) player.inventory = {};
                        player.inventory[rid] = (player.inventory[rid] || 0) + stolenQty;
                        currentCargoLoad += stolenQty; // Accumulate load accurately
                        console.log(`[AUTORESOLVE] ++ Looted ${stolenQty}x ${rid}`);
                    }
                }
            });
        }
        
        // 3. Experience Hook
        if (player.roster) {
            player.roster.forEach(t => t.exp = (t.exp || 0) + (npcLosses * 2));
        }
        // --- END SURGERY ---
		
		
		
} else {
        parleDialogue.innerText = `Defeat! Your forces have been crushed and scattered.`;
// --- SURGERY: AUTORESOLVE DEFEAT PENALTY ---
        console.log("[AUTORESOLVE] Defeat! Calculating wealth loss...");
        
        player.cohesion = Math.max(0, (player.cohesion || 100) - 25); // COHESION NERF

        // Calculate how much of your total army was lost
        let pInitial = playerLosses + (player.roster ? player.roster.length : 0);
        let lossSeverity = playerLosses / Math.max(1, pInitial); // 0.0 to 1.0
        
        let randMod = 0.8 + (Math.random() * 0.2); // Cap RNG to 1.0 max
        let plunderMultiplier = Math.pow(lossSeverity, 1.5) * 0.95; // Exponential scale!

        // 1. Lose Gold & Food (Scales exponentially up to 95%)
        let goldLost = Math.floor(player.gold * plunderMultiplier * randMod);
        let foodLost = Math.floor((player.food || 0) * plunderMultiplier * randMod);

        player.gold = Math.max(0, player.gold - goldLost);
        player.food = Math.max(0, (player.food || 0) - foodLost);

        // Enemy gets the gold you lost
        npc.gold = (npc.gold || 0) + goldLost;
        npc.food = (npc.food || 0) + foodLost;

        // 2. Plunder Inventory
        if (player.inventory) {
            Object.keys(player.inventory).forEach(rid => {
                let qty = player.inventory[rid];
                if (qty > 0) {
                    let stolenQty = Math.floor(qty * lossSeverity * randMod);
                    if (stolenQty < 1 && Math.random() < lossSeverity) stolenQty = 1;

                    if (stolenQty > 0) {
                        player.inventory[rid] -= stolenQty;
                        if (player.inventory[rid] <= 0) delete player.inventory[rid];

                        // Logic: Traders keep it, Soldiers/Bandits scatter it to cities
                        if (npc.role === "Commerce" || npc.role === "Civilian") {
                            if (!npc.cargo) npc.cargo = {};
                            npc.cargo[rid] = (npc.cargo[rid] || 0) + stolenQty;
                        } else {
                            // Find nearest city to "scatter" the lost goods to market
                            let nearestCity = npc.originCity;
                            if (!nearestCity && typeof cities !== 'undefined' && cities.length > 0) {
                                let minDist = Infinity;
                                cities.forEach(c => {
                                    let dist = Math.hypot(c.x - npc.x, c.y - npc.y);
                                    if (dist < minDist) { minDist = dist; nearestCity = c; }
                                });
                            }
                            // Add to city market
                            if (nearestCity && nearestCity.market) {
                                if (!nearestCity.market[rid]) {
                                    let base = (typeof RESOURCE_CATALOG !== 'undefined' && RESOURCE_CATALOG[rid]) ? RESOURCE_CATALOG[rid].basePrice : 50;
                                    nearestCity.market[rid] = { stock: 0, idealStock: 10, price: Math.round(base * 0.8) };
                                }
                                nearestCity.market[rid].stock += stolenQty;
                            }
                        }
                    }
                }
            });
        }
        
        // Add a line to the UI so the player knows they were robbed
        let lootLossText = (goldLost > 0 || foodLost > 0) ? 
            `<p style="color: #ff9999; font-size: 10px;">The enemy plundered ${goldLost} Gold and ${foodLost} Food.</p>` : "";

        resultHtml = `
            <div style="padding: 10px; background: rgba(255,0,0,0.1); border: 1px solid #c62828; margin-bottom: 10px;">
                <p><strong>Outcome: Defeat</strong></p>
                <p style="color: #ffcccc;">Your Casualties: -${playerLosses}</p>
                <p style="color: #99ff99;">Enemy Casualties: -${npcLosses}</p>
                ${lootLossText}
            </div>
        `;
        // --- END SURGERY ---
    }

    actionBox.innerHTML = resultHtml;

// Continue Button
// Continue Button
    const continueBtn = createDiplomacyButton("Continue", () => {
        isDiplomacyProcessing = false;
        
        if (playerWon) {
            // Remove NPC from world map
            if (typeof WorldMap !== 'undefined' && typeof WorldMap.removeEntity === 'function') {
                WorldMap.removeEntity(npc);
            } else {
                npc.isDead = true; // Fallback
            }
            leaveParle(player);
        } else {
            // 1. Force a strict number cast to prevent NaN or string bugs
            const remainingTroops = Number(player.troops) || 0;
            
            // Handle player wipe logic (< 3 troops permadeath)
            if (remainingTroops < 3) {
                console.log("CRITICAL DEFEAT: Army reduced to less than 3. Permadeath triggered.");
                
                // 2. FIX: Close the Parley UI FIRST so it doesn't block the black screen!
                leaveParle(player); 

                // 3. FIX: Catch any silent errors (like missing poem arrays) and force the reload
                try {
                    if (typeof window.triggerPermadeath === 'function') {
                        window.triggerPermadeath();
                    } else {
                        throw new Error("triggerPermadeath function missing.");
                    }
                } catch (err) {
                    console.error("Permadeath UI failed, using absolute fallback.", err);
                    alert("Your army has been annihilated. The campaign is lost.");
                    window.location.reload(true); 
                }
                return; // Stop execution here
            }
            
            // If they lost but still have >= 3 troops (somehow survived)
            leaveParle(player); 
        }
    });

    actionBox.appendChild(continueBtn);
}

// ============================================================================
// UI OVERHAUL PATCH: PORTRAITS & BOTTOM STAT GRID
// Paste at the bottom of parler_system.js
// ============================================================================

if (typeof initiateParleWithNPC === 'function') {
    const originalInitiateParle = initiateParleWithNPC;

    initiateParleWithNPC = function(npc, tile) {
        // 1. Run the original setup logic
        originalInitiateParle(npc, tile);

        const panel = document.getElementById('parle-panel');
        const statGrid = document.querySelector('.parle-stat-grid');
        const actionBox = document.getElementById('parle-action-box');
        const dialogue = document.getElementById('parle-dialogue');

        if (!panel || !statGrid || !actionBox || !dialogue) return;

        // ====================================================================
        // LAYOUT SHIFT: Move the Stat Grid below the Action Box (Buttons)
        // ====================================================================
        // appendChild moves an existing node to the end of the parent container
        panel.appendChild(statGrid);

        // Add some margin to the action box so it doesn't touch the stats
        actionBox.style.marginBottom = "15px";
        statGrid.style.borderTop = "1px solid #5d4037"; // Visual separation
        statGrid.style.paddingTop = "10px";

        // ====================================================================
        // INJECT PROCEDURAL PORTRAIT
        // ====================================================================
        let portraitContainer = document.getElementById('parle-portrait-container');
        
        // Create the container if it doesn't exist yet
        if (!portraitContainer) {
            portraitContainer = document.createElement('div');
            portraitContainer.id = "parle-portrait-container";
            
// Styled to match the dark 13th-century aesthetic of the UI
            portraitContainer.style.cssText = `
                float: left; 
                width: 60px; 
                height: 60px; 
                border: 2px solid #5d4037; 
                border-radius: 4px; 
                margin-top: 40px; /* <--- ADD THIS LINE */
                margin-right: 15px; 
                margin-bottom: 10px; 
                background: linear-gradient(to bottom, #2c2518, #1a1508);
                display: flex; 
                justify-content: center; 
                align-items: center; 
                font-size: 38px;
                box-shadow: 2px 2px 5px rgba(0,0,0,0.5);
            `;
            const portraitIcon = document.createElement('span');
            portraitIcon.id = "parle-npc-portrait-icon";
            portraitContainer.appendChild(portraitIcon);
            
            // Insert it right before the dialogue so the text wraps around it
            dialogue.parentNode.insertBefore(portraitContainer, dialogue);
            
            // Ensure the dialogue box has enough height to clear the floating portrait
            dialogue.style.minHeight = "70px";
        }

        // Determine the portrait visual based on the NPC Role
        const iconSpan = document.getElementById('parle-npc-portrait-icon');
        let emoji = "👤"; // Default

        const role = String(npc.role).toLowerCase();
        if (role === "military" || role === "patrol") emoji = "💂";
        else if (role === "bandit") emoji = "🥷";
        else if (role === "civilian") emoji = "🧑‍🌾";
        else if (role === "commerce") emoji = "🐪";
        
        iconSpan.innerText = emoji;

        // Color coordinate the portrait frame to the NPC's Faction Color
        const npcFactionData = (typeof FACTIONS !== 'undefined' && FACTIONS[npc.faction]) ? FACTIONS[npc.faction] : { color: "#777" };
        portraitContainer.style.borderColor = npcFactionData.color;
    };
    
    console.log("Parler System UI Overhaul Hook Loaded.");
}