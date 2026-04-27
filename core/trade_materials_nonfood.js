"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// 1. RESOURCE CATALOG
//    Each resource has:
//      id            – unique key
//      label         – display name
//      emoji         – icon
//      basePrice     – fair-market gold value per UNIT
//      minPrice      – absolute floor (scarcity cap)
//      maxPrice      – absolute ceiling (glut cap)
//      packSize      – units per "pack" (1 pack horse load)
//      tileSources   – tile names that produce this natively
// ─────────────────────────────────────────────────────────────────────────────
const RESOURCE_CATALOG = {

    // ── OCEAN ──────────────────────────────────────────────────────────────
    sea_salt:         { id:"sea_salt",         label:"Sea Salt",          emoji:"🧂", basePrice:30,  minPrice:12,  maxPrice:75,  packSize:8, tileSources:["Ocean"] },
    ocean_pearls:     { id:"ocean_pearls",     label:"Ocean Pearls",      emoji:"🪩", basePrice:200, minPrice:80,  maxPrice:500, packSize:2, tileSources:["Ocean"] },
    dried_fish:       { id:"dried_fish",       label:"Fish Oil",        emoji:"🐟", basePrice:18,  minPrice:8,   maxPrice:50,  packSize:10, tileSources:["Ocean"] },
    whale_oil:        { id:"whale_oil",        label:"Whale Oil",         emoji:"🛢", basePrice:60,  minPrice:25,  maxPrice:150, packSize:5, tileSources:["Ocean"] },

    // ── COASTAL ────────────────────────────────────────────────────────────
    porcelain:        { id:"porcelain",        label:"Porcelain",         emoji:"🏺", basePrice:90,  minPrice:35,  maxPrice:220, packSize:3, tileSources:["Coastal"] },
    coral_jewelry:    { id:"coral_jewelry",    label:"Coral Jewelry",     emoji:"🪸", basePrice:130, minPrice:55,  maxPrice:300, packSize:2, tileSources:["Coastal"] },
    hemp_rope:        { id:"hemp_rope",        label:"Hemp Rope",         emoji:"🪢", basePrice:14,  minPrice:6,   maxPrice:40,  packSize:10, tileSources:["Coastal"] },
    salted_fish:      { id:"salted_fish",      label:"Fish Glue",       emoji:"🐠", basePrice:20,  minPrice:9,   maxPrice:55,  packSize:10, tileSources:["Coastal"] },

    // ── RIVER ──────────────────────────────────────────────────────────────
    freshwater_fish:  { id:"freshwater_fish",  label:"Feathers",   emoji:"🪶", basePrice:10,  minPrice:4,   maxPrice:30,  packSize:10, tileSources:["River"] },
    river_silk:       { id:"river_silk",       label:"Silk Worm",        emoji:"🐛", basePrice:75,  minPrice:30,  maxPrice:180, packSize:4, tileSources:["River"] },
    reed_paper:       { id:"reed_paper",       label:"Reed",        emoji:"🌾", basePrice:22,  minPrice:10,  maxPrice:60,  packSize:8, tileSources:["River"] },
    clay_pots:        { id:"clay_pots",        label:"Clay",         emoji:"🪣", basePrice:14,  minPrice:5,   maxPrice:35,  packSize:6, tileSources:["River"] },

    // ── PLAINS ─────────────────────────────────────────────────────────────
    war_horses:       { id:"war_horses",       label:"Pottery",        emoji:"🏺", basePrice:250, minPrice:50, maxPrice:200, packSize:1, tileSources:["Plains"] },
    linen_cloth:      { id:"linen_cloth",      label:"Hemp Cloth",       emoji:"🧵", basePrice:25,  minPrice:10,  maxPrice:65,  packSize:8, tileSources:["Plains"] },
    draft_oxen:       { id:"draft_oxen",       label:"Pack Animal",        emoji:"🐎", basePrice:90,  minPrice:40,  maxPrice:200, packSize:1, tileSources:["Plains"] },
    tallow_candles:   { id:"tallow_candles",   label:"Tallow Candles",    emoji:"🕯",  basePrice:18,  minPrice:8,   maxPrice:45,  packSize:8, tileSources:["Plains"] },

    // ── STEPPES ────────────────────────────────────────────────────────────
    felt_cloth:       { id:"felt_cloth",       label:"Felt Cloth",        emoji:"🧶", basePrice:30,  minPrice:12,  maxPrice:80,  packSize:7, tileSources:["Steppes"] },
    dried_meat:       { id:"dried_meat",       label:"War Horses",        emoji:"🎠", basePrice:322,  minPrice:200,   maxPrice:550,  packSize:1, tileSources:["Steppes"] },
    leather_hides:    { id:"leather_hides",    label:"Leather Hides",     emoji:"🟫", basePrice:40,  minPrice:18,  maxPrice:95,  packSize:5, tileSources:["Steppes"] },
    bone_tools:       { id:"bone_tools",       label:"Bone Tools",        emoji:"🦴", basePrice:16,  minPrice:6,   maxPrice:40,  packSize:8, tileSources:["Steppes"] },

    // ── MEADOW ─────────────────────────────────────────────────────────────
    wool_bales:       { id:"wool_bales",       label:"Wool Bales",        emoji:"🐑", basePrice:28,  minPrice:11,  maxPrice:70,  packSize:7, tileSources:["Meadow"] },
    honey_jars:       { id:"honey_jars",       label:"Honey Jars",        emoji:"🍯", basePrice:38,  minPrice:16,  maxPrice:90,  packSize:5, tileSources:["Meadow"] },
    medicinal_herbs:  { id:"medicinal_herbs",  label:"Medicinal Herbs",   emoji:"🌿", basePrice:55,  minPrice:22,  maxPrice:130, packSize:5, tileSources:["Meadow"] },
    natural_dyes:     { id:"natural_dyes",     label:"Natural Dyes",      emoji:"🎨", basePrice:48,  minPrice:20,  maxPrice:115, packSize:5, tileSources:["Meadow"] },

    // ── FOREST ─────────────────────────────────────────────────────────────
    fur_pelts:        { id:"fur_pelts",        label:"Fur Pelts",         emoji:"🦊", basePrice:85,  minPrice:35,  maxPrice:200, packSize:4, tileSources:["Forest"] },
    timber_logs:      { id:"timber_logs",      label:"Timber Logs",       emoji:"🪵", basePrice:20,  minPrice:8,   maxPrice:50,  packSize:6, tileSources:["Forest"] },
    beeswax:          { id:"beeswax",          label:"Beeswax",           emoji:"🐝", basePrice:42,  minPrice:18,  maxPrice:100, packSize:5, tileSources:["Forest"] },
    pine_resin:       { id:"pine_resin",       label:"Pine Resin",        emoji:"🌲", basePrice:28,  minPrice:11,  maxPrice:70,  packSize:6, tileSources:["Forest"] },

    // ── DENSE FOREST (JUNGLE) ──────────────────────────────────────────────
    hardwood_planks:  { id:"hardwood_planks",  label:"Hardwood Planks",   emoji:"🪓", basePrice:55,  minPrice:22,  maxPrice:130, packSize:5, tileSources:["Dense Forest"] },
    exotic_spices:    { id:"exotic_spices",    label:"Exotic Spices",     emoji:"🫙", basePrice:130, minPrice:55,  maxPrice:300, packSize:3, tileSources:["Dense Forest"] },
    rubber_sap:       { id:"rubber_sap",       label:"Bamboo",        emoji:"🎋", basePrice:25,  minPrice:18,  maxPrice:55, packSize:4, tileSources:["Dense Forest"] },
    exotic_birds:     { id:"exotic_birds",     label:"Exotic Birds",      emoji:"🦜", basePrice:100, minPrice:40,  maxPrice:240, packSize:2, tileSources:["Dense Forest"] },

    // ── HIGHLANDS ─────────────────────────────────────────────────────────
    iron_tools:       { id:"iron_tools",       label:"Iron Tools",        emoji:"⚒️", basePrice:70,  minPrice:28,  maxPrice:165, packSize:4, tileSources:["Highlands"] },
    rough_gemstones:  { id:"rough_gemstones",  label:"Rough Gemstones",   emoji:"💎", basePrice:110, minPrice:45,  maxPrice:260, packSize:3, tileSources:["Highlands"] },
    highland_wool:    { id:"highland_wool",    label:"Highland Wool",     emoji:"🧣", basePrice:35,  minPrice:14,  maxPrice:85,  packSize:7, tileSources:["Highlands"] },
    charcoal_bags:    { id:"charcoal_bags",    label:"Charcoal",          emoji:"⬛", basePrice:20,  minPrice:8,   maxPrice:50,  packSize:8, tileSources:["Highlands"] },

    // ── MOUNTAINS ─────────────────────────────────────────────────────────
    silver_ingots:    { id:"silver_ingots",    label:"Silver Ingots",     emoji:"🥈", basePrice:190, minPrice:80,  maxPrice:450, packSize:2, tileSources:["Mountains"] },
    copper_ore:       { id:"copper_ore",       label:"Copper Ore",        emoji:"🟠", basePrice:50,  minPrice:20,  maxPrice:120, packSize:5, tileSources:["Mountains"] },
    mountain_stone:   { id:"mountain_stone",   label:"Mountain Stone",    emoji:"🪨", basePrice:15,  minPrice:5,   maxPrice:40,  packSize:8, tileSources:["Mountains"] },
    rock_salt:        { id:"rock_salt",        label:"Rock Salt",         emoji:"🟤", basePrice:25,  minPrice:10,  maxPrice:65,  packSize:8, tileSources:["Mountains"] },

    // ── LARGE MOUNTAINS / SNOWY PEAKS (HIMALAYAS) ─────────────────────────
    musk_pods:        { id:"musk_pods",        label:"Musk Pods",         emoji:"🦌", basePrice:220, minPrice:90,  maxPrice:520, packSize:2, tileSources:["Large Mountains","Snowy Peaks"] },
    yak_hair:         { id:"yak_hair",         label:"Yak Hair Cloth",    emoji:"🦬", basePrice:45,  minPrice:18,  maxPrice:105, packSize:5, tileSources:["Large Mountains","Snowy Peaks"] },
    glacier_medicine: { id:"glacier_medicine", label:"Glacier Medicine",  emoji:"💊", basePrice:95,  minPrice:40,  maxPrice:220, packSize:3, tileSources:["Large Mountains","Snowy Peaks"] },
    snow_leopard_pelt:{ id:"snow_leopard_pelt",label:"Snow Leopard Pelt", emoji:"🐆", basePrice:280, minPrice:120, maxPrice:650, packSize:1, tileSources:["Large Mountains","Snowy Peaks"] },

    // ── DESERT ────────────────────────────────────────────────────────────
    jade_artifacts:   { id:"jade_artifacts",   label:"Jade Artifacts",    emoji:"🟩", basePrice:170, minPrice:70,  maxPrice:400, packSize:2, tileSources:["Desert"] },
    desert_glass:     { id:"desert_glass",     label:"Desert Glass",      emoji:"🔮", basePrice:80,  minPrice:32,  maxPrice:190, packSize:3, tileSources:["Desert"] },
    camel_leather:    { id:"camel_leather",    label:"Persian Exotics",     emoji:"🐫", basePrice:60,  minPrice:25,  maxPrice:140, packSize:4, tileSources:["Desert"] },
    date_palm_oil:    { id:"date_palm_oil",    label:"Date Palm Oil",     emoji:"🌴", basePrice:32,  minPrice:13,  maxPrice:80,  packSize:6, tileSources:["Desert"] },

    // ── DUNES ─────────────────────────────────────────────────────────────
    silk_bolts:       { id:"silk_bolts",       label:"Silk Bolts",        emoji:"🎏", basePrice:150, minPrice:60,  maxPrice:350, packSize:3, tileSources:["Dunes"] },
    lapis_lazuli:     { id:"lapis_lazuli",     label:"Lapis Lazuli",      emoji:"🔵", basePrice:190, minPrice:80,  maxPrice:440, packSize:2, tileSources:["Dunes"] },
    gold_dust:        { id:"gold_dust",        label:"Gold Dust",         emoji:"✨", basePrice:230, minPrice:100, maxPrice:550, packSize:2, tileSources:["Dunes"] },
    sandalwood:       { id:"sandalwood",       label:"Sandalwood",        emoji:"🪷", basePrice:105, minPrice:45,  maxPrice:245, packSize:3, tileSources:["Dunes"] },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. TILE → PRIMARY RESOURCES  (first entry = most abundant native product)
// ─────────────────────────────────────────────────────────────────────────────
const TILE_RESOURCES = {
    "Ocean":          ["sea_salt","dried_fish","whale_oil","ocean_pearls"],
    "Coastal":        ["salted_fish","hemp_rope","porcelain","coral_jewelry"],
    "River":          ["freshwater_fish","clay_pots","reed_paper","river_silk"],
    "Plains":         ["linen_cloth","tallow_candles","draft_oxen","war_horses"],
    "Steppes":        ["dried_meat","felt_cloth","bone_tools","leather_hides"],
    "Meadow":         ["wool_bales","honey_jars","natural_dyes","medicinal_herbs"],
    "Forest":         ["timber_logs","pine_resin","beeswax","fur_pelts"],
    "Dense Forest":   ["hardwood_planks","rubber_sap","exotic_birds","exotic_spices"],
    "Highlands":      ["charcoal_bags","highland_wool","iron_tools","rough_gemstones"],
    "Mountains":      ["mountain_stone","rock_salt","copper_ore","silver_ingots"],
    "Large Mountains":["yak_hair","glacier_medicine","musk_pods","snow_leopard_pelt"],
    "Snowy Peaks":    ["yak_hair","glacier_medicine","musk_pods","snow_leopard_pelt"],
    "Desert":         ["date_palm_oil","camel_leather","desert_glass","jade_artifacts"],
    "Dunes":          ["sandalwood","silk_bolts","lapis_lazuli","gold_dust"],
    // Fallback for any unlisted tile
    "_default":       ["linen_cloth","timber_logs","clay_pots","rock_salt"],
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. FACTION DEMAND WEIGHTS
//    A multiplier > 1.0 means the faction CRAVES that resource (landlocked
//    factions want ocean goods, desert factions want forest goods, etc.)
//    A multiplier < 1.0 means they produce it locally and don't need imports.
//    1.0 = neutral / average demand.
// ─────────────────────────────────────────────────────────────────────────────
const FACTION_DEMAND = {

    // HONG DYNASTY  — Heartland river/plains. Rich, wants luxury & war goods.
    "Hong Dynasty": {
        ocean_pearls:1.8, whale_oil:1.5, sea_salt:1.3, silk_bolts:1.6,
        musk_pods:1.7, snow_leopard_pelt:1.9, jade_artifacts:1.4,
        war_horses:1.8, silver_ingots:1.3, iron_tools:1.2,
        dried_fish:0.7, freshwater_fish:0.6, clay_pots:0.7, reed_paper:0.6,
    },

    // DAB TRIBES  — Extreme south jungle. Wants metals, mountain & ocean goods.
    "Dab Tribes": {
        iron_tools:1.9, silver_ingots:1.7, copper_ore:1.6, mountain_stone:1.4,
        sea_salt:1.5, ocean_pearls:1.6, musk_pods:1.5, glacier_medicine:1.4,
        war_horses:1.6, felt_cloth:1.4, leather_hides:1.3,
        hardwood_planks:0.6, rubber_sap:0.5, exotic_spices:0.6, exotic_birds:0.5,
    },

    // GREAT KHAGANATE  — Far north steppes. Wants ocean luxuries, silk, metals.
    "Great Khaganate": {
        sea_salt:1.6, ocean_pearls:2.0, silk_bolts:1.9, porcelain:1.8,
        jade_artifacts:1.7, exotic_spices:1.5, river_silk:1.6,
        silver_ingots:1.5, iron_tools:1.4, hardwood_planks:1.5,
        dried_meat:0.5, felt_cloth:0.5, leather_hides:0.6, bone_tools:0.6,
        war_horses:0.7,
    },

    // JINLORD CONFEDERACY  — Northeast forests. Wants southern & ocean goods.
    "Jinlord Confederacy": {
        silk_bolts:1.8, porcelain:1.7, exotic_spices:1.6, ocean_pearls:1.7,
        sea_salt:1.4, jade_artifacts:1.5, war_horses:1.6, copper_ore:1.3,
        desert_glass:1.4, gold_dust:1.5,
        fur_pelts:0.6, timber_logs:0.5, pine_resin:0.6, beeswax:0.6,
    },

    // TRAN REALM  — Southeast coastal/jungle. Wants steppe, mountain goods.
    "Tran Realm": {
        war_horses:1.9, felt_cloth:1.7, dried_meat:1.6, leather_hides:1.5,
        silver_ingots:1.6, copper_ore:1.5, iron_tools:1.4, musk_pods:1.6,
        snow_leopard_pelt:1.5, rock_salt:1.3,
        salted_fish:0.5, dried_fish:0.5, hemp_rope:0.6, porcelain:0.7,
    },

    // GORYUN KINGDOM  — East coast. Wants inland & desert luxuries.
    "Goryun Kingdom": {
        jade_artifacts:1.9, lapis_lazuli:1.8, gold_dust:1.7, silk_bolts:1.6,
        exotic_spices:1.5, sandalwood:1.6, musk_pods:1.5, war_horses:1.4,
        highland_wool:1.3, silver_ingots:1.4,
        salted_fish:0.6, sea_salt:0.7, hemp_rope:0.6,
    },

    // XIARAN DOMINION  — Northwest desert/dunes. LANDLOCKED. Craves ocean goods.
    "Xiaran Dominion": {
        sea_salt:2.2, ocean_pearls:2.5, dried_fish:2.0, whale_oil:1.9,
        salted_fish:2.0, coral_jewelry:2.3, freshwater_fish:1.8,
        fur_pelts:1.7, timber_logs:1.8, hardwood_planks:1.6, beeswax:1.5,
        exotic_birds:1.6, rubber_sap:1.4,
        jade_artifacts:0.7, desert_glass:0.6, camel_leather:0.5, date_palm_oil:0.5,
        silk_bolts:0.7, lapis_lazuli:0.7, gold_dust:0.8, sandalwood:0.7,
    },

    // HIGH PLATEAU KINGDOMS  — Southwest highlands/mountains/snow. Very isolated.
    "High Plateau Kingdoms": {
        silk_bolts:1.9, porcelain:1.8, sea_salt:2.0, ocean_pearls:2.2,
        exotic_spices:1.7, jade_artifacts:1.6, war_horses:1.5, coral_jewelry:1.8,
        dried_fish:1.9, salted_fish:1.8, hemp_rope:1.5,
        musk_pods:0.6, yak_hair:0.5, glacier_medicine:0.6, snow_leopard_pelt:0.6,
    },

    // YAMATO CLANS  — Extreme east island/coastal. Wants mainland goods.
    "Yamato Clans": {
        silk_bolts:1.7, jade_artifacts:1.6, porcelain:1.5, exotic_spices:1.6,
        musk_pods:1.5, snow_leopard_pelt:1.4, lapis_lazuli:1.6,
        iron_tools:1.5, war_horses:1.7, linen_cloth:1.4,
        salted_fish:0.6, dried_fish:0.7, whale_oil:0.7, hemp_rope:0.6,
    },

    // BANDITS  — No special demand, pure opportunism.
    "Bandits": {},

    // PLAYER'S KINGDOM  — East coast anchor, balanced demand.
    "Player's Kingdom": {
        war_horses:1.3, silk_bolts:1.2, exotic_spices:1.2, musk_pods:1.1,
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. INTERNAL STATE
// ─────────────────────────────────────────────────────────────────────────────
let _marketTickCounter = 0;
const MARKET_TICK_INTERVAL = 600; // frames (~10 sec at 60fps); call tickAllMarkets every this many frames

// ─────────────────────────────────────────────────────────────────────────────
// 5. HELPER: get tile at world pixel coordinates
// ─────────────────────────────────────────────────────────────────────────────
function _getTileAtCity(city) {
    const mapRef  = window._tradeWorldRef  || (typeof worldMapRef  !== 'undefined' ? worldMapRef  : null);
    const ts      = window._tradeTileSize  || (typeof tSize        !== 'undefined' ? tSize        : 16);
    if (!mapRef) return "_default";
    const tx = Math.floor(city.x / ts);
    const ty = Math.floor(city.y / ts);
    const tile = mapRef[tx] && mapRef[tx][ty] ? mapRef[tx][ty] : null;
    return tile ? (tile.name || "_default") : "_default";
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. MARKET INITIALIZATION  [HOOK A calls this]
//    city.market = { resourceId: { stock, price, idealStock } }
// ─────────────────────────────────────────────────────────────────────────────
function initCityMarket(city) {
    if (city.market) return; // Already initialized
    city.market = {};

    const tileName = _getTileAtCity(city);
    const nativeIds = TILE_RESOURCES[tileName] || TILE_RESOURCES["_default"];

// 6a. Give native resources a MASSIVE starting stock (Local Abundance)
    nativeIds.forEach((rid, idx) => {
        const res = RESOURCE_CATALOG[rid];
        if (!res) return;
        
        // The first item in the tile's array gets 100% (1.0), the 4th gets 46% (0.46)
        const abundanceFactor = 1.0 - idx * 0.18; 
        
        // SURGERY: Crank ideal stock from ~100 up to ~500 for primary goods
        const idealStock = Math.round((350 + Math.random() * 100) * abundanceFactor);
        
        // Init stock is between 80% and 120% of ideal (to create slight market fluctuations)
        const initStock  = Math.round(idealStock * (0.8 + Math.random() * 0.4)); 
        
        city.market[rid] = {
            stock:      initStock,
            idealStock: idealStock,
            price:      _calcPrice(res, initStock, idealStock, city.faction),
        };
    });

// 6b. Extreme Scarcity for imports: Cities barely have any foreign goods
    Object.keys(RESOURCE_CATALOG).forEach(rid => {
        if (city.market[rid]) return; // Already native
        const res = RESOURCE_CATALOG[rid];
        
        // SURGERY: They only WANT 2 to 6 units of foreign goods to begin with
        const idealStock = 2 + Math.floor(Math.random() * 5); 
        
        // SURGERY: But they actually HAVE almost none of it (0% to 40% of ideal)
        // This will frequently result in exactly 0 or 1 unit of stock.
        const initStock  = Math.floor(idealStock * (0.0 + Math.random() * 0.4)); 
        
        city.market[rid] = {
            stock:      initStock,
            idealStock: idealStock,
            price:      _calcPrice(res, initStock, idealStock, city.faction),
        };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. PRICE CALCULATION (supply/demand + faction desire)
// ─────────────────────────────────────────────────────────────────────────────
function _calcPrice(res, currentStock, idealStock, faction) {
    // Supply factor: scarce → price rises; abundant → price falls
    const ratio   = idealStock > 0 ? currentStock / idealStock : 1;
    // Inverted: ratio=0 → +100% premium; ratio=2 → -50% discount
    const supplyMod = 1 + (1 - Math.min(ratio, 2)) * 0.65;

    // Faction demand factor
    const demandTable = FACTION_DEMAND[faction] || {};
    const demandMod   = demandTable[res.id] !== undefined ? demandTable[res.id] : 1.0;

    let price = Math.round(res.basePrice * supplyMod * demandMod);
    price = Math.max(res.minPrice, Math.min(res.maxPrice, price));
    return price;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. MARKET TICK  [HOOK B calls tickAllMarkets]
//    Runs periodically to:
//      a. Regenerate native stock slightly
//      b. Slowly drain exotic stock (consumed / exported)
//      c. Recalculate prices
// ─────────────────────────────────────────────────────────────────────────────
function tickAllMarkets(cities) {
    _marketTickCounter++;
    if (_marketTickCounter % MARKET_TICK_INTERVAL !== 0) return;
    if (!cities || !cities.length) return;

    cities.forEach(city => {
        if (!city.market) { initCityMarket(city); return; }
        const tileName  = _getTileAtCity(city);
        const nativeIds = new Set(TILE_RESOURCES[tileName] || TILE_RESOURCES["_default"]);

        Object.keys(city.market).forEach(rid => {
            const entry = city.market[rid];
            const res   = RESOURCE_CATALOG[rid];
            if (!res) return;

            if (nativeIds.has(rid)) {
                // Native: slowly restock toward idealStock
                const deficit = entry.idealStock - entry.stock;
                const regen   = Math.ceil(deficit * 0.08) + 1; // ~8% recovery + 1
                entry.stock   = Math.min(entry.idealStock * 1.5, entry.stock + regen);
            } else {
                // Imported: slowly drain (city uses/exports a little each tick)
                const drain  = Math.ceil(entry.stock * 0.05);
                entry.stock  = Math.max(0, entry.stock - drain);
            }

            // Recalculate price
            entry.price = _calcPrice(res, entry.stock, entry.idealStock, city.faction);
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. NPC TRADE LOGIC  — Commerce NPC arrives at destination city
//    Call npcArriveAndTrade(npc, tc) from the Commerce arrival block.
//    Returns: nothing (mutates npc and tc directly)
// ─────────────────────────────────────────────────────────────────────────────
function npcArriveAndTrade(npc, tc) {
    if (!tc.market) initCityMarket(tc);
    if (!npc.cargo) return; // No cargo; nothing to trade

    // 9a. SELL goods the NPC carries to the destination city
    Object.keys(npc.cargo).forEach(rid => {
        const qty = npc.cargo[rid];
        if (qty <= 0) return;
        const entry = tc.market[rid];
        if (!entry) return;
        const res   = RESOURCE_CATALOG[rid];
        // NPC sells at current market price (city buys from NPC)
        const revenue = Math.round(entry.price * qty * 0.85); // 15% merchant cut kept
        npc.gold     += revenue;
        tc.gold      -= Math.min(tc.gold, revenue);
        entry.stock  += qty;
        entry.price   = _calcPrice(res, entry.stock, entry.idealStock, tc.faction);
        delete npc.cargo[rid];
    });

    // 9b. BUY goods from destination to carry back (pick top 2 valuable deficit items)
    const tileName   = _getTileAtCity(tc);
    const nativeIds  = new Set(TILE_RESOURCES[tileName] || TILE_RESOURCES["_default"]);
    // Find resources the destination has surplus of (will be cheap)
    const deals = Object.keys(tc.market)
        .filter(rid => {
            const e = tc.market[rid];
            return nativeIds.has(rid) && e.stock > e.idealStock * 0.5 && e.stock >= 3;
        })
        .sort((a, b) => {
            // Prioritize high-value, high-stock items
            const ea = tc.market[a], eb = tc.market[b];
            return (eb.price * eb.stock) - (ea.price * ea.stock);
        })
        .slice(0, 3);

// SURGERY: Commerce units get 100 capacity per man (10x bonus). Everyone else gets 10.
    const cargoCapacity = npc.count * (npc.role === "Commerce" ? 20 : 2); 
    let cargoLoad = 0;
    npc.cargo = {};

    deals.forEach(rid => {
        if (cargoLoad >= cargoCapacity) return;
        const entry   = tc.market[rid];
        const res     = RESOURCE_CATALOG[rid];
        const canBuy  = Math.min(
            Math.floor((cargoCapacity - cargoLoad) / 2),
            Math.floor(entry.stock * 0.3),
            Math.floor(npc.gold / Math.max(1, entry.price))
        );
        if (canBuy <= 0) return;
        const cost     = Math.round(entry.price * canBuy * 0.9); // small bulk discount
        npc.gold      -= cost;
        tc.gold       += cost;
        entry.stock   -= canBuy;
        entry.price    = _calcPrice(res, entry.stock, entry.idealStock, tc.faction);
        npc.cargo[rid] = canBuy;
        cargoLoad     += canBuy;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. PLAYER INVENTORY HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function _ensurePlayerInventory() {
    if (typeof player === 'undefined') return false;
    if (!player.inventory) player.inventory = {};
    
    // SURGERY: Slashing capacity by 5x (2 per troop, min 10)
    player.cargoCapacity = Math.max(10, (player.troops || 1) * 2); 
    
    player.cargoUsed = Object.values(player.inventory).reduce((s, v) => s + v, 0);
    return true;
}

function getCargoUsed() {
    if (!_ensurePlayerInventory()) return 0;
    return Object.values(player.inventory).reduce((s, v) => s + v, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. PLAYER BUY / SELL
// ─────────────────────────────────────────────────────────────────────────────
function playerBuyResource(city, rid, qty) {
    if (!_ensurePlayerInventory()) return { ok:false, msg:"No player" };
    if (!city || !city.market || !city.market[rid]) return { ok:false, msg:"Not sold here" };

    const entry = city.market[rid];
    const res   = RESOURCE_CATALOG[rid];
    qty = Math.max(1, Math.min(qty, entry.stock));

    const cargoUsed = getCargoUsed();
    const freeSpace = player.cargoCapacity - cargoUsed;
    if (freeSpace < qty) qty = freeSpace;
    if (qty <= 0) return { ok:false, msg:"No cargo space!" };

    const totalCost = entry.price * qty;
    if (player.gold < totalCost) return { ok:false, msg:`Need ${totalCost}g (have ${Math.floor(player.gold)}g)` };

    player.gold -= totalCost;
    player.inventory[rid] = (player.inventory[rid] || 0) + qty;
    entry.stock -= qty;
    entry.price  = _calcPrice(res, entry.stock, entry.idealStock, city.faction);

    return { ok:true, msg:`Bought ${qty}× ${res.label} for ${totalCost}g` };
}

function playerSellResource(city, rid, qty) {
    if (!_ensurePlayerInventory()) return { ok:false, msg:"No player" };
    if (!city || !city.market) return { ok:false, msg:"No market" };
    if (!player.inventory[rid] || player.inventory[rid] <= 0) return { ok:false, msg:"You have none" };

    qty = Math.min(qty, player.inventory[rid]);
    if (!city.market[rid]) {
        // City doesn't carry this; create a small entry
        const res2 = RESOURCE_CATALOG[rid];
        city.market[rid] = { stock:0, idealStock:10, price: Math.round(res2.basePrice * 0.6) };
    }

    const entry   = city.market[rid];
    const res     = RESOURCE_CATALOG[rid];
    // Sell price = 80% of current market price (merchant fee)
    const revenue = Math.round(entry.price * qty * 0.80);

    player.gold                += revenue;
    player.inventory[rid]      -= qty;
    if (player.inventory[rid] <= 0) delete player.inventory[rid];
    entry.stock                += qty;
    entry.price                 = _calcPrice(res, entry.stock, entry.idealStock, city.faction);

    return { ok:true, msg:`Sold ${qty}× ${res.label} for ${revenue}g` };
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. TRADE PANEL UI  — Mobile-friendly HTML overlay
// ─────────────────────────────────────────────────────────────────────────────
let _tradePanelCity = null;
let _tradeTab       = "buy"; // "buy" | "sell"

function openTradePanel() {
    const city = typeof activeCity !== 'undefined' ? activeCity : _tradePanelCity;
    if (!city) { console.warn("Trade: no activeCity"); return; }
    
    _tradePanelCity = city;
    if (!city.market) initCityMarket(city);
    _ensurePlayerInventory();
    
    // HARD PAUSE overworld and hide the City Panel to prevent UI overlap
    if (typeof player !== 'undefined') player.isMapPaused = true;
	window.inTradeMode = true; // <-- ADD THIS
    const cityPanel = document.getElementById('city-panel');
    if (cityPanel) cityPanel.style.display = 'none';
    if (typeof AudioManager !== 'undefined') AudioManager.playSound('ui_click');

    _renderTradePanel();
    
    const panel = document.getElementById("trade-panel");
    if (panel) panel.style.display = "block";
}

function closeTradePanel() {
    const panel = document.getElementById("trade-panel");
    if (panel) panel.style.display = "none";
    
    // UNPAUSE overworld and restore City Panel
    if (typeof player !== 'undefined') player.isMapPaused = false;
	window.inTradeMode = false; // <-- ADD THIS
    const cityPanel = document.getElementById('city-panel');
    if (cityPanel) cityPanel.style.display = 'block';
    if (typeof AudioManager !== 'undefined') AudioManager.playSound('ui_parle_close');
    
    _tradePanelCity = null;
}

// Called from [HOOK F] so the Trade button gets hidden/shown based on hostility
function refreshTradeButton(city) {
    const btn = document.getElementById("trade-btn");
    if (!btn) return;
    if (typeof player === 'undefined') return;
    const enemies = player.enemies || [];
    const isHostile = city && enemies.includes(city.faction);
    btn.style.display = isHostile ? "none" : "inline-block";
}

function _setTradeTab(tab) {
    _tradeTab = tab;
    _renderTradePanel();
}

function _renderTradePanel() {
    const panel = document.getElementById("trade-panel");
    if (!panel) return;
    const city = _tradePanelCity;
    if (!city || !city.market) { panel.innerHTML = "<p>No market.</p>"; return; }

    _ensurePlayerInventory();
    const cargoUsed = getCargoUsed();
    const cargoMax  = player.cargoCapacity || 50;

    // Determine which resources to show
    const tileName  = _getTileAtCity(city);
    const nativeSet = new Set(TILE_RESOURCES[tileName] || TILE_RESOURCES["_default"]);
    // Show native first, then anything player has, then imports with stock > 0
    const buyList = [
        ...Array.from(nativeSet),
        ...Object.keys(city.market).filter(rid => !nativeSet.has(rid) && city.market[rid].stock > 0),
    ].filter((v, i, a) => a.indexOf(v) === i); // dedupe

    const sellList = Object.keys(player.inventory || {}).filter(rid => (player.inventory[rid] || 0) > 0);

    // ── Build HTML ──────────────────────────────────────────────────────────
    let html = `
<div id="trade-overlay-bg" onclick="closeTradePanel()" style="
    position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:10000;">
</div>
<div id="trade-modal" onclick="event.stopPropagation()" style="
    position:fixed;
    top:50%;left:50%;transform:translate(-50%,-50%);
    width:min(560px,96vw);
    max-height:88vh;
    background:linear-gradient(to bottom,#1a0c07,#0d0703);
    border:2px solid #d4b886;border-radius:10px;
    z-index:10001;display:flex;flex-direction:column;
    font-family:Georgia,serif;color:#d4b886;
    overflow:hidden;
">
  <!-- HEADER -->
  <div style="
      background:linear-gradient(to bottom,#7b1a1a,#4a0a0a);
      border-bottom:2px solid #ffca28;
      padding:10px 14px;display:flex;justify-content:space-between;align-items:center;
      flex-shrink:0;
  ">
    <div>
      <div style="font-size:clamp(14px,4vw,18px);font-weight:bold;color:#ffca28;">
        🛒 ${city.name || "City"} Market
      </div>
<div style="font-size:clamp(10px,2.5vw,13px);color:#aaa;margin-top:2px;">
        ${city.faction || ""} &nbsp;|&nbsp;
        💰 Gold: <span style="color:#ffca28;">${Math.floor(player.gold || 0)}</span> &nbsp;|&nbsp;
        🌾 Food: <span style="color:#8bc34a;">${Math.floor(player.food || 0)}</span> &nbsp;|&nbsp;
        🎒 Cargo: <span style="color:${cargoUsed>=cargoMax?'#f44':'#8bc34a'}">${cargoUsed}/${cargoMax}</span>
      </div>
    </div>
    <button onclick="closeTradePanel()" style="
        background:transparent;border:1px solid #d4b886;color:#d4b886;
        padding:6px 12px;border-radius:5px;cursor:pointer;font-size:16px;">✕</button>
  </div>

  <!-- TABS -->
  <div style="display:flex;border-bottom:1px solid #555;flex-shrink:0;">
    <button onclick="_setTradeTab('buy')" style="
        flex:1;padding:9px;cursor:pointer;border:none;
        background:${_tradeTab==='buy'?'#2e1a00':'transparent'};
        color:${_tradeTab==='buy'?'#ffca28':'#aaa'};
        border-bottom:${_tradeTab==='buy'?'2px solid #ffca28':'none'};
        font-family:Georgia,serif;font-size:clamp(12px,3vw,15px);">
      🏪 Buy from City
    </button>
    <button onclick="_setTradeTab('sell')" style="
        flex:1;padding:9px;cursor:pointer;border:none;
        background:${_tradeTab==='sell'?'#002e0a':'transparent'};
        color:${_tradeTab==='sell'?'#8bc34a':'#aaa'};
        border-bottom:${_tradeTab==='sell'?'2px solid #8bc34a':'none'};
        font-family:Georgia,serif;font-size:clamp(12px,3vw,15px);">
      💰 Sell to City
    </button>
  </div>

  <!-- BODY (scrollable) -->
  <div id="trade-body" style="overflow-y:auto;flex:1;padding:8px 10px;">
`;

    if (_tradeTab === "buy") {
        if (buyList.length === 0) {
            html += `<p style="color:#888;text-align:center;padding:20px">Nothing available.</p>`;
        } else {
            buyList.forEach(rid => {
                const entry = city.market[rid];
                const res   = RESOURCE_CATALOG[rid];
                if (!entry || !res) return;
                const isNative  = nativeSet.has(rid);
                const stock     = entry.stock;
                const pricePer  = entry.price;
                const owned     = (player.inventory[rid] || 0);
                const stockCol  = stock > entry.idealStock * 0.6 ? "#8bc34a" : stock > 3 ? "#ffca28" : "#f44";
                html += `
<div style="
    display:flex;align-items:center;gap:8px;
    padding:8px;margin-bottom:5px;
    background:rgba(255,255,255,0.04);border-radius:6px;
    border-left:3px solid ${isNative?'#ffca28':'#555'};
">
  <span style="font-size:clamp(18px,5vw,24px)">${res.emoji}</span>
  <div style="flex:1;min-width:0;">
    <div style="font-size:clamp(11px,3vw,14px);font-weight:bold;color:#ffca28;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
      ${res.label}${isNative?' ⭐':''}
    </div>
    <div style="font-size:clamp(9px,2.2vw,11px);color:#aaa;">
      Stock: <span style="color:${stockCol}">${stock}</span>
      &nbsp;|&nbsp; Pack:${res.packSize}u
      &nbsp;|&nbsp; Owned:${owned}
    </div>
  </div>
  <div style="text-align:right;flex-shrink:0;">
    <div style="color:#ffca28;font-weight:bold;font-size:clamp(12px,3vw,15px);">${pricePer}Gold/unit</div>
    <div style="display:flex;gap:3px;margin-top:4px;">
      <button onclick="_tradeBuy('${rid}',1)" style="${_buyBtnStyle()}" ${stock<1?'disabled':''}>+1</button>
      <button onclick="_tradeBuy('${rid}',${res.packSize})" style="${_buyBtnStyle()}" ${stock<res.packSize?'disabled':''}>+${res.packSize}</button>
      <button onclick="_tradeBuyMax('${rid}')" style="${_buyBtnStyle('#1a6b3a')}" ${stock<1?'disabled':''}>MAX</button>
    </div>
  </div>
</div>`;
            });
        }
    } else {
        // SELL TAB
        if (sellList.length === 0) {
            html += `<p style="color:#888;text-align:center;padding:20px">Your cargo is empty.</p>`;
        } else {
            sellList.forEach(rid => {
                const res    = RESOURCE_CATALOG[rid];
                if (!res) return;
                const owned  = player.inventory[rid] || 0;
                const entry  = city.market[rid];
                const sellPr = entry ? Math.round(entry.price * 0.80) : Math.round(res.basePrice * 0.6);
                const profit = sellPr > res.basePrice ? " 📈" : sellPr < res.basePrice * 0.7 ? " 📉" : "";
                html += `
<div style="
    display:flex;align-items:center;gap:8px;
    padding:8px;margin-bottom:5px;
    background:rgba(255,255,255,0.04);border-radius:6px;
    border-left:3px solid #2e7d32;
">
  <span style="font-size:clamp(18px,5vw,24px)">${res.emoji}</span>
  <div style="flex:1;min-width:0;">
    <div style="font-size:clamp(11px,3vw,14px);font-weight:bold;color:#8bc34a;white-space:nowrap;">
      ${res.label}
    </div>
    <div style="font-size:clamp(9px,2.2vw,11px);color:#aaa;">
      Carrying: <span style="color:#fff">${owned}</span>
      &nbsp;|&nbsp; Base: ${res.basePrice}g${profit}
    </div>
  </div>
  <div style="text-align:right;flex-shrink:0;">
    <div style="color:#8bc34a;font-weight:bold;font-size:clamp(12px,3vw,15px);">${sellPr}Gold/unit</div>
    <div style="display:flex;gap:3px;margin-top:4px;">
      <button onclick="_tradeSell('${rid}',1)" style="${_sellBtnStyle()}">-1</button>
      <button onclick="_tradeSell('${rid}',${res.packSize})" style="${_sellBtnStyle()}" ${owned<res.packSize?'disabled':''}>-${res.packSize}</button>
      <button onclick="_tradeSellAll('${rid}')" style="${_sellBtnStyle('#6b1a1a')}">ALL</button>
    </div>
  </div>
</div>`;
            });
        }
    }

    html += `
  </div><!-- end trade-body -->

  <!-- FOOTER: quick tip -->
  <div style="
      padding:7px 12px;border-top:1px solid #333;font-size:clamp(9px,2.2vw,11px);
      color:#666;text-align:center;flex-shrink:0;">
    💡 Buy low, travel to another city, sell high. Prices shift with supply & demand.
    &nbsp;|&nbsp; ⭐ = native resource (abundant &amp; cheap here)
  </div>
</div><!-- end trade-modal -->`;

    panel.innerHTML = html;
}

function _buyBtnStyle(bg) {
    return `background:${bg||'#1a3a6b'};color:#fff;border:1px solid #4a7abf;
            padding:5px 7px;border-radius:4px;cursor:pointer;
            font-size:clamp(10px,2.5vw,12px);min-width:32px;`;
}
function _sellBtnStyle(bg) {
    return `background:${bg||'#3a1a00'};color:#fff;border:1px solid #bf7a4a;
            padding:5px 7px;border-radius:4px;cursor:pointer;
            font-size:clamp(10px,2.5vw,12px);min-width:32px;`;
}

// ── Inline trade action callbacks (called by button onclick) ──────────────
function _tradeBuy(rid, qty) {
    if (!_tradePanelCity) return;
    const result = playerBuyResource(_tradePanelCity, rid, qty);
    _showTradeToast(result.msg, result.ok);
    _renderTradePanel();
}
function _tradeBuyMax(rid) {
    if (!_tradePanelCity) return;
    const entry     = _tradePanelCity.market[rid];
    const cargoFree = (player.cargoCapacity || 50) - getCargoUsed();
    const afford    = Math.floor(player.gold / Math.max(1, entry.price));
    const maxQty    = Math.min(entry.stock, cargoFree, afford);
    _tradeBuy(rid, Math.max(1, maxQty));
}
function _tradeSell(rid, qty) {
    if (!_tradePanelCity) return;
    const result = playerSellResource(_tradePanelCity, rid, qty);
    _showTradeToast(result.msg, result.ok);
    _renderTradePanel();
}
function _tradeSellAll(rid) {
    if (!_tradePanelCity || !player.inventory) return;
    _tradeSell(rid, player.inventory[rid] || 0);
}

function _showTradeToast(msg, ok) {
    let toast = document.getElementById("trade-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "trade-toast";
        toast.style.cssText = `
            position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
            background:rgba(0,0,0,0.85);color:#fff;padding:8px 16px;
            border-radius:20px;font-family:Georgia,serif;font-size:13px;
            z-index:10100;pointer-events:none;transition:opacity 0.3s;`;
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.borderLeft = ok ? "3px solid #8bc34a" : "3px solid #f44";
    toast.style.opacity = "1";
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.style.opacity = "0"; }, 2200);
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. STYLE INJECTION (trade panel CSS)
// ─────────────────────────────────────────────────────────────────────────────
(function injectTradeCSS() {
    if (document.getElementById("trade-mat-styles")) return;
    const s = document.createElement("style");
    s.id = "trade-mat-styles";
    s.textContent = `
        #trade-panel { box-sizing:border-box; }
        #trade-modal button:disabled { opacity:0.35; cursor:not-allowed; }
        #trade-body::-webkit-scrollbar { width:6px; }
        #trade-body::-webkit-scrollbar-track { background:#111; }
        #trade-body::-webkit-scrollbar-thumb { background:#5a3a1a; border-radius:3px; }
    `;
    document.head.appendChild(s);
})();

// ─────────────────────────────────────────────────────────────────────────────
// 14. EXPOSE GLOBALS (so onclick="" in HTML and hooks in other files can reach these)
// ─────────────────────────────────────────────────────────────────────────────
window.RESOURCE_CATALOG   = RESOURCE_CATALOG;
window.TILE_RESOURCES     = TILE_RESOURCES;
window.FACTION_DEMAND     = FACTION_DEMAND;
window.initCityMarket     = initCityMarket;
window.tickAllMarkets     = tickAllMarkets;
window.npcArriveAndTrade  = npcArriveAndTrade;
window.openTradePanel     = openTradePanel;
window.closeTradePanel    = closeTradePanel;
window.refreshTradeButton = refreshTradeButton;
window.playerBuyResource  = playerBuyResource;
window.playerSellResource = playerSellResource;
window._setTradeTab       = _setTradeTab;
window._tradeBuy          = _tradeBuy;
window._tradeBuyMax       = _tradeBuyMax;
window._tradeSell         = _tradeSell;
window._tradeSellAll      = _tradeSellAll;

console.log("[TradeSystem] trade_materials_nonfood.js loaded — " +
    Object.keys(RESOURCE_CATALOG).length + " resources across " +
    Object.keys(TILE_RESOURCES).length + " tile types.");



// ─────────────────────────────────────────────────────────────────────────────
// 15. AUTO-SEED NPC CARGO (Massive Resources Generator)
// ─────────────────────────────────────────────────────────────────────────────
setInterval(() => {
    if (typeof globalNPCs === 'undefined') return;
    
    const allRes = Object.keys(RESOURCE_CATALOG);
    
    globalNPCs.forEach(npc => {
        if (!npc.cargo) npc.cargo = {};
        
        let totalItems = Object.values(npc.cargo).reduce((a, b) => a + b, 0);
        // Generates massive loot: 3 items per troop member in the NPC army
        let targetItems = (npc.count || 10) * 3; 
        
        if (totalItems < targetItems) {
            // Pick 3 random resources to stock up their caravan/army
            for(let i = 0; i < 3; i++) {
                let randomRes = allRes[Math.floor(Math.random() * allRes.length)];
                let amountToAdd = Math.floor((targetItems - totalItems) / 3) + 1;
                npc.cargo[randomRes] = (npc.cargo[randomRes] || 0) + amountToAdd;
            }
        }
    });
}, 5000); // Scans and replenishes the world every 5 seconds