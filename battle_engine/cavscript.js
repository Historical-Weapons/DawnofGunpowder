// =========================================================================
// SURGERY: 4-DIRECTIONAL CENTROID-BASED AIM LOCK
// Exact mirror of infscript.js's _computeCentroidLock (used there by the
// Repeater Crossbowman and Rocket cart) — deliberate 1:1 port, per the
// same convention already used for this file's cannon lock. Looks at
// where the ENEMY SIDE's units currently are ON AVERAGE (their centroid)
// and locks toward whichever axis (X or Y) has the bigger gap: far apart
// vertically -> lock up/down; far apart horizontally -> stay in the
// normal side view, but pointed (via unit.facingDir, see call site) at
// the correct side. Replaces the earlier battleSpawnAssignment.forward-
// based guess, which only ever picked up/down — per direct request,
// corner spawns can now put both armies side-by-side (east/west)
// instead of north/south, so a vertical-only lock could aim at empty
// sky in that layout.
// =========================================================================
function _computeCentroidLock(unit, side) {
    let fallbackUp = (side === "player");
    if (window.battleSpawnAssignment && window.battleSpawnAssignment[side]) {
        fallbackUp = window.battleSpawnAssignment[side].forward.y < 0;
    }
    if (!unit || typeof unit.x !== 'number' || typeof unit.y !== 'number' ||
        typeof battleEnvironment === 'undefined' || !battleEnvironment.units) {
        return { axis: 'y', dir: fallbackUp ? -1 : 1 };
    }
    const enemySide = (side === "player") ? "enemy" : "player";
    let sumX = 0, sumY = 0, n = 0;
    for (let i = 0; i < battleEnvironment.units.length; i++) {
        const u = battleEnvironment.units[i];
        if (u.side === enemySide && u.hp > 0) { sumX += u.x; sumY += u.y; n++; }
    }
    if (n === 0) return { axis: 'y', dir: fallbackUp ? -1 : 1 };
    const deltaX = (sumX / n) - unit.x;
    const deltaY = (sumY / n) - unit.y;
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
        return { axis: 'x', dir: deltaX < 0 ? -1 : 1 }; // -1 = west/left, 1 = east/right
    }
    return { axis: 'y', dir: deltaY < 0 ? -1 : 1 }; // -1 = up (north), 1 = down (south)
}

function drawCavalryUnit(ctx, x, y, moving, frame, factionColor, isAttacking, type, side, unitName, isFleeing, cooldown, unitAmmo, unit, reloadProgress) {
	// VERTICAL FACING STATUS
//
// facingDirY:
//   1  = facing down (toward camera)
//  -1  = facing up/back
//   0  = side view
//
// DONE (facingDirY===1):
// - Mounted lancer melee lance.
// - Horse archer melee lance fallback.
// - Camel cannon sword mode.
// - Horse archer bow animation.
// - Camel cannon ranged mode (custom front-facing layout, not rotation).
//
// DONE (facingDirY===-1):
// - Back-facing rider art for all armor tiers.
//
// NOT DONE:
// - Horse/camel/elephant bodies still only use side-view sprites.
//   Up/down mount poses remain a future feature.
//
// NOTES:
// - Most weapon conversions only change pivot/rotation/translation.
// - Camel cannon is the only full redraw/re-layout.
// - Body armor required no back-view changes.
// - Visuals have not been tested in-game.

	
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
    // Computed early (mirrors the later isCamelCannon check near
    // drawRiderBody) so the mount-body branch selection below can use
    // it: the camel gunner's ("Zamburak") camel keeps full directional
    // (side + up/down) rendering, but every OTHER camel is simplified
    // to side-profile-only per direct instruction — see the branch
    // selection right before "DEDICATED CAMEL BLOCK" below.
    // ROBUST DETECTION: primary check is the "camel_cannon" type string
    // (what every caller should pass), with the old "camel cannon" name
    // substring kept as a legacy fallback, PLUS a role-based fallback —
    // ROLES.MOUNTED_GUNNER ("mounted_gunner") is unique to this unit in
    // troop_system.js. This third check means this file no longer relies
    // entirely on upstream callers getting the type/name string right:
    // it's now a genuine self-contained special case for the artillery
    // unit, immune to future renames of its key or display name.
    const isCamelCannonType = type === "camel_cannon"
        || (unitName && unitName.toLowerCase().includes("camel cannon"))
        || (unit && unit.stats && unit.stats.role === "mounted_gunner");
  
	
    if (unitName === "PLAYER" || unitName === "Commander") armorVal = Math.max(armorVal, 10);

    // Scenario 1 (Hakata Bay): player-side units use Japanese visuals regardless of factionColor.
    // Mirrors the same flag used for the Yumi bow. Has zero effect in sandbox.
    const isJapan = (factionColor === "#c2185b") || (window.__campaignStory1Active && unit && unit.side === 'player');

    // Safety: factionColor must always be a valid string for headgear switch logic
    if (!factionColor || typeof factionColor !== 'string') factionColor = '#888888';

    let animFrame = frame || (Date.now() / 100);
    // dir is always 1 — ctx.scale(facingDir) above handles all mirroring.
    // Keeping dir so all mount/rider offset math below compiles unchanged.
    let dir = 1;

    // mountHeadDeferred — added this session to fix a z-order bug: the
    // horse's head/chanfron (facing-down pose only) must draw AFTER
    // the rider and their weapon/quiver, not as part of the early
    // mount-body block (which runs well before either drawRiderBody()
    // call site in this function). Defaults to a no-op so every OTHER
    // code path (side-view, facing-up, elephant, camel) that never
    // touches this variable can still safely "call" it at the end of
    // the function without a crash.
    let mountHeadDeferred = () => {};

    // mountUpLegsDeferred — added this session per direct request: the
    // facing-up (back view) NEAR leg pair must be the absolute LAST
    // thing drawn in the whole function, on top of everything else
    // (body, haunch, tail, rider, weapon). Previously this pair drew
    // inline with the rest of the mount body, early in the function.
    // Same no-op-default pattern as mountHeadDeferred above so every
    // other code path that never touches this variable can still
    // safely "call" it at the very end without a crash.
    let mountUpLegsDeferred = () => {};

    // Shared vertical-facing flag — see the VERTICAL FACING comment block
    // above for full context. Read by all three ported rider melee/
    // ranged spots (search "facingDown" to find them all).
    const facingDown = (unit && unit.facingDirY === 1);

    // facingUp/useBackView — declared here (moved up this session) so
    // the mount body's up/down pose block, which sits earlier in this
    // function than their old declaration point, can reference them.
    // Same class of bug as infscript.js hit and fixed last session
    // (temporal dead zone: a const used before its declaration line
    // throws, even elsewhere in the same function) — caught here via
    // an actual runtime test before shipping, not just node --check.
    const facingUp = (unit && unit.facingDirY === -1);
    const useBackView = facingUp;

    // ═══════════════════════════════════════════════════════════════════
    // INDEPENDENT WEAPON AIM (rider aims at target; mount/body keeps
    // moving/facing in its own travel direction) — added this session.
    //
    // THE PROBLEM: facingDown/facingUp/dir above are 100% movement-
    // derived (from unit.facingDir/facingDirY, which troop_draw.js
    // computes from position deltas — see that file's VERTICAL FACING
    // block). Every weapon branch in this file reads THOSE same three
    // values to decide which way to aim. That's correct for melee (you
    // face what you're attacking) but wrong for ranged riders: a horse
    // archer running north still needs to shoot east if that's where
    // the target is, without the whole horse spinning to face east.
    //
    // THE FIX: compute a separate aimAngle from this unit's own world
    // position (x, y — the translate target at the top of this
    // function) to unit.targetX/unit.targetY, IF the caller provides
    // them. If it doesn't, every one of the three vars below collapses
    // back to today's exact existing behavior (aimFacingDown ===
    // facingDown, etc.) — so nothing changes for any unit whose caller
    // hasn't been updated to supply a target yet. This is additive, not
    // a replacement: the mount/body-facing facingDown/facingUp/dir
    // above are UNTOUCHED and still drive movement/mount-body rendering
    // exactly as before; only weapon branches need to switch from
    // reading facingDown/facingUp/dir to reading
    // aimFacingDown/aimFacingUp/aimDir instead.
    //
    // CONTRACT for upstream/combat code: set unit.targetX and
    // unit.targetY (world-space coordinates, same space as this
    // function's own x/y parameters) on any unit that should aim
    // independently of its movement. Leave them unset/undefined for
    // units that should keep aiming in their movement direction (today's
    // behavior) — e.g. melee cavalry, or ranged units with no live
    // target this frame.
    //
    // COORDINATE-SPACE NOTE: ctx.scale(unit.facingDir||1, 1) above
    // mirrors this function's entire LOCAL drawing space horizontally.
    // aimAngle below is computed in WORLD space (real dx/dy to the
    // target, unaffected by that mirror), so it must be converted back
    // into this function's local (possibly-mirrored) space before use
    // — done by dividing the world-space dx by facingDir so the sign
    // flips correctly when the sprite itself is flipped. Skipping this
    // step would aim the weapon at the target's MIRROR IMAGE whenever
    // facingDir === -1.
    const hasIndependentTarget = !!(unit && typeof unit.targetX === 'number' && typeof unit.targetY === 'number');

    let aimFacingDown = facingDown;
    let aimFacingUp = facingUp;
    let aimDir = dir;
    let aimAngle = 0; // radians, 0 = pointing along local +X (right, post-mirror)

    if (hasIndependentTarget) {
        const worldDx = unit.targetX - x;
        const worldDy = unit.targetY - y;
        // Undo the horizontal mirror so local-space math (everything
        // below, and every existing weapon branch) sees the correct
        // sign regardless of which way facingDir flipped the sprite.
        const localDx = worldDx / (unit.facingDir || 1);
        const localDy = worldDy;

        aimAngle = Math.atan2(localDy, localDx);

        // Derive aimFacingDown/aimFacingUp/aimDir from the target
        // angle using the SAME H_THRESH-style quadrant split
        // troop_draw.js already uses for movement (steep enough
        // vertical angle wins; otherwise horizontal aim, i.e. today's
        // ordinary side-view weapon pose, which every existing branch
        // already renders correctly via aimDir).
        const steep = Math.abs(Math.sin(aimAngle));
        if (steep > 0.55) {
            // Target is steep enough (mostly above or below) to use
            // the up/down weapon poses built in prior sessions.
            aimFacingDown = localDy > 0;
            aimFacingUp = localDy < 0;
            aimDir = (localDx >= 0) ? 1 : -1; // kept for any branch that still multiplies by dir
        } else {
            // Target is mostly to the side — ordinary side-view aim,
            // just possibly toward the opposite side from movement.
            aimFacingDown = false;
            aimFacingUp = false;
            aimDir = (localDx >= 0) ? 1 : -1;
        }
    }
    // From here down, weapon branches should read aimFacingDown/
    // aimFacingUp/aimDir/aimAngle (target-independent aim) instead of
    // facingDown/facingUp/dir (movement-only). Mount body / rider
    // headgear sections keep reading the original three — a rider's
    // helmet and the horse under them still face where they're
    // walking, only the weapon itself redirects.

    // QUADRANT-BASED AIM ANGLE — see infscript.js's matching constant
    // (declared near its own facingUp/useBackView) for the full
    // reasoning: a pure 90° rotation produces a dead-vertical aim with
    // no lean left/right even when facingDir also indicates a diagonal
    // heading. 45° instead, combined with the existing global
    // ctx.scale(unit.facingDir,1) mirror at the top of this function,
    // correctly lands in whichever of the 4 heading quadrants applies
    // without needing separate per-quadrant code. Used by all three
    // rider melee/ranged spots in place of the Math.PI/2 each
    // originally used — search this file for DOWN_QUADRANT_ANGLE.
    const DOWN_QUADRANT_ANGLE = Math.PI / 4;
 

    let isMoving = moving || (typeof vx !== 'undefined' && (Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1));
    let legSwing = isMoving ? Math.sin(animFrame * 0.4) : 0; // Normalized for scaling
    let bob = isMoving ? Math.sin(animFrame * 0.4) * 2 : 0;
    
    // Default rider physics (adjusted later if mount is massive)
    let riderBob = isMoving ? Math.sin(animFrame * 0.4 + 0.5) * 1.5 : 0;
    let riderHeightOffset = 0; 
let baseMountHeight = -4; // Default Horse
if (isElephant) baseMountHeight = -80; // Lower spine relative to body center
if (isCamel)    baseMountHeight = 7;
 

    if (isCamelCannonType) {
        // No animal body at all -- see CAMEL CANNON / ZAMBURAK LOGIC
        // further down in this function for the actual gunner+cart+
        // barrel rig. This branch exists only to short-circuit out of
        // the elephant/camel/vertical-facing/default-horse chain below,
        // so nothing here draws anything.
    } else if (isElephant) {
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

 

} else if (isCamel && !isCamelCannonType) {
        // ==========================================
        //      DEDICATED CAMEL BLOCK (REVISED)
        //   SIMPLIFIED this session per direct instruction: the plain
        //   camel mount now ONLY ever renders this side-profile body
        //   (mirrored left/right by the facingDir scale at the top of
        //   the function, same as every other unit) — it no longer has
        //   any path into the up/down "MOUNT VERTICAL FACING" branch
        //   below, regardless of facingDown/facingUp. Widened from the
        //   old `type === "camel"` check to `isCamel && !isCamelCannonType`
        //   so this holds for any camel-named unit, not just an exact
        //   "camel" type string. The camel GUNNER's camel (camel_cannon)
        //   is explicitly excluded from this branch — it keeps full
        //   side + up/down rendering via the branches below, unchanged.
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
        
    
} else if (facingDown || (facingUp && useBackView)) {
        // ==========================================
        //   MOUNT VERTICAL FACING — HORSE & CAMEL
        //   REWRITTEN this session per direct visual feedback (see
        //   attached screenshot): the previous version had legs drawn
        //   at nearly the same spot at both ends (no real front/back
        //   separation), a head crudely stuck onto the body with no
        //   neck, no armor at all, and — the core bug — WRONG Z-ORDER.
        //   A painter's-algorithm sprite must draw the FARTHEST thing
        //   first and the NEAREST thing last (so near things overlay
        //   far things). Facing down (toward viewer): the head/neck is
        //   the near end and must be painted LAST, legs/tail are far
        //   and painted FIRST. Facing up (away from viewer): reversed —
        //   the rear/tail/haunch is now the near end and painted LAST,
        //   the head/neck is now the far end, painted FIRST (and kept
        //   plain/silhouetted, same "no face visible from behind" rule
        //   used for rider backshots elsewhere in this file).
        //   Camel is explicitly NOT reworked this pass per direct
        //   instruction — it still shares this branch structurally
        //   (isCamel tweaks the palette/hump exactly as before) but its
        //   proportions/anatomy are untouched; this rewrite's anatomy
        //   changes are horse-focused.
        // ==========================================
        // CANTER CYCLE — replaces the old flat-walk sinusoid this
        // session per direct request ("animations of cantering for the
        // down and up directions"). A canter is a 3-beat gait with a
        // real moment of suspension (all four hooves briefly off the
        // ground) followed by a springy landing, so instead of a
        // single smooth sine we use a faster base frequency plus a
        // rectified/curved component that snaps down hard on landing
        // and hangs near the top of the stride — reads as a lope
        // rather than a flat walk. The `hBob`/`legSwingV`/`tailSwishV`/
        // `headNodV` variable names are kept so every downstream use in
        // this branch (legs, tail, body, head) picks up the new feel
        // automatically with no further edits needed.
        let walkSpeed = moving ? animFrame * 0.15 : 0;
        let canterPhase = walkSpeed * 2;
        // Rectified sine (0..1..0) gives a bounce that snaps at the
        // bottom (landing) and lingers near the top (suspension),
        // unlike a plain sine's symmetric up/down.
        let canterLift = moving ? Math.pow(Math.max(0, Math.sin(canterPhase)), 0.6) : 0;
        let hBob = moving ? (bob * 1.4) - canterLift * 2.2 : bob;
        let legSwingV = moving ? Math.sin(canterPhase) * 4.5 : 0;
        let tailSwishV = moving ? Math.sin(walkSpeed) * 2.8 : 0;
        // Head drives down into the reach phase and snaps back up
        // through the suspension phase, matching a real canter's neck
        // bascule instead of a small constant nod.
let headNodV = moving ? (canterLift - 0.5) * 1.0 : 0;
        const vDir = facingDown ? 1 : -1; // +1: near end (head) points down-screen/toward viewer. -1: near end (haunch) points up-screen/toward viewer.

        ctx.lineCap = "round"; ctx.lineJoin = "round";
        const bodyColorV = isCamel ? "#c9a876" : "#795548";
        const darkBodyColorV = isCamel ? "#a9885c" : "#5D4037";
        const farLegColorV = isCamel ? "#8a6d47" : "#3e2723";
        const nearLegColorV = isCamel ? "#c9a876" : "#6d4c41";
        const lineColorV = "#3e2723";
        const maneColorV = isCamel ? darkBodyColorV : "#2d1c15";

        // Horse-head-armor (chanfron) tier, reusing the SAME armorVal
        // thresholds the camel side-view barding above uses, so the
        // tier boundaries stay consistent file-wide: >=40 steel plate,
        // >=25 leather/padded, below that bare. Applies to horse only
        // — camel has no rider (gunner walks beside, per this file's
        // own established design) so it never wears rider-tier armor.
        const mountArmorTier = isCamel ? 0 : (armorVal >= 40 ? 2 : (armorVal >= 25 ? 1 : 0));

        // thighFillColor pulled out to one shared constant (rather than
        // set inline per-iteration) so there is no possible way for the
        // two thighs to end up different colors — both legs below read
        // from this single value.
        const thighFillColor = nearLegColorV;
        // drawNearPairLegsV — HOISTED to this point in the function
        // (was previously defined much later, right before its old
        // call site after the body/neck) so it can be called FIRST,
        // ahead of the far leg pair / neck / body, per direct request
        // that horse legs draw at the bottom (i.e. painted first, with
        // everything else layered on top) rather than on top of the
        // body as before. Only the DEFINITION moved; the shape math
        // and colors inside are unchanged from before.
        const drawNearPairLegsV = (extendDown = 0, topOverride = null) => {
            for (let lx of [-5.5, 5.5]) {
                // Reset every iteration — the highlight stripe below
                // (drawn once per leg) overwrites ctx.strokeStyle to
                // "#8d6e63" and that value was previously still active
                // when the SECOND leg's outline stroke() ran, since
                // strokeStyle was only ever set to lineColorV once,
                // before the loop started. That's why the two legs were
                // rendering with mismatched outline colors — left leg
                // got lineColorV, right leg got whatever the left leg's
                // highlight stripe left behind. Setting it fresh here,
                // every iteration, guarantees both legs' outlines use
                // the same lineColorV regardless of draw order.
                ctx.strokeStyle = lineColorV; ctx.lineWidth = 0.8;
                let liftV = moving ? Math.max(0, Math.sin(walkSpeed + (lx < 0 ? Math.PI : 0))) * 3.2 : 0;
                const topY = topOverride !== null ? topOverride : hBob + 7;
                const hoofY = hBob + (25 - liftV) + extendDown;
                // Knee sits ~55% of the way down — thigh (above) is
                // wide, shin (below) is thin. One shape, one smooth
                // taper, no line at the joint.
                const kneeY = topY + (hoofY - topY) * 0.55;
                // CANTER BEND: thigh (hip-to-knee) barely swings — real
                // legs pivot mostly at the knee, not the hip — while the
                // shin/hoof (knee-to-ground) swings the full amount, so
                // the leg visibly BENDS at the knee during the stride
                // instead of sliding sideways as one rigid rod. Both are
                // driven by legSwingV, which is itself 0 when not
                // moving, so the leg is a dead-straight taper at rest.
                const kneeSwingX = legSwingV * 0.15;
                const hoofSwingX = legSwingV * 0.55;
                ctx.fillStyle = thighFillColor;
                ctx.beginPath();
                ctx.moveTo(lx - 2.3, topY);
                ctx.quadraticCurveTo(lx - 2.1, kneeY, lx - 0.9 - kneeSwingX, kneeY + 1);
                ctx.quadraticCurveTo(lx - 0.75 - hoofSwingX * 0.5, kneeY + (hoofY - kneeY) * 0.5, lx - 0.7 - hoofSwingX, hoofY);
                ctx.lineTo(lx + 0.7 - hoofSwingX, hoofY);
                ctx.quadraticCurveTo(lx + 0.75 - hoofSwingX * 0.5, kneeY + (hoofY - kneeY) * 0.5, lx + 0.9 - kneeSwingX, kneeY + 1);
                ctx.quadraticCurveTo(lx + 2.1, kneeY, lx + 2.3, topY);
                ctx.closePath(); ctx.fill(); ctx.stroke();
                // Highlight stripe — soft lighter vertical line down the
                // front-center of the leg so it reads as a rounded
                // cylindrical limb instead of a flat-shaded silhouette.
                ctx.strokeStyle = "#8d6e63"; ctx.lineWidth = 0.7; ctx.globalAlpha = 0.45;
                ctx.beginPath();
                ctx.moveTo(lx - 0.4 - kneeSwingX * 0.3, topY + 1);
                ctx.quadraticCurveTo(lx - 0.3 - hoofSwingX * 0.5, kneeY, lx - 0.15 - hoofSwingX, hoofY - 1.5);
                ctx.stroke();
                ctx.globalAlpha = 1;
                // Hoof — rounded base, flat top blending into the
                // leg/fetlock, rounded bottom two corners.
                ctx.fillStyle = "#212121";
                const hL = lx - 1.3 - hoofSwingX, hR = lx + 1.3 - hoofSwingX, hT = hoofY - 1.8, hB = hoofY + 0.2;
                ctx.beginPath();
                ctx.moveTo(hL, hT);
                ctx.lineTo(hR, hT);
                ctx.lineTo(hR, hB - 0.6);
                ctx.quadraticCurveTo(hR, hB, hR - 0.6, hB);
                ctx.lineTo(hL + 0.6, hB);
                ctx.quadraticCurveTo(hL, hB, hL, hB - 0.6);
                ctx.closePath(); ctx.fill();
            }
        };

        // LEGS FIRST — per direct request, the near/visible leg pair
        // must be the absolute FIRST thing drawn for facingDown (the
        // "bottom" of the paint order = drawn before anything else, so
        // body/neck/head all layer on top of it).
        if (facingDown) {
            drawNearPairLegsV();
        }

        // drawFarPairLegsUpV — HOISTED here (next to drawNearPairLegsV)
        // for the same reason: facingUp now also needs its legs drawn
        // first, before the haunch/tail/body, so both this and
        // drawNearPairLegsV must be defined and CALLED ahead of that
        // point in the draw order. Shape/color math unchanged from
        // before — only the definition's position and call timing moved.
        const drawFarPairLegsUpV = () => {
            // Facing UP: the near pair (drawn via drawNearPairLegsV,
            // positive-Y side) is anatomically the near/haunch-adjacent
            // legs — correct, since vDir puts the haunch at positive Y
            // for this case. This FAR pair (near the now-distant head
            // end, negative-Y side) still needs drawing; narrow stance,
            // short length, mostly hidden behind the body so they don't
            // splay outward past the silhouette.
            ctx.strokeStyle = lineColorV; ctx.lineWidth = 0.8;
            ctx.fillStyle = farLegColorV;
            for (let lx of [-3.2, 3.2]) {
                let liftV = moving ? Math.max(0, Math.sin(walkSpeed + (lx < 0 ? 0 : Math.PI))) * 1.5 : 0;
                const topY = hBob - 6;
                const hoofY = hBob - (11 - liftV);
                const swingX = legSwingV * 0.2;
                ctx.beginPath();
                ctx.moveTo(lx - 1.6, topY);
                ctx.lineTo(lx - 1.2 + swingX, hoofY);
                ctx.lineTo(lx + 1.2 + swingX, hoofY);
                ctx.lineTo(lx + 1.6, topY);
                ctx.closePath(); ctx.fill(); ctx.stroke();
                // Hoof — rounded bottom corners to match the near-pair
                // treatment and the professional reference.
                ctx.fillStyle = "#212121";
                const fuL = lx - 1.5 + swingX, fuR = lx + 1.5 + swingX, fuT = hoofY - 1.6, fuB = hoofY + 0.2;
                ctx.beginPath();
                ctx.moveTo(fuL, fuT);
                ctx.lineTo(fuR, fuT);
                ctx.lineTo(fuR, fuB - 0.5);
                ctx.quadraticCurveTo(fuR, fuB, fuR - 0.5, fuB);
                ctx.lineTo(fuL + 0.5, fuB);
                ctx.quadraticCurveTo(fuL, fuB, fuL, fuB - 0.5);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = farLegColorV;
            }
        };

        // LEGS FIRST (facingUp) — per direct request ("remember to draw
        // the horse legs first aka everything else is on top including
        // body and tails"): previously BOTH leg pairs for facingUp were
        // deferred all the way to the end of the function (after body/
        // haunch/tail/rider/weapon) via mountUpLegsDeferred. That's
        // removed — legs now draw here instead, before the haunch/tail
        // block and before the body, matching facingDown's order above.
        //
        // GAP FIX: topOverride shifted from hBob+14 to hBob+10.5. The
        // old value started the leg tops flush at/below the haunch
        // shape's own lowest edge (hBob+13.5), leaving a visible seam/
        // gap between leg-top and haunch as reported. hBob+10.5 pushes
        // the leg tops a few units UP INTO the haunch instead, so the
        // haunch (painted after, per this order) fully overlaps and
        // conceals the leg tops with real margin instead of a hairline
        // or exact-edge match. extendDown left at 9 — only the top edge
        // moves; hooves keep the same downward reach as before.
        if (facingUp) {
            drawNearPairLegsV(9, hBob + 10.5);
            drawFarPairLegsUpV();
        }

        // ── FAR STRUCTURES FIRST (painted first = farthest from viewer) ──
        // For facingDown: far legs (rear pair, near the tail end) go
        // first, THEN the tail itself (truly the farthest point of all).
        // For facingUp: the roles swap — the FAR end is now the head,
        // so the head/neck get painted in this "far" pass instead.

        if (facingDown) {
            // Rear/far leg pair — sits near the tail end (negative Y
            // side). REPOSITIONED this session: previously stanced at
            // ±6.5 with long hooves reaching well past the body's own
            // ±8.5 silhouette, which read as legs splaying outward like
            // outstretched arms in the front view. A real front-view
            // horse's far/hind legs are mostly HIDDEN behind the body
            // mass — only short stubs/hooves should peek out beneath
            // it. Narrowed stance to ±3.2 and shortened so the hoof
            // sits just below the body's far edge, not far past it.
            ctx.strokeStyle = lineColorV; ctx.lineWidth = 0.8;
            ctx.fillStyle = farLegColorV;
            for (let lx of [-3.2, 3.2]) {
                let liftV = moving ? Math.max(0, Math.sin(walkSpeed + (lx < 0 ? 0 : Math.PI))) * 1.5 : 0;
                const topY = hBob - 6;
                const hoofY = hBob - (11 - liftV);
                const swingX = legSwingV * 0.2;
                ctx.beginPath();
                ctx.moveTo(lx - 1.6, topY);
                ctx.lineTo(lx - 1.2 + swingX, hoofY);
                ctx.lineTo(lx + 1.2 + swingX, hoofY);
                ctx.lineTo(lx + 1.6, topY);
                ctx.closePath(); ctx.fill(); ctx.stroke();
                // Hoof — ROUNDED this session to match the professional
                // reference (soft rounded base, not a sharp-cornered
                // box). Flat top where it meets the leg, rounded bottom
                // two corners where the hoof meets the ground.
                ctx.fillStyle = "#212121";
                const rfL = lx - 1.5 + swingX, rfR = lx + 1.5 + swingX, rfT = hoofY - 1.6, rfB = hoofY + 0.2;
                ctx.beginPath();
                ctx.moveTo(rfL, rfT);
                ctx.lineTo(rfR, rfT);
                ctx.lineTo(rfR, rfB - 0.5);
                ctx.quadraticCurveTo(rfR, rfB, rfR - 0.5, rfB);
                ctx.lineTo(rfL + 0.5, rfB);
                ctx.quadraticCurveTo(rfL, rfB, rfL, rfB - 0.5);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = farLegColorV;
            }

            // EARLY NECK — facingDown, drawn here (before the rider) per
            // direct request: previously the neck lived inside
            // mountHeadDeferred and painted AFTER the rider, covering the
            // rider's body/armor. Split out so the neck now sits UNDER
            // the rider while the head/muzzle (still in mountHeadDeferred,
            // below) keeps painting over the rider's spear/quiver as
            // before. Same 70%-scale-anchored-at-hBob+8 transform as the
            // deferred closure so the seam at hBob+21.5 still connects
            // seamlessly to the head with no visible gap or jump.
            ctx.save();
            ctx.translate(0, hBob + 8);
            ctx.scale(0.7, 0.7);
            ctx.translate(0, -(hBob + 8));
            ctx.translate(0, -3 / 0.7);

            ctx.fillStyle = bodyColorV; ctx.strokeStyle = lineColorV; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-6.5, hBob + 8);
            ctx.quadraticCurveTo(-7, hBob + 13, -6, hBob + 17);
            ctx.quadraticCurveTo(-5.3, hBob + 20, -4.5, hBob + 21.5);
            ctx.lineTo(4.5, hBob + 21.5);
            ctx.quadraticCurveTo(5.3, hBob + 20, 6, hBob + 17);
            ctx.quadraticCurveTo(7, hBob + 13, 6.5, hBob + 8);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            // Center neck shading highlight.
            ctx.strokeStyle = "#8d6e63"; ctx.lineWidth = 1; ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.moveTo(0, hBob + 9); ctx.quadraticCurveTo(0.4, hBob + 15, 0, hBob + 20);
            ctx.stroke();
            ctx.globalAlpha = 1;
            // Neck hair — side tufts.
            ctx.strokeStyle = maneColorV; ctx.lineWidth = 1;
            for (let sx of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(sx * 6.8, hBob + 10);
                ctx.lineTo(sx * 7.2, hBob + 15);
                ctx.moveTo(sx * 6.3, hBob + 13);
                ctx.lineTo(sx * 6.6, hBob + 18);
                ctx.moveTo(sx * 5.3, hBob + 17);
                ctx.lineTo(sx * 5.6, hBob + 21.5);
                ctx.stroke();
            }
            ctx.restore();
        } else {
            // Facing UP: head/neck are now the FAR structures — drawn
            // first, kept deliberately plain (no chanfron detail, no
            // eyes) since we're looking at the back of the neck, not
            // the face.
            // NECK — re-added this session per direct feedback ("add
            // here to complete the horse back neck"): the previous
            // pass cut the poll shape entirely, leaving the ears
            // floating with a gap before the body. This is a genuine
            // tapered neck column instead — narrow up near the ears,
            // widening smoothly down into the withers/body — so it's
            // a real connecting shape rather than the old rounded-
            // rectangle "collar" that sat flat across the top.
            // SURGERY FIX (sideburns bug): neck/ears were already painted
            // before the rider (this whole block runs early, well before
            // drawRiderBody), so the "over the rider" look was never a
            // z-order bug — it was the ears sitting wide (out to +-3.5)
            // and low (top at hBob-19) so their outer tips poked out past
            // the sides of the rider's narrower head/helmet silhouette
            // and read as sideburns even though they were technically
            // behind it. Fixed by pulling the ears in narrower (+-2.6
            // outer tip, was +-3.5) and taller/higher (base/tip raised
            // ~2-3.5px) so they clear above the helmet instead of
            // flanking the face. Neck top narrowed to match (+-1.6, was
            // +-2.2) and lengthened to reach the new higher ear base.
            ctx.fillStyle = darkBodyColorV; ctx.strokeStyle = lineColorV; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-1.6, hBob - 21 - headNodV);
            ctx.quadraticCurveTo(-3.4, hBob - 15, -5, hBob - 8);
            ctx.quadraticCurveTo(-5.5, hBob - 3, -5, hBob + 1);
            ctx.lineTo(5, hBob + 1);
            ctx.quadraticCurveTo(5.5, hBob - 3, 5, hBob - 8);
            ctx.quadraticCurveTo(3.4, hBob - 15, 1.6, hBob - 21 - headNodV);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            // Ears — RE-ADDED per direct request ("just missing the
            // upward angle's ears of horse head"). Previous two attempts
            // sat the ears wide and low enough that their outer tips
            // poked past the rider's helmet silhouette and read as
            // sideburns, so last pass deleted them outright. This time
            // they're anchored tight to the narrow poll tip itself
            // (±1.6, matching the neck's own narrowest point at
            // hBob-21-headNodV) rather than flared out to ±2.6+ like
            // before, and angled inward/up instead of outward — small,
            // close-set, pointing straight up past the top of the
            // helmet instead of out to its sides. No side tufts re-added
            // (only "ears" were called out as missing).
            ctx.fillStyle = darkBodyColorV;
            ctx.strokeStyle = "#000000"; ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(-1.4, hBob - 21 - headNodV); ctx.lineTo(-1.9, hBob - 25.5 - headNodV); ctx.lineTo(-0.4, hBob - 22.5 - headNodV);
            ctx.closePath();
            ctx.moveTo(1.4, hBob - 21 - headNodV); ctx.lineTo(1.9, hBob - 25.5 - headNodV); ctx.lineTo(0.4, hBob - 22.5 - headNodV);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
        }

        // --- BODY — REWORKED this session to match the reference
        // (blocky, wide-chested, end-on view rather than a slim oval).
        // Previous version was a narrow ±5.5 vertical oval that read as
        // a thin blob. Reference art shows a wide, roughly barrel/shield
        // -shaped chest/hindquarter mass: broad and flat-topped near the
        // shoulders/haunch (±8.5), tapering only slightly toward the
        // belly midline, NOT pinching to a point. Kept vDir-mirrored so
        // facingUp (haunch) and facingDown (chest) both use this shape —
        // anatomically both ends are broad muscle masses, not tapered. ---
        ctx.fillStyle = bodyColorV; ctx.strokeStyle = lineColorV; ctx.lineWidth = 1.2;
        let mountBodyV = new Path2D();
        mountBodyV.moveTo(-8.5, hBob + 5 * vDir);
        mountBodyV.quadraticCurveTo(-9.5, hBob + 0, -8.5, hBob - 5 * vDir);
        mountBodyV.quadraticCurveTo(-8, hBob - 9 * vDir, -4, hBob - 10 * vDir);
        mountBodyV.quadraticCurveTo(-1.5, hBob - 10.5 * vDir, 0, hBob - 10.5 * vDir);
        mountBodyV.quadraticCurveTo(1.5, hBob - 10.5 * vDir, 4, hBob - 10 * vDir);
        mountBodyV.quadraticCurveTo(8, hBob - 9 * vDir, 8.5, hBob - 5 * vDir);
        mountBodyV.quadraticCurveTo(9.5, hBob + 0, 8.5, hBob + 5 * vDir);
        mountBodyV.quadraticCurveTo(8, hBob + 9 * vDir, 4, hBob + 10 * vDir);
        mountBodyV.quadraticCurveTo(1.5, hBob + 10.5 * vDir, 0, hBob + 10.5 * vDir);
        mountBodyV.quadraticCurveTo(-1.5, hBob + 10.5 * vDir, -4, hBob + 10 * vDir);
        mountBodyV.quadraticCurveTo(-8, hBob + 9 * vDir, -8.5, hBob + 5 * vDir);
        mountBodyV.closePath();
        ctx.fill(mountBodyV); ctx.stroke(mountBodyV);

        if (!isCamel) {
            // Chest/pectoral cleft — a soft center groove running down
            // the near-facing muscle mass, matching the reference art's
            // visible sternum crease splitting the chest (and haunch,
            // when facing up) into two rounded lobes. Subtle shading
            // line, not a hard outline.
            ctx.strokeStyle = darkBodyColorV; ctx.lineWidth = 1;
            ctx.globalAlpha = 0.55;
            ctx.beginPath();
            ctx.moveTo(0, hBob + 9.5 * vDir);
            ctx.quadraticCurveTo(0.4 * vDir, hBob + 2 * vDir, 0, hBob - 3 * vDir);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        if (isCamel) {
            // Camel hump — untouched this session per direct instruction
            // to leave camel anatomy alone; kept exactly as before.
            ctx.fillStyle = darkBodyColorV;
            ctx.beginPath();
            ctx.ellipse(0, hBob - 2 * vDir, 5, 6, 0, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
        } else {
            // Horse body armor / saddle blanket — same tier scheme as
            // the camel's side-view barding above (>=40 plate, >=25
            // leather), so a heavily-armored rider's mount visibly
            // matches their own equipment tier, same as requested.
            if (mountArmorTier === 2) {
                ctx.fillStyle = "#9e9e9e"; ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 0.5;
                ctx.fillRect(-4.5, hBob - 7 * vDir, 9, 12 * vDir);
                for (let i = -4; i <= 4; i += 2) {
                    ctx.beginPath(); ctx.moveTo(i, hBob - 7 * vDir); ctx.lineTo(i, hBob + 5 * vDir); ctx.stroke();
                }
            } else if (mountArmorTier === 1) {
                ctx.fillStyle = "#5d4037"; ctx.strokeStyle = "#271610"; ctx.lineWidth = 0.5;
                ctx.fillRect(-4, hBob - 6 * vDir, 8, 10 * vDir);
            } else if (isCommander) {
                ctx.fillStyle = factionColor;
                ctx.fillRect(-3.5, hBob - 8 * vDir, 7, 6 * vDir);
                ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 0.5;
                ctx.strokeRect(-3.5, hBob - 8 * vDir, 7, 6 * vDir);
            }
        }

        if (facingDown) {
            // Tail — SHRUNK BACK DOWN this session per direct feedback:
            // the previous long/swung-out version read as sticking way
            // out to the side, unrealistic for a bird's-eye/front view
            // where the tail is mostly hidden behind the horse's body
            // and only a small tip should peek out. Short stub, barely
            // extending past the body's far edge (hBob-10.5), no wide
            // side swing — just a small hint of tail visible from above.
            ctx.strokeStyle = maneColorV; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, hBob - 9);
            ctx.quadraticCurveTo(1 + tailSwishV * 0.3, hBob - 11.5, 0.5, hBob - 13.5);
            ctx.stroke();
        }

        // ── NEAR STRUCTURES: legs/haunch/tail drawn here as before.
        // HEAD IS NO LONGER DRAWN HERE — extracted into a deferred
        // closure (drawMountHeadV, stored on a scope-shared variable)
        // called at the TRUE end of drawCavalryUnit, after the rider
        // and their weapon/quiver have already been drawn. This fixes
        // a real z-order bug reported after testing: the head was
        // drawing BEFORE the rider (this whole mount block runs early
        // in the function, well before either drawRiderBody() call
        // site), so a facing-down commander's spear/quiver appeared to
        // sit on top of the horse's head instead of the head correctly
        // overlaying them as the closest-to-viewer element. ──
        if (facingDown) {
            mountHeadDeferred = () => {
            // HEAD/NECK — REWORKED this session per direct visual
            // feedback against the rendered screenshot:
            //  - whole head scaled to 70% of its previous size, anchored
            //    at the neck/body seam so it still connects cleanly
            //  - neck taper "shoulders" rounded off (was a hard-edged
            //    squarish trapezoid)
            //  - eyes redone as dark holes (no white sclera) with a
            //    small yellow crescent accent, not solid white ovals
            //  - the commander helmet's center ridge line removed (read
            //    as a stray "cross" through the face) along with its
            //    shading band, which was the other half of that cross
            //  - ears outlined in solid black
            //  - side neck-hair tufts added (previously bare)
            //  - nostrils shrunk further
            ctx.save();
            // Anchor the 70% scale at the neck/body seam (hBob+8) so the
            // head shrinks toward the body instead of drifting in place.
            ctx.translate(0, hBob + 8);
            ctx.scale(0.7, 0.7);
            ctx.translate(0, -(hBob + 8));
            // FIX: the -10px version of this shift moved the WHOLE
            // closure up by 10 screen units — including the neck-base
            // anchor point above, which was specifically set up to stay
            // pinned to the body seam (hBob+8). That pin only holds for
            // points AT y=hBob+8 when nothing else moves them afterward;
            // this translate moved them anyway, so the neck detached
            // from the body by ~12.5 units and floated as a disconnected
            // block above the ears (reported as "a weird rectangle on
            // top of the ears the size of a neck/body"). Reduced to a
            // 3px shift — small enough that the neck's own width still
            // overlaps the body's chest taper at the seam, so there's
            // no visible gap, while still nudging the head slightly
            // closer to the rider as originally requested. If the head
            // needs to sit noticeably closer than this, the correct fix
            // is to lengthen the neck geometry itself (or anchor the
            // scale further up the neck) rather than raising this
            // number further, since any bigger uniform shift reopens
            // the same gap.
            ctx.translate(0, -3 / 0.7);

            // SURGERY FIX (per direct request): the neck used to be built
            // right here, inside this deferred closure — which fires
            // AFTER drawRiderBody(), so the neck was painting over the
            // rider's body/armor. Neck (+its side-hair tufts) has been
            // moved OUT to an early pass, drawn before the rider, in the
            // "FAR STRUCTURES FIRST" section above (search "EARLY NECK —
            // facingDown"). It uses the exact same 70%-scale transform as
            // this closure so the seam at hBob+21.5 still lines up. Only
            // the head/muzzle/ears/eyes/helmet stay in this deferred
            // closure — those are the near-to-viewer parts that
            // legitimately need to paint over the rider's spear/quiver.
            ctx.strokeStyle = lineColorV; ctx.lineWidth = 1;
            // Head/muzzle — REBUILT this session to match the reference
            // art: previously a narrow wedge tapering to a point, which
            // read as thin/toylike. Reference shows a long, roughly
            // RECTANGULAR muzzle (nearly parallel sides, not a sharp
            // taper) with a distinct wider brow/jaw shelf up top before
            // narrowing only slightly toward the nose, giving the head
            // a blockier, more grounded look.
            ctx.fillStyle = bodyColorV;
            ctx.beginPath();
            ctx.moveTo(-7, hBob + 21.5);
            // Top corners SOFTENED this session (were hard lineTo
            // corners where the muzzle met the neck/jowl) to match the
            // professional reference's smooth, rounded contour there.
            ctx.quadraticCurveTo(-7.2, hBob + 25, -6.5, hBob + 27.5);
            ctx.quadraticCurveTo(-6.3, hBob + 33.5 + headNodV, -5, hBob + 38.5 + headNodV);
            ctx.quadraticCurveTo(-4.3, hBob + 41.5 + headNodV, -2.8, hBob + 42.5 + headNodV);
            ctx.lineTo(2.8, hBob + 42.5 + headNodV);
            ctx.quadraticCurveTo(4.3, hBob + 41.5 + headNodV, 5, hBob + 38.5 + headNodV);
            ctx.quadraticCurveTo(6.3, hBob + 33.5 + headNodV, 6.5, hBob + 27.5);
            ctx.quadraticCurveTo(7.2, hBob + 25, 7, hBob + 21.5);
            ctx.closePath(); ctx.fill(); ctx.stroke();

            // Brow ridge — a soft shading band across the upper muzzle,
            // just below the eyeline, giving the flat plane of the face
            // seen in the reference instead of an unbroken smooth curve.
            ctx.strokeStyle = darkBodyColorV; ctx.lineWidth = 1;
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.moveTo(-6, hBob + 29.5);
            ctx.quadraticCurveTo(0, hBob + 31, 6, hBob + 29.5);
            ctx.stroke();
            ctx.globalAlpha = 1;

// COMMANDER HORSE HELMET. Per direct instruction, ONLY
            // commanders' horses wear a horse helmet at all. Silver,
            // covers the entire head, with cut-outs for the ears.
            // Clip path updated to match the new blockier head outline.
            if (isCommander && !isCamel) {
                ctx.save();
                const headClip = new Path2D();
                headClip.moveTo(-7, hBob + 21.5);
                headClip.quadraticCurveTo(-7.2, hBob + 25, -6.5, hBob + 27.5);
                headClip.quadraticCurveTo(-6.3, hBob + 33.5 + headNodV, -5, hBob + 38.5 + headNodV);
                headClip.quadraticCurveTo(-4.3, hBob + 41.5 + headNodV, -2.8, hBob + 42.5 + headNodV);
                headClip.lineTo(2.8, hBob + 42.5 + headNodV);
                headClip.quadraticCurveTo(4.3, hBob + 41.5 + headNodV, 5, hBob + 38.5 + headNodV);
                headClip.quadraticCurveTo(6.3, hBob + 33.5 + headNodV, 6.5, hBob + 27.5);
                headClip.quadraticCurveTo(7.2, hBob + 25, 7, hBob + 21.5);
                headClip.closePath();
                ctx.clip(headClip);
                
                // SURGERY: Silver plate covering the whole head (COLOR FIXED to match side view #9e9e9e)
                ctx.fillStyle = "#9e9e9e"; ctx.strokeStyle = "#424242"; ctx.lineWidth = 0.5;
                ctx.fillRect(-8, hBob + 19.5, 16, 27 + headNodV);
                
                // NOTE: the old center ridge/crest line (a straight
                // vertical stroke from hBob+12 to hBob+29) and its
                // shading band were REMOVED this session...
                ctx.restore();
                
                // Eye-guard rims — small darker ovals framing where the
                // eyes show through the helmet, so the helmet reads as
                // fitted rather than a flat mask with holes punched.
                ctx.strokeStyle = "#707070"; ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.ellipse(-3.8, hBob + 28.5, 1.7, 1.4, 0, 0, Math.PI * 2);
                ctx.ellipse(3.8, hBob + 28.5, 1.7, 1.4, 0, 0, Math.PI * 2);
                ctx.stroke();

       
            }

            // Ears — REPOSITIONED/RESHAPED this session to sit forward
            // and alert (pointing up and slightly in, per the reference)
            // rather than the previous small side-swept triangles, and
            // sized up to match the wider head. Still outlined in solid
            // black so they read as a crisp separate shape.
            // OUTER TONE LIGHTENED this session (darkBodyColorV → the
            // lighter bodyColorV) to match the reference's two-tone
            // ears — light outer shell, darker inner shading — instead
            // of a single flat dark tone for the whole ear.
            ctx.fillStyle = bodyColorV;
            ctx.strokeStyle = "#000000"; ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(-5.5, hBob + 22.5); ctx.lineTo(-6, hBob + 15.5); ctx.lineTo(-1.5, hBob + 21);
            ctx.closePath();
            ctx.moveTo(5.5, hBob + 22.5); ctx.lineTo(6, hBob + 15.5); ctx.lineTo(1.5, hBob + 21);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            // Inner-ear shading — DARKENED/OPACIFIED (was #3e2723 at
            // 0.5 alpha against a dark outer ear, barely visible; now
            // full-strength against the new lighter outer tone so the
            // two-tone contrast actually reads).
            ctx.fillStyle = "#3e2723"; ctx.globalAlpha = 0.85;
            ctx.beginPath();
            ctx.moveTo(-5, hBob + 21.5); ctx.lineTo(-5.3, hBob + 17.5); ctx.lineTo(-2.5, hBob + 20.8);
            ctx.closePath();
            ctx.moveTo(5, hBob + 21.5); ctx.lineTo(5.3, hBob + 17.5); ctx.lineTo(2.5, hBob + 20.8);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;

            // Eyes — dark holes with a thin yellow crescent highlight,
            // repositioned slightly to sit on the wider brow shelf.
            ctx.fillStyle = "#150e0a";
            ctx.beginPath();
            ctx.ellipse(-3.8, hBob + 28.5, 1.7, 2.1, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(3.8, hBob + 28.5, 1.7, 2.1, 0, 0, Math.PI * 2);
            ctx.fill();
            // Yellow crescent — a thin arc hugging the upper-inner rim
            // of each dark eye hole.
            ctx.strokeStyle = "#e8b923"; ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.arc(-3.8, hBob + 27.8, 1.3, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(3.8, hBob + 27.8, 1.3, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();

            // Nostrils — ENLARGED and moved wider/lower this session to
            // match the reference's flared, low-set nostrils on the
            // blockier muzzle (was small and close-set at 0.65x0.95,
            // sized for the old narrow wedge head).
            ctx.fillStyle = "#2a1810";
            ctx.beginPath();
            ctx.ellipse(-2.6, hBob + 40 + headNodV, 1.1, 1.4, -0.3, 0, Math.PI * 2);
            ctx.ellipse(2.6, hBob + 40 + headNodV, 1.1, 1.4, 0.3, 0, Math.PI * 2);
            ctx.fill();
            // Muzzle/mouth line
            ctx.strokeStyle = lineColorV; ctx.lineWidth = 0.7;
            ctx.beginPath(); ctx.moveTo(-2.8, hBob + 42.5 + headNodV); ctx.lineTo(2.8, hBob + 42.5 + headNodV); ctx.stroke();

            ctx.restore(); // closes the 70% head-scale save from the top of this closure
            };
        }
        // facingUp legs already drawn earlier in this branch (see the
        // "LEGS FIRST (facingUp)" call right after drawFarPairLegsUpV's
        // definition, before this haunch/tail block) — nothing to do
        // here anymore.
        if (!facingDown) {
            // Haunch/rear — the near end when facing up, painted LAST
            // so it correctly overlays the body. Tail sits on top of
            // this, closest of all to the viewer. WIDENED this session
            // to match the new blockier body (was sized for the old
            // ±5.5 slim body); also split visually into two rounded
            // haunch lobes via a center dip, matching the reference's
            // rear-view muscle definition either side of the tail.
            ctx.fillStyle = darkBodyColorV; ctx.strokeStyle = lineColorV; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-8, hBob + 9);
            ctx.quadraticCurveTo(-4, hBob + 13.5, 0, hBob + 11.5);
            ctx.quadraticCurveTo(4, hBob + 13.5, 8, hBob + 9);
            ctx.lineTo(7, hBob + 4);
            ctx.lineTo(-7, hBob + 4);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            // FIX — crotch/undercarriage gusset: the haunch curve above
            // only dips to hBob+11.5 at its center (x=0), while the near
            // leg pair (drawn later, deferred to the very end via
            // mountUpLegsDeferred, at lx=±5.5) never covers the central
            // strip between their inner top edges (roughly -3.2..+3.2).
            // Nothing was ever drawn across that strip, so it showed
            // bare terrain right at the tail base instead of horse —
            // this was the reported leg gap for the backshot/up-facing
            // view. Filled here, same pass as the haunch and with no
            // stroke so it reads as part of it rather than a separate
            // patch; the deferred near-leg pair still paints over its
            // outer edges same as always, so z-order is unaffected.
            ctx.fillStyle = darkBodyColorV;
            ctx.beginPath();
            ctx.moveTo(-4.5, hBob + 6);
            ctx.lineTo(4.5, hBob + 6);
            ctx.lineTo(4, hBob + 22);
            ctx.lineTo(-4, hBob + 22);
            ctx.closePath();
            ctx.fill();
            // Tail — REBUILT this session against the professional
            // reference: was a single 3px-wide STROKED line, which
            // read as thin/wiry. Reference shows a real voluminous,
            // flowing mass that sweeps to one side and tapers to a
            // point. Rebuilt as a filled tapered shape (wide ~3.6 unit
            // base at the haunch, sweeping out via tailSwishV, tapering
            // to a point) — same construction as the leg taper shapes,
            // just applied to the tail.
            ctx.fillStyle = maneColorV; ctx.strokeStyle = lineColorV; ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(-1.8, hBob + 9);
            ctx.quadraticCurveTo(2.5 + tailSwishV * 1.2, hBob + 14, 4.5 + tailSwishV * 1.6, hBob + 20);
            ctx.quadraticCurveTo(6 + tailSwishV * 1.6, hBob + 25, 3 + tailSwishV, hBob + 29);
            ctx.quadraticCurveTo(2 + tailSwishV * 0.7, hBob + 23, 1.2 + tailSwishV * 0.4, hBob + 17);
            ctx.quadraticCurveTo(0.8 + tailSwishV * 0.2, hBob + 12, 1.8, hBob + 9);
            ctx.closePath(); ctx.fill(); ctx.stroke();
        }

        // --- LEGS, NEAR PAIR (drawn on top, at whichever end is
        // currently the "near" end per vDir — for facingDown this is
        // near the head/positive-Y side; for facingUp it's near the
        // haunch/positive-Y side too, since vDir already flips the
        // FAR leg pair to the opposite/negative-Y side above for the
        // facingUp case via the shared vDir math below) ---
        // Legs SLIMMED and SMOOTHED this session per direct feedback:
        // previous version was a thick, hard-edged rectangular column
        // with a sharply-defined joint band that read as boxy/blocky.
        // Now a smooth continuous taper (single curve, no straight-line
        // joint kink) with a soft translucent shading gradient standing
        // in for the knee instead of a hard stripe — narrower overall
        // (~65% of previous width) so it reads as a slender, natural
        // leg rather than a stacked rectangle.
        //
        // DEFERRED FOR facingUp this session per direct request: the
        // back-view near leg pair must be the absolute LAST thing drawn
        // in the whole function (on top of rider/weapon/everything), so
        // for facingUp this draw call is packaged into a closure and
        // fired at the very end via mountUpLegsDeferred instead of
        // running inline here.
        //
        // MOVED this session per direct request ("horse legs need to be
        // drawn in the bottom before anything else"): drawNearPairLegsV
        // itself is now DEFINED much earlier in this branch (right after
        // the vDir/color constants, before "FAR STRUCTURES FIRST"), and
        // for facingDown it is now CALLED there too — before the far leg
        // pair, before the neck, before the body — so the near/visible
        // leg pair is the very first thing painted and everything else
        // (body, haunch, neck/head) layers on top of it, exactly like a
        // real painter's-algorithm "legs are the ground-level/farthest-
        // back structural element" pass. The function definition only
        // stays hoisted; the facingUp case still fires it later via
        // mountUpLegsDeferred exactly as before (unaffected by this
        // change — see that closure below).
        //
        // Nothing below this point calls drawNearPairLegsV directly for
        // facingDown anymore — search "LEGS FIRST" near the top of this
        // branch for the new call site. drawFarPairLegsUpV has likewise
        // been hoisted up next to drawNearPairLegsV (search "HOISTED")
        // since facingUp now calls it before the haunch/tail block,
        // earlier in the draw order than this comment's old position.
        // facingUp legs are now drawn earlier in this branch, before
        // the haunch/tail block above — see the "MOVED this session"
        // comment near the top of the !facingDown block for the actual
        // call site and rationale. Nothing fires here anymore.

        // Riders (horse only — camel has no rider, gunner walks beside
        // it as a separate unit) still mount at roughly this height;
        // no change to riderHeightOffset needed here since the body's
        // vertical extent is similar to the side view's.
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


    // Darkened cutout for the eye socket
    // (The base script will draw the black pupil inside this at (-19, -10) right after)
    ctx.fillStyle = "#212121";
    ctx.beginPath();
    ctx.arc(-19, hBob - 10 + hn, 1.5, 0, Math.PI * 2);
    ctx.fill();

   
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

// ═══════════════════════════════════════════════════════════════════
// BACKSHOT / UP (facingDirY===-1) — infrastructure, this session,
// mirroring infscript.js's approach (see that file's big VERTICAL
// FACING comment block for the full PROBLEM 1 / PROBLEM 2 writeup —
// same reasoning applies here, not repeated in full).
//
// IMPORTANT: this must be declared AFTER the isElephant early-return
// above, and the closure below (drawRiderBody) must NOT include that
// early-return inside it — wrapping it would change behavior, since a
// `return` inside a closure only exits the closure, not the outer
// drawCavalryUnit call. Elephants would then fall through into the
// weapons-logic section below, which never happens today and isn't
// something this pass is set up to handle. Verified by checking
// save/restore balance and every `return` in this section before
// wrapping anything.
//
// useBackView mirrors infscript.js's armorVal<8 threshold, but the
// justification is different here: cavalry riders ALWAYS get SOME
// headgear even at low tier ("Every cavalry unit always gets SOME
// headgear — light steppe/nomad gear appropriate to faction," see the
// low-tier headgear dispatch below) — there's no bare-head fallback
// the way infantry had. Most of those low-tier designs (Mongol felt
// cap, Jurchen skullcap+ear-flaps, Yamato eboshi, Goryun cap, Dali
// headwrap, the generic fallback) turned out to be reasonably
// symmetric front-to-back already (domes, ear flaps, hanging tassels —
// nothing anatomically front-only). ONE exception was found and
// handled: the Xiaran turban's small nasal guard strip is a genuine
// front-only detail, skipped specifically when facingUp — search
// "nasal guard" in the low-tier headgear block below. The rider's
// ARMOR layering has no low-tier case at all (isCommander/Elite/
// >=25/>=8 dispatch, no final else) — low-tier riders get only the
// base tunic, same triangle either way, no redesign needed.
// ═══════════════════════════════════════════════════════════════════
// BACKSHOT COVERAGE UPDATE (this session): the "NOT DONE" note above
// (higher tiers / commander helmets) is now done. Real back-view art
// exists for medium, high, elite, and commander tier HEADGEAR — see
// drawBackHeadgear below, inserted right before drawRiderBody.
// Body ARMOR (capes/shields/pauldrons/vests) needed no equivalent
// function — it was checked and found to need no back-view changes at
// all (torso/shoulder/leg wraps are symmetric by construction; see the
// dedicated comment right above the armor chain itself, search "RIDER
// ARMOR LAYERS", for the full reasoning). useBackView is now just
// facingUp, same as infscript.js's equivalent update. Low-tier
// headgear/armor logic (described in the block above) is unchanged —
// it was already correct for both facings.
// facingUp/useBackView are now declared earlier in this function
// (see the comment right after facingDown, near the top) — moved
// there this session so the mount body's up/down pose block could
// reference them without a temporal-dead-zone error.

// ═══════════════════════════════════════════════════════════════
// BACK-VIEW HEADGEAR (facingUp / useBackView) — full sweep, this
// session, covering commander (10 faction cases), elite, high, and
// medium tiers. Low-tier is untouched (already correct — see the
// long comment above this block). Same design principle as
// infscript.js: bowls/domes/cones are mostly symmetric and kept
// as-is; anything anatomically FRONT-ONLY (nasal guards, chin ties,
// visors/face-shields, forehead bands, face-covering bandanas) is
// dropped and, where a faction had no rear element at all, replaced
// with a genuine rear equivalent (neck guard flare). Several designs
// needed NO change beyond dropping the shared face-oval below,
// because their "guard" elements were already side/rear-mounted
// (Player's Kingdom, Hong Dynasty, Great Khaganate's trailing
// horsetail, Yamato's shikoro, Jinlord's ear flaps, Tran's flared
// brim) — plumes and tassels that already trail backward off the
// crown are correct for both facings and are kept unchanged.
// ═══════════════════════════════════════════════════════════════
const drawBackHeadgear = () => {
    if (isCommander) {
        let plumeBob = isMoving ? Math.sin(animFrame * 1.5) * 2.5 : Math.sin(animFrame * 0.5) * 0.5;
        // NOTE: the shared "Exposed Hero Face" oval is deliberately
        // NOT drawn here — a face on the back of a head is exactly
        // the bug this pass exists to avoid. Everything else below
        // mirrors the front switch case-for-case.
        let cmdColor = (factionColor || "").toLowerCase();
        if (isJapan) cmdColor = "#c2185b";
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 0.5;

        switch (cmdColor) {
            case "#ffffff": // Player's Kingdom — already back-safe as-is
                ctx.fillStyle = "#546e7a";
                ctx.beginPath(); ctx.arc(0, -13, 4, Math.PI, 0); ctx.fill(); ctx.stroke();
                ctx.fillStyle = "#37474f";
                ctx.beginPath(); ctx.moveTo(-4, -13); ctx.lineTo(-5.5, -8); ctx.lineTo(5.5, -8); ctx.lineTo(4, -13); ctx.fill();
                ctx.strokeStyle = "rgba(183, 28, 28, 0.9)";
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(0, -17); ctx.quadraticCurveTo(3, -22 + plumeBob, 5, -16 + plumeBob); ctx.stroke();
                ctx.fillStyle = "#263238"; ctx.fillRect(-0.5, -18, 1, 5);
                break;

            case "#d32f2f": // Hong Dynasty — already back-safe as-is
                ctx.strokeStyle = "rgba(212, 175, 55, 0.8)";
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(0, -18); ctx.quadraticCurveTo(15, -25 + plumeBob, 22, -8 + plumeBob); ctx.stroke();
                ctx.strokeStyle = "rgba(183, 28, 28, 0.85)";
                ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(0, -18); ctx.quadraticCurveTo(12, -22 + plumeBob, 18, -10 + plumeBob); ctx.stroke();
                ctx.fillStyle = "#bfa15f";
                ctx.beginPath(); ctx.arc(0, -13, 3.5, Math.PI, 0);
                ctx.lineTo(4, -12); ctx.quadraticCurveTo(0, -11, -4, -12);
                ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.fillStyle = "#607d8b";
                ctx.beginPath(); ctx.moveTo(-3.5, -13); ctx.lineTo(-6, -7); ctx.quadraticCurveTo(0, -5, 6, -7); ctx.lineTo(3.5, -13); ctx.fill();
                ctx.strokeStyle = "rgba(0,0,0,0.2)";
                for (let i = -11; i < -6; i += 1.5) { ctx.beginPath(); ctx.moveTo(-5, i); ctx.lineTo(5, i); ctx.stroke(); }
                break;

            case "#1976d2": // Great Khaganate — already back-safe as-is
                ctx.fillStyle = "#455a64";
                ctx.beginPath(); ctx.arc(0, -13, 4, Math.PI, 0); ctx.fill(); ctx.stroke();
                ctx.fillStyle = "#3e2723";
                ctx.beginPath(); ctx.ellipse(0, -12, 4.5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = "rgba(17, 17, 17, 0.9)";
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(0, -17); ctx.quadraticCurveTo(-6, -14 + plumeBob, -8, -6 + (plumeBob * 1.5)); ctx.stroke();
                ctx.fillStyle = "#a88e52";
                ctx.beginPath(); ctx.moveTo(-1, -17); ctx.lineTo(0, -21); ctx.lineTo(1, -17); ctx.fill();
                break;

            case "#c2185b": // Yamato Clans — shikoro already wraps rear; drop the frontal maedate horns
                ctx.fillStyle = "#1a1a1a";
                ctx.beginPath(); ctx.arc(0, -12, 4.5, Math.PI, 0); ctx.fill();
                ctx.fillStyle = "#8e0000";
                ctx.fillRect(-5.5, -12, 11, 5);
                ctx.fillStyle = "#111";
                ctx.fillRect(-6, -10.5, 12, 0.8); ctx.fillRect(-6.5, -8.5, 13, 0.8);
                // No maedate horns — those mount at the front brow of
                // the bowl; from behind the shikoro is the whole story.
                break;

            case "#fbc02d": // Xiaran Dominion — drop the nasal guard (explicitly frontal)
                ctx.fillStyle = "#78909c";
                ctx.beginPath(); ctx.arc(0, -14, 3.5, Math.PI, 0); ctx.fill();
                ctx.fillStyle = "#c59b27";
                ctx.beginPath(); ctx.ellipse(0, -13, 4.5, 2.2, 0, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = "rgba(0,0,0,0.2)";
                ctx.beginPath(); ctx.moveTo(-3, -12); ctx.lineTo(3, -14); ctx.stroke();
                // Nasal guard dropped — a nose guard only makes sense
                // facing the wearer's own face.
                ctx.fillStyle = "#a37a1c";
                ctx.beginPath(); ctx.moveTo(4, -13); ctx.quadraticCurveTo(8, -8 + plumeBob, 6, -4); ctx.lineTo(3, -12); ctx.fill();
                break;

            case "#455a64": // Jinlord Confederacy — already back-safe as-is
                ctx.fillStyle = "#37474f";
                ctx.beginPath(); ctx.moveTo(-3.5, -12); ctx.lineTo(0, -21); ctx.lineTo(3.5, -12); ctx.fill(); ctx.stroke();
                ctx.fillStyle = "#263238";
                ctx.fillRect(-4.5, -12, 2.5, 5); ctx.fillRect(2, -12, 2.5, 5);
                ctx.fillStyle = "#8e1e1e";
                ctx.beginPath(); ctx.arc(0, -21, 1.5, 0, Math.PI * 2); ctx.fill();
                break;

            case "#388e3c": // Tran Realm — already back-safe as-is
                ctx.fillStyle = "#795548";
                ctx.beginPath(); ctx.arc(0, -11, 4.5, Math.PI, 0); ctx.fill(); ctx.stroke();
                ctx.fillStyle = "#5d4037";
                ctx.beginPath(); ctx.ellipse(0, -11, 6.5, 1.2, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = "#2e7031";
                ctx.fillRect(-3.5, -13.5, 7, 1.5);
                break;

            case "#7b1fa2": { // Goryun Kingdom — padded flaps already rear-appropriate; drop the frontal gold Mubis visor
                ctx.fillStyle = "#b71c1c";
                ctx.beginPath();
                ctx.moveTo(-5, -13); ctx.quadraticCurveTo(-6.5, -9, -5.5, -5);
                ctx.lineTo(-2.5, -5); ctx.lineTo(-2, -13); ctx.fill();
                ctx.beginPath();
                ctx.moveTo(2, -13); ctx.lineTo(2.5, -5); ctx.lineTo(5.5, -5);
                ctx.quadraticCurveTo(7, -9, 5, -13); ctx.fill();
                ctx.fillStyle = "#d4af37";
                const backStuds = [
                    [-5, -11], [-5.3, -9], [-5, -7],
                    [2.5, -11], [3, -9], [3.5, -7],
                    [4.5, -11], [5, -9], [5.5, -7]
                ];
                backStuds.forEach(s => { ctx.beginPath(); ctx.arc(s[0], s[1], 0.2, 0, Math.PI * 2); ctx.fill(); });
                ctx.fillStyle = "#1a1a1a";
                ctx.beginPath();
                ctx.moveTo(-3.2, -13.8);
                ctx.bezierCurveTo(-3.2, -19.4, -0.8, -21.8, 0, -22.2);
                ctx.bezierCurveTo(0.8, -21.8, 3.2, -19.4, 3.6, -14.2);
                ctx.lineTo(-3.2, -13.8); ctx.fill();
                // Gold Mubis visor dropped — a face-shield is
                // definitionally frontal.
                ctx.strokeStyle = "#ffcc00"; ctx.lineWidth = 0.3;
                ctx.beginPath(); ctx.moveTo(0, -14.2); ctx.lineTo(0, -22.2); ctx.stroke();
                ctx.fillStyle = "#d32f2f";
                ctx.beginPath(); ctx.moveTo(-1, -22.6); ctx.quadraticCurveTo(0, -25, 1, -22.6); ctx.fill();
                ctx.fillStyle = "#d4af37"; ctx.fillRect(-0.5, -23, 1, 0.8);
                ctx.strokeStyle = "#e0e0e0"; ctx.lineWidth = 0.25;
                ctx.beginPath();
                ctx.moveTo(0, -23); ctx.lineTo(0, -25.5);
                ctx.moveTo(-0.3, -23.8); ctx.lineTo(-0.5, -24.6);
                ctx.moveTo(0.3, -23.8); ctx.lineTo(0.5, -24.6);
                ctx.stroke();
                break;
            }

            case "#00838f": { // Dali Kingdom — drop the frontal red forehead band and chin tie
                const yOff = -0.75;
                ctx.fillStyle = "#8d6e63";
                ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 0.15;
                for (let i = 0; i < 3; i++) {
                    let y = -12.8 + i * 1.4 + yOff;
                    ctx.beginPath();
                    ctx.moveTo(-3.2, y); ctx.lineTo(-4.4, y + 0.3); ctx.lineTo(-4.0, y + 1.2); ctx.lineTo(-2.8, y + 0.9);
                    ctx.closePath(); ctx.fill(); ctx.stroke();
                }
                for (let i = 0; i < 3; i++) {
                    let y = -12.8 + i * 1.4 + yOff;
                    ctx.beginPath();
                    ctx.moveTo(3.2, y); ctx.lineTo(4.4, y + 0.3); ctx.lineTo(4.0, y + 1.2); ctx.lineTo(2.8, y + 0.9);
                    ctx.closePath(); ctx.fill(); ctx.stroke();
                }
                ctx.fillStyle = "#d4af37";
                ctx.beginPath();
                ctx.arc(0, -14.3 + yOff, 2.45, Math.PI, 0);
                ctx.lineTo(2.45, -13.2 + yOff); ctx.lineTo(-2.45, -13.2 + yOff);
                ctx.closePath(); ctx.fill();
                ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 0.18;
                for (let i = -1.8; i <= 1.8; i += 1.1) {
                    ctx.beginPath(); ctx.moveTo(i, -17 + yOff); ctx.lineTo(i, -13.2 + yOff); ctx.stroke();
                }
                // Red forehead band dropped — explicitly a forehead
                // (front) element.
                ctx.fillStyle = "#1a1a1a";
                ctx.beginPath();
                ctx.moveTo(-0.4, -17 + yOff); ctx.lineTo(-0.9, -18.0 + yOff);
                ctx.lineTo(0.2, -17.8 + yOff); ctx.lineTo(0.6, -18.3 + yOff); ctx.lineTo(0.4, -17 + yOff);
                ctx.fill();
                ctx.fillStyle = "#fbc02d";
                ctx.beginPath();
                ctx.moveTo(-0.6, -17 + yOff); ctx.quadraticCurveTo(0, -17.8 + yOff, 0.6, -17 + yOff);
                ctx.lineTo(0.4, -16.2 + yOff); ctx.lineTo(-0.4, -16.2 + yOff);
                ctx.closePath(); ctx.fill();
                // Chin tie dropped entirely — a tie fastens under the
                // chin, which does not exist on the back of the head.
                break;
            }

            case "#8d6e63": // High Plateau Kingdoms — drop the centered forehead turquoise stone
                ctx.fillStyle = "#424242";
                ctx.beginPath(); ctx.arc(0, -13, 4, Math.PI, 0); ctx.fill();
                ctx.strokeStyle = "rgba(255,255,255,0.1)"; ctx.lineWidth = 0.5;
                ctx.beginPath(); ctx.moveTo(-1.5, -13); ctx.lineTo(-1.5, -17); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(1.5, -13); ctx.lineTo(1.5, -17); ctx.stroke();
                ctx.fillStyle = "#8d6e63";
                ctx.fillRect(-5, -13, 2, 6); ctx.fillRect(3, -13, 2, 6);
                // Turquoise stone dropped — it's a centered forehead
                // ornament in the source design, not a wraparound band.
                ctx.fillStyle = "#9e2a2b";
                ctx.beginPath(); ctx.arc(0, -17, 2.5, Math.PI, 0); ctx.fill();
                break;

            case "#222222": // Bandits — drop the face-covering bandana, keep cap+spikes
                ctx.fillStyle = "#3e3a38";
                ctx.beginPath(); ctx.arc(0, -13, 3.5, Math.PI, 0); ctx.fill();
                ctx.fillStyle = "#545454";
                ctx.beginPath(); ctx.moveTo(-2, -15); ctx.lineTo(-1, -17); ctx.lineTo(0, -15); ctx.fill();
                ctx.beginPath(); ctx.moveTo(2, -15); ctx.lineTo(1, -17); ctx.lineTo(0, -15); ctx.fill();
                // Bandana dropped — it's worn across the face; its
                // trailing tail (originally drawn off to one side) is
                // kept as a simple rear-hanging cloth strip instead.
                ctx.fillStyle = "#7a2020";
                ctx.fillRect(-3.5, -12, 7, 1.2);
                break;

            default:
                ctx.fillStyle = "#455a64";
                ctx.beginPath(); ctx.arc(0, -12, 4, Math.PI, 0); ctx.fill(); ctx.stroke();
                ctx.fillStyle = "#263238"; ctx.fillRect(-0.5, -16, 1, 4);
                break;
        }
        return;
    }

    if (unitName.includes("Elite") || armorVal >= 40) {
        // Elite Cuman helmet — aventail neck guard already wraps rear
        // (extend it to a full curtain since the face mask it used to
        // pair with is gone); drop the steel face mask (explicitly
        // frontal); dome + trim are symmetric, keep.
        ctx.fillStyle = "#757575"; ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(-4.5, -13); ctx.lineTo(-4, -8); ctx.lineTo(4, -8); ctx.lineTo(4.5, -13); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        for (let i = -12; i <= -9; i += 1.2) { ctx.beginPath(); ctx.moveTo(-4, i); ctx.lineTo(4, i); ctx.stroke(); }
        // Face mask dropped entirely — a mask covers the face, which
        // has no back-of-head counterpart.
        ctx.fillStyle = "#9e9e9e"; ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-3.5, -13); ctx.lineTo(3.5, -13);
        ctx.quadraticCurveTo(0, -16, -1, -20);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = factionColor; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-3.5, -13); ctx.lineTo(3.5, -13); ctx.stroke();
        return;
    }

    if (armorVal >= 25) {
        // High Tier — same faction split as front, only the frontal
        // horns/tell are dropped where present.
        if (factionColor === "#c2185b" || isJapan) {
            ctx.fillStyle = "#212121"; ctx.beginPath(); ctx.arc(0, -12, 3.5, Math.PI, 0); ctx.fill();
            ctx.fillRect(-4, -12, 8, 1.5);
            // Gold horn accents dropped — frontal maedate, same
            // reasoning as the commander Yamato case above.
        } else if (factionColor === "#1976d2" || factionColor === "#455a64") {
            ctx.fillStyle = "#9e9e9e"; ctx.strokeStyle = "#424242"; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.arc(0, -13, 4, Math.PI, 0); ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#616161"; ctx.beginPath(); ctx.moveTo(-1, -16); ctx.lineTo(1, -16); ctx.lineTo(0, -20); ctx.fill();
            ctx.fillStyle = "#4e342e"; ctx.fillRect(-4, -13, 8, 4); // one rear curtain vs. two side flaps
        } else if (factionColor === "#00838f") {
            ctx.fillStyle = "#5d4037"; ctx.fillRect(-6, -14, 12, 3);
            ctx.fillStyle = "#8d6e63";
            ctx.beginPath(); ctx.moveTo(-5, -14); ctx.lineTo(-2, -22); ctx.lineTo(2, -22); ctx.lineTo(5, -14); ctx.fill();
            ctx.fillStyle = "#e0e0e0";
            ctx.fillRect(-3, -18, 6, 1.5);
            ctx.beginPath(); ctx.moveTo(-1, -22); ctx.lineTo(0, -25); ctx.lineTo(1, -22); ctx.fill();
            ctx.strokeStyle = "#e0e0e0"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(-6, -13); ctx.lineTo(-8, -15); ctx.moveTo(6, -13); ctx.lineTo(8, -15); ctx.stroke();
        } else {
            // Default heavy dome — plume trails backward already
            // (keep); wrap-around face+neck guard is explicitly
            // frontal (eye slit, jaw wrap), drop entirely and replace
            // with a plain rear neck curtain in the same material.
            ctx.fillStyle = "#d32f2f";
            ctx.beginPath();
            ctx.moveTo(0, -19.5);
            ctx.quadraticCurveTo(-3, -25.5, -5, -23.5);
            ctx.quadraticCurveTo(-1, -22.5, 0, -19.5);
            ctx.quadraticCurveTo(3, -25.5, 5, -23.5);
            ctx.quadraticCurveTo(1, -22.5, 0, -19.5);
            ctx.fill();
            ctx.fillStyle = "#9e9e9e"; ctx.strokeStyle = "#333333"; ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(-5, -13.5); ctx.quadraticCurveTo(0, -22.5, 5, -13.5);
            ctx.lineTo(4.5, -12); ctx.quadraticCurveTo(0, -11, -4.5, -12);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#ffd700";
            ctx.beginPath();
            ctx.moveTo(-1.2, -19); ctx.lineTo(1.2, -19); ctx.lineTo(0.8, -21); ctx.lineTo(-0.8, -21);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            // Wrap-around face+neck guard replaced with a plain rear
            // curtain (no eye slit — nothing to see through from here).
            ctx.fillStyle = factionColor;
            ctx.beginPath();
            ctx.moveTo(-5, -13); ctx.lineTo(-5.5, -7);
            ctx.quadraticCurveTo(0, -5.5, 5.5, -7); ctx.lineTo(5, -13);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 0.4;
            for (let x = -4; x <= 4; x += 2) { ctx.beginPath(); ctx.moveTo(x, -12); ctx.lineTo(x, -7.5); ctx.stroke(); }
            ctx.strokeStyle = "#b71c1c"; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(-4.5, -11); ctx.lineTo(-6.5, -6); ctx.moveTo(4.5, -11); ctx.lineTo(6.5, -6); ctx.stroke();
        }
        return;
    }

    if (armorVal >= 8) {
        // Medium Tier — Dali headwrap has one fold-detail line that's
        // decorative and ambiguous either way, kept; everything else
        // here had no front-only tell to begin with.
        if (factionColor === "#c2185b") {
            ctx.fillStyle = "#212121"; ctx.strokeStyle = "#fbc02d"; ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(-5, -10.5); ctx.lineTo(0, -13.5); ctx.lineTo(5, -10.5);
            ctx.closePath(); ctx.fill(); ctx.stroke();
        } else if (factionColor === "#1976d2" || factionColor === "#455a64") {
            ctx.fillStyle = "#4e342e"; ctx.beginPath(); ctx.arc(0, -12, 3, Math.PI, 0); ctx.fill();
            ctx.fillStyle = "#795548"; ctx.fillRect(-3.5, -12, 7, 1.5);
        } else if (factionColor === "#00838f") {
            ctx.fillStyle = "#1a237e"; ctx.strokeStyle = "#0d47a1"; ctx.lineWidth = 0.5;
            ctx.fillRect(-3, -14, 6, 2);
            ctx.beginPath(); ctx.arc(0, -14, 2.5, Math.PI, 0); ctx.fill(); ctx.stroke();
        } else {
            ctx.fillStyle = "#808080"; ctx.strokeStyle = "#333333"; ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.arc(0, -13.5, 4.8, Math.PI, 0);
            ctx.lineTo(4.8, -12.5); ctx.quadraticCurveTo(0, -12, -4.8, -12.5);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#555555";
            ctx.beginPath(); ctx.arc(0, -18.3, 1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = factionColor;
            ctx.beginPath(); ctx.rect(-5.2, -12.5, 2.2, 3.5); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.rect(3, -12.5, 2.2, 3.5); ctx.fill(); ctx.stroke();
            // "MINIMAL BACK NECK GUARD" in the front version is
            // already a rear guard by its own name — widen it slightly
            // since it's now the main rear element rather than a minor
            // addition to a mostly-front helmet.
            ctx.beginPath();
            ctx.moveTo(-3.5, -12.5); ctx.quadraticCurveTo(0, -11, 3.5, -12.5);
            ctx.lineTo(3.5, -9.5); ctx.quadraticCurveTo(0, -9, -3.5, -9.5);
            ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        return;
    }

    // armorVal < 8 should never reach here — useBackView's low-tier
    // headgear is handled inline in drawRiderBody itself (unchanged
    // from before this session), not through this function.
};

const drawRiderBody = () => {
ctx.save();
    // Kept in sync with isCamelCannonType above — same three-way check.
    let isCamelCannon = (type === "camel_cannon"
        || (unitName && unitName.toLowerCase().includes("camel cannon"))
        || (unit && unit.stats && unit.stats.role === "mounted_gunner"));

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
    //
    // BACKSHOT CHECK (this session): unlike headgear below, this whole
    // armor chain (commander cape/vest/pauldrons, elite shield/chausses/
    // vest/pauldrons, heavy vest/pauldrons, medium vest/pauldrons) needs
    // NO back-view changes. Reasoning: every piece here is a torso-wrap
    // polygon, shoulder-mounted pauldron, or leg-wrap — all symmetric
    // front-to-back by construction, unlike a helmet's anatomically
    // front-only chin strap or forehead band. Two pieces are in fact
    // MORE appropriate from behind than in front: the commander's
    // trailing cape (capes are worn ON the back) and the elite's
    // shield-on-back (also genuinely worn on the back). The "Ruby eyes
    // in the pauldrons" detail is a shoulder-mounted beast-head motif,
    // not an anatomical face, so it's fine from either facing too.
    // Checked line-by-line for any hidden front-only detail (visor,
    // mask, chin-adjacent element) before concluding this — found none.
    // drawBackArmor() was NOT created because there is nothing for it
    // to override; the chain below runs unconditionally regardless of
    // useBackView, same as before.
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
if (useBackView && (isCommander || (unitName && unitName.includes("Elite")) || armorVal >= 8)) {
    // Back view for commander/elite/high/medium: dispatch to the
    // dedicated back-headgear renderer above.
    // IMPORTANT — this condition deliberately mirrors the ORIGINAL
    // chain's actual routing, not just an armor-tier cutoff:
    // `if (isCommander) {...} else if (isElite||armorVal>=40) {...}
    // else if (armorVal>=25) {...} else if (armorVal>=8) {...} else
    // { LOW ARMOR TIER }`. isCommander is checked FIRST and
    // independent of armorVal — a commander named e.g. "General"
    // (not literally "PLAYER"/"Commander") is not guaranteed
    // armorVal>=8 by the armor-floor logic above (that floor only
    // applies to unitName==="PLAYER"||"Commander"), so gating this
    // dispatch on armorVal alone would have wrongly sent a low-armor
    // commander into the low-tier else-branch instead of
    // drawBackHeadgear()'s commander case. Checked and fixed before
    // finalizing. Low-tier riders (isCommander false, not "Elite",
    // armorVal<8) still fall through to the unchanged else-chain
    // below, reaching their own already-facing-aware LOW ARMOR TIER
    // branch exactly as before this session.
    drawBackHeadgear();
} else {
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
    } else {
        // ── LOW ARMOR TIER (< 8) ─────────────────────────────────────────────
        // Every cavalry unit always gets SOME headgear — light steppe/nomad gear
        // appropriate to faction. Horse archers (armor 5) land here most often.
        const fc = (factionColor || '').toLowerCase();
        const laBob = isMoving ? Math.sin(animFrame * 0.9) * 1.2 : 0;

        if (fc === '#1976d2') {
            // ── Mongol felt cap (Toqoz-style) — fur-trimmed leather bowl ──
            ctx.fillStyle = '#3e2723'; // dark leather bowl
            ctx.strokeStyle = 'rgba(0,0,0,0.55)';
            ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.arc(0, -13, 3.4, Math.PI, 0); ctx.fill(); ctx.stroke();

            // Fur trim ring at the brim
            ctx.fillStyle = '#4e342e';
            ctx.beginPath(); ctx.ellipse(0, -12.8, 4, 1.4, 0, 0, Math.PI * 2); ctx.fill();

            // Single short black horsehair tassel at the top
            ctx.strokeStyle = 'rgba(15,15,15,0.85)';
            ctx.lineWidth = 1.5; ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(0, -16.4);
            ctx.quadraticCurveTo(-3.5, -14 + laBob, -5, -10 + laBob * 1.2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, -16.4);
            ctx.quadraticCurveTo(2.5, -14.5 + laBob, 3, -11 + laBob);
            ctx.stroke();

            // Small brass spike finial
            ctx.fillStyle = '#a88c48';
            ctx.beginPath();
            ctx.moveTo(-0.8, -16); ctx.lineTo(0, -18.2); ctx.lineTo(0.8, -16);
            ctx.fill();

        } else if (fc === '#455a64') {
            // ── Jurchen Jin: simple iron skullcap with leather ear-flaps ──
            ctx.fillStyle = '#455a64';
            ctx.strokeStyle = '#263238';
            ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.arc(0, -13, 3.6, Math.PI, 0); ctx.fill(); ctx.stroke();

            // Iron banding (subtle horizontal lines)
            ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(-3, -14.5); ctx.lineTo(3, -14.5); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-3.3, -13); ctx.lineTo(3.3, -13); ctx.stroke();

            // Leather ear flaps
            ctx.fillStyle = '#4e342e'; ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 0.5;
            ctx.fillRect(-5, -13, 2.2, 4.5); ctx.strokeRect(-5, -13, 2.2, 4.5);
            ctx.fillRect(2.8, -13, 2.2, 4.5); ctx.strokeRect(2.8, -13, 2.2, 4.5);

        } else if (fc === '#c2185b') {
            // ── Yamato: simple eboshi (black lacquered court cap) ──
            ctx.fillStyle = '#111111';
            ctx.strokeStyle = '#333333'; ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(-3.2, -11.5);
            ctx.lineTo(-0.8, -18.5);
            ctx.lineTo(1.5,  -18.2);
            ctx.lineTo(3.2,  -11.5);
            ctx.closePath();
            ctx.fill(); ctx.stroke();

            // Gold band at base
            ctx.strokeStyle = '#c5a059'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(-3.2, -11.5); ctx.lineTo(3.2, -11.5); ctx.stroke();

        } else if (fc === '#fbc02d') {
            // ── Xiaran: simple cloth turban (ochre/gold) ──
            ctx.fillStyle = '#c59b27';
            ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.6;
            ctx.beginPath(); ctx.ellipse(0, -13.5, 3.8, 2.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

            // Wrap fold lines
            ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.7;
            ctx.beginPath(); ctx.moveTo(-3, -12.2); ctx.bezierCurveTo(-1,-14, 1,-14, 3,-12.5); ctx.stroke();

            // Small steel nasal guard — front-only detail (a nose
            // guard, by definition, only makes sense on the front of
            // the face), so it's skipped for the back view. Everything
            // else in this turban (dome, wrap folds, trailing silk end)
            // is reasonably symmetric front-to-back and stays as-is.
            if (!facingUp) {
                ctx.fillStyle = '#78909c';
                ctx.fillRect(-0.5, -12, 1, 3.5);
            }

            // Trailing silk end
            ctx.fillStyle = '#a37a1c';
            ctx.beginPath();
            ctx.moveTo(3.5, -13.5);
            ctx.quadraticCurveTo(6, -10 + laBob, 5, -7 + laBob);
            ctx.lineTo(3, -12);
            ctx.fill();

        } else if (fc === '#7b1fa2') {
            // ── Goryun Korean: padded leather cap ──
            ctx.fillStyle = '#4a148c';
            ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.7;
            ctx.beginPath(); ctx.arc(0, -13, 3.3, Math.PI, 0); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#6a1b9a';
            ctx.beginPath(); ctx.ellipse(0, -13, 3.8, 1.4, 0, 0, Math.PI * 2); ctx.fill();

            // Small gold pin
            ctx.fillStyle = '#d4af37';
            ctx.beginPath(); ctx.arc(0, -16.3, 0.9, 0, Math.PI * 2); ctx.fill();

        } else if (fc === '#00838f') {
            // ── Dali: indigo headwrap ──
            ctx.fillStyle = '#1a237e';
            ctx.strokeStyle = '#0d47a1'; ctx.lineWidth = 0.5;
            ctx.fillRect(-3, -14.5, 6, 2);
            ctx.beginPath(); ctx.arc(0, -14.5, 2.6, Math.PI, 0); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 0.6;
            ctx.beginPath(); ctx.moveTo(-2.2, -15); ctx.lineTo(2, -15.6); ctx.stroke();

        } else {
            // ── Generic fallback: basic leather skullcap ──
            ctx.fillStyle = '#5d4037';
            ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.arc(0, -13, 3.2, Math.PI, 0); ctx.fill(); ctx.stroke();
            // Simple brim strip
            ctx.fillStyle = '#4e342e';
            ctx.fillRect(-3.5, -13, 7, 1.5);
        }
    }
    } // end of outer useBackView-dispatch else (original headgear chain, low-tier included, unchanged)
}; // end of drawRiderBody closure

// Normal order: body first, then weapon on top (unchanged today for
// every rider that isn't a facing-up, low-armor-tier rider).
if (!useBackView && !isCamelCannonType) {
    drawRiderBody();
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
// ═══════════════════════════════════════════════════════════
// DOWNWARD FACING (facingDirY===1) — ported this session.
// Same rotation-offset trick as the default lancer's "MELEE LANCE"
// branch: the shaft/tip/hand shapes below are drawn along local +X
// and are left completely unchanged. For facingDown we always apply
// a +90° base rotation (previously rotation only happened for the
// ~33% of units on the "swing" style at all) so the shaft points
// down-screen; the swing wobble (swingAngle) still layers on top for
// swing-style units, same as before. The "thrust" lunge (used by the
// other ~67%, non-swing units) moves from the X component of the
// translate to the Y component, since translate happens BEFORE
// rotate here and is therefore unaffected by the rotation — it must
// be redirected explicitly rather than relying on the rotation to
// carry it, unlike the default lancer's thrustX/thrustY which are
// baked into the post-rotation shape coordinates instead.
// ═══════════════════════════════════════════════════════════
ctx.save();
// Apply translation for the "snap" thrust and rotation for the "swing"
if (facingDown) {
    ctx.translate(2, -4 + b + thrust);
} else {
    ctx.translate(2 + thrust, -4 + b);
}
// FLIP FIX (reverted): same correction as the default lancer's "MELEE
// LANCE" branch. Re-verified via trig — the tip is built at local
// (25..33, 0), positive X; rotating by DOWN_QUADRANT_ANGLE (45°) alone
// puts it at positive X/positive Y (down-and-toward-viewer, matching
// the horse's own head direction in this pose), which is forward. The
// +Math.PI previously added here flipped it to negative X/negative Y —
// backward, over the horse's tail — which is the bug being reported.
// Reverting to 45°-only so this stays consistent with the never-flipped
// bow/arrow code just below, which has always pointed forward correctly.
const haLanceBaseRot = facingDown ? DOWN_QUADRANT_ANGLE : 0;
ctx.rotate(haLanceBaseRot + (isSwing ? swingAngle : 0));

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
if (isActionActive) unit._lastBowActiveMs = Date.now();

// Relaxed idle: 30% draw briefly post-shot, dropping to ~25% after 1.5s of no shooting.
// cycle 0.565 = 30% drawProgress; cycle 0.5375 = 25% drawProgress (formula: (cycle-0.4)/0.55)
let _msIdleHA = Date.now() - (unit._lastBowActiveMs || 0);
let _idleCycleHA = (_msIdleHA < 1500) ? 0.565 : 0.5375;
let cycle = isActionActive ? Math.max(0, maxCd - cd) / maxCd : _idleCycleHA;

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
// ═══════════════════════════════════════════════════════════════
// INDEPENDENT AIM — added this session. Replaces the old binary
// "facingDown ? 36° : 0°" snap with the CONTINUOUS aimAngle computed
// near the top of this function (from unit.x/y to unit.targetX/Y).
// This is the correct fit for a ranged weapon: a horse archer running
// in any direction should be able to aim at a target in ANY other
// direction, not just "toward camera" or "not toward camera" — a
// continuous angle covers the full circle where the old quadrant
// system only covered two discrete poses.
// FALLBACK: when the caller hasn't set unit.targetX/targetY (see the
// hasIndependentTarget contract at the top of this function),
// aimAngle defaults to 0 and aimFacingDown mirrors facingDown exactly
// — so a unit with no live target still gets today's old behavior
// (36° snap while facing down, flat otherwise) rather than silently
// losing its aim pose. hasIndependentTarget below picks between the
// two modes explicitly rather than trying to make one formula cover
// both, since the quantized fallback and the continuous target-aim
// are genuinely different behaviors, not the same math at different
// precision.
// ═══════════════════════════════════════════════════════════════
const DOWN_AIM_ANGLE = 0.4 * (Math.PI / 2);  // 36°, matches infscript.js's archer
// NOTE: DOWN_Y_OFFSET is now a LOCAL override, no longer numerically
// tied to infscript.js's foot archer (still 15px there). Per direct
// request, the horse archer's downward bow needed to sit closer to the
// rider than the shared 15px value gave — riders have a tighter body
// scale than standing infantry (same point raised earlier in this
// branch's own comments), so the same absolute offset reads as
// proportionally larger "detached" distance here. Tightened to 9px.
// If infscript.js's foot archer offset ever changes, this does NOT
// need to follow it anymore — they're intentionally decoupled now.
const DOWN_Y_OFFSET = 9;              // lower the whole aiming assembly (was 15)

// haBowRot / haPivotY: the actual rotation and pivot used below. In
// target mode, haBowRot is the FULL continuous aimAngle (clamped away
// from the horizontal quadrant logic entirely — a real angle, not a
// quantized pose) and haPivotY shifts proportionally to how steep that
// angle is, so a shallow target angle doesn't yank the pivot down/up
// as hard as a steep one does. In fallback mode, behavior matches the
// old code exactly.
const haBowRot = hasIndependentTarget ? aimAngle : (facingDown ? DOWN_AIM_ANGLE : 0);
const haPivotOffset = hasIndependentTarget ? (DOWN_Y_OFFSET * Math.sin(aimAngle)) : (facingDown ? DOWN_Y_OFFSET : 0);
const pivotY = handY + haPivotOffset;

const rotateAroundPivot = (px, py, angle) => {
    const ddx = px - handX, ddy = py - pivotY;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    return {
        x: handX + (ddx * cosA - ddy * sinA),
        y: pivotY + (ddx * sinA + ddy * cosA)
    };
};

ctx.save();
ctx.translate(handX, pivotY); 
ctx.rotate(bowKhatra + haBowRot); 
ctx.translate(-handX, -pivotY);

// isJapan already declared at top of function

// Asymmetric sizing for Yumi vs Symmetric for Nomad bows
let topTipY = isJapan ? handY - 24 : handY - 8; 
let botTipY = isJapan ? handY + 4  : handY + 8;  
let topDipY = isJapan ? handY - 14 : handY - 4; 
let botDipY = isJapan ? handY - 1  : handY + 8;  

// Horse archer bow color, changed to light brown per direct request
// to visually distinguish it from other bows — was dark "#3e2723"
// (Wood/Horn), matching infscript.js's foot archer. Now diverges:
// only THIS bow (the nomad/horse-archer style, isJapan===false) uses
// the lighter tone. Japan's Yumi (isJapan===true, black lacquer) is
// untouched, and infantry bows live in an entirely separate file
// (infscript.js) so they're unaffected by construction, not just by
// this branch.
ctx.strokeStyle = isJapan ? "#1a1a1a" : "#b8895f"; // Black lacquer vs light brown Wood/Horn
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
            const haArrowPt = rotateAroundPivot(rightHandX, rightHandY, haBowRot);
            if (hasArrow) {
                ctx.save();
                ctx.translate(haArrowPt.x, haArrowPt.y); 
                let haNockRot = 0;
                if (cycle >= 0.2 && cycle < 0.4) {
                    // Smoothly rotates the arrow into nocking position
                    let nockProgress = (cycle - 0.2) / 0.2;
                    haNockRot = (-Math.PI / 4) * (1 - nockProgress);
                }
                ctx.rotate(haNockRot + haBowRot);
                ctx.fillStyle = "#8d6e63"; ctx.fillRect(-4, -0.5, 16, 1); 
                ctx.fillStyle = "#9e9e9e"; ctx.beginPath(); ctx.moveTo(12, -1); ctx.lineTo(16, 0); ctx.lineTo(12, 1); ctx.fill(); 
                ctx.fillStyle = "#d32f2f"; 
                ctx.fillRect(-3, -1.5, 4, 1); ctx.fillRect(-3, 0.5, 4, 1); 
                ctx.restore();
            }

            // Draw Right Hand
            ctx.fillStyle = "#ffccbc"; 
            ctx.beginPath(); ctx.arc(haArrowPt.x, haArrowPt.y, 2, 0, Math.PI * 2); ctx.fill();
        }
        
        ctx.restore();
    }
// Triggers for the Cannon (formerly Camel Cannon / Zamburak — see the
// isCamelCannonType regex above, kept as-is for filtering/lookups; only
// the DISPLAYED name changed, not the internal type/matching logic).
// --- CANNON LOGIC (fully mountless artillery piece) ---
//
// REBUILT this session, replacing the prior version's accumulated
// issues: (1) the file-wide unconditional drawRiderBody() calls (fixed
// separately, above, via !isCamelCannonType guards on both call sites)
// were drawing a generic humanoid rider with no gate for this unit at
// all; (2) THIS block's own side-view gunner used to draw unconditionally
// before branching into up/down poses, which ALSO drew their own gunner
// — i.e. two overlapping figures for any up/down frame; (3) up/down
// selection was a steep-threshold three-way pose split, not a lock, so
// it never actually held a pose the way the user wanted.
//
// Fixed here by construction, not by patching:
//   - Exactly ONE gunner draw call, gated inside whichever single pose
//     branch actually fires — never both.
//   - Direction lock mirrors infscript.js's rocket cart EXACTLY (same
//     engage/hold/release state machine, same 300ms debounce, same
//     40px target-offset threshold, same faction-preference fallback)
//     per direct user request ("use the rocket launcher as a
//     reference"). Fields are namespaced _cannon* (not _rocket*) so a
//     unit mistyped between the two can never cross-contaminate state.
//   - Angles are the exact user spec ("up is 90 degrees up, down is 90
//     degrees down, sideways is parallel to x axis"): +-Math.PI/2 for
//     up/down, 0 for side — identical constants to the rocket's
//     ROCKET_PERPENDICULAR_UP/DOWN.
//   - Geometry is the side-view wheelbarrow silhouette (verified against
//     the user's reference screenshot) ROTATED by the locked angle,
//     same technique as the rocket's tubeBaseRot wrapping its tube draw
//     — one canonical drawing, rotated, not three hand-built re-layouts.
//     This guarantees the up/down poses can never desync from the side
//     silhouette the user confirmed looks right, and makes doubling
//     structurally impossible since there's only one draw call site.
else if (
    // NOTE: the old `type === "MOUNTED_GUNNER"` check here never matched
    // anything (visType values are lowercase, e.g. "camel_cannon" — the
    // ROLES constant "mounted_gunner" is what's role-compared, not this
    // string) so it was dead. Replaced with the same robust role-based
    // check used by isCamelCannonType above, keeping this gate in sync.
    type === "camel_cannon" ||
    (unitName && unitName.toLowerCase().includes("camel cannon")) ||
    (unit && unit.stats && unit.stats.role === "mounted_gunner")
) {
    let b = (typeof bob !== 'undefined') ? bob : 0;
    let reducedBob = b * 0.1;
    let ammo = (typeof unitAmmo !== 'undefined') ? unitAmmo : 1;
    let cd = (typeof cooldown !== 'undefined') ? cooldown : 0;
    let maxCd = (typeof unit !== 'undefined' && unit.stats && unit.stats.cooldown) ? unit.stats.cooldown : 1000;
    let cycle = isAttacking ? Math.max(0, maxCd - cd) / maxCd : 1.0;
    const hasAmmo = ammo > 0;

    // ── SINGLE GUNNER DRAW — called once, from inside whichever pose
    // branch fires below. Local function (not inline) so there is
    // exactly one place this geometry is defined, matching the
    // rocket's "ONE hand visible" fix reasoning: duplicating a figure
    // across branches is exactly how the old two-gunner bug happened.
    const drawGunner = () => {
        ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 1.8; ctx.lineJoin = "round";
        let gLegSwing = moving ? Math.sin(animFrame * 0.4) * 2 : 0;
        ctx.beginPath();
        ctx.moveTo(-1.5, -1); ctx.lineTo(-3 + gLegSwing, 6);
        ctx.moveTo(1.5, -1); ctx.lineTo(3 - gLegSwing, 6);
        ctx.stroke();
        ctx.fillStyle = factionColor; ctx.lineWidth = 1.0; ctx.strokeStyle = "#1a1a1a";
        ctx.beginPath(); ctx.rect(-3.5, -8, 7, 8.5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#ffccbc";
        ctx.beginPath(); ctx.arc(0, -10.5, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = factionColor; ctx.strokeStyle = "#212121"; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(-3.5, -12); ctx.lineTo(3.5, -12); ctx.stroke();
    };

    if (ammo <= 0) {
        // ── MODE A: SWORD COMBAT (CANNON STOWED) — unchanged from
        // before; melee fallback is orthogonal to the aim-lock/pose
        // work above and wasn't part of what broke.
        ctx.save();
        ctx.translate(2.0, reducedBob + 11.0);
        ctx.scale(1.275, 1.275);
        drawGunner();
        ctx.restore();

        ctx.save();
        ctx.translate(-1, reducedBob + 6);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "#4e342e"; ctx.fillRect(-4, -1, 8, 2);
        ctx.fillStyle = "#424242"; ctx.fillRect(2, -1.5, 12, 3);
        ctx.restore();

        var meleeCycle = cycle;
        var swingAngle = -Math.PI / 2;
        var handX = 4, handY = 8;
        var lunge = 0;

        if (isAttacking) {
            if (meleeCycle < 0.2) {
                swingAngle = -Math.PI / 1.2;
            } else if (meleeCycle < 0.5) {
                var p = (meleeCycle - 0.2) / 0.3;
                swingAngle = -Math.PI / 1.2 + (Math.PI * 1.5 * p);
                lunge = p * 6;
            } else {
                var p = (meleeCycle - 0.5) / 0.5;
                swingAngle = Math.PI * 0.3 - (Math.PI * 0.8 * p);
                lunge = 6 - (p * 6);
            }
        }

        if (facingDown) {
            handX = 1;
            handY = 8 + lunge;
        } else {
            handX = 4 + lunge;
        }

        ctx.save();
        ctx.translate(handX, handY + reducedBob);
        ctx.rotate(swingAngle + (facingDown ? DOWN_QUADRANT_ANGLE : 0));
        ctx.fillStyle = "#cfd8dc";
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(12, -1); ctx.lineTo(14, 0); ctx.lineTo(12, 1);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#90a4ae"; ctx.lineWidth = 0.5; ctx.stroke();
        ctx.fillStyle = "#ffca28"; ctx.fillRect(-1, -3, 2, 6);
        ctx.fillStyle = "#4e342e"; ctx.fillRect(-4, -1, 4, 2);
        ctx.fillStyle = "#ffccbc";
        ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

    } else {
        // ── MODE B: RANGED CANNON ──
        const isLaunching = isAttacking && hasAmmo;

        // DIRECTION LOCK — exact mirror of infscript.js's rocket cart
        // ENGAGE/HOLD/RELEASE state machine. See that file's own
        // top-of-file _computeCentroidLock comment for the full
        // reasoning; not re-derived here since it's a deliberate 1:1
        // port, per direct request.
        // SURGERY: direction now comes from the ENEMY SIDE's live
        // centroid instead of a spawn-corner guess, and can now lock
        // horizontal (side-by-side spawns) as well as vertical. Also,
        // per direct request ("this determination switches every
        // reload for cannon"), the lock now also releases on every
        // reload — an edge-detect on isAttacking dropping to false
        // (the narrow per-shot windup flash ending, same signal the
        // Repeater's isRepeaterFiring already keys off) — not just
        // when ammo fully runs out. Unlike the Rocket, which
        // intentionally holds for its whole volley.
        let lockedFacingY = 0; // 0 = side, 1 = down, -1 = up

        if (unit) {
            const CANNON_LOCK_DEBOUNCE_MS = 300;
            if (typeof unit._cannonLockChangeAt !== 'number') unit._cannonLockChangeAt = 0;
            const sinceCannonChange = Date.now() - unit._cannonLockChangeAt;

            // RELOAD EDGE-RELEASE — fires once per shot, right as the
            // windup flash ends and the reload/cooldown phase begins.
            if (!isAttacking && unit._cannonWasAttacking && unit._cannonLocked) {
                unit._cannonLocked = false;
                unit._cannonLockChangeAt = Date.now();
            }
            unit._cannonWasAttacking = isAttacking;

            if (isLaunching && !unit._cannonLocked && sinceCannonChange >= CANNON_LOCK_DEBOUNCE_MS) {
                const _cannonLock = _computeCentroidLock(unit, side);
                unit._cannonFacingY = (_cannonLock.axis === 'y') ? _cannonLock.dir : 0;
                unit._cannonFacingX = (_cannonLock.axis === 'x') ? _cannonLock.dir : 0;
                unit._cannonLocked = true;
                unit._cannonLockChangeAt = Date.now();
            } else if (!hasAmmo && unit._cannonLocked) {
                // Belt-and-suspenders: guarantees the lock clears when
                // ammo hits zero even on the frame the edge-release above
                // didn't catch.
                unit._cannonLocked = false;
                unit._cannonLockChangeAt = Date.now();
            }

            lockedFacingY = unit._cannonLocked ? (unit._cannonFacingY ?? 0) : 0;

            // SURGERY: while locked onto a horizontally-dominant enemy
            // centroid (lockedFacingY===0 but a horizontal lock is
            // active), force the unit's mirror to face that side.
            if (unit._cannonLocked && lockedFacingY === 0 && unit._cannonFacingX) {
                unit.facingDir = unit._cannonFacingX;
            }
        } else {
            lockedFacingY = facingDown ? 1 : (facingUp ? -1 : 0);
        }

        // PERPENDICULAR ANGLES — exact user spec: up = 90 deg up, down =
        // 90 deg down, side = parallel to x-axis. Same constants as the
        // rocket's ROCKET_PERPENDICULAR_UP/DOWN.
        const CANNON_PERPENDICULAR_DOWN = Math.PI / 2;
        const CANNON_PERPENDICULAR_UP = -Math.PI / 2;
        const cannonBaseRot = (lockedFacingY === 1) ? CANNON_PERPENDICULAR_DOWN
                            : (lockedFacingY === -1) ? CANNON_PERPENDICULAR_UP
                            : 0;

        // RECOIL — was a flat +X slide applied once here regardless of
        // pose, so for the up/down poses (whose barrels don't point
        // along X at all) it read as a meaningless sideways jiggle
        // instead of a kickback. Now applied per-pose below, along each
        // pose's own actual firing axis (backward = -muzzleDir), so it
        // visibly reads as "the gun kicks back when it fires" in every
        // pose instead of just(ish) the side view.
        let recoil = (isAttacking && cycle < 0.15) ? Math.sin((cycle / 0.15) * Math.PI) * 5 : 0;
        let gunAngle = -Math.PI / 30;
        let gunY = 0;
        if (isAttacking && cycle > 0.15 && cycle < 0.95) {
            gunAngle = Math.PI / 20;
            gunY = 1.0;
        }

        ctx.save();
        ctx.translate(8.0, gunY + (reducedBob || 0) + 8);

        // --- CANNON CARRIAGE — THREE DISTINCT HAND-BUILT POSES ---
        // Per direct user feedback, a single side silhouette rotated
        // wholesale for up/down looked like a "lazy rotation" and didn't
        // match the reference image's genuinely different up/down poses
        // (reference "up" is a back/top view with the gunner standing
        // upright beside a vertical barrel; reference "down" looks along
        // the barrel at the viewer, showing the bore as a circle, with
        // the gunner leaning over the breech from behind/above). So each
        // pose is now its own layout instead of one shape rotated by
        // cannonBaseRot. gunAngle (recoil kick) is still applied as a
        // small rotation local to each pose's own barrel draw.
        //
        // A shared bronze gradient is used for the barrel in all three
        // poses so the metal reads as actual cast bronze (dark-light-dark
        // banding) instead of the old flat brown fill.
        function bronzeGradient(x0, y0, x1, y1) {
            let g = ctx.createLinearGradient(x0, y0, x1, y1);
            g.addColorStop(0, "#3e2f16");
            g.addColorStop(0.45, "#8d6e3a");
            g.addColorStop(0.55, "#8d6e3a");
            g.addColorStop(1, "#5c4423");
            return g;
        }

        // Wheel spin — already tied to the unit's actual movement state
        // (isMoving -> "moving" param, upstream in troop_draw.js), not a
        // separate flag, so slowing the Cannon down (see troop_system.js)
        // doesn't disconnect this; it just means a slower, heavier-
        // feeling roll instead of no roll at all.
        let wheelRot = moving ? animFrame * 0.4 : 0;

        // Muzzle world-position per pose, used below for muzzle
        // flash/smoke and the swab/ram reload animation so those effects
        // still anchor to the actual muzzle instead of a fixed (23,0.5)
        // that only made sense for the old rotate-everything side pose.
        let muzzleX = 0, muzzleY = 0, muzzleDirX = 1, muzzleDirY = 0;
        // Touch-hole/ignition-match anchor — separate from muzzleX
        // because the match is lit at the BREECH (rear), not the muzzle.
        // Defaults to the side/down poses' existing spot; the up pose
        // overrides this to sit near its own barrel instead of the
        // gunner (see that pose's block for why).
        let igniteX = 4;

        // Reload phase computed ONCE, up front, before any pose draws —
        // so the "draw the rod/ball BEFORE the barrel" calls inside each
        // pose below and the "draw the flash AFTER everything" call at
        // the very end both agree on exactly which single phase is
        // active. This preserves the original if/else-if priority
        // (flash > swab > ball > ram > ignite) exactly; it's just split
        // by where each phase needs to sit relative to the barrel now.
        let reloadPhase = "none";
        // Flash/smoke duration HALVED per direct request. Was a fixed
        // cd>270 threshold; expressed as a fraction of maxCd instead so
        // "half the old duration" holds regardless of maxCd (which
        // itself just got faster below) rather than silently drifting
        // if the reload time is tuned again later.
        const FLASH_END_CD = (maxCd + 270) / 2; // duration (maxCd-FLASH_END_CD) = (maxCd-270)/2, i.e. exactly half of the old (maxCd-270)
        if (isAttacking && cd > FLASH_END_CD) reloadPhase = "flash";
        else if (isAttacking && cycle < 0.55) reloadPhase = "swab";
        else if (isAttacking && cycle < 0.65) reloadPhase = "ball";
        else if (isAttacking && cycle < 0.90) reloadPhase = "ram";
        else if (isAttacking && cycle < 0.99) reloadPhase = "ignite";

        // SWAB / BALL / RAM — factored into one function (same reasoning
        // as drawGunner above: one definition, called from wherever it's
        // needed, so there's no risk of the three poses drifting out of
        // sync) and called from INSIDE each pose below, immediately
        // BEFORE that pose's barrel is drawn. That ordering is the whole
        // fix: the barrel's own fill/stroke then paints OVER the rod, so
        // it reads as physically inserted into the bore rather than
        // floating in front of the gun, per direct request. IGNITE (the
        // lit match at the touch-hole) and FLASH are deliberately NOT
        // part of this function — a match at the touch-hole and a muzzle
        // blast both belong in FRONT of the gun, so they stay drawn
        // after, unchanged in spirit from before.
        const drawReloadSequence = () => {
            if (reloadPhase === "swab") {
                let p = (cycle - 0.15) / 0.40;
                let depth = Math.sin(p * Math.PI) * 15;
                ctx.strokeStyle = "#546e7a"; ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(muzzleX - muzzleDirX * depth, muzzleY - muzzleDirY * depth);
                ctx.lineTo(muzzleX - muzzleDirX * (depth - 10), muzzleY - muzzleDirY * (depth - 10));
                ctx.stroke();
            } else if (reloadPhase === "ball") {
                ctx.fillStyle = "#212121";
                ctx.beginPath();
                ctx.arc(muzzleX - muzzleDirX * 1, muzzleY - muzzleDirY * 1 + Math.sin(cycle * 40) * 2, 2, 0, Math.PI * 2);
                ctx.fill();
            } else if (reloadPhase === "ram") {
                let p = (cycle - 0.65) / 0.25;
                let depth = Math.sin(p * Math.PI) * 18;
                ctx.strokeStyle = "#cfd8dc"; ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(muzzleX - muzzleDirX * depth, muzzleY - muzzleDirY * depth);
                ctx.lineTo(muzzleX - muzzleDirX * (depth - 12), muzzleY - muzzleDirY * (depth - 12));
                ctx.stroke();
            }
        };

        if (lockedFacingY === 0) {
            // ── SIDE POSE — matches reference "side left" ──
            ctx.save();
            // Recoil kicks backward along -X (this pose fires along
            // +X) — the whole carriage jumps back briefly on firing,
            // appropriate for an early gun with no recoil-sled
            // mechanism of its own.
            ctx.translate(0 - recoil, 3);
            ctx.rotate(gunAngle);

            // Splayed trail leg — single wooden beam running back from
            // the carriage body (reference shows one visible trail beam
            // from this angle, not a V of two).
            ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 2.6; ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(-6, 2); ctx.lineTo(-23, 9);
            ctx.stroke();
            ctx.lineCap = "butt";

            // Carriage body
            ctx.fillStyle = "#5d4037"; ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-7, 0); ctx.lineTo(9, 0);
            ctx.lineTo(9, 4); ctx.lineTo(-7, 4);
            ctx.closePath();
            ctx.fill(); ctx.stroke();

            // Wheel — two-tone rim + hub
            ctx.save();
            ctx.translate(1, 10);
            ctx.rotate(wheelRot);
            ctx.fillStyle = "#4e342e"; ctx.strokeStyle = "#212121"; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#3e2723";
            ctx.beginPath(); ctx.arc(0, 0, 7, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
            ctx.strokeStyle = "#212121"; ctx.lineWidth = 1.2;
            for (let w = 0; w < 4; w++) {
                ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke();
                ctx.rotate(Math.PI / 4);
            }
            ctx.fillStyle = "#212121";
            ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
            ctx.restore();

            // Muzzle anchor set BEFORE the barrel draws (was after) so
            // drawReloadSequence() below can use it and still get
            // painted over by the barrel's own fill/stroke.
            muzzleX = 22; muzzleY = 0; muzzleDirX = 1; muzzleDirY = 0;
            igniteX = 4;

            drawReloadSequence();

            // Barrel — CONSISTENT diameter cylinder (matches the up
            // pose's near-uniform barrel, per direct request, instead of
            // the old taper down to half its breech width — which also
            // makes the ramrod running along y=0 read as properly
            // centered, since there's no longer a narrowing profile to
            // visually second-guess it against) with raised reinforcing
            // rings for a genuinely segmented cast-bronze look, plus a
            // flared muzzle swell.
            const barrelHW = 2.6; // half-width, held constant along the whole tube
            ctx.fillStyle = bronzeGradient(0, -barrelHW, 0, barrelHW);
            ctx.strokeStyle = "#2b1b10"; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-4, -barrelHW);
            ctx.lineTo(22, -barrelHW);
            ctx.lineTo(22, barrelHW);
            ctx.lineTo(-4, barrelHW);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            // Reinforcing rings — raised bands slightly wider than the
            // tube itself, spaced along its length, reading as cast
            // segmentation rather than the old single hairline strokes.
            ctx.fillStyle = "#6b5330"; ctx.strokeStyle = "#3e2f16"; ctx.lineWidth = 0.7;
            [0, 6, 12, 18].forEach(bx => {
                ctx.beginPath();
                ctx.rect(bx - 0.8, -barrelHW - 0.5, 1.6, (barrelHW + 0.5) * 2);
                ctx.fill(); ctx.stroke();
            });
            // Muzzle swell — flared beyond the tube's own diameter.
            ctx.fillStyle = "#7d5a3a";
            ctx.fillRect(19, -3.0, 3, 6.0);
            ctx.strokeRect(19, -3.0, 3, 6.0);
            // Bore
            ctx.fillStyle = "#1a1a1a";
            ctx.beginPath(); ctx.ellipse(22, 0, 2.0, 1.9, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#616161"; ctx.lineWidth = 0.6;
            ctx.beginPath(); ctx.ellipse(22, 0, 2.0, 1.9, 0, 0, Math.PI * 2); ctx.stroke();

            // Gunner — stands LOWER, roughly level with the wheel hub,
            // behind the trail handle (per user: "the side profile needs
            // the soldier to stand lower"). The old second stick pointing
            // up off the wagon handle has been removed entirely — only
            // the single trail beam above remains.
            ctx.save();
            ctx.translate(-16, 4.5);
            drawGunner();
            ctx.restore();

            ctx.restore();

        } else if (lockedFacingY === -1) {
            // ── UP POSE — matches reference "up": carriage on the left
            // with the barrel pointing straight up/away, gunner standing
            // fully upright to the right, both on the same ground line
            // (not a rotated side view). ──
            ctx.save();
            // Recoil kicks toward the viewer (+Y) — this pose fires
            // up/away (-Y), so recoiling means moving opposite that,
            // toward camera.
            ctx.translate(0, 3 + recoil);

            const gY = 0;

            // TWO wheels — shifted UP toward the barrel (was sitting
            // right at ground level with a big empty gap up to the
            // carriage; per direct request, closer to the barrel now).
            // REBUILT this session: the previous version drew a flat
            // rotating rectangle with a straight hub seam, which never
            // read as a wheel at all (a rotating plank, not a rotating
            // disc) — that was the "wheels don't look realistic"
            // report. Replaced with the same real circular
            // rim/spoke/hub construction the side pose already uses
            // (see the side-pose wheel above), just foreshortened
            // slightly via scale(1, 0.8) since we're viewing this pose
            // from the front/above rather than dead-on from the side.
            // Radius shrunk to 3 (from the side pose's 7) so two of
            // them fit side by side under the narrower up-pose post
            // without overlapping — the wheel centers below are 7
            // units apart (drawTopWheel(-10.5) / drawTopWheel(-3.5)),
            // so radius 4 would have collided by 1 unit; radius 3
            // leaves a clean 1-unit gap between them.
            const drawTopWheel = (wx) => {
                ctx.save();
                ctx.translate(wx, gY - 8);
                ctx.scale(1, 0.8);
                ctx.rotate(wheelRot);
                ctx.fillStyle = "#4e342e"; ctx.strokeStyle = "#212121"; ctx.lineWidth = 1.1;
                ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                // Two-tone rim shading, same technique as the side-pose wheel.
                ctx.fillStyle = "#3e2723";
                ctx.beginPath(); ctx.arc(0, 0, 3, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
                // Spokes — four evenly-spaced diameters through the hub,
                // rotating with the wheel so the spin actually reads.
                ctx.strokeStyle = "#212121"; ctx.lineWidth = 0.8;
                for (let w = 0; w < 4; w++) {
                    ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.stroke();
                    ctx.rotate(Math.PI / 4);
                }
                ctx.fillStyle = "#212121";
                ctx.beginPath(); ctx.arc(0, 0, 1.0, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            };
            drawTopWheel(-10.5); // left wheel, under the post's left edge
            drawTopWheel(-3.5);  // right wheel, under the post's right edge

            // Carriage post — LENGTHENED (was 7 units tall, now 9) so
            // the whole assembly reads as tall/sturdy instead of squat
            // next to the side view, per direct request.
            ctx.fillStyle = "#5d4037"; ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.moveTo(-10.5, gY); ctx.lineTo(-3.5, gY);
            ctx.lineTo(-4.5, gY - 9); ctx.lineTo(-9.5, gY - 9);
            ctx.closePath();
            ctx.fill(); ctx.stroke();

            // NEW — wide, flatter carriage bed sitting under the barrel,
            // capping the post and spanning noticeably wider than it
            // (the actual gun cradle/axle-bed a barrel would rest in),
            // per direct request. The narrow post alone read as the
            // barrel floating on a stick; this gives it a real base.
            ctx.fillStyle = "#4a352b"; ctx.strokeStyle = "#2b1f19"; ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.moveTo(-12, gY - 7.5); ctx.lineTo(-2, gY - 7.5);
            ctx.lineTo(-2, gY - 10); ctx.lineTo(-12, gY - 10);
            ctx.closePath();
            ctx.fill(); ctx.stroke();

            // Muzzle anchor + reload rod drawn BEFORE the barrel (was
            // after) so the barrel's own fill/stroke paints over the
            // rod, same fix as the side pose above. Y shifted -2 to
            // match the barrel's new base on the taller carriage bed.
            muzzleX = -8; muzzleY = gY - 29; muzzleDirX = 0; muzzleDirY = -1;
            // Ignition match anchor — was the shared default x=4, which
            // is exactly this pose's gunner x-position (see the gunner's
            // own translate(4, gY) below), so the lit match was
            // animating right on top of the soldier instead of near the
            // touch-hole. Shifted a few pixels left, toward the barrel/
            // carriage post (which sits around x=-3.5 to -10.5 in this
            // pose), per direct request.
            igniteX = -3;

            drawReloadSequence();

            // Barrel — bronze, pointing straight up/away, with a small
            // recoil kick (gunAngle) nudging it slightly when firing.
            // Base shifted up 2 units to sit on the new carriage bed;
            // full length unchanged. Reinforcing rings added to match
            // the side pose's segmented look, per direct request.
            ctx.save();
            ctx.translate(-7, gY - 8.5);
            ctx.rotate(gunAngle * 0.6);
            ctx.translate(7, -(gY - 8.5));
            ctx.fillStyle = bronzeGradient(-9.5, 0, -4.5, 0);
            ctx.strokeStyle = "#2b1b10"; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-9.5, gY - 8);
            ctx.lineTo(-10, gY - 29);
            ctx.lineTo(-6, gY - 29);
            ctx.lineTo(-4.5, gY - 8);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            // Reinforcing rings, spaced along the barrel's length.
            // FIXED this session: this barrel tapers (base edges at
            // x=-9.5/-4.5, tip edges at x=-10/-6 — see the polygon
            // above), but every ring used the SAME fixed rect
            // (x=-10.2, width 6.0), sized for the base only. Below the
            // base that's just wrong; above it, since the barrel
            // narrows toward the tip while the ring stayed the base's
            // width, the ring hung off-center relative to the actual
            // local barrel edges at that height — the "rings not
            // symmetrical to the barrel" report. Each ring's left/right
            // edge is now interpolated along the SAME two barrel edges
            // the polygon itself uses (base -9.5/-4.5 -> tip -10/-6),
            // at that ring's own y, so it always hugs the true local
            // width and is centered on it, the same way the side pose's
            // rings already sit centered on that (there, constant)
            // barrel width.
            const barrelBaseY = gY - 8, barrelTipY = gY - 29;
            const barrelBaseL = -9.5, barrelTipL = -10;
            const barrelBaseR = -4.5, barrelTipR = -6;
            ctx.fillStyle = "#6b5330"; ctx.strokeStyle = "#3e2f16"; ctx.lineWidth = 0.6;
            [gY - 12, gY - 17, gY - 22, gY - 26].forEach(ry => {
                const t = (ry - barrelBaseY) / (barrelTipY - barrelBaseY);
                const localL = barrelBaseL + (barrelTipL - barrelBaseL) * t;
                const localR = barrelBaseR + (barrelTipR - barrelBaseR) * t;
                const localW = localR - localL;
                // Ring slightly wider than the local tube, same margin
                // (0.2 either side) the old fixed rect used relative to
                // its own base width.
                ctx.beginPath();
                ctx.rect(localL - 0.2, ry - 0.65, localW + 0.4, 1.3);
                ctx.fill(); ctx.stroke();
            });
            // Muzzle cap — no bore visible since we're looking at the
            // outside/back of it, only the rounded top.
            ctx.fillStyle = "#6b5330"; ctx.strokeStyle = "#2b1b10"; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.ellipse(-8, gY - 29, 2.4, 1.1, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.restore();

            // Gunner — full standing height, feet on the SAME ground
            // line as the wheel (not floating), positioned to the right
            // of the carriage as in the reference, steadying the trail
            // handle with one arm.
            ctx.save();
            ctx.translate(4, gY);
            ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 2.4;
            let gLegSwing2 = moving ? Math.sin(animFrame * 0.4) * 2 : 0;
            ctx.beginPath();
            ctx.moveTo(-1.7, -1); ctx.lineTo(-2.8 + gLegSwing2, 7);
            ctx.moveTo(1.7, -1); ctx.lineTo(2.8 - gLegSwing2, 7);
            ctx.stroke();
            ctx.fillStyle = factionColor; ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.rect(-3.7, -10, 7.4, 9.5); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = factionColor; ctx.lineWidth = 1.8;
            ctx.beginPath(); ctx.moveTo(-3.7, -6); ctx.lineTo(-8, -3); ctx.stroke();
            ctx.fillStyle = "#ffccbc";
            ctx.beginPath(); ctx.arc(0, -12.3, 3.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            // Hat — SHRUNK and shifted UP so more bare head shows below
            // the brim, per direct request (was covering most of the
            // head, leaving barely a sliver of face visible).
            ctx.fillStyle = "#1a1a1a";
            ctx.beginPath(); ctx.ellipse(0, -14.4, 3.7, 1.5, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#212121";
            ctx.beginPath(); ctx.arc(0, -15.6, 3.0, Math.PI, Math.PI * 2); ctx.fill();
            ctx.restore();

            ctx.restore();

        } else {
            // ── DOWN POSE — matches reference "down": looking along the
            // barrel toward the viewer, bore visible as a dark circle,
            // wheel/trail forming a splayed base below, gunner leaning
            // over the breech from behind/above, aiming down. ──
            ctx.save();
            // Recoil kicks away from the viewer (-Y) — this pose fires
            // toward the viewer (+Y), so recoiling means moving
            // opposite that.
            ctx.translate(0, -2 - recoil);

            const gY = 0;

            // Trail legs splayed toward the viewer.
            ctx.strokeStyle = "#4e342e"; ctx.lineWidth = 2.4; ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(-2, gY - 6); ctx.lineTo(-9, gY + 10);
            ctx.moveTo(2, gY - 6); ctx.lineTo(9, gY + 10);
            ctx.stroke();
            ctx.lineCap = "butt";

            // Wheel behind, foreshortened.
            ctx.save();
            ctx.translate(0, gY + 2);
            ctx.scale(1, 0.55);
            ctx.rotate(wheelRot);
            ctx.fillStyle = "#4e342e"; ctx.strokeStyle = "#212121"; ctx.lineWidth = 1.3;
            ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            for (let w = 0; w < 4; w++) {
                ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke();
                ctx.rotate(Math.PI / 4);
            }
            ctx.restore();

            // Carriage body block, behind the barrel.
            ctx.fillStyle = "#5d4037"; ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 1.3;
            ctx.beginPath(); ctx.rect(-6, gY - 8, 12, 7); ctx.fill(); ctx.stroke();

            // Muzzle anchor + reload rod drawn BEFORE the barrel (was
            // after) so the barrel's own fill/stroke paints over the
            // rod, same fix as the other two poses.
            muzzleX = 0; muzzleY = gY - 1.5; muzzleDirX = 0; muzzleDirY = 1;
            igniteX = 4;

            drawReloadSequence();

            // Barrel foreshortened toward the viewer — bronze cone with
            // a small recoil kick, ending in the muzzle rim + bore.
            ctx.save();
            ctx.translate(0, gY - 1.5);
            ctx.rotate(gunAngle * 0.6);
            ctx.translate(0, -(gY - 1.5));
            let bg = ctx.createRadialGradient(0, gY - 2, 1, 0, gY - 2, 10);
            bg.addColorStop(0, "#8d6e3a"); bg.addColorStop(1, "#3e2f16");
            ctx.fillStyle = bg; ctx.strokeStyle = "#2b1b10"; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-4, gY - 9); ctx.lineTo(4, gY - 9);
            ctx.lineTo(6, gY - 2); ctx.lineTo(-6, gY - 2);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            // Muzzle rim + bore, facing the viewer.
            ctx.fillStyle = "#6b4f28"; ctx.strokeStyle = "#2b1b10"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(0, gY - 1.5, 4.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#0d0a05";
            ctx.beginPath(); ctx.arc(0, gY - 1.5, 2.8, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#4a3420"; ctx.lineWidth = 0.6;
            ctx.beginPath(); ctx.arc(0, gY - 1.5, 2.8, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();

            // Gunner — crouched over the breech from above, leaning down
            // to aim, matching the reference's hunched-over silhouette.
            ctx.save();
            ctx.translate(0, gY - 13);
            ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.moveTo(-2, 2); ctx.lineTo(-3, 7);
            ctx.moveTo(2, 2); ctx.lineTo(3, 7);
            ctx.stroke();
            ctx.save();
            ctx.rotate(0.35);
            ctx.fillStyle = factionColor; ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.rect(-3.5, -6, 7, 7.5); ctx.fill(); ctx.stroke();
            ctx.restore();
            ctx.fillStyle = "#ffccbc";
            ctx.beginPath(); ctx.arc(1.5, -6.5, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#1a1a1a";
            ctx.beginPath(); ctx.ellipse(1.5, -8, 3.6, 1.4, 0.35, 0, Math.PI * 2); ctx.fill();
            ctx.restore();

            ctx.restore();
        }

        // ==========================================
        // MUZZLE FLASH & SMOKE — drawn AFTER every pose's barrel (a
        // blast bursts out in FRONT of the gun), anchored to this pose's
        // actual muzzle position/direction. SWAB/BALL/RAM used to also
        // live here, drawn after (i.e. on top of) the barrel — which is
        // exactly backwards for a rod that's supposed to look inserted
        // INSIDE the bore. Those three now draw from inside each pose,
        // before that pose's own barrel fill (see drawReloadSequence()
        // above), so the barrel paints over them instead. Only FLASH and
        // IGNITE (a match held at the touch-hole — also meant to be
        // visible, not occluded) remain here, both gated on the single
        // reloadPhase computed up front so priority (flash > swab > ball
        // > ram > ignite) is unchanged from before.
        // ==========================================
        if (reloadPhase === "flash") {
            ctx.fillStyle = "#fff176"; ctx.beginPath();
            ctx.arc(muzzleX + muzzleDirX * 1, muzzleY + muzzleDirY * 1, 3 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#ff5722"; ctx.beginPath();
            ctx.arc(muzzleX + muzzleDirX * 3, muzzleY + muzzleDirY * 3, 5 + Math.random() * 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "rgba(180, 180, 180, 0.7)";
            ctx.beginPath();
            ctx.arc(muzzleX + muzzleDirX * 8 - muzzleDirY * 2, muzzleY + muzzleDirY * 8 + muzzleDirX * 2, 7 + Math.random() * 4, 0, Math.PI * 2);
            ctx.arc(muzzleX + muzzleDirX * 13 + muzzleDirY * 1, muzzleY + muzzleDirY * 13 - muzzleDirX * 1, 5 + Math.random() * 4, 0, Math.PI * 2);
            ctx.fill();
        } else if (reloadPhase === "ignite") {
            let matchDip = Math.sin((cycle - 0.90) * 15) * 4;
            ctx.strokeStyle = "#ff5722"; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(igniteX, -7 + matchDip); ctx.lineTo(igniteX, -2); ctx.stroke();
        }

        ctx.restore();
    }
}
 else {

        // --- MELEE LANCE ---
        let b = bob || 0; // Ensure 'b' (bob) from the top of drawCavalryUnit is used
        let meleeTime = Date.now() / 600; 
        let cycle = isAttacking ? meleeTime % 1.0 : 0;
        
        let lanceRot = 0;
        let thrustX = 0;
        let thrustY = 0;

        // ═══════════════════════════════════════════════════════════
        // DOWNWARD FACING (facingDirY===1) — ported this session.
        // This is the main cavalry melee weapon, analogous to
        // infantry's spearman branch in infscript.js. The shaft/tip/
        // highlight/hand SHAPE code below is completely unchanged —
        // only a base rotation offset is added, same trick used for
        // infscript.js's peasant and two_handed branches.
        //
        // The shaft is drawn along local +X (moveTo/lineTo using
        // thrustX added directly to the X coordinate), so adding a
        // fixed +90° (Math.PI/2) base rotation redirects that whole
        // local +X axis to point down-screen instead of sideways —
        // including the THRUST phase (cycle >= 0.66, the final hit of
        // the 3-hit combo), where thrustX currently pushes the tip
        // forward along local X: with the +90° base applied, that same
        // push now correctly lands on screen-Y (reaching toward the
        // viewer) automatically, with no need to separately swap which
        // axis thrustX/thrustY land on (unlike the spearman/shortsword
        // edits, which needed an explicit axis swap because those
        // weren't already going through a shared rotation wrapper).
        // The two "sway" phases (cycle<0.66, the wind-up swings before
        // the final thrust) keep their existing lanceRot sway angle
        // ADDED on top of the new base, so the same 3-hit combo feel
        // (sway one way, sway the other, then thrust) carries over,
        // now oriented toward the viewer instead of to the side.
        //
        // NOT touched: the mount (horse) itself stays in normal side
        // view per the user's explicit simplification — only this
        // rider-held weapon redirects.
        // ═══════════════════════════════════════════════════════════
        // FLIP FIX (reverted): a prior session added +Math.PI here on the
        // theory that the lance tip was pointing backward over the horse's
        // tail. Re-verified with the actual geometry: the tip is built at
        // local (26..38, 0) — positive X. Rotating by DOWN_QUADRANT_ANGLE
        // (45°) alone puts the tip at positive X AND positive Y, i.e.
        // down-and-toward-the-viewer — which is genuinely forward in this
        // pose, since the horse's own head (see mountHeadDeferred above)
        // sits at increasingly positive Y from the neck seam, same
        // direction. Adding +180° flipped the tip to negative X/negative Y
        // instead — up and away from the viewer, back over the rider —
        // which is the actual bug reported after that change shipped. The
        // bow/arrow code was never given an equivalent flip and has always
        // pointed down-and-toward-viewer correctly under its own rotation
        // (DOWN_AIM_ANGLE, 36°, no +180 added) — this makes the lance
        // consistent with that already-correct reference instead of
        // fighting it. Reverting to 45°-only; same +45° camera-facing lean
        // as before, tip now reads as forward instead of backward.
        const lanceBaseRot = facingDown ? DOWN_QUADRANT_ANGLE : 0;

        if (isAttacking) {
            // 3-Hit Combo System
            if (cycle < 0.33) {
                let p = cycle / 0.33;
                lanceRot = lanceBaseRot + (-Math.PI / 4 * Math.sin(p * Math.PI));
            } else if (cycle < 0.66) {
                let p = (cycle - 0.33) / 0.33;
                lanceRot = lanceBaseRot + (Math.PI / 3 * Math.sin(p * Math.PI));
            } else {
                let p = (cycle - 0.66) / 0.34;
                lanceRot = lanceBaseRot;
                thrustX = Math.sin(p * Math.PI) * 18; 
                thrustY = Math.sin(p * Math.PI) * 3;
            }
        } else {
            // Idle (not attacking): still needs the base offset applied,
            // or the couched lance would rest pointing sideways while
            // the unit is otherwise posed facing the camera.
            lanceRot = lanceBaseRot;
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

// Backshot z-order: for facing-up, low-armor-tier riders, the body was
// deliberately NOT drawn earlier (see useBackView above) — draw it now,
// on top of everything the weapons-logic section above just drew, so
// the weapon reads as held behind/away from the viewer.
//
// BUGFIX (rider head rendering ~40px away from the neck / off in raw
// canvas space): this call used to sit AFTER the ctx.restore() below
// (was "2. Restores the Rider's bob and elevation layer"), which is
// the SAME restore that pops the outer ctx.save()/ctx.translate(x,y)/
// ctx.scale(facingDir,1) set up at the very top of drawCavalryUnit.
// Once that transform is popped, there is NO active translate/scale
// left at all — drawRiderBody() then drew the head at raw, untransformed
// canvas coordinates (e.g. local (0,-11) landing at device (0,-11)
// instead of near the unit's actual (x,y) position), which is exactly
// the "head is offset ~40px from the neck" bug reported after testing.
// FIX: call drawRiderBody() BEFORE this restore, while the outer
// transform is still active, then let the single restore below close
// both the weapon-logic layer AND the outer wrapper together (they
// were already sharing this one restore for every OTHER unit type in
// this function — horse_archer's useBackView path was the only one
// trying to run code after it).
if (useBackView && !isCamelCannonType) {
    drawRiderBody();
}

// Deferred horse head/chanfron (facing-down only; no-op otherwise) —
// called here, after the rider/weapon in BOTH z-order paths above,
// so the head genuinely overlays spear/quiver/rider-legs as the
// closest-to-viewer element, fixing the z-order bug reported after
// testing. Placed before the final ctx.restore() so it still draws
// within the same transform space as everything else in this function.
mountHeadDeferred();

// Deferred back-view (facing-up) near+far leg pairs — called last of
// all, per direct request that these legs sit at the bottom of the
// draw order (i.e. drawn on top of/after everything else: body,
// haunch, tail, rider, weapon, and even the horse head deferred call
// just above). No-op for every other facing/unit type.
mountUpLegsDeferred();

    ctx.restore(); // 2. Restores the Rider's 'bob' and elevation layer (and, for
    // every unit type including horse_archer, the outer translate/scale
    // set up at the very top of the function — see BUGFIX note above)

}