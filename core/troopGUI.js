// ============================================================================
// DAWN OF GUNPOWDER - SETTLEMENT UPGRADE MENU
// ============================================================================

const troopGUI= {
    isOpen: false,
    
    // Base upgrade costs. You can tweak these!
    costs: {
        "Militia": 15,          
        "Tier1": 35,            
        "Tier2": 80,            
        "TierUnique": 150,      // Cost for Faction Unique Units
        "RecruitUnique": 200    // Cost to recruit directly without a Militia
    },

    // Hierarchy logic
    hierarchy: {
        "Militia": ["Crossbowman", "Javelinier", "Spearman", "Archer", "Shielded Infantry", "Bomb"],
        "Crossbowman": ["Heavy Crossbowman"],
        "Heavy Crossbowman": [], 
        "Javelinier": ["Firelance"],
        "Firelance": ["Heavy Firelance"],
        "Heavy Firelance": [],
        "Spearman": ["Lancer"],
        "Lancer": ["Heavy Lancer"],
		"Heavy Lancer": [],
        "Archer": ["Horse Archer"],
        "Horse Archer": ["Heavy Horse Archer"],
        "Shielded Infantry": ["Light Two Handed"],
        "Light Two Handed": ["Heavy Two Handed"],
        "Bomb": ["Hand Cannoneer"],
        "Hand Cannoneer": []
    },

// Faction Unique Map
    faction_uniques: {
        "goryun kingdom": "Rocket",          // Was "korean"
        "great khaganate": "Keshig",       // Was "mongol"
        "jinlord confederacy": "Elite Lancer", // Was "jurchen"
        "xiaran dominion": "Camel Cannon",   // Was "xia"
        "tran realm": "Poison Crossbowman",// Was "viet"
        "dali tribes": "War Elephant",// Was "persian"
        "hong dynasty": "Repeater Crossbowman",// Was "hong"
        "high plateau kingdoms": "Slinger",  // Was "tibetan"
        "yamato clans": "Glaiveman"          // Was "japanese"
    },
    
    init() {
        if (document.getElementById("settlement-upgrade-menu")) return;

        this.overlayDiv = document.createElement('div');
        this.overlayDiv.id = "settlement-upgrade-overlay";
        Object.assign(this.overlayDiv.style, {
            position: "fixed", top: "0", left: "0",
            width: "100vw", height: "100vh",
            backgroundColor: "rgba(0, 0, 0, 0.8)", 
            zIndex: "2999", display: "none",
            pointerEvents: "auto" 
        });

        this.menuDiv = document.createElement('div');
        this.menuDiv.id = "settlement-upgrade-menu";
        Object.assign(this.menuDiv.style, {
            position: "fixed", top: "5%", left: "5%",
            width: "90vw", height: "90vh",
            backgroundColor: "rgba(20, 15, 10, 0.98)",
            border: "2px solid #d4b886", padding: "20px",
            color: "#fff", display: "none", zIndex: "3000",
            fontFamily: "monospace", 
            boxSizing: "border-box",
            boxShadow: "0 10px 50px rgba(0,0,0,1)",
            flexDirection: "column" 
        });

        document.body.appendChild(this.overlayDiv);
        document.body.appendChild(this.menuDiv);
    },

    openUpgradeMenu() {
        this.isOpen = true;
        if (!this.menuDiv) this.init(); 
        this.overlayDiv.style.display = "block";
        this.menuDiv.style.display = "flex"; 
        this.renderMenu();
    },

    closeUpgradeMenu() {
        this.isOpen = false;
        if (this.overlayDiv) this.overlayDiv.style.display = "none";
        if (this.menuDiv) this.menuDiv.style.display = "none";
    },

    toggle() {
        if (this.isOpen) {
            this.closeUpgradeMenu();
        } else {
            this.openUpgradeMenu();
        }
    },
    
    getUpgradeCost(baseUnitType, targetType) {
        if (Object.values(this.faction_uniques).includes(targetType)) return this.costs["TierUnique"];
        if (baseUnitType.toLowerCase() === "militia") return this.costs["Militia"];
        if (baseUnitType.includes("Heavy") || baseUnitType.includes("Firelance") || baseUnitType.includes("Horse")) return this.costs["Tier2"];
        return this.costs["Tier1"]; 
    },

    getPlayerTroopCounts() {
        let counts = {};
        if (!player.roster) return counts;
        player.roster.forEach(unit => {
            // FIX: Normalize capitalization so "militia" merges with "Militia"
            let rawType = unit.type || unit.name; 
            if (!rawType) return;
            
            // Capitalize first letter of every word just in case
            let type = rawType.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            
            // Special case fix for "Light Two Handed" vs "Light two handed" etc
            if (type.toLowerCase() === "militia") type = "Militia";

            counts[type] = (counts[type] || 0) + 1;
        });
        return counts;
    },

recruitDirectly(unitType, cost) {
        if (player.gold < cost) {
            if(typeof AudioManager !== 'undefined') AudioManager.playSound('error');
            return;
        }

        if(typeof AudioManager !== 'undefined') AudioManager.playSound('gold_buy');
        player.gold -= cost;
        
        // CRITICAL FIX: Tell the world map engine that our total headcount increased!
        if (typeof player !== 'undefined') {
            player.troops = (player.troops || 0) + 1;
        }

        // GARRISON DEDUCTION: One soldier leaves the city to join the player's roster
        // This mirrors the same deduction done in recruitMilitiaFromCity() for regular militia.
        if (typeof activeCity !== 'undefined' && activeCity) {
            activeCity.troops = Math.max(0, (activeCity.troops || 0) - 1);
            activeCity.pop    = Math.max(0, (activeCity.pop    || 0) - 1);
            // Refresh city panel if visible
            const garEl = document.getElementById('city-garrison');
            const popEl = document.getElementById('city-pop');
            if (garEl) garEl.innerText = Math.floor(activeCity.troops).toLocaleString();
            if (popEl) popEl.innerText = Math.floor(activeCity.pop).toLocaleString();
        }
        
        // Lookup faction and basic role (default to gunner for Uniques)
        const currentFaction = this.getCurrentFaction();
        
        player.roster.push({
            type: unitType,
            name: unitType,
            hp: 100,
            faction: currentFaction, // Added to track faction allegiance
            role: "infantry" // Placeholder - will be updated by UnitRoster on spawn
        }); 
        
        this.renderMenu(); 
    },

    upgradeUnit(oldType, newType, cost) {
        if (player.gold < cost) {
            if(typeof AudioManager !== 'undefined') AudioManager.playSound('error');
            if (typeof showGameToast === 'function') {
                showGameToast(`Need ${cost}g to upgrade to ${newType}! (Have ${Math.floor(player.gold)}g)`, true);
            } else {
                alert("Not enough gold, Commander!");
            }
            return;
        }

        // Case-insensitive find to prevent bugs
        let unitIndex = player.roster.findIndex(u => {
            let uType = (u.type || u.name || "").toLowerCase();
            return uType === oldType.toLowerCase();
        });

        if (unitIndex === -1) {
            alert(`No ${oldType} available to upgrade!`);
            return;
        }

        if(typeof AudioManager !== 'undefined') AudioManager.playSound('gold_buy');
        player.gold -= cost;
        player.roster[unitIndex].type = newType; 
        player.roster[unitIndex].name = newType;

        // CITY TREASURY: The gold spent on upgrades goes to the settlement providing
        // the training/equipment. Garrison pop is NOT reduced (no new conscripts;
        // this is an existing soldier being retrained and re-equipped).
        if (typeof activeCity !== 'undefined' && activeCity) {
            activeCity.gold = (activeCity.gold || 0) + cost;
            const goldEl = document.getElementById('city-gold');
            if (goldEl) goldEl.innerText = Math.floor(activeCity.gold).toLocaleString();
        }
        
        this.renderMenu();
    },

// Inside troopGUI.js
    getCurrentFaction() {
        // FIX: Check 'activeCity' (from index.html) instead of 'currentSettlement'
        if (typeof activeCity !== 'undefined' && activeCity && activeCity.faction) {
            return activeCity.faction.toLowerCase();
        } else if (typeof player !== 'undefined' && player.faction) {
            return player.faction.toLowerCase();
        }
        return "generic"; 
    },
	
	
renderMenu() {
    if (!player || !player.roster) {
        this.menuDiv.innerHTML = "<p style='text-align: center; font-size: 24px;'>No unit data found.</p>";
        return;
    }
    
    let troopCounts = this.getPlayerTroopCounts();
    let totalTroops = player.roster.length; 
    
    // 1. FACTION & UNIQUE UNIT SETUP
    let currentFaction = (this.getCurrentFaction() || "").toLowerCase().trim();
    let uniqueUnit = this.faction_uniques[currentFaction] || null;
            
 // --- REPLACE WITH THIS ---
let recruitCost = 200; // Default fallback
if (uniqueUnit && typeof UnitRoster !== 'undefined' && UnitRoster.allUnits[uniqueUnit]) {
    // This pulls the "cost: 20" or "cost: 50" directly from your troop_system data
    recruitCost = UnitRoster.allUnits[uniqueUnit].cost || 100;
}


    let canAffordRecruit = player.gold >= recruitCost;
    let uniqueExists = uniqueUnit && typeof UnitRoster !== 'undefined' && UnitRoster.allUnits[uniqueUnit] !== undefined;

    // 2. TOP DIRECT-RECRUIT BUTTON LOGIC
    let buttonText = "NO UNIQUE UNIT";
    let btnColor = "linear-gradient(to bottom, #424242, #212121)";
    let cursor = "not-allowed";
    let opacity = "0.6";
    let clickAction = `onclick="alert('No unique units for this faction')"`;
    let btnFontSize = "1.1rem"; 

    if (uniqueUnit) {
        // Dynamic scaling based on name length
        if (uniqueUnit.length > 20) btnFontSize = "0.75rem";
        else if (uniqueUnit.length > 15) btnFontSize = "0.9rem";

        if (!uniqueExists) {
            buttonText = `[WIP] ${uniqueUnit}`;
            btnColor = "linear-gradient(to bottom, #424242, #212121)";
            cursor = "not-allowed";
            opacity = "0.5";
            clickAction = ""; // Disable
        } else if (canAffordRecruit) {
           // COSMETIC CHANGE: "Recruit [UnitName] ([Cost] gold)"
 // 1. Set the dynamic text
buttonText = `RECRUIT ${uniqueUnit.toUpperCase()} (${recruitCost} GOLD)`;

// 2. ADD THIS LINE: Dynamically adjust font size based on text length
btnFontSize = buttonText.length > 25 ? "0.7rem" : (buttonText.length > 20 ? "0.85rem" : "1.1rem");

// 3. Apply the rest of your logic
btnColor = "linear-gradient(to bottom, #6a1b9a, #4a148c)"; 
cursor = "pointer";
opacity = "1";
clickAction = `onclick="troopGUI.recruitDirectly('${uniqueUnit}', ${recruitCost})"`;
		} else {
            // STATE: NOT ENOUGH GOLD
            buttonText = `NEED ${recruitCost}G: ${uniqueUnit}`; 
            btnColor = "linear-gradient(to bottom, #b71c1c, #7f0000)"; // Red
            cursor = "not-allowed";
            opacity = "0.8";
            clickAction = ""; // Disable click
        }
    }

    let recruitBtnHTML = `
    <button ${clickAction}
        style="background: ${btnColor}; color: white; border: 1px solid #d4b886; padding: 12px 10px; 
        cursor: ${cursor}; opacity: ${opacity}; font-family: 'Georgia', serif; font-weight: bold; 
        font-size: ${btnFontSize}; border-radius: 4px; text-transform: uppercase; letter-spacing: 1px;
        max-width: 350px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: all 0.1s;">
        ${buttonText}
    </button>`;

 

    // 3. UI HEADER GENERATION
    let html = `
	

		
        <div style="flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #d4b886; padding-bottom: 15px; margin-bottom: 10px;">
            <h1 style="color: #d4b886; margin: 0; font-family: 'Georgia', serif; font-size: 2.2rem;">
                GARRISON UPGRADES 
                <span style="display: block; font-size: 1.1rem; color: #aaa; margin-top: 5px; font-style: italic;">Total Force: ${totalTroops} Men | Faction: ${currentFaction.toUpperCase()}</span>
            </h1>
            
            <div style="display: flex; gap: 20px; align-items: center;">
                ${recruitBtnHTML} 
                <div style="font-size: 1.5rem; color: #ffca28; font-weight: bold; background: rgba(0,0,0,0.5); padding: 10px 20px; border: 1px solid #ffca28; border-radius: 5px;">
                    Treasury: ${Math.floor(player.gold)} Gold
                </div>
            </div>
        </div>

	        <div style="flex-shrink: 0; padding-top: 20px; border-top: 2px solid #5d4037; margin-top: 20px; display: flex; justify-content: center;">
            <button onclick="troopGUI.closeUpgradeMenu()" 
                style="width: 60%; padding: 15px; background: #333; color: #fff; border: 2px solid #d4b886; 
                cursor: pointer; font-family: 'Georgia', serif; font-size: 1.5rem; font-weight: bold; 
                text-transform: uppercase; letter-spacing: 2px; box-shadow: 0 5px 15px rgba(0,0,0,0.8); border-radius: 6px;">
                CLOSE GARRISON MENU
            </button>
        </div>
		
 
        
        <div style="flex-grow: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px; align-content: start; padding-right: 10px;">
    `;
    
    let hasUpgrades = false;

    // Sort Militia to the top
    let sortedTroops = Object.entries(troopCounts).sort((a, b) => {
        if (a[0] === "Militia") return -1; 
        if (b[0] === "Militia") return 1;
        return a[0].localeCompare(b[0]);   
    });

    // 4. TROOP UPGRADE LOOP
    for (let [unitType, count] of sortedTroops) {
        let upgrades = [...(this.hierarchy[unitType] || [])];
        
 
        
        if (upgrades && upgrades.length > 0) {
            hasUpgrades = true;
            html += `
                <div style="background: rgba(0,0,0,0.6); border: 1px solid #5d4037; padding: 20px; border-radius: 8px; height: fit-content;">
                    <h2 style="margin: 0 0 15px 0; color: #8bc34a; font-size: 1.5rem; border-bottom: 1px dashed #5d4037; padding-bottom: 10px;">
                        ${unitType} <span style="color: #fff; font-size: 1.2rem; float: right;">x${count}</span>
                    </h2>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
            `;
            
            upgrades.forEach(upgradePath => {
                let cost = this.getUpgradeCost(unitType, upgradePath);
                let canAfford = player.gold >= cost;
                let _unitExists = typeof UnitRoster !== 'undefined' && UnitRoster.allUnits[upgradePath] !== undefined;

                let btnColor, cursor, opacity, buttonText;

                if (!_unitExists) {
                    btnColor = "linear-gradient(to bottom, #424242, #212121)";
                    cursor = "not-allowed";
                    opacity = "0.5";
                    buttonText = `[WIP] ${upgradePath} (Data Missing)`;
                } else if (canAfford) {
                    // Make the Unique upgrade visually distinct
                    if (upgradePath === uniqueUnit) {
                        btnColor = "linear-gradient(to bottom, #6a1b9a, #4a148c)"; // Purple for Uniques
                    } else {
                        btnColor = "linear-gradient(to bottom, #2e7d32, #1b5e20)"; // Green for standard
                    }
                    cursor = "pointer";
                    opacity = "1";
                    buttonText = `Upgrade to ${upgradePath} <span style="color: #ffca28;">(${cost}g)</span>`;
                } else {
                    btnColor = "linear-gradient(to bottom, #b71c1c, #7f0000)"; // Red for too broke
                    cursor = "not-allowed";
                    opacity = "0.6";
                    buttonText = `NEED ${cost}G: ${upgradePath}`;
                }
                
                // FIXED: Using troopGUI instead of SettlementSystem
                let clickAction = (_unitExists && canAfford) ? `onclick="troopGUI.upgradeUnit('${unitType}', '${upgradePath}', ${cost})"` : ``;

                html += `
                    <button ${clickAction} 
                        style="background: ${btnColor}; color: white; border: 1px solid #d4b886; padding: 12px 15px; 
                        cursor: ${cursor}; opacity: ${opacity}; font-family: 'Georgia', serif; font-weight: bold; font-size: 1.1rem; 
                        border-radius: 4px; text-transform: uppercase; letter-spacing: 1px; transition: transform 0.1s;">
                        ${buttonText}
                    </button>`;
            });
            
            html += `</div></div>`;
        }
    }

    if (!hasUpgrades) {
        html += `
            <div style="grid-column: 1 / -1; text-align: center; padding: 50px; background: rgba(0,0,0,0.5); border: 1px dashed #d4b886;">
                <h2 style="color: #aaa;">No troops available to upgrade.</h2>
                <p style="color: #888; font-size: 1.2rem;">Recruit more Militia at the settlement menu!</p>
            </div>`;
    }

    html += `</div>`; 

  
    this.menuDiv.innerHTML = html;
	// In troopGUI.js — end of renderMenu():
if (typeof window.mobileUI !== 'undefined') window.mobileUI.patchTroopGUI();
}}
// Now this sits in the global scope where it belongs
window.addEventListener('load', () => {
    if (typeof troopGUI !== 'undefined') {
        troopGUI.init();
    }
});

// ============================================================================
// STORY 1 (JAPAN) OVERRIDES FOR TROOP GUI
// Pasted at the bottom of troopGUI.js
// ============================================================================

Object.assign(troopGUI, {
    isStory1Mode: false,
    
    // Create a backup of your Sandbox tech tree and unique factions so we can restore them if needed
    _sandboxHierarchy: JSON.parse(JSON.stringify(troopGUI.hierarchy)),
    _sandboxUniques: JSON.parse(JSON.stringify(troopGUI.faction_uniques)),

    enableStory1Mode() {
        this.isStory1Mode = true;

        // 1. RESTRICTED HIERARCHY: Pre-Gunpowder Japan
        // Bans: Guns, Bombs, Firelances, Shields, Crossbows, Javelins, Slingers, Lancers
        // Allows: Spears -> Glaive, Bows -> Horse Archery
        this.hierarchy = {
            "Militia": ["Spearman", "Archer"],
            "Spearman": ["Glaiveman", "Lancer","Light Two Handed" ],
            "Glaiveman": [], // End of line
			"Light Two Handed": ["Heavy Two Handed"],
            "Archer": ["Horse Archer"],
			      
        "Lancer": ["Heavy Lancer"],
		"Heavy Lancer": [],
            "Horse Archer": ["Heavy Horse Archer"],
			
            "Heavy Horse Archer": [] // End of line
        };

        // 2. RESTRICTED UNIQUES: Assign the Japanese Clans the Glaiveman
        // Removes all other uniques (Rockets, Keshigs, War Elephants, etc.)
        this.faction_uniques = {

        };

        console.log("[TroopGUI] ⚔️ Story 1 Ruleset applied: Gunpowder and Shields disabled.");
    },

    disableStory1Mode() {
        // Reverts everything back to Sandbox rules
        this.isStory1Mode = false;
        this.hierarchy = JSON.parse(JSON.stringify(this._sandboxHierarchy));
        this.faction_uniques = JSON.parse(JSON.stringify(this._sandboxUniques));
        console.log("[TroopGUI] 🌍 Sandbox Ruleset restored.");
    }
});