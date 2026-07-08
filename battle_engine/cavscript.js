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

    // ═══════════════════════════════════════════════════════════════════
    // VERTICAL FACING (bird's-eye up/down overhaul) — SESSION STATUS
    // ═══════════════════════════════════════════════════════════════════
    // unit.facingDirY is computed upstream in troop_draw.js's direction
    // block (same hysteresis quality as the existing left/right
    // facingDir). Meaning is identical to infscript.js: 1 = down-screen
    // / toward the player camera (front view, melee weapons point
    // down-screen), -1 = up-screen / into the canvas (back view — DONE
    // for low-armor-tier riders, see BACKSHOT / UP below), 0 = normal
    // side view.
    //
    // SCOPE PER THE USER: horse/elephant mount bodies still do NOT get
    // an up/down pose — deferred to a later session ("mounts up and
    // down animations if tokens allow"). The camel-cannon's wheeled gun
    // carriage was ALSO originally filed under that same deferral (it's
    // a vehicle, not a personal weapon), but the user explicitly asked
    // for it anyway — see PORTED below, it's now done as a bespoke
    // re-layout rather than a mount-body redesign, which sidesteps most
    // of the original "does a wheel read correctly facing the viewer"
    // concern by just re-drawing it deliberately instead of rotating it.
    //
    // PORTED (facingDirY===1 fully handled):
    //   Melee — all three rider melee spots:
    //   1. DEFAULT LANCER "MELEE LANCE" (search this file for that
    //      comment). The regular mounted lancer's couched-lance 3-hit
    //      combo — the main cavalry melee weapon. Redirected via a
    //      +90° base rotation added to the existing lanceRot; the
    //      thrust-phase reach (thrustX/thrustY) needed no separate axis
    //      swap since it's baked into shape coordinates that already go
    //      through that same rotation.
    //   2. horse_archer's "OUT OF AMMO: Melee Lance Fallback" (search
    //      "Melee Lance Fallback") — same +90° base-rotation trick, but
    //      here the lunge (`thrust`) IS applied in the translate (before
    //      the rotate), so it needed an explicit swap from the X to the
    //      Y translate component to still reach toward the viewer.
    //   3. camel-cannon / MOUNTED_GUNNER's "MODE A: SWORD COMBAT" (search
    //      that comment) — shortsword swing, only visible once that
    //      unit's ammo is depleted. Same pattern as #2: `lunge` (renamed
    //      from the original inline `handX` mutation) swaps from the X
    //      to the Y translate component for facingDown, plus the same
    //      +90° base rotation added to swingAngle.
    //   Ranged — bow-and-arrow, plus the camel-cannon:
    //   4. horse_archer's "RANGED COMBAT: Has Ammo" full bow-draw cycle
    //      (search "ACTIVE ARCHERY ANIMATION") — same two-technique
    //      split as infscript.js's archer branch: the bowKhatra rotation
    //      wrapper gets the same 45° base (DOWN_AIM_ANGLE, matching
    //      infscript.js's archer after visual feedback — see that
    //      file's archer branch for why 90°/straight-down looked wrong),
    //      while the arrow+hand (drawn after that wrapper closes) use a
    //      local rotateAroundPivot helper instead of an axis swap at the
    //      source, to avoid double-rotating the string vertex that
    //      already goes through the wrapper. The stowed lance prop
    //      drawn just before this section is left untouched (static
    //      accessory, same as every other stowed/strapped prop).
    //   5. camel-cannon / MOUNTED_GUNNER's "MODE B: RANGED CANNON" —
    //      DONE this session per direct user request (overriding the
    //      earlier deferral — see SCOPE note above). Unlike every other
    //      ranged weapon this session, this is a genuine RE-LAYOUT, not
    //      a rotation: the wheelbarrow chassis, single wheel, and barrel
    //      are individually repositioned with named constants
    //      (CANNON_DOWN_Y / CANNON_WHEEL_Y / CANNON_BED_Y) so the wheel
    //      and handle placement actually make sense facing the viewer,
    //      rather than an automatic rotation of side-view art that
    //      happened to carry a wheel along for the ride. Recoil (a
    //      horizontal kick in the side view) becomes a vertical kick
    //      here, matching "firing pushes the carriage away from the
    //      target" now being up-screen instead of sideways. Muzzle
    //      flash/smoke and the full swab/ball/ram/match-cord reload
    //      sequence all reach down from the (now downward-pointing)
    //      muzzle at the same relative depths/timings as the side view.
    //      infscript.js's rocket cart (a pushed handcart, not mount-
    //      integrated) got the same treatment and is a good side-by-
    //      side reference if this needs revisiting.
    //
    // Every ported melee spot keeps its shaft/blade/limb/hilt/hand SHAPE
    // code completely unchanged — only pivot/translate axes and base
    // rotation offsets were redirected. The camel-cannon (#5) is the one
    // exception that's a genuine re-layout rather than a redirect, since
    // it's a vehicle rather than a held weapon. None of this has been
    // visually tested (no way to render canvas output in this
    // environment) — the camel-cannon re-layout in particular is a
    // first-pass design following the reasoning in its own comments,
    // not a verified result.
    //
    // NOT PORTED / OUT OF SCOPE FOR CAVALRY:
    //   • Mount bodies (horse/camel/elephant) getting their own up/down
    //     pose — explicitly deferred by the user to a later session.
    //   • Backshot/up (facingDirY===-1) for all five ported spots above
    //     — see BACKSHOT / UP below, now in progress.
    // ─────────────────────────────────────────────────────────────
    //
    // ═══════════════════════════════════════════════════════════════════
    // BROADER ROADMAP NOTE (applies to both infscript.js and this file,
    // recorded here since cavscript.js is the more recently-touched
    // file as of this session — check infscript.js top-of-function
    // block too, they should be kept in sync):
    //
    // RANGED WEAPONS DOWN-FACING — DONE. Bow-and-arrow (archer,
    // horse_archer), infscript.js's "gun" hand cannon and "Firelance"
    // unit, infscript.js's "crossbow" (both Repeater and foot-stirrup
    // sub-mechanisms, once the user clarified reload always stays side-
    // view — only the aim/fire bookends redirect), infscript.js's
    // rocket cart, and this file's camel-cannon are all ported. Nothing
    // known remaining in this category — see the completeness sweep
    // noted in infscript.js's matching bullet before backshot work began.
    //
    // JAVELINIER — no longer excluded, REVISED per direct user follow-up
    // after seeing the archer's downward aim in action. The active
    // javelin (both its melee-stab and throwing sub-modes, which share
    // one render block in infscript.js) now aims perpendicular to the X
    // axis when facing down. Bomber and Slinger were NOT re-included in
    // this revision — still excluded, see infscript.js's "throwing"
    // branch notes for the precise split.
    //
    // BACKSHOT / UP (facingDirY===-1) — DONE for ALL rider armor tiers as
    // of this session (previously done for low-armor-tier only). See the
    // dedicated comment block right before `drawRiderBody` (search
    // "BACKSHOT COVERAGE UPDATE" in this file) for the full writeup —
    // short version: riders always get SOME headgear even at low tier
    // (unlike infantry's bare-hair fallback); low-tier designs were
    // mostly already symmetric front-to-back (one exception, Xiaran's
    // nasal guard, already handled); medium/high/elite/commander tiers
    // needed real new back-view helmet art (drawBackHeadgear, a parallel
    // function mirroring the front switch/if-chain case-for-case) since
    // those tiers have genuine front-only detail (visors, chin ties,
    // nasal guards, forehead bands, face-covering bandanas) that a
    // low-tier design never had. Body ARMOR (capes/shields/pauldrons/
    // vests) needed NO back-view changes at any tier — checked and
    // confirmed symmetric by construction (see "RIDER ARMOR LAYERS"
    // comment for the full reasoning); two pieces (commander's cape,
    // elite's shield-on-back) are in fact more natural from behind.
    // IMPORTANT DIFFERENCE FROM infscript.js: this file's isElephant
    // early-return had to stay OUTSIDE the drawRiderBody closure —
    // wrapping it would have changed elephant behavior (a `return`
    // inside a closure only exits the closure, not drawCavalryUnit),
    // verified before wrapping anything by checking save/restore
    // balance and every `return` in the section first. No early-return
    // branches exist in this file's weapons logic the way infscript.js's
    // archer/crossbow melee fallbacks did, so only ONE deferred
    // drawRiderBody() call was needed (at the true end of the
    // function), not several.
    // NOT DONE (unchanged from before): MOUNT UP/DOWN POSES — still
    // deferred, whole feature. Horse/elephant bodies stay side-view-only
    // regardless of facingDirY, for both the down case and the eventual
    // up case. The camel-cannon's wheeled gun carriage is the one
    // exception — see PORTED #5 above, it got a bespoke down-facing
    // re-layout instead of waiting for general mount-facing work, since
    // a small cart is a much smaller problem than a horse/camel/
    // elephant body silhouette. This is a SEPARATE feature from the
    // rider backshot work above — mount bodies were out of scope for
    // both this session and last, and remain so.
    // ═══════════════════════════════════════════════════════════════════
    
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

    // Safety: factionColor must always be a valid string for headgear switch logic
    if (!factionColor || typeof factionColor !== 'string') factionColor = '#888888';

    let animFrame = frame || (Date.now() / 100);
    // dir is always 1 — ctx.scale(facingDir) above handles all mirroring.
    // Keeping dir so all mount/rider offset math below compiles unchanged.
    let dir = 1;

    // Shared vertical-facing flag — see the VERTICAL FACING comment block
    // above for full context. Read by all three ported rider melee/
    // ranged spots (search "facingDown" to find them all).
    const facingDown = (unit && unit.facingDirY === 1);

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
const facingUp = (unit && unit.facingDirY === -1);
const useBackView = facingUp;

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
if (!useBackView) {
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
// DOWNWARD FACING (facingDirY===1) — ranged aiming. Structurally
// near-identical to infscript.js's archer branch (see that branch's
// comments for the full reasoning) — same two-technique split applies
// here for the same reason:
//
// (1) LIMBS + STRING are drawn inside this same bowKhatra rotation
//     wrapper, so adding DOWN_AIM_ANGLE to bowKhatra redirects the
//     whole bow shape for free. topTipY/botTipY/topDipY/botDipY and
//     the string's inner vertex (stringX, rightHandY) below are all
//     left completely unchanged.
// (2) ARROW + RIGHT HAND are drawn in their own transform AFTER this
//     wrapper's ctx.restore() (see below), so they need the SAME
//     rotateAroundPivot manual point-rotation infscript.js's archer
//     uses — redirecting the phase logic's rightHandX/rightHandY
//     values at the source (like the melee weapons did) would double-
//     rotate the string vertex above, which already gets the ambient
//     wrapper rotation for free.
//
// UPDATED per visual feedback on the infantry archer (same fix applied
// here): a full 90° straight-down rotation with no position change
// looked disconnected — floating at chest height aiming at their own
// feet. Fixed to 45° (DOWN_AIM_ANGLE) with the pivot lowered 30px
// (DOWN_Y_OFFSET), same numbers as infscript.js's archer for visual
// consistency between the two. No head-dip equivalent here — cavalry
// riders don't have the same exposed head-bow read as standing
// infantry, and mount-seated posture is a separate, deferred problem
// (see this file's MOUNT UP/DOWN POSES notes) — left alone for now.
//
// NOT touched: the stowed lance prop drawn just above this block —
// a strapped weapon is a static accessory regardless of aim
// direction, same reasoning as every other stowed/strapped prop this
// session (quivers, shields, stowed bows).
// ═══════════════════════════════════════════════════════════════
// REVISED (offset bug fix — see screenshot: bow rendering far from the
// rider, disconnected from hands/body). 45°/30px pushed the pivot too
// far below the rider and rotated too aggressively for this rider's
// tighter body scale. Tightened to 15px / ~40% of a quarter-turn (36°)
// — same shared numbers now used by infscript.js's archer (see that
// file's DOWN_AIM_OFFSET/DOWN_AIM_ROT) — keeping the whole bow+arrow+
// hand assembly closer to the rider's actual hand position instead of
// swinging out on a long, steep arc.
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
const pivotY = facingDown ? (handY + DOWN_Y_OFFSET) : handY;

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
ctx.rotate(bowKhatra + (facingDown ? DOWN_AIM_ANGLE : 0)); 
ctx.translate(-handX, -pivotY);

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
            const haArrowPt = facingDown ? rotateAroundPivot(rightHandX, rightHandY, DOWN_AIM_ANGLE) : { x: rightHandX, y: rightHandY };
            if (hasArrow) {
                ctx.save();
                ctx.translate(haArrowPt.x, haArrowPt.y); 
                let haNockRot = 0;
                if (cycle >= 0.2 && cycle < 0.4) {
                    // Smoothly rotates the arrow into nocking position
                    let nockProgress = (cycle - 0.2) / 0.2;
                    haNockRot = (-Math.PI / 4) * (1 - nockProgress);
                }
                ctx.rotate(haNockRot + (facingDown ? DOWN_AIM_ANGLE : 0));
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
        // ═══════════════════════════════════════════════════════════
        // DOWNWARD FACING (facingDirY===1) — ported this session.
        // Same rotation-offset trick as the other two cavalry melee
        // branches: blade/guard/hand shapes below (step 3) are drawn
        // along local +X and stay completely unchanged. `lunge` replaces
        // the original inline `handX = 4 + (p*6)` / `10 - (p*6)` — same
        // 0→6→0 shape across the swing cycle, just pulled into its own
        // variable so it can be applied to whichever axis the current
        // facing needs (X for the side view's sideways lunge, Y for the
        // down view's toward-the-viewer lunge) without duplicating the
        // phase-timing math twice.
        // ═══════════════════════════════════════════════════════════
        var meleeCycle = cycle; 
        var swingAngle = -Math.PI / 2; // Ready position
        var handX = 4, handY = 8;
        var lunge = 0;

        if (isAttacking) {
            if (meleeCycle < 0.2) { 
                // Wind up
                swingAngle = -Math.PI / 1.2; 
            } else if (meleeCycle < 0.5) { 
                // Swing down
                var p = (meleeCycle - 0.2) / 0.3;
                swingAngle = -Math.PI / 1.2 + (Math.PI * 1.5 * p);
                lunge = p * 6;
            } else { 
                // Recover
                var p = (meleeCycle - 0.5) / 0.5;
                swingAngle = Math.PI * 0.3 - (Math.PI * 0.8 * p);
                lunge = 6 - (p * 6);
            }
        }
		else{}

        if (facingDown) {
            handX = 1;          // small centered offset — no sideways drift while facing camera
            handY = 8 + lunge;  // lunge now reaches down-screen, toward the viewer
        } else {
            handX = 4 + lunge;  // original sideways lunge (unchanged behavior)
            // handY stays at its 8 baseline, as before
        }

        // 3. Render Shortsword
        ctx.save();
        ctx.translate(handX, handY + reducedBob);
        ctx.rotate(swingAngle + (facingDown ? DOWN_QUADRANT_ANGLE : 0));
        
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
    // ═══════════════════════════════════════════════════════════════
    // DOWNWARD FACING (facingDirY===1) — ported this session, per
    // explicit user request (overriding this session's earlier
    // deferral, which filed this under "mounts, later" reasoning that
    // no longer applies now that the user has asked for it directly).
    //
    // Same "genuine re-layout, not just a rotation" approach as
    // infscript.js's rocket cart (a good side-by-side reference if this
    // needs revisiting) — the wheelbarrow chassis, single wheel, and
    // barrel are re-positioned with named constants below rather than
    // just rotated, so the wheel/handle placement actually makes sense
    // from this angle instead of an automatic rotation of side-view art
    // that happened to carry a wheel along for the ride.
    //
    // DESIGN, for a future session to tune:
    //   - The barrel points down-screen (toward the viewer/target)
    //     instead of sideways; the muzzle end is at the LARGEST Y
    //     (furthest from the rider, closest to camera).
    //   - The frame's "back handles" (gripped near the rider in the
    //     side view) sit at the smallest Y (closest to the rider);
    //     the "front bed" extends toward the muzzle end.
    //   - The single wheel sits centered along the frame's length,
    //     same relative position as the side view.
    //   - recoil (a horizontal kick in the side view) becomes a
    //     vertical kick here — firing pushes the carriage AWAY from
    //     the target, i.e. up-screen (smaller Y), so it's now
    //     subtracted from the down-offset rather than added to X.
    //   - Muzzle flash/smoke and the whole swab/ball/ram/match-cord
    //     reload sequence all reach down from the muzzle instead of
    //     sideways, same relative depths/timings as the side view.
    // ═══════════════════════════════════════════════════════════════
    
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

    if (facingDown) {
        const CANNON_DOWN_Y = 20;   // how far below the rider the whole assembly sits
        const CANNON_WHEEL_Y = 8;   // wheel position along the frame's length
        const CANNON_BED_Y = 16;    // front bed / muzzle-end of the frame

        ctx.save();
        ctx.translate(0, CANNON_DOWN_Y + gunY + (reducedBob || 0) - recoil);
        ctx.rotate(gunAngle);

        // --- CHINESE WHEELBARROW WAGON CHASSIS ---
        ctx.save();
        ctx.translate(0, 3);

        // Frame — back handles (near rider) to front bed (toward muzzle)
        ctx.fillStyle = "#5d4037"; ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-3, -10);
        ctx.lineTo(3, -10);
        ctx.lineTo(3, CANNON_BED_Y);
        ctx.lineTo(-3, CANNON_BED_Y);
        ctx.closePath();
        ctx.fill(); ctx.stroke();

        // Wheel Strut / Axle Mount
        ctx.fillRect(-2, CANNON_WHEEL_Y - 4, 4, 8);
        ctx.strokeRect(-2, CANNON_WHEEL_Y - 4, 4, 8);

        // The Central Wheel
        let wheelRot = moving ? animFrame * 0.4 : 0;
        ctx.save();
        ctx.translate(0, CANNON_WHEEL_Y);
        ctx.rotate(wheelRot);
        ctx.fillStyle = "#4e342e"; ctx.strokeStyle = "#212121"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "#212121"; ctx.lineWidth = 1;
        for (let w = 0; w < 4; w++) {
            ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke();
            ctx.rotate(Math.PI / 4);
        }
        ctx.restore();
        ctx.restore();

        // Barrel — pointing down-screen, muzzle at the far end
        ctx.fillStyle = "#424242"; ctx.strokeStyle = "#212121"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-2, 2); ctx.lineTo(-1.5, 20); ctx.lineTo(2.5, 20); ctx.lineTo(3, 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#616161"; ctx.fillRect(-2.5, 20, 6, 3); // Muzzle ring

        // Support hand holding the stock
        ctx.fillStyle = "#ffccbc"; ctx.beginPath(); ctx.arc(2, 10, 2, 0, Math.PI * 2); ctx.fill();

        // Muzzle flash & smoke — reaching down from the muzzle
        if (isAttacking && cd > 270) {
            ctx.fillStyle = "#fff176"; ctx.beginPath();
            ctx.arc(0.5, 23, 3 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#ff5722"; ctx.beginPath();
            ctx.arc(0.5, 25, 5 + Math.random() * 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "rgba(180, 180, 180, 0.7)";
            ctx.beginPath();
            ctx.arc(-2, 30, 7 + Math.random() * 4, 0, Math.PI * 2);
            ctx.arc(1, 35, 5 + Math.random() * 4, 0, Math.PI * 2);
            ctx.fill();
        }
        // Reload sequence (swab -> ball -> ram) — same relative depths,
        // now reaching down from the muzzle instead of sideways
        else if (isAttacking && cycle < 0.55) {
            let p = (cycle - 0.15) / 0.40;
            let depth = Math.sin(p * Math.PI) * 15;
            ctx.strokeStyle = "#546e7a"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(0.5, 23 - depth); ctx.lineTo(0.5, 33 - depth); ctx.stroke();
        }
        else if (isAttacking && cycle < 0.65) {
            ctx.fillStyle = "#212121";
            ctx.beginPath(); ctx.arc(-1 + Math.sin(cycle * 40) * 2, 22, 2, 0, Math.PI * 2); ctx.fill();
        }
        else if (isAttacking && cycle < 0.90) {
            let p = (cycle - 0.65) / 0.25;
            let depth = Math.sin(p * Math.PI) * 18;
            ctx.strokeStyle = "#cfd8dc"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(0.5, 23 - depth); ctx.lineTo(0.5, 35 - depth); ctx.stroke();
        }
        else if (isAttacking && cycle < 0.99) {
            let matchDip = Math.sin((cycle - 0.90) * 15) * 4;
            ctx.strokeStyle = "#ff5722"; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(-7 + matchDip, 4); ctx.lineTo(-2, 4); ctx.stroke();
        }

        ctx.restore();

    } else {
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
    }
}}
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

    ctx.restore(); // 2. Restores the Rider's 'bob' and elevation layer 

// Backshot z-order: for facing-up, low-armor-tier riders, the body was
// deliberately NOT drawn earlier (see useBackView above) — draw it now,
// on top of everything the weapons-logic section above just drew, so
// the weapon reads as held behind/away from the viewer. Every other
// rider already drew its body before the weapons logic and does
// nothing here. No early-return branches exist in this file's weapons
// logic (unlike infscript.js's archer/crossbow melee fallbacks), so
// this single call at the true end of the function is sufficient —
// nothing else to guard against.
if (useBackView) {
    drawRiderBody();
}

}