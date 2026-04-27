// ============================================================================
// ENEMY COMMANDER SKIRMISH AI (STAYS BEHIND TROOPS, THEN 60s SKIRMISH, THEN MELEE)
// ============================================================================
function processEnemyCommanderAI(cmdr) {
    if (cmdr.hp <= 0 || cmdr.state === "FLEEING") return;

    // --- PHASE 0: COMMANDER / TACTICAL COWARD PHASE ---
    // The commander will stay behind his living units and will NOT attack
    // until his entire army is dead.
    let allies = [];
    let enemies = [];
    for (let u of battleEnvironment.units) {
        if (u.hp > 0 && !u.isDummy && u !== cmdr) {
            if (u.side === cmdr.side) allies.push(u);
            else enemies.push(u);
        }
    }

if (allies.length > 0) {
        cmdr.target = null;
        
        let aCx = 0, aCy = 0;
        for (let a of allies) { aCx += a.x; aCy += a.y; }
        aCx /= allies.length;
        aCy /= allies.length;

        let eCx = 0, eCy = 0;
        if (enemies.length > 0) {
            for (let e of enemies) { eCx += e.x; eCy += e.y; }
            eCx /= enemies.length;
            eCy /= enemies.length;
        } else {
            eCx = aCx; 
            eCy = aCy + 100; // Default orientation if no enemies visible
        }

        // Calculate vector pushing AWAY from the enemy centroid, through the ally centroid
        let dx = aCx - eCx;
        let dy = aCy - eCy;
        let dist = Math.hypot(dx, dy) || 1;
        
        // Target position is 200px safely behind his own front line
        let targetX = aCx + (dx / dist) * 200;
        let targetY = aCy + (dy / dist) * 200;
        
        let mdx = targetX - cmdr.x;
        let mdy = targetY - cmdr.y;
        let mDist = Math.hypot(mdx, mdy);
        let speed = (cmdr.stats && cmdr.stats.speed) ? cmdr.stats.speed : 1.0;
        
        if (mDist > 30) {
            cmdr.state = "moving";
            cmdr.isMoving = true;
            cmdr.targetVx = (mdx / mDist) * speed;
            cmdr.targetVy = (mdy / mDist) * speed;
            cmdr.direction = cmdr.targetVx > 0 ? 1 : -1;
        } else {
            cmdr.state = "idle";
            cmdr.isMoving = false;
            cmdr.targetVx = 0;
            cmdr.targetVy = 0;
        }

        // Find the closest enemy for fleeing OR shooting
        let closestDist = Infinity;
        let closestE = null;
        for (let e of enemies) {
            let d = Math.hypot(e.x - cmdr.x, e.y - cmdr.y);
            if (d < closestDist) { closestDist = d; closestE = e; }
        }
        
        if (closestE && closestDist < 250) {
            // Self-Preservation Override: Run away directly if a player unit flanks him!
            let fdx = cmdr.x - closestE.x;
            let fdy = cmdr.y - closestE.y;
            let fdist = Math.hypot(fdx, fdy) || 1;
            cmdr.targetVx = (fdx / fdist) * speed * 1.3; // Sprint speed bonus to escape
            cmdr.targetVy = (fdy / fdist) * speed * 1.3;
            cmdr.state = "moving";
            cmdr.isMoving = true;
            cmdr.direction = cmdr.targetVx > 0 ? 1 : -1;
			
			
      } else if (closestE && closestDist <= (cmdr.stats.range || 650)) {
            // NEW: Sit behind troops and SHOOT if an enemy is in range!
            
            // ---> FIX: Check if he was forced into melee stance by proximity <---
            let inMeleeStance = cmdr.stats && cmdr.stats.currentStance === "statusmelee";
            
            if (!inMeleeStance && (cmdr.cooldown || 0) <= 0 && (cmdr.ammo || 0) > 0) {
                let shootDx = closestE.x - cmdr.x;
                let shootDy = closestE.y - cmdr.y;
                let angle = Math.atan2(shootDy, shootDx);
                cmdr.direction = shootDx > 0 ? 1 : -1;
                cmdr.state = "attacking"; // Briefly set state for animations
                fireCommanderProjectile(cmdr, angle);
            }
        }

        // Make sure cooldown ticks down during Phase 0 so he can fire more than once
        if (cmdr.cooldown > 0) cmdr.cooldown--;

        applySkirmishPhysics(cmdr);
        return; // SKIP last-stand logic while troops are alive
    }

    // ========================================================================
    // ALLIES ARE DEAD: INITIATE LAST STAND AI
    // ========================================================================

    // --- 0. THE 60-SECOND TIMER ---
    // Mark the exact millisecond the commander charges (only sets once troops die)
    cmdr.skirmishStartTime = cmdr.skirmishStartTime || Date.now();
    let elapsed = Date.now() - cmdr.skirmishStartTime;
    let isSkirmishPhase = elapsed < 20000; // 20 seconds
const ammoLeft = Math.max(cmdr.ammo ?? 0, cmdr.stats?.ammo ?? 0);
const canSkirmish = isSkirmishPhase && ammoLeft > 0;
    // --- 1. DECISION THROTTLING ---
    cmdr.aiTick = (cmdr.aiTick || 0) + 1;
    if (cmdr.aiTick % 10 !== 0 && cmdr.target && cmdr.target.hp > 0) {
        applySkirmishPhysics(cmdr);
        return;
    }

    let closestDist = Infinity;
    let closestEnemy = null;

    // --- 2. TARGET PERSISTENCE ---
    if (cmdr.target && cmdr.target.hp > 0) {
        let d = Math.hypot(cmdr.target.x - cmdr.x, cmdr.target.y - cmdr.y);
        if (d < 600) { 
            closestEnemy = cmdr.target;
            closestDist = d;
        }
    }

    if (!closestEnemy) {
        for (let u of battleEnvironment.units) {
            if (u.side === 'player' && u.hp > 0) {
                let d = Math.hypot(u.x - cmdr.x, u.y - cmdr.y);
                if (d < closestDist) {
                    closestDist = d;
                    closestEnemy = u;
                }
            }
        }
    }

    if (!closestEnemy) {
        cmdr.state = "idle";
        cmdr.isMoving = false;
        cmdr.vx *= 0.9; cmdr.vy *= 0.9; 
        return;
    }

    cmdr.target = closestEnemy;

    let dx = closestEnemy.x - cmdr.x;
    let dy = closestEnemy.y - cmdr.y;
    let angle = Math.atan2(dy, dx);
    cmdr.direction = dx > 0 ? 1 : -1;

    // --- 3. PHASE LOGIC ---
if (!canSkirmish) {
        // ==========================================
        // PHASE 2: MELEE RUSH (No more arrows!)
        // ==========================================
        
        // CRITICAL FIX: Wipe ammo on BOTH the wrapper and the stats object
        cmdr.ammo = 0; 
        cmdr.isRanged = false; 
        if (cmdr.stats) {
            cmdr.stats.ammo = 0;
            cmdr.stats.isRanged = false;
            cmdr.stats.currentStance = "statusmelee"; // Instantly force melee stance
        }

        // SPEED FIX: Scale charge speed dynamically instead of a flat 4.5
        const baseSpeed = (cmdr.stats && cmdr.stats.speed) ? cmdr.stats.speed : 1.0;
        const chargeSpeed = baseSpeed * 1.0; // Gives a 0% charge bonus
        const meleeRange = 20;   //decision distance

        if (closestDist > meleeRange) {
            // CHARGE!
            cmdr.state = "moving";
            cmdr.isMoving = true;
            const worldH = (typeof BATTLE_WORLD_HEIGHT !== "undefined") ? BATTLE_WORLD_HEIGHT : 2600;
            const siegeYCap = worldH * 0.45;

            cmdr.targetVx = Math.cos(angle) * chargeSpeed;
            cmdr.targetVy = Math.sin(angle) * chargeSpeed;

            // Prevent downward charge in siege
            if (typeof inSiegeBattle !== "undefined" && inSiegeBattle) {
                if (cmdr.y >= siegeYCap && cmdr.targetVy > 0) {
                    cmdr.targetVy = 0;
                }
            }
        } else {
            // STRIKE!
            cmdr.state = "attacking"; 
            cmdr.isMoving = false;
            cmdr.targetVx = 0;
            cmdr.targetVy = 0;
        }
    } else {
        // ==========================================
        // PHASE 1: ANNOYING SKIRMISH (First 60s)
        // ==========================================
        const IDEAL_MIN = 200; 
        const IDEAL_MAX = 500; 
        const speed = 1.0; 

        if (closestDist < IDEAL_MIN) {
            // Retreat
            cmdr.state = "moving";
            cmdr.isMoving = true;
            cmdr.targetVx = -Math.cos(angle) * speed; 
            cmdr.targetVy = -Math.sin(angle) * speed; 
        } else if (closestDist > IDEAL_MAX) {
            // Advance cautiously
            cmdr.state = "moving";
            cmdr.isMoving = true;
            cmdr.targetVx = Math.cos(angle) * speed * 0.8;
            cmdr.targetVy = Math.sin(angle) * speed * 0.8;
        } else {
            // Hold and Shoot
            cmdr.state = "attacking"; 
            cmdr.isMoving = false;
            cmdr.targetVx = 0;
            cmdr.targetVy = 0;
        }
    }

    applySkirmishPhysics(cmdr);

    // --- 4. COMBAT EXECUTION ---
    // The ultimate safeguard: He is ONLY allowed to shoot if the phase is active AND he actually has ammo.
if (canSkirmish && cmdr.state === "attacking" && (cmdr.cooldown || 0) <= 0) {
        fireCommanderProjectile(cmdr, angle);
    }
    
    if (cmdr.cooldown > 0) cmdr.cooldown--;
}

function applySkirmishPhysics(cmdr) {
    const lerp = 0.15;
    cmdr.vx = (cmdr.vx || 0) * (1 - lerp) + (cmdr.targetVx || 0) * lerp;
    cmdr.vy = (cmdr.vy || 0) * (1 - lerp) + (cmdr.targetVy || 0) * lerp;

    cmdr.x += cmdr.vx;
    cmdr.y += cmdr.vy;

    let margin = 60;
    const worldH = (typeof BATTLE_WORLD_HEIGHT !== "undefined") ? BATTLE_WORLD_HEIGHT : 2600;
    const siegeYCap = worldH * 0.45;

    cmdr.x = Math.max(margin, Math.min(BATTLE_WORLD_WIDTH - margin, cmdr.x));

    // Siege-only Y lock: never go below 45% of map height
    if (typeof inSiegeBattle !== "undefined" && inSiegeBattle) {
        cmdr.y = Math.min(cmdr.y, siegeYCap);
        if (cmdr.vy > 0 && cmdr.y >= siegeYCap) {
            cmdr.vy = 0;
            cmdr.targetVy = Math.min(cmdr.targetVy || 0, 0);
        }
    } else {
        cmdr.y = Math.max(margin, Math.min(worldH - margin, cmdr.y));
    }
}

function fireCommanderProjectile(cmdr, angle) {
    // 1. STRICT AMMO CHECK: Must have ammo on BOTH wrapper and stats object
    const currentAmmo = Math.max(cmdr.ammo || 0, (cmdr.stats && cmdr.stats.ammo) || 0);
    if (currentAmmo <= 0) return;

    // 2. STRICT STANCE CHECK: Must explicitly be in a ranged stance
    // If stats is missing, or stance is missing, do NOT shoot.
    if (!cmdr.stats) return;
    const stance = String(cmdr.stats.currentStance || "").toLowerCase();
    
    // Explicitly reject any variation of melee or lance
    if (stance.includes("melee") || stance.includes("lance")) return;
    
    // Explicitly require a ranged stance (adjust if your game uses different strings)
    if (stance !== "statusranged" && stance !== "status_ranged") return;

    // 3. FIRE PROJECTILE
    let projSpeed = 12;
    battleEnvironment.projectiles.push({
        x: cmdr.x, y: cmdr.y,
        vx: Math.cos(angle) * projSpeed,
        vy: Math.sin(angle) * projSpeed,
        startX: cmdr.x, startY: cmdr.y,
        maxRange: cmdr.stats.range || 650,
        attackerStats: cmdr.stats,
        side: cmdr.side,
        projectileType: "Arrow",
        isFire: false
    });

    if (typeof AudioManager !== 'undefined') AudioManager.playSound('arrow');
    
    // Decrease ammo on both tracking locations to be safe
    cmdr.ammo = Math.max(0, (cmdr.ammo || 0) - 1);
    if (cmdr.stats) cmdr.stats.ammo = Math.max(0, (cmdr.stats.ammo || 0) - 1);
    
    cmdr.cooldown = 150;
}