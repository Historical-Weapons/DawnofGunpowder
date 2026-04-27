// ============================================================================
// DAWN OF GUNPOWDER — MEDIEVAL ASIAN ENCAMPMENT SYSTEM  v2.0
// camp_system.js  |  Full rewrite — all bugs fixed, ambush system, expanded camps
//
//  TIERS:
//    1 (0-20 troops)   → Ragtag bandit tents, no walls
//    2 (21-100 troops) → Military scout camp, wagons & towers, no walls
//    3 (100+ troops)   → Full military fortress camp with rounded palisade
//
//  FIXES IN THIS VERSION:
//    • update.js overworld loop no longer fights camp movement (see update.js patch)
//    • Troop timer properly initialized — troops actually walk around
//    • Troop speed increased from 0.55 → 1.4 px/frame (visible movement)
//    • Dialogue uses stable ID references (not array indices that shift after filter)
//    • drawInfantryUnit null-safety fully verified, fallback always rendered
//    • Ambush system: 20% chance every 60s — bandits spawn IN the camp
//    • Troops actively fight bandits; player auto-attacks nearby
//    • Greatly expanded camp content for all 3 tiers
// ============================================================================

(function () {
"use strict";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const CAMP_W          = 1800;
const CAMP_H          = 1800;
const CAMP_CX         = 700;
const CAMP_CY         = 700;
const CAMP_TILE       = 8;
const VIS_RADIUS      = 900;
const PAL_RADIUS      = 460;
const PAL_THICK       = 20;
const MAX_TROOPS      = 40;
const COHESION_RATE   = 0.25;
const FORAGE_RATE     = 0.02;
const TROOP_SPEED     = 0.4;      // px per frame — was 0.55, now actually visible
const AMBUSH_INTERVAL = 5.0;     // seconds between ambush rolls
const AMBUSH_CHANCE   = 0.09;     //  each interval

// Tile ids
const T_GND  = 0;
const T_PATH = 1;
const T_TENT = 2;
const T_FIRE = 3;
const T_PAL  = 4;
const T_DECO = 5;
const T_TREE = 6;

// ─── GLOBAL STATE ────────────────────────────────────────────────────────────
window.inCampMode = false;

let CE = {
    tier:     1,
    faction:  "Hong Dynasty",
    colors:   {},
    troopColor: "#8b0000",
    tents:    [],
    fires:    [],
    decos:    [],
    guards:   [],
    bgCanvas: null,
    troops:   [],
    dialogues:[],
    packingUp:false,
    packProg: 0,
    entering: false,
    enterProg:0,
    campTime: 0,
    cohGain:  0,
    foraged:  0,
    forageTimer: 0,
    cohTimer: 0,
    stars:    [],
    savedCamX:0, savedCamY:0,
    camX:CAMP_CX, camY:CAMP_CY,
    savedWorldX: 0, savedWorldY: 0,
    // Ambush
    ambushTimer:        0,
    ambushActive:       false,
    ambushUnits:        [],
    ambushAlertAlpha:   0,
    ambushVictoryTimer: 0,
    _nextDialogueId:    1,
	
	 combatDialogueMode: false,   // true during ambush
};
  window._CAMP_CE = CE;   // COMBAT ADDON: exposes state 
  
// ─── COHESION SYSTEM ─────────────────────────────────────────────────────────
window.campInitCohesion = function () {
    if (typeof player !== "undefined" && player.cohesion === undefined) {
        player.cohesion = 70;
    }
};

function cohLabel(v) {
    if (v >= 90) return { t:"UNBREAKABLE", c:"#00e676" };
    if (v >= 70) return { t:"STRONG",      c:"#8bc34a" };
    if (v >= 50) return { t:"STEADY",      c:"#ffca28" };
    if (v >= 30) return { t:"WAVERING",    c:"#ff9800" };
    if (v >= 15) return { t:"CRUMBLING",   c:"#ff5252" };
    return             { t:"BROKEN",       c:"#d50000" };
}

window.campApplyBattleOutcome = function (won) {
    if (typeof player === "undefined") return;
    if (player.cohesion === undefined) player.cohesion = 70;
    if (won) {
        player.cohesion = Math.min(100, player.cohesion + 8);
        _logEvent("Victory boosts cohesion.");
    } else {
        player.cohesion = Math.max(0, player.cohesion - 15);
        _logEvent("Defeat saps cohesion.");
    }
};

function _logEvent(msg) {
    if (typeof logEvent === "function") logEvent(msg);
    else console.log("[Camp]", msg);
}

window.campCohesionDesertionFactor = function () {
    if (typeof player === "undefined" || player.cohesion === undefined) return 1;
    if (player.cohesion < 15)  return 4.0;
    if (player.cohesion < 30)  return 2.5;
    if (player.cohesion < 50)  return 1.5;
    return 1.0;
};

// ─── FACTION COLOUR HELPER ───────────────────────────────────────────────────
function getFactionColors(fName) {
    const arch = (typeof ARCHITECTURE !== "undefined" && ARCHITECTURE[fName])
                 ? ARCHITECTURE[fName]
                 : { roofs:["#8b0000","#7a1a1a"], walls:["#d3c5b4","#968878"],
                     ground:"#4a5e30", road:"#7a7a6a", trees:["#2e4a1f"] };
    return {
        primary:   Array.isArray(arch.roofs) ? arch.roofs[0]  : arch.roofs,
        secondary: Array.isArray(arch.roofs) ? (arch.roofs[1]||arch.roofs[0]) : arch.roofs,
        accent:    Array.isArray(arch.walls) ? arch.walls[0]  : arch.walls,
        trim:      Array.isArray(arch.walls) ? (arch.walls[1]||arch.walls[0]) : arch.walls,
        ground:    arch.ground  || "#4a5e30",
        road:      arch.road    || "#7a7a6a",
        treeA:     Array.isArray(arch.trees) ? arch.trees[0]  : (arch.trees||"#2e4a1f"),
        treeB:     Array.isArray(arch.trees) ? (arch.trees[1]||arch.trees[0]) : (arch.trees||"#3a5f27"),
    };
}

// ─── EXPANDED DIALOGUE DATA ───────────────────────────────────────────────────
const CAMP_TALKS = [
    // -- Campfire mood --
    [ "My legs are still from the march.",
      "Mine creak like old cart wheels.",
      "Rest them well. We move again at dawn.",
      "Dawn comes too quickly in this country." ],
    [ "This fire is a fine thing after a cold road.",
      "Aye. Nothing kills a soldier faster than wet boots.",
      "We have food at least.",
      "Let us be grateful for small graces." ],
    [ "You see how the captain chose this ground?",
      "Good sight lines on three sides.",
      "He is cautious for a man of his rank.",
      "That caution is why he still draws breath." ],
    [ "How long have you been in this company?",
      "Three seasons now. Feels longer.",
      "It always does.",
      "Does it ever feel shorter?",
      "Only when there is too much fighting to count the days." ],
    // -- Food / hunger --
    [ "Any rations left?",
      "Hard tack and a bit of dried fish.",
      "Better than bark soup.",
      "I have had bark soup. You are not wrong." ],
    [ "I found mushrooms near the treeline.",
      "Are you sure they are not poison?",
      "I am reasonably sure.",
      "That is not the confidence I was hoping for.",
      "Eat half and watch what happens to you first." ],
    [ "The cook burned the rice again.",
      "He burns everything. I think it is deliberate.",
      "Who would deliberately burn rice?",
      "A man who does not wish to cook next time." ],
    [ "I could eat a whole ox right now.",
      "You say that every night.",
      "Every night I mean it.",
      "One day we will eat well again.",
      "I will believe it when I see the ox." ],
    // -- Homesickness --
    [ "My village should be harvesting rice this month.",
      "You think of home often?",
      "Every morning when I wake in this cold.",
      "Home will still be there when this is over.",
      "If we are there to see it." ],
    [ "My daughter would be walking by now.",
      "First or second?",
      "Second. I have not yet met her.",
      "...",
      "We will get back. I believe that.",
      "Thank you." ],
    [ "Do you remember the smell of your mother's cooking?",
      "Every time I smell this smoke I remember it.",
      "That is a cruel trick of the mind.",
      "Or a kindness. Depends on how hungry I am." ],
    // -- Camp humour --
    [ "Why does Chen always get the softest sleeping patch?",
      "He arrives first and pretends to be asleep.",
      "Cunning.",
      "He would make a fine diplomat." ],
    [ "The sergeant snores like a war drum.",
      "I have learned to sleep through it.",
      "You have my admiration.",
      "Also I sleep downwind." ],
    [ "Someone stole my boot again.",
      "Which one?",
      "The left one. Always the left one.",
      "Whoever steals half a pair of boots is a philosophical man.",
      "He is a dead man when I find him." ],
    [ "I lost three dice in the river crossing.",
      "How do you lose dice in a river?",
      "With great skill and misfortune.",
      "Did you at least win before you lost them?",
      "I have never won in my life." ],
    // -- Tactical musing --
    [ "Did you see the enemy banner yesterday?",
      "Red and black. Goryun markings.",
      "Far from home.",
      "War drags everyone far from home.",
      "Especially the dead." ],
    [ "Do you think we will fight tomorrow?",
      "The scouts have not returned. That is either good or very bad.",
      "In my experience it is usually the second.",
      "Let us hope you are wrong for once." ],
    [ "I heard the commander plans a flanking move at dawn.",
      "Where did you hear that?",
      "The cook told me.",
      "The cook burns the rice and knows battle strategy?",
      "He has hidden depths." ],
    [ "If I were general I would attack from the north.",
      "And if you were general we would all be dead.",
      "What a kind thing to say.",
      "I have always prized honesty over comfort." ],
    // -- Veteran wisdom --
    [ "My first campaign I was terrified every hour.",
      "And now?",
      "Only every third hour.",
      "Improvement.",
      "Hard-won improvement." ],
    [ "Keep your blade oiled in this weather.",
      "Rust is a man's worst enemy in the field.",
      "I thought the enemy was the worst enemy.",
      "The enemy is the second worst enemy.",
      "I will remember that." ],
    [ "A tired soldier who rests is worth two fresh men tomorrow.",
      "That sounds like something an officer says.",
      "My father said it. He was not an officer.",
      "Was he a soldier?",
      "He was a farmer. But he was very tired." ],
    // -- Watchfulness --
    [ "Did you hear that sound?",
      "Which sound?",
      "From the treeline. Like a branch snapping.",
      "Probably a deer.",
      "Probably.",
      "Keep watching." ],
    [ "I do not like this camp's position.",
      "You never like any camp's position.",
      "And I have never been ambushed.",
      "Fair point. What do you dislike about this one?",
      "Too many shadows near that ridge." ],
    // -- Short banter --
    [ "You take the watch first.",
      "I took it last time.",
      "So you are experienced at it." ],
    [ "Pass the water.",
      "This is the last of it.",
      "Then we should both drink less." ],
    [ "Stop poking the fire.",
      "I am keeping it lit.",
      "You are wasting wood.",
      "I am keeping us warm.",
      "There is a difference." ],
    [ "Do you play wei qi?",
      "A little. Do you?",
      "Badly. But I have stones.",
      "In that case let us play. I enjoy winning." ],
    // -- Weapons maintenance --
    [ "Your bow string looks frayed.",
      "It will hold another day.",
      "It will not hold another battle.",
      "Then I will get a new string after the battle.",
      "That is optimistic." ],
    [ "I have been sharpening this blade for an hour.",
      "Is it sharp enough?",
      "I can shave a feather with it now.",
      "Can you also fight with it?",
      "That I have not tested." ],
    // -- Philosophy --
    [ "Do you think we chose this life?",
      "I think fate chose it and we followed.",
      "That sounds like avoiding the answer.",
      "Perhaps all answers about fate are avoidances.",
      "Now you sound like a monk.",
      "I was a monk. Briefly." ],
    [ "What do you think happens after death?",
      "I try not to think about it while I am near it.",
      "Wise.",
      "Practical.",
      "Same thing." ],
    // -- Local curiosity --
    [ "Have you ever been this far east before?",
      "Never. The trees are different here.",
      "Everything is different here.",
      "Is that good or bad?",
      "It is interesting. Interesting keeps you awake on watch." ],
    [ "The locals look at us strangely.",
      "We are strangers carrying swords.",
      "Fair enough.",
      "In their position I would look the same way.",
      "I would run." ],
	  
	  // -- Weather / environment --
[ "The wind cuts deeper tonight.",
  "It comes off the hills like a blade.",
  "Pull your cloak tighter.",
  "I already have." ],
[ "Rain again.",
  "At least it hides our tracks.",
  "And soaks everything we own.",
  "War is rarely dry." ],
[ "The ground is too soft here.",
  "Better soft than stone when you sleep.",
  "Tell that to my back.",
  "Your back complains regardless." ],

// -- Morale --
[ "The men seem quieter tonight.",
  "They are thinking about tomorrow.",
  "That never helps.",
  "No. But it is hard not to." ],
[ "You ever notice how laughter fades before a battle?",
  "It always comes back after.",
  "Assuming there are enough left to laugh.",
  "...",
  "There will be." ],
[ "Spirits are low.",
  "Then raise them.",
  "With what?",
  "Food, fire, and lies about easy victories." ],

// -- Night watch --
[ "The stars are clear tonight.",
  "Good for seeing silhouettes.",
  "Bad for hiding them.",
  "Exactly." ],
[ "How long until my watch ends?",
  "Long enough for you to regret asking.",
  "That long, then.",
  "That long." ],
[ "Stay awake.",
  "I am awake.",
  "You were dreaming just now.",
  "I was thinking with my eyes closed." ],

// -- Gear / marching --
[ "My pack feels heavier each day.",
  "You keep putting things in it.",
  "I take nothing out.",
  "That is your mistake." ],
[ "These straps are digging into my shoulders.",
  "Wrap them with cloth.",
  "And lose the little comfort I have?",
  "Lose pain, gain comfort." ],
[ "Boots holding?",
  "Barely.",
  "They only need to last until the next pair.",
  "Which is never." ],

// -- Fear / honesty --
[ "Are you afraid?",
  "Yes.",
  "Good. It keeps you careful.",
  "Does it ever go away?",
  "No. You just learn to walk with it." ],
[ "I had a bad feeling all day.",
  "You always have a bad feeling.",
  "One day I will be right.",
  "That is what worries me." ],

// -- Rumors --
[ "I heard reinforcements are coming.",
  "From where?",
  "No one knows.",
  "Convenient.",
  "Still, it is something to hope for." ],
[ "They say the enemy has elephants.",
  "They always say that.",
  "And sometimes it is true.",
  "Then let us hope this is not one of those times." ],

// -- Injuries --
[ "That cut looks worse than yesterday.",
  "It feels worse.",
  "You should see the healer.",
  "He will just tell me to rest.",
  "Then rest." ],
[ "My arm is still numb.",
  "From the shield blow?",
  "Yes.",
  "Better numb than broken.",
  "Small comforts again." ],

// -- Leadership --
[ "Do you trust the captain?",
  "I trust that he wants to live.",
  "And that helps us how?",
  "It means he will not waste us lightly." ],
[ "The orders today were strange.",
  "Strange kept us alive.",
  "So far.",
  "So far is enough." ],

// -- Passing time --
[ "How many days has it been?",
  "I stopped counting.",
  "That bad?",
  "That long." ],
[ "We should mark the days somehow.",
  "With what?",
  "Notches on a stick.",
  "We would run out of sticks." ],

// -- Quiet reflection --
[ "Listen to the fire.",
  "It sounds almost peaceful.",
  "Almost.",
  "If you forget where you are." ],
[ "Moments like this feel unreal.",
  "Because they are rare.",
  "Or because they do not last.",
  "Both." ]
  
];

// ─── LAZY CANVAS REFS ────────────────────────────────────────────────────────
let _cvs = null, _ctx2 = null;
function _gc() {
    if (!_cvs) _cvs = document.getElementById("gameCanvas");
    if (!_ctx2 && _cvs) _ctx2 = _cvs.getContext("2d");
    return { c: _cvs, x: _ctx2 };
}

// ─── COLOUR HELPERS ──────────────────────────────────────────────────────────
function lerpc(a, b, t) {
    if (!a || !b || a.length < 7 || b.length < 7) return a || b || "#888";
    const ah = parseInt(a.slice(1), 16);
    const bh = parseInt(b.slice(1), 16);
    const ar = (ah >> 16), ag = (ah >> 8) & 0xff, ab = ah & 0xff;
    const br = (bh >> 16), bg = (bh >> 8) & 0xff, bb = bh & 0xff;
    const rr = Math.max(0,Math.min(255,Math.round(ar + (br - ar) * t)));
    const rg = Math.max(0,Math.min(255,Math.round(ag + (bg - ag) * t)));
    const rb = Math.max(0,Math.min(255,Math.round(ab + (bb - ab) * t)));
    return `#${rr.toString(16).padStart(2,"0")}${rg.toString(16).padStart(2,"0")}${rb.toString(16).padStart(2,"0")}`;
}

// ─── PIXEL ART DRAWING FUNCTIONS ─────────────────────────────────────────────

/** Bandit lean-to tent — tier 1, rough rag style */
function _drawBanditTent(ctx, x, y, col) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(2, 4, 18, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = lerpc(col, "#111", 0.55);
    ctx.beginPath(); ctx.moveTo(-14,0); ctx.lineTo(-4,-22); ctx.lineTo(6,-18); ctx.lineTo(4,0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = lerpc(col, "#3e2e1a", 0.45);
    ctx.beginPath(); ctx.moveTo(-14,0); ctx.lineTo(-4,-22); ctx.lineTo(14,-16); ctx.lineTo(16,0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.28)"; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(-4,-22); ctx.lineTo(2,-4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4,-22); ctx.lineTo(9,-8); ctx.stroke();
    ctx.fillStyle = lerpc(col, "#000", 0.35); ctx.fillRect(0,-14,6,5);
    ctx.fillStyle = lerpc(col, "#7a5c3a", 0.3); ctx.fillRect(-10,-8,5,4);
    ctx.strokeStyle = "#6b5840"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-4,-22); ctx.lineTo(-18,0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4,-22); ctx.lineTo(20,-2); ctx.stroke();
    ctx.strokeStyle = "#4e3520"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-4,0); ctx.lineTo(-4,-24); ctx.stroke();
    ctx.fillStyle = "#8b6914"; ctx.beginPath(); ctx.arc(-4,-24,2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.beginPath(); ctx.moveTo(8,0); ctx.lineTo(16,0); ctx.lineTo(13,-8); ctx.lineTo(7,-5); ctx.closePath(); ctx.fill();
    ctx.restore();
}

/** Military scout tent — tier 2, A-frame ridge style */
function _drawScoutTent(ctx, x, y, col) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.ellipse(2,5,26,9,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = lerpc(col,"#222",0.5);
    ctx.beginPath(); ctx.moveTo(-20,2); ctx.lineTo(0,-28); ctx.lineTo(20,2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = lerpc(col,"#1a1a1a",0.38);
    ctx.beginPath(); ctx.moveTo(-20,2); ctx.lineTo(0,-28); ctx.lineTo(0,2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = lerpc(col,"#fff",0.08);
    ctx.beginPath(); ctx.moveTo(0,-28); ctx.lineTo(20,2); ctx.lineTo(0,2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = lerpc(col,"#fff",0.25); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0,-28); ctx.lineTo(0,2); ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 0.6;
    for (let i = -14; i <= 14; i += 7) { ctx.beginPath(); ctx.moveTo(0,-28); ctx.lineTo(i,2); ctx.stroke(); }
    ctx.strokeStyle = "#6b5840"; ctx.lineWidth = 0.8;
    [[-20,2],[20,2],[-10,2],[10,2]].forEach(([ax,ay]) => {
        ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(ax+(ax<0?-8:8),ay+6); ctx.stroke();
        ctx.fillStyle = "#5d4037"; ctx.fillRect(ax+(ax<0?-9:7),ay+4,2,4);
    });
    ctx.strokeStyle = "#3e2a18"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-2,-28); ctx.lineTo(-2,38); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(-2,-28); ctx.lineTo(10,-22); ctx.lineTo(-2,-16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = lerpc(col,"#111",0.6);
    ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(12,-5); ctx.lineTo(12,2); ctx.lineTo(0,2); ctx.closePath(); ctx.fill();
    ctx.restore();
}

/** Military garrison tent — tier 3, large rectangular ridge */
function _drawGarrisonTent(ctx, x, y, col) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(2,6,32,11,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = lerpc(col,"#0a0a0a",0.55); ctx.fillRect(-26,-28,52,8);
    ctx.fillStyle = lerpc(col,"#181818",0.4);
    ctx.beginPath(); ctx.moveTo(-26,-20); ctx.lineTo(-26,-28); ctx.lineTo(26,-28); ctx.lineTo(26,-20); ctx.lineTo(22,4); ctx.lineTo(-22,4); ctx.closePath(); ctx.fill();
    const rg = ctx.createLinearGradient(-26,-34,26,-28);
    rg.addColorStop(0, lerpc(col,"#fff",0.15)); rg.addColorStop(1, lerpc(col,"#000",0.3));
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.moveTo(-26,-28); ctx.lineTo(0,-36); ctx.lineTo(26,-28); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = lerpc(col,"#fff",0.3); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0,-36); ctx.lineTo(0,4); ctx.stroke();
    ctx.strokeStyle = lerpc(col,"#ffca28",0.5); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-26,-28); ctx.lineTo(26,-28); ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 0.7;
    for (let i = -18; i <= 18; i += 9) { ctx.beginPath(); ctx.moveTo(i,-28); ctx.lineTo(i*0.85,4); ctx.stroke(); }
    [[-26,-20],[26,-20]].forEach(([px,py]) => {
        ctx.strokeStyle="#3e2a18"; ctx.lineWidth=2.5;
        ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px,py+24); ctx.stroke();
    });
    ctx.fillStyle = lerpc(col,"#fff",0.35);
    ctx.beginPath(); ctx.arc(0,-14,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = lerpc(col,"#000",0.5);
    ctx.beginPath(); ctx.arc(0,-14,3,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = lerpc(col,"#ffca28",0.4); ctx.lineWidth = 1;
    for (let fx = -22; fx <= 22; fx += 5) { ctx.beginPath(); ctx.moveTo(fx,4); ctx.lineTo(fx+2,9); ctx.stroke(); }
    ctx.fillStyle = lerpc(col,"#000",0.7);
    ctx.beginPath(); ctx.moveTo(-8,-20); ctx.lineTo(8,-20); ctx.lineTo(8,4); ctx.lineTo(-8,4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#3e2a18"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0,-36); ctx.lineTo(0,-48); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0,-48); ctx.lineTo(14,-43); ctx.lineTo(0,-38); ctx.closePath(); ctx.fill();
    ctx.restore();
}

/** Commander's pavilion tent — tier 3 center */
function _drawCommanderTent(ctx, x, y, col) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.ellipse(3,8,52,16,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "#4a3828"; ctx.fillRect(-42,6,84,6);
    ctx.fillStyle = "#5d4a38"; ctx.fillRect(-40,4,80,4);
    ctx.fillStyle = lerpc(col,"#111",0.52);
    ctx.beginPath(); ctx.moveTo(-40,4); ctx.lineTo(-40,-30); ctx.lineTo(40,-30); ctx.lineTo(40,4); ctx.lineTo(36,8); ctx.lineTo(-36,8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = lerpc(col,"#111",0.35);
    ctx.beginPath(); ctx.moveTo(-40,-30); ctx.lineTo(-50,-32); ctx.lineTo(-2,-48); ctx.lineTo(-2,-30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = lerpc(col,"#fff",0.06);
    ctx.beginPath(); ctx.moveTo(40,-30); ctx.lineTo(50,-32); ctx.lineTo(2,-48); ctx.lineTo(2,-30); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = lerpc(col,"#ffca28",0.55); ctx.lineWidth = 2;
    [[-40,-30],[-50,-32],[50,-32],[40,-30]].forEach(([ex,ey]) => {
        ctx.beginPath(); ctx.moveTo(ex,ey); ctx.quadraticCurveTo(ex+(ex<0?-8:8),ey-4,ex+(ex<0?-4:4),ey-10); ctx.stroke();
        ctx.fillStyle = "#ffca28"; ctx.beginPath(); ctx.arc(ex+(ex<0?-4:4),ey-11,3,0,Math.PI*2); ctx.fill();
    });
    ctx.strokeStyle = lerpc(col,"#ffca28",0.5); ctx.lineWidth = 1.5;
    ctx.strokeRect(-38,-30,76,36);
    ctx.fillStyle = lerpc(col,"#ffca28",0.25); ctx.fillRect(-38,-16,76,4);
    ctx.fillStyle = "#ffca28"; ctx.font = "bold 8px serif"; ctx.textAlign = "center";
    ctx.fillText("令", 0, -10);
    ctx.strokeStyle = "#3e2a18"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0,-48); ctx.lineTo(0,-72); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0,-72); ctx.lineTo(22,-64); ctx.lineTo(0,-56); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ffca28"; ctx.font = "bold 7px serif"; ctx.fillText("令", 9, -62);
    [[-38,-8],[38,-8],[-38,-22],[38,-22]].forEach(([lx,ly]) => {
        ctx.fillStyle = "#3e2a00"; ctx.fillRect(lx-4,ly-6,8,10);
        ctx.fillStyle = "rgba(255,200,50,0.7)"; ctx.fillRect(lx-3,ly-5,6,8);
        ctx.strokeStyle = col; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(lx,ly+4); ctx.lineTo(lx-2,ly+10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(lx,ly+4); ctx.lineTo(lx+2,ly+10); ctx.stroke();
    });
    [[-14,8],[14,8]].forEach(([px,py]) => {
        ctx.fillStyle = "#4e3820"; ctx.fillRect(px-3,-30,6,42);
        ctx.fillStyle = "#ffca28"; ctx.fillRect(px-3,-30,6,3); ctx.fillRect(px-3,py,6,3);
    });
    ctx.fillStyle = lerpc(col,"#000",0.7); ctx.fillRect(-11,-28,22,36);
    ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0,-28); ctx.lineTo(0,8); ctx.stroke();
    ctx.restore();
}

/** Medical tent — small with red cross banner */
function _drawMedicalTent(ctx, x, y, col) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(0,3,22,8,0,0,Math.PI*2); ctx.fill();
    // Body — off-white canvas
    ctx.fillStyle = lerpc("#e8dcc8","#aaa",0.1);
    ctx.beginPath(); ctx.moveTo(-18,4); ctx.lineTo(0,-24); ctx.lineTo(18,4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#555"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-18,4); ctx.lineTo(0,-24); ctx.lineTo(18,4); ctx.stroke();
    // Red cross on face
    ctx.fillStyle = "#e53935";
    ctx.fillRect(-2,-18,4,12); ctx.fillRect(-6,-12,12,4);
    // Ridge pole
    ctx.strokeStyle = "#3e2a18"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0,-24); ctx.lineTo(0,4); ctx.stroke();
    // Lantern at peak
    ctx.fillStyle = "#ffca28"; ctx.beginPath(); ctx.arc(0,-26,2.5,0,Math.PI*2); ctx.fill();
    ctx.restore();
}

/** Campfire stone ring (static) */
function _drawFireRing(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath(); ctx.ellipse(0,3,11,6,0,0,Math.PI*2); ctx.fill();
    const stones = [{a:0,r:9,w:6,h:4},{a:0.6,r:9,w:5,h:4},{a:1.3,r:9,w:7,h:4},
                    {a:2.1,r:9,w:6,h:4},{a:2.8,r:9,w:5,h:4},{a:3.6,r:9,w:6,h:4},
                    {a:4.5,r:9,w:5,h:4},{a:5.3,r:9,w:7,h:4}];
    stones.forEach(s => {
        const sx = Math.cos(s.a)*s.r, sy = Math.sin(s.a)*s.r*0.5;
        ctx.fillStyle = "#4a4a4a"; ctx.beginPath(); ctx.ellipse(sx,sy+2,s.w*0.5,s.h*0.5,s.a,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = "#5e5e5e"; ctx.beginPath(); ctx.ellipse(sx-0.5,sy+1,s.w*0.4,s.h*0.35,s.a,0,Math.PI*2); ctx.fill();
    });
    ctx.strokeStyle = "#3d1a00"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-7,2); ctx.lineTo(7,-1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-5,-2); ctx.lineTo(6,3); ctx.stroke();
    ctx.restore();
}

/** Animated campfire flames — called every frame */
function _drawAnimatedFire(ctx, x, y, scale) {
    const sc = scale || 1;
    const t = Date.now() * 0.001;

    // 1. Fire Animation Math
    const f1 = Math.sin(t * 7.3) * 0.2 + Math.sin(t * 12.1) * 0.15;
    const f2 = Math.sin(t * 5.7 + 1.0) * 0.25 + Math.sin(t * 9.9) * 0.1;
    const f3 = Math.sin(t * 4.2 + 2.3) * 0.2;

    ctx.save(); 
    ctx.translate(x, y); 
    ctx.scale(sc, sc);

    // 2. LIGHT RING (The Glow on the Ground)
    const flicker = Math.sin(Date.now() * 0.008) * 5; 
    const baseRadius = 80; // Adjusted for local scaling
    const finalRadius = baseRadius + flicker;

    const lightRing = ctx.createRadialGradient(0, -4, 0, 0, -4, finalRadius);
    lightRing.addColorStop(0, "rgba(255, 200, 50, 0.4)"); 
    lightRing.addColorStop(0.4, "rgba(255, 100, 0, 0.2)");
    lightRing.addColorStop(1, "rgba(255, 50, 0, 0)");

    ctx.save();
    ctx.globalCompositeOperation = "screen"; 
    ctx.fillStyle = lightRing;
    ctx.beginPath();
    ctx.arc(0, -4, finalRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. ACTUAL FIRE (The Flames)
    const fh = 16 + f1 * 4, fw = 9 + f2 * 3;
    
    // Outer Flame
    ctx.fillStyle = "#e05c00"; 
    ctx.beginPath();
    ctx.moveTo(-fw, 0); 
    ctx.quadraticCurveTo(-fw * 0.4, -fh * 0.45, f2 * 4, -fh);
    ctx.quadraticCurveTo(fw * 0.4, -fh * 0.5, fw, 0); 
    ctx.closePath(); ctx.fill();

    // Inner Flame
    const mh = fh * 0.78, mw = fw * 0.65;
    ctx.fillStyle = "#ff7c00"; ctx.beginPath();
    ctx.moveTo(-mw, -2); ctx.quadraticCurveTo(-mw * 0.3, -mh * 0.6, f3 * 3, -mh);
    ctx.quadraticCurveTo(mw * 0.3, -mh * 0.6, mw, -2); ctx.closePath(); ctx.fill();

    // Core Flame
    const ih = fh * 0.55, iw = fw * 0.42;
    ctx.fillStyle = "#ffbb00"; ctx.beginPath();
    ctx.moveTo(-iw, -3); ctx.quadraticCurveTo(-iw * 0.2, -ih * 0.7, f1 * 2, -ih);
    ctx.quadraticCurveTo(iw * 0.2, -ih * 0.7, iw, -3); ctx.closePath(); ctx.fill();

    // White Center
    ctx.fillStyle = "#ffffcc"; 
    ctx.beginPath(); 
    ctx.ellipse(0, -4, 3.5, 3, 0, 0, Math.PI * 2); 
    ctx.fill();

    // 4. SPARKS (Embers)
    for (let i = 0; i < 6; i++) {
        const et = (t * (1.8 + i * 0.4) + i * 1.1) % 1;
        const ex = Math.sin(t * (2.3 + i * 0.8) + i * 1.7) * (5 + i * 1.5);
        const ey = -6 - et * 26;
        const ea = Math.max(0, (1 - et * 1.4) * 0.9);
        ctx.globalAlpha = ea;
        ctx.fillStyle = i % 2 === 0 ? "#ff4500" : "#ffbb00";
        ctx.beginPath(); ctx.arc(ex, ey, 0.9 + i * 0.2, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
}
/** Wooden barrel */
function _drawBarrel(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "#5d3d1a"; ctx.beginPath(); ctx.ellipse(0,-10,6,4,0,0,Math.PI*2); ctx.fill();
    ctx.fillRect(-6,-14,12,18);
    ctx.fillStyle = "#7a4e28"; ctx.beginPath(); ctx.ellipse(0,4,6,4,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#2e1a08"; ctx.lineWidth = 1.5;
    [-6,-2,2].forEach(hy => { ctx.beginPath(); ctx.moveTo(-6,hy); ctx.lineTo(6,hy); ctx.stroke(); });
    ctx.strokeStyle = "#8b6914"; ctx.lineWidth = 1;
    [-8,-4,0,4].forEach(hy => { ctx.beginPath(); ctx.arc(0,hy,6.2,-Math.PI*0.8,Math.PI*0.8); ctx.stroke(); });
    ctx.restore();
}

/** Wooden supply crate */
function _drawCrate(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "#6b4c24"; ctx.fillRect(-9,-13,18,16);
    ctx.fillStyle = "#4e3518"; ctx.fillRect(-9,-16,18,4);
    ctx.strokeStyle = "#3e2a0a"; ctx.lineWidth = 1.2; ctx.strokeRect(-9,-13,18,16);
    ctx.beginPath(); ctx.moveTo(0,-13); ctx.lineTo(0,3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-9,-5); ctx.lineTo(9,-5); ctx.stroke();
    ctx.fillStyle = "#2e1a08"; ctx.fillRect(-2,-8,4,3);
    ctx.restore();
}

/** Weapon rack (spears) */
function _drawWeaponRack(ctx, x, y, col) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = "#4e3518"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-16,-8); ctx.lineTo(16,-8); ctx.stroke();
    ctx.strokeStyle = "#3e2a0a"; ctx.lineWidth = 1.5;
    [[-14,0],[14,0]].forEach(([lx,ly]) => { ctx.beginPath(); ctx.moveTo(lx,-10); ctx.lineTo(lx,ly); ctx.stroke(); });
    for (let i = -10; i <= 10; i += 5) {
        ctx.strokeStyle = "#6b4c24"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(i,2); ctx.lineTo(i+2,-30); ctx.stroke();
        ctx.fillStyle = "#9e9e9e";
        ctx.beginPath(); ctx.moveTo(i+2,-30); ctx.lineTo(i+5,-34); ctx.lineTo(i+1,-26); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
}

/** Log stump seat */
function _drawLogSeat(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "#5d3d1a"; ctx.beginPath(); ctx.ellipse(0,0,8,5,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "#7a4e28"; ctx.beginPath(); ctx.ellipse(0,-3,8,5,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#3e2a0a"; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.ellipse(0,-3,8,5,0,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle = "#6b4224"; ctx.lineWidth = 0.4;
    [2.5,4.5,6.5].forEach(r => { ctx.beginPath(); ctx.ellipse(0,-3,r,r*0.6,0,0,Math.PI*2); ctx.stroke(); });
    ctx.restore();
}

/** Single palisade post */
function _drawPalisadePost(ctx, x, y, h) {
    ctx.save(); ctx.translate(x, y);
    const ph = h || 32;
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(2,-ph+2,6,ph+6);
    const wg = ctx.createLinearGradient(-3,0,5,0);
    wg.addColorStop(0,"#5d3d1a"); wg.addColorStop(0.4,"#7a5028"); wg.addColorStop(1,"#3e2a0a");
    ctx.fillStyle = wg; ctx.fillRect(-3,-ph,6,ph+4);
    ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 0.5;
    for (let gy = -ph+3; gy < 2; gy += 5) { ctx.beginPath(); ctx.moveTo(-2,gy); ctx.lineTo(4,gy+2); ctx.stroke(); }
    ctx.fillStyle = "#3e2a0a";
    ctx.beginPath(); ctx.moveTo(-3,-ph+4); ctx.lineTo(0,-ph-6); ctx.lineTo(3,-ph+4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#8b5e30";
    ctx.beginPath(); ctx.moveTo(-1,-ph+4); ctx.lineTo(0,-ph-5); ctx.lineTo(1,-ph+4); ctx.closePath(); ctx.fill();
    ctx.restore();
}

/** Full rounded palisade wall */
function _drawPalisadeWall(ctx, cx, cy) {
    const segments = 140;
    const dA = (Math.PI * 2) / segments;
    ctx.save();
    for (let i = 0; i < segments; i++) {
        const a = i * dA;
        const px = cx + Math.cos(a) * PAL_RADIUS;
        const py = cy + Math.sin(a) * PAL_RADIUS;
        const h = 30 + ((i * 7) % 6);
        _drawPalisadePost(ctx, px, py, h);
    }
    ctx.strokeStyle = "#6b5040"; ctx.lineWidth = 1.2;
    for (const offset of [-14,-24]) {
        ctx.beginPath();
        for (let i = 0; i <= segments; i++) {
            const a = i * dA;
            const px = cx + Math.cos(a) * PAL_RADIUS;
            const py = cy + Math.sin(a) * PAL_RADIUS + offset;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
    }
    ctx.restore();
}

/** Supply awning lean-to */
function _drawSupplyAwning(ctx, x, y, col) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.beginPath(); ctx.ellipse(1,4,22,8,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = lerpc(col,"#3a2a0a",0.6);
    ctx.beginPath(); ctx.moveTo(-20,4); ctx.lineTo(-16,-14); ctx.lineTo(20,-10); ctx.lineTo(20,4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = lerpc(col,"#ffca28",0.4); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-20,4); ctx.lineTo(-16,-14); ctx.lineTo(20,-10); ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.15)"; ctx.lineWidth = 1.5;
    for (let si = -14; si <= 18; si += 5) { ctx.beginPath(); ctx.moveTo(si,-12); ctx.lineTo(si-4,4); ctx.stroke(); }
    ctx.strokeStyle = "#3e2a18"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-16,-14); ctx.lineTo(-16,8); ctx.stroke();
    ctx.restore();
}

/** Flagpole with faction banner */
function _drawFlagpole(ctx, x, y, col, tall) {
    const h = tall ? 80 : 50;
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = "#3e2a18"; ctx.lineWidth = tall ? 3 : 2;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-h); ctx.stroke();
    // Waving banner
    const wt = Date.now() * 0.001;
    const wave = Math.sin(wt * 2.2) * 4;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0,-h);
    ctx.lineTo(tall ? 28 : 18, -h + 6 + wave);
    ctx.lineTo(0, -h + 14);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = lerpc(col,"#ffca28",0.5); ctx.lineWidth = 0.5;
    ctx.stroke();
    // Base spike
    ctx.fillStyle = "#8b6914";
    ctx.beginPath(); ctx.arc(0,-h,tall?3.5:2.5,0,Math.PI*2); ctx.fill();
    // Post base
    ctx.fillStyle = "#4e3820"; ctx.fillRect(-3,-2,6,6);
    ctx.restore();
}

/** Guard watchtower — raised platform on stilts */
function _drawGuardTower(ctx, x, y, col) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(0,2,16,7,0,0,Math.PI*2); ctx.fill();
    // Stilts
    ctx.strokeStyle = "#3e2a18"; ctx.lineWidth = 3;
    [[-10,0],[10,0],[-10,0],[10,0]].forEach(([sx]) => {
        ctx.beginPath(); ctx.moveTo(sx,0); ctx.lineTo(sx,-28); ctx.stroke();
    });
    ctx.strokeStyle = "#5d3d1a"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-10,-14); ctx.lineTo(10,-14); ctx.stroke();
    // Platform floor
    ctx.fillStyle = "#6b4c24"; ctx.fillRect(-14,-36,28,8);
    ctx.strokeStyle = "#3e2a0a"; ctx.lineWidth = 1; ctx.strokeRect(-14,-36,28,8);
    // Railing
    ctx.strokeStyle = "#5d3d1a"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-14,-36); ctx.lineTo(-14,-46); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14,-36); ctx.lineTo(14,-46); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14,-46); ctx.lineTo(14,-46); ctx.stroke();
    // Roof
    ctx.fillStyle = lerpc(col,"#1a1a1a",0.45);
    ctx.beginPath(); ctx.moveTo(-16,-46); ctx.lineTo(0,-58); ctx.lineTo(16,-46); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = lerpc(col,"#ffca28",0.4); ctx.lineWidth = 1;
    ctx.stroke();
    // Lantern
    ctx.fillStyle = "rgba(255,200,60,0.8)";
    ctx.beginPath(); ctx.arc(0,-50,3,0,Math.PI*2); ctx.fill();
    ctx.restore();
}

/** Horse tethering post with 2 horses silhouettes */
function _drawHorseTether(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    // Post
    ctx.strokeStyle = "#4e3518"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-18,-18); ctx.lineTo(18,-18); ctx.stroke();
    // Horse silhouettes (left)
    ctx.fillStyle = "#3e2a18";
    // Body
    ctx.beginPath(); ctx.ellipse(-22,-8,10,6,0.2,0,Math.PI*2); ctx.fill();
    // Head
    ctx.beginPath(); ctx.ellipse(-14,-12,4,4,0,0,Math.PI*2); ctx.fill();
    // Legs
    ctx.strokeStyle = "#3e2a18"; ctx.lineWidth = 1.5;
    [[-26,-3],[-24,-3],[-20,-3],[-18,-3]].forEach(([lx,ly]) => {
        ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(lx-1,ly+8); ctx.stroke();
    });
    // Horse (right)
    ctx.fillStyle = "#5d4037";
    ctx.beginPath(); ctx.ellipse(22,-8,10,6,-0.2,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(14,-12,4,4,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#5d4037";
    [[-4+26,-3],[26-2,-3],[26+2,-3],[26+4,-3]].forEach(([lx,ly]) => {
        ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(lx+1,ly+8); ctx.stroke();
    });
    // Rope ties
    ctx.strokeStyle = "#8b6914"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-14,-16); ctx.lineTo(-10,-18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14,-16); ctx.lineTo(10,-18); ctx.stroke();
    ctx.restore();
}

/** Supply wagon with large wheels */
function _drawSupplyWagon(ctx, x, y, col) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(0,4,28,7,0,0,Math.PI*2); ctx.fill();
    // Wheels
    [[-18,0],[18,0]].forEach(([wx,wy]) => {
        ctx.strokeStyle = "#3e2a0a"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(wx,wy,10,0,Math.PI*2); ctx.stroke();
        ctx.strokeStyle = "#5d3d1a"; ctx.lineWidth = 1;
        for (let si = 0; si < 6; si++) {
            const a = (si/6)*Math.PI*2;
            ctx.beginPath(); ctx.moveTo(wx,wy); ctx.lineTo(wx+Math.cos(a)*10,wy+Math.sin(a)*10); ctx.stroke();
        }
        ctx.fillStyle = "#3e2a0a"; ctx.beginPath(); ctx.arc(wx,wy,2.5,0,Math.PI*2); ctx.fill();
    });
    // Axle
    ctx.strokeStyle = "#4e3518"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-18,0); ctx.lineTo(18,0); ctx.stroke();
    // Cargo bed
    ctx.fillStyle = "#6b4c24"; ctx.fillRect(-22,-16,44,14);
    ctx.strokeStyle = "#3e2a0a"; ctx.lineWidth = 1; ctx.strokeRect(-22,-16,44,14);
    // Slats
    ctx.strokeStyle = "#3e2a0a"; ctx.lineWidth = 0.8;
    [-11,0,11].forEach(sx => { ctx.beginPath(); ctx.moveTo(sx,-16); ctx.lineTo(sx,-2); ctx.stroke(); });
    // Covered part
    ctx.fillStyle = lerpc(col,"#2e2010",0.5);
    ctx.beginPath(); ctx.moveTo(-22,-16); ctx.lineTo(-18,-28); ctx.lineTo(18,-28); ctx.lineTo(22,-16); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = lerpc(col,"#ffca28",0.3); ctx.lineWidth = 0.8; ctx.stroke();
    // Cover stripes
    ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 1.5;
    for (let i = -16; i <= 16; i += 6) { ctx.beginPath(); ctx.moveTo(i,-28); ctx.lineTo(i+4,-16); ctx.stroke(); }
    ctx.restore();
}

/** Cooking station — tripod with hanging pot */
function _drawCookingStation(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    // Ash base
    ctx.fillStyle = "#1a1a1a"; ctx.beginPath(); ctx.ellipse(0,2,10,5,0,0,Math.PI*2); ctx.fill();
    // Tripod legs
    ctx.strokeStyle = "#4e3518"; ctx.lineWidth = 2; ctx.lineCap = "round";
    [[-10,2],[10,2],[0,3]].forEach(([bx,by]) => {
        ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(bx,by); ctx.stroke();
    });
    // Chain
    ctx.strokeStyle = "#5a5a52"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(0,-14); ctx.stroke();
    // Pot body
    ctx.fillStyle = "#2a2a2a";
    ctx.beginPath(); ctx.arc(0,-10,6,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "#383838";
    ctx.beginPath(); ctx.ellipse(0,-10,6,2.5,0,-Math.PI,0); ctx.fill();
    // Steam
    const tt = Date.now() * 0.001;
    ctx.strokeStyle = "rgba(220,220,220,0.4)"; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
        const sx = (i-1)*3, sy = -16 - (tt*12 + i*8)%18;
        ctx.beginPath(); ctx.moveTo(sx,sy+6); ctx.quadraticCurveTo(sx+3,sy+3,sx,sy); ctx.stroke();
    }
    ctx.restore();
}

/** Training dummy (straw man on post) */
function _drawTrainingDummy(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    // Post
    ctx.strokeStyle = "#4e3518"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-36); ctx.stroke();
    // Cross arm
    ctx.beginPath(); ctx.moveTo(-14,-26); ctx.lineTo(14,-26); ctx.stroke();
    // Straw body
    ctx.fillStyle = "#d4a030";
    ctx.beginPath(); ctx.ellipse(0,-20,7,10,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#7a5020"; ctx.lineWidth = 0.8;
    for (let sy = -28; sy <= -12; sy += 3) { ctx.beginPath(); ctx.moveTo(-6,sy); ctx.lineTo(6,sy); ctx.stroke(); }
    // Head
    ctx.fillStyle = "#c4921a";
    ctx.beginPath(); ctx.arc(0,-34,5,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#7a5020"; ctx.lineWidth = 1;
    ctx.stroke();
    // Arms (straw bundles)
    ctx.fillStyle = "#d4a030";
    [-14,14].forEach(ax => {
        ctx.beginPath(); ctx.ellipse(ax,-26,5,3,Math.PI/4,0,Math.PI*2); ctx.fill();
    });
    // Slash marks on body
    ctx.strokeStyle = "#7a3010"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-4,-24); ctx.lineTo(4,-16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3,-22); ctx.lineTo(-3,-14); ctx.stroke();
    ctx.restore();
}

/** Lantern pole — glows at night */
function _drawLanternPole(ctx, x, y, col) {
    const t = Date.now() * 0.001;
    const flicker = 0.9 + Math.sin(t*7.3)*0.1;
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = "#3e2a18"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,-34); ctx.lineTo(8,-38); ctx.stroke();
    // Lantern glow
    const glow = ctx.createRadialGradient(8,-42,0,8,-42,18*flicker);
    glow.addColorStop(0,"rgba(255,200,50,0.6)"); glow.addColorStop(0.5,"rgba(255,150,0,0.2)"); glow.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(8,-42,18*flicker,0,Math.PI*2); ctx.fill();
    // Lantern body
    ctx.fillStyle = "#2e1a00"; ctx.fillRect(4,-46,8,9);
    ctx.fillStyle = `rgba(255,${180+Math.floor(flicker*30)},40,0.9)`;
    ctx.fillRect(5,-45,6,7);
    ctx.strokeStyle = "#8b6914"; ctx.lineWidth = 0.8; ctx.strokeRect(4,-46,8,9);
    // Tassel
    ctx.strokeStyle = col; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(8,-37); ctx.lineTo(6,-32); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8,-37); ctx.lineTo(10,-31); ctx.stroke();
    ctx.restore();
}

/** Water well */
function _drawWell(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    // Well shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(0,4,16,7,0,0,Math.PI*2); ctx.fill();
    // Stone base
    ctx.fillStyle = "#5a5a52";
    ctx.beginPath(); ctx.ellipse(0,2,14,6,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "#4a4a42";
    ctx.beginPath(); ctx.ellipse(0,0,14,6,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#3a3a32"; ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
        const a = (i/8)*Math.PI*2;
        const bx = Math.cos(a)*14, by = Math.sin(a)*6;
        ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx,-8); ctx.stroke();
    }
    // Top ring
    ctx.fillStyle = "#6e6e62"; ctx.beginPath(); ctx.ellipse(0,-8,14,6,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "#1a1a1a"; ctx.beginPath(); ctx.ellipse(0,-8,10,4,0,0,Math.PI*2); ctx.fill();
    // Roof supports
    ctx.strokeStyle = "#4e3518"; ctx.lineWidth = 2;
    [[-12,-8],[12,-8]].forEach(([px,py]) => {
        ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px,(py<0?-1:1)*-22); ctx.stroke();
    });
    // Crossbeam
    ctx.beginPath(); ctx.moveTo(-12,-22); ctx.lineTo(12,-22); ctx.stroke();
    // Bucket and rope
    ctx.strokeStyle = "#6b5040"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(0,-14); ctx.stroke();
    ctx.fillStyle = "#4e3518"; ctx.beginPath(); ctx.ellipse(0,-12,4,3,0,0,Math.PI*2); ctx.fill(); ctx.strokeRect(-3,-15,6,7);
    ctx.restore();
}

/** Bone pile / skull — tier 1 decoration */
function _drawBonePile(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    // Scattered bones
    ctx.strokeStyle = "#c8b890"; ctx.lineWidth = 2; ctx.lineCap = "round";
    [[-8,0,-2,6],[-4,-4,2,2],[2,-2,8,4],[0,2,6,-4]].forEach(([x1,y1,x2,y2]) => {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    });
    // Skull
    ctx.fillStyle = "#d4c890";
    ctx.beginPath(); ctx.ellipse(-2,-4,5,4,0.2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath(); ctx.ellipse(-4,-4,1.5,1.5,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(1,-4,1.5,1.5,0,0,Math.PI*2); ctx.fill();
    ctx.restore();
}

/** Notice board — wooden signboard */
function _drawNoticeBoard(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    // Post
    ctx.strokeStyle = "#4e3518"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-24); ctx.stroke();
    // Board
    ctx.fillStyle = "#7a5828"; ctx.fillRect(-16,-38,32,18);
    ctx.fillStyle = "#8b6535"; ctx.fillRect(-15,-37,30,16);
    ctx.strokeStyle = "#3e2a0a"; ctx.lineWidth = 1; ctx.strokeRect(-16,-38,32,18);
    // Lines (text simulation)
    ctx.strokeStyle = "#2e1a08"; ctx.lineWidth = 0.7;
    [-34,-30,-26].forEach(ly => {
        ctx.beginPath(); ctx.moveTo(-12,ly); ctx.lineTo(12,ly); ctx.stroke();
    });
    // Pushpins
    ctx.fillStyle = "#e53935";
    [[-12,-38],[12,-38]].forEach(([px,py]) => {
        ctx.beginPath(); ctx.arc(px,py,2,0,Math.PI*2); ctx.fill();
    });
    ctx.restore();
}

/** Officer strategy table */
function _drawOfficerTable(ctx, x, y, col) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.beginPath(); ctx.ellipse(0,4,28,10,0,0,Math.PI*2); ctx.fill();
    // Legs
    ctx.strokeStyle = "#3e2a0a"; ctx.lineWidth = 2;
    [[-20,0],[20,0],[-20,0],[20,0]].forEach(([lx,ly]) => {
        ctx.beginPath(); ctx.moveTo(lx,-4); ctx.lineTo(lx,ly+8); ctx.stroke();
    });
    // Table top
    ctx.fillStyle = "#7a5828"; ctx.fillRect(-22,-8,44,8);
    ctx.strokeStyle = "#3e2a0a"; ctx.lineWidth = 1; ctx.strokeRect(-22,-8,44,8);
    // Map on table
    ctx.fillStyle = "#e8d8a0"; ctx.fillRect(-18,-8,36,6);
    ctx.strokeStyle = "#8b6914"; ctx.lineWidth = 0.5;
    // Map lines
    [-6,2,10].forEach(my => { ctx.beginPath(); ctx.moveTo(-18,my-8); ctx.lineTo(18,my-8); ctx.stroke(); });
    [-8,0,8].forEach(mx => { ctx.beginPath(); ctx.moveTo(mx,-8); ctx.lineTo(mx,-2); ctx.stroke(); });
    // Faction mark
    ctx.fillStyle = col || "#8b0000";
    ctx.beginPath(); ctx.arc(2,-5,2,0,Math.PI*2); ctx.fill();
    // Scrolls
    ctx.fillStyle = "#d4c890"; ctx.fillRect(20,-8,4,5);
    ctx.restore();
}

/** Dirt patch variation */
function _drawDirtPatch(ctx, x, y, r, col) {
    ctx.fillStyle = lerpc(col || "#4a5e30", "#1a1005", 0.3);
    ctx.beginPath(); ctx.ellipse(x, y, r, r*0.55, Math.random()*0.5, 0, Math.PI*2); ctx.fill();
}

/** Small grass tuft */
function _drawGrassTuft(ctx, x, y, col) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = lerpc(col || "#4a5e30", "#8bc34a", 0.35); ctx.lineWidth = 1;
    [[-2,0,1,-6],[0,0,0,-7],[2,0,-1,-5],[4,0,2,-6],[-4,0,-2,-5]].forEach(([bx,by,tx,ty]) => {
        ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(tx,ty); ctx.stroke();
    });
    ctx.restore();
}

/** Stone cluster */
function _drawStones(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    [[-5,-2,8,5],[2,-4,7,4],[0,1,6,4],[-3,3,5,3]].forEach(([sx,sy,sw,sh]) => {
        ctx.fillStyle = "#5a5a52"; ctx.beginPath(); ctx.ellipse(sx,sy,sw*0.5,sh*0.5,0.3,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = "#6e6e62"; ctx.beginPath(); ctx.ellipse(sx-1,sy-1,sw*0.35,sh*0.35,0.3,0,Math.PI*2); ctx.fill();
    });
    ctx.restore();
}

/** Shrub / bush */
function _drawShrub(ctx, x, y, col) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = lerpc(col || "#2e4a1f", "#1a2a10", 0.1);
    ctx.beginPath(); ctx.arc(0,-4,10,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = lerpc(col || "#2e4a1f", "#2e4a1f", 0.05);
    ctx.beginPath(); ctx.arc(5,-6,7,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(-5,-5,7,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = lerpc(col || "#3a5f27", "#3a5f27", 0.0);
    ctx.beginPath(); ctx.arc(0,-8,5,0,Math.PI*2); ctx.fill();
    ctx.restore();
}



// ─── PROCEDURAL TERRAIN GENERATOR ─────────────────────────────────────────────
function _drawCampTree(ctx, x, y, col, scale) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    // Trunk
    ctx.fillStyle = "#3e2a18"; ctx.fillRect(-4, -8, 8, 12);
    // Canopy (3 intersecting circles for organic shape)
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, -22, 22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-14, -12, 16, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(14, -12, 16, 0, Math.PI * 2); ctx.fill();
    // Inner shadow/depth
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath(); ctx.arc(0, -15, 12, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

function _drawCampLargeRock(ctx, x, y, col, scale) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    // Base shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.ellipse(0, 4, 18, 10, 0, 0, Math.PI * 2); ctx.fill();
    // Main Rock
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-16, 4); ctx.lineTo(-10, -12); ctx.lineTo(4, -16); 
    ctx.lineTo(14, -6); ctx.lineTo(16, 4); ctx.closePath(); ctx.fill();
    // Highlight
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath(); ctx.moveTo(-10, 2); ctx.lineTo(-6, -10); ctx.lineTo(2, -12); ctx.lineTo(0, 0); ctx.fill();
    ctx.restore();
}

function _generateCampEnvironment(terrainName, colors) {
    CE.envObstacles = [];
    let treeCount = 0, rockCount = 0;
    let groundBase = colors.ground;
    let rockCol = "#5a5a52";
    const treeCols = [colors.treeA, colors.treeB, lerpc(colors.treeA, "#000", 0.2)];

    // Map Battlefield biomes to camp scatter data
    if (terrainName.includes("Dense Forest")) { treeCount = 140; rockCount = 10; groundBase = "#3a4228"; }
    else if (terrainName.includes("Forest")) { treeCount = 70; rockCount = 5; groundBase = "#425232"; }
    else if (terrainName.includes("Steppe")) { treeCount = 0; rockCount = 25; groundBase = "#a3a073"; }
    else if (terrainName.includes("Plains")) { treeCount = 20; rockCount = 8; groundBase = "#6b7a4a"; }
    else if (terrainName.includes("Desert") || terrainName.includes("Dunes")) { treeCount = 2; rockCount = 30; groundBase = "#cfae7e"; rockCol = "#a68a5c"; }
    else if (terrainName.includes("Mountain") || terrainName.includes("Highlands")) { treeCount = 25; rockCount = 50; groundBase = "#7d664b"; }
    else { treeCount = 30; rockCount = 10; } // Fallback

    CE.groundBaseOverride = groundBase;

    function _getValidOuterPos() {
        let px, py, dist;
        do {
            px = Math.random() * CAMP_W;
            py = Math.random() * CAMP_H;
            dist = Math.hypot(px - CAMP_CX, py - CAMP_CY);
        } while(dist < PAL_RADIUS + 120); // Keep a massive radius around the camp completely clear
        return { x: px, y: py };
    }

    for(let i = 0; i < treeCount; i++) {
        let p = _getValidOuterPos();
        CE.envObstacles.push({ x: p.x, y: p.y, kind: "tree", col: treeCols[Math.floor(Math.random() * treeCols.length)], r: 18, scale: 0.8 + Math.random() * 0.6 });
    }
    for(let i = 0; i < rockCount; i++) {
        let p = _getValidOuterPos();
        CE.envObstacles.push({ x: p.x, y: p.y, kind: "rock", col: rockCol, r: 16, scale: 0.7 + Math.random() * 0.8 });
    }
}










function _buildBgCanvas(tier, col) {
    const bg = document.createElement("canvas");
    bg.width = CAMP_W; bg.height = CAMP_H;
    const c = bg.getContext("2d");

    // 1. Ground fill with gradient (NOW USES OVERRIDE)
    const baseGround = CE.groundBaseOverride || col.ground;
    const groundGrad = c.createRadialGradient(CAMP_CX, CAMP_CY, 0, CAMP_CX, CAMP_CY, CAMP_W * 0.7);
    groundGrad.addColorStop(0, lerpc(baseGround, "#2a1a05", 0.2));
    groundGrad.addColorStop(0.4, baseGround);
    groundGrad.addColorStop(1, lerpc(baseGround, "#1a1a0a", 0.15));
    c.fillStyle = groundGrad; c.fillRect(0, 0, CAMP_W, CAMP_H);

    // 2. Ground texture
    for (let i = 0; i < 250; i++) _drawDirtPatch(c, Math.random()*CAMP_W, Math.random()*CAMP_H, 5+Math.random()*18, baseGround);
    for (let i = 0; i < 350; i++) _drawGrassTuft(c, Math.random()*CAMP_W, Math.random()*CAMP_H, baseGround);
    for (let i = 0; i < 90; i++) _drawStones(c, Math.random()*CAMP_W, Math.random()*CAMP_H);

    // 2.5 Draw Organic Peripheral Environment
    if (CE.envObstacles) {
        CE.envObstacles.forEach(obs => {
            if (obs.kind === "tree") _drawCampTree(c, obs.x, obs.y, obs.col, obs.scale);
            if (obs.kind === "rock") _drawCampLargeRock(c, obs.x, obs.y, obs.col, obs.scale);
        });
    }

// ... keep the rest of _buildBgCanvas identical

    // 3. Central worn dirt circle
    const cDirt = c.createRadialGradient(CAMP_CX, CAMP_CY, 0, CAMP_CX, CAMP_CY, 320);
    cDirt.addColorStop(0, "rgba(0,0,0,0.32)");
    cDirt.addColorStop(0.5, "rgba(0,0,0,0.14)");
    cDirt.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = cDirt; c.beginPath(); c.arc(CAMP_CX, CAMP_CY, 320, 0, Math.PI*2); c.fill();

    // 4. Paths from center to every tent
    c.strokeStyle = lerpc(col.road, col.ground, 0.4); c.lineWidth = 10;
    CE.tents.forEach(tent => {
        c.beginPath(); c.moveTo(CAMP_CX, CAMP_CY); c.lineTo(tent.x, tent.y); c.stroke();
    });
    // Extra dirt worn along paths
    c.strokeStyle = lerpc(col.road, col.ground, 0.6); c.lineWidth = 5;
    CE.fires.forEach(f => {
        c.beginPath(); c.moveTo(CAMP_CX, CAMP_CY); c.lineTo(f.x, f.y); c.stroke();
    });

    // 5. Fire rings (static stones)
    CE.fires.forEach(f => _drawFireRing(c, f.x, f.y));

    // 6. Decorations sorted by kind (static ones first)
    CE.decos.forEach(d => {
        switch(d.kind) {
            case "barrel":      _drawBarrel(c, d.x, d.y); break;
            case "crate":       _drawCrate(c, d.x, d.y); break;
            case "weapon":      _drawWeaponRack(c, d.x, d.y, col.primary); break;
            case "log":         _drawLogSeat(c, d.x, d.y); break;
            case "awning":      _drawSupplyAwning(c, d.x, d.y, col.primary); break;
            case "shrub":       _drawShrub(c, d.x, d.y, col.treeA); break;
            case "tower":       _drawGuardTower(c, d.x, d.y, col.primary); break;
            case "horse":       _drawHorseTether(c, d.x, d.y); break;
            case "wagon":       _drawSupplyWagon(c, d.x, d.y, col.primary); break;
            case "cooking":     _drawCookingStation(c, d.x, d.y); break;
            case "dummy":       _drawTrainingDummy(c, d.x, d.y); break;
            case "well":        _drawWell(c, d.x, d.y); break;
            case "bonepile":    _drawBonePile(c, d.x, d.y); break;
            case "noticeboard": _drawNoticeBoard(c, d.x, d.y); break;
            case "table":       _drawOfficerTable(c, d.x, d.y, col.primary); break;
            case "medtent":     _drawMedicalTent(c, d.x, d.y, col.primary); break;
            case "flagpole":    _drawFlagpole(c, d.x, d.y, col.primary, d.tall); break;
			case "chair": 
			if (typeof window.campDrawChair === "function") window.campDrawChair(c, d.x, d.y);   break;

        }
    });

    // 7. Tents sorted by Y
    [...CE.tents].sort((a,b) => a.y-b.y).forEach(tent => {
        switch(tent.type) {
            case "bandit":    _drawBanditTent(c, tent.x, tent.y, col.primary); break;
            case "scout":     _drawScoutTent(c, tent.x, tent.y, col.primary); break;
            case "garrison":  _drawGarrisonTent(c, tent.x, tent.y, col.primary); break;
            case "commander": _drawCommanderTent(c, tent.x, tent.y, col.primary); break;
        }
    });

    // 8. Palisade wall tier 3
    if (tier === 3) _drawPalisadeWall(c, CAMP_CX, CAMP_CY);

    return bg;
}

// ─── CAMP GENERATION ─────────────────────────────────────────────────────────
function _placeTentsCircle(num, tentType, radiusMin, radiusMax, startAngle, spanAngle) {
    const tents = [];
    for (let i = 0; i < num; i++) {
        const a = startAngle + (spanAngle / num) * i + (Math.random() - 0.5) * 0.4;
        const r = radiusMin + Math.random() * (radiusMax - radiusMin);
        const x = CAMP_CX + Math.cos(a) * r;
        const y = CAMP_CY + Math.sin(a) * r;
        tents.push({
            x, y, type: tentType,
            entX: CAMP_CX + Math.cos(a) * (r - 30),
            entY: CAMP_CY + Math.sin(a) * (r - 30),
        });
    }
    return tents;
}

function _generateTier1() {
    // ── RAGTAG BANDIT CAMP ──────────────────────────────────────────────────
    const numTents = 3 + Math.floor(Math.random() * 3); // 3-5 tents
    CE.tents = _placeTentsCircle(numTents, "bandit", 90, 200, 0, Math.PI * 2);
    CE.fires = [
        { x: CAMP_CX + (Math.random()-0.5)*25, y: CAMP_CY + (Math.random()-0.5)*25 },
        { x: CAMP_CX + 110 + (Math.random()-0.5)*30, y: CAMP_CY - 80 + (Math.random()-0.5)*30 },
    ];
    CE.decos = [];
    // Log seats around main fire
    for (let i = 0; i < 6; i++) {
        const a = (i/6)*Math.PI*2, r = 28+Math.random()*8;
        CE.decos.push({ x: CAMP_CX+Math.cos(a)*r, y: CAMP_CY+Math.sin(a)*r, kind:"log" });
    }
    // Scattered barrels and crates
    for (let i = 0; i < 5; i++) CE.decos.push({ x:CAMP_CX+(Math.random()-0.5)*220, y:CAMP_CY+(Math.random()-0.5)*220, kind:"barrel" });
    for (let i = 0; i < 3; i++) CE.decos.push({ x:CAMP_CX+(Math.random()-0.5)*200, y:CAMP_CY+(Math.random()-0.5)*200, kind:"crate" });
    // Weapon racks
    for (let i = 0; i < 2; i++) CE.decos.push({ x:CAMP_CX+(Math.random()-0.5)*160, y:CAMP_CY+(Math.random()-0.5)*160, kind:"weapon" });
    // Bone pile (ominous)
    CE.decos.push({ x:CAMP_CX+160+(Math.random()-0.5)*40, y:CAMP_CY-130+(Math.random()-0.5)*40, kind:"bonepile" });
    CE.decos.push({ x:CAMP_CX-140+(Math.random()-0.5)*40, y:CAMP_CY+150+(Math.random()-0.5)*40, kind:"bonepile" });
    // Crude flagpoles (ragged)
    CE.decos.push({ x:CAMP_CX-50, y:CAMP_CY-80, kind:"flagpole", tall:false });
    // Cooking station at secondary fire
    CE.decos.push({ x:CAMP_CX+110, y:CAMP_CY-80, kind:"cooking" });
    // Plenty of shrubs and trees
    for (let i = 0; i < 22; i++) CE.decos.push({ x:80+Math.random()*(CAMP_W-160), y:80+Math.random()*(CAMP_H-160), kind:"shrub" });
    // Horse tether (just one, crude)
    CE.decos.push({ x:CAMP_CX+180, y:CAMP_CY+120, kind:"horse" });
    CE.guards = [];
}

function _generateTier2() {
    // ── MILITARY SCOUT CAMP ──────────────────────────────────────────────────
    CE.tents = [];
    // Forward arc of scout tents
    CE.tents = CE.tents.concat(_placeTentsCircle(5, "scout", 110, 165, -Math.PI*0.75, Math.PI*1.5));
    // Back arc
    CE.tents = CE.tents.concat(_placeTentsCircle(5, "scout", 185, 260, 0, Math.PI*2));
    CE.fires = [
        { x: CAMP_CX,       y: CAMP_CY      },      // Central
        { x: CAMP_CX+130,   y: CAMP_CY-70   },      // NE
        { x: CAMP_CX-120,   y: CAMP_CY+80   },      // SW
        { x: CAMP_CX+50,    y: CAMP_CY+160  },      // S
    ];
    CE.decos = [];
    // Log circle around central fire
    for (let i = 0; i < 8; i++) {
        const a = (i/8)*Math.PI*2, r = 32+Math.random()*8;
        CE.decos.push({ x:CAMP_CX+Math.cos(a)*r, y:CAMP_CY+Math.sin(a)*r, kind:"log" });
    }
    // Main flagpole (tall)
    CE.decos.push({ x:CAMP_CX, y:CAMP_CY-90, kind:"flagpole", tall:true });
    // Two guard towers
    CE.decos.push({ x:CAMP_CX+240, y:CAMP_CY, kind:"tower" });
    CE.decos.push({ x:CAMP_CX-230, y:CAMP_CY, kind:"tower" });
    // Supply wagons
    CE.decos.push({ x:CAMP_CX+200, y:CAMP_CY-100, kind:"wagon" });
    CE.decos.push({ x:CAMP_CX-195, y:CAMP_CY-80, kind:"wagon" });
    // Horse tether area
    CE.decos.push({ x:CAMP_CX+210, y:CAMP_CY+80, kind:"horse" });
    CE.decos.push({ x:CAMP_CX-200, y:CAMP_CY+100, kind:"horse" });
    // Cooking stations
    CE.decos.push({ x:CAMP_CX+130, y:CAMP_CY-70, kind:"cooking" });
    CE.decos.push({ x:CAMP_CX-120, y:CAMP_CY+80, kind:"cooking" });
    // Notice board
    CE.decos.push({ x:CAMP_CX+30, y:CAMP_CY-80, kind:"noticeboard" });
    // Training dummy
    CE.decos.push({ x:CAMP_CX+160, y:CAMP_CY+180, kind:"dummy" });
    // Medical awning
    CE.decos.push({ x:CAMP_CX+80, y:CAMP_CY-200, kind:"medtent" });
    // Supply awnings
    CE.decos.push({ x:CAMP_CX+240, y:CAMP_CY-30, kind:"awning" });
    CE.decos.push({ x:CAMP_CX-230, y:CAMP_CY+30, kind:"awning" });
    // Weapon racks
    for (let i = 0; i < 5; i++) CE.decos.push({ x:CAMP_CX+(Math.random()-0.5)*280, y:CAMP_CY+(Math.random()-0.5)*280, kind:"weapon" });
    // Organized barrels
    for (let i = 0; i < 8; i++) CE.decos.push({ x:CAMP_CX+(Math.random()-0.5)*300, y:CAMP_CY+(Math.random()-0.5)*300, kind:"barrel" });
    // Organized crates
    for (let i = 0; i < 6; i++) CE.decos.push({ x:CAMP_CX+(Math.random()-0.5)*280, y:CAMP_CY+(Math.random()-0.5)*280, kind:"crate" });
    // Well
    CE.decos.push({ x:CAMP_CX-80, y:CAMP_CY-100, kind:"well" });
    // Shrubs (more organized border)
    for (let i = 0; i < 18; i++) CE.decos.push({ x:120+Math.random()*(CAMP_W-240), y:120+Math.random()*(CAMP_H-240), kind:"shrub" });
    CE.guards = [];
}

function _generateTier3() {
    // ── FULL MILITARY GARRISON CAMP ───────────────────────────────────────────
    CE.tents = [];
    // Commander tent at center-north
    CE.tents.push({
        x: CAMP_CX, y: CAMP_CY - 100, type: "commander",
        entX: CAMP_CX, entY: CAMP_CY - 30
    });
    // Inner ring — garrison tents
    CE.tents = CE.tents.concat(_placeTentsCircle(10, "garrison", 140, 210, 0, Math.PI*2));
    // Middle ring
    CE.tents = CE.tents.concat(_placeTentsCircle(12, "garrison", 230, 310, 0, Math.PI*2));
    // Outer ring (near palisade)
    CE.tents = CE.tents.concat(_placeTentsCircle(9, "scout", 335, 400, 0, Math.PI*2));

    CE.fires = [
        { x: CAMP_CX,       y: CAMP_CY + 50   },   // Central drill plaza
        { x: CAMP_CX+160,   y: CAMP_CY          },  // E
        { x: CAMP_CX-160,   y: CAMP_CY          },  // W
        { x: CAMP_CX+90,    y: CAMP_CY-200      },  // NE (officers)
        { x: CAMP_CX-90,    y: CAMP_CY-200      },  // NW
        { x: CAMP_CX,       y: CAMP_CY+220      },  // S (kitchen)
        { x: CAMP_CX+200,   y: CAMP_CY+150      },  // SE (training)
        { x: CAMP_CX-200,   y: CAMP_CY+150      },  // SW (stables)
    ];

    CE.decos = [];

    // ── NORTH SECTION: Officers' Quarters ──────────────────────────────────────
    CE.decos.push({ x:CAMP_CX,      y:CAMP_CY-180, kind:"flagpole", tall:true });   // Grand flagpole
    CE.decos.push({ x:CAMP_CX+60,   y:CAMP_CY-160, kind:"flagpole", tall:false });  // Secondary
    CE.decos.push({ x:CAMP_CX-60,   y:CAMP_CY-160, kind:"flagpole", tall:false });
    CE.decos.push({ x:CAMP_CX,      y:CAMP_CY-220, kind:"table" });  // Officer table
    CE.decos.push({ x:CAMP_CX-100,  y:CAMP_CY-180, kind:"noticeboard" });
    CE.decos.push({ x:CAMP_CX+100,  y:CAMP_CY-180, kind:"noticeboard" });
    // Log seats around officer area
    for (let i = 0; i < 6; i++) {
        const a = (i/6)*Math.PI*2, r = 38+Math.random()*8;
        CE.decos.push({ x:CAMP_CX+Math.cos(a)*r, y:CAMP_CY+Math.sin(a)*r, kind:"log" });
    }

    // ── EAST SECTION: Supply & Medical ─────────────────────────────────────────
    CE.decos.push({ x:CAMP_CX+260, y:CAMP_CY-80, kind:"medtent" });
    CE.decos.push({ x:CAMP_CX+230, y:CAMP_CY-30, kind:"awning" });
    CE.decos.push({ x:CAMP_CX+280, y:CAMP_CY+60, kind:"wagon" });
    CE.decos.push({ x:CAMP_CX+250, y:CAMP_CY+120, kind:"wagon" });
    for (let i = 0; i < 5; i++) CE.decos.push({ x:220+Math.random()*80, y:CAMP_CY-100+Math.random()*200, kind:"barrel" });
    for (let i = 0; i < 4; i++) CE.decos.push({ x:240+Math.random()*70, y:CAMP_CY-80+Math.random()*160, kind:"crate" });

    // ── WEST SECTION: Armory ────────────────────────────────────────────────────
    CE.decos.push({ x:CAMP_CX-250, y:CAMP_CY-60, kind:"awning" });
    for (let i = 0; i < 6; i++) CE.decos.push({ x:CAMP_CX-220-Math.random()*60, y:CAMP_CY-80+Math.random()*200, kind:"weapon" });
    for (let i = 0; i < 4; i++) CE.decos.push({ x:CAMP_CX-200-Math.random()*60, y:CAMP_CY-60+Math.random()*160, kind:"barrel" });
    for (let i = 0; i < 3; i++) CE.decos.push({ x:CAMP_CX-220-Math.random()*50, y:CAMP_CY-40+Math.random()*120, kind:"crate" });

    // ── SOUTH SECTION: Kitchen & Training ──────────────────────────────────────
    CE.decos.push({ x:CAMP_CX,       y:CAMP_CY+200, kind:"cooking" });
    CE.decos.push({ x:CAMP_CX-50,    y:CAMP_CY+210, kind:"cooking" });
    CE.decos.push({ x:CAMP_CX+50,    y:CAMP_CY+200, kind:"cooking" });
    CE.decos.push({ x:CAMP_CX+200,   y:CAMP_CY+160, kind:"dummy" });
    CE.decos.push({ x:CAMP_CX+240,   y:CAMP_CY+140, kind:"dummy" });
    CE.decos.push({ x:CAMP_CX+220,   y:CAMP_CY+200, kind:"dummy" });
    for (let i = 0; i < 4; i++) CE.decos.push({ x:CAMP_CX+160+Math.random()*60, y:CAMP_CY+120+Math.random()*60, kind:"weapon" });

    // ── STABLES: SW ──────────────────────────────────────────────────────────────
    CE.decos.push({ x:CAMP_CX-200, y:CAMP_CY+160, kind:"horse" });
    CE.decos.push({ x:CAMP_CX-240, y:CAMP_CY+200, kind:"horse" });
    CE.decos.push({ x:CAMP_CX-280, y:CAMP_CY+120, kind:"horse" });

    // ── WELLS ────────────────────────────────────────────────────────────────────
    CE.decos.push({ x:CAMP_CX+130,  y:CAMP_CY+80,  kind:"well" });
    CE.decos.push({ x:CAMP_CX-120,  y:CAMP_CY+80,  kind:"well" });

    // ── GUARD TOWERS (4 cardinal points on palisade) ──────────────────────────
    CE.decos.push({ x:CAMP_CX + PAL_RADIUS * 0.75, y:CAMP_CY,                      kind:"tower" });
    CE.decos.push({ x:CAMP_CX - PAL_RADIUS * 0.75, y:CAMP_CY,                      kind:"tower" });
    CE.decos.push({ x:CAMP_CX,                      y:CAMP_CY + PAL_RADIUS * 0.75, kind:"tower" });
    CE.decos.push({ x:CAMP_CX,                      y:CAMP_CY - PAL_RADIUS * 0.75, kind:"tower" });

    // ── LANTERN POLES along main north-south road ────────────────────────────
    for (let ly = -160; ly <= 180; ly += 55) {
        CE.decos.push({ x:CAMP_CX+32, y:CAMP_CY+ly, kind:"lantern" });
        CE.decos.push({ x:CAMP_CX-32, y:CAMP_CY+ly, kind:"lantern" });
    }

    // ── EXTRA LOGS / SEATING GROUPS ─────────────────────────────────────────
    for (let i = 0; i < 12; i++) CE.decos.push({ x:CAMP_CX+(Math.random()-0.5)*420, y:CAMP_CY+(Math.random()-0.5)*420, kind:"log" });

    // ── PERIMETER SHRUBS (outside palisade feel) ─────────────────────────────
    for (let i = 0; i < 28; i++) CE.decos.push({ x:80+Math.random()*(CAMP_W-160), y:80+Math.random()*(CAMP_H-160), kind:"shrub" });

    // ── GUARDS (2 symmetrical gateposts) ─────────────────────────────────────
    CE.guards = [
        { x:CAMP_CX + PAL_RADIUS*0.88, y:CAMP_CY,   dir:-1, anim:0,   phase:0,   hp:100, stats:{ armor:25, health:100, isRanged:false, ammo:10, morale:50 } },
        { x:CAMP_CX - PAL_RADIUS*0.88, y:CAMP_CY,   dir: 1, anim:0,   phase:1.5, hp:100, stats:{ armor:25, health:100, isRanged:false, ammo:10, morale:50 } },
    ];
}

// ─── COLLISION ────────────────────────────────────────────────────────────────
function _campCollision(nx, ny) {
    const margin = 16;
    if (nx < margin || nx > CAMP_W-margin || ny < margin || ny > CAMP_H-margin) return true;
    
    // Check Tents
    for (const tent of CE.tents) {
        const hw = tent.type==="commander"?48 : tent.type==="garrison"?30 : tent.type==="scout"?22 : 18;
        const hh = tent.type==="commander"?38 : tent.type==="garrison"?24 : 20;
        if (Math.abs(nx-tent.x) < hw && Math.abs(ny-tent.y) < hh) {
            if (Math.hypot(nx-tent.entX, ny-tent.entY) < 22) return false;
            return true;
        }
    }
    
    // Check Palisade Walls
    if (CE.tier === 3) {
        const d = Math.hypot(nx - CAMP_CX, ny - CAMP_CY);
        if (Math.abs(d - PAL_RADIUS) < PAL_THICK) return true;
    }
    
    // NEW: Check Organic Environment Obstacles (Trees/Rocks)
    if (CE.envObstacles) {
        for (const obs of CE.envObstacles) {
            if (Math.hypot(nx - obs.x, ny - obs.y) < obs.r * obs.scale) return true;
        }
    }
    
    return false;
}
// ─── TROOP SYSTEM ─────────────────────────────────────────────────────────────
const TROOP_STATES = { WANDER:"wander", SIT:"sit", TEND:"tend", IN_TENT:"in_tent", TALK:"talk" };

function _initCampTroops(factionColor) {
    CE.troops = [];
    const count = Math.min(MAX_TROOPS, typeof player !== "undefined" ? (player.troops || 5) : 5);
    const safeColor = factionColor || "#8b0000";
    for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const maxR = CE.tier === 3 ? PAL_RADIUS * 0.82 : 280;
        const r = 45 + Math.random() * maxR;
        const tx = CAMP_CX + Math.cos(a) * r;
        const ty = CAMP_CY + Math.sin(a) * r;
        const t = {
            x: tx, y: ty,
            vx: 0, vy: 0,
            dir: Math.random() > 0.5 ? 1 : -1,
            state: TROOP_STATES.WANDER,
            timer: 300 + Math.floor(Math.random() * 300), // FIX: was 0-180, now 5-10s
            anim: Math.random() * 100,
            targetX: 0, targetY: 0,
            tentIdx: -1,
            color: safeColor,
                       role: (typeof player !== "undefined" && player.roster && player.roster[i])
                      ? _rosterTypeToRole(player.roster[i].type)
                      : _randomRole(),
            dialogueId: null,      // FIX: use ID instead  
            isMoving: false,
            id: i,
            hp: 100,
            stats: { armor: 8, health: 100, isRanged: false, ammo: 10, morale: 50 },
        };
        _setWanderTarget(t);
        CE.troops.push(t);
    }
}

function _randomRole() {
    const roles = ["peasant","spearman","sword_shield","archer","crossbow"];
    return roles[Math.floor(Math.random() * roles.length)];
}

// Maps a player.roster entry's unit type string to a drawInfantryUnit role identifier.
// Add more keywords here as you add unit types to your game.
function _rosterTypeToRole(unitType) {
    const t = (unitType || "").toLowerCase();
    if (t.includes("crossbow"))                                                    return "crossbow";
    if (t.includes("archer") || t.includes("bow") || t.includes("shot"))          return "archer";
    if (t.includes("musket") || t.includes("gun") || t.includes("firearm"))       return "crossbow";
    if (t.includes("spear") || t.includes("pike") || t.includes("lance"))         return "spearman";
    if (t.includes("sword") || t.includes("blade") || t.includes("saber"))        return "sword_shield";
    if (t.includes("axe")   || t.includes("halberd") || t.includes("two"))        return "two_handed";
    if (t.includes("militia") || t.includes("peasant") || t.includes("levy"))     return "peasant";
    if (t.includes("cavalry") || t.includes("horse"))                             return "sword_shield";
    return "peasant"; // safe fallback for unknown types
}

function _setWanderTarget(t) {
    const maxR = CE.tier === 3 ? PAL_RADIUS * 0.78 : CAMP_W * 0.36;
    for (let tries = 0; tries < 25; tries++) {
        const a = Math.random() * Math.PI * 2;
        const r = 30 + Math.random() * maxR;
        const tx = CAMP_CX + Math.cos(a) * r;
        const ty = CAMP_CY + Math.sin(a) * r;
        if (!_campCollision(tx, ty)) {
            t.targetX = tx; t.targetY = ty;
            // FIX: reset timer so troops have time to walk to target
            const walkDist = Math.hypot(tx - t.x, ty - t.y);
            t.timer = Math.max(300, Math.floor(walkDist / TROOP_SPEED * 1.4));
            return;
        }
    }
    t.targetX = CAMP_CX + (Math.random()-0.5)*80;
    t.targetY = CAMP_CY + (Math.random()-0.5)*80;
    t.timer = 300 + Math.floor(Math.random() * 200);
}

function _updateCampTroops() {
    CE.troops.forEach((t) => {
        t.anim++;
        t.timer = Math.max(0, t.timer - 1);

        switch (t.state) {
            case TROOP_STATES.WANDER: {
                const dx = t.targetX - t.x, dy = t.targetY - t.y;
                const dist = Math.hypot(dx, dy);
                // FIX: only transition on actual arrival (dist < 8), not timer
                if (dist < 8) {
                    t.isMoving = false;
                    const roll = Math.random();
                    if (roll < 0.22 && CE.fires.length) {
                        // Sit by nearest fire
                        let nearestFire = CE.fires[0], nearestD = Infinity;
                        CE.fires.forEach(f => { const d = Math.hypot(f.x-t.x,f.y-t.y); if(d<nearestD){nearestD=d;nearestFire=f;} });
                        const fa = Math.random() * Math.PI * 2;
                        t.targetX = nearestFire.x + Math.cos(fa) * (20 + Math.random() * 14);
                        t.targetY = nearestFire.y + Math.sin(fa) * (14 + Math.random() * 10);
                        t.state = TROOP_STATES.SIT;
                        t.timer = 220 + Math.floor(Math.random() * 360);
                    } else if (roll < 0.35 && CE.tents.length && t.tentIdx === -1) {
                        const ti = Math.floor(Math.random() * CE.tents.length);
                        const tent = CE.tents[ti];
                        t.targetX = tent.entX; t.targetY = tent.entY;
                        t.tentIdx = ti;
                        t.state = TROOP_STATES.TEND;
                        t.timer = 1200;
                    } else {
                        _setWanderTarget(t);
                    }
                } else {
                    // Move toward target — FIX: TROOP_SPEED was 0.55, now 1.4
                    const speed = TROOP_SPEED;
                    const nx = t.x + (dx / dist) * speed;
                    const ny = t.y + (dy / dist) * speed;
                    if (!_campCollision(nx, ny)) {
                        t.x = nx; t.y = ny;
                    } else {
                        _setWanderTarget(t);
                    }
                    t.isMoving = true;
                    if (dx !== 0) t.dir = dx > 0 ? 1 : -1;
                }
                break;
            }
            case TROOP_STATES.SIT: {
                t.isMoving = false;
                if (t.timer === 0) {
                    _setWanderTarget(t);
                    t.state = TROOP_STATES.WANDER;
                }
                break;
            }
            case TROOP_STATES.TEND: {
                const tent = CE.tents[t.tentIdx];
                if (!tent) { t.tentIdx = -1; _setWanderTarget(t); t.state = TROOP_STATES.WANDER; break; }
                const dx = tent.entX - t.x, dy = tent.entY - t.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 10) {
                    t.state = TROOP_STATES.IN_TENT;
                    t.timer = 320 + Math.floor(Math.random() * 400);
                    t.isMoving = false;
                } else {
                    const nx = t.x + (dx / dist) * TROOP_SPEED;
                    const ny = t.y + (dy / dist) * TROOP_SPEED;
                    t.x = nx; t.y = ny;
                    t.isMoving = true;
                    if (dx !== 0) t.dir = dx > 0 ? 1 : -1;
                }
                break;
            }
            case TROOP_STATES.IN_TENT: {
                t.isMoving = false;
                if (t.timer === 0) {
                    const tent = CE.tents[t.tentIdx];
                    if (tent) { t.x = tent.entX; t.y = tent.entY; }
                    t.tentIdx = -1;
                    _setWanderTarget(t);
                    t.state = TROOP_STATES.WANDER;
                }
                break;
            }
            case TROOP_STATES.TALK: {
                t.isMoving = false;
                if (t.dialogueId === null) {
                    _setWanderTarget(t);
                    t.state = TROOP_STATES.WANDER;
                }
                break;
            }
        }
    });

if (!CE.combatDialogueMode && CE.dialogues.length < 5 && Math.random() < 0.005) {
        _tryStartDialogue();
    }

    // Guards idle bob
    CE.guards.forEach(g => { g.anim++; });

    // Rare desertion if cohesion very low
    if (typeof player !== "undefined" && player.cohesion !== undefined && Math.random() < 0.0002) {
        if (player.cohesion < 30 && player.troops > 0) {
            player.troops = Math.max(0, player.troops - 1);
        }
    }
}

function _drawCampTroops(ctx) {
    const px = typeof player !== "undefined" ? player.x : CAMP_CX;
    const py = typeof player !== "undefined" ? player.y : CAMP_CY;
    // Sort by Y for depth
    const visible = CE.troops.filter(t =>
        t.state !== TROOP_STATES.IN_TENT &&
        Math.hypot(t.x - px, t.y - py) <= VIS_RADIUS
    ).sort((a,b) => a.y - b.y);

    visible.forEach(t => {
        if (typeof drawInfantryUnit === "function" && t.stats) {
            drawInfantryUnit(ctx, t.x, t.y, t.isMoving, t.anim, t.color, t.role,
                false, "player", "Soldier", false, 100, t.stats.ammo, t, 0);
        } else {
            // Fallback stick figure
            ctx.save(); ctx.translate(t.x, t.y);
            ctx.fillStyle = t.color || "#8b0000";
            ctx.beginPath(); ctx.arc(0,-12,3.5,0,Math.PI*2); ctx.fill();
            ctx.fillRect(-3,-9,6,9);
            if (t.isMoving) {
                const sw = Math.sin(t.anim * 0.3) * 4;
                ctx.strokeStyle = t.color || "#8b0000"; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(-2,0); ctx.lineTo(-3-sw,7); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(2,0); ctx.lineTo(3+sw,7); ctx.stroke();
            }
            ctx.restore();
        }
    });
}

function _drawGuards(ctx) {
    CE.guards.forEach(g => {
        const bob = Math.abs(Math.sin(g.anim * 0.025 + g.phase)) * 2;
        const col = CE.troopColor || CE.colors.primary || "#8b0000";
        if (typeof drawInfantryUnit === "function") {
            drawInfantryUnit(ctx, g.x, g.y - bob, false, g.anim, col, "spearman",
                false, "player", "Guard", false, 100, 0, g, 0);
        }
        // Lantern glow
        ctx.save();
        const lg = ctx.createRadialGradient(g.x, g.y-18, 0, g.x, g.y-18, 14);
        lg.addColorStop(0,"rgba(255,200,60,0.35)"); lg.addColorStop(1,"rgba(255,160,0,0)");
        ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(g.x, g.y-18, 14, 0, Math.PI*2); ctx.fill();
        ctx.restore();
    });
}

// ─── DIALOGUE ENGINE (FIXED — uses IDs not indices) ───────────────────────────
function _tryStartDialogue() {
	 if (CE.combatDialogueMode) return;  // COMBAT ADDON: no normal chat during ambush
    // FIX: Increased proximity from 80 → 160 so troops can chat more easily
    const candidates = CE.troops.filter(t =>
        (t.state === TROOP_STATES.WANDER || t.state === TROOP_STATES.SIT) &&
        t.dialogueId === null
    );
    if (candidates.length < 2) return;

    for (let a = 0; a < candidates.length; a++) {
        for (let b = a + 1; b < candidates.length; b++) {
            const ta = candidates[a], tb = candidates[b];
            const dist = Math.hypot(ta.x - tb.x, ta.y - tb.y);
            if (dist < 160) { // FIX: was 80
                const convData = CAMP_TALKS[Math.floor(Math.random() * CAMP_TALKS.length)];
                const did = CE._nextDialogueId++;
                CE.dialogues.push({
                    id: did,
                    ta: ta.id, tb: tb.id,
                    lines: convData,
                    lineIdx: 0,
                    lineTimer: 200 + convData[0].length * 4,
                    done: false,
                });
                ta.dialogueId = did; tb.dialogueId = did;
                ta.state = TROOP_STATES.TALK; tb.state = TROOP_STATES.TALK;
                ta.dir = tb.x > ta.x ? 1 : -1;
                tb.dir = ta.x > tb.x ? 1 : -1;
                return;
            }
        }
    }
}

function _updateDialogues() {
    CE.dialogues = CE.dialogues.filter(d => {
        if (d.done) {
            // Free troops
            const ta = CE.troops.find(t => t.id === d.ta);
            const tb = CE.troops.find(t => t.id === d.tb);
            if (ta) { ta.dialogueId = null; _setWanderTarget(ta); ta.state = TROOP_STATES.WANDER; }
            if (tb) { tb.dialogueId = null; _setWanderTarget(tb); tb.state = TROOP_STATES.WANDER; }
            return false;
        }
        d.lineTimer--;
        if (d.lineTimer <= 0) {
            d.lineIdx++;
            if (d.lineIdx >= d.lines.length) {
                d.done = true;
                return true; // will be cleaned on next pass
            }
            const line = d.lines[d.lineIdx];
            d.lineTimer = 180 + (line ? line.length * 4 : 60);
        }
        return true;
    });

    // Clean up troops whose dialogue was removed unexpectedly
    CE.troops.forEach(t => {
        if (t.dialogueId !== null && !CE.dialogues.find(d => d.id === t.dialogueId)) {
            t.dialogueId = null;
            if (t.state === TROOP_STATES.TALK) {
                _setWanderTarget(t);
                t.state = TROOP_STATES.WANDER;
            }
        }
    });
}

function _drawDialogues(ctx) {
    const px = typeof player !== "undefined" ? player.x : CAMP_CX;
    const py = typeof player !== "undefined" ? player.y : CAMP_CY;
    CE.dialogues.forEach(d => {
        if (d.done) return;
        const line = d.lines[d.lineIdx];
        if (!line) return;
        const speakerId = d.lineIdx % 2 === 0 ? d.ta : d.tb;
        const speaker = CE.troops.find(t => t.id === speakerId);
        if (!speaker) return;
        if (Math.hypot(speaker.x - px, speaker.y - py) > VIS_RADIUS) return;
		const bx = speaker.x, by = speaker.y - 36;
        ctx.font = "bold 10px Georgia";

        // 1. Wrap the text into multiple lines instead of truncating
        const words = line.split(" ");
        let textLines = [];
        let currentLine = words[0];
        const maxBubbleWidth = 140; // Force wrapping if a line gets wider than this

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            if (ctx.measureText(currentLine + " " + word).width < maxBubbleWidth) {
                currentLine += " " + word;
            } else {
                textLines.push(currentLine);
                currentLine = word;
            }
        }
        textLines.push(currentLine);

        // 2. Calculate dynamic dimensions based on text length
        const lineHeight = 12;
        const pad = 8;
        
        let maxLineWidth = 0;
        textLines.forEach(l => {
            const w = ctx.measureText(l).width;
            if (w > maxLineWidth) maxLineWidth = w;
        });

        const bw = maxLineWidth + pad * 2;
        
        // 3. The bubble height scales with the number of text lines
        const bh = (textLines.length * lineHeight) + pad;

        ctx.save();
        ctx.globalAlpha = 0.95;
        // Bubble background with rounded corners
        ctx.fillStyle = "rgba(248, 243, 225, 0.97)";
        ctx.strokeStyle = "#5d3d1a";
        ctx.lineWidth = 1.5;
        
        // Because bTop is (by - bh), a larger bh pushes the bubble's top Y-axis coordinate visually higher
        const bLeft = bx - bw/2, bTop = by - bh;
        
        if (ctx.roundRect) {
            ctx.beginPath(); ctx.roundRect(bLeft, bTop, bw, bh, 5); ctx.fill(); ctx.stroke();
        } else {
            ctx.fillRect(bLeft, bTop, bw, bh); ctx.strokeRect(bLeft, bTop, bw, bh);
        }
        
        // Tail
        ctx.fillStyle = "rgba(248, 243, 225, 0.97)";
        ctx.beginPath(); ctx.moveTo(bx-5,by); ctx.lineTo(bx,by+9); ctx.lineTo(bx+5,by); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#5d3d1a"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bx-5,by); ctx.lineTo(bx,by+9); ctx.lineTo(bx+5,by); ctx.stroke();
        
        // Text
        ctx.fillStyle = "#1e0e04";
        ctx.textAlign = "center";
        
        // Draw each line stacked vertically
        let textY = bTop + pad + 4; 
        textLines.forEach(l => {
            ctx.fillText(l, bx, textY);
            textY += lineHeight;
        });
        
        ctx.restore();
    });
}

// ─── AMBUSH SYSTEM ────────────────────────────────────────────────────────────
function _tickAmbushSystem(dt) {
	if (document.hidden) return; // Safety trigger: stops logic if tab isn't active
    if (CE.packingUp || CE.entering) return;

    // Animate alert flash fade
    if (CE.ambushAlertAlpha > 0) {
        CE.ambushAlertAlpha = Math.max(0, CE.ambushAlertAlpha - dt * 0.7);
    }
    // Victory timer
    if (CE.ambushVictoryTimer > 0) {
        CE.ambushVictoryTimer = Math.max(0, CE.ambushVictoryTimer - 1);
    }

    if (!CE.ambushActive) {
        CE.ambushTimer += dt;
        if (CE.ambushTimer >= AMBUSH_INTERVAL) {
            CE.ambushTimer = 0;
if ((player.troops >= 10 || (player.roster && player.roster.length >= 10)) && Math.random() < AMBUSH_CHANCE) {
                _triggerAmbush();
            }
        }
        return;
    }

    // ── ACTIVE AMBUSH COMBAT ─────────────────────────────────────────────────
    CE.ambushUnits = CE.ambushUnits.filter(b => b.hp > 0);

if (CE.ambushUnits.length === 0) {
        CE.ambushActive = false;
		
		 if (typeof window.campCombatOnVictory === "function") window.campCombatOnVictory();
        CE.ambushVictoryTimer = 240;
        _logEvent("⚔️ Ambush repelled! Bandits scattered.");
        if (typeof window.campApplyBattleOutcome === "function") window.campApplyBattleOutcome(true);
        // Restore player HP slightly
        if (typeof player !== "undefined") {
            player.hp = Math.min(player.maxHealth || 200, (player.hp || 1) + 30);
        }
        // Revert to standard camp/overworld playlist
        if (typeof AudioManager !== "undefined") {
            try { 
			
AudioManager.playRandomMP3List([
                    'music/gameloop1.mp3', 'music/gameloop2.mp3', 'music/gameloop3.mp3', 
                    'music/gameloop4.mp3', 'music/gameloop5.mp3', 'music/gameloop6.mp3', 
                    'music/gameloop7.mp3', 'music/gameloop8.mp3', 'music/gameloop9.mp3', 
                    'music/gameloop10.mp3'
                ]);


			} catch(e) {}
        }
        return;
    }
// Replace the old death block with this:
if (typeof player !== "undefined" && (player.hp || 0) <= 0) {
    CE.ambushActive = false;
    CE.ambushUnits = [];
    
    // Create an unmissable red flash overlay
    let deathFlash = document.createElement("div");
    deathFlash.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(200,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;color:white;font-family:Georgia;font-size:3rem;font-weight:bold;text-shadow:2px 2px 10px black;";
    deathFlash.innerText = "COMMANDER OVERWHELMED!";
    document.body.appendChild(deathFlash);
    
    _logEvent("⚠️ Commander overwhelmed! Retreating from camp...");
    if (typeof window.campApplyBattleOutcome === "function") window.campApplyBattleOutcome(false);
    
// Wait 3.5 seconds so the player can process their death before Game Over
    setTimeout(() => {
        document.body.removeChild(deathFlash);
        
        // This forces the entire browser tab to reload, acting as a hard reset back to your main menu.
        // If you have a specific function that hides the canvas and shows the menu UI, 
        // you can replace window.location.reload() with something like showMainMenu();
        window.location.reload(); 
    }, 3500);
    return;
}

    // Update each bandit AI
    CE.ambushUnits.forEach(b => {
        b.anim++;
        b.attackTimer = (b.attackTimer || 0) + dt;

        // Find nearest target
        let nearestTarget = null, nearestDist = Infinity;

        if (typeof player !== "undefined" && (player.hp||0) > 0) {
            const d = Math.hypot(b.x - player.x, b.y - player.y);
            if (d < nearestDist) { nearestDist = d; nearestTarget = { x:player.x, y:player.y, isPlayer:true, ref:player }; }
        }
        CE.troops.forEach(t => {
            if (t.state === TROOP_STATES.IN_TENT || (t.hp||0) <= 0) return;
            const d = Math.hypot(b.x - t.x, b.y - t.y);
            if (d < nearestDist) { nearestDist = d; nearestTarget = { x:t.x, y:t.y, isTroop:true, ref:t }; }
        });

        if (!nearestTarget) return;

        const ATTACK_RANGE = 34;
        if (nearestDist > ATTACK_RANGE) {
            // Chase
            const dx = nearestTarget.x - b.x, dy = nearestTarget.y - b.y;
            b.x += (dx / nearestDist) * 1.2;
            b.y += (dy / nearestDist) * 1.2;
            b.state = "approach";
        } else {
            // Attack
            b.state = "attack";
            if (b.attackTimer >= 1.1) {
                b.attackTimer = 0;
                const rawDmg = 6 + Math.floor(Math.random() * 8);
                if (nearestTarget.isPlayer) {
                    const armor = nearestTarget.ref.armor || 20;
                    const finalDmg = Math.max(1, rawDmg - Math.floor(armor * 0.28));
                    nearestTarget.ref.hp = Math.max(0, (nearestTarget.ref.hp || 0) - finalDmg);
                } else if (nearestTarget.isTroop) {
                    const trp = nearestTarget.ref;
                    const armor = (trp.stats && trp.stats.armor) || 8;
                    const finalDmg = Math.max(1, rawDmg - Math.floor(armor * 0.22));
                    trp.hp = Math.max(0, (trp.hp || 100) - finalDmg);
                    if (trp.hp <= 0) {
                        trp.state = TROOP_STATES.IN_TENT;
                        trp.timer = 9999;
                    }
                }
            }
        }
    });

    // Camp troops fight back
    CE.troops.forEach(t => {
		
        if (t.state === TROOP_STATES.IN_TENT || (t.hp || 0) <= 0) return;
 if (window._CAMP_COMBAT_ACTIVE) return;  // COMBAT ADDON: handled by campCombatTick
        let closestBandit = null, closestDist = Infinity;
        CE.ambushUnits.forEach(b => {
            const d = Math.hypot(t.x - b.x, t.y - b.y);
            if (d < closestDist) { closestDist = d; closestBandit = b; }
        });
        if (closestBandit && closestDist < 70) {
            if (closestDist > 32) {
                const dx = closestBandit.x - t.x, dy = closestBandit.y - t.y;
                t.x += (dx / closestDist) * 0.9;
                t.y += (dy / closestDist) * 0.9;
                t.isMoving = true;
                t.dir = dx > 0 ? 1 : -1;
            } else {
                t.isMoving = false;
                const dmg = (3 + Math.random() * 4) * dt;
                closestBandit.hp -= dmg;
            }
            // Override dialogue/sitting during combat
            if (t.state !== TROOP_STATES.IN_TENT) {
                t.state = TROOP_STATES.WANDER;
                t.dialogueId = null;
            }
        }
    });
	
	
	// Player auto-attacks nearby bandits
    if (typeof player !== "undefined" && (player.hp || 0) > 0) {
        // FIX 1: Use 'attackTimer' (seconds) so the renderer animates the arms correctly!
        player.attackTimer = (player.attackTimer || 0) + dt; 
        
        let closestBandit = null;
        let closestDist = Infinity;

        // Find the closest bandit
        CE.ambushUnits.forEach(b => {
            const d = Math.hypot(player.x - b.x, player.y - b.y);
            if (d < 48 && d < closestDist) { 
                closestDist = d;
                closestBandit = b;
            }
        });

        if (closestBandit) {
            player.isAttacking = true;
            // FIX 2: Sustain is now in seconds (0.6s) to match the new dt math
            player.attackSustain = 0.6; 
            
            // FIX 3: 1.0 second cooldown for a heavy, deliberate cleave
            if (player.attackTimer >= 1.0) {
                player.attackTimer = 0; // This resets the animation arm swing arc!
                const atk = player.meleeAttack || 25; 
                const dmg = (atk * 0.8) + Math.floor(Math.random() * 10);
                closestBandit.hp -= dmg;
            }
        } else {
            if (player.attackSustain > 0) {
                player.attackSustain -= dt;
            } else {
                player.isAttacking = false;
                // Gently reset the arm pose when out of combat
                player.attackTimer = 0; 
            }
        }
    }
}
 // <-- End of _tickAmbushSystem

function _triggerAmbush() {
    CE.ambushActive = true;
    CE.ambushAlertAlpha = 1.0;

    const count = CE.tier === 1 ? (2 + Math.floor(Math.random() * 2)) :
                  CE.tier === 2 ? (3 + Math.floor(Math.random() * 3)) :
                                  (4 + Math.floor(Math.random() * 4));

    // Spawn at perimeter
    const spawnR = CE.tier === 3 ? PAL_RADIUS - 10 : Math.min(CAMP_W, CAMP_H) * 0.37;
    CE.ambushUnits = [];

    for (let i = 0; i < count; i++) {
        const a = (Math.PI*2 / count) * i + (Math.random()-0.5) * 0.9;
        const r = spawnR + Math.random() * 40;
        const hpBase = 40 + CE.tier * 12 + Math.floor(Math.random() * 18);
        CE.ambushUnits.push({
            x: CAMP_CX + Math.cos(a) * r,
            y: CAMP_CY + Math.sin(a) * r,
            hp: hpBase, maxHp: hpBase,
            anim: Math.random() * 60,
            state: "approach",
            attackTimer: Math.random() * 1.1,
            stats: { armor:4, health:hpBase, isRanged:false, ammo:0, morale:50 },
        });
    }

_logEvent(`⚠️ AMBUSH! ${count} bandits storm the camp!`);
    if (typeof AudioManager !== "undefined") {
        try { 
            // Play the new custom ambush track and loop it
            AudioManager.playMP3("music/Bandit_Ambush.mp3", true); 
        } catch(e) {}
    }
	
	
	 if (typeof window.campCombatOnTrigger === "function") window.campCombatOnTrigger();
}

function _drawAmbushUnits(ctx) {
    CE.ambushUnits.forEach(b => {
        if (b.hp <= 0) return;
		if (typeof drawInfantryUnit === "function") {
            drawInfantryUnit(ctx, b.x, b.y, b.state === "approach", b.anim,
                "#8d2b0b", "spearman", b.state === "attack", "enemy", "Bandit",
                false, 100, 0, b, 0); // Pass 'b' directly so _weaponSeed persists!
        } else {
            ctx.save(); ctx.translate(b.x, b.y);
            ctx.fillStyle = "#8d2b0b";
            ctx.beginPath(); ctx.arc(0,-12,3.5,0,Math.PI*2); ctx.fill();
            ctx.fillRect(-3,-9,6,9);
            ctx.restore();
        }
        // HP bar
        const barW = 22, barH = 4, pct = b.hp / b.maxHp;
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.fillRect(b.x - barW/2, b.y - 30, barW, barH);
        ctx.fillStyle = pct > 0.5 ? "#ff5252" : "#d50000";
        ctx.fillRect(b.x - barW/2, b.y - 30, barW * pct, barH);
        // "BANDIT" label
        ctx.font = "bold 8px Georgia"; ctx.textAlign = "center";
        ctx.fillStyle = "#ff5252"; ctx.fillText("BANDIT", b.x, b.y - 34);
    });
}

function _drawAmbushOverlays(ctx, cw, ch) {
    // Red flash on trigger
    if (CE.ambushAlertAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = CE.ambushAlertAlpha * 0.38;
        ctx.fillStyle = "#ff0000"; ctx.fillRect(0, 0, cw, ch);
        ctx.restore();

        if (CE.ambushAlertAlpha > 0.25) {
            ctx.save();
            ctx.globalAlpha = CE.ambushAlertAlpha;
            ctx.textAlign = "center";
            ctx.shadowColor = "#000"; ctx.shadowBlur = 10;
            ctx.font = `bold ${Math.min(42, cw * 0.07)}px Georgia`;
            ctx.fillStyle = "#ff1744";
            ctx.fillText("⚠️  AMBUSH!", cw/2, ch/2 - 18);
            ctx.font = `bold ${Math.min(18, cw * 0.032)}px Georgia`;
            ctx.fillStyle = "#ffca28";
            ctx.fillText("Defend the camp! Kill all bandits!", cw/2, ch/2 + 22);
            ctx.restore();
        }
    }

    // Active ambush status bar
    if (CE.ambushActive) {
        const alive = CE.ambushUnits.filter(b => b.hp > 0).length;
        ctx.save();
        ctx.fillStyle = "rgba(120,0,0,0.85)";
        ctx.fillRect(cw/2 - 130, 6, 260, 24);
        ctx.font = "bold 11px Georgia"; ctx.textAlign = "center";
        ctx.fillStyle = "#ff5252";
        ctx.fillText(`⚔️  AMBUSH — ${alive} BANDIT${alive!==1?"S":""} REMAIN`, cw/2, 22);
        ctx.restore();

        // Player HP bar during ambush
        if (typeof player !== "undefined") {
            const maxHp = player.maxHealth || 200;
            const pct = Math.max(0, (player.hp || 0) / maxHp);
            const bW = Math.min(180, cw * 0.3), bH = 12;
            const bx = cw/2 - bW/2, by = ch - 58;
            ctx.save();
            ctx.fillStyle = "rgba(0,0,0,0.75)";
            ctx.fillRect(bx-2, by-2, bW+4, bH+4);
            ctx.fillStyle = pct > 0.5 ? "#4caf50" : pct > 0.25 ? "#ff9800" : "#f44336";
            ctx.fillRect(bx, by, bW * pct, bH);
            ctx.strokeStyle = "#d4b886"; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bW, bH);
            ctx.font = "bold 9px Georgia"; ctx.textAlign = "center";
            ctx.fillStyle = "#fff";
            ctx.fillText(`❤️ ${Math.ceil(player.hp||0)} / ${maxHp}`, cw/2, by - 3);
            ctx.restore();
        }
    }

    // Victory flash
    if (CE.ambushVictoryTimer > 0) {
        ctx.save();
        ctx.globalAlpha = CE.ambushVictoryTimer / 240;
        ctx.textAlign = "center";
        ctx.shadowColor = "#000"; ctx.shadowBlur = 8;
        ctx.font = `bold ${Math.min(32, cw*0.055)}px Georgia`;
        ctx.fillStyle = "#8bc34a";
        ctx.fillText("✓  AMBUSH REPELLED!", cw/2, ch/2 - 10);
        ctx.font = `bold ${Math.min(14, cw*0.025)}px Georgia`;
        ctx.fillStyle = "#ffca28";
        ctx.fillText("The camp is safe. Continue resting.", cw/2, ch/2 + 22);
        ctx.restore();
    }
}

// ─── DUSK SKY & OVERLAYS ──────────────────────────────────────────────────────
function _drawDuskSky(ctx, cw, ch) {
    const grad = ctx.createLinearGradient(0, 0, 0, ch);
    grad.addColorStop(0,    "#0b0720");
    grad.addColorStop(0.22, "#1a0d30");
    grad.addColorStop(0.45, "#3d1a08");
    grad.addColorStop(0.62, "#c44800");
    grad.addColorStop(0.74, "#ff8c00");
    grad.addColorStop(0.84, "#ffb347");
    grad.addColorStop(0.92, "#4a2400");
    grad.addColorStop(1.0,  "#120c06");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, cw, ch);
}

function _generateStars(cw, ch) {
}

function _drawStars(ctx) {

}

function _drawDuskOverlay(ctx, cw, ch) {
    // 1. Base tint: Changed from light orange to a deeper midnight blue/black
    // Increased opacity from 0.08 to 0.25
    ctx.fillStyle = "rgba(5, 10, 30, 0.25)"; 
    ctx.fillRect(0, 0, cw, ch);

    // 2. Top Shadow: Increased opacity from 0.18 to 0.50 for a much darker sky
    const topGrad = ctx.createLinearGradient(0, 0, 0, ch * 0.45);
    topGrad.addColorStop(0, "rgba(0, 0, 0, 0.50)"); 
    topGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    
    ctx.fillStyle = topGrad; 
    ctx.fillRect(0, 0, cw, ch);
}

function _drawVignette(ctx, cw, ch) {
    // Made the inner clear circle smaller (0.28 -> 0.15) to bring darkness in closer
    const vg = ctx.createRadialGradient(
        cw/2, ch/2, Math.min(cw,ch) * 0.15, 
        cw/2, ch/2, Math.max(cw,ch) * 0.85
    );

    vg.addColorStop(0, "rgba(0,0,0,0)");
    // Added a middle step to make the "fade" happen sooner and heavier
    vg.addColorStop(0.4, "rgba(0,0,0,0.3)"); 
    // Increased edge darkness from 0.58 to 0.85
    vg.addColorStop(1, "rgba(0,0,0,0.85)"); 

    ctx.fillStyle = vg; 
    ctx.fillRect(0, 0, cw, ch);
}
function _drawCampPlayer(ctx) {
    if (typeof player === "undefined") return;
    if (!player.stats) player.stats = { armor:40, health:200, isRanged:false, ammo:0, morale:80 };
    const col = (typeof FACTIONS !== "undefined" && player.faction && FACTIONS[player.faction])
                ? FACTIONS[player.faction].color : "#d32f2f";

    const CE = window._CAMP_CE;
    const inCombat = (CE && CE.ambushActive);
    const isActuallyAttacking = inCombat && (player.isAttacking === true);

    const currentWeaponRole = isActuallyAttacking ? "two_handed" : "unarmed";
    const visualIsMoving = player.isMoving && !isActuallyAttacking;

    // 1. DRAW THE BASE BODY + SWING TRICK
    ctx.save();
    
    // 🔴 SURGERY: THE ARC CLAMP
    // If attacking, we apply a counter-rotation to the canvas that fights the engine's internal swing.
    // This keeps the sword in the 'upper' 30% of the strike zone.
    if (isActuallyAttacking) {
        ctx.translate(player.x, player.y);
        // This math tracks the cooldown and pushes the canvas BACK as the arm goes DOWN.
        let swingProgress = (player.attackCooldown || 0) / 40; 
        ctx.rotate(swingProgress * 0.9); // The "Anti-Gravity" rotation
        ctx.translate(-player.x, -player.y);
    }

    if (typeof drawInfantryUnit === "function") {
        drawInfantryUnit(ctx, player.x, player.y, visualIsMoving, player.anim || 0,
            col, currentWeaponRole, isActuallyAttacking, "player", "Commander", false, player.attackCooldown || 0, 0, player, 0);
    }
    ctx.restore();

    // 2. INJECT CUSTOM TWO-HANDED SCABBARD
    ctx.save();
    ctx.translate(player.x, player.y);

    let bounceY = 0;
    let swayAngle = 0;
    if (visualIsMoving) {
        bounceY = Math.abs(Math.sin((player.anim || 0) * 0.3)) * 1.5;
        swayAngle = Math.sin((player.anim || 0) * 0.15) * 0.08; 
    }

    // Anchor point on the hip
    ctx.translate(-6, -4 + bounceY); 
    ctx.rotate(0.55 + swayAngle); 

    // 🔴 SURGERY: Scale the entire assembly down by 30%
    ctx.scale(0.7, 0.7);

    // Scabbard Body
    ctx.fillStyle = "#1e140d"; 
    ctx.fillRect(-1.5, -2, 3, 19); 
    
    // Bronze Fittings
    ctx.fillStyle = "#7a6345"; 
    ctx.fillRect(-2, -2, 4, 2.5); // Throat
    ctx.beginPath(); // Chape
    ctx.moveTo(-1.5, 16); ctx.lineTo(1.5, 16); ctx.lineTo(0.5, 19); ctx.lineTo(-0.5, 19);
    ctx.fill();

    // DYNAMIC HILT: Disappears when the sword is being swung
    if (!isActuallyAttacking) {
        ctx.fillStyle = "#3d1414"; // Long Grip
        ctx.fillRect(-1, -10, 2, 8); 
        ctx.fillStyle = "#7a6345"; // Pommel
        ctx.fillRect(-1.5, -11.5, 3, 1.5);
        ctx.fillStyle = "#5c4a33"; // Crossguard
        ctx.fillRect(-2.5, -2.5, 5, 1);
    }

    ctx.restore();

    // 3. Name tag
    ctx.save();
    ctx.font = "bold 9px Georgia"; ctx.textAlign = "center";
    ctx.fillStyle = "#ffca28";
    ctx.fillText("YOU", player.x, player.y - 30);
    ctx.restore();
}
// ─── ANIMATED DECORATIONS (drawn each frame, not to bgCanvas) ────────────────
function _drawDynamicDecos(ctx) {
    CE.decos.forEach(d => {
        if (d.kind === "lantern") _drawLanternPole(ctx, d.x, d.y, CE.colors.primary);
        if (d.kind === "cooking") _drawCookingStation(ctx, d.x, d.y);
        // Flagpoles need wave animation — redraw over bgCanvas spot
        if (d.kind === "flagpole") _drawFlagpole(ctx, d.x, d.y, CE.colors.primary, d.tall);
    });
}

// ─── CAMP UI ──────────────────────────────────────────────────────────────────
function _buildCampUI() {
    if (!document.getElementById("camp-action-wrapper")) {
        const wrap = document.createElement("div");
        wrap.id = "camp-action-wrapper";
        wrap.style.cssText = "position:fixed;bottom:24px;left:16px;z-index:15;display:none;flex-direction:column;align-items:flex-start;gap:6px;pointer-events:auto;";
        const btn = document.createElement("button");
        btn.id = "encamp-btn";
        btn.className = "menu-btn";
        btn.style.cssText = "min-height:48px;min-width:130px;font-size:1rem;padding:10px 18px;touch-action:manipulation;";
        btn.innerHTML = "⛺ ENCAMP";
        btn.onclick = () => window.launchCamp();
        const note = document.createElement("div");
        note.id = "camp-terrain-note";
        note.style.cssText = "font-size:9px;color:#ff5252;font-family:Georgia,serif;display:none;";
        note.textContent = "⛔ Cannot camp on water";
        wrap.appendChild(btn); wrap.appendChild(note);
        document.body.appendChild(wrap);
    }

    if (!document.getElementById("packup-wrapper")) {
        const pw = document.createElement("div");
        pw.id = "packup-wrapper";
        pw.style.cssText = "position:fixed;bottom:24px;left:16px;z-index:3000;display:none;flex-direction:column;align-items:flex-start;gap:8px;pointer-events:auto;";
        const pbtn = document.createElement("button");
        pbtn.id = "packup-btn";
        pbtn.className = "menu-btn";
        pbtn.style.cssText = "min-height:48px;min-width:150px;font-size:0.95rem;padding:10px 16px;touch-action:manipulation;background:linear-gradient(to bottom,#4a3010,#2a1a05);";
        pbtn.innerHTML = "📦 PACK UP CAMP";
        pbtn.onclick = () => window.packUpCamp();
        pw.appendChild(pbtn);

        const info = document.createElement("div");
        info.id = "camp-info-panel";
        info.style.cssText = "background:rgba(10,5,0,0.88);border:1px solid #d4b886;padding:8px 14px;font-family:Georgia,serif;font-size:11px;color:#d4b886;line-height:1.7;min-width:155px;border-radius:3px;";
        info.innerHTML = `
            <div style="color:#ffca28;font-weight:bold;margin-bottom:4px;font-size:10px;letter-spacing:1px;">⛺ ENCAMPED</div>
            <div>⚔️ Cohesion: <span id="camp-coh-val" style="color:#8bc34a;">70</span>%
            &nbsp;<span id="camp-coh-label" style="font-size:9px;"></span></div>
            <div>🌾 Foraged: <span id="camp-forage-val" style="color:#ffca28;">+0</span> food</div>
            <div id="camp-time-display" style="color:#888;font-size:9px;">Resting...</div>
            <div id="camp-ambush-status" style="color:#ff5252;font-size:9px;display:none;">⚠️ UNDER ATTACK!</div>
        `;
        pw.appendChild(info);
        document.body.appendChild(pw);
    }

 
		
		//claude ran out of memory so i found an older code to stich
		
		
		
    // Loading bar container (enter/leave)
    if (!document.getElementById("camp-load-bar-wrapper")) {
        const lb = document.createElement("div");
        lb.id = "camp-load-bar-wrapper";
        lb.style.cssText = "position:fixed;bottom:0;left:0;width:100%;z-index:9999;display:none;flex-direction:column;align-items:center;justify-content:center;padding:0 0 8px 0;background:rgba(0,0,0,0.7);pointer-events:none;";

        const ltext = document.createElement("div");
        ltext.id = "camp-load-text";
        ltext.style.cssText = "font-family:Georgia,serif;font-size:12px;color:#d4b886;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;text-shadow:1px 1px 2px #000;";
        ltext.textContent = "Setting up camp...";

        const ltrack = document.createElement("div");
        ltrack.style.cssText = "width:280px;height:8px;background:#1a1a1a;border:1px solid #5d4037;border-radius:2px;overflow:hidden;";
        const lfill = document.createElement("div");
        lfill.id = "camp-load-fill";
        lfill.style.cssText = "width:0%;height:100%;background:linear-gradient(to right,#8b0000,#ffca28);transition:width 0.1s linear;";
        ltrack.appendChild(lfill);

        lb.appendChild(ltext); lb.appendChild(ltrack);
        document.body.appendChild(lb);
    }
}

function _updateCampButtonVisibility() {
    const btn = document.getElementById("camp-action-wrapper");
    if (!btn) return;

    // 1. Basic Overworld & City States
    const isNearCity = (typeof activeCity !== "undefined" && activeCity !== null);
    const isVisitingCity = (typeof inCityMode !== "undefined" && inCityMode);
    const isCamping = (typeof window.inCampMode !== "undefined" && window.inCampMode);

    // 2. Combat & Siege States
    const isBattling = (typeof inBattleMode !== "undefined" && inBattleMode);
    // CRITICAL: Prevents camping while the overworld "Under Siege" ring/timer is active
    const isOverworldSieging = (typeof player !== "undefined" && player.isSieging); 

    // 3. Custom Battle States
    // Prevents bleed-through during the setup menu before the battle officially starts
    const isCustomBattleMenu = document.getElementById("cb-menu-container") !== null;
    const isLiveCustomBattle = (typeof window.__IS_CUSTOM_BATTLE__ !== "undefined" && window.__IS_CUSTOM_BATTLE__);

    // 4. UI/Menu Freezes
    // Prevents camping while talking to NPCs or viewing the Diplomacy matrix
    const isTalking = (typeof inParleMode !== "undefined" && inParleMode);
    // Prevents camping if the mobile details drawer is open
    const isMobileDrawer = (typeof window.isMobileDrawerOpen !== "undefined" && window.isMobileDrawerOpen);

    // --- THE MASTER LOCK ---
    // The button ONLY shows if EVERY single one of these interfering states is false.
    const shouldShow = !isBattling && 
                       !isVisitingCity && 
                       !isCamping && 
                       !isNearCity && 
                       !isOverworldSieging && 
                       !isCustomBattleMenu && 
                       !isLiveCustomBattle && 
                       !isTalking && 
                       !isMobileDrawer;

    btn.style.display = shouldShow ? "flex" : "none";
    
    // If we shouldn't show it, exit early so we don't waste CPU checking terrain
    if (!shouldShow) return;

    // --- TERRAIN CHECK (Only runs if safely on the Overworld) ---
    if (typeof player !== "undefined" && typeof worldMap !== "undefined" && typeof TILE_SIZE !== "undefined") {
        const tx = Math.max(0, Math.floor(player.x / TILE_SIZE));
        const ty = Math.max(0, Math.floor(player.y / TILE_SIZE));
        const tile = (worldMap[tx] && worldMap[tx][ty]) ? worldMap[tx][ty] : { name: "Plains" };
        
        const banned = ["Coastal", "River", "Ocean"];
        const isBanned = banned.includes(tile.name);
        
        const encampBtn = document.getElementById("encamp-btn");
        const note = document.getElementById("camp-terrain-note");
        
        if (encampBtn) {
            encampBtn.disabled = isBanned;
            encampBtn.style.opacity = isBanned ? "0.45" : "1";
        }
        if (note) {
            note.style.display = isBanned ? "block" : "none";
        }
    }
}

function _refreshCampInfoPanel() {
    if (typeof player === "undefined") return;
    if (player.cohesion === undefined) player.cohesion = 70;
    const cv = document.getElementById("camp-coh-val");
    const cl = document.getElementById("camp-coh-label");
    const fv = document.getElementById("camp-forage-val");
    const td = document.getElementById("camp-time-display");
    if (cv) { cv.textContent = Math.floor(player.cohesion); cv.style.color = cohLabel(player.cohesion).c; }
    if (cl) { const lbl = cohLabel(player.cohesion); cl.textContent = lbl.t; cl.style.color = lbl.c; }
    if (fv) fv.textContent = "+" + Math.floor(CE.foraged);
    if (td) {
        const sec = Math.floor(CE.campTime);
        td.textContent = `Resting ${sec < 60 ? sec+"s" : Math.floor(sec/60)+"m "+Math.floor(sec%60)+"s"}`;
    }
}

function _setLoadBar(pct, label) {
    const wrap = document.getElementById("camp-load-bar-wrapper");
    const fill = document.getElementById("camp-load-fill");
    const text = document.getElementById("camp-load-text");
    if (!wrap) return;
    if (pct <= 0) { wrap.style.display = "none"; return; }
    wrap.style.display = "flex";
    if (fill) fill.style.width = Math.min(100, pct) + "%";
    if (text) text.textContent = label || "Loading...";
}

// ─── MAIN CAMP TICK (UPDATE) ──────────────────────────────────────────────────
function _campTick() {
    if (typeof player === "undefined") return;
    if (player.cohesion === undefined) player.cohesion = 70;

    const dt = 1 / 60;
    CE.campTime += dt;

    // Cohesion gain
    CE.cohTimer += dt;
    if (CE.cohTimer >= 1) {
        CE.cohTimer = 0;
        player.cohesion = Math.min(100, player.cohesion + COHESION_RATE);
        CE.cohGain += COHESION_RATE;
    }

// --- REPLACE WITH THIS ---
    // Foraging (Paused if camp is under ambush)
    if (!CE.ambushActive) {
        CE.forageTimer += dt;
        if (CE.forageTimer >= 1) {
            CE.forageTimer = 0;
            // Forage efficiency increases slightly with troop count
            const base = FORAGE_RATE * (1 + (player.troops || 1) * 0.25);
            const amt = Math.floor(base + Math.random() * 2);
            CE.foraged += amt;
            // Optional: You could add a log here if you want to see it in the console
        }
    }

    _updateCampTroops();
	_updateDialogues();
    _tickAmbushSystem(dt);   // ← ADD: ambush timer + combat AI
  if (typeof window.campCombatTick === "function") window.campCombatTick(dt);
  _refreshCampInfoPanel();
    _updateCampButtonVisibility();

    // Player movement (reuse key input)
    if (!CE.packingUp && !CE.entering) {
        const speed = 2.5;
        let dx = 0, dy = 0;
        if (typeof keys !== "undefined") {
            if (keys["w"] || keys["arrowup"])    dy -= speed;
            if (keys["s"] || keys["arrowdown"])  dy += speed;
            if (keys["a"] || keys["arrowleft"])  dx -= speed;
            if (keys["d"] || keys["arrowright"]) dx += speed;
        }
        if (dx || dy) {
            const nx = player.x + dx, ny = player.y + dy;
            if (!_campCollision(nx, player.y)) player.x = nx;
            if (!_campCollision(player.x, ny)) player.y = ny;
            if (dx !== 0) player.direction = dx > 0 ? 1 : -1;
            player.isMoving = true;
            player.anim = (player.anim || 0) + 1;
        } else {
            player.isMoving = false;
        }
    }

    // Smooth camera
    CE.camX += (player.x - CE.camX) * 0.12;
    CE.camY += (player.y - CE.camY) * 0.12;

    // Enter animation
    if (CE.entering) {
        CE.enterProg = Math.min(100, CE.enterProg + 1.4);
        _setLoadBar(CE.enterProg, "Setting up camp...");
        if (CE.enterProg >= 100) {
            CE.entering = false;
            _setLoadBar(0);
        }
    }

    // Pack up animation
    if (CE.packingUp) {
        CE.packProg = Math.min(100, CE.packProg + 0.75);
        _setLoadBar(CE.packProg, "Breaking camp...");
        if (CE.packProg >= 100) {
            _finishPackUp();
        }
    }
}

// ─── MAIN CAMP RENDER ─────────────────────────────────────────────────────────
function _campRender() {
    const { c: canvas, x: ctx } = _gc();
    if (!canvas || !ctx) return;
    const cw = canvas.width, ch = canvas.height;

    // Clamp camera
    const camX = Math.max(cw / 2, Math.min(CE.camX, CAMP_W - cw / 2));
    const camY = Math.max(ch / 2, Math.min(CE.camY, CAMP_H - ch / 2));
    const offX = cw / 2 - camX;
    const offY = ch / 2 - camY;

    // 1. Dusk sky (screen space)
    _drawDuskSky(ctx, cw, ch);

    // 2. World-space elements
    ctx.save();
    ctx.translate(offX, offY);

    // 2a. Static background (pre-rendered)
    if (CE.bgCanvas) {
        ctx.drawImage(CE.bgCanvas, 0, 0);
    }

    // 2a+. Chairs — added to CE.decos AFTER bgCanvas was built, so drawn here live.
    //       Must be BEFORE troops so chairs appear underneath soldiers, not on top.
    if (typeof window.campDrawChair === "function") {
        CE.decos.forEach(function(d) {
            if (d.kind === "chair") window.campDrawChair(ctx, d.x, d.y);
        });
    }

    // 2b. Campfires (animated)
    CE.fires.forEach(f => _drawAnimatedFire(ctx, f.x, f.y));
	
	
// 2c. Troops (sorted by Y)
    const visX = camX - offX, visY = camY - offY;
    _drawCampTroops(ctx);
    _drawDynamicDecos(ctx);   // ← ADD: flickering lanterns, cooking steam, waving flags

    // 2d. Guards (tier 3)
    if (CE.tier === 3) _drawGuards(ctx);

    // 2e. Player
    _drawCampPlayer(ctx);

// 2f. Dialogue bubbles
    _drawDialogues(ctx);

 if (!window._CAMP_COMBAT_ACTIVE &&
       (CE.ambushActive || CE.ambushUnits.length > 0)) _drawAmbushUnits(ctx);
 if (typeof window.campCombatRender === "function") window.campCombatRender(ctx);
 
 
 
    ctx.restore();

    // 3. Screen-space overlays
    _drawDuskOverlay(ctx, cw, ch);
    _drawStars(ctx, cw, ch);
_drawVignette(ctx, cw, ch);
    _drawAmbushOverlays(ctx, cw, ch);  // ← ADD: red flash, bandit count bar, HP bar

 
    // 5. Camp tier badge (TOP-LEFT, two lines, ~8% screen width)
    ctx.save();
    const tierNames = ["", "SMALL CAMP", "MEDIUM CAMP", "MILITARY CAMP"];
    const _badgeW = Math.max(82, Math.floor(cw * 0.08));
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(5, 5, _badgeW, 33);
    ctx.textAlign = "left";
    ctx.font = "bold 8px Georgia";
    ctx.fillStyle = "#ffca28";
    ctx.fillText("\u26FA " + (tierNames[CE.tier] || "CAMP"), 9, 18);
    ctx.font = "6px Georgia";
    ctx.fillStyle = "#d4b886";
    const _factionTrunc = CE.faction.toUpperCase().slice(0, Math.floor(_badgeW / 4.5));
    ctx.fillText(_factionTrunc, 9, 31);
    ctx.restore();
}

// ─── LAUNCH & LEAVE ────────────────────────────────────────────────────────────
window.launchCamp = function () {
    if (window.inCampMode) return;
    if (window.inBattleMode || (typeof inCityMode !== "undefined" && inCityMode)) return;
    if (typeof player === "undefined") return;

    // Terrain check
    if (typeof worldMap !== "undefined" && typeof TILE_SIZE !== "undefined") {
        const tx = Math.floor(player.x / TILE_SIZE);
        const ty = Math.floor(player.y / TILE_SIZE);
        const tile = (worldMap[tx] && worldMap[tx][ty]) ? worldMap[tx][ty] : { name: "Plains" };
        const banned = ["Coastal", "River", "Ocean"];
        if (banned.includes(tile.name)) {
            _logEvent("Cannot encamp on water terrain.");
            return;
        }
    }

    // Determine tier
    const troops = typeof player !== "undefined" ? (player.troops || 0) : 0;
    const tier = troops <= 20 ? 1 : troops <= 100 ? 2 : 3;

// Get faction colors
    const faction = (typeof player !== "undefined" && player.faction) ? player.faction : "Hong Dynasty";
    const colors = getFactionColors(faction);
    const troopColor = (typeof FACTIONS !== "undefined" && FACTIONS[faction]) ? FACTIONS[faction].color : colors.primary;

    // Build environment
    CE.tier      = tier;
    CE.faction   = faction;
    CE.colors    = colors;
    CE.troopColor = troopColor; // <-- Saved for the rendering engine!
    CE.tents     = [];
    CE.fires     = [];
    CE.decos     = [];
    CE.guards    = [];
    CE.troops    = [];
    CE.dialogues = [];
    CE.campTime  = 0;
    CE.cohGain   = 0;
    CE.foraged   = 0;
    CE.forageTimer = 0;
    CE.cohTimer  = 0;
    CE.packingUp = false;
    CE.packProg  = 0;
    CE.entering  = true;
    CE.enterProg = 0;

    if      (tier === 1) _generateTier1();
    else if (tier === 2) _generateTier2();
    else                 _generateTier3();
// Extract terrain type from overworld
    let terrainName = "Plains";
    if (typeof worldMap !== "undefined" && typeof TILE_SIZE !== "undefined") {
        const tx = Math.floor(player.x / TILE_SIZE);
        const ty = Math.floor(player.y / TILE_SIZE);
        if (worldMap[tx] && worldMap[tx][ty]) terrainName = worldMap[tx][ty].name;
    }

    // Generate specific surrounding biomes (trees, rocks, mud)
    _generateCampEnvironment(terrainName, colors);

    CE.bgCanvas = _buildBgCanvas(tier, colors);
    // Set player to camp center
    CE.savedWorldX = player.x; // <-- SAVED
    CE.savedWorldY = player.y; // <-- SAVED
    
    player.x = CAMP_CX;
    player.y = CAMP_CY + 60;
    player.isMoving = false;
    CE.camX = player.x;
    CE.camY = player.y;

    _initCampTroops(troopColor); // <-- Passed the actual Faction Color
    _generateStars(window.innerWidth || 800, window.innerHeight || 600);

    // Show pack-up UI
    const pw = document.getElementById("packup-wrapper");
    if (pw) pw.style.display = "flex";

    // Hide encamp button
    const ew = document.getElementById("camp-action-wrapper");
    if (ew) ew.style.display = "none";

    window.inCampMode = true;
    _logEvent(`Set up camp. Tier ${tier} ${faction} encampment.`);

	if (typeof AudioManager !== "undefined") {
			try { 
			
AudioManager.playRandomMP3List([
                    'music/gameloop1.mp3', 'music/gameloop2.mp3', 'music/gameloop3.mp3', 
                    'music/gameloop4.mp3', 'music/gameloop5.mp3', 'music/gameloop6.mp3', 
                    'music/gameloop7.mp3', 'music/gameloop8.mp3', 'music/gameloop9.mp3', 
                    'music/gameloop10.mp3'
                ]);

			} catch (e) {}
		}
	};

window.packUpCamp = function () {
    if (!window.inCampMode || CE.packingUp) return;
    CE.packingUp = true;
    CE.packProg = 0;
    const pbtn = document.getElementById("packup-btn");
    if (pbtn) { pbtn.disabled = true; pbtn.textContent = "Packing up..."; }
};

function _finishPackUp() {
    window.inCampMode = false;
    CE.packingUp = false;
    _setLoadBar(0);

    // Restore player position
    if (typeof player !== "undefined" && CE.savedWorldX !== undefined) {
        player.x = CE.savedWorldX;
        player.y = CE.savedWorldY;
    }

    // Apply foraging to player
    const finalFood = Math.floor(CE.foraged);
    const cohGained = Math.floor(CE.cohGain * 10) / 10;

    // ---> ADD THIS NEW BLOCK: Actually give the food to the player <---
    if (typeof player !== "undefined") {
        player.food = Math.min(player.maxFood || 2000, (player.food || 0) + finalFood);
    }
    // ------------------------------------------------------------------

    // ── Tally troop losses from any ambush combat ──────────────────────────
    // CE.troops was built from player.roster at camp launch.
    // Any troop whose hp hit 0 during the ambush counts as a real casualty.
    const _troopsAlive = CE.troops.filter(function(t){ return t.hp > 0; }).length;

	const _troopsLost  = Math.max(0, CE.troops.length - _troopsAlive);
    if (_troopsLost > 0 && typeof player !== "undefined") {
        player.troops = Math.max(0, (player.troops || 0) - _troopsLost);
        if (player.roster) {
            if (player.roster.length > _troopsLost) {
                // Remove from the end of the roster (the most-recently-added entries)
                player.roster.splice(player.roster.length - _troopsLost, _troopsLost);
            } else {
                player.roster = [];
            }
        }
        _logEvent(_troopsLost + " troop" + (_troopsLost !== 1 ? "s" : "") + " lost in camp ambush.");
    }
    // ────────────── 

    _logEvent(`Camp broken. Foraged ${finalFood} food. Cohesion +${cohGained.toFixed(1)}.`);

    // Reset pack-up UI
    const pw = document.getElementById("packup-wrapper");
    if (pw) pw.style.display = "none";
    const pbtn = document.getElementById("packup-btn");
    if (pbtn) { pbtn.disabled = false; pbtn.textContent = "📦 PACK UP CAMP"; }

    // Show world result message briefly
    _showCampResult(finalFood, cohGained);

if (typeof AudioManager !== "undefined") {
        try { 
		AudioManager.playRandomMP3List([
                    'music/gameloop1.mp3', 'music/gameloop2.mp3', 'music/gameloop3.mp3', 
                    'music/gameloop4.mp3', 'music/gameloop5.mp3', 'music/gameloop6.mp3', 
                    'music/gameloop7.mp3', 'music/gameloop8.mp3', 'music/gameloop9.mp3', 
                    'music/gameloop10.mp3'
                ]);

		} catch (e) {}
    }
}

function _showCampResult(food, coh) {
    let banner = document.getElementById("camp-result-banner");
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "camp-result-banner";
        banner.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(10,5,0,0.92);border:2px solid #d4b886;padding:20px 36px;font-family:Georgia,serif;color:#d4b886;text-align:center;z-index:9998;border-radius:6px;box-shadow:0 0 30px rgba(0,0,0,0.9);";
        document.body.appendChild(banner);
    }
    const cLabel = cohLabel(typeof player !== "undefined" ? player.cohesion : 70);
       // Count camp casualties for display (same calculation as _finishPackUp above)
    const _showAlive = CE.troops.filter(function(t){ return t.hp > 0; }).length;
    const _showLost  = Math.max(0, CE.troops.length - _showAlive);
    const _troopLine = _showLost > 0
        ? '<div style="margin-bottom:6px;">\u2694\uFE0F Troops lost: <span style="color:#ff5252;">-' + _showLost + '</span>'
          + ' &nbsp; Remaining: <span style="color:#8bc34a;">' + _showAlive + '</span></div>'
        : '<div style="margin-bottom:6px;">\uD83D\uDEE1\uFE0F Troops: <span style="color:#8bc34a;">No losses</span></div>';
    banner.innerHTML =
        '<div style="font-size:1.4rem;color:#ffca28;font-weight:bold;margin-bottom:10px;">\u26FA Camp Packed</div>'
      + '<div style="margin-bottom:6px;">\uD83C\uDF3E Food foraged: <span style="color:#8bc34a;">+' + food + '</span></div>'
      + _troopLine
      + '<div style="margin-bottom:6px;">\u2694\uFE0F Cohesion: <span style="color:' + cLabel.c + ';">' + cLabel.t + '</span></div>'
      + '<div style="font-size:0.75rem;color:#888;margin-top:8px;">Returning to overworld...</div>';
    banner.style.display = "block";
    setTimeout(() => { if (banner) banner.style.display = "none"; }, 2500);
}

// ─── DRAW FUNCTION PATCH ──────────────────────────────────────────────────────
function _patchDraw() {
    if (typeof window.draw !== "function") {
        setTimeout(_patchDraw, 150);
        return;
    }
const _origDraw = window.draw;
window.draw = function () {
    if (window.inCampMode) {
        _campTick();
        _campRender();
        requestAnimationFrame(() => { update(); draw(); }); // Surgery 1 makes update() a no-op in camp; RAF stays alive
    } else {
        _origDraw.apply(this, arguments);
    }
};
}

function _drawCampVignette(ctx) {
    const w = canvas.width;
    const h = canvas.height;

    ctx.save();
    // Reset transform so the darkness follows the screen, not the world coordinates
    ctx.setTransform(1, 0, 0, 1, 0, 0); 

    // 1. Create a base "Night Tint" (makes everything slightly blue/dark)
    ctx.fillStyle = "rgba(0, 5, 20, 0.15)"; // Very subtle dark blue tint
    ctx.fillRect(0, 0, w, h);

    // 2. Create the soft vignette
    // We use a larger radius (0.9 to 1.2) so it doesn't feel like a "tunnel"
    const grd = ctx.createRadialGradient(
        w / 2, h / 2, h * 0.2, // Inner circle (lightest area)
        w / 2, h / 2, w * 0.9  // Outer circle (darkest area)
    );
    
    grd.addColorStop(0, "rgba(0,0,0,0)");      // Center is clear
    grd.addColorStop(1, "rgba(0,0,0,0.45)");   // Edges are 45% dark

    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    ctx.restore();
}
// ─── CAMP BUTTON TICK HOOK ────────────────────────────────────────────────────
// Runs periodically to keep button visibility correct
setInterval(_updateCampButtonVisibility, 400);

// ─── COHESION DESERITON HOOK ──────────────────────────────────────────────────
// Patch into the world-map desertion logic (if accessible)
// The factor is exposed via window.campCohesionDesertionFactor() called from update.js
// update.js can optionally call: let desertFactor = (typeof campCohesionDesertionFactor === 'function') ? campCohesionDesertionFactor() : 1;

// ─── INITIALIZATION ───────────────────────────────────────────────────────────
function _init() {
    window.campInitCohesion();
    _buildCampUI();
    _patchDraw();
    // Small delay to ensure update.js draw() is defined
    console.log("[CampSystem] Initialized — Tier-aware medieval Asian encampment loaded.");
}

// Boot after all scripts are ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(_init, 800));
} else {
    setTimeout(_init, 800);
}

// ─── GLOBAL ALIASES ───────────────────────────────────────────────────────────
window.launchCamp       = window.launchCamp;
window.packUpCamp       = window.packUpCamp;
window.campApplyBattleOutcome = window.campApplyBattleOutcome;

})(); // end IIFE