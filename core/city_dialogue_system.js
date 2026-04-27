// ============================================================================
// CITY DIALOGUE SYSTEM - WEIGHTED COMMON-ENGLISH GRAMMAR ENGINE
// - Common forms appear much more often than rare ones
// - Verb conjugation supports: present / past / future / past participle
// - Subject agreement for: I, you, he, they, we
// - Floating RuneScape-style bubbles above NPCs
// - Dynamic ambient chatter when NPCs collide
// ============================================================================

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Frequency model
  // Common language should dominate. Rare grammar should stay rare.
  // Weights are intentionally biased toward simple, everyday speech.
  // ---------------------------------------------------------------------------
  const FREQUENCY = {
    common: 10,
    normal: 4,
    uncommon: 1.5,
    rare: 0.3
  };

function weightedPick(items) {
    let total = 0;
    for (const item of items) total += Math.max(0, item.weight || 0);
    
    // Fallback to returning the whole object if .value is undefined
    if (total <= 0) return items[0]?.value ?? items[0];

    let roll = Math.random() * total;
    for (const item of items) {
      roll -= Math.max(0, item.weight || 0);
      if (roll <= 0) return item.value ?? item;
    }
    
    const last = items[items.length - 1];
    return last?.value ?? last;
  }

  function clampWords(text, minWords, maxWords) {
    const count = text.trim().split(/\s+/).filter(Boolean).length;
    return count >= minWords && count <= maxWords;
  }

  // ---------------------------------------------------------------------------
  // Grammar banks
  // Keep these small for now, but weight the common ones much higher.
  // ---------------------------------------------------------------------------
const SUBJECTS = [
  { value: "I", weight: FREQUENCY.common },
  { value: "you", weight: FREQUENCY.common },
  { value: "he", weight: FREQUENCY.normal },
  { value: "they", weight: FREQUENCY.common },
  { value: "we", weight: FREQUENCY.common },

  { value: "the guard", weight: FREQUENCY.normal },
  { value: "the merchant", weight: FREQUENCY.normal },
  { value: "the citizen", weight: FREQUENCY.normal },
  { value: "the patrol", weight: FREQUENCY.normal },
  { value: "the captain", weight: FREQUENCY.uncommon },
  { value: "the elder", weight: FREQUENCY.uncommon },
  { value: "our city", weight: FREQUENCY.uncommon },
  { value: "this place", weight: FREQUENCY.uncommon },
  { value: "the watch", weight: FREQUENCY.uncommon },
  { value: "the ruler", weight: FREQUENCY.rare },

  { value: "my friend", weight: FREQUENCY.common },
  { value: "your friend", weight: FREQUENCY.common },
  { value: "his brother", weight: FREQUENCY.normal },
  { value: "their group", weight: FREQUENCY.normal },
  { value: "our people", weight: FREQUENCY.common },
  { value: "the worker", weight: FREQUENCY.common },
  { value: "the traveler", weight: FREQUENCY.common },
  { value: "the farmer", weight: FREQUENCY.normal },
  { value: "the soldier", weight: FREQUENCY.normal },
  { value: "the guard captain", weight: FREQUENCY.uncommon },

  { value: "the crowd", weight: FREQUENCY.normal },
  { value: "the market guard", weight: FREQUENCY.normal },
  { value: "the young man", weight: FREQUENCY.common },
  { value: "the young woman", weight: FREQUENCY.common },
  { value: "the old man", weight: FREQUENCY.common },
  { value: "the old woman", weight: FREQUENCY.common },
  { value: "the shop owner", weight: FREQUENCY.normal },
  { value: "the blacksmith", weight: FREQUENCY.normal },
  { value: "the messenger", weight: FREQUENCY.normal },
  { value: "the lookout", weight: FREQUENCY.uncommon },

  { value: "the gate guard", weight: FREQUENCY.normal },
  { value: "the road patrol", weight: FREQUENCY.normal },
  { value: "the city watch", weight: FREQUENCY.normal },
  { value: "the local trader", weight: FREQUENCY.common },
  { value: "the visiting trader", weight: FREQUENCY.common },
  { value: "the caravan leader", weight: FREQUENCY.uncommon },
  { value: "the worker group", weight: FREQUENCY.common },
  { value: "the crowd here", weight: FREQUENCY.common },
  { value: "the people here", weight: FREQUENCY.common },
  { value: "the guards here", weight: FREQUENCY.normal }
];

const ADVERBS = [
  { value: "now", weight: FREQUENCY.common },
  { value: "today", weight: FREQUENCY.common },
  { value: "here", weight: FREQUENCY.common },
  { value: "quietly", weight: FREQUENCY.normal },
  { value: "carefully", weight: FREQUENCY.normal },
  { value: "slowly", weight: FREQUENCY.normal },
  { value: "quickly", weight: FREQUENCY.normal },
  { value: "always", weight: FREQUENCY.uncommon },
  { value: "often", weight: FREQUENCY.uncommon },
  { value: "sometimes", weight: FREQUENCY.uncommon },
  { value: "inside", weight: FREQUENCY.uncommon },
  { value: "outside", weight: FREQUENCY.uncommon },
  { value: "there", weight: FREQUENCY.uncommon },
  { value: "rarely", weight: FREQUENCY.rare },
  { value: "boldly", weight: FREQUENCY.rare },

  { value: "right now", weight: FREQUENCY.common },
  { value: "just now", weight: FREQUENCY.common },
  { value: "at once", weight: FREQUENCY.common },
  { value: "again", weight: FREQUENCY.common },
  { value: "soon", weight: FREQUENCY.common },
  { value: "later", weight: FREQUENCY.common },
  { value: "nearby", weight: FREQUENCY.common },
  { value: "back here", weight: FREQUENCY.normal },
  { value: "over there", weight: FREQUENCY.normal },
  { value: "up ahead", weight: FREQUENCY.normal },

  { value: "down here", weight: FREQUENCY.normal },
  { value: "right there", weight: FREQUENCY.normal },
  { value: "very quickly", weight: FREQUENCY.normal },
  { value: "very slowly", weight: FREQUENCY.normal },
  { value: "with ease", weight: FREQUENCY.normal },
  { value: "with effort", weight: FREQUENCY.normal },
  { value: "without delay", weight: FREQUENCY.uncommon },
  { value: "without fear", weight: FREQUENCY.uncommon },
  { value: "without care", weight: FREQUENCY.uncommon },
  { value: "in silence", weight: FREQUENCY.uncommon },

  { value: "in public", weight: FREQUENCY.uncommon },
  { value: "in private", weight: FREQUENCY.uncommon },
  { value: "by chance", weight: FREQUENCY.uncommon },
  { value: "on purpose", weight: FREQUENCY.uncommon },
  { value: "for now", weight: FREQUENCY.common },
  { value: "for today", weight: FREQUENCY.common },
  { value: "for a moment", weight: FREQUENCY.common },
  { value: "all day", weight: FREQUENCY.normal },
  { value: "all night", weight: FREQUENCY.normal },
  { value: "every day", weight: FREQUENCY.normal }
];

const OBJECTS = [
  { value: "the gate", weight: FREQUENCY.common },
  { value: "the road", weight: FREQUENCY.common },
  { value: "the market", weight: FREQUENCY.common },
  { value: "the wall", weight: FREQUENCY.common },
  { value: "the city", weight: FREQUENCY.common },
  { value: "the path", weight: FREQUENCY.normal },
  { value: "the trader", weight: FREQUENCY.normal },
  { value: "the food", weight: FREQUENCY.normal },
  { value: "the patrol", weight: FREQUENCY.normal },
  { value: "the river", weight: FREQUENCY.normal },
  { value: "the child", weight: FREQUENCY.uncommon },
  { value: "the rumor", weight: FREQUENCY.uncommon },
  { value: "the shield", weight: FREQUENCY.uncommon },
  { value: "the tower", weight: FREQUENCY.uncommon },
  { value: "the caravan", weight: FREQUENCY.rare },

  { value: "the entrance", weight: FREQUENCY.common },
  { value: "the exit", weight: FREQUENCY.common },
  { value: "the road ahead", weight: FREQUENCY.common },
  { value: "the crowd", weight: FREQUENCY.common },
  { value: "the people", weight: FREQUENCY.common },
  { value: "the guards", weight: FREQUENCY.common },
  { value: "the soldiers", weight: FREQUENCY.normal },
  { value: "the workers", weight: FREQUENCY.common },
  { value: "the traders", weight: FREQUENCY.common },
  { value: "the goods", weight: FREQUENCY.common },

  { value: "the supplies", weight: FREQUENCY.normal },
  { value: "the weapons", weight: FREQUENCY.normal },
  { value: "the tools", weight: FREQUENCY.normal },
  { value: "the horses", weight: FREQUENCY.normal },
  { value: "the carts", weight: FREQUENCY.normal },
  { value: "the stalls", weight: FREQUENCY.common },
  { value: "the buildings", weight: FREQUENCY.common },
  { value: "the houses", weight: FREQUENCY.common },
  { value: "the street", weight: FREQUENCY.common },
  { value: "the square", weight: FREQUENCY.common },

  { value: "the bridge", weight: FREQUENCY.normal },
  { value: "the tower gate", weight: FREQUENCY.uncommon },
  { value: "the city walls", weight: FREQUENCY.common },
  { value: "the outer road", weight: FREQUENCY.normal },
  { value: "the inner road", weight: FREQUENCY.normal },
  { value: "the storage", weight: FREQUENCY.uncommon },
  { value: "the checkpoint", weight: FREQUENCY.normal },
  { value: "the entrance path", weight: FREQUENCY.normal },
  { value: "the side road", weight: FREQUENCY.common },
  { value: "the main road", weight: FREQUENCY.common }
];

const INDIRECT_OBJECTS = [
  { value: "to you", weight: FREQUENCY.common },
  { value: "to me", weight: FREQUENCY.common },
  { value: "to us", weight: FREQUENCY.common },
  { value: "to them", weight: FREQUENCY.normal },
  { value: "for the guard", weight: FREQUENCY.normal },
  { value: "for the patrol", weight: FREQUENCY.normal },
  { value: "for our city", weight: FREQUENCY.normal },
  { value: "for the people", weight: FREQUENCY.normal },
  { value: "for the watch", weight: FREQUENCY.uncommon },
  { value: "for the elders", weight: FREQUENCY.uncommon },
  { value: "for the captain", weight: FREQUENCY.rare },
  { value: "for my family", weight: FREQUENCY.uncommon },
  { value: "for the travelers", weight: FREQUENCY.uncommon },
  { value: "for the ruler", weight: FREQUENCY.rare },

  { value: "to the guard", weight: FREQUENCY.common },
  { value: "to the captain", weight: FREQUENCY.normal },
  { value: "to the patrol", weight: FREQUENCY.common },
  { value: "to the people here", weight: FREQUENCY.common },
  { value: "to the workers", weight: FREQUENCY.common },
  { value: "to the traders", weight: FREQUENCY.common },
  { value: "to the soldiers", weight: FREQUENCY.normal },
  { value: "to the watch", weight: FREQUENCY.normal },
  { value: "to the city", weight: FREQUENCY.common },
  { value: "to the crowd", weight: FREQUENCY.common },

  { value: "for the guards", weight: FREQUENCY.common },
  { value: "for the workers", weight: FREQUENCY.common },
  { value: "for the traders", weight: FREQUENCY.common },
  { value: "for the soldiers", weight: FREQUENCY.normal },
  { value: "for the city watch", weight: FREQUENCY.normal },
  { value: "for the gate guard", weight: FREQUENCY.normal },
  { value: "for the road patrol", weight: FREQUENCY.normal },
  { value: "for the people here", weight: FREQUENCY.common },
  { value: "for everyone", weight: FREQUENCY.common },
  { value: "for someone", weight: FREQUENCY.common },

  { value: "to everyone", weight: FREQUENCY.common },
  { value: "to someone", weight: FREQUENCY.common },
  { value: "to no one", weight: FREQUENCY.uncommon },
  { value: "for no one", weight: FREQUENCY.uncommon },
  { value: "to my friend", weight: FREQUENCY.common },
  { value: "to your friend", weight: FREQUENCY.common },
  { value: "to his brother", weight: FREQUENCY.normal },
  { value: "to their group", weight: FREQUENCY.normal },
  { value: "for our group", weight: FREQUENCY.common },
  { value: "for their group", weight: FREQUENCY.normal }
];

  const COMPLEMENTS = [
    { value: "safe", weight: FREQUENCY.common },
    { value: "ready", weight: FREQUENCY.common },
    { value: "busy", weight: FREQUENCY.common },
    { value: "open", weight: FREQUENCY.common },
    { value: "quiet", weight: FREQUENCY.common },
    { value: "strong", weight: FREQUENCY.normal },
    { value: "clean", weight: FREQUENCY.normal },
    { value: "steady", weight: FREQUENCY.normal },
    { value: "bright", weight: FREQUENCY.uncommon },
    { value: "crowded", weight: FREQUENCY.uncommon },
    { value: "closed", weight: FREQUENCY.uncommon },
    { value: "broken", weight: FREQUENCY.uncommon },
    { value: "frozen", weight: FREQUENCY.rare },
    { value: "peaceful", weight: FREQUENCY.rare }
  ];

  const MANNERS = [
    { value: "with care", weight: FREQUENCY.common },
    { value: "with respect", weight: FREQUENCY.common },
    { value: "with caution", weight: FREQUENCY.common },
    { value: "with honor", weight: FREQUENCY.normal },
    { value: "with patience", weight: FREQUENCY.normal },
    { value: "with speed", weight: FREQUENCY.normal },
    { value: "with courage", weight: FREQUENCY.uncommon },
    { value: "with worry", weight: FREQUENCY.uncommon },
    { value: "like friends", weight: FREQUENCY.uncommon },
    { value: "like strangers", weight: FREQUENCY.rare }
  ];

  const TIMES = [
    { value: "now", weight: FREQUENCY.common },
    { value: "today", weight: FREQUENCY.common },
    { value: "this morning", weight: FREQUENCY.normal },
    { value: "this evening", weight: FREQUENCY.normal },
    { value: "at dawn", weight: FREQUENCY.normal },
    { value: "at noon", weight: FREQUENCY.uncommon },
    { value: "at night", weight: FREQUENCY.uncommon },
    { value: "before sunset", weight: FREQUENCY.uncommon },
    { value: "after work", weight: FREQUENCY.uncommon },
    { value: "for a while", weight: FREQUENCY.uncommon },
    { value: "yesterday", weight: FREQUENCY.rare },
    { value: "tomorrow", weight: FREQUENCY.rare }
  ];

  const PLACES = [
    { value: "here", weight: FREQUENCY.common },
    { value: "inside the city", weight: FREQUENCY.common },
    { value: "near the gate", weight: FREQUENCY.common },
    { value: "by the market", weight: FREQUENCY.common },
    { value: "at the wall", weight: FREQUENCY.normal },
    { value: "at the plaza", weight: FREQUENCY.normal },
    { value: "on the road", weight: FREQUENCY.normal },
    { value: "by the tower", weight: FREQUENCY.normal },
    { value: "at the bridge", weight: FREQUENCY.uncommon },
    { value: "beside the stalls", weight: FREQUENCY.uncommon },
    { value: "outside the hall", weight: FREQUENCY.uncommon },
    { value: "in the square", weight: FREQUENCY.uncommon },
    { value: "near the river", weight: FREQUENCY.rare },
    { value: "under the roof", weight: FREQUENCY.rare }
  ];

  const REASONS = [
    { value: "because of trade", weight: FREQUENCY.common },
    { value: "because of duty", weight: FREQUENCY.common },
    { value: "because of danger", weight: FREQUENCY.normal },
    { value: "because of the road", weight: FREQUENCY.normal },
    { value: "because of the gate", weight: FREQUENCY.normal },
    { value: "because of rain", weight: FREQUENCY.uncommon },
    { value: "because of family", weight: FREQUENCY.uncommon },
    { value: "because of honor", weight: FREQUENCY.uncommon },
    { value: "because of fear", weight: FREQUENCY.uncommon },
    { value: "because of peace", weight: FREQUENCY.rare },
    { value: "because of the war", weight: FREQUENCY.rare }
  ];

  const CONDITIONS = [
    { value: "if the gate opens", weight: FREQUENCY.common },
    { value: "if you are ready", weight: FREQUENCY.common },
    { value: "if the road is clear", weight: FREQUENCY.common },
    { value: "if the city is calm", weight: FREQUENCY.normal },
    { value: "if the patrol returns", weight: FREQUENCY.normal },
    { value: "if rain stops", weight: FREQUENCY.uncommon },
    { value: "if the captain agrees", weight: FREQUENCY.uncommon },
    { value: "if the walls hold", weight: FREQUENCY.uncommon },
    { value: "if the moon rises", weight: FREQUENCY.rare }
  ];

const VERBS = [
  { base: "see", present3: "sees", past: "saw", participle: "seen", weight: FREQUENCY.common },
  { base: "know", present3: "knows", past: "knew", participle: "known", weight: FREQUENCY.common },
  { base: "find", present3: "finds", past: "found", participle: "found", weight: FREQUENCY.common },
  { base: "bring", present3: "brings", past: "brought", participle: "brought", weight: FREQUENCY.common },
  { base: "carry", present3: "carries", past: "carried", participle: "carried", weight: FREQUENCY.common },
  { base: "guard", present3: "guards", past: "guarded", participle: "guarded", weight: FREQUENCY.common },
  { base: "watch", present3: "watches", past: "watched", participle: "watched", weight: FREQUENCY.common },
  { base: "help", present3: "helps", past: "helped", participle: "helped", weight: FREQUENCY.common },
  { base: "trade", present3: "trades", past: "traded", participle: "traded", weight: FREQUENCY.common },
  { base: "visit", present3: "visits", past: "visited", participle: "visited", weight: FREQUENCY.common },

  { base: "meet", present3: "meets", past: "met", participle: "met", weight: FREQUENCY.common },
  { base: "hear", present3: "hears", past: "heard", participle: "heard", weight: FREQUENCY.common },
  { base: "trust", present3: "trusts", past: "trusted", participle: "trusted", weight: FREQUENCY.common },
  { base: "protect", present3: "protects", past: "protected", participle: "protected", weight: FREQUENCY.normal },
  { base: "follow", present3: "follows", past: "followed", participle: "followed", weight: FREQUENCY.normal },
  { base: "take", present3: "takes", past: "took", participle: "taken", weight: FREQUENCY.common },
  { base: "give", present3: "gives", past: "gave", participle: "given", weight: FREQUENCY.common },
  { base: "get", present3: "gets", past: "got", participle: "gotten", weight: FREQUENCY.common },
  { base: "make", present3: "makes", past: "made", participle: "made", weight: FREQUENCY.common },
  { base: "do", present3: "does", past: "did", participle: "done", weight: FREQUENCY.common },

  { base: "say", present3: "says", past: "said", participle: "said", weight: FREQUENCY.common },
  { base: "tell", present3: "tells", past: "told", participle: "told", weight: FREQUENCY.common },
  { base: "ask", present3: "asks", past: "asked", participle: "asked", weight: FREQUENCY.common },
  { base: "answer", present3: "answers", past: "answered", participle: "answered", weight: FREQUENCY.common },
  { base: "speak", present3: "speaks", past: "spoke", participle: "spoken", weight: FREQUENCY.common },
  { base: "talk", present3: "talks", past: "talked", participle: "talked", weight: FREQUENCY.common },
  { base: "call", present3: "calls", past: "called", participle: "called", weight: FREQUENCY.common },
  { base: "shout", present3: "shouts", past: "shouted", participle: "shouted", weight: FREQUENCY.normal },
  { base: "whisper", present3: "whispers", past: "whispered", participle: "whispered", weight: FREQUENCY.normal },
  { base: "warn", present3: "warns", past: "warned", participle: "warned", weight: FREQUENCY.normal },

  { base: "tell", present3: "tells", past: "told", participle: "told", weight: FREQUENCY.common },
  { base: "show", present3: "shows", past: "showed", participle: "shown", weight: FREQUENCY.common },
  { base: "point", present3: "points", past: "pointed", participle: "pointed", weight: FREQUENCY.common },
  { base: "lift", present3: "lifts", past: "lifted", participle: "lifted", weight: FREQUENCY.common },
  { base: "drop", present3: "drops", past: "dropped", participle: "dropped", weight: FREQUENCY.common },
  { base: "hold", present3: "holds", past: "held", participle: "held", weight: FREQUENCY.common },
  { base: "keep", present3: "keeps", past: "kept", participle: "kept", weight: FREQUENCY.common },
  { base: "leave", present3: "leaves", past: "left", participle: "left", weight: FREQUENCY.common },
  { base: "return", present3: "returns", past: "returned", participle: "returned", weight: FREQUENCY.common },
  { base: "stay", present3: "stays", past: "stayed", participle: "stayed", weight: FREQUENCY.common },

  { base: "wait", present3: "waits", past: "waited", participle: "waited", weight: FREQUENCY.common },
  { base: "stand", present3: "stands", past: "stood", participle: "stood", weight: FREQUENCY.common },
  { base: "sit", present3: "sits", past: "sat", participle: "sat", weight: FREQUENCY.common },
  { base: "walk", present3: "walks", past: "walked", participle: "walked", weight: FREQUENCY.common },
  { base: "run", present3: "runs", past: "ran", participle: "run", weight: FREQUENCY.common },
  { base: "move", present3: "moves", past: "moved", participle: "moved", weight: FREQUENCY.common },
  { base: "come", present3: "comes", past: "came", participle: "come", weight: FREQUENCY.common },
  { base: "go", present3: "goes", past: "went", participle: "gone", weight: FREQUENCY.common },
  { base: "enter", present3: "enters", past: "entered", participle: "entered", weight: FREQUENCY.common },
  { base: "exit", present3: "exits", past: "exited", participle: "exited", weight: FREQUENCY.normal },

  { base: "open", present3: "opens", past: "opened", participle: "opened", weight: FREQUENCY.common },
  { base: "close", present3: "closes", past: "closed", participle: "closed", weight: FREQUENCY.common },
  { base: "lock", present3: "locks", past: "locked", participle: "locked", weight: FREQUENCY.common },
  { base: "unlock", present3: "unlocks", past: "unlocked", participle: "unlocked", weight: FREQUENCY.normal },
  { base: "start", present3: "starts", past: "started", participle: "started", weight: FREQUENCY.common },
  { base: "stop", present3: "stops", past: "stopped", participle: "stopped", weight: FREQUENCY.common },
  { base: "begin", present3: "begins", past: "began", participle: "begun", weight: FREQUENCY.common },
  { base: "end", present3: "ends", past: "ended", participle: "ended", weight: FREQUENCY.common },
  { base: "continue", present3: "continues", past: "continued", participle: "continued", weight: FREQUENCY.common },
  { base: "finish", present3: "finishes", past: "finished", participle: "finished", weight: FREQUENCY.common },

  { base: "build", present3: "builds", past: "built", participle: "built", weight: FREQUENCY.common },
  { base: "break", present3: "breaks", past: "broke", participle: "broken", weight: FREQUENCY.common },
  { base: "fix", present3: "fixes", past: "fixed", participle: "fixed", weight: FREQUENCY.common },
  { base: "repair", present3: "repairs", past: "repaired", participle: "repaired", weight: FREQUENCY.common },
  { base: "cut", present3: "cuts", past: "cut", participle: "cut", weight: FREQUENCY.common },
  { base: "split", present3: "splits", past: "split", participle: "split", weight: FREQUENCY.normal },
  { base: "dig", present3: "digs", past: "dug", participle: "dug", weight: FREQUENCY.common },
  { base: "dig up", present3: "digs up", past: "dug up", participle: "dug up", weight: FREQUENCY.uncommon },
  { base: "bake", present3: "bakes", past: "baked", participle: "baked", weight: FREQUENCY.common },
  { base: "cook", present3: "cooks", past: "cooked", participle: "cooked", weight: FREQUENCY.common },

  { base: "carry out", present3: "carries out", past: "carried out", participle: "carried out", weight: FREQUENCY.uncommon },
  { base: "bring back", present3: "brings back", past: "brought back", participle: "brought back", weight: FREQUENCY.common },
  { base: "take back", present3: "takes back", past: "took back", participle: "taken back", weight: FREQUENCY.normal },
  { base: "look for", present3: "looks for", past: "looked for", participle: "looked for", weight: FREQUENCY.common },
  { base: "look after", present3: "looks after", past: "looked after", participle: "looked after", weight: FREQUENCY.common },
  { base: "check", present3: "checks", past: "checked", participle: "checked", weight: FREQUENCY.common },
  { base: "check in", present3: "checks in", past: "checked in", participle: "checked in", weight: FREQUENCY.normal },
  { base: "check out", present3: "checks out", past: "checked out", participle: "checked out", weight: FREQUENCY.normal },
  { base: "move in", present3: "moves in", past: "moved in", participle: "moved in", weight: FREQUENCY.normal },
  { base: "move out", present3: "moves out", past: "moved out", participle: "moved out", weight: FREQUENCY.normal },

  { base: "turn", present3: "turns", past: "turned", participle: "turned", weight: FREQUENCY.common },
  { base: "turn back", present3: "turns back", past: "turned back", participle: "turned back", weight: FREQUENCY.normal },
  { base: "turn around", present3: "turns around", past: "turned around", participle: "turned around", weight: FREQUENCY.normal },
  { base: "carry on", present3: "carries on", past: "carried on", participle: "carried on", weight: FREQUENCY.normal },
  { base: "set", present3: "sets", past: "set", participle: "set", weight: FREQUENCY.common },
  { base: "set up", present3: "sets up", past: "set up", participle: "set up", weight: FREQUENCY.common },
  { base: "set down", present3: "sets down", past: "set down", participle: "set down", weight: FREQUENCY.normal },
  { base: "pick up", present3: "picks up", past: "picked up", participle: "picked up", weight: FREQUENCY.common },
  { base: "put down", present3: "puts down", past: "put down", participle: "put down", weight: FREQUENCY.common },
  { base: "give up", present3: "gives up", past: "gave up", participle: "given up", weight: FREQUENCY.normal },

  { base: "take off", present3: "takes off", past: "took off", participle: "taken off", weight: FREQUENCY.normal },
  { base: "put on", present3: "puts on", past: "put on", participle: "put on", weight: FREQUENCY.common },
  { base: "fill", present3: "fills", past: "filled", participle: "filled", weight: FREQUENCY.common },
  { base: "empty", present3: "empties", past: "emptied", participle: "emptied", weight: FREQUENCY.common },
  { base: "clean", present3: "cleans", past: "cleaned", participle: "cleaned", weight: FREQUENCY.common },
  { base: "wash", present3: "washes", past: "washed", participle: "washed", weight: FREQUENCY.common },
  { base: "dry", present3: "dries", past: "dried", participle: "dried", weight: FREQUENCY.normal },
  { base: "shake", present3: "shakes", past: "shook", participle: "shaken", weight: FREQUENCY.common },
  { base: "move aside", present3: "moves aside", past: "moves aside", participle: "moved aside", weight: FREQUENCY.normal },
  { base: "step aside", present3: "steps aside", past: "stepped aside", participle: "stepped aside", weight: FREQUENCY.normal },

  { base: "buy", present3: "buys", past: "bought", participle: "bought", weight: FREQUENCY.common },
  { base: "sell", present3: "sells", past: "sold", participle: "sold", weight: FREQUENCY.common },
  { base: "pay", present3: "pays", past: "paid", participle: "paid", weight: FREQUENCY.common },
  { base: "owe", present3: "owes", past: "owed", participle: "owed", weight: FREQUENCY.normal },
  { base: "charge", present3: "charges", past: "charged", participle: "charged", weight: FREQUENCY.common },
  { base: "cost", present3: "costs", past: "cost", participle: "cost", weight: FREQUENCY.common },
  { base: "earn", present3: "earns", past: "earned", participle: "earned", weight: FREQUENCY.common },
  { base: "save", present3: "saves", past: "saved", participle: "saved", weight: FREQUENCY.common },
  { base: "spend", present3: "spends", past: "spent", participle: "spent", weight: FREQUENCY.common },
  { base: "trade for", present3: "trades for", past: "traded for", participle: "traded for", weight: FREQUENCY.uncommon },

  { base: "wait for", present3: "waits for", past: "waited for", participle: "waited for", weight: FREQUENCY.common },
  { base: "look at", present3: "looks at", past: "looked at", participle: "looked at", weight: FREQUENCY.common },
  { base: "listen", present3: "listens", past: "listened", participle: "listened", weight: FREQUENCY.common },
  { base: "listen to", present3: "listens to", past: "listened to", participle: "listened to", weight: FREQUENCY.common },
  { base: "ask for", present3: "asks for", past: "asked for", participle: "asked for", weight: FREQUENCY.common },
  { base: "agree", present3: "agrees", past: "agreed", participle: "agreed", weight: FREQUENCY.common },
  { base: "refuse", present3: "refuses", past: "refused", participle: "refused", weight: FREQUENCY.common },
  { base: "choose", present3: "chooses", past: "chose", participle: "chosen", weight: FREQUENCY.common },
  { base: "prefer", present3: "prefers", past: "preferred", participle: "preferred", weight: FREQUENCY.common },
  { base: "need", present3: "needs", past: "needed", participle: "needed", weight: FREQUENCY.common },

  { base: "want", present3: "wants", past: "wanted", participle: "wanted", weight: FREQUENCY.common },
  { base: "like", present3: "likes", past: "liked", participle: "liked", weight: FREQUENCY.common },
  { base: "love", present3: "loves", past: "loved", participle: "loved", weight: FREQUENCY.common },
  { base: "hate", present3: "hates", past: "hated", participle: "hated", weight: FREQUENCY.normal },
  { base: "fear", present3: "fears", past: "feared", participle: "feared", weight: FREQUENCY.normal },
  { base: "hope", present3: "hopes", past: "hoped", participle: "hoped", weight: FREQUENCY.common },
  { base: "wish", present3: "wishes", past: "wished", participle: "wished", weight: FREQUENCY.common },
  { base: "feel", present3: "feels", past: "felt", participle: "felt", weight: FREQUENCY.common },
  { base: "think", present3: "thinks", past: "thought", participle: "thought", weight: FREQUENCY.common },
  { base: "believe", present3: "believes", past: "believed", participle: "believed", weight: FREQUENCY.common },

  { base: "understand", present3: "understands", past: "understood", participle: "understood", weight: FREQUENCY.common },
  { base: "remember", present3: "remembers", past: "remembered", participle: "remembered", weight: FREQUENCY.common },
  { base: "forget", present3: "forgets", past: "forgot", participle: "forgotten", weight: FREQUENCY.common },
  { base: "explain", present3: "explains", past: "explained", participle: "explained", weight: FREQUENCY.common },
  { base: "reply", present3: "replies", past: "replied", participle: "replied", weight: FREQUENCY.normal },
  { base: "ask again", present3: "asks again", past: "asked again", participle: "asked again", weight: FREQUENCY.normal },
  { base: "repeat", present3: "repeats", past: "repeated", participle: "repeated", weight: FREQUENCY.common },
  { base: "answer again", present3: "answers again", past: "answered again", participle: "answered again", weight: FREQUENCY.uncommon },
  { base: "call back", present3: "calls back", past: "called back", participle: "called back", weight: FREQUENCY.normal },
  { base: "send", present3: "sends", past: "sent", participle: "sent", weight: FREQUENCY.common },

  { base: "receive", present3: "receives", past: "received", participle: "received", weight: FREQUENCY.common },
  { base: "deliver", present3: "delivers", past: "delivered", participle: "delivered", weight: FREQUENCY.common },
  { base: "carry over", present3: "carries over", past: "carried over", participle: "carried over", weight: FREQUENCY.uncommon },
  { base: "pass", present3: "passes", past: "passed", participle: "passed", weight: FREQUENCY.common },
  { base: "pass by", present3: "passes by", past: "passed by", participle: "passed by", weight: FREQUENCY.normal },
  { base: "cross", present3: "crosses", past: "crossed", participle: "crossed", weight: FREQUENCY.common },
  { base: "enter", present3: "enters", past: "entered", participle: "entered", weight: FREQUENCY.common },
  { base: "leave", present3: "leaves", past: "left", participle: "left", weight: FREQUENCY.common },
  { base: "arrive", present3: "arrives", past: "arrived", participle: "arrived", weight: FREQUENCY.common },
  { base: "depart", present3: "departs", past: "departed", participle: "departed", weight: FREQUENCY.normal },

  { base: "attack", present3: "attacks", past: "attacked", participle: "attacked", weight: FREQUENCY.normal },
  { base: "defend", present3: "defends", past: "defended", participle: "defended", weight: FREQUENCY.normal },
  { base: "strike", present3: "strikes", past: "struck", participle: "struck", weight: FREQUENCY.normal },
  { base: "hit", present3: "hits", past: "hit", participle: "hit", weight: FREQUENCY.common },
  { base: "push", present3: "pushes", past: "pushed", participle: "pushed", weight: FREQUENCY.common },
  { base: "pull", present3: "pulls", past: "pulled", participle: "pulled", weight: FREQUENCY.common },
  { base: "throw", present3: "throws", past: "threw", participle: "thrown", weight: FREQUENCY.common },
  { base: "catch", present3: "catches", past: "caught", participle: "caught", weight: FREQUENCY.common },
  { base: "shoot", present3: "shoots", past: "shot", participle: "shot", weight: FREQUENCY.normal },
  { base: "kill", present3: "kills", past: "killed", participle: "killed", weight: FREQUENCY.normal },

  { base: "save", present3: "saves", past: "saved", participle: "saved", weight: FREQUENCY.common },
  { base: "lose", present3: "loses", past: "lost", participle: "lost", weight: FREQUENCY.common },
  { base: "win", present3: "wins", past: "won", participle: "won", weight: FREQUENCY.common },
  { base: "fail", present3: "fails", past: "failed", participle: "failed", weight: FREQUENCY.common },
  { base: "succeed", present3: "succeeds", past: "succeeded", participle: "succeeded", weight: FREQUENCY.normal },
  { base: "grow", present3: "grows", past: "grew", participle: "grown", weight: FREQUENCY.common },
  { base: "change", present3: "changes", past: "changed", participle: "changed", weight: FREQUENCY.common },
  { base: "improve", present3: "improves", past: "improved", participle: "improved", weight: FREQUENCY.common },
  { base: "repair", present3: "repairs", past: "repaired", participle: "repaired", weight: FREQUENCY.common },
  { base: "damage", present3: "damages", past: "damaged", participle: "damaged", weight: FREQUENCY.normal }
];

  function pick(arr) {
    return weightedPick(arr);
  }

  function titleize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function isThirdPersonSingular(subject) {
    return subject === "he" || subject === "she" || subject === "it" || /^the\s/i.test(subject);
  }

  function getAuxHave(subject) {
    return (subject === "he" || subject === "she" || subject === "it") ? "has" : "have";
  }

  function chooseVerbForm(subject, verb, tense) {
    switch (tense) {
      case "past":
        return verb.past;
      case "future":
        return `will ${verb.base}`;
      case "participle":
        return `${getAuxHave(subject)} ${verb.participle}`;
      case "present":
      default:
        return isThirdPersonSingular(subject) ? verb.present3 : verb.base;
    }
  }

  function pickVerb() {
    return pick(VERBS);
  }

  const PATTERNS = [
    { weight: 20, tokens: ["subject", "verb", "object"] },
    { weight: 18, tokens: ["subject", "verb"] },
    { weight: 16, tokens: ["subject", "auxVerb", "object"] },
    { weight: 14, tokens: ["subject", "verb", "object", "place"] },
    { weight: 12, tokens: ["subject", "verb", "object", "time"] },
    { weight: 10, tokens: ["subject", "verb", "object", "reason"] },
    { weight: 8, tokens: ["subject", "verb", "object", "place", "time"] },
    { weight: 6, tokens: ["subject", "auxVerb", "object", "place"] },
    { weight: 4, tokens: ["subject", "auxVerb", "object", "reason"] },
    { weight: 3, tokens: ["subject", "verb", "object", "manner", "time"] },
    { weight: 2, tokens: ["subject", "verb", "object", "place", "reason"] },
    { weight: 1, tokens: ["subject", "auxVerb", "object", "condition"] },
    { weight: 0.5, tokens: ["subject", "verb", "object", "time", "place", "reason"] }
  ];

  function tokenToText(token, ctx) {
    switch (token) {
      case "subject": return ctx.subject;
      case "verb": return ctx.verbText;
      case "auxVerb": return ctx.auxVerbText;
      case "object": return pick(OBJECTS);
      case "indirectObject": return pick(INDIRECT_OBJECTS);
      case "complement": return pick(COMPLEMENTS);
      case "manner": return pick(MANNERS);
      case "time": return pick(TIMES);
      case "place": return pick(PLACES);
      case "reason": return pick(REASONS);
      case "condition": return pick(CONDITIONS);
      case "adverb": return pick(ADVERBS);
      default: return "";
    }
  }

  function buildSentence(opts = {}) {
    const minWords = opts.minWords ?? 4;
    const maxWords = opts.maxWords ?? 15;
    const subject = opts.subject || pick(SUBJECTS);
    const tense = opts.tense || pick([
      { value: "present", weight: 14 },
      { value: "past", weight: 8 },
      { value: "future", weight: 5 },
      { value: "participle", weight: 3 }
    ]);
    const verb = opts.verb || pickVerb();

    const ctx = {
      subject,
      tense,
      verb,
      verbText: chooseVerbForm(subject, verb, tense),
      auxVerbText: chooseVerbForm(subject, verb, tense)
    };

    for (let tries = 0; tries < 50; tries++) {
      const pattern = pick(PATTERNS);
      const parts = [];

      for (const token of pattern.tokens) {
        const value = tokenToText(token, ctx);
        if (value) parts.push(value);
      }

      let text = parts.join(" ").replace(/\s+/g, " ").trim();
      text = text.replace(/\bto to\b/g, "to").replace(/\bfor for\b/g, "for").replace(/\bthe the\b/g, "the");

      const count = text.split(/\s+/).filter(Boolean).length;
      if (count < minWords || count > maxWords) continue;

      return titleize(text) + ".";
    }
    return titleize(`${subject} ${chooseVerbForm(subject, verb, tense)} ${pick(OBJECTS)}`) + ".";
  }

  // ---------------------------------------------------------------------------
  // City-contact dialogue
  // ---------------------------------------------------------------------------
  const CONTACT_TEMPLATES = {
    civilian: [
      { weight: 24, tokens: ["subject", "verb", "object"] },
      { weight: 18, tokens: ["subject", "verb", "object", "place"] },
      { weight: 14, tokens: ["subject", "verb", "object", "time"] },
      { weight: 10, tokens: ["subject", "verb", "object", "reason"] },
      { weight: 8, tokens: ["subject", "auxVerb", "object"] },
      { weight: 4, tokens: ["subject", "verb", "object", "manner"] },
      { weight: 2, tokens: ["subject", "auxVerb", "object", "place"] }
    ],
    patrol: [
      { weight: 24, tokens: ["subject", "verb", "object"] },
      { weight: 18, tokens: ["subject", "verb", "object", "place"] },
      { weight: 12, tokens: ["subject", "auxVerb", "object", "reason"] },
      { weight: 10, tokens: ["subject", "verb", "object", "time"] },
      { weight: 8, tokens: ["subject", "auxVerb", "object"] },
      { weight: 3, tokens: ["subject", "verb", "object", "condition"] }
    ]
  };

  function buildContactSentence(contactType = "civilian", factionName = "") {
    const template = weightedPick(CONTACT_TEMPLATES[contactType] || CONTACT_TEMPLATES.civilian);
    const subject = pick(SUBJECTS);
    const tense = weightedPick([
      { value: "present", weight: 18 },
      { value: "past", weight: 8 },
      { value: "future", weight: 5 },
      { value: "participle", weight: 3 }
    ]);
    const verb = pickVerb();

    const ctx = {
      subject,
      tense,
      verb,
      verbText: chooseVerbForm(subject, verb, tense),
      auxVerbText: chooseVerbForm(subject, verb, tense)
    };

    const parts = [];
    for (const token of template.tokens) {
      const value = tokenToText(token, ctx);
      if (value) parts.push(value);
    }

    if (factionName && Math.random() < 0.18) {
      parts.push(`in ${factionName.split(" ")[0]}`);
    }

    let text = parts.join(" ").replace(/\s+/g, " ").trim();
    text = text.replace(/\bthe the\b/g, "the");

    let words = text.split(/\s+/).filter(Boolean).length;
    if (words < 4) {
      text = `${subject} ${chooseVerbForm(subject, verb, tense)} ${pick(OBJECTS)} ${pick(PLACES)}`;
      words = text.split(/\s+/).filter(Boolean).length;
    }
    if (words > 15) {
      text = text.split(/\s+/).slice(0, 15).join(" ");
    }

    return titleize(text) + ".";
  }

  // ---------------------------------------------------------------------------
  // Floating Speech Bubble State (RuneScape Style)
  // ---------------------------------------------------------------------------
  const state = {
    bubbles: [],        // Stores multiple active bubbles
    minCooldown: 2000, 
    maxCooldown: 12000
  };

function showSpeech(text, opts = {}) {
    const clean = String(text || "").trim();
    if (!clean || !opts.npcRef) return; // Cannot render without NPC location

    state.bubbles.push({
      text: clean,
      expiresAt: performance.now() + (opts.durationMs ?? 4000), // Default 4 second visibility
      npcRef: opts.npcRef,
      isPlayerContact: !!opts.isPlayerContact
    });

    // --- ADD THIS LINE FOR TEXT-TO-SPEECH ---
    if (typeof cityTTSEngine !== 'undefined' && typeof player !== 'undefined') {
        cityTTSEngine.speakSpatial(clean, opts.npcRef, player);
    }
  }

  function isActive() {
    return state.bubbles.length > 0;
  }
 
  // Ambient Chatter Logic (HOOKED INTO NEW ENGINE)
  // ---------------------------------------------------------------------------
  function processAmbientChat(factionName) {
    // Run this check 10% of the time to look for conversational partners
    if (Math.random() > 0.10) return;

    const civilians = (typeof cityCosmeticNPCs !== "undefined" && cityCosmeticNPCs[factionName]) ? cityCosmeticNPCs[factionName] : [];
    const patrols = (typeof city_system_troop_storage !== "undefined" && city_system_troop_storage[factionName]) ? city_system_troop_storage[factionName] : [];

    const pool = civilians.concat(patrols);
    if (pool.length < 2) return;

    const speaker = pool[Math.floor(Math.random() * pool.length)];
    if (isOnContactCooldown(speaker) || speaker.__inConvo) return;

    // Look for someone nearby to have a deep conversation with
    let partner = null;
    for (let other of pool) {
      if (other === speaker || isOnContactCooldown(other) || other.__inConvo) continue;
      // Define a "bump" as being within ~35 pixels
      if (Math.abs(speaker.x - other.x) < 35 && Math.abs(speaker.y - other.y) < 35) {
        partner = other;
        break;
      }
    }

    if (partner) {
      // 50% chance to start a multi-round smart conversation if they bump
      if (Math.random() < 0.50 && typeof cityConversationEngine !== 'undefined') {
          cityConversationEngine.tryStartConversation(speaker, partner, factionName);
      } 
      // Otherwise, 10% chance to just say a random one-off grammar sentence
      else if (Math.random() < 0.10) {
          triggerNPCContact({
            factionName: factionName,
            contactType: civilians.includes(speaker) ? "civilian" : "patrol",
            npcRef: speaker,
            durationMs: 3000 + Math.random() * 2000, 
            isPlayerContact: false
          });
      }
    }
  }

function update() {
    const now = performance.now();
    // Clean up old bubbles
    state.bubbles = state.bubbles.filter(b => now < b.expiresAt);

    // Run ambient logic
    if (typeof currentActiveCityFaction !== 'undefined' && currentActiveCityFaction) {
      processAmbientChat(currentActiveCityFaction);
    }

    // IMPORTANT: This line makes the new conversation engine work!
    if (typeof cityConversationEngine !== 'undefined') {
        cityConversationEngine.update();
    }
  }

  function wrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ---------------------------------------------------------------------------
  // Floating Dynamic Render
  // ---------------------------------------------------------------------------
  function render(ctx) {
    if (!ctx || state.bubbles.length === 0) return;

    ctx.save();
    
    // We intentionally DO NOT reset the transform here!
    // We want to render in world-space so the bubbles stick over the moving NPCs.
    
    ctx.font = "bold 10px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const now = performance.now();

    for (const bubble of state.bubbles) {
        if (now > bubble.expiresAt || !bubble.npcRef) continue;

        const npc = bubble.npcRef;
        const maxTextWidth = 110; // Tight width like RuneScape
        
        const lines = wrapText(ctx, bubble.text, maxTextWidth);
        const paddingX = 6;
        const paddingY = 5;
        const lineHeight = 13;
        
        // Find exact required width based on longest wrapped line
        let maxLineWidth = 0;
        for (let l of lines) {
           let w = ctx.measureText(l).width;
           if(w > maxLineWidth) maxLineWidth = w;
        }

        const bubbleWidth = Math.min(maxTextWidth, maxLineWidth) + paddingX * 2;
        const bubbleHeight = lines.length * lineHeight + paddingY * 2;

        // Position over the NPC head
        const bottomY = npc.y - 32; 
        const topY = bottomY - bubbleHeight;
        const leftX = npc.x - bubbleWidth / 2;

        // Draw bubble background. CUSTOM COLOUR if player triggered, standard white/off-white otherwise
        ctx.fillStyle = bubble.isPlayerContact ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.92)";
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 1;

        roundRect(ctx, leftX, topY, bubbleWidth, bubbleHeight, 6);
        ctx.fill();
        ctx.stroke();

        // Draw pointer (speech tail) pointing to the NPC
        ctx.beginPath();
        ctx.moveTo(npc.x - 4, bottomY);
        ctx.lineTo(npc.x + 4, bottomY);
        ctx.lineTo(npc.x, bottomY + 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw text
        ctx.fillStyle = "#111111";
        let currentY = topY + paddingY;
        for (const line of lines) {
            ctx.fillText(line, npc.x, currentY);
            currentY += lineHeight;
        }
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Contact detection helpers
  // ---------------------------------------------------------------------------
  function isOnContactCooldown(npc) {
    if (!npc) return false;
    const now = performance.now();
    const last = npc.__cityDialogueLastTriggerAt || 0;
    return now - last < (npc.__cityDialogueCooldownMs || state.cooldownMs);
  }

  function markContactTriggered(npc) {
    if (!npc) return;
// This gives each NPC a unique, random breath of silence
    // Example: 4000 + (random * 8000) = anywhere between 4s and 12s
    const individualWait = state.minCooldown + Math.random() * (state.maxCooldown - state.minCooldown);
    
    npc.__cityDialogueLastTriggerAt = performance.now();
    npc.__cityDialogueCooldownMs = individualWait;
  }

  function triggerNPCContact(contact) {
    if (!contact || !contact.npcRef) return null;

    const factionName = contact.factionName || (typeof currentActiveCityFaction !== "undefined" ? currentActiveCityFaction : "");
    const contactType = contact.contactType || "civilian";
    const npcRef = contact.npcRef;

    if (isOnContactCooldown(npcRef)) return null;

    const text = contact.text && String(contact.text).trim()
      ? String(contact.text).trim()
      : buildContactSentence(contactType, factionName);

    showSpeech(text, {
      durationMs: contact.durationMs ?? 4000,
      contactType,
      factionName,
      npcRef,
      isPlayerContact: contact.isPlayerContact
    });

    markContactTriggered(npcRef);
    return text;
  }

  function triggerPlayerContactWithNPC(npc, factionName, contactType = "civilian") {
    // When the player manually talks to someone, pass isPlayerContact as true
    return triggerNPCContact({
      factionName,
      contactType,
      npcRef: npc,
      durationMs: 4000,
      isPlayerContact: true
    });
  }

  function findNearbyContact(player, factionName, options = {}) {
    if (!player || typeof factionName !== "string") return null;

    const radius = Math.max(options.radius || 0, 64); 
    const candidates = [];

    // Check Civilians
    if (typeof cityCosmeticNPCs !== "undefined" && cityCosmeticNPCs[factionName]) {
      for (const npc of cityCosmeticNPCs[factionName]) {
        candidates.push({ npcRef: npc, x: npc.x, y: npc.y, contactType: "civilian", factionName });
      }
    }
    
    // Check actual Troop Storage Array 
    if (typeof city_system_troop_storage !== "undefined" && city_system_troop_storage[factionName]) {
        for (const npc of city_system_troop_storage[factionName]) {
            candidates.push({ npcRef: npc, x: npc.x, y: npc.y, contactType: "patrol", factionName });
        }
    }

    let best = null;
    let bestDist = Infinity;
    for (const c of candidates) {
      const dist = Math.hypot((c.x || 0) - player.x, (c.y || 0) - player.y);
      if (dist < radius && dist < bestDist) {
        best = c;
        bestDist = dist;
      }
    }
    return best;
  }

// ---------------------------------------------------------------------------
  // Player Interaction Update (Less likely to talk)
  // ---------------------------------------------------------------------------
  function tryAutoCityContact(player, factionName, options = {}) {
    const contact = findNearbyContact(player, factionName, options);
    if (!contact) return null;

    // NEW REALISM: NPCs ignore the player 65% of the time!
    if (Math.random() < 0.65) {
        // Just mark them triggered so we don't spam them
        markContactTriggered(contact.npcRef);
        return null; 
    }

    // 15% of the time, they just give a short, dismissive response instead of a full sentence
    if (Math.random() < 0.15) {
        const dismissals = ["Hmph.", "Busy.", "Not now.", "Move along.", "What?", "Leave me be."];
        contact.text = dismissals[Math.floor(Math.random() * dismissals.length)];
    }
    
    // If they are in a deep conversation with another NPC, they ignore you
    if (contact.npcRef.__inConvo) return null;

    contact.isPlayerContact = true;
    return triggerNPCContact(contact);
  }

  window.cityDialogueSystem = {
    buildSentence,
    buildContactSentence,
    showSpeech,
    triggerNPCContact,
    triggerPlayerContactWithNPC,
    findNearbyContact,
    tryAutoCityContact,
    update,
    render,
    isActive,
    state,
	isOnContactCooldown // <--- ADD THIS LINE
  };

  window.cityDialogueUpdate = update;
  window.cityDialogueRender = render;
})();

// Helper to check if an NPC is currently in a cooldown period
  function isOnContactCooldown(npc) {
    if (!npc || !npc.__cityDialogueLastTriggerAt) return false;
    const now = performance.now();
    const elapsed = now - npc.__cityDialogueLastTriggerAt;
    return elapsed < (npc.__cityDialogueCooldownMs || 4000);
  }