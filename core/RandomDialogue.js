// ============================================================================
// RANDOM DIALOGUE — 13th Century Sinosphere Edition
// Complete replacement of the old system.
//
// Design principles:
//   • No "You again? What is it now?" — just say something new every time.
//   • No spam-echo phases — clicking again picks a fresh line from the pool.
//   • Anti-repeat tracker (WeakMap per NPC) so the same line is never used
//     twice in a row for the same NPC entity.
//   • Two entry points:
//       RandomDialogue.generate(context, npcRef)      → "What's on your mind?"
//       RandomDialogue.generateHello(context, npcRef) → "Hello" / greeting
//   • Class + relationship + force-ratio determine the pool.
//   • All flavour is era-accurate to the medieval sinosphere (13th century).
//
// Context object expected by both methods:
//   {
//     faction:       string,  // NPC faction name
//     playerFaction: string,
//     playerNumbers: number,  // total player troops
//     npcNumbers:    number,  // NPC force count
//     npcType:       string,  // "Civilian" | "Commerce" | "Bandit" | "Military" | "Patrol"
//     isEnemy:       bool,
//     isAlly:        bool
//   }
// ============================================================================

const RandomDialogue = (function () {
    "use strict";

    // ── Utility ───────────────────────────────────────────────────────────────
    const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

    // Per-NPC anti-repeat tracker. Keys are the npc object references themselves.
    // Keeps the last ⌊N/2⌋ used lines out of the pool so picks stay fresh.
    const _historyMap = new WeakMap();

    function pickFresh(pool, npcRef) {
        if (!pool || pool.length === 0) return "...";
        // If npcRef isn't a usable WeakMap key just pick at random
        if (!npcRef || typeof npcRef !== "object") return rand(pool);

        let seen = _historyMap.get(npcRef);
        if (!seen) { seen = []; _historyMap.set(npcRef, seen); }

        const maxSeen = Math.max(1, Math.floor(pool.length / 2));
        const fresh   = pool.filter(line => !seen.includes(line));
        const chosen  = rand(fresh.length > 0 ? fresh : pool);

        seen.push(chosen);
        if (seen.length > maxSeen) seen.shift();
        return chosen;
    }

    // ── Force-ratio helpers ────────────────────────────────────────────────────
    function getOdds(context) {
        const ratio = (context.playerNumbers || 1) / (context.npcNumbers || 1);
        return {
            playerDominates: ratio >= 3,
            npcDominates:    ratio <= 0.33
        };
    }

    // ========================================================================
    // ██████████████████████  HELLO POOLS  ███████████████████████████████████
    // Short first-contact greetings. Called by the "Hello" button.
    // ========================================================================

    const HELLO = {

        // ── Bandits ─────────────────────────────────────────────────────────
        bandit: {
            outnumbered: [
                "We meant nothing by it, General. Just mountain folk taking the air.",
                "A fine host you lead, Lord. We will trouble you no further.",
                "Mercy, General! We are but humble travellers who lost our way.",
                "Please, no trouble! We have nothing worth your soldiers' time.",
                "We greet you respectfully, Great One, and step well aside.",
                "Ha... well met, General. We were just leaving, as it happens.",
                "Our brothers send their apologies, Lord. Roads are wide enough for all.",
            ],
            confident: [
                "So you decided to talk first. Wise. Hand over your silver and we part clean.",
                "A greeting? From a general? This must be our lucky day, brothers.",
                "Well met. Now show me what's in those wagons.",
                "I'll be brief, General: your gold or your trouble. Which do you prefer?",
                "Greetings. Your convoy is short an escort. We noticed.",
                "Bold of you to ride this road, General. We respect boldness. Show us your coin.",
                "The mountain has a toll. Consider this greeting the last free thing you'll receive.",
                "We've been watching since the third mile-marker. Speak plainly.",
            ]
        },

        // ── Civilians (百姓) ─────────────────────────────────────────────────
        civilian: {
            fearful: [
                "This lowly one dares not raise their eyes, Great General. We meant no offense.",
                "Please, Great Lord! We are loyal subjects. We beg your mercy.",
                "We kowtow before the noble General. We have nothing worth taking.",
                "This humble one greets the Lord with trembling hands. Please spare us.",
                "Great One, your servant greets you and asks only for safe passage.",
                "Please forgive these poor farmers for blocking your road, General.",
            ],
            neutral: [
                "Good day to you, General! Heaven must be pleased to see your banners.",
                "Greetings, Lord. The road ahead was clear when we last passed it.",
                "Well met, great General. We are but simple people heading to market.",
                "Heaven bless your march, Commander. We get out of your way.",
                "A fine day to meet such a distinguished force on the road, my Lord.",
            ],
            friendly: [
                "Blessings upon your campaign, great General! May Heaven guide your blades!",
                "A wonderful sight, Lord! We feel safer just seeing your banners.",
                "Heaven smiles today! The people's general walks among us.",
                "Welcome, noble Commander! Your name reaches even our small village.",
                "What a fine omen to meet you on the road, General! Victory will follow you.",
                "We greet you with joy, Lord! The realm rests easier with you in it.",
            ]
        },

        // ── Commerce / Merchants (商人) ────────────────────────────────────
        commerce: {
            fearful: [
                "Honoured General, this merchant's papers are all in order, I assure you.",
                "Please, my Lord. My cargo is legitimate. I have the magistrate's seal here.",
                "A respectful greeting, noble General. We carry only taxed goods, I swear it.",
                "I greet you humbly, Lord. The guild vouches for every item in these carts.",
            ],
            neutral: [
                "Well met, General! Perhaps your quartermaster and I can talk business.",
                "Good day, Lord. This merchant's caravan is at your service, should you need it.",
                "Greetings, noble General. A man of your position must have fine tastes.",
                "Honoured Commander, welcome. I trade in quality. What does your army need?",
                "A pleasure, General. The roads feel safer with a host like yours about.",
            ],
            friendly: [
                "Excellent fortune, General! I was hoping to cross paths with you.",
                "A fine meeting, Lord! Allow me to offer your officers something from my stock.",
                "Welcome, noble General! Business is always better under a strong banner.",
                "Greetings and prosperity, Commander! We owe our safe journey to forces like yours.",
                "I bow to you, General. Your victories have opened three trade routes. We are grateful.",
            ]
        },

        // ── Military (軍士) ─────────────────────────────────────────────────
        military: {
            ally: [
                "Commander! Well met. The patrol went smoothly — nothing to report.",
                "General, your column is a welcome sight. We hold this position on order.",
                "Brother in arms! We were expecting your advance. The road is clear.",
                "All present and ready, Commander. The flank is secure.",
                "Well met, sir! The men are rested. We await your orders.",
                "General, our scouts report clear skies to the north. You may advance.",
            ],
            enemy: [
                "So you finally show your face. My scouts knew you were close.",
                "I know your colors, General. Your faction has made many enemies here.",
                "Bold of you to approach. Our blades have been very patient.",
                "My lord will hear of this. Choose your next words with care, General.",
                "I respect the courage it takes to greet us. That is all I respect.",
                "You walked into our lines. Now speak quickly — patience is short today.",
            ],
            neutral: [
                "Halt and state your name. We hold this ground by our lord's decree.",
                "Name your faction and your purpose, General. This is a secured road.",
                "You are at the edge of our lord's territory. Speak plainly.",
                "We hold no quarrel with you — yet. Identify yourself.",
                "A large force on a narrow road. State your intentions, General.",
                "We are disciplined soldiers. Do not make us prove it. State your business.",
            ]
        },

        // ── Patrol / City Guard (衛兵) ────────────────────────────────────
        patrol: {
            ally: [
                "All clear on this stretch, Commander. Good to see you.",
                "The district is quiet today. No incidents to report, General.",
                "We just finished our sweep. Good timing, sir. The road is clean.",
                "The checkpoint is open for you, Commander. Safe passage ahead.",
                "Greetings, sir. Nothing unusual on our patrol today.",
            ],
            enemy: [
                "Stop right there. This is a controlled checkpoint.",
                "You are entering a restricted district. Name yourself.",
                "Halt! Your column has been tracked since the third marker. Explain yourself.",
                "Your entry has been logged and reported. State your business.",
                "We do not welcome unannounced armed groups here. Turn back or explain.",
            ],
            neutral: [
                "Halt. State your name and destination for the road ledger.",
                "You are entering our patrol zone, General. A few routine questions.",
                "Good day. Travel documents, please.",
                "You have reached the district checkpoint. Weapons sheathed.",
                "State your faction and destination. We log all armed movement here.",
                "A routine stop, General. Nothing personal. Papers, please.",
            ]
        }
    };

    // ========================================================================
    // ████████████████████████  GENERAL POOLS  ████████████████████████████████
    // Deeper situational lines. Called by the "What's on your mind?" button.
    // ========================================================================

    const GENERAL = {

        // ── Bandits (山賊) ───────────────────────────────────────────────────
        bandit: {
            // Player force overwhelms the bandits (3:1+)
            outnumbered: [
                "My Lord, we are just charcoal burners. Very dedicated charcoal burners.",
                "Forgive these mountain folk, General. We are simple hunters. Of mushrooms.",
                "Those weapons? For wolves, my Lord. Enormous wolves. Very dangerous ones.",
                "We meant no insult to your banners, Great One. We were just admiring them.",
                "We've no quarrel with a force as impressive as yours. Clearly.",
                "We were just resting our feet, General. The road is long and our legs are short.",
                "Surely a man of your renown has no need to trouble himself with poor folk like us.",
                "We'll be heading back into the hills now, General. Quickly. Don't mind us.",
                "Heaven itself seems to have blessed your arms today. We bow accordingly.",
                "No coin on us, my Lord. Just dust, empty bellies, and enormous respect for you.",
                "We are loyal subjects! Any banditry you may have heard of was greatly exaggerated.",
                "Please, we've wives and children in the hills, General. Spare men with families.",
                "We'll carry ourselves on without delay, great Commander. Enjoy the road.",
                "The county magistrate is a personal friend of ours. Very personal. Very close.",
                "Your cavalry would make short work of us. Hardly worth the effort, truly.",
                "Look at all that fine armor. We were just admiring the craftsmanship. From afar.",
                "We haven't eaten in days, General. Sympathy for hungry men with regrets?",
                "Just wanderers, Lord. The war scattered our village. We are merely lost.",
                "We were just leaving! The fog is thick and the hills are calling us home.",
                "Heaven watches over the righteous, General. And you appear very righteous indeed.",
            ],
            // Bandits have the numbers or equal footing
            confident: [
                "Your purse is looking heavy today, General. Share the weight with the mountains.",
                "A fine convoy and a thin escort. The heavens must smile on us today, brothers.",
                "We've taken an oath of brotherhood. Your gold will join our noble cause.",
                "The county magistrate can't protect you this far from his walls, Lord.",
                "We charge a road toll for maintenance. The informal sort. Very urgent.",
                "We've robbed three caravans this moon. Your luck is running short.",
                "Leave your silver and walk away with your teeth. A generous offer.",
                "We serve no lord. The mountains are our domain and this road is ours.",
                "Your banner means nothing here. Only iron speaks in these hills.",
                "The Emperor's writ doesn't reach this valley, General. Only our decree does.",
                "What do you carry beneath that tarpaulin? We intend to find out one way or another.",
                "Don't reach for your sword. You'll just make our brothers angry. And hungry.",
                "Call it a voluntary contribution to road safety. Very voluntary. Very urgent.",
                "My blades have been terribly dry lately. Help remedy that with your coin.",
                "A general without support is just a man in expensive armor. Think carefully.",
                "The old woodcutter said a rich patrol uses this road. He was right.",
                "We're tax collectors of a sort. The mountain sort. We collect now.",
                "You look tired, General. Let us relieve you of some of that heavy cargo.",
                "No need for drawn swords, just open purses. A very peaceable arrangement.",
                "We've got hungry mouths in these hills. You look well-provisioned for a donation.",
            ]
        },

        // ── Civilians (百姓 — common people, farmers) ─────────────────────
        civilian: {
            // Enemy faction or player hopelessly outnumbered
            fearful: [
                "This lowly one prostrates before the Great General. Please spare our stores.",
                "Great Lord, we have already paid our summer taxes to the magistrate's office!",
                "We are loyal subjects of the realm, General. Our fields are bare, we swear it.",
                "Please do not requisition our ox, Lord. It is all we have left to plow.",
                "We have seen nothing and heard nothing. The heavens themselves are our witness.",
                "Please do not let the soldiers camp in our fields before the harvest, General.",
                "My children wait at home. We only want to return to our village in peace.",
                "Three armies have passed through this moon, Lord. We have been stripped bare.",
                "The ancestral spirits watch over this land. We beg your understanding.",
                "We are but dust beneath your boots, Great General. We ask only for peace.",
                "This lowly one has done nothing against Heaven's will. Please spare us.",
                "Please, the harvest was poor. We cannot bear another levy this season.",
                "The magistrate promised we would be protected! We believed him, Lord.",
                "We pay our rice tribute every season without fail. We ask only to be left in peace.",
                "Please, Great One, do not burn the village. We have no rebel among us.",
                "We kowtow before your might, General. Do not punish those without sin.",
                "A humble widow begs the mercy of your great command, Lord.",
                "Do not blame us for the blocked road, General. The floods caused it, not us.",
                "We offer what little we have. Please do not take the cart. It is all we own.",
                "This foolish one spoke out of turn. Forgive me, great General.",
            ],
            // Balanced or unclear relationship
            neutral: [
                "The river road is flooded again this season. Take the mountain path, General.",
                "Have you heard news from the capital? They say the Emperor holds court again.",
                "The price of grain has risen sharply since the southern campaign began.",
                "A large host like yours must cost a fortune to feed every single day.",
                "The local magistrate raised the salt tax again. Bitter times are ahead.",
                "Crows have been circling the eastern pass for three days now. Ill omen.",
                "The bridge upstream was washed out in last night's storm, General.",
                "We are taking this year's silk to market. Hoping the prices are fair.",
                "The tea merchants say there is unrest near the northern passes again.",
                "Lots of soldiers on the roads lately. Makes a simple farmer very nervous.",
                "Bao the blacksmith says iron has tripled in price since spring. Hard times.",
                "Wolves attacked the shepherd's flock in the hills again last week.",
                "The river runs fast this year, General. The water spirits must be restless.",
                "The Buddhist monks at the hilltop temple offer rice to passing armies.",
                "Our village has forty men left after the levies. Half what we had before.",
                "Have you passed through the market at Changping? The trading there is lively.",
                "Safe travels, General. The northern road was clear as of this morning.",
                "The mountain clans have been quiet lately. Perhaps the autumn peace holds.",
                "Word from the east says the garrison was resupplied. Good news for everyone.",
                "My son aspires to the civil examinations. We pray Heaven guides his brush.",
            ],
            // Allied faction or player is a protector
            friendly: [
                "Blessings upon your banners, Great General! May Heaven guide your campaign!",
                "It is an honor to see such a righteous force on our road today.",
                "There is a clean spring just past the willow grove ahead, General.",
                "We sleep easier knowing a strong army walks these roads, Lord.",
                "May the ancestors bless your march and bring you swift victory!",
                "The village elder says you are a protector of the people. We are grateful.",
                "Our boys watch your soldiers march and dream of serving the realm one day.",
                "Tell your men the kitchen fire is lit. We have hot porridge for the hungry.",
                "It is a fine day to march, General. Heaven must favor your cause.",
                "Safe travels and swift victory! The people of this village stand with you.",
                "The innkeeper at the crossroads is a good man. He will treat you fairly.",
                "A bountiful harvest this season, thank the heavens. A good omen for your march.",
                "May your blades stay sharp and your soldiers stay strong, Great Lord.",
                "Your presence brings peace to this road, General. We thank you for it.",
                "The autumn sky is clear. Heaven surely smiles upon your campaign.",
                "We brought fresh water from the well for your soldiers, if they are thirsty.",
                "Our prayers at the temple yesterday were offered for your army's safety.",
                "You look like the heroes from the old stories. May you match their deeds.",
                "A righteous general is worth ten thousand soldiers. May you prosper, Lord.",
                "We have spread word of your kindness. The villages ahead will welcome you.",
            ]
        },

        // ── Commerce / Merchants (商人) ────────────────────────────────────
        commerce: {
            fearful: [
                "Please, Great Lord! This is legitimate trade. I have the magistrate's seal!",
                "Honourable General, I ask only that my goods be inspected fairly and justly.",
                "My Lord, my cargo is silk and dried goods. Nothing worth a soldier's attention.",
                "Please do not requisition our mules, Lord. They are all we have for the road.",
                "I have already paid the road tariffs at the last two checkpoints, General!",
                "A ruined merchant cannot pay taxes, Lord. Surely that helps no one.",
                "My whole household depends on this caravan reaching market safely, General.",
                "We offer a gift of fine Pu-erh tea to the noble General, in good faith.",
                "Please do not seize the goods, Great One. My creditors await payment urgently.",
                "I am merely a middleman, Lord. The silk itself belongs to the guild.",
                "The trading licenses are all in order, General. Please take a moment to inspect them.",
                "Please understand, Lord — destruction of trade harms the realm as much as any enemy.",
                "This merchant pledges loyalty to whichever banner keeps the roads safe, General.",
                "My Lord, these poor goods are already pledged to buyers in the city ahead.",
            ],
            neutral: [
                "The silk road north is very active this season. Many Khaganate traders about.",
                "Iron prices have tripled since the campaign started, General. Hard times for all.",
                "I carry spices from the southern ports. Always a good market in the northern cities.",
                "The tea tariff at the eastern pass is crushing honest trade this season, Lord.",
                "I hear the northern cities are paying very well for quality cotton right now.",
                "A large army like yours has considerable appetite. Might you need provisions?",
                "The trade winds favor the coastal route this season, General.",
                "I just came from the capital market. Salt is scarce but silk still flows freely.",
                "The war has been good for the arms merchants. Less so for the rest of us.",
                "The river fords are clear south of here, if you need to move your wagons.",
                "The southern guilds are offering very strong prices for northern amber right now.",
                "Our warehouse in the city is well-stocked. Perhaps your quartermaster has need?",
                "The mountain passes close in two moons, General. Make haste if you head north.",
                "Porcelain is moving well this season. The western buyers cannot get enough of it.",
                "Word from the harbor is three ships arrived from the south just last week.",
                "A prudent lord knows that commerce fills the granaries as well as war does.",
                "We trade in quality goods, General. Fair prices for honest dealings always.",
                "The local guild master has good standing with the garrison, should you need supplies.",
                "I know a shortcut through the eastern valley that will save your column two days.",
                "Whatever your cause, your quartermaster should speak with me before you leave.",
            ],
            friendly: [
                "Excellent timing, General! I have fine supplies that may suit your army perfectly.",
                "Your presence on this road raises every merchant's spirits, Lord. Safe means prosperous.",
                "I have salted fish, dried grain, and good hempen rope — at very fair prices.",
                "May your banners fly long and trade flourish under your protection, Lord.",
                "A strong army is very good for business. The bandits keep their distance.",
                "Safe roads mean prosperous markets. Heaven bless your campaign, General.",
                "I offer the army a trader's discount. A small tribute for your great service.",
                "We have brought twice the stock this year. The peace you helped secure is good for trade.",
                "Your victories last season opened the northern routes again. Our profits doubled.",
                "Tell your men there is good grain wine at the merchant house one li ahead.",
                "We bring silk from the eastern looms. Your officers might find it of interest.",
                "A fair general earns a fair merchant's loyalty. You have ours, Lord.",
                "The local guilds support your cause, General. Commerce and arms walk together.",
                "We are grateful for what your army did for this region. Name your price.",
            ]
        },

        // ── Military / Field Forces (軍隊) ─────────────────────────────────
        military: {
            ally: [
                "The northern flank is secured, General. Our cavalry patrol reported no movement.",
                "We await your orders, Commander. The men are rested and ready for the march.",
                "The supply convoy is three li behind us. We will make camp before nightfall.",
                "Our scouts spotted dust to the east at dawn, but nothing came of it by midday.",
                "The garrison commander sends his respects, General. The fortifications hold firm.",
                "We took four prisoners in the night raid. The interrogators are working them now.",
                "The regiment is in high spirits after last week's victory, Commander.",
                "We have had reports of enemy supply lines stretched thin near the northern pass.",
                "The quartermaster says we carry three weeks of rations. Enough for the push forward.",
                "Our archers drilled at dawn. The new recruits are shaping up well, General.",
                "Hold the line, brother. The campaign is going well on all fronts.",
                "We rotated the night watch an hour early. The men needed the rest.",
                "The engineers finished the pontoon bridge at midnight, Commander.",
                "Enemy cavalry was spotted circling our eastern flank two hours ago. We tracked them.",
                "The signal fires are lit and ready. The chain of command stands strong.",
                "I commend your recent victory, Commander. The men talk of nothing else.",
                "We await reinforcement from the southern regiment before we can advance further.",
                "The river crossing at the ford is clear, General. Ready for your advance.",
                "Our foragers report the western fields are unharvested. The enemy retreated in haste.",
                "For the realm! It is always an honor to share the field with your command.",
            ],
            enemy: [
                "You march very far from your lord's protection, General. How admirably bold.",
                "I know your colors. Your faction has made many enemies in this region. Many.",
                "We have been tracking your movements since you crossed the northern pass at dawn.",
                "Your vanguard is sloppy, General. My scouts have been laughing at your formation.",
                "The ground here has drunk the blood of better men than you, General. Consider that.",
                "We are just the forward guard. The main host numbers considerably more.",
                "Your arrogance will be your undoing, General. We have witnessed it before.",
                "Enjoy the view from here. Our lord will soon take everything within it.",
                "You stand on lands claimed by my lord. State your purpose or draw steel now.",
                "Your men look tired, General. The campaign is taking its toll, yes?",
                "I have fought your kind before. You march proudly but crumble quickly under pressure.",
                "We hold this valley and intend to keep it. Choose your next words with great care.",
                "Your reputation precedes you, General. It is not a flattering one from where I stand.",
                "My lord would pay handsomely for your head. A generous bounty.",
                "We expected you sooner. Our archers have been waiting and growing restless.",
                "Turn back while you still have the men to make it worth your while, General.",
                "A general who cannot read the terrain will lose before the first arrow is loosed.",
                "We are patient men. We can wait here longer than you can afford to march.",
                "You have made a mistake coming this way. A very costly one, I fear.",
                "Do not mistake our restraint for weakness. We simply prefer to let you commit first.",
            ],
            neutral: [
                "State your business on this road. We keep watch here by our lord's command.",
                "We have no quarrel with you, provided your intentions match your words, General.",
                "This ground falls under our lord's jurisdiction. Respect it and we have no issue.",
                "Your banner flies under a neutral treaty. See that your men honor it, General.",
                "We are disciplined soldiers. Do not give us cause to demonstrate it.",
                "Even a dragon must bow to local custom in foreign territory. You understand.",
                "We observe your passage but do not bar it. Keep to the road ahead and move on.",
                "Our orders are to maintain the peace, General. Do not complicate that for either of us.",
                "Your army is very large. Large enough to draw attention from our lord's archers.",
                "We have held this position through four seasons. We are not easily moved, General.",
                "Travel freely, but know that we are watching your flanks. All of them.",
                "We offer you face, General. Do not discard it by causing trouble on our lord's roads.",
                "The treaty between our lords holds, as far as we are concerned here.",
                "Our patrols cover a wide area. Do not mistake our hospitality for weakness.",
                "March through and keep your foragers off our lord's fields. A simple request.",
                "We serve our lord here. Your rank commands respect but not authority in this land.",
                "Speak plain and honest, and we will have no trouble between us today.",
                "These roads have seen many armies, General. Few left better than they arrived.",
                "We are not enemies. Let us remain that way. It benefits us both.",
                "Keep your outriders visible and your intentions clear. We will do the same.",
            ]
        },

        // ── Patrol / City Guard (衛兵 / 巡邏隊) ──────────────────────────
        patrol: {
            ally: [
                "All clear on this stretch of the road, Commander. Smooth passage ahead.",
                "We chased off roaming bandits at dawn. The road is clear for your march.",
                "The night watch was uneventful, General. Just a stray dog and some thick fog.",
                "We have the eastern gate secured. Your supply wagons may pass freely today.",
                "The magistrate sends his compliments to your command, General. He is pleased.",
                "No sign of enemy scouts on this patrol today. Quiet as a temple at midday.",
                "The locals are cooperative this week. No complaints about your camp.",
                "We found abandoned goods on the north road earlier. Probably fled bandits.",
                "The city garrison is fully staffed. We await your inspection if you wish it.",
                "Our last patrol turned up nothing. The roads are clear for another two leagues.",
                "We updated the stone markers near the marsh crossing last night, General.",
                "The watchtower at the hilltop reports clear visibility in all four directions.",
                "Routine sweep complete, Commander. All boundaries and posts are intact.",
                "We arrested two suspected spies yesterday. They are with the interrogators now.",
                "Safe travels ahead, sir. We will keep watch on your rear as you advance.",
                "The road south was swept at first light. No trouble whatsoever, Commander.",
            ],
            enemy: [
                "Your presence in this district has been noted and formally reported, General.",
                "We carry a warrant to search suspicious convoys. And yours looks suspicious to us.",
                "State your name, your origin, and your purpose here. You are under close observation.",
                "There are outstanding complaints about your unit's conduct further east of here.",
                "The local magistrate was informed of your entry into this district immediately.",
                "We know every face on our current wanted notices. Yours seems... familiar, General.",
                "You are required to surrender your weapons at the outer gate. No exceptions are made.",
                "We keep detailed records of every armed group passing our lord's roads. Every one.",
                "Your travel papers are not recognized in this jurisdiction, General.",
                "The law does not bend for rank here. We answer only to our own magistrate.",
                "You have walked into a district under martial lockdown. That was a mistake.",
                "Your column has been counted and catalogued since the first watchtower.",
                "Our Captain will be very interested in speaking with a group of your character.",
                "Leave this district by nightfall, or you will be escorted out by force. Your choice.",
                "We've had three serious incidents in this sector involving your faction. No more.",
                "The road ahead is sealed by order of the local magistrate. You must turn back.",
                "You have been flagged at two previous checkpoints already. This is your final warning.",
                "We do not need soldiers bringing their wars into our lord's lands. Move on.",
                "Unannounced armed groups require special district permits here. You carry none.",
                "I would advise your column to keep moving. Stopping only draws further scrutiny.",
            ],
            neutral: [
                "State your business and destination for the road ledger, please.",
                "How many are in your party, General? We are required to log all armed groups.",
                "Do you carry a valid travel permit for this district?",
                "There is a road toll at the bridge ahead. Your quartermaster should be informed.",
                "We enforce the local magistrate's decrees here. Your rank is noted but secondary.",
                "Curfew falls at the second watch. See that your men are camped before then.",
                "We are conducting a routine sweep. Please keep your weapons sheathed, General.",
                "Do you carry any taxable goods in your wagons? We are required to ask.",
                "No foraging within a li of the city walls. A standard local ordinance, General.",
                "We are neutral arbiters of the peace here. All must abide by the same rules.",
                "The main gate closes at dusk. If you need entry after dark, speak to the captain.",
                "Any disturbances in the market quarter carry heavy fines. Your men should know.",
                "We have received complaints from local residents. Keep your soldiers on the road.",
                "Anything to declare at this checkpoint, General?",
                "Movement after curfew requires a lantern pass. The prefect's office issues them.",
                "We ask only that the peace be kept while you are in this district, nothing more.",
                "There is an inspection fee for armed convoys crossing this region. Standard practice.",
                "The laws of this district apply to all equally, regardless of one's lord's banner.",
                "Move along when you are ready, General. Do not block the road for other travelers.",
                "Your horses are not permitted inside the inner walls. The stables are to the east.",
            ]
        }
    };

    // ========================================================================
    // POOL RESOLUTION — pick the right sub-pool based on context
    // ========================================================================

    function classifyNPC(context) {
        const role    = (context.npcType   || "").toLowerCase();
        const faction = (context.faction   || "");
        return {
            isBandit:   faction === "Bandits" || role === "bandit",
            isCivilian: role === "civilian",
            isCommerce: role === "commerce",
            isMilitary: role === "military",
            isPatrol:   role === "patrol",
        };
    }

    function resolveGeneralPool(context) {
        const cls = classifyNPC(context);
        const { isEnemy, isAlly } = context;
        const { playerDominates, npcDominates } = getOdds(context);

        if (cls.isBandit)   return playerDominates
                                ? GENERAL.bandit.outnumbered
                                : GENERAL.bandit.confident;

        if (cls.isCivilian) {
            if (isEnemy || npcDominates) return GENERAL.civilian.fearful;
            if (isAlly  || playerDominates) return GENERAL.civilian.friendly;
            return GENERAL.civilian.neutral;
        }

        if (cls.isCommerce) {
            if (isEnemy || npcDominates) return GENERAL.commerce.fearful;
            if (isAlly  || playerDominates) return GENERAL.commerce.friendly;
            return GENERAL.commerce.neutral;
        }

        if (cls.isMilitary) {
            if (isEnemy) return GENERAL.military.enemy;
            if (isAlly)  return GENERAL.military.ally;
            return GENERAL.military.neutral;
        }

        if (cls.isPatrol) {
            if (isEnemy) return GENERAL.patrol.enemy;
            if (isAlly)  return GENERAL.patrol.ally;
            return GENERAL.patrol.neutral;
        }

        // Fallback: treat as neutral civilian
        return GENERAL.civilian.neutral;
    }

    function resolveHelloPool(context) {
        const cls = classifyNPC(context);
        const { isEnemy, isAlly } = context;
        const { playerDominates } = getOdds(context);

        if (cls.isBandit)   return playerDominates
                                ? HELLO.bandit.outnumbered
                                : HELLO.bandit.confident;

        if (cls.isCivilian) {
            if (isAlly || playerDominates) return HELLO.civilian.friendly;
            if (isEnemy)                   return HELLO.civilian.fearful;
            return HELLO.civilian.neutral;
        }

        if (cls.isCommerce) {
            if (isEnemy)     return HELLO.commerce.fearful;
            if (isAlly || playerDominates) return HELLO.commerce.friendly;
            return HELLO.commerce.neutral;
        }

        if (cls.isMilitary) {
            if (isEnemy) return HELLO.military.enemy;
            if (isAlly)  return HELLO.military.ally;
            return HELLO.military.neutral;
        }

        if (cls.isPatrol) {
            if (isEnemy) return HELLO.patrol.enemy;
            if (isAlly)  return HELLO.patrol.ally;
            return HELLO.patrol.neutral;
        }

        // Fallback
        return HELLO.civilian.neutral;
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    return {
        /**
         * Called by the "What's on your mind?" / RANDOM button.
         * Returns a fresh contextual line — never echoes the previous one.
         * @param {object} context  - see file header for shape
         * @param {object} npcRef   - the NPC entity object (used as WeakMap key)
         */
        generate: function (context, npcRef) {
            const pool = resolveGeneralPool(context);
            return pickFresh(pool, npcRef);
        },

        /**
         * Called by the "Hello" button.
         * Returns a shorter, greeting-style line distinct from the general pool.
         * @param {object} context  - see file header for shape
         * @param {object} npcRef   - the NPC entity object (used as WeakMap key)
         */
        generateHello: function (context, npcRef) {
            const pool = resolveHelloPool(context);
            return pickFresh(pool, npcRef);
        },

        /**
         * No-op kept for API compatibility.
         * State is now per-NPC via WeakMap rather than a shared session variable.
         */
        resetSession: function () {
            // Intentionally empty — the WeakMap cleans itself up with GC.
        }
    };
})();


// ============================================================================
// PARLER_SYSTEM.JS  —  HELLO INTEGRATION PATCH
// ============================================================================
// The HELLO button in parler_system.js calls generateNPCDialogue(npc, "Hello")
// which returns a single hardcoded string. Paste the block below over that
// function (lines ~50–76 of parler_system.js) to route it through the new
// RandomDialogue.generateHello pool instead.
//
//   function generateNPCDialogue(npc, choice) {
//       if (choice !== "Hello") return "...";
//       const isEnemy = player.enemies && player.enemies.includes(npc.faction);
//       const isAlly  = npc.faction === player.faction;
//       return RandomDialogue.generateHello({
//           faction:       npc.faction,
//           playerFaction: player.faction,
//           playerNumbers: player.troops || 0,
//           npcNumbers:    npc.count    || 0,
//           npcType:       npc.role,
//           isEnemy,
//           isAlly
//       }, npc);
//   }
//
// No other changes to parler_system.js are required.
// ============================================================================