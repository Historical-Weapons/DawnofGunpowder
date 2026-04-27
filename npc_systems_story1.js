// =============================================================================
// NPC SYSTEMS – STORY 1: BUN'EI INVASION 1274  (npc_systems_story1.js)
//
// Defines the historical factions of the First Mongol Invasion of Japan.
// Call applyStory1Factions() before world generation — it mutates the shared
// FACTIONS and SYLLABLE_POOLS objects in-place so every downstream system
// (city_system, parler_system, siege_system, faction_dynamics, etc.)
// continues to reference the same objects without code changes.
//
// FACTIONS (4 total):
//   Kamakura Shogunate     — all Japanese clans unified; owns all settlements
//   Yuan Dynasty Coalition — Mongol-Yuan & Goryeo fleet (NO CITIES)
//   Bandits                — Ronin / masterless samurai  (NO CITIES)
//   Kyushu Defender        — Player faction              (NO CITIES)
//
// Yuan Dynasty Coalition and Bandits behave like Bandits — they have no
// permanent cities and are handled by offshore/dispersed geoWeights so
// getFactionByGeography never selects them for city assignment.
// =============================================================================

// ── Faction registry ──────────────────────────────────────────────────────────
// geoWeight poles are normalised world-space (0–1).
// Story1 map layout:
//   Tsushima island  ≈ (0.19, 0.34)
//   Iki island       ≈ (0.27, 0.41)
//   Kyushu main mass ≈ centre (0.42, 0.50), rx 0.21, ry 0.29
//   Hakata Bay coast ≈ (0.50–0.56, 0.28–0.33)
//   Dazaifu inland   ≈ (0.57, 0.46)
const FACTIONS_story1 = {

    // 1. All Japanese clans unified under the Kamakura Shogunate banner.
    //    Owns all land settlements on Kyushu and the island outposts.
    "Kamakura Shogunate": {
        color: "#c2185b",
        geoWeight: { north: 0.15, south: 0.70, west: 0.10, east: 0.70 }
    },

    // 2. Mongol-Yuan & Goryeo invasion coalition — no permanent cities.
    //    Geo-weight far offshore so getFactionByGeography never assigns land.
    "Yuan Dynasty Coalition": {
        color: "#1976d2",
        geoWeight: { north: 0.02, south: 0.15, west: 0.02, east: 0.18 }
    },

    // 3. Ronin / brigands — masterless samurai and deserters. No cities.
    "Bandits": {
        color: "#222222",
        geoWeight: { north: 0.50, south: 0.50, west: 0.50, east: 0.50 }
    },

  
};

// ── Syllable pools for procedural settlement names ────────────────────────────
const SYLLABLE_POOLS_story1 = {

    // Kamakura Shogunate — merged Kyushu Japanese place-name syllables
    "Kamakura Shogunate": [
        "Kama","Hojo","Haka","Sho","Toki","Mune","Nori","Taka",
        "Yasu","Fuji","Yoshi","Moto","Kane","Naga","Sada","Fusa",
        "Tsuru","Tsu","Shima","Nami","Kaze","Ishi","Iwa","Saka",
        "Ki","Ku","Masa","Hiro","Nobu","Kiyo","Toshi","Kuni",
        "Oto","Sorin","Hama","Kuri","Bun","Go","Seki","Oka",
        "Mat","Ura","Yuki","Nishi","Kita","Sato","Mine","Kuro",
        "Zaki","Saki","Hana","Tsuki","Hoshi","Mori","Take","Umi",
        "Kawa","Yama","Miya","Shiro","Hara","Fune","Shio"
    ],

    // Yuan Dynasty Coalition — Mongolian / Sinicised Yuan place-name syllables
    "Yuan Dynasty Coalition": [
        "Kha","Khan","Temur","Bayan","Jin","Kub","Lai","Hong",
        "Dai","Yuan","Kor","Yo","Bur","Boro","Ulan","Dadu",
        "Or","Sar","Batu","Tol"
    ],

    // Ronin — rough outcasts, wanderers
    "Bandits": [
        "Kage","Oni","Kuro","Yami","Akuma","Boko","Gami","Naga",
        "Tachi","Ogre","Aku","Ryu","Ken","Hei","Musha","Yato",
        "Toge","Shura","Moro","Hana"
    ],
 
};

// ── Faction applicator ─────────────────────────────────────────────────────────
// Called once by initGame_story1() before world generation.
// Mutates the SHARED objects so all existing game systems keep working.
function applyStory1Factions() {

    // --- FACTIONS ---
    // Clear all existing keys, then inject story1 keys.
    Object.keys(FACTIONS).forEach(k => delete FACTIONS[k]);
    Object.assign(FACTIONS, FACTIONS_story1);

    // --- SYLLABLE_POOLS ---
    Object.keys(SYLLABLE_POOLS).forEach(k => delete SYLLABLE_POOLS[k]);
    Object.assign(SYLLABLE_POOLS, SYLLABLE_POOLS_story1);

    // --- Diplomacy ---
    // Re-seed the diplomacy table with the new faction list.
    if (typeof initDiplomacy === 'function') {
        initDiplomacy(FACTIONS);
    }

    console.log("[Story1] ✅ Historical 1274 factions applied to global state.");
    console.log("[Story1]    Active factions:", Object.keys(FACTIONS).join(", "));
}