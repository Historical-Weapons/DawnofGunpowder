function computeFacingDir(unit) {
    const _dx = (unit._prevX !== undefined) ? (unit.x - unit._prevX) : 0;
    const _dy = (unit._prevY !== undefined) ? (unit.y - unit._prevY) : 0;

    // Horizontal threshold — wins outright above this, cancels vertical mode
    const H_THRESH  = 0.8;
    // Vertical candidate threshold — must exceed this AND persist N frames
    const V_THRESH  = 0.4;
    // Consecutive frames of vertical movement required before committing.
    // Critical for mobile — units almost always move diagonally, so without
    // hysteresis the sprite flickers between side-view and front/back every frame.
    const V_FRAMES  = 3;

    if (Math.abs(_dx) >= H_THRESH) {
        // ── HORIZONTAL WINS ───────────────────────────────────
        unit.facingDir       = (_dx > 0) ? 1 : -1;
        unit.facingDirY      = 0;
        unit._verticalFrames = 0;

    } else if (Math.abs(_dy) > V_THRESH) {
        // ── VERTICAL CANDIDATE ────────────────────────────────
        // Accumulate consecutive vertical frames; only commit after threshold.
        unit._verticalFrames = ((unit._verticalFrames) || 0) + 1;
        if (unit._verticalFrames >= V_FRAMES) {
            unit.facingDirY = (_dy > 0) ? 1 : -1;  // 1=down, -1=up
        }
        // Leave facingDir alone — hold last horizontal orientation.

    } else {
        // ── STATIONARY / SUB-THRESHOLD ────────────────────────
        unit._verticalFrames = 0;
        // Touch nothing — hold all last values.
    }

    // First-frame safety net (unit just spawned, _prevX not yet stamped).
    if (unit.facingDir === undefined) {
        unit.facingDir  = 1;
        // Player troops default to facing camera; enemy troops face away.
        unit.facingDirY = (unit.side === 'player') ? 1 : -1;
    }
    if (unit.facingDirY === undefined) {
        unit.facingDirY = (unit.side === 'player') ? 1 : -1;
    }

    // Stamp position for next frame's delta.
    unit._prevX = unit.x;
    unit._prevY = unit.y;
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — drawInfantryVertical(ctx, unit, moving, frame, factionColor)
//
// Hook location in infscript.js: immediately AFTER ctx.scale(unit.facingDir||1,1)
//   if (drawInfantryVertical(ctx, unit, moving, frame, factionColor)) { ctx.restore(); return; }
//
// At the hook point the canvas is already:
//   ctx.save() → ctx.translate(x, y) → ctx.scale(facingDir, 1)
// We draw at origin and return true → the caller does ctx.restore() and exits.
// Returns false immediately when facingDirY===0 — zero overhead for horizontal play.
// ─────────────────────────────────────────────────────────────────────────────
function drawInfantryVertical(ctx, unit, moving, frame, factionColor) {
    if (!unit || unit.facingDirY === 0 || unit.facingDirY === undefined) return false;
    if (unit.facingDirY === -1) {
        // Backshot — into the canvas, unit moving away from camera
        return drawInfantryBackshot(ctx, unit, moving, frame, factionColor,
            unit.unitType, unit._visType, unit.state === "attacking",
            unit.state === "FLEEING", unit.cooldown, unit.ammo, unit.side);
    }
    // facingDirY === 1: front view — original infscript already handles it fine
    return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — drawCavalryTopDown(ctx, unit, moving, frame, factionColor)
//
// THIS IS ALL PLACEHOLDER RENDERS AS THESE BELOW ARE TERRIBLE LOOKING
// ─────────────────────────────────────────────────────────────────────────────

function drawCavalryTopDown(ctx, unit, moving, frame, factionColor) {
    // Fast-exit: horizontal mode or not yet set.
    if (!unit.facingDirY) return false;

    // Bob animation.
    const b = moving ? Math.sin(frame * 0.4) * 1.5 : 0;

    // Unit variant detection (mirrors cavscript's own logic for consistency).
    const isElephant = !!(unit.unitType && /eleph|elefa/i.test(unit.unitType));
    const isCamel    = !!(unit.unitType && /camel/i.test(unit.unitType));

    // Armor-based rider colors.
    const armorVal  = (unit.stats && unit.stats.armor !== undefined) ? unit.stats.armor : 2;
    const riderCol  = armorVal >= 30 ? '#bdbdbd'
                    : armorVal >= 15 ? '#8d6e63'
                    :                  factionColor;
    const helmetCol = armorVal >= 30 ? '#9e9e9e'
                    : armorVal >= 15 ? '#795548'
                    :                  '#5d4037';

    // Body ellipse half-axes (wider than tall — horse is wide left-right).
    const bw = isElephant ? 26 : 16;   // half-width  (left-right)
    const bh = isElephant ? 13 : 9;    // half-height (up-down)

    // ── HORSE / ELEPHANT / CAMEL BODY ────────────────────────────
    ctx.fillStyle   = isElephant ? '#78909c' : '#6d4c41';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.ellipse(0, b, bw, bh, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Four leg stubs — small circles near each corner of the body ellipse.
    ctx.fillStyle = isElephant ? '#607d8b' : '#5d4037';
    [
        [-bw + 6,  bh - 3],
        [ bw - 6,  bh - 3],
        [-bw + 6, -bh + 3],
        [ bw - 6, -bh + 3]
    ].forEach(([lx, ly]) => {
        ctx.beginPath();
        ctx.arc(lx, ly + b, isElephant ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();
    });

    // Camel humps — two small circles sitting on top of body.
    if (isCamel) {
        ctx.fillStyle   = '#8d6e63';
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth   = 1;
        ctx.beginPath(); ctx.arc(-5, -bh + 1 + b, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc( 5, -bh + 1 + b, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    if (unit.facingDirY === 1) {
        // ── DOWN — HEAD TOWARD CAMERA ─────────────────────────
        // Mount head drawn at the BOTTOM of the body ellipse (closest to viewer).
        const headR = isElephant ? 7 : 4;
        ctx.fillStyle   = isElephant ? '#607d8b' : '#4e342e';
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.arc(0, bh + headR + 1 + b, headR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (!isElephant) {
            // Horse ears — two tiny circles flanking head.
            ctx.fillStyle = '#3e2723';
            ctx.beginPath(); ctx.arc(-3, bh + 2 + b, 2, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc( 3, bh + 2 + b, 2, 0, Math.PI * 2); ctx.fill();
        } else {
            // Elephant trunk stub pointing down toward viewer.
            ctx.strokeStyle = '#607d8b';
            ctx.lineWidth   = 4;
            ctx.lineCap     = 'round';
            ctx.beginPath();
            ctx.moveTo(0, bh + headR + 1 + b);
            ctx.lineTo(0, bh + headR + 10 + b);
            ctx.stroke();
        }

        // Rider — sits at the TOP of body (far side from viewer), facing camera.
        // Saddle / torso oval.
        ctx.fillStyle   = riderCol;
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.ellipse(0, -bh + 3 + b, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Rider helmet.
        ctx.fillStyle = helmetCol;
        ctx.beginPath();
        ctx.arc(0, -bh - 2 + b, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Face dot (rider facing toward camera).
        ctx.fillStyle = '#3e2723';
        ctx.beginPath();
        ctx.arc(0, -bh - 1 + b, 0.8, 0, Math.PI * 2);
        ctx.fill();

    } else {
        // ── UP — BUTT TOWARD CAMERA ───────────────────────────
        // Tail drawn at BOTTOM of body (closest to viewer when moving up).
        ctx.strokeStyle = '#4e342e';
        ctx.lineWidth   = 2;
        ctx.lineCap     = 'round';
        // Two curved tail strands for a natural look.
        ctx.beginPath();
        ctx.moveTo( 2, bh + b);
        ctx.quadraticCurveTo(-5, bh + 7 + b,  3, bh + 13 + b);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-2, bh + b);
        ctx.quadraticCurveTo( 5, bh + 6 + b, -3, bh + 12 + b);
        ctx.stroke();

        // Rider — sits at TOP of body (away from camera), back visible.
        ctx.fillStyle   = riderCol;
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.ellipse(0, -bh + 3 + b, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Back of helmet — no face dot.
        ctx.fillStyle = helmetCol;
        ctx.beginPath();
        ctx.arc(0, -bh - 2 + b, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    return true;
}

 