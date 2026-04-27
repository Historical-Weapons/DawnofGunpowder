// unit-encyclopedia.js
(function() {
    window.getEncyclopediaData = function() {
        if (!window.UnitRoster || !window.UnitRoster.allUnits) return [];

        const weightMap = {
            1: "Light Infantry",
            2: "Infantry",
            3: "Cavalry",
            4: "Heavy Cavalry",
            5: "Elephant"
        };

        const armorMap = {
            2: "Cloth",
            8: "Leather",
            15: "Light Lamellar",
            25: "Lamellar",
            40: "Heavy Lamellar",
            45: "Elite",
            60: "Elephant Skin"
        };

        let encyclopediaData = [];

        for (let id in window.UnitRoster.allUnits) {
            let u = window.UnitRoster.allUnits[id];
            
            // 1. Build the shared stats
            let baseStats = {
                weightClass: weightMap[u.weightTier] || "Unknown",
                isRanged: !!u.isRanged,
                health: u.health || u.maxHealth || 100,
                meleeAttack: u.meleeAttack || 0,
                meleeDefense: u.meleeDefense || 0,
            armor: u.armor || 0,
                bonusVsLarge: u.bonusVsLarge || 0,
                speed: u.speed || 0,
                morale: u.morale || 0,
                cost: u.cost || 0
            };

            // 2. Only add these keys if it's a ranged unit
            // Gunpowder/Archers get these; Spearmen/Swordmen do NOT
            if (u.isRanged) {
                baseStats.ammo = u.ammo || 0;
                baseStats.missileBaseDamage = u.missileBaseDamage || 0;
                baseStats.missileAPDamage = u.missileAPDamage || 0;
                baseStats.accuracy = u.accuracy || 0;
    let displayRange = u.range || 0;

    // SPECIAL CASE: Repeater Crossbowman practical range
    if (u.name === "Repeater Crossbowman") {   // <-- change to your unit name
        displayRange = Math.floor(displayRange / 2);
    }
	     
    if (u.name === "Hand Cannoneer") {   // <-- change to your unit name
        displayRange = Math.floor(displayRange / 2);
    }
		    if (u.name === "Rocket") {   // <-- change to your unit name
        displayRange = Math.floor(displayRange / 2);
    }
	    if (u.name === "Bomb") {   // <-- change to your unit name
        displayRange = Math.floor(displayRange / 3);
    }
	
	if (u.name === "Camel Cannon") {   // <-- change to your unit name
        displayRange = Math.floor(displayRange / 2);
    }
	
	 baseStats.range = displayRange/4;
            }
            
            encyclopediaData.push({
                name: u.name,
                desc: u.desc || "Unit Description.",
                mounted: u.isLarge,
                renderMode: u.isLarge ? "cavalry" : "infantry",
                renderType: "peasant", 
                stats: baseStats // <--- FIX: We use the variable we just built!
            });
        }
        
        return encyclopediaData.sort((a, b) => a.name.localeCompare(b.name));
    };
})();