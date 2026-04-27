// ============================================================================
// WORLD MAP SYSTEM — world_map.js
// Terrain generation nearly identical to sandbox_overworld.js.
// NO cities. NO NPCs. NO city names.
// Close button: TOP LEFT corner.
// ============================================================================

(function () {
	
    "use strict";

    // ── WORLD MAP SCALE CONSTANTS ─────────────────────────────────────────────
    // Tile size is 1/4 of sandbox's TILE_SIZE (16), giving a crisp zoomed-out render.
    const WM_TILE_SIZE = 4;
    const WM_COLS      = 240;           // equivalent to MAP_COLS
    const WM_ROWS      = 180;           // equivalent to MAP_ROWS
    const DISPLAY_W    = WM_COLS * WM_TILE_SIZE; // 960
    const DISPLAY_H    = WM_ROWS * WM_TILE_SIZE; // 720

    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent)
                   || window.innerWidth < 900;

    // ── MODULE STATE ──────────────────────────────────────────────────────────
    let cachedBgCanvas    = null;
    let overlayEl         = null;
    let mainCanvas        = null;
    let mainCtx           = null;
    let drawerObserver    = null;
    let autoCloseTimeout  = null;
    let countdownInterval = null;
    let secondsLeft       = 10;
// --- ZOOM & PAN STATE ---
    let mapCam = { x: 0, y: 0, zoom: 1 };
    let isPanning = false;
    let lastMousePos = { x: 0, y: 0 };
    let lastPinchDist = 0;
	
    // ── RIVER COORDINATE ARRAYS (Identical to sandbox_overworld.js) ───────────
    // Hardcoded percentages [x, y] in world-space [0..1]

    const YELLOW_RIVER_COORDS = [
        // Origin in the West (Higher up/North)
        [0.060, 0.560], [0.066, 0.558], [0.072, 0.556], [0.078, 0.554], [0.084, 0.552],
        [0.090, 0.550], [0.096, 0.548], [0.102, 0.546], [0.108, 0.544], [0.114, 0.542],
        // First small dip south
        [0.120, 0.540], [0.122, 0.548], [0.124, 0.556], [0.126, 0.564], [0.128, 0.572],
        [0.130, 0.575], [0.132, 0.577], [0.134, 0.579], [0.136, 0.580], [0.140, 0.580],
        // Flowing East before the sharp turn
        [0.145, 0.580], [0.150, 0.580], [0.155, 0.580], [0.160, 0.580], [0.165, 0.580],
        [0.170, 0.580], [0.175, 0.580], [0.180, 0.580], [0.185, 0.580], [0.190, 0.580],
        // Sharp turn North
        [0.192, 0.567], [0.194, 0.554], [0.196, 0.541], [0.198, 0.528], [0.200, 0.515],
        [0.202, 0.502], [0.204, 0.489], [0.206, 0.476], [0.208, 0.463], [0.210, 0.450],
        // Flowing East towards the Ordos Loop
        [0.217, 0.449], [0.224, 0.448], [0.231, 0.447], [0.238, 0.446], [0.245, 0.445],
        [0.252, 0.444], [0.259, 0.443], [0.266, 0.442], [0.273, 0.441], [0.280, 0.440],
        // The massive climb North (Left leg of the Ordos Loop)
        [0.286, 0.426], [0.292, 0.412], [0.298, 0.398], [0.304, 0.384], [0.310, 0.370],
        [0.316, 0.356], [0.322, 0.342], [0.328, 0.328], [0.334, 0.314], [0.340, 0.300],
        [0.345, 0.290], [0.350, 0.280],
        // The top of the Ordos Loop (Flowing East)
        [0.358, 0.281], [0.366, 0.282], [0.374, 0.283], [0.382, 0.284], [0.390, 0.285],
        [0.398, 0.286], [0.406, 0.287], [0.414, 0.288], [0.422, 0.289], [0.430, 0.290],
        [0.435, 0.290], [0.440, 0.290],
        // Plunging straight back South (Right leg of the loop)
        [0.439, 0.309], [0.438, 0.328], [0.437, 0.347], [0.436, 0.366], [0.435, 0.385],
        [0.434, 0.404], [0.433, 0.423], [0.432, 0.442], [0.431, 0.461], [0.430, 0.480],
        // Hooking Eastward towards the coast
        [0.434, 0.482], [0.438, 0.484], [0.442, 0.486], [0.446, 0.488], [0.450, 0.490],
        [0.454, 0.492], [0.458, 0.494], [0.462, 0.496], [0.466, 0.498], [0.470, 0.500],
        // Final stretch emptying into the Yellow Sea
        [0.478, 0.494], [0.486, 0.488], [0.494, 0.482], [0.502, 0.476], [0.510, 0.470],
        [0.518, 0.464], [0.526, 0.458], [0.534, 0.452], [0.542, 0.446], [0.550, 0.440],
        [0.558, 0.446], [0.566, 0.452], [0.574, 0.458], [0.582, 0.464], [0.590, 0.470]
    ];

    const YANGTZE_RIVER_COORDS = [
        // Origin in the West (Starts further West and South of Yellow River)
        [0.020, 0.650], [0.027, 0.649], [0.034, 0.648], [0.041, 0.647], [0.048, 0.646],
        [0.055, 0.645], [0.062, 0.644], [0.069, 0.643], [0.076, 0.642], [0.083, 0.641],
        [0.090, 0.640], [0.100, 0.640],
        // The massive dip South-East
        [0.104, 0.649], [0.108, 0.658], [0.112, 0.667], [0.116, 0.676], [0.120, 0.685],
        [0.124, 0.694], [0.128, 0.703], [0.132, 0.712], [0.136, 0.721], [0.140, 0.730],
        [0.145, 0.740], [0.150, 0.750],
        // Reaching the deepest point in the South
        [0.156, 0.758], [0.162, 0.766], [0.168, 0.774], [0.174, 0.782], [0.180, 0.790],
        [0.186, 0.798], [0.192, 0.806], [0.198, 0.814], [0.204, 0.822], [0.210, 0.830],
        [0.215, 0.840], [0.220, 0.850],
        // Curving back North-East
        [0.226, 0.846], [0.232, 0.842], [0.238, 0.838], [0.244, 0.834], [0.250, 0.830],
        [0.256, 0.826], [0.262, 0.822], [0.268, 0.818], [0.274, 0.814], [0.280, 0.810],
        [0.290, 0.805], [0.300, 0.800],
        // Continuing North-East towards central plains
        [0.308, 0.796], [0.316, 0.792], [0.324, 0.788], [0.332, 0.784], [0.340, 0.780],
        [0.348, 0.776], [0.356, 0.772], [0.364, 0.768], [0.372, 0.764], [0.380, 0.760],
        [0.390, 0.760], [0.400, 0.760],
        // Flattening out and flowing straight East
        [0.407, 0.760], [0.414, 0.760], [0.421, 0.760], [0.428, 0.760], [0.435, 0.760],
        [0.442, 0.760], [0.449, 0.760], [0.456, 0.760], [0.463, 0.760], [0.470, 0.760],
        [0.475, 0.760], [0.480, 0.760],
        // Final slight curve North-East to the sea
        [0.485, 0.757], [0.490, 0.754], [0.495, 0.751], [0.500, 0.748], [0.505, 0.745],
        [0.510, 0.742], [0.515, 0.739], [0.520, 0.736], [0.525, 0.733], [0.530, 0.730],
        // Empty into sea
        [0.533, 0.729], [0.536, 0.728], [0.539, 0.727], [0.542, 0.726], [0.545, 0.725],
        [0.548, 0.724], [0.551, 0.723], [0.554, 0.722], [0.557, 0.721], [0.560, 0.720],
        [0.563, 0.723], [0.566, 0.726], [0.569, 0.729], [0.572, 0.732], [0.575, 0.735],
        [0.578, 0.738], [0.581, 0.741], [0.584, 0.744], [0.587, 0.747], [0.590, 0.750],
        [0.593, 0.753], [0.596, 0.756]
    ];

    const TIBET_RIVER_A = [
        // Source: Deep South-West winding North-East
        [0.005, 0.980], [0.008, 0.970], [0.012, 0.962], [0.015, 0.950], [0.018, 0.935],
        [0.020, 0.920], [0.022, 0.905], [0.025, 0.890], [0.028, 0.875], [0.030, 0.860],
        [0.032, 0.845], [0.035, 0.830], [0.038, 0.815], [0.040, 0.800], [0.042, 0.785],
        [0.045, 0.770], [0.048, 0.760], [0.052, 0.755], [0.056, 0.748], [0.062, 0.740],
        [0.070, 0.730], [0.080, 0.720], [0.090, 0.710], [0.100, 0.700], [0.110, 0.692],
        [0.120, 0.685]
    ];

    const TIBET_RIVER_B = [
        // Source: Extreme bottom edge winding toward Central Yangtze
        [0.020, 0.995], [0.025, 0.985], [0.030, 0.975], [0.035, 0.965], [0.040, 0.955],
        [0.045, 0.945], [0.050, 0.935], [0.055, 0.925], [0.060, 0.915], [0.065, 0.905],
        [0.070, 0.895], [0.075, 0.885], [0.080, 0.875], [0.085, 0.865], [0.090, 0.855],
        [0.095, 0.845], [0.100, 0.835], [0.110, 0.830], [0.120, 0.825], [0.130, 0.820],
        [0.140, 0.815], [0.150, 0.810], [0.160, 0.805], [0.170, 0.798], [0.175, 0.794],
        [0.180, 0.790]
    ];

    const TIBET_RIVER_C = [
        // Source: Bottom-left corner winding along the lower map boundary
        [0.001, 0.999], [0.010, 0.995], [0.020, 0.990], [0.030, 0.985], [0.040, 0.980],
        [0.050, 0.975], [0.060, 0.970], [0.070, 0.965], [0.080, 0.960], [0.090, 0.955],
        [0.100, 0.950], [0.110, 0.945], [0.120, 0.940], [0.130, 0.935], [0.140, 0.930],
        [0.150, 0.920], [0.160, 0.910], [0.170, 0.900], [0.180, 0.890], [0.190, 0.880],
        [0.200, 0.870], [0.210, 0.860], [0.215, 0.855], [0.220, 0.850]
    ];

    // ── TERRAIN PALETTE (Identical to sandbox_overworld.js) ───────────────────
    const PALETTE = {
        ocean:     "#2b4a5f", coastal:   "#3a5f75",
        desert:    "#bfa373", dune:      "#cfae7e",
        plains:    "#a3a073", meadow:    "#6b7a4a",
        forest:    "#425232", jungle:    "#244222",
        highlands: "#626b42", mountains: "#3E2723", snow: "#7B5E3F"
    };

    // ── NOISE / FBM (Identical to sandbox_overworld.js) ───────────────────────
    const FBM_OCTAVES = isMobile ? 4 : 6;

    function hash(x, y) {
        let n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
        return n - Math.floor(n);
    }

    function noise(x, y) {
        let ix = Math.floor(x), iy = Math.floor(y);
        let fx = x - ix, fy = y - iy;
        let ux = fx * fx * (3.0 - 2.0 * fx), uy = fy * fy * (3.0 - 2.0 * fy);
        let n00 = hash(ix,     iy),     n10 = hash(ix + 1, iy);
        let n01 = hash(ix,     iy + 1), n11 = hash(ix + 1, iy + 1);
        let nx0 = n00 * (1 - ux) + n10 * ux;
        let nx1 = n01 * (1 - ux) + n11 * ux;
        return nx0 * (1 - uy) + nx1 * uy;
    }

    function fbm(x, y, octaves = FBM_OCTAVES) {
        let value = 0, amplitude = 0.5, frequency = 1;
        for (let i = 0; i < octaves; i++) {
            value     += amplitude * noise(x * frequency, y * frequency);
            frequency *= 2;
            amplitude *= 0.5;
        }
        return value;
    }

    // ── MATH HELPERS (Identical to sandbox_overworld.js) ──────────────────────
    function smoothstep(edge0, edge1, x) {
        let t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }

    function getDistanceToSegment(px, py, x1, y1, x2, y2) {
        let A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
        let dot = A * C + B * D;
        let len_sq = C * C + D * D;
        let param = (len_sq !== 0) ? dot / len_sq : -1;
        let xx, yy;
        if      (param < 0) { xx = x1; yy = y1; }
        else if (param > 1) { xx = x2; yy = y2; }
        else                { xx = x1 + param * C; yy = y1 + param * D; }
        return Math.sqrt((px - xx) * (px - xx) + (py - yy) * (py - yy));
    }

    function checkHardcodedRiver(x, y, riverArray, thickness) {
        for (let k = 0; k < riverArray.length - 1; k++) {
            let p1 = riverArray[k], p2 = riverArray[k + 1];
            if (getDistanceToSegment(x, y, p1[0], p1[1], p2[0], p2[1]) < thickness) return true;
        }
        return false;
    }

    // ── JOYSTICK TOGGLE ───────────────────────────────────────────────────────
    function toggleJoysticks(show) {
        const joysticks = document.querySelectorAll('#joystick-zone, #nipple-container, .joystick-container, #mobile-controls');
        joysticks.forEach(el => { el.style.display = show ? '' : 'none'; });
    }

    // ── TEXTURE DRAW HELPERS (Adapted from sandbox_overworld.js) ─────────────
    // These accept a ctx + pixel coords and draw at WM_TILE_SIZE scale.

    function drawHighlandTree(ctx, x, y, color, scale) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x + WM_TILE_SIZE / 2, y + WM_TILE_SIZE / 2, WM_TILE_SIZE * scale, 0, Math.PI, true);
        ctx.fill();
    }

    function drawHighlandBump(ctx, px, py, size) {
        let bumpX = px + (Math.random() * size);
        let bumpY = py + (size * 0.8);
        let bumpW = size * (0.5 + Math.random() * 0.5);
        let bumpH = bumpW * 0.4;
        ctx.fillStyle = `rgba(0, 0, 0, ${0.08 + Math.random() * 0.08})`;
        ctx.beginPath();
        ctx.ellipse(bumpX, bumpY, bumpW, bumpH, 0, 0, Math.PI, true);
        ctx.fill();
    }

    function getMountainAlpha(size, tileSize) {
        let t = Math.max(0, Math.min(1, size / (tileSize * 2.0)));
        let alpha = 0.78 + (t * 0.18);
        alpha += (Math.random() * 0.08) - 0.04;
        return Math.max(0.72, Math.min(0.98, alpha));
    }

    function drawMountain(ctx, x, y, width, height, tileSize) {
        const alpha = getMountainAlpha(height, tileSize);
        // Brown backfill
        ctx.fillStyle = `rgba(62, 52, 42, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(x - width / 2, y + tileSize);
        ctx.quadraticCurveTo(x, y + tileSize - (height * 1.4), x + width / 2, y + tileSize);
        ctx.fill();
        // Lighter brown top layer
        ctx.fillStyle = `rgba(117, 102, 84, ${Math.min(0.98, alpha + 0.02)})`;
        for (let b = 0; b < 2; b++) {
            let shift  = (b - 0.5) * (width * 0.3);
            let bWidth = width * 0.6;
            let bHeight = height * 0.7;
            ctx.beginPath();
            ctx.moveTo(x + shift - bWidth / 2, y + tileSize);
            ctx.quadraticCurveTo(x + shift, y + tileSize - bHeight, x + shift + bWidth / 2, y + tileSize);
            ctx.fill();
        }
        ctx.strokeStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.05})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x - width / 2, y + tileSize);
        ctx.quadraticCurveTo(x, y + tileSize - (height * 1.4), x + width / 2, y + tileSize);
        ctx.stroke();
    }

    function drawSnowyPeak(ctx, x, y, width, height, isExtremePeak, tileSize) {
        const alpha = getMountainAlpha(height, tileSize);
        if (alpha <= 0) return;
        const sW = width * 0.25;
        const sH = height * 0.25;
        // 1. THE JAGGED BASE
        ctx.fillStyle = `rgba(100, 115, 140, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(x - sW / 2, y + tileSize);
        ctx.lineTo(x - sW * 0.25, y + tileSize - sH * 0.4);
        ctx.lineTo(x, y + tileSize - sH * 1.4);
        ctx.lineTo(x + sW * 0.25, y + tileSize - sH * 0.4);
        ctx.lineTo(x + sW / 2, y + tileSize);
        ctx.fill();
        // 2. THE SNOW CAP
        ctx.fillStyle = isExtremePeak
            ? `rgba(255, 255, 255, ${Math.min(1, alpha + 0.1)})`
            : `rgba(220, 235, 245, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(x, y + tileSize - sH * 1.4);
        ctx.lineTo(x - sW * 0.15, y + tileSize - sH * 0.7);
        ctx.lineTo(x - sW * 0.05, y + tileSize - sH * 0.8);
        ctx.lineTo(x + sW * 0.08, y + tileSize - sH * 0.65);
        ctx.lineTo(x + sW * 0.15, y + tileSize - sH * 0.7);
        ctx.closePath();
        ctx.fill();
        // 3. THE COLD SHADOW
        ctx.fillStyle = `rgba(0, 20, 50, ${alpha * 0.15})`;
        ctx.beginPath();
        ctx.moveTo(x, y + tileSize - sH * 1.4);
        ctx.lineTo(x + sW * 0.25, y + tileSize - sH * 0.4);
        ctx.lineTo(x + sW / 2, y + tileSize);
        ctx.lineTo(x, y + tileSize);
        ctx.fill();
        // 4. CRISP OUTLINE
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.3})`;
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.moveTo(x - sW / 2, y + tileSize);
        ctx.lineTo(x - sW * 0.25, y + tileSize - sH * 0.4);
        ctx.lineTo(x, y + tileSize - sH * 1.4);
        ctx.lineTo(x + sW * 0.25, y + tileSize - sH * 0.4);
        ctx.lineTo(x + sW / 2, y + tileSize);
        ctx.stroke();
    }

    // ── TERRAIN BACKGROUND GENERATION ─────────────────────────────────────────
    // Identical terrain logic to sandbox_overworld.js generateMap().
    // Adapted: WM_COLS/WM_ROWS/WM_TILE_SIZE instead of COLS/ROWS/TILE_SIZE.
    // No cities. No NPCs.
    function renderTerrainBg() {
        if (cachedBgCanvas) return;

        const bgCanvas = document.createElement('canvas');
        bgCanvas.width  = DISPLAY_W;
        bgCanvas.height = DISPLAY_H;
        const bgCtx = bgCanvas.getContext('2d', { alpha: false });

        // Local tile array for texture passes (mirrors sandbox's worldMap)
        const wmMap = [];

        // ======================================================
        // PASS 1 — TILE COLOUR GENERATION
        // (All terrain-sculpting math identical to sandbox generateMap)
        // ======================================================
        for (let i = 0; i < WM_COLS; i++) {
            wmMap[i] = [];
            for (let j = 0; j < WM_ROWS; j++) {
                let nx = i / WM_COLS;
                let ny = j / WM_ROWS;

                let isMacroRiver = false;

                // --- DOMAIN WARPING ---
                let warpX = nx + (fbm(nx * 10, ny * 10) - 0.5) * 0.12;
                let warpY = ny + (fbm(nx * 10 + 15, ny * 10 + 15) - 0.5) * 0.12;

                let himalayaMask = Math.max(0, 1.2 - Math.hypot((warpX - 0.15) * 2, (warpY - 0.65) * 1.5) * 2.5);
                let yunnanMask   = Math.max(0, 1.0 - Math.hypot((warpX - 0.45) * 2, (warpY - 0.75) * 2) * 3.0);
                let regionalMountainStrength = himalayaMask + (yunnanMask * 0.6);

                // --- 1. BASE CONTINENTAL NOISE ---
                let e = Math.pow(fbm(warpX * 3.5, warpY * 3.5) * 2.2, 1.3) * 0.22;
                e += fbm(warpX * 25, warpY * 25) * 0.03;
                let m = fbm(warpX * 4 + 10, warpY * 4 + 10);
                m += (0.6 - warpY) * 0.2;
                m += warpX * 0.15;

                // --- 2. MAINLAND MASS & COASTLINES ---
                let coastNoise    = (fbm(warpX * 12, warpY * 12) - 0.5) * 0.15;
                let mainlandCoast = 0.70 + (fbm(warpY * 4, 0) - 0.5) * 0.25 + coastNoise;
                let mainlandMask  = 1.0 - smoothstep(mainlandCoast - 0.1, mainlandCoast + 0.1, warpX);
                if (warpX < mainlandCoast + 0.15) {
                    e += mainlandMask * 0.40;
                }

                // --- 4. ORGANIC TARIM BASIN & TAKLAMAKAN DESERT ---
                let tarimDistortion = fbm(warpX * 10, warpY * 10) * 0.08;
                let tarimDist = Math.hypot((warpX - 0.18) * 1.8, (warpY - 0.38)) - tarimDistortion;
                if (tarimDist < 0.16) {
                    let basinDepth = smoothstep(0.16, 0.0, Math.max(0, tarimDist));
                    e -= basinDepth * 0.15;
                    m -= basinDepth * 0.6;
                    let ring = smoothstep(0.16, 0.10, tarimDist) * smoothstep(0.06, 0.10, tarimDist);
                    e += ring * 0.25;
                }

                // --- 5. SICHUAN BASIN ---
                let sichuanNoise  = fbm(warpX * 12, warpY * 12) * 0.04;
                let distToSichuan = Math.hypot((warpX - 0.42), (warpY - 0.62)) - sichuanNoise;
                if (distToSichuan < 0.10) {
                    let basinDepth   = smoothstep(0.10, 0.0, distToSichuan);
                    let targetBasinE = 0.42 + (fbm(warpX * 20, warpY * 20) * 0.05);
                    e = (e * (1 - basinDepth)) + (targetBasinE * basinDepth);
                    m = Math.max(m, 0.65 * basinDepth);
                    let ringWidth = 0.03;
                    let ringDist  = Math.abs(distToSichuan - 0.09);
                    if (ringDist < ringWidth) {
                        let ringLift = smoothstep(ringWidth, 0.0, ringDist);
                        e += ringLift * 0.15;
                    }
                }

                // Eastern China moisture
                if (warpX > 0.45 && warpX < 0.65 && warpY > 0.45 && warpY < 0.65) {
                    m = Math.max(m, 0.45);
                }

                // Remove river / fill valley
                if (warpY > 0.55 && warpY < 0.90 && warpX > 0.38 && warpX < 0.48) {
                    let riverGap = Math.abs(warpX - 0.43);
                    if (riverGap < 0.05) {
                        e = Math.max(e, 0.45 + (fbm(warpX * 12, warpY * 12) * 0.08));
                    }
                }

                // --- 6 & 7. NORTHERN TRANSITION: XINJIANG TO MANCHURIA ---
                if (warpY < 0.50) {
                    // A. TIAN SHAN / ALTAI MOUNTAINS
                    let mountainStrike = Math.abs((warpX * 2.0 + warpY) - 0.55);
                    if (mountainStrike < 0.12 && warpX < 0.35) {
                        let ridgeLift = smoothstep(0.12, 0.0, mountainStrike) * fbm(warpX * 18, warpY * 18);
                        e += ridgeLift * 0.30;
                        e  = Math.min(e, 0.72);
                        m += ridgeLift * 0.15;
                    }
                    // B. ORGANIC BIOME SWEEP
                    let biomeWarpX = warpX + fbm(warpX * 4, warpY * 4) * 0.12;
                    let biomeWarpY = warpY + fbm(warpX * 4 + 10, warpY * 4 + 10) * 0.12;
                    let xProgress  = Math.max(0, Math.min(1, (biomeWarpX - 0.10) / 0.80));
                    let baseM      = 0.34 + (Math.pow(xProgress, 1.45) * 0.40);
                    let patchNoise = (fbm(warpX * 15, warpY * 15) - 0.5) * 0.18;
                    m = baseM + patchNoise;
                    // C. SHAANXI RANGE
                    let shaanxiShiftX  = 0.06;
                    let shaanxiShiftY  = 0.16;
                    let sX = biomeWarpX - shaanxiShiftX;
                    let sY = biomeWarpY + shaanxiShiftY;
                    let shaanxiSpineY  = 0.16 - (sX * 0.58) + Math.sin(sX * 10) * 0.03;
                    let distToShaanxi  = Math.abs(sY - shaanxiSpineY);
                    if (distToShaanxi < 0.12 && xProgress > 0.6) {
                        let mountainLift = smoothstep(0.12, 0.0, distToShaanxi);
                        let ruggedness   = fbm(warpX * 22, warpY * 22) * 1.2;
                        // (elevation / moisture changes preserved as comments)
                    } else if (warpX < 0.6) {
                        e = Math.min(e, 0.52 + fbm(warpX * 10, warpY * 10) * 0.05);
                    }
                }

                // Lanzhou fix
                let lanzhouDist = Math.hypot((warpX - 0.36), (warpY - 0.45));
                if (lanzhouDist < 0.08) {
                    e = Math.min(e, 0.45 + (fbm(warpX * 10, warpY * 10) * 0.05));
                }

                // Northeast range deletion
                if (warpX > 0.55 && warpX < 0.80 && warpY > 0.10 && warpY < 0.40) {
                    e = Math.min(e, 0.55);
                }

                // --- TIBETAN PLATEAU & KUNLUN/QILIAN BARRIER ---
                if (warpX < 0.42 && warpY > 0.35) {
                    let barrierY = 0.40 + (warpX * 0.25) + (fbm(warpX * 12, warpY * 12) * 0.04);
                    if (warpY > barrierY) {
                        let plateauNoise = fbm(warpX * 12, warpY * 12) * 0.15;
                        e = Math.max(e, 0.65 + plateauNoise);
                        let distToBarrier = Math.abs(warpY - barrierY);
                        if (distToBarrier < 0.04) {
                            let peakNoise = Math.pow(fbm(warpX * 35, warpY * 35), 2) * 0.2;
                            e = Math.max(e, 0.71 + peakNoise);
                        }
                    } else {
                        let distNorth = barrierY - warpY;
                        if (distNorth < 0.32) {
                            let blend = 1.0 - Math.min(1.0, distNorth / 0.32);
                            let transitionMoisture = 0.15 + (blend * 0.30);
                            let transitionNoise    = fbm(warpX * 8, warpY * 8) * 0.05;
                            let foothills = 0.35 + (blend * 0.20) + transitionNoise;
                        }
                    }
                }

                // Green circle fix
                let greenCircleDist = Math.hypot((warpX - 0.34), (warpY - 0.54));
                if (greenCircleDist < 0.07) {
                    e = Math.min(e, 0.48 + (fbm(warpX * 15, warpY * 15) * 0.02));
                    m = Math.max(m, 0.45);
                }

                // Eastern China hydrology fix
                if (warpX > 0.40 && warpX < 0.90 && warpY > 0.45 && warpY < 0.80) {
                    if (e > 0.28) { e = Math.max(e, 0.36); }
                    if (warpX < 0.55 && warpY < 0.70) {
                        e = Math.min(Math.max(e, 0.36), 0.55);
                        m = Math.max(m, 0.45);
                    }
                }

                // Southern patch
                if (warpX > 0.40 && warpX < 0.60 && warpY > 0.85 && warpY < 0.95) {
                    let southernPatchNoise = fbm(warpX * 25, warpY * 25);
                    if (southernPatchNoise > 0.65) {
                        e = Math.max(e, 0.60);
                        m = Math.max(m, 0.30);
                    }
                }

                // Poyang Lake
                let poyangDist = Math.hypot((warpX - 0.57) * 1.3, (warpY - 0.65));
                if (poyangDist < 0.025) {
                    let lakeDrop = (0.025 - poyangDist) * 5.0;
                    e = Math.min(e, 0.32 - lakeDrop);
                    m = Math.max(m, 0.70);
                }

                // Surgery A: Top-Centre Plains Zone
                let plainsZoneDist = Math.pow((warpX - 0.382) / 0.106, 2) + Math.pow((warpY - 0.373) / 0.231, 2);
                if (plainsZoneDist < 1.0) {
                    let blend      = 1.0 - Math.sqrt(plainsZoneDist);
                    let plainNoise = fbm(warpX * 12, warpY * 12) * 0.05;
                    m = Math.max(m, 0.48 * blend);
                    let targetE = 0.45 + plainNoise;
                    e = (e * (1 - blend)) + (targetE * blend);
                }

                // Surgery D: Mid Lower Plains
                const minX = 0.250, maxX = 0.410;
                const minY = 0.520, maxY = 0.810;
                if (warpX > minX && warpX < maxX && warpY > minY && warpY < maxY) {
                    let edgeBlendX = Math.min(warpX - minX, maxX - warpX) * 10.0;
                    let edgeBlendY = Math.min(warpY - minY, maxY - warpY) * 10.0;
                    let blend = Math.max(0, Math.min(1.0, Math.min(edgeBlendX, edgeBlendY)));
                    if (blend > 0) {
                        let mountainCap = 0.48;
                        if (e > mountainCap) { e = (e * (1 - blend)) + (mountainCap * blend); }
                        let plainNoise = fbm(warpX * 18, warpY * 18) * 0.03;
                        let flatTarget = 0.40 + plainNoise;
                        e = (e * (1 - blend)) + (flatTarget * blend);
                        m = Math.max(m, 0.48 * blend);
                    }
                }

                // Surgery E: SW Snow Peaks
                if (warpX > 0.113 && warpX < 0.247 && warpY > 0.708 && warpY < 0.896) {
                    let edgeBlendX = Math.min(warpX - 0.113, 0.247 - warpX) * 12.0;
                    let edgeBlendY = Math.min(warpY - 0.708, 0.896 - warpY) * 12.0;
                    let blend = Math.max(0, Math.min(1.0, Math.min(edgeBlendX, edgeBlendY)));
                    if (blend > 0) {
                        let peakNoise = Math.pow(fbm(warpX * 50, warpY * 50), 2) * 0.5;
                        let snowFloor = 0.82;
                        let targetE   = snowFloor + peakNoise;
                        e = (e * (1 - blend)) + (targetE * blend);
                    }
                }

                // --- 8. PENINSULAS & EAST CHINA SEA ---
                let middleSeaDist = Math.hypot((warpX - 0.66) * 1.2, (warpY - 0.58));
                if (middleSeaDist < 0.12) { e = Math.min(e, 0.34); }
                let shandongDist = Math.hypot((warpX - 0.59) * 1.5, (warpY - 0.49));
                if (shandongDist < 0.045) {
                    let sLift = smoothstep(0.045, 0.0, shandongDist);
                    e = Math.max(e, 0.38 + sLift * 0.15);
                    m += 0.2;
                }
                let bohaiDist = Math.hypot((warpX - 0.58) * 1.8, (warpY - 0.42));
                if (bohaiDist < 0.06) { e = Math.min(e, 0.32); }
                let dalianDist = Math.hypot((warpX - 0.63) * 1.5, (warpY - 0.37));
                if (dalianDist < 0.045) {
                    let dLift = smoothstep(0.045, 0.0, dalianDist);
                    e = Math.max(e, 0.42 + dLift * 0.15);
                    m += 0.2;
                }
                let straitDist = Math.hypot((warpX - 0.615), (warpY - 0.44));
                if (straitDist < 0.055) { e = Math.min(e, 0.25); }
                if (warpY > 0.52) {
                    let strictCoast = 0.54 + (warpY - 0.52) * 0.20;
                    if (warpX > strictCoast) { e = Math.min(e, 0.28); }
                }
                if (warpY > 0.55 && warpX > 0.55 && warpX < 0.65) {
                    if (e < 0.35 && e > 0.25) { e = Math.max(e, 0.30); }
                }
                let noLandBlob = Math.hypot((warpX - 0.61), (warpY - 0.65));
                if (noLandBlob < 0.06) { e = Math.min(e, 0.25); }

                // NORTHEAST ASIA GRADUAL TRANSITION
                if (warpY < 0.45) {
                    let blendStart  = 0.45, blendEnd = 0.60;
                    let forestBlend = Math.max(0, Math.min(1, (warpX - blendStart) / (blendEnd - blendStart)));
                    if (forestBlend > 0) {
                        let neNoise         = fbm(warpX * 12, warpY * 12);
                        let targetElevation = 0.42 + neNoise * 0.12;
                        e = e * (1 - forestBlend) + Math.max(e, targetElevation) * forestBlend;
                        m += forestBlend * 0.5;
                        regionalMountainStrength *= (1 - forestBlend);
                        if (forestBlend > 0.8 && e > 0.55) { e = 0.55; }
                    }
                    let neCoastline = 0.65 + (warpY * 0.6) + (fbm(warpX * 10, warpY * 10) * 0.15);
                    if (warpX > neCoastline) {
                        let neLandExtension = Math.hypot((warpX - 0.95), (warpY - 0.05));
                        if (warpY < 0.30 && warpX > 0.70 && neLandExtension < 0.4) {
                            e = Math.max(e, 0.40 + (fbm(warpX * 10, warpY * 10) * 0.1));
                            m += 0.3;
                        } else {
                            e = Math.min(e, 0.32);
                        }
                    }
                }

                // --- 10. JAPAN ---
                let isJapanRegion = false;
                let dxJ = warpX - 1.15;
                let dyJ = (warpY - 0.70) / 0.6;
                let japanDist       = Math.hypot(dxJ * 1.5 + dyJ * 1.0, dyJ * 1.2 - dxJ * 0.5);
                let islandShatter   = fbm(warpX * 18, warpY * 18);
                let organicBoundary = japanDist - (islandShatter * 0.18);
                if (organicBoundary < 0.35 && warpX > 0.88 && warpY > 0.40) {
                    if (islandShatter > 0.3) {
                        isJapanRegion = true;
                        e = Math.max(e, 0.40 + (islandShatter * 0.35));
                        m = 0.6 + (fbm(warpX * 25, warpY * 25) * 0.3);
                        if (islandShatter > 0.75) e += 0.2;
                    }
                } else if (warpX > 0.85 && !isJapanRegion && warpY > 0.25) {
                    e = Math.min(e, 0.32);
                }

                // SE China & snow-free peaks
                if (warpY > 0.65 && warpX > 0.25) {
                    m = Math.max(m, 0.62 + (fbm(warpX * 15, warpY * 15) * 0.1));
                    if (e > 0.82) { e = 0.75 + (fbm(warpX * 20, warpY * 20) * 0.05); }
                    let southernRuggedness = fbm(warpX * 40, warpY * 40);
                    if (southernRuggedness > 0.85) { e = Math.max(e, 0.74); }
                }

                // --- 14. PROCEDURAL TRIBUTARIES ---
                let isProcRiver = false;
                if (e >= 0.36 && e < 0.65 && m > 0.45) {
                    let procRiverNoise = Math.abs(fbm(warpX * 15 + 5, warpY * 15 + 5) - 0.5) * 2.0;
                    let riverThreshold = 0.025 + Math.max(0, (0.5 - e) * 0.05) + (m * 0.035);
                    isProcRiver = procRiverNoise < riverThreshold;
                }

                // --- 13. DEEP OCEAN ---
                if (warpY > 0.60 && warpX > 0.58) {
                    let isJapan = (warpX > 0.88 && warpY > 0.55 && organicBoundary < 0.35);
                    if (!isJapan) {
                        let oceanDepth = 0.22 - (warpX * 0.05) - (warpY * 0.05);
                        let waterNoise = fbm(warpX * 20, warpY * 20) * 0.05;
                        e = Math.min(e, oceanDepth + waterNoise);
                    }
                }

                // --- 9. KOREA ---
                if (warpY >= 0.15 && warpY <= 0.65 && warpX > 0.70 && warpX < 0.95) {
                    let kProgress     = (warpY - 0.15) / 0.50;
                    let kCenterX      = 0.81 - (kProgress * 0.03);
                    let kWidth        = 0.08 - (kProgress * 0.04);
                    let kDistToCenter = Math.abs(warpX - kCenterX);
                    if (kDistToCenter < kWidth) {
                        let kShatter = fbm(warpX * 15, warpY * 15);
                        e = Math.max(e, 0.45 + (kShatter * 0.2));
                        m = 0.60;
                        if (kDistToCenter < kWidth * 0.4) { e += 0.18; }
                        if (warpX > kCenterX + (kWidth * 0.5)) { e += (fbm(warpX * 30, warpY * 30) * 0.15); }
                    }
                }

                // --- 10. JEJU ISLAND ---
                let jX_Jeju = 0.78, jY_Jeju = 0.71, jSize_Jeju = 0.011;
                let dx_Jeju = (warpX - jX_Jeju);
                let dy_Jeju = (warpY - jY_Jeju) * 1.6;
                let dist_Jeju = Math.sqrt(dx_Jeju * dx_Jeju + dy_Jeju * dy_Jeju);
                let jejuShatter = fbm(warpX * 60, warpY * 60) * 0.005;
                let jejuEdge = jSize_Jeju + jejuShatter;
                if (dist_Jeju < jejuEdge) {
                    let jejuPeak = 1.0 - (dist_Jeju / jejuEdge);
                    e = Math.max(e, 0.45 + (jejuPeak * 0.35));
                    m = 0.80;
                    isProcRiver  = false;
                    isMacroRiver = false;
                }

                // ORGANIC HIMALAYAN ARC
                let hCx = -0.05, hCy = 1.05, hRx = 0.34, hRy = 0.45;
                let baseDist   = Math.pow((nx - hCx) / hRx, 2) + Math.pow((ny - hCy) / hRy, 2);
                let macroWarp  = fbm(nx * 8, ny * 8) * 0.18;
                let microWarp  = Math.pow(fbm(nx * 30, ny * 30), 2) * 0.10;
                let finalOvalDist = baseDist + macroWarp + microWarp;
                if (finalOvalDist <= 1.2) {
                    let peakNoise = Math.pow(fbm(nx * 45, ny * 45), 2) * 0.35;
                    if (finalOvalDist < 0.60) {
                        e = 0.84 + peakNoise + ((0.60 - finalOvalDist) * 0.1);
                        m = 0.15;
                    } else if (finalOvalDist < 0.85) {
                        let mountainBlend = (finalOvalDist - 0.60) / 0.25;
                        e = (0.83 * (1 - mountainBlend)) + (0.71 * mountainBlend) + (peakNoise * 0.8);
                        m = 0.30 + (mountainBlend * 0.35);
                    } else {
                        let taperBlend   = (finalOvalDist - 0.85) / 0.35;
                        let targetE      = 0.55 + (fbm(nx * 15, ny * 15) * 0.1);
                        e = (e * taperBlend) + (targetE * (1 - taperBlend));
                        let wetNoise     = fbm(nx * 15, ny * 15) * 0.25;
                        let lushMoisture = 0.60 + wetNoise + (nx * 0.2);
                        m = Math.max(m, lushMoisture);
                    }
                }

                // HENAN FIX
                let henDist = Math.hypot(warpX - 0.43, warpY - 0.56);
                if (henDist < 0.16) {
                    let nukeStrength = 1.0 - (henDist / 0.16);
                    isProcRiver = false;
                    let targetE = 0.42 + (fbm(warpX * 25, warpY * 25) * 0.04);
                    e = (e * (1 - nukeStrength)) + (Math.max(e, targetE) * nukeStrength);
                    m = (m * (1 - nukeStrength)) + (0.52 * nukeStrength);
                }

                // MOUNT WUTAI / SHAANXI RIDGE
                let dxx  = (warpX - 0.43) / 0.08;
                let dyy  = (warpY - 0.45) / 0.20;
                let sxDist = Math.sqrt(dxx * dxx + dyy * dyy);
                if (sxDist < 1.0) {
                    let sxStrength = Math.pow(1.0 - sxDist, 2);
                    e += 0.22 * sxStrength;
                    e += fbm(warpX * 70, warpY * 70) * 0.05 * sxStrength;
                    m -= 0.25 * sxStrength;
                    if (sxStrength > 0.5) { isProcRiver = false; }
                }

                // QILIAN MOUNTAIN BARRIER
                let qX_QL = 0.15, qY_QL = 0.22, qRx_QL = 0.16, qRy_QL = 0.025, qAngle_QL = 35;
                let angleRad_QL = qAngle_QL * (Math.PI / 180);
                let cosA_QL = Math.cos(angleRad_QL), sinA_QL = Math.sin(angleRad_QL);
                let dx_QL  = warpX - qX_QL, dy_QL = warpY - qY_QL;
                let rotX_QL = dx_QL * cosA_QL + dy_QL * sinA_QL;
                let rotY_QL = -dx_QL * sinA_QL + dy_QL * cosA_QL;
                let smoothFactor = 1.0 - Math.max(0, Math.min(1, (rotX_QL / qRx_QL) + 0.5));
                rotY_QL += Math.sin(rotX_QL * 25) * (0.005 * smoothFactor);
                let normX = rotX_QL / qRx_QL;
                let xTaper = (normX < 0) ? Math.pow(Math.abs(normX), 1.2) : Math.pow(normX, 3.0);
                let qBaseDist_QL = Math.abs(rotY_QL / qRy_QL) + xTaper;
                let noiseAmount  = 0.15 + (0.25 * smoothFactor);
                let qJagged_QL   = qBaseDist_QL + (fbm(warpX * 40, warpY * 40) * noiseAmount);
                if (qBaseDist_QL < 2.0) {
                    let haloStrength_QL = 1.0 - Math.min(1.0, qBaseDist_QL / 2.0);
                    m = (m * (1 - haloStrength_QL)) + (0.12 * haloStrength_QL);
                    if (qJagged_QL > 1.0) { e = (e * (1 - haloStrength_QL)) + (0.42 * haloStrength_QL); }
                }
                if (qJagged_QL < 1.0) {
                    let qStrength_QL = Math.pow(1.0 - qJagged_QL, 2);
                    let peakNoise_QL = Math.pow(fbm(warpX * 60, warpY * 60), 2) * 0.5;
                    e = Math.max(e, 0.80 + (qStrength_QL * 0.15) + peakNoise_QL);
                    m = Math.min(m, 0.15);
                    isProcRiver = false;
                }

                // --- MACRO RIVER LOGIC ---
                let baseThickness  = 0.008;
                let riverEdgeNoise = fbm(warpX * 30, warpY * 30) * 0.002;
                let finalThickness = baseThickness + riverEdgeNoise;
                if (checkHardcodedRiver(warpX, warpY, YELLOW_RIVER_COORDS, finalThickness)) { isMacroRiver = true; }
                if (!isMacroRiver && checkHardcodedRiver(warpX, warpY, YANGTZE_RIVER_COORDS, finalThickness)) { isMacroRiver = true; }
                let tributaryThickness = (baseThickness * 0.6) + riverEdgeNoise;
                if (!isMacroRiver && (
                    checkHardcodedRiver(warpX, warpY, TIBET_RIVER_A, tributaryThickness) ||
                    checkHardcodedRiver(warpX, warpY, TIBET_RIVER_B, tributaryThickness) ||
                    checkHardcodedRiver(warpX, warpY, TIBET_RIVER_C, tributaryThickness)
                )) { isMacroRiver = true; }

                // Southern moisture cap
                if (j > WM_ROWS * 0.5) {
                    let mCheck = m * 100;
                    if (mCheck > 60) { m = 59 / 100; }
                }

                // --- 15. TILE ASSIGNMENT & BIOME RULES ---
                let tile = { id: 0, color: "", speed: 1.0, impassable: false, name: "", e: e, m: m };
                if (e < 0.25) {
                    tile.name = "Ocean";          tile.color = PALETTE.ocean;     tile.speed = 1.5;
                } else if (e < 0.35) {
                    tile.name = "Coastal";        tile.color = PALETTE.coastal;   tile.speed = 1.3;
                } else if (isMacroRiver || isProcRiver) {
                    tile.name = "River";          tile.color = PALETTE.coastal;   tile.speed = 1.5;
                } else if (e > 0.82) {
                    tile.name = "Large Mountains"; tile.color = PALETTE.snow;     tile.speed = 0.3;
                } else if (e > 0.72) {
                    tile.name = "Mountains";       tile.color = PALETTE.mountains; tile.speed = 0.4;
                } else if (e > 0.58) {
                    if (m > 0.4) {
                        tile.name = "Dense Forest"; tile.color = PALETTE.jungle;  tile.speed = 0.3;
                    } else {
                        tile.name = "Highlands";    tile.color = PALETTE.highlands; tile.speed = 0.45;
                    }
                } else {
                    if (m < 0.25) {
                        tile.name = "Desert";   tile.color = PALETTE.desert; tile.speed = 0.4;
                    } else if (m < 0.35) {
                        tile.name = "Dunes";    tile.color = PALETTE.dune;   tile.speed = 0.65;
                    } else if (m > 0.55) {
                        tile.name = "Forest";   tile.color = PALETTE.forest; tile.speed = 0.4;
                    } else if (m > 0.42) {
                        tile.name = "Plains";   tile.color = PALETTE.meadow; tile.speed = 0.85;
                    } else {
                        tile.name = "Steppes";  tile.color = PALETTE.plains; tile.speed = 0.8;
                    }
                }

                wmMap[i][j] = tile;
                bgCtx.fillStyle = tile.color;
                bgCtx.fillRect(i * WM_TILE_SIZE, j * WM_TILE_SIZE, WM_TILE_SIZE, WM_TILE_SIZE);
            }
        }

        // ======================================================
        // PASS 2 — TEXTURE & DETAIL RENDERING
        // (Biomatic Forest Engine + Mountain Icons + Highland Bumps)
        // Identical to sandbox_overworld.js painting loop.
        // Adapted: WM_COLS/WM_ROWS/WM_TILE_SIZE scale.
        // ======================================================
        for (let j = 0; j < WM_ROWS; j++) {
            for (let i = 0; i < WM_COLS; i++) {
                let tile = wmMap[i][j];
                let px   = i * WM_TILE_SIZE;
                let py   = j * WM_TILE_SIZE;
                let nx   = i / WM_COLS;
                let ny   = j / WM_ROWS;

                // --- HIGHLANDS ---
                if (tile.name === "Highlands") {
                    let isNearWater = false;
                    if (tile.e < 0.62) {
                        const n     = wmMap[i]?.[j - 1]?.name;
                        const s     = wmMap[i]?.[j + 1]?.name;
                        const w     = wmMap[i - 1]?.[j]?.name;
                        const e_tile = wmMap[i + 1]?.[j]?.name;
                        isNearWater = (
                            n === "Ocean" || n === "Coastal" || n === "River" ||
                            s === "Ocean" || s === "Coastal" || s === "River" ||
                            w === "Ocean" || w === "Coastal" || w === "River" ||
                            e_tile === "Ocean" || e_tile === "Coastal" || e_tile === "River"
                        );
                    }
                    if (!isNearWater) {
                        const isNorthChina = (nx > 0.3 && nx < 0.7 && ny > 0.3 && ny < 0.6);
                        const isMongolia   = (nx < 0.45 && ny < 0.4);
                        const isAridNorth  = isNorthChina || isMongolia;
                        let edgeFade = tile.e ? Math.min(1, (tile.e - 0.55) * 5) : 1;
                        if (isAridNorth) {
                            if (Math.random() < 0.03 * edgeFade)  { drawHighlandBump(bgCtx, px, py, WM_TILE_SIZE); }
                            if (Math.random() > 0.990)             { drawHighlandTree(bgCtx, px, py, "#4a5d3a", 0.3); }
                        } else {
                            if (Math.random() < 0.50 * edgeFade)  { drawHighlandBump(bgCtx, px, py, WM_TILE_SIZE); }
                            if (Math.random() > 0.90 * (2 - edgeFade)) {
                                let treeColor = "#2d4c1e";
                                drawHighlandTree(bgCtx, px, py, treeColor, 0.4);
                                if (Math.random() > 0.5) { drawHighlandTree(bgCtx, px + 2, py + 1, treeColor, 0.25); }
                            }
                        }
                        if (Math.random() > 0.95) {
                            bgCtx.fillStyle = "rgba(0,0,0,0.03)";
                            bgCtx.fillRect(px + Math.random() * WM_TILE_SIZE, py + Math.random() * WM_TILE_SIZE, 1, 1);
                        }
                    }
                }

                else if (tile.name === "Steppes" || tile.name === "Desert") {
                    if (nx < 0.45 && ny < 0.4 && Math.random() > 0.995) {
                        bgCtx.fillStyle = "#364528";
                        bgCtx.beginPath();
                        bgCtx.arc(px + WM_TILE_SIZE / 2, py + WM_TILE_SIZE / 2, WM_TILE_SIZE * 0.4, 0, Math.PI * 2);
                        bgCtx.fill();
                    } else if (Math.random() > (isMobile ? 0.93 : 0.55)) {
                        bgCtx.fillStyle = "rgba(0,0,0,0.04)";
                        bgCtx.beginPath();
                        bgCtx.arc(
                            px + Math.random() * WM_TILE_SIZE,
                            py + Math.random() * WM_TILE_SIZE,
                            Math.random() * 1 + 0.3, 0, Math.PI * 2
                        );
                        bgCtx.fill();
                    }
                }

                else if (tile.name === "Plains") {
                    if (Math.random() > 0.84) {
                        bgCtx.fillStyle = "#425232";
                        bgCtx.beginPath();
                        bgCtx.arc(px + WM_TILE_SIZE / 2, py + WM_TILE_SIZE / 2, WM_TILE_SIZE * 0.5, 0, Math.PI, true);
                        bgCtx.fill();
                    } else if (Math.random() > 0.7) {
                        bgCtx.fillStyle = "rgba(255,255,255,0.15)";
                        bgCtx.beginPath();
                        bgCtx.arc(
                            px + Math.random() * WM_TILE_SIZE,
                            py + Math.random() * WM_TILE_SIZE,
                            Math.random() * 1 + 0.5, 0, Math.PI * 2
                        );
                        bgCtx.fill();
                    }
                }

                // --- BIOMATIC FOREST ENGINE ---
                if (tile.name.includes("Forest") || tile.color === PALETTE.jungle) {
                    let jurchenFade = Math.max(0, Math.min(1, (nx + (hash(i, j) - 0.5) * 0.1 - 0.45) / 0.35));
                    let northCurve  = 0.35 + (Math.sin(nx * Math.PI * 4) * 0.03) + (Math.cos(nx * Math.PI * 8) * 0.015);
                    let northBlendChance = Math.max(0, Math.min(1, (northCurve + 0.05 - (ny + (hash(i, j) - 0.5) * 0.15)) / 0.25));
                    let highlandPerturbation = tile.e > 0.55 ? (tile.e - 0.55) * 0.15 : 0;
                    let southCurve  = 0.70 + (Math.sin(nx * Math.PI * 5) * 0.035) + (Math.cos(nx * Math.PI * 7) * 0.015) - highlandPerturbation;
                    let southBlendChance = Math.max(0, Math.min(1, ((ny + (hash(j, i) - 0.5) * 0.15) - (southCurve - 0.05)) / 0.25));
                    let westCurve   = 0.30 + (Math.sin(ny * Math.PI * 4) * 0.03) + (Math.cos(ny * Math.PI * 9) * 0.02);
                    let westBlendChance  = Math.max(0, Math.min(1, (westCurve + 0.05 - (nx + (hash(i, i) - 0.5) * 0.15)) / 0.25));
                    let isFarNorth   = Math.random() < northBlendChance;
                    let isJungleTile = tile.color === PALETTE.jungle;
                    let isDeepSouth  = Math.random() < southBlendChance || (isJungleTile && Math.random() > 0.15);
                    let isAridWest   = Math.random() < westBlendChance;
                    let densityThreshold = 0.55 - (jurchenFade * 0.05) - (ny * 0.05);
                    // Korea/Jurchen weight
                    let koreaWeightX = Math.max(0, Math.min(1, (nx - 0.60) / 0.10));
                    let fadeNorthY   = Math.max(0, Math.min(1, (ny - 0.30) / 0.05));
                    let fadeSouthY   = Math.max(0, Math.min(1, (0.70 - ny) / 0.05));
                    let koreaWeightY = Math.min(fadeNorthY, fadeSouthY);
                    let borderNoise  = (hash(i, j) - 0.5) * 0.15;
                    let finalKoreaWeight = Math.max(0, Math.min(1, (koreaWeightX * koreaWeightY) + borderNoise));
                    let targetThreshold  = 0.95;
                    densityThreshold = densityThreshold + finalKoreaWeight * (targetThreshold - densityThreshold);

                    if (Math.random() > densityThreshold) {
                        let seedX   = hash(i, j);
                        let seedY   = hash(j, i);
                        let offsetX = (seedX - 0.5) * (WM_TILE_SIZE * 1.5);
                        let offsetY = (seedY - 0.5) * (WM_TILE_SIZE * 1.5);
                        let cx_t    = px + WM_TILE_SIZE / 2 + offsetX;
                        let cy_t    = py + WM_TILE_SIZE / 2 + offsetY;
                        let treeSize = WM_TILE_SIZE * (0.35 + (jurchenFade * 0.3) + (Math.random() * 0.3));
                        let treeRand = Math.random();
                        bgCtx.save();
                        if (isFarNorth) {
                            // MANCHURIAN LARCH — tiered conifers
                            let tiers = 2 + Math.floor(Math.random() * 2);
                            bgCtx.fillStyle = `rgb(${10 + Math.random() * 10}, ${20 + Math.random() * 10}, 15)`;
                            for (let t = 0; t < tiers; t++) {
                                let ty = cy_t - (t * (treeSize * 0.4));
                                let tw = treeSize * (1 - (t * 0.3));
                                bgCtx.beginPath();
                                bgCtx.moveTo(cx_t,      ty - treeSize);
                                bgCtx.lineTo(cx_t - tw, ty);
                                bgCtx.lineTo(cx_t + tw, ty);
                                bgCtx.closePath();
                                bgCtx.fill();
                            }
                        } else if (isDeepSouth) {
                            if (treeRand > 0.4) {
                                // ANCIENT BANYAN
                                let leafColors = ["#0D1F1D", "#1A2F18", "#142414"];
                                for (let l = 0; l < 2; l++) {
                                    bgCtx.fillStyle = leafColors[l];
                                    let lx = cx_t + (Math.random() - 0.5) * treeSize;
                                    let ly = cy_t + (Math.random() - 0.5) * treeSize;
                                    bgCtx.beginPath();
                                    bgCtx.ellipse(lx, ly, treeSize * 0.8, treeSize * 0.5, Math.random() * Math.PI, 0, Math.PI * 2);
                                    bgCtx.fill();
                                }
                            } else {
                                // RIVER BAMBOO
                                bgCtx.strokeStyle = "#1B2B12";
                                bgCtx.lineWidth   = 0.5;
                                for (let b = 0; b < 2; b++) {
                                    let bx = cx_t + (b * 1.5) - 0.75;
                                    let bh = treeSize * (0.8 + Math.random() * 0.5);
                                    bgCtx.beginPath();
                                    bgCtx.moveTo(bx, cy_t);
                                    bgCtx.lineTo(bx + (Math.random() - 0.5), cy_t - bh);
                                    bgCtx.stroke();
                                    bgCtx.fillStyle = "#2D3B1E";
                                    bgCtx.beginPath();
                                    bgCtx.arc(bx, cy_t - bh, 0.8, 0, Math.PI * 2);
                                    bgCtx.fill();
                                }
                            }
                        } else if (isAridWest) {
                            // STEPPE CYPRESS
                            bgCtx.fillStyle = "#222B1A";
                            bgCtx.beginPath();
                            bgCtx.ellipse(cx_t, cy_t, treeSize * 0.3, treeSize, 0, 0, Math.PI * 2);
                            bgCtx.fill();
                        } else {
                            // CENTRAL SONG WILLOW / OAK
                            bgCtx.fillStyle = `rgb(${25 + Math.random() * 10}, ${35 + Math.random() * 10}, 20)`;
                            bgCtx.beginPath();
                            bgCtx.arc(cx_t, cy_t, treeSize, 0, Math.PI * 2);
                            if (treeRand > 0.7) {
                                bgCtx.arc(cx_t - treeSize * 0.5, cy_t + treeSize * 0.3, treeSize * 0.6, 0, Math.PI * 2);
                                bgCtx.arc(cx_t + treeSize * 0.5, cy_t + treeSize * 0.3, treeSize * 0.6, 0, Math.PI * 2);
                            }
                            bgCtx.fill();
                        }
                        bgCtx.restore();
                    }
                }

                // --- MOUNTAIN ICONS & TIMBERLINES ---
                if (tile.name.includes("Mountain") || tile.name.includes("Large Mountains")) {
                    let isDryMountains = tile.name.includes("Large Mountains");
                    let isExtremePeak  = tile.name === "Large Mountains";
                    let peakSpawnThreshold = isMobile ? 0.991 : 0.984;

                    if (hash(i, j) > peakSpawnThreshold) {
                        let isInvalidTerrain = false;
                        if (tile.name.includes("Ocean") || tile.name.includes("Coastal") || tile.name === "River") {
                            isInvalidTerrain = true;
                        }
                        if (!isInvalidTerrain) {
                            for (let ni = -1; ni <= 1 && !isInvalidTerrain; ni++) {
                                for (let nj = -1; nj <= 1 && !isInvalidTerrain; nj++) {
                                    let neighbor = wmMap[i + ni] ? wmMap[i + ni][j + nj] : null;
                                    if (neighbor) {
                                        let nName = neighbor.name;
                                        if (nName.includes("Ocean") || nName.includes("Coastal") || nName === "River") {
                                            isInvalidTerrain = true;
                                        }
                                    }
                                }
                            }
                        }
                        if (!isInvalidTerrain) {
                            let scaleMultiplier = isDryMountains ? 4 : 2;
                            // Offsets scaled 1/4 from sandbox's ±120 → ±30
                            let randomXOffset   = (Math.random() - 0.5) * 30;
                            let randomYOffset   = (Math.random() - 0.5) * 30;
                            let finalPx         = px + randomXOffset;
                            let finalPy         = py + randomYOffset;
                            let randomHeightVar = (Math.random() - 0.5) * (15 * (scaleMultiplier / 4));
                            let randomWidthVar  = (Math.random() - 0.5) * (30 * (scaleMultiplier / 4));
                            let baseHeight      = Math.max(2, (tile.e - 0.5) * 25 + 5);
                            let height          = (baseHeight * (scaleMultiplier / 2.5)) + randomHeightVar;
                            let width           = (WM_TILE_SIZE * scaleMultiplier) + randomWidthVar;
                            let alpha           = 0.75;

                            // Edge taper (proportionally adapted to WM canvas size)
                            let edge_taper_pad = 60;
                            if (px < edge_taper_pad)                alpha = Math.min(alpha, px / edge_taper_pad);
                            if (px > DISPLAY_W - edge_taper_pad)    alpha = Math.min(alpha, (DISPLAY_W  - px) / edge_taper_pad);
                            if (py < edge_taper_pad)                alpha = Math.min(alpha, py / edge_taper_pad);
                            if (py > DISPLAY_H - edge_taper_pad)    alpha = Math.min(alpha, (DISPLAY_H - py) / edge_taper_pad);
                            // Tian Shan shadow band (proportion of DISPLAY_H: ~0.30–0.35)
                            if (py >= 216 && py <= 252)             alpha = Math.min(alpha, 0.5 * (1 - (py - 216) / 36));
                            // Far-east, deep-south ocean shadow
                            if (py > 432 && px > 720)               alpha = Math.min(alpha, 0.15);

                            bgCtx.save();
                            bgCtx.globalAlpha = alpha;
                            if (isDryMountains) {
                                drawSnowyPeak(bgCtx, finalPx, finalPy, width, height, isExtremePeak, WM_TILE_SIZE);
                            } else {
                                drawMountain(bgCtx, finalPx, finalPy, width, height, WM_TILE_SIZE);
                            }
                            bgCtx.restore();
                        }
                    }

                    // Mountain timberline trees (scaled)
                    let treeDensity = isDryMountains ? 0.95 : 0.60;
                    let maxTrees    = isDryMountains ? 1 : 2;
                    for (let t = 0; t < maxTrees; t++) {
                        if (Math.random() > treeDensity) {
                            let treeX    = px + WM_TILE_SIZE / 2 + ((Math.random() - 0.5) * WM_TILE_SIZE * 0.9);
                            let treeY    = py + WM_TILE_SIZE / 2 + ((Math.random() - 0.5) * WM_TILE_SIZE * 0.9);
                            const treeRand = Math.random();
                            bgCtx.save();
                            if (isDryMountains) {
                                let tiers     = 2 + Math.floor(Math.random() * 2);
                                let treeWidth = WM_TILE_SIZE * (0.4 + Math.random() * 0.3);
                                bgCtx.fillStyle = `rgb(${15 + Math.random() * 10}, ${25 + Math.random() * 10}, 20)`;
                                for (let k = 0; k < tiers; k++) {
                                    let levelY = treeY - (k * 1.5);
                                    let levelW = treeWidth * (1 - (k * 0.3));
                                    bgCtx.beginPath();
                                    bgCtx.moveTo(treeX,          levelY - 2);
                                    bgCtx.lineTo(treeX - levelW, levelY);
                                    bgCtx.lineTo(treeX + levelW, levelY);
                                    bgCtx.closePath();
                                    bgCtx.fill();
                                }
                            } else if (treeRand > 0.6) {
                                // Southern banyan
                                let canopySize = WM_TILE_SIZE * (0.5 + Math.random() * 0.4);
                                let leafColors = ["#1A2F18", "#0D1F1D", "#223311", "#142414"];
                                for (let k = 0; k < 2; k++) {
                                    bgCtx.fillStyle = leafColors[k];
                                    let offX = (Math.random() - 0.5) * canopySize;
                                    let offY = (Math.random() - 0.5) * canopySize;
                                    bgCtx.beginPath();
                                    bgCtx.ellipse(
                                        treeX + offX, treeY + offY,
                                        canopySize * 0.6, canopySize * 0.4,
                                        Math.random() * Math.PI, 0, Math.PI * 2
                                    );
                                    bgCtx.fill();
                                }
                            } else {
                                // Bamboo thicket
                                for (let s = 0; s < 2; s++) {
                                    let sX = treeX + (s * 1) - 0.5;
                                    let sH = 2 + Math.random() * 3;
                                    bgCtx.strokeStyle = "#2D3B1E";
                                    bgCtx.lineWidth   = 0.5;
                                    bgCtx.beginPath();
                                    bgCtx.moveTo(sX, treeY);
                                    bgCtx.lineTo(sX + (Math.random() - 0.5) * 0.5, treeY - sH);
                                    bgCtx.stroke();
                                    bgCtx.fillStyle = "#3E4D26";
                                    bgCtx.beginPath();
                                    bgCtx.arc(sX, treeY - sH, 0.6, 0, Math.PI * 2);
                                    bgCtx.fill();
                                }
                            }
                            bgCtx.restore();
                        }
                    }
                }
            }
        }

        // ======================================================
        // PASS 3 — PARCHMENT VIGNETTE (Identical to sandbox)
        // ======================================================
        bgCtx.globalCompositeOperation = "multiply";
        bgCtx.fillStyle = "#e0c9a3";
        bgCtx.fillRect(0, 0, DISPLAY_W, DISPLAY_H);

        let gradient = bgCtx.createRadialGradient(
            DISPLAY_W / 2, DISPLAY_H / 2, DISPLAY_H * 0.3,
            DISPLAY_W / 2, DISPLAY_H / 2, DISPLAY_W  * 0.6
        );
        gradient.addColorStop(0,   "rgba(255, 255, 255, 0)");
        gradient.addColorStop(0.7, "rgba(139, 69, 19, 0.4)");
        gradient.addColorStop(1,   "rgba(0, 0, 0, 0.8)");
        bgCtx.fillStyle = gradient;
        bgCtx.fillRect(0, 0, DISPLAY_W, DISPLAY_H);
        bgCtx.globalCompositeOperation = "source-over";

        cachedBgCanvas = bgCanvas;
    }

    // ── PLAYER POSITION MARKER ────────────────────────────────────────────────
    function drawPlayer(ctx, w, h) {
        if (typeof player === 'undefined') return;
        const WW = typeof WORLD_WIDTH  !== 'undefined' ? WORLD_WIDTH  : 8000;
        const WH = typeof WORLD_HEIGHT !== 'undefined' ? WORLD_HEIGHT : 6000;
        const px = (player.x / WW) * w;
        const py = (player.y / WH) * h;
        ctx.shadowColor = '#ffca28'; ctx.shadowBlur = 15;
        ctx.strokeStyle = '#ffca28'; ctx.lineWidth   = 3.0;
        ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffffff';   ctx.shadowBlur  = 0;
        ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
    }

    // ── SONG DYNASTY COMPASS (Luo Pan) — RED POINTS SOUTH ────────────────────
    function drawCompass(ctx, w) {
        const cx = w - 45, cy = 45, r = 24;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6;
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#bf9540'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 4; ctx.lineCap = 'round';
        // NORTH (White, pointing UP)
        ctx.strokeStyle = '#eeeeee';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - r + 4); ctx.stroke();
        // SOUTH (Vermilion Red, pointing DOWN)
        ctx.strokeStyle = '#ff3333';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + r - 4); ctx.stroke();
        ctx.font = 'bold 14px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ff3333'; ctx.fillText('午', cx, cy + r + 18); // South
        ctx.fillStyle = '#aaa';
        ctx.fillText('子', cx, cy - r - 18); // North
        ctx.fillText('卯', cx + r + 16, cy); // East
        ctx.fillText('酉', cx - r - 16, cy); // West
        ctx.restore();
    }

    // ── COMPOSE FULL MAP ──────────────────────────────────────────────────────
    function buildMap() {
        mainCtx.clearRect(0, 0, DISPLAY_W, DISPLAY_H);
        mainCtx.imageSmoothingEnabled = false; // Crisp at full bgCanvas resolution
        mainCtx.drawImage(cachedBgCanvas, 0, 0, DISPLAY_W, DISPLAY_H);
        // No cities. No NPCs. No city names.
        drawPlayer(mainCtx, DISPLAY_W, DISPLAY_H);
        drawCompass(mainCtx, DISPLAY_W);
    }

    // ── BUILD OVERLAY DOM ─────────────────────────────────────────────────────
    function buildOverlay() {
        if (document.getElementById('world-map-overlay')) {
            overlayEl = document.getElementById('world-map-overlay');
            return;
        }

        overlayEl = document.createElement('div');
        overlayEl.id = 'world-map-overlay';
        overlayEl.style.cssText = [
            'display:none', 'position:fixed', 'inset:0',
            'background:rgba(5,5,10,0.98)', 'z-index:9999',
            'flex-direction:column', 'align-items:center',
            'justify-content:center', 'overflow:hidden',
            'font-family:Georgia,serif',
        ].join(';');

        // ── CLOSE BUTTON — TOP LEFT CORNER ───────────────────────────────────
        // Same design as sandbox_overworld.js button: round, gold-bordered, crimson.
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
            position: absolute;
            top: 15px;
            left: 15px;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: #900000;
            border: 3px solid #ffca28;
            color: #ffffff;
            font-size: 24px;
            font-weight: bold;
            z-index: 10001;
            box-shadow: 0 4px 15px rgba(0,0,0,0.8);
            cursor: pointer;
            touch-action: manipulation;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        closeBtn.addEventListener('click', closeMap);
        overlayEl.appendChild(closeBtn);

        // ── COUNTDOWN TIMER TEXT ──────────────────────────────────────────────
        const timerText = document.createElement('div');
        timerText.id = 'world-map-timer';
        timerText.style.cssText = `
            position: absolute;
            top: 25px;
            left: 50%;
            transform: translateX(-50%);
            color: #f5d76e;
            font-size: 16px;
            font-weight: bold;
            text-shadow: 0 2px 4px rgba(0,0,0,0.9);
            z-index: 10001;
            background: rgba(0,0,0,0.5);
            padding: 5px 15px;
            border-radius: 20px;
            border: 1px solid #d4b886;
        `;
        overlayEl.appendChild(timerText);

        // ── MAP CANVAS ────────────────────────────────────────────────────────
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:100%;max-width:960px;display:flex;align-items:center;justify-content:center;padding:10px;box-sizing:border-box;';

        mainCanvas = document.createElement('canvas');
        mainCanvas.width  = DISPLAY_W;
        mainCanvas.height = DISPLAY_H;
        mainCanvas.style.cssText = 'border:3px solid #d4b886;border-radius:6px;width:100%;height:auto;max-height:85vh;object-fit:contain;background:#2b4a5f;box-shadow:0 10px 30px rgba(0,0,0,0.8);';
        mainCtx = mainCanvas.getContext('2d');

        wrapper.appendChild(mainCanvas);
        overlayEl.appendChild(wrapper);
        document.body.appendChild(overlayEl);
    }

    // ── OPEN / CLOSE & TIMER LOGIC ────────────────────────────────────────────
  function openMap() {
        buildOverlay();
        if (!mainCtx) return;

        // SURGERY: Initialize controls once to prevent event-listener stacking
        if (!window._mapControlsAdded) {
            addMapControls();
            window._mapControlsAdded = true;
        }

        window.isMobileDrawerOpen = true;
        toggleJoysticks(false);
        overlayEl.style.display = 'flex';

        // Timer Logic
        secondsLeft = 20;
        const timerEl = document.getElementById('world-map-timer');
        if (timerEl) timerEl.innerText = `Auto-closing in ${secondsLeft}s`;
        clearInterval(countdownInterval);
        clearTimeout(autoCloseTimeout);
        countdownInterval = setInterval(() => {
            secondsLeft--;
            if (timerEl) timerEl.innerText = `Auto-closing in ${secondsLeft}s`;
            if (secondsLeft <= 0) clearInterval(countdownInterval);
        }, 1000);
        autoCloseTimeout = setTimeout(() => { closeMap(); }, 20000);

        // Render Logic
        if (!cachedBgCanvas) {
            mainCtx.fillStyle = '#2b4a5f';
            mainCtx.fillRect(0, 0, DISPLAY_W, DISPLAY_H);
            mainCtx.fillStyle = '#f5d76e';
            mainCtx.font = 'bold 24px Georgia';
            mainCtx.textAlign = 'center';
            mainCtx.textBaseline = 'middle';
            mainCtx.fillText('Loading World Map...', DISPLAY_W / 2, DISPLAY_H / 2);
            requestAnimationFrame(() => requestAnimationFrame(() => {
                renderTerrainBg();
                redrawMap(); // Use the new interactive renderer
            }));
        } else {
            requestAnimationFrame(redrawMap); // Use the new interactive renderer
        }
    }
    function closeMap() {
        clearInterval(countdownInterval);
        clearTimeout(autoCloseTimeout);
        if (overlayEl) overlayEl.style.display = 'none';
        window.isMobileDrawerOpen = false;
        toggleJoysticks(true);
        if (window.mobileUI && typeof window.mobileUI.openDetailDrawer === 'function') {
            window.mobileUI.openDetailDrawer();
        }
    }

// ── INJECT BUTTON INTO MOBILE DRAWER ─────────────────────────────────────
    function injectButton() {
        if (document.getElementById('mob-worldmap-btn')) return;

        // DO NOT show the World Map button in Story Mode 
        if (typeof FACTIONS !== 'undefined' && FACTIONS["Kamakura Shogunate"]) {
            return;
        }

        const dipBtn = document.getElementById('mob-dip-btn');
        if (!dipBtn) return;

        const btn = document.createElement('button');
        btn.id        = 'mob-worldmap-btn';
        btn.className = 'menu-btn';
        btn.style.cssText = 'width:100%;margin-top:10px;padding:14px 10px;background:linear-gradient(to bottom,#0a2040,#040f20);border:1px solid #4a90d9;color:#6ab4ff;font-family:Georgia,serif;font-size:15px;font-weight:bold;text-transform:uppercase;cursor:pointer;border-radius:4px;';
        btn.innerHTML = '🗺️ World Map';
        btn.addEventListener('click', () => {
            if (window.mobileUI) window.mobileUI.closeDetailDrawer();
            setTimeout(openMap, 150);
        });

        dipBtn.insertAdjacentElement('afterend', btn);
    }

    function init() {
        const body = document.getElementById('mob-detail-body');
        if (body) {
            injectButton();
            drawerObserver = new MutationObserver(() => injectButton());
            drawerObserver.observe(body, { childList: true });
            return;
        }
        let tries = 0;
        const poll = setInterval(() => {
            const b = document.getElementById('mob-detail-body');
            if (b) {
                clearInterval(poll);
                injectButton();
                drawerObserver = new MutationObserver(() => injectButton());
                drawerObserver.observe(b, { childList: true });
            } else if (++tries > 100) clearInterval(poll);
        }, 100);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.WorldMap = { open: openMap, close: closeMap };


// ============================================================================
// UNIFIED INTERACTIVE CAMERA & RENDERING
// ============================================================================
    
    function redrawMap() {
        if (!mainCtx || !cachedBgCanvas) return;

        mainCtx.save();
        mainCtx.clearRect(0, 0, DISPLAY_W, DISPLAY_H);

        // Apply Transformation Matrix
        mainCtx.translate(DISPLAY_W / 2, DISPLAY_H / 2);
        mainCtx.scale(mapCam.zoom, mapCam.zoom);
        mainCtx.translate(-DISPLAY_W / 2 + mapCam.x, -DISPLAY_H / 2 + mapCam.y);

        // 1. Draw Terrain
        mainCtx.drawImage(cachedBgCanvas, 0, 0);

        // 2. Draw Cities with Proportional Scaling & LOD
        if (window.cities_sandbox) {
            const WW = window.WORLD_WIDTH_sandbox || 4000;
            const WH = window.WORLD_HEIGHT_sandbox || 3000;

            window.cities_sandbox.forEach(city => {
                const cx = (city.x / WW) * DISPLAY_W;
                const cy = (city.y / WH) * DISPLAY_H;

                mainCtx.beginPath();
                mainCtx.arc(cx, cy, 3 / mapCam.zoom, 0, Math.PI * 2);
                mainCtx.fillStyle = city.color || city.factionColor || "#f5d76e";
                mainCtx.fill();
                mainCtx.strokeStyle = "#1a1a1a";
                mainCtx.lineWidth = 1.5 / mapCam.zoom;
                mainCtx.stroke();

                if (mapCam.zoom > 1.4) {
                    const fontSize = Math.max(6, 14 / mapCam.zoom);
                    mainCtx.font = `bold ${fontSize}px Georgia`;
                    mainCtx.textAlign = "center";
                    
                    mainCtx.strokeStyle = "rgba(0, 0, 0, 0.85)";
                    mainCtx.lineWidth = 3 / mapCam.zoom;
                    mainCtx.strokeText(city.name, cx, cy - (8 / mapCam.zoom));
                    
                    mainCtx.fillStyle = "#ffffff";
                    mainCtx.shadowBlur = 0; 
                    mainCtx.fillText(city.name, cx, cy - (8 / mapCam.zoom));
                }
            });
        }

        // 3. Draw Player Position
        // Pass the context, map display width, and map display height
        drawPlayer(mainCtx, DISPLAY_W, DISPLAY_H);

        mainCtx.restore();
    }
	
    function addMapControls() {
        // --- DESKTOP MOUSE SUPPORT ---
        overlayEl.addEventListener('wheel', e => {
            e.preventDefault();
            const zoomSensitivity = 0.0015;
            mapCam.zoom -= e.deltaY * zoomSensitivity;
            mapCam.zoom = Math.min(Math.max(mapCam.zoom, 1), 5); // Clamp zoom between 1x and 5x
            redrawMap();
        }, { passive: false });

        overlayEl.addEventListener('mousedown', e => {
            isPanning = true;
            lastMousePos = { x: e.clientX, y: e.clientY };
        });

        window.addEventListener('mousemove', e => {
            if (!isPanning || overlayEl.style.display === 'none') return;
            const dx = (e.clientX - lastMousePos.x) / mapCam.zoom;
            const dy = (e.clientY - lastMousePos.y) / mapCam.zoom;
            mapCam.x += dx;
            mapCam.y += dy;
            lastMousePos = { x: e.clientX, y: e.clientY };
            redrawMap();
        });

        window.addEventListener('mouseup', () => isPanning = false);
        window.addEventListener('mouseleave', () => isPanning = false);

        // --- MOBILE TOUCH SUPPORT (PAN & PINCH-TO-ZOOM) ---
        let initialPinchDistance = null;
        let initialZoom = 1;

        overlayEl.addEventListener('touchstart', e => {
            if (e.touches.length === 1) {
                isPanning = true;
                lastMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            } else if (e.touches.length === 2) {
                isPanning = false; // Stop panning if a second finger touches down
                initialPinchDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                initialZoom = mapCam.zoom;
            }
        }, { passive: false });

        overlayEl.addEventListener('touchmove', e => {
            e.preventDefault(); // Stop mobile browser from pulling to refresh
            
            if (isPanning && e.touches.length === 1) {
                // 1-Finger Pan
                const dx = (e.touches[0].clientX - lastMousePos.x) / mapCam.zoom;
                const dy = (e.touches[0].clientY - lastMousePos.y) / mapCam.zoom;
                mapCam.x += dx;
                mapCam.y += dy;
                lastMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                redrawMap();
            } else if (e.touches.length === 2 && initialPinchDistance) {
                // 2-Finger Zoom
                const currentDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const scale = currentDistance / initialPinchDistance;
                mapCam.zoom = Math.min(Math.max(initialZoom * scale, 1), 5); // Clamp zoom
                redrawMap();
            }
        }, { passive: false });
        
        overlayEl.addEventListener('touchend', () => { 
            isPanning = false;
            initialPinchDistance = null;
        });
    }
	
})();