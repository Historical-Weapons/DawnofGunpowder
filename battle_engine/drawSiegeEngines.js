
function drawSiegeCrewman(ctx, x, y, factionColor, facing = 1, pose = 0) {
    ctx.save();
    ctx.translate(x, y);
    
    // Flip the crewman 180 degrees to face the machine
    ctx.rotate(Math.PI);
    ctx.scale(facing, 1);

    const bob = Math.sin(Date.now() / 180 + x * 0.05) * 0.5;
    const legSwing = Math.sin(Date.now() / 240 + x * 0.03) * 0.6;

    // 1. LEGS
    ctx.strokeStyle = "#3e2723";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(-3 - legSwing, 9);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.lineTo(3 + legSwing, 9);
    ctx.stroke();

    ctx.translate(0, -bob);

    // 2. BASE TUNIC
    ctx.fillStyle = factionColor;
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(5, 0);
    ctx.lineTo(3.5, -10);
    ctx.lineTo(-3.5, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 3. CHEAP LEATHER VEST
    ctx.fillStyle = "#5d4037"; // Dark "Boiled Leather" Brown
    ctx.fillRect(-3.5, -9, 7, 7);
    
    // Simple stitching/leather panels
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 0.5;
    // Horizontal cord lines
    ctx.beginPath(); ctx.moveTo(-3.5, -6); ctx.lineTo(3.5, -6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-3.5, -3.5); ctx.lineTo(3.5, -3.5); ctx.stroke();

    // 4. FACE & HEAD (Standard skin tone)
    ctx.fillStyle = "#ffdbac"; // Matching standard unit skin color
    ctx.beginPath();
    ctx.arc(0, -13, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // Sparse black hair/shadow under helmet
    ctx.fillStyle = "#212121";
    ctx.beginPath();
    ctx.arc(0, -13.5, 3.4, Math.PI, 0);
    ctx.fill();

    // 5. LEATHER HELMET (Conical Cap)
    ctx.fillStyle = "#795548"; // Slightly lighter leather for contrast
    ctx.beginPath();
    ctx.moveTo(-4, -13);
    ctx.quadraticCurveTo(0, -20, 4, -13);
    ctx.fill();
    
    // Leather rim/binding
    ctx.strokeStyle = "#3e2723";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-4, -13); ctx.lineTo(4, -13); ctx.stroke();

    // 6. ARMS
    ctx.strokeStyle = "#3e2723";
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.beginPath();

    if (pose > 0.55) {
        // Reloading/Pulling pose
        ctx.moveTo(-2, -4);
        ctx.lineTo(-8, -1);
        ctx.moveTo(2, -4);
        ctx.lineTo(8, -7);
    } else {
        // Ready/Resting pose
        ctx.moveTo(-2, -4);
        ctx.lineTo(-7, -7);
        ctx.moveTo(2, -4);
        ctx.lineTo(8, -2);
    }

    ctx.stroke();
    ctx.restore();
}

function renderSiegeEngines(ctx) {
    if (!inSiegeBattle) return;

siegeEquipment.mantlets.forEach(m => {
    if (m.hp <= 0) {
        // --- DESTROYED MANTLET RUBBLE --- splintered planks lying flat
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.fillStyle = "rgba(0,0,0,0.40)";
        ctx.fillRect(-28, -8, 56, 18);
        // Plank fragments at slight angles
        ctx.fillStyle = "#2a1b16";
        ctx.save(); ctx.rotate(-0.15); ctx.fillRect(-26, -4, 14, 5); ctx.restore();
        ctx.save(); ctx.rotate(0.20);  ctx.fillRect(-2, -3, 16, 4);  ctx.restore();
        ctx.save(); ctx.rotate(-0.10); ctx.fillRect(10, -2, 12, 4);  ctx.restore();
        // Iron band fragment
        ctx.fillStyle = "#1a1a1a";
        ctx.save(); ctx.rotate(0.05); ctx.fillRect(-20, 3, 28, 2); ctx.restore();
        ctx.restore();
        return;
    }
    ctx.save();
    ctx.translate(m.x, m.y);

    // 1. REAR SUPPORT STRUCTURE (The "Kickstand")
    // These are the legs that prop the shield up
    ctx.fillStyle = "#2a1b16";
    ctx.fillRect(-18, 2, 4, 15); // Left strut
    ctx.fillRect(14, 2, 4, 15);  // Right strut
    // Cross-brace for the legs
    ctx.fillRect(-18, 12, 36, 3);

    // 2. THE MAIN SHIELD PLATE (Pavise)
    // We draw this with a slight gradient or layering to show it's slanted
    
    // Base Wood (Darker)
    ctx.fillStyle = "#4e342e";
    ctx.fillRect(-25, -5, 50, 12); 

    // Individual Vertical Planks (Adding texture)
    ctx.strokeStyle = "#3e2723";
    ctx.lineWidth = 1;
    for (let px = -25; px < 25; px += 5) {
        ctx.strokeRect(px, -5, 5, 12);
    }

    // 3. FRONT REINFORCEMENT (Heavy Iron Bands)
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(-26, -3, 52, 2); // Top band
    ctx.fillRect(-26, 4, 52, 2);  // Bottom band

    // Iron Studs (Rivets)
    ctx.fillStyle = "#757575";
    for (let sx = -22; sx <= 22; sx += 11) {
        ctx.beginPath();
        ctx.arc(sx, -2, 1.2, 0, Math.PI * 2);
        ctx.arc(sx, 5, 1.2, 0, Math.PI * 2);
        ctx.fill();
    }

    // 4. THE VIEWING SLIT (The Archery Port)
    // A dark narrow gap in the center of the shield
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(-6, -1, 12, 3);
    
    // 5. TOP EDGE SHADOW
    // Gives it a birds-eye "thickness" look
    ctx.fillStyle = "#5d4037";
    ctx.fillRect(-25, -7, 50, 2);

    ctx.restore();
});
// ============================================================================
// B. LADDER ASSAULT LOGIC -> SIEGE TOWER CONVERSION (BIRDS EYE)
// ============================================================================
// In processSiegeEngines(), targetPixelY is wallPixelY + 15.
 
siegeEquipment.ladders.forEach(l => {
    if (l.hp <= 0) {
// --- DESTROYED LADDERTOWER (MATCHES ORIGINAL GEOMETRY) ---
        ctx.save();
        ctx.translate(l.x, l.y);
        
        // Use a simple seed so the "random" cracks don't flicker every frame
        const seed = Math.floor(l.x + l.y); 

        // 1. WHEELS (Charred black)
        ctx.fillStyle = "#050505";
        ctx.fillRect(-29, -30, 6, 15); // FL
        if (seed % 2 === 0) ctx.fillRect(23, -30, 6, 15); // FR (50% chance wheel is "gone")
        ctx.fillRect(-29, 20, 6, 15);  // BL
        ctx.fillRect(23, 20, 6, 15);   // BR

        // 2. CHASSIS (Deep Burnt Umber/Ashed)
        ctx.fillStyle = "#1a120f";
        ctx.fillRect(-26, -45, 52, 90);

        // 3. LAYERED SHIELD WALLS (Ashed & Cracked)
        ctx.fillStyle = "#3d322d"; // Weathered/Gray wood
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1;

        for (let fx = -22; fx <= 22; fx += 8) {
            // Randomly skip a shield to show a gap from impact
            if ((seed + fx) % 7 === 0) continue; 

            let sx = fx - 4;
            let sy = -47;
            let offY = Math.abs(fx % 16) === 0 ? 0 : 2; 

            ctx.beginPath();
            ctx.moveTo(sx, sy + offY);
            ctx.quadraticCurveTo(sx + 4, sy + offY - 3, sx + 8, sy + offY);
            ctx.lineTo(sx + 8, sy + offY + 10);
            ctx.lineTo(sx, sy + offY + 10);
            ctx.fill();
            ctx.stroke();

            // --- ADD CRACK ---
            ctx.beginPath();
            ctx.strokeStyle = "#1a1a1a";
            ctx.moveTo(sx + 2, sy + offY + 2);
            ctx.lineTo(sx + 6, sy + offY + 8);
            ctx.stroke();
        }

        // 4. SIDE WALLS (Darker, with jagged gaps)
        ctx.fillStyle = "#2f2622";
        // Left wall with a chunk missing
        ctx.fillRect(-26, -45, 10, 40);
        ctx.fillRect(-26, 5, 10, 40); 
        // Right wall
        ctx.fillRect(16, -45, 10, 90);

        // 5. TOP DECK (Charred Interior)
        ctx.fillStyle = "#140e0c"; 
        ctx.fillRect(-16, -35, 32, 70);

        // Deck Planks (Damaged mirror of original loop)
        ctx.strokeStyle = "#000000";
        ctx.fillStyle = "#3d322d";
        for(let px = -12; px <= 12; px += 8) {
            // Make some planks shorter or "snapped"
            let snappedHeight = (seed + px) % 5 === 0 ? 30 : 65;
            
            ctx.fillRect(px - 4, -30, 8, snappedHeight);
            ctx.strokeRect(px - 4, -30, 8, snappedHeight);

            // Grain/Crack lines for the "Older Wood" look
            ctx.beginPath();
            ctx.lineWidth = 0.5;
            ctx.moveTo(px, -25);
            ctx.lineTo(px - 2, 0);
            ctx.stroke();
        }

        ctx.restore();
        return;
    }
    ctx.save();
    ctx.translate(l.x, l.y);
    // --- SIEGE TOWER (BIRDS-EYE) ---
    // Length: 90 (1.5x), Width: 52 
    const isMoving = !l.isDeployed;

    // 1. WHEELS (Hidden under the chassis shadow)
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(-29, -30, 6, 15); // FL
    ctx.fillRect(23, -30, 6, 15);  // FR
    ctx.fillRect(-29, 20, 6, 15);   // BL
    ctx.fillRect(23, 20, 6, 15);   // BR

    // 2. CHASSIS & ENCLOSURE
    // Base shadow implies people are inside pushing
    ctx.fillStyle = "#2a1b16";
    ctx.fillRect(-26, -45, 52, 90);

    // 3. LAYERED SHIELD WALLS (Perimeter)
    ctx.fillStyle = "#6b4c3a";
    ctx.strokeStyle = "#3e2723";
    ctx.lineWidth = 1;

    // Front shield wall top-down view
    for (let fx = -22; fx <= 22; fx += 8) {
        let sx = fx - 4;
        let sy = -47;
        let offY = Math.abs(fx % 16) === 0 ? 0 : 2; 
        ctx.beginPath();
        ctx.moveTo(sx, sy + offY);
        ctx.quadraticCurveTo(sx + 4, sy + offY - 3, sx + 8, sy + offY);
        ctx.lineTo(sx + 8, sy + offY + 10);
        ctx.lineTo(sx, sy + offY + 10);
        ctx.fill();
        ctx.stroke();
    }

    // Side Walls (Structure edges)
    ctx.fillStyle = "#5d4037";
    ctx.fillRect(-26, -45, 10, 90); // Left
    ctx.fillRect(16, -45, 10, 90);  // Right

    // 4. TOP DECK (Where the ramp is anchored)
    ctx.fillStyle = "#2a1b16"; // Dark interior floor
    ctx.fillRect(-16, -35, 32, 70);

    // Deck Planks (Inspired by the Ram's roof)
    ctx.strokeStyle = "#2a1b16";
    ctx.fillStyle = "#5d4037";
    for(let px = -12; px <= 12; px += 8) {
        ctx.fillRect(px - 4, -30, 8, 65);
        ctx.strokeRect(px - 4, -30, 8, 65);
    }

    // 5. DEPLOYMENT LOGIC
    if (l.isDeployed) {
        ctx.save();
        ctx.translate(0, -45); // Move to the front edge to drop the ramp
// DRAWBRIDGE / DOOR
ctx.fillStyle = "#4e342e";
ctx.strokeStyle = "#3e2723";
ctx.lineWidth = 2;

// 80% of the old height: 50 -> 40
ctx.fillRect(-18, -50, 36, 40);
ctx.strokeRect(-18, -50, 36, 40);

// Wooden plank look, no stair/rung feel
ctx.strokeStyle = "#6b4c3a";
for (let x = -14; x <= 14; x += 7) {
    ctx.beginPath();
    ctx.moveTo(x, -48);
    ctx.lineTo(x, -12);
    ctx.stroke();
}

// Top/bottom trim to make it read like a door
ctx.fillStyle = "#3e2723";
ctx.fillRect(-18, -50, 36, 3);
ctx.fillRect(-18, -13, 36, 3);

        // --- THE STRINGS (CHAINS) ---
        ctx.restore(); 
        
        ctx.strokeStyle = "#999999"; 
        ctx.lineWidth = 1;
        ctx.beginPath();
        
        // Left Chain
        ctx.moveTo(-18, 20);  
        ctx.lineTo(-18, -95); // Adjusted for the extra 20px length
        
        // Right Chain
        ctx.moveTo(18, 20);   
        ctx.lineTo(18, -95);
        ctx.stroke();
    } else {
        // MOVING STATE: 
        // No strings drawn here. 
        // Just the top front crossbeam to show the "hatch" is closed.
        ctx.fillStyle = "#3e2723";
        ctx.fillRect(-18, -45, 36, 4);
    }

    ctx.restore();
});

siegeEquipment.rams.forEach(r => {
        ctx.save();
        ctx.translate(r.x, r.y);

// --- 1. THE RUBBLE (MATCHES ORIGINAL GEOMETRY) ---
        if (r.hp <= 0) {
            const seed = Math.floor(r.x + r.y);

            // 1. WHEELS (Charred/Sooty)
            ctx.fillStyle = "#050505";
            ctx.fillRect(-26, -20, 6, 12); // FL
            ctx.fillRect(20, -20, 6, 12);  // FR
            if (seed % 3 !== 0) ctx.fillRect(-26, 15, 6, 12); // BL (Sometimes missing)
            ctx.fillRect(20, 15, 6, 12);   // BR

            // 2. THE FALLEN LOG (Fallen out of the chassis)
            ctx.save();
            ctx.translate(5, 10); // Shifted position to look dislodged
            ctx.rotate(0.15); 
            ctx.fillStyle = "#111111"; // Burnt Iron
            ctx.fillRect(-6, -45, 12, 15);
            ctx.fillStyle = "#1a120f"; // Charred Trunk
            ctx.fillRect(-4, -30, 8, 55); 
            ctx.restore();

            // 3. THE PROTECTED ROOF (Ashed & Cracked)
            // Base shadow interior
            ctx.fillStyle = "#140e0c";
            ctx.fillRect(-22, -28, 44, 60);

            // Layered planks (Mirrored from original but with gaps)
            ctx.fillStyle = "#3d322d"; // Ashed wood
            if (seed % 2 === 0) ctx.fillRect(-22, -26, 10, 56); // Left edge
            ctx.fillRect(12, -26, 10, 56);  // Right edge
            
            ctx.fillStyle = "#2f2622"; // Deep charred wood
            ctx.fillRect(-12, -26, 10, 56); // Mid left
            ctx.fillRect(2, -26, 10, 56);   // Mid right

            // Ridge beam (The central spine)
            ctx.fillStyle = "#1a120f";
            ctx.fillRect(-4, -28, 8, 60);

            // 4. THE FRONT SHIELD (Broken Mantlet)
            ctx.save();
            ctx.translate(0, -32); // Slightly slumped down
            ctx.rotate(-0.05);

            // Shield backplate
            ctx.fillStyle = "#140e0c";
            ctx.beginPath();
            ctx.moveTo(-30, -8); ctx.lineTo(30, -8);
            ctx.lineTo(24, 6); ctx.lineTo(-24, 6);
            ctx.fill();

            // Individual planks with "cracks"
            ctx.fillStyle = "#3d322d";
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = 1;
            for (let w = -24; w <= 24; w += 8) {
                if ((seed + w) % 5 === 0) continue; // Random missing plank
                ctx.fillRect(w - 4, -6, 8, 10);
                ctx.strokeRect(w - 4, -6, 8, 10);
                
                // Add a small crack line on surviving planks
                ctx.beginPath();
                ctx.moveTo(w, -2); ctx.lineTo(w + (w > 0 ? 2 : -2), 4);
                ctx.stroke();
            }

            // Burnt iron reinforcement
            ctx.fillStyle = "#050505";
            ctx.fillRect(-26, -2, 40, 3); // Part of the band is "melted/broken"
            ctx.restore();

 
            ctx.restore();
            return; 
        }

// 477 creates a full cycle every 3 seconds
let cycle = Math.sin(Date.now() / 477); 

// Raising to the power of 9 makes the 'wait' even longer/flatter
// We use Math.max(0, ...) so it only lunges forward and doesn't pull back into the roof
let lunge = r.isBreaking ? Math.max(0, Math.pow(cycle, 9)) * 25 : 0;
        // 1. WHEELS (Base layer)
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(-26, -20, 6, 12); // Front Left
        ctx.fillRect(20, -20, 6, 12);  // Front Right
        ctx.fillRect(-26, 15, 6, 12);  // Back Left
        ctx.fillRect(20, 15, 6, 12);   // Back Right

        // 2. THE BATTERING LOG (Extends out the front and swings)
        // Iron head
        ctx.fillStyle = "#212121"; 
        ctx.fillRect(-6, -45 + lunge, 12, 15);
        // Wooden trunk
        ctx.fillStyle = "#4e342e"; 
        ctx.fillRect(-4, -30 + lunge, 8, 55); 

        // 3. THE PROTECTED ROOF / ARCH (Implies an enclosed chassis for units)
        // Base dark shadow of the interior
        ctx.fillStyle = "#2a1b16";
        ctx.fillRect(-22, -28, 44, 60);

        // Layered wooden pitched roof
        // Outer lower planks
        ctx.fillStyle = "#5d4037";
        ctx.fillRect(-22, -26, 10, 56); // Left edge
        ctx.fillRect(12, -26, 10, 56);  // Right edge
        
        // Inner upper planks (creating the arch depth)
        ctx.fillStyle = "#4e342e";
        ctx.fillRect(-12, -26, 10, 56); // Mid left
        ctx.fillRect(2, -26, 10, 56);   // Mid right

        // Central heavy ridge beam (spine of the roof)
        ctx.fillStyle = "#3e2723";
        ctx.fillRect(-4, -28, 8, 60);

        // Heavy horizontal crossbeams holding the roof together
        ctx.fillStyle = "#2a1b16";
        ctx.fillRect(-23, -15, 46, 4);
        ctx.fillRect(-23, 15, 46, 4);

        // 4. THE LAYERED WOODEN SHIELD (Front Mantlet)
        // Drawn slightly elevated and angled at the front of the chassis
        ctx.save();
        ctx.translate(0, -35);
        
        // Shield backplate shadow
        ctx.fillStyle = "#2a1b16";
        ctx.beginPath();
        ctx.moveTo(-30, -8);
        ctx.lineTo(30, -8);
        ctx.lineTo(24, 6);
        ctx.lineTo(-24, 6);
        ctx.fill();

        // Interlayers of wood (Distinct vertical planks)
        ctx.fillStyle = "#6b4c3a";
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#3e2723"; // Dark lines separating planks
        
        for (let w = -24; w <= 24; w += 8) {
            // Draw each plank and outline it for that layered texture
            ctx.fillRect(w - 4, -6, 8, 10);
            ctx.strokeRect(w - 4, -6, 8, 10);
        }

        // Heavy iron reinforcement band binding the shield planks
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(-26, -2, 52, 3);
        
        // Iron studs riveted into the reinforcement band
        ctx.fillStyle = "#757575";
        for (let s = -22; s <= 22; s += 11) {
            ctx.beginPath();
            ctx.arc(s, -0.5, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore(); // Restore from shield offset

        ctx.restore(); // Restore main ram coordinates
    });
         
siegeEquipment.trebuchets.forEach(t => {
    if (t.hp <= 0) {
        // --- DESTROYED TREBUCHET RUBBLE ---
        ctx.save();
        ctx.translate(t.x, t.y);
        if (t.side === "enemy") ctx.rotate(Math.PI);
        // Ash ground stain
        ctx.fillStyle = "rgba(0,0,0,0.10)";
        ctx.beginPath(); ctx.ellipse(0, 10, 22, 40, 0, 0, Math.PI * 2); ctx.fill();
        // Snapped left base rail
        ctx.save();
        ctx.rotate(-0.25);
        ctx.fillStyle = "#2a1b16";
        ctx.fillRect(-15, -30, 6, 50);
        ctx.restore();
        // Snapped right base rail
        ctx.save();
        ctx.rotate(0.20);
        ctx.fillStyle = "#2a1b16";
        ctx.fillRect(9, -25, 6, 45);
        ctx.restore();
        // Fallen throwing arm (collapsed sideways)
        ctx.save();
        ctx.rotate(-0.6);
        ctx.fillStyle = "#3e2723";
        ctx.fillRect(-3, -40, 6, 55);
        // Iron bands still clinging to the broken arm
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(-2.5, -25, 5, 2);
        ctx.fillRect(-2, -35, 4, 2);
        ctx.restore();
        // Smouldering embers
        ctx.fillStyle = "rgba(200,60,10,0.5)";
        ctx.fillRect(-8, -5, 4, 4);
        ctx.fillRect(12, 10, 3, 3);
        ctx.restore();
        return;
    }
    ctx.save();
    ctx.translate(t.x, t.y);

// ---> SURGERY: FLIP 180 DEGREES FOR ENEMY <---
    // This perfectly inverts the local space, making them face and fire South
    if (t.side === "enemy") {
        ctx.rotate(Math.PI);
    }

    // ==========================================
    // 1. BASE FRAME (Realistic Top-Down Chassis)
    // ==========================================
    
    // Heavy Ground Rails
    ctx.fillStyle = "#3e2723";
    ctx.fillRect(-15, -30, 6, 65); // Left rail
    ctx.fillRect(9, -30, 6, 65);   // Right rail
    
    // Crossbeams securing the base to the ground
    ctx.fillStyle = "#2a1b16";
    ctx.fillRect(-15, -25, 30, 5); // Front crossbeam
    ctx.fillRect(-15, 25, 30, 5);  // Rear crossbeam

    // Heavy A-Frame Supports (Tapering up to the axle)
    ctx.fillStyle = "#4e342e";
    ctx.beginPath();
    ctx.moveTo(-15, -10); ctx.lineTo(-15, 10); ctx.lineTo(-8, 5); ctx.lineTo(-8, -5); ctx.fill(); // Left
    ctx.beginPath();
    ctx.moveTo(15, -10); ctx.lineTo(15, 10); ctx.lineTo(8, 5); ctx.lineTo(8, -5); ctx.fill();     // Right

    // Central Iron Axle
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(-18, -3, 36, 6);

    // ==========================================
    // 2. ANIMATION STATE LOGIC
    // ==========================================
    const fireAnimDuration = 15; // Frames the throw animation takes
    let isFiring = t.cooldown > (t.fireRate - fireAnimDuration);
    
    // Interpolate progress from 0.0 (loaded) to 1.0 (fired)
    let throwPhase = 0;
    if (isFiring) {
        let animProgress = (t.cooldown - (t.fireRate - fireAnimDuration)) / fireAnimDuration;
        throwPhase = 1.0 - animProgress; 
    }

    // ==========================================
    // 3. ARM ROTATION
    // ==========================================
    ctx.save();
    
    // Loaded: Pointing backwards (South). Fired: Snapped forwards (North).
    let startAngle = Math.PI * 0.85; 
    let endAngle = -Math.PI * 0.1;
    
    // Ease-out formula for a snappy mechanical throw
    let easeOut = 1 - Math.pow(1 - throwPhase, 3);
    let currentAngle = startAngle + (endAngle - startAngle) * easeOut;
    
    ctx.rotate(currentAngle);

    // The Tapered Throwing Arm
    ctx.fillStyle = "#5d4037";
    ctx.beginPath();
    ctx.moveTo(-3, 15);   // Short end (traction ropes attach here)
    ctx.lineTo(3, 15);
    ctx.lineTo(1.5, -45); // Long end (sling attaches here)
    ctx.lineTo(-1.5, -45);
    ctx.fill();

    // Iron Reinforcement Bands
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(-2.5, -20, 5, 2);
    ctx.fillRect(-2, -35, 4, 2);
    
    ctx.restore(); // Revert rotation so we can draw ground objects cleanly

    // ==========================================
    // 4. THE SLING (Ground Level Physics)
    // ==========================================
    
    // Map the rotated arm tip back into absolute coordinates
    let tipX = 45 * Math.sin(currentAngle);
    let tipY = -45 * Math.cos(currentAngle);

    let pouchX, pouchY;

    if (!isFiring) {
        // LOADED: Pouch rests heavily on the ground, directly behind the treb
        pouchX = 0;
        pouchY = 55; 
    } else {
        // FIRING: Pouch whips forward past the chassis
        pouchX = tipX * 1.2; 
        pouchY = 55 - (115 * easeOut); // Arcs from +55 up to -60
    }

    // Sling Ropes (From arm tip to grounded pouch)
    ctx.strokeStyle = "#ffffff"; 
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    if (!isFiring) {
        // Slack curve resting on the dirt
        ctx.moveTo(tipX, tipY);
        ctx.quadraticCurveTo(tipX + 10, tipY + 20, pouchX, pouchY); 
    } else {
        // Taut snapping line in the air
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(pouchX, pouchY); 
    }
    ctx.stroke();

    // The Leather Pouch
    ctx.fillStyle = "#3e2723";
    ctx.beginPath();
    ctx.arc(pouchX, pouchY, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // The Boulder (Disappears right as it leaves the pouch)
    if (throwPhase < 0.8) {
        ctx.fillStyle = "#9e9e9e"; 
        ctx.beginPath();
        ctx.arc(pouchX, pouchY, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }


// ============================================================================
    // --- TRACTION CREW PULLING PORTION (NORTH END) ---
    // ============================================================================
    
    // 1. Calculate the "Short Arm" Tip
    let shortArmTipX = -tipX * 0.35;
    let shortArmTipY = -tipY * 0.35;

    // 2. REVISED DIMENSIONS: Bringing the crew back toward the chassis
    // groundY: -66 -> -36 (Closer to the machine/troops)
    let groundY = -36; 
    let ropeFannedWidth = 10; 

    // Draw the Short Arm beam extension
    ctx.strokeStyle = "#4e342e"; 
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0); 
    ctx.lineTo(shortArmTipX, shortArmTipY);
    ctx.stroke();

   // ... (Keep your Short Arm Tip and groundY logic the same)

    // Draw the Pulling Ropes
    ctx.strokeStyle = "#d7ccc8"; 
    ctx.lineWidth = 0.35; 
    
    for (let i = 0; i < 5; i++) {
        let fanX = -ropeFannedWidth / 2 + (i * (ropeFannedWidth / 4));
        
        ctx.beginPath();
        ctx.moveTo(shortArmTipX, shortArmTipY);
        
        // --- NEW: Calculate distance to prevent the "Oval Loop" ---
        let dx = fanX - shortArmTipX;
        let dy = groundY - shortArmTipY;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (!isFiring) {
            // LOADED: Saggy Logic
            let midX = (shortArmTipX + fanX) / 2;
            let midY = (shortArmTipY + groundY) / 2;
            
            // Only add sag if the rope is long enough to sag
            let sagAmount = dist > 10 ? 12 : 0; 

            ctx.quadraticCurveTo(midX, midY + sagAmount, fanX, groundY);
        } else {
            // FIRING: Tension Jitter
            // --- FIX: We scale the jitter by the distance ---
            // If dist is small (arm is passing the crew), jitter becomes 0.
            let jitterStrength = Math.min(1.5, dist / 20); 
            let jitterX = (Math.random() - 0.5) * jitterStrength;
            let jitterY = (Math.random() - 0.5) * jitterStrength;

            // If the points are extremely close, just use lineTo to avoid Bezier loops
            if (dist < 5) {
                ctx.lineTo(fanX, groundY);
            } else {
                ctx.quadraticCurveTo(
                    ((shortArmTipX + fanX) / 2) + jitterX, 
                    ((shortArmTipY + groundY) / 2) + jitterY, 
                    fanX, 
                    groundY
                );
            }
        }
        ctx.stroke();
    
    }

    // Optional: Small diegeEquipment.trebuchets.forEach(tust/tension marks at the ground points during firing
    if (isFiring && throwPhase < 0.5) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.beginPath();
        ctx.ellipse(0, groundY, 15, 5, 0, 0, Math.PI * 2);
        ctx.fill();
    }

	
// ============================================================================
    // --- 5. RENDER CREW ON TOP ---
    // ============================================================================
const trebReload = Math.max(0, 1 - (t.cooldown / t.fireRate));
const trebCrewColor = t.side === "enemy" ? "#8d6e63" : "#bca58c";
const trebCrewBob = Math.sin(Date.now() / 160 + t.x * 0.02) * 1.5;
const trebCrewShift = Math.min(8, 8 * trebReload);

 
let cy1 = -40 + trebCrewBob; 
let cy2 = -40 - trebCrewBob;
let cx1 = -8 - trebCrewShift;
let cx2 = 8 + trebCrewShift;

ctx.save();
ctx.translate(cx1, cy1);
// Keep them facing the machine
if (t.side !== "enemy") ctx.rotate(Math.PI); 
drawSiegeCrewman(ctx, 0, 0, trebCrewColor, 1, trebReload);
ctx.restore();

ctx.save();
ctx.translate(cx2, cy2);
if (t.side !== "enemy") ctx.rotate(Math.PI);
drawSiegeCrewman(ctx, 0, 0, trebCrewColor, 1, 1 - trebReload);
ctx.restore();
 
    ctx.restore();
});

// ============================================================================
// BALLISTA RENDERING (BIRDS-EYE)
// ============================================================================
siegeEquipment.ballistas.forEach(bal => {
let rotAngle = bal.aimAngle !== undefined ? bal.aimAngle + Math.PI/2 : (bal.side === "enemy" ? Math.PI : 0);

    if (bal.hp <= 0) {
        // --- DESTROYED BALLISTA RUBBLE ---
        ctx.save();
        ctx.translate(bal.x, bal.y);
        
        // ---> SURGERY: Keep the rubble rotated to where it was last aiming
        ctx.rotate(rotAngle);
        
        // Scorch mark
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        ctx.beginPath(); ctx.ellipse(0, 0, 18, 28, 0, 0, Math.PI * 2); ctx.fill();
        // Shattered central stock
        ctx.save();
        ctx.rotate(0.4);
        ctx.fillStyle = "#2a1b16";
        ctx.fillRect(-4, -20, 8, 35);
        ctx.restore();
        // Left bow limb snapped outward
        ctx.strokeStyle = "#3e2723";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.save();
        ctx.rotate(-0.3);
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-30, -18); ctx.stroke();
        ctx.restore();
        // Right bow limb snapped outward
        ctx.save();
        ctx.rotate(0.3);
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(30, -18); ctx.stroke();
        ctx.restore();
        // Dangling broken string
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(-28, -15); ctx.lineTo(-8, 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(28, -15);  ctx.lineTo(10, 5);  ctx.stroke();
        // Smouldering
        ctx.fillStyle = "rgba(200,60,10,0.45)";
        ctx.fillRect(-6, -4, 3, 3);
        ctx.fillRect(8, 5, 3, 3);
        ctx.restore();
        return;
    }
	// --- DYNAMIC CREW & MACHINE (TURRET LOGIC) ---
	
const balReload = Math.max(0, 1 - (bal.cooldown / bal.fireRate));
const balCrewColor = bal.side === "enemy" ? "#8d6e63" : "#bca58c";
    // Determine state (True if snapped forward / just fired)
    const isFired = bal.cooldown > bal.fireRate - 15;
 
ctx.save();
ctx.translate(bal.x, bal.y);
ctx.rotate(rotAngle); // Everything inside this save() now turns with the machine

// 1. THE CREWMAN (Always drawn, position shifts on fire)
// If isFired is true (the first 15 frames after shooting), he jolts back to 19
let crewYOffset = isFired ? 19 : 18; 
drawSiegeCrewman(ctx, 0, crewYOffset, balCrewColor, 1, balReload);
// --- 2. THE MACHINE BASE & STOCK (2/3 SCALED) ---
ctx.fillStyle = "#3e2723"; // Dark heavy wood base
ctx.fillRect(-10, -8, 20, 16); 

ctx.fillStyle = "#4e342e"; // Main central stock
ctx.fillRect(-4, -23, 8, 40); // Ends at Y: 17, so crewman at Y: 18 is perfect
ctx.strokeStyle = "#1a1a1a";
ctx.lineWidth = 1;
ctx.strokeRect(-4, -23, 8, 40);

// Iron mounting beams and Winch mechanism at the rear
ctx.fillStyle = "#1a1a1a";
ctx.fillRect(-9, -7, 18, 4); 
ctx.fillRect(-7, 10, 14, 5);  // Rear winch housing
ctx.fillStyle = "#5c5c5c";
ctx.fillRect(-3, 9, 6, 8);    // Spool / Latch


    // --- 1. RESILIENT SEED GENERATION FOR BALLISTA TYPE ---
    let seed = 0;
    if (bal.id !== undefined && bal.id !== null) {
        if (typeof bal.id === 'number') {
            seed = Math.abs(bal.id);
        } else if (typeof bal.id === 'string') {
            for (let i = 0; i < bal.id.length; i++) {
                seed += bal.id.charCodeAt(i);
            }
        }
    } else {
        // Fallback permanent random seed to prevent flickering
        if (typeof bal._typeSeed === 'undefined') {
            bal._typeSeed = Math.floor(Math.random() * 1000);
        }
        seed = bal._typeSeed;
    }

    const availableTypes = ["single", "double", "m-type", "d-type"];
    // If it has a valid type assigned, keep it. Otherwise, use the seed.
    const ballistaType = (bal.type && availableTypes.includes(bal.type)) ? bal.type : availableTypes[seed % availableTypes.length];


    // --- 3. HELPER FUNCTION: LONGER BOWS, LESS TENSION ---
    const drawBowLayer = (yOffset, thickness, woodColor, isComposite, isInverted = false) => {
        ctx.strokeStyle = "#c0baba"; // Hemp string color
        ctx.lineWidth = 1.0; 
        ctx.beginPath();
        
        // Much wider span relative to the new 2/3 scale body
        const spanX = 36; 
        const drawX = 28; 
        const latchY = 10; // Scaled down latch position

        if (isInverted) {
            // INVERTED BOW STRING (Faces rear operator)
            if (isFired) {
                ctx.moveTo(-spanX, 9 + yOffset);
                ctx.lineTo(spanX, 9 + yOffset);
            } else {
                ctx.moveTo(-drawX, 3 + yOffset);
                ctx.lineTo(0, latchY); // Pulled back to latch
                ctx.lineTo(drawX, 3 + yOffset);
            }
        } else {
            // STANDARD BOW STRING (Faces forward)
            if (isFired) {
                ctx.moveTo(-spanX, -3 + yOffset);
                ctx.lineTo(spanX, -3 + yOffset);
            } else {
                ctx.moveTo(-drawX, 5 + yOffset);
                ctx.lineTo(0, latchY); // Pulled back to latch
                ctx.lineTo(drawX, 5 + yOffset);
            }
        }
        ctx.stroke();

        // Bow Limbs
        ctx.strokeStyle = woodColor;
        ctx.lineWidth = thickness * 0.66; // Scaled down limb thickness
        ctx.lineCap = "round";
        ctx.beginPath();
        
        if (isInverted) {
            // INVERTED BOW SHAPE
            let flexY = -3 + yOffset;
            if (isFired) {
                ctx.moveTo(-spanX, 9 + yOffset);
                ctx.quadraticCurveTo(0, flexY, spanX, 9 + yOffset);
            } else {
                ctx.moveTo(-drawX, 3 + yOffset);
                ctx.quadraticCurveTo(0, flexY, drawX, 3 + yOffset);
            }
        } else if (isComposite) {
            // M-SHAPE RECURVE (Gentler curves)
            let flexY = -3 + yOffset;
            let peakY = isFired ? -16 + yOffset : -12 + yOffset; 
            if (isFired) {
                ctx.moveTo(-spanX, -3 + yOffset);
                ctx.bezierCurveTo(-18, peakY, -8, flexY, 0, -10 + yOffset);
                ctx.bezierCurveTo(8, flexY, 18, peakY, spanX, -3 + yOffset);
            } else {
                ctx.moveTo(-drawX, 5 + yOffset);
                ctx.bezierCurveTo(-15, peakY, -8, flexY, 0, -10 + yOffset);
                ctx.bezierCurveTo(8, flexY, 15, peakY, drawX, 5 + yOffset);
            }
        } else {
            // STANDARD D-SHAPE (Drastically reduced tension)
            let flexY = isFired ? -18 + yOffset : -20 + yOffset; 
            if (isFired) {
                ctx.moveTo(-spanX, -3 + yOffset);
                ctx.quadraticCurveTo(0, flexY, spanX, -3 + yOffset);
            } else {
                ctx.moveTo(-drawX, 5 + yOffset);
                ctx.quadraticCurveTo(0, flexY, drawX, 5 + yOffset);
            }
        }
        ctx.stroke();
    };

    // --- 4. RENDER SPECIFIC BALLISTA TYPES ---
    // Scaled Y-offsets for the double-bow
    switch (ballistaType) {
        case "single":
            drawBowLayer(0, 6, "#5d4037", false, false);
            break;
            
        case "double":
            drawBowLayer(-6, 5, "#4e342e", false, false); // Front bow
            drawBowLayer(4, 5, "#5d4037", false, true);   // Rear bow
            break;
            
        case "m-type":
            drawBowLayer(0, 7, "#2c2c2c", true, false); 
            break;
            
        case "d-type":
            drawBowLayer(0, 8, "#8d6e63", false, false); 
            break;
    }
    // --- 5. THE LOADED BOLT (SHORTER, STRING-ALIGNED) ---
    if (!isFired) {
        // Bowstring latch point is around y = 10
        const shaftTop = -12;   // where the iron tip begins
        const shaftBottom = 10; // starts exactly at the bowstring
        const shaftLength = shaftBottom - shaftTop; // 22 (about half visual length)

  // Tiny Iron Tip (smaller head)
ctx.fillStyle = "#a0a0a0";
ctx.beginPath();
ctx.moveTo(0, shaftTop - 3);   // shorter point
ctx.lineTo(-1, shaftTop);
ctx.lineTo(1, shaftTop);
ctx.fill();
        // Heavy Wooden shaft (starts from bowstring)
        ctx.fillStyle = "#3e2723";
        ctx.fillRect(-1, shaftTop, 2, shaftLength);

        // Brown Fletchings
        ctx.fillStyle = "#6b4c3a";
        ctx.fillRect(-2, shaftBottom - 4, 1, 4);
        ctx.fillRect(1, shaftBottom - 4, 1, 4);
    }
	
 
    ctx.restore();
});


}
