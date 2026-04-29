//==============================================================//==============
/*battle_roster_avatar.js
  Adds persistent rosters, player avatar, and hero progression.
  Overrides deploy, update, draw, and leave functions for battle sync.
  Tracks XP, loot, casualties, and UI messages.
  Ensures overworld and battle stats remain consistent.
*/


if (typeof drawBattleUnits === 'undefined') {
    var drawBattleUnits = function() { console.warn("Original drawBattleUnits not found."); };
}
if (typeof getTacticalPosition === 'undefined') {
    var getTacticalPosition = () => ({ x: 0, y: 0 }); // Fallback so it doesn't crash
}

// SURGERY: Cache the player avatar to stop array searching every frame
let cachedCommander = null; 
 

const originalDeployArmy = deployArmy;

// ============================================================================
// ---> SURGERY: GLOBAL ROSTER HARD-SYNC (RESERVE-SAFE) <---
// ============================================================================
window.hardSyncPlayerRoster = function() {
    // Safety check: if no battle is active, do not overwrite anything
    if (typeof battleEnvironment === 'undefined' || !battleEnvironment || !battleEnvironment.units) {
        return player.troops || 0; 
    }

    let updatedFlatRoster = [];
    let trueSurvivorCount = 0;

    battleEnvironment.units.forEach(u => {
        if (u.side === "player" && u.hp > 0) {
            let isEquipment = u.unitType === "Battering Ram" || u.unitType === "Siege Tower" || u.isEquipment === true;
            if (!u.isCommander && !u.isDummy && !isEquipment) {
                let unitKey = u.unitType || (u.stats ? u.stats.name : "Militia");
                let unitLvl = u.level || u.lvl || 1;
                let unitExp = u.exp || u.stats?.experienceLevel || 1;
                
                updatedFlatRoster.push({
                    type: unitKey,
                    count: 1, 
                    lvl: unitLvl,
                    exp: unitExp,
                    stats: u.stats || null 
                });
                trueSurvivorCount++;
            }
        }
    });

    // SURGERY: Protect the Reserves! Merge them BEFORE updating the total tally
    if (player.reserveRoster && player.reserveRoster.length > 0) {
        updatedFlatRoster = updatedFlatRoster.concat(player.reserveRoster);
        trueSurvivorCount += player.reserveRoster.length;
    }

    // SURGERY: If leaveBattlefield already merged the reserves into player.roster, 
    // DO NOT overwrite it with a smaller array. This fixes the UI tally bug.
    if (player.roster && player.roster.length > trueSurvivorCount) {
        return player.roster.length;
    }

    player.roster = updatedFlatRoster;
    player.troops = trueSurvivorCount;
    
    return trueSurvivorCount;
};

// --- 1. OVERRIDE DEPLOY ARMY (Persistent Rosters, 150 Cap 
deployArmy = function(faction, totalTroops, side) {
    let entity = side === "player" ? player : currentBattleData.enemyRef;
    let expectedCount = side === "player" ? entity.troops : entity.count;

    if (side === "player") {
        currentBattleData.playerDefeatedText = false; // Reset death flag
    }

    if (entity && !entity.roster) entity.roster = [];

    // --- STEP 1: SYNC TRUE ROSTER ---
    // If roster is completely empty (first spawn)
    if (entity.roster.length === 0 && expectedCount > 0) {
        if (typeof generateNPCRoster === 'function') {
            entity.roster = generateNPCRoster(entity.role || "Military", expectedCount, faction);
        } else {
            for (let i = 0; i < expectedCount; i++) entity.roster.push({ type: "Militia", exp: 1 });
        }
    }
    // If returning veteran army, sync missing/starved troops
    else if (entity.roster.length > 0) {
        if (entity.roster.length < expectedCount) {
            let diff = expectedCount - entity.roster.length;
            for (let i = 0; i < diff; i++) entity.roster.push({ type: "Militia", exp: 1 });
        } else if (entity.roster.length > expectedCount) {
            entity.roster.splice(expectedCount); 
        }
    }

    // --- STEP 2: STORE TRUE TOTALS FOR POST-BATTLE MATH ---
    if (!currentBattleData.trueInitialCounts) currentBattleData.trueInitialCounts = { player: 0, enemy: 0 };
    currentBattleData.trueInitialCounts[side] = entity.roster.length;

    // --- STEP 3: OPTIMIZATION (THE 150 CAP & RESERVES) ---
    // 1. Shuffle the roster to ensure random troop selection
    for (let i = entity.roster.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [entity.roster[i], entity.roster[j]] = [entity.roster[j], entity.roster[i]];
    }

// >>>>>> SURGERY: For siege battles (player side only), push cavalry to the back
// so the 150-cap slice is dominated by infantry before any cavalry is considered.
if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle && side === "player") {
    const _cavRe = /(cav|cavalry|keshig|horse|lancer|mount|camel|eleph|knight)/i;
    entity.roster.sort((a, b) => {
        let aT = (typeof UnitRoster !== 'undefined') ? (UnitRoster.allUnits[a.type] || {}) : {};
        let bT = (typeof UnitRoster !== 'undefined') ? (UnitRoster.allUnits[b.type] || {}) : {};
        let aIsCav = aT.isLarge || _cavRe.test((aT.role || '') + ' ' + (a.type || ''));
        let bIsCav = bT.isLarge || _cavRe.test((bT.role || '') + ' ' + (b.type || ''));
        return (aIsCav ? 1 : 0) - (bIsCav ? 1 : 0); // infantry (0) sorts before cavalry (1)
    });
}
// >>>>>> END SURGERY

    // 2. Slice the roster into Battle (Max 150) and Reserve (The Rest)
    entity.battleRoster = entity.roster.slice(0, 150);
    entity.reserveRoster = entity.roster.slice(150);

    // 3. Sort the battle roster by type so units clump together cleanly on the field
    entity.battleRoster.sort((a, b) => (a.type || "A").localeCompare(b.type || "A"));

    // --- STEP 4: PHYSICAL SPAWN ---
    let spawnY = side === "player" ? BATTLE_WORLD_HEIGHT - 300 : 300;
    let spawnXCenter = BATTLE_WORLD_WIDTH / 2;
    let factionColor = (side === "player") ? "#ffffff" : ((typeof FACTIONS !== 'undefined' && FACTIONS[faction]) ? FACTIONS[faction].color : "#ffffff");

    // Siege Defender Override
    if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle && side === "enemy") {
        let southGate = typeof overheadCityGates !== 'undefined' ? overheadCityGates.find(g => g.side === "south") : null;
        if (southGate) spawnY = (southGate.y * BATTLE_TILE_SIZE) - 600;
        else spawnY = BATTLE_WORLD_HEIGHT - 1000;
    }

    let totalLineWidth = 0;
    const spacingX = 18;
    const spacingY = 16;
    const groupGap = 40;
    const unitsPerRow = 15;
    const rankDir = (side === "player") ? 1 : -1;

    // Calculate line width to center the army perfectly
    let deployedCounts = {};
    entity.battleRoster.forEach(u => { deployedCounts[u.type] = (deployedCounts[u.type] || 0) + 1; });
    for (let [type, count] of Object.entries(deployedCounts)) {
        let baseT = (typeof UnitRoster !== 'undefined' && UnitRoster.allUnits[type]) ? UnitRoster.allUnits[type] : { role: "infantry" };
        if (!baseT.role.toLowerCase().includes("cavalry") && !baseT.role.toLowerCase().includes("horse")) {
            let groupWidth = Math.min(count, unitsPerRow) * spacingX;
            totalLineWidth += groupWidth + groupGap;
        }
    }
    
    let currentLineXOffset = -(totalLineWidth / 2);
    let currentType = null;
    let typeIndex = 0;

    // Deploy ONLY the 150 units natively (1:1 ratio, no visual bloat)
    for (let i = 0; i < entity.battleRoster.length; i++) {
        let unitData = entity.battleRoster[i];
        let safeType = unitData.type || "Militia";
        let baseTemplate = (typeof UnitRoster !== 'undefined' && UnitRoster.allUnits) 
            ? (UnitRoster.allUnits[safeType] || UnitRoster.allUnits["Militia"]) 
            : { name: "Militia", role: "infantry", isLarge: false, health: 100 };

        if (currentType !== safeType) {
            if (currentType !== null) {
                let prevTemplate = (typeof UnitRoster !== 'undefined' && UnitRoster.allUnits[currentType]) ? UnitRoster.allUnits[currentType] : { role: "infantry" };
                if (!prevTemplate.role.toLowerCase().includes("cavalry") && !prevTemplate.role.toLowerCase().includes("horse")) {
                    currentLineXOffset += Math.min(typeIndex, unitsPerRow) * spacingX + groupGap;
                }
            }
            currentType = safeType;
            typeIndex = 0;
        }

        const isFlank = baseTemplate.role.toLowerCase().includes("cavalry") || baseTemplate.role.toLowerCase().includes("horse");
        let row = Math.floor(typeIndex / unitsPerRow);
        let col = typeIndex % unitsPerRow;

        let finalX, finalY;

        if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle && side === "enemy") {
            let angle = (i * 0.5) + (Math.random() * Math.PI * 2);
            let dist = (Math.sqrt(i) * 12) + (Math.random() * 20);
            finalX = spawnXCenter + Math.cos(angle) * dist + (Math.random() - 0.5) * 15;
            finalY = spawnY + Math.sin(angle) * dist + (Math.random() - 0.5) * 15;
        } else {
            let tacticalOffset = getTacticalPosition(baseTemplate.role, side, safeType);
            if (isFlank) {
                let groupWidth = Math.min(deployedCounts[safeType], unitsPerRow) * spacingX;
                let internalX = (col * spacingX) - (groupWidth / 2);
                finalX = spawnXCenter + tacticalOffset.x + internalX;
            } else {
                finalX = spawnXCenter + currentLineXOffset + (col * spacingX);
            }
            let gridY = row * spacingY * rankDir;
            finalY = spawnY + tacticalOffset.y + gridY;
            finalX += (Math.random() - 0.5) * 3;
            finalY += (Math.random() - 0.5) * 2;
        }

        let unitStats = Object.assign(new Troop(baseTemplate.name, baseTemplate.role, baseTemplate.isLarge, faction), baseTemplate);
        unitStats.experienceLevel = unitData.exp || 1; 
        unitStats.morale = 20; 
        unitStats.factionColor = factionColor;

        battleEnvironment.units.push({
            id: Math.random().toString(36).substr(2, 9),
            side: side,
            faction: faction,
            color: factionColor,
            unitType: safeType,
            stats: unitStats,
            hp: unitStats.health, 
            x: finalX,
            y: finalY,
            target: null,
            state: "idle",
            animOffset: Math.random() * 100,
            cooldown: 0
        });

        typeIndex++;
    }

    // --- STEP 5: INJECT MAIN PLAYER  ---
    if (side === "player") {
        if (!player.stats) {
            let pTemplate = UnitRoster.allUnits["Horse Archer"];
            player.stats = Object.assign(new Troop(pTemplate.name, pTemplate.role, pTemplate.isLarge, faction), pTemplate);
            player.stats.name = "Commander";      
            player.stats.role = "horse_archer";   
            player.stats.meleeAttack += 55;
            player.stats.accuracy += 80;   
        }

        player.stats.health = player.hp > 0 ? player.hp : 100; 
        let battleSpawnX = BATTLE_WORLD_WIDTH / 2;
        let battleSpawnY = BATTLE_WORLD_HEIGHT - 200;

        let avatarObj = {
            id: "MAIN_PLAYER_AVATAR",
            side: "player",
            isCommander: true, 
            faction: faction,
            color: "#ffffff", 
            unitType: "Horse Archer", 
            stats: player.stats,  
            hp: player.stats.health,
            x: battleSpawnX, 
            y: battleSpawnY,
            target: null,
            state: "idle",
            animOffset: 0,
            cooldown: 0
        };

        battleEnvironment.units.push(avatarObj);
        cachedCommander = avatarObj;
        
        player.x = battleSpawnX;
        player.y = battleSpawnY;
    }
};

// --- 3. HOOK TACTICAL AI (Logic Only) ---
const originalUpdateBattleUnits = updateBattleUnits;

updateBattleUnits = function() {
let avatar =cachedCommander; 

if (avatar && avatar.hp > 0) {
        if (player.isMoving) {
            avatar.x = player.x; 
            avatar.y = player.y;
            avatar.state = "moving"; // Triggers leg animation
        } else {
            avatar.state = "idle";   // Stops leg animation
}}

    originalUpdateBattleUnits(); 

    if (avatar) {
        if (!player.isMoving && avatar.hp > 0) {
            player.x = avatar.x;
            player.y = avatar.y;
        }
        player.hp = Math.max(0, avatar.hp); 
    }

    if (avatar && avatar.hp <= 0 && !currentBattleData.playerDefeatedText) {
        currentBattleData.playerDefeatedText = true;
        player.hp = 0;
    }
};

// --- 3.5 NEW: HOOK DRAW BATTLE UNITS (Death UI Rendering) ---
const originalDrawBattleUnits = drawBattleUnits;

drawBattleUnits = function(ctx) {
    originalDrawBattleUnits(ctx); // Draw standard units first
// SURGERY: Use the cache here too!
    let avatar = cachedCommander;
    // FIX: Check the persistent flag so the UI stays even when the engine deletes your dead body!
 
};

// ============================================================================
// ---> SURGERY: PERMADEATH HAIKU ENGINE <---
// ============================================================================
const CHINESE_DEATH_HAIKUS = [
    `"Awaking from sleep,<br>I know not if I am man,<br>Or a dreaming moth."<br><br>- Zhuangzi`,
    `"Bones bleach on the sand,<br>The river flows on and on,<br>Shadows swallow all."<br><br>- Du Fu`,
    `"Autumn wind rises,<br>White clouds fly across the sky,<br>Leaves return to earth."<br><br>- Liu Bang`,
    `"The sun sets so fast,<br>A hundred years pass like dusk,<br>Dust reclaims the sword."<br><br>- Li Bai`,
    `"Flower fades to dirt,<br>Dew drops vanish in the sun,<br>Nothing stays the same."<br><br>- Bai Juyi`,

    `"Cold moon over graves,<br>Even kings become quiet,<br>Night keeps their names.<br><br>- Su Shi`,
    `"Pine roots grip the stones,<br>Still the mountain wears them down,<br>Time eats even iron.<br><br>- Wang Wei`,
    `"A broken jade cup,<br>Spilled wine soaks into the soil,<br>Spring forgets the dead.<br><br>- Tao Yuanming`,
    `"Drums echo in fog,<br>The battlefield is empty,<br>Only crows remain.<br><br>- Cao Cao`,
    `"Winter reeds bend low,<br>Frost covers the sleeping pond,<br>Breath leaves with the dawn.<br><br>- Qu Yuan"`,

    `"Old temple bells ring,<br>A thousand feet of silence,<br>Then ash on the wind.<br><br>- Hanshan`,
    `"Ink on torn paper,<br>The last stroke grows faint in rain,<br>Names blur into dust.<br><br>- Li Qingzhao`,
    `"A lone crane departs,<br>Its shadow splits the river,<br>Then vanishes slow.<br><br>- Du Mu`,
    `"Fallen plum blossoms,<br>Scattered by a sudden storm,<br>Like lives cut too soon.<br><br>- Xie Lingyun`,
    `"The candle burns low,<br>Faces fade in the dark room,<br>Silence takes the bowl.<br><br>- Sima Xiangru"`,

    `"Empty armor lies,<br>Grass grows through the rusted chest,<br>War remembers none.<br><br>- Yue Fei`,
    `"A bright lantern dies,<br>Smoke climbs softly to the roof,<br>Morning finds the ash.<br><br>- Ouyang Xiu`,
    `"River mist gathers,<br>Even the ferryman waits,<br>For the last crossing.<br><br>- Murasaki Shikibu`,
    `"Cherry petals fall,<br>One by one they cover paths,<br>Then vanish at dusk.<br><br>- Bashō`,
    `"The old sword is dull,<br>Yet the hand still reaches for it,<br>Memory fights on.<br><br>- Ryōkan"`,

    `"Crickets in the wall,<br>The summer house stands empty,<br>Only air answers.<br><br>- Zhang Ji`,
    `"A single teardrop,<br>On the bronze face of a drum,<br>Rings like a farewell.<br><br>- Han Yu`,
    `"Snow closes the road,<br>Bootprints fill with winter water,<br>Travelers are gone.<br><br>- Liu Changqing`,
    `"A dead plum tree stands,<br>Still reaching into pale sky,<br>Like an old prayer.<br><br>- Kim Si-seup`,
    `"The river at dusk,<br>Reflects a thousand endings,<br>Then keeps flowing on.<br><br>- Wang Anshi"`,

    `"Moonlight on old clay,<br>Broken jars in the courtyard,<br>Hold only echoes.<br><br>- He Zhizhang`,
    `"The war horn is silent,<br>Smoke drifts above the paddy,<br>Rice sways unaware.<br><br>- Po Chü-i`,
    `"An empty tea bowl,<br>Rimmed with the scent of winter,<br>Awaits no hand now.<br><br>- Yi Saek`,
    `"The black kite circles,<br>Over the sealed mountain gate,<br>Watching all things end.<br><br>- Zhang Ruoxu`,
    `"A robe left on stone,<br>Rain softens the folded hem,<br>No one comes again.<br><br>- Gyeonghwi"`,

    `"Bamboo bends in storm,<br>Still the roots hold deep below,<br>Like a fading vow.<br><br>- Zheng Xie`,
    `"A flicker of fire,<br>Then only a heap of ash,<br>Night grows wider still.<br><br>- Ibn al-Fazari` ,
    `"Old bells in the dusk,<br>Each note drops into the lake,<br>And sinks without trace.<br><br>- Ono no Komachi`,
    `"The tomb path is wet,<br>Ferns cover the names below,<br>Spring will not ask why.<br><br>- Kim Yu-sin`,
    `"Broken reeds in mud,<br>The tide comes to level them,<br>As all powers fall.<br><br>- Li He"`,

    `"A winter sparrow,<br>Shivers on the temple beam,<br>Then flies into mist.<br><br>- Saigyō`,
    `"The last wine is gone,<br>Yet the cup still smells of plum,<br>Like grief after joy.<br><br>- Su Man-shu`,
    `"Thunder under earth,<br>Even buried drums can wake,<br>Before they are dust.<br><br>- Choe Chi-won`,
    `"The path turns to moss,<br>Footsteps of the old traveler,<br>Fade beneath rain.<br><br>- Du Fu`,
    `"A lantern in fog,<br>Shows just enough to mourn by,<br>Then leaves us in blue.<br><br>- Li Shangyin"`,

    `"Autumn fields lie still,<br>Scarecrows bow without a face,<br>Like monks in prayer.<br><br>- Ikkyū`,
    `"A cracked mirror rests,<br>Still it holds the same cold moon,<br>As if nothing died.<br><br>- Wang Changling`,
    `"The old bridge sags low,<br>Water passes under it,<br>Carrying the years.<br><br>- Kūkai`,
    `"A crow lands on snow,<br>One black mark against the white,<br>Then all is quiet.<br><br>- Minamoto no Sanetomo`,
    `"Ashes in the wind,<br>Sealed letters never opened,<br>Names lost to time.<br><br>- Bai Juyi"`
];

window.triggerPermadeath = function() {
    window.isPaused = true;
    if (typeof AudioManager !== 'undefined') AudioManager.stopMusic();
    
    const overlay = document.createElement('div');
    overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: #000; z-index: 2147483647; display: flex; flex-direction: column; justify-content: center; align-items: center; color: #fff; font-family: 'Georgia', serif; text-align: center; opacity: 0; transition: opacity 2s ease-in;`;
    
    const poem = CHINESE_DEATH_HAIKUS[Math.floor(Math.random() * CHINESE_DEATH_HAIKUS.length)];
    
    overlay.innerHTML = `
        <h1 style="color: #d32f2f; font-size: 5vw; letter-spacing: 10px; margin-bottom: 50px; text-shadow: 2px 2px 10px #f44336;">GAME OVER</h1>
        <p style="font-size: 2vw; font-style: italic; color: #d4b886; line-height: 1.8;">${poem}</p>
    `;
    
    document.body.appendChild(overlay);
    setTimeout(() => { overlay.style.opacity = '1'; }, 100);
    
    // Hard refresh back to the main menu after 5 seconds
    setTimeout(() => { window.location.reload(true); }, 5500); 
};



const originalLeaveBattlefield = leaveBattlefield;




leaveBattlefield = function(playerObj) {
    
    // 1. CUSTOM BATTLE BYPASS
    if (window.__IS_CUSTOM_BATTLE__) {
        return originalLeaveBattlefield(playerObj);
    }

    // 2. PERMADEATH & MIRACLE LOGIC
    if (currentBattleData && currentBattleData.playerDefeatedText) {
        if (Math.random() > 0.01) { 
            // 99% Chance -> Absolute Permadeath
            if (typeof window.triggerPermadeath === 'function') {
                window.triggerPermadeath();
            }
            return; // HALTS SCRIPT: Player is dead, game reloads
        } else {
            // 1% Chance -> Miraculously saved by villager
            console.log("Miraculously saved by villagers!");
            
            // Absolutely wipe the army
            playerObj.roster = [];
            playerObj.reserveRoster = [];
            playerObj.troops = 0;
            
            // Wipe the visual field troops so the post-battle UI registers a 100% loss
            if (typeof battleEnvironment !== 'undefined' && battleEnvironment.units) {
                battleEnvironment.units = battleEnvironment.units.filter(u => u.side !== "player" || u.isCommander);
            }
        }
    }

    let pSurvivors = battleEnvironment.units.filter(u => u.side === "player" && u.faction === playerObj.faction && !u.isCommander && u.hp > 0);
    let eSurvivors = battleEnvironment.units.filter(u => u.side === "enemy" && u.hp > 0);
    let enemyRef = currentBattleData.enemyRef;

    // A. Rebuild Player Roster (Only if they weren't wiped in the 10% miracle above)
    if (!(currentBattleData && currentBattleData.playerDefeatedText)) {
        playerObj.roster = [];
        pSurvivors.forEach(u => {
            let troopExpReward = (eSurvivors.length === 0) ? 1.0 : 0.5;
            u.stats.experienceLevel = (u.stats.experienceLevel || 1) + troopExpReward;
            playerObj.roster.push({ type: u.unitType, exp: u.stats.experienceLevel });
        });

        // MERGE BACK PLAYER RESERVES
        if (playerObj.reserveRoster && playerObj.reserveRoster.length > 0) {
            playerObj.roster = playerObj.roster.concat(playerObj.reserveRoster);
            playerObj.reserveRoster = []; 
        }
    }

    // --- COMMANDER PROGRESSION ---
    if (cachedCommander && playerObj.stats) {
        let isVictory = eSurvivors.length === 0;
        let expReward = isVictory ? 1 : 0.2; 
        if (typeof playerObj.stats.gainExperience === 'function') playerObj.stats.gainExperience(expReward);
        else playerObj.stats.experienceLevel += expReward;

        if (isVictory && typeof gainPlayerExperience === 'function') gainPlayerExperience(expReward);
        playerObj.hp = cachedCommander.hp;
    }

    // B. Rebuild Enemy Roster
    if (enemyRef) {
        enemyRef.roster = [];
        eSurvivors.forEach(u => {
            u.stats.experienceLevel = (u.stats.experienceLevel || 1) + 0.05;
            enemyRef.roster.push({ type: u.unitType, exp: u.stats.experienceLevel });
        });
        
        // MERGE BACK ENEMY RESERVES 
        if (enemyRef.reserveRoster && enemyRef.reserveRoster.length > 0) {
            enemyRef.roster = enemyRef.roster.concat(enemyRef.reserveRoster);
            enemyRef.reserveRoster = []; 
        }
        enemyRef.count = enemyRef.roster.length;
    }

    if (playerObj.hp <= 1) playerObj.hp = 100;
    if (playerObj.stats) playerObj.stats.ammo = 30;

// C. LOOT SYSTEM & CARGO TRANSFER
    if (enemyRef) {
        let eInitial = (currentBattleData.trueInitialCounts && currentBattleData.trueInitialCounts.enemy) ? currentBattleData.trueInitialCounts.enemy : 1;
        let eLost = Math.max(0, eInitial - (enemyRef.roster ? enemyRef.roster.length : 0));
        
        let pInitial = (currentBattleData.trueInitialCounts && currentBattleData.trueInitialCounts.player) ? currentBattleData.trueInitialCounts.player : 1;
        let pLost = Math.max(0, pInitial - playerObj.roster.length);

        // Ensure player inventory exists
        if (!playerObj.inventory) playerObj.inventory = {};
        
        // ---> THE FIX: STRICT CARGO ENFORCEMENT <---
        // Use the exact formula from trade_materials_nonfood.js (2 per troop, min 10)
        playerObj.cargoCapacity = Math.max(10, (playerObj.troops || (playerObj.roster ? playerObj.roster.length : 1)) * 2);
        let currentCargoLoad = Object.values(playerObj.inventory).reduce((a, b) => a + b, 0);
        
        let randMod = 0.8 + (Math.random() * 0.4);
        // --- DEEP ANALYSIS FIX: VICTORY CONDITION ---
        // If you press 'P' to win while enemies are fleeing off the map, eSurvivors > 0.
        // We now check if the player's commander survived AND if the enemy is routed.
        let isPlayerDead = (currentBattleData && currentBattleData.playerDefeatedText) || (cachedCommander && cachedCommander.hp <= 0);
        let isEnemyRouted = (eSurvivors.length < 5 || (eSurvivors.length / Math.max(1, eInitial)) < 0.15);
        
        let didPlayerWin = !isPlayerDead && (eSurvivors.length === 0 || isEnemyRouted);

        // --- BATTLE LOGGING ---
        console.log(`[BATTLE END] --- LOOT SYSTEM TRIGGERED ---`);
        console.log(`[BATTLE END] Player Dead: ${isPlayerDead}, Enemy Routed: ${isEnemyRouted}, eSurvivors: ${eSurvivors.length}/${eInitial}`);
        console.log(`[BATTLE END] didPlayerWin Evaluated To: ${didPlayerWin}`);

        if (didPlayerWin) {
			playerObj.cohesion = Math.min(100, (playerObj.cohesion || 100) + 15);  
			
            // --- VICTORY LOOT-
            let winSeverity = Math.min(1.0, eLost / eInitial); 
            console.log(`[VICTORY LOOT] Severity: ${(winSeverity*100).toFixed(0)}% (Enemies Lost: ${eLost})`);

            // 1. Take their actual Gold and Food
            let stolenGold = Math.floor((enemyRef.gold || 0) * winSeverity * randMod);
            let stolenFood = Math.floor((enemyRef.food || 0) * winSeverity * randMod);
            
            // 2. Add standard battlefield scavenging bounty
            let goldLoot = Math.floor(eLost * 3 * randMod) + stolenGold;
            
            // 3. Role-based bonuses
            if (enemyRef.role === "Bandit") goldLoot += Math.floor(50 * winSeverity); 
            else if (enemyRef.role === "Trader" || enemyRef.role === "Commerce") goldLoot += Math.floor(300 * winSeverity); 
            else if (enemyRef.role === "Patrol") goldLoot += Math.floor(10 * winSeverity); 

            console.log(`[VICTORY LOOT] Gained ${goldLoot} Gold and ${stolenFood} Food.`);

            // Transfer to Player
            playerObj.gold += goldLoot;
            playerObj.food = (playerObj.food || 0) + stolenFood;
            currentBattleData.lastLootEarned = goldLoot;

            // Deduct from Enemy
            enemyRef.gold = Math.max(0, (enemyRef.gold || 0) - stolenGold);
            enemyRef.food = Math.max(0, (enemyRef.food || 0) - stolenFood);
// Plunder NPC Cargo (Inventory)
            if (enemyRef.cargo && Object.keys(enemyRef.cargo).length > 0) {
                console.log(`[VICTORY LOOT] Inspecting Enemy Cargo:`, JSON.stringify(enemyRef.cargo));
                Object.keys(enemyRef.cargo).forEach(rid => {
                    let qty = enemyRef.cargo[rid];
                    if (qty > 0) {
                        let stolenQty = Math.floor(qty * winSeverity * randMod);
                        // Guarantee at least 1 item drops if the win severity is high enough
                        if (stolenQty < 1 && Math.random() < winSeverity) stolenQty = 1; 
                        
                        // ---> BULLETPROOF CAPACITY CHECK <---
                        let freeSpace = playerObj.cargoCapacity - currentCargoLoad;
                        if (stolenQty > freeSpace) {
                            console.warn(`[VICTORY LOOT] Not enough space for ${stolenQty}x ${rid}. Free space: ${freeSpace}`);
                            stolenQty = Math.max(0, freeSpace); // Caps the loot strictly at 0 if no room
                        }

                        if (stolenQty > 0) {
                            playerObj.inventory[rid] = (playerObj.inventory[rid] || 0) + stolenQty;
                            enemyRef.cargo[rid] -= stolenQty;
                            currentCargoLoad += stolenQty; // Accumulate load accurately
                            console.log(`[VICTORY LOOT] ++ Looted ${stolenQty}x ${rid}`);
                        }
                    }
                });
            
            } else {
                console.log(`[VICTORY LOOT] Enemy had no cargo items to steal.`);
            }
	} else {
            // --- DEFEAT PENALTY ---
            playerObj.cohesion = Math.max(0, (playerObj.cohesion || 100) - 25); // COHESION NERF

            let lossSeverity = Math.min(1.0, pLost / pInitial); // 0.0 to 1.0
            console.log(`[DEFEAT PENALTY] Severity: ${(lossSeverity*100).toFixed(0)}% (Player Lost: ${pLost}/${pInitial})`);
            
            let randMod = 0.8 + (Math.random() * 0.2); // Cap RNG to 1.0
            let plunderMultiplier = Math.pow(lossSeverity, 1.5) * 0.95; // Exponential scale!
            
            let goldLost = Math.floor(playerObj.gold * plunderMultiplier * randMod); 
            let foodLost = Math.floor((playerObj.food || 0) * plunderMultiplier * randMod);

            console.log(`[DEFEAT PENALTY] Lost ${goldLost} Gold and ${foodLost} Food.`);

            playerObj.gold = Math.max(0, playerObj.gold - goldLost);
            playerObj.food = Math.max(0, (playerObj.food || 0) - foodLost);

            // Transfer your lost wealth to the Enemy
            enemyRef.gold = (enemyRef.gold || 0) + goldLost;
            enemyRef.food = (enemyRef.food || 0) + foodLost;

            // Enemies plunder your cargo
            if (playerObj.inventory && Object.keys(playerObj.inventory).length > 0) {
                console.log(`[DEFEAT PENALTY] Inspecting Player Cargo for scattering...`);
                Object.keys(playerObj.inventory).forEach(rid => {
                    let qty = playerObj.inventory[rid];
                    if (qty > 0) {
                        let stolenQty = Math.floor(qty * lossSeverity * randMod);
                        if (stolenQty < 1 && Math.random() < lossSeverity) stolenQty = 1;
                        
                        if (stolenQty > 0) {
                            playerObj.inventory[rid] -= stolenQty;
                            if (playerObj.inventory[rid] <= 0) delete playerObj.inventory[rid];
                            console.log(`[DEFEAT PENALTY] -- Scattered/Lost ${stolenQty}x ${rid}`);
                            
                            // Distribute stolen goods
                            if (enemyRef.role === "Commerce" || enemyRef.role === "Civilian") {
                                if (!enemyRef.cargo) enemyRef.cargo = {};
                                enemyRef.cargo[rid] = (enemyRef.cargo[rid] || 0) + stolenQty;
                            } else {
                                // Scavengers return goods to the nearest city market
                                let nearestCity = enemyRef.originCity; 
                                if (!nearestCity && typeof cities !== 'undefined' && cities.length > 0) {
                                    let minDist = Infinity;
                                    cities.forEach(c => {
                                        let dist = Math.hypot(c.x - enemyRef.x, c.y - enemyRef.y);
                                        if (dist < minDist) { minDist = dist; nearestCity = c; }
                                    });
                                }
                                if (nearestCity && nearestCity.market) {
                                    if (!nearestCity.market[rid]) {
                                        let basePrice = (typeof RESOURCE_CATALOG !== 'undefined' && RESOURCE_CATALOG[rid]) ? RESOURCE_CATALOG[rid].basePrice : 50;
                                        nearestCity.market[rid] = { stock: 0, idealStock: 10, price: Math.round(basePrice * 0.8) };
                                    }
                                    nearestCity.market[rid].stock += stolenQty;
                                    console.log(`[DEFEAT PENALTY] ${stolenQty}x ${rid} arrived at market in ${nearestCity.name}`);
                                }
                            }
                        }
                    }
                });
            }
        }
    }
    
    // Triggers the UI
    originalLeaveBattlefield(playerObj);

// D. FINAL TRUTH SYNC
    playerObj.troops = playerObj.roster.length;
    if (enemyRef) enemyRef.count = enemyRef.roster.length;

    cachedCommander = null;
    isBattlefieldReady = false;

    // --- SURGERY: STRICT < 3 PERMADEATH RULE ---
    if (!didPlayerWin && playerObj.troops < 3) {
        console.log("CRITICAL DEFEAT: Less than 3 troops remain. Permadeath triggered.");
        if (typeof window.triggerPermadeath === 'function') {
            window.triggerPermadeath();
        } else {
            window.location.reload();
        }
    }
};






// --- 5. OVERRIDE BATTLE SUMMARY UI (Center Text & Accurate Mass Casualty Readout) ---
const originalCreateBattleSummaryUI = createBattleSummaryUI;

createBattleSummaryUI = function(...args) {
    originalCreateBattleSummaryUI(...args);

    let summaryDiv = document.getElementById('battle-summary');
    if (summaryDiv) {
        let closeBtn = summaryDiv.querySelector('button');
        if (player.isSieging) {
            if (closeBtn) closeBtn.click(); 
            summaryDiv.style.display = 'none'; 
            return;
        }

        summaryDiv.innerHTML = '';
        summaryDiv.style.textAlign = "center";
        summaryDiv.style.display = "flex";
        summaryDiv.style.flexDirection = "column";
        summaryDiv.style.alignItems = "center";
        summaryDiv.style.justifyContent = "center";
        
        summaryDiv.style.position = "absolute";
        summaryDiv.style.left = "50%";
        summaryDiv.style.top = "50%";
        summaryDiv.style.transform = "translate(-50%, -50%)";

        // ---> SURGERY: ACCURATE MATH (Field Survivors + Reserves) <---
        let pReserves = player.reserveRoster ? player.reserveRoster.length : 0;
        let pSurvivorsVisual = battleEnvironment.units.filter(u => u.side === "player" && u.faction === player.faction && !u.isCommander && u.hp > 0).length;
        let pSurvivorsTotal = pSurvivorsVisual + pReserves;
        let pInitial = currentBattleData.trueInitialCounts ? currentBattleData.trueInitialCounts.player : pSurvivorsTotal;
// REPLACE IT WITH THIS:
        // ---> SURGERY: FORCE ROSTER REBUILD BEFORE CALCULATING LOSSES <---
        if (typeof window.hardSyncPlayerRoster === 'function') {
            pSurvivorsTotal = window.hardSyncPlayerRoster(); 
        }
        let pLost = Math.max(0, pInitial - pSurvivorsTotal);
        let enemyRef = currentBattleData.enemyRef;
        let eReserves = (enemyRef && enemyRef.reserveRoster) ? enemyRef.reserveRoster.length : 0;
        let eSurvivorsVisual = battleEnvironment.units.filter(u => u.side === "enemy" && u.hp > 0).length;
        let eSurvivorsTotal = eSurvivorsVisual + eReserves;
        let eInitial = currentBattleData.trueInitialCounts ? currentBattleData.trueInitialCounts.enemy : eSurvivorsTotal;
        let eLost = Math.max(0, eInitial - eSurvivorsTotal);

        // UI Generation
        let statusText = document.createElement('p');
        statusText.style.color = "#ffca28";
        statusText.style.fontWeight = "bold";
        statusText.style.fontSize = "16px";

        let text = "Battle Ended";
        if (currentBattleData && currentBattleData.playerDefeatedText) {
            text = "They left you to die but you miraculously survived";
        } else if (args[0] && typeof args[0] === 'string' && args[0].includes("Victory")) {
            text = "VICTORY!";
        }
        statusText.innerText = text;
        summaryDiv.appendChild(statusText);

        let lossReport = document.createElement('div');
        lossReport.style.marginTop = "10px";
        lossReport.style.color = "#eeeeee"; 
        lossReport.style.fontSize = "11px";
        lossReport.style.fontFamily = "monospace";
     lossReport.innerHTML = `Army Remaining: <span style="color:#8bc34a">${pSurvivorsTotal}</span> | Enemy Remaining: <span style="color:#8bc34a">${eSurvivorsTotal}</span>`;
        summaryDiv.appendChild(lossReport);

        if (closeBtn) {
            closeBtn.innerText = "Close";
            closeBtn.style.marginTop = "20px"; 
            summaryDiv.appendChild(closeBtn);
        }
    }
};


function drawDetailedChineseWagon(ctx, x, y, factionColor) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1.2, 1.2); // Balanced scale

    // --- 1. THE SHADOW ---
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.beginPath();
    ctx.ellipse(0, 18, 35, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // --- 2. THE CHASSIS (Heavy Timber) ---
    const woodDark = "#3e2723";
    const woodMid = "#5d4037";
    
    // Main base beams
    ctx.fillStyle = woodDark;
    ctx.fillRect(-28, 5, 56, 6); // Main floor
    ctx.fillStyle = woodMid;
    ctx.fillRect(-28, 5, 56, 2); // Top highlight of beam
    
    // Front shafts (The "Tongue" for the horse/ox)
    ctx.strokeStyle = woodDark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-28, 8);
    ctx.lineTo(-45, 12);
    ctx.stroke();

    // --- 3. THE CANVAS COVER (Barrel Vault) ---
    const canvasBase = "#d7ccc8"; // Aged parchment/canvas color
    const canvasShadow = "#bcaaa4";
    
    // Draw the main cloth body
    ctx.fillStyle = canvasBase;
    ctx.beginPath();
    ctx.moveTo(-25, 5);
    // The "Barrel" arch
    ctx.bezierCurveTo(-25, -35, 25, -35, 25, 5);
    ctx.fill();

    // DRAW THE "LINES" (Structural Ribs/Folds)
    // This gives it the realistic bamboo-frame look instead of a flat "salt" texture
    ctx.save();
ctx.beginPath();
ctx.moveTo(-25, 5);
ctx.bezierCurveTo(-25, -35, 25, -35, 25, 5);
ctx.closePath();
ctx.clip();

ctx.strokeStyle = "rgba(0,0,0,0.12)";
ctx.lineWidth = 1;

for (let i = -20; i <= 20; i += 8) {
    ctx.beginPath();
    ctx.moveTo(i, 5);
    ctx.lineTo(i, -30);
    ctx.stroke();
}

ctx.restore();

    // Front/Back Openings (The dark interior look)
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.moveTo(-25, 5);
    ctx.quadraticCurveTo(-25, -28, -18, -20);
    ctx.lineTo(-18, 5);
    ctx.fill();

    // --- 4. THE FACTION FLAG (Small & Detailed) ---
    ctx.strokeStyle = "#212121";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(15, -15);
    ctx.lineTo(15, -35); // Flag pole
    ctx.stroke();

    ctx.fillStyle = factionColor || "#cc0000";
    ctx.beginPath();
    ctx.moveTo(15, -35);
    ctx.lineTo(28, -30);
    ctx.lineTo(15, -25);
    ctx.fill();
    // Tiny flag detail
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.stroke();

    // --- 5. THE WHEELS (Large Chinese Spoked Wheels) ---
    // We draw two wheels, one slightly offset for 2.5D depth
    drawSpokedWheel(ctx, -16, 12, 10); // Front wheel
    drawSpokedWheel(ctx, 18, 12, 10);  // Back wheel

    ctx.restore();
}

function drawSpokedWheel(ctx, x, y, radius) {
    ctx.save();
    ctx.translate(x, y);
    
    // Outer Rim (Tire)
    ctx.strokeStyle = "#1a1a1a"; // Iron/Dark Wood rim
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner Wood Rim
    ctx.strokeStyle = "#5d4037";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius - 2, 0, Math.PI * 2);
    ctx.stroke();

    // The Hub (Center)
    ctx.fillStyle = "#212121";
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    // The Spokes (12 Spokes for 13th Century style)
    ctx.strokeStyle = "#3e2723";
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
        ctx.rotate(Math.PI / 6);
        ctx.beginPath();
        ctx.moveTo(0, 2);
        ctx.lineTo(0, radius - 2);
        ctx.stroke();
    }

    ctx.restore();
}

