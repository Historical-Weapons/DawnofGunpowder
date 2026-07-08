// ============================================================================
// EMPIRE OF THE 13TH CENTURY - BATTLEFIELD TACTICAL ENGINE
// ============================================================================
// ★ FIX: declared with `var` (not `let`) specifically so window.BATTLE_WORLD_WIDTH
// and window.BATTLE_WORLD_HEIGHT automatically track every reassignment of these
// values anywhere in the codebase (river/naval/siege battles all reassign these
// plain identifiers below and in optimization-battles.js). A top-level `let` only
// creates a window property for its INITIAL value -- it would silently go stale
// the moment any battle-type-specific code reassigns BATTLE_WORLD_WIDTH/HEIGHT,
// which is exactly what was happening: code that explicitly checks
// window.BATTLE_WORLD_WIDTH/HEIGHT (enemyLandStrategyAI.js's clampToMap(),
// enemyCommanderAI.js's siege Y-cap) was always seeing the ORIGINAL declared
// value, never whatever the actual current battle's map size was.
var BATTLE_WORLD_WIDTH = 2400; 
var BATTLE_WORLD_HEIGHT = 3600; //3600 BEFORE
const BATTLE_TILE_SIZE = 8;
let BATTLE_COLS = Math.floor(BATTLE_WORLD_WIDTH / BATTLE_TILE_SIZE);
let BATTLE_ROWS = Math.floor(BATTLE_WORLD_HEIGHT / BATTLE_TILE_SIZE);

 let isBattlefieldReady = false;

let unitIdCounter = 0;
const VIEW_PADDING = 200;

function isOnScreen(unit, camera) {
    return (
        unit.x > camera.x - VIEW_PADDING &&
        unit.x < camera.x + camera.width + VIEW_PADDING &&
        unit.y > camera.y - VIEW_PADDING &&
        unit.y < camera.y + camera.height + VIEW_PADDING
    );
}

// Global state for battle exploration
let inBattleMode = false;
let currentBattleData = null;
let savedWorldPlayerState_Battle = { x: 0, y: 0 }; 

let battleEnvironment = {
    bgCanvas: null,
    fgCanvas: null, 
    treeFrontCanvas: null,
    grid: [],
    units: [],
    projectiles: [], 
    groundEffects: [],
    cityGates: [] 
};
// ★ FIX: top-level `let` does NOT create a `window.battleEnvironment` property
// the way `var` would in a classic (non-module) script -- it only creates a
// script-scope binding. Every plain `battleEnvironment` reference elsewhere
// in this codebase still works (sibling classic scripts share that scope),
// but any code that explicitly checks `window.battleEnvironment` (e.g.
// enemyLandStrategyAI.js's isLandBattle()/getEnemyUnits()/getPlayerUnits())
// was seeing `undefined` forever, even mid-battle with units on the field.
// This object is only ever MUTATED (.units.push, etc.) elsewhere in the
// codebase, never reassigned to a new object, so a one-time copy here stays
// valid for the whole page lifetime -- confirmed via full-codebase search.
window.battleEnvironment = battleEnvironment;

function isExitAllowed() {
    if (!inBattleMode || !isBattlefieldReady) return false;  
    
    const enemyCount = battleEnvironment.units.filter(u => u.side !== 'player' && u.hp > 0).length;
    const playerDead = player.hp <= 0;   
    
    return (playerDead || enemyCount === 0);
}
function generateBattleOrganicFeatures(grid, typeValue, count, maxSize) {
    if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle) return;
    if (window.inNavalBattle) return;  // naval grid is entirely managed by naval_battles.js
    for (let i = 0; i < count; i++) {
        // Pick a center point anywhere in the grid
        let centerX = Math.floor(Math.random() * BATTLE_COLS);
        let centerY = Math.floor(Math.random() * BATTLE_ROWS);
        
        // Spread the tiles around that center point
        let spread = maxSize; 
        for (let j = 0; j < spread * 5; j++) {
            let cx = centerX + Math.floor((Math.random() - 0.5) * spread);
            let cy = centerY + Math.floor((Math.random() - 0.5) * spread);

            if (cx >= 0 && cx < BATTLE_COLS && cy >= 0 && cy < BATTLE_ROWS) {
                if (grid[cx][cy] === 0) grid[cx][cy] = typeValue; 
            }
        }
    }
}

// ── SMALL-FEATURE QUALITY GATE ──────────────────────────────────────────────
// Mirrors _bptQL() in battlefield_procedural_terrain.js exactly (same tier
// reads, same thresholds) so the new small decorative terrain assets below
// (grid types 5 and 11, and the shrunk 8/9 mountain/karst features) follow
// the identical LOW/MED/HIGH/MAX convention already used by the procedural
// ground pass: LOW -> none of these cosmetic features at all, MED/HIGH/MAX ->
// scaled counts. River water itself (grid type 4) is NEVER gated -- it is
// drawn unconditionally in the grid loop regardless of tier.
// Land/river battles only -- siege and naval have their own terrain systems
// and are untouched by this gate or by grid types 5/8/9/11.
function _blSmallFeatureTier() {
    const tier = window.currentGraphicsQualityTier;
    if (tier === "MAX")                      return 3;
    if (tier === "HIGH")                     return 2;
    if (tier === "MED" || tier === "MEDIUM") return 1;
    if (!window._SETTINGS_IS_MOBILE)         return 2;   // desktop default = HIGH
    const mq = (typeof window.mobileBattleQuality === "number") ? window.mobileBattleQuality : 0;
    return mq >= 100 ? 2 : mq >= 50 ? 1 : 0;
}
// Scales a base cluster count by tier: LOW=0, MED=~55%, HIGH=100%, MAX=~140%.
function _blFeatureScale(baseCount) {
    const ql = _blSmallFeatureTier();
    if (ql < 1) return 0;
    if (ql === 1) return Math.max(1, Math.round(baseCount * 0.55));
    if (ql === 2) return baseCount;
    return Math.round(baseCount * 1.4);
}

// v4.7.0: optional onComplete callback. When omitted, behaves EXACTLY as
// before — fully synchronous, same return, same timing, zero behavioural
// change for any existing caller. When provided, the heavy column loop
// (the real bottleneck — see _gbfProcessColumn) runs in time-sliced chunks
// via setTimeout instead of one continuous block, so the browser gets to
// paint (and the loading screen's progress bar gets to genuinely animate)
// between chunks. onComplete(grid) fires once every column has been
// processed and all of the function's tail bookkeeping (tactical boundary,
// battleEnvironment.bgCanvas/grid/etc.) has run — i.e. exactly the point at
// which the old synchronous generateBattlefield() would have returned.
function generateBattlefield(worldTerrainType, onComplete) {
    const grid = Array.from({ length: BATTLE_COLS }, () => Array(BATTLE_ROWS).fill(0));
    // 1. BEFORE your grid loop starts (usually at the top of your draw function)
let peakAlreadyDrawn = false;
    let groundColor = "#767950"; 
    let treeColorPool = ["#2e4a1f", "#3a5f27", "#1f3315"];
    let rockColor = "#5c5c5c";

// Dense Forest (more trees than regular Forest)
if (worldTerrainType.includes("Dense Forest")) {
    groundColor = "#3a4228"; // Slightly darker green
    generateBattleOrganicFeatures(grid, 3, 40, 25); // Dense trees
    generateBattleOrganicFeatures(grid, 7, 20, 12); // More undergrowth
    // NEW: small decorative clutter -- fallen logs, fern clusters, mossy stones.
    // MED/HIGH/MAX only (LOW gets 0 via _blFeatureScale).
    window.__blSmallFeatureStyle = "forest_floor";
    generateBattleOrganicFeatures(grid, 11, _blFeatureScale(18), 6);
} 
// Sparse Forest
else if (worldTerrainType.includes("Forest")) {
    groundColor = "#425232";
    generateBattleOrganicFeatures(grid, 3, 18, 20); // Sparse trees
    generateBattleOrganicFeatures(grid, 7, 12, 10); // Sparse brush
    window.__blSmallFeatureStyle = "forest_floor";
    generateBattleOrganicFeatures(grid, 11, _blFeatureScale(12), 6);
}
// NEW SURGERY: STEPPE (Dry, Yellow, No Trees)
else if (worldTerrainType.includes("Steppe")) {
    groundColor = "#a3a073"; // Parched yellow-green
    // No trees (Type 3 removed)
    generateBattleOrganicFeatures(grid, 10, 60, 10); // Heavy dry grass texture
    generateBattleOrganicFeatures(grid, 7, 30, 8);   // Dry dirt/mud patches
    // NEW: dry shrub tufts + scattered pale stones, open steppe feel.
    window.__blSmallFeatureStyle = "steppe_scrub";
    generateBattleOrganicFeatures(grid, 11, _blFeatureScale(16), 8);
} 
// NEW SURGERY: PLAINS (Green, Occasional Rocks)
else if (worldTerrainType.includes("Plains")) {
    groundColor = "#6b7a4a"; // Soft plains green
    treeColorPool = ["#4e6b3e", "#3a522d"]; 
    rockColor = "#969696"; 
    
    generateBattleOrganicFeatures(grid, 10, 40, 12); // Lush grass texture
    generateBattleOrganicFeatures(grid, 6, 2, 10);   // Occasional rocks
    // NEW: wildflower clumps + low grass hummocks for visual variety.
    window.__blSmallFeatureStyle = "plains_wildflowers";
    generateBattleOrganicFeatures(grid, 11, _blFeatureScale(14), 8);
}
else if (worldTerrainType.includes("River")) {
    groundColor = "#6b7a4a";
    treeColorPool = ["#4e6b3e", "#3a522d", "#2d5a27"];
    rockColor = "#7a7a7a";

    generateBattleOrganicFeatures(grid, 3, 25, 15);
    generateBattleOrganicFeatures(grid, 7, 20, 10);
    // NEW: reed/riverbank clutter on the grassy banks. Gated by tier like every
    // other biome here -- but note the river itself (grid type 4, carved below)
    // is drawn completely unconditionally, at every quality tier including LOW.
    window.__blSmallFeatureStyle = "riverbank_reeds";
    generateBattleOrganicFeatures(grid, 11, _blFeatureScale(14), 6);

    const riverSeed = Math.random() * 1000;

    // Smooth interpolated value noise for the beach fade below — a raw
    // hash (sin(x*BIG_CONSTANT)) does NOT produce spatial correlation
    // between adjacent tiles no matter how small the frequency multiplier
    // is, since the large fixed constants dominate regardless (verified:
    // adjacent-tile variance was statistically identical to plain random).
    // This uses the same lattice-hash + smoothstep-interpolation technique
    // as _bNoise in battlefield_procedural_terrain.js, so nearby tiles
    // genuinely blend into each other — that's what turns the fade zone
    // into coherent sand patches/tendrils instead of per-tile static.
    const _bankHash = (x, y) => {
        const n = Math.sin(x * 12.9898 + y * 78.233 + riverSeed) * 43758.5453123;
        return n - Math.floor(n);
    };
    const _bankNoise = (x, y) => {
        const ix = Math.floor(x), iy = Math.floor(y);
        const fx = x - ix, fy = y - iy;
        const ux = fx*fx*(3-2*fx), uy = fy*fy*(3-2*fy); // smoothstep
        const a = _bankHash(ix,   iy),   b = _bankHash(ix+1, iy);
        const c = _bankHash(ix,   iy+1), d = _bankHash(ix+1, iy+1);
        return a*(1-ux)*(1-uy) + b*ux*(1-uy) + c*(1-ux)*uy + d*ux*uy;
    };

    for (let x = 0; x < BATTLE_COLS; x++) {
        
        // 1. THE PATH: 99% STRAIGHT
        // Reduced to a tiny 0.5 - 1.0 pixel waver. 
        // This is essentially a straight line that just "breathes" slightly.
        let pathNoise = Math.sin(x * 0.01 + riverSeed) * 0.8;
        let riverCenterY = (BATTLE_ROWS / 2) + pathNoise;

        // 2. THE WIDTH: STABLE
        // Minimal variance so the river doesn't "pulse" aggressively.
        let riverWidth = 24 + (Math.sin(x * 0.02 + riverSeed) * 1.5); 

        for (let y = 0; y < BATTLE_ROWS; y++) {
            let distY = Math.abs(y - riverCenterY);

            // 3. THE BANKS: SMOOTH BUT ORGANIC
            // SURGERY: Lowered multipliers from 3.0+ down to 0.5 and 1.2.
            // This creates "rolling" banks rather than "jagged" ones.
            let edgeNoise = 0;
            edgeNoise += Math.sin(x * 0.1 + y * 0.1 + riverSeed) * 0.6;   // Low jitter
            edgeNoise += Math.cos(x * 0.02 + y * 0.02) * 1.4;            // Soft rolling bank

            // Extra long-wavelength wobble on TOP of edgeNoise, sampled at a
            // lower frequency than edgeNoise's tight jitter — this is what
            // gives the beach's OUTER edge (the grass-ward side) its own
            // gentle wander independent of the tight waterline wobble, so
            // the beach doesn't just trace a fixed-width offset of the
            // water's edge. Real coastlines are wider in some stretches
            // than others; this is what produces that.
            // FIX: original frequency (0.006) only completed a fraction of
            // one cycle within a normal on-screen camera view (~30-60
            // tiles), so in practice the wander was invisible during play
            // even though it existed across the full map width. Raised so
            // the wobble completes a few cycles within a typical view.
            let beachWander = Math.sin(x * 0.035 + riverSeed * 1.7) * 3.5
                             + Math.cos(x * 0.08 + riverSeed * 0.6) * 1.8;

            let d = distY - riverWidth + edgeNoise;

            if (d < 0) {
                grid[x][y] = 4; // Water
            } else if (d < 4.0) {
                // 4. THE BEACH: WIDE SOLID SAND BAND
                // Widened from a 1.5-tile "shore line" to a full 4-tile sand
                // strip right at the waterline — this is the main visible
                // beach transition, deterministic (always present, not
                // speckled) so there's a real, reliable band of sand rather
                // than an inconsistent scatter of mud dots.
                grid[x][y] = 7;
            } else if (d < (14.0 + beachWander)) {
                // 5. THE FADE: LONG GRADUAL DISSOLVE INTO GRASS
                // Widened from 6 to ~14(±beachWander) tiles, and switched
                // from Math.random() static to deterministic noise sampled
                // at multiple frequencies, so the fade reads as an organic
                // coastline losing itself into the grass gradually rather
                // than a speckled mud scatter with a hard cutoff.
                //
                // FIX: the noise frequency here was originally 0.9/0.23 —
                // close to per-tile, which meant neighbouring tiles didn't
                // correlate and the fade rendered as isolated single-tile
                // sand specks poking into grass (visibly "noisy", not
                // coastline-like). Lowered by roughly 10x so the noise
                // field varies smoothly across several tiles at once,
                // producing coherent sand patches/tendrils that dissolve
                // into grass, the way a real tideline does, rather than
                // static.
                let fadeSpan = 14.0 + beachWander;
                let distanceFactor = Math.max(0, (d - 4.0)) / Math.max(1, (fadeSpan - 4.0));
                let fadeNoiseA = _bankNoise(x * 0.15, y * 0.22);
                let fadeNoiseB = _bankNoise(x * 0.05 + 50, y * 0.07 + 50);
                let fadeNoise = fadeNoiseA * 0.6 + fadeNoiseB * 0.4;
                // Probability of sand falls off as distanceFactor climbs
                // toward 1 — dense right after the solid band, sparse by
                // the outer edge.
                let threshold = distanceFactor * distanceFactor;

                if (fadeNoise > threshold) {
                    grid[x][y] = 7;
                }
            }
        }
    }
}
else if (worldTerrainType.includes("Desert") || worldTerrainType.includes("Dunes")) {
        groundColor = "#cfae7e";
        treeColorPool = ["#8b7e71", "#a68a5c"]; 
        // REVISED: Lowered count from 20 to 2, lowered maxSize from 250 to 15
        generateBattleOrganicFeatures(grid, 6, 2, 15);  
        generateBattleOrganicFeatures(grid, 7, 40, 10);  
        // NEW: dune ripple lines + sun-bleached scrub, breaks up the flat sand.
        window.__blSmallFeatureStyle = "desert_dunes";
        generateBattleOrganicFeatures(grid, 11, _blFeatureScale(14), 10);
    } 
	
// 1. HIGHLANDS: Rocky and brown, sparse vegetation
else if (worldTerrainType.includes("Highlands")) {
    groundColor = "#7d664b"; // Rocky brown
    treeColorPool = ["#5a5a3a", "#4a4a2a"]; // Desaturated, dry greens
    
    // Lower rock density for clusters
    generateBattleOrganicFeatures(grid, 6, 1, 12); // Fewer, smaller rock clusters
    generateBattleOrganicFeatures(grid, 3, 6, 10);  // Very few trees
    // NEW: dry gorse tufts + loose scree flecks scattered on the rocky brown ground.
    window.__blSmallFeatureStyle = "highland_scree";
    generateBattleOrganicFeatures(grid, 11, _blFeatureScale(16), 8);
}



else if (worldTerrainType.includes("Large Mountains")) {
    groundColor = "#7B5E3F"; // dark ground
    rockColor = "#2a2a2a";   // Dark grey for exposed rock faces

    // --- REVISED: armies are already standing ON the snowy peak, so the
    // old massive Himalayan-range silhouettes (grid type 8) don't belong
    // here anymore -- they read as scenery floating above the battle rather
    // than terrain the troops are fighting across. Type 8 is kept but now
    // draws a MUCH smaller single "high outcrop" (see draw loop below), and
    // it appears far less often. Most of the visual variety instead comes
    // from the new small features: jagged ice ridges (type 5) and general
    // snow-biome clutter (type 11) -- boulders, wind-scoured rock, drifts.
    generateBattleOrganicFeatures(
        grid,
        8,
        Math.max(0, _blFeatureScale(2)), // was 4-6 clusters of full mountains; now 0-3 small outcrops
        1 + Math.floor(Math.random() * 2)
    );

    // NEW: Ice ridges -- small jagged rock-and-ice spines, human/unit scale,
    // the kind of terrain feature you'd actually walk around, not over.
    window.__blSmallFeatureStyle = "snow_ice_ridge";
    generateBattleOrganicFeatures(grid, 5, _blFeatureScale(20), 5);

    // 3. Exposed Rock Formations (Boulders) -- unchanged, these were already small.
    generateBattleOrganicFeatures(grid, 6, 23, 3); 

    // 4. Textured Snow Drifts
    // Using Type 7 (Mud/Brush logic) but it will render as soft shadows on white ground
    generateBattleOrganicFeatures(grid, 7, 10, 12); 

    // NEW: general snow-biome clutter -- wind-scoured stones, frost-cracked
    // ground, sparse frozen scrub. Way more small assets scattered around
    // so the peak doesn't feel empty between the boulders/drifts.
    generateBattleOrganicFeatures(grid, 11, _blFeatureScale(22), 6);
}
	
// 2. TROPICAL HIGHLANDS (Jungle Karst): Steep, mossy, and humid
else if (worldTerrainType.includes("Mountain") && !worldTerrainType.includes("Large Mountains")) {
    groundColor = "#3E2723"; // Deep mossy/clay earth
    // Tropical Palette: Bright Limes, Deep Ferns, and Jungle Teals
    treeColorPool = ["#2d5a27", "#4a7c38", "#1e3d1a", "#5c913c"]; 
    rockColor = "#7a7a7a"; // Limestone grey

    // --- REVISED: karst pillars (type 9) shrunk further and appear less
    // densely -- keep a few as real hero terrain features (still bigger
    // than ground clutter, per design), but rely on the new small clutter
    // pass (type 11) for the "way more assets" variety: moss-slick boulders,
    // fern clumps, jungle leaf litter.
    generateBattleOrganicFeatures(grid, 9, Math.max(1, _blFeatureScale(2)), 30);

    // Dense Jungle Foliage
    generateBattleOrganicFeatures(grid, 3, 25, 15); 

    // Limestone Outcrops (Vertical rocks)
    generateBattleOrganicFeatures(grid, 6, 3, 12); 
    
    // Muddy patches/Dense undergrowth
    generateBattleOrganicFeatures(grid, 7, 15, 10);

    // NEW: jungle-floor clutter -- fern clumps, moss-slick stones, fallen
    // fronds -- scattered much more liberally than the pillars themselves.
    window.__blSmallFeatureStyle = "karst_jungle_floor";
    generateBattleOrganicFeatures(grid, 11, _blFeatureScale(24), 6);
}
	
	else {
        generateBattleOrganicFeatures(grid, 3, 60, 15);  
        generateBattleOrganicFeatures(grid, 4, 20, 12);  
        generateBattleOrganicFeatures(grid, 7, 30, 10);  
        // NEW: default clutter pass for any unrecognized terrain type string,
        // same as every named biome above.
        window.__blSmallFeatureStyle = "generic_clutter";
        generateBattleOrganicFeatures(grid, 11, _blFeatureScale(14), 8);
    }

    // --- SURGERY: CANVAS EXPANSION ---
    const VISUAL_PADDING = 0; // The size of the "Outer Bound" area
	
	// 1. Existing Background Canvas
const canvas = document.createElement('canvas');
canvas.width = BATTLE_WORLD_WIDTH + (VISUAL_PADDING * 2);
canvas.height = BATTLE_WORLD_HEIGHT + (VISUAL_PADDING * 2);
const ctx = canvas.getContext('2d');

// 2. NEW: Foreground Canvas
const fgCanvas = document.createElement('canvas');
fgCanvas.width = BATTLE_WORLD_WIDTH + (VISUAL_PADDING * 2);
fgCanvas.height = BATTLE_WORLD_HEIGHT + (VISUAL_PADDING * 2);
const fgCtx = fgCanvas.getContext('2d'); // small bushes/grass/leaf-litter — stays UNDER units

// 2b. NEW: Tree Canopy Front Canvas — tall tree canopies ONLY. Drawn on top
// of units/projectiles (unlike fgCanvas above), so trees visually overhang
// troops walking underneath, matching real top-down forest canopy look.
const treeFrontCanvas = document.createElement('canvas');
treeFrontCanvas.width = BATTLE_WORLD_WIDTH + (VISUAL_PADDING * 2);
treeFrontCanvas.height = BATTLE_WORLD_HEIGHT + (VISUAL_PADDING * 2);
const treeFrontCtx = treeFrontCanvas.getContext('2d');
	
 
// 1. Paint the "Infinite" Floor / Abyss
    if (typeof inNavalBattle !== 'undefined' && inNavalBattle) {
        ctx.fillStyle = "#000000"; // Deep Black Abyss for naval edges
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = groundColor; // Inner water color
        ctx.fillRect(VISUAL_PADDING, VISUAL_PADDING, BATTLE_WORLD_WIDTH, BATTLE_WORLD_HEIGHT);
    } else {
        ctx.fillStyle = groundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
	
    // 2. SURGERY: Decorative Outer Bound Textures
    // This populates the "Abyss" so it looks like a real world
    for (let i = 0; i < canvas.width; i += 60) {
        for (let j = 0; j < canvas.height; j += 60) {
            // Only draw if we are OUTSIDE the playable battle area
            if (i < VISUAL_PADDING || i > BATTLE_WORLD_WIDTH + VISUAL_PADDING || 
                j < VISUAL_PADDING || j > BATTLE_WORLD_HEIGHT + VISUAL_PADDING) {
                
                let rand = Math.random();
              if (rand > 0.98) { // Decorative Trees
					fgCtx.fillStyle = treeColorPool[Math.floor(Math.random() * treeColorPool.length)];
					fgCtx.beginPath();
					fgCtx.arc(i, j, 5 + (Math.random() * 8), 0, Math.PI * 2);
					fgCtx.fill();
				} else if (rand > 0.97) { // Decorative Rocks
					fgCtx.fillStyle = rockColor;
					fgCtx.beginPath();
					fgCtx.moveTo(i, j + 10);
					fgCtx.lineTo(i + 5, j);
					fgCtx.lineTo(i + 10, j + 10);
					fgCtx.fill();
				}
            }
        }
    }

    // 3. Shift the context so your original grid logic draws in the center
    ctx.save();
    ctx.translate(VISUAL_PADDING, VISUAL_PADDING);
	fgCtx.save();
	fgCtx.translate(VISUAL_PADDING, VISUAL_PADDING);
	treeFrontCtx.save();
	treeFrontCtx.translate(VISUAL_PADDING, VISUAL_PADDING);

    // ── HIGH/MAX ONLY: Procedural terrain ground pass ─────────────────────────
    // Applies subtle ridge noise, domain-warped FBM, and crossing ridge fields
    // over the flat ground fill to produce organic terrain variation.
    // Has an internal quality gate — returns immediately on LOW/MED.
    // Also skips siege and naval (guarded inside applyProceduralGroundPass).
    //
    // SEED: derived from the terrain type string (stable within a session for
    // the same map type) XOR'd with a per-battle random offset so each fight
    // on the same map type still looks different.
    //
    // v4.7.0 CHUNKING: at HIGH/MAX with the new sub-tile resolution (_bSubN
    // in battlefield_procedural_terrain.js), this pass alone is now heavy
    // enough to matter (benchmarked several seconds of raw compute at MAX
    // across a full battlefield). When generateBattlefield is running
    // chunked (onComplete given), this pass also runs chunked via its own
    // onComplete, and the rest of this function (_gbfProcessColumn/column
    // chunker) only starts once it's fully done. Everything below this call
    // is unchanged either way — function declarations are hoisted, so
    // _gbfProcessColumn and _restOfGenerateBattlefield can be called from
    // inside the async callback even though they're defined later in the
    // textual source.
    window.__battleTerrainProcApplied = false;
    const _bptBase = (typeof _bptStringSeed === "function") ? _bptStringSeed(worldTerrainType) : 0;
    const _bptSeed = (_bptBase + ((Math.random() * 9000) | 0)) % 10000;

    function _runProceduralPass(cb, chunked) {
        if (typeof applyProceduralGroundPass !== "function") { cb(); return; }
        if (chunked) {
            applyProceduralGroundPass(
                ctx, fgCtx, worldTerrainType, groundColor, _bptSeed,
                BATTLE_COLS, BATTLE_ROWS, BATTLE_TILE_SIZE, grid,
                cb   // chunked: applyProceduralGroundPass defers via setTimeout, calls cb when fully done
            );
        } else {
            // FIX: omit the callback arg entirely so applyProceduralGroundPass
            // takes its own synchronous branch (see its "typeof onComplete
            // !== 'function'" check) instead of being forced onto the chunked
            // setTimeout path just because *some* function was passed. Without
            // this, generateBattlefield's "synchronous, unchanged" branch would
            // silently return before the procedural pass had actually painted.
            applyProceduralGroundPass(
                ctx, fgCtx, worldTerrainType, groundColor, _bptSeed,
                BATTLE_COLS, BATTLE_ROWS, BATTLE_TILE_SIZE, grid
            );
            cb();
        }
    }

    if (typeof onComplete !== "function") {
        // Synchronous path: run the procedural pass synchronously right now
        // (exactly as before), then fall through to the rest of the function
        // below, which itself also takes the synchronous branch.
        _runProceduralPass(function(){}, false);
    }
    // ── END procedural pass dispatch ───────────────────────────────────────────

    // --- YOUR ORIGINAL GRID DRAWING LOOP (DO NOT DELETE) ---
    // v4.7.0 CHUNKING: the loop body below is 100% unchanged from before —
    // only the outer "for (let i...)" iteration mechanism changed, so this
    // function can process the grid in time-sliced batches instead of one
    // uninterrupted block (see _gbfProcessColumns / the chunked driver at
    // the end of generateBattlefield). _gbfProcessColumn(i) does exactly
    // what one iteration of the old "for (let i...)" loop did.
    function _gbfProcessColumn(i) {
        for (let j = 0; j < BATTLE_ROWS; j++) {
							let px = i * BATTLE_TILE_SIZE;
							let py = j * BATTLE_TILE_SIZE;

							if (grid[i][j] === 0 && Math.random() > 0.95) {
								ctx.fillStyle = "rgba(0,0,0,0.1)";
								ctx.fillRect(px + Math.random() * 4, py + Math.random() * 4, 3, 3);
							} 
							
 							else if (grid[i][j] === 3) { // Trees
									// 1. Deterministic Seed
									const treeSeed = (i * 1337 + j * 7331);
									const randomVisual = (n) => ((Math.abs(Math.sin(treeSeed * n)) * 1000) % 1);

									// 2. Constants
									const sizeMult = 2 + (randomVisual(1) * 12); 
									const radius = (BATTLE_TILE_SIZE / 2) * sizeMult;
									const cx = px + BATTLE_TILE_SIZE / 2;
									const cy = py + BATTLE_TILE_SIZE / 2;
									
									// 3. Selection & Biome Logic
									const treeColor = treeColorPool[Math.floor(randomVisual(2) * treeColorPool.length)];
									const isSnowyConifer = worldTerrainType.includes("Snowy") || (worldTerrainType.includes("Mountain") && worldTerrainType.includes("North"));
									const isHighland = worldTerrainType.includes("Mountain") && !worldTerrainType.includes("Snowy");

									// FRONT/BACK LAYER SPLIT: sizeMult is uniformly 2-14. The
									// larger ~80% of canopies (sizeMult > 4.4) read as full
									// trees and draw to treeFrontCtx, which renders AFTER units
									// so canopy visually overhangs troops underneath — matching
									// real top-down forest occlusion. The smaller ~20%
									// (sizeMult <= 4.4) read as low bushes/shrubs and stay on
									// fgCtx, which renders BEFORE units (stays under), same as
									// grass tufts/leaf litter/pebbles. This is a size-driven
									// split off the SAME existing random roll — no new RNG call,
									// so it doesn't change which tiles get which sizeMult.
									const isBigTree = sizeMult > 4.4;
									const drawCtx = isBigTree ? treeFrontCtx : fgCtx;
									drawCtx.fillStyle = treeColor;

									if (isSnowyConifer) {
										// --- ORIGINAL CONIFER LOGIC (Jurchen Forests / Alpine) ---
										drawCtx.beginPath();
										// Top Tier
										drawCtx.moveTo(cx, cy - radius * 1.8);
										drawCtx.lineTo(cx - radius * 0.7, cy - radius * 0.5);
										drawCtx.lineTo(cx + radius * 0.7, cy - radius * 0.5);
										drawCtx.fill();
										// Bottom Tier
										drawCtx.beginPath();
										drawCtx.moveTo(cx, cy - radius * 0.8);
										drawCtx.lineTo(cx - radius, cy + radius);
										drawCtx.lineTo(cx + radius, cy + radius);
										drawCtx.fill();
										// Depth Shadow
										drawCtx.fillStyle = "rgba(0,0,0,0.15)";
										drawCtx.beginPath();
										drawCtx.moveTo(cx, cy - radius * 1.8);
										drawCtx.lineTo(cx, cy + radius);
										drawCtx.lineTo(cx + radius, cy + radius);
										drawCtx.fill();

									} else if (isHighland) {
										// --- NEW SURGERY: TROPICAL CLOUD FOREST (Hmong Highlands) ---
										// Wide, umbrella-like banyan/tropical canopy
										drawCtx.beginPath();
										drawCtx.ellipse(cx, cy, radius, radius * 0.6, 0, 0, Math.PI * 2);
										drawCtx.ellipse(cx, cy - radius * 0.4, radius * 0.7, radius * 0.4, 0, 0, Math.PI * 2);
										drawCtx.fill();
										// Leaf Cluster Texturing
										drawCtx.fillStyle = "rgba(0,0,0,0.12)";
										drawCtx.beginPath();
										drawCtx.arc(cx + radius * 0.3, cy + radius * 0.1, radius * 0.3, 0, Math.PI * 2);
										drawCtx.arc(cx - radius * 0.4, cy, radius * 0.25, 0, Math.PI * 2);
										drawCtx.fill();

									} else {
										// --- ORIGINAL TEMPERATE LOGIC (Organic Blobs) ---
										drawCtx.beginPath();
										drawCtx.arc(cx, cy, radius, 0, Math.PI * 2);
										drawCtx.arc(cx - radius * 0.4, cy - radius * 0.2, radius * 0.6, 0, Math.PI * 2);
										drawCtx.arc(cx + radius * 0.3, cy + radius * 0.1, radius * 0.5, 0, Math.PI * 2);
										drawCtx.fill();
										// Highlight
										drawCtx.fillStyle = "rgba(255,255,255,0.12)";
										drawCtx.beginPath();
										drawCtx.arc(cx - radius * 0.2, cy - radius * 0.3, radius * 0.5, 0, Math.PI * 2);
										drawCtx.fill();
									}
								}
							
							
							else if (grid[i][j] === 4) { // Water
								ctx.fillStyle = "#3ba3ab";
								ctx.fillRect(px, py, BATTLE_TILE_SIZE, BATTLE_TILE_SIZE);
				} 

else if (grid[i][j] === 6) { // Rocks / Boulders
    const rockSeed = (i * 1337 + j * 7331);
    const rRand = (n) => ((Math.abs(Math.sin(rockSeed * n)) * 100) % 1);
    
    // Determine how many rocks in this tile (2 or 3)
    const numRocks = rRand(7) > 0.5 ? 3 : 2;

    for (let k = 0; k < numRocks; k++) {
        // Create unique offsets for each rock so they spread out from the center
        // We multiply k by a prime to ensure each of the 3 rocks gets a different position
        const offsetX = (rRand(k * 13 + 1) - 0.5) * BATTLE_TILE_SIZE * 0.8;
        const offsetY = (rRand(k * 17 + 2) - 0.5) * BATTLE_TILE_SIZE * 0.8;
        
        const rX = px + BATTLE_TILE_SIZE / 2 + offsetX;
        const rY = py + BATTLE_TILE_SIZE / 2 + offsetY;

        // Individual rock scaling (Keep them small so they don't overlap too much)
        const bW = BATTLE_TILE_SIZE * (0.3 + rRand(k * 5 + 3) * 0.4);
        const bH = BATTLE_TILE_SIZE * (0.2 + rRand(k * 3 + 4) * 0.3);

        // 1. Shadow Base (Subtle and offset)
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.ellipse(rX, rY + bH/3, bW/1.5, bH/2, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Main Rock Body (Jagged Shape)
        ctx.fillStyle = rockColor;
        ctx.beginPath();
        // We use rRand again to make each of the 3 rocks have a slightly different "jagged" profile
        const jitter = rRand(k * 9) * 2; 
        ctx.moveTo(rX - bW/2, rY + bH/2);
        ctx.lineTo(rX - bW/3 - jitter, rY - bH/2); 
        ctx.lineTo(rX + bW/4 + jitter, rY - bH/3); 
        ctx.lineTo(rX + bW/2, rY + bH/2);
        ctx.closePath();
        ctx.fill();

        // 3. Highlight (Top-left edge)
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rX - bW/3, rY + bH/4);
        ctx.lineTo(rX - bW/5, rY - bH/3);
        ctx.stroke();
    }
}
							
else if (grid[i][j] === 7) { // Beach / sand transition band
    // 1. Deterministic Seed for consistent ground noise
    const brushSeed = (i * 1337 + j * 7331);
    const bRand = (n) => ((Math.abs(Math.sin(brushSeed * n)) * 1000) % 1);

    // 2. Sand base — this used to be a small, nearly-invisible dark mud
    // arc (rgba(40,30,20,0.12), radius 0.4 tiles) sitting on top of the
    // full green groundColor fill underneath, which is why the beach
    // never actually read as sand. This is now a full-tile warm sand fill
    // so LOW/MED (which never run the HIGH/MAX procedural _bBeachPass)
    // still show a real beach, not grass with faint dark specks.
    const sandShade = 0.85 + bRand(9) * 0.3;
    const sr = (168 * sandShade) | 0, sg = (138 * sandShade) | 0, sb = (92 * sandShade) | 0;
    ctx.fillStyle = "rgb(" + sr + "," + sg + "," + sb + ")";
    ctx.fillRect(px, py, BATTLE_TILE_SIZE, BATTLE_TILE_SIZE);

    // 3. Grain speckle — small darker/lighter flecks for texture, same
    // idea as before but now visible against a sand base instead of a
    // green one.
    for (let s = 0; s < 3; s++) {
        const ox = bRand(s + 1) * BATTLE_TILE_SIZE;
        const oy = bRand(s + 2) * BATTLE_TILE_SIZE;
        const r = 0.5 + bRand(s + 3) * 1.4;
        const darker = bRand(s + 6) > 0.5;
        ctx.fillStyle = darker ? "rgba(90,68,42,0.18)" : "rgba(214,196,158,0.20)";

        ctx.beginPath();
        ctx.arc(px + ox, py + oy, r, 0, Math.PI * 2);
        ctx.fill();
    }
}
 
else if (grid[i][j] === 8) { // HIGH OUTCROP -- shrunk from the old "BIG MOUNTAIN Himalayan range".
    // REVISED: the army is already standing on the mountain, so a
    // screen-filling multi-peak range doesn't belong here anymore. This is
    // now a single, much smaller rocky/snow outcrop -- big enough to read as
    // a real terrain feature (bigger than the ground clutter in type 11),
    // but nowhere near the old "mountain range towering over the battle"
    // scale. Roughly 1/8th the old width and height.
    const peakSeed = (i * 1337 + j * 7331);
    const rand = (n) => ((Math.abs(Math.sin(peakSeed * n)) * 1000) % 1);

    const cx = px + BATTLE_TILE_SIZE / 2;
    const cy = py + BATTLE_TILE_SIZE / 2;

    // Single outcrop per tile now (was 3-4 peaks forming a whole range).
    const baseWidth = BATTLE_TILE_SIZE * (3 + rand(5) * 3);   // was 28-58
    const height = baseWidth * (0.8 + rand(8) * 0.6);          // was up to 1.7x width
    const peakX = cx + (rand(2) - 0.5) * (BATTLE_TILE_SIZE * 1.5);
    const baseY = cy + BATTLE_TILE_SIZE;

    ctx.save();

    // 1. Dark rock base
    ctx.fillStyle = "#4b5563";
    ctx.beginPath();
    ctx.moveTo(peakX - baseWidth, baseY);
    ctx.lineTo(peakX - baseWidth * (0.7 + rand(11) * 0.2), cy - height * (0.2 + rand(12) * 0.2));
    ctx.lineTo(peakX - baseWidth * (0.3 + rand(13) * 0.2), cy - height * (0.7 + rand(14) * 0.2));
    ctx.lineTo(peakX, cy - height); // summit
    ctx.lineTo(peakX + baseWidth * (0.3 + rand(15) * 0.2), cy - height * (0.7 + rand(16) * 0.2));
    ctx.lineTo(peakX + baseWidth * (0.7 + rand(17) * 0.2), cy - height * (0.2 + rand(18) * 0.2));
    ctx.lineTo(peakX + baseWidth, baseY);
    ctx.closePath();
    ctx.fill();

    // 2. Mid rock shadow
    ctx.fillStyle = "#6b7280";
    ctx.beginPath();
    ctx.moveTo(peakX - baseWidth * 0.6, baseY);
    ctx.lineTo(peakX - baseWidth * 0.3, cy - height * 0.5);
    ctx.lineTo(peakX, cy - height);
    ctx.lineTo(peakX + baseWidth * 0.3, cy - height * 0.5);
    ctx.lineTo(peakX + baseWidth * 0.6, baseY);
    ctx.closePath();
    ctx.fill();

    // 3. Small snow cap
    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.moveTo(peakX, cy - height);
    ctx.lineTo(peakX - baseWidth * 0.15, cy - height * (0.75 + rand(21) * 0.1));
    ctx.lineTo(peakX - baseWidth * 0.05, cy - height * (0.7 + rand(22) * 0.1));
    ctx.lineTo(peakX + baseWidth * 0.08, cy - height * (0.78 + rand(23) * 0.1));
    ctx.lineTo(peakX + baseWidth * 0.18, cy - height * (0.72 + rand(24) * 0.1));
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}
else if (grid[i][j] === 9) { // Tropical Karst Pillars (Hmong Highland Style)
    const peakSeed = (i * 1337 + j * 7331);
    const rand = (n) => ((Math.abs(Math.sin(peakSeed * n)) * 1000) % 1);
    
    // Draw 1-2 tightly packed pillars per tile (was 2-3, and each pillar is
    // itself smaller now -- REVISED per the same "smaller but more numerous
    // small features" pass as the snowy peak outcrops above).
    const pillarCount = rand(3) > 0.5 ? 2 : 1;
    for (let p = 0; p < pillarCount; p++) {
        const xOffset = (rand(p + 5) - 0.5) * (BATTLE_TILE_SIZE * 5);
        const pWidth = BATTLE_TILE_SIZE * (7 + rand(p + 10) * 7);  // was 15-30

        // Height ratio unchanged (already reduced 60% previously); shrinking
        // pWidth alone brings absolute pillar size down by more than half again.
        const pHeight = pWidth * (0.48 + rand(p + 15) * 0.32); 
        
        const cx = px + (BATTLE_TILE_SIZE / 2) + xOffset;
        const cy = py + BATTLE_TILE_SIZE / 2;

        ctx.save();
        
        // 1. The Pillar Body (Mossy Limestone)
        ctx.fillStyle = "#5c6350"; 
        ctx.beginPath();
        ctx.moveTo(cx - pWidth * 0.5, cy + BATTLE_TILE_SIZE);
        
        // Steep sides with a rounded "dome" top
        ctx.lineTo(cx - pWidth * 0.4, cy - pHeight * 0.6); // Steep wall
        ctx.quadraticCurveTo(cx, cy - pHeight, cx + pWidth * 0.4, cy - pHeight * 0.6); // Rounded summit
        ctx.lineTo(cx + pWidth * 0.5, cy + BATTLE_TILE_SIZE);
        ctx.fill();

        // 2. The Vegetation "Cap" (Lush Greenery on top)
        // Selecting from your treeColorPool for biome consistency
        ctx.fillStyle = treeColorPool[Math.floor(rand(p + 20) * treeColorPool.length)];
        ctx.beginPath();
        ctx.moveTo(cx - pWidth * 0.35, cy - pHeight * 0.7);
        ctx.quadraticCurveTo(cx, cy - pHeight - 5, cx + pWidth * 0.35, cy - pHeight * 0.7);
        ctx.lineTo(cx + pWidth * 0.2, cy - pHeight * 0.5);
        ctx.lineTo(cx - pWidth * 0.2, cy - pHeight * 0.5);
        ctx.fill();

        // 3. Humidity/Mist Shadow
        // Using a soft green-grey to simulate jungle mist at the base
        const mistGrad = ctx.createLinearGradient(cx, cy + BATTLE_TILE_SIZE, cx, cy - pHeight);
        mistGrad.addColorStop(0, "rgba(60, 80, 60, 0.2)");
        mistGrad.addColorStop(0.5, "rgba(0,0,0,0)");
        
        ctx.fillStyle = mistGrad;
        ctx.fillRect(cx - pWidth, cy - pHeight, pWidth * 2, pHeight + BATTLE_TILE_SIZE);

        ctx.restore();
    }
}

else if (grid[i][j] === 5) { // NEW: Small Ice Ridge (snowy mountain ground-scale feature)
    // Jagged rock-and-ice spine, unit scale -- something troops walk around,
    // not a scenic backdrop. Replaces most of the old towering type-8 range
    // as the primary visual feature on snowy peaks.
    const ridgeSeed = (i * 1337 + j * 7331);
    const rRand = (n) => ((Math.abs(Math.sin(ridgeSeed * n)) * 1000) % 1);

    const cx = px + BATTLE_TILE_SIZE / 2;
    const cy = py + BATTLE_TILE_SIZE / 2;
    const rWidth = BATTLE_TILE_SIZE * (1.4 + rRand(2) * 1.6);
    const rHeight = rWidth * (0.7 + rRand(4) * 0.5);
    const tilt = (rRand(6) - 0.5) * 0.6;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);

    // 1. Rock base (dark slate, same family as the outcrop above)
    ctx.fillStyle = "#525b66";
    ctx.beginPath();
    ctx.moveTo(-rWidth * 0.5, rHeight * 0.35);
    ctx.lineTo(-rWidth * 0.25, -rHeight * 0.5);
    ctx.lineTo(0, -rHeight * 0.65);
    ctx.lineTo(rWidth * 0.3, -rHeight * 0.45);
    ctx.lineTo(rWidth * 0.5, rHeight * 0.35);
    ctx.closePath();
    ctx.fill();

    // 2. Ice glaze along the upper edge (catches the light)
    ctx.fillStyle = "rgba(226, 240, 245, 0.85)";
    ctx.beginPath();
    ctx.moveTo(-rWidth * 0.22, -rHeight * 0.48);
    ctx.lineTo(0, -rHeight * 0.65);
    ctx.lineTo(rWidth * 0.28, -rHeight * 0.43);
    ctx.lineTo(rWidth * 0.1, -rHeight * 0.3);
    ctx.lineTo(-rWidth * 0.08, -rHeight * 0.32);
    ctx.closePath();
    ctx.fill();

    // 3. Shadow side
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.moveTo(-rWidth * 0.5, rHeight * 0.35);
    ctx.lineTo(-rWidth * 0.25, -rHeight * 0.5);
    ctx.lineTo(0, -rHeight * 0.2);
    ctx.lineTo(-rWidth * 0.1, rHeight * 0.35);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

else if (grid[i][j] === 11) { // NEW: General small-feature clutter, biome-styled
    // Shared "way more assets" clutter tile used by every biome above (Dense
    // Forest, Forest, Steppe, Plains, River, Desert/Dunes, Highlands, Large
    // Mountains, Karst, and the fallback). window.__blSmallFeatureStyle is
    // set right before each generateBattleOrganicFeatures(grid, 11, ...) call
    // so this one draw branch can render a biome-appropriate small asset
    // without needing a dozen new grid-type numbers. Land/river only -- this
    // whole branch is unreachable from siege/naval since generateBattlefield
    // is never called for those modes.
    const style = window.__blSmallFeatureStyle || "generic_clutter";
    const cSeed = (i * 1337 + j * 7331);
    const cRand = (n) => ((Math.abs(Math.sin(cSeed * n)) * 1000) % 1);
    const cx = px + BATTLE_TILE_SIZE / 2 + (cRand(1) - 0.5) * BATTLE_TILE_SIZE * 0.6;
    const cy = py + BATTLE_TILE_SIZE / 2 + (cRand(2) - 0.5) * BATTLE_TILE_SIZE * 0.6;
    const s = BATTLE_TILE_SIZE * (0.5 + cRand(3) * 0.6); // small asset scale

    ctx.save();

    if (style === "forest_floor") {
        // Fallen log + tiny fern tuft
        ctx.fillStyle = "rgba(60, 42, 24, 0.5)";
        ctx.beginPath();
        ctx.ellipse(cx, cy, s * 1.1, s * 0.35, cRand(4) * Math.PI, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3a5f27";
        for (let f = 0; f < 3; f++) {
            const fx = cx + (cRand(f + 5) - 0.5) * s;
            const fy = cy + (cRand(f + 6) - 0.5) * s * 0.6;
            ctx.beginPath();
            ctx.ellipse(fx, fy, s * 0.25, s * 0.1, cRand(f + 7), 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (style === "steppe_scrub") {
        // Dry shrub tuft: a few thin pale strokes fanning from a base point
        ctx.strokeStyle = "rgba(120, 110, 60, 0.5)";
        ctx.lineWidth = 1;
        for (let b = 0; b < 4; b++) {
            const ang = (b / 4) * Math.PI - Math.PI / 2 + (cRand(b + 8) - 0.5) * 0.6;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(ang) * s, cy + Math.sin(ang) * s - s * 0.3);
            ctx.stroke();
        }
    } else if (style === "plains_wildflowers") {
        // Small cluster of colored flower dots over a grass hummock
        ctx.fillStyle = "rgba(70, 100, 40, 0.35)";
        ctx.beginPath();
        ctx.ellipse(cx, cy, s * 0.9, s * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        const flowerColors = ["#e8d24a", "#e0e0e0", "#c86dd7"];
        for (let f = 0; f < 3; f++) {
            ctx.fillStyle = flowerColors[Math.floor(cRand(f + 9) * flowerColors.length)];
            const fx = cx + (cRand(f + 10) - 0.5) * s;
            const fy = cy + (cRand(f + 11) - 0.5) * s * 0.5;
            ctx.beginPath();
            ctx.arc(fx, fy, s * 0.12, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (style === "riverbank_reeds") {
        // Thin green reed blades near the water
        ctx.strokeStyle = "rgba(45, 90, 39, 0.6)";
        ctx.lineWidth = 1.2;
        for (let r = 0; r < 4; r++) {
            const bx = cx + (cRand(r + 12) - 0.5) * s;
            const bend = (cRand(r + 13) - 0.5) * s * 0.4;
            ctx.beginPath();
            ctx.moveTo(bx, cy + s * 0.4);
            ctx.quadraticCurveTo(bx + bend, cy - s * 0.2, bx + bend * 1.4, cy - s * 0.9);
            ctx.stroke();
        }
    } else if (style === "desert_dunes") {
        // Sand ripple arcs + a sparse pale scrub
        ctx.strokeStyle = "rgba(140, 110, 70, 0.3)";
        ctx.lineWidth = 1;
        for (let r = 0; r < 2; r++) {
            ctx.beginPath();
            ctx.arc(cx, cy + r * s * 0.3, s * (0.7 + r * 0.3), Math.PI * 0.15, Math.PI * 0.85);
            ctx.stroke();
        }
        if (cRand(14) > 0.5) {
            ctx.strokeStyle = "rgba(139, 126, 113, 0.5)";
            ctx.beginPath();
            ctx.moveTo(cx, cy + s * 0.3);
            ctx.lineTo(cx, cy - s * 0.4);
            ctx.stroke();
        }
    } else if (style === "highland_scree") {
        // Loose scree flecks + a single dry gorse tuft
        ctx.fillStyle = "rgba(90, 90, 90, 0.4)";
        for (let sc = 0; sc < 3; sc++) {
            const sx = cx + (cRand(sc + 15) - 0.5) * s;
            const sy = cy + (cRand(sc + 16) - 0.5) * s * 0.7;
            ctx.beginPath();
            ctx.arc(sx, sy, s * 0.12, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.strokeStyle = "rgba(90, 90, 58, 0.5)";
        ctx.beginPath();
        ctx.moveTo(cx, cy + s * 0.3);
        ctx.lineTo(cx - s * 0.15, cy - s * 0.4);
        ctx.moveTo(cx, cy + s * 0.3);
        ctx.lineTo(cx + s * 0.15, cy - s * 0.35);
        ctx.stroke();
    } else if (style === "snow_ice_ridge") {
        // (Not normally reached -- snow biome uses grid type 5 for its
        // signature feature. Kept as a safe fallback: small frost-cracked
        // stone if this style tag is ever set without a type-5 tile.)
        ctx.fillStyle = "rgba(120, 130, 140, 0.5)";
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.4, 0, Math.PI * 2);
        ctx.fill();
    } else if (style === "karst_jungle_floor") {
        // Fern clump + moss-slick stone
        ctx.fillStyle = "rgba(60, 60, 55, 0.5)";
        ctx.beginPath();
        ctx.ellipse(cx, cy + s * 0.2, s * 0.5, s * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#4a7c38";
        for (let fr = 0; fr < 4; fr++) {
            const ang = (fr / 4) * Math.PI * 2 + cRand(fr + 17);
            ctx.beginPath();
            ctx.ellipse(
                cx + Math.cos(ang) * s * 0.3,
                cy + Math.sin(ang) * s * 0.3 - s * 0.15,
                s * 0.35, s * 0.12, ang, 0, Math.PI * 2
            );
            ctx.fill();
        }
    } else {
        // generic_clutter fallback: small neutral stone
        ctx.fillStyle = "rgba(90, 90, 90, 0.4)";
        ctx.beginPath();
        ctx.ellipse(cx, cy, s * 0.5, s * 0.3, cRand(18), 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

else if (grid[i][j] === 10) { // GRASS TEXTURE
    const grassSeed = (i * 1337 + j * 7331);
    const gRand = (n) => ((Math.abs(Math.sin(grassSeed * n)) * 1000) % 1);

    // Pick a color slightly darker than the ground for contrast
    ctx.strokeStyle = worldTerrainType.includes("Steppe") ? "rgba(100, 80, 20, 0.15)" : "rgba(40, 60, 20, 0.15)";
    ctx.lineWidth = 1;

    const cx = px + BATTLE_TILE_SIZE / 2;
    const cy = py + BATTLE_TILE_SIZE / 2;

    // Draw 2-3 small blades of grass
    for (let g = 0; g < 2; g++) {
        const offX = (gRand(g) - 0.5) * BATTLE_TILE_SIZE;
        const offY = (gRand(g + 1) - 0.5) * BATTLE_TILE_SIZE;
        const gH = 2 + gRand(g + 2) * 3; // Blade height

        ctx.beginPath();
        // Simple "V" shape for grass
        ctx.moveTo(cx + offX - 1, cy + offY);
        ctx.lineTo(cx + offX, cy + offY - gH);
        ctx.lineTo(cx + offX + 1, cy + offY);
        ctx.stroke();
    }
}
			
				
        } // end for(j)
    } // end _gbfProcessColumn

    // Shared tail bookkeeping — identical to what always ran right after the
    // old synchronous "for (let i...)" loop finished. Factored into a
    // function so both the synchronous and chunked paths below call the
    // exact same code instead of duplicating it.
    function _gbfFinish() {
        // 4. SURGERY: The Red Tactical Boundary
        ctx.strokeStyle = "rgba(255, 0, 0, 0.6)";
        ctx.lineWidth = 8;
        ctx.setLineDash([15, 15]); // Makes it look like a tactical UI line
        ctx.strokeRect(0, 0, BATTLE_WORLD_WIDTH, BATTLE_WORLD_HEIGHT);
        ctx.setLineDash([]); // Reset for other drawings

        ctx.restore(); // Back to global canvas space

        // Store state
        battleEnvironment.bgCanvas = canvas;
        battleEnvironment.fgCanvas = fgCanvas; // <--- ADD THIS LINE
        battleEnvironment.treeFrontCanvas = treeFrontCanvas; // big tree canopies — drawn OVER units
        battleEnvironment.grid = grid;
        battleEnvironment.groundColor = "#000000";
        battleEnvironment.visualPadding = VISUAL_PADDING; // Store this for the camera!

        // SURGERY: Capture the real terrain name + computed ground tone for the
        // minimap (minimap.js). Does NOT touch the existing groundColor line above
        // (kept as-is to avoid changing the "infinite floor" abyss rendering that
        // already depends on it) — these are separate, additive properties.
        battleEnvironment.terrainType  = worldTerrainType;
        battleEnvironment.minimapColor = groundColor;
    }

    if (typeof onComplete !== "function") {
        // ── SYNCHRONOUS PATH (default, unchanged) ──────────────────────────
        // No callback given → run every column right now, exactly as the
        // original single "for (let i...)" loop always did. Any existing
        // caller that doesn't pass a callback sees byte-for-byte identical
        // timing and behaviour to before this change.
        for (let i = 0; i < BATTLE_COLS; i++) {
            _gbfProcessColumn(i);
        }
        _gbfFinish();
        return grid;
    }

    // ── CHUNKED PATH (opt-in via onComplete) ────────────────────────────────
    // v4.7.0 FIX: generateBattlefield's column loop (and, at HIGH/MAX, the
    // procedural terrain pass above) are the biggest costs in battle setup
    // (up to 300x450+ tiles, and at MAX a 4x4 sub-tile shading grid on top).
    // Run either as one continuous block and the loading screen's progress
    // bar cannot animate — the main thread can't paint or fire any timer
    // callback mid-block (see the _wrapLaunchFn comments in
    // battle-loading-screen.js for the full writeup). Processing a handful
    // of columns per setTimeout tick lets the browser paint between chunks,
    // so the percentage the player sees is now tied to real, ongoing work
    // instead of jumping 0%→100% in one tick.
    //
    // window.__gbfProgress is read by _battleIsReady()/_runLoadingGate() in
    // battle-loading-screen.js to drive the visible percentage while THIS
    // function is still running (i.e. before battleEnvironment.units even
    // exists yet, which is what the old readiness check depended on).
    // Weighted 40/60 between the procedural pass and the tile loop — the
    // procedural pass is the heavier of the two at MAX, but skipped
    // entirely at LOW/MED (applyProceduralGroundPass's own internal gate),
    // so the weighting only matters when it's actually running.
    window.__gbfProgress = { done: false, pct: 0 };

    _runProceduralPass(function () {
        window.__gbfProgress.pct = 40;

        const COLS_PER_CHUNK = Math.max(1, Math.round(BATTLE_COLS / 40)); // ~40 chunks total
        let _col = 0;

        function _gbfChunk() {
            const end = Math.min(BATTLE_COLS, _col + COLS_PER_CHUNK);
            for (; _col < end; _col++) {
                _gbfProcessColumn(_col);
            }
            const tileFrac = BATTLE_COLS > 0 ? (_col / BATTLE_COLS) : 1;
            window.__gbfProgress.pct = Math.round(40 + tileFrac * 60);

            if (_col < BATTLE_COLS) {
                setTimeout(_gbfChunk, 0);
            } else {
                _gbfFinish();
                window.__gbfProgress.done = true;
                window.__gbfProgress.pct  = 100;
                try { onComplete(grid); } catch (e) { console.error("[generateBattlefield] onComplete threw:", e); }
            }
        }
        _gbfChunk();
    }, true);
    // No return value on the chunked path — callers MUST use onComplete(grid).
}


function enterBattlefield(enemyNPC, playerObj, currentWorldMapTile) {
    if (inCityMode) return; 

// ---> FIX 1: FLUSH FLAGS & RESET BOUNDS <---
    window.inNavalBattle = false;
    window.inRiverBattle = (currentWorldMapTile && currentWorldMapTile.name === "River");

    // If it's a river battle, ensure world bounds are set to the land engine's 
    // expected size so the "Abyss Fix" doesn't kick in unnecessarily.
    if (window.inRiverBattle) {
        BATTLE_WORLD_WIDTH = 2400; 
        BATTLE_WORLD_HEIGHT = 1200; 
    }
    window.inRiverBattle = (currentWorldMapTile && currentWorldMapTile.name === "River");
// --- NAVAL BATTLE HOOK ---
    const tileName = currentWorldMapTile.name || "Plains";
    
    // ---> FIX 2: REMOVE RIVER FROM NAVAL SPAWNER <---
    if (tileName === "Ocean" || tileName === "Coastal") {
        
        // 1. Flush Keys & UI to prevent ghost inputs
        if (typeof keys !== 'undefined') { for (let k in keys) keys[k] = false; }
    closeParleUI();
    const panel = document.getElementById('parle-panel');
    if (panel) panel.style.display = 'none';
    inBattleMode = true;
    window.inBattleMode = true;  // explicit for mobile_ui / BLS checks (mirrors custom_naval_launcher.js)

    // 2. Setup Battle Data
    currentBattleData = {
        enemyRef: enemyNPC,
        playerFaction: playerObj.faction || "Hong Dynasty",
        enemyFaction: enemyNPC.faction,
        initialCounts: { player: 0, enemy: 0 },
        playerColor: (typeof FACTIONS !== 'undefined' && FACTIONS[playerObj.faction]) ? FACTIONS[playerObj.faction].color : "#ffffff",
        enemyColor: (typeof FACTIONS !== 'undefined' && FACTIONS[enemyNPC.faction]) ? FACTIONS[enemyNPC.faction].color : "#000000"
    };

	// 3. Initialize the Naval Map
	// === NAVAL BATTLEFIELD 10x LARGER ===
	// 50000×32000 = 1.6 billion sq units — vast ocean for sailing.
	// Identical to custom_naval_launcher map dimensions.
	 BATTLE_WORLD_WIDTH = 50000; 
	 BATTLE_WORLD_HEIGHT = 32000;
	 
	 // Prevents the physical grid array from cutting off at the center of the ship
	 BATTLE_COLS = Math.floor(BATTLE_WORLD_WIDTH / BATTLE_TILE_SIZE);
	 BATTLE_ROWS = Math.floor(BATTLE_WORLD_HEIGHT / BATTLE_TILE_SIZE);
	 
	 initNavalBattle(enemyNPC, playerObj, tileName, playerObj.troops || 0, enemyNPC.count || 0);
    savedWorldPlayerState_Battle.x = playerObj.x;
    savedWorldPlayerState_Battle.y = playerObj.y;
    
    // 4. DEPLOY THE TROOPS
    let playerTroopCount = playerObj.troops || 0; 
    let totalCombatants = playerTroopCount + enemyNPC.count;
    // ── FIX 4: Per-side cap with ratio preservation ─────────────────────────
    // Sandbox/story: each side is capped at window.maxSandboxBattleTroops (default 100).
    // Larger side hits the cap exactly; smaller side scales down by the same factor so
    // the ratio (e.g. 20 vs 400 → 5 vs 100) is preserved. Custom battles bypass.
    if (window.__IS_CUSTOM_BATTLE__) {
        window.GLOBAL_BATTLE_SCALE = totalCombatants > 400 ? Math.ceil(totalCombatants / 300) : 1;
    } else {
        const _cap = Math.max(20, Math.min(300, window.maxSandboxBattleTroops || 100));
        const _largerSide = Math.max(playerTroopCount, enemyNPC.count || 0);
        window.GLOBAL_BATTLE_SCALE = (_largerSide > _cap) ? (_largerSide / _cap) : 1;
    }
    
    deployNavalArmy(currentBattleData.playerFaction, playerTroopCount, "player"); 
    deployNavalArmy(enemyNPC.faction, enemyNPC.count, "enemy");

    // 5. Snap Camera to Commander
    let deployedCmdr = battleEnvironment.units.find(u => u.isCommander && u.side === "player");
    if (deployedCmdr) { 
        playerObj.x = deployedCmdr.x; 
        playerObj.y = deployedCmdr.y; 
    } else { 
        playerObj.x = BATTLE_WORLD_WIDTH / 2; 
        playerObj.y = BATTLE_WORLD_HEIGHT/2 + 45; 
    }
    
// 7. Audio & Cinematic FX
    if (typeof AudioManager !== 'undefined') {
        AudioManager.init();
        
        // ---> ADD THIS LINE TO TRIGGER THE 3-SECOND MUTE <---
        AudioManager.clearAllSFXForBattle(); 

        AudioManager.playMP3('music/battlemusic.mp3', false);
    }
	
	 
    if (typeof triggerEpicZoom === 'function') {
        triggerEpicZoom(0.6, 1.5, 3500);
    }

    // Show ship joysticks — sandbox/parle naval path must call this explicitly.
    // The battle-loading-screen wrapper adds ~1120ms of screen + fade delay before
    // the battle goes live. The single 400ms retry fires during that window, and
    // if NavalHelmUI isn't ready yet it silently fails with no further fallback.
    // Mirror custom_naval_launcher.js: call immediately + 3 deferred retries so
    // at least the 1000ms or 1500ms shot lands after both the loading screen clears
    // AND NavalHelmUI is guaranteed to exist.
    (function _sandboxForceHelmWithFallbacks() {
        function _tryForce() {
            if (window.NavalHelmUI && window.inNavalBattle) {
                window.NavalHelmUI.forceNavalHelm();
            }
        }
        _tryForce();             // immediate
        setTimeout(_tryForce, 100);   // after first rAF
        setTimeout(_tryForce, 400);   // parity with old single retry
        setTimeout(_tryForce, 1000);  // after BLS loading screen (~1120ms) clears
        setTimeout(_tryForce, 1500);  // belt-and-suspenders final shot
    })();
     
    return; // Stop the regular land/siege battle generator from running!
}
// --- END NAVAL BATTLE HOOK ---

if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle) {
        // SURGERY: Fallback to 300x200 if city variables are missing
        let cols = (typeof CITY_COLS !== 'undefined') ? CITY_COLS : 300;
        let rows = (typeof CITY_ROWS !== 'undefined') ? CITY_ROWS : 200;
        BATTLE_WORLD_WIDTH = cols * BATTLE_TILE_SIZE; 
        BATTLE_WORLD_HEIGHT = rows * BATTLE_TILE_SIZE;
} else {
        BATTLE_WORLD_WIDTH = 2400; 
        // SURGERY: Preserve River at 1200, set standard Land to 1800 (1/2 size)
        BATTLE_WORLD_HEIGHT = window.inRiverBattle ? 1200 : 1800; 
		
		mapCols = BATTLE_WORLD_WIDTH / BATTLE_TILE_SIZE;
        mapRows = BATTLE_WORLD_HEIGHT / BATTLE_TILE_SIZE; 
    }
    // 2. Recalculate grid columns and rows based on chosen dimensions
    BATTLE_COLS = Math.floor(BATTLE_WORLD_WIDTH / BATTLE_TILE_SIZE);
    BATTLE_ROWS = Math.floor(BATTLE_WORLD_HEIGHT / BATTLE_TILE_SIZE);

    // 3. Save state and switch modes
    savedWorldPlayerState_Battle.x = playerObj.x;
    savedWorldPlayerState_Battle.y = playerObj.y;
    
   
    closeParleUI();

    inBattleMode = true;

// ---> SURGERY: FLUSH GHOST KEYS <---
    // Prevents the player from sliding automatically if a key got stuck in a menu
    if (typeof keys !== 'undefined') {
        for (let k in keys) keys[k] = false;
    }

 
    const panel = document.getElementById('parle-panel');
    if (panel) panel.style.display = 'none';

	
	currentBattleData = {
        enemyRef: enemyNPC,
        playerFaction: playerObj.faction || "Hong Dynasty",
        enemyFaction: enemyNPC.faction,
        initialCounts: { player: 0, enemy: 0 },
        // ADD THESE:
        
    // UPDATED:
    playerColor: (typeof FACTIONS !== 'undefined' && FACTIONS[playerObj.faction]) 
        ? FACTIONS[playerObj.faction].color 
        : "#ffffff", // white fallback

    enemyColor: (typeof FACTIONS !== 'undefined' && FACTIONS[enemyNPC.faction]) 
        ? FACTIONS[enemyNPC.faction].color 
        : "#000000" // black fallback

		};

    // v4.7.0 CHUNKING: generateBattlefield now takes an optional onComplete
    // callback. Everything that used to run immediately after this call
    // (troop scaling, deployArmy, abyss-safety scan, camera anchor, AI
    // start) is now the _afterGenerate continuation below — 100% unchanged
    // code, just moved into a function so it can run once the (possibly
    // chunked) grid generation actually finishes instead of assuming it's
    // already done on the very next line.
    generateBattlefield(currentWorldMapTile.name || "Plains", _afterGenerate);

    function _afterGenerate() {

let playerTroopCount = playerObj.troops || 0; 
    let playerUniqueType = playerObj.uniqueUnit || null; 
    
    // ---> NEW: GLOBAL BATTLE SCALE <---
    let totalCombatants = playerTroopCount + enemyNPC.count;
    // ── FIX 4: Per-side cap with ratio preservation ─────────────────────────
    // Sandbox/story: each side is capped at window.maxSandboxBattleTroops (default 100).
    // Larger side hits the cap exactly; smaller side scales down by the same factor so
    // the ratio (e.g. 20 vs 400 → 5 vs 100) is preserved. Custom battles bypass.
    if (window.__IS_CUSTOM_BATTLE__) {
        window.GLOBAL_BATTLE_SCALE = totalCombatants > 400 ? Math.ceil(totalCombatants / 300) : 1;
    } else {
        const _cap = Math.max(20, Math.min(300, window.maxSandboxBattleTroops || 100));
        const _largerSide = Math.max(playerTroopCount, enemyNPC.count || 0);
        window.GLOBAL_BATTLE_SCALE = (_largerSide > _cap) ? (_largerSide / _cap) : 1;
    }

    deployArmy(currentBattleData.playerFaction, playerTroopCount, "player"); 
    deployArmy(enemyNPC.faction, enemyNPC.count, "enemy");
	
	// =========================================================
    // ---> SAFETY SURGERY: ABYSS SCAN 
    // =========================================================
    // We use separate counters so the staggering logic in lastResort() 
    // works correctly for both sides independently.
    let playerSafetyIndex = 0;
    let enemySafetyIndex = 0;

    battleEnvironment.units.forEach(u => {
        if (u.side === "player") {
            lastResort2(u, BATTLE_WORLD_WIDTH, BATTLE_WORLD_HEIGHT, "player", playerSafetyIndex++);
        } else {
            lastResort2(u, BATTLE_WORLD_WIDTH, BATTLE_WORLD_HEIGHT, "enemy", enemySafetyIndex++);
        }
    });
    // Find exactly where the army deployed the commander and move the invisible WASD player there
    let deployedCmdr = battleEnvironment.units.find(u => u.isCommander && u.side === "player");
    if (deployedCmdr) {
        playerObj.x = deployedCmdr.x;
        playerObj.y = deployedCmdr.y-50;
		
		// >>> ADD THIS LINE <<<
        playerObj.ammo = deployedCmdr.ammo || 24;
		
    } else {
        playerObj.x = BATTLE_WORLD_WIDTH / 2;
        playerObj.y = BATTLE_WORLD_HEIGHT - 100;
    }
	
    // =========================================================
    // ---> SURGERY: LAZY GENERAL AUTO-CHARGE (5 + Q BY DEFAULT)
    // =========================================================
    // GUARD: skip entirely during a siege. This used to run unconditionally,
    // force-setting every player unit to seek_engage (land-battle "charge
    // nearest enemy") the instant deployment finished — including custom-battle
    // sieges, which never routed through executeSiegeAssaultAI here. That left
    // ram_pusher/ladder_carrier units fighting between two orders (seek_engage
    // vs whatever siege_assault assignment ran later), which reads as units
    // wobbling left-right instead of committing to either behavior.
    if (typeof inSiegeBattle === 'undefined' || !inSiegeBattle) {
        battleEnvironment.units.forEach(u => {
            // Target player troops (ignoring the player/commander avatar)
            if (u.side === "player" && !u.isCommander && !u.disableAICombat) {
                u.selected = true;           // Simulates '5' (Select All)
                u.hasOrders = true;          // Activates the command state
                u.orderType = "seek_engage"; // Simulates 'Q' (Seek & Engage)
                u.orderTargetPoint = null;   // Clears waypoints so they use dynamic enemy pathing
                u.formationTimer = 120;      // Brief buffer to orient before breaking line
            }
        });
    }


  if (typeof AudioManager !== 'undefined') {
        AudioManager.init();
 
        // CRITICAL: Arm the 3-second combat gate BEFORE music starts.
        // This stops any melee/projectile SFX from firing while units
        // are still being repositioned from sandbox world-map coordinates.
        AudioManager.clearAllSFXForBattle();
 
        AudioManager.playMP3('music/battlemusic.mp3', false);
    }
 
// Trigger the Epic Zoom: Starts at 0.3x (high up), lands at 1.5x (tactical view) over 1.5 seconds
    if (typeof triggerEpicZoom === 'function') {
        triggerEpicZoom(0.6, 1.5, 3500);
    }
    
    // --- NEW: START ENEMY TACTICAL AI FOR CAMPAIGN BATTLES ---
    if (typeof EnemyTacticalAI !== 'undefined') EnemyTacticalAI.start();
	
	isBattlefieldReady = true;
    } // end _afterGenerate
}
 
 
 // ============================================================================
// BRAND NEW NAVAL DEPLOYMENT CHECKER
// Brute forces random coordinates until it finds a valid spot on the ship's deck
// ============================================================================
function findValidShipDeckPosition(ship, role, side) {
    let maxAttempts = 1000; // Massive attempt pool to prevent ocean spawning
    let rx = ship.width / 2;
    let ry = ship.height / 2;
    
    let roleStr = String(role || "").toLowerCase();
    let isRanged = roleStr.includes("archer") || roleStr.includes("crossbow") || roleStr.includes("gun");
    let isCav = roleStr.includes("cavalry") || roleStr.includes("horse") || roleStr.includes("mount");

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Generate a random test offset from the ship's center
        // Multiplied by 0.75 to keep them slightly away from the edge/railings
        let dx = (Math.random() - 0.5) * ship.width * 0.75; 
        let dy = (Math.random() - 0.5) * ship.height * 0.75;

        // TACTICAL POSITIONING: 
        // Player faces North (-Y is front). Enemy faces South (+Y is front).
        if (side === "player") {
            if (isRanged && dy > -15) continue; // Force ranged toward the top half (front)
            if (isCav && dy < 15) continue;     // Force cav toward the bottom half (back)
        } else if (side === "enemy") {
            if (isRanged && dy < 15) continue;  // Force ranged toward the bottom half (front)
            if (isCav && dy > -15) continue;    // Force cav toward the top half (back)
        }

        // EXACT COLLISION MATCH WITH generateShips() HULL MATH
        let distance = Math.pow(Math.abs(dx) / rx, 2.5) + Math.pow(Math.abs(dy) / ry, 2.5);

        // If distance <= 0.85, they are safely inside the solid deck floor area
        if (distance <= 0.85) {
            // === ROTATION FIX: rotate local offset by ship heading ===
            // dx/dy are in ship-local space (bow = +X). Rotate to world space.
            const _h = ship.heading || 0;
            const _c = Math.cos(_h), _s = Math.sin(_h);
            return { x: ship.x + dx * _c - dy * _s, y: ship.y + dx * _s + dy * _c };
        }
    }
    
    // Fallback: dead center on the ship
    return { x: ship.x, y: ship.y };
}
 
// --- ARMY DEPLOYMENT BASED ON FACTION RACE & ACTUAL ROSTER ---
function deployArmy(faction, totalTroops, side, uniqueType) {
    
    // 1. Track initial counts for the battle summary
    if (!currentBattleData.initialCounts) {
        currentBattleData.initialCounts = { player: 0, enemy: 0 };
    }
    
   // 2. Setup spawn coordinates (SURGERY: Scaled Enemy Spawning)
    let spawnY = side === "player" ? BATTLE_WORLD_HEIGHT - 30 : Math.min(600, BATTLE_WORLD_HEIGHT * 0.15);
    let spawnXCenter = BATTLE_WORLD_WIDTH / 2;
    let factionColor = (typeof FACTIONS !== 'undefined' && FACTIONS[faction]) ? FACTIONS[faction].color : "#ffffff";
    
// =========================================================
    // --- SURGERY: SIEGE DEFENDER OVERRIDE ---
    // Forces enemy troops into a horizontal line deep inside the city
    // =========================================================
    if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle && side === "enemy") {
        let southGate = typeof overheadCityGates !== 'undefined' ? overheadCityGates.find(g => g.side === "south") : null;
        if (southGate) {
            // Push them 800 pixels North (deep inside the walls/plaza) — extra 300px keeps large armies clear of wall
            spawnY = (southGate.y * BATTLE_TILE_SIZE) - 1100; 
        } else {
            spawnY = BATTLE_WORLD_HEIGHT - 1600; // Safe fallback deep inside walls
        }
    }
    let composition = [];
// =========================================================
    // THE FIX: If it's the player, read EXACTLY what they bought
    // =========================================================
    if (side === "player" && typeof player !== 'undefined' && player.roster && player.roster.length > 0) {
        let counts = {};
        
        // Tally up the exact units in the roster
        player.roster.forEach(unit => {
            let rawType = unit.type || unit.name;
            if (!rawType) return;
            // Force exact UI capitalization so the Engine never misses the database name
            let type = rawType.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            if (type.toLowerCase() === "militia") type = "Militia";
            
            counts[type] = (counts[type] || 0) + 1;
        });

        // Convert the exact counts into percentages for your visual scaling engine
        let totalRosterSize = player.roster.length;
        for (let [type, count] of Object.entries(counts)) {
            composition.push({ type: type, pct: count / totalRosterSize });
        }
		composition.sort((a, b) => a.pct - b.pct);

        // Override totalTroops to match the actual roster size
        totalTroops = totalRosterSize;

    } else {
   // =========================================================
// ENEMY AI: Updated Composition Templates (v2.1)
// =========================================================

 
let isSiege = typeof inSiegeBattle !== 'undefined' && inSiegeBattle;
composition = getFactionComposition(faction, isSiege);

}
	 
// ==== REPLACE WITH
// Block all cavalry and beasts from deploying in sieges (Both Player and Enemy)
if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle) {
    composition = composition.filter(comp => {
        const bt = UnitRoster.allUnits[comp.type];
        if (!bt || bt.isCommander) return true;

        const role = (bt.role || "").toLowerCase();
        const type = (comp.type || "").toLowerCase();
        const combined = `${role} ${type}`;

        const isIllegal = bt.isLarge || 
                          combined.match(/(cav|horse|lancer|mount|camel|eleph|beast|keshig|cataphract|zamburak)/);
        
        return !isIllegal; 
    });
}
    currentBattleData.initialCounts[side] += totalTroops;
 
// --- 3. Spawning Engine (Distributed side-by-side) ---
    // ---> SURGERY: Use the unified Global Scale <---
    let visualScale = window.GLOBAL_BATTLE_SCALE || 1; 

    // =========================================================
    // ---> NEW SURGERY: MOBILE NATIVE 80-UNIT CAP FOR SIEGES
    // =========================================================
    const isMobileNative = (
        typeof window.Capacitor !== 'undefined' || 
        /\bwv\b/.test(navigator.userAgent) || 
        /Android/.test(navigator.userAgent)
    );

    if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle && isMobileNative) {
        // If the defender already set the ratio, use it to ensure perfect 1:1 scaling
        if (window.CURRENT_MOBILE_RATIO) {
            visualScale = Math.max(visualScale, window.CURRENT_MOBILE_RATIO);
        } else {
            // Since Attackers (deployArmy) fire BEFORE Defenders, we calculate the ratio here.
            // Pull the expected enemy count from currentBattleData to get the true total
            let expectedEnemyCount = currentBattleData.enemyRef ? currentBattleData.enemyRef.count : 0;
            let totalCombatants = totalTroops + expectedEnemyCount;
            
            let mobileScale = totalCombatants / 80;
            visualScale = Math.max(visualScale, mobileScale);
            
            // Save it globally so the Defenders function (which runs next) uses the EXACT same ratio
            window.CURRENT_MOBILE_RATIO = visualScale;
        }
    }
    // =========================================================

    let unitsToSpawn = Math.round(totalTroops / Math.max(1, visualScale));
	
// First, calculate the total width of all "Line" units (non-cavalry)
// This ensures we can center the entire army perfectly.
let totalLineWidth = 0;
const spacingX = 8;
const groupGap = 10; // Pixels between different unit types

composition.forEach(comp => {
    let baseTemplate = UnitRoster.allUnits[comp.type];
    if (baseTemplate && !baseTemplate.role.toLowerCase().includes("cavalry") && !baseTemplate.role.toLowerCase().includes("horse")) {
        let count = Math.round(unitsToSpawn * comp.pct);
        if (count > 0) {
            let unitsPerRow = 20;
            let groupWidth = Math.min(count, unitsPerRow) * spacingX;
            totalLineWidth += groupWidth + groupGap;
        }
    }
});

let currentLineXOffset = -(totalLineWidth / 2);
let spawnedSoFar = 0;
let playerCommanderSpawned = false; // <--- ADD THIS GUARD

composition.forEach(comp => {
    let count = Math.round(unitsToSpawn * comp.pct);
    if (count === 0 && unitsToSpawn > 0) count = 1;
    count = Math.min(count, unitsToSpawn - spawnedSoFar);
    
    let baseTemplate = UnitRoster.allUnits[comp.type];
    if (!baseTemplate) {
        console.warn(`Unit type ${comp.type} missing! Defaulting to Militia.`);
        baseTemplate = UnitRoster.allUnits["Militia"];
    }

    // Grid Constants
    const unitsPerRow = 15;
    const spacingY = 16;
    const dir = (side === "player") ? -1 : 1;
    const rankDir = (side === "player") ? 1 : -1; 

    // Determine if this is a wing (cavalry) or center-line unit
    const isFlank = baseTemplate.role.toLowerCase().includes("cavalry") || 
                    baseTemplate.role.toLowerCase().includes("horse");

    let groupWidth = Math.min(count, unitsPerRow) * spacingX;

for (let i = 0; i < count; i++) {
    let row = Math.floor(i / unitsPerRow);
    let col = i % unitsPerRow;

    // 1. Get Tactical Position (Vertical lines and Flank X)
    let tacticalX = 0;
    let tacticalY = 0;
    if (typeof getTacticalPosition === 'function') {
        let tPos = getTacticalPosition(baseTemplate.role, side, comp.type);
        tacticalX = tPos.x;
        tacticalY = tPos.y;
    }

        let finalX, finalY;

// =========================================================
        // --- SURGERY: NAVAL SPAWN TIER OVERRIDE ---
        // =========================================================
        if (window.inNavalBattle) {
            let myShip = window.navalEnvironment.ships.find(s => s.side === side);
            if (myShip) {
                // Call the massive coordinate checker function
                let safePos = findValidShipDeckPosition(myShip, baseTemplate.role, side);
                finalX = safePos.x;
                finalY = safePos.y;
            }
        } 

//SIEGE 
        else if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle && side === "enemy") {
            let southGate = typeof overheadCityGates !== 'undefined' ? overheadCityGates.find(g => g.side === "south") : null;
            let plazaY = southGate ? (southGate.y * BATTLE_TILE_SIZE) - 1200 : (BATTLE_WORLD_HEIGHT / 2 - 300); // +300px north to keep large armies off the wall

            // 1. TIGHTEN SPACING: Lower personalSpace from 12 to 6 to pack units closer together
            const personalSpace = 6; 
            let angle = (i * 0.5) + (Math.random() * Math.PI * 2);
            let dist = (Math.sqrt(i) * personalSpace) + (Math.random() * 10);

            // 2. HORIZONTAL COMPRESSION: Multiply the X offset by 0.5 to force them toward the center line
            finalX = spawnXCenter + (Math.cos(angle) * dist * 0.5); 
            finalY = plazaY + (Math.random() - 0.5) * 35; // Slight Y-variance for a more natural look

            // 3. REDUCE JITTER: Lower random variance from 15 to 5 for a cleaner center cluster
            finalX += (Math.random() - 0.5) * 5; 
            finalY += (Math.random() - 0.5) * 10;
        }
		
		
		
		else {
            // --- ORIGINAL GRID LOGIC ---
            if (isFlank) {
                let internalX = (col * spacingX) - (groupWidth / 2);
                finalX = spawnXCenter + tacticalX + internalX;
            } else {
                finalX = spawnXCenter + currentLineXOffset + (col * spacingX);
            }
            let gridY = row * spacingY * rankDir;
            finalY = spawnY + tacticalY + gridY;
            finalX += (Math.random() - 0.5) * 9;
            finalY += (Math.random() - 0.5) * 9;
        }

        // ---> SURGERY: Move human units South in Sieges, keep Engines at the front line <---
        // NOTE: Must run AFTER the else block so finalY is a real number (not undefined).
        //       The old position (before the naval/siege/else block) fired += on undefined → NaN,
        //       which the else block silently overwrote, losing the 600px shift entirely.
        if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle && side === 'player') {
            const unitName = String(comp.type).toLowerCase();
            const isEngine = unitName.match(/(ladder|ram|tower|trebuchet|catapult|cannon|hwacha|fire)/);
            if (!isEngine) {
                finalY += 600; // Push regular troops south toward camp
            }
        }

// ---> SURGERY: LAND BATTLE OUT-OF-BOUNDS SAFEGUARD <---
        // =========================================================
        const margin = 40; // Pixel padding from the edge of the world
        
        let isOutOfBounds = (
            finalX < margin || 
            finalX > BATTLE_WORLD_WIDTH - margin ||
            finalY < margin || 
            finalY > BATTLE_WORLD_HEIGHT - margin
        );

        if (isOutOfBounds) {
            // Relocate to a safe cluster behind the main center line
            let safeRadius = 150;
            let fallbackDir = (side === "player") ? 1 : -1; // 1 pushes player down, -1 pushes enemy up
            
            // Scatter them near the spawn center
            finalX = spawnXCenter + (Math.random() - 0.5) * safeRadius * 2;
            finalY = spawnY + (fallbackDir * (40 + Math.random() * safeRadius));
            
            // Hard clamp mathematically to guarantee 100% they are inside the box
            finalX = Math.max(margin, Math.min(finalX, BATTLE_WORLD_WIDTH - margin));
            finalY = Math.max(margin, Math.min(finalY, BATTLE_WORLD_HEIGHT - margin));
        }
        // =========================================================
		
    let isCmdr = (baseTemplate.isCommander === true) || (comp.type === "Commander");
	
	
        let unitStats = Object.assign(
            new Troop(baseTemplate.name, baseTemplate.role, baseTemplate.isLarge, faction),
            baseTemplate
        );
        unitStats.morale = 20;    
        unitStats.maxMorale = 20; 
        unitStats.faction = faction;

        battleEnvironment.units.push({
            id: unitIdCounter++,
            side: side,
            faction: faction,
            color: factionColor,
            unitType: comp.type, 
			isCommander: isCmdr, 
			disableAICombat: (side === 'player' && isCmdr),
            stats: unitStats, 
            hp: unitStats.health,
			// >>> ADD THIS LINE <<<
            ammo: unitStats.ammo || (baseTemplate && baseTemplate.ammo) || 0,
            x: finalX,
            y: finalY,
            target: null,
            state: "idle", 
            animOffset: Math.random() * 100,
            cooldown:170,
            hasOrders: false
        });
    }

    if (!isFlank) {
        currentLineXOffset += groupWidth + groupGap;
    }
    
    spawnedSoFar += count;
});
	
	
	
}


function deployNavalArmy(faction, totalTroops, side, uniqueType) {
    if (!currentBattleData.initialCounts) {
        currentBattleData.initialCounts = { player: 0, enemy: 0 };
    }

    const factionColor = (typeof FACTIONS !== 'undefined' && FACTIONS[faction])
        ? FACTIONS[faction].color
        : "#ffffff";

    const ship = window.navalEnvironment?.ships?.find(s => s.side === side);
    if (!ship) {
        console.error(`[NAVAL] No ship found for side=${side}. Abort naval deployment.`);
        return;
    }

    // Build composition exactly like deployArmy does, but without any land-grid logic.
    let composition = [];

    if (side === "player" && typeof player !== 'undefined' && player.roster && player.roster.length > 0) {
        const counts = {};
        player.roster.forEach(unit => {
            let rawType = unit.type || unit.name;
            if (!rawType) return;
            let type = rawType.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            if (type.toLowerCase() === "militia") type = "Militia";
            counts[type] = (counts[type] || 0) + 1;
        });

        const totalRosterSize = player.roster.length;
        for (const [type, count] of Object.entries(counts)) {
            composition.push({ type, pct: count / totalRosterSize });
        }
        totalTroops = totalRosterSize;
    } else {
        const isSiege = typeof inSiegeBattle !== 'undefined' && inSiegeBattle;
        composition = getFactionComposition(faction, isSiege);
    }

    const visualScale = window.GLOBAL_BATTLE_SCALE || 1;
    const unitsToSpawn = Math.max(1, Math.round(totalTroops / visualScale));

const spawnList = [];
    if (side === "player") spawnList.push("General"); // SURGERY: Use valid roster key commander onto the deck
    let allocated = 0;
    composition.forEach((comp, idx) => {
        let count = Math.round(unitsToSpawn * comp.pct);
        if (count === 0 && unitsToSpawn > 0) count = 1;
        count = Math.min(count, unitsToSpawn - allocated);
        for (let i = 0; i < count; i++) {
            spawnList.push(comp.type);
        }
        allocated += count;
    });

// =========================================================
// SURGERY: Tight Centroid Formations
// =========================================================
// 1. Determine optimal columns and rows for the exact troop count
let cols = Math.ceil(Math.sqrt(spawnList.length * (ship.width / ship.height)));
if (cols < 1) cols = 1;
let rows = Math.ceil(spawnList.length / cols);
if (rows < 1) rows = 1;

// 2. Define strict personal space limits (keeps them tight!)
const PERSONAL_SPACE = 20; 

// 3. Calculate dynamic spacing. 
// Caps at PERSONAL_SPACE so small armies cluster. If the army is massive, 
// it automatically squishes them down to fit 85% of the deck.
const spacingX = Math.min(PERSONAL_SPACE, (ship.width * 0.85) / cols);
const spacingY = Math.min(PERSONAL_SPACE, (ship.height * 0.85) / rows);

// 4. Calculate the bounding box of the whole army
const blockW = cols * spacingX;
const blockH = rows * spacingY;

// 5. Center that bounding box directly on the ship's centroid
const startX = ship.x - (blockW / 2);
const startY = ship.y - (blockH / 2);

let playerCommanderSpawned = false; // <--- ADD THIS GUARD

spawnList.forEach((type, i) => {
    let baseTemplate = UnitRoster.allUnits[type];
    if (!baseTemplate) baseTemplate = UnitRoster.allUnits["Militia"];

    // Notice the updated parameters passed to slotForIndex
    const safePos = slotForIndex(i, baseTemplate.role, ship, cols, rows, startX, startY, spacingX, spacingY, side);

const isCmdr = (baseTemplate.isCommander === true) || (type === "General");
    const unitStats = Object.assign(
        new Troop(baseTemplate.name, baseTemplate.role, baseTemplate.isLarge, faction),
        baseTemplate
    );
    unitStats.morale = 20;
    unitStats.maxMorale = 20;
    unitStats.faction = faction;

    battleEnvironment.units.push({
        id: unitIdCounter++,
        side,
        faction,
        color: factionColor,
        unitType: type,
        isCommander: isCmdr,
        disableAICombat: (side === 'player' && isCmdr),
        stats: unitStats,
        hp: unitStats.health,
        x: safePos.x,
        y: safePos.y,
        target: null,
        state: "idle",
        animOffset: Math.random() * 100,
        cooldown: 170,
        hasOrders: false,
        spawnMode: "naval"
    });
});

currentBattleData.initialCounts[side] += spawnList.length;
}

    function pointInShip(x, y, s) {
        const dx = x - s.x;
        const dy = y - s.y;
        const rx = s.width / 2;
        const ry = s.height / 2;
        // Increased deployment safe zone to match our new collision wall
        return (Math.pow(Math.abs(dx) / rx, 2.5) + Math.pow(Math.abs(dy) / ry, 2.5)) <= 0.90;
    }


function slotForIndex(i, unitRole, ship, cols, rows, startX, startY, spacingX, spacingY, side) {
    const row = Math.floor(i / cols);
    const col = i % cols;

    // Place exactly in the tight grid
    let x = startX + (col * spacingX) + (spacingX / 2);
    let y = startY + (row * spacingY) + (spacingY / 2);

    // Tactical Role Shifting (Ranged in front, Cav in back)
    // Shift amount slightly reduced to keep the formation solid
    const role = String(unitRole || "").toLowerCase();
    const isRanged = role.includes("archer") || role.includes("crossbow") || role.includes("gun");
    const isCav = role.includes("cavalry") || role.includes("horse") || role.includes("mount");

    let shiftAmt = ship.height * 0.05; 
    if (side === "player") {
        if (isRanged) y -= shiftAmt;
        if (isCav) y += shiftAmt;
    } else {
        if (isRanged) y += shiftAmt;
        if (isCav) y -= shiftAmt;
    }

    // Add a tiny bit of organic noise so they don't look like perfect grid robots
    x += (Math.random() - 0.5) * (spacingX * 0.4);
    y += (Math.random() - 0.5) * (spacingY * 0.4);

    // THE SAFETY NET: If tactical shifting pushes them overboard, warp to Centroid
    if (!pointInShip(x, y, ship)) {
        let randX = (Math.random() - 0.5) * (ship.width * 0.10); 
        let randY = (Math.random() - 0.5) * (ship.height * 0.10);
        return { x: ship.x + randX, y: ship.y + randY };
    }
    
    return { x, y };
}

function lastResort2(unit, worldWidth, worldHeight, side, index) {
    const PADDING = 50; 
    const STAGGER_GAP = 30; 
    const UNITS_PER_ROW = 20;

    const isOutOfBounds = (unit.x < 0 || unit.x > worldWidth || unit.y < 0 || unit.y > worldHeight);

   if (isOutOfBounds) {
        const row = Math.floor(index / UNITS_PER_ROW);
        const col = index % UNITS_PER_ROW;
        const offsetX = col * STAGGER_GAP;
        const offsetY = row * STAGGER_GAP;

        if (side === "player") {
            unit.x = (worldWidth / 2) - (UNITS_PER_ROW * STAGGER_GAP / 2) + offsetX;
            // SURGERY: Anchor to bottom of map (2000 for river, 3600 for land)
            unit.y = worldHeight - PADDING - offsetY;
        } else {
            unit.x = (worldWidth / 2) - (UNITS_PER_ROW * STAGGER_GAP / 2) + offsetX;
            // SURGERY: Anchor to top of map
            unit.y = PADDING + offsetY;
        }
    }
}