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

    PLAYER_DEPLOY_FRAC:       0.25,   // land + river
    PLAYER_DEPLOY_FRAC_SIEGE: 0.18,   // siege (furthest south)
    ENEMY_DEPLOY_FRAC:        0.30,

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
        const t = u.type || u.name || u.unitType || "Unknown";
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
    "Assembling formations…",
    "Reading the terrain…",
    "Positioning artillery…",
    "Cavalry taking flanks…",
    "Archers nocking arrows…",
    "Scouts reporting in…",
    "Drummers at the ready…",
    "Standards raised…",
    "Awaiting your command…"
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

    // Progress bar
    const progSection = _makeEl("div", {
        width: "min(500px, 90vw)",
        marginTop: "clamp(6px, 1.5vh, 14px)"
    });
    _statusEl = _makeEl("div", {
        fontSize:       "clamp(0.6rem, 1.5vw, 0.72rem)",
        color:          "rgba(180,150,90,0.8)",
        letterSpacing:  "2px",
        textTransform:  "uppercase",
        textAlign:      "center",
        marginBottom:   "6px",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        gap:            "8px"
    }, "Deploying troops…");
    const barOuter = _makeEl("div", {
        width:        "100%",
        height:       "4px",
        background:   "rgba(255,255,255,0.08)",
        borderRadius: "4px",
        overflow:     "hidden",
        position:     "relative"
    });
    _progressFill = _makeEl("div", {
        height:       "100%",
        width:        "0%",
        background:   "linear-gradient(90deg, #6b3a10, #c8910a, #f5d76e, #fff8c0)",
        borderRadius: "4px",
        transition:   "width 0.1s linear",
        boxShadow:    "0 0 10px rgba(245,215,110,0.6)",
        position:     "relative"
    });
    const shimmer = _makeEl("div", {
        position:   "absolute",
        top:        "0", left: "-60px",
        width:      "60px", height: "100%",
        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)",
        animation:  "bls-shimmer 1.5s infinite"
    });
    _progressFill.appendChild(shimmer);
    barOuter.appendChild(_progressFill);
    _progressPct = _makeEl("div", {
        textAlign:     "center",
        marginTop:     "6px",
        fontSize:      "clamp(0.65rem, 1.8vw, 0.78rem)",
        color:         "rgba(245,215,110,0.6)",
        letterSpacing: "1px",
        fontStyle:     "italic"
    }, "0%");
    progSection.appendChild(_statusEl);
    progSection.appendChild(barOuter);
    progSection.appendChild(_progressPct);
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
            @keyframes bls-shimmer {
                0%   { left: -60px; }
                100% { left: 110%; }
            }
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
    if (s.match(/(cav|horse|lancer|mount|keshig)/))  return "🏇";
    if (s.match(/eleph/))                             return "🐘";
    if (s.match(/(bomb|artill|trebuch)/))             return "💣";
    if (s.match(/(ship|naval|galley)/))               return "⛵";
    if (s.match(/(archer|bow|crossbow)/))             return "🏹";
    if (s.match(/(hand|rocket|firelance)/))           return "🔥";
    if (s.match(/camel/))                             return "🐫";
    if (s.match(/(pike|spear|glaive)/))               return "🔱";
    if (s.match(/(slinger|javelinier)/))              return "🤾";
    if (s.match(/(shield)/))                          return "🛡️";
    if (s.match(/(militia|peasant)/))                 return "🪓";
    if (s.match(/(general|command|player)/))          return "⭐";
    return "⚔️";
}

// ── Build unit card tiles (uses drawTroopCardToCanvas if available) ──────────
function buildCardTiles(roster, container, side, factionCol) {
    container.innerHTML = "";
    if (!roster || !roster.length) {
        const none = _makeEl("div", {
            color: "rgba(200,180,120,0.4)", fontSize: "0.7rem",
            fontStyle: "italic", padding: "8px"
        }, "(Composition unknown)");
        container.appendChild(none);
        return;
    }

    const items   = condenseRoster(roster, CFG.CARD_MAX);
    const W       = Math.min(CFG.CARD_W, Math.floor((window.innerWidth * 0.88) / Math.min(items.length, 8)) - 8);
    const H       = Math.round(W * 1.35);
    const isEnemy = side === "enemy";
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

        // ×count badge top-right
        const badge = _makeEl("div", {
            position: "absolute",
            top: "3px", right: "4px",
            fontSize: Math.max(8, Math.round(W * 0.13)) + "px",
            color: isEnemy ? "#ff9090" : "#90ccff",
            fontWeight: "bold",
            zIndex: "2",
            textShadow: "0 1px 3px rgba(0,0,0,0.95)"
        }, "×" + item.count);
        card.appendChild(badge);

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
}

// ── Scout intel helpers (enemy side only) ────────────────────────────────────
// Returns a fuzzy troop count: ±10% random noise, rounded to nearest 5.
// Gives the player a rough sense of force size without exact numbers.
function _scoutCount(exact) {
    if (!exact || exact <= 0) return 0;
    const noise  = exact * 0.10;                         // ±10% window
    const fuzzed = exact + (Math.random() * noise * 2) - noise;
    return Math.max(5, Math.round(fuzzed / 5) * 5);      // nearest 5, min 5
}

// Returns a partial enemy roster — 30-60% of cards, randomly sampled.
// Simulates scouts only recognising some unit types from a distance.
function _scoutRoster(roster) {
    if (!roster || !roster.length) return [];
    const revealFraction = 0.30 + Math.random() * 0.30;   // 30-60%
    const revealCount    = Math.max(1, Math.round(roster.length * revealFraction));
    const shuffled = roster.slice().sort(() => Math.random() - 0.5);
    return shuffled.slice(0, revealCount);
}

// ---- Show / refresh / hide loading screen ----
function showBattleLoadingScreen(npc, tile, nearestCity) {
    if (!_screen) _buildScreen();
    if (!_screen) return;

    const tileName = (tile && tile.name) ? tile.name : "Plains";
    // Check for a city, but leave it null if nothing valid is found
    const cityName = nearestCity ? (nearestCity.name || nearestCity.id) : null;

    const playerFac    = (window.player && window.player.faction) || "Your Forces";
    const enemyFac     = npc ? (npc.faction || "Enemy Forces") : "Enemy Forces";
    const playerCol    = factionColor(playerFac) || "#4a90d9";
    const enemyCol     = factionColor(enemyFac)  || "#c0392b";
    const playerCount  = (window.player && window.player.troops) || 0;
    // +1 for the enemy general only when launched from custom battle.
    // Custom battle sets window.__blsFromCustom = true (via __blsPendingEnemy).
    // Sandbox/parler NPCs carry their real total in npc.count — no +1 needed.
    // Backup: also check if battleEnvironment already has a spawned enemy commander.
    const _enemyCmdrSpawned = !!(window.battleEnvironment && Array.isArray(window.battleEnvironment.units)
        && window.battleEnvironment.units.some(u => u.side === "enemy" && u.isCommander));
    const _addGeneral = window.__blsFromCustom || _enemyCmdrSpawned;
    const _exactCount  = ((npc && (npc.count || npc.troops)) || 0) + (_addGeneral ? 1 : 0);
    const enemyCountN  = _scoutCount(_exactCount);        // fuzzy ±10%, nearest 5
    const playerRoster = (window.player && window.player.roster) || [];
    const enemyRoster  = _scoutRoster((npc && npc.roster) || []);  // partial scout reveal

    // If we have a city name, show "BATTLE OF [CITY]", otherwise fallback to "LOADING BATTLE"
    _titleEl.textContent = cityName ? "BATTLE OF " + String(cityName).toUpperCase() : "LOADING BATTLE";
    
    _subEl.textContent   = (typeof inSiegeBattle !== "undefined" && inSiegeBattle) ? "Siege Battle"
                         : (window.inNavalBattle)                                  ? "Naval Battle"
                         : (window.inRiverBattle)                                  ? "River Battle"
                         : terrainLabel(tileName);

    document.getElementById("bls-enemy-name").textContent  = enemyFac.toUpperCase();
    document.getElementById("bls-enemy-name").style.color  = enemyCol;
    document.getElementById("bls-enemy-count").textContent = "Scout report: ~" + enemyCountN + " troops";

    document.getElementById("bls-player-name").textContent  = playerFac.toUpperCase();
    document.getElementById("bls-player-name").style.color  = playerCol;
    document.getElementById("bls-player-count").textContent = playerCount + " troops";

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
        buildCardTiles(enemyRoster,  _enemyCardsRow,  "enemy",  enemyCol);
        buildCardTiles(playerRoster, _playerCardsRow, "player", playerCol);
    }, 80);

    // Progress animation
    _progressFill.style.width = "0%";
    _progressPct.textContent  = "0%";
    let tick = 0, msgIdx = 0;
    if (_progressInterval) clearInterval(_progressInterval);
    const tickInterval = CFG.LOAD_MIN_MS / CFG.PROGRESS_TICKS;
    _progressInterval = setInterval(() => {
        tick++;
        const pct = Math.min(Math.round((tick / CFG.PROGRESS_TICKS) * 100), 100);
        _progressFill.style.width = pct + "%";
        _progressPct.textContent  = pct + "%";
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

    const playerFac = (window.player && window.player.faction) || "Your Forces";
    let playerRoster = (window.player && Array.isArray(window.player.roster)) ? window.player.roster : [];
    if (!playerRoster.length && window.battleEnvironment && Array.isArray(window.battleEnvironment.units)) {
        playerRoster = window.battleEnvironment.units
            .filter(u => u.side === "player" && !u.isCommander)
            .map(u => ({ type: u.unitType || (u.stats && u.stats.name) || "Soldier" }));
    }
    const playerCol = factionColor(playerFac) || "#4a90d9";

    let enemyFac     = "Enemy Forces";
    let enemyRoster  = [];
    let enemyCountN  = 0;
    if (window.battleEnvironment && Array.isArray(window.battleEnvironment.units)) {
        const enemies = window.battleEnvironment.units.filter(u => u.side === "enemy" && !u.isCommander);
        if (enemies.length) {
            enemyFac    = enemies[0].faction || enemies[0].nationality || enemyFac;
            // Full roster from live units, then scout-filter to partial reveal
            const _fullRoster = enemies.map(u => ({ type: u.unitType || (u.stats && u.stats.name) || "Soldier" }));
            enemyRoster = _scoutRoster(_fullRoster);
            // +1 for commander (excluded by filter), then fuzz the total
            enemyCountN = _scoutCount(enemies.length + 1);
        }
    }
    const enemyCol = factionColor(enemyFac) || "#c0392b";

    document.getElementById("bls-enemy-name").textContent  = enemyFac.toUpperCase();
    document.getElementById("bls-enemy-name").style.color  = enemyCol;
    // FIX: Only update count if we actually found enemy units — don't overwrite the
    // initial npc.count (set from __blsPendingEnemy) with 0 when battleEnvironment.units
    // hasn't populated yet or GLOBAL_BATTLE_SCALE has reduced the count.
    if (enemyCountN > 0) {
        document.getElementById("bls-enemy-count").textContent = "Scout report: ~" + enemyCountN + " troops";
    }
    document.getElementById("bls-player-name").textContent = playerFac.toUpperCase();
    document.getElementById("bls-player-name").style.color = playerCol;
    document.getElementById("bls-player-count").textContent = (playerRoster.length || (window.player && window.player.troops) || 0) + " troops";

    _subEl.textContent = terrainLabel("");

    // FIX: Only rebuild cards if we actually found live units in battleEnvironment.
    // If enemies aren't spawned yet (110ms refresh fires before spawn loop finishes),
    // enemyRoster is [] and calling buildCardTiles would wipe the correct cards that
    // showBattleLoadingScreen already built from __blsPendingEnemy at t=80ms.
    if (enemyRoster.length)  buildCardTiles(enemyRoster,  _enemyCardsRow,  "enemy",  enemyCol);
    if (playerRoster.length) buildCardTiles(playerRoster, _playerCardsRow, "player", playerCol);
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
        _launchDirectly();
    }, 520);
}

// ============================================================================
//  DIRECT LAUNCH  (replaces pre-deployment — uses old enterBattlefield AI path)
// ============================================================================
function _launchDirectly() {
    console.log("[BLS] Direct launch — skipping pre-deployment.");

    window.__preDeploymentActive  = false;
    window.__battleCullingEnabled = true;

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
                // FIX: Siege assault AI is set by executeSiegeAssaultAI inside
                // launchCustomSiege.  Overwriting those orders with seek_engage here
                // breaks ladder/ram/treb crews — they abandon equipment and wander.
                if (!window.inSiegeBattle) {
                    u.selected         = true;
                    u.hasOrders        = true;
                    u.orderType        = "seek_engage";
                    u.orderTargetPoint = null;
                    u.formationTimer   = 120;
                }
            }
        });
    }

    try { window.isBattlefieldReady = true; } catch (e) {}

    // Start enemy tactical AI — same call as enterBattlefield line 871
    if (typeof window.EnemyTacticalAI !== "undefined" && window.EnemyTacticalAI.start) {
        try { window.EnemyTacticalAI.start(); } catch (e) {}
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
    _preDeployUI = _makeEl("div", {
        position:       "fixed",
        top:            "8px",
        right:          "8px",
        zIndex:         "9800",
        display:        "none",
        flexDirection:  "column",
        alignItems:     "stretch",
        gap:            "4px",
        width:          "clamp(180px, 26vw, 240px)",
        pointerEvents:  "none",
        fontFamily:     "'Cinzel', Georgia, serif"
    });
    _preDeployUI.id = "bls-predeploy-hud";

    const titlePill = _makeEl("div", {
        background:    "linear-gradient(180deg, rgba(18,8,4,0.96) 0%, rgba(8,4,2,0.92) 100%)",
        border:        "1px solid #d4b886",
        borderRadius:  "8px",
        padding:       "6px 10px",
        textAlign:     "center",
        color:         "#ffca28",
        fontSize:      "11px",
        fontWeight:    "700",
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        textShadow:    "0 1px 3px #000",
        boxShadow:     "0 4px 14px rgba(0,0,0,0.7)",
        pointerEvents: "auto"
    }, "Pre-Battle Deployment");
    _preDeployUI.appendChild(titlePill);

    _formationNameEl = _makeEl("div", {
        background:    "rgba(8,4,2,0.85)",
        border:        "1px solid rgba(255,107,107,0.7)",
        borderRadius:  "6px",
        padding:       "4px 8px",
        textAlign:     "center",
        color:         "#ff9b9b",
        fontSize:      "10px",
        fontWeight:    "600",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        pointerEvents: "auto"
    }, "Enemy: —");
    _preDeployUI.appendChild(_formationNameEl);

    const hint = _makeEl("div", {
        background:    "rgba(8,4,2,0.75)",
        border:        "1px solid rgba(212,184,134,0.4)",
        borderRadius:  "6px",
        padding:       "4px 8px",
        textAlign:     "center",
        color:         "#cfb88a",
        fontSize:      "9px",
        fontStyle:     "italic",
        letterSpacing: "0.08em",
        pointerEvents: "auto",
        lineHeight:    "1.3"
    }, "Drag-box to position troops within the blue zone.");
    _preDeployUI.appendChild(hint);

    _commenceBtn = _makeEl("button", {
        background:    "linear-gradient(180deg, #c62828 0%, #6a1010 100%)",
        border:        "2px solid #ffca28",
        borderRadius:  "9px",
        padding:       "12px 8px",
        color:         "#fff",
        fontSize:      "clamp(13px, 2.2vw, 16px)",
        fontWeight:    "900",
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        cursor:        "pointer",
        textShadow:    "0 2px 4px #000, 0 0 12px rgba(255,202,40,0.4)",
        boxShadow:     "0 0 24px rgba(255,202,40,0.55), inset 0 -3px 8px rgba(0,0,0,0.45)",
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
    if (_formationNameEl) _formationNameEl.textContent = "Enemy: " + (formationName || "Standard Line");
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
        H: _safeNumber(window.BATTLE_WORLD_HEIGHT, 1800)
    };
}

function _calculatePlayerDeployZone() {
    const { W, H } = _worldDims();
    const isSiege = !!window.inSiegeBattle;
    const isNaval = !!window.inNavalBattle;
    const isRiver = !!window.inRiverBattle;

    if (isNaval) {
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
        return { type: "siege", minX: 60, maxX: W - 60, minY: H * (1 - CFG.PLAYER_DEPLOY_FRAC_SIEGE), maxY: H - 30 };
    }
    if (isRiver) {
        return { type: "river", minX: 60, maxX: W - 60, minY: H * (1 - CFG.PLAYER_DEPLOY_FRAC), maxY: H - 30 };
    }
    return { type: "land", minX: 60, maxX: W - 60, minY: H * (1 - CFG.PLAYER_DEPLOY_FRAC), maxY: H - 30 };
}

function _calculateEnemyDeployZone() {
    const { W, H } = _worldDims();
    return { type: "enemy", minX: 60, maxX: W - 60, minY: 30, maxY: H * CFG.ENEMY_DEPLOY_FRAC };
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
    const z = window.__playerDeployZone;
    if (!z || !window.battleEnvironment || !Array.isArray(window.battleEnvironment.units)) return;
    const units = window.battleEnvironment.units;
    const ez    = window.__enemyDeployZone;

    for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!u || u.hp <= 0) continue;

        if (u.side === "player" && !u.isCommander) {
            _clampUnitToZone(u, z);
        } else if (u.side === "enemy" && ez) {
            if (u.x < ez.minX) u.x = ez.minX;
            if (u.x > ez.maxX) u.x = ez.maxX;
            if (u.y < ez.minY) u.y = ez.minY;
            if (u.y > ez.maxY) u.y = ez.maxY;
            u.vx = 0; u.vy = 0;
        }
    }

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
        ctx.strokeStyle = "rgba(255,90,90,0.55)";
        ctx.lineWidth = 2;
        ctx.setLineDash([14, 8]);
        ctx.beginPath();
        ctx.moveTo(etl.x, ebr.y);
        ctx.lineTo(ebr.x, ebr.y);
        ctx.stroke();
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
        ctx.strokeStyle = "rgba(80,170,255,0.7)";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([14, 8]);
        ctx.beginPath();
        ctx.moveTo(tl.x, tl.y);
        ctx.lineTo(br.x, tl.y);
        ctx.stroke();
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
//  ENTER PRE-DEPLOYMENT
// ============================================================================
function _enterPreDeployment() {
    console.log("[BLS] Entering Pre-Deployment.");
    window.__preDeploymentActive  = true;
    window.__battleCullingEnabled = false;

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

            const allowed = ["move_to_point", "hold_position", "follow"];
            if (u.hasOrders && allowed.indexOf(u.orderType) !== -1 && u.orderType !== "hold_position") {
                // Preserve user-issued movement order
                u.formationTimer = 120;
            } else {
                // No explicit order → auto-engage
                u.selected = true;
                u.hasOrders = true;
                u.orderType = "seek_engage";
                u.orderTargetPoint = null;
                u.formationTimer = 120;
                u.target = null;
            }
        }
    }

    try { window.isBattlefieldReady = true; } catch (e) {}
    if (window.keys) for (const k in window.keys) window.keys[k] = false;
    _enableAutoAttackAfterDeploy();

    if (typeof window.EnemyTacticalAI !== "undefined" && window.EnemyTacticalAI.start) {
        // ★ v4.2.6: DO NOT call EnemyTacticalAI.start() anymore.
        // EnemyTacticalAI.start({skipForming:true}) immediately runs
        // executeAdvancing, which calls orderMove on every enemy and sets
        // orderType="move_to_point" + a dummy target.  That orderType is in
        // processTargeting's SKIP LIST (ai_categories.js line 186), so enemy
        // units never scan for real targets, never engage at melee range, and
        // their only motion driver is the AI's 500ms tick re-issuing waypoints.
        // If that tick hiccups for any reason (it has multiple guards that can
        // teardown() the interval), enemies freeze permanently — even with the
        // player commander standing right next to them.
        //
        // SYMPTOM: "frozen, won't attack at 2px range, but retreats on morale
        // drop" — because retreat bypasses the normal AI path.
        //
        // The fix issued earlier in this function (orderType="seek_engage" for
        // every enemy unit) makes them behave like aggressive engine-driven AI:
        // processTargeting scans for nearest player unit, processAction drives
        // movement and combat, melee self-defence works at close range.  Same
        // path used by player allies — proven reliable.
        //
        // We still call .stop() defensively in case it was previously started
        // by the original enterBattlefield (which calls .start() at line 871
        // of battlefield_launch.js).
        if (window.EnemyTacticalAI.stop) {
            try { window.EnemyTacticalAI.stop(); } catch (e) {}
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
    // Projectiles + naval/river physics: block during pre-deploy
    wrap("updateBattleProjectiles", { blockDuringPreDeploy: true });
    wrap("updateNavalPhysics",      { blockDuringPreDeploy: true });
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
                    const ctx = cv.getContext("2d");
                    ctx.fillStyle = "#000";
                    ctx.fillRect(0, 0, cv.width, cv.height);
                }
            } catch (e) {}
            // FIX v4.5.1 — ROOT-CAUSE BLACK SCREEN: The original draw() ends with
            // requestAnimationFrame(() => { update(); draw(); }) which perpetuates the
            // game loop.  By returning early we skipped that rAF call — the loop died
            // permanently.  When __battleLoadingActive later flipped false, nothing
            // called draw() again → canvas stayed black forever.
            // Solution: fire our own rAF tick here (update + draw) to keep the loop
            // alive while we show the loading screen.  All heavyweight battle updates
            // (updateBattleUnits, projectiles, etc.) are already blocked by
            // _installTickPatches, so update() is safe to call during loading.
            requestAnimationFrame(function () {
                if (typeof window.update === "function") {
                    try { window.update(); } catch (e) {}
                }
                if (typeof window.draw === "function") window.draw();
            });
            return; // Skip the real draw — nothing to show yet
        }
        const result = orig.apply(this, arguments);
        if (window.__preDeploymentActive) {
            try { _drawDeployZoneOverlay(); } catch (e) {}
        }
        return result;
    };
    window.draw.__blsPatched = true;
}

// ── Patch executeBoxFormationMove → clamp box to deploy zone ────────────────
function _installBoxFormationPatch() {
    const orig = window.executeBoxFormationMove;
    if (typeof orig !== "function" || orig.__blsPatched) return;
    window.executeBoxFormationMove = function (units, minX, maxX, minY, maxY) {
        if (window.__preDeploymentActive && window.__playerDeployZone) {
            const z = window.__playerDeployZone;
            const overlapX = !(maxX < z.minX || minX > z.maxX);
            const overlapY = !(maxY < z.minY || minY > z.maxY);
            if (!overlapX || !overlapY) {
                const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
                const newCx = Math.max(z.minX + 80, Math.min(z.maxX - 80, cx));
                const newCy = Math.max(z.minY + 30, Math.min(z.maxY - 30, cy));
                const hw = Math.min(160, (z.maxX - z.minX) / 2 - 10);
                const hh = Math.min(60,  (z.maxY - z.minY) / 2 - 10);
                minX = newCx - hw; maxX = newCx + hw;
                minY = newCy - hh; maxY = newCy + hh;
            } else {
                if (minX < z.minX) minX = z.minX;
                if (maxX > z.maxX) maxX = z.maxX;
                if (minY < z.minY) minY = z.minY;
                if (maxY > z.maxY) maxY = z.maxY;
                if (maxX - minX < 30) { const cx = (minX + maxX) / 2; minX = Math.max(z.minX, cx - 30); maxX = Math.min(z.maxX, cx + 30); }
                if (maxY - minY < 30) { const cy = (minY + maxY) / 2; minY = Math.max(z.minY, cy - 30); maxY = Math.min(z.maxY, cy + 30); }
            }
        }
        return orig.call(this, units, minX, maxX, minY, maxY);
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
    // with each passing tick so the player sees motion.  A 4-second safety
    // cap prevents the screen from hanging if something goes wrong.
    const TICK        = 80;
    const SAFETY_CAP  = 4000;   // ms — absolute ceiling before we force-proceed
    const SHOW_MIN    = 600;    // ms — minimum visible time so it doesn't flash
    let   elapsed     = 0;

    if (_progressInterval) { clearInterval(_progressInterval); _progressInterval = null; }

    const gate = setInterval(() => {
        elapsed += TICK;

        // Suppress stray keys each tick
        if (window.keys) for (const k in window.keys) window.keys[k] = false;

        // Animate progress bar: fill quickly once ready, otherwise creep toward 90%
        const ready     = _battleIsReady();
        const targetPct = ready ? 100 : Math.min(90, Math.round((elapsed / SAFETY_CAP) * 90));
        const curPct    = parseFloat(_progressFill.style.width) || 0;
        const newPct    = ready ? 100 : Math.max(curPct, targetPct); // never go backward
        _progressFill.style.width = newPct + "%";
        _progressPct.textContent  = newPct + "%";

        // Update status message proportional to progress
        const msgIdx = Math.min(
            Math.floor((newPct / 100) * DEPLOY_MSGS.length),
            DEPLOY_MSGS.length - 1
        );
        _statusEl.textContent = DEPLOY_MSGS[msgIdx];

        const done = (ready && elapsed >= SHOW_MIN) || elapsed >= SAFETY_CAP;
        if (done) {
            clearInterval(gate);
            window.__battleLoadingActive = false;
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

        // FIX: npcArgIdx lets callers specify which argument index holds the
        // enemy/NPC setup object.  launchCustomSiege(playerSetup, enemySetup, map)
        // puts the enemy at index 1, not 0 — without this, playerSetup was treated
        // as the NPC and the loading screen showed the wrong faction/roster.
        const _npcIdx = (typeof npcArgIdx === "number") ? npcArgIdx : 0;
        // FIX: launchCustomBattle() takes zero arguments, so arguments[0] is undefined.
        // custom_battle_gui.js sets window.__blsPendingEnemy before calling — consume it
        // here so the loading screen shows the real enemy faction/roster/count.
        const _pendingEnemy = window.__blsPendingEnemy || null;
        window.__blsPendingEnemy = null; // consume once
        // Track whether this launch came from custom battle (has a general to add +1 for)
        // vs sandbox/parler (npc.count already includes the full force, no general to add).
        window.__blsFromCustom = !!_pendingEnemy;
        const npc  = _pendingEnemy
            || ((arguments[_npcIdx] && typeof arguments[_npcIdx] === "object") ? arguments[_npcIdx] : fallbackNpc);
        const tile = (arguments[2] && typeof arguments[2] === "object") ? arguments[2] : fallbackTile;
        const nearCity = findNearestCity(npc);
        try { showBattleLoadingScreen(npc, tile, nearCity); }
        catch (e) { console.error("[BLS] showLoading (" + fnName + ")", e); }

        window.__battleLoadingActive  = true;
        window.__battleCullingEnabled = false;

        if (typeof window.EnemyTacticalAI !== "undefined" && window.EnemyTacticalAI.stop) {
            try { window.EnemyTacticalAI.stop(); } catch (e) {}
        }

        const result = orig.apply(this, arguments);

        setTimeout(_refreshLoadingScreenData, 110);

        if (typeof window.EnemyTacticalAI !== "undefined" && window.EnemyTacticalAI.stop) {
            try { window.EnemyTacticalAI.stop(); } catch (e) {}
        }
        if (typeof window.stopLazyGeneral === "function") {
            try { window.stopLazyGeneral(); } catch (e) {}
        }

        _runLoadingGate();
        return result;
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
            (window.enterBattlefield        && window.enterBattlefield.__blsPatched);
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