// =============================================================================
// NPC SYSTEMS – STORY 2: THE HEXI CORRIDOR — SUZHOU SIEGE 1226
// story2_map_and_update.js   v3.0  — procedural Hexi Corridor terrain
//
// CONTRACT FOR ALL FUTURE STORIES
// ────────────────────────────────
// Every storyN_map_and_update.js MUST expose ONE public entry point:
//
//   window.initGame_story2   (replace 2 with N)
//
// That function must, in order:
//   1. Call applyStoryNFactions()            — swaps FACTIONS + SYLLABLE_POOLS
//   2. await generateMap_storyN()            — fills worldMap_storyN[][]
//   3. populateCities_storyN()               — fills cities_storyN[]
//   4. Copy storyN data into shared arrays   — worldMap[], cities[]
//   5. Call initializeNPCs(...)              — boots NPCs
//   6. Call initAllCities(FACTIONS)          — boots city interiors
//   7. Place player near the home city
//   8. Show the UI + start the draw() loop
//   9. If a scenario module (e.g. SuzhouScenario) is present AND
//      window.__campaignStory2Active === true, call Module.install()
//
// COORDINATE FORMAT
// ─────────────────
// All city positions are stored as nx/ny (normalised 0–1 world fractions).
// The world is WORLD_WIDTH × WORLD_HEIGHT pixels (typically 4000 × 3000).
// Pixel coords: px = nx * COLS * TILE_SIZE,  py = ny * ROWS * TILE_SIZE
//
// MAP ORIGIN for the Hexi Corridor image
// ───────────────────────────────────────
// Source image: "Mongol invasion of Western Xia in 1209/1226"
//   West  edge (x=0.00) ≈ beyond Yumen Pass / Shazhou
//   East  edge (x=1.00) ≈ Yan'an / Fengxiang area
//   North edge (y=0.00) ≈ Mongolian steppe (above Wulahai)
//   South edge (y=1.00) ≈ south of Fengxiang / Qilian foothills
//
// Key nx/ny anchor points (read directly off the image proportions):
//   Shazhou          nx≈0.07  ny≈0.35
//   Guazhou          nx≈0.18  ny≈0.34
//   Suzhou (HOME)    nx≈0.29  ny≈0.42    ← player garrison
//   Ganzhou          nx≈0.39  ny≈0.50
//   Xiliang          nx≈0.51  ny≈0.60
//   Heishui/KharaKhoto nx≈0.43 ny≈0.20
//   Wulahai          nx≈0.77  ny≈0.25
//   Xingqing capital nx≈0.72  ny≈0.54
//   Dingzhou         nx≈0.72  ny≈0.51
//   Yinzhou          nx≈0.92  ny≈0.58
//
// =============================================================================
// v3.0 NOTES
// ──────────
// Map gen rewritten:
//   • Qilian massif now procedural (no hard polygon).  A curved spine + variable
//     half-width + FBM-warped boundary gives an organic "thin long strip" that
//     blends into the surrounding dunes.
//   • Mountain elevation uses ridged multi-fractal noise with two crossing
//     ridge fields → sharp NW–SE ridges with deep transverse crevices.
//   • Mountain region painted at 4-pixel sub-tile resolution with directional
//     slope shading (NW light, SE shadow) — matches Google-Maps relief look.
//   • All mountain tiles classify as "Large Mountains" / PALETTE.snow exactly
//     as the player requested.
//   • Rivers drawn as TILE-BASED ribbons only (no centre polyline strokes).
//     Tile classification uses warped-distance to spine + FBM thickness
//     modulation for natural meandering edges.
//   • Dune areas left almost bare — only a faint FBM colour modulation
//     and very rare wind streaks.
// =============================================================================

// ── Faction registry ──────────────────────────────────────────────────────────
const FACTIONS_story2 = {
    "Western Xia": {
        color: "#b5451b",
        geoWeight: { north: 0.30, south: 0.80, west: 0.10, east: 0.85 }
    },
    "Mongol Empire": {
        color: "#1565c0",
        geoWeight: { north: 0.02, south: 0.12, west: 0.02, east: 0.20 }
    },
    "Bandits": {
        color: "#333333",
        geoWeight: { north: 0.50, south: 0.50, west: 0.50, east: 0.50 }
    }
};

// ── Syllable pools for procedural settlement names ────────────────────────────
const SYLLABLE_POOLS_story2 = {
    "Western Xia": [
        "Su","Gan","Sha","Gua","Chan","Wei","Wu","Ling","He","Xia",
        "Qin","Tang","Lan","Ning","Yin","Zhong","He","Huang","Xian","Tao",
        "Qili","Helan","Xiu","Fu","Ji","Xing","Ding","Shun","Liang",
        "Chang","Min","Tong","Qing","Bao","Jing","Jisi","Cha","Bao","Lu"
    ],
    "Mongol Empire": [
        "Kha","Khan","Temur","Bayan","Bur","Boro","Ulan","Or","Sar",
        "Batu","Tol","Qara","Sub","Ögö","Geng","Jebe","Muqa","Chepe",
        "Anda","Nökhör","Tümen","Tugh","Khur","Ariq","Küng"
    ],
    "Bandits": [
        "Yama","Kuro","Shura","Hei","Hun","Sha","Du","Mang","Ku","Huo",
        "Dao","Zei","Kuang","Wei","Ye","Lang","Mo","Luan","Yin","Jie"
    ]
};

// ── Faction applicator ────────────────────────────────────────────────────────
function applyStory2Factions() {
    Object.keys(FACTIONS).forEach(k => delete FACTIONS[k]);
    Object.assign(FACTIONS, FACTIONS_story2);
    Object.keys(SYLLABLE_POOLS).forEach(k => delete SYLLABLE_POOLS[k]);
    Object.assign(SYLLABLE_POOLS, SYLLABLE_POOLS_story2);
    if (typeof initDiplomacy === 'function') { initDiplomacy(FACTIONS); }
    console.log("[Story2] ✅ Historical 1226 factions applied.");
    console.log("[Story2]    Active factions:", Object.keys(FACTIONS).join(", "));
}

// ── Internal story2 data ──────────────────────────────────────────────────────
let worldMap_story2 = [];
let cities_story2   = [];

// ── Tuning ────────────────────────────────────────────────────────────────────
const PADDING_X_story2 = WORLD_WIDTH  * 0.02;
const PADDING_Y_story2 = WORLD_HEIGHT * 0.02;
const HAMLET_COUNT_story2 = 0;

const _S2_NO_CITY_FACTIONS = new Set(["Mongol Empire", "Bandits"]);

// =============================================================================
// QILIAN SPINE — curved polyline that defines the procedural mountain strip
// The strip is computed as: distance-to-spine + FBM warp, with a variable
// half-width.  No hard polygon — boundary blends into the dunes naturally.
// =============================================================================
const _S2_QILIAN_SPINE = [
    [-0.05, 0.620],
    [ 0.06, 0.665],
    [ 0.16, 0.720],
    [ 0.27, 0.785],
    [ 0.38, 0.855],
    [ 0.48, 0.910],
    [ 0.58, 0.960],
    [ 0.70, 1.020]
];

// =============================================================================
// OASIS ZONES — Plains patches around every city (UNCHANGED)
// =============================================================================
const _S2_OASIS_ZONES = [
    [ 0.03,  0.32,  0.010 ],  // Yumen Pass
    [ 0.07,  0.35,  0.028 ],  // Shazhou (Dunhuang)
    [ 0.14,  0.35,  0.014 ],  // Changle
    [ 0.18,  0.34,  0.022 ],  // Guazhou
    [ 0.29,  0.42,  0.038 ],  // Suzhou

    [ 0.43,  0.20,  0.024 ],  // Heishui Commandary (Khara-Khoto)
    [ 0.39,  0.50,  0.040 ],  // Ganzhou
    [ 0.51,  0.60,  0.032 ],  // Xiliang (Wuwei)
    [ 0.46,  0.67,  0.010 ],  // Renduo Spring

    [ 0.77,  0.25,  0.024 ],  // Wulahai
    [ 0.91,  0.34,  0.014 ],  // Sanjiaochuan
    [ 0.92,  0.37,  0.013 ],  // Heqing Circuit
    [ 0.96,  0.39,  0.013 ],  // Jinsu Circuit

    [ 0.72,  0.44,  0.020 ],  // Right Tributary Commandary
    [ 0.72,  0.51,  0.022 ],  // Dingzhou
    [ 0.72,  0.54,  0.044 ],  // Xingqing (Zhongxing) — capital
    [ 0.71,  0.57,  0.018 ],  // Shunzhou
    [ 0.72,  0.59,  0.018 ],  // Xiping
    [ 0.72,  0.66,  0.020 ],  // Jingsai Commandary

    [ 0.92,  0.52,  0.016 ],  // Left Tributary Commandary
    [ 0.86,  0.56,  0.024 ],  // Xiazhou
    [ 0.92,  0.58,  0.022 ],  // Yinzhou
    [ 0.88,  0.62,  0.014 ],  // Niuxinting
    [ 0.88,  0.64,  0.020 ],  // Longzhou (East)
    [ 0.86,  0.66,  0.016 ],  // Hongzhou
    [ 0.90,  0.72,  0.016 ],  // Sanchuankou
    [ 0.94,  0.74,  0.022 ],  // Yan'an

    [ 0.66,  0.73,  0.020 ],  // Xi'anzhou
    [ 0.64,  0.77,  0.016 ],  // Huizhou
    [ 0.81,  0.79,  0.020 ],  // Qingzhou
    [ 0.71,  0.82,  0.014 ],  // Haoshuichuan
    [ 0.74,  0.90,  0.016 ],  // Longzhou (South)
    [ 0.88,  0.98,  0.022 ],  // Fengxiang

    [ 0.46,  0.75,  0.024 ],  // Xining
    [ 0.49,  0.75,  0.016 ],  // Huangzhou
    [ 0.44,  0.81,  0.014 ],  // Jishi Circuit
    [ 0.58,  0.81,  0.028 ],  // Lanzhou
];

function _s2InOasis(nx, ny) {
    for (let i = 0; i < _S2_OASIS_ZONES.length; i++) {
        const cx = _S2_OASIS_ZONES[i][0];
        const cy = _S2_OASIS_ZONES[i][1];
        const r  = _S2_OASIS_ZONES[i][2];
        const dx = nx - cx, dy = ny - cy;
        if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
}

// Returns soft falloff (1.0 at oasis centre, 0 at edge) for blending
function _s2OasisStrength(nx, ny) {
    let best = 0;
    for (let i = 0; i < _S2_OASIS_ZONES.length; i++) {
        const cx = _S2_OASIS_ZONES[i][0];
        const cy = _S2_OASIS_ZONES[i][1];
        const r  = _S2_OASIS_ZONES[i][2];
        const dx = nx - cx, dy = ny - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < r) {
            const t = 1.0 - (d / r);
            const s = t * t * (3 - 2 * t);
            if (s > best) best = s;
        }
    }
    return best;
}

// =============================================================================
// RIVER COORDINATE ARRAYS — plotted from river_details_and_lakes reference
// All in normalised 0–1 world space.  Each array traces a real watercourse.
// (Unchanged from v2 — these are the canonical river polylines.)
// =============================================================================

// ── Yellow River — Main Channel (Ordos Loop) ──────────────────────────────────
const YELLOW_RIVER_MAIN = [
    [0.5800, 0.8100], [0.5825, 0.8015], [0.5860, 0.7930], [0.5905, 0.7845],
    [0.5960, 0.7760], [0.6025, 0.7675], [0.6095, 0.7590], [0.6170, 0.7505],
    [0.6250, 0.7420], [0.6315, 0.7335], [0.6365, 0.7250], [0.6405, 0.7165],
    [0.6440, 0.7080], [0.6480, 0.6995], [0.6525, 0.6910], [0.6575, 0.6825],
    [0.6625, 0.6740], [0.6665, 0.6655], [0.6700, 0.6570], [0.6730, 0.6485],
    [0.6755, 0.6400], [0.6775, 0.6315], [0.6795, 0.6230], [0.6820, 0.6145],
    [0.6855, 0.6060], [0.6895, 0.5975], [0.6940, 0.5890], [0.6975, 0.5805],
    [0.6995, 0.5720], [0.7010, 0.5635], [0.7020, 0.5550], [0.7025, 0.5465],
    [0.7025, 0.5380], [0.7020, 0.5295], [0.7010, 0.5210], [0.7005, 0.5125],
    [0.7010, 0.5040], [0.7030, 0.4955], [0.7065, 0.4870], [0.7110, 0.4785],
    [0.7160, 0.4700], [0.7205, 0.4615], [0.7245, 0.4530], [0.7275, 0.4445],
    [0.7300, 0.4360], [0.7325, 0.4275], [0.7355, 0.4190], [0.7395, 0.4105],
    [0.7445, 0.4020], [0.7495, 0.3935], [0.7535, 0.3850], [0.7565, 0.3765],
    [0.7590, 0.3680], [0.7615, 0.3595], [0.7645, 0.3510], [0.7680, 0.3425],
    [0.7715, 0.3340], [0.7750, 0.3255], [0.7775, 0.3170], [0.7790, 0.3085],
    [0.7795, 0.3000], [0.7795, 0.2915], [0.7790, 0.2830], [0.7780, 0.2745],
    [0.7765, 0.2660], [0.7745, 0.2575], [0.7725, 0.2490], [0.7715, 0.2405],
    [0.7725, 0.2320], [0.7760, 0.2235], [0.7820, 0.2150], [0.7905, 0.2065],
    [0.8010, 0.1980], [0.8125, 0.1915], [0.8245, 0.1870], [0.8360, 0.1855],
    [0.8475, 0.1870], [0.8585, 0.1915], [0.8690, 0.1980], [0.8785, 0.2065],
    [0.8870, 0.2150], [0.8950, 0.2235], [0.9030, 0.2320], [0.9110, 0.2405],
    [0.9195, 0.2490], [0.9285, 0.2575], [0.9380, 0.2660], [0.9475, 0.2745],
    [0.9565, 0.2830], [0.9645, 0.2915], [0.9715, 0.3000], [0.9775, 0.3085],
    [0.9830, 0.3170], [0.9880, 0.3255], [0.9930, 0.3340], [1.0000, 0.3425]
];

// ── Heishui River (Black Water / Hei River) ───────────────────────────────────
const HEISHUI_RIVER = [
    [0.3400, 0.5600], [0.3415, 0.5525], [0.3440, 0.5450], [0.3475, 0.5375],
    [0.3520, 0.5300], [0.3565, 0.5225], [0.3605, 0.5150], [0.3645, 0.5075],
    [0.3685, 0.5000], [0.3720, 0.4925], [0.3750, 0.4850], [0.3775, 0.4775],
    [0.3795, 0.4700], [0.3810, 0.4625], [0.3820, 0.4550], [0.3825, 0.4475],
    [0.3825, 0.4400], [0.3820, 0.4325], [0.3815, 0.4250], [0.3815, 0.4175],
    [0.3820, 0.4100], [0.3840, 0.4025], [0.3870, 0.3950], [0.3910, 0.3875],
    [0.3960, 0.3800], [0.4010, 0.3725], [0.4060, 0.3650], [0.4105, 0.3575],
    [0.4145, 0.3500], [0.4180, 0.3425], [0.4215, 0.3350], [0.4245, 0.3275],
    [0.4275, 0.3200], [0.4300, 0.3125], [0.4325, 0.3050], [0.4345, 0.2975],
    [0.4360, 0.2900], [0.4370, 0.2825], [0.4375, 0.2750], [0.4375, 0.2675],
    [0.4370, 0.2600], [0.4360, 0.2525], [0.4350, 0.2450], [0.4340, 0.2375],
    [0.4335, 0.2300], [0.4335, 0.2225], [0.4340, 0.2150], [0.4355, 0.2075],
    [0.4380, 0.2000], [0.4410, 0.1925], [0.4445, 0.1850], [0.4485, 0.1775],
    [0.4525, 0.1700], [0.4570, 0.1625], [0.4610, 0.1550], [0.4650, 0.1475]
];

// ── Southwest Plateau River (Tongtian / upper Yangtze tributary) ──────────────
const SOUTHWEST_PLATEAU_RIVER = [
    [0.1000, 0.9200], [0.1040, 0.9160], [0.1085, 0.9125], [0.1135, 0.9095],
    [0.1190, 0.9070], [0.1250, 0.9050], [0.1315, 0.9035], [0.1385, 0.9025],
    [0.1460, 0.9020], [0.1535, 0.9020], [0.1610, 0.9025], [0.1685, 0.9035],
    [0.1760, 0.9050], [0.1830, 0.9070], [0.1895, 0.9095], [0.1955, 0.9125],
    [0.2010, 0.9160], [0.2060, 0.9200], [0.2105, 0.9245], [0.2145, 0.9295],
    [0.2185, 0.9350], [0.2230, 0.9410], [0.2280, 0.9470], [0.2335, 0.9525],
    [0.2395, 0.9575], [0.2460, 0.9615], [0.2530, 0.9645], [0.2605, 0.9665],
    [0.2685, 0.9675], [0.2765, 0.9675], [0.2845, 0.9665], [0.2920, 0.9645],
    [0.2990, 0.9615], [0.3050, 0.9575], [0.3100, 0.9525], [0.3140, 0.9465]
];

// ── Huangshui River ───────────────────────────────────────────────────────────
const HUANGSHUI_RIVER = [
    [0.3500, 0.7100], [0.3521, 0.7110], [0.3542, 0.7119], [0.3563, 0.7129], [0.3584, 0.7138], [0.3605, 0.7148],
    [0.3626, 0.7157], [0.3647, 0.7167], [0.3668, 0.7176], [0.3689, 0.7186], [0.3710, 0.7195], [0.3731, 0.7205],
    [0.3752, 0.7214], [0.3773, 0.7224], [0.3794, 0.7233], [0.3815, 0.7243], [0.3836, 0.7252], [0.3857, 0.7262],
    [0.3878, 0.7271], [0.3899, 0.7281], [0.3920, 0.7290], [0.3941, 0.7300], [0.3962, 0.7309], [0.3983, 0.7319],
    [0.4004, 0.7328], [0.4025, 0.7338], [0.4046, 0.7347], [0.4067, 0.7357], [0.4088, 0.7366], [0.4109, 0.7376],
    [0.4130, 0.7385], [0.4151, 0.7395], [0.4172, 0.7404], [0.4193, 0.7414], [0.4214, 0.7423], [0.4235, 0.7433],
    [0.4256, 0.7442], [0.4277, 0.7452], [0.4298, 0.7461], [0.4319, 0.7471], [0.4340, 0.7480], [0.4361, 0.7490],
    [0.4382, 0.7499], [0.4403, 0.7509], [0.4424, 0.7518], [0.4445, 0.7528], [0.4466, 0.7537], [0.4487, 0.7547],
    [0.4508, 0.7556], [0.4529, 0.7566], [0.4550, 0.7575], [0.4571, 0.7585], [0.4592, 0.7594], [0.4613, 0.7604],
    [0.4634, 0.7613], [0.4655, 0.7623], [0.4676, 0.7632], [0.4697, 0.7642], [0.4718, 0.7651], [0.4739, 0.7661],
    [0.4760, 0.7670], [0.4781, 0.7680], [0.4802, 0.7689], [0.4823, 0.7699], [0.4844, 0.7708], [0.4865, 0.7718],
    [0.4886, 0.7727], [0.4907, 0.7737], [0.4928, 0.7746], [0.4949, 0.7756], [0.4970, 0.7765], [0.4991, 0.7775],
    [0.5012, 0.7784], [0.5033, 0.7794], [0.5054, 0.7803], [0.5075, 0.7813], [0.5096, 0.7822], [0.5117, 0.7832],
    [0.5138, 0.7841], [0.5159, 0.7851], [0.5180, 0.7860], [0.5201, 0.7870], [0.5222, 0.7879], [0.5243, 0.7889],
    [0.5264, 0.7898], [0.5285, 0.7908], [0.5306, 0.7917], [0.5327, 0.7927], [0.5348, 0.7936], [0.5369, 0.7946],
    [0.5390, 0.7955], [0.5411, 0.7965], [0.5432, 0.7974], [0.5453, 0.7984], [0.5474, 0.7993], [0.5495, 0.8003],
    [0.5516, 0.8012], [0.5537, 0.8022], [0.5558, 0.8031], [0.5579, 0.8041], [0.5600, 0.8050], [0.5621, 0.8060],
    [0.5642, 0.8069], [0.5663, 0.8079], [0.5684, 0.8088], [0.5705, 0.8098]
];

// ── Wuding River ──────────────────────────────────────────────────────────────
const WUDING_RIVER = [
    [0.7200, 0.5200], [0.7223, 0.5211], [0.7246, 0.5222], [0.7269, 0.5232], [0.7292, 0.5243], [0.7315, 0.5254],
    [0.7338, 0.5265], [0.7361, 0.5276], [0.7384, 0.5287], [0.7407, 0.5298], [0.7430, 0.5309], [0.7453, 0.5320],
    [0.7476, 0.5331], [0.7499, 0.5342], [0.7522, 0.5353], [0.7545, 0.5364], [0.7568, 0.5375], [0.7591, 0.5386],
    [0.7614, 0.5397], [0.7637, 0.5408], [0.7660, 0.5419], [0.7683, 0.5430], [0.7706, 0.5441], [0.7729, 0.5452],
    [0.7752, 0.5463], [0.7775, 0.5474], [0.7798, 0.5485], [0.7821, 0.5496], [0.7844, 0.5507], [0.7867, 0.5518],
    [0.7890, 0.5529], [0.7913, 0.5540], [0.7936, 0.5551], [0.7959, 0.5562], [0.7982, 0.5573], [0.8005, 0.5584],
    [0.8028, 0.5595], [0.8051, 0.5606], [0.8074, 0.5617], [0.8097, 0.5628], [0.8120, 0.5639], [0.8143, 0.5650],
    [0.8166, 0.5661], [0.8189, 0.5672], [0.8212, 0.5683], [0.8235, 0.5694], [0.8258, 0.5705], [0.8281, 0.5716],
    [0.8304, 0.5727], [0.8327, 0.5738], [0.8350, 0.5749], [0.8373, 0.5760], [0.8396, 0.5771], [0.8419, 0.5782],
    [0.8442, 0.5793], [0.8465, 0.5804], [0.8488, 0.5815], [0.8511, 0.5826], [0.8534, 0.5837], [0.8557, 0.5848],
    [0.8580, 0.5859], [0.8603, 0.5870], [0.8626, 0.5881], [0.8649, 0.5892], [0.8672, 0.5903], [0.8695, 0.5914],
    [0.8718, 0.5925], [0.8741, 0.5936], [0.8764, 0.5947], [0.8787, 0.5958], [0.8810, 0.5969], [0.8833, 0.5980],
    [0.8856, 0.5991], [0.8879, 0.6002], [0.8902, 0.6013], [0.8925, 0.6024], [0.8948, 0.6035], [0.8971, 0.6046],
    [0.8994, 0.6057], [0.9017, 0.6068], [0.9040, 0.6079], [0.9063, 0.6090], [0.9086, 0.6101], [0.9109, 0.6112],
    [0.9132, 0.6123], [0.9155, 0.6134], [0.9178, 0.6145], [0.9201, 0.6156], [0.9224, 0.6167], [0.9247, 0.6178],
    [0.9270, 0.6189], [0.9293, 0.6200], [0.9316, 0.6211], [0.9339, 0.6222], [0.9362, 0.6233], [0.9385, 0.6244],
    [0.9408, 0.6255], [0.9431, 0.6266], [0.9454, 0.6277], [0.9477, 0.6288], [0.9500, 0.6299], [0.9523, 0.6310],
    [0.9546, 0.6321], [0.9569, 0.6332], [0.9592, 0.6343], [0.9615, 0.6354], [0.9638, 0.6365], [0.9661, 0.6376],
    [0.9684, 0.6387], [0.9707, 0.6398], [0.9730, 0.6409], [0.9753, 0.6420], [0.9776, 0.6431], [0.9800, 0.6442]
];

// ── Shule River (Bulunggir River) ─────────────────────────────────────────────
const SHULE_RIVER = [
    [0.2800, 0.4200], [0.2776, 0.4190], [0.2752, 0.4180], [0.2728, 0.4169], [0.2704, 0.4159], [0.2680, 0.4149],
    [0.2656, 0.4139], [0.2632, 0.4128], [0.2608, 0.4118], [0.2584, 0.4108], [0.2560, 0.4098], [0.2536, 0.4087],
    [0.2512, 0.4077], [0.2488, 0.4067], [0.2464, 0.4057], [0.2440, 0.4046], [0.2416, 0.4036], [0.2392, 0.4026],
    [0.2368, 0.4016], [0.2344, 0.4005], [0.2320, 0.3995], [0.2296, 0.3985], [0.2272, 0.3975], [0.2248, 0.3964],
    [0.2224, 0.3954], [0.2200, 0.3944], [0.2176, 0.3934], [0.2152, 0.3923], [0.2128, 0.3913], [0.2104, 0.3903],
    [0.2080, 0.3893], [0.2056, 0.3882], [0.2032, 0.3872], [0.2008, 0.3862], [0.1984, 0.3852], [0.1960, 0.3841],
    [0.1936, 0.3831], [0.1912, 0.3821], [0.1888, 0.3811], [0.1864, 0.3800], [0.1840, 0.3790], [0.1816, 0.3780],
    [0.1792, 0.3770], [0.1768, 0.3759], [0.1744, 0.3749], [0.1720, 0.3739], [0.1696, 0.3729], [0.1672, 0.3718],
    [0.1648, 0.3708], [0.1624, 0.3698], [0.1600, 0.3688], [0.1576, 0.3677], [0.1552, 0.3667], [0.1528, 0.3657],
    [0.1504, 0.3647], [0.1480, 0.3636], [0.1456, 0.3626], [0.1432, 0.3616], [0.1408, 0.3606], [0.1384, 0.3595],
    [0.1360, 0.3585], [0.1336, 0.3575], [0.1312, 0.3565], [0.1288, 0.3554], [0.1264, 0.3544], [0.1240, 0.3534],
    [0.1216, 0.3524], [0.1192, 0.3513], [0.1168, 0.3503], [0.1144, 0.3493], [0.1120, 0.3483], [0.1096, 0.3472],
    [0.1072, 0.3462], [0.1048, 0.3452], [0.1024, 0.3442], [0.1000, 0.3431], [0.0976, 0.3421], [0.0952, 0.3411],
    [0.0928, 0.3401], [0.0904, 0.3390], [0.0880, 0.3380], [0.0856, 0.3370], [0.0832, 0.3360], [0.0808, 0.3349],
    [0.0784, 0.3339], [0.0760, 0.3329], [0.0736, 0.3319], [0.0712, 0.3308], [0.0688, 0.3298], [0.0664, 0.3288],
    [0.0640, 0.3278], [0.0616, 0.3267], [0.0592, 0.3257], [0.0568, 0.3247], [0.0544, 0.3237], [0.0520, 0.3226],
    [0.0496, 0.3216], [0.0472, 0.3206], [0.0448, 0.3196], [0.0424, 0.3185], [0.0400, 0.3175], [0.0376, 0.3165],
    [0.0352, 0.3155], [0.0328, 0.3144], [0.0304, 0.3134], [0.0280, 0.3124], [0.0256, 0.3114], [0.0232, 0.3104]
];

// ── Wei River ─────────────────────────────────────────────────────────────────
const WEI_RIVER = [
    [0.6500, 0.9500], [0.6526, 0.9503], [0.6552, 0.9505], [0.6578, 0.9508], [0.6604, 0.9511], [0.6630, 0.9513],
    [0.6656, 0.9516], [0.6682, 0.9519], [0.6708, 0.9521], [0.6734, 0.9524], [0.6760, 0.9527], [0.6786, 0.9529],
    [0.6812, 0.9532], [0.6838, 0.9535], [0.6864, 0.9538], [0.6890, 0.9540], [0.6916, 0.9543], [0.6942, 0.9546],
    [0.6968, 0.9548], [0.6994, 0.9551], [0.7020, 0.9554], [0.7046, 0.9556], [0.7072, 0.9559], [0.7098, 0.9562],
    [0.7124, 0.9564], [0.7150, 0.9567], [0.7176, 0.9570], [0.7202, 0.9573], [0.7228, 0.9575], [0.7254, 0.9578],
    [0.7280, 0.9581], [0.7306, 0.9583], [0.7332, 0.9586], [0.7358, 0.9589], [0.7384, 0.9591], [0.7410, 0.9594],
    [0.7436, 0.9597], [0.7462, 0.9599], [0.7488, 0.9602], [0.7514, 0.9605], [0.7540, 0.9608], [0.7566, 0.9610],
    [0.7592, 0.9613], [0.7618, 0.9616], [0.7644, 0.9618], [0.7670, 0.9621], [0.7696, 0.9624], [0.7722, 0.9626],
    [0.7748, 0.9629], [0.7774, 0.9632], [0.7800, 0.9634], [0.7826, 0.9637], [0.7852, 0.9640], [0.7878, 0.9643],
    [0.7904, 0.9645], [0.7930, 0.9648], [0.7956, 0.9651], [0.7982, 0.9653], [0.8008, 0.9656], [0.8034, 0.9659],
    [0.8060, 0.9661], [0.8086, 0.9664], [0.8112, 0.9667], [0.8138, 0.9669], [0.8164, 0.9672], [0.8190, 0.9675],
    [0.8216, 0.9678], [0.8242, 0.9680], [0.8268, 0.9683], [0.8294, 0.9686], [0.8320, 0.9688], [0.8346, 0.9691],
    [0.8372, 0.9694], [0.8398, 0.9696], [0.8424, 0.9699], [0.8450, 0.9702], [0.8476, 0.9705], [0.8502, 0.9707],
    [0.8528, 0.9710], [0.8554, 0.9713], [0.8580, 0.9715], [0.8606, 0.9718], [0.8632, 0.9721], [0.8658, 0.9723],
    [0.8684, 0.9726], [0.8710, 0.9729], [0.8736, 0.9731], [0.8762, 0.9734], [0.8788, 0.9737], [0.8814, 0.9740],
    [0.8840, 0.9742], [0.8866, 0.9745], [0.8892, 0.9748], [0.8918, 0.9750], [0.8944, 0.9753], [0.8970, 0.9756],
    [0.8996, 0.9758], [0.9022, 0.9761], [0.9048, 0.9764], [0.9074, 0.9766], [0.9100, 0.9769], [0.9126, 0.9772],
    [0.9152, 0.9775], [0.9178, 0.9777], [0.9204, 0.9780], [0.9230, 0.9783], [0.9256, 0.9785], [0.9282, 0.9788],
    [0.9308, 0.9791], [0.9334, 0.9793], [0.9360, 0.9796], [0.9386, 0.9799], [0.9412, 0.9802], [0.9438, 0.9804],
    [0.9464, 0.9807], [0.9490, 0.9810], [0.9516, 0.9812], [0.9542, 0.9815], [0.9568, 0.9818], [0.9594, 0.9820],
    [0.9620, 0.9823], [0.9646, 0.9826], [0.9672, 0.9828], [0.9698, 0.9831], [0.9724, 0.9834], [0.9750, 0.9836],
    [0.9776, 0.9839], [0.9802, 0.9842], [0.9828, 0.9845], [0.9854, 0.9847], [0.9880, 0.9850], [0.9906, 0.9853]
];

// =============================================================================
// LAKE POLYGON ARRAYS — non-elliptical polygon outlines in 0–1 world space
// =============================================================================

const LAKE_QINGHAI = [
    [0.3450, 0.6720], [0.3520, 0.6650], [0.3600, 0.6600], [0.3680, 0.6580],
    [0.3750, 0.6610], [0.3820, 0.6650], [0.3880, 0.6700], [0.3950, 0.6760],
    [0.4000, 0.6830], [0.4050, 0.6900], [0.4080, 0.6980], [0.4095, 0.7060],
    [0.4070, 0.7130], [0.4020, 0.7180], [0.3960, 0.7250], [0.3890, 0.7300],
    [0.3820, 0.7350], [0.3750, 0.7380], [0.3680, 0.7410], [0.3620, 0.7400],
    [0.3550, 0.7380], [0.3480, 0.7350], [0.3420, 0.7300], [0.3380, 0.7250],
    [0.3350, 0.7180], [0.3320, 0.7100], [0.3320, 0.7020], [0.3340, 0.6950],
    [0.3370, 0.6880], [0.3400, 0.6800], [0.3430, 0.6760]
];

const LAKE_HEISHUI = [
    [0.4400, 0.1650], [0.4430, 0.1620], [0.4470, 0.1600], [0.4500, 0.1580],
    [0.4540, 0.1590], [0.4570, 0.1610], [0.4600, 0.1640], [0.4630, 0.1680],
    [0.4650, 0.1720], [0.4670, 0.1760], [0.4660, 0.1800], [0.4640, 0.1840],
    [0.4600, 0.1880], [0.4560, 0.1910], [0.4520, 0.1940], [0.4480, 0.1960],
    [0.4440, 0.1970], [0.4400, 0.1950], [0.4360, 0.1930], [0.4330, 0.1900],
    [0.4310, 0.1870], [0.4300, 0.1830], [0.4290, 0.1800], [0.4285, 0.1760],
    [0.4310, 0.1730], [0.4330, 0.1700], [0.4360, 0.1680], [0.4380, 0.1670]
];

const LAKE_TWIN_WEST = [
    [0.5510, 0.4680], [0.5530, 0.4650], [0.5560, 0.4630], [0.5590, 0.4640],
    [0.5620, 0.4660], [0.5640, 0.4690], [0.5650, 0.4730], [0.5640, 0.4770],
    [0.5620, 0.4810], [0.5590, 0.4840], [0.5560, 0.4860], [0.5530, 0.4880],
    [0.5500, 0.4870], [0.5470, 0.4850], [0.5450, 0.4820], [0.5440, 0.4780],
    [0.5440, 0.4750], [0.5450, 0.4720], [0.5480, 0.4700], [0.5500, 0.4690]
];

const LAKE_TWIN_EAST = [
    [0.5810, 0.4660], [0.5840, 0.4640], [0.5870, 0.4630], [0.5900, 0.4650],
    [0.5930, 0.4680], [0.5950, 0.4720], [0.5960, 0.4760], [0.5940, 0.4800],
    [0.5910, 0.4840], [0.5880, 0.4870], [0.5850, 0.4890], [0.5820, 0.4880],
    [0.5790, 0.4850], [0.5760, 0.4820], [0.5740, 0.4780], [0.5730, 0.4740],
    [0.5740, 0.4700], [0.5760, 0.4680], [0.5790, 0.4670]
];

const LAKE_FAR_WEST = [
    [0.0880, 0.6800], [0.0910, 0.6770], [0.0940, 0.6760], [0.0970, 0.6780],
    [0.0990, 0.6810], [0.1000, 0.6850], [0.0980, 0.6890], [0.0950, 0.6920],
    [0.0910, 0.6930], [0.0880, 0.6910], [0.0860, 0.6880], [0.0850, 0.6840],
    [0.0860, 0.6820]
];

const _S2_ALL_LAKE_POLYS = [
    LAKE_QINGHAI, LAKE_HEISHUI, LAKE_TWIN_WEST, LAKE_TWIN_EAST, LAKE_FAR_WEST
];


// =============================================================================
// NOISE PRIMITIVES — local copies prefixed _s2 to avoid clashing with sandbox
// (The sandbox already exposes hash() / noise() / fbm() globally, but we want
//  our own deterministic seeds so swap-loading the campaign is reproducible.)
// =============================================================================

function _s2Hash(x, y) {
    let n = Math.sin(x * 12.9898 + y * 78.233 + 0.314) * 43758.5453123;
    return n - Math.floor(n);
}

function _s2Noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix,        fy = y - iy;
    const ux = fx * fx * (3.0 - 2.0 * fx);
    const uy = fy * fy * (3.0 - 2.0 * fy);
    const n00 = _s2Hash(ix,     iy    );
    const n10 = _s2Hash(ix + 1, iy    );
    const n01 = _s2Hash(ix,     iy + 1);
    const n11 = _s2Hash(ix + 1, iy + 1);
    const nx0 = n00 * (1 - ux) + n10 * ux;
    const nx1 = n01 * (1 - ux) + n11 * ux;
    return nx0 * (1 - uy) + nx1 * uy;
}

// Standard fractal Brownian motion — for soft fields (moisture, dune drift)
function _s2Fbm(x, y, oct) {
    if (oct == null) oct = 4;
    let v = 0, a = 0.5, f = 1.0;
    for (let i = 0; i < oct; i++) {
        v += a * _s2Noise(x * f, y * f);
        f *= 2.05;
        a *= 0.5;
    }
    return v;
}

// Ridged noise primitive — peaks at noise=0.5, valleys at 0/1
function _s2Ridge(x, y) {
    const n = _s2Noise(x, y);
    const r = 1.0 - Math.abs(2.0 * n - 1.0);
    return r * r;          // squared → sharpened crests
}

// Multi-octave ridged fractal — Musgrave-style with previous-octave weighting.
// Produces sharp ridge crests with deep transverse valleys (the look we want
// for the Qilian massif).  Output range ≈ [0, 1] with mean ≈ 0.32.
function _s2RidgeFbm(x, y, oct) {
    if (oct == null) oct = 5;
    let v = 0, a = 0.5, f = 1.0, prev = 1.0;
    for (let i = 0; i < oct; i++) {
        let r = _s2Ridge(x * f, y * f);
        r *= prev * 1.6;                 // amplify where previous octave was high
        if (r > 1) r = 1;
        v += a * r;
        prev = r;
        f *= 2.07;
        a *= 0.55;
    }
    return Math.max(0, Math.min(1, v * 1.15));
}

// =============================================================================
// MAP HELPER FUNCTIONS — distance to polyline / point-in-polygon
// =============================================================================

function _s2DistToSeg(px, py, x1, y1, x2, y2) {
    const C = x2 - x1, D = y2 - y1;
    const lenSq = C * C + D * D;
    const t = lenSq ? Math.max(0, Math.min(1, ((px - x1) * C + (py - y1) * D) / lenSq)) : 0;
    const dx = px - (x1 + t * C), dy = py - (y1 + t * D);
    return Math.sqrt(dx * dx + dy * dy);
}

// Minimum distance from (nx,ny) to any segment of a polyline
function _s2DistMinPolyline(nx, ny, pts) {
    let minD = 1e9;
    for (let k = 0; k < pts.length - 1; k++) {
        const d = _s2DistToSeg(
            nx, ny,
            pts[k][0],     pts[k][1],
            pts[k + 1][0], pts[k + 1][1]
        );
        if (d < minD) minD = d;
    }
    return minD;
}

function _s2PIP(px, py, poly) {
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

function _s2InLakeZone(nx, ny) {
    for (let i = 0; i < _S2_ALL_LAKE_POLYS.length; i++) {
        if (_s2PIP(nx, ny, _S2_ALL_LAKE_POLYS[i])) return true;
    }
    return false;
}

// Soft-falloff distance to nearest lake edge (0 outside, 1 at centre)
function _s2LakeStrength(nx, ny) {
    for (let i = 0; i < _S2_ALL_LAKE_POLYS.length; i++) {
        if (_s2PIP(nx, ny, _S2_ALL_LAKE_POLYS[i])) return 1.0;
    }
    return 0.0;
}

// =============================================================================
// QILIAN MOUNTAIN MASK — procedural strip with FBM-warped boundary
// Returns 1.0 deep inside the strip, 0 outside, smooth transition at the edge.
// =============================================================================
function _s2QilianMask(nx, ny) {
    // Distance to the Qilian spine
    const d = _s2DistMinPolyline(nx, ny, _S2_QILIAN_SPINE);

    // Half-width varies along the strip — fattest in the middle (around nx=0.32)
    // and thins out at the SW and SE ends.  Gives the "thin long strip" feel.
    const lengthFactor = Math.exp(-Math.pow((nx - 0.32) * 2.4, 2));
    const halfWidth    = 0.060 + 0.075 * lengthFactor;        // 0.06 – 0.135

    // Boundary noise — fuzzy organic edge that blends to dunes
    const edgeNoise = (_s2Fbm(nx * 4.7 + 11.3, ny * 4.7 + 19.1, 4) - 0.5) * 0.075;

    // Secondary high-frequency edge wobble
    const detailNoise = (_s2Fbm(nx * 14 + 33, ny * 14 + 41, 3) - 0.5) * 0.018;

    const warpedD = d - edgeNoise - detailNoise;

    if (warpedD <= halfWidth * 0.45) return 1.0;
    if (warpedD >= halfWidth)        return 0.0;

    const t = (halfWidth - warpedD) / (halfWidth * 0.55);
    return t * t * (3.0 - 2.0 * t);     // smoothstep
}

// =============================================================================
// QILIAN MOUNTAIN ELEVATION — ridged multifractal aligned to NW–SE trend
// Returns 0–1 elevation.  Sharp crests, deep crevices.
// =============================================================================
function _s2QilianElev(nx, ny) {
    // Rotate ~32° to align dominant ridge direction with the spine's NW–SE trend
    const cosA = Math.cos(0.560);
    const sinA = Math.sin(0.560);
    const u =  nx * cosA - ny * sinA;
    const v =  nx * sinA + ny * cosA;

    // Primary ridge field
    const e1 = _s2RidgeFbm(u *  6.5 + 1.7, v *  4.8 + 3.1, 5);

    // Secondary crossing field for transverse valleys
    const e2 = _s2RidgeFbm(v * 11.2 + 5.3, u *  9.4 + 7.7, 4);

    // Tertiary fine roughness
    const e3 = _s2RidgeFbm(u * 23.1 + 8.9, v * 19.4 + 2.5, 3);

    // Combine — primary dominates, secondaries add complexity
    let e = e1 * 0.62 + e2 * 0.28 + e3 * 0.10;

    // Boost central spine elevation slightly so peaks line up along the strip
    const spineDist  = _s2DistMinPolyline(nx, ny, _S2_QILIAN_SPINE);
    const spineBoost = Math.max(0, 0.045 - spineDist * 0.4);
    e += spineBoost;

    return Math.max(0, Math.min(1, e));
}

// Vegetation / forest patch noise — controls mint-green forested slopes
function _s2QilianVeg(nx, ny) {
    return _s2Fbm(nx * 7.2 + 4.4, ny * 7.2 + 9.1, 3);
}

// =============================================================================
// RIVER FIELD — noisy intensity 0–1 for tile-based river ribbons
// No polyline strokes anywhere on the canvas; rivers are drawn entirely
// by classifying tiles whose warped distance to a spine is small enough.
// =============================================================================

const _S2_RIVER_REGISTRY = [
    { pts: YELLOW_RIVER_MAIN,       thickness: 0.0140 },   // major
    { pts: HEISHUI_RIVER,           thickness: 0.0080 },
    { pts: HUANGSHUI_RIVER,         thickness: 0.0070 },
    { pts: SHULE_RIVER,             thickness: 0.0070 },
    { pts: WEI_RIVER,               thickness: 0.0065 },
    { pts: WUDING_RIVER,            thickness: 0.0060 },
    { pts: SOUTHWEST_PLATEAU_RIVER, thickness: 0.0060 }
];

function _s2RiverField(nx, ny) {
    // Meander warp — large, low-frequency to give curving banks
    const warpX = (_s2Fbm(nx * 20.0 +  4.7, ny * 20.0 +  1.3, 3) - 0.5) * 0.022;
    const warpY = (_s2Fbm(nx * 20.0 +  9.1, ny * 20.0 +  7.7, 3) - 0.5) * 0.022;

    // Width modulation — narrows and widens along the river
    const widthMod = 0.55 + _s2Fbm(nx * 30.0 + 13.0, ny * 30.0 + 17.0, 3) * 0.95;
    // High-frequency edge fuzz — gives ragged river-bank feel
    const edgeFuzz = (_s2Fbm(nx * 70.0 + 22.0, ny * 70.0 + 33.0, 2) - 0.5) * 0.0028;

    let bestI = 0;
    for (let r = 0; r < _S2_RIVER_REGISTRY.length; r++) {
        const reg = _S2_RIVER_REGISTRY[r];
        const d = _s2DistMinPolyline(nx + warpX, ny + warpY, reg.pts);
        const eff = reg.thickness * widthMod;
        const adjusted = d - edgeFuzz;
        if (adjusted < eff) {
            const i = 1.0 - Math.max(0, adjusted) / eff;
            if (i > bestI) bestI = i;
        }
    }
    return bestI;
}

// =============================================================================
// COLOR HELPERS
// =============================================================================

// Linear interpolate between two integer RGB triples
function _s2LerpRGB(r1, g1, b1, r2, g2, b2, t) {
    return [
        r1 + (r2 - r1) * t,
        g1 + (g2 - g1) * t,
        b1 + (b2 - b1) * t
    ];
}

function _s2RgbStr(r, g, b) {
    const ri = r < 0 ? 0 : r > 255 ? 255 : r | 0;
    const gi = g < 0 ? 0 : g > 255 ? 255 : g | 0;
    const bi = b < 0 ? 0 : b > 255 ? 255 : b | 0;
    return "rgb(" + ri + "," + gi + "," + bi + ")";
}

// =============================================================================
// MOUNTAIN COLOUR PICKER  — given elevation, slope shading, vegetation noise
// Returns an [R,G,B] triple in 0–255 range.  The RGB endpoints are tuned so
// the painted result mirrors the Google-Maps-style relief in the reference.
// =============================================================================
function _s2PickMountainColor(e, shading, vegN) {
    // shading in [0, 1] — 1 = direct light (highlight), 0 = full shadow
    let r, g, b;

    if (e > 0.78) {
        // SNOW & ICE — cool blue-white, lighter on lit faces
        const tri = _s2LerpRGB(160, 174, 192,   232, 240, 248, shading);
        r = tri[0]; g = tri[1]; b = tri[2];

    } else if (e > 0.65) {
        // ALPINE BARE ROCK — warm grey, snow-flecked highlights
        // Add a subtle snow-dust bleed where shading is very high (lit ridges)
        const baseTri  = _s2LerpRGB( 60,  52,  44,   202, 196, 184, shading);
        let rr = baseTri[0], gg = baseTri[1], bb = baseTri[2];
        if (shading > 0.78 && e > 0.72) {
            const k = (shading - 0.78) * 4.5 * (e - 0.72) * 6;
            const f = Math.min(0.35, k);
            rr = rr + (235 - rr) * f;
            gg = gg + (240 - gg) * f;
            bb = bb + (244 - bb) * f;
        }
        r = rr; g = gg; b = bb;

    } else if (e > 0.48) {
        // MID-SLOPE
        if (vegN > 0.56) {
            // Forested — mint/sage green slopes from reference image
            const tri = _s2LerpRGB(60, 86, 64,   168, 196, 152, shading);
            r = tri[0]; g = tri[1]; b = tri[2];
        } else {
            // Bare rocky scree, warm tan
            const tri = _s2LerpRGB(70, 56, 42,   188, 168, 138, shading);
            r = tri[0]; g = tri[1]; b = tri[2];
        }

    } else if (e > 0.32) {
        // LOWER MID-SLOPE — partly vegetated
        if (vegN > 0.50) {
            const tri = _s2LerpRGB(82, 100, 74,   188, 208, 162, shading);
            r = tri[0]; g = tri[1]; b = tri[2];
        } else {
            const tri = _s2LerpRGB(94, 76, 54,   200, 178, 148, shading);
            r = tri[0]; g = tri[1]; b = tri[2];
        }

    } else {
        // FOOTHILL  / blends into dunes
        if (vegN > 0.55) {
            const tri = _s2LerpRGB(108, 118, 86,   198, 210, 168, shading);
            r = tri[0]; g = tri[1]; b = tri[2];
        } else {
            const tri = _s2LerpRGB(122, 96, 64,   210, 188, 152, shading);
            r = tri[0]; g = tri[1]; b = tri[2];
        }
    }

    return [r, g, b];
}


// =============================================================================
// LAKE PAINTING — polygon fill + edge stroke + shimmer
// =============================================================================
function _s2DrawLakePoly(poly, fillColor, strokeColor, fillAlpha, strokeAlpha, strokeW) {
    if (!poly || poly.length < 3) return;
    bgCtx.save();
    bgCtx.beginPath();
    bgCtx.moveTo(poly[0][0] * WORLD_WIDTH, poly[0][1] * WORLD_HEIGHT);
    for (let k = 1; k < poly.length; k++) {
        bgCtx.lineTo(poly[k][0] * WORLD_WIDTH, poly[k][1] * WORLD_HEIGHT);
    }
    bgCtx.closePath();
    bgCtx.globalAlpha = fillAlpha;
    bgCtx.fillStyle   = fillColor;
    bgCtx.fill();
    bgCtx.globalAlpha = strokeAlpha;
    bgCtx.strokeStyle = strokeColor;
    bgCtx.lineWidth   = strokeW;
    bgCtx.stroke();
    bgCtx.restore();
}

function _s2DrawLakeShimmer(poly) {
    if (!poly || poly.length < 3) return;
    let cx = 0, cy = 0;
    for (let p = 0; p < poly.length; p++) {
        cx += poly[p][0];
        cy += poly[p][1];
    }
    cx = (cx / poly.length) * WORLD_WIDTH;
    cy = (cy / poly.length) * WORLD_HEIGHT;

    bgCtx.save();
    bgCtx.globalAlpha = 0.18;
    bgCtx.strokeStyle = "#a4d4e8";
    bgCtx.lineWidth   = 0.8;
    bgCtx.beginPath();
    bgCtx.moveTo(poly[0][0] * WORLD_WIDTH, poly[0][1] * WORLD_HEIGHT);
    for (let k = 1; k < poly.length; k++) {
        bgCtx.lineTo(poly[k][0] * WORLD_WIDTH, poly[k][1] * WORLD_HEIGHT);
    }
    bgCtx.closePath();
    bgCtx.clip();
    for (let r = 0; r < 7; r++) {
        const rx = cx + Math.sin(r * 71.3) * 0.022 * WORLD_WIDTH;
        const ry = cy + Math.cos(r * 63.7) * 0.018 * WORLD_HEIGHT;
        const rw = (8 + r * 3.6 + Math.sin(r * 47.1) * 4);
        bgCtx.beginPath();
        bgCtx.arc(rx, ry, rw, 0, Math.PI * 2);
        bgCtx.stroke();
    }
    bgCtx.restore();
}

// =============================================================================
// RIVER WATER COLOUR PICKER  (per-tile, varies with intensity)
// =============================================================================
function _s2RiverColor(intensity, sparkleSeed) {
    // intensity 0–1: deeper blue at centre, lighter at banks
    const t = intensity;
    // Bank → centre
    const tri = _s2LerpRGB(124, 168, 196,   54, 110, 152, t);
    let r = tri[0], g = tri[1], b = tri[2];
    // Add a small per-tile variation
    const v = (sparkleSeed - 0.5) * 18;
    r += v * 0.6;
    g += v * 0.9;
    b += v * 1.2;
    return [r, g, b];
}

// =============================================================================
// MAIN MAP GENERATION
// =============================================================================
async function generateMap_story2() {
    console.log("[Story2] Generating Hexi Corridor — Mongol Conquest of Western Xia (1226)…");

    // Detect mobile to pick sub-pixel resolution for the mountain pass
    const _isMobile = (typeof isMobile !== 'undefined') ? isMobile :
        (/Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 900);
    const SUB = _isMobile ? 8 : 4;     // sub-pixel block size for mtn detail

    // Background = base dune colour
    bgCtx.fillStyle = PALETTE.dune;
    bgCtx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    await setLoading(6, "Surveying the Hexi Corridor…");

    worldMap_story2 = [];

    // =========================================================================
    // PHASE 1 — FULL TILE CLASSIFICATION
    // Priority: lake > river > oasis > mountain > foothill > steppe > dune
    // =========================================================================
    for (let i = 0; i < COLS; i++) {
        worldMap_story2[i] = [];
        const nx = (i + 0.5) / COLS;
        if (i % 40 === 0) {
            await setLoading(6 + Math.floor((i / COLS) * 22), "Mapping terrain…");
        }
        for (let j = 0; j < ROWS; j++) {
            const ny = (j + 0.5) / ROWS;
            const hv = _s2Hash(i + 17, j + 31);

            let tileName, tileColor, speed = 0.6, elev = 0.4, moisture = 0.2;
            let impassable = false;
            let isRiver = false;

            // 1. LAKES
            if (_s2InLakeZone(nx, ny)) {
                tileName  = "Coastal";
                tileColor = PALETTE.coastal;
                speed = 0.30; elev = 0.05; moisture = 0.85; isRiver = true;

            // 2. RIVERS — noisy distance field, no centre stroke
            } else {
                const riverI = _s2RiverField(nx, ny);
                if (riverI > 0.10) {
                    tileName  = "River";
                    tileColor = PALETTE.coastal;
                    speed = 0.48; elev = 0.07; moisture = 0.78; isRiver = true;

                // 3. OASIS — cities sit in plains regardless of mountain mask
                } else if (_s2InOasis(nx, ny)) {
                    tileName  = "Plains";
                    tileColor = PALETTE.plains;
                    speed = 0.82; elev = 0.36; moisture = 0.50;

                } else {
                    // 4. QILIAN MOUNTAIN MASK
                    const mtnMask = _s2QilianMask(nx, ny);

                    if (mtnMask > 0.40) {
                        // Inside the strip
                        const e = _s2QilianElev(nx, ny);

                        if (e > 0.30) {
                            // All real mountain tiles unified as Large Mountains
                            // (matches the player's palette-name request)
                            tileName  = "Large Mountains";
                            tileColor = PALETTE.snow;            // "#7B5E3F"
                            speed = Math.max(0.22, 0.45 - e * 0.22);
                            elev  = e;
                            moisture = 0.10 + e * 0.15;
                        } else {
                            // Low elevation inside mask → highlands fringe
                            tileName  = "Highlands";
                            tileColor = PALETTE.highlands;       // "#626b42"
                            speed = 0.45;
                            elev = 0.40;
                            moisture = 0.18;
                        }

                    } else if (mtnMask > 0.10) {
                        // Foothill transition between mountain strip and dunes
                        const fe = 0.30 + 0.22 * Math.abs(_s2Noise(nx * 22, ny * 22) * 2 - 1);
                        if (fe > 0.40) {
                            tileName  = "Highlands";
                            tileColor = PALETTE.highlands;
                        } else {
                            tileName  = "Steppes";
                            tileColor = PALETTE.plains;
                        }
                        speed = 0.60; elev = fe; moisture = 0.20;

                    } else if (ny < 0.16) {
                        // 5. NORTH STEPPE (Mongolian steppe band)
                        tileName  = "Steppes";
                        tileColor = PALETTE.plains;
                        speed = 0.78;
                        elev = 0.30 + hv * 0.06;
                        moisture = 0.20;

                    } else if (nx > 0.62 && ny < 0.42 && hv > 0.55) {
                        // 6. ORDOS STEPPE — semi-arid pockets in the NE
                        tileName  = "Steppes";
                        tileColor = PALETTE.plains;
                        speed = 0.72; elev = 0.32; moisture = 0.16;

                    } else {
                        // 7. DEFAULT — Gobi / Hexi desert dunes
                        tileName  = "Dunes";
                        tileColor = PALETTE.dune;
                        speed = 0.62 + hv * 0.05;
                        elev  = 0.45 + hv * 0.04;
                        moisture = 0.22;
                    }
                }
            }

            worldMap_story2[i][j] = {
                name:       tileName,
                color:      tileColor,
                speed:      speed,
                impassable: impassable,
                e:          elev,
                m:          moisture,
                isRiver:    isRiver
            };
        }
    }

    await setLoading(30, "Painting base terrain…");

    // =========================================================================
    // PHASE 2 — BASE COLOUR FILL  (16-px tile resolution)
    // =========================================================================
    for (let i = 0; i < COLS; i++) {
        const px = i * TILE_SIZE;
        for (let j = 0; j < ROWS; j++) {
            const py = j * TILE_SIZE;
            bgCtx.fillStyle = worldMap_story2[i][j].color;
            bgCtx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }
    }

    await setLoading(36, "Drifting the dunes…");

    // =========================================================================
    // PHASE 3 — DUNE / DESERT SUBTLE TEXTURE
    // The user wants the dune areas to look "almost bare with nothing."
    // We use a low-frequency FBM colour modulation for soft tonal variation,
    // plus very rare wind streaks.  No crescent moons, no chevrons.
    // =========================================================================
    {
        // 8-px sub-cells for whole-map subtle dune drift
        const DSUB = _isMobile ? 16 : 8;
        const DCOLS = Math.ceil(WORLD_WIDTH  / DSUB);
        const DROWS = Math.ceil(WORLD_HEIGHT / DSUB);
        for (let si = 0; si < DCOLS; si++) {
            const nx = (si * DSUB + DSUB * 0.5) / WORLD_WIDTH;
            const px = si * DSUB;
            for (let sj = 0; sj < DROWS; sj++) {
                const ny = (sj * DSUB + DSUB * 0.5) / WORLD_HEIGHT;
                const py = sj * DSUB;

                // Skip any non-dune tile entirely
                const ti = Math.min(COLS - 1, (px / TILE_SIZE) | 0);
                const tj = Math.min(ROWS - 1, (py / TILE_SIZE) | 0);
                const t  = worldMap_story2[ti][tj];
                if (t.name !== "Dunes" && t.name !== "Steppes") continue;

                // Soft FBM tone variation — dune undulations, very subtle
                const dn = _s2Fbm(nx * 6.0 +  3.7, ny * 6.0 +  1.9, 4);     // 0–1
                const sandTone = (dn - 0.5) * 28;     // ±14 brightness shift

                // Slope-direction shading: faint NW-lit relief on the dune sea
                const dnL = _s2Fbm(nx * 6.0 + 3.6, ny * 6.0 + 1.8, 3);
                const dnR = _s2Fbm(nx * 6.0 + 3.8, ny * 6.0 + 2.0, 3);
                const dnU = _s2Fbm(nx * 6.0 + 3.7, ny * 6.0 + 1.7, 3);
                const dnD = _s2Fbm(nx * 6.0 + 3.7, ny * 6.0 + 2.1, 3);
                const gx = dnR - dnL;
                const gy = dnD - dnU;
                let lightFactor = -(gx * (-0.7071) + gy * (-0.7071)) * 80;
                if (lightFactor >  9) lightFactor =  9;
                if (lightFactor < -9) lightFactor = -9;

                let baseR, baseG, baseB;
                if (t.name === "Dunes") {
                    baseR = 207; baseG = 174; baseB = 126;     // PALETTE.dune
                } else {
                    baseR = 163; baseG = 160; baseB = 115;     // PALETTE.plains
                }
                const r = baseR + sandTone + lightFactor;
                const g = baseG + sandTone * 0.85 + lightFactor * 0.85;
                const b = baseB + sandTone * 0.55 + lightFactor * 0.55;

                bgCtx.fillStyle = _s2RgbStr(r, g, b);
                bgCtx.fillRect(px, py, DSUB, DSUB);
            }
        }
    }

    // Ultra-rare wind streaks on dune tiles only
    for (let i = 0; i < COLS; i += 1) {
        for (let j = 0; j < ROWS; j += 1) {
            const t = worldMap_story2[i][j];
            if (t.name !== "Dunes") continue;
            if (_s2Hash(i * 9 + 7, j * 11 + 13) < 0.985) continue;
            const px = i * TILE_SIZE;
            const py = j * TILE_SIZE;
            bgCtx.strokeStyle = "rgba(168, 138, 92, 0.22)";
            bgCtx.lineWidth = 0.6;
            bgCtx.beginPath();
            const sx = px + 2 + _s2Hash(i, j + 1) * 10;
            const sy = py + TILE_SIZE * 0.5 + (_s2Hash(i + 1, j) - 0.5) * 4;
            bgCtx.moveTo(sx, sy);
            bgCtx.lineTo(sx + 8, sy + (_s2Hash(i + 2, j) - 0.5) * 1.4);
            bgCtx.stroke();
        }
    }

    await setLoading(44, "Watering the oases…");

    // =========================================================================
    // PHASE 4 — OASIS SOFT GREEN GRADIENT  (around every city)
    // Replaces the harsh hard-edged plain blobs of v2 with smooth radial fades.
    // =========================================================================
    for (let z = 0; z < _S2_OASIS_ZONES.length; z++) {
        const zone = _S2_OASIS_ZONES[z];
        const cxPx = zone[0] * WORLD_WIDTH;
        const cyPx = zone[1] * WORLD_HEIGHT;
        const rPx  = zone[2] * WORLD_WIDTH;

        // Radial gradient for the oasis halo — fades to dune tan
        const grad = bgCtx.createRadialGradient(
            cxPx, cyPx, rPx * 0.10,
            cxPx, cyPx, rPx * 1.15
        );
        grad.addColorStop(0.00, "rgba(118, 138, 78, 0.55)");      // greenish core
        grad.addColorStop(0.45, "rgba(140, 152, 90, 0.38)");
        grad.addColorStop(0.85, "rgba(180, 168, 110, 0.18)");
        grad.addColorStop(1.00, "rgba(207, 174, 126, 0.00)");
        bgCtx.fillStyle = grad;
        bgCtx.beginPath();
        bgCtx.arc(cxPx, cyPx, rPx * 1.2, 0, Math.PI * 2);
        bgCtx.fill();

        // Sparse dark grass tufts in the bright core only
        const dotCount = 5 + ((rPx / 24) | 0);
        bgCtx.fillStyle = "rgba(82, 102, 56, 0.55)";
        for (let k = 0; k < dotCount; k++) {
            const a = (k / dotCount) * Math.PI * 2 + _s2Hash(z, k);
            const rr = rPx * (0.18 + _s2Hash(z * 3, k * 5) * 0.55);
            const tx = cxPx + Math.cos(a) * rr;
            const ty = cyPx + Math.sin(a) * rr;
            bgCtx.beginPath();
            bgCtx.arc(tx, ty, 1.4 + _s2Hash(k, z) * 1.4, 0, Math.PI * 2);
            bgCtx.fill();
        }
    }

    await setLoading(50, "Sculpting the Qilian ridges…");

    // =========================================================================
    // PHASE 5 — MOUNTAIN HIGH-RESOLUTION PAINTING
    // Per-pixel-ish slope shading + ridged-multifractal elevation gives the
    // Google-Maps relief look the player asked for.  Dune blend handled via
    // mtnMask alpha so the strip's edge is visually fuzzy.
    // =========================================================================
    {
        const SCOLS = Math.ceil(WORLD_WIDTH  / SUB);
        const SROWS = Math.ceil(WORLD_HEIGHT / SUB);
        const totalSub = SCOLS * SROWS;
        let scanCounter = 0;

        // Pre-cache neighbour deltas (in nx/ny space) for slope sampling
        const dNx = SUB * 0.55 / WORLD_WIDTH;
        const dNy = SUB * 0.55 / WORLD_HEIGHT;

        // Dune RGB used for blend at the strip edge
        const duneR = 207, duneG = 174, duneB = 126;

        for (let si = 0; si < SCOLS; si++) {
            const nx = (si * SUB + SUB * 0.5) / WORLD_WIDTH;
            const px = si * SUB;

            if ((si & 31) === 0) {
                const pct = 50 + Math.floor((si / SCOLS) * 30);
                await setLoading(pct, "Sculpting the Qilian ridges…");
            }

            for (let sj = 0; sj < SROWS; sj++) {
                const ny = (sj * SUB + SUB * 0.5) / WORLD_HEIGHT;
                const py = sj * SUB;

                const mask = _s2QilianMask(nx, ny);
                if (mask < 0.04) continue;

                // Skip painting over rivers/lakes/oases
                const ti = Math.min(COLS - 1, (px / TILE_SIZE) | 0);
                const tj = Math.min(ROWS - 1, (py / TILE_SIZE) | 0);
                const t  = worldMap_story2[ti][tj];
                if (t.name === "River" || t.name === "Coastal" ||
                    t.name === "Plains") continue;

                // Sample elevation at centre + 4 cardinal neighbours
                const eC = _s2QilianElev(nx,        ny       );
                const eL = _s2QilianElev(nx - dNx,  ny       );
                const eR = _s2QilianElev(nx + dNx,  ny       );
                const eU = _s2QilianElev(nx,        ny - dNy );
                const eD = _s2QilianElev(nx,        ny + dNy );

                const gx = (eR - eL);
                const gy = (eD - eU);

                // Hill-shading: light from NW (lx,ly) = (-1,-1)/√2
                // shading = clamp(0.5 - dot(grad, light) * k, 0, 1)
                let shading = 0.5 - (gx * (-0.7071) + gy * (-0.7071)) * 18.0;
                if (shading < 0) shading = 0;
                if (shading > 1) shading = 1;

                // Ridge highlight bonus where centre exceeds all 4 neighbours
                if (eC > eL && eC > eR && eC > eU && eC > eD && eC > 0.55) {
                    shading = Math.min(1, shading + 0.18);
                }
                // Crevice darkening at local minima
                if (eC < eL && eC < eR && eC < eU && eC < eD && eC < 0.42) {
                    shading = Math.max(0, shading - 0.20);
                }

                const vegN = _s2QilianVeg(nx, ny);

                const rgb = _s2PickMountainColor(eC, shading, vegN);
                let r = rgb[0], g = rgb[1], b = rgb[2];

                // Mask-blend with dune at the strip edge
                if (mask < 1.0) {
                    r = duneR + (r - duneR) * mask;
                    g = duneG + (g - duneG) * mask;
                    b = duneB + (b - duneB) * mask;
                }

                bgCtx.fillStyle = _s2RgbStr(r, g, b);
                bgCtx.fillRect(px, py, SUB, SUB);

                scanCounter++;
            }
        }

        // Sparse snow-flake speckles on the very highest tiles, post-pass
        // (Adds the feel of snow-dusted ridge crests in the reference image.)
        for (let i = 0; i < COLS; i++) {
            const nxT = (i + 0.5) / COLS;
            const px  = i * TILE_SIZE;
            for (let j = 0; j < ROWS; j++) {
                const t = worldMap_story2[i][j];
                if (t.name !== "Large Mountains") continue;
                if (t.e < 0.62) continue;
                const nyT = (j + 0.5) / ROWS;
                const m = _s2QilianMask(nxT, nyT);
                if (m < 0.6) continue;
                const py = j * TILE_SIZE;
                // 2–3 white speckles per very-high tile
                const n = 1 + ((_s2Hash(i, j) * 3) | 0);
                for (let k = 0; k < n; k++) {
                    const sx = px + _s2Hash(i, j + k) * TILE_SIZE;
                    const sy = py + _s2Hash(i + k, j) * TILE_SIZE;
                    bgCtx.fillStyle = "rgba(244, 248, 252, " + (0.45 + _s2Hash(i*3+k, j) * 0.30).toFixed(2) + ")";
                    bgCtx.beginPath();
                    bgCtx.arc(sx, sy, 0.6 + _s2Hash(j, i+k) * 0.6, 0, Math.PI * 2);
                    bgCtx.fill();
                }
            }
        }
    }

    await setLoading(80, "Raising the Qilian snow peaks…");

    // =========================================================================
    // PHASE 5c — SNOWY PEAK ICONS  (Large Mountains only)
    // Calls the same drawSnowyPeak() / getMountainAlpha() that sandboxmode
    // uses for its own mountains, so the two layers share identical geometry:
    //   • Jagged slate-blue base body
    //   • Bright white snow cap with a jagged frozen transition line
    //   • Cold blue-shadow on the east face
    //   • Crisp white highlight outline
    // Spawns sparsely; density is elevation-weighted so the densest clusters
    // sit on the highest ridge crests.  All offsets are deterministic so the
    // peaks don't shimmer/shuffle between sessions.
    // =========================================================================
    if (typeof drawSnowyPeak === 'function' && typeof getMountainAlpha === 'function') {
        const _peakThreshold = _isMobile ? 0.993 : 0.983;
        const _EDGE_PAD      = 500;

        for (let i = 0; i < COLS; i++) {
            const _pxT  = i * TILE_SIZE;
            const _nxT  = (i + 0.5) / COLS;

            for (let j = 0; j < ROWS; j++) {
                const _t = worldMap_story2[i][j];
                if (_t.name !== "Large Mountains") continue;

                // Only spawn inside the solid mountain core — keeps peaks away
                // from the soft dune-blend fringe at the strip boundary
                const _nyT = (j + 0.5) / ROWS;
                const _msk = _s2QilianMask(_nxT, _nyT);
                if (_msk < 0.52) continue;

                // Higher-elevation tiles get a slightly lower threshold →
                // they spawn more often, concentrating icons on ridge crests.
                // Use deterministic hash so peaks are stable across sessions.
                const _spawnT = _peakThreshold - (_t.e - 0.50) * 0.065;
                const _hv = (typeof hash === 'function')
                    ? hash(i, j)
                    : _s2Hash(i, j);
                if (_hv <= _spawnT) continue;

                // Water guard — no peak icons adjacent to river or lake tiles
                let _nearWater = false;
                outerPeak: for (let di = -1; di <= 1; di++) {
                    for (let dj = -1; dj <= 1; dj++) {
                        const _nb = worldMap_story2[i + di]?.[j + dj];
                        if (_nb && (_nb.name === "Coastal" || _nb.name === "River")) {
                            _nearWater = true;
                            break outerPeak;
                        }
                    }
                }
                if (_nearWater) continue;

                const _pyT = j * TILE_SIZE;

                // Scale 4 = same constant sandbox uses for Large Mountains
                const _sc = 4;

                // Deterministic positional jitter (no Math.random → no shimmer)
                const _ox = (_s2Hash(_nxT * 211 + 1.7, _nyT * 197 + 3.1) - 0.5) * 120;
                const _oy = (_s2Hash(_nxT * 197 + 5.3, _nyT * 211 + 7.7) - 0.5) * 120;

                const _baseH  = Math.max(8, (_t.e - 0.50) * 25 + 5);
                const _hVar   = (_s2Hash(i + 100, j + 200) - 0.5) * 15;
                const _wVar   = (_s2Hash(i + 200, j + 100) - 0.5) * 30;
                const _height = (_baseH * (_sc / 2.5)) + _hVar;
                const _width  = (TILE_SIZE * _sc) + _wVar;

                // Alpha: scales with elevation + mask strength, tapers at edges
                let _alpha = 0.72 + (_t.e - 0.50) * 0.22;    // 0.72 – 0.94
                _alpha = Math.min(_alpha, _msk * 1.08);        // fade with mask
                if (_pxT < _EDGE_PAD)
                    _alpha = Math.min(_alpha, _pxT / _EDGE_PAD);
                if (_pxT > WORLD_WIDTH  - _EDGE_PAD)
                    _alpha = Math.min(_alpha, (WORLD_WIDTH  - _pxT) / _EDGE_PAD);
                if (_pyT < _EDGE_PAD)
                    _alpha = Math.min(_alpha, _pyT / _EDGE_PAD);
                if (_pyT > WORLD_HEIGHT - _EDGE_PAD)
                    _alpha = Math.min(_alpha, (WORLD_HEIGHT - _pyT) / _EDGE_PAD);
                if (_alpha <= 0.04) continue;

                bgCtx.save();
                bgCtx.globalAlpha = _alpha;
                // isExtremePeak = true  →  pure-white snow cap (sandbox "extreme" path)
                drawSnowyPeak(bgCtx,
                    _pxT + _ox, _pyT + _oy,
                    _width, _height,
                    true,           // isExtremePeak → white cap
                    TILE_SIZE);
                bgCtx.restore();
            }
        }
    }

    await setLoading(82, "Carving the river beds…");

    // =========================================================================
    // PHASE 6 — RIVER & LAKE TILE PAINTING
    // Rivers are tile-coloured ribbons only.  Variable depth/edge from the
    // river-field intensity.  No centre polyline — exactly what the player
    // requested.  Sparse highlight ripples at sub-tile resolution.
    // =========================================================================
    for (let i = 0; i < COLS; i++) {
        const px = i * TILE_SIZE;
        const nx = (i + 0.5) / COLS;
        for (let j = 0; j < ROWS; j++) {
            const t = worldMap_story2[i][j];
            if (t.name !== "River" && t.name !== "Coastal") continue;
            const py = j * TILE_SIZE;
            const ny = (j + 0.5) / ROWS;

            // Determine intensity: 1 inside lake, river-field otherwise
            let intensity;
            if (t.name === "Coastal") {
                intensity = 0.95;
            } else {
                intensity = _s2RiverField(nx, ny);
                if (intensity < 0.10) intensity = 0.10;     // sanity floor
            }

            // Paint full tile with depth-graded water colour.  Sub-divide into
            // 4×4 cells for soft edge variation that doesn't look like a stripe.
            const SUB_R = 4;
            for (let cx = 0; cx < TILE_SIZE; cx += SUB_R) {
                const rx = (i + (cx + SUB_R * 0.5) / TILE_SIZE) / COLS;
                for (let cy = 0; cy < TILE_SIZE; cy += SUB_R) {
                    const ry = (j + (cy + SUB_R * 0.5) / TILE_SIZE) / ROWS;
                    let subI;
                    if (t.name === "Coastal") {
                        subI = 0.92;
                    } else {
                        subI = _s2RiverField(rx, ry);
                        if (subI < 0.08) subI = 0.08;
                    }
                    const seed = _s2Hash(i * 97 + cx, j * 89 + cy);
                    const col = _s2RiverColor(subI, seed);
                    bgCtx.fillStyle = _s2RgbStr(col[0], col[1], col[2]);
                    bgCtx.fillRect(px + cx, py + cy, SUB_R, SUB_R);
                }
            }

            // Sparse white shimmer arc on bigger river tiles
            if (intensity > 0.55 && _s2Hash(i + 7, j + 11) > 0.78) {
                bgCtx.strokeStyle = "rgba(214, 232, 244, 0.42)";
                bgCtx.lineWidth = 0.7;
                bgCtx.beginPath();
                const a0 = _s2Hash(i, j) * Math.PI * 2;
                const cxP = px + TILE_SIZE * 0.5 + (_s2Hash(i, j+1) - 0.5) * 4;
                const cyP = py + TILE_SIZE * 0.5 + (_s2Hash(i+1, j) - 0.5) * 4;
                bgCtx.arc(cxP, cyP, 1.6 + _s2Hash(i+1, j+1) * 1.4, a0, a0 + Math.PI * 0.7);
                bgCtx.stroke();
            }
        }
    }

    await setLoading(88, "Filling the lakes…");

    // =========================================================================
    // PHASE 7 — LAKES (polygon overlay for the bigger highland lakes)
    // The polygon-fill gives the lakes a clean shoreline that the noisy
    // tile-pass can't quite produce.  Drawn after rivers so they sit on top.
    // =========================================================================
    const _C_LAKE_FILL = "#3e7a98";
    const _C_LAKE_EDGE = "#2e6280";

    _s2DrawLakePoly(LAKE_QINGHAI,   _C_LAKE_FILL, _C_LAKE_EDGE, 0.86, 0.62, 1.8);
    _s2DrawLakePoly(LAKE_HEISHUI,   _C_LAKE_FILL, _C_LAKE_EDGE, 0.84, 0.58, 1.6);
    _s2DrawLakePoly(LAKE_TWIN_WEST, _C_LAKE_FILL, _C_LAKE_EDGE, 0.82, 0.56, 1.3);
    _s2DrawLakePoly(LAKE_TWIN_EAST, _C_LAKE_FILL, _C_LAKE_EDGE, 0.82, 0.56, 1.3);
    _s2DrawLakePoly(LAKE_FAR_WEST,  _C_LAKE_FILL, _C_LAKE_EDGE, 0.78, 0.54, 1.2);

    _s2DrawLakeShimmer(LAKE_QINGHAI);
    _s2DrawLakeShimmer(LAKE_HEISHUI);
    _s2DrawLakeShimmer(LAKE_TWIN_WEST);
    _s2DrawLakeShimmer(LAKE_TWIN_EAST);
    _s2DrawLakeShimmer(LAKE_FAR_WEST);

    await setLoading(94, "Aging parchment map…");

    // =========================================================================
    // PHASE 8 — FINAL PARCHMENT TINT & VIGNETTE
    // Lighter than v2 so the new mountain detail isn't muddied.
    // =========================================================================
    {
        const vGrad = bgCtx.createRadialGradient(
            WORLD_WIDTH * 0.50, WORLD_HEIGHT * 0.46, WORLD_WIDTH * 0.18,
            WORLD_WIDTH * 0.50, WORLD_HEIGHT * 0.46, WORLD_WIDTH * 0.86
        );
        vGrad.addColorStop(0.00, "rgba(0,0,0,0.00)");
        vGrad.addColorStop(0.65, "rgba(20,12,2,0.10)");
        vGrad.addColorStop(1.00, "rgba(0,0,0,0.28)");
        bgCtx.fillStyle = vGrad;
        bgCtx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

        // Very soft parchment multiply — keeps cohesive feel
        bgCtx.globalCompositeOperation = "multiply";
        bgCtx.fillStyle = "#ecdfc4";
        bgCtx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        bgCtx.globalCompositeOperation = "source-over";
    }

    console.log("[Story2] ✅ Hexi Corridor map — full procedural detail rendered.");
}


// =============================================================================
// SNAP TO PASSABLE TILE — used to nudge cities into a safe spot
// =============================================================================
function _s2SnapToPassable(px, py) {
    const gX = Math.floor(px / TILE_SIZE);
    const gY = Math.floor(py / TILE_SIZE);
    const _valid = (gx, gy) => {
        const t = worldMap_story2[gx]?.[gy];
        return t && !t.impassable;
    };
    if (_valid(gX, gY)) {
        return { x: gX * TILE_SIZE + TILE_SIZE * 0.5,
                 y: gY * TILE_SIZE + TILE_SIZE * 0.5 };
    }
    for (let r = 1; r <= 16; r++) {
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

// =============================================================================
// FIXED SETTLEMENTS — Western Xia, 1226  (UNCHANGED — coordinates preserved)
// =============================================================================
const FIXED_SETTLEMENTS_story2 = [

    // ── Far Western Corridor ──────────────────────────────────────────────────
    { name: "Yumen Pass",   nx: 0.03, ny: 0.32, pop:   800, isVillage: true,  faction: "Mongol Empire" },
    { name: "Shazhou",      nx: 0.07, ny: 0.35, pop:  6500, isVillage: false, faction: "Mongol Empire" },
    { name: "Changle",      nx: 0.14, ny: 0.35, pop:  1400, isVillage: true,  faction: "Mongol Empire" },
    { name: "Guazhou",      nx: 0.18, ny: 0.34, pop:  4800, isVillage: false, faction: "Mongol Empire" },

    // ── Suzhou — The Siege City ───────────────────────────────────────────────
    { name: "Suzhou",       nx: 0.29, ny: 0.42, pop:  9200, isVillage: false, faction: "Western Xia" },

    // ── Northern & Central ────────────────────────────────────────────────────
    { name: "Heishui Commandary", nx: 0.43, ny: 0.20, pop: 3200, isVillage: false, faction: "Mongol Empire" },
    { name: "Ganzhou",      nx: 0.39, ny: 0.50, pop: 12000, isVillage: false, faction: "Western Xia" },
    { name: "Xiliang",      nx: 0.51, ny: 0.60, pop:  8000, isVillage: false, faction: "Western Xia" },
    { name: "Renduo Spring",nx: 0.46, ny: 0.67, pop:   700, isVillage: true,  faction: "Western Xia" },

    // ── Northeastern / Mongol approach ────────────────────────────────────────
    { name: "Wulahai",      nx: 0.77, ny: 0.25, pop:  3500, isVillage: false, faction: "Mongol Empire" },
    { name: "Sanjiaochuan", nx: 0.91, ny: 0.34, pop:  1800, isVillage: true,  faction: "Western Xia" },
    { name: "Heqing Circuit",nx:0.92, ny: 0.37, pop:  1500, isVillage: true,  faction: "Western Xia" },
    { name: "Jinsu Circuit", nx: 0.96, ny: 0.39, pop:  1600, isVillage: true, faction: "Western Xia" },

    // ── Capital Region ────────────────────────────────────────────────────────
    { name: "Right Tributary Commandary", nx: 0.72, ny: 0.44, pop: 2500, isVillage: true,  faction: "Western Xia" },
    { name: "Dingzhou",     nx: 0.72, ny: 0.51, pop:  3200, isVillage: false, faction: "Western Xia" },
    { name: "Xingqing (Zhongxing)", nx: 0.72, ny: 0.54, pop: 18000, isVillage: false, faction: "Western Xia" },
    { name: "Shunzhou",     nx: 0.71, ny: 0.57, pop:  2200, isVillage: true,  faction: "Western Xia" },
    { name: "Xiping",       nx: 0.72, ny: 0.59, pop:  2800, isVillage: true,  faction: "Western Xia" },
    { name: "Jingsai Commandary", nx: 0.72, ny: 0.66, pop: 2400, isVillage: true, faction: "Western Xia" },

    // ── Eastern Region ────────────────────────────────────────────────────────
    { name: "Left Tributary Commandary", nx: 0.92, ny: 0.52, pop: 2000, isVillage: true,  faction: "Western Xia" },
    { name: "Xiazhou",      nx: 0.86, ny: 0.56, pop:  3500, isVillage: false, faction: "Western Xia" },
    { name: "Yinzhou",      nx: 0.92, ny: 0.58, pop:  4200, isVillage: false, faction: "Western Xia" },
    { name: "Niuxinting",   nx: 0.88, ny: 0.62, pop:  1500, isVillage: true,  faction: "Western Xia" },
    { name: "Longzhou",     nx: 0.88, ny: 0.64, pop:  2800, isVillage: true,  faction: "Western Xia" },
    { name: "Hongzhou",     nx: 0.86, ny: 0.66, pop:  2200, isVillage: true,  faction: "Western Xia" },
    { name: "Sanchuankou",  nx: 0.90, ny: 0.72, pop:  1800, isVillage: true,  faction: "Western Xia" },
    { name: "Yan'an",       nx: 0.94, ny: 0.74, pop:  3800, isVillage: false, faction: "Western Xia" },

    // ── Southern Region ───────────────────────────────────────────────────────
    { name: "Xi'anzhou",    nx: 0.66, ny: 0.73, pop:  2600, isVillage: true,  faction: "Western Xia" },
    { name: "Huizhou",      nx: 0.64, ny: 0.77, pop:  1900, isVillage: true,  faction: "Western Xia" },
    { name: "Qingzhou",     nx: 0.81, ny: 0.79, pop:  2800, isVillage: true,  faction: "Western Xia" },
    { name: "Haoshuichuan", nx: 0.71, ny: 0.82, pop:  1400, isVillage: true,  faction: "Western Xia" },
    { name: "Longzhou (South)", nx: 0.74, ny: 0.90, pop: 2200, isVillage: true, faction: "Western Xia" },
    { name: "Fengxiang",    nx: 0.88, ny: 0.98, pop:  4000, isVillage: false, faction: "Western Xia" },

    // ── Southwestern Region ───────────────────────────────────────────────────
    { name: "Xining",       nx: 0.46, ny: 0.75, pop:  4500, isVillage: false, faction: "Western Xia" },
    { name: "Huangzhou",    nx: 0.49, ny: 0.75, pop:  2000, isVillage: true,  faction: "Western Xia" },
    { name: "Jishi Circuit",nx: 0.44, ny: 0.81, pop:  1800, isVillage: true,  faction: "Western Xia" },
    { name: "Lanzhou",      nx: 0.58, ny: 0.81, pop:  5800, isVillage: false, faction: "Western Xia" },
];

// =============================================================================
// CITY POPULATION
// =============================================================================
function populateHistoricalCities_story2() {
    cities_story2 = [];
    FIXED_SETTLEMENTS_story2.forEach(site => {
        let px = site.nx * COLS * TILE_SIZE;
        let py = site.ny * ROWS * TILE_SIZE;
        let snapped = _s2SnapToPassable(px, py);
        if (!snapped) snapped = { x: px, y: py };
        cities_story2.push({
            name:         site.name,
            x:            snapped.x,
            y:            snapped.y,
            radius:       30,
            faction:      site.faction,
            pop:          site.pop,
            isVillage:    site.isVillage,
            isPlayerHome: site.name === "Suzhou"
        });
    });
}

function populateCities_story2() {
    console.log("[Story2] Founding Hexi Corridor oasis cities…");
    cities_story2 = [];
    populateHistoricalCities_story2();
}

// =============================================================================
// ENTRY POINT — initGame_story2
// =============================================================================
window.initGame_story2 = async function () {

    if (window.__gameStarted) return;
    window.__gameStarted = true;

    console.log("[Story2] 🏯 Launching Hexi Corridor — Suzhou Siege 1226…");

    // ── 1. Swap factions ──────────────────────────────────────────────────────
    if (typeof applyStory2Factions === 'function') {
        applyStory2Factions();
    } else {
        console.error("[Story2] applyStory2Factions() not found.");
    }

    // ── 2. Generate map ───────────────────────────────────────────────────────
    await generateMap_story2();

    // ── 3. Place settlements ──────────────────────────────────────────────────
    await setLoading(96, "Founding oasis garrisons and Mongol encampments…");
    populateCities_story2();

    // ── 4. Swap story2 data into shared engine arrays ─────────────────────────
    worldMap.length = 0;
    worldMap_story2.forEach((col, i) => { worldMap[i] = col; });
    cities.length = 0;
    cities_story2.forEach(c => cities.push(c));
    if (typeof worldMapRef !== 'undefined') worldMapRef = worldMap;

    window.cities_sandbox       = cities;
    window._tradeWorldRef       = worldMap;
    window.WORLD_WIDTH_sandbox  = (typeof WORLD_WIDTH  !== 'undefined') ? WORLD_WIDTH  : 4000;
    window.WORLD_HEIGHT_sandbox = (typeof WORLD_HEIGHT !== 'undefined') ? WORLD_HEIGHT : 3000;

    // Expose bg canvas (engine convention)
    window.__sandboxBgCanvas = bgCanvas;
    window.__sandboxBgCtx    = bgCtx;

    // ── 5. Spawn NPC armies ───────────────────────────────────────────────────
    await setLoading(97, "Deploying Tangut garrison and Mongol vanguard…");
    if (typeof initializeNPCs === 'function') {
        initializeNPCs(cities, worldMap, TILE_SIZE, COLS, ROWS,
                       PADDING_X_story2, PADDING_Y_story2);
    }

    // ── 6. Boot city interiors ────────────────────────────────────────────────
    await setLoading(98, "Building oasis walls, markets, and watchtowers…");
    if (typeof initAllCities === 'function') {
        await initAllCities(FACTIONS);
    }

    // ── 7. Place player near Suzhou ───────────────────────────────────────────
    const startCity =
        cities.find(c => c.name === "Suzhou") ||
        cities.find(c => {
            if (_S2_NO_CITY_FACTIONS.has(c.faction)) return false;
            const gx = Math.floor(c.x / TILE_SIZE);
            const gy = Math.floor(c.y / TILE_SIZE);
            return worldMap[gx]?.[gy] && !worldMap[gx][gy].impassable;
        });

    if (startCity) {
        player.x = startCity.x + 120;
        player.y = startCity.y + 120;
    } else {
        player.x = WORLD_WIDTH  * 0.34;
        player.y = WORLD_HEIGHT * 0.45;
    }

    player.faction = "Western Xia";
    player.enemies = ["Mongol Empire", "Bandits"];

    // ── 8. Show game UI ───────────────────────────────────────────────────────
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

    // ── 9. Install scenario triggers (campaign mode only) ─────────────────────
    if (window.__campaignStory2Active === true) {
        if (window.SuzhouScenario && typeof window.SuzhouScenario.install === 'function') {
            try {
                window.SuzhouScenario.install();
                console.log("[Story2] ✅ SuzhouScenario triggers installed.");
            } catch (err) {
                console.error("[Story2] SuzhouScenario.install() failed:", err);
            }
        } else {
            console.warn(
                "[Story2] SuzhouScenario not found. " +
                "Ensure mongolconquestxia_scenario.js is loaded before " +
                "story2_map_and_update.js."
            );
        }
    }

    // ── 10. Start render loop ─────────────────────────────────────────────────
    if (typeof draw === 'function') {
        draw();
    } else {
        console.error("[Story2] draw() not found — ensure sandboxmode_overworld.js is loaded.");
    }

    logGameEvent(
        "🏜️ 1226 — The dust columns are visible from the north wall. " +
        "Genghis Khan's host has crossed the Heishui. There is no relief. " +
        "Hold Suzhou.",
        "general"
    );
    console.log("[Story2] ✅ Suzhou 1226 initialised successfully.");
};