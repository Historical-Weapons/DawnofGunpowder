const globalSettings = { formatNumbersWithCommas: false };

const ROLES = {
    GUNNER: "gunner", 
    SHIELD: "shield", 
    PIKE: "pike",
    ARCHER: "archer", 
    CAVALRY: "cavalry", 
    INFANTRY: "infantry",
    TWO_HANDED: "two_handed", 
    FIRELANCE: "firelance",
    BOMB: "bomb", 
    THROWING: "throwing", 
    HORSE_ARCHER: "horse_archer",
    CROSSBOW: "crossbow",
	MOUNTED_GUNNER: "mounted_gunner",
	ROCKET: "Rocket" 
};

// --- NEW: ARMOR CLASSIFICATION SYSTEM ---
// 0-5: Cloth/Unarmored | 5-10: Gambeson/Leather | 10-20: Partial Lamellar | 20+: Full Lamellar/Heavy
const ARMOR_TIERS = {
    CLOTH: 2,             // Peasant clothes, bare minimum
    LEATHER: 8,           // Gambeson, hardened leather, organic
    PARTIAL_LAMELLAR: 15, // Chest plate + helmet, decent protection
    FULL_LAMELLAR: 25,    // Full suit of heavy lamellar armor
    SUPER_HEAVY: 40,      // Barded horses, elite cataphracts
    JUGGERNAUT: 60        // War Elephants, massive natural armor
};

// --- NEW: PHYSICAL WEIGHT CLASSES ---
// Tier determines who pushes who (Light cannot push Heavy). 
// Mass determines push ratio if tiers are equal.
// Radius determines how much physical space they take up.
const WEIGHT_CLASSES = {
    LIGHT_INF: { tier: 1, mass: 10,  radius: 5 },   // Peasants, Archers
    HEAVY_INF: { tier: 2, mass: 25,  radius: 7 },   // Armored Infantry, Pikemen
    CAV:       { tier: 3, mass: 80,  radius: 10 },  // Standard horses
    HEAVY_CAV: { tier: 4, mass: 150, radius: 12 },  // Barded Cataphracts
    ELEPHANT:  { tier: 5, mass: 500, radius: 18 }   // Unmovable Behemoths
};

class Troop {
    constructor(name, role, isLarge, faction = "Generic") 
	{
        this.name = name;
        this.role = role;
        this.isLarge = isLarge;
        this.faction = faction;
        
		// Default fallbacks (will be overwritten by the roster)
        this.weightTier = WEIGHT_CLASSES.LIGHT_INF.tier;
        this.mass = WEIGHT_CLASSES.LIGHT_INF.mass;
        this.radius = WEIGHT_CLASSES.LIGHT_INF.radius;
		
		
		this.level = 1; this.morale = 20; this.maxMorale = 20; this.stamina = 100; this.health = 100; this.meleeAttack = 10; this.meleeDefense = 10;
        this.armor = ARMOR_TIERS.CLOTH; this.shieldBlockChance = 0; this.bonusVsLarge = 0;  this.isRanged = false; this.ammo = 0; this.accuracy = 0; this.reloadSpeed = 0; this.missileBaseDamage = 0; this.missileAPDamage = 0;
		this.speed = 0.8;  this.range = 20; 
        this.currentStance = "statusmelee"; 
    }
	
gainExperience(amount) {//troop non player version of gain exp
    if (this.experienceLevel >= 10) return; // Cap level at 10

    // 1. Add to a dedicated experience pool, NOT the level itself
    this.experience = (this.experience || 0) + (amount*5);

    // 2. Define how much is needed for the NEXT level
    // Formula: Level 1 needs 1.0, Level 2 needs 2.0, Level 3 needs 3.0...
    let expNeeded = this.experienceLevel * 1.0; 

    // 3. Level up logic with a "While" loop to handle large XP gains correctly
    while (this.experience >= expNeeded && this.experienceLevel < 10) {
        this.experience -= expNeeded; // Consume the XP
        this.experienceLevel++;
        
        // Boost stats on level up
        this.meleeAttack += 2;
        this.meleeDefense += 2;
        this.health = Math.min(this.maxHealth || 100, this.health + 10);
        
        console.log(`${this.name} reached Level ${this.experienceLevel}!`);
        
        // Update requirement for the NEXT level in the loop
        expNeeded = this.experienceLevel * 1.0;
    }
}

    updateStance(targetDistance) {
        if (!this.isRanged) {
            this.currentStance = "statusmelee";
            return;
        }
        const MELEE_ENGAGEMENT_DISTANCE = 15;
        if (this.ammo <= 0 || targetDistance <= MELEE_ENGAGEMENT_DISTANCE) {
            this.currentStance = "statusmelee";
        } else {
            this.currentStance = "statusrange";
        }
    }
}

const UnitRoster = {
    allUnits: {},
    
    // --- EMBEDDED HIERARCHY DATA (Synced with GUI) ---
    hierarchy: {
        militia: {
            crossbow_line:   ["Crossbowman", "Heavy Crossbowman"],
            spear_line:      ["Javelinier", "Firelance", "Heavy Firelance"],
            archer_line:     ["Archer", "Horse Archer", "Heavy Horse Archer"],
            sabre_line:      ["Shielded Infantry", "Light Two Handed", "Heavy Two Handed"],
            scout_line:      ["Spearman", "Lancer", "Heavy Lancer"],
            specialist_line: ["Bomb", "Hand Cannoneer"] // Moved Bomb to branch directly from Militia
        },
        faction_uniques: {
            korean: "Rocket",
            mongol: "Keshig",
            jurchen: "Elite Lancer",
            xia: "Camel Cannon",
            viet: "Poison Crossbowman",
            persian: "War Elephant",
            hong: "Repeater Crossbowman",
            tibetan: "Slinger",
            japanese: "Glaiveman"
        }
    },

    getAvailableUpgrades: function(currentType) {
        let upgrades = [];
        
        if (currentType === "Militia") {
            for (let line in this.hierarchy.militia) {
                upgrades.push(this.hierarchy.militia[line][0]);
            }
            return upgrades; 
        }
        
        for (let line in this.hierarchy.militia) {
            let arr = this.hierarchy.militia[line];
            let idx = arr.indexOf(currentType);
            if (idx !== -1 && idx < arr.length - 1) {
                upgrades.push(arr[idx + 1]);
                return upgrades; 
            }
        }
        
        return upgrades; 
    },

    create: function(id, name, role, isLarge, stats, faction = "Generic") {
        let t = new Troop(name, role, isLarge, faction);
        Object.assign(t, stats);
	// ---> INSERT NEW DESCRIPTION LOGIC <---
        t.desc = stats.desc || "Unit Description";	
		// 2. ---> INSERT THE NEW WEIGHT LOGIC HERE <---
    // This maps the WEIGHT_CLASSES object data onto the individual unit
    if (stats.weightClass) {
        t.weightTier = stats.weightClass.tier;
        t.mass = stats.weightClass.mass;
        t.radius = stats.weightClass.radius;
    }
		
        t.morale = stats.morale || 20; 
        t.maxMorale = stats.morale || 20;
        t.currentStance = t.isRanged ? "statusrange" : "statusmelee"; 
        
        // Auto-Balancing Logic for Ranged Hybrids
        if (t.isRanged) {
            t.meleeAttack = Math.floor(t.meleeAttack * 0.85); 
            t.meleeDefense = Math.floor(t.meleeDefense * 0.85);
            const isCannonWeapon = t.name.toLowerCase().includes("cannon") || t.name.toLowerCase().includes("fire");
            if (!isCannonWeapon) {
                t.missileBaseDamage = Math.floor(t.missileBaseDamage * 0.7);
                t.missileAPDamage = Math.floor(t.missileAPDamage * 0.7);
            }
        } 
        this.allUnits[id] = t;
    },
    
init: function() {
    // --- BASE MILITIA (Tier 0) ---
    this.create("Militia", "Militia", ROLES.INFANTRY, false, { desc: "Drawn from the agrarian backbone, these peasant conscripts are hastily armed with farming implements and sometimes with improvised baskets, furniture pieces, or potlids as makeshift shields. Though lacking martial discipline or equipment, they were great at soaking up enemy volleys or intimidate bandits, before the professional armies arrive.", weightClass: WEIGHT_CLASSES.LIGHT_INF, health: 50, meleeAttack: 5, meleeDefense: 1, armor: ARMOR_TIERS.CLOTH, speed: 0.8, range: 15, morale: 20, cost: 20,hasShield: true, shieldBlockChance: 5 + Math.floor(Math.random() * 5) });

    // --- CROSSBOW LINE ---
    this.create("Crossbowman", "Crossbowman", ROLES.CROSSBOW, false, { desc: "Crossbows were mass-produced during the Han dynasty. They became popular again in the Song dynasty. According to the Wujing Zongyao, crossbows deployed en masse were the most effective weapon against northern nomadic cavalry. Even when shots failed to hit their target, the quarrels were too short to be reused as regular arrows, preventing the nomads from turning captured ammunition against Song forces. Crossbow ammunition was cheaper than arrows due to wider spine tolerances, and they do not need/want to carve out nocks or glue feathers to mass produce. Typical Song crossbows doubled the kinetic energy of bows while being significantly slower to reload. Engagement distances of crossbows are often higher than bows.", weightClass: WEIGHT_CLASSES.LIGHT_INF, isRanged: true, ammo: 30, health: 100, meleeAttack: 10, meleeDefense: 5, missileBaseDamage: 12, missileAPDamage: 32, accuracy: 75, armor: ARMOR_TIERS.PARTIAL_LAMELLAR, speed: 0.7, range: 800, morale: 50, cost: 50 });
    this.create("Heavy Crossbowman", "Heavy Crossbowman", ROLES.CROSSBOW, false, { desc: "Skilled marksmen wielding the Divine Arm Crossbows. Clad in overlapping iron lamellar for protection, these veterans anchor the rearguard. Their mechanical weapons strike a fine balance between draw weight and power stroke, capable of penetrating even the best lamellar armor. The longer draw of the prod compared to contemporary European crossbows, allows a lesser draw weight, while having comparable potential energy.", weightClass: WEIGHT_CLASSES.HEAVY_INF, isRanged: true, ammo: 25, health: 140, meleeAttack: 14, meleeDefense: 14, missileBaseDamage: 15, missileAPDamage: 35, accuracy: 80, armor: ARMOR_TIERS.FULL_LAMELLAR, speed: 0.4, range: 820, morale: 65, cost: 70 });
    this.create("Bomb", "Bomb", ROLES.BOMB, false, { desc: "Thrown from brave men or via a staff sling, the 'Thunder Crash Bomb' was an early blackpowder bomb first depicted in a late 12th century artwork 揭缽圖卷, though some historians have argued a much earlier date of around 950AD with controversy. The 13th century version were iron-cased explosives packed with fast burning black powder. Ignited with a slow match, these volatile bombs produce a concussive shockwave and flesh-tearing shrapnel, capable of shattering enemy morale and weakening tight infantry squares. However early bombs of this era were not particularly lethal and still required a decisive melee.", weightClass: WEIGHT_CLASSES.LIGHT_INF, isRanged: true, ammo: 2, health: 80, meleeAttack: 8, meleeDefense: 8, missileBaseDamage: 50, missileAPDamage: 10, accuracy: 50, armor: ARMOR_TIERS.CLOTH, speed: 0.7, range: 330, morale: 100, cost: 105 });

    // --- SPEAR LINE ---
    this.create("Spearman", "Spearman", ROLES.PIKE, false, { desc: "Armed with long, cost-effective spears and drilled in rigid, disciplined formations, these infantrymen are trained to plant their weapons firmly against charging cavalry, creating a deadly wall of wood and steel. While versatile polearms like the halberd existed, they were far less common during this period, making the spear the backbone of frontline infantry. Most spearmen lacked proper side arms and would often carry improvised sidearms like daggers, tools or clubs.", weightClass: WEIGHT_CLASSES.HEAVY_INF, health: 100, meleeAttack: 10, meleeDefense: 16, armor: ARMOR_TIERS.PARTIAL_LAMELLAR, bonusVsLarge: 20, antiLargeDamage: 20, speed: 0.80, range: 35, morale: 55, cost: 25 });
    this.create("Firelance", "Firelance", ROLES.FIRELANCE, false, { desc: "Pioneers of early gunpowder warfare. These shock troops wield the early firelance — a spear strapped with a bamboo or paper tube packed with incendiary blackpowder as early as 950 AD in Dunhuang depictions. Upon closing with the enemy, they unleash a terrifying torrent of flame, smoke, and debris, burning faces and scaring horses before thrusting with the lethal component - the spearhead. Around 1233 from the History of Jin, the Jin troops attacked the Mongols with firelances. Pucha Guannu divided his soldiers into teams of 50 to 70, each in a small boat, ordering them to advance to the Mongol camp and attack it from all sides. Carrying their fire lances, the Jin soldiers launched a sudden attack which the Mongols were unable to resist. It was a great defeat, for in all 3500 Mongols were drowned in the river.", weightClass: WEIGHT_CLASSES.HEAVY_INF, isRanged: true, ammo: 1, health: 100, meleeAttack: 10, meleeDefense: 14, missileBaseDamage: 24, missileAPDamage: 15, accuracy: 55, bonusVsLarge: 25, antiLargeDamage: 25,chargeBonus: 5, armor: ARMOR_TIERS.PARTIAL_LAMELLAR, speed: 0.7, range: 40, morale: 80, cost: 50 });
    this.create("Heavy Firelance", "Heavy Firelance", ROLES.FIRELANCE, false, { desc: "Elite shock troops equipped with 2 reinforced tubes strapped on a lance. Encased in iron lamellar to survive the vanguard clash, their weapons discharge a blackpowder based fire, melting enemy morale. It wasn't until the 13th century that pellets were recorded with wadding to be used with the firelances. From History of Jin: to make the lance, use chi-huang paper, sixteen layers of it for the tube, and make it a bit longer than two feet. Stuff it with willow charcoal, iron fragments, magnet ends, sulfur, white arsenic and other ingredients, and put a fuse to the end. Each troop has hanging on him a little iron pot to keep fire, and when it's time to do battle, the flames shoot out the front of the lance more than ten feet, and when the gunpowder is depleted, the tube isn't destroyed.", weightClass: WEIGHT_CLASSES.HEAVY_INF, isRanged: true, ammo: 2, health: 140, meleeAttack: 20, meleeDefense: 20, missileBaseDamage: 20, bonusVsLarge: 25, antiLargeDamage: 25,chargeBonus: 5, missileAPDamage: 60, accuracy: 60, armor: ARMOR_TIERS.FULL_LAMELLAR, speed: 0.55, range: 40, morale: 90, cost: 80 });

    // --- ARCHER LINE ---
    this.create("Archer", "Archer", ROLES.ARCHER, false, { desc: "Foot archers in the Sinosphere loosed faster than crossbowmen but relied on typically more expensive ammunition due to the spine tolerances, feather fletchings, and nock design requirements compared to cheap crossbow bolts. Archers often delivered less kinetic energy than Chinese crossbows even with a higher powerstroke. because the lower draw weight. A typical Song dynasty crossbow can be around 280lbs with moderate powerstroke while the average archer was likely less than 100lbs. Draw weight and bow design varied by faction and experience, affecting range and strength. Used to harass, soften enemy lines, and cover skirmishers, they were valued for mobility and sustained volleys despite logistical demands for sustained fire.", weightClass: WEIGHT_CLASSES.LIGHT_INF, isRanged: true, ammo: 20, health: 100, meleeAttack: 5, meleeDefense: 5, missileBaseDamage: 13, missileAPDamage: 14, accuracy: 55, armor: ARMOR_TIERS.LEATHER, speed: 0.75, range: 700, morale: 50, cost: 45 });
    this.create("Horse Archer", "Horse Archer", ROLES.HORSE_ARCHER, true, { desc: "Trained from youth to shoot on horseback often controlling the horse merely with their legs, they are capable of shooting 360 degrees. Highly mobile and disciplined, they control the battlefield by harassing flanks, disrupting supply lines, and raining relentless volleys of arrows on enemy infantry while staying safely out of reach. Their speed and precision make them a constant threat, dictating the flow of combat across open terrain wearing light armor.", weightClass: WEIGHT_CLASSES.CAV, isRanged: true, ammo: 50, health: 200, meleeAttack: 12, meleeDefense: 12, missileBaseDamage: 11, missileAPDamage: 14, accuracy: 50, armor: ARMOR_TIERS.PARTIAL_LAMELLAR, speed: 1.9, range: 700, morale: 60, cost: 70 });
    this.create("Heavy Horse Archer", "Heavy Horse Archer", ROLES.HORSE_ARCHER, true, { desc: "Melding the nomadic mastery of the composite bow with the metallurgical wealth of conquered empires. Clad in heavy iron lamellar, they possess the durability to weather enemy archer volleys, allowing them to skirmish but also fight well in a melee.", weightClass: WEIGHT_CLASSES.HEAVY_CAV, isRanged: true, ammo: 40, health: 210, meleeAttack: 16, meleeDefense: 18, missileBaseDamage: 11, missileAPDamage: 16, accuracy: 95, armor: ARMOR_TIERS.FULL_LAMELLAR, speed: 1.4, range: 700, morale: 95, cost: 95 });

    this.create("General", "General", ROLES.HORSE_ARCHER, true, { desc: "A master strategist shaped by the teachings of Sun Tzu and other military classics, this commander serves as the mind of the army. Surrounded by signal flags, war drums, and elite bodyguards, his presence steadies wavering lines and keeps the intricate machinery of a 13th-century combined-arms force running smoothly. Yet beyond the battlefield, most of their days are consumed by bureaucracy and paperwork, the unseen burden of command. Not expected to be in combat, the general often wears medium armor for comfort.", weightClass: WEIGHT_CLASSES.HEAVY_CAV, isRanged: true, ammo: 24, health: 250, meleeAttack: 22, meleeDefense: 5, missileBaseDamage: 14, missileAPDamage: 14, accuracy: 62, armor: ARMOR_TIERS.FULL_LAMELLAR, speed: 2.0, isCommander: true,range: 700, morale: 95, cost: 150 });

    // --- SABRE LINE ---
    this.create("Shielded Infantry", "Shielded Infantry", ROLES.SHIELD, false, { desc: "A common foot soldier, wearing light armor and carrying large protective shields. Their main role is to absorb enemy attacks and hold the line, acting as mobile screens for the rest of the army. Quick and resilient, they draw enemy projectiles and charges, giving archers, skirmishers, and heavier troops the freedom to strike while the front line takes the brunt of combat. The sabre is considered a self defence weapon in this context, as their main role is to screen projectiles particularly against horse archers.", weightClass: WEIGHT_CLASSES.HEAVY_INF, health: 150, meleeAttack: 9, meleeDefense: 15, armor: ARMOR_TIERS.LEATHER, hasShield: true, shieldBlockChance: 40, speed: 0.5, range: 20, morale: 60, cost: 30 });
    this.create("Light Two Handed", "Light Two Handed", ROLES.TWO_HANDED, false, { desc: "Agile shock infantry armed with two handed sabers. Lacking heavy armor, these fearless warriors are deployed specifically to flank and deliver shock, using sweeping, two-handed strikes to cause terror.", weightClass: WEIGHT_CLASSES.LIGHT_INF, health: 100, meleeAttack: 30, meleeDefense: 12, chargeBonus: 12, antiLargeDamage: 8, armor: ARMOR_TIERS.LEATHER, speed: 0.7, range: 20, morale: 65, cost: 55 });
    this.create("Heavy Two Handed", "Heavy Two Handed", ROLES.TWO_HANDED, false, { desc: "Imposing heavy infantry clad in lamellar armor and wielding large two-handed blades, these warriors were often elite troops demonstrating skill and status as much as battlefield effectiveness. The sheer size of their weapons made sustained combat exhausting and their practicality questionable. While their strength and sweeping strikes could disrupt enemy cohesion, their role was as much about intimidation, status, and spectacle than practical battlefield efficiency.", weightClass: WEIGHT_CLASSES.HEAVY_INF, health: 125, meleeAttack: 36, meleeDefense: 16,chargeBonus: 12, antiLargeDamage: 8, armor: ARMOR_TIERS.FULL_LAMELLAR, speed: 0.65, range: 20, morale: 75, cost: 90 });

    // --- SCOUT LINE ---
    this.create("Lancer", "Lancer", ROLES.CAVALRY, true, { desc: "Nimble cavalry reliant on speed used throughout Asia to exploit gaps in the enemy line, chase down routing skirmishers, and deliver flanking charges that can break the enemy's formation through speed and momentum. They are lightly armored relative to the elites.", weightClass: WEIGHT_CLASSES.CAV, health: 130, meleeAttack: 18, meleeDefense: 14, armor: ARMOR_TIERS.PARTIAL_LAMELLAR, speed: 2.0, range: 30, morale: 30, cost: 70,chargeBonus: 20 });
    this.create("Heavy Lancer", "Heavy Lancer", ROLES.CAVALRY, true, { desc: "Heavy lancers wore lamellar armor while riding unarmored horses for maximum mobility. Wielding long, iron-tipped lances, they excel at charging enemy formations with precision, capable of breaking infantry lines or scattering lighter cavalry. Disciplined and veteran, these cavalrymen form the spearhead of frontier armies, using speed, timing, and armored resilience to dominate the battlefield at the right time.", weightClass: WEIGHT_CLASSES.HEAVY_CAV, health: 180, meleeAttack: 24, meleeDefense: 20, armor: ARMOR_TIERS.FULL_LAMELLAR, speed: 1.5, range: 30, morale: 75, cost: 90,chargeBonus: 20 });
    this.create("Elite Lancer", "Elite Lancer", ROLES.CAVALRY, true, { desc: "Elite Jin heavy lancers are often drawn from the dynasty’s best frontier cavalry individuals; clad in the finest lamellar armor and mounted on some of the best horses of this region, they are trained to charge with heavy lances combining the shock of cavalry with disciplined formation tactics, capable of smashing infantry lines or breaking lighter cavalry. Their mobility, discipline, and armored protection made them an elite striking force on the northern frontiers.", weightClass: WEIGHT_CLASSES.HEAVY_CAV, health: 250, meleeAttack: 28, meleeDefense: 24, armor: ARMOR_TIERS.SUPER_HEAVY + 5, speed: 1.0, range: 30, morale: 100, cost: 190,chargeBonus: 30 }); 

    // --- FACTION UNIQUES ---
    this.create("Rocket", "Rocket", ROLES.ROCKET, false, { desc: "Operators of early solid-propellant rocketry, such as the Fei Huo Qiang. While hopelessly inaccurate, these rudimentary missiles screech across the battlefield in terrifying volleys, trailing fire and smoke. Their primary utility lies in causing widespread panic, triggered by the action of one igniter.", weightClass: WEIGHT_CLASSES.LIGHT_INF, isRanged: true, ammo: 30, health: 80, meleeAttack: 8, meleeDefense: 8, missileBaseDamage: 10, missileAPDamage: 6, accuracy: 15, armor: ARMOR_TIERS.CLOTH, speed: 0.4, range: 720, morale: 45, cost: 80 });
    this.create("Keshig", "Keshig", ROLES.HORSE_ARCHER, true, { desc: "The legendary elite cavalry of the Mongol Empire. Hand-picked for their supreme combat skills, experience, and loyalty, they were the imperial guard and shock troops for royalty in the Mongol Empire. Their primary purpose was to act as bodyguards for emperors and other nobles. They were divided into two subgroups: the day guard (Torguud) and the night guard (Khebtuul).", weightClass: WEIGHT_CLASSES.HEAVY_CAV, isRanged: true, ammo: 35, health: 245, meleeAttack: 18, meleeDefense: 16, missileBaseDamage: 14, missileAPDamage: 16, accuracy: 95, armor: ARMOR_TIERS.SUPER_HEAVY, speed: 1.0, range: 700, morale: 100, cost: 125 });
    this.create("Hand Cannoneer", "Hand Cannoneer", ROLES.GUNNER, false, { desc: "Although the earliest archaeological evidence of a cannon dates to the Xia period in the early 13th century, it was not until the late 13th century that portable guns were found with inscriptions of their manufacturing date, such as the Xanadu hand cannon of 1298 AD. The development of faster-burning gunpowder mixtures—far more explosive than the earlier, slower-burning formulas—was the key breakthrough that made these weapons practical. Though inaccurate and prone to misfire, these brave infantrymen unleash thunderous blasts of lead and scrap metal. The concussive roar and choking smoke terrify enemy troops and horses alike, heralding cannon warfare, even if they don't hit anything.", weightClass: WEIGHT_CLASSES.LIGHT_INF, isRanged: true, ammo: 30, health: 100, meleeAttack: 10, meleeDefense: 12, missileBaseDamage: 25, missileAPDamage: 50, accuracy: 35, armor: ARMOR_TIERS.CLOTH, speed: 0.75, range: 800, morale: 70, cost: 60 });
    this.create("Camel Cannon", "Camel Cannon", ROLES.MOUNTED_GUNNER, true, { desc: "Probably the oldest archaeological find of a true gun, the Wuwei cannon was unearthed near Wuwei in modern Gansu and dated to around 1220 AD, within the arid domains of the Western Xia. Earlier gunpowder mixtures burned slowly and were used mainly in incendiary weapons—more akin to flamethrowers and fire lances than true firearms. The later development of faster-burning, more explosive powder made weapons like the Wuwei cannon possible. Likely requiring horses or camels to haul across positions, these cumbersome guns offered unprecedented mobile artillery, capable of hurling devastating—if wildly inaccurate—cannonballs into dense enemy formations.", weightClass: WEIGHT_CLASSES.CAV, isRanged: true, ammo: 60, health: 80, meleeAttack: 12, meleeDefense: 14, missileBaseDamage: 35, missileAPDamage: 80, accuracy: 40, armor: ARMOR_TIERS.CLOTH, speed: 0.7, range: 850, morale: 80, cost: 80 });
    this.create("Poison Crossbowman", "Poison Crossbowman", ROLES.CROSSBOW, false, { desc: "Stealthy auxiliaries often drawn from the southern tropical frontiers of Dai Viet or tribal mountain regions. They coat their crossbow bolts in potent, naturally derived neurotoxins like aconite, which does not need a powerful prod. Even a glancing flesh wound from their weapons can paralyze and kill, making them a psychological nightmare for advancing infantry.", weightClass: WEIGHT_CLASSES.LIGHT_INF, isRanged: true, ammo: 30, health: 80, meleeAttack: 10, meleeDefense: 12, missileBaseDamage: 60, missileAPDamage: 1, accuracy: 85, armor: ARMOR_TIERS.CLOTH, speed: 0.8, range: 400, morale: 55, cost: 45 });
    this.create("War Elephant", "War Elephant", ROLES.CAVALRY, true, { desc: "Deployed by the Dali Kingdom of modern day Yunnan, these Asian giants are the ultimate psychological weapon, trampling men and scaring warhorses. North African war elephants were the smallest battlefield elephants and are now extinct. Indian elephants are the largest in Asia, while many Southeast Asian elephants were medium-sized but agile. While much of the famous elephant warfare stayed north of the Sahara, the Kingdom of Aksum utilized large elephants extensively between the 3rd and 6th centuries AD, likely from sub-Saharan Africa.", weightClass: WEIGHT_CLASSES.ELEPHANT, health: 500, meleeAttack: 35, meleeDefense: 20, armor: ARMOR_TIERS.JUGGERNAUT, chargeBonus: 45, isLarge: true,speed: 1.1, range: 45, morale: 30, cost: 500 });
this.create("Repeater Crossbowman", "Repeater Crossbowman", ROLES.CROSSBOW, false, { desc: "The first evidence of repeating crossbows date back as early as ~400 BC, with archaeological finds showing an early push pull action design so small that they are more akin to personal defence weapons. They were not invented by Zhuge Liang as later legend claims. Instead, he is traditionally credited with improving or popularizing the weapon centuries later. The familiar lever-operated repeating crossbow in pop culture today, is the design most people know, which simplified the mechanism to draw, load, and release bolts in a single motion without complicated internal sear triggers unlike the Chinese bronze age repeater. While lacking the armor-piercing strength of standard crossbows, these weapons could unleash a rapid hail of bolts in seconds, making them highly effective for suppressing enemies at close range, though rarely lethal.", weightClass: WEIGHT_CLASSES.LIGHT_INF, isRanged: true, ammo: 50, magazine: 10, health: 100, meleeAttack: 10, meleeDefense: 10, missileBaseDamage: 15, missileAPDamage: 1, accuracy: 35, armor: ARMOR_TIERS.PARTIAL_LAMELLAR, speed: 0.85, range: 500, morale: 65, cost: 45 });
    this.create("Slinger", "Slinger", ROLES.THROWING, false, { desc: "These slingers came from the hardy mountain auxiliaries from the Tibetan plateau and still use them today for herding animals. Though their weapons appear primitive, they can launch stones with bone-shattering force. These warriors serve as a cost-effective screen of skirmishers, raining blunt-force trauma upon the enemy before fading back into the mountains. The concept of slings was so foreign to the Chinese that there was no character for it, yet the staff sling found its place in warfare, used to hurl stones and bombs with deadly effect.", weightClass: WEIGHT_CLASSES.LIGHT_INF, isRanged: true, ammo: 30, health: 80, meleeAttack: 6, meleeDefense: 8, missileBaseDamage: 5, missileAPDamage: 12, accuracy: 30, armor: ARMOR_TIERS.CLOTH, speed: 1.0, range: 650, morale: 40, cost: 20 });
    this.create("Glaiveman", "Glaiveman", ROLES.INFANTRY, false, { desc: "Highly disciplined warriors wielding the naginata, a curved blade mounted on a long shaft. Combining the reach of a spear with the cutting power of a sword, the naginata remained a staple of 13th-century Japanese warfare because it allowed mounted or foot soldiers to counter cavalry while still delivering lethal slashing strikes. These infantrymen are versatile combatants, capable of holding the line against charging horsemen or carving a bloody path through tightly packed enemy formations.", weightClass: WEIGHT_CLASSES.HEAVY_INF, health: 100, meleeAttack: 30, meleeDefense: 16, armor: ARMOR_TIERS.PARTIAL_LAMELLAR, speed: 0.75, range: 30, antiLargeDamage: 10, chargeBonus: 8,morale: 65, cost: 75 });
    
    this.create("Javelinier", "Javelinier", ROLES.THROWING, false, { desc: "Fast-moving tribal skirmishers from the southern fringes of the empire. Though rarely depicted in Han-dominated warfare — where crossbows were preferred — javelins were sometimes used by bandits, rebels, irregulars, and non-Han ethnic groups throughout the Sinosphere due to the simplicity, utility as melee weapons, and the strict civilian restrictions of crossbows. They sometimes hurled poison-tipped javelins and even the Song experimented with gunpowder packed javelins. Their hit-and-run tactics are essential for exhausting and disrupting the enemy before the true melee begins.", weightClass: WEIGHT_CLASSES.LIGHT_INF, isRanged: true, ammo: 4, health: 120, meleeAttack: 10, meleeDefense: 10, missileBaseDamage: 48, missileAPDamage: 5, accuracy: 50, armor: ARMOR_TIERS.CLOTH,antiLargeDamage: 10, speed: 0.75, hasShield: true, shieldBlockChance: 30, range: 150, morale: 50, cost: 65 });
}
};
UnitRoster.init(); 
 window.UnitRoster = UnitRoster; // <--- ADD THIS LINE


function getTacticalPosition(role, side, unitType) {
    let offsetX = 0;
    let offsetY = 0;
    let dir = (side === "player") ? -1 : 1;

    // 3. TACTICAL FORMATION LOGIC (Historical Setup)
    switch(role) {
        // --- FRONT LINE: MELEE INFANTRY ---
        // Tightened from 80 to 45 to close the gap to the ranged units
        case ROLES.SHIELD:
        case ROLES.PIKE:
        case ROLES.INFANTRY: 
        case ROLES.TWO_HANDED:
            offsetY = (45 * dir) + (Math.random() * 10 - 5); 
            break;

        // --- SECOND LINE: RANGED & SPECIALISTS ---
        // Tightened from 30 to 15 to stay immediately behind the infantry
        case ROLES.THROWING:
        case ROLES.GUNNER:
        case ROLES.CROSSBOW:
        case ROLES.ARCHER:
        case ROLES.FIRELANCE:
        case ROLES.BOMB:
        case ROLES.ROCKET:
            offsetY = (15 * dir) + (Math.random() * 6 - 3);
            break;

        // --- FLANKS: CAVALRY, CAMELS, ELEPHANTS ---
        // Cavalry is now centered vertically with the army core (0 offset)
        case ROLES.CAVALRY:
        case ROLES.HORSE_ARCHER:
        case ROLES.MOUNTED_GUNNER:
            offsetY = (0 * dir) + (Math.random() * 10 - 5);
            
            let flankSide = (Math.random() > 0.5) ? 1 : -1;
            let isHeavy = unitType && (unitType.includes("Elephant") || unitType.includes("Cannon"));
            
            // Fixed base width to keep them out of the center-line's way
            let baseFlankX = isHeavy ? 400 : 320;
            offsetX = (flankSide * baseFlankX) + (Math.random() * 40 - 20); 
            break;

        // --- REARGUARD / COMMANDER / UNKNOWN ---
        // Moved from -80 to -25. This puts the commander right behind the archers.
        default:
            offsetY = (-25 * dir) + (Math.random() * 4 - 2);
            break;
    }
    
    // 4. FINAL MICRO-JITTER
    // Restricting jitter to sub-pixel levels to maintain the grid feel
    offsetX += (Math.random() * 2 - 1);
    offsetY += (Math.random() * 2 - 1);

    return { x: offsetX, y: offsetY };
}
// ============================================================================
// BATTLE RESOLUTION & SUMMARY UI
// ============================================================================
 
function getReloadTime(unit) {
	
	    if (!unit || !unit.stats) return 60;
		
    const role = unit.stats.role;
    const name = unit.unitType;
	// Unit Type           | Time
// ------------------- | ------------------------
// Melee               | 1.0 sec
// Throwing            | 2.0 sec
// Archer              | 2.5 sec
// Crossbow            | 2.5 sec
// Repeater burst      | 0.5 sec (10 shots) then 8 second magazine reload
// Repeater full cycle | same as crossbow
// Bomb                | 5.8 sec
// Rocket              | near instant
 

    if (name === "Rocket") return 15;
    if (name === "Repeater Crossbowman") return 300;
    
    if (role === ROLES.ARCHER || role === ROLES.HORSE_ARCHER) return 170;
    if (role === ROLES.CROSSBOW) return 300;
    if (role === ROLES.GUNNER || role === ROLES.MOUNTED_GUNNER) return 300; 
    if (role === ROLES.FIRELANCE) return 80;
    if (role === ROLES.THROWING) return 120;
    if (role === ROLES.BOMB) return 250;

	if (!unit.isRanged) {
		if (role === ROLES.TWO_HANDED) return 80;
		if (role === ROLES.SHIELD) return 50;
		if (role === ROLES.CAVALRY) return 70;
		return 60;
	}


    return 60; 
}
