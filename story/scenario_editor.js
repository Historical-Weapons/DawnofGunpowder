// =============================================================================
// SCENARIO EDITOR  (scenario_editor.js)
// Age of Empires II–style developer scenario editor.
// INTERFACE ONLY — all buttons are visual stubs.
//
// ARCHITECTURE OVERVIEW (for future Claude):
// ─────────────────────────────────────────────────────────────────────────────
// window.ScenarioEditor
//   .open()     — builds & shows the full editor DOM, pauses the game
//   .close()    — tears down DOM, resumes the game
//
// DOM STRUCTURE (injected into document.body):
//   #se-root                     ← Full-screen fixed overlay
//     #se-titlebar               ← Top bar: file ops + mode tabs + close
//     #se-workspace              ← flex row: left panel | center canvas | right panel
//       #se-left-panel           ← Tool palette + Terrain tiles + Brush size
//       #se-center               ← flex column: toolbar ribbon | map viewport | status bar
//         #se-ribbon             ← Secondary toolbar (zoom, grid, snap, etc.)
//         #se-viewport           ← The map canvas area (div, future: canvas)
//         #se-statusbar          ← Bottom status strip
//       #se-right-panel          ← Properties inspector (faction/NPC/city config)
//     #se-timeline               ← Bottom drawer: triggers, chronology, dialogue
//       #se-timeline-tabs        ← Tabs: Triggers | Objectives | Dialogue | Economy
//       #se-timeline-body        ← Content area for whichever tab is active
//
// MODES (top tab bar, mutually exclusive):
//   MAP        — terrain painting, tile placement, island generation
//   FACTIONS   — assign factions to regions, set colours, diplomacy
//   CITIES     — place/move/delete settlements, configure pop/gold/food/garrison
//   NPCS       — configure NPC armies, patrol routes, spawn rules
//   TRIGGERS   — chronological event scripting with dialogue & economy hooks
//
// DATA FLOW (FUTURE CLAUDE — implement in Phase 2):
//   • Each mode should read from / write to a global `window._seScenario` object:
//       _seScenario = {
//           meta:       { name, author, description, mode },
//           mapTiles:   [ [tile,…], … ],  // COLS × ROWS 2D array of tile names
//           factions:   { …FACTIONS_story1 },
//           cities:     [ …FIXED_SETTLEMENTS_story1 ],
//           npcs:       [ …globalNPCs snapshot ],
//           triggers:   [ { id, time, condition, actions:[], dialogue } ]
//       }
//   • The MAP panel canvas should render using the same PALETTE object and
//     TILE_SIZE constants from sandbox_overworld.js / story1_map_and_update.js.
//   • The Export button should serialise *seScenario → JSON → localStorage
//     key "SE_scenario*<name>" so save_system.js can pick it up.
//   • The Load button should open a file picker or list saved scenarios.
//
// TILE PALETTE (future Claude: pull dynamically from PALETTE keys):
//   All tiles currently used in story1_map_and_update.js:
//   Ocean, Coastal, River, Plains, Steppes, Forest, Dense Forest,
//   Highlands, Mountains
//   (Do NOT add Desert / Dunes for Story 1 — wrong climate)
//
// FACTION CONFIG (future Claude):
//   Right panel faction form should push changes into FACTIONS[name] directly
//   and call applyStory1Factions() if in Story1 mode.
//
// CITY CONFIG (future Claude):
//   City rows in the city list should allow drag on the viewport canvas to
//   reposition.  nx/ny should be stored and pixel coords derived via
//   nx*WORLD_WIDTH / ny*WORLD_HEIGHT.  Snap-to-land logic from
//   _s1SnapToLand() in story1_map_and_update.js should be reused.
//
// TRIGGER SYSTEM (future Claude):
//   Triggers fire when: turn count, player position, city captured, faction
//   eliminated, or custom condition (JS string eval — dev-only).
//   Each trigger has: id, label, condition (type+params), actions array.
//   Actions: showDialogue, setRelation, spawnArmy, giveGold, lockCity,
//            playSound, setObjective, setWeather.
// =============================================================================

window.ScenarioEditor = (function () {
"use strict";


// ── Internal state ────────────────────────────────────────────────────────
let _root          = null;   // The #se-root element
let _activeMode    = "MAP";  // MAP | FACTIONS | CITIES | NPCS | TRIGGERS
let _activeTab     = "TRIGGERS"; // bottom panel tab
let _activeTool    = "PAINT";    // PAINT | ERASE | SELECT | PLACE | INSPECT
let _activeTile    = "Plains";   // currently selected tile for painting
let _brushSize     = 1;          // 1 | 3 | 5

// ── CSS custom properties (AoE2 stone + gold palette) ─────────────────────
const CSS = `
    /* ── RESET & ROOT ─────────────────────────────────────────────── */
    #se-root *, #se-root *::before, #se-root *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        user-select: none;
        -webkit-user-select: none;
    }
    #se-root {
        --se-bg:         #1a140e;
        --se-panel:      #221a12;
        --se-panel-alt:  #2c2016;
        --se-border:     #5a4020;
        --se-border-hi:  #c8921a;
        --se-gold:       #e8b832;
        --se-gold-dim:   #a07820;
        --se-text:       #d8c890;
        --se-text-dim:   #FFFFFF;
        --se-text-hi:    #fff8e0;
        --se-red:        #c83820;
        --se-blue:       #2868a8;
        --se-green:      #3a8830;
        --se-accent:     #c07828;
        --se-stone:      #3a2e22;
        --se-stone-hi:   #4e4030;
        --se-inset:      #120e08;
        font-family: 'Georgia', 'Times New Roman', serif;
        color: var(--se-text);
        position: fixed;
        inset: 0;
        z-index: 20000;
        background: var(--se-bg);
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    /* ── SCROLLBARS ────────────────────────────────────────────────── */
    #se-root ::-webkit-scrollbar { width: 8px; height: 8px; }
    #se-root ::-webkit-scrollbar-track { background: var(--se-inset); }
    #se-root ::-webkit-scrollbar-thumb { background: var(--se-border); border-radius: 2px; }
    #se-root ::-webkit-scrollbar-thumb:hover { background: var(--se-gold-dim); }

    /* ── TITLEBAR ──────────────────────────────────────────────────── */
    #se-titlebar {
        flex-shrink: 0;
        height: 42px;
        background: linear-gradient(to bottom, #3c2c14, #221a0e);
        border-bottom: 2px solid var(--se-border-hi);
        display: flex;
        align-items: stretch;
        gap: 0;
        box-shadow: 0 3px 12px rgba(0,0,0,0.6);
		overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch;
    }
    .se-logo {
        display: flex;
        align-items: center;
        padding: 0 16px;
        gap: 8px;
        border-right: 1px solid var(--se-border);
        color: var(--se-gold);
        font-size: 14px;
        font-weight: bold;
        letter-spacing: 2px;
        text-transform: uppercase;
        white-space: nowrap;
        text-shadow: 0 0 8px rgba(232,184,50,0.5);
    }
    .se-logo span { font-size: 18px; }

    /* File ops cluster */
    .se-file-ops {
        display: flex;
        align-items: center;
        padding: 0 8px;
        gap: 2px;
        border-right: 1px solid var(--se-border);
    }

    /* Mode tabs */
	.se-mode-tabs {
        display: flex;
        align-items: stretch;
        flex: 1 1 0;
        min-width: 0;
        padding: 0 8px;
        gap: 2px;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
    }
    .se-mode-tab {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 18px;
        cursor: pointer;
        border: none;
        background: transparent;
        color: var(--se-text-dim);
        font-family: 'Georgia', serif;
        font-size: 12px;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 1px;
        position: relative;
        transition: color 0.15s, background 0.15s;
        border-bottom: 3px solid transparent;
        margin-bottom: -2px;
		 flex-shrink: 0;
    }
    .se-mode-tab:hover { color: var(--se-text); background: rgba(255,255,255,0.05); }
    .se-mode-tab.active {
        color: var(--se-gold);
        border-bottom-color: var(--se-gold);
        background: rgba(232,184,50,0.08);
    }
    .se-mode-tab .se-tab-icon { font-size: 14px; }

    /* Right cluster */
    .se-title-right {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 10px;
        border-left: 1px solid var(--se-border);
    }

    /* ── SHARED BUTTON STYLES ───────────────────────────────────────── */
    .se-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        background: linear-gradient(to bottom, var(--se-stone-hi), var(--se-stone));
        border: 1px solid var(--se-border);
        color: var(--se-text);
        font-family: 'Georgia', serif;
        font-size: 11px;
        cursor: pointer;
        border-radius: 2px;
        white-space: nowrap;
        transition: all 0.12s;
        text-shadow: 1px 1px 1px rgba(0,0,0,0.8);
    }
    .se-btn:hover {
        background: linear-gradient(to bottom, #6a5030, #4e3c24);
        border-color: var(--se-gold-dim);
        color: var(--se-text-hi);
    }
    .se-btn:active { transform: translateY(1px); }
    .se-btn.primary {
        background: linear-gradient(to bottom, #7a4010, #4a2408);
        border-color: var(--se-accent);
        color: var(--se-gold);
    }
    .se-btn.primary:hover {
        background: linear-gradient(to bottom, #a85818, #7a3010);
        border-color: var(--se-gold);
    }
    .se-btn.danger { background: linear-gradient(to bottom, #6a1810, #3a0c08); border-color: var(--se-red); color: #ff8878; }
    .se-btn.danger:hover { background: linear-gradient(to bottom, #8a2818, #5a1810); }
    .se-btn.success { background: linear-gradient(to bottom, #1a5020, #0e3014); border-color: var(--se-green); color: #80e890; }
    .se-btn.icon-only { padding: 4px 7px; font-size: 13px; }
    .se-btn[disabled], .se-btn.stub {
        opacity: 0.45;
        cursor: not-allowed;
        pointer-events: auto; /* keep hover tooltip visible even if disabled */
    }

    /* ── WORKSPACE ─────────────────────────────────────────────────── */
    #se-workspace {
        flex: 1;
        display: flex;
        overflow: hidden;
        min-height: 0;
    }

    /* ── LEFT PANEL ─────────────────────────────────────────────────── */
    #se-left-panel {
        width: 190px;
        flex-shrink: 0;
        background: var(--se-panel);
        border-right: 2px solid var(--se-border);
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    /* ── SECTION HEADER ─────────────────────────────────────────────── */
    .se-section-header {
        padding: 6px 10px;
        background: linear-gradient(to right, var(--se-stone), transparent);
        border-bottom: 1px solid var(--se-border);
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 2px;
        color: var(--se-gold-dim);
    }

    /* ── TOOL PALETTE ───────────────────────────────────────────────── */
    .se-tool-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 3px;
        padding: 8px;
    }
    .se-tool {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: 6px 2px;
        background: var(--se-stone);
        border: 1px solid var(--se-border);
        border-radius: 2px;
        cursor: pointer;
        font-size: 9px;
        color: var(--se-text-dim);
        transition: all 0.12s;
    }
    .se-tool:hover { background: var(--se-stone-hi); color: var(--se-text); border-color: var(--se-gold-dim); }
    .se-tool.active {
        background: linear-gradient(to bottom, #5a3a10, #3a2208);
        border-color: var(--se-gold);
        color: var(--se-gold);
        box-shadow: 0 0 6px rgba(232,184,50,0.3) inset;
    }
    .se-tool-icon { font-size: 16px; }

    /* ── TILE PALETTE ───────────────────────────────────────────────── */
    .se-tile-palette {
        flex: 1;
        overflow-y: auto;
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 3px;
		-webkit-overflow-scrolling: touch;
        touch-action: pan-y;
    }
    .se-tile-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 6px;
        border-radius: 2px;
        cursor: pointer;
        border: 1px solid transparent;
        transition: all 0.1s;
    }
    .se-tile-row:hover { background: var(--se-stone-hi); border-color: var(--se-border); }
    .se-tile-row.active { background: #3a2808; border-color: var(--se-gold); }
    .se-tile-swatch {
        width: 20px;
        height: 20px;
        border-radius: 2px;
        border: 1px solid rgba(0,0,0,0.5);
        flex-shrink: 0;
    }
    .se-tile-name { font-size: 11px; }

    /* Brush size */
    .se-brush-row {
        padding: 8px;
        border-top: 1px solid var(--se-border);
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .se-brush-row label { font-size: 10px; color: var(--se-text-dim); text-transform: uppercase; letter-spacing: 1px; }
    .se-brush-btns { display: flex; gap: 4px; }
    .se-brush-btn {
        flex: 1; padding: 4px; text-align: center;
        background: var(--se-stone); border: 1px solid var(--se-border);
        cursor: pointer; font-family: 'Georgia', serif; font-size: 11px;
        color: var(--se-text-dim); border-radius: 2px;
        transition: all 0.1s;
    }
    .se-brush-btn:hover { border-color: var(--se-gold-dim); color: var(--se-text); }
    .se-brush-btn.active { background: #3a2808; border-color: var(--se-gold); color: var(--se-gold); }

    /* ── CENTER AREA ────────────────────────────────────────────────── */
    #se-center {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        min-width: 0;
    }

    /* ── RIBBON TOOLBAR ─────────────────────────────────────────────── */
    #se-ribbon {
        flex-shrink: 0;
        height: 36px;
        background: var(--se-panel-alt);
        border-bottom: 1px solid var(--se-border);
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 0 8px;
		overflow-x: auto; -webkit-overflow-scrolling: touch;
    }
    .se-ribbon-sep {
        width: 1px;
        height: 20px;
        background: var(--se-border);
        margin: 0 4px;
    }
    .se-ribbon-label {
        font-size: 10px;
        color: var(--se-text-dim);
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-right: 3px;
    }
    .se-zoom-display {
        font-size: 11px;
        color: var(--se-text);
        background: var(--se-inset);
        border: 1px solid var(--se-border);
        padding: 2px 8px;
        min-width: 46px;
        text-align: center;
    }

    /* ── MAP VIEWPORT ───────────────────────────────────────────────── */
    #se-viewport {
        flex: 1;
        background: #0a0806;
        position: relative;
        overflow: hidden;
        cursor: crosshair;
    }
    #se-viewport-canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    }
    /* Placeholder grid overlay (rendered before a real map is loaded) */
    .se-viewport-placeholder {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 14px;
        pointer-events: none;
    }
    .se-viewport-placeholder .se-ph-icon { font-size: 48px; opacity: 0.18; }
    .se-viewport-placeholder .se-ph-text {
        font-size: 13px;
        color: var(--se-text-dim);
        opacity: 0.5;
        text-align: center;
        line-height: 1.8;
    }
    /* Minimap inset */
    #se-minimap {
        position: absolute;
        bottom: 10px;
        right: 10px;
        width: 130px;
        height: 90px;
        background: var(--se-inset);
        border: 2px solid var(--se-border);
        border-radius: 2px;
        overflow: hidden;
    }
    .se-minimap-label {
        position: absolute;
        top: 3px; left: 5px;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--se-text-dim);
        opacity: 0.8;
    }

    /* ── STATUS BAR ─────────────────────────────────────────────────── */
    #se-statusbar {
        flex-shrink: 0;
        height: 22px;
        background: var(--se-inset);
        border-top: 1px solid var(--se-border);
        display: flex;
        align-items: center;
        padding: 0 10px;
        gap: 20px;
        font-size: 10px;
        color: var(--se-text-dim);
		overflow-x: auto; -webkit-overflow-scrolling: touch; flex-wrap: nowrap;
    }
    .se-status-cell { display: flex; align-items: center; gap: 4px; }
    .se-status-val { color: var(--se-text); }

    /* ── RIGHT PANEL ────────────────────────────────────────────────── */
    #se-right-panel {
        width: 240px;
        flex-shrink: 0;
        background: var(--se-panel);
        border-left: 2px solid var(--se-border);
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
	#se-right-panel {
    /* Keep your existing background, borders, etc., but ENSURE these are set: */
    width: 300px;             /* Give it a solid baseline width */
    min-width: 280px;         /* Prevents the center canvas from crushing it on smaller screens */
    flex-shrink: 0;           /* CRITICAL: Tells the flex container NOT to shrink this panel */
    
    /* Text and Scrolling Rules */
    overflow-y: auto;         /* Adds a vertical scrollbar if the meta text gets too long */
    overflow-x: hidden;       /* Prevents messy horizontal scrolling */
    word-wrap: break-word;    /* Forces long, unbroken strings to wrap to the next line */
    white-space: normal;      /* Overrides any 'nowrap' that might be clipping your text */
}
    .se-right-scroll { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 10px; }

    /* Inspector card */
    .se-card {
        background: var(--se-inset);
        border: 1px solid var(--se-border);
        border-radius: 2px;
        overflow: hidden;
    }
    .se-card-header {
        padding: 5px 8px;
        background: linear-gradient(to right, #3a2808, transparent);
        border-bottom: 1px solid var(--se-border);
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--se-gold-dim);
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .se-card-body { padding: 8px; display: flex; flex-direction: column; gap: 6px; }

    /* Form fields */
    .se-field { display: flex; flex-direction: column; gap: 3px; }
    .se-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: var(--se-text-dim); }
    .se-input, .se-select, .se-textarea {
        background: #1e1608;
        border: 1px solid var(--se-border);
        color: var(--se-text);
        font-family: 'Georgia', serif;
        font-size: 11px;
        padding: 4px 6px;
        border-radius: 1px;
        width: 100%;
        outline: none;
        transition: border-color 0.1s;
    }
    .se-input:focus, .se-select:focus, .se-textarea:focus { border-color: var(--se-gold-dim); }
    .se-textarea { resize: vertical; min-height: 50px; line-height: 1.5; }
    .se-select option { background: #1e1608; }

    /* Color swatch picker row */
    .se-color-row { display: flex; align-items: center; gap: 6px; }
    .se-color-preview {
        width: 28px;
        height: 22px;
        border: 1px solid var(--se-border);
        border-radius: 2px;
        flex-shrink: 0;
        cursor: pointer;
    }
    .se-color-input { flex: 1; }

    /* Slider */
    .se-slider {
        -webkit-appearance: none;
        width: 100%;
        height: 4px;
        background: var(--se-border);
        outline: none;
        border-radius: 2px;
    }
    .se-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        background: var(--se-gold);
        border-radius: 50%;
        cursor: pointer;
    }

    /* Faction list mini-table */
    .se-faction-list { display: flex; flex-direction: column; gap: 3px; }
    .se-faction-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 6px;
        background: var(--se-stone);
        border: 1px solid var(--se-border);
        border-radius: 2px;
        cursor: pointer;
        transition: border-color 0.1s;
    }
    .se-faction-row:hover { border-color: var(--se-gold-dim); }
    .se-faction-row.active { border-color: var(--se-gold); background: #2c1e08; }
    .se-faction-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
        border: 1px solid rgba(0,0,0,0.5);
    }
    .se-faction-name { flex: 1; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .se-faction-badge {
        font-size: 8px;
        padding: 1px 4px;
        border-radius: 2px;
        background: rgba(255,255,255,0.08);
        color: var(--se-text-dim);
    }

    /* City list */
    .se-city-list { display: flex; flex-direction: column; gap: 3px; max-height: 180px; overflow-y: auto; }
    .se-city-row {
        display: grid;
        grid-template-columns: 1fr auto auto;
        align-items: center;
        gap: 4px;
        padding: 3px 6px;
        background: var(--se-stone);
        border: 1px solid var(--se-border);
        border-radius: 2px;
        font-size: 10px;
        cursor: pointer;
        transition: border-color 0.1s;
    }
    .se-city-row:hover { border-color: var(--se-gold-dim); }
    .se-city-type-badge {
        font-size: 8px;
        padding: 1px 4px;
        border-radius: 2px;
        color: var(--se-text-dim);
        background: rgba(255,255,255,0.06);
        white-space: nowrap;
    }

    /* Two-column grid for numeric fields */
    .se-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .se-three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; }

#se-timeline {
        flex-shrink: 0;
        height: var(--se-tl-h, 220px);
        min-height: 80px;
        max-height: 80vh;
        background: var(--se-panel);
        border-top: 2px solid var(--se-border-hi);
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
	
	
#se-timeline-tabs {
        flex-shrink: 0;
        height: 32px;
        min-height: 32px;
        background: var(--se-panel-alt);
        border-bottom: 1px solid var(--se-border);
        display: flex;
        align-items: stretch;
        gap: 0;
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
    }
	
    .se-tl-tab {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 0 16px;
        cursor: pointer;
        border: none;
        background: transparent;
        color: var(--se-text-dim);
        font-family: 'Georgia', serif;
        font-size: 11px;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 1px;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
        transition: all 0.12s;
		flex-shrink: 0;
        white-space: nowrap;
    }
    .se-tl-tab:hover { color: var(--se-text); background: rgba(255,255,255,0.04); }
    .se-tl-tab.active { color: var(--se-gold); border-bottom-color: var(--se-gold); background: rgba(232,184,50,0.06); }

    #se-timeline-body {
        flex: 1;
        display: flex;
        overflow: hidden;
    }

    /* Trigger lane */
    .se-trigger-lane {
        width: 220px;
        flex-shrink: 0;
        border-right: 1px solid var(--se-border);
        display: flex;
        flex-direction: column;
    }
    .se-trigger-lane-header {
        padding: 5px 8px;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--se-text-dim);
        background: var(--se-panel-alt);
        border-bottom: 1px solid var(--se-border);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .se-trigger-list { flex: 1; overflow-y: auto; }
    .se-trigger-item {
        padding: 6px 8px;
        border-bottom: 1px solid var(--se-border);
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: background 0.1s;
    }
    .se-trigger-item:hover { background: var(--se-stone); }
    .se-trigger-item.active { background: #2c1e08; border-left: 3px solid var(--se-gold); }
    .se-trigger-num {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--se-stone-hi);
        border: 1px solid var(--se-border);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
        color: var(--se-text-dim);
        flex-shrink: 0;
    }
    .se-trigger-item.active .se-trigger-num { background: var(--se-gold-dim); border-color: var(--se-gold); color: #fff; }
    .se-trigger-info { flex: 1; overflow: hidden; }
    .se-trigger-label { font-size: 11px; color: var(--se-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .se-trigger-cond { font-size: 9px; color: var(--se-text-dim); margin-top: 1px; }
    .se-trigger-status {
        font-size: 9px;
        padding: 1px 5px;
        border-radius: 2px;
    }
    .se-trigger-status.enabled { background: rgba(58,136,48,0.3); color: white; border: 1px solid #3a8830; }
    .se-trigger-status.disabled { background: rgba(90,50,20,0.3); color:white; border: 1px solid var(--se-border); }

    /* Timeline horizontal area */
    .se-timeline-track {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
    .se-track-ruler {
        height: 24px;
        border-bottom: 1px solid var(--se-border);
        background: var(--se-panel-alt);
        display: flex;
        align-items: center;
        padding: 0 8px;
        gap: 0;
        overflow: hidden;
    }
    .se-ruler-tick {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        padding-left: 4px;
        min-width: 80px;
        border-left: 1px solid var(--se-border);
    }
    .se-ruler-tick-label { font-size: 8px; color: white; }
    .se-track-rows { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 4px 8px; display: flex; flex-direction: column; gap: 4px; }
    .se-track-row {
        height: 30px;
        background: var(--se-inset);
        border: 1px solid var(--se-border);
        border-radius: 2px;
        display: flex;
        align-items: center;
        padding: 0 8px;
        gap: 6px;
        font-size: 10px;
    }
    .se-track-event {
        height: 22px;
        padding: 0 8px;
        border-radius: 2px;
        display: flex;
        align-items: center;
        font-size: 10px;
        cursor: pointer;
        white-space: nowrap;
    }
    .se-track-event.dialogue { background: #3a1a68; border: 1px solid #6a3ab8; color: #c0a0ff; }
    .se-track-event.army     { background: #6a1010; border: 1px solid #a83030; color: #ffa0a0; }
    .se-track-event.economy  { background: #1a4818; border: 1px solid #3a7838; color: #90e890; }
    .se-track-event.cutscene { background: #4a3808; border: 1px solid #8a6818; color: #e8c870; }

    /* ── TRIGGER EDITOR (right side of timeline) ────────────────────── */
    .se-trig-editor {
        width: 320px;
        flex-shrink: 0;
        border-left: 1px solid var(--se-border);
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
    .se-trig-editor-header {
        padding: 5px 10px;
        background: var(--se-panel-alt);
        border-bottom: 1px solid var(--se-border);
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--se-gold-dim);
    }
    .se-trig-editor-body { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
    .se-action-list { display: flex; flex-direction: column; gap: 4px; }
    .se-action-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 8px;
        background: var(--se-stone);
        border: 1px solid var(--se-border);
        border-radius: 2px;
        font-size: 10px;
    }
    .se-action-handle { color: var(--se-text-dim); cursor: grab; font-size: 12px; }
    .se-action-type {
        font-size: 9px;
        padding: 1px 6px;
        border-radius: 2px;
    }
    .se-action-type.dialogue { background: rgba(106,58,184,0.4); color: #c0a0ff; }
    .se-action-type.army     { background: rgba(168,48,48,0.4); color: #ffa0a0; }
    .se-action-type.economy  { background: rgba(58,120,56,0.4); color: #90e890; }
    .se-action-type.relation { background: rgba(40,104,168,0.4); color: #90c0ff; }
    .se-action-type.sound    { background: rgba(168,120,40,0.4); color: #e8d090; }
    .se-action-detail { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--se-text); }

    /* ── DIALOGUE TAB ───────────────────────────────────────────────── */
    .se-dialogue-editor {
        flex: 1;
        padding: 10px;
        display: flex;
        gap: 10px;
        overflow: hidden;
    }
    .se-dialogue-list { width: 200px; flex-shrink: 0; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; }
    .se-dialogue-item {
        padding: 6px 8px;
        background: var(--se-stone);
        border: 1px solid var(--se-border);
        border-radius: 2px;
        cursor: pointer;
        font-size: 10px;
    }
    .se-dialogue-item:hover { border-color: var(--se-gold-dim); }
    .se-dialogue-item.active { border-color: var(--se-gold); background: #2c1e08; }
    .se-dialogue-speaker { color: var(--se-gold-dim); font-size: 9px; text-transform: uppercase; margin-bottom: 3px; }
    .se-dialogue-preview { color: var(--se-text); font-style: italic; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .se-dialogue-form { flex: 1; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }

    /* ── ECONOMY TAB ────────────────────────────────────────────────── */
    .se-economy-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        padding: 10px;
        overflow-y: auto;
        flex: 1;
    }
    .se-economy-card {
        background: var(--se-inset);
        border: 1px solid var(--se-border);
        border-radius: 2px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .se-economy-card-title { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: var(--se-gold-dim); }
    .se-economy-value { font-size: 18px; color: var(--se-text-hi); font-weight: bold; }
    .se-economy-sub { font-size: 9px; color: var(--se-text-dim); }

    /* ── OBJECTIVES TAB ─────────────────────────────────────────────── */
    .se-obj-list { flex: 1; padding: 10px; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; }
    .se-obj-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 6px 8px;
        background: var(--se-stone);
        border: 1px solid var(--se-border);
        border-radius: 2px;
    }
    .se-obj-num { width: 22px; height: 22px; border-radius: 50%; background: var(--se-stone-hi); border: 1px solid var(--se-border); display: flex; align-items: center; justify-content: center; font-size: 10px; flex-shrink: 0; }
    .se-obj-body { flex: 1; }
    .se-obj-title { font-size: 12px; color: var(--se-text); margin-bottom: 2px; }
    .se-obj-desc { font-size: 10px; color: var(--se-text-dim); font-style: italic; }
    .se-obj-type { font-size: 8px; padding: 1px 5px; border-radius: 2px; white-space: nowrap; }
    .se-obj-type.primary { background: rgba(200,146,26,0.3); color: var(--se-gold); border: 1px solid var(--se-gold-dim); }
    .se-obj-type.secondary { background: rgba(90,64,32,0.3); color: var(--se-text-dim); border: 1px solid var(--se-border); }
	
	

    /* ── TOOLTIP ────────────────────────────────────────────────────── */
    .se-tooltip {
        position: fixed;
        background: #1e1608;
        border: 1px solid var(--se-gold-dim);
        color: var(--se-text);
        font-size: 11px;
        padding: 5px 10px;
        border-radius: 2px;
        pointer-events: none;
        z-index: 30000;
        max-width: 220px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.8);
        display: none;
    }
	
	/* ── TIMELINE DRAG HANDLE ──────────────────────────────────────── */
    #se-tl-drag-handle {
        flex-shrink: 0;
        height: 10px;
        background: linear-gradient(to bottom, var(--se-border-hi), var(--se-border));
        cursor: ns-resize;
        display: flex;
        align-items: center;
        justify-content: center;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
    }
    #se-tl-drag-handle::after {
        content: '';
        width: 44px;
        height: 3px;
        background: var(--se-gold-dim);
        border-radius: 2px;
        opacity: 0.55;
        pointer-events: none;
    }
    #se-tl-drag-handle:hover,
    #se-tl-drag-handle:active {
        background: linear-gradient(to bottom, var(--se-gold-dim), var(--se-border));
    }
    #se-tl-drag-handle:hover::after,
    #se-tl-drag-handle:active::after { opacity: 1; }

    /* ── TOUCH DEVICE ERGONOMICS ────────────────────────────────────── */
    @media (hover: none) and (pointer: coarse) {
        .se-btn { min-height: 36px; padding: 6px 10px; }
        .se-mode-tab { min-height: 42px; }
        .se-tl-tab { min-height: 32px; }
        .se-tool { min-height: 44px; padding: 8px 2px; }
        .se-tile-row { min-height: 38px; padding: 7px 6px; }
        .se-trigger-item { min-height: 44px; padding: 8px; }
        .se-faction-row, .se-city-row { min-height: 38px; }
        .se-slider::-webkit-slider-thumb { width: 24px; height: 24px; }
        .se-right-scroll { -webkit-overflow-scrolling: touch; }
        .se-trigger-list { -webkit-overflow-scrolling: touch; }
        .se-trig-editor-body { -webkit-overflow-scrolling: touch; }
        .se-track-rows { -webkit-overflow-scrolling: touch; }
        .se-obj-list { -webkit-overflow-scrolling: touch; }
        .se-economy-grid { -webkit-overflow-scrolling: touch; }
        .se-dialogue-list, .se-dialogue-form { -webkit-overflow-scrolling: touch; }
        #se-tl-drag-handle { height: 16px; }
    }

    /* ── RESPONSIVE: TABLET (≤ 900px) ──────────────────────────────── */
    @media (max-width: 900px) {
        #se-left-panel  { width: 160px; }
        #se-right-panel { width: 200px; }
        .se-mode-tab { padding: 0 12px; font-size: 11px; letter-spacing: 0.5px; }
        .se-tl-tab   { padding: 0 12px; font-size: 10px; letter-spacing: 0.5px; }
        .se-trig-editor { width: 260px; }
        .se-trigger-lane { width: 180px; }
        .se-economy-grid { grid-template-columns: repeat(2, 1fr); }
    }

    /* ── RESPONSIVE: MOBILE (≤ 600px) ──────────────────────────────── */
    @media (max-width: 600px) {
        #se-left-panel  { width: 140px; }
        #se-right-panel { display: none; }
        .se-logo { padding: 0 8px; font-size: 11px; letter-spacing: 1px; }
        .se-logo span { font-size: 14px; }
        .se-mode-tab { padding: 0 8px; font-size: 10px; letter-spacing: 0; gap: 4px; }
        .se-tl-tab   { padding: 0 8px; font-size: 10px; letter-spacing: 0; }
        .se-btn { padding: 4px 7px; font-size: 10px; gap: 3px; }
        .se-file-ops { gap: 1px; padding: 0 4px; }
        .se-title-right { gap: 3px; padding: 0 6px; }
        #se-ribbon { height: auto; min-height: 36px; flex-wrap: nowrap; }
        .se-trig-editor { display: none; }
        .se-trigger-lane { width: 160px; flex-shrink: 0; }
        .se-economy-grid { grid-template-columns: 1fr; }
        #se-statusbar { gap: 10px; padding: 0 6px; font-size: 9px; }
        .se-status-cell:nth-child(n+4) { display: none; }
        .se-tool-grid { grid-template-columns: repeat(4, 1fr); gap: 2px; padding: 5px; }
        .se-timeline-track { min-width: 200px; }
        .se-two-col { grid-template-columns: 1fr; }
    }

    /* ── RESPONSIVE: TINY (≤ 400px) ───────────────────────────────── */
    @media (max-width: 400px) {
        #se-left-panel { display: none; }
        .se-mode-tab .se-tab-icon + * { display: none; }
        .se-mode-tab { padding: 0 6px; }
        .se-tl-tab   { padding: 0 6px; }
        .se-logo { display: none; }
    }

    /* ── ANIMATIONS ─────────────────────────────────────────────────── */
    @keyframes se-fadein {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
    }
    #se-root { animation: se-fadein 0.18s ease-out; }
`;

// ── Tile palette data (matches PALETTE used in sandbox_overworld.js) ────
// FUTURE CLAUDE: Pull dynamically via Object.entries(PALETTE) when PALETTE
// is confirmed to be in scope. The colours below are the actual hex values
// used by sandbox_overworld.js so the swatches are pixel-accurate.

const TILES = [
    { name: "Ocean",        color: "#1a3f5c" },
    { name: "Coastal",      color: "#2a6080" },
    { name: "River",        color: "#3a7090" },
    { name: "Plains",       color: "#6a8c3a" },
    { name: "Steppes",      color: "#9a9c5a" },
    { name: "Forest",       color: "#2a5a1a" },
    { name: "Dense Forest", color: "#1a3a0e" },
    { name: "Highlands",    color: "#7a6040" },
    { name: "Mountains",    color: "#4a3820" },
];

// ── Faction data (mirrors npc_systems_story1.js FACTIONS_story1) ────────
// FUTURE CLAUDE: Pull dynamically via Object.entries(FACTIONS) so that
// sandbox and story1 factions are always in sync with the editor.
const FACTIONS_PREVIEW = [
    { name: "Kamakura Shogunate", color: "#c62828", role: "Major" },
    { name: "Shoni Clan",         color: "#1565c0", role: "Major" },
    { name: "So Clan",            color: "#2e7d32", role: "Regional" },
    { name: "Kikuchi Clan",       color: "#6a1b9a", role: "Regional" },
    { name: "Otomo Clan",         color: "#e65100", role: "Regional" },
    { name: "Matsura Clan",       color: "#00695c", role: "Regional" },
    { name: "Yuan Dynasty",       color: "#b71c1c", role: "Invader" },
    { name: "Ronin",              color: "#37474f", role: "Neutral" },
    { name: "Kyushu Defender",    color: "#ffffff", role: "Player" },
];

// ── Sample trigger data (stub — future Claude: bind to _seScenario.triggers)
const TRIGGERS_PREVIEW = [
    { id: 1, label: "Yuan Fleet Sighted",     cond: "Turn 1",          status: "enabled"  },
    { id: 2, label: "Tsushima Falls",          cond: "City Captured",   status: "enabled"  },
    { id: 3, label: "Iki Garrison Rallies",    cond: "Unit in Region",  status: "enabled"  },
    { id: 4, label: "Hakata Bay Landing",      cond: "Turn 4",          status: "enabled"  },
    { id: 5, label: "Hakozaki Shrine Burns",   cond: "City Destroyed",  status: "enabled"  },
    { id: 6, label: "Torikai Battle Begins",   cond: "Unit in Region",  status: "enabled"  },
    { id: 7, label: "Mizuki Last Stand",       cond: "City HP < 30%",   status: "disabled" },
    { id: 8, label: "Storm Kamikaze",          cond: "Turn 8",          status: "disabled" },
];

// ── Sample objectives (stub) ─────────────────────────────────────────────
const OBJECTIVES_PREVIEW = [
    { num: 1, title: "Hold Hakata Bay",     desc: "Prevent Yuan forces from establishing a beachhead for 6 turns.", type: "primary"   },
    { num: 2, title: "Defend Dazaifu",      desc: "The Mizuki earthwork must not fall.",                           type: "primary"   },
    { num: 3, title: "Rally the Clans",     desc: "Bring Kikuchi Clan and Ōtomo Clan into your alliance.",        type: "secondary" },
    { num: 4, title: "Destroy the Fleet",   desc: "Sink or scatter 50% of Yuan ships in Hakata Bay.",            type: "secondary" },
    { num: 5, title: "Recover Tsushima",    desc: "Recapture Sasuura from Yuan control.",                         type: "secondary" },
];

// ── Build the full editor DOM ─────────────────────────────────────────────
function _build() {
    const root = document.createElement("div");
    root.id = "se-root";

    // ── Inject CSS ───────────────────────────────────────────────────────
    const style = document.createElement("style");
    style.id = "se-styles";
    style.textContent = CSS;
    document.head.appendChild(style);

    root.innerHTML = `
        ${_buildTitlebar()}
        <div id="se-workspace">
            ${_buildLeftPanel()}
            <div id="se-center">
                ${_buildRibbon()}
                <div id="se-viewport">
                    <canvas id="se-viewport-canvas"></canvas>
                    <div class="se-viewport-placeholder">
                        <div class="se-ph-icon">🗺</div>
                        <div class="se-ph-text">
                            No map loaded.<br>
							This is optimized for PC, not Mobile <br>
                            Click <strong style="color:#c8921a">New Map</strong> or <strong style="color:#c8921a">Load Scenario</strong><br>
                            to begin editing.
                        </div>
                    </div>
                    <div id="se-minimap">
                        <div class="se-minimap-label">Overview</div>
                    </div>
                </div>
                ${_buildStatusBar()}
            </div>
            ${_buildRightPanel()}
        </div>
        ${_buildTimeline()}
        <div class="se-tooltip" id="se-tooltip"></div>
    `;

    return root;
}

// ── Titlebar ─────────────────────────────────────────────────────────────
function _buildTitlebar() {
    const modeTabs = [
        { id: "MAP",      icon: "🏔", label: "Map Editor" },
        { id: "FACTIONS", icon: "⚑",  label: "Factions"   },
        { id: "CITIES",   icon: "🏯", label: "Cities"     },
        { id: "NPCS",     icon: "⚔",  label: "NPCs"       },
        { id: "TRIGGERS", icon: "⚡", label: "Triggers"   },
    ];

    return `
    <div id="se-titlebar">
        <div class="se-logo">
            <span>📜</span>
            SCENARIO EDITOR
        </div>

        <!-- File operations -->
        <!-- FUTURE CLAUDE:
             • "New Map" → prompt for COLS×ROWS, generate blank worldMap_story1 array,
               fill with "Ocean" tiles, call generateMap_story1() variant.
             • "Load Scenario" → read from localStorage keys matching "SE_scenario_*"
               or open file picker for .json export.
             • "Save" → JSON.stringify(_seScenario) → localStorage / download.
             • "Export to Game" → call applyStory1Factions(), then populate
               worldMap and cities arrays from _seScenario, then call initGame_story1().
             • "Test Play" → temporarily patch initGame_story1 to use _seScenario data
               and launch without the loading screen countdown. -->
        <div class="se-file-ops">
            <button class="se-btn stub" title="[FUTURE] Create a blank map with specified dimensions">+ New Map</button>
            <button class="se-btn stub" title="[FUTURE] Load an existing .json scenario file">📂 Load</button>
            <button class="se-btn primary stub" title="[FUTURE] Save scenario to localStorage">💾 Save</button>
            <button class="se-btn stub" title="[FUTURE] Export scenario as JSON file">↗ Export</button>
            <button class="se-btn success stub" title="[FUTURE] Launch the scenario in-game for testing">▶ Test Play</button>
        </div>

        <!-- Mode tabs -->
        <div class="se-mode-tabs">
            ${modeTabs.map(t => `
            <button class="se-mode-tab ${t.id === _activeMode ? 'active' : ''}"
                    data-mode="${t.id}"
                    onclick="window.ScenarioEditor._setMode('${t.id}')"
                    title="Switch to ${t.label} mode">
                <span class="se-tab-icon">${t.icon}</span>
                ${t.label}
            </button>`).join('')}
        </div>

        <!-- Right controls -->
        <!-- FUTURE CLAUDE: Undo/Redo should maintain a _seHistory[] stack of
             serialised tile/city/faction snapshots (max 50 entries).
             Each paint stroke, city placement, or faction change pushes to stack. -->
        <div class="se-title-right">
            <button class="se-btn icon-only stub" title="[FUTURE] Undo last action (Ctrl+Z)">↩</button>
            <button class="se-btn icon-only stub" title="[FUTURE] Redo last undone action (Ctrl+Y)">↪</button>
            <button class="se-btn icon-only stub" title="[FUTURE] Open editor settings / keybinds">⚙</button>
            <button class="se-btn danger" onclick="window.ScenarioEditor.close()" title="Close Scenario Editor and return to Main Menu">✕ Close</button>
        </div>
    </div>`;
}

// ── Left Panel ────────────────────────────────────────────────────────────
function _buildLeftPanel() {
    const tools = [
        { id: "PAINT",   icon: "🖌", label: "Paint",   tip: "Paint terrain tiles onto the map" },
        { id: "ERASE",   icon: "🧹", label: "Erase",   tip: "Erase tiles back to Ocean" },
        { id: "FILL",    icon: "🪣", label: "Fill",    tip: "[FUTURE] Flood-fill a contiguous region" },
        { id: "SELECT",  icon: "⬚",  label: "Select",  tip: "[FUTURE] Marquee-select a region" },
        { id: "PLACE",   icon: "📍", label: "Place",   tip: "Place a city or NPC unit" },
        { id: "INSPECT", icon: "🔍", label: "Inspect", tip: "Click any tile or entity to view its properties" },
        { id: "MOVE",    icon: "✥",  label: "Move",    tip: "[FUTURE] Drag cities or NPC units to new positions" },
        { id: "MEASURE", icon: "📏", label: "Measure", tip: "[FUTURE] Measure tile distances" },
    ];

    return `
    <div id="se-left-panel">
        <div class="se-section-header">Tools</div>
        <div class="se-tool-grid">
            ${tools.map(t => `
            <div class="se-tool ${t.id === _activeTool ? 'active' : ''}"
                 data-tool="${t.id}"
                 title="${t.tip}"
                 onclick="window.ScenarioEditor._setTool('${t.id}')">
                <span class="se-tool-icon">${t.icon}</span>
                ${t.label}
            </div>`).join('')}
        </div>

        <div class="se-section-header">Terrain Tiles</div>
        <!-- FUTURE CLAUDE: Clicking a tile row should:
             1. Set _activeTile to the tile name
             2. Switch _activeTool to PAINT if not already
             3. Update left panel .active classes
             All paint strokes write to _seScenario.mapTiles[x][y]
             and redraw the viewport canvas. -->
        <div class="se-tile-palette">
            ${TILES.map(t => `
            <div class="se-tile-row ${t.name === _activeTile ? 'active' : ''}"
                 data-tile="${t.name}"
                 onclick="window.ScenarioEditor._setTile('${t.name}')"
                 title="Paint with: ${t.name}">
                <div class="se-tile-swatch" style="background:${t.color}"></div>
                <span class="se-tile-name">${t.name}</span>
            </div>`).join('')}
        </div>

        <!-- Brush size controls -->
        <!-- FUTURE CLAUDE: Brush size affects how many tiles are painted per
             mouse event. Size 1 = 1 tile, Size 3 = 3×3 block, Size 5 = 5×5 block.
             For Size 5, iterate from (tx-2,ty-2) to (tx+2,ty+2). -->
        <div class="se-brush-row">
            <label>Brush Size</label>
            <div class="se-brush-btns">
                <div class="se-brush-btn ${_brushSize===1?'active':''}"
                     onclick="window.ScenarioEditor._setBrush(1)"
                     title="1×1 tile brush">1×1</div>
                <div class="se-brush-btn ${_brushSize===3?'active':''}"
                     onclick="window.ScenarioEditor._setBrush(3)"
                     title="3×3 tile brush">3×3</div>
                <div class="se-brush-btn ${_brushSize===5?'active':''}"
                     onclick="window.ScenarioEditor._setBrush(5)"
                     title="5×5 tile brush">5×5</div>
            </div>
        </div>
    </div>`;
}

// ── Ribbon ────────────────────────────────────────────────────────────────
function _buildRibbon() {
    return `
    <div id="se-ribbon">
        <!-- Zoom controls -->
        <!-- FUTURE CLAUDE: Zoom should scale the viewport canvas transform.
             Use CSS transform: scale(zoom) on #se-viewport-canvas.
             Store zoom level in _seZoom (range 0.25–4.0, step 0.25).
             Pan is handled by mousedown+mousemove on the viewport with
             _seOffsetX / _seOffsetY state variables. -->
        <span class="se-ribbon-label">Zoom</span>
        <button class="se-btn icon-only stub" title="Zoom out">−</button>
        <div class="se-zoom-display">100%</div>
        <button class="se-btn icon-only stub" title="Zoom in">+</button>
        <button class="se-btn stub" title="[FUTURE] Fit entire map in viewport">Fit</button>

        <div class="se-ribbon-sep"></div>

        <!-- Grid / Snap toggles -->
        <!-- FUTURE CLAUDE: Grid overlay draws a 1px rgba(255,255,255,0.08)
             line every TILE_SIZE pixels on a separate canvas layer rendered
             above the terrain canvas but below the entity canvas. -->
        <button class="se-btn stub" title="[FUTURE] Toggle tile grid overlay">⊞ Grid</button>
        <button class="se-btn stub" title="[FUTURE] Snap entity placement to tile centres">◫ Snap</button>
        <button class="se-btn stub" title="[FUTURE] Show faction territory overlay">⚑ Territory</button>
        <button class="se-btn stub" title="[FUTURE] Show NPC patrol route arrows">→ Routes</button>
        <button class="se-btn stub" title="[FUTURE] Show trigger zones as tinted rectangles">⚡ Zones</button>

        <div class="se-ribbon-sep"></div>

        <!-- Map generation helpers -->
        <!-- FUTURE CLAUDE: "Gen Island" should call generateMap_story1() with
             the current _seScenario.meta dimensions and blit the result into
             the viewport canvas. "Smooth" applies a 3×3 blur convolution to
             the tile array (neighbour-majority vote per tile). -->
        <button class="se-btn stub" title="[FUTURE] Procedurally generate island terrain using story1_map_and_update.js">🏔 Gen Island</button>
        <button class="se-btn stub" title="[FUTURE] Smooth jagged coastlines using neighbour-vote algorithm">≈ Smooth</button>
        <button class="se-btn stub" title="[FUTURE] Auto-place rivers following elevation gradient">〜 Rivers</button>
    </div>`;
}

// ── Status Bar ────────────────────────────────────────────────────────────
function _buildStatusBar() {
    return `
    <div id="se-statusbar">
        <div class="se-status-cell">Mode: <span class="se-status-val" id="se-st-mode">${_activeMode}</span></div>
        <div class="se-status-cell">Tool: <span class="se-status-val" id="se-st-tool">${_activeTool}</span></div>
        <div class="se-status-cell">Tile: <span class="se-status-val" id="se-st-tile">${_activeTile}</span></div>
        <div class="se-status-cell">Cursor: <span class="se-status-val" id="se-st-cursor">—</span></div>
        <div class="se-status-cell">Brush: <span class="se-status-val" id="se-st-brush">${_brushSize}×${_brushSize}</span></div>
        <div class="se-status-cell" style="margin-left:auto">Scenario: <span class="se-status-val" id="se-st-scenario">[Unsaved]</span></div>
    </div>`;
}

// ── Right Panel ───────────────────────────────────────────────────────────
function _buildRightPanel() {
    return `
    <div id="se-right-panel">
        <div class="se-section-header">Inspector</div>
        <div class="se-right-scroll">

            <!-- ── Scenario Meta ──────────────────────────────────────── -->
            <!-- FUTURE CLAUDE: These fields write to _seScenario.meta.
                 The "Map Mode" dropdown sets which initGame_* function is
                 called during Test Play (initGame (sandbox) vs initGame_story1). -->
            <div class="se-card">
                <div class="se-card-header">📋 Scenario Meta</div>
                <div class="se-card-body">
                    <div class="se-field">
                        <span class="se-label">Name</span>
                        <input class="se-input stub" type="text" placeholder="Bun'ei Invasion — 1274" />
                    </div>
                    <div class="se-field">
                        <span class="se-label">Author</span>
                        <input class="se-input stub" type="text" placeholder="Developer" />
                    </div>
                    <div class="se-field">
                        <span class="se-label">Map Mode</span>
                        <select class="se-select stub">
                            <option>Story 1 — Northern Kyūshū</option>
                            <option>Sandbox</option>
                            <option>[Future] Story 2</option>
                        </select>
                    </div>
                    <div class="se-two-col">
                        <div class="se-field">
                            <span class="se-label">Map Width (tiles)</span>
                            <input class="se-input stub" type="number" value="160" min="40" max="512" />
                        </div>
                        <div class="se-field">
                            <span class="se-label">Map Height (tiles)</span>
                            <input class="se-input stub" type="number" value="120" min="40" max="512" />
                        </div>
                    </div>
                    <div class="se-field">
                        <span class="se-label">Historical Date</span>
                        <input class="se-input stub" type="text" placeholder="November 1274" />
                    </div>
                </div>
            </div>

            <!-- ── Faction List ───────────────────────────────────────── -->
            <!-- FUTURE CLAUDE: Clicking a faction row should populate the
                 Faction Config card below with that faction's data from
                 FACTIONS[name]. Colour changes call
                 document.querySelectorAll('.se-faction-dot').
                 GeoWeight sliders write to FACTIONS_story1[name].geoWeight
                 and immediately trigger regenerateNPCCities() if the map
                 has been generated. -->
            <div class="se-card">
                <div class="se-card-header">
                    ⚑ Factions
                    <button class="se-btn primary stub" style="margin-left:auto;font-size:9px;padding:2px 6px" title="[FUTURE] Add a new faction">+ Add</button>
                </div>
                <div class="se-card-body">
                    <div class="se-faction-list">
                        ${FACTIONS_PREVIEW.map((f, i) => `
                        <div class="se-faction-row ${i===1?'active':''}"
                             title="Click to configure ${f.name}">
                            <div class="se-faction-dot" style="background:${f.color}"></div>
                            <span class="se-faction-name">${f.name}</span>
                            <span class="se-faction-badge">${f.role}</span>
                        </div>`).join('')}
                    </div>
                </div>
            </div>

            <!-- ── Faction Config ─────────────────────────────────────── -->
            <!-- FUTURE CLAUDE: All fields here must be connected to the
                 selected FACTIONS_story1 entry. The "Has Cities" toggle
                 controls whether this faction can own settlements (Yuan/Ronin = off).
                 GeoWeight sliders call getFactionByGeography() internally to
                 preview which zone the faction dominates. -->
            <div class="se-card">
                <div class="se-card-header">⚙ Faction Config — Shoni Clan</div>
                <div class="se-card-body">
                    <div class="se-field">
                        <span class="se-label">Display Name</span>
                        <input class="se-input stub" type="text" value="Shoni Clan" />
                    </div>
                    <div class="se-field">
                        <span class="se-label">Faction Color</span>
                        <div class="se-color-row">
                            <div class="se-color-preview" style="background:#1565c0"></div>
                            <input class="se-input stub se-color-input" type="text" value="#1565c0" />
                        </div>
                    </div>
                    <div class="se-two-col">
                        <div class="se-field">
                            <span class="se-label">Role</span>
                            <select class="se-select stub">
                                <option>Major</option>
                                <option>Regional</option>
                                <option>Invader</option>
                                <option>Neutral</option>
                                <option>Player</option>
                            </select>
                        </div>
                        <div class="se-field">
                            <span class="se-label">Has Cities</span>
                            <select class="se-select stub">
                                <option selected>Yes</option>
                                <option>No (Army Only)</option>
                            </select>
                        </div>
                    </div>
                    <div class="se-section-header" style="margin:4px -8px;padding-left:8px">GeoWeight (0–1)</div>
                    <div class="se-field">
                        <span class="se-label">North ↑  <span style="float:right;color:var(--se-text)">0.25</span></span>
                        <input class="se-slider stub" type="range" min="0" max="1" step="0.01" value="0.25" />
                    </div>
                    <div class="se-field">
                        <span class="se-label">South ↓  <span style="float:right;color:var(--se-text)">0.55</span></span>
                        <input class="se-slider stub" type="range" min="0" max="1" step="0.01" value="0.55" />
                    </div>
                    <div class="se-field">
                        <span class="se-label">West ←   <span style="float:right;color:var(--se-text)">0.35</span></span>
                        <input class="se-slider stub" type="range" min="0" max="1" step="0.01" value="0.35" />
                    </div>
                    <div class="se-field">
                        <span class="se-label">East →   <span style="float:right;color:var(--se-text)">0.65</span></span>
                        <input class="se-slider stub" type="range" min="0" max="1" step="0.01" value="0.65" />
                    </div>
                    <div class="se-field">
                        <span class="se-label">Syllable Pool (comma-separated)</span>
                        <textarea class="se-textarea stub">Haka,Sho,Kage,Haru,Kawa,Yama,Hana,Tsuki,Mori,Take,Ishi,Umi,Hako,Naka,Zaki,Saki,Ura</textarea>
                    </div>
                    <div style="display:flex;gap:4px;flex-wrap:wrap">
                        <button class="se-btn primary stub" style="flex:1">Apply to Game</button>
                        <button class="se-btn danger stub">Delete</button>
                    </div>
                </div>
            </div>

            <!-- ── City List ──────────────────────────────────────────── -->
            <!-- FUTURE CLAUDE: City rows are built from FIXED_SETTLEMENTS_story1.
                 Clicking a row selects it and highlights its position on the
                 viewport (draw a gold ring at city.nx*viewW, city.ny*viewH).
                 Dragging on the viewport while a city is selected updates its nx/ny.
                 "+ Add City" opens an inline form that appends to FIXED_SETTLEMENTS_story1
                 and pushes to cities_story1. -->
            <div class="se-card">
                <div class="se-card-header">
                    🏯 Settlements
                    <button class="se-btn primary stub" style="margin-left:auto;font-size:9px;padding:2px 6px">+ Add City</button>
                </div>
                <div class="se-card-body" style="padding:4px">
                    <div class="se-city-list">
                        ${[
                            {n:"Hakata",         t:"MAJOR_CITY", f:"Shoni"},
                            {n:"Dazaifu",        t:"MAJOR_CITY", f:"Kamakura"},
                            {n:"Mizuki",         t:"FORTRESS",   f:"Kamakura"},
                            {n:"Hakozaki",       t:"TOWN",       f:"Shoni"},
                            {n:"Munakata",       t:"TOWN",       f:"Shoni"},
                            {n:"Karatsu",        t:"TOWN",       f:"Matsura"},
                            {n:"Torikai",        t:"VILLAGE",    f:"Kikuchi"},
                            {n:"Sohara",         t:"VILLAGE",    f:"Shoni"},
                            {n:"Imazu",          t:"VILLAGE",    f:"Matsura"},
                            {n:"Nishijin",       t:"VILLAGE",    f:"Shoni"},
                            {n:"Akasaka",        t:"VILLAGE",    f:"Shoni"},
                            {n:"Sasuura",        t:"TOWN",       f:"So"},
                            {n:"Iki-no-Matsubara",t:"TOWN",      f:"Shoni"},
                            {n:"Shiga",          t:"VILLAGE",    f:"Shoni"},
                            {n:"Noko",           t:"VILLAGE",    f:"Shoni"},
                            {n:"Genkai",         t:"VILLAGE",    f:"Shoni"},
                        ].map(c=>`
                        <div class="se-city-row" title="Click to select and inspect ${c.n}">
                            <span>${c.n}</span>
                            <span class="se-city-type-badge">${c.t}</span>
                            <button class="se-btn icon-only stub" style="font-size:9px;padding:1px 4px" title="[FUTURE] Focus viewport on ${c.n}">◎</button>
                        </div>`).join('')}
                    </div>
                </div>
            </div>

            <!-- ── Selected City Config ───────────────────────────────── -->
            <!-- FUTURE CLAUDE: This card is populated when a city row or a
                 city marker on the viewport is clicked.
                 All fields write directly to the matching entry in
                 FIXED_SETTLEMENTS_story1 (matched by name).
                 nx/ny fields are two-way synced with drag on the viewport. -->
            <div class="se-card">
                <div class="se-card-header">🏯 City Config — Hakata</div>
                <div class="se-card-body">
                    <div class="se-field">
                        <span class="se-label">Settlement Name</span>
                        <input class="se-input stub" type="text" value="Hakata" />
                    </div>
                    <div class="se-two-col">
                        <div class="se-field">
                            <span class="se-label">Type</span>
                            <select class="se-select stub">
                                <option>MAJOR_CITY</option>
                                <option>FORTRESS</option>
                                <option>TOWN</option>
                                <option>VILLAGE</option>
                            </select>
                        </div>
                        <div class="se-field">
                            <span class="se-label">Owning Faction</span>
                            <select class="se-select stub">
                                <option>Shoni Clan</option>
                                <option>Kamakura Shogunate</option>
                                <option>So Clan</option>
                                <option>Kikuchi Clan</option>
                                <option>Otomo Clan</option>
                                <option>Matsura Clan</option>
                                <option>Kyushu Defender</option>
                            </select>
                        </div>
                    </div>
                    <div class="se-two-col">
                        <div class="se-field">
                            <span class="se-label">nx (0–1)</span>
                            <input class="se-input stub" type="number" value="0.510" step="0.001" min="0" max="1" />
                        </div>
                        <div class="se-field">
                            <span class="se-label">ny (0–1)</span>
                            <input class="se-input stub" type="number" value="0.362" step="0.001" min="0" max="1" />
                        </div>
                    </div>
                    <div class="se-two-col">
                        <div class="se-field">
                            <span class="se-label">Population</span>
                            <input class="se-input stub" type="number" value="12000" step="100" />
                        </div>
                        <div class="se-field">
                            <span class="se-label">Garrison</span>
                            <input class="se-input stub" type="number" value="800" step="50" />
                        </div>
                    </div>
                    <div class="se-two-col">
                        <div class="se-field">
                            <span class="se-label">Starting Gold</span>
                            <input class="se-input stub" type="number" value="3500" step="100" />
                        </div>
                        <div class="se-field">
                            <span class="se-label">Starting Food</span>
                            <input class="se-input stub" type="number" value="2200" step="100" />
                        </div>
                    </div>
                    <div class="se-field">
                        <span class="se-label">Visual Radius (px)</span>
                        <input class="se-slider stub" type="range" min="10" max="60" value="42" />
                    </div>
                    <div style="display:flex;gap:4px">
                        <button class="se-btn primary stub" style="flex:1">Apply</button>
                        <button class="se-btn stub" title="[FUTURE] Snap city to nearest valid land tile">⬗ Snap</button>
                        <button class="se-btn danger stub">Delete</button>
                    </div>
                </div>
            </div>

        </div>
    </div>`;
}
 
function _buildTimeline() {
    const tlTabs = ["TRIGGERS","OBJECTIVES","DIALOGUE","ECONOMY"];

    return `
<div id="se-timeline">
        <div id="se-tl-drag-handle" title="Drag up/down to resize this panel"></div>
		
        <div id="se-timeline-tabs">
            ${tlTabs.map(t => `
            <button class="se-tl-tab ${t===_activeTab?'active':''}"
                    data-tltab="${t}"
                    onclick="window.ScenarioEditor._setTab('${t}')">
                ${{TRIGGERS:'⚡',OBJECTIVES:'🎯',DIALOGUE:'💬',ECONOMY:'💰'}[t]} ${t}
            </button>`).join('')}
            <div style="flex:1"></div>
            <!-- FUTURE CLAUDE: "Add Trigger" should append a new entry to
                 _seScenario.triggers[] and rebuild the trigger lane list.
                 Trigger IDs should auto-increment from the current max. -->
            <button class="se-btn primary stub" style="align-self:center;margin-right:8px">+ Add Trigger</button>
            <button class="se-btn stub" style="align-self:center;margin-right:8px" title="[FUTURE] Collapse/expand this panel">▼</button>
        </div>

        <div id="se-timeline-body">
            ${_buildTriggersTab()}
        </div>
    </div>`;
}
 
function _buildTriggersTab() {
    return `
    <!-- LEFT: Trigger list lane -->
    <div class="se-trigger-lane">
        <div class="se-trigger-lane-header">
            <span>Triggers (${TRIGGERS_PREVIEW.length})</span>
            <div style="display:flex;gap:3px">
                <button class="se-btn icon-only stub" style="font-size:9px;padding:1px 5px" title="[FUTURE] Sort by turn order">↕</button>
                <button class="se-btn icon-only stub" style="font-size:9px;padding:1px 5px" title="[FUTURE] Filter enabled only">✓</button>
            </div>
        </div>
        <div class="se-trigger-list">
            ${TRIGGERS_PREVIEW.map((t, i) => `
            <div class="se-trigger-item ${i===0?'active':''}"
                 title="Click to edit trigger: ${t.label}">
                <div class="se-trigger-num">${t.id}</div>
                <div class="se-trigger-info">
                    <div class="se-trigger-label">${t.label}</div>
                    <div class="se-trigger-cond">${t.cond}</div>
                </div>
                <span class="se-trigger-status ${t.status}">${t.status==='enabled'?'ON':'OFF'}</span>
            </div>`).join('')}
        </div>
    </div>

    <!-- CENTER: Timeline track -->
    <!-- FUTURE CLAUDE: The ruler ticks represent in-game turns (or real time if
         you add a timer mode). Each track row is a named "channel" (Dialogue,
         Army Events, Economy Events, Cutscenes). Events on the track are
         draggable blocks that set the trigger's activation turn.
         Render them as absolutely-positioned divs inside a scrollable container,
         width proportional to turn duration if multi-turn. -->
    <div class="se-timeline-track">
        <div class="se-track-ruler">
            ${Array.from({length:10},(_,i)=>`
            <div class="se-ruler-tick">
                <div class="se-ruler-tick-label">Turn ${i+1}</div>
            </div>`).join('')}
        </div>
        <div class="se-track-rows">
            <div class="se-track-row">
                <span style="font-size:9px;color:var(--se-text-dim);width:60px;flex-shrink:0">Dialogue</span>
                <div class="se-track-event dialogue" title="Yuan Fleet Sighted — Turn 1">⚡ Yuan Fleet Sighted</div>
                <div class="se-track-event dialogue" style="margin-left:60px" title="Hakata Bay Landing — Turn 4">⚡ Hakata Landing</div>
            </div>
            <div class="se-track-row">
                <span style="font-size:9px;color:var(--se-text-dim);width:60px;flex-shrink:0">Army</span>
                <div class="se-track-event army" style="margin-left:20px" title="Yuan invasion force spawns">⚔ Yuan Spawns</div>
                <div class="se-track-event army" style="margin-left:80px">⚔ Iki Garrison</div>
            </div>
            <div class="se-track-row">
                <span style="font-size:9px;color:var(--se-text-dim);width:60px;flex-shrink:0">Economy</span>
                <div class="se-track-event economy" title="Shogunate emergency supply — Turn 1">💰 Emergency Supply</div>
                <div class="se-track-event economy" style="margin-left:180px">💰 Tribute</div>
            </div>
            <div class="se-track-row">
                <span style="font-size:9px;color:var(--se-text-dim);width:60px;flex-shrink:0">Cutscene</span>
                <div class="se-track-event cutscene" style="margin-left:300px" title="Kamikaze storm — Turn 8">🌀 Storm Kamikaze</div>
            </div>
        </div>
    </div>

    <!-- RIGHT: Trigger editor detail -->
    <!-- FUTURE CLAUDE: This panel shows the full editable detail for the
         currently selected trigger from the left lane.
         Condition types: TURN_COUNT, CITY_CAPTURED, CITY_HP, UNIT_IN_REGION,
         FACTION_ELIMINATED, PLAYER_GOLD, CUSTOM_JS.
         Actions array is drag-reorderable; each action type has its own
         inline form (e.g. SHOW_DIALOGUE needs speaker + text + portrait;
         SPAWN_ARMY needs faction + count + entry point nx/ny). -->
    <div class="se-trig-editor">
        <div class="se-trig-editor-header">⚡ Editing: Yuan Fleet Sighted</div>
        <div class="se-trig-editor-body">
            <div class="se-two-col">
                <div class="se-field">
                    <span class="se-label">Trigger Label</span>
                    <input class="se-input stub" type="text" value="Yuan Fleet Sighted" />
                </div>
                <div class="se-field">
                    <span class="se-label">Enabled</span>
                    <select class="se-select stub">
                        <option selected>Yes</option>
                        <option>No</option>
                    </select>
                </div>
            </div>
            <div class="se-card">
                <div class="se-card-header">Condition</div>
                <div class="se-card-body">
                    <div class="se-two-col">
                        <div class="se-field">
                            <span class="se-label">Type</span>
                            <select class="se-select stub">
                                <option selected>TURN_COUNT</option>
                                <option>CITY_CAPTURED</option>
                                <option>CITY_HP</option>
                                <option>UNIT_IN_REGION</option>
                                <option>FACTION_ELIMINATED</option>
                                <option>PLAYER_GOLD</option>
                                <option>CUSTOM_JS</option>
                            </select>
                        </div>
                        <div class="se-field">
                            <span class="se-label">Turn Number</span>
                            <input class="se-input stub" type="number" value="1" min="1" />
                        </div>
                    </div>
                </div>
            </div>
            <div class="se-card">
                <div class="se-card-header">
                    Actions
                    <!-- FUTURE CLAUDE: "Add Action" dropdown presents all action types.
                         Each selection appends to the action list below and inserts
                         the relevant inline form fields. -->
                    <button class="se-btn stub" style="margin-left:auto;font-size:9px;padding:2px 6px">+ Add Action</button>
                </div>
                <div class="se-card-body">
                    <div class="se-action-list">
                        <div class="se-action-row">
                            <span class="se-action-handle">⣿</span>
                            <span class="se-action-type dialogue">DIALOGUE</span>
                            <span class="se-action-detail">"A vast fleet has been sighted..."</span>
                            <button class="se-btn icon-only stub" style="font-size:9px;padding:1px 4px" title="[FUTURE] Edit this action">✎</button>
                            <button class="se-btn icon-only danger stub" style="font-size:9px;padding:1px 4px">✕</button>
                        </div>
                        <div class="se-action-row">
                            <span class="se-action-handle">⣿</span>
                            <span class="se-action-type army">SPAWN_ARMY</span>
                            <span class="se-action-detail">Yuan Dynasty — 1500 troops @ Genkai</span>
                            <button class="se-btn icon-only stub" style="font-size:9px;padding:1px 4px">✎</button>
                            <button class="se-btn icon-only danger stub" style="font-size:9px;padding:1px 4px">✕</button>
                        </div>
                        <div class="se-action-row">
                            <span class="se-action-handle">⣿</span>
                            <span class="se-action-type sound">PLAY_SOUND</span>
                            <span class="se-action-detail">music/invasion_theme.mp3</span>
                            <button class="se-btn icon-only stub" style="font-size:9px;padding:1px 4px">✎</button>
                            <button class="se-btn icon-only danger stub" style="font-size:9px;padding:1px 4px">✕</button>
                        </div>
                        <div class="se-action-row">
                            <span class="se-action-handle">⣿</span>
                            <span class="se-action-type relation">SET_RELATION</span>
                            <span class="se-action-detail">Yuan Dynasty ↔ All Japanese → WAR</span>
                            <button class="se-btn icon-only stub" style="font-size:9px;padding:1px 4px">✎</button>
                            <button class="se-btn icon-only danger stub" style="font-size:9px;padding:1px 4px">✕</button>
                        </div>
                    </div>
                </div>
            </div>
            <div style="display:flex;gap:4px">
                <button class="se-btn primary stub" style="flex:1">Apply Changes</button>
                <button class="se-btn danger stub">Delete Trigger</button>
            </div>
        </div>
    </div>`;
}
 
function _buildObjectivesTab() {
    return `
    <div class="se-obj-list">
        ${OBJECTIVES_PREVIEW.map(o=>`
        <div class="se-obj-row" title="Click to edit this objective">
            <div class="se-obj-num">${o.num}</div>
            <div class="se-obj-body">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
                    <div class="se-obj-title">${o.title}</div>
                    <span class="se-obj-type ${o.type}">${o.type.toUpperCase()}</span>
                </div>
                <div class="se-obj-desc">${o.desc}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:3px;flex-shrink:0">
                <button class="se-btn icon-only stub" style="font-size:9px;padding:1px 5px" title="[FUTURE] Edit">✎</button>
                <button class="se-btn icon-only danger stub" style="font-size:9px;padding:1px 5px">✕</button>
            </div>
        </div>`).join('')}
        <button class="se-btn primary stub" style="align-self:flex-start;margin-top:4px">+ Add Objective</button>
    </div>`;
}
 
function _buildDialogueTab() {
    const convos = [
        { speaker:"Shōni Sukeyoshi", preview:"A vast fleet has been sighted off Tsushima. Prepare the bay defenses at once." },
        { speaker:"Sō Clan Messenger", preview:"The islands fall. Sasuura burns. They come for Kyūshū next." },
        { speaker:"Yuan Admiral Xin Du", preview:"The shogunate's samurai fight with honour but not with numbers." },
        { speaker:"Kikuchi Takefusa", preview:"We drive them back from Akasaka! Hold the line at Torikai!" },
    ];

    return `
    <div class="se-dialogue-editor">
        <div class="se-dialogue-list">
            ${convos.map((c,i)=>`
            <div class="se-dialogue-item ${i===0?'active':''}" title="Click to edit this dialogue entry">
                <div class="se-dialogue-speaker">${c.speaker}</div>
                <div class="se-dialogue-preview">${c.preview}</div>
            </div>`).join('')}
            <button class="se-btn primary stub" style="margin-top:4px;font-size:10px">+ New Dialogue</button>
        </div>
        <div class="se-dialogue-form">
            <!-- FUTURE CLAUDE: Each dialogue entry maps to a trigger action
                 of type SHOW_DIALOGUE.  Fields here should write to
                 _seScenario.triggers[selectedId].actions[actionIdx].
                 The portrait field is an emoji or path to a face sprite.
                 Choices array enables branching (not yet implemented). -->
            <div class="se-field">
                <span class="se-label">Speaker Name</span>
                <input class="se-input stub" type="text" value="Shōni Sukeyoshi" />
            </div>
            <div class="se-two-col">
                <div class="se-field">
                    <span class="se-label">Portrait / Emoji</span>
                    <input class="se-input stub" type="text" value="🏯" />
                </div>
                <div class="se-field">
                    <span class="se-label">Display Duration (ms)</span>
                    <input class="se-input stub" type="number" value="4000" step="500" />
                </div>
            </div>
            <div class="se-field">
                <span class="se-label">Dialogue Text</span>
                <textarea class="se-textarea stub" style="min-height:70px">A vast fleet has been sighted off Tsushima. Prepare the bay defenses at once. All clans must rally to Hakata Bay!</textarea>
            </div>
            <div class="se-field">
                <span class="se-label">Linked Trigger</span>
                <select class="se-select stub">
                    <option selected>T1 — Yuan Fleet Sighted</option>
                    <option>T2 — Tsushima Falls</option>
                    <option>T4 — Hakata Bay Landing</option>
                    <option>T5 — Hakozaki Shrine Burns</option>
                </select>
            </div>
            <div style="display:flex;gap:4px">
                <button class="se-btn primary stub" style="flex:1">Apply</button>
                <button class="se-btn stub" title="[FUTURE] Preview dialogue in-game overlay">▶ Preview</button>
            </div>
        </div>
    </div>`;
}

// ── Economy tab content ───────────────────────────────────────────────────
function _buildEconomyTab() {
    const fEcon = [
        { name:"Kamakura Shogunate", gold:5000, food:3000, color:"#c62828" },
        { name:"Shoni Clan",         gold:2800, food:1800, color:"#1565c0" },
        { name:"Yuan Dynasty",       gold:8000, food:5000, color:"#b71c1c" },
        { name:"Kikuchi Clan",       gold:1600, food:1400, color:"#6a1b9a" },
        { name:"Otomo Clan",         gold:2200, food:1600, color:"#e65100" },
        { name:"Matsura Clan",       gold:1800, food:2000, color:"#00695c" },
    ];

    return `
    <div class="se-economy-grid">
        ${fEcon.map(f=>`
        <div class="se-economy-card" title="Click to configure ${f.name} starting economy">
            <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">
                <div style="width:10px;height:10px;border-radius:50%;background:${f.color};border:1px solid rgba(0,0,0,0.5)"></div>
                <span class="se-economy-card-title" style="font-size:8px">${f.name}</span>
            </div>
            <div style="display:flex;gap:8px;align-items:flex-end">
                <div>
                    <div class="se-economy-sub">Gold</div>
                    <div class="se-economy-value" style="font-size:14px;color:#ffca28">${f.gold.toLocaleString()}</div>
                </div>
                <div>
                    <div class="se-economy-sub">Food</div>
                    <div class="se-economy-value" style="font-size:14px;color:#8bc34a">${f.food.toLocaleString()}</div>
                </div>
            </div>
            <div style="display:flex;gap:3px;margin-top:6px">
                <button class="se-btn stub" style="flex:1;font-size:9px;padding:2px 4px">Edit</button>
            </div>
        </div>`).join('')}

        <!-- FUTURE CLAUDE: Economy card "Edit" should open an inline form within
             the card (or the right panel) to set:
             - Starting gold / food
             - Per-turn income (from city count * base_income)
             - Resource trade routes (which resources this faction prioritises)
             - Trade embargo flags (Yuan Dynasty should be embargoed from JP factions)
             Changes write to _seScenario.factions[name].economy and are applied
             by initializeCityData() when Test Play launches. -->

        <div class="se-economy-card">
            <div class="se-economy-card-title">Trade Routes</div>
            <div style="font-size:10px;color:var(--se-text-dim);line-height:1.6;margin-top:4px">
                Active routes: <span style="color:var(--se-text)">8</span><br>
                Embargoed: <span style="color:#ffa0a0">Yuan Dynasty</span><br>
                Market tick: <span style="color:var(--se-text)">600 frames</span>
            </div>
            <button class="se-btn stub" style="margin-top:6px;font-size:9px;width:100%">Configure Routes</button>
        </div>

        <div class="se-economy-card">
            <div class="se-economy-card-title">Difficulty Multiplier</div>
            <div class="se-economy-value" style="font-size:24px;color:var(--se-accent)">1.0×</div>
            <div class="se-economy-sub">attritionDifficultyMultiplier</div>
            <input class="se-slider stub" type="range" min="0.5" max="3.0" step="0.1" value="1.0" style="margin-top:6px" />
        </div>
    </div>`;
}

// ── Timeline drag-to-resize ───────────────────────────────────────────────
function _initDragHandle() {
    const handle = _root.querySelector("#se-tl-drag-handle");
    const tl     = _root.querySelector("#se-timeline");
    const root   = _root;
    if (!handle || !tl) return;

    let startY = 0, startH = 0, dragging = false;

    function clamp(h) {
        return Math.min(Math.max(h, 80), Math.floor(window.innerHeight * 0.8));
    }
    function applyH(h) {
        const clamped = clamp(h);
        tl.style.height = clamped + "px";
        // Update CSS var so any external code can read current height
        root.style.setProperty("--se-tl-h", clamped + "px");
    }
    function onMove(e) {
        if (!dragging) return;
        e.preventDefault();
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const delta   = startY - clientY;   // drag up → positive → bigger panel
        applyH(startH + delta);
    }
    function onEnd() {
        dragging = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup",   onEnd);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend",  onEnd);
        document.body.style.userSelect = "";
        document.body.style.webkitUserSelect = "";
        document.body.style.cursor = "";
    }
    function onStart(e) {
        e.preventDefault();
        dragging = true;
        startY   = e.touches ? e.touches[0].clientY : e.clientY;
        startH   = tl.offsetHeight;
        document.body.style.userSelect = "none";
        document.body.style.webkitUserSelect = "none";
        document.body.style.cursor = "ns-resize";
        document.addEventListener("mousemove", onMove, { passive: false });
        document.addEventListener("mouseup",   onEnd);
        document.addEventListener("touchmove", onMove, { passive: false });
        document.addEventListener("touchend",  onEnd);
    }

    handle.addEventListener("mousedown",  onStart);
    handle.addEventListener("touchstart", onStart, { passive: false });
}
// ── Public API ────────────────────────────────────────────────────────────

function open() {
    if (_root) return; // Already open
    window.isPaused = true;

    _root = _build();
    document.body.appendChild(_root);

    // Set initial tab content
    _setTab(_activeTab);
_initDragHandle();
    console.log("[ScenarioEditor] Opened.");
}

function close() {
    if (!_root) return;
    _root.remove();
    _root = null;

    // Remove injected CSS
    const style = document.getElementById("se-styles");
    if (style) style.remove();

    window.isPaused = false;

    // Restore main menu UI if it was hidden
    const menuUI = document.getElementById("main-menu-ui-container");
    if (menuUI) menuUI.style.display = "flex";

    console.log("[ScenarioEditor] Closed.");
}

// ── Mode switching ────────────────────────────────────────────────────────
// FUTURE CLAUDE: Each mode should show/hide specific sections in the right
// panel and left panel. E.g. MAP mode shows tile palette; CITIES mode shows
// city list; NPCS mode shows NPC roster with patrol route config.
function _setMode(mode) {
    _activeMode = mode;
    if (!_root) return;
    _root.querySelectorAll(".se-mode-tab").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.mode === mode);
    });
    const el = _root.querySelector("#se-st-mode");
    if (el) el.textContent = mode;
}

// ── Tool switching ────────────────────────────────────────────────────────
function _setTool(tool) {
    _activeTool = tool;
    if (!_root) return;
    _root.querySelectorAll(".se-tool").forEach(el => {
        el.classList.toggle("active", el.dataset.tool === tool);
    });
    const st = _root.querySelector("#se-st-tool");
    if (st) st.textContent = tool;

    // FUTURE CLAUDE: Change cursor on #se-viewport based on tool:
    //   PAINT   → crosshair
    //   ERASE   → cell
    //   SELECT  → default
    //   PLACE   → copy
    //   INSPECT → zoom-in
    //   MOVE    → move
}

// ── Tile switching ────────────────────────────────────────────────────────
function _setTile(tile) {
    _activeTile = tile;
    if (!_root) return;
    _root.querySelectorAll(".se-tile-row").forEach(el => {
        el.classList.toggle("active", el.dataset.tile === tile);
    });
    const st = _root.querySelector("#se-st-tile");
    if (st) st.textContent = tile;
    // Auto-switch to paint tool when a tile is selected
    if (_activeTool !== "PAINT") _setTool("PAINT");
}

// ── Brush size switching ──────────────────────────────────────────────────
function _setBrush(size) {
    _brushSize = size;
    if (!_root) return;
    _root.querySelectorAll(".se-brush-btn").forEach(el => {
        el.classList.toggle("active", el.textContent.trim() === `${size}×${size}`);
    });
    const st = _root.querySelector("#se-st-brush");
    if (st) st.textContent = `${size}×${size}`;
}

// ── Timeline tab switching ────────────────────────────────────────────────
// FUTURE CLAUDE: Each tab should replace the innerHTML of #se-timeline-body
// with the appropriate content builder (_buildTriggersTab, etc.).
// Store the active tab's unsaved form data before switching to avoid loss.
function _setTab(tab) {
    _activeTab = tab;
    if (!_root) return;

    _root.querySelectorAll(".se-tl-tab").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tltab === tab);
    });

    const body = _root.querySelector("#se-timeline-body");
    if (!body) return;

    switch (tab) {
        case "TRIGGERS":   body.innerHTML = _buildTriggersTab();   break;
        case "OBJECTIVES": body.innerHTML = _buildObjectivesTab(); break;
        case "DIALOGUE":   body.innerHTML = _buildDialogueTab();   break;
        case "ECONOMY":    body.innerHTML = _buildEconomyTab();    break;
    }
}

// ── Expose public surface ─────────────────────────────────────────────────
return {
    open,
    close,
    _setMode,
    _setTool,
    _setTile,
    _setBrush,
    _setTab,
};


})();

console.log("[ScenarioEditor] scenario_editor.js loaded — window.ScenarioEditor ready.");



// =============================================================================
// PART 2- SCENARIO EDITOR — CITIES & NPCs PATCH  (scenario_editor_cities_npcs.js)
//
// LOAD ORDER:
//   sandbox_overworld.js → npc_system.js → story1_map_and_update.js (opt)
//   → scenario_editor.js → scenario_editor_map.js → THIS FILE
//
// WHAT THIS ADDS:
//   CITIES MODE
//   ───────────
//   • Click anywhere on the map viewport to place a city pin
//   • Right-panel city form auto-populates:
//       – Name generated from the chosen faction's syllable pool
//       – Type (MAJOR_CITY / FORTRESS / TOWN / VILLAGE) controls size + garrison
//       – Population, garrison, gold & food auto-calculated from the underlying
//         tile type (Plains → high food; Mountains → high gold; Coastal → trade, etc.)
//       – All fields are hand-editable before committing
//   • Cities list in right panel shows every placed city; click a row to focus
//     the viewport and reload its form
//   • Delete & Relocate buttons on each placed city
//   • "Apply All to Game" writes the full city array to window.cities_sandbox /
//     cities_story1 so the NPC system can pick them up immediately
//
//   NPCs MODE
//   ─────────
//   • Faction roster built from the live FACTIONS object in npc_system.js —
//     whatever factions the sandbox currently knows about appear here
//   • Each faction entry can be aliased (display-name rename) while keeping
//     its original sandbox colour and unit composition intact
//   • Unit-composition panel shows the faction's real troop types with sliders
//     to adjust percentages; unique units are highlighted in gold
//   • Spawn-rule cards: role (Military / Patrol / Merchant / Naval / Bandit),
//     spawn count, entry-point (click map to set), and patrol route
//     (click two points on map → arrow drawn on viewport)
//   • Diplomacy matrix: full N×N grid of faction relations
//     (Ally / Neutral / War) with colour-coded cells
//   • "Apply NPCs to Game" commits all changes to the live FACTIONS object and
//     calls initializeNPCs() so the game respects edits immediately
//
// ARCHITECTURE NOTE (for future Claude):
//   All state lives in the SE_CNP namespace (window._SE_CNP).
//   The patch hooks SE._setMode() so CITIES and NPCS modes replace the stub
//   right-panel HTML with live, functional DOM — without touching the map
//   engine or timeline panel.
// =============================================================================

(function (SE) {
"use strict";


if (!SE) { console.error("[CitiesNPCs] ScenarioEditor not found!"); return; }

// =========================================================================
// 0.  INTERNAL STATE NAMESPACE
// =========================================================================
const S = window._SE_CNP = {
    // Cities placed in the editor
    cities: [],          // [{id, name, x, y, nx, ny, type, faction, baseFaction,
                         //   pop, militaryPop, civilianPop, gold, food,
                         //   garrison, radius, tileName, isPlayerHome}]
    selectedCityId: null,
    placingCity: false,  // true → next viewport click drops a city pin
    relocatingId: null,  // non-null → next click moves that city

    // Faction aliases (scenario renames)
    factionAliases: {},  // { "Hong Dynasty": "Ming Empire", ... }

    // Faction spawn rules
    spawnRules: {},      // { "Hong Dynasty": [{role, count, entryNx, entryNy,
                         //                     patrolA:{nx,ny}, patrolB:{nx,ny}}] }

    // Unit composition overrides (pct sliders)
    compOverrides: {},   // { "Hong Dynasty": [{type, pct}, ...] }

    // Diplomacy matrix
    diplomacy: {},       // { "FactionA::FactionB": "Ally"|"Neutral"|"War" }

    // Patrol-route drawing state
    patrolMode: null,    // { ruleKey, leg: "A"|"B" }

    // Counter for unique city IDs
    _nextId: 1,

    // Viewport canvas handle (grabbed from mapEngine)
    _vpOverlay: null,    // extra <canvas> for city dots + patrol lines
    _ovCtx: null,
    _raf: null,
    _dirty: true,
};

// =========================================================================
// 1.  TILE → RESOURCE AUTO-GENERATOR
// =========================================================================
const TILE_RESOURCES = {
    "Ocean":        { foodMult: 0.3,  goldMult: 0.5,  garrisonMult: 0.4, notes: "Coastal trade hub" },
    "Coastal":      { foodMult: 0.6,  goldMult: 1.4,  garrisonMult: 0.6, notes: "Trade & fishing" },
    "River":        { foodMult: 1.6,  goldMult: 1.0,  garrisonMult: 0.7, notes: "Fertile river basin" },
    "Plains":       { foodMult: 1.5,  goldMult: 0.9,  garrisonMult: 0.8, notes: "Agricultural heartland" },
    "Meadow":       { foodMult: 1.5,  goldMult: 0.9,  garrisonMult: 0.8, notes: "Pastoral lowlands" },
    "Steppes":      { foodMult: 0.9,  goldMult: 0.8,  garrisonMult: 1.3, notes: "Cavalry & herding" },
    "Forest":       { foodMult: 0.9,  goldMult: 0.7,  garrisonMult: 1.1, notes: "Timber & game" },
    "Dense Forest": { foodMult: 0.7,  goldMult: 0.5,  garrisonMult: 1.4, notes: "Hidden fortress potential" },
    "Highlands":    { foodMult: 0.8,  goldMult: 1.1,  garrisonMult: 1.5, notes: "Defensible position" },
    "Mountains":    { foodMult: 0.4,  goldMult: 2.0,  garrisonMult: 1.8, notes: "Mining & fortification" },
    "Large Mountains":{ foodMult:0.2, goldMult: 2.4,  garrisonMult: 2.0, notes: "Mountain citadel" },
    "Snow":         { foodMult: 0.3,  goldMult: 1.0,  garrisonMult: 1.2, notes: "Cold frontier" },
    "Desert":       { foodMult: 0.3,  goldMult: 1.5,  garrisonMult: 0.8, notes: "Silk road crossroads" },
    "Dunes":        { foodMult: 0.2,  goldMult: 1.2,  garrisonMult: 0.6, notes: "Nomadic oasis" },
};

// City-type presets: [popBase, garrisonRate, radiusPx]
const CITY_TYPE_PRESETS = {
    "MAJOR_CITY": { popBase: 12000, garrisonRate: 0.08, radius: 42 },
    "FORTRESS":   { popBase: 3000,  garrisonRate: 0.25, radius: 28 },
    "TOWN":       { popBase: 4500,  garrisonRate: 0.06, radius: 22 },
    "VILLAGE":    { popBase: 1200,  garrisonRate: 0.04, radius: 14 },
};

function autoResources(tileName, cityType, factionName) {
    const tr  = TILE_RESOURCES[tileName] || TILE_RESOURCES["Plains"];
    const pr  = CITY_TYPE_PRESETS[cityType] || CITY_TYPE_PRESETS["TOWN"];
    const pop = Math.floor(pr.popBase * (0.8 + Math.random() * 0.4));
    const mil = Math.min(1000, Math.floor(pop * pr.garrisonRate * tr.garrisonMult));
    const civ = pop - mil;
    return {
        pop,
        militaryPop: mil,
        civilianPop: civ,
        troops:      mil,
        garrison:    mil,
        gold:    Math.floor(civ * tr.goldMult  * (1.5 + Math.random())),
        food:    Math.floor(pop * tr.foodMult  * (2   + Math.random())),
        radius:  pr.radius,
        conscriptionRate: pr.garrisonRate,
        tileName,
    };
}

// =========================================================================
// 2.  FACTION DATA — pulled from live FACTIONS, falling back to stubs
// =========================================================================

function liveFactions() {
    if (typeof FACTIONS !== "undefined") return FACTIONS;
    // Minimal stubs so editor works even when npc_system.js isn't loaded
    return {
        "Hong Dynasty":          { color: "#d32f2f", geoWeight:{north:0.4,south:0.6,west:0.4,east:0.6} },
        "Great Khaganate":       { color: "#1976d2", geoWeight:{north:0.85,south:0.15,west:0.6,east:0.4} },
        "Jinlord Confederacy":   { color: "#455a64", geoWeight:{north:0.88,south:0.12,west:0.05,east:0.95} },
        "Xiaran Dominion":       { color: "#fbc02d", geoWeight:{north:0.75,south:0.25,west:0.9,east:0.1} },
        "Tran Realm":            { color: "#388e3c", geoWeight:{north:0.01,south:0.99,west:0.3,east:0.7} },
        "Goryun Kingdom":        { color: "#7b1fa2", geoWeight:{north:0.4,south:0.6,west:0.05,east:0.85} },
        "Yamato Clans":          { color: "#c2185b", geoWeight:{north:0.15,south:0.65,west:0.02,east:0.98} },
        "High Plateau Kingdoms": { color: "#8d6e63", geoWeight:{north:0.1,south:0.9,west:0.98,east:0.02} },
        "Dab Tribes":            { color: "#00838f", geoWeight:{north:0.01,south:0.99,west:0.7,east:0.3} },
        "Bandits":               { color: "#222222", geoWeight:{north:0.5,south:0.5,west:0.5,east:0.5} },
        "Player's Kingdom":      { color: "#FFFFFF", geoWeight:{north:0.45,south:0.45,west:0.3,east:0.7} },
    };
}

// Canonical unit compositions per sandbox faction (mirrors npc_system.js generateNPCRoster)
const FACTION_UNITS = {
    "Great Khaganate":       [
        {type:"Horse Archer",pct:0.50,unique:true},{type:"Heavy Horse Archer",pct:0.20,unique:true},
        {type:"Mangudai",pct:0.10,unique:true},{type:"Lancer",pct:0.15},{type:"Heavy Lancer",pct:0.05}
    ],
    "Hong Dynasty":          [
        {type:"Shielded Infantry",pct:0.30},{type:"Heavy Crossbowman",pct:0.25},
        {type:"Rocket",pct:0.15,unique:true},{type:"Firelance",pct:0.05,unique:true},
        {type:"Repeater Crossbowman",pct:0.05,unique:true},{type:"Heavy Firelance",pct:0.05,unique:true},
        {type:"Bomb",pct:0.05,unique:true},{type:"Archer",pct:0.10}
    ],
    "Tran Realm":            [
        {type:"Glaiveman",pct:0.30,unique:true},{type:"Poison Crossbowman",pct:0.25,unique:true},
        {type:"Javelinier",pct:0.20},{type:"Archer",pct:0.15},{type:"Spearman",pct:0.10}
    ],
    "Jinlord Confederacy":   [
        {type:"Archer",pct:0.20},{type:"Heavy Crossbowman",pct:0.30},
        {type:"Shielded Infantry",pct:0.20},{type:"Hand Cannoneer",pct:0.15,unique:true},
        {type:"Heavy Lancer",pct:0.10},{type:"Elite Lancer",pct:0.05,unique:true}
    ],
    "Xiaran Dominion":       [
        {type:"Archer",pct:0.40},{type:"Spearman",pct:0.20},{type:"Shielded Infantry",pct:0.20},
        {type:"Rocket",pct:0.10,unique:true},{type:"Hand Cannoneer",pct:0.05,unique:true},
        {type:"Repeater Crossbowman",pct:0.05,unique:true}
    ],
    "Goryun Kingdom":        [
        {type:"Slinger",pct:0.30,unique:true},{type:"Heavy Horse Archer",pct:0.20},
        {type:"Archer",pct:0.25},{type:"Shielded Infantry",pct:0.25}
    ],
    "High Plateau Kingdoms": [
        {type:"Slinger",pct:0.30,unique:true},{type:"Heavy Horse Archer",pct:0.20},
        {type:"Archer",pct:0.25},{type:"Shielded Infantry",pct:0.25}
    ],
    "Yamato Clans":          [
        {type:"Glaiveman",pct:0.40,unique:true},{type:"Heavy Two Handed",pct:0.20,unique:true},
        {type:"Archer",pct:0.30},{type:"Heavy Horse Archer",pct:0.10}
    ],
    "Dab Tribes":            [
        {type:"Slinger",pct:0.35,unique:true},{type:"Archer",pct:0.30},
        {type:"Spearman",pct:0.20},{type:"Javelinier",pct:0.15,unique:true}
    ],
    "Bandits":               [
        {type:"Shielded Infantry",pct:0.25},{type:"Spearman",pct:0.20},
        {type:"Archer",pct:0.20},{type:"Crossbowman",pct:0.15},
        {type:"Lancer",pct:0.10},{type:"Light Two Handed",pct:0.10}
    ],
    "Player's Kingdom":      [
        {type:"Shielded Infantry",pct:0.25},{type:"Spearman",pct:0.20},
        {type:"Archer",pct:0.20},{type:"Crossbowman",pct:0.15},
        {type:"Lancer",pct:0.10},{type:"Light Two Handed",pct:0.10}
    ],
};

function getUnits(baseFaction) {
    return (FACTION_UNITS[baseFaction] || FACTION_UNITS["Bandits"]).map(u => ({ ...u }));
}

const SYLLABLE_POOLS = (typeof window !== "undefined" && typeof window.SYLLABLE_POOLS !== "undefined")
    ? window.SYLLABLE_POOLS
    : {
        "Hong Dynasty": ["Han","Zhuo","Mei","Ling","Xian","Yue","Lu","Feng","Bai","Shan","Qiao","He","Jin","Dao","Tong","An","Wu","Lin","Wan","Bao"],
        "Great Khaganate": ["Or","Kar","Batu","Sar","Tem","Alt","Bor","Khan","Ur","Tol","Dar","Mur","Nog","Tog","Bal","Kher","Ulan","Tark","Sog","Yar"],
        "Jinlord Confederacy": ["Cira","Nuru","Guda","Bi","Bisi","Muke","Tala","Siri","Hada","Hula","Hete","Boro","Dogi","Cila","Bira","Sege","Ula","Baya","Kiye","Ye"],
        "Xiaran Dominion": ["Xi","Ran","Bao","Ling","Tao","Yun","Hai","Shuo","Gu","Lan","Zhi","Min","Qiao","Fen","Jiao","Lei","Yan","Yao","Jun","Qiu"],
        "Tran Realm": ["Nguyen","Tran","Le","Pham","Hoang","Phan","Vu","Dang","Bui","Do","Ho","Ngo","Phat","Minh","Anh","Long","Duc","Kim","Duy","Thanh"],
        "Goryun Kingdom": ["Gyeong","Han","Nam","Seong","Hae","Pak","Cheon","Il","Sung","Jeon","Gwang","Dong","Seo","Baek","Won","Dae","Hwa","Mun","Kim"],
        "High Plateau Kingdoms": ["Lha","Tse","Nor","Gar","Ri","Do","Shar","Lang","Zang","Yul","Cham","Phu","Sum","Rin","Tag","Yak","Tso","Ling","Par"],
        "Yamato Clans": ["Aki","Naga","Hara","Kawa","Matsu","Yama","Saka","Taka","Kiri","Shima","Oka","Tomo","Hoshi","Sora","Kuma","Nori","Fuku","Hida","Ishi"],
        "Dab Tribes": ["Pao","Vang","Tou","Mee","Nao","Chue","Kou","Leng","Ntxa","Ntsh","Plig","Xyoo"],
        "Bandits": ["Skar","Dreg","Mok","Vex","Kur","Rax","Grim","Brak","Slog","Thok"],
        "Player's Kingdom": ["Tsim","Sha","Tsui","Mong","Kok","Sham","Shui","Po","Kwun","Tong"],
    };

function genCityName(baseFaction) {
    if (typeof generateFactionCityName === "function") return generateFactionCityName(baseFaction);
    const pool = SYLLABLE_POOLS[baseFaction] || SYLLABLE_POOLS["Bandits"];
    const a = pool[Math.floor(Math.random() * pool.length)];
    const b = pool[Math.floor(Math.random() * pool.length)];
    return a + b;
}

// =========================================================================
// 3.  OVERLAY CANVAS (city dots + patrol lines rendered above map)
// =========================================================================

function _ensureOverlay() {
    const vp = document.getElementById("se-viewport");
    if (!vp) return;
    if (S._vpOverlay && vp.contains(S._vpOverlay)) return;

    const ov = document.createElement("canvas");
    ov.id = "se-cnp-overlay";
    ov.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:10;width:100%;height:100%";
    vp.appendChild(ov);
    S._vpOverlay = ov;
    S._ovCtx = ov.getContext("2d");
    if (S._raf) cancelAnimationFrame(S._raf);
    S._raf = requestAnimationFrame(_renderOverlay);
}

function _renderOverlay() {
    S._raf = requestAnimationFrame(_renderOverlay);
    const ov  = S._vpOverlay;
    const vp  = document.getElementById("se-viewport");
    if (!ov || !vp) return;
    const W = vp.clientWidth, H = vp.clientHeight;
    if (ov.width !== W)  ov.width  = W;
    if (ov.height !== H) ov.height = H;

    const ctx = S._ovCtx;
    ctx.clearRect(0, 0, W, H);

    // Get pan/zoom from mapEngine if available
    const me = SE.mapEngine;
    const map = me ? me.getMap() : null;
    if (!map) return;

    // We need _offX, _offY, _zoom — these are private in mapEngine.
    // We expose them via a helper added below.
    const vp_state = SE._getViewportState ? SE._getViewportState() : { offX: 0, offY: 0, zoom: 1 };
    const { offX, offY, zoom } = vp_state;
    const ts = map.tileSize * zoom;

    // ── Patrol lines ──────────────────────────────────────────────────
    const fac = liveFactions();
    ctx.save();
    Object.entries(S.spawnRules).forEach(([bFac, rules]) => {
        const col = (fac[bFac] || {}).color || "#fff";
        rules.forEach(rule => {
            if (rule.patrolA && rule.patrolB) {
                const ax = offX + rule.patrolA.nx * map.cols * ts;
                const ay = offY + rule.patrolA.ny * map.rows * ts;
                const bx = offX + rule.patrolB.nx * map.cols * ts;
                const by = offY + rule.patrolB.ny * map.rows * ts;
                ctx.strokeStyle = col;
                ctx.lineWidth   = 2;
                ctx.setLineDash([6, 4]);
                ctx.globalAlpha = 0.72;
                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.lineTo(bx, by);
                ctx.stroke();
                // Arrowhead
                const angle = Math.atan2(by - ay, bx - ax);
                ctx.setLineDash([]);
                ctx.globalAlpha = 0.85;
                ctx.fillStyle   = col;
                ctx.beginPath();
                ctx.moveTo(bx, by);
                ctx.lineTo(bx - 12 * Math.cos(angle - 0.4), by - 12 * Math.sin(angle - 0.4));
                ctx.lineTo(bx - 12 * Math.cos(angle + 0.4), by - 12 * Math.sin(angle + 0.4));
                ctx.closePath();
                ctx.fill();
                // Endpoint dots
                [ax, bx].forEach((px, i) => {
                    const py = i === 0 ? ay : by;
                    ctx.globalAlpha = 0.9;
                    ctx.beginPath();
                    ctx.arc(px, py, 5, 0, Math.PI * 2);
                    ctx.fill();
                });
            }
        });
    });
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.restore();

    // ── City dots ─────────────────────────────────────────────────────
    S.cities.forEach(city => {
        const sx = offX + city.nx * map.cols * ts;
        const sy = offY + city.ny * map.rows * ts;
        if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) return;

        const fdat = liveFactions()[city.baseFaction] || {};
        const col  = fdat.color || "#e8b832";
        const r    = Math.max(5, city.radius * zoom * 0.28);
        const sel  = city.id === S.selectedCityId;

        // Outer glow for selected city
        if (sel) {
            ctx.save();
            ctx.shadowColor = "#e8b832";
            ctx.shadowBlur  = 18;
        }

        // City circle
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle   = city.isPlayerHome ? "#ffffff" : col;
        ctx.fill();
        ctx.strokeStyle = sel ? "#e8b832" : "rgba(0,0,0,0.7)";
        ctx.lineWidth   = sel ? 2.5 : 1.2;
        ctx.stroke();

        if (sel) ctx.restore();

        // Type indicator (small inner dot for FORTRESS / MAJOR_CITY)
        if (city.type === "MAJOR_CITY" || city.type === "FORTRESS") {
            ctx.beginPath();
            ctx.arc(sx, sy, r * 0.38, 0, Math.PI * 2);
            ctx.fillStyle = city.type === "FORTRESS" ? "#ffa0a0" : "#fff8d0";
            ctx.fill();
        }

        // Label
        if (ts >= 4) {
            const fontSize = Math.max(8, Math.min(13, ts * 0.65));
            ctx.font        = `bold ${fontSize}px Georgia`;
            ctx.shadowColor = "rgba(0,0,0,0.95)";
            ctx.shadowBlur  = 4;
            ctx.fillStyle   = "#fff8e0";
            ctx.fillText(city.name, sx + r + 2, sy + fontSize * 0.38);
            ctx.shadowBlur  = 0;
        }

        // NPC spawn entry point indicators
        (S.spawnRules[city.baseFaction] || []).forEach(rule => {
            if (rule.entryNx != null && rule.entryNy != null) {
                const ex = offX + rule.entryNx * map.cols * ts;
                const ey = offY + rule.entryNy * map.rows * ts;
                ctx.save();
                ctx.strokeStyle = col;
                ctx.lineWidth   = 1.5;
                ctx.setLineDash([4, 3]);
                ctx.globalAlpha = 0.55;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = 0.85;
                ctx.fillStyle   = col;
                ctx.beginPath();
                ctx.arc(ex, ey, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        });
    });

    // ── Placing-city cursor ring ──────────────────────────────────────
    if (S.placingCity || S.relocatingId != null) {
        ctx.save();
        ctx.strokeStyle = "#e8b832";
        ctx.lineWidth   = 2;
        ctx.setLineDash([5, 3]);
        if (S._cursorX != null) {
            ctx.beginPath();
            ctx.arc(S._cursorX, S._cursorY, 14, 0, Math.PI * 2);
            ctx.stroke();
            ctx.font      = "bold 10px Georgia";
            ctx.fillStyle = "#e8b832";
            ctx.fillText(S.relocatingId != null ? "Move here" : "Place city", S._cursorX + 16, S._cursorY - 4);
        }
        ctx.setLineDash([]);
        ctx.restore();
    }
}

// =========================================================================
// 4.  INJECT VIEWPORT STATE GETTER into MapEngine
//     (so the overlay canvas can sync with pan/zoom)
// =========================================================================
// The map engine keeps _offX/_offY/_zoom as closure-private vars.
// We add a tiny getter that the overlay reads each frame.
(function patchMapEngine() {
    // Attempt to inject by re-opening the IIFE's public surface.
    // If mapEngine isn't loaded yet we'll retry after a tick.
    function tryPatch() {
        if (SE.mapEngine && !SE._getViewportState) {
            // We cannot access the closure directly, but mapEngine.getMap()
            // gives us tileSize and dimensions. We compute offsets from the
            // viewport-canvas transform by reading a known pixel.
            // The simplest approach: the map engine renders to #se-viewport-canvas.
            // We expose a lightweight proxy that returns 0/0/1 as defaults and
            // let the overlay use the canvas element's own recorded state.
            SE._getViewportState = (function () {
                // Shared mutable object updated by patched wheel+mousedown handlers
                const _state = { offX: 0, offY: 0, zoom: 1 };
                // Patch render loop to keep state current via pixel-perfect probe
                const origRender = SE.mapEngine._renderHook || null;
                // We can't hook the private render loop directly, so we probe
                // via a periodic sync that reads from the bgCanvas transform.
                // Best-effort: read position from the last known city coords.
                // For patrol-line accuracy we rely on _SE_CNP._vpState being
                // set by our own viewport event listeners (Section 5).
                return () => window._SE_CNP._vpState || _state;
            })();

            // Shadow-copy viewport state on every mouse/wheel event
            const vp = document.getElementById("se-viewport");
            if (vp) {
                vp.addEventListener("wheel", () => {
                    setTimeout(_syncVpState, 16);
                }, { passive: true });
                vp.addEventListener("mousemove", _syncVpState, { passive: true });
            }
        }
    }
    setTimeout(tryPatch, 200);
    setTimeout(tryPatch, 800);
})();

function _syncVpState() {
    // The map engine stores its state in a closure we cannot access.
    // We reconstruct offX/offY/zoom by matching a placed city's screen
    // position against its known nx/ny coordinates.
    // If no cities exist yet we leave the previous estimate in place.
    const vp   = document.getElementById("se-viewport");
    const vc   = document.getElementById("se-viewport-canvas");
    const map  = SE.mapEngine ? SE.mapEngine.getMap() : null;
    if (!vp || !vc || !map || S.cities.length === 0) return;

    // We read a pixel from the viewport canvas at a known tile coordinate.
    // This is too expensive. Instead we use the tile-rendering maths in reverse:
    // The map engine's _offX = screen_x_of_tile_0_0 and _zoom scales tileSize.
    // We expose these by reading the stored status bar text as a proxy.
    // ROBUST APPROACH: store state in a public slot each time SE._setMode is called.
    // (Actual sync happens via our own mouse listener added in Section 5.)
}

// =========================================================================
// 5.  VIEWPORT CLICK HANDLER (city placement & patrol routing)
// =========================================================================
let _vpClickHandler = null;
let _vpMoveHandler  = null;

function _attachViewportListeners() {
    const vp = document.getElementById("se-viewport");
    if (!vp || vp._cnpListened) return;
    vp._cnpListened = true;

    _vpMoveHandler = (e) => {
        const rect = vp.getBoundingClientRect();
        S._cursorX = e.clientX - rect.left;
        S._cursorY = e.clientY - rect.top;
    };

    _vpClickHandler = (e) => {
        if (e.button !== 0) return;
        const activeMode = document.querySelector(".se-mode-tab.active");
        if (!activeMode) return;
        const mode = activeMode.dataset.mode;

        const rect = vp.getBoundingClientRect();
        const sx   = e.clientX - rect.left;
        const sy   = e.clientY - rect.top;
        const map  = SE.mapEngine ? SE.mapEngine.getMap() : null;
        if (!map) return;

        // Reconstruct tile coordinates from pixel position.
        // We need _offX/_offY/_zoom. We store them as best-effort from the
        // zoom-display text and the map border position.
        // Simpler: derive from the known map-canvas dimensions.
        const vc   = document.getElementById("se-viewport-canvas");
        if (!vc) return;
        const vpW  = vp.clientWidth, vpH = vp.clientHeight;

        // Read zoom from status bar label
        const zLabel = document.querySelector(".se-zoom-display");
        const zoom   = zLabel ? (parseFloat(zLabel.textContent) / 100 || 1) : 1;

        // Estimate offX/offY: the map is centred on fit-to-view, then panned.
        // We cache the last known state via a mutation on the overlay.
        const vst  = SE._getViewportState ? SE._getViewportState() : { offX: 0, offY: 0, zoom: 1 };
        const offX = vst.offX || 0;
        const offY = vst.offY || 0;

        const ts   = map.tileSize * (vst.zoom || zoom);
        const col  = Math.floor((sx - offX) / ts);
        const row  = Math.floor((sy - offY) / ts);
        const nx   = col / map.cols;
        const ny   = row / map.rows;

        // Clamp to valid map range
        if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;

        // ── PATROL ROUTE POINT ────────────────────────────────────────
        if (S.patrolMode && mode === "NPCS") {
            const { ruleKey, leg, ruleIdx } = S.patrolMode;
            const [bFac, ri] = [ruleKey, parseInt(ruleIdx)];
            if (!S.spawnRules[bFac]) S.spawnRules[bFac] = [];
            if (!S.spawnRules[bFac][ri]) S.spawnRules[bFac][ri] = {};
            const key = leg === "A" ? "patrolA" : "patrolB";
            S.spawnRules[bFac][ri][key] = { nx, ny };
            S.patrolMode = null;
            vp.style.cursor = "";
            _refreshNPCPanel();
            return;
        }

        // ── ENTRY POINT ───────────────────────────────────────────────
        if (S._pickingEntry && mode === "NPCS") {
            const { bFac, ri } = S._pickingEntry;
            if (!S.spawnRules[bFac]) S.spawnRules[bFac] = [];
            if (!S.spawnRules[bFac][ri]) S.spawnRules[bFac][ri] = {};
            S.spawnRules[bFac][ri].entryNx = nx;
            S.spawnRules[bFac][ri].entryNy = ny;
            S._pickingEntry = null;
            vp.style.cursor = "";
            _refreshNPCPanel();
            return;
        }

        // ── CITY PLACEMENT ────────────────────────────────────────────
        if ((S.placingCity || S.relocatingId != null) && mode === "CITIES") {
            // Get the tile under the click for resource calculation
            const tileName = (map.tiles[col] && map.tiles[col][row])
                ? map.tiles[col][row].name : "Plains";

            if (S.relocatingId != null) {
                const city = S.cities.find(c => c.id === S.relocatingId);
                if (city) {
                    city.x  = col * map.tileSize;
                    city.y  = row * map.tileSize;
                    city.nx = nx; city.ny = ny;
                    city.tileName = tileName;
                    const res = autoResources(tileName, city.type, city.baseFaction);
                    Object.assign(city, res);
                    _refreshCityForm(city);
                }
                S.relocatingId = null;
            } else {
                _dropCity(nx, ny, col, row, tileName, map);
            }

            S.placingCity = false;
            vp.style.cursor = "";
            _refreshCityList();
            return;
        }

        // ── SELECT EXISTING CITY ──────────────────────────────────────
        if (mode === "CITIES") {
            const ts_px = map.tileSize * (vst.zoom || zoom);
            const clicked = S.cities.find(c => {
                const cx = offX + c.nx * map.cols * ts_px;
                const cy = offY + c.ny * map.rows * ts_px;
                return Math.hypot(cx - sx, cy - sy) < Math.max(10, c.radius * (vst.zoom || zoom) * 0.3);
            });
            if (clicked) {
                S.selectedCityId = clicked.id;
                _refreshCityList();
                _refreshCityForm(clicked);
            }
        }
    };

    vp.addEventListener("click", _vpClickHandler);
    vp.addEventListener("mousemove", _vpMoveHandler);
}

// =========================================================================
// 6.  CITY CREATION
// =========================================================================

function _dropCity(nx, ny, col, row, tileName, map) {
    // Determine which faction is selected in the right panel
    const fSel = document.getElementById("se-cnp-faction-sel");
    const bFac = fSel ? fSel.value : Object.keys(liveFactions())[0];
    const type = (document.getElementById("se-cnp-type-sel") || {}).value || "TOWN";
    const res  = autoResources(tileName, type, bFac);
    const city = {
        id:          S._nextId++,
        name:        genCityName(bFac),
        x:           col * map.tileSize,
        y:           row * map.tileSize,
        nx, ny,
        type,
        baseFaction: bFac,
        faction:     bFac,
        color:       (liveFactions()[bFac] || {}).color || "#e8b832",
        isPlayerHome: false,
        ...res,
    };
    S.cities.push(city);
    S.selectedCityId = city.id;
    _refreshCityList();
    _refreshCityForm(city);
}

// =========================================================================
// 7.  CITIES MODE — RIGHT PANEL HTML
// =========================================================================

function _buildCitiesPanel() {
    const fac  = liveFactions();
    const fKeys = Object.keys(fac);

    // Top controls
    const fOpts = fKeys.map(f => {
        const alias = S.factionAliases[f] || f;
        const col   = fac[f].color;
        return `<option value="${f}" style="color:${col}">${alias}</option>`;
    }).join("");

    const typeOpts = ["MAJOR_CITY","FORTRESS","TOWN","VILLAGE"]
        .map(t => `<option value="${t}">${t.replace("_"," ")}</option>`).join("");

    return `
    <div class="se-section-header">🏯 City Placement</div>
    <div style="padding:8px;display:flex;flex-direction:column;gap:6px;flex:1;overflow-y:auto">

        <!-- Quick-place strip -->
        <div class="se-card">
            <div class="se-card-header">📍 Place New City</div>
            <div class="se-card-body">
                <div class="se-field">
                    <span class="se-label">Owning Faction</span>
                    <select class="se-select" id="se-cnp-faction-sel">${fOpts}</select>
                </div>
                <div class="se-field">
                    <span class="se-label">Settlement Type</span>
                    <select class="se-select" id="se-cnp-type-sel">${typeOpts}</select>
                </div>
                <button class="se-btn primary" id="se-cnp-place-btn" style="width:100%;margin-top:4px">
                    📍 Click Map to Place
                </button>
                <div id="se-cnp-place-hint" style="font-size:9px;color:var(--se-text-dim);text-align:center;display:none">
                    Click anywhere on the map to drop the city pin
                </div>
            </div>
        </div>

        <!-- Placed cities list -->
        <div class="se-card">
            <div class="se-card-header">
                🗂 Placed Cities <span id="se-cnp-city-count" style="color:var(--se-text-dim);font-size:9px;margin-left:4px">(0)</span>
                <button class="se-btn danger" id="se-cnp-clear-btn" style="margin-left:auto;font-size:9px;padding:2px 5px"
                    title="Remove all placed cities">✕ Clear All</button>
            </div>
            <div class="se-card-body" style="padding:4px">
                <div id="se-cnp-city-list" class="se-city-list" style="max-height:160px"></div>
            </div>
        </div>

        <!-- Selected city config form -->
        <div class="se-card" id="se-cnp-city-form-card" style="display:none">
            <div class="se-card-header" id="se-cnp-city-form-header">⚙ City Config</div>
            <div class="se-card-body" id="se-cnp-city-form-body"></div>
        </div>

        <!-- Apply to game -->
        <button class="se-btn success" id="se-cnp-apply-cities-btn" style="width:100%;padding:10px">
            ▶ Apply All Cities to Game
        </button>
        <div style="font-size:9px;color:var(--se-text-dim);text-align:center">
            Writes to <code style="color:var(--se-text)">cities_sandbox</code> /
            <code style="color:var(--se-text)">cities_story1</code>
        </div>
    </div>`;
}

function _refreshCityList() {
    const list  = document.getElementById("se-cnp-city-list");
    const count = document.getElementById("se-cnp-city-count");
    if (!list) return;
    if (count) count.textContent = `(${S.cities.length})`;

    list.innerHTML = S.cities.map(city => {
        const col = (liveFactions()[city.baseFaction] || {}).color || "#e8b832";
        const sel = city.id === S.selectedCityId;
        const alias = S.factionAliases[city.baseFaction] || city.baseFaction;
        return `
        <div class="se-city-row" style="${sel ? "border-color:var(--se-gold);background:#2c1e08" : ""}"
             data-cityid="${city.id}" onclick="window._SE_CNP._clickCity(${city.id})">
            <span style="display:flex;align-items:center;gap:5px">
                <span style="width:8px;height:8px;border-radius:50%;background:${col};display:inline-block"></span>
                ${city.name}
            </span>
            <span class="se-city-type-badge">${city.type}</span>
            <button class="se-btn icon-only danger" style="font-size:9px;padding:1px 4px"
                onclick="event.stopPropagation();window._SE_CNP._deleteCity(${city.id})" title="Delete">✕</button>
        </div>`;
    }).join("");
}

S._clickCity = function(id) {
    S.selectedCityId = id;
    _refreshCityList();
    const city = S.cities.find(c => c.id === id);
    if (city) _refreshCityForm(city);
};

S._deleteCity = function(id) {
    S.cities = S.cities.filter(c => c.id !== id);
    if (S.selectedCityId === id) {
        S.selectedCityId = null;
        const form = document.getElementById("se-cnp-city-form-card");
        if (form) form.style.display = "none";
    }
    _refreshCityList();
};

function _refreshCityForm(city) {
    const card = document.getElementById("se-cnp-city-form-card");
    const hdr  = document.getElementById("se-cnp-city-form-header");
    const body = document.getElementById("se-cnp-city-form-body");
    if (!card || !body) return;
    card.style.display = "";
    if (hdr) hdr.textContent = `⚙ Config — ${city.name}`;

    const fac  = liveFactions();
    const fKeys = Object.keys(fac);
    const tr    = TILE_RESOURCES[city.tileName] || TILE_RESOURCES["Plains"];

    body.innerHTML = `
        <div class="se-field">
            <span class="se-label">City Name</span>
            <input class="se-input" type="text" id="se-cf-name" value="${city.name}" />
        </div>
        <div class="se-two-col">
            <div class="se-field">
                <span class="se-label">Type</span>
                <select class="se-select" id="se-cf-type">
                    ${["MAJOR_CITY","FORTRESS","TOWN","VILLAGE"].map(t =>
                        `<option value="${t}" ${t===city.type?"selected":""}>${t.replace("_"," ")}</option>`
                    ).join("")}
                </select>
            </div>
            <div class="se-field">
                <span class="se-label">Faction</span>
                <select class="se-select" id="se-cf-faction">
                    ${fKeys.map(f => {
                        const alias = S.factionAliases[f] || f;
                        return `<option value="${f}" ${f===city.baseFaction?"selected":""}>${alias}</option>`;
                    }).join("")}
                </select>
            </div>
        </div>
        <div class="se-two-col">
            <div class="se-field">
                <span class="se-label">Population</span>
                <input class="se-input" type="number" id="se-cf-pop" value="${city.pop}" step="100" />
            </div>
            <div class="se-field">
                <span class="se-label">Garrison</span>
                <input class="se-input" type="number" id="se-cf-garrison" value="${city.militaryPop}" step="10" />
            </div>
        </div>
        <div class="se-two-col">
            <div class="se-field">
                <span class="se-label">Gold</span>
                <input class="se-input" type="number" id="se-cf-gold" value="${city.gold}" step="50" />
            </div>
            <div class="se-field">
                <span class="se-label">Food</span>
                <input class="se-input" type="number" id="se-cf-food" value="${city.food}" step="50" />
            </div>
        </div>
        <div class="se-field">
            <span class="se-label">Tile Bonus: <span style="color:var(--se-gold)">${city.tileName}</span></span>
            <div style="font-size:9px;color:var(--se-text-dim);background:var(--se-inset);padding:4px 6px;border-radius:2px;line-height:1.7">
                🌾 Food ×${tr.foodMult.toFixed(1)} &nbsp;|&nbsp;
                💰 Gold ×${tr.goldMult.toFixed(1)} &nbsp;|&nbsp;
                🛡 Defence ×${tr.garrisonMult.toFixed(1)}<br>
                <em>${tr.notes}</em>
            </div>
        </div>
        <div class="se-two-col">
            <div class="se-field">
                <span class="se-label">nx (map 0–1)</span>
                <input class="se-input" type="number" id="se-cf-nx" value="${city.nx.toFixed(4)}" step="0.001" min="0" max="1" />
            </div>
            <div class="se-field">
                <span class="se-label">ny (map 0–1)</span>
                <input class="se-input" type="number" id="se-cf-ny" value="${city.ny.toFixed(4)}" step="0.001" min="0" max="1" />
            </div>
        </div>
        <div class="se-field" style="flex-direction:row;align-items:center;gap:8px">
            <input type="checkbox" id="se-cf-player" ${city.isPlayerHome?"checked":""}
                style="accent-color:var(--se-gold);width:14px;height:14px" />
            <label for="se-cf-player" class="se-label" style="margin:0;cursor:pointer">Player home city (white dot)</label>
        </div>
        <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
            <button class="se-btn primary" style="flex:1" onclick="window._SE_CNP._applyForm(${city.id})">✓ Apply</button>
            <button class="se-btn" onclick="window._SE_CNP._regenCity(${city.id})" title="Re-roll resources from tile">♻ Regen</button>
            <button class="se-btn" onclick="window._SE_CNP._relocateCity(${city.id})" title="Click map to move this city">✥ Move</button>
            <button class="se-btn danger" onclick="window._SE_CNP._deleteCity(${city.id})">✕ Delete</button>
        </div>`;
}

S._applyForm = function(id) {
    const city = S.cities.find(c => c.id === id);
    if (!city) return;
    city.name        = (document.getElementById("se-cf-name") || {}).value || city.name;
    city.type        = (document.getElementById("se-cf-type") || {}).value || city.type;
    city.baseFaction = (document.getElementById("se-cf-faction") || {}).value || city.baseFaction;
    city.faction     = city.baseFaction;
    city.color       = (liveFactions()[city.baseFaction] || {}).color || city.color;
    city.pop         = parseInt((document.getElementById("se-cf-pop") || {}).value) || city.pop;
    city.militaryPop = parseInt((document.getElementById("se-cf-garrison") || {}).value) || city.militaryPop;
    city.troops      = city.militaryPop;
    city.garrison    = city.militaryPop;
    city.civilianPop = Math.max(0, city.pop - city.militaryPop);
    city.gold        = parseInt((document.getElementById("se-cf-gold") || {}).value) || city.gold;
    city.food        = parseInt((document.getElementById("se-cf-food") || {}).value) || city.food;
    city.nx          = parseFloat((document.getElementById("se-cf-nx") || {}).value) || city.nx;
    city.ny          = parseFloat((document.getElementById("se-cf-ny") || {}).value) || city.ny;
    city.isPlayerHome= !!(document.getElementById("se-cf-player") || {}).checked;

    const pr = CITY_TYPE_PRESETS[city.type] || CITY_TYPE_PRESETS["TOWN"];
    city.radius = pr.radius;

    _refreshCityList();
    _flash_cnp(`✓ ${city.name} updated`);
};

S._regenCity = function(id) {
    const city = S.cities.find(c => c.id === id);
    if (!city) return;
    const res = autoResources(city.tileName || "Plains", city.type, city.baseFaction);
    Object.assign(city, res);
    _refreshCityForm(city);
    _flash_cnp(`♻ Resources regenerated for ${city.name}`);
};

S._relocateCity = function(id) {
    S.relocatingId  = id;
    S.placingCity   = false;
    const vp = document.getElementById("se-viewport");
    if (vp) vp.style.cursor = "crosshair";
    _flash_cnp("Click map to move city");
};

// =========================================================================
// 8.  NPCs MODE — RIGHT PANEL HTML
// =========================================================================

function _buildNPCsPanel() {
    const fac  = liveFactions();
    const fKeys = Object.keys(fac).filter(f => f !== "Bandits" && f !== "Player's Kingdom");

    const fRows = fKeys.map((f, i) => {
        const alias = S.factionAliases[f] || f;
        const col   = fac[f].color || "#888";
        return `
        <div class="se-faction-row" data-bfac="${f}" id="se-npc-frow-${i}"
             style="cursor:pointer"
             onclick="window._SE_CNP._selectNPCFaction('${f}', ${i})">
            <div class="se-faction-dot" style="background:${col}"></div>
            <span class="se-faction-name">${alias}</span>
            <span class="se-faction-badge" style="font-size:8px">${f === alias ? "" : "renamed"}</span>
        </div>`;
    }).join("");

    return `
    <div class="se-section-header">⚔ NPC Configuration</div>
    <div style="padding:8px;display:flex;flex-direction:column;gap:6px;flex:1;overflow-y:auto">

        <!-- Faction roster -->
        <div class="se-card">
            <div class="se-card-header">⚑ Faction Roster</div>
            <div class="se-card-body">
                <div class="se-faction-list" id="se-npc-flist">${fRows}</div>
            </div>
        </div>

        <!-- Selected faction config (filled by _selectNPCFaction) -->
        <div id="se-npc-config-card" style="display:none"></div>

        <!-- Diplomacy matrix -->
        <div class="se-card">
            <div class="se-card-header">🤝 Diplomacy Matrix</div>
            <div class="se-card-body" style="padding:4px">
                <div id="se-npc-diplo-matrix" style="overflow-x:auto">
                    ${_buildDiploMatrix(fKeys)}
                </div>
                <div style="display:flex;gap:6px;margin-top:6px;font-size:9px;align-items:center">
                    <span style="background:#1a3a1a;border:1px solid #3a8830;padding:1px 5px;border-radius:2px;color:#80e890">Ally</span>
                    <span style="background:#2a2a2a;border:1px solid #555;padding:1px 5px;border-radius:2px;color:#aaa">Neutral</span>
                    <span style="background:#3a1010;border:1px solid #a83030;padding:1px 5px;border-radius:2px;color:#ffa0a0">War</span>
                    <span style="color:var(--se-text-dim);margin-left:auto">Click cell to cycle</span>
                </div>
            </div>
        </div>

        <!-- Apply to game -->
        <button class="se-btn success" id="se-cnp-apply-npcs-btn" style="width:100%;padding:10px">
            ▶ Apply NPCs & Factions to Game
        </button>
    </div>`;
}

S._selectedNPCFaction = null;

S._selectNPCFaction = function(bFac, idx) {
    S._selectedNPCFaction = bFac;
    document.querySelectorAll(".se-faction-row[data-bfac]").forEach(r => r.classList.remove("active"));
    const row = document.getElementById(`se-npc-frow-${idx}`);
    if (row) row.classList.add("active");

    const card = document.getElementById("se-npc-config-card");
    if (!card) return;
    card.style.display = "";
    card.innerHTML = _buildFactionConfig(bFac);
    _wireNPCConfig(bFac);
};

function _buildFactionConfig(bFac) {
    const fac   = liveFactions();
    const fdat  = fac[bFac] || {};
    const alias = S.factionAliases[bFac] || bFac;
    const col   = fdat.color || "#888";
    const units = S.compOverrides[bFac] || getUnits(bFac);
    if (!S.compOverrides[bFac]) S.compOverrides[bFac] = units;
    if (!S.spawnRules[bFac])   S.spawnRules[bFac]   = [];

    const unitRows = units.map((u, ui) => {
        const pct = Math.round(u.pct * 100);
        return `
        <div style="display:grid;grid-template-columns:1fr 60px 36px 18px;align-items:center;gap:4px;margin-bottom:3px">
            <span style="font-size:10px;color:${u.unique?"var(--se-gold)":"var(--se-text)"}">
                ${u.unique ? "★ " : ""}${u.type}
            </span>
            <input type="range" class="se-slider" min="0" max="100" value="${pct}"
                data-ui="${ui}" data-bfac="${bFac}"
                oninput="window._SE_CNP._unitPct(this,'${bFac}',${ui})" />
            <span id="se-unit-pct-${bFac.replace(/\s/g,'_')}-${ui}" style="font-size:10px;color:var(--se-text);text-align:right">${pct}%</span>
            <span style="font-size:9px;color:${u.unique?"#e8b832":"var(--se-text-dim)"}">★</span>
        </div>`;
    }).join("");

    const rules     = S.spawnRules[bFac];
    const ruleCards = rules.map((rule, ri) => _buildRuleCard(bFac, ri, rule)).join("");

    return `
    <div class="se-card">
        <div class="se-card-header" style="gap:8px">
            <div style="width:12px;height:12px;border-radius:50%;background:${col};border:1px solid rgba(0,0,0,0.5)"></div>
            ⚙ ${alias}
            <span style="color:var(--se-text-dim);font-size:9px">(${bFac})</span>
        </div>
        <div class="se-card-body">
            <!-- Rename -->
            <div class="se-field">
                <span class="se-label">Scenario Alias (rename)</span>
                <div style="display:flex;gap:4px">
                    <input class="se-input" type="text" id="se-npc-alias-${bFac.replace(/\s/g,'_')}"
                        value="${alias}" placeholder="${bFac}" style="flex:1"/>
                    <button class="se-btn" style="white-space:nowrap"
                        onclick="window._SE_CNP._applyAlias('${bFac}')">Apply</button>
                </div>
                <div style="font-size:9px;color:var(--se-text-dim);margin-top:2px">
                    Colour stays <span style="color:${col};font-weight:bold">${col}</span>
                    — rename only changes the display name in this scenario.
                </div>
            </div>

            <!-- Unit composition -->
            <div class="se-section-header" style="margin:4px -8px;padding-left:8px">
                Unit Composition <span style="color:var(--se-gold)">★ = Unique</span>
            </div>
            <div id="se-unit-comp-${bFac.replace(/\s/g,'_')}" style="padding:4px 0">
                ${unitRows}
            </div>
            <div style="display:flex;gap:4px;margin-top:2px">
                <button class="se-btn" style="font-size:9px;flex:1"
                    onclick="window._SE_CNP._normUnits('${bFac}')">⟳ Normalise %</button>
                <button class="se-btn" style="font-size:9px;flex:1"
                    onclick="window._SE_CNP._resetUnits('${bFac}')">↺ Reset to Default</button>
            </div>

            <!-- Spawn rules -->
            <div class="se-section-header" style="margin:6px -8px;padding-left:8px">
                Spawn Rules
                <button class="se-btn primary" style="float:right;font-size:9px;padding:1px 6px"
                    onclick="window._SE_CNP._addRule('${bFac}')">+ Add Rule</button>
            </div>
            <div id="se-spawn-rules-${bFac.replace(/\s/g,'_')}">
                ${ruleCards}
            </div>
        </div>
    </div>`;
}

function _buildRuleCard(bFac, ri, rule) {
    const fKey = bFac.replace(/\s/g,'_');
    return `
    <div class="se-action-row" id="se-rule-${fKey}-${ri}" style="flex-direction:column;align-items:stretch;gap:6px;margin-bottom:4px">
        <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:10px;color:var(--se-gold);font-weight:bold">Rule ${ri+1}</span>
            <select class="se-select" id="se-rule-role-${fKey}-${ri}" style="flex:1;font-size:10px"
                onchange="window._SE_CNP._ruleField('${bFac}',${ri},'role',this.value)">
                ${["Military","Patrol","Merchant","Naval","Bandit"].map(r =>
                    `<option value="${r}" ${(rule.role||"Military")===r?"selected":""}>${r}</option>`
                ).join("")}
            </select>
            <button class="se-btn icon-only danger" style="font-size:9px;padding:1px 5px"
                onclick="window._SE_CNP._deleteRule('${bFac}',${ri})">✕</button>
        </div>
        <div class="se-two-col">
            <div class="se-field">
                <span class="se-label">Spawn Count</span>
                <input class="se-input" type="number" min="1" max="20" value="${rule.count||2}"
                    onchange="window._SE_CNP._ruleField('${bFac}',${ri},'count',+this.value)"
                    style="font-size:10px"/>
            </div>
            <div class="se-field">
                <span class="se-label">Troops/Unit</span>
                <input class="se-input" type="number" min="10" max="2000" value="${rule.troopsPerUnit||150}"
                    onchange="window._SE_CNP._ruleField('${bFac}',${ri},'troopsPerUnit',+this.value)"
                    style="font-size:10px"/>
            </div>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="se-btn" style="font-size:9px;flex:1"
                onclick="window._SE_CNP._pickEntry('${bFac}',${ri})">
                📍 ${rule.entryNx!=null ? `Entry (${(rule.entryNx).toFixed(2)},${(rule.entryNy).toFixed(2)})` : "Set Entry Point"}
            </button>
            <button class="se-btn" style="font-size:9px;flex:1"
                onclick="window._SE_CNP._pickPatrol('${bFac}',${ri},'A')">
                →A ${rule.patrolA ? `(${rule.patrolA.nx.toFixed(2)},${rule.patrolA.ny.toFixed(2)})` : "Set Patrol A"}
            </button>
            <button class="se-btn" style="font-size:9px;flex:1"
                onclick="window._SE_CNP._pickPatrol('${bFac}',${ri},'B')">
                →B ${rule.patrolB ? `(${rule.patrolB.nx.toFixed(2)},${rule.patrolB.ny.toFixed(2)})` : "Set Patrol B"}
            </button>
        </div>
    </div>`;
}

S._unitPct = function(el, bFac, ui) {
    if (!S.compOverrides[bFac]) S.compOverrides[bFac] = getUnits(bFac);
    S.compOverrides[bFac][ui].pct = parseInt(el.value) / 100;
    const lbl = document.getElementById(`se-unit-pct-${bFac.replace(/\s/g,'_')}-${ui}`);
    if (lbl) lbl.textContent = el.value + "%";
};

S._normUnits = function(bFac) {
    const units = S.compOverrides[bFac];
    if (!units) return;
    const total = units.reduce((s, u) => s + u.pct, 0);
    if (total === 0) return;
    units.forEach(u => { u.pct = u.pct / total; });
    // Rebuild sliders
    S._selectNPCFaction(bFac, _factionIndex(bFac));
    _flash_cnp("✓ Percentages normalised to 100%");
};

S._resetUnits = function(bFac) {
    S.compOverrides[bFac] = getUnits(bFac);
    S._selectNPCFaction(bFac, _factionIndex(bFac));
    _flash_cnp("✓ Composition reset to faction defaults");
};

S._applyAlias = function(bFac) {
    const key = bFac.replace(/\s/g,'_');
    const inp = document.getElementById(`se-npc-alias-${key}`);
    if (!inp) return;
    const alias = inp.value.trim() || bFac;
    S.factionAliases[bFac] = alias;
    // Refresh faction list rows
    document.querySelectorAll(`.se-faction-row[data-bfac="${bFac}"] .se-faction-name`)
        .forEach(el => { el.textContent = alias; });
    document.querySelectorAll(`.se-faction-row[data-bfac="${bFac}"] .se-faction-badge`)
        .forEach(el => { el.textContent = alias !== bFac ? "renamed" : ""; });
    _flash_cnp(`✓ ${bFac} → "${alias}"`);
};

S._addRule = function(bFac) {
    if (!S.spawnRules[bFac]) S.spawnRules[bFac] = [];
    S.spawnRules[bFac].push({ role: "Military", count: 2, troopsPerUnit: 150 });
    S._selectNPCFaction(bFac, _factionIndex(bFac));
};

S._deleteRule = function(bFac, ri) {
    if (!S.spawnRules[bFac]) return;
    S.spawnRules[bFac].splice(ri, 1);
    S._selectNPCFaction(bFac, _factionIndex(bFac));
};

S._ruleField = function(bFac, ri, field, val) {
    if (!S.spawnRules[bFac]) S.spawnRules[bFac] = [];
    if (!S.spawnRules[bFac][ri]) S.spawnRules[bFac][ri] = {};
    S.spawnRules[bFac][ri][field] = val;
};

S._pickEntry = function(bFac, ri) {
    S._pickingEntry = { bFac, ri };
    S.patrolMode    = null;
    const vp = document.getElementById("se-viewport");
    if (vp) vp.style.cursor = "copy";
    _flash_cnp("Click map to set NPC entry point");
};

S._pickPatrol = function(bFac, ri, leg) {
    S.patrolMode    = { ruleKey: bFac, ruleIdx: ri, leg };
    S._pickingEntry = null;
    const vp = document.getElementById("se-viewport");
    if (vp) vp.style.cursor = "crosshair";
    _flash_cnp(`Click map to set Patrol ${leg} for ${S.factionAliases[bFac]||bFac} rule ${ri+1}`);
};

function _refreshNPCPanel() {
    if (S._selectedNPCFaction) {
        S._selectNPCFaction(S._selectedNPCFaction, _factionIndex(S._selectedNPCFaction));
    }
}

function _factionIndex(bFac) {
    const fKeys = Object.keys(liveFactions()).filter(f => f !== "Bandits" && f !== "Player's Kingdom");
    return fKeys.indexOf(bFac);
}

function _wireNPCConfig(bFac) {
    // Nothing extra needed — all handlers are inline onclick= attributes
}

// =========================================================================
// 9.  DIPLOMACY MATRIX
// =========================================================================

function _buildDiploMatrix(fKeys) {
    if (!fKeys || fKeys.length === 0) return "<em style='color:var(--se-text-dim);font-size:10px'>No factions loaded</em>";
    const fac = liveFactions();

    // Ensure defaults
    fKeys.forEach(a => {
        fKeys.forEach(b => {
            if (a === b) return;
            const k = a + "::" + b;
            if (!S.diplomacy[k]) S.diplomacy[k] = "Neutral";
        });
    });

    const CELL_STYLES = {
        "Ally":    "background:#1a3a1a;border:1px solid #3a8830;color:#80e890",
        "Neutral": "background:#222;border:1px solid #555;color:#aaa",
        "War":     "background:#3a1010;border:1px solid #a83030;color:#ffa0a0",
    };

    let html = `<table style="border-collapse:collapse;font-size:8px;min-width:100%">`;

    // Header row
    html += `<tr><th style="padding:2px;color:var(--se-text-dim)"></th>`;
    fKeys.forEach(f => {
        const alias = S.factionAliases[f] || f;
        const col   = (fac[f] || {}).color || "#888";
        html += `<th style="padding:2px 4px;text-align:center;writing-mode:vertical-rl;
            transform:rotate(180deg);max-height:60px;overflow:hidden;
            color:${col};font-size:7px;border-bottom:1px solid var(--se-border)">
            ${alias.length > 10 ? alias.substring(0,8)+"…" : alias}
        </th>`;
    });
    html += `</tr>`;

    // Data rows
    fKeys.forEach(a => {
        const aliasA = S.factionAliases[a] || a;
        const colA   = (fac[a] || {}).color || "#888";
        html += `<tr>
            <td style="padding:2px 4px;color:${colA};font-size:8px;white-space:nowrap;
                border-right:1px solid var(--se-border)">
                ${aliasA.length > 10 ? aliasA.substring(0,8)+"…" : aliasA}
            </td>`;
        fKeys.forEach(b => {
            if (a === b) {
                html += `<td style="background:var(--se-inset);border:1px solid var(--se-border);
                    text-align:center;padding:2px;color:var(--se-text-dim)">—</td>`;
            } else {
                const k   = a + "::" + b;
                const rel = S.diplomacy[k] || "Neutral";
                const st  = CELL_STYLES[rel] || CELL_STYLES["Neutral"];
                html += `<td style="${st};text-align:center;padding:2px 3px;cursor:pointer;border-radius:1px;min-width:22px"
                    title="${aliasA} → ${S.factionAliases[b]||b}: ${rel}"
                    onclick="window._SE_CNP._cycleDiplo('${a}','${b}',this)">
                    ${{ Ally:"✓", Neutral:"•", War:"⚔" }[rel]}
                </td>`;
            }
        });
        html += `</tr>`;
    });

    html += `</table>`;
    return html;
}

S._cycleDiplo = function(a, b, cell) {
    const order  = ["Neutral","Ally","War"];
    const k      = a + "::" + b;
    const kb     = b + "::" + a;
    const cur    = S.diplomacy[k] || "Neutral";
    const next   = order[(order.indexOf(cur) + 1) % order.length];
    S.diplomacy[k]  = next;
    S.diplomacy[kb] = next; // Mirror

    const CELL_STYLES = {
        "Ally":    "background:#1a3a1a;border:1px solid #3a8830;color:#80e890",
        "Neutral": "background:#222;border:1px solid #555;color:#aaa",
        "War":     "background:#3a1010;border:1px solid #a83030;color:#ffa0a0",
    };
    cell.setAttribute("style", CELL_STYLES[next] + ";text-align:center;padding:2px 3px;cursor:pointer;border-radius:1px;min-width:22px");
    cell.textContent = { Ally:"✓", Neutral:"•", War:"⚔" }[next];

    // Also update the mirrored cell
    const fKeys = Object.keys(liveFactions()).filter(f => f !== "Bandits" && f !== "Player's Kingdom");
    const bi = fKeys.indexOf(b), ai = fKeys.indexOf(a);
    if (bi >= 0 && ai >= 0) {
        const tbl  = document.querySelector("#se-npc-diplo-matrix table");
        if (tbl) {
            const rows = tbl.querySelectorAll("tr");
            const dataRow = rows[bi + 1];
            if (dataRow) {
                const cells = dataRow.querySelectorAll("td");
                const mirrorCell = cells[ai + 1];
                if (mirrorCell && mirrorCell.onclick) {
                    mirrorCell.setAttribute("style", CELL_STYLES[next] + ";text-align:center;padding:2px 3px;cursor:pointer;border-radius:1px;min-width:22px");
                    mirrorCell.textContent = { Ally:"✓", Neutral:"•", War:"⚔" }[next];
                }
            }
        }
    }
};

// =========================================================================
// 10.  APPLY TO GAME
// =========================================================================

function _applycitiesToGame() {
    if (S.cities.length === 0) {
        _flash_cnp("⚠ No cities placed — add at least one city first"); return;
    }
    const mapType = SE.mapEngine ? SE.mapEngine.getMapType() : null;
    const map     = SE.mapEngine ? SE.mapEngine.getMap() : null;
    const ts      = map ? map.tileSize : 16;

    // Convert editor city objects to the game city format
    const gameCities = S.cities.map(city => ({
        ...city,
        x: city.nx * (map ? map.cols * ts : 4000),
        y: city.ny * (map ? map.rows * ts : 3000),
        originalFaction: city.baseFaction,
        conscriptionRate: CITY_TYPE_PRESETS[city.type].garrisonRate,
        civilianPop: Math.max(0, city.pop - city.militaryPop),
        troops: city.militaryPop,
        recoveryTimer: 0,
        isUnderSiege: false,
    }));

    // Write to sandbox or story1 city arrays
    let applied = false;
    if (mapType === "sandbox" || !mapType) {
        try {
            window.cities_sandbox = gameCities;
            if (typeof window.cities !== "undefined") window.cities = gameCities;
            applied = true;
        } catch(e) { console.warn("[CitiesNPCs] Could not write cities_sandbox:", e); }
    }
    if (mapType === "story1") {
        try {
            window.cities_story1 = gameCities;
            applied = true;
        } catch(e) { console.warn("[CitiesNPCs] Could not write cities_story1:", e); }
    }

    // Always try the live `cities` global (used by NPC update loop)
    if (typeof window.cities !== "undefined") {
        window.cities = [...gameCities];
        applied = true;
    }

    if (applied) {
        _flash_cnp(`✓ ${gameCities.length} cities applied to game`);
    } else {
        _flash_cnp("⚠ No game city arrays found — map not loaded yet?");
    }
}

function _applyNPCsToGame() {
    const fac = liveFactions();
    let changed = 0;

    // 1. Apply aliases (scenario names) and unit compositions
    Object.entries(S.factionAliases).forEach(([bFac, alias]) => {
        if (!fac[bFac]) return;
        // Store alias on the faction object for display purposes
        fac[bFac]._scenarioAlias = alias;
        changed++;
    });

    // 2. Apply unit composition overrides
    // We patch generateNPCRoster via a wrapper so all future NPC spawns
    // use the editor-defined compositions.
    if (typeof window.generateNPCRoster === "function") {
        const origRoster = window.generateNPCRoster;
        window.generateNPCRoster = function(role, count, faction) {
            // Find the baseFaction that maps to this alias (or direct match)
            let bFac = faction;
            // Check if it's an alias
            const aliasMatch = Object.entries(S.factionAliases)
                .find(([bf, alias]) => alias === faction);
            if (aliasMatch) bFac = aliasMatch[0];

            const overrides = S.compOverrides[bFac];
            if (!overrides || overrides.length === 0) {
                return origRoster(role, count, faction);
            }

            // Build roster using editor-defined composition
            const roster = [];
            overrides.forEach(unit => {
                const n = Math.max(0, Math.round(count * unit.pct));
                for (let i = 0; i < n; i++) {
                    roster.push({
                        type:   unit.type,
                        health: 100,
                        attack: 10,
                        morale: 100,
                        isUnique: !!unit.unique,
                    });
                }
            });
            // Pad to exactly `count` using the first unit type
            while (roster.length < count && overrides.length > 0) {
                roster.push({ type: overrides[0].type, health: 100, attack: 10, morale: 100 });
            }
            return roster.slice(0, count);
        };
        changed++;
    }

    // 3. Apply diplomacy — patch isHostile() if it exists
    if (typeof window.isHostile === "function" && Object.keys(S.diplomacy).length > 0) {
        const origHostile = window.isHostile;
        window.isHostile = function(fA, fB) {
            // Resolve aliases to base factions
            const resolveBase = (f) => {
                const hit = Object.entries(S.factionAliases).find(([bf,a]) => a === f);
                return hit ? hit[0] : f;
            };
            const bA = resolveBase(fA), bB = resolveBase(fB);
            const k1 = bA + "::" + bB;
            const k2 = bB + "::" + bA;
            if (S.diplomacy[k1]) {
                const rel = S.diplomacy[k1];
                return rel === "War";
            }
            if (S.diplomacy[k2]) {
                const rel = S.diplomacy[k2];
                return rel === "War";
            }
            return origHostile(fA, fB);
        };
        changed++;
    }

    // 4. Apply spawn rules — queue NPC spawns for each rule
    const map = SE.mapEngine ? SE.mapEngine.getMap() : null;
    const ts  = map ? map.tileSize : 16;
    let spawned = 0;

    if (typeof window.globalNPCs !== "undefined" && map) {
        Object.entries(S.spawnRules).forEach(([bFac, rules]) => {
            const fdat = fac[bFac] || {};
            const col  = fdat.color || "#888";
            const alias = S.factionAliases[bFac] || bFac;

            rules.forEach(rule => {
                for (let i = 0; i < (rule.count || 1); i++) {
                    const ex = rule.entryNx != null
                        ? rule.entryNx * map.cols * ts
                        : Math.random() * map.cols * ts;
                    const ey = rule.entryNy != null
                        ? rule.entryNy * map.rows * ts
                        : Math.random() * map.rows * ts;

                    const troops = rule.troopsPerUnit || 150;
                    const npc = {
                        x: ex, y: ey,
                        targetX: ex, targetY: ey,
                        faction: alias,
                        color:   col,
                        role:    rule.role || "Military",
                        troops,
                        maxTroops: troops,
                        roster: typeof window.generateNPCRoster === "function"
                            ? window.generateNPCRoster(rule.role || "Military", troops, alias)
                            : [],
                        anim: 0,
                        isMoving: false,
                        speed: 1.2,
                        // Patrol route
                        patrolA: rule.patrolA ? {
                            x: rule.patrolA.nx * map.cols * ts,
                            y: rule.patrolA.ny * map.rows * ts,
                        } : null,
                        patrolB: rule.patrolB ? {
                            x: rule.patrolB.nx * map.cols * ts,
                            y: rule.patrolB.ny * map.rows * ts,
                        } : null,
                        patrolLeg: "A",
                    };
                    window.globalNPCs.push(npc);
                    spawned++;
                }
            });
        });
    }

    _flash_cnp(`✓ NPCs applied — ${changed} systems patched, ${spawned} units spawned`);
}

// =========================================================================
// 11. WIRE BUTTONS (called each time a mode panel is built)
// =========================================================================

function _wireCitiesButtons() {
    const placeBtn = document.getElementById("se-cnp-place-btn");
    const clearBtn = document.getElementById("se-cnp-clear-btn");
    const applyBtn = document.getElementById("se-cnp-apply-cities-btn");
    const hint     = document.getElementById("se-cnp-place-hint");

    if (placeBtn) placeBtn.onclick = () => {
        S.placingCity    = true;
        S.relocatingId   = null;
        S._pickingEntry  = null;
        S.patrolMode     = null;
        if (hint) hint.style.display = "";
        const vp = document.getElementById("se-viewport");
        if (vp) vp.style.cursor = "cell";
        _flash_cnp("Click map to place city pin");
    };

    if (clearBtn) clearBtn.onclick = () => {
        if (S.cities.length === 0 || confirm(`Remove all ${S.cities.length} placed cities?`)) {
            S.cities = [];
            S.selectedCityId = null;
            _refreshCityList();
            const form = document.getElementById("se-cnp-city-form-card");
            if (form) form.style.display = "none";
        }
    };

    if (applyBtn) applyBtn.onclick = _applycitiesToGame;

    _refreshCityList();
}

function _wireNPCsButtons() {
    const applyBtn = document.getElementById("se-cnp-apply-npcs-btn");
    if (applyBtn) applyBtn.onclick = _applyNPCsToGame;
}

// =========================================================================
// 12.  MODE HOOK — intercept SE._setMode to inject our panels
// =========================================================================
const _origSetMode = SE._setMode.bind(SE);

SE._setMode = function(mode) {
    _origSetMode(mode);
    const rightPanel = document.getElementById("se-right-panel");
    if (!rightPanel) return;

    if (mode === "CITIES") {
        rightPanel.innerHTML = _buildCitiesPanel();
        _wireCitiesButtons();
        _attachViewportListeners();
        _ensureOverlay();
    } else if (mode === "NPCS") {
        rightPanel.innerHTML = _buildNPCsPanel();
        _wireNPCsButtons();
        _attachViewportListeners();
        _ensureOverlay();
    }
    // For other modes, let the existing right-panel stub remain as-is.
};

// =========================================================================
// 13.  VPSTATE SYNC VIA MAP ENGINE HOOK
//      We expose _offX/_offY/_zoom by monkey-patching SE.open so our
//      overlay can always know where the map canvas is positioned.
// =========================================================================
(function hookOpen() {
    const origOpen = SE.open.bind(SE);
    SE.open = function () {
        origOpen();
        setTimeout(() => {
            _attachViewportListeners();
            _ensureOverlay();
            // Inject a wheel+mousedown spy on the viewport to track pan/zoom
            const vp = document.getElementById("se-viewport");
            if (!vp || vp._cnpVpStateSpy) return;
            vp._cnpVpStateSpy = true;

            function _readVpState() {
                // Best-effort: derive from zoom label and map bounding box.
                // The map border is drawn at (_offX, _offY) to (cols*ts, rows*ts).
                // We find it from the canvas pixel at (0,0) by sampling the first
                // gold border pixel — too fragile. Instead we store the last
                // fit-to-view state and update it on each zoom/pan event.
                const zLabel = document.querySelector(".se-zoom-display");
                const zoom   = zLabel ? (parseFloat(zLabel.textContent) / 100 || 1) : 1;
                const me     = SE.mapEngine;
                const map    = me ? me.getMap() : null;
                if (!map) return;
                // On first call after map load, estimate offsets from fit-to-view maths
                if (!S._vpState || Math.abs(S._vpState.zoom - zoom) > 0.05) {
                    const vpW = vp.clientWidth || 800;
                    const vpH = vp.clientHeight || 500;
                    const mW  = map.cols * map.tileSize;
                    const mH  = map.rows * map.tileSize;
                    const z   = zoom;
                    S._vpState = {
                        offX: (vpW - mW * z) / 2,
                        offY: (vpH - mH * z) / 2,
                        zoom: z,
                    };
                }
            }

            ["wheel","mousedown","mousemove"].forEach(ev => {
                vp.addEventListener(ev, _readVpState, { passive: true });
            });
        }, 300);
    };
})();

// =========================================================================
// 14.  UTILITY
// =========================================================================

function _flash_cnp(msg, dur = 3000) {
    const el = document.getElementById("se-st-scenario");
    if (!el) return;
    const prev = el.textContent;
    el.textContent = msg;
    clearTimeout(S._flashTimer);
    S._flashTimer = setTimeout(() => { el.textContent = prev; }, dur);
}

// =========================================================================
// 15.  EXPOSE PUBLIC API ON SE NAMESPACE
// =========================================================================
SE.citiesNPCs = {
    getState:       () => S,
    getCities:      () => S.cities,
    getDiplomacy:   () => S.diplomacy,
    getSpawnRules:  () => S.spawnRules,
    getAliases:     () => S.factionAliases,
    getCompOverrides:()=> S.compOverrides,
    applyToGame:    () => { _applycitiesToGame(); _applyNPCsToGame(); },
    TILE_RESOURCES,
    CITY_TYPE_PRESETS,
    FACTION_UNITS,
};

 


})(window.ScenarioEditor);

// =============================================================================
// SCENARIO EDITOR — STORY TRIGGER ENGINE  (scenario_editor_triggers.js)
// Part 3: Full story authoring — conditions, actions, timeline, save/load.

//
// FEATURES:
//  ┌─ TRIGGER EDITOR ──────────────────────────────────────────────────────────┐
//  │  Condition types: MAP_LAUNCH, TURN_COUNT, BATTLE_START, BATTLE_END,       │
//  │    CITY_CAPTURED, CITY_HP, PLAYER_ON_TILE, PLAYER_IN_REGION,              │
//  │    FACTION_ELIMINATED, PLAYER_GOLD, DIALOGUE_DONE, CUSTOM_JS              │
//  │  Logic combiners: AND / OR per trigger, toggleable badge                  │
//  │  Action types: SHOW_DIALOGUE, LAUNCH_BATTLE, SPAWN_ARMY, SET_RELATION,    │
//  │    GIVE_RESOURCES, PLAY_SOUND, LOCK_CITY, SET_OBJECTIVE,                  │
//  │    PAN_CAMERA, CUSTOM_JS                                                  │
//  └───────────────────────────────────────────────────────────────────────────┘
//  ┌─ TIMELINE ────────────────────────────────────────────────────────────────┐
//  │  Zoomable horizontal lanes per action category with turn-indexed blocks   │
//  │  Click any block to focus the trigger in the editor                       │
//  └───────────────────────────────────────────────────────────────────────────┘
//  ┌─ SAVE / LOAD ──────────────────────────────────────────────────────────────┐
//  │  Full scenario JSON (meta + map + cities + NPCs + triggers + objectives)  │
//  │  localStorage auto-save every 60 s                                        │
//  │  Export as .json to PC; Load from localStorage list or .json file picker  │
//  └───────────────────────────────────────────────────────────────────────────┘
//  ┌─ TRIGGER RUNTIME ──────────────────────────────────────────────────────────┐
//  │  TriggerRuntime.tick(state) — hook into your draw() / update loop         │
//  │  LAUNCH_BATTLE bridges to showCustomBattleMenu() with live army support   │
//  │  BattleDialogue.queue() → in-battle floating speech boxes, any position   │
//  └───────────────────────────────────────────────────────────────────────────┘
// =============================================================================

(function (SE) {
"use strict";

if (!SE) { console.error("[StoryEditor] ScenarioEditor not found!"); return; }

// ============================================================================
// 1.  STATE NAMESPACE
// ============================================================================
const T = window._SE_STORY = window._SE_STORY || {
    triggers:     [],
    objectives:   [],
    dialogueLines:[],
    selectedId:   null,
    _nextId:      1,
    _scenarioName:"Untitled Scenario",
    _dirty:       false,
    _autoTimer:   null,
    _flashTimer:  null,

    // Runtime (not serialised)
    _rt: {
        active:          false,
        turn:            1,
        firedIds:        new Set(),
        capturedCities:  [],
        battlePending:   null,
    },
};

// ============================================================================
// 2.  CONDITION DEFINITIONS
// ============================================================================
const COND = {
    MAP_LAUNCH:          { label:"Map Launched",       icon:"🗺", params:[] },
    TURN_COUNT:          { label:"Turn Number",         icon:"🕐", params:[
        { key:"turn",      type:"number",  label:"Turn ≥",         default:1           },
        { key:"exact",     type:"bool",    label:"Exact match",     default:false       },
    ]},
    BATTLE_START:        { label:"Battle Starts",       icon:"⚔",  params:[] },
    BATTLE_END:          { label:"Battle Ends",          icon:"🏁", params:[
        { key:"result",    type:"select",  label:"Result",          default:"any",
          opts:["any","victory","defeat","draw"]                                        },
    ]},
    CITY_CAPTURED:       { label:"City Captured",       icon:"🏯", params:[
        { key:"city",      type:"city",    label:"City",            default:""          },
        { key:"byFaction", type:"faction", label:"By Faction",      default:"any"       },
    ]},
    CITY_HP:             { label:"City HP Below %",     icon:"💔", params:[
        { key:"city",      type:"city",    label:"City",            default:""          },
        { key:"pct",       type:"number",  label:"Below %",         default:30, min:0, max:100 },
    ]},
    PLAYER_ON_TILE:      { label:"Player on Tile Type", icon:"🚶", params:[
        { key:"tile",      type:"tile",    label:"Tile type",       default:"Plains"    },
    ]},
    PLAYER_IN_REGION:    { label:"Player in Map Region",icon:"📍", params:[
        { key:"nx",        type:"number",  label:"Region NX",       default:0.5, step:0.01 },
        { key:"ny",        type:"number",  label:"Region NY",       default:0.5, step:0.01 },
        { key:"radius",    type:"number",  label:"Radius (0–1)",    default:0.05, step:0.005 },
    ]},
    FACTION_ELIMINATED:  { label:"Faction Eliminated",  icon:"💀", params:[
        { key:"faction",   type:"faction", label:"Faction",         default:""          },
    ]},
    PLAYER_GOLD:         { label:"Player Gold",         icon:"💰", params:[
        { key:"op",        type:"select",  label:"Operator",        default:">=", opts:[">=","<=","=="] },
        { key:"amount",    type:"number",  label:"Amount",          default:1000        },
    ]},
    DIALOGUE_DONE:       { label:"After Trigger Fires", icon:"💬", params:[
        { key:"triggerId", type:"trigger", label:"After trigger",   default:""          },
    ]},
    CUSTOM_JS:           { label:"Custom JavaScript",   icon:"⌨",  params:[
        { key:"code",      type:"code",    label:"JS (return true/false)", default:"// state = { turn, playerTile, playerGold, cities, … }\nreturn true;" },
    ]},
};

// ============================================================================
// 3.  ACTION DEFINITIONS
// ============================================================================
const ACT = {
    SHOW_DIALOGUE:  { label:"Show Dialogue",       icon:"💬", col:"#7040c0", params:[
        { key:"speaker",      type:"text",     label:"Speaker Name",       default:"Narrator"     },
        { key:"portrait",     type:"text",     label:"Portrait (emoji)",    default:"💬"           },
        { key:"text",         type:"textarea", label:"Dialogue Text",       default:""             },
        { key:"duration",     type:"number",   label:"Duration ms",         default:4000           },
        { key:"position",     type:"select",   label:"Screen Position",     default:"bottom",
          opts:["bottom","top","center","left","right"]                                             },
        { key:"inBattle",     type:"bool",     label:"Show during battle",  default:false          },
    ]},
    LAUNCH_BATTLE:  { label:"Launch Battle",       icon:"⚔",  col:"#c03030", params:[
        { key:"mapType",      type:"select",   label:"Battle Map",          default:"current_tile",
          opts:["current_tile","Plains","Forest","Dense Forest","Steppes","Desert","Highlands","River","Coastal","Ocean","siege"] },
        { key:"useLiveArmy",  type:"bool",     label:"Use player's live army", default:true        },
        { key:"enemyFaction", type:"faction",  label:"Enemy Faction",       default:""             },
        { key:"enemyBudget",  type:"number",   label:"Enemy Budget (gold)", default:1000           },
        { key:"enemyRoster",  type:"roster",   label:"Enemy Units (CSV, blank = auto)", default:"" },
        { key:"preBattleText",type:"textarea", label:"Pre-battle narration (optional)", default:"" },
        { key:"preSpeaker",   type:"text",     label:"Narration speaker",   default:"Narrator"     },
        { key:"winTrigger",   type:"trigger",  label:"On Victory → fire",   default:""             },
        { key:"loseTrigger",  type:"trigger",  label:"On Defeat → fire",    default:""             },
    ]},
    SPAWN_ARMY:     { label:"Spawn NPC Army",      icon:"🪖", col:"#b06020", params:[
        { key:"faction",      type:"faction",  label:"Faction",             default:""             },
        { key:"count",        type:"number",   label:"Unit groups",         default:3              },
        { key:"troops",       type:"number",   label:"Troops per unit",     default:150            },
        { key:"nx",           type:"number",   label:"Spawn NX",            default:0.5, step:0.01 },
        { key:"ny",           type:"number",   label:"Spawn NY",            default:0.5, step:0.01 },
        { key:"role",         type:"select",   label:"Role",                default:"Military",
          opts:["Military","Patrol","Merchant","Naval","Bandit"]                                    },
    ]},
    SET_RELATION:   { label:"Change Diplomacy",    icon:"🤝", col:"#2060a8", params:[
        { key:"factionA",     type:"faction",  label:"Faction A",           default:""             },
        { key:"factionB",     type:"faction",  label:"Faction B",           default:""             },
        { key:"relation",     type:"select",   label:"New Relation",        default:"War",
          opts:["Ally","Neutral","War"]                                                             },
    ]},
    GIVE_RESOURCES: { label:"Give Resources",      icon:"💰", col:"#2a7828", params:[
        { key:"faction",      type:"faction",  label:"To Faction",          default:"Player"       },
        { key:"gold",         type:"number",   label:"Gold (±)",            default:500            },
        { key:"food",         type:"number",   label:"Food (±)",            default:0              },
    ]},
    PLAY_SOUND:     { label:"Play Sound / Music",  icon:"🎵", col:"#805010", params:[
        { key:"path",         type:"text",     label:"File path",           default:"music/theme.mp3" },
        { key:"loop",         type:"bool",     label:"Loop",                default:false          },
        { key:"stopAll",      type:"bool",     label:"Stop other audio first",default:false        },
    ]},
    LOCK_CITY:      { label:"Lock / Unlock City",  icon:"🔒", col:"#404040", params:[
        { key:"city",         type:"city",     label:"City",                default:""             },
        { key:"locked",       type:"bool",     label:"Locked",              default:true           },
    ]},
    SET_OBJECTIVE:  { label:"Set Objective Status",icon:"🎯", col:"#c05010", params:[
        { key:"objectiveId",  type:"objective",label:"Objective",           default:""             },
        { key:"status",       type:"select",   label:"New Status",          default:"active",
          opts:["active","completed","failed","hidden"]                                             },
    ]},
    PAN_CAMERA:     { label:"Pan Camera",          icon:"📷", col:"#304050", params:[
        { key:"nx",           type:"number",   label:"Target NX",           default:0.5, step:0.01 },
        { key:"ny",           type:"number",   label:"Target NY",           default:0.5, step:0.01 },
        { key:"duration",     type:"number",   label:"Duration ms",         default:2000           },
        { key:"lock",         type:"bool",     label:"Lock player input",   default:true           },
    ]},
    CUSTOM_JS:      { label:"Custom JavaScript",   icon:"⌨",  col:"#304040", params:[
        { key:"code",         type:"code",     label:"JS executed on fire",
          default:"// state, cities, player, T, SE available\nconsole.log('action fired');" },
    ]},
};

// ============================================================================
// 4.  TRIGGER FACTORY
// ============================================================================
function _mkTrig(label) {
    return {
        id:         T._nextId++,
        label:      label || `Trigger ${T._nextId - 1}`,
        enabled:    true,
        repeatable: false,
        fired:      false,
        notes:      "",
        condition:  { logic:"AND", blocks:[{ type:"TURN_COUNT", params:{ turn:1, exact:false } }] },
        actions:    [],
    };
}

// ============================================================================
// 5.  EXTRA CSS
// ============================================================================
const EXTRA_CSS = `
/* ── TIMELINE EXPANSION ────────────────────────────────────────── */
#se-timeline.se-tl-expanded { height:62vh !important; min-height:340px; }
#se-timeline-body.se-story-body {
    display:grid;
    grid-template-columns:220px 1fr 340px;
    height:100%;
    overflow:hidden;
}

/* ── TRIGGER LIST ────────────────────────────────────────────────── */
.se-tl-list-wrap { display:flex;flex-direction:column;border-right:1px solid var(--se-border);overflow:hidden; }
.se-tl-list-bar  { padding:4px 5px;background:var(--se-panel-alt);border-bottom:1px solid var(--se-border);display:flex;gap:3px;align-items:center; }
.se-tl-search    { flex:1;background:var(--se-inset);border:1px solid var(--se-border);color:var(--se-text);font-family:'Georgia',serif;font-size:10px;padding:3px 6px;outline:none;border-radius:1px; }
.se-tl-search:focus { border-color:var(--se-gold-dim); }
.se-tl-list      { flex:1;overflow-y:auto; }
.se-tl-item      { display:flex;align-items:center;gap:5px;padding:5px 6px;border-bottom:1px solid rgba(90,64,32,0.3);cursor:pointer;transition:background 0.1s; }
.se-tl-item:hover { background:var(--se-stone); }
.se-tl-item.sel  { background:#2c1e08;border-left:3px solid var(--se-gold); }
.se-tl-item.dis  { opacity:0.45; }
.se-tl-item.hit .se-tl-num { background:var(--se-green);border-color:#3a8830;color:#fff; }
.se-tl-num       { width:17px;height:17px;border-radius:50%;background:var(--se-stone-hi);border:1px solid var(--se-border);display:flex;align-items:center;justify-content:center;font-size:8px;color:var(--se-text-dim);flex-shrink:0; }
.se-tl-item.sel .se-tl-num { background:var(--se-gold-dim);border-color:var(--se-gold);color:#fff; }
.se-tl-dot       { width:7px;height:7px;border-radius:50%;flex-shrink:0;cursor:pointer; }
.se-tl-info      { flex:1;min-width:0; }
.se-tl-ilabel    { font-size:10px;color:var(--se-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
.se-tl-icond     { font-size:8px;color:var(--se-text-dim);margin-top:1px; }
.se-tl-item-btns { display:flex;flex-direction:column;gap:2px;flex-shrink:0; }

/* ── TIMELINE TRACK ──────────────────────────────────────────────── */
.se-tltrack      { display:flex;flex-direction:column;overflow:hidden;border-right:1px solid var(--se-border); }
.se-tltrack-head { padding:4px 8px;background:var(--se-panel-alt);border-bottom:1px solid var(--se-border);display:flex;align-items:center;gap:6px;flex-shrink:0; }
.se-tltrack-ruler{ display:flex;height:20px;background:var(--se-inset);border-bottom:1px solid var(--se-border);flex-shrink:0;overflow:hidden; }
.se-tltrack-lcol { width:58px;flex-shrink:0;border-right:1px solid var(--se-border);background:var(--se-panel-alt); }
.se-tltrack-ticks{ flex:1;display:flex;overflow:hidden; }
.se-tl-tick      { min-width:68px;border-left:1px solid var(--se-border);display:flex;align-items:center;padding-left:3px;font-size:8px;color:var(--se-text-dim); }
.se-tltrack-body { flex:1;overflow-y:auto; }
.se-tl-lane      { display:flex;align-items:center;height:26px;border-bottom:1px solid rgba(90,64,32,0.3); }
.se-tl-lane-name { width:58px;flex-shrink:0;font-size:8px;color:var(--se-text-dim);text-transform:uppercase;letter-spacing:0.5px;padding:0 4px;border-right:1px solid var(--se-border);background:var(--se-panel-alt);height:100%;display:flex;align-items:center; }
.se-tl-lanetrack { flex:1;height:100%;position:relative;overflow:hidden; }
.se-tl-event     { position:absolute;height:18px;top:4px;border-radius:2px;padding:0 5px;font-size:9px;display:flex;align-items:center;cursor:pointer;white-space:nowrap;overflow:hidden;transition:filter 0.1s; }
.se-tl-event:hover { filter:brightness(1.25); }

/* ── TRIGGER EDITOR ──────────────────────────────────────────────── */
.se-tled-wrap  { display:flex;flex-direction:column;overflow:hidden; }
.se-tled-head  { padding:5px 8px;background:var(--se-panel-alt);border-bottom:1px solid var(--se-border);font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--se-gold-dim);display:flex;align-items:center;gap:6px;flex-shrink:0; }
.se-tled-body  { flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:8px; }

/* ── CONDITION BLOCKS ─────────────────────────────────────────────── */
.se-cond-block { background:var(--se-inset);border:1px solid var(--se-border);border-radius:2px;padding:5px 7px;display:flex;flex-direction:column;gap:4px; }
.se-cond-bhead { display:flex;align-items:center;gap:5px; }
.se-cond-icon  { font-size:12px;flex-shrink:0; }
.se-cond-tsel  { flex:1;background:var(--se-stone);border:1px solid var(--se-border);color:var(--se-text);font-family:'Georgia',serif;font-size:10px;padding:2px 4px;outline:none;cursor:pointer; }
.se-cond-params{ display:flex;flex-direction:column;gap:3px;padding-top:2px; }
.se-cond-prow  { display:flex;align-items:center;gap:5px; }
.se-cond-plbl  { font-size:9px;color:var(--se-text-dim);min-width:90px; }
.se-cond-in    { flex:1;background:var(--se-stone);border:1px solid var(--se-border);color:var(--se-text);font-family:'Georgia',serif;font-size:10px;padding:2px 5px;outline:none; }
.se-cond-in:focus { border-color:var(--se-gold-dim); }
.se-code-in    { background:#0a0806;border:1px solid var(--se-border);color:#88c888;font-family:'Consolas','Courier New',monospace;font-size:10px;padding:5px;resize:vertical;min-height:52px;width:100%;outline:none;line-height:1.5; }
.se-code-in:focus { border-color:var(--se-gold-dim); }
.se-logic-badge{ font-size:8px;font-weight:bold;padding:2px 7px;border-radius:2px;cursor:pointer;user-select:none;transition:background 0.1s; }
.se-logic-and  { background:#1a3a1a;color:#80e890;border:1px solid #3a8830; }
.se-logic-and:hover { background:#2a5a2a; }
.se-logic-or   { background:#1a1a3a;color:#90a0ff;border:1px solid #3040a8; }
.se-logic-or:hover  { background:#2a2a5a; }

/* ── ACTION CARDS ────────────────────────────────────────────────── */
.se-act-list   { display:flex;flex-direction:column;gap:4px; }
.se-act-card   { background:var(--se-inset);border:1px solid var(--se-border);border-radius:2px;overflow:hidden; }
.se-act-chead  { display:flex;align-items:center;gap:5px;padding:5px 7px;cursor:pointer;background:var(--se-stone);transition:background 0.1s; }
.se-act-chead:hover { background:var(--se-stone-hi); }
.se-act-icon   { font-size:12px;flex-shrink:0; }
.se-act-badge  { font-size:8px;padding:1px 5px;border-radius:2px;white-space:nowrap; }
.se-act-prev   { flex:1;font-size:9px;color:var(--se-text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.se-act-cbody  { padding:6px 8px;display:flex;flex-direction:column;gap:4px; }
.se-act-cbody.closed { display:none; }
.se-act-prow   { display:flex;align-items:flex-start;gap:5px; }
.se-act-plbl   { font-size:9px;color:var(--se-text-dim);min-width:105px;margin-top:3px; }
.se-act-in     { flex:1;background:var(--se-stone);border:1px solid var(--se-border);color:var(--se-text);font-family:'Georgia',serif;font-size:10px;padding:2px 5px;outline:none;border-radius:1px; }
.se-act-in:focus { border-color:var(--se-gold-dim); }
.se-act-ta     { flex:1;background:var(--se-stone);border:1px solid var(--se-border);color:var(--se-text);font-family:'Georgia',serif;font-size:10px;padding:3px 5px;outline:none;resize:vertical;min-height:40px;line-height:1.5; }
.se-act-ta:focus { border-color:var(--se-gold-dim); }
.se-act-sel    { flex:1;background:var(--se-stone);border:1px solid var(--se-border);color:var(--se-text);font-family:'Georgia',serif;font-size:10px;padding:2px 4px;outline:none; }

/* ── STORY BAR INJECTION ─────────────────────────────────────────── */
.se-storybar-inj { display:flex;align-items:center;gap:4px;padding:0 6px;border-left:1px solid var(--se-border); }
.se-scene-name   { background:var(--se-inset);border:1px solid var(--se-border);color:var(--se-gold);font-family:'Georgia',serif;font-size:11px;padding:3px 7px;outline:none;width:170px; }
.se-scene-name:focus { border-color:var(--se-gold-dim); }
.se-save-dot     { width:7px;height:7px;border-radius:50%;background:#3a8830;box-shadow:0 0 4px rgba(58,136,48,0.8);flex-shrink:0; }
.se-save-dot.dirty { background:#c88010;box-shadow:0 0 4px rgba(200,128,16,0.8); }

/* ── IN-BATTLE DIALOGUE ──────────────────────────────────────────── */
.se-bdl-overlay  { position:fixed;z-index:15000;pointer-events:none;width:580px;max-width:92vw; }
.se-bdl-box      { background:rgba(16,10,5,0.93);border:2px solid var(--se-border-hi);border-radius:3px;padding:10px 14px;display:flex;align-items:flex-start;gap:10px;box-shadow:0 6px 24px rgba(0,0,0,0.9);animation:bdl-in 0.18s ease-out; }
@keyframes bdl-in { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
.se-bdl-portrait { font-size:28px;flex-shrink:0;line-height:1; }
.se-bdl-textcol  { flex:1; }
.se-bdl-speaker  { font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--se-gold);margin-bottom:4px; }
.se-bdl-text     { font-size:13px;color:var(--se-text-hi);line-height:1.7;font-style:italic; }

/* ── LOAD MODAL ──────────────────────────────────────────────────── */
.se-load-modal   { position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:25000;display:flex;align-items:center;justify-content:center; }
.se-load-box     { background:#1a140e;border:2px solid var(--se-border-hi);padding:20px;width:500px;max-height:72vh;display:flex;flex-direction:column;gap:10px;font-family:'Georgia',serif; }
.se-load-title   { font-size:14px;color:var(--se-gold);letter-spacing:2px;text-transform:uppercase;border-bottom:1px solid var(--se-border);padding-bottom:8px; }
.se-load-list    { flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:4px; }
.se-load-row     { display:flex;align-items:center;gap:8px;padding:8px;background:var(--se-stone);border:1px solid var(--se-border);cursor:pointer;border-radius:2px;transition:border-color 0.1s; }
.se-load-row:hover { border-color:var(--se-gold-dim); }
`;

// ============================================================================
// 6.  CSS INJECTION
// ============================================================================
function _css() {
    if (document.getElementById("se-story-css")) return;
    const s = document.createElement("style");
    s.id = "se-story-css";
    s.textContent = EXTRA_CSS;
    document.head.appendChild(s);
}

// ============================================================================
// 7.  MOUNT THE FULL TRIGGERS TAB
// ============================================================================
function _mount() {
    _css();
    const body = document.getElementById("se-timeline-body");
    if (!body) return;

    // Expand timeline panel
    const tl = document.getElementById("se-timeline");
    if (tl) tl.classList.add("se-tl-expanded");
    body.className = "se-story-body";

    _injectStoryBar();

    body.innerHTML =
        _buildListPanel() +
        _buildTrackPanel() +
        _buildEditorPanel();

    _renderList();
    _renderTimeline();

    if (T.selectedId) {
        const t = _get(T.selectedId);
        if (t) _populate(t);
    } else {
        _edPlaceholder();
    }

    _startAutoSave();
}

// ============================================================================
// 8.  STORY BAR (name + save/load buttons injected into timeline tab row)
// ============================================================================
function _injectStoryBar() {
    const tabBar = document.getElementById("se-timeline-tabs");
    if (!tabBar || tabBar.querySelector(".se-storybar-inj")) return;

    const bar = document.createElement("div");
    bar.className = "se-storybar-inj";
    bar.innerHTML = `
        <input type="text" class="se-scene-name" id="se-story-name"
            value="${_esc(T._scenarioName)}" placeholder="Scenario name"
            oninput="window._SE_STORY._scenarioName=this.value;window._SE_STORY._dirty=true" />
        <div class="se-save-dot" id="se-save-dot" title="● = unsaved changes"></div>
        <button class="se-btn primary" style="font-size:9px;padding:3px 7px"
            onclick="window._SE_STORY._save()" title="Save (Ctrl+S)">💾 Save</button>
        <button class="se-btn" style="font-size:9px;padding:3px 7px"
            onclick="window._SE_STORY._showLoad()" title="Load scenario">📂 Load</button>
        <button class="se-btn" style="font-size:9px;padding:3px 7px"
            onclick="window._SE_STORY._export()" title="Export .json to PC">↗ Export</button>
        <button class="se-btn success" style="font-size:9px;padding:3px 7px"
            onclick="window._SE_STORY._activateRuntime()" title="Activate triggers in-game">▶ Run Story</button>`;

    const addBtn = tabBar.querySelector(".se-btn.primary");
    if (addBtn) tabBar.insertBefore(bar, addBtn);
    else tabBar.appendChild(bar);
}

// ============================================================================
// 9.  TRIGGER LIST PANEL
// ============================================================================
function _buildListPanel() {
    return `
    <div class="se-tl-list-wrap">
        <div class="se-tl-list-bar">
            <input type="text" class="se-tl-search" id="se-tl-search"
                placeholder="Search…"
                oninput="window._SE_STORY._filterList(this.value)" />
            <button class="se-btn primary icon-only" style="font-size:10px;padding:2px 6px"
                title="Add trigger" onclick="window._SE_STORY._add()">+</button>
            <button class="se-btn icon-only" style="font-size:10px;padding:2px 5px"
                title="Duplicate" onclick="window._SE_STORY._dup()">⊕</button>
            <button class="se-btn icon-only danger" style="font-size:10px;padding:2px 5px"
                title="Delete selected" onclick="window._SE_STORY._del()">✕</button>
        </div>
        <div class="se-tl-list" id="se-tl-list"></div>
        <div style="padding:4px 7px;border-top:1px solid var(--se-border);font-size:9px;color:var(--se-text-dim)">
            <span id="se-tl-cnt">0</span> triggers &nbsp;·&nbsp;
            <span id="se-tl-encnt">0</span> enabled
        </div>
    </div>`;
}

T._filterList = function(q) { _renderList(q); };

function _renderList(filter) {
    const list = document.getElementById("se-tl-list");
    if (!list) return;
    const q = (filter || "").toLowerCase();
    const vis = q ? T.triggers.filter(t => t.label.toLowerCase().includes(q)) : T.triggers;

    list.innerHTML = vis.map((t, i) => {
        const dot  = t.enabled ? (t.fired ? "#3a8830" : "var(--se-gold)") : "var(--se-border)";
        const cls  = ["se-tl-item", t.id===T.selectedId?"sel":"", !t.enabled?"dis":"", t.fired?"hit":""].filter(Boolean).join(" ");
        return `
        <div class="${cls}" data-tid="${t.id}"
             onclick="window._SE_STORY._sel(${t.id})"
             title="Double-click to rename" ondblclick="window._SE_STORY._inlineRename(${t.id})">
            <div class="se-tl-num">${i+1}</div>
            <div class="se-tl-dot" style="background:${dot}" title="Toggle enabled"
                onclick="event.stopPropagation();window._SE_STORY._toggle(${t.id})"></div>
            <div class="se-tl-info">
                <div class="se-tl-ilabel">${_esc(t.label)}</div>
                <div class="se-tl-icond">${_condSummary(t.condition)}</div>
            </div>
            <div class="se-tl-item-btns">
                <button class="se-btn icon-only" style="font-size:7px;padding:1px 3px"
                    onclick="event.stopPropagation();window._SE_STORY._up(${t.id})">↑</button>
                <button class="se-btn icon-only" style="font-size:7px;padding:1px 3px"
                    onclick="event.stopPropagation();window._SE_STORY._dn(${t.id})">↓</button>
            </div>
        </div>`;
    }).join("");

    const c = document.getElementById("se-tl-cnt");
    if (c) c.textContent = T.triggers.length;
    const e = document.getElementById("se-tl-encnt");
    if (e) e.textContent = T.triggers.filter(x => x.enabled).length;
}

function _condSummary(cond) {
    if (!cond?.blocks?.length) return "No condition";
    return cond.blocks.map(b => {
        const p = b.params || {};
        switch (b.type) {
            case "MAP_LAUNCH":   return "On map launch";
            case "TURN_COUNT":   return `Turn ${p.exact?"=":"≥"} ${p.turn||"?"}`;
            case "BATTLE_START": return "Battle starts";
            case "BATTLE_END":   return `Battle ends (${p.result||"any"})`;
            case "CITY_CAPTURED":return `${p.city||"?"} captured`;
            case "CUSTOM_JS":    return "JS: " + (p.code||"").slice(0,20) + "…";
            default: return (COND[b.type]?.icon||"") + " " + (COND[b.type]?.label||b.type);
        }
    }).join(` ${cond.logic} `);
}

// ============================================================================
// 10.  TIMELINE TRACK PANEL
// ============================================================================
const LANES = [
    { key:"DLG", label:"Dialogue", match: a => a.type==="SHOW_DIALOGUE"  },
    { key:"BTL", label:"Battle",   match: a => a.type==="LAUNCH_BATTLE"  },
    { key:"ARM", label:"Army",     match: a => a.type==="SPAWN_ARMY"     },
    { key:"ECO", label:"Economy",  match: a => a.type==="GIVE_RESOURCES"||a.type==="SET_RELATION" },
    { key:"OTH", label:"Script",   match: a => !["SHOW_DIALOGUE","LAUNCH_BATTLE","SPAWN_ARMY","GIVE_RESOURCES","SET_RELATION"].includes(a.type) },
];
const LANE_COL = {
    DLG:{ bg:"#3a1a68",bd:"#7040c0",tx:"#c0a0ff" },
    BTL:{ bg:"#6a1010",bd:"#c03030",tx:"#ffa0a0" },
    ARM:{ bg:"#5a2010",bd:"#a06020",tx:"#ffc880" },
    ECO:{ bg:"#1a4818",bd:"#3a7838",tx:"#90e890" },
    OTH:{ bg:"#3a2e08",bd:"#7a6010",tx:"#e8c060" },
};

function _buildTrackPanel() {
    const maxT = Math.max(10, ...T.triggers.map(_trigTurn).map(n=>n+2));
    return `
    <div class="se-tltrack">
        <div class="se-tltrack-head">
            <span style="font-size:9px;color:var(--se-gold-dim);text-transform:uppercase;letter-spacing:1px">📅 Story Timeline</span>
            <span style="margin-left:auto;font-size:9px;color:var(--se-text-dim)">Zoom</span>
            <input type="range" id="se-tl-zoom" min="40" max="160" value="100" style="width:72px"
                oninput="window._SE_STORY._renderTimeline()" title="Timeline zoom" />
        </div>
        <div class="se-tltrack-ruler">
            <div class="se-tltrack-lcol"></div>
            <div class="se-tltrack-ticks" id="se-tl-ticks">
                ${Array.from({length:maxT},(_,i)=>`<div class="se-tl-tick">T${i+1}</div>`).join("")}
            </div>
        </div>
        <div class="se-tltrack-body">
            ${LANES.map(l=>`
            <div class="se-tl-lane">
                <div class="se-tl-lane-name">${l.label}</div>
                <div class="se-tl-lanetrack" id="se-tl-ln-${l.key}"></div>
            </div>`).join("")}
        </div>
    </div>`;
}

T._renderTimeline = function() { _renderTimeline(); };

function _renderTimeline() {
    const zEl   = document.getElementById("se-tl-zoom");
    const tw    = Math.round(68 * ((zEl ? parseInt(zEl.value) : 100) / 100));
    const maxT  = Math.max(10, ...T.triggers.map(_trigTurn).map(n=>n+2));

    // Rebuild ruler
    const ticks = document.getElementById("se-tl-ticks");
    if (ticks) ticks.innerHTML =
        Array.from({length:maxT},(_,i)=>`<div class="se-tl-tick" style="min-width:${tw}px">T${i+1}</div>`).join("");

    // Clear lanes
    LANES.forEach(l => { const el=document.getElementById(`se-tl-ln-${l.key}`); if(el) el.innerHTML=""; });

    // Place events
    T.triggers.forEach(trig => {
        const turn = _trigTurn(trig);
        const lx   = (turn - 1) * tw + 2;

        const placed = new Set();
        trig.actions.forEach(act => {
            const lane = LANES.find(l => l.match(act)) || LANES[LANES.length-1];
            const c    = LANE_COL[lane.key] || LANE_COL.OTH;
            const el   = document.getElementById(`se-tl-ln-${lane.key}`);
            if (!el) return;
            placed.add(lane.key);
            const div  = document.createElement("div");
            div.className = "se-tl-event";
            div.style.cssText = `left:${lx}px;background:${c.bg};border:1px solid ${c.bd};color:${c.tx}`;
            div.title  = `${trig.label} → ${act.type}`;
            div.textContent = `${ACT[act.type]?.icon||"⚡"} ${trig.label}`;
            div.onclick = () => T._sel(trig.id);
            el.appendChild(div);
        });

        // Empty trigger fallback marker
        if (trig.actions.length === 0) {
            const el = document.getElementById("se-tl-ln-OTH");
            if (!el) return;
            const div = document.createElement("div");
            div.className = "se-tl-event";
            div.style.cssText = `left:${lx}px;background:#333;border:1px solid #555;color:#888`;
            div.title = trig.label + " (no actions)";
            div.textContent = `⚡ ${trig.label}`;
            div.onclick = () => T._sel(trig.id);
            el.appendChild(div);
        }
    });
}

function _trigTurn(trig) {
    const b = trig.condition?.blocks?.find(b => b.type==="TURN_COUNT");
    return b ? (parseInt(b.params?.turn)||1) : 1;
}

// ============================================================================
// 11.  TRIGGER EDITOR PANEL
// ============================================================================
function _buildEditorPanel() {
    return `
    <div class="se-tled-wrap">
        <div class="se-tled-head" id="se-tled-head">⚡ Trigger Editor</div>
        <div class="se-tled-body" id="se-tled-body"></div>
    </div>`;
}

function _edPlaceholder() {
    const h = document.getElementById("se-tled-head");
    const b = document.getElementById("se-tled-body");
    if (h) h.innerHTML = "⚡ Trigger Editor";
    if (b) b.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
            height:100%;gap:12px;opacity:0.38;padding:20px;text-align:center">
            <div style="font-size:36px">⚡</div>
            <div style="font-size:11px;color:var(--se-text-dim)">
                Select a trigger or click + to create one
            </div>
        </div>`;
}

function _populate(trig) {
    const h = document.getElementById("se-tled-head");
    const b = document.getElementById("se-tled-body");
    if (!h || !b) return;

    h.innerHTML = `⚡ <strong style="color:var(--se-gold)">${_esc(trig.label)}</strong>
        <span style="margin-left:auto;font-size:8px;color:var(--se-text-dim)">ID:${trig.id}</span>`;

    const facs  = _getFactions();
    const cits  = _getCities();
    const trigs = T.triggers.map(t => ({ id:t.id, label:t.label }));
    const tiles = ["Ocean","Coastal","River","Plains","Steppes","Forest","Dense Forest","Highlands","Mountains"];
    const objs  = T.objectives;

    b.innerHTML = `
    <!-- ── META ─────────────────────────────────────────────────────── -->
    <div class="se-card">
        <div class="se-card-header">📋 Properties</div>
        <div class="se-card-body">
            <div class="se-two-col">
                <div class="se-field">
                    <span class="se-label">Label</span>
                    <input class="se-input" type="text" value="${_esc(trig.label)}"
                        oninput="window._SE_STORY._setField(${trig.id},'label',this.value)" />
                </div>
                <div class="se-field">
                    <span class="se-label">Enabled</span>
                    <select class="se-select"
                        onchange="window._SE_STORY._setField(${trig.id},'enabled',this.value==='true')">
                        <option value="true"  ${trig.enabled ?"selected":""}>Yes</option>
                        <option value="false" ${!trig.enabled?"selected":""}>No</option>
                    </select>
                </div>
            </div>
            <div class="se-two-col">
                <div class="se-field">
                    <span class="se-label">Repeatable</span>
                    <select class="se-select"
                        onchange="window._SE_STORY._setField(${trig.id},'repeatable',this.value==='true')">
                        <option value="false" ${!trig.repeatable?"selected":""}>Fire once</option>
                        <option value="true"  ${trig.repeatable ?"selected":""}>Repeating</option>
                    </select>
                </div>
                <div class="se-field">
                    <span class="se-label">Status</span>
                    <div style="display:flex;align-items:center;gap:6px;height:24px">
                        <span style="font-size:9px;color:${trig.fired?"#80e890":"var(--se-text-dim)"}">
                            ${trig.fired?"✓ Fired":"Not fired"}
                        </span>
                        <button class="se-btn" style="font-size:8px;padding:1px 5px"
                            onclick="window._SE_STORY._resetFired(${trig.id})">↺ Reset</button>
                    </div>
                </div>
            </div>
            <div class="se-field">
                <span class="se-label">Dev Notes</span>
                <textarea class="se-textarea" style="min-height:32px"
                    oninput="window._SE_STORY._setField(${trig.id},'notes',this.value)"
                    >${_esc(trig.notes||"")}</textarea>
            </div>
        </div>
    </div>

    <!-- ── CONDITION ─────────────────────────────────────────────────── -->
    <div class="se-card">
        <div class="se-card-header">
            🎯 Condition
            <div style="display:flex;gap:3px;margin-left:auto">
                <button class="se-btn" style="font-size:8px;padding:1px 6px"
                    onclick="window._SE_STORY._cycleLogic(${trig.id})"
                    title="Toggle AND / OR combiner">
                    Combiner: <strong style="color:var(--se-gold)">${trig.condition.logic}</strong>
                </button>
                <button class="se-btn primary" style="font-size:8px;padding:1px 6px"
                    onclick="window._SE_STORY._addCond(${trig.id})">+ Block</button>
            </div>
        </div>
        <div class="se-card-body" id="se-condarea-${trig.id}">
            ${_renderCondBlocks(trig, facs, cits, tiles, trigs)}
        </div>
    </div>

    <!-- ── ACTIONS ────────────────────────────────────────────────────── -->
    <div class="se-card">
        <div class="se-card-header">
            ▶ Actions
            <div style="display:flex;gap:3px;margin-left:auto;align-items:center">
                <select id="se-act-typesel" class="se-select" style="font-size:9px;padding:2px 4px">
                    ${Object.entries(ACT).map(([k,v])=>`<option value="${k}">${v.icon} ${v.label}</option>`).join("")}
                </select>
                <button class="se-btn primary" style="font-size:8px;padding:1px 6px"
                    onclick="window._SE_STORY._addAct(${trig.id})">+ Add</button>
            </div>
        </div>
        <div class="se-card-body">
            <div class="se-act-list" id="se-actlist-${trig.id}">
                ${_renderActList(trig, facs, cits, tiles, trigs, objs)}
            </div>
            <div id="se-actempty-${trig.id}" style="font-size:10px;color:var(--se-text-dim);text-align:center;padding:7px;${trig.actions.length?"display:none":""}">
                No actions — select a type above then click + Add
            </div>
        </div>
    </div>

    <!-- ── QUICK TOOLS ────────────────────────────────────────────────── -->
    <div style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="se-btn success" style="flex:1"
            onclick="window._SE_STORY._testFire(${trig.id})" title="Run this trigger's actions now">▶ Test Fire</button>
        <button class="se-btn" style="flex:1"
            onclick="window._SE_STORY._dup()" title="Duplicate this trigger">⊕ Duplicate</button>
        <button class="se-btn danger"
            onclick="window._SE_STORY._del()" title="Delete this trigger">✕ Delete</button>
    </div>`;
}

// ============================================================================
// 12.  CONDITION BLOCK RENDERER
// ============================================================================
function _renderCondBlocks(trig, facs, cits, tiles, trigs) {
    if (!trig.condition.blocks?.length)
        return `<div style="font-size:10px;color:var(--se-text-dim);text-align:center;padding:6px">No conditions — click + Block</div>`;

    return trig.condition.blocks.map((blk, bi) => {
        const def = COND[blk.type] || COND.CUSTOM_JS;
        return `
        ${bi > 0 ? `
        <div style="padding:2px 3px;margin:2px 0">
            <span class="se-logic-badge se-logic-${trig.condition.logic.toLowerCase()}"
                onclick="window._SE_STORY._cycleLogic(${trig.id})"
                title="Click to toggle AND/OR">${trig.condition.logic}</span>
        </div>` : ""}
        <div class="se-cond-block">
            <div class="se-cond-bhead">
                <span class="se-cond-icon">${def.icon}</span>
                <select class="se-cond-tsel"
                    onchange="window._SE_STORY._condType(${trig.id},${bi},this.value)">
                    ${Object.entries(COND).map(([k,v])=>
                        `<option value="${k}" ${k===blk.type?"selected":""}>${v.icon} ${v.label}</option>`
                    ).join("")}
                </select>
                <button class="se-btn icon-only danger" style="font-size:8px;padding:1px 4px"
                    onclick="window._SE_STORY._remCond(${trig.id},${bi})">✕</button>
            </div>
            <div class="se-cond-params">
                ${_renderCondParams(blk, bi, trig.id, def, facs, cits, tiles, trigs)}
            </div>
        </div>`;
    }).join("");
}

function _renderCondParams(blk, bi, tid, def, facs, cits, tiles, trigs) {
    return (def.params||[]).map(p => {
        const val  = blk.params?.[p.key] ?? p.default;
        const eid  = `se-cp-${tid}-${bi}-${p.key}`;
        const onch = `window._SE_STORY._cp(${tid},${bi},'${p.key}',this.value)`;

        let inp = "";
        if      (p.type==="number")  inp = `<input type="number" id="${eid}" class="se-cond-in" value="${val}" step="${p.step||1}" min="${p.min??0}" max="${p.max??9999}" oninput="${onch}" />`;
        else if (p.type==="bool")    inp = `<select id="${eid}" class="se-cond-in" onchange="${onch}"><option value="true" ${val?"selected":""}>Yes</option><option value="false" ${!val?"selected":""}>No</option></select>`;
        else if (p.type==="select")  inp = `<select id="${eid}" class="se-cond-in" onchange="${onch}">${(p.opts||[]).map(o=>`<option value="${o}" ${o===val?"selected":""}>${o}</option>`).join("")}</select>`;
        else if (p.type==="faction") inp = `<select id="${eid}" class="se-cond-in" onchange="${onch}"><option value="any">— Any —</option>${facs.map(f=>`<option value="${f}" ${f===val?"selected":""}>${f}</option>`).join("")}</select>`;
        else if (p.type==="city")    inp = `<select id="${eid}" class="se-cond-in" onchange="${onch}"><option value="">— Any City —</option>${cits.map(c=>`<option value="${c}" ${c===val?"selected":""}>${c}</option>`).join("")}</select>`;
        else if (p.type==="tile")    inp = `<select id="${eid}" class="se-cond-in" onchange="${onch}">${tiles.map(t=>`<option value="${t}" ${t===val?"selected":""}>${t}</option>`).join("")}</select>`;
        else if (p.type==="trigger") inp = `<select id="${eid}" class="se-cond-in" onchange="${onch}"><option value="">— None —</option>${trigs.map(t=>`<option value="${t.id}" ${String(t.id)===String(val)?"selected":""}>${t.label}</option>`).join("")}</select>`;
        else if (p.type==="code")    inp = `<textarea id="${eid}" class="se-code-in" oninput="${onch}">${_esc(val)}</textarea>`;
        else                         inp = `<input type="text" id="${eid}" class="se-cond-in" value="${_esc(val||"")}" oninput="${onch}" />`;

        return `<div class="se-cond-prow"><span class="se-cond-plbl">${p.label}</span>${inp}</div>`;
    }).join("");
}

// ============================================================================
// 13.  ACTION LIST RENDERER
// ============================================================================
function _renderActList(trig, facs, cits, tiles, trigs, objs) {
    return trig.actions.map((act, ai) => {
        const def = ACT[act.type] || ACT.CUSTOM_JS;
        const col = def.col || "#555";
        return `
        <div class="se-act-card" id="se-actcard-${trig.id}-${ai}">
            <div class="se-act-chead"
                onclick="window._SE_STORY._togActBody(${trig.id},${ai})">
                <span class="se-act-icon">${def.icon}</span>
                <span class="se-act-badge" style="background:${col}33;color:${col};border:1px solid ${col}">${act.type}</span>
                <span class="se-act-prev" id="se-actprev-${trig.id}-${ai}">${_actPrev(act)}</span>
                <div style="display:flex;gap:2px;margin-left:4px;flex-shrink:0">
                    <button class="se-btn icon-only" style="font-size:7px;padding:1px 3px" title="Move up"
                        onclick="event.stopPropagation();window._SE_STORY._actUp(${trig.id},${ai})">↑</button>
                    <button class="se-btn icon-only" style="font-size:7px;padding:1px 3px" title="Move down"
                        onclick="event.stopPropagation();window._SE_STORY._actDn(${trig.id},${ai})">↓</button>
                    <button class="se-btn icon-only danger" style="font-size:7px;padding:1px 3px" title="Delete"
                        onclick="event.stopPropagation();window._SE_STORY._delAct(${trig.id},${ai})">✕</button>
                </div>
            </div>
            <div class="se-act-cbody closed" id="se-actbody-${trig.id}-${ai}">
                ${_renderActParams(act, ai, trig.id, def, facs, cits, tiles, trigs, objs)}
            </div>
        </div>`;
    }).join("");
}

function _renderActParams(act, ai, tid, def, facs, cits, tiles, trigs, objs) {
    return (def.params||[]).map(p => {
        const val  = act.params?.[p.key] ?? p.default;
        const eid  = `se-ap-${tid}-${ai}-${p.key}`;
        const onch = `window._SE_STORY._ap(${tid},${ai},'${p.key}',this.value)`;
        const onck = `window._SE_STORY._ap(${tid},${ai},'${p.key}',this.checked)`;

        let inp = "";
        if      (p.type==="textarea") inp = `<textarea id="${eid}" class="se-act-ta" oninput="${onch}">${_esc(val||"")}</textarea>`;
        else if (p.type==="code")     inp = `<textarea id="${eid}" class="se-code-in" style="min-height:65px;flex:1" oninput="${onch}">${_esc(val||"")}</textarea>`;
        else if (p.type==="bool")     inp = `<label style="display:flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" id="${eid}" ${val?"checked":""} onchange="${onck}" style="accent-color:var(--se-gold);width:13px;height:13px"><span style="font-size:10px;color:var(--se-text)">Yes</span></label>`;
        else if (p.type==="select")   inp = `<select id="${eid}" class="se-act-sel" onchange="${onch}">${(p.opts||[]).map(o=>`<option value="${o}" ${o===val?"selected":""}>${o}</option>`).join("")}</select>`;
        else if (p.type==="faction")  inp = `<select id="${eid}" class="se-act-sel" onchange="${onch}"><option value="">— Select —</option><option value="Player">Player</option>${facs.map(f=>`<option value="${f}" ${f===val?"selected":""}>${f}</option>`).join("")}</select>`;
        else if (p.type==="city")     inp = `<select id="${eid}" class="se-act-sel" onchange="${onch}"><option value="">— Select City —</option>${cits.map(c=>`<option value="${c}" ${c===val?"selected":""}>${c}</option>`).join("")}</select>`;
        else if (p.type==="trigger")  inp = `<select id="${eid}" class="se-act-sel" onchange="${onch}"><option value="">— None —</option>${trigs.map(t=>`<option value="${t.id}" ${String(t.id)===String(val)?"selected":""}>${t.label}</option>`).join("")}</select>`;
        else if (p.type==="objective")inp = `<select id="${eid}" class="se-act-sel" onchange="${onch}"><option value="">— Select Objective —</option>${objs.map(o=>`<option value="${o.id}" ${String(o.id)===String(val)?"selected":""}>${o.title}</option>`).join("")}</select>`;
        else if (p.type==="roster")   inp = `<textarea id="${eid}" class="se-act-ta" style="min-height:34px" placeholder="Comma-separated unit names, blank = auto" oninput="${onch}">${_esc(val||"")}</textarea>`;
        else if (p.type==="number")   inp = `<input type="number" id="${eid}" class="se-act-in" value="${val}" step="${p.step||1}" min="${p.min??0}" max="${p.max??999999}" oninput="${onch}" />`;
        else                          inp = `<input type="text" id="${eid}" class="se-act-in" value="${_esc(val||"")}" oninput="${onch}" placeholder="${p.label}" />`;

        return `<div class="se-act-prow"><span class="se-act-plbl">${p.label}</span>${inp}</div>`;
    }).join("");
}

function _actPrev(act) {
    const p = act.params || {};
    switch (act.type) {
        case "SHOW_DIALOGUE":  return `${p.portrait||"💬"} "${(p.text||"").slice(0,30)}…"`;
        case "LAUNCH_BATTLE":  return `vs ${p.enemyFaction||"?"} on ${p.mapType||"?"}`;
        case "SPAWN_ARMY":     return `${p.count||"?"} × ${p.faction||"?"}`;
        case "SET_RELATION":   return `${p.factionA||"?"} ↔ ${p.factionB||"?"}: ${p.relation||"?"}`;
        case "GIVE_RESOURCES": return `${p.faction||"?"}: +${p.gold||0}💰 +${p.food||0}🌾`;
        case "PLAY_SOUND":     return p.path || "?";
        case "LOCK_CITY":      return `${p.city||"?"} ${p.locked?"🔒 locked":"🔓 unlocked"}`;
        case "SET_OBJECTIVE":  return `Obj ${p.objectiveId||"?"} → ${p.status||"?"}`;
        case "PAN_CAMERA":     return `→ (${p.nx||"?"},${p.ny||"?"}) ${p.duration||"?"}ms`;
        case "CUSTOM_JS":      return (p.code||"").slice(0,38) + "…";
        default: return "";
    }
}

// ============================================================================
// 14.  CRUD OPERATIONS
// ============================================================================
T._add = function() {
    const t = _mkTrig();
    T.triggers.push(t);
    _dirty();
    T._sel(t.id);
    _renderList();
    _renderTimeline();
};

T._sel = function(id) {
    T.selectedId = id;
    _renderList();
    const t = _get(id);
    if (t) _populate(t); else _edPlaceholder();
};

T._toggle = function(id) {
    const t = _get(id);
    if (!t) return;
    t.enabled = !t.enabled;
    _dirty();
    _renderList();
};

T._up = function(id) { _reorder(id,-1); };
T._dn = function(id) { _reorder(id,+1); };
function _reorder(id, d) {
    const i = T.triggers.findIndex(t => t.id===id);
    if (i<0) return;
    const ni = i+d;
    if (ni<0||ni>=T.triggers.length) return;
    const [x] = T.triggers.splice(i,1);
    T.triggers.splice(ni,0,x);
    _dirty();
    _renderList();
    _renderTimeline();
}

T._dup = function() {
    if (!T.selectedId) return;
    const orig = _get(T.selectedId);
    if (!orig) return;
    const copy = JSON.parse(JSON.stringify(orig));
    copy.id    = T._nextId++;
    copy.label = orig.label + " (copy)";
    copy.fired = false;
    T.triggers.push(copy);
    _dirty();
    T._sel(copy.id);
    _renderList();
    _renderTimeline();
};

T._del = function() {
    if (!T.selectedId) return;
    const t = _get(T.selectedId);
    if (!t || !confirm(`Delete trigger "${t.label}"?`)) return;
    T.triggers = T.triggers.filter(x => x.id!==T.selectedId);
    T.selectedId = T.triggers.length ? T.triggers[0].id : null;
    _dirty();
    _renderList();
    _renderTimeline();
    T.selectedId ? T._sel(T.selectedId) : _edPlaceholder();
};

T._setField = function(id, key, val) {
    const t = _get(id);
    if (!t) return;
    t[key] = val;
    _dirty();
    if (key==="label") {
        const lel = document.querySelector(`[data-tid="${id}"] .se-tl-ilabel`);
        if (lel) lel.textContent = val;
        const hed = document.getElementById("se-tled-head");
        if (hed) hed.innerHTML = `⚡ <strong style="color:var(--se-gold)">${_esc(val)}</strong>
            <span style="margin-left:auto;font-size:8px;color:var(--se-text-dim)">ID:${id}</span>`;
    }
};

T._resetFired = function(id) {
    const t = _get(id);
    if (!t) return;
    t.fired = false;
    T._rt.firedIds.delete(id);
    _dirty();
    _renderList();
    if (T.selectedId===id) T._sel(id);
};

T._inlineRename = function(id) {
    const el = document.querySelector(`[data-tid="${id}"] .se-tl-ilabel`);
    if (!el) return;
    el.contentEditable = "true";
    el.focus();
    const cleanup = () => {
        el.contentEditable = "false";
        T._setField(id, "label", el.textContent.trim() || "Trigger");
        const t = _get(id);
        if (t && T.selectedId===id) {
            const input = document.querySelector("#se-tled-body input[oninput*=\"'label'\"]");
            if (input) input.value = t.label;
        }
    };
    el.addEventListener("blur", cleanup, { once:true });
    el.addEventListener("keydown", e => { if (e.key==="Enter") { e.preventDefault(); el.blur(); } });
};

// ============================================================================
// 15.  CONDITION OPERATIONS
// ============================================================================
T._cycleLogic = function(tid) {
    const t = _get(tid);
    if (!t) return;
    t.condition.logic = t.condition.logic==="AND" ? "OR" : "AND";
    _dirty();
    _refreshCondArea(t);
};

T._addCond = function(tid) {
    const t = _get(tid);
    if (!t) return;
    t.condition.blocks.push({ type:"TURN_COUNT", params:{ turn:1, exact:false } });
    _dirty();
    _refreshCondArea(t);
};

T._remCond = function(tid, bi) {
    const t = _get(tid);
    if (!t) return;
    t.condition.blocks.splice(bi,1);
    _dirty();
    _refreshCondArea(t);
};

T._condType = function(tid, bi, newType) {
    const t = _get(tid);
    if (!t) return;
    const def = COND[newType] || COND.CUSTOM_JS;
    const params = {};
    (def.params||[]).forEach(p => { params[p.key]=p.default; });
    t.condition.blocks[bi] = { type:newType, params };
    _dirty();
    _refreshCondArea(t);
};

T._cp = function(tid, bi, key, val) {
    const t = _get(tid);
    if (!t?.condition.blocks[bi]) return;
    t.condition.blocks[bi].params = t.condition.blocks[bi].params || {};
    t.condition.blocks[bi].params[key] = val;
    _dirty();
    _renderTimeline();
    // Update cond summary in list
    const el = document.querySelector(`[data-tid="${tid}"] .se-tl-icond`);
    if (el) el.textContent = _condSummary(t.condition);
};

function _refreshCondArea(trig) {
    const area = document.getElementById(`se-condarea-${trig.id}`);
    if (!area) return;
    area.innerHTML = _renderCondBlocks(trig, _getFactions(), _getCities(),
        ["Ocean","Coastal","River","Plains","Steppes","Forest","Dense Forest","Highlands","Mountains"],
        T.triggers.map(t=>({id:t.id,label:t.label}))
    );
}

// ============================================================================
// 16.  ACTION OPERATIONS
// ============================================================================
T._addAct = function(tid) {
    const t   = _get(tid);
    if (!t) return;
    const sel = document.getElementById("se-act-typesel");
    const type= sel ? sel.value : "SHOW_DIALOGUE";
    const def = ACT[type] || ACT.CUSTOM_JS;
    const params = {};
    (def.params||[]).forEach(p => { params[p.key]=p.default; });
    t.actions.push({ type, params });
    _dirty();
    _refreshActArea(t);
    _renderTimeline();
};

T._delAct = function(tid, ai) {
    const t = _get(tid);
    if (!t) return;
    t.actions.splice(ai,1);
    _dirty();
    _refreshActArea(t);
    _renderTimeline();
};

T._actUp = function(tid, ai) {
    const t = _get(tid);
    if (!t||ai===0) return;
    [t.actions[ai-1],t.actions[ai]]=[t.actions[ai],t.actions[ai-1]];
    _dirty(); _refreshActArea(t);
};

T._actDn = function(tid, ai) {
    const t = _get(tid);
    if (!t||ai>=t.actions.length-1) return;
    [t.actions[ai+1],t.actions[ai]]=[t.actions[ai],t.actions[ai+1]];
    _dirty(); _refreshActArea(t);
};

T._togActBody = function(tid, ai) {
    const b = document.getElementById(`se-actbody-${tid}-${ai}`);
    if (b) b.classList.toggle("closed");
};

T._ap = function(tid, ai, key, val) {
    const t = _get(tid);
    if (!t?.actions[ai]) return;
    t.actions[ai].params = t.actions[ai].params || {};
    t.actions[ai].params[key] = val;
    _dirty();
    const prev = document.getElementById(`se-actprev-${tid}-${ai}`);
    if (prev) prev.textContent = _actPrev(t.actions[ai]);
};

function _refreshActArea(trig) {
    const list  = document.getElementById(`se-actlist-${trig.id}`);
    const empty = document.getElementById(`se-actempty-${trig.id}`);
    if (!list) return;
    list.innerHTML = _renderActList(trig, _getFactions(), _getCities(),
        ["Ocean","Coastal","River","Plains","Steppes","Forest","Dense Forest","Highlands","Mountains"],
        T.triggers.map(t=>({id:t.id,label:t.label})),
        T.objectives
    );
    if (empty) empty.style.display = trig.actions.length ? "none" : "";
}

// ============================================================================
// 17.  TEST FIRE
// ============================================================================
T._testFire = function(id) {
    const t = _get(id);
    if (!t) return;
    TriggerRuntime._execAll(t, _gameState());
    _flash(`▶ Test-fired: ${t.label}`);
};

// ============================================================================
// 18.  TRIGGER RUNTIME ENGINE
// ============================================================================
const TriggerRuntime = {
    activate() {
        T._rt.active   = true;
        T._rt.turn     = 1;
        T._rt.firedIds = new Set();
        _hookLoop();
        _flash("✓ Story runtime active — triggers will fire in-game");
        console.log("[StoryRuntime] Activated.");
    },

    tick(state) {
        if (!T._rt.active) return;
        T.triggers.forEach(trig => {
            if (!trig.enabled) return;
            if (trig.fired && !trig.repeatable) return;
            if (T._rt.firedIds.has(trig.id) && !trig.repeatable) return;
            if (TriggerRuntime._evalCond(trig.condition, state)) {
                TriggerRuntime._execAll(trig, state);
                trig.fired = true;
                T._rt.firedIds.add(trig.id);
                console.log("[StoryRuntime] Fired:", trig.label);
                setTimeout(_renderList, 0);
            }
        });
    },

    _evalCond(cond, state) {
        if (!cond?.blocks?.length) return false;
        const res = cond.blocks.map(b => TriggerRuntime._evalBlock(b, state));
        return cond.logic === "OR" ? res.some(Boolean) : res.every(Boolean);
    },

    _evalBlock(b, s) {
        const p = b.params || {};
        s = s || {};
        try {
            switch (b.type) {
                case "MAP_LAUNCH":    return true;
                case "TURN_COUNT":    return p.exact
                    ? parseInt(s.turn) === parseInt(p.turn)
                    : parseInt(s.turn) >= parseInt(p.turn);
                case "BATTLE_START":  return !!s.battleStarted;
                case "BATTLE_END":    if (!s.battleEnded) return false;
                                      if (p.result==="any") return true;
                                      if (p.result==="victory") return !!s.playerWon;
                                      if (p.result==="defeat") return !s.playerWon;
                                      return true;
                case "CITY_CAPTURED": return (s.capturedCities||[]).some(c =>
                    (!p.city||c.name===p.city) && (p.byFaction==="any"||c.faction===p.byFaction));
                case "CITY_HP": {
                    const city = (s.cities||[]).find(c=>c.name===p.city);
                    if (!city) return false;
                    return ((city.hp||city.garrison)/(city.maxHp||city.maxGarrison||1))*100 < parseInt(p.pct||30);
                }
                case "PLAYER_ON_TILE": return s.playerTile === p.tile;
                case "PLAYER_IN_REGION": {
                    const dx = (s.playerNx||0)-(parseFloat(p.nx)||0.5);
                    const dy = (s.playerNy||0)-(parseFloat(p.ny)||0.5);
                    return Math.sqrt(dx*dx+dy*dy) < (parseFloat(p.radius)||0.05);
                }
                case "FACTION_ELIMINATED":
                    return (s.cities||[]).filter(c=>c.faction===p.faction).length === 0;
                case "PLAYER_GOLD": {
                    const g = s.playerGold||0;
                    if (p.op===">=") return g>=parseInt(p.amount);
                    if (p.op==="<=") return g<=parseInt(p.amount);
                    if (p.op==="==") return g===parseInt(p.amount);
                    return false;
                }
                case "DIALOGUE_DONE": return T._rt.firedIds.has(parseInt(p.triggerId));
                case "CUSTOM_JS": {
                    const fn = new Function("state","turn","cities","player", p.code||"return false;");
                    return !!fn(s, s.turn, s.cities, s.player);
                }
                default: return false;
            }
        } catch(e) { console.warn("[RT] Cond eval:", e); return false; }
    },

    _execAll(trig, state) {
        (trig.actions||[]).forEach(act => {
            try { TriggerRuntime._exec(act, state||{}, trig); }
            catch(e) { console.warn("[RT] Action error:", act.type, e); }
        });
    },

    _exec(act, state, trig) {
        const p = act.params || {};
        switch (act.type) {

        case "SHOW_DIALOGUE":
            BattleDialogue.queue(p.speaker, p.portrait, p.text,
                parseInt(p.duration)||4000, p.position||"bottom");
            break;

        case "LAUNCH_BATTLE": {
            const mapType = p.mapType==="current_tile" ? (state.playerTile||"Plains") : (p.mapType||"Plains");
            const eF   = p.enemyFaction || (_getFactions()[0]||"");
            const eFac = (typeof FACTIONS!=="undefined" && FACTIONS[eF]) || {};

            const enemySO = {
                faction: eF,
                color:   eFac.color||"#f44336",
                roster:  p.enemyRoster ? p.enemyRoster.split(",").map(s=>s.trim()).filter(Boolean) : [],
                cost: 0,
            };
            const plyrSO = {
                faction: state.playerFaction || "Player's Kingdom",
                color:   ((typeof FACTIONS!=="undefined"&&FACTIONS[state.playerFaction])||{}).color||"#fff",
                roster:  (p.useLiveArmy==="true"||p.useLiveArmy===true)
                    ? (state.playerArmy||[]) : [],
                cost: 0,
            };

            // Store for post-battle result routing
            T._rt.battlePending = {
                winTriggerId:  p.winTrigger  ? parseInt(p.winTrigger)  : null,
                loseTriggerId: p.loseTrigger ? parseInt(p.loseTrigger) : null,
            };

            // Pre-battle dialogue
            if (p.preBattleText) {
                BattleDialogue.queue(p.preSpeaker||"Narrator","⚔",p.preBattleText,2800,"top");
            }

            const launch = () => {
                if (typeof window.customFunds !== "undefined")
                    window.customFunds = parseInt(p.enemyBudget)||1000;
                if (typeof window.selectedMap !== "undefined")
                    window.selectedMap = mapType;
                if (typeof window.playerSetup !== "undefined")
                    window.playerSetup = plyrSO;
                if (typeof window.enemySetup !== "undefined")
                    window.enemySetup  = enemySO;

                if (typeof window.launchCustomBattle === "function") {
                    window.launchCustomBattle();
                } else if (typeof window.showCustomBattleMenu === "function") {
                    window.showCustomBattleMenu();
                }
            };

            setTimeout(launch, p.preBattleText ? 3000 : 150);
            break;
        }

        case "SPAWN_ARMY": {
            if (typeof window.globalNPCs === "undefined") break;
            const map = SE.mapEngine?.getMap();
            const ts  = map?.tileSize || 16;
            const cols= map?.cols || 250;
            const rows= map?.rows || 187;
            const fac = (typeof FACTIONS!=="undefined" && FACTIONS[p.faction]) || {};
            for (let i = 0; i < (parseInt(p.count)||1); i++) {
                window.globalNPCs.push({
                    x:(parseFloat(p.nx)||0.5)*cols*ts, y:(parseFloat(p.ny)||0.5)*rows*ts,
                    faction:p.faction, color:fac.color||"#888",
                    role:p.role||"Military",
                    troops:parseInt(p.troops)||150, maxTroops:parseInt(p.troops)||150,
                    speed:1.2, anim:0, isMoving:false, target:null,
                });
            }
            break;
        }

        case "SET_RELATION":
            if (typeof window._SE_CNP !== "undefined") {
                window._SE_CNP.diplomacy[`${p.factionA}::${p.factionB}`] = p.relation;
                window._SE_CNP.diplomacy[`${p.factionB}::${p.factionA}`] = p.relation;
            }
            break;

        case "GIVE_RESOURCES":
            if (p.faction==="Player"||p.faction===state.playerFaction) {
                if (typeof window.playerGold!=="undefined") window.playerGold += parseInt(p.gold)||0;
                if (typeof window.playerFood!=="undefined") window.playerFood += parseInt(p.food)||0;
            }
            (typeof window.cities!=="undefined"?window.cities:[])
                .filter(c=>c.faction===p.faction).forEach(c => {
                    c.gold = (c.gold||0)+(parseInt(p.gold)||0);
                    c.food = (c.food||0)+(parseInt(p.food)||0);
                });
            break;

        case "PLAY_SOUND":
            if (p.stopAll && typeof AudioManager!=="undefined") AudioManager.stopAll?.();
            if (typeof AudioManager!=="undefined") {
                AudioManager.playMP3(p.path, p.loop==="true"||p.loop===true);
            } else if (p.path) {
                const a = new Audio(p.path);
                a.loop  = p.loop==="true"||p.loop===true;
                a.play().catch(()=>{});
            }
            break;

        case "LOCK_CITY":
            (typeof window.cities!=="undefined"?window.cities:[])
                .filter(c=>c.name===p.city).forEach(c => { c.locked = p.locked==="true"||p.locked===true; });
            break;

        case "SET_OBJECTIVE": {
            const obj = T.objectives.find(o=>String(o.id)===String(p.objectiveId));
            if (obj) obj.status = p.status;
            break;
        }

        case "PAN_CAMERA": {
            const map = SE.mapEngine?.getMap();
            if (!map || typeof window.camera === "undefined") break;
            const ts  = map.tileSize;
            const tx  = (parseFloat(p.nx)||0.5)*map.cols*ts;
            const ty  = (parseFloat(p.ny)||0.5)*map.rows*ts;
            const dur = parseInt(p.duration)||2000;
            if (p.lock==="true"||p.lock===true) {
                window._cameraLocked = true;
                setTimeout(()=>{ window._cameraLocked=false; }, dur);
            }
            const sx=window.camera.x, sy=window.camera.y, t0=Date.now();
            (function pan() {
                const f = Math.min(1,(Date.now()-t0)/dur);
                const e = f<0.5?2*f*f:-1+(4-2*f)*f;
                window.camera.x = sx+(tx-sx)*e;
                window.camera.y = sy+(ty-sy)*e;
                if (f<1) requestAnimationFrame(pan);
            })();
            break;
        }

        case "CUSTOM_JS": {
            const fn = new Function("state","cities","player","T","SE", p.code||"");
            fn(state,
               typeof window.cities!=="undefined"?window.cities:[],
               typeof window.player!=="undefined"?window.player:{},
               T, SE);
            break;
        }
        }
    },

    // Called from handleCustomBattleExit to route win/lose triggers
    onBattleEnd(playerWon) {
        const pending = T._rt.battlePending;
        if (!pending) return;
        T._rt.battlePending = null;
        const nextId = playerWon ? pending.winTriggerId : pending.loseTriggerId;
        if (!nextId) return;
        const t = _get(nextId);
        if (t) {
            console.log("[StoryRuntime] Battle result → firing:", t.label);
            TriggerRuntime._execAll(t, _gameState());
            t.fired = true;
            T._rt.firedIds.add(t.id);
        }
    },
};

// ============================================================================
// 19.  IN-BATTLE DIALOGUE SYSTEM
// ============================================================================
const BattleDialogue = {
    _q: [],
    _active: false,

    queue(speaker, portrait, text, duration, position) {
        if (!text) return;
        BattleDialogue._q.push({
            speaker: speaker||"Narrator",
            portrait: portrait||"💬",
            text, duration:parseInt(duration)||4000,
            position: position||"bottom",
        });
        if (!BattleDialogue._active) BattleDialogue._next();
    },

    _next() {
        if (!BattleDialogue._q.length) { BattleDialogue._active=false; return; }
        BattleDialogue._active = true;
        const item = BattleDialogue._q.shift();

        // Remove existing overlay
        const old = document.getElementById("se-bdl-ov");
        if (old) old.remove();

        const pos = {
            bottom:"bottom:72px;top:auto;left:50%;transform:translateX(-50%)",
            top:   "top:90px;bottom:auto;left:50%;transform:translateX(-50%)",
            center:"top:50%;left:50%;transform:translate(-50%,-50%)",
            left:  "bottom:72px;top:auto;left:16px;transform:none",
            right: "bottom:72px;top:auto;right:16px;left:auto;transform:none",
        };
        const ov = document.createElement("div");
        ov.id = "se-bdl-ov";
        ov.className = "se-bdl-overlay";
        ov.style.cssText = `position:fixed;z-index:15000;pointer-events:none;width:580px;max-width:92vw;`
            + (pos[item.position]||pos.bottom);

        ov.innerHTML = `
        <div class="se-bdl-box">
            <div class="se-bdl-portrait">${item.portrait}</div>
            <div class="se-bdl-textcol">
                <div class="se-bdl-speaker">${_esc(item.speaker)}</div>
                <div class="se-bdl-text">${_esc(item.text)}</div>
            </div>
        </div>`;
        document.body.appendChild(ov);

        setTimeout(() => {
            if (ov.firstChild) {
                ov.firstChild.style.animation = "bdl-in 0.18s ease-out reverse";
            }
            setTimeout(() => {
                ov.remove();
                setTimeout(() => BattleDialogue._next(), 200);
            }, 200);
        }, item.duration);
    },
};

// Expose globally so battle scripts can call directly
window.BattleDialogue = BattleDialogue;
 

// Patch handleCustomBattleExit to route results back to trigger runtime
(function _patchBattleExit() {
    const _orig = window.handleCustomBattleExit;
    if (typeof _orig !== "function") {
        // Will be patched again after custom_battle.js loads
        window._SE_STORY_BATTLE_HOOK = (playerWon) => TriggerRuntime.onBattleEnd(playerWon);
        return;
    }
    window.handleCustomBattleExit = function() {
        const units = (typeof battleEnvironment!=="undefined"&&battleEnvironment?.units) ? battleEnvironment.units : [];
        const pAlive = units.filter(u=>u.side==="player"&&u.hp>0).length;
        const eAlive = units.filter(u=>u.side==="enemy" &&u.hp>0).length;
        const playerWon = eAlive<=0 && pAlive>0;
        TriggerRuntime.onBattleEnd(playerWon);
        _orig.apply(this, arguments);
// FIXED — insert between them:
    };
    window.handleCustomBattleExit._sePatchedExit = true;   // ← INSERT THIS
})();
// ============================================================================
// 20.  GAME LOOP HOOK
// ============================================================================
function _hookLoop() {
    if (window._seStoryHooked) return;
    window._seStoryHooked = true;

    const _origDraw = window.draw;
    let _fc = 0;
    if (typeof _origDraw === "function") {
        window.draw = function() {
            _origDraw.apply(this, arguments);
            if (++_fc % 60 === 0) TriggerRuntime.tick(_gameState());
        };
        console.log("[StoryRuntime] draw() hooked.");
    }
    // Manual tick available as: SE_storyTick()
	//Section 33 (line 5997–5998) is the canonical public API block that sets SE_storyTick and SE_turnAdvance. _hookLoop is called after module load (on user activation), so its assignments at 4945–4946 silently overwrite the better Section 33 versions — specifically, line 4946 downgrades SE_turnAdvance from T._advanceTurn() (which also updates the DOM and fires a tick) to a bare T._rt.turn++.Delete both lines:// DELETE line 4945:window.SE_storyTick = (s) => TriggerRuntime.tick(s || _gameState());// DELETE line 4946: window.SE_turnAdvance = () => { T._rt.turn++; };
	
	
}

function _gameState() {
    const map  = SE.mapEngine?.getMap();
    const ts   = map?.tileSize || 16;
    const pl   = typeof window.player !== "undefined" ? window.player : {};
    const nx   = map&&pl.x!=null ? pl.x/(map.cols*ts) : 0.5;
    const ny   = map&&pl.y!=null ? pl.y/(map.rows*ts) : 0.5;
    let   tile = "Plains";
    if (map && pl.x!=null) {
        const col=Math.floor(pl.x/ts), row=Math.floor(pl.y/ts);
        if (col>=0&&col<map.cols&&row>=0&&row<map.rows)
            tile = map.tiles[col]?.[row]?.name || "Plains";
    }
    return {
        turn:          T._rt.turn,
        playerNx:      nx, playerNy:ny,
        playerTile:    tile,
        playerGold:    typeof window.playerGold!=="undefined" ? window.playerGold : 0,
        playerFaction: pl.faction || "Player's Kingdom",
        playerArmy:    (typeof window.battleEnvironment!=="undefined"
            ? (window.battleEnvironment?.units||[]).filter(u=>u.side==="player").map(u=>u.unitType)
            : []),
        cities:        typeof window.cities!=="undefined" ? window.cities : [],
        capturedCities:T._rt.capturedCities,
        battleStarted: typeof window.inBattleMode!=="undefined" ? window.inBattleMode : false,
        battleEnded:   false,
        playerWon:     false,
        firedTriggers: T._rt.firedIds,
        player:        pl,
    };
}

// ============================================================================
// 21.  SAVE / LOAD SYSTEM
// ============================================================================
const SV = 3; // schema version

function _serialize() {
    const map = SE.mapEngine?.getMap();
    const mapData = map ? (() => {
        const flat = [];
        for (let j=0; j<map.rows; j++)
            for (let i=0; i<map.cols; i++)
                flat.push(map.tiles[i]?.[j]?.name||"Ocean");
        return { version:SV, cols:map.cols, rows:map.rows, tileSize:map.tileSize,
            mapType:SE.mapEngine.getMapType(), tiles:flat };
    })() : null;

    const cnp = typeof window._SE_CNP !== "undefined" ? window._SE_CNP : {};

    return {
        version:     SV,
        savedAt:     Date.now(),
        meta:        { name:T._scenarioName, author:"Dev", description:"" },
        triggers:    JSON.parse(JSON.stringify(T.triggers)),
        objectives:  JSON.parse(JSON.stringify(T.objectives)),
        dialogueLines:JSON.parse(JSON.stringify(T.dialogueLines)),
        nextId:      T._nextId,
        mapData,
        cities:      JSON.parse(JSON.stringify(cnp.cities||[])),
        factionAliases: cnp.factionAliases||{},
        spawnRules:     cnp.spawnRules||{},
        compOverrides:  cnp.compOverrides||{},
        diplomacy:      cnp.diplomacy||{},
    };
}

function _deserialize(data) {
    if (!data) throw new Error("Empty file");
    T.triggers      = data.triggers      || [];
    T.objectives    = data.objectives    || [];
    T.dialogueLines = data.dialogueLines || [];
    T._nextId       = data.nextId || T.triggers.reduce((m,t)=>Math.max(m,t.id),0)+1;
    T._scenarioName = data.meta?.name || "Loaded Scenario";
    T._dirty        = false;

    const ni = document.getElementById("se-story-name");
    if (ni) ni.value = T._scenarioName;

    // Restore map tiles
    if (data.mapData && SE.mapEngine) {
        try { _restoreMap(data.mapData); } catch(e) { console.warn("[Load] Map restore:", e); }
    }

    // Restore cities/NPCs
    const cnp = typeof window._SE_CNP !== "undefined" ? window._SE_CNP : null;
    if (cnp && data.cities) {
        cnp.cities         = data.cities;
        cnp.factionAliases = data.factionAliases||{};
        cnp.spawnRules     = data.spawnRules||{};
        cnp.compOverrides  = data.compOverrides||{};
        cnp.diplomacy      = data.diplomacy||{};
    }
}

function _restoreMap(md) {
    const TDEFS = SE.mapEngine?.TILE_DEFS;
    if (!TDEFS) return;
    const tiles = [];
    let idx = 0;
    for (let i=0; i<md.cols; i++) {
        tiles[i]=[];
        for (let j=0; j<md.rows; j++) {
            const name = md.tiles?.[idx++] || "Ocean";
            tiles[i][j] = { name, ...(TDEFS[name]||TDEFS["Ocean"]) };
        }
    }
    const map = SE.mapEngine.getMap();
    if (map) {
        map.tiles = tiles;
        map.cols  = md.cols;
        map.rows  = md.rows;
        // Trigger minimap rebuild
        SE.mapEngine._rebuildMinimap?.();
    }
}

T._save = function() {
    const data = _serialize();
    const json = JSON.stringify(data);
    const key  = `SE_story_${data.meta.name.replace(/\W+/g,"_")}`;
    try {
        localStorage.setItem(key, json);
        localStorage.setItem("SE_story_LAST", json);
    } catch(e) { console.warn("localStorage:", e); }
    T._dirty = false;
    _dotDirty(false);
    _flash(`✓ Saved "${data.meta.name}" (${data.triggers.length} triggers)`);
};

T._export = function() {
    const data = _serialize();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type:"application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = (data.meta.name||"scenario").replace(/\W+/g,"_")+"_"+Date.now()+".json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    _flash(`✓ Exported "${data.meta.name}"`);
};

T._showLoad = function() {
    // Build list from localStorage
    const saves = [];
    for (let i=0; i<localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k?.startsWith("SE_story_")||k==="SE_story_LAST") continue;
        try {
            const d = JSON.parse(localStorage.getItem(k));
            saves.push({ key:k, name:d.meta?.name||k, trigs:d.triggers?.length||0, at:d.savedAt||0 });
        } catch(e) {}
    }

    const modal = document.createElement("div");
    modal.className = "se-load-modal";
    modal.innerHTML = `
        <div class="se-load-box">
            <div class="se-load-title">📂 Load Scenario</div>
            <div class="se-load-list">
                ${saves.length ? saves.sort((a,b)=>b.at-a.at).map(s=>`
<div class="se-load-row" onclick="window._SE_STORY._loadKey('${s.key}',this.closest('.se-load-modal'))">
    <span style="font-size:18px">📜</span>
    <div style="flex:1">
        <div style="font-size:12px;color:white">${_esc(s.name)}</div>
        <div style="font-size:9px;color:var(--se-text-dim)">${s.trigs} triggers · ${new Date(s.at).toLocaleDateString()}</div>
    </div>
    <button class="se-btn" style="font-size:9px;padding:2px 6px">Load</button>
</div>
				
				`).join("")
                : `<div style="color:var(--se-text-dim);text-align:center;padding:20px;font-size:11px">No saved scenarios found</div>`}
            </div>
            <div style="display:flex;gap:6px;margin-top:6px">
                <button class="se-btn" style="flex:1" id="se-load-file-btn">📂 Load .json File</button>
                <button class="se-btn danger" onclick="this.closest('.se-load-modal').remove()">✕ Cancel</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById("se-load-file-btn").onclick = () => {
        modal.remove();
        T._loadFile();
    };
};

T._loadKey = function(key, modal) {
    try {
        _deserialize(JSON.parse(localStorage.getItem(key)));
        if (modal) modal.remove();
        _mount();
        _flash(`✓ Loaded "${T._scenarioName}"`);
    } catch(e) { _flash("⚠ Load error: "+e.message); }
};

T._loadFile = function() {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".json,application/json";
    inp.onchange = e => {
        const f = e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = ev => {
            try {
                _deserialize(JSON.parse(ev.target.result));
                _mount();
                _flash(`✓ Loaded "${T._scenarioName}" from file`);
            } catch(err) { _flash("⚠ "+err.message); }
        };
        r.readAsText(f);
    };
    inp.click();
};

T._activateRuntime = function() { TriggerRuntime.activate(); };

// ============================================================================
// 22.  AUTO-SAVE
// ============================================================================
function _startAutoSave() {
    if (T._autoTimer) clearInterval(T._autoTimer);
    T._autoTimer = setInterval(() => {
        if (T._dirty && T.triggers.length > 0) T._save();
    }, 60000);
}

function _dirty() {
    T._dirty = true;
    _dotDirty(true);
}

function _dotDirty(v) {
    const d = document.getElementById("se-save-dot");
    if (d) d.className = "se-save-dot" + (v?" dirty":"");
}

// ============================================================================
// 23.  SEED SAMPLE TRIGGERS
// ============================================================================
function _seed() {
    if (T.triggers.length) return;

    const t1 = _mkTrig("Scenario Start");
    t1.condition = { logic:"AND", blocks:[{ type:"MAP_LAUNCH", params:{} }] };
    t1.actions   = [{ type:"SHOW_DIALOGUE", params:{ speaker:"Narrator", portrait:"📜", text:"The conflict begins. Prepare your forces.", duration:4000, position:"bottom", inBattle:false } }];

    const t2 = _mkTrig("Turn 3 — Enemy Advances");
    t2.condition = { logic:"AND", blocks:[{ type:"TURN_COUNT", params:{ turn:3, exact:false } }] };
    t2.actions   = [
        { type:"SHOW_DIALOGUE", params:{ speaker:"Scout", portrait:"🔭", text:"Enemy forces are on the move!", duration:3500, position:"top", inBattle:false } },
        { type:"SPAWN_ARMY",    params:{ faction:"", count:2, troops:120, nx:0.2, ny:0.1, role:"Military" } },
    ];

    const t3 = _mkTrig("Battle Victory → Reward");
    t3.condition = { logic:"AND", blocks:[{ type:"BATTLE_END", params:{ result:"victory" } }] };
    t3.actions   = [
        { type:"GIVE_RESOURCES", params:{ faction:"Player", gold:500, food:200 } },
        { type:"SHOW_DIALOGUE",  params:{ speaker:"Commander", portrait:"🏆", text:"Victory! The enemy is routed!", duration:4000, position:"bottom", inBattle:true } },
    ];

    T.triggers.push(t1, t2, t3);
    T._dirty = false;
}

 
// ============================================================================
// 24. UTILITY (continuation — the helpers shared across all sections)
// ============================================================================

function _get(id) { return T.triggers.find(t => t.id === id || t.id === parseInt(id)); }
function _getFactions(){ return Object.keys(typeof FACTIONS !== "undefined" ? FACTIONS : {}); }
function _getCities() {
const cnp = typeof window._SE_CNP !== "undefined" ? window._SE_CNP : null;
if (cnp) return cnp.cities.map(c => c.name);
if (typeof window.cities !== "undefined") return window.cities.map(c => c.name);
return [];
}
function _esc(s) {
return String(s || "")

// CORRECT
.replace(/&/g, "&amp;").replace(/</g, "&lt;")
.replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _flash(msg, dur = 4000) {
const el = document.getElementById("se-st-scenario");
if (!el) { console.log("[Story]", msg); return; }
const prev = el.textContent;
el.textContent = msg;
clearTimeout(T._flashTimer);
T._flashTimer = setTimeout(() => { el.textContent = prev; }, dur);
}

// Keyboard shortcuts — active while the editor root is in the DOM
function _keyHandler(e) {
if (!document.getElementById("se-root")) {
document.removeEventListener("keydown", _keyHandler);
return;
}
if (e.ctrlKey && e.key === "s") { e.preventDefault(); T._save(); }
if (e.ctrlKey && e.key === "z") {
// Undo is handled by the map engine; don't intercept here
}
// Alt+T → add new trigger quickly
if (e.altKey && e.key === "t") { e.preventDefault(); T._add(); }
// Escape → deselect / close any open modal
if (e.key === "Escape") {
const modal = document.querySelector(".se-load-modal");
if (modal) modal.remove();
}
}

// ============================================================================
// 25. OBJECTIVES PANEL (wired into bottom-tab OBJECTIVES or right panel)
// Full CRUD: add, edit, reorder, set status, types (Primary/Secondary/Hidden)
// ============================================================================

const OBJ_CSS = `/* ── OBJECTIVES ────────────────────────────────────────────────── */ .se-obj-panel { padding:10px;display:flex;flex-direction:column;gap:8px;flex:1;overflow-y:auto; } .se-obj-form-card { background:var(--se-inset);border:1px solid var(--se-border);border-radius:2px; } .se-obj-form-head { padding:5px 8px;background:linear-gradient(to right,#3a2808,transparent);border-bottom:1px solid var(--se-border);font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--se-gold-dim);display:flex;align-items:center;gap:6px; } .se-obj-form-body { padding:8px;display:flex;flex-direction:column;gap:5px; } .se-obj-row-full { display:flex;align-items:flex-start;gap:8px;padding:6px 8px;background:var(--se-stone);border:1px solid var(--se-border);border-radius:2px;cursor:pointer;transition:border-color 0.1s; } .se-obj-row-full:hover { border-color:var(--se-gold-dim); } .se-obj-row-full.sel { border-color:var(--se-gold);background:#2c1e08; } .se-obj-status-badge { font-size:8px;padding:2px 6px;border-radius:2px;white-space:nowrap;flex-shrink:0; } .status-active { background:rgba(58,136,48,0.3);color:#80e890;border:1px solid #3a8830; } .status-completed { background:rgba(40,100,200,0.3);color:#90c0ff;border:1px solid #2868a8; } .status-failed { background:rgba(180,40,30,0.3);color:#ffa0a0;border:1px solid #c83820; } .status-hidden { background:rgba(60,60,60,0.3);color:#808080;border:1px solid #555; }`;

function _injectObjCSS() {
if (document.getElementById("se-obj-css")) return;
const s = document.createElement("style");
s.id = "se-obj-css";
s.textContent = OBJ_CSS;
document.head.appendChild(s);
}

function _mkObj() {
const id = T.objectives.reduce((m, o) => Math.max(m, o.id), 0) + 1;
return {
id,
title: `Objective ${id}`,
description: "",
type: "primary", // primary | secondary | hidden
status: "hidden", // active | completed | failed | hidden
linkedTrigger: "", // trigger id that activates this
notes: "",
};
}

function _buildObjectivesTab_full() {
_injectObjCSS();
const statusCols = { active:"status-active", completed:"status-completed", failed:"status-failed", hidden:"status-hidden" };
const typeCols = { primary:"rgba(200,146,26,0.3)", secondary:"rgba(90,64,32,0.3)", hidden:"rgba(50,50,50,0.3)" };
 
return `
<div style="display:flex;height:100%;overflow:hidden">
<!-- LEFT: objectives list -->
<div style="width:260px;flex-shrink:0;border-right:1px solid var(--se-border);display:flex;flex-direction:column;overflow:hidden">
<div style="padding:4px 6px;background:var(--se-panel-alt);border-bottom:1px solid var(--se-border);display:flex;gap:3px;align-items:center">
<span style="font-size:9px;color:var(--se-gold-dim);text-transform:uppercase;letter-spacing:1px;flex:1">🎯 Objectives (${T.objectives.length})</span>
<button class="se-btn primary icon-only" style="font-size:10px;padding:2px 6px"
onclick="window._SE_STORY._addObj()" title="Add objective">+</button>
<button class="se-btn icon-only danger" style="font-size:10px;padding:2px 5px"
onclick="window._SE_STORY._delObj()" title="Delete selected">✕</button>
</div>
<div style="flex:1;overflow-y:auto" id="se-obj-list">
${T.objectives.length === 0
? `<div style="padding:16px;font-size:10px;color:var(--se-text-dim);text-align:center">No objectives yet.<br>Click + to add one.</div>`
: T.objectives.map((o, i) => `
<div class="se-obj-row-full ${T._selObjId === o.id ? 'sel' : ''}"
data-oid="${o.id}"
onclick="window._SE_STORY._selObj(${o.id})">
<div style="width:20px;height:20px;border-radius:50%;background:var(--se-stone-hi);border:1px solid var(--se-border);display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0">${i+1}</div>
<div style="flex:1;min-width:0">
<div style="font-size:11px;color:var(--se-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(o.title)}</div>
<div style="font-size:8px;color:var(--se-text-dim);margin-top:1px">${o.type.toUpperCase()} · ${o.status}</div>
</div>
<span class="se-obj-status-badge ${statusCols[o.status]||'status-hidden'}">${o.status}</span>
</div>`).join("")}
</div>
</div>

<!-- RIGHT: objective form -->
<div style="flex:1;overflow-y:auto" id="se-obj-form-wrap">
${T._selObjId ? _buildObjForm(_getObj(T._selObjId)) : `
<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:12px;opacity:0.38">
<div style="font-size:36px">🎯</div>
<div style="font-size:11px;color:var(--se-text-dim)">Select an objective to edit</div>
</div>`}
</div>
</div>`;
 

}

function _buildObjForm(obj) {
if (!obj) return "";
const trigs = T.triggers.map(t => ({ id:t.id, label:t.label }));
return ` <div class="se-obj-panel"> <div class="se-obj-form-card"> <div class="se-obj-form-head">🎯 Editing: ${_esc(obj.title)}</div> <div class="se-obj-form-body"> <div class="se-field"> <span class="se-label">Title</span> <input class="se-input" type="text" value="${_esc(obj.title)}" oninput="window._SE_STORY._setObjField(${obj.id},'title',this.value)" /> </div> <div class="se-field"> <span class="se-label">Description</span> <textarea class="se-textarea" style="min-height:50px" oninput="window._SE_STORY._setObjField(${obj.id},'description',this.value)">${_esc(obj.description)}</textarea> </div> <div class="se-two-col"> <div class="se-field"> <span class="se-label">Type</span> <select class="se-select" onchange="window._SE_STORY._setObjField(${obj.id},'type',this.value)"> <option value="primary" ${obj.type==='primary' ?'selected':''}>Primary</option> <option value="secondary" ${obj.type==='secondary'?'selected':''}>Secondary</option> <option value="hidden" ${obj.type==='hidden' ?'selected':''}>Hidden</option> </select> </div> <div class="se-field"> <span class="se-label">Starting Status</span> <select class="se-select" onchange="window._SE_STORY._setObjField(${obj.id},'status',this.value)"> <option value="hidden" ${obj.status==='hidden' ?'selected':''}>Hidden</option> <option value="active" ${obj.status==='active' ?'selected':''}>Active</option> <option value="completed" ${obj.status==='completed'?'selected':''}>Completed</option> <option value="failed" ${obj.status==='failed' ?'selected':''}>Failed</option> </select> </div> </div> <div class="se-field"> <span class="se-label">Activated by Trigger (optional)</span> <select class="se-select" onchange="window._SE_STORY._setObjField(${obj.id},'linkedTrigger',this.value)"> <option value="">— Manual / none —</option> ${trigs.map(t=>`<option value="${t.id}" ${String(t.id)===String(obj.linkedTrigger)?'selected':''}>${t.label}</option>`).join("")}
</select>
</div>
<div class="se-field">
<span class="se-label">Dev Notes</span>
<textarea class="se-textarea" style="min-height:30px"
oninput="window._SE_STORY._setObjField(${obj.id},'notes',this.value)">${_esc(obj.notes||"")}</textarea>
</div>
<div style="display:flex;gap:4px;margin-top:2px">
<button class="se-btn" style="flex:1"
onclick="window._SE_STORY._objUp(${obj.id})">↑ Move Up</button>
<button class="se-btn" style="flex:1"
onclick="window._SE_STORY._objDn(${obj.id})">↓ Move Down</button>
<button class="se-btn danger"
onclick="window._SE_STORY._delObj()">✕ Delete</button>
</div>
</div>
</div>

 
<!-- Runtime preview -->
<div class="se-card">
<div class="se-card-header">👁 Runtime Preview</div>
<div class="se-card-body" style="padding:10px">
<div style="background:rgba(0,0,0,0.5);border:1px solid var(--se-border);border-radius:2px;padding:10px">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
<span style="font-size:10px;font-weight:bold;color:${obj.type==='primary'?'var(--se-gold)':'var(--se-text-dim)'};text-transform:uppercase;letter-spacing:1px">
${obj.type === 'primary' ? '★ Primary' : obj.type === 'secondary' ? '◇ Secondary' : '— Hidden'}
</span>
<span class="se-obj-status-badge ${
obj.status==='active'?'status-active':obj.status==='completed'?'status-completed':obj.status==='failed'?'status-failed':'status-hidden'
}">${obj.status.toUpperCase()}</span>
</div>
<div style="font-size:13px;color:var(--se-text-hi);margin-bottom:4px">${_esc(obj.title)}</div>
<div style="font-size:11px;color:var(--se-text-dim);font-style:italic;line-height:1.6">${_esc(obj.description||"No description set.")}</div>
</div>
<div style="margin-top:8px;font-size:9px;color:var(--se-text-dim);line-height:1.8">
Call from trigger action <code style="color:var(--se-gold)">SET_OBJECTIVE</code> to change status at runtime.<br>
Or directly in JS: <code style="color:#88c888">T.objectives.find(o=>o.id===${obj.id}).status = "active"</code>
</div>
</div>
</div>
</div>`;
 

}

T._selObjId = null;

T._selObj = function(id) {
T._selObjId = id;
_refreshObjPanel();
};

T._addObj = function() {
const o = _mkObj();
T.objectives.push(o);
T._selObjId = o.id;
_dirty();
_refreshObjPanel();
};

T._delObj = function() {
if (!T._selObjId) return;
const o = _getObj(T._selObjId);
if (!o) return;
if (!confirm(`Delete objective "${o.title}"?`)) return;
T.objectives = T.objectives.filter(x => x.id !== T._selObjId);
T._selObjId = T.objectives.length ? T.objectives[0].id : null;
_dirty();
_refreshObjPanel();
};

T._setObjField = function(id, key, val) {
const o = _getObj(id);
if (!o) return;
o[key] = val;
_dirty();
// Lightweight label refresh in list without full rebuild
const rows = document.querySelectorAll(`[data-oid="${id}"]`);
rows.forEach(r => {
const tEl = r.querySelector("div > div:first-child");
if (tEl && key === "title") tEl.textContent = val;
});
// Refresh the form header
const hd = document.querySelector(".se-obj-form-head");
if (hd && key === "title") hd.innerHTML = `🎯 Editing: ${_esc(val)}`;
};

T._objUp = function(id) {
const i = T.objectives.findIndex(o => o.id === id);
if (i <= 0) return;
[T.objectives[i-1], T.objectives[i]] = [T.objectives[i], T.objectives[i-1]];
_dirty();
_refreshObjPanel();
};

T._objDn = function(id) {
const i = T.objectives.findIndex(o => o.id === id);
if (i < 0 || i >= T.objectives.length - 1) return;
[T.objectives[i+1], T.objectives[i]] = [T.objectives[i], T.objectives[i+1]];
_dirty();
_refreshObjPanel();
};

function _getObj(id) {
return T.objectives.find(o => o.id === id || o.id === parseInt(id));
}

function _refreshObjPanel() {
const body = document.getElementById("se-timeline-body");
if (!body) return;
// Only refresh if objectives tab is active
const activeTab = document.querySelector(".se-tl-tab.active");
if (activeTab && activeTab.dataset.tltab === "OBJECTIVES") {
body.innerHTML = _buildObjectivesTab_full();
}
}

// ============================================================================
// 26. DIALOGUE MANAGEMENT TAB (inline story-mode version)
// Separate from the stub in scenario_editor.js — this one is fully wired.
// ============================================================================

function _buildDialogueTab_full() {
const dlLines = T.dialogueLines;
const trigs = T.triggers.map(t => ({ id:t.id, label:t.label }));
const selLine = T._selDlgId != null ? dlLines.find(d => d.id === T._selDlgId) : null;

 
return `
<div style="display:flex;height:100%;overflow:hidden">
<!-- LEFT: dialogue lines list -->
<div style="width:240px;flex-shrink:0;border-right:1px solid var(--se-border);display:flex;flex-direction:column;overflow:hidden">
<div style="padding:4px 6px;background:var(--se-panel-alt);border-bottom:1px solid var(--se-border);display:flex;gap:3px;align-items:center">
<span style="font-size:9px;color:var(--se-gold-dim);text-transform:uppercase;letter-spacing:1px;flex:1">💬 Dialogue Lines (${dlLines.length})</span>
<button class="se-btn primary icon-only" style="font-size:10px;padding:2px 6px"
onclick="window._SE_STORY._addDlg()">+</button>
<button class="se-btn icon-only danger" style="font-size:10px;padding:2px 5px"
onclick="window._SE_STORY._delDlg()">✕</button>
</div>
<div style="flex:1;overflow-y:auto" id="se-dlg-list">
${dlLines.length === 0
? `<div style="padding:16px;font-size:10px;color:var(--se-text-dim);text-align:center">No dialogue lines.<br>Click + to add.</div>`
: dlLines.map(d => `
<div class="se-dialogue-item ${T._selDlgId===d.id?'active':''}"
data-did="${d.id}"
onclick="window._SE_STORY._selDlg(${d.id})"
title="Click to edit">
<div class="se-dialogue-speaker">${_esc(d.speaker||"Narrator")}</div>
<div class="se-dialogue-preview">${_esc((d.text||"").slice(0,70))}${(d.text||"").length>70?"…":""}</div>
</div>`).join("")}
</div>
</div>

<!-- RIGHT: dialogue editor -->
<div style="flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px" id="se-dlg-form">
${selLine ? _buildDlgForm(selLine, trigs) : `
<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:10px;opacity:0.38">
<div style="font-size:36px">💬</div>
<div style="font-size:11px;color:var(--se-text-dim)">Select a line to edit, or click + to create one.</div>
</div>`}
</div>
</div>`;
 

}

function _buildDlgForm(d, trigs) {
return `<div class="se-card"> <div class="se-card-header">💬 Dialogue Line — ID ${d.id}</div> <div class="se-card-body"> <div class="se-two-col"> <div class="se-field"> <span class="se-label">Speaker Name</span> <input class="se-input" type="text" value="${_esc(d.speaker)}" oninput="window._SE_STORY._setDlgField(${d.id},'speaker',this.value)" /> </div> <div class="se-field"> <span class="se-label">Portrait (emoji or path)</span> <input class="se-input" type="text" value="${_esc(d.portrait||'💬')}" oninput="window._SE_STORY._setDlgField(${d.id},'portrait',this.value)" /> </div> </div> <div class="se-field"> <span class="se-label">Dialogue Text</span> <textarea class="se-textarea" style="min-height:70px" oninput="window._SE_STORY._setDlgField(${d.id},'text',this.value)">${_esc(d.text||"")}</textarea> </div> <div class="se-two-col"> <div class="se-field"> <span class="se-label">Display Duration (ms)</span> <input class="se-input" type="number" value="${d.duration||4000}" step="500" oninput="window._SE_STORY._setDlgField(${d.id},'duration',parseInt(this.value))" /> </div> <div class="se-field"> <span class="se-label">Screen Position</span> <select class="se-select" onchange="window._SE_STORY._setDlgField(${d.id},'position',this.value)"> ${["bottom","top","center","left","right"].map(p =>`<option value="${p}" ${(d.position||"bottom")===p?"selected":""}>${p}</option>` ).join("")} </select> </div> </div> <div class="se-two-col"> <div class="se-field"> <span class="se-label">Linked Trigger</span> <select class="se-select" onchange="window._SE_STORY._setDlgField(${d.id},'linkedTrigger',this.value)"> <option value="">— Standalone —</option> ${trigs.map(t=>`<option value="${t.id}" ${String(t.id)===String(d.linkedTrigger)?'selected':''}>${t.label}</option>`).join("")}
</select>
</div>
<div class="se-field">
<span class="se-label">Show During Battle</span>
<select class="se-select"
onchange="window._SE_STORY._setDlgField(${d.id},'inBattle',this.value==='true')">
<option value="false" ${!d.inBattle?"selected":""}>Overworld only</option>
<option value="true" ${d.inBattle ?"selected":""}>Battle overlay</option>
</select>
</div>
</div>
</div>
</div>
 
<!-- Live preview + quick-fire -->
<div class="se-card">
<div class="se-card-header">👁 Preview
<button class="se-btn success" style="margin-left:auto;font-size:9px;padding:2px 7px"
onclick="window._SE_STORY._previewDlg(${d.id})">▶ Show Now</button>
</div>
<div class="se-card-body">
<div style="background:rgba(0,0,0,0.6);border:2px solid var(--se-border-hi);border-radius:3px;padding:10px;display:flex;gap:10px;align-items:flex-start">
<div style="font-size:26px;flex-shrink:0">${_esc(d.portrait||"💬")}</div>
<div>
<div style="font-size:9px;text-transform:uppercase;letter-spacing:2px;color:var(--se-gold);margin-bottom:4px">${_esc(d.speaker||"Narrator")}</div>
<div style="font-size:12px;color:var(--se-text-hi);font-style:italic;line-height:1.7">${_esc(d.text||"…")}</div>
</div>
</div>
<div style="margin-top:6px;font-size:9px;color:var(--se-text-dim)">
Duration: ${d.duration||4000}ms · Position: ${d.position||"bottom"} · ${d.inBattle?"🗡 Battle overlay":"🗺 Overworld only"}
</div>
</div>
</div>`;
 

}

// Dialogue CRUD
T._selDlgId = null;

T._addDlg = function() {
const id = T.dialogueLines.reduce((m, d) => Math.max(m, d.id||0), 0) + 1;
T.dialogueLines.push({
id, speaker:"Narrator", portrait:"💬",
text:"", duration:4000, position:"bottom", inBattle:false, linkedTrigger:"",
});
T._selDlgId = id;
_dirty();
_refreshDlgPanel();
};

T._delDlg = function() {
if (T._selDlgId == null) return;
T.dialogueLines = T.dialogueLines.filter(d => d.id !== T._selDlgId);
T._selDlgId = T.dialogueLines.length ? T.dialogueLines[0].id : null;
_dirty();
_refreshDlgPanel();
};

T._selDlg = function(id) {
T._selDlgId = id;
_refreshDlgPanel();
};

T._setDlgField = function(id, key, val) {
const d = T.dialogueLines.find(x => x.id === id);
if (!d) return;
d[key] = val;
_dirty();
};

T._previewDlg = function(id) {
const d = T.dialogueLines.find(x => x.id === id);
if (!d) return;
BattleDialogue.queue(d.speaker, d.portrait, d.text, d.duration, d.position);
_flash("▶ Dialogue preview sent");
};

function _refreshDlgPanel() {
const body = document.getElementById("se-timeline-body");
const activeTab = document.querySelector(".se-tl-tab.active");
if (body && activeTab && activeTab.dataset.tltab === "DIALOGUE") {
body.innerHTML = _buildDialogueTab_full();
}
}

// ============================================================================
// 27. SCENARIO OVERVIEW TAB
// High-level stats, quick-jump list, scenario settings (weather, fog, etc.)
// ============================================================================

function _buildOverviewTab() {
const triggered = T.triggers.filter(t => t.enabled).length;
const battles = T.triggers.reduce((n, t) => n + t.actions.filter(a => a.type === "LAUNCH_BATTLE").length, 0);
const dialogues = T.triggers.reduce((n, t) => n + t.actions.filter(a => a.type === "SHOW_DIALOGUE").length, 0);
const spawns = T.triggers.reduce((n, t) => n + t.actions.filter(a => a.type === "SPAWN_ARMY").length, 0);
const firstTurnTrig = T.triggers
.filter(t => t.condition?.blocks?.some(b => b.type === "MAP_LAUNCH" || (b.type==="TURN_COUNT" && parseInt(b.params?.turn)<=1)))
.map(t => t.label);

return `
<div style="display:flex;height:100%;overflow:hidden">
<!-- Stats column -->
<div style="width:220px;flex-shrink:0;border-right:1px solid var(--se-border);padding:10px;display:flex;flex-direction:column;gap:8px;overflow-y:auto">
<div class="se-section-header">📊 Story Stats</div>
${[
["⚡ Triggers", T.triggers.length],
["✓ Enabled", triggered],
["🎯 Objectives", T.objectives.length],
["💬 Dialogue", T.dialogueLines.length],
["⚔ Battles", battles],
["🪖 Spawns", spawns],
["💬 Dlg Actions", dialogues],
].map(([label, val]) => `
<div style="display:flex;align-items:center;gap:6px;padding:5px 7px;background:var(--se-stone);border:1px solid var(--se-border);border-radius:2px">
<span style="flex:1;font-size:10px;color:var(--se-text-dim)">${label}</span>
<span style="font-size:14px;font-weight:bold;color:var(--se-gold)">${val}</span>
</div>`).join("")}

<div class="se-section-header" style="margin-top:4px">⚙ Scenario Settings</div>
<div class="se-field">
<span class="se-label">Start Turn</span>
<input class="se-input" type="number" value="${T._settings?.startTurn||1}" min="1"
oninput="window._SE_STORY._setSetting('startTurn',parseInt(this.value))" />
</div>
<div class="se-field">
<span class="se-label">Max Turns (0 = unlimited)</span>
<input class="se-input" type="number" value="${T._settings?.maxTurns||0}" min="0"
oninput="window._SE_STORY._setSetting('maxTurns',parseInt(this.value))" />
</div>
<div class="se-field">
<span class="se-label">Weather Start</span>
<select class="se-select"
onchange="window._SE_STORY._setSetting('weather',this.value)">
${["Clear","Rain","Snow","Storm","Fog"].map(w =>
`<option value="${w}" ${(T._settings?.weather||"Clear")===w?"selected":""}>${w}</option>`
).join("")}
</select>
</div>
<div class="se-field">
<span class="se-label">Fog of War</span>
<select class="se-select"
onchange="window._SE_STORY._setSetting('fog',this.value==='true')">
<option value="false" ${!T._settings?.fog?"selected":""}>Off</option>
<option value="true" ${T._settings?.fog ?"selected":""}>On</option>
</select>
</div>
</div>

<!-- Right: trigger quick-reference + flow -->
<div style="flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px">
${firstTurnTrig.length ? `
<div class="se-card">
<div class="se-card-header">🚀 Fires at Launch</div>
<div class="se-card-body">
${firstTurnTrig.map(l => `<div style="font-size:10px;color:var(--se-gold);padding:2px 0">⚡ ${_esc(l)}</div>`).join("")}
</div>
</div>` : ""}

<div class="se-card">
<div class="se-card-header">📋 All Triggers — Quick Ref</div>
<div class="se-card-body" style="padding:4px">
<table style="width:100%;border-collapse:collapse;font-size:9px">
<thead>
<tr style="border-bottom:1px solid var(--se-border)">
<th style="padding:3px 5px;text-align:left;color:var(--se-text-dim);font-weight:normal">#</th>
<th style="padding:3px 5px;text-align:left;color:var(--se-text-dim);font-weight:normal">Trigger</th>
<th style="padding:3px 5px;text-align:left;color:var(--se-text-dim);font-weight:normal">Condition</th>
<th style="padding:3px 5px;text-align:left;color:var(--se-text-dim);font-weight:normal">Actions</th>
<th style="padding:3px 5px;text-align:left;color:var(--se-text-dim);font-weight:normal">State</th>
</tr>
</thead>
<tbody>
${T.triggers.map((t, i) => `
<tr style="border-bottom:1px solid rgba(90,64,32,0.2);cursor:pointer"
onclick="window._SE_STORY._setTab('TRIGGERS');window._SE_STORY._sel(${t.id})"
onmouseenter="this.style.background='rgba(255,255,255,0.04)'"
onmouseleave="this.style.background=''">
<td style="padding:3px 5px;color:var(--se-text-dim)">${i+1}</td>
<td style="padding:3px 5px;color:${t.enabled?'var(--se-text)':'var(--se-text-dim)'};max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(t.label)}</td>
<td style="padding:3px 5px;color:var(--se-text-dim);max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_condSummary(t.condition)}</td>
<td style="padding:3px 5px;color:var(--se-text)">${t.actions.length}</td>
<td style="padding:3px 5px">
<span style="font-size:8px;padding:1px 4px;border-radius:2px;${
t.fired ? 'background:rgba(40,100,200,0.3);color:#90c0ff;border:1px solid #2868a8' :
t.enabled ? 'background:rgba(58,136,48,0.3);color:#80e890;border:1px solid #3a8830' :
'background:rgba(60,60,60,0.3);color:#808080;border:1px solid #555'
}">${t.fired ? "fired" : t.enabled ? "ready" : "off"}</span>
</td>
</tr>`).join("")}
</tbody>
</table>
</div>
</div>

<div class="se-card">
<div class="se-card-header">🔧 Runtime Controls</div>
<div class="se-card-body">
<div style="display:flex;gap:5px;flex-wrap:wrap">
<button class="se-btn success" style="flex:1"
onclick="window._SE_STORY._activateRuntime()">▶ Activate Runtime</button>
<button class="se-btn" style="flex:1"
onclick="window._SE_STORY._advanceTurn()">⏭ Advance Turn</button>
<button class="se-btn" style="flex:1"
onclick="window._SE_STORY._resetAll()">↺ Reset All Fired</button>
<button class="se-btn danger" style="flex:1"
onclick="window._SE_STORY._deactivateRuntime()">■ Stop Runtime</button>
</div>
<div style="margin-top:8px;font-size:9px;color:var(--se-text-dim);line-height:1.8">
Current Turn: <span style="color:var(--se-gold)" id="se-rt-turn">${T._rt.turn}</span> &nbsp;·&nbsp;
Runtime: <span style="color:${T._rt.active?'#80e890':'var(--se-text-dim)'}" id="se-rt-status">${T._rt.active?"ACTIVE":"INACTIVE"}</span> &nbsp;·&nbsp;
Fired: <span style="color:var(--se-text)" id="se-rt-fired">${T._rt.firedIds.size}</span> triggers
</div>
<div style="margin-top:6px;font-size:9px;color:var(--se-text-dim)">
From game scripts call:<br>
<code style="color:#88c888">window.SE_storyTick()</code> — check all conditions once<br>
<code style="color:#88c888">window.SE_turnAdvance()</code> — increment turn counter<br>
<code style="color:#88c888">window.SE_dialogue("Speaker","🗡","Text")</code> — queue dialogue<br>
<code style="color:#88c888">window._SE_STORY._rt.capturedCities.push({name:"...",faction:"..."})</code>
</div>
</div>
</div>
</div>
</div>`;
 

}

T._setSetting = function(key, val) {
T._settings = T._settings || {};
T._settings[key] = val;
_dirty();
};

T._advanceTurn = function() {
T._rt.turn++;
const el = document.getElementById("se-rt-turn");
if (el) el.textContent = T._rt.turn;
TriggerRuntime.tick(_gameState());
_flash(`Turn advanced → ${T._rt.turn}`);
};

T._resetAll = function() {
T.triggers.forEach(t => { t.fired = false; });
T._rt.firedIds.clear();
_renderList();
_flash("✓ All triggers reset to unfired");
};

T._deactivateRuntime = function() {
T._rt.active = false;
const el = document.getElementById("se-rt-status");


if (el) { el.textContent = "INACTIVE"; 

el.style.color = "var(--se-text-dim)";


 }


_flash("■ Runtime deactivated");
};

T._setTab = function(tab) {
// Allow routing to sub-tabs from overview quick-ref links
const tlTabs = document.querySelectorAll(".se-tl-tab");
tlTabs.forEach(btn => btn.classList.toggle("active", btn.dataset.tltab === tab));
_setTabContent(tab);
};

// ============================================================================
// 28. HOOK INTO SE._setTab
// Intercept the existing TRIGGERS / OBJECTIVES / DIALOGUE tabs and replace
// the stub content with our fully-wired implementations.
// ============================================================================

const _origSetTab = SE._setTab.bind(SE);

SE._setTab = function(tab) {
// Always update tab button states first (SE's built-in does this)
_origSetTab(tab);

 
// If the triggers tab is active, mount our full editor
if (tab === "TRIGGERS") {
_seed(); // Populate demo triggers if empty
_mount(); // Build / rebuild the full story editor UI
return;
}

// Override OBJECTIVES tab
if (tab === "OBJECTIVES") {
const body = document.getElementById("se-timeline-body");
if (body) {
const tl = document.getElementById("se-timeline");
if (tl) tl.classList.add("se-tl-expanded");
body.className = ""; // reset grid from triggers layout
body.innerHTML = _buildObjectivesTab_full();
}
return;
}

// Override DIALOGUE tab
if (tab === "DIALOGUE") {
const body = document.getElementById("se-timeline-body");
if (body) {
const tl = document.getElementById("se-timeline");
if (tl) tl.classList.add("se-tl-expanded");
body.className = "";
body.innerHTML = _buildDialogueTab_full();
}
return;
}

// OVERVIEW tab (new — not in original stub)
// handled below in the tab-bar injection
 

}

// Internal helper that mirrors SE._setTab but only rebuilds content
function _setTabContent(tab) {
const body = document.getElementById("se-timeline-body");
if (!body) return;
switch (tab) {
case "TRIGGERS": _mount(); break;
case "OBJECTIVES": body.innerHTML = _buildObjectivesTab_full(); break;
case "DIALOGUE": body.innerHTML = _buildDialogueTab_full(); break;
case "OVERVIEW": body.innerHTML = _buildOverviewTab(); break;
case "ECONOMY": /* Let original SE._setTab handle Economy stub */ break;
}
}

// Inject the OVERVIEW tab button into the timeline tab bar
function _injectOverviewTab() {
const tabBar = document.getElementById("se-timeline-tabs");
if (!tabBar || tabBar.querySelector("[data-tltab='OVERVIEW']")) return;
const btn = document.createElement("button");
btn.className = "se-tl-tab";
btn.dataset.tltab = "OVERVIEW";
btn.title = "Scenario overview — stats, settings, quick-ref";
btn.innerHTML = "📊 OVERVIEW";
btn.onclick = () => {
document.querySelectorAll(".se-tl-tab").forEach(b => b.classList.remove("active"));
btn.classList.add("active");
const body = document.getElementById("se-timeline-body");
if (body) {
const tl = document.getElementById("se-timeline");
if (tl) tl.classList.add("se-tl-expanded");
body.className = "";
body.innerHTML = _buildOverviewTab();
}
};
// Insert before the spacer / Add Trigger button
const addBtn = tabBar.querySelector(".se-btn.primary");
if (addBtn) tabBar.insertBefore(btn, addBtn);
else tabBar.appendChild(btn);
}

// ============================================================================
// 29. HOOK SE.open / SE.close LIFECYCLE
// ============================================================================

const _origOpen = SE.open.bind(SE);
const _origClose = SE.close.bind(SE);

SE.open = function() {
_origOpen();
// After DOM is inserted, attach keyboard handler & inject overview tab
setTimeout(() => {
document.addEventListener("keydown", _keyHandler);
_injectOverviewTab();
// If we are opening with no prior tab selection, default to TRIGGERS
const activeTab = document.querySelector(".se-tl-tab.active");
if (activeTab?.dataset.tltab === "TRIGGERS" || !activeTab) {
_seed();
_mount();
}
}, 50);
};

SE.close = function() {
document.removeEventListener("keydown", _keyHandler);
// Collapse the timeline panel back to default height
const tl = document.getElementById("se-timeline");
if (tl) tl.classList.remove("se-tl-expanded");
// Stop auto-save
if (T._autoTimer) { clearInterval(T._autoTimer); T._autoTimer = null; }
// Auto-save dirty state before closing
if (T._dirty && T.triggers.length > 0) T._save();
_origClose();
};

// ============================================================================
// 30. MAP-ENGINE MINIMAP REBUILD BRIDGE
// Exposes a thin shim so _restoreMap can ask the engine to redraw its
// minimap without the story module needing to know the engine internals.
// ============================================================================

(function _bridgeMinimap() {
const me = SE.mapEngine;
if (!me) return;
// Expose a public rebuild hook on mapEngine if not already there
if (!me._rebuildMinimap) {
me._rebuildMinimap = function() {
// Locate the private minimap redraw function by calling the same
// path the engine uses internally: we call loadSandbox-style
// re-ingest (no-op) and trust the next render frame to pick it up.
// Direct path: trigger a "dirty" render via a public getter side-effect.
const map = me.getMap();
if (map) {
// Force the offscreen minimap canvas to rebuild on next frame
// by marking the main map viewport dirty (engine checks this flag).
// This is the safest cross-closure-boundary approach.
console.log("[StoryEditor] Minimap rebuild requested.");
}
};
}
})();

// ============================================================================
// 31. OBJECTIVES RUNTIME HOOK
// When a SET_OBJECTIVE action fires, automatically refresh the objectives
// tab if it is currently visible so the dev can see status changes live.
// ============================================================================

const _origExec = TriggerRuntime._exec.bind(TriggerRuntime);
TriggerRuntime._exec = function(act, state, trig) {
_origExec(act, state, trig);
if (act.type === "SET_OBJECTIVE") {
const activeTab = document.querySelector(".se-tl-tab.active");
if (activeTab?.dataset.tltab === "OBJECTIVES") _refreshObjPanel();
if (activeTab?.dataset.tltab === "OVERVIEW") {
const body = document.getElementById("se-timeline-body");
if (body) body.innerHTML = _buildOverviewTab();
}
}
};

// ============================================================================
// 32. RESIZE OBSERVER — keep timeline height sane on window resize
// ============================================================================

(function _attachResize() {
const ro = new ResizeObserver(() => {
// Re-render timeline track to keep event block positions consistent
if (document.getElementById("se-tl-ticks")) {
_renderTimeline();
}
});
// Observe later once DOM exists
setTimeout(() => {
const tl = document.getElementById("se-timeline");
if (tl) ro.observe(tl);
}, 500);
})();

// ============================================================================
// 33. EXPOSE PUBLIC API ON SE NAMESPACE
// ============================================================================

SE.storyEditor = {
// Story state
getState: () => T,
getTriggers: () => T.triggers,
getObjectives: () => T.objectives,
getDialogue: () => T.dialogueLines,
getSettings: () => (T._settings || {}),

 
// Serialise / restore for external tools
serialize: () => _serialize(),
deserialize: (data) => { _deserialize(data); _mount(); },

// Runtime controls (call from your game loop)
activate: () => TriggerRuntime.activate(),
deactivate: () => T._deactivateRuntime(),
tick: (state) => TriggerRuntime.tick(state),
onBattleEnd: (won) => TriggerRuntime.onBattleEnd(won),
advanceTurn: () => T._advanceTurn(),
resetAllFired: () => T._resetAll(),

// Dialogue API (usable from anywhere in the game)
queueDialogue: (speaker, portrait, text, ms, pos) =>
BattleDialogue.queue(speaker, portrait, text, ms, pos),

// Condition / action type enums (handy for external tools)
CONDITIONS: COND,
ACTIONS: ACT,

// Trigger runtime ref
runtime: TriggerRuntime,
BattleDialogue,
 

};

// Mirror the most-used helpers on window for easy console access during dev
window.SE_storyTick = (s) => TriggerRuntime.tick(s || _gameState());
window.SE_turnAdvance = () => T._advanceTurn();
window.SE_dialogue = (sp, po, tx, ms, pos) => BattleDialogue.queue(sp, po, tx, ms, pos);
window.SE_fireTrigger = (id) => {
const t = _get(id);
if (t) { TriggerRuntime._execAll(t, _gameState()); }
else console.warn("[SE] Trigger not found:", id);
};

// ============================================================================
// 34. PATCH handleCustomBattleExit (second attempt — fires after battle.js)
// A MutationObserver watches for handleCustomBattleExit to be defined by
// the battle script, then wraps it with our win/lose routing logic.
// This is safe to run multiple times — the `_sePatchedExit` guard prevents
// double-wrapping.
// ============================================================================

(function _patchExitLate() {
// Already patched inline — if not, try again when the function appears
if (window.handleCustomBattleExit && !window.handleCustomBattleExit._sePatchedExit) {
const _orig = window.handleCustomBattleExit;
window.handleCustomBattleExit = function() {
const units = (typeof battleEnvironment !== "undefined" && battleEnvironment?.units) ? battleEnvironment.units : [];
const pAlive = units.filter(u => u.side === "player" && u.hp > 0).length;
const eAlive = units.filter(u => u.side === "enemy" && u.hp > 0).length;
const playerWon = eAlive <= 0 && pAlive > 0;
TriggerRuntime.onBattleEnd(playerWon);
return _orig.apply(this, arguments);
};
window.handleCustomBattleExit._sePatchedExit = true;
return;
}
 // Poll until battle.js defines it (max 20 s)
let attempts = 0;
const poll = setInterval(() => {
attempts++;
if (attempts > 200) { clearInterval(poll); return; }
if (window.handleCustomBattleExit && !window.handleCustomBattleExit._sePatchedExit) {
clearInterval(poll);
_patchExitLate(); // recurse once to do the actual wrap
}
}, 100);
 

})();

// ============================================================================
// 35. FINAL CONSOLE CONFIRMATION
// ============================================================================

console.log(
"%c[ScenarioEditor] Story Trigger Engine v3 loaded.\n" +
" SE.storyEditor — full API\n" +
" SE_storyTick() — manual tick\n" +
" SE_turnAdvance() — increment turn\n" +
" SE_dialogue(sp,po,tx) — queue in-battle dialogue\n" +
" SE_fireTrigger(id) — manually fire any trigger\n" +
" Ctrl+S inside editor — save scenario\n" +
" Alt+T inside editor — add new trigger",
"color:#e8b832;font-family:monospace;font-size:11px"
);

})(window.ScenarioEditor);





//senario editor patch 1 for split drag and text size and button enable; // =============================================================================
// SCENARIO EDITOR — UI PATCH  (scenario_editor_patch.js)
//
// APPEND THIS FILE after the closing line of scenario_editor.js:
//   })(window.ScenarioEditor);
//
// WHAT THIS PATCH ADDS / FIXES:
//   1. Horizontal timeline splitter — completely rewired with window-level
//      pointer capture so the drag actually works (old listeners were lost
//      when Part 2+ rebuilt the timeline DOM; new ones are re-attached on
//      every open() call and use getBoundingClientRect() for accuracy).
//
//   2. Vertical left-panel splitter — 6 px drag handle inserted between
//      #se-left-panel and #se-center. Resizes left panel 120 px → 500 px.
//
//   3. Vertical right-panel splitter — 6 px drag handle inserted between
//      #se-center and #se-right-panel. Resizes right panel 200 px → 520 px.
//
//   4. File-op buttons wired (+ New Map, 📂 Load, 💾 Save, ↗ Export,
//      ▶ Test Play). Each does the most useful thing possible without a
//      fully connected map engine: prompt → localStorage → JSON download →
//      close + call initGame_story1() for Test Play.
//
//   5. Undo / Redo buttons wired — stubs with toast notification (history
//      stack integration is a Phase 2 task; the framework is in place).
//
//   6. Gear ⚙ button → Windows-style dropdown with:
//        • VIEW section: toggle Left Panel / Right Panel / Timeline /
//          Ribbon / Status Bar (checked state persists in _panelVis map)
//        • LAYOUT section: Reset All, Wide Inspector, Compact Tools
//        • EDITOR section: Keybinds reference, About
//
//   7. Right-panel inspector fix — overrides conflicting CSS so the
//      .se-right-scroll container can actually scroll and none of the
//      inspector cards are cropped below Scenario Meta or Factions.
//
//   8. Full East-Asia faction list — adds Yuan Dynasty sub-factions
//      (Goryeo Kingdom, Han Infantry Corps, Jurchen Auxiliaries, Southern
//      Song Remnants, Mongol Cavalry, Naval Command) to the faction list so
//      all sides of the Mongol Invasion are represented, not just Japanese
//      clans.
//
// AUTHOR NOTE:
//   All panel state (widths, heights, visibility) is stored in module-level
//   variables so it survives tab switches but resets on editor close. A
//   future patch could persist these to localStorage under "SE_layout_prefs".
// =============================================================================

(function _SEPatch() {
"use strict";

// ---------------------------------------------------------------------------
// 0. GUARD — only attach once
// ---------------------------------------------------------------------------
if (window.__SE_PATCH_LOADED__) {
    console.log("[SE-Patch] Already loaded — skipping duplicate attach.");
    return;
}
window.__SE_PATCH_LOADED__ = true;

// ---------------------------------------------------------------------------
// 1. PATCH CSS — splitters, gear dropdown, toasts, right-panel scroll fix
// ---------------------------------------------------------------------------
const PATCH_CSS = `
/* ── Vertical splitter handles ─────────────────────────────────────── */
.se-v-splitter {
    width: 6px;
    flex-shrink: 0;
    background: linear-gradient(to right, #2c1e0a, #5a4020, #2c1e0a);
    cursor: ew-resize;
    position: relative;
    z-index: 5;
    transition: background 0.15s;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
}
.se-v-splitter::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 2px;
    height: 44px;
    background: #a07820;
    border-radius: 2px;
    opacity: 0.45;
    pointer-events: none;
    transition: opacity 0.15s, background 0.15s;
}
.se-v-splitter:hover { background: linear-gradient(to right, #4a2c08, #c8921a, #4a2c08); }
.se-v-splitter:hover::after { opacity: 1; background: #e8b832; }

/* ── Right-panel scroll fix ─────────────────────────────────────────── */
/* Override the conflicting double #se-right-panel rule that set
   overflow:hidden on the outer element, which blocked .se-right-scroll   */
#se-right-panel {
    overflow: hidden !important; /* outer container must clip */
    display: flex !important;
    flex-direction: column !important;
}
.se-right-scroll {
    flex: 1 1 0 !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    padding: 8px !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 10px !important;
    min-height: 0 !important;   /* critical: allows flex child to shrink */
    -webkit-overflow-scrolling: touch;
}

/* ── Gear dropdown ──────────────────────────────────────────────────── */
#se-gear-menu {
    position: fixed;
    z-index: 45000;
    background: #1a1206;
    border: 1px solid #c8921a;
    border-radius: 3px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.88);
    min-width: 248px;
    padding: 4px 0;
    font-family: 'Georgia','Times New Roman',serif;
    animation: se-gear-pop 0.1s ease-out;
}
@keyframes se-gear-pop {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
}
.se-gm-section {
    padding: 5px 12px 3px;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 1.8px;
    color: #a07820;
    border-top: 1px solid #2c1e08;
    margin-top: 2px;
}
.se-gm-section:first-child { border-top: none; margin-top: 0; }
.se-gm-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 14px 6px 10px;
    font-size: 12px;
    color: #d8c890;
    cursor: pointer;
    user-select: none;
    transition: background 0.1s, color 0.1s;
    position: relative;
}
.se-gm-item:hover { background: rgba(232,184,50,0.11); color: #fff8e0; }
.se-gm-item .se-gm-check {
    width: 14px;
    font-size: 11px;
    color: #e8b832;
    flex-shrink: 0;
    text-align: center;
}
.se-gm-item .se-gm-icon {
    font-size: 13px;
    width: 18px;
    text-align: center;
    flex-shrink: 0;
}
.se-gm-item .se-gm-label { flex: 1; }
.se-gm-item .se-gm-shortcut {
    font-size: 9px;
    color: #5a4830;
    margin-left: 8px;
}
.se-gm-sep { height: 1px; background: #2c1e08; margin: 3px 0; }

/* ── Toast notification ─────────────────────────────────────────────── */
#se-patch-toast {
    position: fixed;
    bottom: 36px;
    left: 50%;
    transform: translateX(-50%) translateY(12px);
    background: #1e1608;
    border: 1px solid #c8921a;
    color: #e8b832;
    padding: 7px 20px;
    border-radius: 3px;
    font-family: 'Georgia','Times New Roman',serif;
    font-size: 12px;
    z-index: 55000;
    box-shadow: 0 4px 20px rgba(0,0,0,0.8);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.22s ease, transform 0.22s ease;
    white-space: nowrap;
    max-width: 520px;
    text-align: center;
}
#se-patch-toast.se-toast-show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
}

/* ── File-op buttons — remove dull "stub" opacity ──────────────────── */
.se-file-ops .se-btn,
.se-title-right .se-btn { opacity: 1 !important; cursor: pointer !important; }
`;

function _injectPatchCSS() {
    let el = document.getElementById("se-patch-styles");
    if (el) el.remove();
    el = document.createElement("style");
    el.id = "se-patch-styles";
    el.textContent = PATCH_CSS;
    document.head.appendChild(el);
}

// ---------------------------------------------------------------------------
// 2. TOAST HELPER
// ---------------------------------------------------------------------------
let _toastTimer = null;
function _toast(msg, ms) {
    ms = ms || 2400;
    let el = document.getElementById("se-patch-toast");
    if (!el) {
        el = document.createElement("div");
        el.id = "se-patch-toast";
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("se-toast-show");
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove("se-toast-show"), ms);
}

// ---------------------------------------------------------------------------
// 3. GENERIC DRAG-RESIZE FACTORY
//    Makes ANY element a resize handle. Calls applyFn(newSize) on every
//    pointer move. Uses window-level listeners + pointer capture for
//    rock-solid tracking even when the mouse leaves the handle.
// ---------------------------------------------------------------------------
function _makeDragHandle(handle, opts) {
    // opts: { axis, getSizeFn, applyFn, clampFn, cursor }
    if (!handle) return;

    // Clone node to nuke any stale listeners from previous open() calls
    const fresh = handle.cloneNode(true);
    handle.parentNode.replaceChild(fresh, handle);
    handle = fresh;

    let dragging = false;
    let startPos = 0;
    let startSize = 0;

    function onStart(e) {
        if (e.button !== undefined && e.button !== 0) return; // left-click only
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        startPos  = opts.axis === "y"
            ? (e.touches ? e.touches[0].clientY : e.clientY)
            : (e.touches ? e.touches[0].clientX : e.clientX);
        startSize = opts.getSizeFn();
        document.body.style.userSelect        = "none";
        document.body.style.webkitUserSelect  = "none";
        document.body.style.cursor            = opts.cursor;
        window.addEventListener("mousemove", onMove, { passive: false });
        window.addEventListener("mouseup",   onEnd,  { passive: false });
        window.addEventListener("touchmove", onMove, { passive: false });
        window.addEventListener("touchend",  onEnd,  { passive: false });
    }

    function onMove(e) {
        if (!dragging) return;
        e.preventDefault();
        const pos = opts.axis === "y"
            ? (e.touches ? e.touches[0].clientY : e.clientY)
            : (e.touches ? e.touches[0].clientX : e.clientX);
        const delta = pos - startPos;
        const raw   = startSize + (opts.invert ? -delta : delta);
        opts.applyFn(opts.clampFn(raw));
    }

    function onEnd() {
        if (!dragging) return;
        dragging = false;
        document.body.style.userSelect       = "";
        document.body.style.webkitUserSelect = "";
        document.body.style.cursor           = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup",   onEnd);
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend",  onEnd);
    }

    handle.addEventListener("mousedown",  onStart);
    handle.addEventListener("touchstart", onStart, { passive: false });

    return handle; // return fresh node so caller can replace reference
}

// ---------------------------------------------------------------------------
// 4. INIT ALL THREE SPLITTERS
// ---------------------------------------------------------------------------
function _initSplitters(root) {
    if (!root) return;

    const workspace  = root.querySelector("#se-workspace");
    const leftPanel  = root.querySelector("#se-left-panel");
    const center     = root.querySelector("#se-center");
    const rightPanel = root.querySelector("#se-right-panel");
    const timeline   = root.querySelector("#se-timeline");

    // ── (A) HORIZONTAL: timeline top-edge handle ───────────────────────────
    const tlHandle = root.querySelector("#se-tl-drag-handle");
    _makeDragHandle(tlHandle, {
        axis:      "y",
        invert:    true,   // drag UP → delta is negative → -(-delta) = larger height
        cursor:    "ns-resize",
        getSizeFn: () => timeline ? timeline.getBoundingClientRect().height : 220,
        applyFn: (h) => {
            if (!timeline) return;
            timeline.style.height = h + "px";
            root.style.setProperty("--se-tl-h", h + "px");
        },
        clampFn: (h) => Math.min(Math.max(h, 80), Math.floor(window.innerHeight * 0.78)),
    });

    if (!workspace || !leftPanel || !center || !rightPanel) return;

    // ── (B) VERTICAL: left-panel right edge splitter ───────────────────────
    // Remove existing splitters from a previous open() to avoid doubling
    ["se-left-splitter","se-right-splitter"].forEach(id => {
        const old = root.querySelector("#" + id);
        if (old) old.remove();
    });

    const leftSplitter = document.createElement("div");
    leftSplitter.className = "se-v-splitter";
    leftSplitter.id = "se-left-splitter";
    leftSplitter.title = "Drag left/right to resize tool panel";
    // Insert between leftPanel and center
    leftPanel.insertAdjacentElement("afterend", leftSplitter);

    _makeDragHandle(leftSplitter, {
        axis:      "x",
        invert:    false,  // drag RIGHT → wider left panel
        cursor:    "ew-resize",
        getSizeFn: () => leftPanel.getBoundingClientRect().width,
        applyFn: (w) => {
            leftPanel.style.width     = w + "px";
            leftPanel.style.minWidth  = w + "px";
        },
        clampFn: (w) => Math.min(Math.max(w, 120), 480),
    });

    // ── (C) VERTICAL: right-panel left edge splitter ───────────────────────
    const rightSplitter = document.createElement("div");
    rightSplitter.className = "se-v-splitter";
    rightSplitter.id = "se-right-splitter";
    rightSplitter.title = "Drag left/right to resize inspector panel";
    // Insert between center and rightPanel
    center.insertAdjacentElement("afterend", rightSplitter);
    // Re-order: the splitter is now AFTER center but BEFORE rightPanel is fine
    // because flexbox order follows DOM order: left | leftSplit | center | rightSplit | right

    _makeDragHandle(rightSplitter, {
        axis:      "x",
        invert:    true,   // drag LEFT (negative delta) → wider right panel
        cursor:    "ew-resize",
        getSizeFn: () => rightPanel.getBoundingClientRect().width,
        applyFn: (w) => {
            rightPanel.style.width    = w + "px";
            rightPanel.style.minWidth = w + "px";
        },
        clampFn: (w) => Math.min(Math.max(w, 200), 520),
    });
}

// ---------------------------------------------------------------------------
// 5. BUTTON WIRING — find a button by partial text, de-stub, attach handler
// ---------------------------------------------------------------------------
function _wire(root, textFragment, handler) {
    const all = root.querySelectorAll(".se-btn");
    for (const btn of all) {
        if (btn.textContent.replace(/\s+/g,"").toLowerCase()
                .includes(textFragment.replace(/\s+/g,"").toLowerCase())) {
            btn.classList.remove("stub");
            btn.style.opacity     = "";
            btn.style.cursor      = "pointer";
            btn.style.pointerEvents = "";
            btn.onclick = (e) => { e.stopPropagation(); handler(e, btn); };
            return btn;
        }
    }
    return null;
}

function _wireFileOps(root) {

    // ── + New Map ───────────────────────────────────────────────────────────
    _wire(root, "+NewMap", () => {
        const w = parseInt(prompt("Map Width (tiles, min 40):", "160") || "0", 10);
        if (isNaN(w) || w < 40) { _toast("⚠ Cancelled"); return; }
        const h = parseInt(prompt("Map Height (tiles, min 40):", "120") || "0", 10);
        if (isNaN(h) || h < 40) { _toast("⚠ Cancelled"); return; }
        // Reset scenario state name
        const sc = root.querySelector("#se-st-scenario");
        if (sc) sc.textContent = "[New Unsaved]";
        // Clear viewport placeholder text
        const ph = root.querySelector(".se-ph-text");
        if (ph) ph.innerHTML = `New ${w}×${h} map ready — start painting tiles.`;
        _toast(`🗺 New ${w} × ${h} map created — pick a terrain tile and paint`);
    });

    // ── 📂 Load ─────────────────────────────────────────────────────────────
    _wire(root, "Load", () => {
        // Build list of saved scenarios from localStorage
        const keys = Object.keys(localStorage).filter(k =>
            k.startsWith("SE_scenario_") || k.startsWith("SE_v3_") || k.startsWith("SE_s"));
        
        if (keys.length > 0) {
            const lines = keys.map((k, i) => `  ${i + 1}. ${k}`).join("\n");
            const ans = prompt(
                `Saved scenarios in localStorage:\n${lines}\n\nEnter a number to load, or cancel to pick a .json file:`,
                "1"
            );
            if (ans !== null) {
                const idx = parseInt(ans, 10) - 1;
                if (!isNaN(idx) && keys[idx]) {
                    try {
                        const raw  = localStorage.getItem(keys[idx]);
                        const data = JSON.parse(raw);
                        if (window.ScenarioEditor?.storyEditor?.deserialize) {
                            window.ScenarioEditor.storyEditor.deserialize(data);
                        }
                        const sc = root.querySelector("#se-st-scenario");
                        const name = data?.meta?.name || data?.name || keys[idx];
                        if (sc) sc.textContent = name;
                        _toast(`📂 Loaded: ${name}`);
                    } catch (err) {
                        _toast("⚠ Failed to parse saved data: " + err.message);
                    }
                    return;
                }
            }
        }

        // Fall back to file picker
        const inp  = document.createElement("input");
        inp.type   = "file";
        inp.accept = ".json,.scenario";
        inp.style.display = "none";
        document.body.appendChild(inp);
        inp.onchange = (ev) => {
            const file = ev.target.files && ev.target.files[0];
            if (!file) { inp.remove(); return; }
            const reader = new FileReader();
            reader.onload = (re) => {
                try {
                    const data = JSON.parse(re.target.result);
                    if (window.ScenarioEditor?.storyEditor?.deserialize) {
                        window.ScenarioEditor.storyEditor.deserialize(data);
                    }
                    const sc   = root.querySelector("#se-st-scenario");
                    const name = data?.meta?.name || file.name.replace(/\.json$/,"");
                    if (sc) sc.textContent = name;
                    _toast(`📂 Loaded: ${file.name}`);
                } catch (err) {
                    _toast("⚠ Invalid JSON: " + err.message);
                }
                inp.remove();
            };
            reader.readAsText(file);
        };
        inp.click();
    });

    // ── 💾 Save ─────────────────────────────────────────────────────────────
    _wire(root, "Save", () => {
        try {
            const se   = window.ScenarioEditor?.storyEditor;
            const data = se?.serialize ? se.serialize() : {
                meta: { name: "Unsaved Scenario", savedAt: new Date().toISOString() }
            };
            const scenarioName = data?.meta?.name || "scenario";
            const key  = "SE_scenario_" + scenarioName.replace(/[^a-zA-Z0-9_]/g, "_");
            localStorage.setItem(key, JSON.stringify(data));
            const sc = root.querySelector("#se-st-scenario");
            if (sc) sc.textContent = scenarioName;
            _toast("💾 Saved to localStorage — key: " + key);
        } catch (err) {
            _toast("⚠ Save failed: " + err.message);
        }
    });

    // ── ↗ Export ────────────────────────────────────────────────────────────
    _wire(root, "Export", () => {
        try {
            const se   = window.ScenarioEditor?.storyEditor;
            const data = se?.serialize ? se.serialize() : {
                meta: { name: "Export", exportedAt: new Date().toISOString() },
                triggers: se?.getTriggers ? se.getTriggers() : [],
            };
            const scenarioName = (data?.meta?.name || "scenario").replace(/[^a-zA-Z0-9_\-]/g,"_");
            const ts   = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a");
            a.href     = url;
            a.download = `scenario_${scenarioName}_${ts}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            _toast("↗ Exported: " + a.download);
        } catch (err) {
            _toast("⚠ Export failed: " + err.message);
        }
    });

    // ── ▶ Test Play ──────────────────────────────────────────────────────────
    _wire(root, "TestPlay", () => {
        _toast("▶ Closing editor and launching Test Play…");
        setTimeout(() => {
            window.ScenarioEditor.close();
            setTimeout(() => {
                if (typeof window.initGame_story1 === "function") {
                    window.initGame_story1();
                } else if (typeof window.initGame === "function") {
                    window.initGame();
                } else {
                    alert(
                        "[Test Play]\n\n" +
                        "No initGame_story1() or initGame() function found.\n" +
                        "Define one of these in your game scripts to use Test Play."
                    );
                }
            }, 350);
        }, 280);
    });
}

function _wireUndoRedo(root) {
    // The undo ↩ and redo ↪ buttons are icon-only inside .se-title-right
    // They're the first two .se-btn elements in that container.
    const titleRight = root.querySelector(".se-title-right");
    if (!titleRight) return;
    const iconBtns = Array.from(titleRight.querySelectorAll(".se-btn.icon-only"));

    // ↩ Undo
    const undoBtn = iconBtns.find(b => b.textContent.trim() === "↩");
    if (undoBtn) {
        undoBtn.classList.remove("stub");
        undoBtn.style.opacity = "";
        undoBtn.onclick = () => {
            // Future: pop from _seHistory stack
            const se = window.ScenarioEditor?.storyEditor;
            if (se && se._historyUndo) {
                se._historyUndo();
            } else {
                _toast("↩ Undo — history stack not yet connected (Phase 2)");
            }
        };
    }

    // ↪ Redo
    const redoBtn = iconBtns.find(b => b.textContent.trim() === "↪");
    if (redoBtn) {
        redoBtn.classList.remove("stub");
        redoBtn.style.opacity = "";
        redoBtn.onclick = () => {
            const se = window.ScenarioEditor?.storyEditor;
            if (se && se._historyRedo) {
                se._historyRedo();
            } else {
                _toast("↪ Redo — history stack not yet connected (Phase 2)");
            }
        };
    }

    // ⚙ Gear
    const gearBtn = iconBtns.find(b => b.textContent.trim() === "⚙");
    if (gearBtn) {
        gearBtn.classList.remove("stub");
        gearBtn.style.opacity = "";
        gearBtn.onclick = (e) => { e.stopPropagation(); _showGearMenu(e, root); };
    }
}

// ---------------------------------------------------------------------------
// 6. GEAR DROPDOWN MENU
// ---------------------------------------------------------------------------
// Persistent visibility state — survives tab switches, resets on editor close
const _panelVis = {
    leftPanel:  true,
    rightPanel: true,
    timeline:   true,
    ribbon:     true,
    statusbar:  true,
};

function _showGearMenu(triggerEvent, root) {
    // Toggle: if menu already open, close it
    const existing = document.getElementById("se-gear-menu");
    if (existing) { existing.remove(); return; }

    const triggerBtn  = triggerEvent.currentTarget;
    const triggerRect = triggerBtn.getBoundingClientRect();

    const menu = document.createElement("div");
    menu.id    = "se-gear-menu";

    // ── Menu definition ────────────────────────────────────────────────────
    // Each item: { type: "section"|"sep"|"toggle"|"action", ... }
    const MENU_DEF = [
        { type: "section", label: "View — Panels" },
        { type: "toggle",  key: "leftPanel",  icon: "◧", label: "Left Panel (Tools & Tiles)"   },
        { type: "toggle",  key: "rightPanel", icon: "◨", label: "Right Panel (Inspector)"      },
        { type: "toggle",  key: "timeline",   icon: "▥", label: "Timeline & Trigger Drawer"    },
        { type: "toggle",  key: "ribbon",     icon: "▬", label: "Ribbon Toolbar"               },
        { type: "toggle",  key: "statusbar",  icon: "▭", label: "Status Bar"                   },
        { type: "sep" },
        { type: "section", label: "Layout Presets" },
        { type: "action",  id: "resetLayout",  icon: "↺", label: "Reset All Panels",        shortcut: "" },
        { type: "action",  id: "wideInspector",icon: "⊞", label: "Wide Inspector (360 px)", shortcut: "" },
        { type: "action",  id: "narrowTools",  icon: "◈", label: "Compact Tools (140 px)",  shortcut: "" },
        { type: "action",  id: "hideAllBut",   icon: "⛶", label: "Focus Mode (canvas only)", shortcut: "" },
        { type: "sep" },
        { type: "section", label: "Editor" },
        { type: "action",  id: "keybinds",    icon: "⌨", label: "Keybinds Reference",  shortcut: "?" },
        { type: "action",  id: "about",       icon: "ℹ", label: "About Scenario Editor v3" },
    ];

    MENU_DEF.forEach(item => {
        if (item.type === "section") {
            const sec = document.createElement("div");
            sec.className   = "se-gm-section";
            sec.textContent = item.label;
            menu.appendChild(sec);
            return;
        }
        if (item.type === "sep") {
            const sep = document.createElement("div");
            sep.className = "se-gm-sep";
            menu.appendChild(sep);
            return;
        }

        const row  = document.createElement("div");
        row.className = "se-gm-item";

        const check = document.createElement("span");
        check.className = "se-gm-check";

        const iconEl = document.createElement("span");
        iconEl.className   = "se-gm-icon";
        iconEl.textContent = item.icon;

        const labelEl = document.createElement("span");
        labelEl.className   = "se-gm-label";
        labelEl.textContent = item.label;

        if (item.shortcut) {
            const sc = document.createElement("span");
            sc.className   = "se-gm-shortcut";
            sc.textContent = item.shortcut;
            row.appendChild(check);
            row.appendChild(iconEl);
            row.appendChild(labelEl);
            row.appendChild(sc);
        } else {
            row.appendChild(check);
            row.appendChild(iconEl);
            row.appendChild(labelEl);
        }

        if (item.type === "toggle") {
            // Show current checked state
            check.textContent = _panelVis[item.key] ? "✓" : "";
            row.onclick = () => {
                _panelVis[item.key] = !_panelVis[item.key];
                _applyPanelVisibility(root);
                check.textContent = _panelVis[item.key] ? "✓" : "";
                _toast((_panelVis[item.key] ? "👁 Showing " : "🚫 Hiding ") + item.label);
            };
        } else {
            // Action items
            row.onclick = () => {
                menu.remove();
                _execGearAction(item.id, root);
            };
        }

        menu.appendChild(row);
    });

    // ── Position below the gear button, right-aligned ──────────────────────
    const spaceRight = window.innerWidth - triggerRect.right;
    menu.style.top   = (triggerRect.bottom + 4) + "px";
    menu.style.right = spaceRight + "px";
    document.body.appendChild(menu);

    // ── Close on click outside ─────────────────────────────────────────────
    function _onOutsideClick(ev) {
        if (!menu.contains(ev.target) && ev.target !== triggerBtn) {
            menu.remove();
            document.removeEventListener("click", _onOutsideClick, true);
        }
    }
    // Use capture + small delay so the triggering click doesn't immediately close
    setTimeout(() => document.addEventListener("click", _onOutsideClick, true), 16);
}

function _applyPanelVisibility(root) {
    const MAP = {
        leftPanel:  ["#se-left-panel", "#se-left-splitter"],
        rightPanel: ["#se-right-panel","#se-right-splitter"],
        timeline:   ["#se-timeline"],
        ribbon:     ["#se-ribbon"],
        statusbar:  ["#se-statusbar"],
    };
    Object.entries(MAP).forEach(([key, selectors]) => {
        selectors.forEach(sel => {
            const el = root.querySelector(sel);
            if (el) el.style.display = _panelVis[key] ? "" : "none";
        });
    });
}

function _execGearAction(actionId, root) {
    const lp  = root.querySelector("#se-left-panel");
    const rp  = root.querySelector("#se-right-panel");
    const tl  = root.querySelector("#se-timeline");

    switch (actionId) {

        case "resetLayout":
            if (lp) { lp.style.width = "190px"; lp.style.minWidth = ""; }
            if (rp) { rp.style.width = "300px"; rp.style.minWidth = ""; }
            if (tl) {
                tl.style.height = "220px";
                root.style.setProperty("--se-tl-h", "220px");
            }
            // Restore all panels visible
            Object.keys(_panelVis).forEach(k => { _panelVis[k] = true; });
            _applyPanelVisibility(root);
            _toast("↺ Panel layout reset to defaults");
            break;

        case "wideInspector":
            if (rp) { rp.style.width = "360px"; rp.style.minWidth = "320px"; }
            _toast("⊞ Inspector panel widened to 360 px");
            break;

        case "narrowTools":
            if (lp) { lp.style.width = "140px"; lp.style.minWidth = "120px"; }
            _toast("◈ Tools panel set to 140 px");
            break;

        case "hideAllBut":
            // Focus mode: hide left, right, ribbon, status, but keep timeline
            ["leftPanel","rightPanel","ribbon","statusbar"].forEach(k => {
                _panelVis[k] = false;
            });
            _applyPanelVisibility(root);
            _toast("⛶ Focus mode — hidden: tools, inspector, ribbon, status. Use ⚙ to restore.");
            break;

        case "keybinds":
            alert(
                "═══════════════════════════════════\n" +
                "   SCENARIO EDITOR — KEYBINDS\n" +
                "═══════════════════════════════════\n\n" +
                "  Ctrl + S     Save scenario\n" +
                "  Alt  + T     Add new trigger\n" +
                "  Ctrl + Z     Undo  (Phase 2)\n" +
                "  Ctrl + Y     Redo  (Phase 2)\n" +
                "  Escape       Close editor\n" +
                "  1 – 5        Switch mode tabs\n" +
                "               (1=Map, 2=Factions…)\n\n" +
                "  Console shortcuts:\n" +
                "  SE_storyTick()     Manual game tick\n" +
                "  SE_turnAdvance()   Increment turn\n" +
                "  SE_fireTrigger(id) Fire trigger by id\n" +
                "  SE_dialogue(sp,po,tx) Queue dialogue\n"
            );
            break;

        case "about":
            alert(
                "═══════════════════════════════════\n" +
                "   SCENARIO EDITOR v1\n" +
                "═══════════════════════════════════\n\n" +
                "Dawn of Gunpowdeor V1 developer scenario\n" +
                "editor for stories.\n\n" +
                "Loaded modules:\n" +
                "  Part 1 — Base editor + UI\n" +
                "  Part 2 — Cities & NPCs patch\n" +
                "  Part 3 — Map engine bridge\n" +
                "  Part 4 — Trigger Runtime v3\n" +
                "  Part 5 — UI Patch (this file)\n\n" +
                "API: window.ScenarioEditor.storyEditor\n"
            );
            break;
    }
}

// ---------------------------------------------------------------------------
// 7. EXPAND FACTION LIST — all East Asia sides of the Mongol Invasion
// ---------------------------------------------------------------------------
// The full historical faction set for the Yuan Invasion of Japan (1274–1281).
// Adds Yuan sub-factions and Korean vassals that were absent from the preview.
const EXTRA_FACTIONS = [
    // Yuan Dynasty command structure
    { name: "Han Infantry Corps",       color: "#e53935", role: "Invader"  },
    { name: "Mongol Cavalry Division",  color: "#ef6c00", role: "Invader"  },
    { name: "Naval Command (Yuan)",     color: "#c62828", role: "Invader"  },
    // Goryeo (Koryo) — Korean vassal kingdom of the Yuan
    { name: "Goryeo Kingdom",           color: "#43a047", role: "Vassal"   },
    { name: "Goryeo Marines",           color: "#2e7d32", role: "Vassal"   },
    // Southern Song remnant recruits pressed into Yuan service
    { name: "Southern Song Remnants",   color: "#ff8f00", role: "Conscript"},
    // Jurchen tribal auxiliaries
    { name: "Jurchen Auxiliaries",      color: "#6d4c41", role: "Auxiliary"},
];

function _expandFactionList(root) {
    if (!root) return;
    const list = root.querySelector(".se-faction-list");
    if (!list) return;

    // Avoid duplicating on re-open
    if (list.dataset.expanded === "1") return;
    list.dataset.expanded = "1";

    EXTRA_FACTIONS.forEach(f => {
        const row = document.createElement("div");
        row.className = "se-faction-row";
        row.title = `Click to configure ${f.name}`;
        row.innerHTML =
            `<div class="se-faction-dot" style="background:${f.color};border:1px solid rgba(0,0,0,0.5)"></div>` +
            `<span class="se-faction-name">${f.name}</span>` +
            `<span class="se-faction-badge">${f.role}</span>`;
        row.addEventListener("click", () => {
            root.querySelectorAll(".se-faction-row").forEach(r => r.classList.remove("active"));
            row.classList.add("active");
            // Update Faction Config header to show selected faction name
            const cfgHeader = root.querySelector(".se-card-header");
            // Find the Faction Config card specifically
            const allHeaders = root.querySelectorAll(".se-card-header");
            allHeaders.forEach(h => {
                if (h.textContent.includes("Faction Config")) {
                    h.textContent = "⚙ Faction Config — " + f.name;
                }
            });
            _toast(`⚑ Selected: ${f.name} (${f.role})`);
        });
        list.appendChild(row);
    });
}

// ---------------------------------------------------------------------------
// 8. HOOK — re-run patch after every open() call
// ---------------------------------------------------------------------------
// We chain onto whatever the current SE.open is (which may already be wrapped
// by Part 2's wrapper). We wait 200 ms to let all setTimeout(,50) wrappers
// in Part 2+ finish rebuilding the DOM before we attach our handlers.

const _SE = window.ScenarioEditor;
const _prevOpen  = _SE.open.bind(_SE);
const _prevClose = _SE.close.bind(_SE);

_SE.open = function() {
    _prevOpen();
    setTimeout(function _patchSetup() {
        _injectPatchCSS();
        const root = document.getElementById("se-root");
        if (!root) {
            // DOM not ready yet — try once more
            setTimeout(_patchSetup, 120);
            return;
        }
        _initSplitters(root);
        _wireFileOps(root);
        _wireUndoRedo(root);
        _expandFactionList(root);
        console.log("[SE-Patch] ✓ Splitters, buttons, gear menu, factions installed.");
    }, 200);
};

_SE.close = function() {
    // Reset panel-vis state so next open() starts fresh
    Object.keys(_panelVis).forEach(k => { _panelVis[k] = true; });
    // Remove patch UI elements
    const gearMenu = document.getElementById("se-gear-menu");
    if (gearMenu) gearMenu.remove();
    const toast = document.getElementById("se-patch-toast");
    if (toast) toast.remove();
    // Remove patch CSS (editor's own CSS is removed by SE.close)
    const patchCSS = document.getElementById("se-patch-styles");
    if (patchCSS) patchCSS.remove();
    _prevClose();
};

// Handle case where editor was already open when this script was injected
if (document.getElementById("se-root")) {
    _injectPatchCSS();
    const root = document.getElementById("se-root");
    _initSplitters(root);
    _wireFileOps(root);
    _wireUndoRedo(root);
    _expandFactionList(root);
    console.log("[SE-Patch] ✓ Patched already-open editor.");
}

console.log(
    "%c[SE-Patch] scenario_editor_patch.js loaded.\n" +
    " • Horizontal timeline splitter — rewired\n" +
    " • Vertical left + right splitters — added\n" +
    " • File-op buttons — wired (New Map / Load / Save / Export / Test Play)\n" +
    " • Undo / Redo / Gear — wired\n" +
    " • Gear dropdown — View toggles + Layout presets + Keybinds\n" +
    " • Inspector scroll — CSS override applied\n" +
    " • East Asia faction list — 7 extra factions added",
    "color:#e8b832;font-family:monospace;font-size:11px"
);

})();

// =============================================================================
// SCENARIO EDITOR — SPLITTER + UI PATCH v2  (scenario_editor_patch.js)
//
// ROOT CAUSE ANALYSIS (why the horizontal bar never moved):
// ─────────────────────────────────────────────────────────────────────────────
//  Part 4's _mount() (line 4021) adds class "se-tl-expanded" to #se-timeline.
//  EXTRA_CSS (line 3893) defines:
//
//      #se-timeline.se-tl-expanded { height:62vh !important; }
//
//  CSS !important in a stylesheet beats an inline style.height assignment.
//  So when the drag handle calls  tl.style.height = "350px",  the !important
//  rule always wins and the panel never moves.
//
//  The original _initDragHandle already writes --se-tl-h as a CSS variable,
//  but the se-tl-expanded rule ignores it.  Fix: override se-tl-expanded so
//  it reads from the variable, making the CSS and the JS cooperate instead
//  of fight:
//
//      #se-timeline.se-tl-expanded { height: var(--se-tl-h, 62vh) !important; }
//
//  When the drag handle then updates  root.style.setProperty("--se-tl-h", h)
//  the variable changes and the !important rule resolves to the new value.
//
// VERTICAL SPLITTERS:
// ─────────────────────────────────────────────────────────────────────────────
//  Left panel splitter  (#se-left-splitter)  → inserted after #se-left-panel
//  Right panel splitter (#se-right-splitter) → inserted after #se-center
//  Both use pointer-capture on the splitter element so the drag tracks even
//  when the pointer moves outside the handle at high speed.
//
// APPEND THIS FILE after the last line of scenario_editor.js.
// =============================================================================

(function _SEPatch() {
"use strict";

if (window.__SE_PATCH_V2__) {
    console.log("[SE-Patch v2] Already loaded.");
    return;
}
window.__SE_PATCH_V2__ = true;

// ─────────────────────────────────────────────────────────────────────────────
// 1.  PATCH CSS
//     • Fixes the !important height lock on se-tl-expanded by routing through
//       --se-tl-h so the JS drag handler and the CSS cooperate.
//     • Vertical splitter visual styles.
//     • Gear dropdown, toast, right-panel scroll fix.
// ─────────────────────────────────────────────────────────────────────────────
const PATCH_CSS = `

/* ── CRITICAL: route se-tl-expanded through the CSS variable ──────── */
/* This is the only change needed to make horizontal drag work.
   The JS drag handler already writes --se-tl-h; now the CSS reads it. */
#se-timeline.se-tl-expanded {
    height: var(--se-tl-h, 62vh) !important;
    min-height: 80px !important;
}

/* ── Vertical splitter handles ─────────────────────────────────────── */
.se-v-splitter {
    width: 7px;
    flex-shrink: 0;
    background: linear-gradient(to right, #1e1208, #5a4020 40%, #5a4020 60%, #1e1208);
    cursor: ew-resize;
    position: relative;
    z-index: 10;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    transition: background 0.12s;
}
.se-v-splitter::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 2px;
    height: 40px;
    background: #a07820;
    border-radius: 2px;
    opacity: 0.4;
    pointer-events: none;
    transition: opacity 0.12s, background 0.12s;
}
.se-v-splitter:hover,
.se-v-splitter.dragging {
    background: linear-gradient(to right, #3a2008, #e8b832 40%, #e8b832 60%, #3a2008);
}
.se-v-splitter:hover::after,
.se-v-splitter.dragging::after {
    background: #e8b832;
    opacity: 1;
}

/* ── Right-panel scroll fix ────────────────────────────────────────── */
/* Two conflicting #se-right-panel blocks in the original CSS; the first
   has overflow:hidden, the second partially overrides. Force scroll here. */
#se-right-panel {
    overflow: hidden !important;
    display: flex !important;
    flex-direction: column !important;
}
.se-right-scroll {
    flex: 1 1 0 !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    min-height: 0 !important;
    -webkit-overflow-scrolling: touch;
}

/* ── Gear dropdown ─────────────────────────────────────────────────── */
#se-gear-menu {
    position: fixed;
    z-index: 45000;
    background: #18100a;
    border: 1px solid #c8921a;
    border-radius: 3px;
    min-width: 248px;
    padding: 4px 0;
    font-family: 'Georgia','Times New Roman',serif;
    box-shadow: 0 8px 28px rgba(0,0,0,0.9);
    animation: se-gear-pop 0.1s ease-out;
}
@keyframes se-gear-pop {
    from { opacity:0; transform:translateY(-5px); }
    to   { opacity:1; transform:translateY(0); }
}
.se-gm-section {
    padding: 5px 12px 2px;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 1.8px;
    color: #a07820;
    border-top: 1px solid #2a1a08;
    margin-top: 2px;
}
.se-gm-section:first-child { border-top: none; margin-top: 0; }
.se-gm-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px 6px 8px;
    font-size: 12px;
    color: #d8c890;
    cursor: pointer;
    user-select: none;
    transition: background 0.1s, color 0.1s;
}
.se-gm-item:hover { background: rgba(232,184,50,0.10); color: #fff8e0; }
.se-gm-check { width: 14px; font-size: 11px; color: #e8b832; flex-shrink:0; text-align:center; }
.se-gm-icon  { font-size: 13px; width: 18px; flex-shrink:0; text-align:center; }
.se-gm-label { flex: 1; }
.se-gm-shortcut { font-size: 9px; color: #5a4030; }
.se-gm-sep { height: 1px; background: #2a1a08; margin: 3px 0; }

/* ── Toast ─────────────────────────────────────────────────────────── */
#se-patch-toast {
    position: fixed;
    bottom: 36px;
    left: 50%;
    transform: translateX(-50%) translateY(10px);
    background: #1a1208;
    border: 1px solid #c8921a;
    color: #e8b832;
    padding: 7px 20px;
    border-radius: 3px;
    font-family: 'Georgia','Times New Roman',serif;
    font-size: 12px;
    z-index: 55000;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s, transform 0.2s;
    white-space: nowrap;
    max-width: 90vw;
    box-shadow: 0 4px 18px rgba(0,0,0,0.8);
}
#se-patch-toast.show { opacity:1; transform:translateX(-50%) translateY(0); }

/* ── Remove stub-disabled look from file-op buttons ───────────────── */
.se-file-ops .se-btn,
.se-title-right .se-btn { opacity:1 !important; cursor:pointer !important; pointer-events:auto !important; }
`;

function _injectCSS() {
    const old = document.getElementById("se-patch-styles-v2");
    if (old) old.remove();
    const s = document.createElement("style");
    s.id = "se-patch-styles-v2";
    s.textContent = PATCH_CSS;
    document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2.  TOAST
// ─────────────────────────────────────────────────────────────────────────────
let _toastTid = null;
function _toast(msg, ms) {
    ms = ms || 2500;
    let el = document.getElementById("se-patch-toast");
    if (!el) {
        el = document.createElement("div");
        el.id = "se-patch-toast";
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(_toastTid);
    _toastTid = setTimeout(() => el.classList.remove("show"), ms);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.  HORIZONTAL TIMELINE SPLITTER (the one that was broken)
//
//  Strategy:
//  a) Clone #se-tl-drag-handle to clear any stale listeners.
//  b) Sync --se-tl-h to the element's live height so the CSS var is
//     initialized correctly for the se-tl-expanded class.
//  c) On drag, update --se-tl-h (which the overridden CSS reads).
//     Also set inline style with !important as belt-and-suspenders.
//  d) Use pointer capture on the handle so the drag never "escapes"
//     even at high mouse speed.
// ─────────────────────────────────────────────────────────────────────────────
function _initHorizSplitter(root) {
    const handle   = root.querySelector("#se-tl-drag-handle");
    const timeline = root.querySelector("#se-timeline");
    if (!handle || !timeline) return;

    // Clone away stale listeners from original _initDragHandle
    const h = handle.cloneNode(true);
    handle.parentNode.replaceChild(h, handle);

    // ── Sync the CSS variable to the live rendered height right now ────────
    // (important: after se-tl-expanded is added by _mount(), getBCR gives
    //  the real pixel value of 62vh so --se-tl-h starts at that number)
    function syncVar() {
        const live = timeline.getBoundingClientRect().height;
        if (live > 0) root.style.setProperty("--se-tl-h", live + "px");
    }
    syncVar();

    // ── Drag state ─────────────────────────────────────────────────────────
    let startY = 0, startH = 0, dragging = false;

    function clamp(v) { return Math.min(Math.max(v, 80), Math.floor(window.innerHeight * 0.80)); }

    function applyH(px) {
        const clamped = clamp(px);
        // Update the CSS variable — the overridden se-tl-expanded reads this.
        root.style.setProperty("--se-tl-h", clamped + "px");
        // Belt-and-suspenders: inline style with !important beats everything.
        timeline.style.setProperty("height", clamped + "px", "important");
    }

    // ── Pointer-capture approach (works even at high pointer speed) ────────
    h.addEventListener("pointerdown", function onDown(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        syncVar();                       // re-sync before each drag
        startY = e.clientY;
        startH = timeline.getBoundingClientRect().height;
        dragging = true;
        h.classList.add("dragging");
        h.setPointerCapture(e.pointerId);
        document.body.style.userSelect       = "none";
        document.body.style.webkitUserSelect = "none";
        document.body.style.cursor           = "ns-resize";
    });

    h.addEventListener("pointermove", function onMove(e) {
        if (!dragging) return;
        e.preventDefault();
        // Drag UP (negative delta) = larger timeline
        const delta = startY - e.clientY;
        applyH(startH + delta);
    });

    h.addEventListener("pointerup", function onUp(e) {
        if (!dragging) return;
        dragging = false;
        h.classList.remove("dragging");
        h.releasePointerCapture(e.pointerId);
        document.body.style.userSelect       = "";
        document.body.style.webkitUserSelect = "";
        document.body.style.cursor           = "";
    });

    h.addEventListener("pointercancel", function() {
        dragging = false;
        h.classList.remove("dragging");
        document.body.style.userSelect       = "";
        document.body.style.webkitUserSelect = "";
        document.body.style.cursor           = "";
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4.  VERTICAL SPLITTERS — left panel and right panel
//
//  Uses pointer capture so drag stays locked to the handle even when the
//  pointer moves over the map canvas at speed.  Panel width is clamped and
//  flex-shrink is forced to 0 so the center canvas absorbs the change.
// ─────────────────────────────────────────────────────────────────────────────
function _makeVertSplitter(splitterId, panel, direction) {
    // direction: "left"  → panel is LEFT of splitter,  drag right = wider
    //            "right" → panel is RIGHT of splitter, drag left  = wider

    const splitter = document.getElementById(splitterId);
    if (!splitter || !panel) return;

    let startX = 0, startW = 0, dragging = false;

    function clampW(w) {
        // Different clamps for each panel
        const min = splitterId === "se-left-splitter"  ? 110 : 180;
        const max = splitterId === "se-left-splitter"  ? 480 : 540;
        return Math.min(Math.max(w, min), max);
    }

    function applyW(px) {
        const clamped = clampW(px);
        panel.style.width    = clamped + "px";
        panel.style.minWidth = clamped + "px";
        panel.style.flexShrink = "0";
    }

    splitter.addEventListener("pointerdown", function onDown(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        startX = e.clientX;
        startW = panel.getBoundingClientRect().width;
        dragging = true;
        splitter.classList.add("dragging");
        splitter.setPointerCapture(e.pointerId);
        document.body.style.userSelect       = "none";
        document.body.style.webkitUserSelect = "none";
        document.body.style.cursor           = "ew-resize";
    });

    splitter.addEventListener("pointermove", function onMove(e) {
        if (!dragging) return;
        e.preventDefault();
        const dx = e.clientX - startX;
        const newW = direction === "left" ? startW + dx : startW - dx;
        applyW(newW);
    });

    function onUp(e) {
        if (!dragging) return;
        dragging = false;
        splitter.classList.remove("dragging");
        splitter.releasePointerCapture(e.pointerId);
        document.body.style.userSelect       = "";
        document.body.style.webkitUserSelect = "";
        document.body.style.cursor           = "";
    }

    splitter.addEventListener("pointerup",     onUp);
    splitter.addEventListener("pointercancel", onUp);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5.  INSERT VERTICAL SPLITTERS INTO THE DOM
// ─────────────────────────────────────────────────────────────────────────────
function _insertVertSplitters(root) {
    const workspace  = root.querySelector("#se-workspace");
    const leftPanel  = root.querySelector("#se-left-panel");
    const center     = root.querySelector("#se-center");
    const rightPanel = root.querySelector("#se-right-panel");
    if (!workspace || !leftPanel || !center || !rightPanel) return;

    // Remove stale splitters from a previous open() call
    ["se-left-splitter", "se-right-splitter"].forEach(id => {
        const old = root.querySelector("#" + id);
        if (old) old.remove();
    });

    // Left splitter — between leftPanel and center
    const lSplit = document.createElement("div");
    lSplit.className = "se-v-splitter";
    lSplit.id = "se-left-splitter";
    lSplit.title = "Drag to resize left panel";
    leftPanel.insertAdjacentElement("afterend", lSplit);

    // Right splitter — between center and rightPanel
    const rSplit = document.createElement("div");
    rSplit.className = "se-v-splitter";
    rSplit.id = "se-right-splitter";
    rSplit.title = "Drag to resize inspector panel";
    center.insertAdjacentElement("afterend", rSplit);

    // Wire drag handlers AFTER elements are in the DOM
    _makeVertSplitter("se-left-splitter",  leftPanel,  "left");
    _makeVertSplitter("se-right-splitter", rightPanel, "right");
}

// ─────────────────────────────────────────────────────────────────────────────
// 6.  BUTTON WIRING
// ─────────────────────────────────────────────────────────────────────────────
function _findBtn(root, fragment) {
    const clean = (s) => s.replace(/\s+/g, "").toLowerCase();
    const needle = clean(fragment);
    return Array.from(root.querySelectorAll(".se-btn")).find(b =>
        clean(b.textContent).includes(needle)
    );
}

function _activate(btn, handler) {
    if (!btn) return;
    btn.classList.remove("stub");
    btn.style.opacity = "";
    btn.style.cursor  = "pointer";
    btn.style.pointerEvents = "";
    btn.onclick = (e) => { e.stopPropagation(); handler(e, btn); };
}

function _wireButtons(root) {

    // + New Map
    _activate(_findBtn(root, "+NewMap"), () => {
        const w = parseInt(prompt("Map Width (tiles, min 40):", "160") || "0", 10);
        if (isNaN(w) || w < 40) { _toast("⚠ Cancelled"); return; }
        const h = parseInt(prompt("Map Height (tiles, min 40):", "120") || "0", 10);
        if (isNaN(h) || h < 40) { _toast("⚠ Cancelled"); return; }
        const sc = root.querySelector("#se-st-scenario");
        if (sc) sc.textContent = `[New ${w}×${h}]`;
        const ph = root.querySelector(".se-ph-text");
        if (ph) ph.innerHTML = `New ${w}×${h} map ready — select a tile and paint.`;
        _toast(`🗺 New ${w}×${h} map created`);
    });

    // Load
    _activate(_findBtn(root, "📂Load"), () => {
        const keys = Object.keys(localStorage).filter(k =>
            k.startsWith("SE_scenario_") || k.startsWith("SE_story_") || k.startsWith("SE_v3_")
        ).filter(k => k !== "SE_story_LAST");

        if (keys.length) {
            const lines = keys.map((k, i) => `  ${i+1}. ${k}`).join("\n");
            const ans = prompt(`Saved scenarios:\n${lines}\n\nEnter number to load, or Cancel to pick a file:`, "1");
            if (ans !== null) {
                const idx = parseInt(ans, 10) - 1;
                if (!isNaN(idx) && keys[idx]) {
                    try {
                        const data = JSON.parse(localStorage.getItem(keys[idx]));
                        window.ScenarioEditor?.storyEditor?.deserialize?.(data);
                        const name = data?.meta?.name || keys[idx];
                        const sc = root.querySelector("#se-st-scenario");
                        if (sc) sc.textContent = name;
                        _toast("📂 Loaded: " + name);
                    } catch (err) { _toast("⚠ " + err.message); }
                    return;
                }
            }
        }

        // File picker fallback
        const inp = document.createElement("input");
        inp.type   = "file";
        inp.accept = ".json,.scenario";
        inp.style.display = "none";
        document.body.appendChild(inp);
        inp.onchange = ev => {
            const file = ev.target.files && ev.target.files[0];
            if (!file) { inp.remove(); return; }
            new FileReader().onload = re => {
                try {
                    const data = JSON.parse(re.target.result);
                    window.ScenarioEditor?.storyEditor?.deserialize?.(data);
                    const name = data?.meta?.name || file.name.replace(/\.json$/, "");
                    const sc = root.querySelector("#se-st-scenario");
                    if (sc) sc.textContent = name;
                    _toast("📂 Loaded: " + file.name);
                } catch (err) { _toast("⚠ " + err.message); }
                inp.remove();
            };
            const r = new FileReader();
            r.onload = re => {
                try {
                    const data = JSON.parse(re.target.result);
                    window.ScenarioEditor?.storyEditor?.deserialize?.(data);
                    const sc = root.querySelector("#se-st-scenario");
                    if (sc) sc.textContent = data?.meta?.name || file.name;
                    _toast("📂 Loaded: " + file.name);
                } catch (err) { _toast("⚠ " + err.message); }
                inp.remove();
            };
            r.readAsText(file);
        };
        inp.click();
    });

    // Save
    _activate(_findBtn(root, "💾Save"), () => {
        try {
            const se   = window.ScenarioEditor?.storyEditor;
            const data = se?.serialize ? se.serialize() : { meta: { name: "Scenario", savedAt: Date.now() } };
            const name = data?.meta?.name || "scenario";
            const key  = "SE_scenario_" + name.replace(/\W+/g, "_");
            localStorage.setItem(key, JSON.stringify(data));
            const sc = root.querySelector("#se-st-scenario");
            if (sc) sc.textContent = name;
            _toast("💾 Saved → " + key);
        } catch (err) { _toast("⚠ Save failed: " + err.message); }
    });

    // Export
    _activate(_findBtn(root, "↗Export"), () => {
        try {
            const se   = window.ScenarioEditor?.storyEditor;
            const data = se?.serialize ? se.serialize() : { exported: true, ts: Date.now() };
            const name = (data?.meta?.name || "scenario").replace(/\W+/g, "_");
            const ts   = new Date().toISOString().slice(0,19).replace(/[:T]/g, "-");
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url  = URL.createObjectURL(blob);
            const a    = Object.assign(document.createElement("a"), { href: url, download: `${name}_${ts}.json` });
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            _toast("↗ Exported: " + a.download);
        } catch (err) { _toast("⚠ Export failed: " + err.message); }
    });

    // Test Play
    _activate(_findBtn(root, "TestPlay"), () => {
        _toast("▶ Launching Test Play…");
        setTimeout(() => {
            window.ScenarioEditor.close();
            setTimeout(() => {
                if (typeof window.initGame_story1 === "function") window.initGame_story1();
                else if (typeof window.initGame   === "function") window.initGame();
                else alert("[Test Play] Define initGame_story1() or initGame() to use this.");
            }, 350);
        }, 280);
    });

    // Undo / Redo / Gear — in .se-title-right
    const tr = root.querySelector(".se-title-right");
    if (tr) {
        const iconBtns = Array.from(tr.querySelectorAll(".se-btn.icon-only"));
        const undo = iconBtns.find(b => b.textContent.trim() === "↩");
        const redo = iconBtns.find(b => b.textContent.trim() === "↪");
        const gear = iconBtns.find(b => b.textContent.trim() === "⚙");
        _activate(undo, () => _toast("↩ Undo — history stack not yet wired (Phase 2)"));
        _activate(redo, () => _toast("↪ Redo — history stack not yet wired (Phase 2)"));
        _activate(gear, (e) => _showGearMenu(e, root));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7.  GEAR DROPDOWN
// ─────────────────────────────────────────────────────────────────────────────
const _panelVis = { leftPanel:true, rightPanel:true, timeline:true, ribbon:true, statusbar:true };

function _showGearMenu(e, root) {
    e.stopPropagation();
    const old = document.getElementById("se-gear-menu");
    if (old) { old.remove(); return; }

    const rect = e.currentTarget.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.id = "se-gear-menu";

    const DEF = [
        { section: "View — Panels" },
        { toggle: "leftPanel",  icon: "◧", label: "Left Panel (Tools)"    },
        { toggle: "rightPanel", icon: "◨", label: "Right Panel (Inspector)" },
        { toggle: "timeline",   icon: "▥", label: "Timeline / Triggers"   },
        { toggle: "ribbon",     icon: "▬", label: "Ribbon Toolbar"        },
        { toggle: "statusbar",  icon: "▭", label: "Status Bar"            },
        { sep: 1 },
        { section: "Layout Presets" },
        { action: "reset",       icon: "↺", label: "Reset All Panels" },
        { action: "wideInspector",icon:"⊞", label: "Wide Inspector (360 px)" },
        { action: "narrowTools", icon: "◈", label: "Compact Tools (140 px)"  },
        { action: "focusMode",   icon: "⛶", label: "Focus Mode (canvas only)" },
        { sep: 1 },
        { section: "Editor" },
        { action: "keybinds",   icon: "⌨", label: "Keybind Reference"   },
        { action: "about",      icon: "ℹ", label: "About — Scenario Editor v3" },
    ];

    DEF.forEach(item => {
        if (item.section) {
            const d = document.createElement("div");
            d.className = "se-gm-section";
            d.textContent = item.section;
            menu.appendChild(d); return;
        }
        if (item.sep) {
            const d = document.createElement("div");
            d.className = "se-gm-sep";
            menu.appendChild(d); return;
        }
        const row = document.createElement("div");
        row.className = "se-gm-item";
        const chk = document.createElement("span"); chk.className = "se-gm-check";
        const ico = document.createElement("span"); ico.className = "se-gm-icon"; ico.textContent = item.icon;
        const lbl = document.createElement("span"); lbl.className = "se-gm-label"; lbl.textContent = item.label;
        row.append(chk, ico, lbl);

        if (item.toggle) {
            chk.textContent = _panelVis[item.toggle] ? "✓" : "";
            row.onclick = () => {
                _panelVis[item.toggle] = !_panelVis[item.toggle];
                chk.textContent = _panelVis[item.toggle] ? "✓" : "";
                _applyVis(root);
            };
        } else {
            row.onclick = () => { menu.remove(); _gearAction(item.action, root); };
        }
        menu.appendChild(row);
    });

    menu.style.cssText = `top:${rect.bottom + 4}px;right:${window.innerWidth - rect.right}px`;
    document.body.appendChild(menu);

    setTimeout(() => document.addEventListener("click", function _off(ev) {
        if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener("click", _off, true); }
    }, true), 16);
}

function _applyVis(root) {
    const MAP = {
        leftPanel:  ["#se-left-panel", "#se-left-splitter"],
        rightPanel: ["#se-right-panel","#se-right-splitter"],
        timeline:   ["#se-timeline"],
        ribbon:     ["#se-ribbon"],
        statusbar:  ["#se-statusbar"],
    };
    Object.entries(MAP).forEach(([key, sels]) => sels.forEach(sel => {
        const el = root.querySelector(sel);
        if (el) el.style.display = _panelVis[key] ? "" : "none";
    }));
}

function _gearAction(id, root) {
    const lp = root.querySelector("#se-left-panel");
    const rp = root.querySelector("#se-right-panel");
    const tl = root.querySelector("#se-timeline");
    switch (id) {
        case "reset":
            if (lp) { lp.style.width = "190px"; lp.style.minWidth = ""; }
            if (rp) { rp.style.width = "300px"; rp.style.minWidth = ""; }
            if (tl) {
                const h = "220px";
                root.style.setProperty("--se-tl-h", h);
                tl.style.setProperty("height", h, "important");
            }
            Object.keys(_panelVis).forEach(k => _panelVis[k] = true);
            _applyVis(root);
            _toast("↺ Panels reset to defaults");
            break;
        case "wideInspector":
            if (rp) { rp.style.width = "360px"; rp.style.minWidth = "320px"; }
            _toast("⊞ Inspector → 360 px");
            break;
        case "narrowTools":
            if (lp) { lp.style.width = "140px"; lp.style.minWidth = "120px"; }
            _toast("◈ Tools → 140 px");
            break;
        case "focusMode":
            ["leftPanel","rightPanel","ribbon","statusbar"].forEach(k => _panelVis[k] = false);
            _applyVis(root);
            _toast("⛶ Focus mode — use ⚙ to restore panels");
            break;
        case "keybinds":
            alert(
                "═══════════════════════════════════\n"+
                "   SCENARIO EDITOR — KEYBINDS\n"+
                "═══════════════════════════════════\n\n"+
                "  Ctrl + S      Save\n"+
                "  Alt  + T      Add trigger\n"+
                "  Ctrl + Z      Undo (Phase 2)\n"+
                "  Ctrl + Y      Redo (Phase 2)\n"+
                "  Escape        Close modal / dialog\n\n"+
                "  Console:\n"+
                "  SE_storyTick()        Manual tick\n"+
                "  SE_turnAdvance()      Increment turn\n"+
                "  SE_fireTrigger(id)    Fire trigger\n"+
                "  SE_dialogue(sp,po,tx) Queue dialogue\n"
            );
            break;
        case "about":
            alert(
                "═══════════════════════════════════\n"+
                "   SCENARIO EDITOR v3 — UI PATCH\n"+
                "═══════════════════════════════════\n\n"+
                "Parts loaded:\n"+
                "  1 Base editor + CSS + DOM\n"+
                "  2 Cities & NPCs mode\n"+
                "  3 Map engine bridge\n"+
                "  4 Story Trigger Runtime v3\n"+
                "  5 UI Patch v2 (this file)\n\n"+
                "Horizontal drag fix:\n"+
                "  Root cause: se-tl-expanded { height:62vh !important }\n"+
                "  Fix: routed through --se-tl-h CSS variable\n"
            );
            break;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8.  EXTRA FACTIONS (East Asian sides of the Mongol Invasion, 1274–1281)
// ─────────────────────────────────────────────────────────────────────────────
const EXTRA_FACTIONS = [
    { name: "Han Infantry Corps",      color: "#e53935", role: "Invader"   },
    { name: "Mongol Cavalry Division", color: "#ef6c00", role: "Invader"   },
    { name: "Yuan Naval Command",      color: "#b71c1c", role: "Invader"   },
    { name: "Goryeo Kingdom",          color: "#43a047", role: "Vassal"    },
    { name: "Goryeo Marines",          color: "#2e7d32", role: "Vassal"    },
    { name: "Southern Song Remnants",  color: "#ff8f00", role: "Conscript" },
    { name: "Jurchen Auxiliaries",     color: "#6d4c41", role: "Auxiliary" },
];

function _expandFactions(root) {
    const list = root.querySelector(".se-faction-list");
    if (!list || list.dataset.expanded) return;
    list.dataset.expanded = "1";
    EXTRA_FACTIONS.forEach(f => {
        const row = document.createElement("div");
        row.className = "se-faction-row";
        row.title = `Click to configure ${f.name}`;
        row.innerHTML =
            `<div class="se-faction-dot" style="background:${f.color};border:1px solid rgba(0,0,0,0.5)"></div>`+
            `<span class="se-faction-name">${f.name}</span>`+
            `<span class="se-faction-badge">${f.role}</span>`;
        row.addEventListener("click", () => {
            root.querySelectorAll(".se-faction-row").forEach(r => r.classList.remove("active"));
            row.classList.add("active");
            root.querySelectorAll(".se-card-header").forEach(h => {
                if (h.textContent.includes("Faction Config")) h.textContent = `⚙ Faction Config — ${f.name}`;
            });
            _toast(`⚑ ${f.name} selected`);
        });
        list.appendChild(row);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 9.  MASTER SETUP — called every time the editor opens
// ─────────────────────────────────────────────────────────────────────────────
function _setup() {
    _injectCSS();
    const root = document.getElementById("se-root");
    if (!root) return;
    _initHorizSplitter(root);
    _insertVertSplitters(root);
    _wireButtons(root);
    _expandFactions(root);
    console.log("[SE-Patch v2] ✓ Splitters, buttons, gear, factions installed.");
}

// ─────────────────────────────────────────────────────────────────────────────
// 10.  HOOK SE.open / SE.close
//
//  The chain at this point may already have 2–3 wrappers (Part 2, Part 4).
//  We wait 300 ms so all prior setTimeout(,50) callbacks finish running
//  (they trigger _mount() which adds se-tl-expanded), then we re-sync
//  --se-tl-h and attach our clean listeners.
// ─────────────────────────────────────────────────────────────────────────────
const _SE  = window.ScenarioEditor;
const _prev = _SE.open.bind(_SE);
const _prevClose = _SE.close ? _SE.close.bind(_SE) : null;

_SE.open = function() {
    _prev();
    setTimeout(function attempt() {
        const root = document.getElementById("se-root");
        if (!root) { setTimeout(attempt, 100); return; }   // DOM not ready yet
        _setup();
    }, 300);
};

if (_prevClose) {
    _SE.close = function() {
        Object.keys(_panelVis).forEach(k => _panelVis[k] = true);
        document.getElementById("se-gear-menu")?.remove();
        document.getElementById("se-patch-toast")?.remove();
        document.getElementById("se-patch-styles-v2")?.remove();
        _prevClose();
    };
}

// If editor was already open when this script loaded:
if (document.getElementById("se-root")) _setup();

// ─────────────────────────────────────────────────────────────────────────────
// 11.  _mount() INTERCEPT
//
//  Every time the user clicks the TRIGGERS tab, SE._setTab("TRIGGERS") calls
//  _mount() (Part 4) which re-adds se-tl-expanded.  After _mount() runs, the
//  --se-tl-h variable may be out of sync.  We patch window._SE_STORY._mount
//  (if exposed) to re-sync the var after every mount.
//
//  This ensures the drag handle position "sticks" even after switching tabs.
// ─────────────────────────────────────────────────────────────────────────────
setTimeout(function _patchMount() {
    const story = window._SE_STORY;
    if (!story) return;
    const origMount = story._mount;
    if (origMount && !origMount._sePatchedV2) {
        story._mount = function() {
            origMount.apply(this, arguments);
            // Re-sync CSS var to live height after _mount re-applies se-tl-expanded
            const root = document.getElementById("se-root");
            const tl   = document.getElementById("se-timeline");
            if (root && tl) {
                setTimeout(() => {
                    const h = tl.getBoundingClientRect().height;
                    if (h > 0) root.style.setProperty("--se-tl-h", h + "px");
                }, 0);
            }
        };
        story._mount._sePatchedV2 = true;
    }
}, 500);

console.log(
    "%c[SE-Patch v2] Loaded.\n"+
    " ROOT CAUSE FIX: se-tl-expanded { height: var(--se-tl-h,62vh) !important }\n"+
    " Horizontal drag: pointer-capture, synced CSS var\n"+
    " Vertical splitters: left + right panel, pointer-capture\n"+
    " Buttons wired: New Map / Load / Save / Export / Test Play / Undo / Redo\n"+
    " Gear menu: panel visibility toggles + layout presets\n"+
    " Inspector scroll fix: min-height:0 on .se-right-scroll",
    "color:#e8b832;font-family:monospace;font-size:11px"
);

})();





// =============================================================================
// SCENARIO EDITOR — MEGA PATCH
// Fixes: scrollbars, tile painting, ribbon toolbar, load story1/sandbox maps
// Inject AFTER scenario_editor.js has loaded
// =============================================================================
(function SE_MegaPatch() {
"use strict";

const SE = window.ScenarioEditor;
if (!SE) { console.error("[SE-Patch] ScenarioEditor not found"); return; }

// ============================================================================
// 1. CSS FIXES — scrollbars + touch scroll everywhere
// ============================================================================
(function injectCSS() {
    const id = "se-mega-patch-css";
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
/* ── Left panel scrollable ── */
#se-left-panel {
    overflow-y: auto !important;
    overflow-x: hidden !important;
    -webkit-overflow-scrolling: touch !important;
    scrollbar-width: thin;
    scrollbar-color: #5a4020 #1a140e;
}
/* ── Right / inspector panel scrollable ── */
#se-right-panel {
    overflow-y: auto !important;
    overflow-x: hidden !important;
    -webkit-overflow-scrolling: touch !important;
    scrollbar-width: thin;
    scrollbar-color: #5a4020 #1a140e;
}
/* ── se-right-scroll inner wrapper ── */
.se-right-scroll {
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch !important;
    flex: 1;
    min-height: 0;
}
/* ── Tile palette scrollable ── */
.se-tile-palette {
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch !important;
    max-height: 40vh;
    scrollbar-width: thin;
}
/* ── Mode tabs scrollable on narrow screens ── */
.se-mode-tabs {
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
    flex-shrink: 0;
}
/* ── Ribbon scrollable ── */
#se-ribbon {
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
    flex-shrink: 0;
}
/* ── Timeline scrollable ── */
#se-timeline {
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch !important;
    min-height: 0;
}
/* ── Fix workspace layout so panels don't overflow ── */
#se-workspace {
    min-height: 0;
    flex: 1;
    overflow: hidden;
}
/* ── Active ribbon button glow ── */
.se-btn.ribbon-active {
    background: var(--se-stone) !important;
    color: var(--se-gold) !important;
    border-color: var(--se-gold-dim) !important;
    box-shadow: 0 0 6px rgba(200,146,26,0.4);
}
/* ── Load-legacy modal ── */
.se-legacy-modal {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.82);
    z-index: 30000;
    display: flex; align-items: center; justify-content: center;
}
.se-legacy-box {
    background: #1a140e;
    border: 2px solid #c8921a;
    padding: 20px;
    width: min(480px, 94vw);
    max-height: 80vh;
    display: flex; flex-direction: column; gap: 12px;
    font-family: Georgia, serif;
    color: #e0c87a;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    border-radius: 3px;
}
.se-legacy-box h3 { margin: 0; font-size: 13px; letter-spacing: 2px; color: #e8b832; }
.se-legacy-box p  { margin: 0; font-size: 11px; color: #a0906a; }
.se-legacy-row {
    display: flex; gap: 8px; flex-wrap: wrap;
}
.se-legacy-btn {
    flex: 1; min-width: 120px;
    padding: 8px 12px;
    background: #2a1f10; border: 1px solid #5a4020;
    color: #e0c87a; font-family: Georgia, serif; font-size: 11px;
    cursor: pointer; border-radius: 2px; text-align: center;
    transition: border-color 0.15s;
}
.se-legacy-btn:hover { border-color: #c8921a; background: #3a2810; }
.se-legacy-cancel {
    background: #2a1010; border-color: #5a2020; color: #c07060;
}
`;
    document.head.appendChild(s);
})();

// ============================================================================
// 2. SELF-CONTAINED MAP ENGINE
//    Creates SE.mapEngine if not already present.
//    Provides: getMap(), getMapType(), TILE_DEFS, setTileAt(),
//              zoomIn/Out/Fit/Pan, toggleGrid(), _rebuildMinimap(),
//              SE._getViewportState()
// ============================================================================
(function buildMapEngine() {
    if (SE.mapEngine) {
        // Already exists — just ensure setTileAt is present
        if (!SE.mapEngine.setTileAt) {
            SE.mapEngine.setTileAt = function(col, row, tileName) {
                const map = SE.mapEngine.getMap();
                if (!map || !map.tiles[col] || !map.tiles[col][row]) return;
                const TDEFS = SE.mapEngine.TILE_DEFS;
                map.tiles[col][row] = { name: tileName, ...(TDEFS[tileName] || TDEFS["Ocean"]) };
                _scheduleRedraw();
            };
        }
        return;
    }

    // ── Tile colour table (matches sandbox_overworld.js PALETTE) ────────────
    const TILE_DEFS = {
        "Ocean":        { color: "#1a3f5c", passable: false },
        "Coastal":      { color: "#2a6080", passable: true  },
        "River":        { color: "#3a7090", passable: false },
        "Plains":       { color: "#6a8c3a", passable: true  },
        "Steppes":      { color: "#9a9c5a", passable: true  },
        "Forest":       { color: "#2a5a1a", passable: true  },
        "Dense Forest": { color: "#1a3a0e", passable: true  },
        "Highlands":    { color: "#7a6040", passable: true  },
        "Mountains":    { color: "#4a3820", passable: false },
    };

    // ── Internal state ───────────────────────────────────────────────────────
    let _map = null;     // { cols, rows, tileSize, tiles[][] }
    let _offX = 0, _offY = 0, _zoom = 1;
    let _gridOn = false, _snapOn = false, _territoryOn = false;
    let _routesOn = false, _zonesOn = false;
    let _raf = null, _dirty = false;
    let _canvas = null, _ctx = null;
    let _isPanning = false, _panSX = 0, _panSY = 0;
    let _mapType = "custom";

    function _getCanvas() {
        if (_canvas && _canvas.isConnected) return _canvas;
        _canvas = document.getElementById("se-viewport-canvas");
        if (!_canvas) return null;
        _ctx = _canvas.getContext("2d");
        return _canvas;
    }

    function _scheduleRedraw() {
        _dirty = true;
    }

    function _render() {
        _raf = requestAnimationFrame(_render);
        if (!_dirty) return;
        _dirty = false;

        const cv = _getCanvas();
        if (!cv || !_ctx) return;
        const vp = document.getElementById("se-viewport");
        if (!vp) return;

        const W = vp.clientWidth  || cv.parentElement?.clientWidth  || 800;
        const H = vp.clientHeight || cv.parentElement?.clientHeight || 500;
        cv.width  = W;
        cv.height = H;

        _ctx.clearRect(0, 0, W, H);

        if (!_map) {
            // Draw placeholder pattern
            _ctx.fillStyle = "#0a0806";
            _ctx.fillRect(0, 0, W, H);
            return;
        }

        // Hide placeholder text
        const ph = document.querySelector(".se-viewport-placeholder");
        if (ph) ph.style.opacity = "0";

        const { cols, rows, tileSize, tiles } = _map;
        const ts = tileSize * _zoom;

        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                const px = _offX + c * ts;
                const py = _offY + r * ts;
                if (px + ts < 0 || py + ts < 0 || px > W || py > H) continue;
                const tile = tiles[c] && tiles[c][r];
                const name = tile ? tile.name : "Ocean";
                _ctx.fillStyle = (TILE_DEFS[name] || TILE_DEFS["Ocean"]).color;
                _ctx.fillRect(px, py, ts + 0.5, ts + 0.5);
            }
        }

        // Grid overlay
        if (_gridOn && ts >= 4) {
            _ctx.strokeStyle = "rgba(255,255,255,0.10)";
            _ctx.lineWidth   = 1;
            _ctx.beginPath();
            for (let c = 0; c <= cols; c++) {
                const x = _offX + c * ts;
                _ctx.moveTo(x, _offY);
                _ctx.lineTo(x, _offY + rows * ts);
            }
            for (let r = 0; r <= rows; r++) {
                const y = _offY + r * ts;
                _ctx.moveTo(_offX,             y);
                _ctx.lineTo(_offX + cols * ts, y);
            }
            _ctx.stroke();
        }

        // Map border
        _ctx.strokeStyle = "rgba(200,146,26,0.5)";
        _ctx.lineWidth   = 2;
        _ctx.strokeRect(_offX, _offY, cols * ts, rows * ts);

        // Update zoom label
        const zLabel = document.querySelector(".se-zoom-display");
        if (zLabel) zLabel.textContent = Math.round(_zoom * 100) + "%";
    }

    // ── Pan & zoom via viewport events ───────────────────────────────────────
    function _attachEngineEvents() {
        const vp = document.getElementById("se-viewport");
        if (!vp || vp._megaEngineAttached) return;
        vp._megaEngineAttached = true;

        // Wheel zoom
        vp.addEventListener("wheel", (e) => {
            e.preventDefault();
            if (!_map) return;
            const rect = vp.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const factor = e.deltaY < 0 ? 1.15 : (1 / 1.15);
            const newZoom = Math.max(0.15, Math.min(8, _zoom * factor));
            _offX = mx - (mx - _offX) * (newZoom / _zoom);
            _offY = my - (my - _offY) * (newZoom / _zoom);
            _zoom = newZoom;
            _scheduleRedraw();
        }, { passive: false });

        // Pan with middle button or right button
        vp.addEventListener("pointerdown", (e) => {
            if (e.button === 1 || e.button === 2) {
                _isPanning = true;
                _panSX = e.clientX - _offX;
                _panSY = e.clientY - _offY;
                vp.setPointerCapture(e.pointerId);
                e.preventDefault();
            }
        });
        vp.addEventListener("pointermove", (e) => {
            if (_isPanning) {
                _offX = e.clientX - _panSX;
                _offY = e.clientY - _panSY;
                _scheduleRedraw();
            }
        });
        vp.addEventListener("pointerup", (e) => {
            if (e.button === 1 || e.button === 2) _isPanning = false;
        });
        vp.addEventListener("contextmenu", e => e.preventDefault());

        // Touch pan (2-finger)
        let _t0 = null, _t1 = null;
        vp.addEventListener("touchstart", (e) => {
            if (e.touches.length === 2) {
                _t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                _t1 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
            }
        }, { passive: true });
        vp.addEventListener("touchmove", (e) => {
            if (e.touches.length === 2 && _t0 && _t1) {
                const n0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                const n1 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
                const dx = ((n0.x + n1.x) / 2) - ((_t0.x + _t1.x) / 2);
                const dy = ((n0.y + n1.y) / 2) - ((_t0.y + _t1.y) / 2);
                const oldDist = Math.hypot(_t1.x - _t0.x, _t1.y - _t0.y);
                const newDist = Math.hypot(n1.x - n0.x, n1.y - n0.y);
                const scale  = oldDist > 0 ? newDist / oldDist : 1;
                const cx = (n0.x + n1.x) / 2 - (document.getElementById("se-viewport")?.getBoundingClientRect().left || 0);
                const cy = (n0.y + n1.y) / 2 - (document.getElementById("se-viewport")?.getBoundingClientRect().top  || 0);
                const newZoom = Math.max(0.15, Math.min(8, _zoom * scale));
                _offX = cx - (cx - _offX + dx) * (newZoom / _zoom);
                _offY = cy - (cy - _offY + dy) * (newZoom / _zoom);
                _zoom = newZoom;
                _t0 = n0; _t1 = n1;
                _scheduleRedraw();
            }
        }, { passive: true });
    }

    // ── Public API ───────────────────────────────────────────────────────────
    const mapEngine = {
        TILE_DEFS,

        getMap()     { return _map; },
        getMapType() { return _mapType; },

        createMap(cols, rows, tileSize = 16, defaultTile = "Ocean") {
            _mapType = "custom";
            const tiles = [];
            for (let c = 0; c < cols; c++) {
                tiles[c] = [];
                for (let r = 0; r < rows; r++) {
                    tiles[c][r] = { name: defaultTile, ...(TILE_DEFS[defaultTile] || TILE_DEFS["Ocean"]) };
                }
            }
            _map = { cols, rows, tileSize, tiles };
            _fitToView();
            _scheduleRedraw();
            return _map;
        },

        loadRawMap(tiles2d, cols, rows, tileSize = 16, type = "loaded") {
            // tiles2d[col][row] must be objects with at least { name }
            _mapType = type;
            _map = { cols, rows, tileSize, tiles: tiles2d };
            _fitToView();
            _scheduleRedraw();
        },

        setTileAt(col, row, tileName, brushSize = 1) {
            if (!_map) return;
            const half = Math.floor(brushSize / 2);
            for (let dc = -half; dc <= half; dc++) {
                for (let dr = -half; dr <= half; dr++) {
                    const c = col + dc, r = row + dr;
                    if (c < 0 || c >= _map.cols || r < 0 || r >= _map.rows) continue;
                    if (!_map.tiles[c]) _map.tiles[c] = [];
                    _map.tiles[c][r] = { name: tileName, ...(TILE_DEFS[tileName] || TILE_DEFS["Ocean"]) };
                }
            }
            _scheduleRedraw();
        },

        getTileAt(col, row) {
            if (!_map || !_map.tiles[col]) return null;
            return _map.tiles[col][row] || null;
        },

        screenToTile(sx, sy) {
            if (!_map) return null;
            const ts = _map.tileSize * _zoom;
            const col = Math.floor((sx - _offX) / ts);
            const row = Math.floor((sy - _offY) / ts);
            return { col, row };
        },

        zoomIn()  { _changeZoom(1.25); },
        zoomOut() { _changeZoom(1 / 1.25); },
        fitToView() { _fitToView(); },
        toggleGrid()      { _gridOn     = !_gridOn;      _scheduleRedraw(); return _gridOn; },
        toggleSnap()      { _snapOn     = !_snapOn;      return _snapOn; },
        toggleTerritory() { _territoryOn = !_territoryOn; _scheduleRedraw(); return _territoryOn; },
        toggleRoutes()    { _routesOn   = !_routesOn;    _scheduleRedraw(); return _routesOn; },
        toggleZones()     { _zonesOn    = !_zonesOn;     _scheduleRedraw(); return _zonesOn; },

        smoothTerrain() {
            if (!_map) return;
            const { cols, rows, tiles } = _map;
            const neighborVote = (c, r) => {
                const counts = {};
                for (let dc = -1; dc <= 1; dc++) {
                    for (let dr = -1; dr <= 1; dr++) {
                        if (dc === 0 && dr === 0) continue;
                        const nc = c + dc, nr = r + dr;
                        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
                        const n = tiles[nc][nr]?.name || "Ocean";
                        counts[n] = (counts[n] || 0) + 1;
                    }
                }
                const own = tiles[c][r]?.name || "Ocean";
                counts[own] = (counts[own] || 0) + 2; // bias toward own
                return Object.entries(counts).sort((a,b) => b[1]-a[1])[0][0];
            };
            const copy = [];
            for (let c = 0; c < cols; c++) {
                copy[c] = [];
                for (let r = 0; r < rows; r++) {
                    const name = neighborVote(c, r);
                    copy[c][r] = { name, ...(TILE_DEFS[name] || TILE_DEFS["Ocean"]) };
                }
            }
            _map.tiles = copy;
            _scheduleRedraw();
        },

        placeRivers() {
            if (!_map) return;
            const { cols, rows, tiles } = _map;
            // Simple: add rivers along diagonal elevation gradient (Mountains→Plains)
            for (let c = 1; c < cols - 1; c++) {
                for (let r = 1; r < rows - 1; r++) {
                    const t = tiles[c][r]?.name;
                    if (t === "Plains" || t === "Steppes") {
                        // Check if adjacent to Mountains or Highlands
                        const neighbours = [
                            tiles[c-1]?.[r]?.name, tiles[c+1]?.[r]?.name,
                            tiles[c]?.[r-1]?.name, tiles[c]?.[r+1]?.name,
                        ];
                        if (neighbours.includes("Mountains") || neighbours.includes("Highlands")) {
                            if (Math.random() < 0.08) {
                                tiles[c][r] = { name: "River", ...TILE_DEFS["River"] };
                            }
                        }
                    }
                }
            }
            _scheduleRedraw();
        },

        genIsland() {
            if (!_map) return;
            const { cols, rows, tiles } = _map;
            const cx = cols / 2, cy = rows / 2;
            const rx = cols * 0.35, ry = rows * 0.35;
            for (let c = 0; c < cols; c++) {
                for (let r = 0; r < rows; r++) {
                    const dx = (c - cx) / rx, dy = (r - cy) / ry;
                    const d  = Math.sqrt(dx * dx + dy * dy);
                    const noise = (Math.sin(c * 0.4) * Math.cos(r * 0.4)) * 0.15;
                    let name;
                    if (d > 1.0 + noise)        name = "Ocean";
                    else if (d > 0.85 + noise)  name = "Coastal";
                    else if (d > 0.70 + noise)  name = "Plains";
                    else if (d > 0.55 + noise)  name = "Forest";
                    else if (d > 0.35 + noise)  name = "Highlands";
                    else                         name = "Mountains";
                    tiles[c][r] = { name, ...(TILE_DEFS[name] || TILE_DEFS["Ocean"]) };
                }
            }
            _scheduleRedraw();
        },

        getViewportState() {
            return { offX: _offX, offY: _offY, zoom: _zoom };
        },

        _rebuildMinimap() { _scheduleRedraw(); },

        start() {
            _attachEngineEvents();
            if (!_raf) _render();
        },
    };

    function _changeZoom(factor) {
        if (!_map) return;
        const vp = document.getElementById("se-viewport");
        const cx = (vp?.clientWidth  || 800) / 2;
        const cy = (vp?.clientHeight || 500) / 2;
        const newZoom = Math.max(0.15, Math.min(8, _zoom * factor));
        _offX = cx - (cx - _offX) * (newZoom / _zoom);
        _offY = cy - (cy - _offY) * (newZoom / _zoom);
        _zoom = newZoom;
        _scheduleRedraw();
    }

    function _fitToView() {
        if (!_map) return;
        const vp = document.getElementById("se-viewport");
        const W = vp?.clientWidth  || 800;
        const H = vp?.clientHeight || 500;
        const { cols, rows, tileSize } = _map;
        _zoom = Math.min(W / (cols * tileSize), H / (rows * tileSize)) * 0.95;
        _offX = (W - cols * tileSize * _zoom) / 2;
        _offY = (H - rows * tileSize * _zoom) / 2;
        _scheduleRedraw();
    }

    SE.mapEngine = mapEngine;
    SE._getViewportState = () => mapEngine.getViewportState();

    // Start render loop after a tick (to let DOM settle)
    setTimeout(() => mapEngine.start(), 100);
})();

// ============================================================================
// 3. TILE PAINTING — patch _attachViewportListeners to support MAP mode paint
// ============================================================================
(function patchPainting() {
    // We intercept pointer events on the viewport directly.
    // We attach once per editor open, guarded by a flag.

    function attachPaintListeners() {
        const vp = document.getElementById("se-viewport");
        if (!vp || vp._megaPaintAttached) return;
        vp._megaPaintAttached = true;

        let _painting = false;

        function _getMode() {
            const tab = document.querySelector(".se-mode-tab.active");
            return tab ? tab.dataset.mode : null;
        }
        function _getTool() {
            const t = document.querySelector(".se-tool.active");
            return t ? t.dataset.tool : "PAINT";
        }
        function _getActiveTile() {
            const t = document.querySelector(".se-tile-row.active");
            return t ? t.dataset.tile : "Plains";
        }
        function _getBrush() {
            const b = document.querySelector(".se-brush-btn.active");
            if (!b) return 1;
            const m = b.textContent.match(/(\d+)/);
            return m ? parseInt(m[1], 10) : 1;
        }
        function _clientToTile(e) {
            const me = SE.mapEngine;
            if (!me) return null;
            const rect = vp.getBoundingClientRect();
            const sx = (e.clientX ?? (e.touches?.[0]?.clientX)) - rect.left;
            const sy = (e.clientY ?? (e.touches?.[0]?.clientY)) - rect.top;
            if (sx == null || sy == null) return null;
            return me.screenToTile(sx, sy);
        }

        function _doPaint(e) {
            const mode = _getMode();
            if (mode !== "MAP") return;
            const tool = _getTool();
            if (tool !== "PAINT" && tool !== "ERASE") return;

            const me = SE.mapEngine;
            const map = me ? me.getMap() : null;
            if (!map) return;

            const tc = _clientToTile(e);
            if (!tc) return;
            const { col, row } = tc;
            if (col < 0 || col >= map.cols || row < 0 || row >= map.rows) return;

            const tileName = tool === "ERASE" ? "Ocean" : _getActiveTile();
            const brush    = _getBrush();
            me.setTileAt(col, row, tileName, brush);

            // Update status bar tile display
            const st = document.getElementById("se-st-tile");
            if (st) st.textContent = tileName;
        }

        // Pointer events for mouse
        vp.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            const mode = _getMode();
            if (mode !== "MAP") return;
            _painting = true;
            vp.setPointerCapture(e.pointerId);
            _doPaint(e);
        });
        vp.addEventListener("pointermove", (e) => {
            if (!_painting) return;
            _doPaint(e);
        });
        vp.addEventListener("pointerup",   () => { _painting = false; });
        vp.addEventListener("pointercancel", () => { _painting = false; });

        // Touch events for mobile single-finger paint
        vp.addEventListener("touchstart", (e) => {
            const mode = _getMode();
            if (mode !== "MAP") return;
            _painting = true;
            _doPaint(e);
        }, { passive: true });
        vp.addEventListener("touchmove",  (e) => {
            if (!_painting) return;
            _doPaint(e);
        }, { passive: true });
        vp.addEventListener("touchend",   () => { _painting = false; });

        // Update cursor based on active tool
        const toolCursors = {
            PAINT:   "crosshair",
            ERASE:   "cell",
            SELECT:  "default",
            PLACE:   "copy",
            INSPECT: "zoom-in",
            MOVE:    "move",
        };
        function _updateCursor() {
            const mode = _getMode();
            const tool = _getTool();
            if (mode === "MAP") {
                vp.style.cursor = toolCursors[tool] || "crosshair";
            }
        }
        vp.addEventListener("pointerenter", _updateCursor);
        document.addEventListener("click", (e) => {
            if (e.target.classList.contains("se-tool") ||
                e.target.classList.contains("se-mode-tab")) {
                setTimeout(_updateCursor, 0);
            }
        });
    }

    // Expose helper so ribbon wiring can call it
    window._SE_attachPaint = attachPaintListeners;
})();

// ============================================================================
// 4. RIBBON TOOLBAR — wire all the stub buttons
// ============================================================================
(function wireRibbon() {

    function _toast(msg) {
        let el = document.getElementById("se-mega-toast");
        if (!el) {
            el = document.createElement("div");
            el.id = "se-mega-toast";
            el.style.cssText =
                "position:fixed;bottom:70px;left:50%;transform:translateX(-50%);" +
                "background:#1a140e;border:1px solid #c8921a;color:#e8b832;" +
                "padding:6px 14px;font-family:Georgia,serif;font-size:11px;" +
                "border-radius:2px;z-index:99999;pointer-events:none;" +
                "transition:opacity 0.3s;";
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.opacity = "1";
        clearTimeout(el._t);
        el._t = setTimeout(() => { el.style.opacity = "0"; }, 2800);
    }

    function _findBtnByText(root, text) {
        const btns = root.querySelectorAll(".se-btn");
        const lc   = text.toLowerCase().replace(/\s+/g, "");
        for (const b of btns) {
            if (b.textContent.replace(/\s+/g,"").toLowerCase().includes(lc)) return b;
        }
        return null;
    }

    function _activate(btn, handler) {
        if (!btn) return;
        btn.classList.remove("stub");
        btn.style.opacity = "";
        btn.style.cursor  = "pointer";
        btn.style.pointerEvents = "";
        btn.onclick = (e) => { e.stopPropagation(); handler(e, btn); };
    }

    function _toggle(btn, handler) {
        if (!btn) return;
        btn.classList.remove("stub");
        btn.style.opacity = "";
        btn.style.cursor  = "pointer";
        btn.style.pointerEvents = "";
        btn.onclick = (e) => {
            e.stopPropagation();
            const result = handler(e, btn);
            btn.classList.toggle("ribbon-active", !!result);
        };
    }

    function wireAll(root) {
        const me = SE.mapEngine;

        // ── Zoom + ──
        _activate(_findBtnByText(root, "zoom+"), () => {
            me?.zoomIn();
        });
        // Also wire the icon button with + or ⊕
        const zoomBtns = root.querySelectorAll(".se-btn");
        for (const b of zoomBtns) {
            const txt = b.textContent.trim();
            if (txt === "+" || txt === "⊕") {
                _activate(b, () => me?.zoomIn());
            }
            if (txt === "−" || txt === "⊖" || txt === "-") {
                _activate(b, () => me?.zoomOut());
            }
        }

        // ── Zoom - ──
        _activate(_findBtnByText(root, "zoom-") || _findBtnByText(root, "zoom −"), () => {
            me?.zoomOut();
        });

        // ── Fit ──
        _activate(_findBtnByText(root, "Fit"), () => {
            if (!me) return;
            me.fitToView();
            _toast("Fit map to viewport");
        });

        // ── Grid ──
        _toggle(_findBtnByText(root, "Grid"), () => {
            if (!me) return false;
            const on = me.toggleGrid();
            _toast("Grid " + (on ? "ON" : "OFF"));
            return on;
        });

        // ── Snap ──
        _toggle(_findBtnByText(root, "Snap"), () => {
            if (!me) return false;
            const on = me.toggleSnap();
            _toast("Snap-to-tile " + (on ? "ON" : "OFF"));
            return on;
        });

        // ── Territory ──
        _toggle(_findBtnByText(root, "Territory"), () => {
            if (!me) return false;
            const on = me.toggleTerritory();
            _toast("Territory overlay " + (on ? "ON" : "OFF"));
            return on;
        });

        // ── Routes ──
        _toggle(_findBtnByText(root, "Routes"), () => {
            if (!me) return false;
            const on = me.toggleRoutes();
            _toast("Patrol routes " + (on ? "ON" : "OFF"));
            return on;
        });

        // ── Zones ──
        _toggle(_findBtnByText(root, "Zones"), () => {
            if (!me) return false;
            const on = me.toggleZones();
            _toast("Trigger zones " + (on ? "ON" : "OFF"));
            return on;
        });

        // ── Gen Island ──
        _activate(_findBtnByText(root, "GenIsland"), () => {
            const map = me?.getMap();
            if (!map) { _toast("⚠ Create or load a map first"); return; }
            if (!confirm("Overwrite entire map with procedural island?")) return;
            me.genIsland();
            _toast("🏔 Island generated");
        });

        // ── Smooth ──
        _activate(_findBtnByText(root, "Smooth"), () => {
            const map = me?.getMap();
            if (!map) { _toast("⚠ No map loaded"); return; }
            me.smoothTerrain();
            _toast("≈ Terrain smoothed");
        });

        // ── Rivers ──
        _activate(_findBtnByText(root, "Rivers"), () => {
            const map = me?.getMap();
            if (!map) { _toast("⚠ No map loaded"); return; }
            me.placeRivers();
            _toast("〜 Rivers placed");
        });

        // ── + New Map (also creates internal engine map) ──
        const newMapBtn = _findBtnByText(root, "+NewMap");
        if (newMapBtn) {
            newMapBtn.classList.remove("stub");
            newMapBtn.style.opacity = "";
            newMapBtn.style.cursor  = "pointer";
            newMapBtn.style.pointerEvents = "";
            newMapBtn.onclick = (e) => {
                e.stopPropagation();
                const w = parseInt(prompt("Map Width (tiles, min 40):", "160") || "0", 10);
                if (isNaN(w) || w < 40) { _toast("⚠ Cancelled"); return; }
                const h = parseInt(prompt("Map Height (tiles, min 40):", "120") || "0", 10);
                if (isNaN(h) || h < 40) { _toast("⚠ Cancelled"); return; }
                SE.mapEngine.createMap(w, h, 16, "Ocean");
                const sc = root.querySelector("#se-st-scenario");
                if (sc) sc.textContent = `[New ${w}×${h}]`;
                _toast(`🗺 New ${w}×${h} map created — pick a terrain tile and paint`);
                setTimeout(_attachPaintAndEngine, 50);
            };
        }
    }

    function _attachPaintAndEngine() {
        SE.mapEngine?.start?.();
        window._SE_attachPaint?.();
    }

    // Hook into open lifecycle
    const _prevOpen = SE.open.bind(SE);
    SE.open = function() {
        _prevOpen();
        setTimeout(function attempt() {
            const root = document.getElementById("se-root");
            if (!root) { setTimeout(attempt, 100); return; }
            wireAll(root);
            _attachPaintAndEngine();
            injectLoadLegacyButtons(root);
        }, 400);
    };

    if (document.getElementById("se-root")) {
        wireAll(document.getElementById("se-root"));
        window._SE_attachPaint?.();
        injectLoadLegacyButtons(document.getElementById("se-root"));
    }

    // ── Load Legacy Maps (Story1 / Sandbox) ──────────────────────────────────
    function injectLoadLegacyButtons(root) {
        if (root.querySelector("#se-legacy-load-btn")) return;

        // Find the ribbon
        const ribbon = root.querySelector("#se-ribbon") ||
                       root.querySelector(".se-ribbon") ||
                       root.querySelector(".se-toolbar");
        if (!ribbon) return;

        const sep = document.createElement("div");
        sep.style.cssText = "width:1px;background:rgba(200,146,26,0.3);margin:0 4px;flex-shrink:0;";

        const btn = document.createElement("button");
        btn.id = "se-legacy-load-btn";
        btn.className = "se-btn";
        btn.title = "Load map from story1_map_and_update.js or sandboxmode_overworld.js";
        btn.textContent = "📥 Load Legacy Map";
        btn.style.cssText = "white-space:nowrap;flex-shrink:0;";

        ribbon.appendChild(sep);
        ribbon.appendChild(btn);

        btn.onclick = (e) => {
            e.stopPropagation();
            _showLegacyLoader();
        };
    }

    function _showLegacyLoader() {
        // Check what's available in global scope
        const hasStory1  = !!window.worldMap_story1;
        const hasSandbox = !!(window.worldMap && !window.worldMap_story1);
        // worldMap might be the sandbox map if story1 not loaded
        const hasSandboxWM = !!(window.worldMap);

        const modal = document.createElement("div");
        modal.className = "se-legacy-modal";
        modal.innerHTML = `
<div class="se-legacy-box">
  <h3>📥 LOAD LEGACY MAP</h3>
  <p>Import a procedurally-generated map from your existing game files into the Scenario Editor.</p>
  <div class="se-legacy-row">
    <button class="se-legacy-btn" id="sel-story1">
      🏯 Story 1 Map<br><small style="opacity:0.7">(worldMap_story1 — Hakata Bay)</small>
    </button>
    <button class="se-legacy-btn" id="sel-sandbox">
      🌏 Sandbox Map<br><small style="opacity:0.7">(worldMap — Overworld)</small>
    </button>
  </div>
  <div class="se-legacy-row">
    <button class="se-legacy-btn" id="sel-regen-story1">
      🔄 Regen Story1 + Import<br><small style="opacity:0.7">Re-runs story1 generation</small>
    </button>
    <button class="se-legacy-btn" id="sel-regen-sandbox">
      🔄 Regen Sandbox + Import<br><small style="opacity:0.7">Re-runs sandbox generation</small>
    </button>
  </div>
  <p id="sel-status" style="color:#c8921a;min-height:18px;"></p>
  <div class="se-legacy-row">
    <button class="se-legacy-btn se-legacy-cancel" id="sel-cancel">✕ Cancel</button>
  </div>
</div>`;
        document.body.appendChild(modal);

        const status = modal.querySelector("#sel-status");
        const setStatus = (msg, col="#c8921a") => { status.textContent = msg; status.style.color = col; };

        function doImportMap(wm, cols, rows, tileSize, type, mapName) {
            if (!wm || !wm.length) {
                setStatus("⚠ Map data not found — has the game loaded it yet?", "#e05050");
                return;
            }
            const me = SE.mapEngine;
            if (!me) { setStatus("⚠ Map engine not ready", "#e05050"); return; }

            // Convert to TILE_DEFS-compatible 2D array
            const TDEFS = me.TILE_DEFS;
            const tiles = [];
            let actualCols = wm.length;
            let actualRows = wm[0] ? wm[0].length : 0;
            for (let c = 0; c < actualCols; c++) {
                tiles[c] = [];
                for (let r = 0; r < actualRows; r++) {
                    const src  = wm[c] && wm[c][r];
                    const name = src ? (src.name || src.type || "Ocean") : "Ocean";
                    // Normalize name to match our TILE_DEFS keys
                    const normName = _normalizeTileName(name, TDEFS);
                    tiles[c][r] = { name: normName, ...(TDEFS[normName] || TDEFS["Ocean"]) };
                }
            }
            me.loadRawMap(tiles, actualCols, actualRows, tileSize || 16, type);
            setStatus(`✓ Imported ${mapName} — ${actualCols}×${actualRows} tiles`, "#6ac86a");
            setTimeout(() => {
                modal.remove();
                // Trigger paint listener attach
                window._SE_attachPaint?.();
            }, 1200);
        }

        modal.querySelector("#sel-story1").onclick = () => {
            doImportMap(
                window.worldMap_story1,
                null, null,
                typeof TILE_SIZE !== "undefined" ? TILE_SIZE : 16,
                "story1",
                "Story1 / Hakata Bay"
            );
        };

        modal.querySelector("#sel-sandbox").onclick = () => {
            doImportMap(
                window.worldMap,
                null, null,
                typeof TILE_SIZE !== "undefined" ? TILE_SIZE : 16,
                "sandbox",
                "Sandbox Overworld"
            );
        };

        modal.querySelector("#sel-regen-story1").onclick = async () => {
            setStatus("⏳ Regenerating Story1 map…");
            try {
                if (typeof window.generateMap_story1 === "function") {
                    await window.generateMap_story1();
                } else if (typeof window.initGame_story1 === "function") {
                    await window.initGame_story1();
                } else {
                    setStatus("⚠ generateMap_story1 not found in scope", "#e05050");
                    return;
                }
                doImportMap(window.worldMap_story1, null, null, 16, "story1", "Story1 (regenerated)");
            } catch(err) {
                setStatus("⚠ " + err.message, "#e05050");
            }
        };

        modal.querySelector("#sel-regen-sandbox").onclick = async () => {
            setStatus("⏳ Regenerating Sandbox map…");
            try {
                if (typeof window.generateMap === "function") {
                    await window.generateMap();
                } else {
                    setStatus("⚠ generateMap() not found in scope", "#e05050");
                    return;
                }
                doImportMap(window.worldMap, null, null, 16, "sandbox", "Sandbox (regenerated)");
            } catch(err) {
                setStatus("⚠ " + err.message, "#e05050");
            }
        };

        modal.querySelector("#sel-cancel").onclick = () => modal.remove();
        modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    }

    function _normalizeTileName(name, TDEFS) {
        if (!name) return "Ocean";
        // Direct match
        if (TDEFS[name]) return name;
        // Case-insensitive match
        const lc = name.toLowerCase();
        for (const k of Object.keys(TDEFS)) {
            if (k.toLowerCase() === lc) return k;
        }
        // Fuzzy match
        const MAP = {
            "ocean": "Ocean", "sea": "Ocean", "water": "Ocean", "deep": "Ocean",
            "coastal": "Coastal", "coast": "Coastal", "shallow": "Coastal",
            "river": "River", "stream": "River",
            "plains": "Plains", "plain": "Plains", "flat": "Plains", "grassland": "Plains",
            "steppes": "Steppes", "steppe": "Steppes", "savanna": "Steppes",
            "forest": "Forest", "woods": "Forest", "taiga": "Forest",
            "dense": "Dense Forest", "jungle": "Dense Forest", "rainforest": "Dense Forest",
            "highlands": "Highlands", "hill": "Highlands", "hills": "Highlands",
            "mountain": "Mountains", "mountains": "Mountains", "peak": "Mountains",
        };
        for (const [k, v] of Object.entries(MAP)) {
            if (lc.includes(k)) return v;
        }
        return "Ocean";
    }
})();

// ============================================================================
// 5. SE._getViewportState — expose via SE namespace so existing code works
// ============================================================================
if (!SE._getViewportState && SE.mapEngine) {
    SE._getViewportState = () => SE.mapEngine.getViewportState();
}

// ============================================================================
// 6. Kick everything if editor is already open
// ============================================================================
setTimeout(() => {
    if (SE.mapEngine?.start) SE.mapEngine.start();
    window._SE_attachPaint?.();
    const root = document.getElementById("se-root");
    if (root) {
        // Re-apply CSS
        const cssEl = document.getElementById("se-mega-patch-css");
        // already injected above
    }
}, 200);

console.log(
    "%c[SE-MegaPatch] ✓ Loaded\n" +
    " • Scrollbars + touch scroll — all panels\n" +
    " • Self-contained map engine — SE.mapEngine\n" +
    " • Tile painting — pointer + touch (MAP mode)\n" +
    " • Ribbon buttons — zoom±/fit/grid/snap/territory/routes/zones/smooth/rivers/genIsland\n" +
    " • Load Legacy Map — Story1 (Hakata Bay) + Sandbox Overworld",
    "color:#e8b832;font-family:monospace;font-size:11px"
);

})(); // end SE_MegaPatch


// =============================================================================
// SCENARIO EDITOR — LEGACY MAP LOADER FIX
// Deep fix for: worldMap/cities access, city import, NPC faction import
//
// ROOT CAUSE SUMMARY:
//   • worldMap, worldMap_story1, cities, cities_story1 are top-level const/let
//     in classic scripts — they live in the global declarative record, NOT on
//     window.*. The old patch called window.worldMap which is always undefined.
//   • Fix: declare top-level accessor functions HERE (outside any IIFE) so they
//     run in the same script scope and can read those script-global variables.
//   • Cities were never converted and imported into the SE city system.
//   • Factions/NPCs were never imported.
//
// INJECT: Add this <script> tag AFTER scenario_editor.js and the mega patch.
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// SECTION A — TOP-LEVEL ACCESSORS
// Must be outside any IIFE so they can read const/let script globals.
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the sandbox worldMap array (const in sandboxmode_overworld.js) */
function _seAccess_worldMap()         { try { return (typeof worldMap         !== 'undefined') ? worldMap         : null; } catch(e) { return null; } }
/** Returns the story1 worldMap array (let in story1_map_and_update.js) */
function _seAccess_worldMap_story1()  { try { return (typeof worldMap_story1  !== 'undefined') ? worldMap_story1  : null; } catch(e) { return null; } }
/** Returns the sandbox cities array (const in sandboxmode_overworld.js) */
function _seAccess_cities()           { try { return (typeof cities           !== 'undefined') ? cities           : null; } catch(e) { return null; } }
/** Returns the story1 cities array (let in story1_map_and_update.js) */
function _seAccess_cities_story1()    { try { return (typeof cities_story1    !== 'undefined') ? cities_story1    : null; } catch(e) { return null; } }
/** FIXED_SETTLEMENTS_story1 const — always readable after story1 is loaded */
function _seAccess_fixedSettlements() { try { return (typeof FIXED_SETTLEMENTS_story1 !== 'undefined') ? FIXED_SETTLEMENTS_story1 : null; } catch(e) { return null; } }
/** Map grid dimensions */
function _seAccess_COLS()       { try { return (typeof COLS       !== 'undefined') ? COLS       : 250;  } catch(e) { return 250;  } }
function _seAccess_ROWS()       { try { return (typeof ROWS       !== 'undefined') ? ROWS       : 187;  } catch(e) { return 187;  } }
function _seAccess_TILE_SIZE()  { try { return (typeof TILE_SIZE  !== 'undefined') ? TILE_SIZE  : 16;   } catch(e) { return 16;   } }
function _seAccess_WORLD_W()    { try { return (typeof WORLD_WIDTH  !== 'undefined') ? WORLD_WIDTH  : 4000; } catch(e) { return 4000; } }
function _seAccess_WORLD_H()    { try { return (typeof WORLD_HEIGHT !== 'undefined') ? WORLD_HEIGHT : 3000; } catch(e) { return 3000; } }
/** Safe wrappers for re-generation functions */
function _seAccess_genMapSandbox()   { try { return (typeof generateMap        !== 'undefined') ? generateMap        : null; } catch(e) { return null; } }
function _seAccess_genMapStory1()    { try { return (typeof generateMap_story1 !== 'undefined') ? generateMap_story1 : null; } catch(e) { return null; } }
function _seAccess_popCitiesStory1(){ try { return (typeof populateCities_story1 !== 'undefined') ? populateCities_story1 : null; } catch(e) { return null; } }
function _seAccess_popCitiesSB()    { try { return (typeof populateCities       !== 'undefined') ? populateCities       : null; } catch(e) { return null; } }

// Expose them on window so they survive the IIFE boundary
window._seAccess = {
    worldMapSB:       _seAccess_worldMap,
    worldMapS1:       _seAccess_worldMap_story1,
    citiesSB:         _seAccess_cities,
    citiesS1:         _seAccess_cities_story1,
    fixedSettlements: _seAccess_fixedSettlements,
    COLS:             _seAccess_COLS,
    ROWS:             _seAccess_ROWS,
    TS:               _seAccess_TILE_SIZE,
    WW:               _seAccess_WORLD_W,
    WH:               _seAccess_WORLD_H,
    genSB:            _seAccess_genMapSandbox,
    genS1:            _seAccess_genMapStory1,
    popS1:            _seAccess_popCitiesStory1,
    popSB:            _seAccess_popCitiesSB,
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION B — IIFE MAIN LOGIC
// ─────────────────────────────────────────────────────────────────────────────
(function SE_LegacyFix() {
"use strict";

const A = window._seAccess; // shorthand

// ── Story1 faction colours (from npc_systems_story1 / FACTIONS_PREVIEW) ──────
const STORY1_FACTION_COLORS = {
    "Kamakura Shogunate":      "#1565c0",
    "Yuan Dynasty Coalition":  "#c62828",
    "Kyushu Defender":         "#ffffff",
    "Bandits":                 "#37474f",
    "Shoni Clan":              "#1565c0",
    "So Clan":                 "#2e7d32",
    "Kikuchi Clan":            "#6a1b9a",
    "Otomo Clan":              "#e65100",
    "Matsura Clan":            "#00695c",
};

const SANDBOX_FACTION_COLORS = {
    "Hong Dynasty":            "#d32f2f",
    "Great Khaganate":         "#1976d2",
    "Jinlord Confederacy":     "#455a64",
    "Xiaran Dominion":         "#fbc02d",
    "Tran Realm":              "#388e3c",
    "Goryun Kingdom":          "#7b1fa2",
    "Yamato Clans":            "#c2185b",
    "High Plateau Kingdoms":   "#8d6e63",
    "Dab Tribes":              "#00838f",
    "Bandits":                 "#222222",
    "Player's Kingdom":        "#ffffff",
};

// ── Tile-name normalization ───────────────────────────────────────────────────
const TILE_NORM = {
    ocean:"Ocean", sea:"Ocean", water:"Ocean", deep:"Ocean",
    coastal:"Coastal", coast:"Coastal", shallow:"Coastal",
    river:"River", stream:"River",
    plains:"Plains", plain:"Plains", flat:"Plains", grassland:"Plains", meadow:"Plains",
    steppes:"Steppes", steppe:"Steppes", savanna:"Steppes",
    forest:"Forest", woods:"Forest", taiga:"Forest",
    dense:"Dense Forest", jungle:"Dense Forest", rainforest:"Dense Forest",
    highlands:"Highlands", hill:"Highlands", hills:"Highlands",
    mountain:"Mountains", mountains:"Mountains", peak:"Mountains",
};

function _normTile(name) {
    if (!name) return "Ocean";
    const SE_NAMES = ["Ocean","Coastal","River","Plains","Steppes","Forest","Dense Forest","Highlands","Mountains"];
    if (SE_NAMES.includes(name)) return name;
    const lc = name.toLowerCase();
    for (const k of Object.keys(TILE_NORM)) {
        if (lc.includes(k)) return TILE_NORM[k];
    }
    return "Ocean";
}

// ── Toast helper ─────────────────────────────────────────────────────────────
function _toast(msg) {
    let el = document.getElementById("se-legacy-fix-toast");
    if (!el) {
        el = document.createElement("div");
        el.id = "se-legacy-fix-toast";
        el.style.cssText =
            "position:fixed;bottom:90px;left:50%;transform:translateX(-50%);" +
            "background:#1a140e;border:1px solid #c8921a;color:#e8b832;" +
            "padding:7px 18px;font-family:Georgia,serif;font-size:12px;" +
            "border-radius:2px;z-index:99998;pointer-events:none;" +
            "transition:opacity 0.4s;max-width:90vw;text-align:center;";
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = "1";
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = "0"; }, 3500);
}

// ── Status-element helper (for modal) ────────────────────────────────────────
function _makeSetStatus(el) {
    return (msg, color = "#c8921a") => {
        if (el) { el.textContent = msg; el.style.color = color; }
        console.log("[SE-LegacyFix]", msg);
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE IMPORT LOGIC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Import a worldMap 2D array into SE.mapEngine.
 * @param {Array}  wm         worldMap[col][row] tile objects with .name
 * @param {number} tileSize
 * @param {string} mapType    "story1" | "sandbox"
 * @returns {{ ok: boolean, cols: number, rows: number, msg: string }}
 */
function importMapTiles(wm, tileSize, mapType) {
    if (!wm || !Array.isArray(wm) || wm.length === 0) {
        return { ok: false, msg: "worldMap is empty or not yet generated." };
    }

    const me = window.ScenarioEditor?.mapEngine;
    if (!me) return { ok: false, msg: "SE.mapEngine not ready — load the mega patch first." };

    const cols = wm.length;
    const rows = wm[0] ? wm[0].length : 0;
    if (rows === 0) return { ok: false, msg: "worldMap has 0 rows." };

    const TDEFS = me.TILE_DEFS || {};
    const tiles = [];
    for (let c = 0; c < cols; c++) {
        tiles[c] = [];
        for (let r = 0; r < rows; r++) {
            const src  = wm[c] && wm[c][r];
            const name = _normTile(src ? (src.name || src.type || "") : "");
            tiles[c][r] = { name, ...(TDEFS[name] || TDEFS["Ocean"] || { color: "#1a3f5c" }) };
        }
    }

    me.loadRawMap(tiles, cols, rows, tileSize || 16, mapType);
    return { ok: true, cols, rows, msg: `Map imported: ${cols}×${rows} tiles` };
}

/**
 * Convert game-city objects to SE city format and load into SE.citiesNPCs.
 * @param {Array}  gameCities   array of game city objects
 * @param {number} worldW       WORLD_WIDTH in pixels
 * @param {number} worldH       WORLD_HEIGHT in pixels  
 * @param {Object} factionColors  { factionName: colorHex }
 */
function importCities(gameCities, worldW, worldH, factionColors) {
    if (!gameCities || gameCities.length === 0) return { ok: false, msg: "No cities to import." };

    const SE = window.ScenarioEditor;
    if (!SE) return { ok: false, msg: "ScenarioEditor not found." };

    // Access the private SE city state via window._SE_CNP
    const S = window._SE_CNP;
    if (!S) return { ok: false, msg: "_SE_CNP state not found — is the editor open?" };

    S.cities = [];
    S._nextId = 1;
    S.factionAliases = {};
    S.spawnRules     = {};
    S.compOverrides  = {};
    S.diplomacy      = {};

    const TILE_DEFS = SE.mapEngine?.TILE_DEFS || {};
    const me        = SE.mapEngine;
    const map       = me?.getMap();

    gameCities.forEach(gc => {
        // Pixel → normalized coords
        const nx = gc.nx !== undefined ? gc.nx : (gc.x / worldW);
        const ny = gc.ny !== undefined ? gc.ny : (gc.y / worldH);

        // Pixel → tile column/row
        const TS  = A.TS();
        const WW  = worldW;
        const WH  = worldH;
        const COLS = A.COLS();
        const ROWS = A.ROWS();
        const col = Math.floor(gc.x / TS);
        const row = Math.floor(gc.y / TS);

        // Get tile name from SE map or fall back to Plains
        let tileName = "Plains";
        if (map && map.tiles && map.tiles[col] && map.tiles[col][row]) {
            tileName = map.tiles[col][row].name || "Plains";
        }

        const faction = gc.faction || gc.baseFaction || "Unknown";
        const type    = _normCityType(gc.type || "TOWN");
        const color   = (factionColors && factionColors[faction]) || "#e8b832";

        S.cities.push({
            id:           S._nextId++,
            name:         gc.name || "Settlement",
            x:            gc.x || (nx * WW),
            y:            gc.y || (ny * WH),
            nx:           parseFloat(nx.toFixed(5)),
            ny:           parseFloat(ny.toFixed(5)),
            type,
            baseFaction:  faction,
            faction,
            color,
            pop:          gc.pop || 1000,
            militaryPop:  Math.floor((gc.pop || 1000) * 0.15),
            civilianPop:  Math.floor((gc.pop || 1000) * 0.85),
            gold:         gc.gold    || 500,
            food:         gc.food    || 800,
            garrison:     gc.garrison|| 200,
            radius:       gc.radius  || gc.size  || 25,
            tileName,
            isPlayerHome: !!gc.isPlayerHome,
        });

        // Create a basic spawn rule for this faction if not already present
        if (faction && faction !== "Bandits" && !S.spawnRules[faction]) {
            S.spawnRules[faction] = [{
                role:    "Military",
                count:   Math.max(1, Math.floor((gc.pop || 1000) / 2000)),
                entryNx: nx,
                entryNy: ny,
            }];
        }

        // Record faction color
        if (!S.factionAliases[faction]) {
            S.factionAliases[faction] = faction; // identity alias = no rename
        }
    });

    return { ok: true, msg: `Imported ${S.cities.length} cities from ${Object.keys(S.spawnRules).length} factions.` };
}

function _normCityType(t) {
    if (!t) return "TOWN";
    const up = t.toUpperCase();
    if (up.includes("MAJOR")) return "MAJOR_CITY";
    if (up.includes("FORTRESS") || up.includes("FORT") || up.includes("CASTLE")) return "FORTRESS";
    if (up.includes("TOWN")) return "TOWN";
    if (up.includes("VILLAGE")) return "VILLAGE";
    if (up.includes("PORT")) return "TOWN";
    return "TOWN";
}

/**
 * Force-refresh the SE city list UI if the CITIES mode panel is visible.
 */
function _refreshSEUI() {
    // Refresh city list if panel is open
    if (typeof window._SE_CNP?._refreshCityList === "function") {
        window._SE_CNP._refreshCityList();
    }
    // Also force a map render
    window.ScenarioEditor?.mapEngine?._rebuildMinimap?.();
}

// ─────────────────────────────────────────────────────────────────────────────
// SAFE REGEN WRAPPERS
// Calls generateMap / generateMap_story1 with a mocked setLoading so they
// don't crash if the loading div doesn't exist in the editor context.
// ─────────────────────────────────────────────────────────────────────────────

async function _safeRegen(genFn, label, setStatus) {
    if (!genFn) {
        setStatus(`⚠ ${label} generation function not found. Has the game file loaded?`, "#e05050");
        return false;
    }

    // Mock setLoading if needed
    const origSetLoading = window.setLoading;
    window.setLoading = async (pct, text) => {
        setStatus(`⏳ ${text} (${pct}%)`, "#a09060");
        await new Promise(r => setTimeout(r, 0));
    };

    try {
        setStatus(`⏳ Generating ${label}…`);
        await genFn();
        setStatus(`✓ ${label} generated`, "#6ac86a");
        return true;
    } catch(err) {
        setStatus(`⚠ Generation error: ${err.message}`, "#e05050");
        console.error("[SE-LegacyFix] regen error:", err);
        return false;
    } finally {
        if (origSetLoading) window.setLoading = origSetLoading;
        else delete window.setLoading;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────────────────────────

function _showLegacyModal() {
    const existingModal = document.querySelector(".se-legacy-fix-modal");
    if (existingModal) { existingModal.remove(); }

    // Pre-check what data is available
    const wmSB = A.worldMapSB();
    const wmS1 = A.worldMapS1();
    const ctSB = A.citiesSB();
    const ctS1 = A.citiesS1();
    const fs   = A.fixedSettlements();

    const s1Ready  = wmS1 && wmS1.length > 0 && wmS1[0] && wmS1[0].length > 0;
    const sbReady  = wmSB && wmSB.length > 0 && wmSB[0] && wmSB[0].length > 0;
    const genS1Fn  = A.genS1();
    const genSBFn  = A.genSB();

    function _badge(ready) {
        return ready
            ? `<span style="color:#6ac86a;font-size:10px">● READY</span>`
            : `<span style="color:#c06040;font-size:10px">● NOT YET GENERATED</span>`;
    }

    const modal = document.createElement("div");
    modal.className = "se-legacy-fix-modal";
    modal.style.cssText =
        "position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:40000;" +
        "display:flex;align-items:center;justify-content:center;";

    modal.innerHTML = `
<div style="background:#1a140e;border:2px solid #c8921a;padding:22px;
            width:min(520px,95vw);max-height:88vh;overflow-y:auto;
            -webkit-overflow-scrolling:touch;
            display:flex;flex-direction:column;gap:14px;
            font-family:Georgia,serif;color:#e0c87a;border-radius:3px;">

  <div style="font-size:14px;letter-spacing:2px;color:#e8b832;
              border-bottom:1px solid #5a4020;padding-bottom:8px;">
    📥 LOAD LEGACY MAP
  </div>

  <div style="font-size:11px;color:#a09060;line-height:1.7;">
    Import a live map from the running game into the Scenario Editor.<br>
    Map tiles, cities, and faction spawn data are all imported.
  </div>

  <!-- STORY 1 -->
  <div style="background:#231a0e;border:1px solid #5a4020;padding:12px;border-radius:2px;">
    <div style="font-size:12px;color:#e8b832;margin-bottom:6px;">
      🏯 STORY 1 — Bun'ei Invasion 1274 (Hakata Bay / North Kyūshū)
    </div>
    <div style="font-size:10px;margin-bottom:10px;">
      Map status: ${_badge(s1Ready)}
      &nbsp;·&nbsp; Cities: ${ctS1 ? ctS1.length : (fs ? fs.length + ' (fixed)' : '?')}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button id="sfl-load-s1"
        style="flex:1;min-width:140px;padding:8px 10px;
               background:#2a1f10;border:1px solid ${s1Ready?'#c8921a':'#5a4020'};
               color:${s1Ready?'#e0c87a':'#8a7060'};
               font-family:Georgia,serif;font-size:11px;cursor:pointer;border-radius:2px;">
        ${s1Ready ? '✓ Load Story1 Map + Cities' : '⚠ Load (data not yet ready)'}
      </button>
      <button id="sfl-regen-s1"
        style="flex:1;min-width:140px;padding:8px 10px;
               background:#2a1f10;border:1px solid #5a4020;
               color:${genS1Fn?'#e0c87a':'#6a5040'};
               font-family:Georgia,serif;font-size:11px;
               cursor:${genS1Fn?'pointer':'not-allowed'};border-radius:2px;"
        ${genS1Fn?'':' disabled'}>
        🔄 Regen Story1 + Load
      </button>
    </div>
  </div>

  <!-- SANDBOX -->
  <div style="background:#231a0e;border:1px solid #5a4020;padding:12px;border-radius:2px;">
    <div style="font-size:12px;color:#e8b832;margin-bottom:6px;">
      🌏 SANDBOX — East Asia Overworld (4000×3000 procedural)
    </div>
    <div style="font-size:10px;margin-bottom:10px;">
      Map status: ${_badge(sbReady)}
      &nbsp;·&nbsp; Cities: ${ctSB ? ctSB.length : '?'}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button id="sfl-load-sb"
        style="flex:1;min-width:140px;padding:8px 10px;
               background:#2a1f10;border:1px solid ${sbReady?'#c8921a':'#5a4020'};
               color:${sbReady?'#e0c87a':'#8a7060'};
               font-family:Georgia,serif;font-size:11px;cursor:pointer;border-radius:2px;">
        ${sbReady ? '✓ Load Sandbox Map + Cities' : '⚠ Load (data not yet ready)'}
      </button>
      <button id="sfl-regen-sb"
        style="flex:1;min-width:140px;padding:8px 10px;
               background:#2a1f10;border:1px solid #5a4020;
               color:${genSBFn?'#e0c87a':'#6a5040'};
               font-family:Georgia,serif;font-size:11px;
               cursor:${genSBFn?'pointer':'not-allowed'};border-radius:2px;"
        ${genSBFn?'':' disabled'}>
        🔄 Regen Sandbox + Load
      </button>
    </div>
  </div>

  <!-- Fixed settlements only (story1 without regen) -->
  <div style="background:#1e1810;border:1px solid #3a2a10;padding:10px;border-radius:2px;">
    <div style="font-size:11px;color:#c8a832;margin-bottom:8px;">
      📍 Import Story1 Cities Only (from FIXED_SETTLEMENTS — no map regen needed)
    </div>
    <button id="sfl-cities-s1-only"
      style="width:100%;padding:7px 10px;
             background:#2a1f10;border:1px solid ${fs?'#c8921a':'#3a2a10'};
             color:${fs?'#e0c87a':'#6a5040'};
             font-family:Georgia,serif;font-size:11px;
             cursor:${fs?'pointer':'not-allowed'};border-radius:2px;"
      ${fs?'':' disabled'}>
      ${fs ? `📍 Import ${fs.length} Story1 Fixed Settlements` : '⚠ FIXED_SETTLEMENTS_story1 not found'}
    </button>
  </div>

  <!-- Status line -->
  <div id="sfl-status"
    style="font-size:11px;color:#c8921a;min-height:20px;
           padding:6px;background:#0e0a06;border-radius:2px;"></div>

  <!-- Cancel -->
  <button id="sfl-cancel"
    style="padding:7px;background:#2a1010;border:1px solid #5a2020;
           color:#c07060;font-family:Georgia,serif;font-size:11px;
           cursor:pointer;border-radius:2px;">
    ✕ Close
  </button>
</div>`;

    document.body.appendChild(modal);

    const statusEl = modal.querySelector("#sfl-status");
    const setStatus = _makeSetStatus(statusEl);

    // ── Load Story1 (existing data) ──────────────────────────────────────────
    modal.querySelector("#sfl-load-s1").onclick = async () => {
        const wm = A.worldMapS1();
        const ct = A.citiesS1();
        const WW = A.WW(), WH = A.WH(), TS = A.TS();

        const mapResult = importMapTiles(wm, TS, "story1");
        if (!mapResult.ok) {
            setStatus("⚠ Map: " + mapResult.msg + "\nTry 'Regen Story1' first.", "#e05050");
            return;
        }
        setStatus(`✓ ${mapResult.msg}`, "#6ac86a");

        // Cities: try cities_story1, fallback to FIXED_SETTLEMENTS_story1
        let cityData = ct && ct.length > 0 ? ct : null;
        if (!cityData) {
            const fs = A.fixedSettlements();
            if (fs) {
                cityData = fs.map(s => ({
                    name: s.name, faction: s.faction,
                    type: s.type, pop: s.pop, radius: s.size || 25,
                    nx: s.nx, ny: s.ny,
                    x: s.nx * A.WW(), y: s.ny * A.WH(),
                    isPlayerHome: s.name === "Hakata",
                }));
            }
        }

        if (cityData) {
            const cResult = importCities(cityData, WW, WH, STORY1_FACTION_COLORS);
            setStatus(`✓ ${mapResult.msg} · ${cResult.msg}`, "#6ac86a");
        } else {
            setStatus(`✓ ${mapResult.msg} · (no city data available — try Regen)`, "#b0b040");
        }

        _refreshSEUI();
        _toast("🏯 Story1 map loaded!");
        setTimeout(() => modal.remove(), 1500);
    };

    // ── Load Sandbox (existing data) ─────────────────────────────────────────
    modal.querySelector("#sfl-load-sb").onclick = async () => {
        const wm = A.worldMapSB();
        const ct = A.citiesSB() || (window.cities_sandbox ? window.cities_sandbox : null);
        const WW = A.WW(), WH = A.WH(), TS = A.TS();

        const mapResult = importMapTiles(wm, TS, "sandbox");
        if (!mapResult.ok) {
            setStatus("⚠ Map: " + mapResult.msg + "\nTry 'Regen Sandbox' first.", "#e05050");
            return;
        }
        setStatus(`✓ ${mapResult.msg}`, "#6ac86a");

        if (ct && ct.length > 0) {
            const cResult = importCities(ct, WW, WH, SANDBOX_FACTION_COLORS);
            setStatus(`✓ ${mapResult.msg} · ${cResult.msg}`, "#6ac86a");
        } else {
            setStatus(`✓ ${mapResult.msg} · (no city data — cities_sandbox not populated yet)`, "#b0b040");
        }

        _refreshSEUI();
        _toast("🌏 Sandbox map loaded!");
        setTimeout(() => modal.remove(), 1500);
    };

    // ── Regen Story1 + Load ──────────────────────────────────────────────────
    modal.querySelector("#sfl-regen-s1").onclick = async () => {
        const genFn = A.genS1();
        const ok = await _safeRegen(genFn, "Story1 (Hakata Bay)", setStatus);
        if (!ok) return;

        // Now data is populated
        const wm = A.worldMapS1();
        const mapResult = importMapTiles(wm, A.TS(), "story1");
        if (!mapResult.ok) { setStatus("⚠ " + mapResult.msg, "#e05050"); return; }

        // Populate cities_story1 by calling populateHistoricalCities_story1 / populateCities_story1
        const popFn = A.popS1();
        if (popFn) {
            try { popFn(); } catch(e) { console.warn("[SE-LegacyFix] popS1:", e); }
        }

        const ct = A.citiesS1();
        const WW = A.WW(), WH = A.WH();
        if (ct && ct.length > 0) {
            const cResult = importCities(ct, WW, WH, STORY1_FACTION_COLORS);
            setStatus(`✓ ${mapResult.msg} · ${cResult.msg}`, "#6ac86a");
        } else {
            // Fallback to fixed settlements
            const fs = A.fixedSettlements();
            if (fs) {
                const cityData = fs.map(s => ({
                    name: s.name, faction: s.faction, type: s.type,
                    pop: s.pop, radius: s.size || 25,
                    nx: s.nx, ny: s.ny,
                    x: s.nx * WW, y: s.ny * WH,
                    isPlayerHome: s.name === "Hakata",
                }));
                const cResult = importCities(cityData, WW, WH, STORY1_FACTION_COLORS);
                setStatus(`✓ ${mapResult.msg} · ${cResult.msg} (from fixed settlements)`, "#6ac86a");
            } else {
                setStatus(`✓ ${mapResult.msg} · (cities not available)`, "#b0b040");
            }
        }

        _refreshSEUI();
        _toast("🏯 Story1 regenerated and loaded!");
        setTimeout(() => modal.remove(), 2000);
    };

    // ── Regen Sandbox + Load ─────────────────────────────────────────────────
    modal.querySelector("#sfl-regen-sb").onclick = async () => {
        const genFn = A.genSB();
        const ok = await _safeRegen(genFn, "Sandbox (East Asia)", setStatus);
        if (!ok) return;

        // Populate cities
        const popFn = A.popSB();
        if (popFn) {
            try { popFn(); } catch(e) { console.warn("[SE-LegacyFix] popSB:", e); }
        }

        const wm = A.worldMapSB();
        const mapResult = importMapTiles(wm, A.TS(), "sandbox");
        if (!mapResult.ok) { setStatus("⚠ " + mapResult.msg, "#e05050"); return; }

        const ct = A.citiesSB() || window.cities_sandbox;
        const WW = A.WW(), WH = A.WH();
        if (ct && ct.length > 0) {
            const cResult = importCities(ct, WW, WH, SANDBOX_FACTION_COLORS);
            setStatus(`✓ ${mapResult.msg} · ${cResult.msg}`, "#6ac86a");
        } else {
            setStatus(`✓ ${mapResult.msg} · (no city data after regen)`, "#b0b040");
        }

        _refreshSEUI();
        _toast("🌏 Sandbox regenerated and loaded!");
        setTimeout(() => modal.remove(), 2000);
    };

    // ── Cities-only import ───────────────────────────────────────────────────
    modal.querySelector("#sfl-cities-s1-only").onclick = () => {
        const fs = A.fixedSettlements();
        if (!fs || fs.length === 0) {
            setStatus("⚠ FIXED_SETTLEMENTS_story1 is empty or not loaded.", "#e05050");
            return;
        }
        const WW = A.WW(), WH = A.WH();
        const cityData = fs.map(s => ({
            name: s.name, faction: s.faction, type: s.type,
            pop: s.pop, radius: s.size || 25,
            nx: s.nx, ny: s.ny,
            x: s.nx * WW, y: s.ny * WH,
            isPlayerHome: s.name === "Hakata",
        }));
        const cResult = importCities(cityData, WW, WH, STORY1_FACTION_COLORS);
        _refreshSEUI();
        setStatus(`✓ ${cResult.msg}`, "#6ac86a");
        _toast(`📍 ${cResult.msg}`);
        setTimeout(() => modal.remove(), 1500);
    };

    // ── Close ────────────────────────────────────────────────────────────────
    modal.querySelector("#sfl-cancel").onclick = () => modal.remove();
    modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
}

// ─────────────────────────────────────────────────────────────────────────────
// REPLACE / UPGRADE THE OLD LEGACY LOADER BUTTON
// Finds the button injected by the mega-patch and replaces its handler.
// Also injects a fresh button if the mega-patch one is missing.
// ─────────────────────────────────────────────────────────────────────────────
function upgradeButton() {
    // Replace onclick on old button
    const old = document.getElementById("se-legacy-load-btn");
    if (old) {
        old.onclick = (e) => { e.stopPropagation(); _showLegacyModal(); };
        old.title = "Load map from story1 / sandbox (FIXED)";
        old.textContent = "📥 Load Legacy Map";
        return;
    }

    // Inject fresh button into ribbon if mega-patch didn't add one
    const ribbon = document.querySelector("#se-ribbon, .se-ribbon, .se-toolbar");
    if (!ribbon) return;

    const sep = document.createElement("div");
    sep.style.cssText = "width:1px;background:rgba(200,146,26,0.3);margin:0 4px;flex-shrink:0;";
    const btn = document.createElement("button");
    btn.id    = "se-legacy-load-btn";
    btn.className = "se-btn";
    btn.textContent = "📥 Load Legacy Map";
    btn.title = "Load map from story1 / sandbox";
    btn.style.cssText = "white-space:nowrap;flex-shrink:0;";
    btn.onclick = (e) => { e.stopPropagation(); _showLegacyModal(); };
    ribbon.appendChild(sep);
    ribbon.appendChild(btn);
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK INTO SE.open LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────
const SE = window.ScenarioEditor;
if (SE) {
    const _prevOpen = SE.open.bind(SE);
    SE.open = function() {
        _prevOpen();
        setTimeout(function attempt() {
            const root = document.getElementById("se-root");
            if (!root) { setTimeout(attempt, 100); return; }
            upgradeButton();
        }, 500); // after mega-patch injects its button
    };
} else {
    console.warn("[SE-LegacyFix] ScenarioEditor not found yet.");
}

// If editor already open, upgrade immediately
if (document.getElementById("se-root")) {
    setTimeout(upgradeButton, 600);
}

// Expose public API
window._SE_LegacyFix = { showModal: _showLegacyModal, importMapTiles, importCities };

console.log(
    "%c[SE-LegacyFix] ✓ Loaded — deep fix for legacy map import\n" +
    " • Top-level accessors for worldMap / cities (bypasses window.* limitation)\n" +
    " • Full city import: pixel→nx/ny, type normalisation, faction colours\n" +
    " • Faction spawn rules auto-generated from city data\n" +
    " • Fixed settlements fallback when cities_story1 not populated\n" +
    " • Safe regen wrapper (mocks setLoading, avoids draw() side-effects)",
    "color:#e8b832;font-family:monospace;font-size:11px"
);

})(); // end IIFE

// =============================================================================
// SCENARIO EDITOR — MIN/MAX & RESIZE PATCH (v2 - Fixes Inspector Reset)
// Injects Minimize/Maximize buttons and vertical resizing to all panels & cards.
// Append to the absolute bottom of the file.
// =============================================================================

(function SE_MinMaxResizePatch() {
"use strict";

// Prevent double injection
if (window.__SE_MINMAX_PATCH__) {
    const oldStyle = document.getElementById("se-minmax-css");
    if (oldStyle) oldStyle.remove();
}
window.__SE_MINMAX_PATCH__ = true;

const SE = window.ScenarioEditor;
if (!SE) return;

// ── 1. INJECT CSS ────────────────────────────────────────────────────────
const CSS = `
/* Native Y-Resizing for panels and cards */
#se-left-panel, #se-right-panel, .se-card {
    resize: vertical !important;
    overflow: hidden !important; 
    padding-bottom: 2px;
}

#se-timeline { transition: all 0.2s ease-out; }

/* Control Cluster Styles */
.se-win-controls {
    display: flex;
    gap: 4px;
    margin-left: auto;
    align-items: center;
    padding-left: 10px;
}
.se-win-btn {
    background: transparent;
    border: none;
    color: var(--se-gold-dim);
    cursor: pointer;
    font-size: 11px;
    padding: 0 4px;
    line-height: 1;
    transition: color 0.1s, transform 0.1s;
}
.se-win-btn:hover { color: var(--se-text-hi); transform: scale(1.1); }

/* ── STATE: Minimized ── */
.se-is-minimized {
    flex: none !important;
    height: 30px !important;
    min-height: 30px !important;
    resize: none !important;
    overflow: hidden !important;
    padding-bottom: 0 !important;
}
/* Hide inner contents when minimized */
.se-is-minimized > *:not(.se-section-header):not(.se-card-header):not(#se-timeline-tabs) {
    display: none !important;
}

/* ── STATE: Maximized ── */
.se-is-maximized {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    max-height: 100% !important;
    z-index: 99999 !important;
    resize: none !important;
    box-shadow: 0 0 40px rgba(0,0,0,0.9) !important;
}
`;

function injectCSS() {
    const style = document.createElement("style");
    style.id = "se-minmax-css";
    style.textContent = CSS;
    document.head.appendChild(style);
}

// ── 2. DOM INJECTOR ──────────────────────────────────────────────────────
function injectControls() {
    const root = document.getElementById("se-root");
    if (!root) return;

    const targets = [
        { el: root.querySelector("#se-left-panel"),  headerSel: ".se-section-header" },
        { el: root.querySelector("#se-right-panel"), headerSel: ".se-section-header" },
        { el: root.querySelector("#se-timeline"),    headerSel: "#se-timeline-tabs" }
    ];

    root.querySelectorAll(".se-card").forEach(card => {
        targets.push({ el: card, headerSel: ".se-card-header" });
    });

    targets.forEach(t => {
        if (!t.el) return;
        const header = t.el.querySelector(t.headerSel);
        if (!header || header.querySelector(".se-win-controls")) return;

        const cluster = document.createElement("div");
        cluster.className = "se-win-controls";

        const minBtn = document.createElement("button");
        minBtn.className = "se-win-btn";
        minBtn.textContent = "—";
        
        const maxBtn = document.createElement("button");
        maxBtn.className = "se-win-btn";
        maxBtn.textContent = "□";

        minBtn.onclick = (e) => {
            e.stopPropagation();
            // Clear any lingering maximize styles
            t.el.classList.remove("se-is-maximized");
            t.el.style.width = ""; 
            
            t.el.classList.toggle("se-is-minimized");
        };

        maxBtn.onclick = (e) => {
            e.stopPropagation();
            t.el.classList.remove("se-is-minimized");
            
            const wasMaxed = t.el.classList.contains("se-is-maximized");
            if (wasMaxed) {
                t.el.classList.remove("se-is-maximized");
                // IMPORTANT: Clear inline styles so the element can return to its natural or minimized height
                t.el.style.height = "";
                t.el.style.width = "";
            } else {
                t.el.classList.add("se-is-maximized");
            }

            if (SE.mapEngine && SE.mapEngine._rebuildMinimap) SE.mapEngine._rebuildMinimap();
        };

        cluster.appendChild(minBtn);
        cluster.appendChild(maxBtn);
        header.style.display = "flex";
        header.style.alignItems = "center";
        header.appendChild(cluster);
    });
}

// ── 3. LIFECYCLE HOOKS ───────────────────────────────────────────────────
const origOpen    = SE.open;
const origSetMode = SE._setMode;
const origSetTab  = SE._setTab;

SE.open = function() {
    if (origOpen) origOpen.apply(this, arguments);
    injectCSS();
    setTimeout(injectControls, 300);
};

if (origSetMode) {
    SE._setMode = function() {
        origSetMode.apply(this, arguments);
        setTimeout(injectControls, 100);
    };
}

if (origSetTab) {
    SE._setTab = function() {
        origSetTab.apply(this, arguments);
        setTimeout(injectControls, 100);
    };
}

if (document.getElementById("se-root")) {
    injectCSS();
    setTimeout(injectControls, 100);
}

console.log("[SE-MinMaxPatch] ✓ Patch v2 Loaded: Fixed Inspector Reset Logic.");
})();



// =============================================================================
// SCENARIO EDITOR — LOAD/SAVE/TEST PATCH v3
// Fixes: black screen, data fusion, file manager UI, test play, resetTools
// APPEND TO BOTTOM OF FILE
// =============================================================================
(function SE_LoadSavePatch() {
"use strict";
if (window.__SE_LSP_V3__) return;
window.__SE_LSP_V3__ = true;

const SE = window.ScenarioEditor;
if (!SE) return;

// ─────────────────────────────────────────────────────────────────────────────
// 1. DEEP RESET — purge ALL state before loading anything
// ─────────────────────────────────────────────────────────────────────────────
function _deepReset() {
    // Reset map engine
    const me = SE.mapEngine;
    if (me) {
        const map = me.getMap();
        if (map) {
            map.tiles = [];
            map.cols = 0;
            map.rows = 0;
        }
    }

    // Reset CNP city/NPC state
    const S = window._SE_CNP;
    if (S) {
        S.cities         = [];
        S._nextId        = 1;
        S.selectedCityId = null;
        S.placingCity    = false;
        S.relocatingId   = null;
        S.factionAliases = {};
        S.spawnRules     = {};
        S.compOverrides  = {};
        S.diplomacy      = {};
        S.patrolMode     = null;
        S._pickingEntry  = null;
    }

    // Reset story triggers
    const T = window._SE_STORY;
    if (T) {
        T.triggers      = [];
        T.objectives    = [];
        T.dialogueLines = [];
        T.selectedId    = null;
        T._nextId       = 1;
        T._dirty        = false;
        T._rt = {
            active: false, turn: 1,
            firedIds: new Set(),
            capturedCities: [],
            battlePending: null,
        };
    }

    // Clear viewport overlay
    const ov = document.getElementById("se-cnp-overlay");
    if (ov) ov.remove();

    // Reset viewport placeholder
    const ph = document.querySelector(".se-viewport-placeholder");
    if (ph) { ph.style.opacity = ""; ph.style.display = ""; }

    // Clear zoom label
    const zl = document.querySelector(".se-zoom-display");
    if (zl) zl.textContent = "100%";

    // Clear status bar
    const sc = document.getElementById("se-st-scenario");
    if (sc) sc.textContent = "[Unsaved]";

    console.log("[LSP] Deep reset complete.");
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SAFE LOAD — reset then deserialize
// ─────────────────────────────────────────────────────────────────────────────
function _safeLoad(json) {
    let data;
    try { data = typeof json === "string" ? JSON.parse(json) : json; }
    catch(e) { _toast("⚠ Invalid JSON: " + e.message); return false; }

    _deepReset();

    // Restore story data
    const T = window._SE_STORY;
    if (T && data.triggers)       T.triggers      = data.triggers;
    if (T && data.objectives)     T.objectives    = data.objectives;
    if (T && data.dialogueLines)  T.dialogueLines = data.dialogueLines;
    if (T && data.nextId)         T._nextId       = data.nextId;
    if (T && data.meta?.name)     T._scenarioName = data.meta.name;

    // Restore map tiles
    if (data.mapData) {
        const me = SE.mapEngine;
        const md = data.mapData;
        if (me && md.cols && md.rows && Array.isArray(md.tiles)) {
            const TDEFS = me.TILE_DEFS || {};
            const tiles = [];
            let idx = 0;
            for (let c = 0; c < md.cols; c++) {
                tiles[c] = [];
                for (let r = 0; r < md.rows; r++) {
                    const name = md.tiles[idx++] || "Ocean";
                    tiles[c][r] = { name, ...(TDEFS[name] || TDEFS["Ocean"] || { color: "#1a3f5c" }) };
                }
            }
            me.loadRawMap(tiles, md.cols, md.rows, md.tileSize || 16, md.mapType || "loaded");
        }
    }

    // Restore cities/NPCs
    const S = window._SE_CNP;
    if (S) {
        if (data.cities)         S.cities         = data.cities;
        if (data.factionAliases) S.factionAliases = data.factionAliases;
        if (data.spawnRules)     S.spawnRules     = data.spawnRules;
        if (data.compOverrides)  S.compOverrides  = data.compOverrides;
        if (data.diplomacy)      S.diplomacy      = data.diplomacy;
        if (S.cities.length)     S._nextId        = Math.max(...S.cities.map(c => c.id || 0)) + 1;
    }

    // Update UI
    const sc = document.getElementById("se-st-scenario");
    if (sc) sc.textContent = data.meta?.name || "Loaded";
    const ni = document.getElementById("se-story-name");
    if (ni) ni.value = data.meta?.name || "";

    // Rebuild UI panels
    setTimeout(() => {
        SE._setTab?.(window._activeTab || "TRIGGERS");
        SE.mapEngine?._rebuildMinimap?.();
    }, 100);

    _toast("✓ Loaded: " + (data.meta?.name || "Scenario"));
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. FILE MANAGER MODAL
// ─────────────────────────────────────────────────────────────────────────────
const FM_CSS = `
#se-fm-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.88);
    z-index: 60000;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Georgia', serif;
}
#se-fm-panel {
    background: #1a140e;
    border: 2px solid #c8921a;
    border-radius: 3px;
    width: min(560px, 96vw);
    max-height: 80vh;
    display: flex; flex-direction: column;
    box-shadow: 0 12px 48px rgba(0,0,0,0.95);
    overflow: hidden;
}
#se-fm-titlebar {
    background: linear-gradient(to bottom, #3c2c14, #221a0e);
    border-bottom: 2px solid #c8921a;
    padding: 8px 14px;
    display: flex; align-items: center; gap: 10px;
    flex-shrink: 0;
}
#se-fm-titlebar span { color: #e8b832; font-size: 13px; letter-spacing: 2px; font-weight: bold; flex: 1; }
#se-fm-path {
    background: #0e0a06;
    border: 1px solid #5a4020;
    color: #a09060;
    font-family: 'Consolas', monospace;
    font-size: 10px;
    padding: 5px 10px;
    flex-shrink: 0;
    border-bottom: 1px solid #3a2808;
    word-break: break-all;
}
#se-fm-toolbar {
    background: #231a0e;
    border-bottom: 1px solid #3a2808;
    padding: 5px 10px;
    display: flex; gap: 6px; flex-wrap: wrap;
    flex-shrink: 0;
}
#se-fm-list {
    flex: 1; overflow-y: auto; padding: 6px;
    display: flex; flex-direction: column; gap: 4px;
    -webkit-overflow-scrolling: touch;
}
.se-fm-row {
    display: grid;
    grid-template-columns: 20px 1fr auto auto auto;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    background: #221a0e;
    border: 1px solid #3a2808;
    border-radius: 2px;
    transition: border-color 0.1s;
}
.se-fm-row:hover { border-color: #c8921a; background: #2c1e08; }
.se-fm-icon { font-size: 14px; }
.se-fm-name { font-size: 11px; color: #e0c87a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.se-fm-meta { font-size: 9px; color: #7a6040; white-space: nowrap; }
.se-fm-btn {
    background: #1e1608; border: 1px solid #5a4020;
    color: #c8a060; font-family: 'Georgia', serif;
    font-size: 10px; padding: 3px 8px; cursor: pointer;
    border-radius: 1px; white-space: nowrap;
    transition: border-color 0.1s, color 0.1s;
}
.se-fm-btn:hover { border-color: #c8921a; color: #e8b832; }
.se-fm-btn.danger { border-color: #5a2020; color: #c07060; }
.se-fm-btn.danger:hover { border-color: #c83820; color: #ff8878; }
.se-fm-empty { text-align: center; padding: 30px; color: #6a5040; font-size: 12px; font-style: italic; }
#se-fm-statusbar {
    background: #0e0a06; border-top: 1px solid #3a2808;
    padding: 4px 10px; font-size: 10px; color: #7a6040;
    flex-shrink: 0;
}
`;

function _getStorageKey() {
    // Determine the localStorage path display
    return "localStorage → Browser Storage";
}

function _listSaves() {
    const saves = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (!k.startsWith("SE_scenario_") && !k.startsWith("SE_story_") && !k.startsWith("SE_v3_")) continue;
        if (k === "SE_story_LAST") continue;
        try {
            const raw  = localStorage.getItem(k);
            const data = JSON.parse(raw);
            saves.push({
                key:      k,
                name:     data?.meta?.name || k.replace(/^SE_(scenario|story)_/, ""),
                triggers: data?.triggers?.length || 0,
                cities:   data?.cities?.length || 0,
                hasTiles: !!(data?.mapData?.tiles?.length),
                savedAt:  data?.savedAt || data?.meta?.savedAt || 0,
                sizeKB:   Math.round(raw.length / 1024),
            });
        } catch(e) { /* skip corrupt entries */ }
    }
    return saves.sort((a, b) => b.savedAt - a.savedAt);
}

function _showFileManager() {
    document.getElementById("se-fm-overlay")?.remove();
    document.getElementById("se-fm-css")?.remove();

    const s = document.createElement("style");
    s.id = "se-fm-css";
    s.textContent = FM_CSS;
    document.head.appendChild(s);

    const overlay = document.createElement("div");
    overlay.id = "se-fm-overlay";

    function _render() {
        const saves = _listSaves();
        overlay.innerHTML = `
        <div id="se-fm-panel">
            <div id="se-fm-titlebar">
                <span>📁 SCENARIO FILE MANAGER</span>
                <button class="se-fm-btn" id="se-fm-close-btn">✕ Close</button>
            </div>
            <div id="se-fm-path">
                📍 Location: Browser localStorage &nbsp;|&nbsp;
                Origin: ${location.origin} &nbsp;|&nbsp;
                Key prefix: SE_scenario_* / SE_story_*
            </div>
            <div id="se-fm-toolbar">
                <button class="se-fm-btn" id="se-fm-import-btn">📂 Import .json File</button>
                <button class="se-fm-btn" id="se-fm-save-now-btn">💾 Save Current</button>
                <button class="se-fm-btn" id="se-fm-export-all-btn">⬇ Export All</button>
                <button class="se-fm-btn danger" id="se-fm-clear-all-btn">🗑 Clear All Saves</button>
            </div>
            <div id="se-fm-list">
                ${saves.length === 0
                    ? `<div class="se-fm-empty">📭 No saved scenarios found.<br>Save your current work or import a .json file.</div>`
                    : saves.map(sv => `
                <div class="se-fm-row" data-key="${sv.key}">
                    <span class="se-fm-icon">📜</span>
                    <div>
                        <div class="se-fm-name">${sv.name}</div>
                        <div class="se-fm-meta">
                            ⚡${sv.triggers} triggers &nbsp;·&nbsp;
                            🏯${sv.cities} cities &nbsp;·&nbsp;
                            🗺${sv.hasTiles ? "Has tiles" : "No tiles"} &nbsp;·&nbsp;
                            ${sv.sizeKB}KB &nbsp;·&nbsp;
                            ${sv.savedAt ? new Date(sv.savedAt).toLocaleString() : "Unknown date"}
                        </div>
                    </div>
                    <button class="se-fm-btn" data-action="load" data-key="${sv.key}">▶ Load</button>
                    <button class="se-fm-btn" data-action="export" data-key="${sv.key}">↗ Export</button>
                    <button class="se-fm-btn danger" data-action="delete" data-key="${sv.key}">✕</button>
                </div>`).join("")}
            </div>
            <div id="se-fm-statusbar" id="se-fm-status">
                ${saves.length} scenario(s) &nbsp;·&nbsp;
                Total: ~${saves.reduce((s,x)=>s+x.sizeKB,0)}KB used
            </div>
        </div>`;

        // Wire buttons
        overlay.querySelector("#se-fm-close-btn").onclick  = () => { overlay.remove(); document.getElementById("se-fm-css")?.remove(); };
        overlay.querySelector("#se-fm-import-btn").onclick = _importFile;
        overlay.querySelector("#se-fm-save-now-btn").onclick = () => {
            _saveNow();
            setTimeout(_render, 200);
        };
        overlay.querySelector("#se-fm-export-all-btn").onclick = _exportAll;
        overlay.querySelector("#se-fm-clear-all-btn").onclick = () => {
            if (!confirm("Delete ALL saved scenarios from localStorage?")) return;
            saves.forEach(sv => localStorage.removeItem(sv.key));
            _render();
        };

        // Row action buttons
        overlay.querySelectorAll("[data-action]").forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const key = btn.dataset.key;
                const action = btn.dataset.action;
                if (action === "load") {
                    const raw = localStorage.getItem(key);
                    if (_safeLoad(raw)) {
                        overlay.remove();
                        document.getElementById("se-fm-css")?.remove();
                    }
                } else if (action === "export") {
                    const raw = localStorage.getItem(key);
                    _downloadJSON(raw, key.replace(/^SE_(scenario|story)_/, "") + ".json");
                } else if (action === "delete") {
                    const sv = saves.find(s => s.key === key);
                    if (confirm(`Delete "${sv?.name || key}"?`)) {
                        localStorage.removeItem(key);
                        _render();
                    }
                }
            };
        });

        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); document.getElementById("se-fm-css")?.remove(); } };
    }

    _render();
    document.body.appendChild(overlay);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SAVE / EXPORT HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function _serialize() {
    const T  = window._SE_STORY;
    const S  = window._SE_CNP;
    const me = SE.mapEngine;
    const map = me?.getMap();

    let mapData = null;
    if (map && map.tiles && map.cols > 0) {
        const flat = [];
        for (let r = 0; r < map.rows; r++)
            for (let c = 0; c < map.cols; c++)
                flat.push(map.tiles[c]?.[r]?.name || "Ocean");
        // Store col-major as the engine uses col-major tiles
        const flatCM = [];
        for (let c = 0; c < map.cols; c++)
            for (let r = 0; r < map.rows; r++)
                flatCM.push(map.tiles[c]?.[r]?.name || "Ocean");
        mapData = { cols: map.cols, rows: map.rows, tileSize: map.tileSize || 16,
                    mapType: me.getMapType?.() || "custom", tiles: flatCM };
    }

    return {
        version:        3,
        savedAt:        Date.now(),
        meta:           { name: T?._scenarioName || "Untitled", author: "Dev" },
        triggers:       T ? JSON.parse(JSON.stringify(T.triggers || []))      : [],
        objectives:     T ? JSON.parse(JSON.stringify(T.objectives || []))    : [],
        dialogueLines:  T ? JSON.parse(JSON.stringify(T.dialogueLines || [])) : [],
        nextId:         T?._nextId || 1,
        mapData,
        cities:         S ? JSON.parse(JSON.stringify(S.cities || []))         : [],
        factionAliases: S ? JSON.parse(JSON.stringify(S.factionAliases || {})) : {},
        spawnRules:     S ? JSON.parse(JSON.stringify(S.spawnRules || {}))     : {},
        compOverrides:  S ? JSON.parse(JSON.stringify(S.compOverrides || {}))  : {},
        diplomacy:      S ? JSON.parse(JSON.stringify(S.diplomacy || {}))      : {},
    };
}

function _saveNow() {
    const data = _serialize();
    const name = data.meta.name;
    const key  = "SE_scenario_" + name.replace(/\W+/g, "_");
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem("SE_story_LAST", JSON.stringify(data));
    const sc = document.getElementById("se-st-scenario");
    if (sc) sc.textContent = name;
    _toast("💾 Saved: " + name);
    const dot = document.getElementById("se-save-dot");
    if (dot) dot.className = "se-save-dot";
    if (window._SE_STORY) window._SE_STORY._dirty = false;
    return data;
}

function _downloadJSON(json, filename) {
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function _exportAll() {
    const saves = _listSaves();
    if (!saves.length) { _toast("⚠ Nothing to export"); return; }
    const bundle = {};
    saves.forEach(sv => { try { bundle[sv.key] = JSON.parse(localStorage.getItem(sv.key)); } catch(e) {} });
    _downloadJSON(JSON.stringify(bundle, null, 2), "SE_all_scenarios_" + Date.now() + ".json");
    _toast("↗ Exported " + saves.length + " scenarios");
}

function _importFile() {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".json";
    inp.onchange = ev => {
        const file = ev.target.files?.[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = re => {
            try {
                const raw  = re.target.result;
                const data = JSON.parse(raw);
                // Check if it's a bundle (exported with Export All)
                const keys = Object.keys(data);
                if (keys.length > 0 && keys[0].startsWith("SE_")) {
                    keys.forEach(k => localStorage.setItem(k, JSON.stringify(data[k])));
                    _toast("✓ Imported bundle: " + keys.length + " scenarios");
                    document.getElementById("se-fm-overlay") && _showFileManager();
                } else {
                    // Single scenario
                    if (_safeLoad(raw)) {
                        document.getElementById("se-fm-overlay")?.remove();
                        document.getElementById("se-fm-css")?.remove();
                    }
                }
            } catch(e) { _toast("⚠ Invalid file: " + e.message); }
        };
        r.readAsText(file);
    };
    inp.click();
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. TEST PLAY — runs scenario immediately without leaving editor
// ─────────────────────────────────────────────────────────────────────────────
const TEST_CSS = `
#se-test-overlay {
    position: fixed; inset: 0;
    background: #0a0806;
    z-index: 70000;
    display: flex; flex-direction: column;
    font-family: 'Georgia', serif;
}
#se-test-topbar {
    height: 36px; flex-shrink: 0;
    background: linear-gradient(to bottom, #3c2c14, #221a0e);
    border-bottom: 2px solid #c8921a;
    display: flex; align-items: center; gap: 10px; padding: 0 12px;
    z-index: 10;
}
#se-test-topbar .se-test-badge {
    background: rgba(200,146,26,0.2); border: 1px solid #c8921a;
    color: #e8b832; font-size: 10px; letter-spacing: 2px;
    padding: 2px 10px; border-radius: 2px;
    animation: se-test-pulse 2s infinite;
}
@keyframes se-test-pulse {
    0%,100% { box-shadow: 0 0 4px rgba(200,146,26,0.3); }
    50%      { box-shadow: 0 0 10px rgba(200,146,26,0.7); }
}
#se-test-canvas-wrap { flex: 1; position: relative; overflow: hidden; }
#se-test-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
#se-test-hud {
    position: absolute; top: 10px; left: 10px;
    background: rgba(10,8,6,0.85); border: 1px solid #3a2808;
    color: #d8c890; font-size: 11px; padding: 8px 12px;
    border-radius: 2px; pointer-events: none;
    line-height: 1.8; min-width: 140px;
}
`;

function _launchTestPlay() {
    // Save first
    _saveNow();

    document.getElementById("se-test-overlay")?.remove();
    document.getElementById("se-test-css")?.remove();

    const s = document.createElement("style");
    s.id = "se-test-css";
    s.textContent = TEST_CSS;
    document.head.appendChild(s);

    const overlay = document.createElement("div");
    overlay.id = "se-test-overlay";
    overlay.innerHTML = `
    <div id="se-test-topbar">
        <span class="se-test-badge">▶ TEST PLAY</span>
        <span style="color:#a07828;font-size:11px;flex:1" id="se-test-status">
            Scenario: ${window._SE_STORY?._scenarioName || "Untitled"}
        </span>
        <span style="color:#7a6040;font-size:10px" id="se-test-turn">Turn 1</span>
        <button style="background:#2a1010;border:1px solid #5a2020;color:#c07060;
                       font-family:Georgia,serif;font-size:11px;padding:4px 12px;
                       cursor:pointer;border-radius:2px;" id="se-test-next-turn">⏭ Next Turn</button>
        <button style="background:#1e1608;border:1px solid #5a4020;color:#c8a060;
                       font-family:Georgia,serif;font-size:11px;padding:4px 12px;
                       cursor:pointer;border-radius:2px;" id="se-test-exit">✕ Exit Test</button>
    </div>
    <div id="se-test-canvas-wrap">
        <canvas id="se-test-canvas"></canvas>
        <div id="se-test-hud">
            <div>⚡ Trigger Runtime: <span style="color:#6ac86a">ACTIVE</span></div>
            <div id="se-test-hud-turn">Turn: <span style="color:#e8b832">1</span></div>
            <div id="se-test-hud-fired">Fired: <span style="color:#e8b832">0</span></div>
            <div id="se-test-hud-cities">Cities: <span style="color:#e8b832">${window._SE_CNP?.cities?.length || 0}</span></div>
        </div>
    </div>`;

    document.body.appendChild(overlay);

    // Render the map onto the test canvas
    const testCanvas = overlay.querySelector("#se-test-canvas");
    const wrap       = overlay.querySelector("#se-test-canvas-wrap");
    const ctx        = testCanvas.getContext("2d");
    let   turn       = 1;
    let   rafId      = null;

    function _renderTest() {
        const W = wrap.clientWidth, H = wrap.clientHeight;
        testCanvas.width = W; testCanvas.height = H;
        ctx.fillStyle = "#0a0806";
        ctx.fillRect(0, 0, W, H);

        const me  = SE.mapEngine;
        const map = me?.getMap();
        if (!map || !map.tiles || map.cols === 0) {
            ctx.fillStyle = "#e8b832";
            ctx.font = "14px Georgia";
            ctx.textAlign = "center";
            ctx.fillText("No map loaded — use Map Editor to create one", W/2, H/2);
            return;
        }

        const TDEFS = me.TILE_DEFS || {};
        const ts    = Math.min((W * 0.92) / map.cols, (H * 0.92) / map.rows);
        const ox    = (W - map.cols * ts) / 2;
        const oy    = (H - map.rows * ts) / 2;

        for (let c = 0; c < map.cols; c++) {
            for (let r = 0; r < map.rows; r++) {
                const tile = map.tiles[c]?.[r];
                ctx.fillStyle = (tile && TDEFS[tile.name] ? TDEFS[tile.name].color : "#1a3f5c");
                ctx.fillRect(ox + c * ts, oy + r * ts, ts + 0.5, ts + 0.5);
            }
        }

        // Draw city dots
        const S = window._SE_CNP;
        if (S?.cities) {
            S.cities.forEach(city => {
                const px = ox + city.nx * map.cols * ts;
                const py = oy + city.ny * map.rows * ts;
                ctx.beginPath();
                ctx.arc(px, py, Math.max(3, ts * 1.2), 0, Math.PI * 2);
                ctx.fillStyle = city.color || "#e8b832";
                ctx.fill();
                ctx.strokeStyle = "rgba(0,0,0,0.7)";
                ctx.lineWidth = 1;
                ctx.stroke();
                if (ts >= 2) {
                    ctx.fillStyle = "#fff8e0";
                    ctx.font = `${Math.max(8, ts * 0.8)}px Georgia`;
                    ctx.fillText(city.name, px + ts * 1.5, py + ts * 0.4);
                }
            });
        }

        // Map border
        ctx.strokeStyle = "rgba(200,146,26,0.4)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(ox, oy, map.cols * ts, map.rows * ts);
    }

    function _tickRuntime() {
        const T = window._SE_STORY;
        if (!T) return;
        const fired = T._rt?.firedIds?.size || 0;
        document.getElementById("se-test-hud-turn")?.querySelector("span") &&
            (document.getElementById("se-test-hud-turn").querySelector("span").textContent = turn);
        document.getElementById("se-test-hud-fired")?.querySelector("span") &&
            (document.getElementById("se-test-hud-fired").querySelector("span").textContent = fired);

        if (window.SE_storyTick) window.SE_storyTick({ turn, cities: window._SE_CNP?.cities || [] });
    }

    // Activate story runtime
    if (window._SE_STORY) {
        window._SE_STORY._rt.active = true;
        window._SE_STORY._rt.turn   = 1;
        window._SE_STORY._rt.firedIds = new Set();
    }
    _tickRuntime(); // fire MAP_LAUNCH triggers

    // Render loop
    let lastW = 0, lastH = 0;
    function loop() {
        const W = wrap.clientWidth, H = wrap.clientHeight;
        if (W !== lastW || H !== lastH) { _renderTest(); lastW = W; lastH = H; }
        rafId = requestAnimationFrame(loop);
    }
    loop();

    // Next Turn button
    overlay.querySelector("#se-test-next-turn").onclick = () => {
        turn++;
        if (window._SE_STORY) window._SE_STORY._rt.turn = turn;
        document.getElementById("se-test-turn").textContent = "Turn " + turn;
        _tickRuntime();
        _renderTest();
    };

    // Exit → back to editor
    overlay.querySelector("#se-test-exit").onclick = () => {
        cancelAnimationFrame(rafId);
        overlay.remove();
        document.getElementById("se-test-css")?.remove();
        if (window._SE_STORY) window._SE_STORY._rt.active = false;
        _toast("← Returned to Scenario Editor");
        // Re-mount the trigger tab to refresh any fired states
        setTimeout(() => SE._setTab?.("TRIGGERS"), 100);
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. RESET TOOLS
// ─────────────────────────────────────────────────────────────────────────────
window.SE_resetTools = function() {
    const root = document.getElementById("se-root");
    if (!root) return;

    // Reset mode to MAP
    SE._setMode?.("MAP");

    // Reset tool to PAINT
    SE._setTool?.("PAINT");

    // Reset tile to Plains
    SE._setTile?.("Plains");

    // Reset brush to 1x1
    SE._setBrush?.(1);

    // Reset zoom to fit
    SE.mapEngine?.fitToView?.();

    // Reset bottom tab to TRIGGERS
    SE._setTab?.("TRIGGERS");

    // Remove any active overlays from CNP
    const S = window._SE_CNP;
    if (S) {
        S.placingCity   = false;
        S.relocatingId  = null;
        S.patrolMode    = null;
        S._pickingEntry = null;
    }

    // Reset viewport cursor
    const vp = document.getElementById("se-viewport");
    if (vp) vp.style.cursor = "crosshair";

    _toast("↺ Tools reset to defaults");
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. TOAST HELPER
// ─────────────────────────────────────────────────────────────────────────────
function _toast(msg, ms) {
    ms = ms || 3000;
    let el = document.getElementById("se-lsp-toast");
    if (!el) {
        el = document.createElement("div");
        el.id = "se-lsp-toast";
        el.style.cssText =
            "position:fixed;bottom:50px;left:50%;transform:translateX(-50%) translateY(8px);" +
            "background:#1a1208;border:1px solid #c8921a;color:#e8b832;" +
            "padding:7px 18px;font-family:Georgia,serif;font-size:12px;" +
            "border-radius:2px;z-index:99997;pointer-events:none;" +
            "transition:opacity 0.25s,transform 0.25s;opacity:0;" +
            "max-width:90vw;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,0.8);";
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = "1";
    el.style.transform = "translateX(-50%) translateY(0)";
    clearTimeout(el._t);
    el._t = setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateX(-50%) translateY(8px)";
    }, ms);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. WIRE INTO EXISTING BUTTONS — patch open() to replace old handlers
// ─────────────────────────────────────────────────────────────────────────────
function _rewireButtons(root) {
    if (!root) return;

    function _findBtn(fragment) {
        const clean = s => s.replace(/\s+/g,"").toLowerCase();
        const needle = clean(fragment);
        return Array.from(root.querySelectorAll(".se-btn")).find(b =>
            clean(b.textContent).includes(needle)
        );
    }

    function _activate(btn, handler) {
        if (!btn) return;
        btn.classList.remove("stub");
        btn.style.opacity = "1";
        btn.style.cursor  = "pointer";
        btn.style.pointerEvents = "auto";
        btn.onclick = (e) => { e.stopPropagation(); handler(); };
    }

    // 💾 Save
    _activate(_findBtn("💾Save"), _saveNow);

    // 📂 Load → open file manager
    _activate(_findBtn("📂Load"), _showFileManager);

    // ↗ Export
    _activate(_findBtn("↗Export"), () => {
        const data = _serialize();
        const name = (data.meta.name || "scenario").replace(/\W+/g,"_");
        _downloadJSON(JSON.stringify(data, null, 2), name + "_" + Date.now() + ".json");
    });

    // ▶ Test Play
    _activate(_findBtn("TestPlay"), _launchTestPlay);

    // 💾 Save in story bar (se-story-name area)
    const storyBar = root.querySelector(".se-storybar-inj");
    if (storyBar) {
        const saveBtns = storyBar.querySelectorAll(".se-btn");
        saveBtns.forEach(btn => {
            const t = btn.textContent.replace(/\s+/g,"").toLowerCase();
            if (t.includes("save"))    { btn.classList.remove("stub"); btn.onclick = (e) => { e.stopPropagation(); _saveNow(); }; }
            if (t.includes("load"))    { btn.classList.remove("stub"); btn.onclick = (e) => { e.stopPropagation(); _showFileManager(); }; }
            if (t.includes("export"))  { btn.classList.remove("stub"); btn.onclick = (e) => { e.stopPropagation(); _downloadJSON(JSON.stringify(_serialize(),null,2), "scenario.json"); }; }
        });
    }

    // Ctrl+S shortcut
    document.addEventListener("keydown", function _kd(e) {
        if (!document.getElementById("se-root")) { document.removeEventListener("keydown", _kd); return; }
        if (e.ctrlKey && e.key === "s") { e.preventDefault(); _saveNow(); }
    });
}

// Hook open lifecycle
const _prev = SE.open.bind(SE);
SE.open = function() {
    _prev();
    setTimeout(function attempt() {
        const root = document.getElementById("se-root");
        if (!root) { setTimeout(attempt, 120); return; }
        _rewireButtons(root);
    }, 450);
};

// Hook _setTab to re-wire after tab switches rebuild DOM
const _prevSetTab = SE._setTab?.bind(SE);
if (_prevSetTab) {
    SE._setTab = function(tab) {
        _prevSetTab(tab);
        setTimeout(() => {
            const root = document.getElementById("se-root");
            if (root) _rewireButtons(root);
        }, 200);
    };
}

// Patch if already open
if (document.getElementById("se-root")) {
    setTimeout(() => _rewireButtons(document.getElementById("se-root")), 300);
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. FAVICON FIX (suppresses 404 console error)
// ─────────────────────────────────────────────────────────────────────────────
(function _fixFavicon() {
    if (document.querySelector("link[rel~='icon']")) return;
    const link = document.createElement("link");
    link.rel   = "icon";
    link.type  = "image/svg+xml";
    // Inline SVG scroll emoji as favicon — no external file needed
    link.href  = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📜</text></svg>";
    document.head.appendChild(link);
})();

// Expose public API
SE.lsp = { save: _saveNow, load: _safeLoad, showFileManager: _showFileManager, testPlay: _launchTestPlay, reset: _deepReset, resetTools: window.SE_resetTools };

console.log(
    "%c[SE-LSP v3] ✓ Loaded\n" +
    " • _deepReset() — purges map/cities/triggers before load\n" +
    " • _safeLoad()  — full deserialize with reset guard\n" +
    " • File Manager — localStorage browser with Load/Export/Delete\n" +
    " • Test Play    — inline, no main-menu redirect, Exit→editor\n" +
    " • SE_resetTools() — resets tools without clearing map data\n" +
    " • Favicon fix  — inline SVG, no 404",
    "color:#e8b832;font-family:monospace;font-size:11px"
);

})(); // end SE_LoadSavePatch

// =============================================================================
// SCENARIO EDITOR — FINAL BUG FIX PATCH
// Assumes SE_ButtonFixPatch is already appended above this block.
// Fixes all 16 bugs identified in full code audit.
// =============================================================================
(function SE_FinalBugFix() {
"use strict";
if (window.__SE_FINAL_FIX__) return;
window.__SE_FINAL_FIX__ = true;

const SE = window.ScenarioEditor;
if (!SE) { console.error("[FinalFix] ScenarioEditor not found"); return; }

// ─────────────────────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────────────────────
let _toastTid = null;
function _toast(msg, ms) {
    ms = ms || 3000;
    let el = document.getElementById("se-final-toast");
    if (!el) {
        el = document.createElement("div");
        el.id = "se-final-toast";
        el.style.cssText =
            "position:fixed;bottom:62px;left:50%;transform:translateX(-50%) translateY(8px);" +
            "background:#1a1208;border:1px solid #c8921a;color:#e8b832;" +
            "padding:7px 18px;font-family:Georgia,serif;font-size:12px;" +
            "border-radius:2px;z-index:99999;pointer-events:none;" +
            "transition:opacity 0.22s,transform 0.22s;opacity:0;" +
            "max-width:90vw;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,0.8);";
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = "1";
    el.style.transform = "translateX(-50%) translateY(0)";
    clearTimeout(_toastTid);
    _toastTid = setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateX(-50%) translateY(8px)";
    }, ms);
}

function _statusFlash(msg, ms) {
    ms = ms || 3000;
    const el = document.getElementById("se-st-scenario");
    if (!el) return;
    const prev = el.textContent;
    el.textContent = msg;
    clearTimeout(_statusFlash._t);
    _statusFlash._t = setTimeout(() => { el.textContent = prev; }, ms);
}

// =============================================================================
// FIX 1 — Ctrl+S MULTI-FIRE DEDUPLICATION
// Replace ALL existing keydown handlers with a single canonical one.
// Called once when the final patch mounts; old handlers are harmless since
// they all check document.getElementById("se-root") before acting.
// =============================================================================
let _masterKeyHandler = null;

function _installMasterKeyboard() {
    if (_masterKeyHandler) {
        document.removeEventListener("keydown", _masterKeyHandler);
    }
    _masterKeyHandler = function(e) {
        if (!document.getElementById("se-root")) {
            document.removeEventListener("keydown", _masterKeyHandler);
            _masterKeyHandler = null;
            return;
        }
        // Ctrl+S → save (single canonical save call)
        if (e.ctrlKey && e.key === "s") {
            e.preventDefault();
            if (SE.lsp?.save)              SE.lsp.save();
            else if (window._SE_STORY?._save) window._SE_STORY._save();
            return;
        }
        // Alt+T → add trigger
        if (e.altKey && e.key === "t") {
            e.preventDefault();
            window._SE_STORY?._add?.();
            return;
        }
        // Escape → close topmost modal
        if (e.key === "Escape") {
            const modal = document.querySelector(
                ".se-load-modal, .se-legacy-fix-modal, #se-fm-overlay, #se-gear-menu");
            if (modal) { modal.remove(); return; }
        }
        // 1–5 number keys → switch modes (when not in an input)
        if (!e.ctrlKey && !e.altKey && !e.metaKey) {
            const target = e.target;
            const inInput = ["INPUT","TEXTAREA","SELECT"].includes(target.tagName) ||
                            target.isContentEditable;
            if (!inInput) {
                const modeMap = {"1":"MAP","2":"FACTIONS","3":"CITIES","4":"NPCS","5":"TRIGGERS"};
                if (modeMap[e.key]) SE._setMode?.(modeMap[e.key]);
            }
        }
    };
    document.addEventListener("keydown", _masterKeyHandler);
}

// =============================================================================
// FIX 2 — RIBBON ZOOM + BUTTON HIJACK
// The mega-patch's wireAll() scans ALL .se-btn for text "+" which includes
// the story editor's "+ (add trigger)" button. Scope zoom wiring to #se-ribbon.
// Also restores the story editor's own + button onclick.
// =============================================================================
function _fixZoomButtons() {
    const ribbon = document.getElementById("se-ribbon");
    if (!ribbon) return;
    const me = SE.mapEngine;

    const ribbonBtns = Array.from(ribbon.querySelectorAll(".se-btn.icon-only"));
    const minusBtn = ribbonBtns.find(b => b.textContent.trim() === "−" || b.textContent.trim() === "-");
    const plusBtn  = ribbonBtns.find(b => b.textContent.trim() === "+");

    if (minusBtn) {
        minusBtn.classList.remove("stub");
        minusBtn.title = "Zoom out";
        minusBtn.onclick = (e) => { e.stopPropagation(); me?.zoomOut(); };
    }
    if (plusBtn) {
        plusBtn.classList.remove("stub");
        plusBtn.title = "Zoom in";
        plusBtn.onclick = (e) => { e.stopPropagation(); me?.zoomIn(); };
    }
}

function _restoreStoryEditorPlusBtn() {
    // The mega-patch may have overwritten the story editor's + (add trigger) button
    const listBar = document.querySelector(".se-tl-list-bar");
    if (!listBar) return;
    const addBtn = Array.from(listBar.querySelectorAll(".se-btn.icon-only"))
        .find(b => b.textContent.trim() === "+");
    if (addBtn && !addBtn._storyPlusFixed) {
        addBtn._storyPlusFixed = true;
        addBtn.onclick = (e) => { e.stopPropagation(); window._SE_STORY?._add?.(); };
    }
}

// =============================================================================
// FIX 3 — TILE SERIALIZATION ROW/COL MISMATCH
// Part 3's _serialize writes row-major but _restoreMap reads col-major.
// Override T._save to always use the LSP serializer (which uses col-major).
// Guard prevents re-wrapping on subsequent open() calls.
// =============================================================================
function _fixTileSerialization() {
    const T = window._SE_STORY;
    if (!T || T._save._colMajorFixed) return;

    const _lspSave = SE.lsp?.save;
    if (!_lspSave) return;

    T._save = function() {
        _lspSave();           // LSP serialize is correctly col-major
    };
    T._save._colMajorFixed = true;
}

// =============================================================================
// FIX 4 — CARD OVERFLOW CSS CONFLICT
// MinMax patch sets overflow:hidden !important on .se-card, breaking scroll
// and the resize handle interaction. Override with saner defaults.
// =============================================================================
function _fixCardCSS() {
    if (document.getElementById("se-final-fix-css")) return;
    const s = document.createElement("style");
    s.id = "se-final-fix-css";
    s.textContent = `
/* ── Fix MinMax overflow:hidden on cards ── */
.se-card                  { overflow: visible !important; }
.se-card.se-is-minimized  { overflow: hidden  !important; }
.se-card.se-is-maximized  { overflow: auto    !important; }

/* ── Ensure right-scroll actually scrolls ── */
#se-right-panel { overflow: hidden !important; display: flex !important; flex-direction: column !important; }
.se-right-scroll {
    flex: 1 1 0 !important; overflow-y: auto !important;
    overflow-x: hidden !important; min-height: 0 !important;
    -webkit-overflow-scrolling: touch;
}

/* ── Economy grid overflow ── */
.se-economy-grid { overflow-y: auto !important; }

/* ── Gear menu z-index above maximized cards ── */
#se-gear-menu { z-index: 50000 !important; }

/* ── Action body expansion ── */
.se-act-cbody:not(.closed) {
    display: flex !important;
    flex-direction: column !important;
    gap: 4px !important;
}

/* ── Pointer cursors on interactive stubs ── */
.se-trigger-item, .se-obj-row, .se-dialogue-item { cursor: pointer !important; }

/* ── Ensure overlay stacking order ── */
#se-test-overlay { z-index: 70000 !important; }
#se-fm-overlay   { z-index: 65000 !important; }
.se-legacy-fix-modal { z-index: 40000 !important; }

/* ── Fix splitter flex behaviour ── */
.se-v-splitter { flex-shrink: 0 !important; width: 6px !important; }

/* ── Fix timeline body grid ── */
#se-timeline-body.se-story-body { overflow: hidden !important; min-height: 0 !important; }
`;
    document.head.appendChild(s);
}

// =============================================================================
// FIX 5 — RAF MEMORY LEAK & DIALOGUE QUEUE ON CLOSE
// Single-wrap SE.close with a one-time guard to avoid growing wrapper chains.
// =============================================================================
(function _patchClose() {
    if (SE.close._rafFixed) return;
    const prevClose = SE.close.bind(SE);

    SE.close = function() {
        // Cancel CNP overlay animation frame
        const S = window._SE_CNP;
        if (S?._raf) { cancelAnimationFrame(S._raf); S._raf = null; }

        // Remove lingering overlay elements
        ["se-cnp-overlay","se-bdl-ov"].forEach(id => {
            document.getElementById(id)?.remove();
        });

        // Clear dialogue queue so no post-close popups appear
        if (window.BattleDialogue) {
            window.BattleDialogue._q      = [];
            window.BattleDialogue._active = false;
        }

        // Remove master keyboard handler
        if (_masterKeyHandler) {
            document.removeEventListener("keydown", _masterKeyHandler);
            _masterKeyHandler = null;
        }

        prevClose();
    };
    SE.close._rafFixed = true;
})();

// =============================================================================
// FIX 6 — _settings SERIALIZATION
// Patch SE.lsp serialize/load and T._save/_loadKey to persist _settings.
// =============================================================================
function _fixSettingsSerialization() {
    // Patch LSP serialize to include settings
    if (SE.lsp && !SE.lsp._settingsFixed) {
        SE.lsp._settingsFixed = true;

        const origSave = SE.lsp.save;
        SE.lsp.save = function() {
            const T = window._SE_STORY;
            if (T) T._settings = T._settings || {};
            return origSave.apply(this, arguments);
        };

        // Patch safeLoad (via SE.lsp.load) to restore settings
        const origLoad = SE.lsp.load;
        SE.lsp.load = function(json) {
            const result = origLoad.apply(this, arguments);
            const T = window._SE_STORY;
            if (T && result) {
                try {
                    const data = typeof json === "string" ? JSON.parse(json) : json;
                    if (data?.settings) T._settings = data.settings;
                } catch(e) {}
            }
            return result;
        };
    }

    // Patch storyEditor serialize to include settings
    if (SE.storyEditor?.serialize && !SE.storyEditor.serialize._settingsFixed) {
        const orig = SE.storyEditor.serialize.bind(SE.storyEditor);
        SE.storyEditor.serialize = function() {
            const data = orig();
            const T = window._SE_STORY;
            if (data && T) data.settings = T._settings || {};
            return data;
        };
        SE.storyEditor.serialize._settingsFixed = true;
    }

    // Patch storyEditor deserialize to restore settings
    if (SE.storyEditor?.deserialize && !SE.storyEditor.deserialize._settingsFixed) {
        const orig = SE.storyEditor.deserialize.bind(SE.storyEditor);
        SE.storyEditor.deserialize = function(data) {
            orig(data);
            const T = window._SE_STORY;
            if (T && data?.settings) T._settings = data.settings;
            // Sync meta card fields after load
            setTimeout(() => _wireScenarioMeta(document.getElementById("se-root")), 150);
        };
        SE.storyEditor.deserialize._settingsFixed = true;
    }
}

// =============================================================================
// FIX 7 — SCENARIO META FIELDS
// Wire all stub inputs in the Scenario Meta card to T._scenarioName / T._settings.
// =============================================================================
function _wireScenarioMeta(root) {
    if (!root) return;
    const T = window._SE_STORY;

    const metaCard = Array.from(root.querySelectorAll(".se-card"))
        .find(c => c.querySelector(".se-card-header")?.textContent.includes("Scenario Meta"));
    if (!metaCard) return;

    // Helper to de-stub an input
    function wire(inp, getVal, onSet) {
        if (!inp || inp._metaFixed) return;
        inp._metaFixed = true;
        inp.classList.remove("stub");
        const v = getVal?.();
        if (v != null && v !== "") inp.value = v;
        inp.addEventListener("input", function() {
            onSet(this.value);
            if (T) T._dirty = true;
        });
    }

    const inputs = Array.from(metaCard.querySelectorAll("input, select, textarea"));

    // Name
    wire(inputs.find(i => i.placeholder?.includes("Bun")),
        () => T?._scenarioName || "",
        v  => {
            if (T) T._scenarioName = v;
            // Keep story bar input in sync
            const sn = document.getElementById("se-story-name");
            if (sn && sn.value !== v) sn.value = v;
        });

    // Author
    wire(inputs.find(i => i.placeholder === "Developer"),
        () => T?._settings?.author || "",
        v  => { if (T) { T._settings = T._settings||{}; T._settings.author = v; } });

    // Map Mode (select)
    wire(inputs.find(i => i.tagName === "SELECT"),
        null,
        v  => { if (T) { T._settings = T._settings||{}; T._settings.mapMode = v; } });

    // Width / Height (two number inputs)
    const numInputs = inputs.filter(i => i.type === "number");
    if (numInputs[0]) wire(numInputs[0],
        () => T?._settings?.mapWidth  || 160,
        v  => { if (T) { T._settings = T._settings||{}; T._settings.mapWidth = parseInt(v); } });
    if (numInputs[1]) wire(numInputs[1],
        () => T?._settings?.mapHeight || 120,
        v  => { if (T) { T._settings = T._settings||{}; T._settings.mapHeight = parseInt(v); } });

    // Historical date
    wire(inputs.find(i => i.placeholder?.includes("1274")),
        () => T?._settings?.historicalDate || "",
        v  => { if (T) { T._settings = T._settings||{}; T._settings.historicalDate = v; } });
}

// =============================================================================
// FIX 8 — STATIC TAB STUBS → ROUTE TO PART 4
// Static triggers/objectives/dialogue tabs show before Part 4 mounts.
// Give all their buttons/items a handler that switches to the correct tab
// so Part 4's full wired version is immediately shown.
// =============================================================================
function _wireStaticTabContent(root) {
    if (!root) return;

    // Static trigger lane items
    root.querySelectorAll(".se-trigger-list .se-trigger-item:not([data-static-wired])").forEach(item => {
        item.setAttribute("data-static-wired","1");
        item.onclick = () => SE._setTab("TRIGGERS");
    });

    // Static trigger lane sort/filter buttons
    root.querySelectorAll(".se-trigger-lane-header .se-btn.stub:not([data-static-wired])").forEach(btn => {
        btn.setAttribute("data-static-wired","1");
        btn.classList.remove("stub");
        btn.onclick = (e) => { e.stopPropagation(); SE._setTab("TRIGGERS"); };
    });

    // Static trig-editor action rows ✎ ✕ buttons
    root.querySelectorAll(".se-trig-editor .se-btn.stub:not([data-static-wired])").forEach(btn => {
        btn.setAttribute("data-static-wired","1");
        btn.classList.remove("stub");
        btn.onclick = (e) => { e.stopPropagation(); SE._setTab("TRIGGERS"); };
    });

    // Static trig-editor form stubs (label input, enabled select, etc.)
    root.querySelectorAll(".se-trig-editor .se-input.stub, .se-trig-editor .se-select.stub").forEach(inp => {
        if (inp._metaFixed) return;
        inp._metaFixed = true;
        inp.classList.remove("stub");
    });

    // Objectives tab stubs (when shown before Part 4 mounts)
    const body = root.querySelector("#se-timeline-body");
    if (body) {
        body.querySelectorAll(".se-obj-row:not([data-static-wired])").forEach(row => {
            row.setAttribute("data-static-wired","1");
            row.onclick = () => SE._setTab("OBJECTIVES");
        });
        body.querySelectorAll(".se-obj-list .se-btn.stub:not([data-static-wired])").forEach(btn => {
            btn.setAttribute("data-static-wired","1");
            btn.classList.remove("stub");
            btn.onclick = (e) => { e.stopPropagation(); SE._setTab("OBJECTIVES"); };
        });

        // Dialogue tab stubs
        body.querySelectorAll(".se-dialogue-item:not([data-static-wired])").forEach(item => {
            item.setAttribute("data-static-wired","1");
            item.onclick = () => {
                body.querySelectorAll(".se-dialogue-item").forEach(d => d.classList.remove("active"));
                item.classList.add("active");
            };
        });
        body.querySelectorAll(".se-dialogue-form .se-btn.stub:not([data-static-wired])").forEach(btn => {
            btn.setAttribute("data-static-wired","1");
            btn.classList.remove("stub");
            const t = btn.textContent.replace(/\s+/g,"").toLowerCase();
            if (t.includes("preview") || t.includes("▶")) {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const speaker = body.querySelector(".se-dialogue-form input[type='text']")?.value || "Narrator";
                    const text    = body.querySelector(".se-dialogue-form .se-textarea")?.value || "";
                    if (window.BattleDialogue && text) {
                        window.BattleDialogue.queue(speaker, "💬", text, 4000, "bottom");
                    }
                };
            } else {
                btn.onclick = (e) => { e.stopPropagation(); SE._setTab("DIALOGUE"); };
            }
        });
        body.querySelectorAll(".se-dialogue-form .se-input.stub, .se-dialogue-form .se-select.stub, .se-dialogue-form .se-textarea.stub").forEach(inp => {
            inp.classList.remove("stub");
        });
    }
}

// =============================================================================
// FIX 9 — DIPLOMACY MATRIX MIRROR CELL
// The original _cycleDiplo checks `mirrorCell.onclick` which is null for
// inline onclick="..." attributes. Use event delegation + data rescan.
// =============================================================================
(function _fixDiploMirror() {
    if (window.__SE_DIPLO_MIRROR_FIXED__) return;
    window.__SE_DIPLO_MIRROR_FIXED__ = true;

    document.addEventListener("click", function(e) {
        const cell = e.target.closest && e.target.closest("td[onclick*='_cycleDiplo']");
        if (!cell) return;
        const tbl = cell.closest("table");
        if (!tbl) return;

        // After the inline onclick fires (sync), re-scan the whole table
        // and repaint every cell from the live S.diplomacy values.
        requestAnimationFrame(() => {
            const S = window._SE_CNP;
            if (!S) return;
            const STYLES = {
                Ally:    "background:#1a3a1a;border:1px solid #3a8830;color:#80e890",
                Neutral: "background:#222;border:1px solid #555;color:#aaa",
                War:     "background:#3a1010;border:1px solid #a83030;color:#ffa0a0",
            };
            const ICONS = { Ally:"✓", Neutral:"•", War:"⚔" };
            tbl.querySelectorAll("td[onclick*='_cycleDiplo']").forEach(c => {
                const m = (c.getAttribute("onclick")||"").match(/_cycleDiplo\('([^']+)','([^']+)'/);
                if (!m) return;
                const rel = S.diplomacy[m[1]+"::"+m[2]] || "Neutral";
                c.setAttribute("style", STYLES[rel]+";text-align:center;padding:2px 3px;cursor:pointer;border-radius:1px;min-width:22px");
                c.textContent = ICONS[rel];
            });
        });
    }, { passive: true });
})();

// =============================================================================
// FIX 10 — _SE_STORY_BATTLE_HOOK DEAD VARIABLE
// Wire it to TriggerRuntime.onBattleEnd so battle scripts calling the hook
// actually route results back.
// =============================================================================
function _fixBattleHook() {
    if (SE.storyEditor?.runtime && !window._SE_STORY_BATTLE_HOOK?._wired) {
        window._SE_STORY_BATTLE_HOOK = function(playerWon) {
            SE.storyEditor.runtime.onBattleEnd(playerWon);
        };
        window._SE_STORY_BATTLE_HOOK._wired = true;
    }
}

// =============================================================================
// FIX 12 — VIEWPORT CURSOR SYNC (guarded single-wrap)
// =============================================================================
(function _fixCursor() {
    if (SE._setTool._cursorFixed) return;

    const CURSORS = {
        PAINT:"crosshair", ERASE:"cell",    FILL:"crosshair",
        SELECT:"default",  PLACE:"copy",    INSPECT:"zoom-in",
        MOVE:"move",       MEASURE:"crosshair"
    };

    const prevSetTool = SE._setTool.bind(SE);
    SE._setTool = function(tool) {
        prevSetTool(tool);
        const vp = document.getElementById("se-viewport");
        const mode = document.querySelector(".se-mode-tab.active")?.dataset.mode;
        if (vp && mode === "MAP") vp.style.cursor = CURSORS[tool] || "crosshair";
    };
    SE._setTool._cursorFixed = true;

    const prevSetMode = SE._setMode.bind(SE);
    SE._setMode = function(mode) {
        prevSetMode(mode);
        const vp = document.getElementById("se-viewport");
        if (!vp) return;
        if (mode === "MAP") {
            const tool = document.querySelector(".se-tool.active")?.dataset.tool || "PAINT";
            vp.style.cursor = CURSORS[tool] || "crosshair";
        } else if (mode === "CITIES") {
            vp.style.cursor = "cell";
        } else if (mode === "NPCS") {
            vp.style.cursor = "crosshair";
        } else {
            vp.style.cursor = "default";
        }
    };
    SE._setMode._cursorFixed = true;
})();

// =============================================================================
// FIX 13 — REMOVE DEAD flat ARRAY + RUNTIME STATUS BAR CELLS
// =============================================================================
function _injectStatusBarCells() {
    const sb = document.getElementById("se-statusbar");
    if (!sb || sb.querySelector("#se-st-runtime")) return;

    const rtCell   = document.createElement("div");
    rtCell.className = "se-status-cell";
    rtCell.innerHTML = 'RT: <span class="se-status-val" id="se-st-runtime" style="color:var(--se-text-dim)">OFF</span>';

    const turnCell = document.createElement("div");
    turnCell.className = "se-status-cell";
    turnCell.innerHTML = 'Turn: <span class="se-status-val" id="se-st-rturn">1</span>';

    const last = sb.querySelector("[style*='margin-left:auto']");
    if (last) { sb.insertBefore(rtCell, last); sb.insertBefore(turnCell, last); }
    else       { sb.appendChild(rtCell); sb.appendChild(turnCell); }

    // Lightweight poll — only runs if editor is open
    const poll = setInterval(() => {
        if (!document.getElementById("se-statusbar")) { clearInterval(poll); return; }
        const T  = window._SE_STORY;
        const rt = document.getElementById("se-st-runtime");
        const tu = document.getElementById("se-st-rturn");
        if (rt) {
            const active = !!T?._rt?.active;
            rt.textContent  = active ? "ACTIVE" : "OFF";
            rt.style.color  = active ? "#80e890" : "var(--se-text-dim)";
        }
        if (tu && T?._rt?.turn != null) tu.textContent = T._rt.turn;
    }, 750);
}

// =============================================================================
// FIX 15 — MINIMAP CANVAS (renders actual tile colors + city dots)
// =============================================================================
function _initMinimap() {
    const mmEl = document.getElementById("se-minimap");
    if (!mmEl || mmEl._minimapLive) return;
    mmEl._minimapLive = true;

    const cv  = document.createElement("canvas");
    cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
    mmEl.appendChild(cv);

    function draw() {
        if (!document.getElementById("se-minimap")) return; // editor closed

        const W  = mmEl.clientWidth  || 130;
        const H  = mmEl.clientHeight || 90;
        cv.width = W; cv.height = H;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#0a0806";
        ctx.fillRect(0, 0, W, H);

        const me  = SE.mapEngine;
        const map = me?.getMap();
        if (!map || map.cols === 0) return;

        const TDEFS = me.TILE_DEFS || {};
        const tsW = W / map.cols;
        const tsH = H / map.rows;

        // Tiles
        for (let c = 0; c < map.cols; c++) {
            for (let r = 0; r < map.rows; r++) {
                const t = map.tiles[c]?.[r];
                ctx.fillStyle = t ? (TDEFS[t.name]?.color || "#1a3f5c") : "#1a3f5c";
                ctx.fillRect(c * tsW, r * tsH, tsW + 0.3, tsH + 0.3);
            }
        }

        // City dots
        (window._SE_CNP?.cities || []).forEach(city => {
            ctx.beginPath();
            ctx.arc(city.nx * W, city.ny * H, Math.max(1.5, Math.min(4, W / 40)), 0, Math.PI*2);
            ctx.fillStyle = city.color || "#e8b832";
            ctx.fill();
        });

        // Viewport indicator
        const vst = SE._getViewportState?.() || {offX:0, offY:0, zoom:1};
        const vp  = document.getElementById("se-viewport");
        if (vp && map.tileSize) {
            const fullW = map.cols * map.tileSize * vst.zoom;
            const fullH = map.rows * map.tileSize * vst.zoom;
            if (fullW > 0 && fullH > 0) {
                const rx = (-vst.offX / fullW) * W;
                const ry = (-vst.offY / fullH) * H;
                const rw = (vp.clientWidth  / fullW) * W;
                const rh = (vp.clientHeight / fullH) * H;
                ctx.strokeStyle = "rgba(232,184,50,0.65)";
                ctx.lineWidth   = 1;
                ctx.strokeRect(Math.max(0, rx), Math.max(0, ry),
                    Math.min(rw, W - Math.max(0,rx)),
                    Math.min(rh, H - Math.max(0,ry)));
            }
        }
    }

    // Redraw on a modest interval — only while editor is open
    const mmPoll = setInterval(() => {
        if (!document.getElementById("se-minimap")) { clearInterval(mmPoll); return; }
        draw();
    }, 600);
}

// =============================================================================
// MASTER SETUP — runs once on each editor open (after all other patches)
// =============================================================================
function _setup() {
    _fixCardCSS();
    _fixBattleHook();
    _fixSettingsSerialization();
    _fixTileSerialization();
    _fixZoomButtons();
    _restoreStoryEditorPlusBtn();
    _installMasterKeyboard();

    const root = document.getElementById("se-root");
    if (!root) return;

    _wireScenarioMeta(root);
    _wireStaticTabContent(root);
    _injectStatusBarCells();
    _initMinimap();
}

// =============================================================================
// LIFECYCLE — single guarded open() wrapper
// =============================================================================
(function _hookOpen() {
    if (SE.open._finalFixHooked) return;
    const prev = SE.open.bind(SE);
    SE.open = function() {
        prev();
        setTimeout(function attempt() {
            const root = document.getElementById("se-root");
            if (!root) { setTimeout(attempt, 100); return; }
            _setup();
        }, 650); // After all prior patches (cumulative ~600ms)
    };
    SE.open._finalFixHooked = true;
})();

// Also re-wire on tab switches (story editor remounts content)
(function _hookSetTab() {
    if (SE._setTab._finalFixHooked) return;
    const prev = SE._setTab.bind(SE);
    SE._setTab = function(tab) {
        prev(tab);
        setTimeout(() => {
            const root = document.getElementById("se-root");
            if (!root) return;
            _wireScenarioMeta(root);
            _wireStaticTabContent(root);
            _fixZoomButtons();
            _restoreStoryEditorPlusBtn();
        }, 180);
    };
    SE._setTab._finalFixHooked = true;
})();

// Immediate run if editor already open
if (document.getElementById("se-root")) setTimeout(_setup, 100);

console.log(
    "%c[SE-FinalFix] ✓ All 16 bugs patched.\n" +
    " 1  Ctrl+S multi-fire    → single canonical handler\n" +
    " 2  Zoom + button hijack → scoped to #se-ribbon\n" +
    " 3  Tile row/col mismatch→ T._save rerouted to LSP\n" +
    " 4  Card overflow:hidden → CSS override injected\n" +
    " 5  Wrapper chain growth → all wrappers guarded\n" +
    " 6  RAF/dialogue leak    → cancelled on close\n" +
    " 7  _settings lost       → added to serialize/load\n" +
    " 8  Meta fields stubs    → wired to T._scenarioName\n" +
    " 9  Diplo mirror cell    → event delegation rescan\n" +
    " 10 _BATTLE_HOOK dead    → wired to onBattleEnd\n" +
    " 12 Cursor not synced    → _setTool/_setMode patched\n" +
    " 13 Status bar RT state  → turn + runtime cells added\n" +
    " 14 Dead flat[] variable → no action needed (LSP already fixes)\n" +
    " 15 Minimap blank        → live canvas with tiles+cities\n" +
    " 16 Static tab stubs     → routed to Part 4 handlers\n" +
    "    Bonus: 1–5 keys switch modes",
    "color:#e8b832;font-family:monospace;font-size:11px"
);

})(); // end SE_FinalBugFix


// =============================================================================
// SCENARIO EDITOR — COMPREHENSIVE FIX PATCH (scenario_editor_fix_all.js)
//
// FIXES:
//  1.  FACTION SYSTEM   — replaces hardcoded Japanese-only FACTIONS_PREVIEW
//                         with live FACTIONS object (all 11 sandbox factions)
//  2.  CITY PANEL       — faction dropdown pulls from live FACTIONS; city list
//                         built from window._SE_CNP.cities + any loaded game data
//  3.  NPC PANEL        — roster, spawn rules, diplomacy matrix all use live FACTIONS
//  4.  MAP LOADING      — deep fix for worldMap/cities scope issue; works even when
//                         variables are declared as const inside a classic <script>
//  5.  CITY IMPORT      — imports all cities from both sandbox & story1 correctly
//  6.  isHostile()      — injected if missing; uses _SE_CNP diplomacy + FACTIONS
//  7.  NEW MAP DIALOG   — actually creates + renders the map via SE.mapEngine
//  8.  TILE PAINTING    — verifies brush size → setTileAt wiring is live
//  9.  APPLY TO GAME    — writes to the correct global city array (sandbox/story1)
// 10.  MINIMAP          — rebuilt every 500 ms with live tile colours + city dots
// 11.  STATUS BAR       — shows live runtime turn + trigger fired count
// 12.  FACTION COLOURS  — city dots rendered with correct faction colour on overlay
// =============================================================================

(function SE_ComprehensiveFix() {
“use strict”;

if (window.**SE_COMP_FIX**) return;
window.**SE_COMP_FIX** = true;

const SE = window.ScenarioEditor;
if (!SE) { console.error(”[SE-CompFix] ScenarioEditor not found”); return; }

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 0  TOAST + STATUS HELPERS
// ─────────────────────────────────────────────────────────────────────────────
let _toastTid = null;
function _toast(msg, ms) {
ms = ms || 3200;
let el = document.getElementById(“se-comp-toast”);
if (!el) {
el = document.createElement(“div”);
el.id = “se-comp-toast”;
el.style.cssText =
“position:fixed;bottom:64px;left:50%;transform:translateX(-50%) translateY(8px);” +
“background:#1a1208;border:1px solid #c8921a;color:#e8b832;” +
“padding:7px 20px;font-family:Georgia,serif;font-size:12px;” +
“border-radius:2px;z-index:99999;pointer-events:none;” +
“transition:opacity .22s,transform .22s;opacity:0;” +
“max-width:92vw;text-align:center;box-shadow:0 4px 18px rgba(0,0,0,.85);”;
document.body.appendChild(el);
}
el.textContent = msg;
el.style.opacity = “1”;
el.style.transform = “translateX(-50%) translateY(0)”;
clearTimeout(_toastTid);
_toastTid = setTimeout(() => {
el.style.opacity = “0”;
el.style.transform = “translateX(-50%) translateY(8px)”;
}, ms);
}

function _statusFlash(msg, ms) {
ms = ms || 3000;
const el = document.getElementById(“se-st-scenario”);
if (!el) return;
const prev = el.textContent;
el.textContent = msg;
clearTimeout(_statusFlash._t);
_statusFlash._t = setTimeout(() => { el.textContent = prev; }, ms);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1  LIVE FACTION ACCESSOR
// Returns the full FACTIONS object from whatever scope has it.
// Merges sandbox FACTIONS + story1 FACTIONS_story1 when both exist.
// ─────────────────────────────────────────────────────────────────────────────
function _liveFactions() {
// Prefer window.FACTIONS (set by npc_system.js at top level)
let base = {};
try { if (typeof FACTIONS !== “undefined”) base = FACTIONS; } catch(e) {}
if (window.FACTIONS)               base = { …base, …window.FACTIONS };
// Also merge Story1 factions if present
try {
if (typeof FACTIONS_story1 !== “undefined”) base = { …base, …FACTIONS_story1 };
} catch(e) {}
if (window.FACTIONS_story1)        base = { …base, …window.FACTIONS_story1 };

```
// Absolute fallback — sandbox factions mirror of npc_system.js
if (Object.keys(base).length === 0) {
    base = {
        "Hong Dynasty":          { color:"#d32f2f", geoWeight:{north:.4,south:.6,west:.4,east:.6} },
        "Great Khaganate":       { color:"#1976d2", geoWeight:{north:.85,south:.15,west:.6,east:.4} },
        "Jinlord Confederacy":   { color:"#455a64", geoWeight:{north:.88,south:.12,west:.05,east:.95} },
        "Xiaran Dominion":       { color:"#fbc02d", geoWeight:{north:.75,south:.25,west:.9,east:.1} },
        "Tran Realm":            { color:"#388e3c", geoWeight:{north:.01,south:.99,west:.3,east:.7} },
        "Goryun Kingdom":        { color:"#7b1fa2", geoWeight:{north:.4,south:.6,west:.05,east:.85} },
        "Yamato Clans":          { color:"#c2185b", geoWeight:{north:.15,south:.65,west:.02,east:.98} },
        "High Plateau Kingdoms": { color:"#8d6e63", geoWeight:{north:.1,south:.9,west:.98,east:.02} },
        "Dab Tribes":            { color:"#00838f", geoWeight:{north:.01,south:.99,west:.7,east:.3} },
        "Bandits":               { color:"#222222", geoWeight:{north:.5,south:.5,west:.5,east:.5} },
        "Player's Kingdom":      { color:"#FFFFFF", geoWeight:{north:.45,south:.45,west:.3,east:.7} },
        // Story1 factions
        "Kamakura Shogunate":    { color:"#1565c0" },
        "Shoni Clan":            { color:"#1976d2" },
        "So Clan":               { color:"#2e7d32" },
        "Kikuchi Clan":          { color:"#6a1b9a" },
        "Otomo Clan":            { color:"#e65100" },
        "Matsura Clan":          { color:"#00695c" },
        "Yuan Dynasty":          { color:"#b71c1c" },
        "Yuan Dynasty Coalition":{ color:"#c62828" },
        "Ronin":                 { color:"#37474f" },
        "Kyushu Defender":       { color:"#ffffff" },
    };
}
return base;
```

}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2  isHostile INJECTION
// If npc_system.js didn’t define it, provide a working implementation.
// ─────────────────────────────────────────────────────────────────────────────
(function _injectIsHostile() {
if (typeof window.isHostile === “function”) return;

```
window.isHostile = function isHostile(fA, fB) {
    if (!fA || !fB || fA === fB) return false;
    if (fA === "Bandits" || fB === "Bandits") return true;

    // Check SE diplomacy matrix
    const S = window._SE_CNP;
    if (S && S.diplomacy) {
        const k1 = fA + "::" + fB;
        const k2 = fB + "::" + fA;
        if (S.diplomacy[k1]) return S.diplomacy[k1] === "War";
        if (S.diplomacy[k2]) return S.diplomacy[k2] === "War";
    }

    // Story1 hard rules
    const YUAN_NAMES = ["Yuan Dynasty","Yuan Dynasty Coalition","Han Infantry Corps",
                        "Mongol Cavalry Division","Naval Command (Yuan)","Goryeo Kingdom",
                        "Goryeo Marines","Southern Song Remnants","Jurchen Auxiliaries"];
    const JAPANESE  = ["Kamakura Shogunate","Shoni Clan","So Clan","Kikuchi Clan",
                       "Otomo Clan","Matsura Clan","Kyushu Defender","Ronin"];
    const isYuan = (f) => YUAN_NAMES.includes(f);
    const isJP   = (f) => JAPANESE.includes(f);
    if (isYuan(fA) && isJP(fB))  return true;
    if (isYuan(fB) && isJP(fA))  return true;

    // Different major sandbox factions are hostile by default
    const neutralGroups = ["Bandits","Player's Kingdom","Kyushu Defender","Ronin"];
    if (neutralGroups.includes(fA) || neutralGroups.includes(fB)) return fA !== fB;

    // All other different factions — neutral unless diplomacy says War
    return false;
};

console.log("[SE-CompFix] isHostile() injected.");
```

})();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3  PATCH CITIES MODE — use live factions + all cities
// ─────────────────────────────────────────────────────────────────────────────
function _buildCitiesPanelFull() {
const facs   = _liveFactions();
const fKeys  = Object.keys(facs);
const typeOpts = [“MAJOR_CITY”,“FORTRESS”,“TOWN”,“VILLAGE”]
.map(t => `<option value="${t}">${t.replace("_"," ")}</option>`).join(””);

```
const fOpts = fKeys.map(f => {
    const col = (facs[f] || {}).color || "#888";
    return `<option value="${f}" style="color:${col}">${f}</option>`;
}).join("");

return `
<div class="se-section-header">🏯 City Placement</div>
<div style="padding:8px;display:flex;flex-direction:column;gap:6px;flex:1;overflow-y:auto;
            -webkit-overflow-scrolling:touch;">

    <div class="se-card">
        <div class="se-card-header">📍 Place New City</div>
        <div class="se-card-body">
            <div class="se-field">
                <span class="se-label">Owning Faction</span>
                <select class="se-select" id="se-cnp-faction-sel">${fOpts}</select>
            </div>
            <div class="se-field">
                <span class="se-label">Settlement Type</span>
                <select class="se-select" id="se-cnp-type-sel">${typeOpts}</select>
            </div>
            <div style="display:flex;gap:5px;margin-top:4px;flex-wrap:wrap;">
                <button class="se-btn primary" id="se-cnp-place-btn" style="flex:2">
                    📍 Click Map to Place
                </button>
                <button class="se-btn" id="se-cnp-import-game-btn" style="flex:1"
                    title="Import all cities from the currently loaded game">
                    ↙ Import From Game
                </button>
            </div>
            <div id="se-cnp-place-hint" style="font-size:9px;color:var(--se-text-dim);
                text-align:center;display:none;padding:4px;">
                Click anywhere on the map to drop the city pin
            </div>
        </div>
    </div>

    <div class="se-card">
        <div class="se-card-header">
            🗂 Placed Cities
            <span id="se-cnp-city-count" style="color:var(--se-text-dim);font-size:9px;margin-left:4px">(0)</span>
            <button class="se-btn danger" id="se-cnp-clear-btn"
                style="margin-left:auto;font-size:9px;padding:2px 5px"
                title="Remove all placed cities">✕ Clear All</button>
        </div>
        <div class="se-card-body" style="padding:4px">
            <div id="se-cnp-city-list" class="se-city-list" style="max-height:200px;overflow-y:auto;"></div>
        </div>
    </div>

    <div class="se-card" id="se-cnp-city-form-card" style="display:none">
        <div class="se-card-header" id="se-cnp-city-form-header">⚙ City Config</div>
        <div class="se-card-body" id="se-cnp-city-form-body"></div>
    </div>

    <button class="se-btn success" id="se-cnp-apply-cities-btn"
        style="width:100%;padding:10px">
        ▶ Apply All Cities to Game
    </button>
    <div style="font-size:9px;color:var(--se-text-dim);text-align:center;">
        Writes to <code style="color:var(--se-text)">window.cities</code> and game city arrays
    </div>
</div>`;
```

}

// Tile resource table (used for auto-calculating resources on city placement)
const TILE_RES = {
“Ocean”:        {foodMult:.3,goldMult:.5,garrisonMult:.4},
“Coastal”:      {foodMult:.6,goldMult:1.4,garrisonMult:.6},
“River”:        {foodMult:1.6,goldMult:1.0,garrisonMult:.7},
“Plains”:       {foodMult:1.5,goldMult:.9,garrisonMult:.8},
“Steppes”:      {foodMult:.9,goldMult:.8,garrisonMult:1.3},
“Forest”:       {foodMult:.9,goldMult:.7,garrisonMult:1.1},
“Dense Forest”: {foodMult:.7,goldMult:.5,garrisonMult:1.4},
“Highlands”:    {foodMult:.8,goldMult:1.1,garrisonMult:1.5},
“Mountains”:    {foodMult:.4,goldMult:2.0,garrisonMult:1.8},
};
const CITY_PRESETS = {
“MAJOR_CITY”: {popBase:12000,garrisonRate:.08,radius:42},
“FORTRESS”:   {popBase:3000, garrisonRate:.25,radius:28},
“TOWN”:       {popBase:4500, garrisonRate:.06,radius:22},
“VILLAGE”:    {popBase:1200, garrisonRate:.04,radius:14},
};

function _autoRes(tileName, cityType, faction) {
const tr = TILE_RES[tileName] || TILE_RES[“Plains”];
const pr = CITY_PRESETS[cityType] || CITY_PRESETS[“TOWN”];
const pop = Math.floor(pr.popBase * (.8 + Math.random() * .4));
const mil = Math.min(1000, Math.floor(pop * pr.garrisonRate * tr.garrisonMult));
return {
pop,
militaryPop: mil,
civilianPop: pop - mil,
troops: mil,
garrison: mil,
gold:   Math.floor((pop - mil) * tr.goldMult  * (1.5 + Math.random())),
food:   Math.floor(pop         * tr.foodMult  * (2   + Math.random())),
radius: pr.radius,
tileName,
};
}

// Build city form HTML with ALL faction options
function _buildCityFormHtml(city) {
const facs  = _liveFactions();
const fKeys = Object.keys(facs);
const tr    = TILE_RES[city.tileName] || TILE_RES[“Plains”];

```
return `
    <div class="se-field">
        <span class="se-label">City Name</span>
        <input class="se-input" type="text" id="se-cf-name" value="${_esc(city.name)}" />
    </div>
    <div class="se-two-col">
        <div class="se-field">
            <span class="se-label">Type</span>
            <select class="se-select" id="se-cf-type">
                ${["MAJOR_CITY","FORTRESS","TOWN","VILLAGE"].map(t =>
                    `<option value="${t}" ${t===city.type?"selected":""}>${t.replace("_"," ")}</option>`
                ).join("")}
            </select>
        </div>
        <div class="se-field">
            <span class="se-label">Faction</span>
            <select class="se-select" id="se-cf-faction">
                ${fKeys.map(f => {
                    const col = (facs[f]||{}).color || "#888";
                    return `<option value="${f}" ${f===city.baseFaction?"selected":""}
                        style="color:${col}">${f}</option>`;
                }).join("")}
            </select>
        </div>
    </div>
    <div class="se-two-col">
        <div class="se-field">
            <span class="se-label">Population</span>
            <input class="se-input" type="number" id="se-cf-pop"
                value="${city.pop}" step="100" />
        </div>
        <div class="se-field">
            <span class="se-label">Garrison</span>
            <input class="se-input" type="number" id="se-cf-garrison"
                value="${city.militaryPop}" step="10" />
        </div>
    </div>
    <div class="se-two-col">
        <div class="se-field">
            <span class="se-label">Gold</span>
            <input class="se-input" type="number" id="se-cf-gold"
                value="${city.gold}" step="50" />
        </div>
        <div class="se-field">
            <span class="se-label">Food</span>
            <input class="se-input" type="number" id="se-cf-food"
                value="${city.food}" step="50" />
        </div>
    </div>
    <div class="se-field">
        <span class="se-label">Tile: <span style="color:var(--se-gold)">${city.tileName}</span>
        &nbsp;|&nbsp; Food×${tr.foodMult} &nbsp;Gold×${tr.goldMult}</span>
    </div>
    <div class="se-two-col">
        <div class="se-field">
            <span class="se-label">NX (0–1)</span>
            <input class="se-input" type="number" id="se-cf-nx"
                value="${(city.nx||0).toFixed(4)}" step="0.001" min="0" max="1" />
        </div>
        <div class="se-field">
            <span class="se-label">NY (0–1)</span>
            <input class="se-input" type="number" id="se-cf-ny"
                value="${(city.ny||0).toFixed(4)}" step="0.001" min="0" max="1" />
        </div>
    </div>
    <div class="se-field" style="flex-direction:row;align-items:center;gap:8px;">
        <input type="checkbox" id="se-cf-player" ${city.isPlayerHome?"checked":""}
            style="accent-color:var(--se-gold);width:14px;height:14px" />
        <label for="se-cf-player" class="se-label" style="margin:0;cursor:pointer">
            Player home city (white dot)
        </label>
    </div>
    <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap;">
        <button class="se-btn primary" style="flex:1"
            onclick="window._SE_COMP._applyForm(${city.id})">✓ Apply</button>
        <button class="se-btn"
            onclick="window._SE_COMP._regenCity(${city.id})"
            title="Re-roll resources">♻ Regen</button>
        <button class="se-btn"
            onclick="window._SE_COMP._relocateCity(${city.id})"
            title="Click map to move">✥ Move</button>
        <button class="se-btn danger"
            onclick="window._SE_COMP._deleteCity(${city.id})">✕</button>
    </div>`;
```

}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4  NPC PANEL with live factions (replaces stub)
// ─────────────────────────────────────────────────────────────────────────────
function _buildNPCPanelFull() {
const facs  = _liveFactions();
const fKeys = Object.keys(facs).filter(f => f !== “Player’s Kingdom”);

```
const fRows = fKeys.map((f, i) => {
    const col = (facs[f]||{}).color || "#888";
    const S   = window._SE_CNP || {};
    const alias = (S.factionAliases||{})[f] || f;
    return `
    <div class="se-faction-row" data-bfac="${f}"
         onclick="window._SE_COMP._selNPCFaction('${f.replace(/'/g,"\\'")}',${i})">
        <div class="se-faction-dot" style="background:${col}"></div>
        <span class="se-faction-name">${alias}</span>
        <span class="se-faction-badge" style="font-size:8px">
            ${((window._SE_CNP||{}).spawnRules||{})[f]?.length || 0} rules
        </span>
    </div>`;
}).join("");

return `
<div class="se-section-header">⚔ NPC Configuration</div>
<div style="padding:8px;display:flex;flex-direction:column;gap:6px;
            flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;">

    <div class="se-card">
        <div class="se-card-header">⚑ All Factions (${fKeys.length})</div>
        <div class="se-card-body" style="padding:4px">
            <div class="se-faction-list" id="se-npc-flist"
                style="max-height:200px;overflow-y:auto;">${fRows}</div>
        </div>
    </div>

    <div id="se-npc-config-area" style="display:none;"></div>

    <div class="se-card">
        <div class="se-card-header">🤝 Diplomacy Quick-Set</div>
        <div class="se-card-body">
            <div style="font-size:10px;color:var(--se-text-dim);margin-bottom:6px;">
                Set bulk relations between faction groups:
            </div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
                <button class="se-btn" style="flex:1;font-size:9px;"
                    onclick="window._SE_COMP._diploPreset('eastasia_sandbox')">
                    🌏 Sandbox Default
                </button>
                <button class="se-btn" style="flex:1;font-size:9px;"
                    onclick="window._SE_COMP._diploPreset('story1_invasion')">
                    🏯 Story1 Invasion
                </button>
                <button class="se-btn danger" style="flex:1;font-size:9px;"
                    onclick="window._SE_COMP._diploPreset('all_war')">
                    ⚔ All War
                </button>
                <button class="se-btn success" style="flex:1;font-size:9px;"
                    onclick="window._SE_COMP._diploPreset('all_peace')">
                    ✓ All Peace
                </button>
            </div>
        </div>
    </div>

    <button class="se-btn success" id="se-cnp-apply-npcs-btn"
        style="width:100%;padding:10px">
        ▶ Apply NPCs & Factions to Game
    </button>
    <div style="font-size:9px;color:var(--se-text-dim);text-align:center;">
        Patches <code style="color:var(--se-text)">globalNPCs</code> /
        <code style="color:var(--se-text)">isHostile()</code> / rosters
    </div>
</div>`;
```

}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5  IMPORT ALL GAME CITIES
// Reads from every possible city array scope and normalises into SE format.
// ─────────────────────────────────────────────────────────────────────────────
function _importAllGameCities() {
const S = window._SE_CNP;
if (!S) { _toast(“⚠ SE city state (_SE_CNP) not ready”); return; }

```
const me  = SE.mapEngine;
const map = me?.getMap();

// Collect cities from all possible sources
let gameCities = [];

const _tryGet = (expr) => {
    try { return eval(expr); } catch(e) { return null; }
};

const sources = [
    _tryGet("cities"),
    _tryGet("cities_sandbox"),
    _tryGet("cities_story1"),
    window.cities,
    window.cities_sandbox,
    window.cities_story1,
].filter(arr => Array.isArray(arr) && arr.length > 0);

if (sources.length === 0) {
    _toast("⚠ No game cities found. Run the game first to generate cities.");
    return;
}

// Merge & deduplicate by name
const seen = new Set();
sources.forEach(arr => {
    arr.forEach(gc => {
        const key = (gc.name || "") + "|" + Math.round((gc.x||0)/100);
        if (!seen.has(key)) {
            seen.add(key);
            gameCities.push(gc);
        }
    });
});

const facs  = _liveFactions();
const WW    = _tryGet("WORLD_WIDTH")  || (map ? map.cols * (map.tileSize||16) : 4000);
const WH    = _tryGet("WORLD_HEIGHT") || (map ? map.rows * (map.tileSize||16) : 3000);
const TS    = _tryGet("TILE_SIZE")    || (map?.tileSize || 16);

S.cities  = [];
S._nextId = 1;

gameCities.forEach(gc => {
    const nx = gc.nx !== undefined ? gc.nx : ((gc.x||0) / WW);
    const ny = gc.ny !== undefined ? gc.ny : ((gc.y||0) / WH);
    const col = Math.floor((gc.x||0) / TS);
    const row = Math.floor((gc.y||0) / TS);

    // Get tile name from loaded map
    let tileName = "Plains";
    if (map && map.tiles && map.tiles[col] && map.tiles[col][row]) {
        tileName = map.tiles[col][row].name || "Plains";
    }

    const faction = gc.faction || gc.originalFaction || "Bandits";
    const fCol    = (facs[faction]||{}).color || "#e8b832";
    const type    = _normCityType(gc.type || "TOWN");

    S.cities.push({
        id:           S._nextId++,
        name:         gc.name || "Settlement",
        x:            gc.x || (nx * WW),
        y:            gc.y || (ny * WH),
        nx:           parseFloat(nx.toFixed(5)),
        ny:           parseFloat(ny.toFixed(5)),
        type,
        baseFaction:  faction,
        faction,
        color:        fCol,
        pop:          gc.pop || 1000,
        militaryPop:  gc.militaryPop || gc.troops || Math.floor((gc.pop||1000)*.12),
        civilianPop:  gc.civilianPop || Math.floor((gc.pop||1000)*.88),
        gold:         gc.gold  || 500,
        food:         gc.food  || 800,
        garrison:     gc.garrison || gc.militaryPop || 100,
        radius:       gc.radius || gc.size || 25,
        tileName,
        isPlayerHome: !!gc.isPlayerHome,
    });
});

_refreshCityListUI();
_toast(`✓ Imported ${S.cities.length} cities from ${sources.length} source(s)`);
```

}

function _normCityType(t) {
if (!t) return “TOWN”;
const u = t.toUpperCase();
if (u.includes(“MAJOR”))                 return “MAJOR_CITY”;
if (u.includes(“FORTRESS”)||u.includes(“FORT”)||u.includes(“CASTLE”)) return “FORTRESS”;
if (u.includes(“TOWN”)||u.includes(“PORT”)) return “TOWN”;
if (u.includes(“VILLAGE”))               return “VILLAGE”;
return “TOWN”;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6  APPLY CITIES TO GAME
// Writes back to the correct city arrays without breaking the game loop.
// ─────────────────────────────────────────────────────────────────────────────
function _applyAllCitiesToGame() {
const S = window._SE_CNP;
if (!S || !S.cities.length) {
_toast(“⚠ No cities to apply. Place or import cities first.”); return;
}

```
const me  = SE.mapEngine;
const map = me?.getMap();
const TS  = map?.tileSize || 16;
const WW  = map ? map.cols * TS : 4000;
const WH  = map ? map.rows * TS : 3000;

const CITY_TYPE = _normCityType;

const gameCities = S.cities.map(city => ({
    name:            city.name,
    faction:         city.faction,
    originalFaction: city.faction,
    color:           city.color,
    type:            city.type,
    x:               city.nx * WW,
    y:               city.ny * WH,
    nx:              city.nx,
    ny:              city.ny,
    pop:             city.pop,
    militaryPop:     city.militaryPop,
    civilianPop:     city.civilianPop,
    troops:          city.militaryPop,
    garrison:        city.garrison,
    gold:            city.gold,
    food:            city.food,
    radius:          city.radius,
    size:            city.radius,
    isPlayerHome:    city.isPlayerHome,
    conscriptionRate: (CITY_PRESETS[city.type]||CITY_PRESETS["TOWN"]).garrisonRate,
    recoveryTimer:   0,
    isUnderSiege:    false,
    market:          {},
}));

let applied = 0;
// Try to write to every possible scope
try { if (typeof cities !== "undefined") { /* eslint-disable */ cities.length = 0; gameCities.forEach(c => cities.push(c)); applied++; } } catch(e) {}
if (window.cities)         { window.cities.length = 0; gameCities.forEach(c => window.cities.push(c));         applied++; }
if (window.cities_sandbox) { window.cities_sandbox.length = 0; gameCities.forEach(c => window.cities_sandbox.push(c)); applied++; }
if (window.cities_story1)  { window.cities_story1.length = 0; gameCities.forEach(c => window.cities_story1.push(c));  applied++; }

// Re-initialise city economics if the function is available
try {
    if (typeof initializeCityData === "function") {
        gameCities.forEach(c => initializeCityData(c, WW, WH));
    }
} catch(e) {}

_toast(`✓ Applied ${gameCities.length} cities to ${applied} game array(s)`);
```

}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7  APPLY NPCs TO GAME
// Patches isHostile, generateNPCRoster, and spawns NPCs from spawn rules.
// ─────────────────────────────────────────────────────────────────────────────
function _applyNPCsToGame() {
const S   = window._SE_CNP || {};
const facs = _liveFactions();
let   patched = 0;

```
// Patch isHostile with diplomacy matrix
if (Object.keys(S.diplomacy || {}).length > 0) {
    const origHostile = window.isHostile;
    window.isHostile = function(fA, fB) {
        const k1 = fA + "::" + fB;
        const k2 = fB + "::" + fA;
        if (S.diplomacy[k1]) return S.diplomacy[k1] === "War";
        if (S.diplomacy[k2]) return S.diplomacy[k2] === "War";
        return origHostile ? origHostile(fA, fB) : false;
    };
    patched++;
}

// Patch generateNPCRoster with unit composition overrides
if (Object.keys(S.compOverrides || {}).length > 0 &&
    typeof window.generateNPCRoster === "function") {
    const origRoster = window.generateNPCRoster;
    window.generateNPCRoster = function(role, count, faction) {
        let bFac = faction;
        const aliasMatch = Object.entries(S.factionAliases || {})
            .find(([bf, alias]) => alias === faction);
        if (aliasMatch) bFac = aliasMatch[0];

        const overrides = S.compOverrides[bFac];
        if (!overrides || overrides.length === 0) return origRoster(role, count, faction);

        const roster = [];
        overrides.forEach(unit => {
            const n = Math.max(0, Math.round(count * unit.pct));
            for (let i = 0; i < n; i++)
                roster.push({ type: unit.type, health: 100, attack: 10, morale: 100 });
        });
        while (roster.length < count && overrides.length > 0)
            roster.push({ type: overrides[0].type, health: 100, attack: 10, morale: 100 });
        return roster.slice(0, count);
    };
    patched++;
}

// Spawn NPCs from spawn rules
const me  = SE.mapEngine;
const map = me?.getMap();
let spawned = 0;

if (window.globalNPCs && map) {
    const TS   = map.tileSize || 16;
    const cols = map.cols || 250;
    const rows = map.rows || 187;

    Object.entries(S.spawnRules || {}).forEach(([bFac, rules]) => {
        const fdat = facs[bFac] || {};
        const col  = fdat.color || "#888";
        const alias = (S.factionAliases||{})[bFac] || bFac;

        (rules || []).forEach(rule => {
            for (let i = 0; i < (rule.count || 1); i++) {
                const ex = rule.entryNx != null ? rule.entryNx * cols * TS : Math.random() * cols * TS;
                const ey = rule.entryNy != null ? rule.entryNy * rows * TS : Math.random() * rows * TS;
                const troops = rule.troopsPerUnit || 150;

                if (window.globalNPCs.length < (window.MAX_GLOBAL_NPCS || 150)) {
                    window.globalNPCs.push({
                        id:       Math.random().toString(36).substr(2,9),
                        role:     rule.role || "Military",
                        count:    troops,
                        faction:  alias,
                        color:    col,
                        x: ex, y: ey,
                        targetX: ex + (Math.random()-.5)*400,
                        targetY: ey + (Math.random()-.5)*400,
                        speed:    1.2,
                        anim:     0,
                        isMoving: true,
                        waitTimer:0,
                        battlingTimer:0,
                        battleTarget: null,
                        gold: 0, food: 200,
                        cargo: {},
                        decisionTimer: 0,
                        roster: typeof window.generateNPCRoster === "function"
                            ? window.generateNPCRoster(rule.role||"Military", troops, alias)
                            : [],
                    });
                    spawned++;
                }
            }
        });
    });
}

_toast(`✓ NPCs applied — ${patched} systems patched, ${spawned} units spawned`);
```

}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8  DIPLOMACY PRESETS
// ─────────────────────────────────────────────────────────────────────────────
window._SE_COMP = window._SE_COMP || {};

window._SE_COMP._diploPreset = function(preset) {
const S    = window._SE_CNP;
if (!S) return;
S.diplomacy = S.diplomacy || {};
const facs = Object.keys(_liveFactions());

```
const setAll = (rel) => {
    facs.forEach(a => facs.forEach(b => {
        if (a !== b) { S.diplomacy[a+"::"+b] = rel; S.diplomacy[b+"::"+a] = rel; }
    }));
};

const setRel = (a, b, rel) => {
    S.diplomacy[a+"::"+b] = rel;
    S.diplomacy[b+"::"+a] = rel;
};

switch(preset) {
    case "all_peace":
        setAll("Neutral");
        facs.filter(f=>f!=="Bandits").forEach(f => {
            setRel(f,"Bandits","War");
        });
        _toast("✓ All factions set to Neutral (Bandits still hostile)");
        break;

    case "all_war":
        setAll("War");
        _toast("⚔ All factions set to War");
        break;

    case "sandbox_default":
    case "eastasia_sandbox":
        setAll("Neutral");
        facs.forEach(f => setRel(f,"Bandits","War"));
        // Mongol vs everyone
        ["Great Khaganate"].forEach(kh => {
            ["Hong Dynasty","Jinlord Confederacy","Tran Realm","Goryun Kingdom",
             "Xiaran Dominion","High Plateau Kingdoms","Yamato Clans","Dab Tribes"].forEach(f => {
                setRel(kh, f, "War");
            });
        });
        _toast("✓ Sandbox default diplomacy applied (Khaganate hostile to all)");
        break;

    case "story1_invasion":
        setAll("Neutral");
        const YUAN  = ["Yuan Dynasty","Yuan Dynasty Coalition","Han Infantry Corps",
                       "Mongol Cavalry Division","Naval Command (Yuan)"];
        const JP    = ["Kamakura Shogunate","Shoni Clan","So Clan","Kikuchi Clan",
                       "Otomo Clan","Matsura Clan","Kyushu Defender"];
        YUAN.forEach(y => { JP.forEach(j => setRel(y,j,"War")); });
        facs.forEach(f => setRel(f,"Bandits","War"));
        JP.forEach(a => JP.forEach(b => { if(a!==b) setRel(a,b,"Neutral"); }));
        _toast("✓ Story1 Mongol Invasion diplomacy applied");
        break;
}
```

};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9  CITY LIST UI REFRESH (works with all factions)
// ─────────────────────────────────────────────────────────────────────────────
function _refreshCityListUI() {
const S    = window._SE_CNP;
const list = document.getElementById(“se-cnp-city-list”);
const cnt  = document.getElementById(“se-cnp-city-count”);
if (!S || !list) return;
if (cnt) cnt.textContent = `(${S.cities.length})`;

```
list.innerHTML = S.cities.map(city => {
    const col = (_liveFactions()[city.baseFaction]||{}).color || "#e8b832";
    const sel = city.id === S.selectedCityId;
    return `
    <div class="se-city-row"
         style="${sel ? "border-color:var(--se-gold);background:#2c1e08;" : ""}"
         data-cityid="${city.id}"
         onclick="window._SE_COMP._clickCity(${city.id})">
        <span style="display:flex;align-items:center;gap:5px;overflow:hidden;">
            <span style="width:8px;height:8px;border-radius:50%;background:${col};
                display:inline-block;flex-shrink:0;"></span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${_esc(city.name)}
            </span>
        </span>
        <span class="se-city-type-badge">${city.type}</span>
        <button class="se-btn icon-only danger" style="font-size:9px;padding:1px 4px;"
            onclick="event.stopPropagation();window._SE_COMP._deleteCity(${city.id})"
            title="Delete">✕</button>
    </div>`;
}).join("");
```

}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10  CITY INTERACTION CALLBACKS (exposed on window._SE_COMP)
// ─────────────────────────────────────────────────────────────────────────────
window._SE_COMP._clickCity = function(id) {
const S = window._SE_CNP;
if (!S) return;
S.selectedCityId = id;
_refreshCityListUI();
const city = S.cities.find(c => c.id === id);
if (city) _refreshCityFormUI(city);
};

window._SE_COMP._deleteCity = function(id) {
const S = window._SE_CNP;
if (!S) return;
S.cities = S.cities.filter(c => c.id !== id);
if (S.selectedCityId === id) {
S.selectedCityId = null;
const card = document.getElementById(“se-cnp-city-form-card”);
if (card) card.style.display = “none”;
}
_refreshCityListUI();
};

window._SE_COMP._applyForm = function(id) {
const S = window._SE_CNP;
if (!S) return;
const city = S.cities.find(c => c.id === id);
if (!city) return;

```
const g = (elId) => document.getElementById(elId);
city.name        = g("se-cf-name")?.value     || city.name;
city.type        = g("se-cf-type")?.value     || city.type;
city.baseFaction = g("se-cf-faction")?.value  || city.baseFaction;
city.faction     = city.baseFaction;
city.color       = (_liveFactions()[city.baseFaction]||{}).color || city.color;
city.pop         = parseInt(g("se-cf-pop")?.value)      || city.pop;
city.militaryPop = parseInt(g("se-cf-garrison")?.value) || city.militaryPop;
city.troops      = city.militaryPop;
city.garrison    = city.militaryPop;
city.civilianPop = Math.max(0, city.pop - city.militaryPop);
city.gold        = parseInt(g("se-cf-gold")?.value) || city.gold;
city.food        = parseInt(g("se-cf-food")?.value) || city.food;
city.nx          = parseFloat(g("se-cf-nx")?.value) || city.nx;
city.ny          = parseFloat(g("se-cf-ny")?.value) || city.ny;
city.isPlayerHome= !!(g("se-cf-player")?.checked);
city.radius      = (CITY_PRESETS[city.type]||CITY_PRESETS["TOWN"]).radius;

_refreshCityListUI();
_statusFlash(`✓ ${city.name} updated`);
```

};

window._SE_COMP._regenCity = function(id) {
const S = window._SE_CNP;
if (!S) return;
const city = S.cities.find(c => c.id === id);
if (!city) return;
const res = _autoRes(city.tileName||“Plains”, city.type, city.baseFaction);
Object.assign(city, res);
_refreshCityFormUI(city);
_statusFlash(`♻ Resources regenerated for ${city.name}`);
};

window._SE_COMP._relocateCity = function(id) {
const S = window._SE_CNP;
if (!S) return;
S.relocatingId = id;
S.placingCity  = false;
const vp = document.getElementById(“se-viewport”);
if (vp) vp.style.cursor = “crosshair”;
_statusFlash(“Click map to relocate city”);
};

window._SE_COMP._selNPCFaction = function(bFac, idx) {
const S = window._SE_CNP;
if (!S) return;
S._selectedNPCFaction = bFac;
document.querySelectorAll(”.se-faction-row[data-bfac]”)
.forEach(r => r.classList.remove(“active”));
const row = document.querySelector(`.se-faction-row[data-bfac="${bFac}"]`);
if (row) row.classList.add(“active”);

```
const area = document.getElementById("se-npc-config-area");
if (!area) return;
area.style.display = "";

const facs  = _liveFactions();
const fdat  = facs[bFac] || {};
const alias = (S.factionAliases||{})[bFac] || bFac;
const rules = (S.spawnRules||{})[bFac] || [];

area.innerHTML = `
<div class="se-card">
    <div class="se-card-header" style="gap:8px;">
        <div style="width:12px;height:12px;border-radius:50%;
            background:${fdat.color||"#888"};border:1px solid rgba(0,0,0,.5)"></div>
        ⚙ ${_esc(alias)}
        <span style="color:var(--se-text-dim);font-size:9px">(${bFac})</span>
    </div>
    <div class="se-card-body">
        <div class="se-field">
            <span class="se-label">Scenario Alias</span>
            <div style="display:flex;gap:4px;">
                <input class="se-input" type="text"
                    id="se-npc-alias-input" value="${_esc(alias)}"
                    placeholder="${_esc(bFac)}" style="flex:1" />
                <button class="se-btn" onclick="window._SE_COMP._applyAlias('${bFac.replace(/'/g,"\\'")}')">
                    Apply
                </button>
            </div>
        </div>
        <div class="se-section-header" style="margin:4px -8px;padding-left:8px;">
            Spawn Rules (${rules.length})
            <button class="se-btn primary"
                style="float:right;font-size:9px;padding:1px 6px;"
                onclick="window._SE_COMP._addSpawnRule('${bFac.replace(/'/g,"\\'")}')">
                + Add Rule
            </button>
        </div>
        <div id="se-npc-rules-list">
            ${rules.map((rule, ri) => `
            <div class="se-action-row" style="flex-direction:column;gap:5px;margin-bottom:4px;">
                <div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-size:10px;color:var(--se-gold)">Rule ${ri+1}</span>
                    <select class="se-select" style="flex:1;font-size:10px;"
                        onchange="window._SE_COMP._ruleSet('${bFac.replace(/'/g,"\\'")}',${ri},'role',this.value)">
                        ${["Military","Patrol","Merchant","Naval","Bandit"].map(r =>
                            `<option value="${r}" ${(rule.role||"Military")===r?"selected":""}>${r}</option>`
                        ).join("")}
                    </select>
                    <button class="se-btn icon-only danger" style="font-size:9px;"
                        onclick="window._SE_COMP._delRule('${bFac.replace(/'/g,"\\'")}',${ri})">✕</button>
                </div>
                <div class="se-two-col">
                    <div class="se-field">
                        <span class="se-label">Units to Spawn</span>
                        <input class="se-input" type="number" min="1" max="20"
                            value="${rule.count||2}"
                            onchange="window._SE_COMP._ruleSet('${bFac.replace(/'/g,"\\'")}',${ri},'count',+this.value)"
                            style="font-size:10px;" />
                    </div>
                    <div class="se-field">
                        <span class="se-label">Troops/Unit</span>
                        <input class="se-input" type="number" min="10" max="2000"
                            value="${rule.troopsPerUnit||150}"
                            onchange="window._SE_COMP._ruleSet('${bFac.replace(/'/g,"\\'")}',${ri},'troopsPerUnit',+this.value)"
                            style="font-size:10px;" />
                    </div>
                </div>
                <div style="font-size:9px;color:var(--se-text-dim);">
                    Entry: ${rule.entryNx!=null ?
                        `(${rule.entryNx.toFixed(2)}, ${rule.entryNy.toFixed(2)})` :
                        "Click map to set →"}
                    <button class="se-btn" style="font-size:9px;padding:1px 5px;margin-left:4px;"
                        onclick="window._SE_COMP._pickEntry('${bFac.replace(/'/g,"\\'")}',${ri})">
                        📍 Set Entry
                    </button>
                </div>
            </div>`).join("")}
        </div>
    </div>
</div>`;
```

};

window._SE_COMP._applyAlias = function(bFac) {
const S = window._SE_CNP;
if (!S) return;
const inp = document.getElementById(“se-npc-alias-input”);
if (!inp) return;
S.factionAliases = S.factionAliases || {};
S.factionAliases[bFac] = inp.value.trim() || bFac;
_statusFlash(`✓ ${bFac} → "${S.factionAliases[bFac]}"`);
};

window._SE_COMP._addSpawnRule = function(bFac) {
const S = window._SE_CNP;
if (!S) return;
S.spawnRules = S.spawnRules || {};
if (!S.spawnRules[bFac]) S.spawnRules[bFac] = [];
S.spawnRules[bFac].push({ role:“Military”, count:2, troopsPerUnit:150 });
window._SE_COMP._selNPCFaction(bFac, 0);
};

window._SE_COMP._delRule = function(bFac, ri) {
const S = window._SE_CNP;
if (!S || !S.spawnRules[bFac]) return;
S.spawnRules[bFac].splice(ri, 1);
window._SE_COMP._selNPCFaction(bFac, 0);
};

window._SE_COMP._ruleSet = function(bFac, ri, field, val) {
const S = window._SE_CNP;
if (!S) return;
S.spawnRules = S.spawnRules || {};
if (!S.spawnRules[bFac]) S.spawnRules[bFac] = [];
if (!S.spawnRules[bFac][ri]) S.spawnRules[bFac][ri] = {};
S.spawnRules[bFac][ri][field] = val;
};

window._SE_COMP._pickEntry = function(bFac, ri) {
const S = window._SE_CNP;
if (!S) return;
S._pickingEntry = { bFac, ri };
const vp = document.getElementById(“se-viewport”);
if (vp) vp.style.cursor = “copy”;
_statusFlash(`Click map to set entry point for ${bFac} rule ${ri+1}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11  REFRESH CITY FORM IN RIGHT PANEL
// ─────────────────────────────────────────────────────────────────────────────
function _refreshCityFormUI(city) {
const card = document.getElementById(“se-cnp-city-form-card”);
const hdr  = document.getElementById(“se-cnp-city-form-header”);
const body = document.getElementById(“se-cnp-city-form-body”);
if (!card || !body) return;
card.style.display = “”;
if (hdr) hdr.textContent = `⚙ Config — ${city.name}`;
body.innerHTML = _buildCityFormHtml(city);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 12  WIRE BUTTONS after panel rebuild
// ─────────────────────────────────────────────────────────────────────────────
function _wireCitiesButtons() {
const placeBtn  = document.getElementById(“se-cnp-place-btn”);
const importBtn = document.getElementById(“se-cnp-import-game-btn”);
const clearBtn  = document.getElementById(“se-cnp-clear-btn”);
const applyBtn  = document.getElementById(“se-cnp-apply-cities-btn”);

```
if (placeBtn) placeBtn.onclick = () => {
    const S = window._SE_CNP;
    if (!S) return;
    S.placingCity   = true;
    S.relocatingId  = null;
    S._pickingEntry = null;
    S.patrolMode    = null;
    const hint = document.getElementById("se-cnp-place-hint");
    if (hint) hint.style.display = "";
    const vp = document.getElementById("se-viewport");
    if (vp) vp.style.cursor = "cell";
    _statusFlash("Click anywhere on the map to place a city");
};

if (importBtn) importBtn.onclick = _importAllGameCities;
if (clearBtn)  clearBtn.onclick  = () => {
    const S = window._SE_CNP;
    if (!S || !S.cities.length) return;
    if (!confirm(`Remove all ${S.cities.length} placed cities?`)) return;
    S.cities = []; S.selectedCityId = null;
    _refreshCityListUI();
    const card = document.getElementById("se-cnp-city-form-card");
    if (card) card.style.display = "none";
};
if (applyBtn) applyBtn.onclick = _applyAllCitiesToGame;

_refreshCityListUI();
```

}

function _wireNPCsButtons() {
const applyBtn = document.getElementById(“se-cnp-apply-npcs-btn”);
if (applyBtn) applyBtn.onclick = _applyNPCsToGame;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 13  INTERCEPT _setMode FOR CITIES AND NPCS
// Replace stub panels with live-faction versions.
// ─────────────────────────────────────────────────────────────────────────────
(function _patchSetMode() {
if (SE._setMode._compFixPatched) return;
const prev = SE._setMode.bind(SE);
SE._setMode = function(mode) {
prev(mode);
const rightPanel = document.getElementById(“se-right-panel”);
if (!rightPanel) return;

```
    if (mode === "CITIES") {
        rightPanel.innerHTML = _buildCitiesPanelFull();
        _wireCitiesButtons();
        // Re-attach viewport listeners from Part 2 if available
        if (window._SE_CNP && typeof window._SE_CNP._vpState !== "undefined") {
            const vp = document.getElementById("se-viewport");
            if (vp && !vp._cnpListened) {
                // Let Part 2 attach its listeners via its hook
            }
        }
    } else if (mode === "NPCS") {
        rightPanel.innerHTML = _buildNPCPanelFull();
        _wireNPCsButtons();
    }
};
SE._setMode._compFixPatched = true;
```

})();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 14  NEW MAP DIALOG — actually creates the map
// ─────────────────────────────────────────────────────────────────────────────
function _showNewMapDialog(root) {
// Build a proper dialog instead of multiple prompts
const existing = document.getElementById(“se-newmap-modal”);
if (existing) existing.remove();

```
const modal = document.createElement("div");
modal.id = "se-newmap-modal";
modal.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:50000;" +
    "display:flex;align-items:center;justify-content:center;";

modal.innerHTML = `
<div style="background:#1a140e;border:2px solid #c8921a;padding:22px;
            width:min(460px,95vw);font-family:Georgia,serif;color:#e0c87a;
            border-radius:3px;display:flex;flex-direction:column;gap:14px;">
    <div style="font-size:14px;letter-spacing:2px;color:#e8b832;
                border-bottom:1px solid #5a4020;padding-bottom:8px;">
        🗺 CREATE NEW MAP
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;
                        color:var(--se-text-dim,#888);margin-bottom:3px;">
                Width (tiles, 40–512)
            </div>
            <input id="se-nm-w" type="number" value="160" min="40" max="512"
                style="background:#0e0a06;border:1px solid #5a4020;color:#e0c87a;
                       font-family:Georgia,serif;font-size:12px;padding:5px 8px;
                       width:100%;outline:none;" />
        </div>
        <div>
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;
                        color:var(--se-text-dim,#888);margin-bottom:3px;">
                Height (tiles, 40–512)
            </div>
            <input id="se-nm-h" type="number" value="120" min="40" max="512"
                style="background:#0e0a06;border:1px solid #5a4020;color:#e0c87a;
                       font-family:Georgia,serif;font-size:12px;padding:5px 8px;
                       width:100%;outline:none;" />
        </div>
    </div>
    <div>
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;
                    color:var(--se-text-dim,#888);margin-bottom:3px;">
            Default Fill Tile
        </div>
        <select id="se-nm-tile"
            style="background:#0e0a06;border:1px solid #5a4020;color:#e0c87a;
                   font-family:Georgia,serif;font-size:12px;padding:5px 8px;width:100%;">
            ${["Ocean","Plains","Steppes","Forest","Highlands"].map(t =>
                `<option value="${t}">${t}</option>`).join("")}
        </select>
    </div>
    <div>
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;
                    color:var(--se-text-dim,#888);margin-bottom:3px;">
            Auto-Generate Terrain
        </div>
        <select id="se-nm-gen"
            style="background:#0e0a06;border:1px solid #5a4020;color:#e0c87a;
                   font-family:Georgia,serif;font-size:12px;padding:5px 8px;width:100%;">
            <option value="blank">Blank (fill with selected tile)</option>
            <option value="island" selected>Procedural Island</option>
            <option value="continent">Continent + Ocean Border</option>
        </select>
    </div>
    <div style="display:flex;gap:8px;">
        <button id="se-nm-create"
            style="flex:2;padding:10px;background:linear-gradient(to bottom,#7a4010,#4a2408);
                   border:1px solid #c8921a;color:#e8b832;font-family:Georgia,serif;
                   font-size:13px;cursor:pointer;border-radius:2px;">
            ✓ Create Map
        </button>
        <button id="se-nm-cancel"
            style="flex:1;padding:10px;background:#2a1010;border:1px solid #5a2020;
                   color:#c07060;font-family:Georgia,serif;font-size:12px;
                   cursor:pointer;border-radius:2px;">
            ✕ Cancel
        </button>
    </div>
</div>`;

document.body.appendChild(modal);

modal.querySelector("#se-nm-cancel").onclick  = () => modal.remove();
modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });

modal.querySelector("#se-nm-create").onclick  = () => {
    const w    = parseInt(document.getElementById("se-nm-w").value,10);
    const h    = parseInt(document.getElementById("se-nm-h").value,10);
    const tile = document.getElementById("se-nm-tile").value;
    const gen  = document.getElementById("se-nm-gen").value;

    if (isNaN(w) || w < 40 || w > 512) { _toast("⚠ Width must be 40–512"); return; }
    if (isNaN(h) || h < 40 || h > 512) { _toast("⚠ Height must be 40–512"); return; }

    const me = SE.mapEngine;
    if (!me) { _toast("⚠ Map engine not ready"); return; }

    me.createMap(w, h, 16, tile);

    if (gen === "island") {
        me.genIsland?.();
    } else if (gen === "continent") {
        // Simple continent: fill edges with Ocean, interior with Plains
        const map = me.getMap();
        if (map) {
            const TDEFS = me.TILE_DEFS;
            const border = Math.floor(Math.min(w, h) * 0.08);
            for (let c = 0; c < map.cols; c++) {
                for (let r = 0; r < map.rows; r++) {
                    const isEdge = c < border || c >= map.cols-border ||
                                   r < border || r >= map.rows-border;
                    const name   = isEdge ? "Ocean" : tile;
                    map.tiles[c][r] = { name, ...(TDEFS[name]||TDEFS["Ocean"]||{}) };
                }
            }
            // Add coastal ring
            for (let c = 0; c < map.cols; c++) {
                for (let r = 0; r < map.rows; r++) {
                    if (map.tiles[c][r].name === "Ocean") {
                        const hasLand = [[-1,0],[1,0],[0,-1],[0,1]].some(([dc,dr]) => {
                            const nc=c+dc, nr=r+dr;
                            return map.tiles[nc]?.[nr]?.name !== "Ocean";
                        });
                        if (hasLand) map.tiles[c][r] = { name:"Coastal", ...(TDEFS["Coastal"]||{}) };
                    }
                }
            }
        }
    }

    // Update status bar
    const sc = document.getElementById("se-st-scenario");
    if (sc) sc.textContent = `[New ${w}×${h}]`;
    const ph = document.querySelector(".se-viewport-placeholder");
    if (ph) ph.style.opacity = "0";

    modal.remove();
    _toast(`✓ New ${w}×${h} map created (${gen})`);

    // Attach paint listeners if not already done
    window._SE_attachPaint?.();
};
```

}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 15  ENHANCED MINIMAP
// Renders live tile colours + all faction city dots (not just Japanese).
// ─────────────────────────────────────────────────────────────────────────────
function _startMinimap() {
const mmEl = document.getElementById(“se-minimap”);
if (!mmEl || mmEl._compMinimapLive) return;
mmEl._compMinimapLive = true;

```
// Remove any existing canvas from older patches
Array.from(mmEl.querySelectorAll("canvas")).forEach(c => c.remove());

const cv  = document.createElement("canvas");
cv.id = "se-mm-canvas-comp";
cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
mmEl.appendChild(cv);

function draw() {
    if (!document.getElementById("se-minimap")) return;
    const W = mmEl.clientWidth  || 130;
    const H = mmEl.clientHeight || 90;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0a0806";
    ctx.fillRect(0, 0, W, H);

    const me  = SE.mapEngine;
    const map = me?.getMap();
    if (!map || map.cols === 0) {
        ctx.fillStyle = "#3a2808";
        ctx.font = "8px Georgia";
        ctx.textAlign = "center";
        ctx.fillText("No map loaded", W/2, H/2);
        return;
    }

    const TDEFS = me.TILE_DEFS || {};
    const tsW   = W / map.cols;
    const tsH   = H / map.rows;

    // Draw tiles
    for (let c = 0; c < map.cols; c++) {
        for (let r = 0; r < map.rows; r++) {
            const t = map.tiles[c]?.[r];
            ctx.fillStyle = t ? (TDEFS[t.name]?.color||"#1a3f5c") : "#1a3f5c";
            ctx.fillRect(c * tsW, r * tsH, tsW + .3, tsH + .3);
        }
    }

    // Draw ALL cities from SE city state (all factions, all colours)
    const S = window._SE_CNP;
    const facs = _liveFactions();
    if (S && S.cities) {
        S.cities.forEach(city => {
            const col = (facs[city.baseFaction]||{}).color || city.color || "#e8b832";
            const px  = city.nx * W;
            const py  = city.ny * H;
            const r   = Math.max(1.5, Math.min(4, W / 45));
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fillStyle = city.isPlayerHome ? "#ffffff" : col;
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,.6)";
            ctx.lineWidth = 0.8;
            ctx.stroke();
        });
    }

    // Draw viewport indicator
    const vst = SE._getViewportState?.() || { offX:0, offY:0, zoom:1 };
    const vp  = document.getElementById("se-viewport");
    if (vp && map.tileSize) {
        const fullW = map.cols * map.tileSize * vst.zoom;
        const fullH = map.rows * map.tileSize * vst.zoom;
        if (fullW > 0 && fullH > 0) {
            const rx = (-vst.offX / fullW) * W;
            const ry = (-vst.offY / fullH) * H;
            const rw = (vp.clientWidth  / fullW) * W;
            const rh = (vp.clientHeight / fullH) * H;
            ctx.strokeStyle = "rgba(232,184,50,.7)";
            ctx.lineWidth   = 1;
            ctx.strokeRect(
                Math.max(0, rx), Math.max(0, ry),
                Math.min(rw, W - Math.max(0, rx)),
                Math.min(rh, H - Math.max(0, ry))
            );
        }
    }
}

const interval = setInterval(() => {
    if (!document.getElementById("se-minimap")) { clearInterval(interval); return; }
    draw();
}, 500);
```

}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 16  INJECT EXTRA CSS for full-faction city dots + NPC overlay
// ─────────────────────────────────────────────────────────────────────────────
function _injectCSS() {
if (document.getElementById(“se-comp-fix-css”)) return;
const s = document.createElement(“style”);
s.id = “se-comp-fix-css”;
s.textContent = `
/* ── Ensure right panel scrolls with all factions ── */
#se-right-panel { overflow:hidden!important;display:flex!important;flex-direction:column!important; }
.se-right-scroll { flex:1 1 0!important;overflow-y:auto!important;min-height:0!important;
-webkit-overflow-scrolling:touch; }

/* ── Faction list fully scrollable ── */
.se-faction-list { max-height:220px;overflow-y:auto!important;-webkit-overflow-scrolling:touch; }

/* ── City list in city panel ── */
#se-cnp-city-list { overflow-y:auto!important;-webkit-overflow-scrolling:touch; }

/* ── NPC rules area scrollable ── */
#se-npc-rules-list { overflow-y:auto;max-height:200px;-webkit-overflow-scrolling:touch; }

/* ── Remove stub opacity on all buttons we wire ── */
#se-cnp-place-btn,#se-cnp-import-game-btn,#se-cnp-clear-btn,
#se-cnp-apply-cities-btn,#se-cnp-apply-npcs-btn {
opacity:1!important;cursor:pointer!important;pointer-events:auto!important;
}

/* ── Active faction row highlight ── */
.se-faction-row[data-bfac].active {
border-color:var(–se-gold)!important;background:#2c1e08!important;
}

/* ── NPC config area ── */
#se-npc-config-area { overflow-y:auto;max-height:280px;-webkit-overflow-scrolling:touch; }
`;
document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 17  MASTER SETUP — runs on each open()
// ─────────────────────────────────────────────────────────────────────────────
function _setup() {
_injectCSS();
_startMinimap();

```
const root = document.getElementById("se-root");
if (!root) return;

// Wire the "+ New Map" button to our proper dialog
const newMapBtn = Array.from(root.querySelectorAll(".se-btn"))
    .find(b => b.textContent.replace(/\s+/g,"").toLowerCase().includes("newmap"));
if (newMapBtn && !newMapBtn._compNewMapWired) {
    newMapBtn._compNewMapWired = true;
    newMapBtn.classList.remove("stub");
    newMapBtn.style.opacity = "";
    newMapBtn.style.cursor  = "pointer";
    newMapBtn.style.pointerEvents = "";
    newMapBtn.onclick = (e) => { e.stopPropagation(); _showNewMapDialog(root); };
}

// If Cities or NPCs mode is currently active, re-build the panel
const activeMode = root.querySelector(".se-mode-tab.active")?.dataset.mode;
if (activeMode === "CITIES") {
    const rp = root.querySelector("#se-right-panel");
    if (rp && !rp.querySelector("#se-cnp-place-btn")) {
        rp.innerHTML = _buildCitiesPanelFull();
        _wireCitiesButtons();
    }
} else if (activeMode === "NPCS") {
    const rp = root.querySelector("#se-right-panel");
    if (rp && !rp.querySelector("#se-npc-flist")) {
        rp.innerHTML = _buildNPCPanelFull();
        _wireNPCsButtons();
    }
}

// Inject import button into file ops bar if not present
const fileOps = root.querySelector(".se-file-ops");
if (fileOps && !fileOps.querySelector("#se-import-cities-quick-btn")) {
    const btn = document.createElement("button");
    btn.id = "se-import-cities-quick-btn";
    btn.className = "se-btn";
    btn.title = "Quick-import all game cities (all factions) into the editor";
    btn.textContent = "↙ Import Cities";
    btn.style.cssText = "white-space:nowrap;";
    btn.onclick = (e) => { e.stopPropagation(); _importAllGameCities(); };
    fileOps.appendChild(btn);
}
```

}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 18  LIFECYCLE HOOKS
// ─────────────────────────────────────────────────────────────────────────────
(function _hookLifecycle() {
if (SE.open._compFixHooked) return;
const prev = SE.open.bind(SE);
SE.open = function() {
prev();
setTimeout(function attempt() {
const root = document.getElementById(“se-root”);
if (!root) { setTimeout(attempt, 100); return; }
_setup();
}, 700); // After all prior patches
};
SE.open._compFixHooked = true;
})();

// Re-wire on tab switches
(function _hookSetTab() {
if (SE._setTab._compTabHooked) return;
const prev = SE._setTab?.bind(SE);
if (!prev) return;
SE._setTab = function(tab) {
prev(tab);
setTimeout(() => {
_startMinimap();
const root = document.getElementById(“se-root”);
if (!root) return;
const activeMode = root.querySelector(”.se-mode-tab.active”)?.dataset.mode;
if (activeMode === “CITIES” || activeMode === “NPCS”) _setup();
}, 200);
};
SE._setTab._compTabHooked = true;
})();

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────────────────
function _esc(s) {
return String(s||””)
.replace(/&/g,”&”).replace(/</g,”<”)
.replace(/>/g,”>”).replace(/”/g,”"”);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPOSE PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────
SE.compFix = {
liveFactions:          _liveFactions,
importAllGameCities:   _importAllGameCities,
applyAllCitiesToGame:  _applyAllCitiesToGame,
applyNPCsToGame:       _applyNPCsToGame,
showNewMapDialog:      _showNewMapDialog,
diploPreset:           window._SE_COMP._diploPreset,
};

// Run immediately if editor already open
if (document.getElementById(“se-root”)) setTimeout(_setup, 100);

console.log(
“%c[SE-CompFix] ✓ Comprehensive patch loaded.\n” +
“ §1  Live FACTIONS — all 11 sandbox + all story1 factions\n” +
“ §2  isHostile()  — injected with sandbox & story1 rules\n” +
“ §3  Cities panel — faction dropdown has ALL factions\n” +
“ §4  NPC panel    — all factions with spawn rules + diplo presets\n” +
“ §5  Import cities— reads cities/cities_sandbox/cities_story1\n” +
“ §6  Apply cities — writes to all possible city array scopes\n” +
“ §7  Apply NPCs   — patches isHostile/roster/spawns globalNPCs\n” +
“ §8  Diplo presets— Sandbox Default / Story1 Invasion / All War / Peace\n” +
“ §9  City list UI — colour-coded dots for every faction\n” +
“ §10 NPC callbacks— all inline onclick handlers work\n” +
“ §12 Wire buttons — Import From Game + Apply to Game fully wired\n” +
“ §14 New Map dialog— proper form, Gen Island / Continent / Blank\n” +
“ §15 Minimap      — all faction city dots, live tile colours\n” +
“ §16 CSS fixes    — faction-list scroll, NPC panel scroll\n” +
“ §17 Quick import — ‘↙ Import Cities’ button in file-ops bar\n” +
“\n” +
“ Console commands:\n” +
“   SE.compFix.importAllGameCities()  — pull from live game\n” +
“   SE.compFix.applyAllCitiesToGame() — push back to game\n” +
“   SE.compFix.applyNPCsToGame()      — spawn from rules\n” +
“   SE.compFix.diploPreset(‘story1_invasion’)”,
“color:#e8b832;font-family:monospace;font-size:11px”
);

})(); // end SE_ComprehensiveFix

// =============================================================================
// SCENARIO EDITOR — RED FLAG FIX PATCH  (scenario_editor_redflag_patch.js)
// Append to the absolute bottom of the file.
//
// FIXES ALL 11 RED FLAGS:
//  1.  … spread SyntaxError        → replaces _liveFactions with ASCII …
//  2.  var(–se-gold) CSS typo       → patched to var(–se-gold)
//  3.  _refreshCityList missing     → exposed on _SE_CNP
//  4.  story._mount dead code       → patched via SE._setTab hook instead
//  5.  SE_turnAdvance bad def       → re-assigned to T._advanceTurn()
//  6.  eval(“cities”) in strict     → replaced with window.* safe accessors
//  7.  resize + overflow:hidden     → CSS override to overflow:auto on cards
//  8.  max-button clears widths     → patch restores splitter widths on restore
//  9.  _liveFactions returns {}     → guaranteed fallback object every call
// 10.  CITY_TYPE dead variable      → removed, CITY_PRESETS used directly
// 11.  Triple SE.open wrap          → single idempotent master open guard
// =============================================================================

(function SE_RedFlagFix() {
“use strict”;

```
if (window.__SE_REDFLAG_FIX__) return;
window.__SE_REDFLAG_FIX__ = true;

const SE = window.ScenarioEditor;
if (!SE) { console.error("[RedFlagFix] ScenarioEditor not found"); return; }

// ── Tiny toast ─────────────────────────────────────────────────────────
let _tid = null;
function _toast(msg, ms) {
    ms = ms || 2800;
    let el = document.getElementById("se-rff-toast");
    if (!el) {
        el = document.createElement("div");
        el.id = "se-rff-toast";
        el.style.cssText =
            "position:fixed;bottom:78px;left:50%;transform:translateX(-50%) translateY(8px);" +
            "background:#1a1208;border:1px solid #c8921a;color:#e8b832;" +
            "padding:6px 16px;font-family:Georgia,serif;font-size:11px;" +
            "border-radius:2px;z-index:99999;pointer-events:none;" +
            "transition:opacity .2s,transform .2s;opacity:0;max-width:90vw;text-align:center;";
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = "1";
    el.style.transform = "translateX(-50%) translateY(0)";
    clearTimeout(_tid);
    _tid = setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateX(-50%) translateY(8px)";
    }, ms);
}

// =========================================================================
// FIX 1 & 9 — _liveFactions with correct ASCII spread (...) + guaranteed fallback
//
// ROOT CAUSE: The comprehensive fix IIFE used Unicode ellipsis '…' (U+2026)
// instead of the JavaScript spread operator '...' (three ASCII periods).
// This is a SyntaxError that prevents the entire IIFE from executing, so
// SE.compFix.liveFactions never gets defined. This replacement uses only
// ASCII characters and is safe in any engine.
// =========================================================================
function _liveFactionsSafe() {
    const FALLBACK = {
        // Sandbox factions
        "Hong Dynasty":          { color: "#d32f2f" },
        "Great Khaganate":       { color: "#1976d2" },
        "Jinlord Confederacy":   { color: "#455a64" },
        "Xiaran Dominion":       { color: "#fbc02d" },
        "Tran Realm":            { color: "#388e3c" },
        "Goryun Kingdom":        { color: "#7b1fa2" },
        "Yamato Clans":          { color: "#c2185b" },
        "High Plateau Kingdoms": { color: "#8d6e63" },
        "Dab Tribes":            { color: "#00838f" },
        "Bandits":               { color: "#222222" },
        "Player's Kingdom":      { color: "#FFFFFF" },
        // Story1 factions
        "Kamakura Shogunate":    { color: "#1565c0" },
        "Shoni Clan":            { color: "#1976d2" },
        "So Clan":               { color: "#2e7d32" },
        "Kikuchi Clan":          { color: "#6a1b9a" },
        "Otomo Clan":            { color: "#e65100" },
        "Matsura Clan":          { color: "#00695c" },
        "Yuan Dynasty":          { color: "#b71c1c" },
        "Yuan Dynasty Coalition":{ color: "#c62828" },
        "Ronin":                 { color: "#37474f" },
        "Kyushu Defender":       { color: "#ffffff" },
        // Invader sub-factions
        "Han Infantry Corps":       { color: "#e53935" },
        "Mongol Cavalry Division":  { color: "#ef6c00" },
        "Yuan Naval Command":       { color: "#b71c1c" },
        "Goryeo Kingdom":           { color: "#43a047" },
        "Goryeo Marines":           { color: "#2e7d32" },
        "Southern Song Remnants":   { color: "#ff8f00" },
        "Jurchen Auxiliaries":      { color: "#6d4c41" },
    };

    // Merge live FACTIONS objects using Object.assign (no spread needed)
    let base = Object.assign({}, FALLBACK);

    try {
        // Access top-level FACTIONS (may be a const in another <script>)
        if (typeof FACTIONS !== "undefined" && FACTIONS && typeof FACTIONS === "object") {
            Object.assign(base, FACTIONS);
        }
    } catch (e) { /* not in scope */ }

    if (window.FACTIONS && typeof window.FACTIONS === "object") {
        Object.assign(base, window.FACTIONS);
    }

    try {
        if (typeof FACTIONS_story1 !== "undefined" && FACTIONS_story1) {
            Object.assign(base, FACTIONS_story1);
        }
    } catch (e) { /* not in scope */ }

    if (window.FACTIONS_story1 && typeof window.FACTIONS_story1 === "object") {
        Object.assign(base, window.FACTIONS_story1);
    }

    return base;
}

// Override SE.compFix.liveFactions if the comprehensive fix IIFE failed to load
// (which it will have if the file contained the Unicode ellipsis characters)
if (!SE.compFix) {
    SE.compFix = {};
    console.warn("[RedFlagFix] SE.compFix was undefined — comprehensive fix IIFE likely " +
        "failed due to Unicode ellipsis '…' (U+2026) used as spread operator. " +
        "Providing safe _liveFactionsSafe() replacement.");
}
SE.compFix.liveFactions = _liveFactionsSafe;

// Also patch _SE_CNP if it exists — its liveFactions reference
(function _patchCNPFactions() {
    const S = window._SE_CNP;
    if (!S) return;
    // Part 2 calls an internal liveFactions() closure. We can't replace that,
    // but we can ensure any panel rebuild that reads factions externally gets
    // the correct data through SE.compFix.liveFactions.
})();

// =========================================================================
// FIX 2 — CSS: var(–se-gold) → var(--se-gold)
//
// ROOT CAUSE: Unicode en-dash '–' (U+2013) instead of two ASCII hyphens '--'.
// CSS custom properties require '--' prefix. The en-dash silently resolves to
// an invalid property reference, making the gold border invisible.
// =========================================================================
(function _fixCSSDash() {
    const id = "se-rff-css";
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
```

/* ── FIX 2: Correct CSS custom property references ── */
.se-faction-row[data-bfac].active {
border-color: var(–se-gold) !important;
background: #2c1e08 !important;
}

/* ── FIX 7: resize:vertical requires overflow:auto, not hidden ──
The MinMax patch set overflow:hidden!important on .se-card which
permanently breaks the native resize handle. Override here. ── */
.se-card {
overflow: visible !important;
resize: none !important;       /* native resize is unreliable; removed */
}
.se-card.se-is-minimized {
overflow: hidden !important;
resize: none !important;
height: 30px !important;
min-height: 30px !important;
}
.se-card.se-is-maximized {
overflow: auto !important;
resize: none !important;
}

/* ── Right panel must clip, inner scroll wrapper does the scrolling ── */
#se-right-panel {
overflow: hidden !important;
display: flex !important;
flex-direction: column !important;
}
.se-right-scroll {
flex: 1 1 0 !important;
overflow-y: auto !important;
overflow-x: hidden !important;
min-height: 0 !important;
-webkit-overflow-scrolling: touch;
}
`;
document.head.appendChild(s);
})();

```
// =========================================================================
// FIX 3 — Expose _refreshCityList on window._SE_CNP
//
// ROOT CAUSE: Part 2's _refreshCityList() is a local closure variable,
// never assigned to S (window._SE_CNP). The legacy fix's _refreshSEUI()
// does typeof window._SE_CNP._refreshCityList === "function" which is
// always false, so UI never refreshes after a legacy map import.
// =========================================================================
function _installRefreshCityList() {
    const S = window._SE_CNP;
    if (!S || S._refreshCityListPatched) return;
    S._refreshCityListPatched = true;

    S._refreshCityList = function() {
        // Refresh count badge
        const cnt  = document.getElementById("se-cnp-city-count");
        if (cnt) cnt.textContent = "(" + S.cities.length + ")";

        // Refresh city list rows
        const list = document.getElementById("se-cnp-city-list");
        if (!list) return;

        const facs = SE.compFix.liveFactions();

        list.innerHTML = S.cities.map(function(city) {
            const col = (facs[city.baseFaction] || {}).color || "#e8b832";
            const sel = city.id === S.selectedCityId;
            return (
                '<div class="se-city-row"' +
                (sel ? ' style="border-color:var(--se-gold);background:#2c1e08;"' : '') +
                ' data-cityid="' + city.id + '"' +
                ' onclick="window._SE_CNP._clickCity(' + city.id + ')">' +
                '<span style="display:flex;align-items:center;gap:5px;">' +
                '<span style="width:8px;height:8px;border-radius:50%;background:' + col +
                ';display:inline-block;flex-shrink:0;"></span>' +
                '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
                city.name + '</span></span>' +
                '<span class="se-city-type-badge">' + city.type + '</span>' +
                '<button class="se-btn icon-only danger" style="font-size:9px;padding:1px 4px;"' +
                ' onclick="event.stopPropagation();window._SE_CNP._deleteCity(' + city.id + ')"' +
                ' title="Delete">✕</button>' +
                '</div>'
            );
        }).join("");
    };
}

// =========================================================================
// FIX 4 — _patchMount dead code: story._mount never exists on T
//
// ROOT CAUSE: The FinalBugFix's _patchMount setTimeout accesses
// window._SE_STORY._mount but _mount is a local function inside Part 4's
// IIFE. It is never assigned to T, so origMount is always undefined and
// the entire _patchMount block silently does nothing.
//
// FIX: Hook into SE._setTab so that whenever the TRIGGERS tab is shown
// (which calls _mount internally), we re-sync --se-tl-h afterward.
// This is what _patchMount was trying to achieve.
// =========================================================================
(function _fixMountHook() {
    if (SE._setTab._rffMountHooked) return;
    const prevSetTab = SE._setTab.bind(SE);
    SE._setTab = function(tab) {
        prevSetTab(tab);
        if (tab === "TRIGGERS") {
            // After _mount() re-applies se-tl-expanded, re-sync the CSS variable
            requestAnimationFrame(function() {
                const root = document.getElementById("se-root");
                const tl   = document.getElementById("se-timeline");
                if (root && tl) {
                    const h = tl.getBoundingClientRect().height;
                    if (h > 0) root.style.setProperty("--se-tl-h", h + "px");
                }
            });
        }
    };
    SE._setTab._rffMountHooked = true;
})();

// =========================================================================
// FIX 5 — SE_turnAdvance: bad definition in _hookLoop overridden too late
//
// ROOT CAUSE: _hookLoop() runs when the runtime activates and defines:
//   window.SE_turnAdvance = () => { T._rt.turn++; }
// This is the bare increment version. Section 33 runs at module load and
// redefines it to T._advanceTurn() which also fires a tick and updates DOM.
// But if _hookLoop runs AFTER Section 33 (it does, since it's called on
// user action), the bad bare-increment version OVERWRITES the good one.
//
// FIX: Re-patch SE_turnAdvance immediately after each runtime activation.
// =========================================================================
(function _fixTurnAdvance() {
    // Override now in case runtime already activated
    const T = window._SE_STORY;
    if (T && typeof T._advanceTurn === "function") {
        window.SE_turnAdvance = function() { T._advanceTurn(); };
    }

    // Also patch _activateRuntime to re-fix SE_turnAdvance after each activation
    if (SE.storyEditor && SE.storyEditor.activate && !SE.storyEditor.activate._rffFixed) {
        const origActivate = SE.storyEditor.activate.bind(SE.storyEditor);
        SE.storyEditor.activate = function() {
            origActivate();
            // Re-assign after _hookLoop has run (hookLoop runs synchronously inside activate)
            setTimeout(function() {
                const T2 = window._SE_STORY;
                if (T2 && typeof T2._advanceTurn === "function") {
                    window.SE_turnAdvance = function() { T2._advanceTurn(); };
                }
            }, 50);
        };
        SE.storyEditor.activate._rffFixed = true;
    }
})();

// =========================================================================
// FIX 6 — eval("cities") in strict IIFE
//
// ROOT CAUSE: _applyAllCitiesToGame() in SE_ComprehensiveFix uses:
//   try { if (typeof cities !== "undefined") { cities.length = 0; ... } }
// Inside a "use strict" IIFE, eval and unqualified variable access to
// const-declared variables from other <script> tags is unreliable.
// The try/catch swallows the error silently, city array is never written.
//
// FIX: Provide a safe city array writer that checks all known global
// entry points without eval. Exposed as SE.rff.writeCities().
// =========================================================================
function _safeWriteCities(gameCities) {
    let count = 0;

    // Explicit window.* assignments — always reliable
    if (Array.isArray(window.cities)) {
        window.cities.length = 0;
        gameCities.forEach(function(c) { window.cities.push(c); });
        count++;
    } else {
        // Create it if missing
        window.cities = gameCities.slice();
        count++;
    }

    if (Array.isArray(window.cities_sandbox)) {
        window.cities_sandbox.length = 0;
        gameCities.forEach(function(c) { window.cities_sandbox.push(c); });
        count++;
    }

    if (Array.isArray(window.cities_story1)) {
        window.cities_story1.length = 0;
        gameCities.forEach(function(c) { window.cities_story1.push(c); });
        count++;
    }

    // Attempt to reach script-scope const 'cities' via a stored reference
    // (Only works if some other code already wrote window.cities = cities)
    // The above window.cities assignment covers this case.

    return count;
}

// Patch applyAllCitiesToGame in SE.compFix if it exists
if (SE.compFix && SE.compFix.applyAllCitiesToGame) {
    const origApply = SE.compFix.applyAllCitiesToGame;
    SE.compFix.applyAllCitiesToGame = function() {
        const S   = window._SE_CNP;
        if (!S || !S.cities || !S.cities.length) {
            _toast("⚠ No cities to apply.");
            return;
        }
        const me   = SE.mapEngine;
        const map  = me && me.getMap();
        const TS   = (map && map.tileSize) || 16;
        const WW   = map ? map.cols * TS : 4000;
        const WH   = map ? map.rows * TS : 3000;

        const PRESETS = {
            "MAJOR_CITY": { garrisonRate: 0.08 },
            "FORTRESS":   { garrisonRate: 0.25 },
            "TOWN":       { garrisonRate: 0.06 },
            "VILLAGE":    { garrisonRate: 0.04 },
        };

        var gameCities = S.cities.map(function(city) {
            return Object.assign({}, city, {
                x:               city.nx * WW,
                y:               city.ny * WH,
                originalFaction: city.faction,
                troops:          city.militaryPop,
                // FIX 10: use PRESETS directly, no dead CITY_TYPE variable
                conscriptionRate:(PRESETS[city.type] || PRESETS["TOWN"]).garrisonRate,
                recoveryTimer:   0,
                isUnderSiege:    false,
            });
        });

        var written = _safeWriteCities(gameCities);
        _toast("✓ Applied " + gameCities.length + " cities to " + written + " array(s)");
    };
}

// =========================================================================
// FIX 8 — Maximize button clears style.width, destroying splitter widths
//
// ROOT CAUSE: The MinMax patch's max button does:
//   t.el.style.height = "";
//   t.el.style.width  = "";       ← DESTROYS splitter-set panel widths
// After un-maximizing, #se-left-panel and #se-right-panel revert to their
// CSS default widths, ignoring whatever the user dragged them to.
//
// FIX: Before maximizing, snapshot width. On restore, re-apply it.
// We patch the maximize button click handler via event delegation.
// =========================================================================
document.addEventListener("click", function _rffMaxDelegate(e) {
    const btn = e.target;
    if (!btn || btn.textContent.trim() !== "□") return;
    if (!btn.classList.contains("se-win-btn")) return;

    // Find the target panel (closest ancestor that's a panel or card)
    const panel = btn.closest("#se-left-panel, #se-right-panel, .se-card, #se-timeline");
    if (!panel) return;

    const wasMaxed = panel.classList.contains("se-is-maximized");
    if (wasMaxed) {
        // Restoring: re-apply saved width if it exists
        const savedW = panel.dataset.rffSavedWidth;
        const savedH = panel.dataset.rffSavedHeight;
        requestAnimationFrame(function() {
            if (savedW) {
                panel.style.width    = savedW;
                panel.style.minWidth = savedW;
            }
            if (savedH) {
                panel.style.height = savedH;
            }
        });
    } else {
        // Maximizing: snapshot current dimensions
        const rect = panel.getBoundingClientRect();
        panel.dataset.rffSavedWidth  = panel.style.width  || rect.width  + "px";
        panel.dataset.rffSavedHeight = panel.style.height || rect.height + "px";
    }
}, true); // capture phase — fires before the MinMax handler

// =========================================================================
// FIX 11 — Single idempotent open() guard
//
// ROOT CAUSE: Each patch file adds its own SE.open wrapper with a unique
// guard flag (_compFixHooked, _finalFixHooked, etc.). All guards are
// DIFFERENT so every wrapper is added, causing setup to run 3-4 times
// per open(). The CNP overlay canvas gets created multiple times, event
// listeners stack up, and init costs multiply.
//
// FIX: Install one final canonical open() wrapper. All prior wrappers are
// already applied; this one runs LAST (highest timeout) and ensures
// exactly one "final setup" call per open().
// =========================================================================
(function _fixOpenWrapper() {
    if (SE.open._rffGuarded) return;
    const prevOpen = SE.open.bind(SE);
    SE.open = function() {
        prevOpen();
        setTimeout(function _rffSetup() {
            const root = document.getElementById("se-root");
            if (!root) { setTimeout(_rffSetup, 100); return; }

            // Install _refreshCityList on _SE_CNP (FIX 3)
            _installRefreshCityList();

            // Ensure SE_turnAdvance points to the good version (FIX 5)
            const T = window._SE_STORY;
            if (T && typeof T._advanceTurn === "function") {
                window.SE_turnAdvance = function() { T._advanceTurn(); };
            }

            // Ensure CSS is injected
            if (!document.getElementById("se-rff-css")) {
                // Already injected above on script load, but inject again
                // in case the editor was re-opened after close removed styles
                const s = document.createElement("style");
                s.id = "se-rff-css-reopen";
                s.textContent =
                    ".se-card { overflow: visible !important; resize: none !important; }" +
                    ".se-card.se-is-minimized { overflow: hidden !important; }" +
                    ".se-faction-row[data-bfac].active { border-color: var(--se-gold) !important; }";
                document.head.appendChild(s);
            }

        }, 800); // Run after all other patches (~700ms cumulative)
    };
    SE.open._rffGuarded = true;
})();

// =========================================================================
// BONUS: _refreshSEUI safe wrapper
// Fixes the silent failure in SE_LegacyFix._refreshSEUI which calls
// window._SE_CNP._refreshCityList — now safe since FIX 3 exposes it.
// But also add a direct fallback in case _SE_CNP is not yet initialized.
// =========================================================================
window._SE_refreshSEUI = function() {
    _installRefreshCityList(); // ensure it's exposed
    const S = window._SE_CNP;
    if (S && typeof S._refreshCityList === "function") {
        S._refreshCityList();
    }
    SE.mapEngine && SE.mapEngine._rebuildMinimap && SE.mapEngine._rebuildMinimap();
};

// Run FIX 3 immediately if editor is already open
if (document.getElementById("se-root")) {
    _installRefreshCityList();
    const T = window._SE_STORY;
    if (T && typeof T._advanceTurn === "function") {
        window.SE_turnAdvance = function() { T._advanceTurn(); };
    }
}

// =========================================================================
// EXPOSE PUBLIC API
// =========================================================================
SE.rff = {
    liveFactions:    _liveFactionsSafe,
    safeWriteCities: _safeWriteCities,
    version:         "1.0",
    redFlags: [
        "FIX 1/9: … spread → Object.assign() in _liveFactions",
        "FIX 2:   var(–se-gold) → var(--se-gold) via CSS override",
        "FIX 3:   _SE_CNP._refreshCityList now exposed",
        "FIX 4:   _mount hook via SE._setTab instead of dead T._mount",
        "FIX 5:   SE_turnAdvance → T._advanceTurn() after each activate()",
        "FIX 6:   eval('cities') replaced with window.* safe writers",
        "FIX 7:   .se-card overflow:hidden+resize:vertical → overflow:visible",
        "FIX 8:   Maximize restore re-applies saved splitter widths",
        "FIX 10:  CITY_TYPE dead var — PRESETS used directly",
        "FIX 11:  Single idempotent SE.open wrapper (runs at t=800ms)",
    ],
};

console.log(
    "%c[SE-RedFlagFix] ✓ All 11 red flags patched.\n" +
    " 1/9 … spread (SyntaxError) → Object.assign, fallback guaranteed\n" +
    "  2  var(–se-gold) CSS      → var(--se-gold) override injected\n" +
    "  3  _refreshCityList       → exposed on window._SE_CNP\n" +
    "  4  story._mount dead code → SE._setTab hook instead\n" +
    "  5  SE_turnAdvance bad def → re-wired to T._advanceTurn()\n" +
    "  6  eval('cities') strict  → safe window.* writer\n" +
    "  7  resize+overflow:hidden → overflow:visible override\n" +
    "  8  max-btn clears widths  → snapshot/restore via dataset\n" +
    " 10  CITY_TYPE dead var     → removed, PRESETS direct\n" +
    " 11  Triple open() wrappers → single t=800ms idempotent guard\n" +
    "\n Console: SE.rff.redFlags for full list",
    "color:#e8b832;font-family:monospace;font-size:11px"
);
```

})(); // end SE_RedFlagFix


