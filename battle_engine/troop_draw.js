
    let lastSortTime = 0;
	
const IS_NATIVE_DRAW = (
    typeof window.Capacitor !== 'undefined' ||
    /\bwv\b/.test(navigator.userAgent)
);
const SORT_INTERVAL = IS_NATIVE_DRAW ? 200 : 100;

	let sortedUnitsCache = []; // Store the sorted copy here
 
function drawBattleUnits(ctx) {
	

        const centerX = BATTLE_WORLD_WIDTH / 2 - 150; 
        const pColor = (currentBattleData && currentBattleData.playerColor) ? currentBattleData.playerColor : "#2196f3";
        const eColor = (currentBattleData && currentBattleData.enemyColor) ? currentBattleData.enemyColor : "#f44336";

// Modified to show supply lines in both standard land battles AND River battles
    const isRiverBattle = typeof worldTerrainType !== 'undefined' && worldTerrainType.includes("River");

    if (!window.inNavalBattle || isRiverBattle) {
        // Calculate offsets to ensure lines stay on the solid ground banks 
        // even if the river meanders heavily near the top/bottom edges
        const topSupplyY = 0;
        const bottomSupplyY = BATTLE_WORLD_HEIGHT ;

        // Pass a dummy camera {x:0, y:0} because the canvas is already translated
        // Enemy Supply Line (Top)
        drawSupplyLines(ctx, centerX, topSupplyY, eColor, {x: 0, y: 0});
        
        // Player Supply Line (Bottom)
        drawSupplyLines(ctx, centerX, bottomSupplyY, pColor, {x: 0, y: 0});
    }

	
// --- CLEAN FIX: Only sort the cache, leave the original array alone ---
    if (performance.now() - lastSortTime > SORT_INTERVAL) {
        sortedUnitsCache = [...battleEnvironment.units].sort((a, b) => a.y - b.y);
        lastSortTime = performance.now();
    }

    let time = Date.now() / 50;




 // ---> RENDER GROUND EFFECTS <---
    if (battleEnvironment.groundEffects) {
        battleEnvironment.groundEffects.forEach(ge => {
            if (typeof camera !== 'undefined' && camera && typeof isOnScreen === 'function') {
                if (!isOnScreen(ge, camera)) return;
            }
            ctx.save();
            ctx.translate(ge.x, ge.y);
            ctx.rotate(ge.angle);
			
const geSeed = (ge.x * 12.9898) + (ge.y * 78.233);
        
        if (ge.stuckOnStructure) {
            ctx.globalAlpha = (ge.structureTile === 6 || ge.structureTile === 7) ? 0.78 : 0.92;
        }
        
        drawStuckProjectileOrEffect(ctx, ge.type, geSeed);
        
        ctx.globalAlpha = 1.0;
            ctx.restore();
        });
    }

    sortedUnitsCache.forEach(unit => {
		
		// --- FIREWALL: Skip corrupt data ---
    if (isNaN(unit.x) || isNaN(unit.y)) return; 
    // ---> INSERT CULLING HERE <---
        // Skip rendering if the unit is outside the viewable area
// ---> INSERT CULLING HERE <---
        // Skip rendering if the unit is outside the viewable area
        if (typeof camera !== 'undefined' && camera && typeof isOnScreen === 'function') {
            if (!isOnScreen(unit, camera)) return;
        }
        let isMoving = unit.state === "moving";
        let frame = time + unit.animOffset;
        let isAttacking = unit.state === "attacking" && unit.cooldown > (unit.stats.isRanged ? 30 : 40);

// ---> SURGERY: Draw Selection Ring <---
// 1. Identify roles - BRIDGED LOGIC
// Recognizes the global campaign player OR a recruited Custom Battle General
const isCampaignPlayer = (typeof player !== 'undefined' && unit === player);
const isPlayerGeneral = (unit.isCommander && unit.side === 'player') || isCampaignPlayer;
const isEnemyGeneral = unit.isCommander && unit.side !== 'player';
const isGeneral = isPlayerGeneral || isEnemyGeneral;

// 2. ENFORCEMENT: Force-deselect any enemy (including their general) 
if (unit.side !== 'player') {
    unit.selected = false;
}

// 3. Logic: Draw if unit is selected OR if it is a General
if ((unit.selected || isGeneral) && unit.hp > 0) {
    ctx.save();
    ctx.translate(unit.x, unit.y);
    
// Draw Commander Ring First (Base Layer)
if (isEnemyGeneral) {
    ctx.strokeStyle = "rgba(220, 60, 60, 0.98)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 5, 16, 8, 0, 0, Math.PI * 2); // 30% larger
    ctx.stroke();
} else if (isPlayerGeneral) {
    // Player General gets the white ring
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 5, 16, 8, 0, 0, Math.PI * 2); // 30% larger
    ctx.stroke();
}

    // Draw Selection Ring on Top (If Selected)
    if (unit.selected) {
        // Bright "Active" Yellow
        ctx.strokeStyle = "rgba(255, 235, 59, 0.9)";
        // Make it slightly larger or thinner so it doesn't completely hide the white ring
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        // Slightly expanded radius to frame the white ring
        ctx.ellipse(0, 5, 14, 7, 0, 0, Math.PI * 2); 
        ctx.stroke();
    }
    
    ctx.restore();
}
// ---> END SURGERY <---

        let visType = "peasant";
        
// --- UPDATED VISUAL TYPE LOGIC ---
// SURGERY: Check for isCommander instead of disableAICombat
if ((typeof player !== 'undefined' && unit === player) || unit.isCommander) {
    visType = "horse_archer"; 
} else if (unit.stats.role === ROLES.CAVALRY || unit.stats.role === ROLES.MOUNTED_GUNNER) {
    // If it's a mounted gunner or the name contains "Camel", use the camel renderer
    if (unit.unitType === "War Elephant") {
        visType = "elephant";
    } else if (unit.unitType === "Camel Cannon" || unit.unitType.toLowerCase().includes("camel")) {
        visType = "camel";
    } else {
        visType = "cavalry";
    }
} else if (unit.stats.role === ROLES.HORSE_ARCHER) {
 
            visType = "horse_archer";
        } else if (unit.stats.role === ROLES.PIKE || unit.unitType.includes("Glaive")) {
            visType = "spearman";
        } else if (unit.stats.role === ROLES.SHIELD || unit.unitType === "Glaiveman") {
            visType = "sword_shield";
        } else if (unit.stats.role === ROLES.TWO_HANDED) {
            visType = "two_handed";
        } else if (unit.stats.role === ROLES.CROSSBOW) {
            visType = "crossbow";
        } 
		else if (unit.stats.role === ROLES.FIRELANCE) {
    // Dedicated line for Firelances
		visType = "firelance";}
		
		else if (unit.stats.role === ROLES.ARCHER) {
            visType = "archer";
        } else if (unit.stats.role === ROLES.THROWING) {
            visType = "throwing"; 
        } else if (unit.stats.role === ROLES.GUNNER || unit.stats.role === ROLES.FIRELANCE) {
            visType = "gun";
        } else if (unit.stats.role === ROLES.BOMB) {
            visType = "bomb";
			} else if (unit.stats.role === ROLES.ROCKET) {
    visType = "rocket";
        } else if (unit.unitType === "Militia") {
            visType = "peasant";
        }
		
if (unit.stats.isRanged && unit.stats.ammo <= 0) {
    if (visType === "horse_archer") {
        visType = "cavalry"; 
    } else if (visType === "camel") {
        // KEEP it as a camel! We handle its melee mode inside drawCavalryUnit.
        visType = "camel"; 
    } else {
        visType = "shortsword"; 
    }
}

// ---> NEW: Determine if they are retreating <---
        // ONLY raise the white flag if they are broken AND have crossed the red tactical boundary
        let isFleeing = unit.stats.morale <= 0 && 
                        (unit.x < 0 || unit.x > BATTLE_WORLD_WIDTH || 
                         unit.y < 0 || unit.y > BATTLE_WORLD_HEIGHT);		 
// ---> INSERT ANIMATION SYNC HERE <---
// This calculates the specific frame progress for reload/release cycles
let reloadProgress = 0;
if (unit.state === "attacking" && unit.stats.isRanged) {
    // Standardizing the cycle to a 0.0 - 1.0 range for the renderers
    reloadProgress = (unit.cooldown / (unit.stats.fireRate || 100));
}
// ---> SURGERY: DEAD UNIT RENDERING <---
let isDead = unit.hp <= 0;
if (isDead) {
    drawBloodPool(ctx, unit);
    ctx.save();
    ctx.translate(unit.x, unit.y);
    ctx.rotate(unit.deathRotation || Math.PI / 2);
    ctx.translate(-unit.x, -unit.y);
}


// =============================================================
// DIRECTIONAL FACING — position-delta based (works regardless of
// whether unit.vx/vy exist — uses actual x movement between frames)
//
// dx > 0  → face RIGHT  (facingDir =  1, natural sprite)
// dx < 0  → face LEFT   (facingDir = -1, ctx.scale(-1,1) flips it)
// dx = 0  → hold last facing — stationary units never snap back
// dy used only for future UP/DOWN sprite phases (placeholders below)
// =============================================================
{
    // Compute how far this unit actually moved in X and Y since last frame.
    // _prevX/_prevY are stamped onto the unit object at the bottom of this block.
    const _dx = (unit._prevX !== undefined) ? (unit.x - unit._prevX) : 0;
    const _dy = (unit._prevY !== undefined) ? (unit.y - unit._prevY) : 0;

    // Threshold filters out sub-pixel jitter while units are standing still
    // or only nudging during collision resolution.
    const MOVE_THRESH = 0.4;

    if (_dx > MOVE_THRESH) {
        // ── MOVING RIGHT ──────────────────────────────────────────
        unit.facingDir = 1; // natural sprite orientation

    } else if (_dx < -MOVE_THRESH) {
        // ── MOVING LEFT ───────────────────────────────────────────
        unit.facingDir = -1; // ctx.scale(-1,1) mirrors the full sprite

    } else if (_dy < -MOVE_THRESH) {
        // ── MOVING UP ─────────────────────────────────────────────
        // Horizontal facing is intentionally unchanged here.
        // Units keep their last left/right orientation when moving vertically.
        // // UP placeholder: future phase — insert back-view sprite swap here
        // // UP placeholder: e.g. visType = "up_facing"; (new sprite set)

    } else if (_dy > MOVE_THRESH) {
        // ── MOVING DOWN ───────────────────────────────────────────
        // Horizontal facing is intentionally unchanged here.
        // // DOWN placeholder: future phase — insert front-view sprite swap here
        // // DOWN placeholder: e.g. visType = "down_facing"; (new sprite set)

    }
    // _dx === 0 (truly stationary): don't touch facingDir at all.
    // The unit holds whatever direction it was last moving — no snap-back.

    // First-ever frame safety net (unit just spawned, _prevX not yet written):
    // Default to RIGHT so all units begin facing the same neutral direction.
    if (unit.facingDir === undefined) {
        unit.facingDir = 1;
    }

    // Stamp current position so next frame can compute the delta.
    unit._prevX = unit.x;
    unit._prevY = unit.y;
}
// =============================================================

// 1. Dispatch to the correct renderer
if (["cavalry", "elephant", "camel", "horse_archer"].includes(visType)) {
    // ── CAVALRY ORIENTATION FIX ──────────────────────────────────
    // The cavalry sprite's natural direction (dir=1 throughout cavscript)
    // is LEFT-facing — opposite of infantry. We negate facingDir here so
    // that ctx.scale inside cavscript produces the correct visual result.
    // Infantry is RIGHT-facing naturally, so infantry needs no change.
    //
    // // UP placeholder   : future — negate will still apply; up/down sprite swap goes in cavscript
    // // DOWN placeholder : future — same as above
    unit.facingDir = -(unit.facingDir || 1);
    drawCavalryUnit(
        ctx, unit.x, unit.y, isMoving, frame, unit.color, 
        isAttacking, visType, unit.side, unit.unitType, 
        isFleeing, unit.cooldown, unit.ammo, unit, reloadProgress
    );
    // Restore facingDir to its logical value so other systems read it correctly
    unit.facingDir = -(unit.facingDir);
} else {
    // Infantry is naturally RIGHT-facing — facingDir passes through unchanged
    // // UP placeholder   : future — visType swap to back-view sprite here
    // // DOWN placeholder : future — visType swap to front-view sprite here
    drawInfantryUnit(
        ctx, unit.x, unit.y, isMoving, frame, unit.color, 
        visType, isAttacking, unit.side, unit.unitType, 
        isFleeing, unit.cooldown, unit.ammo, unit, reloadProgress
    );
}


// ── DROWNING EFFECTS (splash particles + blood pools) ──
if (inNavalBattle && unit.overboardTimer > 0) {
    drawDrowningEffects(ctx);
}

// ---> DRAW STUCK PROJECTILES <---
if (unit.stuckProjectiles && unit.stuckProjectiles.length > 0) {
    ctx.save();
    ctx.translate(unit.x, unit.y);

    unit.stuckProjectiles.forEach(sp => {
        ctx.save();
        ctx.translate(sp.offsetX, sp.offsetY);
        ctx.rotate(sp.angle);
        drawStuckProjectileOrEffect(ctx, sp.type);
        ctx.restore();
    });
    ctx.restore();
}
// ---> END STUCK PROJECTILES <---


if (isDead) {
    ctx.restore();
    return; // EXIT EARLY: Skip drawing health bars, exp bars, and names on corpses
	}
	
	 


// 2. SURGICAL NAME OVERRIDE: Show "PLAYER" if it's the commander
//ctx.fillStyle = "#ffffff";
//ctx.font = unit.isCommander ? "bold 6px Georgia" : "4px Georgia"; // Bolder for player
//ctx.textAlign = "center";
//let displayName = unit.isCommander ? "PLAYER" : unit.unitType;
//ctx.fillText(displayName, unit.x, unit.y - 21);

// 3. HEALTH BAR CONFIG
//const barWidth = 24;
//const barHeight = 4;
//const barY = unit.y - 30; 

// --- SURGICAL DEBUG UI OVERRIDE --- 
// Changed from 'unit.isCommander' so ALL player troops show stats
//if (unit.side === "player") {
   // ctx.save();
    
    // 1. Configure Debug Font (Slightly smaller for troops so it doesn't clutter)
 //  ctx.textAlign = "center";
 // ctx.font = unit.isCommander ? "bold 8px monospace" : "6px monospace"; 
    
    // Change color based on Level (Gold for Level 3+, White for recruits)
 //   let lvl = unit.stats.experienceLevel || 1;
 //  ctx.fillStyle = lvl >= 3 ? "#ffca28" : "#ffffff"; 

    // 2. Build the Debug String
  //  let ma = unit.stats.meleeAttack;
  //  let df = unit.stats.armor;    
  //  let acc = unit.stats.accuracy;

 //   let debugText = `LVL:${Math.floor(lvl)} | ATK:${ma} | DF:${df} | ACC:${acc}`;

    // 3. Draw the Label
  //  ctx.fillText(debugText, unit.x, barY - 10);

    // 4. SATISFACTION / EXP BAR
  //  const expProgress = lvl % 1; 
   // ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  // ctx.fillRect(unit.x - barWidth / 2, barY - 6, barWidth, 2); // EXP Background
    
    // Blue for Commander, Green for regular troops
  // ctx.fillStyle = unit.isCommander ? "#4fc3f7" : "#81c784"; 
  // ctx.fillRect(unit.x - barWidth / 2, barY - 6, barWidth * expProgress, 2); // EXP Fill

   // ctx.restore();
//}

// 5. HEALTH BAR RENDERING
// Draw Background (Red/Empty)
//ctx.fillStyle = "rgba(200, 0, 0, 0.5)";
//ctx.fillRect(unit.x - barWidth / 2, barY, barWidth, barHeight);

// Draw Health Fill (Green for Allies, Orange/Red for Enemies)
//const healthPercent = Math.max(0, unit.hp / unit.stats.health);
//ctx.fillStyle = unit.side === "COMMANDER" ? "#4caf50" : "#ff5722"; 
//ctx.fillRect(unit.x - barWidth / 2, barY, barWidth * healthPercent, barHeight);

// Draw Border
//ctx.strokeStyle = "#000";
//ctx.lineWidth = 1;
//ctx.strokeRect(unit.x - barWidth / 2, barY, barWidth, barHeight);
}); 

battleEnvironment.projectiles.forEach(p => {
		if (isNaN(p.x) || isNaN(p.y)) return; // Safety check
		
		 
        if (typeof camera !== 'undefined' && camera && typeof isOnScreen === 'function') {
            if (!isOnScreen(p, camera)) return;
        }
		
		 // ADD — distance cull (projectiles > 600 px from player are tiny):
         var _pdx = p.x - player.x, _pdy = p.y - player.y;
         if ((_pdx * _pdx + _pdy * _pdy) > 360000) return; 
		 
let vx = p.vx || p.dx || 0; 
let vy = p.vy || p.dy || 0;
let angle = (vx === 0 && vy === 0) ? 0 : Math.atan2(vy, vx);
        ctx.save(); 
        ctx.translate(p.x, p.y);

        let isBomb = p.attackerStats && p.attackerStats.role === "bomb";
		let isRocket = (p.type === "rocket") || 
               (p.attackerStats && (p.attackerStats.role === ROLES.ROCKET || p.attackerStats.name.includes("Rocket")));
			   let isJavelin = p.attackerStats && p.attackerStats.name === "Javelinier";
        let isSlinger = p.attackerStats && p.attackerStats.name === "Slinger";
		

let isBullet = p.attackerStats && (
    p.attackerStats.role === "gunner" || 
    p.attackerStats.role === "mounted_gunner" ||
    (p.attackerStats.name && p.attackerStats.name.toLowerCase().includes("camel"))
);

        let isBolt = p.attackerStats && p.attackerStats.name === "Crossbowman";
        // Default to arrow if it's not any of the above but comes from an archer/horse archer
		
		
const isEnemyCommander = !!(p.attackerStats && p.attackerStats.isCommander);
const commanderInMeleeMode =
    isEnemyCommander &&
    (
        p.attackerStats.ammo <= 0 ||
        p.attackerStats.currentStance === "statusmelee" ||
        p.attackerStats.weaponMode === "lance"
    );

let isArrow = !isBomb && !isRocket && !isJavelin && !isSlinger && !isBolt && !isBullet && !commanderInMeleeMode;

if (isBomb) {
            // Spinning round bomb
            let spin = Date.now() / 50;
            ctx.rotate(spin);
            
            // 1. The Bomb Body
            ctx.fillStyle = "#212121"; 
            ctx.beginPath(); 
            ctx.arc(0, 0, 4.5, 0, Math.PI * 2); 
            ctx.fill();

            // 2. The Flying Fuse/Spark (Now travels with the projectile)
            ctx.strokeStyle = "#ffa000"; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(5, -5);
            ctx.stroke();

            // The glowing tip of the fuse
            ctx.fillStyle = "#ff5722";
            ctx.beginPath();
            ctx.arc(5, -5, 1.5 + Math.random(), 0, Math.PI * 2);
            ctx.fill();
			
			
        }
		
		else if (isRocket) {
    // 1. High-Velocity Angle & Physics
    ctx.rotate(angle);
    ctx.scale(0.3, 0.3); // ---> NEW: Shrinks the mid-air rocket rendering by 50%
    // Subtle high-frequency jitter for powder burning instability
    let jitterY = (Math.sin(Date.now() * 0.1) * 0.8);

    // 2. THE LONG SKINNY SHAFT (Medieval Arrow Base)
    ctx.strokeStyle = "#5d4037"; 
    ctx.lineWidth = 0.6; // Ultra skinny
    ctx.beginPath(); 
    ctx.moveTo(-28, jitterY); // Extended back for length
    ctx.lineTo(12, jitterY);  // Pointing forward
    ctx.stroke();

    // 3. FLETCHING (The feathers at the back)
    ctx.fillStyle = "#eeeeee"; // White feathers
    ctx.beginPath();
    ctx.moveTo(-28, jitterY);
    ctx.lineTo(-34, jitterY - 2.5);
    ctx.lineTo(-30, jitterY);
    ctx.lineTo(-34, jitterY + 2.5);
    ctx.closePath();
    ctx.fill();

    // 4. THE POWDER TUBE (Lashed to the shaft)
    // We draw this slightly offset to look like it's tied to the side
    ctx.fillStyle = "#4e342e"; 
    ctx.strokeStyle = "#212121";
    ctx.lineWidth = 0.5;
    // Small, slender tube lashed to the front-middle
    ctx.fillRect(-6, jitterY + 0.5, 14, 2.2); 
    ctx.strokeRect(-6, jitterY + 0.5, 14, 2.2);
    
    // Lashings (The string holding the tube to the arrow)
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.moveTo(-4, jitterY); ctx.lineTo(-4, jitterY + 2.5);
    ctx.moveTo(4, jitterY); ctx.lineTo(4, jitterY + 2.5);
    ctx.stroke();

    // 5. THE ARROWHEAD (Sharp Warhead)
    ctx.fillStyle = "#424242";
    ctx.beginPath();
    ctx.moveTo(12, jitterY - 1.2);
    ctx.lineTo(20, jitterY); // Very long, piercing tip
    ctx.lineTo(12, jitterY + 1.2);
    ctx.fill();

    // 6. PROPELLANT EFFECTS (Coming from the back of the tube)
    let tubeBackX = -6;
    let flameSize = 3 + Math.random() * 5;
    let fGrd = ctx.createLinearGradient(tubeBackX, 0, tubeBackX - flameSize, 0);
    fGrd.addColorStop(0, "#fff59d");
    fGrd.addColorStop(0.4, "#ff9800");
    fGrd.addColorStop(1, "rgba(255, 87, 34, 0)");
    
    ctx.fillStyle = fGrd;
    ctx.beginPath();
    ctx.moveTo(tubeBackX, jitterY + 1);
    ctx.lineTo(tubeBackX - flameSize, jitterY + 1.5);
    ctx.lineTo(tubeBackX, jitterY + 2);
    ctx.fill();

    // 7. VOLUMINOUS SMOKE TRAIL
    ctx.fillStyle = "rgba(200, 200, 200, 0.35)";
    for (let i = 0; i < 5; i++) {
        let smokeX = tubeBackX - (i * 7);
        let smokeSize = 1.5 + i;
        ctx.beginPath();
        // Smoke drifts slightly "up" relative to the arrow's path
        ctx.arc(smokeX, (jitterY + 1.5) + (Math.sin(Date.now()/40 + i) * 1.5), smokeSize, 0, Math.PI * 2);
        ctx.fill();
    }
}
		
else if (p.isFire || p.projectileType === "firelance" || (p.projectileType && p.projectileType.includes("Firelance"))) {

            ctx.rotate(angle);

            // 1. Scale Settings (5x the original size)
            // Original was ~6px wide, now 30-50px wide spread
            const blastLength = 65; 
            const blastWidth = 40; 
            const jitter = (Math.random() - 0.5) * 10; // Adds "flicker" effect

            // 2. Create the "Hot Core" to "Fading Ember" Gradient
            // This removes the "bullet" look by blending the origin into the flame
            let fireGrd = ctx.createRadialGradient(0, 0, 2, 20, 0, blastLength);
            fireGrd.addColorStop(0, "rgba(255, 255, 255, 0.9)");   // White-hot center
            fireGrd.addColorStop(0.2, "rgba(255, 230, 100, 0.8)"); // Bright Yellow
            fireGrd.addColorStop(0.4, "rgba(255, 100, 0, 0.6)");   // Deep Orange
            fireGrd.addColorStop(0.7, "rgba(200, 40, 0, 0.3)");    // Red Glow
            fireGrd.addColorStop(1, "rgba(50, 50, 50, 0)");        // Dissipating Smoke

            // 3. Draw the Conical Blast Shape
            ctx.fillStyle = fireGrd;
            ctx.beginPath();
            ctx.moveTo(-5, 0); // Start slightly behind the tip for better "attachment"
            
            // Top curve of the jet
            ctx.quadraticCurveTo(blastLength * 0.4, -blastWidth + jitter, blastLength, jitter);
            // Bottom curve of the jet back to origin
            ctx.quadraticCurveTo(blastLength * 0.4, blastWidth + jitter, -5, 0);
            
            ctx.fill();

            // 4. Heat Distortion / Inner Turbulence
            // This adds extra "thickness" to the blast without adding "bullets"
            ctx.globalCompositeOperation = "lighter"; // Makes the fire "glow" onto itself
            ctx.fillStyle = "rgba(255, 150, 50, 0.2)";
            for (let i = 0; i < 2; i++) {
                let s = 10 + Math.random() * 15;
                ctx.beginPath();
                ctx.arc(Math.random() * 30, (Math.random() - 0.5) * 15, s, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalCompositeOperation = "source-over"; // Reset to normal

            // 5. Large Smoke Clouds (Tail)
            ctx.fillStyle = "rgba(100, 100, 100, 0.2)";
            ctx.beginPath();
            ctx.arc(-15, jitter, 15, 0, Math.PI * 2);
            ctx.arc(-25, -jitter, 10, 0, Math.PI * 2);
            ctx.fill();
        }
else if (isJavelin) {
// --- SURGERY START: High-Fidelity Javelin (Mini-Head Edition) ---
// Long thrown spear
ctx.rotate(angle);

// Shaft - matches unit's wood color (STAYS THE SAME)
ctx.strokeStyle = "#5d4037"; 
ctx.lineWidth = 2;
ctx.beginPath(); 
ctx.moveTo(-12, 0); // Tail
ctx.lineTo(8, 0);   // To head base
ctx.stroke();

// Scaled-down leaf-shaped iron tip (1/3 size)
ctx.fillStyle = "#bdbdbd";
ctx.beginPath();
ctx.moveTo(8, 0);          // Base of metal head
ctx.lineTo(7.33, -0.83);   // Flare top back (Scaled relative to 8,0)
ctx.lineTo(10.67, 0);      // Sharp tip (Length reduced from 8 to 2.67)
ctx.lineTo(7.33, 0.83);    // Flare bottom back
ctx.closePath();
ctx.fill();
// --- SURGERY END ---
        }
        else if (isSlinger) {
            // --- SURGERY START: Slinger Stone ---
            // Small aerodynamic lead/stone bullet
            ctx.rotate(angle);
            
            // Subtle motion trail
            ctx.fillStyle = "rgba(158, 158, 158, 0.4)";
            ctx.beginPath();
            ctx.ellipse(-3, 0, 5, 2, 0, 0, Math.PI * 2);
            ctx.fill();

            // The Stone itself
            ctx.fillStyle = "#9e9e9e";
            ctx.beginPath();
            ctx.arc(0, 0, 2.5, 0, Math.PI * 2); // Slightly larger than the unit-held stone for visibility
            ctx.fill();
            // --- SURGERY END ---
        }
		
		else if (isBolt) {
            // --- SURGERY START: Heavy Crossbow Bolt ---
            ctx.rotate(angle);
            
            // Bolts are shorter and thicker than arrows
            ctx.fillStyle = "#5d4037"; // Darker wood
            ctx.fillRect(-4, -1, 8, 2); 

            // Heavy triangular head
            ctx.fillStyle = "#757575"; 
            ctx.beginPath();
            ctx.moveTo(4, -2); ctx.lineTo(9, 0); ctx.lineTo(4, 2);
            ctx.fill();

            // Wood Fletchings (Brown/Tan instead of feathers)
            ctx.fillStyle = "#8d6e63"; 
            ctx.fillRect(-5, -1.5, 3, 3);
            // --- SURGERY END ---
        }
        else if (isArrow) {
            // --- SURGERY START: Slim Standard Arrow ---
            ctx.rotate(angle);
            
            // Thinner, longer shaft
            ctx.fillStyle = "#8d6e63"; 
            ctx.fillRect(-6, -0.5, 12, 1); 

            // Needle-like arrowhead
            ctx.fillStyle = "#9e9e9e"; 
            ctx.beginPath();
            ctx.moveTo(6, -1.5); ctx.lineTo(11, 0); ctx.lineTo(6, 1.5);
            ctx.fill();

            // Green "Forest" Fletchings (To differ from Red Horse Archer feathers)
            ctx.fillStyle = "#4caf50"; 
            ctx.fillRect(-7, -1.5, 4, 1);
            ctx.fillRect(-7, 0.5, 4, 1);
            // --- SURGERY END ---
        }
		else if (isBullet) {
 
            // --- SURGERY START: Handcannon Lead Ball ---
            ctx.rotate(angle);

            // 1. Long Motion Blur/Smoke Trail
            // This makes the fast bullet visible to the player
            let gradient = ctx.createLinearGradient(-15, 0, 0, 0);
            gradient.addColorStop(0, "rgba(140, 140, 140, 0)");   // Fade out
            gradient.addColorStop(1, "rgba(100, 100, 100, 0.6)"); // Smoke color
            
            ctx.fillStyle = gradient;
            ctx.fillRect(-18, -1, 18, 2); 

            // 2. The Lead Ball
            ctx.fillStyle = "#424242"; // Dark lead/iron
            ctx.beginPath();
            ctx.arc(0, 0, 2, 0, Math.PI * 1);
            ctx.fill();

            // 3. Incandescent Tip (Heat from the barrel)
            // A tiny orange-hot glow at the very front
            ctx.fillStyle = "#ff5722"; 
            ctx.beginPath();
            ctx.arc(1, 0, 1, 0, Math.PI * 1);
            ctx.fill();
  
        }
        else {
            // FALLBACK: Standard Bolt if all else fails
            ctx.rotate(angle);
            ctx.fillStyle = "#8d6e63";
            ctx.fillRect(-4, -0.5, 8, 1);
            ctx.fillStyle = "#9e9e9e";
            ctx.fillRect(2, -1.5, 3, 3);
        }
ctx.restore();
    });
	
	
// --- DRAW RTS SELECTION BOX ---
    if (typeof isBoxSelecting !== 'undefined' && isBoxSelecting && 
        typeof selectionBoxCurrent !== 'undefined' && 
        typeof selectionBoxStart !== 'undefined') {
        
        ctx.save();
        ctx.strokeStyle = "rgba(0, 255, 0, 0.8)";
        ctx.fillStyle = "rgba(0, 255, 0, 0.15)";
        ctx.lineWidth = 1;
        
        let width = selectionBoxCurrent.x - selectionBoxStart.x;
        let height = selectionBoxCurrent.y - selectionBoxStart.y;
        
        ctx.fillRect(selectionBoxStart.x, selectionBoxStart.y, width, height);
        ctx.strokeRect(selectionBoxStart.x, selectionBoxStart.y, width, height);
        ctx.restore();
    }
	
	// ============================================================================
// >>> PLACE IT HERE <<<
// This ensures sails are drawn ON TOP of ships and units, but UNDER the UI
// ============================================================================
if (window.inNavalBattle && typeof drawNavalSailsMasterLayer === 'function') {
    drawNavalSailsMasterLayer(ctx);
}
	
	// ---> FINAL UI LAYER <---
    // This ensures the player stats/roster are never hidden by unit sprites
    if (typeof drawPlayerOverlay === 'function') {
        // We use a dummy camera or reset transform if the UI is screen-space
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0); 
        drawPlayerOverlay(ctx, player);
        ctx.restore();
    }
	
	
	
}


  