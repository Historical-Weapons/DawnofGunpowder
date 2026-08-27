// ═══════════════════════════════════════════════════════════════════════
// UNITS EXPANSION — new non-vanilla units, added this session per direct
// request. Load this file AFTER troop_system.js (it extends the already-
// initialized `UnitRoster` global from that file — see UnitRoster.init()
// there) and AFTER infscript.js/cavscript.js (their drawing code is what
// actually renders these units; see the unitName checks noted next to
// each entry below for where to find that code in each file).
//
// SCOPE, per direct request: stats + roster registration only, for now.
// Deliberately NOT wired into `UnitRoster.hierarchy.militia` or
// `.faction_uniques` — those two objects are the original sandbox
// factions' unlock trees and are left completely untouched. Instead
// these three live under a NEW `UnitRoster.hierarchy.expansion` branch
// (added at the bottom of this file) that nothing currently reads —
// future encyclopedia/troopGUI/faction-roster files (not part of this
// session) are what will actually surface these to a player. Until then
// this file only makes the units *exist* (drawable, statted, spawnable
// by unit-type string) without exposing them anywhere in the vanilla UI.
//
// Reload timing for the two units that need special-cased pacing
// (Sanyanchong's 3-barrel burst, the Breech-Loading Culverin's fast
// cycle) lives in troop_system.js's getReloadTime() itself, alongside
// the existing Rocket/Repeater Crossbowman special cases — see that
// function for the actual numbers and reasoning; this file just carries
// the ammo/magazine split those numbers key off of.
// ═══════════════════════════════════════════════════════════════════════

(function () {
    if (typeof UnitRoster === "undefined") {
        console.error("units_expansion.js loaded before troop_system.js — UnitRoster is not defined yet.");
        return;
    }

    // ── MING SANYANCHONG (三眼銃, "three-eyed gun") ─────────────────────
    // Drawing: infscript.js, type === "gun" branch, gated on
    // unitName === "Sanyanchong" (search that file for the string).
    // ammo/magazine mirror the Repeater Crossbowman's split (ammo: total
    // carried, magazine: shots before a full reload is needed) — here
    // magazine: 3 for the three barrels, each already loaded and fired
    // in turn before the whole cluster needs repacking. See
    // getReloadTime() in troop_system.js for the resulting burst-then-
    // reload pacing this produces.
    UnitRoster.create(
        "Sanyanchong",
        "Sanyanchong",
        ROLES.GUNNER,
        false,
        {
            desc: "A cast bronze cluster of three parallel barrels bundled around a long wooden haft, standard issue among Ming dynasty border garrisons and cavalry patrols facing the northern steppe. Each barrel carries its own charge and touch-hole, let the gunner fire all three in quick succession before the whole cluster needs repacking — a crude but effective answer to a single hand cannon's long, exposed reload. When the powder runs out, the haft itself — long enough to grip with both hands — serves as a improvised quarterstaff, a role it was built for from the start.",
            weightClass: WEIGHT_CLASSES.LIGHT_INF,
            isRanged: true,
            ammo: 21,
            magazine: 3,
            health: 100,
            meleeAttack: 14,
            meleeDefense: 10,
            // missileBaseDamage/AP look close to the Hand Cannoneer's own
            // 25/30 here, but AREN'T post-balance-equivalent: create()'s
            // "Auto-Balancing Logic for Ranged Hybrids" exempts any unit
            // whose name contains "cannon" or "fire" from its 0.7x
            // missile-damage reduction — "Hand Cannoneer" qualifies,
            // "Sanyanchong" doesn't, so these numbers get cut to 18/20
            // once created() runs, deliberately landing a bit below the
            // Hand Cannoneer's UNREDUCED 25/30 per shot — the tradeoff
            // for three quick shots per reload instead of one.
            missileBaseDamage: 26,
            missileAPDamage: 29,
            accuracy: 30,
            armor: ARMOR_TIERS.CLOTH,
            speed: 0.75,
            range: 750,
            morale: 60,
            cost: 68
        },
        "ming"
    );

    // ── BREECH-LOADING CANNON ───────────────────────────────────────────
    // Drawing: cavscript.js, the wagon-mounted "cannon" MODE B branch,
    // gated on unitName === "Breech-Loading Cannon" (search that file
    // for the string). Visually distinguished from the existing muzzle-
    // loading Cannon by a hinged/wedged breech block at the rear of the
    // barrel and a short swap-the-chamber reload instead of that unit's
    // swab/powder/shot/ram/aim sequence.
    // NAMING NOTE: called "Culverin" in an earlier draft of this file,
    // renamed to keep "Cannon" in the name on purpose — create()'s
    // Auto-Balancing Logic (see Sanyanchong's comment above) exempts
    // any unit whose name contains "cannon" from its 0.7x missile-
    // damage reduction, same as the existing "Cannon" unit; keeping
    // that exemption is what lets the numbers below mean what they say
    // (a deliberately smaller gap below the muzzle-loading Cannon's
    // 135/380 than a silent 0.7x cut would have produced).
    UnitRoster.create(
        "Breech-Loading Cannon",
        "Breech-Loading Cannon",
        ROLES.MOUNTED_GUNNER,
        true,
        {
            desc: "An early European answer to the muzzle-loader's glacial reload: rather than ramming powder and shot down the barrel from the front, the crew swings open a hinged breech block at the rear and drops in a separate, pre-loaded powder chamber, wedging it shut before firing. The imperfect seal around that wedge bleeds off propellant gas that a well-fitted muzzle-loader would keep behind the ball, costing real range and stopping power — but a fresh chamber can be swapped in far faster than a barrel can be swabbed, charged, shotted, and rammed by hand, letting this gun keep up a rate of fire the older design simply cannot match.",
            weightClass: WEIGHT_CLASSES.CAV,
            isRanged: true,
            ammo: 40,
            health: 85,
            meleeAttack: 10,
            meleeDefense: 12,
            missileBaseDamage: 95,
            missileAPDamage: 260,
            accuracy: 45,
            armor: ARMOR_TIERS.CLOTH,
            speed: 0.28,
            range: 1700,
            morale: 90,
            cost: 165
        },
        "european"
    );

    // ── TANEGASHIMA (種子島) ─────────────────────────────────────────────
    // Drawing: infscript.js, type === "gun" branch, gated on
    // unitName === "Tanegashima" (search that file for the string).
    // Reuses the Hand Cannoneer's reload pacing exactly (no special case
    // in getReloadTime — see the comment there) since a matchlock's
    // serpentine-and-pan ignition is a quicker trigger action, not a
    // faster muzzle-loading process; what sets this unit apart is
    // accuracy and per-shot damage, not rate of fire.
    UnitRoster.create(
        "Tanegashima",
        "Tanegashima",
        ROLES.GUNNER,
        false,
        {
            desc: "Named for the island where a storm-wrecked Portuguese ship first put a matchlock arquebus into Japanese hands in 1543, this weapon was reverse-engineered and mass-produced by domestic gunsmiths within a matter of years. A slow-burning match cord, held in a pivoting serpentine, is lowered onto a priming pan by a simple trigger rather than needing a free hand to apply the flame directly — freeing the gunner to actually aim down the barrel instead of just pointing it. Deployed in massed, rotating volleys by warlords like Oda Nobunaga, it made trained ashigaru gunners a battlefield-deciding force within a single generation.",
            weightClass: WEIGHT_CLASSES.LIGHT_INF,
            isRanged: true,
            ammo: 24,
            health: 100,
            meleeAttack: 8,
            meleeDefense: 10,
            // Same 0.7x-reduction note as Sanyanchong above — neither
            // "cannon" nor "fire" appears in this name, so these raw
            // numbers land at 27/36 after create() runs: a deliberate
            // step above the Hand Cannoneer's unreduced 25/30, matching
            // a matchlock's real edge over an early hand cannon —
            // proper stock and sighting, not raw ammo/reload speed.
            missileBaseDamage: 39,
            missileAPDamage: 52,
            accuracy: 58,
            armor: ARMOR_TIERS.LEATHER,
            speed: 0.75,
            range: 850,
            morale: 65,
            cost: 78
        },
        "japanese"
    );

    // ══════════════════════════════════════════════════════════════════
    // GENERIC HEAVY INFANTRY — added this session, originally framed as
    // "Song/Jin-era Chinese" but corrected per direct instruction:
    // deliberately ETHNIC-NEUTRAL naming and flavor text so these four
    // can be issued to many factions' rosters rather than locked to one
    // culture — unlike the deliberately ethnic-specific units elsewhere
    // in this file (Sanyanchong, Tanegashima, and to a lesser extent the
    // European Breech-Loading Cannon). No faction argument is passed to
    // any of the four create() calls below, so all default to "Generic"
    // — same as the vanilla Spearman/Archer/Shielded Infantry, which
    // these are heavier upgrades of.
    // Drawing for all four: TBD, next session — none of the four are
    // wired into infscript.js yet, so they'll render with whatever
    // fallback the base type (sword_shield/two_handed/spearman/archer)
    // already draws for an unrecognized unitName, same as any other
    // stats-only entry until that pass happens.
    // ══════════════════════════════════════════════════════════════════

    // ── HEAVY SHIELDMAN ─────────────────────────────────────────────────
    // Heavier upgrade of the vanilla "Shielded Infantry" (ROLES.SHIELD,
    // health 150, LEATHER, shieldBlockChance 40, speed 0.5, cost 30) —
    // full lamellar instead of leather, a notably higher block chance
    // reflecting a larger/reinforced shield, and slower to match the
    // added weight.
    UnitRoster.create(
        "Heavy Shieldman",
        "Heavy Shieldman",
        ROLES.SHIELD,
        false,
        {
            desc: "An armored evolution of the common shield-bearer, fielded by units wealthy enough to issue full lamellar beneath an oversized pavise-style shield. Where the ordinary shielded infantryman screens projectiles with speed and numbers, this soldier is built to simply stand and absorb — planting the shield's edge into the ground and bracing behind it as a mobile wall, letting crossbowmen and spearmen work from safety behind a line that does not break. The tradeoff is exactly what it looks like: a soldier this armored, carrying a shield this large, is not going anywhere quickly.",
            weightClass: WEIGHT_CLASSES.HEAVY_INF,
            health: 190,
            meleeAttack: 12,
            meleeDefense: 22,
            armor: ARMOR_TIERS.FULL_LAMELLAR,
            hasShield: true,
            shieldBlockChance: 55,
            speed: 0.45,
            range: 20,
            morale: 75,
            cost: 58
        }
    );

    // ── HEAVY GLAIVE ─────────────────────────────────────────────────────
    // Heavier upgrade of the vanilla "Glaiveman" template (same ROLES.
    // INFANTRY family, HEAVY_INF). RENAMED from an earlier draft of this
    // file ("Podao Guard") per direct correction: kept to an ethnic-
    // neutral name and description on purpose, since a broad heavy blade
    // on a long shaft — the podao, the guandao, and plenty of other
    // regional equivalents — was independently arrived at by many
    // warrior traditions, not just one. That makes this unit usable
    // across many factions' rosters rather than locked to one culture's
    // specific historical regiment, unlike the deliberately ethnic-
    // specific units elsewhere in this file (Sanyanchong, Tanegashima).
    // No faction argument passed below — defaults to "Generic", same as
    // the vanilla Spearman/Archer/Shielded Infantry.
    UnitRoster.create(
        "Heavy Glaive",
        "Heavy Glaive",
        ROLES.INFANTRY,
        false,
        {
            desc: "Heavy infantry armed with a broad, heavy blade mounted on a long shaft — a design arrived at independently across countless warrior traditions, combining a spear's reach with a sword's cutting power. Swung two-handed with enough momentum to sever a limb or cripple a charging horse, it trades the raw reach of a pike for a weapon that keeps cutting, chopping, and hooking once an enemy closes the distance. Full lamellar and disciplined two-handed drill let these troops stand their ground against exactly the kind of cavalry charge that scatters lighter, faster infantry.",
            weightClass: WEIGHT_CLASSES.HEAVY_INF,
            health: 130,
            meleeAttack: 34,
            meleeDefense: 20,
            armor: ARMOR_TIERS.FULL_LAMELLAR,
            bonusVsLarge: 30,
            antiLargeDamage: 35,
            chargeBonus: 8,
            speed: 0.65,
            range: 30,
            morale: 80,
            cost: 90
        }
    );

    // ── HEAVY SPEARMAN ──────────────────────────────────────────────────
    // Heavier upgrade of the vanilla "Spearman" (health 100, PARTIAL_
    // LAMELLAR, cost 25) — full lamellar, higher health/defense, and a
    // stronger anti-cavalry bonus reflecting a longer, sturdier spear
    // and the discipline to actually hold formation under a charge
    // rather than just carry the weapon for one.
    UnitRoster.create(
        "Heavy Spearman",
        "Heavy Spearman",
        ROLES.PIKE,
        false,
        {
            desc: "Where the common spearman is cheap, numerous, and expendable, this soldier represents an army's investment in holding a specific piece of ground. Drilled to lock shoulder-to-shoulder and drop the spearpoint in unison rather than fight as individuals, full lamellar and rigorous formation practice let these troops absorb a cavalry charge that would scatter looser, lighter-armed spear lines. They lack the mobility to chase down a broken enemy, but breaking them in the first place is the entire problem they exist to solve.",
            weightClass: WEIGHT_CLASSES.HEAVY_INF,
            health: 140,
            meleeAttack: 14,
            meleeDefense: 24,
            armor: ARMOR_TIERS.FULL_LAMELLAR,
            bonusVsLarge: 30,
            antiLargeDamage: 30,
            speed: 0.65,
            range: 35,
            morale: 70,
            cost: 48
        }
    );

    // ── HEAVY BOWMAN ────────────────────────────────────────────────────
    // Heavier upgrade of the vanilla "Archer" (health 100, LEATHER,
    // missileBaseDamage 13/AP 14, accuracy 55, cost 45). "M shape" per
    // direct request: the recurved siyahs (rigid tips) of a Chinese
    // composite bow curl AWAY from the archer when unstrung, giving the
    // whole bow a distinctive M/W silhouette that straightens back into
    // a smooth curve only once drawn — a real, visually distinct
    // construction detail worth calling out for the drawing pass (see
    // header note above; not yet implemented in infscript.js). Same 0.7x
    // missile-reduction note as Sanyanchong/Tanegashima above applies —
    // these raw numbers land at 12/14 after create() runs, a step above
    // the vanilla Archer's own equally-reduced 9/9.
    UnitRoster.create(
        "Heavy Bowman",
        "Heavy Bowman",
        ROLES.ARCHER,
        false,
        {
            desc: "Issued a stiffer-draw composite bow than the common archer — horn, sinew, and wood laminated into a recurved shape whose rigid siyahs curl backward into a distinctive M silhouette when unstrung, storing far more energy per pound of draw than a simple wooden stave. Full lamellar and the physical conditioning needed to draw a genuinely heavy bow set these archers apart from the levied skirmishers who make up most missile troops — fewer of them are fielded, but each is expected to keep shooting, and keep hitting, well after a lighter-armored line would have broken and run.",
            weightClass: WEIGHT_CLASSES.HEAVY_INF,
            isRanged: true,
            ammo: 24,
            health: 130,
            meleeAttack: 8,
            meleeDefense: 10,
            missileBaseDamage: 18,
            missileAPDamage: 20,
            accuracy: 60,
            armor: ARMOR_TIERS.FULL_LAMELLAR,
            speed: 0.65,
            range: 720,
            morale: 65,
            cost: 68
        }
    );

    // ── NEW NON-VANILLA HIERARCHY BRANCH ────────────────────────────────
    // Kept entirely separate from `militia` and `faction_uniques` (the
    // original sandbox factions' trees, untouched) so nothing currently
    // reads this yet. A future encyclopedia/troopGUI/faction-roster file
    // is what will actually wire it into the UI — this just gives that
    // future file a stable place to read from. "generic" here mirrors
    // the units' own Generic faction default (no faction argument
    // passed to their create() calls above) — a future roster file
    // would presumably make each of these available to several
    // factions' recruitment lists, not just one, unlike the ming/
    // european/japanese entries below which are each exactly one
    // faction's unique.
    UnitRoster.hierarchy.expansion = {
        ming: ["Sanyanchong"],
        european: ["Breech-Loading Cannon"],
        japanese: ["Tanegashima"],
        generic: ["Heavy Shieldman", "Heavy Glaive", "Heavy Spearman", "Heavy Bowman"]
    };
})();