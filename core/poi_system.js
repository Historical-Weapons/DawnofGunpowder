// ============================================================================
// EMPIRE OF THE 13TH CENTURY - POINTS OF INTEREST SYSTEM
// poi_system.js
//
// Enterable, non-walled scenario locations (barracks, storage depots,
// stables, watchtowers, garrison posts, maintenance yards, and any future
// kind) for POINTS OF INTEREST that are NOT full settlements: forts,
// towers, single-purpose outposts, etc.
//
// REPLACES camp_system.js's "custom (non-city) military locations system"
// (the LE / _locTick / _locRender / window.draw-patching block) as the
// thing scenario code registers non-city locations against. That old
// system is NOT deleted — camp_system.js still owns the player-pitched
// encampment feature used in sandbox mode, and its custom-locations block
// is left in place, harmless and simply unused (nothing calls
// registerCustomLocation anymore once a scenario switches over to this
// file). We only reuse two things off it, both already exposed on window:
//   - window.CUSTOM_LOCATION_KINDS[kind].hero(ctx,x,y,col)   → the one big
//     landmark building drawer per kind (barracks hall, warehouse, stable,
//     watchtower, garrison HQ, workshop shed).
//   - window.CUSTOM_LOCATION_KINDS[kind].interior(col)       → populates
//     camp_system's own LE.decos with that kind's surrounding set-dressing
//     (well, noticeboard, log piles, weapon racks, forge, etc.), which we
//     read back via window._CUSTOM_LOC_ENGINE.decos and re-stamp into our
//     own scene. We never call enterCustomLocation/_locTick/_locRender.
//
// WHY THIS EXISTS (vs. the old approach):
// The old system ran an entirely separate mini game-loop (its own canvas,
// its own movement/collision, its own window.draw patch) just to show a
// player standing next to some static "worker" figures. It never got city
// mechanics for free: no walking rice-hat villagers, no ambient/city
// dialogue, no shared collision code — every one of those would've had to
// be reimplemented and kept in sync by hand.
//
// A Point of Interest instead IS a city interior, generated exactly like
// an isVillage=true settlement (generateCity() in city_system.js already
// skips wall/gate construction for villages — that's where "no walls"
// comes from, for free), just parked under its own cache key so it can't
// collide with a same-faction settlement or another POI. Entering one sets
// inCityMode = true and currentActiveCityFaction = <poi key>, so:
//   - calculateMovement() / render (sandboxmode_update.js)  → already
//     branch on inCityMode and read cityDimensions[currentActiveCityFaction]
//     — no new branch needed, see the "else if (inCityMode)" block.
//   - generateCityCosmeticNPCs / drawCityCosmeticNPCs        → walking
//     villagers, rice hats and all, via CIVILIAN_STYLES.
//   - cityDialogueSystem's ambient chat / cityConversationEngine → reads
//     cityCosmeticNPCs[currentActiveCityFaction], so it works untouched.
//   - RTSControls.js's isInCity()/exit()                     → already
//     covers inCityMode, so Press-P-to-exit works with no POI-specific
//     wiring (unlike the old inCustomLocationMode, which needed its own
//     exit() special-case because it never set inCityMode at all).
//
// On top of that generic village interior we stamp the kind-specific
// cosmetics (hero building + props) once, baked into the generated
// bgCanvas, so a "fort" still reads as a fort and not a generic hamlet.
//
// Load AFTER city_system.js (needs generateCity/cityDimensions/etc.) and
// AFTER camp_system.js (needs window.CUSTOM_LOCATION_KINDS/MilitaryProps).
//
// PUBLIC API (mirrors the old custom_locations_system.js shape so scenario
// registration code is a near-drop-in swap):
//   window.registerPointOfInterest(poi)   poi: {id,x,y,kind,name,faction,pop?}
//   window.clearPointsOfInterest()
//   window.getPointsOfInterest()          -> current array
//   window.drawPointOfInterestMarkers(ctx)          (call from overworld render)
//   window.updatePointOfInterestProximity()          (call from overworld update)
//   window.drawPointOfInterestCosmeticOverlay(ctx)   (call from inCityMode render)
//   window.enterPointOfInterest(poi, playerObj)
//   window.leavePointOfInterest(playerObj)           (thin wrapper over leaveCity)
//   window.POI_KINDS
// ============================================================================

(function () {
"use strict";

if (window.PointsOfInterestSystem) {
    console.log("[PointsOfInterestSystem] already initialized — skipping.");
    return;
}
window.PointsOfInterestSystem = { VERSION: "1.0.0" };

// ─── KIND REGISTRY ──────────────────────────────────────────────────────────
// Labels + default population (small — these are hamlets, not towns) per
// kind. The actual hero/interior drawing is borrowed from camp_system.js's
// CUSTOM_LOCATION_KINDS at stamp time (see _stampCosmetics below), so this
// registry doesn't duplicate any drawing code.
const POI_KINDS = {
    barracks:    { label: "Barracks",         markerR: 34, defaultPop: 220 },
    storage:     { label: "Storage Depot",    markerR: 32, defaultPop: 140 },
    stables:     { label: "Stables",          markerR: 30, defaultPop: 160 },
    watchtower:  { label: "Watchtower",       markerR: 24, defaultPop: 90  },
    garrison:    { label: "Garrison Post",    markerR: 36, defaultPop: 240 },
    maintenance: { label: "Maintenance Yard", markerR: 30, defaultPop: 150 },
};
window.POI_KINDS = POI_KINDS;

const ENTER_RADIUS = 46; // overworld px, same convention as the old system

// ─── STATE ──────────────────────────────────────────────────────────────────
let _pois = [];             // live overworld registry: {id,x,y,kind,name,faction,pop}
let _nearestPoi = null;
window.activePOI = null;    // the POI currently entered (null in real cities / overworld)

function _log(msg) {
    if (typeof logEvent === "function") logEvent(msg);
    else console.log("[PointsOfInterest]", msg);
}

function _cl() {
    // The kind registry camp_system.js exposes — hero()/interior() drawers.
    if (!window.CUSTOM_LOCATION_KINDS) {
        console.warn("[PointsOfInterestSystem] window.CUSTOM_LOCATION_KINDS missing — load camp_system.js first.");
        return null;
    }
    return window.CUSTOM_LOCATION_KINDS;
}

function _mp() {
    if (!window.MilitaryProps) {
        console.warn("[PointsOfInterestSystem] window.MilitaryProps missing — load camp_system.js first.");
        return null;
    }
    return window.MilitaryProps;
}

function _factionColor(faction) {
    if (typeof FACTIONS !== "undefined" && faction && FACTIONS[faction]) return FACTIONS[faction].color;
    return "#8b6535";
}

// A POI's cache key MUST be unique per-POI, not per-faction — two POIs
// owned by the same faction (e.g. "Barracks West"/"Barracks East") would
// otherwise both fight over cityDimensions[faction] and cityCosmeticNPCs
// [faction], silently corrupting each other's generated interior (whichever
// one generates second wins, since generateCity() short-circuits on an
// existing cache entry for that key).
function _poiKey(poi) {
    return "POI::" + poi.id;
}

// generateCity()/generateCityCosmeticNPCs() look up villager clothing and
// house architecture by the SAME key used for the cityDimensions cache —
// so a synthetic per-POI key would otherwise fall back to the generic
// "Default" civilian style / "Hong Dynasty" architecture. Alias the
// synthetic key to the POI's real owning faction once, so villagers and
// houses still render in the correct faction's look. Plain object writes —
// safe to do repeatedly, and harmless if called before those tables exist.
function _aliasFactionLook(key, faction) {
    if (typeof CIVILIAN_STYLES !== "undefined") {
        CIVILIAN_STYLES[key] = CIVILIAN_STYLES[faction] || CIVILIAN_STYLES["Default"];
    }
    if (typeof ARCHITECTURE !== "undefined") {
        ARCHITECTURE[key] = ARCHITECTURE[faction] || ARCHITECTURE["Hong Dynasty"];
    }
}

// ─── REGISTRY ───────────────────────────────────────────────────────────────
window.registerPointOfInterest = function (poi) {
    if (!poi || typeof poi.x !== "number" || typeof poi.y !== "number") return null;
    if (!POI_KINDS[poi.kind]) {
        console.warn("[PointsOfInterestSystem] unknown kind:", poi.kind);
        return null;
    }
    const entry = {
        id:      poi.id || ("poi_" + Math.random().toString(36).slice(2, 9)),
        x:       poi.x,
        y:       poi.y,
        kind:    poi.kind,
        name:    poi.name || POI_KINDS[poi.kind].label,
        faction: poi.faction || "Player",
        pop:     poi.pop || POI_KINDS[poi.kind].defaultPop,
    };
    _pois.push(entry);
    return entry;
};
window.clearPointsOfInterest = function () { _pois = []; };
window.getPointsOfInterest   = function () { return _pois; };

// ─── COSMETIC STAMPING ──────────────────────────────────────────────────────
// Bakes the kind's hero building + static props onto the freshly generated
// bgCanvas, at the same plaza-center point enterPointOfInterest() spawns
// the player at, and hardens that footprint as solid collision. Dynamic
// bits (forge glow/smoke, fire flicker) are NOT baked — they're redrawn
// live each frame by drawPointOfInterestCosmeticOverlay().
const _liveDecos = {}; // poiKey -> [{x,y,kind,tall?}] (world px, "fire" entries only)

function _drawDeco(ctx, d, col) {
    const mp = _mp();
    if (!mp) return;
    switch (d.kind) {
        case "barrel":       mp.drawBarrel(ctx, d.x, d.y); break;
        case "crate":        mp.drawCrate(ctx, d.x, d.y); break;
        case "weapon":       mp.drawWeaponRack(ctx, d.x, d.y, col); break;
        case "log":          mp.drawLogSeat(ctx, d.x, d.y); break;
        case "well":         mp.drawWell(ctx, d.x, d.y); break;
        case "dummy":        mp.drawTrainingDummy(ctx, d.x, d.y); break;
        case "horse":        mp.drawHorseTether(ctx, d.x, d.y); break;
        case "wagon":        mp.drawSupplyWagon(ctx, d.x, d.y, col); break;
        case "noticeboard":  mp.drawNoticeBoard(ctx, d.x, d.y); break;
        case "table":        mp.drawOfficerTable(ctx, d.x, d.y, col); break;
        case "garrisontent": mp.drawGarrisonTent(ctx, d.x, d.y, col); break;
        case "flagpole":     mp.drawFlagpole(ctx, d.x, d.y, col, !!d.tall); break;
        // These four aren't exposed on window.MilitaryProps by camp_system.js
        // (they're private helpers used only by its own interior renderer),
        // so they're ported here verbatim rather than left out.
        case "hay":          _drawHayBale(ctx, d.x, d.y); break;
        case "fence-h":      _drawPaddockFence(ctx, d.x - 40, d.y, d.x + 40, d.y); break;
        case "toolrack":     _drawToolRack(ctx, d.x, d.y); break;
        case "woodpile":     _drawWoodpile(ctx, d.x, d.y); break;
        // "hero" is drawn separately (see _stampCosmetics) — bigger, and
        // needs the real hero() drawer, not this switch.
        // "fire" is intentionally skipped here — drawn live, see below.
    }
}

// ── Ported verbatim from camp_system.js's custom-locations block (not
// exposed on window there — see comment on _drawDeco above). ──
function _drawHayBale(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(1, 3, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#c9a832";
    ctx.beginPath(); ctx.ellipse(0, -2, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#8a6d1a"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-9, -2); ctx.lineTo(9, -2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(-6, 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, -8); ctx.lineTo(6, 4); ctx.stroke();
    ctx.restore();
}
function _drawPaddockFence(ctx, x1, y1, x2, y2) {
    ctx.save();
    ctx.strokeStyle = "#5d4028"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x1, y1 - 8); ctx.lineTo(x2, y2 - 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, y1 - 2); ctx.lineTo(x2, y2 - 2); ctx.stroke();
    const segs = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 24));
    for (let i = 0; i <= segs; i++) {
        const px = x1 + (x2 - x1) * (i / segs), py = y1 + (y2 - y1) * (i / segs);
        ctx.strokeStyle = "#4e3520"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(px, py - 12); ctx.lineTo(px, py + 2); ctx.stroke();
    }
    ctx.restore();
}
function _drawToolRack(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = "#4e3518"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-12, -20); ctx.lineTo(12, -20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-12, -20); ctx.lineTo(-12, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(12, -20); ctx.lineTo(12, 0); ctx.stroke();
    const tools = [
        { x: -8, col: "#9e9e9e", h: 16 }, { x: -2, col: "#7a5a2a", h: 14 },
        { x: 4,  col: "#9e9e9e", h: 18 }, { x: 9,  col: "#5a5a52", h: 12 },
    ];
    tools.forEach((tl) => {
        ctx.strokeStyle = "#6b4c24"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(tl.x, -20); ctx.lineTo(tl.x, -20 + tl.h); ctx.stroke();
        ctx.fillStyle = tl.col; ctx.beginPath(); ctx.arc(tl.x, -20 + tl.h, 1.6, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
}
function _drawWoodpile(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(1, 3, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
    for (let row = 0; row < 3; row++) {
        for (let i = -2; i <= 2; i++) {
            ctx.fillStyle = row % 2 === 0 ? "#6b4c28" : "#5a3f20";
            ctx.beginPath(); ctx.ellipse(i * 4, -row * 4, 3, 3, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#3e2a18"; ctx.lineWidth = 0.5; ctx.stroke();
        }
    }
    ctx.restore();
}

function _stampCosmetics(key, poi) {
    const cl = _cl();
    const mp = _mp();
    const cd = cityDimensions[key];
    if (!cl || !mp || !cd || !cd.bgCanvas) return;

    const meta = cl[poi.kind];
    if (!meta) return;
    const col = _factionColor(poi.faction);

    // Same plaza-center point enterPointOfInterest() spawns the player at.
    const centerX = Math.floor(CITY_COLS / 2) * CITY_TILE_SIZE;
    const centerY = Math.floor(CITY_LOGICAL_ROWS / 2) * CITY_TILE_SIZE;

    // Run camp_system's own interior layout function for this kind — it
    // populates ITS OWN LE.decos (local space, centered on its own
    // LOC_CX/LOC_CY = 500,460), which we then read back and re-center on
    // our plaza point instead. This is genuine reuse of the existing
    // per-kind set-dressing lists, not a re-authored copy of them.
    meta.interior(col);
    const engine = window._CUSTOM_LOC_ENGINE;
    const srcDecos = (engine && Array.isArray(engine.decos)) ? engine.decos : [];
    const LOC_CX = 500, LOC_CY = 460; // camp_system.js's local interior origin

    const ctx = cd.bgCanvas.getContext("2d");
    const liveFire = [];

    // Fire rings are baked as rings but flames drawn live — same split
    // camp_system.js uses for its own interior.
    srcDecos.forEach((d) => {
        if (d.kind === "fire") mp.drawFireRing(ctx, centerX + (d.x - LOC_CX), centerY + (d.y - LOC_CY));
    });

    // Everything else, sorted by Y for correct overlap, offset onto our
    // plaza center instead of camp_system's LOC_CX/LOC_CY.
    [...srcDecos]
        .filter((d) => d.kind !== "hero" && d.kind !== "fire")
        .sort((a, b) => a.y - b.y)
        .forEach((d) => {
            const wx = centerX + (d.x - LOC_CX);
            const wy = centerY + (d.y - LOC_CY);
            _drawDeco(ctx, { ...d, x: wx, y: wy }, col);
        });

    // The hero building itself — drawn last so it sits on top, and larger/
    // closer to center than the scattered props.
    meta.hero(ctx, centerX, centerY - 10, col);

    // Live fire positions (for the per-frame overlay), remembered in world
    // (plaza-relative) coordinates.
    srcDecos.forEach((d) => {
        if (d.kind === "fire") liveFire.push({ x: centerX + (d.x - LOC_CX), y: centerY + (d.y - LOC_CY) });
    });
    _liveDecos[key] = liveFire;

    // Harden the hero building's footprint as solid collision (grid value
    // 2 = Building, same convention generateCity() itself uses) so the
    // player can't walk through the fort/blacksmith/etc. Whatever the
    // village generator happened to place there is simply painted over —
    // the visual already covers it.
    const grid = cd.grid;
    const halfW = 6, halfH = 5; // tiles, ~ hero building's drawn footprint
    const gx = Math.floor(centerX / CITY_TILE_SIZE), gy = Math.floor(centerY / CITY_TILE_SIZE);
    for (let ix = gx - halfW; ix <= gx + halfW; ix++) {
        for (let iy = gy - halfH; iy <= gy + halfH; iy++) {
            if (grid[ix] && grid[ix][iy] !== undefined) grid[ix][iy] = 2;
        }
    }
    // Kind label plaque, since these aren't real settlements with a proper
    // city-panel header.
    ctx.save();
    ctx.font = "bold 12px Georgia"; ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(centerX - 70, centerY - 105, 140, 20);
    ctx.fillStyle = "#f5d76e"; ctx.fillText(meta.label || POI_KINDS[poi.kind].label, centerX, centerY - 90);
    ctx.restore();
}

// Live overlay: forge glow/smoke, fire flicker — anything the baked
// bgCanvas can't show because it animates with Date.now()/performance.now().
window.drawPointOfInterestCosmeticOverlay = function (ctx) {
    if (!window.activePOI) return;
    const mp = _mp();
    if (!mp) return;
    const key = _poiKey(window.activePOI);
    const fires = _liveDecos[key];
    if (fires) fires.forEach((f) => mp.drawAnimatedFire(ctx, f.x, f.y));
    // Forge glow/smoke (maintenance yards) is baked into the hero building
    // drawer itself (_drawWorkshopShed → _drawForge with withChimney=true)
    // and camp_system's _drawForge already reads Date.now() live each call
    // — but the hero building is baked once onto bgCanvas, so it doesn't
    // animate. Re-invoke just the hero drawer here, live, on top of the
    // baked copy, for kinds whose hero building has motion in it.
    if (window.activePOI.kind === "maintenance") {
        const cl = _cl();
        const meta = cl && cl["maintenance"];
        if (meta) {
            const centerX = Math.floor(CITY_COLS / 2) * CITY_TILE_SIZE;
            const centerY = Math.floor(CITY_LOGICAL_ROWS / 2) * CITY_TILE_SIZE;
            meta.hero(ctx, centerX, centerY - 10, _factionColor(window.activePOI.faction));
        }
    }
};

// ─── ENTER / LEAVE ──────────────────────────────────────────────────────────
window.enterPointOfInterest = function (poi, playerObj) {
    if (!poi || !playerObj) return;
    if (typeof inBattleMode !== "undefined" && inBattleMode) return;
    if (typeof inCityMode !== "undefined" && inCityMode) return;
    if (typeof window.inCampMode !== "undefined" && window.inCampMode) return;
    if (window.NavalEscortMode && window.NavalEscortMode.isActive()) return;

    const key = _poiKey(poi);
    _aliasFactionLook(key, poi.faction);

    // Flush a stale cache entry the same way enterCity() does when a real
    // city's type/pop drifts — belt and braces, since POIs are static here
    // but scenario reloads shouldn't ever show a half-generated interior.
    if (!cityDimensions[key]) {
        generateCity(key, true, poi.pop); // isVillage=true → no walls, generateCity()'s own mechanism
        _stampCosmetics(key, poi);
    }
    if (!cityDimensions[key]) return; // generation failed — bail safely

    closeParleUI();
    const cityPanel = document.getElementById('city-panel');
    if (cityPanel) cityPanel.style.display = 'none';
    const parlePanel = document.getElementById('parle-panel');
    if (parlePanel) parlePanel.style.display = 'none';

    // FIX: was writing to window.__poiSavedWorldX/__poiSavedWorldY, which
    // nothing ever reads. leavePointOfInterest() delegates to leaveCity(),
    // and leaveCity() restores position from savedWorldPlayerState (see
    // city_system.js) — the same variable enterCity() writes to on the city
    // path. POI entry never wrote to it, so it stayed at its untouched
    // default of {x: 0, y: 0}, and every POI exit restored to that default —
    // the (0,0) teleport. Writing to savedWorldPlayerState directly here
    // mirrors enterCity()'s own save line exactly.
    savedWorldPlayerState.x = playerObj.x;
    savedWorldPlayerState.y = playerObj.y;

    inCityMode = true;
    currentActiveCityFaction = key;
    window.activePOI = poi;

    if (typeof AudioManager !== 'undefined') AudioManager.playMusic("City_Ambient");

    // Spawn the player at the same plaza point the cosmetics were stamped
    // around, just south of the hero building.
    const centerX = Math.floor(CITY_COLS / 2) * CITY_TILE_SIZE;
    const centerY = Math.floor(CITY_LOGICAL_ROWS / 2) * CITY_TILE_SIZE;
    playerObj.x = centerX;
    playerObj.y = centerY + 90;

    _hideEnterPrompt();
    if (typeof triggerEpicZoom === 'function') triggerEpicZoom(0.3, 1.2, 1200);

    _log(`Entered ${poi.name} (${POI_KINDS[poi.kind].label}).`);
};

window.leavePointOfInterest = function (playerObj) {
    // leaveCity() is generic — it doesn't hardcode anything settlement-
    // specific (resets inCityMode/currentActiveCityFaction, closes panels,
    // resets gates [empty for a POI, so a harmless no-op forEach], restores
    // player position, stops speech). Reused as-is rather than duplicated.
    if (typeof leaveCity === 'function') leaveCity(playerObj);
    window.activePOI = null;
};

// ─── OVERWORLD EXTERIOR MARKERS ─────────────────────────────────────────────
window.drawPointOfInterestMarkers = function (ctx) {
    const cl = _cl();
    if (!cl) return;
    _pois.forEach((poi) => {
        const meta = cl[poi.kind];
        const kindInfo = POI_KINDS[poi.kind];
        if (!meta || !kindInfo) return;
        const col = _factionColor(poi.faction);
        meta.hero(ctx, poi.x, poi.y, col);
        ctx.save();
        ctx.font = "bold 8px Georgia"; ctx.textAlign = "center";
        ctx.fillStyle = "#000"; ctx.globalAlpha = 0.5;
        ctx.fillText(poi.name, poi.x + 1, poi.y - kindInfo.markerR - 7);
        ctx.globalAlpha = 1; ctx.fillStyle = "#f5e8c8";
        ctx.fillText(poi.name, poi.x, poi.y - kindInfo.markerR - 8);
        ctx.restore();
    });
};

// ─── OVERWORLD PROXIMITY + ENTER PROMPT ─────────────────────────────────────
function _findPoiNear(px, py) {
    let best = null, bestD = Infinity;
    _pois.forEach((poi) => {
        const kindInfo = POI_KINDS[poi.kind];
        if (!kindInfo) return;
        const d = Math.hypot(px - poi.x, py - poi.y);
        const r = kindInfo.markerR + ENTER_RADIUS;
        if (d < r && d < bestD) { bestD = d; best = poi; }
    });
    return best;
}

window.updatePointOfInterestProximity = function () {
    if (typeof inCityMode !== "undefined" && inCityMode) { _hideEnterPrompt(); return; }
    if (typeof inBattleMode !== "undefined" && inBattleMode) { _hideEnterPrompt(); return; }
    if (typeof window.inCampMode !== "undefined" && window.inCampMode) { _hideEnterPrompt(); return; }
    if (typeof player === "undefined") return;

    const found = _findPoiNear(player.x, player.y);
    if (found !== _nearestPoi) {
        _nearestPoi = found;
        if (found) _showEnterPrompt(found); else _hideEnterPrompt();
    }
};

// ─── LIGHTWEIGHT ENTER PROMPT UI ────────────────────────────────────────────
// Deliberately its own DOM element rather than reusing camp_system's
// #cl-enter-wrapper/#cl-enter-btn — that system is still loaded (and its
// own _init() still builds that UI on DOMContentLoaded even with zero
// registered locations), so grabbing the same nodes would mean two systems
// fighting over ownership of one button for no benefit.
function _buildPromptUI() {
    if (document.getElementById("poi-enter-wrapper")) return;
    const wrap = document.createElement("div");
    wrap.id = "poi-enter-wrapper";
    wrap.style.cssText = "position:fixed;bottom:24px;left:16px;z-index:15;display:none;flex-direction:column;align-items:flex-start;gap:6px;pointer-events:auto;";
    const btn = document.createElement("button");
    btn.id = "poi-enter-btn";
    btn.className = "menu-btn";
    btn.style.cssText = "min-height:48px;min-width:150px;font-size:1rem;padding:10px 18px;touch-action:manipulation;";
    btn.onclick = () => { if (_nearestPoi && typeof player !== "undefined") window.enterPointOfInterest(_nearestPoi, player); };
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
}
function _showEnterPrompt(poi) {
    const wrap = document.getElementById("poi-enter-wrapper");
    const btn  = document.getElementById("poi-enter-btn");
    if (!wrap || !btn) return;
    const kindInfo = POI_KINDS[poi.kind];
    btn.innerHTML = "🚪 Enter " + (kindInfo ? kindInfo.label : poi.name);
    wrap.style.display = "flex";
}
function _hideEnterPrompt() {
    const wrap = document.getElementById("poi-enter-wrapper");
    if (wrap) wrap.style.display = "none";
}

// ─── INIT ────────────────────────────────────────────────────────────────────
function _init() {
    _buildPromptUI();
    console.log("[PointsOfInterestSystem] Initialized — " + Object.keys(POI_KINDS).length + " POI kinds loaded.");
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(_init, 850));
} else {
    setTimeout(_init, 850);
}

})(); // end IIFE