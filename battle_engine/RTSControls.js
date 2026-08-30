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
        right: max(env(safe-area-inset-right, 0px) + 10px, 10px);
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
      .mc3-surv-day  { color: #f5d76e; display: none; }
	  
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
        overflow: hidden;
        box-sizing: border-box;
      }
      .mc3-tray-btn .ticon { font-size: clamp(1rem, 3vw, 1.3rem); line-height: 1; }
      .mc3-tray-btn .tlbl  {
        font-size: clamp(0.34rem, 0.95vw, 0.44rem);
        opacity: 0.85;
        width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-align: center;
        padding: 0 1px;
      }
      /* Active-formation highlight — which shape the current blue-arrow
         drag preview/commit is remembering, per direct request. Toggled
         by _syncFormationUI() (added elsewhere in this file), cleared the
         instant the selection no longer shares a single remembered style
         (deselect, reselect, or a fresh drag with no formation memory). */
      .mc3-tray-btn.mc3-formation-active {
        outline: 2px solid #ffd700;
        outline-offset: -2px;
        box-shadow: 0 0 6px rgba(255, 215, 0, 0.7);
      }

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

      /* ── FORMATION DRAG arrow-grid overlay (Total War style) ───────────── */
      #mc3-formline {
        position: fixed;
        left: 0; top: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 9591;
        display: none;
      }

      /* ── FLOATING AI-TACTIC EMOJI (above each tagged unit's head) ─────── */
      /* Sits below the selbox/tray/HUD layers but above the game canvas —
         this is a battlefield overlay, not a UI chrome element, so it must
         never intercept touches (pointer-events:none throughout). See
         AIEmoji in Section 7b below for the per-frame position/glyph logic. */
      #mc3-ai-emoji-layer {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 9580;
        overflow: hidden;
      }
      .mc3-ai-emoji {
        position: absolute;
        left: 0;
        top: 0;
        line-height: 1;
        will-change: transform;
        text-shadow: 0 1px 3px rgba(0,0,0,0.85), 0 0 6px rgba(0,0,0,0.55);
        user-select: none;
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
    // Is the player currently inside a non-city custom location (barracks,
    // storage depot, stables, watchtower, garrison post, maintenance yard)?
    // Kept separate from isInCity() rather than folded into it, so every
    // other existing caller of isInCity() keeps its current meaning.
    isInCustomLocation() {
      return !!(typeof window.inCustomLocationMode !== 'undefined' && window.inCustomLocationMode);
    },
    env() {
      return (typeof battleEnvironment !== 'undefined') ? battleEnvironment : null;
    },
    // All living, commandable player units (no commander, no disabled AI)
    playerUnits() {
      const e = this.env();
      if (!e || !Array.isArray(e.units)) return [];
      // BUG FIX (audit pass, direct request): this used to also exclude
      // disableAICombat units. battlefield_commands.js's own equivalent
      // filter (its keydown handler's local `playerUnits`, and drag-box
      // selection) had that exact exclusion deliberately REMOVED already —
      // documented there as the fix for "units select nothing at the start
      // of a siege battle," since customsiegebattle.js's launch routine
      // sets disableAICombat=true on every player unit at siege start,
      // lifted only once a unit is actually selected (lazyTakeManualControl
      // clears it). That fix was never mirrored here, so this file's own
      // selection path — Cmd.selectGroup(), which is what the 🎯 dropdown
      // calls — still silently selected nothing at all at the start of any
      // siege, the identical bug surviving through the one path that
      // wasn't patched. canSelectUnitNow(u) (called by selectGroup itself)
      // already re-checks per-unit eligibility properly; excluding
      // disableAICombat units from the candidate list a second time here
      // was redundant even when it worked, and wrong the one time it
      // mattered (before any unit had been manually selected yet, when
      // nothing had cleared the flag).
      return e.units.filter(u =>
        u.side === 'player' &&
        !u.isCommander &&
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
    // NEW: called once an order/formation/move command has actually been
    // issued (never on a failed "Select units first" early-return — that's
    // not a real command). Only flips the robot button back to manual; it
    // must NOT touch unit orders here, since the order was just given via
    // the normal path above this call and must stand as issued. Player can
    // press the robot button again any time to re-enable it.
    _revertRobot() {
      if (W.MC3TacticalAI && typeof W.MC3TacticalAI.revertToManualOnCommand === 'function') {
        W.MC3TacticalAI.revertToManualOnCommand();
      }
    },
    _safe(x, y, m) {
      return (typeof getSafeMapCoordinates === 'function')
        ? getSafeMapCoordinates(x, y, m || 50)
        : { x, y };
    },

    // ── P — exit battle / city / non-city location / overworld ───────────
    exit() {
      // Non-city custom locations (barracks/storage/stables/watchtower/
      // garrison/maintenance) aren't wired to the simulated 'p' keydown the
      // way city mode is — sandboxmode_update.js only checks keys['p'] under
      // inCityMode, and camp_system.js's own location loop never reads keys
      // at all for exiting. So call the real exit function directly instead
      // of firing a key nothing is listening for.
      if (G.isInCustomLocation()) {
        if (typeof window.leaveCustomLocation === 'function') window.leaveCustomLocation();
        this._audio('ui_click');
        return;
      }
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

    // ── Q — advance / simple seek & engage ───────────────────────────────
    // Deliberately the "dumb" command-tab version: walk to the nearest
    // enemy and fight, nothing more. The separate 🧠 Charge AI TACTIC
    // (aiTacticGroup === 'melee_charge', see the block below) is the
    // advanced one with its own aggressive ranged-closing override — this
    // button must never trigger that. Clearing aiTacticGroup here (not
    // just setting orderType) is what guarantees it: without this, a unit
    // still tagged from an earlier 🧠 Charge command would have that
    // tactic's own per-frame logic silently take back over.
    charge() {
      const sel = G.selected();
      if (!sel.length) { _showToast('Select units first.'); return; }
      this._clearAiTacticSilent(sel);
      // AUDIT CORRECTION ("go back to RTS controls/battlefield commands and
      // double check for issues... units behaving as intended without
      // glitches" — direct request): a previous pass here called
      // calculateFormationOffsets(sel, 'square', ...) before releasing the
      // charge, on the claim that units would "start the advance already
      // bunched into square." Traced the actual data flow this session and
      // that claim was WRONG — seek_engage movement (processTacticalOrders'
      // seek_engage branch in battlefield_commands.js, and _handleMovement
      // in ai_categories.js) steers every unit straight at unit.target.x/y;
      // formationOffsetX/Y is never read anywhere on that path (only
      // hold_position/follow/move_to_point consume it, all confirmed by
      // grep across every file). So the offsets got written and then simply
      // sat on the unit object, unused — no visual bunching ever happened,
      // it was dead code dressed up as a feature. Removed rather than kept
      // "just in case," since a wrong comment claiming a nonexistent effect
      // is worse than no comment. ADVANCE stays exactly what its own
      // seek_engage doc comment already says it should be: a genuinely dumb
      // banzai charge, no formation, straight at the nearest/smart-picked
      // target — "square" for this button only ever meant "don't leave the
      // acceleration ramp half-wound," handled by currentSpeedMult below,
      // which IS real (getRampedSpeed in ai_categories.js reads it).
      sel.forEach(u => {
        u.hasOrders    = true;
        u.orderType    = 'seek_engage';
        u.orderTargetPoint = null;
        u.formationTimer   = 120;
        u.reactionDelay    = Math.floor(Math.random() * 61) + 3;
        // Max possible speed per direct request — this doesn't boost a
        // unit above its own stats.speed (no artificial buff, per direct
        // request), it only clears a mounted unit's acceleration ramp
        // (see ai_categories.js's updateSpeedRamp/getRampedSpeed) so a
        // horse/elephant that was previously idle or mid-decelerate
        // starts the charge already at its own real top speed instead of
        // spending the first second or two ramping up from a standstill —
        // infantry are untouched, getRampedSpeed() already no-ops for them.
        if (typeof u.currentSpeedMult === 'number') u.currentSpeedMult = 1;
      });
      if (typeof startLazyGeneral === 'function') startLazyGeneral();
      this._revertRobot(); // real order issued — robot reverts to manual
      this._audio('charge');
    },

    // ══════════════════════════════════════════════════════════════════════
    // ★ AI TACTIC GROUPS ★
    //   Clicking a tactic button on a selection tags every selected unit
    //   with unit.aiTacticGroup = 'skirmish' | 'stand_ground' | 'melee_charge'
    //   | 'auto' | 'shield' (undefined/null = no tactic assigned — a unit
    //   that's never been touched by this feature, distinct from 'auto').
    //
    //   THREE SEPARATE STATES (do not conflate — see direct request):
    //     1. Selected state    — u.selected. Purely "is the player looking
    //        at/about to command this unit right now." Never implies a tactic.
    //     2. AI assignment state — u.aiTacticGroup / u.aiTacticNumber. Set
    //        ONLY by setAiTactic() below, persists across selection changes,
    //        and is what actually drives behavior + the floating emoji.
    //     3. Auto-Attack global state — W.MC3TacticalAI.isAutoRunning()
    //        (autoAttack.js). Whether the shared 🤖 tactical engine is live.
    //
    //   Each tactic drives behavior differently:
    //     - stand_ground (HOLD) → 2+ units assemble into one of four
    //       formations — square, circle, line, or loose — chosen by a
    //       weighted read of the selection's own composition (melee cav ->
    //       square, horse archers -> circle, infantry -> line) plus the
    //       enemy's ranged ratio (-> loose); see _pickHoldFormationStyle's
    //       own comment for the exact weighting. Laid out via
    //       calculateFormationOffsets (same function the manual FORM tray's
    //       CIRCLE/BOX buttons use) around their own centroid, with the
    //       centroid nudged off water first — see _landHoldCentroid), then
    //       lock into hold_position once they arrive — see
    //       ai_categories.js's "AI TACTIC: HOLD — FORMATION LOCK-IN". A lone
    //       unit just holds on the spot. Formation king: while still
    //       marching to its slot a unit can still auto-defend if attacked
    //       (per direct request — the emergency self-defense override in
    //       battlefield_commands.js, now a per-unit 20%-of-range/50px-floor
    //       radius rather than a flat 100px, still applies during the
    //       march), but it never breaks formation to chase. Once locked into
    //       hold_position, the unit NEVER charges (walks toward a target to
    //       close distance) and NEVER retreats — it only fights whatever is
    //       already within its real weapon reach and stands perfectly still
    //       otherwise (see ai_categories.js's hold_position branch, search
    //       "NEVER CHARGE, NEVER RETREAT").
    //     - melee_charge (CHARGE) → orderType 'seek_engage', self-sustaining.
    //       Ranged units get an aggressive override in ai_categories.js
    //       (search "AI TACTIC: CHARGE") that closes to ~20% (1/5th) of their
    //       own range instead of the normal 80-95% engagement band — melee/
    //       cavalry units just fight aggressively, which plain seek_engage
    //       already does. Deliberately a "stupid banzai charge at the
    //       closest unit" per direct request — no isolation logic, no
    //       water-avoidance, nothing smart. This is the one tactic that
    //       stays completely dumb on purpose.
    //     - skirmish (SKIRM) → orderType 'seek_engage' too, but behavior
    //       splits by unit type:
    //         • MELEE skirmish units pick targets by strict isolation —
    //           counts same-side allies within 200px of each CANDIDATE
    //           enemy and always attacks whichever enemy has the fewest
    //           (ties broken by distance) — see battlefield_commands.js's
    //           "AI TACTIC: SKIRMISH ISOLATION TARGETING". This overrides
    //           normal smart-target selection entirely for melee/skirmish;
    //           it does NOT change movement — an isolation-picked target is
    //           still engaged via plain seek_engage, no kiting.
    //         • RANGED/gunpowder skirmish units keep distance instead —
    //           ai_categories.js's kiting override (search "AI TACTIC:
    //           SKIRMISH KITING") makes them retreat the instant an enemy
    //           closes inside ~55% of their range, with water-avoidance on
    //           real naval maps (tries alternate retreat angles to stay on
    //           deck; river water does NOT trigger this — see
    //           _isOnAnyDeck's own comment in ai_categories.js).
    //     - auto (ADAPT) → deliberately does NOT get its own aggressive/
    //       evasive/formation posture ("do not make Adapt overly aggressive,
    //       overly evasive, or formation-focused" per direct request).
    //       Instead it just clears _lazyManual and hands the unit to the
    //       SAME shared tactical engine the 🤖 Auto-Attack button drives
    //       (autoAttack.js's triggerTacticalAssault/getLivePlayers loop),
    //       starting that engine on demand via
    //       W.MC3TacticalAI.ensureAdaptRunning() if it isn't already
    //       running. This is exactly why the Auto-Attack button is "a
    //       convenience feature for players who don't want to manually
    //       select every unit and assign Adapt" — pressing 🤖 is just Adapt
    //       applied to the whole non-customized army at once.
    //     - shield (SHIELD) → cautious formation advance, 2+ units only (a
    //       lone unit has nothing to screen it, falls back to plain HOLD-
    //       style hold_position — see setAiTactic). Layout: shield-bearing
    //       melee up front, non-shield melee + gunpowder second row behind
    //       them, ranged third row behind that, cavalry held on the flanks
    //       (level with the line, NOT screening ahead — per direct request
    //       "they hold, only hammer and anvil once units are engaged").
    //       The whole formation advances together in small steps, slightly
    //       slower than a normal march (matching shield-unit pace), driven
    //       by a repeating interval (search "_shieldTick") that re-issues
    //       move_to_point orders toward the enemy each tick while the
    //       formation still holds shape — NOT a one-shot move order. Once
    //       ~30% of the front shield line is actually in combat
    //       (unit.state === "attacking"), cavalry is released from the
    //       flank to seek_engage (the hammer-and-anvil commit). Any
    //       individual unit that's already in range of a target locks into
    //       the same strict hold_position NEVER-CHARGE/NEVER-RETREAT
    //       discipline as HOLD the instant it's engaged — the formation
    //       advances as a body, but an engaged unit doesn't lunge forward
    //       out of line to chase. Formation centroid is nudged off water
    //       first, same as HOLD (_landHoldCentroid).
    //
    //   unit.aiTacticNumber (an incrementing id, one per Cmd.setAiTactic()
    //   call/selection) is internal bookkeeping only, never displayed.
    //
    //   DISPLAY: no card badge anymore. The assigned tactic instead floats
    //   as an emoji directly above the unit's head on the battlefield canvas
    //   — see the AIEmoji overlay below (Section 7b) — tracking the unit,
    //   staying visible while unselected, and disappearing the instant the
    //   tactic is cancelled or the unit dies. Skirm 🤾, Hold ✋, Charge ⚔️,
    //   Adapt 🧠, Shield 🛡️, no tactic assigned = no emoji at all.
    //
    //   CANCELLATION — an AI assignment persists through selection changes
    //   and only stops on one of these 4 triggers (never on mere
    //   deselection — see lazyReleaseManualControl's aiTacticGroup guard in
    //   battlefield_commands.js):
    //     1. Select the units + press CANCEL (cancelAiTactic below).
    //     2. NOT the Auto-Attack toggle (🤖 or 🛑) — per direct request
    //        ("disabling autoattack makes all optional ai disabled"),
    //        fireAuto/toggleManual in autoAttack.js now explicitly SKIP any
    //        unit whose aiTacticGroup is set to something other than
    //        'auto', so a Shield/Hold/Skirm/Charge assignment survives the
    //        robot button being pressed OR released untouched — those
    //        tactics run their own dedicated logic independent of the
    //        shared engine and were never the robot's to claim or stop.
    //        (This file previously documented the OPPOSITE — that toggling
    //        🤖/🛑 reset every assignment — which was never actually
    //        implemented and was the root cause of tactic-tagged units
    //        getting fought over by two controllers at once.)
    //     3. The unit dies (falls out of G.playerUnits()/allPlayerUnits()'s
    //        hp>0 filter — the emoji overlay and behavior overrides simply
    //        stop seeing it, no separate death-hook needed). SHIELD's own
    //        _shieldTick interval additionally self-clears when its whole
    //        group is dead/dispersed/battle-ended — see its own comment.
    //     4. The battle ends (leave_battle_roster.js sweeps aiTacticGroup on
    //        battle exit; a fresh battle spawns fresh unit objects anyway).
    // ══════════════════════════════════════════════════════════════════════
    _aiTacticCounter: 0,
    _aiTacticLabel: { skirmish: 'SKIRM', stand_ground: 'HOLD', melee_charge: 'CHARGE', auto: 'ADAPT', shield: 'SHIELD' },
    // Also used by AIEmoji (Section 7b) to pick which glyph floats above a
    // tagged unit's head — kept in sync with the tray buttons below by hand
    // since both are short, static lookup tables.
    _aiTacticEmoji: { skirmish: '🤾', stand_ground: '✋', melee_charge: '⚔️', auto: '🧠', shield: '🛡️' },

    // Picks a defensive shape for a Hold-tagged GROUP (2+ units), reading
    // the actual battlefield situation rather than always defaulting to one
    // shape. Per direct request, four shapes now exist, each with its own
    // trigger read off the SELECTED units themselves (not the enemy — "at
    // least for the units selected"), except LOOSE which is deliberately an
    // enemy read (spreading out is a response to what the ENEMY can do to a
    // clustered group, not to what's in the selection):
    //   - more melee cavalry selected  -> more likely SQUARE
    //   - more horse archers selected  -> more likely CIRCLE
    //   - more infantry selected       -> more likely LINE
    //   - enemy is ranged-heavy        -> more likely LOOSE (spreads the
    //     group out so one volley/AoE can't collapse it — see LOOSE's own
    //     comment in calculateFormationOffsets)
    // "more chance of" per direct request means a weighted lottery, not a
    // hard cutoff — a selection that's mostly infantry still has SOME
    // chance of forming a circle or square, it's just the underdog. Role-
    // based (getTacticalRole) rather than pure string matching, with a
    // regex fallback only for the rare case that helper isn't loaded yet,
    // matching the convention already used by _bucketForShield.
    _pickHoldFormationStyle(sel) {
      if (!sel.length) return 'circle';
      let meleeCav = 0, rangedCav = 0, infantryCount = 0;
      sel.forEach(u => {
        const role = (typeof getTacticalRole === 'function') ? getTacticalRole(u) : null;
        const txt  = ((u.stats?.role || '') + ' ' + (u.unitType || '')).toLowerCase();
        const isCav = role === 'CAVALRY' || /(cav|horse|lancer|mounted|camel|eleph|keshig)/.test(txt);
        const isRangedMount = /(horse.?archer|mounted.?gunner|keshig|zamburak)/.test(txt) ||
          (isCav && !!(u.stats && u.stats.isRanged));
        if (isCav && isRangedMount) rangedCav++;
        else if (isCav) meleeCav++;
        else if (role !== 'RANGED' && role !== 'GUNPOWDER' && !(u.stats && u.stats.isRanged)) infantryCount++;
      });

      const e = G.env();
      const enemies = (e && Array.isArray(e.units)) ? e.units.filter(u => u.side === 'enemy' && u.hp > 0) : [];
      let enemyRangedCount = 0;
      enemies.forEach(u => { if (u.stats && u.stats.isRanged) enemyRangedCount++; });
      const enemyRangedRatio = enemies.length ? (enemyRangedCount / enemies.length) : 0;

      // BASE keeps every shape reachable even at zero dominance; CIRCLE gets
      // a much higher base per direct request ("hold ai command prioritize
      // to form a circle") — it's the priority/default pick for HOLD unless
      // another shape's own composition signal (heavy melee cav -> square,
      // heavy infantry -> line, enemy ranged-heavy -> loose) is strong
      // enough to genuinely overcome that lead. Still a weighted lottery,
      // not a hard cutoff, matching the existing "more chance of" design —
      // an all-melee-cav selection can still tip SQUARE ahead of circle.
      const BASE = 0.15;
      const CIRCLE_PRIORITY_BASE = 0.65;
      const weights = {
        square: BASE + (meleeCav / sel.length),
        circle: CIRCLE_PRIORITY_BASE + (rangedCav / sel.length),
        line:   BASE + (infantryCount / sel.length),
        loose:  BASE + enemyRangedRatio,
      };
      const total = weights.square + weights.circle + weights.line + weights.loose;
      let roll = Math.random() * total;
      const order = ['square', 'circle', 'line', 'loose'];
      for (let i = 0; i < order.length; i++) {
        roll -= weights[order[i]];
        if (roll <= 0) return order[i];
      }
      return 'circle'; // fallback, should be unreachable
    },

    // Nudges a Hold formation's centroid off water before
    // calculateFormationOffsets runs, per direct request ("hold command
    // forming circles also try to avoid jumping to water"). Moves the WHOLE
    // centroid together rather than checking each unit's individual slot —
    // shifting per-slot would distort the circle/square shape itself,
    // whereas nudging the shared center keeps the formation intact and just
    // relocates where it forms. Naval-only (river water deliberately does
    // NOT count here — see _isOnAnyDeck's own comment in ai_categories.js,
    // "river water is more a land battle" per direct clarification — so on
    // a river map this is a no-op and the formation forms wherever the
    // centroid actually is). Searches outward in a ring of candidate points
    // and returns the first dry one; if genuinely nothing dry is found
    // nearby (e.g. a tiny island), falls back to the original centroid
    // rather than searching forever.
    _landHoldCentroid(cx, cy) {
      const _wet = (x, y) => typeof _isOnAnyDeck === 'function' && !_isOnAnyDeck(x, y);
      if (!_wet(cx, cy)) return { x: cx, y: cy };
      const radii = [40, 80, 120, 180, 260, 360];
      for (let r = 0; r < radii.length; r++) {
        const steps = 12;
        for (let i = 0; i < steps; i++) {
          const ang = (i / steps) * Math.PI * 2;
          const tx = cx + Math.cos(ang) * radii[r];
          const ty = cy + Math.sin(ang) * radii[r];
          if (!_wet(tx, ty)) return { x: tx, y: ty };
        }
      }
      return { x: cx, y: cy }; // nothing dry nearby — best effort, don't hang
    },

    // Sorts a Shield-tagged selection into the four formation roles, per
    // direct request: "melee shields at front, non shield and gunpowder
    // behind, ranged behind and cav at flanks". Mirrors the hasShield
    // convention already used elsewhere (battle_enhancements.js) rather than
    // inventing a new detection method.
    //
    // FIX ("if no shield infantry or few, make melee infantry form the
    // front line"): previously non-shield melee ALWAYS sat in row 2 no
    // matter how few (or zero) shield-bearers were in the group — a group
    // with 1 shield unit and 8 plain swordsmen still put only that 1 unit
    // up front, which doesn't read as a real front line at all. Now: if
    // shields are fewer than the plain-melee count (covers the zero-shield
    // case too), enough plain melee are promoted into the front row to
    // bring it up to roughly half of shields+plainMelee combined, and only
    // genuine leftover plain melee still forms row 2 behind them.
    //
    // FIX ("make sure melee shields are at the front always if possible"):
    // the promoted plain melee used to be appended AFTER the real
    // shield-bearers in the array (b.shields.concat(promoted)). Since
    // layoutRow centers a row symmetrically around its array midpoint
    // (index 0 = left edge, last index = right edge), that put the real
    // shields at the LEFT edge of the front row instead of the center —
    // the promoted plain melee, not the shields, occupied the visually
    // central/most-forward position. Now the promoted units are split
    // evenly across both sides of the real shields (left half prepended,
    // right half appended), so the actual shield-bearers anchor the center
    // of the front line with plain melee filling out both flanks of that
    // same row — a real shieldwall reads shields-in-the-middle, not
    // shields-off-to-one-side.
    _SHIELD_MAX_FRONT: 8, // widest a single shieldwall rank gets before overflow forms a second rank behind it — see FIX comment in _bucketForShield. Tune to taste.
    _bucketForShield(units) {
      const b = { shields: [], secondRow: [], ranged: [], cavalry: [] };
      const plainMelee = [];
      units.forEach(u => {
        const role = (typeof getTacticalRole === 'function') ? getTacticalRole(u) : null;
        const txt  = ((u.stats?.role || '') + ' ' + (u.unitType || '')).toLowerCase();
        const isCav = role === 'CAVALRY' || /(cav|horse|lancer|mounted|camel|eleph|keshig)/.test(txt);
        const hasShield = !!(u.stats && (u.stats.hasShield === true || u.stats.shieldBlockChance > 0));
        if (isCav) { b.cavalry.push(u); return; }
        if (hasShield) { b.shields.push(u); return; }
        if (u.stats && u.stats.isRanged) { b.ranged.push(u); return; } // covers gunpowder too — no separate row for it, "non shield and gunpowder behind" groups gunpowder with second row, but a gunpowder unit that's actually ranged reads more naturally as the ranged row here; kept simple/single-condition since the spec's own wording ("non shield and gunpowder behind, ranged behind") is genuinely ambiguous about a unit that's both — resolved as: non-ranged non-shield melee -> second row, anything that shoots (archer OR gunpowder) -> ranged row.
        plainMelee.push(u); // non-shield melee (no ranged flag at all)
      });
      if (plainMelee.length > b.shields.length) {
        const frontTarget = Math.ceil((b.shields.length + plainMelee.length) / 2);
        const promoteCount = Math.max(0, frontTarget - b.shields.length);
        const promoted = plainMelee.splice(0, promoteCount);
        const leftHalf = Math.floor(promoted.length / 2);
        // real shields sandwiched in the middle, promoted melee split
        // evenly to both flanks of the front row — see FIX comment above.
        b.shields = promoted.slice(0, leftHalf).concat(b.shields, promoted.slice(leftHalf));
      }
      b.secondRow = plainMelee; // whatever's left after any promotion above

      // FIX ("Viking shield wall" depth): a big selection used to form ONE
      // single-file-wide, one-unit-thick line no matter how many
      // shield-eligible units it had — 20 shield-bearers read as a very
      // wide, very thin wall with zero depth, nothing like a real
      // multi-rank shieldwall. Split the (already center-weighted,
      // real-shields-prioritized) front-line pool into ranks of at most
      // _SHIELD_MAX_FRONT, so a large group reads as several ranks deep
      // once it outgrows a single line. b.shields stays the FULL flat
      // pool — _shieldPaceFor still wants the whole pool for its speed
      // average, rank depth doesn't change how fast the line as a whole
      // should walk. b.frontRank is specifically rank 0: the only rank
      // that can physically be "attacking" at first contact, since ranks
      // 2+ are still a full ROW behind the enemy. _buildShieldFormationOffsets
      // (cavalry flank width) and _startShieldTick (the 30%-engaged
      // hammer-and-anvil threshold) both need frontRank specifically —
      // measuring against the full multi-rank pool would make that 30%
      // threshold unreachable for any formation deep enough to have units
      // that can never be in melee range at all.
      b.shieldRanks = [];
      for (let i = 0; i < b.shields.length; i += this._SHIELD_MAX_FRONT) {
        b.shieldRanks.push(b.shields.slice(i, i + this._SHIELD_MAX_FRONT));
      }
      if (!b.shieldRanks.length) b.shieldRanks.push([]); // keep .frontRank safe on an empty/all-ranged-cavalry group
      b.frontRank = b.shieldRanks[0];

      return b;
    },

    // Lays out formationOffsetX/Y for a Shield formation: shields (and any
    // promoted plain melee, see _bucketForShield) front rank(s) — split
    // into multiple ranks of _SHIELD_MAX_FRONT width if the group is big
    // enough, see FIX comment above — second row (leftover non-shield
    // melee) directly behind the LAST shield rank, ranged row behind that,
    // cavalry held level with the FRONT rank on both flanks (NOT screening
    // ahead — per direct request "they hold, only hammer and anvil once
    // units are engaged"). frontDir is a unit vector pointing toward the
    // enemy. Does not issue orders itself — _shieldTick does that every
    // interval so the same offsets can be re-centered on an advancing
    // point.
    //
    // FIX ("way tighter formation"): COL/ROW cut roughly in half (42→22,
    // 55→30) — a real shield wall reads as a tight, shoulder-to-shoulder
    // line, not units spread out with visible gaps between them.
    _buildShieldFormationOffsets(sel, frontDir) {
      const b = this._bucketForShield(sel);
      const side = { x: -frontDir.y, y: frontDir.x };
      const COL = 22, ROW = 30;

      const layoutRow = (group, rowIdx) => {
        group.forEach((u, i) => {
          const colOff = (i - (group.length - 1) / 2) * COL;
          u.formationOffsetX = side.x * colOff + (-frontDir.x) * ROW * rowIdx;
          u.formationOffsetY = side.y * colOff + (-frontDir.y) * ROW * rowIdx;
        });
      };
      b.shieldRanks.forEach((rank, idx) => layoutRow(rank, idx));
      const backDepth = b.shieldRanks.length; // however many shield ranks were actually used — secondRow/ranged sit directly behind the real formation, not always at a hardcoded rowIdx 1/2
      layoutRow(b.secondRow, backDepth);
      layoutRow(b.ranged,    backDepth + 1);

      // Cavalry: both flanks, level with the FRONT RANK ONLY (rowIdx 0
      // depth) — NOT ahead of it, and NOT spaced out to the width of the
      // full multi-rank pool (that would push them needlessly far out on a
      // deep formation whose actual front rank is capped at
      // _SHIELD_MAX_FRONT wide). Half on each side, spaced outward from the
      // edge of the front rank so they don't overlap the infantry's column
      // spread.
      const frontHalfWidth = ((b.frontRank.length - 1) / 2) * COL + 20;
      b.cavalry.forEach((u, i) => {
        const flip  = (i % 2 === 0) ? 1 : -1;
        const depth = Math.floor(i / 2) * 26;
        const colOff = flip * (frontHalfWidth + depth);
        u.formationOffsetX = side.x * colOff;
        u.formationOffsetY = side.y * colOff;
      });
      return b;
    },

    // Clamps a point to window.__playerDeployZone during pre-deploy, per
    // direct request after a reported bug: "chance some units can exit out
    // of the deployment zone particularly in shield formation." Mirrors the
    // exact rectangle-clamp shape battlefield_logic.js's own per-frame
    // PRE-DEPLOY POSITION CLAMP already uses for unit.x/unit.y (same
    // z.minX/maxX/minY/maxY fields) — this just applies that same rectangle
    // to a formation TARGET point before it's ever assigned as
    // orderTargetPoint, rather than relying solely on the per-frame position
    // clamp to catch it after the fact. Per direct confirmation: position-
    // only clamp is enough — formation can end up lopsided against the zone
    // edge rather than reshaping to fit, no reshaping logic needed. Outside
    // pre-deploy (window.__preDeploymentActive false, i.e. the battle is
    // actually live) this is always a no-op — Shield formations should
    // freely advance across the whole map once the battle has started.
    // Naval zones are skipped too (z.type === 'naval' uses ship-relative
    // bounds the existing commander clamp already handles differently; a
    // land-formation rectangle clamp doesn't apply the same way to a deck).
    _clampToDeployZone(x, y) {
      if (!window.__preDeploymentActive || !window.__playerDeployZone) return { x, y };
      const z = window.__playerDeployZone;
      if (z.type === 'naval') return { x, y };
      return {
        x: Math.max(z.minX, Math.min(z.maxX, x)),
        y: Math.max(z.minY, Math.min(z.maxY, y)),
      };
    },

    // Repeating driver for an advancing Shield formation. Per direct
    // request this must be an ongoing tick (not a one-shot move order) that
    // keeps nudging the formation toward the enemy while it holds shape.
    // Keyed by groupNum (Cmd.setAiTactic's aiTacticNumber for this
    // selection) rather than per-unit, since the whole group shares one
    // advancing centroid. Stored on Cmd._shieldIntervals so a second
    // Shield tag (new groupNum) doesn't collide with an existing one, and
    // so cancellation can find and clear the right interval.
    //
    // FIX ("advancing shouldn't be so intervaled, instead more natural,
    // just slower speed"): was a 700ms tick advancing the centroid 6px each
    // time and reissuing move_to_point — visibly stepped/jerky since
    // _handleMovement would catch up to the new target then sit idle for
    // most of the 700ms gap. Now ticks every 90ms (close to a real per-frame
    // cadence) advancing a much smaller 0.75px per tick — same net speed
    // ballpark (0.75px/90ms ≈ 8.3px/sec vs the old 6px/700ms ≈ 8.6px/sec,
    // deliberately close so "slower than march" didn't change, just the
    // GRANULARITY of the steps) but now fine-grained enough to read as
    // continuous creeping motion rather than a stutter-step.
    //
    // FIX ("the shield logic just goes back and forth while moving forward
    // slightly... looks like ur dancing back and forth"): a DIFFERENT bug
    // from the smoothing fix above, and from the SKIRM poke-and-run flicker
    // fixed the same turn as that one — this is lateral wobble baked into
    // the LAYOUT math, not a retreat/approach flip. frontDir used to be
    // recomputed from scratch every single 90ms tick, snapped directly to
    // (enemy centroid - cx,cy). Since advancing even 0.75px shifts the
    // enemy centroid's relative angle from the new cx,cy by a tiny amount,
    // frontDir (and therefore `side`, and therefore EVERY unit's
    // formationOffsetX/Y — the whole row/flank layout rotates around
    // frontDir) micro-rotated every tick. Individual units chasing a
    // constantly, subtly re-angled target slot every 90ms — even though the
    // slot's overall position IS creeping forward — reads exactly like
    // side-to-side dancing layered on top of the forward creep. Fixed with
    // two changes: (1) frontDir now updates via a slow lerp
    // (FRONT_DIR_LERP = 0.04 per tick) toward the freshly computed enemy
    // heading instead of snapping straight to it — the heading still
    // tracks a genuinely moving enemy mass over time, it just can't
    // micro-flutter tick to tick anymore. (2) a unit's orderTargetPoint is
    // now only reissued when it's actually moved more than
    // MIN_RETARGET_DIST (3px) from what that unit was already given — a
    // fresh order every tick for a target that's essentially unchanged was
    // itself adding move_to_point churn on top of the layout wobble.
    //
    // FIX ("shield custom AI is not working — needs to constantly be
    // moving, but slower, at the speed of the melee units"): the MOVE/PAUSE
    // cycle that used to live here (snapshot a target once every ~3s, then
    // sit dead still in hold_position for another ~1-2.5s) was built on the
    // wrong assumption that a unit's real walking speed roughly matched the
    // formation's own crawl pace. It didn't: ADVANCE_STEP was a hand-picked
    // 0.75px/tick (~8px/sec) with zero connection to unit.stats.speed,
    // which is many times faster for a real melee unit. A unit would
    // snapshot a target maybe 20-25px ahead of it, close that entire gap in
    // a fraction of a second at its true walking speed, and then just stand
    // there doing nothing for the rest of its multi-second MOVE phase, plus
    // the whole PAUSE phase after — reading as broken/frozen rather than a
    // shieldwall advancing. That same ~20-25px gap also sat right inside
    // processTacticalOrders' own arrival hysteresis band (18px stopDistance
    // / 30px wakeDistance for infantry, in battlefield_commands.js), so
    // depending on exact positions a unit could fail to even register as
    // needing to walk at all.
    //
    // Fixed two ways:
    //  1. PACE: the centroid's own per-tick advance (ADVANCE_STEP below) is
    //     now derived every tick from the REAL stats.speed of the
    //     formation's actual front-row melee/shield units (_shieldPaceFor),
    //     not a made-up constant. Every still-marching member's own
    //     stats.speed is temporarily clamped to that same shared pace
    //     (restored the instant it engages, gets hammer-and-anvil released,
    //     or the tactic is cancelled — see _shieldOriginalSpeed/
    //     _restoreSpeed) so the whole body — front row, second row, ranged,
    //     still-leashed cavalry — genuinely marches together at one
    //     uniform "melee unit" pace instead of faster units repeatedly
    //     outrunning the line and stalling out ahead of it.
    //  2. NO MORE SETTLING MID-MARCH: dropped the MOVE/PAUSE snapshot
    //     entirely and instead drive marching units with the SAME
    //     hysteresis-free primitive the Total War-style drag-formation
    //     march already uses: unit._formationLocked. Both
    //     processTacticalOrders() (battlefield_commands.js) and
    //     processAction() (ai_categories.js) hard-return at the very top
    //     for any _formationLocked unit and drive it with one direct
    //     _handleMovement call toward orderTargetPoint — none of the
    //     stopDistance/wakeDistance "settle" hysteresis that STANDARD/FIELD
    //     MOVEMENT applies to plain move_to_point orders ever runs on it.
    //     orderTargetPoint is refreshed every single tick (not once per
    //     phase) to the unit's current formation slot, so a marching unit
    //     is always chasing a point that's freshly a little further ahead
    //     of it and can never fully "arrive" and stop on its own — it only
    //     actually halts once the group truly stops advancing (front line
    //     engaged) or the unit itself gets in range of a target.
    //
    // The earlier frontDir-wobble fixes above (the slow FRONT_DIR_LERP
    // blend) are untouched and still do their job — nothing about this fix
    // touches how frontDir/side is computed, only how often/how far units
    // are told to walk and how fast they're allowed to do it. Formation
    // tightness (COL/ROW in _buildShieldFormationOffsets) and shield-front
    // bucketing (_bucketForShield) are also unrelated and untouched here.
    _shieldIntervals: {},
    // Raw representative walking speed for the formation's actual melee/
    // shield units — the baseline "speed of the melee units" that the
    // CREEP_FACTOR slowdown in _startShieldTick is applied to, not the
    // final formation pace itself. Front-row shields first (that's
    // literally what's being matched), falling back to the second row,
    // then a sane default for the rare one-tick window where the group is
    // entirely ranged/cavalry (e.g. mid-reshuffle right after the
    // front-row shields just died).
    _shieldPaceFor(b) {
      const src = b.shields.length ? b.shields : (b.secondRow.length ? b.secondRow : null);
      if (!src) return 1.2;
      const sum = src.reduce((s, u) => s + (u.stats?.speed || 1.2), 0);
      return sum / src.length;
    },
    _startShieldTick(groupNum, initialCx, initialCy, initialFrontDir) {
      if (this._shieldIntervals[groupNum]) clearInterval(this._shieldIntervals[groupNum]);
      let cx = initialCx, cy = initialCy;
      let frontDir = initialFrontDir;
      let cavRelease = false; // hammer-and-anvil commit latch — one-way once tripped
      const TICK_MS         = 90;   // cadence for the centroid/frontDir advance AND the orderTargetPoint refresh below — see FIX comment above for why this is now every tick, not once per MOVE phase
      const FRONT_DIR_LERP  = 0.04; // how fast frontDir chases the freshly computed enemy heading — low on purpose, see earlier FIX comment above
      const FRAMES_PER_TICK = TICK_MS / (1000 / 60); // _handleMovement applies stats.speed once per ~60fps sim frame; converts a per-frame speed stat into a per-tick advance distance

      // Releases a unit's temporarily-clamped walking speed back to its own
      // real value — called the instant a unit stops being an actively-
      // marching, not-yet-engaged Shield member (engages, gets hammer-and-
      // anvil released, goes onto committed siege duty, or the tactic is
      // cancelled elsewhere in RTSControls.js).
      const _restoreSpeed = (u) => {
        if (u._shieldOriginalSpeed !== undefined) {
          u.stats.speed = u._shieldOriginalSpeed;
          u._shieldOriginalSpeed = undefined;
        }
      };

      this._shieldIntervals[groupNum] = setInterval(() => {
        if (!G.isBattle()) { clearInterval(this._shieldIntervals[groupNum]); delete this._shieldIntervals[groupNum]; return; }
        const e = G.env();
        if (!e || !Array.isArray(e.units)) return;
        const group = e.units.filter(u => u.hp > 0 && u.aiTacticGroup === 'shield' && u.aiTacticNumber === groupNum);
        if (!group.length) { clearInterval(this._shieldIntervals[groupNum]); delete this._shieldIntervals[groupNum]; return; }

        // SIEGE PRIORITY: per direct request, "during a siege all this ai
        // logic is secondary to operating siege equipment." A unit assigned
        // a live siege role (ladder_carrier/ram_pusher/trebuchet_crew, same
        // set battlefield_commands.js's isCommittedSiegeCrew already
        // exempts from other overrides) sits out of the Shield formation
        // entirely for as long as that role is active — also releases any
        // speed clamp/march lock it was carrying so the siege job runs at
        // full normal speed. It resumes being driven by Shield the next
        // tick after its siegeRole clears, since group is rebuilt fresh
        // from live aiTacticGroup/aiTacticNumber every tick.
        const committedSiegeRoles = ['ladder_carrier', 'ram_pusher', 'trebuchet_crew'];
        const activeGroup = group.filter(u => {
          if (committedSiegeRoles.indexOf(u.siegeRole) === -1) return true;
          _restoreSpeed(u);
          u._formationLocked = false;
          return false;
        });
        if (!activeGroup.length) return; // whole group is currently on siege duty — nothing to advance this tick

        const enemies = e.units.filter(u => u.side === 'enemy' && u.hp > 0);
        if (enemies.length) {
          const ecx = enemies.reduce((s, u) => s + u.x, 0) / enemies.length;
          const ecy = enemies.reduce((s, u) => s + u.y, 0) / enemies.length;
          const dx = ecx - cx, dy = ecy - cy;
          const mag = Math.hypot(dx, dy) || 1;
          const targetDir = { x: dx / mag, y: dy / mag };
          // Slow lerp toward the freshly computed heading instead of
          // snapping straight to it — see earlier FIX comment above.
          // Re-normalize after blending so frontDir stays a true unit
          // vector (a lerp between two unit vectors isn't itself unit
          // length).
          let blendedX = frontDir.x + (targetDir.x - frontDir.x) * FRONT_DIR_LERP;
          let blendedY = frontDir.y + (targetDir.y - frontDir.y) * FRONT_DIR_LERP;
          const blendedMag = Math.hypot(blendedX, blendedY) || 1;
          frontDir = { x: blendedX / blendedMag, y: blendedY / blendedMag };
        }

        const b = this._bucketForShield(activeGroup);
        // Engagement check FIRST — an already-engaged shield unit must not
        // get its offset re-centered out from under it (that would yank it
        // off whatever it's fighting). Only advance units that are not yet
        // locked into combat.
        //
        // Measured against b.frontRank, NOT the full (possibly multi-rank,
        // see _bucketForShield) b.shields pool — units in rank 2+ are still
        // a full ROW behind the enemy and can never be "attacking" at first
        // contact, so dividing by the whole pool would make the 30%
        // threshold below unreachable for any formation deep enough to have
        // a second rank.
        const shieldsEngaged = b.frontRank.filter(u => u.state === 'attacking').length;
        const engagedFrac = b.frontRank.length ? (shieldsEngaged / b.frontRank.length) : 0;
        if (!cavRelease && engagedFrac >= 0.30) cavRelease = true; // one-way latch, per direct request "~30%"

        // Pace the shared centroid's own advance off the real melee/shield
        // walking speed — see FIX comment above. Only advances while the
        // front line isn't yet meaningfully engaged; once real contact is
        // made the formation has arrived and shouldn't keep marching
        // through its own melee.
        //
        // FIX ("is it like a Viking shield wall slowly creeping, compared
        // to Hold?"): _shieldPaceFor() returns the shield units' raw,
        // unmodified stats.speed — every marching unit's own speed then
        // gets clamped to that SAME value, which for the actual melee/
        // shield units is a no-op. Net result was the formation marching
        // at completely normal, undiminished walking speed — fixed the
        // freeze, but lost the cautious, deliberate "shieldwall creep" feel
        // entirely; it just read as an ordinary march. CREEP_FACTOR pulls
        // that down to a genuinely slow advance (per direct request "at the
        // speed of the melee units" — reinterpreted here as "no faster
        // than," not "exactly equal to," since a real shieldwall advances
        // well under a soldier's normal marching pace). This is safe from
        // reintroducing the old bug: ADVANCE_STEP is derived from this same
        // reduced meleePace value, and every marching unit's stats.speed is
        // clamped to that identical value below — the target-advance
        // distance and the actual walking speed can never drift apart from
        // each other again, no matter what fraction of full speed
        // CREEP_FACTOR is set to. Tune this single constant to taste.
        const CREEP_FACTOR = 0.45;
        const meleePace = this._shieldPaceFor(b) * CREEP_FACTOR;
        const ADVANCE_STEP = meleePace * FRAMES_PER_TICK;
        if (engagedFrac < 0.30) {
          const landed = this._landHoldCentroid(cx + frontDir.x * ADVANCE_STEP, cy + frontDir.y * ADVANCE_STEP);
          const clamped = this._clampToDeployZone(landed.x, landed.y);
          cx = clamped.x; cy = clamped.y;
        }

        // FIX ("shield still doesn't advance after forming up — holds
        // better than Hold AI"): the bug above wasn't the last word.
        // ADVANCE_STEP (a few px per 90ms tick, deliberately small for a
        // slow creep) is smaller than ai_categories.js's OWN hardcoded
        // FORMATION_ARRIVAL_THRESHOLD (14px) — the radius _formationLocked
        // snaps a unit to "arrived" and locks it into hold_position. Every
        // fresh target issued below (the true slot, cx+offsetX/cy+offsetY)
        // sits only ADVANCE_STEP away from where the unit already was,
        // which is WELL inside that 14px radius the instant it's assigned.
        // So the unit "arrives" and snaps to hold_position almost
        // immediately after every single tick — spending the vast majority
        // of each 90ms window sitting locked in that held state, with only
        // a barely-visible ADVANCE_STEP-sized twitch when the next tick
        // fires. That reads as "basically not moving" — worse than HOLD,
        // which at least holds cleanly instead of stutter-twitching.
        //
        // Fixed with LOOKAHEAD: the chase target handed to
        // _formationLocked is projected LOOKAHEAD px further along frontDir
        // than the unit's actual formation slot — comfortably clear of the
        // 14px snap radius, and deliberately independent of
        // ADVANCE_STEP/CREEP_FACTOR/pace so this property can never be
        // broken again by future speed tuning alone. The unit's own walking
        // speed is still clamped to the real (slow) meleePace, so it can
        // only close a small fraction of that lookahead gap each tick — it
        // perpetually trails the projected point without ever closing the
        // full distance, which is exactly "always still walking, never
        // arriving" while the group is genuinely still advancing.
        //
        // Only applied while engagedFrac < 0.30, mirroring the guard on cx/
        // cy's own advance just above: once real contact stops the
        // centroid, still-unengaged units (rear ranks, ranged, unreleased
        // cavalry) must walk to their TRUE slot with no lookahead so they
        // actually arrive and settle cleanly behind the engaged front line
        // — otherwise they'd keep overshooting LOOKAHEAD px past where
        // they're supposed to stand, potentially into the front rank's own
        // melee.
        //
        // During pre-deployment this also directly delivers "you can see
        // them trying, but the zone blocks them": _clampToDeployZone below
        // clips the lookahead-projected point to window.__playerDeployZone,
        // so a marching unit's target visibly sits pinned right at the
        // zone edge nearest the enemy instead of never attempting to push
        // past it at all.
        const stillAdvancing = engagedFrac < 0.30;
        const LOOKAHEAD = 30; // safely clear of ai_categories.js's 14px FORMATION_ARRIVAL_THRESHOLD, with margin for clamp/rounding jitter

        this._buildShieldFormationOffsets(activeGroup, frontDir);

        activeGroup.forEach(u => {
          const isCav = b.cavalry.indexOf(u) !== -1;
          if (isCav && cavRelease) {
            // Hammer-and-anvil commit — released once, never re-leashed
            // even if engagedFrac later drops (a unit dying shouldn't yank
            // committed cavalry back to the flank mid-charge).
            if (u.aiTacticGroup === 'shield') { // only reassign once, on the tick it actually flips
              _restoreSpeed(u);
              u._formationLocked = false;
              u.aiTacticGroup = undefined;
              u.aiTacticNumber = undefined;
              u._lazyManual = true;
              u.orderType = 'seek_engage';
              u.orderTargetPoint = null;
              u.hasOrders = true;
            }
            return;
          }
          const dist = u.target ? Math.hypot(u.x - u.target.x, u.y - u.target.y) : Infinity;
          const inOwnRange = u.target && u.target.hp > 0 && dist <= (u.stats.range || 30);
          if (inOwnRange) {
            // Already fighting something within real reach — lock in place,
            // same NEVER-CHARGE/NEVER-RETREAT discipline as HOLD. Not
            // marching anymore, so release both the hysteresis-free march
            // lock and the shared-pace speed clamp. Does not touch
            // formationOffsetX/Y (already updated above so the slot is
            // ready the instant the unit disengages).
            _restoreSpeed(u);
            u._formationLocked = false;
            u._lazyManual = true;
            u.orderType = 'hold_position';
            u.orderTargetPoint = null;
          } else {
            // Still marching, not yet engaged. Clamp this unit's own
            // walking speed to the shared melee pace (so a naturally-faster
            // unit — an unreleased flank cavalry, say — can't outrun the
            // line) and drive it via the hysteresis-free _formationLocked
            // march primitive, refreshing orderTargetPoint EVERY tick so it
            // never settles/stops on its own mid-approach — see FIX comment
            // above _shieldIntervals for the full reasoning, and the
            // LOOKAHEAD comment just above for why the target itself is
            // projected past the unit's true slot while still advancing.
            if (u._shieldOriginalSpeed === undefined) u._shieldOriginalSpeed = u.stats.speed;
            u.stats.speed = meleePace;
            u._lazyManual = true;
            u._formationLocked = true;
            u.orderType = 'move_to_point';
            const lookX = stillAdvancing ? frontDir.x * LOOKAHEAD : 0;
            const lookY = stillAdvancing ? frontDir.y * LOOKAHEAD : 0;
            u.orderTargetPoint = this._clampToDeployZone(cx + (u.formationOffsetX || 0) + lookX, cy + (u.formationOffsetY || 0) + lookY);
            u.target = (u.target && u.target.isDummy) ? u.target : null;
          }
          u.hasOrders = true;
        });
      }, TICK_MS);
    },

    setAiTactic(tacticName) {
      const sel = G.selected();
      if (!sel.length) { _showToast('Select units first.'); return; }
      this._aiTacticCounter = (this._aiTacticCounter || 0) + 1;
      const groupNum = this._aiTacticCounter;

      // Tag every selected unit with its persistent AI assignment FIRST —
      // this is the "AI assignment state" (see the state-logic block
      // above); it's intentionally independent of u.selected, and it's
      // what the floating battlefield emoji and the ai_categories.js
      // behavior overrides key off, so it must exist before any of the
      // tactic-specific branches below run.
      sel.forEach(u => {
        u.aiTacticGroup  = tacticName;   // 'skirmish' | 'stand_ground' | 'melee_charge' | 'auto'
        u.aiTacticNumber = groupNum;     // internal bookkeeping only, never displayed
        u.hasOrders      = true;
        u._formationLocked = false; // any explicit AI tactic command cancels a pending formation-drag lock
      });

      if (tacticName === 'stand_ground') {
        // HOLD — formation king. 2+ units assemble into a ring/square
        // around their own centroid instead of each unit just planting
        // wherever it happened to be standing; a lone unit has nothing to
        // form up with, so it just holds on the spot as before.
        if (sel.length > 1 && typeof calculateFormationOffsets === 'function') {
          const rawCx = sel.reduce((s, u) => s + u.x, 0) / sel.length;
          const rawCy = sel.reduce((s, u) => s + u.y, 0) / sel.length;
          // Nudge off water before laying out the circle/square — see
          // _landHoldCentroid's own comment for why the whole center moves
          // together instead of checking each unit's slot individually.
          const landed = this._landHoldCentroid(rawCx, rawCy);
          const cx = landed.x, cy = landed.y;
          const style = this._pickHoldFormationStyle(sel);
          calculateFormationOffsets(sel, style, { x: cx, y: cy });
          sel.forEach(u => {
            u._lazyManual      = true; // explicit — don't rely on selection having already set this
            u.orderType        = 'move_to_point';
            u.orderTargetPoint = { x: cx + (u.formationOffsetX || 0), y: cy + (u.formationOffsetY || 0) };
            u.formationTimer   = 180;
            u.reactionDelay    = Math.floor(Math.random() * 15) + 5;
            u.target           = (u.target && u.target.isDummy) ? u.target : null;
          });
          // ai_categories.js's "AI TACTIC: HOLD — FORMATION LOCK-IN" block
          // takes it from here: converts each unit to hold_position the
          // instant it arrives at its slot (or its formationTimer expires).
        } else {
          sel.forEach(u => {
            u._lazyManual      = true;
            u.orderType        = 'hold_position';
            u.orderTargetPoint = null;
            u.target           = (u.target && u.target.isDummy) ? u.target : null;
          });
        }
      } else if (tacticName === 'auto') {
        // ADAPT — hands the unit back to the shared autoAttack.js tactical
        // engine rather than giving it its own posture. Clearing
        // _lazyManual is what actually re-admits it to that engine's
        // getLivePlayers() filter; ensureAdaptRunning() starts the engine
        // if the player hasn't already pressed 🤖, without touching any
        // other unit's own state.
        sel.forEach(u => { u._lazyManual = false; });
        if (W.MC3TacticalAI && typeof W.MC3TacticalAI.ensureAdaptRunning === 'function') {
          W.MC3TacticalAI.ensureAdaptRunning();
        }
      } else if (tacticName === 'shield') {
        // SHIELD — cautious formation advance. A lone unit has nothing to
        // screen it and no line to hold, so it falls back to plain HOLD-
        // style hold_position rather than trying to run a one-unit
        // "formation."
        if (sel.length > 1) {
          const rawCx = sel.reduce((s, u) => s + u.x, 0) / sel.length;
          const rawCy = sel.reduce((s, u) => s + u.y, 0) / sel.length;
          const landedWater = this._landHoldCentroid(rawCx, rawCy);
          // FIX (deploy-zone escape bug): clamp the initial centroid too,
          // not just each tick's advance — see _clampToDeployZone's own
          // comment. A no-op once the battle is actually live.
          const landed = this._clampToDeployZone(landedWater.x, landedWater.y);
          const e = G.env();
          const enemies = (e && Array.isArray(e.units)) ? e.units.filter(u => u.side === 'enemy' && u.hp > 0) : [];
          let frontDir = { x: 0, y: 1 };
          if (enemies.length) {
            const ecx = enemies.reduce((s, u) => s + u.x, 0) / enemies.length;
            const ecy = enemies.reduce((s, u) => s + u.y, 0) / enemies.length;
            const dx = ecx - landed.x, dy = ecy - landed.y;
            const mag = Math.hypot(dx, dy) || 1;
            frontDir = { x: dx / mag, y: dy / mag };
          }
          this._buildShieldFormationOffsets(sel, frontDir);
          sel.forEach(u => {
            u._lazyManual      = true;
            // Locked in immediately (not just once the first 90ms tick of
            // _startShieldTick fires below) so there's no brief window
            // where a fresh Shield unit is sitting on the generic
            // stopDistance/wakeDistance settle logic instead of the
            // hysteresis-free march primitive — see the big FIX comment on
            // _shieldIntervals for why that logic can freeze a unit that's
            // already close to its slot.
            u._formationLocked = true;
            u.orderType        = 'move_to_point';
            const tgt = this._clampToDeployZone(landed.x + (u.formationOffsetX || 0), landed.y + (u.formationOffsetY || 0));
            u.orderTargetPoint = tgt;
            u.formationTimer   = 60;
            u.reactionDelay    = Math.floor(Math.random() * 15) + 5;
            u.target           = (u.target && u.target.isDummy) ? u.target : null;
          });
          this._startShieldTick(groupNum, landed.x, landed.y, frontDir);
        } else {
          sel.forEach(u => {
            u._lazyManual      = true;
            u.orderType        = 'hold_position';
            u.orderTargetPoint = null;
            u.target           = (u.target && u.target.isDummy) ? u.target : null;
          });
        }
      } else {
        // skirmish, melee_charge — both start from seek_engage, which
        // self-sustaining re-acquires a live target every frame on its
        // own. The actual behavioral split (Charge's aggressive 20%-range
        // closing override for ranged units, Skirm's earlier/eager kiting
        // retreat) happens per-frame in ai_categories.js.
        sel.forEach(u => {
          u._lazyManual      = true; // explicit — don't rely on selection having already set this
          u.orderType        = 'seek_engage';
          u.orderTargetPoint = null;
          u.formationTimer   = 120;
          u.reactionDelay    = Math.floor(Math.random() * 61) + 3;
        });
      }

      this._revertRobot();
      const lbl = this._aiTacticLabel[tacticName] || tacticName.toUpperCase();
      _showToast(sel.length + ' unit' + (sel.length === 1 ? '' : 's') + ' set to ' + lbl);
      this._audio('ui_click');
    },
    cancelAiTactic() {
      const sel = G.selected();
      if (!sel.length) { _showToast('Select units first.'); return; }
      // Stop any Shield formation interval(s) this selection belonged to
      // immediately, rather than waiting up to one TICK_MS for _shieldTick's
      // own self-check (group.length === 0) to notice and clear itself —
      // harmless either way, just tidier to cut it the instant Cancel is
      // pressed.
      const shieldGroupNums = new Set(
        sel.filter(u => u.aiTacticGroup === 'shield').map(u => u.aiTacticNumber)
      );
      shieldGroupNums.forEach(gn => {
        if (this._shieldIntervals[gn]) {
          clearInterval(this._shieldIntervals[gn]);
          delete this._shieldIntervals[gn];
        }
      });
      sel.forEach(u => {
        u.aiTacticGroup    = undefined;
        u.aiTacticNumber   = undefined;
        // Full reset to a never-touched unit's default state — hands the
        // unit back to whatever passive control applies (the auto-attack
        // engine if it's running, otherwise nothing) exactly like a fresh
        // unit that's never been selected.
        u._lazyManual      = false;
        u._formationLocked = false; // cancel-AI also cancels a mid-march formation lock
        // Shield's shared-melee-pace speed clamp — see _shieldOriginalSpeed
        // in _startShieldTick. Must be released here too, or a unit
        // cancelled mid-march would keep walking at the clamped pace under
        // whatever tactic/control picks it up next.
        if (u._shieldOriginalSpeed !== undefined) {
          u.stats.speed = u._shieldOriginalSpeed;
          u._shieldOriginalSpeed = undefined;
        }
        u.orderType        = 'hold_position';
        u.orderTargetPoint = null;
        u.hasOrders        = true;
      });
      _showToast('AI tactic cleared for selection.');
      this._audio('ui_click');
    },

    // Same tactic-clearing core as cancelAiTactic() above (stop any Shield
    // interval, wipe aiTacticGroup/aiTacticNumber) but with none of its UI
    // side effects (no toast, no sound) and no opinion on order/_lazyManual/
    // _formationLocked — those are the caller's business. Takes a raw unit
    // array instead of reading G.selected(), since callers outside this
    // file (battlefield_commands.js's executeBoxFormationMove) are acting
    // on a unit list they already have in hand, not the live selection.
    //
    // Exists so a plain Total War-style drag-waypoint command always fully
    // supersedes whatever brain-emoji tactic (skirmish/stand_ground/
    // melee_charge/shield/auto) a unit was previously tagged with, instead
    // of only pausing it for the march (via _formationLocked) and letting
    // it quietly resume the instant the unit arrives — and so
    // lazyReleaseManualControl's aiTacticGroup guard doesn't keep the unit
    // opted out of autoAttack.js forever after a later deselect.
    _clearAiTacticSilent(units) {
      const list = units || [];
      const shieldGroupNums = new Set(
        list.filter(u => u.aiTacticGroup === 'shield').map(u => u.aiTacticNumber)
      );
      shieldGroupNums.forEach(gn => {
        if (this._shieldIntervals[gn]) {
          clearInterval(this._shieldIntervals[gn]);
          delete this._shieldIntervals[gn];
        }
      });
      list.forEach(u => {
        u.aiTacticGroup  = undefined;
        u.aiTacticNumber = undefined;
        // Same speed-clamp release as cancelAiTactic() above — a drag-
        // waypoint command superseding Shield mid-march shouldn't leave the
        // unit walking at the formation's clamped pace.
        if (u._shieldOriginalSpeed !== undefined) {
          u.stats.speed = u._shieldOriginalSpeed;
          u._shieldOriginalSpeed = undefined;
        }
      });
    },


    // ── E — stop / hold position ──────────────────────────────────────────
    // Audited against the old north/south assumption per direct request:
    // this is already fully position-agnostic (hold_position + zeroed
    // velocity + cleared target/destination, no hardcoded edge or
    // direction anywhere in it) — no change needed here.
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
        u._formationLocked = false; // player interrupted a formation march — cancel AI's ignore
        u.vx = 0;
        u.vy = 0;
        u.reactionDelay = Math.floor(Math.random() * 61) + 3;
        if (u.originalRange) {
          u.stats.range  = u.originalRange;
          u.originalRange = null;
        }
        // Shield's shared-melee-pace speed clamp (see _shieldOriginalSpeed
        // in _startShieldTick) — same idea as the originalRange restore
        // just above, for a unit the player interrupted mid-march.
        if (u._shieldOriginalSpeed !== undefined) {
          u.stats.speed = u._shieldOriginalSpeed;
          u._shieldOriginalSpeed = undefined;
        }
        const s = this._safe(u.x, u.y, 15);
        u.x = s.x;
        u.y = s.y;
      });
      this._revertRobot(); // real order issued — robot reverts to manual
      this._audio('ui_click');
    },

    // ── R — retreat to the nearest battlefield edge ──────────────────────
    // FIX: used to always target the south edge (maxH), built back when
    // the player was always the south side and the enemy always north.
    // Spawn sides are randomized now (see calculateFormationOffsets' own
    // face-the-enemy fix), so retreat instead picks whichever of the four
    // map edges is closest to THIS unit's current position — a unit near
    // the east edge retreats east, not blindly south.
    retreat() {
      this._stopLazy();
      const sel = G.selected();
      if (!sel.length) { _showToast('Select units first.'); return; }
      const maxW = (typeof BATTLE_WORLD_WIDTH  !== 'undefined') ? BATTLE_WORLD_WIDTH  : 2400;
      const maxH = (typeof BATTLE_WORLD_HEIGHT !== 'undefined') ? BATTLE_WORLD_HEIGHT : 3600;
      sel.forEach(u => {
        u.hasOrders    = true;
        u.orderType    = 'retreat';
        const distN = u.y, distS = maxH - u.y, distW = u.x, distE = maxW - u.x;
        const nearest = Math.min(distN, distS, distW, distE);
        let tx = u.x, ty = u.y;
        if (nearest === distS)      ty = maxH - 50 - Math.random() * 20;
        else if (nearest === distN) ty = 50 + Math.random() * 20;
        else if (nearest === distE) tx = maxW - 50 - Math.random() * 20;
        else                        tx = 50 + Math.random() * 20;
        u.orderTargetPoint = this._safe(tx, ty);
        u.formationTimer   = 240;
        u.reactionDelay    = Math.floor(Math.random() * 61) + 3;
        // FIX ("ADVANCE/STOP/RETREAT/FOLLOW should always default tight
        // formation/square and max possible speed AI" — direct request):
        // RETREAT deliberately does NOT call calculateFormationOffsets —
        // each unit already picks its OWN nearest edge independently (see
        // the FIX comment above this function), so a mixed selection can
        // legitimately have some units fleeing north and others south at
        // the same time. Forcing one shared formation shape across the
        // whole selection would fight that — units fleeing toward opposite
        // edges have no sensible common "square" to belong to. What square
        // means here instead: no spacing/offset is ever added on top of
        // each unit's own flee point (retreat already didn't add any,
        // which is exactly a tight, unspread cluster per unit — this just
        // makes it explicit) and assignedFormationStyle is tagged 'square'
        // directly so the formation tray/depth-lock UI reads correctly if
        // the player checks it mid-retreat, same as every other order type
        // that touches this field.
        u.assignedFormationStyle = 'square';
        // Max possible speed, same reasoning as ADVANCE/FOLLOW below —
        // clears a mounted unit's acceleration ramp so it flees at its own
        // real top speed immediately rather than spending the first
        // second or two ramping up; no artificial boost above stats.speed,
        // infantry untouched (getRampedSpeed already no-ops for them).
        if (typeof u.currentSpeedMult === 'number') u.currentSpeedMult = 1;
      });
      this._revertRobot(); // real order issued — robot reverts to manual
      this._audio('ui_click');
    },

    // ── F — follow commander in current formation ────────────────────────
    // Audited against the old north/south assumption per direct request:
    // this already tracks the commander's LIVE position every frame
    // (orderType 'follow' is re-read fresh each tick, not a one-time
    // point) and calculateFormationOffsets' own face-the-enemy fix already
    // makes the formation orient toward wherever the enemy currently is —
    // no hardcoded side anywhere in this path. No change needed here.
    //
    // FIX ("ADVANCE/STOP/RETREAT/FOLLOW should always default tight
    // formation/square and max possible speed AI" — direct request): this
    // used to read window.currentFormationStyle (falling back to 'line')
    // — whatever shape the player last picked from the FORM tray, or
    // nothing at all. FOLLOW now always forces 'square' regardless of
    // that global, same as the other three command-bar orders.
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
        // Max possible speed — see ADVANCE's identical comment for the
        // full reasoning (clears mount accel ramp only, no stat boost).
        if (typeof u.currentSpeedMult === 'number') u.currentSpeedMult = 1;
      });
      if (typeof calculateFormationOffsets === 'function') {
        calculateFormationOffsets(sel, 'square', cmd);
      }
      this._revertRobot(); // real order issued — robot reverts to manual
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

      // Formation buttons put units in place and STOP — a "form up here"
      // command, not an advance order. Two things are needed for that to
      // actually hold once the unit arrives, and this handler was missing
      // both of them (which is why units were seen forming up and then
      // immediately charging the enemy):
      //  1. Opt out of autoAttack.js's own tactical engine — same
      //     lazyTakeManualControl the keyboard Z/X/V/C/B path already
      //     calls (see battlefield_commands.js). Without this, that
      //     engine keeps driving the unit's combat behavior in parallel
      //     with the move order below and can send it charging the
      //     moment it notices an enemy in range.
      //  2. Clear any leftover brain-emoji AI tactic (SKIRM/HOLD/CHARGE/
      //     ADAPT/SHIELD) from an earlier command. ai_categories.js keys
      //     its own per-frame behavior off aiTacticGroup, so an old
      //     CHARGE tag would otherwise resume driving the unit at the
      //     enemy the instant this one-time move order completes.
      if (typeof window.lazyTakeManualControl === 'function') {
        window.lazyTakeManualControl(sel);
      }
      this._clearAiTacticSilent(sel);

      if (typeof calculateFormationOffsets === 'function') {
        calculateFormationOffsets(sel, style, { x: cx, y: cy });
      }
      // FIX: this button handler was a separate, never-updated copy of the
      // keyboard Z/X/V/C/B logic — it still used orderType='follow', which
      // re-derives each unit's target every tick as commander.x/y + offset
      // instead of the selection's own centroid (cx/cy computed above).
      // That's why every shape except CIRCLE looked broken from this button:
      // circle's offsets are small and roughly symmetric, so tethering to
      // the commander still LOOKED like a rough ring; tight/standard/line's
      // directional, role-sorted offsets only look right anchored to the
      // selection's own centroid, so they came out scattered/wrong. Keyboard
      // presses already got this fix (see battlefield_commands.js) — mirror
      // it here: one-time move_to_point to cx/cy + offset, no ongoing follow.
      sel.forEach(u => {
        u.hasOrders    = true;
        u.orderType    = 'move_to_point';
        u.orderTargetPoint = {
          x: cx + (u.formationOffsetX || 0),
          y: cy + (u.formationOffsetY || 0)
        };
        u.formationTimer   = 240;
        u.reactionDelay    = Math.floor(Math.random() * 15) + 5;
        // Mirror the keyboard path: remember what shape this unit now holds
        // so a later drag-to-form (see executeBoxFormationMove in
        // battlefield_commands.js) can detect and preserve/redraw it
        // instead of resetting to the ignore-type default grid.
        u.assignedFormationStyle = style;
      });
      this._revertRobot(); // real formation command issued — robot reverts to manual
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
      this._revertRobot(); // real move order issued — robot reverts to manual
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

      // SURGERY: selecting units here never ran lazyTakeManualControl, so a
      // unit frozen at siege start (disableAICombat/_lazyManual both true —
      // see enterSiegeBattlefield) stayed frozen even after being selected
      // and given an order: processTacticalOrders' very first line bails on
      // disableAICombat before it ever looks at orderType. Selection must
      // clear both flags the same way battlefield_commands.js's own
      // group-select does, or orders from this control scheme silently do
      // nothing.
      if (typeof lazyTakeManualControl === 'function') {
        lazyTakeManualControl(all.filter(u => u.selected));
      }

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

    // Backdrop — closes Help / the unit-stats popup on outside tap. Trays
    // (cmd/form/tactic/select) deliberately do NOT close from this anymore
    // — see _toggleTray's own comment for why — so this list is shorter
    // than it used to be on purpose, not an oversight.
    const bd = _mkEl('div', 'mc3-backdrop');
    root.appendChild(bd);
    bd.addEventListener('pointerdown', () => {
      UnitCards.closePopup();
      Help.close();
      bd.classList.remove('act');
    });

// Survivor HUD
    const survHud = _mkEl('div', 'mc3-survivor-hud');
    survHud.innerHTML = `
      <div class="mc3-surv-row mc3-surv-ally">🙂 <span id="mc3-ally-count">0</span></div>
      <div class="mc3-surv-row mc3-surv-foe">😠 <span id="mc3-foe-count">0</span></div>
      <div class="mc3-surv-row mc3-surv-day" id="mc3-day-row">🗓 Day <span id="mc3-day-count">1</span></div>
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

    // Formation-drag arrow-grid overlay (Total War style), replaces the
    // rectangle for the "units selected → forming up" case. SVG so each
    // per-unit arrow can rotate to the drag angle — a CSS-box border can't
    // express a facing direction the way an SVG line/marker can.
    const fl = D.createElementNS('http://www.w3.org/2000/svg', 'svg');
    fl.id = 'mc3-formline';
    root.appendChild(fl);

    // Drag-ghost card (floating card that follows the dragging finger)
    const dg = _mkEl('div', 'mc3-drag-card');
    dg.id = 'mc3-drag-card';
    root.appendChild(dg);

    // Floating AI-tactic emoji layer (battlefield overlay, not chrome — see
    // AIEmoji in Section 7b). Lives directly on root like mc3-selbox above,
    // not nested inside any tray/HUD element that might get hidden/z-clipped.
    const aiLayer = _mkEl('div', 'mc3-ai-emoji-layer');
    root.appendChild(aiLayer);
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

  // Formation-tray highlight + Depth visibility sync (called from the tick
  // loop, throttled — see the call site below). Reads the shared formation
  // style the exact same way battlefield_commands.js's own
  // executeBoxFormationMove/preview code does (_getSharedDragFormationStyle
  // — a unit-count===0 or mixed-style selection yields "dragGrid", meaning
  // no formation is "active"), so this can never disagree with what the
  // blue-arrow preview/commit actually does. Two effects, always applied
  // together from the same single style read:
  //   1. Yellow outline (.mc3-formation-active) on whichever of the 5
  //      formation buttons matches (including BOX/square) — none
  //      highlighted for "dragGrid".
  //   2. Depth button VISIBILITY (reworked per direct request — depth is
  //      now a real, consumed row-count for TIGHT/STANDARD/LOOSE, not just
  //      a plain-drag-only setting, so hiding it for shapes it doesn't
  //      apply to is now the correct read of "only visible for tight,
  //      standard, loose"): visible for dragGrid/tight/standard/line,
  //      hidden entirely for circle/square — those two never read
  //      window._mc3FormationDepth (circle's ring math and square's own
  //      sideSize are both purely unit-count driven, confirmed in
  //      calculateFormationOffsets), so there's nothing left to disable-
  //      and-show-inert the way the button used to; it simply isn't
  //      relevant and doesn't appear, exactly like the FORM tray's other
  //      style-specific controls would.
  function _syncFormationUI() {
    const depthBtn = D.getElementById('mc3-depth-btn');
    if (!depthBtn) return; // not in battle / bar not built yet
    let style = 'dragGrid';
    if (typeof G !== 'undefined' && typeof G.selected === 'function' &&
        typeof _getSharedDragFormationStyle === 'function') {
      const sel = G.selected();
      if (sel && sel.length > 0) style = _getSharedDragFormationStyle(sel);
    }
    ['tight', 'standard', 'line', 'circle', 'square'].forEach(s => {
      const btn = D.getElementById('mc3-formbtn-' + s);
      if (btn) btn.classList.toggle('mc3-formation-active', s === style);
    });

    depthBtn.dataset.activeStyle = style;
    const hideDepth = (style === 'circle' || style === 'square');
    depthBtn.style.display = hideDepth ? 'none' : '';
    if (!hideDepth) {
      const lbl = D.getElementById('mc3-depth-lbl');
      if (lbl) lbl.textContent = `DEPTH ${window._mc3FormationDepth}`;
    }
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

    // 6b) AI Tactics — opens the SKIRM/HOLD/CHARGE/ADAPT/CANCEL tray (see
    // the ★ AI TACTIC GROUPS ★ comment block above Cmd.setAiTactic for the
    // full behavior breakdown). Mirrors the formation button exactly.
    row.appendChild(_mkBtn(
      '<span class="ticon" style="font-size: clamp(1.4rem, 4.5vw, 1.8rem); line-height: 1; margin: 0;">🧠</span>',
      'mc3-tactic-toggle', 'mc3-toggle-btn',
      () => _toggleTray('tactic')
    ));

    // 7) Group 5 — SELECT ALL. Kept standalone per direct request ("except
    // select all formation") — everything else (1–4) collapses into the
    // dropdown below instead of sitting in the main row as 4 separate icons.
    row.appendChild(_mkBtn(
      `<span style="font-size: clamp(1.1rem, 3.8vw, 1.5rem); line-height: 1;">👥</span>`,
      'mc3-g5',
      'mc3-gbtn',
      () => Cmd.selectGroup(5)
    ));

    // 8) Individual-selection dropdown — REWORKED per direct request: groups
    // 1–4 (Infantry/Ranged/Cavalry/Gunpowder) used to each get their own
    // button in the main row; that's 4 icons of clutter for something used
    // less often than SELECT ALL. Collapsed into one 🎯 toggle that opens a
    // tray (mc3-select-tray, styled/behaved exactly like the formation tray)
    // listing the same 4 types. Each option still just calls
    // Cmd.selectGroup(i) — same selection logic as before (all FRIENDLY
    // units of that type on the field), completely unchanged.
    row.appendChild(_mkBtn(
      '<span class="ticon" style="font-size: clamp(1.4rem, 4.5vw, 1.8rem); line-height: 1; margin: 0;">🖱️</span>',
      'mc3-select-toggle', 'mc3-toggle-btn',
      () => _toggleTray('select')
    ));

    // 9) Hover-panel toggle — beside the unit-card-toggle (🪪) per direct
    // request. Click-toggles window.__hoverButtonHeld (a latch, unlike
    // spacebar's held-down semantics) and mirrors it into
    // window.__hoverPanelActive, the single flag unit-hover-tooltip.js reads.
    // Kept independent of the spacebar path — releasing Space never turns
    // this back off, and clicking this again never affects Space.
    if (typeof window.__hoverButtonHeld !== 'boolean') window.__hoverButtonHeld = false;
    row.appendChild(_mkBtn(
      '<span class="ticon" style="font-size: clamp(1.4rem, 4.5vw, 1.8rem); line-height: 1; margin: 0;">🔎</span>',
      'mc3-hover-toggle', 'mc3-toggle-btn',
      () => {
        window.__hoverButtonHeld = !window.__hoverButtonHeld;
        window.__hoverPanelActive = window.__hoverButtonHeld;
        D.getElementById('mc3-hover-toggle')?.classList.toggle('tray-open', window.__hoverButtonHeld);
        Cmd._audio('ui_click');
      }
    ));

    // 10) Stack-mode toggle button
    row.appendChild(_mkBtn(
      '<span class="ticon" style="font-size: clamp(1.4rem, 4.5vw, 1.8rem); line-height: 1; margin: 0;">🪪</span>',
      'mc3-stack-btn', 'mc3-toggle-btn',
      () => UnitCards.cycleStackMode()
    ));

    bar.appendChild(row);

    // ── CMD tray ─────────────────────────────────────────────────────────
    const ct = _mkEl('div', 'mc3-cmd-tray', 'mc3-tray');
    [
      { icon: '🏃', lbl: 'ADVANCE', fn: () => Cmd.charge()  },
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

// ── Formation tray ──────────────────────────────────────────────────
    // Tight/Standard/Loose/Circle/BOX. BOX ('square' style internally) is
    // back as its own button per direct request — it was dropped from the
    // tray in an earlier pass but calculateFormationOffsets' "square" case
    // was left fully intact the whole time (still reachable via HOLD's
    // auto-style cycling), so restoring the button needed no engine work,
    // just wiring it back in with its original label.
    const ft = _mkEl('div', 'mc3-form-tray', 'mc3-tray');
    [
      { icon: '🧱', lbl: 'TIGHT',    style: 'tight' },
      { icon: '═',   lbl: 'STANDARD', style: 'standard' },
      { icon: '↔️', lbl: 'LOOSE',    style: 'line' },
      { icon: '⭕',   lbl: 'CIRCLE',   style: 'circle' },
      { icon: '⬜',   lbl: 'BOX',     style: 'square' },
    ].forEach(f => {
      ft.appendChild(_mkBtn(
        `<span class="ticon">${f.icon}</span><span class="tlbl">${f.lbl}</span>`,
        'mc3-formbtn-' + f.style, 'mc3-tray-btn', () => Cmd.formation(f.style)
      ));
    });
    // Drag-formation / row-depth toggle. Two consumers now, both driven by
    // this one window._mc3FormationDepth value:
    //   - Plain arrow-grid drag with no named formation selected
    //     (executeBoxFormationMove / calculateFormationOffsets' "dragGrid"
    //     case in battlefield_commands.js) — the original use.
    //   - TIGHT/STANDARD/LOOSE (per direct request: "rank depth is NOT
    //     working... depths should correspond to the blue arrow depth...
    //     trying to match the closest equivalent"). Each role-group's
    //     column count is now solved BACKWARD from the requested depth via
    //     assignBlock's own row formula (rows = ceil(count/cols), inverted
    //     to cols = ceil(count/rows)) instead of a hardcoded column count —
    //     see calculateFormationOffsets' depthCols() helper in
    //     battlefield_commands.js. Ceil-based solving lands each group on
    //     the closest depth actually reachable for its size (e.g. 5 units
    //     at a requested depth of 4 settle on 3 rows — 2/2/1 — the nearest
    //     achievable shape, not an exact miss silently ignored) rather than
    //     requiring an exact division.
    // VISIBILITY (reworked per direct request — "rank depth emoji should
    // only be visible for tight, standard and loose... not visible for
    // square or circle"): _syncFormationUI (below) hides this button
    // entirely for circle/square, since neither reads this value at all —
    // circle's ring math and square's own sideSize are both purely
    // unit-count driven. Visible for dragGrid/tight/standard/loose, all
    // four of which now genuinely use it.
    //
    // FIX ("DEPTH 4 is disabled to be toggled unless theres 40 or more
    // units... a small message pop to explain... if units are low enough
    // it just goes back to depth 1" — direct request, gating rule per
    // direct follow-up: "do what mathematically makes sense... factor in
    // the selection of non perfectly divisible as stragglers"): a bare
    // "N×constant" lookup table doesn't actually capture what makes a
    // depth wrong for a given count — e.g. depth 3 on 8 units gives
    // cols=3, a real 3/3/2 formation (last row 67% full, genuinely fine),
    // while depth 4 on 13 units gives cols=4, a 4/4/4/1 formation (last
    // row 25% full — a lone straggler, not a real 4th rank).
    //
    // BUG FIX ("MOMENT I CLICK TIGHT STANDARD OR LOOSE IT LOCKS TO SINGLE
    // LINE... even with low units selected ruler depth can still be
    // toggled to 4; for example 3 units can do 4 depth" — direct report):
    // the first version of this check only measured the BACK ROW's fill
    // ratio, which is blind to the actual failure mode here. For n=3,
    // N=4: depthCols solves cols=ceil(3/4)=1 — a single column, i.e.
    // every unit stacked in one straight LINE, no depth at all. But with
    // cols=1, each "row" holds exactly 1 unit out of a 1-wide row, which
    // is a trivially "100% full" last row by the old ratio check, so it
    // always passed regardless of how degenerate the shape actually was.
    // The real requirement for a depth to mean anything is cols >= 2 — at
    // least two units side by side, an actual block instead of a column —
    // checked FIRST, before the back-row fill-ratio check even runs.
    // Re-verified directly (not just re-read) against n=3/8/13/20 at every
    // depth 1-4 after this fix: 3 units now correctly rejects depth 3 AND
    // 4 (both would still collapse to cols=1), matching the exact bug
    // report, while 8/13/20 continue to behave as previously verified.
    // Depth 1 is always accepted unconditionally — cols=n there by
    // definition (everyone in one row), which is a valid, real shape, not
    // a collapse.
    //
    // Checked against the WHOLE selection (G.selected().length) per
    // direct request, not per role-bucket — a mixed-role selection's
    // sub-counts are smaller than the whole anyway, so gating on the
    // whole is the more permissive, simpler-to-reason-about reading of
    // "do I have enough units for this depth." Every click re-checks
    // fresh from the CURRENT selection (per direct request: "every click
    // recheck") rather than remembering which depths were blocked last
    // time — reselecting more units immediately unlocks a deeper cycle on
    // the very next click, no stale state.
    function _isDepthWorthwhileFor(n, N) {
      if (n <= 0) return false;
      if (N === 1) return true; // always a valid shape — everyone in one row
      const cols = Math.ceil(n / N);
      if (cols < 2) return false; // would collapse to a single-file column, not a real block
      const fullRows = Math.floor(n / cols);
      const lastRowCount = n - fullRows * cols;
      const lastRowFillRatio = lastRowCount > 0 ? (lastRowCount / cols) : 1;
      // Back rank isn't a near-empty straggler (at least half a row).
      return lastRowFillRatio >= 0.5;
    }
    if (typeof window._mc3FormationDepth !== 'number') window._mc3FormationDepth = 2;
    const depthBtn = _mkBtn(
      `<span class="ticon">📏</span><span class="tlbl" id="mc3-depth-lbl">DEPTH ${window._mc3FormationDepth}</span>`,
      'mc3-depth-btn', 'mc3-tray-btn',
      () => {
        const n = G.selected().length;
        const nextDepth = (window._mc3FormationDepth % 4) + 1; // 1→2→3→4→1
        if (nextDepth > 1 && !_isDepthWorthwhileFor(n, nextDepth)) {
          _showToast(`Not enough units for DEPTH ${nextDepth} — back to DEPTH 1`);
          window._mc3FormationDepth = 1;
        } else {
          window._mc3FormationDepth = nextDepth;
        }
        const lbl = D.getElementById('mc3-depth-lbl');
        if (lbl) lbl.textContent = `DEPTH ${window._mc3FormationDepth}`;
        Cmd._audio('ui_click');
      }
    );
    ft.appendChild(depthBtn);
    bar.appendChild(ft);

    // ── AI Tactics tray (see Cmd.setAiTactic's ★ AI TACTIC GROUPS ★ comment
    // block above for the full behavior breakdown) ─────────────────────────
    // FIX: this used to read SKIRM/STAND GROUND/MELEE CHARGE/GENERAL with
    // tactic:'general' for the last one — 'general' matched nothing in
    // Cmd._aiTacticLabel or ai_categories.js's aiTacticGroup checks (both
    // key off 'auto'), so pressing that button silently tagged units with a
    // value nothing else recognized. Relabeled to match the rest of the
    // codebase and the ADAPT terminology used throughout.
    const tt = _mkEl('div', 'mc3-tactic-tray', 'mc3-tray');
    [
      { icon: '🤾', lbl: 'SKIRM',        tactic: 'skirmish' },
      { icon: '✋', lbl: 'HOLD', tactic: 'stand_ground' },
      { icon: '⚔️', lbl: 'CHARGE', tactic: 'melee_charge' },
      { icon: '🧠', lbl: 'ADAPT',      tactic: 'auto' },
      { icon: '🛡️', lbl: 'SHIELD',      tactic: 'shield' },
      { icon: '🚫', lbl: 'CANCEL',       tactic: null },
    ].forEach(t => {
      tt.appendChild(_mkBtn(
        `<span class="ticon">${t.icon}</span><span class="tlbl">${t.lbl}</span>`,
        null, 'mc3-tray-btn',
        () => t.tactic ? Cmd.setAiTactic(t.tactic) : Cmd.cancelAiTactic()
      ));
    });
    bar.appendChild(tt);

    // ── Individual-selection tray (Infantry/Ranged/Cavalry/Gunpowder) ─────
    // Replaces the old 4 standalone group buttons (🪓🏹🐎🔥) that used to
    // sit in the main row per direct request — same Cmd.selectGroup(n) call,
    // same behavior (selects every FRIENDLY unit of that type on the field),
    // just tucked behind the 🎯 dropdown so the main row is less cluttered.
    // SELECT ALL (group 5, 👥) deliberately stays OUT of this tray and keeps
    // its own main-row button, per direct request.
    const st = _mkEl('div', 'mc3-select-tray', 'mc3-tray');
    [
      { icon: '🪓', lbl: 'INFANTRY', num: 1 },
      { icon: '🏹', lbl: 'RANGED',   num: 2 },
      { icon: '🐎', lbl: 'CAVALRY',  num: 3 },
      { icon: '🔥', lbl: 'GUNPOWDER', num: 4 },
    ].forEach(g => {
      st.appendChild(_mkBtn(
        `<span class="ticon">${g.icon}</span><span class="tlbl">${g.lbl}</span>`,
        `mc3-g${g.num}`, 'mc3-tray-btn',
        () => Cmd.selectGroup(g.num)
      ));
    });
    bar.appendChild(st);

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
          ['👥',     'Select every controllable unit.'],
          ['🎯',       'Open a dropdown to select all friendly units of one type: Infantry, Ranged, Cavalry, or Gunpowder.'],
		  ['🏯 / ⚓', 'AI mode for Siege and Naval battles.'],
 		  ['🤖 / 🛑', 'AI toggle for Land battles.'],
          ['🚩',       'Open the Formations tray. Requires 2 or more units selected.'],
          ['🥁',      'Open the Commands tray.'],
          ['🧠',      'Open the AI Tactics tray — assigns a standing behavior instead of a one-shot order.'],
          ['🔎',       'Toggle the unit hover-stats panel on/off. While on (or while holding Space), hovering a unit on the battlefield shows its live stats.'],
          ['🪪', 'Cycle through the three unit-card display modes. See Unit Cards section below.'],
          ['?',           'Toggle this help screen. The game is NOT paused.'],
        ],
      },
      {
        heading: 'Formations Tray',
        rows: [
          ['TIGHT',    'Tight defensive wall — shields and infantry packed close. Best with heavy-armour front line.'],
          ['STANDARD', 'Standard balanced formation — roles separated into sensible positions.'],
          ['LOOSE',    'Spread-out battle line — maximises frontage to prevent flanking.'],
          ['CIRCLE',   'Circular orb formation — all-round defence in open terrain.'],
          ['BOX',      'Square blob — units group by count alone, no rows/depth. Room for cavalry inside.'],
          ['📏 DEPTH', 'Sets how many rows deep the formation is, for TIGHT / STANDARD / LOOSE and for a plain drag-formation move. Cycles 1-4, but a deeper level only unlocks once your selection has enough units to fill it out — too few and it drops back to DEPTH 1 with a message.'],
        ],
      },
      {
        heading: 'Commands Tray',
        rows: [
          ['ADVANCE', 'Selected units immediately seek and engage the nearest enemy — a single push, no formation, no re-evaluation after it starts. Ranged units stop and fire at roughly half their weapon range rather than closing to melee; melee units close all the way in.'],
          ['STOP',    'Selected units immediately halt in place. Not an AI posture — they\u2019ll still fight back in melee self-defence range or if an enemy closes to point-blank, but they won\u2019t chase.'],
          ['RETREAT', 'Each selected unit falls back toward whichever battlefield edge is nearest to it — a mixed selection can flee in different directions at once.'],
          ['FOLLOW',  'Selected units form up on the commander in a square and stay with them as they move.'],
        ],
      },
      {
        heading: 'AI Tactics Tray',
        rows: [
          ['SKIRM',   'Ranged units keep their distance and kite; melee units target whichever enemy is most isolated from support, instead of just the nearest.'],
          ['HOLD',    'Units form up around their own position and hold it, fighting anything that comes into range without chasing.'],
          ['CHARGE',  'A standing aggressive posture. Ranged units close to point-blank range instead of kiting at a distance; melee units fight as normal.'],
          ['ADAPT',   'Hands the unit back to the automatic tactical AI (same engine as the 🤖 toggle) to pick its own behavior.'],
          ['SHIELD',  'Cautious formation advance — units close ranks and move together toward the enemy instead of rushing individually.'],
          ['CANCEL',  'Clears any AI tactic tag from the selection, returning units to plain manual control.'],
        ],
      },
      {
        heading: '⌨️ Keyboard Shortcuts (desktop)',
        rows: [
          ['1 – 4',   'Select all Infantry / Ranged / Cavalry & Beasts / Gunpowder — the same groups as the 🎯 dropdown, keyboard-only (no on-screen button for these).'],
          ['5',       'Select every controllable unit — same as the 👥 button.'],
          ['Z / X / V / C / B', 'Form the current selection into TIGHT / STANDARD / LOOSE / CIRCLE / BOX in place — same shapes as the Formations tray buttons, keyboard-only. Requires 2+ units selected.'],
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
  ['Space (hold)', 'While held (desktop only), hovering a unit shows its live stats — same panel as the 🔎 toggle.'],

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
  // Lookup table instead of the old cmd/form/tactic ternary chain — extended
  // to include 'select' (the new Infantry/Ranged/Cavalry/Gunpowder dropdown)
  // without hardcoding a 4th special case through every branch.
  const _TRAY_IDS = {
    cmd:    { tray: 'mc3-cmd-tray',    toggle: 'mc3-cmd-toggle' },
    form:   { tray: 'mc3-form-tray',   toggle: 'mc3-form-toggle' },
    tactic: { tray: 'mc3-tactic-tray', toggle: 'mc3-tactic-toggle' },
    select: { tray: 'mc3-select-tray', toggle: 'mc3-select-toggle' },
  };

  // REWORKED per direct request: trays used to add/remove the shared
  // backdrop's 'act' class, which made the backdrop intercept-and-close on
  // ANY tap on the bare battlefield — "just clicking the main battle screen
  // does NOT keep them disappear[ing]" was the exact complaint. Trays no
  // longer touch the backdrop at all. They only ever close two ways now:
  //   1. The SAME toggle button that opened them is clicked again (the
  //      `was` check below already does this — unchanged).
  //   2. A DIFFERENT toggle button is clicked, which opens its own tray —
  //      the "close everything, then open the new one" loop below already
  //      does this too — unchanged.
  // A plain tap on the battlefield now passes straight through to the
  // canvas (unit selection, move orders, etc.) exactly like it would with
  // no tray open at all, since the backdrop is never made pointer-events:
  // auto for tray state anymore. The backdrop still exists and still works
  // exactly as before for Help and the unit-stats popup — see Help.open/
  // close and UnitCards.showPopup/closePopup — those are deliberately NOT
  // "secondary tables" and keep their outside-tap-to-dismiss behavior.
  function _toggleTray(name) {
    const entry = _TRAY_IDS[name];
    if (!entry) return;
    const tray = D.getElementById(entry.tray);
    if (!tray) return;
    const was  = tray.classList.contains('open');

    Object.values(_TRAY_IDS).forEach(({ tray: trayId, toggle: toggleId }) => {
      D.getElementById(trayId)?.classList.remove('open');
      D.getElementById(toggleId)?.classList.remove('tray-open');
    });

    if (!was) {
      tray.classList.add('open');
      D.getElementById(entry.toggle)?.classList.add('tray-open');
      _openTray = name;
    } else {
      _openTray = null;
    }
  }

  function _closeTray(name) {
    const entry = _TRAY_IDS[name];
    if (!entry) return;
    D.getElementById(entry.tray)?.classList.remove('open');
    D.getElementById(entry.toggle)?.classList.remove('tray-open');
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
      // No longer needs to check _openTray — trays haven't touched the
      // backdrop's 'act' state since the rework above, so Help is the only
      // remaining thing (besides the unit popup) that can be holding it on.
      D.getElementById('mc3-backdrop')?.classList.remove('act');
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

        // Day counter — Survival Mode only, hidden for every other battle type.
        const dayRow = D.getElementById('mc3-day-row');
        if (dayRow) {
          if (window.__IS_SURVIVAL_BATTLE__) {
            dayRow.style.display = 'flex';
            const dayEl = D.getElementById('mc3-day-count');
            if (dayEl) dayEl.textContent = window.__survivalDay || 1;
          } else {
            dayRow.style.display = 'none';
          }
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
if (role === 'CAVALRY' && !unitKey.toLowerCase().includes('cannon')) {
  visType = unitKey === "War Elephant" ? "elephant" : (unitKey.includes("Camel") ? "camel" : "cavalry");
}
	  
	  else if (role === 'HORSE_ARCHER') visType = "horse_archer";
      else if (role === 'PIKE' || unitKey.includes("Glaive")) visType = "spearman";
      else if (role === 'SHIELD') visType = "sword_shield";
      else if (role === 'TWO_HANDED') visType = "two_handed";
      else if (role === 'CROSSBOW') visType = "crossbow";
      else if (role === 'FIRELANCE') visType = "firelance";
      else if (role === 'ARCHER') visType = "archer";
else if (role === 'GUNNER' || unitKey.toLowerCase().includes('cannon')) visType = "gun"; // 
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
      // Cannon's role is ROLES.MOUNTED_GUNNER ("mounted_gunner") and is unique
      // to that unit. Must be checked BEFORE the cav/mount pattern below —
      // "mounted_gunner" contains "mount" and was false-matching cavalry
      // first, which is why the Cannon card showed a horse rider.
      if (s.match(/mounted_gunner/))
		  return '🎆';
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
      if (s.match(/(hand|rocket|firelance|cannon)/))           
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
      // SURGERY: same fix as the numeric-key handler above — without this,
      // units frozen at siege start (disableAICombat/_lazyManual) stayed
      // frozen after being selected via a group card, and any order given
      // afterward was silently swallowed by processTacticalOrders.
      if (typeof lazyTakeManualControl === 'function') {
        lazyTakeManualControl(grpUnits);
      }
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
  //  SECTION 7b — AI TACTIC FLOATING EMOJI
  //   Per direct request: the assigned AI tactic (Skirm/Hold/Charge/Adapt)
  //   no longer shows as a small badge on the unit's roster card — instead
  //   it floats directly above the unit's HEAD on the battlefield canvas
  //   itself, tracking the unit, staying visible while unselected, and
  //   disappearing only when the tactic is actually cancelled or the unit
  //   dies (see the CANCELLATION list in Cmd's ★ AI TACTIC GROUPS ★ comment
  //   block). Driven purely by unit.aiTacticGroup — never by u.selected —
  //   which is exactly the "Selected state" vs "AI assignment state"
  //   separation called for.
  //
  //   Deliberately unthrottled (unlike UnitCards.update()'s 350ms throttle,
  //   which redraws a whole scrollable card list): this only iterates
  //   however many units currently carry a tactic — realistically a handful
  //   at a time — so a full-rate per-frame update keeps the tracking smooth
  //   as units move, at negligible cost.
  // ==========================================================================
  const AIEmoji = {
    _nodes: {}, // uid -> { el, tactic } currently mounted in the DOM

    // World-space vertical gap between a unit's own x/y anchor (its feet/
    // base — see Cmd._moveToWorld's inverse below for the matching
    // world<->screen convention already used for touch-to-world conversion
    // elsewhere in this file) and where the emoji should float. Approximate
    // — this engine's actual sprite head height isn't exposed to this file
    // (drawInfantryUnit/drawCavalryUnit live elsewhere) — nudge this if the
    // emoji sits visibly too high or low above the sprite in your build.
    _Y_OFFSET_WORLD: 46,
    _BASE_FONT_PX:   18, // approximate "same size as the unit's head" at zoom 1

    _layer() { return D.getElementById('mc3-ai-emoji-layer'); },

    _removeAll() {
      const layer = this._layer();
      if (layer) layer.innerHTML = '';
      this._nodes = {};
    },

    // PERF FIX ("zoom is somewhat laggy... is there any optimization
    // possible"): this used to call G.allPlayerUnits() (its own full-array
    // filter() over EVERY unit on the battlefield, both sides) and then run
    // a SECOND filter() on top of that result — two full array scans plus
    // two array allocations, every single requestAnimationFrame tick,
    // regardless of whether any unit was even tagged. That's pure waste on
    // the vast majority of frames (most of a battle has few or zero tactic-
    // tagged units), and it's exactly the kind of steady per-frame cost that
    // becomes most visible while the camera is actively moving/zooming,
    // since that's when every tagged unit's screen position actually
    // changes and the work can't be masked by an unchanged result.
    // Deliberately NOT solved with UnitCards.update()'s 350ms throttle
    // pattern — this overlay's entire job is staying glued to a moving
    // camera in real time, so throttling the position math itself would
    // make the emoji visibly lag behind the unit/camera during a zoom or
    // pan, the opposite of the goal. Instead: single pass directly over
    // e.units (no intermediate allocation), skip everything when nothing's
    // tagged, and skip the cleanup pass's Object.keys() allocation unless a
    // node is actually mounted.
    update() {
      const layer = this._layer();
      if (!layer) return;

      if (!G.isBattle()) {
        if (Object.keys(this._nodes).length) this._removeAll();
        return;
      }

      const canvas = D.getElementById('gameCanvas');
      if (!canvas) return;

      const e = G.env();
      if (!e || !Array.isArray(e.units)) {
        if (Object.keys(this._nodes).length) this._removeAll();
        return;
      }

      // Fast path: nothing tagged and nothing mounted — the common case for
      // long stretches of a battle. Skips the position math and the camera
      // reads entirely rather than doing them for an empty result.
      let anyTagged = false;
      for (let i = 0; i < e.units.length; i++) {
        const u = e.units[i];
        if (u.aiTacticGroup && !u.isCommander && u.side === 'player' && u.hp > 0) { anyTagged = true; break; }
      }
      if (!anyTagged) {
        if (Object.keys(this._nodes).length) this._removeAll();
        return;
      }

      // FIX: this used to read W.camera.x/y/zoom, which caused the ~200px
      // gap between the emoji and the actual unit sprite reported after
      // testing. The real render loop (sandboxmode_update.js's
      // window.draw()) does:
      //   ctx.translate(canvas.width/2, canvas.height/2);
      //   ctx.scale(zoom, zoom);
      //   ctx.translate(-player.x, -player.y);
      // — i.e. the true camera anchor is window.player.x/y plus the bare
      // window.zoom global. window.camera is a separate, disconnected
      // object nothing in the actual draw loop reads from (confirmed: no
      // file anywhere syncs camera.x/y to player.x/y, or camera.zoom to
      // window.zoom — mobile_ui.js's pinch-to-zoom writes to camera.zoom,
      // which the draw loop never reads either, so it's likely dead code
      // too, left untouched here since that's a separate issue from what
      // was reported).
      const px  = (W.player && typeof W.player.x === 'number') ? W.player.x : 0;
      const py  = (W.player && typeof W.player.y === 'number') ? W.player.y : 0;
      const z   = (typeof W.zoom === 'number' && W.zoom > 0) ? W.zoom : 1;
      const cw  = canvas.width  / 2;
      const ch  = canvas.height / 2;

      // Single pass directly over e.units — no intermediate allPlayerUnits()
      // + filter() array allocations. Living, tagged player units only —
      // commander excluded (never tactic-assignable via the normal
      // selection/group flow), dead units are simply skipped by the same
      // hp>0 check allPlayerUnits() used to apply.
      const seen = {};
      for (let i = 0; i < e.units.length; i++) {
        const u = e.units[i];
        if (!(u.aiTacticGroup && !u.isCommander && u.side === 'player' && u.hp > 0)) continue;

        const uid = String(u.id ?? u.unitType);
        seen[uid] = true;

        let entry = this._nodes[uid];
        if (!entry) {
          const el = D.createElement('span');
          el.className = 'mc3-ai-emoji';
          layer.appendChild(el);
          entry = this._nodes[uid] = { el, tactic: null };
        }

        if (entry.tactic !== u.aiTacticGroup) {
          entry.tactic = u.aiTacticGroup;
          entry.el.textContent = Cmd._aiTacticEmoji[u.aiTacticGroup] || '';
        }

        // World -> screen: exact inverse of Cmd._moveToWorld's screen ->
        // world formula further down this file (same camera fix applied
        // there too), so this layer always agrees with where a tap would
        // actually land.
        const sx = cw + z * (u.x - px);
        const sy = ch + z * (u.y - this._Y_OFFSET_WORLD - py);
        const fontPx = Math.max(11, Math.min(34, this._BASE_FONT_PX * z));

        entry.el.style.fontSize = fontPx + 'px';
        // translate(-50%,-100%) anchors the emoji's bottom-center on (sx,sy)
        // — i.e. "a few pixels above the unit's head" sits right at that
        // point, with the glyph itself occupying the space above it.
        entry.el.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -100%)`;
      }

      // Drop any mounted node whose unit is no longer tagged/alive —
      // cancelled tactic, death, or battle end all resolve here immediately
      // (next frame), with nothing left behind at a stale position. Only
      // allocates Object.keys() when there's actually something mounted to
      // check, rather than every frame regardless.
      const mountedIds = Object.keys(this._nodes);
      if (mountedIds.length) {
        mountedIds.forEach(uid => {
          if (!seen[uid]) {
            this._nodes[uid].el.remove();
            delete this._nodes[uid];
          }
        });
      }
    },
  };
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
      'mc3', 'mc3-hbar', 'mc3-hrow', 'mc3-cmd-tray', 'mc3-form-tray', 'mc3-tactic-tray', 'mc3-select-tray',
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
            const fl = D.getElementById('mc3-formline');
            if (fl) fl.style.display = 'none';
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
          const selUnitsForPreview = G.selected();
          const selCount = selUnitsForPreview.length;
          if (selCount > 0) {
            // FORMATION DRAG: one small blue arrow per selected unit,
            // arranged in the exact shape battlefield_commands.js's
            // executeBoxFormationMove will commit to on release — mirrors
            // the desktop preview exactly (same computeFormationPreviewSlots
            // math, style-aware: a remembered circle/square/tight/standard
            // shape on the selection previews as that shape here too, not
            // just the plain default grid). No J/K-equivalent rotation
            // gesture on mobile yet — twist-to-rotate is a separate,
            // harder gesture problem, deliberately not tackled here.
            const box = D.getElementById('mc3-selbox');
            if (box) box.style.display = 'none';
            const fl = D.getElementById('mc3-formline');
            if (fl && typeof computeFormationPreviewSlots === 'function') {
              const depth = (typeof window._mc3FormationDepth === 'number') ? window._mc3FormationDepth : 2;
              const style = (typeof _getSharedDragFormationStyle === 'function')
                ? _getSharedDragFormationStyle(selUnitsForPreview) : undefined;
              const grid = computeFormationPreviewSlots(selCount, this._boxStart.x, this._boxStart.y, pt.x, pt.y, depth, style);
              const ARROW_HALF_LEN = 9;
              let html = '<defs><marker id="mc3-mobile-arrowhead" markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto">' +
                '<path d="M0,0 L8,4 L0,8 L2.5,4 Z" fill="rgba(66,135,245,0.95)"/></marker></defs>';
              grid.slots.forEach(s => {
                const x1 = s.x - s.fx * ARROW_HALF_LEN, y1 = s.y - s.fy * ARROW_HALF_LEN;
                const x2 = s.x + s.fx * ARROW_HALF_LEN, y2 = s.y + s.fy * ARROW_HALF_LEN;
                html += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" ' +
                  'stroke="rgba(66,135,245,0.9)" stroke-width="2.5" stroke-linecap="round" ' +
                  'marker-end="url(#mc3-mobile-arrowhead)" />';
              });
              fl.innerHTML = html;
              fl.style.display = 'block';
            }
          } else {
            // BOX-SELECT: unchanged rectangle for selecting units on the map.
            const fl = D.getElementById('mc3-formline');
            if (fl) fl.style.display = 'none';
            const box = D.getElementById('mc3-selbox');
            if (box) {
              box.style.border = '2px dashed rgba(245,215,110,0.82)';
              box.style.background = 'rgba(245,215,110,0.06)';
              box.style.boxShadow = 'inset 0 0 10px rgba(245,215,110,0.08)';
              box.style.left   = Math.min(this._boxStart.x, pt.x) + 'px';
              box.style.top    = Math.min(this._boxStart.y, pt.y) + 'px';
              box.style.width  = Math.abs(pt.x - this._boxStart.x) + 'px';
              box.style.height = Math.abs(pt.y - this._boxStart.y) + 'px';
              box.style.display = 'block';
            }
          }
        }
      } else if (ids.length === 2) {
        // [Existing pinch-to-zoom logic remains unchanged]
        e.preventDefault();
        clearTimeout(this._boxTimer);
        this._boxActive = false;
        const box = D.getElementById('mc3-selbox');
        if (box) box.style.display = 'none';
        const fl = D.getElementById('mc3-formline');
        if (fl) fl.style.display = 'none';

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
      const fl = D.getElementById('mc3-formline');
      if (fl) fl.style.display = 'none';
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
      // FIX: was reading W.camera.x/y/zoom — the same disconnected object
      // that caused AIEmoji's ~200px offset (see the fix + comment in
      // AIEmoji.update() above for the full explanation). Double-tap-move
      // was silently sending units to the wrong world position by the same
      // margin. Matches the real render loop's camera anchor now:
      // window.player.x/y + the bare window.zoom global.
      const px = (W.player && typeof W.player.x === 'number') ? W.player.x : 0;
      const py = (W.player && typeof W.player.y === 'number') ? W.player.y : 0;
      const cw = canvas.width / 2;
      const ch = canvas.height / 2;
      const z = (typeof W.zoom === 'number' && W.zoom > 0) ? W.zoom : 1;
      const wx = (sx - cw) / z + px;
      const wy = (sy - ch) / z + py;
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
      // During naval battles (ocean/coastal), hide all land-battle RTS controls.
      // Ship is controlled via the mobile helm joysticks; formation orders are irrelevant.
      const isNaval  = !!window.inNavalBattle && !window.inRiverBattle;
      const inCamp   = !!(W.inCampMode);
      const root     = D.getElementById(ROOT);

      // Naval Escort minigame: the whole RTS root (return button included)
      // stays hidden during the autopiloted SAILING leg — there's nothing to
      // command and no battle to return from yet. It reappears on its own
      // once a pirate encounter flips the mode into COMBAT (inBattleMode
      // becomes true then, same as any other battle).
      const escort = window.NavalEscortMode;
      const inEscortSailing = !!(escort && escort.isActive && escort.isActive() &&
          escort.getState && escort.getState().state === 'SAILING');

      if (root) root.style.display = (inMenu || inEscortSailing) ? 'none' : '';

      if (inMenu || inEscortSailing) {
        Joystick.setVisible(false);
        UnitCards.setVisible(false);
        AIEmoji._removeAll();
        return;
      }

      // Hide the ↩️ return button while encamped; it reappears automatically
      // once packUpCamp() finishes and inCampMode returns to false.
      const pbtn = D.getElementById('mc3-pbtn');
      if (pbtn) pbtn.style.display = inCamp ? 'none' : '';

      // Keep joystick visible during naval for camera panning
      Joystick.setVisible(true);

      // mc3-g5 (SELECT ALL) is still its own main-row button. mc3-g1..4 now
      // live inside mc3-select-tray instead of the main row — that tray's
      // own display:none/.open handling (and the close-on-exit below)
      // already keeps them hidden outside battle, so they're deliberately
      // NOT in this loop anymore (there's nothing to individually toggle;
      // toggling a display:none child inside an already-hidden tray is a
      // no-op, but leaving the dead code in was misleading).
      const g5 = D.getElementById('mc3-g5');
      if (g5) g5.style.display = inBattle ? '' : 'none';
      ['mc3-form-toggle', 'mc3-cmd-toggle', 'mc3-stack-btn', 'mc3-tactic-toggle', 'mc3-select-toggle', 'mc3-hover-toggle'].forEach(id => {
        const el = D.getElementById(id);
        if (el) el.style.display = inBattle ? '' : 'none';
      });

      // Always close trays when not in battle
      if (!inBattle) {
        _closeTray('cmd');
        _closeTray('form');
        _closeTray('tactic');
        _closeTray('select');
        // Leaving battle also fully deactivates the hover panel — no reason
        // for it to stay latched on into the next mode/menu.
        window.__hoverButtonHeld = false;
        window.__hoverPanelActive = false;
        D.getElementById('mc3-hover-toggle')?.classList.remove('tray-open');
      }

      UnitCards.setVisible(inBattle);
      if (inBattle) UnitCards.update();
      AIEmoji.update(); // handles its own in-battle check + cleanup internally

      // Formation-tray highlight + Depth visibility sync — throttled like
      // UnitCards.update() (350ms) since this is pure UI polish, not a hot
      // gameplay path.
      const _nowFUI = Date.now();
      if (inBattle && (!W._mc3LastFUISync || _nowFUI - W._mc3LastFUISync >= 350)) {
        W._mc3LastFUISync = _nowFUI;
        _syncFormationUI();
      }
    }
  };

  function boot() {
    injectCSS();
    buildDOM();
    Joystick.mount();
    Gestures.mount();
    Loop.start();

    W.MobileControls = { version: VER, G, Cmd, Joystick, UnitCards, AIEmoji, Gestures, Help };
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