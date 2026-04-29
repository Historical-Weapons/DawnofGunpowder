//mobile adapter
(function () {
    "use strict";

    // ─────────────────────────────────────────────────────────────────────────
    // 0. UTILITIES
    // ─────────────────────────────────────────────────────────────────────────

    /** Returns true if we are on a small/touch device */
    function isMobile() {
        return window.innerWidth <= 900 || ('ontouchstart' in window);
    }

    /** Apply a style object to an element safely */
    function applyStyle(el, styles) {
        if (!el) return;
        Object.assign(el.style, styles);
    }

    /** Clamp a pixel value between min and max, scaled by vw */
    function vwClamp(min, preferred, max) {
        return `clamp(${min}px, ${preferred}vw, ${max}px)`;
    }

    /** Get or create an element by id */
    function getOrCreate(tag, id, appendTo) {
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement(tag);
            el.id = id;
            (appendTo || document.body).appendChild(el);
        }
        return el;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. GLOBAL RESPONSIVE CSS INJECTION
    // ─────────────────────────────────────────────────────────────────────────
    // We inject a <style> block once. This covers the raw HTML elements from
    // index.html that are hard to patch purely in JS.

    function injectGlobalCSS() {
        const id = "mob-ui-styles";
        if (document.getElementById(id)) return;
        const style = document.createElement("style");
        style.id = id;
        style.textContent = `

/* ──────────────────────────────────────────────
   GLOBAL TOUCH IMPROVEMENTS
   ────────────────────────────────────────────── */
   
   
/* Drawer overlay */
#mob-detail-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 9000;
    touch-action: none;
}

#mob-detail-overlay.open {
    display: block;
}

/* Drawer panel */
#mob-detail-panel {
    position: fixed;
    top: 0;
    right: 0;
    width: clamp(280px, 88vw, 420px);
    height: 100%;
    background: linear-gradient(to bottom, #1a0d0d, #0d0806);
    border-left: 2px solid #d4b886;
    z-index: 9001;
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
    font-family: 'Georgia', serif;
    color: #d4b886;
}

#mob-detail-panel.open {
    transform: translateX(0);
}

#mob-detail-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: linear-gradient(to bottom, #7b1a1a, #4a0a0a);
    border-bottom: 2px solid #ffca28;
    padding: 0 16px;
    height: 50px;
}

#mob-detail-header span {
    font-size: 15px;
    font-weight: bold;
    color: #f5d76e;
    text-transform: uppercase;
    letter-spacing: 2px;
}

#mob-detail-close {
    background: transparent;
    border: 1px solid #d4b886;
    color: #f5d76e;
    width: 32px;
    height: 32px;
    border-radius: 4px;
    font-size: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: manipulation;
}

#mob-detail-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    scrollbar-width: thin;
    scrollbar-color: #5d4037 rgba(0,0,0,0.3);
}

/* Section headings inside drawer */
.mob-section-title {
    font-size: 11px;
    font-weight: bold;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 2px;
    border-bottom: 1px solid #3e2723;
    padding-bottom: 6px;
    margin: 20px 0 10px 0;
}

.mob-section-title:first-child {
    margin-top: 0;
}

.mob-stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid rgba(93,64,55,0.25);
    font-size: 13px;
}

.mob-stat-row span:first-child { color: #d4b886; }
.mob-stat-row span:last-child  { color: #fff; font-weight: bold; }

.mob-hint-block {
    background: rgba(0,0,0,0.5);
    border: 1px solid #3e2723;
    border-radius: 4px;
    padding: 10px;
    font-size: 12px;
    line-height: 1.6;
    color: #ccc;
    margin-top: 8px;
}

/* Diplomacy log inside drawer */
#mob-dip-log {
    background: rgba(0,0,0,0.5);
    border: 1px inset #3e2723;
    border-radius: 4px;
    padding: 8px;
    max-height: 160px;
    overflow-y: auto;
    font-size: 11px;
    margin-top: 8px;
}

#mob-dip-btn {
    width: 100%;
    margin-top: 10px;
    background: linear-gradient(to bottom, #7b1a1a, #4a0a0a);
    color: #f5d76e;
    border: 1px solid #d4b886;
    border-radius: 4px;
    padding: 12px 10px;
    font-family: 'Georgia', serif;
    font-size: 13px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
    cursor: pointer;
    touch-action: manipulation;
}

/* Army roster blocks inside drawer */
.mob-troop-group {
    background: rgba(0,0,0,0.5);
    border: 1px solid #3e2723;
    border-radius: 4px;
    padding: 8px 10px;
    margin-bottom: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
}

.mob-troop-type { color: #fff; font-weight: bold; font-size: 13px; }
.mob-troop-meta { color: #8bc34a; font-size: 11px; margin-top: 2px; }
.mob-troop-count { color: #ffca28; font-weight: bold; font-size: 16px; }

/* XP bar */
.mob-xp-bar-bg {
    background: #222;
    height: 8px;
    border-radius: 4px;
    margin-top: 6px;
    overflow: hidden;
}
/* ──────────────────────────────────────────────
   CAMP SYSTEM BUTTONS (Centered & Scaled)
   ────────────────────────────────────────────── */
#camp-action-wrapper, #packup-wrapper {
    left: 50% !important;
    transform: translateX(-50%) !important;
    bottom: 30px !important;
    align-items: center !important; /* Centers the button and the error text */
    width: 100%;
    pointer-events: none; /* Lets you click through the wrapper... */
}

#encamp-btn, #packup-btn {
    pointer-events: auto; /* ...but keeps the button clickable */
    width: clamp(180px, 50vw, 300px) !important;
    min-height: 54px !important;
    font-size: clamp(14px, 4vw, 18px) !important;
    padding: 12px 24px !important;
    box-shadow: 0 6px 16px rgba(0,0,0,0.8) !important;
    border-radius: 8px !important;
    font-weight: bold !important;
    letter-spacing: 1px !important;
}

#camp-terrain-note {
    text-align: center !important;
    margin-top: 6px !important;
    font-size: clamp(10px, 3vw, 12px) !important;
}

#camp-info-panel {
    pointer-events: auto;
    text-align: center !important;
    margin-top: 8px !important;
    width: clamp(180px, 50vw, 300px) !important;
    box-sizing: border-box !important;
}

    /* Minimum tap target for every button */
    button, .menu-btn, select, input[type="number"] {
        min-height: 44px !important;
        min-width: 44px !important;
        font-size: clamp(13px, 3.5vw, 18px) !important;
        touch-action: manipulation;
    }

    /* ──────────────────────────────────────────
       OVERWORLD TOP-LEFT UI (#ui) — hidden on mobile,
       replaced by the Detail Menu drawer below.
       ────────────────────────────────────────── */
    #ui {
        display: none !important;
    }

    /* ──────────────────────────────────────────
       DIPLOMACY CONTAINER — hidden on mobile,
       its content surfaced inside Detail Menu.
       ────────────────────────────────────────── */
    #diplomacy-container {
        display: none !important;
    }

    /* ──────────────────────────────────────────
       CITY PANEL — full-width card at bottom
       ────────────────────────────────────────── */
    #city-panel {
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        transform: none !important;
        width: 100% !important;
        max-width: 100% !important;
        border-radius: 16px 16px 0 0 !important;
        padding: 16px 12px 24px !important;
        box-sizing: border-box !important;
        max-height: 85vh !important;
        overflow-y: auto !important;
    }

    #city-panel h2 {
        font-size: clamp(1.2rem, 5vw, 2rem) !important;
    }

    #city-panel .city-stat {
        font-size: clamp(0.85rem, 3.5vw, 1.1rem) !important;
    }

    /* Make city-panel grid single column on very small phones */
    #city-panel > div[style*="grid-template-columns"] {
        grid-template-columns: 1fr 1fr !important;
        gap: 8px !important;
    }

    /* City action buttons full width */
    #recruit-box, #hostile-box {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 10px !important;
    }

    #recruit-box .menu-btn,
    #hostile-box .menu-btn,
    #siege-button, #assault-button, #peace-button {
        width: 100% !important;
        font-size: clamp(12px, 3.5vw, 16px) !important;
        padding: 12px 10px !important;
    }

    /* ──────────────────────────────────────────
       SIEGE GUI — centred card with bigger buttons
       ────────────────────────────────────────── */
    #siege-gui {
        width: clamp(280px, 90vw, 400px) !important;
        top: 70px !important;
        padding: 16px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
    }

    #siege-gui .menu-btn {
        padding: 14px 10px !important;
        font-size: clamp(13px, 3.5vw, 16px) !important;
        margin-bottom: 12px !important;
    }

    /* Sally-out floating button */
    #gui-sally-btn {
        width: clamp(260px, 85vw, 340px) !important;
        font-size: clamp(14px, 4vw, 18px) !important;
        padding: 16px 10px !important;
        top: auto !important;
        bottom: 30px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
    }

    /* ──────────────────────────────────────────
       SIEGE SALLY PROMPT (#siege-sally-prompt)
       ────────────────────────────────────────── */
    #siege-sally-prompt {
        width: clamp(280px, 90vw, 400px) !important;
        padding: 20px 16px !important;
        left: 50% !important;
        top: 50% !important;
        transform: translate(-50%, -50%) !important;
    }

    #siege-sally-actions {
        flex-wrap: wrap !important;
        gap: 10px !important;
    }

    #siege-sally-actions .menu-btn {
        flex: 1 1 40% !important;
    }

    /* ──────────────────────────────────────────
       PARLE / DIPLOMACY MODAL
       ────────────────────────────────────────── */
    #parle-panel {
        width: clamp(280px, 95vw, 560px) !important;
        min-width: unset !important;
        padding: 16px !important;
        max-height: 90vh !important;
        overflow-y: auto !important;
    }

    #parle-header h2 {
        font-size: clamp(1.2rem, 5vw, 2rem) !important;
    }

    .parle-stat-grid {
        grid-template-columns: 1fr !important;
    }

    #parle-action-box {
        flex-direction: column !important;
        align-items: stretch !important;
    }

    #parle-action-box .menu-btn {
        width: 100% !important;
    }
/* ──────────────────────────────────────────
       DIPLOMACY PANEL (Full Screen Maximized)
       ────────────────────────────────────────── */
  #diplomacy-panel {
    width: 100vw !important;  /* Full width of the viewport */
    height: 100vh !important; /* Full height of the viewport */
    top: 0 !important;        /* Snap to the top edge */
    left: 0 !important;       /* Snap to the left edge */
    transform: none !important; /* Remove the centering offset */
    padding: 10px !important;
    box-sizing: border-box !important;
    border-radius: 0 !important;
    z-index: 10001 !important;
    background: #1a0d0d !important; /* Opaque background to hide the map entirely */
    position: fixed !important;    /* Ensure it stays over the entire screen */
}

#diplomacy-table-container {
    overflow: auto !important; 
    -webkit-overflow-scrolling: touch !important; 
    width: 100% !important;
    /* height is set to fill the panel minus space for a header or close button */
    height: calc(100% - 50px) !important; 
    display: block !important;
    background: rgba(0,0,0,0.2) !important;
}

.dip-table {
    /* min-width forces horizontal scrolling if the screen is too narrow */
    min-width: 1000px !important; 
    font-size: 11px !important;   /* Slightly larger for better readability on high-res mobile screens */
    border-collapse: collapse !important;
    width: 100% !important;
}

.dip-table td, .dip-table th {
    padding: 6px 4px !important; /* Added a bit more padding for touch targets */
    height: 35px !important;    /* Taller rows for easier tapping */
    border: 1px solid rgba(212,184,134,0.3) !important;
    text-align: center;
}

.dip-row-label {
    position: sticky !important;
    left: 0 !important;
    background: #1a0d0d !important;
    z-index: 15 !important;
    padding: 0 8px !important;
    border-right: 2px solid #d4b886 !important;
    font-weight: bold;
}
    /* SCROLLBAR VISIBILITY (Essential for Mobile) */
    #diplomacy-table-container::-webkit-scrollbar {
        height: 12px !important; /* THICK horizontal bar for thumb-scrolling */
        width: 12px !important;  /* THICK vertical bar */
        display: block !important;
    }
    #diplomacy-table-container::-webkit-scrollbar-thumb {
        background: #d4b886 !important; /* Bright Gold */
        border: 2px solid #000 !important;
        border-radius: 6px !important;
    }
    #diplomacy-table-container::-webkit-scrollbar-track {
        background: rgba(0,0,0,0.8) !important;
    }
/* ──────────────────────────────────────────────
   DETAIL MENU DRAWER (injected by mobile_ui.js)
   ────────────────────────────────────────── */

/* SURGERY: Forces desktop UI to hide when the drawer is open */
body.detail-drawer-open #ui,
body.detail-drawer-open #diplomacy-container {
    display: none !important;
}

#mob-detail-btn {
    display: none; /* Hidden by default, shown via .visible class */
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%); /* Centers it perfectly on Desktop */
    z-index: 8999;
    
    background: linear-gradient(to bottom, #7b1a1a, #4a0a0a);
    color: #f5d76e;
    border: 2px solid #ffca28;
    border-radius: 6px;
    padding: 0 18px;
    height: 44px;
    font-family: 'Georgia', serif;
    font-size: 14px;
    font-weight: bold;
    letter-spacing: 1px;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.7);
    touch-action: manipulation;
    align-items: center;
    gap: 8px;
}

@media (max-width: 900px), (pointer: coarse) {
    #mob-detail-btn {
        left: auto;
        right: 12px;
        transform: none;
    }
}
#mob-detail-btn.visible {
    display: flex;
}


















        `; // end style.textContent
        document.head.appendChild(style);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. DETAIL MENU DRAWER  (replaces #ui + #diplomacy-container on mobile)
    // ─────────────────────────────────────────────────────────────────────────

    function buildDetailDrawer() {
        // Button
        const btn = getOrCreate("button", "mob-detail-btn");
        btn.innerHTML = `<span style="font-size:18px;">≡</span> DETAIL`;

        // Overlay (tap-outside-to-close)
        const overlay = getOrCreate("div", "mob-detail-overlay");

        // Panel
        const panel = getOrCreate("div", "mob-detail-panel");
        if (!panel.dataset.built) {
            panel.dataset.built = "1";
            panel.innerHTML = `
                <div id="mob-detail-header">
                    <span>🧨 DETAIL MENU</span>
                    <button id="mob-detail-close" aria-label="Close">✕</button>
                </div>
                <div id="mob-detail-body">
                    <!-- Filled dynamically on open -->
                </div>
            `;
        }

        document.getElementById("mob-detail-close").onclick = closeDetailDrawer;
        overlay.onclick = closeDetailDrawer;
        btn.onclick = openDetailDrawer;
    }

function openDetailDrawer() {
    window.isMobileDrawerOpen = true; // NEW: Set flag
    document.getElementById("mob-detail-overlay").classList.add("open");
    document.getElementById("mob-detail-panel").classList.add("open");
    
    document.body.style.overflow = "hidden"; 
    refreshDetailDrawer();
    
    // SURGERY: Apply bulletproof CSS class to beat the game loop
    document.body.classList.add("detail-drawer-open");
}

function closeDetailDrawer() {
    window.isMobileDrawerOpen = false; // NEW: Reset flag
    document.getElementById("mob-detail-overlay").classList.remove("open");
    document.getElementById("mob-detail-panel").classList.remove("open");
    
    document.body.style.overflow = ""; 
    
    // SURGERY: Remove the class to let the game loop restore the UI
    document.body.classList.remove("detail-drawer-open");
}
    /**
     * Pulls live data from DOM elements and the player object,
     * then renders the full drawer content.
     */
    function refreshDetailDrawer() {
        const body = document.getElementById("mob-detail-body");
        if (!body) return;

        // ── a) Overworld Stats (from #ui) ──────────────────────────────────
        const terrain = document.getElementById("terrain-text")?.innerText || "—";
        const speed   = document.getElementById("speed-text")?.innerText  || "—";
        const coords  = document.getElementById("loc-text")?.innerText    || "—";
        const zoom    = document.getElementById("zoom-text")?.innerText   || "—";

let html = `
            <div class="mob-section-title">📍 Overworld Info</div>
            <div class="mob-stat-row"><span>Region</span><span>${terrain}</span></div>
            <div class="mob-stat-row"><span>Coordinates</span><span>${coords}</span></div>
            <div class="mob-stat-row"><span>March Speed</span><span>${speed}</span></div>
<div class="mob-section-title">🏆 The Goal</div>
            <div class="mob-hint-block" style="line-height: 1.5; font-size: 0.95em; border-left: 3px solid #f8d96d; background: rgba(248, 217, 109, 0.05);">
                Rise from a lone commander to a Great Emperor. <b>Recruit units</b> from local towns, <b>grow your veteran core</b> through battle, and <b>lay siege to great cities</b> to expand your borders and establish your dynasty.
            </div>
			
            <div class="mob-section-title">💰 Economy & Growth</div>
            <div class="mob-hint-block" style="line-height: 1.5; font-size: 0.95em;">
                <b style="color:#f8d96d">🏗️ TOWNS:</b> Hubs for recruitment. Peace boosts their economy, while sieges paralyze trade.<br><br>
                <b style="color:#f8d96d">🐫 COMMERCE:</b> Caravans travel between factions. Protecting friendly traders ensures gold flow; raiding enemy ones starves their war machine.<br><br>
                <b style="color:#f8d96d">⚔️ VETERANCY:</b> Units gain experience through survival. A small band of veterans can often break a massive horde of raw recruits.
            </div>

            <div class="mob-section-title">📜 State of the Realm</div>
            <div class="mob-hint-block" style="line-height: 1.5; font-size: 0.95em;">
                <b style="color:#f8d96d">🕊️ DIPLOMACY:</b> Factions start at <b>Peace</b>. Conflict is a choice—once war is declared, trade stops and the "Sally Out" mechanics begin.<br><br>
                <b style="color:#f8d96d">🏔️ GEOGRAPHY:</b> The world is vast. Use the <b>Plains</b> for fast land travel, <b>Water</b> for faster ocean travel, and the <b>Trade Routes</b> for wealth.
            </div>
        `;

        // ── b) Diplomacy log (mirrors #event-log-container) ────────────────
        const logSrc = document.getElementById("event-log-container");
        const logHTML = logSrc ? logSrc.innerHTML : "<em>No events yet.</em>";
html += `
            <div class="mob-section-title">📜 Events</div>
            <div id="mob-dip-log">${logHTML}</div>
            <button id="mob-dip-btn" class="menu-btn" style="width: 100%; margin-top: 10px; padding: 12px 10px;" onclick="if(window.mobileUI) window.mobileUI.closeDetailDrawer(); if(typeof toggleDiplomacyMenu === 'function') toggleDiplomacyMenu();">
                Open Diplomacy Table
            </button>
            <button id="mob-saveload-btn" class="menu-btn" style="width: 100%; margin-top: 10px; padding: 12px 10px; background: linear-gradient(to bottom, #1a4a0a, #0a2a04); border-color: #8bc34a; color: #8bc34a;" onclick="if(window.SaveSystem) { if(window.mobileUI) window.mobileUI.closeDetailDrawer(); window.SaveSystem.openPanel(); }">
                💾 Save Game
            </button>
            <button id="mob-quest-btn" class="menu-btn" style="width: 100%; margin-top: 10px; padding: 12px 10px; background: linear-gradient(to bottom, #4a3a00, #22180a); border-color: #ffe600; color: #ffe600;" onclick="if(window.mobileUI) window.mobileUI.closeDetailDrawer(); if(window.QuestSystem) window.QuestSystem.openQuestLog();">
                📜 Quest Log
            </button>
<button id="mob-mainmenu-btn" class="menu-btn" style="width: 100%; margin-top: 10px; padding: 12px 10px; background: linear-gradient(to bottom, #4a0a0a, #1a0505); border-color: #ff5252; color: #ff5252;" onclick="window.location.reload();">
    🚪 Quit to Main Menu
</button>
        `;
        // ── c) Player / Army Roster ────────────────────────────────────────
        const p = (typeof player !== "undefined") ? player : null;
        if (p) {
            const lvl        = p.experienceLevel || 1;
            const exp        = Math.floor(p.experience || 0);
            const expNeeded  = lvl * 10;
            const xpPct      = Math.min(100, Math.round((exp / expNeeded) * 100));
            const hp         = Math.floor(p.hp || 0);
			const maxHp      = p.maxHealth || 100;
            const gold       = Math.floor(p.gold || 0);
            const food       = Math.floor(p.food || 0);
            const troops     = p.troops || 0;
            const cohesion   = p.cohesion !== undefined ? Math.floor(p.cohesion) : 70; // NEW COHESION STAT

            html += `
                <div class="mob-section-title">⚔️ Commander Status</div>
                <div class="mob-stat-row"><span>Level</span><span>${lvl}</span></div>
                <div class="mob-stat-row"><span>Experience</span><span>${exp} / ${expNeeded} XP</span></div>
                <div class="mob-xp-bar-bg"><div class="mob-xp-bar-fill" style="width:${xpPct}%"></div></div>
                <div class="mob-stat-row" style="margin-top:8px"><span>Hit Points</span><span>${hp} / ${maxHp}</span></div>
                <div class="mob-stat-row"><span>Army Cohesion</span><span style="color:${cohesion >= 50 ? '#8bc34a' : '#ff5252'}">${cohesion}%</span></div>
                <div class="mob-stat-row"><span>Melee Attack</span><span>${p.meleeAttack || 0}</span></div>
                <div class="mob-stat-row"><span>Melee Defense</span><span>${p.meleeDefense || 0}</span></div>
                <div class="mob-section-title">💰 Resources</div>
<div class="mob-stat-row"><span>Gold</span><span style="color:#ffca28">${gold}</span></div>
    <div class="mob-stat-row"><span>Food</span><span style="color:#8bc34a">${food}</span></div>
    <div class="mob-stat-row"><span>Total Force</span><span>${troops} men</span></div>
`;

// --- SURGERY: Dynamically inject Player Inventory ---
let cargoUsed = 0;
let inventoryHtml = "";
if (p.inventory && typeof RESOURCE_CATALOG !== 'undefined') {
    for (let rid in p.inventory) {
        let amount = p.inventory[rid];
        if (amount > 0 && RESOURCE_CATALOG[rid]) {
            let res = RESOURCE_CATALOG[rid];
            cargoUsed += amount;
            inventoryHtml += `<div class="mob-stat-row"><span>${res.emoji} ${res.label}</span><span style="color:#fff">${amount}</span></div>`;
        }
    }
}
let cargoMax = p.cargoCapacity || 50;
let cargoColor = cargoUsed >= cargoMax ? '#ff5252' : '#8bc34a';

if (inventoryHtml !== "") {
    html += `<div class="mob-section-title">🎒 Cargo (${cargoUsed}/${cargoMax})</div>` + inventoryHtml;
} else {
    html += `<div class="mob-section-title">🎒 Cargo (0/${cargoMax})</div><div class="mob-hint-block" style="color:#888">Inventory is empty.</div>`;
}
// ----------------------------------------------------

html += `
    <div class="mob-section-title">🪖 Army Roster</div>
            `;

            // Build dynamic troop groups from roster (same logic as player_overlay_system.js)
            if (p.roster && p.roster.length > 0) {
                const groups = {};
                p.roster.forEach(t => {
                    if ((t.count || 1) > 0) {
                        const key = (t.type || t.name || "Unit") + "_" + (t.lvl || 1);
                        if (!groups[key]) {
                            groups[key] = {
                                type: t.type || t.name || "Unit",
                                count: 0,
                                lvl: t.lvl || 1,
                                exp: t.exp || 0
                            };
                        }
                        groups[key].count += (t.count !== undefined ? t.count : 1);
                    }
                });

                const entries = Object.values(groups).sort((a, b) => a.type.localeCompare(b.type));
                if (entries.length === 0) {
                    html += `<div class="mob-hint-block" style="color:#888">No troops in roster.</div>`;
                } else {
                    entries.forEach(u => {
                        const expPct = typeof u.exp === "number"
                            ? (u.exp % 1 !== 0 ? ((u.exp % 1) * 100).toFixed(0) : u.exp)
                            : u.exp;
                        html += `
                            <div class="mob-troop-group">
                                <div>
                                    <div class="mob-troop-type">${u.type.toUpperCase()}</div>
                                    <div class="mob-troop-meta">Lvl ${u.lvl} &nbsp;|&nbsp; EXP ${expPct}%</div>
                                </div>
                                <div class="mob-troop-count">×${u.count}</div>
                            </div>
                        `;
                    });
                }
            } else {
                html += `<div class="mob-hint-block" style="color:#888">No troops recruited yet.</div>`;
            }

        } else {
            html += `
                <div class="mob-section-title">⚔️ Commander</div>
                <div class="mob-hint-block" style="color:#888">Player data not available yet.</div>
            `;
        }

        body.innerHTML = html;

        // Scroll the dip log to bottom to match existing behaviour
        const mobLog = document.getElementById("mob-dip-log");
        if (mobLog) mobLog.scrollTop = mobLog.scrollHeight;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. MAIN MENU PATCHES  (menu.js)
    // ─────────────────────────────────────────────────────────────────────────
    // The main menu builds itself dynamically; we use a MutationObserver to
    // catch the #main-menu div when it appears and patch its styles.

    function patchMainMenu(menuEl) {
        if (!isMobile()) return;
        if (menuEl.dataset.mobPatched) return;
        menuEl.dataset.mobPatched = "1";

        // Title
        const title = menuEl.querySelector("h1");
        if (title) {
            title.style.fontSize  = vwClamp(24, 8, 56);
            title.style.letterSpacing = "4px";
            title.style.marginBottom  = "24px";
        }

        // Subtitle / version text
        const sub = menuEl.querySelectorAll("p, .menu-subtitle");
        sub.forEach(el => {
            el.style.fontSize  = vwClamp(12, 3.5, 18);
            el.style.textAlign = "center";
        });

        // All menu buttons
        menuEl.querySelectorAll("button").forEach(btn => {
            btn.style.width     = "clamp(200px, 75vw, 320px)";
            btn.style.padding   = "14px 20px";
            btn.style.fontSize  = vwClamp(13, 4, 20);
            btn.style.margin    = "8px auto";
        });

        // The UI container holding buttons
        const uiContainer = menuEl.querySelector("[style*='flexDirection']") ||
                            menuEl.querySelector("[style*='flex-direction']");
        if (uiContainer) {
            uiContainer.style.width = "100%";
            uiContainer.style.alignItems = "center";
            uiContainer.style.padding = "0 16px";
            uiContainer.style.boxSizing = "border-box";
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. LOADING SCREEN PATCHES  (loading-screen.js)
    // ─────────────────────────────────────────────────────────────────────────
    // The loading screen wrapper is built once on DOMContentLoaded. We patch
    // it into portrait-friendly stacked layout.

   function patchLoadingScreen() {
    const wrapper = document.getElementById("loading-screen-wrapper");
    if (!wrapper || wrapper.dataset.mobPatched) return;
    if (!isMobile()) return;
    wrapper.dataset.mobPatched = "1";

    const isPortrait = window.innerHeight > window.innerWidth;

    // Whole screen
    wrapper.style.justifyContent = "center";
    wrapper.style.alignItems = "center";
    wrapper.style.paddingTop = "16px";
    wrapper.style.paddingBottom = "16px";

    // LOADING text
    const header = wrapper.firstElementChild;
    if (header) {
        header.style.fontSize = vwClamp(18, 5.5, 34);
        header.style.letterSpacing = "4px";
        header.style.marginBottom = "12px";
        header.style.textAlign = "center";
        header.style.width = "100%";
    }

    // Main content area
    const content = wrapper.children[1];
    if (content) {
        content.style.display = "flex";
        content.style.flexDirection = "column-reverse"; // portrait goes to the bottom
        content.style.width = "92vw";
        content.style.maxWidth = "560px";
        content.style.gap = "12px";
        content.style.transform = "none";
        content.style.alignItems = "center";
        content.style.justifyContent = "center";
        content.style.margin = "0 auto";
    }

    // Portrait block
    const canvasContainer = content?.children[0];
    if (canvasContainer) {
        canvasContainer.style.order = "2";
        canvasContainer.style.width = "100%";
        canvasContainer.style.maxWidth = "320px";
        canvasContainer.style.height = isPortrait ? "26vh" : "30vh";
        canvasContainer.style.minHeight = "220px";
        canvasContainer.style.display = "flex";
        canvasContainer.style.alignItems = "center";
        canvasContainer.style.justifyContent = "center";
        canvasContainer.style.margin = "0 auto";
    }

    const canvas = canvasContainer?.querySelector("canvas");
    if (canvas) {
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.display = "block";
    }

    // Text panel
    const infoPanel = content?.children[1];
    if (infoPanel) {
        infoPanel.style.order = "1";
        infoPanel.style.width = "100%";
        infoPanel.style.maxWidth = "100%";
        infoPanel.style.display = "flex";
        infoPanel.style.flexDirection = "column";
        infoPanel.style.alignItems = "center";
        infoPanel.style.textAlign = "center";
        infoPanel.style.gap = "10px";
    }

    // Unit name
    const unitName = infoPanel?.children[0];
    if (unitName) {
        unitName.style.fontSize = vwClamp(14, 4.5, 28);
        unitName.style.textAlign = "center";
        unitName.style.width = "100%";
    }

    // Unit description
    const unitDesc = infoPanel?.children[1];
    if (unitDesc) {
        unitDesc.style.fontSize = vwClamp(10, 2.8, 14);
        unitDesc.style.lineHeight = "1.35";
        unitDesc.style.textAlign = "center";
        unitDesc.style.width = "100%";
        unitDesc.style.margin = "0 auto";
    }

    const statsGrid = infoPanel?.children[2];
    if (statsGrid) {
        statsGrid.style.display = "grid"; // Ensure display is grid
        statsGrid.style.width = "100%";
        statsGrid.style.maxWidth = "520px";
        
        // Change the gap (12px or more is usually better for mobile columns)
        statsGrid.style.gap = "6px 20px"; // The first value is row gap, the second is column gap
        
        // If wider than 480px, ensure it splits into two columns
        statsGrid.style.gridTemplateColumns = window.innerWidth < 480 ? "1fr" : "1fr 1fr";
        
        statsGrid.style.fontSize = vwClamp(9, 2.6, 13);
        statsGrid.style.marginTop = "8px";
        statsGrid.style.justifyItems = "stretch";
    }

    // Center each stat row
    if (statsGrid) {
        statsGrid.querySelectorAll("div").forEach(row => {
            row.style.fontSize = vwClamp(9, 2.6, 13);
            row.style.width = "100%";
        });
    }
}
    // ─────────────────────────────────────────────────────────────────────────
    // 5. CUSTOM BATTLE GUI PATCHES  (custom_battle_gui.js)
    // ─────────────────────────────────────────────────────────────────────────
    // The CB menu is built dynamically; we observe its creation.

    function patchCustomBattleMenu(containerEl) {
        if (!isMobile()) return;
        if (containerEl.dataset.mobPatched) return;
        containerEl.dataset.mobPatched = "1";

        // ── 5a. Header: stack vertically ───────────────────────────────────
        const header = containerEl.querySelector("div[style*='80px']") ||
                       containerEl.firstElementChild;
        if (header) {
            header.style.height        = "auto";
            header.style.flexDirection = "column";
            header.style.alignItems    = "stretch";
            header.style.padding       = "10px 12px";
            header.style.gap           = "8px";
        }

        // Title h1
        const h1 = containerEl.querySelector("h1");
        if (h1) {
            h1.style.fontSize     = vwClamp(16, 5, 28);
            h1.style.letterSpacing = "2px";
        }

        // Settings selects/inputs — make them full-width on mobile
        const settingsBox = containerEl.querySelector("[id='cb-map-select']")?.closest("div[style]");
        if (settingsBox) {
            settingsBox.style.flexWrap = "wrap";
            settingsBox.style.gap      = "8px";

            settingsBox.querySelectorAll("select, input").forEach(el => {
                el.style.width    = "100%";
                el.style.minWidth = "0";
                el.style.boxSizing = "border-box";
            });

            settingsBox.querySelectorAll("div").forEach(div => {
                div.style.flex    = "1 1 45%";
                div.style.minWidth = "0";
            });
        }

        // Action buttons (Main Menu / Random / Start)
        const actionBox = header?.lastElementChild;
        if (actionBox) {
            actionBox.style.display       = "flex";
            actionBox.style.flexWrap      = "wrap";
            actionBox.style.gap           = "6px";
            actionBox.style.justifyContent = "center";

            actionBox.querySelectorAll("button").forEach(btn => {
                btn.style.flex      = "1 1 30%";
                btn.style.minWidth  = "80px";
                btn.style.padding   = "10px 6px";
                btn.style.fontSize  = vwClamp(11, 3, 15);
            });
        }

        // ── 5b. Body: stack attacker/defender panels vertically ────────────
        const body = header?.nextElementSibling;
        if (body) {
            body.style.flexDirection = "column";
            body.style.overflowY     = "auto";
            body.style.height        = "auto";
            body.style.flex          = "1";

            body.querySelectorAll(":scope > div").forEach(panel => {
                panel.style.width     = "100%";
                panel.style.minHeight = "300px";
                panel.style.borderRight = "none";
                panel.style.borderBottom = "2px solid #000";
            });
        }

        // ── 5c. Army panel internals ───────────────────────────────────────
        containerEl.querySelectorAll("button").forEach(btn => {
            btn.style.minHeight = "40px";
            btn.style.fontSize  = vwClamp(11, 3, 15);
        });

        // Unit cards / roster list items
        containerEl.querySelectorAll("[style*='border: 1px solid #d4b886']").forEach(card => {
            card.style.fontSize = vwClamp(11, 3, 14);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. TROOP GUI PATCHES  (troopGUI.js)
    // ─────────────────────────────────────────────────────────────────────────
    // troopGUI.renderMenu() writes innerHTML each time; we patch the rendered
    // DOM when the menu is opened.

    function patchTroopGUI() {
        const menuDiv = document.getElementById("settlement-upgrade-menu");
        if (!menuDiv || !isMobile()) return;

// ── 6a. Root container ─────────────────────────────────────────────
        applyStyle(menuDiv, {
            top:     "0",
            left:    "0",
            width:   "100vw",
            height:  "100dvh", // Changed to dvh (dynamic viewport) to beat mobile UI bars
            padding: "12px",
            // overflowY: "auto", <-- Removed to stop scrolling conflict with the inner grid
            boxSizing: "border-box",
        });

        // ── 6b. Header row (title + treasury/recruit) ─────────────────────
        const headerRow = menuDiv.querySelector(
            "div[style*='justify-content: space-between']"
        );
        if (headerRow) {
            headerRow.style.flexDirection = "column";
            headerRow.style.gap           = "10px";
            headerRow.style.alignItems    = "stretch";
        }

        // H1
        const h1 = menuDiv.querySelector("h1");
        if (h1) {
            h1.style.fontSize = vwClamp(16, 5, 32);
        }

        // Treasury badge
        const treasury = menuDiv.querySelector("[style*='ffca28'][style*='padding: 10px 20px']");
        if (treasury) {
            treasury.style.fontSize  = vwClamp(13, 4, 22);
            treasury.style.textAlign = "center";
        }

        // Recruit unique button
        const recruitBtn = menuDiv.querySelector("button[style*='letter-spacing']");
        if (recruitBtn) {
            recruitBtn.style.width    = "100%";
            recruitBtn.style.maxWidth = "100%";
            recruitBtn.style.fontSize = vwClamp(12, 3.5, 16);
        }

        // ── 6c. Upgrade paths info strip ─────────────────────────────────
        const pathsBox = menuDiv.querySelector("[style*='flex-wrap: wrap'][style*='gap: 15px']");
        if (pathsBox) {
            pathsBox.style.flexDirection = "column";
            pathsBox.style.gap           = "6px";
            pathsBox.querySelectorAll("div").forEach(d => {
                d.style.fontSize = vwClamp(10, 2.8, 13);
            });
        }

// ── 6d. Unit card grid → single column on narrow ─────────────────
        const grid = menuDiv.querySelector(
            "[style*='grid-template-columns: repeat(auto-fill']"
        );
        if (grid) {
            grid.style.gridTemplateColumns = window.innerWidth < 560
                ? "1fr"
                : "repeat(auto-fill, minmax(260px, 1fr))";
            grid.style.gap = "14px";
            grid.style.paddingBottom = "80px"; // Adds padding to the bottom of the scrollable list
        }

        // ── 6e. All upgrade buttons ───────────────────────────────────────
        menuDiv.querySelectorAll("button[style*='font-size: 1.1rem']").forEach(btn => {
            btn.style.fontSize  = vwClamp(12, 3.5, 16);
            btn.style.padding   = "12px 10px";
            btn.style.width     = "100%";
        });

        // ── 6f. Close button ──────────────────────────────────────────────
        const closeBtn = menuDiv.querySelector("button[onclick*='closeUpgradeMenu']");
        if (closeBtn) {
            closeBtn.style.width    = "90%";
            closeBtn.style.fontSize = vwClamp(14, 4, 20);
            closeBtn.style.padding  = "14px";
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. CITY PANEL PATCHES  (supplemental — CSS does most of the work)
    // ─────────────────────────────────────────────────────────────────────────
    // The CSS handles layout. We patch JS-driven inline styles here if needed.

    function patchCityPanel() {
        const panel = document.getElementById("city-panel");
        if (!panel || !isMobile()) return;
        // JS-side: ensure no left: 50% transform is left behind
        panel.style.left      = "0";
        panel.style.right     = "0";
        panel.style.bottom    = "0";
        panel.style.transform = "none";
        panel.style.width     = "100%";
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 8. CONTROLS PLACEHOLDER (future mobile controls)
    // ─────────────────────────────────────────────────────────────────────────
    // All existing keyboard/mouse listeners in index.html and other JS files
    // are preserved as-is. This section is the designated place to add
    // on-screen touch controls in a future iteration.

    window.MobileControls = (function () {
        /*
         * ┌─────────────────────────────────────────────────────────────────┐
         * │  FUTURE MOBILE CONTROLS — PLACEHOLDER                          │
         * │                                                                 │
         * │  Planned additions:                                             │
         * │   • D-pad / virtual joystick for WASD movement                 │
         * │   • Pinch-to-zoom gesture handler for the game canvas           │
         * │   • On-screen formation buttons (1-5 + Z/X/V/C/B/Q/R/E/F)     │
         * │   • Long-press context menu for selecting/commanding units      │
         * │   • Battle speed toggle button                                  │
         * │                                                                 │
         * │  HOW TO ADD:                                                    │
         * │   1. Call MobileControls.init() after the game canvas is ready  │
         * │   2. Each control fires the same keyboard events the desktop     │
         * │      version already handles (KeyboardEvent dispatch)           │
         * └─────────────────────────────────────────────────────────────────┘
         */

        function init() {
            if (!isMobile()) return;
            // ── TODO: build on-screen D-pad ──
            // ── TODO: attach pinch-zoom to gameCanvas ──
            // ── TODO: build formation button row ──
            console.log("[MobileControls] Placeholder initialised — no controls added yet.");
        }

        /** Helper: simulate a keydown/keyup pair for a given key code */
        function simulateKey(key) {
            const down = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
            const up   = new KeyboardEvent("keyup",   { key, bubbles: true, cancelable: true });
            document.dispatchEvent(down);
            document.dispatchEvent(up);
        }

        return { init, simulateKey };
    })();

    // ─────────────────────────────────────────────────────────────────────────
    // 9. MUTATION OBSERVER — watch for dynamically-created panels
    // ─────────────────────────────────────────────────────────────────────────

    function startObserver() {
        const observer = new MutationObserver(mutations => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1) continue;

                    // Main menu
                    if (node.id === "main-menu") {
                        patchMainMenu(node);
                    }

                    // Custom Battle GUI
                    if (node.id === "cb-menu-container") {
                        // Small delay so all children have been appended
                        setTimeout(() => patchCustomBattleMenu(node), 50);
                    }

                    // Loading screen wrapper (built on DOMContentLoaded)
                    if (node.id === "loading-screen-wrapper") {
                        setTimeout(() => patchLoadingScreen(), 60);
                    }

                    // TroopGUI (settlement-upgrade-menu shown/hidden)
                    if (node.id === "settlement-upgrade-menu") {
                        // Also hook via display changes below
                    }
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Also watch attribute changes so we catch troopGUI opening
        const attrObserver = new MutationObserver(mutations => {
            for (const m of mutations) {
                const el = m.target;
                if (el.id === "settlement-upgrade-menu") {
                    if (el.style.display !== "none") {
                        requestAnimationFrame(() => patchTroopGUI());
                    }
                }
                // City panel opened
                if (el.id === "city-panel") {
                    if (el.style.display !== "none") {
                        patchCityPanel();
                    }
                }
            }
        });

        // Observe all direct children of body for style changes
        document.body.childNodes.forEach(child => {
            if (child.nodeType === 1) {
                attrObserver.observe(child, { attributes: true, attributeFilter: ["style"] });
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 10. SHOW / HIDE MOBILE BUTTON based on context
    // ─────────────────────────────────────────────────────────────────────────
    // The Detail button is only shown on the overworld (not in battle/city mode).
function syncDetailButtonVisibility() {
        const btn = document.getElementById("mob-detail-btn");
        if (!btn) return;

        const inBattle = (typeof inBattleMode !== "undefined" && inBattleMode);
        const inCity   = (typeof inCityMode   !== "undefined" && inCityMode);
        const inParle  = (typeof inParleMode  !== "undefined" && inParleMode);
        
        // SURGERY: Detect if the Main Menu or Loading Screen is currently active
        const mainMenu = document.getElementById("main-menu");
        const onMenu   = !!(mainMenu && mainMenu.style.opacity !== "0" && mainMenu.style.display !== "none");
        const isLoading = document.body.classList.contains('is-loading-state');
const isGameStateValid = !inBattle && !inCity && !inParle && !onMenu && !isLoading;

// 1. Mobile button visibility (Enabled for PC testing)
if (isGameStateValid) { 
    btn.classList.add("visible");
    // Ensure it's not set to display:none by old CSS
    btn.style.display = "flex"; 
} else {
    btn.classList.remove("visible");
    btn.style.display = "none";
}

        // 2. Dual-purpose drawer protection:
        // Only close the drawer if the game state changes (e.g., entering a battle),
        // NOT just because the user is on a PC!
        if (!isGameStateValid) {
            closeDetailDrawer();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 11. RESPONSIVE RESIZE HANDLER
    // ─────────────────────────────────────────────────────────────────────────

    function onResize() {
        syncDetailButtonVisibility();

        // Re-patch any already-rendered panels
        const cbMenu = document.getElementById("cb-menu-container");
        if (cbMenu) patchCustomBattleMenu(cbMenu);

        const troopMenu = document.getElementById("settlement-upgrade-menu");
        if (troopMenu && troopMenu.style.display !== "none") patchTroopGUI();

        patchLoadingScreen();

        // Mirror diplomacy log into drawer if open
        if (document.getElementById("mob-detail-panel")?.classList.contains("open")) {
            refreshDetailDrawer();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 12. BOOTSTRAP
    // ─────────────────────────────────────────────────────────────────────────

    function init() {
        injectGlobalCSS();
        buildDetailDrawer();
        startObserver();

        // Initial sync
        syncDetailButtonVisibility();

        // Patch loading screen if already built
        patchLoadingScreen();

        // Refresh detail button visibility every second
        // (game mode flags change after battles end)
        setInterval(syncDetailButtonVisibility, 1000);

        // Resize events
        window.addEventListener("resize", onResize, { passive: true });
window.mobileUI = {
            refreshDetailDrawer,
            patchTroopGUI,
            patchMainMenu,
            patchCustomBattleMenu,
            closeDetailDrawer,
            openDetailDrawer
        };

        MobileControls.init();

        console.log("[mobile_ui.js] Loaded ✓");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();


 