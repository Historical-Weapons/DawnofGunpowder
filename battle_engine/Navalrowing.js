// ============================================================================
// NAVAL ROWING SYSTEM  — MOMENTUM PHYSICS REWRITE
// ============================================================================
// Handles oar-based ship propulsion: applies rowing forces from the move
// joystick, animates oar visuals, and applies water friction.
//
// PHYSICS MODEL (realistic momentum):
//   The joystick no longer directly steers the heading.
//   dx/dy are treated as a THRUST DIRECTION relative to the SHIP's LOCAL axes:
//     dy < 0  (up)    → thrust along ship's forward bow axis
//     dy > 0  (down)  → thrust along ship's stern axis (reverse / brake)
//     dx      (left/right) → lateral thrust (sculling, gentle sideways push)
//
//   The SHIP HEADING rotates ONLY via angular momentum (ang. velocity).
//   Angular acceleration comes from a "turning torque" which is proportional
//   to (dx / forward_speed) — hard to turn when slow, impossible when stopped
//   unless you pivot with opposing oars (dx-only input with no forward thrust).
//
//   This gives a totally different feel:
//     - At speed: pushing right makes the ship DRIFT right first, then yaw slowly.
//     - Standing still + dx: slow pivot.
//     - Realistic overshoot / momentum: you can't snap direction instantly.
//
// JOYSTICK VISUAL ALIGNMENT:
//   The joystick knob's visual offset rotates with the ship so "up on the
//   joystick" always means "forward on the ship" from the player's perspective.
//   This is handled in mobile_ui.js by reading ship.heading and rotating the
//   joystick overlay.
//
// SAIL (in naval_battles.js / mobile_ui.js):
//   Sail uses CW/CCW tap buttons — no joystick. See mobile_ui.js.
//   Enemy sails auto-trim via s._sailManual = false.
//   Player sail locks at last tapped position (_sailManual = true).
// ============================================================================

(function () {
    'use strict';

    if (window.NavalRowing) return; // idempotent

    // ── THRUST CONSTANTS ──────────────────────────────────────────────────
    const ROW_FORWARD_FORCE     = 0.110; // rowing thrust forward (px/frame²)  // <<<< TWEAK ROW FORCE
    const ROW_BRAKE_FORCE       = 0.090; // rowing thrust reverse / brake
    const ROW_LATERAL_FORCE     = 0.018; // weak sculling strafe thrust

    // ── OAR DESYNC / RESYNC CONSTANTS ─────────────────────────────────────
    const DESYNC_MIN            = 0.03;  // min per-oar phase offset (fraction of 2π)
    const DESYNC_MAX            = 0.12;  // max per-oar phase offset
    const RESYNC_PERIOD_STROKES = 8;     // stroke cycles between resync events
    const RESYNC_FRAMES         = 30;    // frames to blend a resync

    // ── OAR DRAW CONSTANTS ────────────────────────────────────────────────
    const OAR_SKIP_FRONT        = 1;     // skip this many bow oar slots (visual only)

    // Angular momentum physics — slower turning than default // <<<<
    const ANG_ACCEL_FACTOR    = 0.00013; // dx torque contribution at top speed      // <<<<
    const ANG_ACCEL_STILL     = 0.00060; // pivot accel when nearly stopped           // <<<<
    const ANG_FRICTION        = 0.80;    // angular velocity damping per frame        // <<<<
    const ANG_MAX             = 0.014;   // max angular velocity (rad/frame, ~0.8°/f) // <<<<

    const WATER_FRICTION      = 0.970;   // linear velocity damping per frame // <<<<
    const MIN_VELOCITY        = 0.060;   // below this, snap to zero
    const MAX_ROW_SPEED       = 1.80;    // hard cap on rowing speed (sail can exceed)

    // Oar animation tunables
    const STROKE_FREQ         = 0.275;  // stroke cycles per second when rowing hard (was 1.1 — reduced 4× for slower, more realistic paddle cadence)
    const STROKE_SWEEP        = 0.72;   // radians of arc per stroke (~41°)

    // Oar size tunables
    const OAR_LENGTH_FACTOR   = 0.385;  // total oar length vs ship beam
    const HANDLE_FRACTION     = 0.42;   // fraction inboard (into hull)

    // ─────────────────────────────────────────────────────────────────────────
    // getOarsPerSide(ship)
    // ─────────────────────────────────────────────────────────────────────────
    function getOarsPerSide(ship) {
        if (!ship) return 6;
        const t = String(ship.type || '').toLowerCase();
        const w = ship.width || 250;
        if (t.includes('light') || t.includes('scout') || t.includes('small')) return 4;
        if (t.includes('heavy') || t.includes('dragon') || t.includes('large')) return 10;
        if (t.includes('medium') || t.includes('junk')) return 8;
        if (w <= 220) return 4;
        if (w >= 300) return 10;
        return 8;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // applyInput(ship, helmInput, keys)
    //   MOMENTUM PHYSICS — joystick generates forces in ship-local space.
    //   dx = strafe/turning torque.  dy = forward/reverse thrust.
    //   Heading changes via angular velocity, NOT direct assignment.
    // ─────────────────────────────────────────────────────────────────────────
    function applyInput(ship, helmInput, keys) {
        if (!ship) return;
        // ── GRAPPLE LOCK: ship is lashed to another — no rowing, no turning ──
        // Also neutralize _rowState here (not just skip) — otherwise drawOars()
        // keeps smoothing toward the last stroke this ship was mid-way through
        // when contact happened, so the paddles visibly keep rowing in place
        // even though the hull itself is locked. This applies to both the
        // player ship and enemy AI ships, since both funnel through here.
        if (ship._grappled) {
            ship._rowState = { forward: 0, turn: 0, active: false };
            return;
        }

        // Resolve raw input
        let dx = 0, dy = 0;
        if (helmInput) { dx = helmInput.dx || 0; dy = helmInput.dy || 0; }
        if (keys) {
            if (keys.i) dy -= 1;
            if (keys.k) dy += 1;
            if (keys.j) dx -= 1;
            if (keys.l) dx += 1;
            dx = Math.max(-1, Math.min(1, dx));
            dy = Math.max(-1, Math.min(1, dy));
        }

        // Ship heading trig
        const heading = ship.heading || 0;
        const cosH = Math.cos(heading);
        const sinH = Math.sin(heading);

        // ── SHIP-LOCAL AXES ─────────────────────────────────────────────────
        // Forward axis: (cosH, sinH)
        // Right axis:   (sinH, -cosH)  →  90° clockwise from forward
        // dy < 0 = forward thrust,  dx > 0 = rightward lateral thrust

        const forward = -dy;   // +1 = full ahead, -1 = reverse
        const strafe  = dx;    // +1 = push right, -1 = push left

        // ── FORWARD / BACKWARD THRUST ───────────────────────────────────────
        // Only add rowing force if current speed is below MAX_ROW_SPEED.
        // This means at full sail speed (which can exceed MAX_ROW_SPEED),
        // rowing contributes nothing extra — just like a real sailing boat
        // where paddles are slower than the wind-driven hull.
        // Braking (reverse thrust) always applies regardless of speed.
        const spdBefore = Math.hypot(ship.vx || 0, ship.vy || 0);
        if (Math.abs(forward) > 0.05) {
            if (forward > 0) {
                // Forward row: only effective below the rowing speed cap
                if (spdBefore < MAX_ROW_SPEED) {
                    const force = forward * ROW_FORWARD_FORCE;
                    ship.vx = (ship.vx || 0) + cosH * force;
                    ship.vy = (ship.vy || 0) + sinH * force;
                }
            } else {
                // Reverse / brake: always applies
                const force = forward * ROW_BRAKE_FORCE;
                ship.vx = (ship.vx || 0) + cosH * force;
                ship.vy = (ship.vy || 0) + sinH * force;
            }
        }

        // ── LATERAL / STRAFE THRUST (weak realistic sculling) ───────────────
        if (Math.abs(strafe) > 0.05) {
            // Right-perpendicular to heading
            const rx = sinH;
            const ry = -cosH;
            ship.vx = (ship.vx || 0) + rx * strafe * ROW_LATERAL_FORCE;
            ship.vy = (ship.vy || 0) + ry * strafe * ROW_LATERAL_FORCE;
        }

        // ── ANGULAR MOMENTUM — dx generates turning torque ──────────────────
        // The faster you're going, the less effective the turn torque is
        // (a heavy ship needs momentum to carve). Standing still with dx only
        // gives you the ANG_ACCEL_STILL pivot rate.
        if (Math.abs(dx) > 0.05) {
            if (!ship.angularVelocity) ship.angularVelocity = 0;

            const speedFactor = Math.min(1.0, spdBefore / MAX_ROW_SPEED);
            // Blend: still = pivot (ANG_ACCEL_STILL), moving = speed-scaled torque
            const angAccel = speedFactor < 0.1
                ? ANG_ACCEL_STILL
                : ANG_ACCEL_FACTOR * (1 + speedFactor * 8.0); // more torque at speed

            ship.angularVelocity += dx * angAccel;
            // Clamp angular velocity
            ship.angularVelocity = Math.max(-ANG_MAX, Math.min(ANG_MAX, ship.angularVelocity));
        }

        // Store row state for oar animation
        ship._rowState = {
            forward: forward,
            turn:    dx,
            active:  (Math.abs(forward) > 0.1 || Math.abs(dx) > 0.1 || Math.abs(strafe) > 0.1)
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // applyWaterFriction(ship)
    //   Apply linear + angular drag each frame.
    // ─────────────────────────────────────────────────────────────────────────
    function applyWaterFriction(ship) {
        if (!ship) return;

        // Linear drag
        ship.vx = (ship.vx || 0) * WATER_FRICTION;
        ship.vy = (ship.vy || 0) * WATER_FRICTION;
        if (Math.hypot(ship.vx, ship.vy) < MIN_VELOCITY) {
            ship.vx = 0;
            ship.vy = 0;
        }

        // Angular drag — apply rotation and decay
        if (ship.angularVelocity) {
            ship.heading = (ship.heading || 0) + ship.angularVelocity;
            // Normalize heading
            while (ship.heading < 0)           ship.heading += Math.PI * 2;
            while (ship.heading >= Math.PI * 2) ship.heading -= Math.PI * 2;

            // Friction on angular velocity
            ship.angularVelocity *= ANG_FRICTION;
            if (Math.abs(ship.angularVelocity) < 0.0001) ship.angularVelocity = 0;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // drawOars(ctx, ship, time)
    //   Renders animated oars in ship-local space.
    //   Called BEFORE the deck layer so the deck covers the inboard portion.
    // ─────────────────────────────────────────────────────────────────────────
    function drawOars(ctx, ship, time) {
        if (!ship) return;
        const oarsPerSide = getOarsPerSide(ship);
        const w = ship.width;
        const h = ship.height;

        const oarLen = h * OAR_LENGTH_FACTOR;
        const thick  = Math.max(2.0, h * 0.028);

        const rowState = ship._rowState || { forward: 0, turn: 0, active: false };

        // ── SMOOTH THRUST (low-pass, ~0.3s time constant at 60fps) ──────────
        const SMOOTH_TAU = 0.055;
        if (!ship._smoothThrust) ship._smoothThrust = { port: 0, stbd: 0 };
        if (!ship._oarPhase)     ship._oarPhase     = { port: 0, stbd: 0 };

        const turnAmt = Math.abs(rowState.turn);

        // Compute raw target thrust per side
        let rawPort = rowState.forward;
        let rawStbd = rowState.forward;
        if (rowState.active && Math.abs(rowState.turn) > 0.05) {
            if (Math.abs(rowState.forward) < 0.15) {
                // Pure pivot: opposing strokes
                rawPort = (rowState.turn < 0) ? -Math.abs(rowState.turn) * 0.8 :  Math.abs(rowState.turn) * 0.8;
                rawStbd = (rowState.turn < 0) ?  Math.abs(rowState.turn) * 0.8 : -Math.abs(rowState.turn) * 0.8;
            } else {
                // Mixed: inside side slows
                const portIsInside = (rowState.turn < 0);
                rawPort = rowState.forward * (portIsInside  ? (1.0 - turnAmt * 0.70) : 1.0);
                rawStbd = rowState.forward * (!portIsInside ? (1.0 - turnAmt * 0.70) : 1.0);
            }
        }
        if (!rowState.active) { rawPort = 0; rawStbd = 0; }

        // Lerp toward raw target — fast decay when idle so oars settle to neutral immediately
        const _sTau = rowState.active ? SMOOTH_TAU : 0.40;
        ship._smoothThrust.port += (rawPort - ship._smoothThrust.port) * _sTau;
        ship._smoothThrust.stbd += (rawStbd - ship._smoothThrust.stbd) * _sTau;

        // ── ACCUMULATED PHASE — shared master phase ──────────────────────────
        const DT = 1 / 60;
        const _phaseMag  = Math.max(Math.abs(ship._smoothThrust.port), Math.abs(ship._smoothThrust.stbd));
        const _phaseSign = Math.abs(ship._smoothThrust.port) >= Math.abs(ship._smoothThrust.stbd)
            ? Math.sign(ship._smoothThrust.port) : Math.sign(ship._smoothThrust.stbd);
        ship._oarPhase.port += STROKE_FREQ * Math.PI * 2 * (_phaseMag * _phaseSign) * DT;
        ship._oarPhase.stbd  = ship._oarPhase.port;

        // Distribute oars along ship belly
        const startX  = -w * 0.32;
        const endX    =  w * 0.22;
        const spacing = (oarsPerSide > 1) ? (endX - startX) / (oarsPerSide - 1) : 0;
        const pivotY  = h * 0.42;

        // ── PER-OAR DESYNC OFFSETS ────────────────────────────────────────────
        // Seeded once per ship so offsets are stable (not re-randomized every frame).
        // Each oar gets a small phase offset in [DESYNC_MIN, DESYNC_MAX] * 2π,
        // positive or negative alternating so adjacent oars drift opposite ways.
        if (!ship._oarDesync || ship._oarDesync.length !== oarsPerSide * 2) {
            // Use ship position as a simple seed so different ships differ
            const seedBase = Math.abs(((ship.x || 1) * 73.1 + (ship.y || 1) * 151.3) % 1) ;
            const rng = (idx) => {
                // cheap deterministic pseudo-random from index + seed
                const s = Math.sin(seedBase * 127.1 + idx * 311.7) * 43758.5453;
                return s - Math.floor(s);
            };
            ship._oarDesync = [];
            for (let k = 0; k < oarsPerSide * 2; k++) {
                const mag  = DESYNC_MIN + rng(k) * (DESYNC_MAX - DESYNC_MIN);
                const sign = (k % 2 === 0) ? 1 : -1;
                ship._oarDesync[k] = mag * sign * Math.PI * 2;
            }
        }
        // ── RESYNC COUNTER ────────────────────────────────────────────────────
        // Track full stroke cycles since last resync and blend offsets toward 0.
        if (!ship._oarResyncTimer) ship._oarResyncTimer = 0;
        if (!ship._oarResyncBase)  ship._oarResyncBase  = null;
        if (RESYNC_PERIOD_STROKES > 0 && rowState.active) {
            const _cycleFrac = (ship._oarPhase.port / (Math.PI * 2)) % RESYNC_PERIOD_STROKES;
            if (!ship._oarLastCycleFrac) ship._oarLastCycleFrac = _cycleFrac;
            // Detect crossing zero (one full resync period elapsed)
            if (_cycleFrac < ship._oarLastCycleFrac - 1) {
                // Save the current offsets as the base to blend from
                ship._oarResyncBase  = ship._oarDesync.slice();
                ship._oarResyncTimer = RESYNC_FRAMES;
            }
            ship._oarLastCycleFrac = _cycleFrac;
        }
        // Apply resync blend: lerp desync offsets toward 0 then reset
        let _desyncMultiplier = 1.0;
        if (ship._oarResyncTimer > 0) {
            _desyncMultiplier = ship._oarResyncTimer / RESYNC_FRAMES;
            ship._oarResyncTimer--;
            if (ship._oarResyncTimer <= 0) {
                // Resync done — assign fresh offsets for the next period
                const seedB = Math.abs(((ship.x||1)*97.3 + (ship.y||1)*233.1 + Date.now()*0.0001) % 1);
                const rng2 = (idx) => {
                    const s2 = Math.sin(seedB * 127.1 + idx * 311.7) * 43758.5453;
                    return s2 - Math.floor(s2);
                };
                for (let k = 0; k < oarsPerSide * 2; k++) {
                    const mag  = DESYNC_MIN + rng2(k) * (DESYNC_MAX - DESYNC_MIN);
                    const sign = (k % 2 === 0) ? 1 : -1;
                    ship._oarDesync[k] = mag * sign * Math.PI * 2;
                }
                ship._oarResyncBase  = null;
                _desyncMultiplier    = 1.0;
            }
        }

        ctx.save();
        ctx.lineCap  = 'round';
        ctx.lineJoin = 'round';

        // ── KAYAK MODE DETECTION ─────────────────────────────────────────────
        // When rotating without significant forward thrust, only the pulling
        // side animates (like a kayak stroke); the opposite side rests flat.
        const isPureRotate = rowState.active &&
                             Math.abs(rowState.turn) > 0.15 &&
                             Math.abs(rowState.forward) < 0.15;
        // turn < 0 = turning port (left) → port oars (-1) are the active pulling side
        // turn > 0 = turning stbd (right) → stbd oars (+1) are the active pulling side
        const kayakActiveSide = rowState.turn < 0 ? -1 : 1;

        // ── HULL WALL CLIP BOUNDARY ───────────────────────────────────────────
        // The deck covers pivotY * 0.42 on each side.  We clip the inboard
        // (handle) half of every oar to a rect that stops at the centerline so
        // the handle tip is always hidden inside the hull.
        //
        // Clip polygon in ship-local space: a rect from -w*0.5 to +w*0.5 on X,
        // and 0 to side*pivotY on Y (one half per side, drawn per-side below).
        //
        // ── SWEEP ANGLE HARD STOP ─────────────────────────────────────────────
        // The handle tip sits at distance handleLen inboard from the pivot.
        // When the oar sweeps, the tip traces an arc.  The inner hull wall is
        // at Y=0 (centerline).  The perpendicular distance from the pivot to the
        // wall is pivotY.  The maximum inward angle before the tip crosses Y=0 is:
        //   maxInwardAngle = asin(pivotY / handleLen)   clamped to [0, π/2]
        // We compute this and clamp finalAngle so the handle never exits the hull.

        // OAR_SKIP_FRONT: skip the first N oars at the bow end (index 0..N-1).
        // The physical oar positions are still computed from the full distribution
        // so spacing stays proportional; we just don't draw the skipped slots.
        const _oarDrawStart = OAR_SKIP_FRONT;

        for (let i = _oarDrawStart; i < oarsPerSide; i++) {
            const oarX = (oarsPerSide === 1) ? 0 : (startX + i * spacing);

            for (let s = 0; s < 2; s++) {
                const side = (s === 0) ? -1 : 1;
                // Per-oar desync: each oar has a tiny unique phase offset
                // so they don't all sweep in perfect lockstep.
                // Index in _oarDesync: port side = i*2+0, stbd side = i*2+1.
                const _desyncIdx    = i * 2 + s;
                const _rawOffset    = (ship._oarDesync && ship._oarDesync[_desyncIdx]) || 0;
                const _desyncOffset = _rawOffset * _desyncMultiplier;

                const sidePhase  = ((side === -1) ? ship._oarPhase.port  : ship._oarPhase.stbd) + _desyncOffset;
                const sideSmooth = (side === -1) ? ship._smoothThrust.port : ship._smoothThrust.stbd;

                const baseAngle = side * Math.PI * 0.5;

                const _anyActive = Math.max(Math.abs(ship._smoothThrust.port), Math.abs(ship._smoothThrust.stbd));
                let strokeOffset = 0;

                const isInactiveSide = isPureRotate && (side !== kayakActiveSide);

                if (_anyActive > 0.02) {
                    if (isInactiveSide) {
                        const rawR    = Math.sin(sidePhase * 0.6);
                        const shapedR = Math.sign(rawR) * Math.pow(Math.abs(rawR), 0.28);
                        strokeOffset  = shapedR * STROKE_SWEEP * side;
                    } else {
                        const raw    = Math.sin(sidePhase);
                        const shaped = Math.sign(raw) * Math.pow(Math.abs(raw), 0.28);
                        strokeOffset = shaped * STROKE_SWEEP * (-side);
                    }
                }

                const handleLen = oarLen * HANDLE_FRACTION;
                const bladeLen  = oarLen * (1 - HANDLE_FRACTION);

                // ── SWEEP CLAMP: prevent handle tip from punching through hull wall ─
                // baseAngle = side * π/2.  In oar-local space the handle tip is at
                // (-handleLen, 0).  In ship-local Y:
                //   tipY = pivotY_world + (-handleLen) * sin(finalAngle)
                // We want tipY to stay inside [0, side*pivotY], i.e.
                //   the tip must not cross the centerline (Y=0 in ship space).
                // The inward sin component that puts the tip exactly at Y=0:
                //   side * pivotY + (-handleLen) * sin(FA) * sign = 0
                // where sign = side (because the tip moves toward centre when
                // sin(FA) has the same sign as side).
                //   sin(FA) = side * pivotY / handleLen   → FA = side * asin(ratio)
                // Add a small 5% margin so the tip stops just inside the wall.
                const _wallRatio   = Math.min(0.95, (pivotY * 0.95) / handleLen);
                const _maxSweep    = Math.asin(_wallRatio); // half-angle from vertical
                // baseAngle is already ±π/2.  We allow strokeOffset to pull the oar
                // up to _maxSweep radians away from the outboard perpendicular.
                const _clampedOff  = Math.max(-_maxSweep, Math.min(_maxSweep, strokeOffset));
                const finalAngle   = baseAngle + _clampedOff;

                ctx.save();
                ctx.translate(oarX, side * pivotY);
                ctx.rotate(finalAngle);

                // ── INBOARD CLIP: hide handle inside hull ─────────────────────────
                // In oar-rotated space the inboard direction is -X.
                // We clip to a large box that cuts off anything past X=0 (the pivot),
                // then re-draw the full shaft — the outer (blade) half is already
                // outside the hull and shows normally.  The deck layer drawn on top
                // of this in drawNavalShips covers the hull interior, so the handle
                // is doubly hidden: clipped here AND painted over by the deck fill.
                ctx.save();
                // Clip rect: allow the outboard half (positive local X, i.e. blade
                // side) freely, clip the inboard half so it doesn't overshoot.
                // In oar-local coords: blade goes +X, handle goes -X.
                // We allow inboard up to -(handleLen + small extra) but the VISUAL
                // cutoff is the hull inner wall, which in oar-local coords is at:
                //   -handleLen * sin(_clampedOff) projects back to pivotY in ship Y.
                // Simplest: just clip inboard half to [-handleLen, 0] in local X
                // so nothing ever visually extends past the pivot into open-canvas.
                const _bigNum = 5000;
                ctx.beginPath();
                ctx.rect(-handleLen - 2, -_bigNum, handleLen + bladeLen + 4, _bigNum * 2);
                ctx.clip();

                // Shaft
                ctx.strokeStyle = '#3d2810';
                ctx.lineWidth   = thick;
                ctx.beginPath();
                ctx.moveTo(-handleLen, 0);
                ctx.lineTo(bladeLen, 0);
                ctx.stroke();

                // Wood grain highlight
                ctx.strokeStyle = 'rgba(150,100,50,0.5)';
                ctx.lineWidth   = thick * 0.45;
                ctx.beginPath();
                ctx.moveTo(-handleLen * 0.85, -thick * 0.18);
                ctx.lineTo( bladeLen  * 0.82, -thick * 0.18);
                ctx.stroke();

                ctx.restore(); // pop inboard clip

                // Oarlock ring (always visible at pivot — outside the clip)
                ctx.strokeStyle = 'rgba(50,30,8,0.80)';
                ctx.lineWidth   = thick * 0.75;
                ctx.beginPath();
                ctx.arc(0, 0, thick * 0.95, 0, Math.PI * 2);
                ctx.stroke();

                // Blade ellipse
                const bladeHx = bladeLen * 0.14;
                const bladeHy = thick  * 1.22;
                ctx.fillStyle   = '#6b4a25';
                ctx.strokeStyle = '#2a1a08';
                ctx.lineWidth   = 1;
                ctx.beginPath();
                ctx.ellipse(bladeLen + thick * 0.5, 0, bladeHx, bladeHy, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.restore();
            }
        }

        ctx.restore();
    }

    // Public API
    window.NavalRowing = {
        applyInput:         applyInput,
        applyWaterFriction: applyWaterFriction,
        drawOars:           drawOars,
        getOarsPerSide:     getOarsPerSide,
        ROW_FORWARD_FORCE:  ROW_FORWARD_FORCE,
        ROW_BRAKE_FORCE:    ROW_BRAKE_FORCE,
        ANG_MAX:            ANG_MAX,
        WATER_FRICTION:     WATER_FRICTION
    };
})();