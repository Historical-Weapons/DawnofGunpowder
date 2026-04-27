// ============================================================================
// SIEGE SYSTEM - Attrition, Sallying Out & Conquest
// ============================================================================

let activeSieges = [];

let pendingSallyOut = null;

 
function initiateSiege(attacker, city) {
    // ---> GATEKEEPER: Only the Player or Military Armies can lay siege <---
if (!attacker.disableAICombat && attacker.role !== "Military" && attacker.role !== "Patrol") {
        return; //FOR DEBUGGING IM LETTING PATROL SIEGE TOO
    }

    // Prevent duplicate sieges on the same city
    if (activeSieges.some(s => s.defender === city)) return;

    let attackerName = attacker.disableAICombat ? "Your forces" : `${attacker.faction} ${attacker.role}s`;
    console.log(`${attackerName} have laid siege to ${city.name}!`);

    // 1. LOCK STATES & CLEAR TARGETS
    attacker.isSieging = true;
	city.isUnderSiege = true;   
    attacker.battleTarget = null;
    attacker.battlingTimer = 0;
    
    if (!attacker.disableAICombat) {
        attacker.waitTimer = 100; 
        attacker.targetX = city.x;
        attacker.targetY = city.y;
    } else {
        // Force the player to stand ground visually near the city
        attacker.x = city.x;
        attacker.y = city.y + (city.radius || 25) + 20;
        attacker.isMoving = false;
    }

    activeSieges.push({
        id: Math.random().toString(36).substr(2, 9),
        attacker: attacker,
        defender: city,
        ticks: 0,
        // ── NEW: 3-second visual startup delay for NPC vs NPC sieges ──
        // 180 frames @ ~60fps = 3 seconds. Player siege starts immediately.
        delayTimer: attacker.disableAICombat ? 0 : 180,
        isDelaying:  !attacker.disableAICombat
    });
}
// 1. Update Initialization to show the new GUI
function initiatePlayerSiege(city) {
    if (player.troops <= 0) {
        alert("You have no troops to lay siege!");
        return;
    }

    player.disableAICombat = true; 
    initiateSiege(player, city);
    
    // Hide city panel
    document.getElementById('city-panel').style.display = 'none';

    // Show persistent Siege GUI
    const gui = document.getElementById('siege-gui');
    if (gui) {
        gui.style.display = 'block';
        document.getElementById('gui-assault-btn').style.display = 'block';
        document.getElementById('gui-leave-btn').style.display = 'block';
        document.getElementById('gui-sally-btn').style.display = 'none';
        
        const statusText = document.getElementById('siege-status-text');
        statusText.innerText = "STATUS: Encircling the city...";
        statusText.style.color = "#ffca28";
    }
	
    const contBtn = document.getElementById('gui-continue-btn');
    if (contBtn) contBtn.style.display = 'none';
	
    // ---> SURGERY: CREATE DYNAMIC ATTRITION UI <---
    let attritionPanel = document.getElementById('mob-attrition-panel');
    if (!attritionPanel) {
        attritionPanel = document.createElement('div');
        attritionPanel.id = 'mob-attrition-panel';
        Object.assign(attritionPanel.style, {
            position: 'fixed',
            top: '70px',          // Positioned right below the mobile detail button
            right: '12px',
            width: '200px',
            background: 'linear-gradient(to bottom, #1a0d0d, #0d0806)',
            border: '2px solid #ffca28',
            borderRadius: '6px',
            padding: '10px',
            color: '#d4b886',
            fontFamily: 'Georgia, serif',
            fontSize: '12px',
            zIndex: '8999',
            boxShadow: '0 4px 12px rgba(0,0,0,0.7)',
            pointerEvents: 'none' // Clicks pass through to the map
        });
        document.body.appendChild(attritionPanel);
    }
    attritionPanel.style.display = 'block';
}


function resumeSiege() {
    const siege = activeSieges.find(s => s.attacker === player || s.attacker.disableAICombat);
    if (siege) siege.isPaused = false;
    
    document.getElementById('gui-continue-btn').style.display = 'none';
    document.getElementById('gui-assault-btn').style.display = 'block';
    
    const statusText = document.getElementById('siege-status-text');
    if (statusText) {
        statusText.innerText = "STATUS: Encircling the city...";
        statusText.style.color = "#ffca28";
    }
}


// 2. Safely end the siege and hide the GUI
function endSiege(success = false) {
    player.isSieging = false;
    
	    // SURGERY: Reset Buttons
    const sBtn = document.getElementById('siege-button');
    const aBtn = document.getElementById('assault-button');
    if(sBtn) sBtn.style.display = 'block';
    if(aBtn) aBtn.style.display = 'none';
	
    // Remove player siege from active list
    activeSieges = activeSieges.filter(s => !s.attacker.disableAICombat);

    if (success) {
        console.log("City Captured!");
    } else {
        console.log("Siege abandoned safely.");
    }
    
    if(document.getElementById('siege-gui')) document.getElementById('siege-gui').style.display = 'none';
	// SURGERY: Hide Attrition Panel
    if(document.getElementById('mob-attrition-panel')) document.getElementById('mob-attrition-panel').style.display = 'none';
}

function promptSallyOut(siege, defenderMilitary, attackerCount) {
    pendingSallyOut = { siege, defenderMilitary, attackerCount };
    
    const sallyBtn = document.getElementById('gui-sally-btn');
    const leaveBtn = document.getElementById('gui-leave-btn');
    const assaultBtn = document.getElementById('gui-assault-btn');
    const statusText = document.getElementById('siege-status-text');

    if (sallyBtn) {
        sallyBtn.style.display = 'block';
        if (leaveBtn) leaveBtn.style.display = 'none'; // HIDE LEAVE
        if (assaultBtn) assaultBtn.style.display = 'none'; // HIDE ASSAULT
        
        statusText.innerText = "CRITICAL: The garrison is sallying out!";
        statusText.style.color = "#ff5252";
        
        if (typeof AudioManager !== 'undefined') AudioManager.playSound('battle_shout');
    }
}
	
	
function updateSieges() {
    for (let i = activeSieges.length - 1; i >= 0; i--) {
        let siege = activeSieges[i];
        let atk = siege.attacker;
        let def = siege.defender;

      let attackerCount = atk.disableAICombat ? player.troops : atk.count;
        let attackerDead = atk.disableAICombat ? (player.troops <= 0) : atk.count <= 0;
        
        // SURGERY: Stop random peasant bumps from instantly deleting NPC sieges!
        // NPCs will now maintain the siege while fighting off relief forces/patrols.
        let isInBattle = atk.disableAICombat ? (typeof inBattleMode !== 'undefined' && inBattleMode) : false;

        // Locate this in updateSieges()
        if (attackerDead || isInBattle) {
            console.log(`The siege of ${def.name} has been broken!`);
    // MOVE THIS HERE (Outside the death check)
    if (atk.disableAICombat) {
        const sBtn = document.getElementById('siege-button');
        const aBtn = document.getElementById('assault-button');
        if(sBtn) sBtn.style.display = 'block';
        if(aBtn) aBtn.style.display = 'none';
    }

    if (atk.disableAICombat && player.troops <= 0) {
        // ... status text and alert logic ...
        const gui = document.getElementById('siege-gui');
        if(gui) gui.style.display = 'none';
    }

    atk.isSieging = false;
    def.isUnderSiege = false;
    activeSieges.splice(i, 1);
    continue;
	}

// 2. ADD THIS LINE RIGHT HERE: Block attrition if paused
        if (siege.isPaused) continue;

        // ── NEW: 3-SECOND STARTUP DELAY (NPC vs NPC sieges only) ─────────────
        // During this window the attacker is visually locked in place so the
        // player can actually see the 🪜 emoji before anything happens.
        if (siege.delayTimer > 0) {
            siege.delayTimer--;
            // Keep NPC locked and facing the city while the delay ticks down
            atk.waitTimer = 60;
            atk.isSieging = true;          // Ensure the siege icon stays on
            def.isUnderSiege = true;
            if (siege.delayTimer === 0) {
                siege.isDelaying = false;   // Flip to active state
                console.log(`Siege of ${def.name} is now in full effect!`);
            }
            continue; // Skip all attrition logic this tick
        }
        // ─────────────────────────────────────────────────────────────────────
		
        // ---> SURGERY: LIVE ATTRITION UI UPDATER <---
        if (atk.disableAICombat) {
            const ui = document.getElementById('mob-attrition-panel');
            if (ui && ui.style.display !== 'none') {
                ui.innerHTML = `
                    <div style="text-align:center; font-weight:bold; border-bottom:1px solid #3e2723; padding-bottom:4px; margin-bottom:6px;">ATTRITION PHASE</div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:#fff;">🛡️ Defender</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; padding-left:10px;">
                        <span>Food: <span style="color:#8bc34a">${Math.floor(def.food)}</span></span>
                        <span>Gold: <span style="color:#ffca28">${Math.floor(def.gold)}</span></span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-top:8px;">
                        <span style="color:#fff;">⚔️ Attacker</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; padding-left:10px;">
                        <span>Food: <span style="color:#8bc34a">${Math.floor(player.food)}</span></span>
                        <span>Gold: <span style="color:#ffca28">${Math.floor(player.gold)}</span></span>
                    </div>
                `;
            }
        }
        
        siege.ticks++;

        // Continually enforce the movement lock
        if (!atk.disableAICombat) atk.waitTimer = 50; 
        else atk.isMoving = false; 
		
		
		
// --- NEW SALLY OUT LOGIC ---
        let defenderMilitary = def.militaryPop || def.troops || 0;

// Condition: Defenders MUST outnumber attacker to trigger this event
        if (defenderMilitary > attackerCount && Math.random() < 0.001) {         //for DEBUGGING I HAVE IT AS LOWER BUT ORIGINAL IS 0.005
            console.log(`${def.name} garrison sallies out to break the siege!`);

			if (atk.disableAICombat) {
                const statusText = document.getElementById('siege-status-text');
                if(statusText) {
                    statusText.innerText = "STATUS: DEFENDERS ATTACKING!";
                    statusText.style.color = "#ff5252";
                }
                
			promptSallyOut(siege, defenderMilitary, attackerCount);
                // Return here prevents ticks from continuing while frozen
                continue; // SURGERY: Changed return to continue
			}
            // NPC vs NPC Logic
            let atkLoss = Math.floor(defenderMilitary * 0.4);
            let defLoss = Math.floor(attackerCount * 0.4);
            atk.count = Math.max(0, (atk.count || 0) - atkLoss);
            def.militaryPop = Math.max(0, defenderMilitary - defLoss);
            def.isUnderSiege = false;
            atk.isSieging = false;
            activeSieges.splice(i, 1);
            continue;
        }
		
		
		
        // 3. WAR OF ATTRITION
        if (siege.ticks % 60 === 0) {
            
            let defConsumption = Math.max(
                1,
                Math.floor((def.pop * 0.01) + (def.militaryPop * 0.03))
            );
            def.food -= defConsumption;
            
            // weaker attacker drain
            let atkConsumption = Math.max(1, Math.floor(attackerCount * 0.03)); 
            if (atk.disableAICombat) player.food -= atkConsumption;
            else atk.food -= atkConsumption;

            let currentAtkFood = atk.disableAICombat ? player.food : atk.food;

// Resolve Attacker Starvation
            if (currentAtkFood <= 0) {
                if (atk.disableAICombat) player.food = 0; else atk.food = 0;
                
                let attrition = Math.max(1, Math.ceil(attackerCount * 0.05));
                if (atk.disableAICombat) {
                    player.troops -= attrition;
                    if(player.roster && player.roster.length > 0) player.roster.pop();
                    
                    // Update GUI Status Text to reflect starvation deaths
                    const statusText = document.getElementById('siege-status-text');
                    if (statusText) {
                        statusText.innerText = `STATUS: STARVING! (-${attrition} troops. ${player.troops} left)`;
                        statusText.style.color = "#ff5252";
                    }
                } else {
                    atk.count -= attrition;
                }
            }

// 3. REBALANCED WAR OF ATTRITION (Targets ~3 minute total siege)
            // Resolve Defender Starvation
            if (def.food <= 0) {
                def.food = 0;

                // BALANCE: Lose 2% of garrison per second (assuming 1 tick per sec here)
                // This ensures even a large garrison of 500 melts away in ~100 seconds after food is gone.
                let garrisonDamage = Math.max(2, Math.floor(def.militaryPop * 0.02));
                def.militaryPop -= garrisonDamage;
                def.pop -= Math.floor(garrisonDamage * 0.5); // Population stays slightly more resilient

                // --- UI SURGERY: UPDATE STATUS TEXT ---
                if (atk.disableAICombat) {
                    const statusText = document.getElementById('siege-status-text');
                    if (statusText) {
                        statusText.innerText = "STATUS: DEFENDERS STARVING";
                        statusText.style.color = "#ffa500"; // Orange for starvation
                    }
                }

                // Conquest Triggered
                if (def.militaryPop <= 0) {
                    let conqueringFaction = atk.disableAICombat ? player.faction : atk.faction;
                    let conqueringColor = atk.disableAICombat ? "#FFFFFF" : atk.color;
                    
                    console.log(`${def.name} has fallen to ${conqueringFaction}!`);
                    
                    // Update City Ownership
                    def.faction = conqueringFaction;
                    def.color = conqueringColor;
                    
                    // Occupying Force: Take 30% of the attacking army to become the new garrison
                    let occupyingForce = Math.max(5, Math.floor(attackerCount * 0.3));
                    def.militaryPop = occupyingForce;
                    def.troops = occupyingForce;
                    def.pop += occupyingForce;
                    
                    if (atk.disableAICombat) {
                        player.troops -= occupyingForce;
                        
                        // --- UI SURGERY: FINAL VICTORY STATUS ---
                        const statusText = document.getElementById('siege-status-text');
                        if (statusText) statusText.innerText = "STATUS: CITY CAPTURED!";
                        
                        alert(`Victory! ${def.name} has starved into submission. It is now yours.\n\nYou left ${occupyingForce} troops behind as a garrison.`);
                        
                        // Close Siege GUI
                        atk.isSieging = false;
                        document.getElementById('siege-gui').style.display = 'none';
                    } else {
                        atk.count -= occupyingForce;
                        atk.isSieging = false;
                        atk.targetCity = null; 
                    }

                    def.isUnderSiege = false;
                    activeSieges.splice(i, 1);
                }
            }
        }
    }
}

// ============================================================================
// drawSiegeVisuals — Bannerlord-style animated siege emoji layer
// ============================================================================
// Changes vs original:
//  • 3-second "preparing" visual state (isDelaying) with ladders assembling
//    near the attacker before they begin flying toward the walls.
//  • After delay: 🪜 ladders arc from attacker to city walls, 🏹 arrows fly
//    back from the garrison, a 💥 flash pulses at the clash point.
//  • All animations are time-based (Date.now()) — no per-frame randomness
//    that would cause jitter.
//  • Mobile-friendly: no globalAlpha loops or overdraw; a flat maximum of
//    ~8 emoji draw calls per active siege.
// ============================================================================
function drawSiegeVisuals(ctx) {
    const T = Date.now(); // single timestamp — consistent within this draw call

    activeSieges.forEach(s => {
        let def  = s.defender;
        let atk  = s.attacker;

        let attackerCount = atk.disableAICombat ? player.troops   : atk.count;
        let defenderCount = def.militaryPop || def.troops || 0;
        let attackerFood  = atk.disableAICombat ? player.food     : atk.food;
        let defenderFood  = def.food;

        // Attacker world position
        let atkX = atk.disableAICombat ? player.x : atk.x;
        let atkY = atk.disableAICombat ? player.y : atk.y;

        let cityR = def.radius || 20;

        // ── Pre-compute direction and distance once ──────────────────────────
        let dxAD  = def.x - atkX;
        let dyAD  = def.y - atkY;
        let distAD = Math.hypot(dxAD, dyAD) || 1;

        ctx.save();
        ctx.textAlign   = "center";
        ctx.textBaseline = "middle";

        // ── 1. ANIMATED SIEGE RING ───────────────────────────────────────────
        ctx.beginPath();
        ctx.arc(def.x, def.y, cityR + 18, 0, Math.PI * 2);
        ctx.strokeStyle = s.isDelaying
            ? "rgba(255, 200, 40, 0.65)"
            : "rgba(220, 50,  47, 0.85)";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = -(T / 50) % 14;
        ctx.stroke();
        ctx.setLineDash([]);

        // ── 2. STATUS TEXT & TROOP STATS ────────────────────────────────────
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur  = 5;

        let statusLabel = s.isDelaying ? "⚔️ BESIEGING..." : "🔥 UNDER SIEGE";
        ctx.fillStyle   = s.isDelaying ? "#ffca28" : "#ff5252";
        ctx.font        = "bold 13px Georgia, serif";
        ctx.fillText(statusLabel, def.x, def.y - cityR - 42);

        ctx.fillStyle = "#ffffff";
        ctx.font      = "12px Arial, 'Segoe UI Emoji', sans-serif";
        ctx.fillText(`⛺ ${attackerCount} (🍖 ${Math.floor(attackerFood)})`, def.x, def.y - cityR - 26);
        ctx.fillText(`🏰 ${defenderCount} (🍖 ${Math.floor(defenderFood)})`, def.x, def.y - cityR - 10);

        ctx.shadowBlur = 0;

        // ── 3. BANNERLORD-STYLE EMOJI ANIMATIONS ────────────────────────────

        if (s.isDelaying) {
            // ─ PHASE 1: PREPARATION (delayTimer counts 180 → 0) ─────────────
            // Ladders gather near the attacker and slowly shuffle forward.
            // delayTimer is undefined-safe: if not set we skip.
            if (typeof s.delayTimer !== 'undefined') {
                let progress = 1 - (s.delayTimer / 180); // 0 → 1

                ctx.font = "18px Arial, 'Segoe UI Emoji', sans-serif";

                // Three ladders jostling around the attacker position
                let laderData = [
                    { ox: -12, oy:  0, wobbleF: 0.9,  wobbleA: 7  },
                    { ox:   0, oy: -8, wobbleF: 1.1,  wobbleA: 5  },
                    { ox:  12, oy:  4, wobbleF: 0.75, wobbleA: 8  }
                ];

                laderData.forEach((l, k) => {
                    // Advance a fraction of the way to the wall as prep proceeds
                    let advX = atkX + l.ox + dxAD * progress * 0.25 + Math.sin(T * l.wobbleF / 600 + k) * l.wobbleA;
                    let advY = atkY + l.oy + dyAD * progress * 0.25 + Math.cos(T * l.wobbleF / 600 + k) * (l.wobbleA * 0.6);
                    ctx.globalAlpha = 0.55 + 0.35 * Math.sin(T / 450 + k * 1.3);
                    ctx.fillText("🪜", advX, advY);
                });
                ctx.globalAlpha = 1.0;
            }

        } else {
            // ─ PHASE 2: ACTIVE SIEGE ─────────────────────────────────────────

            // ── 3a. LADDERS flying from attacker → city walls ──
            // Four ladders, each offset in phase so they stagger nicely.
            const NUM_LADDERS = 4;
            ctx.font = "17px Arial, 'Segoe UI Emoji', sans-serif";

            for (let k = 0; k < NUM_LADDERS; k++) {
                // phase: 0 = at attacker, 1 = at wall
                let phase = ((T / 2200) + k / NUM_LADDERS) % 1;

                // Lateral spread: ladders fan out slightly so they don't stack
                let spread = (k - (NUM_LADDERS - 1) / 2) * 10;
                let perpX  = -dyAD / distAD * spread;
                let perpY  =  dxAD / distAD * spread;

                let lx = atkX + dxAD * phase + perpX;
                let ly = atkY + dyAD * phase + perpY - Math.sin(phase * Math.PI) * 30; // arc up

                // Fade out as the ladder hits the wall
                ctx.globalAlpha = (phase > 0.82) ? Math.max(0, (1 - phase) / 0.18) : 1.0;
                ctx.fillText("🪜", lx, ly);
            }
            ctx.globalAlpha = 1.0;

            // ── 3b. ARROWS flying back from garrison → attacker ──
            const NUM_ARROWS = 3;
            ctx.font = "13px Arial, 'Segoe UI Emoji', sans-serif";

            for (let k = 0; k < NUM_ARROWS; k++) {
                let phase = ((T / 1700) + k / NUM_ARROWS) % 1;

                let spread = (k - 1) * 14;
                let perpX  = -dyAD / distAD * spread;
                let perpY  =  dxAD / distAD * spread;

                // From city toward attacker
                let ax = def.x + (-dxAD) * phase + perpX;
                let ay = def.y + (-dyAD) * phase + perpY - Math.sin(phase * Math.PI) * 18;

                ctx.globalAlpha = (phase > 0.80) ? Math.max(0, (1 - phase) / 0.20) : 1.0;
                ctx.fillText("🏹", ax, ay);
            }
            ctx.globalAlpha = 1.0;

            // ── 3c. CLASH FLASH at mid-point between the two forces ──
            // Pulses every ~700 ms with a 💥, drifting slightly for variety.
            let mx = (atkX + def.x) * 0.5;
            let my = (atkY + def.y) * 0.5;

            let flashCycle = Math.floor(T / 700) % 3; // 0, 1, 2 — only flash on 0
            if (flashCycle === 0) {
                // Drift using sin/cos so there's no per-frame randomness jitter
                let driftX = Math.sin(T / 310) * 9;
                let driftY = Math.cos(T / 270) * 6;
                ctx.font        = "20px Arial, 'Segoe UI Emoji', sans-serif";
                ctx.globalAlpha = 0.82;
                ctx.fillText("💥", mx + driftX, my + driftY - 6);
                ctx.globalAlpha = 1.0;
            }

            // ── 3d. Subtle ⚔️ pulse in the center (always visible) ──
            let pulseFactor = 1 + 0.22 * Math.sin(T / 200);
            let pulseSize   = Math.round(14 * pulseFactor);
            ctx.font        = `${pulseSize}px Arial, 'Segoe UI Emoji', sans-serif`;
            ctx.globalAlpha = 0.70;
            ctx.fillText("⚔️", mx, my - 18);
            ctx.globalAlpha = 1.0;
        }

        ctx.restore();
    });
}

function resolveSallyOut(choice) {
    if (!pendingSallyOut) return;
    const siege = pendingSallyOut.siege;
    const def = siege.defender;

    // 1. IMMEDIATELY HIDE AND DISABLE GUI TO PREVENT DOUBLE-CLICKING
    const siegeGui = document.getElementById('siege-gui');
    const leaveBtn = document.getElementById('gui-leave-btn');
    const sallyBtn = document.getElementById('gui-sally-btn');
    const assaultBtn = document.getElementById('gui-assault-btn');

    if (choice === 'attack') {
		if (sallyBtn) sallyBtn.style.display = 'none';
        // HIDE EVERYTHING so it doesn't show up during the battle
        siegeGui.style.display = "none";
        
        // Prepare the transition
        console.log(`Sally out triggered! Defenders of ${def.name} are attacking!`);
        
        if (typeof enterBattlefield === "function" && typeof generateNPCRoster === "function") {
            const garrisonForce = {
                faction: def.faction,
                role: "Garrison (Sally Out)",
                count: def.militaryPop || 50,
                roster: generateNPCRoster("Military", def.militaryPop || 50, def.faction),
                isSallyOut: true 
            };
            
            // Trigger battle
            // FIXED: Swapped arguments to (Enemy, Player) and added terrain object to fix the .name error
            enterBattlefield(garrisonForce, player, { name: "Plains", speed: 1.0 });
            
            // We do NOT delete the siege yet because the player might survive and continue it
        }
    }
    
    pendingSallyOut = null;
}


function triggerSiegeAssault() {
    const currentSiege = activeSieges.find(s => s.attacker.disableAICombat);
    if (!currentSiege) {
        alert("You are not currently besieging a settlement!");
        return;
    }

    // SURGERY: Reset Buttons for the world map UI
    const sBtn = document.getElementById('siege-button');
    const aBtn = document.getElementById('assault-button');
    if(sBtn) sBtn.style.display = 'block';
    if(aBtn) aBtn.style.display = 'none';

// --- SURGERY: CLOSE PARLE PANEL IMMEDIATELY ---
    if (typeof closeParleUI === 'function') {
        closeParleUI();
    } else {
        const panel = document.getElementById('parle-panel');
        if (panel) panel.style.display = 'none';
        inParleMode = false;
    }
	
    const city = currentSiege.defender;
 
    const defenderCount = city.militaryPop || city.troops || 0;

    // 2. Clear Siege States before entering battle
    player.isSieging = false;
    city.isUnderSiege = false;
    activeSieges = activeSieges.filter(s => s.id !== currentSiege.id);
    
    // Hide the GUI
    const gui = document.getElementById('siege-gui');
    if (gui) gui.style.display = 'none';

  
    console.log(`Assaulting ${city.name}! Transitioning to battlefield_system.js...`);
    
    if (typeof enterBattlefield === "function" && typeof generateNPCRoster === "function") {
        // Create a temporary NPC object out of the city garrison to feed into the battle engine
        const garrisonForce = {
            faction: city.faction,
            role: "Garrison",
            count: defenderCount,
            roster: generateNPCRoster("Military", defenderCount, city.faction),
            isCityGarrison: true // Custom flag you can use later in battlefield_system.js to spawn walls
        };
        
			// REPLACE WITH THIS:
					if (typeof enterSiegeBattlefield === "function") {
						enterSiegeBattlefield(garrisonForce, player, city);
					} else {
						// Fallback if siegebattle.js isn't loaded
						//enterBattlefield(garrisonForce, player, { name: "City Walls", speed: 0.8 });
					}
				}

	else {
        alert("Battlefield system not loaded! The assault failed.");
    }
	
	// SURGERY: Hide Attrition Panel
    if(document.getElementById('mob-attrition-panel')) document.getElementById('mob-attrition-panel').style.display = 'none';
}

function restoreSiegeAfterBattle(didPlayerWin) {
    // ---> SURGERY: GUARANTEE ROSTER SYNC UPON EXITING SIEGE SCREEN <---
    // This catches edge-case siege victories that bypass the standard leave battle logic.
    if (typeof window.hardSyncPlayerRoster === 'function') {
        window.hardSyncPlayerRoster();
    }
 
    const siege = activeSieges.find(s => s.attacker === player || s.attacker.disableAICombat);
    if (!siege) return;

    siege.isPaused = true; 
    // ... [rest of your existing UI visibility code]

    // Now that the map is visible in the background, show the UI
    const siegeGui = document.getElementById('siege-gui');
    const statusText = document.getElementById('siege-status-text');
    const leaveBtn = document.getElementById('gui-leave-btn');
    const sallyBtn = document.getElementById('gui-sally-btn');
    const assaultBtn = document.getElementById('gui-assault-btn');
    const continueBtn = document.getElementById('gui-continue-btn');

    if (siegeGui) siegeGui.style.display = 'block';
    if (leaveBtn) leaveBtn.style.display = 'block'; 
    if (sallyBtn) sallyBtn.style.display = 'none'; 
    if (assaultBtn) assaultBtn.style.display = 'none'; 
    if (continueBtn) continueBtn.style.display = 'block';

    if (didPlayerWin) {
        statusText.innerText = "VICTORY: The sally was repelled.";
        statusText.style.color = "#8bc34a";
    } else {
        statusText.innerText = "DEFEAT...";
        statusText.style.color = "#ffca28";
    }
}
