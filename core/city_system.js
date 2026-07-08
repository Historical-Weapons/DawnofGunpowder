// ============================================================================
// EMPIRE OF THE 13TH CENTURY - CITY DIMENSION GENERATOR (ORGANIC UPDATE)
// ============================================================================

const CITY_WORLD_WIDTH = 3200;  
const CITY_LOGICAL_HEIGHT = 3200; // The city itself
const CITY_WORLD_HEIGHT = 4000;   // City + 800px (25%) deployment zone at bottom
const CITY_TILE_SIZE = 8;
const city_system_troop_storage = {};
const CITY_COLS = Math.floor(CITY_WORLD_WIDTH / CITY_TILE_SIZE);
const CITY_ROWS = Math.floor(CITY_WORLD_HEIGHT / CITY_TILE_SIZE);
const CITY_LOGICAL_ROWS = Math.floor(CITY_LOGICAL_HEIGHT / CITY_TILE_SIZE);

const cityTroopNPCs = {};
async function initAllCities(factions) {
    const factionList = Array.isArray(factions) ? factions : Object.keys(factions);
    for (let f of factionList) {
        generateCity(f);
        // Yield to the browser for 10ms so it doesn't crash from memory spikes
        await new Promise(r => setTimeout(r, 10)); 
    }
}
 function city_system_generateTroops(factionName, grid) {
 //I DONT NEED POLICE TROOPS
}



function city_system_renderTroops(ctx, factionName) {
    let troops = city_system_troop_storage[factionName];
    if (!troops) return;
    // Inside city_system_renderTroops loop:
let currentTile = cityDimensions[factionName].grid[tx] ? cityDimensions[factionName].grid[tx][ty] : 0;
if (currentTile === 9 || currentTile === 8) t.onWall = true; // Added 8 for dynamic wall floors
else if (currentTile === 0 || currentTile === 1 || currentTile === 5) t.onWall = false;
    let currentRuler = (typeof activeCity !== 'undefined' && activeCity) ? activeCity.faction : factionName;
    let fColor = "#4a4a4a"; 
    if (typeof ARCHITECTURE !== 'undefined' && ARCHITECTURE[currentRuler]) {
        fColor = ARCHITECTURE[currentRuler].roofs;
    } else if (typeof activeCity !== 'undefined' && activeCity && activeCity.color) {
        fColor = activeCity.color; 
    }

    for (let t of troops) {
        // --- NEW: Auto-transition Guards on Ladders ---
        let tx = Math.floor(t.x / CITY_TILE_SIZE);
        let ty = Math.floor(t.y / CITY_TILE_SIZE);
        if (typeof cityDimensions !== 'undefined' && cityDimensions[factionName]) {
            let currentTile = cityDimensions[factionName].grid[tx] ? cityDimensions[factionName].grid[tx][ty] : 0;
            if (currentTile === 9) t.onWall = true;
            else if (currentTile === 0 || currentTile === 1 || currentTile === 5) t.onWall = false;
        }

        // --- FIX: Pass 't.onWall' to the collision check! ---
        if (isCityCollision(t.x + t.vx, t.y + t.vy, factionName, t.onWall)) {
            t.vx *= -1; t.vy *= -1;
            t.dir = t.vx > 0 ? 1 : -1;
        } else {
            t.x += t.vx; t.y += t.vy;
        }

        let frame = (Date.now() / 60) + t.animOffset;
        let bob = Math.abs(Math.sin(frame * 0.2)) * 2;

        drawHuman(ctx, t.x, t.y, true, frame, fColor);

 


        ctx.save();
        ctx.translate(t.x, t.y - bob);
        ctx.scale(t.dir, 1);
        
        // Localized weapon drawing logic
        let type = t.weapon;
        if (type === "spearman") {
            ctx.strokeStyle = "#4e342e"; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(28, -24); ctx.stroke();
        } else if (type === "sword_shield") {
            ctx.fillStyle = "#5d4037"; ctx.beginPath(); ctx.arc(6, -4, 7.5, 0, Math.PI * 2); ctx.fill();
        } // ... (rest of weapon types)
        ctx.restore();
    }
	
 
 
}

function city_system_renderGateOverlays(ctx) {
    // If exploring the city, we still need to draw the gates!
    if (typeof renderDynamicGates === 'function') {
        renderDynamicGates(ctx);
    }
}

window.addEventListener('keydown', (e) => {
    if ((e.key === 'p' || e.key === 'P') && inCityMode) {
        e.preventDefault(); 
        
        // NEW: Reference the dynamic environment gates
        const gates = battleEnvironment.cityGates || [];
        for (let g of gates) {
            // Check distance to the gate's logical center
            let dist = Math.hypot(player.x - (g.x * CITY_TILE_SIZE), player.y - (g.y * CITY_TILE_SIZE));
            if (dist < 100) {
                leaveCity(player);
                break;
            }
        }
    }
});

// Global state for city exploration
let inCityMode = false;
let currentActiveCityFaction = null;
let savedWorldPlayerState = { x: 0, y: 0 }; 

// Cache for generated cities and their local NPCs
const cityDimensions = {};
const cityCosmeticNPCs = {};

// --- EXPANDED 13TH CENTURY ARCHITECTURAL TEXTURES ---
const ARCHITECTURE = {
    "Hong Dynasty": { 
        roofs: ["#8b0000", "#7a1a1a", "#3e3e3e", "#4a4a4a", "#6b2d2d", "#2c2c2c"], 
        walls: ["#d3c5b4", "#8b7e71", "#e0d6c8", "#c2b29f", "#968878"],            
        ground: "#556b2f", road: "#7a7a7a", plaza: "#8c8c8c", water: "#4b8da6", 
        trees: ["#2e4a1f", "#3a5f27", "#1f3315"] 
    },
"Dab Tribes": { 
        // Mossy thatch, dark slate tiles, and weathered bamboo
        roofs: ["#2D3624", "#3E4A3D", "#1A2421", "#735C32", "#4E5B31"], 
        
        // Dark tropical timber, teak, and humid-stained stone
        walls: ["#4E3B31", "#3D3028", "#5C4D32", "#2B2B2B"],           
        
        // Deep mossy/clay earth
        ground: "#3E4D26", 
        
        // Packed humid mud paths
        road: "#5A4632", 
        
        // Lichen-covered flagstone
        plaza: "#697063", 
        
        // Deep tropical river teal
        water: "#1E5F61", 
        
        // Vibrant jungle greens, deep ferns, and karst-style limestone foliage
        trees: ["#2D5A27", "#4A7C38", "#1E3D1A", "#5C913C"] 
    
    },
    "Great Khaganate": { 
        roofs: ["#e0e0e0", "#f5f5dc", "#dcdcdc", "#8b5a2b", "#6b4421"],            
        walls: ["#5c4033", "#4a3329", "#735141", "#8b7355", "#6e5c47"],            
        ground: "#767950", road: "#8b5a2b", plaza: "#704b26", water: "#517a80", 
        trees: ["#414a24", "#30381a", "#525e2e"] 
    },
    "Jinlord Confederacy": { 
        roofs: ["#455a64", "#37474f", "#263238", "#546e7a", "#1c262b"],            
        // Fixed: Replaced #607d8b with #8fa3ad (Light slate) for contrast
        walls: ["#8fa3ad", "#4f6a78", "#3f5461", "#7693a1", "#2e404a"],            
        ground: "#607d8b", road: "#708090", plaza: "#596a75", water: "#345c73", 
        trees: ["#1f3b2f", "#152b22", "#2a5241"] 
    },
    "Tran Realm": { 
        roofs: ["#5d4037", "#4e342e", "#3e2723", "#795548", "#8d6e63"],            
        walls: ["#3e2723", "#2c1c19", "#4e342e", "#5c4033", "#735141"],            
        ground: "#2e7d32", road: "#795548", plaza: "#63453a", water: "#2c8a7b", 
        trees: ["#114a16", "#0b330e", "#19661f"] 
    },
    "Goryun Kingdom": { 
        roofs: ["#212121", "#424242", "#303030", "#4a148c", "#380b6b"],            
        walls: ["#e0e0e0", "#f5f5f5", "#bdbdbd", "#9e9e9e", "#d6d6d6"],            
        ground: "#4a148c", road: "#9e9e9e", plaza: "#7d7d7d", water: "#533785", 
        trees: ["#27084a", "#1c0536", "#360b66"] 
    },
    "Xiaran Dominion": {
        roofs: ["#fbc02d", "#f9a825", "#f57f17", "#c28e0e", "#d4a017"],            
        // Fixed: Replaced #d4ad68 with #ffecb3 (Light sandstone) for contrast
        walls: ["#e6c280", "#ffecb3", "#c29b55", "#b08a45", "#f0d097"],            
        ground: "#d4ad68", road: "#e6c280", plaza: "#c29b55", water: "#345c73",
        trees: ["#5c6b3e", "#4a5732", "#6e804a"] 
    },
    "High Plateau Kingdoms": {
        roofs: ["#4e342e", "#3e2723", "#5d4037", "#8b0000", "#7a1a1a"],            
        walls: ["#fafafa", "#f5f5f5", "#eeeeee", "#e0e0e0", "#d6d6d6"],            
        ground: "#8d6e63", road: "#a1887f", plaza: "#795548", water: "#4b8da6",
        trees: ["#1f3315", "#15240e", "#2a451d"] 
    },
    "Yamato Clans": {
        roofs: ["#2c2c2c", "#383838", "#454545", "#5c4a3d", "#4a3c31"],            
        walls: ["#d7ccc8", "#bcaaa4", "#a1887f", "#8d6e63", "#795548"],            
        ground: "#334d33", road: "#5c5c5c", plaza: "#4a4a4a", water: "#3a6b5e",
        trees: ["#881c2e", "#6b1423", "#2e4a1f"] 
    },
    "Bandits": {
        roofs: ["#3e2723", "#212121", "#424242", "#111111", "#2e2e2e"],            
        // Fixed: Replaced invisible/muddy blacks with lighter browns for contrast against #222222 ground
        walls: ["#5c4033", "#4e342e", "#6e4b3c", "#4a3329", "#523a28"],            
        ground: "#222222", road: "#333333", plaza: "#1a1a1a", water: "#1a332c",
        trees: ["#1a2412", "#121a0d", "#233318"] 
    }
};

// --- Function to generate organic clusters (Trees, Water) ---
function generateOrganicFeatures(grid, typeValue, count, maxSize) {
    for (let i = 0; i < count; i++) {
        let startX = Math.floor(Math.random() * (CITY_COLS - maxSize));
        let startY = Math.floor(Math.random() * (CITY_ROWS - maxSize));
        
        for (let j = 0; j < maxSize * 2; j++) {
            let cx = startX + Math.floor((Math.random() - 0.5) * maxSize);
            let cy = startY + Math.floor((Math.random() - 0.5) * maxSize);
            
            if (cx > 0 && cx < CITY_COLS && cy > 0 && cy < CITY_ROWS) {
                if (grid[cx][cy] === 0) grid[cx][cy] = typeValue; // Overwrite ground only
            }
        }
    }
}

// --- Generation Logic (Organic & Radial Density) ---
function generateCity(factionName, isVillage = false, pop = 1000) {
    if (cityDimensions[factionName]) return;

    // Always wipe stale tower/gate data before generating any city type.
    // Previously only the village branch and buildCityWalls() reset these,
    // leaving ghost collision boxes from a previously visited city in the
    // global array — causing invisible walls the player bumps into.
    window.cityTowerPositions = [];
    if (typeof cityLadders !== 'undefined') cityLadders = [];
    if (typeof overheadCityGates !== 'undefined') overheadCityGates = [];

    const arch = ARCHITECTURE[factionName] || ARCHITECTURE["Hong Dynasty"];
    
    // Matrix: 0=Ground, 1=Road, 2=Building(Solid), 3=Tree(Solid), 4=Water(Solid), 5=Plaza
    const grid = Array.from({ length: CITY_COLS }, () => Array(CITY_ROWS).fill(0));
    
let midX = Math.floor(CITY_COLS / 2);
    // SURGERY: Anchor the city center to the top 3200px (LOGICAL_ROWS)
    let midY = Math.floor(CITY_LOGICAL_ROWS / 2); 
    let maxRadius = Math.min(midX, midY) - 5;

    // 1. Central Irregular Plaza
    for(let i=midX-15; i<=midX+15; i++) {
        for(let j=midY-15; j<=midY+15; j++) {
            if (Math.hypot(i-midX, j-midY) < 12 + Math.random() * 4) {
                grid[i][j] = 5; 
            }
        }
    }

    // 2. Organic Winding Roads (Drunkard's Walk spreading outward)
    let numRoads = 10; // More branches = denser road network
	
// --- INTEGRATED WOBBLY ROADS (MIGRATED FROM FORTIFICATION SYSTEM) ---
    let gateRadius = 4;
    let startY = 5, endY = CITY_LOGICAL_ROWS - 5;
    let startX = 5, endX = CITY_COLS - 5;
// --- UPDATED VERTICAL ROAD LOOP ---
// Change 'y < CITY_LOGICAL_ROWS' to 'y < CITY_ROWS'
for (let y = 0; y < CITY_ROWS; y++) { 
    let distToNorth = Math.abs(y - startY);
    let distToSouth = Math.abs(y - endY);
    let minDist = Math.min(distToNorth, distToSouth);
    
    // This logic keeps the road straight at the very ends (gates)
    let straightness = Math.min(1, Math.max(0, (minDist - 105) / 20));
    let wobble = Math.floor(Math.sin(y * 0.08) * 5 * straightness);
    let currentMidX = midX + wobble;
    
    for (let x = currentMidX - gateRadius; x <= currentMidX + gateRadius; x++) {
        if (grid[x] && grid[x][y] !== undefined) {
            if (grid[x][y] !== 5) grid[x][y] = 1; // 1 = Road
        }
    }
}

    // Horizontal Wobbly Road (West to East)
    for (let x = 0; x < CITY_COLS; x++) {
        let distToWest = Math.abs(x - startX);
        let distToEast = Math.abs(x - endX);
        let minDist = Math.min(distToWest, distToEast);
        let straightness = Math.min(1, Math.max(0, (minDist - 105) / 20));
        let wobble = Math.floor(Math.sin(x * 0.08) * 5 * straightness);
        let currentMidY = midY + wobble;

        for (let y = currentMidY - gateRadius; y <= currentMidY + gateRadius; y++) {
            if (grid[x] && grid[x][y] !== undefined) {
                if (grid[x][y] !== 5) grid[x][y] = 1; // 1 = Road
            }
        }
    }
	
	
    for(let r = 0; r < numRoads; r++) {
        let cx = midX;
        let cy = midY;
        let angle = Math.random() * Math.PI * 2;
        let length = 30 + Math.random() * (maxRadius * 8);
        let roadWidth = 1 + Math.floor(Math.random() * 3);

        for(let step = 0; step < length; step++) {
            cx += Math.cos(angle) * 1.5;
            cy += Math.sin(angle) * 1.5;
            angle += (Math.random() - 0.5) * 0.9; // Wiggle factor

            let ix = Math.floor(cx);
            let iy = Math.floor(cy);

            if (ix > 0 && ix < CITY_COLS && iy > 0 && iy < CITY_ROWS) {
                for(let w1 = -roadWidth; w1 <= roadWidth; w1++) {
                    for(let w2 = -roadWidth; w2 <= roadWidth; w2++) {
                        if (Math.hypot(w1, w2) <= roadWidth) { // Circular brush
                            if (ix+w1 > 0 && ix+w1 < CITY_COLS && iy+w2 > 0 && iy+w2 < CITY_ROWS) {
                                if (grid[ix+w1][iy+w2] === 0) grid[ix+w1][iy+w2] = 1; 
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. Scatter Buildings Radially (Dense center, sparse edges)
    const buildings = [];
    // ── POPULATION-SCALED BUILDING CAP ───────────────────────────────────────
    // Goal: 10 pop = 1 house.  Mobile ceiling: 80 houses.
    // numBuildingAttempts stays high so the density algorithm fills the footprint
    // naturally, but we BREAK as soon as targetBuildings is reached.
    let targetBuildings = isVillage
        ? Math.min(80, Math.max(30,  Math.floor(pop / 3)))   // villages: 4–20
        : Math.min(180, Math.max(80, Math.floor(pop / 3)));  // cities  : 10–80
    // Keep attempts high enough that sparse/tight layouts still fill in properly.
    let numBuildingAttempts = 800000;

for (let i = 0; i < numBuildingAttempts; i++) {
        let bx = Math.floor(Math.random() * CITY_COLS);
        // SURGERY: Limit building placement attempts to the logical city area
        let by = Math.floor(Math.random() * CITY_LOGICAL_ROWS);
       let dist = Math.hypot(bx - midX, by - midY);
        
        // Villages: pull all buildings into a tight hamlet cluster (0.25×radius).
        // Cities: normal urban spread (0.6×radius).
        let densityProb = isVillage
            ? 1 - (dist / (maxRadius * 0.25))
            : 1 - (dist / (maxRadius * 0.6));
        
        // 2. CLEARANCE: Ensure probability hits 0 quickly outside the target zone
        densityProb = Math.max(0, densityProb); 
        
        // 3. SHARPEN DROP-OFF: Increase the exponent (from 1.8 to 4.0+) 
        // High numbers pack the center and leave the outskirts empty.
        densityProb = Math.pow(densityProb, 4.0);

        if (Math.random() > densityProb) continue;

        // Irregular building footprints
        let bw = 2 + Math.floor(Math.random() * 5); 
        let bh = 2 + Math.floor(Math.random() * 5); 

        // Check if space is empty and near a road or tightly packed to other buildings
        let canPlace = true;
        let nearCivilization = false;

        for (let x = bx - 1; x <= bx + bw; x++) {
            for (let y = by - 1; y <= by + bh; y++) {
                if (x < 0 || x >= CITY_COLS || y < 0 || y >= CITY_ROWS) {
                    canPlace = false; break;
                }
                if (x >= bx && x < bx + bw && y >= by && y < by + bh) {
                    if (grid[x][y] !== 0) canPlace = false; // The footprint itself must be pure ground
                } else {
                    if (grid[x][y] === 1 || grid[x][y] === 5 || grid[x][y] === 2) nearCivilization = true;
                }
            }
            if (!canPlace) break;
        }

        // Extremely close buildings don't need a road, they form slums/dense blocks
        if (dist < 25) nearCivilization = true;

        if (canPlace && nearCivilization) {
            let bWall = arch.walls[Math.floor(Math.random() * arch.walls.length)];
            let bRoof = arch.roofs[Math.floor(Math.random() * arch.roofs.length)];

            buildings.push({x: bx, y: by, w: bw, h: bh, wall: bWall, roof: bRoof});
            // POPULATION CAP: stop placing buildings once we hit the target
            if (buildings.length >= targetBuildings) break;
            for (let x = bx; x < bx + bw; x++) {
                for (let y = by; y < by + bh; y++) {
                    grid[x][y] = 2; // Mark as solid building
                }
            }
        }
    }

// Trees: Reduced from 40 clusters to 10; max spread from 18 to 10
generateOrganicFeatures(grid, 3, 10, 10); 

// Water: Reduced from 12 clusters to 4; max spread from 12 to 8
generateOrganicFeatures(grid, 4, 4, 8);

// =========================================================
    // HORIZONTAL PARTITION WALL — skipped for villages (no stone walls exist)
    // =========================================================
    if (!isVillage) {
        const partitionY = Math.floor(CITY_LOGICAL_ROWS * 0.35); // Adjust height here
        const wallStartX = 65; 
        const wallEndX = CITY_COLS - 65;
        for (let x = wallStartX; x <= wallEndX; x++) {
            for (let y = partitionY; y < partitionY + 3; y++) { // 3 tiles thick
                if (grid[x] && grid[x][y] !== undefined) {
                    // We leave the central road (1) and plaza (5) open for travel
                    if (grid[x][y] !== 1 && grid[x][y] !== 5) {
                        grid[x][y] = 8; 
                    }
                }
            }
        }
    }
    // =========================================================
	
    // --- Render Canvas with Texture Noise --- 
    const canvas = document.createElement('canvas');
    canvas.width = CITY_WORLD_WIDTH;  // FIX: Use full pixel width
    canvas.height = CITY_WORLD_HEIGHT; // FIX: Use full pixel height
    const ctx = canvas.getContext('2d');

    // Paint Ground
    ctx.fillStyle = arch.ground;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Paint Matrix Data (Roads, Plazas, Water, Trees, Bases)
    for (let i = 0; i < CITY_COLS; i++) {
        for (let j = 0; j < CITY_ROWS; j++) {
            if (grid[i][j] === 1 || grid[i][j] === 5) { 
                ctx.fillStyle = grid[i][j] === 1 ? arch.road : arch.plaza;
                ctx.fillRect(i * CITY_TILE_SIZE, j * CITY_TILE_SIZE, CITY_TILE_SIZE, CITY_TILE_SIZE);
                
                // Texture Noise: Random cobblestone/dirt specs
                if (Math.random() > 0.6) {
                    ctx.fillStyle = "rgba(0,0,0,0.15)";
                    ctx.fillRect((i * CITY_TILE_SIZE) + Math.random() * 4, (j * CITY_TILE_SIZE) + Math.random() * 4, 3, 3);
                }
            } else if (grid[i][j] === 0 && Math.random() > 0.95) {
                // Texture Noise: Grass/dirt tufts on the ground
                ctx.fillStyle = "rgba(0,0,0,0.1)";
                ctx.fillRect((i * CITY_TILE_SIZE) + Math.random() * 4, (j * CITY_TILE_SIZE) + Math.random() * 4, 2, 2);
            } else if (grid[i][j] === 3) { // Trees
                ctx.fillStyle = arch.trees[Math.floor(Math.random() * arch.trees.length)];
                ctx.beginPath();
                ctx.arc((i * CITY_TILE_SIZE) + 4, (j * CITY_TILE_SIZE) + 4, 6 + (Math.random()*3), 0, Math.PI*2);
                ctx.fill();
            } else if (grid[i][j] === 4) { // Water
                ctx.fillStyle = arch.water;
                ctx.fillRect(i * CITY_TILE_SIZE, j * CITY_TILE_SIZE, CITY_TILE_SIZE, CITY_TILE_SIZE);
            } 
        }
    }

    // Render Buildings with textured details
    for (let b of buildings) {
        // Draw Wall/Base
        ctx.fillStyle = b.wall; 
        ctx.fillRect(b.x * CITY_TILE_SIZE, b.y * CITY_TILE_SIZE, b.w * CITY_TILE_SIZE, b.h * CITY_TILE_SIZE);

        // Wall texture: random dark structural beam
        if (Math.random() > 0.5) {
            ctx.fillStyle = "rgba(0,0,0,0.2)";
            ctx.fillRect((b.x * CITY_TILE_SIZE) + 2, b.y * CITY_TILE_SIZE, 2, b.h * CITY_TILE_SIZE);
        }

        // Draw Roof with depth shift
        ctx.fillStyle = b.roof;
        ctx.fillRect(b.x * CITY_TILE_SIZE, b.y * CITY_TILE_SIZE - 6, b.w * CITY_TILE_SIZE, b.h * CITY_TILE_SIZE);
        
        // Roof texture: slates/shingles lines
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        for (let r = 0; r < b.w * CITY_TILE_SIZE; r += 4) {
             ctx.fillRect((b.x * CITY_TILE_SIZE) + r, b.y * CITY_TILE_SIZE - 6, 1, b.h * CITY_TILE_SIZE);
        }

        // Subtle highlight for 3D effect
        ctx.fillStyle = "rgba(255,255,255,0.07)";
        ctx.fillRect(b.x * CITY_TILE_SIZE, b.y * CITY_TILE_SIZE - 6, b.w * CITY_TILE_SIZE, (b.h * CITY_TILE_SIZE)/2);
        
        // Subtle shadow beneath the roof overhang
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(b.x * CITY_TILE_SIZE, (b.y + b.h) * CITY_TILE_SIZE - 6, b.w * CITY_TILE_SIZE, 2);
    }
// =========================================================
// Villages have no stone walls — skip the entire fortification build.
if (!isVillage && typeof buildCityWalls === 'function') {
    buildCityWalls(grid, arch, ctx, factionName);
} else if (isVillage) {
    // --- SURGERY: VILLAGE TOWER GENERATOR ---
    // (cityTowerPositions / cityLadders / overheadCityGates already cleared at top of generateCity)
    // 2. Randomize 1 to 2 freestanding towers
    let numTowers = Math.floor(Math.random() * 2) + 0; 
    let towersSpawned = 0;
    let attempts = 0;
    
    // Attempt to place towers close to the center plaza without hitting buildings
    while (towersSpawned < numTowers && attempts < 150) {
        attempts++;
        // Keep radius tight to the plaza (radius 8 to 22)
        let radius = 8 + Math.random() * 14; 
        let angle = Math.random() * Math.PI * 2;
        let rx = Math.floor(midX + Math.cos(angle) * radius);
        let ry = Math.floor(midY + Math.sin(angle) * radius);
        let towerSize = 7;

        // Check clearance: Do not overlap buildings(2), trees(3), water(4), or other towers(7)
        let canSpawn = true;
        for (let ix = rx - 1; ix <= rx + towerSize; ix++) {
            for (let iy = ry - 1; iy <= ry + towerSize; iy++) {
                if (ix < 0 || ix >= CITY_COLS || iy < 0 || iy >= CITY_LOGICAL_ROWS) {
                    canSpawn = false; break;
                }
                let t = grid[ix][iy];
                if (t === 2 || t === 3 || t === 4 || t === 7) {
                    canSpawn = false; break;
                }
            }
            if (!canSpawn) break;
        }

        if (canSpawn) {
            // Register tower core as a solid obstacle
            for (let ix = rx; ix < rx + towerSize; ix++) {
                for (let iy = ry; iy < ry + towerSize; iy++) {
                    grid[ix][iy] = 7; 
                }
            }

            let originalSize = towerSize * CITY_TILE_SIZE;
            let newSize      = originalSize * 1.10; 
            let offset       = (newSize - originalSize) / 2;
            let tX = (rx * CITY_TILE_SIZE) - offset;
            let tY = (ry * CITY_TILE_SIZE) - offset;

            // Register in the main loop so they shoot and render in 3D
            window.cityTowerPositions.push({
                pixelX:      tX + newSize / 2,
                pixelY:      tY + newSize / 2,
                tX, tY, newSize,
                side:        'Village', // Flag as standalone
                hp:          300,
                maxHp:       300,
                fireCooldown: Math.floor(Math.random() * 200 + 80),
            });

            // Physically paint the wooden wrap-around stairs to the ground canvas
            const woodDark  = "#4A3728";
            const woodBase  = "#A67B5B";
            const woodLight = "#D2B48C";
            const backdrop  = "#1a1a1a";

            for (let ix = rx - 1; ix <= rx + towerSize; ix++) {
                for (let iy = ry - 1; iy <= ry + towerSize; iy++) {
                    // Skip the solid core footprint
                    if (ix >= rx && ix < rx + towerSize && iy >= ry && iy < ry + towerSize) continue;
                    
                    let existingTile = grid[ix][iy];
                    // Overwrite ground, roads, and plaza
                    if (existingTile === 0 || existingTile === 1 || existingTile === 5 || existingTile === undefined) {
                        grid[ix][iy] = 12; // Scaffold tile (Walkable)
                        let spx = ix * CITY_TILE_SIZE, spy = iy * CITY_TILE_SIZE;
                        ctx.fillStyle = backdrop; 
                        ctx.fillRect(spx, spy, CITY_TILE_SIZE, CITY_TILE_SIZE);
                        
                        let isVert = (ix === rx - 1 || ix === rx + towerSize);
                        if (isVert) {
                            ctx.fillStyle = woodDark;
                            ctx.fillRect(spx + 1, spy, 2, CITY_TILE_SIZE);
                            ctx.fillRect(spx + CITY_TILE_SIZE - 3, spy, 2, CITY_TILE_SIZE);
                            for (let step = 1; step < CITY_TILE_SIZE; step += 3) {
                                ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(spx + 2, spy + step + 1, CITY_TILE_SIZE - 5, 1);
                                ctx.fillStyle = woodBase;  ctx.fillRect(spx + 2, spy + step, CITY_TILE_SIZE - 5, 1);
                                ctx.fillStyle = woodLight; ctx.fillRect(spx + 2, spy + step, CITY_TILE_SIZE - 5, 0.5);
                            }
                        } else {
                            ctx.fillStyle = woodDark;
                            ctx.fillRect(spx, spy + 1, CITY_TILE_SIZE, 2);
                            ctx.fillRect(spx, spy + CITY_TILE_SIZE - 3, CITY_TILE_SIZE, 2);
                            for (let step = 1; step < CITY_TILE_SIZE; step += 3) {
                                ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(spx + step + 1, spy + 2, 1, CITY_TILE_SIZE - 5);
                                ctx.fillStyle = woodBase;  ctx.fillRect(spx + step, spy + 2, 1, CITY_TILE_SIZE - 5);
                                ctx.fillStyle = woodLight; ctx.fillRect(spx + step, spy + 2, 0.5, CITY_TILE_SIZE - 5);
                            }
                        }
                    }
                }
            }
            towersSpawned++;
        }
    }
}

    cityDimensions[factionName] = {
        bgCanvas: canvas,
        grid: grid,
        isVillage: isVillage,   // remembered so enterCity can invalidate on type change
        pop: pop                // remembered so enterCity can invalidate on pop change
    };
    
    // Populate the city with NPCs and Troops
    if (typeof generateCityCosmeticNPCs === 'function') {
        generateCityCosmeticNPCs(factionName, grid, isVillage, pop);
    }
}

function isCityCollision(x, y, factionName = currentActiveCityFaction, isOnWall = false, isLarge = false) {
    if (!inCityMode || !factionName || !cityDimensions[factionName]) return false;
    
    let tileX = Math.floor(x / CITY_TILE_SIZE);
    let tileY = Math.floor(y / CITY_TILE_SIZE);

    if (tileX < 0 || tileX >= CITY_COLS || tileY < 0 || tileY >= CITY_ROWS) return true;
    
    let tile = cityDimensions[factionName].grid[tileX][tileY];
    
    // ---> SURGERY: Cavalry/Large Units cannot climb ladders or walk on walls <---
    if (isLarge && (tile === 7 || tile === 8 || tile === 9 || tile === 10 || tile === 12)) {
        return true; // Hard blocked (7 = tower body — no unit can enter a solid tower)
    }

    // --- FIX: TOWER ROOF OVERHANG BLOCK ---
    // CRITICAL: This check MUST sit before the tile-9/12 early-return below.
    // The wrap-around stair generator places tile-12 scaffold at row ry-1 (just north of
    // the tower core) — inside the roof overhang zone. Without this ordering, those
    // scaffold tiles fire the tile-9/12 early-return and let the player squeeze through.
    // renderDynamicTowers draws the roof ~38px north of tY (zBase=22 + pavH/roofOv stacking);
    // 42px covers that overhang plus a small safety buffer.
    if (window.cityTowerPositions) {
        const TOWER_ROOF_NORTH_OVERHANG = 42; // px: zBase(22)+pavH(20)+roofOv(10)-pavYoffset(≈14)+buffer
        for (let twr of window.cityTowerPositions) {
            if (
                x >= twr.tX - 2               &&
                x <= twr.tX + twr.newSize + 2  &&
                y >= twr.tY - TOWER_ROOF_NORTH_OVERHANG &&
                y <  twr.tY + twr.newSize
            ) {
                return true; // Blocked: inside tower visual footprint (including roof overhang)
            }
        }
    }

    // FIX: 9 = Ladder Bridge, 12 = Wooden Stairs. These are universally walkable for infantry!
    // (Intentionally AFTER the tower pixel check so scaffold tiles can't bypass the roof block.)
    if (tile === 9 || tile === 12) return false;

    if (isOnWall) {
        // LAYER: ON WALL (8 = Parapet floor, 10 = Tower/Gate top)
        // SURGERY 1: Added 'tile === 7' here. 
        // This allows units walking on the wall to pass smoothly through the tower pavilion.
        return !(tile === 8 || tile === 10 || tile === 7);
    } 

    // --- SURGERY: CIVILIAN SETTLEMENT VISIT MODE ---
    if (!inBattleMode) {
        if (tile === 10 || tile === 12) return false; 
        if (tile === 6 || tile === 7 || tile === 8) return true; // 7 = tower body, solid brick, no door
    }
	
    // LAYER: GROUND
    // Tile 7 = Tower body (solid brick, no door — nothing enters from ground level).
    // Wall-walking units (isOnWall=true) are handled above and already pass through tile 7 correctly.
    return tile === 2 || tile === 3 || tile === 4 || tile === 6 || tile === 7 || tile === 8 || tile === 10;
}
// --- Cavalry-only collision: blocks ONLY on buildings, walls, gates, towers, wagons ---
// Roads, ground, trees, water are all passable so riders never get stuck on road tiles.
function isCavCollision(x, y, factionName) {
    if (!inCityMode || !factionName || !cityDimensions[factionName]) return false;
    let tileX = Math.floor(x / CITY_TILE_SIZE);
    let tileY = Math.floor(y / CITY_TILE_SIZE);
    // Out-of-bounds = black abyss, treat as wall
    if (tileX < 1 || tileX >= CITY_COLS - 1 || tileY < 1 || tileY >= CITY_ROWS - 1) return true;
    let tile = cityDimensions[factionName].grid[tileX][tileY];
    // Tower roof overhang blocks
    if (window.cityTowerPositions) {
        const OV = 42;
        for (let twr of window.cityTowerPositions) {
            if (x >= twr.tX - 2 && x <= twr.tX + twr.newSize + 2 &&
                y >= twr.tY - OV  && y <  twr.tY + twr.newSize) return true;
        }
    }
    // Wagons act as solid obstacles — footprint is wagon body (~44px) + horse (~36px ahead)
    // dir=1: wagon left edge at cv.x, right edge at cv.x+120; dir=-1: mirrored.
    if (window.cityCaravans && window.cityCaravans[factionName]) {
        for (let cv of window.cityCaravans[factionName]) {
            let d = cv._dir !== undefined ? cv._dir : 1;
            let left  = cv.x + (d > 0 ? 0   : -120);
            let right = cv.x + (d > 0 ? 120 :    0);
            let top   = cv.y - 20;
            let bot   = cv.y + 16;
            if (x >= left && x <= right && y >= top && y <= bot) return true;
        }
    }
    // Only solid structures block — NOT roads (1), ground (0), plaza (5), trees (3), water (4)
    return tile === 2 || tile === 6 || tile === 7 || tile === 8 || tile === 10;
}

// --- City Entry/Exit ---
function enterCity(factionName, playerObj) {
    // Determine whether the entering city is a village.
    // activeCity is set in sandboxmode_update.js before enterCity is called.
    const _entering_isVillage = !!(
        typeof activeCity !== 'undefined' && activeCity && activeCity.isVillage
    );

    const _entering_pop = (typeof activeCity !== 'undefined' && activeCity && activeCity.pop)
        ? activeCity.pop : 1000;

    // If a cached interior exists but its village/city type mismatches, flush it
    // so the correct visual regenerates (e.g. after conquest or multi-city faction).
    // Also flush if population has shifted enough to change house / NPC counts.
    const _cached = cityDimensions[factionName];
    if (_cached) {
        const _popDiff = Math.abs((_cached.pop || 1000) - _entering_pop);
        if (_cached.isVillage !== _entering_isVillage || _popDiff >= 100) {
            delete cityDimensions[factionName];
            if (cityCosmeticNPCs[factionName]) delete cityCosmeticNPCs[factionName];
        }
    }

    generateCity(factionName, _entering_isVillage, _entering_pop);
    if (!cityDimensions || !cityDimensions[factionName]) return;
    
    savedWorldPlayerState.x = playerObj.x;
    savedWorldPlayerState.y = playerObj.y;
    
    // 🔴 CRITICAL: kill parle first
    closeParleUI();
// Add this inside your enterCity or initialization function
const cityPanel = document.getElementById('city-panel');
if (cityPanel) {
    cityPanel.style.display = 'none';
}

    inCityMode = true;
// ---> NEW: HEAL ALL TOWERS FOR NEW BATTLE
    if (window.cityTowerPositions) {
        window.cityTowerPositions.forEach(t => {
            t.hp = t.maxHp || 300;
            t.fireCooldown = Math.floor(Math.random() * 200 + 80);
        });
    }

    // ---> SURGERY: FORCE GATES OPEN FOR CITY VISITS <---
    // Ensures the gates are visually removed and functionally open so the player can walk through
    if (typeof overheadCityGates !== 'undefined') {
        overheadCityGates.forEach(g => {
            g.isOpen = true;
            g.gateHP = 0; 
        });
    }
    // Extra safety wipe
    const panel = document.getElementById('parle-panel');
    if (panel) panel.style.display = 'none';


    currentActiveCityFaction = factionName;
	
	// ---> PASTE HERE <---
    // Play the specific faction's scale, fallback to City_Ambient if independent
 
        AudioManager.playMusic("City_Ambient");
    
    
 // Find a safe spot (Road=1 or Plaza=5) near the center
    let foundSafeSpot = false;
    let grid = cityDimensions[factionName].grid;
	let centerX = Math.floor(CITY_COLS / 2);
    // SURGERY: Start searching for a safe spawn spot in the logical city center
    let centerY = Math.floor(CITY_LOGICAL_ROWS / 2);

    for (let radius = 0; radius < 30 && !foundSafeSpot; radius++) {
        for (let x = centerX - radius; x <= centerX + radius; x++) {
            for (let y = centerY - radius; y <= centerY + radius; y++) {
                if (grid[x] && (grid[x][y] === 1 || grid[x][y] === 5)) {
                    playerObj.x = x * CITY_TILE_SIZE;
                    playerObj.y = y * CITY_TILE_SIZE+300;
                    foundSafeSpot = true;
                    break;
                }
            }
            if (foundSafeSpot) break;
        }
    }

    if (!foundSafeSpot) {
                    playerObj.x = x * CITY_TILE_SIZE;
                    playerObj.y = y * CITY_TILE_SIZE+700;
    }
	// Trigger the Epic Zoom: Starts at 0.3x, lands at 1.2x over 1.2 seconds
    if (typeof triggerEpicZoom === 'function') {
        triggerEpicZoom(0.3, 1.2, 1200);
    }
}

function leaveCity(playerObj) {
    inCityMode = false;
    currentActiveCityFaction = null;
    
    // 1. CLEAR KEY BUFFER: This stops the "natural" velocity increase 
    // caused by keys being "stuck" during the transition.
    for (let key in keys) {
        keys[key] = false;
    }

    if (typeof activeCity !== 'undefined') activeCity = null;
    const panel = document.getElementById('city-panel');
    if (panel) panel.style.display = 'none';
    
    // 2. Reset Position
    playerObj.x = savedWorldPlayerState.x;
    playerObj.y = savedWorldPlayerState.y;
    
   // 3. Reset Physics
    playerObj.speed = 15; 
    playerObj.isMoving = false;
    playerObj.anim = 0; // Reset animation frame to prevent jitter

    // ---> SURGERY: HEAL AND CLOSE GATES ON EXIT <---
    // Resets the gates to 1000 HP and closes them so they are ready for a potential future siege
    if (typeof overheadCityGates !== 'undefined') {
        overheadCityGates.forEach(g => {
            g.isOpen = false;
            g.gateHP = 1000;
            // Restore the physics box X coordinate that was yeeted during the open state
            if (g.pixelRect && g.pixelRect.x === -9999) {
                // Calculation: (center x - gateRadius) * CITY_TILE_SIZE
                g.pixelRect.x = (g.x - 6) * 8; 
            }
        });
    }

    console.log("Returned to world map: Physics and Input cleared. Gates secured.");
	// ---> PASTE HERE <---
    AudioManager.playMusic("WorldMap_Calm");
	
	if (typeof cityDialogueSystem !== 'undefined') {
    cityDialogueSystem.state.active = false;
    cityDialogueSystem.state.text = "";
}

// --- ADD THIS TO SHUT THEM UP ON EXIT ---
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
	
}


// --- FACTION CIVILIAN STYLES DEFINITION ---
const CIVILIAN_STYLES = {
    "Hong Dynasty": { 
        hats: ["conical", "conical", "skullcap", "topknot", "bamboo_hat", "scholar"], 
        clothes: ["#4e6b5d", "#3a4f41", "#7a5c53", "#5c5c5c", "#8b6914", "#2e2e2e"] 
    },
    "Dab Tribes": { 
        hats: ["turban", "turban", "wrapped", "skullcap", "hood", "flat_cap"], 
        clothes: ["#8b5a2b", "#cd853f", "#556b2f", "#8b7500", "#a0522d", "#d2b48c"] 
    },
    "Great Khaganate": { 
        hats: ["fur_cap", "fur_cap", "pointed_fur", "leather_hood", "topknot", "skullcap"], 
        clothes: ["#8b4513", "#a0522d", "#5c4033", "#4a3329", "#6b4421", "#d2b48c"] 
    },
    "Jinlord Confederacy": { 
        hats: ["fur_cap", "conical", "skullcap", "hood", "bamboo_hat"], 
        clothes: ["#4f6a78", "#3f5461", "#2e404a", "#546e7a", "#1c262b", "#607d8b"] 
    },
    "Tran Realm": { 
        hats: ["conical", "bamboo_hat", "bamboo_hat", "bandana", "topknot"], 
        clothes: ["#4e342e", "#3e2723", "#5d4037", "#2e4a1f", "#1f3315", "#8d6e63"] 
    },
    "Goryun Kingdom": { 
        hats: ["tall_hat", "bamboo_hat", "skullcap", "topknot", "bandana"], 
        clothes: ["#4a148c", "#380b6b", "#424242", "#616161", "#212121", "#303030"] 
    },
    "Xiaran Dominion": {
        hats: ["turban", "hood", "skullcap", "wrapped", "bamboo_hat"],            
        clothes: ["#c29b55", "#b08a45", "#a67b27", "#8b5a2b", "#d4ad68", "#5c6b3e"] 
    },
    "High Plateau Kingdoms": {
        hats: ["fur_cap", "hood", "hood", "pointed_fur", "wrapped"],            
        clothes: ["#5d4037", "#8b0000", "#7a1a1a", "#4e342e", "#3e2723", "#2c1c19"] 
    },
    "Yamato Clans": {
        hats: ["topknot", "topknot", "bamboo_hat", "conical", "bandana"],            
        clothes: ["#454545", "#383838", "#2c2c2c", "#5c4a3d", "#4a3c31", "#881c2e"] 
    },
    "Bandits": {
        hats: ["hood", "bandana", "bandana", "skullcap", "topknot"],            
        clothes: ["#212121", "#111111", "#2e2e2e", "#3e2723", "#1a100e", "#33231c"] 
    },
    "Default": {
        hats: ["conical", "skullcap", "hood", "topknot"],
        clothes: ["#666666", "#888888", "#555555", "#444444"]
    }
};

function drawHuman(ctx, x, y, moving, frame, baseColor, hatType = "conical", clothColor = null) {
    ctx.save();
    ctx.translate(x, y);
    
    let legSwing = moving ? Math.sin(frame * 0.2) * 6 : 0;
    let bob = moving ? Math.abs(Math.sin(frame * 0.2)) * 2 : 0;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Legs
    ctx.strokeStyle = "#3e2723"; 
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(-3 - legSwing, 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(3 + legSwing, 9); ctx.stroke();

    // Body
    ctx.save();
    ctx.translate(0, -bob); 
    
    // Use specific clothing color if provided (civilians), otherwise fallback to baseColor (troops)
    ctx.fillStyle = clothColor || baseColor; 
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.lineTo(2, -9); ctx.lineTo(-2, -9);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    
    // Head/Face
    ctx.fillStyle = "#d4b886"; 
    ctx.beginPath(); ctx.arc(0, -11, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    
    // --- DYNAMIC HAT RENDERING ---
    switch(hatType) {
        case "turban":
            ctx.fillStyle = "#eeeeee";
            ctx.beginPath(); ctx.arc(0, -13, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.arc(-2, -12, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            break;
        case "fur_cap":
            ctx.fillStyle = "#5c4033";
            ctx.fillRect(-6, -15, 12, 5);
            ctx.strokeRect(-6, -15, 12, 5);
            break;
        case "pointed_fur":
            ctx.fillStyle = "#4a3329";
            ctx.beginPath(); ctx.moveTo(-6, -11); ctx.lineTo(0, -18); ctx.lineTo(6, -11); ctx.fill(); ctx.stroke();
            break;
        case "skullcap":
            ctx.fillStyle = "#222222";
            ctx.beginPath(); ctx.arc(0, -11, 4, Math.PI, 0); ctx.fill(); ctx.stroke();
            break;
        case "bamboo_hat":
            ctx.fillStyle = "#e8c37b";
            ctx.beginPath(); ctx.ellipse(0, -11, 10, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.ellipse(0, -12, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
            break;
        case "topknot":
            ctx.fillStyle = "#111111";
            ctx.fillRect(-2, -15, 4, 3); // Just hair, no hat
            break;
        case "hood":
            ctx.fillStyle = clothColor || baseColor; // Matches clothing
            ctx.beginPath(); ctx.arc(0, -11, 4.5, Math.PI, 0); ctx.fill(); ctx.stroke();
            ctx.fillRect(-4.5, -11, 9, 3);
            break;
        case "wrapped":
            ctx.fillStyle = "#8b7355";
            ctx.fillRect(-5, -14, 10, 4);
            ctx.strokeRect(-5, -14, 10, 4);
            break;
        case "tall_hat":
            ctx.fillStyle = "#111111";
            ctx.beginPath(); ctx.moveTo(-6, -11); ctx.lineTo(-4, -18); ctx.lineTo(4, -18); ctx.lineTo(6, -11); ctx.fill(); ctx.stroke();
            break;
        case "scholar":
            ctx.fillStyle = "#222222";
            ctx.fillRect(-6, -13, 12, 3);
            ctx.fillRect(-2, -16, 4, 3);
            break;
        case "bandana":
            ctx.fillStyle = "#8b0000";
            ctx.beginPath(); ctx.arc(0, -11, 4, Math.PI, 0); ctx.fill(); ctx.stroke();
            ctx.fillRect(-4, -11, 8, 2);
            break;
        case "conical":
        default:
            ctx.fillStyle = "#a1887f";
            ctx.beginPath(); ctx.moveTo(-9, -11); ctx.lineTo(0, -18); ctx.lineTo(9, -11);
            ctx.quadraticCurveTo(0, -10, -9, -11); ctx.fill(); ctx.stroke();
            break;
    }
    
    ctx.restore();
    ctx.restore();
}

function generateCityCosmeticNPCs(factionName, grid, isVillage = false, pop = 1000) {
    cityCosmeticNPCs[factionName] = [];
    let midX = CITY_COLS / 2;
    let midY = Math.floor(CITY_LOGICAL_ROWS / 2);
    let spawned = 0;
    let attempts = 0;
    
    // ── POPULATION-SCALED NPC COUNT ──────────────────────────────────────────
    // Goal: 10 pop = 1 roaming NPC.  Mobile ceiling: 40 NPCs.
    // Villages are always sparse; cities scale linearly up to the cap.
    const targetPopulation = isVillage
        ? Math.min(10, Math.max(2, Math.floor(pop / 10)))   // villages: 2–10
        : Math.min(40, Math.max(5, Math.floor(pop / 10)));  // cities:   5–40
    
    // Grab styles based on faction or use default
    let fStyles = CIVILIAN_STYLES[factionName] || CIVILIAN_STYLES["Default"];
	
    // Massive population decrease, heavily biased toward the center plaza and dense roads
    while (spawned < targetPopulation && attempts < 1000){
        attempts++;
        
        let angle = Math.random() * Math.PI * 2;
        let radius = (Math.random() * Math.random()) * (CITY_COLS / 2); 
        
        let tx = Math.floor(midX + Math.cos(angle) * radius);
        let ty = Math.floor(midY + Math.sin(angle) * radius);
        
        if (tx > 0 && tx < CITY_COLS && ty > 0 && ty < CITY_ROWS) {
            let newX = tx * CITY_TILE_SIZE;
            let newY = ty * CITY_TILE_SIZE;

            let tooCrowded = cityCosmeticNPCs[factionName].some(other => 
                Math.hypot(other.x - newX, other.y - newY) < 20
            );

            if (!tooCrowded && (grid[tx][ty] < 2 || grid[tx][ty] === 5)) {
                
                // --- Assign random hat and clothing to each civilian ---
                let randomHat = fStyles.hats[Math.floor(Math.random() * fStyles.hats.length)];
                let randomCloth = fStyles.clothes[Math.floor(Math.random() * fStyles.clothes.length)];

// REPLACE WITH THIS:
                // --- NEW: ASSIGN ROLES & STATES ---
                let roleRoll = Math.random();
                let role = "wanderer"; // Default: Walk a bit, pause a bit
                // ---> SURGERY: REDUCE NPC SPEED BY 5x <---
                let baseSpeed = 0.16; // Was 0.8
                
                if (roleRoll < 0.25) {
                    role = "idler"; // Stands around mostly
                    baseSpeed = 0.1; // Was 0.5
                } else if (roleRoll < 0.5) {
                    role = "commuter"; // Walks fast in long, straight lines
                    baseSpeed = 0.26; // Was 1.3
                }

                cityCosmeticNPCs[factionName].push({
                    x: newX,
                    y: newY,
                    vx: 0,
                    vy: 0,
                    animOffset: Math.random() * 100,
                    hat: randomHat,
                    clothing: randomCloth,
                    role: role,
                    state: "pausing",
                    stateTimer: Math.random() * 60, // How many frames until they rethink their action
                    baseSpeed: baseSpeed,
                    isKid: false, isParent: false,
                    despawnTimer: -1, _bubble: null,
                });
                spawned++;
            }
        }
    }

    // ── N-S WALKER COMMUTERS ─────────────────────────────────────────────────
    // Pedestrians that walk the main N-S road from edge to edge, drifting
    // slightly left/right with a cooldown so they never look like they're dancing.
    const nsWalkerTarget = isVillage
        ? Math.min(5,  Math.max(1, Math.floor(pop / 150)))
        : Math.min(16, Math.max(4, Math.floor(pop / 55)));

    let nsSpineCol = Math.floor(midX);
    for (let i = 0; i < nsWalkerTarget; i++) {
        let startRow = Math.floor(3 + Math.random() * (CITY_LOGICAL_ROWS - 6));
        let spawnCol = nsSpineCol;

        // Walk the road scan outward from the spine
        for (let dc = 0; dc <= 12; dc++) {
            let c = nsSpineCol + (dc % 2 === 0 ? dc / 2 : -(dc + 1) / 2);
            if (c < 0 || c >= CITY_COLS) continue;
            if (grid[c] && (grid[c][startRow] === 1 || grid[c][startRow] === 5)) {
                spawnCol = c; break;
            }
        }

        // Reject if the spawn tile is solid
        let spawnTile = grid[spawnCol] && grid[spawnCol][startRow];
        if (spawnTile === 2 || spawnTile === 6 || spawnTile === 7 || spawnTile === 8 || spawnTile === 10) continue;

        let randomHat   = fStyles.hats  [Math.floor(Math.random() * fStyles.hats.length)];
        let randomCloth = fStyles.clothes[Math.floor(Math.random() * fStyles.clothes.length)];

        cityCosmeticNPCs[factionName].push({
            x: spawnCol * CITY_TILE_SIZE,
            y: startRow * CITY_TILE_SIZE,
            vx: 0, vy: 0,
            animOffset: Math.random() * 100,
            hat: randomHat,
            clothing: randomCloth,
            role: "ns_commuter",
            state: "walking",
            stateTimer: 999,          // bypassed — ns_commuter has its own AI
            baseSpeed: 0.17 + Math.random() * 0.1,
            _nsDir: Math.random() < 0.5 ? 1 : -1,
            _xDrift: 0,               // current gentle horizontal nudge
            _xDriftCooldown: Math.floor(Math.random() * 100), // stagger initial drifts
            _pauseTimer: 0,
            isKid: false, isParent: false,
            despawnTimer: -1, _bubble: null,
        });
    }
}
function drawCityCosmeticNPCs(ctx, factionName, _ignored, zoom) {
    let npcs = cityCosmeticNPCs[factionName];
    if (!npcs) return;

    let factionColor = (typeof FACTIONS !== 'undefined' && FACTIONS[factionName]) 
                       ? FACTIONS[factionName].color : "#ffffff";

    for (let npc of npcs) {
        // Auto-transition Civilians
        let tx = Math.floor(npc.x / CITY_TILE_SIZE);
        let ty = Math.floor(npc.y / CITY_TILE_SIZE);
        if (typeof cityDimensions !== 'undefined' && cityDimensions[factionName]) {
            let currentTile = cityDimensions[factionName].grid[tx] ? cityDimensions[factionName].grid[tx][ty] : 0;
            if (currentTile === 9) npc.onWall = true;
            else if (currentTile === 0 || currentTile === 1 || currentTile === 5) npc.onWall = false;
        }

        // Failsafe: Push them inward if they glitch out of bounds
        if (isCityCollision(npc.x, npc.y, factionName, npc.onWall)) {
            let dirX = (CITY_WORLD_WIDTH / 2) - npc.x;
            let dirY = (CITY_WORLD_HEIGHT / 2) - npc.y;
            let angle = Math.atan2(dirY, dirX);
            npc.x += Math.cos(angle) * 5; 
            npc.y += Math.sin(angle) * 5;
            npc.stateTimer = 0; // Force them to pick a new path
        }

        // ==========================================
        // NEW: AI STATE MACHINE (Commute, Wander, Idle)
        // ==========================================
        // ── N-S WALKER COMMUTER AI ───────────────────────────────────────────
        // Handled entirely here — skips the stateTimer role-machine below.
        if (npc.role === "ns_commuter") {
            // Lazy-init for old save data
            if (npc._xDriftCooldown === undefined) npc._xDriftCooldown = 60;
            if (npc._xDrift         === undefined) npc._xDrift = 0;
            if (npc._nsDir          === undefined) npc._nsDir  = 1;
            if (npc._pauseTimer     === undefined) npc._pauseTimer = 0;

            // Count down X-drift cooldown; only pick a new drift when it expires
            if (npc._xDriftCooldown > 0) {
                npc._xDriftCooldown--;
            } else {
                // Gentle lateral nudge — never an abrupt 180° flip
                // Cooldown of 100–280 frames means at most ~1 direction change per 2 s
                npc._xDrift = (Math.random() - 0.5) * npc.baseSpeed * 0.65;
                npc._xDriftCooldown = 100 + Math.floor(Math.random() * 180);
            }

            // Reverse at city north / south logical edges
            if (npc.y < CITY_TILE_SIZE * 5)                                npc._nsDir =  1;
            if (npc.y > (CITY_LOGICAL_HEIGHT || 3200) - CITY_TILE_SIZE * 5) npc._nsDir = -1;

            if (npc._pauseTimer > 0) {
                npc._pauseTimer--;
                npc.vx = 0; npc.vy = 0;
                npc.state = "pausing";
            } else {
                npc.state = "walking";
                npc.vx = npc._xDrift;
                npc.vy = npc._nsDir * npc.baseSpeed;
                // Rare natural pause — market browsing, looking around
                if (Math.random() < 0.0018) {
                    npc._pauseTimer = 40 + Math.floor(Math.random() * 90);
                }
            }
        } else {
        // ── EXISTING ROLE-BASED AI (idler / wanderer / commuter) ─────────────

        npc.stateTimer--;

        if (npc.stateTimer <= 0) {
            if (npc.role === "idler") {
                // 80% chance to stand still, 20% to shuffle slightly
                if (Math.random() < 0.8) {
                    npc.state = "pausing";
                    npc.vx = 0; npc.vy = 0;
                    npc.stateTimer = 150 + Math.random() * 300; // Stand for a long time
                } else {
                    npc.state = "walking";
                    let angle = Math.random() * Math.PI * 2;
                    npc.vx = Math.cos(angle) * npc.baseSpeed;
                    npc.vy = Math.sin(angle) * npc.baseSpeed;
                    npc.stateTimer = 30 + Math.random() * 50; // Walk very briefly
                }
            } 
            else if (npc.role === "wanderer") {
                // Walks unpredictably, stops to look around often
                if (npc.state === "walking" && Math.random() < 0.5) {
                    npc.state = "pausing";
                    npc.vx = 0; npc.vy = 0;
                    npc.stateTimer = 40 + Math.random() * 100; // Look around
                } else {
                    npc.state = "walking";
                    let angle = Math.random() * Math.PI * 2;
                    npc.vx = Math.cos(angle) * npc.baseSpeed;
                    npc.vy = Math.sin(angle) * npc.baseSpeed;
                    npc.stateTimer = 60 + Math.random() * 120; // Walk unpredictably
                }
            } 
            else if (npc.role === "commuter") {
                // Walks purposefully in long straight lines, rarely stops
                if (Math.random() < 0.15) {
                    npc.state = "pausing";
                    npc.vx = 0; npc.vy = 0;
                    npc.stateTimer = 15 + Math.random() * 30; // Quick pause
                } else {
                    npc.state = "walking";
                    let angle = Math.random() * Math.PI * 2;
                    npc.vx = Math.cos(angle) * npc.baseSpeed;
                    npc.vy = Math.sin(angle) * npc.baseSpeed;
                    npc.stateTimer = 200 + Math.random() * 300; // Long journey
                }
            }
        }

        } // end existing role AI
        // ─────────────────────────────────────────────────────────────────────

        let nx = npc.x + npc.vx;
        let ny = npc.y + npc.vy;

        let hitHuman = npcs.some(other => 
            other !== npc && Math.hypot(other.x - nx, other.y - ny) < 12
        );

        // Path blocked? Stop immediately and reconsider path next frame
        if (isCityCollision(nx, ny, factionName, npc.onWall) || hitHuman) {
            npc.vx = 0; 
            npc.vy = 0;
            npc.state = "pausing";
            npc.stateTimer = 0; // Triggers new state logic immediately
        } else {
            npc.x = nx;
            npc.y = ny;
        }
        
        // --- NEW: Calculate Moving Boolean for Legs ---
        let isMoving = (npc.state === "walking" && (Math.abs(npc.vx) > 0.1 || Math.abs(npc.vy) > 0.1));

        // Pass 'isMoving' instead of 'true' so legs stop swinging when paused
        drawHuman(ctx, npc.x, npc.y, isMoving, (Date.now() / 50) + npc.animOffset, factionColor, npc.hat, npc.clothing);
        
    } // End NPC loop

    if (typeof policeTroops === 'function') {
        policeTroops(ctx, currentActiveCityFaction, player);
    }

    // City Dialogue Hooks
    if (inCityMode && !inBattleMode && currentActiveCityFaction && typeof cityDialogueSystem !== 'undefined') {
        cityDialogueSystem.tryAutoCityContact(player, currentActiveCityFaction, { radius: 22 });
        if (typeof cityDialogueUpdate === 'function') cityDialogueUpdate();
        if (typeof cityDialogueRender === 'function') cityDialogueRender(ctx);
    }
}
function isNearWall(x, y, grid) {
    for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
            let nx = x + dx;
            let ny = y + dy;

            if (grid[nx] && grid[nx][ny] !== undefined) {
                let tile = grid[nx][ny];
                if (tile === 8 || tile === 9 || tile === 10) {
                    return true;
                }
            }
        }
    }
    return false;
}







// =============================================================================
// city_life_extensions.js  —  Load AFTER city_system.js
// =============================================================================
// What this file does:
//   1. FIXES the leg-animation drift bug (legs now only move when position actually changes)
//   2. Adds KID NPCs (~18% of city population):
//        • Randomly scaled smaller (55-73 % of normal height)
//        • Two kid-roles: "playing" (chase / run around) and "following" (trail parent)
//        • Almost never fully stop – pause probability is very low
//        • Kids only ever emit kid-specific speech bubbles
//        • Nearby parent NPCs occasionally shout parenting lines at them
//   3. SPAWN / DESPAWN near buildings:
//        • Any NPC that drifts to a tile adjacent to a building and pauses
//          gets a short despawn countdown, then pops out of existence (entering building)
//        • ~55 % of the time a fresh NPC spawns at the same spot (exiting building)
//   4. Rare ANIMALS  —  birds, rodents, dogs, cats:
//        • All use isCityCollision() so they respect walls and buildings
//        • Drawn with their own small sprite routines
//        • Spawned at low counts; randomised per-city entry
// =============================================================================

(function patchCityLife() {
    'use strict';

    // ── DIALOGUE POOLS ────────────────────────────────────────────────────────
    const KID_LINES = [
        "Watch this!", "Tag — you're it!", "Faster, faster!",
        "I'm the strongest!", "Mama, look!", "I found a bug!",
        "Race you there!", "I'm not tired!", "He pushed me!",
        "Let me see!", "That's mine!", "Ow!", "Catch me!",
        "I don't wanna go!", "Can we eat soon?", "I'm so bored!",
        "Ewww!", "Look at that horse!", "Is that a soldier?!",
    ];

    const PARENT_LINES = [
        "Come back here!", "Don't run so far!",
        "Stay where I can see you!", "Put that down!",
        "We're going home soon.", "Be careful!",
        "Stop bothering people.", "Not now, child.",
        "Listen to me!", "Hold my hand.",
        "Don't touch that!", "Behave yourself!",
    ];

    // ── ANIMAL STORE (keyed by city faction name) ─────────────────────────────
    window.cityAnimals = window.cityAnimals || {};

    // =========================================================================
    // ANIMAL DRAW FUNCTIONS
    // All draw relative to (x, y) – the animal's world position.
    // =========================================================================

    function drawBird(ctx, x, y, moving, frame) {
        ctx.save();
        ctx.translate(x, y);
        let flap = moving ? Math.abs(Math.sin(frame * 0.45)) * 4.5 : 1.2;
        let bob  = moving ? Math.sin(frame * 0.32) * 1.5 : 0;

        // Wings (drawn before body so body sits on top)
        ctx.fillStyle = "#6b7c5e";
        ctx.beginPath();
        ctx.ellipse(-3, bob - flap * 0.55, 3.8, 1.6, -0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse( 3, bob - flap * 0.55, 3.8, 1.6,  0.35, 0, Math.PI * 2);
        ctx.fill();

        // Body
        ctx.fillStyle   = "#8a9e7a";
        ctx.strokeStyle = "#3a3a28";
        ctx.lineWidth   = 0.7;
        ctx.beginPath();
        ctx.ellipse(0, bob, 4.2, 2.6, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Head
        ctx.fillStyle = "#9eb08c";
        ctx.beginPath();
        ctx.arc(4.2, bob - 1.8, 2.6, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Beak
        ctx.fillStyle = "#cfa040";
        ctx.beginPath();
        ctx.moveTo(6.5, bob - 1.8);
        ctx.lineTo(9.5, bob - 2.2);
        ctx.lineTo(6.5, bob - 1.2);
        ctx.fill();

        // Eye dot
        ctx.fillStyle = "#1a1a1a";
        ctx.beginPath(); ctx.arc(5, bob - 2.4, 0.8, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
    }

    function drawRodent(ctx, x, y, moving, frame) {
        ctx.save();
        ctx.translate(x, y);
        let scurry = moving ? Math.sin(frame * 0.65) * 1.8 : 0;

        ctx.strokeStyle = "#4a3a30";
        ctx.lineWidth   = 0.8;

        // Tail
        ctx.strokeStyle = "#7a6858"; ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.quadraticCurveTo(-9, 3, -7.5, 6.5 + scurry);
        ctx.stroke();

        // Tiny legs
        ctx.strokeStyle = "#4a3a30"; ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(-2, 2); ctx.lineTo(-2 + scurry, 5.5);
        ctx.moveTo( 1, 2); ctx.lineTo( 1 - scurry, 5.5);
        ctx.stroke();

        // Body
        ctx.fillStyle   = "#9e8c7e";
        ctx.strokeStyle = "#4a3a30"; ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(0, 0, 5.2, 3.2, 0.18, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Head
        ctx.fillStyle = "#a89586";
        ctx.beginPath(); ctx.arc(5.2, -1.2, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

        // Ear
        ctx.fillStyle = "#c4a090";
        ctx.beginPath(); ctx.ellipse(5.2, -4.5, 1.6, 2.1, 0.18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

        // Nose
        ctx.fillStyle = "#c4a0a0";
        ctx.beginPath(); ctx.arc(8.2, -1.2, 1.0, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
    }

    function drawDog(ctx, x, y, moving, frame, dir) {
        dir = (dir >= 0) ? 1 : -1;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(dir, 1);

        let leg = moving ? Math.sin(frame * 0.25) * 5.5 : 0;
        let bob = moving ? Math.abs(Math.sin(frame * 0.25)) * 1.8 : 0;
        let wag = Math.sin(frame * 0.28) * 14;

        // Tail
        ctx.save();
        ctx.translate(-8, -3.5 + bob);
        ctx.rotate(wag * Math.PI / 180);
        ctx.strokeStyle = "#b08050"; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-5, -5, -3, -11); ctx.stroke();
        ctx.restore();

        // Back legs
        ctx.strokeStyle = "#8d6440"; ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-5.5, 2); ctx.lineTo(-7 - leg, 10.5);
        ctx.moveTo(-2,   2); ctx.lineTo(-1 - leg, 10.5);
        ctx.stroke();

        // Body
        ctx.fillStyle = "#b5926a"; ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.ellipse(0, bob, 9.5, 5.8, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Front legs
        ctx.strokeStyle = "#8d6440"; ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(4, 2); ctx.lineTo(5.5 + leg, 10.5);
        ctx.moveTo(7, 2); ctx.lineTo(8.5 + leg, 10.5);
        ctx.stroke();

        // Neck
        ctx.strokeStyle = "#b5926a"; ctx.lineWidth = 5.5;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(7.5, bob); ctx.lineTo(13, -4.5 + bob); ctx.stroke();

        // Head
        ctx.fillStyle = "#c4a070"; ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.ellipse(14.5, -5 + bob, 5.5, 4.5, 0.3, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Floppy ear
        ctx.fillStyle = "#8d6440";
        ctx.beginPath(); ctx.ellipse(12, -3.5 + bob, 2.8, 4.5, -0.4, 0, Math.PI * 2); ctx.fill();

        // Muzzle / nose
        ctx.fillStyle = "#2c1c19";
        ctx.beginPath(); ctx.ellipse(19, -5 + bob, 2.2, 1.7, 0, 0, Math.PI * 2); ctx.fill();

        // Eye
        ctx.fillStyle = "#1a1a1a";
        ctx.beginPath(); ctx.arc(15.5, -7.5 + bob, 1.3, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
    }

    function drawCat(ctx, x, y, moving, frame, dir) {
        dir = (dir >= 0) ? 1 : -1;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(dir, 1);

        let leg = moving ? Math.sin(frame * 0.22) * 4.5 : 0;
        let bob = moving ? Math.abs(Math.sin(frame * 0.22)) * 1.6 : 0;

        // Tail (curls up gracefully)
        ctx.strokeStyle = "#a88d5a"; ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-8, -1.5 + bob);
        ctx.bezierCurveTo(-12, -2, -14, -10, -9, -16);
        ctx.stroke();

        // Back legs
        ctx.strokeStyle = "#a08850"; ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-4, 2); ctx.lineTo(-5.5 - leg * 0.65, 9.5);
        ctx.moveTo(-1, 2); ctx.lineTo(-0.5 - leg * 0.65, 9.5);
        ctx.stroke();

        // Body
        ctx.fillStyle = "#c0a87e"; ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(0, bob, 8.5, 5.5, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Front legs
        ctx.strokeStyle = "#a08850"; ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(4, 2); ctx.lineTo(5.5 + leg * 0.65, 9.5);
        ctx.moveTo(6, 2); ctx.lineTo(7.5 + leg * 0.65, 9.5);
        ctx.stroke();

        // Head
        ctx.fillStyle = "#d4b88a"; ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(10.5, -4.5 + bob, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

        // Pointy ears
        ctx.fillStyle = "#c0a87e";
        ctx.beginPath();
        ctx.moveTo( 7.5, -8.5 + bob); ctx.lineTo( 9.5, -14 + bob); ctx.lineTo(12,   -8.5 + bob);
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(12.5, -8.5 + bob); ctx.lineTo(14.5, -14 + bob); ctx.lineTo(16.5, -8.5 + bob);
        ctx.fill(); ctx.stroke();

        // Eyes
        ctx.fillStyle = "#1a1a1a";
        ctx.beginPath(); ctx.arc( 9.2, -5.5 + bob, 1.1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(12.0, -5.5 + bob, 1.1, 0, Math.PI * 2); ctx.fill();

        // Nose
        ctx.fillStyle = "#e07060";
        ctx.beginPath(); ctx.arc(10.6, -3.8 + bob, 0.9, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
    }

    // =========================================================================
    // SPEECH BUBBLE HELPERS
    // =========================================================================
    function popBubble(npc, text) {
        npc._bubble = { text, timer: 140 };
    }

    function renderBubble(ctx, cx, cy, text, bgColor) {
        bgColor = bgColor || "#fffde7";
        ctx.save();
        ctx.font = "bold 7px Arial, sans-serif";
        let tw  = ctx.measureText(text).width;
        let bw  = tw + 8, bh = 12;
        let bx  = cx - bw / 2, by = cy - bh - 3;

        // Box
        ctx.fillStyle = bgColor; ctx.strokeStyle = "#555"; ctx.lineWidth = 0.8;
        if (ctx.roundRect) {
            ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 3); ctx.fill(); ctx.stroke();
        } else {
            ctx.fillRect(bx, by, bw, bh); ctx.strokeRect(bx, by, bw, bh);
        }
        // Tail triangle
        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.moveTo(cx - 3, by + bh);
        ctx.lineTo(cx + 3, by + bh);
        ctx.lineTo(cx, by + bh + 4);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#555"; ctx.lineWidth = 0.6;
        ctx.stroke();

        // Text
        ctx.fillStyle = "#222"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(text, cx, by + bh / 2);
        ctx.restore();
    }

    // =========================================================================
    // ANIMAL GENERATION
    // =========================================================================
    function generateCityAnimals(factionName, grid) {
        window.cityAnimals[factionName] = [];
        let midX = CITY_COLS / 2;
        let midY = Math.floor(CITY_LOGICAL_ROWS / 2);

        // Type : [minCount, maxCount, spawnChance]
        const ANIMAL_TYPES = {
            bird:   [1, 3, 1.00],   // birds always appear (at least 1)
            rodent: [0, 2, 0.55],
            dog:    [0, 2, 0.50],
            cat:    [0, 2, 0.45],
        };

        for (let [type, [mn, mx, chance]] of Object.entries(ANIMAL_TYPES)) {
            if (Math.random() > chance) continue;
            let count = mn + Math.floor(Math.random() * (mx - mn + 1));
            for (let i = 0; i < count; i++) {
                for (let attempt = 0; attempt < 350; attempt++) {
                    let ang = Math.random() * Math.PI * 2;
                    let rad = (0.05 + Math.random() * 0.55) * (CITY_COLS / 2);
                    let tx  = Math.floor(midX + Math.cos(ang) * rad);
                    let ty  = Math.floor(midY + Math.sin(ang) * rad);
                    if (tx > 1 && tx < CITY_COLS - 1 && ty > 1 && ty < CITY_ROWS - 1) {
                        let tile = grid[tx][ty];
                        if (tile === 0 || tile === 1 || tile === 5) {
                            window.cityAnimals[factionName].push({
                                type,
                                x: tx * CITY_TILE_SIZE,
                                y: ty * CITY_TILE_SIZE,
                                vx: 0, vy: 0,
                                animOffset: Math.random() * 100,
                                state: "idle",
                                stateTimer: Math.random() * 120,
                                dir: Math.random() < 0.5 ? 1 : -1,
                            });
                            break;
                        }
                    }
                }
            }
        }
    }

    // =========================================================================
    // ANIMAL AI + DRAW  (called once per frame per animal)
    // =========================================================================
    function updateAndDrawAnimal(ctx, animal, factionName) {
        let prevX = animal.x, prevY = animal.y;

        animal.stateTimer--;
        if (animal.stateTimer <= 0) {
            // Per-type config: [idleChance, speedMin, speedMax, idleTimerBase, walkTimerBase]
            const CFG = {
                bird:   [0.22, 0.42, 0.88, 35,  55],
                rodent: [0.32, 0.52, 1.05, 60,  14],
                dog:    [0.20, 0.18, 0.44, 100, 120],
                cat:    [0.62, 0.14, 0.32, 220, 90],
            };
            let [idleP, sMin, sMax, iBase, wBase] = CFG[animal.type] || [0.3, 0.3, 0.6, 80, 80];

            if (Math.random() < idleP) {
                animal.state = "idle";
                animal.vx = 0; animal.vy = 0;
                animal.stateTimer = iBase + Math.random() * iBase;
            } else {
                animal.state = "moving";
                let ang = Math.random() * Math.PI * 2;
                let spd = sMin + Math.random() * (sMax - sMin);
                animal.vx = Math.cos(ang) * spd;
                animal.vy = Math.sin(ang) * spd;
                animal.dir = animal.vx >= 0 ? 1 : -1;
                animal.stateTimer = wBase + Math.random() * wBase;
            }
        }

        // Move + collision bounce
        if (animal.vx !== 0 || animal.vy !== 0) {
            let nx = animal.x + animal.vx;
            let ny = animal.y + animal.vy;
            let blocked = typeof isCityCollision === 'function'
                && isCityCollision(nx, ny, factionName, false);
            if (blocked) {
                animal.vx *= -1; animal.vy *= -1;
                animal.dir *= -1;
                animal.stateTimer = 6;
            } else {
                animal.x = nx; animal.y = ny;
            }
        }

        let isMoving = (Math.abs(animal.x - prevX) > 0.005 || Math.abs(animal.y - prevY) > 0.005);
        let frame    = (Date.now() / 50) + animal.animOffset;

        ctx.save();
        switch (animal.type) {
            case "bird":
                // Birds are small — scale them down a bit
                ctx.translate(animal.x, animal.y);
                ctx.scale(0.72, 0.72);
                ctx.translate(-animal.x, -animal.y);
                drawBird(ctx, animal.x, animal.y, isMoving, frame);
                break;
            case "rodent":
                ctx.translate(animal.x, animal.y);
                ctx.scale(0.58, 0.58);
                ctx.translate(-animal.x, -animal.y);
                drawRodent(ctx, animal.x, animal.y, isMoving, frame);
                break;
            case "dog":
                drawDog(ctx, animal.x, animal.y, isMoving, frame, animal.dir);
                break;
            case "cat":
                drawCat(ctx, animal.x, animal.y, isMoving, frame, animal.dir);
                break;
        }
        ctx.restore();
    }

    // =========================================================================
    // KID AI  (called each frame for NPC entries flagged isKid = true)
    // =========================================================================
    function updateKidAI(kid, allNpcs) {
        // Kids almost never fully pause — only when stateTimer hits 0
        if (kid.stateTimer > 0) return;

        if (kid.kidRole === "following" && kid.followTarget) {
            let p = kid.followTarget;
            let dx = p.x - kid.x, dy = p.y - kid.y;
            let dist = Math.hypot(dx, dy);

            if (dist > 50) {
                // Sprint to catch up
                kid.vx = (dx / dist) * kid.baseSpeed * 1.45;
                kid.vy = (dy / dist) * kid.baseSpeed * 1.45;
                kid.state = "walking"; kid.stateTimer = 14;
            } else if (dist > 20) {
                kid.vx = (dx / dist) * kid.baseSpeed;
                kid.vy = (dy / dist) * kid.baseSpeed;
                kid.state = "walking"; kid.stateTimer = 24;
            } else {
                // Play nearby parent — very short pauses
                if (Math.random() < 0.28) {
                    kid.vx = 0; kid.vy = 0;
                    kid.state = "pausing"; kid.stateTimer = 12 + Math.random() * 22;
                } else {
                    let ang = Math.random() * Math.PI * 2;
                    kid.vx = Math.cos(ang) * kid.baseSpeed * 0.85;
                    kid.vy = Math.sin(ang) * kid.baseSpeed * 0.85;
                    kid.state = "walking"; kid.stateTimer = 18 + Math.random() * 28;
                }
            }
            if (Math.random() < 0.001) popBubble(kid, KID_LINES[Math.floor(Math.random() * KID_LINES.length)]);

        } else {
            // "playing" — chase other kids or run erratically
            let otherKids = allNpcs.filter(n => n.isKid && n !== kid);

            if (otherKids.length > 0 && Math.random() < 0.48) {
                // Chase a random kid
                let target = otherKids[Math.floor(Math.random() * otherKids.length)];
                let dx = target.x - kid.x, dy = target.y - kid.y;
                let dist = Math.hypot(dx, dy);
                if (dist > 0.01) {
                    kid.vx = (dx / dist) * kid.baseSpeed * 1.28;
                    kid.vy = (dy / dist) * kid.baseSpeed * 1.28;
                }
                kid.state = "walking"; kid.stateTimer = 28 + Math.random() * 42;
            } else if (Math.random() < 0.10) {
                // Rare brief pause even for playing kids
                kid.vx = 0; kid.vy = 0;
                kid.state = "pausing"; kid.stateTimer = 7 + Math.random() * 16;
            } else {
                // Run in random direction
                let ang = Math.random() * Math.PI * 2;
                kid.vx = Math.cos(ang) * kid.baseSpeed * 1.12;
                kid.vy = Math.sin(ang) * kid.baseSpeed * 1.12;
                kid.state = "walking"; kid.stateTimer = 25 + Math.random() * 50;
            }
            if (Math.random() < 0.0018) popBubble(kid, KID_LINES[Math.floor(Math.random() * KID_LINES.length)]);
        }
    }

    // =========================================================================
    // PATCHED: generateCityCosmeticNPCs
    // (replaces the one in city_system.js on window)
    // =========================================================================
    window.generateCityCosmeticNPCs = function(factionName, grid, isVillage, pop) {
        isVillage = isVillage || false;
        pop       = pop || 1000;
        cityCosmeticNPCs[factionName] = [];

        let midX = CITY_COLS / 2;
        let midY = Math.floor(CITY_LOGICAL_ROWS / 2);

        const total = isVillage
            ? Math.min(10, Math.max(2,  Math.floor(pop / 10)))
            : Math.min(40, Math.max(5,  Math.floor(pop / 10)));

        const targetKids = Math.max(1, Math.floor(total * 0.18));
        let kidsSpawned = 0, spawned = 0, attempts = 0;

        let fStyles = (typeof CIVILIAN_STYLES !== 'undefined')
            ? (CIVILIAN_STYLES[factionName] || CIVILIAN_STYLES["Default"] || { hats: ["conical"], clothes: ["#666"] })
            : { hats: ["conical"], clothes: ["#666"] };

        while (spawned < total && attempts < 1400) {
            attempts++;
            let ang    = Math.random() * Math.PI * 2;
            let radius = (Math.random() * Math.random()) * (CITY_COLS / 2);
            let tx     = Math.floor(midX + Math.cos(ang) * radius);
            let ty     = Math.floor(midY + Math.sin(ang) * radius);

            if (tx < 1 || tx >= CITY_COLS - 1 || ty < 1 || ty >= CITY_ROWS - 1) continue;

            let nx = tx * CITY_TILE_SIZE, ny = ty * CITY_TILE_SIZE;
            let tooCrowded = cityCosmeticNPCs[factionName].some(
                o => Math.hypot(o.x - nx, o.y - ny) < 20
            );
            let tile = grid[tx][ty];
            if (tooCrowded || (tile >= 2 && tile !== 5)) continue;

            let hat   = fStyles.hats[Math.floor(Math.random() * fStyles.hats.length)];
            let cloth = fStyles.clothes[Math.floor(Math.random() * fStyles.clothes.length)];

            // Decide if this slot should be a kid
            let makeKid = (kidsSpawned < targetKids)
                && (Math.random() < 0.22 || spawned > Math.floor(total * 0.78));

            if (makeKid) {
                let kidRole = Math.random() < 0.52 ? "playing" : "following";
                cityCosmeticNPCs[factionName].push({
                    x: nx, y: ny, vx: 0, vy: 0,
                    animOffset:   Math.random() * 100,
                    hat, clothing: cloth,
                    role: "kid", kidRole,
                    state: "walking",
                    stateTimer:   Math.random() * 25,
                    baseSpeed:    0.50 + Math.random() * 0.30,   // fast
                    kidScale:     0.55 + Math.random() * 0.18,   // 55%–73% height
                    followTarget: null,
                    isKid: true, isParent: false,
                    despawnTimer: -1, _bubble: null,
                });
                kidsSpawned++;
            } else {
                let rr    = Math.random();
                let role  = rr < 0.25 ? "idler" : rr < 0.50 ? "commuter" : "wanderer";
                let speed = role === "commuter" ? 0.26 : role === "idler" ? 0.10 : 0.16;
                // ~28 % of adults near kids become "parents"
                let isParent = (kidsSpawned > 0) && (Math.random() < 0.28);

                cityCosmeticNPCs[factionName].push({
                    x: nx, y: ny, vx: 0, vy: 0,
                    animOffset: Math.random() * 100,
                    hat, clothing: cloth, role,
                    state: "pausing",
                    stateTimer:   Math.random() * 60,
                    baseSpeed:    speed,
                    isKid: false, isParent,
                    despawnTimer: -1, _bubble: null,
                });
            }
            spawned++;
        }

        // Link following-kids to random parents
        let parents   = cityCosmeticNPCs[factionName].filter(n => n.isParent);
        let followers = cityCosmeticNPCs[factionName].filter(n => n.isKid && n.kidRole === "following");
        followers.forEach(kid => {
            if (parents.length) kid.followTarget = parents[Math.floor(Math.random() * parents.length)];
            else kid.kidRole = "playing";   // No parent? Just run around.
        });

        // Generate animals (stored separately to avoid dialogue/collision interference)
        generateCityAnimals(factionName, grid);
    };

    // =========================================================================
    // PATCHED: drawCityCosmeticNPCs
    // (replaces the one in city_system.js on window)
    // =========================================================================
    window.drawCityCosmeticNPCs = function(ctx, factionName, _ignored, zoom) {
        let npcs = cityCosmeticNPCs[factionName];
        if (!npcs) return;

        let grid = (typeof cityDimensions !== 'undefined' && cityDimensions[factionName])
            ? cityDimensions[factionName].grid : null;

        let factionColor = (typeof FACTIONS !== 'undefined' && FACTIONS[factionName])
            ? FACTIONS[factionName].color : "#ffffff";

        let fStyles = (typeof CIVILIAN_STYLES !== 'undefined')
            ? (CIVILIAN_STYLES[factionName] || CIVILIAN_STYLES["Default"] || { hats: ["conical"], clothes: ["#888"] })
            : { hats: ["conical"], clothes: ["#888"] };

        // ── SPAWN / DESPAWN NEAR BUILDINGS ──────────────────────────────────
        if (grid) {
            for (let i = npcs.length - 1; i >= 0; i--) {
                let npc = npcs[i];

                // Guard: only run despawn logic on NPCs that were explicitly
                // initialised with despawnTimer. NPCs spawned by older code
                // paths (no despawnTimer property) must be opted-in first so
                // that `undefined < 0` (false) never fast-paths them into an
                // instant respawn with a freshly-randomized hat/size.
                if (typeof npc.despawnTimer !== 'number') {
                    npc.despawnTimer = -1;  // opt-in safely; no countdown yet
                }

                let ttx = Math.floor(npc.x / CITY_TILE_SIZE);
                let tty = Math.floor(npc.y / CITY_TILE_SIZE);
                let nearBuilding = false;

                for (let ddx = -1; ddx <= 1 && !nearBuilding; ddx++) {
                    for (let ddy = -1; ddy <= 1 && !nearBuilding; ddy++) {
                        let col = grid[ttx + ddx];
                        if (col && col[tty + ddy] === 2) nearBuilding = true;
                    }
                }

                if (nearBuilding) {
                    // Only trigger if the NPC is pausing (pretend they're at the door)
                    if (npc.despawnTimer < 0) {
                        if (npc.state === "pausing" || (Math.abs(npc.vx) < 0.06 && Math.abs(npc.vy) < 0.06)) {
                            npc.despawnTimer = 55 + Math.floor(Math.random() * 85);
                        }
                    } else {
                        npc.despawnTimer--;
                        if (npc.despawnTimer <= 0) {
                            // Spawn a "fresh exit from building" NPC nearby (~55 % chance)
                            if (Math.random() < 0.55 && npcs.length < 43) {
                                let rr    = Math.random();
                                let role  = rr < 0.25 ? "idler" : rr < 0.50 ? "commuter" : "wanderer";
                                let speed = role === "commuter" ? 0.26 : role === "idler" ? 0.10 : 0.16;
                                npcs.push({
                                    x: npc.x + (Math.random() - 0.5) * 8,
                                    y: npc.y + (Math.random() - 0.5) * 8,
                                    vx: 0, vy: 0,
                                    animOffset: Math.random() * 100,
                                    hat:      fStyles.hats[Math.floor(Math.random() * fStyles.hats.length)],
                                    clothing: fStyles.clothes[Math.floor(Math.random() * fStyles.clothes.length)],
                                    role, state: "pausing", stateTimer: 10,
                                    baseSpeed: speed,
                                    isKid: false, isParent: false,
                                    despawnTimer: -1, _bubble: null,
                                });
                            }
                            npcs.splice(i, 1);
                            continue;
                        }
                    }
                } else {
                    npc.despawnTimer = -1;   // Reset if they walked away from the door
                }
            }
        }

        // ── MAIN UPDATE + DRAW PASS ──────────────────────────────────────────
        for (let npc of npcs) {
            let prevX = npc.x, prevY = npc.y;

            // ── Wall tile tracking (unchanged from original) ──
            if (grid) {
                let cx2 = Math.floor(npc.x / CITY_TILE_SIZE);
                let cy2 = Math.floor(npc.y / CITY_TILE_SIZE);
                let t   = (grid[cx2] ? grid[cx2][cy2] : 0) || 0;
                if (t === 9)                             npc.onWall = true;
                else if (t === 0 || t === 1 || t === 5) npc.onWall = false;
            }

            // ── Collision failsafe: push toward city center ──
            if (typeof isCityCollision === 'function'
                && isCityCollision(npc.x, npc.y, factionName, npc.onWall)) {
                let dx = (CITY_WORLD_WIDTH  / 2) - npc.x;
                let dy = (CITY_WORLD_HEIGHT / 2) - npc.y;
                let a  = Math.atan2(dy, dx);
                npc.x += Math.cos(a) * 5;
                npc.y += Math.sin(a) * 5;
                npc.stateTimer = 0;
            }

            // ── AI state machine ──
            npc.stateTimer--;

            if (npc.isKid) {
                // Kid AI is handled by a dedicated function
                updateKidAI(npc, npcs);

            } else {
                if (npc.stateTimer <= 0) {
                    if (npc.role === "idler") {
                        if (Math.random() < 0.80) {
                            npc.state = "pausing"; npc.vx = 0; npc.vy = 0;
                            npc.stateTimer = 150 + Math.random() * 300;
                        } else {
                            npc.state = "walking";
                            let a = Math.random() * Math.PI * 2;
                            npc.vx = Math.cos(a) * npc.baseSpeed;
                            npc.vy = Math.sin(a) * npc.baseSpeed;
                            npc.stateTimer = 30 + Math.random() * 50;
                        }
                    } else if (npc.role === "wanderer") {
                        if (npc.state === "walking" && Math.random() < 0.50) {
                            npc.state = "pausing"; npc.vx = 0; npc.vy = 0;
                            npc.stateTimer = 40 + Math.random() * 100;
                        } else {
                            npc.state = "walking";
                            let a = Math.random() * Math.PI * 2;
                            npc.vx = Math.cos(a) * npc.baseSpeed;
                            npc.vy = Math.sin(a) * npc.baseSpeed;
                            npc.stateTimer = 60 + Math.random() * 120;
                        }
                    } else if (npc.role === "commuter") {
                        if (Math.random() < 0.15) {
                            npc.state = "pausing"; npc.vx = 0; npc.vy = 0;
                            npc.stateTimer = 15 + Math.random() * 30;
                        } else {
                            npc.state = "walking";
                            let a = Math.random() * Math.PI * 2;
                            npc.vx = Math.cos(a) * npc.baseSpeed;
                            npc.vy = Math.sin(a) * npc.baseSpeed;
                            npc.stateTimer = 200 + Math.random() * 300;
                        }
                    }
                }

                // Parent dialogue towards nearby kids
                if (npc.isParent && Math.random() < 0.0008) {
                    let nearKid = npcs.find(
                        n => n.isKid && Math.hypot(n.x - npc.x, n.y - npc.y) < 70
                    );
                    if (nearKid) popBubble(npc, PARENT_LINES[Math.floor(Math.random() * PARENT_LINES.length)]);
                }
            }

            // ── Movement integration (same as original) ──
            if (npc.vx !== 0 || npc.vy !== 0) {
                let nnx = npc.x + npc.vx;
                let nny = npc.y + npc.vy;

                let hitWall  = typeof isCityCollision === 'function'
                    && isCityCollision(nnx, nny, factionName, npc.onWall);
                let hitHuman = npcs.some(o => o !== npc && Math.hypot(o.x - nnx, o.y - nny) < 12);

                if (hitWall || hitHuman) {
                    npc.vx = 0; npc.vy = 0;
                    npc.state = "pausing"; npc.stateTimer = 0;
                } else {
                    npc.x = nnx; npc.y = nny;
                }
            }

            // ── FIX: derive isMoving from ACTUAL position delta ──────────────
            // Original bug: isMoving was calculated from velocity + state, which stayed
            // false during the collision-failsafe push, causing silent sliding.
            // Fix: compare coordinates before and after this frame's updates.
            let isMoving = (Math.abs(npc.x - prevX) > 0.009 || Math.abs(npc.y - prevY) > 0.009);

            // ── Viewport cull: update positions even when off-screen, but skip draw ──
            {
                let _z2  = (typeof zoom !== 'undefined') ? zoom : 1;
                let _cW2 = (typeof canvas !== 'undefined') ? canvas.width  / _z2 : 640;
                let _cH2 = (typeof canvas !== 'undefined') ? canvas.height / _z2 : 360;
                let _m2  = 60;
                if (npc.x < player.x - _cW2/2 - _m2 || npc.x > player.x + _cW2/2 + _m2 ||
                    npc.y < player.y - _cH2/2 - _m2 || npc.y > player.y + _cH2/2 + _m2) {
                    continue; // off-screen: skip draw, position was already updated above
                }
            }

            // ── Draw ──
            if (typeof drawHuman === 'function') {
                if (npc.isKid) {
                    // Scale the kid around their world position
                    let ks = npc.kidScale || 0.65;
                    ctx.save();
                    ctx.translate(npc.x, npc.y);   // pivot at NPC centre
                    ctx.scale(ks, ks);
                    ctx.translate(-npc.x, -npc.y); // undo pivot so drawHuman's own translate works
                    // Kids use a faster anim clock so legs look energetic
                    drawHuman(ctx, npc.x, npc.y, isMoving,
                        (Date.now() / 38) + npc.animOffset, factionColor, npc.hat, npc.clothing);
                    ctx.restore();
                } else {
                    drawHuman(ctx, npc.x, npc.y, isMoving,
                        (Date.now() / 50) + npc.animOffset, factionColor, npc.hat, npc.clothing);
                }
            }
        } // end NPC loop

        // ── SPEECH BUBBLE PASS (after all sprites so bubbles sit on top) ────
        for (let npc of npcs) {
            if (!npc._bubble) continue;
            npc._bubble.timer--;
            if (npc._bubble.timer > 0) {
                let bg = npc.isKid ? "#ffe082" : (npc.isParent ? "#fff3e0" : "#fffde7");
                renderBubble(ctx, npc.x, npc.y - 20, npc._bubble.text, bg);
            } else {
                npc._bubble = null;
            }
        }

        // ── ANIMAL PASS ──────────────────────────────────────────────────────
        let animals = window.cityAnimals[factionName];
        if (animals) animals.forEach(a => updateAndDrawAnimal(ctx, a, factionName));

        // ── Police troops hook (unchanged from original) ──────────────────────
        if (typeof policeTroops === 'function') {
            policeTroops(ctx, currentActiveCityFaction, player);
        }

        // ── City dialogue system hooks (unchanged from original) ──────────────
        if (typeof inCityMode !== 'undefined' && inCityMode
            && typeof inBattleMode !== 'undefined' && !inBattleMode
            && typeof currentActiveCityFaction !== 'undefined' && currentActiveCityFaction
            && typeof cityDialogueSystem !== 'undefined') {
            cityDialogueSystem.tryAutoCityContact(player, currentActiveCityFaction, { radius: 22 });
            if (typeof cityDialogueUpdate === 'function') cityDialogueUpdate();
            if (typeof cityDialogueRender === 'function') cityDialogueRender(ctx);
        }
    };

    // ── Patch enterCity to flush stale animals for a fresh entry ──────────────
    // (generateCityCosmeticNPCs already calls generateCityAnimals on cache-miss,
    //  but enterCity may flush cityDimensions without touching cityAnimals.)
    let _origEnterCity = window.enterCity;
    if (typeof _origEnterCity === 'function') {
        window.enterCity = function(factionName, playerObj) {
            if (window.cityAnimals) delete window.cityAnimals[factionName];
            return _origEnterCity.apply(this, arguments);
        };
    }

    console.log("[CityLifeExt] ✓ drift-fix · kids · animals · spawn/despawn loaded.");
})();

// =============================================================================
// city_caravan_patch.js  —  Load AFTER city_system.js AND after city_life_extensions
// =============================================================================
// What this patch does (everything scoped to inCityMode):
//
//  1. SCALE FIX — Dog is drawn 4× too large → apply 0.25 scale.
//                 Cat is also oversized → apply 0.28 scale.
//                 Bird & rodent already have correct scale factors; left as-is.
//
//  2. ANIMAL SPAWN BOOST — Rodent/Dog/Cat spawn chances raised so the city
//                 feels more alive. Kids/humans intentionally untouched.
//
//  3. CIVILIAN HORSE — drawCityHorse(ctx, x, y, moving, frame, dir, coatColor)
//                 A standalone, unarmed, unarmored horse function derived from
//                 cavscript geometry but:
//                   • No weapons, no flags, no chamfron, no commander gear
//                   • Scaled ~0.82× so it reads naturally alongside city humans
//                   • Accepts a direction flag so it mirrors correctly
//
//  4. CIVILIAN RIDER — drawCityRider(ctx, x, y, moving, frame, dir, clothColor, hatType)
//                 Simple seated civilian on horseback; hat from faction CIVILIAN_STYLES.
//                 No armor whatsoever. Shares the drawHuman hat catalogue.
//
//  5. TRADE CARAVANS — window.cityCaravans[faction]
//                 Each caravan: 2 horses + 1 goods wagon trailing behind.
//                 • Road-following AI (tile 1 / tile 5); obeys isCityCollision
//                 • Traffic awareness: slows & waits if NPCs are in the path
//                 • No flags; cargo wagon has a canvas cover + rope lashing
//                 • Wagon faces same direction as horses (left/right render)
//
//  6. LONE CIVILIAN RIDERS — window.cityRiders[faction]
//                 Occasional single mounted civilians trotting along roads.
//                 Same road-following AI as caravans, smaller turn radius.
//                 No armor, no weapons, civilian hat.
//
// =============================================================================

(function patchCityCaravan() {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    // 1.  ANIMAL SCALE & SPAWN FIXES
    // ─────────────────────────────────────────────────────────────────────────

    // We monkey-patch the updateAndDrawAnimal function by wrapping the existing
    // patchCityLife IIFE's private helper.  Since that helper is private, we
    // patch drawCityCosmeticNPCs (which calls it) at the animal-pass level.

    // Store references to global stores so we can also fix generateCityAnimals.
    // generateCityAnimals is also private inside the IIFE, so we override the
    // outer generateCityCosmeticNPCs, which calls it, to inject corrected
    // ANIMAL_TYPES config via a shim before calling the original.

    //  Patch: override generateCityCosmeticNPCs to inject corrected animal config.
    let _prevGenNPCs = window.generateCityCosmeticNPCs;
    window.generateCityCosmeticNPCs = function(factionName, grid, isVillage, pop) {
        // Run the original (which calls the private generateCityAnimals internally)
        if (typeof _prevGenNPCs === 'function') _prevGenNPCs(factionName, grid, isVillage, pop);

        // Now RE-generate animals with the boosted spawn chances,
        // overwriting whatever the original placed.
        _generateCityAnimalsPatched(factionName, grid);
    };

    function _generateCityAnimalsPatched(factionName, grid) {
        if (!window.cityAnimals) window.cityAnimals = {};
        window.cityAnimals[factionName] = [];

        let midX = CITY_COLS / 2;
        let midY = Math.floor(CITY_LOGICAL_ROWS / 2);

        // ── BOOSTED SPAWN CHANCES ──────────────────────────────────────────
        // bird: unchanged (always appears)
        // rodent: 0.55 → 0.80
        // dog:    0.50 → 0.75   (scale applied at draw time below)
        // cat:    0.45 → 0.70   (scale applied at draw time below)
        const ANIMAL_TYPES_PATCHED = {
            bird:   { min: 1, max: 3, chance: 1.00 },
            rodent: { min: 0, max: 2, chance: 0.80 },
            dog:    { min: 0, max: 2, chance: 0.75 },
            cat:    { min: 0, max: 2, chance: 0.70 },
        };

        for (let [type, cfg] of Object.entries(ANIMAL_TYPES_PATCHED)) {
            if (Math.random() > cfg.chance) continue;
            let count = cfg.min + Math.floor(Math.random() * (cfg.max - cfg.min + 1));
            for (let i = 0; i < count; i++) {
                for (let attempt = 0; attempt < 350; attempt++) {
                    let ang = Math.random() * Math.PI * 2;
                    let rad = (0.05 + Math.random() * 0.55) * (CITY_COLS / 2);
                    let tx  = Math.floor(midX + Math.cos(ang) * rad);
                    let ty  = Math.floor(midY + Math.sin(ang) * rad);
                    if (tx > 1 && tx < CITY_COLS - 1 && ty > 1 && ty < CITY_ROWS - 1) {
                        let tile = grid[tx][ty];
                        if (tile === 0 || tile === 1 || tile === 5) {
                            window.cityAnimals[factionName].push({
                                type,
                                x: tx * CITY_TILE_SIZE,
                                y: ty * CITY_TILE_SIZE,
                                vx: 0, vy: 0,
                                animOffset: Math.random() * 100,
                                state: 'idle',
                                stateTimer: Math.random() * 120,
                                dir: Math.random() < 0.5 ? 1 : -1,
                            });
                            break;
                        }
                    }
                }
            }
        }
    }

    // ── Scale fix for dog & cat ──────────────────────────────────────────────
    // We patch the animal draw pass inside drawCityCosmeticNPCs.
    // Since we can't reach the private updateAndDrawAnimal, we override the
    // whole drawCityCosmeticNPCs and delegate everything except the animal pass.

    let _prevDrawNPCs = window.drawCityCosmeticNPCs;
    window.drawCityCosmeticNPCs = function(ctx, factionName, _ignored, zoom) {
        // Run the original (handles humans, kids, dialogue hooks, police hook)
        // but suppress the original animal pass (wrong scale) by swapping the
        // animal store, running, then restoring and drawing ourselves.
        let savedAnimals = window.cityAnimals[factionName];
        window.cityAnimals[factionName] = [];           // hide animals from original
        if (typeof _prevDrawNPCs === 'function') _prevDrawNPCs(ctx, factionName, _ignored, zoom);
        window.cityAnimals[factionName] = savedAnimals; // restore

        // ── Viewport bounds for animal culling ────────────────────────────────
        // NOTE: no frame-skip throttle here — skipping draws causes flicker.
        // Viewport culling (below + inside _drawCaravans/_drawRiders) is the
        // only optimisation needed; it avoids drawing anything off-screen.
        let _z    = (typeof zoom !== 'undefined') ? zoom : 1;
        let _cW   = (typeof canvas !== 'undefined') ? canvas.width  / _z : 640;
        let _cH   = (typeof canvas !== 'undefined') ? canvas.height / _z : 360;
        let _marg = 80;
        let _aL   = player.x - _cW / 2 - _marg;
        let _aR   = player.x + _cW / 2 + _marg;
        let _aT   = player.y - _cH / 2 - _marg;
        let _aB   = player.y + _cH / 2 + _marg;

        // Draw animals with corrected scales + viewport cull
        if (savedAnimals) {
            savedAnimals.forEach(a => {
                if (a.x < _aL || a.x > _aR || a.y < _aT || a.y > _aB) return;
                _updateAndDrawAnimalPatched(ctx, a, factionName);
            });
        }

        // Caravans & lone riders each do their own per-entity viewport culling
        _drawCaravans(ctx, factionName);
        _drawRiders(ctx, factionName);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // PATCHED animal draw (only dog & cat change; bird/rodent kept identical)
    // ─────────────────────────────────────────────────────────────────────────
    function _updateAndDrawAnimalPatched(ctx, animal, factionName) {
        let prevX = animal.x, prevY = animal.y;

        animal.stateTimer--;
        if (animal.stateTimer <= 0) {
            const CFG = {
                bird:   [0.22, 0.42, 0.88, 35,  55],
                rodent: [0.32, 0.52, 1.05, 60,  14],
                dog:    [0.20, 0.18, 0.44, 100, 120],
                cat:    [0.62, 0.14, 0.32, 220, 90],
            };
            let [idleP, sMin, sMax, iBase, wBase] = CFG[animal.type] || [0.3, 0.3, 0.6, 80, 80];
            if (Math.random() < idleP) {
                animal.state = 'idle';
                animal.vx = 0; animal.vy = 0;
                animal.stateTimer = iBase + Math.random() * iBase;
            } else {
                animal.state = 'moving';
                let ang = Math.random() * Math.PI * 2;
                let spd = sMin + Math.random() * (sMax - sMin);
                animal.vx = Math.cos(ang) * spd;
                animal.vy = Math.sin(ang) * spd;
                animal.dir = animal.vx >= 0 ? 1 : -1;
                animal.stateTimer = wBase + Math.random() * wBase;
            }
        }

        if (animal.vx !== 0 || animal.vy !== 0) {
            let nx = animal.x + animal.vx;
            let ny = animal.y + animal.vy;
            let blocked = typeof isCityCollision === 'function'
                && isCityCollision(nx, ny, factionName, false);
            if (blocked) {
                animal.vx *= -1; animal.vy *= -1;
                animal.dir *= -1;
                animal.stateTimer = 6;
            } else {
                animal.x = nx; animal.y = ny;
            }
        }

        let isMoving = (Math.abs(animal.x - prevX) > 0.005 || Math.abs(animal.y - prevY) > 0.005);
        let frame    = (Date.now() / 50) + animal.animOffset;

        ctx.save();
        switch (animal.type) {
            case 'bird':
                ctx.translate(animal.x, animal.y);
                ctx.scale(0.72, 0.72);
                ctx.translate(-animal.x, -animal.y);
                _drawBird(ctx, animal.x, animal.y, isMoving, frame);
                break;
            case 'rodent':
                ctx.translate(animal.x, animal.y);
                ctx.scale(0.58, 0.58);
                ctx.translate(-animal.x, -animal.y);
                _drawRodent(ctx, animal.x, animal.y, isMoving, frame);
                break;
            case 'dog':
                // ── FIX: dog was 4× too large ──
                ctx.translate(animal.x, animal.y);
                ctx.scale(0.25, 0.25);
                ctx.translate(-animal.x, -animal.y);
                _drawDog(ctx, animal.x, animal.y, isMoving, frame, animal.dir);
                break;
            case 'cat':
                // ── FIX: cat similarly oversized ──
                ctx.translate(animal.x, animal.y);
                ctx.scale(0.28, 0.28);
                ctx.translate(-animal.x, -animal.y);
                _drawCat(ctx, animal.x, animal.y, isMoving, frame, animal.dir);
                break;
        }
        ctx.restore();
    }

    // Local copies of the private animal draw fns (verbatim from city_system.js)
    function _drawBird(ctx, x, y, moving, frame) {
        ctx.save(); ctx.translate(x, y);
        let flap = moving ? Math.abs(Math.sin(frame * 0.45)) * 4.5 : 1.2;
        let bob  = moving ? Math.sin(frame * 0.32) * 1.5 : 0;
        ctx.fillStyle = '#6b7c5e';
        ctx.beginPath(); ctx.ellipse(-3, bob - flap * 0.55, 3.8, 1.6, -0.35, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse( 3, bob - flap * 0.55, 3.8, 1.6,  0.35, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#8a9e7a'; ctx.strokeStyle = '#3a3a28'; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.ellipse(0, bob, 4.2, 2.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#9eb08c';
        ctx.beginPath(); ctx.arc(4.2, bob - 1.8, 2.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#cfa040';
        ctx.beginPath(); ctx.moveTo(6.5, bob - 1.8); ctx.lineTo(9.5, bob - 2.2); ctx.lineTo(6.5, bob - 1.2); ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.arc(5, bob - 2.4, 0.8, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    function _drawRodent(ctx, x, y, moving, frame) {
        ctx.save(); ctx.translate(x, y);
        let scurry = moving ? Math.sin(frame * 0.65) * 1.8 : 0;
        ctx.strokeStyle = '#7a6858'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(-5, 0); ctx.quadraticCurveTo(-9, 3, -7.5, 6.5 + scurry); ctx.stroke();
        ctx.strokeStyle = '#4a3a30'; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(-2, 2); ctx.lineTo(-2 + scurry, 5.5); ctx.moveTo(1, 2); ctx.lineTo(1 - scurry, 5.5); ctx.stroke();
        ctx.fillStyle = '#9e8c7e'; ctx.strokeStyle = '#4a3a30'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.ellipse(0, 0, 5.2, 3.2, 0.18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#a89586';
        ctx.beginPath(); ctx.arc(5.2, -1.2, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#c4a090';
        ctx.beginPath(); ctx.ellipse(5.2, -4.5, 1.6, 2.1, 0.18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#c4a0a0';
        ctx.beginPath(); ctx.arc(8.2, -1.2, 1.0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    function _drawDog(ctx, x, y, moving, frame, dir) {
        dir = (dir >= 0) ? 1 : -1;
        ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
        let leg = moving ? Math.sin(frame * 0.25) * 5.5 : 0;
        let bob = moving ? Math.abs(Math.sin(frame * 0.25)) * 1.8 : 0;
        let wag = Math.sin(frame * 0.28) * 14;
        ctx.save(); ctx.translate(-8, -3.5 + bob); ctx.rotate(wag * Math.PI / 180);
        ctx.strokeStyle = '#b08050'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-5, -5, -3, -11); ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = '#8d6440'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-5.5, 2); ctx.lineTo(-7 - leg, 10.5); ctx.moveTo(-2, 2); ctx.lineTo(-1 - leg, 10.5); ctx.stroke();
        ctx.fillStyle = '#b5926a'; ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.ellipse(0, bob, 9.5, 5.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#8d6440'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(4, 2); ctx.lineTo(5.5 + leg, 10.5); ctx.moveTo(7, 2); ctx.lineTo(8.5 + leg, 10.5); ctx.stroke();
        ctx.strokeStyle = '#b5926a'; ctx.lineWidth = 5.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(7.5, bob); ctx.lineTo(13, -4.5 + bob); ctx.stroke();
        ctx.fillStyle = '#c4a070'; ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.ellipse(14.5, -5 + bob, 5.5, 4.5, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#8d6440';
        ctx.beginPath(); ctx.ellipse(12, -3.5 + bob, 2.8, 4.5, -0.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2c1c19';
        ctx.beginPath(); ctx.ellipse(19, -5 + bob, 2.2, 1.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.arc(15.5, -7.5 + bob, 1.3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    function _drawCat(ctx, x, y, moving, frame, dir) {
        dir = (dir >= 0) ? 1 : -1;
        ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
        let leg = moving ? Math.sin(frame * 0.22) * 4.5 : 0;
        let bob = moving ? Math.abs(Math.sin(frame * 0.22)) * 1.6 : 0;
        ctx.strokeStyle = '#a88d5a'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(-8, -1.5 + bob); ctx.bezierCurveTo(-12, -2, -14, -10, -9, -16); ctx.stroke();
        ctx.strokeStyle = '#a08850'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(-4, 2); ctx.lineTo(-5.5 - leg * 0.65, 9.5); ctx.moveTo(-1, 2); ctx.lineTo(-0.5 - leg * 0.65, 9.5); ctx.stroke();
        ctx.fillStyle = '#c0a87e'; ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(0, bob, 8.5, 5.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#a08850'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(4, 2); ctx.lineTo(5.5 + leg * 0.65, 9.5); ctx.moveTo(6, 2); ctx.lineTo(7.5 + leg * 0.65, 9.5); ctx.stroke();
        ctx.fillStyle = '#d4b88a'; ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(10.5, -4.5 + bob, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#c0a87e';
        ctx.beginPath(); ctx.moveTo(7.5, -8.5 + bob); ctx.lineTo(9.5, -14 + bob); ctx.lineTo(12, -8.5 + bob); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(12.5, -8.5 + bob); ctx.lineTo(14.5, -14 + bob); ctx.lineTo(16.5, -8.5 + bob); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.arc(9.2, -5.5 + bob, 1.1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(12.0, -5.5 + bob, 1.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e07060';
        ctx.beginPath(); ctx.arc(10.6, -3.8 + bob, 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. CIVILIAN HORSE  (stripped from cavscript, scaled for city mode)
    //    Scale ≈ 0.82 → horse+rider reads ~35px tall vs human ~27px
    //    dir: 1 = facing right (natural), -1 = facing left (mirrored)
    // ─────────────────────────────────────────────────────────────────────────
    function drawCityHorse(ctx, x, y, moving, frame, dir, coatColor) {
        coatColor = coatColor || '#795548';
        dir = (dir >= 0) ? 1 : -1;
        const CITY_HORSE_SCALE = 0.82;

        ctx.save();
        ctx.translate(x, y);
        ctx.scale(dir * CITY_HORSE_SCALE, CITY_HORSE_SCALE);

        let walkSpeed = moving ? frame * 0.15 : 0;
        let hBob      = moving ? Math.sin(walkSpeed * 2) * 1.5 : 0;
        let headNod   = moving ? Math.sin(walkSpeed * 2) * 1.5 : 0;
        let tailSwish = moving ? Math.sin(walkSpeed) * 2.5 : 0;

        const bodyColor  = coatColor;
        const darkBody   = _darken(coatColor, 0.75);
        const farLeg     = _darken(coatColor, 0.55);
        const lineColor  = '#3e2723';

        ctx.lineCap  = 'round';
        ctx.lineJoin = 'round';

        // ── helper leg ──
        function drawLeg(isFront, isNear, phaseOffset) {
            let phase = walkSpeed + phaseOffset;
            let swing = moving ? Math.sin(phase) : 0;
            let lift  = moving ? Math.max(0, -Math.cos(phase)) : 0;
            ctx.fillStyle = isNear ? darkBody : farLeg;
            ctx.beginPath();
            if (isFront) {
                let sx = isNear ? -7 : -4, sy = hBob + 4;
                let kx = sx - 1 + swing * 3, ky = sy + 6 - lift * 2;
                let fx = kx + swing * 1.5,   fy = ky + 5 - lift * 3.5;
                let hx = fx - (lift > 0.1 ? 1 : 0), hy = fy + 2.5;
                ctx.moveTo(sx + 2, sy);
                ctx.quadraticCurveTo(sx - 2, sy + 2, kx - 1.5, ky);
                ctx.lineTo(hx - 1.5, hy); ctx.lineTo(hx + 1.5, hy);
                ctx.lineTo(fx + 1.2, fy);
                ctx.quadraticCurveTo(kx + 1.8, ky + 1, sx + 2.5, sy + 3);
            } else {
                let sx = isNear ? 5 : 7, sy = hBob + 3;
                let stx = sx - 2 + swing * 1.5, sty = sy + 4 - lift * 0.5;
                let hkx = stx + 1.5 + swing * 2, hky = sty + 4 - lift * 1.5;
                let ftx = hkx - 1.5 + swing * 1.5, fty = hky + 4 - lift * 2.5;
                let hx  = ftx - (lift > 0.1 ? 1 : 0), hy = fty + 2.5;
                ctx.moveTo(sx + 3, sy);
                ctx.quadraticCurveTo(sx + 4, sy + 5, hkx + 1.8, hky);
                ctx.lineTo(hx + 1.5, hy); ctx.lineTo(hx - 1.5, hy);
                ctx.lineTo(ftx - 1.2, fty);
                ctx.quadraticCurveTo(hkx - 2, hky - 1, stx - 1, sty);
                ctx.quadraticCurveTo(sx - 1, sty + 1, sx - 2, sy);
            }
            ctx.closePath(); ctx.fill();

            // Hoof
            let lc = moving ? Math.max(0, -Math.cos(walkSpeed + phaseOffset)) : 0;
            let sc = moving ? Math.sin(walkSpeed + phaseOffset) : 0;
            let hX, hY;
            if (isFront) {
                let kx = (isNear ? -7 : -4) - 1 + sc * 3, ky = hBob + 4 + 6 - lc * 2;
                let fx = kx + sc * 1.5, fy = ky + 5 - lc * 3.5;
                hX = fx - (lc > 0.1 ? 1 : 0); hY = fy + 2.5;
            } else {
                let sx2 = (isNear ? 5 : 7) - 2 + sc * 1.5, sy2 = hBob + 3 + 4 - lc * 0.5;
                let hkx = sx2 + 1.5 + sc * 2.5, hky = sy2 + 4 - lc * 1.5;
                let fx  = hkx - 1.5 + sc * 1.5, fy = hky + 4 - lc * 2.5;
                hX = fx - (lc > 0.1 ? 1 : 0); hY = fy + 2.5;
            }
            ctx.fillStyle = '#212121';
            ctx.beginPath();
            ctx.moveTo(hX - 1.8, hY + 1); ctx.lineTo(hX + 1.8, hY + 1);
            ctx.lineTo(hX + 1.2, hY - 1.5); ctx.lineTo(hX - 1.2, hY - 1.5);
            ctx.closePath(); ctx.fill();
        }

        // Far legs
        drawLeg(false, false, Math.PI);
        drawLeg(true,  false, Math.PI / 2);

        // Tail
        ctx.strokeStyle = '#2d1c15'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(11, hBob - 2);
        ctx.bezierCurveTo(15 + tailSwish, hBob - 2, 18 + tailSwish, hBob + 4, 14 + tailSwish * 0.5, hBob + 12);
        ctx.stroke();

        // Body
        ctx.fillStyle = bodyColor; ctx.strokeStyle = lineColor; ctx.lineWidth = 1.2;
        let hb = new Path2D();
        hb.moveTo(12, hBob + 2);
        hb.quadraticCurveTo(12, hBob - 6, 5, hBob - 6);
        hb.quadraticCurveTo(0, hBob - 4, -6, hBob - 5);
        hb.quadraticCurveTo(-10, hBob - 10 + headNod, -13, hBob - 16 + headNod);
        hb.lineTo(-15, hBob - 17 + headNod);
        hb.lineTo(-24, hBob - 11 + headNod);
        hb.quadraticCurveTo(-26, hBob - 8 + headNod, -24, hBob - 6 + headNod);
        hb.lineTo(-18, hBob - 4 + headNod);
        hb.quadraticCurveTo(-12, hBob - 2 + headNod, -9, hBob + 5);
        hb.quadraticCurveTo(-8, hBob + 10, 0, hBob + 10);
        hb.quadraticCurveTo(10, hBob + 10, 12, hBob + 2);
        hb.closePath();
        ctx.fill(hb); ctx.stroke(hb);

        // Simple saddle (civilian — no armor, no chamfron)
        ctx.fillStyle = '#5d4037';
        ctx.beginPath(); ctx.ellipse(-1, hBob - 4, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 1; ctx.stroke();

        // Mane & eye
        ctx.strokeStyle = '#212121'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-8, hBob - 7 + headNod * 0.5);
        ctx.quadraticCurveTo(-11, hBob - 13 + headNod, -14, hBob - 16 + headNod); ctx.stroke();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(-19, hBob - 10 + headNod, 1.2, 0, Math.PI * 2); ctx.fill();

        // Ears
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.moveTo(-13, hBob - 16 + headNod); ctx.lineTo(-13, hBob - 20 + headNod);
        ctx.lineTo(-15, hBob - 17 + headNod); ctx.fill(); ctx.stroke();

        // Near legs (drawn on top)
        drawLeg(false, true, 0);
        drawLeg(true,  true, -Math.PI / 2);

        ctx.restore();
    }

    // Tiny color-darkening helper
    function _darken(hex, factor) {
        let r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b = parseInt(hex.slice(5,7), 16);
        return `rgb(${Math.round(r*factor)},${Math.round(g*factor)},${Math.round(b*factor)})`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. CIVILIAN RIDER (seated on horse; no armor, no weapons)
    //    Called AFTER drawCityHorse so it layers on top.
    //    riderY is the same y origin passed to the horse.
    // ─────────────────────────────────────────────────────────────────────────
    function drawCityRider(ctx, x, y, moving, frame, dir, clothColor, hatType) {
        clothColor = clothColor || '#6b5344';
        hatType    = hatType    || 'conical';
        dir        = (dir >= 0) ? 1 : -1;

        const CITY_HORSE_SCALE = 0.82;
        const RIDER_MOUNT_OFFSET_Y = -4;    // saddle height above horse origin
        const RIDER_BODY_Y = -9;

        ctx.save();
        ctx.translate(x, y);
        ctx.scale(dir * CITY_HORSE_SCALE, CITY_HORSE_SCALE);

        let bob = moving ? Math.sin(frame * 0.4) * 1.5 : 0;

        // Translate to saddle position
        ctx.translate(-1, RIDER_MOUNT_OFFSET_Y + bob);

        ctx.lineCap = 'round'; ctx.lineJoin = 'round';

        // Legs (straddling horse — spread wide)
        ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-3, 0); ctx.lineTo(-5, 7);   // left leg
        ctx.moveTo( 3, 0); ctx.lineTo( 5, 7);   // right leg
        ctx.stroke();

        // Tunic body
        ctx.fillStyle = clothColor; ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.lineTo(2, RIDER_BODY_Y); ctx.lineTo(-2, RIDER_BODY_Y);
        ctx.closePath(); ctx.fill(); ctx.stroke();

        // Head
        ctx.fillStyle = '#d4b886'; ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, RIDER_BODY_Y - 2.5, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

        // Hat (delegates to same switch as drawHuman so faction hats work)
        _drawRiderHat(ctx, hatType, clothColor, RIDER_BODY_Y);

        ctx.restore();
    }

    function _drawRiderHat(ctx, hatType, clothColor, by) {
        const hy = by - 2.5; // head center y
        ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 0.8;
        switch (hatType) {
            case 'turban':
                ctx.fillStyle = '#eeeeee';
                ctx.beginPath(); ctx.arc(0, hy - 2, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                break;
            case 'fur_cap':
                ctx.fillStyle = '#5c4033';
                ctx.fillRect(-6, hy - 4, 12, 5); ctx.strokeRect(-6, hy - 4, 12, 5);
                break;
            case 'bamboo_hat':
                ctx.fillStyle = '#e8c37b';
                ctx.beginPath(); ctx.ellipse(0, hy, 10, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.ellipse(0, hy - 1, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
                break;
            case 'topknot':
                ctx.fillStyle = '#111111';
                ctx.fillRect(-2, hy - 4, 4, 3);
                break;
            case 'hood':
                ctx.fillStyle = clothColor;
                ctx.beginPath(); ctx.arc(0, hy, 4.5, Math.PI, 0); ctx.fill(); ctx.stroke();
                ctx.fillRect(-4.5, hy, 9, 3);
                break;
            case 'skullcap':
                ctx.fillStyle = '#222222';
                ctx.beginPath(); ctx.arc(0, hy, 4, Math.PI, 0); ctx.fill(); ctx.stroke();
                break;
            case 'bandana':
                ctx.fillStyle = '#8b0000';
                ctx.beginPath(); ctx.arc(0, hy, 4, Math.PI, 0); ctx.fill(); ctx.stroke();
                break;
            case 'conical':
            default:
                ctx.fillStyle = '#a1887f';
                ctx.beginPath();
                ctx.moveTo(-9, hy); ctx.lineTo(0, hy - 7); ctx.lineTo(9, hy);
                ctx.quadraticCurveTo(0, hy + 1, -9, hy);
                ctx.fill(); ctx.stroke();
                break;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4.  TRADE WAGON  (left/right renders, no flags)
    //     Origin = left edge of first wheel for "dir=1", right edge for "dir=-1"
    //     Total footprint: ~54px wide × 28px tall at city scale
    // ─────────────────────────────────────────────────────────────────────────
    function drawCityWagon(ctx, x, y, frame, dir) {
        dir = (dir >= 0) ? 1 : -1;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(dir, 1);   // mirror for left-facing

        let jolt = 0; // wagon is static — no bounce

        // ── WHEELS ──
        const wheelY = 8 + jolt;
        const W_R    = 9;    // wheel radius

        function drawWheel(cx) {
            // Outer rim
            ctx.fillStyle = '#3e2723'; ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(cx, wheelY, W_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            // Iron tyre (highlight ring)
            ctx.strokeStyle = '#616161'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(cx, wheelY, W_R - 1, 0, Math.PI * 2); ctx.stroke();
            // Spokes
            ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 1.1;
            for (let s = 0; s < 6; s++) {
                let a = s * (Math.PI / 3); // fixed — spokes don't spin
                ctx.beginPath();
                ctx.moveTo(cx, wheelY);
                ctx.lineTo(cx + Math.cos(a) * (W_R - 2), wheelY + Math.sin(a) * (W_R - 2));
                ctx.stroke();
            }
            // Hub
            ctx.fillStyle = '#8d6e63';
            ctx.beginPath(); ctx.arc(cx, wheelY, 2.2, 0, Math.PI * 2); ctx.fill();
        }

        drawWheel(8);
        drawWheel(38);

        // Axle beam connecting wheels
        ctx.strokeStyle = '#4a3328'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(8, wheelY); ctx.lineTo(38, wheelY); ctx.stroke();

        // ── WAGON BED PLATFORM ──
        ctx.fillStyle = '#8d6e4e'; ctx.strokeStyle = '#4a3328'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(2, wheelY - W_R + 2);
        ctx.lineTo(44, wheelY - W_R + 2);
        ctx.lineTo(44, wheelY - W_R - 2);
        ctx.lineTo(2, wheelY - W_R - 2);
        ctx.closePath();
        ctx.fill(); ctx.stroke();

        // ── CARGO BODY (wooden box + canvas cover) ──
        const boxTop    = wheelY - W_R - 2;
        const boxBottom = wheelY - W_R + 2;
        const boxLeft   = 3, boxRight = 43;
        const boxH      = 14;

        // Wood slat sides
        ctx.fillStyle = '#7a5c40'; ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 1;
        ctx.fillRect(boxLeft, boxTop - boxH, boxRight - boxLeft, boxH);
        ctx.strokeRect(boxLeft, boxTop - boxH, boxRight - boxLeft, boxH);

        // Wood grain slats
        ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.8;
        for (let s = boxLeft + 6; s < boxRight; s += 7) {
            ctx.beginPath(); ctx.moveTo(s, boxTop - boxH); ctx.lineTo(s, boxTop); ctx.stroke();
        }

        // Metal corner reinforcements
        ctx.strokeStyle = '#616161'; ctx.lineWidth = 1.5;
        [[boxLeft, boxTop - boxH], [boxRight, boxTop - boxH],
         [boxLeft, boxTop],        [boxRight, boxTop]].forEach(([bx, by]) => {
            ctx.beginPath();
            ctx.moveTo(bx - 1.5, by); ctx.lineTo(bx - 1.5, by - 4);
            ctx.moveTo(bx - 1.5, by); ctx.lineTo(bx + 3, by);
            ctx.stroke();
        });

        // Canvas cover over cargo (arched tarp)
        ctx.fillStyle = '#c4a95a'; ctx.strokeStyle = '#9c7e38'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(boxLeft + 1, boxTop - boxH);
        ctx.quadraticCurveTo((boxLeft + boxRight) / 2, boxTop - boxH - 10, boxRight - 1, boxTop - boxH);
        ctx.lineTo(boxRight - 1, boxTop - boxH - 1);
        ctx.quadraticCurveTo((boxLeft + boxRight) / 2, boxTop - boxH - 11, boxLeft + 1, boxTop - boxH - 1);
        ctx.closePath();
        ctx.fill(); ctx.stroke();

        // Rope lashing across canvas
        ctx.strokeStyle = '#7a5c30'; ctx.lineWidth = 0.8;
        for (let r = boxLeft + 8; r < boxRight; r += 10) {
            ctx.beginPath();
            ctx.moveTo(r, boxTop - boxH + 1);
            ctx.lineTo(r - 2, boxTop - boxH - 9);
            ctx.stroke();
        }

        // Tongue/draw beam — extends FORWARD from the front of the wagon toward the horses.
        // boxRight side of the wagon (x=43) faces the direction of travel because
        // dir=1 → moving right, wagon body sits at positive-x; dir=-1 flips the whole
        // canvas so local +x still points "forward" in world space.
        ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(boxRight - 2, wheelY - 2);   // front face of wagon box
        ctx.lineTo(boxRight + 26, wheelY + 1);  // 26 px ahead → under pack horse collar
        ctx.stroke();
        // Second yoke beam (split-pole) for the two horses
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(boxRight + 20, wheelY - 1);
        ctx.lineTo(boxRight + 26, wheelY - 7);  // upper pole
        ctx.moveTo(boxRight + 20, wheelY);
        ctx.lineTo(boxRight + 26, wheelY + 6);  // lower pole
        ctx.stroke();

        ctx.restore();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. CARAVAN AI & GENERATION
    // ─────────────────────────────────────────────────────────────────────────
    window.cityCaravans = window.cityCaravans || {};
    window.cityRiders   = window.cityRiders   || {};

    // Coat colour palette for civilian horses
    const HORSE_COATS = ['#795548', '#5d4037', '#a07850', '#8d6e63', '#4e342e', '#b5926a', '#6d4c41'];

    // Road-following AI: returns {vx, vy} biased toward road tiles
    function _roadFollowVelocity(x, y, curDir, speed, grid) {
        if (!grid) return { vx: Math.cos(curDir) * speed, vy: Math.sin(curDir) * speed };

        const DIRS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
        let candidates = [];

        for (let a of DIRS) {
            // Don't allow u-turns or near-backwards movement (> 120° from current heading)
            let angDiff = Math.abs(_angleDiff(a, curDir));
            if (angDiff > Math.PI * 0.67) continue; // strictly no reversal

            // Fixed 32 px lookahead so cavalry can always see into the next tile
            // regardless of their per-frame speed (was speed*4 ≈ 0.9 px — useless).
            let testX = x + Math.cos(a) * 32;
            let testY = y + Math.sin(a) * 32;
            let tx    = Math.floor(testX / CITY_TILE_SIZE);
            let ty    = Math.floor(testY / CITY_TILE_SIZE);

            if (tx < 0 || tx >= CITY_COLS || ty < 0 || ty >= CITY_ROWS) continue;
            let tile = grid[tx][ty];

            let score = 0;
            if (tile === 1 || tile === 5) score += 10;   // road preferred
            if (tile === 0)               score +=  1;   // ground acceptable
            if (tile >= 2)                score  = -99;  // solid block forbidden

            let straight = _angleDiff(a, curDir);
            score -= Math.abs(straight) * 0.5;           // prefer going straight

            if (score >= 0) candidates.push({ a, score });
        }

        if (candidates.length === 0) {
            // Dead end — turn 90° randomly rather than reversing
            let turnedAngle = curDir + (Math.random() < 0.5 ? 1 : -1) * Math.PI * 0.5;
            return { vx: Math.cos(turnedAngle) * speed, vy: Math.sin(turnedAngle) * speed };
        }

        candidates.sort((a, b) => b.score - a.score);

        // At intersections (~1% chance) allow a legal turn for variety
        let chosen = candidates[0];
        if (candidates.length > 1 && Math.random() < 0.01) {
            chosen = candidates[1];
        }

        return { vx: Math.cos(chosen.a) * speed, vy: Math.sin(chosen.a) * speed };
    }

    function _angleDiff(a, b) {
        let d = a - b;
        while (d >  Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return d;
    }

    // Spawn count for caravans and lone riders
    function _caravanCount(isVillage, pop) {
        if (isVillage) return Math.random() < 0.4 ? 1 : 0;
        return Math.min(3, Math.max(1, Math.floor(pop / 500)));
    }

    function _riderCount(isVillage, pop) {
        if (isVillage) return Math.floor(Math.random() * 2);
        return Math.min(4, Math.max(1, Math.floor(pop / 300)));
    }

    // ── Generate caravans for a city ──────────────────────────────────────────
    function _generateCaravans(factionName, grid, isVillage, pop) {
        window.cityCaravans[factionName] = [];
        let midX = CITY_COLS / 2, midY = Math.floor(CITY_LOGICAL_ROWS / 2);
        let count = _caravanCount(isVillage, pop);

        // Gate corridors to avoid: N/S gate runs through midX (vertical road),
        // E/W gate runs through midY (horizontal road). Keep wagons well clear.
        const GATE_CLEAR_TILES = 12; // tiles either side of the gate axis to avoid

        for (let i = 0; i < count; i++) {
            // Spawn on a ROAD tile in the OUTER band of the city (near the wall ring).
            // Outer band = radius 70-90% of half-city, so wagons sit near the walls
            // but never inside wall tiles (6/8) or building tiles (2).
            for (let attempt = 0; attempt < 600; attempt++) {
                let ang = Math.random() * Math.PI * 2;
                // Outer band: 70–92% of the half-width radius
                let rad = (0.70 + Math.random() * 0.22) * (CITY_COLS / 2);
                let tx  = Math.floor(midX + Math.cos(ang) * rad);
                let ty  = Math.floor(midY + Math.sin(ang) * rad);

                if (tx < 5 || tx >= CITY_COLS - 5 || ty < 5 || ty >= CITY_LOGICAL_ROWS - 5) continue;
                // Must be a road tile — never plaza, to avoid the open plaza area
                if (grid[tx][ty] !== 1) continue;
                // Must not be inside or adjacent to a wall/building tile
                let nearSolid = false;
                for (let dx = -2; dx <= 2 && !nearSolid; dx++) {
                    for (let dy = -2; dy <= 2 && !nearSolid; dy++) {
                        let t = grid[tx+dx] && grid[tx+dx][ty+dy];
                        if (t === 6 || t === 7 || t === 8 || t === 2) nearSolid = true;
                    }
                }
                if (nearSolid) continue;
                // Avoid the N/S gate corridor (vertical road through midX)
                if (Math.abs(tx - midX) < GATE_CLEAR_TILES) continue;
                // Avoid the E/W gate corridor (horizontal road through midY)
                if (Math.abs(ty - midY) < GATE_CLEAR_TILES) continue;

                let fStyles = (typeof CIVILIAN_STYLES !== 'undefined')
                    ? (CIVILIAN_STYLES[factionName] || CIVILIAN_STYLES['Default'])
                    : { hats: ['conical'], clothes: ['#795548'] };

                let dir  = Math.random() < 0.5 ? 0 : Math.PI; // start moving right or left
                let coat = HORSE_COATS[Math.floor(Math.random() * HORSE_COATS.length)];

                window.cityCaravans[factionName].push({
                    x: tx * CITY_TILE_SIZE,
                    y: ty * CITY_TILE_SIZE,
                    angle: dir,
                    speed: 0,
                    vx: 0, vy: 0,
                    animOffset: Math.random() * 100,
                    state: 'moving',
                    waitTimer: 0,
                    coat,
                    driverHat: fStyles.hats[Math.floor(Math.random() * fStyles.hats.length)],
                    driverCloth: fStyles.clothes[Math.floor(Math.random() * fStyles.clothes.length)],
                });
                break;
            }
        }
    }

    // ── Generate lone riders ──────────────────────────────────────────────────
    function _generateRiders(factionName, grid, isVillage, pop) {
        window.cityRiders[factionName] = [];
        let midX = CITY_COLS / 2, midY = Math.floor(CITY_LOGICAL_ROWS / 2);
        let count = _riderCount(isVillage, pop);

        for (let i = 0; i < count; i++) {
            for (let attempt = 0; attempt < 400; attempt++) {
                let ang = Math.random() * Math.PI * 2;
                let rad = (0.05 + Math.random() * 0.5) * (CITY_COLS / 2);
                let tx  = Math.floor(midX + Math.cos(ang) * rad);
                let ty  = Math.floor(midY + Math.sin(ang) * rad);

                if (tx < 2 || tx >= CITY_COLS - 2 || ty < 2 || ty >= CITY_ROWS - 2) continue;
                // ONLY spawn on road tiles (1). Never on plaza (5) — the open plaza
                // has road scores in every direction which causes the rider to spin
                // randomly each frame as it cannot pick a dominant heading.
                if (grid[tx][ty] !== 1) continue;

                // Always start heading north or south along the road.
                let startAngle = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;

                let fStyles = (typeof CIVILIAN_STYLES !== 'undefined')
                    ? (CIVILIAN_STYLES[factionName] || CIVILIAN_STYLES['Default'])
                    : { hats: ['conical'], clothes: ['#666'] };
                let coat       = HORSE_COATS[Math.floor(Math.random() * HORSE_COATS.length)];

                window.cityRiders[factionName].push({
                    x: tx * CITY_TILE_SIZE,
                    y: ty * CITY_TILE_SIZE,
                    angle: startAngle,
                    speed: 0.7,
                    vx: 0, vy: 0,
                    animOffset: Math.random() * 100,
                    state: 'moving',
                    waitTimer: 0,
                    pauseChance: 0.003,
                    coat,
                    hat: fStyles.hats[Math.floor(Math.random() * fStyles.hats.length)],
                    cloth: fStyles.clothes[Math.floor(Math.random() * fStyles.clothes.length)],
                });
                break;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6.  UPDATE + DRAW  —  caravans
    // ─────────────────────────────────────────────────────────────────────────
    function _drawCaravans(ctx, factionName) {
        let caravans = window.cityCaravans[factionName];
        if (!caravans || caravans.length === 0) return;

        let grid = (typeof cityDimensions !== 'undefined' && cityDimensions[factionName])
            ? cityDimensions[factionName].grid : null;

        // ── Viewport culling bounds ─────────────────────────────────────────────
        // Caravans are ~130px wide; use a generous 160px cull margin so nothing
        // pops in abruptly at the screen edge.
        let _zoom   = (typeof zoom !== 'undefined') ? zoom : 1;
        let _cvW    = (typeof canvas !== 'undefined') ? canvas.width  / _zoom : 640;
        let _cvH    = (typeof canvas !== 'undefined') ? canvas.height / _zoom : 360;
        let _cullM  = 160;
        let _camL   = player.x - _cvW / 2 - _cullM;
        let _camR   = player.x + _cvW / 2 + _cullM;
        let _camT   = player.y - _cvH / 2 - _cullM;
        let _camB   = player.y + _cvH / 2 + _cullM;

        for (let cv of caravans) {
            let frame = (Date.now() / 60) + cv.animOffset;

            // ── Road-following velocity ───────────────────────────────────────
            let rv = _roadFollowVelocity(cv.x, cv.y, cv.angle, cv.speed, grid);
            cv.vx = rv.vx;
            cv.vy = rv.vy;

            // Update angle from velocity
            if (Math.abs(cv.vx) > 0.01 || Math.abs(cv.vy) > 0.01) {
                cv.angle = Math.atan2(cv.vy, cv.vx);
            }

            // ── Collision: ONLY buildings/walls/gates block cavalry ───────────
            let nx = cv.x + cv.vx, ny = cv.y + cv.vy;
            // Check nose + a point ahead of it (for long vehicle)
            let checkPoints = [
                [nx + Math.cos(cv.angle) * 30, ny + Math.sin(cv.angle) * 30],
                [nx, ny],
            ];

            let hardBlock = false;
            for (let [px, py] of checkPoints) {
                if (typeof isCavCollision === 'function' && isCavCollision(px, py, factionName)) {
                    hardBlock = true; break;
                }
            }

            if (hardBlock) {
                // Turn away — never stop, never reverse
                cv.angle += (Math.random() < 0.5 ? 1 : -1) * Math.PI * 0.5;
                cv.vx = Math.cos(cv.angle) * cv.speed;
                cv.vy = Math.sin(cv.angle) * cv.speed;
                cv.x += cv.vx; cv.y += cv.vy;
            } else {
                cv.x = nx; cv.y = ny;
            }

            // Update layout dir from horizontal component only (vertical never flips)
            if (Math.abs(cv.vx) > 0.05) {
                cv._dir = cv.vx > 0 ? 1 : -1;
            }
            if (cv._dir === undefined) cv._dir = 1;

            // ── Viewport cull: skip draw but keep simulating ──────────────────
            // The whole caravan spans ~130 px; pivot cv.x is the wagon rear corner.
            let extentRight = cv.x + (cv._dir > 0 ? 130 : 0);
            let extentLeft  = cv.x - (cv._dir < 0 ? 130 : 0);
            let inView = extentRight > _camL && extentLeft < _camR &&
                         cv.y > _camT && cv.y < _camB;
            if (!inView) continue;

            _drawCaravanSprite(ctx, cv, frame);
        }
    }

    function _drawCaravanSprite(ctx, cv, frame) {
        // _dir=1 means caravan travels RIGHT (wagon is left, horses pull right).
        // _dir=-1 means caravan travels LEFT.
        // CRITICAL: drawCityHorse/drawCityRider have head at NEGATIVE local-X,
        // so dir=1 → head faces LEFT (backwards!).  We must invert the dir we
        // pass to sprite functions so the horse head always faces the direction
        // of travel.  Layout offsets (_dir arithmetic) remain UNchanged.
        let dir      = cv._dir !== undefined ? cv._dir : 1;
        let spriteDir = -dir; // inverted: head now faces direction of travel ✓

        // Layout (in world coords):
        //   [wagon origin]──tongue──[horse]──>  (dir=1)
        // Single horse positioned just past the tongue end (~76 px ahead).

        let wx  = cv.x;                    // wagon pivot (wagon left-back corner)
        let wy  = cv.y;
        let h1x = cv.x + dir * 76;         // single horse — just past tongue end
        let h1y = cv.y;

        // Draw wagon first so horse visually overlaps it
        drawCityWagon(ctx, wx, wy, frame, dir);

        // Single draft horse (legs never move — wagon is static)
        drawCityHorse(ctx, h1x, h1y, false, frame, spriteDir, cv.coat);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7.  UPDATE + DRAW  —  lone civilian riders
    // ─────────────────────────────────────────────────────────────────────────
    function _drawRiders(ctx, factionName) {
        let riders = window.cityRiders[factionName];
        if (!riders || riders.length === 0) return;

        let grid = (typeof cityDimensions !== 'undefined' && cityDimensions[factionName])
            ? cityDimensions[factionName].grid : null;

        // ── Viewport culling bounds (same logic as _drawCaravans) ─────────────
        let _zoom  = (typeof zoom !== 'undefined') ? zoom : 1;
        let _cvW   = (typeof canvas !== 'undefined') ? canvas.width  / _zoom : 640;
        let _cvH   = (typeof canvas !== 'undefined') ? canvas.height / _zoom : 360;
        let _cullM = 80;
        let _camL  = player.x - _cvW / 2 - _cullM;
        let _camR  = player.x + _cvW / 2 + _cullM;
        let _camT  = player.y - _cvH / 2 - _cullM;
        let _camB  = player.y + _cvH / 2 + _cullM;

        for (let rd of riders) {
            let frame = (Date.now() / 60) + rd.animOffset;

            // Occasional pause (rider looking at stall, etc.)
            if (rd.waitTimer > 0) {
                rd.waitTimer--;
                if (rd._dir === undefined) rd._dir = 1;
                // Horse head must face direction of travel — invert layout dir
                let spriteDir = -rd._dir;
                if (rd.x > _camL && rd.x < _camR && rd.y > _camT && rd.y < _camB) {
                    drawCityHorse(ctx, rd.x, rd.y, false, frame, spriteDir, rd.coat);
                    drawCityRider(ctx, rd.x, rd.y, false, frame, spriteDir, rd.cloth, rd.hat);
                }
                continue;
            }

            if (Math.random() < rd.pauseChance) {
                rd.waitTimer = 60 + Math.floor(Math.random() * 120);
                continue;
            }

            // Straight-line movement — angle is fixed until a hard block forces a U-turn.
            // No tile-based steering, no random direction changes.
            rd.vx = Math.cos(rd.angle) * rd.speed;
            rd.vy = Math.sin(rd.angle) * rd.speed;

            let nx = rd.x + rd.vx, ny = rd.y + rd.vy;

            // Hard block: buildings, walls, out-of-bounds abyss, and wagon hitboxes.
            let hardBlock = typeof isCavCollision === 'function'
                && isCavCollision(nx, ny, factionName);

            if (hardBlock) {
                // U-turn: flip exactly 180° and ride back. No randomness.
                rd.angle = rd.angle + Math.PI;
                // Normalise to [-π, π]
                while (rd.angle >  Math.PI) rd.angle -= Math.PI * 2;
                while (rd.angle < -Math.PI) rd.angle += Math.PI * 2;
                rd.vx = Math.cos(rd.angle) * rd.speed;
                rd.vy = Math.sin(rd.angle) * rd.speed;
                rd.x += rd.vx;
                rd.y += rd.vy;
            } else {
                rd.x = nx;
                rd.y = ny;
            }

            // Sprite dir: only update from the vertical component (N-S travel).
            // Keep last horizontal dir so the horse doesn't flip during vertical travel.
            if (rd._dir === undefined) rd._dir = 1;

            // ── Viewport cull ─────────────────────────────────────────────────
            if (rd.x < _camL || rd.x > _camR || rd.y < _camT || rd.y > _camB) continue;

            // Horse head faces direction of travel (invert layout dir)
            let spriteDir = -rd._dir;
            drawCityHorse(ctx, rd.x, rd.y, true, frame, spriteDir, rd.coat);
            drawCityRider(ctx, rd.x, rd.y, true, frame, spriteDir, rd.cloth, rd.hat);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 8.  HOOK INTO generateCityCosmeticNPCs to also spawn caravans/riders
    // ─────────────────────────────────────────────────────────────────────────
    //  (We already wrapped generateCityCosmeticNPCs above — extend it here.)
    let _prev2 = window.generateCityCosmeticNPCs;
    window.generateCityCosmeticNPCs = function(factionName, grid, isVillage, pop) {
        isVillage = isVillage || false;
        pop       = pop       || 1000;
        if (typeof _prev2 === 'function') _prev2(factionName, grid, isVillage, pop);
        _generateCaravans(factionName, grid, isVillage, pop);
        _generateRiders(factionName, grid, isVillage, pop);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // 9.  FLUSH stale caravans/riders when entering a city (same flush pattern
    //     as city_life_extensions uses for animals)
    // ─────────────────────────────────────────────────────────────────────────
    let _origEnter2 = window.enterCity;
    if (typeof _origEnter2 === 'function') {
        window.enterCity = function(factionName, playerObj) {
            if (window.cityCaravans) delete window.cityCaravans[factionName];
            if (window.cityRiders)   delete window.cityRiders[factionName];
            return _origEnter2.apply(this, arguments);
        };
    }

    console.log('[CityCaravanPatch] ✓ dog/cat scale · boosted animal spawns · caravans · riders loaded.');
})();

// ============================================================================
// CITY TRAFFIC SYSTEM  —  Replaces the legacy CityCavalryPatch.
// ============================================================================
// WHAT THIS DOES (drop-in after the CityCaravanPatch IIFE above):
//
//   1. STATIC WAGONS / CARAVANS — never move, wheels frozen. Spawn-clearance
//      uses the full wagon+horse footprint so nothing lands inside a building.
//
//   2. FREE-ROAMING RIDERS — each rider has a destination (random road tile
//      anywhere in the city). They pick the best of 8 compass headings based
//      on (a) road-bias, (b) goal-attraction, (c) heading continuity, and
//      (d) traffic ahead. They yield to other riders and to wagons instead
//      of pushing through, re-pick a fresh target on arrival, and recover
//      from being stuck. Collision uses isCavCollision so buildings, walls,
//      towers, and wagons all block.
//
//   3. GATE COMMUTER VILLAGERS — pedestrian NPCs that spawn in the north
//      and south "black voids" off-map, walk into the city through the gate
//      at midX, wander to a random interior road tile, then turn around and
//      walk back out through a gate to despawn. Yield to walkers and to
//      riders. Replenished on a 160-frame timer up to a cap.
//
// MOBILE-SAFETY:
//   • Hard caps on simulated counts (MAX_RIDERS_DRAWN=6, MAX_GATE_COMMUTERS=14).
//   • Per-NPC replan timer (every 30–70 frames), not every-frame scans.
//   • Off-screen NPCs are simulated but not drawn.
//   • No per-frame map scanning beyond the 8-direction probes.
// ============================================================================

(function cityTrafficSystem() {
    'use strict';

    // ── CONSTANTS ─────────────────────────────────────────────────────────────
    const TILE   = typeof CITY_TILE_SIZE      !== 'undefined' ? CITY_TILE_SIZE      : 8;
    const COLS   = typeof CITY_COLS           !== 'undefined' ? CITY_COLS           : 400;
    const ROWS   = typeof CITY_ROWS           !== 'undefined' ? CITY_ROWS           : 500;
    const LROWS  = typeof CITY_LOGICAL_ROWS   !== 'undefined' ? CITY_LOGICAL_ROWS   : 400;
    const LHEIGHT= typeof CITY_LOGICAL_HEIGHT !== 'undefined' ? CITY_LOGICAL_HEIGHT : LROWS * TILE;

    // Speeds (px/frame at 60fps)
    const RIDER_SPEED         = 0.85;
    const COMMUTER_RIDER_SPD  = 0.6;
    const WALKER_SPEED_MIN    = 0.22;
    const WALKER_SPEED_MAX    = 0.34;

    // Mobile caps
    const MAX_RIDERS_DRAWN          = 6;
    const MAX_GATE_COMMUTERS        = 14;
    const GATE_COMMUTER_SPAWN_EVERY = 160; // frames between spawn checks

    // Rider AI tuning
    const RIDER_REPLAN_FRAMES_MIN   = 30;
    const RIDER_REPLAN_FRAMES_MAX   = 70;
    const RIDER_ARRIVE_RADIUS_PX    = TILE * 2.5;
    const RIDER_TRAFFIC_LOOKAHEAD   = 26;
    const RIDER_TRAFFIC_RADIUS      = 18;
    const RIDER_STUCK_THRESHOLD     = 35;
    const PLAZA_PAUSE_FRAMES        = 80;

    // Walker AI tuning
    const WALKER_TRAFFIC_LOOKAHEAD  = 14;
    const WALKER_TRAFFIC_RADIUS     = 9;

    // Void margins (how far past the city edge gate-commuters spawn/despawn)
    const VOID_MARGIN_PX = 120;

    // ── GLOBAL POOLS ──────────────────────────────────────────────────────────
    window.cityCaravans      = window.cityCaravans      || {};
    window.cityRiders        = window.cityRiders        || {};
    window.cityGateCommuters = window.cityGateCommuters || {};
    window._gateCommuterFrame = window._gateCommuterFrame || {};

    // ── HELPERS ───────────────────────────────────────────────────────────────

    function _getGrid(factionName) {
        const dim = (typeof cityDimensions !== 'undefined') && cityDimensions[factionName];
        return dim ? dim.grid : null;
    }

    function _tileAt(grid, col, row) {
        if (!grid || col < 0 || col >= COLS || row < 0 || row >= ROWS) return -1;
        return (grid[col] && grid[col][row] !== undefined) ? grid[col][row] : -1;
    }

    function _isRoadTile(t)         { return t === 1 || t === 5; }
    function _isPassableRiderTile(t){ return t === 0 || t === 1 || t === 5; }
    function _clamp(v, lo, hi)      { return Math.max(lo, Math.min(hi, v)); }

    /**
     * Return the pixel X of the main N-S road spine. Cached on cityDimensions.
     */
    function _getNSRoadX(factionName) {
        const dim = (typeof cityDimensions !== 'undefined') && cityDimensions[factionName];
        if (!dim) return Math.floor(COLS / 2) * TILE;
        if (dim._nsRoadX !== undefined) return dim._nsRoadX;

        const midCol = Math.floor(COLS / 2);
        const grid   = dim.grid;
        let best     = midCol;

        for (let c = midCol - 20; c <= midCol + 20; c++) {
            if (c < 0 || c >= COLS) continue;
            let roadCount = 0;
            for (let r = 10; r < Math.min(LROWS - 10, 60); r++) {
                if (grid[c] && _isRoadTile(grid[c][r])) roadCount++;
            }
            if (roadCount > 30) { best = c; break; }
        }

        dim._nsRoadX = best * TILE;
        return dim._nsRoadX;
    }

    /**
     * Find a random road tile (col,row). When innerOnly is true, restrict to
     * the middle 50% of city rows so commuters don't aim at the gate itself.
     */
    function _pickRandomRoadTarget(factionName, maxAttempts, innerOnly) {
        maxAttempts = maxAttempts || 40;
        const grid = _getGrid(factionName);
        if (!grid) return null;

        const rowLo = innerOnly ? Math.floor(LROWS * 0.25) : 4;
        const rowHi = innerOnly ? Math.floor(LROWS * 0.75) : LROWS - 8;
        const rowRange = Math.max(1, rowHi - rowLo);

        for (let i = 0; i < maxAttempts; i++) {
            const col = 4 + Math.floor(Math.random() * (COLS - 8));
            const row = rowLo + Math.floor(Math.random() * rowRange);
            const t = _tileAt(grid, col, row);
            if (_isRoadTile(t)) {
                return { col, row, px: col * TILE + TILE / 2, py: row * TILE + TILE / 2 };
            }
        }
        // Fallback: center plaza
        return {
            col: Math.floor(COLS / 2),
            row: Math.floor(LROWS / 2),
            px:  Math.floor(COLS / 2) * TILE,
            py:  Math.floor(LROWS / 2) * TILE,
        };
    }

    /**
     * True if (px,py) overlaps any solid tile per isCavCollision using a
     * rectangular footprint of (w × h) pixels centred on (px,py).
     */
    function _spawnBlocked(px, py, factionName, w, h) {
        if (typeof isCavCollision !== 'function') return false;
        const hw = w / 2, hh = h / 2;
        const pts = [
            [px - hw, py - hh], [px + hw, py - hh],
            [px - hw, py + hh], [px + hw, py + hh],
            [px,      py],
        ];
        for (const p of pts) {
            if (isCavCollision(p[0], p[1], factionName)) return true;
        }
        return false;
    }

    /**
     * True if another rider or static wagon is within (radius) of (lookX,lookY).
     */
    function _riderTrafficAhead(self, factionName, lookX, lookY, radius) {
        const list = window.cityRiders[factionName];
        if (list) {
            const r2 = radius * radius;
            for (const other of list) {
                if (other === self) continue;
                const dx = other.x - lookX, dy = other.y - lookY;
                if (dx * dx + dy * dy < r2) return true;
            }
        }
        const wagons = window.cityCaravans[factionName];
        if (wagons) {
            for (const cv of wagons) {
                const d = cv._dir !== undefined ? cv._dir : 1;
                const left  = cv.x + (d > 0 ? 0   : -120);
                const right = cv.x + (d > 0 ? 120 :    0);
                const top   = cv.y - 22, bot = cv.y + 18;
                if (lookX >= left - radius && lookX <= right + radius &&
                    lookY >= top  - radius && lookY <= bot   + radius) return true;
            }
        }
        return false;
    }

    /**
     * True if another walker is within (radius) of (lookX,lookY).
     */
    function _walkerTrafficAhead(self, lookX, lookY, radius) {
        const list = window.cityGateCommuters[self._faction];
        if (!list) return false;
        const r2 = radius * radius;
        for (const other of list) {
            if (other === self) continue;
            const dx = other.x - lookX, dy = other.y - lookY;
            if (dx * dx + dy * dy < r2) return true;
        }
        return false;
    }

    // ── STATIC WAGON GENERATION ──────────────────────────────────────────────

    function _generateStaticCaravans(factionName, grid, isVillage, pop) {
        window.cityCaravans[factionName] = [];

        // Villages get 0 wagons; cities get 1-2 static wagons
        const count = isVillage ? 0 : Math.min(2, Math.max(1, Math.floor(pop / 600)));
        const HORSE_COATS = ['#795548','#5d4037','#a07850','#8d6e63','#4e342e','#b5926a','#6d4c41'];
        const midX = Math.floor(COLS / 2);
        const midY = Math.floor(LROWS / 2);

        for (let i = 0; i < count; i++) {
            for (let attempt = 0; attempt < 300; attempt++) {
                const ang = Math.random() * Math.PI * 2;
                const rad = (0.05 + Math.random() * 0.3) * (COLS / 2);
                const tx  = Math.floor(midX + Math.cos(ang) * rad);
                const ty  = Math.floor(midY + Math.sin(ang) * rad);

                if (tx < 5 || tx >= COLS - 5 || ty < 5 || ty >= ROWS - 5) continue;
                if (!grid[tx] || (grid[tx][ty] !== 1 && grid[tx][ty] !== 5)) continue;

                const px = tx * TILE, py = ty * TILE;
                // Full wagon+2-horse footprint: ~160 × 40 px
                if (_spawnBlocked(px + 70, py, factionName, 160, 40)) continue;

                const fStyles = (typeof CIVILIAN_STYLES !== 'undefined')
                    ? (CIVILIAN_STYLES[factionName] || CIVILIAN_STYLES['Default'])
                    : { hats: ['conical'], clothes: ['#795548'] };

                window.cityCaravans[factionName].push({
                    x: px, y: py,
                    angle: 0,
                    speed: 0,                              // STATIC
                    vx: 0, vy: 0,
                    _dir: 1,
                    animOffset: Math.random() * 100,
                    coat:        HORSE_COATS[Math.floor(Math.random() * HORSE_COATS.length)],
                    driverHat:   fStyles.hats   [Math.floor(Math.random() * fStyles.hats.length)],
                    driverCloth: fStyles.clothes[Math.floor(Math.random() * fStyles.clothes.length)],
                    _static: true,
                });
                break;
            }
        }
    }

    // ── RIDER GENERATION ─────────────────────────────────────────────────────

    function _generateRiders(factionName, grid, isVillage, pop) {
        window.cityRiders[factionName] = [];

        const HORSE_COATS = ['#795548','#5d4037','#a07850','#8d6e63','#4e342e','#b5926a','#6d4c41'];
        const nsX  = _getNSRoadX(factionName);
        const nsCol = Math.round(nsX / TILE);
        const count = isVillage
            ? Math.floor(Math.random() * 2)
            : Math.min(4, Math.max(1, Math.floor(pop / 250)));

        for (let i = 0; i < count; i++) {
            // Stagger start positions evenly along the N-S road
            const startFrac = (i + 0.3 + Math.random() * 0.4) / count;
            const startRow  = Math.floor(3 + startFrac * (LROWS - 6));

            // Find an actual road tile near the desired column
            let spawnCol = nsCol;
            for (let dc = 0; dc <= 8; dc++) {
                const c = nsCol + (dc % 2 === 0 ? dc / 2 : -(dc + 1) / 2);
                if (c < 0 || c >= COLS) continue;
                if (grid[c] && _isRoadTile(grid[c][startRow])) {
                    spawnCol = c; break;
                }
            }

            const px = spawnCol * TILE, py = startRow * TILE;

            if (_spawnBlocked(px, py, factionName, 56, 56)) continue;

            // Extra grid scan: reject if any wall/building tile within 5 tiles
            let blocked = false;
            for (let dx = -5; dx <= 5 && !blocked; dx++) {
                for (let dy = -5; dy <= 5 && !blocked; dy++) {
                    const c = spawnCol + dx, r = startRow + dy;
                    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
                    const t = grid[c] && grid[c][r];
                    if (t === 2 || t === 6 || t === 7 || t === 8 || t === 10) blocked = true;
                }
            }
            if (blocked) continue;

            const fStyles = (typeof CIVILIAN_STYLES !== 'undefined')
                ? (CIVILIAN_STYLES[factionName] || CIVILIAN_STYLES['Default'])
                : { hats: ['conical'], clothes: ['#666'] };

            window.cityRiders[factionName].push({
                x: px, y: py,
                vx: 0, vy: 0,
                angle: 0,
                speed: RIDER_SPEED,
                _dir: 1,
                animOffset: Math.random() * 100,
                waitTimer: 0,
                pauseChance: 0.0006,
                coat:  HORSE_COATS[Math.floor(Math.random() * HORSE_COATS.length)],
                hat:   fStyles.hats   [Math.floor(Math.random() * fStyles.hats.length)],
                cloth: fStyles.clothes[Math.floor(Math.random() * fStyles.clothes.length)],
                _isCommuter: false,
            });
        }

        // A few civilian commuters on horseback — slightly slower, same AI
        const commuterCount = isVillage ? 0 : Math.min(3, Math.max(0, Math.floor(pop / 400)));
        for (let i = 0; i < commuterCount; i++) {
            const startRow = Math.floor(3 + Math.random() * (LROWS - 6));
            const px = nsX, py = startRow * TILE;

            if (_spawnBlocked(px, py, factionName, 56, 56)) continue;

            let blocked2 = false;
            const nsSpawnCol2 = Math.round(nsX / TILE);
            for (let dx = -5; dx <= 5 && !blocked2; dx++) {
                for (let dy = -5; dy <= 5 && !blocked2; dy++) {
                    const c = nsSpawnCol2 + dx, r = startRow + dy;
                    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
                    const t = grid[c] && grid[c][r];
                    if (t === 2 || t === 6 || t === 7 || t === 8 || t === 10) blocked2 = true;
                }
            }
            if (blocked2) continue;

            const fStyles = (typeof CIVILIAN_STYLES !== 'undefined')
                ? (CIVILIAN_STYLES[factionName] || CIVILIAN_STYLES['Default'])
                : { hats: ['conical'], clothes: ['#666'] };

            window.cityRiders[factionName].push({
                x: px, y: py,
                vx: 0, vy: 0,
                angle: 0,
                speed: COMMUTER_RIDER_SPD,
                _dir: 1,
                animOffset: Math.random() * 100,
                waitTimer: 0,
                pauseChance: 0.002,
                coat:  ['#795548','#5d4037','#a07850'][Math.floor(Math.random() * 3)],
                hat:   fStyles.hats   [Math.floor(Math.random() * fStyles.hats.length)],
                cloth: fStyles.clothes[Math.floor(Math.random() * fStyles.clothes.length)],
                _isCommuter: true,
            });
        }
    }

    // ── RIDER AI TICK ────────────────────────────────────────────────────────
    /**
     * Drives toward rd._tgt (a road tile), replanning the 8-direction probe
     * on a timer or when hard-blocked. Yields to traffic. Recovers from stuck.
     */
    function _riderAITick(rd, factionName) {
        const grid = _getGrid(factionName);

        // Lazy-init AI fields
        if (rd._tgt        === undefined) rd._tgt = _pickRandomRoadTarget(factionName);
        if (rd._planTimer  === undefined) rd._planTimer = 0;
        if (rd._yieldTimer === undefined) rd._yieldTimer = 0;
        if (rd._stuck      === undefined) rd._stuck = 0;
        if (rd._heading    === undefined) rd._heading = Math.random() * Math.PI * 2;
        if (rd._lastX === undefined) { rd._lastX = rd.x; rd._lastY = rd.y; rd._stuckCheck = 0; }
        if (rd._atPlaza    === undefined) rd._atPlaza = false;
        if (rd._plazaTimer === undefined) rd._plazaTimer = 0;

        // Plaza pause — rare rest on plaza tiles
        if (grid) {
            const col = Math.floor(rd.x / TILE), row = Math.floor(rd.y / TILE);
            if (grid[col] && grid[col][row] === 5 &&
                !rd._atPlaza && rd.waitTimer === 0 && Math.random() < 0.004) {
                rd._atPlaza    = true;
                rd._plazaTimer = PLAZA_PAUSE_FRAMES + Math.floor(Math.random() * 60);
            }
        }
        if (rd._atPlaza) {
            if (--rd._plazaTimer <= 0) rd._atPlaza = false;
            rd.vx = 0; rd.vy = 0; return;
        }

        // Generic wait/yield timers
        if (rd._yieldTimer > 0) { rd._yieldTimer--; rd.vx = 0; rd.vy = 0; return; }
        if (rd.waitTimer  > 0)  { rd.waitTimer--;  rd.vx = 0; rd.vy = 0; return; }

        // Arrived at target? Pick a new one.
        const tgt = rd._tgt;
        if (tgt) {
            const dx0 = tgt.px - rd.x, dy0 = tgt.py - rd.y;
            if (dx0 * dx0 + dy0 * dy0 < RIDER_ARRIVE_RADIUS_PX * RIDER_ARRIVE_RADIUS_PX) {
                rd._tgt = _pickRandomRoadTarget(factionName);
                rd._planTimer = 0;
                if (Math.random() < 0.35) {
                    rd.waitTimer = 20 + Math.floor(Math.random() * 50);
                    rd.vx = 0; rd.vy = 0; return;
                }
            }
        } else {
            rd._tgt = _pickRandomRoadTarget(factionName);
        }

        // Decide whether the current heading is still good.
        rd._planTimer--;
        const probeAhead = TILE * 2.2;
        const probeX = rd.x + Math.cos(rd._heading) * probeAhead;
        const probeY = rd.y + Math.sin(rd._heading) * probeAhead;
        const headBlocked = (typeof isCavCollision === 'function')
            && isCavCollision(probeX, probeY, factionName);

        // Random pause (very rare)
        if (rd._planTimer > 0 && !headBlocked && Math.random() < rd.pauseChance) {
            rd.waitTimer = 40 + Math.floor(Math.random() * 80);
            return;
        }

        if (rd._planTimer <= 0 || headBlocked) {
            // 8 compass directions; score each by road-bias + goal-attraction
            // + continuity bonus - U-turn penalty - traffic penalty + jitter.
            const goal = rd._tgt;
            const ANGLES = [
                0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4,
                Math.PI, -3 * Math.PI / 4, -Math.PI / 2, -Math.PI / 4,
            ];
            const LOOKAHEAD = TILE * 3;
            const DIAG = COLS * TILE * 0.7;

            let best = rd._heading;
            let bestScore = -Infinity;

            for (const a of ANGLES) {
                const lx = rd.x + Math.cos(a) * LOOKAHEAD;
                const ly = rd.y + Math.sin(a) * LOOKAHEAD;
                const tc = Math.floor(lx / TILE), tr = Math.floor(ly / TILE);
                if (tc < 1 || tc >= COLS - 1 || tr < 1 || tr >= ROWS - 1) continue;
                const t = _tileAt(grid, tc, tr);
                if (!_isPassableRiderTile(t)) continue;

                // Halfway-check: if a wall/building sits between, skip
                const hx = rd.x + Math.cos(a) * (LOOKAHEAD * 0.5);
                const hy = rd.y + Math.sin(a) * (LOOKAHEAD * 0.5);
                if (typeof isCavCollision === 'function' && isCavCollision(hx, hy, factionName)) continue;

                let score = 0;

                // Road bias: strongly prefer staying on roads
                score += _isRoadTile(t) ? 3.0 : 0.4;

                // Goal attraction (large weight so distant targets dominate)
                if (goal) {
                    const gdx = goal.px - lx, gdy = goal.py - ly;
                    const dist = Math.sqrt(gdx * gdx + gdy * gdy);
                    score += 6.0 * (1.0 - Math.min(1, dist / DIAG));
                }

                // Heading continuity vs U-turn shaping
                const diff = Math.abs(
                    ((a - rd._heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI
                );
                if (!headBlocked && diff < Math.PI * 0.3) score += 1.6;  // similar direction
                if (!headBlocked && diff > Math.PI * 0.85) score -= 4.0; // ~180° reversal

                // Traffic penalty (soft)
                if (_riderTrafficAhead(rd, factionName, lx, ly, RIDER_TRAFFIC_RADIUS * 1.4)) {
                    score -= 2.5;
                }

                // Mild jitter so riders don't lock-step
                score += Math.random() * 0.2;

                if (score > bestScore) { bestScore = score; best = a; }
            }

            rd._heading   = best;
            rd._planTimer = RIDER_REPLAN_FRAMES_MIN +
                            Math.floor(Math.random() * (RIDER_REPLAN_FRAMES_MAX - RIDER_REPLAN_FRAMES_MIN));
        }

        // Yield to traffic before stepping
        const aheadX = rd.x + Math.cos(rd._heading) * RIDER_TRAFFIC_LOOKAHEAD;
        const aheadY = rd.y + Math.sin(rd._heading) * RIDER_TRAFFIC_LOOKAHEAD;
        if (_riderTrafficAhead(rd, factionName, aheadX, aheadY, RIDER_TRAFFIC_RADIUS)) {
            rd._yieldTimer = 8 + Math.floor(Math.random() * 18);
            rd.vx = 0; rd.vy = 0;
            return;
        }

        // Step forward
        const nx = rd.x + Math.cos(rd._heading) * rd.speed;
        const ny = rd.y + Math.sin(rd._heading) * rd.speed;
        const blocked = (typeof isCavCollision === 'function')
            && isCavCollision(nx, ny, factionName);

        if (blocked) {
            rd._stuck = (rd._stuck || 0) + 1;
            if (rd._stuck > RIDER_STUCK_THRESHOLD) {
                rd._tgt       = _pickRandomRoadTarget(factionName);
                rd._heading  += Math.PI + (Math.random() - 0.5) * 0.4;
                rd._planTimer = 0;
                rd._stuck     = 0;
            }
            rd.vx = 0; rd.vy = 0;
        } else {
            rd._stuck = 0;
            rd.x  = _clamp(nx, TILE * 2, (COLS - 2) * TILE);
            rd.y  = _clamp(ny, TILE * 2, (LROWS - 2) * TILE);
            rd.vx = Math.cos(rd._heading) * rd.speed;
            rd.vy = Math.sin(rd._heading) * rd.speed;
        }

        // Catch silent stalls (clamped against bounds, etc.)
        rd._stuckCheck = (rd._stuckCheck || 0) + 1;
        if (rd._stuckCheck > 90) {
            const moved = Math.hypot(rd.x - rd._lastX, rd.y - rd._lastY);
            if (moved < 4) {
                rd._tgt       = _pickRandomRoadTarget(factionName);
                rd._heading   = Math.random() * Math.PI * 2;
                rd._planTimer = 0;
            }
            rd._lastX = rd.x; rd._lastY = rd.y;
            rd._stuckCheck = 0;
        }

        // Sprite facing — head faces direction of motion
        if (Math.abs(rd.vx) > 0.12) rd._dir = rd.vx > 0 ? 1 : -1;
        else if (rd._dir === undefined) rd._dir = 1;
        rd.angle = rd._heading;
    }

    // ── DRAW STATIC CARAVANS ─────────────────────────────────────────────────

    function _drawStaticCaravans(ctx, factionName) {
        const caravans = window.cityCaravans[factionName];
        if (!caravans || caravans.length === 0) return;

        const _zoom = (typeof zoom !== 'undefined') ? zoom : 1;
        const _cvW  = (typeof canvas !== 'undefined') ? canvas.width  / _zoom : 640;
        const _cvH  = (typeof canvas !== 'undefined') ? canvas.height / _zoom : 360;
        const camL  = player.x - _cvW / 2 - 160;
        const camR  = player.x + _cvW / 2 + 160;
        const camT  = player.y - _cvH / 2 - 160;
        const camB  = player.y + _cvH / 2 + 160;

        for (const cv of caravans) {
            cv.vx = 0; cv.vy = 0; cv.speed = 0;

            const extentR = cv.x + (cv._dir > 0 ? 130 : 0);
            const extentL = cv.x - (cv._dir < 0 ? 130 : 0);
            if (extentR < camL || extentL > camR || cv.y < camT || cv.y > camB) continue;

            const dir = cv._dir !== undefined ? cv._dir : 1;
            const spriteDir = -dir;

            // frame=0 → wheel spokes locked
            window._renderingStaticWagon = true;
            if (typeof drawCityWagon === 'function') drawCityWagon(ctx, cv.x, cv.y, 0, dir);
            window._renderingStaticWagon = false;

            const h2x = cv.x + dir * 76,  h2y = cv.y;
            const h1x = cv.x + dir * 104, h1y = cv.y;
            if (typeof drawCityHorse === 'function') {
                drawCityHorse(ctx, h2x, h2y, false, 0, spriteDir, cv.coat);
                drawCityHorse(ctx, h1x, h1y, false, 0, spriteDir, cv.coat);
            }
        }
    }

    // Freeze the wheels of static wagons by intercepting drawCityWagon
    if (typeof drawCityWagon === 'function' && !window._wagonFreezeInstalled) {
        const _origDrawWagon = window.drawCityWagon;
        window.drawCityWagon = function(ctx, x, y, frame, dir) {
            _origDrawWagon(ctx, x, y, window._renderingStaticWagon ? 0 : frame, dir);
        };
        window._wagonFreezeInstalled = true;
    }

    // ── DRAW RIDERS ──────────────────────────────────────────────────────────

    function _drawRiders(ctx, factionName) {
        const list = window.cityRiders[factionName];
        if (!list || list.length === 0) return;

        const _zoom = (typeof zoom !== 'undefined') ? zoom : 1;
        const _cvW  = (typeof canvas !== 'undefined') ? canvas.width  / _zoom : 640;
        const _cvH  = (typeof canvas !== 'undefined') ? canvas.height / _zoom : 360;
        const camL  = player.x - _cvW / 2 - 80;
        const camR  = player.x + _cvW / 2 + 80;
        const camT  = player.y - _cvH / 2 - 80;
        const camB  = player.y + _cvH / 2 + 80;

        let drawn = 0;
        for (const rd of list) {
            // Always simulate (so they keep moving off-screen) — cheap
            _riderAITick(rd, factionName);

            const inView = rd.x > camL && rd.x < camR && rd.y > camT && rd.y < camB;
            if (!inView || drawn >= MAX_RIDERS_DRAWN) continue;
            drawn++;

            const frame  = (Date.now() / 60) + (rd.animOffset || 0);
            const moving = (Math.abs(rd.vx) + Math.abs(rd.vy)) > 0.05
                           && rd.waitTimer === 0
                           && rd._yieldTimer === 0
                           && !rd._atPlaza;
            const spriteDir = -(rd._dir || 1); // head faces direction of travel

            if (typeof drawCityHorse === 'function')
                drawCityHorse(ctx, rd.x, rd.y, moving, frame, spriteDir, rd.coat);
            if (typeof drawCityRider === 'function')
                drawCityRider(ctx, rd.x, rd.y, moving, frame, spriteDir, rd.cloth, rd.hat);
        }
    }

    // ── GATE COMMUTER WALKERS ────────────────────────────────────────────────

    function _gateCommuterCount(isVillage, pop) {
        if (isVillage) return Math.min(4, Math.max(2, Math.floor(pop / 80)));
        return Math.min(MAX_GATE_COMMUTERS, Math.max(4, Math.floor(pop / 120)));
    }

    function _spawnGateCommuter(factionName, fromSide /* 'north'|'south' */) {
        const list = window.cityGateCommuters[factionName];
        if (!list) return;
        if (list.length >= MAX_GATE_COMMUTERS) return;
        if (!_getGrid(factionName)) return;

        const nsX = _getNSRoadX(factionName);
        // Spread x within ±3 tiles of the road spine so groups don't overlap
        const offsetCol = Math.floor(Math.random() * 7) - 3;
        const spawnX = nsX + offsetCol * TILE;

        let spawnY, dir;
        if (fromSide === 'north') {
            spawnY = -VOID_MARGIN_PX + Math.random() * 40;
            dir = 1;
        } else {
            spawnY = LHEIGHT + VOID_MARGIN_PX - Math.random() * 40;
            dir = -1;
        }

        const fStyles = (typeof CIVILIAN_STYLES !== 'undefined')
            ? (CIVILIAN_STYLES[factionName] || CIVILIAN_STYLES['Default'])
            : { hats: ['conical'], clothes: ['#666'] };

        const hat   = fStyles.hats   [Math.floor(Math.random() * fStyles.hats.length)];
        const cloth = fStyles.clothes[Math.floor(Math.random() * fStyles.clothes.length)];

        // Inner-only target so the goal isn't right at the gate itself.
        const interior = _pickRandomRoadTarget(factionName, 40, true);

        list.push({
            x: spawnX, y: spawnY,
            vx: 0, vy: 0,
            _faction:    factionName,
            _fromSide:   fromSide,
            _phase:      'enter',             // 'enter' → 'wander' → 'exit'
            _interior:   interior,
            _exitSide:   Math.random() < 0.5 ? fromSide : (fromSide === 'north' ? 'south' : 'north'),
            _heading:    dir > 0 ? Math.PI / 2 : -Math.PI / 2,
            _planTimer:  0,
            _yieldTimer: 0,
            _pauseTimer: 0,
            _phaseTimer: 0,
            speed:       WALKER_SPEED_MIN + Math.random() * (WALKER_SPEED_MAX - WALKER_SPEED_MIN),
            animOffset:  Math.random() * 100,
            hat:         hat,
            clothing:    cloth,
            _dir:        1,
        });
    }

    /**
     * Per-walker AI tick. Returns true if the walker should be despawned.
     */
    function _gateCommuterTick(npc, factionName) {
        // Pause/yield timers
        if (npc._yieldTimer > 0) { npc._yieldTimer--; npc.vx = 0; npc.vy = 0; return false; }
        if (npc._pauseTimer > 0) { npc._pauseTimer--; npc.vx = 0; npc.vy = 0; return false; }

        npc._phaseTimer++;

        // Phase transitions
        if (npc._phase === 'enter') {
            // Switch to wander once we're meaningfully inside the city, OR
            // we've reached our interior target, OR after a timeout so a
            // blocked-path commuter doesn't get stuck forever.
            const deepInside = npc._fromSide === 'north'
                ? npc.y > LHEIGHT * 0.25
                : npc.y < LHEIGHT * 0.75;

            // "Inside the map at all" — once they've crossed the gate/void
            // boundary into the city proper, they count as on-the-map even
            // if not deep yet. Lets timeout-rescue kick in.
            const onTheMap = npc.y > TILE * 4 && npc.y < LHEIGHT - TILE * 4;

            const tgt = npc._interior;
            let nearTarget = false;
            if (tgt) {
                const dx = tgt.px - npc.x, dy = tgt.py - npc.y;
                nearTarget = dx * dx + dy * dy < (TILE * 5) * (TILE * 5);
            }
            const enterTimeout = npc._phaseTimer > 600;

            if ((deepInside && (nearTarget || Math.random() < 0.005)) ||
                (onTheMap && enterTimeout)) {
                npc._phase = 'wander';
                npc._phaseTimer = 0;
                npc._interior = _pickRandomRoadTarget(factionName, 40, true);
            }
        } else if (npc._phase === 'wander') {
            if (npc._phaseTimer > 240 + Math.random() * 480) {
                npc._phase = 'exit';
                npc._phaseTimer = 0;
            } else {
                // Occasionally re-roll wander target
                if (!npc._interior || Math.random() < 0.004) {
                    npc._interior = _pickRandomRoadTarget(factionName, 40, true);
                }
            }
        } else if (npc._phase === 'exit') {
            const exitY = npc._exitSide === 'north'
                ? -VOID_MARGIN_PX - 20
                : LHEIGHT + VOID_MARGIN_PX + 20;
            const nsX = _getNSRoadX(factionName);
            npc._interior = { px: nsX + (Math.random() - 0.5) * TILE * 4, py: exitY };

            if (npc._exitSide === 'north' && npc.y < -VOID_MARGIN_PX * 0.6) return true;
            if (npc._exitSide === 'south' && npc.y > LHEIGHT + VOID_MARGIN_PX * 0.6) return true;
        }

        // Heading: aim greedily toward _interior; if blocked, fan out
        const goal = npc._interior;
        npc._planTimer--;

        if (npc._planTimer <= 0) {
            if (goal) npc._heading = Math.atan2(goal.py - npc.y, goal.px - npc.x);

            const probeX = npc.x + Math.cos(npc._heading) * TILE * 2;
            const probeY = npc.y + Math.sin(npc._heading) * TILE * 2;
            const probeBlocked = (typeof isCityCollision === 'function')
                && isCityCollision(probeX, probeY, factionName, false);

            if (probeBlocked) {
                const baseA = npc._heading;
                const OFFS = [Math.PI/6, -Math.PI/6, Math.PI/3, -Math.PI/3,
                              Math.PI/2, -Math.PI/2, 2*Math.PI/3, -2*Math.PI/3, Math.PI];
                for (const off of OFFS) {
                    const a = baseA + off;
                    const lx = npc.x + Math.cos(a) * TILE * 2.5;
                    const ly = npc.y + Math.sin(a) * TILE * 2.5;
                    // In exit phase the void is open territory
                    if (npc._phase === 'exit' && (ly < 0 || ly > LHEIGHT)) {
                        npc._heading = a; break;
                    }
                    if (typeof isCityCollision !== 'function' ||
                        !isCityCollision(lx, ly, factionName, false)) {
                        npc._heading = a; break;
                    }
                }
            }
            npc._planTimer = 20 + Math.floor(Math.random() * 40);
        }

        // Traffic yield — pause briefly if another walker or rider is right ahead
        const aheadX = npc.x + Math.cos(npc._heading) * WALKER_TRAFFIC_LOOKAHEAD;
        const aheadY = npc.y + Math.sin(npc._heading) * WALKER_TRAFFIC_LOOKAHEAD;
        if (_walkerTrafficAhead(npc, aheadX, aheadY, WALKER_TRAFFIC_RADIUS) ||
            _riderTrafficAhead(npc, factionName, aheadX, aheadY, 22)) {
            npc._yieldTimer = 6 + Math.floor(Math.random() * 12);
            npc.vx = 0; npc.vy = 0;
            return false;
        }

        // Step forward — void is freely passable
        const nx = npc.x + Math.cos(npc._heading) * npc.speed;
        const ny = npc.y + Math.sin(npc._heading) * npc.speed;
        const inVoid  = ny < 0 || ny > LHEIGHT;
        const blocked = !inVoid && typeof isCityCollision === 'function'
                        && isCityCollision(nx, ny, factionName, false);

        if (blocked) {
            npc._heading += (Math.random() - 0.5) * Math.PI * 0.5;
            npc._planTimer = 0;
            npc.vx = 0; npc.vy = 0;
            if (Math.random() < 0.05) npc._pauseTimer = 12 + Math.floor(Math.random() * 22);
        } else {
            npc.x  = _clamp(nx, TILE * 2, (COLS - 2) * TILE);
            npc.y  = ny;
            npc.vx = Math.cos(npc._heading) * npc.speed;
            npc.vy = Math.sin(npc._heading) * npc.speed;
        }

        // Natural pause during wander phase
        if (npc._phase === 'wander' && Math.random() < 0.0022) {
            npc._pauseTimer = 30 + Math.floor(Math.random() * 70);
        }

        // Walker stuck recovery: if we haven't covered meaningful distance
        // in ~120 frames, jolt the heading and re-pick the goal so we don't
        // oscillate against a building wall.
        if (npc._stuckCheck === undefined) {
            npc._stuckCheck = 0; npc._lastX = npc.x; npc._lastY = npc.y;
        }
        npc._stuckCheck++;
        if (npc._stuckCheck > 120) {
            const moved = Math.hypot(npc.x - npc._lastX, npc.y - npc._lastY);
            if (moved < 6) {
                npc._heading   = Math.random() * Math.PI * 2;
                npc._planTimer = 0;
                if (npc._phase === 'enter' || npc._phase === 'wander') {
                    npc._interior = _pickRandomRoadTarget(factionName, 40, true);
                }
            }
            npc._lastX = npc.x; npc._lastY = npc.y;
            npc._stuckCheck = 0;
        }

        if (Math.abs(npc.vx) > 0.06) npc._dir = npc.vx > 0 ? 1 : -1;
        return false;
    }

    function _drawGateCommuters(ctx, factionName) {
        const list = window.cityGateCommuters[factionName];
        if (!list || list.length === 0) return;

        const _zoom = (typeof zoom !== 'undefined') ? zoom : 1;
        const _cvW  = (typeof canvas !== 'undefined') ? canvas.width  / _zoom : 640;
        const _cvH  = (typeof canvas !== 'undefined') ? canvas.height / _zoom : 360;
        const camL  = player.x - _cvW / 2 - 60;
        const camR  = player.x + _cvW / 2 + 60;
        const camT  = player.y - _cvH / 2 - 60;
        const camB  = player.y + _cvH / 2 + 60;

        const factionColor = (typeof FACTIONS !== 'undefined' && FACTIONS[factionName])
            ? FACTIONS[factionName].color : '#ffffff';

        for (let i = list.length - 1; i >= 0; i--) {
            const npc = list[i];
            const despawn = _gateCommuterTick(npc, factionName);
            if (despawn) { list.splice(i, 1); continue; }

            if (npc.x < camL || npc.x > camR || npc.y < camT || npc.y > camB) continue;

            const isMoving = (Math.abs(npc.vx) + Math.abs(npc.vy)) > 0.05
                             && npc._pauseTimer === 0 && npc._yieldTimer === 0;
            if (typeof drawHuman === 'function') {
                drawHuman(ctx, npc.x, npc.y, isMoving,
                          (Date.now() / 50) + (npc.animOffset || 0),
                          factionColor, npc.hat, npc.clothing);
            }
        }
    }

    function _pumpGateCommuters(factionName) {
        if (!factionName) return;
        const list = window.cityGateCommuters[factionName];
        if (!list) return;

        const f = (window._gateCommuterFrame[factionName] || 0) + 1;
        window._gateCommuterFrame[factionName] = f;

        if (f % GATE_COMMUTER_SPAWN_EVERY !== 0) return;
        if (list.length >= MAX_GATE_COMMUTERS) return;

        _spawnGateCommuter(factionName, Math.random() < 0.5 ? 'north' : 'south');
    }

    function _seedGateCommuters(factionName, isVillage, pop) {
        window.cityGateCommuters[factionName] = [];
        const target = _gateCommuterCount(isVillage, pop);
        for (let i = 0; i < target; i++) {
            const side = Math.random() < 0.5 ? 'north' : 'south';
            _spawnGateCommuter(factionName, side);

            // Pre-advance some so they're already mid-traverse on entry.
            // Cap at 400 frames so they don't all bunch up at the wander
            // target. Stop early if despawned or already in wander phase.
            const list = window.cityGateCommuters[factionName];
            const npc = list[list.length - 1];
            if (npc) {
                const advance = Math.floor(Math.random() * 400);
                for (let k = 0; k < advance; k++) {
                    if (_gateCommuterTick(npc, factionName)) {
                        list.pop(); // despawned mid-pre-advance
                        break;
                    }
                    if (npc._phase !== 'enter') break;
                }
            }
        }
    }

    // ── HOOK: generateCityCosmeticNPCs ───────────────────────────────────────
    // Chain after the previous generator (animals/walkers/kids) so we ADD our
    // wagons + riders + gate commuters without overwriting other generators.
    const _prevGen = window.generateCityCosmeticNPCs;
    window.generateCityCosmeticNPCs = function(factionName, grid, isVillage, pop) {
        isVillage = isVillage || false;
        pop       = pop       || 1000;

        if (typeof _prevGen === 'function') _prevGen(factionName, grid, isVillage, pop);

        _generateStaticCaravans(factionName, grid, isVillage, pop);
        _generateRiders(factionName, grid, isVillage, pop);
        _seedGateCommuters(factionName, isVillage, pop);
    };

    // ── HOOK: renderCityCosmeticNPCs ─────────────────────────────────────────
    // Let the prior chain render its animals/walkers, then we draw our
    // static wagons + free-roaming riders + gate commuters.
    const _prevRender = window.renderCityCosmeticNPCs;
    window.renderCityCosmeticNPCs = function(ctx, factionName) {
        if (typeof _prevRender === 'function') _prevRender(ctx, factionName);

        _pumpGateCommuters(factionName);
        _drawStaticCaravans(ctx, factionName);
        _drawRiders(ctx, factionName);
        _drawGateCommuters(ctx, factionName);
    };

    // ── HOOK: flush on city entry so the pools regenerate fresh ──────────────
    const _origEnter = window.enterCity;
    if (typeof _origEnter === 'function') {
        window.enterCity = function(factionName, playerObj) {
            if (window.cityCaravans)       delete window.cityCaravans[factionName];
            if (window.cityRiders)         delete window.cityRiders[factionName];
            if (window.cityGateCommuters)  delete window.cityGateCommuters[factionName];
            if (window._gateCommuterFrame) delete window._gateCommuterFrame[factionName];
            return _origEnter.apply(this, arguments);
        };
    }

    console.log('[CityTrafficSystem] ✓ Static wagons · free-roam riders · gate-commuter walkers · traffic yield · mobile-safe');
})();