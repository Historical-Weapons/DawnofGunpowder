// ============================================================================
// EMPIRE OF THE 13TH CENTURY - ADVANCED NPC CONVERSATION ENGINE
// Handles multi-round, topic-based dialogue between NPCs.
// Themed for medieval Sinosphere (Song/Jin/Xia/Khaganate lore).
// ============================================================================

(function() {
    "use strict";

    // ------------------------------------------------------------------------
    // Topic Dialogue Banks (Structured for back-and-forth turns)
    // A conversation is picked randomly.
    // Turn 0: Initiator, Turn 1: Responder, Turn 2: Initiator, etc.
    // ------------------------------------------------------------------------
const CONVERSATION_POOLS = {
    small_talk: [
        [
            "Greetings. The morning market feels unusually lively today.",
            "Aye. The fishmongers from the river ward arrived before dawn.",
            "Then we should be grateful for fresh prices, at least for once.",
            "Grateful, yes. Rich, no."
        ],
        [
            "You look tired. Long night?",
            "The north wind rattled my shutters until the third drum.",
            "That old district always creaks like a boat in storm water.",
            "True, but it is cheaper than the southern lanes."
        ],
        [
            "Have you eaten yet?",
            "Only a bowl of thin rice and pickled greens.",
            "That sounds meager.",
            "It is enough to keep working, which is the real meal."
        ],
        [
            "The tea today is stronger than usual.",
            "Good. The wind off the canal has been bitter all morning.",
            "Bitter tea for a bitter day, then.",
            "And if the day grows worse, we can always add honey."
        ],
        [
            "Your cart wheel sounds repaired.",
            "I replaced the spoke with ash wood from a carpenter in the east ward.",
            "That is clever work.",
            "Necessity teaches what pride refuses."
        ],
        [
            "The city gates were crowded at sunrise.",
            "Merchants from three roads arrived at once.",
            "No wonder the guards looked miserable.",
            "They always look miserable when coin is flowing."
        ],
        [
            "I heard the temple bells before dawn.",
            "The monks are calling for rain again.",
            "Then they are praying for the same thing as the farmers.",
            "And unlike the farmers, they can do it without mud on their sleeves."
        ],
        [
            "The plum trees are blooming early this year.",
            "That usually means a warm spring.",
            "Or a confused one.",
            "The weather has forgotten its own script lately."
        ],
        [
            "How is your mother?",
            "She complains about her knees, which means she is still alive.",
            "That is the best kind of complaint.",
            "Aye. Silence would worry me more."
        ],
        [
            "The alley smells of fresh bread.",
            "The baker's wife opened a second oven.",
            "Good for her. Bad for my resolve.",
            "Then walk quickly before your resolve collapses."
        ],
        [
            "You have a new ribbon on your sleeve.",
            "My daughter tied it there before I left home.",
            "A fine charm for the road.",
            "I would rather carry her than the ribbon, but this will do."
        ],
        [
            "The river path is quiet today.",
            "Too quiet. Even the boatmen are speaking softly.",
            "Perhaps they fear the patrols.",
            "Or perhaps they simply respect the water."
        ],
        [
            "You heard the gong from the west quarter?",
            "The blacksmiths starting work early again.",
            "They must have a huge order.",
            "Or a very impatient client."
        ],
        [
            "The sun feels kinder today.",
            "Do not trust it. The clouds were gathering by noon yesterday.",
            "You sound like a man who has been burned before.",
            "Only by weather, thankfully."
        ],
        [
            "Did the Goryun traders leave already?",
            "Not yet. They are haggling over lacquer and salt.",
            "Their dialect is hard to follow.",
            "Coin makes every language understandable."
        ],
        [
            "The canal banks need clearing.",
            "The city laborers are already behind schedule.",
            "Everything is behind schedule this season.",
            "Then we are all living in the same delay."
        ],
        [
            "The children seem louder than usual.",
            "The moon festival is near.",
            "That explains everything.",
            "It explains the noise, not the energy."
        ],
        [
            "Did you see the paper lanterns by the bridge?",
            "Yes. They looked beautiful against the water.",
            "The city looks almost peaceful when no one is arguing.",
            "Which is why peace never lasts long."
        ],
        [
            "The old storyteller was in the square again.",
            "The one with the scarred hand?",
            "Yes. He speaks of emperors as if they were weather.",
            "That is often the safest way to speak of them."
        ],
        [
            "Your boots are covered in road dust.",
            "I came from the southern gate.",
            "That far? No wonder you look half dead.",
            "I am not dead. Merely committed."
        ]
    ],
    politics_rumors: [
        [
            "Did you hear the rumor from the court ward?",
            "Keep your voice low. What rumor?",
            "They say the ministers are divided over the border taxes.",
            "Of course they are. They do not pay them themselves."
        ],
        [
            "The Hong Dynasty is gathering more carts of grain.",
            "For the army or the palace kitchens?",
            "At this point, does it matter?",
            "It matters to the farmers whose barns are empty."
        ],
        [
            "A messenger came from the northern road before dusk.",
            "Was he wearing imperial colors?",
            "No. The seal looked rushed, almost false.",
            "Then someone is either panicking or lying."
        ],
        [
            "They say the Great Khaganate is restless again.",
            "Restless is a polite word for a horse that wants to kick your gate down.",
            "And yet the court still delays repairs to the wall.",
            "Because stone does not make anyone rich."
        ],
        [
            "The Jinlord officers were seen near the eastern warehouse.",
            "Why would they be there?",
            "Counting supplies, perhaps. Or counting enemies.",
            "Those two often become the same thing."
        ],
        [
            "The magistrate has new spies in the fish market.",
            "That explains why everyone suddenly cares about manners.",
            "Manners are cheapest when fear is nearby.",
            "And the most expensive when it leaves."
        ],
        [
            "The prince's banner was spotted on the road south.",
            "A procession?",
            "Some say it was too armed to be a procession.",
            "Then it was a warning dressed as ceremony."
        ],
        [
            "The Xiaran caravan master refused to pay the toll.",
            "Bold.",
            "Or informed.",
            "Or carrying someone important enough to ignore the law."
        ],
        [
            "There are more soldiers in the square than usual.",
            "The city claims it is for order.",
            "And what do you think it is really for?",
            "A reminder that order has teeth."
        ],
        [
            "The tax boards were replaced overnight.",
            "Why would they do that?",
            "Because the numbers changed, or because the truth did.",
            "Neither answer comforts me."
        ],
        [
            "I heard the Tran envoys were turned away.",
            "That seems unwise.",
            "Not if the court wants to prove it has a spine.",
            "Or if it wishes to start a problem it cannot finish."
        ],
        [
            "The Yuaman? No, the Yamato boats were delayed at port.",
            "They were carrying tribute, I think.",
            "Tribute or leverage?",
            "In politics, those are often the same crate."
        ],
        [
            "Someone painted slogans on the wall near the granary.",
            "What did they say?",
            "Nothing wise. Just anger and a call for cheaper grain.",
            "That kind of message spreads quickly when bellies are empty."
        ],
        [
            "The palace has changed the guard rotation again.",
            "That usually means someone important is afraid.",
            "Or someone important is planning to be.",
            "Either way, the rest of us pay for it."
        ],
        [
            "They say a minister's son fled west with silver.",
            "A rumor like that grows teeth fast.",
            "The roads are full of men claiming to know him.",
            "That is how a lie becomes a household story."
        ],
        [
            "The Great Khaganate may be buying horses inside the city.",
            "Inside the city? That is either diplomacy or theft.",
            "With the steppe, I have learned those two are cousins.",
            "Then we should watch the stables tonight."
        ],
        [
            "The border general has not been seen in three days.",
            "Illness?",
            "Perhaps. Or disgrace.",
            "Those are also cousins in this dynasty."
        ],
        [
            "The magistrate's seal on that document looked off.",
            "You noticed too?",
            "Aye. The ink was too fresh.",
            "Then someone wants obedience before authenticity."
        ],
        [
            "The city watch is asking questions in the taverns.",
            "About what?",
            "About merchants, horsemen, and anyone who keeps odd company.",
            "Then it is already too late for honest gossip."
        ],
        [
            "A rumor says the throne will name a new heir.",
            "That will spark ten thousand loyal speeches.",
            "And ten thousand secret knives.",
            "History prefers the knives."
        ]
    ],
    work_sinosphere: [
        [
            "The blacksmith still has not finished my blades.",
            "He is busy turning out spearheads for the city watch.",
            "The watch always gets priority.",
            "So does the army. That is how empires stay loud."
        ],
        [
            "My rice shipment was delayed at the customs gate.",
            "Did they inspect it for contraband?",
            "They said they were checking the sacks for hidden salt.",
            "Then someone wanted a bribe and forgot to be subtle."
        ],
        [
            "The kiln is running too hot again.",
            "Then lower the draft and feed it less pine.",
            "If I do that, the glaze may crack.",
            "Better a cracked bowl than a collapsed kiln."
        ],
        [
            "The silk worms are dying in the second shed.",
            "Did you keep the room dry?",
            "Too dry now. Too damp yesterday.",
            "Then the season itself is the problem."
        ],
        [
            "The ferry master raised his price by two copper.",
            "Everything has gone up.",
            "Even the air feels taxed.",
            "At least the river still carries us."
        ],
        [
            "The warehouse clerk lost my crate tag again.",
            "Did he apologize?",
            "He blamed the ink, the wind, and my handwriting.",
            "A clerk who blames the wind is already beyond help."
        ],
        [
            "The road to the west gate is full of carts.",
            "Merchants are arriving before the moon festival.",
            "That means extra work for everyone.",
            "And extra coins for the gate inspectors."
        ],
        [
            "My apprentices keep cutting the timber wrong.",
            "Perhaps the measurements are unclear.",
            "No, they are simply impatient.",
            "Then teach them patience with harder labor."
        ],
        [
            "The salt seller cheated me at market.",
            "By weight or by dampening the sacks?",
            "Both, I suspect.",
            "Then you have been robbed by a professional."
        ],
        [
            "The bookkeeper says the accounts do not balance.",
            "Which accounts?",
            "All of them, somehow.",
            "That means someone is stealing quietly."
        ],
        [
            "The rope bridge needs repair before the rains.",
            "Tell the carpenters in the east ward.",
            "They are already overbooked.",
            "Then tell them the governor will be crossing soon."
        ],
        [
            "The grain mills are backed up again.",
            "More harvest than expected?",
            "Less labor than expected.",
            "That is the truest problem any city has."
        ],
        [
            "I need more ink for the shipping manifests.",
            "Use the cheaper kind.",
            "It smudges in wet weather.",
            "Then keep the paper dry like a responsible adult."
        ],
        [
            "The armorers want more charcoal.",
            "They always want more charcoal.",
            "Because iron does not shape itself.",
            "Neither do budgets."
        ],
        [
            "The cart axle split on the return road.",
            "Did you grease it properly?",
            "Yes. The road stones were just cruel.",
            "Then take the long route next time."
        ],
        [
            "The tea house hired a new cook.",
            "Is the food any better?",
            "The noodles are thicker and the broth is saltier.",
            "That alone may save the district."
        ],
        [
            "The city porters are demanding higher wages.",
            "Are they wrong?",
            "Not really. They carry half the empire on their backs.",
            "Then the empire can spare a little silver."
        ],
        [
            "The lacquer shipment from the south arrived warped.",
            "Heat damage?",
            "Probably. Or poor sealing.",
            "Either way, the merchant will argue it is fate."
        ],
        [
            "The stonecutter broke three chisels today.",
            "Were they old?",
            "Old enough to be inherited.",
            "Then they did their duty and retired honorably."
        ],
        [
            "The tax office wants duplicate ledgers by sunrise.",
            "Again?",
            "Again.",
            "Then the scribes should sleep under their desks."
        ]
    ],
    complaints_family: [
        [
            "The tax collector took half our grain again.",
            "Half? That is robbery dressed as law.",
            "My youngest is already thin as reeds.",
            "Then we stretch the porridge and pray."
        ],
        [
            "My son was sent to the border fort yesterday.",
            "At least they gave him boots?",
            "One boot was newer than the other.",
            "Then the empire already owes your family."
        ],
        [
            "The roof leaks in three places.",
            "Did you patch it before the last storm?",
            "I patched what I could with old bamboo.",
            "Then we need more thatch before the rains return."
        ],
        [
            "My daughter has been coughing for days.",
            "Is it fever or dust?",
            "I do not know. She refuses to stop working.",
            "Then make her rest before the cough grows teeth."
        ],
        [
            "My wife says the house feels colder this week.",
            "The walls are thin and the wind is cruel.",
            "We have no coal left.",
            "Then burn less at night and share blankets."
        ],
        [
            "My brother borrowed money and never came back.",
            "Was it much?",
            "Enough to shame the family if it is lost.",
            "Then either find him or forget him."
        ],
        [
            "The children fought over the last egg.",
            "That is a terrible thing to witness.",
            "Especially when they pretended it was not the last one.",
            "When hunger enters a home, dignity leaves quietly."
        ],
        [
            "My father says I should marry the widow from the next lane.",
            "And do you wish to?",
            "I have met her only once.",
            "Then meet her twice before the old man decides your life."
        ],
        [
            "My mother is angry that I sold the bronze bowl.",
            "It was food or heirloom.",
            "She says a family without heirlooms forgets itself.",
            "A family without food forgets itself faster."
        ],
        [
            "The baby cried through the night again.",
            "Was the cradle warm?",
            "Warm enough. The problem was hunger.",
            "Then the mother must eat before the child does."
        ],
        [
            "My husband drinks whenever the work ends.",
            "Then the work never really ends for him.",
            "I am tired of the smell and the shouting.",
            "Then set the cup down before he breaks what he cannot mend."
        ],
        [
            "My sister's husband lost his wages at dice.",
            "How much did he lose?",
            "Enough to buy winter coal.",
            "Then he has gambled with more than coin."
        ],
        [
            "The old grandmother can no longer climb the stairs.",
            "Move her bed downstairs, then.",
            "There is no room downstairs.",
            "Then make room. The young can sleep anywhere."
        ],
        [
            "We had to water the soup again.",
            "That is not soup anymore.",
            "Tell that to the children after the bowls are empty.",
            "Hunger makes philosophers of all of us."
        ],
        [
            "My eldest son wants to leave for the city guard.",
            "That is safer than the frontier.",
            "Safer, yes, but still dangerous.",
            "At least he would be hungry with a salary."
        ],
        [
            "The well bucket broke this morning.",
            "Can we repair it?",
            "If I can find iron bands and a decent rope.",
            "Then ask the neighbor. He owes us from spring."
        ],
        [
            "My wife says the market prices are shameful.",
            "She is right.",
            "She says the pepper costs more than meat.",
            "Then perhaps the season itself has lost its sense."
        ],
        [
            "The children keep asking where their uncle went.",
            "What do you tell them?",
            "That he is working far away.",
            "That is kinder than the truth and more useful too."
        ],
        [
            "The winter stored millet got wet.",
            "How much did we lose?",
            "Enough that I cannot sleep.",
            "Then we dry what we can and mourn the rest."
        ],
        [
            "My father says I should be grateful for what we have.",
            "And are you?",
            "I am grateful, but I am also angry.",
            "That is the honest shape of poverty."
        ]
    ]
};

    // ------------------------------------------------------------------------
    // Engine State
    // ------------------------------------------------------------------------
    const engineState = {
        activeChats: [],
        bubbleDelayMs: 3500 // Time between each back-and-forth message
    };

    function pickRandomDialogue(topic) {
        const pool = CONVERSATION_POOLS[topic];
        if (!pool) return [];
        return pool[Math.floor(Math.random() * pool.length)];
    }

    // ------------------------------------------------------------------------
    // Core Engine Logic
    // ------------------------------------------------------------------------
    function tryStartConversation(npcA, npcB, factionName) {
        if (!npcA || !npcB) return false;
        
        // Ensure neither is currently talking or on heavy cooldown
        if (npcA.__inConvo || npcB.__inConvo) return false;
        if (cityDialogueSystem.isOnContactCooldown(npcA) || cityDialogueSystem.isOnContactCooldown(npcB)) return false;

        // Pick a random topic
        const topics = Object.keys(CONVERSATION_POOLS);
        const selectedTopic = topics[Math.floor(Math.random() * topics.length)];
        const script = pickRandomDialogue(selectedTopic);

        if (!script || script.length === 0) return false;

        // Lock them into a conversation
        npcA.__inConvo = true;
        npcB.__inConvo = true;

        // Stop them from moving if possible (relies on your city_system.js state machine)
        if (npcA.state) { npcA.state = "pausing"; npcA.stateTimer = script.length * engineState.bubbleDelayMs / 16; }
        if (npcB.state) { npcB.state = "pausing"; npcB.stateTimer = script.length * engineState.bubbleDelayMs / 16; }

        engineState.activeChats.push({
            npcA: npcA,
            npcB: npcB,
            script: script,
            currentTurn: 0,
            maxTurns: script.length,
            nextTriggerTime: performance.now(),
            factionName: factionName
        });

        return true;
    }

    function update() {
        const now = performance.now();
        
        // Loop backwards so we can safely remove finished conversations
        for (let i = engineState.activeChats.length - 1; i >= 0; i--) {
            let chat = engineState.activeChats[i];
            
            // Check if NPCs walked too far away from each other (e.g., > 80 pixels)
            let dist = Math.hypot(chat.npcA.x - chat.npcB.x, chat.npcA.y - chat.npcB.y);
            if (dist > 80) {
                endConversation(chat, i);
                continue;
            }

            // Is it time for the next line of dialogue?
            if (now >= chat.nextTriggerTime) {
                let speaker = (chat.currentTurn % 2 === 0) ? chat.npcA : chat.npcB;
                let text = chat.script[chat.currentTurn];

                // Render the text using your existing system
                cityDialogueSystem.showSpeech(text, {
                    npcRef: speaker,
                    durationMs: engineState.bubbleDelayMs,
                    isPlayerContact: false
                });

                // Set cooldowns so they don't get interrupted by standard ambient chat
                speaker.__cityDialogueLastTriggerAt = now;
                speaker.__cityDialogueCooldownMs = engineState.bubbleDelayMs;

                chat.currentTurn++;
                chat.nextTriggerTime = now + engineState.bubbleDelayMs;

                // Did the conversation finish?
                if (chat.currentTurn >= chat.maxTurns) {
                    endConversation(chat, i);
                }
            }
        }
    }

    function endConversation(chat, index) {
        chat.npcA.__inConvo = false;
        chat.npcB.__inConvo = false;
        
        // Give them a long cooldown after a full conversation so they don't immediately start again
        const longCooldown = 15000 + Math.random() * 10000;
        chat.npcA.__cityDialogueLastTriggerAt = performance.now();
        chat.npcA.__cityDialogueCooldownMs = longCooldown;
        chat.npcB.__cityDialogueLastTriggerAt = performance.now();
        chat.npcB.__cityDialogueCooldownMs = longCooldown;

        engineState.activeChats.splice(index, 1);
    }

    // Expose to window
    window.cityConversationEngine = {
        tryStartConversation,
        update,
        engineState
    };

})();