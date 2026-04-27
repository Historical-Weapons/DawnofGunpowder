
// ============================================================================
// GLOBAL DATA STORAGE
// ============================================================================
let fortificationTroops = {}; // Holds the arrays of NPCs for each city
let cityLadders = [];         // Holds ladder positions for pathfinding
let overheadCityGates = [];   // Single source of truth for gate data

function renderDynamicGates(ctx) {
const gates = (battleEnvironment?.cityGates && battleEnvironment.cityGates.length)
    ? battleEnvironment.cityGates
    : overheadCityGates;

if (!gates || !gates.length) return;

gates.forEach(gate => {
        if (!gate.pixelRect) return; 

        // --- SURGERY: If gate is broken or open, physically move its collision box off-map
        if (gate.gateHP <= 0 || gate.isOpen) {
            gate.pixelRect.x = -9999; // Yeet the physics box away so player can't hit it
            return; 
        }
		
        const px = gate.pixelRect.x;
        const py = gate.pixelRect.y;
        const pw = gate.pixelRect.w;
        const ph = gate.pixelRect.h;
        const tile = 8; // BATTLE_TILE_SIZE

        // Pillars
        ctx.fillStyle = "#37474f";
        ctx.fillRect(px, py, tile, ph);
        ctx.fillRect(px + pw - tile, py, tile, ph);

        // Vertical planks
        ctx.fillStyle = "#3e2723";
        for (let i = 1; i < pw; i += tile * 0.32) {
            ctx.fillRect(px + i, py, 1, ph);
        }

        // Iron bands
        ctx.fillStyle = "#1f1f1f";
        ctx.fillRect(px, py + 1, pw, 2);
        ctx.fillRect(px, py + ph - 3, pw, 2);

        // Roof
        const isNorth = gate.side === "north";
        const capY = isNorth ? py : (py + ph - 4);
        ctx.fillStyle = isNorth ? "#8d1f1f" : "#7a1818";
        ctx.fillRect(px, capY, pw, 4);

        // Visual damage wear
        const hp = Math.max(0, gate.gateHP);
        const wear = 1 - (hp / 1500);
        if (wear > 0.25) {
            ctx.fillStyle = `rgba(120, 40, 20, ${0.12 + wear * 0.28})`;
            ctx.fillRect(px + tile * 0.15, py + tile * 0.15, pw - tile * 0.3, ph - tile * 0.3);
        }
    });
}
function buildCityWalls(grid, arch, ctx, factionName) {
    // CRITICAL FIX: Wipe the old ladders so the player doesn't trigger ghost ladders!
    cityLadders = [];
    const gateDrawn = { north: false, south: false };
    const margin = 45; 
    const wallThick = 10; 
    const startX = margin;
    const endX = CITY_COLS - margin;
    const startY = margin;
    const endY = (typeof CITY_LOGICAL_ROWS !== 'undefined' ? CITY_LOGICAL_ROWS : CITY_ROWS) - margin;
    const midX = Math.floor(CITY_COLS / 2);
    const gateRadius = 6; 

    // Tower configuration tweaks
    const towerInterval = 75; 
    const cornerBuffer = 25;  

let gateW = (gateRadius * 2 + 1) * CITY_TILE_SIZE; 
    let gateH = wallThick * CITY_TILE_SIZE;

    overheadCityGates = [
        { 
            x: midX, y: startY, arch: arch, isOpen: false, gateHP: 1000, side: "north",
            pixelRect: { x: (midX - gateRadius) * CITY_TILE_SIZE, y: startY * CITY_TILE_SIZE, w: gateW, h: gateH },
            bounds: { x0: midX - gateRadius, y0: startY, x1: midX + gateRadius, y1: startY + wallThick - 1 }
        },
        { 
            x: midX, y: endY, arch: arch, isOpen: false, gateHP: 1000, side: "south",
            pixelRect: { x: (midX - gateRadius) * CITY_TILE_SIZE, y: (endY - wallThick + 1) * CITY_TILE_SIZE, w: gateW, h: gateH },
            bounds: { x0: midX - gateRadius, y0: endY - wallThick + 1, x1: midX + gateRadius, y1: endY }
        }
    ];
	
 

    //1 let
let towers = [];
let baseColor = arch.walls[1] || arch.walls[0];
// Global tower registry reset each build (used by shooter & roof canvas)
window.cityTowerPositions = [];



 // 2. THE HOLLOW WALL & ENCLOSED GATES (Expanded with massive inner wood structure)
    let woodThick = 7; // The inward extension of the wooden platform
    let combinedThick = wallThick + woodThick; // Almost doubles the structure thickness

    for (let x = startX; x <= endX; x++) {
        for (let y = startY; y <= endY; y++) {
            
// Calculate distance to the closest boundary
            let distFromLeft = x - startX;
            let distFromRight = endX - x;
            let distFromTop = y - startY;
            let distFromBottom = endY - y;
            let minDistToEdge = Math.min(distFromLeft, distFromRight, distFromTop, distFromBottom);

            let isEdge = (minDistToEdge >= 0 && minDistToEdge < combinedThick);
            if (!isEdge) continue;

            let isGateZone = Math.abs(x - midX) <= gateRadius;
            let isVerticalGate = (y >= startY && y < startY + wallThick) || (y <= endY && y > endY - wallThick);
            
            // NEW SURGERY: Detect the wooden extension area sitting directly behind the gate
            let isGateExtension = isGateZone && !isVerticalGate && ((y >= startY && y < startY + combinedThick) || (y <= endY && y > endY - combinedThick));

            if (isGateZone && isVerticalGate) {
                const gate = (y < startY + wallThick)
                    ? overheadCityGates.find(g => g.side === "north")
                    : overheadCityGates.find(g => g.side === "south");

                if (gate && !gateDrawn[gate.side]) {
                    drawCityGateBlock(ctx, grid, gate, arch, midX, gateRadius, startY, endY, wallThick);
                    gateDrawn[gate.side] = true;
                }
                continue;
            }
            else if (isGateExtension) {
                // FORCE the area behind the gate to remain an open road (Tile 1)
                grid[x][y] = 1; 
                continue; 
            }
            else {
                let px = x * CITY_TILE_SIZE;
                // ... (Keep the rest of your Zone 1, 2, 3 logic exactly the same)
                let py = y * CITY_TILE_SIZE;
                let isHorizontalWall = (minDistToEdge === distFromTop || minDistToEdge === distFromBottom);

// --- ZONE 1: SOLID STONE WALL (Outer Bulk) ---
if (minDistToEdge <= wallThick - 3) {
    grid[x][y] = 6; // Impassable Solid Stone

    // Base wall
    ctx.fillStyle = baseColor;
    ctx.fillRect(px, py, CITY_TILE_SIZE, CITY_TILE_SIZE);

    // Shadow the outer parapet edge to give it depth
    if (minDistToEdge < 2.0) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.fillRect(px, py, CITY_TILE_SIZE, CITY_TILE_SIZE);
    }

    // --- BRICKS ONLY ON INNER WALL BAND ---
    if (minDistToEdge >= 2 && minDistToEdge <= wallThick - 3) {

        const brickH = Math.max(3, Math.floor(CITY_TILE_SIZE / 4));
        const brickW = Math.max(4, Math.floor(CITY_TILE_SIZE / 2));

        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 1;
        ctx.beginPath();

        // Horizontal lines
        for (let i = 1; i < 4; i++) {
            const yy = py + i * brickH;
            ctx.moveTo(px, yy);
            ctx.lineTo(px + CITY_TILE_SIZE, yy);
        }

        // Vertical stagger (deterministic)
        for (let i = 0; i < 4; i++) {
            const yOffset = py + (i * brickH);
            const stagger = ((x + y + i) % 2 === 0) ? 0 : Math.floor(brickW / 2);
            const xx = px + stagger;

            ctx.moveTo(xx, yOffset);
            ctx.lineTo(xx, yOffset + brickH);
        }

        ctx.stroke();
    }
}
                
                // --- ZONE 2: CONTINUOUS WOODEN STAIRS (Innermost Ring) ---
                else if (minDistToEdge === combinedThick - 1) {
                    grid[x][y] = 9; // Ladder/Climb tile! Triggers t.onWall = true in your logic
                    
                    // Black void underneath the stairs
                    ctx.fillStyle = "#1a1a1a";
                    ctx.fillRect(px, py, CITY_TILE_SIZE, CITY_TILE_SIZE);

                    ctx.fillStyle = "#4A3728"; // Dark Wood Base
                    ctx.fillRect(px, py, CITY_TILE_SIZE, CITY_TILE_SIZE);
                    
                    // Draw continuous climbing steps oriented correctly
                    for (let step = 1; step < CITY_TILE_SIZE; step += 4) {
                        ctx.fillStyle = "rgba(0,0,0,0.6)"; 
                        if (isHorizontalWall) ctx.fillRect(px, py + step + 1, CITY_TILE_SIZE, 1);
                        else ctx.fillRect(px + step + 1, py, 1, CITY_TILE_SIZE);
                        
                        ctx.fillStyle = "#A67B5B"; // Lighter wood for the step lip
                        if (isHorizontalWall) ctx.fillRect(px, py + step, CITY_TILE_SIZE, 2);
                        else ctx.fillRect(px + step, py, 2, CITY_TILE_SIZE);
                    }
                }
                
                // --- ZONE 3: WIDE WOODEN WALKWAY (Overlap + Scaffold) ---
                else {
                    grid[x][y] = 8; // Fully Walkable Wall Platform

                    // If it overlaps the inner stone edge, draw stone underneath for realism
                    if (minDistToEdge < wallThick) {
                        ctx.fillStyle = baseColor;
                        ctx.fillRect(px, py, CITY_TILE_SIZE, CITY_TILE_SIZE);
                        ctx.fillStyle = "rgba(0,0,0,0.4)"; // Shadow to sink the stone under the wood
                        ctx.fillRect(px, py, CITY_TILE_SIZE, CITY_TILE_SIZE);
                    } else {
                        // Pure scaffold overhang: dark void below
                        ctx.fillStyle = "rgba(0,0,0,0.85)";
                        ctx.fillRect(px, py, CITY_TILE_SIZE, CITY_TILE_SIZE);
                    }

                    // Wood Base Color
                    ctx.fillStyle = "#C19A6B"; 
                    ctx.fillRect(px, py, CITY_TILE_SIZE, CITY_TILE_SIZE);

                    // Draw Planks
                    ctx.fillStyle = "#6B4226"; 
                    let plankWidth = 4;
                    if (isHorizontalWall) {
                        for (let p = 0; p <= CITY_TILE_SIZE; p += plankWidth) {
                            ctx.fillRect(px + p, py, 1, CITY_TILE_SIZE);
                        }
                    } else {
                        for (let p = 0; p <= CITY_TILE_SIZE; p += plankWidth) {
                            ctx.fillRect(px, py + p, CITY_TILE_SIZE, 1);
                        }
                    }
                    
                    // Draw heavy support beams under the overhanging scaffold portion
                    if (minDistToEdge >= wallThick && minDistToEdge % 2 === 0) {
                        ctx.fillStyle = "#3e2723"; 
                        if (isHorizontalWall) {
                            ctx.fillRect(px, py + CITY_TILE_SIZE / 2 - 2, CITY_TILE_SIZE, 4);
                        } else {
                            ctx.fillRect(px + CITY_TILE_SIZE / 2 - 2, py, 4, CITY_TILE_SIZE);
                        }
                    }

                    // Drop shadow overlapping from the solid stone wall onto the wood
                    if (minDistToEdge === wallThick - 2) {
                        ctx.fillStyle = "rgba(0,0,0,0.4)";
                        if (distFromTop === minDistToEdge) ctx.fillRect(px, py, CITY_TILE_SIZE, 6);
                        else if (distFromBottom === minDistToEdge) ctx.fillRect(px, py + CITY_TILE_SIZE - 6, CITY_TILE_SIZE, 6);
                        else if (distFromLeft === minDistToEdge) ctx.fillRect(px, py, 6, CITY_TILE_SIZE);
                        else if (distFromRight === minDistToEdge) ctx.fillRect(px + CITY_TILE_SIZE - 6, py, 6, CITY_TILE_SIZE);
                    }
                }
            }

            // --- GATHER INNER-FACING TOWER LOCATIONS ---
            // Tied strictly to the original wallThick so towers align perfectly with the stone
            if (!isGateZone) {
                let distToStartX = Math.abs(x - startX);
                let distToEndX = Math.abs(x - endX);
                let distToStartY = Math.abs(y - startY);
                let distToEndY = Math.abs(y - endY);

                let isCornerArea = (distToStartX < cornerBuffer || distToEndX < cornerBuffer) &&
                                   (distToStartY < cornerBuffer || distToEndY < cornerBuffer);

                if (!isCornerArea) {
                    if (y === startY + wallThick - 1 && x % towerInterval === 0) towers.push({ x: x, y: y + 1, side: 'N' });
                    else if (y === endY - wallThick + 1 && x % towerInterval === 0) towers.push({ x: x, y: y - 1, side: 'S' });
                    else if (x === startX + wallThick - 1 && y % towerInterval === 0) towers.push({ x: x + 1, y: y, side: 'W' });
                    else if (x === endX - wallThick + 1 && y % towerInterval === 0) towers.push({ x: x - 1, y: y, side: 'E' });
                }
            }
        }
    }
 

// 3. TOWER PHYSICS & REGISTRATION (Visuals moved to dynamic render)
    for (let t of towers) {
        let towerSize = 7;   
        let overlap   = 3;
        let rx, ry;

        if      (t.side === 'N') { rx = t.x - Math.floor(towerSize/2); ry = t.y - overlap; }
        else if (t.side === 'S') { rx = t.x - Math.floor(towerSize/2); ry = t.y - towerSize + overlap; }
        else if (t.side === 'W') { rx = t.x - overlap;                 ry = t.y - Math.floor(towerSize/2); }
        else if (t.side === 'E') { rx = t.x - towerSize + overlap;     ry = t.y - Math.floor(towerSize/2); }

        // ── GRID MARKING (Solid obstacle) ──
        for (let ix = rx; ix < rx + towerSize; ix++) {
            for (let iy = ry; iy < ry + towerSize; iy++) {
                if (!grid[ix] || grid[ix][iy] === undefined) continue;
                grid[ix][iy] = 7; 
            }
        }

        // ── PIXEL COORDINATES ──
        let originalSize = towerSize * CITY_TILE_SIZE;
        let newSize      = originalSize * 1.10; 
        let offset       = (newSize - originalSize) / 2;
        let tX = (rx * CITY_TILE_SIZE) - offset;
        let tY = (ry * CITY_TILE_SIZE) - offset;

        // ── REGISTER IN GLOBAL TOWER LIST (Critical for Arrows) ──
        window.cityTowerPositions.push({
            pixelX:      tX + newSize / 2,
            pixelY:      tY + newSize / 2,
            tX, tY, newSize,
            side:        t.side,
            hp:          300,
            maxHp:       300,
            fireCooldown: Math.floor(Math.random() * 200 + 80),
        });

        // ── WRAP-AROUND WOODEN STAIRS (tile 12) ──
        const woodDark  = "#4A3728";
        const woodBase  = "#A67B5B";
        const woodLight = "#D2B48C";
        const backdrop  = "#1a1a1a";

        let px_start = rx - 1, px_end   = rx + towerSize;
        let py_start = ry - 1, py_end   = ry + towerSize;

        for (let ix = px_start; ix <= px_end; ix++) {
            for (let iy = py_start; iy <= py_end; iy++) {
                if (ix >= rx && ix < rx+towerSize && iy >= ry && iy < ry+towerSize) continue;
                if (ix < 0 || ix >= CITY_COLS || iy < 0 || iy >= CITY_ROWS) continue;
                let existingTile = grid[ix][iy];
                if (existingTile === 0 || existingTile === 1 || existingTile === 5 || existingTile === undefined) {
                    grid[ix][iy] = 12;
                    let spx = ix * CITY_TILE_SIZE, spy = iy * CITY_TILE_SIZE;
                    ctx.fillStyle = backdrop; ctx.fillRect(spx, spy, CITY_TILE_SIZE, CITY_TILE_SIZE);
                    let isVert = (ix === px_start || ix === px_end);
                    if (isVert) {
                        ctx.fillStyle = woodDark;
                        ctx.fillRect(spx+1, spy, 2, CITY_TILE_SIZE);
                        ctx.fillRect(spx+CITY_TILE_SIZE-3, spy, 2, CITY_TILE_SIZE);
                        for (let step=1; step<CITY_TILE_SIZE; step+=3) {
                            ctx.fillStyle="rgba(0,0,0,0.5)"; ctx.fillRect(spx+2, spy+step+1, CITY_TILE_SIZE-5, 1);
                            ctx.fillStyle=woodBase;  ctx.fillRect(spx+2, spy+step,   CITY_TILE_SIZE-5, 1);
                            ctx.fillStyle=woodLight; ctx.fillRect(spx+2, spy+step,   CITY_TILE_SIZE-5, 0.5);
                        }
                    } else {
                        ctx.fillStyle = woodDark;
                        ctx.fillRect(spx, spy+1, CITY_TILE_SIZE, 2);
                        ctx.fillRect(spx, spy+CITY_TILE_SIZE-3, CITY_TILE_SIZE, 2);
                        for (let step=1; step<CITY_TILE_SIZE; step+=3) {
                            ctx.fillStyle="rgba(0,0,0,0.5)"; ctx.fillRect(spx+step+1, spy+2, 1, CITY_TILE_SIZE-5);
                            ctx.fillStyle=woodBase;  ctx.fillRect(spx+step,   spy+2, 1, CITY_TILE_SIZE-5);
                            ctx.fillStyle=woodLight; ctx.fillRect(spx+step,   spy+2, 0.5, CITY_TILE_SIZE-5);
                        }
                    }
                }
            }
        }
    }
	
   // 4. SPAWN TROOPS 
    if (factionName) {
        fortificationTroops[factionName] = [];
        const weaponPool = ["spearman", "sword_shield"];
        const wallWeaponPool = ["archer", "crossbow"];
        
        // Use +5 / -5 margin so we don't accidentally spawn them inside the parapet limits
        for (let x = startX + 5; x <= endX - 5; x++) {
            for (let y = startY + 5; y <= endY - 5; y++) {
                
                let tile = grid[x][y];
                // Massive spawn rate boost for the walls so they actively populate
                let spawnChance = (tile === 8) ? 0.002 : (tile === 0 ? 0.0001 : 0);

                if (spawnChance > 0 && Math.random() < spawnChance) {
				let px = (x * CITY_TILE_SIZE) + (CITY_TILE_SIZE / 2);
				let py = (y * CITY_TILE_SIZE) + (CITY_TILE_SIZE / 2);
									
                    let tooClose = fortificationTroops[factionName].some(troop => Math.hypot(troop.x - px, troop.y - py) < 60);

                    if (!tooClose) {
                        let chosenWeapon = (tile === 8) 
                            ? wallWeaponPool[Math.floor(Math.random() * wallWeaponPool.length)]
                            : weaponPool[Math.floor(Math.random() * weaponPool.length)];
                        
                        fortificationTroops[factionName].push({
                            x: px, y: py,
                            vx: (Math.random() - 0.5) * 0.3,
                            vy: (Math.random() - 0.5) * 0.3,
                            animOffset: Math.random() * 100,
                            weapon: chosenWeapon,
                            isCavalry: false, 
                            dir: Math.random() > 0.5 ? 1 : -1,
                            onWall: tile === 8, 
                            unitName: tile === 8 ? "Wall Defender" : "City Guard"
                        });
                    }
                }
            }
        }
    }
}



function handleEntityGateTeleport(entity, grid) {
return;
}

// Add these two guard variables at the very top of your fortification_system.js file
let lastFortificationTick = 0;
let lastFortifyRenderTime = 0; 

function policeTroops(ctx, factionName, playerObj, allNPCs) {
    let troops = fortificationTroops[factionName];
    if (!troops) return;

    let now = Date.now();

    // --- 1. THE STACKING GUARD (Fixes "Bold/Stacked" look) ---
    if (now === lastFortifyRenderTime) return;
    lastFortifyRenderTime = now;

    // --- 2. THE SPEED GUARD (Fixes "5x Speed" bug) ---
    let shouldUpdateLogic = false;
    if (now - lastFortificationTick > 15) {
        shouldUpdateLogic = true;
        lastFortificationTick = now;
    }

    // 3. YELLOW GUI TEXT
    if (overheadCityGates && playerObj) {
        const margin = 45; 
        for (let g of overheadCityGates) {
            let gx = g.x * CITY_TILE_SIZE;
            let gy = g.y * CITY_TILE_SIZE;
            let dist = Math.hypot(playerObj.x - gx, playerObj.y - gy);
            if (dist < 120) {
                ctx.save();
                ctx.fillStyle = "#ffeb3b"; ctx.font = "bold 14px monospace";
                ctx.textAlign = "center"; ctx.shadowBlur = 5; ctx.shadowColor = "black";
                ctx.fillText("PRESS P or ↩️ TO EXIT", gx, gy + (g.y === margin ? -40 : 40) + Math.sin(now/200)*3);
                ctx.restore();
            }
        }
    }

    // 4. TROOP RENDERING & COLLISION
    let fColor = (typeof ARCHITECTURE !== 'undefined' && ARCHITECTURE[factionName]) ? ARCHITECTURE[factionName].roofs[0] : "#4a4a4a";

    for (let t of troops) {
        let dx = t.x - playerObj.x;
        let dy = t.y - playerObj.y;
        if (dx*dx + dy*dy > 1200*1200) continue;

// --- POSITION UPDATE (Only runs 60 times per second) ---
        if (shouldUpdateLogic) {
            
            // FIX: Auto-transition Troops between ground and wall using ladders
            let tx = Math.floor(t.x / CITY_TILE_SIZE);
            let ty = Math.floor(t.y / CITY_TILE_SIZE);
            if (typeof cityDimensions !== 'undefined' && cityDimensions[factionName]) {
                let currentTile = cityDimensions[factionName].grid[tx] ? cityDimensions[factionName].grid[tx][ty] : 0;
                if (currentTile === 9) t.onWall = true; 
                else if (currentTile === 0 || currentTile === 1 || currentTile === 5) t.onWall = false; 
            }

            // --- THE LAZY UPDATE ---
            // 5% chance to just stop moving completely (idle)
            if (Math.random() < 0.05) {
                t.vx = 0;
                t.vy = 0;
            } 
            // 1% chance to pick a new, very slow direction
            else if (Math.random() < 0.01) {
                t.vx = (Math.random() - 0.5) * 0.3;
                t.vy = (Math.random() - 0.5) * 0.3;
                t.dir = t.vx > 0 ? 1 : -1;
            }

            let nx = t.x + t.vx;
            let ny = t.y + t.vy;

            let hitEntity = false;
            if (playerObj && Math.hypot(playerObj.x - nx, playerObj.y - ny) < 12) hitEntity = true;
            if (!hitEntity && allNPCs) {
                for(let n of allNPCs) {
                    if (Math.abs(n.x - nx) > 20 || Math.abs(n.y - ny) > 20) continue;
                    if(n !== t && Math.hypot(n.x - nx, n.y - ny) < 12) { hitEntity = true; break; }
                }
            }

            if (typeof isCityCollision === 'function' && isCityCollision(nx, ny, factionName, t.onWall) || hitEntity) {
                // --- THE DANCING FIX ---
                // Instead of bouncing, they lose all velocity when hitting a wall.
                t.vx = 0;
                t.vy = 0; 
                
                // Keep the physical push-back to prevent getting stuck in geometry
                t.x -= Math.sign(nx - t.x) * 1.5;
                t.y -= Math.sign(ny - t.y) * 1.5;
				
            } else {
                t.x = nx; t.y = ny;
            }
        }
        // --- DRAWING PASS (Runs every frame to stop flickering) ---
        let frame = (now / 60) + t.animOffset;
        let weaponBob = Math.sin(frame * 0.5) * 2;
        let dir = t.dir;

        // --- MOUNT RENDERING ---
        let humanY = t.y;
        if (t.isCavalry) {
            humanY = t.y - 8; 
            if (typeof drawHorse === 'function') {
                drawHorse(ctx, t.x, t.y, dir, frame, fColor);
            } else {
                ctx.save();
                ctx.translate(t.x, t.y);
                let legSwing = Math.sin(frame * 2) * 4 * dir;
                ctx.fillStyle = "#4e342e"; 
                ctx.beginPath(); ctx.ellipse(0, 2, 14, 7, 0, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(12 * dir, -4, 6, 4, Math.PI/4 * dir, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 2;
                ctx.beginPath(); 
                ctx.moveTo(-1 * dir, 2); ctx.lineTo((-1 * dir) + legSwing, 10);
                ctx.moveTo(6 * dir, 2); ctx.lineTo((8 * dir) + legSwing, 10); 
                ctx.stroke();
                ctx.restore();
            }
        }

        if (typeof drawHuman === 'function') drawHuman(ctx, t.x, humanY, true, frame, fColor);

        ctx.save();
        ctx.translate(t.x, humanY);
        
        // --- WEAPON RENDERING (All logic preserved) ---
        if (t.weapon === "spearman") {
            let isGlaive = t.unitName === "Glaiveman"; 
            ctx.strokeStyle = "#4e342e"; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(-6 * dir, 4); 
            ctx.lineTo((28 + weaponBob) * dir, -24 + weaponBob); ctx.stroke();
            ctx.fillStyle = "#bdbdbd"; 
            if (isGlaive) {
                ctx.beginPath(); ctx.moveTo((26 + weaponBob) * dir, -22 + weaponBob);
                ctx.quadraticCurveTo((32 + weaponBob) * dir, -30 + weaponBob, (28 + weaponBob) * dir, -32 + weaponBob);
                ctx.lineTo((25 + weaponBob) * dir, -24 + weaponBob); ctx.fill();
            } else {
                ctx.save();
                ctx.translate((28 + weaponBob) * dir, -24 + weaponBob);
                ctx.rotate(dir === 1 ? -Math.PI * 0.25 : -Math.PI * 0.75);
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-3, 2); ctx.lineTo(8, 0); ctx.lineTo(-3, -2);
                ctx.closePath(); ctx.fill(); ctx.restore();
            }
        }
        else if (t.weapon === "cavalry_lancer" || t.isCavalry) {
            let isAttacking = Math.sin(frame * 1.5) > 0.6; 
            let attackThrust = isAttacking ? 10 * dir : 0;
            ctx.strokeStyle = "#4e342e"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-4 * dir, -4); 
            ctx.lineTo((26 * dir) + attackThrust, -4 + (Math.abs(attackThrust)/3)); ctx.stroke();
            ctx.fillStyle = "#bdbdbd"; 
            ctx.fillRect((26 * dir) + attackThrust, -5 + (Math.abs(attackThrust)/3), 6 * dir, 2);
        }
        else if (t.weapon === "camel_gunner") {
            let isAttacking = Math.sin(frame * 1.5) > 0.8;
            ctx.strokeStyle = "#212121"; ctx.lineWidth = 3.5;
            ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo((12 + weaponBob) * dir, -5); ctx.stroke();
            if (isAttacking) { 
                ctx.fillStyle = "#ff9800"; ctx.beginPath(); ctx.arc((14 + weaponBob) * dir, -5, 4, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = "rgba(158, 158, 158, 0.6)"; ctx.beginPath(); ctx.arc((18 + weaponBob) * dir, -8, 6, 0, Math.PI * 2); ctx.fill();
            }
        }
        else if (t.weapon === "Poison Crossbowman") {
            ctx.fillStyle = "#5d4037"; ctx.fillRect(0, -10, 12 * dir, 3); 
            ctx.strokeStyle = "#2e7d32"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(10 * dir, -8.5, 6.5, -Math.PI/2, Math.PI/2, dir < 0); ctx.stroke();
            ctx.strokeStyle = "rgba(200, 255, 200, 0.4)"; ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(10 * dir, -15); ctx.lineTo(10 * dir, -2); ctx.stroke();
        }
        else if (t.weapon === "crossbow" || t.weapon === "archer") { 
            ctx.fillStyle = "#5d4037"; ctx.fillRect(0, -10, 12 * dir, 3); 
            ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(10 * dir, -15); ctx.quadraticCurveTo(18 * dir, -11, 14 * dir, -8.5); 
            ctx.quadraticCurveTo(18 * dir, -6, 10 * dir, -2); ctx.stroke();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"; ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(10 * dir, -15); ctx.lineTo(10 * dir, -2); ctx.stroke();
        }
        
        ctx.restore();
    }
}

function spawnFortificationTroops(factionName, grid, arch) {
    if (!factionName || !grid) return;

    // Recalculate margins to match the wall boundaries
    const margin = 45; 
    const startX = margin;
    const endX = CITY_COLS - margin;
    const startY = margin;
    const endY = (typeof CITY_LOGICAL_ROWS !== 'undefined' ? CITY_LOGICAL_ROWS : CITY_ROWS) - margin;

    fortificationTroops[factionName] = [];
    const weaponPool = ["spearman", "sword_shield"];
    const wallWeaponPool = ["archer", "crossbow"];

    for (let x = startX + 5; x <= endX - 5; x++) {
        for (let y = startY + 5; y <= endY - 5; y++) {
            let tile = grid[x][y];
            
            // 8 = Walkable Wall floor, 0 = Ground
let spawnChance = (tile === 8) ? 0.002 : (tile === 0 ? 0.0002 : 0);

            if (spawnChance > 0 && Math.random() < spawnChance) {
let px = (x * CITY_TILE_SIZE) + (CITY_TILE_SIZE / 2);
let py = (y * CITY_TILE_SIZE) + (CITY_TILE_SIZE / 2);
                
                let tooClose = fortificationTroops[factionName].some(t => Math.hypot(t.x - px, t.y - py) < 60);

                if (!tooClose) {
                    let chosenWeapon = (tile === 8) 
                        ? wallWeaponPool[Math.floor(Math.random() * wallWeaponPool.length)]
                        : weaponPool[Math.floor(Math.random() * weaponPool.length)];
                    
                    fortificationTroops[factionName].push({
                        x: px, y: py,
                        vx: (Math.random() - 0.5) * 0.3,
                        vy: (Math.random() - 0.5) * 0.3,
                        animOffset: Math.random() * 100,
                        weapon: chosenWeapon,
                        isCavalry: false, 
                        dir: Math.random() > 0.5 ? 1 : -1,
                        onWall: tile === 8, 
                        unitName: tile === 8 ? "Wall Defender" : "City Guard"
                    });
                }
			 
            }
        }
    }
}

function updateCityGates(grid) {
    if (!overheadCityGates || !grid) return;

    const margin = 45;
    const wallThick = 12;
    const midX = Math.floor(CITY_COLS / 2);
    const gateRadius = 6;

    const startY = margin;
    const endY = (typeof CITY_LOGICAL_ROWS !== 'undefined' ? CITY_LOGICAL_ROWS : CITY_ROWS) - margin;

    for (let gate of overheadCityGates) {

        // --- AUTO STATE LOGIC ---
        if (gate.gateHP <= 0) {
            gate.isOpen = true; // destroyed = open
        }

        let yStart = (gate.side === "north") ? startY : endY - wallThick + 1;
        let yEnd   = (gate.side === "north") ? startY + wallThick - 1 : endY;

        for (let x = midX - gateRadius; x <= midX + gateRadius; x++) {
            for (let y = yStart; y <= yEnd; y++) {

                let isEdgePillar = Math.abs(x - midX) === gateRadius;

                if (isEdgePillar) {
                    grid[x][y] = 6; // always solid pillar
                    continue;
                }

// --- SURGERY: Deep Carve Logic ---
                // If gate is dead or open, we carve a deep path (y-2 to y+2) 
                // to make sure the "outer wall" collision is also deleted.
                if (gate.isOpen || gate.gateHP <= 0) {
                    for(let depth = -2; depth <= 2; depth++) {
                        if(grid[x] && grid[x][y + depth] !== undefined) {
                            grid[x][y + depth] = 1; 
                        }
                    }
                } else {
                    grid[x][y] = 6; // Still solid stone
                }
            }
        }
    }
}
 
 // ============================================================================
// STATIC GATE FOUNDATION (Background & Grid Setup)
// ============================================================================
function drawCityGateBlock(ctx, grid, gate, arch, midX, gateRadius, startY, endY, wallThick) {
    let yStart = (gate.side === "north") ? startY : endY - wallThick + 1;
    let yEnd = (gate.side === "north") ? startY + wallThick - 1 : endY;

    for (let x = midX - gateRadius; x <= midX + gateRadius; x++) {
        for (let y = yStart; y <= yEnd; y++) {
            if (!grid[x] || grid[x][y] === undefined) continue;

            let isEdgePillar = Math.abs(x - midX) === gateRadius;
            if (isEdgePillar) {
                grid[x][y] = 6; // Solid Stone Pillar
                // Paint pillars only
                ctx.fillStyle = arch.walls[0] || "#5c4033";
                ctx.fillRect(x * CITY_TILE_SIZE, y * CITY_TILE_SIZE, CITY_TILE_SIZE, CITY_TILE_SIZE);
            } else {
                grid[x][y] = 1; // Mark as Walkable Road (Transparent on background)
                // We DRAW NOTHING here. This keeps it transparent for the dynamic gate.
            }
        }
    }
}


 // ============================================================================
// ISOMETRIC BIRD'S-EYE TOWER RENDERER (2.5D)
// Call this in your main loop right after renderDynamicGates(ctx)
// ============================================================================

function _drawTowerRubble(ctx, tower) {
    let { tX, tY, newSize } = tower;
    let cx = tX + newSize / 2, cy = tY + newSize / 2;

    // --- 1. DETERMINISTIC RANDOM HELPER ---
    // Ensures the rubble looks identical every frame, preventing visual "flickering"
    let s = (tower.tX * 7 + tower.tY * 13);
    function rand() { 
        s = (s * 9301 + 49297) % 233280; 
        return s / 233280; 
    }

    // --- 2. EXTRACT FACTION ROOF COLOR ---
    // We grab the exact roof color used by the active city to color the shattered tiles
    let rColor = "#2c5f4b"; // Fallback color
    let faction = "Hong Dynasty";
    if (typeof currentActiveCityFaction !== 'undefined' && currentActiveCityFaction) {
        faction = currentActiveCityFaction;
    } else if (typeof cityDimensions !== 'undefined' && Object.keys(cityDimensions).length > 0) {
        faction = Object.keys(cityDimensions)[0];
    }
    
    if (typeof ARCHITECTURE !== 'undefined' && ARCHITECTURE[faction] && ARCHITECTURE[faction].roofs) {
        rColor = ARCHITECTURE[faction].roofs[0];
    }

    // --- 3. MASSIVE SCORCH MARKS ---
    // Deep, layered burns where the foundation collapsed
    ctx.fillStyle = "rgba(15, 10, 5, 0.85)";
    ctx.beginPath(); ctx.ellipse(cx, cy, newSize * 0.65, newSize * 0.50, 0, 0, Math.PI * 2); ctx.fill();
    
    ctx.fillStyle = "rgba(30, 15, 10, 0.65)";
    ctx.beginPath(); 
    ctx.ellipse(cx + (rand()-0.5)*10, cy + (rand()-0.5)*10, newSize * 0.45, newSize * 0.35, rand()*Math.PI, 0, Math.PI * 2); 
    ctx.fill();

    // --- 4. DEBRIS GENERATION ENGINE ---
    function drawDebrisLayer(count, colors, maxDist, minW, maxW, minH, maxH) {
        for (let i = 0; i < count; i++) {
            let angle = rand() * Math.PI * 2;
            // Heavily concentrate debris in the center, sparse on the edges
            let dist = rand() * maxDist * (rand() > 0.4 ? 0.4 : 1.0); 
            let x = cx + Math.cos(angle) * dist;
            let y = cy + Math.sin(angle) * dist;
            let rot = rand() * Math.PI;
            
            let w = minW + rand() * (maxW - minW);
            let h = minH + rand() * (maxH - minH);

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rot);
            ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
            ctx.fillRect(-w/2, -h/2, w, h);
            ctx.restore();
        }
    }

    // A. Shattered Hardwood Platform (Dark brown structural beams)
    // 40 pieces of heavy, long wood splinters
    drawDebrisLayer(40, ["#3e2723", "#2a1b16", "#1a0b06", "#4e342e"], newSize * 0.75, 4, 18, 2, 5);

    // B. Crumbled Plaster Walls (Beige & light grey dust/chunks)
    // 60 pieces of square-ish wall chunks
    drawDebrisLayer(60, ["#d1bfae", "#bcaaa4", "#8d6e63", "#a1887f", "rgba(209, 191, 174, 0.5)"], newSize * 0.65, 3, 9, 3, 9);

    // C. Snapped Red Lacquer Pillars (Signature architectural trim)
    // 20 sharp, thin red splinters
    drawDebrisLayer(20, ["#8b2522", "#5c1412", "#3a0c0b"], newSize * 0.70, 6, 15, 1.5, 3);

    // D. Obliterated Roof Tiles (Matches the faction's roof color!)
    // 120 tiny, scattered tile shards layered on top
    drawDebrisLayer(120, [rColor, "rgba(20,20,20,0.8)", rColor, "rgba(50,50,50,0.6)"], newSize * 0.60, 2, 5, 2, 5);

    // --- 5. SMOLDERING EMBERS ---
    // Tiny glowing orange/red dots scattered near the center of the wreckage
    for(let i = 0; i < 35; i++) {
        let angle = rand() * Math.PI * 2;
        let dist = rand() * newSize * 0.45;
        let isHot = rand() > 0.6;
        
        ctx.fillStyle = isHot ? "rgba(255, 120, 0, 0.9)" : "rgba(200, 40, 0, 0.7)";
        let eSize = isHot ? 1.5 : 2;
        ctx.fillRect(cx + Math.cos(angle)*dist, cy + Math.sin(angle)*dist, eSize, eSize);
    }
}

function renderDynamicTowers(ctx) {
    if (!window.cityTowerPositions) return;

    for (let tower of window.cityTowerPositions) {
        let { tX, tY, newSize, hp } = tower;

        if (hp <= 0) {
            _drawTowerRubble(ctx, tower);
            continue;
        }

      // --- 3D EXTRUSION PARAMETERS ---
        let zBase = 22; // Height of the hardwood platform
        
        // --- 1. HARDWOOD PLATFORM (Base) ---
        // Top Face (shifted UP by zBase)
        ctx.fillStyle = "#5d4037"; // Primary Hardwood
        ctx.fillRect(tX, tY - zBase, newSize, newSize);
        
        // Front Face (Connects Top Face down to the ground footprint)
        ctx.fillStyle = "#3e2723"; // Darker hardwood for depth
        ctx.fillRect(tX, tY + newSize - zBase, newSize, zBase);
        
        // Parapet Floor (Inside the Top Face)
        let pRing = 6;
        ctx.fillStyle = "#2a1b16"; // Deep dark wood floor
        ctx.fillRect(tX + pRing, tY - zBase + pRing, newSize - pRing*2, newSize - pRing*2);

        // Crenellations around top edge (Now Hardwood)
        ctx.fillStyle = "#5d4037";
        let crenW = 8, crenGap = 6;
        for (let i = 0; i < newSize; i += crenW + crenGap) {
            ctx.fillRect(tX + i, tY - zBase - 4, crenW, 4); // Top edge
            ctx.fillRect(tX + i, tY + newSize - zBase, crenW, 4); // Front lip
            ctx.fillRect(tX - 4, tY - zBase + i, 4, crenW); // Left edge
            ctx.fillRect(tX + newSize, tY - zBase + i, 4, crenW); // Right edge
        }

        // --- 2. WOODEN PAVILION ---
        let pavSize = newSize * 0.55;
        let pavX = tX + (newSize - pavSize) / 2;
        let pavY = tY - zBase + (newSize - pavSize) / 2; // Base Y for pavilion
        let pavH = 20; // Extrusion height for wood walls

        // Top Face of Pavilion
        ctx.fillStyle = "#3e2723"; // Wood roof base
        ctx.fillRect(pavX, pavY - pavH, pavSize, pavSize);
        
        // Front Face of Pavilion
        ctx.fillStyle = "#d1bfae"; // Light beige plaster walls
        ctx.fillRect(pavX, pavY + pavSize - pavH, pavSize, pavH);

        // Red Pillars and Trim
        ctx.fillStyle = "#8b2522"; // Lacquer red
        let pillarW = 4;
        ctx.fillRect(pavX, pavY + pavSize - pavH, pillarW, pavH); // Left
        ctx.fillRect(pavX + pavSize - pillarW, pavY + pavSize - pavH, pillarW, pavH); // Right
        ctx.fillRect(pavX, pavY - pavH, pavSize, pillarW); // Top Trim
        
        // Dark Archway/Door
        ctx.fillStyle = "#2a1615"; 
        let doorW = 14, doorH = 12;
        ctx.beginPath();
        ctx.arc(pavX + pavSize/2, pavY + pavSize - doorH, doorW/2, Math.PI, 0);
        ctx.lineTo(pavX + pavSize/2 + doorW/2, pavY + pavSize);
        ctx.lineTo(pavX + pavSize/2 - doorW/2, pavY + pavSize);
        ctx.fill();

        // --- 3. FACTION-COLORED SWEEPING ROOF ---
        let roofOv = 10; // Overhang
        let rX = pavX - roofOv;
        let rY = pavY - pavH - roofOv;
        let rSize = pavSize + roofOv*2;
        
        let roofTopW = rSize * 0.35; // Apex width
        let rtX = rX + (rSize - roofTopW) / 2;
        let rtY = rY + (rSize - roofTopW) / 2;
        
        // Roof Drop Shadow
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(pavX - 5, pavY - pavH + 5, pavSize + 10, pavSize + 10);

        // Dynamically grab faction
        let faction = "Hong Dynasty"; 
        if (typeof currentActiveCityFaction !== 'undefined' && currentActiveCityFaction) {
            faction = currentActiveCityFaction;
        } else if (typeof cityDimensions !== 'undefined' && Object.keys(cityDimensions).length > 0) {
            faction = Object.keys(cityDimensions)[0]; 
        }

        let rColors = ["#2c5f4b", "#34725a", "#173328", "#1e4234"]; 
        if (typeof ARCHITECTURE !== 'undefined' && ARCHITECTURE[faction] && ARCHITECTURE[faction].roofs) {
            let archRoofs = ARCHITECTURE[faction].roofs;
            rColors = [
                archRoofs[0], 
                archRoofs[1] || archRoofs[0], 
                archRoofs[2] || archRoofs[0], 
                archRoofs[3] || archRoofs[0] 
            ];
        }

        // --- UNIFIED ROOF COLOUR (All sides use rColors[0]) ---
        ctx.fillStyle = rColors[0];

        // Front Slope
        ctx.beginPath();
        ctx.moveTo(rX, rY + rSize); ctx.lineTo(rX + rSize, rY + rSize);
        ctx.lineTo(rtX + roofTopW, rtY + roofTopW); ctx.lineTo(rtX, rtY + roofTopW);
        ctx.fill();
        
        // Back Slope
        ctx.beginPath();
        ctx.moveTo(rX, rY); ctx.lineTo(rtX, rtY);
        ctx.lineTo(rtX + roofTopW, rtY); ctx.lineTo(rX + rSize, rY);
        ctx.fill();

        // Left Slope
        ctx.beginPath();
        ctx.moveTo(rX, rY); ctx.lineTo(rX, rY + rSize);
        ctx.lineTo(rtX, rtY + roofTopW); ctx.lineTo(rtX, rtY);
        ctx.fill();

        // Right Slope
        ctx.beginPath();
        ctx.moveTo(rX + rSize, rY); ctx.lineTo(rX + rSize, rY + rSize);
        ctx.lineTo(rtX + roofTopW, rtY + roofTopW); ctx.lineTo(rtX + roofTopW, rtY);
        ctx.fill();

        // Standard structural joints (Restored original stroke logic)
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.lineWidth = 1.5;
        ctx.lineJoin = "round";
        
        // Corner diagonals
        ctx.beginPath();
        ctx.moveTo(rX, rY); ctx.lineTo(rtX, rtY);
        ctx.moveTo(rX + rSize, rY); ctx.lineTo(rtX + roofTopW, rtY);
        ctx.moveTo(rX, rY + rSize); ctx.lineTo(rtX, rtY + roofTopW);
        ctx.moveTo(rX + rSize, rY + rSize); ctx.lineTo(rtX + roofTopW, rtY + roofTopW);
        ctx.stroke();

        // Top Apex Ridge
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(rtX, rtY); ctx.lineTo(rtX + roofTopW, rtY);
	ctx.stroke();}
}

// ============================================================================
// TOWER AUTO-SHOOTING
// Call updateTowerShooting() from policeTroops() or your main battle update
// tick — it fires arrows/bolts/fire/bullets/bombs from each live tower at
// the nearest player-side unit within range.
// Requires: battleEnvironment.projectiles, window.cityTowerPositions
// ============================================================================
function updateTowerShooting() {
    if (!(typeof inSiegeBattle !== 'undefined' && inSiegeBattle)) return; // <-- HARD GUARD: Siege only!
    if (!window.cityTowerPositions) return;
    if (typeof battleEnvironment === 'undefined' || !battleEnvironment.units) return;
    if (!battleEnvironment.projectiles) battleEnvironment.projectiles = [];

    // Towers always defend for the "enemy" (city faction) side vs "player" attackers
    const targets = battleEnvironment.units.filter(u => u.hp > 0 && u.side === 'player');
    if (targets.length === 0) return;

    for (let tower of window.cityTowerPositions) {
        // Dead tower = no fire
		if ((tower.hp ?? 300) <= 0) continue;

        tower.fireCooldown = (tower.fireCooldown || 0) - 1;
        if (tower.fireCooldown > 0) continue;

// ── Find nearest target in range ────────────────────────────────
        const RANGE = 600; // ---> SURGERY: Expanded range so towers can shoot at the siege camp
        let nearest = null, nearestDist = Infinity;
        for (let t of targets) {
            let d = Math.hypot(t.x - tower.pixelX, t.y - tower.pixelY);
            if (d < RANGE && d < nearestDist) { nearestDist = d; nearest = t; }
        }

        if (!nearest) {
            tower.fireCooldown = 40;  // nothing in range, check again later
            continue;
        }

        // ── Weapon selection ────────────────────────────────────────────
        let roll = Math.random();
        let weapon, speed;

        if      (roll < 0.55) { weapon = "arrow";  speed = 12.5; }
        else if (roll < 0.78) { weapon = "bolt";   speed = 18.5; }
        else if (roll < 0.88) { weapon = "bullet"; speed = 21;  }
        else if (roll < 0.95) { weapon = "fire";   speed = 4.5; }
        else                  { weapon = "bomb";   speed = 3.8; }

// ---> NEW LIMIT: Fallback to arrows if the target is outside firelance range (100px)
        if (weapon === "bomb" && nearestDist > 150) {
            weapon = "arrow";
            speed = 12.5;
        }
		
// ---> NEW LIMIT: Fallback to arrows if the target is outside firelance range (100px)
        if (weapon === "fire" && nearestDist > 100) {
            weapon = "arrow";
            speed = 12.5;
        }
// ── Build direction vector with slight inaccuracy ────────────────
        let dx   = nearest.x - tower.pixelX;
        let dy   = nearest.y - tower.pixelY;
        let dist = Math.hypot(dx, dy) || 1;
        
        // ---> SURGERY: Shift spawn to the outer edge of the tower parapet
        let spawnRadius = tower.newSize ? (tower.newSize / 2) * 0.8 : 25; 
        let spawnX = tower.pixelX + (dx / dist) * spawnRadius;
        let spawnY = tower.pixelY + (dy / dist) * spawnRadius;

        let spread = 0.055;
        let vx = (dx / dist) * speed + (Math.random() - 0.5) * spread * speed * 2;
        let vy = (dy / dist) * speed + (Math.random() - 0.5) * spread * speed * 2;

        // ── Fake attacker-stats object (drives projectile visuals & damage) ─
        let attackerStats = {
            role:              weapon === "bolt"   ? "crossbow"
                             : weapon === "bullet" ? "gunner"
                             : weapon === "bomb"   ? "bomb"
                             :                       "archer",
            name:              weapon === "bolt"   ? "Crossbowman"
                             : weapon === "bullet" ? "Hand Cannoneer"
                             : weapon === "fire"   ? "Firelance"
                             : weapon === "bomb"   ? "Bomb"
                             :                       "Archer",
            missileBaseDamage: weapon === "bomb"   ? 45
                             : weapon === "bullet" ? 28
                             : weapon === "fire"   ? 20
                             :                       14,
            missileAPDamage:   weapon === "bullet" ? 8 : 4,
            armor: 0,
            // Needed by calculateDamageReceived so it doesn't NaN
            meleeAttack: 10, meleeDefense: 5,
        };

        // ── Push projectile ─────────────────────────────────────────────
        battleEnvironment.projectiles.push({
            x: spawnX, y: spawnY, // <--- Now spawns at the calculated edge
            vx, vy,
            side:      'enemy',          // towers defend vs player
            startX:    spawnX, startY: spawnY, // <--- Corrected origin tracking
            maxRange:  weapon === "fire" ? 100 : RANGE + 40, 
            attackerStats,
            fromTower: true,
            // Fire-lance / bomb flags that the projectile renderer reads:
            isFire:         weapon === "fire",
            projectileType: weapon === "fire" ? "firelance"
                          : weapon === "bomb" ? "bomb"
                          : null,
            type:           weapon === "bomb"   ? "bomb"
                          : weapon === "rocket" ? "rocket"
                          : null,
        });

        // ── Reload cooldown ─────────────────────────────────────────────
        tower.fireCooldown = weapon === "bomb"   ? 400 + Math.random() * 90//disabled
                           : weapon === "fire"   ? 200 + Math.random() * 30
                           : weapon === "bullet" ? 130 + Math.random() * 50
                           : weapon === "bolt"   ?  80 + Math.random() * 10
                           :                        55 + Math.random() * 35;
    }
}