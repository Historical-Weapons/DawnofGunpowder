// ============================================================================
// MINIMAP.JS — compact, toggleable battlefield minimap
// ----------------------------------------------------------------------------
// Renders a small fixed-position overview of the current battle: a single
// flat colour standing in for the tile theme (forest/plains/desert/ocean/etc),
// plus a dot per living unit coloured by that unit's own faction colour
// (battleEnvironment.units[i].color — the same colour value the main battle
// renderer already assigns at spawn time, so the minimap always agrees with
// what's on the real battlefield). A thin gold rectangle marks the current
// camera viewport, which matters most on the huge naval maps.
//
// Works for every battle entry point because they all converge on the same
// two globals: `battleEnvironment.units` (positions/side/color/hp) and
// `BATTLE_WORLD_WIDTH` / `BATTLE_WORLD_HEIGHT` (world bounds) — land, river,
// siege, naval, and custom battles all populate these the same way.
//
// Toggle button sits top-left, the one screen corner that's reliably free of
// the header bar (top-center), survivor HUD (top-right), joystick/unit-cards
// (bottom), and the naval helm throttle + rotation joystick (bottom-right) —
// see #ui being force-hidden in inBattleMode, mob-helm-zone / mob-rot-joy-zone
// CSS, and mc3-survivor-hud / mc3-hbar positioning. If a future top-left
// element gets added, the OFFSET constants below are the only thing to retune.
//
// Below the canvas, a one-line emoji caption ("🎮 vs 🏇 @ 🌲") appears only
// while the panel is open — faction emoji are read straight from the same
// FACTION_EMOJIS table (faction_dynamics.js) the diplomacy matrix uses,
// including its "🏴" backup for factions with no entry yet; terrain emoji is
// a local best-effort mirror of resolveThemeColor()'s own priority. See
// SECTION 2B.
// ============================================================================
;(function (W, D) {
  'use strict';

  if (W.__MINIMAP_LOADED__) return;
  W.__MINIMAP_LOADED__ = true;

  // ==========================================================================
  //  CONFIG — tweak freely, nothing else in the file depends on exact values
  // ==========================================================================
  const CFG = {
    // Fallback only — used for the very first paint, or if the Return/P
    // button (#mc3-pbtn, RTSControls.js) can't be measured yet. Once it's on
    // screen, its *actual measured* bounding box drives the real offset every
    // frame (see positionRoot() in SECTION 5), so this static number is no
    // longer what keeps the two buttons apart on phones — that guarantee now
    // holds regardless of header-row width, font metrics, OS chrome, or
    // screen size, none of which is predictable ahead of time across Android
    // devices.
    offsetTop:  60,   // px from the top safe-area inset
    offsetLeft: 10,   // px from the left safe-area inset
    minGapBelowReturnBtn: 8, // guaranteed clear px between Return btn and minimap btn (minimized state)
    redrawEveryNFrames: 4, // throttle: minimap doesn't need 60fps
  };

  // Fallback flat tone per terrain keyword, mirrored from the same keyword
  // checks generateBattlefield() uses to pick groundColor (battlefield_launch.js).
  // In practice battleEnvironment.minimapColor (set there) is used directly and
  // this table is only a safety net for paths that don't run through it.
  const THEME_FALLBACK = {
    denseForest: '#28381c',
    forest:      '#37502a',
    steppe:      '#a3a073',
    plains:      '#6b7a4a',
    river:       '#4c7a6e',
    desert:      '#cfae7e',
    highlands:   '#7d664b',
    mountains:   '#7B5E3F',
    tropical:    '#3E2723',
    siege:       '#8a8170',
    ocean:       '#1c5a78',
    default:     '#5c6b3f',
  };

  // ==========================================================================
  //  SECTION 1 — CSS
  // ==========================================================================
  function injectCSS() {
    if (D.getElementById('mmw-css')) return;
    const tag = D.createElement('style');
    tag.id = 'mmw-css';
    tag.textContent = `
      #mmw-root {
        position: fixed;
        /* --mmw-top is written every frame by positionRoot() (SECTION 5) from
           the Return/P button's *measured* real position, so this fallback
           value only ever shows for a single frame before boot. */
        top: var(--mmw-top, calc(env(safe-area-inset-top, 0px) + ${CFG.offsetTop}px));
        left: max(env(safe-area-inset-left, 0px) + ${CFG.offsetLeft}px, ${CFG.offsetLeft}px);
        z-index: 9612;
        display: none;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
        pointer-events: none;
        font-family: 'Georgia', serif;
      }

      #mmw-btn {
        pointer-events: auto;
        width:  clamp(38px, 8vw, 46px);
        height: clamp(38px, 8vw, 46px);
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(to bottom, #7b1a1a, #4a0a0a);
        border: 1.5px solid #d4b886;
        border-radius: 7px;
        padding: 0;
        cursor: pointer;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        -webkit-user-select: none;
        user-select: none;
        box-shadow: 0 2px 6px rgba(0,0,0,0.65);
        transition: background 0.1s, transform 0.08s, box-shadow 0.15s, border-color 0.15s;
      }
      #mmw-btn .mmw-ico {
        font-size: clamp(1.05rem, 3.4vw, 1.35rem);
        line-height: 1;
        filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.6));
      }
      #mmw-btn:active,
      #mmw-btn.pressed {
        transform: scale(0.88);
        background: linear-gradient(to bottom, #9a2020, #6a1010);
      }
      #mmw-btn.active {
        border-color: #ffca28;
        box-shadow: 0 0 8px rgba(255,202,40,0.5);
      }

      #mmw-panel {
        pointer-events: none;
        width: clamp(96px, 23vw, 148px);
        max-height: 30vh; /* <<<< was 28vh — bumped slightly to fit the caption row */
        box-sizing: border-box;
        background: rgba(14,6,3,0.92);
        border: 2px solid #d4b886;
        border-radius: 8px;
        padding: 3px;
        box-shadow: 0 4px 14px rgba(0,0,0,0.75);
        display: none;
        flex-direction: column;
        gap: 3px;
      }
      #mmw-panel.open { display: flex; }

      /* Square map stage — aspect-ratio moved here from #mmw-panel now that
         the panel is a column of [map, caption] instead of just the map. */
      #mmw-stage {
        width: 100%;
        aspect-ratio: 1 / 1;
        flex-shrink: 0;
        position: relative;
      }

      #mmw-canvas {
        width: 100%;
        height: 100%;
        display: block;
        border-radius: 4px;
      }

      /* "🎮 vs 🏇 @ 🌲" — text content only ever set while the panel is open
         (updateCaption() runs from renderMinimap() alone). Single line, no
         wrap: it only ever holds 3 emoji plus " vs "/" @ ", but ellipsis is
         a cheap safety net regardless. */
      #mmw-caption {
        width: 100%;
        text-align: center;
        font-size: clamp(0.62rem, 2.6vw, 0.74rem);
        line-height: 1.2;
        color: #f0dfc0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-shadow: 0 1px 2px rgba(0,0,0,0.8);
      }

      /* Extra headroom safety on short/landscape phone screens so the panel
         never has a chance to reach down toward the joystick. */
      @media (max-height: 420px) {
        #mmw-panel { max-height: 22vh; } /* <<<< was 20vh, same reason as above */
      }
    `;
    D.head.appendChild(tag);
  }

  // ==========================================================================
  //  SECTION 2 — GAME STATE HELPERS (mirrors the defensive typeof-guard style
  //  used throughout RTSControls.js / battlefield_launch.js)
  // ==========================================================================
  function isBattleActive() {
    return typeof inBattleMode !== 'undefined' && !!inBattleMode;
  }

  function isMenuOpen() {
    const mm = D.getElementById('main-menu');
    if (mm && mm.style.display !== 'none' && mm.style.display !== '') return true;
    const cb = D.getElementById('cb-menu-container');
    if (cb && cb.style.display !== 'none' && cb.style.display !== '') return true;
    return false;
  }

  function getUnits() {
    const env = (typeof battleEnvironment !== 'undefined') ? battleEnvironment : null;
    return (env && Array.isArray(env.units)) ? env.units : [];
  }

  function getWorldBounds() {
    const w = (typeof BATTLE_WORLD_WIDTH  !== 'undefined' && BATTLE_WORLD_WIDTH)  || 2400;
    const h = (typeof BATTLE_WORLD_HEIGHT !== 'undefined' && BATTLE_WORLD_HEIGHT) || 2400;
    return { w, h };
  }

  // River battles only: mirrors generateBattlefield()'s river math in
  // battlefield_launch.js — a near-straight horizontal band running the full
  // width of the map, centered at BATTLE_ROWS/2, with a half-width of ~24
  // grid units (BATTLE_TILE_SIZE px each). The per-battle riverSeed wobble
  // there is only ±0.8 grid units (~±6px of a 1200px-tall world) so it is
  // invisible at minimap scale — drawing a clean straight band here is
  // visually identical and keeps this file independent of that internal seed
  // (which battlefield_launch.js never exposes outside its own function).
  function getRiverWorldBand() {
    const bounds = getWorldBounds();
    const tile = (typeof BATTLE_TILE_SIZE !== 'undefined' && BATTLE_TILE_SIZE) || 8;
    const centerY    = bounds.h / 2;          // matches riverCenterY = BATTLE_ROWS/2 in world px
    const halfWidth  = 24 * tile;             // matches riverWidth = 24 grid units in world px
    return { y0: centerY - halfWidth, y1: centerY + halfWidth };
  }

  // Extremely simplified: one flat tone standing in for the whole battlefield
  // theme. Naval always reads as deep water; everything else is read straight
  // off battleEnvironment.minimapColor (the exact groundColor the real
  // battlefield was painted with), with a keyword-matched fallback for any
  // path that skips generateBattlefield().
  function resolveThemeColor() {
    if (window.inNavalBattle) {
      if (typeof navalEnvironment !== 'undefined' && navalEnvironment && navalEnvironment.waterColor) {
        return navalEnvironment.waterColor;
      }
      return THEME_FALLBACK.ocean;
    }

    const env = (typeof battleEnvironment !== 'undefined') ? battleEnvironment : null;
    if (env && env.minimapColor) return env.minimapColor;

    const t = (env && env.terrainType) ? env.terrainType : '';
    if (t.includes('Dense Forest'))                              return THEME_FALLBACK.denseForest;
    if (t.includes('Forest'))                                    return THEME_FALLBACK.forest;
    if (t.includes('Steppe'))                                    return THEME_FALLBACK.steppe;
    if (t.includes('Plains'))                                    return THEME_FALLBACK.plains;
    if (t.includes('River'))                                     return THEME_FALLBACK.river;
    if (t.includes('Desert') || t.includes('Dunes'))             return THEME_FALLBACK.desert;
    if (t.includes('Highlands'))                                 return THEME_FALLBACK.highlands;
    if (t.includes('Large Mountains'))                           return THEME_FALLBACK.mountains;
    if (t.includes('Mountain'))                                  return THEME_FALLBACK.tropical;
    if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle)    return THEME_FALLBACK.siege;
    return THEME_FALLBACK.default;
  }

  // ==========================================================================
  //  SECTION 2B — CAPTION: "🎮 vs 🏇 @ 🌲", panel-open only
  // ----------------------------------------------------------------------------
  //  updateCaption() is called exclusively from renderMinimap(), and
  //  renderMinimap() only ever runs while panelOpen is true (see
  //  setPanelOpen() / tick() below) — so the caption inherits the "only
  //  shown when maximized" behaviour for free, no extra visibility wiring.
  // ==========================================================================

  // Faction → emoji is intentionally NOT reinvented here. FACTION_EMOJIS
  // already exists in faction_dynamics.js (loaded before this file — see
  // index.html) and drives the diplomacy matrix, so reusing it means every
  // faction defined there — and any added there later — works here too with
  // zero extra maintenance. Same unknown-faction backup ('🏴') that table's
  // own consumer (renderDiplomacyMatrix) already falls back on, for anything
  // without an entry yet (e.g. story-only factions like Kamakura Shogunate /
  // Mongol Empire, which aren't in FACTION_EMOJIS either).
  const FACTION_EMOJI_BACKUP = '🏴';
  function factionEmoji(name) {
    const table = (typeof FACTION_EMOJIS !== 'undefined' && FACTION_EMOJIS) ? FACTION_EMOJIS : null;
    return (table && name && table[name]) || FACTION_EMOJI_BACKUP;
  }

  // currentBattleData.{playerFaction,enemyFaction} is the same field every
  // battle entry point builds identically (custom_battle_gui.js field
  // battles, customsiegebattle.js sieges, custom_naval_launcher.js naval —
  // all three construct it with these exact keys), so it's the primary
  // source. Backup: read .faction straight off a live unit per side via the
  // existing getUnits() helper, in case the panel is opened before
  // currentBattleData is built on some future entry point.
  function getBattleFactions() {
    const cbd = (typeof currentBattleData !== 'undefined') ? currentBattleData : null;
    let playerFaction = cbd && cbd.playerFaction;
    let enemyFaction  = cbd && cbd.enemyFaction;

    if (!playerFaction || !enemyFaction) {
      const units = getUnits();
      if (!playerFaction) {
        const pu = units.find(u => u && u.side === 'player' && u.faction);
        if (pu) playerFaction = pu.faction;
      }
      if (!enemyFaction) {
        const eu = units.find(u => u && u.side === 'enemy' && u.faction);
        if (eu) enemyFaction = eu.faction;
      }
    }
    return { playerFaction, enemyFaction };
  }

  // Terrain → emoji. Mirrors resolveThemeColor()'s flags-then-keywords
  // priority so the emoji shown always agrees with the tone actually
  // painted, with two deliberate reorderings: siege and river are checked
  // ahead of the terrainType keyword cascade instead of after it (siege is
  // last in resolveThemeColor). Both inSiegeBattle and window.inRiverBattle
  // are authoritative "what's actually on screen right now" flags, whereas
  // terrainType is a best-effort string that can be stale or absent on any
  // path that skips generateBattlefield() — so the flags win the tiebreak.
  const TERRAIN_EMOJI_BACKUP = '🌍'; // <<<< shown when nothing else matches
  function resolveTerrainEmoji() {
    if (window.inNavalBattle) {
      const navMapType = (typeof navalEnvironment !== 'undefined' && navalEnvironment) ? navalEnvironment.mapType : null;
      return navMapType === 'Coastal' ? '🏖️' : '🌊';
    }
    if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle) return '🏰';
    if (window.inRiverBattle) return '🏞️';

    const env = (typeof battleEnvironment !== 'undefined') ? battleEnvironment : null;
    const t = (env && env.terrainType) ? env.terrainType : '';
    if (t.includes('Dense Forest'))                  return '🌲';
    if (t.includes('Forest'))                        return '🌳';
    if (t.includes('Steppe'))                         return '🌾';
    if (t.includes('Plains'))                         return '🌿';
    if (t.includes('River'))                          return '🏞️';
    if (t.includes('Desert') || t.includes('Dunes'))  return '🏜️';
    if (t.includes('Highlands'))                      return '⛰️';
    if (t.includes('Large Mountains'))                return '🏔️';
    if (t.includes('Mountain'))                       return '🗻';
    return TERRAIN_EMOJI_BACKUP;
  }

  // Writes "<player emoji> vs <enemy emoji> @ <terrain emoji>" into the
  // caption row.
  function updateCaption() {
    const cap = D.getElementById('mmw-caption');
    if (!cap) return;
    const { playerFaction, enemyFaction } = getBattleFactions();
    cap.textContent = `${factionEmoji(playerFaction)} vs ${factionEmoji(enemyFaction)} @ ${resolveTerrainEmoji()}`;
  }

  // ==========================================================================
  //  SECTION 3 — DOM
  // ==========================================================================
  let panelOpen = false;

  function buildDOM() {
    if (D.getElementById('mmw-root')) return;

    const root = D.createElement('div');
    root.id = 'mmw-root';

    const btn = D.createElement('button');
    btn.id = 'mmw-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Toggle minimap');
    btn.innerHTML = '<span class="mmw-ico">🗺️</span>';

    // Touch-reliable tap handling — same dual touchstart/pointerdown +
    // debounce pattern as RTSControls._mkBtn, so it behaves identically to
    // the rest of the mobile control row.
    let _lastFire = 0;
    const fire = (ev) => {
      const now = Date.now();
      if (now - _lastFire < 200) return;
      _lastFire = now;
      ev.preventDefault();
      ev.stopPropagation();
      btn.classList.add('pressed');
      setTimeout(() => btn.classList.remove('pressed'), 130);
      setPanelOpen(!panelOpen);
    };
    btn.addEventListener('touchstart', fire, { passive: false });
    btn.addEventListener('pointerdown', fire);

    root.appendChild(btn);

    const panel = D.createElement('div');
    panel.id = 'mmw-panel';

    // Square "stage" wrapper keeps the map itself perfectly 1:1 (that used
    // to be #mmw-panel's own job via aspect-ratio) now that the panel is a
    // flex column holding the map plus the caption row underneath it.
    const stage = D.createElement('div');
    stage.id = 'mmw-stage';
    const canvas = D.createElement('canvas');
    canvas.id = 'mmw-canvas';
    stage.appendChild(canvas);
    panel.appendChild(stage);

    // Emoji caption — "🎮 vs 🏇 @ 🌲" — filled in by updateCaption() (SECTION
    // 2B), which only runs from inside renderMinimap().
    const caption = D.createElement('div');
    caption.id = 'mmw-caption';
    panel.appendChild(caption);

    root.appendChild(panel);

    D.body.appendChild(root);
  }

  function setPanelOpen(v) {
    panelOpen = !!v;
    const panel = D.getElementById('mmw-panel');
    const btn   = D.getElementById('mmw-btn');
    if (panel) panel.classList.toggle('open', panelOpen);
    if (btn)   btn.classList.toggle('active', panelOpen);
    if (panelOpen) renderMinimap();
  }

  // ==========================================================================
  //  SECTION 4 — RENDER
  // ==========================================================================
  function renderMinimap() {
    const canvas = D.getElementById('mmw-canvas');
    if (!canvas) return;

    const cssW = canvas.clientWidth  || 1;
    const cssH = canvas.clientHeight || 1;
    const dpr  = W.devicePixelRatio || 1;
    const pxW  = Math.round(cssW * dpr);
    const pxH  = Math.round(cssH * dpr);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width  = pxW;
      canvas.height = pxH;
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // 1. Simplified theme background — the whole world is one flat tone.
    ctx.fillStyle = resolveThemeColor();
    ctx.fillRect(0, 0, cssW, cssH);

    // World → minimap scale. Independent X/Y factors so the same compact box
    // works whether the world is a 2400×2400 field or a 50000×32000 ocean.
    const bounds = getWorldBounds();
    const sx = cssW / bounds.w;
    const sy = cssH / bounds.h;

    drawRiverBand(ctx, sy, cssW, cssH);
    drawShipOvals(ctx, sx, sy, cssW, cssH);
    drawViewportBox(ctx, sx, sy, cssW, cssH);
    drawUnitDots(ctx, sx, sy, cssW, cssH);

    // Frame
    ctx.strokeStyle = 'rgba(212,184,134,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, cssW - 1, cssH - 1);

    // 2. Emoji caption underneath — text, not canvas, so it's a separate
    // DOM write rather than another draw call (see SECTION 2B).
    updateCaption();
  }

  // River battles only — draws the horizontal water band across the full
  // width of the minimap, matching generateBattlefield()'s river shape and
  // ratio (see getRiverWorldBand above). Drawn before units/viewport so it
  // sits as a background layer, same visual order as the real battlefield.
  function drawRiverBand(ctx, sy, cssW, cssH) {
    if (!window.inRiverBattle) return;

    const band = getRiverWorldBand();
    const y0 = band.y0 * sy;
    const y1 = band.y1 * sy;

    ctx.fillStyle = 'rgba(76,138,196,0.85)';
    ctx.fillRect(0, y0, cssW, y1 - y0);

    // Thin bank lines top/bottom for a touch of definition at this scale.
    ctx.strokeStyle = 'rgba(210,225,235,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y0); ctx.lineTo(cssW, y0);
    ctx.moveTo(0, y1); ctx.lineTo(cssW, y1);
    ctx.stroke();
  }

  // Naval battles only — draws a small rotated oval per ship so the player
  // can see hull position/heading at a glance on the minimap. Sits ABOVE the
  // flat water background but BELOW the unit dots (drawn after this in
  // renderMinimap), so troops standing on deck are never hidden behind the
  // hull outline.
  function drawShipOvals(ctx, sx, sy, cssW, cssH) {
    if (!window.inNavalBattle) return;
    const env = (typeof navalEnvironment !== 'undefined') ? navalEnvironment : null;
    if (!env || !Array.isArray(env.ships) || !env.ships.length) return;

    for (let i = 0; i < env.ships.length; i++) {
      const s = env.ships[i];
      if (!s) continue;

      const px = s.x * sx;
      const py = s.y * sy;
      if (px < -20 || py < -20 || px > cssW + 20 || py > cssH + 20) continue;

      // Half-extents in minimap space. Ship width/height are along the
      // hull's own local axes (bow-stern / beam), same convention used when
      // drawing the real hull, so we rotate by heading below rather than
      // swap axes here.
      const rx = Math.max(2, (s.width  || 0) * 0.5 * sx);
      const ry = Math.max(1.4, (s.height || 0) * 0.5 * sy);

      const color = s.color || (s.side === 'player' ? '#5ad1ff' : '#ff5252');

      ctx.save();
      ctx.translate(px, py);
      // Matches the real hull's convention exactly (see drawNavalShips):
      // ship art is drawn with bow at +X, so heading=0 means bow faces east
      // and s.width runs along the rotated local-X (bow-stern) axis.
      ctx.rotate(s.heading || 0);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.75;
      ctx.fill();
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawUnitDots(ctx, sx, sy, cssW, cssH) {
    const units = getUnits();
    if (!units.length) return;

    const dotR = Math.max(1.3, Math.min(cssW, cssH) * 0.016);

    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u || u.hp <= 0) continue;

      const px = u.x * sx;
      const py = u.y * sy;
      if (px < -3 || py < -3 || px > cssW + 3 || py > cssH + 3) continue;

      // Each unit already carries the exact colour it's rendered with on the
      // real battlefield (set at spawn time in leave_battle_roster.js /
      // battlefield_launch.js) — using it directly keeps the minimap and the
      // battlefield visually in sync, including the white player-troop
      // convention used in land battles.
      const color = u.color || (u.side === 'player' ? '#5ad1ff' : '#ff5252');

      if (u.isCommander) {
        ctx.beginPath();
        ctx.arc(px, py, dotR * 1.9, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(px, py, u.isCommander ? dotR * 1.3 : dotR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  // Thin rectangle showing the current camera view — most useful on the huge
  // naval maps where the world is otherwise impossible to get a sense of.
  function drawViewportBox(ctx, sx, sy, cssW, cssH) {
    const gameCanvas = D.getElementById('gameCanvas');
    if (!gameCanvas || typeof player === 'undefined' || !player) return;

    const z = (typeof zoom !== 'undefined' && zoom > 0) ? zoom : 1;
    const halfW = (gameCanvas.width  / 2) / z;
    const halfH = (gameCanvas.height / 2) / z;

    const vx = (player.x - halfW) * sx;
    const vy = (player.y - halfH) * sy;
    const vw = (halfW * 2) * sx;
    const vh = (halfH * 2) * sy;

    ctx.strokeStyle = 'rgba(255,202,40,0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vx, vy, vw, vh);
  }

  // ==========================================================================
  //  SECTION 5 — ORCHESTRATOR LOOP & BOOT
  // ==========================================================================
  let frameCounter = 0;

  // Guarantees the minimap toggle button (top-left, minimized state) can
  // never overlap the Return/P button (#mc3-pbtn, RTSControls.js — the
  // leftmost button in the centered #mc3-hrow header row) on ANY device.
  //
  // Why measure instead of hardcode: #mc3-hbar is centered via
  // `left:50% + translateX(-50%)`, and its row (#mc3-hrow) is a `nowrap`
  // strip of ~10 buttons whose *rendered* width depends on font metrics,
  // emoji glyph width, and OS chrome — all of which vary across Android
  // devices/browsers in ways we can't predict from CSS alone. On a narrow
  // enough screen the row's left edge (where the Return button sits) pushes
  // further left than any single offsetTop/offsetLeft guess could safely
  // account for. Reading the button's real getBoundingClientRect() every
  // frame sidesteps that entirely — the minimap always sits below whatever
  // is actually on screen, on any device, at any zoom/DPI.
  //
  // Only matters in the minimized state per the user's request: once the
  // panel is open (taller), it's fine if it visually sits near/under the
  // header since that's an intentional expanded view, not a stray overlap.
  function positionRoot(root) {
    const pbtn = D.getElementById('mc3-pbtn');
    if (!pbtn) {
      // Return button not mounted yet (very first frames) — use the static
      // fallback baked into the CSS var default.
      root.style.removeProperty('--mmw-top');
      return;
    }
    const r = pbtn.getBoundingClientRect();
    // Only bother pushing down if the Return button actually has a
    // measurable box (r.bottom === 0 would mean display:none / not laid out).
    if (r.width === 0 && r.height === 0) {
      root.style.removeProperty('--mmw-top');
      return;
    }
    const guaranteedTop = Math.round(r.bottom + CFG.minGapBelowReturnBtn);
    root.style.setProperty('--mmw-top', guaranteedTop + 'px');
  }

  function tick() {
    requestAnimationFrame(tick);

    const root = D.getElementById('mmw-root');
    if (!root) return;

    const active = isBattleActive() && !isMenuOpen();
    root.style.display = active ? 'flex' : 'none';
    if (!active) return;

    positionRoot(root);

    if (panelOpen) {
      frameCounter++;
      if (frameCounter % CFG.redrawEveryNFrames === 0) renderMinimap();
    }
  }

  function boot() {
    injectCSS();
    buildDOM();
    requestAnimationFrame(tick);

    W.BattleMinimap = {
      open:   () => setPanelOpen(true),
      close:  () => setPanelOpen(false),
      toggle: () => setPanelOpen(!panelOpen),
    };
    console.log('[minimap.js] Ready ✓');
  }

  const _poll = setInterval(() => {
    if (D.getElementById('gameCanvas') || D.readyState === 'complete') {
      clearInterval(_poll);
      boot();
    }
  }, 150);

  setTimeout(() => {
    clearInterval(_poll);
    if (!W.BattleMinimap) boot();
  }, 6000);

})(window, document);