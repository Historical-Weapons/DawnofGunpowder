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
    cameraScale: 1
};

// Song Dynasty ship classes:
//   輕型哨船 Light Scout  |  中型戰船 Medium Warship  |  大型樓船 Heavy Tower Ship
const SHIP_TYPES = {
    LIGHT:  { maxMen:30,   width:750,  height:300, color:"#3d2418", deck:"#7a5c3a", mastCount:2, sailScale:0.50 },
    MEDIUM: { maxMen:80,   width:1200, height:480, color:"#2e1a0f", deck:"#6e5030", mastCount:3, sailScale:0.48 },
    HEAVY:  { maxMen:9999, width:1800, height:660, color:"#1e1008", deck:"#5e4228", mastCount:3, sailScale:0.74 }
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

function initNavalBattle(enemyNPC, playerObj, tileType, pCount, eCount) {
    window.inNavalBattle = true;
    inBattleMode = true;
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
	generateCosmetics();
	initSailCanvas();
	
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

        for (let x = 0; x < BATTLE_COLS; x++) {
            for (let y = 0; y < BATTLE_ROWS; y++) {
                let n = _fbm(x, y, seed);
                let elevation = n;

                // Topography only for Coastal maps
if (elevation > 0.85) grid[x][y] = 13;      // Rocks (was 0.80)
else if (elevation > 0.7) grid[x][y] = 12; // Reefs (was 0.70)
else if (elevation > 0.65) grid[x][y] = 14; // Algae (was 0.58)

                else if (elevation < 0.05) grid[x][y] = 15; // Dark water
                else grid[x][y] = 11; 
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

    let centerX = BATTLE_WORLD_WIDTH  / 2;
    let centerY = BATTLE_WORLD_HEIGHT / 2;

    if (navalEnvironment.mapType === "Coastal") {
        if (navalEnvironment.coastSide === 0) centerX = BATTLE_WORLD_WIDTH  * 0.65;
        if (navalEnvironment.coastSide === 1) centerX = BATTLE_WORLD_WIDTH  * 0.35;
        if (navalEnvironment.coastSide === 2) centerY = BATTLE_WORLD_HEIGHT * 0.65;
        if (navalEnvironment.coastSide === 3) centerY = BATTLE_WORLD_HEIGHT * 0.35;
    }

    let gap = 20;

    let pShip = {
        side: "player", 
        x: centerX, 
        y: centerY + (pType.height/2) + gap,
        width: pType.width, 
        height: pType.height,
        color: pType.color, 
        deck: pType.deck,
        mastCount: pType.mastCount, 
        sailScale: pType.sailScale,
        type: pType.name // <--- THE CRITICAL FIX FOR COLLISION MATH
    };
    
    let eShip = {
        side: "enemy",  
        x: centerX, 
        y: centerY - (eType.height/2) - gap,
        width: eType.width, 
        height: eType.height,
        color: eType.color, 
        deck: eType.deck,
        mastCount: eType.mastCount, 
        sailScale: eType.sailScale,
        type: eType.name // <--- THE CRITICAL FIX FOR COLLISION MATH
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

     // AFTER:
     const waveCount = IS_NATIVE ? 100 : 300;
     for (let i = 0; i < waveCount; i++) { 
        navalEnvironment.waves.push({
            x:Math.random()*BATTLE_WORLD_WIDTH, y:Math.random()*BATTLE_WORLD_HEIGHT,
            speed:0.2+Math.random()*0.4, length:30+Math.random()*50, offset:Math.random()*100
        });
    }
     const fishCount = IS_NATIVE ? 10 : 40;
     for (let i = 0; i < fishCount; i++) { 
    let x, y, tries = 0;
    do {
        x = Math.random() * BATTLE_WORLD_WIDTH;
        y = Math.random() * BATTLE_WORLD_HEIGHT;
        tries++;
    } while (tries < 100 && (!_isOpenWaterAt(x, y) || _isPositionOccupiedByShip(x, y)));

    navalEnvironment.fishes.push({
        x, y,
        angle: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random(),
        length: 15 + Math.random() * 15,
        wiggleRate: 2 + Math.random() * 3
    });
}
    for (let i = 0; i < 15; i++) {
        navalEnvironment.seagulls.push({
            x:Math.random()*BATTLE_WORLD_WIDTH, y:Math.random()*BATTLE_WORLD_HEIGHT,
            angle:Math.random()*Math.PI*2, speed:2+Math.random()*2,
            flapRate:8+Math.random()*5, scale:0.8+Math.random()*0.6
        });
    }
}

// ============================================================================
// SAIL CANVAS — second HTML canvas layer, rendered above all units
// ============================================================================

function initSailCanvas() {
    let old = document.getElementById('navalSailCanvas');
    if (old) old.remove();

    let mc = document.getElementById('battleCanvas')
          || document.getElementById('gameCanvas')
          || document.querySelector('canvas');
    if (!mc) { console.warn('[NavalEngine] No main canvas found — sail overlay disabled.'); return; }

    navalEnvironment.mainCanvas = mc;

    let sc       = document.createElement('canvas');
    sc.id        = 'navalSailCanvas';
    sc.width     = mc.width;
    sc.height    = mc.height;
    sc.style.cssText = [
        'position:absolute',
        'pointer-events:none',
        'z-index:' + (parseInt(mc.style.zIndex || '0') + 5),
        'left:'    + mc.offsetLeft + 'px',
        'top:'     + mc.offsetTop  + 'px'
    ].join(';');

    mc.parentNode.insertBefore(sc, mc.nextSibling);
    navalEnvironment.sailCanvas = sc;
    navalEnvironment.sailCtx    = sc.getContext('2d');

    _startSailLoop();
}

function cleanupNavalSailCanvas() {
    let el = document.getElementById('navalSailCanvas');
    if (el) el.remove();
    navalEnvironment.sailCanvas = null;
    navalEnvironment.sailCtx    = null;
}

// Self-contained RAF loop — does not need a call from the main engine
function _startSailLoop() {
    (function loop() {
        if (!inNavalBattle || !navalEnvironment.sailCtx) return;
        drawNavalSailOverlay();
        requestAnimationFrame(loop);
    })();
}

// Can also be called manually if preferred over the auto-loop
function drawNavalSailOverlay() {
    if (!inNavalBattle) return;
    let ctx = navalEnvironment.sailCtx;
    if (!ctx) return;

    let sc = navalEnvironment.sailCanvas;
    let mc = navalEnvironment.mainCanvas;
    if (mc && (sc.width !== mc.width || sc.height !== mc.height)) {
        sc.width = mc.width; sc.height = mc.height;
    }

    ctx.clearRect(0, 0, sc.width, sc.height);
    ctx.save();
    ctx.translate(navalEnvironment.cameraX,    navalEnvironment.cameraY);
    ctx.scale(navalEnvironment.cameraScale,    navalEnvironment.cameraScale);
    ctx.translate(navalEnvironment.shipSwayX,  navalEnvironment.shipSwayY);

    navalEnvironment.ships.forEach(s => _drawJunkSails(ctx, s));

    ctx.restore(); // End world-space transform — everything below is screen space

    // -------------------------------------------------------------------------
    // DEATH / VICTORY OVERLAYS — must draw here (on the sail canvas) so they
    // sit ABOVE the sails.  drawMasterStateOverlay / drawVictoryStateOverlay in
    // the main engine draw to the main canvas which is BELOW this sail canvas,
    // so those versions are invisible in naval battles.
    // -------------------------------------------------------------------------
    if (typeof battleEnvironment !== 'undefined' && battleEnvironment.units) {
        let pCmdr = battleEnvironment.units.find(u => u.isCommander && u.side === "player");

        // --- Death overlay ---
        if (pCmdr && pCmdr.hp <= 0) {
            ctx.save();
            ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
            ctx.fillRect(0, 0, sc.width, sc.height);

            ctx.textAlign    = "center";
            ctx.textBaseline = "middle";

            let mainFontSize = Math.min(64, sc.width * 0.1);
            ctx.fillStyle = "#ff3333";
            ctx.font      = `bold ${mainFontSize}px Georgia, serif`;
            ctx.shadowColor = "rgba(0,0,0,0.8)";
            ctx.shadowBlur  = 10;
            ctx.fillText("YOU HAVE FALLEN", sc.width / 2, sc.height / 2 - 20);

            let subFontSize = Math.min(24, sc.width * 0.04);
            ctx.fillStyle = "#ffca28";
            ctx.font      = `italic ${subFontSize}px Georgia, serif`;
            ctx.shadowBlur = 5;
            ctx.fillText("Press [P] or ↩️ to end Battle.", sc.width / 2, sc.height / 2 + 40);

            ctx.restore();
            return; // Skip victory check when already dead
        }

        // --- Victory overlay ---
        const aliveEnemies = battleEnvironment.units.filter(u => u.side !== 'player' && u.hp > 0).length;
        if (aliveEnemies < 1) {
            ctx.save();
            ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
            ctx.fillRect(0, 0, sc.width, sc.height);

            ctx.textAlign    = "center";
            ctx.textBaseline = "middle";

            let mainFontSize = Math.min(64, sc.width * 0.1);
            ctx.fillStyle = "#ffca28";
            ctx.font      = `bold ${mainFontSize}px Georgia, serif`;
            ctx.shadowColor = "rgba(0,0,0,0.8)";
            ctx.shadowBlur  = 10;
            ctx.fillText("VICTORY", sc.width / 2, sc.height / 2 - 20);

            let subFontSize = Math.min(24, sc.width * 0.04);
            ctx.fillStyle = "#ffffff";
            ctx.font      = `italic ${subFontSize}px Georgia, serif`;
            ctx.shadowBlur = 5;
            ctx.fillText("Press [P] or ↩️ to return to the Overworld.", sc.width / 2, sc.height / 2 + 40);

            ctx.restore();
        }
    }
}

// ============================================================================
// JUNK SAIL DRAWING — Song/Ming battened lug sails, top-down view
// ============================================================================

function _drawJunkSails(ctx, s) {
    let w    = s.width;
    let h    = s.height;
    let time = Date.now() / 1000;

    // Mast layout along the ship centerline (stern at -X, bow at +X)
    let masts = [];
    if (s.mastCount === 1) {
        masts = [{ x: w*0.05, sw: w*0.13, sh: h*s.sailScale, isMain:true }];
    } else if (s.mastCount === 2) {
        masts = [
            { x:-w*0.11, sw:w*0.10, sh:h*s.sailScale*0.82, isMain:false }, // mizzen
            { x: w*0.16, sw:w*0.13, sh:h*s.sailScale,      isMain:true  }  // main
        ];
    } else {
        masts = [
            { x:-w*0.22, sw:w*0.08, sh:h*s.sailScale*0.72, isMain:false }, // mizzen
            { x: w*0.04, sw:w*0.15, sh:h*s.sailScale,      isMain:true  }, // main
            { x: w*0.24, sw:w*0.10, sh:h*s.sailScale*0.84, isMain:false }  // fore
        ];
    }

    ctx.save();
    ctx.translate(s.x, s.y);

    masts.forEach((mast, idx) => {
        let mx  = mast.x;
        let sw  = mast.sw;
        let sh  = mast.sh;
        // Wind billow: leeward edge bows out based on a gentle sine
        let billow = Math.sin(time * 0.55 + idx * 1.4) * (sw * 0.05) + sw * 0.045;

        // --- Deck shadow cast by the sail ---
        ctx.save();
        ctx.globalAlpha = 0.20;
        ctx.fillStyle   = "#000";
        ctx.beginPath();
        ctx.ellipse(mx + sw*0.28 + 5, 4, sw*0.70, sh*0.36, 0.06, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();

        // --- Clip sails inside hull ellipse so they never bleed outside ---
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(0, 0, w*0.47, h*0.44, 0, 0, Math.PI*2);
        ctx.clip();

        // Sail colour: player = ochre/tan, enemy = deep rust red
        let sailBase = s.side === "player" ? "#c8a055" : "#b03428";
        let sailEdge = s.side === "player" ? "#9e7628" : "#881e10";

        // Sail shape — near-rectangular, leeward edge billowed by quadratic curve
        ctx.beginPath();
        ctx.moveTo(mx - sw*0.5,  -sh*0.5);
        ctx.lineTo(mx + sw*0.5 + billow, -sh*0.5);
        ctx.quadraticCurveTo(mx + sw*0.5 + billow*1.9, 0,
                             mx + sw*0.5 + billow,  sh*0.5);
        ctx.lineTo(mx - sw*0.5,   sh*0.5);
        ctx.closePath();

        // Horizontal gradient: luff (dark) → middle (light) → leech (dark)
        let grad = ctx.createLinearGradient(mx - sw*0.5, 0, mx + sw*0.5 + billow, 0);
        grad.addColorStop(0,    sailEdge);
        grad.addColorStop(0.35, sailBase);
        grad.addColorStop(1,    sailEdge);
        ctx.fillStyle = grad;
        ctx.fill();

        // Sail perimeter stroke
        ctx.strokeStyle = "#180e04";
        ctx.lineWidth   = 1.8;
        ctx.stroke();

        // --- BATTENS — the defining feature of a Chinese junk sail ---
        // Song-era junks used 6-9 bamboo battens per sail; more battens = more rigidity
        let battenCount = mast.isMain ? 8 : 6;
        ctx.strokeStyle = "#2e1a08";
        ctx.lineWidth   = mast.isMain ? 2.8 : 2.2;
        ctx.lineCap     = "round";
        for (let b = 0; b <= battenCount; b++) {
            let by     = -sh*0.5 + (sh / battenCount) * b;
            // Each batten follows the local billow (tapers at top and bottom of sail)
            let localB = billow * Math.sin((b / battenCount) * Math.PI);
            ctx.beginPath();
            ctx.moveTo(mx - sw*0.5,             by);
            ctx.lineTo(mx + sw*0.5 + localB,    by);
            ctx.stroke();
        }

        // Alternate panel shading — gives each cloth panel depth between battens
        ctx.globalAlpha = 0.07;
        ctx.fillStyle   = "#000";
        for (let b = 0; b < battenCount; b += 2) {
            let by0 = -sh*0.5 + (sh / battenCount) * b;
            let ph  = sh / battenCount;
            ctx.fillRect(mx - sw*0.5, by0, sw + billow, ph);
        }
        ctx.globalAlpha = 1;

        ctx.restore(); // end hull clip

        // --- MAST cross-section (viewed from directly above) ---
        let mastR = mast.isMain ? 7 : 5;
        // Drop shadow
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.beginPath(); ctx.arc(mx+3, 3, mastR+1, 0, Math.PI*2); ctx.fill();
        // Lacquered wood
        ctx.fillStyle = "#2c1508";
        ctx.beginPath(); ctx.arc(mx, 0, mastR, 0, Math.PI*2); ctx.fill();
        // Highlight
        ctx.fillStyle = "#5c3018";
        ctx.beginPath(); ctx.arc(mx-1, -1, mastR*0.5, 0, Math.PI*2); ctx.fill();

 
    });

    ctx.restore();
}

// ============================================================================
// PHYSICS UPDATE
// ============================================================================
function updateNavalPhysics() {
    if (!inNavalBattle) return;

    // ── Boarding plank animation ticker ──────────────────────────────────
    const pa = navalEnvironment.plankAnim;
    if (pa.phase === 'animating') {
        pa.timer++;
        if (pa.timer >= pa.duration) pa.phase = 'done';
    }

    let time = Date.now();
    navalEnvironment.shipSwayX = Math.sin(time / 1500) * 8;
    navalEnvironment.shipSwayY = Math.cos(time / 1200) * 4;

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
    if (f.x < 0) f.x = BATTLE_WORLD_WIDTH;
    if (f.x > BATTLE_WORLD_WIDTH) f.x = 0;
    if (f.y < 0) f.y = BATTLE_WORLD_HEIGHT;
    if (f.y > BATTLE_WORLD_HEIGHT) f.y = 0;

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
    navalEnvironment.seagulls.forEach(g => {
        g.x += Math.cos(g.angle) * g.speed;
        g.y += Math.sin(g.angle) * g.speed;
        let banking = (Math.random() > 0.99) ? 0.05 : 0.005;
        g.angle += banking;
        g.speed  = (Math.random() > 0.99) ? 2 + Math.random()*4 : Math.max(1.5, g.speed*0.995);
        if (g.x < -100) g.x = BATTLE_WORLD_WIDTH+100;  if (g.x > BATTLE_WORLD_WIDTH+100)  g.x = -100;
        if (g.y < -100) g.y = BATTLE_WORLD_HEIGHT+100; if (g.y > BATTLE_WORLD_HEIGHT+100) g.y = -100;
        g.currentFlap = (Date.now() / 1000) * g.flapRate;
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

// Add this global variable near the top of naval_battles.js
let navalBackgroundCache = null;

// Replace your drawNavalBackground with this cached version
function drawNavalBackground(ctx) {
    if (!inNavalBattle || !battleEnvironment.grid) return;

    // 1. Build the cache ONLY ONCE (or if the map changes)
    if (!navalBackgroundCache) {
        // Create an invisible canvas in memory
        navalBackgroundCache = document.createElement('canvas');
        navalBackgroundCache.width = BATTLE_COLS * BATTLE_TILE_SIZE;
        navalBackgroundCache.height = BATTLE_ROWS * BATTLE_TILE_SIZE;
        const cacheCtx = navalBackgroundCache.getContext('2d');

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
// SHIP HULL DRAW — Song Dynasty 樓船 top-down view
// Sails are rendered on the separate sail canvas overlay, NOT here.
// ============================================================================
function drawNavalShips(ctx) {
    if (!inNavalBattle) return;


    // ---> SURGERY: Draw Fishes First (Underneath Ships)
    ctx.save();
	
    ctx.fillStyle = "rgba(10,25,40,0.40)";
    navalEnvironment.fishes.forEach(f => {
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
		let time = Date.now() / 1000;
        let wavePhase = time * w.speed + w.offset;
        let wx = w.x + Math.sin(wavePhase) * 20;
        
        // Opacity fades in and out rhythmically to simulate cresting
        let waveAlpha = (Math.sin(wavePhase * 0.8) + 1) / 2 * 0.22; 

        // Only draw if wave is visible and on open water tiles
        if (waveAlpha > 0.01 && _isOpenWaterAt(wx, w.y)) {
            
            // Check to ensure the wave is far enough from ships
            let clearOfShips = true;
            for (let s of navalEnvironment.ships) {
                let sx = s.x + navalEnvironment.shipSwayX;
                let sy = s.y + navalEnvironment.shipSwayY;
                
                // Elliptical boundary check (0.55 acts as a 5% buffer outside the hull)
                let dx = (wx - sx) / (s.width * 0.55);
                let dy = (w.y - sy) / (s.height * 0.55);
                if ((dx * dx + dy * dy) <= 1.0) {
                    clearOfShips = false;
                    break;
                }
            }

            if (clearOfShips) {
                ctx.strokeStyle = `rgba(255, 255, 255, ${waveAlpha.toFixed(3)})`;
                
                // Add vertical bobbing and dynamic crest height for realism
                let bobY = w.y + Math.cos(wavePhase) * 3;
                let crest = 4 + Math.sin(wavePhase * 1.5) * 2;
                
                ctx.beginPath();
                ctx.moveTo(wx, bobY);
                ctx.quadraticCurveTo(wx + w.length/2, bobY - crest, wx + w.length, bobY);
                ctx.stroke();
            }
        }
    });


    ctx.save();
    ctx.translate(navalEnvironment.shipSwayX, navalEnvironment.shipSwayY);
	
    navalEnvironment.ships.forEach(s => {
        ctx.save();
        ctx.translate(s.x, s.y);
        let w = s.width, h = s.height;

        // ── 1. HULL WATER SHADOW ──────────────────────────────────────────
        ctx.save();
        ctx.globalAlpha = 0.26;
        ctx.fillStyle   = "#000";
        ctx.beginPath();
        ctx.ellipse(10, 8, w*0.49, h*0.41, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();

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



// ============================================================================
// MASTER FOREGROUND LAYER: SONG DYNASTY JUNK SAILS
// Draws directly to the main context to guarantee perfect camera synchronization
// ============================================================================

function drawNavalSailsMasterLayer(ctx) {
    if (!window.inNavalBattle || !window.navalEnvironment.ships) return;

    let time = Date.now() / 1000;

    ctx.save();
    // Critical: Apply the exact same sway as the ship hull so they move as one unit
    ctx.translate(window.navalEnvironment.shipSwayX, window.navalEnvironment.shipSwayY);

    window.navalEnvironment.ships.forEach(ship => {
        _renderChineseJunkSails(ctx, ship, time);
    });

    ctx.restore();
}

function _renderChineseJunkSails(ctx, s, time) {
    let w = s.width;
    let h = s.height;
    
    // Determine Ship Tier for Sail Quality
    let tier = "LIGHT";
    if (w >= 1000 && w < 1500) tier = "MEDIUM";
    if (w >= 1500) tier = "HEAVY";

    // Mast layout along the centerline (stern at -X, bow at +X)
    let masts = [];
    if (s.mastCount === 1) {
        masts = [{ x: w*0.08, sw: w*0.13, sh: h*s.sailScale*2.1, isMain: true }];}

	else if (s.mastCount === 2) {
        masts = [
            { x:-w*0.11, sw: w*0.10, sh: h*s.sailScale*1.12, isMain: false }, // Mizzen
            { x: w*0.16, sw: w*0.13, sh: h*s.sailScale*1.5,      isMain: true  }  // Main
        ];
    } else {
        masts = [
            { x:-w*0.22, sw: w*0.08, sh: h*s.sailScale*0.72, isMain: false }, // Mizzen
            { x: w*0.04, sw: w*0.15, sh: h*s.sailScale*1.6,      isMain: true  }, // Main
            { x: w*0.24, sw: w*0.10, sh: h*s.sailScale*0.84, isMain: false }  // Fore
        ];
    }

    ctx.save();
    ctx.translate(s.x, s.y);

    masts.forEach((mast, idx) => {
        let mx = mast.x;
        let sw = mast.sw;
        let sh = mast.sh;
        
        // Wind billow: leeward edge bows out based on a gentle sine
        let billow = Math.sin(time * 0.55 + idx * 1.4) * (sw * 0.05) + sw * 0.045;

        // --- 1. DECK SHADOW CAST BY THE SAIL ---
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = "#000";
        ctx.beginPath();
        // The shadow stretches opposite the billow
        ctx.ellipse(mx + sw*0.28 + 5, 8, sw*0.70, sh*0.36, 0.06, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();

        // --- CLIP AREA: Keep sails inside hull perimeter ---
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(0, 0, w*0.47, h*0.44, 0, 0, Math.PI*2);
        ctx.clip();

        // --- 2. SAIL QUALITY & MATERIALS ---
        let sailBase, sailEdge, battenColor, battenCount;

        if (tier === "LIGHT") {
            // Light Scout: Woven Bamboo Matting (Cheap, ragged)
            sailBase = "#d1ba8a"; 
            sailEdge = "#a38c5d";
            battenColor = "#785b34";
            battenCount = mast.isMain ? 6 : 4;
        } else if (tier === "MEDIUM") {
            // Medium Warship: Standard Cotton Canvas
            sailBase = s.side === "player" ? "#c8a055" : "#b03428";
            sailEdge = s.side === "player" ? "#9e7628" : "#881e10";
            battenColor = "#2e1a08";
            battenCount = mast.isMain ? 8 : 6;
        } else {
            // Heavy Tower Ship: Imperial Silk/Reinforced Canvas
            sailBase = s.side === "player" ? "#d4af37" : "#8a1515"; // Richer gold/crimson
            sailEdge = s.side === "player" ? "#a88622" : "#590b0b";
            battenColor = "#1a0f05"; // Very dark, heavy wood
            battenCount = mast.isMain ? 10 : 8; // Extra rigid
        }

        // Sail Shape — Near-rectangular lug sail
        ctx.beginPath();
        ctx.moveTo(mx - sw*0.5, -sh*0.5);
        ctx.lineTo(mx + sw*0.5 + billow, -sh*0.5);
        ctx.quadraticCurveTo(mx + sw*0.5 + billow*1.9, 0, mx + sw*0.5 + billow, sh*0.5);
        ctx.lineTo(mx - sw*0.5, sh*0.5);
        ctx.closePath();

        // Horizontal gradient simulating curve and wind
        let grad = ctx.createLinearGradient(mx - sw*0.5, 0, mx + sw*0.5 + billow, 0);
        grad.addColorStop(0, sailEdge);
        grad.addColorStop(0.35, sailBase);
        grad.addColorStop(1, sailEdge);
        ctx.fillStyle = grad;
        ctx.fill();

        // Outer stroke
        ctx.strokeStyle = tier === "HEAVY" ? "#000" : "#2e1a08";
        ctx.lineWidth = tier === "HEAVY" ? 2.5 : 1.8;
        ctx.stroke();

        // --- 3. BATTENS (The signature bamboo ribs of Junk sails) ---
        ctx.strokeStyle = battenColor;
        ctx.lineWidth = mast.isMain ? 2.8 : 2.2;
        ctx.lineCap = "round";
        
        for (let b = 0; b <= battenCount; b++) {
            let by = -sh*0.5 + (sh / battenCount) * b;
            let localB = billow * Math.sin((b / battenCount) * Math.PI);
            ctx.beginPath();
            ctx.moveTo(mx - sw*0.5, by);
            ctx.lineTo(mx + sw*0.5 + localB, by);
            ctx.stroke();
        }

        // Add depth to individual cloth panels between battens
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = "#000";
        for (let b = 0; b < battenCount; b += 2) {
            let by0 = -sh*0.5 + (sh / battenCount) * b;
            let ph = sh / battenCount;
            ctx.fillRect(mx - sw*0.5, by0, sw + billow, ph);
        }
        ctx.globalAlpha = 1.0;

        ctx.restore(); // End Hull Clip

        // --- 4. MAST HEAD & HALYARD ROPES ---
        let mastR = mast.isMain ? 7 : 5;
        
        // Mast Drop shadow
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath(); ctx.arc(mx+3, 3, mastR+1, 0, Math.PI*2); ctx.fill();
        
        // Lacquered wood top
        ctx.fillStyle = tier === "HEAVY" ? "#1a0802" : "#2c1508";
        ctx.beginPath(); ctx.arc(mx, 0, mastR, 0, Math.PI*2); ctx.fill();
        
        // Wood Highlight
        ctx.fillStyle = "#5c3018";
        ctx.beginPath(); ctx.arc(mx-1, -1, mastR*0.5, 0, Math.PI*2); ctx.fill();

 
    });

    ctx.restore();
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
            let localX = worldX - (s.x + window.navalEnvironment.shipSwayX);
            let localY = worldY - (s.y + window.navalEnvironment.shipSwayY);
            if (Math.abs(localY) < 18) { // Plank width
                if (s.side === 'player' && localX > s.width/2 && localX < s.width/2 + 120) return 'PLANK';
                if (s.side === 'enemy' && localX < -s.width/2 && localX > -s.width/2 - 120) return 'PLANK';
            }
        }
    }

    // 2. SHIP HULL DETECTION
    for (let s of navalEnvironment.ships) {
        let localX = worldX - (s.x + window.navalEnvironment.shipSwayX);
        let localY = worldY - (s.y + window.navalEnvironment.shipSwayY);

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
        // Using a slightly smaller buffer for spawning than the avoidance radius
        const spawnBuffer = Math.max(s.width, s.height) * 0.52;
        return Math.hypot(x - sx, y - sy) < spawnBuffer;
    });
}