// ============================================================================
// EMPIRE OF THE 13TH CENTURY - PLAYER OVERLAY & BOUNDS SYSTEM
// ============================================================================

// 1. GLOBAL UI & MOUSE STATES
let worldMouseX = 0;
let worldMouseY = 0;
let isHoveringPlayer = false;
window.isRosterOpen = false; 
let siegeUiCheckTick = 0;

// 2. NPC BOUNDS FIX
function enforceNPCBounds(npc, worldWidth, worldHeight) {
    const margin = 50; 
    if (npc.x < margin) { npc.x = margin; npc.vx *= -1; }
    if (npc.x > worldWidth - margin) { npc.x = worldWidth - margin; npc.vx *= -1; }
    if (npc.y < margin) { npc.y = margin; npc.vy *= -1; }
    if (npc.y > worldHeight - margin) { npc.y = worldHeight - margin; npc.vy *= -1; }
}

// 3. EVENT LISTENERS
window.addEventListener('keydown', (e) => {
    if (typeof inBattleMode !== 'undefined' && (inBattleMode || inCityMode || (typeof inParleMode !== 'undefined' && inParleMode))) return;

    if (e.key.toLowerCase() === 't') {
        window.isRosterOpen = !window.isRosterOpen; 
    }
});

window.addEventListener('mousemove', (e) => {
    //if (typeof canvas === 'undefined' || typeof player === 'undefined' || !player) return;
    
    //const rect = canvas.getBoundingClientRect();
   // const screenX = e.clientX - rect.left;
   // const screenY = e.clientY - rect.top;

   // worldMouseX = (screenX - canvas.width / 2) / zoom + player.x;
  //  worldMouseY = (screenY - canvas.height / 2) / zoom + player.y;

  //  const dist = Math.hypot(worldMouseX - player.x, worldMouseY - player.y);
   // isHoveringPlayer = dist < 25;
});

// 4. DATA CLEANUP (Pruning)
/**
 * Removes empty troop entries from the player's data object
 */
function prunePlayerTroops() {
    if (!player || !player.troopGroups) return;
    for (let key in player.troopGroups) {
        if (player.troopGroups[key].count <= 0) {
            delete player.troopGroups[key];
        }
    }
}

// 5. SIEGE UI PERSISTENCE HEARTBEAT
function maintainSiegeUI() {
    if (typeof inBattleMode !== 'undefined' && inBattleMode) return;
    if (typeof inCityMode !== 'undefined' && inCityMode) return;

    siegeUiCheckTick++;
    if (siegeUiCheckTick % 30 !== 0) return; 

    const siegeGui = document.getElementById('siege-gui');
    if (player.isSieging && siegeGui && (siegeGui.style.display === 'none' || !siegeGui.style.display)) {
        // Look for existing siege record in global activeSieges array
        const mySiege = (typeof activeSieges !== 'undefined') ? 
            activeSieges.find(s => s.attacker.disableAICombat || s.attacker === player) : null;
        
        if (mySiege && typeof showSiegeGUI === 'function') {
            showSiegeGUI(mySiege, mySiege.defender);
        }
    }
}

// 6. MAIN DRAWING FUNCTION
function drawPlayerOverlay(ctx, player, zoom) {
    if (typeof inBattleMode !== 'undefined' && (inBattleMode || inCityMode || (typeof inParleMode !== 'undefined' && inParleMode))) {
        isHoveringPlayer = false;
        window.isRosterOpen = false;
        return;
    }
    
    const htmlUI = document.getElementById('ui');
    
    if (!isHoveringPlayer && !window.isRosterOpen) {
        if (htmlUI) htmlUI.style.display = "block"; 
        return;
    }
    
    if (htmlUI) htmlUI.style.display = "none";

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); 

    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const boxW = W * 0.8; 
    const boxH = H * 0.7; 
    const startX = (W - boxW) / 2; 
    const startY = (H - boxH) / 2; 

    // Process Roster Data
    let armySource = player.roster || [];
    if (armySource.length === 0 && player.troops > 0) {
        armySource = [{ type: "Default Retinue", exp: 1.0, count: player.troops }];
    }

    const troopGroups = {};
    armySource.forEach(u => {
        const l = Math.floor(u.exp || 1);
        const e = ((u.exp % 1) * 100).toFixed(0);
        const key = `${u.type || 'Unit'}|${l}|${e}`;
        if (!troopGroups[key]) {
            troopGroups[key] = { type: u.type || 'Unit', lvl: l, exp: e, count: 0 };
        }
        
        // FIX: If u.count doesn't exist, treat this entry as a single unit (1)
        const amount = (u.count !== undefined) ? u.count : 1;
        troopGroups[key].count += amount;
    });

    // Drawing Background
    ctx.fillStyle = "rgba(10, 8, 5, 0.95)"; 
    ctx.fillRect(startX, startY, boxW, boxH);
    ctx.strokeStyle = "#d4b886";
    ctx.lineWidth = 5;
    ctx.strokeRect(startX + 5, startY + 5, boxW - 10, boxH - 10);

    const paddingX = startX + 40;
    
    // Player Header & Status
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffca28";
    ctx.font = "bold 28px Georgia";
    ctx.fillText("PLAYER DATA", paddingX, startY + 50);

    const pLvl = player.experienceLevel || 1;
    const pExp = player.experience || 0;
    const expNeeded = pLvl * 10; 
    const pExpPercent = Math.min(1, pExp / expNeeded);

    ctx.font = "bold 16px Georgia";
    ctx.fillStyle = "#d4b886";
    ctx.fillText("CHARACTER STATUS", paddingX, startY + 95);

    ctx.font = "14px monospace";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`LEVEL: ${pLvl} [${Math.floor(pExp)} / ${expNeeded} XP]`, paddingX, startY + 120);

    const statsText = `HP: ${Math.floor(player.hp)}/${player.maxHealth} | ATK: ${player.meleeAttack} | DEF: ${player.meleeDefense}`;
    ctx.fillText(statsText, paddingX, startY + 145);
    
    const resourcesText = `GOLD: ${Math.floor(player.gold || 0)} | FOOD: ${Math.floor(player.food || 0)} | FORCE: ${player.troops}`;
    ctx.fillText(resourcesText, paddingX, startY + 170);

    // EXP Bar
    ctx.fillStyle = "#222";
    ctx.fillRect(paddingX, startY + 185, 300, 8); 
    ctx.fillStyle = "#ffca28"; 
    ctx.fillRect(paddingX, startY + 185, 300 * pExpPercent, 8);

    // Army Roster Rendering
    const rosterStartY = startY + 230; 
    ctx.font = "bold 16px Georgia"; 
    ctx.fillStyle = "#d4b886";
    ctx.fillText(`ARMY ROSTER (${player.troops} Men)`, paddingX, rosterStartY);

    let cursorX = paddingX;
    let cursorY = rosterStartY + 30;
    const colGap = 30; 
    const rowGap = 45; 
// REPLACE IT WITH THIS BLOCK:
    // ---> SURGERY: DYNAMIC TROOP GROUPING <---
    // We build this fresh from the freshly-synced true roster so dead units never render.
    let dynamicTroopGroups = {};
    if (player.roster) {
        player.roster.forEach(t => {
            if (t.count > 0) {
                let key = t.type + "_" + t.lvl;
                if (!dynamicTroopGroups[key]) {
                    dynamicTroopGroups[key] = { type: t.type, count: 0, lvl: t.lvl, exp: t.exp };
                }
                dynamicTroopGroups[key].count += t.count;
            }
        });
    }
    const units = Object.values(dynamicTroopGroups);
    units.forEach((unit) => {
        ctx.font = "bold 11px monospace"; 
        const name = unit.type.toUpperCase();
        const stats = `LVL ${unit.lvl} [EXP ${unit.exp}%] x${unit.count}`;
        const entryWidth = Math.max(ctx.measureText(name).width, ctx.measureText(stats).width);

        if (cursorX + entryWidth > startX + boxW - 40) {
            cursorX = paddingX;
            cursorY += rowGap;
        }

        ctx.fillStyle = "#fff";
        ctx.fillText(name, cursorX, cursorY);
        ctx.fillStyle = "#8bc34a"; 
        ctx.font = "9px monospace"; 
        ctx.fillText(stats, cursorX, cursorY + 14); 

        cursorX += entryWidth + colGap;
    });

 
    
    ctx.restore();
}

// 7. INTEGRATION HELPER (Call this in your main loop)
function updateAndDrawPlayerSystems(ctx, player, zoom, worldW, worldH, npcs) {
    // 1. NPC world logic
    if (npcs) npcs.forEach(npc => enforceNPCBounds(npc, worldW, worldH));
    
    // 2. Persistent Siege Check
    maintainSiegeUI();
    
    // 3. Draw Player UI
    drawPlayerOverlay(ctx, player, zoom);
}