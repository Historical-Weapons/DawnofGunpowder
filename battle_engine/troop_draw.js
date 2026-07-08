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
			
// FIX (ship flicker): use a seed that's frozen once and never recomputed.
        // Land-stuck effects have static x/y so re-deriving the seed from x/y
        // every frame was harmless there — but ship-stuck effects get x/y
        // re-derived every frame from the ship's sway/rock wobble (so the
        // decal can track the moving deck), and feeding that live, ever-so-
        // slightly-changing position into the hash made drawStuckProjectileOrEffect
        // pick a different sprite variant almost every frame = flicker.
        // ai_categories.js now stamps a `seed` on ground effects at spawn time;
        // this is just a defensive fallback + one-time cache for any effect
        // that doesn't have one yet, so it self-heals rather than flickering.
        if (typeof ge.seed !== 'number') {
            ge.seed = (ge.x * 12.9898) + (ge.y * 78.233);
        }
        const geSeed = ge.seed;

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
// whether unit.vx/vy exist — uses actual x/y movement between frames)
//
// dx > 0  → face RIGHT  (facingDir  =  1, natural sprite)
// dx < 0  → face LEFT   (facingDir  = -1, ctx.scale(-1,1) flips it)
// dx = 0  → hold last facing — stationary units never snap back
//
// dy > 0  → face DOWN   (facingDirY =  1, toward the player/camera —
//                         "front view", melee weapons point down-screen)
// dy < 0  → face UP     (facingDirY = -1, into the canvas — "back view",
//                         NOT YET IMPLEMENTED, see BACKSHOT TODO below)
// facingDirY = 0 → not in vertical mode; renderer uses normal side view.
//
// ── VERTICAL FACING — v1 (this session) ─────────────────────────────
// facingDirY is now a real, independently-hysteresis-gated axis, parallel
// to the existing horizontal facingDir logic below. It is consumed today
// ONLY by infscript.js's spearman/glaive branch (see "DOWNWARD FACING"
// comment block there). Every other unit type (sword_shield, peasant,
// shortsword-fallback, two_handed, javelinier, all of cavscript.js) still
// ignores facingDirY and will render in normal side view regardless of
// its value — that is safe (nothing throws, they just don't use it yet)
// but means the visual payoff is spearman-only until those are ported.
// See infscript.js's top-of-file session notes for the exact porting
// pattern to copy for each remaining weapon type.
//
// BACKSHOT / UP (facingDirY = -1) — NOT IMPLEMENTED THIS SESSION.
// The value IS computed below (so future sessions don't need to touch
// this block again), but nothing currently reads it for the -1 case.
// This was flagged by the user as the *most important* direction
// long-term (units currently never show their back to the camera at
// all), but downward was chosen as the easier first slice. When it's
// implemented: a weapon held facing away from the viewer is FURTHER
// from the camera than the body, so it must be drawn UNDERNEATH the
// body layer (before it) — the opposite z-order from the downward
// case (where the weapon is closer to the viewer than the body and
// stays drawn on top, same as the existing side-view z-order).
//
// SIEGE CREW FAST-PATH
// ─────────────────────────────────────────────────────────────
// ram_pusher / ladder_carrier / ladder_fanatic follow targets
// whose X position has intentional ±scatter to prevent pile-ups.
// That scatter (±7.5px) makes _dx oscillate every frame, flipping
// facingDir left-right at 60fps.  Fix: use a much larger threshold
// (SIEGE_THRESH) so only real lateral repositioning flips their
// sprite — the ±1-2px-per-frame jitter never reaches it.
// DECIDED: siege crew are permanently excluded from vertical facing —
// product decision, not a gap. They keep horizontal-only facingDir
// forever; do not add facingDirY computation for isSiegeCrew below.
//
// HYSTERESIS FOR ALL OTHER UNITS (horizontal — unchanged from before)
// ─────────────────────────────────────────────────────────────
// A unit can reverse X velocity for 1-2 frames during collision
// resolution or path recalculation without actually changing
// travel direction.  The old 0.4px threshold committed immediately,
// causing visible flickering on units in dense melee.
// Fix: _flipTick accumulates consecutive frames of movement in a
// candidate direction. The facing only commits after FLIP_FRAMES
// consistent frames.  Sub-threshold or reversed frames reset the
// counter so snap-back can't happen unless the unit genuinely
// changes course.
//
// HYSTERESIS FOR VERTICAL FACING (facingDirY — new this session)
// ─────────────────────────────────────────────────────────────
// Mirrors the horizontal _flipTick pattern exactly, using its own
// signed counter (_vFlipTick) so it cannot interfere with the
// horizontal counter. Uses a LOWER commit threshold (V_THRESH) than
// the horizontal "dominant" threshold (H_DOMINANT_THRESH) deliberately:
// movement in this game is almost always diagonal, so if vertical only
// engaged once it was the LARGER of the two components, it would almost
// never win and this whole feature would rarely be visible. Instead:
//   - |dx| >= H_DOMINANT_THRESH (0.8)  → horizontal dominates outright,
//     vertical mode is cancelled instantly (no hysteresis needed to
//     turn OFF — a hard horizontal move is an unambiguous signal).
//   - otherwise, if |dy| > V_THRESH (0.4) for V_FRAMES (3) consecutive
//     frames → commit to that vertical facing, same debounce quality
//     as the horizontal flip.
// This lets a unit moving mostly-down-but-slightly-sideways (the common
// case) correctly commit to the downward pose instead of horizontal
// always winning by default.
// =============================================================
{
    const _dx = (unit._prevX !== undefined) ? (unit.x - unit._prevX) : 0;
    const _dy = (unit._prevY !== undefined) ? (unit.y - unit._prevY) : 0;

    // ── SIEGE CREW: direction locked against jitter ───────────────
    // ram_pusher / ladder_carrier / ladder_fanatic travel mostly
    // vertically (Y-axis).  Their target X has deliberate scatter
    // (±7.5px) to stop pile-ups — that must NOT trigger facing flips.
    // We only flip if they move laterally by more than SIEGE_THRESH
    // in a single frame, which only happens during a real role change
    // (e.g. being knocked sideways or reassigned).
    const isSiegeCrew = (unit.siegeRole === 'ram_pusher'    ||
                         unit.siegeRole === 'ladder_carrier' ||
                         unit.siegeRole === 'ladder_fanatic');

    if (isSiegeCrew) {
        const SIEGE_THRESH = 4; // px/frame — well above jitter, catches real lateral moves
        if      (_dx >  SIEGE_THRESH) { unit.facingDir = 1;  unit._flipTick = 0; }
        else if (_dx < -SIEGE_THRESH) { unit.facingDir = -1; unit._flipTick = 0; }
        // else: hold current direction — jitter / vertical movement ignored
        // facingDirY intentionally never computed for siege crew — see
        // "DECIDED" note above. It stays 0/undefined for them permanently,
        // which infscript.js and cavscript.js treat as "no vertical mode".

    } else {
        // ── STANDARD UNITS: horizontal hysteresis flip (unchanged) ──
        // Commit direction change only after FLIP_FRAMES consecutive
        // frames of movement in the new direction.
        const MOVE_THRESH = 0.4;
        const FLIP_FRAMES = 3;

        if (_dx > MOVE_THRESH) {
            if (unit.facingDir !== 1) {
                // Candidate flip to RIGHT — accumulate counter
                unit._flipTick = (unit._flipTick > 0) ? unit._flipTick + 1 : 1;
                if (unit._flipTick >= FLIP_FRAMES) { unit.facingDir = 1; unit._flipTick = 0; }
            } else {
                unit._flipTick = 0; // already facing right — reset, no work needed
            }

        } else if (_dx < -MOVE_THRESH) {
            if (unit.facingDir !== -1) {
                // Candidate flip to LEFT — accumulate counter (negative direction)
                unit._flipTick = (unit._flipTick < 0) ? unit._flipTick - 1 : -1;
                if (unit._flipTick <= -FLIP_FRAMES) { unit.facingDir = -1; unit._flipTick = 0; }
            } else {
                unit._flipTick = 0; // already facing left — reset
            }

        } else {
            // Sub-threshold horizontal movement this frame — the unit
            // MAY still be moving vertically; don't touch facingDir,
            // just reset the horizontal candidate counter.
            unit._flipTick = 0;
        }

        // ── STANDARD UNITS: vertical hysteresis flip (new) ──────────
        // Independent of the horizontal block above — both run every
        // frame off the same _dx/_dy so a diagonal move is evaluated
        // on both axes, with H_DOMINANT_THRESH deciding who wins.
        const H_DOMINANT_THRESH = 0.8; // |dx| at/above this always cancels vertical mode
        const V_THRESH = 0.4;          // |dy| candidate threshold (same feel as horizontal)
        const V_FRAMES = 3;            // consecutive frames required to commit (same as horizontal)

        if (Math.abs(_dx) >= H_DOMINANT_THRESH) {
            // Strong horizontal movement — snap back to normal side view instantly.
            // No hysteresis needed here: unlike a *candidate* vertical flip
            // (which needs debouncing so it doesn't flicker), a hard
            // horizontal move is already an unambiguous, decisive signal.
            unit.facingDirY = 0;
            unit._vFlipTick = 0;

        } else if (_dy > V_THRESH) {
            // ── MOVING DOWN — candidate for facingDirY = 1 ──────────
            if (unit.facingDirY !== 1) {
                unit._vFlipTick = (unit._vFlipTick > 0) ? unit._vFlipTick + 1 : 1;
                if (unit._vFlipTick >= V_FRAMES) { unit.facingDirY = 1; unit._vFlipTick = 0; }
            } else {
                unit._vFlipTick = 0; // already facing down — reset, no work needed
            }

        } else if (_dy < -V_THRESH) {
            // ── MOVING UP — candidate for facingDirY = -1 ───────────
            // (Computed for completeness/future use — see BACKSHOT TODO
            // above. No renderer currently branches on this value.)
            if (unit.facingDirY !== -1) {
                unit._vFlipTick = (unit._vFlipTick < 0) ? unit._vFlipTick - 1 : -1;
                if (unit._vFlipTick <= -V_FRAMES) { unit.facingDirY = -1; unit._vFlipTick = 0; }
            } else {
                unit._vFlipTick = 0; // already facing up — reset
            }

        } else {
            // Sub-threshold on both axes / truly stationary: reset the
            // vertical candidate counter but HOLD whatever facingDirY
            // currently is — a stationary unit keeps its last pose
            // instead of snapping back to side view.
            unit._vFlipTick = 0;
        }
    }

    // First-ever frame safety net (unit just spawned, _prevX not yet written):
    if (unit.facingDir === undefined)  { unit.facingDir = 1; }
    if (unit.facingDirY === undefined) { unit.facingDirY = 0; }

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
    // facingDirY needs NO sign flip here (unlike facingDir) — "down" means
    // "toward the player/camera" regardless of the mount's natural L/R
    // facing convention, so it passes through to cavscript.js unchanged.
    // // UP placeholder   : facingDirY=-1 is computed but unread by cavscript.js — TODO next session
    // // DOWN placeholder : facingDirY=1 is computed but unread by cavscript.js — TODO next session
    //                       (see cavscript.js top-of-file notes: only the
    //                       default lancer's couched-lance is scoped/ready
    //                       to receive this; horse_archer + camel-cannon
    //                       melee fallbacks are documented but not wired)
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
    // // UP placeholder   : facingDirY=-1 (backshot) computed but NOT rendered — TODO
    // // DOWN placeholder : facingDirY=1 is now LIVE for visType "spearman" only
    //                       (spear/glaive point down-screen — see infscript.js).
    //                       sword_shield / peasant / shortsword / two_handed /
    //                       archer / javelinier / etc. still ignore it and will
    //                       render normal side view even while facingDirY===1.
    //                       See infscript.js top-of-file session notes.
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

        let isBolt = p.attackerStats && (
            p.attackerStats.role === ROLES.CROSSBOW ||
            (p.attackerStats.name && p.attackerStats.name.toLowerCase().includes("crossbow"))
        );
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
            ctx.moveTo(6, -1); ctx.lineTo(11, 0); ctx.lineTo(6, 1);
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