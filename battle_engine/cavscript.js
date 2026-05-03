function drawCavalryUnit(ctx, x, y, moving, frame, factionColor, isAttacking, type, side, unitName, isFleeing, cooldown, unitAmmo, unit, reloadProgress) {
	
	if (!unit || !unit.stats) {
        // If the unit object is missing or stats aren't loaded, 
        // return early to prevent the crash.
        return; 
    }
	
    ctx.save();
    ctx.translate(x, y);

    // ── DIRECTIONAL FLIP ─────────────────────────────────────────
    // facingDir 1 = right (natural), -1 = left (full sprite mirror)
    // ctx.scale(-1,1) flips the entire sprite — no per-element changes needed
    ctx.scale(unit.facingDir || 1, 1);

    // // UP placeholder   : future — ctx.rotate(-Math.PI/2) + back-view sprite
    // // DOWN placeholder : future — ctx.rotate( Math.PI/2) + front-view sprite
    // ─────────────────────────────────────────────────────────────
    
// --- DYNAMIC ARMOR RETRIEVAL ---
    let armorVal = 2; 
    // >>> ADD THIS LINE: Filter for the Player / General <<<
    let isCommander = (unit && unit.isCommander) || unitName === "PLAYER" || unitName === "Commander" || unitName === "General";
    // 1. BEST METHOD: Read directly from the physical unit on the battlefield
    if (unit && unit.stats && unit.stats.armor !== undefined) {
        armorVal = unit.stats.armor;
    } 
    // 2. BACKUP: Read from the global roster (Used for UI menu rendering)
    else if (typeof UnitRoster !== 'undefined' && UnitRoster.allUnits[unitName]) {
        armorVal = UnitRoster.allUnits[unitName].armor;
    } 
    // 3. EMERGENCY FALLBACK: Name checks (Added Keshig here just in case)
    else if (unitName && (unitName.includes("Heavy") || unitName.includes("Elite") || unitName.includes("eshig") || type === "cataphract")) {
        armorVal = 40; 
    }

// This regex catches: "War Elephant", "warelephant", "ELEPHANT_HEAVY", "ArmoredElefant", etc.
    const elephantRegex = /eleph|elefa/i; 
    const isElephant = elephantRegex.test(type) || (unitName && elephantRegex.test(unitName));
    const isCamel = type === "camel" || (unitName && /camel/i.test(unitName));
  
	
    if (unitName === "PLAYER" || unitName === "Commander") armorVal = Math.max(armorVal, 10);

    // Scenario 1 (Hakata Bay): player-side units use Japanese visuals regardless of factionColor.
    // Mirrors the same flag used for the Yumi bow. Has zero effect in sandbox.
    const isJapan = (factionColor === "#c2185b") || (window.__campaignStory1Active && unit && unit.side === 'player');

    let animFrame = frame || (Date.now() / 100);
    // dir is always 1 — ctx.scale(facingDir) above handles all mirroring.
    // Keeping dir so all mount/rider offset math below compiles unchanged.
    let dir = 1;
 

    let isMoving = moving || (typeof vx !== 'undefined' && (Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1));
    let legSwing = isMoving ? Math.sin(animFrame * 0.4) : 0; // Normalized for scaling
    let bob = isMoving ? Math.sin(animFrame * 0.4) * 2 : 0;
    
    // Default rider physics (adjusted later if mount is massive)
    let riderBob = isMoving ? Math.sin(animFrame * 0.4 + 0.5) * 1.5 : 0;
    let riderHeightOffset = 0; 
let baseMountHeight = -4; // Default Horse
if (isElephant) baseMountHeight = -80; // Lower spine relative to body center
if (isCamel)    baseMountHeight = 7;
 

    if (isElephant) {
		// Add a gentle, rhythmic weight shift so it doesn't statically lean
        let eSway = isMoving ? Math.sin(animFrame * 0.2) * 0.04 : 0;
        ctx.rotate(eSway);
		
        // ==========================================
        //      MASSIVE, HIGH-DETAIL ELEPHANT
        // ==========================================
        let eBob = bob * 1.5; // Heavier, slower bob for massive weight
        let eSwing = legSwing * 10; // Wider, lumbering stride
        let trunkSwing = isMoving ? Math.cos(animFrame * 0.4) * 6 : 0;
        let earFlap = isMoving ? Math.cos(animFrame * 0.4) * 4 : 0;

        let skinBase = "#757575";
        let skinDark = "#616161";
        let outline = "#424242";

        // 1. FAR LEGS (Thick, column-like)
        ctx.fillStyle = skinDark;
        ctx.strokeStyle = outline;
        ctx.lineWidth = 2;

        // Far Back Leg
        ctx.beginPath(); ctx.roundRect(-22 + eSwing * 0.5, eBob - 5, 12, 28, 3); ctx.fill(); ctx.stroke();
        // Far Front Leg
        ctx.beginPath(); ctx.roundRect(18 - eSwing * 0.5, eBob - 5, 12, 28, 3); ctx.fill(); ctx.stroke();

        // 2. TAIL
        ctx.beginPath();
        ctx.moveTo(-33, eBob - 18);
        ctx.quadraticCurveTo(-42, eBob - 5, -38, eBob + 8);
        ctx.strokeStyle = outline; ctx.lineWidth = 2; ctx.stroke();
        // Tail tuft
        ctx.fillStyle = "#212121";
        ctx.beginPath(); ctx.arc(-38, eBob + 8, 3, 0, Math.PI * 2); ctx.fill();

        // 3. MAIN BODY (Exactly 3x Horse Size: 33x21 ellipse)
        ctx.fillStyle = skinBase;
        ctx.strokeStyle = outline;
        ctx.beginPath();
        ctx.ellipse(0, eBob - 15, 33, 22, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Body Wrinkles (Faint texture arcs)
        ctx.strokeStyle = "rgba(66, 66, 66, 0.3)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let w = -20; w < 20; w += 8) {
            ctx.moveTo(w, eBob - 34);
            ctx.quadraticCurveTo(w + 6, eBob - 15, w - 2, eBob + 2);
        }
        ctx.stroke();

        // 4. HEAD & EYE
        ctx.fillStyle = skinBase;
        ctx.strokeStyle = outline;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(30, eBob - 20, 16, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        
        ctx.fillStyle = "#111"; // Beady eye
        ctx.beginPath(); ctx.arc(36, eBob - 24, 2, 0, Math.PI * 2); ctx.fill();

        // 5. SWINGING TRUNK
        ctx.beginPath();
        ctx.moveTo(42, eBob - 22);
        ctx.quadraticCurveTo(55 + trunkSwing, eBob - 10, 42 + trunkSwing * 1.5, eBob + 20);
        ctx.quadraticCurveTo(35 + trunkSwing * 1.5, eBob + 24, 38 + trunkSwing, eBob + 18);
        ctx.quadraticCurveTo(46 + trunkSwing, eBob - 5, 30, eBob - 6);
        ctx.fill(); ctx.stroke();

        // Trunk Wrinkles
        ctx.strokeStyle = "rgba(66, 66, 66, 0.4)";
        ctx.beginPath();
        for(let tw = 0; tw < 18; tw += 4) {
            ctx.moveTo(38 + tw*0.2 + trunkSwing*0.5, eBob - 10 + tw);
            ctx.lineTo(46 + trunkSwing*0.4, eBob - 8 + tw);
        }
        ctx.stroke();

        // 6. GIANT TUSKS (Unarmored, natural weapons)
        ctx.fillStyle = "#fffae6";
        ctx.strokeStyle = "#cfc7a1";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(36, eBob - 10);
        ctx.quadraticCurveTo(55, eBob - 5, 60, eBob - 20);
        ctx.quadraticCurveTo(50, eBob - 2, 35, eBob - 3);
        ctx.fill(); ctx.stroke();

        // 7. FLAPPING EAR
        ctx.fillStyle = skinDark;
        ctx.strokeStyle = outline;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(22, eBob - 18, 12 + earFlap, 18, Math.PI / 8, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // 8. NEAR LEGS & TOES
        ctx.fillStyle = skinBase;
        ctx.strokeStyle = outline;
        ctx.lineWidth = 2;

        // Near Back Leg
        ctx.beginPath(); ctx.roundRect(-28 - eSwing, eBob - 5, 14, 30, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#bdbdbd"; // Toenails
        for(let t=0; t<3; t++) { ctx.beginPath(); ctx.arc(-26 - eSwing + t*4, eBob + 24, 2.5, Math.PI, 0); ctx.fill(); }

        // Near Front Leg
        ctx.fillStyle = skinBase;
        ctx.beginPath(); ctx.roundRect(12 + eSwing, eBob - 5, 14, 30, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#bdbdbd"; // Toenails
        for(let t=0; t<3; t++) { ctx.beginPath(); ctx.arc(14 + eSwing + t*4, eBob + 24, 2.5, Math.PI, 0); ctx.fill(); }

 

} else if (type === "camel") {
        // ==========================================
        //      DEDICATED CAMEL BLOCK (REVISED)
        // ==========================================
        let mScale = 1.25; 
        let mBob = bob * mScale;

        ctx.lineCap = "round"; 
        ctx.lineJoin = "round";

        const drawLeg = (isFront, isNear) => {
            let offset = isNear ? 0 : Math.PI; 
            let phase = (animFrame * 0.3) + offset;
            
            // --- FIX: Only calculate swing and lift if the unit is actively moving ---
            let swing = moving ? Math.sin(phase) : 0; 
            let lift = moving ? Math.max(0, -Math.cos(phase)) : 0; 
            
            ctx.beginPath();
            let endX, endY;
            ctx.strokeStyle = isNear ? "#4A3320" : "#2d1c15";
            ctx.lineWidth = (isNear ? 2.5 : 2.0) * mScale;
            
            if (isFront) {
                let startX = (isNear ? 6 : 4) * mScale;
                let startY = mBob + 4 * mScale;
                let kneeX = startX + swing * 4 * mScale;
                let kneeY = startY + 6 * mScale - lift * 1.5 * mScale;
                endX = kneeX + swing * 1.5 * mScale;
                endY = kneeY + 5 * mScale - lift * 3 * mScale;
                ctx.moveTo(startX, startY); ctx.lineTo(kneeX, kneeY); ctx.lineTo(endX, endY);   
            } else {
                let startX = (isNear ? -6 : -8) * mScale;
                let startY = mBob + 3 * mScale;
                let stifleX = startX + swing * 3 * mScale;
                let stifleY = startY + 5 * mScale - lift * mScale;
                let hockX = stifleX - 1.5 * mScale + swing * 2 * mScale;
                let hockY = stifleY + 3 * mScale - lift * 2 * mScale;
                endX = hockX + 1.5 * mScale;
                endY = hockY + 3 * mScale - lift * 1 * mScale;
                ctx.moveTo(startX, startY); ctx.lineTo(stifleX, stifleY); ctx.lineTo(hockX, hockY); ctx.lineTo(endX, endY);        
            }
            ctx.stroke();
            
            // --- FIX MOVED HERE (Inside function scope) ---
            ctx.fillStyle = isNear ? "#bcaaa4" : "#8d7b76";
            ctx.beginPath();
            let footW = Math.max(0.1, 2.2 * mScale);
            let footH = Math.max(0.1, 1.2 * mScale);
            ctx.ellipse(endX, endY + 0.5 * mScale, footW, footH, 0, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
        };

        // --- Z-ORDER 1: FAR LEGS & TAIL ---
        drawLeg(true, false);  // Front Far
        drawLeg(false, false); // Back Far

        // --- Z-ORDER 2: CAMEL BODY (SINGLE PATH) ---
        // This ensures the 2 humps, neck, head, and belly share ONE clean fill.
        let body = new Path2D();
        body.moveTo(-11 * mScale, mBob + 3 * mScale); // Start at rear
        body.bezierCurveTo(-12 * mScale, mBob - 4 * mScale, -9 * mScale, mBob - 8 * mScale, -5 * mScale, mBob - 8 * mScale); // Rump
        body.bezierCurveTo(-4 * mScale, mBob - 15 * mScale, -1 * mScale, mBob - 15 * mScale, 1 * mScale, mBob - 6 * mScale); // Hump 1
        body.quadraticCurveTo(3 * mScale, mBob - 3 * mScale, 4 * mScale, mBob - 6 * mScale); // Deep dip between humps
        body.bezierCurveTo(6 * mScale, mBob - 15 * mScale, 9 * mScale, mBob - 15 * mScale, 10 * mScale, mBob - 7 * mScale); // Hump 2
        body.quadraticCurveTo(12 * mScale, mBob - 2 * mScale, 14 * mScale, mBob - 8 * mScale); // Base of neck
        body.quadraticCurveTo(16 * mScale, mBob - 16 * mScale, 19 * mScale, mBob - 17 * mScale); // Neck sweeping up
        body.bezierCurveTo(22 * mScale, mBob - 18 * mScale, 24 * mScale, mBob - 15 * mScale, 25 * mScale, mBob - 12 * mScale); // Crown of head
        body.lineTo(25.5 * mScale, mBob - 9 * mScale); // Snout
        body.lineTo(23 * mScale, mBob - 8 * mScale); // Mouth
        body.lineTo(20 * mScale, mBob - 9 * mScale); // Jawline
        body.quadraticCurveTo(16 * mScale, mBob - 2 * mScale, 11 * mScale, mBob + 5 * mScale); // Throat to chest
        body.quadraticCurveTo(9 * mScale, mBob + 9 * mScale, 5 * mScale, mBob + 8 * mScale); // Chest
        body.lineTo(-6 * mScale, mBob + 8 * mScale); // Flat belly
        body.quadraticCurveTo(-10 * mScale, mBob + 7 * mScale, -11 * mScale, mBob + 3 * mScale); // Back to rear
        body.closePath();

        ctx.fillStyle = "#D4B886"; // Consistent, rich desert sand color
        ctx.strokeStyle = "#4A3320"; 
        ctx.lineWidth = 1.5 * mScale;
        ctx.fill(body); ctx.stroke(body);

        ctx.beginPath(); ctx.moveTo(24.5 * mScale, mBob - 9.5 * mScale); ctx.lineTo(25.5 * mScale, mBob - 9.5 * mScale); ctx.stroke(); // Snout line

        // Ear
        ctx.fillStyle = "#D4B886";
        ctx.beginPath(); ctx.moveTo(19 * mScale, mBob - 15 * mScale);
        ctx.lineTo(17 * mScale, mBob - 18 * mScale); ctx.lineTo(20 * mScale, mBob - 16 * mScale);
        ctx.fill(); ctx.stroke();

        // This prevents the diagonal lines and brown square from appearing on the Camel Cannon
        if (armorVal >= 25 && !unitName.toLowerCase().includes("cannon")) {
            ctx.save(); 
            ctx.clip(body); // MAGIC: Clips the armor perfectly to the camel's exact curves!
            
            if (armorVal >= 40) {
                // Heavy Chain/Plate
                ctx.fillStyle = "#9e9e9e"; 
                // Draw a rectangle over the torso area, let the clip map it to the body
                ctx.fillRect(-10 * mScale, mBob - 10 * mScale, 22 * mScale, 20 * mScale); 
                ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 0.5 * mScale;
                for(let i = -10; i < 15; i+=2) {
                    ctx.beginPath(); ctx.moveTo(i * mScale, mBob - 15 * mScale); ctx.lineTo(i * mScale, mBob + 10 * mScale); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(-10 * mScale, mBob + (i%4)*2 * mScale); ctx.lineTo(15 * mScale, mBob + (i%4)*2 * mScale); ctx.stroke();
                }
            } else {
                // Leather Saddle/Blanket
                ctx.fillStyle = "#5d4037"; 
                ctx.fillRect(-8 * mScale, mBob - 8 * mScale, 18 * mScale, 15 * mScale);
                ctx.strokeStyle = "#271610"; ctx.lineWidth = 1 * mScale;
                for(let i = -8; i < 12; i+=3) {
                    ctx.beginPath(); ctx.moveTo(i * mScale, mBob - 10 * mScale); ctx.lineTo((i - 2) * mScale, mBob + 8 * mScale); ctx.stroke();
                }
            }
            ctx.restore();
        }

        // --- Z-ORDER 4: NEAR LEGS ---
        drawLeg(true, true);  // Front Near
        drawLeg(false, true); // Back Near

        // SURGERY FIX: onfoot
        riderHeightOffset = -14; 
        
    
} else {
        // ==========================================
        //   REVISED FWD-WALKING MUSCULAR HORSE
        // ==========================================
        let hBob = bob;
        
        // --- FIX: Only progress walkSpeed if the unit is moving ---
        let walkSpeed = moving ? animFrame * 0.15 : 0; 
        
        // --- FIX: Tie secondary animations to moving boolean ---
        let headNod = moving ? Math.sin(walkSpeed * 2) * 1.5 : 0;
        let tailSwish = moving ? Math.sin(walkSpeed) * 2.5 : 0;

        ctx.lineCap = "round"; ctx.lineJoin = "round";

        const bodyColor = "#795548";
        const darkBodyColor = "#5D4037"; 
        const farLegColor = "#3e2723";   
        const lineColor = "#3e2723";

        // --- HELPER: draw Muscular Leg ---
        const drawMuscularLeg = (isFront, isNear, phaseOffset) => {
            let phase = walkSpeed + phaseOffset;
            
            // --- FIX: Swing and lift must be 0 if not moving ---
            let swing = moving ? Math.sin(phase) : 0;
            let lift = moving ? Math.max(0, -Math.cos(phase)) : 0; 

            ctx.fillStyle = isNear ? darkBodyColor : farLegColor;
            ctx.beginPath();
            
            if (isFront) {
                let startX = isNear ? -7 : -4; 
                let startY = hBob + 4;
                
                let kneeX = startX - 1 + swing * 3;
                let kneeY = startY + 6 - lift * 2;
                
                let fetlockX = kneeX + swing * 1.5;
                let fetlockY = kneeY + 5 - lift * 3.5;
                
                let hoofX = fetlockX - (lift > 0.1 ? 1 : 0);
                let hoofY = fetlockY + 2.5;

                ctx.moveTo(startX + 2, startY);
                ctx.quadraticCurveTo(startX - 2, startY + 2, kneeX - 1.5, kneeY);
                ctx.lineTo(hoofX - 1.5, hoofY);
                ctx.lineTo(hoofX + 1.5, hoofY);
                ctx.lineTo(fetlockX + 1.2, fetlockY);
                ctx.quadraticCurveTo(kneeX + 1.8, kneeY + 1, startX + 2.5, startY + 3);
                ctx.closePath();
            } else {
                let startX = isNear ? 5 : 7; 
                let startY = hBob + 3;
                
                let stifleX = startX - 2 + swing * 1.5;
                let stifleY = startY + 4 - lift * 0.5;
                
                let hockX = stifleX + 1.5 + swing * 2;
                let hockY = stifleY + 4 - lift * 1.5;
                
                let fetlockX = hockX - 1.5 + swing * 1.5;
                let fetlockY = hockY + 4 - lift * 2.5;

                let hoofX = fetlockX - (lift > 0.1 ? 1 : 0);
                let hoofY = fetlockY + 2.5;

                ctx.moveTo(startX + 3, startY);
                ctx.quadraticCurveTo(startX + 4, startY + 5, hockX + 1.8, hockY);
                ctx.lineTo(hoofX + 1.5, hoofY);
                ctx.lineTo(hoofX - 1.5, hoofY);
                ctx.lineTo(fetlockX - 1.2, fetlockY);
                ctx.quadraticCurveTo(hockX - 2, hockY - 1, stifleX - 1, stifleY);
                ctx.quadraticCurveTo(startX - 1, startY + 1, startX - 2, startY);
                ctx.closePath();
            }
            
            ctx.fill();

            // Draw Hoof
            ctx.fillStyle = "#212121";
            let liftCalc = moving ? Math.max(0, -Math.cos(walkSpeed + phaseOffset)) : 0;
            let swingCalc = moving ? Math.sin(walkSpeed + phaseOffset) : 0;
            let hX, hY;

            if(isFront) {
                let kX = (isNear ? -7 : -4) - 1 + swingCalc * 3;
                let kY = hBob + 4 + 6 - liftCalc * 2;
                let fX = kX + swingCalc * 1.5;
                let fY = kY + 5 - liftCalc * 3.5;
                hX = fX - (liftCalc > 0.1 ? 1 : 0); hY = fY + 2.5;
            } else {
                let sX = (isNear ? 5 : 7) - 2 + swingCalc * 1.5;
                let sY = hBob + 3 + 4 - liftCalc * 0.5;
                let hoX = sX + 1.5 + swingCalc * 2.5;
                let hoY = sY + 4 - liftCalc * 1.5;
                let fX = hoX - 1.5 + swingCalc * 1.5;
                let fY = hoY + 4 - liftCalc * 2.5;
                hX = fX - (liftCalc > 0.1 ? 1 : 0); hY = fY + 2.5;
            }

            ctx.beginPath();
            ctx.moveTo(hX - 1.8, hY + 1); 
            ctx.lineTo(hX + 1.8, hY + 1); 
            ctx.lineTo(hX + 1.2, hY - 1.5); 
            ctx.lineTo(hX - 1.2, hY - 1.5); 
            ctx.closePath();
            ctx.fill();
        };

        // --- Z-ORDER 1: FAR LEGS & TAIL ---
        drawMuscularLeg(false, false, Math.PI);        
        drawMuscularLeg(true, false, Math.PI / 2);      

        ctx.strokeStyle = "#2d1c15"; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(11, hBob - 2); 
        ctx.bezierCurveTo(15 + tailSwish, hBob - 2, 18 + tailSwish, hBob + 4, 14 + tailSwish * 0.5, hBob + 12);
        ctx.stroke();

        // --- Z-ORDER 2: BODY ---
        ctx.fillStyle = bodyColor; ctx.strokeStyle = lineColor; ctx.lineWidth = 1.2;
        let horseBody = new Path2D();
        horseBody.moveTo(12, hBob + 2); 
        horseBody.quadraticCurveTo(12, hBob - 6, 5, hBob - 6); 
        horseBody.quadraticCurveTo(0, hBob - 4, -6, hBob - 5);    
        horseBody.quadraticCurveTo(-10, hBob - 10 + headNod, -13, hBob - 16 + headNod); 
        horseBody.lineTo(-15, hBob - 17 + headNod); 
        horseBody.lineTo(-24, hBob - 11 + headNod); 
        horseBody.quadraticCurveTo(-26, hBob - 8 + headNod, -24, hBob - 6 + headNod);  
        horseBody.lineTo(-18, hBob - 4 + headNod);  
        horseBody.quadraticCurveTo(-12, hBob - 2 + headNod, -9, hBob + 5);   
        horseBody.quadraticCurveTo(-8, hBob + 10, 0, hBob + 10);  
        horseBody.quadraticCurveTo(10, hBob + 10, 12, hBob + 2); 
        horseBody.closePath();

        ctx.fill(horseBody); 
        ctx.stroke(horseBody);

// >>> BEGIN SURGERY: COMMANDER HORSE SIMPLE BLANKET <<<
if (isCommander) {
    // --- 1. SADDLE & STRAPS (13th Century Yuan/Song Style) ---
    // Breastplate strap (keeps saddle from sliding back)
    ctx.strokeStyle = "#212121"; 
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-2, hBob - 3); 
    ctx.quadraticCurveTo(-6, hBob + 2, -9, hBob + 5); 
    ctx.stroke();

    // Crupper strap (keeps saddle from sliding forward)
    ctx.beginPath();
    ctx.moveTo(4, hBob - 4);
    ctx.quadraticCurveTo(8, hBob - 2, 12, hBob + 1);
    ctx.stroke();

    // Saddle Pad (Aged felt/leather)
    ctx.fillStyle = "#8d6e63"; 
    ctx.beginPath();
    ctx.ellipse(-1, hBob - 4, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#5d4037"; 
    ctx.lineWidth = 1; 
    ctx.stroke();

    // Wooden/Hard Leather Saddle Frame (High pommel & cantle)
    ctx.fillStyle = "#3e2723"; 
    ctx.beginPath();
    ctx.moveTo(-5, hBob - 5);
    ctx.quadraticCurveTo(-1, hBob - 3, 4, hBob - 5); // Seat dip
    ctx.lineTo(6, hBob - 9);  // Cantle (raised back)
    ctx.lineTo(3, hBob - 4);  // Back skirt
    ctx.lineTo(-4, hBob - 4); // Front skirt
    ctx.lineTo(-7, hBob - 10); // Pommel (raised front)
    ctx.closePath();
    ctx.fill();
    
    // Commander Saddle Trim (Gold/Brass highlights)
    ctx.strokeStyle = "#fbc02d"; 
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-7, hBob - 10); ctx.lineTo(-4, hBob - 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, hBob - 9); ctx.lineTo(3, hBob - 4); ctx.stroke();

    // Girth strap (Under belly)
    ctx.strokeStyle = "#212121"; 
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-2, hBob - 3); ctx.lineTo(-2, hBob + 8); ctx.stroke();


    // --- 2. IRON CHAMFRON (Perfectly mapped to base head polygon) ---
    let hn = headNod; // Shorthand for animation sync
    
    ctx.fillStyle = "#9e9e9e";   // Forged Iron Base
    ctx.strokeStyle = "#424242"; // Dark iron edge definition
    ctx.lineWidth = 1.5;
    
    ctx.beginPath();
    // Start at top of head, just beneath where the natural ears will draw
    ctx.moveTo(-14.5, hBob - 17 + hn); 
    // Down the bridge of the nose
    ctx.lineTo(-24.5, hBob - 11.5 + hn); 
    // Hook around the snout
    ctx.quadraticCurveTo(-26.5, hBob - 8 + hn, -24, hBob - 6 + hn); 
    // Back along the jawline
    ctx.lineTo(-18, hBob - 4 + hn); 
    // Curve up the cheek to the back of the skull
    ctx.quadraticCurveTo(-14, hBob - 5 + hn, -13, hBob - 14 + hn); 
    ctx.closePath();
    ctx.fill(); 
    ctx.stroke();

    // --- 3. HELMET DETAILING (Based on historical references) ---
    ctx.strokeStyle = "#fbc02d"; // Brass/Gold ceremonial trim
    ctx.lineWidth = 1;
    
    // Central reinforced ridge down the nose
    ctx.beginPath(); 
    ctx.moveTo(-17, hBob - 16 + hn); 
    ctx.lineTo(-24, hBob - 10 + hn); 
    ctx.stroke();

    // Flared brow guard over the eye (Protective ridge)
    ctx.fillStyle = "#757575"; 
    ctx.beginPath();
    ctx.arc(-19, hBob - 10 + hn, 2.5, Math.PI, 0); // Arch resting above the eye
    ctx.fill(); 
    
    ctx.strokeStyle = "#fbc02d";
    ctx.beginPath();
    ctx.arc(-19, hBob - 10 + hn, 2.5, Math.PI, 0); 
    ctx.stroke();

    // Darkened cutout for the eye socket
    // (The base script will draw the black pupil inside this at (-19, -10) right after)
    ctx.fillStyle = "#212121";
    ctx.beginPath();
    ctx.arc(-19, hBob - 10 + hn, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Red Ceremonial Forehead Plume/Tassel
    ctx.fillStyle = "#d32f2f";
    ctx.beginPath();
    ctx.moveTo(-16.5, hBob - 15 + hn); // Anchor on upper forehead
    ctx.quadraticCurveTo(-18, hBob - 18 + hn, -14, hBob - 19 + hn); // Sweep up and back
    ctx.quadraticCurveTo(-15, hBob - 16 + hn, -16.5, hBob - 15 + hn); // Return to anchor
    ctx.fill();
    ctx.strokeStyle = "#b71c1c";
    ctx.lineWidth = 0.5;
    ctx.stroke();
}
// >>> END SURGERY <<<
		
		
        // Mane & Eye
        ctx.strokeStyle = "#212121"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-8, hBob - 7 + (headNod*0.5)); 
        ctx.quadraticCurveTo(-11, hBob - 13 + headNod, -14, hBob - 16 + headNod); ctx.stroke();
        
        ctx.fillStyle = "#111"; ctx.beginPath(); 
        ctx.arc(-19, hBob - 10 + headNod, 1.2, 0, Math.PI*2); ctx.fill();

        // Ears
        ctx.fillStyle = bodyColor; ctx.beginPath();
        ctx.moveTo(-13, hBob - 16 + headNod); ctx.lineTo(-13, hBob - 20 + headNod); 
        ctx.lineTo(-15, hBob - 17 + headNod); ctx.fill(); ctx.stroke();

        // --- Z-ORDER 4: NEAR LEGS ---
        drawMuscularLeg(false, true, 0);               
        drawMuscularLeg(true, true, -Math.PI / 2);     
    }
// ==========================================
// 3. RIDER BODY & ARMOR
// ==========================================
// >>> ADD THESE 4 LINES HERE <<<
 if (isElephant) {
    ctx.restore(); // Clean up the stack before leaving!
    return;
}

ctx.save();
    let isCamelCannon = (type === "camel_cannon" || (unitName && unitName.toLowerCase().includes("camel cannon")));

// --- 2. THE RIDER TRANSLATION ---
// We combine the base animal height + animation bob + the massive elephant offset
ctx.translate(-1, baseMountHeight + bob + riderBob + riderHeightOffset);
if (!isElephant && !isCamelCannon) {
    // Base Faction Tunic
    ctx.fillStyle = factionColor; ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.lineTo(2, -9); ctx.lineTo(-2, -9);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    }

ctx.restore();

// RIDER ARMOR LAYERS
    
    // >>> BEGIN SURGERY: COMMANDER ARMOR OVERRIDE <<<
    if (isCommander && !isCamelCannon) {
        
  // 1. Flowing Crimson Silk Cape (Animated in the wind)
let capeFlap = isMoving ? Math.sin(animFrame * 1.5) * 3 : Math.sin(animFrame * 0.5) * 1;
ctx.fillStyle = "#d32f2f"; 
ctx.strokeStyle = "#b71c1c";
ctx.beginPath();
ctx.moveTo(3, -8);
ctx.quadraticCurveTo(10 + capeFlap, -4, 14 + capeFlap, 2);
ctx.lineTo(8 + capeFlap * 0.5, 4);
ctx.lineTo(2, -2);
ctx.fill();
ctx.stroke();
        
        // 2. Gold Mountain-Pattern Lamellar Vest
        ctx.fillStyle = "#ffca28"; 
        ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-3.5, -1); ctx.lineTo(3.5, -1); ctx.lineTo(2.5, -9); ctx.lineTo(-2.5, -9); ctx.closePath(); ctx.fill(); ctx.stroke();
        
        // Detailed pattern stitching
        ctx.strokeStyle = "#d84315"; ctx.lineWidth = 0.5;
        for(let i = -8; i <= -1; i+=1.5) { 
            for(let j = -2; j <= 2; j+=1.5) { ctx.strokeRect(j, i, 1.5, 1.5); }
        }

        // 3. Golden Beast-Head Pauldrons
        ctx.fillStyle = "#ffca28"; ctx.strokeStyle = "#4e342e"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(-5.5, -8, 2.5, 0, Math.PI*2); ctx.fill(); ctx.stroke(); 
        ctx.beginPath(); ctx.arc(3.5, -8, 2.5, 0, Math.PI*2); ctx.fill(); ctx.stroke(); 
        ctx.fillStyle = "#b71c1c"; // Ruby eyes in the pauldrons
        ctx.fillRect(-6, -8, 1, 1); ctx.fillRect(3, -8, 1, 1);

        // 4. Blue Silk Commander's Sash & Armored Skirt
        ctx.fillStyle = "#1976d2"; 
        ctx.fillRect(-4, -2, 8, 2.5);
        ctx.fillStyle = "#d32f2f"; // Cloth underskirt
        ctx.beginPath(); ctx.moveTo(-2.5, 0); ctx.lineTo(3.5, 0); ctx.lineTo(4, 6); ctx.lineTo(-1, 6); ctx.fill();
        ctx.fillStyle = "#ffca28"; // Gold thigh plates
        ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(3, 0); ctx.lineTo(3, 4); ctx.lineTo(-1, 4); ctx.fill();
        ctx.strokeStyle = "#d84315"; for(let i = 0; i <= 4; i+=1.5) { ctx.beginPath(); ctx.moveTo(-1, i); ctx.lineTo(3, i); ctx.stroke(); }
        
    } else if ((unitName.includes("Elite") || armorVal >= 40) && !isCamelCannon) {
    // >>> END SURGERY <<< (Keep the rest of your Elite armor logic below this)
        // --- ELITE / SUPER HEAVY TIER ---
        // 1. Shield on Back
        ctx.fillStyle = factionColor; ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(-4, -4.5, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#9e9e9e"; ctx.beginPath(); ctx.arc(-4, -4.5, 1.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); // Shield Boss

        // 2. Leg Armor (Steel Chausses)
        ctx.fillStyle = "#9e9e9e";
        ctx.beginPath(); ctx.moveTo(-2.5, 0); ctx.lineTo(3.5, 0); ctx.lineTo(4, 6); ctx.lineTo(-1, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.lineWidth = 0.5;
        for(let i = 1; i <= 5; i+=1.2) { // Dense leg weave
            ctx.beginPath(); ctx.moveTo(-1.5 + (i*0.1), i); ctx.lineTo(3.5 - (i*0.1), i); ctx.stroke();
        }

        // 3. Denser Steel Vest (Lamellar/Mail Crosshatch)
        ctx.fillStyle = "#9e9e9e"; ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-3.5, -1); ctx.lineTo(3.5, -1); ctx.lineTo(2.5, -9); ctx.lineTo(-2.5, -9);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        
        ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 0.5;
        for(let i = -8; i <= -1; i+=1.2) { // Dense Horizontal
            ctx.beginPath(); ctx.moveTo(-3, i); ctx.lineTo(3, i); ctx.stroke();
        }
        for(let i = -2.5; i <= 2.5; i+=1.2) { // Dense Vertical
            ctx.beginPath(); ctx.moveTo(i, -8); ctx.lineTo(i, -1); ctx.stroke();
        }
        
        // 4. Heavy Steel Pauldrons
        ctx.fillStyle = "#9e9e9e"; ctx.lineWidth = 1; ctx.strokeStyle = "#1a1a1a";
        ctx.fillRect(-6.5, -9.5, 3.5, 4.5); ctx.strokeRect(-6.5, -9.5, 3.5, 4.5); // Left
        ctx.fillRect(3, -9.5, 3.5, 4.5); ctx.strokeRect(3, -9.5, 3.5, 4.5);       // Right
        ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 0.5;
        for(let i = -8; i <= -6; i+=1.2) {
            ctx.beginPath(); ctx.moveTo(-6.5, i); ctx.lineTo(-3, i); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(3, i); ctx.lineTo(6.5, i); ctx.stroke();
        }

    } else if (armorVal >= 25) {
        // HEAVY TIER: Steel Vest + SQUARE Pauldrons
        ctx.fillStyle = "#9e9e9e";
        ctx.beginPath(); ctx.moveTo(-3, -1); ctx.lineTo(3, -1); ctx.lineTo(2, -8); ctx.lineTo(-2, -8);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        
        ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 0.5;
        for(let i = -7; i < -1; i+=2.5) {
            ctx.beginPath(); ctx.moveTo(-3, i); ctx.lineTo(3, i); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-1.5, i); ctx.lineTo(-1.5, i+2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(1.5, i); ctx.lineTo(1.5, i+2); ctx.stroke();
        }
        
        // Square Pauldrons for Cavalry Rider — crimson if Japanese scenario player unit
        ctx.fillStyle = isJapan ? "#c2185b" : factionColor; 
        ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1;
        ctx.fillRect(-5.5, -8.5, 2.5, 3.5); ctx.strokeRect(-5.5, -8.5, 2.5, 3.5); // Left
        ctx.fillRect(3, -8.5, 2.5, 3.5); ctx.strokeRect(3, -8.5, 2.5, 3.5);       // Right
        
        // Small lines on pauldrons
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath(); ctx.moveTo(-5.5, -6.5); ctx.lineTo(-3, -6.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(3, -6.5); ctx.lineTo(5.5, -6.5); ctx.stroke();

    } else if (armorVal >= 8) {
        // --- MEDIUM TIER: Smooth Vest + FACTION PAULDRONS ---
        ctx.fillStyle = "#5d4037"; 
        ctx.beginPath(); ctx.moveTo(-3, -1); ctx.lineTo(3, -1); ctx.lineTo(2, -8); ctx.lineTo(-2, -8);
        ctx.closePath(); ctx.fill(); ctx.stroke();

        // Square Pauldrons for Medium Rider — crimson if Japanese scenario player unit
        ctx.fillStyle = isJapan ? "#c2185b" : factionColor; 
        ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1;
        ctx.fillRect(-5, -8, 2, 3); ctx.strokeRect(-5, -8, 2, 3); // Left
        ctx.fillRect(3, -8, 2, 3); ctx.strokeRect(3, -8, 2, 3);   // Right
    }
      if (!isCamelCannon) {  
    // Rider Head Base
    ctx.fillStyle = "#d4b886";
    ctx.beginPath(); ctx.arc(0, -11, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
	  }
 
// RIDER HEADGEAR// >>> BEGIN SURGERY: REALISTIC COMMANDER HELMETS <<<
if (isCommander) {
    // Shared animation logic for plumes/tassels
    let plumeBob = isMoving ? Math.sin(animFrame * 1.5) * 2.5 : Math.sin(animFrame * 0.5) * 0.5;

    // Shared Base: Exposed Hero Face (No Mask)
    ctx.fillStyle = "#e0aca0"; // Muted, realistic skin tone
    ctx.beginPath(); ctx.moveTo(-2.5, -12); ctx.lineTo(2.5, -12); ctx.lineTo(2.5, -8); ctx.lineTo(-2.5, -8); ctx.fill();

    let cmdColor = (factionColor || "").toLowerCase();
    // Scenario 1 (Hakata Bay): player commanders wear the Yamato Kabuto regardless of faction.
    if (isJapan) cmdColor = "#c2185b";

    // Reusable subtle shadow for depth instead of cartoon outlines
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; 
    ctx.lineWidth = 0.5;

    switch(cmdColor) {
        case "#ffffff": // Player's Kingdom
            // Modest Clan Leader: Worn iron helmet, red feather
            ctx.fillStyle = "#546e7a"; // Muted, oxidized steel
            ctx.beginPath(); ctx.arc(0, -13, 4, Math.PI, 0); ctx.fill(); ctx.stroke();

            // Dull iron neck guard
            ctx.fillStyle = "#37474f"; 
            ctx.beginPath(); ctx.moveTo(-4, -13); ctx.lineTo(-5.5, -8); ctx.lineTo(5.5, -8); ctx.lineTo(4, -13); ctx.fill();
            
            // Single modest red feather
            ctx.strokeStyle = "rgba(183, 28, 28, 0.9)"; // Deep natural red
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, -17); ctx.quadraticCurveTo(3, -22 + plumeBob, 5, -16 + plumeBob); ctx.stroke();
            
            // Iron finial
            ctx.fillStyle = "#263238"; ctx.fillRect(-0.5, -18, 1, 5);
            break;

        case "#d32f2f": // Hong Dynasty
            // Ming/Song style High Dome with Lingzi (Pheasant tail)
            ctx.strokeStyle = "rgba(212, 175, 55, 0.8)"; // Muted, natural gold/yellow feather
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, -18); ctx.quadraticCurveTo(15, -25 + plumeBob, 22, -8 + plumeBob); ctx.stroke();
            
            ctx.strokeStyle = "rgba(183, 28, 28, 0.85)"; // Muted red feather
            ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(0, -18); ctx.quadraticCurveTo(12, -22 + plumeBob, 18, -10 + plumeBob); ctx.stroke();

            // Muted Brass/Gold Dome
            ctx.fillStyle = "#bfa15f"; 
            ctx.beginPath(); ctx.arc(0, -13, 3.5, Math.PI, 0);
            ctx.lineTo(4, -12); ctx.quadraticCurveTo(0, -11, -4, -12);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            
            // Elite Iron Neck Guard with subtle layering
            ctx.fillStyle = "#607d8b"; 
            ctx.beginPath(); ctx.moveTo(-3.5, -13); ctx.lineTo(-6, -7); ctx.quadraticCurveTo(0, -5, 6, -7); ctx.lineTo(3.5, -13); ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.2)"; 
            for (let i = -11; i < -6; i+=1.5) { ctx.beginPath(); ctx.moveTo(-5, i); ctx.lineTo(5, i); ctx.stroke(); }
            break;

        case "#1976d2": // Great Khaganate
            // Steppe Iron Bowl with Yak/Wolf Fur Trim
            ctx.fillStyle = "#455a64"; // Dark forged iron
            ctx.beginPath(); ctx.arc(0, -13, 4, Math.PI, 0); ctx.fill(); ctx.stroke();
            
            // Thick Natural Fur Brim
            ctx.fillStyle = "#3e2723"; 
            ctx.beginPath(); ctx.ellipse(0, -12, 4.5, 1.5, 0, 0, Math.PI*2); ctx.fill();
            
            // Trailing Black Horsetail
            ctx.strokeStyle = "rgba(17, 17, 17, 0.9)"; 
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(0, -17); ctx.quadraticCurveTo(-6, -14 + plumeBob, -8, -6 + (plumeBob * 1.5)); ctx.stroke();
            
            // Worn Brass Spiked Finial
            ctx.fillStyle = "#a88e52";
            ctx.beginPath(); ctx.moveTo(-1, -17); ctx.lineTo(0, -21); ctx.lineTo(1, -17); ctx.fill();
            break;

        case "#c2185b": // Yamato Clans
            // Heavy Kabuto with Dark Lacquer
            ctx.fillStyle = "#1a1a1a"; // Deep black lacquer
            ctx.beginPath(); ctx.arc(0, -12, 4.5, Math.PI, 0); ctx.fill();
            
            // Shikoro (Neck guard) with realistic natural madder-red silk lacing
            ctx.fillStyle = "#8e0000"; 
            ctx.fillRect(-5.5, -12, 11, 5);
            ctx.fillStyle = "#111"; // Iron plates breaking up the lacing
            ctx.fillRect(-6, -10.5, 12, 0.8); ctx.fillRect(-6.5, -8.5, 13, 0.8);
            
            // Worn Brass Maedate (Horns)
            ctx.strokeStyle = "#c5a059"; 
            ctx.lineWidth = 1.2; ctx.lineCap = "round";
            ctx.beginPath(); ctx.moveTo(0, -14); ctx.quadraticCurveTo(-6, -20, -8, -22); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, -14); ctx.quadraticCurveTo(6, -20, 8, -22); ctx.stroke();
            break;

        case "#fbc02d": // Xiaran Dominion
            // Steel Cap with Ochre Silk Turban Wrap
            ctx.fillStyle = "#78909c"; // Steel
            ctx.beginPath(); ctx.arc(0, -14, 3.5, Math.PI, 0); ctx.fill();
            
            // Natural Yellow/Ochre Dyed Fabric Wrap
            ctx.fillStyle = "#c59b27"; 
            ctx.beginPath(); ctx.ellipse(0, -13, 4.5, 2.2, 0, 0, Math.PI*2); ctx.fill();
            // Wrap texture lines
            ctx.strokeStyle = "rgba(0,0,0,0.2)";
            ctx.beginPath(); ctx.moveTo(-3, -12); ctx.lineTo(3, -14); ctx.stroke();
            
            // Steel Nasal Guard
            ctx.fillStyle = "#78909c"; ctx.fillRect(-0.5, -12, 1, 4.5);
            
            // Trailing Silk (shadowed)
            ctx.fillStyle = "#a37a1c";
            ctx.beginPath(); ctx.moveTo(4, -13); ctx.quadraticCurveTo(8, -8 + plumeBob, 6, -4); ctx.lineTo(3, -12); ctx.fill();
            break;

        case "#455a64": // Jinlord Confederacy
            // Jurchen Heavy Lamellar Steep Cone
            ctx.fillStyle = "#37474f"; // Dark raw iron
            ctx.beginPath(); ctx.moveTo(-3.5, -12); ctx.lineTo(0, -21); ctx.lineTo(3.5, -12); ctx.fill(); ctx.stroke();
            
            // Leather/Iron ear flaps
            ctx.fillStyle = "#263238";
            ctx.fillRect(-4.5, -12, 2.5, 5); ctx.fillRect(2, -12, 2.5, 5);
            
            // Natural red dyed yak hair tassel at top
            ctx.fillStyle = "#8e1e1e";
            ctx.beginPath(); ctx.arc(0, -21, 1.5, 0, Math.PI*2); ctx.fill();
            break;

        case "#388e3c": // Tran Realm
            // Tarnished Bronze Flared Helmet
            ctx.fillStyle = "#795548"; // Oxidized bronze
            ctx.beginPath(); ctx.arc(0, -11, 4.5, Math.PI, 0); ctx.fill(); ctx.stroke();
            
            // Flared flat brim
            ctx.fillStyle = "#5d4037";
            ctx.beginPath(); ctx.ellipse(0, -11, 6.5, 1.2, 0, 0, Math.PI*2); ctx.fill();
            
            // Muted Green natural silk band
            ctx.fillStyle = "#2e7031";
            ctx.fillRect(-3.5, -13.5, 7, 1.5);
            break;

case "#7b1fa2": // Goryun Kingdom (Korean Cheoljeong)
    // Joseon Dynasty General's Helmet (Dujeonggap-tu) - Scaled 80% & Repositioned
    
    // 1. The Padded Neck Guards (Shwi-wi - Moved to sides)
    ctx.fillStyle = "#b71c1c"; 
    // Left Flap
    ctx.beginPath();
    ctx.moveTo(-5, -13); // Shifted out from center
    ctx.quadraticCurveTo(-6.5, -9, -5.5, -5); 
    ctx.lineTo(-2.5, -5);
    ctx.lineTo(-2, -13);
    ctx.fill();

    // Right Flap
    ctx.beginPath();
    ctx.moveTo(2, -13);
    ctx.lineTo(2.5, -5);
    ctx.lineTo(5.5, -5); 
    ctx.quadraticCurveTo(7, -9, 5, -13); // Shifted out to clear face
    ctx.fill();

    // Gold Studs (Dujeong) - Re-aligned to new flap positions
    ctx.fillStyle = "#d4af37";
    const studs = [
        [-5, -11], [-5.3, -9], [-5, -7],  // Left flap studs
        [2.5, -11], [3, -9], [3.5, -7],   // Right flap inner
        [4.5, -11], [5, -9], [5.5, -7]    // Right flap outer
    ];
    studs.forEach(s => {
        ctx.beginPath();
        ctx.arc(s[0], s[1], 0.2, 0, Math.PI * 2);
        ctx.fill();
    });

    // 2. The Main Helmet Bowl (Scaled & Shifted Up)
    ctx.fillStyle = "#1a1a1a"; 
    ctx.beginPath();
    ctx.moveTo(-3.2, -13.8);
    ctx.bezierCurveTo(-3.2, -19.4, -0.8, -21.8, 0, -22.2); 
    ctx.bezierCurveTo(0.8, -21.8, 3.2, -19.4, 3.6, -14.2);
    ctx.lineTo(-3.2, -13.8);
    ctx.fill();

    // 3. The Gold Visor (Mubis)
    ctx.fillStyle = "#d4af37";
    ctx.beginPath();
    ctx.moveTo(1.2, -14.2);
    ctx.lineTo(4, -14.6); 
    ctx.lineTo(3.6, -16.2);
    ctx.quadraticCurveTo(2.4, -15.8, 1.2, -16.2);
    ctx.fill();

    // 4. Gold Dragon/Cloud Ornamentation (Drim)
    ctx.strokeStyle = "#ffcc00";
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    // Central vertical reinforcing band
    ctx.moveTo(0, -14.2);
    ctx.lineTo(0, -22.2);
    ctx.stroke();
    // Side decorative swirls
    ctx.beginPath();
    ctx.arc(1.6, -17, 0.6, 0, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-1.6, -17.8, 0.5, Math.PI, 0);
    ctx.stroke();

    // 5. The Top Ornamentation (Sangmo & Samjichang)
    // Red Tassel (Sangmo)
    ctx.fillStyle = "#d32f2f";
    ctx.beginPath();
    ctx.moveTo(-1, -22.6);
    ctx.quadraticCurveTo(0, -25, 1, -22.6);
    ctx.fill();

    // Gold Finial Base
    ctx.fillStyle = "#d4af37";
    ctx.fillRect(-0.5, -23, 1, 0.8);

    // The Trident/Spear Tip (Samjichang)
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 0.25;
    ctx.beginPath();
    ctx.moveTo(0, -23);
    ctx.lineTo(0, -25.5); // Center spike
    ctx.moveTo(-0.3, -23.8);
    ctx.lineTo(-0.5, -24.6); // Left spike
    ctx.moveTo(0.3, -23.8);
    ctx.lineTo(0.5, -24.6); // Right spike
    ctx.stroke();

    // 6. Inner Lining
    ctx.fillStyle = "#2e7d32"; 
    ctx.beginPath();
    ctx.moveTo(-2.8, -13);
    ctx.lineTo(3.2, -13.4);
    ctx.lineTo(3.2, -13.8);
    ctx.lineTo(-2.8, -13.8);
    ctx.fill();
    break;
  
		case "#00838f": // Dali Kingdom - Lamellar General Helmet (UPDATED)

// --- GLOBAL OFFSET (SHIFT UP ~5%) ---
const yOff = -0.75;

// 1. Lamellar Side Flaps (Hanging, segmented — NOT tight nubs anymore)
ctx.fillStyle = "#8d6e63";
ctx.strokeStyle = "rgba(0,0,0,0.25)";
ctx.lineWidth = 0.15;

// Left flap
for (let i = 0; i < 3; i++) {
    let y = -12.8 + i * 1.4 + yOff;
    ctx.beginPath();
    ctx.moveTo(-3.2, y);
    ctx.lineTo(-4.4, y + 0.3);
    ctx.lineTo(-4.0, y + 1.2);
    ctx.lineTo(-2.8, y + 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

// Right flap
for (let i = 0; i < 3; i++) {
    let y = -12.8 + i * 1.4 + yOff;
    ctx.beginPath();
    ctx.moveTo(3.2, y);
    ctx.lineTo(4.4, y + 0.3);
    ctx.lineTo(4.0, y + 1.2);
    ctx.lineTo(2.8, y + 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}


// 2. Main Helmet Bowl (30% shorter + shifted up)
ctx.fillStyle = "#d4af37";
ctx.beginPath();
ctx.arc(0, -14.3 + yOff, 2.45, Math.PI, 0); // radius reduced from 3.5 → ~2.45
ctx.lineTo(2.45, -13.2 + yOff);
ctx.lineTo(-2.45, -13.2 + yOff);
ctx.closePath();
ctx.fill();


// 3. Lamellar Segmentation (scaled to new height)
ctx.strokeStyle = "rgba(0,0,0,0.3)";
ctx.lineWidth = 0.18;
for(let i = -1.8; i <= 1.8; i += 1.1) {
    ctx.beginPath();
    ctx.moveTo(i, -17 + yOff);
    ctx.lineTo(i, -13.2 + yOff);
    ctx.stroke();
}


// 4. Red Forehead Band (adjusted width + position)
ctx.fillStyle = "#c62828";
ctx.fillRect(-2.6, -14.0 + yOff, 5.2, 1.0);


// 5. Top Finial & Plume (compressed vertically)
ctx.fillStyle = "#1a1a1a";
ctx.beginPath();
ctx.moveTo(-0.4, -17 + yOff);
ctx.lineTo(-0.9, -18.0 + yOff);
ctx.lineTo(0.2, -17.8 + yOff);
ctx.lineTo(0.6, -18.3 + yOff);
ctx.lineTo(0.4, -17 + yOff);
ctx.fill();

ctx.fillStyle = "#fbc02d";
ctx.beginPath();
ctx.moveTo(-0.6, -17 + yOff);
ctx.quadraticCurveTo(0, -17.8 + yOff, 0.6, -17 + yOff);
ctx.lineTo(0.4, -16.2 + yOff);
ctx.lineTo(-0.4, -16.2 + yOff);
ctx.closePath();
ctx.fill();


// 6. Chin Tie (UNCHANGED as requested)
ctx.strokeStyle = "#ffffff";
ctx.fillStyle = "#ffffff";
ctx.lineWidth = 0.4;

ctx.beginPath();
ctx.arc(-0.5, -3.5, 0.4, 0, Math.PI * 2); 
ctx.arc(0.5, -3.5, 0.4, 0, Math.PI * 2);  
ctx.fill();

ctx.beginPath();
ctx.moveTo(0, -3.5);
ctx.lineTo(-0.8, -2.5);
ctx.moveTo(0, -3.5);
ctx.lineTo(0.8, -2.5);
ctx.stroke();

break;

        case "#8d6e63": // High Plateau Kingdoms (Tibetan Dbu-rmog)
            // Overlapping Iron Lamellar Bowl
            ctx.fillStyle = "#424242"; // Forged Iron
            ctx.beginPath(); ctx.arc(0, -13, 4, Math.PI, 0); ctx.fill();
            
            // Lamellar vertical striping lines (Subtle highlight/shadow)
            ctx.strokeStyle = "rgba(255,255,255,0.1)"; ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(-1.5, -13); ctx.lineTo(-1.5, -17); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(1.5, -13); ctx.lineTo(1.5, -17); ctx.stroke();

            // Heavy Yak Wool / Felt Ear Flaps
            ctx.fillStyle = "#8d6e63"; // Natural undyed wool brown
            ctx.fillRect(-5, -13, 2, 6); ctx.fillRect(3, -13, 2, 6);
            
            // Central Turquoise Stone
            ctx.fillStyle = "#0097a7";
            ctx.beginPath(); ctx.arc(0, -14, 1, 0, Math.PI*2); ctx.fill();
            
            // Faded Red crowning fringe
            ctx.fillStyle = "#9e2a2b";
            ctx.beginPath(); ctx.arc(0, -17, 2.5, Math.PI, 0); ctx.fill();
            break;

        case "#222222": // Bandits
            // Scavenged, Rusty Iron Cap
            ctx.fillStyle = "#3e3a38"; // Rusty, dirty iron
            ctx.beginPath(); ctx.arc(0, -13, 3.5, Math.PI, 0); ctx.fill();
            
            // Dented Spikes
            ctx.fillStyle = "#545454";
            ctx.beginPath(); ctx.moveTo(-2, -15); ctx.lineTo(-1, -17); ctx.lineTo(0, -15); ctx.fill();
            ctx.beginPath(); ctx.moveTo(2, -15); ctx.lineTo(1, -17); ctx.lineTo(0, -15); ctx.fill();
            
            // Faded Madder-Red Bandana
            ctx.fillStyle = "#7a2020";
            ctx.fillRect(-3.5, -12, 7, 1.5);
            ctx.beginPath(); ctx.moveTo(-3, -11); ctx.quadraticCurveTo(-6, -8 + plumeBob, -7, -4); ctx.lineTo(-2, -10); ctx.fill();
            break;

        default:
            // Fallback (Worn Iron Helm)
            ctx.fillStyle = "#455a64"; 
            ctx.beginPath(); ctx.arc(0, -12, 4, Math.PI, 0); ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#263238"; ctx.fillRect(-0.5, -16, 1, 4);
            break;
    }
}
// >>> END SURGERY <<<
	
	
	else if (unitName.includes("Elite") || armorVal >= 40) {
    // >>> END SURGERY <<< (Keep the rest of your Elite helmet logic below this)
        // --- ELITE CUMAN HELMET WITH STEEL FACE MASK ---
        // Mail Aventail (Neck Guard)
        ctx.fillStyle = "#757575"; ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(-3.5, -13); ctx.lineTo(-4.5, -8); ctx.lineTo(1, -8); ctx.lineTo(1.5, -13); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        for(let i = -12; i <= -9; i+=1.2) { ctx.beginPath(); ctx.moveTo(-4, i); ctx.lineTo(0, i); ctx.stroke(); }

        // Steel Face Mask
        ctx.fillStyle = "#eeeeee"; ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.arc(1, -11, 2.5, -Math.PI/1.5, Math.PI/1.5); ctx.closePath(); ctx.fill(); ctx.stroke();
        // Eye Slit & Nose Ridge
        ctx.fillStyle = "#000000"; ctx.fillRect(1.5, -12, 1.5, 0.8);
        ctx.beginPath(); ctx.moveTo(2.5, -11.2); ctx.lineTo(2.5, -9.5); ctx.stroke();

        // Pointy Cuman Dome
        ctx.fillStyle = "#9e9e9e"; ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-3.5, -13); ctx.lineTo(3.5, -13); 
        ctx.quadraticCurveTo(0, -16, -1, -20); // Pointing slightly back and up
        ctx.closePath(); ctx.fill(); ctx.stroke();
        
        // Helmet Trim
        ctx.strokeStyle = factionColor; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-3.5, -13); ctx.lineTo(3.5, -13); ctx.stroke();

    } else if (armorVal >= 25) {
        // High Tier Heavy Helmets
        if (factionColor === "#c2185b" || isJapan) { 
            // Yamato / Hakata Bay player → Kabuto with gold horn accents
            ctx.fillStyle = "#212121"; ctx.beginPath(); ctx.arc(0, -12, 3.5, Math.PI, 0); ctx.fill();
            ctx.fillRect(-4, -12, 8, 1.5);
            ctx.strokeStyle = "#fbc02d"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(-3, -17); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(3, -17); ctx.stroke();
        } else if (factionColor === "#1976d2" || factionColor === "#455a64") { 
            ctx.fillStyle = "#9e9e9e"; ctx.strokeStyle = "#424242"; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.arc(0, -13, 4, Math.PI, 0); ctx.fill(); ctx.stroke(); 
            ctx.fillStyle = "#616161"; ctx.beginPath(); ctx.moveTo(-1, -16); ctx.lineTo(1, -16); ctx.lineTo(0, -20); ctx.fill();
            ctx.fillStyle = "#4e342e"; ctx.fillRect(-4, -13, 2.5, 4); ctx.fillRect(1.5, -13, 2.5, 4);
} else if (factionColor === "#00838f") {
            // Dali Kingdom (Hmong) -> Elite High-Crested War Helm
            
            // 1. The Heavy Base (Replaces the thin neck guard)
            ctx.fillStyle = "#5d4037"; // Dark lacquered wood/rattan
            ctx.fillRect(-6, -14, 12, 3); // Wider base for the helmet
            
            // 2. The Tiered Crest (The "Heavy" Elite look)
            ctx.fillStyle = "#8d6e63"; // Lighter rattan layer
            ctx.beginPath();
            ctx.moveTo(-5, -14);
            ctx.lineTo(-2, -22); // Tall peak left
            ctx.lineTo(2, -22);  // Tall peak right
            ctx.lineTo(5, -14);
            ctx.fill();

            // 3. Silver Status Ornament (The "Elite" indicator)
            ctx.fillStyle = "#e0e0e0"; 
            // A silver band across the middle of the helmet
            ctx.fillRect(-3, -18, 6, 1.5);
            // A silver "spike" or finial at the very top
            ctx.beginPath();
            ctx.moveTo(-1, -22);
            ctx.lineTo(0, -25);
            ctx.lineTo(1, -22);
            ctx.fill();

            // 4. Side "Wings" (Traditional Dali silhouette)
            ctx.strokeStyle = "#e0e0e0";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-6, -13); ctx.lineTo(-8, -15); // Left wing
            ctx.moveTo(6, -13); ctx.lineTo(8, -15);   // Right wing
            ctx.stroke();
	} else { 
	// --- 1. RED FEATHER PLUME (Raised 1.5px) ---
    ctx.fillStyle = "#d32f2f";
    ctx.beginPath();
    ctx.moveTo(0, -19.5);
    ctx.quadraticCurveTo(-3, -25.5, -5, -23.5);
    ctx.quadraticCurveTo(-1, -22.5, 0, -19.5);
    ctx.quadraticCurveTo(3, -25.5, 5, -23.5);
    ctx.quadraticCurveTo(1, -22.5, 0, -19.5);
    ctx.fill();

    // --- 2. MAIN HELMET DOME (Raised 1.5px) ---
    ctx.fillStyle = "#9e9e9e";
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-5, -13.5);
    ctx.quadraticCurveTo(0, -22.5, 5, -13.5);
    ctx.lineTo(4.5, -12);
    ctx.quadraticCurveTo(0, -11, -4.5, -12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 3. TOP FINIAL SOCKET (Raised 1.5px) ---
    ctx.fillStyle = "#ffd700";
    ctx.beginPath();
    ctx.moveTo(-1.2, -19);
    ctx.lineTo(1.2, -19);
    ctx.lineTo(0.8, -21);
    ctx.lineTo(-0.8, -21);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 4. HEAVY WRAP-AROUND FACE & NECK GUARD ---
    ctx.fillStyle = factionColor;
    ctx.beginPath();
    // Start at the temple
    ctx.moveTo(-5, -13); 
    // Left side down to chin
    ctx.lineTo(-5.5, -6); 
    // The "Chin" - wrapping across the bottom
    ctx.quadraticCurveTo(0, -4.5, 5.5, -6); 
    // Right side up to temple
    ctx.lineTo(5, -13);
    // Eye Slit Top (Lower brow)
    ctx.lineTo(3.5, -11.5);
    ctx.quadraticCurveTo(0, -10.5, -3.5, -11.5); 
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 5. EYE SLIT SHADOW ---
    // Creates the depth inside the mask so the face is barely seen
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.moveTo(-3.5, -11.5);
    ctx.quadraticCurveTo(0, -10.5, 3.5, -11.5);
    ctx.lineTo(3.8, -10);
    ctx.quadraticCurveTo(0, -9, -3.8, -10);
    ctx.closePath();
    ctx.fill();

    // --- 6. ELITE LAMELLAR STITCHING ---
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    // Vertical plates on the face mask
    for(let x = -4; x <= 4; x += 2) {
        if (x === 0) continue; // Keep the center nose-line clean
        ctx.moveTo(x, -9.5); 
        ctx.lineTo(x * 1.1, -5.5);
    }
    // Horizontal row across the jaw
    ctx.moveTo(-5.2, -8); ctx.lineTo(5.2, -8);
    ctx.stroke();

    // --- 7. RED CEREMONIAL TASSELS ---
    ctx.strokeStyle = "#b71c1c";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-4.5, -11); ctx.lineTo(-6.5, -6); 
    ctx.moveTo(4.5, -11);  ctx.lineTo(6.5, -6);
    ctx.stroke();
	}
    } else if (armorVal >= 8) {
        // Medium Tier Light Faction Hats
        if (factionColor === "#c2185b") { 
            ctx.fillStyle = "#212121"; ctx.strokeStyle = "#fbc02d"; ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(-5, -10.5); ctx.lineTo(0, -13.5); ctx.lineTo(5, -10.5);
            ctx.closePath(); ctx.fill(); ctx.stroke();
        } else if (factionColor === "#1976d2" || factionColor === "#455a64") { 
            ctx.fillStyle = "#4e342e"; ctx.beginPath(); ctx.arc(0, -12, 3, Math.PI, 0); ctx.fill();
            ctx.fillStyle = "#795548"; ctx.fillRect(-3.5, -12, 7, 1.5); 
} else if (factionColor === "#00838f") {
// Dali Kingdom (Hmong) -> Light Cavalry Indigo Headwrap
            ctx.fillStyle = "#1a237e";   // Indigo dyed cloth
            ctx.strokeStyle = "#0d47a1"; // Slightly lighter blue for fold definition
            ctx.lineWidth = 0.5;

            // 1. The main horizontal wrap
            // Dropped from -15.5 to -14 to fully close the 20% gap
            ctx.fillRect(-3, -14, 6, 2); 
            
            // 2. The rounded top (The "bun")
            // Center lowered to -14 to sit flush with the base
            ctx.beginPath();
            ctx.arc(0, -14, 2.5, Math.PI, 0);
            ctx.fill();
            ctx.stroke();

            // 3. Simple fold detail 
            // Adjusted coordinates to match the lower position
            ctx.beginPath();
            ctx.moveTo(-2, -15);
            ctx.lineTo(1.5, -15.5);
            ctx.stroke();
        } else {
// --- 1. ROUNDED SKULL CAP (Raised 1.5px) ---
    ctx.fillStyle = "#808080"; 
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    // Y shifted from -12 to -13.5
    ctx.arc(0, -13.5, 4.8, Math.PI, 0); 
    ctx.lineTo(4.8, -12.5); 
    ctx.quadraticCurveTo(0, -12, -4.8, -12.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 2. TOP RIVET (Raised 1.5px) ---
    ctx.fillStyle = "#555555";
    ctx.beginPath();
    // Y shifted from -16.8 to -18.3
    ctx.arc(0, -18.3, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // --- 3. LAMELLAR EAR FLAPS (Raised 1.5px) ---
    ctx.fillStyle = factionColor;
    
    // Left Flap - Now starts higher to show more jawline/cheek
    ctx.beginPath();
    ctx.rect(-5.2, -12.5, 2.2, 3.5); 
    ctx.fill();
    ctx.stroke();

    // Right Flap
    ctx.beginPath();
    ctx.rect(3, -12.5, 2.2, 3.5);  
    ctx.fill();
    ctx.stroke();

    // --- 4. MINIMAL BACK NECK GUARD (Raised 1.5px) ---
    ctx.beginPath();
    ctx.moveTo(-3, -12.5);
    ctx.quadraticCurveTo(0, -11.5, 3, -12.5);
    ctx.lineTo(3, -10.5);
    ctx.quadraticCurveTo(0, -10, -3, -10.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 5. LAMELLAR STITCHING (Raised 1.5px) ---
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 0.5;
    
    // Vertical split on ear flaps
    ctx.beginPath();
    ctx.moveTo(-4.1, -12.5); ctx.lineTo(-4.1, -9);
    ctx.moveTo(4.1, -12.5);  ctx.lineTo(4.1, -9);
    // Horizontal row (Y shifted from -9.2 to -10.7)
    ctx.moveTo(-5.2, -10.7); ctx.lineTo(-3, -10.7);
    ctx.moveTo(3, -10.7);    ctx.lineTo(5.2, -10.7);
    ctx.stroke();
        }
    } 
	else { //camel 
           }
// --- WEAPONS LOGIC ---
    let weaponBob = isAttacking ? Math.sin(frame * 0.8) * 4 : Math.sin(frame * 0.2) * 1;

    if (isFleeing) {
        ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(2, -4); ctx.lineTo(4, -22 + weaponBob); ctx.stroke(); 
        ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#cccccc"; ctx.lineWidth = 0.5;
        let flap = moving ? Math.sin(frame * 1.5) * 3 : 0;
        ctx.beginPath(); ctx.moveTo(4, -21 + weaponBob); 
        ctx.quadraticCurveTo(-4, -22 + weaponBob + flap, -10, -18 + weaponBob); 
        ctx.quadraticCurveTo(-6, -14 + weaponBob - flap, 3, -12 + weaponBob);
        ctx.closePath(); ctx.fill(); ctx.stroke();
    }
else if (type === "horse_archer") {
        
        ctx.save();
        ctx.scale(dir, 1);

        let b = (typeof bob !== 'undefined') ? bob : 0;
        let weaponBob = b; 
        let ammo = (typeof unitAmmo !== 'undefined') ? unitAmmo : 1;

      // --- FETCH ACTUAL COOLDOWN TIMERS ---
        let cd = (typeof cooldown !== 'undefined') ? cooldown : 0;
        
        // Hard-sync with getReloadTime() which returns 170 for ALL Horse Archers (Including Commander)
        let maxCd = 170;
        // --- REVISED ARROW QUIVER ---
        ctx.save();
        ctx.translate(-3, 0 + b); // Pulled in closer to the hip
        ctx.rotate(Math.PI / 6);  // Leans back away from the neck
        
        ctx.fillStyle = "#5d4037"; ctx.fillRect(-3, -4, 6, 11);
        ctx.strokeStyle = "#2b1b17"; ctx.lineWidth = 1; ctx.strokeRect(-3, -4, 6, 11);

        let visibleArrows = Math.max(0, Math.min(3, ammo));
        ctx.fillStyle = "#d32f2f"; 
        for (let i = 0; i < visibleArrows; i++) {
            let offset = -1.5 + (i * 1.5); 
            ctx.fillRect(offset, -6, 1.2, 2.5);
        }
        ctx.restore();

        // --- OUT OF AMMO: Melee Lance Fallback ---
        if (ammo <= 0) {
			 		    
// --- IMPROVED AGGRESSIVE MELEE LOGIC ---
let meleeCycle = isAttacking ? Math.max(0, maxCd - cd) / maxCd : 0;

// Use a power function to make the strike "pop" forward 
// Math.pow(x, 0.3) starts extremely fast and slows down at the end
let snapCycle = Math.sin(Math.pow(meleeCycle, 0.3) * Math.PI);

// Determine if this specific unit is performing a 'Swing' instead of a 'Thrust'
// We use the unit's internal ID (if available) or a coordinate hash to keep it consistent
let unitSeed = (unit && unit.id) ? unit.id : (x + y);
let isSwing = (unitSeed % 3 === 0); // Roughly 33% of units will swing instead of thrust

let thrust = !isSwing ? snapCycle * 14 : snapCycle * 5; // Longer reach for thrusts
let swingAngle = isSwing ? (snapCycle * 1.2) - 0.6 : 0; // Rotational arc for swings

// 1. Draw Stowed Bow (Dynamic by Faction)
ctx.save();
ctx.translate(-5, 0 + b);
ctx.rotate(Math.PI / 6);

// isJapan already declared at top of function

if (isJapan) {
    // Japan: Long asymmetrical Yumi slung on the back
    ctx.strokeStyle = "#1a1a1a"; // Dark black lacquer
    ctx.lineWidth = 2.5;
    ctx.beginPath(); 
    ctx.moveTo(-1, -22); // Extreme top limb
    ctx.quadraticCurveTo(4, -8, 0, 0); 
    ctx.quadraticCurveTo(4, 6, -1, 10);  // Short bottom limb
    ctx.stroke();
    
    // Taut Bowstring
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)"; 
    ctx.lineWidth = 0.6;
    ctx.beginPath(); 
    ctx.moveTo(-1, -22); 
    ctx.lineTo(-1, 10); 
    ctx.stroke();
} else {
    // Standard Nomad: Compact bow stowed inside a leather hip case
    ctx.fillStyle = "#4e342e"; ctx.fillRect(-3, -8, 6, 16);
    ctx.strokeStyle = "#212121"; ctx.lineWidth = 1; ctx.strokeRect(-3, -8, 6, 16);
    ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -8); 
    ctx.quadraticCurveTo(4, -12, -2, -16); ctx.stroke();
}
ctx.restore();

// 2. REVISED: Draw Melee Lance & Hand
ctx.save();
// Apply translation for the "snap" thrust and rotation for the "swing"
ctx.translate(2 + thrust, -4 + b); 
if (isSwing) ctx.rotate(swingAngle); 

// The Lance Shaft
ctx.fillStyle = "#795548"; 
ctx.fillRect(-10, -1, 35, 2); // Slightly longer lance for better visual impact

// The Lance Tip (Steel)
ctx.fillStyle = "#e0e0e0";
ctx.beginPath();
ctx.moveTo(25, -2); ctx.lineTo(33, 0); ctx.lineTo(25, 2); 
ctx.fill();

// The Hand (Placed last to stay on top of the shaft)
ctx.fillStyle = "#ffccbc"; 
ctx.beginPath(); 
ctx.arc(0, 0, 2.5, 0, Math.PI * 2); 
ctx.fill();

ctx.restore();
        } else {
			   
            // --- RANGED COMBAT: Has Ammo ---
            // 1. Draw Stowed Lance
            ctx.save();
            ctx.translate(-2, 4 + b); 
            ctx.rotate(-Math.PI / 12);
            ctx.fillStyle = "#5d4037"; ctx.fillRect(-12, -1, 28, 2);
            ctx.fillStyle = "#bdbdbd"; 
            ctx.beginPath(); ctx.moveTo(16, -1.5); ctx.lineTo(22, 0); ctx.lineTo(16, 1.5); ctx.fill();
            ctx.restore();

// --- 2. ACTIVE ARCHERY ANIMATION (SMOOTH VERSION) ---

// FIX: A unit is "Action Active" as long as the cooldown is counting.
// This prevents the arm from snapping when you start moving.
let isActionActive = (cd > 0); 

// If the timer is running, use it. Otherwise, stay in "Ready" pose (0.9)
let cycle = isActionActive ? Math.max(0, maxCd - cd) / maxCd : 0.9; 

let bowKhatra = 0;
let hasArrow = false;
let handX = 6 + weaponBob; 
let handY = -6 + b; 
let rightHandX = handX, rightHandY = handY;
let stringX = handX - 4; 

// --- ANIMATION STAGES ---
if (cycle < 0.2) {
    // Reaching for quiver
    let reachProgress = cycle / 0.2;
    rightHandX = (handX - 8) + ((-5) - (handX - 8)) * Math.sin(reachProgress * Math.PI / 2);
    rightHandY = handY + ((-2 + b) - handY) * Math.sin(reachProgress * Math.PI / 2);
    hasArrow = false; 
    stringX = handX - 4; 
} else if (cycle < 0.4) {
    // Nocking the arrow
    let nockProgress = (cycle - 0.2) / 0.2;
    rightHandX = -5 + (handX - (-5)) * nockProgress;
    rightHandY = (-2 + b) + (handY - (-2 + b)) * nockProgress;
    hasArrow = true;
    stringX = handX - 4; 
} else if (cycle < 0.95) { 
    // Drawing the string back
    let drawProgress = (cycle - 0.4) / 0.55;
    rightHandX = handX - (drawProgress * 14); 
    rightHandY = handY;
    hasArrow = true;
    stringX = rightHandX; 
} else {
    // Release (The "Pop")
    let releaseProgress = (cycle - 0.95) / 0.05;
    bowKhatra = 0.6 * (1 - releaseProgress); 
    rightHandX = (handX - 14) + (releaseProgress * 6); 
    hasArrow = false; 
    stringX = handX - 4; 
}
// Draw Bow
ctx.save();
ctx.translate(handX, handY); 
ctx.rotate(bowKhatra); 
ctx.translate(-handX, -handY);

// isJapan already declared at top of function

// Asymmetric sizing for Yumi vs Symmetric for Nomad bows
let topTipY = isJapan ? handY - 24 : handY - 8; 
let botTipY = isJapan ? handY + 4  : handY + 8;  
let topDipY = isJapan ? handY - 14 : handY - 4; 
let botDipY = isJapan ? handY - 1  : handY + 8;  

ctx.strokeStyle = isJapan ? "#1a1a1a" : "#3e2723"; // Black lacquer vs Wood/Horn
ctx.lineWidth = isJapan ? 2 : 1.5;

// Draw the bow stave
ctx.beginPath(); 
ctx.moveTo(handX - 4, topTipY); 
ctx.quadraticCurveTo(handX + 6, topDipY, handX, handY); // Upper limb
ctx.quadraticCurveTo(handX + 6, botDipY, handX - 4, botTipY); // Lower limb
ctx.stroke();

// Yumi specific rattan grip wrap (Drawn over the stave)
if (isJapan) {
    ctx.strokeStyle = "#e0e0e0"; 
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(handX - 1, handY - 1.5);
    ctx.lineTo(handX - 1, handY + 1.5);
    ctx.stroke();
}

// Draw the taut bowstring attached to the dynamic tips
ctx.strokeStyle = "rgba(255, 255, 255, 0.6)"; 
ctx.lineWidth = 0.5;
ctx.beginPath(); 
ctx.moveTo(handX - 4, topTipY); 
ctx.lineTo(stringX, rightHandY); 
ctx.lineTo(handX - 4, botTipY); 
ctx.stroke();

ctx.restore();
            // Draw Arrow (Only renders if hasArrow is true, which is fixed to start at 0.2)
            if (hasArrow) {
                ctx.save();
                ctx.translate(rightHandX, rightHandY); 
                if (cycle >= 0.2 && cycle < 0.4) {
                    // Smoothly rotates the arrow into nocking position
                    let nockProgress = (cycle - 0.2) / 0.2;
                    ctx.rotate((-Math.PI / 4) * (1 - nockProgress));
                }
                ctx.fillStyle = "#8d6e63"; ctx.fillRect(-4, -0.5, 16, 1); 
                ctx.fillStyle = "#9e9e9e"; ctx.fillRect(12, -1.5, 3, 3); 
                ctx.fillStyle = "#d32f2f"; 
                ctx.fillRect(-3, -1.5, 4, 1); ctx.fillRect(-3, 0.5, 4, 1); 
                ctx.restore();
            }

            // Draw Right Hand
            ctx.fillStyle = "#ffccbc"; 
            ctx.beginPath(); ctx.arc(rightHandX, rightHandY, 2, 0, Math.PI * 2); ctx.fill();
        }
        
        ctx.restore();
    }
// Triggers for camels, the specific Zamburak role, or units equipped with Hand Cannons
// --- CAMEL CANNON / ZAMBURAK LOGIC ---
// --- CAMEL CANNON / ZAMBURAK LOGIC ---
else if (
    type === "MOUNTED_GUNNER" || 
    type === "camel_cannon" ||
    (unitName && unitName.toLowerCase().includes("camel cannon"))
) {
    let b = (typeof bob !== 'undefined') ? bob : 0;
    let reducedBob = b * 0.1; 
    let ammo = (typeof unitAmmo !== 'undefined') ? unitAmmo : 1;
    let cd = (typeof cooldown !== 'undefined') ? cooldown : 0;
    let maxCd = (typeof unit !== 'undefined' && unit.stats && unit.stats.cooldown) ? unit.stats.cooldown : 1000; 
    
    // Unified cycle logic for flicker-free movement
    let cycle = isAttacking ? Math.max(0, maxCd - cd) / maxCd : 1.0;

    // ==========================================
    // 1. DRAW RIDER
    // ==========================================
    ctx.save();
    ctx.translate(2.0, reducedBob + 11.0); 
    ctx.scale(1.275, 1.275); 
    
    ctx.strokeStyle = "#1a1a1a"; 
    ctx.lineJoin = "round";

    // Legs
   // Old line: let gLegSwing = Math.sin(animFrame * 0.4) * 2;
let gLegSwing = moving ? Math.sin(animFrame * 0.4) * 2 : 0;
    ctx.strokeStyle = "#3e2723"; 
    ctx.lineWidth = 1.8; 
    ctx.beginPath();
    ctx.moveTo(-1.5, -1); ctx.lineTo(-3 + gLegSwing, 6); 
    ctx.moveTo(1.5, -1); ctx.lineTo(3 - gLegSwing, 6);
    ctx.stroke();

    // Body (Thobe)
    ctx.fillStyle = factionColor;
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = "#1a1a1a";
    ctx.beginPath(); ctx.rect(-3.5, -8, 7, 8.5); ctx.fill(); ctx.stroke();

    // Head & Keffiyeh
    ctx.fillStyle = "#ffccbc"; 
    ctx.beginPath(); ctx.arc(0, -10.5, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = factionColor;
    ctx.strokeStyle = "#212121"; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-3.5, -12); ctx.lineTo(3.5, -12); ctx.stroke();

    ctx.restore();

    // ==========================================
    // 2. COMBAT LOGIC (Ranged vs Melee)
    // ==========================================
    if (ammo <= 0) {
        // --- MODE A: SWORD COMBAT (CANNON STOWED) ---
        
        // 1. Draw Cannon stowed on back (Inside Rider space)
        ctx.save();
        ctx.translate(-1, reducedBob + 6); // Position on rider's back
        ctx.rotate(Math.PI / 4); // Slanted across back
        ctx.fillStyle = "#4e342e"; ctx.fillRect(-4, -1, 8, 2); // Stock
        ctx.fillStyle = "#424242"; ctx.fillRect(2, -1.5, 12, 3); // Barrel
        ctx.restore();

        // 2. Shortsword Animation Logic
        var meleeCycle = cycle; 
        var swingAngle = -Math.PI / 2; // Ready position
        var handX = 4, handY = 8;

        if (isAttacking) {
            if (meleeCycle < 0.2) { 
                // Wind up
                swingAngle = -Math.PI / 1.2; 
            } else if (meleeCycle < 0.5) { 
                // Swing down
                var p = (meleeCycle - 0.2) / 0.3;
                swingAngle = -Math.PI / 1.2 + (Math.PI * 1.5 * p);
                handX = 4 + (p * 6);
            } else { 
                // Recover
                var p = (meleeCycle - 0.5) / 0.5;
                swingAngle = Math.PI * 0.3 - (Math.PI * 0.8 * p);
                handX = 10 - (p * 6);
            }
        }
		else{}

        // 3. Render Shortsword
        ctx.save();
        ctx.translate(handX, handY + reducedBob);
        ctx.rotate(swingAngle);
        
        // Blade
        ctx.fillStyle = "#cfd8dc"; // Steel
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(12, -1);
        ctx.lineTo(14, 0); // Point
        ctx.lineTo(12, 1);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#90a4ae";
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Crossguard & Hilt
        ctx.fillStyle = "#ffca28"; // Gold/Brass
        ctx.fillRect(-1, -3, 2, 6); // Guard
        ctx.fillStyle = "#4e342e"; 
        ctx.fillRect(-4, -1, 4, 2); // Handle
        
        // Hand
        ctx.fillStyle = "#ffccbc";
        ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, Math.PI * 2); ctx.fill();
        
        ctx.restore();

 
} else {
    // --- MODE B: RANGED CANNON (SURGERY FIX REPLICATED) ---
    
    // 1. Unified Timing Logic (Matches Hand Cannoner success)
    let maxCd = 300; 
    let cd = (typeof cooldown !== 'undefined') ? cooldown : 0;
    let cycle = isAttacking ? Math.max(0, maxCd - cd) / maxCd : 1.0;

    // 2. Recuperation & Positioning
    // Recoil kicks back hard during the first 15% of the cycle
    let recoil = (isAttacking && cycle < 0.15) ? Math.sin((cycle / 0.15) * Math.PI) * 5 : 0;
    
    let gunAngle = -Math.PI / 30; 
    let gunY = 0;
    // Tilt up for swabbing/loading phases
    if (isAttacking && cycle > 0.15 && cycle < 0.95) { 
        gunAngle = Math.PI / 20; 
        gunY = 1.0; 
    }

    ctx.save();
    // Offset for the camel's back and apply bobbing
    ctx.translate(8.0 + recoil, gunY + (reducedBob || 0) + 8); 
    ctx.rotate(gunAngle); 

// --- CHINESE WHEELBARROW WAGON CHASSIS ---
    ctx.save();
    // Lower the cart slightly relative to the gun so it sits underneath
    ctx.translate(0, 3);
    
    // 1. Wooden Frame/Handles
    ctx.fillStyle = "#5d4037"; ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-10, 0); // Back handles held by the rider
    ctx.lineTo(16, 0);  // Front bed
    ctx.lineTo(16, 3);
    ctx.lineTo(-10, 3);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // 2. Wheel Strut / Axle Mount
    ctx.fillRect(6, 3, 4, 8);
    ctx.strokeRect(6, 3, 4, 8);

    // 3. The Central Wheel
    let wheelRot = moving ? animFrame * 0.4 : 0;
    ctx.save();
    ctx.translate(8, 12); // Center of the wheel
    ctx.rotate(wheelRot);
    
    // Outer rim
    ctx.fillStyle = "#4e342e"; ctx.strokeStyle = "#212121"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    
    // Spokes
    ctx.strokeStyle = "#212121"; ctx.lineWidth = 1;
    for (let w = 0; w < 4; w++) {
        ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke();
        ctx.rotate(Math.PI / 4);
    }
    ctx.restore(); // Restore wheel rotation
    ctx.restore(); // Restore cart translation
	
	
    ctx.fillStyle = "#424242"; ctx.strokeStyle = "#212121"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(2, -2); ctx.lineTo(20, -1.5); ctx.lineTo(20, 2.5); ctx.lineTo(2, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#616161"; ctx.fillRect(20, -2.5, 3, 6); // Muzzle ring

    // Support hand holding the stock
    ctx.fillStyle = "#ffccbc"; ctx.beginPath(); ctx.arc(10, 2, 2, 0, Math.PI*2); ctx.fill();

    // ==========================================
    // 1. REPLICATED MUZZLE FLASH & CLOUD
    // ==========================================
    // Triggering via CD check (like the infantry) ensures it never skips frames
    if (isAttacking && cd > 270) { 
        // CORE FLASH
        ctx.fillStyle = "#fff176"; ctx.beginPath(); 
        ctx.arc(23, 0.5, 3 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
        
        // OUTER FLASH
        ctx.fillStyle = "#ff5722"; ctx.beginPath(); 
        ctx.arc(25, 0.5, 5 + Math.random() * 3, 0, Math.PI * 2); ctx.fill();
        
        // THE SMOKE CLOUD
        ctx.fillStyle = "rgba(180, 180, 180, 0.7)"; 
        ctx.beginPath(); 
        ctx.arc(30, -2, 7 + Math.random() * 4, 0, Math.PI * 2); // Main puff
        ctx.arc(35, 1, 5 + Math.random() * 4, 0, Math.PI * 2);  // Forward puff
        ctx.fill();
    }
    // ==========================================
    // 2. RELOAD SEQUENCE (SWAB -> BALL -> RAM)
    // ==========================================
    else if (isAttacking && cycle < 0.55) { 
        let p = (cycle - 0.15) / 0.40; 
        let depth = Math.sin(p * Math.PI) * 15;
        ctx.strokeStyle = "#546e7a"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(23 - depth, 0.5); ctx.lineTo(33 - depth, 0.5); ctx.stroke();
    }
    else if (isAttacking && cycle < 0.65) { 
        ctx.fillStyle = "#212121"; 
        ctx.beginPath(); ctx.arc(22, -1 + Math.sin(cycle*40)*2, 2, 0, Math.PI*2); ctx.fill();
    } 
    else if (isAttacking && cycle < 0.90) { 
        let p = (cycle - 0.65) / 0.25;
        let depth = Math.sin(p * Math.PI) * 18; 
        ctx.strokeStyle = "#cfd8dc"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(23 - depth, 0.5); ctx.lineTo(35 - depth, 0.5); ctx.stroke();
    }
    else if (isAttacking && cycle < 0.99) { 
        let matchDip = Math.sin((cycle - 0.90) * 15) * 4;
        ctx.strokeStyle = "#ff5722"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(4, -7 + matchDip); ctx.lineTo(4, -2); ctx.stroke();
    }

    ctx.restore();
}}
 else {
 

        // --- MELEE LANCE ---
        let b = bob || 0; // Ensure 'b' (bob) from the top of drawCavalryUnit is used
        let meleeTime = Date.now() / 600; 
        let cycle = isAttacking ? meleeTime % 1.0 : 0;
        
        let lanceRot = 0;
        let thrustX = 0;
        let thrustY = 0;

        if (isAttacking) {
            // 3-Hit Combo System
            if (cycle < 0.33) {
                let p = cycle / 0.33;
                lanceRot = -Math.PI / 4 * Math.sin(p * Math.PI); 
            } else if (cycle < 0.66) {
                let p = (cycle - 0.33) / 0.33;
                lanceRot = Math.PI / 3 * Math.sin(p * Math.PI); 
            } else {
                let p = (cycle - 0.66) / 0.34;
                thrustX = Math.sin(p * Math.PI) * 18; 
                thrustY = Math.sin(p * Math.PI) * 3;
            }
        }

        // --- RENDER LANCE ---
        ctx.save();
        ctx.translate(2, -4 + b); 
        ctx.rotate(lanceRot);

        // Draw Lance Shaft
        ctx.strokeStyle = "#4e342e"; 
        ctx.lineWidth = 2.5; 
        ctx.beginPath(); 
        ctx.moveTo(-6 + thrustX, 0 + thrustY); 
        ctx.lineTo(26 + thrustX, 0 + thrustY); 
        ctx.stroke();
        
        // Hand
        ctx.fillStyle = "#ffccbc";
        ctx.beginPath();
        ctx.arc(thrustX, thrustY, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Draw Lance Tip
        ctx.fillStyle = "#bdbdbd"; 
        ctx.beginPath(); 
        ctx.moveTo(26 + thrustX, -2 + thrustY); 
        ctx.lineTo(38 + thrustX, 0 + thrustY); 
        ctx.lineTo(26 + thrustX, 2 + thrustY); 
        ctx.fill();

        // Highlight
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(26 + thrustX, 0 + thrustY);
        ctx.lineTo(37 + thrustX, 0 + thrustY);
        ctx.stroke();

		ctx.restore(); // 1. Restores the Melee Lance rotation
    } // Closes the final 'else' weapon block

    ctx.restore(); // 2. Restores the Rider's 'bob' and elevation layer 

}