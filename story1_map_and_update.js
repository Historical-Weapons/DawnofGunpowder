// =============================================================================
// STORY 1 – MAP & UPDATE: BUN'EI INVASION 1274  (story1_map_and_update.js)
//
// Generates a historically-grounded Northern Kyūshū island map and exposes
// window.initGame_story1().
//
// HOW IT HOOKS INTO THE SHARED ENGINE
// ─────────────────────────────────────────────────────────────────────────────
// • sandbox_overworld.js declares `const worldMap = []` and `const cities = []`
//   as mutable (but not re-assignable) arrays.  This file populates internal
//   _story1 arrays, then SWAPS contents into those shared arrays so every
//   downstream system reads the correct data without modification.
//
// • FACTIONS and SYLLABLE_POOLS are mutated by applyStory1Factions()
//   (defined in npc_systems_story1.js, loaded before this file).
//
// • bgCanvas / bgCtx, PALETTE, TILE_SIZE, COLS, ROWS, hash, noise, fbm,
//   smoothstep, draw(), player — all global from sandbox_overworld.js.
//
// LAND DETECTION STRATEGY
// ─────────────────────────────────────────────────────────────────────────────
// All land geometry is defined by three hand-plotted polygon arrays:
//
//   _S1_MAIN_COAST  — The northern Kyūshū mainland coast.  An OPEN path
//                     from [0.175, 0.000] to [0.780, 0.000] tracing the
//                     Genkai Sea shore, Hakata Bay, the Shikanoshima
//                     peninsula, and the north-east Fukuoka coast.
//                     Closed into a land polygon by appending the map's
//                     right edge, bottom edge, and left edge so that
//                     everything SOUTH of the coastline is "inside" (land).
//
//   _S1_NOKONOSHIMA — Nokonoshima Island (closed polygon), situated inside
//                     Hakata Bay at roughly (0.32–0.40, 0.35–0.46).
//
//   _S1_GENKAI      — Genkai Island (closed polygon), north-west of the
//                     main coast at roughly (0.045–0.105, 0.125–0.200).
//
// Point-in-polygon (even-odd ray-cast) is used to test every tile.  A two-
// pass approach then marks water tiles adjacent to land as "Coastal."
//
// TILE TYPES USED (all defined in sandbox PALETTE):
//   Ocean, Coastal, River, Highlands, Dense Forest, Forest, Plains, Steppes,
//   Mountains — no Desert or Dunes (wrong climate for subtropical Japan).
//
// FACTIONS: Kamakura Shogunate, Yuan Dynasty Coalition, Kyushu Defender, Bandits
//
// HISTORICAL SETTLEMENTS (hardcoded, all → Kamakura Shogunate):
//   MAJOR CITIES : Hakata, Dazaifu
//   TOWNS        : Hakozaki, Momochi, Munakata, Karatsu, Hirado, Imari,
//                  Kurume, Yoshinogari
//   VILLAGES     : Sohara, Torikai, Nishijin, Akasaka
//   ISLAND POSTS : Nokonoshima-mura, Genkai-jima
//   + ~8 random hamlets on valid land tiles
// =============================================================================

// ── Internal story1 data ───────────────────────────────────────────────────────
let worldMap_story1 = [];
let cities_story1   = [];

// ── Tuning ────────────────────────────────────────────────────────────────────
const PADDING_X_story1   = WORLD_WIDTH  * 0.02;
const PADDING_Y_story1   = WORLD_HEIGHT * 0.02;
// ── Tuning ────────────────────────────────────────────────────────────────────
const HAMLET_COUNT_story1 = 0; // DISABLE RANDOM GENERATION

// ── Historical Settlement Surgery ─────────────────────────────────────────────
function populateHistoricalCities_story1() {
    cities_story1 = []; // Clear any residual data

    // SURGERY: Use your custom FIXED_SETTLEMENTS_story1 array
    FIXED_SETTLEMENTS_story1.forEach(site => {
        
        // 1. Calculate absolute PIXEL coordinates (not grid coordinates)
        let px = site.nx * COLS * TILE_SIZE;
        let py = site.ny * ROWS * TILE_SIZE;
        
        // 2. Snap to valid land so Hakata and island posts don't spawn in the ocean
        let snapped = _s1SnapToLand(px, py);
        if (!snapped) snapped = { x: px, y: py }; // Fallback

        cities_story1.push({
            name: site.name,
            x: snapped.x,
            y: snapped.y,
            radius: 30, // <--- SURGERY: The missing Hitbox! This allows UI interaction.
            faction: site.faction,
            pop: site.pop, 
            type: site.type || "TOWN",
            isPlayerHome: site.name === "Hakata"
        });
    });
}
const _S1_COAST_RADIUS    = 8;  // tiles — water within this distance of land = "Coastal"

// ── Factions that may NOT own cities ──────────────────────────────────────────
const _S1_NO_CITY_FACTIONS = new Set(["Yuan Dynasty Coalition", "Bandits", "Kyushu Defender"]);

// ── Only one assignable Japanese faction ──────────────────────────────────────
function _s1BestJapaneseFaction(_x, _y) {
    return "Kamakura Shogunate";
}

const _S1_MAIN_COAST = [  
    [0.175, 0.26], [0.172, 0.26], [0.170, 0.26], [0.167, 0.26], [0.165, 0.26],
    [0.160, 0.26], [0.155, 0.26], [0.151, 0.26], [0.148, 0.26], [0.144, 0.26],
    [0.140, 0.26], [0.135, 0.26], [0.130, 0.26], [0.125, 0.26], [0.120, 0.26],
    [0.115, 0.26], [0.110, 0.26], [0.105, 0.26], [0.100, 0.26], [0.095, 0.26],
    [0.090, 0.26], [0.085, 0.26], [0.080, 0.26], [0.075, 0.26], [0.070, 0.26],
    [0.065, 0.26], [0.060, 0.26], [0.055, 0.26], [0.050, 0.26], [0.047, 0.26],
    [0.045, 0.26], [0.046, 0.26], [0.048, 0.26], [0.051, 0.26], [0.055, 0.26],
    [0.060, 0.260], [0.065, 0.260], [0.070, 0.258], [0.075, 0.255], [0.080, 0.252],
    [0.085, 0.250], [0.090, 0.252], [0.095, 0.255], [0.100, 0.260], [0.105, 0.265],
    [0.108, 0.272], [0.110, 0.280], [0.109, 0.288], [0.108, 0.295], [0.106, 0.302],
    [0.105, 0.310], [0.107, 0.318], [0.110, 0.325], [0.114, 0.332], [0.118, 0.340],
    [0.121, 0.348], [0.125, 0.355], [0.130, 0.362], [0.135, 0.370], [0.140, 0.378],
    [0.145, 0.385], [0.150, 0.392], [0.155, 0.400], [0.160, 0.405], [0.165, 0.410],
    [0.170, 0.413], [0.175, 0.415], [0.180, 0.418], [0.185, 0.420], [0.190, 0.425],
    [0.195, 0.430], // Index 70: Start of bulge
    [0.208, 0.442], [0.218, 0.455], [0.222, 0.470], [0.216, 0.480], // New Bulge points
    [0.210, 0.485], // Index 105 (Resumed)
    [0.217, 0.482], [0.225, 0.480], [0.232, 0.482], [0.240, 0.485], [0.245, 0.490],
    [0.250, 0.495], [0.255, 0.502], [0.260, 0.510], [0.265, 0.517], [0.270, 0.525],
    [0.267, 0.532], [0.265, 0.540], [0.270, 0.545], [0.275, 0.550], [0.282, 0.553],
    [0.290, 0.555], [0.297, 0.552], [0.305, 0.550], [0.312, 0.555], [0.320, 0.560],
    [0.327, 0.558], [0.335, 0.555], [0.342, 0.552], [0.350, 0.550], [0.357, 0.547],
    [0.365, 0.545], [0.372, 0.542], [0.380, 0.540], [0.387, 0.537], [0.395, 0.535],
    [0.402, 0.535], [0.410, 0.535], [0.417, 0.532], [0.425, 0.530], [0.432, 0.527],
    [0.440, 0.525], [0.447, 0.522], [0.455, 0.520], [0.462, 0.517], [0.470, 0.515],
    [0.477, 0.515], [0.485, 0.515], [0.492, 0.512], [0.500, 0.510], [0.507, 0.510],
    [0.515, 0.510], [0.522, 0.510], [0.530, 0.510], [0.537, 0.510], [0.545, 0.510],
    [0.552, 0.507], [0.560, 0.505], [0.567, 0.505], [0.575, 0.505], [0.582, 0.502],
    [0.590, 0.500], [0.597, 0.500], [0.605, 0.500], [0.612, 0.497], [0.620, 0.495],
    [0.627, 0.492], [0.635, 0.490], [0.640, 0.485], [0.645, 0.480], [0.650, 0.477],
    [0.655, 0.475], [0.660, 0.472], [0.665, 0.470], [0.670, 0.467], [0.675, 0.465],
    [0.677, 0.460], [0.680, 0.455], [0.675, 0.452], [0.670, 0.450], [0.675, 0.447],
    [0.680, 0.445], [0.685, 0.442], [0.690, 0.440], [0.695, 0.437], [0.700, 0.435],
    [0.695, 0.430], [0.690, 0.425], [0.695, 0.422], [0.700, 0.420], [0.705, 0.417],
    [0.710, 0.415], [0.715, 0.412], [0.720, 0.410], [0.715, 0.405], [0.710, 0.400],
    [0.715, 0.397], [0.720, 0.395], [0.725, 0.392], [0.730, 0.390], [0.727, 0.385],
    [0.725, 0.380], [0.730, 0.375], [0.735, 0.370], [0.740, 0.365], [0.745, 0.360],
    [0.747, 0.355], [0.750, 0.350], [0.747, 0.345], [0.745, 0.340], [0.740, 0.335],
    [0.735, 0.330], [0.740, 0.325], [0.745, 0.320], [0.750, 0.315], [0.755, 0.310],
    [0.757, 0.305], [0.760, 0.300], [0.757, 0.295], [0.755, 0.290], [0.750, 0.285],
    [0.745, 0.280], [0.742, 0.275], [0.740, 0.270], [0.737, 0.265], [0.735, 0.260],
    [0.732, 0.255], [0.730, 0.250], [0.732, 0.245], [0.735, 0.240], [0.737, 0.235],
    [0.740, 0.230], [0.735, 0.225], [0.730, 0.220], [0.725, 0.215], [0.720, 0.210],
    [0.715, 0.205], [0.710, 0.200], [0.705, 0.195], [0.700, 0.190], [0.695, 0.187],
    [0.690, 0.185], [0.682, 0.185], [0.675, 0.185], [0.667, 0.187], [0.660, 0.190],
    [0.652, 0.192], [0.645, 0.195], [0.637, 0.197], [0.630, 0.200], [0.622, 0.202],
    [0.615, 0.205], [0.607, 0.207], [0.600, 0.210], [0.592, 0.210], [0.585, 0.210],
    [0.577, 0.210], [0.570, 0.210], [0.562, 0.212], [0.555, 0.215], [0.547, 0.217],
    [0.540, 0.220], [0.532, 0.220], [0.525, 0.220], [0.517, 0.217], [0.510, 0.215],
    [0.502, 0.215], [0.495, 0.215], [0.487, 0.217], [0.480, 0.220], [0.472, 0.225],
    [0.465, 0.230], [0.457, 0.235], [0.450, 0.240], [0.445, 0.247], [0.440, 0.255],
    [0.435, 0.262], [0.430, 0.270], [0.425, 0.277], [0.420, 0.285], [0.415, 0.292],
    [0.410, 0.300], [0.402, 0.302], [0.395, 0.305], [0.387, 0.305], [0.380, 0.305],
    [0.372, 0.305], [0.365, 0.305], [0.357, 0.302], [0.350, 0.300], [0.345, 0.295],
    [0.340, 0.290], [0.337, 0.282], [0.335, 0.275], [0.332, 0.267], [0.330, 0.260],
    [0.327, 0.252], [0.325, 0.245], [0.327, 0.237], [0.330, 0.230], [0.332, 0.222],
    [0.335, 0.215], [0.340, 0.207], [0.345, 0.200], [0.350, 0.192], [0.355, 0.185],
    [0.360, 0.177], [0.365, 0.170], [0.370, 0.165], [0.375, 0.160], [0.382, 0.157],
    [0.390, 0.155], [0.397, 0.155], [0.405, 0.155], [0.412, 0.155], [0.420, 0.155],
    [0.427, 0.157], [0.435, 0.160], [0.442, 0.162], [0.450, 0.165], [0.457, 0.167],
    [0.465, 0.170], [0.472, 0.172], [0.480, 0.175], [0.487, 0.177], [0.495, 0.180],
    [0.502, 0.180], [0.510, 0.180], [0.517, 0.177], [0.525, 0.175], [0.532, 0.172],
    [0.540, 0.170], [0.547, 0.167], [0.555, 0.165], [0.562, 0.162], [0.570, 0.160],
    [0.577, 0.157], [0.585, 0.155], [0.592, 0.152], [0.600, 0.150], [0.607, 0.147],
    [0.615, 0.145], [0.622, 0.142], [0.630, 0.140], [0.637, 0.135], [0.645, 0.130],
    [0.652, 0.125], [0.660, 0.120], [0.667, 0.115], [0.675, 0.110], [0.682, 0.105],
    [0.690, 0.100], [0.697, 0.095], [0.705, 0.090], [0.712, 0.085], [0.720, 0.080],
    [0.727, 0.072], [0.735, 0.065], [0.742, 0.057], [0.750, 0.050], [0.755, 0.042],
    [0.760, 0.035], [0.765, 0.027], [0.770, 0.020], [0.775, 0.010], [0.780, 0.000]
];
// ── Shikanoshima — 30 % narrower on x-axis, shifted 3 % west ─────────────────
const _S1_SHIKANOSHIMA = [
    [0.266, 0.300], [0.270, 0.297], [0.273, 0.295], [0.277, 0.292], [0.280, 0.290],
    [0.284, 0.292], [0.287, 0.295], [0.291, 0.300], [0.294, 0.305], [0.296, 0.310],
    [0.298, 0.315], [0.299, 0.320], [0.301, 0.325], [0.303, 0.332], [0.305, 0.340],
    // ── Eastern foot / C extension ───────────────────────────────────────────
    [0.305, 0.347], [0.307, 0.351], [0.309, 0.356], [0.307, 0.360], [0.304, 0.362],
    // ─────────────────────────────────────────────────────────────────────────
    [0.303, 0.362], [0.301, 0.370], [0.299, 0.377],
    [0.298, 0.385], [0.294, 0.390], [0.291, 0.395], [0.285, 0.400], [0.280, 0.405],
    [0.275, 0.402], [0.270, 0.400], [0.266, 0.395], [0.263, 0.390], [0.259, 0.382],
    [0.256, 0.375], [0.254, 0.367], [0.252, 0.360], [0.252, 0.352], [0.252, 0.345],
    [0.254, 0.337], [0.256, 0.330], [0.257, 0.322], [0.259, 0.315], [0.263, 0.307],
    [0.266, 0.300]
];

// ── Genkai Island — compact oval, clearly detached from the mainland (replaces B)
// Approximately (0.063–0.093, 0.147–0.182).
// The surrounding NW corner land artefact is suppressed in _s1IsLand() below.
const _S1_GENKAI = [
    [0.070, 0.150], [0.076, 0.147], [0.082, 0.148], [0.088, 0.152],
    [0.092, 0.158], [0.093, 0.164], [0.091, 0.171], [0.087, 0.177],
    [0.081, 0.181], [0.074, 0.181], [0.068, 0.177], [0.064, 0.170],
    [0.063, 0.163], [0.065, 0.156], [0.070, 0.150]
];

// ── YELLOW ISLAND (Closed Polygon) ───────────────────────────────────────────
// Resized (2x) and shifted 3% Northeast.
const _S1_YELLOW_ISLAND = [
    [0.276, 0.181], [0.286, 0.185], [0.296, 0.191], // Top Edge
    [0.306, 0.201], [0.312, 0.211], [0.316, 0.221], // Right Edge
    [0.312, 0.231], [0.306, 0.241], [0.296, 0.251], // Bottom-Right
    [0.276, 0.257], [0.266, 0.251], [0.256, 0.241], // Bottom-Left
    [0.246, 0.221], [0.252, 0.201], [0.266, 0.191]  // Left Edge
];

 
const _S1_GREEN_TRIANGLE = [
 
];
// ── Land polygon: main coastline closed into a mainland shape ─────────────────
const _S1_LAND_POLY = (function () {
    const poly = _S1_MAIN_COAST.slice(); // copy of mainCoastline
    poly.push([1.000, 0.000]);           // top-right corner
    poly.push([1.000, 1.000]);           // bottom-right corner
    poly.push([0.000, 1.000]);           // bottom-left corner
    
    // Follows the left wall up, stopping just below your 4% threshold
    poly.push([0.000, 0.041]);           
    
    // Snips the corner: creating a diagonal that stays outside the (0.04, 0.04) zone
    poly.push([0.041, 0.041]);           // The "Blocker" point
    poly.push([0.041, 0.000]);           // Hits the top edge
    
    // Polygon auto-closes from [0.041, 0.000] along the top edge back to _S1_MAIN_COAST[0]
    return poly;
})();

// =============================================================================
// POINT-IN-POLYGON  —  even-odd ray-cast (rightward ray)
// =============================================================================
function _s1PIP(px, py, poly) {
    let inside = false;
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = poly[i][0], yi = poly[i][1];
        const xj = poly[j][0], yj = poly[j][1];
        if (((yi > py) !== (yj > py)) &&
            (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

// =============================================================================
// POINT-IN-POLYGON logic (Update these two functions)
// =============================================================================
function _s1IsLand(nx, ny) {
    // 1. Suppression zone for B-zone land artifacts
    // Reduced multiplier from 0.8 to 0.35 to flatten the suppression angle,
    // allowing more land to push out into the northwest.
    if (nx < 0.175 && ny < 0.260 + (0.175 - nx) * 0.35) {
        return _s1PIP(nx, ny, _S1_GENKAI); 
    }

    // 2. Main Landmasses
    if (_s1PIP(nx, ny, _S1_LAND_POLY))       return true;
    if (_s1PIP(nx, ny, _S1_SHIKANOSHIMA))    return true;
    if (_s1PIP(nx, ny, _S1_GENKAI))          return true;

    // 3. INJECTED SHAPES: Yellow Island and Green Triangle
    if (_s1PIP(nx, ny, _S1_YELLOW_ISLAND))   return true;
    if (_s1PIP(nx, ny, _S1_GREEN_TRIANGLE))  return true;

    return false;
}
function _s1OnSmallIsland(nx, ny) {
    // This prevents these shapes from getting massive mountains (keeps them hilly/flat)
    return _s1PIP(nx, ny, _S1_SHIKANOSHIMA) || 
           _s1PIP(nx, ny, _S1_GENKAI)       ||
           _s1PIP(nx, ny, _S1_YELLOW_ISLAND); // Added Yellow Island here
}
// =============================================================================
// MAP GENERATION
// =============================================================================
async function generateMap_story1() {
    console.log("[Story1] Generating Northern Kyūshū — Bun'ei Invasion 1274…");

    bgCtx.fillStyle = PALETTE.ocean;
    bgCtx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // ── Pre-pass: build flat land grid using PIP ─────────────────────────────
    // Stored as Uint8Array[COLS * ROWS], 1 = land, 0 = water.
    // Used in the main tile pass to determine coastal proximity without
    // re-running PIP a second time for every water tile's neighbours.
    await setLoading(10, "Plotting the Kyūshū coastline…");

    const _s1LandGrid = new Uint8Array(COLS * ROWS);
    for (let i = 0; i < COLS; i++) {
        const nx = (i + 0.5) / COLS;
        for (let j = 0; j < ROWS; j++) {
            const ny = (j + 0.5) / ROWS;
            _s1LandGrid[i * ROWS + j] = _s1IsLand(nx, ny) ? 1 : 0;
        }
    }

    // Inline helper: is the water tile at (gi, gj) within coastRadius of land?
    // Checks a filled circle of radius _S1_COAST_RADIUS tiles.
    function _s1NearLand(gi, gj) {
        const R = _S1_COAST_RADIUS;
        const R2 = R * R;
        for (let di = -R; di <= R; di++) {
            for (let dj = -R; dj <= R; dj++) {
                if (di * di + dj * dj > R2) continue;
                const ni = gi + di, nj = gj + dj;
                if (ni < 0 || ni >= COLS || nj < 0 || nj >= ROWS) continue;
                if (_s1LandGrid[ni * ROWS + nj]) return true;
            }
        }
        return false;
    }

    // ── Main tile generation pass ─────────────────────────────────────────────
    await setLoading(28, "Charting the Genkai Sea…");

    for (let i = 0; i < COLS; i++) {

        if (i % 40 === 0) {
            await setLoading(28 + Math.floor((i / COLS) * 38), "Charting the Genkai Sea…");
        }

        worldMap_story1[i] = [];

        for (let j = 0; j < ROWS; j++) {
            const nx = (i + 0.5) / COLS;
            const ny = (j + 0.5) / ROWS;
            const isLand = !!_s1LandGrid[i * ROWS + j];

            let tile;

            // ── Water tiles ──────────────────────────────────────────────────
            if (!isLand) {
                // Coastal zone: warm blue-green shallows close to any shoreline
                const nearCoast = _s1NearLand(i, j);
                tile = {
                    name:       nearCoast ? "Coastal" : "Ocean",
                    color:      nearCoast ? PALETTE.coastal : PALETTE.ocean,
                    speed:      1.4,
                    impassable: true,
                    e: 0.15,
                    m: 0.95
                };

            // ── Land tiles ───────────────────────────────────────────────────
            } else {
                // ── Organic coast-noise layer ────────────────────────────────
                // Two octaves keep shorelines ragged and natural-looking.
                const cNoise = (fbm(nx * 8.5, ny * 8.5) - 0.5) * 0.12;
                const cFine  = (fbm(nx * 22.0, ny * 22.0) - 0.5) * 0.038;

                // ── Elevation ────────────────────────────────────────────────
                // Primary broad topography — low frequency fbm gives large
                // mountain massifs; secondary detail adds mid-scale ridges.
                let e = fbm(nx * 6.5,       ny * 6.5)       * 0.55
                      + fbm(nx * 13.0 + 50, ny * 13.0 + 50) * 0.22
                      + 0.10
                      + cNoise * 0.06;

                // Central Kyūshū volcanic spine (Aso / Kirishima highlands).
                // Pushes the broad interior toward Mountain / Highland biomes.
                const asoDistNx = nx - 0.48, asoDistNy = ny - 0.60;
                const asoDist = Math.hypot(asoDistNx / 0.14, asoDistNy / 0.18);
                if (asoDist < 1.0) {
                    e += (1.0 - asoDist) * 0.22;
                }

                // Secondary highland ridge — north-east of Dazaifu toward
                // the Ōita coast, matching the real Fukuoka-Ōita mountain wall.
                const ridgeDist = Math.hypot((nx - 0.63) / 0.10, (ny - 0.50) / 0.22);
                if (ridgeDist < 1.0) {
                    e += (1.0 - ridgeDist) * 0.14;
                }

                // Hakata Bay coastal plain stays flat — the historic rice-paddy
                // farmland between Hakata port and Dazaifu.
                const hakataPlainDist = Math.hypot((nx - 0.525) / 0.11, (ny - 0.38) / 0.09);
                if (hakataPlainDist < 1.0) {
                    e = Math.max(0.10, e - (1.0 - hakataPlainDist) * 0.18);
                }

                // Keep small islands (Nokonoshima, Genkai) gentle — hilly but
                // not volcanic-scale; they're low wooded hills in reality.
                if (_s1OnSmallIsland(nx, ny)) {
                    e = Math.min(e, 0.58);
                    e = Math.max(e, 0.18); // never absolute flat on islands
                }

                e = Math.max(0.00, Math.min(1.00, e));

                // ── Moisture ─────────────────────────────────────────────────
                // Japan's north Kyūshū is wet year-round; moisture floor ≈ 0.48.
                // Tiny east–west gradient: western coast slightly drier in summer.
                let m = fbm(nx * 5.0 + 100, ny * 5.0 + 100) * 0.32 + 0.56
                      + (0.50 - nx) * 0.04
                      + cFine * 0.06;
                m = Math.max(0.48, Math.min(0.92, m));

// ── Procedural rivers ─────────────────────────────────────────
// Rivers form on mid-elevation moist land — the Chikugo and
// Ōnogawa valleys running south from the highlands.
let isRiver = false;

// 1. TIGHTENED SPAWN RULES: Requires more moisture to form rivers
if (e >= 0.34 && e < 0.62 && m > 0.65) { 
    
    // 2. LOWER NOISE FREQUENCY: Changed 14 to 8 for fewer, longer rivers
    const rN = Math.abs(fbm(nx * 8 + 9, ny * 8 + 9) - 0.5) * 2.0; 
    
    // 3. STRICTER THRESHOLD: Lowered the baseline and moisture modifier
    if (rN < 0.015 + m * 0.015) { 
        isRiver = true;
    }
}

                // ── Biome assignment ─────────────────────────────────────────
                // Uses only tile names present in sandbox_overworld.js PALETTE.
                let name, color, speed;

                if (isRiver) {
                    name = "River";       color = PALETTE.coastal;  speed = 1.30;
                } else if (e > 0.83) {
                    // Volcanic summits (Aso caldera area, Kirishima peaks)
                    name = "Mountains";   color = PALETTE.mountains; speed = 0.40;
                } else if (e > 0.70) {
                    // Rugged highland terrain — inner Kyūshū ridgelines
                    name = "Highlands";   color = PALETTE.highlands; speed = 0.45;
                } else if (e > 0.56 && m > 0.60) {
                    // High-elevation sugi-cedar and broadleaf forest
                    name = "Dense Forest"; color = PALETTE.jungle;  speed = 0.30;
                } else if (e > 0.56) {
                    // Drier elevated ground — scrubby highland above rain-shadow
                    name = "Highlands";   color = PALETTE.highlands; speed = 0.45;
                } else if (m > 0.65 && e > 0.32) {
                    // Lowland forest — coastal cedar, bamboo, mixed broadleaf
                    name = "Forest";      color = PALETTE.forest;    speed = 0.40;
                } else if (m > 0.50 || e > 0.28) {
                    // Coastal and river plains — rice paddies, flat farmland.
                    // Dominant terrain around Hakata Bay and the bay-side coast.
                    name = "Plains";      color = PALETTE.meadow;    speed = 0.85;
                } else {
                    // Rain-shadow patches — rare inland scrub
                    name = "Steppes";     color = PALETTE.plains;    speed = 0.80;
                }

                tile = { name, color, speed, impassable: false, e, m };
            }

            worldMap_story1[i][j] = tile;

            bgCtx.fillStyle = tile.color;
            bgCtx.fillRect(i * TILE_SIZE, j * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    }

    // ── Decorative texture pass ──────────────────────────────────────────────
    await setLoading(68, "Painting cedar forests and clan banners…");

    for (let j = 0; j < ROWS; j++) {
        for (let i = 0; i < COLS; i++) {
            const tile = worldMap_story1[i][j];
            if (!tile || tile.impassable) continue;

            const px = i * TILE_SIZE;
            const py = j * TILE_SIZE;
            const nx = i / COLS;
            const ny = j / ROWS;

            // ── Dense Forest: heavy sugi/bamboo canopy blobs ─────────────────
            if (tile.name === "Dense Forest") {
                if (Math.random() > (isMobile ? 0.60 : 0.45)) {
                    const seedX = hash(i, j);
                    const seedY = hash(j + 7, i + 3);
                    const cx_t  = px + TILE_SIZE * 0.5 + (seedX - 0.5) * TILE_SIZE * 1.4;
                    const cy_t  = py + TILE_SIZE * 0.5 + (seedY - 0.5) * TILE_SIZE * 1.4;
                    const sz    = TILE_SIZE * (0.40 + Math.random() * 0.35);

                    // Dark inner canopy
                    bgCtx.fillStyle = `rgba(${14 + Math.random()*8|0},${38 + Math.random()*10|0},12,0.72)`;
                    bgCtx.beginPath();
                    bgCtx.arc(cx_t, cy_t, sz, 0, Math.PI * 2);
                    bgCtx.fill();

                    // Lighter dome highlight
                    bgCtx.fillStyle = "rgba(28,55,16,0.38)";
                    bgCtx.beginPath();
                    bgCtx.arc(cx_t - sz * 0.14, cy_t - sz * 0.18, sz * 0.58, 0, Math.PI * 2);
                    bgCtx.fill();
                }
            }

            // ── Forest: cedar canopy blobs ────────────────────────────────────
            if (tile.name === "Forest") {
                if (Math.random() > (isMobile ? 0.78 : 0.68)) {
                    const seedX = hash(i, j);
                    const seedY = hash(j, i);
                    const cx_t  = px + TILE_SIZE * 0.5 + (seedX - 0.5) * TILE_SIZE * 1.2;
                    const cy_t  = py + TILE_SIZE * 0.5 + (seedY - 0.5) * TILE_SIZE * 1.2;
                    const sz    = TILE_SIZE * (0.38 + Math.random() * 0.28);

                    bgCtx.fillStyle = `rgba(${28 + Math.random()*12|0},${55 + Math.random()*12|0},20,0.60)`;
                    bgCtx.beginPath();
                    bgCtx.arc(cx_t, cy_t, sz, 0, Math.PI * 2);
                    bgCtx.fill();

                    if (Math.random() > 0.55) {
                        bgCtx.fillStyle = "rgba(58,82,34,0.28)";
                        bgCtx.beginPath();
                        bgCtx.arc(cx_t - sz * 0.15, cy_t - sz * 0.2, sz * 0.52, 0, Math.PI * 2);
                        bgCtx.fill();
                    }
                }
            }

            // ── Highlands: textured ridge strokes ─────────────────────────────
            if (tile.name === "Highlands") {
                if (Math.random() > (isMobile ? 0.60 : 0.48)) {
                    const bx = px + Math.random() * TILE_SIZE;
                    const by = py + Math.random() * TILE_SIZE;
                    const bw = TILE_SIZE * (0.18 + Math.random() * 0.22);
                    const bh = TILE_SIZE * (0.10 + Math.random() * 0.14);
                    bgCtx.fillStyle = "rgba(0,0,0,0.12)";
                    bgCtx.beginPath();
                    bgCtx.ellipse(bx, by, bw, bh, Math.random() * Math.PI, 0, Math.PI * 2);
                    bgCtx.fill();
                }
                // Sparse highland tree blobs
                if (Math.random() > 0.92) {
                    bgCtx.fillStyle = "rgba(40,58,24,0.45)";
                    bgCtx.beginPath();
                    bgCtx.arc(
                        px + TILE_SIZE * (0.3 + Math.random() * 0.4),
                        py + TILE_SIZE * (0.3 + Math.random() * 0.4),
                        TILE_SIZE * 0.28, 0, Math.PI * 2
                    );
                    bgCtx.fill();
                }
            }

            // ── Mountains: layered peak silhouettes ───────────────────────────
            if (tile.name === "Mountains") {
                if (hash(i, j) > (isMobile ? 0.988 : 0.980)) {
                    const sz  = TILE_SIZE * (2.0 + Math.random() * 1.6);
                    const mpx = px + TILE_SIZE * 0.5;
                    const mpy = py + TILE_SIZE * 0.5;

                    bgCtx.save();
                    bgCtx.globalAlpha = 0.55 + Math.random() * 0.20;

                    // Shadow ridge
                    bgCtx.fillStyle = "#1a1008";
                    bgCtx.beginPath();
                    bgCtx.moveTo(mpx - sz * 0.55, mpy);
                    bgCtx.lineTo(mpx + sz * 0.16,  mpy - sz * 1.05);
                    bgCtx.lineTo(mpx + sz * 0.55, mpy);
                    bgCtx.closePath();
                    bgCtx.fill();

                    // Main peak face
                    bgCtx.fillStyle = "#2a1e10";
                    bgCtx.beginPath();
                    bgCtx.moveTo(mpx - sz * 0.40, mpy);
                    bgCtx.lineTo(mpx - sz * 0.18, mpy - sz * 0.72);
                    bgCtx.lineTo(mpx,              mpy - sz * 1.10);
                    bgCtx.lineTo(mpx + sz * 0.18,  mpy - sz * 0.72);
                    bgCtx.lineTo(mpx + sz * 0.40, mpy);
                    bgCtx.closePath();
                    bgCtx.fill();

                    bgCtx.restore();
                }
            }

            // ── Plains: rice-paddy field tufts ────────────────────────────────
            if (tile.name === "Plains" && Math.random() > 0.80) {
                bgCtx.fillStyle = "#3d5228";
                bgCtx.beginPath();
                bgCtx.arc(
                    px + TILE_SIZE / 2, py + TILE_SIZE / 2,
                    TILE_SIZE * 0.42, 0, Math.PI, true
                );
                bgCtx.fill();
            }

            // ── Steppes: sparse scrub dots ────────────────────────────────────
            if (tile.name === "Steppes" && Math.random() > 0.85) {
                bgCtx.fillStyle = "rgba(0,0,0,0.06)";
                bgCtx.beginPath();
                bgCtx.arc(
                    px + TILE_SIZE * 0.5, py + TILE_SIZE * 0.5,
                    TILE_SIZE * 0.30, 0, Math.PI * 2
                );
                bgCtx.fill();
            }
        }
    }

    // ── Ocean-depth radial vignette ───────────────────────────────────────────
    // Darkens the open sea edges; leaves the Hakata Bay area lighter.
    const vGrad = bgCtx.createRadialGradient(
        WORLD_WIDTH * 0.50, WORLD_HEIGHT * 0.50, WORLD_WIDTH * 0.25,
        WORLD_WIDTH * 0.50, WORLD_HEIGHT * 0.50, WORLD_WIDTH * 0.78
    );
    vGrad.addColorStop(0, "rgba(0,0,0,0.00)");
    vGrad.addColorStop(1, "rgba(0,0,0,0.22)");
    bgCtx.fillStyle = vGrad;
    bgCtx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
}
const FIXED_SETTLEMENTS_story1 = [

    // ── MAJOR CITIES & FORTRESSES (Inland / Deep South) ───────────────────────
    { 
        name: "Hakata", 
        nx: 0.510, ny: 0.520, // Central anchor (Stays the same)
        type: "MAJOR_CITY", size: 40, 
        pop: 12000, faction: "Kamakura Shogunate" 
    },
    { 
        name: "Mizuki", 
        nx: 0.570, ny: 0.900, // Pushed further southeast
        type: "FORTRESS", size: 30, 
        pop: 9000, faction: "Kamakura Shogunate" 
    },
    { 
        name: "Dazaifu", 
        nx: 0.620, ny: 0.980, // Math was 1.240; Capped to 0.980 to prevent falling off the map
        type: "MAJOR_CITY", size: 35, 
        pop: 10500, faction: "Kamakura Shogunate" 
    },

    // ── COASTAL DEFENSE VILLAGES (West to East along the bay) ─────────────────
    { 
        name: "Imazu", 
        nx: 0.100, ny: 0.480, // Pushed far west
        type: "VILLAGE", size: 15, 
        pop: 1500, faction: "Kamakura Shogunate" 
    },
    { 
        name: "Nishijin", 
        nx: 0.250, ny: 0.570, // Spread further west from Hakata
        type: "VILLAGE", size: 12, 
        pop: 1200, faction: "Kamakura Shogunate" 
    },
    { 
        name: "Sohara", 
        nx: 0.280, ny: 0.650, // Pushed further southwest
        type: "VILLAGE", size: 12, 
        pop: 1200, faction: "Kamakura Shogunate" 
    },
    { 
        name: "Hakozaki", 
        nx: 0.670, ny: 0.550, // Pushed further east
        type: "TOWN", size: 22, 
        pop: 4500, faction: "Kamakura Shogunate" 
    },


    // ── INLAND SUPPORT (Scattered Villages behind the beach) ──────────────────
    { 
        name: "Torikai", 
        nx: 0.350, ny: 0.570, // Shifted west
        type: "VILLAGE", size: 10, 
        pop: 800, faction: "Kamakura Shogunate" 
    },
    { 
        name: "Akasaka", 
        nx: 0.430, ny: 0.540, // Shifted slightly west
        type: "VILLAGE", size: 10, 
        pop: 800, faction: "Kamakura Shogunate" 
    }
];
// ── Helper: snap pixel coord to nearest valid land tile ───────────────────────
// If the precise coordinate lands on water, spirals outward up to 12 tiles.
function _s1SnapToLand(px, py) {
    const gX = Math.floor(px / TILE_SIZE);
    const gY = Math.floor(py / TILE_SIZE);

    const _valid = (gx, gy) => {
        const t = worldMap_story1[gx]?.[gy];
        return t && !t.impassable
            && t.name !== "Ocean"
            && t.name !== "Coastal"
            && t.name !== "River";
    };

    if (_valid(gX, gY)) {
        return { x: gX * TILE_SIZE + TILE_SIZE * 0.5,
                 y: gY * TILE_SIZE + TILE_SIZE * 0.5 };
    }

    // Spiral search
    for (let r = 1; r <= 12; r++) {
        for (let di = -r; di <= r; di++) {
            for (let dj = -r; dj <= r; dj++) {
                if (Math.abs(di) !== r && Math.abs(dj) !== r) continue; // border only
                if (_valid(gX + di, gY + dj)) {
                    return {
                        x: (gX + di) * TILE_SIZE + TILE_SIZE * 0.5,
                        y: (gY + dj) * TILE_SIZE + TILE_SIZE * 0.5
                    };
                }
            }
        }
    }
    return null; // no land nearby — caller skips this settlement
}
function populateCities_story1() {
    console.log("[Story1] Founding historical garrison towns…");

    // ── SURGERY: Replace Phase 1 & 2 with this ────────────────────────────────────
    cities_story1 = []; // Hard-wipe any existing data

    // Run your custom coordinate-based roster
    populateHistoricalCities_story1(); 

    // SURGERY: The BAN_RADIUS code has been DELETED here. 
    // You placed the cities manually, so we don't want the engine auto-deleting them!
}
// =============================================================================
// ENTRY POINT
// =============================================================================
window.initGame_story1 = async function () {

    if (window.__gameStarted) return;
    window.__gameStarted = true;

    console.log("[Story1] 🏯 Launching Bun'ei Invasion — Northern Kyūshū, 1274…");

    // Lock GUI into pre-gunpowder / feudal Japan mode
    if (typeof troopGUI !== 'undefined') {
        troopGUI.enableStory1Mode();
    }

    // ── 1. Swap factions to the four historical groups ───────────────────────
    if (typeof applyStory1Factions === 'function') {
        applyStory1Factions();
    } else {
        console.error("[Story1] applyStory1Factions() not found — load npc_systems_story1.js first!");
    }

    // ── 2. Generate island terrain (polygon-based, fully plotted) ────────────
    await generateMap_story1();

    // ── 3. Place settlements ─────────────────────────────────────────────────
    await setLoading(76, "Founding clan strongholds and garrison towns…");
    populateCities_story1();

    // ── 4. Swap story1 data INTO shared engine arrays ────────────────────────
    worldMap.length = 0;
    worldMap_story1.forEach((col, i) => { worldMap[i] = col; });

    cities.length = 0;
    cities_story1.forEach(c => cities.push(c));

    if (typeof worldMapRef !== 'undefined') worldMapRef = worldMap;

    // ── 5. Spawn NPC armies ──────────────────────────────────────────────────
    await setLoading(86, "Deploying clan armies and the Yuan fleet…");
    if (typeof initializeNPCs === 'function') {
        initializeNPCs(cities, worldMap, TILE_SIZE, COLS, ROWS,
                       PADDING_X_story1, PADDING_Y_story1);
    }

    // ── 6. Boot city interiors (city_system.js) ──────────────────────────────
    await setLoading(93, "Building castles, shrines, and markets…");
    if (typeof initAllCities === 'function') {
        await initAllCities(FACTIONS);
    }

    // ── 7. Place player near Hakata — the bay defence front ─────────────────
    // Prefer Hakata, else any Kamakura city on valid land.
    const startCity =
        cities.find(c => c.name === "Hakata") ||
        cities.find(c => {
            if (_S1_NO_CITY_FACTIONS.has(c.faction)) return false;
            const gx = Math.floor(c.x / TILE_SIZE);
            const gy = Math.floor(c.y / TILE_SIZE);
            return worldMap[gx]?.[gy] && !worldMap[gx][gy].impassable;
        });

    if (startCity) {
        player.x = startCity.x + 120;
        player.y = startCity.y + 120;
    } else {
        player.x = WORLD_WIDTH  * 0.50;
        player.y = WORLD_HEIGHT * 0.35;
    }

player.faction = "Kamakura Shogunate";
    player.enemies = ["Yuan Dynasty Coalition", "Bandits"];
    
    // Apply the localized Japanese economy
    if (typeof applyStory1Economy === 'function') {
        applyStory1Economy();
    }
    // ── 8. Show game UI ──────────────────────────────────────────────────────
    document.getElementById('ui').style.display      = 'block';
    document.getElementById('loading').style.display = 'none';

    if (typeof window.hideLoadingScreen === 'function') {
        window.hideLoadingScreen();
    }

    if (typeof window.showDiplomacyContainer === 'function') {
        window.showDiplomacyContainer();
    } else {
        const dipEl = document.getElementById('diplomacy-container');
        if (dipEl) dipEl.style.display = 'block';
    }

    // ── 9. Start shared render loop ──────────────────────────────────────────
    if (typeof draw === 'function') {
        draw();
    } else {
        console.error("[Story1] draw() not found — ensure sandbox_overworld.js is loaded.");
    }

    logGameEvent(
        "🏯 1274 — The Yuan fleet has been sighted off Genkai Island. " +
        "Defend Hakata Bay or the clans of Kyūshū will fall.",
        "general"
    );
    console.log("[Story1] ✅ Bun'ei Invasion initialised successfully.");
};