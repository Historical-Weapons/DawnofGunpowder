// ============================================================================
// EMPIRE OF THE 13TH CENTURY - RANDOM DIALOGUE GENERATOR
// ============================================================================

const RandomDialogue = (function() {
    // State tracking to prevent spamming and recognize repeat encounters
    let currentSessionNPC = null;
    let cachedDialogue = "";
    let timesSpammed = 0;
    let encounteredNPCs = new Set(); // Tracks NPCs we've talked to previously

    // Helper: Pick a random element from an array
    const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

    // --- DIALOGUE POOLS ---
    const dialoguePools = {
bandits: {
            outnumbered: [
                "That is a lot of steel you're carrying around...",
                "We're just simple travelers taking in the sights of the road.",
                "No need to look at us like that. We're just minding our own business.",
                "Fine weather for a march, isn't it? We were just enjoying the breeze.",
                "You startled us! We're just a humble gathering of... friends.",
                "Plenty of room on this road for all of us, eh?",
                "We haven't seen any trouble around here, nope. Very quiet.",
                "Just resting our feet. It's a long walk to the next town.",
                "Impressive armor you have there. Very... shiny.",
                "We don't want any misunderstandings. We're just passing through.",
                "You seem like reasonable folks. We are too.",
                "Not many travel with an escort that size. Must be important.",
                "We're just foragers, looking for roots and berries.",
                "My, that's a lot of drawn swords for a peaceful afternoon.",
                "We didn't mean to block the path. We'll just edge out of your way.",
                "You've got a hardened look about you. We respect that. From a distance.",
                "Just admiring your horses, my lord. Fine beasts.",
                "We hear there are dangerous folk on these roads, but clearly not you.",
                "No coin on us, just dust and empty bellies.",
                "We were just talking about how much we admire heavy infantry."
            ],
            confident: [
                "Nice purses your men have there. Be a shame if they got lost.",
                "You look like you've got more coin than sense walking this road.",
                "We've been waiting for a fat caravan, but you look like a decent prize...",
                "Those boots look my size. Wonder if you'd be willing to part with them.",
                "A lot of expensive gear you've got there. Must weigh you down.",
                "We charge a voluntary toll for road maintenance. Very voluntary.",
                "You're a long way from a safe tavern, traveler.",
                "My friends here were just saying how hungry they are.",
                "You look tired. Maybe you should drop some of that heavy cargo.",
                "We always appreciate generous donations from passing lords.",
                "It's dangerous out here. You should pay us for protection.",
                "That's a nice shiny helmet. It catches the sun beautifully.",
                "We've got nowhere to be, and all day to admire your valuables.",
                "You walk with a heavy step. Sacks of silver will do that to a man.",
                "The local guards don't come out this far. It's just us out here.",
                "I wonder how much a merchant would pay for your weapons.",
                "You've got a certain 'wealthy' glow about you.",
                "My blades have been awfully dry lately.",
                "We're tax collectors of a sort. The informal sort.",
                "It's polite to share with the less fortunate, don't you think?"
            ]
        },
        civilian: {
            fearful: [
                "Times are hard, my lord. We are just trying to get by.",
                "Please, we have nothing of value in these carts.",
                "We are loyal subjects! We want no part in these wars.",
                "We've already paid our taxes for the season, I swear it.",
                "Just poor farmers, my lord. The harvest was terrible.",
                "My family is hungry. We have barely enough grain for bread.",
                "Don't mind us, we'll just keep our eyes on the dirt.",
                "We mean no offense! We're just trying to reach the village.",
                "Please don't requisition our mules, they're all we have.",
                "We've seen nothing, heard nothing, and we know nothing.",
                "Have mercy on working folk. The roads are terrifying these days.",
                "I beg you, let us pass. My children are waiting for me.",
                "We've been stripped bare by the last three armies that passed.",
                "Just looking for a safe place to sleep tonight, out of the rain.",
                "We don't want any trouble. Please.",
                "My lord, we are but simple laborers. Our pockets are empty.",
                "The winter is coming, and we have no stockpiles left.",
                "Whatever you heard about hidden silver in our village, it's a lie.",
                "We keep our heads down and pray to the Saints, that's all.",
                "Please, don't let your men trample the fields on your way."
            ],
            neutral: [
                "The roads are rough lately. Have you heard any news from the capital?",
                "We're heading to the next market. Hoping the weather holds.",
                "A large group you have there. Must cost a fortune to feed them all.",
                "They say the price of iron has tripled in the northern cities.",
                "Seen a lot of crows circling the eastern woods today.",
                "The river is running high. The bridge might be washed out ahead.",
                "I hear the Duke is raising taxes again. Typical.",
                "Just taking this wool to the weavers. A tedious journey.",
                "You wouldn't happen to know if the mountain pass is clear of snow?",
                "Lots of armed men on the roads this month. Makes a merchant nervous.",
                "The ale at the nearest tavern is watered down, just so you know.",
                "We passed a ruined wagon a few miles back. Looked like a bandit attack.",
                "These carts get heavier every mile, I swear it.",
                "Do you think it will rain? My joints are aching.",
                "Trade has been slow. Everyone is hoarding their silver.",
                "We're hoping to sell these apples before they rot.",
                "I miss the days when a man could travel without seeing a drawn sword.",
                "The local lord threw a grand feast last week, or so the rumors go.",
                "Have you seen a stray hound? Lost my best hunting dog yesterday.",
                "Safe travels to you. It's a long way to anywhere from here."
            ],
            friendly: [
                "Blessings upon you! It is good to see friendly banners on the horizon.",
                "If you are heading to the city, the merchants are paying well for furs right now.",
                "Safe travels! The roads feel much safer with forces like yours about.",
                "We always sleep easier knowing good soldiers are patrolling the realm.",
                "May the Saints guide your path, my lord.",
                "My brother serves in a regiment like yours. Good brave men.",
                "If you need fresh water, there's a clean spring just over the next hill.",
                "You look like heroes out of a song, riding like that.",
                "We've got a bit of extra cheese, if your men are hungry.",
                "It's an honor to cross paths with such a noble company.",
                "The local villagers were hoping an army would come to scare off the wolves.",
                "Your armor shines brilliantly! The blacksmiths must be proud.",
                "We'll spread the word that the roads are safe, thanks to you.",
                "My sons watch you march and dream of holding a spear one day.",
                "May victory follow your banners wherever they fly.",
                "The innkeeper ahead is friendly to your faction. Tell him we sent you.",
                "It's a beautiful day to see our colors flying high.",
                "We've had a bountiful harvest, thank the heavens. And peace to enjoy it.",
                "I hope you find whatever it is you're looking for, commander.",
                "We are grateful for the protection your presence brings."
            ]
        },
        military: {
            enemy: [
                "I know those colors. You've got some nerve marching through this region.",
                "My commander would love nothing more than to see your host in chains.",
                "Your faction has caused enough trouble around here lately.",
                "We've been tracking your movements since you crossed the border.",
                "It's a long walk back to your own lands. You might not make it.",
                "I recognize your heraldry. We have a score to settle with your kind.",
                "You're trespassing on lands claimed by my liege.",
                "We'll see how proud you look when your supplies run out.",
                "There's a storm coming for your people. You're just the first drops.",
                "I'd keep a close eye on your flanks if I were you.",
                "The ground here is thirsty. It would gladly drink your blood.",
                "We don't take kindly to your banners flying in our sight.",
                "Your arrogant lord will soon learn the price of defying us.",
                "I see a lot of dead men pretending to be soldiers.",
                "You look exhausted. This war is taking its toll on you.",
                "We're just the vanguard. The main host is right behind us.",
                "Enjoy the daylight while you can.",
                "Your formation is sloppy. My men are laughing at you.",
                "It takes a special kind of fool to march right into our territory.",
                "I'm committing your face to memory. For later."
            ],
            ally: [
                "Good to see friendly colors. The march has been long today.",
                "Our scouts report movement to the east, but nothing we can't handle.",
                "The men are in high spirits today, comrade.",
                "Have you heard from the quartermaster? We're running low on arrows.",
                "Hold the line, brother. The campaign goes well.",
                "We spotted some dust on the horizon earlier. Keep your eyes peeled.",
                "The commander sends his regards. We hold the northern flank.",
                "It's a good day for a march. The mud has finally dried up.",
                "We're rotating back to the citadel for some well-earned rest.",
                "Your troops look sharp. The training is paying off.",
                "Let me know if you have spare bandages. Our medics are short.",
                "We captured a spy yesterday. The interrogators are busy.",
                "May our combined strength shatter the enemy's resolve.",
                "The baggage train is miles behind us. It's a logistical nightmare.",
                "Stay sharp tonight. The enemy likes to raid under the new moon.",
                "Always a pleasure to see an allied banner in this desolate place.",
                "My sergeants were just praising your recent victories.",
                "We'll leave a few trail markers if we find a good ford across the river.",
                "For the realm! It's an honor to share the field with you.",
                "We've got the perimeter secured. You can rest your men here."
            ],
            neutral: [
                "Keep your men in line. We're keeping a close eye on this sector.",
                "Our lord commands us to keep the peace, so mind your manners.",
                "We have no quarrel with you... just don't cause any trouble.",
                "You're not from around here. We'll be watching you.",
                "Stay on the main road and don't forage in our lord's woods.",
                "We are sworn to defend this crossing. State your business.",
                "Your politics are your own. Just keep your swords sheathed.",
                "There's a lot of tension in the air. Don't add a spark to it.",
                "We neither welcome you nor turn you away. Just keep moving.",
                "As long as you don't raise your banners in defiance, we have no issue.",
                "My men are restless. Don't give them an excuse.",
                "We're simply holding this position. Nothing more, nothing less.",
                "You have a surprisingly large force for a simple patrol.",
                "This territory is neutral ground. See that it stays that way.",
                "We've seen enough bloodshed this season. We're not looking for more.",
                "Just passing through? See that you do.",
                "We answer only to the local Margrave. Your authority means nothing here.",
                "Keep your outriders close. We shoot unannounced trespassers.",
                "The treaty holds, for now. Let's not test it.",
                "I respect your discipline, but I don't trust your intentions."
            ]
        },
        patrol: {
            enemy: [
                "You've got a bounty on your head, you know that?",
                "The local guard is well aware of who you are and what you've done.",
                "We've had reports of criminals matching your description.",
                "You fit the profile of the smugglers we've been hunting.",
                "Your face is on a parchment back at the guardhouse.",
                "We're writing down the names of everyone in your company.",
                "I don't believe a word of your story. You look guilty.",
                "The Magistrate would be very interested to know you're in the area.",
                "You're walking on very thin ice, traveler.",
                "We have a warrant to search any suspicious wagons. And you look suspicious.",
                "You've left a trail of complaints from here to the border.",
                "Don't try to fast-talk me. I know an outlaw when I see one.",
                "We're keeping you under strict observation while you're in this jurisdiction.",
                "I'd advise you to leave the province before the Captain arrives.",
                "There are eyes on you from the shadows. Don't try anything clever.",
                "We know about the stolen goods. It's just a matter of proving it.",
                "You think you can just flout the law and walk away?",
                "We are the law in these parts, and you are not welcome.",
                "Your reputation precedes you, and it's a foul one.",
                "Make one wrong move, and the entire garrison will descend on you."
            ],
            ally: [
                "The roads have been quiet today. Good to see you out here.",
                "All secure on this stretch, commander.",
                "Just doing our rounds. Give our regards to your officers.",
                "The locals are complaining about wolves, but no bandit activity.",
                "We chased off some poachers earlier, but nothing serious.",
                "If you're heading to town, the tavern on the left has the best stew.",
                "Our shift is almost over. The night watch will relieve us soon.",
                "Everything is in order. The trade routes are flowing smoothly.",
                "We found some abandoned cargo, but it was just spoiled grain.",
                "The Magistrate sends his compliments to your company.",
                "Keep up the good work. The citizens appreciate your presence.",
                "We had a minor dispute at the toll gate, but it's resolved.",
                "The weather is holding up nicely for a patrol.",
                "We haven't seen any enemy scouts in over a week.",
                "Just a routine sweep. All clear on our end.",
                "If you need an escort through the dense woods, let us know.",
                "We've updated the warning signs near the marsh. Tell your men to be careful.",
                "It's a quiet assignment, but a necessary one.",
                "We're keeping the king's peace, one mile at a time.",
                "Safe travels, friend. We'll hold the line here."
            ],
            neutral: [
                "State your business. Lots of unsavory types about lately.",
                "Just a routine check. Keep your weapons sheathed while passing through.",
                "We're looking for deserters. You haven't seen anyone suspicious, have you?",
                "Do you have the proper travel permits for this district?",
                "We need to log your entry into the ledger. How many in your party?",
                "Ignorance of the local bylaws is not an excuse.",
                "There is a curfew in effect after sundown. See that you obey it.",
                "We are conducting a census of all armed groups on the highway.",
                "Tolls must be paid at the bridge ahead. No exceptions.",
                "You're not allowed to camp within a mile of the city walls.",
                "Keep your horses off the farmer's crops, or you'll be fined.",
                "We enforce the laws of the road. No brawling, no theft.",
                "I need to inspect your cargo manifest.",
                "Just doing our duty. Move along when you're ready.",
                "Don't loiter on the king's highway. Keep the traffic moving.",
                "We're on the lookout for contraband. Anything to declare?",
                "Remember, carrying drawn weapons in the town square is a punishable offense.",
                "We are neutral arbiters of the law. We favor no faction.",
                "You've been stopped for a random inspection. Remain calm.",
                "Answer our questions truthfully, and you'll be on your way."
            ]
        }
    };

    function generateContextualLine(context) {
        const { faction, playerFaction, playerNumbers, npcNumbers, npcType, isEnemy, isAlly } = context;
        const oddsRatio = playerNumbers / (npcNumbers || 1);
        const playerDominating = oddsRatio >= 3;
        const npcDominating = oddsRatio <= 0.33;

        // Bandits
        if (faction === "Bandits" || npcType === "Bandit") {
            if (playerDominating) return pickRandom(dialoguePools.bandits.outnumbered);
            return pickRandom(dialoguePools.bandits.confident);
        }

        // Civilians / Commerce
        if (npcType === "Civilian" || npcType === "Commerce") {
            if (isEnemy || (npcDominating && !isAlly)) return pickRandom(dialoguePools.civilian.fearful);
            if (isAlly || playerDominating) return pickRandom(dialoguePools.civilian.friendly);
            return pickRandom(dialoguePools.civilian.neutral);
        }

        // --- Military & Patrol Logic ---
        // Determine which pool to use based on npcType
        const pool = (npcType === "Patrol") ? dialoguePools.patrol : dialoguePools.military;

        if (isEnemy) {
            let line = pickRandom(pool.enemy);
            if (playerDominating) line += " Though I admit, that's quite a mob you've brought with you.";
            return line;
        }

        if (isAlly) {
            return pickRandom(pool.ally);
        }
        
        // Neutral Military/Patrol
        let neutralLine = pickRandom(pool.neutral);
        if (playerDominating) {
            neutralLine = (npcType === "Patrol") 
                ? "That's quite a large host you're leading. " + neutralLine
                : "Your army is vast. " + neutralLine;
        }
        return neutralLine;
    }

    return {
        // Generates or fetches the cached dialogue
        generate: function(context, npcRef) {
            // 1. Check if the player is just spamming the button during the SAME conversation
            if (currentSessionNPC === npcRef) {
                timesSpammed++;
                if (timesSpammed === 1) return `As I was saying... ${cachedDialogue}`;
                if (timesSpammed === 2) return `Are you deaf? I said: ${cachedDialogue}`;
                // Changed the final spam line to be inconclusive instead of "Make your choice"
                if (timesSpammed >= 3) return "Are we just going to stand here staring at each other all day?";
            }

            // 2. New interaction within Parle! Set up the session.
            currentSessionNPC = npcRef;
            timesSpammed = 0;

            // Determine if we've met this specific NPC entity before
            let prefix = "";
            if (encounteredNPCs.has(npcRef)) {
                prefix = "You again? What is it now? ";
            } else {
                encounteredNPCs.add(npcRef);
            }

            // 3. Generate the new string based on the rich context
            cachedDialogue = generateContextualLine(context);

            return prefix + cachedDialogue;
        },

        // Called when leaving the Parle screen to reset the spam checker
        resetSession: function() {
            currentSessionNPC = null;
            cachedDialogue = "";
            timesSpammed = 0;
        }
    };
})();