// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ SCENARIO TROOP APPEARANCE — Phase 2 v2 (parametric, vanilla-style)         ║
// ║                                                                            ║
// ║   Replaces the v1 pixel painter with a *parametric* appearance system      ║
// ║   that reuses the vanilla drawInfantryUnit / drawCavalryUnit primitives.   ║
// ║   This makes custom troops look like real game units instead of like flat  ║
// ║   pixel-art stick figures.                                                 ║
// ║                                                                            ║
// ║   Three knobs are exposed to the user:                                     ║
// ║                                                                            ║
// ║     1. STYLE FACTION                                                       ║
// ║        Which vanilla faction's visual aesthetic to inherit (Yamato         ║
// ║        Clans, Great Khaganate, Hong Dynasty, …, "Other / Generic").        ║
// ║        Internally this is the canonical hex color the vanilla draw         ║
// ║        functions key on. The unit's actual battle color (the player's      ║
// ║        chosen faction color) is independent — see "factionColor" below.    ║
// ║                                                                            ║
// ║     2. POSE TYPE                                                           ║
// ║        Which of the vanilla "type" branches inside drawInfantryUnit        ║
// ║        / drawCavalryUnit to dispatch to (spearman, sword_shield, archer,   ║
// ║        crossbow, gun, two_handed, etc.). This decides the silhouette       ║
// ║        and base weapon. Defaulted from troop.role.                         ║
// ║                                                                            ║
// ║     3. ATTACK ANIMATION CURVE                                              ║
// ║        A user-editable keyframe curve mapping cooldown progress (0% =      ║
// ║        attack just fired / windup beginning, 100% = ready to fire again)   ║
// ║        to attack-pulse intensity. The curve is sampled every frame and     ║
// ║        added on top of the vanilla animation as a multiplier.              ║
// ║                                                                            ║
// ║   Storage on troop.appearance:                                             ║
// ║     {                                                                      ║
// ║       styleFaction:  "Yamato Clans" | "Great Khaganate" | ... | "Other",   ║
// ║       poseType:      "spearman" | "sword_shield" | "archer" | ...,         ║
// ║       sizeScale:     1.0,                                                  ║
// ║       walkSpeedMul:  1.0,                                                  ║
// ║       attackCurve:   [ {cd:0,intensity:0}, {cd:0.5,intensity:1}, ...],     ║
// ║       useCustomDraw: true                                                  ║
// ║     }                                                                      ║
// ╚════════════════════════════════════════════════════════════════════════════╝

window.ScenarioTroopAppearance = (function () {
"use strict";

const VERSION = "2.0.0-phase2";

// ─── Faction style presets ──────────────────────────────────────────────────
// These hex values are exactly the strings vanilla infscript.js / cavscript.js
// switch on (factionColor === "#1976d2" → Mongol look, etc.). "Other / Generic"
// uses a hex none of the vanilla branches match, so the unit gets the
// fallthrough mercenary look — the right baseline for fully-custom factions.
const FACTION_PRESETS = [
    { name: "Other / Generic",       hex: "#9e9e9e", desc: "No cultural style — falls through to plain mercenary look." },
    { name: "Yamato Clans",          hex: "#c2185b", desc: "Samurai kabuto, jingasa, Yumi bow." },
    { name: "Great Khaganate",       hex: "#1976d2", desc: "Mongol fur cap, lamellar, recurve bow." },
    { name: "Jinlord Confederacy",   hex: "#455a64", desc: "Heavy spiked steel helm, Jin-style armor." },
    { name: "Hong Dynasty",          hex: "#d32f2f", desc: "Song-Chinese plate and crossbows." },
    { name: "Dab Tribes",            hex: "#00838f", desc: "Tribal / Dali stylings — feathered cap, dao." },
    { name: "Tran Realm",            hex: "#388e3c", desc: "Vietnamese — rice hat (nón lá), bamboo." },
    { name: "Goryun Kingdom",        hex: "#7b1fa2", desc: "Goryeo — winged helm, ringmail." },
    { name: "Xiaran Dominion",       hex: "#fbc02d", desc: "Steppe / Western Xia — ochre cap." },
    { name: "High Plateau Kingdoms", hex: "#8d6e63", desc: "Tibetan / plateau — felt and turquoise." }
];

// ─── Pose types ─────────────────────────────────────────────────────────────
// These match the "type" branches inside drawInfantryUnit / drawCavalryUnit.
const POSE_TYPES_INFANTRY = [
    { value: "peasant",      label: "Peasant / Militia" },
    { value: "shortsword",   label: "Shortsword" },
    { value: "sword_shield", label: "Sword & Shield" },
    { value: "spearman",     label: "Spearman / Pikeman" },
    { value: "two_handed",   label: "Two-handed weapon" },
    { value: "archer",       label: "Archer (bow)" },
    { value: "crossbow",     label: "Crossbow" },
    { value: "gun",          label: "Gunner / Musketeer" },
    { value: "throwing",     label: "Javelin / Thrower" },
    { value: "firelance",    label: "Firelance" },
    { value: "bomb",         label: "Bomb / Grenadier" },
    { value: "rocket",       label: "Rocket / Hwacha" }
];
const POSE_TYPES_CAVALRY = [
    { value: "cavalry",      label: "Lancer / Heavy cavalry" },
    { value: "horse_archer", label: "Horse archer" },
    { value: "camel",        label: "Camel rider" },
    { value: "elephant",     label: "War elephant" }
];
const POSE_TYPES = [...POSE_TYPES_INFANTRY, ...POSE_TYPES_CAVALRY];

// Map ROLES → default pose so users don't have to set both.
const ROLE_TO_POSE = {
    "infantry":        "shortsword",
    "pike":            "spearman",
    "shield":          "sword_shield",
    "two_handed":      "two_handed",
    "archer":          "archer",
    "crossbow":        "crossbow",
    "gunner":          "gun",
    "throwing":        "throwing",
    "firelance":       "firelance",
    "bomb":            "bomb",
    "rocket":          "rocket",
    "cavalry":         "cavalry",
    "horse_archer":    "horse_archer",
    "mounted_gunner":  "horse_archer"
};

const POSES_THAT_ARE_CAVALRY = new Set(["cavalry", "horse_archer", "camel", "elephant"]);
const RANGED_POSES = new Set(["archer", "crossbow", "gun", "throwing", "firelance", "bomb", "rocket", "horse_archer"]);

// ─── State ──────────────────────────────────────────────────────────────────
const _state = {
    open:           false,
    troop:          null,
    app:            null,
    onSave:         null,
    runtimeHooked:  false,
    previewFaction: "#c62828",
    previewFrame:   0,
    previewIv:      null,
    previewMode:    "idle"
};

// ─── Schema helpers ─────────────────────────────────────────────────────────
function _resolveDefaultPose(role, isLarge) {
    if (!role) return "shortsword";
    const k = String(role).toLowerCase().replace(/[\s-]/g, "_");
    if (ROLE_TO_POSE[k]) return ROLE_TO_POSE[k];
    if (isLarge && k.includes("cav")) return "elephant";
    for (const key of Object.keys(ROLE_TO_POSE)) {
        if (k.includes(key)) return ROLE_TO_POSE[key];
    }
    return "shortsword";
}

function defaultAppearance(role, isLarge, isRanged) {
    return {
        styleFaction:  "Other / Generic",
        poseType:      _resolveDefaultPose(role, isLarge),
        sizeScale:     1.0,
        walkSpeedMul:  1.0,
        attackCurve: [
            { cd: 0.0, intensity: 0.0 },
            { cd: 0.5, intensity: 1.0 },
            { cd: 1.0, intensity: 0.0 }
        ],
        useCustomDraw: true
    };
}

function _normalize(app) {
    if (!app || typeof app !== "object") return null;
    const out = {
        styleFaction:  "Other / Generic",
        poseType:      "shortsword",
        sizeScale:     1.0,
        walkSpeedMul:  1.0,
        attackCurve:   [
            { cd: 0.0, intensity: 0.0 },
            { cd: 0.5, intensity: 1.0 },
            { cd: 1.0, intensity: 0.0 }
        ],
        useCustomDraw: true
    };
    if (typeof app.styleFaction === "string") {
        const found = FACTION_PRESETS.find(f => f.name === app.styleFaction);
        if (found) out.styleFaction = found.name;
    }
    if (typeof app.poseType === "string") {
        const found = POSE_TYPES.find(p => p.value === app.poseType);
        if (found) out.poseType = found.value;
    }
    if (typeof app.sizeScale === "number" && isFinite(app.sizeScale)) {
        out.sizeScale = Math.max(0.5, Math.min(2.0, app.sizeScale));
    }
    if (typeof app.walkSpeedMul === "number" && isFinite(app.walkSpeedMul)) {
        out.walkSpeedMul = Math.max(0.25, Math.min(3.0, app.walkSpeedMul));
    }
    if (Array.isArray(app.attackCurve) && app.attackCurve.length >= 2) {
        const curve = app.attackCurve
            .filter(k => k && typeof k.cd === "number" && typeof k.intensity === "number")
            .map(k => ({
                cd: Math.max(0, Math.min(1, k.cd)),
                intensity: Math.max(0, Math.min(2, k.intensity))
            }))
            .sort((a, b) => a.cd - b.cd);
        if (curve.length >= 2) out.attackCurve = curve;
    }
    if (typeof app.useCustomDraw === "boolean") out.useCustomDraw = app.useCustomDraw;
    // Backwards-compat: silently drop v1 pixel data — caller will fall back to
    // role-default rendering if useCustomDraw is false.
    return out;
}

function hasAppearance(troop) {
    return !!(troop && troop.appearance && typeof troop.appearance === "object" &&
              troop.appearance.useCustomDraw !== false &&
              typeof troop.appearance.styleFaction === "string");
}

function resolveStyleColor(app) {
    if (!app) return null;
    const found = FACTION_PRESETS.find(f => f.name === app.styleFaction);
    return found ? found.hex : "#9e9e9e";
}

function getAttackIntensity(app, cooldown, maxCooldown) {
    if (!app || !Array.isArray(app.attackCurve) || app.attackCurve.length < 2) return 1.0;
    if (!isFinite(maxCooldown) || maxCooldown <= 0) return 1.0;
    // Vanilla cooldown counts down: cooldown=maxCd at start, 0 at attack. Cycle
    // progress p ∈ [0,1] is therefore (maxCd - cooldown) / maxCd.
    const p = Math.max(0, Math.min(1, (maxCooldown - cooldown) / maxCooldown));
    const curve = app.attackCurve;
    if (p <= curve[0].cd) return curve[0].intensity;
    if (p >= curve[curve.length - 1].cd) return curve[curve.length - 1].intensity;
    for (let i = 0; i < curve.length - 1; i++) {
        const a = curve[i], b = curve[i + 1];
        if (p >= a.cd && p <= b.cd) {
            const t = (b.cd === a.cd) ? 0 : (p - a.cd) / (b.cd - a.cd);
            return a.intensity + (b.intensity - a.intensity) * t;
        }
    }
    return 1.0;
}

// Convert a desired intensity (0..1+) back into a "phantom" cooldown value the
// vanilla draw will read. Vanilla code computes its swing using:
//   cycle = (maxCd - cooldown) / maxCd       ∈ [0, 1]
// To make vanilla draw at swing position = intensity, we set:
//   cooldown = maxCd * (1 - clamp(intensity, 0, 1))
// >1 intensities are clamped to 1 (full extension); <0 to 0 (no swing).
function _intensityToPhantomCd(intensity, maxCd) {
    const clamped = Math.max(0, Math.min(1, intensity));
    return Math.round(maxCd * (1 - clamped));
}

// ─── Runtime hook ──────────────────────────────────────────────────────────
function _hookDraws() {
    if (_state.runtimeHooked) return;
    let hookedSomething = false;

    if (typeof window.drawInfantryUnit === "function") {
        const _origInf = window.drawInfantryUnit;
        window.drawInfantryUnit = function (
            ctx, x, y, moving, frame, factionColor, type, isAttacking,
            side, unitName, isFleeing, cooldown, unitAmmo, unit, reloadProgress
        ) {
            const app = unit && unit.stats && unit.stats._customAppearance;
            if (!app || !app.useCustomDraw) {
                return _origInf.call(this, ctx, x, y, moving, frame,
                    factionColor, type, isAttacking, side, unitName,
                    isFleeing, cooldown, unitAmmo, unit, reloadProgress);
            }
            // User picked a cavalry pose for an infantry-class unit → fall through
            if (POSES_THAT_ARE_CAVALRY.has(app.poseType)) {
                return _origInf.call(this, ctx, x, y, moving, frame,
                    factionColor, type, isAttacking, side, unitName,
                    isFleeing, cooldown, unitAmmo, unit, reloadProgress);
            }

            const styleColor = resolveStyleColor(app) || factionColor;
            const usePose    = app.poseType || type;
            const scale      = (typeof app.sizeScale === "number" && app.sizeScale > 0) ? app.sizeScale : 1.0;
            const walkMul    = (typeof app.walkSpeedMul === "number" && app.walkSpeedMul > 0) ? app.walkSpeedMul : 1.0;
            const adjFrame   = frame * walkMul;

            // Attack-curve override: substitute cooldown so vanilla draws at the
            // swing position the user chose. Only when actually attacking.
            let useCd = cooldown;
            if (isAttacking) {
                const maxCd = (unit && unit.stats && unit.stats.fireRate) || 100;
                const intensity = getAttackIntensity(app, cooldown || 0, maxCd);
                useCd = _intensityToPhantomCd(intensity, maxCd);
                if (unit) unit._customAttackIntensity = intensity;
            }

            if (scale !== 1.0) {
                ctx.save();
                ctx.translate(x, y);
                ctx.scale(scale, scale);
                ctx.translate(-x, -y);
                _origInf.call(this, ctx, x, y, moving, adjFrame,
                    styleColor, usePose, isAttacking, side, unitName,
                    isFleeing, useCd, unitAmmo, unit, reloadProgress);
                ctx.restore();
            } else {
                _origInf.call(this, ctx, x, y, moving, adjFrame,
                    styleColor, usePose, isAttacking, side, unitName,
                    isFleeing, useCd, unitAmmo, unit, reloadProgress);
            }
        };
        hookedSomething = true;
    }

    if (typeof window.drawCavalryUnit === "function") {
        const _origCav = window.drawCavalryUnit;
        window.drawCavalryUnit = function (
            ctx, x, y, moving, frame, factionColor, isAttacking, type,
            side, unitName, isFleeing, cooldown, unitAmmo, unit, reloadProgress
        ) {
            const app = unit && unit.stats && unit.stats._customAppearance;
            if (!app || !app.useCustomDraw) {
                return _origCav.call(this, ctx, x, y, moving, frame,
                    factionColor, isAttacking, type, side, unitName,
                    isFleeing, cooldown, unitAmmo, unit, reloadProgress);
            }
            if (!POSES_THAT_ARE_CAVALRY.has(app.poseType)) {
                return _origCav.call(this, ctx, x, y, moving, frame,
                    factionColor, isAttacking, type, side, unitName,
                    isFleeing, cooldown, unitAmmo, unit, reloadProgress);
            }

            const styleColor = resolveStyleColor(app) || factionColor;
            const usePose    = app.poseType || type;
            const scale      = (typeof app.sizeScale === "number" && app.sizeScale > 0) ? app.sizeScale : 1.0;
            const walkMul    = (typeof app.walkSpeedMul === "number" && app.walkSpeedMul > 0) ? app.walkSpeedMul : 1.0;
            const adjFrame   = frame * walkMul;

            let useCd = cooldown;
            if (isAttacking) {
                const maxCd = (unit && unit.stats && unit.stats.fireRate) || 100;
                const intensity = getAttackIntensity(app, cooldown || 0, maxCd);
                useCd = _intensityToPhantomCd(intensity, maxCd);
                if (unit) unit._customAttackIntensity = intensity;
            }

            if (scale !== 1.0) {
                ctx.save();
                ctx.translate(x, y);
                ctx.scale(scale, scale);
                ctx.translate(-x, -y);
                _origCav.call(this, ctx, x, y, moving, adjFrame,
                    styleColor, isAttacking, usePose, side, unitName,
                    isFleeing, useCd, unitAmmo, unit, reloadProgress);
                ctx.restore();
            } else {
                _origCav.call(this, ctx, x, y, moving, adjFrame,
                    styleColor, isAttacking, usePose, side, unitName,
                    isFleeing, useCd, unitAmmo, unit, reloadProgress);
            }
        };
        hookedSomething = true;
    }

    if (hookedSomething) {
        _state.runtimeHooked = true;
        console.log("[ScenarioTroopAppearance] v2 draw hooks installed.");
    }
}

(function _autoHook() {
    if (typeof window.drawInfantryUnit === "function" &&
        typeof window.drawCavalryUnit  === "function") {
        _hookDraws();
        return;
    }
    let attempts = 0;
    const iv = setInterval(() => {
        attempts++;
        if (typeof window.drawInfantryUnit === "function" &&
            typeof window.drawCavalryUnit  === "function") {
            _hookDraws();
            clearInterval(iv);
        } else if (attempts > 200) {
            clearInterval(iv);
            console.warn("[ScenarioTroopAppearance] draw hook timed out after 20s.");
        }
    }, 100);
})();

// ─── Thumbnail (offscreen vanilla draw) ────────────────────────────────────
function drawAppearanceThumbnail(canvas, app, factionColor) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!app) {
        ctx.fillStyle = "#888"; ctx.font = "11px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("(no style)", canvas.width / 2, canvas.height / 2);
        return;
    }

    const isCav  = POSES_THAT_ARE_CAVALRY.has(app.poseType);
    const drawFn = isCav ? window.drawCavalryUnit : window.drawInfantryUnit;
    if (typeof drawFn !== "function") {
        ctx.fillStyle = "#888"; ctx.font = "10px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("(draw not loaded)", canvas.width / 2, canvas.height / 2);
        return;
    }

    // Stub unit — useCustomAppearance left null to bypass our wrapper.
    const fakeStats = {
        role: app.poseType, isRanged: RANGED_POSES.has(app.poseType),
        ammo: 1, fireRate: 100, armor: 15, health: 100,
        _customAppearance: null
    };
    const fakeUnit = {
        stats: fakeStats, side: "player", unitType: "(preview)",
        x: 0, y: 0, _prevX: undefined, _prevY: undefined,
        facingDir: 1, color: factionColor || "#888",
        cooldown: 0, ammo: 1, hp: 100, state: "idle"
    };

    const cx = canvas.width / 2;
    const cy = canvas.height - 10;

    try {
        const styleColor = resolveStyleColor(app) || factionColor || "#888";
        if (isCav) {
            drawFn(ctx, cx, cy, false, 0, styleColor, false, app.poseType,
                "player", "(preview)", false, 0, 1, fakeUnit, 0);
        } else {
            drawFn(ctx, cx, cy, false, 0, styleColor, app.poseType, false,
                "player", "(preview)", false, 0, 1, fakeUnit, 0);
        }
    } catch (e) {
        ctx.fillStyle = "#a44"; ctx.font = "10px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("(preview error)", canvas.width / 2, canvas.height / 2);
    }
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ PAINTER UI                                                               ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function _ensureCSS() {
    if (document.getElementById("sta-painter-css")) return;
    const css = document.createElement("style");
    css.id = "sta-painter-css";
    css.textContent = `
.sta-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.78);
    z-index: 100050; display: flex; align-items: center; justify-content: center;
    font-family: "Segoe UI", Tahoma, sans-serif; }
.sta-modal { background: #1e2329; color: #e6e9ef; border: 2px solid #3a4554;
    border-radius: 6px; width: min(1100px, 96vw); max-height: 92vh;
    display: flex; flex-direction: column; overflow: hidden;
    box-shadow: 0 16px 64px rgba(0,0,0,0.6); }
.sta-header { background: linear-gradient(180deg, #2a3340, #1e2329);
    padding: 10px 14px; border-bottom: 1px solid #3a4554;
    display: flex; align-items: center; justify-content: space-between; }
.sta-header h2 { margin: 0; font-size: 15px; font-weight: 600; }
.sta-close-btn { background: #4a3030; color: #e6e9ef; border: 1px solid #6a4040;
    padding: 4px 12px; border-radius: 3px; cursor: pointer; font-size: 13px; }
.sta-close-btn:hover { background: #6a3030; }
.sta-body { display: grid; grid-template-columns: 320px 1fr; gap: 0;
    flex: 1; min-height: 0; overflow: hidden; }
.sta-sidebar { border-right: 1px solid #3a4554; padding: 14px;
    overflow-y: auto; background: #181c22; font-size: 12px; }
.sta-main { padding: 16px; overflow-y: auto; background: #14181d;
    display: flex; flex-direction: column; gap: 14px; }
.sta-section { margin-bottom: 16px; }
.sta-section-title { font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.6px; color: #7e8a9a; margin-bottom: 6px; }
.sta-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; font-size: 12px; }
.sta-row label { color: #aab; min-width: 90px; }
.sta-select, .sta-numfield { background: #2a3340; color: #e6e9ef;
    border: 1px solid #3a4554; padding: 4px 7px; border-radius: 3px;
    font-size: 12px; flex: 1; }
.sta-numfield { flex: 0 0 70px; max-width: 70px; }
.sta-faction-grid { display: grid; grid-template-columns: 1fr; gap: 4px; }
.sta-faction-item { display: flex; align-items: center; gap: 8px;
    padding: 6px 8px; border: 1px solid #3a4554; border-radius: 3px;
    cursor: pointer; background: #1e2329; }
.sta-faction-item:hover { background: #252b34; }
.sta-faction-item.active { border-color: #ffd54f; background: #2a3340; }
.sta-faction-swatch-dot { width: 18px; height: 18px; border: 1px solid #1a1a1a;
    border-radius: 3px; flex-shrink: 0; }
.sta-faction-info { flex: 1; min-width: 0; }
.sta-faction-name { font-size: 12px; font-weight: 600; color: #e6e9ef; }
.sta-faction-desc { font-size: 10px; color: #7e8a9a; line-height: 1.3; margin-top: 1px; }
.sta-preview-wrap { background: #0e1115; border: 1px solid #3a4554;
    border-radius: 4px; padding: 12px; display: flex; gap: 14px; align-items: stretch; }
.sta-preview-canvas { background:
    repeating-conic-gradient(#1a1d23 0% 25%, #15181d 0% 50%) 50% / 14px 14px;
    border: 1px solid #3a4554; border-radius: 3px; flex-shrink: 0; }
.sta-preview-side { flex: 1; display: flex; flex-direction: column;
    gap: 6px; min-width: 0; }
.sta-preview-controls { display: flex; gap: 4px; flex-wrap: wrap; }
.sta-mini-btn { background: #2a3340; border: 1px solid #3a4554; color: #e6e9ef;
    padding: 4px 9px; border-radius: 3px; font-size: 11px; cursor: pointer; }
.sta-mini-btn:hover { background: #354152; }
.sta-mini-btn.active { background: #2e5a8a; border-color: #4a8eda; }
.sta-curve-canvas { background: #14181d; border: 1px solid #3a4554;
    border-radius: 3px; cursor: crosshair; display: block; }
.sta-curve-help { font-size: 11px; color: #7e8a9a; line-height: 1.5; }
.sta-footer { padding: 10px 14px; border-top: 1px solid #3a4554;
    background: #181c22; display: flex; gap: 8px; justify-content: flex-end; }
.sta-btn { background: #2a3340; border: 1px solid #3a4554; color: #e6e9ef;
    padding: 6px 14px; border-radius: 3px; cursor: pointer; font-size: 13px; }
.sta-btn:hover { background: #354152; }
.sta-btn.primary { background: #2e5a8a; border-color: #4a8eda; }
.sta-btn.primary:hover { background: #3a6fa8; }
.sta-btn.danger { background: #4a3030; border-color: #6a4040; }
.sta-btn.danger:hover { background: #6a3030; }
.sta-help { font-size: 11px; color: #7e8a9a; line-height: 1.5; }
`;
    document.head.appendChild(css);
}

function openPainter(troop, onSave) {
    if (!troop) return;
    _ensureCSS();

    _state.open = true;
    _state.troop = troop;
    _state.onSave = onSave || null;
    _state.previewMode = "idle";
    _state.previewFrame = 0;

    if (troop.appearance && typeof troop.appearance === "object" &&
        typeof troop.appearance.styleFaction === "string") {
        _state.app = _normalize(troop.appearance);
    } else {
        // No appearance yet (or v1 pixel data) → start from defaults.
        _state.app = defaultAppearance(troop.role, troop.isLarge, troop.isRanged);
    }

    // Default the live preview team color to first scenario faction's color
    try {
        const ed = window.ScenarioEditor;
        const s = ed && ed._state && ed._state.scenario;
        if (s && Array.isArray(s.factions) && s.factions[0] && s.factions[0].color) {
            _state.previewFaction = s.factions[0].color;
        } else {
            _state.previewFaction = "#c62828";
        }
    } catch (e) { _state.previewFaction = "#c62828"; }

    _buildModal();
    _startPreviewLoop();
}

function closePainter() {
    _stopPreviewLoop();
    const o = document.getElementById("sta-overlay");
    if (o && o.parentNode) o.parentNode.removeChild(o);
    _state.open = false;
    _state.troop = null;
    _state.app = null;
}

function _buildModal() {
    const existing = document.getElementById("sta-overlay");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    const overlay = document.createElement("div");
    overlay.className = "sta-overlay";
    overlay.id = "sta-overlay";

    const modal = document.createElement("div");
    modal.className = "sta-modal";

    const header = document.createElement("div");
    header.className = "sta-header";
    header.innerHTML = `<h2>🎨 Edit Appearance — ${_escape(_state.troop.name || "(unnamed)")}</h2>`;
    const closeBtn = document.createElement("button");
    closeBtn.className = "sta-close-btn";
    closeBtn.textContent = "✕  Cancel";
    closeBtn.onclick = () => {
        if (confirm("Discard changes to this appearance?")) closePainter();
    };
    header.appendChild(closeBtn);
    modal.appendChild(header);

    const body = document.createElement("div");
    body.className = "sta-body";
    body.appendChild(_buildSidebar());
    body.appendChild(_buildMainPane());
    modal.appendChild(body);

    const footer = document.createElement("div");
    footer.className = "sta-footer";

    const removeBtn = document.createElement("button");
    removeBtn.className = "sta-btn danger";
    removeBtn.textContent = "🗑  Reset to default";
    removeBtn.title = "Remove the custom appearance — troop will use the role-based vanilla look.";
    removeBtn.onclick = () => {
        if (!confirm("Remove the custom appearance?\nThis troop will revert to the default role-based vanilla look.")) return;
        _state.troop.appearance = null;
        if (typeof _state.onSave === "function") _state.onSave(_state.troop);
        closePainter();
    };
    footer.appendChild(removeBtn);

    const spacer = document.createElement("div");
    spacer.style.flex = "1";
    footer.appendChild(spacer);

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "sta-btn";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = () => {
        if (confirm("Discard changes to this appearance?")) closePainter();
    };
    footer.appendChild(cancelBtn);

    const saveBtn = document.createElement("button");
    saveBtn.className = "sta-btn primary";
    saveBtn.textContent = "💾  Save appearance";
    saveBtn.onclick = () => {
        _state.troop.appearance = _normalize(_state.app);
        if (typeof _state.onSave === "function") _state.onSave(_state.troop);
        closePainter();
    };
    footer.appendChild(saveBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

function _buildSidebar() {
    const side = document.createElement("div");
    side.className = "sta-sidebar";

    // ── Style faction ──
    const fSec = document.createElement("div");
    fSec.className = "sta-section";
    const fT = document.createElement("div");
    fT.className = "sta-section-title";
    fT.textContent = "Style faction (cultural look)";
    fSec.appendChild(fT);
    const fHelp = document.createElement("div");
    fHelp.className = "sta-help";
    fHelp.style.marginBottom = "6px";
    fHelp.textContent = "Pick which vanilla faction's helmet, armor, and weapon style this troop borrows. The unit's actual team color (red/blue/etc.) is independent — this only changes cultural details. Use 'Other / Generic' for purely fictional factions.";
    fSec.appendChild(fHelp);

    const grid = document.createElement("div");
    grid.className = "sta-faction-grid";
    FACTION_PRESETS.forEach(f => {
        const item = document.createElement("div");
        item.className = "sta-faction-item" + (_state.app.styleFaction === f.name ? " active" : "");
        item.dataset.fname = f.name;
        item.style.cssText = (item.style.cssText || "") + "display:flex;align-items:center;gap:7px;padding:5px 7px;";

        // ── Mini unit thumbnail — shows the unit in this faction's armor/weapon style ──
        const miniCv = document.createElement("canvas");
        miniCv.width  = 56;
        miniCv.height = 70;
        miniCv.style.cssText = "flex-shrink:0;border:1px solid #2a3a4a;border-radius:2px;background:#1a2230;image-rendering:pixelated;";
        item.appendChild(miniCv);

        // Draw the thumbnail for this specific faction style.
        // We create a temporary appearance that combines the current pose with this faction's style.
        const _drawMini = () => {
            const ctx2 = miniCv.getContext("2d");
            ctx2.clearRect(0, 0, miniCv.width, miniCv.height);
            ctx2.fillStyle = "#1a2230";
            ctx2.fillRect(0, 0, miniCv.width, miniCv.height);
            ctx2.fillStyle = "#2a3f2a";
            ctx2.fillRect(0, miniCv.height - 10, miniCv.width, 10);

            const isCav  = POSES_THAT_ARE_CAVALRY.has(_state.app.poseType);
            const drawFn = isCav ? window.drawCavalryUnit : window.drawInfantryUnit;
            if (typeof drawFn !== "function") {
                // Fallback: colored silhouette
                ctx2.fillStyle = f.hex;
                ctx2.beginPath();
                ctx2.arc(miniCv.width / 2, 16, 8, 0, Math.PI * 2);
                ctx2.fill();
                ctx2.fillRect(miniCv.width / 2 - 7, 25, 14, 22);
                ctx2.fillRect(miniCv.width / 2 - 7, 47, 6, 12);
                ctx2.fillRect(miniCv.width / 2 + 1, 47, 6, 12);
                return;
            }

            // Stub unit — null customAppearance to bypass our wrapper hook
            const fakeStats = {
                role: _state.app.poseType,
                isRanged: RANGED_POSES.has(_state.app.poseType),
                ammo: 1, fireRate: 100, armor: 15, health: 100,
                _customAppearance: null
            };
            const fakeUnit = {
                stats: fakeStats, side: "player", unitType: "(preview)",
                x: 0, y: 0, facingDir: 1, color: "#c62828",
                cooldown: 0, ammo: 1, hp: 100
            };

            try {
                ctx2.save();
                // Scale the draw output to fit the miniature canvas
                const scale = 0.45;
                const cx = miniCv.width / 2;
                const cy = miniCv.height - 10;
                ctx2.translate(cx, cy);
                ctx2.scale(scale, scale);
                ctx2.translate(-cx, -cy);

                if (isCav) {
                    drawFn(ctx2, cx, cy, false, 0,
                        f.hex, false, _state.app.poseType,
                        "player", "", false, 0, 1, fakeUnit, 0);
                } else {
                    drawFn(ctx2, cx, cy, false, 0,
                        f.hex, _state.app.poseType, false,
                        "player", "", false, 0, 1, fakeUnit, 0);
                }
                ctx2.restore();
            } catch (e) {
                ctx2.restore();
                ctx2.fillStyle = f.hex;
                ctx2.fillRect(miniCv.width / 2 - 7, 18, 14, 30);
            }
        };

        // Draw immediately on next tick (draw fns may not be ready synchronously)
        setTimeout(_drawMini, 0);
        // Expose so pose change can trigger a redraw of all mini thumbs
        miniCv._redraw = _drawMini;
        // Tag by faction so the grid update can find them
        miniCv.dataset.factionMiniFor = f.name;

        const info = document.createElement("div");
        info.className = "sta-faction-info";
        const nm = document.createElement("div");
        nm.className = "sta-faction-name";
        nm.textContent = f.name;
        info.appendChild(nm);
        const ds = document.createElement("div");
        ds.className = "sta-faction-desc";
        ds.textContent = f.desc;
        info.appendChild(ds);
        item.appendChild(info);
        item.onclick = () => {
            _state.app.styleFaction = f.name;
            grid.querySelectorAll(".sta-faction-item").forEach(x =>
                x.classList.toggle("active", x.dataset.fname === f.name));
        };
        grid.appendChild(item);
    });
    fSec.appendChild(grid);
    side.appendChild(fSec);

    // ── Pose ──
    const pSec = document.createElement("div");
    pSec.className = "sta-section";
    const pT = document.createElement("div");
    pT.className = "sta-section-title";
    pT.textContent = "Pose / silhouette";
    pSec.appendChild(pT);

    const poseRow = document.createElement("div");
    poseRow.className = "sta-row";
    const poseLbl = document.createElement("label");
    poseLbl.textContent = "Pose";
    poseRow.appendChild(poseLbl);
    const poseSel = document.createElement("select");
    poseSel.className = "sta-select";
    const optgInf = document.createElement("optgroup");
    optgInf.label = "Infantry poses";
    POSE_TYPES_INFANTRY.forEach(p => {
        const o = document.createElement("option");
        o.value = p.value; o.textContent = p.label;
        if (_state.app.poseType === p.value) o.selected = true;
        optgInf.appendChild(o);
    });
    poseSel.appendChild(optgInf);
    const optgCav = document.createElement("optgroup");
    optgCav.label = "Cavalry poses";
    POSE_TYPES_CAVALRY.forEach(p => {
        const o = document.createElement("option");
        o.value = p.value; o.textContent = p.label;
        if (_state.app.poseType === p.value) o.selected = true;
        optgCav.appendChild(o);
    });
    poseSel.appendChild(optgCav);
    poseSel.onchange = () => {
        _state.app.poseType = poseSel.value;
        // Redraw all faction mini-thumbnails to reflect the new pose
        document.querySelectorAll("canvas[data-faction-mini-for]").forEach(cv => {
            if (typeof cv._redraw === "function") cv._redraw();
        });
    };
    poseRow.appendChild(poseSel);
    pSec.appendChild(poseRow);

    const poseHelp = document.createElement("div");
    poseHelp.className = "sta-help";
    poseHelp.style.marginTop = "4px";
    poseHelp.textContent = "Picks the silhouette and base weapon. Combined with the style faction above, you get e.g. a Yamato spearman or a Mongol horse archer.";
    pSec.appendChild(poseHelp);
    side.appendChild(pSec);

    // ── Size + walk ──
    const sSec = document.createElement("div");
    sSec.className = "sta-section";
    const sT = document.createElement("div");
    sT.className = "sta-section-title";
    sT.textContent = "Size & walk";
    sSec.appendChild(sT);

    const szRow = document.createElement("div");
    szRow.className = "sta-row";
    const szLbl = document.createElement("label");
    szLbl.textContent = "Size scale";
    szRow.appendChild(szLbl);
    const szIn = document.createElement("input");
    szIn.type = "number"; szIn.className = "sta-numfield";
    szIn.min = "0.5"; szIn.max = "2.0"; szIn.step = "0.05";
    szIn.value = _state.app.sizeScale;
    szIn.onchange = () => {
        const v = parseFloat(szIn.value);
        if (!isFinite(v)) { szIn.value = _state.app.sizeScale; return; }
        _state.app.sizeScale = Math.max(0.5, Math.min(2.0, v));
        szIn.value = _state.app.sizeScale;
    };
    szRow.appendChild(szIn);
    sSec.appendChild(szRow);

    const wsRow = document.createElement("div");
    wsRow.className = "sta-row";
    const wsLbl = document.createElement("label");
    wsLbl.textContent = "Walk speed ×";
    wsRow.appendChild(wsLbl);
    const wsIn = document.createElement("input");
    wsIn.type = "number"; wsIn.className = "sta-numfield";
    wsIn.min = "0.25"; wsIn.max = "3.0"; wsIn.step = "0.05";
    wsIn.value = _state.app.walkSpeedMul;
    wsIn.onchange = () => {
        const v = parseFloat(wsIn.value);
        if (!isFinite(v)) { wsIn.value = _state.app.walkSpeedMul; return; }
        _state.app.walkSpeedMul = Math.max(0.25, Math.min(3.0, v));
        wsIn.value = _state.app.walkSpeedMul;
    };
    wsRow.appendChild(wsIn);
    sSec.appendChild(wsRow);

    const sHelp = document.createElement("div");
    sHelp.className = "sta-help";
    sHelp.textContent = "Size scale 1.0 = normal. Walk speed multiplier scales the leg-cycle frequency only (not actual movement speed — that's in the stats).";
    sSec.appendChild(sHelp);
    side.appendChild(sSec);

    return side;
}

function _buildMainPane() {
    const main = document.createElement("div");
    main.className = "sta-main";

    // ── Live preview ──
    const previewSec = document.createElement("div");
    previewSec.className = "sta-section";
    const pT = document.createElement("div");
    pT.className = "sta-section-title";
    pT.textContent = "Live preview (uses real vanilla draw)";
    previewSec.appendChild(pT);

    const previewWrap = document.createElement("div");
    previewWrap.className = "sta-preview-wrap";

    const previewCv = document.createElement("canvas");
    previewCv.className = "sta-preview-canvas";
    previewCv.id = "sta-preview-canvas";
    previewCv.width = 220; previewCv.height = 220;
    previewWrap.appendChild(previewCv);

    const previewSide = document.createElement("div");
    previewSide.className = "sta-preview-side";

    const animLbl = document.createElement("div");
    animLbl.className = "sta-section-title";
    animLbl.textContent = "Animation state";
    previewSide.appendChild(animLbl);

    const ctrls = document.createElement("div");
    ctrls.className = "sta-preview-controls";
    [
        { mode: "idle",      label: "Idle" },
        { mode: "moving",    label: "Walking" },
        { mode: "attacking", label: "Attacking" }
    ].forEach(opt => {
        const b = document.createElement("button");
        b.className = "sta-mini-btn" + (_state.previewMode === opt.mode ? " active" : "");
        b.textContent = opt.label;
        b.onclick = () => {
            _state.previewMode = opt.mode;
            _state.previewFrame = 0;
            ctrls.querySelectorAll("button").forEach(x => x.classList.remove("active"));
            b.classList.add("active");
        };
        ctrls.appendChild(b);
    });
    previewSide.appendChild(ctrls);

    const teamLbl = document.createElement("div");
    teamLbl.className = "sta-section-title";
    teamLbl.style.marginTop = "8px";
    teamLbl.textContent = "Preview team color";
    previewSide.appendChild(teamLbl);

    const teamRow = document.createElement("div");
    teamRow.className = "sta-preview-controls";
    const teamColors = [
        { name: "Red",   hex: "#c62828" },
        { name: "Blue",  hex: "#1565c0" },
        { name: "Green", hex: "#2e7d32" },
        { name: "Amber", hex: "#ef6c00" },
        { name: "White", hex: "#ffffff" }
    ];
    try {
        const ed = window.ScenarioEditor;
        const s = ed && ed._state && ed._state.scenario;
        if (s && Array.isArray(s.factions)) {
            s.factions.forEach(f => {
                if (f && f.color && !teamColors.find(t => t.hex === f.color)) {
                    teamColors.push({ name: f.name || f.color, hex: f.color });
                }
            });
        }
    } catch (e) { /* ignore */ }
    teamColors.forEach(tc => {
        const b = document.createElement("button");
        b.className = "sta-mini-btn" + (_state.previewFaction === tc.hex ? " active" : "");
        b.textContent = tc.name;
        b.style.borderLeft = "4px solid " + tc.hex;
        b.onclick = () => {
            _state.previewFaction = tc.hex;
            teamRow.querySelectorAll("button").forEach(x => x.classList.remove("active"));
            b.classList.add("active");
        };
        teamRow.appendChild(b);
    });
    previewSide.appendChild(teamRow);

    const liveHelp = document.createElement("div");
    liveHelp.className = "sta-help";
    liveHelp.style.marginTop = "8px";
    liveHelp.innerHTML =
        "Preview uses the actual vanilla draw functions, so what you see here " +
        "is exactly what will appear in battle. Switch animation states to " +
        "test the walk cycle and your custom attack curve.";
    previewSide.appendChild(liveHelp);

    previewWrap.appendChild(previewSide);
    previewSec.appendChild(previewWrap);
    main.appendChild(previewSec);

    // ── Attack curve editor — collapsible ──
    const curveSec = document.createElement("div");
    curveSec.className = "sta-section";
    curveSec.style.cssText = (curveSec.style.cssText || "") + "padding:0;overflow:hidden;";

    // Toggle button header
    const curveToggleBtn = document.createElement("button");
    curveToggleBtn.style.cssText = `
        display:flex;align-items:center;gap:8px;width:100%;text-align:left;
        background:#1a2a3a;border:none;border-bottom:1px solid #2a3f5a;
        color:#cfd8dc;padding:9px 12px;cursor:pointer;font:12px Tahoma,Verdana,sans-serif;
        transition:background 0.12s;
    `;
    curveToggleBtn.onmouseenter = () => { curveToggleBtn.style.background = "#1e3a5a"; };
    curveToggleBtn.onmouseleave = () => { curveToggleBtn.style.background = "#1a2a3a"; };

    let _curveOpen = true;  // expanded by default

    const curveArrow  = document.createElement("span");
    curveArrow.textContent = "▼";
    curveArrow.style.cssText = "font-size:9px;transition:transform 0.15s;color:#f5d76e;";

    const curveTitleTxt = document.createElement("span");
    curveTitleTxt.style.cssText = "font-size:11px;font-weight:bold;letter-spacing:0.5px;color:#f5d76e;text-transform:uppercase;flex:1;";
    curveTitleTxt.textContent = "Attack Animation Curve";

    const curveStatusTxt = document.createElement("span");
    curveStatusTxt.style.cssText = "font-size:10px;color:#7a9ab8;";
    curveStatusTxt.textContent = "click to collapse";

    curveToggleBtn.appendChild(curveArrow);
    curveToggleBtn.appendChild(curveTitleTxt);
    curveToggleBtn.appendChild(curveStatusTxt);
    curveSec.appendChild(curveToggleBtn);

    // Collapsible body
    const curveBody = document.createElement("div");
    curveBody.style.cssText = "padding:10px 12px;display:block;";

    const curveHelp = document.createElement("div");
    curveHelp.className = "sta-curve-help";
    curveHelp.style.marginBottom = "6px";
    curveHelp.innerHTML =
        "X axis = cooldown progress (0% just fired → 100% ready to fire again). " +
        "Y axis = attack swing intensity (0 = held still, 1.0 = full vanilla swing, > 1.0 = exaggerated). " +
        "<strong>Click</strong> empty area to add a keyframe, <strong>drag</strong> a keyframe to move it, " +
        "<strong>right-click</strong> a keyframe to delete it (minimum 2 keyframes).";
    curveBody.appendChild(curveHelp);

    const curveCv = document.createElement("canvas");
    curveCv.className = "sta-curve-canvas";
    curveCv.id = "sta-curve-canvas";
    curveCv.width = 720; curveCv.height = 220;
    curveCv.style.width = "100%";
    curveBody.appendChild(curveCv);
    _attachCurveHandlers(curveCv);

    const curveBtns = document.createElement("div");
    curveBtns.style.cssText = "display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;";
    [
        { label: "Reset to vanilla", curve: [{cd:0,intensity:0},{cd:0.5,intensity:1.0},{cd:1,intensity:0}] },
        { label: "Quick stab",       curve: [{cd:0,intensity:0},{cd:0.15,intensity:1.0},{cd:0.35,intensity:0.0},{cd:1,intensity:0}] },
        { label: "Heavy windup",     curve: [{cd:0,intensity:0},{cd:0.7,intensity:0.3},{cd:0.85,intensity:1.2},{cd:1,intensity:0}] },
        { label: "Sustained pose",   curve: [{cd:0,intensity:0.6},{cd:0.5,intensity:1.0},{cd:1,intensity:0.6}] }
    ].forEach(p => {
        const b = document.createElement("button");
        b.className = "sta-mini-btn";
        b.textContent = p.label;
        b.onclick = () => {
            _state.app.attackCurve = JSON.parse(JSON.stringify(p.curve));
            _drawCurve(document.getElementById("sta-curve-canvas"));
        };
        curveBtns.appendChild(b);
    });
    curveBody.appendChild(curveBtns);
    curveSec.appendChild(curveBody);

    // Toggle logic
    curveToggleBtn.onclick = () => {
        _curveOpen = !_curveOpen;
        curveBody.style.display = _curveOpen ? "block" : "none";
        curveArrow.style.transform = _curveOpen ? "rotate(0deg)" : "rotate(-90deg)";
        curveStatusTxt.textContent = _curveOpen ? "click to collapse" : "click to expand";
        if (_curveOpen) {
            // Redraw curve now that the canvas is visible
            setTimeout(() => { _drawCurve(document.getElementById("sta-curve-canvas")); }, 0);
        }
    };

    main.appendChild(curveSec);
    setTimeout(() => { _drawCurve(curveCv); }, 0);
    return main;
}

// ─── Live preview animation loop ────────────────────────────────────────────
function _startPreviewLoop() {
    _stopPreviewLoop();
    _state.previewIv = setInterval(() => {
        _state.previewFrame++;
        _renderPreview();
        const cc = document.getElementById("sta-curve-canvas");
        if (cc) _drawCurve(cc);
    }, 1000 / 30);
}
function _stopPreviewLoop() {
    if (_state.previewIv) { clearInterval(_state.previewIv); _state.previewIv = null; }
}

function _renderPreview() {
    const cv = document.getElementById("sta-preview-canvas");
    if (!cv || !_state.app) return;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);

    // Scene background
    ctx.fillStyle = "#1f2630";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = "#3a4f3a";
    ctx.fillRect(0, cv.height - 30, cv.width, 30);

    const isCav = POSES_THAT_ARE_CAVALRY.has(_state.app.poseType);
    const drawFn = isCav ? window.drawCavalryUnit : window.drawInfantryUnit;
    if (typeof drawFn !== "function") {
        ctx.fillStyle = "#aaa"; ctx.font = "12px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("Vanilla draw not loaded yet…", cv.width / 2, cv.height / 2);
        return;
    }

    const moving      = (_state.previewMode === "moving" || _state.previewMode === "attacking");
    const isAttacking = (_state.previewMode === "attacking");
    const maxCd       = 100;
    const cycleProgress = isAttacking ? ((_state.previewFrame % 60) / 60) : 0;
    const realCd        = isAttacking ? Math.round(maxCd * (1 - cycleProgress)) : 0;

    const t = _state.troop || {};
    const fakeStats = {
        role:     _state.app.poseType,
        isRanged: RANGED_POSES.has(_state.app.poseType),
        ammo:     5, fireRate: maxCd,
        armor:    (typeof t.armor === "number") ? t.armor : 15,
        health:   100,
        _customAppearance: null   // prevent wrapper recursion
    };
    const fakeUnit = {
        stats: fakeStats, side: "player",
        unitType: t.name || "Preview",
        x: 0, y: 0, _prevX: undefined, _prevY: undefined,
        facingDir: 1,
        color: _state.previewFaction || "#c62828",
        cooldown: realCd, ammo: 5, hp: 100,
        state: isAttacking ? "attacking" : (moving ? "moving" : "idle")
    };

    const styleColor = resolveStyleColor(_state.app);
    const usePose    = _state.app.poseType;
    const sc         = _state.app.sizeScale || 1.0;
    const wm         = _state.app.walkSpeedMul || 1.0;
    const adjFrame   = _state.previewFrame * wm;

    const anchorX = cv.width / 2;
    const anchorY = cv.height - 30;

    // Apply attack-curve override the same way the runtime hook will.
    let useCd = realCd;
    if (isAttacking) {
        const intensity = getAttackIntensity(_state.app, realCd, maxCd);
        useCd = _intensityToPhantomCd(intensity, maxCd);
    }

    try {
        ctx.save();
        if (sc !== 1.0) {
            ctx.translate(anchorX, anchorY);
            ctx.scale(sc, sc);
            ctx.translate(-anchorX, -anchorY);
        }
        if (isCav) {
            drawFn(ctx, anchorX, anchorY, moving, adjFrame,
                styleColor, isAttacking, usePose, "player",
                t.name || "Preview", false, useCd, 5, fakeUnit, 0);
        } else {
            drawFn(ctx, anchorX, anchorY, moving, adjFrame,
                styleColor, usePose, isAttacking, "player",
                t.name || "Preview", false, useCd, 5, fakeUnit, 0);
        }
        ctx.restore();
    } catch (e) {
        console.warn("[ScenarioTroopAppearance] preview draw error:", e);
        ctx.fillStyle = "#a44"; ctx.font = "11px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("(preview error — see console)", cv.width / 2, cv.height / 2);
    }
}

// ─── Attack-curve canvas editor ────────────────────────────────────────────
const _curveDrag = { keyIdx: -1 };

function _attachCurveHandlers(cv) {
    cv.onmousedown = (e) => {
        if (e.button === 2) return;
        const { px, py } = _curveCoords(cv, e);
        const idx = _findCurveKeyAt(cv, px, py);
        if (idx >= 0) {
            _curveDrag.keyIdx = idx;
        } else {
            const cd = Math.max(0, Math.min(1, px));
            const intensity = Math.max(0, Math.min(1.5, py));
            _state.app.attackCurve.push({ cd, intensity });
            _state.app.attackCurve.sort((a, b) => a.cd - b.cd);
            _drawCurve(cv);
            _curveDrag.keyIdx = _state.app.attackCurve.findIndex(k => k.cd === cd && k.intensity === intensity);
        }
    };
    cv.onmousemove = (e) => {
        if (_curveDrag.keyIdx < 0) return;
        const { px, py } = _curveCoords(cv, e);
        const c = _state.app.attackCurve;
        if (_curveDrag.keyIdx >= c.length) { _curveDrag.keyIdx = -1; return; }
        const k = c[_curveDrag.keyIdx];
        if (_curveDrag.keyIdx === 0)                 k.cd = 0;
        else if (_curveDrag.keyIdx === c.length - 1) k.cd = 1;
        else                                          k.cd = Math.max(0, Math.min(1, px));
        k.intensity = Math.max(0, Math.min(1.5, py));
        const draggedRef = k;
        c.sort((a, b) => a.cd - b.cd);
        _curveDrag.keyIdx = c.indexOf(draggedRef);
        _drawCurve(cv);
    };
    cv.onmouseup = cv.onmouseleave = () => { _curveDrag.keyIdx = -1; };
    cv.oncontextmenu = (e) => {
        e.preventDefault();
        const { px, py } = _curveCoords(cv, e);
        const idx = _findCurveKeyAt(cv, px, py);
        if (idx < 0) return false;
        if (_state.app.attackCurve.length <= 2) {
            alert("Need at least 2 keyframes — can't delete this one.");
            return false;
        }
        _state.app.attackCurve.splice(idx, 1);
        _drawCurve(cv);
        return false;
    };
    cv.ontouchstart = (e) => {
        if (e.touches[0]) {
            const fake = { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY, button: 0 };
            cv.onmousedown(fake);
        }
    };
    cv.ontouchmove = (e) => {
        e.preventDefault();
        if (e.touches[0]) {
            const fake = { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
            cv.onmousemove(fake);
        }
    };
    cv.ontouchend = () => { _curveDrag.keyIdx = -1; };
}

function _curveCoords(cv, evt) {
    const rect = cv.getBoundingClientRect();
    const cssX = evt.clientX - rect.left;
    const cssY = evt.clientY - rect.top;
    const px = (cssX / rect.width);
    const py = 1.5 * (1 - (cssY / rect.height));
    return { px, py };
}

function _findCurveKeyAt(cv, px, py) {
    const c = _state.app.attackCurve;
    for (let i = 0; i < c.length; i++) {
        if (Math.abs(c[i].cd - px) < 0.04 && Math.abs(c[i].intensity - py) < 0.12) return i;
    }
    return -1;
}

function _drawCurve(cv) {
    if (!cv || !_state.app) return;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);

    const W = cv.width, H = cv.height;
    ctx.fillStyle = "#14181d";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
        const x = (i / 10) * W;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let i = 1; i < 6; i++) {
        const y = (i / 6) * H;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // intensity = 1.0 reference line
    const y1 = H - (1.0 / 1.5) * H;
    ctx.strokeStyle = "rgba(74, 142, 218, 0.4)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(W, y1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(74, 142, 218, 0.7)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.fillText("vanilla = 1.0", 4, y1 - 2);

    const curve = _state.app.attackCurve;
    // Filled area
    ctx.fillStyle = "rgba(255, 213, 79, 0.18)";
    ctx.beginPath();
    ctx.moveTo(curve[0].cd * W, H);
    curve.forEach(k => ctx.lineTo(k.cd * W, H - (k.intensity / 1.5) * H));
    ctx.lineTo(curve[curve.length - 1].cd * W, H);
    ctx.closePath();
    ctx.fill();

    // Curve line
    ctx.strokeStyle = "#ffd54f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    curve.forEach((k, i) => {
        const x = k.cd * W;
        const y = H - (k.intensity / 1.5) * H;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Keyframe handles
    curve.forEach((k, i) => {
        const x = k.cd * W;
        const y = H - (k.intensity / 1.5) * H;
        ctx.fillStyle = (i === _curveDrag.keyIdx) ? "#fff" : "#ffd54f";
        ctx.strokeStyle = "#1a1a1a";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });

    // Live cursor (where preview is in cycle)
    if (_state.previewMode === "attacking") {
        const cycle = (_state.previewFrame % 60) / 60;
        const cx = cycle * W;
        ctx.strokeStyle = "rgba(46, 204, 113, 0.8)";
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
        ctx.setLineDash([]);
        const intensity = getAttackIntensity(_state.app, Math.round(100 * (1 - cycle)), 100);
        const cy = H - (Math.min(1.5, intensity) / 1.5) * H;
        ctx.fillStyle = "rgba(46, 204, 113, 1)";
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    // Axis labels
    ctx.fillStyle = "#7e8a9a";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("0%", 4, H - 14);
    ctx.textAlign = "right";
    ctx.fillText("100% cooldown progress →", W - 4, H - 14);
    ctx.textAlign = "left";
    ctx.fillText("intensity ↑", 4, 4);
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function _escape(s) {
    return String(s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Public API ─────────────────────────────────────────────────────────────
return {
    VERSION,
    FACTION_PRESETS,
    POSE_TYPES,
    POSE_TYPES_INFANTRY,
    POSE_TYPES_CAVALRY,
    openPainter,
    closePainter,
    hasAppearance,
    drawAppearanceThumbnail,
    resolveStyleColor,
    getAttackIntensity,
    defaultAppearance,
    _normalize,
    normalizeAppearance: _normalize   // alias used by scenario_troop_editor import pipeline
};

})();

console.log("[ScenarioTroopAppearance] Phase 2 v" + window.ScenarioTroopAppearance.VERSION + " loaded.");