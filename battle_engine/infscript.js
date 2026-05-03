function drawInfantryUnit(ctx, x, y, moving, frame, factionColor, type, isAttacking, side, unitName, isFleeing, cooldown, unitAmmo, unit, reloadProgress) {
	
	if (!unit || !unit.stats) {
        // If the unit object is missing or stats aren't loaded, 
        // return early to prevent the crash.
        return; 
    }
	
	ctx.save();
    ctx.translate(x, y);

    // ── DIRECTIONAL FLIP ─────────────────────────────────────────
    // facingDir 1 = right (natural), -1 = left (full sprite mirror)
    // ctx.scale(-1,1) flips the entire sprite — no per-element changes needed
    ctx.scale(unit.facingDir || 1, 1);
    // // UP placeholder   : future — ctx.rotate(-Math.PI/2) + back-view sprite
    // // DOWN placeholder : future — ctx.rotate( Math.PI/2) + front-view sprite
    // ─────────────────────────────────────────────────────────────

   // --- DYNAMIC ARMOR RETRIEVAL ---
    let armorVal = 2; 
    if (typeof UnitRoster !== 'undefined' && UnitRoster.allUnits[unitName]) {
        armorVal = UnitRoster.allUnits[unitName].armor;
    } else if (unitName && (unitName.includes("Elite") || type === "cataphract")) {
        armorVal = 40; // Elite/Super Heavy fallback
    } else if (unitName && unitName.includes("Heavy")) {
        armorVal = 25; // Standard Heavy fallback (matches Heavy Horse Archer)
    }

    if (unitName === "PLAYER" || unitName === "Commander") armorVal = Math.max(armorVal, 40);

    // Scenario 1 (Hakata Bay): player-side units use Japanese visuals regardless of factionColor.
    // Mirrors the same flag used for the Yumi bow. Has zero effect in sandbox.
    const isJapan = (factionColor === "#c2185b") || (window.__campaignStory1Active && unit && unit.side === 'player');

    let legSwing = moving ? Math.sin(frame * 0.3) * 6 : 0;
    let bob = moving ? Math.abs(Math.sin(frame * 0.3)) * 2 : 0;
    // dir is always 1 — ctx.scale(facingDir) above handles all mirroring.
    // Keeping dir in code so all weapon/arm offset math below compiles unchanged.
    let dir = 1;

    // 1. Legs
    ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(-3 - legSwing, 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(3 + legSwing, 9); ctx.stroke();

    ctx.translate(0, -bob); 
    
    // 2. Body: Base Faction Tunic (Mobs always wear faction color underneath)
    ctx.fillStyle = factionColor; ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.lineTo(3, -10); ctx.lineTo(-3, -10);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    
    // 3. ARMOR LAYERING
    if (armorVal >= 25) {
        // --- HEAVY TIER (25+): Steel Lamellar & SQUARE Pauldrons ---
        ctx.fillStyle = "#9e9e9e"; // Steel/Iron color
        ctx.beginPath(); ctx.moveTo(-4, -1); ctx.lineTo(4, -1); ctx.lineTo(3, -9); ctx.lineTo(-3, -9);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        
        // Steel Lamellar Texture (Lines)
        ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 0.5;
        for(let i = -8; i < -1; i+=2.5) {
            ctx.beginPath(); ctx.moveTo(-3, i); ctx.lineTo(3, i); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-1.5, i); ctx.lineTo(-1.5, i+2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(1.5, i); ctx.lineTo(1.5, i+2); ctx.stroke();
        }

        // SQUARE Asian-style Pauldrons — crimson if Japanese scenario player unit
        ctx.fillStyle = isJapan ? "#c2185b" : factionColor; 
        ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1;
        // Left pauldron
        ctx.fillRect(-6.5, -9.5, 3, 4.5); ctx.strokeRect(-6.5, -9.5, 3, 4.5);
        // Right pauldron
        ctx.fillRect(3.5, -9.5, 3, 4.5); ctx.strokeRect(3.5, -9.5, 3, 4.5);
        
        // Lamellar lines on the square pauldrons
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath(); ctx.moveTo(-6.5, -7.5); ctx.lineTo(-3.5, -7.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(3.5, -7.5); ctx.lineTo(6.5, -7.5); ctx.stroke();

} else if (armorVal >= 8) {
        // --- MEDIUM TIER (8-24): Smooth Leather + FACTION PAULDRONS ---
        ctx.fillStyle = "#5d4037"; // Dark smooth leather/cloth vest
        ctx.beginPath(); ctx.moveTo(-4, -1); ctx.lineTo(4, -1); ctx.lineTo(2.5, -9); ctx.lineTo(-2.5, -9);
        ctx.closePath(); ctx.fill(); ctx.stroke();

        // ADDED: Square Pauldrons for Medium Tier (Faction Color / crimson if Japanese scenario)
        ctx.fillStyle = isJapan ? "#c2185b" : factionColor; 
        ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1;
        // Left pauldron
        ctx.fillRect(-6, -9, 2.5, 4); ctx.strokeRect(-6, -9, 2.5, 4);
        // Right pauldron
        ctx.fillRect(3.5, -9, 2.5, 4); ctx.strokeRect(3.5, -9, 2.5, 4);
    }
    // Low tier (<8) is left as the standard cloth tunic.

    // 4. Head Base
    ctx.fillStyle = "#d4b886"; 
    ctx.beginPath(); ctx.arc(0, -12, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    
    // 5. DYNAMIC HEADGEAR BY ARMOR TIER AND FACTION
    if (armorVal >= 25) {
        // --- HIGH TIER -> HEAVY HELMETS ---
        if (isJapan) { 
            // Yamato / Hakata Bay player → Samurai Kabuto Helmet with Horns
            ctx.fillStyle = "#212121";
            ctx.beginPath(); ctx.arc(0, -13, 4, Math.PI, 0); ctx.fill(); 
            ctx.fillRect(-5, -13, 10, 2); 
            ctx.strokeStyle = "#fbc02d"; ctx.lineWidth = 1.5; 
            ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(-4, -19); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(4, -19); ctx.stroke();
        } else if (factionColor === "#1976d2" || factionColor === "#455a64") { 
            // Mongol / Jinlord -> Heavy Spiked Steel Helmet with flaps
            ctx.fillStyle = "#9e9e9e"; ctx.strokeStyle = "#424242"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(0, -14, 4.5, Math.PI, 0); ctx.fill(); ctx.stroke(); 
            ctx.fillStyle = "#616161";
            ctx.beginPath(); ctx.moveTo(-1.5, -18.5); ctx.lineTo(1.5, -18.5); ctx.lineTo(0, -23); ctx.fill(); 
            ctx.fillStyle = "#4e342e"; 
            ctx.fillRect(-5, -14, 3, 5); ctx.fillRect(2, -14, 3, 5);
}

else if (factionColor === "#7b1fa2") {

    // 1. The Neck/Ear Guards (Practical Padded Cloth) - Shifted Up
    ctx.fillStyle = "#4a148c"; // Darker purple for the fabric base
    ctx.beginPath();
    ctx.moveTo(-3.5, -12.5);
    ctx.lineTo(-4.5, -6.5);
    ctx.lineTo(-1, -6.5); // Rear guard
    ctx.lineTo(-0.5, -12.5);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0.5, -12.5);
    ctx.lineTo(1, -6.5);
    ctx.lineTo(4, -6.5); // Side guard
    ctx.lineTo(3.5, -13.5);
    ctx.fill();

    // Simple Iron Rivets on guards
    ctx.fillStyle = "#757575"; // Iron gray rivets
    const ironStuds = [[-3, -9.5], [-2.5, -8], [2, -9.5], [2.5, -8]];
    ironStuds.forEach(s => {
        ctx.beginPath();
        ctx.arc(s[0], s[1], 0.2, 0, Math.PI * 2);
        ctx.fill();
    });

    // 2. The Segmented Iron Bowl (Munjatugu)
    ctx.fillStyle = "#37474f"; // Wrought iron/dark steel
    ctx.beginPath();
    ctx.moveTo(-4, -13);
    ctx.quadraticCurveTo(-4, -20.5, 0, -21.5); 
    ctx.quadraticCurveTo(4, -20.5, 4, -13);
    ctx.closePath();
    ctx.fill();

    // 3. Vertical Plate Segments
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 0.3;
    const segments = [-2.5, -0.8, 0.8, 2.5];
    segments.forEach(x => {
        ctx.beginPath();
        ctx.moveTo(x, -13);
        ctx.lineTo(x * 0.5, -21.5); 
        ctx.stroke();
    });

    // 4. Iron Forehead Band & Rivets
    ctx.fillStyle = "#455a64"; 
    ctx.fillRect(-4.1, -14, 8.2, 1); // Structural rim band
    
    ctx.fillStyle = "#9e9e9e"; // Lighter iron for rivets
    const rimRivets = [-3.5, -2, 0, 2, 3.5];
    rimRivets.forEach(x => {
        ctx.beginPath();
        ctx.arc(x, -13.5, 0.15, 0, Math.PI * 2);
        ctx.fill();
    });

    // 5. The Top Finial (Functional Iron Spike)
    ctx.fillStyle = "#37474f";
    // Base plate
    ctx.fillRect(-0.8, -22, 1.6, 0.5);
    // Simple spike
    ctx.beginPath();
    ctx.moveTo(-0.3, -22);
    ctx.lineTo(0, -24);
    ctx.lineTo(0.3, -22);
    ctx.fill();

    // 6. Chin Strap (Functional)
    ctx.strokeStyle = "#eeeeee";
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(-3, -12.5);
    ctx.quadraticCurveTo(0, -9.5, 3, -12.5);
    ctx.stroke();

}

 else if (factionColor === "#00838f") {

// Dali Kingdom - Heavy Leather Helmet
// Features: Reinforced bowl, ear guards, and ceremonial plume

// 1. Side Ear Flaps (Rounded Leather)
ctx.fillStyle = "#8d6e63"; // Medium-dark leather brown
ctx.beginPath();
ctx.arc(-2.8, -13.5, 1.2, 0, Math.PI * 2); // Left flap
ctx.arc(2.8, -13.5, 1.2, 0, Math.PI * 2);  // Right flap
ctx.fill();

// 2. Main Helmet Bowl
ctx.fillStyle = "#a1887f"; // Slightly lighter leather for the crown
ctx.beginPath();
ctx.arc(0, -15, 3.5, Math.PI, 0); // Large rounded top
ctx.lineTo(3.5, -13.5);
ctx.lineTo(-3.5, -13.5);
ctx.closePath();
ctx.fill();

// 3. The Prominent Red Band (Forehead Guard)
ctx.fillStyle = "#c62828"; // Deep historical red
ctx.fillRect(-3.6, -14.8, 7.2, 1); 

// 4. The Top Finial & Plume (Golden Base + Black Brush)
// Plume (The dark hair/brush)
ctx.fillStyle = "#1a1a1a";
ctx.beginPath();
ctx.moveTo(-0.5, -18.5);
ctx.lineTo(-1.2, -19.8); // Individual strands effect
ctx.lineTo(0.2, -19.5);
ctx.lineTo(0.8, -20.2);
ctx.lineTo(0.5, -18.5);
ctx.fill();

// Golden Base (The ornament holding the plume)
ctx.fillStyle = "#fbc02d"; 
ctx.beginPath();
ctx.moveTo(-0.8, -18.5);
ctx.quadraticCurveTo(0, -19.5, 0.8, -18.5);
ctx.lineTo(0.5, -17.5);
ctx.lineTo(-0.5, -17.5);
ctx.closePath();
ctx.fill();
// 5. The White Chin Tie (Lowered to collar/chest level)
ctx.strokeStyle = "#ffffff";
ctx.fillStyle = "#ffffff";
ctx.lineWidth = 0.4;

// The bow/knot - Shifted south to -8.5
ctx.beginPath();
ctx.arc(-0.5, -8.5, 0.4, 0, Math.PI * 2); // Left loop
ctx.arc(0.5, -8.5, 0.4, 0, Math.PI * 2);  // Right loop
ctx.fill();

// The dangling ends - Starting at -8.5 and extending to -7.5
ctx.beginPath();
ctx.moveTo(0, -8.5);
ctx.lineTo(-0.8, -7.5);
ctx.moveTo(0, -8.5);
ctx.lineTo(0.8, -7.5);
ctx.stroke();
// 6. Leather Texture/Outline Detail
ctx.strokeStyle = "rgba(0,0,0,0.2)";
ctx.lineWidth = 0.15;
ctx.stroke(); // Adds a subtle edge to the last path

} else {
    // Default (Chinese/Korean) -> Steel Dome with Lamellar Neck Guard
    ctx.fillStyle = "#9e9e9e";
    ctx.beginPath(); ctx.arc(0, -14, 4, Math.PI, 0); ctx.fill(); ctx.stroke();
    
    // Fixed: Shorter guard (1.5 height) so it doesn't cover the eyes
    ctx.fillStyle = factionColor; 
    ctx.fillRect(-4.5, -14, 9, 1.5); 
}
    } else if (armorVal >= 8) {
  // --- MEDIUM TIER -> FACTION SPECIFIC LIGHT HATS ---
        if (isJapan) { 
            // Yamato / Hakata Bay player → Ashigaru Jingasa (Peasant Style: Iron/Black Wood)
            // Removed gold stroke; used a dark grey outline for a worn metal look
            ctx.fillStyle = "#212121"; 
            ctx.strokeStyle = "#424242"; 
            ctx.lineWidth = 0.5;

            // Revised coordinates: Lowered slightly to avoid gaps
            ctx.beginPath(); 
            ctx.moveTo(-6, -13); 
            ctx.lineTo(0, -16); 
            ctx.lineTo(6, -13);
            ctx.closePath(); 
            ctx.fill(); 
            ctx.stroke();
        
        } 
		
		
else if (factionColor === "#1976d2" || factionColor === "#455a64") {

			
// --- SURGERY: Replace the Mongol/Nomad helmet logic in infscript.js ---

// Identify if this is an elite/heavy unit that should keep its default armor
const isEliteMongol = unitName && (unitName.includes("Heavy") || unitName.includes("Elite") || unitName.includes("Mangadai"));
const isMongolFaction = (factionColor === "#1976d2" || factionColor === "#455a64");

if (isMongolFaction) {
    if (isEliteMongol || armorVal >= 25) {
        // DEFAULT: Heavy Spiked Steel Helmet (for elites/heavy)
        ctx.fillStyle = "#9e9e9e"; ctx.strokeStyle = "#424242"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, -13, 4.5, Math.PI, 0); ctx.fill(); ctx.stroke(); 
        ctx.fillStyle = "#616161";
        ctx.beginPath(); ctx.moveTo(-1.5, -17.5); ctx.lineTo(1.5, -17.5); ctx.lineTo(0, -22); ctx.fill(); 
        ctx.fillStyle = "#4e342e"; 
        ctx.fillRect(-5, -13, 3, 5); ctx.fillRect(2, -13, 3, 5); // Flaps
    } else {
        // NEW: Universal Mongol Hat (Conical fur cap)
        // 1. Fur Brim
        ctx.fillStyle = "#5d4037"; 
        ctx.fillRect(-4.5, -14, 9, 3);
        // 2. Conical Top (Faction colored)
        ctx.fillStyle = factionColor;
        ctx.beginPath();
        ctx.moveTo(-4, -13);
        ctx.lineTo(0, -19);
        ctx.lineTo(4, -13);
        ctx.fill();
        // 3. Small Red Tassel
        ctx.fillStyle = "#d32f2f";
        ctx.fillRect(-0.5, -20, 1, 2);
    }
}
        
} else if (factionColor === "#00838f") {
// Dali Kingdom (Historical Structured Cap)
// This replaces the "turban" look with the authentic tapered cap silhouette

// 1. The White Banded Base (The "Stripes" at the bottom)
ctx.fillStyle = "#ffffff";
ctx.fillRect(-3.2, -14.5, 6.4, 0.8); // Primary thick white band
ctx.fillStyle = "#d1d1d1"; 
ctx.fillRect(-3.2, -13.8, 6.4, 0.2); // Thin accent line for texture

// 2. The Main Cap Body (Dark Indigo/Black)
ctx.fillStyle = "#1a1a1a"; // Using a near-black indigo for historical dye depth
ctx.beginPath();
ctx.moveTo(-3.2, -14.5);           // Bottom Left
ctx.lineTo(3.2, -14.5);            // Bottom Right
ctx.lineTo(3.8, -16.5);            // Slight flare on the right
ctx.quadraticCurveTo(2, -19, -1, -18.5); // The soft, structured "peak"
ctx.lineTo(-3.5, -16);             // Tapering back to the left
ctx.closePath();
ctx.fill();

// 3. The Floral Designs (Circular Silver/White Motifs)
ctx.fillStyle = "#e0e0e0"; 
const flowerPositions = [
    {x: -1.8, y: -15.8},
    {x: 0.8, y: -15.5},
    {x: 2.5, y: -16.2},
    {x: 0.2, y: -17.5},
    {x: -1.2, y: -17.2}
];

flowerPositions.forEach(pos => {
    // Draw the main flower circle
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 0.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Add a tiny dark center for the "floral" look
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e0e0e0"; // Reset for next iteration
});

// 4. Final Detail: Soft fold line to give it dimension
ctx.strokeStyle = "rgba(255,255,255,0.1)";
ctx.lineWidth = 0.1;
ctx.beginPath();
ctx.moveTo(-1, -18.5);
ctx.lineTo(1, -16);
ctx.stroke();
} else if (factionColor === "#388e3c") { //vietnam rice hat
		           
            ctx.fillStyle = "#8d6e63";   // Dark Lacquered Rattan
            ctx.strokeStyle = "#5d4037"; // Deep brown for the weave lines
            ctx.lineWidth = 0.5;

            // 1. The main conical structure of the rattan helm
            ctx.beginPath();
            ctx.moveTo(-6, -13); // Bottom Left
            ctx.lineTo(0, -21);  // High Point (Conical peak)
            ctx.lineTo(6, -13);  // Bottom Right
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 2. Add the Woven Texture (Cross-hatching)
            // This adds small detail lines to make it look like organic material
            ctx.beginPath();
            // Horizontal bands
            ctx.moveTo(-3, -16); ctx.lineTo(3, -16);
            ctx.moveTo(-4.5, -14.5); ctx.lineTo(4.5, -14.5);
            // Vertical supports
            ctx.moveTo(-2, -13); ctx.lineTo(-0.5, -20);
            ctx.moveTo(2, -13); ctx.lineTo(0.5, -20);
            ctx.stroke();

            // 3. The Top Knob (Traditional finish for these hats/helms)
            ctx.fillStyle = "#5d4037";
            ctx.fillRect(-1, -22, 2, 2);	
		}
		else {
            // Default/Chinese -> simplified Rice Hat
            ctx.fillStyle = "#8d6e63"; 
            ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(0, -16); ctx.lineTo(6, -12);
            ctx.quadraticCurveTo(0, -13.5, -6, -12); ctx.fill(); ctx.stroke();
        }
    } else {
// --- SIMPLE HAIR (clean + safe) ---
ctx.fillStyle = "#212121";

// top cap
ctx.beginPath();
ctx.arc(0, -13.5, 3.6, Math.PI, 0);
ctx.fill();

// small side hints (optional, very subtle)
ctx.fillRect(-3.8, -12, 0.8, 2.5);
ctx.fillRect(3.0, -12, 0.8, 2.5);
    }
    
// 6. WEAPONS LOGIC (Preserved perfectly)
    let weaponBob = isAttacking ? Math.sin(frame * 0.8) * 4 : 0;
    
    if (isFleeing) {
        ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(2 * dir, -4); ctx.lineTo(4 * dir, -22 + weaponBob); ctx.stroke(); 
        ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#cccccc"; ctx.lineWidth = 0.5;
        let flap = moving ? Math.sin(frame * 1.5) * 3 : 0; 
        ctx.beginPath();
        ctx.moveTo(4 * dir, -21 + weaponBob); 
        ctx.quadraticCurveTo((-4 * dir), -22 + weaponBob + flap, (-10 * dir), -18 + weaponBob); 
        ctx.quadraticCurveTo((-6 * dir), -14 + weaponBob - flap, 3 * dir, -12 + weaponBob); 
        ctx.closePath(); ctx.fill(); ctx.stroke();
    } 
	//PEASANTS
	
else if (type === "peasant") {
		
				const isMilitia = unitName === "Militia";
				
			// 1. RESILIENT SEED GENERATION & THEMATIC BANDIT WEAPONS
				let weaponType = 0;
				
				if (unitName === "Club Bandit") {
					weaponType = 7; // Sledgehammer/Club
				} else if (unitName === "Hatchet Bandit") {
					weaponType = 8; // Meat Cleaver (works well as a hatchet)
				} else if (unitName === "Pitchfork Bandit") {
					weaponType = 0; // Pitchfork
				} else if (unitName === "Axe Bandit") {
					weaponType = 2; // Woodcutter's Axe
				} else {
					let seed = 0;
					if (typeof unit !== 'undefined' && unit !== null) {
						if (typeof unit.id === 'number') {
							seed = Math.abs(unit.id);
						} else if (typeof unit.id === 'string') {
							for (let i = 0; i < unit.id.length; i++) {
								seed += unit.id.charCodeAt(i);
							}
						} else {
							if (typeof unit._weaponSeed === 'undefined') {
								unit._weaponSeed = Math.floor(Math.random() * 1000);
							}
							seed = unit._weaponSeed;
						}
					}
					weaponType = seed % 10;
				}
			 

				let wBob = (typeof weaponBob !== 'undefined') ? weaponBob : (typeof bob !== 'undefined' ? bob : 0);
				let maxCd = 300;
				let currentCd = (typeof cooldown !== 'undefined') ? cooldown : 0;
				let cycle = isAttacking ? (maxCd - currentCd) / maxCd : 0;

				// Separate animation profiles based on the weapon
				let isThrusting = (weaponType === 0 || weaponType === 1 || weaponType === 4);
				
				let thrust = 0;
				let swingAngle = 0;

				if (isAttacking) {
					if (isThrusting) {
						// Snappy, rapid thrust animation
						thrust = cycle < 0.2 ? (cycle / 0.2) * 12 : 12 * (1 - (cycle - 0.2) / 0.8);
					} else {
						// Heavy overhead/side swinging animation (used by axes, hammers, scythes)
						swingAngle = Math.sin(cycle * Math.PI) * (Math.PI / 1.5);
					}
				}

				// --- DRAWING OFF-HAND / SHIELD ---
				if ([4, 5, 8].includes(weaponType)) {
					ctx.save();
					let shieldPush = isAttacking ? 2 : 0;
					ctx.translate((2 + shieldPush) * dir, -3 + wBob);
					
					if (weaponType === 4) {
			 
							// --- Chinese Tengpai (Woven Rattan Shield) ---
							ctx.save();
							let shieldRadius = 8; // Medium-large circular shield
							
							// 1. Base Rattan Color (Light Straw/Gold)
							ctx.fillStyle = "#e3c58d"; 
							ctx.beginPath();
							ctx.arc(0, 0, shieldRadius, 0, Math.PI * 1.5);
							ctx.fill();

							// 2. Woven Coils (Concentric rings to show the rattan wrap)
							ctx.strokeStyle = "#a0522d"; // Golden brown
							ctx.lineWidth = 0.6;
							for (let r = 1; r <= shieldRadius; r += 1.5) {
								ctx.beginPath();
								ctx.arc(0, 0, r, 0, Math.PI * 2);
								ctx.stroke();
							}

							// 3. The Radial Weave (The "Star" pattern that binds the coils)
							ctx.strokeStyle = "#6d4c41"; // Darker brown for depth
							ctx.lineWidth = 0.4;
							for (let i = 0; i < 12; i++) {
								let angle = (i * Math.PI) / 6;
								ctx.beginPath();
								ctx.moveTo(0, 0);
								// We use a slight curve or dashed line to simulate weaving over/under
								ctx.lineTo(Math.cos(angle) * shieldRadius, Math.sin(angle) * shieldRadius);
								ctx.stroke();
							}

							// 4. Central "Peak" (The reinforced center point)
							ctx.fillStyle = "#8d6e63";
							ctx.beginPath();
							ctx.arc(0, 0, 2, 0, Math.PI * 2);
							ctx.fill();
							// Tiny highlight on the peak
							ctx.fillStyle = "#ffe0b2";
							ctx.beginPath();
							ctx.arc(-0.5 * dir, -0.5, 0.5, 0, Math.PI * 2);
							ctx.fill();

							// 5. Reinforced Outer Rim
							ctx.strokeStyle = "#5d4037";
							ctx.lineWidth = 1.2;
							ctx.beginPath();
							ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
							ctx.stroke();

							ctx.restore();
			}
					

					else if (weaponType === 5) {
				// --- Improvised Plank Shield (Worn/Scrap Wood) ---
				ctx.save();
				
				let sW = 7;  // Total width
				let sH = 12; // Total height
				let xOff = -3.5 * dir; // Center the shield on the arm
				
				// 1. Draw 3 individual vertical planks
				let plankWidth = sW / 3;
				let woodColors = ["#795548", "#6d4c41", "#8d6e63"]; // Slight variations in wood tone
				
				for (let i = 0; i < 3; i++) {
					ctx.fillStyle = woodColors[i];
					ctx.fillRect(xOff + (i * plankWidth * dir), -sH/2, plankWidth * dir, sH);
					
					// Plank gaps/outlines
					ctx.strokeStyle = "#3e2723";
					ctx.lineWidth = 0.5;
					ctx.strokeRect(xOff + (i * plankWidth * dir), -sH/2, plankWidth * dir, sH);
				}

				// 2. Horizontal Cross-Braces (The "Battens" holding them together)
				ctx.fillStyle = "#5d4037";
				// Top brace
				ctx.fillRect(xOff - (0.5 * dir), -4, (sW + 1) * dir, 2);
				// Bottom brace
				ctx.fillRect(xOff - (0.5 * dir), 2, (sW + 1) * dir, 2);

				// 3. Iron Nails (Tiny silver dots on the braces)
				ctx.fillStyle = "#bdbdbd";
				for (let row = -3; row <= 3; row += 6) { // Top and bottom brace
					for (let col = 0; col < 3; col++) { // One nail per plank
						let nailX = xOff + (col * plankWidth + plankWidth/2) * dir;
						ctx.beginPath();
						ctx.arc(nailX, row, 0.4, 0, Math.PI * 2);
						ctx.fill();
					}
				}

				// 4. Rough/Chipped Edges (Optional: adds a jagged look)
				ctx.strokeStyle = "#3e2723";
				ctx.lineWidth = 1;
				ctx.strokeRect(xOff, -sH/2, sW * dir, sH);

				ctx.restore();
			}
			else if (weaponType === 8) {
				// --- Chinese Steamer Lid (Flipped/Inside View) ---
				ctx.save();
				let shieldRadius = 9; // Large, prominent size
				
				// 1. The Main Circular Base
				ctx.fillStyle = "#d2b48c"; // Bamboo Tan
				ctx.beginPath();
				ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
				ctx.fill();

				// 2. The "Blanks" (Radial Bamboo Support Slats)
				// We draw lines from the center to the edge to look like the internal structure
				ctx.strokeStyle = "#a0522d"; // Darker bamboo brown
				ctx.lineWidth = 1;
				for (let i = 0; i < 8; i++) {
					let angle = (i * Math.PI) / 4;
					ctx.beginPath();
					ctx.moveTo(0, 0);
					ctx.lineTo(Math.cos(angle) * shieldRadius, Math.sin(angle) * shieldRadius);
					ctx.stroke();
				}

				// 3. Inner Binding Rings
				// These hold the slats together
				ctx.beginPath();
				ctx.arc(0, 0, shieldRadius * 0.4, 0, Math.PI * 2);
				ctx.stroke();
				
				ctx.beginPath();
				ctx.arc(0, 0, shieldRadius * 0.7, 0, Math.PI * 2);
				ctx.stroke();

				// 4. Thick Outer Rim (The deep edge of the lid)
				ctx.strokeStyle = "#8b4513";
				ctx.lineWidth = 1.8;
				ctx.beginPath();
				ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
				ctx.stroke();

				ctx.restore();
			}
			ctx.restore();
				}

				// --- DRAWING MAIN WEAPON ---
				ctx.save();
				
				let pivotX = -2 * dir;
				let pivotY = -4 + wBob;
				
				ctx.translate(pivotX + (thrust * dir), pivotY);
				let baseAngle = isThrusting ? -Math.PI / 3 : -Math.PI / 2.5; 
				ctx.rotate(baseAngle + (swingAngle * dir));

				let woodColor = "#5d4037";
				let metalColor = isMilitia ? "#bdbdbd" : "#757575";

				switch(weaponType) {
					case 0: // Pitchfork
						ctx.strokeStyle = woodColor; ctx.lineWidth = 1.6; ctx.lineCap = "round";
						ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18 * dir, 0); ctx.stroke();
						ctx.strokeStyle = metalColor; ctx.lineWidth = 1.2;
						let pHeadX = 18 * dir;
						ctx.beginPath(); ctx.moveTo(pHeadX, -3); ctx.lineTo(pHeadX, 3); ctx.stroke();
						for (let i = -1; i <= 1; i++) {
							ctx.beginPath(); ctx.moveTo(pHeadX, i * 2.5); ctx.lineTo(pHeadX + (6 * dir), i * 2.5); ctx.stroke();
						}
						ctx.fillStyle = "#3e2723"; ctx.fillRect(pHeadX - (2 * dir), -1.5, 2 * dir, 3);
						break;

					case 1: // Bamboo Spear
						ctx.strokeStyle = "#827717"; ctx.lineWidth = 1.8;
						ctx.beginPath(); ctx.moveTo(-2 * dir, 0); ctx.lineTo(18 * dir, 0); ctx.stroke();
						ctx.strokeStyle = "#558b2f"; ctx.lineWidth = 1;
						ctx.beginPath(); ctx.moveTo(4 * dir, -1.5); ctx.lineTo(4 * dir, 1.5); ctx.stroke();
						ctx.beginPath(); ctx.moveTo(10 * dir, -1.5); ctx.lineTo(10 * dir, 1.5); ctx.stroke();
						ctx.fillStyle = "#4e342e";
						ctx.beginPath(); ctx.moveTo(18 * dir, -1.2); ctx.lineTo(24 * dir, 0); ctx.lineTo(18 * dir, 1.2); ctx.fill();
						break;

					case 2: // Woodcutter's Axe
						ctx.strokeStyle = woodColor; ctx.lineWidth = 2;
						ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(12 * dir, 0); ctx.stroke();
						ctx.fillStyle = metalColor;
						ctx.beginPath(); ctx.moveTo(10 * dir, -1); ctx.lineTo(13 * dir, -5); ctx.lineTo(14 * dir, 2); ctx.lineTo(10 * dir, 1); ctx.fill();
						break;

					case 3: // Mining Pickaxe
						ctx.strokeStyle = woodColor; ctx.lineWidth = 2;
						ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14 * dir, 0); ctx.stroke();
						ctx.strokeStyle = metalColor; ctx.lineWidth = 2.5; ctx.lineCap = "square";
						ctx.beginPath(); ctx.moveTo(13 * dir, -6); ctx.quadraticCurveTo(15 * dir, 0, 13 * dir, 6); ctx.stroke();
						break;

					case 4: // Small Dagger
						ctx.strokeStyle = woodColor; ctx.lineWidth = 1.5;
						ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(3 * dir, 0); ctx.stroke();
						ctx.fillStyle = metalColor;
						ctx.beginPath(); ctx.moveTo(3 * dir, -1); ctx.lineTo(9 * dir, 0); ctx.lineTo(3 * dir, 1); ctx.fill();
						break;

					case 5: // Sickle
						ctx.strokeStyle = woodColor; ctx.lineWidth = 1.5;
						ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(8 * dir, 0); ctx.stroke();
						ctx.strokeStyle = metalColor; ctx.lineWidth = 2; ctx.lineCap = "round";
						ctx.beginPath(); ctx.moveTo(7 * dir, 0); ctx.quadraticCurveTo(12 * dir, -2, 9 * dir, -6); ctx.stroke();
						break;

					case 6: // Farming Hoe
						ctx.strokeStyle = woodColor; ctx.lineWidth = 2;
						ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(15 * dir, 0); ctx.stroke();
						ctx.fillStyle = metalColor;
						ctx.fillRect(13 * dir, 0, 2 * dir, 5); // Flat metal blade extending downwards
						break;

					case 7: // Blacksmith Sledgehammer
						ctx.strokeStyle = woodColor; ctx.lineWidth = 2.2;
						ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14 * dir, 0); ctx.stroke();
						ctx.fillStyle = metalColor;
						ctx.fillRect(12 * dir, -3, 4 * dir, 6); // Heavy block head
						break;

					case 8: // Meat Cleaver
						ctx.strokeStyle = woodColor; ctx.lineWidth = 1.8;
						ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(4 * dir, 0); ctx.stroke();
						ctx.fillStyle = metalColor;
						ctx.fillRect(4 * dir, -3, 6 * dir, 5); // Broad rectangular blade
						ctx.beginPath(); ctx.arc(9 * dir, -2, 0.5, 0, Math.PI*2); ctx.fillStyle = "#424242"; ctx.fill(); // Hole in the cleaver
						break;

					case 9: // War Scythe
						ctx.strokeStyle = woodColor; ctx.lineWidth = 2;
						ctx.beginPath(); ctx.moveTo(-2 * dir, 0); ctx.lineTo(18 * dir, 0); ctx.stroke(); // Long pole
						ctx.strokeStyle = metalColor; ctx.lineWidth = 1.5; ctx.lineCap = "round";
						ctx.beginPath(); ctx.moveTo(17 * dir, 0); ctx.quadraticCurveTo(19 * dir, -8, 14 * dir, -10); ctx.stroke(); // Hooking blade
						break;
				}

				ctx.restore();
}
else if (type === "spearman") {
        const safeName = unitName || "";
        const isGlaive = safeName === "Glaiveman" || safeName.includes("Glaive");

        // --- 1. Improved Attack Animations ---
        const attackProgress = isAttacking ? (Math.sin(frame * 0.8) * 0.5 + 0.5) : 0;
        
        let thrust = 0;
        let lift = 0;
        let swingAngleOffset = 0;

        if (isGlaive) {
            // GLAIVE: Weighted downward swing/chop
            thrust = isAttacking ? 5 * attackProgress : 0; // Less forward movement
            lift = isAttacking ? 8 * Math.sin(frame * 0.8) : 0; // Drops the tip
            swingAngleOffset = isAttacking ? (Math.sin(frame * 0.8) * 0.6) * dir : 0; // Rotates the shaft
        } else {
            // SPEAR: Sharp linear forward stab
            thrust = isAttacking ? 16 * Math.pow(attackProgress, 1.5) : 0; // Snappy thrust
            lift = isAttacking ? -2 * attackProgress : 0; // Keeps it mostly level
            swingAngleOffset = 0;
        }

        // --- 2. Shaft Placement & Pivot ---
        const shaftStartX = -7 * dir;
        const shaftStartY = 4;
        
        // Base coordinates before rotation
        const baseEndX = (28 + (typeof weaponBob !== 'undefined' ? weaponBob : 0) + thrust) * dir;
        const baseEndY = -24 + (typeof weaponBob !== 'undefined' ? weaponBob : 0) + lift;

        let shaftAngle = Math.atan2(baseEndY - shaftStartY, baseEndX - shaftStartX);
        shaftAngle += swingAngleOffset; // Apply the glaive's rotational swing

        // Calculate final end coordinates using the new angle to keep the shaft connected
        const length = Math.hypot(baseEndX - shaftStartX, baseEndY - shaftStartY);
        const finalEndX = shaftStartX + Math.cos(shaftAngle) * length;
        const finalEndY = shaftStartY + Math.sin(shaftAngle) * length;

        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // --- 3. Draw Shaft (Standard Wood) ---
        ctx.strokeStyle = "#4e342e";
        ctx.lineWidth = 2.2; 
        ctx.beginPath();
        ctx.moveTo(shaftStartX, shaftStartY);
        ctx.lineTo(finalEndX, finalEndY);
        ctx.stroke();

        // --- 4. Draw Head (Small, Cheap Iron) ---
        ctx.fillStyle = "#757575"; 
        ctx.strokeStyle = "#424242";
        ctx.lineWidth = 0.5;
        
        ctx.save();
        ctx.translate(finalEndX, finalEndY);
        ctx.rotate(shaftAngle);

        ctx.beginPath();
        if (isGlaive) {
            // Glaive: Slightly shorter and more curved
            ctx.moveTo(0, -1.5);
            ctx.quadraticCurveTo(8, -4, 12, 0); 
            ctx.lineTo(10, 2); 
            ctx.lineTo(0, 1.5);
        } else {
            // Spear: Small needle-point leaf blade
            ctx.moveTo(-2, 0);    
            ctx.lineTo(0, -2);    
            ctx.lineTo(7, 0);     
            ctx.lineTo(0, 2);     
            ctx.closePath();
        }
        ctx.fill();
        ctx.stroke();

        // Socket binding
        ctx.fillStyle = "#2b1b17";
        ctx.fillRect(-2, -1.2, 3, 2.4);
        
        ctx.restore();

        // --- 5. Shield (Only if applicable) ---
        if (safeName.includes("Shield")) {
            ctx.fillStyle = "#5d4037";
            ctx.strokeStyle = "#3e2723";
            ctx.lineWidth = 1;
            const wB = (typeof weaponBob !== 'undefined' ? weaponBob : 0);
            const shieldX = (6 + wB / 2) * dir;
            const shieldY = -4 + (isAttacking ? 2 : 0);

            ctx.beginPath();
            ctx.arc(shieldX, shieldY, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            ctx.fillStyle = "#757575";
            ctx.beginPath();
            ctx.arc(shieldX, shieldY, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
    else if (type === "sword_shield") {
    const attackPulse = isAttacking ? (Math.sin(frame * 0.9) + 1) * 0.5 : 0;

    // Subtle saber motion
    const swingX = isAttacking ? 4 * attackPulse : 0;
    const swingY = isAttacking ? -2 * attackPulse : 0;
    const tilt = isAttacking ? -0.25 * attackPulse * dir : 0;

    ctx.save();

    // --- SWORD (same shape, just transformed) ---
    ctx.strokeStyle = "#9e9e9e";
    ctx.lineWidth = 2.5;

    ctx.save();
    ctx.translate(swingX * dir, swingY);
    ctx.rotate(tilt);

    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo((14 + weaponBob) * dir, -12 + (weaponBob / 2));
    ctx.stroke();

    ctx.restore();

    // --- SHIELD (very minor reactive movement) ---
    const shieldX = (6 + weaponBob / 2) * dir + (isAttacking ? -1.5 * attackPulse * dir : 0);
    const shieldY = -4 + (isAttacking ? 1 * attackPulse : 0);

    ctx.fillStyle = "#5d4037";
    ctx.strokeStyle = "#3e2723";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.arc(shieldX, shieldY, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#424242";
    ctx.beginPath();
    ctx.arc(shieldX, shieldY, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}
else if (type === "two_handed") {
    const attackPulse = isAttacking ? (Math.sin(frame * 0.7) + 1) * 0.5 : 0;

    // Big, heavy swing
    const swingArc = isAttacking ? attackPulse : 0;
    const lift = isAttacking ? -10 * (1 - swingArc) : 0;   // wind-up
    const drop = isAttacking ? 14 * swingArc : 0;          // strike
    const rotation = isAttacking ? (-1.1 + 2.0 * swingArc) * dir : -0.15 * dir;

    ctx.save();

    // Move weapon anchor for full-body swing feel
    ctx.translate(2 * dir, lift + drop);
    ctx.rotate(rotation);

    // --- MAIN WEAPON (unchanged geometry) ---
    ctx.strokeStyle = "#757575";
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.moveTo(-2 * dir, -4);
    ctx.quadraticCurveTo(
        (10 + weaponBob) * dir,
        -10 + weaponBob,
        (18 + weaponBob) * dir,
        -22 + weaponBob
    );
    ctx.stroke();

    // --- HANDLE / GRIP ---
    ctx.strokeStyle = "#212121";
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(2 * dir, -7);
    ctx.stroke();

    ctx.restore();

    // Optional: subtle motion blur line during attack
    if (isAttacking) {
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-4 * dir, -6);
        ctx.lineTo(12 * dir, 6);
        ctx.stroke();
    }
} else if (type === "archer") {
	    let b = (typeof bob !== 'undefined') ? bob : 0; 
	    let ammo = (typeof unitAmmo !== 'undefined') ? unitAmmo : 1; 

	    ctx.save();
	    ctx.translate(0, b); // Apply global bob to the whole unit

	    // --- THE QUIVER (On the back, visible in both modes) ---
	    ctx.fillStyle = "#3e2723"; ctx.fillRect(-5, -6, 4, 10);
	    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 0.5;
	    ctx.beginPath(); ctx.moveTo(-3, -6); ctx.lineTo(-1, -12); ctx.stroke(); 

	    // --- OUT OF AMMO: Melee Fallback ---
	    if (ammo <= 0) {
	        let meleeCycle = isAttacking ? (Date.now() / 600) % 1.0 : 0;
	        let swingAngle = isAttacking ? Math.sin(meleeCycle * Math.PI) * (Math.PI / 1.5) : 0;

// 1. Draw Stowed Bow on the back
	        ctx.save();
	        ctx.translate(-3, -1);
	        ctx.rotate(Math.PI / 1.2); 
	        
	        let isJapanBack = (factionColor === "#c2185b") || (window.__campaignStory1Active && unit && unit.side === 'player');
	        let stowTopY = isJapanBack ? -28 : -18; // Yumi extra long top limb
	        let stowBotY = isJapanBack ? 12 : 18;   // Yumi shorter bottom limb
	        let stowTopDip = isJapanBack ? -10 : -6;
	        
	        // Bow Limbs
	        ctx.strokeStyle = isJapanBack ? "#1a1a1a" : "#4e342e"; // Dark lacquer for Japan
	        ctx.lineWidth = 2;
	        ctx.beginPath(); 
	        ctx.moveTo(-5, stowTopY); 
	        ctx.quadraticCurveTo(3, stowTopDip, -1, 0); 
	        ctx.quadraticCurveTo(3, 6, -5, stowBotY);  
	        ctx.stroke();
	        
	        // Taut Bowstring
	        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)"; ctx.lineWidth = 0.6;
	        ctx.beginPath(); ctx.moveTo(-5, stowTopY); ctx.lineTo(-5, stowBotY); ctx.stroke();
	        ctx.restore();
	        // 2. Draw Shortsword & Hand
	        ctx.save();
	        ctx.translate(4, -8); 
	        ctx.rotate(swingAngle);
	        
	        ctx.fillStyle = "#ffccbc"; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI*2); ctx.fill(); 
	        ctx.fillStyle = "#9e9e9e"; ctx.fillRect(-1.5, -14, 3, 14); 
	        ctx.beginPath(); ctx.moveTo(-1.5, -14); ctx.lineTo(0, -17); ctx.lineTo(1.5, -14); ctx.fill(); 
	        ctx.fillStyle = "#5d4037"; ctx.fillRect(-1, 0, 2, 4); 
	        ctx.fillStyle = "#e0e0e0"; ctx.fillRect(-3, -2, 6, 2); 
	        ctx.restore();

	        ctx.restore(); 
	        return; 
	    }

// --- RANGED COMBAT ---
	
	// SURGERY: Dynamically fetch reload time so future tweaks never break sync
	let maxCool = (typeof getReloadTime === 'function' && typeof unit !== 'undefined') ? getReloadTime(unit) : 170; 
	let cdown = (typeof cooldown !== 'undefined') ? cooldown : 0;
	
	// ---> THE FIX: DECOUPLE FROM FLAWED ENGINE VARIABLE <---
	// troop_system.js turns 'isAttacking' false when cooldown hits 30!
	// We MUST ignore it and track the cooldown directly to 0, just like the Horse Archer.
	let isActionActive = (unit.state === "attacking" && cdown > 0); 
	
	// cycle progresses perfectly from 0.0 (attack starts) to 1.0 (projectile spawns)
	let cycle = isActionActive ? Math.max(0, Math.min(1.0, 1.0 - (cdown / maxCool))) : 0;
	let handX = 6, handY = -8;
	
	// Strict Anchor Points
	let restX = handX - 5; 
	let restY = handY;
	let quiverX = -2;
	let quiverY = -12;
	let fullDrawX = handX - 16;
	let fullDrawY = handY;

	// State Variables
	let drawHandX = restX;
	let drawHandY = restY;
	let stringX = restX;
	let stringY = restY;
	let hasArrow = false;
	let arrowAngle = 0;
	let bowKhatra = 0;

	// Phase Logic
// --- SURGERY: INITIAL STATE NOCKED & READY ---
	if (!isActionActive) {
		// Instead of a totally relaxed bow, we show a "Combat Ready" pose:
		// Arrow is nocked and pulled back ~30% of the way.
		let readyPull = 0.3; 
		drawHandX = restX + (fullDrawX - restX) * readyPull;
		drawHandY = restY;
		stringX = drawHandX; 
		stringY = drawHandY;
		hasArrow = true;
		arrowAngle = 0; // Pointing straight forward
	} else if (cycle < 0.15) {
        // ... (rest of your phases)
		// 1. Reach back to quiver
		let ph = cycle / 0.15;
		drawHandX = restX + (quiverX - restX) * ph; 
		drawHandY = restY + (quiverY - restY) * ph;
	} else if (cycle < 0.35) { 
		// 2. Pull arrow out and bring to string (Nocking)
		let ph = (cycle - 0.15) / 0.20;
		drawHandX = quiverX + (restX - quiverX) * ph; 
		drawHandY = quiverY + (restY - quiverY) * ph;
		hasArrow = true;
		arrowAngle = (-Math.PI / 1.5) * (1 - ph); // Rotate arrow into position
	} else if (cycle < 0.75) { 
		// 3. Draw the bow
		let ph = (cycle - 0.35) / 0.40; 
		let easeOut = 1 - Math.pow(1 - ph, 3); // Smooth pull
		drawHandX = restX + (fullDrawX - restX) * easeOut;
		drawHandY = restY + (fullDrawY - restY) * easeOut;
		hasArrow = true;
		stringX = drawHandX; // String follows hand
		stringY = drawHandY;
} else if (cycle < 0.95) { 
		// 4. Hold full draw (Tightened to match Horse Archer timing)
		drawHandX = fullDrawX;
		drawHandY = fullDrawY;
		hasArrow = true; // Arrow stays NOCKED during the hold
		stringX = fullDrawX; 
		stringY = fullDrawY;
	} else { 
		// 5. Loose / Khatra (The "Snap" window: 0.95 to 1.0)
		let ph = (cycle - 0.95) / 0.05; 
		
		// SURGERY: The arrow vanishes instantly the moment the string snaps forward.
		// This restores the perfect visual sync seen in the Horse Archer.
		hasArrow = false; 
		
		// The String snaps to rest instantly (snappy feel)
		stringX = restX; 
		stringY = restY;

		// The Hand follows through more realistically
		drawHandX = fullDrawX + (restX - fullDrawX) * ph;
		drawHandY = fullDrawY + (restY - fullDrawY) * ph;

		// Khatra (Bow Twist) - Peak twist mid-release
		bowKhatra = 0.4 * Math.sin(ph * Math.PI); 
	}

// --- BOW RENDERING (With dynamic limb tension) ---
	let tension = (restX - stringX) / (restX - fullDrawX); // 0 at rest, 1 at full draw
	let tipX = (handX - 5) - (tension * 4); // Limbs bend back up to 4px
	let dipX = (handX + 4) - (tension * 2); // Belly flattens slightly

	// isJapan already declared at top of function
	let topTipY = isJapan ? -38 : -23; // Extreme asymmetric upper limb for Yumi
	let botTipY = isJapan ? 2 : 7;     // Shorter lower limb
	let topDipY = isJapan ? -20 : -13; // Adjust upper bending curve
	let botDipY = isJapan ? -4 : -3;   // Adjust lower bending curve

	ctx.save();
	ctx.translate(handX, handY); 
	ctx.rotate(bowKhatra); 
	ctx.translate(-handX, -handY);
	
	// Bow Body
	ctx.strokeStyle = isJapan ? "#1a1a1a" : "#4e342e"; // Dark lacquer for Japan, wood for others
	ctx.lineWidth = 2;
	ctx.beginPath(); 
	ctx.moveTo(tipX, topTipY); // Top Tip
	ctx.quadraticCurveTo(dipX, topDipY, handX - 1, handY); // Handle dip
	ctx.quadraticCurveTo(dipX, botDipY, tipX, botTipY);    // Bottom Tip
	ctx.stroke();
	
	// Yumi specific grip/rattan wrap details
	if (isJapan) {
	    ctx.strokeStyle = "#e0e0e0"; 
	    ctx.lineWidth = 2.5;
	    ctx.beginPath();
	    ctx.moveTo(handX - 1, handY - 1.5);
	    ctx.lineTo(handX - 1, handY + 1.5);
	    ctx.stroke();
	}
	
	// Bowstring
	ctx.strokeStyle = "rgba(255, 255, 255, 0.5)"; ctx.lineWidth = 0.6;
	ctx.beginPath(); 
	ctx.moveTo(tipX, topTipY); 
	ctx.lineTo(stringX, stringY); 
	ctx.lineTo(tipX, botTipY); 
	ctx.stroke();
	ctx.restore();

	// --- ARROW RENDERING ---
	if (hasArrow) {
		ctx.save();
		ctx.translate(drawHandX, drawHandY);
		ctx.rotate(arrowAngle);
		
		ctx.fillStyle = "#8d6e63"; ctx.fillRect(0, -0.5, 14, 1); // Shaft
		ctx.fillStyle = "#9e9e9e"; ctx.fillRect(14, -1.5, 3, 3); // Head
		ctx.fillStyle = "#d32f2f"; ctx.fillRect(0, -1.5, 3, 1); ctx.fillRect(0, 0.5, 3, 1); // Feathers
		ctx.restore();
	}

	// --- DRAWING HAND ---
	ctx.fillStyle = "#ffccbc";
	ctx.beginPath();
	ctx.arc(drawHandX, drawHandY, 2, 0, Math.PI * 2);
	ctx.fill();

	ctx.restore(); // Restore global unit translate (for the bob)
	}
else if (type === "throwing") {
        if (unitName === "Slinger") {
            // --- SURGERY START: Synchronized Slinger Timing ---
            // Slinger timing is snappy. 1.5s cycle.
            let slingerTime = Date.now() / 1500;
            let cycle = isAttacking ? slingerTime % 1.0 : 0;
            // --- SURGERY END ---
            
            let handX = 4, handY = -8;
            let stoneX, stoneY;
            let isVisible = true;

            // --- THE POUCH (At waist) ---
            ctx.fillStyle = "#5d4037"; ctx.beginPath();
            ctx.ellipse(-2, 2, 3, 4, 0, 0, Math.PI*2); ctx.fill();

            // 3-Phase Animation State Machine
            if (cycle < 0.3) { 
                // Phase 1: RELOAD - Reach for pouch (0.0 to 0.3)
                let p = cycle / 0.3;
                handX = 4 - (p * 6); handY = -8 + (p * 10);
                stoneX = handX; stoneY = handY;
            } 
            // --- SURGERY START: Extended Centrifugal Spin ---
            // We now extend the spin all the way to 0.95 (95% of the cooldown).
            // This ensures the stone stays in the sling until the moment of release.
            else if (cycle < 0.95) { 
                let p = (cycle - 0.3) / 0.65; // Normalized over the longer 65% window
                let spinAngle = p * Math.PI * 10; // Faster spin (5 full rotations) for more "oomph"
                handX = 6; handY = -10;
                
                // The stone orbits the hand in an elliptical path
                stoneX = handX + Math.cos(spinAngle) * 12;
                stoneY = handY + Math.sin(spinAngle) * 4; 
            } 
            // --- SURGERY START: Precision Snap Release ---
            else { 
                // Phase 3: THROW - High velocity snap (0.95 to 1.0)
                // This tiny 5% window mimics a real sling release.
                let p = (cycle - 0.95) / 0.05; 
                handX = 6 + (p * 10); handY = -10 - (p * 4);
                
                isVisible = false; // Stone is released exactly as the projectile spawns
            }
            // --- SURGERY END ---

            // Draw Sling Cord
            ctx.strokeStyle = "#d4b886"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(handX, handY);
            if (isVisible) {
                ctx.lineTo(stoneX, stoneY);
            } else {
                // --- SURGERY START: Cord Momentum ---
                // When invisible (released), the cord flails forward following the hand's path
                ctx.lineTo(handX + 12, handY + 6); 
                // --- SURGERY END ---
            }
            ctx.stroke();

            // Draw Stone/Bullet
            if (isVisible) {
                ctx.fillStyle = "#9e9e9e";
                ctx.beginPath(); ctx.arc(stoneX, stoneY, 2, 0, Math.PI*2); ctx.fill();
            }

            // Draw Hand (Drawn last so it sits on top of the sling cord)
            ctx.fillStyle = "#ffccbc"; 
            ctx.beginPath(); 
            ctx.arc(handX, handY, 2, 0, Math.PI*2); 
            ctx.fill();
        }
   else { //  JAVELINIER
     // 1. Context & State Retrieval
        let currentAmmo = (typeof unit !== 'undefined' && unit.ammo !== undefined) ? unit.ammo : 4;
        let isMelee = false;
        
        // Distance Check for Melee Stabbing vs Throwing
        if (typeof unit !== 'undefined' && unit.target) {
            let distToTarget = Math.hypot(unit.target.x - unit.x, unit.target.y - unit.y);
            // Threshold for "too close" - forces melee to defend themselves
            if (distToTarget < 35) {
                isMelee = true;
            }
        }

        // --- AMMO = 0 OVERRIDE ---
        // If out of ammo, they can't throw. Force melee mode using their final spear.
        if (currentAmmo <= 0) {
            isMelee = true;
        }

        // --- DRAW SHIELD (True Hmong Rattan Weave) ---
        ctx.save();
        // Positioned slightly forward on the body
        ctx.translate(4 * dir, -5 + (typeof weaponBob !== 'undefined' ? weaponBob : 0)); 
        ctx.rotate((Math.PI / 12) * dir); 

        // Off-hand explicitly gripping the back/side of the shield to show it's held
        ctx.fillStyle = "#ffccbc";
        ctx.beginPath();
        ctx.arc(-2 * dir, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Rattan base color (richer, natural tan)
        ctx.fillStyle = "#cbb593"; 
        ctx.beginPath();
        ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Authentic woven rattan texture (Radial spokes + Concentric loops)
        ctx.strokeStyle = "#8b5a2b"; 
        ctx.lineWidth = 0.5;
        
        // 1. Radial spokes (the frame)
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * 7.5, Math.sin(angle) * 7.5);
            ctx.stroke();
        }
        
        // 2. Concentric woven loops
        for (let r = 1.5; r <= 7.5; r += 1.5) {
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        // Outer thick bound rim
        ctx.strokeStyle = "#4a3018"; 
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
        ctx.stroke();

        // Center binding/reinforcement knot
        ctx.fillStyle = "#4a3018";
        ctx.beginPath();
        ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
// --- DRAW STORED JAVELINS (On Back) ---
        // CLAMPED LOGIC: ammo 4 = 3 on back, ammo 1 = 0 on back. 
        // Math.min(3, ...) ensures we never render infinite javelins in UI/Unit Cards.
        let backJavelinsCount = Math.max(0, Math.min(3, currentAmmo - 1));
        
        for (let i = 0; i < backJavelinsCount; i++) {
            ctx.save();
            // Spacing and angle logic
            let offsetX = (-2.5 - i * 1.5) * dir;
            let angle = (-0.1 - i * 0.05) * dir;
            
            // Dampened weaponBob to stop the wobbling
            ctx.translate(offsetX, -4 + (typeof weaponBob !== 'undefined' ? weaponBob * 0.3 : 0));
            ctx.rotate(angle);

            // Thinner Shaft (Shaved down)
            ctx.strokeStyle = "#4e342e"; 
            ctx.lineWidth = 1.0; // Thinned further for sleek look
            ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(0, -16); ctx.stroke();

            // EVEN SMALLER Symmetrical Head
            ctx.fillStyle = "#bdbdbd";
            ctx.beginPath();
            ctx.moveTo(0, -16);    // base center
            ctx.lineTo(-0.8, -14); // Ultra-thin left barb
            ctx.lineTo(0, -18.5);  // Sharp tip
            ctx.lineTo(0.8, -14);  // Ultra-thin right barb
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // --- ANIMATION LOGIC (Spear Thrust vs Throw) ---
        let handX = -1 * dir; 
        let handY = -7 + (typeof weaponBob !== 'undefined' ? weaponBob : 0);
        let javRotation = 0;
        let thrustX = 0;
        let thrustY = 0;
        let isVisible = true;
        
        let maxCd = 1600;
        let cycle = isAttacking ? (Date.now() % maxCd) / maxCd : 0;

        if (isMelee) {
            // PHASE: STRICTLY MELEE STAB (Last Javelin held as Spear)
            javRotation = (Math.PI / 2.2) * dir; 
            if (isAttacking) {
                if (cycle < 0.3) {
                    // Windup / Pull back behind the shield
                    let p = cycle / 0.3;
                    thrustX = -4 * p;
                    thrustY = -1 * p;
                } else if (cycle < 0.5) {
                    // Heavy Spear Thrust forward
                    let p = (cycle - 0.3) / 0.2;
                    thrustX = -4 + (p * 18);
                    thrustY = -1 + (p * 2);
                } else {
                    // Retract back to stance
                    let p = (cycle - 0.5) / 0.5;
                    thrustX = 14 * (1 - p);
                    thrustY = 1 * (1 - p);
                }
            }
        } else {
            // PHASE: THROWING (Safe distance)
            if (isAttacking) {
                if (cycle < 0.7) { 
                    // Wind-up
                    let p = cycle / 0.7;
                    thrustX = -(p * 8); 
                    javRotation = ((-Math.PI / 6) - (p * Math.PI / 4)) * dir; 
                } else if (cycle < 0.95) { 
                    // The Throw Snap
                    let p = (cycle - 0.7) / 0.25;
                    thrustX = -8 + (p * 20); 
                    javRotation = ((-Math.PI / 4) + (p * Math.PI / 1.5)) * dir; 
                    isVisible = true;
                } else { 
                    // Follow-through & Release
                    let p = (cycle - 0.95) / 0.05;
                    thrustX = 12 + (p * 4); 
                    javRotation = (Math.PI / 3) * dir;
                    isVisible = false; 
                }
            }
        }

        // --- DRAW ACTIVE JAVELIN ---
        if (isVisible || !isAttacking) {
            ctx.save();
            ctx.translate(handX + (thrustX * dir), handY + thrustY);
            ctx.rotate(javRotation);

            // Thinner Shaft
            ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 1.5; 
            ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -12); ctx.stroke();
            
            // EVEN SMALLER Active Javelin Head
            ctx.fillStyle = "#bdbdbd";
            ctx.beginPath();
            ctx.moveTo(0, -12);      // base center
            ctx.lineTo(-1.0, -10.5); // left barb
            ctx.lineTo(0, -15);      // sharp tip
            ctx.lineTo(1.0, -10.5);  // right barb
            ctx.closePath();
            ctx.fill();
            
            ctx.restore();
        }

        // --- DRAW MAIN HAND ---
        // Draws on top of the javelin shaft so the grip is solid
        ctx.fillStyle = "#ffccbc";
        ctx.beginPath();
        ctx.arc(handX + (thrustX * dir), handY + thrustY, 2.5, 0, Math.PI * 2);
        ctx.fill();
} // End of Javelinier block
}

else if (type === "crossbow") { 
    let b = (typeof bob !== 'undefined') ? bob : 0; 
    let ammo = (typeof unitAmmo !== 'undefined') ? unitAmmo : 1; 

    // --- QUIVER (Back/Hip) - Revised: Smaller for Bolts ---
    ctx.save();
    ctx.translate(-5, -4 + b); 
    ctx.rotate(-Math.PI / 8);  
    
    // Smaller pouch-style quiver
    ctx.fillStyle = "#3e2723"; 
    ctx.fillRect(-2, -4, 4, 8);
    ctx.strokeStyle = "#1a1007"; ctx.lineWidth = 0.5; ctx.strokeRect(-2, -4, 4, 8);

    // Tiny bolt fletchings
    let visibleBolts = Math.max(0, Math.min(3, ammo));
    ctx.fillStyle = "#eeeeee"; 
    for (let i = 0; i < visibleBolts; i++) {
        ctx.fillRect(-1.5 + (i * 1.2), -6, 0.8, 2); 
    }
    ctx.restore();

    // --- OUT OF AMMO: Melee Fallback ---
    if (ammo <= 0) {
        let meleeCycle = isAttacking ? (Date.now() / 600) % 1.0 : 0;
        let swingAngle = isAttacking ? Math.sin(meleeCycle * Math.PI) * (Math.PI / 1.5) : 0;

        ctx.save();
        ctx.translate(0, b);
        ctx.save();
        ctx.translate(-4, -6);
        ctx.rotate(Math.PI / 1.5); 
        ctx.fillStyle = "#5d4037"; ctx.fillRect(0, -10, 16, 3);
        
        if (unitName === "Repeater Crossbowman") {
            ctx.fillStyle = "#5d4037"; ctx.fillRect(5, -13, 10, 5); 
            ctx.strokeStyle = "#2b1b17"; ctx.lineWidth = 0.8; ctx.strokeRect(5, -13, 10, 5);
        } else {
            let scale = (unitName === "Poison Crossbowman") ? 0.8 : (unitName === "Heavy Crossbowman" ? 1.3 : 1.0);
            ctx.strokeStyle = "#000000"; ctx.lineWidth = (unitName === "Heavy Crossbowman") ? 3 : 2;
            ctx.beginPath(); ctx.moveTo(14, -10 - (6 * scale));
            ctx.quadraticCurveTo(14 + (4 * scale), -10, 14, -10 + (6 * scale)); 
            ctx.stroke();
        }
        ctx.restore();

        ctx.save();
        ctx.translate(4, -8); ctx.rotate(swingAngle);
        ctx.fillStyle = "#ffccbc"; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI*2); ctx.fill(); 
        ctx.fillStyle = "#9e9e9e"; ctx.fillRect(-1.5, -14, 3, 14); 
        ctx.fillStyle = "#5d4037"; ctx.fillRect(-1, 0, 2, 4); 
        ctx.restore();
        ctx.restore();
        return; 
    }
	
	
	// --- RANGED COMBAT: Engine Sync ---
        let cdown = (typeof cooldown !== 'undefined') ? cooldown : 0;

        // 1. Dynamically grab the unit's true max cooldown to future-proof tweaks
        let maxCool = (typeof getReloadTime === 'function' && typeof unit !== 'undefined') ? getReloadTime(unit) : 300;
        
        // 2. Isolate the Repeater's 50-tick burst so it doesn't infect standard crossbows!
        let isRepeaterBurst = (unitName === "Repeater Crossbowman" && cdown <= 50 && cdown > 0);
        if (isRepeaterBurst) maxCool = 50; 

        // Smooth 0.0 to 1.0 cycle for EVERY unit
        let p = Math.max(0, Math.min(1.0, 1.0 - (cdown / maxCool)));

        if (unitName === "Repeater Crossbowman") {
            let leverMove = 0, boltInTray = false, stringPull = 0, handX = 0, handY = 0;
            let loadingMag = false, handOnLever = false, wobbleX = 0, wobbleY = 0, magOffset = 0;

            // --- PHASE 1: BOX MAG RELOAD ---
            if (!isRepeaterBurst && cdown > 0) {
                loadingMag = true;
                // Normalize progress for the remaining ticks above 50
                let reloadRange = Math.max(1, maxCool - 50); 
                let reloadP = Math.max(0, Math.min(1, 1 - ((cdown - 50) / reloadRange)));
                
                let dropCycle = (reloadP * 5) % 1; 
                handX = dropCycle < 0.5 ? -2 : 10; 
                handY = dropCycle < 0.5 ? 5 : -4;   
            } 
            // --- PHASE 2: INDIVIDUAL BOLT FIRE ---
            else if (isRepeaterBurst) {
                handOnLever = true;
                let shotP = p; // Already normalized 0.0 to 1.0 by the maxCool override

                if (shotP < 0.4) { // Push
                    leverMove = (shotP / 0.4) * 5;
                    boltInTray = shotP > 0.1;
                } else if (shotP < 0.95) { // Pull
                    let drawP = (shotP - 0.4) / 0.55;
                    leverMove = 5 - (drawP * 5);
                    stringPull = drawP * 8;
                    boltInTray = true;
                } else { // Snap/Recoil
                    wobbleX = (Math.random() - 0.5) * 3;
                    wobbleY = (Math.random() - 0.5) * 3;
                    boltInTray = false; 
                }
                magOffset = leverMove * 0.8;
            } else {
                // Idle
                handOnLever = true;
                boltInTray = true;
            }

            // --- RENDERING --- (100% UNTOUCHED)
			
    ctx.save();
    ctx.translate(wobbleX, 8 + wobbleY);

    // Body & Bow
    ctx.fillStyle = "#4e342e"; ctx.fillRect(3, -11, 18, 3);
    ctx.strokeStyle = "#000"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(21, -15); ctx.quadraticCurveTo(24 - stringPull*0.2, -11, 21, -7); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(21, -15); ctx.lineTo(21 - stringPull, -11); ctx.lineTo(21, -7); ctx.stroke();
    
    // Magazine Box
    ctx.fillStyle = "#5d4037"; ctx.fillRect(7 + magOffset, -18, 10, 7);
    ctx.strokeRect(7 + magOffset, -18, 10, 7);

    // Lever
    ctx.save();
    ctx.translate(15 + magOffset, -10);
    ctx.rotate(handOnLever ? (leverMove / 5) * -0.7 : 0);
    ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-12, -8); ctx.stroke();
    ctx.restore();

    if (boltInTray) {
        ctx.fillStyle = "#5d4037"; ctx.fillRect(11, -11, 6, 1); 
        ctx.fillStyle = "#9e9e9e"; ctx.beginPath(); 
        ctx.moveTo(17, -11.5); ctx.lineTo(20, -10.5); ctx.lineTo(17, -9.5); ctx.fill();
    }
    
    // Hand Logic
    ctx.fillStyle = "#ffccbc";
    if (loadingMag) { 
        ctx.beginPath(); ctx.arc(handX, handY-16, 1.5, 0, Math.PI * 2); ctx.fill(); 
    } else if (handOnLever) { 
        let arcX = (15 + magOffset) + Math.cos(Math.PI + 0.6 + (leverMove / 5) * -0.7) * 14;
        let arcY = -10 + Math.sin(Math.PI + 0.6 + (leverMove / 5) * -0.7) * 14;
        ctx.beginPath(); ctx.arc(arcX, arcY, 1.5, 0, Math.PI * 2); ctx.fill(); 
    }
    ctx.restore(); 
}
    else {
        // --- STANDARD / POISON / HEAVY: FOOT-STIRRUP SPANNING ---
        let weaponRot = 0, weaponX = 0, weaponY = 0, bodyDip = 0, bodyShift = 0, stringPull = 0;
        let hasBolt = false, loadHand = false, hX = 0, hY = 0, showFoot = false;
        let isHeavy = (unitName === "Heavy Crossbowman");
        let isPoison = (unitName === "Poison Crossbowman");

        // PHASE LOGIC: Added dynamic recoil snap
        if (p < 0.05) { 
            // SURGERY: Active kickback phase immediately following the shot
            let ph = p / 0.05;
            weaponX = -3 * (1 - ph); 
            weaponRot = -0.1 * (1 - ph); 
            stringPull = 0;
            hasBolt = false;
            bodyShift = -5; // Keep aimed stance
            weaponY = 5;
        }
        else if (p < 0.20) { 
            let ph = (p - 0.05) / 0.15; 
            weaponRot = ph * (Math.PI / 2); 
            weaponY = ph * 12; 
            weaponX = ph * 4; 
            bodyDip = ph * 5; 
            bodyShift = ph * -11; // Shift body UP as weapon goes DOWN
        } 
        else if (p < 0.45) { 
            let ph = (p - 0.20) / 0.25; 
            weaponRot = Math.PI / 2; weaponY = 12; weaponX = 4; bodyDip = 5; 
            bodyShift = -11; // Maintain high position during spanning
            stringPull = ph * 8; showFoot = true; 
        } 
        else if (p < 0.60) { 
    let ph = (p - 0.45) / 0.15; 
    weaponRot = (Math.PI / 2) * (1 - ph); 
    // Instead of going to 0 (Neck), we go to 5 (Chest/Hip)
    weaponY = 12 - (ph * 7);   // 12 down to 5
    weaponX = 4 * (1 - ph); 
    bodyDip = 5 * (1 - ph); 
    // Instead of going to 0 (Teleport), we go to -5 (Slightly raised stance)
    bodyShift = -11 + (ph * 6); // -11 up to -5
    stringPull = 8; 
} 
else if (p < 0.75) { 
    stringPull = 8; loadHand = true; let ph = (p - 0.60) / 0.15; hX = -4 - (ph * 4); hY = 2 - (ph * 6);
    weaponY = 5; bodyShift = -5; // Keep the lower position while loading bolt
} 
else if (p < 0.90) { 
    stringPull = 8; loadHand = true; let ph = (p - 0.75) / 0.15; hX = -8 + (ph * 18); hY = -4 + (ph * 6);
    weaponY = 5; bodyShift = -5; // Keep the lower position while moving hand
} 
else { 
    stringPull = 8; hasBolt = true; 
    weaponY = 5; // Final resting position (No more teleporting!)
    bodyShift = -5; 
}
        ctx.save();
        // APPLY SHIFT: The man now "steps up" into the stirrup
        ctx.translate(0, bodyDip + b + bodyShift); 
        
        ctx.save();
      ctx.translate(weaponX, weaponY - 10); ctx.rotate(weaponRot); ctx.translate(0, 10);
	  // --- STOCK ---
        ctx.fillStyle = "#5d4037"; 
        ctx.fillRect(0, -10, 16, 3); // The wooden body
        
        // --- MOUNTING POINT FOR PROD ---
        // This ensures the bow limbs meet the wood BEFORE the stirrup starts
        let mountX = 16;
        // --- THE STIRRUP (FULL CIRCLE AT FRONT) ---
        let stirrupX = 16;       // At the very tip of the stock
        let stirrupY = -8.5;     // Centered vertically with the bolt/prod
        let stirrupRadius = 3.5; // Adjusted size to look like a hoop
        
        ctx.strokeStyle = "#424242"; 
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        // Drawing a nearly full circle (0 to 1.8 PI) to leave a tiny gap where it meets the wood
        ctx.arc(stirrupX + stirrupRadius, stirrupY, stirrupRadius, 0, Math.PI * 2);
        ctx.stroke();

        
        if (showFoot) { 
            // Foot inside stirrup - adjusted color to match boots
            ctx.fillStyle = "#3e2723"; ctx.beginPath(); ctx.arc(17.5, -8.5, 2.5, 0, Math.PI*2); ctx.fill(); 
        }

        // ... (rest of the Prod Render code remains the same)
     // --- PROD RENDER (REVISED: ALIGNED & COMPACT) ---
        let scale = isPoison ? 0.8 : (isHeavy ? 1.4 : 1.0); // Slightly tighter scale for heavy
        ctx.strokeStyle = "#1a1a1a"; 
        ctx.lineWidth = isHeavy ? 2.5 : 2; 

  
        let anchorX = mountX - (4.5 * scale); 
        
        let tY = -8.5 - (6.5 * scale), bY = -8.5 + (6.5 * scale); // Limbs slightly shorter for "smaller" look
        let flex = (stringPull * 0.3); 
        
        ctx.beginPath();
if (isHeavy) {
 
 

            // --- 2. HEAVY RECURVE (The Prod) ---
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = "#3e2723"; 
            ctx.lineCap = "round";

            let cpX = mountX + (3.5 * scale) - flex; 
            let cpYOffset = 4.0 * scale; 

            ctx.beginPath();
            ctx.moveTo(anchorX, tY); 
            ctx.quadraticCurveTo(cpX, -8.5 - cpYOffset, mountX, -8.5);
            ctx.quadraticCurveTo(cpX, -8.5 + cpYOffset, anchorX, bY);
            ctx.stroke();

            // --- 3. REINFORCEMENT BINDINGS (Drawn Last - "On Top") ---
            // These now act as the "seal" to hide the junction
            ctx.strokeStyle = "#212121";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            for (let i = -1.0; i <= 1.0; i += 1.0) {
                // Shortened slightly to -10 and -7 so they look like they are 
                // biting into the wood of the prod rather than floating past it
                ctx.moveTo(mountX + i, -10);
                ctx.lineTo(mountX + i, -7);
            }
            ctx.stroke();
        }
		 else {
// STANDARD ARC (REVISED)
// tipOffset adds length to the vertical spread of the bow limbs
let tipOffset = 1.7 * scale; 

ctx.lineWidth = 1.7;
ctx.strokeStyle = "#5d4037"; // Dark wood tone
ctx.lineCap = "round";

ctx.beginPath();
// Starts at top tip with added length
ctx.moveTo(anchorX, tY - tipOffset);

// Control point pulled slightly further to accommodate the longer limbs
// mountX remains the center pivot to maintain stock alignment
ctx.quadraticCurveTo(
    mountX + (3.5 * scale) - flex, // Control point
    -8.5,                          // Center Y
    anchorX, bY + tipOffset        // End at bottom tip with added length
);
ctx.stroke();

// --- REINFORCED BINDINGS ---
// Adds visual weight to the junction where the prod is lashed to the stock
ctx.strokeStyle = "#263238"; // Charcoal color for sinew/cord
ctx.lineWidth = 1.2;
ctx.beginPath();

// Drawing three distinct wraps for a detailed "lashed" appearance
for (let i = -1.5; i <= 1.5; i += 1.5) {
    ctx.moveTo(mountX + i, -11.5);
    ctx.lineTo(mountX + i, -5.5);
}
ctx.stroke();
        }
        ctx.stroke();
        
        // 2. STRING (Anchored to new tip positions)
        ctx.strokeStyle = "rgba(220, 220, 220, 0.9)"; ctx.lineWidth = 0.9;
        ctx.beginPath(); 
        ctx.moveTo(anchorX, tY); 
        ctx.lineTo(anchorX - stringPull, -8.5); 
        ctx.lineTo(anchorX, bY); 
        ctx.stroke();

        // 3. BOLT (Anchored to string)
        if (hasBolt) {
            ctx.save(); 
            ctx.translate(anchorX - stringPull, -8.5);
            ctx.fillStyle = "#3e2723"; ctx.fillRect(0, -0.5, 9, 1); 
            ctx.fillStyle = isPoison ? "#4caf50" : "#9e9e9e";
            ctx.beginPath(); ctx.moveTo(9, -1.2); ctx.lineTo(13, 0); ctx.lineTo(9, 1.2); ctx.fill();
            ctx.restore();
        }

        ctx.restore();  
        ctx.restore();  
	}
}

else if (unitName && unitName.includes("Firelance")) {
	
const isHeavy = unitName.includes("Heavy");
    const hasAmmo = (typeof unit !== 'undefined' && unit.ammo > 0);
    
    // --- NEW: THE PER-BATTLE FUSE LOGIC ---
    const burnLimit = isHeavy ? 3000 : 1000; // 3 seconds for Heavy, 1 for Normal
    
    // Initialize a permanent timestamp on the unit the very first time they attack
    if (isAttacking && hasAmmo && !unit.firstFireTime) {
        unit.firstFireTime = Date.now();
    }

    // Check if the fuse has blown: 
    // If they haven't fired yet, or if they started firing less than [burnLimit] ago.
    let fuseIsActive = false;
    if (unit.firstFireTime) {
        let elapsed = Date.now() - unit.firstFireTime;
        if (elapsed < burnLimit) {
            fuseIsActive = true;
        }
    }
    // ------
    
    let animDuration = 300; 
    let cycle = 1.0; // Default to idle state
    
    if (isAttacking) {
        // Ideal scenario: Your unit object tracks when the attack started
        if (typeof unit !== 'undefined' && unit.lastAttackTime) {
            // Clamps the animation between 0.0 and 1.0, stopping cleanly when finished
            cycle = Math.min((Date.now() - unit.lastAttackTime) / animDuration, 1.0);
        } else {
            // Fallback: If you don't track start time, this uses modulo to loop 
            // the animation cleanly as long as 'isAttacking' is true.
            cycle = (Date.now() % animDuration) / animDuration;
        }
    }

    // 2. REVISED PHYSICS: Snap-Thrust & Dynamic Swing
    let isSwing = (typeof unit !== 'undefined' && unit.id && unit.id % 4 === 0) || (!hasAmmo);
    
    let thrust = 0;
    let swingY = 0; // Vertical displacement for swings

    if (isAttacking && cycle < 1.0) {
        if (cycle < 0.2) {
            // Explosive forward lunge (0% to 20% of animation)
            thrust = (cycle / 0.2) * 22; 
        } else {
            // Slower, guarded retraction (20% to 100% of animation)
            thrust = 22 * (1 - (cycle - 0.2) / 0.8);
        }
        
        // If it's a swinging strike, we add a deep vertical drop that peaks with the thrust
        if (isSwing) {
            swingY = Math.sin(cycle * Math.PI) * 10; 
        }
    }

    // Base Y offset applied to all weapon parts to simulate the swing angle
    let baseY = -8 + swingY;

    // Draw the Wooden Shaft
    ctx.strokeStyle = "#5d4037"; 
    ctx.lineWidth = 2; // Slightly thicker for a heavy polearm
    ctx.beginPath(); 
    ctx.moveTo(-4 * dir, baseY); 
    ctx.lineTo((21 + thrust) * dir, baseY); 
    ctx.stroke();

    // 3. Draw the Historical Bamboo/Paper Tubes
    ctx.fillStyle = "#2b2b2b"; // Charred bamboo look
    let tubeTopY = baseY - 3.5;
    let tubeBotY = baseY + 0.5;

    if (isHeavy) {
        // Heavy: Two tubes tied to the top and bottom of the shaft
        ctx.fillRect((14 + thrust) * dir, tubeTopY, 8 * dir, 3.5); 
        ctx.fillRect((14 + thrust) * dir, tubeBotY, 8 * dir, 3.5);  
        
        // Hemp twine ties (Moving dynamically with thrust)
        ctx.strokeStyle = "#8d6e63"; 
        ctx.lineWidth = 1.2;
        
        // Front Tie
        ctx.beginPath(); 
        ctx.moveTo((15 + thrust) * dir, tubeTopY - 0.5); 
        ctx.lineTo((15 + thrust) * dir, tubeBotY + 4); 
        ctx.stroke();
        
        // Back Tie
        ctx.beginPath(); 
        ctx.moveTo((20 + thrust) * dir, tubeTopY - 0.5); 
        ctx.lineTo((20 + thrust) * dir, tubeBotY + 4); 
        ctx.stroke();
    } else {
        // Standard: Single tube lashed securely to the top
        ctx.fillRect((14 + thrust) * dir, tubeTopY, 8 * dir, 4);
        
        ctx.strokeStyle = "#8d6e63"; 
        ctx.lineWidth = 1.2;
        ctx.beginPath(); 
        ctx.moveTo((16 + thrust) * dir, tubeTopY - 0.5); 
        ctx.lineTo((16 + thrust) * dir, baseY + 1); 
        ctx.stroke();
        ctx.beginPath(); 
        ctx.moveTo((20 + thrust) * dir, tubeTopY - 0.5); 
        ctx.lineTo((20 + thrust) * dir, baseY + 1); 
        ctx.stroke();
    }

    // 4. The Spearhead
    ctx.fillStyle = "#bdbdbd"; 
    ctx.beginPath(); 
    ctx.moveTo((21 + thrust) * dir, baseY); 
    ctx.lineTo((24 + thrust) * dir, baseY - 2.5); 
    ctx.lineTo((31 + thrust) * dir, baseY); // Sharper, longer point
    ctx.lineTo((24 + thrust) * dir, baseY + 2.5); 
    ctx.closePath(); 
    ctx.fill();

    // 5. ENHANCED FIRE & EFFECTS (HUGE FLAMES)
// --- CHANGE THIS LINE ---
if (isAttacking && hasAmmo && fuseIsActive && cycle < 1.0) { 
    // Your flame drawing code...

        let firePos = isHeavy ? tubeTopY + 1.5 : tubeTopY + 2; 
        let showFire = true;
        let isIgniting = false;

        if (isHeavy) {
            // Instant Reload: A tiny gap in the animation cycle for a flash ignition
            if (cycle > 0.48 && cycle < 0.52) {
                showFire = false;
                isIgniting = true;
                firePos = tubeBotY + 1.5; // Snap to bottom tube
            } else if (cycle >= 0.52) {
                firePos = tubeBotY + 1.5; // Bottom tube firing
            }
        }

        if (isIgniting) {
            // Fast, blinding ignition spark between tubes
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc((22 + thrust) * dir, firePos, 4 + Math.random() * 3, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = "#ffeb3b";
            ctx.beginPath();
            ctx.arc((22 + thrust) * dir, firePos, 2 + Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
        } else if (showFire) {
            // MASSIVE Flame Jet (Historical gunpowder payload)
            let flameLen = 80 + Math.random() * 120; // Pushed from ~20 to ~200 max length!
            let flameWidth = 15 + Math.random() * 15; // Wide, billowing blast
            
            let grd = ctx.createLinearGradient((22 + thrust) * dir, firePos, (22 + thrust + flameLen) * dir, firePos);
            grd.addColorStop(0, "#ffffff"); // Blinding core
            grd.addColorStop(0.1, "#fff59d"); // Yellow hot
            grd.addColorStop(0.3, "#ff9800"); // Expanding orange
            grd.addColorStop(0.7, "#f44336"); // Searing red edges
            grd.addColorStop(1, "rgba(33, 33, 33, 0)"); // Smoky dispersion

            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.moveTo((22 + thrust) * dir, firePos);
            // Drastically widened quadratic curves for a funnel-shaped blast
            ctx.quadraticCurveTo((30 + thrust + flameLen/3) * dir, firePos - flameWidth, (22 + thrust + flameLen) * dir, firePos);
            ctx.quadraticCurveTo((30 + thrust + flameLen/3) * dir, firePos + flameWidth, (22 + thrust) * dir, firePos);
            ctx.fill();

            // Heavy shower of cinders & sparks
            ctx.fillStyle = "#ffeb3b";
            for(let i = 0; i < 12; i++) {
                let sparkX = (22 + thrust + Math.random() * (flameLen * 0.8)) * dir;
                let sparkY = firePos + (Math.random() * flameWidth - flameWidth/2);
                ctx.fillRect(sparkX, sparkY, 2 + Math.random()*2, 2 + Math.random()*2);
            }
        }
    } 
 
}

	else if (type === "gun") {
        // SURGERY: Complete Hand Cannon Reload Cycle & Direct Ignition
        let maxCd = 300;
        let cd = cooldown || 0;
        let cycle = isAttacking ? (maxCd - cd) / maxCd : 1.0;

        let gunRot = 0;
        let shakeRot = 0;
        let recoilX = 0;

        // Determine Gun Angle & Shake based on specific reload phase
        if (isAttacking && cd > 0) {
            if (cycle < 0.05) {
                // 0% - 5%: FIRING! (Heavy recoil, shaking only happens here)
                gunRot = (-Math.PI / 10) * dir;
                shakeRot = (Math.random() - 0.5) * 0.2; 
                recoilX = -4 * dir;
            } else if (cycle < 0.15) {
                // 5% - 15%: Transition to reload position
                gunRot = (Math.PI / 6) * dir; 
            } else if (cycle < 0.65) {
                // 15% - 65%: Gun pointed steeply up for loading down the muzzle
                gunRot = (Math.PI / 3) * dir; 
            } else if (cycle < 0.75) {
                // 65% - 75%: Lowering slightly to access the touchhole (priming)
                gunRot = (Math.PI / 8) * dir; 
            } else {
                // 75% - 100%: Leveling out, holding fuse, lighting
                gunRot = 0; 
            }
        }

        ctx.save();
        ctx.translate(recoilX, weaponBob); // Removed random bobbing; keeping it smooth
        ctx.rotate(gunRot + shakeRot);

        // Tiller (Wooden Stock) - NO TRIGGER
        ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(6 * dir, -5); ctx.stroke();
        
        // Barrel (Iron)
        ctx.strokeStyle = "#424242"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(6 * dir, -5); ctx.lineTo(16 * dir, -5); ctx.stroke();

        // Hands & Elaborate Reloading Action
        ctx.fillStyle = "#ffccbc";
        ctx.beginPath(); ctx.arc(2 * dir, -5, 2, 0, Math.PI*2); ctx.fill(); // Back hand holding tiller
        
        if (isAttacking && cd > 0) {
            if (cycle >= 0.15 && cycle < 0.25) { 
                // 1. Pouring Powder
                let drop = (cycle - 0.15) * 10; // Animation progress (0 to 1)
                ctx.beginPath(); ctx.arc(18 * dir, -12, 2, 0, Math.PI*2); ctx.fill(); // Hand
                ctx.fillStyle = "#795548"; ctx.fillRect(16 * dir, -16, 4 * dir, 6); // Flask
                ctx.fillStyle = "#212121"; ctx.fillRect(17.5 * dir, -10 + (drop * 4), 1.5 * dir, 2); // Powder falling
            } 
            else if (cycle >= 0.25 && cycle < 0.32) { 
                // 2. Inserting Projectile
                let drop = (cycle - 0.25) * 14; 
                ctx.beginPath(); ctx.arc(18 * dir, -10, 2, 0, Math.PI*2); ctx.fill(); // Hand
                ctx.fillStyle = "#424242"; ctx.beginPath(); ctx.arc(18 * dir, -8 + (drop * 3), 1.5, 0, Math.PI*2); ctx.fill(); // Iron ball
            } 
            else if (cycle >= 0.32 && cycle < 0.40) { 
                // 3. Inserting Wadding
                let drop = (cycle - 0.32) * 12; 
                ctx.beginPath(); ctx.arc(18 * dir, -10, 2, 0, Math.PI*2); ctx.fill(); // Hand
                ctx.fillStyle = "#d7ccc8"; ctx.beginPath(); ctx.arc(18 * dir, -8 + (drop * 3), 1.5, 0, Math.PI*2); ctx.fill(); // Wadding
            } 
            else if (cycle >= 0.40 && cycle < 0.65) { 
                // 4. Ramming down the barrel
                let ramMove = Math.sin((cycle - 0.40) * Math.PI * 12) * 5; // Up and down motions
                ctx.beginPath(); ctx.arc((18 + ramMove) * dir, -5, 2, 0, Math.PI*2); ctx.fill(); // Hand
                ctx.strokeStyle = "#8d6e63"; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo((18 + ramMove) * dir, -5); ctx.lineTo((8 + ramMove) * dir, -5); ctx.stroke(); // Ramrod
            } 
            else if (cycle >= 0.65 && cycle < 0.75) { 
                // 5. Priming the touchhole
                ctx.beginPath(); ctx.arc(6 * dir, -8, 2, 0, Math.PI*2); ctx.fill(); // Hand at breech
                ctx.fillStyle = "#212121"; ctx.fillRect(5.5 * dir, -6, 1.5 * dir, 1.5); // Pinch of powder
            } 
            else if (cycle >= 0.90 && cycle < 1.0) { 
                // 6. Lighting the fuse
                ctx.beginPath(); ctx.arc(6 * dir, -8, 2, 0, Math.PI*2); ctx.fill(); // Hand bringing fuse down
                ctx.strokeStyle = "#e65100"; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(6 * dir, -8); ctx.lineTo(7 * dir, -5.5); ctx.stroke(); // Slow match
                ctx.fillStyle = "#ffeb3b"; ctx.beginPath(); ctx.arc(7 * dir, -5.5, 1.5 + Math.random(), 0, Math.PI*2); ctx.fill(); // Sparks!
            } 
            else {
                // Idle / Resting / Waiting for next phase
                ctx.beginPath(); ctx.arc(8 * dir, -5, 2, 0, Math.PI*2); ctx.fill(); 
            }
        } else {
            // Not attacking - Normal front hand resting
            ctx.beginPath(); ctx.arc(8 * dir, -5, 2, 0, Math.PI*2); ctx.fill(); 
        }

        // Muzzle Flash & Smoke (Only triggers in the first 5% of the cooldown cycle)
        if (isAttacking && cycle < 0.05) { 
            ctx.fillStyle = "#ffeb3b"; // Core flash
            ctx.beginPath(); ctx.arc(18 * dir, -5, 3 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
            
            ctx.fillStyle = "#ff5722"; // Secondary flame
            ctx.beginPath(); ctx.arc(22 * dir, -5, 6 + Math.random() * 4, 0, Math.PI * 2); ctx.fill();
            
            ctx.fillStyle = "rgba(140, 140, 140, 0.6)"; // Smoke expanding
            ctx.beginPath(); ctx.arc(26 * dir, -5, 8 + Math.random() * 5, 0, Math.PI * 2); ctx.fill();
        }

        ctx.restore();
    }
	else if (unitName && unitName.includes("Bomb")) {
    // Ammo lookup
    let currentAmmo = 0;
    if (typeof unit !== 'undefined' && unit.ammo !== undefined) {
        currentAmmo = unit.ammo;
    } else if (typeof unitAmmo !== 'undefined') {
        currentAmmo = unitAmmo;
    }

    const hasAmmo = currentAmmo > 0;
    const isNull = currentAmmo <= 0; // last ammo spent -> null/catch state

    // Safer bob fallback
    let weaponBob = (typeof bob !== 'undefined') ? bob : 0;

    // --- 1. OFF-HAND & BOMB LOGIC ---
    let offHandX = -4 * dir;
    let offHandY = -4 + weaponBob;

    // When out of ammo, drop into the null/catch pose
    if (isNull) {
        offHandX = -2.5 * dir;
        offHandY = -1 + weaponBob;
    }

    if (hasAmmo) {
        // Optional throw movement while ammo remains
        let maxCd = 1200;
        let currentCd = (typeof cooldown !== 'undefined') ? cooldown : 0;

        if (isAttacking && currentCd > 0) {
            let throwCycle = (maxCd - currentCd) / maxCd;
            if (throwCycle < 0.3) {
                offHandX -= 2 * dir;
                offHandY -= 2;
            } else if (throwCycle < 0.6) {
                offHandX += 4 * dir;
                offHandY -= 4;
            }
        }

        // Bomb body
        ctx.fillStyle = "#546e7a";
        let bombRadius = 3.5;

        ctx.beginPath();
        ctx.arc(offHandX, offHandY - 3, bombRadius, 0, Math.PI * 2);
        ctx.fill();

        // Spikes
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            let angle = (i / 8) * Math.PI * 2;
            let spikeX = offHandX + Math.cos(angle) * (bombRadius + 1.5);
            let spikeY = (offHandY - 3) + Math.sin(angle) * (bombRadius + 1.5);
            ctx.moveTo(offHandX, offHandY - 3);
            ctx.lineTo(spikeX, spikeY);
        }
        ctx.strokeStyle = "#455a64";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Fuse
        ctx.strokeStyle = "#5d4037";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(offHandX, offHandY - 6);
        ctx.bezierCurveTo(
            offHandX - 2 * dir, offHandY - 10,
            offHandX - 5 * dir, offHandY - 8,
            offHandX - 6 * dir, offHandY - 12
        );
        ctx.stroke();
    }

    // Hand always draws, including null state
    ctx.fillStyle = "#ffccbc";
    ctx.beginPath();
    ctx.arc(offHandX, offHandY, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // --- 2. MAIN HAND: THE SHORT DAO ---
    let meleeSpeed = 130;
    let currentCd = (typeof cooldown !== 'undefined') ? cooldown : 0;

    let cycle = 0;
    if (isAttacking) {
        cycle = Math.min(1, (meleeSpeed - (currentCd % meleeSpeed)) / meleeSpeed);
        if (currentCd > meleeSpeed) cycle = 0;
    }

    let thrust = 0, swing = 0, handOffsetY = 0;
    let attackSeed = (unit && unit.id) ? (unit.id % 3) : (Math.floor(x + y) % 3);

    if (isAttacking && cycle > 0 && cycle < 1) {
        if (cycle < 0.15) {
            let p = cycle / 0.15;
            if (attackSeed === 0) {
                thrust = -5 * p;
                swing = -0.2 * p;
            } else if (attackSeed === 1) {
                thrust = -2 * p;
                swing = -Math.PI / 1.8 * p;
                handOffsetY = -5 * p;
            } else {
                thrust = -2 * p;
                swing = Math.PI / 1.2 * p;
            }
        } else if (cycle < 0.45) {
            let p = (cycle - 0.15) / 0.3;
            let ease = p * (2 - p);
            if (attackSeed === 0) {
                thrust = -5 + (ease * 18);
                swing = -0.2 + (ease * 0.5);
            } else if (attackSeed === 1) {
                thrust = -2 + (ease * 8);
                swing = -Math.PI / 1.8 + (ease * Math.PI * 0.9);
                handOffsetY = -5 + (ease * 10);
            } else {
                thrust = -2 + (ease * 12);
                swing = Math.PI / 1.2 - (ease * Math.PI * 1.4);
            }
        } else {
            let p = (cycle - 0.45) / 0.55;
            let recoveryEase = Math.pow(1 - p, 2);
            thrust = (attackSeed === 0 ? 13 : 6) * recoveryEase;
            swing = (attackSeed === 1 ? 0.4 : 0) * recoveryEase;
            handOffsetY = (attackSeed === 1 ? 5 : 0) * recoveryEase;
        }
    }

    ctx.save();
    ctx.translate((4 + thrust) * dir, (-6 + handOffsetY) + weaponBob);

    let baseRotation = (attackSeed === 2) ? -Math.PI / 1.6 : Math.PI / 4;
    ctx.rotate((baseRotation + swing) * dir);

    // Shadow / depth
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(0, 0, 1.5 * dir, -12);

    // Blade
    ctx.fillStyle = (unit && unit.id % 5 === 0) ? "#8d8d8d" : "#a1a1a1";
    ctx.beginPath();
    ctx.moveTo(-1.3, 0);
    ctx.lineTo(-1.3, -13);
    ctx.lineTo(1.5, -10);
    ctx.lineTo(1.5, 0);
    ctx.closePath();
    ctx.fill();

    // Edge detail
    ctx.strokeStyle = "#cfd8dc";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(1.5, 0);
    ctx.lineTo(1.5, -10);
    ctx.stroke();

    // Guard
    ctx.strokeStyle = "#263238";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-2.5, 0);
    ctx.lineTo(2.5, 0);
    ctx.stroke();

    // Grip
    ctx.strokeStyle = "#4e342e";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 5);
    ctx.stroke();

    // Ring pommel
    ctx.strokeStyle = "#263238";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 7, 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();

    // Main hand
    ctx.fillStyle = "#ffccbc";
    ctx.beginPath();
    ctx.arc((4 + thrust) * dir, (-6 + handOffsetY) + weaponBob, 2.8, 0, Math.PI * 2);
    ctx.fill();
}

 else if (unitName?.toLowerCase().includes("ocket") || unitName?.includes("Hwacha") || type === "rocket" || type === "hwacha") {
    // 1. Logic Setup
    // Use 'unitAmmo' from the function arguments, not 'unit.ammo'
    const currentAmmo = (typeof unitAmmo !== 'undefined') ? unitAmmo : 0;
    const hasAmmo = currentAmmo > 0;
    const thrust = (isAttacking && hasAmmo) ? (Math.random() * 2) : 0; 

    // 2. Draw the Cart (ISOLATED TRANSLATION)
    ctx.save(); 
    ctx.translate(15 * dir, 2 + bob); // Move to cart position

    // Wheels
    ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 2;
    let wheelSpin = moving ? (Date.now() / 100) : 0;
    for (let sideOffset of [-8, 8]) {
        ctx.save();
        ctx.translate(0, 6);
        ctx.rotate(wheelSpin * dir);
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke();
        ctx.restore();
    }

    // Main Frame
    ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-12 * dir, 2); ctx.lineTo(8 * dir, 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-12 * dir, 2); ctx.lineTo(-18 * dir, -4); ctx.stroke();

    // The Launch Box
    ctx.fillStyle = "#4e342e";
    ctx.fillRect(-6 * dir, -12, 12 * dir, 14);
    ctx.strokeStyle = "#212121"; ctx.lineWidth = 1;
    ctx.strokeRect(-6 * dir, -12, 12 * dir, 14);

    // Rocket Tips & Firing Effects
    if (hasAmmo) {
        ctx.fillStyle = "#212121";
        let rows = 6, cols = 5, spacing = 2, count = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (count < currentAmmo) {
                    let ax = (6 * dir) + (thrust * dir);
                    let ay = -10 + (r * spacing);
                    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + (4 * dir), ay + 1); ctx.lineTo(ax, ay + 2); ctx.fill();
                }
                count++;
            }
        }
        if (isAttacking) {
            ctx.fillStyle = "rgba(255, 160, 0, 0.8)";
            ctx.beginPath(); ctx.arc(10 * dir, -6, 4 + Math.random() * 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "rgba(150, 150, 150, 0.5)";
            ctx.beginPath(); ctx.arc(8 * dir, -4, 6 + Math.random() * 6, 0, Math.PI * 2); ctx.fill();
        }
    }
    ctx.restore(); // <--- CRITICAL: Returns coordinates back to the Man's center

    // 3. Draw the Operator (The Man)
  //  ctx.fillStyle = factionColor; 
//ctx.fillRect(-3, -10 + bob, 6, 10); // Body

    // Forward Hand (Holding cart handle)
    ctx.fillStyle = "#ffccbc";
    ctx.beginPath(); 
    ctx.arc(4 * dir, -2 + bob, 2.5, 0, Math.PI * 2); 
    ctx.fill();

    // 4. Draw the Spear (Opposite Hand / Back Hand)
    let stabX = 0, stabY = 0;
    let spearRot = (Math.PI / -6) * dir;

    if (!hasAmmo && isAttacking) {
        let stabCycle = (Date.now() / 200) % 1.0; 
        stabX = Math.sin(stabCycle * Math.PI) * 12;
        stabY = Math.sin(stabCycle * Math.PI) * 2;
        spearRot = (Math.PI / 12) * dir;
    }

    ctx.save(); 
    ctx.translate((-8 + stabX) * dir, -8 + bob + stabY); // Back position
    ctx.rotate(spearRot);
    
    // Spear Shaft & Head
    ctx.strokeStyle = "#4e342e"; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, -28); ctx.stroke();
    ctx.fillStyle = "#bdbdbd";
    ctx.beginPath(); ctx.moveTo(-1.5, -28); ctx.lineTo(0, -36); ctx.lineTo(1.5, -28); ctx.fill();
    ctx.restore(); // <--- CRITICAL: Returns coordinates back to the Man's center

    // 5. Spear Hand (Drawn last so it's on top)
    ctx.fillStyle = "#ffccbc";
    ctx.beginPath();
    ctx.arc((-8 + stabX) * dir, -8 + bob + stabY, 2.5, 0, Math.PI * 2);
    ctx.fill();

} 

else if (type === "shortsword" || (typeof unit !== 'undefined' && unit.stats && unit.stats.isRanged && unit.stats.ammo <= 0 && type !== "javelinier")) {
    
    // --- 1. OVERRIDE SLOW RELOAD TIMING ---
    // Even if the unit is a Bomber (1200ms), the SWING should only take 600ms.
    let meleeSpeed = 130; 
    let currentCd = (typeof cooldown !== 'undefined') ? cooldown : 0;
    
    // We 'clamp' the cycle so the sword swing finishes quickly even if the reload is slow
    let cycle = 0;
    if (isAttacking) {
        // This math ensures the animation completes in the first 600ms of the cooldown
        cycle = Math.min(1, (meleeSpeed - (currentCd % meleeSpeed)) / meleeSpeed);
        // If the actual cooldown is much longer than meleeSpeed, stay in 'idle' after one swing
        if (currentCd > meleeSpeed) cycle = 0; 
    }
    
    let thrust = 0, swing = 0, handOffsetY = 0;
    let attackSeed = (unit && unit.id) ? (unit.id % 3) : (Math.floor(x + y) % 3);

    // --- 2. COMBAT REALISTIC ANIMATION ---
    if (isAttacking && cycle > 0 && cycle < 1) {
        if (cycle < 0.15) { // Snappier wind-up
            let p = cycle / 0.15;
            if (attackSeed === 0) { thrust = -5 * p; swing = -0.2 * p; } // Deep Stab Prep
            else if (attackSeed === 1) { thrust = -2 * p; swing = -Math.PI/1.8 * p; handOffsetY = -5 * p; } // High Overhead
            else { thrust = -2 * p; swing = Math.PI/1.2 * p; } // Backhand Flip
        } else if (cycle < 0.45) { // Explosive Strike
            let p = (cycle - 0.15) / 0.3;
            let ease = p * (2 - p); // Power easing
            if (attackSeed === 0) { thrust = -5 + (ease * 18); swing = -0.2 + (ease * 0.5); }
            else if (attackSeed === 1) { thrust = -2 + (ease * 8); swing = -Math.PI/1.8 + (ease * Math.PI * 0.9); handOffsetY = -5 + (ease * 10); }
            else { thrust = -2 + (ease * 12); swing = Math.PI/1.2 - (ease * Math.PI * 1.4); }
        } else { // Realistic Recovery (Slow down at the end)
            let p = (cycle - 0.45) / 0.55;
            let recoveryEase = Math.pow(1 - p, 2);
            thrust = (attackSeed === 0 ? 13 : 6) * recoveryEase;
            swing = (attackSeed === 1 ? 0.4 : 0) * recoveryEase;
            handOffsetY = (attackSeed === 1 ? 5 : 0) * recoveryEase;
        }
    }

    ctx.save();
    ctx.translate((4 + thrust) * dir, (-6 + handOffsetY) + (typeof bob !== 'undefined' ? bob : 0));
    
    // Base rotation depends on style (Style 2 is a "flipped" grip)
    let baseRotation = (attackSeed === 2) ? -Math.PI / 1.6 : Math.PI / 4; 
    ctx.rotate((baseRotation + swing) * dir);

    // --- 3. DRAW REALISTIC STRAIGHT DAO ---
    
    // Shadow/Blade Depth
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(0, 0, 1.5 * dir, -12);

    // Blade (Single Edge, Straight Back, Cheap Iron)
    ctx.fillStyle = (unit && unit.id % 5 === 0) ? "#8d8d8d" : "#a1a1a1"; // Variable wear
    ctx.beginPath();
    ctx.moveTo(-1.3, 0);       
    ctx.lineTo(-1.3, -13);     // Straight back
    ctx.lineTo(1.5, -10);      // Clipped tip
    ctx.lineTo(1.5, 0);        // Cutting edge
    ctx.closePath();
    ctx.fill();
    
    // The "Cheap" Edge Detail
    ctx.strokeStyle = "#cfd8dc"; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(1.5, 0); ctx.lineTo(1.5, -10); ctx.stroke();

    // Guard (Small, thick iron disc)
    ctx.strokeStyle = "#263238"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-2.5, 0); ctx.lineTo(2.5, 0); ctx.stroke();

    // Grip
    ctx.strokeStyle = "#4e342e"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 5); ctx.stroke();

    // Ring Pommel
    ctx.strokeStyle = "#263238"; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 7, 2, 0, Math.PI * 2); 
    ctx.stroke();

    ctx.restore();

    // 4. Draw Hand (Properly layered)
    ctx.fillStyle = "#ffccbc";
    ctx.beginPath();
    ctx.arc((4 + thrust) * dir, (-6 + handOffsetY) + (typeof bob !== 'undefined' ? bob : 0), 2.8, 0, Math.PI * 2);
    ctx.fill();
}

ctx.restore(); // 2. CRITICAL: Restores the GLOBAL unit position save from the top of the function
} // End of drawInfantryUnit function