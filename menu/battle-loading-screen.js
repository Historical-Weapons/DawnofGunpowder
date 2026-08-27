// ============================================================================
// BATTLE LOADING SCREEN + PRE-DEPLOYMENT  —  battle-loading-screen.js  v4.3.0
// ============================================================================
//
// v4.4.0 FIX — ROOT-CAUSE CANVAS BLOCK:
//   The real problem was that draw() rendered the battlefield to the canvas
//   every rAF frame even while the loading screen div was visible.  The BLS
//   overlay is a DOM div; the canvas is a separate GPU layer.  On the first
//   few frames — and whenever the browser composites layers independently —
//   the raw battlefield map was visible underneath or through the overlay.
//   _installDrawPatch now short-circuits: when __battleLoadingActive is true
//   it black-fills the canvas and returns immediately, so zero battlefield
//   pixels ever reach the screen before the loading screen is dismissed.
//   This applies to both launch paths: launchCustomBattle (custom_battle_gui)
//   and executeAttackAction (parler_system / "Lead Troops" button).
//
//   Additionally: the manual black-cover div in parler_system.js (the
//   __parle_black_cover hack) is now unnecessary — it is left in place as a
//   belt-and-suspenders guard but can be removed at any time.
//
// v4.3.0 FIXES:
//   1. NO BLACK SCREEN BEFORE TEXT:
//      The wrap div now has background:#0a0804 set inline so the dark
//      background is painted the instant display:flex is set — before the
//      async _loadBgWithFallback resolves.  Previously the div had no
//      background, so it was transparent over the game canvas (black) until
//      the image arrived, causing a full-black flash with no text visible.
//      The fix applies to ALL entry points: campaign land/siege/naval and
//      all three custom launchers (launchCustomBattle, launchCustomNavalBattle,
//      launchCustomSiege) because they all share the same _screen div.
//
//   2. NO ARTIFICIAL TIMER:
//      _runLoadingGate() no longer uses a fixed LOAD_MIN_MS delay (was 2500ms).
//      It now polls every 80 ms for _battleIsReady() — true when
//      battleEnvironment.units has at least one unit on each side.
//      The progress bar advances proportionally to elapsed/4000ms while
//      waiting, then jumps to 100% the moment ready.  A 600ms minimum-
//      visible time prevents an invisible flash on fast machines.
//      A 4-second safety cap forces proceed if something goes wrong.
//      LOAD_MIN_MS is kept in CFG for external callers but is no longer used.
//
// v4.2.1 FIX (unchanged):
//   Replaced the sequential png→jpg→jpeg fallback chain in _loadBgWithFallback
//   with a static BG_EXT_MAP lookup.  The old chain worked correctly but caused
//   the browser to unconditionally log a 404 console error for every "wrong"
//   extension it tried before finding the real file — e.g. trying 4.png before
//   discovering 4.jpg existed.  BG_EXT_MAP resolves the right URL in one shot,
//   eliminating all spurious "Failed to load resource" noise.
//   To add new backgrounds: extend BG_EXT_MAP and bump MAX_BG_INDEX in CFG.
//
// v4.2 FIXES OVER v4.1:
//   1. ALLIES NO LONGER CHARGE IMMEDIATELY:
//      Closed the ~520ms charge window between loading-end and pre-deploy
//      activation.  Pre-deploy state + hold_position lockdown now applies
//      BEFORE the loading screen begins its fade-out, so no normal update
//      tick can fire with units still set to seek_engage.
//      Also strips u.selected = false on player units so even if lazy general
//      is somehow running, it has no units to grab.
//   2. COMMANDER CLAMPED TO DEPLOY ZONE:
//      sandboxmode_update.js now clamps player.x/y to __playerDeployZone
//      immediately after calculateMovement during pre-deploy. Commander can
//      no longer wander outside the green rectangle.
//   3. IDLE WANDER (FIDGETING):
//      During pre-deploy, units gently shuffle around inside the deploy zone
//      every ~2.2s — a small random nudge to ~12% of eligible units, looks
//      like soldiers shifting weight and chatting.  The moment the player
//      issues an order via right-click-drag, those units snap to attention
//      and obey.  Wander stops entirely on COMMENCE BATTLE.
//
// v4.1 STRATEGY (UNCHANGED):
//   The v4.0 approach of REPLACING updateBattleUnits with a custom stub during
//   pre-deploy was the root cause of "legs animating but units frozen in place".
//   The stub had multiple problems:
//     • TDZ crash from using `units` before const declaration (silently swallowed)
//     • Never received orderTargetPoint set by executeBoxFormationMove
//     • Duplicated movement code without collision/water/animation handling
//     • Fighting processTacticalOrders' hold_position anchor logic
//
//   v4.1 lets the REAL updateBattleUnits run during pre-deploy. Constraint &
//   freeze logic lives inline in battlefield_logic.js inside the unit forEach
//   loop, gated on window.__preDeploymentActive:
//     • ENEMY units → instant freeze (vx=vy=0, state=idle, target=null, skip loop)
//     • PLAYER COMMANDER → normal handlePlayerOverride
//     • PLAYER NON-COMMANDER → normal AI/movement (so right-click moves work!),
//       then position clamped to window.__playerDeployZone after processAction.
//   Player units start pre-deploy in hold_position with no target, so they stand
//   still until the player drag-boxes a move order via executeBoxFormationMove.
//   That sets orderType="move_to_point" + orderTargetPoint, and the real
//   processAction's _handleMovement walks them there — same code that runs in
//   normal battle.
//
// v4.0 COSMETICS (UNCHANGED):
//   1. Total-War-Rome-2 loading screen layout
//      • Cinematic background image (art/battlebackground/N.png|jpg|jpeg, N=1-12) + vignette
//      • Decorative gold top + bottom bars
//      • Enemy header + unit cards across the TOP
//      • Battle title (⚔ + name + terrain) in the CENTER
//      • Player header + unit cards across the BOTTOM
//      • Faction emblems, faction colors, troop counts
//      • Shimmer progress bar with percentage + rotating status messages
//      • drawTroopCardToCanvas() integration for proper card rendering
//
//   2. ENEMY FORMATION at pre-deploy start (one-time, based on player comp).
//   3. DEPLOY ZONES (land 25%, river 25%, siege 18%, naval=ship deck).
//   4. RTS BAR STAYS VISIBLE — small floating HUD at TOP-RIGHT, not full-width.
//   5. AUTO-ATTACK + LAZY GENERAL disabled during pre-deploy.
//   6. ALL entry points wrapped: enterBattlefield (campaign land+naval),
//      enterSiegeBattlefield (campaign siege), launchCustomBattle,
//      launchCustomNavalBattle, launchCustomSiege.
//
// LOAD ORDER (unchanged):
//   <script src="core/battle-loading-screen.js"></script>
// ============================================================================

(function () {
"use strict";

if (window.__battleLoadingScreenInstalled) return;
window.__battleLoadingScreenInstalled = true;

// ── Config ──────────────────────────────────────────────────────────────────
const CFG = {
    LOAD_MIN_MS:    2500,
    PROGRESS_TICKS: 50,
    MAX_BG_INDEX:   12,
    BG_EXTS:        [".png", ".jpg", ".jpeg"],
    BG_PATH:        "art/battlebackground/",
    BG_DARKEN:      0.62,
    CARD_MAX:       12,
    CARD_W:         82,
    CARD_H:         110,

    PLAYER_DEPLOY_FRAC:       0.25,   // land + river — UNUSED now that DEPLOY_ZONE_SIZE drives the square, kept for any external reader
    PLAYER_DEPLOY_FRAC_SIEGE: 0.18,   // siege — UNUSED, see above
    ENEMY_DEPLOY_FRAC:        0.30,   // UNUSED, see above
    DEPLOY_ZONE_SIZE:         400,    // land/river/siege deploy zone is a DEPLOY_ZONE_SIZE x DEPLOY_ZONE_SIZE square centered on the side's spawn anchor

    COMMENCE_ZOOM_START:      0.85,
    COMMENCE_ZOOM_END:        1.40,
    COMMENCE_ZOOM_MS:         1500
};

// ── State ───────────────────────────────────────────────────────────────────
window.__battleLoadingActive  = false;
window.__preDeploymentActive  = false;
window.__battleCullingEnabled = false;
window.__playerDeployZone     = null;
window.__enemyDeployZone      = null;
window.__chosenEnemyFormation = null;

// Stores the custom-battle player roster passed via pendingPlayerOverride so
// _refreshLoadingScreenData can use it as the authoritative source rather than
// falling back to battleEnvironment.units (which may carry stale/wrong unitType
// during the brief window between the first card render and the refresh tick).
let _lastPendingPlayer = null;

// ── FIX: STABLE SCOUT REVEAL ────────────────────────────────────────────────
// _scoutRoster()/_scoutCount() are randomized (random shuffle + random reveal
// fraction / ±10% count noise) to simulate scouts only partially identifying
// the enemy force. _refreshLoadingScreenData() calls them on EVERY 80ms gate
// tick though, so a fresh random subset/order/count was being rolled ~12x/sec
// — cards appearing, disappearing, and reordering every tick. That's the
// "barely show up while flickering" enemy-side symptom (the player side has
// no scouting fog, so it was never affected). Fix: roll the reveal ONCE per
// loading screen and cache it; every subsequent tick reuses the same result
// until the screen is reset for the next battle.
let _scoutRevealCache = null; // { rosterKey, roster, count }
function _resetScoutReveal() { _scoutRevealCache = null; }

// ── Terrain labels ──────────────────────────────────────────────────────────
const TERRAIN_LABELS = {
    "Plains": "Open Plains",  "Forest": "Forested Hills",
    "Dense Forest": "Dense Forest", "Steppe": "Open Steppe",
    "Desert": "Desert Sands", "Dunes": "Sand Dunes",
    "River": "River Crossing","Mountain": "Mountain Pass",
    "Large Mountains": "High Mountains", "Highlands": "Highlands",
    "Coastal": "Coastal Shore", "Ocean": "At Sea"
};
function terrainLabel(name) {
    if (window.inSiegeBattle) return "Siege Assault";
    if (window.inNavalBattle) return "Naval Engagement";
    if (window.inRiverBattle) return "River Crossing";
    if (!name) return "";
    for (const k in TERRAIN_LABELS) if (name.includes(k)) return TERRAIN_LABELS[k];
    return name;
}

// ── Roster condenser ────────────────────────────────────────────────────────
function condenseRoster(roster, max) {
    if (!roster || !roster.length) return [];
    const counts = {};
    roster.forEach(u => {
        // 🔴 FIX: Allow raw strings so it doesn't break into "Unknown" -> Militia
        const t = typeof u === "string" ? u : (u.type || u.name || u.unitType || "Unknown");
        counts[t] = (counts[t] || 0) + 1;
    });
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, max)
        .map(([type, count]) => ({ type, count }));
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function findNearestCity(npc) {
    const list = window.cities || window.worldCities || [];
    if (!list.length || !npc) return null;
    let best = null, bd = Infinity;
    list.forEach(c => {
        const d = Math.pow((c.x||0)-(npc.x||0),2) + Math.pow((c.y||0)-(npc.y||0),2);
        if (d < bd) { bd = d; best = c; }
    });
    return best;
}

function factionColor(name) {
    const F = window.FACTIONS;
    if (F && F[name] && F[name].color) return F[name].color;
    if (typeof window.factionColors === "object" && name && window.factionColors[name])
        return window.factionColors[name];
    return null;
}

function pickBgIndex() {
    return Math.floor(Math.random() * CFG.MAX_BG_INDEX) + 1;
}

// ── Static extension map ─────────────────────────────────────────────────────
// Maps each background index to its actual file extension.
// Using a direct lookup avoids the browser logging 404 errors for the
// "wrong" extensions that the old sequential-fallback chain would try first.
// BG_EXTS is kept in CFG for any external callers but is no longer used here.
// UPDATE THIS MAP whenever you add, remove, or rename files in BG_PATH.
const BG_EXT_MAP = {
     1: ".jpg",
     2: ".png",
     3: ".png",
     4: ".jpg",
     5: ".jpg",
     6: ".jpg",
     7: ".jpg",
     8: ".png",
     9: ".png",
    10: ".png",
    11: ".png",
    12: ".png"
};

// Resolve the correct URL in one shot (no intermediate 404 requests).
// Falls back to 1.jpg only if the mapped URL genuinely fails to load.
function _loadBgWithFallback(index, cb) {
    const ext = BG_EXT_MAP[index] || ".png";
    const url = CFG.BG_PATH + index + ext;
    const img = new Image();
    img.onload  = () => cb(url);
    img.onerror = () => {
        // BG_EXT_MAP is out of sync with disk — warn and use safe fallback.
        console.warn("[BLS] bg load failed for", url,
            "— update BG_EXT_MAP in battle-loading-screen.js");
        cb(CFG.BG_PATH + "1.jpg");
    };
    img.src = url;
}

function _safeNumber(v, fallback) {
    return (typeof v === "number" && !isNaN(v)) ? v : fallback;
}

function _makeEl(tag, styles, text) {
    const e = document.createElement(tag);
    if (styles) Object.assign(e.style, styles);
    if (text !== undefined) e.textContent = text;
    return e;
}

const DEPLOY_MSGS = [
    "Compiling unit AI…",
    "Resolving asset dependencies…",
    "Seeding terrain RNG…",
    "Sculpting battlefield terrain…",
    "Patching entity transforms…",
    "Allocating draw buffers…",
    "Hydrating formation data…",
    "Registering event listeners…",
    "Awaiting render frame…"
];

// ============================================================================
//  LOADING SCREEN  —  Full Total War Rome 2 layout
// ============================================================================
let _screen = null;
let _bgImg, _titleEl, _subEl;
let _enemyCardsRow, _playerCardsRow;
let _progressFill, _progressPct, _statusEl;
let _progressInterval = null;

function _buildScreen() {
    if (document.getElementById("bls-wrap")) return;

    const wrap = document.createElement("div");
    wrap.id = "bls-wrap";
    Object.assign(wrap.style, {
        position:      "fixed",
        inset:         "0",
        display:       "none",
        flexDirection: "column",
        zIndex:        "19999",
        overflow:      "hidden",
        touchAction:   "none",
        userSelect:    "none",
        fontFamily:    "'Cinzel', 'Georgia', 'Times New Roman', serif",
        // FIX: Solid fallback so text is readable the instant the screen
        // appears, before the async background image finishes loading.
        // Without this the div is transparent → black flash until bg arrives.
        background:    "#0a0804"
    });

    // ── Background image layer ─────────────────────────────────────────
    _bgImg = document.createElement("div");
    Object.assign(_bgImg.style, {
        position:           "absolute",
        inset:              "0",
        backgroundSize:     "cover",
        backgroundPosition: "center",
        backgroundRepeat:   "no-repeat",
        filter:             "brightness(0.45) saturate(0.7)",
        transition:         "opacity 0.6s ease",
        zIndex:             "0"
    });
    wrap.appendChild(_bgImg);

    // ── Vignette overlay ────────────────────────────────────────────────
    const vig = _makeEl("div", {
        position:      "absolute",
        inset:         "0",
        background:    "radial-gradient(ellipse at center, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.82) 100%)",
        zIndex:        "1",
        pointerEvents: "none"
    });
    wrap.appendChild(vig);

    // ── Decorative gold bars (top + bottom) ─────────────────────────────
    const topBar = _makeEl("div", {
        position:   "absolute", top: "0", left: "0", right: "0",
        height:     "3px",
        background: "linear-gradient(90deg, transparent, #c8a84b, #f5d76e, #c8a84b, transparent)",
        zIndex:     "3"
    });
    wrap.appendChild(topBar);
    const botBar = _makeEl("div", {
        position:   "absolute", bottom: "0", left: "0", right: "0",
        height:     "3px",
        background: "linear-gradient(90deg, transparent, #c8a84b, #f5d76e, #c8a84b, transparent)",
        zIndex:     "3"
    });
    wrap.appendChild(botBar);

    // ── Main flex column layout ─────────────────────────────────────────
    const layout = _makeEl("div", {
        position:       "absolute",
        inset:          "0",
        zIndex:         "2",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "stretch",
        justifyContent: "space-between",
        padding:        "clamp(12px, 3vh, 28px) clamp(12px, 2vw, 32px)",
        boxSizing:      "border-box"
    });

    // ── TOP: Enemy header + cards ───────────────────────────────────────
    const topSection = _makeEl("div", {
        display: "flex", flexDirection: "column",
        alignItems: "center", gap: "8px"
    });

    const enemyHeader = _makeEl("div", {
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: "clamp(6px, 1.5vw, 14px)"
    });
    const enemyInfo = _makeEl("div", { textAlign: "center" });
    const enemyFacName = _makeEl("div", {
        fontSize:      "clamp(0.85rem, 2.5vw, 1.3rem)",
        fontWeight:    "700",
        letterSpacing: "clamp(2px, 0.5vw, 5px)",
        textTransform: "uppercase",
        color:         "#ff7070",
        textShadow:    "0 0 16px rgba(255,80,80,0.5), 0 2px 4px rgba(0,0,0,0.9)"
    }, "ENEMY FORCES");
    enemyFacName.id = "bls-enemy-name";
    const enemyCount = _makeEl("div", {
        fontSize:      "clamp(0.62rem, 1.5vw, 0.8rem)",
        color:         "rgba(255,180,180,0.7)",
        letterSpacing: "1px",
        marginTop:     "2px"
    });
    enemyCount.id = "bls-enemy-count";
    enemyInfo.appendChild(enemyFacName);
    enemyInfo.appendChild(enemyCount);
    enemyHeader.appendChild(enemyInfo);
    topSection.appendChild(enemyHeader);

    _enemyCardsRow = _makeEl("div", {
        display:        "flex", flexWrap: "wrap",
        justifyContent: "center",
        gap:            "clamp(4px, 0.8vw, 8px)",
        maxWidth:       "100%"
    });
    _enemyCardsRow.id = "bls-enemy-cards";
    topSection.appendChild(_enemyCardsRow);
    layout.appendChild(topSection);

    // ── CENTER: Crossed swords + battle title + terrain ─────────────────
    const centerSection = _makeEl("div", {
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        gap:            "clamp(4px, 1.5vh, 12px)",
        padding:        "0 16px",
        textAlign:      "center"
    });
    const swordsRow = _makeEl("div", {
        fontSize:      "clamp(1.2rem, 3vw, 2rem)",
        opacity:       "0.6",
        letterSpacing: "clamp(8px, 2vw, 20px)",
        color:         "#c8a84b"
    });
    swordsRow.innerHTML = "⚔";

    _titleEl = _makeEl("div", {
        fontSize:      "clamp(1.4rem, 4.5vw, 2.8rem)",
        fontWeight:    "700",
        color:         "#f5d76e",
        letterSpacing: "clamp(3px, 1vw, 8px)",
        textTransform: "uppercase",
        textShadow:    "0 0 30px rgba(245,215,110,0.4), 0 3px 8px rgba(0,0,0,0.95)",
        lineHeight:    "1.2"
    }, "LOADING BATTLE");

    _subEl = _makeEl("div", {
        fontSize:      "clamp(0.65rem, 1.8vw, 0.95rem)",
        color:         "rgba(200,180,120,0.75)",
        letterSpacing: "clamp(2px, 0.6vw, 5px)",
        textTransform: "uppercase",
        marginTop:     "2px"
    }, "");

    centerSection.appendChild(swordsRow);
    centerSection.appendChild(_titleEl);
    centerSection.appendChild(_subEl);
    layout.appendChild(centerSection);

    // ── BOTTOM: Player cards + header + progress ────────────────────────
    const botSection = _makeEl("div", {
        display: "flex", flexDirection: "column",
        alignItems: "center", gap: "8px"
    });

    _playerCardsRow = _makeEl("div", {
        display:        "flex", flexWrap: "wrap",
        justifyContent: "center",
        gap:            "clamp(4px, 0.8vw, 8px)",
        maxWidth:       "100%"
    });
    _playerCardsRow.id = "bls-player-cards";
    botSection.appendChild(_playerCardsRow);

    const playerHeader = _makeEl("div", {
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: "clamp(6px, 1.5vw, 14px)", marginTop: "4px"
    });
    const playerInfo = _makeEl("div", { textAlign: "center" });
    const playerFacName = _makeEl("div", {
        fontSize:      "clamp(0.85rem, 2.5vw, 1.3rem)",
        fontWeight:    "700",
        letterSpacing: "clamp(2px, 0.5vw, 5px)",
        textTransform: "uppercase",
        color:         "#70c8ff",
        textShadow:    "0 0 16px rgba(80,160,255,0.5), 0 2px 4px rgba(0,0,0,0.9)"
    }, "YOUR FORCES");
    playerFacName.id = "bls-player-name";
    const playerCount = _makeEl("div", {
        fontSize:      "clamp(0.62rem, 1.5vw, 0.8rem)",
        color:         "rgba(180,220,255,0.7)",
        letterSpacing: "1px",
        marginTop:     "2px"
    });
    playerCount.id = "bls-player-count";
    playerInfo.appendChild(playerFacName);
    playerInfo.appendChild(playerCount);
    playerHeader.appendChild(playerInfo);
    botSection.appendChild(playerHeader);

    // Progress circle
    const progSection = _makeEl("div", {
        width: "min(500px, 90vw)",
        marginTop: "clamp(6px, 1.5vh, 14px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center"
    });
    _statusEl = _makeEl("div", {
        fontSize:       "clamp(0.6rem, 1.5vw, 0.72rem)",
        color:          "rgba(180,150,90,0.8)",
        letterSpacing:  "2px",
        textTransform:  "uppercase",
        textAlign:      "center",
        marginBottom:   "10px",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        gap:            "8px"
    }, "Preparing battlefield — loading…");

    // Circular progress ring, built from an SVG circle whose stroke-dasharray
    // is driven by pct (replaces the old horizontal shimmer bar).
    const RING_SIZE = 64;
    const RING_R     = 27;
    const RING_CIRC  = 2 * Math.PI * RING_R;
    const ringWrap = _makeEl("div", {
        position: "relative",
        width:  RING_SIZE + "px",
        height: RING_SIZE + "px"
    });
    const svgNS = "http://www.w3.org/2000/svg";
    const ringSvg = document.createElementNS(svgNS, "svg");
    ringSvg.setAttribute("width", RING_SIZE);
    ringSvg.setAttribute("height", RING_SIZE);
    ringSvg.setAttribute("viewBox", `0 0 ${RING_SIZE} ${RING_SIZE}`);
    ringSvg.style.transform = "rotate(-90deg)"; // start fill from the top
    ringSvg.style.filter = "drop-shadow(0 0 6px rgba(245,215,110,0.55))";

    const ringTrack = document.createElementNS(svgNS, "circle");
    ringTrack.setAttribute("cx", RING_SIZE / 2);
    ringTrack.setAttribute("cy", RING_SIZE / 2);
    ringTrack.setAttribute("r", RING_R);
    ringTrack.setAttribute("fill", "none");
    ringTrack.setAttribute("stroke", "rgba(255,255,255,0.08)");
    ringTrack.setAttribute("stroke-width", "6");

    _progressFill = document.createElementNS(svgNS, "circle");
    _progressFill.setAttribute("cx", RING_SIZE / 2);
    _progressFill.setAttribute("cy", RING_SIZE / 2);
    _progressFill.setAttribute("r", RING_R);
    _progressFill.setAttribute("fill", "none");
    _progressFill.setAttribute("stroke", "url(#bls-ring-gradient)");
    _progressFill.setAttribute("stroke-width", "6");
    _progressFill.setAttribute("stroke-linecap", "round");
    _progressFill.setAttribute("stroke-dasharray", RING_CIRC.toFixed(2));
    _progressFill.setAttribute("stroke-dashoffset", RING_CIRC.toFixed(2));
    _progressFill.style.transition = "stroke-dashoffset 0.1s linear";
    // Stash geometry constant on the element itself so update sites (which
    // only know a 0-100 pct) can compute the correct dashoffset without
    // duplicating RING_CIRC everywhere.
    _progressFill.__circumference = RING_CIRC;

    const defs = document.createElementNS(svgNS, "defs");
    const grad = document.createElementNS(svgNS, "linearGradient");
    grad.setAttribute("id", "bls-ring-gradient");
    grad.setAttribute("x1", "0%"); grad.setAttribute("y1", "0%");
    grad.setAttribute("x2", "100%"); grad.setAttribute("y2", "100%");
    const stops = [
        ["0%",   "#6b3a10"],
        ["35%",  "#c8910a"],
        ["70%",  "#f5d76e"],
        ["100%", "#fff8c0"]
    ];
    stops.forEach(([off, col]) => {
        const s = document.createElementNS(svgNS, "stop");
        s.setAttribute("offset", off);
        s.setAttribute("stop-color", col);
        grad.appendChild(s);
    });
    defs.appendChild(grad);
    ringSvg.appendChild(defs);
    ringSvg.appendChild(ringTrack);
    ringSvg.appendChild(_progressFill);
    ringWrap.appendChild(ringSvg);

    // Centered label inside the ring (kept as "Loading..." per existing design,
    // not a numeric percentage).
    _progressPct = _makeEl("div", {
        position:      "absolute",
        top:           "50%",
        left:          "50%",
        transform:     "translate(-50%, -50%)",
        textAlign:     "center",
        fontSize:      "clamp(0.42rem, 1.1vw, 0.58rem)",
        color:         "rgba(245,215,110,0.95)",
        letterSpacing: "0.5px",
        fontWeight:    "700",
        fontFamily:    "monospace",
        textShadow:    "0 0 8px rgba(245,215,110,0.5)",
        whiteSpace:    "nowrap"
    }, "Loading...");
    ringWrap.appendChild(_progressPct);

    progSection.appendChild(_statusEl);
    progSection.appendChild(ringWrap);
    botSection.appendChild(progSection);
    layout.appendChild(botSection);

    wrap.appendChild(layout);
    document.body.appendChild(wrap);
    _screen = wrap;

    // ── Inject CSS keyframes once ───────────────────────────────────────
    if (!document.getElementById("bls-styles")) {
        const st = document.createElement("style");
        st.id = "bls-styles";
        st.textContent = `
            @keyframes bls-pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50%      { opacity: 0.85; transform: scale(1.03); }
            }
            @keyframes bls-fadein {
                from { opacity: 0; transform: translateY(8px); }
                to   { opacity: 1; transform: translateY(0); }
            }
            @keyframes bls-glow-pulse {
                0%, 100% { box-shadow: 0 0 24px rgba(255,202,40,0.55), inset 0 -3px 8px rgba(0,0,0,0.45); }
                50%      { box-shadow: 0 0 38px rgba(255,202,40,0.95), inset 0 -3px 8px rgba(0,0,0,0.45); }
            }
            .bls-card-anim {
                animation: bls-fadein 0.35s ease both;
            }
            .bls-deploy-disabled {
                pointer-events: none !important;
                opacity: 0.30 !important;
                filter: grayscale(0.65) !important;
                cursor: not-allowed !important;
            }
        `;
        document.head.appendChild(st);
    }
}

// ── Unit type → emoji fallback icon ─────────────────────────────────────────
function _unitIcon(type) {
    const s = (type || "").toLowerCase();
	 if (s.match(/(twohand|two|greatsword|handed)/))
        return "⚔️";
	
    if (s.match(/(cav|horse|lancer|mount|keshig)/))  return "🏇";
    if (s.match(/eleph/))                             return "🐘";
    if (s.match(/(bomb|artill|trebuch)/))             return "💣";
    if (s.match(/(ship|naval|galley)/))               return "⛵";
    if (s.match(/(archer|bow|crossbow)/))             return "🏹";
    if (s.match(/(hand|rocket|firelance)/))           return "🔥";
    if (s.match(/cannon/))                            return "🎆";
    if (s.match(/camel/))                             return "🐫";
    if (s.match(/(pike|spear|glaive)/))               return "🔱";
    if (s.match(/(slinger|javelinier)/))              return "🤾";
    if (s.match(/(shield)/))                          return "🛡️";
    if (s.match(/(militia|peasant)/))                 return "🪓";
    if (s.match(/(general|command|player)/))          return "⭐";
    return "⚔️";
}

// ── Build unit card tiles (uses drawTroopCardToCanvas if available) ──────────
// unknownCount: for enemy side only — how many units scouts didn't identify.
// targetTotal:  when > 0, card ×counts are scaled proportionally to this
//               deployed total (so initial render shows actual on-field counts,
//               not the raw full-army roster size).
function buildCardTiles(roster, container, side, factionCol, unknownCount = 0, targetTotal = 0) {
    // ── FIX: FLICKER GUARD ──────────────────────────────────────────────────
    // _runLoadingGate() polls every 80ms and calls _refreshLoadingScreenData()
    // -> buildCardTiles() on EVERY tick once units exist (by design, to keep
    // counts converging to the live deployed total). But this function used
    // to unconditionally wipe (innerHTML = "") and rebuild every card on every
    // call, restarting the bls-fadein CSS animation on every card ~12.5x/sec
    // for the full ~2s loading window — that's the extremely-fast flicker.
    // Fix: compute a cheap signature of what would actually be rendered and
    // skip the rebuild entirely if it's identical to last time. The numbers
    // still converge (each tick that actually changes something still
    // rebuilds), but once the roster settles, the DOM is left alone and the
    // fade-in plays once instead of restarting every 80ms.
    const _sig = side + "|" + unknownCount + "|" + targetTotal + "|" +
        (roster || []).map(u => (typeof u === "string" ? u : (u.type || u.name || u.unitType || "?"))).join(",");
    if (container.__blsLastSig === _sig) return;
    container.__blsLastSig = _sig;

    container.innerHTML = "";
    if (!roster || !roster.length) {
        const none = _makeEl("div", {
            color: "rgba(200,180,120,0.4)", fontSize: "0.7rem",
            fontStyle: "italic", padding: "8px"
        }, "(Composition unknown)");
        container.appendChild(none);
        return;
    }

    const isEnemy   = side === "enemy";
    // Cap unknown cards at 5 — if more remain, the last card shows ×overflow badge
    const MAX_UNKNOWN_CARDS = 5;

    let items   = condenseRoster(roster, CFG.CARD_MAX);

    // ── Scale item counts to the actual deployed total ───────────────────────
    // Without this, the initial render shows full-army numbers (e.g. ×200)
    // while only ~100 troops will actually be on the field.  After the 110ms
    // refresh, _refreshLoadingScreenData corrects via live battleEnvironment,
    // but scaling here prevents any wrong-number flash on the first frame.
    if (targetTotal > 0 && items.length > 0) {
        const rawTotal = items.reduce((s, i) => s + i.count, 0);
        if (rawTotal > 0 && rawTotal !== targetTotal) {
            const ratio = targetTotal / rawTotal;
            let remaining = targetTotal;
            items.forEach((item, idx) => {
                if (idx === items.length - 1) {
                    // Last card absorbs rounding error; guarantee at least 1
                    item.count = Math.max(1, remaining);
                } else {
                    item.count = Math.max(1, Math.round(item.count * ratio));
                    remaining  = Math.max(0, remaining - item.count);
                }
            });
        }
    }
    const totalCardSlots = items.length + Math.min(unknownCount, MAX_UNKNOWN_CARDS);
    const W       = Math.min(CFG.CARD_W, Math.floor((window.innerWidth * 0.88) / Math.min(totalCardSlots, 8)) - 8);
    const H         = Math.round(W * 1.35);
    const borderCol = isEnemy ? "rgba(255,80,80,0.55)"  : "rgba(80,160,255,0.55)";
    const glowCol   = isEnemy ? "rgba(255,60,60,0.25)"  : "rgba(60,140,255,0.25)";

    items.forEach((item, idx) => {
        const card = _makeEl("div", {
            width:           W + "px",
            height:          H + "px",
            border:          "1.5px solid " + borderCol,
            borderRadius:    "4px",
            background:      "linear-gradient(170deg, rgba(30,20,10,0.92), rgba(10,8,4,0.97))",
            boxShadow:       "0 0 10px " + glowCol + ", inset 0 0 8px rgba(0,0,0,0.6)",
            display:         "flex",
            flexDirection:   "column",
            alignItems:      "center",
            justifyContent:  "space-between",
            padding:         "4px 3px 5px",
            cursor:          "default",
            position:        "relative",
            overflow:        "hidden",
            animationDelay:  (idx * 0.04) + "s"
        });
        card.className = "bls-card-anim";

        // Try the game's own card renderer — used as background art if available
        if (typeof window.drawTroopCardToCanvas === "function") {
            try {
                const cv = document.createElement("canvas");
                cv.width  = W * 2;
                cv.height = H * 2;
                Object.assign(cv.style, {
                    position: "absolute", top: "0", left: "0",
                    width: "100%", height: "100%", display: "block",
                    zIndex: "0", opacity: "0.35"
                });
                window.drawTroopCardToCanvas(
                    cv,
                    item.type,
                    side === "player" ? (window.player && window.player.faction) : null
                );
                card.appendChild(cv);
            } catch (e) { /* no background art, card bg gradient shows instead */ }
        }

        // Big emoji always in center, taking up most of the card height
        const iconArea = _makeEl("div", {
            position: "absolute",
            top: "4px", left: "0", right: "0",
            bottom: Math.max(18, Math.round(H * 0.28)) + "px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: Math.round(W * 0.52) + "px",
            lineHeight: "1",
            pointerEvents: "none",
            zIndex: "2",
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.85))"
        }, _unitIcon(item.type));
        card.appendChild(iconArea);

        // Unit name pinned to bottom, wraps for long names
        const nameLabel = _makeEl("div", {
            position: "absolute",
            bottom: "3px", left: "2px", right: "2px",
            textAlign: "center",
            fontSize: Math.max(7, Math.round(W * 0.1)) + "px",
            color: isEnemy ? "#ffaaaa" : "#aad4ff",
            lineHeight: "1.15",
            wordBreak: "break-word",
            overflowWrap: "break-word",
            zIndex: "2",
            textShadow: "0 1px 3px rgba(0,0,0,0.9)"
        }, item.type);
        card.appendChild(nameLabel);

        // Gold top accent
        const topAccent = _makeEl("div", {
            position:   "absolute",
            top:        "0",
            left:       "10%",
            right:      "10%",
            height:     "1px",
            background: "linear-gradient(90deg, transparent, rgba(200,160,60,0.6), transparent)"
        });
        card.appendChild(topAccent);
        container.appendChild(card);
    });

    // ── Unknown "?" cards (enemy intel fog) ──────────────────────────────────
    // Shows the hidden portion of the enemy force as mystery cards so the player
    // can see there are more troops they haven't identified.
    if (isEnemy && unknownCount > 0) {
        const showCards = Math.min(unknownCount, MAX_UNKNOWN_CARDS);
        const overflow  = unknownCount - showCards; // extra units on final badge

        for (let i = 0; i < showCards; i++) {
            const isLast    = i === showCards - 1;
            const badgeNum  = isLast && overflow > 0 ? overflow + 1 : 1;

            const qCard = _makeEl("div", {
                width:          W + "px",
                height:         H + "px",
                border:         "1.5px dashed rgba(180,60,60,0.45)",
                borderRadius:   "4px",
                background:     "linear-gradient(170deg, rgba(18,8,8,0.95), rgba(6,3,3,0.98))",
                boxShadow:      "0 0 8px rgba(120,30,30,0.20), inset 0 0 10px rgba(0,0,0,0.7)",
                display:        "flex",
                flexDirection:  "column",
                alignItems:     "center",
                justifyContent: "space-between",
                padding:        "4px 3px 5px",
                cursor:         "default",
                position:       "relative",
                overflow:       "hidden",
                opacity:        String(0.55 + i * 0.04), // slight fade-in left→right
                animationDelay: ((items.length + i) * 0.04) + "s"
            });
            qCard.className = "bls-card-anim";

            // "?" emoji — dimmer and smaller than real icons
            const qIcon = _makeEl("div", {
                position:   "absolute",
                top: "4px", left: "0", right: "0",
                bottom:     Math.max(18, Math.round(H * 0.28)) + "px",
                display:    "flex", alignItems: "center", justifyContent: "center",
                fontSize:   Math.round(W * 0.46) + "px",
                lineHeight: "1",
                filter:     "drop-shadow(0 2px 6px rgba(180,0,0,0.6)) grayscale(0.4)",
                zIndex:     "2"
            }, "❓");
            qCard.appendChild(qIcon);

            // badge: ×N if last card with overflow, otherwise nothing (each ? = 1 hidden unit)
            if (isLast && overflow > 0) {
                // "Unknown" label at bottom
                const qLabel = _makeEl("div", {
                    position:      "absolute",
                    bottom: "3px", left: "2px", right: "2px",
                    textAlign:     "center",
                    fontSize:      Math.max(7, Math.round(W * 0.09)) + "px",
                    color:         "rgba(200,100,100,0.65)",
                    fontStyle:     "italic",
                    lineHeight:    "1.15",
                    zIndex:        "2",
                    textShadow:    "0 1px 3px rgba(0,0,0,0.9)"
                }, "Unknown");
                qCard.appendChild(qLabel);
            }

            // Subtle red top accent instead of gold
            const qAccent = _makeEl("div", {
                position:   "absolute",
                top:        "0",
                left:       "10%",
                right:      "10%",
                height:     "1px",
                background: "linear-gradient(90deg, transparent, rgba(180,60,60,0.4), transparent)"
            });
            qCard.appendChild(qAccent);
            container.appendChild(qCard);
        }
    }
}

// ── Scout intel helpers (enemy side only) ────────────────────────────────────
// Returns a fuzzy troop count: ±10% random noise, rounded to nearest 5.
// Gives the player a rough sense of force size without exact numbers.

// ── Scaled deploy count helpers ───────────────────────────────────────────────
// Mirrors the GLOBAL_BATTLE_SCALE logic in battlefield_launch.js so the
// loading screen shows the actual units that will appear on the field, not
// the raw army size.  Same two-branch logic as the launch file:
//   Sandbox/story : scale = largerSide / cap  (cap = maxSandboxBattleTroops)
//   Custom battle : scale = ceil(total / 300) when total > 400, else 1
//   deployed      = round( rawCount / scale )
function _computeDeployedCounts(playerRaw, enemyRaw) {
    let scale = 1;
    if (window.__IS_CUSTOM_BATTLE__) {
        const total = playerRaw + enemyRaw;
        scale = total > 400 ? Math.ceil(total / 300) : 1;
    } else {
        const cap        = Math.max(20, Math.min(300, window.maxSandboxBattleTroops || 100));
        const largerSide = Math.max(playerRaw, enemyRaw);
        scale = largerSide > cap ? largerSide / cap : 1;
    }
    const pDeploy = scale > 1 ? Math.max(1, Math.round(playerRaw / scale)) : playerRaw;
    const eDeploy = scale > 1 ? Math.max(1, Math.round(enemyRaw  / scale)) : enemyRaw;
    return { pDeploy, eDeploy, scale, capped: scale > 1 };
}

// Cached per-call-session (see _scoutRevealCache) — same fuzz-once rationale
// as _scoutRoster: _refreshLoadingScreenData() calls this every 80ms tick
// with the same "exact" value while the troop count is stable, and a fresh
// ±10% random roll each time made the displayed enemy count visibly jitter.
let _scoutCountCache = null; // { exact, value }
function _scoutCount(exact) {
    if (!exact || exact <= 0) return 0;
    if (_scoutCountCache && _scoutCountCache.exact === exact) {
        return _scoutCountCache.value;
    }
    const noise  = exact * 0.10;                         // ±10% window
    const fuzzed = exact + (Math.random() * noise * 2) - noise;
    const value  = Math.max(5, Math.round(fuzzed / 5) * 5);      // nearest 5, min 5
    _scoutCountCache = { exact, value };
    return value;
}

// Returns a partial enemy roster — 30-60% of cards, randomly sampled.
// Simulates scouts only recognising some unit types from a distance.
// Cached per-call-session (see _scoutRevealCache) so repeated calls with the
// same underlying roster return the SAME subset/order instead of re-rolling.
function _scoutRoster(roster) {
    if (!roster || !roster.length) return [];

    const rosterKey = roster.map(u => (typeof u === "string" ? u : (u.type || u.name || u.unitType || "?"))).join(",");
    if (_scoutRevealCache && _scoutRevealCache.rosterKey === rosterKey) {
        return _scoutRevealCache.roster;
    }

    const revealFraction = 0.30 + Math.random() * 0.30;   // 30-60%
    const revealCount    = Math.max(1, Math.round(roster.length * revealFraction));
    const shuffled = roster.slice().sort(() => Math.random() - 0.5);
    const result = shuffled.slice(0, revealCount);

    _scoutRevealCache = { rosterKey, roster: result, count: _scoutRevealCache ? _scoutRevealCache.count : null };
    return result;
}

function showBattleLoadingScreen(npc, tile, nearestCity, pendingPlayerOverride) {
    if (!_screen) _buildScreen();
    if (!_screen) return;

    // New battle session — clear stale scout caches so this battle's fog-of-war
    // reveal rolls fresh rather than reusing whatever the last battle showed.
    _resetScoutReveal();
    _scoutCountCache = null;

    const tileName = (tile && tile.name) ? tile.name : "Plains";
    const cityName = nearestCity ? (nearestCity.name || nearestCity.id) : null;

    // 🔴 FIX: Extract from the new pendingPlayerOverride if it exists
    const playerFac    = (pendingPlayerOverride && pendingPlayerOverride.faction) || (window.player && window.player.faction) || "Your Forces";
    const playerCol    = (pendingPlayerOverride && pendingPlayerOverride.color) || factionColor(playerFac) || "#4a90d9";
    const playerCount  = ((pendingPlayerOverride && pendingPlayerOverride.count !== undefined) ? pendingPlayerOverride.count : ((window.player && window.player.troops) || 0)) + 1;
    const playerRoster = (pendingPlayerOverride && pendingPlayerOverride.roster) || ((window.player && window.player.roster) || []);

    // Save for _refreshLoadingScreenData so it doesn't clobber the correct roster
    // with stale battleEnvironment.units unitType values 110ms later.
    _lastPendingPlayer = pendingPlayerOverride || null;
    
    const enemyFac     = npc ? (npc.faction || "Enemy Forces") : "Enemy Forces";
    const enemyCol     = factionColor(enemyFac)  || "#c0392b";
    // +1 for the enemy general only when launched from custom battle.
    // Custom battle sets window.__blsFromCustom = true (via __blsPendingEnemy).
    // Sandbox/parler NPCs carry their real total in npc.count — no +1 needed.
    // Backup: also check if battleEnvironment already has a spawned enemy commander.
    const _enemyCmdrSpawned = !!(window.battleEnvironment && Array.isArray(window.battleEnvironment.units)
        && window.battleEnvironment.units.some(u => u.side === "enemy" && u.isCommander));
    const _addGeneral = window.__blsFromCustom || _enemyCmdrSpawned;
    const _exactCount  = ((npc && (npc.count || npc.troops)) || 0) + (_addGeneral ? 1 : 0);

    // --- Compute actual deployed counts after cap/ratio scaling ---
    // playerCount already has +1 for the commander; strip it back so inputs
    // match what battlefield_launch.js receives (player.troops / npc.count).
    const _playerRaw = playerCount - 1;
    const _enemyRaw  = _exactCount;
    const _scaled    = _computeDeployedCounts(_playerRaw, _enemyRaw);

    // Fuzz the DEPLOYED enemy count (not the full army) for the scout report
    const enemyCountN = _scoutCount(_scaled.eDeploy);
    // Player sees their exact deployed count (+1 for their own commander)
    const playerDeployedDisplay = _scaled.pDeploy + 1;

    // Cap reminder: visible in sandbox/story only, never for custom battles
    const _cap = Math.max(20, Math.min(300, window.maxSandboxBattleTroops || 100));
    const _capReminderText = (!window.__IS_CUSTOM_BATTLE__ && _scaled.capped)
        ? "  •  Max set at " + _cap + " per side"
        : "";

    const _fullEnemyRosterLen = (npc && npc.roster) ? npc.roster.length : 0;
    const enemyRoster  = _scoutRoster((npc && npc.roster) || []);  // partial scout reveal
    // How many enemy units scouts didn't identify — shown as "?" cards
    const unknownEnemyCount = Math.max(0, _fullEnemyRosterLen - enemyRoster.length);

    // If we have a city name, show "BATTLE OF [CITY]", otherwise fallback to "LOADING BATTLE"
    _titleEl.textContent = cityName ? "BATTLE OF " + String(cityName).toUpperCase() : "LOADING BATTLE";
    
    _subEl.textContent   = (typeof inSiegeBattle !== "undefined" && inSiegeBattle) ? "Siege Battle"
                         : (window.inNavalBattle)                                  ? "Naval Battle"
                         : (window.inRiverBattle)                                  ? "River Battle"
                         : terrainLabel(tileName);

    document.getElementById("bls-enemy-name").textContent  = enemyFac.toUpperCase();
    document.getElementById("bls-enemy-name").style.color  = enemyCol;
    document.getElementById("bls-enemy-count").textContent = "";

    document.getElementById("bls-player-name").textContent  = playerFac.toUpperCase();
    document.getElementById("bls-player-name").style.color  = playerCol;
    document.getElementById("bls-player-count").textContent = "";

    // Background image preload + apply (tries .png → .jpg → .jpeg for index 1-12)
    _loadBgWithFallback(pickBgIndex(), (resolvedUrl) => {
        _bgImg.style.backgroundImage = "url('" + resolvedUrl + "')";
    });

    _screen.style.display = "flex";
    _screen.style.opacity = "0";
    requestAnimationFrame(() => {
        _screen.style.transition = "opacity 0.4s ease";
        _screen.style.opacity = "1";
    });

    // Build cards after layout tick (so canvases get proper width)
    setTimeout(() => {
        // Pass the deployed counts so card ×badges show on-field numbers, not raw army size
        buildCardTiles(enemyRoster,  _enemyCardsRow,  "enemy",  enemyCol, unknownEnemyCount, _scaled.eDeploy);
        buildCardTiles(playerRoster, _playerCardsRow, "player", playerCol, 0, _scaled.pDeploy);
    }, 80);

    // Progress animation
    _progressFill.setAttribute("stroke-dashoffset", _progressFill.__circumference.toFixed(2));
    _progressFill.dataset.pct = "0";
    _progressPct.textContent  = "Loading...";
    let tick = 0, msgIdx = 0;
    if (_progressInterval) clearInterval(_progressInterval);
    const tickInterval = CFG.LOAD_MIN_MS / CFG.PROGRESS_TICKS;
    _progressInterval = setInterval(() => {
        tick++;
        const pct = Math.min(Math.round((tick / CFG.PROGRESS_TICKS) * 100), 100);
        const circ = _progressFill.__circumference;
        _progressFill.setAttribute("stroke-dashoffset", (circ * (1 - pct / 100)).toFixed(2));
        _progressFill.dataset.pct = String(pct);
        // Ring fill still animates by real pct above; the label itself
        // just reads "Loading..." instead of a numeric percentage.
        _progressPct.textContent  = "Loading...";
        const newMsg = Math.floor((tick / CFG.PROGRESS_TICKS) * DEPLOY_MSGS.length);
        if (newMsg !== msgIdx && newMsg < DEPLOY_MSGS.length) {
            msgIdx = newMsg;
            _statusEl.textContent = DEPLOY_MSGS[msgIdx];
        }
        if (tick >= CFG.PROGRESS_TICKS) clearInterval(_progressInterval);
    }, tickInterval);
}

// Re-populate cards once the original battle launch has finished deploying units
function _refreshLoadingScreenData() {
    if (!_screen || _screen.style.display === "none") return;

  let playerFac = "Your Forces";
    let playerRoster = [];
    let playerCountN = 0;

    // PRIORITY: use the custom setup roster saved from pendingPlayerOverride.
    // This is always accurate (it's exactly what the player chose) and avoids
    // the stale-unitType problem where battleEnvironment.units shows "Militia"
    // for every unit during the brief spawn window.
    if (_lastPendingPlayer && _lastPendingPlayer.roster && _lastPendingPlayer.roster.length) {
        playerFac    = _lastPendingPlayer.faction || playerFac;
        playerRoster = _lastPendingPlayer.roster;
        playerCountN = _lastPendingPlayer.count || playerRoster.length;
    } else if (window.battleEnvironment && Array.isArray(window.battleEnvironment.units)) {
        // Fallback: read from live spawned units (used for campaign/parler battles)
        const players = window.battleEnvironment.units.filter(u => u.side === "player" && !u.isCommander);
        if (players.length) {
            playerFac    = players[0].faction || players[0].nationality || playerFac;
            playerRoster = players.map(u => ({ type: u.unitType || (u.stats && u.stats.name) || "Soldier" }));
            playerCountN = players.length;
        }
    }
    
    // Fallback if spawn loop hasn't hit yet
    if (!playerRoster.length) {
        playerFac = (window.player && window.player.faction) || playerFac;
        playerRoster = (window.player && Array.isArray(window.player.roster)) ? window.player.roster : [];
        playerCountN = playerRoster.length || (window.player && window.player.troops) || 0;
    }

    const playerCol = factionColor(playerFac) || "#4a90d9";
    let enemyFac     = "Enemy Forces";
    let enemyRoster  = [];
    let enemyCountN  = 0;
    let unknownEnemyCount = 0;
    if (window.battleEnvironment && Array.isArray(window.battleEnvironment.units)) {
        const enemies = window.battleEnvironment.units.filter(u => u.side === "enemy" && !u.isCommander);
        if (enemies.length) {
            enemyFac    = enemies[0].faction || enemies[0].nationality || enemyFac;
            // Full roster from live units, then scout-filter to partial reveal
            const _fullRoster = enemies.map(u => ({ type: u.unitType || (u.stats && u.stats.name) || "Soldier" }));
            enemyRoster = _scoutRoster(_fullRoster);
            // Track how many units scouts didn't identify → "?" cards
            unknownEnemyCount = Math.max(0, _fullRoster.length - enemyRoster.length);
            // +1 for commander (excluded by filter), then fuzz the total
            enemyCountN = _scoutCount(enemies.length + 1);
        }
    }
    const enemyCol = factionColor(enemyFac) || "#c0392b";

    // ═════════════════════════════════════════════════════════════════════════
    // SCALED COUNT FROM LIVE BATTLEFIELD (TRUTHIEST SOURCE)
    // ══════════════════════════════════════════════════════════════════════════
    // The counts shown to the player MUST be what actually deployed on the
    // battlefield, NOT the raw army size. Once the launch function has spawned
    // units (which happens before this 110ms refresh fires), the live counts
    // in battleEnvironment.units are the authoritative deployed totals.
    //
    // Old code mistakenly used playerRoster.length (the full unscaled roster)
    // and window.player.troops (raw army size) as a fallback, which caused the
    // screen to display the pre-cap numbers instead of the actual deployed ones.
    let _playerOnFieldCount = 0;
    let _enemyOnFieldCount  = 0;
    if (window.battleEnvironment && Array.isArray(window.battleEnvironment.units)) {
        for (const u of window.battleEnvironment.units) {
            if (!u || u.hp == null) continue;
            if (u.side === "player") _playerOnFieldCount++;
            else if (u.side === "enemy") _enemyOnFieldCount++;
        }
    }

    // Fuzz the live enemy count for the scout-report display
    if (_enemyOnFieldCount > 0) enemyCountN = _scoutCount(_enemyOnFieldCount);

    // Cap reminder: visible in sandbox/story only, hidden for custom battles.
    const _refreshCap = Math.max(20, Math.min(300, window.maxSandboxBattleTroops || 100));
    const _refreshCapText = (!window.__IS_CUSTOM_BATTLE__ && (window.GLOBAL_BATTLE_SCALE || 1) > 1)
        ? "  •  Max set at " + _refreshCap + " per side"
        : "";

    document.getElementById("bls-enemy-name").textContent  = enemyFac.toUpperCase();
    document.getElementById("bls-enemy-name").style.color  = enemyCol;
    document.getElementById("bls-player-name").textContent = playerFac.toUpperCase();
    document.getElementById("bls-player-name").style.color = playerCol;

    _subEl.textContent = terrainLabel("");

    // FIX: Only rebuild cards if we actually found live units in battleEnvironment.
    // If enemies aren't spawned yet (110ms refresh fires before spawn loop finishes),
    // enemyRoster is [] and calling buildCardTiles would wipe the correct cards that
    // showBattleLoadingScreen already built from __blsPendingEnemy at t=80ms.
    // Pass live on-field counts as targetTotal so card ×badges reflect deployed troops.
    if (enemyRoster.length)  buildCardTiles(enemyRoster,  _enemyCardsRow,  "enemy",  enemyCol, unknownEnemyCount, _enemyOnFieldCount || 0);
    if (playerRoster.length) buildCardTiles(playerRoster, _playerCardsRow, "player", playerCol, 0, _playerOnFieldCount || 0);
}

function hideBattleLoadingScreen() {
    if (!_screen) return;
    if (_progressInterval) { clearInterval(_progressInterval); _progressInterval = null; }
    _screen.style.transition = "opacity 0.5s ease";
    _screen.style.opacity    = "0";
    setTimeout(() => {
        _screen.style.display    = "none";
        _screen.style.opacity    = "1";
        _screen.style.transition = "";
        // SURGERY: siege battles skip pre-deployment entirely and go straight
        // to live combat via _launchDirectly(). All other battle types
        // (land/river/naval) still go through _enterPreDeployment() as before.
        // NOTE: checks the bare `inSiegeBattle` global, not window.inSiegeBattle
        // — siegebattle.js declares it with top-level `let`, which does NOT
        // attach to window, so window.inSiegeBattle is never actually set.
        if (typeof inSiegeBattle !== "undefined" && inSiegeBattle) {
            _launchDirectly();
        } else {
            _enterPreDeployment();
        }
    }, 520);
}

// ============================================================================
//  DIRECT LAUNCH  (replaces pre-deployment — uses old enterBattlefield AI path)
// ============================================================================
function _launchDirectly() {
    console.log("[BLS] Direct launch — skipping pre-deployment.");

    window.__preDeploymentActive  = false;
    window.__battleCullingEnabled = true;
    // Lift the draw/update gate here (not in the loading gate) so that the
    // 520ms fade-out keeps loading, but the moment _launchDirectly
    // fires (after the screen is gone) the canvas and updateBattleUnits are
    // immediately unblocked.
    window.__battleLoadingActive  = false;

    // ── CRITICAL: set inBattleMode BEFORE anything that starts a setInterval ──
    // EnemyTacticalAI.start() fires a setInterval(tick, 500ms). tick() guards
    // itself with MobileControls.G.isBattle() / !isBattle → teardown(). On
    // mobile MobileControls.G.isBattle() reads window.inBattleMode. If that
    // flag is still false when the first tick fires (~500ms from now), tick()
    // calls teardown() immediately — the AI stops, enemy units receive no further
    // advance orders, and they stand frozen until the player moves the camera
    // (which triggers processAction independently via other paths).
    // Fix: mirror what enterBattlefield does — set BOTH the local var (scoped to
    // battlefield_launch.js) via its window export AND window.inBattleMode so
    // every reader agrees before the first AI tick fires.
    if (typeof window.inBattleMode !== 'undefined') window.inBattleMode = true;
    // The local `inBattleMode` in battlefield_launch.js is not directly settable
    // from here, but battlefield_launch.js already exposed it via window at line
    // 707. Setting window.inBattleMode here covers MobileControls, BLS checks,
    // and EnemyTacticalAI.tick()'s isBattle() guard simultaneously.
    // ──────────────────────────────────────────────────────────────────────────

    // Flush ghost keys
    if (window.keys) for (const k in window.keys) window.keys[k] = false;

    // Set both sides live — same tail logic as enterBattlefield
    if (window.battleEnvironment && Array.isArray(window.battleEnvironment.units)) {
        window.battleEnvironment.units.forEach(u => {
            if (!u || u.hp <= 0) return;
            if (u.side === "enemy") {
                u.hasOrders        = false;
                u.orderType        = null;
                u.orderTargetPoint = null;
                u.target           = null;
                u.state            = "idle";
                u.vx               = 0;
                u.vy               = 0;
                u.fleeing          = false;
                u.isFleeing        = false;
                u.formationTimer   = 0;
                u.reactionDelay    = 0;
                u.cooldown         = 0;
                if (u.anchorX !== undefined) u.anchorX = u.x;
                if (u.anchorY !== undefined) u.anchorY = u.y;
                u.stuckTimer       = 0;
                u.ghostTimer       = 0;
                u.priorityOverride = false;
                u.unstickCooldown  = 0;
            } else if (u.side === "player" && !u.isCommander && !u.disableAICombat) {
                // REMOVED: Lazy General auto-select + seek_engage. Player
                // attacker units stay unselected with no orders until the
                // player commands them, in every battle type including siege
                // (siege assault roles are still handled by
                // executeSiegeAssaultAI elsewhere, untouched by this block).
            }
        });
    }

    try { window.isBattlefieldReady = true; } catch (e) {}

    // Start enemy tactical AI — same call as enterBattlefield line 871
    if (typeof window.EnemyTacticalAI !== "undefined" && window.EnemyTacticalAI.start) {
        try { window.EnemyTacticalAI.start(); } catch (e) { console.error('[BLS] EnemyTacticalAI.start() threw in _launchDirectly():', e); }
    } else {
        console.warn('[BLS] window.EnemyTacticalAI missing or has no start() at _launchDirectly() time!');
    }

    if (typeof window.triggerEpicZoom === "function") {
        try { window.triggerEpicZoom(CFG.COMMENCE_ZOOM_START, CFG.COMMENCE_ZOOM_END, CFG.COMMENCE_ZOOM_MS); } catch (e) {}
    }

    console.log("[BLS] Battle is LIVE (direct).");
}


let _preDeployUI = null;
let _commenceBtn = null;
let _formationNameEl = null;

function _buildPreDeployUI() {
    if (_preDeployUI) return;
    // SURGERY: was 3 separately-styled translucent pills (title/formation/
    // hint) plus a separately-styled button, pinned to top:8px/right:8px.
    // Rebuilt as ONE opaque bordered panel, vertically centered on the right
    // edge (top:50% + translateY(-50%) so it stays centered regardless of
    // screen height, rather than a fixed top offset) per direct request.
    _preDeployUI = _makeEl("div", {
        position:       "fixed",
        top:            "50%",
        right:          "8px",
        transform:      "translateY(-50%)",
        zIndex:         "9800",
        display:        "none",
        flexDirection:  "column",
        alignItems:     "stretch",
        gap:            "0",
        width:          "clamp(200px, 26vw, 260px)",
        pointerEvents:  "none",
        fontFamily:     "'Cinzel', Georgia, serif",
        background:     "#150b06",   // fully opaque — no see-through to the battlefield behind it
        border:         "2px solid #d4b886",
        borderRadius:   "10px",
        boxShadow:      "0 6px 22px rgba(0,0,0,0.85)",
        overflow:       "hidden"
    });
    _preDeployUI.id = "bls-predeploy-hud";

    const titlePill = _makeEl("div", {
        background:    "#1c0f07",
        padding:       "10px 12px",
        textAlign:     "center",
        color:         "#ffca28",
        fontSize:      "12px",
        fontWeight:    "700",
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        textShadow:    "0 1px 3px #000",
        borderBottom:  "1px solid #d4b886",
        pointerEvents: "auto"
    }, "Pre-Battle Deployment");
    _preDeployUI.appendChild(titlePill);

    _formationNameEl = _makeEl("div", {
        background:    "#1c0f07",
        padding:       "8px 12px",
        textAlign:     "center",
        color:         "#ff9b9b",
        fontSize:      "11px",
        fontWeight:    "600",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        borderBottom:  "1px solid rgba(212,184,134,0.35)",
        pointerEvents: "auto"
    }, "Enemy: —");
    _preDeployUI.appendChild(_formationNameEl);

    const hint = _makeEl("div", {
        background:    "#1c0f07",
        padding:       "8px 12px",
        textAlign:     "center",
        color:         "#cfb88a",
        fontSize:      "10px",
        fontStyle:     "italic",
        letterSpacing: "0.08em",
        lineHeight:    "1.35",
        borderBottom:  "1px solid rgba(212,184,134,0.35)",
        pointerEvents: "auto"
    }, "Drag-box to position troops within the blue zone.");
    _preDeployUI.appendChild(hint);

    _commenceBtn = _makeEl("button", {
        background:    "linear-gradient(180deg, #c62828 0%, #6a1010 100%)",
        border:        "none",
        borderTop:     "2px solid #ffca28",
        borderRadius:  "0",
        padding:       "14px 8px",
        color:         "#fff",
        fontSize:      "clamp(13px, 2.2vw, 16px)",
        fontWeight:    "900",
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        cursor:        "pointer",
        textShadow:    "0 2px 4px #000, 0 0 12px rgba(255,202,40,0.4)",
        boxShadow:     "inset 0 0 24px rgba(255,202,40,0.25)",
        pointerEvents: "auto",
        userSelect:    "none",
        transition:    "transform 0.12s ease",
        fontFamily:    "'Cinzel', Georgia, serif",
        animation:     "bls-glow-pulse 1.4s ease-in-out infinite",
        touchAction:   "manipulation"
    }, "⚔  COMMENCE BATTLE  ⚔");
    _commenceBtn.id = "bls-commence-btn";
    _commenceBtn.type = "button";
    _commenceBtn.addEventListener("pointerdown", (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        _commenceBtn.style.transform = "scale(0.97)";
    }, { passive: false });
    _commenceBtn.addEventListener("pointerup", (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        _commenceBtn.style.transform = "";
        _commenceBattle();
    }, { passive: false });
    _commenceBtn.addEventListener("touchstart", (ev) => { ev.preventDefault(); }, { passive: false });
    _preDeployUI.appendChild(_commenceBtn);

    document.body.appendChild(_preDeployUI);
}

function _showPreDeployHUD(formationName) {
    _buildPreDeployUI();
    // NAVAL OVERRIDE: Coastal/Ocean battles never actually apply an enemy
    // ground formation -- _applyEnemyFormation() bails out immediately for
    // any inNavalBattle (see below) -- so formationName here is always a
    // leftover land-formation roll (e.g. "Cavalry Wedge") that has nothing
    // to do with what's about to happen. Show a naval-appropriate line
    // instead, always, for both naval map types (Ocean and Coastal). // <<<<
    const isNavalDeploy = !!window.inNavalBattle;
    if (_formationNameEl) {
        _formationNameEl.textContent = isNavalDeploy
            ? "All Hands on Deck"
            : "Enemy: " + (formationName || "Standard Line");
    }
    _preDeployUI.style.display = "flex";
    _preDeployUI.style.opacity = "0";
    requestAnimationFrame(() => {
        _preDeployUI.style.transition = "opacity 0.5s ease";
        _preDeployUI.style.opacity = "1";
    });
}

function _hidePreDeployHUD() {
    if (!_preDeployUI) return;
    _preDeployUI.style.transition = "opacity 0.4s ease";
    _preDeployUI.style.opacity = "0";
    setTimeout(() => { if (_preDeployUI) _preDeployUI.style.display = "none"; }, 420);
}

// ============================================================================
//  DEPLOYMENT ZONES
// ============================================================================
function _worldDims() {
    return {
        W: _safeNumber(window.BATTLE_WORLD_WIDTH,  2400),
        H: _safeNumber(window.BATTLE_WORLD_HEIGHT, 2400)
    };
}

function _calculatePlayerDeployZone() {
    const { W, H } = _worldDims();
    const isSiege = !!window.inSiegeBattle;
    const isNaval = !!window.inNavalBattle;
    const isRiver = !!window.inRiverBattle;

    if (isNaval) {
        // Naval keeps its own ship-deck-relative zone (the deck moves with
        // the ship, so an anchor-square in world space would make no sense
        // here) — unchanged by the SURGERY below.
        const env  = window.navalEnvironment;
        const ship = (env && Array.isArray(env.ships)) ? env.ships.find(s => s.side === "player") : null;
        if (ship) {
            return {
                type: "naval",
                minX: ship.x - ship.width  * 0.45,
                maxX: ship.x + ship.width  * 0.45,
                minY: ship.y - ship.height * 0.45,
                maxY: ship.y + ship.height * 0.45,
                shipRef: ship
            };
        }
        return { type: "naval", minX: 60, maxX: W - 60, minY: H * 0.55, maxY: H - 40, shipRef: null };
    }
    if (isSiege) {
        // SURGERY: square anchored on the attacker camp spawn point instead
        // of a fixed 18%-of-map band along the south edge. Uses the same
        // camp anchor customsiegebattle.js/siegebattle.js actually spawn the
        // attacker roster at (SiegeTopography.campPixelY), so the zone is
        // centered on where the roster really lands, not a guessed fraction.
        const anchorX = W / 2;
        const anchorY = (typeof SiegeTopography !== "undefined" && SiegeTopography.campPixelY)
            ? SiegeTopography.campPixelY
            : H - 100;
        return _squareZoneAt("siege", anchorX, anchorY);
    }
    if (isRiver) {
        // SURGERY: river now uses the same anchor-square as land. River
        // battles roll the same random 4-corner battleSpawnAssignment as
        // land (battlefield_launch.js runs pickBattleSpawnAssignment() for
        // every non-siege battle, river included), so battleSpawnAssignment
        // .player already gives the right per-battle anchor here.
        return _deployZoneForSide("player");
    }
    // SURGERY: direction-aware — was hardcoded to a band along the bottom
    // edge, which assumed the player always spawned south. See
    // _deployZoneForSide / computeSpawnGeometry in battlefield_launch.js.
    return _deployZoneForSide("player");
}

function _calculateEnemyDeployZone() {
    const { W, H } = _worldDims();
    if (window.inSiegeBattle) {
        // SURGERY: square anchored on the defender plaza spawn point
        // (SiegeTopography.gatePixelX/plazaPixelY) instead of a fixed
        // 30%-of-map band along the north edge — matches where
        // spawnSiegeCommander("enemy", ...) and deploySiegeDefenders
        // actually place the defending garrison.
        //
        // FOLLOW-UP FIX #2: the comment above is now ALSO stale. This zone
        // was updated to gatePixelY - 200 to match the spawn/patrol anchor
        // at the time, but that anchor has since moved again (see
        // SiegeTopography.defenderRallyPixelY in siegebattle.js). This box
        // is what _preDeployClampUnits() hard-snaps every enemy unit's x/y
        // into, EVERY SINGLE FRAME, for the entire pre-deploy phase — so if
        // this anchor ever drifts out of sync with the spawn point again,
        // this is the box that will silently win and drag units back to the
        // stale spot, no matter what the spawn/patrol logic does. Reading
        // the shared SiegeTopography.defenderRallyPixelY directly (instead
        // of a locally-duplicated "gatePixelY - 200") means this can't get
        // out of sync again.
        const anchorX = (typeof SiegeTopography !== "undefined" && SiegeTopography.gatePixelX)
            ? SiegeTopography.gatePixelX
            : W / 2;
        const anchorY = (typeof SiegeTopography !== "undefined" && SiegeTopography.defenderRallyPixelY)
            ? SiegeTopography.defenderRallyPixelY
            : H * 0.2;
        return _squareZoneAt("enemy", anchorX, anchorY);
    }
    if (window.inNavalBattle) {
        // BUGFIX: this used to return a bare static rectangle in open water
        // (minY:30 to H*0.30) with no shipRef and no type:"naval", unlike the
        // player branch above which locates the actual ship. That meant enemy
        // units during naval pre-deploy were clamped into a patch of ocean
        // instead of onto their ship's deck. Mirror the player lookup exactly:
        // find this side's ship in navalEnvironment.ships and build a
        // deck-relative zone from its real x/y/width/height, with shipRef set
        // so downstream deck-snap logic (_clampUnitToZone / _preDeployClampUnits)
        // has something to snap onto.
        const env  = window.navalEnvironment;
        const ship = (env && Array.isArray(env.ships)) ? env.ships.find(s => s.side === "enemy") : null;
        if (ship) {
            return {
                type: "naval",
                minX: ship.x - ship.width  * 0.45,
                maxX: ship.x + ship.width  * 0.45,
                minY: ship.y - ship.height * 0.45,
                maxY: ship.y + ship.height * 0.45,
                shipRef: ship
            };
        }
        return { type: "naval", minX: 60, maxX: W - 60, minY: 30, maxY: H * 0.30, shipRef: null };
    }
    // Land + river enemy zone: battleSpawnAssignment.enemy covers both
    // identically (see battlefield_launch.js — river rolls the same random
    // 4-corner assignment as land).
    // SURGERY: direction-aware — was hardcoded to a band along the top edge.
    return _deployZoneForSide("enemy");
}

// SURGERY: shared square-builder. Both _deployZoneForSide (land/river,
// anchor = this side's rolled corner/edge spawn point) and the siege branches
// above (anchor = the fixed camp/plaza point) funnel through this so every
// battle type gets the same ~400x400 (CFG.DEPLOY_ZONE_SIZE) box, clipped to
// stay margin px off the world edge (the "abyss") on every side.
function _squareZoneAt(type, anchorX, anchorY) {
    const { W, H } = _worldDims();
    const margin = 60;
    const half = CFG.DEPLOY_ZONE_SIZE / 2;

    // Clamp the CENTER first so the box doesn't get pushed off-map, then
    // clip the edges to the margin as a second safety pass — handles maps
    // narrower than DEPLOY_ZONE_SIZE + margin*2 without collapsing to zero.
    const cx = Math.max(margin + half, Math.min(W - margin - half, anchorX));
    const cy = Math.max(margin + half, Math.min(H - margin - half, anchorY));

    return {
        type: type,
        minX: Math.max(margin, cx - half),
        maxX: Math.min(W - margin, cx + half),
        minY: Math.max(margin, cy - half),
        maxY: Math.min(H - margin, cy + half)
    };
}

// SURGERY: shared helper for land/river player+enemy zones. Centers a
// DEPLOY_ZONE_SIZE square on whichever of the 8 spawn positions this side
// drew (battleSpawnAssignment[side].ax/ay) instead of hugging a band along
// the map's fixed top/bottom edge. Falls back to the old edge-of-map
// default if the spawn assignment isn't ready yet for some reason.
function _deployZoneForSide(side) {
    const geo = window.battleSpawnAssignment && window.battleSpawnAssignment[side];

    if (!geo) {
        const { W, H } = _worldDims();
        return side === "player"
            ? _squareZoneAt("land",  W / 2, H - 100)
            : _squareZoneAt("enemy", W / 2, 100);
    }

    return _squareZoneAt(side === "player" ? "land" : "enemy", geo.ax, geo.ay);
}

// ============================================================================
//  PLAYER COMPOSITION  &  ENEMY FORMATION CHOICE
// ============================================================================
function _analyzePlayerComposition() {
    if (!window.battleEnvironment || !Array.isArray(window.battleEnvironment.units)) return null;
    const players = window.battleEnvironment.units.filter(u => u.side === "player" && !u.isCommander && u.hp > 0);
    if (!players.length) return null;
    const tally = { INFANTRY: 0, CAVALRY: 0, RANGED: 0, GUNPOWDER: 0, SHIELD: 0 };
    for (const u of players) {
        const role = (typeof window.getTacticalRole === "function") ? window.getTacticalRole(u) : "INFANTRY";
        tally[role] = (tally[role] || 0) + 1;
    }
    const total = players.length;
    return {
        total, tally,
        cavalryPct:  (tally.CAVALRY  || 0) / total,
        rangedPct:   ((tally.RANGED  || 0) + (tally.GUNPOWDER || 0)) / total,
        infantryPct: ((tally.INFANTRY|| 0) + (tally.SHIELD    || 0)) / total
    };
}

function _chooseEnemyFormation(comp) {
    if (!comp) return { id: "standard_line", name: "Standard Line" };
    const options = [];
    if (comp.cavalryPct >= 0.25) {
        options.push({ id: "shield_wall",    name: "Shield Wall",    weight: 3 });
        options.push({ id: "wedge",          name: "Cavalry Wedge",  weight: 1 });
    }
    if (comp.rangedPct >= 0.30) {
        options.push({ id: "wedge",          name: "Cavalry Wedge",  weight: 3 });
        options.push({ id: "refused_flank",  name: "Refused Flank",  weight: 2 });
    }
    if (comp.infantryPct >= 0.50) {
        options.push({ id: "skirmish_screen", name: "Skirmish Screen", weight: 2 });
        options.push({ id: "refused_flank",   name: "Refused Flank",   weight: 1 });
    }
    options.push({ id: "standard_line", name: "Standard Line", weight: 3 });
    const total = options.reduce((s, o) => s + o.weight, 0);
    let r = Math.random() * total;
    for (const o of options) { r -= o.weight; if (r <= 0) return o; }
    return options[options.length - 1];
}

function _applyEnemyFormation(formationId) {
    if (window.inSiegeBattle || window.inNavalBattle) return;
    if (!window.battleEnvironment || !Array.isArray(window.battleEnvironment.units)) return;

    const enemies = window.battleEnvironment.units.filter(u => u.side === "enemy" && !u.isCommander && u.hp > 0);
    if (!enemies.length) return;

    const { W } = _worldDims();
    const ez = window.__enemyDeployZone || _calculateEnemyDeployZone();
    const centerX  = W / 2;
    const bandTop  = ez.minY;
    const bandBot  = ez.maxY;
    const bandMid  = (bandTop + bandBot) / 2;

    const role = (u) => (typeof window.getTacticalRole === "function") ? window.getTacticalRole(u) : "INFANTRY";
    const buckets = { CAVALRY: [], INFANTRY: [], RANGED: [], GUNPOWDER: [], SHIELD: [] };
    for (const u of enemies) {
        const r = role(u);
        if (!buckets[r]) buckets[r] = [];
        buckets[r].push(u);
    }
    const infantry = [...(buckets.SHIELD || []), ...(buckets.INFANTRY || [])];
    const ranged   = [...(buckets.RANGED || []), ...(buckets.GUNPOWDER || [])];
    const cavalry  = buckets.CAVALRY || [];

    const DX = 28, DY = 22;
    const placeRow  = (us, rowY, dx) => {
        if (!us.length) return;
        us.forEach((u, i) => {
            u.x = centerX + (i - (us.length - 1) / 2) * dx + (Math.random() - 0.5) * 5;
            u.y = rowY + (Math.random() - 0.5) * 6;
        });
    };
    const placeGrid = (us, ax, ay, cols, dx, dy) => {
        if (!us.length) return;
        us.forEach((u, i) => {
            const r = Math.floor(i / cols), c = i % cols;
            u.x = ax + (c - (cols - 1) / 2) * dx + (Math.random() - 0.5) * 4;
            u.y = ay + r * dy + (Math.random() - 0.5) * 4;
        });
    };

    switch (formationId) {
        case "shield_wall": {
            placeRow(infantry.slice(0, 30), bandBot - 15, DX * 0.72);
            placeRow(infantry.slice(30),    bandBot - 38, DX * 0.72);
            placeRow(ranged,                bandMid,      DX);
            placeRow(cavalry,               bandTop + 25, DX * 1.2);
            break;
        }
        case "wedge": {
            const apexY = bandBot - 20, baseY = bandTop + 30, span = apexY - baseY;
            cavalry.forEach((u, i) => {
                const t = cavalry.length > 1 ? i / (cavalry.length - 1) : 0.5;
                u.x = centerX + (Math.random() - 0.5) * (t * 160 + 10);
                u.y = apexY - t * span + (Math.random() - 0.5) * 6;
            });
            const h = Math.ceil(infantry.length / 2);
            placeGrid(infantry.slice(0, h), centerX - 220, bandMid, 4, DX, DY);
            placeGrid(infantry.slice(h),    centerX + 220, bandMid, 4, DX, DY);
            placeRow(ranged, baseY, DX);
            break;
        }
        case "refused_flank": {
            const line = [...infantry, ...ranged];
            line.forEach((u, i) => {
                const t = line.length > 1 ? (i / (line.length - 1)) - 0.5 : 0;
                u.x = centerX + t * Math.min(W * 0.55, line.length * DX);
                u.y = bandBot - 35 + t * 65;
            });
            placeGrid(cavalry, centerX - W * 0.30, bandMid - 10, 5, DX, DY);
            break;
        }
        case "skirmish_screen": {
            placeRow(ranged,   bandBot - 25, DX);
            placeRow(infantry, bandMid + 10, DX);
            placeRow(cavalry,  bandTop + 25, DX * 1.2);
            break;
        }
        case "standard_line":
        default: {
            placeRow(infantry, bandBot - 30, DX);
            placeRow(ranged,   bandMid,      DX);
            const leftC  = cavalry.slice(0, Math.ceil(cavalry.length / 2));
            const rightC = cavalry.slice(Math.ceil(cavalry.length / 2));
            placeGrid(leftC,  centerX - 300, bandMid + 25, 3, DX * 1.3, DY);
            placeGrid(rightC, centerX + 300, bandMid + 25, 3, DX * 1.3, DY);
            break;
        }
    }

    // Final clamp + freeze state
    enemies.forEach(u => {
        u.x = Math.max(ez.minX, Math.min(ez.maxX, u.x));
        u.y = Math.max(ez.minY, Math.min(ez.maxY, u.y));
        u.vx = 0; u.vy = 0;
        u.state = "idle";
        u.target = null;
        u.orderType = "hold_position";
        u.hasOrders = true;
        u.orderTargetPoint = null;
        u.formationTimer = 0;
        u.reactionDelay = 0;
        u.fleeing = false;
        u.isFleeing = false;
        if (typeof u.morale === "number") u.morale = Math.max(u.morale, 100);
    });
}

// ── Snap player units into the zone (esp. for siege) ─────────────────────────
function _snapPlayerUnitsIntoZone() {
    const z = window.__playerDeployZone;
    if (!z || !window.battleEnvironment || !Array.isArray(window.battleEnvironment.units)) return;

    const players = window.battleEnvironment.units.filter(u => u.side === "player" && !u.isCommander && u.hp > 0);
    if (!players.length) return;

    if (z.type === "naval") {
        for (const u of players) {
            if (typeof window.getNavalSurfaceAt === "function" &&
                window.getNavalSurfaceAt(u.x, u.y) !== "DECK" && z.shipRef) {
                u.x = z.shipRef.x + (Math.random() - 0.5) * z.shipRef.width  * 0.6;
                u.y = z.shipRef.y + (Math.random() - 0.5) * z.shipRef.height * 0.6;
            }
        }
        return;
    }

    if (z.type === "siege") {
        const { W } = _worldDims();
        const cols = Math.min(20, Math.ceil(Math.sqrt(players.length * 2)));
        const dx = Math.max(28, Math.min(40, (W - 200) / cols));
        const startX = (W - cols * dx) / 2 + dx / 2;
        players.forEach((u, i) => {
            if (u.siegeRole === "ladder_carrier" || u.siegeRole === "ram_crew" ||
                u.siegeRole === "treb_crew"      || u.siegeRole === "engine_crew") return;
            const r = Math.floor(i / cols), c = i % cols;
            u.x = startX + c * dx;
            u.y = z.maxY - 20 - r * 22;
            u.vx = 0; u.vy = 0;
        });
        return;
    }

    for (const u of players) {
        if (u.x < z.minX) u.x = z.minX;
        if (u.x > z.maxX) u.x = z.maxX;
        if (u.y < z.minY) u.y = z.minY + 10;
        if (u.y > z.maxY) u.y = z.maxY;
        u.vx = 0; u.vy = 0;
    }
}

// ============================================================================
//  ★ DEPRECATED in v4.1 — kept for reference only, never called ★
//  Previously replaced updateBattleUnits during pre-deploy.  See the v4.1
//  strategy note at the top of this file: pre-deploy unit freeze/clamp now
//  lives inline inside battlefield_logic.js's updateBattleUnits, so the
//  real engine code path runs and right-click moves actually work.
// ============================================================================
function _preDeployUpdateBattleUnits() {
    if (!window.battleEnvironment || !Array.isArray(window.battleEnvironment.units)) return;

    // ── Declare locals FIRST — avoids TDZ crash that silently killed the whole function ──
    // Previously `units` was used on line ~1135 in a for-loop BEFORE `const units = env.units`
    // was declared on line ~1145.  In strict-mode IIFEs this is a Temporal Dead Zone
    // ReferenceError, which the tick-patch try/catch swallows silently — meaning nothing
    // in this function ever executed: no commander movement, no troop movement, nothing.
    const env       = window.battleEnvironment;
    const units     = env.units;
    const playerObj = window.player;
    const keys      = (typeof window.keys !== "undefined") ? window.keys : {};

    // ── Promote fresh dummy targets → move_to_point ──────────────────────────
    // executeBoxFormationMove sets unit.target = { x, y, isDummy: true } but does NOT
    // set unit.orderType.  Without this promotion the _dest resolver below sees
    // orderType === "hold_position" and skips the walk block.
    // NOTE: we do NOT call processTacticalOrders() here.  During pre-deploy all
    // player non-commander units start as hold_position.  processTacticalOrders
    // responds to hold_position by nailing the unit to its current coordinates
    // (unit.x = safeAnchor.x, vx = 0) and overwriting the dummy target with an
    // anchor — exactly undoing whatever move order executeBoxFormationMove just set.
    // Skipping it is correct: enemy units are frozen by the ABSOLUTE STILLNESS
    // block below regardless, and player units only need the dummy-promotion below.
    for (var _fi = 0; _fi < units.length; _fi++) {
        var _fu = units[_fi];
        if (_fu && _fu.hp > 0 && _fu.side === 'player' && !_fu.isCommander &&
            _fu.target && _fu.target.isDummy && !_fu.target.isAnchor &&
            _fu.orderType !== 'move_to_point') {
            _fu.orderType = 'move_to_point';
        }
    }

    for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        if (!unit || unit.hp <= 0) continue;

        // ── ENEMY: ABSOLUTE STILLNESS ──────────────────────────────────
        if (unit.side === "enemy") {
            unit.vx = 0;
            unit.vy = 0;
            unit.target = null;
            unit.orderType = "hold_position";
            unit.hasOrders = true;
            unit.orderTargetPoint = null;
            unit.state = "idle";
            unit.reactionDelay = 0;
            unit.formationTimer = 0;
            unit.fleeing = false;
            unit.isFleeing = false;
            if (typeof unit.morale === "number") unit.morale = Math.max(unit.morale, 100);
            // Bleed cooldown so they're ready when battle commences
            if (unit.cooldown > 0) unit.cooldown--;
            continue;
        }

        // ── PLAYER COMMANDER: keyboard movement enabled ────────────────
        if (unit.disableAICombat && unit.isCommander) {
            if (unit.cooldown > 0) unit.cooldown--;
            if (window.AICategories && typeof window.AICategories.handlePlayerOverride === "function") {
                try {
                    window.AICategories.handlePlayerOverride(unit, units, keys, env, playerObj);
                } catch (e) { /* swallow */ }
            }
            continue;
        }

        // ── PLAYER NON-COMMANDER: process ONLY move_to_point ────────────
        // Suppress everything else: morale, fleeing, auto-targeting, combat.
        unit.fleeing = false;
        unit.isFleeing = false;
        if (typeof unit.morale === "number") unit.morale = Math.max(unit.morale, 100);

        // Strip non-movement orders & enemy targets
        const allowed = ["move_to_point", "hold_position", "follow"];
        if (allowed.indexOf(unit.orderType) === -1) {
            unit.orderType = "hold_position";
            unit.target = null;
            unit.hasOrders = true;
            unit.orderTargetPoint = null;
        }
        if (unit.target && !unit.target.isDummy) {
            unit.target = null;
        }

        // Resolve destination: prefer orderTargetPoint (BLS internal), fall back to dummy
        // target (the contract used by executeBoxFormationMove in battlefield_commands.js).
        // executeBoxFormationMove sets unit.target = { x, y, isDummy: true } and leaves
        // orderTargetPoint null — so without this fallback nothing ever moves pre-deploy.
        const _dest = unit.orderTargetPoint ||
            (unit.orderType === "move_to_point" && unit.target && unit.target.isDummy
                ? { x: unit.target.x, y: unit.target.y }
                : null);

        // Process move_to_point: walk toward the resolved destination
        if (unit.orderType === "move_to_point" && _dest) {
            const dest = _dest;
            const dx = dest.x - unit.x;
            const dy = dest.y - unit.y;
            const dist = Math.hypot(dx, dy);

            if (dist < 12) {
                // Arrived
                unit.x = dest.x;
                unit.y = dest.y;
                unit.vx = 0;
                unit.vy = 0;
                unit.state = "idle";
                unit.target = { x: unit.x, y: unit.y, hp: 9999, isDummy: true, isAnchor: true };
                unit.orderType = "hold_position";
                unit.orderTargetPoint = null;
            } else {
                // Walk
                const speed = (unit.speed || (unit.stats && unit.stats.speed) || 1.4);
                const step  = Math.min(speed, dist);
                unit.vx = (dx / dist) * step;
                unit.vy = (dy / dist) * step;
                unit.x += unit.vx;
                unit.y += unit.vy;
                unit.state = "moving";
                // Direction flip for sprite
                if (Math.abs(dx) > 1) unit.direction = dx > 0 ? 1 : -1;
                // Maintain dummy target so processAction-equivalent logic is satisfied
                unit.target = {
                    x: dest.x, y: dest.y, hp: 9999, isDummy: true, side: unit.side,
                    stats: { meleeDefense: 0, armor: 0, health: 100 }
                };
            }
        } else {
            // Hold position — settle
            unit.vx *= 0.4;
            unit.vy *= 0.4;
            if (Math.abs(unit.vx) < 0.01) unit.vx = 0;
            if (Math.abs(unit.vy) < 0.01) unit.vy = 0;
            unit.state = "idle";
        }

        // Bleed cooldown
        if (unit.cooldown > 0) unit.cooldown--;
    }

    // Apply collisions ONLY among player units (so they don't stack)
    // Enemy units have vx=vy=0 set every frame, so collisions won't push them.
    if (typeof window.applyUnitCollisions === "function") {
        try { window.applyUnitCollisions(units); } catch (e) { /* swallow */ }
    }
}

// ── Post-frame clamp: keep every player unit + commander inside the zone ────
function _preDeployClampUnits() {
    if (!window.battleEnvironment || !Array.isArray(window.battleEnvironment.units)) return;
    const units = window.battleEnvironment.units;
    const z  = window.__playerDeployZone;
    const ez = window.__enemyDeployZone;
    // FOLLOW-UP FIX: previously bailed out entirely (skipping BOTH sides'
    // clamping) if z was null. Enemy clamping has no logical dependency on
    // the player zone existing — the two are handled independently below —
    // so a missing/late player zone shouldn't also silently disable the
    // enemy clamp. Each branch now checks its own zone only.

    for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!u || u.hp <= 0) continue;

        if (u.side === "player" && !u.isCommander && z) {
            _clampUnitToZone(u, z);
        } else if (u.side === "enemy" && ez) {
            // BUGFIX: was a bare min/max clamp regardless of ez.type, so a
            // naval-type ez (once it started carrying shipRef, see the fix
            // in _calculateEnemyDeployZone above) would still be ignored —
            // this branch never checked getNavalSurfaceAt or snapped onto
            // the deck, it just boxed enemy units into raw x/y coordinates.
            // Route through the same _clampUnitToZone the player branch
            // uses so ez.type === "naval" actually gets deck-snap behavior.
            _clampUnitToZone(u, ez);
        }
    }

    if (!z) return;

    // Commander handle (player.x/y)
    if (window.player) {
        if (z.type !== "naval") {
            if (window.player.x < z.minX) window.player.x = z.minX;
            if (window.player.x > z.maxX) window.player.x = z.maxX;
            if (window.player.y < z.minY) window.player.y = z.minY;
            if (window.player.y > z.maxY) window.player.y = z.maxY;
        } else if (z.shipRef && typeof window.getNavalSurfaceAt === "function") {
            if (window.getNavalSurfaceAt(window.player.x, window.player.y) === "WATER") {
                window.player.x = z.shipRef.x;
                window.player.y = z.shipRef.y;
            }
        }
    }
}

function _clampUnitToZone(u, z) {
    if (z.type === "naval") {
        if (typeof window.getNavalSurfaceAt === "function" &&
            window.getNavalSurfaceAt(u.x, u.y) !== "DECK" && z.shipRef) {
            const dx = z.shipRef.x - u.x;
            const dy = z.shipRef.y - u.y;
            const d  = Math.hypot(dx, dy);
            if (d > 0.5) { u.x += (dx / d) * 6; u.y += (dy / d) * 6; }
            u.vx = 0; u.vy = 0;
        }
        return;
    }
    if (z.type === "river") {
        if (typeof window.getNavalSurfaceAt === "function" &&
            window.getNavalSurfaceAt(u.x, u.y) === "WATER") {
            u.y += 4; u.vy = 0;
        }
    }
    if (u.x < z.minX) { u.x = z.minX; u.vx = 0; }
    if (u.x > z.maxX) { u.x = z.maxX; u.vx = 0; }
    if (u.y < z.minY) { u.y = z.minY; u.vy = 0; }
    if (u.y > z.maxY) { u.y = z.maxY; u.vy = 0; }
}

// ============================================================================
//  VISUAL DEPLOY ZONE OVERLAY  (painted AFTER main draw)
// ============================================================================
function _drawDeployZoneOverlay() {
    const canvas = document.getElementById("gameCanvas") || document.querySelector("canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const z  = window.__playerDeployZone;
    const ez = window.__enemyDeployZone;
    if (!z) return;

    const zoom = _safeNumber(window.zoom, 1);
    const camX = (window.player && typeof window.player.x === "number") ? window.player.x : 0;
    const camY = (window.player && typeof window.player.y === "number") ? window.player.y : 0;
    const cw = canvas.width, ch = canvas.height;
    const w2s = (wx, wy) => ({ x: (wx - camX) * zoom + cw / 2, y: (wy - camY) * zoom + ch / 2 });

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (ez && z.type !== "naval") {
        const etl = w2s(ez.minX, ez.minY);
        const ebr = w2s(ez.maxX, ez.maxY);
        ctx.fillStyle = "rgba(255,70,70,0.06)";
        ctx.fillRect(etl.x, etl.y, ebr.x - etl.x, ebr.y - etl.y);
        // SURGERY: removed the single dashed bottom-edge line — it was drawn
        // on only ONE edge (front-line marker toward the player), which made
        // the enemy zone look cosmetically different from the player zone
        // below (which had its own single dashed edge on a different side).
        // Fill-only now, consistent on both sides. Per direct request, not
        // the black-abyss dashed lines elsewhere — those are untouched.
    }

    if (z.type === "naval") {
        const tl = w2s(z.minX, z.minY);
        const br = w2s(z.maxX, z.maxY);
        ctx.strokeStyle = "rgba(245,215,110,0.55)";
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 6]);
        ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
        ctx.fillStyle = "rgba(245,215,110,0.05)";
        ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    } else {
        const tl = w2s(z.minX, z.minY);
        const br = w2s(z.maxX, z.maxY);
        ctx.fillStyle = "rgba(80,170,255,0.08)";
        ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
        // SURGERY: removed the single dashed top-edge line — see matching
        // note on the enemy zone above. Fill-only now.
    }
    ctx.setLineDash([]);
    ctx.restore();
}

// ============================================================================
//  AUTO-ATTACK + LAZY GENERAL DISABLE
// ============================================================================
function _disableAutoAttackForDeploy() {
    if (typeof window.stopLazyGeneral === "function") {
        try { window.stopLazyGeneral(); } catch (e) {}
    }
    const autoBtn = document.getElementById("mc3-lazy-auto");
    if (autoBtn) autoBtn.classList.add("bls-deploy-disabled");
    const manualBtn = document.getElementById("mc3-manual-override");
    if (manualBtn) manualBtn.classList.add("bls-deploy-disabled");
}

function _enableAutoAttackAfterDeploy() {
    const autoBtn = document.getElementById("mc3-lazy-auto");
    if (autoBtn) autoBtn.classList.remove("bls-deploy-disabled");
    const manualBtn = document.getElementById("mc3-manual-override");
    if (manualBtn) manualBtn.classList.remove("bls-deploy-disabled");
}

// ============================================================================
//  ★ v4.2 IDLE WANDER  ★
//  During pre-deploy, units that are still in hold_position with no player-
//  issued order are gently jostled around inside the deploy zone — a few of
//  them, every couple of seconds, by a tiny offset.  Looks like soldiers
//  shifting weight, adjusting shields, chatting to each other.
//  The moment the player issues a real order (executeBoxFormationMove sets
//  orderType="move_to_point"), wander leaves that unit alone — and once the
//  unit returns to "hold_position" via the arrive-and-anchor cycle in
//  processTacticalOrders, it becomes eligible to fidget again.
//
//  Stops entirely on commence battle.
// ============================================================================
let _wanderInterval = null;

function _startIdleWander() {
    if (_wanderInterval) clearInterval(_wanderInterval);
    _wanderInterval = setInterval(() => {
        if (!window.__preDeploymentActive) {
            _stopIdleWander();
            return;
        }
        const env = window.battleEnvironment;
        const z   = window.__playerDeployZone;
        if (!env || !Array.isArray(env.units) || !z || z.type === "naval") return;

        // Eligible units: player non-commander, alive, currently NOT actively
        // moving under a real player order. Two cases qualify as "idle":
        //   1. orderType === "hold_position" (the BLS-imposed default)
        //   2. orderType === "move_to_point" AND target is an isAnchor dummy
        //      (engine's "I've arrived and settled" state — see
        //      processTacticalOrders lines ~687-728 in battlefield_commands.js)
        // A unit actively traveling to a player-issued waypoint has a non-anchor
        // dummy target (just isDummy:true) and is excluded.
        const eligible = env.units.filter(u => {
            if (!u || u.hp <= 0) return false;
            if (u.side !== "player" || u.isCommander || u.disableAICombat) return false;
            if (u.orderType === "hold_position") return true;
            if (u.orderType === "move_to_point" && u.target && u.target.isAnchor) return true;
            return false;
        });
        if (!eligible.length) return;

        // Pick ~12% of eligible units to fidget this tick (min 1, max 6).
        const count = Math.max(1, Math.min(6, Math.round(eligible.length * 0.12)));
        for (let i = 0; i < count; i++) {
            const u = eligible[Math.floor(Math.random() * eligible.length)];
            if (!u) continue;
            // Random nudge: 20-60px from current position, in any direction.
            const angle = Math.random() * Math.PI * 2;
            const dist  = 20 + Math.random() * 40;
            let tx = u.x + Math.cos(angle) * dist;
            let ty = u.y + Math.sin(angle) * dist;
            // Clamp to deploy zone with a small inset so they don't walk into the edge.
            const inset = 12;
            tx = Math.max(z.minX + inset, Math.min(z.maxX - inset, tx));
            ty = Math.max(z.minY + inset, Math.min(z.maxY - inset, ty));
            // Issue a move order via the engine's normal pathway: orderType +
            // orderTargetPoint.  processTacticalOrders will turn this into a
            // dummy target, processAction will walk them.  When they arrive
            // (dist < stopDistance) they auto-return to hold_position via the
            // engine's natural arrival logic, becoming eligible to fidget again.
            u.hasOrders        = true;
            u.orderType        = "move_to_point";
            u.orderTargetPoint = { x: tx, y: ty };
            u.formationTimer   = 30;        // brief reorient window
            u.reactionDelay    = 0;
            u.__blsWander      = true;      // tag so we can clean up on commence
        }
    }, 2200); // every ~2.2 seconds — sparse enough to feel natural
}

function _stopIdleWander() {
    if (_wanderInterval) {
        clearInterval(_wanderInterval);
        _wanderInterval = null;
    }
}

// ============================================================================
//  PRE-BATTLE SOLDIER CHATTER   (player troops only, land/river/naval)
// ----------------------------------------------------------------------------
//  Cosmetic bubble mechanics are adapted from city_dialogue_system.js
//  (state.bubbles / showSpeech / render / wrapText / roundRect), but redrawn
//  through THIS file's OWN world->screen conversion -- the same w2s() trick
//  _drawDeployZoneOverlay() uses just above. city_dialogue_system.js's
//  render() deliberately does NOT reset the canvas transform because it's
//  called from inside city_system.js's already-camera-translated draw pass;
//  this file has no such pass of its own -- _installDrawPatch() below runs
//  AFTER the real draw() call, with a fresh untransformed context -- so
//  bubbles have to convert each speaker's world x/y to screen space
//  themselves, exactly like the deploy-zone overlay already does.
//
//  Line SELECTION is a new system, not a copy of either city one:
//    - NOT city_conversation_engine.js's scripted two-NPC back-and-forth --
//      a deploy zone full of your own troops is a crowd murmuring, not a
//      pair having a conversation.
//    - Modeled on RandomDialogue.js's shape instead: classify the speaker
//      (here: tactical role + current battle type) and pick a fresh,
//      not-recently-used line from that pool via a per-unit WeakMap
//      history -- same anti-repeat trick RandomDialogue.js's pickFresh()
//      uses.
//  Only ever fires for side === "player" -- enemy troops stay silent here.
// ============================================================================
const CHATTER_CFG = {
    maxConcurrent:     4,     // bubbles allowed on screen at once                   // <<<<
    minIntervalMs:     1400,  // fastest gap between two NEW lines firing            // <<<<
    maxIntervalMs:     3200,  // slowest gap between two NEW lines firing            // <<<<
    bubbleDurationMs:  4200,  // how long a single bubble stays up                   // <<<<
    perUnitCooldownMs: 9000,  // a unit that just spoke won't speak again this soon  // <<<<
    speakRadius:       900    // world-units from the player unit can be picked from // <<<<
};

const CHATTER_LINES = {
    universalLand: [
        "Stand steady. Fear passes; shame lingers.",
        "My hands haven't stopped shaking since dawn.",
        "Say a prayer to whichever god still owes you a favor.",
        "I've buried enough friends. Not today.",
        "Keep your eyes on the banners, not the enemy line.",
        "Cold hands, cold blade. At least the weather agrees with me.",
        "Whatever happens, don't break formation for me.",
        "Grandfather fought at a crossing like this one. Never talked about it much.",
        "Breathe. The waiting is worse than the fighting ever is.",
        "Just get through the first charge. The rest takes care of itself."
    ],
    universalNaval: [
        "Check your footing — the deck gets slick once the shouting starts.",
        "I'd rather drown fighting than drown running.",
        "Mind the ropes, or the ropes will mind you.",
        "Wind's picking up. Good. Let it carry us into them.",
        "Salt in every wound out here, one way or another.",
        "Keep low till the grapples are thrown.",
        "My uncle always said the sea forgives nothing.",
        "Timbers are creaking louder than my nerves, and that's saying something.",
        "First one aboard drinks free tonight — if there is a tonight.",
        "Watch the tide as much as the enemy hull."
    ],
    roleLand: {
        CAVALRY: [
            "Give the horse her head once we're past the charge line.",
            "She's spooked. So am I. We'll manage together.",
            "Nothing outruns a lance point but another horse.",
            "Keep the line tight — a scattered charge is just a funeral procession.",
            "My mare's seen more battles than half this camp."
        ],
        INFANTRY: [
            "Shield up, feet planted — that's the whole trick.",
            "Shoulder to shoulder, or not at all.",
            "My arms remember this even when my mind wants to forget.",
            "The line holds if we hold it. Simple as that.",
            "One step back today is ten steps back tomorrow."
        ],
        RANGED: [
            "Count your arrows twice. You won't get a third chance to.",
            "Wind's from the west — mind your arc.",
            "String's dry, hands are steady. Good enough.",
            "I'll loose till my quiver's empty or my arm falls off, whichever's first.",
            "Front line gets the glory. We get the kill count."
        ],
        GUNPOWDER: [
            "Keep the powder dry, keep your head dryer.",
            "One spark too many and we won't need the enemy's help.",
            "Load slow, aim slower, live longer.",
            "That smell never gets less foul. Or less satisfying.",
            "Fire in volleys — one gun barks, the rest stay silent for nothing."
        ],
        SHIELD: [
            "Lock shields, lads. Let them break on us like water on rock.",
            "My arm's numb already and we haven't even started.",
            "Behind this board I've outlived better men than me.",
            "The wall doesn't move unless I do. So it isn't moving.",
            "Paint's chipped, wood's dented — still stops a blade just fine."
        ]
    },
    roleNaval: {
        CAVALRY: [
            "The horses hate this even more than I do.",
            "No charging on deck — keep her calm till we make landfall.",
            "A horse that doesn't buck in a swell is worth more than gold.",
            "We'll ride once there's ground beneath us again.",
            "Careful — a spooked horse does more damage than the enemy will."
        ],
        INFANTRY: [
            "Deck's narrower than any battlefield I've stood on.",
            "Boarding's just another shield wall, sideways.",
            "Feet apart, knees loose — fight the roll of the ship first.",
            "Wood under my boots instead of dirt. Strange, but I'll manage.",
            "When the planks drop, don't hesitate. Hesitation drowns."
        ],
        RANGED: [
            "Aim low on a rolling deck — the swell throws every shot high.",
            "Wet bowstrings are useless. Keep yours under your cloak.",
            "Once they're grappled close, there's no missing.",
            "Never loosed an arrow over open water before today.",
            "Watch the rail — I don't fancy fishing my own arrows back out."
        ],
        GUNPOWDER: [
            "Powder and seawater don't mix. Neither do powder and carelessness.",
            "Keep the fuse away from the spray.",
            "One good volley across their deck beats a hundred blades.",
            "This is a floating powder keg. Try not to forget that.",
            "Load fast — the sea doesn't wait for reloading."
        ],
        SHIELD: [
            "Shield wall on a rocking deck — this ought to be interesting.",
            "Lock up at the rail. That's where they'll try to come aboard.",
            "The board doesn't care if the ground is wood or dirt.",
            "Brace wide. The ship moves under you whether you like it or not.",
            "First to the boarding point holds the line for the rest."
        ]
    }
};

const chatterState = {
    bubbles: [],                   // { text, npcRef, expiresAt }
    nextFireAt: 0,
    historyByUnit: new WeakMap()   // per-unit anti-repeat, RandomDialogue.js-style
};

function _chatterPoolFor(unit) {
    const role  = (typeof window.getTacticalRole === "function") ? window.getTacticalRole(unit) : "INFANTRY";
    const naval = !!window.inNavalBattle;
    const universal    = naval ? CHATTER_LINES.universalNaval : CHATTER_LINES.universalLand;
    const roleSpecific = (naval ? CHATTER_LINES.roleNaval : CHATTER_LINES.roleLand)[role] || [];
    return universal.concat(roleSpecific);
}

function _pickFreshChatterLine(unit) {
    const pool = _chatterPoolFor(unit);
    if (!pool.length) return null;

    let seen = chatterState.historyByUnit.get(unit);
    if (!seen) { seen = []; chatterState.historyByUnit.set(unit, seen); }

    const maxSeen = Math.max(1, Math.floor(pool.length / 2));
    const fresh   = pool.filter(line => seen.indexOf(line) === -1);
    const source  = fresh.length ? fresh : pool;
    const chosen  = source[Math.floor(Math.random() * source.length)];

    seen.push(chosen);
    if (seen.length > maxSeen) seen.shift();
    return chosen;
}

function _onChatterCooldown(u) {
    const last = u.__preBattleChatterAt || 0;
    return (performance.now() - last) < CHATTER_CFG.perUnitCooldownMs;
}

function _updatePreBattleChatter() {
    const now = performance.now();
    chatterState.bubbles = chatterState.bubbles.filter(b => now < b.expiresAt);

    if (chatterState.bubbles.length >= CHATTER_CFG.maxConcurrent) return;
    if (now < chatterState.nextFireAt) return;
    if (!window.battleEnvironment || !Array.isArray(window.battleEnvironment.units)) return;

    const speaking = new Set(chatterState.bubbles.map(b => b.npcRef));
    const p  = window.player;
    const px = (p && typeof p.x === "number") ? p.x : null;
    const py = (p && typeof p.y === "number") ? p.y : null;

    const candidates = window.battleEnvironment.units.filter(u => {
        if (!u || u.side !== "player" || u.isCommander || u.hp <= 0) return false;
        if (speaking.has(u) || _onChatterCooldown(u)) return false;
        if (px !== null && py !== null && Math.hypot(u.x - px, u.y - py) > CHATTER_CFG.speakRadius) return false;
        return true;
    });
    if (!candidates.length) return;

    const speaker = candidates[Math.floor(Math.random() * candidates.length)];
    const text    = _pickFreshChatterLine(speaker);
    if (!text) return;

    chatterState.bubbles.push({ text: text, npcRef: speaker, expiresAt: now + CHATTER_CFG.bubbleDurationMs });
    speaker.__preBattleChatterAt = now;

    if (typeof window.cityTTSEngine !== "undefined" && window.player) {
        try { window.cityTTSEngine.speakSpatial(text, speaker, window.player); } catch (e) {}
    }

    chatterState.nextFireAt = now + CHATTER_CFG.minIntervalMs +
        Math.random() * (CHATTER_CFG.maxIntervalMs - CHATTER_CFG.minIntervalMs);
}

function _startPreBattleChatter() {
    chatterState.bubbles = [];
    chatterState.nextFireAt = performance.now() + 300; // small breath before the first line
}

function _stopPreBattleChatter() {
    chatterState.bubbles = [];
    // Cuts the TTS queue too -- without this, lines queued right before
    // COMMENCE (speakSpatial deliberately never cancels the queue, so the
    // crowd talks over each other in order) would keep playing out loud
    // into live combat, well after their bubbles and the whole pre-deploy
    // HUD are already gone.
    if (typeof window.cityTTSEngine !== "undefined" && window.cityTTSEngine.stopAll) {
        try { window.cityTTSEngine.stopAll(); } catch (e) {}
    }
}

function _chatterWrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";
    for (const word of words) {
        const test = line ? (line + " " + word) : word;
        if (line && ctx.measureText(test).width > maxWidth) {
            lines.push(line);
            line = word;
        } else {
            line = test;
        }
    }
    if (line) lines.push(line);
    return lines;
}

function _chatterRoundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function _drawPreBattleBubbles() {
    if (!chatterState.bubbles.length) return;
    const canvas = document.getElementById("gameCanvas") || document.querySelector("canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Same world->screen conversion as _drawDeployZoneOverlay() above --
    // this runs in the same post-draw pass, on a context with no camera
    // transform applied, so it has to do that conversion itself.
    const zoom = _safeNumber(window.zoom, 1);
    const camX = (window.player && typeof window.player.x === "number") ? window.player.x : 0;
    const camY = (window.player && typeof window.player.y === "number") ? window.player.y : 0;
    const cw = canvas.width, ch = canvas.height;
    const w2s = (wx, wy) => ({ x: (wx - camX) * zoom + cw / 2, y: (wy - camY) * zoom + ch / 2 });

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = "bold 10px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const now = performance.now();
    for (const bubble of chatterState.bubbles) {
        if (now > bubble.expiresAt || !bubble.npcRef) continue;

        const screenPos = w2s(bubble.npcRef.x, bubble.npcRef.y);
        const maxTextWidth = 110;
        const lines = _chatterWrapText(ctx, bubble.text, maxTextWidth);

        const paddingX = 6, paddingY = 5, lineHeight = 13;
        let maxLineWidth = 0;
        for (const l of lines) {
            const w = ctx.measureText(l).width;
            if (w > maxLineWidth) maxLineWidth = w;
        }

        const bubbleWidth  = Math.min(maxTextWidth, maxLineWidth) + paddingX * 2;
        const bubbleHeight = lines.length * lineHeight + paddingY * 2;

        const bottomY = screenPos.y - 32;
        const topY    = bottomY - bubbleHeight;
        const leftX   = screenPos.x - bubbleWidth / 2;

        ctx.fillStyle   = "rgba(255,255,255,0.92)";
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth   = 1;
        _chatterRoundRect(ctx, leftX, topY, bubbleWidth, bubbleHeight, 6);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(screenPos.x - 4, bottomY);
        ctx.lineTo(screenPos.x + 4, bottomY);
        ctx.lineTo(screenPos.x, bottomY + 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#111111";
        let currentY = topY + paddingY;
        for (const l of lines) {
            ctx.fillText(l, screenPos.x, currentY);
            currentY += lineHeight;
        }
    }

    ctx.restore();
}

// ============================================================================
//  ENTER PRE-DEPLOYMENT
// ============================================================================
function _enterPreDeployment() {
    console.log("[BLS] Entering Pre-Deployment.");
    window.__preDeploymentActive  = true;
    window.__battleCullingEnabled = false;
    // SURGERY: __battleLoadingActive drives _installDrawPatch's black-fill +
    // "Loading..." spinner (see draw() below) — it was previously only ever
    // cleared by _launchDirectly() or _commenceBattle(). Now that this
    // function runs instead of _launchDirectly() as the loading-gate
    // callback, nothing cleared it here, so the canvas stayed black-filled
    // with the spinner drawn on top for the ENTIRE pre-deploy phase (the
    // real battlefield + deploy zone overlay never got a chance to render
    // until COMMENCE). Clear it now so draw() falls through to the real
    // render + _drawDeployZoneOverlay() the very next frame.
    window.__battleLoadingActive  = false;

    // Stop enemy tactical AI for the whole pre-deploy duration
    if (typeof window.EnemyTacticalAI !== "undefined" && window.EnemyTacticalAI.stop) {
        try { window.EnemyTacticalAI.stop(); } catch (e) {}
    }
    if (typeof window.stopLazyGeneral === "function") {
        try { window.stopLazyGeneral(); } catch (e) {}
    }

    // Compute zones
    window.__playerDeployZone = _calculatePlayerDeployZone();
    window.__enemyDeployZone  = _calculateEnemyDeployZone();

    // Snap player units into zone (siege especially)
    _snapPlayerUnitsIntoZone();

    // Reset all player non-commander units to hold_position with NO target.
    // enterBattlefield previously set every unit to seek_engage — that would make
    // them try to charge the enemy the moment pre-deploy starts.  We want them
    // to stand still in the deploy zone until the player drag-boxes them somewhere.
    //
    // With the new v4.1 strategy (real updateBattleUnits runs during pre-deploy),
    // hold_position is the correct order:
    //   • processTacticalOrders sees hold_position + no nearest enemy in range → nails them in place
    //   • when player right-click-drags, executeBoxFormationMove sets
    //     orderType = "move_to_point" + orderTargetPoint = {x,y}
    //   • next frame processTargeting returns early (move_to_point is in its skip list)
    //   • processAction sees orderType === "move_to_point" + dummy target → calls _handleMovement
    //   • unit walks to destination using REAL movement code
    // The clamp inside battlefield_logic.js then keeps them inside __playerDeployZone.
    if (window.battleEnvironment && Array.isArray(window.battleEnvironment.units)) {
        window.battleEnvironment.units.forEach(u => {
            if (!u || u.hp <= 0 || u.side !== "player" || u.isCommander || u.disableAICombat) return;
            u.orderType        = "hold_position";
            u.orderTargetPoint = null;
            u.target           = null;
            u.hasOrders        = true;
            u.selected         = false;   // ★ v4.2: strip selection so lazy general can't grab them
            u.vx               = 0;
            u.vy               = 0;
            u.state            = "idle";
            u.fleeing          = false;
            u.isFleeing        = false;
            u.formationTimer   = 0;
            u.reactionDelay    = 0;
        });
    }

    // Choose & apply ONE enemy formation based on PLAYER composition
    const comp      = _analyzePlayerComposition();
    const formation = _chooseEnemyFormation(comp);
    window.__chosenEnemyFormation = formation;
    _applyEnemyFormation(formation.id);

    // Disable auto-attack / lazy general
    _disableAutoAttackForDeploy();

    // Show HUD
    _showPreDeployHUD(formation.name);

    // ★ v4.2: Start the idle-wander interval (units fidget randomly while waiting for orders)
    _startIdleWander();

    // Start ambient pre-battle chatter bubbles (player troops only)
    _startPreBattleChatter();

    // Clear ghost keys
    if (window.keys) for (const k in window.keys) window.keys[k] = false;
    console.log("[BLS] Enemy formation:", formation.name, "| player comp:", comp);
}

// ============================================================================
//  COMMENCE BATTLE
// ============================================================================
function _commenceBattle() {
    if (!window.__preDeploymentActive) return;
    console.log("[BLS] COMMENCE BATTLE.");

    _hidePreDeployHUD();

    // Lift gates BEFORE restoring unit state so the next updateBattleUnits
    // tick runs the real (not the pre-deploy stub) function.
    window.__preDeploymentActive  = false;
    window.__battleLoadingActive  = false;
    window.__battleCullingEnabled = true;

    // ★ v4.2: stop the idle-wander interval immediately
    _stopIdleWander();

    // Hard-stop pre-battle chatter -- clears any lingering bubbles and cuts
    // the TTS queue so lines queued right before COMMENCE don't keep
    // talking out loud into live combat.
    _stopPreBattleChatter();

    if (window.battleEnvironment && Array.isArray(window.battleEnvironment.units)) {
        for (const u of window.battleEnvironment.units) {
            if (!u || u.hp <= 0) continue;
            u.cooldown      = Math.min(u.cooldown || 0, 60);
            u.reactionDelay = 0;
            u.formationTimer = u.formationTimer || 0;
            delete u.__blsWander;   // clean up wander tag

            if (u.side === "enemy") {
                // ★ v4.2.6: SYMMETRIC FIX — same logic as player units below.
                // Before the deployment-zone work, both sides got their AI from
                // the engine's normal flow (processTargeting → processAction).
                // When pre-deploy was introduced, ally units froze too — the
                // fix was to give them seek_engage on COMMENCE so processTargeting
                // would acquire targets and processAction would drive movement.
                //
                // Enemies were left with orderType=null, expecting EnemyTacticalAI
                // to take over. But EnemyTacticalAI's first action (executeAdvancing
                // with skipForming) sets orderType="move_to_point" + dummy target,
                // which is in processTargeting's SKIP LIST. So enemies never scan
                // for real targets, never engage, and only the AI's 500ms heartbeat
                // can drive them — fragile, easy to freeze.
                //
                // Fix: give enemies seek_engage too. processTargeting will now
                // scan for nearest player unit, set target, and processAction will
                // drive movement/combat exactly like player units. EnemyTacticalAI
                // still starts below as a tactical layer for formations/charge
                // timing, but the underlying engine AI keeps them alive even if
                // the tactical heartbeat hiccups.
                u.hasOrders = true;
                u.orderType = "seek_engage";
                u.orderTargetPoint = null;
                u.target = null;
                u.state = "idle";
                u.formationTimer = 120;
                continue;
            }
            if (u.isCommander || u.disableAICombat) continue;

            const allowed = ["move_to_point", "hold_position", "follow", "siege_assault"];
            if (u.hasOrders && allowed.indexOf(u.orderType) !== -1) {
                // Preserve user-issued movement order, and siege roles assigned
                // by executeSiegeAssaultAI during deployment (ram_pusher /
                // ladder_carrier / trebuchet_crew / etc). Without this branch,
                // every siege unit fell into the "no explicit order" else-case
                // below and got force-reassigned to seek_engage the instant
                // COMMENCE ran — wiping siegeRole/siegeTarget and making units
                // charge the nearest enemy like a land battle instead of
                // walking to their ram/ladder.
                u.formationTimer = 120;
            } else {
                // REMOVED: Lazy General auto-select + auto seek_engage.
                // Player units with no explicit order now stay unselected
                // and idle at COMMENCE instead of being force-charged —
                // the player decides when and where they attack.
            }
        }
    }

    try { window.isBattlefieldReady = true; } catch (e) {}
    if (window.keys) for (const k in window.keys) window.keys[k] = false;
    _enableAutoAttackAfterDeploy();

    if (typeof window.EnemyTacticalAI !== "undefined" && window.EnemyTacticalAI.start) {
        // ★ v4.3: RESTART the tactical AI instead of permanently disabling it.
        //
        // The v4.2.6 fix above (this function, top of the loop: orderType =
        // "seek_engage" for every enemy) solved a real freeze bug, but the
        // freeze was caused by the OLD enemyTacticalAI.js's executeAdvancing,
        // which tagged enemies move_to_point + a dummy target with no ongoing
        // re-acquisition. That code no longer runs: window.EnemyTacticalAI is
        // now overridden by enemyLandStrategyAI.js, whose orderMove()/
        // orderHold() were written specifically to avoid that freeze:
        //   - orderMove() attaches a fresh dummy target every call so
        //     processAction's move_to_point branch always has something to
        //     walk toward.
        //   - orderHold() clears any stale dummy target and relies on
        //     ai_categories.js's hold_position 100%-range engage rule so held
        //     units still fight back.
        //   - units tagged "seek_engage" (skirmishing shooters/cav, or this
        //     function's own fallback above) are handled every frame by
        //     ai_categories.js's smart-targeting block, independent of the
        //     AI's own 500ms heartbeat.
        //
        // Leaving EnemyTacticalAI stopped (the old fix) means the smart
        // composition/doctrine/personality/group layer never runs at all —
        // every enemy just keeps the plain seek_engage assigned above, which
        // is why enemies were charging blindly with no tactical positioning.
        //
        // skipForming:true because units are already deployed and standing
        // at COMMENCE — no need to wait through the FORMING phase delay.
        try { window.EnemyTacticalAI.start({ skipForming: true }); } catch (e) {
            console.error('[BLS] EnemyTacticalAI.start() threw in _commenceBattle():', e);
        }
    }
    if (typeof window.triggerEpicZoom === "function") {
        try { window.triggerEpicZoom(CFG.COMMENCE_ZOOM_START, CFG.COMMENCE_ZOOM_END, CFG.COMMENCE_ZOOM_MS); } catch (e) {}
    }
    console.log("[BLS] Battle is LIVE.");
}

// Expose for debug
window.__BLS_commenceBattle      = _commenceBattle;
window.__BLS_enterPreDeployment  = _enterPreDeployment;
window.__BLS_launchDirectly      = _launchDirectly; // manual bypass of pre-deploy, console-only

// ============================================================================
//  PATCH:  updateBattleUnits   (PASS-THROUGH during pre-deploy)
// ============================================================================
//  v4.1 STRATEGY CHANGE:
//  Previously this patch FULLY REPLACED updateBattleUnits with a custom stub
//  (_preDeployUpdateBattleUnits) during pre-deploy.  That stub was brittle —
//  it duplicated movement logic, missed collision/water/animation handling,
//  and most critically it never received the orderTargetPoint that
//  executeBoxFormationMove sets, so right-click moves never reached the unit
//  walk code.  Hence the famous "legs animating but frozen in place" bug.
//
//  NEW APPROACH:  let the REAL updateBattleUnits run normally during pre-deploy.
//  battlefield_logic.js has an inline guard at the top of its unit loop that:
//    • freezes ENEMY units (vx=vy=0, state=idle, no targeting)
//    • lets PLAYER units run normal AI/movement (so right-click moves work)
//    • clamps PLAYER units into window.__playerDeployZone every frame
//  The patches below only:
//    • block the loading-screen overlay (full game freeze while loading)
//    • block projectile updates during pre-deploy (no arrows mid-deploy)
// ============================================================================
function _installTickPatches() {
    const wrap = (name, opts) => {
        const orig = window[name];
        if (typeof orig !== "function" || orig.__blsPatched) return;
        window[name] = function () {
            if (window.__battleLoadingActive) return;
            if (window.__preDeploymentActive && opts.blockDuringPreDeploy) return;
            return orig.apply(this, arguments);
        };
        window[name].__blsPatched = true;
    };

    // updateBattleUnits: pass through during pre-deploy (battlefield_logic.js has the guards)
    wrap("updateBattleUnits", {});

    // LAST LAST RESORT: _preDeployClampUnits was fully implemented but never
    // actually invoked anywhere in this codebase — confirmed by exhaustive
    // grep across every file, not just this one. That means neither player
    // nor enemy units were ever clamped into their deploy zones during
    // pre-deploy, regardless of whether __enemyDeployZone's anchor was
    // correct or the old far-north plazaPixelY. This wraps updateBattleUnits
    // (already unblocked during pre-deploy, see comment above) so the clamp
    // actually runs every frame, right before the next draw — deliberately
    // the same place/timing __enemyDeployZone's own header comments already
    // describe this system as behaving. Path-agnostic like the
    // lastSiegeDefenderResort in siegeEngineLogic.js: doesn't care which
    // upstream logic misplaced a unit, just forces the end state into the
    // (now correctly gate-anchored) box every tick.
    const _origUpdateBattleUnits = window.updateBattleUnits;
    if (typeof _origUpdateBattleUnits === "function" && !_origUpdateBattleUnits.__blsClampWrapped) {
        window.updateBattleUnits = function () {
            const result = _origUpdateBattleUnits.apply(this, arguments);
            if (window.__preDeploymentActive) {
                try { _preDeployClampUnits(); } catch (e) { /* swallow — never let the clamp break the tick */ }
                try { _updatePreBattleChatter(); } catch (e) { /* swallow — never let chatter break the tick */ }
            }
            return result;
        };
        window.updateBattleUnits.__blsClampWrapped = true;
    }
    // Projectiles: still fully blocked during pre-deploy (no arrows mid-deploy).
    wrap("updateBattleProjectiles", { blockDuringPreDeploy: true });
    // SURGERY: updateNavalPhysics was fully blocked here, which meant wind,
    // sail thrust, wave rocking, and ship turning all stopped too — ships
    // (and non-commander crew standing on deck) sat completely inert during
    // naval pre-deploy. Rowing-specific blocking now lives inside
    // updateNavalPhysics itself (naval_battles.js — see the __preDeploymentActive
    // checks around the player/enemy NavalRowing.applyInput calls), so the
    // function needs to run every frame during pre-deploy for wind/sail/turn
    // to keep working; only forward/reverse rowing thrust is suppressed.
    wrap("updateNavalPhysics",      {});
    wrap("updateRiverPhysics",      { blockDuringPreDeploy: true });
}

// ── Patch draw → block canvas during loading, overlay zones during pre-deploy ─
function _installDrawPatch() {
    const orig = window.draw;
    if (typeof orig !== "function" || orig.__blsPatched) return;
    window.draw = function () {
        // FIX v4.4.0: While the loading screen is active, paint the canvas solid
        // black instead of rendering the battlefield.  The BLS overlay div sits on
        // top, but the canvas still composites underneath — on some frames (first
        // rAF tick, GPU compositing quirks) the raw battlefield map bleeds through.
        // Filling the canvas here guarantees zero battlefield pixels reach the
        // player's eyes before the loading screen is dismissed.
        if (window.__battleLoadingActive) {
            try {
                const cv = document.getElementById("gameCanvas");
                if (cv) {
                    const ctx2d = cv.getContext("2d");
                    // Black fill
                    ctx2d.fillStyle = "#000";
                    ctx2d.fillRect(0, 0, cv.width, cv.height);
                    // Paint a "Loading…" label directly on the canvas so it is
                    // visible even if the BLS overlay div fails to composite.
                    // Numeric percentage removed from display per design —
                    // real progress (window.__blsCanvasLoadPct) still drives
                    // the thin bar's fill width below, just isn't shown as text.
                    const isReady = !!(window.__blsCanvasLoadReady);
                    const label = isReady ? "FINALISING…" : "MAP LOADING";
                    const loadingText = "Loading...";
                    const fontSize = Math.max(18, Math.min(32, cv.width * 0.028));
                    ctx2d.save();
                    // Subtle vignette behind text
                    ctx2d.fillStyle = "rgba(0,0,0,0.55)";
                    ctx2d.fillRect(cv.width/2 - 120, cv.height/2 - 60, 240, 100);
                    // Label (small, above "Loading...")
                    ctx2d.font = "500 " + Math.round(fontSize*0.55) + "px monospace";
                    ctx2d.fillStyle = "rgba(245,215,110,0.70)";
                    ctx2d.textAlign = "center";
                    ctx2d.textBaseline = "middle";
                    ctx2d.letterSpacing = "3px";
                    ctx2d.fillText(label, cv.width/2, cv.height/2 - 22);
                    // "Loading..." in place of the numeric percentage
                    ctx2d.font = "700 " + Math.round(fontSize) + "px monospace";
                    ctx2d.fillStyle = "rgba(255,255,255,0.92)";
                    ctx2d.shadowColor = "rgba(245,215,110,0.6)";
                    ctx2d.shadowBlur = 12;
                    ctx2d.fillText(loadingText, cv.width/2, cv.height/2 + 16);
                    ctx2d.shadowBlur = 0;
                    // Small progress ring under text — still driven by real pct
                    // (replaces the old thin horizontal bar).
                    const ringCX = cv.width/2;
                    const ringCY = cv.height/2 + 54;
                    const ringR  = Math.max(12, Math.min(18, cv.width * 0.014));
                    const pctNum = parseFloat(window.__blsCanvasLoadPct) || 0;
                    ctx2d.lineWidth = 4;
                    ctx2d.lineCap = "round";
                    // Track
                    ctx2d.strokeStyle = "rgba(255,255,255,0.12)";
                    ctx2d.beginPath();
                    ctx2d.arc(ringCX, ringCY, ringR, 0, Math.PI * 2);
                    ctx2d.stroke();
                    // Fill arc, starting at 12 o'clock, clockwise by pct
                    const startAngle = -Math.PI / 2;
                    const endAngle   = startAngle + (Math.PI * 2) * (pctNum / 100);
                    ctx2d.strokeStyle = "rgba(245,215,110,0.85)";
                    ctx2d.beginPath();
                    ctx2d.arc(ringCX, ringCY, ringR, startAngle, endAngle);
                    ctx2d.stroke();
                    ctx2d.restore();
                }
            } catch (e) {}
            // Keep the rAF loop alive (v4.5.1 fix — without this the game loop
            // dies and the canvas stays black permanently after the overlay fades).
            requestAnimationFrame(function () {
                if (typeof window.update === "function") {
                    try { window.update(); } catch (e) {}
                }
                if (typeof window.draw === "function") window.draw();
            });
            return; // Skip the real draw — nothing to show yet
        }
        window.__blsFrameCounter = (window.__blsFrameCounter || 0) + 1;

        const result = orig.apply(this, arguments);
        if (window.__preDeploymentActive) {
            try { _drawDeployZoneOverlay(); } catch (e) {}
            try { _drawPreBattleBubbles(); } catch (e) {}
        }
        return result;
    };
    window.draw.__blsPatched = true;
}

// ── Patch executeBoxFormationMove → (now a transparent passthrough) ─────────
// SUPERSEDED: this used to clamp the drag box itself, using a
// (minX, maxX, minY, maxY) sorted-box parameter convention. That does NOT
// match the real function's actual signature — battlefield_commands.js's
// mouseup handler calls it as (units, startX, startY, endX, endY), where
// startX/Y is the drag START point and endX/Y is the drag END point: an
// UNSORTED directional line (it encodes the formation's facing angle), not
// a sorted box. Because of that mismatch, this wrapper's clamp math ended
// up comparing Y-axis drag values against the deploy zone's X bounds (and
// vice versa) on two of its four coordinates every time it ran — silently
// corrupting the drag line instead of cleanly clamping it. That's what was
// causing units to aim past the drawn blue-arrow box during deployment,
// independent of anything else touching this command.
//
// The real, correct deploy-zone clamp for this command now lives where it
// belongs: inside executeBoxFormationMove itself (battlefield_commands.js,
// see its "PRE-DEPLOY CLAMP" comment), which clips each unit's OWN
// destination along the ray from its current position via
// _clipDestToZoneAlongRay — this keeps every unit walking the exact angle
// the player drew and just stops it at the zone edge, rather than yanking
// the whole box toward whichever zone corner is nearest (which is what
// independent min/max clamping like this wrapper did would cause).
//
// This wrapper is kept only so the bootstrap readiness poll below (which
// waits on executeBoxFormationMove.__blsPatched) still resolves normally —
// it now does nothing but call straight through with the real signature.
function _installBoxFormationPatch() {
    const orig = window.executeBoxFormationMove;
    if (typeof orig !== "function" || orig.__blsPatched) return;
    window.executeBoxFormationMove = function (units, startX, startY, endX, endY) {
        return orig.call(this, units, startX, startY, endX, endY);
    };
    window.executeBoxFormationMove.__blsPatched = true;
}

// ── Patch startLazyGeneral → block during pre-deploy ─────────────────────────
function _installLazyGeneralPatch() {
    const orig = window.startLazyGeneral;
    if (typeof orig !== "function" || orig.__blsPatched) return;
    window.startLazyGeneral = function () {
        if (window.__preDeploymentActive || window.__battleLoadingActive) return;
        return orig.apply(this, arguments);
    };
    window.startLazyGeneral.__blsPatched = true;
}

// ============================================================================
//  BATTLE-ENTRY WRAPPERS  (preserve original launch, gate behind loading)
// ============================================================================
// ── Readiness check ──────────────────────────────────────────────────────────
// Returns true once the battle environment has at least some units on both
// sides — i.e. the launcher finished spawning everyone.
function _battleIsReady() {
    const env = window.battleEnvironment;
    if (!env || !Array.isArray(env.units) || env.units.length < 2) return false;
    const hasPlayer = env.units.some(u => u && u.side === "player");
    const hasEnemy  = env.units.some(u => u && u.side === "enemy");
    return hasPlayer && hasEnemy;
}

function _runLoadingGate() {
    // FIX: No artificial timer.  Poll every 80 ms for real readiness (units
    // on both sides exist in battleEnvironment).  The progress bar advances
    // with each passing tick so the player sees motion.  A safety cap
    // prevents the screen from hanging if something goes wrong.
    //
    // v4.6.0: SHOW_MIN removed per design decision -- the screen now closes
    // the instant _battleIsReady() is true, with zero artificial hold.
    //
    // v4.7.0: generateBattlefield now runs CHUNKED behind the loading screen
    // (see battlefield_launch.js) and reports real progress via
    // window.__gbfProgress = {pct, done} while it's still generating the
    // grid -- i.e. BEFORE battleEnvironment.units exists, which is what
    // _battleIsReady() checks. The bar below now prefers that real number
    // when it's available, so what the player sees is tied to actual grid
    // generation progress, not a synthetic elapsed-time creep. Once
    // generation finishes and units start spawning, __gbfProgress is gone
    // (cleared per-battle) and the bar falls back to the elapsed-time creep
    // for the (much shorter) unit-spawn phase, same as before.
    // Safety cap raised from 4000ms: chunked MAX-tier generation (the new
    // finer sub-tile shading pass, see _bSubN) can legitimately take several
    // seconds on slower devices, and the old 4s cap could force-proceed
    // while generation was still validly in progress.
    const TICK        = 80;
    const SAFETY_CAP  = 12000;   // ms — absolute ceiling before we force-proceed
    let   elapsed     = 0;

    if (_progressInterval) { clearInterval(_progressInterval); _progressInterval = null; }
    if (_progressFill) _progressFill.dataset.pct = "0";

    const gate = setInterval(() => {
        elapsed += TICK;

        // Suppress stray keys each tick
        if (window.keys) for (const k in window.keys) window.keys[k] = false;

        // Animate progress bar: fill quickly once ready, otherwise prefer
        // real chunked-generation progress when available, and fall back to
        // a time-based creep toward 90% only when it isn't.
        const ready = _battleIsReady();
        const gbf   = window.__gbfProgress;
        let targetPct;
        if (ready) {
            targetPct = 100;
        } else if (gbf && !gbf.done && typeof gbf.pct === "number") {
            // Real progress from generateBattlefield's chunked driver.
            // Cap at 95 so the bar doesn't sit at 100 while unit spawning
            // (which happens after generation completes) is still pending.
            targetPct = Math.min(95, gbf.pct);
        } else {
            targetPct = Math.min(90, Math.round((elapsed / SAFETY_CAP) * 90));
        }
        const curPct    = parseFloat(_progressFill.dataset.pct) || 0;
        const newPct    = ready ? 100 : Math.max(curPct, targetPct); // never go backward
        const circ      = _progressFill.__circumference;
        _progressFill.setAttribute("stroke-dashoffset", (circ * (1 - newPct / 100)).toFixed(2));
        _progressFill.dataset.pct = String(newPct);
        // Label reads "Loading..." instead of a numeric percentage; the ring
        // fill above still tracks real progress.
        _progressPct.textContent  = "Loading...";
        // Keep canvas globals in sync — the draw() patch reads these to drive
        // its own progress bar width behind the overlay (numeric text there
        // was likewise replaced with a "Loading..." label).
        window.__blsCanvasLoadPct   = newPct;
        window.__blsCanvasLoadReady = ready;

        // Update status message: show freeze notice until battle is ready,
        // then cycle through DEPLOY_MSGS as progress reaches 100%.
        if (!ready) {
            // Still loading — show a rotating "frozen" status so the player
            // knows movement is intentionally locked, not a game hang.
            const freezeMsgs = [
                "Loading terrain… loading",
                "Deploying units… loading",
                "Initialising AI… loading",
                "Building formation data… loading",
                "Allocating draw buffers… loading"
            ];
            const fi = Math.floor(elapsed / 600) % freezeMsgs.length;
            _statusEl.textContent = freezeMsgs[fi];
        } else {
            const msgIdx = Math.min(
                Math.floor((newPct / 100) * DEPLOY_MSGS.length),
                DEPLOY_MSGS.length - 1
            );
			
if (window.inSiegeBattle) {
    _statusEl.textContent = "Manning the Walls";
} else if (window.inNavalBattle) {
    _statusEl.textContent = "All Hands on Deck";
} else {
    _statusEl.textContent = DEPLOY_MSGS[msgIdx];
}
			
        }

        // ── FIX: Re-sync the troop counts on every tick once units exist. ──
        // The 110ms setTimeout in _wrapLaunchFn can fire before deployArmy()
        // finishes spawning (especially for large sieges or naval battles).
        // Refreshing each tick guarantees the displayed counts converge to the
        // true scaled deployed totals before the screen fades out.
        if (ready) {
            try { _refreshLoadingScreenData(); } catch (e) {}
        }

        const done = ready || elapsed >= SAFETY_CAP;
        if (done) {
            // One last refresh so the final visible numbers are guaranteed correct.
            try { _refreshLoadingScreenData(); } catch (e) {}
            clearInterval(gate);
            window.__gbfProgress = null;
            // __battleLoadingActive is cleared by _enterPreDeployment() after the 520ms fade completes.
            hideBattleLoadingScreen();
            if (window.keys) for (const k in window.keys) window.keys[k] = false;
        }
    }, TICK);
}

function _wrapLaunchFn(fnName, fallbackNpc, fallbackTile, npcArgIdx) {
    const orig = window[fnName];
    if (typeof orig !== "function" || orig.__blsPatched) return;
    window[fnName] = function () {
        // FIX: launchCustomBattle internally calls launchCustomSiege /
        // launchCustomNavalBattle.  Both are also wrapped here, so without
        // this guard the loading screen would show twice, start two independent
        // gate pollers, and the second hide() call would leave draw() stuck in
        // the __battleLoadingActive black-fill branch with the game frozen.
        // If we are already inside a loading gate, just run the original and
        // return — the outer gate is already polling for readiness.
        if (window.__battleLoadingActive) {
            return orig.apply(this, arguments);
        }

        // ────────────────────────────────────────────────────────────────
        // v4.6.0 FIX — PAINT BEFORE WORK (root cause of the "delay then a
        // 1-frame flash" bug):
        //   Previously orig.apply(this, arguments) ran SYNCHRONOUSLY right
        //   here, in the same tick as showBattleLoadingScreen().  orig is
        //   generateBattlefield's caller (enterBattlefield /
        //   launchCustomBattle / etc.) — it synchronously draws the entire
        //   battlefield canvas grid (tens of thousands of tiles) AND spawns
        //   every unit on both sides.  A browser never paints mid-tick, so
        //   ALL of that work finished before the loading screen div (and its
        //   percentage bar) ever reached the screen.  By the time the
        //   _runLoadingGate() poller below got its first tick, the battle
        //   was already fully generated and _battleIsReady() was instantly
        //   true — so the "loading screen" the player saw was really just
        //   SHOW_MIN's cosmetic hold, completely decoupled from the actual
        //   (already-finished) work, which is why it felt like a pointless
        //   flash after a multi-second unexplained delay.
        //
        //   FIX: snapshot the arguments, show the loading screen (flips
        //   __battleLoadingActive = true, which makes the already-existing
        //   draw() patch black-fill the canvas + paint the % text every
        //   frame — see _installDrawPatch), then wait for two
        //   requestAnimationFrame callbacks — the standard guarantee that at
        //   least one real compositor paint has happened — before running
        //   the heavy orig.apply().  The gate poller only starts once that
        //   actually kicks off, so the progress bar's animation now overlaps
        //   the real generation work instead of following it.
        //
        //   Return value: no caller anywhere in the codebase uses the return
        //   value of enterBattlefield/executeAttackAction/launchCustomBattle/
        //   launchCustomNavalBattle/launchCustomSiege (all are fire-and-forget
        //   statements), so deferring orig.apply() and returning undefined
        //   synchronously here is safe.
        // ────────────────────────────────────────────────────────────────
        const _capturedArgs = arguments;
        const _capturedThis = this;

        const _npcIdx = (typeof npcArgIdx === "number") ? npcArgIdx : 0;
        
        const _pendingEnemy = window.__blsPendingEnemy || null;
        const _pendingPlayer = window.__blsPendingPlayer || null; // 🔴 Catch it here
        window.__blsPendingEnemy = null; 
        window.__blsPendingPlayer = null; 

        window.__blsFromCustom = !!_pendingEnemy;
        const npc  = _pendingEnemy
            || ((_capturedArgs[_npcIdx] && typeof _capturedArgs[_npcIdx] === "object") ? _capturedArgs[_npcIdx] : fallbackNpc);
        const tile = (_capturedArgs[2] && typeof _capturedArgs[2] === "object") ? _capturedArgs[2] : fallbackTile;
        const nearCity = findNearestCity(npc);
        
        // 🔴 Pass _pendingPlayer directly into the show screen function
        try { showBattleLoadingScreen(npc, tile, nearCity, _pendingPlayer); }
        catch (e) { console.error("[BLS] showLoading (" + fnName + ")", e); }
		
        window.__battleLoadingActive  = true;
        window.__blsCanvasLoadPct     = 0;
        window.__blsCanvasLoadReady   = false;
        window.__battleCullingEnabled = false;

        if (typeof window.EnemyTacticalAI !== "undefined" && window.EnemyTacticalAI.stop) {
            try { window.EnemyTacticalAI.stop(); } catch (e) {}
        }
        if (typeof window.stopLazyGeneral === "function") {
            try { window.stopLazyGeneral(); } catch (e) {}
        }

        // Double-rAF: the first rAF fires before the NEXT paint is committed;
        // the second rAF (scheduled from inside the first) fires after that
        // paint has already been composited to the screen. This is the
        // standard "wait for a real paint" pattern — a single rAF or a
        // setTimeout(0) both risk running before the browser has actually
        // shown anything, especially on a heavy synchronous call stack.
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                try {
                    orig.apply(_capturedThis, _capturedArgs);
                } catch (e) {
                    console.error("[BLS] deferred orig.apply (" + fnName + ")", e);
                }

                setTimeout(_refreshLoadingScreenData, 110);

                if (typeof window.EnemyTacticalAI !== "undefined" && window.EnemyTacticalAI.stop) {
                    try { window.EnemyTacticalAI.stop(); } catch (e) {}
                }
                if (typeof window.stopLazyGeneral === "function") {
                    try { window.stopLazyGeneral(); } catch (e) {}
                }

                _runLoadingGate();
            });
        });

        // Nothing awaits this return value (see comment above) — undefined
        // is correct and matches how every call site already treats these
        // launchers (fire-and-forget statements, never assigned/chained).
        return undefined;
    };
    window[fnName].__blsPatched = true;
}

function _patchAllLaunchers() {
    _wrapLaunchFn("enterBattlefield",        { faction: "Enemy Forces",        roster: [] }, { name: "Open Field"        });
    _wrapLaunchFn("enterSiegeBattlefield",   { faction: "Defending Garrison",  roster: [] }, { name: "Siege Assault"     });
    _wrapLaunchFn("executeAttackAction",     { faction: "Enemy Forces",        roster: [] }, { name: "Open Field"        });
    _wrapLaunchFn("launchCustomBattle",      { faction: "Enemy Forces",        roster: [] }, { name: "Custom Skirmish"   });
    _wrapLaunchFn("launchCustomNavalBattle", { faction: "Hostile Fleet",       roster: [] }, { name: "Naval Engagement"  });
    // npcArgIdx=1: launchCustomSiege(playerSetup, enemySetup, map) — enemy is arg[1], not arg[0]
    _wrapLaunchFn("launchCustomSiege",       { faction: "Defending Garrison",  roster: [] }, { name: "Siege Assault"     }, 1);
}

// ============================================================================
//  BOOTSTRAP
// ============================================================================
function _tryInstallAll() {
    _buildScreen();
    _installTickPatches();
    _installDrawPatch();
    _installBoxFormationPatch();
    _installLazyGeneralPatch();
    _patchAllLaunchers();
}

function _bootstrap() {
    _tryInstallAll();
    let tries = 0;
    const poll = setInterval(() => {
        tries++;
        _tryInstallAll();
        const enough =
            (window.updateBattleUnits       && window.updateBattleUnits.__blsPatched) &&
            (window.executeBoxFormationMove && window.executeBoxFormationMove.__blsPatched) &&
            (window.draw                    && window.draw.__blsPatched) &&
            (window.enterBattlefield        && window.enterBattlefield.__blsPatched) &&
            // FIX: these launchers were being (re)patched by _patchAllLaunchers()
            // every tick already, but were never actually CHECKED here.
            // _wrapLaunchFn silently no-ops if its target function isn't
            // defined yet (see the `orig.__blsPatched` guard above), so if
            // e.g. launchCustomNavalBattle's defining script loaded a beat
            // late, the wrap for it could be missed on every remaining tick
            // once "enough" went true from the other four alone — poller
            // stops, naval (or whichever launcher loaded late) never gets
            // wrapped, no error anywhere, no loading screen on that launch
            // type. Checking every patchable launcher here means the poller
            // keeps retrying (still capped at the existing 80 tries / 16s)
            // until each one that actually exists is confirmed wrapped.
            // `!window.fnName || ...patched` (not a bare existence check) on
            // purpose: these four are launch-type-specific and some may
            // legitimately never be defined in a given session (e.g. no
            // custom-siege function in a campaign-only session) — that must
            // not permanently block "enough" from ever being true.
            (!window.enterSiegeBattlefield   || window.enterSiegeBattlefield.__blsPatched) &&
            (!window.executeAttackAction     || window.executeAttackAction.__blsPatched) &&
            (!window.launchCustomBattle      || window.launchCustomBattle.__blsPatched) &&
            (!window.launchCustomNavalBattle || window.launchCustomNavalBattle.__blsPatched) &&
            (!window.launchCustomSiege       || window.launchCustomSiege.__blsPatched);
        if (enough || tries > 80) {
            clearInterval(poll);
            console.log("[BLS] All patches installed (tries=" + tries + ").");
        }
    }, 200);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _bootstrap);
} else {
    _bootstrap();
}
window.addEventListener("load", _bootstrap);

// ============================================================================
//  PUBLIC API
// ============================================================================
window.BattleLoadingScreen = {
    VERSION:           "4.5.1",
    show:              showBattleLoadingScreen,
    hide:              hideBattleLoadingScreen,
    commenceBattle:    _commenceBattle,
    enterPreDeploy:    _enterPreDeployment,
    isLoading:         () => window.__battleLoadingActive,
    isPreDeploy:       () => window.__preDeploymentActive,
    isCulling:         () => window.__battleCullingEnabled,
    chosenFormation:   () => window.__chosenEnemyFormation,
    repatch:           _tryInstallAll,
    CFG
};

console.log("[BLS] v4.5.1 loaded — rAF loop kept alive during loading, siege npcArgIdx fix, siege AI guard in _launchDirectly.");

})();