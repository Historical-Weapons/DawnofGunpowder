
;(function (W, D) {
  'use strict';

  // ── Guard: run only once ──────────────────────────────────────────────────
  if (W.__MC3_LOADED__) return;
  W.__MC3_LOADED__ = true;

  const ROOT = 'mc3';
  const VER  = 4;

  // ==========================================================================
  //  SECTION 1 — CSS INJECTION
  // ==========================================================================
  function injectCSS() {
    if (D.getElementById('mc3-css')) return;
    const tag = D.createElement('style');
    tag.id = 'mc3-css';
    tag.textContent = `

      /* ── ROOT overlay ─────────────────────────────────────────────────── */
 
/* ── SURVIVOR HUD (Positioned below the top bar) ─────────────────── */
      #mc3-survivor-hud {
        position: fixed;
        /* Math: 50px (Bar Height) + 44px (Safe Area/Notch) + 10px (Buffer) = ~104px */
        top: calc(env(safe-area-inset-top, 0px) + 60px); 
        left: max(env(safe-area-inset-left, 0px) + 10px, 10px);
        background: rgba(14, 6, 3, 0.85);
        border: 2.5px solid #5d4037;
        border-radius: 6px;
        padding: 6px 12px;
        display: none; 
        flex-direction: column;
        gap: 4px;
        pointer-events: none;
        z-index: 9610;
        box-shadow: 0 4px 12px rgba(0,0,0,0.8);
      }
      .mc3-surv-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: clamp(0.8rem, 2.5vw, 1rem);
        font-weight: bold;
        text-shadow: 1px 1px 2px #000;
        white-space: nowrap;
      }
      .mc3-surv-ally { color: #8bc34a; }
      .mc3-surv-foe  { color: #ff5252; }
	  
      #mc3 {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 9600;
        font-family: 'Georgia', serif;
      }

      /* ── Shared button base ──────────────────────────────────────────── */
      .mc3-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        pointer-events: auto;
        cursor: pointer;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        background: linear-gradient(to bottom, #7b1a1a, #4a0a0a);
        color: #f5d76e;
        border: 1.5px solid #d4b886;
        border-radius: 5px;
        font-family: 'Georgia', serif;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        text-shadow: 1px 1px 2px #000;
        box-shadow: 0 2px 6px rgba(0,0,0,0.65);
        user-select: none;
        -webkit-user-select: none;
        -webkit-user-drag: none;
        transition: background 0.1s, transform 0.08s;
        white-space: nowrap;
      }
      /* "Pressed" feedback class applied briefly by _mkBtn */
      .mc3-btn:active,
      .mc3-btn.pressed {
        transform: scale(0.88);
        background: linear-gradient(to bottom, #9a2020, #6a1010);
      }

      /* ── HEADER BAR (top-center, grows downward with open trays) ─────── */
      #mc3-hbar {
        position: fixed;
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        pointer-events: none;
        z-index: 9610;
      }

      /* Main row of header buttons */
      #mc3-hrow {
        display: flex;
        align-items: center;
        gap: clamp(3px, 1vw, 6px);
        padding: 4px clamp(6px, 2vw, 10px);
        background: rgba(18,8,4,0.94);
        border: 1px solid #d4b886;
        border-top: none;
        border-radius: 0 0 10px 10px;
        pointer-events: auto;
        flex-wrap: nowrap;
        overflow: visible;
      }

      /* ── P button (circle) ───────────────────────────────────────────── */
      #mc3-pbtn {
        width:  clamp(38px, 8vw, 48px);
        height: clamp(38px, 8vw, 48px);
        border-radius: 50%;
        border: 2px solid #ffca28;
        background: linear-gradient(to bottom, #c62828, #7b1a1a);
        font-size: clamp(0.8rem, 2.5vw, 1rem);
        flex-shrink: 0;
      }

      /* ── Group buttons 1-5 ───────────────────────────────────────────── */
      .mc3-gbtn {
        width:  clamp(30px, 6.5vw, 42px);
        height: clamp(30px, 6.5vw, 42px);
        font-size: clamp(0.6rem, 1.8vw, 0.78rem);
        gap: 1px;
        flex-shrink: 0;
      }
      .mc3-gbtn .gsub {
        font-size: clamp(0.42rem, 1.1vw, 0.52rem);
        opacity: 0.75;
      }

      /* ── CMD / FORM / STACK / HELP toggle buttons ────────────────────── */
      .mc3-toggle-btn {
        height: clamp(30px, 6.5vw, 42px);
        padding: 0 clamp(5px, 1.5vw, 9px);
        font-size: clamp(0.55rem, 1.5vw, 0.7rem);
        border-radius: 5px;
        gap: 2px;
        flex-shrink: 0;
      }
      /* Highlighted state when a tray / overlay is open */
      .mc3-toggle-btn.tray-open {
        background: linear-gradient(to bottom, #9a2020, #6a1010);
        border-color: #ffca28;
        box-shadow: 0 0 8px rgba(255,202,40,0.45);
      }

      /* ── TRAYS (drop below header row) ───────────────────────────────── */
      .mc3-tray {
        display: none;
        flex-direction: row;
        flex-wrap: wrap;
        justify-content: center;
        gap: clamp(4px, 1.2vw, 7px);
        padding: clamp(5px, 1.5vw, 8px) clamp(8px, 2.5vw, 14px);
        background: rgba(18,8,4,0.97);
        border: 1px solid #d4b886;
        border-top: none;
        border-radius: 0 0 10px 10px;
        pointer-events: auto;
        max-width: 94vw;
      }
      .mc3-tray.open { display: flex; }

      /* ── Buttons inside trays ─────────────────────────────────────────── */
      .mc3-tray-btn {
        width:  clamp(50px, 10vw, 66px);
        height: clamp(46px, 9.5vw, 60px);
        font-size: clamp(0.62rem, 1.7vw, 0.73rem);
        gap: 2px;
        border-radius: 5px;
      }
      .mc3-tray-btn .ticon { font-size: clamp(1rem, 3vw, 1.3rem); line-height: 1; }
      .mc3-tray-btn .tlbl  { font-size: clamp(0.48rem, 1.2vw, 0.58rem); opacity: 0.85; }

      /* ── TOAST notification ───────────────────────────────────────────── */
      #mc3-toast {
        position: fixed;
        top: clamp(54px, 14vw, 70px);
        left: 50%;
        transform: translateX(-50%);
        background: rgba(10,4,2,0.92);
        border: 1px solid #d4b886;
        border-radius: 20px;
        color: #f5d76e;
        font-family: 'Georgia', serif;
        font-size: clamp(0.7rem, 2.2vw, 0.88rem);
        padding: 7px 18px;
        z-index: 9700;
        pointer-events: none;
        white-space: nowrap;
        opacity: 0;
        transition: opacity 0.3s ease;
        text-shadow: 1px 1px 2px #000;
        box-shadow: 0 3px 12px rgba(0,0,0,0.8);
        max-width: 80vw;
        text-align: center;
      }
      #mc3-toast.show { opacity: 1; }

      /* ── VIRTUAL JOYSTICK ────────────────────────────────────────────── */
      #mc3-joy {
        position: fixed;
        bottom: max(env(safe-area-inset-bottom, 0px) + 10px, 10px);
        left: 10px;
        width:  clamp(110px, 22vw, 150px);
        height: clamp(110px, 22vw, 150px);
        pointer-events: auto;
        touch-action: none;
        z-index: 9620;
      }
      #mc3-joy-ring {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: rgba(0,0,0,0.22);
        border: 2px solid rgba(212,184,134,0.48);
        box-shadow: 0 0 14px rgba(0,0,0,0.55);
      }
      #mc3-joy-knob {
        position: absolute;
        width: 38%; height: 38%;
        border-radius: 50%;
        background: radial-gradient(circle at 33% 33%, #d4b886, rgba(100,65,40,0.88));
        border: 2px solid rgba(212,184,134,0.85);
        box-shadow: 0 0 8px rgba(0,0,0,0.7);
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        transition: top 0.07s ease, left 0.07s ease;
      }
      #mc3-joy.active #mc3-joy-knob { transition: none; }

      /* ── HUD WRAPPER (unit cards + stack toggle) ─────────────────────── */
      #mc3-hud-wrap {
        position: fixed;
        bottom: max(env(safe-area-inset-bottom, 0px) + 8px, 8px);
        left: calc(clamp(120px, 24vw, 165px) + 4px);
        right: 6px;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        pointer-events: none;
        z-index: 9620;
        gap: 3px;
      }
 

      /* Scrollable card row */
      #mc3-hud {
        display: flex;
        flex-direction: row;
        align-items: flex-end;
        gap: clamp(3px, 1vw, 6px);
        pointer-events: auto;
        width: 100%;
        overflow-x: auto;
        overflow-y: visible;
        padding: 2px 3px 4px;
        scrollbar-width: thin;
        scrollbar-color: rgba(212,184,134,0.4) transparent;
        -webkit-overflow-scrolling: touch;
      }
      #mc3-hud::-webkit-scrollbar          { height: 4px; }
      #mc3-hud::-webkit-scrollbar-thumb    { background: rgba(212,184,134,0.4); border-radius: 2px; }
      #mc3-hud::-webkit-scrollbar-track    { background: transparent; }

      /* ── Individual unit card ─────────────────────────────────────────── */
      .mc3-card {
        flex-shrink: 0;
        width: clamp(48px, 9.5vw, 64px);
        background: rgba(12,6,3,0.95);
        border: 2px solid rgba(212,184,134,0.4);
        border-radius: 6px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 3px 3px 3px;
        gap: 2px;
        cursor: pointer;
        touch-action: manipulation;
        pointer-events: auto;
        box-shadow: 0 3px 9px rgba(0,0,0,0.8);
        transition: border-color 0.14s, box-shadow 0.14s, opacity 0.14s;
        position: relative;
        -webkit-user-drag: none;
        user-select: none;
        -webkit-user-select: none;
      }
      .mc3-card.sel {
        border-color: #f5d76e;
        box-shadow: 0 0 10px rgba(245,215,110,0.65), 0 3px 9px rgba(0,0,0,0.8);
      }
      .mc3-card.dead {
        opacity: 0.28;
        filter: grayscale(1);
        pointer-events: none;
      }
      /* Ghost card during drag-reorder */
      .mc3-card.drag-ghost {
        opacity: 0.38;
        pointer-events: none;
      }
      /* Card being hovered over during reorder drag */
      .mc3-card.drag-over {
        border-color: #ffca28;
        box-shadow: 0 0 8px rgba(255,202,40,0.55);
      }

      /* ── Stacked-card wrapper (modes 1 & 2) ──────────────────────────── */
      .mc3-stack-wrap {
        position: relative;
        flex-shrink: 0;
        pointer-events: auto;
      }
      /* Back-cards are absolutely positioned with a small offset per layer */
      .mc3-stack-wrap .mc3-card.stack-back {
        position: absolute;
        top: 0;
        left: 0;
        pointer-events: none; /* only the front card is interactive */
      }
      /* Front card sits in normal flow to set wrapper height */
      .mc3-stack-wrap .mc3-card.stack-front {
        position: relative;
        z-index: 5;
      }
      /* Stack depth count badge — top-right of wrapper */
      .mc3-stack-count {
        position: absolute;
        top: 2px;
        right: 2px;
        background: rgba(198,40,40,0.92);
        color: #fff;
        font-size: clamp(0.4rem, 1.1vw, 0.55rem);
        font-family: monospace;
        font-weight: bold;
        border-radius: 50%;
        min-width: clamp(12px, 2.8vw, 18px);
        height:    clamp(12px, 2.8vw, 18px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
        pointer-events: none;
        border: 1px solid rgba(212,184,134,0.5);
        line-height: 1;
      }

/* ── Portrait area ───────────────────────────────────────────────── */
      .mc3-portrait {
        width: 100%;
        height: clamp(28px, 5.5vw, 38px);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: clamp(1rem, 2.8vw, 1.35rem);
        background: linear-gradient(to bottom, rgba(80,25,8,0.75), rgba(25,8,3,0.9));
        border-radius: 3px;
        position: relative;
        overflow: hidden;
      }
      .mc3-portrait-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center bottom;
        pointer-events: none;
      }
      /* HP badge (bottom-right of portrait) */
	  
	  
      /* HP badge (bottom-right of portrait) */
      .mc3-badge {
        position: absolute;
        bottom: 1px;
        right: 2px;
        font-size: clamp(0.38rem, 0.9vw, 0.48rem);
        color: rgba(212,184,134,0.8);
        font-family: monospace;
        font-weight: bold;
        line-height: 1;
      }

      /* ── Unit name label ─────────────────────────────────────────────── */
      .mc3-uname {
        font-size: clamp(0.38rem, 0.95vw, 0.48rem);
        color: #d4b886;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
        text-transform: uppercase;
        letter-spacing: 0.2px;
      }

      /* ── HP / Morale bar tracks ───────────────────────────────────────── */
      .mc3-bar {
        width: 100%;
        height: 4px;
        background: rgba(0,0,0,0.5);
        border-radius: 2px;
        overflow: hidden;
      }
      .mc3-bfill {
        height: 100%;
        border-radius: 2px;
        transition: width 0.35s ease;
      }
      .mc3-bfill.hp  { background: #4caf50; }
 

      /* ── Floating drag-ghost card (follows finger during reorder) ──────── */
      #mc3-drag-card {
        position: fixed;
        pointer-events: none;
        z-index: 9680;
        opacity: 0.82;
        transform: scale(1.08) rotate(2deg);
        box-shadow: 0 10px 25px rgba(0,0,0,0.92);
        display: none;
        width: clamp(48px, 9.5vw, 64px);
        background: rgba(12,6,3,0.97);
        border: 2px solid #ffca28;
        border-radius: 6px;
        overflow: hidden;
        flex-direction: column;
        align-items: center;
        padding: 3px;
        gap: 2px;
      }

      /* ── STATS POPUP ─────────────────────────────────────────────────── */
      #mc3-popup {
        position: fixed;
        left: 50%;
        transform: translateX(-50%);
        bottom: calc(max(env(safe-area-inset-bottom,0px) + 8px, 8px)
                     + clamp(110px,22vw,150px)
                     + clamp(56px,11vw,72px)
                     + 10px);
        width: clamp(240px, 58vw, 390px);
        max-height: 60vh;
        background: rgba(14,6,3,0.98);
        border: 2px solid #d4b886;
        border-radius: 8px;
        color: #d4b886;
        padding: 10px 12px 12px;
        z-index: 9650;
        display: none;
        pointer-events: auto;
        box-shadow: 0 8px 30px rgba(0,0,0,0.92);
        font-size: clamp(0.64rem, 1.8vw, 0.76rem);
        overflow: hidden;
        flex-direction: column;
      }
      #mc3-popup.vis { display: flex; }

      /* Scrollable inner content */
      #mc3-popup-inner {
        overflow-y: auto;
        overflow-x: hidden;
        flex: 1;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
        scrollbar-color: rgba(212,184,134,0.35) transparent;
        padding-right: 4px;
      }
      #mc3-popup-inner::-webkit-scrollbar       { width: 4px; }
      #mc3-popup-inner::-webkit-scrollbar-thumb { background: rgba(212,184,134,0.35); border-radius: 2px; }

      #mc3-pop-close {
        position: absolute;
        top: 5px;
        right: 8px;
        background: none;
        border: none;
        color: #d4b886;
        font-size: 1.1rem;
        cursor: pointer;
        pointer-events: auto;
        line-height: 1;
        padding: 4px 6px;
        touch-action: manipulation;
      }
      #mc3-pop-title {
        font-size: clamp(0.76rem, 2.2vw, 0.9rem);
        font-weight: bold;
        color: #f5d76e;
        margin-bottom: 3px;
        padding-right: 20px;
        text-transform: uppercase;
        letter-spacing: 1px;
        border-bottom: 1px solid rgba(212,184,134,0.28);
        padding-bottom: 4px;
        flex-shrink: 0;
      }
      #mc3-pop-subtitle {
        font-size: clamp(0.52rem, 1.4vw, 0.62rem);
        color: rgba(212,184,134,0.6);
        margin-bottom: 4px;
        flex-shrink: 0;
      }

      /* Two-column stat grid */
      .mc3-sgrid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 3px 10px;
        margin-top: 5px;
      }
      .mc3-srow {
        display: flex;
        justify-content: space-between;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        padding-bottom: 2px;
      }
      .mc3-srow .sl { color: #777; white-space: nowrap; }
      .mc3-srow .sv { color: #fff; font-weight: bold; white-space: nowrap; }

      /* Experience bar */
      #mc3-exp-track {
        width: 100%;
        height: 5px;
        background: rgba(0,0,0,0.5);
        border-radius: 3px;
        overflow: hidden;
        margin-top: 8px;
      }
      #mc3-exp-fill {
        height: 100%;
        background: linear-gradient(to right, #7b1fa2, #e040fb);
        border-radius: 3px;
        transition: width 0.4s ease;
      }
      #mc3-exp-lbl {
        font-size: clamp(0.5rem, 1.3vw, 0.6rem);
        color: #ce93d8;
        margin-top: 2px;
        text-align: right;
      }

      /* Ammo bar */
      #mc3-ammo-track {
        width: 100%;
        height: 4px;
        background: rgba(0,0,0,0.5);
        border-radius: 2px;
        overflow: hidden;
        margin-top: 6px;
      }
      #mc3-ammo-fill {
        height: 100%;
        background: linear-gradient(to right, #e65100, #ff9800);
        border-radius: 2px;
        transition: width 0.4s ease;
      }
      #mc3-ammo-lbl {
        font-size: clamp(0.5rem, 1.3vw, 0.6rem);
        color: #ffb74d;
        margin-top: 2px;
        text-align: right;
      }

      /* ── BACKDROP (closes trays / popups on outside tap) ─────────────── */
      #mc3-backdrop {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 9605;
      }
      #mc3-backdrop.act { pointer-events: auto; }

      /* ── BOX SELECTION rectangle ─────────────────────────────────────── */
      #mc3-selbox {
        position: fixed;
        pointer-events: none;
        border: 2px dashed rgba(245,215,110,0.82);
        background: rgba(245,215,110,0.06);
        z-index: 9590;
        display: none;
        box-shadow: inset 0 0 10px rgba(245,215,110,0.08);
      }

      /* ── HELP OVERLAY ────────────────────────────────────────────────── */
      #mc3-help-overlay {
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 50vw;
        min-width: 260px;
        max-width: 480px;
        max-height: 70vh;
        background: rgba(10,4,2,0.93);
        border: 2px solid #d4b886;
        border-radius: 10px;
        color: #d4b886;
        z-index: 9750;
        display: none;
        flex-direction: column;
        pointer-events: auto;
        box-shadow: 0 12px 45px rgba(0,0,0,0.96);
        overflow: hidden;
      }
      #mc3-help-overlay.vis { display: flex; }

      /* Help header bar */
      #mc3-help-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 9px 12px 7px;
        border-bottom: 1px solid rgba(212,184,134,0.25);
        flex-shrink: 0;
        background: rgba(20,8,4,0.5);
      }
      #mc3-help-title {
        font-size: clamp(0.78rem, 2.2vw, 0.94rem);
        font-weight: bold;
        color: #f5d76e;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      #mc3-help-close {
        background: none;
        border: none;
        color: #d4b886;
        font-size: 1.1rem;
        cursor: pointer;
        pointer-events: auto;
        line-height: 1;
        padding: 4px 8px;
        touch-action: manipulation;
      }

      /* Help scroll body — guaranteed text wrap, no horizontal scroll */
      #mc3-help-body {
        overflow-y: auto;
        overflow-x: hidden;
        flex: 1;
        padding: 10px 14px 16px;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
        scrollbar-color: rgba(212,184,134,0.35) transparent;
        font-size: clamp(0.64rem, 1.75vw, 0.78rem);
        line-height: 1.6;
        word-wrap: break-word;
        overflow-wrap: break-word;
        white-space: normal;
      }
      #mc3-help-body::-webkit-scrollbar       { width: 5px; }
      #mc3-help-body::-webkit-scrollbar-thumb { background: rgba(212,184,134,0.35); border-radius: 2px; }

      /* Help content sections */
      .mc3-help-section { margin-bottom: 13px; }
      .mc3-help-h {
        color: #f5d76e;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-size: clamp(0.66rem, 1.8vw, 0.8rem);
        border-bottom: 1px solid rgba(212,184,134,0.2);
        padding-bottom: 3px;
        margin-bottom: 6px;
      }
      .mc3-help-row {
        display: flex;
        gap: 8px;
        margin-bottom: 5px;
        align-items: flex-start;
        flex-wrap: nowrap;
      }
      .mc3-help-key {
        flex-shrink: 0;
        background: rgba(212,184,134,0.12);
        border: 1px solid rgba(212,184,134,0.3);
        border-radius: 4px;
        padding: 2px 6px;
        font-size: clamp(0.54rem, 1.5vw, 0.66rem);
        font-family: monospace;
        color: #ffca28;
        min-width: 58px;
        text-align: center;
        line-height: 1.4;
        word-break: break-word;
      }
      .mc3-help-desc {
        color: rgba(212,184,134,0.85);
        flex: 1;
        font-size: clamp(0.6rem, 1.65vw, 0.74rem);
        line-height: 1.5;
        word-wrap: break-word;
        overflow-wrap: break-word;
        min-width: 0;
      }
    `;
    D.head.appendChild(tag);
  }

  // ==========================================================================
  //  SECTION 2 — GAME STATE ACCESSOR
  // ==========================================================================
  const G = {
    isBattle() {
      return typeof inBattleMode !== 'undefined' && !!inBattleMode;
    },
    isMenuOpen() {
      const mm = D.getElementById('main-menu');
      if (mm && mm.style.display !== 'none' && mm.style.display !== '') return true;
      const cb = D.getElementById('cb-menu-container');
      if (cb && cb.style.display !== 'none' && cb.style.display !== '') return true;
      return false;
    },
    // Has the current battle reached a conclusion (victory / defeat / over)?
    isBattleOver() {
      if (typeof battleEnvironment === 'undefined' || !battleEnvironment) return false;
      return !!(battleEnvironment.battleOver ||
                battleEnvironment.victory    ||
                battleEnvironment.defeat     ||
                battleEnvironment.ended);
    },
    // Is the player currently inside a city / town scene?
    isInCity() {
      return !!(
        (typeof inCityMode  !== 'undefined' && inCityMode) ||
        (typeof inTownMode  !== 'undefined' && inTownMode) ||
        (typeof inSiegeBattle !== 'undefined' && inSiegeBattle) ||
        (typeof currentLocation !== 'undefined' && currentLocation &&
          String(currentLocation).match(/(city|town|village|castle|fort|camp)/i))
      );
    },
    env() {
      return (typeof battleEnvironment !== 'undefined') ? battleEnvironment : null;
    },
    // All living, commandable player units (no commander, no disabled AI)
    playerUnits() {
      const e = this.env();
      if (!e || !Array.isArray(e.units)) return [];
      return e.units.filter(u =>
        u.side === 'player' &&
        !u.isCommander &&
        !u.disableAICombat &&
        u.hp > 0
      );
    },
    // All living player units including commander (used for card display)
    allPlayerUnits() {
      const e = this.env();
      if (!e || !Array.isArray(e.units)) return [];
      return e.units.filter(u => u.side === 'player' && u.hp > 0);
    },
    selected() { return this.playerUnits().filter(u => u.selected); },
    commander() {
      const e = this.env();
      if (!e || !Array.isArray(e.units)) return null;
      return e.units.find(u =>
        u.side === 'player' &&
        (u.isCommander ||
          ['commander', 'general', 'player', 'captain']
            .includes((u.unitType || '').toLowerCase()))
      ) || null;
    },
  };

  // ==========================================================================
  //  SECTION 3 — COMMAND ENGINE
  //  Directly manipulates battleEnvironment.units (no simulated key-presses
  //  for battle commands — avoids the reaction-delay crash in v1/v2).
  // ==========================================================================
  const Cmd = {

    _audio(s) {
      if (typeof AudioManager !== 'undefined') AudioManager.playSound?.(s);
    },
    _stopLazy() {
      if (typeof stopLazyGeneral === 'function') stopLazyGeneral();
    },
    _safe(x, y, m) {
      return (typeof getSafeMapCoordinates === 'function')
        ? getSafeMapCoordinates(x, y, m || 50)
        : { x, y };
    },

    // ── P — exit battle / city / overworld ──────────────────────────────
    exit() {
      // Show a context-appropriate toast message, but still fire the key
      // so the game engine can do whatever 'P' does in the current state.
      if (!G.isBattle() && !G.isInCity()) {
        _showToast('Use this in battle or in a city.');
        this._audio('ui_click');
        // Don't fire key in overworld — nothing useful happens
        return;
      }
      if (G.isBattle() && !G.isBattleOver()) {
        _showToast('You can exit after the battle is over.');
      }
      _fireKey('p', 'keydown');
      setTimeout(() => _fireKey('p', 'keyup'), 90);
      this._audio('ui_click');
    },

    // ── Q — charge / seek & engage ──────────────────────────────────────
    charge() {
      const sel = G.selected();
      if (!sel.length) { _showToast('Select units first.'); return; }
      sel.forEach(u => {
        u.hasOrders    = true;
        u.orderType    = 'seek_engage';
        u.orderTargetPoint = null;
        u.formationTimer   = 120;
        u.reactionDelay    = Math.floor(Math.random() * 61) + 3;
      });
      if (typeof startLazyGeneral === 'function') startLazyGeneral();
      this._audio('charge');
    },

    // ── E — stop / hold position ─────────────────────────────────────────
    stop() {
      this._stopLazy();
      const sel = G.selected();
      if (!sel.length) { _showToast('Select units first.'); return; }
      sel.forEach(u => {
        u.hasOrders    = true;
        u.orderType    = 'hold_position';
        u.orderTargetPoint = null;
        u.target       = null;
        u.formationTimer   = 0;
        u.vx = 0;
        u.vy = 0;
        u.reactionDelay = Math.floor(Math.random() * 61) + 3;
        if (u.originalRange) {
          u.stats.range  = u.originalRange;
          u.originalRange = null;
        }
        const s = this._safe(u.x, u.y, 15);
        u.x = s.x;
        u.y = s.y;
      });
      this._audio('ui_click');
    },

    // ── R — retreat to south edge ────────────────────────────────────────
    retreat() {
      this._stopLazy();
      const sel = G.selected();
      if (!sel.length) { _showToast('Select units first.'); return; }
      const maxH = (typeof BATTLE_WORLD_HEIGHT !== 'undefined') ? BATTLE_WORLD_HEIGHT : 3600;
      sel.forEach(u => {
        u.hasOrders    = true;
        u.orderType    = 'retreat';
        u.orderTargetPoint = this._safe(u.x, maxH - 50 - Math.random() * 20);
        u.formationTimer   = 240;
        u.reactionDelay    = Math.floor(Math.random() * 61) + 3;
      });
      this._audio('ui_click');
    },

    // ── F — follow commander in current formation ────────────────────────
    follow() {
      this._stopLazy();
      const sel = G.selected();
      const cmd = G.commander();
      if (!sel.length) { _showToast('Select units first.'); return; }
      if (!cmd)        { _showToast('No commander found.'); return; }
      sel.forEach(u => {
        u.hasOrders    = true;
        u.orderType    = 'follow';
        u.orderTargetPoint = null;
        u.formationTimer   = 240;
        u.reactionDelay    = Math.floor(Math.random() * 22);
      });
      const style = (typeof currentFormationStyle !== 'undefined')
        ? currentFormationStyle : 'line';
      if (typeof calculateFormationOffsets === 'function') {
        calculateFormationOffsets(sel, style, cmd);
      }
      this._audio('ui_click');
    },

    // ── Z/X/V/C/B — formation anchored to centroid of selected units ─────
    formation(style) {
      this._stopLazy();
      const sel = G.selected();
      if (sel.length <= 1) {
        _showToast('Select 2+ units for a formation.');
        return;
      }
      const cx = sel.reduce((s, u) => s + u.x, 0) / sel.length;
      const cy = sel.reduce((s, u) => s + u.y, 0) / sel.length;

      if (typeof window.currentFormationStyle !== 'undefined') {
        window.currentFormationStyle = style;
      }
      // Persist so the triple-tap gesture can replay it
      W._mc3LastFormation = style;

      if (typeof calculateFormationOffsets === 'function') {
        calculateFormationOffsets(sel, style, { x: cx, y: cy });
      }
      sel.forEach(u => {
        u.hasOrders    = true;
        u.orderType    = 'follow';
        u.orderTargetPoint = null;
        u.formationTimer   = 240;
        u.reactionDelay    = Math.floor(Math.random() * 15) + 5;
      });
      this._audio('ui_click');
    },

    // ── Move to world point (double-tap gesture) ─────────────────────────
    moveTo(worldX, worldY) {
      this._stopLazy();
      const sel = G.selected();
      if (!sel.length) return;
      const safe = this._safe(worldX, worldY, 30);
      sel.forEach((u, i) => {
        u.hasOrders    = true;
        u.orderType    = 'move_to_point';
        // Spread units out in a small circle so they don't all pile on one pixel
        const spread = Math.min(sel.length * 7, 70);
        const angle  = (i / Math.max(sel.length, 1)) * Math.PI * 2;
        u.orderTargetPoint = {
          x: safe.x + Math.cos(angle) * spread * 0.5,
          y: safe.y + Math.sin(angle) * spread * 0.5,
        };
        u.formationTimer = 120;
        u.reactionDelay  = Math.floor(Math.random() * 20) + 2;
      });
      this._audio('ui_click');
    },

    // ── 1-5 — group selection (mirrors battlefield_commands.js exactly) ───
    selectGroup(num) {
      if (!G.isBattle()) return;
      const all = G.playerUnits();
      const cmd = G.commander();

      // Second tap on same group → deselect all
      if (typeof window.currentSelectionGroup !== 'undefined' &&
          window.currentSelectionGroup === num) {
        window.currentSelectionGroup = null;
        all.forEach(u => {
          if (u.selected && u.hasOrders && u.orderType === 'follow' && cmd) {
            u.orderType    = 'hold_position';
            u.orderTargetPoint = {
              x: cmd.x + (u.formationOffsetX || 0),
              y: cmd.y + (u.formationOffsetY || 0),
            };
          }
          u.selected = false;
        });
        this._audio('ui_click');
        return;
      }

      window.currentSelectionGroup = num;
      all.forEach(u => {
        let willSel = false;
        const role    = (typeof getTacticalRole  === 'function') ? getTacticalRole(u)  : '';
        const mounted = (typeof isMountedOrBeast === 'function') ? isMountedOrBeast(u) : false;
        const canSel  = (typeof canSelectUnitNow === 'function') ? canSelectUnitNow(u) : true;

        if (num === 5)                                      willSel = true;
        else if (num === 1 && ['INFANTRY','SHIELD'].includes(role)) willSel = true;
        else if (num === 2 && role === 'RANGED')            willSel = true;
        else if (num === 3 && mounted)                      willSel = true;
        else if (num === 4 && role === 'GUNPOWDER')         willSel = true;

        if (willSel && !canSel) willSel = false;

        // Anchor previously-following units that are being deselected
        if (u.selected && !willSel && u.hasOrders && u.orderType === 'follow' && cmd) {
          u.orderType    = 'hold_position';
          u.orderTargetPoint = {
            x: cmd.x + (u.formationOffsetX || 0),
            y: cmd.y + (u.formationOffsetY || 0),
          };
        }
        u.selected = willSel;

        // Break lazy-charge on fresh selection
        if (u.selected && u.orderType === 'seek_engage') {
          u.hasOrders    = false;
          u.orderType    = null;
          u.orderTargetPoint = null;
          u.target       = null;
        }
      });

      this._stopLazy();
      this._audio('ui_click');
    },
  };

  // ==========================================================================
  //  SECTION 4 — KEY HELPER  (P for exit, WASD from joystick)
  // ==========================================================================
  function _fireKey(key, type) {
    const codeMap = {
      p:'KeyP', P:'KeyP',
      w:'KeyW', a:'KeyA', s:'KeyS', d:'KeyD',
    };
    D.dispatchEvent(new KeyboardEvent(type, {
      key,
      code:      codeMap[key] || 'Key' + key.toUpperCase(),
      bubbles:   true,
      cancelable: true,
      keyCode:   key.toUpperCase().charCodeAt(0),
      which:     key.toUpperCase().charCodeAt(0),
    }));
  }

  // ==========================================================================
  //  SECTION 5 — TOAST NOTIFICATION
  // ==========================================================================
  let _toastTimer = null;

  function _showToast(msg) {
    let t = D.getElementById('mc3-toast');
    if (!t) {
      t = D.createElement('div');
      t.id = 'mc3-toast';
      D.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
      t.classList.remove('show');
      _toastTimer = null;
    }, 3000);
  }

  // ==========================================================================
  //  SECTION 6 — DOM FACTORY
  // ==========================================================================
  let _openTray = null;

  function buildDOM() {
    let root = D.getElementById(ROOT);
    if (!root) {
      root = D.createElement('div');
      root.id = ROOT;
      D.body.appendChild(root);
    }

    // Toast lives on body so it's always above everything
    if (!D.getElementById('mc3-toast')) {
      const t = D.createElement('div');
      t.id = 'mc3-toast';
      D.body.appendChild(t);
    }

    // Backdrop — closes any open tray / popup on outside tap
    const bd = _mkEl('div', 'mc3-backdrop');
    root.appendChild(bd);
    bd.addEventListener('pointerdown', () => {
      _closeTray('cmd');
      _closeTray('form');
      UnitCards.closePopup();
      Help.close();
      bd.classList.remove('act');
    });

// Survivor HUD
    const survHud = _mkEl('div', 'mc3-survivor-hud');
    survHud.innerHTML = `
      <div class="mc3-surv-row mc3-surv-ally">🙂 <span id="mc3-ally-count">0</span></div>
      <div class="mc3-surv-row mc3-surv-foe">😠 <span id="mc3-foe-count">0</span></div>
    `;
    root.appendChild(survHud);
	
    // Header bar (P, groups 1-5, FORM, CMD, ?)
    root.appendChild(_buildHeader());

    // Virtual joystick
    const joy = _mkEl('div', 'mc3-joy');
    joy.innerHTML = '<div id="mc3-joy-ring"></div><div id="mc3-joy-knob"></div>';
    root.appendChild(joy);

    // HUD wrapper (stack toggle + scrollable card row)
    root.appendChild(_buildHUDWrapper());

    // Stats popup
    root.appendChild(_buildPopup());

    // Help overlay
    root.appendChild(_buildHelpOverlay());

    // Box-selection rectangle (canvas overlay)
    const sb = _mkEl('div', 'mc3-selbox');
    root.appendChild(sb);

    // Drag-ghost card (floating card that follows the dragging finger)
    const dg = _mkEl('div', 'mc3-drag-card');
    dg.id = 'mc3-drag-card';
    root.appendChild(dg);
  }

  function _mkEl(tag, id, cls) {
    const e = D.createElement(tag);
    if (id)  e.id        = id;
    if (cls) e.className = cls;
    return e;
  }

  // ── Touch-reliable button ──────────────────────────────────────────────────
  // Uses a 200 ms Date.now() debounce to prevent double-fire from the
  // overlapping touchstart + pointerdown events that iOS / Android emit.
  // The "pressed" class is applied briefly for immediate visual feedback.
  function _mkBtn(html, id, extraCls, cb) {
    const b = D.createElement('button');
    if (id) b.id = id;
    b.setAttribute('type', 'button');
    b.className = 'mc3-btn' + (extraCls ? ' ' + extraCls : '');
    b.innerHTML = html;

    let _lastFire = 0;
    const fire = ev => {
      const now = Date.now();
      if (now - _lastFire < 200) return;   // deduplicate concurrent events
      _lastFire = now;
      ev.preventDefault();
      ev.stopPropagation();
      b.classList.add('pressed');
      setTimeout(() => b.classList.remove('pressed'), 130);
      cb();
    };

    // Use both events: touchstart fires immediately on iOS; pointerdown is
    // the fallback for pointer-only environments (desktop testing).
    b.addEventListener('touchstart', fire, { passive: false });
    b.addEventListener('pointerdown', fire);
    return b;
  }

  // ── Header bar ─────────────────────────────────────────────────────────────
function _buildHeader() {
    const bar = _mkEl('div', 'mc3-hbar');
    const row = _mkEl('div', 'mc3-hrow');

    // 1) P — always visible
    row.appendChild(_mkBtn('↩️', 'mc3-pbtn', '', () => Cmd.exit()));

    // 2) Help
    row.appendChild(_mkBtn(
      '<span class="ticon" style="font-size: clamp(1.4rem, 4.5vw, 1.8rem); line-height: 1; margin: 0;">❓</span>',
      'mc3-help-btn', 'mc3-toggle-btn',
      () => Help.toggle()
    ));

  

    // 5) Commands
    row.appendChild(_mkBtn(
      '<span class="ticon" style="font-size: clamp(1.4rem, 4.5vw, 1.8rem); line-height: 1; margin: 0;">🥁️</span>',
      'mc3-cmd-toggle', 'mc3-toggle-btn',
      () => _toggleTray('cmd')
    ));

    // 6) Formations
    row.appendChild(_mkBtn(
      '<span class="ticon" style="font-size: clamp(1.4rem, 4.5vw, 1.8rem); line-height: 1; margin: 0;">🚩️</span>',
      'mc3-form-toggle', 'mc3-toggle-btn',
      () => _toggleTray('form')
    ));

    // 7) Group 5
    row.appendChild(_mkBtn(
      `<span style="font-size: clamp(1.1rem, 3.8vw, 1.5rem); line-height: 1;">👥</span>`,
      'mc3-g5',
      'mc3-gbtn',
      () => Cmd.selectGroup(5)
    ));

    // 8–11) Groups 1–4
    const gIcons = ['🪓', '🏹', '🐎', '🔥'];
    for (let i = 1; i <= 4; i++) {
      row.appendChild(_mkBtn(
        `<span style="font-size: clamp(1.1rem, 3.8vw, 1.5rem); line-height: 1;">${gIcons[i - 1]}</span>`,
        `mc3-g${i}`,
        'mc3-gbtn',
        () => Cmd.selectGroup(i)
      ));
    }

    // 12) Stack-mode toggle button
    row.appendChild(_mkBtn(
      '<span class="ticon" style="font-size: clamp(1.4rem, 4.5vw, 1.8rem); line-height: 1; margin: 0;">🪪</span>',
      'mc3-stack-btn', 'mc3-toggle-btn',
      () => UnitCards.cycleStackMode()
    ));

    bar.appendChild(row);

    // ── CMD tray ─────────────────────────────────────────────────────────
    const ct = _mkEl('div', 'mc3-cmd-tray', 'mc3-tray');
    [
      { icon: '⚔️', lbl: 'CHARGE',  fn: () => Cmd.charge()  },
      { icon: '⛔',  lbl: 'STOP',    fn: () => Cmd.stop()    },
      { icon: '🏳️', lbl: 'RETREAT', fn: () => Cmd.retreat() },
      { icon: '👫',  lbl: 'FOLLOW',  fn: () => Cmd.follow()  },
    ].forEach(c => {
      ct.appendChild(_mkBtn(
        `<span class="ticon">${c.icon}</span><span class="tlbl">${c.lbl}</span>`,
        null, 'mc3-tray-btn', c.fn
      ));
    });
    bar.appendChild(ct);

    // ── Formation tray ───────────────────────────────────────────────────
    const ft = _mkEl('div', 'mc3-form-tray', 'mc3-tray');
    [
      { icon: '🛡️', lbl: 'SHIELD',   style: 'tight' },
      { icon: '═',   lbl: 'STANDARD', style: 'standard' },
      { icon: '➖',   lbl: 'LINE',     style: 'line' },
      { icon: '⭕',   lbl: 'CIRCLE',   style: 'circle' },
      { icon: '🔲',   lbl: 'BOX',      style: 'square' },
    ].forEach(f => {
      ft.appendChild(_mkBtn(
        `<span class="ticon">${f.icon}</span><span class="tlbl">${f.lbl}</span>`,
        null, 'mc3-tray-btn', () => Cmd.formation(f.style)
      ));
    });
    bar.appendChild(ft);

    return bar;
}
// ── HUD wrapper (card row) ──────────────────────────────────
  function _buildHUDWrapper() {
    const wrap = _mkEl('div', 'mc3-hud-wrap');

    const hud = _mkEl('div', 'mc3-hud');
    wrap.appendChild(hud);

    return wrap;
  }

  // ── Stats popup ─────────────────────────────────────────────────────────────
  function _buildPopup() {
    const p = _mkEl('div', 'mc3-popup');

    // Close button
    const closeBtn = D.createElement('button');
    closeBtn.id = 'mc3-pop-close';
    closeBtn.setAttribute('type', 'button');
    closeBtn.setAttribute('aria-label', 'Close stats');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('pointerdown', ev => {
      ev.stopPropagation();
      UnitCards.closePopup();
    });

    const title    = _mkEl('div', 'mc3-pop-title');
    title.textContent = 'Unit';

    const subtitle = _mkEl('div', 'mc3-pop-subtitle');
    subtitle.id = 'mc3-pop-subtitle';

    // Scrollable inner region
    const inner = _mkEl('div', 'mc3-popup-inner');
    inner.id = 'mc3-popup-inner';

    const grid = D.createElement('div');
    grid.className = 'mc3-sgrid';
    grid.id        = 'mc3-sgrid';

    // Experience bar
    const expTrack = _mkEl('div', 'mc3-exp-track');
    const expFill  = _mkEl('div', 'mc3-exp-fill');
    expFill.id = 'mc3-exp-fill';
    expFill.style.width = '0%';
    expTrack.appendChild(expFill);

    const expLbl = _mkEl('div', 'mc3-exp-lbl');
    expLbl.id = 'mc3-exp-lbl';
    expLbl.textContent = 'Level –';

    // Ammo bar
    const ammoTrack = _mkEl('div', 'mc3-ammo-track');
    const ammoFill  = _mkEl('div', 'mc3-ammo-fill');
    ammoFill.id = 'mc3-ammo-fill';
    ammoFill.style.width = '0%';
    ammoTrack.appendChild(ammoFill);

    const ammoLbl = _mkEl('div', 'mc3-ammo-lbl');
    ammoLbl.id = 'mc3-ammo-lbl';
    ammoLbl.textContent = '';

    inner.appendChild(grid);
    inner.appendChild(expTrack);
    inner.appendChild(expLbl);
    inner.appendChild(ammoTrack);
    inner.appendChild(ammoLbl);

    p.appendChild(closeBtn);
    p.appendChild(title);
    p.appendChild(subtitle);
    p.appendChild(inner);
    return p;
  }

  // ── Help overlay ─────────────────────────────────────────────────────────────
  function _buildHelpOverlay() {
    const overlay = _mkEl('div', 'mc3-help-overlay');

    // Header
    const header  = _mkEl('div', 'mc3-help-header');
    const titleEl = _mkEl('div', 'mc3-help-title');
    titleEl.textContent = '⚔ Battle Help';
    const closeBtn = D.createElement('button');
    closeBtn.id = 'mc3-help-close';
    closeBtn.setAttribute('type', 'button');
    closeBtn.setAttribute('aria-label', 'Close help');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('pointerdown', ev => {
      ev.stopPropagation();
      Help.close();
    });
    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    // Scrollable body
    const body = _mkEl('div', 'mc3-help-body');

    const sections = [
      {
        heading: 'Header Buttons',
        rows: [
          ['↩️',           'Exit the battle when possible, or leave a city.'],
          ['1  ⚔️',       'Select all infantry.'],
          ['2  🏹',       'Select all ranged non-gunpowder units.'],
          ['3  🐎',       'Select all cavalry and beasts.'],
          ['4  🔥',       'Select all gunpowder and artillery units.'],
          ['5  👥',     'Select every controllable unit.'],
		  ['🏯 / ⚓', 'AI mode for Siege and Naval battles.'],
 		  ['🤖 / 🛑', 'AI toggle for Land battles.'],
       
          ['🚩',       'Open the Formations tray. Requires 2 or more units selected.'],
          ['🥁',      'Open the Commands tray.'],
          ['🪪', 'Cycle through the three unit-card display modes. See Unit Cards section below.'],
          ['?',           'Toggle this help screen. The game is NOT paused.'],
        ],
      },
      {
        heading: 'Formations Tray',
        rows: [
          ['SHIELD',  'Tight defensive wall — shields and infantry packed close. Best with heavy-armour front line.'],
          ['STANDARD',     'Standard balanced formation — roles separated into sensible positions.'],
          ['LINE',    'Long battle line — maximises the frontage to prevent flanking.'],
          ['CIRCLE',  'Circular orb formation — all-round defence in open terrain.'],
          ['BOX',     'Square blob — spread, all-round coverage with room for cavalry inside.'],
        ],
      },
      {
        heading: 'Commands Tray',
        rows: [
          ['CHARGE',  'Selected units seek and engage the nearest enemy until ordered otherwise.'],
          ['STOP',    'Selected units immediately stop and defend their current position.'],
          ['RETREAT', 'Selected units fall back to the south edge of the battlefield.'],
          ['FOLLOW',  'Selected units follow the commander and re-form in the last used formation.'],
        ],
      },
      {
        heading: '🕹️ Joystick (bottom-left)',
        rows: [
          ['Drag',    'Pan the camera or move the commander. Equivalent to keyboard WASD.'],
        ],
      },
{
       heading: '👆 Touch Gestures (on the map)',
rows: [
  ['Single tap/click',   'Select a unit.'],
  ['Hold + drag',  'If units are selected, a blue move box appears and moves them to that box.'],
  ['Hold + drag',  'If no unit is selected, a yellow box appears for box-selecting units on the map.'],
  ['Pinch in/out', 'Zoom the battle camera. Works on any part of the map.'],

        ],
      },
      {
        heading: '🪪 Unit Cards (bottom row)',
        rows: [
          ['Tap card',          'Select that unit (all others are deselected).'],
          ['Long-hold card',    'Open the detailed stats popup for that unit, cannot read stacks.'],
        
          ['🪪EACH mode',       'Every unit shown as its own separate card — the classic view.'],
          ['🪪NAME mode',       'Cards with the same unit name are grouped into a visually-stacked pile (cards offset by 2% each). Shows a count badge. Tapping the pile selects all units in it.'],
          ['🪪TYPE mode',       'Same as NAME mode but grouped by tactical category: Infantry, Ranged, Cavalry, Gunpowder, Shield.'],
         
        ],
      },
      {
        heading: '📊 Stats',
        rows: [
          ['HP Bar',        'Current total health out of maximum. Colour shifts green → orange → red as damage accumulates.'],

          ['Morale Bar',    'Current morale. Low morale causes units to rout and flee.'],
	    	 ['Ammo',      'Remaining ammunition for ranged units.'],
          ['Attack',    'Melee attack power.'],
          ['Defense',   'Melee defence value.'],
          ['Armor',     'Damage reduction from armour.'],
          ['Speed',     'Movement speed on the battlefield.'],
          ['Range',     'Maximum attack range (ranged units only).'],
          ['Level',     'Experience level'],
          ['Total XP',  'Accumulated experience points'],
        ],
      },
    ];

    sections.forEach(sec => {
      const secEl = _mkEl('div', null, 'mc3-help-section');
      const h     = _mkEl('div', null, 'mc3-help-h');
      h.textContent = sec.heading;
      secEl.appendChild(h);
      sec.rows.forEach(([key, desc]) => {
        const rowEl  = _mkEl('div', null, 'mc3-help-row');
        const keyEl  = _mkEl('span', null, 'mc3-help-key');
        keyEl.textContent  = key;
        const descEl = _mkEl('span', null, 'mc3-help-desc');
        descEl.textContent = desc;
        rowEl.appendChild(keyEl);
        rowEl.appendChild(descEl);
        secEl.appendChild(rowEl);
      });
      body.appendChild(secEl);
    });

    overlay.appendChild(header);
    overlay.appendChild(body);
    return overlay;
  }

  // ── Tray helpers ──────────────────────────────────────────────────────────
  function _toggleTray(name) {
    const ct   = D.getElementById('mc3-cmd-tray');
    const ft   = D.getElementById('mc3-form-tray');
    const bd   = D.getElementById('mc3-backdrop');
    const tray = (name === 'cmd') ? ct : ft;
    const was  = tray.classList.contains('open');

    ct.classList.remove('open');
    ft.classList.remove('open');
    D.getElementById('mc3-cmd-toggle')?.classList.remove('tray-open');
    D.getElementById('mc3-form-toggle')?.classList.remove('tray-open');

    if (!was) {
      tray.classList.add('open');
      D.getElementById(name === 'cmd' ? 'mc3-cmd-toggle' : 'mc3-form-toggle')
        ?.classList.add('tray-open');
      bd.classList.add('act');
      _openTray = name;
    } else {
      if (!Help._open) bd.classList.remove('act');
      _openTray = null;
    }
  }

  function _closeTray(name) {
    D.getElementById(name === 'cmd' ? 'mc3-cmd-tray' : 'mc3-form-tray')
      ?.classList.remove('open');
    D.getElementById(name === 'cmd' ? 'mc3-cmd-toggle' : 'mc3-form-toggle')
      ?.classList.remove('tray-open');
    if (_openTray === name) _openTray = null;
  }

  // ==========================================================================
  //  SECTION 7 — HELP OVERLAY CONTROLLER
  // ==========================================================================
  const Help = {
    _open: false,
    toggle() { this._open ? this.close() : this.open(); },
    open() {
      this._open = true;
      D.getElementById('mc3-help-overlay')?.classList.add('vis');
      D.getElementById('mc3-backdrop')?.classList.add('act');
      D.getElementById('mc3-help-btn')?.classList.add('tray-open');
    },
    close() {
      this._open = false;
      D.getElementById('mc3-help-overlay')?.classList.remove('vis');
      D.getElementById('mc3-help-btn')?.classList.remove('tray-open');
      if (!_openTray) D.getElementById('mc3-backdrop')?.classList.remove('act');
    },
  };

  // ==========================================================================
  //  SECTION 8 — VIRTUAL JOYSTICK
  // ==========================================================================
  const Joystick = {
    active: false,
    tid: null,
    ox: 0, oy: 0, cx: 0, cy: 0, r: 0,
    keys: new Set(),
    DEAD: 0.22,

    mount() {
      const z = D.getElementById('mc3-joy');
      if (!z) return;
      z.addEventListener('touchstart',  e => this._start(e), { passive: false });
      z.addEventListener('touchmove',   e => this._move(e),  { passive: false });
      z.addEventListener('touchend',    e => this._end(e),   { passive: false });
      z.addEventListener('touchcancel', e => this._end(e),   { passive: false });
      this._loop();
    },

    _loop() { requestAnimationFrame(() => { this._tick(); this._loop(); }); },

    _start(e) {
      e.preventDefault();
      if (this.active) return;
      const t    = e.changedTouches[0];
      const rect = D.getElementById('mc3-joy').getBoundingClientRect();
      this.r  = rect.width / 2;
      this.ox = rect.left + this.r;
      this.oy = rect.top  + this.r;
      this.cx = t.clientX;
      this.cy = t.clientY;
      this.active = true;
      this.tid    = t.identifier;
      D.getElementById('mc3-joy').classList.add('active');
    },

    _move(e) {
      e.preventDefault();
      if (!this.active) return;
      for (const t of e.changedTouches) {
        if (t.identifier === this.tid) {
          this.cx = t.clientX;
          this.cy = t.clientY;
        }
      }
    },

    _end(e) {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this.tid) {
          this.active = false;
          this.tid    = null;
          D.getElementById('mc3-joy')?.classList.remove('active');
          this._releaseAll();
        }
      }
    },

_tick() {
      const knob = D.getElementById('mc3-joy-knob');
      const survHud = D.getElementById('mc3-survivor-hud'); // Get the HUD
      const inBattle = G.isBattle(); // Check if we are in battle

      // 1. Manage HUD Visibility (Only show in battle)
      if (survHud) {
        survHud.style.display = inBattle ? 'flex' : 'none';
      }

      // 2. SURVIVOR MATH (Only run if in battle)
      if (inBattle) {
        const env = G.env();
        if (env && env.units) {
 let allies = 1;
let foes = window.__IS_CUSTOM_BATTLE__ ? 1 : 0;
          for (let i = 0; i < env.units.length; i++) {
            let u = env.units[i];
            if (u.hp > 0 && !u.isCommander) {
              if (u.side === 'player') allies++;
              else if (u.side === 'enemy') foes++;
            }
          }
          const allyEl = D.getElementById('mc3-ally-count');
          const foeEl = D.getElementById('mc3-foe-count');
          if (allyEl) allyEl.textContent = allies;
          if (foeEl) foeEl.textContent = foes;
        }
      }

      // --- YOUR ORIGINAL JOYSTICK CODE BELOW ---
      if (!knob) return;
      if (!this.active) {
        knob.style.top  = '50%';
        knob.style.left = '50%';
        return;
      }
      const dx = this.cx - this.ox;
      const dy = this.cy - this.oy;
      const d  = Math.hypot(dx, dy);
      const r  = this.r;
      const cl = Math.min(d, r * 0.76);
      const a  = Math.atan2(dy, dx);

      knob.style.left = (50 + (cl * Math.cos(a)) / (r * 2) * 100).toFixed(2) + '%';
      knob.style.top  = (50 + (cl * Math.sin(a)) / (r * 2) * 100).toFixed(2) + '%';

      if (d / r < this.DEAD) { this._releaseAll(); return; }

      const deg = (a * 180 / Math.PI + 360) % 360;
      this._sync('w', deg >= 202.5 && deg <= 337.5);  // north
      this._sync('s', deg >= 22.5  && deg <= 157.5);  // south
      this._sync('a', deg >= 112.5 && deg <= 247.5);  // west
      this._sync('d', deg <= 67.5  || deg >= 292.5);  // east
    },

    _sync(k, want) {
      if (want && !this.keys.has(k))  { _fireKey(k, 'keydown'); this.keys.add(k); }
      if (!want && this.keys.has(k))  { _fireKey(k, 'keyup');   this.keys.delete(k); }
    },

    _releaseAll() { this.keys.forEach(k => _fireKey(k, 'keyup')); this.keys.clear(); },

    setVisible(v) {
      const z = D.getElementById('mc3-joy');
      if (z) z.style.display = v ? '' : 'none';
    },
  };

  // ==========================================================================
  //  SECTION 9 — UNIT CARD HUD
  //  Three stack modes, combined stats popup, drag-to-reorder
  // ==========================================================================
  const UnitCards = {
    // 0 = individual  1 = stack-by-name  2 = stack-by-category
    _stackMode:   1,
    _stackLabels: ['🪪', '🪪', '🪪'],

	_cards:     {},    // uid → DOM element (individual mode only)
    _snap:      '',    // last serialised state for dirty-checking
    _popTgt:    null,  // unit or array currently shown in popup
    _portraitCache: {},// visType+color -> base64 Image URL (Lag Fix)
    // Drag-to-reorder state (mode 0 only)
    _cardOrder: [],    // persistent ordering of uids
    _drag: {
      active:  false,
      uid:     null,
      ghostEl: null,
    },

// ── Dynamic Canvas Rendering & Caching (Lag Prevention) ─────────────
    _getCachedPortrait(u) {
      const unitKey = u.unitType || u.stats?.name || "Militia";
      const role = String(u.stats?.role || '').toUpperCase();
      const color = u.color || "#ffffff";
      const side = u.side || "player";
      
      // PRESERVE COMMANDER STATUS
      const isCommander = Boolean(u.isCommander || ["PLAYER", "Commander", "General"].includes(unitKey));
      
      let visType = "peasant";
      if (role === 'CAVALRY' || role === 'MOUNTED_GUNNER') {
        visType = unitKey === "War Elephant" ? "elephant" : (unitKey.includes("Camel") ? "camel" : "cavalry");
      } else if (role === 'HORSE_ARCHER') visType = "horse_archer";
      else if (role === 'PIKE' || unitKey.includes("Glaive")) visType = "spearman";
      else if (role === 'SHIELD') visType = "sword_shield";
      else if (role === 'TWO_HANDED') visType = "two_handed";
      else if (role === 'CROSSBOW') visType = "crossbow";
      else if (role === 'FIRELANCE') visType = "firelance";
      else if (role === 'ARCHER') visType = "archer";
      else if (role === 'THROWING') visType = "throwing";
      else if (role === 'GUNNER') visType = "gun";
      else if (role === 'BOMB') visType = "bomb";
      else if (role === 'ROCKET') visType = "rocket";

      // FIX 1: Make the cache key highly specific to prevent collisions
      const cacheKey = `${visType}_${unitKey}_${isCommander}_${color}_${side}`;
      if (this._portraitCache[cacheKey]) return this._portraitCache[cacheKey];

      // Draw onto a hidden canvas
      const canvas = D.createElement("canvas");
      canvas.width = 70;
      canvas.height = 70;
      const ctx = canvas.getContext("2d");
      ctx.translate(35, 55);

      // FIX 2: Pass isCommander into the dummy unit so the cav/inf scripts read it correctly
      const dummyUnit = { 
          id: 1, 
          stats: { ammo: 10 }, 
          ammo: 10, 
          state: "idle",
          isCommander: isCommander // Crucial for cavscript.js armor checks
      };

      if (["cavalry", "elephant", "camel", "horse_archer"].includes(visType)) {
        if (typeof drawCavalryUnit === 'function') {
          drawCavalryUnit(ctx, 0, 0, false, 10, color, false, visType, side, unitKey, false, 0, 10, dummyUnit, 0);
        }
      } else {
        if (typeof drawInfantryUnit === 'function') {
          drawInfantryUnit(ctx, 0, 0, false, 10, color, visType, false, side, unitKey, false, 0, 10, dummyUnit, 0);
        }
      }

      // Convert to image string and cache
      const dataUrl = canvas.toDataURL();
      this._portraitCache[cacheKey] = dataUrl;
      return dataUrl;
    },
    // ── Emoji helper ─────────────────────────────────────────────────────
    _emoji(u) {
      const s = (
        (u.stats?.role || '') + ' ' +
        (u.unitType    || '') + ' ' +
        (u.stats?.name || '')
      ).toLowerCase();
      if (s.match(/(cav|horse|lancer|mount|keshig)/)) 
		  return '🏇';
	  if (s.match(/eleph/)) 
			return '🐘';
      if (s.match(/(bomb|artill|trebuch)/))                  
		  return '💣';
      if (s.match(/(ship|naval|galley)/))                           
		  return '⛵';
      if (s.match(/(archer|bow|crossbow)/))                         
		  return '🏹';
      if (s.match(/(hand|rocket|firelance)/))           
		  return '🔥';
	  if (s.match(/camel/)) 
			return '🐫';

	  if (s.match(/(pike|spear|glaive)/))                                  return '🔱';
      if (s.match(/(slinger|javelinier)/))                              return '🤾‍♀️';
      if (s.match(/(shield)/))                                  
		  return '🛡️';
      if (s.match(/(militia|peasant)/))                             
		  return '🪓';
      if (s.match(/(general|command|player)/))                             return '⭐';
      return '⚔️';
    },

_clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },

    // Identifies ANY commander-type unit
    _isGen(u) {
      return Boolean(u.isCommander || ['commander', 'general', 'player', 'captain'].includes((String(u.unitType) || '').toLowerCase()));
    },

    // Tactical category — mirrors getTacticalRole in battlefield_commands.js
    _category(u) {
      if (this._isGen(u)) return 'GENERAL'; // Forces it into the General category stack
      if (typeof getTacticalRole === 'function') return getTacticalRole(u);
      const r = String(u.stats?.role || '').toUpperCase();
      const t = (
        (u.stats?.name || '') + ' ' +
        (u.unitType    || '') + ' ' +
        (u.stats?.role || '')
      ).toLowerCase();
      if (['CAVALRY','HORSE_ARCHER','MOUNTED_GUNNER','CAMEL','ELEPHANT'].includes(r) ||
          t.match(/(cav|horse|mount|camel|lancer|eleph|keshig)/)) return 'CAVALRY';
      if (['BOMB','ROCKET','FIRELANCE','GUNNER'].includes(r) ||
          t.match(/(bomb|rocket|fire|cannon|gun)/))               return 'GUNPOWDER';
      if (['ARCHER','CROSSBOW','THROWING'].includes(r) ||
          t.match(/(archer|bow|crossbow|sling|javelin)/))         return 'RANGED';
      if (r === 'SHIELD' || t.match(/(shield)/))                  return 'SHIELD';
      return 'INFANTRY';
    },

// Canonical display name used as the stack key in mode 1
    _stackName(u) {
      if (this._isGen(u)) return 'GENERAL'; // Forces duplicates to stack together
      return (u.stats?.name || u.unitType || 'Unit').toUpperCase().trim();
    },

cycleStackMode() {
      this._stackMode = (this._stackMode + 1) % 3;
      const btn = D.getElementById('mc3-stack-btn');
      if (btn) {
        btn.innerHTML = `<span class="ticon" style="font-size: clamp(1.4rem, 4.5vw, 1.8rem); line-height: 1; margin: 0;">${this._stackLabels[this._stackMode]}</span>`;
      }
      this._snap = '';   // force full DOM rebuild
      this.update();
    },
	
_lastUpdate: 0, // <--- ADD THIS PROPERTY to Uni
// ── Main update (called every RAF tick while in battle) ───────────────
    update() {
      const hud = D.getElementById('mc3-hud');
      if (!hud) return;
      
	  // --- ADD THESE 3 LINES: UI Throttling ---
      const now = Date.now();
      if (now - this._lastUpdate < 350) return; 
      this._lastUpdate = now;
      // ----------------------------------------
	  
      // DEDUPLICATE: Only allow ONE General/Commander card to exist in the UI
      let foundGen = false;
      const units = G.allPlayerUnits().filter(u => {
        if (this._isGen(u)) {
          if (foundGen) return false; // Destroy duplicates
          foundGen = true;
          return true;
        }
        return true;
      });

let snap = this._stackMode + '|';
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
snap += u.id + ',' + u.hp + ',' + u.selected + '|';
      }
      if (snap === this._snap) return;
      this._snap = snap;

      if (this._stackMode === 0)      this._updateIndividual(hud, units);
      else if (this._stackMode === 1) this._updateStackedByName(hud, units);
      else                            this._updateStackedByCategory(hud, units);
    },

_updateIndividual(hud, units) {
  hud.innerHTML = '';
  this._cards = {};

  const getOrder = (u) => {
    const uid = String(u.id ?? u.unitType);
    const idx = this._cardOrder.indexOf(uid);
    return idx === -1 ? 999999 : idx;
  };

  const sortedUnits = [...units].sort((a, b) => {
    // 1. Force General to the absolute LAST
    const isGenA = a.isGeneral || a.unitType === 'GENERAL';
    const isGenB = b.isGeneral || b.unitType === 'GENERAL';
    if (isGenA !== isGenB) return isGenA ? 1 : -1;

    // 2. Drag order
    const oA = getOrder(a);
    const oB = getOrder(b);
    if (oA !== oB) return oA - oB;

    // 3. Emoji fallback
    const emojiA = this._emoji(a);
    const emojiB = this._emoji(b);
    if (emojiA !== emojiB) return emojiA.localeCompare(emojiB);

    // 4. Name fallback
    const nameA = (a.stats?.name || a.unitType || 'Unit').toUpperCase();
    const nameB = (b.stats?.name || b.unitType || 'Unit').toUpperCase();
    return nameA.localeCompare(nameB);
  });

  this._cardOrder = sortedUnits.map(u => String(u.id ?? u.unitType));

  sortedUnits.forEach((u) => {
    const uid = String(u.id ?? u.unitType);
    const card = this._buildCard(u, uid, [u]);
    this._cards[uid] = card;
    if (this._drag.active && this._drag.uid === uid) card.classList.add('drag-ghost');
    this._refreshCard(card, u, [u]);
    hud.appendChild(card);
  });
},

_updateStackedByName(hud, units) {
  hud.innerHTML = '';
  this._cards = {};

  if (!this._nameOrder) this._nameOrder = [];
  const groups = {};
  units.forEach(u => {
    const name = this._stackName(u);
    if (!groups[name]) groups[name] = [];
    groups[name].push(u);
    if (!this._nameOrder.includes(name)) this._nameOrder.push(name);
  });

  this._nameOrder = this._nameOrder.filter(k => groups[k]);

  // Sort groups: General last
  this._nameOrder.sort((a, b) => {
    const hasGenA = groups[a].some(u => u.isGeneral || u.unitType === 'GENERAL');
    const hasGenB = groups[b].some(u => u.isGeneral || u.unitType === 'GENERAL');
    if (hasGenA !== hasGenB) return hasGenA ? 1 : -1;
    return 0;
  });

  this._nameOrder.forEach(name => {
    const wrap = this._buildStackedGroup(groups[name], name);
    wrap.dataset.uid = name;
    this._cards[name] = wrap;
    hud.appendChild(wrap);
  });
},
	_updateStackedByCategory(hud, units) {
  hud.innerHTML = '';
  this._cards = {};

  // Move GENERAL to the end of the predefined list
  if (!this._typeOrder) {
    this._typeOrder = ['SHIELD', 'INFANTRY', 'RANGED', 'GUNPOWDER', 'CAVALRY', 'GENERAL'];
  }

  const groups = {};
  units.forEach(u => {
    const cat = this._category(u);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(u);
    if (!this._typeOrder.includes(cat)) this._typeOrder.push(cat);
  });

  this._typeOrder = this._typeOrder.filter(k => groups[k]);

  this._typeOrder.forEach(cat => {
    const wrap = this._buildStackedGroup(groups[cat], cat);
    wrap.dataset.uid = cat;
    this._cards[cat] = wrap;
    wrap.classList.toggle('drag-ghost', this._drag.active && this._drag.uid === cat);
    hud.appendChild(wrap);
  });
},
	
_buildStackedGroup(grpUnits, label) {
      const cardW     = this._clamp(W.innerWidth * 0.095, 48, 64);
      const offsetPx  = 4; // Fixed pixel offset for Y stacking
      const count     = grpUnits.length;

      const wrap = D.createElement('div');
      wrap.className    = 'mc3-stack-wrap';
      wrap.style.width  = cardW + 'px'; // NO X-OFFSET
      wrap.style.flexShrink = '0';
      wrap.style.position   = 'relative';
      wrap.style.cursor     = 'pointer';

      // Render back-cards first (further from viewer), front card last
      grpUnits.forEach((unit, i) => {
        const isFront = (i === count - 1);
        const card    = this._buildCard(
          unit,
          String(unit.id ?? unit.unitType ?? i),
          grpUnits
        );

        // Cap the visual offset at max 4 layers (so 5 cards look visible max)
        const distFromFront = (count - 1) - i;
        const visualDist = Math.min(distFromFront, 4);

        if (isFront) {
          card.classList.add('stack-front');
          card.style.zIndex = String(count + 1);
        } else {
          card.classList.add('stack-back');
          card.style.top    = -(offsetPx * visualDist) + 'px'; // Stack UPWARDS
          card.style.left   = '0px'; // NO X OFFSET
          card.style.zIndex = String(i + 1);
        }
        this._refreshCard(card, unit, grpUnits);
        wrap.appendChild(card);
      });

if (count > 1) {
        const badge = D.createElement('div');
        badge.className   = 'mc3-stack-count';
        badge.textContent = String(count);
        badge.style.zIndex = '999'; // <--- THE FIX: Forces badge above front card
        wrap.appendChild(badge);
      }

      return wrap;
    },

    // ── Build a single card DOM element ──────────────────────────────────
    _buildCard(unit, uid, grpUnits) {
      const card = D.createElement('div');
      card.className   = 'mc3-card';
      card.dataset.uid = uid;

const port  = D.createElement('div');
      port.className  = 'mc3-portrait';
      
      // Always use emojis to save memory and avoid LOD conflicts
      const emoji = D.createTextNode(this._emoji(unit));
      port.appendChild(emoji);

      const badge = D.createElement('span');
      badge.className = 'mc3-badge';
      port.appendChild(badge);
      card.appendChild(port);

// Name label
      const nm = D.createElement('div');
      nm.className = 'mc3-uname';
      
      // Override the text display to guarantee it says "GENERAL"
      const displayName = this._isGen(unit) ? 'GENERAL' : (unit.stats?.name || unit.unitType || 'Unit');
      if (this._stackMode !== 2) {
        nm.textContent = displayName.substring(0, 9).toUpperCase();
      }
      card.appendChild(nm);

      // HP bar
      const hpTrack = D.createElement('div');
      hpTrack.className = 'mc3-bar';
      const hpFill  = D.createElement('div');
      hpFill.className  = 'mc3-bfill hp';
      hpFill.dataset.bar = 'hp';
      hpTrack.appendChild(hpFill);
      card.appendChild(hpTrack);
 
// ── Touch event handlers ─────────────────────────────────────────
      const me = this;
      let _lpTimer   = null;
      let _didMove   = false;
      let _startX    = 0;
      let _startY    = 0;
      let _startTime = 0;

      card.addEventListener('touchstart', ev => {
        ev.stopPropagation();
        const t  = ev.changedTouches[0];
        _startX    = t.clientX;
        _startY    = t.clientY;
        _startTime = Date.now();
        _didMove   = false;
		_lpTimer = setTimeout(() => {
          _lpTimer = null;
          if (!_didMove) {
            if (me._stackMode === 0) {
              me.openPopup(grpUnits);
            } else if (me._stackMode === 1) {
              me.openPopup(grpUnits[0]); // Passes a single unit, bypassing the group average
            }
          }
        }, 420);
      }, { passive: true });

      card.addEventListener('touchmove', ev => {
        ev.stopPropagation();
        const t  = ev.changedTouches[0];
        const dx = t.clientX - _startX;
        const dy = t.clientY - _startY;
        if (Math.hypot(dx, dy) > 9) {
          _didMove = true;
          if (_lpTimer !== null) { clearTimeout(_lpTimer); _lpTimer = null; }
        }
        
        const wrap = card.closest('.mc3-stack-wrap');
        const dragUid = wrap ? wrap.dataset.uid : uid;
        
        if (me._drag.active && me._drag.uid === dragUid) {
          ev.preventDefault();
          me._onDragMove(t.clientX, t.clientY);
        }
      }, { passive: false });

      card.addEventListener('touchend', ev => {
        ev.stopPropagation();
        const t = ev.changedTouches[0];
        const wrap = card.closest('.mc3-stack-wrap');
        const dragUid = wrap ? wrap.dataset.uid : uid;
if (me._drag.active && me._drag.uid === dragUid) {
if (_didMove) {
            // They dragged, so drop it
            me._endDrag(t.clientX, t.clientY);
          } else {
            // Held but didn't drag, show popup instead
            me._cancelDrag();
            if (me._stackMode === 0) {
              me.openPopup(grpUnits);
            } else if (me._stackMode === 1) {
              me.openPopup(grpUnits[0]); // Passes a single unit, bypassing the group average
            }
          }
          return;
        }

        if (_lpTimer !== null) {
          clearTimeout(_lpTimer);
          _lpTimer = null;
          if (!_didMove) {
            me._selectGroup(grpUnits);
          }
        }
      }, { passive: true });

      card.addEventListener('touchcancel', () => {
        if (_lpTimer !== null) { clearTimeout(_lpTimer); _lpTimer = null; }
        if (me._drag.active) me._cancelDrag();
      }, { passive: true });

      return card;
    },

    // ── Select a group of units (deselect all others) ─────────────────────
    _selectGroup(grpUnits) {
      const all = G.allPlayerUnits();
      all.forEach(u => u.selected = false);
      grpUnits.forEach(u => u.selected = true);
      if (typeof AudioManager !== 'undefined') AudioManager.playSound?.('ui_click');
    },

   _refreshCard(card, unit, grpUnits) {
      // Exclude units at or below 0 HP from stats calculation
      const all = (grpUnits || [unit]).filter(u => (u.hp || 0) > 0);
      if (all.length === 0) {
        card.classList.add('dead');
        return;
      }

      const totalHp = all.reduce((s, u) => s + (u.hp ?? 0), 0);
      
      // Calculate averages using percentages to normalize varying max values
      const avgHpPct = all.reduce((s, u) => s + ((u.hp ?? 0) / (u.stats?.health ?? 100)), 0) / all.length;
	  
 
const isGen = (u) => u.isCommander || ['commander', 'general', 'player', 'captain'].includes((String(u.unitType) || '').toLowerCase());
      const hasLivingGen = all.some(isGen);
      
      // Select if player clicked OR if a living General is in this stack
      const anySel = all.some(u => u.selected) || hasLivingGen;

      card.classList.toggle('sel', anySel);
      card.classList.remove('dead');
	  
      const hpPct = this._clamp(avgHpPct * 100, 0, 100);
      const hpFill = card.querySelector('[data-bar="hp"]');
      if (hpFill) {
        hpFill.style.width = hpPct + '%';
        hpFill.style.background = hpPct > 60 ? '#4caf50' : hpPct > 30 ? '#ff9800' : '#f44336';
      }



      const badge = card.querySelector('.mc3-badge');
      if (badge) badge.textContent = Math.ceil(totalHp) + 'hp';

      if (this._popTgt) {
        const shown = Array.isArray(this._popTgt) ? this._popTgt : [this._popTgt];
        if (shown.some(su => all.includes(su))) {
          this.openPopup(this._popTgt);
        }
      }
    },
    // ── Stats popup — accepts single unit OR array ────────────────────────
    // Aggregates all stats across every unit in an array for stacked groups.
    openPopup(unitOrGroup) {
      const units  = Array.isArray(unitOrGroup) ? unitOrGroup : [unitOrGroup];
      this._popTgt = unitOrGroup;

      const pop = D.getElementById('mc3-popup');
      if (!pop) return;

      const isGroup = units.length > 1;
      const first   = units[0];

      // ── Title ──────────────────────────────────────────────────────────
      const titleEl = D.getElementById('mc3-pop-title');
      if (titleEl) {
        titleEl.textContent = isGroup
          ? (first.stats?.name || first.unitType || 'Unit').toUpperCase() + ' ×' + units.length
          : (first.stats?.name || first.unitType || 'Unit').toUpperCase();
      }
      const subEl = D.getElementById('mc3-pop-subtitle');
      if (subEl) {
        subEl.textContent = isGroup
          ? 'Combined stats — ' + units.length + ' units'
          : (first.stats?.role || first.unitType || '').toUpperCase().substring(0, 14);
      }

      // ── Aggregate stats ────────────────────────────────────────────────
      const totalHp    = units.reduce((s, u) => s + (u.hp ?? 0), 0);
      const totalMaxHp = units.reduce((s, u) => s + (u.stats?.health ?? 100), 0);

      // Ammo — check multiple possible field names
      const hasAmmo = units.some(u =>
        (u.stats?.ammo ?? u.stats?.arrows ?? u.stats?.ammunition) != null
      );
      const totalAmmo  = units.reduce((s, u) =>
        s + (u.stats?.ammo ?? u.stats?.arrows ?? u.stats?.ammunition ?? 0), 0);
      const maxAmmo    = units.reduce((s, u) =>
        s + (u.stats?.maxAmmo ?? u.stats?.maxArrows ?? u.stats?.startingAmmo ?? 0), 0);

      const avgMor  = units.reduce((s, u) => s + (u.stats?.morale ?? 0), 0) / units.length;
      const maxMor  = first.stats?.maxMorale ?? 20;
      const avgAtk  = units.reduce((s, u) => s + (u.stats?.meleeAttack  ?? u.stats?.attack  ?? 0), 0) / units.length;
      const avgDef  = units.reduce((s, u) => s + (u.stats?.meleeDefense ?? u.stats?.defense ?? 0), 0) / units.length;
      const avgArm  = units.reduce((s, u) => s + (u.stats?.armor  ?? 0), 0) / units.length;
      const avgSpd  = units.reduce((s, u) => s + (u.stats?.speed  ?? 0), 0) / units.length;
      const rng     = first.stats?.range ?? '—';
      const minLvl  = Math.min(...units.map(u => u.stats?.experienceLevel ?? u.stats?.level ?? 1));
	  	  
      const maxLvl = Math.max(...units.map(u => u.stats?.experienceLevel ?? u.stats?.level ?? 1));
      const totalXp = units.reduce((s, u) => s + (u.stats?.experience ?? u.stats?.xp ?? 0), 0);
      const rows = [
        ['HP',      `${Math.ceil(totalHp)} / ${totalMaxHp}`],
        ['Morale',  `${Math.floor(avgMor)} / ${maxMor}`],
        ['Attack',  Math.round(avgAtk)],
        ['Defense', Math.round(avgDef)],
        ['Armor',   Math.round(avgArm)],
        ['Speed',   Math.round(avgSpd)],
        ['Range',   rng]
      ];
      if (isGroup) rows.push(['Total XP', Math.round(totalXp)]);

      const grid = D.getElementById('mc3-sgrid');
      if (grid) {
        grid.innerHTML = '';
        rows.forEach(([l, v]) => {
          const row = D.createElement('div');
          row.className = 'mc3-srow';
          row.innerHTML = `<span class="sl">${l}</span><span class="sv">${v}</span>`;
          grid.appendChild(row);
        });
      }

      const lvlStr = minLvl === maxLvl ? `Level ${minLvl}` : `Levels ${minLvl}–${maxLvl}`;
      const expPct = this._clamp(((maxLvl - 1) / 4) * 100, 0, 100);
      
      const expFill = D.getElementById('mc3-exp-fill');
      const expLbl  = D.getElementById('mc3-exp-lbl');
      if (expFill) expFill.style.width = expPct + '%';
      if (expLbl) expLbl.textContent = lvlStr;

      const ammoWrap = D.getElementById('mc3-ammo-track');
      const ammoLbl  = D.getElementById('mc3-ammo-lbl');
      if (hasAmmo) {
        if (ammoWrap) ammoWrap.style.display = 'block';
        if (ammoLbl) {
          ammoLbl.style.display = 'block';
          ammoLbl.textContent = `Ammo: ${Math.floor(totalAmmo)} / ${maxAmmo}`;
        }
        const aFill = D.getElementById('mc3-ammo-fill');
        if (aFill) aFill.style.width = this._clamp((totalAmmo / Math.max(maxAmmo, 1)) * 100, 0, 100) + '%';
      } else {
        if (ammoWrap) ammoWrap.style.display = 'none';
        if (ammoLbl)  ammoLbl.style.display = 'none';
      }

      pop.classList.add('vis');
      D.getElementById('mc3-backdrop')?.classList.add('act');
    },

    closePopup() {
      this._popTgt = null;
      D.getElementById('mc3-popup')?.classList.remove('vis');
    },

    setVisible(v) {
      const h = D.getElementById('mc3-hud-wrap');
      if (h) h.style.display = v ? '' : 'none';
      if (!v) this.closePopup();
    },

  _startDrag(uid, ev) {
      this._drag.active = true;
      this._drag.uid    = uid;
      const ghost = D.getElementById('mc3-drag-card');
      const t = ev.changedTouches[0];
      if (ghost && this._cards[uid]) {
        ghost.innerHTML     = this._cards[uid].innerHTML;
        ghost.style.display = 'flex';
        
        // Strip the ghost wrapper's outer styles if we're dragging a stack
        if (this._stackMode !== 0) {
           ghost.style.background = 'transparent';
           ghost.style.border = 'none';
           ghost.style.boxShadow = 'none';
        } else {
           ghost.style.background = '';
           ghost.style.border = '';
           ghost.style.boxShadow = '';
        }
        
        ghost.style.left    = (t.clientX - 30) + 'px';
        ghost.style.top     = (t.clientY - 30) + 'px';
      }
      this._snap = ''; // Force update
      this.update();
    },

    _onDragMove(x, y) {
      const ghost = D.getElementById('mc3-drag-card');
      if (ghost) {
        ghost.style.left = (x - 30) + 'px';
        ghost.style.top  = (y - 30) + 'px';
      }
      // Look for the closest stack wrapper or valid card
      const over = D.elementFromPoint(x, y)?.closest('.mc3-stack-wrap, .mc3-card');
      Object.values(this._cards).forEach(c => c.classList.remove('drag-over'));
      if (over && over.dataset.uid !== this._drag.uid) {
        over.classList.add('drag-over');
      }
    },
	
_endDrag(x, y) {
      this._drag.active = false;
      const ghost = D.getElementById('mc3-drag-card');
      if (ghost) ghost.style.display = 'none';

      const overNode = D.elementFromPoint(x, y)?.closest('.mc3-card, .mc3-stack-wrap');
      const overUid = overNode ? overNode.dataset.uid : null;
      
      if (overUid && overUid !== this._drag.uid) {
        let arr;
        if (this._stackMode === 0) arr = this._cardOrder;
        else if (this._stackMode === 1) arr = this._nameOrder;
        else if (this._stackMode === 2) arr = this._typeOrder;
        
        if (arr) {
          const fromIdx = arr.indexOf(this._drag.uid);
          const toIdx   = arr.indexOf(overUid);
          if (fromIdx > -1 && toIdx > -1) {
            arr.splice(fromIdx, 1);
            arr.splice(toIdx, 0, this._drag.uid); // Swap immediately on release
          }
        }
      }
      Object.values(this._cards).forEach(c => c.classList.remove('drag-over', 'drag-ghost'));
      this._snap = ''; // Force update
      this.update();
    },
	}; // End of UnitCards object (This is the critical fix)
  // ==========================================================================
  //  SECTION 10 — GESTURE ENGINE (Canvas touch interactions)
  // ==========================================================================
  const Gestures = {
    _pts: {},
    _lp: null,
    _taps: [],
    _boxTimer: null,
    _boxActive: false,
    _boxStart: { x: 0, y: 0 },
    _ownIds: new Set([
      'mc3', 'mc3-hbar', 'mc3-hrow', 'mc3-cmd-tray', 'mc3-form-tray',
      'mc3-joy', 'mc3-hud-wrap', 'mc3-popup', 'mc3-backdrop', 'mc3-help-overlay'
    ]),

    mount() {
      const canvas = D.getElementById('gameCanvas') || D.body;
      canvas.addEventListener('touchstart',  e => this._start(e), { passive: false });
      canvas.addEventListener('touchmove',   e => this._move(e),  { passive: false });
      canvas.addEventListener('touchend',    e => this._end(e),   { passive: false });
      canvas.addEventListener('touchcancel', e => this._end(e),   { passive: false });
    },

    _onUI(t) {
      let n = D.elementFromPoint(t.clientX, t.clientY);
      while (n) {
        if (this._ownIds.has(n.id)) return true;
        n = n.parentElement;
      }
      return false;
    },

    _start(e) {
      for (const t of e.changedTouches) {
        if (!this._onUI(t)) {
          this._pts[t.identifier] = {
            x: t.clientX, y: t.clientY,
            sx: t.clientX, sy: t.clientY,
            t: Date.now()
          };
    if (Object.keys(this._pts).length === 1) {
            this._boxStart = { x: t.clientX, y: t.clientY };
            this._boxTimer = setTimeout(() => {
              this._boxActive = true;
              // Visual box display is now deferred to _move to prevent flashing
            }, 160);
          } else {
			  
            clearTimeout(this._boxTimer);
            this._boxActive = false;
            const box = D.getElementById('mc3-selbox');
            if (box) box.style.display = 'none';
          }
        }
      }
      this._lp = null;
    },

 _move(e) {
      let uiTouch = false;
      for (const t of e.changedTouches) {
        if (this._pts[t.identifier]) {
          this._pts[t.identifier].x = t.clientX;
          this._pts[t.identifier].y = t.clientY;
          uiTouch = true;
        }
      }
      if (!uiTouch) return;

      const ids = Object.keys(this._pts);

      if (ids.length === 1 && this._boxActive) {
        e.preventDefault();
        const pt = this._pts[ids[0]];
        const traveled = Math.hypot(pt.x - this._boxStart.x, pt.y - this._boxStart.y);
        
        if (traveled >= 14) {
          const box = D.getElementById('mc3-selbox');
          if (box) {
            const hasSel = G.selected().length > 0;
            // Apply Contextual Blue/Gold styling
            if (hasSel) {
                box.style.border = '2px dashed rgba(66, 135, 245, 0.82)';
                box.style.background = 'rgba(66, 135, 245, 0.15)';
                box.style.boxShadow = 'inset 0 0 10px rgba(66, 135, 245, 0.2)';
            } else {
                box.style.border = '2px dashed rgba(245,215,110,0.82)';
                box.style.background = 'rgba(245,215,110,0.06)';
                box.style.boxShadow = 'inset 0 0 10px rgba(245,215,110,0.08)';
            }
            
            box.style.left   = Math.min(this._boxStart.x, pt.x) + 'px';
            box.style.top    = Math.min(this._boxStart.y, pt.y) + 'px';
            box.style.width  = Math.abs(pt.x - this._boxStart.x) + 'px';
            box.style.height = Math.abs(pt.y - this._boxStart.y) + 'px';
            box.style.display = 'block';
          }
        }
      } else if (ids.length === 2) {
        // [Existing pinch-to-zoom logic remains unchanged]
        e.preventDefault();
        clearTimeout(this._boxTimer);
        this._boxActive = false;
        const box = D.getElementById('mc3-selbox');
        if (box) box.style.display = 'none';

        const [a, b] = ids.map(id => this._pts[id]);
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (this._lp !== null) {
          const delta = (this._lp - d) * 1.5;
          if (Math.abs(delta) > 0.8) {
            this._zoom((a.x + b.x) / 2, (a.y + b.y) / 2, delta);
          }
        }
        this._lp = d;
      }
    },

_end(e) {
      clearTimeout(this._boxTimer);

      for (const t of e.changedTouches) {
        const pt = this._pts[t.identifier];
        if (!pt) continue;

        const traveled = Math.hypot(t.clientX - pt.sx, t.clientY - pt.sy);
        const nPts     = Object.keys(this._pts).length;

        // Contextual Drag Box (Selection OR Move)
        if (this._boxActive && nPts === 1 && traveled >= 14) {
          this._applyBoxSelect(this._boxStart.x, this._boxStart.y, t.clientX, t.clientY);
        } 
        // Standard single tap (Select 1 / Deselect)
        else if (traveled < 14) {
          this._tap(t.clientX, t.clientY);
        }
        
        delete this._pts[t.identifier];
      }

      if (Object.keys(this._pts).length < 2) this._lp = null;
      this._boxActive = false;
      const box = D.getElementById('mc3-selbox');
      if (box) box.style.display = 'none';
    },
	
	
    _zoom(x, y, deltaY) {
      const canvas = D.getElementById('gameCanvas') || D.body;
      canvas.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true, clientX: x, clientY: y, deltaY, deltaMode: 0
      }));
      if (W.camera) {
        const f = 1 - deltaY * 0.0018;
        if (W.camera.zoom != null)  W.camera.zoom  = Math.max(0.3, Math.min(5, W.camera.zoom  * f));
        if (W.camera.scale != null) W.camera.scale = Math.max(0.3, Math.min(5, W.camera.scale * f));
      }
    },

    _tap(x, y) {
      const canvas = D.getElementById('gameCanvas') || D.body;
      ['mousedown', 'mouseup', 'click'].forEach(type => {
        canvas.dispatchEvent(new MouseEvent(type, {
          bubbles: true, cancelable: true, clientX: x, clientY: y,
          button: 0, buttons: type === 'mousedown' ? 1 : 0
        }));
      });
    },

_moveToWorld(sx, sy) {
      const canvas = D.getElementById('gameCanvas');
      if (!canvas) return;
      const cam = W.camera || { x: 0, y: 0, zoom: 1 };
      const cw = canvas.width / 2;
      const ch = canvas.height / 2;
      const z = cam.zoom || cam.scale || 1;
      const wx = (sx - cw) / z + cam.x;
      const wy = (sy - ch) / z + cam.y;
      Cmd.moveTo(wx, wy);
    },

_applyBoxSelect(x1, y1, x2, y2) {
      const canvas = D.getElementById('gameCanvas');
      if (!canvas) return;
      
      // Dispatch Left-Click (Button 0)
      canvas.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, cancelable: true, clientX: x1, clientY: y1,
        button: 0, buttons: 1
      }));
      
      // Stagger the drag to ensure the canvas loop registers it
      setTimeout(() => {
        canvas.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true, cancelable: true, clientX: x2, clientY: y2,
          button: 0, buttons: 1
        }));
        
        setTimeout(() => {
          canvas.dispatchEvent(new MouseEvent('mouseup', {
            bubbles: true, cancelable: true, clientX: x2, clientY: y2,
            button: 0, buttons: 0
          }));
        }, 16);
      }, 16);
    }
  };

  // ==========================================================================
  //  SECTION 11 — ORCHESTRATOR LOOP & BOOT
  // ==========================================================================
  const Loop = {
    start() {
      requestAnimationFrame(() => this._tick());
    },

    _tick() {
      requestAnimationFrame(() => this._tick());

      const inBattle = G.isBattle();
      const inMenu   = G.isMenuOpen();
      const root     = D.getElementById(ROOT);

      if (root) root.style.display = inMenu ? 'none' : '';

      if (inMenu) {
        Joystick.setVisible(false);
        UnitCards.setVisible(false);
        return;
      }

      Joystick.setVisible(true);

      for (let i = 1; i <= 5; i++) {
        const g = D.getElementById(`mc3-g${i}`);
        if (g) g.style.display = inBattle ? '' : 'none';
      }
['mc3-form-toggle', 'mc3-cmd-toggle', 'mc3-stack-btn'].forEach(id => {
        const el = D.getElementById(id);
        if (el) el.style.display = inBattle ? '' : 'none';
      });

      if (!inBattle) {
        _closeTray('cmd');
        _closeTray('form');
      }

      UnitCards.setVisible(inBattle);
      if (inBattle) UnitCards.update();
    }
  };

  function boot() {
    injectCSS();
    buildDOM();
    Joystick.mount();
    Gestures.mount();
    Loop.start();

    W.MobileControls = { version: VER, G, Cmd, Joystick, UnitCards, Gestures, Help };
    console.log(`[mobileControls.js v${VER}] Ready ✓`);
  }

  const _poll = setInterval(() => {
    if (D.getElementById('gameCanvas') || D.readyState === 'complete') {
      clearInterval(_poll);
      boot();
    }
  }, 150);

  setTimeout(() => {
    clearInterval(_poll);
    if (!W.MobileControls) boot();
  }, 6000);

})(window, document);