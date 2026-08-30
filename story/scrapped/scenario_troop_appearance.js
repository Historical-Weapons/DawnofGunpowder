// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ SCENARIO TROOP APPEARANCE  v4.1.0-dual-preview                             ║
// ║                                                                            ║
// ║  Changes from v4.0.0:                                                      ║
// ║  • COOLDOWN_PHASES exported on public API (needed by troop editor preview) ║
// ║  • drawLiveThumbPhase(canvas, troop, factionColor, phase, forceMelee)      ║
// ║    — draws a specific cooldown-phase snapshot, with optional forceMelee    ║
// ║      flag that overrides ammo→0 so you see the melee-fallback stance       ║
// ║  • drawLiveThumb canvas positioning bug fixed: no longer uses              ║
// ║    sta-v4-thumb-cv class (which bleeds its display:block globally).        ║
// ║    drawLiveThumb now writes to whatever canvas you pass — caller owns it.  ║
// ║                                                                            ║
// ║  Public API (unchanged from Phase 4, additions marked [NEW]):             ║
// ║    window.ScenarioTroopAppearance = {                                     ║
// ║      VERSION, FACTION,                                                    ║
// ║      COOLDOWN_PHASES,                           [NEW — was private]       ║
// ║      openPainter(troop, onSave),  closePainter(),                        ║
// ║      hasAppearance(troop),                                                ║
// ║      drawCustomSprite(...),                                               ║
// ║      drawAppearanceThumbnail(canvas, app, factionColor),                  ║
// ║      drawLiveThumb(canvas, troop, factionColor),                          ║
// ║      drawLiveThumbPhase(canvas, troop, fc, phase, forceMelee),  [NEW]    ║
// ║      generateRoleTemplate(role, isLarge, isRanged),                      ║
// ║      _newAppearance(w, h),  _normalize(app),  _drawSprite(...)           ║
// ║    }                                                                      ║
// ╚════════════════════════════════════════════════════════════════════════════╝

window.ScenarioTroopAppearance = (function () {
"use strict";

const VERSION = "4.1.0-dual-preview";
const FACTION = "F";

// ─── Faction style presets ─────────────────────────────────────────────────
const STYLE_PRESETS = [
    { label: "Generic / Default",       color: "#c62828", note: "Steel dome helmet, faction-color neck guard" },
    { label: "Yamato / Japanese",        color: "#c2185b", note: "Kabuto (25+) or Jingasa (8+) with golden horns" },
    { label: "Mongol / Yuan",            color: "#1976d2", note: "Spiked steel helmet (elite) or fur conical cap (light)" },
    { label: "Jin / Jurchen",            color: "#455a64", note: "Heavy steel helmet with leather cheek flaps" },
    { label: "Western Xia / Tangut",    color: "#7b1fa2", note: "Munjatugu — iron-segmented bowl with finial spike" },
    { label: "Dali Kingdom",             color: "#00838f", note: "Reinforced leather helmet with ceremonial plume" },
    { label: "Vietnamese / Dai Viet",   color: "#388e3c", note: "Conical lacquered rattan war hat" },
];

const ARMOR_TIERS = [
    { max:  7,  label: "Cloth",             bar: "#8d6e63" },
    { max: 14,  label: "Leather/Gambeson",  bar: "#795548" },
    { max: 24,  label: "Partial Lamellar",  bar: "#9e9e9e" },
    { max: 39,  label: "Full Lamellar",     bar: "#bdbdbd" },
    { max: 59,  label: "Super Heavy",       bar: "#e0e0e0" },
    { max: 9999,label: "Juggernaut",        bar: "#fbc02d" },
];

// ─── Cooldown-phase preview states ────────────────────────────────────────
// The "Flee" state is intentionally absent — isFleeing is forced to false
// inside _DRAW_API so the white-flag render NEVER fires in the viewer,
// regardless of what morale value the troop object carries.
//
// 'ammo' tokens:
//   "FULL"  → troop.ammo || 20            (resolved at render time)
//   "HALF"  → ceil((troop.ammo || 20) / 2)
//   0       → fully depleted → melee-stance visual
//
// 'cooldown' = REMAINING cooldown fed to infscript/cavscript.
// Attack cycle inside those scripts: cycle = isAttacking ? (maxCd-cd)/maxCd : 0
// We normalize to maxCd≈200 for consistent preview across all unit types.
const COOLDOWN_PHASES = [
    {
        id:"idle",     label:"Idle",
        moving:false, attacking:false,
        frame:0,  ammo:"FULL", cooldown:0,
        note:"Standing still — base pose",
        rangedOnly:false,
    },
    {
        id:"walk",     label:"Walk",
        moving:true,  attacking:false,
        frame:14, ammo:"FULL", cooldown:0,
        note:"Mid-step movement cycle",
        rangedOnly:false,
    },
    {
        id:"windup",   label:"Windup",
        moving:false, attacking:true,
        frame:0,  ammo:"FULL", cooldown:186,   // cycle≈0.07  wind-up phase
        note:"Attack begins — weapon draws back",
        rangedOnly:false,
    },
    {
        id:"strike",   label:"Strike",
        moving:false, attacking:true,
        frame:0,  ammo:"FULL", cooldown:130,   // cycle≈0.35  explosive strike
        note:"Explosive strike frame",
        rangedOnly:false,
    },
    {
        id:"recovery", label:"Recovery",
        moving:false, attacking:true,
        frame:0,  ammo:"FULL", cooldown:50,    // cycle≈0.75  recovery tail
        note:"Weapon retracts after impact",
        rangedOnly:false,
    },
    {
        id:"reload",   label:"Reload",
        moving:false, attacking:false,
        frame:8,  ammo:"HALF", cooldown:90,
        note:"Ranged: nocking / reload cycle",
        rangedOnly:true,
    },
    {
        id:"depleted", label:"Ammo Out",
        moving:false, attacking:false,
        frame:0,  ammo:0,      cooldown:0,
        note:"Ranged: backup melee stance",
        rangedOnly:true,
    },
];

// ─── Internal state ─────────────────────────────────────────────────────────
const _st = {
    open:           false,
    troop:          null,
    onSave:         null,
    styleColor:     STYLE_PRESETS[0].color,
    previewScale:   4,
    animFrame:      0,
    animating:      true,
    ammoMode:       "ranged",   // "ranged" | "melee"
    rafId:          null,
    overlayEl:      null,
    mainCtx:        null,
    mainCanvas:     null,
    thumbCtxs:      {},          // phaseId → { ctx, canvas }
    runtimeHooked:  false,
    frameLabel:     null,
    _keyHandler:    null,
};

// ═══════════════════════════════════════════════════════════════════════════
// ── _DRAW_API  ─────────────────────────────────────────────────────────────
//
// THE ONLY PLACE IN THIS FILE THAT KNOWS THE PARAMETER ORDER.
// If infscript.js or cavscript.js changes its signature, update ONLY here.
//
// Current infscript.js drawInfantryUnit signature:
//   (ctx, x, y, moving, frame, factionColor, type, isAttacking,
//    side, unitName, isFleeing, cooldown, unitAmmo, unit, reloadProgress)
//
// Current cavscript.js drawCavalryUnit signature:
//   (ctx, x, y, moving, frame, factionColor, isAttacking, type,
//    side, unitName, isFleeing, cooldown, unitAmmo, unit, reloadProgress)
//
// KEY DIFFERENCE: infscript puts `type` before `isAttacking`,
//                 cavscript puts `isAttacking` before `type`.
//
// isFleeing is HARDCODED to false — the viewer NEVER shows a white flag.
// ═══════════════════════════════════════════════════════════════════════════
const _DRAW_API = {

    infantry(ctx, x, y, p) {
        if (typeof window.drawInfantryUnit !== "function") return false;
        try {
            window.drawInfantryUnit(
                ctx, x, y,
                p.moving,
                p.frame,
                p.factionColor,
                p.type,          // ← type before isAttacking in infscript
                p.attacking,
                p.side,
                p.unitName,
                false,           // isFleeing = ALWAYS false in viewer
                p.cooldown,
                p.ammo,
                p.mockUnit,
                p.reloadProgress || 0
            );
        } catch(e) {
            console.warn("[STA v4] drawInfantryUnit error:", e.message);
            return false;
        }
        return true;
    },

    cavalry(ctx, x, y, p) {
        if (typeof window.drawCavalryUnit !== "function") return false;
        try {
            window.drawCavalryUnit(
                ctx, x, y,
                p.moving,
                p.frame,
                p.factionColor,
                p.attacking,     // ← isAttacking before type in cavscript
                p.type,
                p.side,
                p.unitName,
                false,           // isFleeing = ALWAYS false in viewer
                p.cooldown,
                p.ammo,
                p.mockUnit,
                p.reloadProgress || 0
            );
        } catch(e) {
            console.warn("[STA v4] drawCavalryUnit error:", e.message);
            return false;
        }
        return true;
    },
};

// ─── Role → visType mapping ────────────────────────────────────────────────
function _roleToVisType(role, unitName) {
    const r = (role || "infantry").toLowerCase();
    const n = (unitName || "").toLowerCase();
    if (r === "cavalry" || r === "mounted_gunner") {
        if (n.includes("elephant") || n.includes("elefa")) return "elephant";
        if (n.includes("camel"))                             return "camel";
        return "cavalry";
    }
    if (r === "horse_archer")  return "horse_archer";
    if (r === "pike")          return "spearman";
    if (r === "shield")        return "sword_shield";
    if (r === "two_handed")    return "two_handed";
    if (r === "crossbow")      return "crossbow";
    if (r === "firelance")     return "firelance";
    if (r === "archer")        return "archer";
    if (r === "throwing")      return "throwing";
    if (r === "gunner")        return "gun";
    if (r === "bomb")          return "bomb";
    if (r === "rocket")        return "rocket";
    if (n.includes("glaive"))  return "spearman";
    return "peasant";
}

function _isCavVisType(vt) {
    return ["cavalry","elephant","camel","horse_archer"].includes(vt);
}

// ─── Ammo-depletion visType remap — mirrors troop_draw.js lines 181-189 ──
function _applyAmmoDepletion(visType, isRanged, ammo) {
    if (!isRanged || ammo > 0) return visType;
    if (visType === "horse_archer") return "cavalry";
    if (visType === "camel")        return "camel";  // cavscript handles internally
    return "shortsword";  // infantry ranged → melee sword stance
}

// ─── Resolve ammo token to numeric value ─────────────────────────────────
function _resolveAmmo(phaseAmmo, troop) {
    if (phaseAmmo === "FULL") return troop.ammo || 20;
    if (phaseAmmo === "HALF") return Math.ceil((troop.ammo || 20) / 2);
    return typeof phaseAmmo === "number" ? phaseAmmo : (troop.ammo || 20);
}

// ─── UnitRoster injection ─────────────────────────────────────────────────
function _injectUnitRoster(troop) {
    if (typeof UnitRoster === "undefined" || !UnitRoster.allUnits) return null;
    const prev = UnitRoster.allUnits[troop.name];
    UnitRoster.allUnits[troop.name] = {
        armor:          troop.armor       || 0,
        health:         troop.health      || 100,
        meleeAttack:    troop.meleeAttack || 10,
        meleeDefense:   troop.meleeDefense|| 10,
        isRanged:       !!troop.isRanged,
        _isTempPreview: true,
    };
    return prev;
}
function _ejectUnitRoster(troop, prev) {
    if (typeof UnitRoster === "undefined" || !UnitRoster.allUnits) return;
    if (prev === undefined) { delete UnitRoster.allUnits[troop.name]; }
    else                    { UnitRoster.allUnits[troop.name] = prev; }
}

// ─── Build mock unit ──────────────────────────────────────────────────────
// morale: 999 so that ANY morale-check code in the engine cannot derive
// isFleeing from this mock, even if future code adds such a check.
function _makeMockUnit(troop, visType) {
    return {
        stats: {
            isRanged:    !!troop.isRanged,
            armor:       troop.armor || 0,
            role:        troop.role  || "infantry",
            ammo:        troop.ammo  || 0,
            morale:      999,
            maxMorale:   999,
        },
        facingDir:       1,
        facingDirY:      0,
        _verticalFrames: 0,
        isCommander:     !!troop.isCommander,
        unitType:        visType,
        side:            "player",
        hp:              troop.health || 100,
        id:              0,
    };
}

// ─── Core sprite draw helper ──────────────────────────────────────────────
// Draws the troop at (0,0) after the caller has saved/translated/scaled ctx.
// ammo is the numeric value already resolved (not a token).
function _drawSprite(ctx, troop, factionColor, isMoving, frame, isAttacking, ammo, cooldown) {
    const role     = troop.role || "infantry";
    let visType    = _roleToVisType(role, troop.name);
    const isCav    = _isCavVisType(visType);
    const unitName = troop.name || "CustomTroop";

    // Remap visType for ammo depletion — same logic as battle renderer
    visType = _applyAmmoDepletion(visType, !!troop.isRanged, ammo);

    const mockUnit = _makeMockUnit(troop, visType);

    const drawParams = {
        moving:         isMoving,
        frame,
        factionColor,
        type:           visType,
        attacking:      isAttacking,
        side:           "player",
        unitName,
        cooldown,
        ammo,
        mockUnit,
        reloadProgress: (isAttacking && troop.isRanged) ? (cooldown / 200) : 0,
    };

    const _prev = _injectUnitRoster(troop);
    try {
        const drawn = isCav
            ? _DRAW_API.cavalry(ctx, 0, 0, drawParams)
            : _DRAW_API.infantry(ctx, 0, 0, drawParams);

        if (!drawn) {
            ctx.fillStyle    = "#607d8b";
            ctx.font         = "8px Tahoma,sans-serif";
            ctx.textAlign    = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("sprite N/A", 0, -10);
        }
    } finally {
        _ejectUnitRoster(troop, _prev);
    }
}

// ─── Resolve main-canvas ammo per toggle mode ─────────────────────────────
function _mainAmmo(troop) {
    return _st.ammoMode === "melee" ? 0 : (troop.ammo || 20);
}

// ─── Repaint large main canvas ────────────────────────────────────────────
function _repaintMain() {
    const ctx = _st.mainCtx, cv = _st.mainCanvas;
    if (!ctx || !cv) return;
    const W = cv.width, H = cv.height, S = _st.previewScale;

    ctx.clearRect(0, 0, W, H);

    // Checkerboard background so transparent areas are visible
    const SQ = 14;
    for (let gy = 0; gy < H/SQ; gy++)
        for (let gx = 0; gx < W/SQ; gx++) {
            ctx.fillStyle = (gx+gy)%2===0 ? "#1a2030" : "#14192a";
            ctx.fillRect(gx*SQ, gy*SQ, SQ, SQ);
        }

    // Ground line — 90% down the canvas so sprite has headroom above
    const groundY = Math.round(H * 0.90);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, groundY); ctx.lineTo(W, groundY);
    ctx.stroke();

    const troop = _st.troop;
    if (!troop) return;

    // Scale the sprite to fill the canvas: effective S = groundY / (120 game-units)
    // Use actual pixel scale so sprite always fills the canvas regardless of clamp
    const effectiveS = groundY / 120;

    ctx.save();
    ctx.translate(W/2, groundY);
    ctx.scale(effectiveS, effectiveS);

    // Derive animation state from animFrame (0-119 cycle)
    // Phase layout across the 120-frame loop:
    //   0-19:  Idle (standing still)
    //  20-39:  Walk (moving, frame increments for bob)
    //  40-59:  Windup  (isAttacking=true, cooldown high ~186)
    //  60-79:  Strike  (isAttacking=true, cooldown mid ~130)
    //  80-99:  Recovery (isAttacking=true, cooldown low ~50)
    // 100-119: Reload/rest (not attacking, for ranged show reload)
    const frame = _st.animFrame;
    let isMove    = false;
    let isAtk     = false;
    let cooldown  = 0;
    let animPhaseFrame = frame;   // local frame counter within current phase

    if (frame < 20) {
        // Idle
        isMove = false; isAtk = false; cooldown = 0;
        animPhaseFrame = 0;
    } else if (frame < 40) {
        // Walk
        isMove = true; isAtk = false; cooldown = 0;
        animPhaseFrame = frame;    // keep full value for step bob
    } else if (frame < 60) {
        // Windup
        const t = (frame - 40) / 20;   // 0→1 across windup
        isMove = false; isAtk = true;
        cooldown = Math.round(200 - t * 14);  // 200 → 186
        animPhaseFrame = 0;
    } else if (frame < 80) {
        // Strike
        const t = (frame - 60) / 20;
        isMove = false; isAtk = true;
        cooldown = Math.round(186 - t * 56); // 186 → 130
        animPhaseFrame = 0;
    } else if (frame < 100) {
        // Recovery
        const t = (frame - 80) / 20;
        isMove = false; isAtk = true;
        cooldown = Math.round(130 - t * 80); // 130 → 50
        animPhaseFrame = 0;
    } else {
        // Reload / rest
        isMove = false; isAtk = false; cooldown = 0;
        animPhaseFrame = frame - 100;
    }

    _drawSprite(ctx, troop, _st.styleColor, isMove, animPhaseFrame, isAtk,
                _mainAmmo(troop), cooldown);
    ctx.restore();

    if (_st.frameLabel)
        _st.frameLabel.textContent = `Frame ${_st.animFrame}`;
}

// ─── Repaint phase thumbnail canvases ─────────────────────────────────────
function _repaintThumbs() {
    const troop = _st.troop;
    if (!troop) return;
    const fc = _st.styleColor;
    const S  = 2.5;

    COOLDOWN_PHASES.forEach(phase => {
        const entry = _st.thumbCtxs[phase.id];
        if (!entry) return;
        const { ctx, canvas } = entry;
        const W = canvas.width, H = canvas.height;

        ctx.clearRect(0, 0, W, H);
        const SQ = 7;
        for (let gy = 0; gy < H/SQ; gy++)
            for (let gx = 0; gx < W/SQ; gx++) {
                ctx.fillStyle = (gx+gy)%2===0 ? "#1e2836" : "#171f2c";
                ctx.fillRect(gx*SQ, gy*SQ, SQ, SQ);
            }

        // Resolve numeric ammo, then apply toggle override
        let ammo = _resolveAmmo(phase.ammo, troop);
        if (_st.ammoMode === "melee") ammo = 0;

        ctx.save();
        ctx.translate(W/2, H-14);
        ctx.scale(S, S);
        _drawSprite(ctx, troop, fc,
                    phase.moving, phase.frame, phase.attacking,
                    ammo, phase.cooldown);
        ctx.restore();

        // Phase-name overlay strip at bottom
        ctx.fillStyle = "rgba(0,0,0,0.52)";
        ctx.fillRect(0, H-18, W, 18);
        ctx.fillStyle = "#8ab4d4";
        ctx.font = "bold 9px Tahoma,sans-serif";
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(phase.label, W/2, H-9);
    });
}

// ─── Animation loop ───────────────────────────────────────────────────────
function _tick() {
    if (!_st.open) return;
    if (_st.animating) _st.animFrame = (_st.animFrame + 1) % 120;
    _repaintMain();
    _st.rafId = requestAnimationFrame(_tick);
}

// ─── CSS ─────────────────────────────────────────────────────────────────
function _ensureCSS() {
    if (document.getElementById("sta-v4-css")) return;
    const s = document.createElement("style");
    s.id = "sta-v4-css";
    s.textContent = `
#sta-v4-overlay{position:fixed!important;inset:0!important;background:rgba(0,0,0,.88)!important;z-index:100060!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:16px 10px!important;overflow-y:auto!important;font-family:"Segoe UI",Tahoma,Geneva,sans-serif!important;box-sizing:border-box!important}
#sta-v4-modal{background:#1a2030!important;color:#d4dce8!important;border:2px solid #2e4a6a!important;border-radius:8px!important;width:min(1100px,97vw)!important;display:flex!important;flex-direction:column!important;box-shadow:0 24px 90px rgba(0,0,0,.75)!important;flex-shrink:0!important;box-sizing:border-box!important;overflow:hidden!important}
#sta-v4-header{background:linear-gradient(180deg,#22304a,#1a2030)!important;padding:10px 16px!important;border-bottom:1px solid #2e4a6a!important;display:flex!important;align-items:center!important;gap:10px!important;flex-shrink:0!important}
#sta-v4-header h2{margin:0!important;font-size:15px!important;font-weight:700!important;color:#e8eef6!important;flex:1!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
#sta-v4-body{display:grid!important;grid-template-columns:234px 1fr 316px!important;height:640px!important;overflow:hidden!important}
#sta-v4-left{border-right:1px solid #2e4a6a!important;padding:14px 12px!important;overflow-y:auto!important;background:#161e2c!important;display:flex!important;flex-direction:column!important;gap:14px!important;font-size:12px!important}
#sta-v4-centre{display:flex!important;flex-direction:column!important;align-items:center!important;padding:10px 14px!important;background:#0e1420!important;gap:8px!important;overflow:hidden!important}
#sta-v4-right{border-left:1px solid #2e4a6a!important;padding:14px 10px!important;overflow-y:auto!important;background:#161e2c!important;display:flex!important;flex-direction:column!important;gap:8px!important;font-size:12px!important}
.sta-v4-head{font-size:10px!important;font-weight:700!important;letter-spacing:1px!important;text-transform:uppercase!important;color:#4a8eda!important;border-bottom:1px solid #2a3f5a!important;padding-bottom:4px!important;margin-bottom:4px!important}
.sta-v4-armor-wrap{height:10px!important;background:#0d1520!important;border-radius:5px!important;overflow:hidden!important;border:1px solid #2a3f5a!important;margin-top:2px!important}
.sta-v4-armor-fill{height:100%!important;border-radius:5px!important;transition:width .3s,background .3s!important}
.sta-v4-style-row{display:flex!important;align-items:center!important;gap:8px!important}
.sta-v4-dot{width:14px!important;height:14px!important;border-radius:50%!important;flex-shrink:0!important;border:1px solid rgba(255,255,255,.18)!important}
.sta-v4-sel{all:unset!important;box-sizing:border-box!important;width:100%!important;background:#0d1520!important;border:1px solid #2e4a6a!important;border-radius:4px!important;color:#c8d6e8!important;font-size:12px!important;padding:5px 7px!important;cursor:pointer!important;font-family:"Segoe UI",Tahoma,sans-serif!important}
.sta-v4-sel:focus{outline:1px solid #4a8eda!important}
.sta-v4-stat-grid{display:grid!important;grid-template-columns:1fr auto!important;gap:3px 10px!important}
.sta-v4-stat-label{color:#6888a8!important;font-size:11px!important}
.sta-v4-stat-val{color:#e0e8f4!important;font-weight:600!important;text-align:right!important;font-size:11px!important}
.sta-v4-scale-group{display:flex!important;gap:4px!important;flex-wrap:wrap!important}
#sta-v4-modal button{all:unset!important;box-sizing:border-box!important;cursor:pointer!important;font-family:"Segoe UI",Tahoma,sans-serif!important;display:inline-block!important}
.sta-v4-btn{background:#1e3050!important;border:1px solid #2e4a6a!important;color:#c8d6e8!important;padding:5px 12px!important;border-radius:4px!important;font-size:12px!important;font-weight:500!important;white-space:nowrap!important;transition:background .15s!important}
.sta-v4-btn:hover{background:#243860!important}
.sta-v4-btn.active{background:#1a4a8a!important;border-color:#4a8eda!important;color:#fff!important}
.sta-v4-btn.close-btn{background:#5a1a1a!important;border-color:#8a2a2a!important;color:#ffbbbb!important;padding:5px 18px!important}
.sta-v4-btn.close-btn:hover{background:#7a2a2a!important}
.sta-v4-pill{display:flex!important;border:1px solid #2e4a6a!important;border-radius:5px!important;overflow:hidden!important;width:100%!important}
.sta-v4-pill button{flex:1!important;padding:7px 4px!important;font-size:11px!important;font-weight:600!important;background:#111a28!important;border:none!important;color:#5a7090!important;cursor:pointer!important;transition:background .15s,color .15s!important;text-align:center!important}
.sta-v4-pill button.active{background:#1a4a8a!important;color:#fff!important}
.sta-v4-pill button:first-child{border-right:1px solid #2e4a6a!important}
#sta-v4-frame-bar{display:flex!important;align-items:center!important;gap:8px!important;font-size:12px!important;flex-wrap:wrap!important;justify-content:center!important;flex-shrink:0!important;width:100%!important}
#sta-v4-canvas-wrap{position:relative!important;border:2px solid #2e4a6a!important;border-radius:8px!important;overflow:hidden!important;background:#0a1018!important;flex-shrink:0!important;box-shadow:0 0 30px rgba(0,0,0,0.7)!important;display:flex!important;align-items:center!important;justify-content:center!important}
#sta-v4-draw-hint{position:absolute!important;top:6px!important;right:8px!important;font-size:10px!important;color:rgba(74,142,218,.35)!important;pointer-events:none!important;font-style:italic!important}
.sta-v4-phase-grid{display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:8px!important}
.sta-v4-thumb-wrap{display:flex!important;flex-direction:column!important;align-items:center!important;gap:0!important}
.sta-v4-thumb-cv{border:1px solid #2a3f5a!important;border-radius:4px!important;display:block!important;image-rendering:pixelated!important;cursor:pointer!important;transition:border-color .15s,box-shadow .15s!important;width:90px!important;height:110px!important}
.sta-v4-thumb-cv:hover{border-color:#4a8eda!important;box-shadow:0 0 6px rgba(74,142,218,.4)!important}
.sta-v4-thumb-note{font-size:9px!important;color:#4a6080!important;text-align:center!important;line-height:1.3!important;padding:2px 3px!important;max-width:90px!important}
.sta-v4-phase-sec{font-size:10px!important;color:#3a6090!important;font-weight:700!important;letter-spacing:.8px!important;text-transform:uppercase!important;margin:6px 0 2px!important}
.sta-v4-future{font-size:10px!important;color:#4a6080!important;font-style:italic!important;border:1px dashed #2a3f5a!important;border-radius:4px!important;padding:6px 8px!important;line-height:1.5!important;margin-top:4px!important}
.sta-v4-style-note{font-size:10px!important;color:#5a7090!important;font-style:italic!important;line-height:1.4!important;min-height:28px!important}
#sta-v4-footer{padding:9px 14px!important;border-top:1px solid #2e4a6a!important;background:#161e2c!important;display:flex!important;justify-content:flex-end!important;gap:8px!important;flex-shrink:0!important}
`;
    document.head.appendChild(s);
}

// ─── Open the modal ───────────────────────────────────────────────────────
function openPainter(troop, onSave) {
    if (_st.open) closePainter();
    _ensureCSS();

    _st.open      = true;
    _st.troop     = troop;
    _st.onSave    = onSave;
    _st.thumbCtxs = {};
    _st.ammoMode  = troop.isRanged ? "ranged" : "melee";

    const sc = _scenario();
    let initColor = STYLE_PRESETS[0].color;
    if (sc && sc.factions) {
        const fk = Object.keys(sc.factions);
        if (fk.length && sc.factions[fk[0]] && sc.factions[fk[0]].color)
            initColor = sc.factions[fk[0]].color;
    }
    _st.styleColor = initColor;

    // ── Shell ────────────────────────────────────────────────────────────────
    const overlay = document.createElement("div");
    overlay.id = "sta-v4-overlay";
    _st.overlayEl = overlay;
    const modal = document.createElement("div");
    modal.id = "sta-v4-modal";
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // ── Header ───────────────────────────────────────────────────────────────
    const header = document.createElement("div");
    header.id = "sta-v4-header";
    const h2 = document.createElement("h2");
    h2.textContent = "\uD83C\uDFA8  Appearance \u2014 " + (troop.name || "Custom Troop");
    header.appendChild(h2);
    const roleChip = document.createElement("span");
    roleChip.style.cssText = "font-size:11px;background:#0d1a2e;border:1px solid #2e4a6a;border-radius:3px;padding:2px 8px;color:#7090b0;flex-shrink:0;";
    roleChip.textContent = (troop.role || "infantry").toUpperCase();
    header.appendChild(roleChip);
    const closeBtn = document.createElement("button");
    closeBtn.className = "sta-v4-btn close-btn";
    closeBtn.textContent = "\u2715  Close";
    closeBtn.onclick = closePainter;
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // ── Body ─────────────────────────────────────────────────────────────────
    const body = document.createElement("div");
    body.id = "sta-v4-body";
    modal.appendChild(body);

    // ════════════════ LEFT ════════════════
    const left = document.createElement("div");
    left.id = "sta-v4-left";

    // Armor
    left.appendChild(_mkHd("Armor"));
    const at = _armorTier(troop.armor||0);
    const an = document.createElement("div");
    an.style.cssText = "font-size:12px;color:#e0e8f4;font-weight:600;margin-bottom:3px;";
    an.textContent = at.label + "  (" + (troop.armor||0) + ")";
    left.appendChild(an);
    const bw = document.createElement("div");  bw.className = "sta-v4-armor-wrap";
    const bf = document.createElement("div");  bf.className = "sta-v4-armor-fill";
    bf.style.width = Math.min(100,Math.round(((troop.armor||0)/60)*100)) + "%";
    bf.style.background = at.bar;
    bw.appendChild(bf); left.appendChild(bw);

    // Ranged/Melee toggle (ranged units only)
    if (troop.isRanged) {
        left.appendChild(_mkHd("Weapon Mode"));
        const pill = document.createElement("div");
        pill.className = "sta-v4-pill";
        const rBtn = document.createElement("button");
        rBtn.textContent = "\uD83C\uDFF9 Ranged";
        const mBtn = document.createElement("button");
        mBtn.textContent = "\u2694\uFE0F Melee";
        const _setMode = (mode) => {
            _st.ammoMode = mode;
            rBtn.className = mode === "ranged" ? "active" : "";
            mBtn.className = mode === "melee"  ? "active" : "";
            _repaintThumbs();
            _repaintMain();
        };
        rBtn.onclick = () => _setMode("ranged");
        mBtn.onclick = () => _setMode("melee");
        rBtn.className = _st.ammoMode === "ranged" ? "active" : "";
        mBtn.className = _st.ammoMode === "melee"  ? "active" : "";
        pill.appendChild(rBtn); pill.appendChild(mBtn);
        left.appendChild(pill);
        const pn = document.createElement("div");
        pn.style.cssText = "font-size:10px;color:#4a6080;font-style:italic;line-height:1.4;";
        pn.textContent = "Melee mode forces ammo=0 so the unit draws its backup weapon.";
        left.appendChild(pn);
    }

    // Style faction
    left.appendChild(_mkHd("Helmet & Armor Style"));
    const styleNote = document.createElement("div");
    styleNote.className = "sta-v4-style-note";
    left.appendChild(styleNote);
    const styleSel = document.createElement("select");
    styleSel.className = "sta-v4-sel";
    const grpP = document.createElement("optgroup"); grpP.label = "\u2014 Cultural Styles \u2014";
    STYLE_PRESETS.forEach(ps => {
        const o = document.createElement("option");
        o.value = ps.color; o.textContent = ps.label;
        if (ps.color === initColor) o.selected = true;
        grpP.appendChild(o);
    });
    styleSel.appendChild(grpP);
    if (sc && sc.factions && Object.keys(sc.factions).length) {
        const grpS = document.createElement("optgroup"); grpS.label = "\u2014 Scenario Factions \u2014";
        Object.entries(sc.factions).forEach(([fn, fd]) => {
            if (!fd || !fd.color) return;
            const o = document.createElement("option");
            o.value = fd.color; o.textContent = fn + "  (" + fd.color + ")";
            if (fd.color === initColor) o.selected = true;
            grpS.appendChild(o);
        });
        styleSel.appendChild(grpS);
    }
    const dotRow = document.createElement("div"); dotRow.className = "sta-v4-style-row";
    const dot = document.createElement("div"); dot.className = "sta-v4-dot";
    dot.style.background = _st.styleColor;
    dotRow.appendChild(dot); dotRow.appendChild(styleSel);
    left.appendChild(dotRow);
    const _upStyle = () => {
        _st.styleColor = styleSel.value;
        dot.style.background = _st.styleColor;
        const pr = STYLE_PRESETS.find(p => p.color === _st.styleColor);
        styleNote.textContent = pr ? pr.note : "Faction-specific look driven by color code.";
        _repaintThumbs();
        _repaintMain();
    };
    styleSel.addEventListener("change", _upStyle); _upStyle();

    // Scale
    left.appendChild(_mkHd("Preview Scale"));
    const scGrp = document.createElement("div"); scGrp.className = "sta-v4-scale-group";
    [2,3,4,5,6].forEach(sv => {
        const b = document.createElement("button");
        b.className = "sta-v4-btn" + (sv===_st.previewScale?" active":"");
        b.textContent = sv + "\xD7";
        b.onclick = () => {
            _st.previewScale = sv;
            scGrp.querySelectorAll("button").forEach(x=>x.classList.remove("active"));
            b.classList.add("active");
            _resizeMainCanvas();
        };
        scGrp.appendChild(b);
    });
    left.appendChild(scGrp);

    // Stats
    left.appendChild(_mkHd("Stats Summary"));
    const sg = document.createElement("div"); sg.className = "sta-v4-stat-grid";
    const rows = [
        ["Health", troop.health??"\u2014"], ["Melee ATK", troop.meleeAttack??"\u2014"],
        ["Melee DEF", troop.meleeDefense??"\u2014"], ["Armor", troop.armor??"\u2014"],
        ["Speed", troop.speed??"\u2014"], ["Morale", troop.morale??"\u2014"],
    ];
    if (troop.isRanged) rows.push(
        ["Ammo", troop.ammo??"\u2014"],
        ["Range", troop.range??"\u2014"],
        ["Accuracy", (troop.accuracy??"\u2014")+(troop.accuracy!=null?"%":"")],
    );
    rows.forEach(([l,v]) => {
        const L=document.createElement("div"); L.className="sta-v4-stat-label"; L.textContent=l;
        const V=document.createElement("div"); V.className="sta-v4-stat-val";   V.textContent=v;
        sg.appendChild(L); sg.appendChild(V);
    });
    left.appendChild(sg);
    body.appendChild(left);

    // ═══════════════ CENTRE ═══════════════
    const centre = document.createElement("div");
    centre.id = "sta-v4-centre";

    // ── Frame bar (compact, pinned to top) ──────────────────────────────────
    const fb = document.createElement("div"); fb.id = "sta-v4-frame-bar";
    const animBtn = document.createElement("button");
    animBtn.className = "sta-v4-btn" + (_st.animating?" active":"");
    animBtn.textContent = "\uD83D\uDD04  Animate";
    animBtn.onclick = () => { _st.animating=!_st.animating; animBtn.classList.toggle("active",_st.animating); };
    fb.appendChild(animBtn);
    const pBtn = document.createElement("button"); pBtn.className="sta-v4-btn"; pBtn.textContent="\u25C4";
    pBtn.title = "Previous frame";
    pBtn.onclick = () => { _st.animating=false; animBtn.classList.remove("active"); _st.animFrame=(_st.animFrame-1+120)%120; _repaintMain(); };
    fb.appendChild(pBtn);
    const fl = document.createElement("span");
    fl.style.cssText = "font-size:12px;color:#6080a0;min-width:62px;text-align:center;";
    fl.textContent = "Frame 0"; _st.frameLabel = fl;
    fb.appendChild(fl);
    const nBtn = document.createElement("button"); nBtn.className="sta-v4-btn"; nBtn.textContent="\u25BA";
    nBtn.title = "Next frame";
    nBtn.onclick = () => { _st.animating=false; animBtn.classList.remove("active"); _st.animFrame=(_st.animFrame+1)%120; _repaintMain(); };
    fb.appendChild(nBtn);
    const rfBtn = document.createElement("button"); rfBtn.className="sta-v4-btn"; rfBtn.textContent="\u21BB  Refresh States";
    rfBtn.onclick = () => { _repaintThumbs(); _repaintMain(); };
    fb.appendChild(rfBtn);
    centre.appendChild(fb);

    // ── Main canvas (large hero, fills remaining height) ────────────────────
    const cWrap = document.createElement("div"); cWrap.id = "sta-v4-canvas-wrap";
    const mainCanvas = document.createElement("canvas");
    mainCanvas.style.cssText = "display:block;image-rendering:pixelated;image-rendering:crisp-edges;";
    _st.mainCanvas = mainCanvas;
    _st.mainCtx    = mainCanvas.getContext("2d");
    _st.mainCtx.imageSmoothingEnabled = false;
    const hint = document.createElement("div"); hint.id = "sta-v4-draw-hint";
    hint.textContent = "Phase 4+: drawing canvas";
    cWrap.appendChild(mainCanvas); cWrap.appendChild(hint);
    centre.appendChild(cWrap);
    body.appendChild(centre);

    // Size canvas AFTER it's in the DOM
    _resizeMainCanvas();

    // ══════════════ RIGHT ══════════════
    const right = document.createElement("div");
    right.id = "sta-v4-right";
    right.appendChild(_mkHd("Cooldown Phases"));
    const pd = document.createElement("div");
    pd.style.cssText = "font-size:11px;color:#5a7090;line-height:1.5;margin-bottom:6px;";
    pd.textContent = "Each thumbnail is frozen at a specific moment of the attack cooldown cycle. "
        + "Click any thumbnail to jump the main canvas to that frame (pauses animation).";
    right.appendChild(pd);

    // Build two phase grids: combat cycle + ranged-only
    const combatSec = document.createElement("div"); combatSec.className = "sta-v4-phase-sec";
    combatSec.textContent = "Combat Cycle";
    right.appendChild(combatSec);
    const combatGrid = document.createElement("div"); combatGrid.className = "sta-v4-phase-grid";
    right.appendChild(combatGrid);

    let rangedGrid = null;
    if (troop.isRanged) {
        const rs = document.createElement("div"); rs.className = "sta-v4-phase-sec";
        rs.textContent = "Ranged States";
        right.appendChild(rs);
        rangedGrid = document.createElement("div"); rangedGrid.className = "sta-v4-phase-grid";
        right.appendChild(rangedGrid);
    }

    COOLDOWN_PHASES.forEach(phase => {
        if (phase.rangedOnly && !troop.isRanged) return;

        const wrap = document.createElement("div"); wrap.className = "sta-v4-thumb-wrap";
        const cv = document.createElement("canvas"); cv.className = "sta-v4-thumb-cv";
        cv.width = 90; cv.height = 110;
        cv.title = phase.label + " \u2014 " + phase.note;
        cv.onclick = () => {
            _st.animating = false; animBtn.classList.remove("active");
            _st.animFrame = phase.frame || 0; _repaintMain();
        };
        const ctx2 = cv.getContext("2d"); ctx2.imageSmoothingEnabled = false;
        _st.thumbCtxs[phase.id] = { ctx: ctx2, canvas: cv };

        const nt = document.createElement("div"); nt.className = "sta-v4-thumb-note";
        nt.textContent = phase.note;
        wrap.appendChild(cv); wrap.appendChild(nt);

        (phase.rangedOnly ? rangedGrid : combatGrid).appendChild(wrap);
    });

    const fn = document.createElement("div"); fn.className = "sta-v4-future";
    fn.innerHTML = "\uD83D\uDCCB <strong>Phase 4+:</strong> Clicking any thumbnail will open "
        + "a per-frame pixel editor \u2014 author frame-by-frame sprites across the full "
        + "cooldown cycle: idle \u2192 windup \u2192 strike \u2192 recovery, plus reload "
        + "and ammo-depleted melee sequences for ranged units.";
    right.appendChild(fn);
    body.appendChild(right);

    // ── Footer ───────────────────────────────────────────────────────────────
    const footer = document.createElement("div"); footer.id = "sta-v4-footer";
    const is = document.createElement("span");
    is.style.cssText = "font-size:11px;color:#3a5070;flex:1;align-self:center;";
    is.textContent = "Sprite viewer \u2014 this large canvas is reserved for the Phase 4 drawing editor. Close to return.";
    footer.appendChild(is);
    const cb2 = document.createElement("button"); cb2.className = "sta-v4-btn close-btn";
    cb2.textContent = "\u2715  Close"; cb2.onclick = closePainter;
    footer.appendChild(cb2);
    modal.appendChild(footer);

    // ── Key handler + start ───────────────────────────────────────────────────
    _st._keyHandler = e => { if (e.key === "Escape") closePainter(); };
    document.addEventListener("keydown", _st._keyHandler);
    _st.animFrame = 0; _st.animating = true;
    _tick();
    setTimeout(_repaintThumbs, 80);
}

// ─── Resize large canvas ──────────────────────────────────────────────────
// Body is 640px. Centre padding=10px top+bottom=20px, frame bar≈46px.
// Available canvas height ≈ 640 - 20 - 46 = 574px.
// Sprite is ~20 game-units tall. At S=8: 120×8=960 → too tall.
// We pick S then clamp so the canvas always fits inside 574px height.
function _resizeMainCanvas() {
    const cv = _st.mainCanvas; if (!cv) return;
    const S = _st.previewScale;
    const AVAIL_H = 574;   // px available in centre column
    const AVAIL_W = 480;   // centre col ≈ 550px wide, leave room for padding+border

    // Raw size at requested scale
    const rawW = Math.round(110 * S);
    const rawH = Math.round(120 * S);

    // Scale down uniformly if either dimension exceeds available space
    const scaleDown = Math.min(1, AVAIL_H / rawH, AVAIL_W / rawW);
    cv.width  = Math.round(rawW * scaleDown);
    cv.height = Math.round(rawH * scaleDown);
    cv.style.width  = cv.width  + "px";
    cv.style.height = cv.height + "px";
    if (_st.mainCtx) _st.mainCtx.imageSmoothingEnabled = false;
    _repaintMain();
}

// ─── Close ────────────────────────────────────────────────────────────────
function closePainter() {
    if (!_st.open) return;
    _st.open = false;
    if (_st.rafId)       { cancelAnimationFrame(_st.rafId); _st.rafId = null; }
    if (_st._keyHandler) { document.removeEventListener("keydown", _st._keyHandler); _st._keyHandler = null; }
    if (_st.overlayEl && _st.overlayEl.parentNode)
        _st.overlayEl.parentNode.removeChild(_st.overlayEl);
    _st.overlayEl = null; _st.mainCanvas = null; _st.mainCtx = null;
    _st.frameLabel = null; _st.thumbCtxs = {};
    if (typeof _st.onSave === "function") _st.onSave(_st.troop);
    _st.troop = null; _st.onSave = null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function _mkHd(t) {
    const d = document.createElement("div"); d.className = "sta-v4-head"; d.textContent = t; return d;
}
function _armorTier(v) {
    return ARMOR_TIERS.find(t => v <= t.max) || ARMOR_TIERS[ARMOR_TIERS.length-1];
}
function _scenario() {
    return (window.ScenarioEditor && window.ScenarioEditor._state)
        ? window.ScenarioEditor._state.scenario
        : (window.__activeScenario || null);
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  drawLiveThumb — draws a simple idle-stance preview onto an arbitrary   ║
// ║  canvas.  Caller owns the canvas and its position in the DOM.           ║
// ║  No class names are applied here — the canvas is positioned by whoever  ║
// ║  created it, preventing the old "stuck top-left" bug where a canvas     ║
// ║  with sta-v4-thumb-cv class ended up at 0,0 in body.                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function drawLiveThumb(canvas, troop, factionColor) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;

    // Checkerboard bg
    const SQ = 6;
    for (let gy = 0; gy < H/SQ; gy++)
        for (let gx = 0; gx < W/SQ; gx++) {
            ctx.fillStyle = (gx+gy)%2===0 ? "#1a2030" : "#161c28";
            ctx.fillRect(gx*SQ, gy*SQ, SQ, SQ);
        }

    const fc = factionColor || "#c62828";
    ctx.save();
    ctx.translate(Math.floor(W/2), H-8);
    ctx.scale(3, 3);
    _drawSprite(ctx, troop, fc, false, 0, false, (troop.ammo||20), 0);
    ctx.restore();
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  drawLiveThumbPhase — like drawLiveThumb but renders a specific          ║
// ║  cooldown phase snapshot.                                                ║
// ║                                                                          ║
// ║  phase     — one of the COOLDOWN_PHASES objects (passed by reference)    ║
// ║  forceMelee — if true, override ammo → 0 (shows melee-fallback stance)  ║
// ║                                                                          ║
// ║  Used by the dual-canvas inline preview in scenario_troop_editor.js     ║
// ║  to show RANGED (ammo=FULL) vs MELEE FALLBACK (ammo=0) side-by-side,   ║
// ║  both driven by the same animated cooldown-cycle frame counter.          ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function drawLiveThumbPhase(canvas, troop, factionColor, phase, forceMelee) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;

    // Checkerboard bg
    const SQ = 6;
    for (let gy = 0; gy < H/SQ; gy++)
        for (let gx = 0; gx < W/SQ; gx++) {
            ctx.fillStyle = (gx+gy)%2===0 ? "#1a2030" : "#161c28";
            ctx.fillRect(gx*SQ, gy*SQ, SQ, SQ);
        }

    const fc = factionColor || "#c62828";

    // Resolve ammo — forceMelee overrides to 0 so ranged unit draws melee stance
    let ammo = _resolveAmmo(phase.ammo, troop);
    if (forceMelee) ammo = 0;

    ctx.save();
    // Ground at 88% height — gives a little headroom for tall sprites
    const groundY = Math.floor(H * 0.88);
    ctx.translate(Math.floor(W / 2), groundY);
    ctx.scale(3, 3);
    _drawSprite(ctx, troop, fc, phase.moving, phase.frame, phase.attacking, ammo, phase.cooldown);
    ctx.restore();

    // Label strip at bottom with phase name + ammo mode
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, H - 20, W, 20);
    ctx.fillStyle = forceMelee ? "#f4a460" : "#8ab4d4";
    ctx.font = "bold 9px Tahoma,sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(forceMelee ? "Melee (Ammo Out)" : phase.label, W / 2, H - 10);
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  LEGACY API  (unchanged from Phase 2/3 — no breaking changes)           ║
// ╚══════════════════════════════════════════════════════════════════════════╝
const DEFAULT_W = 14, DEFAULT_H = 20;
const MIN_W = 8,  MAX_W = 24, MIN_H = 12, MAX_H = 32;

function _newAppearance(w,h) {
    w=w||DEFAULT_W; h=h||DEFAULT_H;
    return { w, h, pixels: new Array(w*h).fill("") };
}
function _normalize(app) {
    if (!app||typeof app!=="object") return null;
    const w=Math.max(MIN_W,Math.min(MAX_W,+app.w||DEFAULT_W));
    const h=Math.max(MIN_H,Math.min(MAX_H,+app.h||DEFAULT_H));
    const pixels=new Array(w*h).fill("");
    if (Array.isArray(app.pixels)) {
        const len=Math.min(app.pixels.length,w*h);
        for (let i=0;i<len;i++) {
            const c=app.pixels[i];
            if (c===FACTION||c==="F"||c==="f") pixels[i]=FACTION;
            else if (typeof c==="string"&&/^#[0-9a-fA-F]{6}$/.test(c)) pixels[i]=c.toLowerCase();
        }
    }
    return { w, h, pixels };
}
function hasAppearance(troop) {
    return !!(troop&&troop.appearance&&Array.isArray(troop.appearance.pixels)&&troop.appearance.w&&troop.appearance.h);
}
function drawCustomSprite(ctx,x,y,isMoving,frame,factionColor,isAttacking,unit) {
    const app=unit&&unit.stats&&unit.stats._customAppearance;
    if (!app||!Array.isArray(app.pixels)||!app.w||!app.h) return false;
    const w=app.w,h=app.h;
    const bob=isMoving?(Math.floor(frame/6)%2):0;
    const facing=unit.facingDir||1;
    const attackOff=isAttacking?Math.floor(facing*3):0;
    const offX=-Math.floor(w/2), offY=-h+2;
    ctx.save();
    ctx.translate(x+attackOff,y+bob);
    if (facing===-1) ctx.scale(-1,1);
    for (let py=0;py<h;py++)
        for (let px=0;px<w;px++) {
            const cell=app.pixels[py*w+px];
            if (!cell) continue;
            ctx.fillStyle=(cell===FACTION)?factionColor:cell;
            ctx.fillRect(offX+px,offY+py,1,1);
        }
    ctx.restore();
    return true;
}
function drawAppearanceThumbnail(canvas,app,factionColor) {
    if (!canvas||!canvas.getContext) return;
    const ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.imageSmoothingEnabled=false;
    if (!app||!Array.isArray(app.pixels)||!app.w||!app.h) {
        ctx.fillStyle="#888"; ctx.font="11px sans-serif";
        ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText("(no sprite)",canvas.width/2,canvas.height/2); return;
    }
    const fc=factionColor||"#c62828";
    const scale=Math.min(Math.floor(canvas.width/app.w),Math.floor(canvas.height/app.h))||1;
    const offX=Math.floor((canvas.width-app.w*scale)/2);
    const offY=Math.floor((canvas.height-app.h*scale)/2);
    for (let py=0;py<app.h;py++)
        for (let px=0;px<app.w;px++) {
            const cell=app.pixels[py*app.w+px];
            if (!cell) continue;
            ctx.fillStyle=(cell===FACTION)?fc:cell;
            ctx.fillRect(offX+px*scale,offY+py*scale,scale,scale);
        }
}
function generateRoleTemplate(role,isLarge,isRanged) {
    return _newAppearance(isLarge?18:DEFAULT_W, isLarge?24:DEFAULT_H);
}

// ─── Runtime draw hooks ───────────────────────────────────────────────────
function _hookDraws() {
    if (_st.runtimeHooked) return;
    let hooked = false;
    if (typeof window.drawInfantryUnit === "function") {
        const _orig = window.drawInfantryUnit;
        window.drawInfantryUnit = function(ctx,x,y,moving,frame,factionColor,type,isAttacking,side,unitName,isFleeing,cooldown,unitAmmo,unit,reloadProgress) {
            _orig.apply(this, arguments);
            if (unit&&unit.stats&&unit.stats._customAppearance)
                drawCustomSprite(ctx,x,y,moving,frame,factionColor,isAttacking,unit);
        };
        hooked = true;
    }
    if (typeof window.drawCavalryUnit === "function") {
        const _orig = window.drawCavalryUnit;
        window.drawCavalryUnit = function(ctx,x,y,moving,frame,factionColor,isAttacking,type,side,unitName,isFleeing,cooldown,unitAmmo,unit,reloadProgress) {
            _orig.apply(this, arguments);
            if (unit&&unit.stats&&unit.stats._customAppearance)
                drawCustomSprite(ctx,x,y,moving,frame,factionColor,isAttacking,unit);
        };
        hooked = true;
    }
    if (hooked) { _st.runtimeHooked=true; console.log("[STA v4] Runtime draw hooks installed."); }
}
(function _autoHook() {
    if (typeof window.drawInfantryUnit==="function"&&typeof window.drawCavalryUnit==="function") { _hookDraws(); return; }
    let n=0;
    const iv=setInterval(()=>{
        n++;
        if (typeof window.drawInfantryUnit==="function"&&typeof window.drawCavalryUnit==="function") { _hookDraws(); clearInterval(iv); }
        if (n>200) { clearInterval(iv); console.warn("[STA v4] draw hooks not found after 20s."); }
    },100);
})();

// ─── Public API ───────────────────────────────────────────────────────────
return {
    VERSION, FACTION,
    COOLDOWN_PHASES,             // ← NOW PUBLIC — needed by troop editor preview
    openPainter, closePainter,
    hasAppearance,
    drawCustomSprite,
    drawAppearanceThumbnail,
    drawLiveThumb,
    drawLiveThumbPhase,          // ← NEW
    generateRoleTemplate,
    _newAppearance, _normalize,
    _drawSprite,    // exposed for editor's inline thumb
};

})();

console.log("[ScenarioTroopAppearance] v" + window.ScenarioTroopAppearance.VERSION + " loaded.");