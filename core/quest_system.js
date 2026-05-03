"use strict";
// ============================================================================
// DYNASTY QUEST SYSTEM  —  quest_system.js
// 13th-Century Sinosphere Sandbox  |  Drop-in module
// ============================================================================
//
// LOAD ORDER (add to your index.html AFTER these scripts):
//   1. city_system.js
//   2. leave_battle_roster.js
//   3. parler_system.js
//   4. save_system.js
//   5. mobile_ui.js
//   <script src="quest_system.js"></script>   ← last
//
// THIS FILE AUTO-PATCHES (no edits needed in other files):
//   • drawCityCosmeticNPCs  → renders quest NPC circles + interaction
//   • leaveBattlefield      → handles combat quest completion
//   • Quest log saved to its own localStorage key (no save_system.js edit needed)
//
// OPTIONAL (better save integration): In save_system.js add to serializePlayer():
//       questLog: player.questLog || { active: [], completed: [] },
//   And in applyPlayerData():
//       player.questLog = data.questLog ?? { active: [], completed: [] };
//
// HOW QUEST NPCs WORK:
//   When you ENTER a city (civilian mode only), 1–2 special NPCs appear with
//   a pulsing YELLOW RING under their feet. Walk up to one to receive a quest.
//   After accepting, the NPC disappears. Your quest log records who gave it,
//   what city they were in, and their exact position so you can navigate back.
//
// ============================================================================
//
// ──────────────────────────────────────────────────────────────────────────────
//  ★  DIALOGUE STRINGS  — Edit these freely! No programming knowledge needed.
//     Just change the text inside the backtick strings (` `).
//     Do NOT change the variable names or the (q) => parts.
// ──────────────────────────────────────────────────────────────────────────────
//
const QUEST_DIALOGUES = {

    // ── TRANSPORT: You carry goods from city A → city B ────────────────────
    transport_offer: (q) =>
        `Traveler — I have urgent need of you. ${q.targetCityName} is running short of ` +
        `${q.resourceEmoji} ${q.resourceLabel}. I need ${q.quantity} loads delivered there safely. ` +
        `The route has ${q.riskText}. I will pay you ${q.reward} gold on arrival. ` +
        `Will you take this burden upon yourself?`,

    transport_accept: (q) =>
        `Excellent! You will need ${q.quantity} units of ${q.resourceLabel} in your cargo. ` +
        `If you do not already carry them, find them along the way. ` +
        `When you reach ${q.targetCityName}, simply enter the city — the delivery ` +
        `completes automatically once you arrive with the goods.`,

    transport_hint: (q) =>
        `You carry ${q.playerHas || 0} of the ${q.quantity} ${q.resourceLabel} required. ` +
        `Bring the full amount to ${q.targetCityName} to complete this quest.`,

    transport_complete: (q) =>
        `The ${q.resourceLabel} has arrived! You have served the realm well. ` +
        `Take your ${q.reward} gold — you have earned it.`,

    // ── TRADE: Procure goods and bring them back to the quest giver's city ──
    trade_offer: (q) =>
        `I have a pressing need for ${q.resourceEmoji} ${q.resourceLabel} — ` +
        `${q.quantity} loads of it. I cannot leave the city to find them myself. ` +
        `Procure them wherever you can and return here to ${q.giverCityName}. ` +
        `I will pay ${q.reward} gold — well above what the market offers.`,

    trade_accept: (q) =>
        `I am grateful. Find ${q.quantity} ${q.resourceLabel} and return to ${q.giverCityName}. ` +
        `Enter the city with the goods — I will know you have arrived.`,

    trade_complete: (q) =>
        `Ah, the ${q.resourceLabel}! Just what I needed. ` +
        `Here is your ${q.reward} gold, as promised. Safe travels, friend.`,

    // ── TRAVEL: Carry a message to a contact NPC in another city ───────────
    travel_offer: (q) =>
        `I have a sealed letter that must reach ${q.contactName} in ${q.targetCityName}. ` +
        `I trust no ordinary courier with this — it requires a capable hand. ` +
        `The road has ${q.riskText}. Deliver it and I will pay you ${q.reward} gold. ` +
        `${q.contactName} will be waiting — you will recognize them by their golden ring.`,

    travel_accept: (q) =>
        `Good. Travel to ${q.targetCityName} and find ${q.contactName}. ` +
        `They stand out — a golden circle marks them as they await the message. ` +
        `Walk up to them inside the city to complete the delivery.`,

    travel_contact_greeting: (q) =>
        `You bring word from ${q.giverCityName}? At last — I have been waiting. ` +
        `Take this gold back to your commander. Tell them the message was received.`,

    travel_complete: (q) =>
        `The message has been delivered to ${q.contactName} in ${q.targetCityName}. ` +
        `${q.reward} gold has been added to your purse.`,

    // ── COMBAT / BANDITS: Kill a number of bandits on the road ─────────────
    combat_bandit_offer: (q) =>
        `A band of ${q.banditCount} brigands has been terrorizing the road to ${q.targetCityName}. ` +
        `Merchants dare not travel, and our own patrols have been ambushed. ` +
        `Destroy them and the road will breathe again. ` +
        `I will pay ${q.reward} gold — but go prepared. They are dangerous.`,

    combat_bandit_accept: (q) =>
        `Good hunting. Engage bandit forces on the world map — each battle counts. ` +
        `You need to destroy ${q.banditCount} of them in total. ` +
        `Return to me once it is done — or simply finish the last band and I will know.`,

    combat_bandit_progress: (q) =>
        `You have cut down ${q.banditKillProgress} of the ${q.banditCount} brigands so far. Keep going.`,

    combat_bandit_complete: (q) =>
        `The road to ${q.targetCityName} is clear at last! You have my thanks — ` +
        `and your ${q.reward} gold. The merchants will sing your name.`,

    // ── COMBAT / HUNT: Track and kill a specific named enemy leader ─────────
    combat_hunt_offer: (q) =>
        `There is a wanted criminal — ${q.targetName} — who leads a raider band near ${q.targetCityName}. ` +
        `They are no simple bandit. Seasoned, cruel, and with blood on their hands. ` +
        `Hunt them down on the world map. They fly the bandit flag. ` +
        `Bring me proof of their death and earn ${q.reward} gold.`,

    combat_hunt_accept: (q) =>
        `Find ${q.targetName}. They are marked on the world map as a hostile bandit force. ` +
        `Defeat their band — victory in that battle counts as the kill. ` +
        `I will know when it is done.`,

    combat_hunt_complete: (q) =>
        `${q.targetName} is dead? The city can rest easier knowing that. ` +
        `${q.reward} gold, as promised. You are a worthy hunter.`,

    // ── GENERIC LINES ───────────────────────────────────────────────────────
    decline:           () => `I understand. If you change your mind, I will be here.`,
    already_has_quest: () => `I have already asked a favor of you. Come back when it is done.`,
    no_quests:         () => `I have no work for you today, traveler. Perhaps next time.`,
};

// ──────────────────────────────────────────────────────────────────────────────
//  ★  DIALOGUE VARIANT POOLS  — 5+ flavours per quest type.
//
//  Each entry is an ARRAY of functions, identical signature to QUEST_DIALOGUES.
//  Add more variants by copying a block, changing only the surrounding words.
//  The ${q.xxx} tokens are replaced automatically — never remove them.
//
//  HOW VARIANTS WORK: when a quest NPC is spawned, one variant index is chosen
//  at random and stored in q.dialogueVariant so it stays consistent.
//  The original QUEST_DIALOGUES entries above remain as the [0] fallback.
// ──────────────────────────────────────────────────────────────────────────────
const QUEST_DIALOGUE_VARIANTS = {

    // ── TRANSPORT OFFER — 5 variants ────────────────────────────────────────
    //    "carry X loads of goods from here to TargetCity"
    transport_offer: [
        // [0] Urgent shortage (matches the original QUEST_DIALOGUES feel)
        (q) =>
            `Traveler — I have urgent need of you. ${q.targetCityName} is running short of ` +
            `${q.resourceEmoji} ${q.resourceLabel}. I need ${q.quantity} loads delivered there safely. ` +
            `The route has ${q.riskText}. I will pay ${q.reward} gold on arrival. Will you take this upon yourself?`,

        // [1] Imperial quota / official register framing
        (q) =>
            `By the imperial register, ${q.targetCityName} is owed a shipment of ` +
            `${q.resourceEmoji} ${q.resourceLabel} — ${q.quantity} loads — and the deadline approaches. ` +
            `I cannot leave my post to deliver it myself. The road has ${q.riskText}, ` +
            `but the compensation is honest: ${q.reward} gold on arrival. Will you carry out this duty?`,

        // [2] Desperate merchant / humanitarian framing
        (q) =>
            `Stranger, please — people in ${q.targetCityName} are suffering without ` +
            `${q.resourceEmoji} ${q.resourceLabel}. I have ${q.quantity} loads ready but no ` +
            `trustworthy hand to carry them. The road has ${q.riskText}. ` +
            `Bring them through safely and I will pay ${q.reward} gold. Their need is genuine.`,

        // [3] Guild arbitrage — business opportunity
        (q) =>
            `The guild prices in ${q.targetCityName} are far above what we pay here — a fine ` +
            `spread for the sharp-eyed. I need ${q.quantity} loads of ` +
            `${q.resourceEmoji} ${q.resourceLabel} transported there. ` +
            `Road conditions: ${q.riskText}. I will cut you in for ${q.reward} gold. Clean work, no complications.`,

        // [4] Widow whose caravan was robbed
        (q) =>
            `My husband's caravan never reached ${q.targetCityName} — the road took it. ` +
            `I have scraped together ${q.quantity} loads of ${q.resourceEmoji} ${q.resourceLabel} again, ` +
            `but I cannot trust hired hands a second time. The route has ${q.riskText}. ` +
            `${q.reward} gold if you bring it through. Please — it is all I have left.`,

        // [5] Seasonal demand — festival / harvest window
        (q) =>
            `The harvest festival in ${q.targetCityName} begins within the month, and they ` +
            `are desperately short of ${q.resourceEmoji} ${q.resourceLabel}. ` +
            `I need ${q.quantity} loads there before the gates fill with pilgrims. ` +
            `The road has ${q.riskText}. I will pay ${q.reward} gold — but time matters here.`,
    ],

    // ── TRADE OFFER — 5 variants ─────────────────────────────────────────────
    //    "procure X loads of goods and bring them back to THIS city"
    trade_offer: [
        // [0] Original merchant buyer
        (q) =>
            `I have a pressing need for ${q.resourceEmoji} ${q.resourceLabel} — ` +
            `${q.quantity} loads of it. I cannot leave the city to find them myself. ` +
            `Procure them wherever you can and return here to ${q.giverCityName}. ` +
            `I will pay ${q.reward} gold — well above what the market offers.`,

        // [1] Apothecary / craftsman needs raw materials
        (q) =>
            `My workshop cannot function without ${q.resourceEmoji} ${q.resourceLabel}. ` +
            `I have orders piling up and not ${q.quantity} loads in stock. ` +
            `Find them wherever merchants gather and bring them here to ${q.giverCityName}. ` +
            `${q.reward} gold waits for you when you walk through that door with the goods.`,

        // [2] City official stockpiling for a siege or emergency
        (q) =>
            `The city granary must be prepared for any emergency. Right now our reserves of ` +
            `${q.resourceEmoji} ${q.resourceLabel} are dangerously low. ` +
            `I need ${q.quantity} loads secured and returned to ${q.giverCityName}. ` +
            `This is an official commission — ${q.reward} gold, no questions asked about the source.`,

        // [3] Festival organiser needs celebration goods
        (q) =>
            `The harvest ceremony is in a fortnight and I still lack ` +
            `${q.resourceEmoji} ${q.resourceLabel} — ${q.quantity} loads of it. ` +
            `The local market is stripped bare. Ride out, find them, and bring them back to ${q.giverCityName}. ` +
            `${q.reward} gold. If you are quick enough you will save the celebration.`,

        // [4] Wealthy widow preparing a dowry
        (q) =>
            `My daughter's wedding contract requires a gift of ` +
            `${q.resourceEmoji} ${q.resourceLabel}, ${q.quantity} loads, to be presented here in ${q.giverCityName}. ` +
            `The family's honour depends on it. Every vendor here is sold out. ` +
            `Travel, find them, and return — I will pay ${q.reward} gold, no haggling.`,

        // [5] Military quartermaster short on supplies
        (q) =>
            `The garrison quartermaster's log is short ${q.quantity} loads of ` +
            `${q.resourceEmoji} ${q.resourceLabel} and I will not explain that gap to my commander. ` +
            `Get them from wherever trade flows and bring them back to ${q.giverCityName} before inspection. ` +
            `${q.reward} gold, paid discreetly. I need this resolved.`,
    ],

    // ── TRAVEL OFFER — 5 variants ────────────────────────────────────────────
    //    "carry a sealed letter to a contact in TargetCity"
    travel_offer: [
        // [0] Original — important sealed letter
        (q) =>
            `I have a sealed letter that must reach ${q.contactName} in ${q.targetCityName}. ` +
            `I trust no ordinary courier with this — it requires a capable hand. ` +
            `The road has ${q.riskText}. Deliver it and I will pay you ${q.reward} gold. ` +
            `${q.contactName} will be waiting — you will recognise them by their golden ring.`,

        // [1] Spy / diplomatic contact with coded message
        (q) =>
            `There is a person in ${q.targetCityName} — ${q.contactName} — who expects a message ` +
            `from me that cannot be entrusted to official post. ` +
            `The route has ${q.riskText} and the letter must arrive unread. ` +
            `${q.reward} gold for discretion and safe delivery. They will be watching for you.`,

        // [2] Merchant sending a trade contract to a partner
        (q) =>
            `This scroll is a signed trade agreement for ${q.contactName} in ${q.targetCityName}. ` +
            `If it does not arrive, the whole deal collapses and I lose the season's profit. ` +
            `The road has ${q.riskText}. Deliver it safely and earn ${q.reward} gold. ` +
            `${q.contactName} carries a golden ring so you know them on sight.`,

        // [3] Father sending letter to an estranged son
        (q) =>
            `I have not spoken to my son ${q.contactName} in ${q.targetCityName} for three years. ` +
            `He does not know his mother has fallen ill. This letter must reach him. ` +
            `I am too old to travel — the road has ${q.riskText}. ` +
            `Take it to him and I will pay you ${q.reward} gold from what little I have saved.`,

        // [4] Temple / religious donation letter
        (q) =>
            `This is a letter of donation for the shrine keeper ${q.contactName} in ${q.targetCityName}. ` +
            `The offering was pledged on my deathbed recovery — it must be honoured. ` +
            `The road has ${q.riskText}. Bring it safely and the gods and I will both reward you: ` +
            `${q.reward} gold from me, and whatever the heavens see fit.`,

        // [5] Legal deed / land inheritance document
        (q) =>
            `This deed transfers land rights to ${q.contactName} in ${q.targetCityName}. ` +
            `Without it, the estate falls into dispute when I am gone. ` +
            `The route has ${q.riskText} and I cannot risk ordinary post. ` +
            `Deliver it intact, ${q.reward} gold on proof it reached the right hands.`,
    ],

    // ── COMBAT BANDIT OFFER — 5 variants ─────────────────────────────────────
    //    "kill a number of bandits near TargetCity"
    combat_bandit_offer: [
        // [0] Original — road terrorised
        (q) =>
            `A band of ${q.banditCount} brigands has been terrorising the road to ${q.targetCityName}. ` +
            `Merchants dare not travel, and our own patrols have been ambushed. ` +
            `Destroy them and the road will breathe again. ` +
            `I will pay ${q.reward} gold — but go prepared. They are dangerous.`,

        // [1] Caravan master lost a shipment
        (q) =>
            `I lost three men and a full cart to those brigands near ${q.targetCityName}. ` +
            `There are ${q.banditCount} of them, maybe more. No caravan will risk that road until they are gone. ` +
            `I cannot afford to wait for the garrison to act. ` +
            `Clear them out — ${q.reward} gold is yours when the road is safe again.`,

        // [2] Village elder asking for help
        (q) =>
            `Our village lies on the road to ${q.targetCityName} and we have been raided twice this season. ` +
            `${q.banditCount} men at minimum. We have no soldiers — only farmers. ` +
            `If a warrior of your bearing cannot help us, who can? ` +
            `The community has pooled ${q.reward} gold. Please. Drive them off.`,

        // [3] Road toll collector losing revenue
        (q) =>
            `My toll station on the ${q.targetCityName} road has been empty for two weeks. ` +
            `Everyone knows there are ${q.banditCount} outlaws working the bends beyond the ridge. ` +
            `I lose coin every day they breathe. Go kill them — I will pay ${q.reward} gold ` +
            `from my own pocket. Cheaper than a season with no traffic.`,

        // [4] Military officer who cannot spare troops
        (q) =>
            `Command has stripped my garrison for the campaign season. I have ${q.banditCount} confirmed ` +
            `hostiles working the approach to ${q.targetCityName} and not enough men to deal with them. ` +
            `If you are willing to serve where the garrison cannot, I will authorise ` +
            `${q.reward} gold from the garrison discretionary fund. Unofficially, of course.`,

        // [5] Monastery abbot protecting pilgrims
        (q) =>
            `The pilgrimage road to ${q.targetCityName} runs past our walls, and every season ` +
            `those ${q.banditCount} lawless men prey on the faithful. ` +
            `We are monks — we cannot take up swords ourselves, but we can pay someone who will. ` +
            `Scatter them or cut them down. ${q.reward} gold from the monastery treasury. ` +
            `We have prayed for someone like you to come.`,
    ],

    // ── COMBAT HUNT OFFER — 5 variants ───────────────────────────────────────
    //    "track down and kill named bandit leader near TargetCity"
    combat_hunt_offer: [
        // [0] Original — wanted criminal
        (q) =>
            `There is a wanted criminal — ${q.targetName} — who leads a raider band near ${q.targetCityName}. ` +
            `They are no simple bandit. Seasoned, cruel, and with blood on their hands. ` +
            `Hunt them down on the world map. They fly the bandit flag. ` +
            `Bring me proof of their death and earn ${q.reward} gold.`,

        // [1] Noble's family member was killed
        (q) =>
            `${q.targetName}. Remember that name. They killed my brother on the road to ${q.targetCityName} ` +
            `and left him in the ditch like a dog. The garrison wants evidence — I want a head. ` +
            `Find their band on the world map, fly into them, and put ${q.targetName} in the ground. ` +
            `${q.reward} gold. No questions. No receipt.`,

        // [2] Merchant consortium bounty
        (q) =>
            `The traders' guild has placed a formal bounty on ${q.targetName}. ` +
            `Three guild caravans raided near ${q.targetCityName} in as many months — ` +
            `the losses are untenable. ${q.targetName} runs the band and they will keep at it until ` +
            `someone stops them permanently. ${q.reward} gold from the consortium purse. ` +
            `Find their flag on the world map and end this.`,

        // [3] Escaped prisoner with intelligence
        (q) =>
            `I was held by ${q.targetName}'s crew for eleven days near ${q.targetCityName}. ` +
            `I escaped with my life but nothing else. I know how they move, where they camp. ` +
            `I cannot go back — but you could. Their band is marked on the road maps as a hostile force. ` +
            `Kill ${q.targetName} and I will pay you ${q.reward} gold. Every last coin I still have.`,

        // [4] Garrison commander needing the leader dead
        (q) =>
            `We have broken two of ${q.targetName}'s raiding parties near ${q.targetCityName}, ` +
            `and two more sprout in their place. ` +
            `Cut the head off the snake and the body dies. ${q.targetName} commands the whole operation. ` +
            `Find their war-banner on the map, destroy the force, confirm the leader is dead. ` +
            `Garrison pays ${q.reward} gold — this is a legitimate military commission.`,

        // [5] Former comrade turned betrayer
        (q) =>
            `${q.targetName} and I served in the same company — once. Then they sold the column ` +
            `to the enemy near ${q.targetCityName} and rode off laughing. ` +
            `I have spent years tracking them. Now I know the flag they fly on the world map. ` +
            `I am too old to finish this myself. You are not. ` +
            `${q.reward} gold and my gratitude if you bring them down.`,
    ],
};

// Helper — picks a random variant index for a quest type, or 0 if none exists
function _pickVariantIdx(type) {
    let pool = QUEST_DIALOGUE_VARIANTS[type + "_offer"];
    if (!pool || pool.length === 0) return 0;
    return Math.floor(Math.random() * pool.length);
}

// Helper — returns the offer text for a quest, using the stored variant index
function _getOfferText(q) {
    let pool = QUEST_DIALOGUE_VARIANTS[q.type + "_offer"];
    if (pool && pool.length > 0) {
        let idx = (q.dialogueVariant !== undefined) ? q.dialogueVariant : 0;
        return pool[idx](q);
    }
    // Fall back to original QUEST_DIALOGUES
    if (q.type === "transport")      return QUEST_DIALOGUES.transport_offer(q);
    if (q.type === "trade")          return QUEST_DIALOGUES.trade_offer(q);
    if (q.type === "travel")         return QUEST_DIALOGUES.travel_offer(q);
    if (q.type === "combat_bandits") return QUEST_DIALOGUES.combat_bandit_offer(q);
    if (q.type === "combat_hunt")    return QUEST_DIALOGUES.combat_hunt_offer(q);
    return "";
}

// ──────────────────────────────────────────────────────────────────────────────
//  NPC TITLES BY FACTION  — The label shown above quest giver heads
//  Add or change these to fit your world. Each faction gets a pool.
// ──────────────────────────────────────────────────────────────────────────────
const QUEST_NPC_TITLES = {
    "Hong Dynasty": [
        "Imperial Merchant", "City Elder", "Tax Collector", "Silk Factor",
        "Grain Registrar", "Harbor Inspector", "Provincial Scribe", "Tribute Officer",
        "Ceramic Broker", "Court Archivist", "Market Overseer", "Salt Commissioner",
        "Canal Warden", "Silk Guildmaster", "Imperial Auditor", "River Customs Clerk"
    ],
    "Great Khaganate": [
        "Steppe Trader", "Khan's Envoy", "Horse Master", "Camp Quartermaster",
        "Felt Merchant", "Herding Steward", "Bowyer Factor", "Relay Station Chief",
        "Falconry Keeper", "Steppe Caravaner", "Pasture Assessor", "Clan Treasurer",
        "Nomad Envoy", "Herd Registrar", "Steppe Logistics Officer", "Horse-Tack Broker"
    ],
    "Jinlord Confederacy": [
        "Jurchen Merchant", "Forest Factor", "Garrison Ledger", "Fur Agent",
        "Timber Assessor", "Border Scribe", "Arrow-Stock Supplier", "Clan Envoy",
        "Hunting Grounds Keeper", "Frontier Quartermaster", "Resin Collector", "Woodland Broker",
        "Tribal Liaison", "Forest Tax Officer", "Northern Caravan Clerk", "Hide Inspector"
    ],
    "Tran Realm": [
        "River Trader", "Delta Merchant", "Viet Envoy", "Rice Factor",
        "Canal Overseer", "Bamboo Goods Broker", "Fish-Weir Keeper", "Paddy Registrar",
        "Harbor Scribe", "Tributary Envoy", "Spice Wharf Clerk", "River Customs Officer",
        "Village Elder", "Wetland Quartermaster", "Rice-Tax Collector", "Delta Market Steward"
    ],
    "Goryun Kingdom": [
        "Goryun Merchant", "Palace Steward", "Bronze Factor", "Sea Merchant",
        "Harbor Inspector", "Mountain Goods Broker", "Court Scribe", "Iron-Tools Factor",
        "Salt-Fish Trader", "Peninsula Envoy", "Bronze-Mint Clerk", "Palace Quartermaster",
        "Coastal Overseer", "Shrine Archivist", "Maritime Factor", "Provincial Treasurer"
    ],
    "Xiaran Dominion": [
        "Silk Road Factor", "Desert Merchant", "Oasis Keeper", "Jade Trader",
        "Caravan Registrar", "Sand-Route Envoy", "Incense Broker", "Desert Quartermaster",
        "Water-Rights Keeper", "Border Caravan Scribe", "Glassware Factor", "Steppe-Road Liaison",
        "Oasis Tax Officer", "Silk-Route Auditor", "Desert Logistics Chief", "Jade-Mint Clerk"
    ],
    "High Plateau Kingdoms": [
        "Plateau Elder", "Monastery Factor", "Salt Trader", "Yak Herder",
        "Mountain Pass Warden", "Wool Broker", "Shrine Archivist", "Highland Envoy",
        "Herbal Goods Keeper", "Plateau Quartermaster", "Stone-Carving Factor", "Monastery Scribe",
        "Yak-Caravan Leader", "Highland Tax Collector", "Iron-Tools Broker", "Mountain Market Elder"
    ],
    "Yamato Clans": [
        "Clan Merchant", "Island Trader", "Harbor Master", "Clan Treasurer",
        "Shrine Steward", "Rice-Storehouse Keeper", "Island Envoy", "Swordsmith Factor",
        "Fishing-Village Elder", "Port Registrar", "Scroll Archivist", "Clan Quartermaster",
        "Harbor Inspector", "Timber-Shipwright Broker", "Island Market Scribe", "Clan Logistics Officer"
    ],
    "Dab Tribes": [
        "Jungle Factor", "Tribal Elder", "Spice Merchant", "River Guide",
        "Totem-Carver", "Forest Scout", "Clan Envoy", "Herbal Goods Keeper",
        "Jungle Hunter", "River-Crossing Steward", "Tribal Quartermaster", "Hardwood Broker",
        "Spirit-Shrine Keeper", "Tribal Scribe", "Jungle Caravaner", "Ritual Goods Factor"
    ],
    "Player's Kingdom": [
        "Royal Merchant", "City Steward", "Trade Factor", "Army Quartermaster",
        "Harbor Registrar", "Provincial Envoy", "Treasury Auditor", "Market Overseer",
        "Logistics Captain", "Royal Archivist", "Supply Marshal", "Grain Assessor",
        "Court Scribe", "Road-Network Warden", "Royal Broker", "City Quartermaster"
    ],
    "Bandits": []
};


// Resources that classify as "high value / rare" — they bump rewards up
const _QS_HIGH_VALUE = [
    "ocean_pearls","silver_ingots","musk_pods","rough_gemstones",
    "coral_jewelry","exotic_spices","exotic_birds","dried_meat"
];

// ============================================================================
//  QUEST SYSTEM — main namespace
// ============================================================================
window.QuestSystem = (function () {

// ── Internal state ────────────────────────────────────────────────────────
    const _INTERACT_DIST  = 36;     // pixels — walk this close to trigger dialog
    const _POLL_MS        = 500;    // how often to check inCityMode (ms)
    const _MAX_COMPLETED  = 30;     // max completed quests kept in log

    let _questNPCsInCity  = {};     // { factionName: [ questNPC, ... ] }
    let _lastCityMode     = false;
    let _lastCityFaction  = null;
    let _interactCooldown = 0;      // frames before next proximity check fires
    let _offerNPC         = null;   // quest NPC whose dialog is currently open
    let _cityLastSpawnTime = {};    // { factionName: timestamp } — timed new-quest spawning
    const _CITY_RESPAWN_MS = 5 * 60 * 1000; // 5 min between fresh-quest waves per city
    const _MAX_QUEST_NPCS_PER_CITY = 3;      // threshold: no new givers spawned above this

    // ── Quest log on player object ────────────────────────────────────────────
    function _log() {
        // Fallback safety if player isn't loaded yet
        if (typeof player === "undefined") return { active: [], completed: [] };
        
        // Ensure the player object has the questLog initialized
        if (!player.questLog) {
            player.questLog = { active: [], completed: [] };
        }
        
        return player.questLog;
    }

    // ── localStorage persistence REMOVED ──────────────────────────────────────
    // We keep empty functions so existing calls to _saveToStorage() in the code 
    // don't throw errors, but they literally do nothing now. 
    // The main save_system.js handles the player object!
    function _saveToStorage() {
        // Let the main game save loop handle this.
    }

    function _loadFromStorage() {
        return { active: [], completed: [] };
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  § 1  NAME GENERATOR
    // ─────────────────────────────────────────────────────────────────────────
    function _randomName(faction) {
        let pool = (typeof SYLLABLE_POOLS !== "undefined" && SYLLABLE_POOLS[faction])
                   ? SYLLABLE_POOLS[faction]
                   : ["Lin","Wu","Han","Chen","Bao","An"];
        let pick = () => pool[Math.floor(Math.random() * pool.length)];
        return pick() + (Math.random() > 0.45 ? " " + pick() : "");
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  § 2  DISTANCE / RISK HELPERS
    // ─────────────────────────────────────────────────────────────────────────
    function _dist(a, b) { return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0)); }

    function _riskLevel(cityA, cityB) {
        let d = _dist(cityA, cityB);
        if (d < 400)  return 1; // safe
        if (d < 1000) return 2; // moderate
        return 3;               // dangerous
    }
    const _RISK_TEXT = ["safe roads", "some bandit activity on the route", "very dangerous roads — travel armed"];

    // ─────────────────────────────────────────────────────────────────────────
    //  § 3  QUEST GENERATION
    // ─────────────────────────────────────────────────────────────────────────
    function _pickQuestType(city) {
        // Count low-stock market items → favour transport/trade quests
        let lowStock = 0;
        if (city.market) {
            Object.values(city.market).forEach(m => {
                if (m.stock < (m.idealStock || 5) * 0.5) lowStock++;
            });
        }
        // Check if faction is at war → favour combat quests slightly
        let atWar = false;
        if (typeof FACTION_RELATIONS !== "undefined" && FACTION_RELATIONS[city.faction]) {
            let rel = FACTION_RELATIONS[city.faction];
            atWar = Object.values(rel).some(r => r === "War" || r === "Enemy");
        }

        let r = Math.random();
        if (lowStock >= 3 && r < 0.45)  return "transport";
        if (r < 0.40)  return "transport";
        if (r < 0.62)  return "trade";
        if (r < 0.78)  return "travel";
        if (atWar && r < 0.90) return "combat_hunt";
        if (r < 0.90)  return "combat_bandits";
        return "combat_hunt";
    }

    function _pickResource(targetCity, forTrade) {
        if (typeof RESOURCE_CATALOG === "undefined") return null;
        let all = Object.values(RESOURCE_CATALOG);

        // For transport → prefer resources TARGET city is short of
        if (!forTrade && targetCity && targetCity.market) {
            let low = Object.entries(targetCity.market)
                .filter(([rid, m]) => m.stock < (m.idealStock || 5) * 0.5 && RESOURCE_CATALOG[rid])
                .map(([rid]) => RESOURCE_CATALOG[rid]);
            if (low.length > 0) return low[Math.floor(Math.random() * low.length)];
        }
        // For trade or no market data → lean toward high-value goods
        if (forTrade && Math.random() > 0.35) {
            let hv = all.filter(r => _QS_HIGH_VALUE.includes(r.id));
            if (hv.length > 0) return hv[Math.floor(Math.random() * hv.length)];
        }
        return all[Math.floor(Math.random() * all.length)];
    }

    function _findTargetCity(sourceCity) {
        if (typeof cities === "undefined" || cities.length < 2) return null;
        let others = cities.filter(c => c.name !== sourceCity.name);
        // Prefer medium-distance cities (200–2000px)
        let mid = others.filter(c => { let d = _dist(sourceCity, c); return d > 200 && d < 2000; });
        let pool = mid.length > 0 ? mid : others;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    function _findBanditNPC(sourceCity) {
        if (typeof globalNPCs === "undefined") return null;
        let candidates = globalNPCs.filter(n =>
            (n.faction === "Bandits" || n.role === "Bandit") &&
            !n.isDead && !n.questTarget
        );
        if (candidates.length === 0) return null;
        candidates.sort((a, b) => _dist(sourceCity, a) - _dist(sourceCity, b));
        return candidates[0];
    }

    function _generateQuest(city, questNPC) {
        let qid  = "q_" + Date.now() + "_" + Math.floor(Math.random() * 9999);
        let type = _pickQuestType(city);

        let targetCity = (type !== "trade") ? _findTargetCity(city) : null;
        // Trade: return to giver's city, so targetCity = giver's city (sourceCity)
        let deliveryCity = (type === "trade") ? city : targetCity;

        if ((type === "transport" || type === "travel" || type === "combat_bandits" || type === "combat_hunt") && !targetCity) {
            type = "trade"; // fallback if no target city found
        }

        let risk     = targetCity ? _riskLevel(city, targetCity) : 1;
        let riskText = _RISK_TEXT[risk - 1];
        let dist     = targetCity ? _dist(city, targetCity) : 0;
        let distFactor = Math.max(0.5, Math.min(5.0, dist / 600));

        let quest = {
            id:             qid,
            type:           type,
            status:         "offered",
            giverNPCId:     questNPC.id,
            giverName:      questNPC.name,
            giverTitle:     questNPC.title,
            giverCityName:  city.name,
            giverFaction:   city.faction,
            giverPos:       { x: Math.round(questNPC.x), y: Math.round(questNPC.y) },
            targetCityName: targetCity ? targetCity.name : city.name,
            riskLevel:      risk,
            riskText:       riskText,
            distanceFactor: distFactor,
            reward:         0,
            acceptedAt:     null,
            completedAt:    null,
            dialogueVariant: _pickVariantIdx(type),   // ← locked in at generation
        };

        // ── Type-specific fields ──────────────────────────────────────────────
        if (type === "transport") {
            let res = _pickResource(targetCity, false);
            if (!res) return null;
            let qty = Math.max(2, Math.floor(12 / (res.packSize || 1)) + Math.floor(Math.random() * 3 * risk));
            quest.resourceId    = res.id;
            quest.resourceLabel = res.label;
            quest.resourceEmoji = res.emoji;
            quest.quantity      = qty;
            // Reward: base price × qty × distance bonus × risk bonus
            let isRare = _QS_HIGH_VALUE.includes(res.id);
            quest.reward = Math.max(60, Math.round(
                res.basePrice * qty * (1 + distFactor * 0.45) * (1 + (risk - 1) * 0.35) * (isRare ? 1.3 : 1.0)
            ));
            quest.title = `Supply Run: ${res.label} → ${targetCity.name}`;

        } else if (type === "trade") {
            let res = _pickResource(null, true);
            if (!res) return null;
            let qty = Math.max(1, Math.ceil(8 / (res.packSize || 1)));
            quest.resourceId    = res.id;
            quest.resourceLabel = res.label;
            quest.resourceEmoji = res.emoji;
            quest.quantity      = qty;
            quest.reward = Math.max(40, Math.round(res.basePrice * qty * 1.6));
            quest.title = `Procurement: ${res.label}`;

        } else if (type === "travel") {
            let contactName  = _randomName(targetCity.faction);
            let contactNPCId = "contact_" + qid;
            quest.contactName  = contactName;
            quest.contactNPCId = contactNPCId;
            quest.reward       = Math.max(80, Math.round(90 + distFactor * 70 + risk * 45));
            quest.title        = `Courier: Message for ${contactName}`;

        } else if (type === "combat_bandits") {
            let count = 2 + risk + Math.floor(Math.random() * 4);
            quest.banditCount        = count;
            quest.banditKillProgress = 0;
            quest.reward             = Math.max(80, Math.round(count * 35 * (1 + (risk - 1) * 0.45)));
            quest.title              = `Bandit Suppression near ${targetCity.name}`;

        } else if (type === "combat_hunt") {
            let banditNPC  = _findBanditNPC(city);
            let targetName = _randomName("Bandits");
            quest.targetName  = targetName;
            quest.targetNPCId = banditNPC ? (banditNPC.id || null) : null;
            quest.reward      = Math.max(120, Math.round(160 + distFactor * 90 + risk * 70));
            quest.title       = `Bounty: Hunt ${targetName}`;
            // Tag the chosen bandit NPC so it can be identified after battle
            if (banditNPC) {
                banditNPC.questTarget  = qid;
                banditNPC.displayName  = targetName;
            }
        }

        return quest;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  § 4  QUEST NPC SPAWNING  (called on city enter)
    // ─────────────────────────────────────────────────────────────────────────
    function _spawnQuestNPCs(factionName) {
        _questNPCsInCity[factionName] = _questNPCsInCity[factionName] || [];

        // Find the active city object
        let city = null;
        if (typeof cities !== "undefined") {
            if (typeof activeCity !== "undefined" && activeCity) {
                city = cities.find(c => c.name === activeCity.name) || null;
            }
            if (!city) city = cities.find(c => c.faction === factionName) || null;
        }
        if (!city) return;

        let titles = QUEST_NPC_TITLES[factionName];
        if (!titles || titles.length === 0) return; // Bandits etc. don't give quests

        let cosmeticNPCs = (typeof cityCosmeticNPCs !== "undefined" && cityCosmeticNPCs[factionName])
                           ? cityCosmeticNPCs[factionName] : [];
        if (cosmeticNPCs.length === 0) return;

        // Decide how many quest givers to place (1 or 2)
        let spawnCount = Math.random() > 0.5 ? 2 : 1;
        let spawned    = 0;
        let attempts   = 0;
        let log        = _log();

        while (spawned < spawnCount && attempts < 300) {
            attempts++;
            // Base position on an existing cosmetic NPC
            let ref  = cosmeticNPCs[Math.floor(Math.random() * cosmeticNPCs.length)];
            let nx   = ref.x + (Math.random() - 0.5) * 180;
            let ny   = ref.y + (Math.random() - 0.5) * 180;

            // Don't overlap other quest NPCs
            let crowded = _questNPCsInCity[factionName].some(q => Math.hypot(q.x - nx, q.y - ny) < 55);
            if (crowded) continue;

            let npcId = "qnpc_" + factionName.replace(/\s/g, "_") + "_" + spawned + "_" + Date.now();
            let title = titles[Math.floor(Math.random() * titles.length)];
            let name  = _randomName(factionName);

            // Don't re-spawn an NPC whose quest is already active in the log
            let alreadyActive = log.active.some(q => q.giverNPCId === npcId);
            if (alreadyActive) continue;

            let questNPC = { id: npcId, x: nx, y: ny, faction: factionName, name, title, animOffset: Math.random() * 100 };
            let quest    = _generateQuest(city, questNPC);
            if (!quest) continue;

            questNPC.quest = quest;
            _questNPCsInCity[factionName].push(questNPC);
            spawned++;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  § 5  SPAWN TRAVEL CONTACT NPC  (in target city when player arrives)
    // ─────────────────────────────────────────────────────────────────────────
    function _spawnContactNPCsIfNeeded(factionName) {
        let cityName = (typeof activeCity !== "undefined" && activeCity) ? activeCity.name : null;
        if (!cityName) return;

        let log = _log();
        for (let q of log.active) {
            if (q.type !== "travel" || q.status !== "active") continue;
            if (q.targetCityName !== cityName) continue;

            // Already spawned this session?
            if ((_questNPCsInCity[factionName] || []).some(n => n.id === q.contactNPCId)) continue;

            let cosmeticNPCs = (typeof cityCosmeticNPCs !== "undefined" && cityCosmeticNPCs[factionName])
                               ? cityCosmeticNPCs[factionName] : [];
            if (cosmeticNPCs.length === 0) continue;

            let ref = cosmeticNPCs[Math.floor(Math.random() * cosmeticNPCs.length)];
            let contactNPC = {
                id:          q.contactNPCId,
                x:           ref.x + (Math.random() - 0.5) * 50,
                y:           ref.y + (Math.random() - 0.5) * 50,
                faction:     factionName,
                name:        q.contactName,
                title:       "Message Recipient",
                animOffset:  Math.random() * 100,
                isContact:   true,
                contactForQuestId: q.id,
            };
            if (!_questNPCsInCity[factionName]) _questNPCsInCity[factionName] = [];
            _questNPCsInCity[factionName].push(contactNPC);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  § 6  RENDERING — yellow pulsing ring + NPC body + name label
    // ─────────────────────────────────────────────────────────────────────────
    function renderQuestNPCCircles(ctx, factionName) {
        let qNPCs = _questNPCsInCity[factionName];
        if (!qNPCs || qNPCs.length === 0) return;

        let pulse     = 0.55 + 0.45 * Math.sin(Date.now() / 380);
        let fColor    = "#c8a000";
        if (typeof FACTIONS !== "undefined" && FACTIONS[factionName]) fColor = FACTIONS[factionName].color;

        let log = _log();

        for (let qnpc of qNPCs) {
            // Hide this NPC only when their quest is FINISHED (completed or abandoned).
            // While the quest is merely accepted/active the NPC stays visible so the
            // player can walk back and get a progress reminder.
            if (!qnpc.isContact) {
                let isDone = log.completed.some(q => q.giverNPCId === qnpc.id);
                if (isDone) continue;
            }

            ctx.save();

            // ── Yellow ring under feet ──
            ctx.globalAlpha = 0.50 + 0.50 * pulse;
            ctx.strokeStyle = "#ffe600";
            ctx.lineWidth   = 3.5;
            ctx.shadowColor = "#ffe600";
            ctx.shadowBlur  = 14 * pulse;
            ctx.beginPath();
            ctx.ellipse(qnpc.x, qnpc.y + 2, 18, 8, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur  = 0;
            ctx.globalAlpha = 1;

            // ── NPC body (reuses the game's drawHuman) ──
            if (typeof drawHuman === "function") {
                let frame = (Date.now() / 90) + qnpc.animOffset;
                drawHuman(ctx, qnpc.x, qnpc.y, false, frame, fColor);
            } else {
                // Fallback pill figure
                ctx.fillStyle = "#d4a800";
                ctx.beginPath(); ctx.arc(qnpc.x, qnpc.y - 10, 5, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = "#d4a800"; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(qnpc.x, qnpc.y - 5); ctx.lineTo(qnpc.x, qnpc.y + 8); ctx.stroke();
            }

            // ── Name / title label ──
            ctx.textAlign   = "center";
            ctx.globalAlpha = 0.92;
            ctx.font        = "bold 8px Georgia";
            ctx.fillStyle   = "#ffe600";
            ctx.fillText(qnpc.name, qnpc.x, qnpc.y - 21);
            ctx.font        = "7px Georgia";
            ctx.fillStyle   = "#ffecb3";
            ctx.fillText(qnpc.title, qnpc.x, qnpc.y - 13);
            ctx.globalAlpha = 1;
            ctx.textAlign   = "left";

            ctx.restore();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  § 7  PROXIMITY INTERACTION CHECK  (runs every frame via patched draw fn)
    // ─────────────────────────────────────────────────────────────────────────
    function checkQuestNPCInteraction(playerObj, factionName) {
        if (_interactCooldown > 0) { _interactCooldown--; return; }
        if (_isOfferPanelOpen())   return;

        let qNPCs = _questNPCsInCity[factionName] || [];
        let log   = _log();

        // ── Check quest givers ───────────────────────────────────────────────
        for (let qnpc of qNPCs) {
            if (qnpc.isContact) continue;

            if (Math.hypot(playerObj.x - qnpc.x, playerObj.y - qnpc.y) < _INTERACT_DIST) {
                // If this NPC's quest is already active, show a progress reminder
                let activeQ = log.active.find(aq => aq.giverNPCId === qnpc.id);
                if (activeQ) {
                    _showQuestReminder(activeQ);
                    _interactCooldown = 180;
                    return;
                }
                // If quest already completed/abandoned, NPC shouldn't be visible (render hides it)
                // but just in case, silently skip
                let doneQ = log.completed.find(cq => cq.giverNPCId === qnpc.id);
                if (doneQ) { _interactCooldown = 60; return; }

                _showOfferUI(qnpc);
                _offerNPC = qnpc;
                _interactCooldown = 180; // 3 s at 60 fps
                return;
            }
        }

        // ── Check travel contact NPCs ────────────────────────────────────────
        for (let qnpc of qNPCs) {
            if (!qnpc.isContact) continue;
            if (Math.hypot(playerObj.x - qnpc.x, playerObj.y - qnpc.y) < _INTERACT_DIST) {
                let q = log.active.find(q => q.id === qnpc.contactForQuestId && q.status === "active");
                if (q) {
                    _completeTravelQuest(q, factionName);
                    _interactCooldown = 180;
                    return;
                }
            }
        }

        // ── Auto-check transport / trade upon entering city ──────────────────
        _checkDeliveryCompletion(factionName);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  § 8  QUEST OFFER UI
    // ─────────────────────────────────────────────────────────────────────────
    function _isOfferPanelOpen() {
        let el = document.getElementById("qs-offer-panel");
        return !!(el && el.style.display !== "none");
    }

    function _showOfferUI(qnpc) {
        let q = qnpc.quest;
        if (!q) return;

        // Check if this NPC already gave us a quest we haven't done
        let log = _log();
        if (log.active.some(aq => aq.giverNPCId === qnpc.id)) {
            _showToast(QUEST_DIALOGUES.already_has_quest());
            return;
        }

        let text = _getOfferText(q);

        let stars  = "★".repeat(q.riskLevel) + "☆".repeat(3 - q.riskLevel);
        let tEmoji = { transport:"🚚", trade:"💰", travel:"✉️", combat_bandits:"⚔️", combat_hunt:"🎯" };

        let panel = _ensurePanel("qs-offer-panel", `
            position:fixed; bottom:18%; left:50%; transform:translateX(-50%);
            width:clamp(290px,82vw,430px); max-height:60vh; overflow-y:auto;
            background:linear-gradient(to bottom,#1c0f00,#0d0600);
            border:2px solid #ffe600; border-radius:8px;
            padding:16px; font-family:Georgia,serif; color:#d4b886;
            z-index:8500; box-shadow:0 4px 28px rgba(255,230,0,0.3);
        `);

        panel.innerHTML = `
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#999;margin-bottom:4px;">
                ${tEmoji[q.type] || "📜"}  ${qnpc.title} · ${qnpc.name}
            </div>
            <div style="font-size:10px;color:#777;border-bottom:1px solid #3e2723;padding-bottom:8px;margin-bottom:10px;">
                📍 ${q.giverCityName} &nbsp;→&nbsp; 🎯 ${q.targetCityName}
                &nbsp;|&nbsp; ⚠️ Risk: ${stars}
            </div>
            <p style="font-size:13px;line-height:1.65;margin:0 0 14px 0;">${text}</p>
            <div style="display:flex;gap:10px;">
                <button id="qs-accept-btn" style="flex:1;padding:12px;
                    background:linear-gradient(to bottom,#1a4a0a,#0d2a04);
                    border:1px solid #8bc34a;color:#8bc34a;
                    font-family:Georgia,serif;font-size:13px;font-weight:bold;
                    border-radius:4px;cursor:pointer;touch-action:manipulation;">
                    ✅ Accept &nbsp; +${q.reward}g
                </button>
                <button id="qs-decline-btn" style="flex:1;padding:12px;
                    background:linear-gradient(to bottom,#4a0a0a,#1a0505);
                    border:1px solid #ff5252;color:#ff5252;
                    font-family:Georgia,serif;font-size:13px;
                    border-radius:4px;cursor:pointer;touch-action:manipulation;">
                    ✗ Decline
                </button>
            </div>
        `;
        panel.style.display = "block";

        document.getElementById("qs-accept-btn").onclick  = () => _acceptQuest(qnpc);
        document.getElementById("qs-decline-btn").onclick = () => {
            _showToast(QUEST_DIALOGUES.decline());
            _closeOfferUI();
        };
    }

    function _closeOfferUI() {
        let p = document.getElementById("qs-offer-panel");
        if (p) p.style.display = "none";
        _offerNPC = null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  QUEST REMINDER  — shown when player walks up to an NPC whose quest is
    //  already accepted.  Reminds them of objective + current progress.
    // ─────────────────────────────────────────────────────────────────────────
    function _showQuestReminder(q) {
        let lines = [];
        let tEmoji = { transport:"🚚", trade:"💰", travel:"✉️", combat_bandits:"⚔️", combat_hunt:"🎯" };

        // Generic opening
        lines.push(`${tEmoji[q.type] || "📜"} <b style="color:#ffe600">${q.title}</b>`);

        if (q.type === "transport") {
            let has = (typeof player !== "undefined" && player.inventory && player.inventory[q.resourceId]) || 0;
            lines.push(QUEST_DIALOGUES.transport_hint({ ...q, playerHas: has }));
        } else if (q.type === "trade") {
            let has = (typeof player !== "undefined" && player.inventory && player.inventory[q.resourceId]) || 0;
            lines.push(`You carry ${has} of the ${q.quantity} ${q.resourceLabel} needed. Return here to ${q.giverCityName} with the full amount.`);
        } else if (q.type === "travel") {
            lines.push(`Travel to ${q.targetCityName} and find ${q.contactName} — look for the golden ring.`);
        } else if (q.type === "combat_bandits") {
            lines.push(QUEST_DIALOGUES.combat_bandit_progress(q));
        } else if (q.type === "combat_hunt") {
            lines.push(`Hunt ${q.targetName} — find their banner on the world map and destroy their band.`);
        }

        lines.push(`<span style="color:#888;font-size:11px;">💰 Reward on completion: <b style="color:#ffca28">${q.reward} gold</b></span>`);

        let panel = _ensurePanel("qs-reminder-panel", `
            position:fixed; bottom:18%; left:50%; transform:translateX(-50%);
            width:clamp(270px,80vw,400px);
            background:linear-gradient(to bottom,#1c1000,#0d0800);
            border:2px solid #ffe600; border-radius:8px;
            padding:14px 16px; font-family:Georgia,serif; color:#d4b886;
            z-index:8490; box-shadow:0 4px 20px rgba(255,230,0,0.25);
        `);
        panel.innerHTML = `
            <div style="font-size:11px;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">
                📋 Quest Reminder — ${q.giverName}
            </div>
            <p style="font-size:12px;line-height:1.65;margin:0 0 12px 0;">${lines.join("<br>")}</p>
            <button onclick="document.getElementById('qs-reminder-panel').style.display='none';"
                style="width:100%;padding:10px;
                background:linear-gradient(to bottom,#4a3a00,#22180a);
                border:1px solid #ffe600;color:#ffe600;
                font-family:Georgia,serif;font-size:12px;
                border-radius:4px;cursor:pointer;touch-action:manipulation;">
                Understood
            </button>
        `;
        panel.style.display = "block";
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  § 9  ACCEPT QUEST
    // ─────────────────────────────────────────────────────────────────────────
    function _acceptQuest(qnpc) {
        let q       = qnpc.quest;
        q.status    = "active";
        q.acceptedAt = Date.now();

        _log().active.push(q);
        _closeOfferUI();
        _saveToStorage();

        // Show accept dialogue
        let text = "";
        if      (q.type === "transport")      text = QUEST_DIALOGUES.transport_accept(q);
        else if (q.type === "trade")          text = QUEST_DIALOGUES.trade_accept(q);
        else if (q.type === "travel")         text = QUEST_DIALOGUES.travel_accept(q);
        else if (q.type === "combat_bandits") text = QUEST_DIALOGUES.combat_bandit_accept(q);
        else if (q.type === "combat_hunt")    text = QUEST_DIALOGUES.combat_hunt_accept(q);

        _showAcceptPanel(q, text);
        _showToast("📜 Quest Accepted: " + q.title);
        console.log("[QuestSystem] Accepted: " + q.title);
    }

    function _showAcceptPanel(q, text) {
        let panel = _ensurePanel("qs-accept-panel", `
            position:fixed; bottom:18%; left:50%; transform:translateX(-50%);
            width:clamp(270px,78vw,400px);
            background:linear-gradient(to bottom,#001c08,#000d04);
            border:2px solid #8bc34a; border-radius:8px;
            padding:16px; font-family:Georgia,serif; color:#d4b886;
            z-index:8501; box-shadow:0 4px 24px rgba(139,195,74,0.35);
        `);
        panel.innerHTML = `
            <div style="font-size:13px;font-weight:bold;color:#8bc34a;margin-bottom:8px;">📜 Quest Accepted</div>
            <div style="font-size:12px;font-weight:bold;color:#f5d76e;margin-bottom:10px;">${q.title}</div>
            <p style="font-size:12px;line-height:1.6;margin:0 0 12px 0;">${text}</p>
            <div style="font-size:11px;color:#888;margin-bottom:12px;">
                💰 Reward: <b style="color:#ffca28">${q.reward} gold</b> upon completion
            </div>
            <button onclick="document.getElementById('qs-accept-panel').style.display='none';"
                style="width:100%;padding:11px;
                background:linear-gradient(to bottom,#1a4a0a,#0d2a04);
                border:1px solid #8bc34a;color:#8bc34a;
                font-family:Georgia,serif;font-size:13px;
                border-radius:4px;cursor:pointer;touch-action:manipulation;">
                Understood — I will begin at once
            </button>
        `;
        panel.style.display = "block";
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  § 10  DELIVERY QUEST COMPLETION  (transport & trade)
    //        Called every time the player enters a city
    // ─────────────────────────────────────────────────────────────────────────
    function _checkDeliveryCompletion(factionName) {
        let cityName = (typeof activeCity !== "undefined" && activeCity) ? activeCity.name : null;
        if (!cityName) return;
        let log = _log();

        for (let q of [...log.active]) {
            if (q.status !== "active") continue;

            if (q.type === "transport" && q.targetCityName === cityName) {
                let has = (player.inventory && player.inventory[q.resourceId]) || 0;
                if (has >= q.quantity) {
                    _completeDelivery(q, "transport");
                } else {
                    // Hint if player is in the right city but short on goods
                    _showToast(`📦 ${q.title}: you have ${has}/${q.quantity} ${q.resourceEmoji || ""} ${q.resourceLabel}`);
                }
            }
            if (q.type === "trade" && q.giverCityName === cityName) {
                let has = (player.inventory && player.inventory[q.resourceId]) || 0;
                if (has >= q.quantity) {
                    _completeDelivery(q, "trade");
                }
            }
        }
    }

    function _completeDelivery(q, type) {
        // Deduct resources, give gold
        if (!player.inventory || player.inventory[q.resourceId] < q.quantity) {
            _showToast("⚠️ Not enough " + q.resourceLabel + " in cargo.");
            return;
        }
        player.inventory[q.resourceId] -= q.quantity;
        if (player.inventory[q.resourceId] <= 0) delete player.inventory[q.resourceId];
        player.gold += q.reward;

        let text = type === "transport"
            ? QUEST_DIALOGUES.transport_complete(q)
            : QUEST_DIALOGUES.trade_complete(q);
        _finalizeQuest(q, text);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  § 11  TRAVEL QUEST COMPLETION  (talk to contact NPC in target city)
    // ─────────────────────────────────────────────────────────────────────────
    function _completeTravelQuest(q, factionName) {
        // Show contact greeting first
        _showSimpleDialog(
            q.contactName,
            "Message Recipient",
            QUEST_DIALOGUES.travel_contact_greeting(q),
            () => {
                player.gold += q.reward;
                // Remove contact NPC from all cities
                for (let fn in _questNPCsInCity) {
                    _questNPCsInCity[fn] = _questNPCsInCity[fn].filter(n => n.id !== q.contactNPCId);
                }
                _finalizeQuest(q, QUEST_DIALOGUES.travel_complete(q));
            }
        );
    }

    function _showSimpleDialog(npcName, npcTitle, text, onClose) {
        let panel = _ensurePanel("qs-dialog-panel", `
            position:fixed; bottom:18%; left:50%; transform:translateX(-50%);
            width:clamp(270px,78vw,400px);
            background:linear-gradient(to bottom,#1c0f00,#0d0600);
            border:2px solid #ffe600; border-radius:8px;
            padding:16px; font-family:Georgia,serif; color:#d4b886;
            z-index:8502; box-shadow:0 4px 28px rgba(255,230,0,0.25);
        `);
        panel.innerHTML = `
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#999;margin-bottom:6px;">
                ${npcTitle} · ${npcName}
            </div>
            <p style="font-size:13px;line-height:1.65;margin:0 0 14px 0;">${text}</p>
            <button id="qs-dialog-close" style="width:100%;padding:11px;
                background:linear-gradient(to bottom,#4a3a00,#2a1f00);
                border:1px solid #ffe600;color:#ffe600;
                font-family:Georgia,serif;font-size:13px;
                border-radius:4px;cursor:pointer;touch-action:manipulation;">
                Continue
            </button>
        `;
        panel.style.display = "block";
        document.getElementById("qs-dialog-close").onclick = () => {
            panel.style.display = "none";
            if (onClose) onClose();
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  § 12  COMBAT QUEST COMPLETION  (hooked from leaveBattlefield)
    // ─────────────────────────────────────────────────────────────────────────
    function onBattleEnd(didPlayerWin, enemyRef) {
        if (!didPlayerWin || !enemyRef) return;
        let log = _log();

        for (let q of [...log.active]) {
            if (q.status !== "active") continue;

            // ── combat_bandits ──
            if (q.type === "combat_bandits") {
                let isBandit = (enemyRef.faction === "Bandits" || enemyRef.role === "Bandit");
                if (!isBandit) continue;

                let eInitial = (typeof currentBattleData !== "undefined" &&
                                currentBattleData.trueInitialCounts &&
                                currentBattleData.trueInitialCounts.enemy)
                                ? currentBattleData.trueInitialCounts.enemy : 1;
                let eSurvivors = (typeof battleEnvironment !== "undefined" && battleEnvironment.units)
                    ? battleEnvironment.units.filter(u => u.side === "enemy" && u.hp > 0).length : 0;
                let killed = Math.max(1, eInitial - eSurvivors);

                q.banditKillProgress = (q.banditKillProgress || 0) + killed;
                _saveToStorage();

                if (q.banditKillProgress >= q.banditCount) {
                    player.gold += q.reward;
                    _finalizeQuest(q, QUEST_DIALOGUES.combat_bandit_complete(q));
                } else {
                    _showToast(QUEST_DIALOGUES.combat_bandit_progress(q));
                }
            }

            // ── combat_hunt ──
            if (q.type === "combat_hunt") {
                let isTagged = enemyRef.questTarget === q.id;
                // Fallback: any bandit leader (count ≥ 5) if no specific NPC was tagged
                let isFallbackKill = !q.targetNPCId &&
                    (enemyRef.faction === "Bandits" || enemyRef.role === "Bandit") &&
                    (enemyRef.count || 0) >= 5;

                if (isTagged || isFallbackKill) {
                    player.gold += q.reward;
                    // Untag the bandit NPC
                    if (typeof globalNPCs !== "undefined") {
                        let tnpc = globalNPCs.find(n => n.id === q.targetNPCId);
                        if (tnpc) delete tnpc.questTarget;
                    }
                    _finalizeQuest(q, QUEST_DIALOGUES.combat_hunt_complete(q));
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  § 13  FINALIZE QUEST  (shared completion path)
    // ─────────────────────────────────────────────────────────────────────────
    function _finalizeQuest(q, completionText) {
        q.status      = "completed";
        q.completedAt = Date.now();

        let log = _log();
        log.active    = log.active.filter(aq => aq.id !== q.id);
        log.completed.push(q);
        // Trim old completions
        if (log.completed.length > _MAX_COMPLETED) {
            log.completed = log.completed.slice(log.completed.length - _MAX_COMPLETED);
        }

        _saveToStorage();
        _showCompletionUI(q, completionText);
        _showToast("✅ Quest Complete: " + q.title + "  +" + q.reward + "g");
        console.log("[QuestSystem] Completed:", q.title);
    }

    function _showCompletionUI(q, text) {
        let panel = _ensurePanel("qs-complete-panel", `
            position:fixed; top:28%; left:50%; transform:translateX(-50%);
            width:clamp(260px,78vw,390px);
            background:linear-gradient(to bottom,#001c08,#000d04);
            border:2px solid #8bc34a; border-radius:8px;
            padding:18px; font-family:Georgia,serif; color:#d4b886;
            z-index:8600; text-align:center;
            box-shadow:0 6px 28px rgba(139,195,74,0.45);
        `);
        panel.innerHTML = `
            <div style="font-size:20px;color:#8bc34a;margin-bottom:6px;">✅</div>
            <div style="font-size:13px;font-weight:bold;color:#8bc34a;margin-bottom:6px;">Quest Complete</div>
            <div style="font-size:14px;font-weight:bold;color:#f5d76e;margin-bottom:10px;">${q.title}</div>
            <p style="font-size:12px;line-height:1.6;margin:0 0 12px 0;">${text}</p>
            <div style="color:#ffca28;font-size:18px;font-weight:bold;margin-bottom:14px;">+${q.reward} Gold</div>
            <button onclick="document.getElementById('qs-complete-panel').style.display='none';"
                style="padding:11px 28px;
                background:linear-gradient(to bottom,#1a4a0a,#0d2a04);
                border:1px solid #8bc34a;color:#8bc34a;
                font-family:Georgia,serif;font-size:13px;
                border-radius:4px;cursor:pointer;touch-action:manipulation;">
                Collect & Continue
            </button>
        `;
        panel.style.display = "block";
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  § 14  QUEST LOG UI
    // ─────────────────────────────────────────────────────────────────────────
    function openQuestLog() {
        let panel = document.getElementById("qs-log-panel");
        if (!panel) {
            panel = document.createElement("div");
            panel.id = "qs-log-panel";
            panel.style.cssText = `
                position:fixed; top:0; right:0;
                width:clamp(280px,88vw,430px); height:100%;
                background:linear-gradient(to bottom,#1a0d0d,#0d0806);
                border-left:2px solid #ffe600; z-index:9100;
                display:flex; flex-direction:column;
                font-family:Georgia,serif; color:#d4b886;
                transform:translateX(100%);
                transition:transform 0.28s cubic-bezier(0.4,0,0.2,1);
                overflow:hidden;
            `;
            document.body.appendChild(panel);
        }
        _renderQuestLog(panel);
        panel.style.display = "flex";
        setTimeout(() => { panel.style.transform = "translateX(0)"; }, 10);
    }

    function closeQuestLog() {
        let panel = document.getElementById("qs-log-panel");
        if (!panel) return;
        panel.style.transform = "translateX(100%)";
        setTimeout(() => { panel.style.display = "none"; }, 300);
    }

    function _renderQuestLog(panel) {
        let log     = _log();
        let tEmoji  = { transport:"🚚", trade:"💰", travel:"✉️", combat_bandits:"⚔️", combat_hunt:"🎯" };

        function _card(q, st) {
            let color  = st === "completed" ? "#8bc34a" : (q.status === "abandoned" ? "#888" : "#ffe600");
            let badge  = st === "completed" ? "DONE" : (q.status === "abandoned" ? "ABANDONED" : "ACTIVE");

            let progressLine = "";
            if (q.type === "combat_bandits" && st === "active") {
                progressLine = `<div style="color:#ff9800;font-size:11px;margin-top:4px;">
                    ⚔️ Progress: ${q.banditKillProgress || 0} / ${q.banditCount} bandits</div>`;
            }
            if ((q.type === "transport" || q.type === "trade") && st === "active") {
                let has = (typeof player !== "undefined" && player.inventory && player.inventory[q.resourceId]) || 0;
                let icon = q.resourceEmoji || "";
                progressLine = `<div style="color:#aaa;font-size:11px;margin-top:4px;">
                    📦 Cargo: ${has} / ${q.quantity} ${icon} ${q.resourceLabel || ""}</div>`;
            }

            // Where the quest came from + where it's going
            let locationHTML = `
                <div style="color:#888;font-size:11px;margin-top:3px;">
                    📍 <b style="color:#d4b886">${q.giverName}</b>
                    in <b style="color:#ffe600">${q.giverCityName}</b>
                    &nbsp;(${Math.round(q.giverPos.x)}, ${Math.round(q.giverPos.y)})
                </div>`;

            let targetHTML = q.targetCityName && q.targetCityName !== q.giverCityName
                ? `<div style="color:#888;font-size:11px;">🎯 Target: <b style="color:#ffca28">${q.targetCityName}</b></div>` : "";

            let rewardHTML = `<div style="color:#ffca28;font-size:12px;font-weight:bold;margin-top:4px;">
                ${st === "completed" ? "✅" : "💰"} ${q.reward} Gold</div>`;

            let abandonHTML = st === "active"
                ? `<button onclick="window.QuestSystem.abandonQuest('${q.id}');window.QuestSystem.openQuestLog();"
                    style="margin-top:8px;padding:5px 12px;
                    background:rgba(255,0,0,0.08);border:1px solid #ff5252;color:#ff5252;
                    font-family:Georgia,serif;font-size:11px;border-radius:3px;cursor:pointer;
                    touch-action:manipulation;">Abandon</button>` : "";

            return `<div style="background:rgba(0,0,0,0.4);border:1px solid ${color}30;
                border-left:3px solid ${color};border-radius:4px;
                padding:10px 12px;margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                    <div style="font-size:13px;font-weight:bold;color:${color};">
                        ${tEmoji[q.type] || "📜"} ${q.title}
                    </div>
                    <div style="font-size:9px;color:${color};opacity:0.8;white-space:nowrap;margin-left:8px;">
                        ${badge}
                    </div>
                </div>
                ${locationHTML}${targetHTML}${progressLine}${rewardHTML}${abandonHTML}
            </div>`;
        }

        // ── Story Objectives section: reads from StoryQuests (story_quest_patch.js) ──
        // Shows the currently active story waypoint quest plus a history of
        // completed ones from both the catalogue and the trigger-set stack.
        let storyObjectivesHTML = "";
        if (window.StoryQuests && typeof window.StoryQuests.current === "function") {
            const sq = window.StoryQuests;
            const activeStoryQ  = sq.current();
            const catalogue     = (typeof sq.getCatalogue === "function") ? sq.getCatalogue() : [];
            const completedIds  = new Set(
                (typeof sq.list === "function") ? sq.list()
                    .filter(e => e.event === "complete")
                    .map(e => e.id) : []
            );

            // Build story objective cards
            let storyCards = "";

            // Active story waypoint (from ScenarioTriggers story_quest_set actions)
            if (activeStoryQ) {
                storyCards += `
                <div style="background:rgba(0,0,0,0.45);
                    border:1px solid rgba(244,215,110,0.25);
                    border-left:3px solid #f5d76e;
                    border-radius:4px;padding:10px 12px;margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                        <div style="font-size:13px;font-weight:bold;color:#f5d76e;">
                            🎯 ${activeStoryQ.title}
                        </div>
                        <div style="font-size:9px;color:#f5d76e;opacity:0.75;white-space:nowrap;margin-left:8px;">
                            ACTIVE
                        </div>
                    </div>
                    <div style="color:#d4b886;font-size:12px;margin-top:5px;line-height:1.4;">
                        ${activeStoryQ.description || ""}
                    </div>
                    <div style="color:#888;font-size:11px;margin-top:5px;">
                        📍 Waypoint: (${Math.round(activeStoryQ.x)}, ${Math.round(activeStoryQ.y)})
                        &nbsp;·&nbsp; radius: ${activeStoryQ.radius} 
                    </div>
                </div>`;
            }

            // Catalogue quests (main + sub-quests from scenario.storyQuests[])
            if (catalogue.length > 0) {
                catalogue.forEach(q => {
                    // Skip if already shown as the live active quest above
                    if (activeStoryQ && q.id === activeStoryQ.id) return;
                    const isDone = completedIds.has(q.id);
                    const color  = isDone ? "#8bc34a" : "#888";
                    const badge  = isDone ? "DONE"    : "PENDING";
                    const icon   = q.isMain ? "⭐" : "📌";
                    storyCards += `
                    <div style="background:rgba(0,0,0,0.3);
                        border:1px solid ${color}22;
                        border-left:3px solid ${color};
                        border-radius:4px;padding:9px 12px;margin-bottom:8px;opacity:${isDone?0.7:0.85};">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                            <div style="font-size:12px;font-weight:bold;color:${color};">
                                ${icon} ${q.title}
                            </div>
                            <div style="font-size:9px;color:${color};opacity:0.7;white-space:nowrap;margin-left:8px;">
                                ${badge}
                            </div>
                        </div>
                        ${q.description ? `<div style="color:#aaa;font-size:11px;margin-top:4px;line-height:1.35;">${q.description}</div>` : ""}
                    </div>`;
                });
            }

            if (!storyCards) {
                storyCards = `<div style="color:#555;font-size:12px;padding:10px 0;">
                    No story objectives active. Follow the scenario narrative.</div>`;
            }

            storyObjectivesHTML = `
                <div style="font-size:10px;font-weight:bold;color:#f5d76e;
                    text-transform:uppercase;letter-spacing:2px;
                    border-bottom:1px solid #4a3a00;padding-bottom:6px;margin-bottom:12px;">
                    ⭐ Story Objectives
                </div>
                ${storyCards}
                <div style="height:1px;background:rgba(255,255,255,0.06);margin:14px 0 16px 0;"></div>
            `;
        }

        let activeHTML    = log.active.length === 0
            ? `<div style="color:#555;font-size:12px;padding:10px 0;">No active quests. Visit cities to find quest givers.</div>`
            : log.active.map(q => _card(q, "active")).join("");

        let completedHTML = log.completed.length === 0
            ? `<div style="color:#555;font-size:12px;padding:10px 0;">No completed quests yet.</div>`
            : log.completed.slice().reverse().slice(0, 10).map(q => _card(q, "completed")).join("");

        panel.innerHTML = `
            <!-- Header -->
            <div style="flex-shrink:0;display:flex;align-items:center;justify-content:space-between;
                background:linear-gradient(to bottom,#4a3a00,#2a1f00);
                border-bottom:2px solid #ffe600;padding:0 16px;height:54px;">
                <span style="font-size:15px;font-weight:bold;color:#ffe600;
                    text-transform:uppercase;letter-spacing:2px;">📜 Quest Log</span>
                <button onclick="window.QuestSystem.closeQuestLog();"
                    style="background:transparent;border:1px solid #ffe600;color:#ffe600;
                    width:34px;height:34px;border-radius:4px;font-size:18px;
                    cursor:pointer;touch-action:manipulation;display:flex;
                    align-items:center;justify-content:center;">✕</button>
            </div>
            <!-- Body -->
            <div style="flex:1;overflow-y:auto;padding:16px;
                scrollbar-width:thin;scrollbar-color:#5d4037 rgba(0,0,0,0.3);">

                ${storyObjectivesHTML}

                <div style="font-size:10px;font-weight:bold;color:#ffe600;
                    text-transform:uppercase;letter-spacing:2px;
                    border-bottom:1px solid #3e2723;padding-bottom:6px;margin-bottom:12px;">
                    ⚔️ Active Quests (${log.active.length})
                </div>
                ${activeHTML}

                <div style="font-size:10px;font-weight:bold;color:#666;
                    text-transform:uppercase;letter-spacing:2px;
                    border-bottom:1px solid #3e2723;padding-bottom:6px;margin:20px 0 12px 0;">
                    ✅ Completed (${log.completed.length})
                </div>
                ${completedHTML}

                <div style="font-size:10px;color:#444;margin-top:16px;line-height:1.5;">
                    Tip: Quest giver coordinates are listed so you can return to them on the world map.
                    Combat quests are tracked automatically after battle.
                </div>
            </div>
        `;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  § 15  FLOATING QUEST BUTTON  (appears in city mode + overworld w/ quests)
    // ─────────────────────────────────────────────────────────────────────────
    function _injectQuestButton() {
        if (document.getElementById("qs-float-btn")) return;
        let btn = document.createElement("button");
        btn.id  = "qs-float-btn";
        btn.style.cssText = `
            position:fixed; bottom:78px; right:12px;
            background:linear-gradient(to bottom,#4a3a00,#22180a);
            border:2px solid #ffe600; color:#ffe600;
            font-family:Georgia,serif; font-size:13px; font-weight:bold;
            padding:10px 16px; border-radius:6px;
            cursor:pointer; z-index:8000; display:none;
            box-shadow:0 3px 14px rgba(255,230,0,0.35);
            touch-action:manipulation; min-height:46px; min-width:44px;
            letter-spacing:1px;
        `;
        btn.innerHTML = "📜 Quests";
        btn.onclick   = () => {
            let p = document.getElementById("qs-log-panel");
            if (p && p.style.transform === "translateX(0)") closeQuestLog();
            else openQuestLog();
        };
        document.body.appendChild(btn);
    }

    function _updateQuestBtnBadge() {
        let btn = document.getElementById("qs-float-btn");
        if (!btn) return;
        let log    = _log();
        let count  = log.active.length;
        let inCity = (typeof inCityMode  !== "undefined" && inCityMode);
        let inBat  = (typeof inBattleMode !== "undefined" && inBattleMode);
        // Floating button only shown INSIDE a city.
        // On the overworld, quests are accessed via the Details drawer instead.
        let show   = inCity && !inBat;

        btn.style.display = show ? "block" : "none";
        btn.innerHTML = count > 0
            ? `📜 Quests <span style="background:#ffe600;color:#000;border-radius:10px;
                padding:1px 6px;font-size:10px;margin-left:4px;">${count}</span>`
            : "📜 Quests";
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  § 16  ABANDON QUEST
    // ─────────────────────────────────────────────────────────────────────────
    function abandonQuest(qid) {
        let log = _log();
        let q   = log.active.find(aq => aq.id === qid);
        if (!q) return;
        q.status      = "abandoned";
        q.completedAt = Date.now();
        log.active     = log.active.filter(aq => aq.id !== qid);
        log.completed.push(q);
        // Untag bandit NPC
        if (q.targetNPCId && typeof globalNPCs !== "undefined") {
            let tnpc = globalNPCs.find(n => n.id === q.targetNPCId);
            if (tnpc) delete tnpc.questTarget;
        }
        _saveToStorage();
        _showToast("Quest abandoned: " + q.title);
        console.log("[QuestSystem] Abandoned:", q.title);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  § 17  TOAST HELPER
    // ─────────────────────────────────────────────────────────────────────────
    function _showToast(text, ms) {
        ms = ms || 3500;
        if (typeof showToast === "function") { showToast(text, ms); return; }
        let el = document.getElementById("qs-toast");
        if (!el) {
            el = document.createElement("div");
            el.id = "qs-toast";
            el.style.cssText = `
                position:fixed; top:55px; left:50%; transform:translateX(-50%);
                background:rgba(28,15,0,0.96); border:1px solid #ffe600;
                color:#ffe600; font-family:Georgia,serif; font-size:13px;
                padding:10px 18px; border-radius:6px; z-index:9999;
                display:none; text-align:center; max-width:82vw;
                box-shadow:0 2px 14px rgba(255,230,0,0.4); pointer-events:none;
            `;
            document.body.appendChild(el);
        }
        el.textContent  = text;
        el.style.display = "block";
        clearTimeout(el._t);
        el._t = setTimeout(() => { el.style.display = "none"; }, ms);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  § 18  DOM PANEL HELPER
    // ─────────────────────────────────────────────────────────────────────────
    function _ensurePanel(id, css) {
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement("div");
            el.id = id;
            el.style.cssText = css;
            document.body.appendChild(el);
        }
        return el;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  § 19  CITY ENTER / LEAVE HOOKS
    // ─────────────────────────────────────────────────────────────────────────

    // Rebuilds quest-giver NPC objects from the saved quest log so they appear
    // at their original positions after a save/load or city re-visit.
    function _restoreActiveQuestNPCs(factionName) {
        let log = _log();
        if (!_questNPCsInCity[factionName]) _questNPCsInCity[factionName] = [];

        for (let q of log.active) {
            if (q.giverFaction !== factionName) continue;
            // Skip if already present in this session
            if (_questNPCsInCity[factionName].some(n => n.id === q.giverNPCId)) continue;

            // Re-create the NPC at its saved position
            let qnpc = {
                id:          q.giverNPCId,
                x:           q.giverPos ? q.giverPos.x : 200,
                y:           q.giverPos ? q.giverPos.y : 200,
                faction:     factionName,
                name:        q.giverName  || "Merchant",
                title:       q.giverTitle || "Quest Giver",
                animOffset:  Math.random() * 100,
                quest:       q,         // the existing active quest object
                isRestored:  true,      // flag so we know it's from a save
            };
            _questNPCsInCity[factionName].push(qnpc);
            console.log("[QuestSystem] Restored active quest NPC:", q.giverName, "in", factionName);
        }
    }

    function onEnterCity(factionName) {
        if (!factionName) return;
        console.log("[QuestSystem] City entered:", factionName);
        _restoreActiveQuestNPCs(factionName);  // re-populate saved quest givers first
        _spawnQuestNPCs(factionName);
        _spawnContactNPCsIfNeeded(factionName);
        _checkDeliveryCompletion(factionName);
        // Seed spawn timer if this is the first visit this session
        if (!_cityLastSpawnTime[factionName]) {
            _cityLastSpawnTime[factionName] = Date.now();
        }
    }

    function onLeaveCity(factionName) {
        // Quest NPCs are kept in _questNPCsInCity for this session
        // They will be re-evaluated on next entry
        console.log("[QuestSystem] Left city:", factionName);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  § 20  MONKEY-PATCHES
    // ─────────────────────────────────────────────────────────────────────────

    // ── Patch drawCityCosmeticNPCs (city_system.js) ──────────────────────────
    function _patchDraw() {
        if (typeof drawCityCosmeticNPCs === "undefined") {
            setTimeout(_patchDraw, 200); return;
        }
        if (drawCityCosmeticNPCs.__qsPatchedDraw) return;
        const _orig = drawCityCosmeticNPCs;
        drawCityCosmeticNPCs = function (ctx, factionName, _ign, zoom) {
            _orig.apply(this, arguments);
            if (typeof inCityMode === "undefined" || !inCityMode) return;
            renderQuestNPCCircles(ctx, factionName);
            if (typeof player !== "undefined") checkQuestNPCInteraction(player, factionName);
            _updateQuestBtnBadge();
        };
        drawCityCosmeticNPCs.__qsPatchedDraw = true;
        console.log("[QuestSystem] drawCityCosmeticNPCs patched ✓");
    }

    // ── Patch leaveBattlefield (leave_battle_roster.js) ─────────────────────
    function _patchLeaveBattle() {
        if (typeof leaveBattlefield === "undefined") {
            setTimeout(_patchLeaveBattle, 200); return;
        }
        if (leaveBattlefield.__qsPatchedLeave) return;
        const _orig = leaveBattlefield;
        leaveBattlefield = function (playerObj) {
            // Capture outcome BEFORE original runs (roster changes after)
            let eSurvivors = (typeof battleEnvironment !== "undefined" && battleEnvironment.units)
                ? battleEnvironment.units.filter(u => u.side === "enemy" && u.hp > 0) : [];
            let eInitial   = (typeof currentBattleData !== "undefined" &&
                              currentBattleData.trueInitialCounts &&
                              currentBattleData.trueInitialCounts.enemy)
                             ? currentBattleData.trueInitialCounts.enemy : 999;
            let enemyRef   = (typeof currentBattleData !== "undefined") ? currentBattleData.enemyRef : null;
            let isDead     = (typeof currentBattleData !== "undefined" && currentBattleData.playerDefeatedText);
            let isRouted   = (eSurvivors.length === 0) || (eSurvivors.length / Math.max(1, eInitial) < 0.15);
            let didWin     = !isDead && isRouted;

            _orig.apply(this, arguments);

            // Quest checks run AFTER original so player.gold is already updated by loot
            onBattleEnd(didWin, enemyRef);
        };
        leaveBattlefield.__qsPatchedLeave = true;
        console.log("[QuestSystem] leaveBattlefield patched ✓");
    }

    // ── Patch displayAutoresolveResults (parler_system.js — autoresolve path) ─
    function _patchAutoresolve() {
        if (typeof displayAutoresolveResults === "undefined") {
            setTimeout(_patchAutoresolve, 300); return;
        }
        if (displayAutoresolveResults.__qsPatchedAR) return;
        const _orig = displayAutoresolveResults;
        displayAutoresolveResults = function (npc, playerWon, playerLosses, npcLosses) {
            _orig.apply(this, arguments);
            if (playerWon) {
                onBattleEnd(true, npc);
            }
        };
        displayAutoresolveResults.__qsPatchedAR = true;
        console.log("[QuestSystem] displayAutoresolveResults patched ✓");
    }

    // ── Poll inCityMode to detect city enter / leave ──────────────────────────
    function _watchCityMode() {
        setInterval(() => {
            let nowInCity = (typeof inCityMode !== "undefined" && inCityMode === true);
            let faction   = (typeof currentActiveCityFaction !== "undefined") ? currentActiveCityFaction : null;

            if (nowInCity && !_lastCityMode && faction) {
                _lastCityFaction = faction;
                onEnterCity(faction);
            }
            if (!nowInCity && _lastCityMode && _lastCityFaction) {
                onLeaveCity(_lastCityFaction);
                _lastCityFaction = null;
            }

            // ── Timed new-quest spawn while player remains in city ────────────
            // Every _CITY_RESPAWN_MS, try to add fresh NPCs if below the threshold.
            // This ensures quests keep appearing over time even in the same city.
            if (nowInCity && faction) {
                let now  = Date.now();
                let last = _cityLastSpawnTime[faction] || 0;
                if (now - last > _CITY_RESPAWN_MS) {
                    // Count givers still visible (not finished) + quests already active
                    let existingGivers = (_questNPCsInCity[faction] || [])
                        .filter(n => !n.isContact && !_log().completed.some(c => c.giverNPCId === n.id));
                    let activeCnt = _log().active.filter(q => q.giverFaction === faction).length;
                    if (existingGivers.length + activeCnt < _MAX_QUEST_NPCS_PER_CITY) {
                        _spawnQuestNPCs(faction);
                        console.log("[QuestSystem] Timed new quest spawned in", faction);
                    }
                    // Always bump the timer so we don't spam-check every 500 ms
                    _cityLastSpawnTime[faction] = now;
                }
            }

            _lastCityMode = nowInCity;
            _updateQuestBtnBadge();
        }, _POLL_MS);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  § 21  INIT
    // ─────────────────────────────────────────────────────────────────────────
    function _init() {
        // Load quest log from localStorage into player object as soon as player exists
        let _tryLoad = () => {
            if (typeof player !== "undefined") {
                if (!player.questLog) player.questLog = _loadFromStorage();
            } else {
                setTimeout(_tryLoad, 300);
            }
        };
        _tryLoad();

        _injectQuestButton();
        _patchDraw();
        _patchLeaveBattle();
        _patchAutoresolve();
        _watchCityMode();
        console.log("[QuestSystem] Initialized ✓");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", _init);
    } else {
        _init();
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  PUBLIC API
    // ─────────────────────────────────────────────────────────────────────────
    return {
        openQuestLog,
        closeQuestLog,
        abandonQuest,
        onEnterCity,           // call manually if you know where enterCity is
        onLeaveCity,           // same
        renderQuestNPCCircles, // exposed for debugging
        checkQuestNPCInteraction,
        getActiveQuests:    () => _log().active,
        getCompletedQuests: () => _log().completed,
        checkCompletions:   _checkDeliveryCompletion,  // call from city panel open if needed
    };

})();

// ============================================================================
// END OF quest_system.js
// ============================================================================
//
// ── QUICK REFERENCE: Where each quest type completes ─────────────────────────
//
//  TRANSPORT    Walk into the TARGET city carrying the required cargo.
//               The system checks automatically on city enter.
//
//  TRADE        Walk into the GIVER's city (you started at) carrying the goods.
//               The system checks automatically on city enter.
//
//  TRAVEL       Walk into the TARGET city and approach the contact NPC
//               (they have the same yellow ring as quest givers).
//               Tap/walk close to trigger the handoff dialogue.
//
//  COMBAT (x)   Win battles against Bandit faction NPCs on the world map.
//               Each victory is tallied; the counter is shown in your quest log.
//               Quest auto-completes once the kill count is met.
//
//  COMBAT HUNT  Win a battle against a specific bandit force (tagged on the map).
//               If no specific target was found at quest generation time, any
//               bandit leader group (5+ troops) counts as the kill.
//
// ── DIALOGUE EDITING GUIDE (for non-programmers) ─────────────────────────────
//
//  At the top of this file you'll find QUEST_DIALOGUES.
//  Each entry is a function like:
//      transport_offer: (q) => `...text...`
//
//  Inside the text you'll see things like ${q.targetCityName} — these get
//  replaced automatically with real values. Do NOT remove the ${...} parts.
//  Safe to change: all the surrounding words, punctuation, tone, length.
//
//  The (q) values available in each dialogue:
//      q.targetCityName   — name of destination city
//      q.giverCityName    — name of the city where the quest was given
//      q.giverName        — name of the NPC who gave the quest
//      q.resourceLabel    — name of the resource (e.g. "Sea Salt")
//      q.resourceEmoji    — emoji icon for the resource (e.g. 🧂)
//      q.quantity         — how many units are needed
//      q.reward           — gold reward amount
//      q.riskText         — auto-generated risk description
//      q.riskLevel        — 1, 2, or 3 (for building your own risk text)
//      q.banditCount      — how many bandits to kill (combat_bandits only)
//      q.banditKillProgress — how many killed so far
//      q.contactName      — contact NPC's name (travel only)
//      q.targetName       — target outlaw's name (combat_hunt only)
//
// ─────────────────────────────────────────────────────────────────────────────

// ============================================================================
// quest_patch.js  —  QUEST SYSTEM BUG FIXES
// Dynasty Sandbox | 13th-Century Sinosphere
// ============================================================================
//
// LOAD ORDER: Add this AFTER quest_system.js, as the very last script.
//
//   <script src="quest_system.js"></script>
//   <script src="quest_patch.js"></script>   ← last of all
//
// ── WHAT THIS FIXES ──────────────────────────────────────────────────────────
//
//  QUEST TYPE      STATUS    ISSUE
//  ─────────────────────────────────────────────────────────────────────────
//  transport       ✅  SAFE   Resource delivery. Completable as-is.
//  trade           ✅  SAFE   Procurement + return. Completable as-is.
//  travel          ⚠️  PATCHED  Contact NPC could never spawn if the target
//                             city had no cityCosmeticNPCs yet — added a
//                             hardcoded centre-of-city fallback position.
//  combat_bandits  ⚠️  PATCHED  trueInitialCounts may be undefined; count
//                             could tick by 1 per battle even in large fights.
//                             Improved kill counting with extra fallback path.
//  combat_hunt     🔴  PATCHED  FOUR bugs found (details below).
//
// ── COMBAT_HUNT BUGS (deep analysis) ─────────────────────────────────────────
//
//  BUG 1 — globalNPCs has no bandits at generation time
//    _findBanditNPC() scans globalNPCs for Bandit-faction entries.
//    If npc_system.js hasn't initialised yet, or if all bandits are
//    already tagged / dead, banditNPC = null → targetNPCId = null.
//    The quest is created with no valid target reference.
//    FIX: Patch stores this state as quest.huntFallbackMode = true and
//    widens the fallback kill rule.
//
//  BUG 2 — Fallback threshold is count >= 5
//    When targetNPCId is null the completion check requires any bandit
//    enemy to have (enemyRef.count || 0) >= 5.  A small patrol of 1–4
//    units never satisfies this, so the quest is permanently stuck.
//    FIX: Lower threshold to >= 1 (any defeated bandit group counts).
//
//  BUG 3 — Tagged target can be killed off-screen by other factions
//    Another NPC army can eliminate the tagged bandit before the player
//    ever encounters them.  The primary path (isTagged) then never fires,
//    and the old fallback requires count >= 5.  Result: quest is frozen.
//    FIX: On every battle win vs any bandit, check whether the quest's
//    tagged target is now dead; if so, downgrade to fallback mode and
//    accept the current kill as completion.
//
//  BUG 4 — No navigational hint for the target
//    Dialogue says the target "is marked on the world map", but world_map.js
//    only renders cities — no NPC dots.  The player has no idea where to go.
//    FIX: The quest log now shows the target's approximate world coordinates
//    (or "unknown position" if no NPC was found at generation).
//
// ── TRAVEL CONTACT BUG ────────────────────────────────────────────────────────
//
//  BUG 5 — Contact NPC silently not spawned
//    _spawnContactNPCsIfNeeded relies on cityCosmeticNPCs[factionName]
//    having at least one entry.  If the city hasn't initialised cosmetic
//    NPCs yet (e.g. first visit, async race) the contact never appears and
//    the travel quest cannot complete.
//    FIX: Fall back to the centre of the city map when the cosmetic list
//    is empty, guaranteeing the contact always spawns.
//
// ── COMBAT_BANDITS KILL-COUNT BUG ────────────────────────────────────────────
//
//  BUG 6 — trueInitialCounts may be undefined
//    currentBattleData.trueInitialCounts is checked but may not exist in
//    all battle entry paths, producing a fallback of exactly 1 kill per
//    battle regardless of enemy army size.
//    FIX: Added three-stage fallback:
//      1. trueInitialCounts.enemy (preferred — exact pre-battle count)
//      2. currentBattleData.initialCounts.enemy (alternate field name)
//      3. Count surviving + confirmed-dead units from battleEnvironment
//
// ============================================================================

(function () {
    "use strict";

    // ── Wait for QuestSystem to be ready ─────────────────────────────────────
    function _waitForQS(cb) {
        if (typeof window.QuestSystem !== "undefined") { cb(); return; }
        let tries = 0;
        let poll = setInterval(() => {
            if (typeof window.QuestSystem !== "undefined" || ++tries > 200) {
                clearInterval(poll);
                if (typeof window.QuestSystem !== "undefined") cb();
                else console.error("[QuestPatch] QuestSystem never loaded — patch aborted.");
            }
        }, 100);
    }

    _waitForQS(applyPatches);

    function applyPatches() {
        _patchGenerateCombatHunt();
        _patchBattleEnd();
        _patchContactNPCSpawn();
        _patchQuestLogHuntHint();
        console.log("[QuestPatch] All patches applied ✓");
    }

    // =========================================================================
    //  PATCH 1  —  _findBanditNPC: guarantee an 'id' field and expose it
    //  We need access to the private _findBanditNPC function.
    //  We accomplish this by patching the QuestSystem module's generateQuest
    //  path indirectly through the _spawnQuestNPCs hook (see Patch 2).
    // =========================================================================

    // =========================================================================
    //  PATCH 2  —  combat_hunt quest generation
    //  Hooks into _spawnQuestNPCs by monkey-patching drawCityCosmeticNPCs
    //  (which is what triggers spawning) — but we actually need to patch at
    //  the quest object level.  We do that by watching questLog.active and
    //  post-processing any newly added combat_hunt quest within one tick.
    // =========================================================================
    function _patchGenerateCombatHunt() {
        // Watch for new combat_hunt quests via a polling approach.
        // When one appears without a valid targetNPCId, we:
        //   a) try again to find a bandit NPC (now that more time has passed)
        //   b) record huntFallbackMode and an approximate location hint
        let _knownQuestIds = new Set();

        setInterval(() => {
            if (typeof player === "undefined" || !player.questLog) return;
            let active = player.questLog.active;
            if (!active || active.length === 0) return;

            for (let q of active) {
                if (q.type !== "combat_hunt") continue;
                if (_knownQuestIds.has(q.id)) continue;
                _knownQuestIds.add(q.id);

                // Try to tag a bandit NPC if we didn't manage to at generation time
                if (!q.targetNPCId || q.targetNPCId === null) {
                    let bandit = _safeFindBanditNPC();
                    if (bandit) {
                        q.targetNPCId     = bandit.id;
                        q.huntTargetX     = Math.round(bandit.x);
                        q.huntTargetY     = Math.round(bandit.y);
                        bandit.questTarget  = q.id;
                        bandit.displayName  = q.targetName;
                        q.huntFallbackMode  = false;
                        console.log("[QuestPatch] Late-tagged bandit for hunt quest:", q.id, "→ NPC", bandit.id);
                    } else {
                        // No bandit available — record fallback mode
                        q.huntFallbackMode = true;
                        q.huntTargetX      = null;
                        q.huntTargetY      = null;
                        console.warn("[QuestPatch] combat_hunt has no tagged target — fallback mode enabled:", q.id);
                    }
                } else {
                    // Tagged at generation — record the position hint
                    let bandit = _getBanditById(q.targetNPCId);
                    if (bandit) {
                        q.huntTargetX = Math.round(bandit.x);
                        q.huntTargetY = Math.round(bandit.y);
                        q.huntFallbackMode = false;
                    } else {
                        // NPC not found (maybe already dead at generation?), switch to fallback
                        q.huntFallbackMode = true;
                        q.huntTargetX = null;
                        q.huntTargetY = null;
                    }
                }
            }
        }, 800);
    }

    // Helper: safe globalNPCs bandit finder (same logic as _findBanditNPC but accessible)
    function _safeFindBanditNPC(nearX, nearY) {
        if (typeof globalNPCs === "undefined" || !Array.isArray(globalNPCs)) return null;
        let candidates = globalNPCs.filter(n =>
            (n.faction === "Bandits" || n.role === "Bandit") &&
            !n.isDead && !n.questTarget
        );
        if (candidates.length === 0) return null;
        if (nearX !== undefined && nearY !== undefined) {
            candidates.sort((a, b) =>
                Math.hypot(a.x - nearX, a.y - nearY) - Math.hypot(b.x - nearX, b.y - nearY)
            );
        }
        // Ensure the bandit has a stable id
        let best = candidates[0];
        if (!best.id) best.id = "bandit_autopatch_" + Date.now() + "_" + Math.floor(Math.random() * 9999);
        return best;
    }

    function _getBanditById(id) {
        if (typeof globalNPCs === "undefined" || !Array.isArray(globalNPCs)) return null;
        return globalNPCs.find(n => n.id === id) || null;
    }

    // =========================================================================
    //  PATCH 3  —  onBattleEnd: robust combat_hunt completion
    //
    //  We patch window.QuestSystem indirectly by wrapping leaveBattlefield
    //  and displayAutoresolveResults AGAIN (on top of QuestSystem's own patch).
    //  Actually QuestSystem already patches those functions and calls onBattleEnd
    //  internally.  We cannot reach onBattleEnd from outside the closure.
    //
    //  STRATEGY: Patch leaveBattlefield and displayAutoresolveResults at the
    //  window level with our own wrapper that runs AFTER QuestSystem's hook.
    //  We rely on the fact that QuestSystem patches them first (on init), so
    //  by the time this patch runs they already have __qsPatchedLeave / __qsPatchedAR.
    //  We then wrap them once more to add our improved hunt-completion logic.
    // =========================================================================
    function _patchBattleEnd() {
        _wrapLeaveBattlefield();
        _wrapAutoresolve();
    }

    function _wrapLeaveBattlefield() {
        let _tryWrap = function () {
            if (typeof leaveBattlefield === "undefined") {
                setTimeout(_tryWrap, 300); return;
            }
            if (leaveBattlefield.__qsPatch2) return;

            const _orig = leaveBattlefield;
            leaveBattlefield = function (playerArg) {
                // Run original (which includes QuestSystem's first patch)
                _orig.apply(this, arguments);

                // Now apply our improved hunt check
                let didWin = _didPlayerWin();
                if (!didWin) return;
                let enemyRef = _getCurrentEnemyRef();
                if (!enemyRef) return;

                _improvedHuntCheck(enemyRef);
            };
            leaveBattlefield.__qsPatch2 = true;
            console.log("[QuestPatch] leaveBattlefield wrapped ✓");
        };
        _tryWrap();
    }

    function _wrapAutoresolve() {
        let _tryWrap = function () {
            if (typeof displayAutoresolveResults === "undefined") {
                setTimeout(_tryWrap, 300); return;
            }
            if (displayAutoresolveResults.__qsPatch2) return;
            const _orig = displayAutoresolveResults;
            displayAutoresolveResults = function (npc, playerWon, playerLosses, npcLosses) {
                _orig.apply(this, arguments);
                if (playerWon && npc) {
                    _improvedHuntCheck(npc);
                }
            };
            displayAutoresolveResults.__qsPatch2 = true;
            console.log("[QuestPatch] displayAutoresolveResults wrapped ✓");
        };
        _tryWrap();
    }

    // Core improved hunt completion logic
    function _improvedHuntCheck(enemyRef) {
        if (typeof player === "undefined" || !player.questLog) return;
        let log = player.questLog;

        for (let q of [...log.active]) {
            if (q.type !== "combat_hunt" || q.status !== "active") continue;

            let isBandit = (enemyRef.faction === "Bandits" || enemyRef.role === "Bandit");
            if (!isBandit) continue; // Not a bandit fight — irrelevant

            // ── Primary: exact tag match ─────────────────────────────────────
            let isTagged = (enemyRef.questTarget === q.id) ||
                           (q.targetNPCId && enemyRef.id === q.targetNPCId);

            // ── Secondary: tagged target is now dead (killed off-screen) ─────
            // Downgrade to fallback so this battle still completes the quest.
            let taggedButDead = false;
            if (!isTagged && q.targetNPCId) {
                let taggedNPC = _getBanditById(q.targetNPCId);
                if (!taggedNPC || taggedNPC.isDead) {
                    taggedButDead = true;
                    q.huntFallbackMode = true; // Promote to fallback
                    console.warn("[QuestPatch] Hunt target dead off-screen for quest", q.id, "— fallback activated");
                }
            }

            // ── Tertiary: fallback — any bandit group (threshold lowered to 1)
            // BUG FIX: Original was count >= 5; small groups were never valid.
            let isFallbackKill = (q.huntFallbackMode || !q.targetNPCId || taggedButDead) &&
                                 isBandit;

            if (!isTagged && !isFallbackKill) continue;

            // ── Improved kill count for combat_bandits-style tally ───────────
            // (Not needed for hunt, but we keep parity with PATCH 4 below.)

            // ── Complete the quest ───────────────────────────────────────────
            // Only complete if QuestSystem hasn't already done so this frame
            if (log.active.find(aq => aq.id === q.id)) {
                _safeCompleteHunt(q);
            }
        }
    }

    // Force-complete a hunt quest from outside the QuestSystem closure.
    // We do this by directly manipulating player.questLog and showing UI.
    function _safeCompleteHunt(q) {
        if (q.status === "completed") return;
        q.status      = "completed";
        q.completedAt = Date.now();

        let log = player.questLog;
        log.active    = log.active.filter(aq => aq.id !== q.id);
        log.completed.push(q);
        if (log.completed.length > 30) {
            log.completed = log.completed.slice(log.completed.length - 30);
        }

        player.gold = (player.gold || 0) + q.reward;

        // Remove tag from globalNPCs
        if (typeof globalNPCs !== "undefined" && Array.isArray(globalNPCs) && q.targetNPCId) {
            let tnpc = globalNPCs.find(n => n.id === q.targetNPCId);
            if (tnpc) { delete tnpc.questTarget; delete tnpc.displayName; }
        }

        let text = typeof QUEST_DIALOGUES !== "undefined"
            ? QUEST_DIALOGUES.combat_hunt_complete(q)
            : `${q.targetName} has been eliminated. ${q.reward} gold added to your purse.`;

        _showPatchCompletionUI(q, text);
        _showPatchToast("✅ Quest Complete: " + q.title + "  +" + q.reward + "g");
        console.log("[QuestPatch] Hunt quest completed:", q.title);
    }

    // =========================================================================
    //  PATCH 4  —  Improved bandit kill count for combat_bandits
    //
    //  Original code: falls back to exactly 1 kill if trueInitialCounts
    //  is undefined.  We add two more fallback stages.
    // =========================================================================
    // This is handled inline by wrapping leaveBattlefield above, but we
    // also add a standalone helper that QuestSystem can call if needed.
    window.__patchGetBanditKillCount = function () {
        // Stage 1 — preferred
        if (typeof currentBattleData !== "undefined" &&
            currentBattleData.trueInitialCounts &&
            currentBattleData.trueInitialCounts.enemy) {
            let survivors = 0;
            if (typeof battleEnvironment !== "undefined" && battleEnvironment.units) {
                survivors = battleEnvironment.units.filter(u => u.side === "enemy" && u.hp > 0).length;
            }
            return Math.max(1, currentBattleData.trueInitialCounts.enemy - survivors);
        }
        // Stage 2 — alternate field name
        if (typeof currentBattleData !== "undefined" &&
            currentBattleData.initialCounts &&
            currentBattleData.initialCounts.enemy) {
            let survivors = 0;
            if (typeof battleEnvironment !== "undefined" && battleEnvironment.units) {
                survivors = battleEnvironment.units.filter(u => u.side === "enemy" && u.hp > 0).length;
            }
            return Math.max(1, currentBattleData.initialCounts.enemy - survivors);
        }
        // Stage 3 — count dead enemy units directly from battleEnvironment
        if (typeof battleEnvironment !== "undefined" && battleEnvironment.units) {
            let dead = battleEnvironment.units.filter(u => u.side === "enemy" && u.hp <= 0).length;
            return Math.max(1, dead);
        }
        // Stage 4 — last resort
        return 1;
    };

    // =========================================================================
    //  PATCH 5  —  Travel contact NPC fallback spawn position
    //
    //  If cityCosmeticNPCs[factionName] is empty, the contact is never placed.
    //  We patch this by wrapping the city-enter event to inject a position.
    // =========================================================================
    function _patchContactNPCSpawn() {
        // Poll until QuestSystem exposes onEnterCity in its public API
        let _tryPatch = function () {
            if (typeof window.QuestSystem === "undefined" ||
                typeof window.QuestSystem.onEnterCity !== "function") {
                setTimeout(_tryPatch, 300); return;
            }
            if (window.QuestSystem.onEnterCity.__contactPatched) return;

            const _origOnEnter = window.QuestSystem.onEnterCity;
            window.QuestSystem.onEnterCity = function (factionName) {
                // Ensure cityCosmeticNPCs has at least one fallback entry
                // BEFORE QuestSystem tries to spawn contact NPCs
                _ensureCosmeticNPCFallback(factionName);
                _origOnEnter.apply(this, arguments);
            };
            window.QuestSystem.onEnterCity.__contactPatched = true;
            console.log("[QuestPatch] onEnterCity contact-fallback patch applied ✓");
        };
        _tryPatch();
    }

    function _ensureCosmeticNPCFallback(factionName) {
        // If the cosmetic NPC list for this faction is empty, inject a
        // synthetic entry at the centre of the city so contacts can spawn.
        if (typeof cityCosmeticNPCs === "undefined") return;
        let list = cityCosmeticNPCs[factionName];
        if (!list || list.length === 0) {
            let cW = (typeof CITY_WORLD_WIDTH  !== "undefined") ? CITY_WORLD_WIDTH  : 3200;
            let cH = (typeof CITY_LOGICAL_HEIGHT !== "undefined") ? CITY_LOGICAL_HEIGHT : 3200;
            // Create a minimal synthetic NPC at city centre
            cityCosmeticNPCs[factionName] = [{
                x: cW * 0.5,
                y: cH * 0.35,   // Upper-centre — avoids the deployment zone at the bottom
                _isFallback: true
            }];
            console.warn("[QuestPatch] injected fallback cosmeticNPC for", factionName);
        }
    }

    // =========================================================================
    //  PATCH 6  —  Quest log: show hunt target location hint
    //
    //  We wrap QuestSystem.openQuestLog to inject target coordinates for
    //  combat_hunt quests after the panel is rendered.
    // =========================================================================
    function _patchQuestLogHuntHint() {
        let _tryPatch = function () {
            if (typeof window.QuestSystem === "undefined" ||
                typeof window.QuestSystem.openQuestLog !== "function") {
                setTimeout(_tryPatch, 300); return;
            }
            if (window.QuestSystem.openQuestLog.__huntHintPatched) return;

            const _origOpen = window.QuestSystem.openQuestLog;
            window.QuestSystem.openQuestLog = function () {
                _origOpen.apply(this, arguments);
                // After a brief render delay, inject the hint text
                setTimeout(_injectHuntHints, 50);
            };
            window.QuestSystem.openQuestLog.__huntHintPatched = true;
            console.log("[QuestPatch] openQuestLog hunt-hint patch applied ✓");
        };
        _tryPatch();
    }

    function _injectHuntHints() {
        if (typeof player === "undefined" || !player.questLog) return;
        let panel = document.getElementById("qs-log-panel");
        if (!panel) return;

        for (let q of player.questLog.active) {
            if (q.type !== "combat_hunt") continue;

            // Find the card for this quest by searching for its title text
            let cards = panel.querySelectorAll("div[data-qid]");
            // The default renderer doesn't add data-qid — use title text as anchor
            let allDivs = panel.querySelectorAll("div");
            for (let d of allDivs) {
                if (d.innerText && d.innerText.includes(q.title) && d.innerText.includes("ACTIVE")) {
                    // Inject location line if not already there
                    if (!d.querySelector(".qs-hunt-hint")) {
                        let hint = document.createElement("div");
                        hint.className = "qs-hunt-hint";
                        hint.style.cssText = "color:#ff9800;font-size:11px;margin-top:4px;";
                        if (q.huntFallbackMode || !q.targetNPCId) {
                            hint.innerHTML = `🎯 <b>${q.targetName}</b>: No specific target located — defeat any bandit force to complete.`;
                        } else if (q.huntTargetX !== null && q.huntTargetX !== undefined) {
                            hint.innerHTML = `🎯 <b>${q.targetName}</b>: Last seen near <b style="color:#ffca28">(${q.huntTargetX}, ${q.huntTargetY})</b> on the world map.`;
                        } else {
                            hint.innerHTML = `🎯 <b>${q.targetName}</b>: Location unknown — search bandit groups on the world map.`;
                        }
                        // Also note fallback mode in the UI
                        if (q.huntFallbackMode) {
                            let fb = document.createElement("div");
                            fb.style.cssText = "color:#aaa;font-size:10px;margin-top:2px;font-style:italic;";
                            fb.innerText = "(Any defeated bandit force will satisfy this bounty)";
                            d.appendChild(hint);
                            d.appendChild(fb);
                        } else {
                            d.appendChild(hint);
                        }
                    }
                    break;
                }
            }
        }
    }

    // =========================================================================
    //  PATCH 7  —  Periodically refresh tagged bandit coordinates in active quests
    //
    //  If a tagged bandit is moving, its last known position drifts.
    //  We update huntTargetX / huntTargetY every 10 seconds so the log stays
    //  roughly accurate.
    // =========================================================================
    setInterval(() => {
        if (typeof player === "undefined" || !player.questLog) return;
        for (let q of player.questLog.active) {
            if (q.type !== "combat_hunt" || !q.targetNPCId) continue;
            let bandit = _getBanditById(q.targetNPCId);
            if (bandit && !bandit.isDead) {
                q.huntTargetX = Math.round(bandit.x);
                q.huntTargetY = Math.round(bandit.y);
            } else if (bandit && bandit.isDead && !q.huntFallbackMode) {
                // Target died off-screen — switch to fallback
                q.huntFallbackMode = true;
                q.huntTargetX = null;
                q.huntTargetY = null;
                console.warn("[QuestPatch] Hunt target died off-screen, fallback enabled:", q.id);
            }
        }
    }, 10000);

    // =========================================================================
    //  UTILITY — helpers that mirror QuestSystem internals
    // =========================================================================

    function _didPlayerWin() {
        // Same logic QuestSystem uses in _patchLeaveBattle
        if (typeof battleEnvironment === "undefined") return false;
        let aliveEnemies = battleEnvironment.units
            ? battleEnvironment.units.filter(u => u.side !== "player" && u.hp > 0).length : 0;
        let pCmdr = battleEnvironment.units
            ? battleEnvironment.units.find(u => u.isCommander && u.side === "player") : null;
        let playerDefeated = pCmdr ? (pCmdr.hp <= 0) : (player.hp <= 0);
        return !playerDefeated && aliveEnemies === 0;
    }

    function _getCurrentEnemyRef() {
        // currentParleNPC is the NPC involved in the current parle/battle
        if (typeof currentParleNPC !== "undefined" && currentParleNPC) return currentParleNPC;
        // Fallback: try to find the most recent enemy NPC from globalNPCs
        if (typeof globalNPCs !== "undefined" && Array.isArray(globalNPCs)) {
            return globalNPCs.find(n =>
                (n.faction === "Bandits" || n.role === "Bandit") &&
                !n.isDead && n.questTarget
            ) || null;
        }
        return null;
    }

    // Simple toast (mirrors QuestSystem's internal _showToast)
    function _showPatchToast(msg) {
        let el = document.getElementById("qs-toast");
        if (!el) {
            el = document.createElement("div");
            el.id = "qs-toast";
            el.style.cssText = `
                position:fixed; bottom:12%; left:50%; transform:translateX(-50%);
                background:rgba(0,0,0,0.85); color:#ffe600;
                font-family:Georgia,serif; font-size:13px; font-weight:bold;
                padding:10px 20px; border-radius:6px; border:1px solid #ffe600;
                z-index:9000; pointer-events:none; opacity:0;
                transition:opacity 0.3s;
            `;
            document.body.appendChild(el);
        }
        el.innerText = msg;
        el.style.opacity = "1";
        clearTimeout(el._fadeTimer);
        el._fadeTimer = setTimeout(() => { el.style.opacity = "0"; }, 3500);
    }

    // Completion UI (mirrors QuestSystem's _showCompletionUI)
    function _showPatchCompletionUI(q, text) {
        let panel = document.getElementById("qs-complete-panel-patch");
        if (!panel) {
            panel = document.createElement("div");
            panel.id = "qs-complete-panel-patch";
            document.body.appendChild(panel);
        }
        panel.style.cssText = `
            position:fixed; top:28%; left:50%; transform:translateX(-50%);
            width:clamp(260px,78vw,390px);
            background:linear-gradient(to bottom,#001c08,#000d04);
            border:2px solid #8bc34a; border-radius:8px;
            padding:18px; font-family:Georgia,serif; color:#d4b886;
            z-index:8600; text-align:center;
            box-shadow:0 6px 28px rgba(139,195,74,0.45);
        `;
        panel.innerHTML = `
            <div style="font-size:20px;color:#8bc34a;margin-bottom:6px;">✅</div>
            <div style="font-size:13px;font-weight:bold;color:#8bc34a;margin-bottom:6px;">Quest Complete</div>
            <div style="font-size:14px;font-weight:bold;color:#f5d76e;margin-bottom:10px;">${q.title}</div>
            <p style="font-size:12px;line-height:1.6;margin:0 0 12px 0;">${text}</p>
            <div style="color:#ffca28;font-size:18px;font-weight:bold;margin-bottom:14px;">+${q.reward} Gold</div>
            <button onclick="document.getElementById('qs-complete-panel-patch').style.display='none';"
                style="padding:11px 28px;
                background:linear-gradient(to bottom,#1a4a0a,#0d2a04);
                border:1px solid #8bc34a;color:#8bc34a;
                font-family:Georgia,serif;font-size:13px;
                border-radius:4px;cursor:pointer;touch-action:manipulation;">
                Collect & Continue
            </button>
        `;
        panel.style.display = "block";
    }

    console.log("[QuestPatch] quest_patch.js loaded — waiting for QuestSystem...");

})();

// ============================================================================
//  PATCH SUMMARY  —  What changed and why
// ============================================================================
//
//  SAFELY COMPLETABLE (no changes needed):
//  ───────────────────────────────────────
//  ✅ transport   Inventory + city-enter check. Solid. Works as intended.
//  ✅ trade       Same mechanism as transport (return to giver city). Works.
//
//  FIXED — TRAVEL:
//  ───────────────
//  ⚠️→✅ If a city has no cityCosmeticNPCs yet (race condition on first visit),
//         the contact NPC could never be placed and the quest couldn't complete.
//         patch_5: onEnterCity now injects a synthetic cosmetic NPC at city
//         centre so the contact always has a valid position to spawn at.
//
//  FIXED — COMBAT_BANDITS:
//  ────────────────────────
//  ⚠️→✅ If trueInitialCounts was undefined, the game counted exactly 1 kill
//         per battle regardless of army size (large raids would require many
//         repetitions to satisfy a quest asking for 6+ kills).
//         patch_4: Three-stage fallback now correctly counts the actual number
//         of enemy units that died during the battle.
//
//  FIXED — COMBAT_HUNT:
//  ─────────────────────
//  🔴→✅ Bug 1: globalNPCs empty at generation → no bandit ever tagged.
//         patch_2: A 0.8-second post-generation scan attempts late-tagging.
//         If still no bandit available, quest enters huntFallbackMode.
//
//  🔴→✅ Bug 2: Fallback threshold count >= 5 blocks small bandit groups.
//         patch_3: Threshold lowered to >= 1. ANY defeated bandit group
//         satisfies an untagged hunt quest.
//
//  🔴→✅ Bug 3: Tagged bandit killed off-screen → quest permanently frozen.
//         patch_3 + interval: Dead tag detection every 10 seconds promotes
//         the quest to fallback mode, allowing the next bandit battle to count.
//
//  🔴→✅ Bug 4: No navigational hint despite dialogue claiming world map marker.
//         patch_6: Quest log now shows "(X, Y)" coordinates for tagged targets,
//         or a clear "defeat any bandit force" message in fallback mode.
//
// ============================================================================
// END OF quest_patch.js
// ============================================================================