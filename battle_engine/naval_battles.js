// ============================================================================
// NAVAL BATTLE TACTICAL ENGINE (River, Coastal, Ocean) - Song Dynasty v4
// ============================================================================
// SAIL CANVAS INTERFACE for the main engine:
//   Each frame set:  navalEnvironment.cameraX / .cameraY / .cameraScale
//                    (mirror whatever translate/scale you apply to the main ctx)
//   On battle end:   cleanupNavalSailCanvas()
//
// The sail overlay runs its own requestAnimationFrame loop so no extra draw
// call is needed in the main engine — it stays in sync via navalEnvironment.
// ============================================================================

window.inNavalBattle = false;
// gotRammed: once the PLAYER's ship takes a hit (grapples with an enemy),
// this latches true and stays true for the rest of the naval battle — even
// if the ships later separate. It's the single source of truth that locks
// the player out of rowing input + helm UI. Only initNavalBattle() (start of
// a fresh naval battle, called from BOTH battlefield_launch.js and
// custom_naval_launcher.js) resets it back to false.
window.gotRammed = false;
window.navalEnvironment = {
    mapType    : "Ocean",
    coastSide  : -1,
    ships      : [],
    waves      : [],
    fishes     : [],
    seagulls   : [],
    waterColor : "#2b4a5f",
    landColor  : "#6b7a4a",
    shipSwayX  : 0,
    shipSwayY  : 0,
    // --- Boarding plank deployment animation DELETED---
    plankAnim  : { phase: 'idle', timer: 0, duration: 80 },
    // --- Sail overlay canvas ---
    sailCanvas : null,
    sailCtx    : null,
    mainCanvas : null,
    // --- Camera mirror (set these to match your main ctx transform each frame) ---
    cameraX    : 0,
    cameraY    : 0,
    cameraScale: 1,

    // ══════════════════════════════════════════════════════════════════════════
    // WIND SYSTEM — Song Dynasty sailing physics
    // ══════════════════════════════════════════════════════════════════════════
    // windAngle: radians, 0 = blowing East (→), π/2 = blowing South (↓)
    // windSpeed: 0-1 normalized (0 = calm, 1 = gale)
    // windTarget*: smooth interpolation targets for natural wind shifts
    wind: {
        angle:       Math.random() * Math.PI * 2,
        speed:       0.4 + Math.random() * 0.3,
        targetAngle: 0,
        targetSpeed: 0.5,
        shiftTimer:  0,          // frames until next wind shift
        shiftInterval: 3600,     // ~60 s @ 60 fps between wind changes (slow!)
        gustTimer:   0,          // short gusts for texture
    }
};

// Song Dynasty ship classes:
//   輕型哨船 Light Scout  |  中型戰船 Medium Warship  |  大型樓船 Heavy Tower Ship
const SHIP_TYPES = {
    LIGHT:  { maxMen:30,   width:750,  height:300, color:"#3d2418", deck:"#7a5c3a", mastCount:2, sailScale:0.50 },
    MEDIUM: { maxMen:80,   width:1200, height:480, color:"#2e1a0f", deck:"#6e5030", mastCount:2, sailScale:0.48 },
    HEAVY:  { maxMen:9999, width:1800, height:660, color:"#1e1008", deck:"#5e4228", mastCount:2, sailScale:0.74 }
};
// --- ADD THIS BLOCK ---
const IS_NATIVE = (
    typeof window.Capacitor !== 'undefined' ||
    /\bwv\b/.test(navigator.userAgent) ||
    window.AndroidInterface != null ||
    (
        /Android/.test(navigator.userAgent) &&
        !/Chrome\/\d/.test(navigator.userAgent) &&
        !/Firefox\/\d/.test(navigator.userAgent)
    )
);

// ════════════════════════════════════════════════════════════════════════
// NAVAL GRAPHICS QUALITY GATING
// ════════════════════════════════════════════════════════════════════════
// Mirrors _mbGetQual() in optimization-mobile-battles.js exactly, so naval
// battles respect the same LOW/MED/HIGH/MAX tier the player picked in
// Settings instead of being permanently exempt from it. Previously this
// file had ZERO references to mobileBattleQuality/desktopBattleQuality —
// fish/wave/seagull counts and their per-frame update+draw cost were fixed
// regardless of tier. This is the single read point all naval quality
// gating below calls into.
//
// Desktop is always 100 here too (window.desktopBattleQuality is locked to
// MAX in settings_ui.js), so _navGetQual() naturally returns "always full
// quality" on desktop with no separate branch needed.
function _navGetQual() {
    var q = IS_NATIVE
        ? (typeof window.mobileBattleQuality === 'number' ? window.mobileBattleQuality : 50)
        : (typeof window.desktopBattleQuality === 'number' ? window.desktopBattleQuality : 100);
    return Math.max(0, Math.min(100, q));
}

// Frame-rate throttle for naval cosmetics (fish/seagull AI + position update).
// ONLY fires below 40 (LOW) — mirrors MB5's land-battle throttle exactly,
// and exists for the same reason: LOW is the ONLY tier that ever cuts frame
// rate. MED/HIGH/MAX always update every frame, matching the rest of this
// codebase's "no frame-rate changes outside LOW" rule.
function _navShouldThrottleThisFrame() {
    if (_navGetQual() >= 40) return false; // MED/HIGH/MAX — always full rate
    return (typeof window.__navFrameCounter === 'number') && (window.__navFrameCounter % 2 === 1);
}

// Viewport-cull check for naval cosmetics draw calls (fish/waves/seagulls).
// Mirrors isOnScreen() in battlefield_launch.js / MB16's philosophy: LOW
// gets a tight margin (paired with the same camera-lock idea used on land),
// MED gets a moderate margin, HIGH/MAX get a generous one. Reads
// window.NAVAL_CULL_PADDING, set per-tier by applyGraphicsQualityTier() in
// settings_ui.js.
function _navOnScreen(obj) {
    if (typeof camera === 'undefined' || !camera) return true;
    var pad = (typeof window.NAVAL_CULL_PADDING === 'number') ? window.NAVAL_CULL_PADDING : 200;
    return (
        obj.x > camera.x - pad &&
        obj.x < camera.x + camera.width + pad &&
        obj.y > camera.y - pad &&
        obj.y < camera.y + camera.height + pad
    );
}

function initNavalBattle(enemyNPC, playerObj, tileType, pCount, eCount) {
    window.inNavalBattle = true;
    // Fresh battle — clear any ram-lock left over from a previous naval fight.
    window.gotRammed = false;
    inBattleMode = true;
    window.inBattleMode = true;  // explicit for mobile_ui joystick detection
    if (typeof inSiegeBattle !== 'undefined') inSiegeBattle = false;

// River battles are now redirected to the land engine. Defensively
// redirect any stale River calls here so nothing in this file generates
// river banks or treats river tiles as naval water.
if (tileType === "River") tileType = "Coastal";

navalEnvironment.mapType = tileType;
	if (tileType === "River_DEAD") {   // unreachable — kept as placeholder only
        navalEnvironment.waterColor = "#2c7278";
        navalEnvironment.landColor  = "#4a5d23";
    } else if (tileType === "Coastal") {
        navalEnvironment.waterColor = "#355b70";
        navalEnvironment.landColor  = "#c2a672";
        navalEnvironment.coastSide  = Math.floor(Math.random() * 4);
    } else {
        navalEnvironment.waterColor = "#1a3344";
        navalEnvironment.landColor  = "#000000";
    }
// CRITICAL: Wipe the cached background image so old rocks don't persist
    navalBackgroundCache = null;
    generateNavalMap();
	generateShips(pCount, eCount);
	clearShipLanes();
    // Reset boarding plank animation so it plays fresh each battle
    navalEnvironment.plankAnim = { phase: 'animating', timer: 0, duration: 80 };
    // Reset boarding timer — fresh battle always starts with ships free
    window._navalGrappleStartTime = null;
    window._navalBoardingTimer    = false;
    window._navalBoarding         = false;
	generateCosmetics();
	initSailCanvas();

    // ── WIND SYSTEM INIT ─────────────────────────────────────────────────────
    // Randomize starting wind for each battle. Coastal maps get stronger wind.
    const _windInit = navalEnvironment.wind;
    _windInit.angle        = Math.random() * Math.PI * 2;
    _windInit.speed        = (tileType === "Coastal") ? (0.5 + Math.random() * 0.3) : (0.3 + Math.random() * 0.4);
    _windInit.targetAngle  = _windInit.angle + (Math.random() - 0.5) * 1.0;
    _windInit.targetSpeed  = _windInit.speed;
    _windInit.shiftTimer   = Math.floor(Math.random() * 600) + 1800; // first shift in 30-40 s
    _windInit.shiftInterval = 3600;
    _windInit.gustTimer    = 0;
    // Expose for HUD / joystick reads
    window._navalWindAngle = _windInit.angle;
    window._navalWindSpeed = _windInit.speed;
	
	// ---> SURGERY: Trigger Naval Battle Music
    if (typeof AudioManager !== "undefined") {
        AudioManager.init();
        AudioManager.playMP3('music/battlemusic.mp3', false);
    }
	
	// ========================================================================
    // AMMO SYNC SURGERY: Prevents "Spear Only" bug on battle start
    // ========================================================================
    if (typeof battleEnvironment !== 'undefined' && battleEnvironment.units) {
        // Find the player commander unit that was just spawned
        let pCmdr = battleEnvironment.units.find(u => u.isCommander && u.side === "player");
        
        if (pCmdr) {
            // 1. Ensure the unit object has ammo (pull from Roster or default to 24)
            let template = (typeof UnitRoster !== 'undefined') ? UnitRoster.allUnits[pCmdr.unitType] : null;
            pCmdr.ammo = (template && template.ammo !== undefined) ? template.ammo : 24;

            // 2. CRITICAL: Sync the global 'player' object used for animations
            if (typeof player !== 'undefined') {
                player.ammo = pCmdr.ammo;
                player.weaponMode = 'ranged'; // Force away from melee/spear mode
            }
        }
    }
	
}

// ============================================================================
// MAP GENERATION
// ============================================================================
// Ocean is the default state: the grid is already fully water (11), so no special generation is needed.
// Coastal is the only map type that modifies the base ocean grid by carving land tiles along one edge using coastSide + wave noise.
// Therefore:
// - Ocean = implicit “do nothing” (pure water world) - Coastal = land generation on top of the ocean base

const NAVAL_WATER_TILES = new Set([11, 12, 13, 14, 15]); // all swimmable

function _makeSeededRng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
        s |= 0;
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function _hash2D(x, y, seed) {
    let n = Math.imul(x + 0x9E3779B9, 374761393) ^ Math.imul(y + 0x85EBCA6B, 668265263) ^ seed;
    n = (n ^ (n >>> 13)) >>> 0;
    n = Math.imul(n, 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function _stampCoastalPatch(grid, cx, cy, r, seed) {
    for (let tx = cx - r - 1; tx <= cx + r + 1; tx++) {
        for (let ty = cy - r - 1; ty <= cy + r + 1; ty++) {
            if (tx < 0 || tx >= BATTLE_COLS || ty < 0 || ty >= BATTLE_ROWS) continue;

            const d = Math.hypot(tx - cx, ty - cy);
            const jitter = _hash2D(tx, ty, seed) * 0.85;
            if (d > r + jitter) continue;

            const n = _hash2D(tx * 13 + 7, ty * 17 + 3, seed ^ 0xC0FFEE);

            if (n < 0.28) grid[tx][ty] = 13;      // small rocks
            else if (n < 0.56) grid[tx][ty] = 14; // seaweed / kelp
            else if (n < 0.84) grid[tx][ty] = 12; // shallow reef / shelf
            else grid[tx][ty] = 15;              // deeper water pocket
        }
    }
}
function _noise2D(x, y, seed) {
    let ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    // Smoothstep for non-linear interpolation
    let sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); 
    
    let n00 = _hash2D(ix, iy, seed), n10 = _hash2D(ix + 1, iy, seed);
    let n01 = _hash2D(ix, iy + 1, seed), n11 = _hash2D(ix + 1, iy + 1, seed);
    
    let nx0 = n00 + sx * (n10 - n00);
    let nx1 = n01 + sx * (n11 - n01);
    return nx0 + sy * (nx1 - nx0);
}

function _fbm(x, y, seed, octaves = 3) {
    let v = 0, amp = 0.5, freq = 0.08;
    for (let i = 0; i < octaves; i++) {
        v += _noise2D(x * freq, y * freq, seed + i * 10) * amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    return v;
}
function generateNavalMap() {
    const seed = (battleEnvironment.mapSeed ?? navalEnvironment.mapSeed ?? (Date.now() & 0xffffffff)) >>> 0;
    navalEnvironment.mapSeed = seed;

    // 1. Initialize the entire grid as Standard Open Water (11)
    const grid = Array.from({ length: BATTLE_COLS }, () => Array(BATTLE_ROWS).fill(11));

    // 2. STRICTOR CHECK: Only run topography noise if it is NOT "Ocean"
    if (navalEnvironment.mapType === "Coastal") {
        navalEnvironment.coastSide = Math.floor(_hash2D(0, 0, seed) * 4);

        // ── PERFORMANCE: sample noise on a coarse block grid, not per-tile ──
        // At full map size (50000x32000 world / 8px tiles = 6250x4000 grid =
        // 25,000,000 tiles) calling _fbm (12 hash ops each) per tile was the
        // single biggest loading-time cost — 300M+ hash calls on every battle
        // start. Visual detail below ~128px (16 tiles) is imperceptible at
        // naval zoom levels, so we sample once per 16x16 block and fill the
        // whole block with that value. This cuts iterations by 256x while
        // keeping the exact same map dimensions and overall coastline shape.
        const BLOCK = 16;
        for (let bx = 0; bx < BATTLE_COLS; bx += BLOCK) {
            for (let by = 0; by < BATTLE_ROWS; by += BLOCK) {
                // Sample noise once at the block's center tile
                const sampleX = bx + (BLOCK >> 1);
                const sampleY = by + (BLOCK >> 1);
                let n = _fbm(sampleX, sampleY, seed);
                let elevation = n;

                let tileVal;
                if (elevation > 0.85) tileVal = 13;      // Rocks
                else if (elevation > 0.7) tileVal = 12;  // Reefs
                else if (elevation > 0.65) tileVal = 14; // Algae
                else if (elevation < 0.05) tileVal = 15; // Dark water
                else tileVal = 11;

                const xEnd = Math.min(bx + BLOCK, BATTLE_COLS);
                const yEnd = Math.min(by + BLOCK, BATTLE_ROWS);
                for (let x = bx; x < xEnd; x++) {
                    const col = grid[x];
                    for (let y = by; y < yEnd; y++) {
                        col[y] = tileVal;
                    }
                }
            }
        }
    }
    // If mapType is "Ocean", the logic skips the loop above entirely.
    
    battleEnvironment.grid = grid;
    battleEnvironment.groundColor = navalEnvironment.waterColor;
}
function generateShips(pCount, eCount) {
    navalEnvironment.ships = [];

    // --- FIX: ADDED .name SO THE COLLISION ENGINE KNOWS WHICH SHAPE TO USE ---
    let pType = SHIP_TYPES.HEAVY; pType.name = "Heavy Dragon";
    if (pCount <= 30) { pType = SHIP_TYPES.LIGHT; pType.name = "Light Scout"; }
    else if (pCount <= 100) { pType = SHIP_TYPES.MEDIUM; pType.name = "Medium Junk"; }

    let eType = SHIP_TYPES.HEAVY; eType.name = "Heavy Dragon";
    if (eCount <= 30) { eType = SHIP_TYPES.LIGHT; eType.name = "Light Scout"; }
    else if (eCount <= 100) { eType = SHIP_TYPES.MEDIUM; eType.name = "Medium Junk"; }

    // === SANDBOX & CUSTOM IDENTICAL: ships at EXTREME opposite ends ===
    // Player at south 82%, enemy at north 18% (matches custom_naval_launcher).
    // The user must row + sail across the wide ocean to engage.
    const centerX = BATTLE_WORLD_WIDTH / 2;
    let pX = centerX, pY = BATTLE_WORLD_HEIGHT * 0.82;
    let eX = centerX, eY = BATTLE_WORLD_HEIGHT * 0.18;

    if (navalEnvironment.mapType === "Coastal") {
        // For coastal maps, also shift slightly inland based on coastSide
        if (navalEnvironment.coastSide === 0) { pX = eX = BATTLE_WORLD_WIDTH  * 0.60; }
        if (navalEnvironment.coastSide === 1) { pX = eX = BATTLE_WORLD_WIDTH  * 0.40; }
    }

    let pShip = {
        side: "player", 
        x: pX, 
        y: pY,
        width: pType.width, 
        height: pType.height,
        color: pType.color, 
        deck: pType.deck,
        mastCount: pType.mastCount, 
        sailScale: pType.sailScale,
        type: pType.name, // <--- THE CRITICAL FIX FOR COLLISION MATH

        // ── SAILING MOVEMENT PROPERTIES (Foundation) ──────────────────────
        heading:     Math.PI * 1.5,  // ship faces UP (north) initially — radians
        speed:       0,              // current speed (world-units per frame)
        maxSpeed:    7.00,           // max speed — sail at gale can exceed rowing cap  // <<<<<<<<<< TWEAK MAX SAIL SPEED
        vx:          0,              // velocity components (derived from heading+speed)
        vy:          0,
        rudderAngle: 0,              // joystick-requested turn direction (-1 to 1)
        turnRate:    0.007,          // radians per frame — ships turn SLOWLY
        sailAngle:   0,              // current sail boom angle relative to ship (radians)
        sailTarget:  0,              // target sail angle (auto-calculated from wind)
        sailTurnSpeed: 0.025,        // Sail rotation speed (was 0.006 — too slow for reliable wind response)
        _sailManual: false,          // AUTO-TRIM: sails always optimise for current wind/heading
        isPlayerControlled: true,    // player ship = true, enemy = false
    };
    
    let eShip = {
        side: "enemy",  
        x: eX, 
        y: eY,
        width: eType.width, 
        height: eType.height,
        color: eType.color, 
        deck: eType.deck,
        mastCount: eType.mastCount, 
        sailScale: eType.sailScale,
        type: eType.name, // <--- THE CRITICAL FIX FOR COLLISION MATH

        // ── SAILING MOVEMENT PROPERTIES (Foundation) ──────────────────────
        heading:     Math.PI * 0.5,  // ship faces DOWN (south) initially
        speed:       0,
        maxSpeed:    7.00,           // max speed — sail at gale can exceed rowing cap  // <<<<<<<<<< TWEAK ENEMY SHIP MAX SAIL SPEED
        vx:          0,
        vy:          0,
        rudderAngle: 0,
        turnRate:    0.007,
        sailAngle:   0,
        sailTarget:  0,
        sailTurnSpeed: 0.025,        // Sail rotation speed (was 0.006 — too slow for reliable wind response)
        isPlayerControlled: false,   // AI-controlled ship
    };

    navalEnvironment.ships.push(pShip, eShip);
}

function clearShipLanes() {
    // REMOVED: The perfect elliptical terrain cut-out around the hulls that was leaving
    // a weird cookie-cutter shadow/ellipse in the water features.

    // We ONLY clear the narrow boarding plank lane between the two ships
    // so units don't get snagged on rocks while crossing.
    if (navalEnvironment.ships.length === 2) {
        let s1 = navalEnvironment.ships[0];
        let s2 = navalEnvironment.ships[1];
        
        let minX = Math.floor(Math.min(s1.x, s2.x) / BATTLE_TILE_SIZE);
        let maxX = Math.ceil(Math.max(s1.x, s2.x) / BATTLE_TILE_SIZE);
        let cy = (s1.y + s2.y) / 2 / BATTLE_TILE_SIZE;
        
        let laneWidthT = 3; // Tightened from the full hull height to just the plank area

        for (let tx = minX; tx <= maxX; tx++) {
            for (let ty = Math.floor(cy - laneWidthT); ty <= Math.ceil(cy + laneWidthT); ty++) {
                if (tx < 0 || tx >= BATTLE_COLS || ty < 0 || ty >= BATTLE_ROWS) continue;
                let cell = battleEnvironment.grid[tx][ty];
                if (cell !== 0 && cell !== 8) battleEnvironment.grid[tx][ty] = 11;
            }
        }
    }
}

function generateCosmetics() {
    navalEnvironment.waves = []; navalEnvironment.fishes = []; navalEnvironment.seagulls = [];

    const _isMobile  = (typeof IS_NATIVE !== 'undefined' && IS_NATIVE) || (window.innerWidth < 900);
    const _isOcean   = (navalEnvironment.mapType !== 'Coastal');
    const _mapScale  = (BATTLE_WORLD_WIDTH * BATTLE_WORLD_HEIGHT) / (4800 * 3200);

    // Quality-aware spawn multiplier — ONLY shrinks counts on LOW. MED/HIGH
    // spawn the same full counts as before (this was never a frame-rate
    // tool; fewer cosmetics at LOW is a one-time setup cost saving, not a
    // per-frame throttle — that's handled separately by _navShouldThrottleThisFrame()
    // and _navOnScreen() at update/draw time).
    const _navQ = _navGetQual();
    const _navCountMult = _navQ < 40 ? 0.4 : 1.0;

    // ── WAVES — both Coastal and Ocean ──────────────────────────────────────
    // Counts cut significantly (was up to 400 on desktop) — too many wave
    // particles cluttered the water. Waves are kept, just far sparser.
    // lineWidth is set per-wave in drawNavalShips so alpha+size are both right.
    const waveCount = Math.floor((_isMobile
        ? Math.min(30,  Math.floor(30  * _mapScale))
        : Math.min(120, Math.floor(90 * _mapScale))) * _navCountMult);
    for (let i = 0; i < waveCount; i++) {
        navalEnvironment.waves.push({
            x:      Math.random() * BATTLE_WORLD_WIDTH,
            y:      Math.random() * BATTLE_WORLD_HEIGHT,
            speed:  0.15 + Math.random() * 0.35,
            length: 40  + Math.random() * 80,
            offset: Math.random() * 100,
            // Per-wave line weight — larger waves are heavier strokes
            lw:     1.2 + Math.random() * 1.8
        });
    }

    // ── FISH — both Coastal and Ocean ───────────────────────────────────────
    const fishCount = Math.floor((_isMobile
        ? Math.min(12, Math.floor(10 * _mapScale))
        : Math.min(40, Math.floor(30 * _mapScale))) * _navCountMult);
    for (let i = 0; i < fishCount; i++) {
        let x, y, tries = 0;
        do {
            x = Math.random() * BATTLE_WORLD_WIDTH;
            y = Math.random() * BATTLE_WORLD_HEIGHT;
            tries++;
        } while (tries < 100 && (!_isOpenWaterAt(x, y) || _isPositionOccupiedByShip(x, y)));
        navalEnvironment.fishes.push({
            x, y,
            angle:      Math.random() * Math.PI * 2,
            speed:      0.5 + Math.random(),
            length:     15 + Math.random() * 15,
            wiggleRate: 2  + Math.random() * 3
        });
    }

    // ── SEAGULLS — Coastal only (open ocean has no land-based birds) ────────
    if (!_isOcean) {
        const gullCount = Math.max(1, Math.floor((_isMobile ? 5 : 12) * _navCountMult));
        for (let i = 0; i < gullCount; i++) {
            navalEnvironment.seagulls.push({
                x:        Math.random() * BATTLE_WORLD_WIDTH,
                y:        Math.random() * BATTLE_WORLD_HEIGHT,
                angle:    Math.random() * Math.PI * 2,
                speed:    2 + Math.random() * 2,
                flapRate: 8 + Math.random() * 5,
                scale:    0.8 + Math.random() * 0.6
            });
        }
    }
}


// ============================================================================
// SAIL CANVAS + RENDERING — extracted to naval_sailing_cosmetics.js
// Load naval_sailing_cosmetics.js AFTER this file in your HTML <script> tags.
// Functions now in cosmetics: initSailCanvas, cleanupNavalSailCanvas,
//   _startSailLoop, drawNavalSailOverlay, _drawJunkSails,
//   drawNavalSailsMasterLayer, _renderChineseJunkSails,
//   drawWindHUD, _checkHullStabilityPlaceholder
// ============================================================================

function updateNavalPhysics() {
    if (!inNavalBattle) return;

    // Frame counter for _navShouldThrottleThisFrame() (LOW-tier-only 30Hz
    // throttle on fish/seagull AI below). Ships/projectiles/units are NEVER
    // throttled here — only the cosmetic fish/seagull steering loop, mirroring
    // the same scope MB5 uses on land (AI/physics, not core combat).
    window.__navFrameCounter = ((typeof window.__navFrameCounter === 'number') ? window.__navFrameCounter : 0) + 1;

    // ── Boarding plank animation ticker ──────────────────────────────────
    const pa = navalEnvironment.plankAnim;
    if (pa.phase === 'animating') {
        pa.timer++;
        if (pa.timer >= pa.duration) pa.phase = 'done';
    }

    let time = Date.now();
    navalEnvironment.shipSwayX = Math.sin(time / 1500) * 0.8;
    navalEnvironment.shipSwayY = Math.cos(time / 1200) * 0.4;

    // ══════════════════════════════════════════════════════════════════════════
    // WIND SYSTEM UPDATE
    // ══════════════════════════════════════════════════════════════════════════
    const wind = navalEnvironment.wind;
    wind.shiftTimer--;
    if (wind.shiftTimer <= 0) {
        // Pick a new target wind direction/speed
        wind.targetAngle = wind.angle + (Math.random() - 0.5) * 1.8;
        wind.targetSpeed = Math.max(0.15, Math.min(0.9, wind.speed + (Math.random() - 0.5) * 0.3));
        wind.shiftTimer  = wind.shiftInterval + Math.floor(Math.random() * 300);
    }
    // Smooth interpolation toward target
    let _angleDiff = wind.targetAngle - wind.angle;
    // Normalize angle difference to [-π, π]
    while (_angleDiff >  Math.PI) _angleDiff -= Math.PI * 2;
    while (_angleDiff < -Math.PI) _angleDiff += Math.PI * 2;
    wind.angle += _angleDiff * 0.008; // slow drift
    wind.speed += (wind.targetSpeed - wind.speed) * 0.01;
    // Micro-gusts for texture
    wind.gustTimer++;
    const _gust = Math.sin(wind.gustTimer * 0.05) * 0.08;
    const _effectiveWindSpeed = Math.max(0.05, wind.speed + _gust);
    // Expose for HUD reads
    window._navalWindAngle = wind.angle;
    window._navalWindSpeed = _effectiveWindSpeed;

    // ══════════════════════════════════════════════════════════════════════════
    // PLAYER INPUT — TWO joysticks driving DIFFERENT systems:
    //   _shipHelmInput   = ROWING  (bottom-right joystick)
    //                       dy<0 = row forward, dy>0 = brake/reverse
    //                       dx   = differential turn (one-side rowing)
    //   _shipRotateInput = SAIL ANGLE (center-right joystick)
    //                       joystick direction = target sail boom angle (radians)
    //                       sail rotates around mast at limited speed (sailTurnSpeed)
    // Plus keyboard IJKL for desktop rowing.
    // ══════════════════════════════════════════════════════════════════════════
    const _pShip = navalEnvironment.ships.find(s => s.isPlayerControlled);

    // ── ROWING — apply move joystick + IJKL to the player ship ─────────────
    // Once gotRammed has latched true, the player ship gets ZERO input for
    // the rest of the battle — not just while _grappled (which clears the
    // instant hulls separate). This is what makes the lockout permanent.
    if (_pShip && window.NavalRowing && !window.gotRammed) {
        window.NavalRowing.applyInput(_pShip, window._shipHelmInput, window._helmKeys);
    }

    // ── SAIL ANGLE — fully auto-trim for ALL ships (player + enemy) ────────
    // Sail buttons removed. The physics engine auto-trims every ship every
    // frame via the _sailManual=false branch in the per-ship physics loop below.

    // ── Enemy Ship AI: unpredictable approach + ram + backoff + circle ──────
    // State machine per ship:
    //   'approach' — zigzag toward player, wander angle re-rolls every 2-4s
    //   'circle'   — orbit the player at a steady radius to pick an attack
    //                angle before committing. Every engagement passes through
    //                here now (not just post-backoff re-engagements) — see
    //                the approach->circle transition below for why.
    //   'pause'    — slow to a crawl for 2-4s once close, building tension
    //   'ram'      — full speed straight line at the player
    //   'backoff'  — after a ram connects (close pass), reverse away briefly
    //   'grappled' — ships collided — stop all thrust, troops take over
    navalEnvironment.ships.forEach(s => {
        if (s.isPlayerControlled) return;

        // Collision happened — stop ship AI entirely, let troops fight
        if (s._grappled || window._navalBoardingTimer) {
            s._aiState = 'grappled';
            s.vx = (s.vx || 0) * 0.85;
            s.vy = (s.vy || 0) * 0.85;
            s._sailManual = false;
            // FIX: applyInput() is skipped entirely while grappled (it early-
            // returns on _grappled), which means _rowState is never refreshed
            // and keeps whatever mid-stroke value it last had — drawOars()
            // then smooths/animates toward that stale stroke forever, so
            // enemy paddles kept rowing in place after sticking. Force it to
            // neutral here so the oars actually settle to rest on contact.
            s._rowState = { forward: 0, turn: 0, active: false };
            return;
        }

        const target = navalEnvironment.ships.find(t => t.isPlayerControlled);
        if (!target) return;

        if (!s._aiState) {
            s._aiState       = 'approach';
            s._aiTimer        = 0;
            s._aiWanderAngle  = (Math.random() - 0.5) * 1.2;
            s._aiWanderTimer  = 0;
        }

        const dx   = target.x - s.x;
        const dy   = target.y - s.y;
        const dist = Math.hypot(dx, dy);
        const directAngle = Math.atan2(dy, dx);

        // Wander offset changes every 2-4s, fades out as ship nears ram range
        s._aiWanderTimer = (s._aiWanderTimer || 0) + 1;
        if (s._aiWanderTimer > 120 + Math.random() * 120) {
            s._aiWanderAngle = (Math.random() - 0.5) * 1.4;
            s._aiWanderTimer = 0;
        }
        const wanderFade  = Math.min(1.0, dist / 600);
        const approachAng = directAngle + s._aiWanderAngle * wanderFade;

        let steerDelta = approachAng - s.heading;
        while (steerDelta >  Math.PI) steerDelta -= Math.PI * 2;
        while (steerDelta < -Math.PI) steerDelta += Math.PI * 2;

        s._aiTimer = (s._aiTimer || 0) + 1;

        let _aiTurn = 0, _aiForward = 0;

        if (s._aiState === 'approach') {
            _aiTurn    = Math.max(-1, Math.min(1, steerDelta * 1.8));
            _aiForward = 0.50;
            if (dist < 1200) {
                // FIX: route through 'circle' first instead of going straight
                // to 'pause'. Previously approach->pause->ram was the ONLY
                // path a typical single-pass engagement ever took, because
                // the very first ram almost always ends in an actual grapple
                // (collision preempts the AI state machine — see the
                // s._grappled early-return above), so the existing
                // backoff->circle loop (designed for missed/second passes)
                // never actually got a chance to run. That made every enemy
                // ship look like dumb point-blank straight-line ramming no
                // matter how good the circle/backoff logic was. Sending the
                // FIRST approach through circle too means every engagement
                // now opens with a genuine orbiting pass to pick an attack
                // angle before the charge — unpredictable, and lines up the
                // ram from an angle instead of dead astern/bow every time.
                s._aiState     = 'circle';
                s._aiTimer     = 0;
                s._aiCircleDir = Math.random() < 0.5 ? 1 : -1;
            }
        } else if (s._aiState === 'pause') {
            _aiTurn    = Math.max(-1, Math.min(1, steerDelta * 1.0));
            _aiForward = 0.05;
            if (s._aiTimer > s._aiPauseDuration) {
                s._aiState = 'ram';
                s._aiTimer = 0;
                s._aiWanderAngle = 0;
            }
        } else if (s._aiState === 'ram') {
            // Straight-line charge — no wander
            steerDelta = directAngle - s.heading;
            while (steerDelta >  Math.PI) steerDelta -= Math.PI * 2;
            while (steerDelta < -Math.PI) steerDelta += Math.PI * 2;
            _aiTurn    = Math.max(-1, Math.min(1, steerDelta * 2.5));
            _aiForward = 1.0;
            // Ram "connects" once we close to near-collision range without
            // actually grappling (grapple check above already returns early
            // if it truly hit) — once we pass very close OR overshoot, back off.
            if (dist < 350) {
                s._aiState = 'backoff';
                s._aiTimer = 0;
                // Pick a reverse heading roughly opposite the player, with
                // some randomness so the retreat angle varies each time.
                s._aiBackoffAngle = directAngle + Math.PI + (Math.random() - 0.5) * 0.8;
            } else if (dist > 1800 && s._aiTimer > 180) {
                // Ram missed entirely (player moved away) — go straight to circling
                s._aiState = 'circle';
                s._aiTimer = 0;
                s._aiCircleDir = Math.random() < 0.5 ? 1 : -1;
            }
        } else if (s._aiState === 'backoff') {
            // Reverse away from the player for a short burst, then transition
            // into circling rather than charging straight back in.
            let backDelta = s._aiBackoffAngle - s.heading;
            while (backDelta >  Math.PI) backDelta -= Math.PI * 2;
            while (backDelta < -Math.PI) backDelta += Math.PI * 2;
            _aiTurn    = Math.max(-1, Math.min(1, backDelta * 1.6));
            _aiForward = -0.65; // reverse thrust (rowing backward)
            if (s._aiTimer > 90) { // ~1.5s of backing up
                s._aiState     = 'circle';
                s._aiTimer      = 0;
                s._aiCircleDir  = Math.random() < 0.5 ? 1 : -1; // CW or CCW
            }
        } else if (s._aiState === 'circle') {
            // Orbit the player at a roughly steady radius, drifting the
            // approach angle around them before committing to another ram.
            const ORBIT_RADIUS = 900;
            // Tangent angle: perpendicular to the direct line, rotated by circle dir
            const tangentAngle = directAngle + (s._aiCircleDir * Math.PI * 0.5);
            // Blend tangent (orbit) with a slight pull toward ideal radius
            const radiusError  = dist - ORBIT_RADIUS;
            const pullAngle    = directAngle * Math.sign(radiusError || 1);
            const blendedAngle = tangentAngle + Math.atan2(
                Math.sin(pullAngle - tangentAngle) * 0.3, 1
            );
            let circleDelta = blendedAngle - s.heading;
            while (circleDelta >  Math.PI) circleDelta -= Math.PI * 2;
            while (circleDelta < -Math.PI) circleDelta += Math.PI * 2;
            _aiTurn    = Math.max(-1, Math.min(1, circleDelta * 1.6));
            _aiForward = 0.55;
            // After a few seconds of circling, commit to another ram pass
            if (s._aiTimer > 240 + Math.random() * 120) { // 4-6s
                s._aiState = 'pause';
                s._aiTimer = 0;
                s._aiPauseDuration = 60 + Math.floor(Math.random() * 90); // shorter pause, already close
            }
        }

        if (window.NavalRowing) {
            window.NavalRowing.applyInput(s, { dx: _aiTurn, dy: -_aiForward }, null);
        }
        s._sailManual = false;
    });

    // ══════════════════════════════════════════════════════════════════════════
    // PER-SHIP PHYSICS — rowing is already applied above by NavalRowing.applyInput
    //                    (which writes directly into ship.vx/vy/heading).
    // Here we add: wave rocking, sail trim, sail-driven thrust, water friction,
    //              position integration, and world-bounds clamping.
    // ══════════════════════════════════════════════════════════════════════════
    const _waveTime = Date.now() / 1000;
    navalEnvironment.ships.forEach((ship, _shipIdx) => {
        // ── 0. WAVE ROCKING — visual wobble only (no physics impact) ────────
        // FIX (boats not "wavy"): old amplitude (0.004-0.007 rad ≈ 0.2°-0.4°)
        // was practically invisible on hulls 750-1800px wide. Bumped to a
        // range that reads as a real gentle-to-moderate roll (≈2° at calm
        // wind, up to ≈4.9° in high wind) without desyncing badly from the
        // deck/hit-test math, which deliberately ignores _rockAngle and only
        // uses ship.heading (see getNavalSurfaceAt / _shipUnderPoint) — this
        // stays cosmetic-only, same as before, just now actually visible.
        const _rockPhase  = _waveTime * 1.1 + _shipIdx * 2.3 + ship.x * 0.001;
        // Reduced from 0.035+wind*0.05 (≈2°-4.9°) — that read as too much
        // rocking in practice. Now ≈1°-2.3°, still visibly alive on the
        // water but no longer overshooting into seasickness territory.
        const _rockAmount = 0.018 + _effectiveWindSpeed * 0.022;
        ship._rockAngle   = Math.sin(_rockPhase) * _rockAmount
                          + Math.sin(_rockPhase * 2.3 + 1.7) * _rockAmount * 0.3;
        // Positional wobble (actual x/y drift, not just visual tilt) also
        // reduced in step — this was adding real per-frame position noise
        // on top of the rotational rock, compounding the "too much" feel.
        ship._waveWobbleX = Math.sin(_rockPhase * 0.7 + 0.5) * (0.15 + _effectiveWindSpeed * 0.2);
        ship._waveWobbleY = Math.cos(_rockPhase * 0.9 + 1.2) * (0.10 + _effectiveWindSpeed * 0.15);

        // ── 1. SAIL TRIM — handled entirely by cosmetics (_drawJunkSails).
        // Physics thrust uses a polar diagram keyed on hull-to-wind angle only.
        // ship.sailAngle / sailTarget are no longer read here.

        // ── 2. SAIL-DRIVEN THRUST — Polar-diagram model (rowing always stronger)
        //
        // Rule: rowing is always the primary propulsion. Sail adds a bonus on
        // top of rowing, but the bonus is capped so that even at maximum polar
        // (goosewing running) the sail contribution cannot exceed the rowing
        // speed cap. This means a ship under pure sail moves slower than one
        // under full rowing — sail only "helps" by reducing how hard you need
        // to row to maintain speed.
        //
        // In irons (absRelWind > 155°): polarFactor = 0.0 exactly. No sail.
        // Any other angle: polarFactor > 0, sail gives partial assistance.

        const _windToAng2 = wind.angle + Math.PI;
        let _relWindAngle = _windToAng2 - ship.heading;
        while (_relWindAngle >  Math.PI) _relWindAngle -= Math.PI * 2;
        while (_relWindAngle < -Math.PI) _relWindAngle += Math.PI * 2;
        const _absRelWind = Math.abs(_relWindAngle);  // 0 = running, π = in irons

        // Polar factor — STRICT zero at in-irons threshold (155°+)
        // _absRelWind: 0 = running (wind from behind, best), π = in irons (wind head-on, worst)
        // <<<<<<<<<< TWEAK POLAR CURVE HERE
        let _polarFactor;
        const _IN_IRONS_THRESHOLD = 2.71; // 155° in radians — hard zero above this
        if (_absRelWind >= _IN_IRONS_THRESHOLD) {
            _polarFactor = 0.0;  // hard zero — in irons, must row
        } else if (_absRelWind < 0.35) {                           // Running (0–20°): wind dead astern, sails fully powered
            _polarFactor = 1.00;
        } else if (_absRelWind < 0.96) {                           // Broad/Beam Reach (20–55°)
            _polarFactor = 1.00 - (_absRelWind - 0.35) * 0.24;    // 1.00 → 0.85
        } else if (_absRelWind < 1.75) {                           // Beam/Close Reach (55–100°)
            _polarFactor = 0.85 - (_absRelWind - 0.96) * 0.25;    // 0.85 → 0.65
        } else if (_absRelWind < 2.27) {                           // Close Reach (100–130°)
            _polarFactor = 0.65 - (_absRelWind - 1.75) * 0.67;    // 0.65 → 0.30
        } else {                                                   // Close Hauled (130–155°)
            _polarFactor = 0.30 - (_absRelWind - 2.27) * 0.57;    // 0.30 → 0.05
        }

        // Ship forward unit vector
        const _shipFwdX = Math.cos(ship.heading);
        const _shipFwdY = Math.sin(ship.heading);

        // SAIL_POWER: boosted so wind is clearly perceptible.
        // At full polar (running) + gale (windSpeed≈0.9): force ≈ 0.9 * 0.9 * 0.35 ≈ 0.28/frame
        // vs rowing's ROW_FORWARD_FORCE = 0.110/frame — sail at gale is now ~2.5× rowing.
        // At moderate wind (0.5): sail ≈ 0.175/frame — still clearly felt.
        // In irons: exactly 0 (polarFactor = 0) — no movement at all from sail.
        // <<<<<<<<<< TWEAK SAIL THRUST POWER HERE
        const SAIL_POWER = 0.35;   // was 0.075 — sail now meaningfully drives the ship

        // Grappled ships cannot use sail (no point, they're locked together)
        const _sailActive = !ship._grappled;

        if (_sailActive && _polarFactor > 0) {
            const _sailFwdForce = _polarFactor * _effectiveWindSpeed;
            ship.vx += _shipFwdX * _sailFwdForce * SAIL_POWER;
            ship.vy += _shipFwdY * _sailFwdForce * SAIL_POWER;
        }

        // ── 3. WATER FRICTION — slow momentum over time ─────────────────────
        if (window.NavalRowing) window.NavalRowing.applyWaterFriction(ship);

        // Speed exposed for older code paths that may read it
        ship.speed = Math.hypot(ship.vx, ship.vy);

        // Capture pre-move position for unit sticking delta (computed BEFORE wobble+vx/vy)
        ship._preStickX = ship.x;
        ship._preStickY = ship.y;

        // ── 4. MOVE THE SHIP ────────────────────────────────────────────────
        const _prevX = ship.x, _prevY = ship.y;
        ship.x += ship.vx + ship._waveWobbleX;
        ship.y += ship.vy + ship._waveWobbleY;

        // Clamp to world bounds
        const _margin = Math.max(ship.width, ship.height) * 0.4;
        ship.x = Math.max(_margin, Math.min(BATTLE_WORLD_WIDTH  - _margin, ship.x));
        ship.y = Math.max(_margin, Math.min(BATTLE_WORLD_HEIGHT - _margin, ship.y));

        // ── WAKE TRAIL — stern foam history, HIGH/MAX only ───────────────
        // Cheap append-only recording. The actual draw (and therefore the
        // real cost) lives entirely in drawShipWakes() — LOW/MED skip this
        // block outright via the same _navWaterQL() gate, so they never pay
        // for a feature they don't render.
        if (_navWaterQL() >= 2) {
            if (!ship._wakeTrail) ship._wakeTrail = [];
            const _hdgCos = Math.cos(ship.heading), _hdgSin = Math.sin(ship.heading);
            const _sternX = ship.x - _hdgCos * ship.width * 0.50;
            const _sternY = ship.y - _hdgSin * ship.width * 0.50;
            const _lastWk = ship._wakeTrail[ship._wakeTrail.length - 1];
            // Lay a new point every ~14 world-px of stern travel (not every
            // frame) — a fixed per-frame push would bunch points up at low
            // speed and gap them out at high speed; distance-based spacing
            // keeps the trail visually even regardless of speed/frame rate.
            const _dxWk = _sternX - (_lastWk ? _lastWk.x : 0), _dyWk = _sternY - (_lastWk ? _lastWk.y : 0);
            if (!_lastWk || (_dxWk * _dxWk + _dyWk * _dyWk) > 196) {
                ship._wakeTrail.push({ x: _sternX, y: _sternY, born: _waveTime, spd: ship.speed });
                if (ship._wakeTrail.length > 46) ship._wakeTrail.shift();
            }
            while (ship._wakeTrail.length && (_waveTime - ship._wakeTrail[0].born) > 5.2) {
                ship._wakeTrail.shift();
            }
        } else if (ship._wakeTrail && ship._wakeTrail.length) {
            ship._wakeTrail.length = 0; // tier dropped mid-battle — don't leave a stale trail behind
        }

        // Preliminary delta (may be refined after collision resolution below)
        ship._dx = ship.x - _prevX;
        ship._dy = ship.y - _prevY;
        ship._prevHeading = ship._prevHeading ?? ship.heading;
    });

    // ── 6. SHIP-TO-SHIP COLLISION — GRAPPLE ON CONTACT ──────────────────────
    // When two ships' hulls touch they immediately lash together (grapple).
    // Grappled ships:
    //   • Have all velocity zeroed (they stop dead)
    //   • Cannot row forward (NavalRowing.applyInput blocks when _grappled=true)
    //   • Cannot rotate (angularVelocity zeroed each frame)
    //   • Cannot use sail (see sail block above)
    //   • UI buttons are disabled via window.NavalHelmUI.disableNavalHelm()
    //
    // Collision detection still uses the rotated-rectangle edge-radius method
    // so the contact threshold matches the visible hull edge exactly.
    function _shipEdgeRadius(s, dirX, dirY) {
        const cosH = Math.cos(s.heading || 0);
        const sinH = Math.sin(s.heading || 0);
        const projFwd  = Math.abs(dirX * cosH    + dirY * sinH);
        const projBeam = Math.abs(dirX * (-sinH) + dirY * cosH);
        // Use hull-drawing extents: bow/stern ≈ w*0.46, beam ≈ h*0.40
        const a = s.width  * 0.46; // half-length (bow/stern reach)
        const b = s.height * 0.40; // half-beam (side reach)
        // TRUE rotated-rectangle support function: r(θ) = 1 / max(|cosθ|/a, |sinθ|/b)
        // (previous version SUMMED the two projections instead of taking the
        // tighter of the two, which over-estimated the hull radius at every
        // oblique angle — worst around 15-30°, exactly where a paddle-vs-side
        // hit lands. That's what produced the big visible gap on side contacts;
        // head-on bow-to-bow contact is unaffected since it sits at dirFwd≈1.)
        return 1 / Math.max(projFwd / a, projBeam / b);
    }

    let _anyGrapple = false;

    for (let i = 0; i < navalEnvironment.ships.length; i++) {
        for (let j = i + 1; j < navalEnvironment.ships.length; j++) {
            const sA = navalEnvironment.ships[i];
            const sB = navalEnvironment.ships[j];
            const dx = sB.x - sA.x;
            const dy = sB.y - sA.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 0.01) continue;
            const nx = dx / dist, ny = dy / dist;

            const rA = _shipEdgeRadius(sA, nx, ny);
            const rB = _shipEdgeRadius(sB, nx, ny);
            const minDist = rA + rB;

            if (dist < minDist) {
                // ── GRAPPLE: ships are touching — lock them together ──
                sA._grappled = true;
                sB._grappled = true;
                _anyGrapple  = true;

                // ── PLAYER GOT RAMMED: latch the permanent control lock ──
                // Only fires when the PLAYER's own ship is one of the two
                // hulls touching (not an ally vs. enemy collision elsewhere
                // in the fleet). Once true this never resets except at the
                // top of initNavalBattle() for the NEXT battle.
                if (sA.isPlayerControlled || sB.isPlayerControlled) {
                    window.gotRammed = true;
                }

                // Zero all velocity — ships stop dead on contact
                sA.vx = 0; sA.vy = 0;
                sB.vx = 0; sB.vy = 0;
                sA.angularVelocity = 0;
                sB.angularVelocity = 0;
                // No positional correction: ships stay overlapping naturally,
                // like real grappled/boarded vessels lashed together.
            }
        }
    }

    // Enforce grapple lock every frame (prevent drift from wave wobble)
    navalEnvironment.ships.forEach(ship => {
        if (ship._grappled) {
            ship.vx = 0;
            ship.vy = 0;
            ship.angularVelocity = 0;
        }
    });

    // ── BOARDING: instant on first contact → land AI + velocity damping ────
    // _navalBoardingTimer fires the instant ships touch. Both ships have
    // _grappled=true so Navalrowing.applyInput blocks thrust entirely; here
    // we also damp residual velocity so they settle to a stop quickly.
    if (_anyGrapple) {
        window._navalBoardingTimer = true;
        navalEnvironment.ships.forEach(ship => {
            if (ship._grappled) {
                ship.vx = (ship.vx || 0) * 0.80;
                ship.vy = (ship.vy || 0) * 0.80;
            }
        });
    } else {
        window._navalBoardingTimer    = false;
        window._navalGrappleStartTime = null;
        navalEnvironment.ships.forEach(ship => {
            ship._grappled = false;
            ship._aiState  = null; // reset AI state machine for next approach
        });
    }

    // Expose boarding state globally (legacy flag — still read by some paths).
    window._navalBoarding = _anyGrapple;

    // ── HELM UI: locked the instant the player gets rammed ──────────────────
    // Previously this kept the helm buttons visible/usable through grapple
    // (rowing thrust was zeroed by the _grappled guard, but the buttons
    // themselves stayed up). Per the new "permanent lock" design: once
    // gotRammed latches true, force the helm OFF every frame (fighting off
    // any external poll/timer that might try to re-show it — same pattern
    // as the existing forceNavalHelm() boarding guard) and never call
    // enableNavalHelm() again until the next naval battle resets the flag.
    if (window.NavalHelmUI) {
        if (window.gotRammed) {
            if (typeof window.NavalHelmUI.disableNavalHelm === 'function') {
                window.NavalHelmUI.disableNavalHelm();
            }
        } else if (typeof window.NavalHelmUI.enableNavalHelm === 'function') {
            window.NavalHelmUI.enableNavalHelm();
        }
    }

    // ── 7. UNIT STICKING — units on a ship move WITH it ─────────────────────
    // First: recompute final deltas AFTER collision resolution (so collision
    // pushback is included and units don't slip when ships collide).
    navalEnvironment.ships.forEach(ship => {
        if (ship._preStickX !== undefined) {
            ship._dx = ship.x - ship._preStickX;
            ship._dy = ship.y - ship._preStickY;
        }
    });

    if (battleEnvironment && battleEnvironment.units) {
        navalEnvironment.ships.forEach(ship => {
            const _headingDelta = ship.heading - (ship._prevHeading ?? ship.heading);
            const _hasDelta = Math.abs(ship._dx) > 0.001 || Math.abs(ship._dy) > 0.001;
            const _hasRot   = Math.abs(_headingDelta) > 0.0001;
            if (!_hasDelta && !_hasRot) { ship._prevHeading = ship.heading; return; }

            const _cosDelta = _hasRot ? Math.cos(_headingDelta) : 1;
            const _sinDelta = _hasRot ? Math.sin(_headingDelta) : 0;

            // Un-rotation for on-deck test (need ship's OLD heading)
            const _oldH = ship._prevHeading ?? ship.heading;
            const _cosOldInv = Math.cos(-_oldH);
            const _sinOldInv = Math.sin(-_oldH);

            battleEnvironment.units.forEach(unit => {
                // Corpses of units that died ON DECK from combat should stay
                // glued to the ship (translate/rotate with it) exactly like a
                // living unit would — otherwise the ship sails on and the body
                // is left behind in world space, which looks like it's drifting
                // independently on the waves. Corpses of units that drowned in
                // open water (isSwimming was true at time of death) are correctly
                // excluded here since they were never anchored to a deck.
                if (unit.hp <= 0 && unit.isSwimming) return;
                // World offset from ship's OLD center
                const wx = unit.x - (ship.x - ship._dx);
                const wy = unit.y - (ship.y - ship._dy);
                // Un-rotate into ship-local space for superellipse test
                const lx = wx * _cosOldInv - wy * _sinOldInv;
                const ly = wx * _sinOldInv + wy * _cosOldInv;
                const rx = ship.width  * 0.55;
                const ry = ship.height * 0.55;
                if ((Math.pow(Math.abs(lx) / rx, 2.5) + Math.pow(Math.abs(ly) / ry, 2.5)) > 1.0) return;

                // Translate with ship movement
                unit.x += ship._dx;
                unit.y += ship._dy;

                // Orbit position around ship center when heading changes.
                // Unit's own direction/facing is intentionally NOT changed.
                if (_hasRot) {
                    const ox = unit.x - ship.x;
                    const oy = unit.y - ship.y;
                    unit.x = ship.x + ox * _cosDelta - oy * _sinDelta;
                    unit.y = ship.y + ox * _sinDelta + oy * _cosDelta;
                }

                // === ORDER-DESTINATION STICKING (living units only — a corpse's
                // stale order data is never read again, so skip the extra work) ===
                // Any standing move/hold/retreat order stores its destination as a
                // static world-space point (unit.orderTargetPoint, and the dummy
                // unit.target derived from it in processTacticalOrders). Unlike the
                // unit itself, these were never carried along with the ship, so as
                // soon as the ship sailed or turned the destination silently drifted
                // off the deck — the unit would keep chasing a point that was no
                // longer where the player clicked, making commands look ignored.
                // 'follow' was unaffected because its waypoint is recomputed every
                // frame straight from the (already ship-corrected) commander
                // position rather than a stored point. Apply the identical
                // translate+rotate here so every order type sticks to the deck.
                if (unit.hp > 0 && unit.orderTargetPoint) {
                    unit.orderTargetPoint.x += ship._dx;
                    unit.orderTargetPoint.y += ship._dy;
                    if (_hasRot) {
                        const otx = unit.orderTargetPoint.x - ship.x;
                        const oty = unit.orderTargetPoint.y - ship.y;
                        unit.orderTargetPoint.x = ship.x + otx * _cosDelta - oty * _sinDelta;
                        unit.orderTargetPoint.y = ship.y + otx * _sinDelta + oty * _cosDelta;
                    }
                }
                if (unit.hp > 0 && unit.target && unit.target.isDummy) {
                    unit.target.x += ship._dx;
                    unit.target.y += ship._dy;
                    if (_hasRot) {
                        const ttx = unit.target.x - ship.x;
                        const tty = unit.target.y - ship.y;
                        unit.target.x = ship.x + ttx * _cosDelta - tty * _sinDelta;
                        unit.target.y = ship.y + ttx * _sinDelta + tty * _cosDelta;
                    }
                }

                // === PLAYER SYNC: if this is the player commander, also move
                // window.player so the sandboxmode sync (pCmdr.x = player.x)
                // doesn't overwrite the sticking delta. This lets the player
                // STILL walk on deck with WASD on top of ship movement. ===
                if (unit.isCommander && unit.side === 'player' &&
                    typeof window !== 'undefined' && typeof player !== 'undefined') {
                    player.x = unit.x;
                    player.y = unit.y;
                }
            });
            ship._prevHeading = ship.heading;
        });
    }

    // ── 7b. SHIP-STUCK GROUND EFFECTS — projectiles embedded in a deck ─────
    // These were tagged at impact time (ai_categories.js) with parentShip +
    // a ship-local offset/angle. Re-derive world x/y/angle every frame using
    // the EXACT same transform ships are drawn with: translate by
    // (ship.x + navalEnvironment.shipSwayX/Y), then rotate by
    // (ship.heading + ship._rockAngle) — see the ctx.translate/ctx.rotate
    // pair in drawNavalShips() below. Using ship.x/heading alone (no sway,
    // no rock wobble) was the earlier bug: it tracked the ship's PHYSICS
    // position but not its drawn/visual position, so the stuck arrow lagged
    // behind the hull's wave-bob on screen.
    if (battleEnvironment && battleEnvironment.groundEffects) {
        const _swayX = navalEnvironment.shipSwayX || 0;
        const _swayY = navalEnvironment.shipSwayY || 0;
        battleEnvironment.groundEffects.forEach(ge => {
            if (!ge.parentShip) return;
            const ship = ge.parentShip;
            const drawHeading = (ship.heading || 0) + (ship._rockAngle || 0);
            const cosH = Math.cos(drawHeading);
            const sinH = Math.sin(drawHeading);
            ge.x = (ship.x + _swayX) + ge.shipLocalX * cosH - ge.shipLocalY * sinH;
            ge.y = (ship.y + _swayY) + ge.shipLocalX * sinH + ge.shipLocalY * cosH;
            ge.angle = drawHeading + ge.shipLocalAngle;
        });
    }

	battleEnvironment.units.forEach(unit => {
		if (unit.hp <= 0) return;
		let tx          = Math.floor(unit.x / BATTLE_TILE_SIZE);
		let ty          = Math.floor(unit.y / BATTLE_TILE_SIZE);
		let currentTile = (battleEnvironment.grid[tx] && battleEnvironment.grid[tx][ty] !== undefined)
							? battleEnvironment.grid[tx][ty] : 0;
// ── Replace the old grid lookup with exact math ──
        let surface = window.getNavalSurfaceAt(unit.x, unit.y);
		// ── Three overboard stages ────────────────────────────────────────────
		// Stage A  tile 0 / other  →  on deck, normal movement
		// Stage B  tile 8          →  crossing the hull rail, near-zero velocity
		// Stage C  tile 11 / 4     →  fully in water, immediately swimming
let atEdge  = (surface === 'EDGE');
        let inWater = (surface === 'WATER');

	// The rest of your drowning logic stays exactly the same!
        if (atEdge) {
            unit.overboardTimer = (unit.overboardTimer || 0) + 1;
            unit.isSwimming     = false;
            unit.vx *= 0.05;
            unit.vy *= 0.05;

        } else if (inWater) {
            unit.overboardTimer = (unit.overboardTimer || 0) + 1;
            unit.isSwimming     = true;
            unit.vx *= 0.15;
            unit.vy *= 0.15;

        } else {
            // Stage A: safe on DECK or PLANK
			if (unit.isSwimming && typeof BattleAudio !== 'undefined') {
                BattleAudio.playWaterSplash(unit.x, unit.y, false);
            }
            unit.overboardTimer = 0;
            unit.isSwimming     = false;
        }

		// Drown timer ticks only during Stage C
		if (unit.isSwimming) {
			if (!unit.drownTimer) unit.drownTimer = 0;
			let drownThreshold = Math.max(450, 4500 - ((unit.stats.weightTier||1)*250) - (unit.stats.mass||10));
        unit.drownTimer++;
        if (unit.drownTimer > drownThreshold) {
            unit.hp = 0; unit.deathRotation = 0;
            if (typeof logGameEvent === 'function') logGameEvent(`${unit.unitType} drowned beneath the waves!`, "danger");
        }
    } else {
        if (unit.drownTimer > 0) unit.drownTimer -= 1;
    }
	});

navalEnvironment.fishes.forEach(f => {
    // LOW-tier-only 30Hz throttle (mirrors MB5 on land — this is the ONLY
    // place naval frame rate is ever cut, and only at LOW). Skip the
    // expensive avoidance/collision/blood-scan math on alternating frames;
    // still advance the wiggle phase below so fish don't visibly freeze.
    if (_navShouldThrottleThisFrame()) {
        f.currentWiggle = (Date.now() / 1000) * f.wiggleRate;
        return;
    }

    const avoid = _fishAvoidanceVector(f);

    // If near land or ships, steer away hard
    if (avoid.ax !== 0 || avoid.ay !== 0) {
        f.angle = Math.atan2(avoid.ay, avoid.ax) + (Math.random() - 0.5) * 0.25;
    } else if (Math.random() > 0.98) {
        f.angle += (Math.random() - 0.5) * 2;
    }

    const nx = f.x + Math.cos(f.angle) * f.speed;
    const ny = f.y + Math.sin(f.angle) * f.speed;

    // Reject moves into land or ship zones
    let blocked = !_isOpenWaterAt(nx, ny);
    if (!blocked) {
        for (const s of navalEnvironment.ships) {
            const sx = s.x + navalEnvironment.shipSwayX;
            const sy = s.y + navalEnvironment.shipSwayY;
            const shipRadius = Math.max(s.width, s.height) * 0.56 + 150;
            if (Math.hypot(nx - sx, ny - sy) < shipRadius) {
                blocked = true;
                break;
            }
        }
    }
// Inside the navalEnvironment.fishes.forEach loop:
if (blocked) {
    // Find the ship that is blocking it
    const blockingShip = navalEnvironment.ships.find(s => {
        const sx = s.x + navalEnvironment.shipSwayX;
        const sy = s.y + navalEnvironment.shipSwayY;
        const shipRadius = Math.max(s.width, s.height) * 0.56 + 150;
        return Math.hypot(f.x - sx, f.y - sy) < shipRadius;
    });

    if (blockingShip) {
        // Forcefully push the fish OUT along the vector from the ship center
        const pushAngle = Math.atan2(f.y - (blockingShip.y + navalEnvironment.shipSwayY), 
                                     f.x - (blockingShip.x + navalEnvironment.shipSwayX));
        f.angle = pushAngle + (Math.random() - 0.5) * 0.5;
        f.x += Math.cos(pushAngle) * (f.speed * 2); // Double speed to escape
        f.y += Math.sin(pushAngle) * (f.speed * 2);
    } else {
        // Standard land/grid block logic
        f.angle += Math.PI * 0.85;
    }
} else {
    f.x = nx;
    f.y = ny;
}
    // Wrap to 1px inside the bound, not the exact edge — landing exactly on
    // BATTLE_WORLD_WIDTH/HEIGHT can floor() to a grid column/row one past
    // the last valid index, making battleEnvironment.grid[tx] undefined and
    // _isOpenWaterAt() read false for that single frame (invisible flicker
    // right at the moment of wraparound).
    if (f.x < 0) f.x = BATTLE_WORLD_WIDTH - 1;
    if (f.x > BATTLE_WORLD_WIDTH) f.x = 1;
    if (f.y < 0) f.y = BATTLE_WORLD_HEIGHT - 1;
    if (f.y > BATTLE_WORLD_HEIGHT) f.y = 1;

    f.currentWiggle = (Date.now() / 1000) * f.wiggleRate;

    // Existing blood logic stays the same
    battleEnvironment.units.forEach(u => {
        if (u.hp <= 0) return;
        if (!u.isSwimming) return;

        const dx = u.x - f.x;
        const dy = u.y - f.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 8 && Math.random() < 0.012) {
            if (window.spawnFishBlood) window.spawnFishBlood(u.x, u.y);
        }
    });
});
    const _gullNow = Date.now();
    navalEnvironment.seagulls.forEach(g => {
        // ── Seagulls avoid flying directly over ships ────────────────────────
        // LOW-tier-only throttle on the expensive per-ship avoidance scan
        // (mirrors the fish throttle above and MB5 on land — only place
        // naval frame rate is ever cut). Position/banking below this still
        // updates every frame so seagulls keep flying smoothly even on LOW.
        let _gAvoidX = 0, _gAvoidY = 0;
        if (!_navShouldThrottleThisFrame()) {
            for (const s of navalEnvironment.ships) {
                const sx = s.x + navalEnvironment.shipSwayX;
                const sy = s.y + navalEnvironment.shipSwayY;
                const gdx = g.x - sx, gdy = g.y - sy;
                const gDist = Math.hypot(gdx, gdy) || 1;
                const avoidR = Math.max(s.width, s.height) * 0.45;
                if (gDist < avoidR) {
                    const push = (avoidR - gDist) / avoidR;
                    _gAvoidX += (gdx / gDist) * push * 1.5;
                    _gAvoidY += (gdy / gDist) * push * 1.5;
                }
            }
        }
        if (_gAvoidX !== 0 || _gAvoidY !== 0) {
            g.angle = Math.atan2(g.y + _gAvoidY - g.y, g.x + _gAvoidX - g.x);
            g.angle = Math.atan2(_gAvoidY, _gAvoidX);
        }

        g.x += Math.cos(g.angle) * g.speed;
        g.y += Math.sin(g.angle) * g.speed;

        // ── FLICKER FIX: smooth banking and speed changes via per-gull timers.
        // Old code used Math.random() > 0.99 every frame which caused instant
        // spikes in angle and speed, appearing as 1-frame position jumps.
        // New: pick a next-event time, lerp toward the target smoothly.
        if (g._bankTimer === undefined) {
            g._bankTimer    = 0;
            g._bankInterval = 180 + Math.random() * 240; // frames between turns
            g._bankTarget   = 0.005 + Math.random() * 0.008; // gentle drift rate
            g._speedTarget  = 1.8 + Math.random() * 2.0;
        }
        g._bankTimer++;
        if (g._bankTimer >= g._bankInterval) {
            g._bankTimer    = 0;
            g._bankInterval = 180 + Math.random() * 240;
            g._bankTarget   = (Math.random() > 0.5 ? 1 : -1) * (0.003 + Math.random() * 0.010);
            g._speedTarget  = 1.5 + Math.random() * 3.0;
        }
        // Lerp angle drift and speed smoothly (no jump)
        g._bankRate = (g._bankRate || 0.005) + (g._bankTarget - (g._bankRate || 0.005)) * 0.04;
        g.angle    += g._bankRate;
        g.speed    += (g._speedTarget - g.speed) * 0.018;
        g.speed     = Math.max(1.5, g.speed);
        if (g.x < -100) g.x = BATTLE_WORLD_WIDTH+100;  if (g.x > BATTLE_WORLD_WIDTH+100)  g.x = -100;
        if (g.y < -100) g.y = BATTLE_WORLD_HEIGHT+100; if (g.y > BATTLE_WORLD_HEIGHT+100) g.y = -100;

        // ── FLICKER FIX: accumulate phase with a delta so the value stays
        //   small (no float-precision loss at large Date.now() multiples).
        if (g._flapLastMs === undefined) {
            g._flapLastMs  = _gullNow;
            g._flapPhase   = Math.random() * Math.PI * 2; // random start per gull
        }
        const _flapDt = Math.min((_gullNow - g._flapLastMs) / 1000, 0.1); // cap at 100 ms spike
        g._flapPhase  += _flapDt * g.flapRate;
        // Keep phase in [0, 2π] to avoid eventual precision drift
        if (g._flapPhase > Math.PI * 2) g._flapPhase -= Math.PI * 2;
        g._flapLastMs  = _gullNow;
        g.currentFlap  = g._flapPhase;
    });
}

function isUnitOnShip(unit) {
    let surface = window.getNavalSurfaceAt(unit.x, unit.y);
    return surface === 'DECK' || surface === 'PLANK';
}

function _isOpenWaterAt(x, y) {
    const tx = Math.floor(x / BATTLE_TILE_SIZE);
    const ty = Math.floor(y / BATTLE_TILE_SIZE);
    const cell = battleEnvironment.grid && battleEnvironment.grid[tx] && battleEnvironment.grid[tx][ty];
    return NAVAL_WATER_TILES.has(cell);
}

function _fishAvoidanceVector(f) {
    let ax = 0;
    let ay = 0;

    const tx = Math.floor(f.x / BATTLE_TILE_SIZE);
    const ty = Math.floor(f.y / BATTLE_TILE_SIZE);
    const scan = 7;
    const radiusPx = scan * BATTLE_TILE_SIZE;

    for (let x = tx - scan; x <= tx + scan; x++) {
        for (let y = ty - scan; y <= ty + scan; y++) {
            if (x < 0 || x >= BATTLE_COLS || y < 0 || y >= BATTLE_ROWS) continue;

            const cell = battleEnvironment.grid[x] && battleEnvironment.grid[x][y];
            if (cell !== 12 && cell !== 13) continue; // only reefs and rocks repel fish

            const cx = (x + 0.5) * BATTLE_TILE_SIZE;
            const cy = (y + 0.5) * BATTLE_TILE_SIZE;
            const dx = f.x - cx;
            const dy = f.y - cy;
            const dist = Math.hypot(dx, dy) || 0.0001;

            if (dist < radiusPx) {
                const push = (radiusPx - dist) / radiusPx;
                ax += (dx / dist) * push * 3.0;
                ay += (dy / dist) * push * 3.0;
            }
        }
    }

    navalEnvironment.ships.forEach(s => {
        const sx = s.x + navalEnvironment.shipSwayX;
        const sy = s.y + navalEnvironment.shipSwayY;
        const shipRadius = Math.max(s.width, s.height) * 0.56 + 180;
        const dx = f.x - sx;
        const dy = f.y - sy;
        const dist = Math.hypot(dx, dy) || 0.0001;

        if (dist < shipRadius) {
            const push = (shipRadius - dist) / shipRadius;
            ax += (dx / dist) * push * 4.0;
            ay += (dy / dist) * push * 4.0;
        }
    });

    return { ax, ay };
}

// ════════════════════════════════════════════════════════════════════════
// PROCEDURAL OCEAN / COASTAL WATER SURFACE
// ════════════════════════════════════════════════════════════════════════
// Mirrors the land engine's tier system (_bptQL in
// battlefield_procedural_terrain.js) exactly, but reads the naval quality
// gate:
//   LOW  → zero procedural generation. The flat navalEnvironment.waterColor
//          fillRect already painted by the caller is left completely alone.
//   MED  → static depth/colour mottling + a single isotropic moving swell
//          band. Left EXACTLY as originally tuned — this tier already reads
//          fine and isn't the target of the HIGH/MAX rework below.
//   HIGH → MED's depth mottling, PLUS a completely different swell system:
//          two layered, WIND-DIRECTIONAL wave trains (a long primary swell
//          that travels with navalEnvironment.wind, plus a finer cross-chop
//          offset at an angle to it — the way real wind-chop sits on top of
//          ocean swell) rendered as elongated foam crests instead of MED's
//          isotropic blobs. Foam coverage scales with wind speed: calm seas
//          stay mostly clear, gale-force wind whites the surface up. Ships
//          also raise a bow spray + leave a stern wake trail at this tier —
//          see drawShipWakes() / _drawBowSpray() further down.
//   MAX  → HIGH + a fine sparkling glitter octave (twinkling glints, desktop-
//          exclusive since it's the priciest pass).
//
// Ocean/Coastal battle worlds can be up to 50000x32000 world units, so this
// NEVER samples the whole map. Only the current camera viewport (+padding)
// is rendered, and it's recomputed fresh every single frame — that's what
// lets HIGH/MAX water actually move instead of being a static baked-in
// texture like the land terrain passes.
function _navWaterQL() {
    const tier = window.currentGraphicsQualityTier;
    if (tier === "MAX")                      return 3;
    if (tier === "HIGH")                     return 2;
    if (tier === "MED" || tier === "MEDIUM") return 1;
    if (!window._SETTINGS_IS_MOBILE)         return 2;   // desktop default = HIGH
    const mq = _navGetQual();
    return mq >= 100 ? 2 : mq >= 50 ? 1 : 0;
}

// ── Anisotropic ridge sample — the "directional wave" primitive ──────────
// Plain _noise2D()/_fbm() are isotropic: they read as round, directionless
// blobs. Real swell instead shows up as long, roughly-parallel crest lines
// all traveling the same way (the wind). We fake that cheaply by rotating
// the sample point into "wave-aligned" space (cosA/sinA) and squashing the
// axis ACROSS the travel direction by invStretch before sampling — the same
// noise lattice cell then reads as a ridge that's short along travel, long
// across it. cosA/sinA/invStretch are precomputed ONCE per frame by the
// caller (direction doesn't change per-cell, so there's no reason to pay
// for trig inside the hot per-cell loop below).
function _navRidgeAt(x, y, seed, cosA, sinA, invStretch) {
    const u = x * cosA + y * sinA;
    const v = (-x * sinA + y * cosA) * invStretch;
    const n = _noise2D(u, v, seed);
    const ridge = 1 - Math.abs(2 * n - 1);
    return ridge * ridge;
}

function drawProceduralOceanWater(ctx) {
    if (!inNavalBattle) return;
    // River naval battles are redirected to the land engine elsewhere in
    // this file (initNavalBattle coerces "River" → "Coastal"), but guard
    // defensively in case that ever changes.
    if (navalEnvironment.mapType === "River") return;

    const ql = _navWaterQL();
    if (ql < 1) return; // LOW — flat colour fill only, nothing more to paint

    const seed = (navalEnvironment.mapSeed || 1) >>> 0;
    const cell = 40; // world-px per water sample — naval zoom never needs 8px land-tile grain
    // FIX (water not moving on MED): previously this was `ql >= 2 ? time : 0`,
    // which forced MED to a permanently frozen frame ("intentionally...
    // stays static" — that was the bug, not a feature). MED/HIGH/MAX should
    // all animate; only LOW (which returns early above, flat colour only)
    // stays static.
    const time = Date.now() / 1000;

    // Viewport in world space (camera getters are already world-space —
    // same object naval fish/wave/seagull culling relies on via _navOnScreen).
    let vx, vy, vw, vh;
    if (typeof camera !== 'undefined' && camera) {
        const pad = cell * 3;
        vx = camera.x - pad; vy = camera.y - pad;
        vw = camera.width + pad * 2; vh = camera.height + pad * 2;
    } else {
        vx = 0; vy = 0; vw = BATTLE_WORLD_WIDTH; vh = BATTLE_WORLD_HEIGHT;
    }
    const x0 = Math.max(0, Math.floor(vx / cell) * cell);
    const y0 = Math.max(0, Math.floor(vy / cell) * cell);
    const x1 = Math.min(BATTLE_WORLD_WIDTH,  vx + vw);
    const y1 = Math.min(BATTLE_WORLD_HEIGHT, vy + vh);
    if (x1 <= x0 || y1 <= y0) return;

    ctx.save();

    // ── PASS 1 — depth/colour mottling (MED, HIGH, MAX) — static ─────────
    for (let wx = x0; wx < x1; wx += cell) {
        for (let wy = y0; wy < y1; wy += cell) {
            const depth = _fbm(wx * 0.01, wy * 0.01, seed, 3);
            // Deep → shallow lerp, cool blue-teal range layered over the
            // base navalEnvironment.waterColor fill already on screen.
            const wr = (18 + (60 - 18) * depth) | 0;
            const wg = (60 + (140 - 60) * depth) | 0;
            const wb = (85 + (168 - 85) * depth) | 0;
            ctx.fillStyle = "rgba(" + wr + "," + wg + "," + wb + "," + (0.16 + depth * 0.10).toFixed(2) + ")";
            ctx.fillRect(wx, wy, cell, cell);
        }
    }

    if (ql === 1) {
        // ── MED — original moving swell band pass, left EXACTLY as tuned ──
        // Ridge-noise crest technique (same maths family as the land
        // terrain's ridged FBM), scrolled over time so the crests visibly
        // travel across the water like real swell.
        const bandFreq = 0.006;
        const speed = 6.0; // world-px/sec drift
        const driftX = time * speed;
        const driftY = time * speed * 0.6;
        for (let wx = x0; wx < x1; wx += cell) {
            for (let wy = y0; wy < y1; wy += cell) {
                const n = _noise2D((wx + driftX) * bandFreq, (wy + driftY) * bandFreq, seed ^ 0x5EED);
                const ridge = 1 - Math.abs(2 * n - 1);
                const crest = ridge * ridge;
                if (crest > 0.62) {
                    const a = ((crest - 0.62) * 0.46).toFixed(3);
                    ctx.fillStyle = "rgba(200,232,236," + a + ")";
                    ctx.fillRect(wx, wy, cell, cell);
                }
            }
        }
    } else if (ql >= 2) {
        // ── HIGH/MAX — wind-driven layered swell + cross-chop + foam ─────
        // Reads off the SAME wind state that already drives sailing physics
        // (navalEnvironment.wind / window._navalWind*) so the ocean visibly
        // answers to the wind the player is sailing by, instead of
        // animating on a disconnected clock.
        const windAngle = (typeof window._navalWindAngle === 'number') ? window._navalWindAngle : navalEnvironment.wind.angle;
        const windSpd   = (typeof window._navalWindSpeed  === 'number') ? window._navalWindSpeed  : 0.5;
        const ampMul    = 0.55 + windSpd * 0.85; // calm seas → sparse foam · gale → whitecaps everywhere

        // Primary swell — long crest lines traveling WITH the wind.
        const SWELL_FREQ    = 0.0050;  // <<<< TWEAK swell wavelength (smaller = longer waves)
        const SWELL_STRETCH = 3.4;     // <<<< TWEAK crest-line length (higher = longer, straighter)
        const SWELL_SPEED   = 15;      // world-px/sec drift along wind direction
        const cosSwell = Math.cos(windAngle), sinSwell = Math.sin(windAngle);
        const invStretchSwell = 1 / SWELL_STRETCH;
        const driftSwell = time * SWELL_SPEED;
        const dSwellX = Math.cos(windAngle) * driftSwell;
        const dSwellY = Math.sin(windAngle) * driftSwell;

        // Cross-chop — shorter, faster ripples offset ~55-70° from the
        // swell, the way real wind-chop sits diagonally across ocean swell.
        // Angle gets a small per-map seed jitter so different battle maps
        // don't all show the exact same crossing angle.
        const CHOP_FREQ    = 0.0125;   // <<<< TWEAK chop wavelength
        const CHOP_STRETCH = 1.5;      // <<<< TWEAK chop crest-line length
        const CHOP_SPEED   = 24;
        const chopAngle = windAngle + 1.02 + (_hash2D(1, 1, seed) - 0.5) * 0.3;
        const cosChop = Math.cos(chopAngle), sinChop = Math.sin(chopAngle);
        const invStretchChop = 1 / CHOP_STRETCH;
        const driftChop = time * CHOP_SPEED;
        const dChopX = Math.cos(chopAngle) * driftChop;
        const dChopY = Math.sin(chopAngle) * driftChop;

        const FOAM_THRESH = 0.72;      // <<<< TWEAK foam coverage (lower = more foam) — raised from 0.55: too much foam clutter at all tiers, this cuts density substantially while keeping the wave motion itself untouched
        const rotFoam = windAngle + Math.PI / 2; // crest lines run perpendicular to travel

        for (let wx = x0; wx < x1; wx += cell) {
            for (let wy = y0; wy < y1; wy += cell) {
                const crest1 = _navRidgeAt((wx - dSwellX) * SWELL_FREQ, (wy - dSwellY) * SWELL_FREQ, seed ^ 0x5EED, cosSwell, sinSwell, invStretchSwell);
                const crest2 = _navRidgeAt((wx - dChopX)  * CHOP_FREQ,  (wy - dChopY)  * CHOP_FREQ,  seed ^ 0xA17E, cosChop,  sinChop,  invStretchChop);
                let combined = (crest1 * 0.68 + crest2 * 0.44) * ampMul;
                if (combined <= FOAM_THRESH) continue;

                const t  = Math.min(1, (combined - FOAM_THRESH) / (1 - FOAM_THRESH));
                const cx = wx + cell * 0.5, cy = wy + cell * 0.5;

                // Colour ramps pale teal → bright white as the crest sharpens
                // (real whitecaps go from disturbed-water teal to pure white
                // right at the breaking peak).
                const fr = (198 + 57 * t) | 0;
                const fg = (228 + 27 * t) | 0;
                const fb = (232 + 23 * t) | 0;
                const alpha = 0.08 + t * t * 0.46;

                ctx.fillStyle = "rgba(" + fr + "," + fg + "," + fb + "," + alpha.toFixed(3) + ")";
                ctx.beginPath();
                ctx.ellipse(cx, cy, cell * (0.62 + t * 0.34), cell * (0.30 + t * 0.12), rotFoam, 0, Math.PI * 2);
                ctx.fill();

                // Bright whitecap peak — sparse, only the very sharpest crests.
                if (t > 0.72) {
                    const t2 = (t - 0.72) / 0.28;
                    ctx.fillStyle = "rgba(255,255,255," + (t2 * 0.55).toFixed(3) + ")";
                    ctx.beginPath();
                    ctx.ellipse(cx, cy, cell * 0.34, cell * 0.16, rotFoam, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        if (ql >= 3) {
            // ── MAX ONLY — fine sparkle/glitter octave ────────────────────
            // Small twinkling glints scattered across the surface, evoking
            // light catching individual wave facets. MAX is desktop-
            // exclusive (see GRAPHICS_QUALITY_TIERS in settings_ui.js), so
            // the extra per-candidate-cell cost (one more hash + sin) is
            // affordable here in a way it wouldn't be on mobile HIGH.
            const fineFreq   = 0.024;  // <<<< TWEAK glitter density
            const glintDrift = time * 10;
            const gDriftX = Math.cos(windAngle + 0.6) * glintDrift;
            const gDriftY = Math.sin(windAngle + 0.6) * glintDrift;
            for (let wx = x0; wx < x1; wx += cell) {
                for (let wy = y0; wy < y1; wy += cell) {
                    const n = _noise2D((wx + gDriftX) * fineFreq, (wy - gDriftY) * fineFreq, seed ^ 0xBEEF);
                    if (n <= 0.90) continue; // raised from 0.775 — far fewer, sparser glints; still visible on MAX, no longer a busy shimmer
                    const twinkleSeed = _hash2D((wx / cell) | 0, (wy / cell) | 0, seed ^ 0x51DE);
                    const twinkle = 0.5 + 0.5 * Math.sin(time * 3.2 + twinkleSeed * Math.PI * 2 * 6);
                    const a = (n - 0.775) * 1.6 * (0.30 + 0.70 * twinkle) * ampMul;
                    if (a < 0.02) continue;
                    ctx.fillStyle = "rgba(255,255,255," + a.toFixed(3) + ")";
                    ctx.beginPath();
                    ctx.arc(wx + cell * 0.5, wy + cell * 0.5, cell * (0.14 + twinkle * 0.10), 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    ctx.restore();
}

// Add this global variable near the top of naval_battles.js
let navalBackgroundCache = null;

// Replace your drawNavalBackground with this cached version
function drawNavalBackground(ctx) {
    if (!inNavalBattle || !battleEnvironment.grid) return;

    // 1. Build the cache ONLY ONCE (or if the map changes)
    if (!navalBackgroundCache) {
        navalBackgroundCache = document.createElement('canvas');
        // === MOBILE GPU SAFETY: cap at 4096px per dimension ===
        const _rawW = BATTLE_COLS * BATTLE_TILE_SIZE;
        const _rawH = BATTLE_ROWS * BATTLE_TILE_SIZE;
        const _maxDim = 4096;
        const _bgScale = Math.min(1, _maxDim / Math.max(_rawW, _rawH));
        navalBackgroundCache.width  = Math.floor(_rawW * _bgScale);
        navalBackgroundCache.height = Math.floor(_rawH * _bgScale);
        const cacheCtx = navalBackgroundCache.getContext('2d');
        if (_bgScale < 1) cacheCtx.scale(_bgScale, _bgScale);

        // Render the expensive graphics onto the cache canvas
        for (let x = 0; x < BATTLE_COLS; x++) {
            for (let y = 0; y < BATTLE_ROWS; y++) {
                const cell = battleEnvironment.grid[x][y];
                if (cell === 11) continue; // Skip plain water

                const px = x * BATTLE_TILE_SIZE;
                const py = y * BATTLE_TILE_SIZE;
                const cx = px + BATTLE_TILE_SIZE * 0.5;
                const cy = py + BATTLE_TILE_SIZE * 0.5;
                const seed = navalEnvironment.mapSeed || 1;

                cacheCtx.save();

                if (cell === 12) {
                    // REEFS (Paste your previous reef drawing logic here, but use cacheCtx instead of ctx)
                    const n = _hash2D(x * 11, y * 17, seed);
                    const drawRadius = BATTLE_TILE_SIZE * (1.2 + n * 0.6); 
                    const grad = cacheCtx.createRadialGradient(cx, cy, BATTLE_TILE_SIZE * 0.1, cx, cy, drawRadius);
                    grad.addColorStop(0, "rgba(218, 212, 168, 0.35)");
                    grad.addColorStop(0.4, "rgba(186, 191, 150, 0.20)");
                    grad.addColorStop(1, "rgba(150, 168, 150, 0.0)");
                    
                    cacheCtx.fillStyle = grad;
                    cacheCtx.beginPath();
                    cacheCtx.ellipse(cx + (n - 0.5) * BATTLE_TILE_SIZE, cy + (_hash2D(x + 3, y + 7, seed) - 0.5) * BATTLE_TILE_SIZE, drawRadius, drawRadius * 0.7, n * Math.PI * 2, 0, Math.PI * 2);
                    cacheCtx.fill();

                } else if (cell === 13) {
                    // ROCKS (Paste your previous rock drawing logic here, using cacheCtx)
                    const n = _hash2D(x * 7, y * 31, seed);
                    cacheCtx.fillStyle = "rgba(0, 0, 0, 0.25)";
                    cacheCtx.beginPath();
                    cacheCtx.ellipse(cx + 8, cy + 10, BATTLE_TILE_SIZE * 0.4, BATTLE_TILE_SIZE * 0.2, 0.2, 0, Math.PI * 2);
                    cacheCtx.fill();

                    cacheCtx.fillStyle = "rgba(42, 50, 57, 0.85)";
                    const stoneCount = 3 + Math.floor(n * 4);
                    for (let i = 0; i < stoneCount; i++) {
                        const ox = (_hash2D(x + 11 * i, y + 17 * i, seed) - 0.5) * BATTLE_TILE_SIZE * 1.6;
                        const oy = (_hash2D(x + 19 * i, y + 23 * i, seed) - 0.5) * BATTLE_TILE_SIZE * 1.6;
                        const rx = BATTLE_TILE_SIZE * (0.10 + _hash2D(x + 5 + i, y + 9 + i, seed) * 0.12);
                        const ry = BATTLE_TILE_SIZE * (0.08 + _hash2D(x + 13 + i, y + 15 + i, seed) * 0.10);
                        cacheCtx.beginPath();
                        cacheCtx.ellipse(cx + ox, cy + oy, rx, ry, _hash2D(x + 31 + i, y + 37 + i, seed) * Math.PI, 0, Math.PI * 2);
                        cacheCtx.fill();
                    }

                } else if (cell === 14) {
                    // KELP (Paste your previous kelp drawing logic here, using cacheCtx)
                    const n = _hash2D(x * 13, y * 29, seed);
                    const strands = 4 + Math.floor(n * 5);
                    for (let i = 0; i < strands; i++) {
                        const startX = cx + (_hash2D(x + i * 17, y + i * 11, seed) - 0.5) * BATTLE_TILE_SIZE * 1.2;
                        const startY = cy + (_hash2D(x + i * 13, y + i * 19, seed) - 0.5) * BATTLE_TILE_SIZE * 1.2;
                        const reachX = BATTLE_TILE_SIZE * (1.5 + _hash2D(x + 61 + i, y + 71 + i, seed) * 2);
                        const reachY = -BATTLE_TILE_SIZE * (1.0 + _hash2D(x + 23 + i, y + 41 + i, seed) * 1.5);

                        cacheCtx.strokeStyle = i % 2 === 0 ? "rgba(92, 145, 92, 0.45)" : "rgba(64, 104, 66, 0.35)";
                        cacheCtx.lineWidth = 1.8 + _hash2D(x + 91 + i, y + 33 + i, seed) * 1.5;
                        cacheCtx.lineCap = "round";
                        cacheCtx.beginPath();
                        cacheCtx.moveTo(startX, startY);
                        cacheCtx.quadraticCurveTo(startX + reachX * 0.6, startY + reachY * 0.2, startX + reachX, startY + reachY);
                        cacheCtx.stroke();
                    }
                    
                } else if (cell === 15) {
                    // TRENCHES (Paste your previous trench drawing logic here, using cacheCtx)
                    const n = _hash2D(x * 5, y * 41, seed);
                    const drawRadius = BATTLE_TILE_SIZE * (1.0 + n * 0.5);
                    const grad = cacheCtx.createRadialGradient(cx, cy, BATTLE_TILE_SIZE * 0.1, cx, cy, drawRadius);
                    grad.addColorStop(0, "rgba(4, 20, 33, 0.35)");
                    grad.addColorStop(1, "rgba(10, 34, 52, 0.0)");
                    cacheCtx.fillStyle = grad;
                    cacheCtx.beginPath();
                    cacheCtx.arc(cx, cy, drawRadius, 0, Math.PI * 2);
                    cacheCtx.fill();
                }

                cacheCtx.restore();
            }
        }
    }

// 2. The magic: Extract the viewport from the cache!
    if (typeof drawOptimizedBattleCanvas === 'function' && typeof player !== 'undefined') {
        let cw = window.innerWidth;
        let ch = window.innerHeight;
        let cZoom = typeof zoom !== 'undefined' ? zoom : 1;
        // Naval cache is drawn strictly at 0,0 (no visual padding offset)
        drawOptimizedBattleCanvas(ctx, navalBackgroundCache, player.x, player.y, cw, ch, cZoom, 0, 0);
    } else {
        ctx.drawImage(navalBackgroundCache, 0, 0);
    }
}

// ============================================================================
// SHIP WAKES — stern foam trail + bow spray (HIGH/MAX only)
// ============================================================================
// Two related but separately-driven effects:
//   • STERN WAKE — a history trail (ship._wakeTrail, recorded every frame in
//     updateNavalPhysics) so the foam follows the ship's ACTUAL path,
//     including turns, not just a straight line behind its current heading.
//     Drawn here, in world space, UNDER the hull loop further down.
//   • BOW SPRAY  — no history needed, always "attached" to the bow. Drawn
//     per-ship from INSIDE the hull loop's local (translated+rotated) space
//     via _drawBowSpray() below, so +X in that function already means "bow".
// Both gate behind _navWaterQL()>=2 — LOW/MED render neither, and the
// trail-recording cost in updateNavalPhysics() is ALSO skipped for them, so
// this entire feature costs those tiers nothing.
function drawShipWakes(ctx) {
    if (_navWaterQL() < 2) return;
    const time = Date.now() / 1000;
    const WAKE_LIFETIME = 5.2; // seconds — must match updateNavalPhysics()'s aging window
    ctx.save();
    navalEnvironment.ships.forEach(s => {
        const trail = s._wakeTrail;
        if (!trail || trail.length < 2) return;
        if (!_navOnScreen(s)) return; // ship (and therefore its nearby trail) is off-screen

        for (let i = 0; i < trail.length; i++) {
            const p = trail[i];
            const age = time - p.born;
            if (age <= 0 || age >= WAKE_LIFETIME) continue;
            const lifeFrac = age / WAKE_LIFETIME;        // 0 = just laid, 1 = fully dissolved
            const spdFrac  = Math.min(1, p.spd / 3.2);    // normalised vs. a brisk clip
            if (spdFrac < 0.05) continue;                 // ship was essentially idle here — no churn

            const fade  = (1 - lifeFrac) * (1 - lifeFrac); // eases out rather than lingering flat
            const alpha = fade * 0.34 * (0.35 + spdFrac * 0.65);
            if (alpha < 0.012) continue;

            const spread = 0.55 + lifeFrac * 1.5; // turbulence widens the patch as it ages
            const r = (s.height * 0.15 + 5) * (0.5 + spdFrac * 0.85) * spread;

            const wx = p.x + navalEnvironment.shipSwayX;
            const wy = p.y + navalEnvironment.shipSwayY;

            ctx.fillStyle = "rgba(232,248,250," + alpha.toFixed(3) + ")";
            ctx.beginPath();
            ctx.arc(wx, wy, r, 0, Math.PI * 2);
            ctx.fill();

            // Freshest sliver of the trail gets a brighter core — the water
            // that's still actively churning right behind the stern.
            if (lifeFrac < 0.22) {
                const coreA = (1 - lifeFrac / 0.22) * 0.30 * (0.4 + spdFrac * 0.6);
                if (coreA > 0.015) {
                    ctx.fillStyle = "rgba(255,255,255," + coreA.toFixed(3) + ")";
                    ctx.beginPath();
                    ctx.arc(wx, wy, r * 0.55, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    });
    ctx.restore();
}

// Bow spray — called per-ship from INSIDE the hull-drawing loop below, in
// ship-local space (+X = bow, matches the hull art). No history needed:
// intensity is driven entirely by the ship's current speed.
function _drawBowSpray(ctx, s, w, h, t) {
    const spd = s.speed || 0;
    if (spd < 0.30) return; // essentially stationary — no bow wave to raise
    const spdFrac  = Math.min(1, spd / 3.0);
    const bowX     = w * 0.47;
    const wingAng  = 0.34 + spdFrac * 0.16;
    const wingLen  = (h * 0.62 + w * 0.05) * (0.45 + spdFrac * 0.9);
    const flicker  = 0.85 + Math.sin(t * 7.1 + s.x * 0.002) * 0.15;

    ctx.save();
    [-1, 1].forEach(side => {
        const tipX = bowX + Math.cos(wingAng) * wingLen;
        const tipY = side * Math.sin(wingAng) * wingLen;
        const midX = bowX + Math.cos(wingAng) * wingLen * 0.45;
        const midY = side * Math.sin(wingAng) * wingLen * 0.45;

        const grad = ctx.createLinearGradient(bowX, 0, tipX, tipY);
        grad.addColorStop(0, "rgba(255,255,255," + (0.55 * spdFrac * flicker).toFixed(3) + ")");
        grad.addColorStop(1, "rgba(230,248,250,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth   = 4 + spdFrac * 4;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(bowX * 0.55, side * h * 0.10);
        ctx.quadraticCurveTo(midX, midY, tipX, tipY);
        ctx.stroke();
    });

    // Small bright foam pile right at the stem where the hull is actively
    // displacing water — the "bone in her teeth" look.
    ctx.fillStyle = "rgba(255,255,255," + (0.40 * spdFrac * flicker).toFixed(3) + ")";
    ctx.beginPath();
    ctx.ellipse(bowX * 0.88, 0, w * 0.045 * (0.6 + spdFrac * 0.6), h * 0.11 * (0.6 + spdFrac * 0.6), 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// ============================================================================
// SHIP HULL DRAW — Song Dynasty 樓船 top-down view
// Sails are rendered on the separate sail canvas overlay, NOT here.
// ============================================================================
function drawNavalShips(ctx) {
    if (!inNavalBattle) return;
    const time = Date.now() / 1000; // shared time for oar/sail animation
    const _wql = _navWaterQL(); // HIGH/MAX gate for bow spray, checked once per frame


    // ---> SURGERY: Draw Fishes First (Underneath Ships)
    ctx.save();
	
    ctx.fillStyle = "rgba(20,55,80,0.55)"; // fish — slightly lighter than water so they show up
    navalEnvironment.fishes.forEach(f => {
        // Viewport cull — quality-scaled margin (tight at LOW, moderate at
        // MED, generous at HIGH/MAX). Previously fish drew unconditionally
        // across the ENTIRE map regardless of camera position.
        if (!_navOnScreen(f)) return;
        let tx = Math.floor(f.x / BATTLE_TILE_SIZE);
        let ty = Math.floor(f.y / BATTLE_TILE_SIZE);
        if (_isOpenWaterAt(f.x, f.y)){
            ctx.save();
            ctx.translate(f.x, f.y);
            ctx.rotate(f.angle + Math.sin(f.currentWiggle||0) * 0.2);
            ctx.beginPath(); ctx.ellipse(0, 0, f.length, f.length/4, 0, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(-f.length,0); ctx.lineTo(-f.length-8,-6); ctx.lineTo(-f.length-8,6); ctx.fill();
            ctx.restore();
        }
    });
    ctx.restore();


    navalEnvironment.waves.forEach(w => {
        // Viewport cull — same margin system as fish/seagulls above.
        if (!_navOnScreen(w)) return;
        let time = Date.now() / 1000;
        let wavePhase = time * w.speed + w.offset;
        let wx = w.x + Math.sin(wavePhase) * 20;

        // Alpha peaks at 0.38 (was 0.22 — too faint, especially at large map zoom)
        let waveAlpha = (Math.sin(wavePhase * 0.8) + 1) / 2 * 0.38;

        if (waveAlpha > 0.02 && _isOpenWaterAt(wx, w.y)) {
            let clearOfShips = true;
            for (let s of navalEnvironment.ships) {
                let sx = s.x + navalEnvironment.shipSwayX;
                let sy = s.y + navalEnvironment.shipSwayY;
                let dx = (wx - sx) / (s.width  * 0.55);
                let dy = (w.y - sy) / (s.height * 0.55);
                if ((dx * dx + dy * dy) <= 1.0) { clearOfShips = false; break; }
            }
            if (clearOfShips) {
                // Use per-wave line weight (set in generateCosmetics); fall back to 1.5
                ctx.lineWidth   = w.lw || 1.5;
                ctx.lineCap     = 'round';
                ctx.strokeStyle = `rgba(255, 255, 255, ${waveAlpha.toFixed(3)})`;
                let bobY  = w.y + Math.cos(wavePhase) * 3;
                let crest = 4   + Math.sin(wavePhase * 1.5) * 2;
                ctx.beginPath();
                ctx.moveTo(wx, bobY);
                ctx.quadraticCurveTo(wx + w.length * 0.5, bobY - crest, wx + w.length, bobY);
                ctx.stroke();
            }
        }
    });

    // Stern foam trail — drawn UNDER the hull loop below so each ship's own
    // hull paints over the brightest, freshest churn right at its stern.
    drawShipWakes(ctx);

    ctx.save();
    ctx.translate(navalEnvironment.shipSwayX, navalEnvironment.shipSwayY);
	
    navalEnvironment.ships.forEach(s => {
        ctx.save();
        ctx.translate(s.x, s.y);
        // ── SHIP HEADING ROTATION ────────────────────────────────────────
        // Ship art is drawn with bow at +X. s.heading=0 → bow faces east.
        // Add wave rocking for visual wobble (does NOT affect physics).
        const _rockAngle = (s._rockAngle || 0);
        ctx.rotate(s.heading + _rockAngle);
        let w = s.width, h = s.height;

        // ── 1. HULL WATER SHADOW ──────────────────────────────────────────
        ctx.save();
        ctx.globalAlpha = 0.26;
        ctx.fillStyle   = "#000";
        ctx.beginPath();
        ctx.ellipse(10, 8, w*0.49, h*0.41, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();

        // ── 1b. BOW SPRAY — DISABLED per user request ────────────────────
        // Ships should show a stern wake only, no front/bow water line.
        // _drawBowSpray() is left intact below in case this is revisited,
        // just not called here.
        // if (_wql >= 2) _drawBowSpray(ctx, s, w, h, time);

        // ── 2. ANTI-FOULING WATERLINE (red ochre — authentic Song practice) ──
        ctx.fillStyle = "#6b1515";
        ctx.beginPath();
        ctx.moveTo(-w*0.470, -h*0.375);
        ctx.quadraticCurveTo(-w*0.08, -h*0.595, w*0.390, -h*0.298);
        
        // NEW: Tapered Trapezoid Bow
        ctx.lineTo(w*0.480, -h*0.120); // Angle forward
        ctx.lineTo(w*0.480,  h*0.120); // Flat vertical face
        ctx.lineTo(w*0.390,  h*0.298); // Angle back
        
        ctx.quadraticCurveTo(-w*0.08,  h*0.595, -w*0.470,  h*0.375);
        ctx.lineTo(-w*0.545, 0);
        ctx.closePath();
        ctx.fill();

        // ── 3. MAIN HULL (dark lacquered teak / camphor wood) ─────────────
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.moveTo(-w*0.445, -h*0.348);
        ctx.quadraticCurveTo(-w*0.06, -h*0.548, w*0.372, -h*0.272);
        
        // NEW: Tapered Trapezoid Bow
        ctx.lineTo(w*0.460, -h*0.105); // Angle forward
        ctx.lineTo(w*0.460,  h*0.105); // Flat vertical face
        ctx.lineTo(w*0.372,  h*0.272); // Angle back
        
        ctx.quadraticCurveTo(-w*0.06,  h*0.548, -w*0.445,  h*0.348);
        ctx.lineTo(-w*0.512, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#110804"; ctx.lineWidth = 5; ctx.stroke();

        // ── 4. OARS — rendered BEFORE deck so deck visually covers their inboard ends.
        //   This makes them look like real oars threading through oarlocks.
        if (window.NavalRowing && typeof window.NavalRowing.drawOars === 'function') {
            window.NavalRowing.drawOars(ctx, s, time);
        }

        // ── 5. DECK SURFACE (lighter wood, clean — no planking grid) ──────
        ctx.fillStyle = s.deck;
        ctx.beginPath();
        ctx.moveTo(-w*0.402, -h*0.272);
        ctx.quadraticCurveTo(-w*0.02, -h*0.432, w*0.300, -h*0.196);
        
        // NEW: Tapered Trapezoid Bow
        ctx.lineTo(w*0.435, -h*0.080); // Angle forward
        ctx.lineTo(w*0.435,  h*0.080); // Flat vertical face
        ctx.lineTo(w*0.300,  h*0.196); // Angle back
        
        ctx.quadraticCurveTo(-w*0.02,  h*0.432, -w*0.402,  h*0.272);
        ctx.lineTo(-w*0.442, 0);
        ctx.closePath();
        ctx.fill();

        // ── 6. STERN CASTLE 艉樓 (port/-X) — tiered tower ship structure ──
        // Tier 1 base
        ctx.fillStyle = "#2a1608";
        ctx.beginPath();
        ctx.moveTo(-w*0.462, -h*0.292);
        ctx.lineTo(-w*0.196, -h*0.292);
        ctx.lineTo(-w*0.176,  0);
        ctx.lineTo(-w*0.196,  h*0.292);
        ctx.lineTo(-w*0.462,  h*0.292);
        ctx.lineTo(-w*0.512,  0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#8b1c1c"; ctx.lineWidth = 3; ctx.stroke();

        // Tier 1 eave curves (red lacquer roof edge seen from above)
        ctx.strokeStyle = "#a52020"; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-w*0.456, -h*0.284);
        ctx.quadraticCurveTo(-w*0.322, -h*0.324, -w*0.200, -h*0.282);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-w*0.456,  h*0.284);
        ctx.quadraticCurveTo(-w*0.322,  h*0.324, -w*0.200,  h*0.282);
        ctx.stroke();

        // Tier 2 upper level — medium and heavy ships
        if (w >= 1100) {
            ctx.fillStyle = "#38200e";
            ctx.beginPath();
            ctx.moveTo(-w*0.452, -h*0.202);
            ctx.lineTo(-w*0.237, -h*0.202);
            ctx.lineTo(-w*0.218,  0);
            ctx.lineTo(-w*0.237,  h*0.202);
            ctx.lineTo(-w*0.452,  h*0.202);
            ctx.lineTo(-w*0.490,  0);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "#b02424"; ctx.lineWidth = 2; ctx.stroke();
            ctx.strokeStyle = "#c83030"; ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-w*0.446, -h*0.196);
            ctx.quadraticCurveTo(-w*0.342, -h*0.222, -w*0.242, -h*0.194);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-w*0.446,  h*0.196);
            ctx.quadraticCurveTo(-w*0.342,  h*0.222, -w*0.242,  h*0.194);
            ctx.stroke();
        }

        // Tier 3 command pavilion — heavy ships only (大型樓船)
        if (w >= 1550) {
            ctx.fillStyle = "#4a2812";
            ctx.beginPath();
            ctx.ellipse(-w*0.432, 0, w*0.040, h*0.108, 0, 0, Math.PI*2);
            ctx.fill();
            ctx.strokeStyle = "#d03030"; ctx.lineWidth = 1.5; ctx.stroke();
        }

        // ── 7. BOW CASTLE 前樓 (starboard/+X) — forward fire platform ────
        ctx.fillStyle = "#2e1b0d";
        ctx.beginPath();
        ctx.moveTo( w*0.216, -h*0.178);
        
        // Extended forward to match the new deck trapezoid
        ctx.lineTo( w*0.415, -h*0.070); 
        ctx.lineTo( w*0.415,  h*0.070); 
        
        ctx.lineTo( w*0.216,  h*0.178);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#7a1818"; ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = "#992222"; ctx.lineWidth = 1.5;
        
        // Bow castle curve lines stretched to fit
        ctx.beginPath();
        ctx.moveTo(w*0.222, -h*0.172);
        ctx.quadraticCurveTo(w*0.318, -h*0.160, w*0.410, -h*0.068);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w*0.222,  h*0.172);
        ctx.quadraticCurveTo(w*0.318,  h*0.160, w*0.410,  h*0.068);
        ctx.stroke();

        // ── 9. STERN LANTERNS (red paper lanterns with candle flicker) ───
        let t    = Date.now() / 1000;
        let flick = 0.85 + Math.sin(t*4.3 + s.y*0.001) * 0.15;
        [-h*0.196, h*0.196].forEach(ly => {
            ctx.save();
            ctx.globalAlpha = 0.18 * flick;
            ctx.fillStyle   = "#ff6020";
            ctx.beginPath(); ctx.arc(-w*0.490, ly, 16, 0, Math.PI*2); ctx.fill();
            ctx.restore();
            ctx.fillStyle = "#cc2020";
            ctx.beginPath(); ctx.ellipse(-w*0.490, ly, 5, 7, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = "#d4a010";
            ctx.fillRect(-w*0.490-5, ly-8, 10, 2);
            ctx.fillRect(-w*0.490-5, ly+6, 10, 2);
        });

        ctx.restore(); // end ship translate
    });

    ctx.restore(); // end sway translate
}

// ============================================================================
// WAVES & COSMETICS DRAW
// ============================================================================
function drawCosmeticWaves(ctx) {
    if (!inNavalBattle) return;
    let time = Date.now() / 1000;

    ctx.lineWidth = 2;
    
 

    navalEnvironment.seagulls.forEach(g => {
        // Viewport cull — same margin system as fish/waves above.
        if (!_navOnScreen(g)) return;
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.13)";
        ctx.beginPath();
        ctx.ellipse(g.x+15*g.scale, g.y+15*g.scale, 4*g.scale, 2*g.scale, g.angle, 0, Math.PI*2);
        ctx.fill();

        ctx.translate(g.x, g.y); ctx.scale(g.scale, g.scale); ctx.rotate(g.angle);
        let flap = Math.sin(g.currentFlap||0) * 8;

        ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(0,0); ctx.quadraticCurveTo(-10,-12+flap,-22, 2+flap); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0,0); ctx.quadraticCurveTo( 10,-12+flap, 22, 2+flap); ctx.stroke();

        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.ellipse(1,0,4,2,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = "#ffc107";
        ctx.beginPath(); ctx.moveTo(4,-1); ctx.lineTo(7,0); ctx.lineTo(4,1); ctx.fill();
        ctx.restore();
    });
}
// ============================================================================
// SWIMMING / DROWNING VISUAL
// ============================================================================

function applyWaterClippingPlaceholder(ctx, unit) {
    if (unit.isSwimming && unit.hp > 0) {
        let swayX = navalEnvironment.shipSwayX;
        let swayY = navalEnvironment.shipSwayY;
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.beginPath();
        ctx.ellipse(unit.x+swayX, unit.y+5+swayY, 15, 6, 0, 0, Math.PI*2);
        ctx.stroke();
        ctx.beginPath();
        ctx.rect(unit.x-50+swayX, unit.y-50+swayY, 100, 55);
        ctx.clip();
    }
}


/// ─── OPTIMIZED FUSED GEOMETRIC COLLISION ──────────────────────────────────
// Moving helpers outside for performance (no re-declaration in loop)
const _calcBezierY = (X, x0, x1, x2, y0, y1, y2) => {
    let A = x0 - 2 * x1 + x2, B = 2 * (x1 - x0), C = x0 - X, t;
    if (Math.abs(A) < 0.00001) {
        if (Math.abs(B) < 0.00001) return 0;
        t = -C / B;
    } else {
        let det = Math.max(0, B * B - 4 * A * C);
        let t1 = (-B + Math.sqrt(det)) / (2 * A);
        let t2 = (-B - Math.sqrt(det)) / (2 * A);
        t = (t1 >= -0.001 && t1 <= 1.001) ? t1 : t2;
    }
    t = Math.max(0, Math.min(1, t));
    return Math.pow(1 - t, 2) * y0 + 2 * (1 - t) * t * y1 + Math.pow(t, 2) * y2;
};

 
// SHIP PROFILE TABLE: Stern "De-bulking" Revision
const SHIP_PROFILES = {
    "Light Scout": {
        // Stern xRange moved from -0.51 to -0.46 | y0 (index 3) reduced from 0.35 to 0.28
        hull: { xRange: [-0.46, 0.46], curves: [[-0.42, -0.06, 0.34, 0.28, 0.55, 0.24]], bowSlant: 0.12 },
        deck: { xRange: [-0.40, 0.38], curves: [[-0.38, -0.02, 0.28, 0.24, 0.43, 0.18]], bowSlant: 0.10 },
        castles: { stern: [-0.42, -0.20, 0.25], bow: [0.22, 0.42, 0.16] }
    },
    "Medium Junk": {
        // STERN FIX: xRange start -0.52 -> -0.48 | hull y0 (index 3) 0.45 -> 0.38
        // This clips the "square" corners off the back of the Junk.
        hull: { xRange: [-0.48, 0.47], curves: [[-0.44, 0.0, 0.41, 0.38, 0.58, 0.36]], bowSlant: 0.06 },
        deck: { xRange: [-0.44, 0.42], curves: [[-0.40, 0.0, 0.37, 0.34, 0.50, 0.32]], bowSlant: 0.06 },
        // Castle x and y range tightened to prevent standing on air at the back
        castles: { stern: [-0.45, -0.18, 0.38], bow: [0.25, 0.45, 0.27] }
    },
    "Heavy Dragon": {
        // STERN FIX: xRange start -0.55 -> -0.50 | hull y0 (index 3) 0.48 -> 0.42
        hull: { xRange: [-0.50, 0.52], curves: [[-0.46, 0.0, 0.46, 0.42, 0.65, 0.44]], bowSlant: 0.06 },
        deck: { xRange: [-0.46, 0.47], curves: [[-0.42, 0.0, 0.44, 0.38, 0.60, 0.41]], bowSlant: 0.06 },
        castles: { stern: [-0.48, -0.12, 0.42], bow: [0.30, 0.49, 0.32] }
    }

};
window.getNavalSurfaceAt = function(worldX, worldY) {
    if (!window.inNavalBattle || !navalEnvironment.ships) return 'WATER';

    // 1. PLANK DETECTION (High Priority)
    if (window.navalEnvironment.plankAnim && window.navalEnvironment.plankAnim.phase === 'deployed') {
        for (let s of navalEnvironment.ships) {
            let _plRx = worldX - (s.x + window.navalEnvironment.shipSwayX);
            let _plRy = worldY - (s.y + window.navalEnvironment.shipSwayY);
            // Un-rotate into ship-local
            const _plCos = Math.cos(-(s.heading || 0));
            const _plSin = Math.sin(-(s.heading || 0));
            let localX = _plRx * _plCos - _plRy * _plSin;
            let localY = _plRx * _plSin + _plRy * _plCos;
            if (Math.abs(localY) < 18) { // Plank width
                if (s.side === 'player' && localX > s.width/2 && localX < s.width/2 + 120) return 'PLANK';
                if (s.side === 'enemy' && localX < -s.width/2 && localX > -s.width/2 - 120) return 'PLANK';
            }
        }
    }

    // 2. SHIP HULL DETECTION
    for (let s of navalEnvironment.ships) {
        let _rawLX = worldX - (s.x + window.navalEnvironment.shipSwayX);
        let _rawLY = worldY - (s.y + window.navalEnvironment.shipSwayY);

        // Un-rotate world point into ship-local space (ship heading + rock).
        // The hull profile math expects bow at +X with no rotation.
        const _shipRot = s.heading || 0;
        const _cosR = Math.cos(-_shipRot);
        const _sinR = Math.sin(-_shipRot);
        let localX = _rawLX * _cosR - _rawLY * _sinR;
        let localY = _rawLX * _sinR + _rawLY * _cosR;

        // Broad rejection (scaled to ship size)
        if (Math.abs(localX) > s.width * 0.7 || Math.abs(localY) > s.height * 0.7) continue;

        let X = localX / s.width;
        let Y = Math.abs(localY) / s.height;
        let profile = SHIP_PROFILES[s.type] || SHIP_PROFILES["Medium Junk"];

        // Castle Detection (The raised platforms on ends)
        let inStern = (X >= profile.castles.stern[0] && X <= profile.castles.stern[1] && Y <= profile.castles.stern[2]);
        let inBow   = (X >= profile.castles.bow[0] && X <= profile.castles.bow[1] && Y <= profile.castles.bow[2]);

const getDynamicMaxY = (cfg) => {
            // FIX: Expand the bow/stern length limits by 8% to prevent 
            // units instantly drowning when touching the extreme tips.
            let lengthPadding = 0.08; 
            if (X < (cfg.xRange[0] - lengthPadding) || X > (cfg.xRange[1] + lengthPadding)) return -1;

            // Clamp X to the standard bounds so the bezier curves don't break
            let safeX = Math.max(cfg.xRange[0], Math.min(cfg.xRange[1], X));
            let baseMaxY = 0;

            // Handle the flat/slanted bow/stern sections
            if (safeX < cfg.curves[0][0]) {
                baseMaxY = (cfg.curves[0][3] / Math.abs(cfg.curves[0][0] - cfg.xRange[0])) * (safeX - cfg.xRange[0]);
            } else if (safeX <= cfg.curves[0][2]) {
                baseMaxY = _calcBezierY(safeX, ...cfg.curves[0]);
            } else {
                // Handle the aft taper
                baseMaxY = cfg.curves[0][5] - (cfg.curves[0][5] / cfg.bowSlant) * (safeX - cfg.curves[0][2]);
            }
            
            // FIX: Add generous width padding (12% wider deck hitbox).
            // This stops units from falling off the tapered sides of light ships.
            return baseMaxY + 0.01; 
        };

        let waterBuffer = 60 / s.height; // Convert pixels to normalized space
        let hullMaxY = getDynamicMaxY(profile.hull);
        
// Final Geometry Check
        if (hullMaxY !== -1 && Y <= hullMaxY + waterBuffer) {
            // SURGERY: Treat the entire hull, including the dark edges, as safe.
            // We ignore deckMaxY entirely so the unit only drowns outside the hull.
            return 'DECK'; 
        }
        
        if (inStern || inBow) return 'DECK';
    }

    return 'WATER';
};

function _isPositionOccupiedByShip(x, y) {
    return navalEnvironment.ships.some(s => {
        const sx = s.x + (navalEnvironment.shipSwayX || 0);
        const sy = s.y + (navalEnvironment.shipSwayY || 0);
        // Rotation-aware: use max dimension for a generous circular buffer
        // (exact rotated ellipse is overkill for spawn rejection)
        const spawnBuffer = Math.max(s.width, s.height) * 0.55;
        return Math.hypot(x - sx, y - sy) < spawnBuffer;
    });
}

// ============================================================================
// ENEMY SHIP AI — DISABLED FOR NOW (enemy ships don't move)
// ============================================================================
// function _updateEnemyShipAI(ship) { ... }
// Enemy ships have rudderAngle = 0 and will drift with wind only very slightly.
// Re-enable later by uncommenting and calling from updateNavalPhysics.

window._shipRotateInput = { dx: 0, dy: 0 };

// ── KEYBOARD HELM STATE (desktop naval controls) ───────────────────────────
// Key map:
//   U   = row forward (dy < 0)
//   J   = decelerate / brake (dy > 0)
//   I   = turn clockwise      (dx > 0  in NavalRowing → rightward torque)
//   O   = turn counter-clockwise (dx < 0)
// (Legacy IJKL mapping retained as fallback below for muscle memory.)
window._helmKeys = { i: false, j: false, k: false, l: false, u: false, o: false };

window.addEventListener('keydown', function(e) {
    if (!window.inNavalBattle) return;
    const k = e.key.toLowerCase();
    switch (k) {
        case 'u': window._helmKeys.i = true;  break;  // U = forward (maps to 'i' slot in applyInput)
        case 'j': window._helmKeys.k = true;  break;  // J = brake/decel (maps to 'k' slot)
        case 'i': window._helmKeys.l = true;  break;  // I = turn CW → dx +1 (maps to 'l' slot = rightward)
        case 'o': window._helmKeys.j = true;  break;  // O = turn CCW → dx -1 (maps to 'j' slot = leftward)
    }
});
window.addEventListener('keyup', function(e) {
    const k = e.key.toLowerCase();
    switch (k) {
        case 'u': window._helmKeys.i = false; break;
        case 'j': window._helmKeys.k = false; break;
        case 'i': window._helmKeys.l = false; break;
        case 'o': window._helmKeys.j = false; break;
    }
});

// ── CANVAS CLICK → CYCLE PLAYER SHIP (PC) ─────────────────────────────────
// Clicking on a ship in the canvas transfers isPlayerControlled to it.
// Falls back to cycling if the click doesn't land close enough to any ship.
(function _attachShipClickSelect() {
    function _tryAttach() {
        var canvas = document.getElementById('battleCanvas')
                  || document.getElementById('gameCanvas')
                  || document.querySelector('canvas');
        if (!canvas) { setTimeout(_tryAttach, 500); return; }

        canvas.addEventListener('click', function(e) {
            if (!window.inNavalBattle) return;
            var env = window.navalEnvironment;
            if (!env || !Array.isArray(env.ships) || env.ships.length < 2) return;

            // Convert click to world coords using camera transform
            // Main ctx: translate(w/2,h/2) → scale(zoom) → translate(-player.x,-player.y)
            // Inverse: worldX = (cx - w/2) / zoom + player.x  (minus sway)
            var rect   = canvas.getBoundingClientRect();
            var cx     = e.clientX - rect.left;
            var cy     = e.clientY - rect.top;
            var cz     = (typeof zoom   !== 'undefined' && zoom   > 0) ? zoom   : (env.cameraScale || 1);
            var plx    = (typeof player !== 'undefined' && player) ? (player.x || 0) : (env.cameraX || 0);
            var ply    = (typeof player !== 'undefined' && player) ? (player.y || 0) : (env.cameraY || 0);
            var swayX  = env.shipSwayX    || 0;
            var swayY  = env.shipSwayY    || 0;
            var worldX = (cx - canvas.width  * 0.5) / cz + plx - swayX;
            var worldY = (cy - canvas.height * 0.5) / cz + ply - swayY;

            // Find the closest player-faction ship to the click
            var best = null, bestDist = Infinity;
            env.ships.forEach(function(s) {
                if (s.side !== 'player' && s.side !== 'ally') return;
                var d = Math.hypot(s.x - worldX, s.y - worldY);
                var hitR = Math.max(s.width || 120, s.height || 60) * 0.65;
                if (d < hitR && d < bestDist) { best = s; bestDist = d; }
            });

            if (best) {
                // Click landed on a specific ship — select it
                env.ships.forEach(function(s) { s.isPlayerControlled = false; });
                best.isPlayerControlled = true;
            } else {
                // No ship hit — cycle to next player-faction ship
                var cur  = env.ships.findIndex(function(s) { return s.isPlayerControlled; });
                if (cur < 0) cur = 0;
                for (var attempt = 1; attempt < env.ships.length; attempt++) {
                    var next = (cur + attempt) % env.ships.length;
                    if (env.ships[next].side === 'player' || env.ships[next].side === 'ally') {
                        env.ships[cur].isPlayerControlled  = false;
                        env.ships[next].isPlayerControlled = true;
                        break;
                    }
                }
            }
        });
    }
    _tryAttach();
})();