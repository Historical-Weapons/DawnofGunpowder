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
    // 1. Wipe ghost data so previous walled-city geometry doesn't bleed into the village
    window.cityTowerPositions = []; 
    if (typeof cityLadders !== 'undefined') cityLadders = [];
    if (typeof overheadCityGates !== 'undefined') overheadCityGates = [];
    
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
                    baseSpeed: baseSpeed
                });
                spawned++;
            }
        }
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