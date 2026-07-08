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
    left: 5%;
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
            const troops     = (p.roster && p.roster.length > 0) ? p.roster.length : (p.troops || 0);
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
                // Derive the authoritative troop total directly from the roster array,
                // not from p.troops which may be stale after scenario launch.
                const rosterTotal = p.roster.reduce((sum, t) => sum + (t.count !== undefined ? t.count : 1), 0);

                const groups = {};
                p.roster.forEach(t => {
                    // Guard: skip zero-count entries
                    const entryCount = t.count !== undefined ? t.count : 1;
                    if (entryCount <= 0) return;
                    const key = (t.type || t.name || "Unit") + "_" + (t.lvl || t.experienceLevel || 1);
                    if (!groups[key]) {
                        groups[key] = {
                            type: t.type || t.name || "Unit",
                            count: 0,
                            lvl: t.lvl || t.experienceLevel || 1,
                            exp: t.exp || 0
                        };
                    }
                    groups[key].count += entryCount;
                });

                const entries = Object.values(groups).sort((a, b) => a.type.localeCompare(b.type));
                if (entries.length === 0) {
                    html += `<div class="mob-hint-block" style="color:#888">No troops in roster.</div>`;
                } else {
                    // Roster total banner
                    html += `<div class="mob-stat-row" style="margin-bottom:6px;font-weight:bold;">
                        <span>Total in Roster</span><span style="color:#ffca28">${rosterTotal}</span>
                    </div>`;
                    entries.forEach(u => {
                        // exp field is ambiguous: scenario troops use exp:1 (integer level),
                        // sandbox troops may use a 0-N XP float.
                        // Normalise: if exp is a whole number ≥ 1, display as "Lvl N";
                        // if it's a 0–1 decimal, show as a percentage.
                        let expDisplay;
                        if (typeof u.exp !== "number" || u.exp === 0) {
                            expDisplay = "Lvl 1";
                        } else if (Number.isInteger(u.exp) || u.exp % 1 === 0) {
                            expDisplay = "Lvl " + Math.max(1, u.exp);
                        } else {
                            // Fractional XP progress (0–1 range)
                            expDisplay = Math.round(u.exp * 100) + "% XP";
                        }
                        html += `
                            <div class="mob-troop-group">
                                <div>
                                    <div class="mob-troop-type">${u.type.toUpperCase()}</div>
                                    <div class="mob-troop-meta">${expDisplay}</div>
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

        // ── Key held state for joystick (continuous movement) ────────────────
        const _heldKeys = {};
        let   _holdInterval = null;

        // ── Simulate a one-shot keydown+keyup ────────────────────────────────
        function simulateKey(key) {
            const down = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
            const up   = new KeyboardEvent("keyup",   { key, bubbles: true, cancelable: true });
            document.dispatchEvent(down);
            document.dispatchEvent(up);
        }

        // ── Hold a key (fires keydown repeatedly until released) ─────────────
        function holdKey(key) {
            if (_heldKeys[key]) return;
            _heldKeys[key] = true;
            document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
        }

        function releaseKey(key) {
            if (!_heldKeys[key]) return;
            delete _heldKeys[key];
            document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
        }

        function releaseAllKeys() {
            Object.keys(_heldKeys).forEach(releaseKey);
        }

        // ── CSS injection for controls overlay ───────────────────────────────
        function _injectControlCSS() {
            if (document.getElementById("mob-controls-style")) return;
            const s = document.createElement("style");
            s.id = "mob-controls-style";
            s.textContent = `
/* ── MOBILE CONTROLS OVERLAY ── */
#mob-controls-overlay {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    pointer-events: none;
    z-index: 8500;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding: 0 8px 10px 8px;
    box-sizing: border-box;
}

/* ── JOYSTICK ── */
#mob-joystick-zone {
    pointer-events: none;
    width: 0;
    height: 0;
    position: relative;
    flex-shrink: 0;
    overflow: hidden;
    display: none;
}
#mob-joystick-base {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(0,0,0,0.35);
    border: 2px solid rgba(255,255,255,0.25);
    box-shadow: 0 0 12px rgba(0,0,0,0.5);
}
#mob-joystick-knob {
    position: absolute;
    width: 44px; height: 44px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, rgba(255,255,255,0.5), rgba(180,140,80,0.85));
    border: 2px solid rgba(255,220,100,0.7);
    box-shadow: 0 2px 8px rgba(0,0,0,0.6);
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    touch-action: none;
    cursor: grab;
}

/* ── RIGHT-SIDE PANEL ── */
#mob-right-panel {
    pointer-events: all;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    flex-shrink: 0;
}

/* ── SHIP THROTTLE ZONE (▲/▼ speed buttons, bottom-right, naval only) ── */
#mob-helm-zone {
    pointer-events: all;
    width: 70px;
    height: 132px;
    position: fixed;
    bottom: 18px;
    right: 14px;
    z-index: 99999;
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    opacity: 1;
}
#mob-helm-base { display: none; }
#mob-helm-knob { display: none; }
#mob-helm-label {
    position: absolute;
    top: -16px; left: 50%;
    transform: translateX(-50%);
    font-size: 8px; font-weight: bold;
    color: rgba(120,200,255,0.8);
    font-family: Georgia, serif;
    white-space: nowrap; pointer-events: none;
    text-shadow: 0 1px 3px rgba(0,0,0,0.7);
}
/* ── THROTTLE BUTTONS ── */
.ship-throttle-btn {
    pointer-events: all;
    touch-action: manipulation;
    width: 60px;
    height: 56px;
    border-radius: 10px;
    background: radial-gradient(circle at 35% 35%, rgba(100,200,255,0.20), rgba(10,40,80,0.85));
    border: 2px solid rgba(80,170,255,0.60);
    color: rgba(140,220,255,0.95);
    font-size: 26px;
    line-height: 56px;
    text-align: center;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.55);
    flex-shrink: 0;
}
.ship-throttle-btn:active {
    background: radial-gradient(circle at 35% 35%, rgba(160,240,255,0.35), rgba(20,60,110,0.95));
    border-color: #a0e0ff;
    transform: scale(0.94);
}
/* ── ROTATION JOYSTICK (beside throttle, bottom-right) ── */
#mob-rot-joy-zone {
    pointer-events: all;
    width: 90px;
    height: 90px;
    position: fixed;
    bottom: 39px;
    right: 96px;
    z-index: 99999;
    display: none;
    opacity: 1;
}
#mob-rot-joy-base {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(30,10,50,0.55);
    border: 2px solid rgba(180,90,255,0.5);
    box-shadow: 0 0 12px rgba(90,30,160,0.5);
}
#mob-rot-joy-knob {
    position: absolute;
    width: 36px; height: 36px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, rgba(210,170,255,0.7), rgba(90,30,180,0.9));
    border: 2px solid rgba(180,100,255,0.8);
    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    touch-action: none;
    cursor: grab;
}
#mob-rot-joy-label {
    position: absolute;
    top: -16px; left: 50%;
    transform: translateX(-50%);
    font-size: 8px; font-weight: bold;
    color: rgba(200,150,255,0.8);
    font-family: Georgia, serif;
    white-space: nowrap; pointer-events: none;
    text-shadow: 0 1px 3px rgba(0,0,0,0.7);
}
/* ── BOW DIRECTION NEEDLE ── rotates with ship heading, shows bow direction */
#mob-rot-joy-needle {
    position: absolute;
    top: 50%; left: 50%;
    width: 3px; height: 34px;
    margin-left: -1.5px;
    margin-top: -30px;          /* needle tip at top of circle */
    transform-origin: 50% 100%; /* pivot at base (centre of joystick) */
    border-radius: 2px 2px 1px 1px;
    background: linear-gradient(to top, rgba(255,200,60,0.0), rgba(255,220,80,0.95));
    pointer-events: none;
    box-shadow: 0 0 4px rgba(255,200,60,0.6);
    transition: none;
}
/* Fine white dot at joystick centre for needle pivot */
#mob-rot-joy-pivot {
    position: absolute;
    top: 50%; left: 50%;
    width: 6px; height: 6px;
    margin: -3px 0 0 -3px;
    border-radius: 50%;
    background: rgba(255,240,180,0.9);
    pointer-events: none;
    z-index: 2;
}
/* Resistance arc: semi-transparent red arc that grows when pushing against bow */
#mob-rot-joy-resist {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    pointer-events: none;
    opacity: 1;
}
/* ── (sail CW/CCW buttons removed — sails now auto-trim to wind) ── */
#mob-rotate-zone { display: none !important; }
#sail-wheel-canvas { display: none; }
#mob-rotate-base { display: none; }
#mob-rotate-knob { display: none; }
#mob-rotate-label { display: none; }
/* ── (helm arrow removed — no longer used) ── */
#mob-helm-arrow { display: none; }

/* ── FORMATION BUTTON ROW ── */
#mob-formation-row {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    justify-content: flex-end;
    max-width: 230px;
}
.mob-btn {
    touch-action: manipulation;
    background: linear-gradient(to bottom, #3a2a0a, #1a0e04);
    border: 1px solid rgba(200,160,60,0.7);
    color: #e8c97a;
    border-radius: 6px;
    font-size: 11px;
    font-weight: bold;
    padding: 7px 9px;
    min-width: 38px;
    text-align: center;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0,0,0,0.5);
    user-select: none;
    -webkit-user-select: none;
    line-height: 1.2;
}
.mob-btn:active {
    background: linear-gradient(to bottom, #5a3f10, #2a1a06);
    border-color: #ffe680;
}
.mob-btn.mob-cmd {
    background: linear-gradient(to bottom, #0a1a3a, #040e1a);
    border-color: rgba(80,160,220,0.7);
    color: #80c4f0;
}
.mob-btn.mob-cmd:active {
    background: linear-gradient(to bottom, #1a2f5a, #0a1e3a);
    border-color: #a0d8ff;
}
.mob-btn.mob-speed {
    background: linear-gradient(to bottom, #1a3a0a, #0a1e04);
    border-color: rgba(80,220,80,0.7);
    color: #80f090;
    min-width: 54px;
}
.mob-btn.mob-speed:active {
    background: linear-gradient(to bottom, #2a5a10, #102a06);
}
/* hide controls when drawer is open */
body.mob-drawer-open #mob-controls-overlay {
    display: none !important;
}
            `;
            document.head.appendChild(s);
        }

        // ── Build the joystick ────────────────────────────────────────────────
        function _buildJoystick(zone) {
            // DELETED: The movement joystick is now handled exclusively by
            // RTSControls.js (#mc3-joy, gold themed, bottom-left).
            // That joystick fires WASD keys and is always visible except in
            // the main menu — covering battle, overworld, and city modes.
            // This function is intentionally empty.
        }
        // ── Build formation + command buttons ────────────────────────────────
        function _buildButtons(panel) {
            // All formation, selection, command, and speed buttons are handled
            // by RTSControls.js (emoji header buttons at the top of the screen).
            // This function is intentionally empty to avoid duplicate text buttons.
        }

        // ── Build ship joysticks (MOVE + ROTATE, naval only) ────────────
        function _buildHelmJoystick() {

            // ── SHARED joystick DOM builder ───────────────────────────────
            function _makeJoyDOM(zoneId, baseId, knobId, labelId, labelText) {
                var zone = document.createElement("div"); zone.id = zoneId;
                var base = document.createElement("div"); base.id = baseId;
                var knob = document.createElement("div"); knob.id = knobId;
                var lbl  = document.createElement("div"); lbl.id = labelId;
                lbl.textContent = labelText;
                zone.appendChild(base); zone.appendChild(knob); zone.appendChild(lbl);
                document.body.appendChild(zone);
                return { zone: zone, knob: knob };
            }

            // ── THROTTLE BUTTONS (▲ accelerate, ▼ decelerate) ────────────────
            // Two tap-and-hold buttons replace the old MOVE joystick.
            // ▲ = dy < 0 = forward thrust  |  ▼ = dy > 0 = brake / reverse
            // dx (turning torque) comes exclusively from the ROTATION joystick below.
            (function() {
                var zone = document.createElement("div"); zone.id = "mob-helm-zone";
                var lbl  = document.createElement("div"); lbl.id  = "mob-helm-label"; lbl.textContent = "\u26F5 SPEED";
                var btnU = document.createElement("div"); btnU.className = "ship-throttle-btn"; btnU.textContent = "\u25B2";
                var btnD = document.createElement("div"); btnD.className = "ship-throttle-btn"; btnD.textContent = "\u25BC";
                zone.appendChild(lbl); zone.appendChild(btnU); zone.appendChild(btnD);
                document.body.appendChild(zone);

                function _getDX() { return (window._shipHelmInput && window._shipHelmInput.dx) || 0; }

                function _bindThrottle(btn, dyVal) {
                    var _holdTimer = null;
                    function _setThrust() { window._shipHelmInput = { dx: _getDX(), dy: dyVal }; }
                    function _release()   { window._shipHelmInput = { dx: _getDX(), dy: 0 };
                                           if (_holdTimer) { clearInterval(_holdTimer); _holdTimer = null; } }

                    // Single merged touchstart handler (non-passive so preventDefault works)
                    btn.addEventListener("touchstart", function(e) {
                        if (e.cancelable) e.preventDefault();
                        e.stopPropagation();
                        _setThrust();
                        if (_holdTimer) clearInterval(_holdTimer);
                        _holdTimer = setInterval(_setThrust, 50); // re-assert every 50ms while held
                    }, { passive: false });
                    btn.addEventListener("touchend",    function(e) { if (e.cancelable) e.preventDefault(); _release(); }, { passive: false });
                    btn.addEventListener("touchcancel", _release, { passive: true });

                    // Mouse fallback (desktop testing) — single merged handler
                    btn.addEventListener("mousedown", function(e) {
                        e.preventDefault();
                        _setThrust();
                        if (_holdTimer) clearInterval(_holdTimer);
                        _holdTimer = setInterval(_setThrust, 50);
                    });
                    document.addEventListener("mouseup", function() {
                        var hi = window._shipHelmInput;
                        if (hi && hi.dy === dyVal) _release();
                    });
                }
                _bindThrottle(btnU, -1); // ▲ forward
                _bindThrottle(btnD, +1); // ▼ reverse / brake
            })();

            // ── ROTATION JOYSTICK (mob-rot-joy-zone, writes _shipHelmInput.dx) ──
            // This joystick is HEADING-LOCKED: the yellow needle always points toward
            // the ship's current bow direction in screen space (or straight up if no ship
            // is active). The player slides the knob left/right relative to the needle.
            //
            // EXPONENTIAL RESISTANCE: pushing the knob in the OPPOSITE direction to the
            // bow (i.e. the "wrong" side of the needle) is exponentially harder. The
            // effective dx that reaches the physics engine is compressed:
            //   effectiveDx = sign(raw) * pow(|raw|, RESIST_EXP)
            // where RESIST_EXP rises steeply when the joystick is on the wrong side.
            // "Wrong side" means: knob is on the left but bow needle points right, etc.
            //
            // The zone can also be tapped (no drag) to cycle the player-controlled ship
            // (same as the PC behaviour).
            (function() {
                var DEAD    = 8;         // dead-zone pixels
                var MAX_R   = 35;        // max knob travel px
                // ── RESISTANCE TUNING ── <<<<<
                var EASY_EXP   = 0.75;   // exponent when pushing bow-side (easier) <<<<<
                var HARD_EXP   = 2.8;    // exponent when pushing against bow (harder) <<<<<
                // How far from dead centre before we consider the push "against bow"
                // (0–1, where 1 = fully opposite side). Gives a small grace zone.
                var RESIST_THRESHOLD = 0.10; // <<<<<

                var touching = false, _tid = null;
                var _touchStartX = 0, _touchStartTime = 0;
                var _isDrag = false;

                var els = _makeJoyDOM("mob-rot-joy-zone","mob-rot-joy-base","mob-rot-joy-knob","mob-rot-joy-label","\uD83D\uDD04 TURN");
                var zone = els.zone, knob = els.knob;

                // ── Inject needle + pivot + resist canvas ────────────────────
                var needle = document.createElement("div"); needle.id = "mob-rot-joy-needle";
                var pivot  = document.createElement("div"); pivot.id  = "mob-rot-joy-pivot";
                var resistEl = document.createElement("canvas");
                resistEl.id = "mob-rot-joy-resist";
                resistEl.width  = 90;
                resistEl.height = 90;
                zone.appendChild(resistEl);
                zone.appendChild(needle);
                zone.appendChild(pivot);

                function _getDY() { return (window._shipHelmInput && window._shipHelmInput.dy) || 0; }

                // ── Get the player ship heading (radians) ─────────────────────
                function _getShipHeading() {
                    var env = window.navalEnvironment;
                    if (!env || !Array.isArray(env.ships)) return null;
                    var ps = env.ships.find(function(s) { return s.isPlayerControlled; });
                    return ps ? (ps.heading || 0) : null;
                }

                // ── Update the needle visual to match current heading ─────────
                // The needle's transform-origin is at its base (centre of the joystick
                // circle). The needle points UP at 0°. The ship's heading 0 = east in
                // canvas (standard math), so the needle should point "bow-ward" in the
                // player's screen frame. We convert heading → screen angle:
                //   canvas heading 0 = east = screen right → screen angle = heading - π/2
                // (because the needle is drawn pointing north = -π/2 relative to east).
                function _updateNeedle() {
                    if (!window.inNavalBattle) return;
                    var h = _getShipHeading();
                    if (h === null) return;
                    // heading 0 = east; we want needle pointing east = rotate +90°
                    var angleDeg = h * (180 / Math.PI) + 90;
                    needle.style.transform = "rotate(" + angleDeg + "deg)";
                }

                // ── Draw resistance arc on canvas ─────────────────────────────
                // Shows a glowing red arc on the "against-bow" side to hint resistance.
                var _rCtx = resistEl.getContext("2d");
                function _updateResistArc(rawN) {
                    // rawN = raw normalised joystick value [-1..1]
                    _rCtx.clearRect(0, 0, 90, 90);
                    if (Math.abs(rawN) < 0.05) return;

                    var h = _getShipHeading();
                    if (h === null) return;

                    // "Bow side" in screen-X: cos(heading) > 0 → bow is to the right
                    // We treat the joystick purely in screen-X, so:
                    //   bowScreenX = cos(heading): positive = bow is right, negative = bow is left
                    var bowScreenX = Math.cos(h);
                    // If knob is on the SAME side as the bow, no resistance arc
                    var isSameSide = (rawN > 0 && bowScreenX > 0) || (rawN < 0 && bowScreenX < 0);
                    if (isSameSide) return;

                    // Intensity: how hard is the push against bow
                    var intensity = (Math.abs(rawN) - RESIST_THRESHOLD) / (1 - RESIST_THRESHOLD);
                    intensity = Math.max(0, Math.min(1, intensity));
                    if (intensity < 0.05) return;

                    var cx = 45, cy = 45, r = 41;
                    // Arc on the side the knob is pushed toward
                    var arcStart, arcEnd;
                    if (rawN < 0) { arcStart = Math.PI * 0.5;  arcEnd = Math.PI * 1.5; }
                    else          { arcStart = -Math.PI * 0.5; arcEnd = Math.PI * 0.5; }

                    _rCtx.save();
                    _rCtx.globalAlpha = 0.18 + intensity * 0.32;
                    var grad = _rCtx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r);
                    grad.addColorStop(0, "rgba(255,60,60,0)");
                    grad.addColorStop(1, "rgba(255,60,60,0.9)");
                    _rCtx.strokeStyle = grad;
                    _rCtx.lineWidth   = 8;
                    _rCtx.lineCap     = "round";
                    _rCtx.beginPath();
                    _rCtx.arc(cx, cy, r, arcStart, arcEnd);
                    _rCtx.stroke();
                    _rCtx.restore();
                }

                // ── Apply exponential resistance based on bow alignment ───────
                // Returns an effective dx in [-1, 1] passed to physics.
                // Pushing bow-side: slight easing (EASY_EXP < 1 = more responsive).
                // Pushing against bow: steeper curve (HARD_EXP > 1 = less effective).
                function _applyResistance(rawN) {
                    if (Math.abs(rawN) < 0.001) return 0;
                    var h = _getShipHeading();
                    if (h === null) return rawN; // no ship — pass through

                    var bowScreenX  = Math.cos(h);
                    var isSameSide  = (rawN > 0 && bowScreenX > 0) || (rawN < 0 && bowScreenX < 0);
                    var sign        = rawN < 0 ? -1 : 1;
                    var abs         = Math.abs(rawN);

                    if (isSameSide) {
                        // Bow-side: slightly easier (gentle easing)
                        return sign * Math.pow(abs, EASY_EXP);
                    } else {
                        // Against bow: exponentially harder
                        // Below RESIST_THRESHOLD: linear pass-through (grace zone)
                        if (abs < RESIST_THRESHOLD) return sign * abs;
                        // Above threshold: remap to [0,1] and apply hard exponent
                        var t = (abs - RESIST_THRESHOLD) / (1 - RESIST_THRESHOLD);
                        return sign * (RESIST_THRESHOLD + Math.pow(t, HARD_EXP) * (1 - RESIST_THRESHOLD));
                    }
                }

                // ── THROTTLE DISABLE while rotating ──────────────────────────
                function _setThrottleDisabled(disabled) {
                    var hz = document.getElementById("mob-helm-zone");
                    if (!hz) return;
                    var btns = hz.querySelectorAll(".ship-throttle-btn");
                    btns.forEach(function(b) {
                        b.style.pointerEvents = disabled ? "none" : "all";
                        b.style.opacity       = disabled ? "0.35" : "1";
                        b.style.filter        = disabled ? "grayscale(60%)" : "";
                    });
                    if (disabled && window._shipHelmInput) {
                        window._shipHelmInput = { dx: window._shipHelmInput.dx, dy: 0 };
                    }
                }

                function _onMove(cx) {
                    var rect = zone.getBoundingClientRect();
                    var ox   = cx - (rect.left + rect.width / 2);
                    var dist = Math.abs(ox);
                    if (dist < DEAD) {
                        knob.style.transform = "translate(-50%, -50%)";
                        _updateResistArc(0);
                        window._shipHelmInput = { dx: 0, dy: _getDY() };
                        _setThrottleDisabled(false);
                    } else {
                        var rawN  = Math.min(dist / MAX_R, 1.0) * (ox < 0 ? -1 : 1);
                        var effDx = _applyResistance(rawN);
                        // Knob visual: show full raw travel (player sees where they pushed)
                        knob.style.transform = "translate(calc(-50% + " + (rawN * MAX_R) + "px), -50%)";
                        _updateResistArc(rawN);
                        window._shipHelmInput = { dx: effDx, dy: 0 }; // dy forced to 0 while rotating
                        _setThrottleDisabled(true);
                    }
                }
                function _onEnd() {
                    touching = false; _tid = null;
                    knob.style.transform = "translate(-50%, -50%)";
                    _updateResistArc(0);
                    window._shipHelmInput = { dx: 0, dy: _getDY() };
                    _setThrottleDisabled(false);
                }

                // ── Ship cycling on tap (no drag) ────────────────────────────
                // A tap (< 200ms, < 8px travel) on the joystick zone cycles
                // isPlayerControlled to the next alive ship — same as PC click.
                function _cyclePlayerShip() {
                    var env = window.navalEnvironment;
                    if (!env || !Array.isArray(env.ships) || env.ships.length < 2) return;
                    var cur = env.ships.findIndex(function(s) { return s.isPlayerControlled; });
                    if (cur < 0) cur = 0;
                    // Transfer control to next ship
                    for (var attempt = 1; attempt < env.ships.length; attempt++) {
                        var next = (cur + attempt) % env.ships.length;
                        // Only cycle to player-faction ships
                        if (env.ships[next].side === "player" || env.ships[next].side === "ally") {
                            env.ships[cur].isPlayerControlled  = false;
                            env.ships[next].isPlayerControlled = true;
                            break;
                        }
                    }
                }

                // ── Touch listeners ──────────────────────────────────────────
                zone.addEventListener("touchstart", function(e) {
                    if (e.cancelable) e.preventDefault(); e.stopPropagation();
                    touching = true; _tid = e.touches[0].identifier;
                    _touchStartX    = e.touches[0].clientX;
                    _touchStartTime = Date.now();
                    _isDrag = false;
                    _onMove(e.touches[0].clientX);
                }, { passive: false });
                zone.addEventListener("touchmove", function(e) {
                    if (e.cancelable) e.preventDefault(); e.stopPropagation();
                    if (!touching) return;
                    for (var i = 0; i < e.touches.length; i++) {
                        if (e.touches[i].identifier === _tid) {
                            var moved = Math.abs(e.touches[i].clientX - _touchStartX);
                            if (moved > 6) _isDrag = true;
                            _onMove(e.touches[i].clientX);
                            break;
                        }
                    }
                }, { passive: false });
                zone.addEventListener("touchend", function(e) {
                    if (e.cancelable) e.preventDefault();
                    var elapsed = Date.now() - _touchStartTime;
                    if (!_isDrag && elapsed < 220) {
                        // It was a tap — cycle ship
                        _cyclePlayerShip();
                    }
                    _onEnd();
                }, { passive: false });
                zone.addEventListener("touchcancel", _onEnd);

                // ── Mouse listeners (desktop) ────────────────────────────────
                zone.addEventListener("mousedown", function(e) {
                    touching = true;
                    _touchStartX    = e.clientX;
                    _touchStartTime = Date.now();
                    _isDrag = false;
                    _onMove(e.clientX);
                    var mm = function(ev) {
                        if (!touching) return;
                        if (Math.abs(ev.clientX - _touchStartX) > 6) _isDrag = true;
                        _onMove(ev.clientX);
                    };
                    var mu = function(ev) {
                        var elapsed = Date.now() - _touchStartTime;
                        if (!_isDrag && elapsed < 220) _cyclePlayerShip();
                        _onEnd();
                        document.removeEventListener("mousemove", mm);
                        document.removeEventListener("mouseup", mu);
                    };
                    document.addEventListener("mousemove", mm);
                    document.addEventListener("mouseup", mu);
                });

                // ── Continuous needle update RAF ──────────────────────────────
                (function _needleLoop() {
                    if (window.inNavalBattle) _updateNeedle();
                    requestAnimationFrame(_needleLoop);
                })();
            })();

            // ── SAIL CONTROL REMOVED ─────────────────────────────────────────
            // Sail angle buttons (CW/CCW) have been removed.
            // Sails now auto-trim to the optimal angle for the current wind
            // and ship heading every frame — no player input needed or possible.
            // See naval_sailing_cosmetics.js _drawJunkSails and naval_battles.js
            // per-ship physics (_sailManual=false) for the auto-trim logic.

        }  // ── Ship joystick latch ─────────────────────────
        // Once ships are detected during a live battle this stays true until the
        // battle actually ends.  This prevents the 250ms poll from ever hiding
        // the joysticks mid-fight due to flag timing glitches or non-standard
        // naval launch paths that don't set window.inNavalBattle immediately.
        var _helmShowing = false;
        // _helmForced: set by forceNavalHelm(), cleared only by clearNavalHelm().
        // While true the poll CANNOT clear _helmShowing — guards against the
        // timing window where the poll fires between launch steps.
        var _helmForced = false;
        // _helmForcedAt: timestamp of the last forceNavalHelm() call.
        // _syncHelmVisibility will not clear state within HELM_COOLDOWN_MS of a
        // force call — guards the race where launchCustomBattle resets
        // inNavalBattle=false momentarily before custom_naval_launcher sets it back.
        var _helmForcedAt   = 0;
        var HELM_COOLDOWN_MS = 3000;

        function _syncHelmVisibility() {
            var helmZone = document.getElementById("mob-helm-zone");
            var rotJoy   = document.getElementById("mob-rot-joy-zone");
            if (!helmZone) return;

            var isRiver = !!window.inRiverBattle;
            var isNaval = !!window.inNavalBattle && !isRiver;

            // ABSOLUTE CLEAR: inNavalBattle=false means battle ended via any path.
            // EXCEPTION: if forceNavalHelm() was called within the last HELM_COOLDOWN_MS
            // we skip the clear — launchCustomBattle briefly sets inNavalBattle=false
            // during cleanup before the launcher sets it back, and the 250ms poll can
            // fire inside that window and wipe the buttons before they ever show.
            if (!isNaval) {
                var msSinceForce = Date.now() - _helmForcedAt;
                if (msSinceForce < HELM_COOLDOWN_MS) return; // still in cooldown — don't clear
                if (_helmShowing) {
                    _helmShowing = false;
                    _helmForced  = false;
                    helmZone.style.display = "none";
                    if (rotJoy) rotJoy.style.display = "none";
                }
                return;
            }

            // SHOW when naval battle is live — catches both launch paths
            var hasShips = !!(window.navalEnvironment &&
                              Array.isArray(window.navalEnvironment.ships) &&
                              window.navalEnvironment.ships.length > 0);
            if (hasShips || _helmForced) _helmShowing = true;

            // BOARDING GUARD: if ships are grappled, disableNavalHelm() owns
            // the display — the 250ms poll must not fight it by re-showing buttons.
            if (_helmGrappled) return;

            helmZone.style.display = _helmShowing ? "flex"  : "none";
            if (rotJoy) rotJoy.style.display = _helmShowing ? "block" : "none";
        }


        // ── Pinch-to-zoom ─────────────────────────────────────────────────────
        function _attachPinchZoom() {
            const canvas = document.getElementById("gameCanvas");
            if (!canvas) return;

            let _lastDist = null;

            canvas.addEventListener("touchstart", e => {
                if (e.touches.length === 2) {
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    _lastDist = Math.sqrt(dx*dx + dy*dy);
                }
            }, { passive: true });

            canvas.addEventListener("touchmove", e => {
                if (e.touches.length !== 2 || _lastDist === null) return;
                const dx   = e.touches[0].clientX - e.touches[1].clientX;
                const dy   = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const delta = dist - _lastDist;
                _lastDist = dist;

                // Apply to window.camera if it exists
                const cam = window.camera;
                if (cam && typeof cam.zoom !== "undefined") {
                    cam.zoom = Math.max(0.3, Math.min(4, cam.zoom + delta * 0.005));
                } else if (cam && typeof cam.scale !== "undefined") {
                    cam.scale = Math.max(0.3, Math.min(4, cam.scale + delta * 0.005));
                }
            }, { passive: true });

            canvas.addEventListener("touchend", () => { _lastDist = null; }, { passive: true });
        }

        // ── Show / hide based on battle state ─────────────────────────────────
        function _syncVisibility() {
            const overlay = document.getElementById("mob-controls-overlay");
            if (!overlay) return;
            var inBattle = false;
            try { inBattle = !!window.inBattleMode; } catch(e) {}
            if (!inBattle) { try { if (typeof inBattleMode !== "undefined") inBattle = !!inBattleMode; } catch(e2) {} }
            const storyBusy = window.StoryPresentation && typeof window.StoryPresentation.busy === "function" && window.StoryPresentation.busy();
            const isNaval = !!window.inNavalBattle && !window.inRiverBattle;

            if (!inBattle || storyBusy) {
                // Not in battle — hide everything
                overlay.style.display = "none";
            } else if (isNaval) {
                // NAVAL BATTLE: hide the land-battle overlay (commander joystick, formation buttons etc.)
                // Ship throttle (#mob-helm-zone) and rotation joystick (#mob-rot-joy-zone) are
                // separate DOM elements managed by _syncHelmVisibility.
                // Sail buttons removed — sails auto-trim to wind.
                // NOTE: RTSControls.js manages its own naval overlay — do not interfere with it.
                overlay.style.display = "none";
            } else {
                // LAND BATTLE: show all controls normally
                overlay.style.display = "flex";
            }
        }

        // ── forceNavalHelm / clearNavalHelm ──────────────────────────────────
        // Public — called by custom_naval_launcher.js and custom_battle_gui.js
        // via window.NavalHelmUI (NOT window.MobileControls, which RTSControls
        // overwrites with its own object).
        function forceNavalHelm() {
            _helmGrappled = false; // clear boarding lock — fresh show request always wins
            _helmForced   = true;
            _helmShowing  = true;
            _helmForcedAt = Date.now(); // start cooldown — _syncHelmVisibility won't clear for HELM_COOLDOWN_MS
            var hz  = document.getElementById("mob-helm-zone");
            var rj  = document.getElementById("mob-rot-joy-zone");
            // Restore any opacity/filter that disableNavalHelm may have set, then show
            if (hz)  { hz.style.opacity = ""; hz.style.filter = ""; hz.style.pointerEvents = ""; hz.style.display = "flex"; }
            if (rj)  { rj.style.opacity = ""; rj.style.filter = ""; rj.style.pointerEvents = ""; rj.style.display = "block"; }
        }
        function clearNavalHelm() {
            // CRITICAL: If ships are currently boarded/grappled, the cosmetics
            // poller (naval_sailing_cosmetics.js, 3s interval) must NOT be able
            // to clear the helm — disableNavalHelm() owns display during boarding.
            // _helmGrappled is only cleared by enableNavalHelm() (ships separate)
            // or forceNavalHelm() (fresh battle start).
            if (_helmGrappled) return;

            _helmForced   = false;
            _helmShowing  = false;
            _helmForcedAt = 0;
            // Reset patch guard so _hookNavalInit re-wraps initNavalBattle on
            // the next custom battle (otherwise repeated battles skip the hook).
            if (typeof window.initNavalBattle === "function") {
                window.initNavalBattle.__helmPatched = false;
            }
            var hz  = document.getElementById("mob-helm-zone");
            var rj  = document.getElementById("mob-rot-joy-zone");
            if (hz)  hz.style.display  = "none";
            if (rj)  rj.style.display  = "none";
        }

        // ── disableNavalHelm / enableNavalHelm — grapple lock UI ─────────────
        // Called by naval_battles.js every frame when ships are grappled/free.
        // disableNavalHelm: HIDES buttons completely (not grey — clean screen for melee).
        // enableNavalHelm:  re-shows via forceNavalHelm so state is fully restored.
        // _helmGrappled gates clearNavalHelm and _syncHelmVisibility so the
        // 250ms poll and 3s cosmetics poller cannot fight us during boarding.
        var _helmGrappled = false;
        function disableNavalHelm() {
            if (_helmGrappled) return; // already hidden
            _helmGrappled = true;
            // Zero live input so the ship doesn't lurch during boarding
            if (window._shipHelmInput) window._shipHelmInput = { dx: 0, dy: 0 };
            var hz = document.getElementById("mob-helm-zone");
            var rj = document.getElementById("mob-rot-joy-zone");
            // Hide completely — no greyed ghost buttons during melee boarding
            if (hz) { hz.style.display = "none"; hz.style.opacity = ""; hz.style.filter = ""; hz.style.pointerEvents = ""; }
            if (rj) { rj.style.display = "none"; rj.style.opacity = ""; rj.style.filter = ""; rj.style.pointerEvents = ""; }
        }
        function enableNavalHelm() {
            if (!_helmGrappled) return; // already visible
            _helmGrappled = false;
            // Re-show via forceNavalHelm so _helmShowing/_helmForced are
            // correctly restored and the 250ms poll won't immediately hide again.
            forceNavalHelm();
        }

        // ── initHelm — ALWAYS runs, desktop AND mobile ────────────────────────
        // Builds the two ship joysticks and starts their visibility poll.
        // Completely separate from the isMobile() guard below so these joysticks
        // exist everywhere.  Covers BOTH naval entry paths:
        //   Path 1: custom_naval_launcher → calls NavalHelmUI.forceNavalHelm() at end
        //   Path 2: battlefield_launch sandbox → calls NavalHelmUI.forceNavalHelm() at end
        // The 250ms poll is the primary mechanism; forceNavalHelm() is belt-and-suspenders.
        // The last-resort deferred checker is the final fallback for any timing edge cases.
        var _helmInited = false;
        function initHelm() {
            if (_helmInited) return;
            _helmInited = true;

            _buildHelmJoystick();

            // ── Primary: 250ms poll ───────────────────────────────────────────
            // Catches ship-presence on every tick. Fast enough to respond within
            // one frame of either naval launch path completing.
            setInterval(_syncHelmVisibility, 250);
            _syncHelmVisibility();

            // ── Hook initNavalBattle — fires synchronously on ship creation ───
            // Both launch paths call initNavalBattle(), so patching it guarantees
            // forceNavalHelm() fires the instant ships are created, before even the
            // first 250ms poll tick.
            (function _hookNavalInit() {
                if (typeof window.initNavalBattle === "function" && !window.initNavalBattle.__helmPatched) {
                    var _orig = window.initNavalBattle;
                    window.initNavalBattle = function() {
                        var r = _orig.apply(this, arguments);
                        forceNavalHelm(); // fires synchronously right after ship creation
                        return r;
                    };
                    window.initNavalBattle.__helmPatched = true;
                } else if (typeof window.initNavalBattle !== "function") {
                    // Not loaded yet — retry until it exists
                    setTimeout(_hookNavalInit, 150);
                }
            })();

            // ── Last-resort deferred checker ──────────────────────────────────
            // If for any reason the poll missed the launch window (e.g. tab was in
            // background, browser throttled timers, or an unusual launch order),
            // these one-shot checks fire at 2s, 5s, and 10s after page load.
            // They're fire-and-forget with no ongoing cost after they run.
            // Zero performance impact — they only call _syncHelmVisibility() once each.
            [2000, 5000, 10000].forEach(function(delay) {
                setTimeout(function() {
                    _syncHelmVisibility();
                    // Also explicitly force-show if ships now exist but joysticks missed
                    var hasShips = !!(window.navalEnvironment &&
                                     Array.isArray(window.navalEnvironment.ships) &&
                                     window.navalEnvironment.ships.length > 0);
                    var isNaval  = !!window.inNavalBattle && !window.inRiverBattle;
                    if ((hasShips || isNaval) && !_helmShowing) {
                        forceNavalHelm();
                    }
                }, delay);
            });

            // Expose under NavalHelmUI — RTSControls cannot clobber this name
            window.NavalHelmUI = { forceNavalHelm: forceNavalHelm, clearNavalHelm: clearNavalHelm, disableNavalHelm: disableNavalHelm, enableNavalHelm: enableNavalHelm };
        }

        // ── Main init — mobile-only (commander joystick, formation buttons) ───
        let _inited = false;
        function init() {
            if (!isMobile() || _inited) return;
            _inited = true;

            _injectControlCSS();

            // Build overlay
            const overlay = document.createElement("div");
            overlay.id = "mob-controls-overlay";

            // Left: joystick
            const jZone = document.createElement("div");
            jZone.id = "mob-joystick-zone";
            _buildJoystick(jZone);

            // Right: buttons
            const rPanel = document.createElement("div");
            rPanel.id = "mob-right-panel";
            _buildButtons(rPanel);

            overlay.appendChild(jZone);
            overlay.appendChild(rPanel);
            document.body.appendChild(overlay);

            _attachPinchZoom();

            // Poll land-battle overlay visibility (500ms is fine — not ship-critical)
            setInterval(_syncVisibility, 500);
            _syncVisibility();

            console.log("[MobileControls] Commander joystick + formation buttons + pinch-zoom initialised.");
        }

        return { init, initHelm, simulateKey, holdKey, releaseKey, releaseAllKeys };
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
        const inCamp   = (typeof window.inCampMode !== "undefined" && window.inCampMode);
        
        // SURGERY: Detect if the Main Menu or Loading Screen is currently active
        const mainMenu = document.getElementById("main-menu");
        const onMenu   = !!(mainMenu && mainMenu.style.opacity !== "0" && mainMenu.style.display !== "none");
        const isLoading = document.body.classList.contains('is-loading-state');
const isGameStateValid = !inBattle && !inCity && !inParle && !onMenu && !isLoading && !inCamp;

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

        MobileControls.initHelm();  // always — ship joysticks on ALL devices
        MobileControls.init();      // mobile-only — commander joystick, buttons

        console.log("[mobile_ui.js] Loaded ✓");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();