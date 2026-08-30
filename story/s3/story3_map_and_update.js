// =============================================================================
// SESSION CHANGELOG (for fusion with the other diverging Story 3 session)
// =============================================================================
//   - Wall now spans the full map width (nxStart/nxEnd changed from 0.02/0.98
//     to 0.0/1.0 — it used to stop short of both edges).
//   - Removed the two always-open "patrol gap" breaks in the wall (_S3_PATROL_
//     GAPS emptied) — the only opening left is the one real, closable gate.
//   - Both are pure map-geometry fixes, not narrative — safe to keep
//     regardless of which Story 3 chapter-10+ continuation wins.
// =============================================================================

// =============================================================================
// STORY 3 — LIFE ON THE WALL  (story3_map_and_update.js)  [MING FRONTIER]
// =============================================================================
//
// LIAODONG FRONTIER, 1578 CE — Ming northeastern wall garrison map, in the
// approach toward Shanhai Pass. Enemy: fragmented Jianzhou/Haixi Jurchen
// raiding bands (this is a generation before Nurhaci unifies the Jurchens).
//
// CHANGES vs prior build
// ──────────────────────
//  • Setting: northeastern Ming wall (Kaiyuan / Liaoyang sector), the Ming
//    Liaodong frontier under Li Chengliang's regional command.
//  • Wall is a SIMPLIFIED bird's-eye band (NOT isometric / NOT pagoda 3D).
//    Drawing style mimics the flat top-down brick wall from fortification_system.js
//    (zone-1 outer stone + zone-2/3 inner walkway + crenellations on the
//    outer edge), viewed from directly above.
//  • Wall spans the ENTIRE x-axis (nxStart=0.02 → nxEnd=0.98) — never breaks
//    at the edges, no gap to the map border.
//  • Wall has a SLIGHT MEANDERING CURVE along its length (sinusoidal Y
//    offset), mimicking the Great Wall's organic line in aerial photos.
//  • ONE real, closable GATE (see _S3_GATE) directly north of Fushun Suo
//    Fort, plus two narrow ~24 px always-open patrol gaps further along the
//    wall, used by the story's scout triggers.
//  • Towers are bird's-eye squares with crenellated edges and a small
//    central pavilion (no roof extrusion, no isometric eaves) — same flat
//    visual language as the wall itself.
//  • Roads are realistic dirt tracks: warm packed-earth tone with subtle
//    rut shadow and gentle wobble, NOT bright bezier strokes with red
//    highlight bands.
//  • Settlements (military posts AND civilian villages) have NO green
//    visibility circle / no auto-radius marker. Their `radius` is 0 and no
//    farm-field chequer is drawn around military posts (only sparse farm
//    patches around civilian villages, well clear of the wall).
//
// =============================================================================

// ── Internal buffers ─────────────────────────────────────────────────────────
let worldMap_story3 = [];
let cities_story3   = [];

// ── Padding ──────────────────────────────────────────────────────────────────
const PADDING_X_story3 = WORLD_WIDTH  * 0.02;
const PADDING_Y_story3 = WORLD_HEIGHT * 0.02;

// =============================================================================
// WALL CONSTANTS
// =============================================================================
// The wall band is centred at ny ≈ 0.40 and is ~66 px thick (lean, like a
// real wall band viewed from above). Y coordinates are computed dynamically
// per X column so the wall meanders gently across the map.
const _S3_WALL_THICKNESS_PX = 64;
const _S3_WALL_BASE_NY      = 0.40;     // base centre line of the wall

// Wall MUST span the entire x-axis — flush with the left and right map
// borders. No gap to the map edge on either side.
const _S3_WALL_NX_START     = 0.0;
const _S3_WALL_NX_END       = 1.0;

// Meander amplitude / frequency for the Great Wall–style curve.
// Amplitude is in PIXELS; frequency in cycles across the full width.
const _S3_WALL_CURVE_AMP_PX = 42;
const _S3_WALL_CURVE_FREQ_1 = 1.8;      // primary slow undulation
const _S3_WALL_CURVE_FREQ_2 = 3.7;      // secondary fast wobble (lower weight)
const _S3_WALL_CURVE_PHASE  = 0.6;

// Returns the wall centre Y (in PIXELS) for a given x pixel column.
// Combination of two sine waves → looks organic / Great-Wall-ish, not robotic.
function _s3WallCenterYAt(px) {
    const t = px / WORLD_WIDTH;       // 0..1 across full map
    const w1 = Math.sin(t * Math.PI * 2 * _S3_WALL_CURVE_FREQ_1 + _S3_WALL_CURVE_PHASE);
    const w2 = Math.sin(t * Math.PI * 2 * _S3_WALL_CURVE_FREQ_2 + 1.7);
    const yOff = _S3_WALL_CURVE_AMP_PX * (w1 * 0.78 + w2 * 0.22);
    return _S3_WALL_BASE_NY * WORLD_HEIGHT + yOff;
}

// Convenience: top and bottom of wall band at a given x pixel.
function _s3WallTopYAt(px)    { return _s3WallCenterYAt(px) - _S3_WALL_THICKNESS_PX * 0.5; }
function _s3WallBottomYAt(px) { return _s3WallCenterYAt(px) + _S3_WALL_THICKNESS_PX * 0.5; }

// =============================================================================
// PATROL GAPS  (NOT GATES — narrow walkable strips between wall segments)
// =============================================================================
// REMOVED — the wall must be one continuous band with only the single real,
// closable Gate (see _S3_GATE below) as an opening. Kept as an empty array
// (rather than deleting every reference) so _s3InPatrolGap / _s3InOpening /
// the tower generator's gap-avoidance check all keep working with zero gaps
// instead of needing to be re-plumbed.
const _S3_PATROL_GAPS = [];

function _s3InPatrolGap(px) {
    for (let i = 0; i < _S3_PATROL_GAPS.length; i++) {
        if (Math.abs(px - _S3_PATROL_GAPS[i].x) <= _S3_PATROL_GAPS[i].halfW) return true;
    }
    return false;
}

// =============================================================================
// THE GATE — the wall's one real, closable crossing, directly north of
// Fushun Suo (same spot the old central patrol gap used to sit).
// ─────────────────────────────────────────────────────────────────────────────
// CLOSED by default. It only opens when a scenario trigger grants passage
// (out OR back in — guards work the same winch either direction) via
// window.s3SetGateOpen(true), and it swings shut again on its own the moment
// the player is clear of the wall band on whichever side they ended up on.
// See window.s3SetGateOpen / window.s3RequestPassage near the bottom of this
// file, and _s3DrawGate() for the per-frame door art.
// =============================================================================
const _S3_GATE = {
    x:     1680,   // world px — directly north of Fushun Suo
    halfW:   32,   // passage half-width — doubled from the old 16px footprint
    open:  false   // closed at boot; a future "grant passage" trigger flips this
};

// True if px falls inside the gate's footprint. Used everywhere the wall
// texture / tower placement needs to leave this stretch alone, regardless of
// whether the gate itself is currently open or shut.
function _s3InGateZone(px) {
    return Math.abs(px - _S3_GATE.x) <= _S3_GATE.halfW;
}

// Combined "is this an opening in the wall" test — patrol gaps OR the gate.
function _s3InOpening(px) {
    return _s3InPatrolGap(px) || _s3InGateZone(px);
}

// Pixel-test: is (px,py) inside the gate's own footprint band (used at map
// generation to tag those tiles isGate so runtime open/close can find them).
function _s3OnGateBand(px, py) {
    if (!_s3InGateZone(px)) return false;
    const cy = _s3WallCenterYAt(px);
    return Math.abs(py - cy) <= _S3_WALL_THICKNESS_PX * 0.5;
}

// =============================================================================
// TOWER PLACEMENT (along the wall, bird's-eye squares)
// =============================================================================
const _S3_TOWER_SPACING_PX = 360;       // ~one tower every ~360 px → ~10 across map
const _S3_TOWER_JITTER_PX  = 50;
const _S3_TOWER_HALF       = 22;        // half-side of the tower square (~44 px wide)

// Watchtowers are DISABLED for now — their square, red-bordered silhouette
// read as "another gate" at a glance, which was exactly the confusion we're
// fixing. The generator is kept below as _s3GenerateWallTowers() (just never
// called) so a visually distinct tower design can be dropped back in later
// without re-plumbing the wall/collision code around it. _s3OnTower /
// _s3DrawTowers are unchanged and simply no-op on the empty array.
const _S3_TOWERS = [];

function _s3GenerateWallTowers() {
    const towers = [];
    // Deterministic pseudo-random for jitter / variant
    let seed = 1337;
    const rnd = function () {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0x100000000;
    };

    const xStart = _S3_WALL_NX_START * WORLD_WIDTH + 80;
    const xEnd   = _S3_WALL_NX_END   * WORLD_WIDTH - 80;

    for (let x = xStart; x <= xEnd; x += _S3_TOWER_SPACING_PX) {
        const jitter = (rnd() - 0.5) * 2 * _S3_TOWER_JITTER_PX;
        let cx = x + jitter;

        // Skip towers that would sit inside a patrol gap
        if (_s3InPatrolGap(cx)) continue;

        // Keep clear of the gate itself — a proper gatehouse needs room and
        // shouldn't be crowded by a watchtower right on top of it
        if (Math.abs(cx - _S3_GATE.x) < _S3_TOWER_HALF + _S3_GATE.halfW + 30) continue;

        // Skip towers that would overlap an existing tower (after jitter)
        let collide = false;
        for (let k = 0; k < towers.length; k++) {
            if (Math.abs(towers[k].cx - cx) < _S3_TOWER_HALF * 2 + 12) { collide = true; break; }
        }
        if (collide) continue;

        const cy = _s3WallCenterYAt(cx);
        const variant = (rnd() < 0.85) ? 0 : 1;   // 0 = intact, 1 = weathered

        towers.push({ cx, cy, variant, seed: Math.floor(rnd() * 1e6) });
    }
    return towers;
}

// Pixel-test: is (px,py) inside any tower's bounding square?
function _s3OnTower(px, py) {
    for (let i = 0; i < _S3_TOWERS.length; i++) {
        const t = _S3_TOWERS[i];
        if (Math.abs(px - t.cx) <= _S3_TOWER_HALF + 2 &&
            Math.abs(py - t.cy) <= _S3_TOWER_HALF + 2) return true;
    }
    return false;
}

// Pixel-test: is (px,py) inside the wall band (curve-following) and NOT inside
// a patrol gap?
function _s3OnWallBand(px, py) {
    if (px < _S3_WALL_NX_START * WORLD_WIDTH) return false;
    if (px > _S3_WALL_NX_END   * WORLD_WIDTH) return false;
    if (_s3InOpening(px))                      return false;
    const cy = _s3WallCenterYAt(px);
    return Math.abs(py - cy) <= _S3_WALL_THICKNESS_PX * 0.5;
}

// =============================================================================
// SETTLEMENT LIST
// ─────────────────────────────────────────────────────────────────────────────
// Ming Liaodong frontier. Fushun Suo is the player's home base.
// Kaiyuan and Liaoyang are the major garrisons further south — Liaoyang is
// the seat of the Liaodong Regional Military Commission.
// Civilian villages are sparse and well clear of the wall.
// All settlements have radius:0 (NO green circle) and military posts get
// NO farm-field chequer.
// =============================================================================
const FIXED_SETTLEMENTS_story3 = [
    // ── PLAYER HOME (wall-adjacent fort) ─────────────────────────────────────
    // Y values below were moved north (closer to the wall) from their old
    // 210-570px gaps to a consistent ~40px south of the wall's actual south
    // face at each post's x (computed from _s3WallCenterYAt + half the wall
    // thickness + a 40px buffer so sprites/collision stay clear of the wall
    // band). Connecting dirt roads in _S3_ROADS reshift automatically since
    // _s3DrawRoads looks up each settlement's x/y live every draw call.
    { name: "Fushun Suo",           x: 1680, y: 1237, pop:  170, isVillage: false, isMilitary: true, faction: "Ming Dynasty", isPlayerHome: true },

    // ── WALL-LINE MILITARY POSTS (just south of the wall band) ──────────────
    { name: "Powder Magazine",      x: 1160, y: 1258, pop:   60, isVillage: false, isMilitary: true, faction: "Ming Dynasty" },
    { name: "Arrow & Bolt Store",   x:  780, y: 1282, pop:   50, isVillage: false, isMilitary: true, faction: "Ming Dynasty" },
    { name: "Barracks West",        x:  440, y: 1295, pop:  140, isVillage: false, isMilitary: true, faction: "Ming Dynasty" },
    { name: "Smithy & Wagonyard",   x: 2500, y: 1300, pop:   85, isVillage: false, isMilitary: true, faction: "Ming Dynasty" },
    { name: "Signal Tower Post",    x: 3140, y: 1278, pop:   55, isVillage: false, isMilitary: true, faction: "Ming Dynasty" },
    { name: "Barracks East",        x: 3540, y: 1239, pop:  130, isVillage: false, isMilitary: true, faction: "Ming Dynasty" },
    { name: "Fushun Pass Tower",    x: 1920, y: 1266, pop:   90, isVillage: false, isMilitary: true, faction: "Ming Dynasty" },
    { name: "Grain Tax Post",       x: 1520, y: 1760, pop:   70, isVillage: false, isMilitary: true, faction: "Ming Dynasty" },

    // ── MAIN MING GARRISONS (further south, command centres) ────────────────
    { name: "Kaiyuan Garrison",     x: 1080, y: 1880, pop:14000, isVillage: false, faction: "Ming Dynasty" },
    { name: "Liaoyang",             x: 2600, y: 2020, pop:12500, isVillage: false, faction: "Ming Dynasty" },

    // ── CIVILIAN VILLAGES (sparse, well clear of the wall) ──────────────────
    { name: "Wei Village",          x:  600, y: 2740, pop:  580, isVillage: true,  faction: "Ming Dynasty" },
    { name: "Ding Hamlet",          x: 3300, y: 2700, pop:  420, isVillage: true,  faction: "Ming Dynasty" }
];

// =============================================================================
// ROAD NETWORK — realistic dirt tracks, gentle wobble (not bright bezier paint)
// Each entry: [from, to, curveSeed]
// =============================================================================
const _S3_ROADS = [
    // Wall-line lateral road (along the back of the wall)
    ["Barracks West",       "Arrow & Bolt Store",  2001],
    ["Arrow & Bolt Store",  "Powder Magazine",     2002],
    ["Powder Magazine",     "Fushun Suo",          2003],
    ["Fushun Suo",          "Fushun Pass Tower",   2004],
    ["Fushun Pass Tower",   "Smithy & Wagonyard",  2005],
    ["Smithy & Wagonyard",  "Signal Tower Post",   2006],
    ["Signal Tower Post",   "Barracks East",       2007],

    // North-south supply roads down to the main garrisons
    ["Fushun Suo",          "Grain Tax Post",      2010],
    ["Grain Tax Post",      "Kaiyuan Garrison",    2011],
    ["Grain Tax Post",      "Liaoyang",            2012],
    ["Powder Magazine",     "Kaiyuan Garrison",    2013],
    ["Smithy & Wagonyard",  "Liaoyang",            2014],

    // Connector between the two main garrisons
    ["Kaiyuan Garrison",    "Liaoyang",            2020],

    // Down to civilian villages
    ["Kaiyuan Garrison",    "Wei Village",         2030],
    ["Liaoyang",            "Ding Hamlet",         2031]
];

// =============================================================================
// NOISE / RNG HELPERS
// =============================================================================
function _s3Fbm(x, y) {
    if (typeof fbm === 'function') return fbm(x, y);
    let v = 0, a = 0.5, f = 1.0;
    for (let i = 0; i < 4; i++) {
        v += a * (Math.sin(x * f * 12.9898 + y * f * 78.233) * 0.5 + 0.5);
        f *= 2.05; a *= 0.5;
    }
    return v - Math.floor(v);
}

function _s3WarpedFbm(nx, ny, warpAmp) {
    const amp = warpAmp || 0.08;
    const wx = _s3Fbm(nx + 1.7, ny + 9.2) * amp;
    const wy = _s3Fbm(nx + 8.3, ny + 2.8) * amp;
    return _s3Fbm(nx + wx, ny + wy);
}

function _s3LCG(seed0) {
    let s = seed0 >>> 0;
    return function () {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0x100000000;
    };
}

function _s3Hash(a, b) {
    let h = (a * 374761393 + b * 1103515245) >>> 0;
    h = (h ^ (h >>> 16)) * 0x45d9f3b >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 0xFFFFFFFF;
}

function _s3ParseHex(hex) {
    const v = parseInt(hex.slice(1), 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

// Distance of pixel coord from wall centre-line at that x (for terrain
// suppression — no forest right up against the wall).
function _s3WallDistPx(px, py) {
    return Math.abs(py - _s3WallCenterYAt(px));
}

// =============================================================================
// TERRAIN BIOMES
// ─────────────────────────────────────────────────────────────────────────────
// North of the wall:  Jianzhou highland forest — forested hills, rocky spurs,
//                     the Jurchen homeland. NOT steppe — Liaodong's frontier
//                     is wooded and hilly, unlike the arid Mongol plateau.
// South of the wall:  Ming inner plains — open farmland, scattered trees,
//                     gradually greener moving south (towards Liaoyang / Beijing).
// =============================================================================
function _s3GroundTile(px, py) {
    const nx = px / WORLD_WIDTH;
    const ny = py / WORLD_HEIGHT;
    const wallCy = _s3WallCenterYAt(px);

    const northOfWall = py < wallCy - _S3_WALL_THICKNESS_PX * 0.5;
    const southOfWall = py > wallCy + _S3_WALL_THICKNESS_PX * 0.5;

    const nearWall = _s3WallDistPx(px, py) < 220;

    const mBase = _s3WarpedFbm(nx * 4.5 + 13.0, ny * 4.5 + 7.0, 0.07);
    const eBase = _s3WarpedFbm(nx * 6.0 + 91.0, ny * 6.0 + 31.0, 0.05);
    const fine  = _s3Fbm(nx * 18 + 0.3, ny * 18 + 0.9);

    let name, color, speed, m, e;

    if (northOfWall) {
        // ── JIANZHOU HIGHLAND FOREST (Jurchen approach zone) ─────────────────
        // Wetter and higher-elevation than the old steppe biome — forest and
        // rocky spurs dominate, with clearings rather than dust plains.
        const distNorm = (wallCy - py) / Math.max(1, wallCy);
        m = Math.min(0.90, 0.48 + distNorm * 0.12 + (mBase - 0.5) * 0.14);
        e = 0.42 + distNorm * 0.08 + (eBase - 0.5) * 0.14;

        if (fine > 0.82 && eBase > 0.55) {
            name = "Rocky Highland"; color = "#5a5644"; speed = 0.55;
        } else if (mBase > 0.68 && eBase > 0.45) {
            name = "Highland Forest"; color = "#33422a"; speed = 0.45;
        } else if (mBase > 0.50) {
            name = "Forest Scrub";    color = "#4a5636"; speed = 0.70;
        } else if (mBase < 0.30) {
            name = "Highland Clearing"; color = "#7a7a52"; speed = 0.88;
        } else {
            name = "Forest Scrub";    color = "#546038"; speed = 0.72;
        }

    } else if (southOfWall) {
        // ── SOUTHERN MING PLAINS (greener moving south) ──────────────────────
        const distSouth = (py - wallCy) / Math.max(1, WORLD_HEIGHT - wallCy);
        m = Math.min(0.92, 0.40 + distSouth * 0.22 + (mBase - 0.5) * 0.10);
        e = 0.28 + distSouth * 0.10 + (eBase - 0.5) * 0.10;

        if (!nearWall && e > 0.52 && m > 0.76) {
            name = "Light Woods";  color = "#445430"; speed = 0.50;
        } else if (!nearWall && e > 0.48 && m > 0.82) {
            name = "Dense Woods";  color = "#2e3e22"; speed = 0.40;
        } else if (m > 0.70) {
            name = "Farmland";     color = "#646e44"; speed = 0.90;
        } else if (mBase > 0.55) {
            name = "Open Plain";   color = "#82835a"; speed = 0.92;
        } else if (fine < 0.20) {
            name = "Bare Earth";   color = "#8e7c5e"; speed = 0.95;
        } else {
            name = "Open Plain";   color = "#9a9460"; speed = 0.88;
        }

    } else {
        // Inside the wall band — caller should override with wall tile.
        name = "Open Plain"; color = "#8c8462"; speed = 0.88;
        m = 0.5; e = 0.4;
    }

    return { name, color, speed, impassable: false, e: e || 0.4, m: m || 0.5 };
}

// =============================================================================
// MAP GENERATION
// =============================================================================
async function generateMap_story3() {
    console.log("[Story3] Generating Ming Liaodong frontier — 1578 CE…");

    bgCtx.fillStyle = "#a0976a";
    bgCtx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    await setLoading(10, "Surveying the frontier…");

    worldMap_story3 = [];

    // ── PHASE 1 — Per-tile classification ────────────────────────────────────
    for (let i = 0; i < COLS; i++) {
        worldMap_story3[i] = [];
        const px = (i + 0.5) * TILE_SIZE;

        if (i % 25 === 0) {
            await setLoading(10 + Math.floor((i / COLS) * 38), "Charting the frontier…");
        }

        for (let j = 0; j < ROWS; j++) {
            const py = (j + 0.5) * TILE_SIZE;
            let tile;

            if (_s3OnTower(px, py)) {
                tile = {
                    name: "Wall Tower", color: "#3e342a", speed: 0.40,
                    impassable: true, e: 0.80, m: 0.20, isWall: true, isTower: true
                };
            } else if (_s3OnGateBand(px, py)) {
                // Starts CLOSED (impassable) — _s3SetGateTiles() flips this
                // live whenever window.s3SetGateOpen() is called.
                tile = {
                    name: "Frontier Gate", color: "#6b5638", speed: 0.55,
                    impassable: !_S3_GATE.open, e: 0.55, m: 0.30, isGate: true
                };
            } else if (_s3OnWallBand(px, py)) {
                tile = {
                    name: "Wall", color: "#7a5840", speed: 0.50,
                    impassable: true, e: 0.75, m: 0.20, isWall: true
                };
            } else {
                tile = _s3GroundTile(px, py);
            }

            worldMap_story3[i][j] = tile;
        }
    }

    await setLoading(50, "Painting terrain…");

    // ── PHASE 2 — Flat colour fill + per-tile micro-variation ────────────────
    for (let i = 0; i < COLS; i++) {
        const px = i * TILE_SIZE;
        for (let j = 0; j < ROWS; j++) {
            const py = j * TILE_SIZE;
            const tile = worldMap_story3[i][j];

            if (tile.isWall || tile.isTower || tile.isGate) {
                // Walls/towers/gate get drawn properly in their own decorator
                // pass (the gate's is dynamic, per-frame — see _s3DrawGate).
                // Just fill a base brown here so the underlying world is solid.
                bgCtx.fillStyle = tile.color;
                bgCtx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                continue;
            }

            const c  = _s3ParseHex(tile.color);
            const dr = Math.round((_s3Hash(i * 7 + 3,  j * 11 + 5) - 0.5) * 24);
            const dg = Math.round((_s3Hash(i * 13 + 7, j *  7 + 2) - 0.5) * 22);
            const db = Math.round((_s3Hash(i * 11 + 9, j * 13 + 8) - 0.5) * 14);
            const r  = Math.max(0, Math.min(255, c.r + dr));
            const g  = Math.max(0, Math.min(255, c.g + dg));
            const b  = Math.max(0, Math.min(255, c.b + db));

            bgCtx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
            bgCtx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }
    }

    await setLoading(58, "Scattering rocks and scrub…");
    _s3DrawRocksAndDebris(bgCtx);

    await setLoading(66, "Laying farm fields around the villages…");
    _s3DrawFarmFields(bgCtx);

    await setLoading(73, "Tracing the dirt roads…");
    _s3DrawRoads(bgCtx);

    await setLoading(82, "Raising the wall…");
    _s3DrawWall(bgCtx);

    await setLoading(90, "Building watchtowers…");
    _s3DrawTowers(bgCtx);

    await setLoading(96, "Ageing the parchment…");
    const vGrad = bgCtx.createRadialGradient(
        WORLD_WIDTH * 0.50, WORLD_HEIGHT * 0.50, WORLD_WIDTH * 0.15,
        WORLD_WIDTH * 0.50, WORLD_HEIGHT * 0.50, WORLD_WIDTH * 0.88
    );
    vGrad.addColorStop(0.00, "rgba(0,0,0,0.00)");
    vGrad.addColorStop(0.65, "rgba(28,18,8,0.07)");
    vGrad.addColorStop(1.00, "rgba(0,0,0,0.28)");
    bgCtx.fillStyle = vGrad;
    bgCtx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    console.log("[Story3] ✅ Map rendered.");
}

// =============================================================================
// ROCKS & DEBRIS  (scrubland realism)
// =============================================================================
function _s3DrawRocksAndDebris(ctx) {
    ctx.save();
    const rng = _s3LCG(8888);

    // North of the wall — scrub rocks scattered across the highland forest
    for (let k = 0; k < 480; k++) {
        const x  = rng() * WORLD_WIDTH;
        const y  = rng() * (_S3_WALL_BASE_NY * WORLD_HEIGHT - 60);
        // Skip if it would land in the wall band's meander
        if (y > _s3WallCenterYAt(x) - 70) continue;
        const sz = 1 + Math.floor(rng() * 3);
        ctx.fillStyle = (rng() < 0.5)
            ? "rgba(90,82,60,0.70)"
            : "rgba(130,118,90,0.55)";
        ctx.fillRect(x, y, sz, sz);
    }

    // South of the wall — occasional dark soil patches
    for (let k = 0; k < 300; k++) {
        const x  = rng() * WORLD_WIDTH;
        const yMin = _s3WallCenterYAt(x) + 70;
        const y  = yMin + rng() * (WORLD_HEIGHT - yMin - 4);
        const w  = 4 + Math.floor(rng() * 8);
        const h  = 3 + Math.floor(rng() * 5);
        ctx.fillStyle = "rgba(60,50,32,0.22)";
        ctx.fillRect(x, y, w, h);
    }

    ctx.restore();
}

// =============================================================================
// FARM FIELDS — civilian villages only, never around military posts
// (this is what kept the green-circle look off the military checkpoints)
// =============================================================================
function _s3DrawFarmFields(ctx) {
    ctx.save();
    const fieldColors = ["#7a7c4c", "#6c6f44", "#82854e", "#5c633a"];

    FIXED_SETTLEMENTS_story3.forEach(function (s) {
        if (s.isMilitary) return;
        if (!s.isVillage) return;   // also skip garrison cities — they get streets, not fields

        const radius = 90;
        const cx = s.x, cy = s.y;
        const csA = Math.floor(cx / TILE_SIZE);
        const csB = Math.floor(cy / TILE_SIZE);

        for (let dx = -radius; dx <= radius; dx += TILE_SIZE) {
            for (let dy = -radius; dy <= radius; dy += TILE_SIZE) {
                const x = cx + dx, y = cy + dy;
                if (x < TILE_SIZE || y < TILE_SIZE) continue;
                if (x > WORLD_WIDTH - TILE_SIZE || y > WORLD_HEIGHT - TILE_SIZE) continue;

                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > radius) continue;
                if (dist < 30)     continue;

                const gx = Math.floor(x / TILE_SIZE);
                const gy = Math.floor(y / TILE_SIZE);
                const t  = worldMap_story3[gx] && worldMap_story3[gx][gy];
                if (!t) continue;
                if (t.isWall || t.isTower) continue;
                if (t.name === "Light Woods" || t.name === "Dense Woods") continue;

                const chequer = ((gx + csA) + (gy + csB)) & 3;
                ctx.fillStyle = fieldColors[chequer];
                ctx.fillRect(gx * TILE_SIZE, gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = "rgba(255,250,220,0.05)";
                ctx.fillRect(gx * TILE_SIZE, gy * TILE_SIZE, TILE_SIZE, 1);
            }
        }
    });

    ctx.restore();
}

// =============================================================================
// REALISTIC DIRT ROADS
// ─────────────────────────────────────────────────────────────────────────────
// No bright bezier paint. Just packed earth colour, soft cart-rut shadow,
// gentle wobble along the path. Roads are drawn before the wall so the wall
// covers them where they cross.
// =============================================================================
function _s3DrawDirtRoad(ctx, ax, ay, bx, by, seed) {
    const rng = _s3LCG(seed);
    const dx  = bx - ax, dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const perpx = -dy / len, perpy = dx / len;

    // 2–4 mid control points for a slow wobble (real cart-tracks are not straight,
    // but they don't loop either — keep amplitude conservative).
    const numBends = Math.min(4, 2 + Math.floor(len / 420));
    const pts = [{ x: ax, y: ay }];
    for (let i = 0; i < numBends; i++) {
        const t  = (i + 1 + (rng() - 0.5) * 0.30) / (numBends + 1);
        const lx = ax + dx * t;
        const ly = ay + dy * t;
        const off = (rng() - 0.5) * Math.min(70, len * 0.10);
        pts.push({ x: lx + perpx * off, y: ly + perpy * off });
    }
    pts.push({ x: bx, y: by });

    // Build a smooth quadratic-bezier polyline path
    function _strokePath(style, width) {
        ctx.strokeStyle = style;
        ctx.lineWidth   = width;
        ctx.lineCap     = "round";
        ctx.lineJoin    = "round";
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i < pts.length - 2; i++) {
            const cpx = pts[i + 1].x;
            const cpy = pts[i + 1].y;
            const ex  = (pts[i + 1].x + pts[i + 2].x) * 0.5;
            const ey  = (pts[i + 1].y + pts[i + 2].y) * 0.5;
            ctx.quadraticCurveTo(cpx, cpy, ex, ey);
        }
        const last = pts[pts.length - 1];
        const prev = pts[pts.length - 2];
        ctx.quadraticCurveTo(prev.x, prev.y, last.x, last.y);
        ctx.stroke();
    }

    // Realistic dirt road = soft dark earth band + lighter packed centre + faint cart-rut highlights
    _strokePath("rgba(38,26,16,0.40)", 9);   // outer soft shadow (boot-edge dust)
    _strokePath("#7a604a",             7);   // outer packed earth
    _strokePath("#90765a",             5);   // inner packed centre
    _strokePath("rgba(54,38,24,0.35)", 1);   // single cart-rut line (centre)
}

function _s3DrawRoads(ctx) {
    ctx.save();

    function _coord(name) {
        const s = FIXED_SETTLEMENTS_story3.find(c => c.name === name);
        return s ? { x: s.x, y: s.y } : null;
    }

    _S3_ROADS.forEach(function (edge) {
        const a = _coord(edge[0]), b = _coord(edge[1]);
        if (!a || !b) return;
        _s3DrawDirtRoad(ctx, a.x, a.y, b.x, b.y, edge[2] || 9999);
    });

    ctx.restore();
}

// =============================================================================
// WALL — SIMPLIFIED BIRD'S-EYE BRICK BAND
// ─────────────────────────────────────────────────────────────────────────────
// Visual language mirrors the flat top-down look of fortification_system.js:
//
//   • Outer stone band along the NORTH (outer, forest-facing) face  — dark stone, slight shadow
//   • Main brick body filling the wall thickness      — warm brick with brick courses
//   • Inner walkway band along the SOUTH face         — slightly lighter "wood" strip
//   • Crenellations stick OUT from the north face     — small dark merlons
//
// No 3D extrusion. No isometric eaves. Just flat colour bands viewed from
// directly above. The wall follows the meander defined by _s3WallCenterYAt.
// =============================================================================
function _s3DrawWall(ctx) {
    ctx.save();

    const xStart = _S3_WALL_NX_START * WORLD_WIDTH;
    const xEnd   = _S3_WALL_NX_END   * WORLD_WIDTH;
    const halfT  = _S3_WALL_THICKNESS_PX * 0.5;

    // Layer thicknesses (within the wall band, north→south):
    //   merlon row              ~6 px sticking OUT past the north face
    //   outer stone band        ~10 px from north edge inward
    //   main brick body         ~38 px
    //   inner walkway band      ~12 px
    //   south shadow edge       2 px

    // Step in 1 px columns so the curve looks smooth.
    // We make multiple passes: (1) outer stone, (2) brick body, (3) inner walkway,
    // (4) brick courses, (5) crenellations, (6) shadow edges.
    const rng = _s3LCG(5151);

    // ── Pass 1: OUTER STONE BAND (north face) ────────────────────────────────
    ctx.fillStyle = "#5e4632";
    for (let x = xStart; x < xEnd; x++) {
        if (_s3InOpening(x)) continue;
        const cy = _s3WallCenterYAt(x);
        const yTop = cy - halfT;
        ctx.fillRect(x, yTop, 1, 10);
    }

    // ── Pass 2: MAIN BRICK BODY ──────────────────────────────────────────────
    ctx.fillStyle = "#8a6648";
    for (let x = xStart; x < xEnd; x++) {
        if (_s3InOpening(x)) continue;
        const cy = _s3WallCenterYAt(x);
        const yTop = cy - halfT;
        ctx.fillRect(x, yTop + 10, 1, 40);
    }

    // ── Pass 3: INNER WALKWAY BAND (south side, slightly lighter) ────────────
    ctx.fillStyle = "#a08266";
    for (let x = xStart; x < xEnd; x++) {
        if (_s3InOpening(x)) continue;
        const cy = _s3WallCenterYAt(x);
        const yTop = cy - halfT;
        ctx.fillRect(x, yTop + 50, 1, 12);
    }
    // South-edge shadow under the walkway
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    for (let x = xStart; x < xEnd; x++) {
        if (_s3InOpening(x)) continue;
        const cy = _s3WallCenterYAt(x);
        ctx.fillRect(x, cy + halfT - 2, 1, 3);
    }

    // ── Pass 4: BRICK COURSES (horizontal & staggered vertical joints) ───────
    // Horizontal courses every 8 px through the brick body
    ctx.fillStyle = "rgba(28,16,8,0.40)";
    for (let dy = 14; dy < 48; dy += 8) {
        for (let x = xStart; x < xEnd; x++) {
            if (_s3InOpening(x)) continue;
            const cy = _s3WallCenterYAt(x);
            const yTop = cy - halfT;
            ctx.fillRect(x, yTop + dy, 1, 1);
        }
    }
    // Vertical staggered joints (one per 18 px, offset per row)
    ctx.fillStyle = "rgba(28,16,8,0.32)";
    for (let dy = 12; dy < 48; dy += 8) {
        const courseRow = (dy - 12) / 8;
        const offset = (courseRow % 2 === 0) ? 0 : 9;
        for (let x = xStart + offset; x < xEnd; x += 18) {
            if (_s3InOpening(x)) continue;
            const cy = _s3WallCenterYAt(x);
            const yTop = cy - halfT;
            ctx.fillRect(x, yTop + dy, 1, 7);
        }
    }

    // ── Pass 5: CRENELLATIONS (merlons sticking past the north face) ─────────
    // Wide merlons (16 px) with small embrasures (8 px). Each merlon is a small
    // dark block protruding ~6 px outside the wall band on the north side.
    const merlonW = 16;
    const merlonGap = 8;
    const merlonH = 6;
    for (let x = xStart + 6; x < xEnd; x += merlonW + merlonGap) {
        // Skip if any part of the merlon overlaps a patrol gap
        let inGap = false;
        for (let dx = 0; dx < merlonW; dx++) {
            if (_s3InOpening(x + dx)) { inGap = true; break; }
        }
        if (inGap) continue;

        // Find an averaged Y over the merlon width so the merlon sits flush
        // with the wall's local curve
        let cySum = 0;
        for (let dx = 0; dx < merlonW; dx++) cySum += _s3WallCenterYAt(x + dx);
        const cy = cySum / merlonW;
        const yTop = cy - halfT;

        ctx.fillStyle = "#4e3624";
        ctx.fillRect(x, yTop - merlonH, merlonW, merlonH);
        // Lighter stone cap
        ctx.fillStyle = "#8a6c50";
        ctx.fillRect(x + 1, yTop - merlonH, merlonW - 2, 2);
    }

    // ── Pass 6: WEATHERED DARK STAINS scattered along the wall ───────────────
    for (let x = xStart + 60; x < xEnd; x += 140 + rng() * 40) {
        if (_s3InOpening(x)) continue;
        const stainW = 14 + rng() * 24;
        const cy = _s3WallCenterYAt(x);
        const yTop = cy - halfT;
        ctx.fillStyle = "rgba(28,18,10,0.16)";
        ctx.fillRect(x + rng() * 16, yTop + 12, stainW, 32);
    }

    // ── Pass 7: PATROL GAPS — visible packed-dirt path through the wall ──────
    _S3_PATROL_GAPS.forEach(function (gap) {
        const cy = _s3WallCenterYAt(gap.x);
        const yTop = cy - halfT - 4;
        const yBot = cy + halfT + 4;
        // Dirt-coloured walkable strip
        ctx.fillStyle = "#8a7050";
        ctx.fillRect(gap.x - gap.halfW, yTop, gap.halfW * 2, yBot - yTop);
        // Subtle rut shadow
        ctx.fillStyle = "rgba(40,28,16,0.30)";
        ctx.fillRect(gap.x - gap.halfW + 2, yTop + 4, gap.halfW * 2 - 4, 1);
        ctx.fillRect(gap.x - gap.halfW + 2, yBot - 5, gap.halfW * 2 - 4, 1);
    });

    ctx.restore();
}

// =============================================================================
// THE GATE — dynamic per-frame render (NOT baked into the background), same
// technique fortification_system.js's renderDynamicGates() uses: the
// background canvas leaves this stretch of wall blank, and this function
// paints the current open/closed state fresh every frame so the doors can
// flip state instantly with no map regeneration. Two short leaves are
// drawn — one flush with the wall's north (outer, forest-facing) edge, one
// flush with its south (inner, Ming-facing) edge — each a shortened take on
// fortification_system's pillar/plank/iron-band door, sized for this wall's
// thin 64px cross-section instead of a full city gate. Call every frame as:
//   if (typeof s3DrawGate === 'function') s3DrawGate(ctx);
// =============================================================================
function _s3DrawGate(ctx) {
    _s3UpdateGateAutoClose();

    const x      = _S3_GATE.x;
    const halfW  = _S3_GATE.halfW;
    const w      = halfW * 2;
    const cy     = _s3WallCenterYAt(x);
    const halfT  = _S3_WALL_THICKNESS_PX * 0.5;
    const leafH  = 10;

    const northLeafTop = cy - halfT - 2;
    const northLeafBot = northLeafTop + leafH;
    const southLeafBot = cy + halfT + 2;
    const southLeafTop = southLeafBot - leafH;

    ctx.save();

    if (_S3_GATE.open) {
        // ── OPEN — packed-dirt passage straight through, same treatment as
        // the always-open patrol gaps (Pass 7 of _s3DrawWall).
        ctx.fillStyle = "#8a7050";
        ctx.fillRect(x - halfW, northLeafTop, w, southLeafBot - northLeafTop);
        ctx.fillStyle = "rgba(40,28,16,0.30)";
        ctx.fillRect(x - halfW + 2, cy - halfT,     w - 4, 1);
        ctx.fillRect(x - halfW + 2, cy + halfT - 5, w - 4, 1);
    } else {
        // ── CLOSED — shadowed tunnel interior between the two leaves,
        // hinting at the wall's thickness.
        ctx.fillStyle = "#241a12";
        ctx.fillRect(x - halfW, northLeafBot, w, southLeafTop - northLeafBot);
    }

    // Flanking stone pillars — the gate's own stonework, present open or shut
    const pillarW = 5;
    ctx.fillStyle = "#4a3d30";
    ctx.fillRect(x - halfW - pillarW, northLeafTop, pillarW, southLeafBot - northLeafTop);
    ctx.fillRect(x + halfW,           northLeafTop, pillarW, southLeafBot - northLeafTop);
    ctx.fillStyle = "#6b5a44";
    ctx.fillRect(x - halfW - pillarW, northLeafTop, pillarW, 2);
    ctx.fillRect(x + halfW,           northLeafTop, pillarW, 2);

    if (!_S3_GATE.open) {
        _s3DrawGateLeaf(ctx, x, northLeafTop, w, leafH, "north"); // outer face
        _s3DrawGateLeaf(ctx, x, southLeafTop, w, leafH, "south"); // inner face
    }

    ctx.restore();
}

// One shortened door leaf — pillars, vertical planking, iron bands, and a
// colored lintel cap, all lifted straight from fortification_system.js's
// drawn-gate language (renderDynamicGates) but scaled down to this wall's
// far thinner cross-section. `side` picks which edge the lintel sits on and
// its color, so the outer and inner faces read distinctly at a glance:
// weathered dark iron facing the forest frontier, Ming lacquer red facing home.
function _s3DrawGateLeaf(ctx, cx, topY, w, h, side) {
    const x0 = cx - w / 2;

    // Base plank wood
    ctx.fillStyle = "#5a4030";
    ctx.fillRect(x0, topY, w, h);

    // Vertical plank-gap strokes
    ctx.fillStyle = "#3e2723";
    for (let i = 2; i < w; i += 3) {
        ctx.fillRect(x0 + i, topY, 1, h);
    }

    // Iron bands
    ctx.fillStyle = "#1f1f1f";
    ctx.fillRect(x0, topY + 1,     w, 1.5);
    ctx.fillRect(x0, topY + h - 2.5, w, 1.5);

    // End posts
    ctx.fillStyle = "#37474f";
    ctx.fillRect(x0, topY, 3, h);
    ctx.fillRect(x0 + w - 3, topY, 3, h);

    // Roof / lintel cap
    ctx.fillStyle = (side === "north") ? "#3a3f42" : "#8b2a18";
    const capY = (side === "north") ? topY - 3 : topY + h;
    ctx.fillRect(x0, capY, w, 3);
}

// How far past the wall band (on whichever side the player ends up on) they
// need to be before the gate is considered "cleared" and swings itself shut.
// Applies symmetrically — leaving to the forest frontier or coming back home both
// trigger the same auto-close once you're through and clear.
const _S3_GATE_AUTO_CLOSE_MARGIN = 40;

function _s3UpdateGateAutoClose() {
    if (!_S3_GATE.open) return;
    if (typeof player === 'undefined' || !player) return;
    // Ignore players who aren't anywhere near the gate — nobody should be
    // able to slam it shut on someone else from clear across the map.
    if (Math.abs(player.x - _S3_GATE.x) > _S3_GATE.halfW + 60) return;

    const cy    = _s3WallCenterYAt(player.x);
    const halfT = _S3_WALL_THICKNESS_PX * 0.5;
    if (Math.abs(player.y - cy) > halfT + _S3_GATE_AUTO_CLOSE_MARGIN) {
        window.s3SetGateOpen(false);
    }
}

// Live-toggles collision on exactly the tiles tagged isGate at map
// generation time — leaves neighboring wall/tower tiles untouched.
function _s3SetGateTiles(open) {
    if (!worldMap_story3 || !worldMap_story3.length) return;
    const gx0 = Math.floor((_S3_GATE.x - _S3_GATE.halfW) / TILE_SIZE);
    const gx1 = Math.floor((_S3_GATE.x + _S3_GATE.halfW) / TILE_SIZE);
    for (let gx = gx0; gx <= gx1; gx++) {
        const col = worldMap_story3[gx];
        if (!col) continue;
        for (let gy = 0; gy < col.length; gy++) {
            const t = col[gy];
            if (t && t.isGate) t.impassable = !open;
        }
    }
}

// Expose for the shared draw loop (sandboxmode_update.js), matching the
// existing typeof-guarded hook pattern used for drawSiegeVisuals etc.
window.s3DrawGate = _s3DrawGate;

// =============================================================================
// GATE DENIAL MESSAGE — the player has no in-game "ticket" object; whether
// they can pass IS _S3_GATE.open (permission granted by a future trigger).
// Called from the shared movement-collision check in sandboxmode_update.js
// whenever a move is blocked by a tile tagged isGate, so walking into a shut
// gate explains itself instead of just silently stopping the player.
// Throttled so leaning on the wall doesn't spam the subtitle every frame.
// =============================================================================
let _s3LastGateDenyMsgAt = -Infinity;
const _S3_GATE_DENY_MSG_COOLDOWN_MS = 4000;

function _s3NotifyGateBlocked() {
    const now = Date.now();
    if (now - _s3LastGateDenyMsgAt < _S3_GATE_DENY_MSG_COOLDOWN_MS) return;
    _s3LastGateDenyMsgAt = now;

    const text = "The gate is barred. The guards won't open it without orders granting you leave to pass.";
    if (typeof window.StoryPresentation === 'object' &&
        window.StoryPresentation &&
        typeof window.StoryPresentation.showSubtitle === 'function') {
        window.StoryPresentation.showSubtitle(text, 3500, "#f5d76e");
    } else {
        console.log("[Story3] " + text);
    }
}
window.s3NotifyGateBlocked = _s3NotifyGateBlocked;

// =============================================================================
// TOWERS — BIRD'S-EYE SQUARE WATCHTOWERS
// ─────────────────────────────────────────────────────────────────────────────
// Each tower is a flat square viewed from directly above:
//
//      ┌─┬─┬─┬─┐
//      ├─┤   ├─┤      ← outer stone box with crenellated edge
//      ├─┤ □ ├─┤      ← inner pavilion (small dark roof square)
//      ├─┤   ├─┤
//      └─┴─┴─┴─┘
//
// No isometric extrusion. No pagoda roof projection. Same visual language as
// the wall.  Weathered variant gets a cracked corner; otherwise identical.
// =============================================================================
function _s3DrawTowers(ctx) {
    ctx.save();

    for (let i = 0; i < _S3_TOWERS.length; i++) {
        const t = _S3_TOWERS[i];
        const cx = t.cx, cy = t.cy;
        const half = _S3_TOWER_HALF;

        // ── 1) Drop shadow ──────────────────────────────────────────────────
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(cx - half + 3, cy - half + 3, half * 2, half * 2);

        // ── 2) Outer stone box ──────────────────────────────────────────────
        ctx.fillStyle = "#5a4030";
        ctx.fillRect(cx - half, cy - half, half * 2, half * 2);

        // Inner stone band (slightly lighter) — frames the pavilion
        ctx.fillStyle = "#7a5840";
        ctx.fillRect(cx - half + 4, cy - half + 4, half * 2 - 8, half * 2 - 8);

        // Parapet floor (dark inner square)
        ctx.fillStyle = "#3a2818";
        ctx.fillRect(cx - half + 8, cy - half + 8, half * 2 - 16, half * 2 - 16);

        // ── 3) Crenellated outer edge (small merlons on all 4 sides) ────────
        ctx.fillStyle = "#4e3624";
        const crenW = 5, crenGap = 4;
        for (let p = -half; p < half; p += crenW + crenGap) {
            // top
            ctx.fillRect(cx + p, cy - half - 3, crenW, 3);
            // bottom
            ctx.fillRect(cx + p, cy + half,     crenW, 3);
            // left
            ctx.fillRect(cx - half - 3, cy + p, 3, crenW);
            // right
            ctx.fillRect(cx + half,     cy + p, 3, crenW);
        }

        // ── 4) Central pavilion (small square watch-house roof, top-down) ───
        const pavHalf = Math.floor(half * 0.42);
        // Pavilion roof shadow
        ctx.fillStyle = "rgba(0,0,0,0.40)";
        ctx.fillRect(cx - pavHalf + 1, cy - pavHalf + 1, pavHalf * 2, pavHalf * 2);
        // Pavilion roof body (dark wood, Ming-style)
        ctx.fillStyle = "#3e2a1a";
        ctx.fillRect(cx - pavHalf, cy - pavHalf, pavHalf * 2, pavHalf * 2);
        // Red lacquer trim around the eaves (Ming military trim — thin band)
        ctx.fillStyle = "#8b2a18";
        ctx.fillRect(cx - pavHalf,     cy - pavHalf,     pavHalf * 2, 2);
        ctx.fillRect(cx - pavHalf,     cy + pavHalf - 2, pavHalf * 2, 2);
        ctx.fillRect(cx - pavHalf,     cy - pavHalf,     2, pavHalf * 2);
        ctx.fillRect(cx + pavHalf - 2, cy - pavHalf,     2, pavHalf * 2);
        // Central ridge dot (apex of the small pavilion roof)
        ctx.fillStyle = "#241410";
        ctx.fillRect(cx - 1, cy - 1, 2, 2);

        // ── 5) Variant: weathered tower gets a cracked corner ──────────────
        if (t.variant === 1) {
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            ctx.fillRect(cx + half - 6, cy + half - 6, 6, 6);
            ctx.fillStyle = "rgba(60,40,20,0.45)";
            ctx.fillRect(cx + half - 10, cy + half - 3, 8, 1);
        }

        // ── 6) Outline ──────────────────────────────────────────────────────
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - half, cy - half, half * 2, half * 2);
    }

    ctx.restore();
}

// =============================================================================
// CITY PLACEMENT HELPERS
// =============================================================================
function _s3SnapToPassable(px, py) {
    const gX = Math.floor(px / TILE_SIZE);
    const gY = Math.floor(py / TILE_SIZE);
    const _valid = function (gx, gy) {
        const t = worldMap_story3[gx] && worldMap_story3[gx][gy];
        return t && !t.impassable && !t.isWall;
    };
    if (_valid(gX, gY)) {
        return { x: gX * TILE_SIZE + TILE_SIZE * 0.5, y: gY * TILE_SIZE + TILE_SIZE * 0.5 };
    }
    for (let r = 1; r <= 20; r++) {
        for (let di = -r; di <= r; di++) {
            for (let dj = -r; dj <= r; dj++) {
                if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
                if (_valid(gX + di, gY + dj)) {
                    return { x: (gX + di) * TILE_SIZE + TILE_SIZE * 0.5,
                             y: (gY + dj) * TILE_SIZE + TILE_SIZE * 0.5 };
                }
            }
        }
    }
    return null;
}

function populateCities_story3() {
    console.log("[Story3] Founding garrisons, military posts, and southern villages…");
    cities_story3 = [];
    if (typeof window.clearPointsOfInterest === 'function') window.clearPointsOfInterest();

    // The small wall-line posts below aren't real settlements — they're
    // single-purpose points of interest (see poi_system.js). They're
    // generated as tiny walled-less villages (fort/blacksmith/barracks
    // cosmetics stamped on top) via inCityMode, not routed through the
    // full economic city panel ("Visit Settlement" → walled-city grid) —
    // that never made sense for a powder magazine. Mapping is name-based
    // since FIXED_SETTLEMENTS_story3 doesn't carry a location kind of its
    // own. Fushun Suo (home), the two Garrisons, and the civilian villages
    // are real settlements and keep the standard city panel.
    const CUSTOM_LOC_KIND_BY_NAME = {
        "Powder Magazine":    "storage",
        "Arrow & Bolt Store": "storage",
        "Grain Tax Post":     "storage",
        "Barracks West":      "barracks",
        "Barracks East":      "barracks",
        "Smithy & Wagonyard": "maintenance",
        "Signal Tower Post":  "watchtower",
        "Fushun Pass Tower":  "watchtower"
    };

    FIXED_SETTLEMENTS_story3.forEach(function (site) {
        let snapped = _s3SnapToPassable(site.x, site.y);
        if (!snapped) snapped = { x: site.x, y: site.y };

        const clKind = CUSTOM_LOC_KIND_BY_NAME[site.name];
        if (clKind && typeof window.registerPointOfInterest === 'function') {
            window.registerPointOfInterest({
                id:      "s3_" + site.name.replace(/\s+/g, "_").toLowerCase(),
                x:       snapped.x,
                y:       snapped.y,
                kind:    clKind,
                name:    site.name,
                faction: site.faction
            });
            return; // not added to cities_story3 — it's a point of interest, not a city
        }

        cities_story3.push({
            name:         site.name,
            x:            snapped.x,
            y:            snapped.y,
            radius:       0,           // ← NO green visibility ring on any settlement
            faction:      site.faction,
            pop:          site.pop,
            isVillage:    !!site.isVillage,
            isMilitary:   !!site.isMilitary,
            isPlayerHome: !!site.isPlayerHome
        });
    });
}

// =============================================================================
// JIANZHOU PATROL SPAWNER  (5 raiding bands in the highland forest)
// =============================================================================
function _s3SpawnJurchenPatrols() {
    if (!Array.isArray(window.globalNPCs)) {
        console.warn("[Story3] globalNPCs not available — Jurchen patrols skipped.");
        return;
    }
    if (window.__s3JurchenPatrolsSpawned) return;
    window.__s3JurchenPatrolsSpawned = true;

    const patrols = [
        { nx: 0.14, ny: 0.17, troops: 28, name: "Jianzhou Raiding Band I"   },
        { nx: 0.30, ny: 0.11, troops: 34, name: "Jianzhou Raiding Band II"  },
        { nx: 0.49, ny: 0.22, troops: 38, name: "Jianzhou Raiding Band III" },
        { nx: 0.66, ny: 0.10, troops: 30, name: "Jianzhou Raiding Band IV"  },
        { nx: 0.82, ny: 0.20, troops: 26, name: "Jianzhou Raiding Band V"   }
    ];

    // Jurchen forces weren't pure steppe cavalry the way the Mongols were —
    // wooded, hilly terrain favored a cavalry/foot-archer mix.
    const rosterTypes = ["Lancer", "Horse Archer", "Archer", "Horse Archer"];
    const factionColor = (window.FACTIONS && window.FACTIONS["Jianzhou Jurchens"])
        ? window.FACTIONS["Jianzhou Jurchens"].color : "#455a64";

    patrols.forEach(function (p, idx) {
        const x = p.nx * WORLD_WIDTH;
        const y = p.ny * WORLD_HEIGHT;
        const roster = [];
        for (let i = 0; i < p.troops; i++) {
            roster.push({ type: rosterTypes[i % rosterTypes.length], exp: 1 });
        }
        window.globalNPCs.push({
            id: "jurchen_patrol_" + idx, storyId: "jurchen_patrol_" + idx,
            isImportant: true, name: p.name, role: "Military",
            count: p.troops, roster: roster,
            faction: "Jianzhou Jurchens", color: factionColor,
            originCity: null, targetCity: null,
            x: x, y: y, targetX: x, targetY: y,
            hp: 140, maxHealth: 140, attack: 18, defense: 12, armor: 8,
            speed: 1.2, aiPreset: "patrol",
            __s3JurchenPatrol: true
        });
    });

    console.log("[Story3] ✅ " + patrols.length + " Jianzhou raiding bands spawned in the highland forest.");
}

// =============================================================================
// ENTRY POINT — initGame_story3
// =============================================================================
window.initGame_story3 = async function () {

    if (window.__gameStarted) return;
    window.__gameStarted = true;

    console.log("[Story3] 🏯 Launching Ming Liaodong frontier — 1578 CE…");

    // 1. Factions
    if (window.SongJinScenario && typeof window.SongJinScenario.applyFactions === 'function') {
        window.SongJinScenario.applyFactions();
    } else {
        console.error("[Story3] SongJinScenario.applyFactions() not found.");
    }

    // 2. Terrain
    await generateMap_story3();

    // 3. Settlements
    await setLoading(78, "Founding garrison posts and southern towns…");
    populateCities_story3();

    // 4. Swap into shared engine arrays
    worldMap.length = 0;
    worldMap_story3.forEach(function (col, i) { worldMap[i] = col; });
    cities.length = 0;
    cities_story3.forEach(function (c) { cities.push(c); });
    if (typeof worldMapRef !== 'undefined') worldMapRef = worldMap;

    window.cities_sandbox       = cities;
    window._tradeWorldRef       = worldMap;
    window.WORLD_WIDTH_sandbox  = WORLD_WIDTH;
    window.WORLD_HEIGHT_sandbox = WORLD_HEIGHT;
    window.__sandboxBgCanvas    = bgCanvas;
    window.__sandboxBgCtx       = bgCtx;

    // 5. Mark active
    window.__campaignStory3Active = true;

    // 6. NPCs
    await setLoading(88, "Posting garrison patrols and civilian foot-traffic…");
    if (typeof initializeNPCs === 'function') {
        initializeNPCs(cities, worldMap, TILE_SIZE, COLS, ROWS,
                       PADDING_X_story3, PADDING_Y_story3);
    }

    // 7. City interiors
    await setLoading(92, "Building drill yards, markets, and watch posts…");
    if (typeof initAllCities === 'function') {
        await initAllCities(FACTIONS);
    }

    // 8. Jianzhou patrols
    await setLoading(95, "Sighting Jurchen riders on the northern horizon…");
    _s3SpawnJurchenPatrols();

    // 9. Player start — Fushun Suo
    const startCity =
        cities.find(function (c) { return c.name === "Fushun Suo"; }) ||
        cities.find(function (c) { return c.isPlayerHome; }) ||
        cities.find(function (c) { return c.faction === "Ming Dynasty"; });

    if (startCity) {
        player.x = startCity.x;
        player.y = startCity.y + 30;
    } else {
        player.x = WORLD_WIDTH  * 0.42;
        player.y = WORLD_HEIGHT * 0.50;
    }
    player.faction  = "Ming Dynasty";
    player.enemies  = ["Jianzhou Jurchens", "Bandits"];

    // 10. Scenario shell
    if (!window.__activeScenario) window.__activeScenario = {};
    if (!window.__activeScenario.factions) {
        window.__activeScenario.factions = FACTIONS;
    }

    // 11. Install Ming campaign (window name retained for backwards compat)
    if (window.SongJinScenario && typeof window.SongJinScenario.install === 'function') {
        try {
            window.SongJinScenario.install();
            console.log("[Story3] ✅ MingFrontier scenario installed.");
        } catch (err) {
            console.error("[Story3] SongJinScenario.install() failed:", err);
        }
    } else {
        console.error("[Story3] SongJinScenario.install not found.");
    }

    // 12. THE GATE — closed at boot. Real open/close: flips _S3_GATE.open,
    //     live-toggles collision on the gate's tiles, and lets the per-frame
    //     _s3DrawGate() draw the correct door state on the very next frame.
    //     Nothing in this build calls this yet — it's here for a future
    //     "grant passage" trigger (out OR back in; guards work the gate the
    //     same way either direction) to hook into. The gate also closes
    //     itself automatically once the player is clear of the wall on
    //     whichever side they end up on — see _s3UpdateGateAutoClose().
    window.s3SetGateOpen = function (open) {
        open = !!open;
        if (_S3_GATE.open === open) return;
        _S3_GATE.open = open;
        _s3SetGateTiles(open);
        console.log("[Story3] Frontier gate " + (open ? "OPENED — passage granted." : "CLOSED."));
    };

    // Narratively-named alias for a future "request passage back" trigger —
    // guards open the gate the same way whether you're asking to leave or
    // asking to be let back in.
    window.s3RequestPassage = function () {
        window.s3SetGateOpen(true);
    };

    // 13. Show UI
    document.getElementById('ui').style.display      = 'block';
    document.getElementById('loading').style.display = 'none';
    if (typeof window.hideLoadingScreen === 'function') window.hideLoadingScreen();
    if (typeof window.showDiplomacyContainer === 'function') {
        window.showDiplomacyContainer();
    } else {
        const dipEl = document.getElementById('diplomacy-container');
        if (dipEl) dipEl.style.display = 'block';
    }

    // 14. Render loop
    if (typeof draw === 'function') {
        draw();
    } else {
        console.error("[Story3] draw() not found — ensure sandboxmode_overworld.js is loaded.");
    }

    console.log("[Story3] ✅ Ming Liaodong frontier initialised successfully.");
};