// ============================================================================
// NAVAL SAILING COSMETICS — Song Dynasty v5  (crescent-foil sails)
// ============================================================================
// Extracted from naval_battles.js.  This file owns:
//   • The sail overlay canvas (initSailCanvas / cleanupNavalSailCanvas)
//   • The RAF draw loop (_startSailLoop / drawNavalSailOverlay)
//   • Wind-responsive crescent-foil sail rendering (_drawJunkSails)
//   • Wind HUD compass (drawWindHUD)
//   • Hull-stability placeholder (_checkHullStabilityPlaceholder)
//
// LOAD ORDER: must come AFTER naval_battles.js (needs navalEnvironment, inNavalBattle).
// ============================================================================

// ============================================================================
// SAIL CANVAS — second HTML canvas layer, rendered above all units
// ============================================================================

function initSailCanvas() {
    let old = document.getElementById('navalSailCanvas');
    if (old) old.remove();

    let mc = document.getElementById('battleCanvas')
          || document.getElementById('gameCanvas')
          || document.querySelector('canvas');
    if (!mc) { console.warn('[NavalEngine] No main canvas found — sail overlay disabled.'); return; }

    navalEnvironment.mainCanvas = mc;

    let sc       = document.createElement('canvas');
    sc.id        = 'navalSailCanvas';
    sc.width  = window.innerWidth;
    sc.height = window.innerHeight;
    sc.style.cssText =
        'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9500;';
    document.body.appendChild(sc);
    navalEnvironment.sailCanvas = sc;
    navalEnvironment.sailCtx    = sc.getContext('2d');

    _startSailLoop();
}

function cleanupNavalSailCanvas() {
    let el = document.getElementById('navalSailCanvas');
    if (el) el.remove();
    navalEnvironment.sailCanvas = null;
    navalEnvironment.sailCtx    = null;
}

function _startSailLoop() {
    (function loop() {
        if (!inNavalBattle || !navalEnvironment.sailCtx) return;

        // FIX (rigging visible during loading): this RAF loop is entirely
        // decoupled from the battle-loading screen — it starts painting the
        // instant initNavalBattle() flips inNavalBattle=true, which happens
        // WHILE the loading screen is still up (by design — see the "PAINT
        // BEFORE WORK" fix in battle-loading-screen.js). The loading screen
        // itself fades in/out via CSS opacity over 0.4-0.5s rather than an
        // instant show/hide, and a translucent element lets whatever is
        // being drawn on the layer behind it (this sail canvas, z-index
        // 9500 vs the loading screen's 19999) bleed through during that
        // fade. Keep the RAF alive so sails are instantly ready the moment
        // loading ends, but skip the actual paint (and clear any leftover
        // frame) while loading is active.
        if (window.__battleLoadingActive) {
            let sc = navalEnvironment.sailCanvas;
            if (sc && navalEnvironment.sailCtx) navalEnvironment.sailCtx.clearRect(0, 0, sc.width, sc.height);
            requestAnimationFrame(loop);
            return;
        }

        drawNavalSailOverlay();
        requestAnimationFrame(loop);
    })();
}

function drawNavalSailOverlay() {
    if (!inNavalBattle) return;
    let ctx = navalEnvironment.sailCtx;
    if (!ctx) return;

    let sc = navalEnvironment.sailCanvas;
    if (sc.width !== window.innerWidth || sc.height !== window.innerHeight) {
        sc.width  = window.innerWidth;
        sc.height = window.innerHeight;
    }

    ctx.clearRect(0, 0, sc.width, sc.height);
    ctx.save();

    // ── CAMERA TRANSFORM ─────────────────────────────────────────────────────
    // Mirror the main game canvas transform (set by update.js each frame):
    //   ctx.translate(canvas.width/2,  canvas.height/2)
    //   ctx.scale(zoom, zoom)
    //   ctx.translate(-player.x, -player.y)
    // navalEnvironment.cameraX/Y/Scale are never written externally, so we
    // derive the transform directly from the live globals instead.
    var _cz   = (typeof zoom   !== 'undefined' && zoom   > 0) ? zoom   : 1;
    var _px   = (typeof player !== 'undefined' && player) ? (player.x || 0) : 0;
    var _py   = (typeof player !== 'undefined' && player) ? (player.y || 0) : 0;
    var _sw   = sc.width;
    var _sh   = sc.height;
    ctx.translate(_sw * 0.5, _sh * 0.5);
    ctx.scale(_cz, _cz);
    ctx.translate(-_px, -_py);

    // Apply global sway on top of the camera transform (matches drawNavalShips)
    ctx.translate(navalEnvironment.shipSwayX || 0, navalEnvironment.shipSwayY || 0);

    navalEnvironment.ships.forEach(s => _drawJunkSails(ctx, s));

    ctx.restore();

    if (typeof drawWindHUD === 'function') {
        drawWindHUD(ctx, sc.width, sc.height);
    }

    if (typeof battleEnvironment !== 'undefined' && battleEnvironment.units) {
        let pCmdr = battleEnvironment.units.find(u => u.isCommander && u.side === "player");

        if (pCmdr && pCmdr.hp <= 0) {
            ctx.save();
            ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
            ctx.fillRect(0, 0, sc.width, sc.height);

            ctx.textAlign    = "center";
            ctx.textBaseline = "middle";

            let mainFontSize = Math.min(64, sc.width * 0.1);
            ctx.fillStyle = "#ff3333";
            ctx.font      = `bold ${mainFontSize}px Georgia, serif`;
            ctx.shadowColor = "rgba(0,0,0,0.8)";
            ctx.shadowBlur  = 10;
            ctx.fillText("YOU HAVE FALLEN", sc.width / 2, sc.height / 2 - 20);

            let subFontSize = Math.min(24, sc.width * 0.04);
            ctx.fillStyle = "#ffca28";
            ctx.font      = `italic ${subFontSize}px Georgia, serif`;
            ctx.shadowBlur = 5;
            ctx.fillText("Press [P] or ↩️ to end Battle.", sc.width / 2, sc.height / 2 + 40);

            ctx.restore();
            return;
        }

        const aliveEnemies = battleEnvironment.units.filter(u => u.side !== 'player' && u.hp > 0).length;
        if (aliveEnemies < 1) {
            ctx.save();
            ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
            ctx.fillRect(0, 0, sc.width, sc.height);

            ctx.textAlign    = "center";
            ctx.textBaseline = "middle";

            let mainFontSize = Math.min(64, sc.width * 0.1);
            ctx.fillStyle = "#ffca28";
            ctx.font      = `bold ${mainFontSize}px Georgia, serif`;
            ctx.shadowColor = "rgba(0,0,0,0.8)";
            ctx.shadowBlur  = 10;
            ctx.fillText("VICTORY", sc.width / 2, sc.height / 2 - 20);

            let subFontSize = Math.min(24, sc.width * 0.04);
            ctx.fillStyle = "#ffffff";
            ctx.font      = `italic ${subFontSize}px Georgia, serif`;
            ctx.shadowBlur = 5;
            ctx.fillText("Press [P] or ↩️ to return to the Overworld.", sc.width / 2, sc.height / 2 + 40);

            ctx.restore();
        }
    }
}

function _shipSeed(s) {
    if (s._sailSeed == null) {
        s._sailSeed = Math.abs(((s.x || 1) * 127.1 + (s.y || 1) * 311.7) % 1000) / 1000;
        if (s._sailSeed < 0.01) s._sailSeed = 0.37;
        if (s._sailSeed > 0.99) s._sailSeed = 0.63;
    }
    return s._sailSeed;
}

// ============================================================================
// JUNK SAIL DRAWING SYSTEM — Corrected trim angles + goosewing running
// ============================================================================
// Coordinate frame (ship-local after ctx.rotate(heading)):
//   +X = bow (forward)    -X = stern (aft)
//   +Y = port (left)      -Y = starboard (right)
//
// Sails hang aft from the mast: tipA.x = 0 (at mast), tipB.x = -span (aft).
// boomAngle rotates the whole sail around the mast:
//   0 = sail lies along keel (close-hauled / in irons)
//   +90° = sail swings 90° to port (full port reach)
//   -90° = sail swings 90° to starboard
//
// wind.angle = direction wind blows FROM (meteorological convention, radians).
// relWind    = wind.angle - heading  → signed angle of wind arrival in ship frame.
//   relWind > 0 → wind arrives from PORT side  → lee is starboard? No:
//   Wind arriving from port means port is WINDWARD, starboard is LEEWARD.
//   leewardSign = relWind > 0 ? -1 (stbd lee) : +1 (port lee)
//   …wait, let's be explicit:
//   relWind > 0 means wind comes from the +Y (port) side
//   → windward = port (+Y), leeward = starboard (-Y)
//   → belly points to LEEWARD = starboard = -Y → draftSign = -1
//   relWind < 0 → wind from starboard → leeward = port = +Y → draftSign = +1
//   But BOOM also swings to leeward:
//   relWind > 0 (wind from port) → boom swings to stbd → boomAngle = negative
//   relWind < 0 (wind from stbd) → boom swings to port → boomAngle = positive
//   So: boomSign = relWind > 0 ? -1 : +1   (same as draftSign)
// ============================================================================
function _drawJunkSails(ctx, s) {
    const w    = s.width;
    const h    = s.height;
    const time = Date.now() / 1000;

    // ── WIND / POINT-OF-SAIL ──────────────────────────────────────────────────
    const wind    = (navalEnvironment && navalEnvironment.wind) || { angle: 0, speed: 0.5 };
    const windStr = Math.max(0.1, Math.min(1.0, wind.speed || 0.5));

    // relWind: signed angle of wind-FROM direction in ship-local frame.
    // Positive = wind arrives from port side; negative = from starboard.
    let relWind = wind.angle - (s.heading || 0);
    while (relWind >  Math.PI) relWind -= Math.PI * 2;
    while (relWind < -Math.PI) relWind += Math.PI * 2;

    const absRelWindDeg = Math.abs(relWind) * (180 / Math.PI);

    // boomSign: direction the boom swings (away from wind = toward leeward).
    // Canvas has +Y downward, so the sign conventions are:
    //   relWind > 0 → wind from port (+Y canvas-down side) → leeward = stbd (-Y) → boom swings -Y → +1
    //   relWind < 0 → wind from stbd (-Y) → leeward = port (+Y) → boom swings +Y → -1
    // The belly (draftSign) is the same sign: it also faces leeward (outward from hull).
    const boomSign = relWind > 0 ? 1 : -1;

    // For goosewing (running), use a stable per-ship side choice.
    const seed       = _shipSeed(s);
    const gooseSide  = seed >= 0.5 ? 1 : -1;   // main sail preferred side at running

    // ── TRIM TABLE ───────────────────────────────────────────────────────────
    // Maps absRelWindDeg → mainBoomDeg, foreBoomDeg, billowFrac
    // Matches the reference image (sails nearly parallel at close-hauled,
    // clearly perpendicular at beam reach, goosewing at running).
    //
    // Zones:  [0-20]  In Irons  — no boom angle, no fill, battens as lines
    //         [20-50] Close Hauled — very small angle, very flat
    //         [50-80] Close Reach  — opening out, moderate belly
    //         [80-105] Beam Reach  — well out, full belly
    //         [105-155] Broad Reach — nearly perpendicular, large belly
    //         [155-180] Running     — goosewing: main & fore on OPPOSITE sides
    //
    const isInIrons  = absRelWindDeg < 20;
    const isRunning  = absRelWindDeg > 155;

    let mainBoomDeg = 0;
    let foreBoomDeg = 0;
    let billowFrac  = 0;

    if (isInIrons) {
        // In irons — sail collapses to a line, no trim angle, no billow
        mainBoomDeg = 0;
        foreBoomDeg = 0;
        billowFrac  = 0;

    } else if (absRelWindDeg <= 50) {
        // Close Hauled: sail nearly parallel to centerline, very flat
        const t = (absRelWindDeg - 20) / 30;
        mainBoomDeg = 5  + t * 15;          // 5° → 20°
        foreBoomDeg = 7  + t * 18;          // 7° → 25°  (fore slightly more open)
        billowFrac  = 0.03 + t * 0.07;      // 0.03 → 0.10  (almost no belly)

    } else if (absRelWindDeg <= 80) {
        // Close Reach: sail opening out, belly growing
        const t = (absRelWindDeg - 50) / 30;
        mainBoomDeg = 20 + t * 25;          // 20° → 45°
        foreBoomDeg = 25 + t * 28;          // 25° → 53°
        billowFrac  = 0.10 + t * 0.20;      // 0.10 → 0.30

    } else if (absRelWindDeg <= 105) {
        // Beam Reach: sail well out, clear camber
        const t = (absRelWindDeg - 80) / 25;
        mainBoomDeg = 45 + t * 23;          // 45° → 68°
        foreBoomDeg = 53 + t * 25;          // 53° → 78°
        billowFrac  = 0.30 + t * 0.16;      // 0.30 → 0.46

    } else if (absRelWindDeg <= 155) {
        // Broad Reach: nearly perpendicular, large belly
        const t = (absRelWindDeg - 105) / 50;
        mainBoomDeg = 68 + t * 17;          // 68° → 85°
        foreBoomDeg = 78 + t * 8;           // 78° → 86°
        billowFrac  = 0.46 + t * 0.07;      // 0.46 → 0.53

    } else {
        // Running (155–180°): goosewing — main and fore on OPPOSITE sides.
        // Boom angle is fixed at ~88° (nearly perpendicular to keel).
        // Billow eases slightly since sails act more as panels than foils.
        const t = (absRelWindDeg - 155) / 25;
        mainBoomDeg = 85 + t * 3;           // 85° → 88°
        foreBoomDeg = 85 + t * 3;           // same magnitude, opposite sign below
        billowFrac  = 0.44 + t * 0.02;      // 0.44 → 0.46
    }

    // ── BUILD BOOM ANGLE RADIANS ──────────────────────────────────────────────
    // Normal (non-running): both sails swing to the leeward side (boomSign).
    // Running (goosewing): main takes gooseSide, fore takes opposite.
    //
    // draftSign controls which way the belly curves in boom-local Y.
    // The belly must face OUTWARD from the hull centroid (leeward side of the sail).
    // In boom-local frame the outward direction is the NEGATIVE of the swing direction:
    // if the boom swings to +Y (port), the outer face is -Y in boom-local → draftSign = -boomSign.
    let mainBoomRad, foreBoomRad, mainDraftSign, foreDraftSign;

    if (isRunning) {
        mainBoomRad   = mainBoomDeg * (Math.PI / 180) * gooseSide;
        foreBoomRad   = foreBoomDeg * (Math.PI / 180) * (-gooseSide);
        // Belly outward: opposite of which side the sail swings to
        mainDraftSign = -gooseSide;
        foreDraftSign =  gooseSide;
    } else {
        mainBoomRad   = mainBoomDeg * (Math.PI / 180) * boomSign;
        foreBoomRad   = foreBoomDeg * (Math.PI / 180) * boomSign;
        // Belly outward from hull on both sails
        mainDraftSign = -boomSign;
        foreDraftSign = -boomSign;
    }

    // Apply gentle wind-gust flutter to billow (no flutter in irons or running)
    if (!isInIrons && !isRunning) {
        billowFrac *= (1.0 + Math.sin(time * 0.55) * 0.03) * windStr;
    } else if (isRunning) {
        billowFrac *= windStr;
    }
    billowFrac = Math.max(0, billowFrac);

    // ── SHIP TYPE PARAMETERS ─────────────────────────────────────────────────
    const isHeavy  = s.type && s.type.toLowerCase().includes('heavy');
    const isLight  = s.type && s.type.toLowerCase().includes('light');
    const isMedium = !isHeavy && !isLight;

    // Mast positions along ship X-axis (bow = +w*0.5, stern = -w*0.5)
    const mastForeX =  (w * 0.35);
    const mastMainX = -(w * 0.10);

    const swScale = isHeavy ? 0.38 : (isMedium ? 0.32 : 0.26);
    const shMain  = w * (s.sailScale || 1) * (isHeavy ? 0.70 : (isMedium ? 0.65 : 0.60));
    const shFore  = w * (s.sailScale || 1) * (isHeavy ? 0.45 : (isMedium ? 0.42 : 0.38));
    const swMain  = h * swScale * 3;
    const swFore  = h * swScale * 0.80 * 3;

    // ── COLORS & THEME ───────────────────────────────────────────────────────
    const isPlayer   = s.side === 'player';
    const sailAlpha  = isInIrons ? 0.70 : 0.84;
    const sailFill   = isPlayer
        ? `rgba(205,165, 78,${sailAlpha})`
        : `rgba(175, 44, 32,${sailAlpha})`;
    const battenCol  = isPlayer ? 'rgba(90,55,12,0.90)'   : 'rgba(72,15,8,0.90)';
    const outlineCol = isPlayer ? 'rgba(80,50,10,0.62)'   : 'rgba(60,10,5,0.62)';
    const rigCol     = isPlayer ? 'rgba(115,78,32,0.52)'  : 'rgba(95,28,14,0.52)';
    const numBattens = isHeavy ? 8 : (isMedium ? 7 : 5);

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.heading + (s._rockAngle || 0));

    // ── SAIL DEFINITIONS ─────────────────────────────────────────────────────
    // Each sail: { mastX, span, thick, boomAngle, draftSign, isMain }
    const sailDefs = [
        {
            mastX:      mastForeX,
            span:       shFore,
            thick:      swFore,
            boomAngle:  foreBoomRad,
            draftSign:  foreDraftSign,
            isMain:     false,
        },
        {
            mastX:      mastMainX,
            span:       shMain,
            thick:      swMain,
            boomAngle:  mainBoomRad,
            draftSign:  mainDraftSign,
            isMain:     true,
        },
    ];

    sailDefs.forEach((sd, idx) => {
        const { mastX, span, thick, boomAngle, draftSign } = sd;

        // bellyY = maximum transverse draft offset in BOOM-LOCAL coordinates.
        // At running billow is smaller because sails act as wing panels.
        const bellyY = thick * billowFrac;

        // Helper: convert boom-local (bx,by) to ship-local coords
        function boomToShip(bx, by) {
            return {
                x: mastX + bx * Math.cos(boomAngle) - by * Math.sin(boomAngle),
                y:         bx * Math.sin(boomAngle) + by * Math.cos(boomAngle)
            };
        }

        const xA = 0;           // mast end
        const xB = -span;       // clew end (aft)

        ctx.save();
        ctx.translate(mastX, 0);
        ctx.rotate(boomAngle);

        // ── IN IRONS: collapsed battens, NO filled sail ───────────────────────
        if (isInIrons) {
            // The sail is completely depowered — it hangs as a stack of batten
            // lines along the centreline, no belly, no thickness, just the
            // horizontal structural lines and their slight random twitch.
            const flapSpeed = 14 + seed * 5;
            ctx.strokeStyle = battenCol;
            ctx.lineCap     = 'round';

            // Draw each batten as a short horizontal stroke with a gentle twitch
            for (let b = 0; b < numBattens; b++) {
                const t  = b / (numBattens - 1);
                const px = xA + t * (xB - xA);
                // tiny, slow side-to-side drift — not violent flickering
                const drift = Math.sin(time * flapSpeed * 0.4 + b * 1.2 + seed * 5) * 2.5;
                // batten length tapers: full width at mid-sail, shorter at ends
                const bLen  = thick * 0.55 * Math.sin(Math.PI * t) + thick * 0.12;
                ctx.lineWidth = b === 0 || b === numBattens - 1 ? 1.2 : 1.6;
                ctx.beginPath();
                ctx.moveTo(px, drift - bLen * 0.5);
                ctx.lineTo(px, drift + bLen * 0.5);
                ctx.stroke();
            }

            // Spine line connecting the batten tips (luff edge)
            ctx.lineWidth   = 1.0;
            ctx.strokeStyle = outlineCol;
            ctx.beginPath();
            ctx.moveTo(xA, 0);
            ctx.lineTo(xB, 0);
            ctx.stroke();

        } else {
            // ── FILLED SAIL: cambered foil ────────────────────────────────────
            const flobFreq  = 0.18 + seed * 0.06;
            const flobPhase = seed * Math.PI * 2;
            const flobMult  = 1.0 + 0.08 * Math.sin(time * flobFreq * Math.PI * 2 + flobPhase);
            const belly     = bellyY * flobMult;

            // Belly curves outward on the leeward face (draftSign direction).
            // Leeward curve control points (bigger offset):
            const cp1lw = { x: xA + (xB - xA) * 0.30, y: draftSign * belly * 1.0 };
            const cp2lw = { x: xA + (xB - xA) * 0.70, y: draftSign * belly * 1.0 };
            // Windward face control points (almost flat):
            const cp1ww = { x: xA + (xB - xA) * 0.28, y: draftSign * belly * 0.06 };
            const cp2ww = { x: xA + (xB - xA) * 0.72, y: draftSign * belly * 0.06 };

            // Draw sail outline (leeward arc → windward arc → closed)
            ctx.beginPath();
            ctx.moveTo(xA, 0);
            ctx.bezierCurveTo(cp1lw.x, cp1lw.y, cp2lw.x, cp2lw.y, xB, 0);
            ctx.bezierCurveTo(cp2ww.x, cp2ww.y, cp1ww.x, cp1ww.y, xA, 0);
            ctx.closePath();
            ctx.fillStyle = sailFill;
            ctx.fill();
            ctx.strokeStyle = outlineCol;
            ctx.lineWidth = 1.0;
            ctx.stroke();

            // Battens — drawn inside a clip of the sail shape
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(xA, 0);
            ctx.bezierCurveTo(cp1lw.x, cp1lw.y, cp2lw.x, cp2lw.y, xB, 0);
            ctx.bezierCurveTo(cp2ww.x, cp2ww.y, cp1ww.x, cp1ww.y, xA, 0);
            ctx.closePath();
            ctx.clip();

            ctx.strokeStyle = battenCol;
            ctx.lineWidth   = 1.05;
            ctx.lineCap     = 'round';
            for (let b = 0; b < numBattens; b++) {
                const t   = b / (numBattens - 1);
                const px  = xA + t * (xB - xA);
                const hump = 4 * t * (1 - t);
                const yL  = draftSign * belly * 1.0 * hump;
                const yW  = draftSign * belly * 0.06 * hump;
                ctx.beginPath();
                ctx.moveTo(px, yW);
                ctx.lineTo(px, yL);
                ctx.stroke();
            }
            ctx.restore();
        }

        ctx.restore(); // exit boom-local frame

        // ── RIGGING: 2 shrouds + forestay + backstay (taper-aware) ──────────
        // Coordinate frame: +X=bow, +Y=port. w=length(X), h=beam(Y).
        // The hull is NOT a rectangle — it tapers sharply toward bow/stern
        // (see the deck path: edge ≈ h*0.08 near the bow taper at w*0.435,
        // vs ≈ h*0.43 at midship x≈0). A single flat _railY constant was
        // too wide at the fore mast (mastForeX = w*0.35, near the taper)
        // and caused shrouds to cross outside the hull on the sides.
        //
        // _hullHalfBeamAt(x): linear approximation of the deck's half-beam
        // at a given local X, clamped so it NEVER exceeds the real taper.
        // Deck path key points (ship-local X → half-beam Y):
        //   x = -0.402w → 0.272h     x = 0w     → ~0.40h (midship, interpolated)
        //   x =  0.300w → 0.196h     x =  0.435w → 0.080h (bow taper)
        function _hullHalfBeamAt(localX) {
            const ax = Math.abs(localX);
            if (ax >= w * 0.435) return h * 0.06; // past bow/stern tip — pinned tiny
            if (ax >= w * 0.300) {
                // Between 0.300w and 0.435w: interpolate 0.196h → 0.080h
                const t = (ax - w*0.300) / (w*0.435 - w*0.300);
                return h * (0.196 - t * (0.196 - 0.080));
            }
            // Between 0 and 0.300w: interpolate midship (~0.40h) → 0.196h
            const t = ax / (w * 0.300);
            return h * (0.40 - t * (0.40 - 0.196));
        }

        const _hempCol    = isPlayer ? 'rgba(180,148,82,0.75)' : 'rgba(155,115,60,0.75)';
        const _hempColDim = isPlayer ? 'rgba(160,128,62,0.50)' : 'rgba(135,95,44,0.50)';
        ctx.globalAlpha = isInIrons ? 0.30 : 0.65;
        ctx.lineCap     = 'round';

        // Shroud endpoint X is slightly aft of the mast — compute rail at THAT x,
        // then apply an 80% safety margin so the line never touches the hull edge.
        const _shroudEndX = mastX - w * 0.03;
        const _railY = _hullHalfBeamAt(_shroudEndX) * 0.80;

        // Port shroud
        ctx.lineWidth = 2.0; ctx.strokeStyle = _hempCol;
        ctx.beginPath(); ctx.moveTo(mastX, 0); ctx.lineTo(_shroudEndX, -_railY); ctx.stroke();
        // Starboard shroud
        ctx.beginPath(); ctx.moveTo(mastX, 0); ctx.lineTo(_shroudEndX,  _railY); ctx.stroke();

        // Forestay: fore mast only, runs forward along keel (+X = bow).
        // Stay short of the bow taper tip (w*0.435) with margin.
        if (!sd.isMain) {
            const _bowX = Math.min(mastX + w * 0.38, w * 0.40);
            ctx.lineWidth = 1.8; ctx.strokeStyle = _hempColDim;
            ctx.beginPath(); ctx.moveTo(mastX, 0); ctx.lineTo(_bowX, 0); ctx.stroke();
        }

        // Backstay: main mast only, runs AFT along keel to the stern ("butt"
        // of the ship, -X direction). Mirrors the forestay on the opposite
        // tip of the ship as requested. Stern tip is at -w*0.512 (hull path);
        // stop well short of it with margin.
        if (sd.isMain) {
            const _sternX = Math.max(mastX - w * 0.38, -w * 0.40);
            ctx.lineWidth = 1.8; ctx.strokeStyle = _hempColDim;
            ctx.beginPath(); ctx.moveTo(mastX, 0); ctx.lineTo(_sternX, 0); ctx.stroke();
        }

        ctx.globalAlpha = 1.0;

        const mastR = sd.isMain ? 5 : 4;
        ctx.fillStyle = 'rgba(0,0,0,0.20)';
        ctx.beginPath(); ctx.arc(mastX + 1.5, 1.5, mastR + 1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2c1508';
        ctx.beginPath(); ctx.arc(mastX, 0, mastR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5c3018';
        ctx.beginPath(); ctx.arc(mastX - 1, -1, mastR * 0.42, 0, Math.PI * 2); ctx.fill();
    });

    ctx.restore();
}

// ============================================================================
// WIND HUD DRAW — renders a small wind compass on the sail canvas overlay
// ============================================================================
function drawWindHUD(ctx, canvasW, canvasH) {
    if (!inNavalBattle) return;
    const wind = navalEnvironment.wind;
    if (!wind) return;

    const r  = 30;
    const cx = r + 14;           
    const cy = canvasH * 0.5;    

    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = '#0a1520';
    ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = 'rgba(200,180,120,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = 'rgba(200,180,120,0.6)';
    ctx.font = 'bold 9px Georgia';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', cx, cy - r - 1);
    ctx.fillText('S', cx, cy + r + 1);
    ctx.fillText('W', cx - r - 1, cy);
    ctx.fillText('E', cx + r + 1, cy);

    const _windTo = wind.angle + Math.PI;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(_windTo);
    ctx.strokeStyle = '#5bc0ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-r * 0.6, 0); ctx.lineTo(r * 0.6, 0); ctx.stroke();
    ctx.fillStyle = '#5bc0ff';
    ctx.beginPath();
    ctx.moveTo(r * 0.7, 0); ctx.lineTo(r * 0.4, -5); ctx.lineTo(r * 0.4, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    const _spdPct = Math.round((window._navalWindSpeed || 0) * 100);
    ctx.fillStyle = '#5bc0ff';
    ctx.font = 'bold 10px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText(_spdPct + '%', cx, cy + r + 15);
    ctx.fillStyle = 'rgba(200,180,120,0.55)';
    ctx.font = '8px Georgia';
    ctx.fillText('WIND', cx, cy - r - 12);

    ctx.restore();
}

function _checkHullStabilityPlaceholder(ship) {}

// ============================================================================
// LAST-RESORT SAIL BUTTON VISIBILITY POLLER
// ============================================================================
(function _installNavalButtonLastResort() {
    'use strict';

    var _lrTimer = null;

    function _isPlayerShipOnScreen() {
        if (!window.inNavalBattle) return false;
        var env = window.navalEnvironment;
        if (!env || !Array.isArray(env.ships)) return false;

        var pShip = env.ships.find(function(s) { return s.isPlayerControlled; });
        if (!pShip) return false;

        // Mirror the main game canvas camera transform:
        //   translate(w/2, h/2) → scale(zoom) → translate(-player.x, -player.y)
        // So a world point (wx, wy) lands at screen:
        //   sx = (wx - player.x) * zoom + vw/2
        //   sy = (wy - player.y) * zoom + vh/2
        var cz  = (typeof zoom   !== 'undefined' && zoom   > 0) ? zoom   : 1;
        var px  = (typeof player !== 'undefined' && player) ? (player.x || 0) : 0;
        var py  = (typeof player !== 'undefined' && player) ? (player.y || 0) : 0;
        var vw  = window.innerWidth;
        var vh  = window.innerHeight;

        var shipX = pShip.x + (env.shipSwayX || 0);
        var shipY = pShip.y + (env.shipSwayY || 0);
        var sx    = (shipX - px) * cz + vw * 0.5;
        var sy    = (shipY - py) * cz + vh * 0.5;
        var hw    = (pShip.width  || 300) * cz * 0.6;
        var hh    = (pShip.height || 120) * cz * 0.6;

        return (sx + hw > 0 && sx - hw < vw &&
                sy + hh > 0 && sy - hh < vh);
    }

    function _poll() {
        if (!window.inNavalBattle) {
            if (window.NavalHelmUI) window.NavalHelmUI.clearNavalHelm();
            _stop();
            return;
        }

        // NOTE: previously this skipped polling entirely while ships were
        // grappled, because disableNavalHelm() used to own the hidden state
        // during boarding and forceNavalHelm() would have undone that hide.
        // Helm buttons now stay visible through boarding (naval_battles.js no
        // longer calls disableNavalHelm() on grapple), so there's nothing for
        // this poller to fight with anymore — just keep syncing normally.

        var shipOnScreen = _isPlayerShipOnScreen();

        if (shipOnScreen) {
            if (window.NavalHelmUI) window.NavalHelmUI.forceNavalHelm();
        } else {
            if (window.NavalHelmUI) window.NavalHelmUI.clearNavalHelm();
        }
    }

    function _start() {
        if (_lrTimer) return; 
        _lrTimer = setInterval(_poll, 3000); 
        console.log('[NavalSailCosmetics] Last-resort sail button poller started (3 s interval).');
    }

    function _stop() {
        if (_lrTimer) {
            clearInterval(_lrTimer);
            _lrTimer = null;
            console.log('[NavalSailCosmetics] Last-resort sail button poller stopped.');
        }
    }

    var _origInit = window.initNavalBattle;
    if (typeof _origInit === 'function') {
        window.initNavalBattle = function() {
            _start();
            return _origInit.apply(this, arguments);
        };
    } else {
        var _hookPoll = setInterval(function() {
            if (typeof window.initNavalBattle === 'function' && !window.initNavalBattle._lrHooked) {
                var _orig2 = window.initNavalBattle;
                window.initNavalBattle = function() { _start(); return _orig2.apply(this, arguments); };
                window.initNavalBattle._lrHooked = true;
                clearInterval(_hookPoll);
            }
        }, 500);
    }

    var _origCleanup = window.cleanupNavalSailCanvas;
    if (typeof _origCleanup === 'function') {
        window.cleanupNavalSailCanvas = function() {
            _stop();
            return _origCleanup.apply(this, arguments);
        };
    }

    window._navalButtonLastResort = { start: _start, stop: _stop };
})();