// =============================================================================
// DAWN OF GUNPOWDER — mobile_cleanup.js  (v1.0)
// =============================================================================
// Drop-in mobile polish layer.  Load this LAST in index.html, after every
// other script (including mobile_ui.js and mobileControls.js).
//
// Issues addressed:
//   1.  Menu layout   — Units button visible; credits always at bottom;
//                       Custom Battle inner cards/buttons smaller on mobile
//   2.  Portrait mode — viewport meta fixed; canvas fills correctly
//   3.  Loading screen spacing — no gap between loading text and stats
//   4.  Overworld button visibility — P / Type (stack) / ? hidden on
//                                     overworld; P visible in city (far-left)
//   5.  Detail-panel troop expand — each troop row taps to open a per-unit
//                                   stats sub-table
//   6.  Battle center controls — header bar scrollable, no scrollbar visible;
//                                shrunk buttons for iPhone 11 width (414 px)
//   7.  Tactical / Manual toggles — replaced with ⚙️ / 🕹️ / 🤖 emoji labels
//   8.  Battle formations row — guaranteed to fit & be swipe-scrollable
//   9.  Hold-touch offset fix — world-coord conversion uses getBoundingClientRect
//  10.  TroopGUI close softlock — sticky ✕ CLOSE bar injected at the very top
// =============================================================================

;(function (W, D) {
  'use strict';

  // Guard against double-load
  if (W.__MCU_LOADED__) return;
  W.__MCU_LOADED__ = true;

  // ──────────────────────────────────────────────────────────────────────────
  //  SHARED UTILITIES
  // ──────────────────────────────────────────────────────────────────────────

  function isMobile () {
    return W.innerWidth <= 900 || ('ontouchstart' in W);
  }

  function $ (id) { return D.getElementById(id); }

  function injectCSS (css) {
    const s = D.createElement('style');
    s.textContent = css;
    D.head.appendChild(s);
    return s;
  }

  function applyStyle (el, styles) {
    if (!el) return;
    Object.assign(el.style, styles);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  1 + 2.  VIEWPORT / PORTRAIT FIX
  // ──────────────────────────────────────────────────────────────────────────

  function fixViewport () {
    let meta = D.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = D.createElement('meta');
      meta.name = 'viewport';
      D.head.insertBefore(meta, D.head.firstChild);
    }
    // viewport-fit=cover keeps content behind iPhone notch/home-bar safe areas
    meta.content =
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, ' +
      'user-scalable=no, viewport-fit=cover';
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  GLOBAL CSS BLOCK
  // ──────────────────────────────────────────────────────────────────────────

  function injectGlobalCSS () {
    injectCSS(`

/* ══════════════════════════════════════════════════════════
   §1  PORTRAIT MODE — canvas always fills the screen
   ══════════════════════════════════════════════════════════ */
@media (pointer: coarse) {
  html, body {
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: fixed;   /* prevents iOS bounce-scroll revealing background */
    -webkit-overflow-scrolling: auto;
  }
  #gameCanvas {
    position: fixed !important;
    top: 0 !important; left: 0 !important;
    width:  100vw !important;
    height: 100vh !important;
    touch-action: none;
  }
}

/* ══════════════════════════════════════════════════════════
   §3.1  LOADING SCREEN RESPONSIVENESS — Fit for all phones
   ══════════════════════════════════════════════════════════ */
#loading-screen-wrapper {
  justify-content: center !important;
  overflow-y: auto !important; /* Allows scrolling if the phone is extremely small */
  padding: 10px !important;
}

/* Responsive "LOADING..." Header */
#loading-screen-wrapper > div:first-child {
  font-size: clamp(1.2rem, 7vw, 2.2rem) !important;
  letter-spacing: 4px !important;
  margin-bottom: 5px !important;
}

/* Shrink Unit Portrait to make room for stats */
#loading-screen-wrapper > div:nth-child(2) > div:first-child {
  height: clamp(150px, 30vh, 320px) !important;
  margin-bottom: 5px !important;
}

/* Compact Stats Grid */
#loading-screen-wrapper div[style*="grid"] {
  gap: 4px 10px !important;
}

#loading-screen-wrapper div[style*="grid"] div {
  font-size: clamp(0.7rem, 2.5vw, 0.85rem) !important;
  padding: 2px 0 !important;
}

/* Shrink Unit Name and Description */
#loading-screen-wrapper div[style*="font-size: 2rem"] {
  font-size: 1.4rem !important;
  margin-bottom: 5px !important;
}

/* ══════════════════════════════════════════════════════════
   §6 + §8  BATTLE HEADER BAR — scrollable pill, no scrollbar
   ══════════════════════════════════════════════════════════ */
#mc3-hbar {
  /* Anchor to full width so we can centre-scroll */
  left: 0 !important;
  transform: none !important;
  width: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  pointer-events: none !important;
}

#mc3-hrow {
  /* Scrollable row, no bar, touch-momentum */
  overflow-x: auto !important;
  overflow-y: visible !important;
  -webkit-overflow-scrolling: touch !important;
  scrollbar-width: none !important;
  white-space: nowrap !important;
  /* Un-wrap so nothing spills onto a second line */
  flex-wrap: nowrap !important;
  /* Start from left so P is always first */
  justify-content: flex-start !important;
  max-width: 100vw !important;
  pointer-events: auto !important;
}
#mc3-hrow::-webkit-scrollbar { display: none !important; }

/* Trays also scrollable & centred */
.mc3-tray {
  overflow-x: auto !important;
  -webkit-overflow-scrolling: touch !important;
  scrollbar-width: none !important;
  max-width: 100vw !important;
  justify-content: flex-start !important;
  flex-wrap: nowrap !important;
}
.mc3-tray::-webkit-scrollbar { display: none !important; }

/* ──────────────────────────────────────────────────────
   Shrink header buttons to fit iPhone 11 (414 px wide)
   ────────────────────────────────────────────────────── */
@media (max-width: 480px) {
#mc3-pbtn {
        position: fixed !important;
        top: 50px !important;    /* Your requested 50px shift */
        left: 10px !important;   /* Standard margin from the left edge */
        right: auto !important;  /* Clear any default right-side alignment */
        transform: none !important; 
        z-index: 10005 !important; /* Ensure it stays above map and menus */
        
        /* Keeping your existing mobile size from the script */
        width: 34px !important;
        height: 34px !important;
        display: flex !important;
        align-items: center;
        justify-content: center;
    }
  .mc3-gbtn {
    width:  28px !important;
    height: 28px !important;
    font-size: 0.52rem !important;
    flex-shrink: 0 !important;
  }
  .mc3-gbtn .gsub { font-size: 0.38rem !important; }
  .mc3-toggle-btn {
    height: 28px !important;
    padding: 0 5px !important;
    font-size: 0.48rem !important;
    flex-shrink: 0 !important;
  }
  .mc3-tray-btn {
    width:  44px !important;
    height: 40px !important;
    font-size: 0.54rem !important;
    flex-shrink: 0 !important;
  }
  .mc3-tray-btn .ticon { font-size: 0.9rem !important; }
  #mc3-hrow {
    gap: 2px !important;
    padding: 3px 3px !important;
  }
  .mc3-tray {
    gap: 4px !important;
    padding: 4px 6px !important;
  }
}

/* ══════════════════════════════════════════════════════════
   §7  TACTICAL / MANUAL EMOJI BUTTONS — compact variants
       (the game may render these with IDs or class names;
        the JS below also finds them by text heuristics)
   ══════════════════════════════════════════════════════════ */
.mcu-emoji-btn {
  background: linear-gradient(to bottom, #7b1a1a, #4a0a0a) !important;
  color: #f5d76e !important;
  border: 1.5px solid #d4b886 !important;
  border-radius: 5px !important;
  /* SURGERY: Scale font down dynamically, prevent wrapping, hide overflow */
  font-size: clamp(0.7rem, 2.5vw, 1.1rem) !important;
  width: 36px !important;
  height: 36px !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: clip !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer;
  touch-action: manipulation;
  flex-shrink: 0;
}
.mcu-emoji-btn:active { opacity: 0.65; }

/* ══════════════════════════════════════════════════════════
   §10  TROOPGUI — sticky top close bar
   ══════════════════════════════════════════════════════════ */
#mcu-troop-close-bar {
  position: fixed;
  /* sits at the very top of the 90vh / 90vw menu */
  top: calc(5% + 2px);
  left: calc(5% + 2px);
  right: calc(5% + 2px);
  z-index: 3010;
  background: rgba(15, 8, 4, 0.97);
  border-bottom: 2px solid #d4b886;
  padding: 8px 12px;
  display: none;          /* shown by JS */
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  gap: 10px;
}
#mcu-troop-close-bar-title {
  color: #f5d76e;
  font-family: 'Georgia', serif;
  font-size: clamp(11px, 3vw, 15px);
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#mcu-troop-close-btn {
  flex-shrink: 0;
  background: linear-gradient(to bottom, #7b1a1a, #4a0a0a);
  color: #f5d76e;
  border: 2px solid #d4b886;
  padding: 8px 18px;
  font-family: 'Georgia', serif;
  font-size: clamp(11px, 3vw, 14px);
  font-weight: bold;
  cursor: pointer;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 1px;
  touch-action: manipulation;
  min-height: 40px;
  white-space: nowrap;
}
#mcu-troop-close-btn:active { opacity: 0.65; }

/* Push the scroll region below our sticky bar */
#settlement-upgrade-menu.mcu-patched {
  padding-top: 56px !important;
}

/* ══════════════════════════════════════════════════════════
   §5  DETAIL DRAWER — expandable troop sub-tabs
   ══════════════════════════════════════════════════════════ */
.mob-troop-group {
  cursor: pointer !important;
  flex-direction: column !important;
  user-select: none !important;
  -webkit-user-select: none !important;
}
.mob-troop-group-header {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  width: 100% !important;
}
.mob-troop-expand-arrow {
  color: #ffca28;
  font-size: 11px;
  transition: transform 0.2s ease;
  flex-shrink: 0;
  margin-left: 6px;
}
.mob-troop-group.mcu-expanded .mob-troop-expand-arrow {
  transform: rotate(90deg);
}
.mob-troop-subtab {
  display: none;
  width: 100%;
  margin-top: 8px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid #5d4037;
  border-radius: 4px;
  overflow: hidden;
  -webkit-overflow-scrolling: touch;
}
.mob-troop-subtab.mcu-open {
  display: block;
}
.mob-troop-subtab table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;
  font-family: monospace;
}
.mob-troop-subtab th {
  color: #ffca28;
  text-align: left;
  padding: 3px 5px;
  border-bottom: 1px solid #5d4037;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.mob-troop-subtab td {
  padding: 2px 5px;
  color: #d4b886;
  font-size: 10px;
  border-bottom: 1px solid rgba(93, 64, 55, 0.2);
}
.mob-troop-subtab tr:last-child td { border-bottom: none; }
.mob-subtab-hp-hi  { color: #8bc34a !important; }
.mob-subtab-hp-mid { color: #ff9800 !important; }
.mob-subtab-hp-lo  { color: #f44336 !important; }

/* ══════════════════════════════════════════════════════════
   §1  MENU — buttons + credits layout on mobile
   ══════════════════════════════════════════════════════════ */
@media (max-width: 900px), (pointer: coarse) {
  /* Units Guide button always reachable */
  /* Units Guide button stays hidden until Manual is pressed */
  #units-guide-btn {
    width: clamp(180px, 80vw, 300px) !important;
    padding: 12px 16px !important;
    font-size: clamp(12px, 3.5vw, 18px) !important;
    margin: 6px auto !important;
    display: none !important;
    box-sizing: border-box !important;
    touch-action: manipulation !important;
  }

  /* After Manual is pressed, the menu gets unlocked */
  #main-menu.mcu-units-unlocked #units-guide-btn {
    display: block !important;
  }
  /* Credits text — always at the very bottom */
  #main-menu .mcu-credits {
    position: absolute !important;
    bottom: 8px !important;
    left: 0 !important;
    width: 100% !important;
    text-align: center !important;
    font-size: 0.72rem !important;
    pointer-events: none !important;
  }
  /* Custom battle: unit portrait card list scrollable, buttons smaller */
  #cb-menu-container {
    overflow: hidden !important;
  }
  #cb-menu-container button {
    font-size: clamp(9px, 2.5vw, 13px) !important;
    padding: clamp(5px, 1.5vw, 9px) clamp(4px, 1.2vw, 7px) !important;
    min-height: 34px !important;
    line-height: 1.1 !important;
    white-space: normal !important;
    touch-action: manipulation !important;
  }
  /* Army panels scrollable */
  #cb-player-list,
  #cb-enemy-list,
  [id^="cb-"][id$="-list"] {
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch !important;
    max-height: 38vh !important;
  }
}

    `); // end injectCSS
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  §3  LOADING SCREEN GAP — JS-side backup (CSS handles most of it)
  // ──────────────────────────────────────────────────────────────────────────

  function fixLoadingScreenGap () {
    const wrapper = $('loading-screen-wrapper');
    if (!wrapper) return;
    wrapper.style.gap     = '0';
    wrapper.style.padding = '0';
    // The second child is the two-column content block
    const content = wrapper.children[1];
    if (content) {
      content.style.gap       = '0';
      content.style.marginTop = '2px';
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  §4  OVERWORLD BUTTON VISIBILITY
  //  P  → visible only in battle OR when city panel is open
  //  ≡ stack  (Type) + ?  → visible only in battle
  //  P always rendered first in #mc3-hrow (far left)
  // ──────────────────────────────────────────────────────────────────────────

  function syncOverworldButtons () {
    const pBtn     = $('mc3-pbtn');
    const stackBtn = $('mc3-stack-btn');
    const helpBtn  = $('mc3-help-btn');
    if (!pBtn) return;

    const inBattle = (typeof inBattleMode !== 'undefined' && !!inBattleMode);

    const cityPanel = $('city-panel');
    const inCity =
      (typeof inCityMode    !== 'undefined' && !!inCityMode)    ||
      (typeof inTownMode    !== 'undefined' && !!inTownMode)     ||
      (typeof inSiegeBattle !== 'undefined' && !!inSiegeBattle)  ||
      (cityPanel && cityPanel.style.display !== 'none' &&
                    cityPanel.style.display !== '');

    // P: show during battle OR city visit
    pBtn.style.display = (inBattle || inCity) ? '' : 'none';

    // Stack (≡ TYPE) and ? help: battle only
    if (stackBtn) stackBtn.style.display = inBattle ? '' : 'none';
    if (helpBtn)  helpBtn.style.display  = inBattle ? '' : 'none';

    // Keep P as the first child in the row
    const row = $('mc3-hrow');
    if (row && pBtn.parentElement === row && row.firstElementChild !== pBtn) {
      row.insertBefore(pBtn, row.firstElementChild);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  §9  HOLD-TOUCH OFFSET FIX
  //  Replaces Gestures._moveToWorld with a version that uses
  //  getBoundingClientRect() instead of assuming canvas = screen.
  // ──────────────────────────────────────────────────────────────────────────

  let _holdTouchPatched = false;

  function patchHoldTouch () {
    if (_holdTouchPatched) return true;
    const MC = W.MobileControls;
    if (!MC || !MC.Gestures || !MC.Cmd) return false;

    MC.Gestures._moveToWorld = function (sx, sy) {
      const canvas = D.getElementById('gameCanvas');
      if (!canvas) return;

      // 1. Map screen pixels → canvas-buffer pixels
      const rect   = canvas.getBoundingClientRect();
      const scaleX = canvas.width  / (rect.width  || 1);
      const scaleY = canvas.height / (rect.height || 1);
      const cx     = (sx - rect.left) * scaleX;
      const cy     = (sy - rect.top)  * scaleY;

      // 2. Convert canvas-buffer coords to world coords
      const cam = W.camera || { x: 0, y: 0, zoom: 1 };
      const cw  = canvas.width  / 2;
      const ch  = canvas.height / 2;
      const z   = cam.zoom || cam.scale || 1;

      const wx = (cx - cw) / z + cam.x;
      const wy = (cy - ch) / z + cam.y;

      MC.Cmd.moveTo(wx, wy);
    };

    _holdTouchPatched = true;
    return true;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  §10  TROOPGUI STICKY CLOSE BAR
  //  A position:fixed bar that floats above the settlement-upgrade-menu and
  //  cannot be scrolled away.  It is entirely outside the menuDiv so that
  //  renderMenu()'s innerHTML reset never removes it.
  // ──────────────────────────────────────────────────────────────────────────



  function syncTroopCloseBar () {
    const bar     = $('mcu-troop-close-bar');
    const menuDiv = $('settlement-upgrade-menu');
    if (!bar || !menuDiv) return;

    const visible = (menuDiv.style.display !== 'none' && menuDiv.style.display !== '');
    bar.style.display = (visible && isMobile()) ? 'flex' : 'none';

    if (visible && isMobile() && !menuDiv.classList.contains('mcu-patched')) {
      // Add padding-top so content doesn't hide behind our bar
      menuDiv.classList.add('mcu-patched');
      menuDiv.style.paddingTop = '56px';
    }
    if (!visible) {
      menuDiv.classList.remove('mcu-patched');
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  §5  DETAIL DRAWER — EXPANDABLE TROOP SUB-TABS
  // ──────────────────────────────────────────────────────────────────────────

  function enhanceDetailTroops () {
    const drawerBody = $('mob-detail-body');
    if (!drawerBody) return;

    drawerBody.querySelectorAll('.mob-troop-group').forEach((group, idx) => {
      // Skip already-enhanced groups
      if (group.dataset.mcuExp) return;
      group.dataset.mcuExp = '1';

      // Read original inner pieces before we restructure
      const typeEl  = group.querySelector('.mob-troop-type');
      const metaEl  = group.querySelector('.mob-troop-meta');
      const cntEl   = group.querySelector('.mob-troop-count');
      if (!typeEl) return;

      const typeName  = typeEl.textContent.trim();
      const metaText  = metaEl  ? metaEl.textContent.trim()  : '';
      const countText = cntEl   ? cntEl.textContent.trim()   : '';

      // Rebuild with header + collapsible sub-tab
      group.innerHTML = `
        <div class="mob-troop-group-header">
          <div>
            <div class="mob-troop-type">${typeName}</div>
            <div class="mob-troop-meta">${metaText}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <div class="mob-troop-count">${countText}</div>
            <span class="mob-troop-expand-arrow">▶</span>
          </div>
        </div>
        <div class="mob-troop-subtab" id="mcu-subtab-${idx}" data-type="${typeName.toUpperCase()}">
        </div>
      `;

      // Tap to expand / collapse
      group.addEventListener('click', function () {
        const tab = D.getElementById(`mcu-subtab-${idx}`);
        if (!tab) return;

        const isOpen = group.classList.toggle('mcu-expanded');
        tab.classList.toggle('mcu-open', isOpen);

        if (isOpen && !tab.dataset.populated) {
          tab.dataset.populated = '1';
          _populateSubTab(tab, typeName);
        }
      }, { passive: true });
    });
  }

  function _populateSubTab (tab, typeName) {
    const p = (typeof player !== 'undefined') ? player : null;

    if (!p || !p.roster || p.roster.length === 0) {
      tab.innerHTML = '<p style="color:#888;padding:6px;font-size:10px;">No unit data.</p>';
      return;
    }

    const units = p.roster.filter(u => {
      const t = (u.type || u.name || '').trim().toUpperCase();
      return t === typeName.toUpperCase();
    });

    if (units.length === 0) {
      tab.innerHTML = '<p style="color:#888;padding:6px;font-size:10px;">No individual records found.</p>';
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>#</th><th>HP</th><th>LVL</th><th>EXP</th><th>ROLE</th><th>FAC</th>
          </tr>
        </thead>
        <tbody>
    `;

    units.forEach((u, i) => {
      const hp   = Math.floor(u.hp  ?? 100);
      const lvl  = u.lvl ?? u.level ?? u.experienceLevel ?? 1;
      const rawExp = u.exp ?? u.experience ?? 0;
      const expStr = (typeof rawExp === 'number' && rawExp % 1 !== 0)
        ? ((rawExp % 1) * 100).toFixed(0) + '%'
        : String(Math.floor(rawExp));
      const role = ((u.role || u.unitRole || '—')).toString().toUpperCase().substring(0, 9);
      const fac  = (u.faction || '—').toString().substring(0, 8);
      const rowBg = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent';

      let hpClass = 'mob-subtab-hp-hi';
      if (hp < 60) hpClass = 'mob-subtab-hp-mid';
      if (hp < 30) hpClass = 'mob-subtab-hp-lo';

      html += `
        <tr style="background:${rowBg}">
          <td style="color:#666;">${i + 1}</td>
          <td class="${hpClass}">${hp}</td>
          <td style="color:#fff;">${lvl}</td>
          <td style="color:#d4b886;">${expStr}</td>
          <td style="color:#aaa;">${role}</td>
          <td style="color:#888;">${fac}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    tab.innerHTML = html;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  §7  TACTICAL / MANUAL TOGGLE EMOJI SIMPLIFICATION
  //  Searches for known button IDs, then falls back to text heuristics.
  //  Runs at most once per element (tracked by dataset.mcuEmoji).
  // ──────────────────────────────────────────────────────────────────────────

  function simplifyTacticalButtons () {
    const all = D.querySelectorAll('button:not([data-mcu-emoji])');
    all.forEach(btn => {
      const txt = (btn.textContent || '').trim().toUpperCase();

      // ── Tactical Auto ────────────────────────────────────────────────────
      if (
        btn.id === 'tactical-auto-btn' ||
        btn.id === 'tac-auto-btn'      ||
        txt.includes('TACTICAL AUTO')  ||
        txt.includes('AUTO BATTLE')    ||
        (txt === 'AUTO' && btn.closest('#mc3'))
      ) {
        btn.dataset.mcuEmoji    = '1';
        btn.dataset.mcuOrigText = btn.innerHTML;
        btn.innerHTML           = '⚙️';
        btn.title               = 'Tactical Auto';
        btn.classList.add('mcu-emoji-btn');
        return;
      }

      // ── Manual ON ────────────────────────────────────────────────────────
      if (
        btn.id === 'manual-on-btn'   ||
        btn.id === 'manual-enable-btn' ||
        txt === 'MANUAL ON'          ||
        txt === 'ENABLE MANUAL'      ||
        txt === 'MANUAL: ON'
      ) {
        btn.dataset.mcuEmoji    = '1';
        btn.dataset.mcuOrigText = btn.innerHTML;
        btn.innerHTML           = '🕹️';
        btn.title               = 'Manual: ON';
        btn.classList.add('mcu-emoji-btn');
        return;
      }

      // ── Manual OFF ───────────────────────────────────────────────────────
      if (
        btn.id === 'manual-off-btn'    ||
        btn.id === 'manual-disable-btn' ||
        txt === 'MANUAL OFF'            ||
        txt === 'DISABLE MANUAL'        ||
        txt === 'MANUAL: OFF'
      ) {
        btn.dataset.mcuEmoji    = '1';
        btn.dataset.mcuOrigText = btn.innerHTML;
        btn.innerHTML           = '🤖';
        btn.title               = 'Manual: OFF';
        btn.classList.add('mcu-emoji-btn');
        return;
      }

      // ── Manual toggle (single button that flips state) ───────────────────
      if (
        btn.id === 'manual-toggle-btn' ||
        btn.id === 'manual-btn'
      ) {
        btn.dataset.mcuEmoji = '1';
        // Read initial state from text
        const isOn = txt.includes('ON') || txt.includes('ENABLE');
        btn.innerHTML = isOn ? '🕹️ ON' : '🤖 OFF';
        btn.title = 'Manual Control';
        btn.classList.add('mcu-emoji-btn');
        // Patch future clicks to flip emoji
        btn.addEventListener('click', () => {
          const nowOn = btn.innerHTML.includes('🕹️');
          btn.innerHTML = nowOn ? '🤖 OFF' : '🕹️ ON';
        }, { passive: true });
      }
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  §1  MAIN MENU PATCHES
  //  Ensures Units button + all other buttons are touch-friendly on mobile.
  //  Credits text gets the `mcu-credits` class so CSS anchors it to bottom.
  // ──────────────────────────────────────────────────────────────────────────

  function patchMainMenu (menuEl) {
    if (!isMobile())               return;
    if (!menuEl)                   return;
    if (menuEl.dataset.mcuPatched) return;
    menuEl.dataset.mcuPatched = '1';

    // Make every button inside the main UI container touch-friendly
    menuEl.querySelectorAll('button').forEach(btn => {
      // Don't override buttons that are part of the manual modal
      if (btn.closest('#manual-content')) return;
      btn.style.width       = 'clamp(180px, 80vw, 300px)';
      btn.style.padding     = '12px 16px';
      btn.style.fontSize    = 'clamp(12px, 3.5vw, 18px)';
      btn.style.margin      = '6px auto';
      btn.style.boxSizing   = 'border-box';
      btn.style.touchAction = 'manipulation';
      // Respect visibility set by game logic (play btn starts hidden)
    });

    // Units guide stays hidden until the Manual button is pressed
    const unitsBtn = $('units-guide-btn');
    if (unitsBtn) {
      applyStyle(unitsBtn, {
        width:       'clamp(180px, 80vw, 300px)',
        padding:     '12px 16px',
        fontSize:    'clamp(12px, 3.5vw, 18px)',
        margin:      '6px auto',
        display:     'none',
        boxSizing:   'border-box',
        touchAction: 'manipulation',
      });
    }

    const unlockUnitsGuide = () => {
      menuEl.classList.add('mcu-units-unlocked');
      const btn = $('units-guide-btn');
      if (btn) btn.style.display = 'block';
    };

    const manualBtn = Array.from(menuEl.querySelectorAll('button')).find(btn =>
      (btn.textContent || '').trim().toLowerCase() === 'manual'
    );

    if (manualBtn && !manualBtn.dataset.mcuUnlockHooked) {
      manualBtn.dataset.mcuUnlockHooked = '1';
      manualBtn.addEventListener('click', () => {
        setTimeout(unlockUnitsGuide, 0);
      });
    }

    // Tag credits element for CSS anchoring
    const allChildren = Array.from(menuEl.children);
    allChildren.forEach(child => {
      if (child.innerText && child.innerText.toLowerCase().includes('historical')) {
        child.classList.add('mcu-credits');
      }
    });

    // Ensure the uiContainer itself allows scrolling if content overflows
    const uiContainer = menuEl.querySelector('[style*="flex-direction"]');
    if (uiContainer) {
      uiContainer.style.overflowY = 'auto';
      uiContainer.style.maxHeight = '85vh';
      uiContainer.style.paddingBottom = '30px'; // room above credits
      uiContainer.style.boxSizing = 'border-box';
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  §1  CUSTOM BATTLE GUI — compact for mobile
  // ──────────────────────────────────────────────────────────────────────────

  function patchCustomBattleCompact (containerEl) {
    if (!isMobile())                    return;
    if (!containerEl)                   return;
    if (containerEl.dataset.mcuCBFixed) return;
    containerEl.dataset.mcuCBFixed = '1';

    // Shrink all buttons
    containerEl.querySelectorAll('button').forEach(btn => {
      applyStyle(btn, {
        fontSize:    'clamp(9px, 2.5vw, 13px)',
        padding:     'clamp(5px, 1.3vw, 8px) clamp(4px, 1.1vw, 7px)',
        minHeight:   '34px',
        lineHeight:  '1.1',
        whiteSpace:  'normal',
        touchAction: 'manipulation',
      });
    });

    // Shrink unit portrait cards
    containerEl.querySelectorAll('[style*="border: 1px solid #d4b886"]').forEach(card => {
      applyStyle(card, {
        padding:  '4px 3px',
        fontSize: 'clamp(9px, 2.3vw, 12px)',
        minWidth: '0',
      });
    });

    // Make roster lists scrollable with momentum
    containerEl.querySelectorAll('[style*="overflow"]').forEach(el => {
      el.style.overflowY            = 'auto';
      el.style.webkitOverflowScrolling = 'touch';
    });

    // Body panel: stack vertically and allow scroll
    const body = containerEl.querySelector('[style*="display: flex"]');
    if (body && body !== containerEl.firstElementChild) {
      body.style.flexDirection = 'column';
      body.style.overflowY     = 'auto';
      body.style.webkitOverflowScrolling = 'touch';
      body.style.flex          = '1 1 auto';
      // Each half (attacker / defender) gets full width
      Array.from(body.children).forEach(panel => {
        panel.style.width      = '100%';
        panel.style.minHeight  = '0';
        panel.style.borderRight = 'none';
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  MUTATION OBSERVER — watch for dynamically created elements
  // ──────────────────────────────────────────────────────────────────────────

  function startObserver () {
    const obs = new MutationObserver(mutations => {
      for (const m of mutations) {

    // — Child nodes added —
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;

          if (node.id === 'main-menu') {
            setTimeout(() => patchMainMenu(node), 80);
          }
          if (node.id === 'cb-menu-container') {
            setTimeout(() => patchCustomBattleCompact(node), 80);
          }
          if (node.id === 'settlement-upgrade-menu') { // ✅ FIXED
            syncTroopCloseBar();
          }
        }

// — Attribute changes (style / class) —
        if (m.type === 'attributes') {
          const targetNode = m.target;

          if (targetNode.id === 'settlement-upgrade-menu') {
            syncTroopCloseBar();
          }
          if (targetNode.id === 'mob-detail-panel' &&
              targetNode.classList.contains('open')) {
            // Small delay so refreshDetailDrawer() has finished writing HTML
            setTimeout(enhanceDetailTroops, 140);
          }
          if (targetNode.id === 'city-panel') {
            syncOverworldButtons();
          }
        }
      }
    });

    obs.observe(D.body, {
      childList:       true,
      subtree:         true,
      attributes:      true,
      attributeFilter: ['style', 'class'],
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  POLL LOOP — runs every 400 ms to sync state-dependent visibility
  // ──────────────────────────────────────────────────────────────────────────

  function pollTick () {
    syncOverworldButtons();
    syncTroopCloseBar();
    patchHoldTouch();

    // Tactical buttons — check each tick (battle UI built dynamically)
    simplifyTacticalButtons();

    // If detail drawer is open, keep troop expand ready
    const panel = $('mob-detail-panel');
    if (panel && panel.classList.contains('open')) {
      enhanceDetailTroops();
    }

    // Loading screen gap
    fixLoadingScreenGap();
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  BOOT
  // ──────────────────────────────────────────────────────────────────────────

  function init () {
    fixViewport();
    injectGlobalCSS();
    
    startObserver();

    // Kick off the poll loop
    setInterval(pollTick, 400);
    setTimeout(pollTick, 250); // first run sooner

    // Resize re-sync
    W.addEventListener('resize', () => {
      syncOverworldButtons();
      syncTroopCloseBar();
    }, { passive: true });

    // Patch any menus already present (e.g. hot-reload)
    const existingMenu = $('main-menu');
    if (existingMenu) patchMainMenu(existingMenu);

    const existingCB = $('cb-menu-container');
    if (existingCB) patchCustomBattleCompact(existingCB);

    // Expose public API so other modules can call these helpers
    W.mobileCleaner = {
      syncOverworldButtons,
      enhanceDetailTroops,
      simplifyTacticalButtons,
      patchHoldTouch,
      patchMainMenu,
      patchCustomBattleCompact,
    };

    console.log('[mobile_cleanup.js v1.0] ✓ Loaded');
  }

  // ── Boot after DOM is ready ────────────────────────────────────────────────
  if (D.readyState === 'loading') {
    D.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window, document);

// ──────────────────────────────────────────────────────────────────────────
  //  §11  TROOPGUI VISIBILITY OVERRIDE (Hide Return & Detail Buttons)
  // ──────────────────────────────────────────────────────────────────────────
  (function() {
    // 1. Inject CSS that uses !important to natively overpower the JS polling intervals
    const style = document.createElement('style');
    style.textContent = `
      body.troop-gui-open #mc3-pbtn,
      body.troop-gui-open #mob-detail-btn {
        display: none !important;
      }
    `;
    document.head.appendChild(style);

    // 2. Fast-polling watcher to toggle the state class on the body
    setInterval(() => {
      const menuDiv = document.getElementById('settlement-upgrade-menu');
      
      // Check if the Troop GUI is currently popped out
      const isOpen = menuDiv && menuDiv.style.display !== 'none' && menuDiv.style.display !== '';
      
      if (isOpen) {
        document.body.classList.add('troop-gui-open');
      } else {
        document.body.classList.remove('troop-gui-open');
      }
    }, 150); // 150ms is fast enough to feel instant and beats the 400ms/1000ms game loops
  })();
  
  
  /**
 * FIX.JS - Lazy Overworld UI Hotfix
 * Replaces standard browser alerts with temporary button text feedback.
 */
(function() {
    function patchCityButtons() {
        const cityPanel = document.getElementById('city-panel');
        if (!cityPanel) return;

        // Find all buttons inside the recruit-box
        const buttons = cityPanel.querySelectorAll('#recruit-box .menu-btn');

        buttons.forEach(btn => {
            // Check if this button already has our fix to avoid infinite loops
            if (btn.dataset.isPatched) return;

            const originalOnClick = btn.onclick;
            if (!originalOnClick) return;

            // Replace the onclick logic
            btn.onclick = function(e) {
                // We override the global alert temporarily
                const oldAlert = window.alert;
                let alerted = false;

                window.alert = function(msg) {
                    alerted = true;
                    showTemporaryError(btn, "❌ " + msg.toUpperCase());
                };

                // Execute the original logic (recruiting/buying food)
                originalOnClick.call(this, e);

                // Restore the global alert
                window.alert = oldAlert;
            };

            btn.dataset.isPatched = "true";
        });
    }

    /**
     * Swaps button text temporarily
     */
    function showTemporaryError(btn, errorMsg) {
        if (btn.dataset.isRestoring) return;
        
        const originalText = btn.innerText;
        btn.innerText = errorMsg;
        btn.style.color = "#ff5252"; // Red error color
        btn.dataset.isRestoring = "true";

        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.color = ""; // Revert to CSS default
            delete btn.dataset.isRestoring;
        }, 2000);
    }

    // Run the patcher whenever the city panel might have been updated or shown
    setInterval(patchCityButtons, 1500);
    console.log("[fix.js] Alerts replaced with button text feedback ✓");
})();


// =============================================================================
// DAWN OF GUNPOWDER — mobile_patch2.js (Drop-in Stats Overhaul)
// =============================================================================
// Intercepts the mobile UI troop drawer and replaces the generic Role/Faction 
// table with comprehensive combat statistics, requiring zero internal hooks.
// =============================================================================

;(function(W, D) {
    'use strict';

// 1. Inject the revised CSS for the scrollable layout
    const style = D.createElement('style');
    style.textContent = `
        /* Override mobile_cleanup.js hidden overflow to allow horizontal swiping */
        .mob-troop-subtab {
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
            scrollbar-width: thin !important;
        }
        /* Style the scrollbar to match the UI theme */
        .mob-troop-subtab::-webkit-scrollbar {
            height: 6px !important;
            display: block !important;
        }
        .mob-troop-subtab::-webkit-scrollbar-thumb {
            background: #d4b886 !important;
            border-radius: 4px !important;
        }
        .mob-troop-subtab th {
            color: #ffca28 !important;
            text-align: left !important;
            padding: 4px 6px !important;
            border-bottom: 1px solid #5d4037 !important;
            font-size: 9px !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
            white-space: nowrap !important;
        }
        .mob-troop-subtab td {
            padding: 3px 6px !important;
            color: #d4b886 !important;
            font-size: 10px !important;
            border-bottom: 1px solid rgba(93, 64, 55, 0.2) !important;
            white-space: nowrap !important;
        }
        .mob-subtab-hp-hi  { color: #8bc34a !important; }
        .mob-subtab-hp-mid { color: #ff9800 !important; }
        .mob-subtab-hp-lo  { color: #f44336 !important; }
    `;
    D.head.appendChild(style);

    // 2. The Enhanced HTML Generator
    function _populateSubTabEnhanced(tab, typeName) {
        const p = (typeof player !== 'undefined') ? player : null;

        if (!p || !p.roster || p.roster.length === 0) {
            tab.innerHTML = '<p style="color:#888;padding:6px;font-size:10px;">No unit data.</p>';
            return;
        }

        const units = p.roster.filter(u => {
            const t = (u.type || u.name || '').trim().toUpperCase();
            return t === typeName.toUpperCase();
        });

        if (units.length === 0) {
            tab.innerHTML = '<p style="color:#888;padding:6px;font-size:10px;">No individual records found.</p>';
            return;
        }

let html = `
            <table style="width: 100%; min-width: 480px; border-collapse: collapse;">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>HP</th>
                        <th>LVL</th>
                        <th>EXP</th>
                        <th>MOR</th>
                        <th>ATK</th>
                        <th>DEF</th>
                        <th>ARM</th>
                        <th>CST</th>
                        <th>UPK</th>
                    </tr>
                </thead>
                <tbody>
        `;

units.forEach((u, i) => {
            // Safely map stats utilizing fallbacks mapped from troop_system.js
            const hp     = Math.floor(u.hp ?? u.health ?? 100);
            const lvl    = u.lvl ?? u.experienceLevel ?? u.level ?? 1;
            const rawExp = u.exp ?? u.experience ?? 0;
            const expStr = (typeof rawExp === 'number' && rawExp % 1 !== 0)
                ? ((rawExp % 1) * 100).toFixed(0) + '%'
                : String(Math.floor(rawExp));
            
// 1. Fetch the pristine template from the global Unit Roster
            const template = window.UnitRoster && window.UnitRoster.allUnits[u.type || u.name];
            
            // 2. Calculate dynamic scaling bonuses 
            // (Engine formula: +2 ATK & DEF per Experience Level)
            const levelBonus = (lvl || 1) * 2;

            // 3. Fallback to templates, otherwise use absolute baseline minimums
            const baseMor = template ? (template.maxMorale || template.morale) : 20;
            const baseAtk = template ? template.meleeAttack : 10;
            const baseDef = template ? template.meleeDefense : 10;
            const baseArm = template ? template.armor : 2;

            // 4. Map the final stats. 
            // If the unit has an active override (u.meleeAttack), use it. 
            // Otherwise, combine the Base Template + Level Bonus.
            const mor = Math.floor(u.morale ?? baseMor);
            const atk = Math.floor(u.meleeAttack ?? (baseAtk + levelBonus));
            const def = Math.floor(u.meleeDefense ?? (baseDef + levelBonus));
            const arm = Math.floor(u.armor ?? baseArm);

            // --- COST & UPKEEP LOGIC ---
            const cost = Math.floor(u.cost ?? (template ? template.cost : 0));
            const upkeep = Math.floor(u.upkeep ?? (cost / 10));
            const rowBg = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent';

            // HP Color Conditional Formatting
            let hpClass = 'mob-subtab-hp-hi';
            if (hp < 60) hpClass = 'mob-subtab-hp-mid';
            if (hp < 30) hpClass = 'mob-subtab-hp-lo';

            // Morale Color Conditional Formatting
            let morClass = 'mob-subtab-hp-hi';
            if (mor < 35) morClass = 'mob-subtab-hp-mid';
            if (mor < 15) morClass = 'mob-subtab-hp-lo';

            html += `
                <tr style="background:${rowBg}">
                    <td style="color:#666;">${i + 1}</td>
                    <td class="${hpClass}">${hp}</td>
                    <td style="color:#fff;">${lvl}</td>
                    <td style="color:#d4b886;">${expStr}</td>
                    <td class="${morClass}">${mor}</td>
                    <td style="color:#e57373;">${atk}</td>
                    <td style="color:#64b5f6;">${def}</td>
                    <td style="color:#9e9e9e;">${arm}</td>
                    <td style="color:#ffca28; font-weight:bold;">${cost}</td>
                    <td style="color:#ffab00;">${upkeep}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        tab.innerHTML = html;
    }

    // 3. Lazy "Zero-Hook" DOM Watcher
    // Instead of overriding internal closures, we just watch the DOM for when 
    // mobile_cleanup opens and populates a drawer, then instantly overwrite it.
    setInterval(() => {
        // Find panels that mobile_cleanup has marked as populated, but we haven't patched yet
        D.querySelectorAll('.mob-troop-subtab[data-populated="1"]:not([data-patched="1"])').forEach(tab => {
            tab.dataset.patched = '1';
            
            const typeName = tab.dataset.type; 
            if (typeName) {
                _populateSubTabEnhanced(tab, typeName);
            }
        });
    }, 100); // 50ms Checks fast enough that the user won't see a flicker

    console.log("[mobile_patch2.js] ✓ Lazy troop stats injector loaded");

})(window, document);


/**
 * HUD SYNC & MORALE/AMMO FIX PATCH
 * Resolves the issue where the blue morale bar and ammo bar do not update or reset.
 * Run this after battlefield_logic.js
 */
(function() {
    if (typeof window.updateBattleUnits !== 'function') {
        console.warn("Battle engine not found. HUD Sync Patch aborted.");
        return;
    }

    // 1. Store the original engine loop
    const _original_updateBattleUnits = window.updateBattleUnits;

    // 2. Wrap it with our pre-processing sync logic
    window.updateBattleUnits = function() {
        if (window.battleEnvironment && Array.isArray(window.battleEnvironment.units)) {
            
            window.battleEnvironment.units.forEach(u => {
                // --- A. ONE-TIME INITIALIZATION (Fixing deployArmy Overrides) ---
                if (!u._hudFixed) {
                    u._hudFixed = true;
                    
                    // Restore actual unit stats from the pristine roster template
                    // deployArmy artificially forces maxMorale and morale to 20.
                    let template = window.UnitRoster && window.UnitRoster.allUnits[u.unitType];
                    if (template) {
                        u.stats.maxMorale = template.maxMorale || 20;
                        
                        // If it was artificially capped at 20, restore its true glory
                        if (u.stats.morale === 20 && template.morale !== 20) {
                            u.stats.morale = template.morale;
                        }
                    }
                    
                    // Initialize Engine root values from the pristine stats
                    // The AI engine modifies u.ammo and u.morale directly, so they must exist.
                    if (typeof u.ammo !== 'number') {
                        u.ammo = u.stats.ammo || 0;
                    }
                    if (typeof u.morale !== 'number') {
                        u.morale = u.stats.morale || 20;
                    }
                }

                // --- B. CONTINUOUS SYNC (Engine -> HUD) ---
                // Mobile controls read from u.stats, but the AI engine modifies root u.
                // Syncing them ensures the UI instantly reflects reality.
                if (typeof u.morale === 'number' && u.stats) {
                    u.stats.morale = u.morale;
                }
                if (typeof u.ammo === 'number' && u.stats) {
                    u.stats.ammo = u.ammo;
                }
            });
        }
        
        // 3. Execute Original Battle Loop
        _original_updateBattleUnits();
    };

    console.log("✅ Morale & Ammo HUD Sync Patch Applied Successfully.");
})();


 
(function() {
    'use strict';
 
    // --- 1. GLOBAL QUIT FUNCTION ---
    // The safest way to return to the main menu in a DOM-heavy vanilla JS game 
    // without memory leaks or duplicate game-loops is to reload the browser state.
    window.returnToMainMenu = function() {
        if (confirm("Return to Main Menu?\n\nAny unsaved progress will be lost.")) {
            window.location.reload(); 
        }
    };
 
const style = document.createElement('style');
    style.textContent = `
        /* BULLETPROOF GUARD: Hide Save UI during active loading sequences */
        body.is-loading-state #save-load-overlay {
            display: none !important;
        }
    `;
    document.head.appendChild(style);
 
    // --- 3. HIGH-SPEED WATCHER LOOP ---
    // (Fixed the double-setInterval memory leak)
    setInterval(() => {
         
        // A. Prevent Glitches: Check Loading Screen State
        const loadingRibbon = document.getElementById('loading');
        const loadingScreen = document.getElementById('loading-screen-wrapper');
        
        const isRibbonVisible = loadingRibbon && loadingRibbon.style.display !== 'none' && loadingRibbon.style.display !== '';
        const isScreenVisible = loadingScreen && loadingScreen.style.display !== 'none' && loadingScreen.style.display !== '';
 
        if (isRibbonVisible || isScreenVisible) {
            document.body.classList.add('is-loading-state');
        } else {
            document.body.classList.remove('is-loading-state');
        }
 
        // B. Prevent Glitches: Check Main Menu State
        const mainMenu = document.getElementById('main-menu');
        // If the menu element exists and is not explicitly hidden, we are on the menu
        if (mainMenu && mainMenu.style.display !== 'none') {
            document.body.classList.add('on-main-menu');
        } else {
            document.body.classList.remove('on-main-menu');
        }
 
 
 
    }, 1000); // Check runs safely once per second
 
    console.log("[menu_navigation_patch.js] ✓ Quit to Menu / Load Screen Guard initialized.");
})();