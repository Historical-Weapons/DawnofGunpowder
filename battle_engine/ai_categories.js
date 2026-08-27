// ════════════════════════════════════════════════════════════════════════
// SURGERY: GUARANTEED SINGLE SOURCE OF TRUTH FOR "IS THE GATE BREACHED?"
// ════════════════════════════════════════════════════════════════════════
// Previously this exact question was recomputed independently in ~10+ places
// across ai_categories.js and battlefield_commands.js, each with slightly
// different logic (some checked window.__SIEGE_GATE_BREACHED__ OR the gate
// object, some only checked one or the other, some treated a missing gate
// reference as breached and some didn't). That inconsistency is what let
// units fall through the cracks between "gate still standing" and "gate is
// down" — there was no single guaranteed choke point, so fixes in one spot
// never covered every path a unit's AI could take.
//
// isSiegeGateBreached() is now the ONE place that answers this question.
// Everything else should call this instead of re-deriving it locally.
function isSiegeGateBreached() {
    if (!(typeof inSiegeBattle !== 'undefined' && inSiegeBattle)) return false;
    if (window.__SIEGE_GATE_BREACHED__) return true;
    // Prefer the LIVE battle gate. Custom Siege Battle deep-clones
    // overheadCityGates into battleEnvironment.cityGates (see
    // customsiegebattle.js), so that's always the correct copy to read once
    // it exists. Standard (campaign) sieges assign battleEnvironment.cityGates
    // = overheadCityGates BY REFERENCE (siegebattle.js), so checking either
    // agrees there too. The overheadCityGates fallback only matters for the
    // brief window (any battle mode) before battleEnvironment.cityGates has
    // been populated at all.
    let gate = (typeof battleEnvironment !== 'undefined' && battleEnvironment.cityGates && battleEnvironment.cityGates.length > 0)
        ? battleEnvironment.cityGates.find(g => g.side === "south")
        : (typeof overheadCityGates !== 'undefined' ? overheadCityGates.find(g => g.side === "south") : null);
    // No gate reference at all is treated as breached (fail OPEN to normal
    // combat instead of leaving every defender frozen in a pre-breach hold
    // state forever due to a missing/uninitialized reference).
    return !gate || gate.isOpen || gate.gateHP <= 0;
}
window.isSiegeGateBreached = isSiegeGateBreached;


function canUseSiegeEngines(unit) {
	
	
    if (!unit || !unit.stats) return false; 
    if (unit.isCommander) return false; // SURGERY 1: Hard block commander

    const txt = String(
        (unit.unitType || "") + " " + 
        (unit.stats?.role || "") + " " + 
        (unit.stats?.name || "")
    ).toLowerCase();

    const isCavalry = /(cav|horse|mounted|camel|eleph|lancer|keshig)/.test(txt);
    if (unit.stats.isLarge || unit.isMounted || isCavalry) return false;
   

const unitLabel = txt.toLowerCase();
const isRanged = unit.stats.isRanged || /\b(archer|bow|crossbow|slinger|rocket)\b/.test(unitLabel);

const isSpecialist = /\b(firelance|bomb|javelinier|repeater)\b/.test(unitLabel);

if (isRanged && !isSpecialist) {
    if (unit.siegeRole === "treb_crew" || unit.siegeRole === "trebuchet_crew" || unit.siegeRole === "counter_battery") return true;
    
    // Standard archers only touch equipment if explicitly forced
    if (unit.siegeRole === "ram_pusher" || unit.siegeRole === "ladder_carrier" || unit.siegeRole === "ladder_fanatic") return true;
    
    return false; 
}

// Firelances, Bombs, and Javelins now count as "Infantry" for siege purposes!
return true;
}

function siegeDefenseRoll(unit) {
    const seed = String(
        unit.id ?? unit.uid ?? unit.name ?? unit.unitType ?? unit.stats?.name ?? ""
    );
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
        h = ((h << 5) - h) + seed.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h) % 100;
}

function isSiegeRangedDefender(unit) {
    const txt = String(
        (unit.unitType || "") + " " +
        (unit.stats?.role || "") + " " +
        (unit.stats?.name || "")
    ).toLowerCase();

    return Boolean(
        unit.stats?.isRanged ||
        /\b(archer|bow|crossbow|slinger|gunpowder|gunner|musket|hand cannon|rocket)\b/.test(txt)
    );
}

// ============================================================================
// WATER / DECK AVOIDANCE — shared by AI TACTIC: SKIRMISH KITING, AI TACTIC:
// HOLD (formation placement), and AI TACTIC: SHIELD (formation advance), per
// direct request: "skirmish command in a ship will always try to not jump to
// the water if possible, charge doesn't care... river water is irrelevant
// cuz that's more a land battle... hold command forming circles also try to
// avoid jumping to water."
//
// Deliberately naval-ship-only. An earlier version of this helper also
// treated grid tile ID 4 as "water" for land/river maps — but river battles
// use that SAME tile ID for their river tiles (see sandboxmode_update.js's
// updateRiverPhysics, "Check for BOTH River (4) and Ocean (11)"), and rivers
// are explicitly NOT what this avoidance is for per direct clarification
// ("river water is more a land battle"). So this only ever fires on a true
// Ocean/Coastal naval map, using the same window.getNavalSurfaceAt('DECK' |
// not-'DECK') the rest of the codebase already treats as the authoritative
// on-deck test (battlefield_logic.js, sandboxmode_update.js's own river/
// naval physics dispatch, etc.) — not a separate hand-rolled geometry copy.
function _isOnAnyDeck(x, y) {
    // Not a real ocean/coastal naval map (includes river battles, which use
    // window.inRiverBattle instead and are excluded here on purpose) —
    // never block movement on this check.
    if (!window.inNavalBattle) return true;
    if (typeof navalEnvironment !== 'undefined' &&
        navalEnvironment.mapType !== 'Ocean' && navalEnvironment.mapType !== 'Coastal') return true;
    if (typeof window.getNavalSurfaceAt !== 'function') return true; // helper missing — don't block movement
    return window.getNavalSurfaceAt(x, y) === 'DECK';
}


// ============================================================================
// MOUNTED UNIT ACCELERATION / DECELERATION
// ============================================================================
// Horses (and other mounted/large units) no longer snap instantly to top
// speed. unit.currentSpeedMult ramps 0 -> 1 (accelerating) or 1 -> 0
// (decelerating/stopping) each frame _handleMovement runs for that unit.
// Top speed itself is unchanged — it's still exactly unit.stats.speed from
// troop_system.js. This only controls how quickly a mount reaches that
// ceiling from a standstill, and how quickly it sheds speed when it stops
// or reverses. Rate is derived from unit.stats.mass (already set on every
// Troop via weightClass — see troop_system.js), so heavier mounts (Heavy
// Cav: 150, Elephant: 500) accelerate/decelerate more sluggishly than
// light Cav (80) with zero new stats needed.
//
// Infantry are untouched: getRampedSpeed() returns unit.stats.speed
// unmodified for any unit that isn't mounted/large, and the one call site
// that uses it in _handleMovement is itself gated to isLargeUnit only.
function isMountedForAccel(unit) {
    return Boolean(unit.stats?.isLarge || unit.isMounted ||
        (unit.unitType && String(unit.unitType).toLowerCase().match(/(cav|horse|camel|eleph|lancer)/)));
}

function updateSpeedRamp(unit, wantsToMove) {
    if (!isMountedForAccel(unit)) return; // infantry: no ramp, no-op

    if (unit.currentSpeedMult === undefined) unit.currentSpeedMult = 0;

    // Heavier mounts ramp slower in both directions. CAV (mass 80) is the
    // baseline; HEAVY_CAV (150) and ELEPHANT (500) scale down from there.
    // Clamped so even the Elephant still reaches top speed in a few seconds,
    // not glacially — this is a "momentum feel," not a hard physics sim.
    let mass = unit.stats?.mass || 80;
    let rate = Math.max(0.012, Math.min(0.05, 4 / mass)); // per-frame ramp step

    if (wantsToMove) {
        unit.currentSpeedMult = Math.min(1, unit.currentSpeedMult + rate);
    } else {
        // Gradual deceleration — same mass-scaled rate, ramping back to 0
        // instead of cutting to a dead stop the instant orders/target drop.
        unit.currentSpeedMult = Math.max(0, unit.currentSpeedMult - rate);
    }
}

function getRampedSpeed(unit) {
    if (!isMountedForAccel(unit)) return unit.stats.speed; // infantry unaffected
    let mult = (unit.currentSpeedMult !== undefined) ? unit.currentSpeedMult : 1;
    return unit.stats.speed * mult;
}

const AICategories = {

    cleanupDeadUnits: function(units, now) {
        // Body lingering duration (ms) before a dead unit is removed from the
        // battle. Tunable via the Graphics Quality settings (LOW/MED/HIGH/MAX).
        // Default preserves the original hardcoded behaviour (1000ms) if the
        // settings system hasn't initialised this global yet.
        const lingerMs = (typeof window.bodyLingerMs === 'number') ? window.bodyLingerMs : 1000;

        return units.filter(u => {
            if (u.removeFromBattle) return false;
            if (u.hp <= 0) {
                if (!u.deathTime) handleUnitDeath(u);
   
                if (u.isCommander) return true;
                return (now - u.deathTime) < lingerMs;
            }
            return true;
        });
    },

    initBattleTrackers: function(currentBattleData) {
        if (!currentBattleData.fledCounts) currentBattleData.fledCounts = { player: 0, enemy: 0 };
        if (!currentBattleData.frames) currentBattleData.frames = 0;
        currentBattleData.frames++;
    },

handlePlayerOverride: function(unit, units, keys, battleEnv, player) {
        if (!unit.target || unit.target.hp <= 0) {
            let nearestDist = Infinity;
            units.forEach(other => {
                if (other.side !== unit.side && other.hp > 0 && !other.isDummy) {
                    let d = Math.hypot(unit.x - other.x, unit.y - other.y);
                    if (d < nearestDist) {
                        nearestDist = d;
                        unit.target = other;
                    }
                }
            });
        }

        if (unit.target) {
            let distToTarget = Math.hypot(unit.target.x - unit.x, unit.target.y - unit.y);
			
			// ---> SMART SURGERY: Prevent crash on loaded saves (Instance 2)
if (typeof unit.stats.updateStance === 'function') {
    unit.stats.updateStance(distToTarget);
} else {
    // FALLBACK: Manual stance logic matching troop_system.js
    if (!unit.stats.isRanged) {
        unit.stats.currentStance = "statusmelee";
    } else {
        const MELEE_ENGAGEMENT_DISTANCE = 15; 
        if ((unit.stats.ammo !== undefined && unit.stats.ammo <= 0) || distToTarget <= MELEE_ENGAGEMENT_DISTANCE) {
            unit.stats.currentStance = "statusmelee";
        } else {
            unit.stats.currentStance = "statusrange";
        }
    }
}
			
            let effectiveRange = unit.stats.currentStance === "statusmelee" ? 30 : unit.stats.range;

            if (distToTarget <= effectiveRange) {
                // SURGERY: Force the combat execution to run for the player commander
                this._handleCombatExecution(unit, unit.target.x - unit.x, unit.target.y - unit.y, distToTarget, battleEnv, player);
                unit.state = "attacking";
            } else {
                unit.state = (keys['w'] || keys['a'] || keys['s'] || keys['d']) ? "moving" : "idle";
            }
        } else {
            unit.state = "idle";
        }
    },

processMoraleAndFleeing: function(unit, pCount, eCount, currentBattleData) {
    let hpPct = unit.hp / unit.stats.health;
    let armorEffect = Math.min(unit.stats.armor / 50, 1.0);
    let baseTick = (hpPct <= 0.1) ? 0.12 : (hpPct <= 0.8 ? 0.04 : 0);

    const weOutnumberEnemy = (unit.side === 'player' && pCount > eCount) || (unit.side === 'enemy' && eCount > pCount);

    if (weOutnumberEnemy) {
        baseTick = 0;
    } else if ((unit.side === 'player' && eCount >= pCount * 5) || (unit.side === 'enemy' && pCount >= eCount * 5)) {
        baseTick = 0.2; 
    }

    if (unit.stats.armor >= 30 && currentBattleData.frames < 18000) baseTick *= 0.01;
    if (unit.stats.armor < 5 && unit.target && hpPct < 0.9 && !weOutnumberEnemy) baseTick += 0.02;

    // --- CASUALTY MORALITY DEBUFF ---
    const casualtyPct = unit.casualtyMoralePct || 0;
    const casualtyMult = unit.casualtyMoraleMultiplier || 1;

    // FIX ("months ago units flee when morale is very low but now nobody
    // flees anymore... the flee mechanic is realistic to make chain routs"
    // — direct request): baseTick above is 0 for any unit over 80% HP
    // (unless the 5:1-outnumbered case fired), which meant a healthy
    // unit's morale could NEVER decay from its army collapsing around it —
    // the casualtyMult multiplier a few lines below had nothing to
    // multiply for most of the army at any given moment, since 0 * any
    // multiplier is still 0. That's the actual break in "chain routing":
    // one side taking heavy losses should be able to sweep even its
    // still-healthy troops into a rout, not just units who happen to be
    // personally wounded. Fixed with a small baseline tied to the SAME
    // 0.30 threshold applyCasualtyPressureToSide (battlefield_logic.js)
    // already uses as its first real pressure tier — deliberately not
    // "any combat at all," so an ordinary even fight still doesn't cause
    // healthy troops to randomly waver; this only activates once a side
    // has visibly started losing. weOutnumberEnemy (checked, not
    // re-derived) still zeroes it exactly as it already does above, so a
    // winning side's healthy units remain immune regardless of the other
    // side's own losses.
    if (baseTick === 0 && !weOutnumberEnemy && casualtyPct >= 0.30) {
        baseTick = 0.015;
    }

    if (casualtyPct >= 0.60) {
        baseTick *= casualtyMult;
    }

    // --- SIEGE ATTACKER OPENING RESOLVE (first 3 minutes) ---
    // A deliberate "opening charge" boost: the assaulting side shrugs off
    // panic almost entirely for the first 10800 frames (3min @ 60fps — same
    // frame-count convention as the armor/18000-frame check above, just a
    // shorter window and scoped to player-side siege attackers specifically)
    // so the attack doesn't evaporate to a stray flee roll before it even
    // reaches the wall. Applied last so it scales down whatever the combined
    // baseTick became, casualty debuff included.
    const inSiegeForResolve = typeof inSiegeBattle !== 'undefined' && inSiegeBattle;
    if (inSiegeForResolve && unit.side === 'player' && currentBattleData.frames < 10800) {
        baseTick *= 0.05; // 95% less likely to break during the opening push
    }

    if (baseTick > 0) {
        unit.stats.morale -= baseTick * Math.max(0.1, (1.1 - armorEffect));
    } else if (unit.stats.morale < 20) {
        unit.stats.morale += 0.005;
    }

    // Hard panic from casualties
    if (unit.forcePanicFromCasualties === true && unit.stats.morale <= 0) {
        this._handleBrokenFleeing(unit, currentBattleData);
        return true;
    }

    if (unit.stats.morale <= 0) {
        this._handleBrokenFleeing(unit, currentBattleData);
        return true; 
    } 
    else if (unit.stats.morale <= 3) {
        this._handleWavering(unit);
        return true;
    }
    
    unit.escapePoint = null;
    unit.escapeType = null;
    return false; 
},

processTargeting: function(unit, units) {
	// 1. Move the inSiege check ABOVE the ram validation
let inSiege = typeof inSiegeBattle !== 'undefined' && inSiegeBattle;

    // GUARANTEED TOP-LEVEL GATE CHECK — see isSiegeGateBreached() at the top
    // of this file. Computed once, here, before any siege-specific branch
    // below gets a chance to run. This is now the only isGateBreached value
    // used anywhere in this function.
    let isGateBreached = isSiegeGateBreached();

    // PLAYER GATE-BREACH HANDOFF — mirrors the enemy one further down
    // (search GATE-BREACH HANDOFF), which only covers unit.side === "enemy".
    // Attackers have no equivalent: the SIEGE MACRO-TARGETING OVERHAUL below
    // (the block that walks them toward the gate_funnel/plaza dummy points)
    // is gated on `!isGateBreached`, so it stops assigning/advancing targets
    // for EVERYONE the instant the gate goes down. And the dummy-target
    // cleanup loop right below this (`clear the gate gathering dummy`) is
    // also `unit.side === "enemy"` only, so an attacker's stale dummy target
    // never gets cleared either. Combined with orderType "siege_assault"
    // making the very next check (SURGERY 1, right below) bail out of this
    // whole function immediately — every frame, forever — the result is:
    // any attacker who was still walking to (or had already reached) its
    // gate_funnel staging point at the moment of breach just stops there.
    // dx/dy to that fixed dummy point hit ~0 and nothing ever exists to send
    // them onward into the plaza. This is what was producing the cluster of
    // units frozen right in the gate opening after it broke.
    //
    // Fix: hand non-crew siege_assault attackers the exact same
    // orderType = "seek_engage" promotion the Q key already gives via
    // battlefield_commands.js's Q-E-R-F handlers, and drop the dummy target
    // (only if it IS a dummy — a unit already trading blows with a real
    // enemy keeps that target). Once orderType is seek_engage, the very
    // next `["siege_assault", ...].includes(unit.orderType)` check no
    // longer matches, so this function continues instead of bailing, and
    // the seek_engage guard just below hands the unit to
    // processTacticalOrders/pickSmartCombatTarget — the same real combat
    // AI a manual Q-press already uses. Ram/ladder/engine crew are left
    // alone; battlefield_commands.js's Q-E-R-F handlers own reassigning
    // active siege-engine duty, not this function.
    if (inSiege && isGateBreached && !unit.disableAICombat &&
        unit.side === "player" && unit.orderType === "siege_assault") {
        const isActiveCrew = ["ram_pusher", "ladder_carrier", "battering_ram", "engine_crew"].includes(unit.siegeRole);
        if (!isActiveCrew) {
            unit.orderType = "seek_engage";
            if (unit.target && unit.target.isDummy) unit.target = null;
        }
    }

    // SURGERY 1: Protect all manual field commands from the AI target scanner
    // _formationLocked checked explicitly (not just via orderType==='move_to_point')
    // so this stays safe even if something changes orderType mid-march without
    // knowing about this dependency — see the matching guard added to
    // processTacticalOrders() in battlefield_commands.js.
    if (unit.disableAICombat || unit._formationLocked || ["siege_assault", "follow", "retreat", "move_to_point", "hold_position"].includes(unit.orderType)) {
        return; 
    }

    // GUARD: player seek_engage units are now fully owned by
    // processTacticalOrders()/pickSmartCombatTarget() in battlefield_commands.js
    // (smart wounded/flanking/isolation/focus-fire scoring). Without this,
    // this file's own generic fallback scan further down still runs for them
    // ~0.8% of frames and can silently stomp that smart pick back to a plain
    // nearest-enemy target. Enemy seek_engage is untouched — it still falls
    // through to the smart block right below.
    if (unit.side === "player" && unit.orderType === "seek_engage") {
        return;
    }

    // ════════════════════════════════════════════════════════════════════════
    // ENEMY LAND AI: seek_engage handler (mirrors processTacticalOrders)
    // ════════════════════════════════════════════════════════════════════════
    // EnemyLandStrategyAI issues "seek_engage" to enemy units that should
    // free-fire / chase the nearest player unit (shooters, light cav kiting,
    // heavy cav during CHARGING).  processTacticalOrders only handles
    // seek_engage for player units, so for enemies we need a parallel branch
    // here.  Without it, seek_engage enemies fall through to the default
    // targeting code below which constantly picks "nearest player" but
    // doesn't tag the unit with a stable target — causing the chaotic /
    // "dumb charge" behaviour.  This block ONLY runs in non-siege battles
    // (siege has its own dedicated defender targeting block further down).
    //
    // SMART TARGETING (v1.1): this runs every single frame, unthrottled, for
    // the unit's entire remaining time in combat — including all the way
    // through and after EnemyLandStrategyAI's CHARGING phase, which tears
    // itself down after a single tick and never runs again. That makes THIS
    // the only place that can deliver real ongoing battlefield intelligence
    // (rout-chasing, target discrimination) for the rest of the fight; a
    // one-shot decision made back in the strategic layer can't adapt as the
    // battle evolves. Three biases are layered onto plain nearest-distance,
    // land-battles only (naval has its own correct logic in _handleMovement
    // and must not be touched here):
    //   1. Prefer a target that's already FLEEING/WAVERING — denying a
    //      routing unit the chance to rally is one of the most impactful
    //      things a real battle AI does; a near-dead/broken unit is also
    //      much less of a threat to actually trade blows with.
    //   2. Prefer an angle that's already flanking (isFlanked() in
    //      battlefield_logic.js is purely geometric — >120° from whatever
    //      the target is currently facing — and mechanically halves their
    //      defense in calculateDamageReceived). This is a real combat edge,
    //      not cosmetic, so it's worth a nudge for every unit, not just cav.
    //   3. Mounted/large units (cavalry) additionally avoid anti-cavalry
    //      specialists (Firelance bonusVsLarge:25, Spearman/Pike:20 — the
    //      highest anti-large punishes in the roster) and prefer the soft
    //      ranged backline (archers/crossbow/hand-cannon, bonusVsLarge:0)
    //      they can fight without being countered — "don't suicide charge
    //      into the spear wall, go pick off the archers instead."
    //
    // GATE-BREACH HANDOFF: a siege whose gate is down/open is no longer a
    // siege tactically — it's a land battle happening inside a city walls.
    // Once isGateBreached is true this block runs for EVERY enemy unit, not
    // just ones already tagged seek_engage — EnemyLandStrategyAI never runs
    // during a siege at all, so no siege unit would ever organically pick up
    // that orderType on its own. Ordinary non-siege battles are completely
    // unaffected: they still require the real seek_engage tag exactly as
    // before, via the `!inSiege` half of this condition.
    if (unit.side === "enemy" && (isGateBreached || (!inSiege && unit.orderType === "seek_engage"))) {
        const isLandContext = !(typeof inNavalBattle !== 'undefined' && inNavalBattle);

        let scannerIsMounted = false;
        let scannerIsRanged  = false;
        let scannerIsMelee   = false;
        if (isLandContext) {
            const _txt = String((unit.unitType || "") + " " + (unit.stats?.role || "") + " " + (unit.stats?.name || "")).toLowerCase();
            scannerIsMounted = Boolean(unit.stats?.isLarge || unit.isMounted || /\b(cav|horse|mounted|camel|eleph|lancer)\b/.test(_txt));
            scannerIsRanged  = !!(unit.stats?.isRanged);
            scannerIsMelee   = !scannerIsRanged;
        }

        let bestScore = Infinity;
        let nearestEnemy = null;
        for (let i = 0; i < units.length; i++) {
            const other = units[i];
            if (other.side === "player" && other.hp > 0 && !other.isDummy) {
                const d = Math.hypot(unit.x - other.x, unit.y - other.y);
                let score = d;

                if (isLandContext) {
                    // ── UNIVERSAL BONUSES (all unit types) ──────────────────
                    // Prefer routing/wavering units — they die fast
                    if (other.state === 'FLEEING' || other.state === 'WAVERING') score -= 280;

                    // Prefer wounded targets (below 50% HP)
                    const otherMaxHp = (other.stats && other.stats.health) ? other.stats.health : (other.maxHp || other.hp || 1);
                    const otherHpPct = other.hp / otherMaxHp;
                    if (otherHpPct < 0.5)  score -= 130;
                    if (otherHpPct < 0.25) score -= 80; // stacking: very low HP is very juicy

                    // Flanking bonus
                    if (typeof isFlanked !== 'undefined' && isFlanked(unit, other)) score -= 90;

                    // Slightly prefer isolated targets (no ally within 120px)
                    let isIsolated = true;
                    for (let k = 0; k < units.length; k++) {
                        const ally = units[k];
                        if (ally === other || ally.side !== 'player' || ally.hp <= 0) continue;
                        if (Math.hypot(ally.x - other.x, ally.y - other.y) < 120) { isIsolated = false; break; }
                    }
                    if (isIsolated) score -= 100;

                    // ── MOUNTED UNITS ────────────────────────────────────────
                    if (scannerIsMounted) {
                        const antiCav = Math.max(
                            (other.stats && other.stats.bonusVsLarge) || 0,
                            (other.stats && other.stats.antiLargeDamage) || 0
                        );
                        score += antiCav * 14; // Firelance(25)->+350, Spearman(20)->+280 effective-px penalty
                        if (other.stats && other.stats.isRanged && !other.stats.isLarge && antiCav < 15) {
                            score -= 110; // soft, squishy backline shooters are juicy, low-risk prey
                        }
                        // Extra flanking bonus for cavalry — they hit harder from the side
                        if (typeof isFlanked !== 'undefined' && isFlanked(unit, other)) score -= 60; // stacking
                    }

                    // ── RANGED UNITS: avoid enemies already in melee, prefer open targets ──
                    if (scannerIsRanged && !scannerIsMounted) {
                        // Deprioritize targets already engaged with an ally (risk of friendly fire)
                        const otherInMelee = (other.state === 'attacking' || other.state === 'moving') &&
                            (() => {
                                for (let k = 0; k < units.length; k++) {
                                    const a = units[k];
                                    if (a.side !== 'enemy' || a.hp <= 0 || a.isCommander) continue;
                                    if (Math.hypot(a.x - other.x, a.y - other.y) < 45) return true;
                                }
                                return false;
                            })();
                        if (otherInMelee) score += 80; // prefer non-engaged targets

                        // Prefer low-armor targets
                        const otherArmor = (other.stats && other.stats.armor) || 0;
                        if (otherArmor < 5)  score -= 70;
                        if (otherArmor < 15) score -= 30;
                    }

                    // ── MELEE UNITS: prefer targets whose back is turned ────
                    if (scannerIsMelee && !scannerIsMounted) {
                        // Target is already fighting someone else = back is exposed = bonus
                        if (other.state === 'attacking') score -= 60;
                    }
                }

                if (score < bestScore) { bestScore = score; nearestEnemy = other; }
            }
        }
        if (nearestEnemy) {
            // SURGERY: post-breach city defenders need the same wall/building
            // steering attackers already get via getCityNavTarget() (see
            // battlefield_commands.js) — plain open-field land battles never
            // have buildings on the grid, so this is a no-op there (the
            // function hands back realTarget unchanged whenever nothing's in
            // the way, including whenever the target is already close).
            unit.target = (isGateBreached && typeof getCityNavTarget === 'function')
                ? getCityNavTarget(unit, nearestEnemy)
                : nearestEnemy;
        }
        return; // EnemyLandStrategyAI is in charge; don't run the random scanner
    }
    // ════════════════════════════════════════════════════════════════════════

// --- NEW GUARD: PACIFY EARLY-GAME WALL DEFENDERS (PATCHED) ---
        let southGate = (typeof battleEnvironment !== 'undefined' && battleEnvironment.cityGates) 
            ? battleEnvironment.cityGates.find(g => g.side === "south") : null;
        // isGateBreached already computed once at the top of this function.

        if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle && unit.side === "enemy") {
            let areLaddersDeployed = typeof siegeEquipment !== 'undefined' && 
                                     siegeEquipment.ladders && 
                                     siegeEquipment.ladders.some(l => l.isDeployed && l.hp > 0);
                                     
            // Wake up if ladders hit the wall OR the gate is smashed
            if (!unit.stats.isRanged && !areLaddersDeployed && !isGateBreached) {
                unit.vx = 0;
                unit.vy = 0;
                unit.state = "idle"; 
                unit.target = null;
                return; 
            }
        }
        // LADDER CREW: Assign the nearest undeployed ladder as target, then move to it
        if (unit.orderType === "ladder_crew") {
            if (typeof siegeEquipment !== 'undefined' && siegeEquipment.ladders) {
                let undeployedLadders = siegeEquipment.ladders.filter(l => !l.isDeployed && l.hp > 0);
                if (undeployedLadders.length > 0) {
                    let closest = undeployedLadders.reduce((prev, curr) =>
                        Math.hypot(curr.x - unit.x, curr.y - unit.y) < Math.hypot(prev.x - unit.x, prev.y - unit.y) ? curr : prev
                    );
                    unit.target = closest;
                    unit.hasOrders = true;
                }
            }
            return;
        }
 // --- NEW ANCHOR PROTECTION ---
        // Prevents the 5% random dummy reassignment from hijacking settled units
        if (unit.target && unit.target.isAnchor) {
            return;
        }


// --- RAM CREW VALIDATION ---
// Only run this if we are actually in a siege battle
if (inSiege && (unit.type === "ram" || unit.siegeRole === "battering_ram")) {
    const crewTouchDistance = 60; 
    
    // Ensure we use 'unit' here, not 'ram'
    const hasActiveCrew = units.some(other => 
        other.side === unit.side && 
        other !== unit && 
        other.hp > 0 && 
        !other.isDummy &&
        Math.hypot(unit.x - other.x, unit.y - other.y) < crewTouchDistance
    );

    if (!hasActiveCrew) {
        unit.target = null;
        unit.hasOrders = false;
        unit.state = "idle"; 
        return; 
    }
}
		
// --- CREW REINTEGRATION (ATTACKERS & DEFENDERS) ---
// Wraps engine crew check in the same inSiege check to prevent land battle errors
if (inSiege && (unit.siegeRole === "treb_crew" || unit.siegeRole === "trebuchet_crew" || unit.siegeRole === "engine_crew")) {
    let myEngine = (unit.target && (unit.target.isTrebuchet || unit.target.isBallista || unit.target.type === "trebuchet" || unit.target.type === "ballista")) ? unit.target : null;
    
    // If the target engine doesn't exist or is destroyed, clear their duty.
    if (!myEngine || myEngine.hp <= 0) {
        unit.siegeRole = "infantry";
        unit.target = null;
        unit.hasOrders = false;
    }
}
 
        //clear the gate gathering dummy
		const now = Date.now();

		if (inSiege && unit.side === "enemy" && battleEnvironment) {
			if (!battleEnvironment.defenderGateDummyDisabled) {
				const startedAt = battleEnvironment.defenderGateDummyStartedAt || now;
				if (now - startedAt > 3000) {
					battleEnvironment.defenderGateDummyDisabled = true;
				}
			}

			if (battleEnvironment.defenderGateDummyDisabled && unit.target && unit.target.isDummy) {
				const p = unit.target.priority || "";
				if (p === "gate_plug" || p === "gate_patrol" || p === "ranged_line" || p === "plaza") {
					unit.target = null;
					unit.hasOrders = false;
				}
			}
		}

		// ==========================================
        // SIEGE MACRO-TARGETING OVERHAUL
        // ==========================================
      // ==========================================
        // SIEGE MACRO-TARGETING OVERHAUL
        // ==========================================
        // GUARANTEED GATE GUARD: this whole block — attacker ladder/gate
        // macro-logic AND defender wall-duty macro-logic below — is now
        // reachable ONLY while the siege gate is still standing. The instant
        // isGateBreached flips true, every unit here falls straight through
        // to the land-AI smart-targeting block further up this function
        // instead (see the GATE-BREACH HANDOFF comment near the top). No
        // sub-branch inside this block needs its own isGateBreached check
        // anymore — that's the whole point of guaranteeing it here.
        if (inSiege && !isGateBreached) {
            let gateX = typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelX : BATTLE_WORLD_WIDTH / 2;
            let gateY = typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelY : BATTLE_WORLD_HEIGHT / 2;

            let gateTarget = { x: gateX, y: gateY - 20, hp: 9999, isDummy: true, priority: "gate_funnel" };
            let plazaTarget = { x: gateX, y: typeof SiegeTopography !== 'undefined' ? SiegeTopography.plazaPixelY : BATTLE_WORLD_HEIGHT / 2, hp: 9999, isDummy: true, priority: "plaza" };
// ATTACKER COMMON GOAL (OVERHAULED FOR LADDERS & PLAZA)
            // ATTACKER COMMON GOAL
if (unit.side === "player") {

    // 0. FROZEN GUARD: units held with _lazyManual (e.g. the hard-freeze at
    // siege start, before the player presses the siege auto-attack button)
    // must not be touched by this macro-targeting system at all.
    if (unit._lazyManual) return;

    // 0b. REQUIRE AN EXPLICIT COMMAND. This whole macro-targeting system
    // used to run for every player unit by default and only bailed out for
    // follow/retreat/hold_position (see the old hasManualCommand check
    // below). That meant a completely fresh unit — hasOrders: false, never
    // touched by the player — sailed straight through with nothing to stop
    // it, and got auto-assigned to a ladder or gate rush on its own. Sieges
    // should start with attackers doing nothing at all until the player
    // gives an actual command (pressing the siege auto-attack button, which
    // sets orderType = "siege_assault" via executeSiegeAssaultAI, or a
    // direct move/seek order). No recognized command yet -> do nothing.
    const hasEngageCommand = unit.hasOrders &&
        ["siege_assault", "move_to_point", "seek_engage"].includes(unit.orderType);
    if (!hasEngageCommand) return;

    // 1. Define who is "On Duty" (These units ignore your follow/retreat orders to finish the siege task)
    const isActiveCrew = ["ram_pusher", "ladder_carrier", "battering_ram", "engine_crew"].includes(unit.siegeRole);

    // 2. THE SURGERY: If I'm NOT a crew member, and I have a MANUAL command (Follow, Stop, or Retreat)
    // we EXIT this AI block immediately so they obey you.
    // NOTE: We do NOT include "move_to_point" here so that your "5-q" attack still uses Siege Logic.
    const hasManualCommand = unit.hasOrders && ["follow", "retreat", "hold_position"].includes(unit.orderType);

    if (!isActiveCrew && hasManualCommand) {
        return; // Stop the Siege AI from overriding. Unit moves naturally to your target!
    }

    // ---------------------------------------------------------
    // 3. SIEGE MACRO LOGIC (Only runs if no manual command is active)
    // ---------------------------------------------------------
    
    // Calculate Gate Centroid
    const gateCentroid = southGate && southGate.pixelRect
        ? { x: southGate.pixelRect.x + (southGate.pixelRect.w / 2), y: southGate.pixelRect.y + (southGate.pixelRect.h / 2) }
        : { x: gateX, y: gateY };

                    // Check if any ladders are successfully deployed against the walls
                    const areLaddersDeployed = typeof siegeEquipment !== 'undefined' && 
                                               siegeEquipment.ladders && 
                                               siegeEquipment.ladders.some(l => l.isDeployed && l.hp > 0);

                    // PRE-DEPLOYMENT MAGNET: Pull eligible infantry toward undeployed ladders like magnets
                    const hasUndeployedLadders = typeof siegeEquipment !== 'undefined' &&
                                                  siegeEquipment.ladders &&
                                                  siegeEquipment.ladders.some(l => !l.isDeployed && l.hp > 0);

                    if (!areLaddersDeployed && hasUndeployedLadders && canUseSiegeEngines(unit) && !unit.isClimbing && !unit.onWall) {
                        let undeployedLadders = siegeEquipment.ladders.filter(l => !l.isDeployed && l.hp > 0);
                        let bestLadder = undeployedLadders.reduce((prev, curr) =>
                            Math.hypot(curr.x - unit.x, curr.y - unit.y) < Math.hypot(prev.x - unit.x, prev.y - unit.y) ? curr : prev
                        );
                        unit.target = bestLadder;
                        unit.orderType = "ladder_crew";
                        unit.hasOrders = true;
                        return;
                    }

                    // NOTE: the old "gate just breached — reroute everyone to
                    // the gate centroid" reassignment that used to live here
                    // is now dead code by construction: this entire macro-
                    // targeting block only runs while `!isGateBreached` (see
                    // the guaranteed guard above), so isGateBreached can never
                    // be true at this point. The instant the gate goes down,
                    // player siege_assault units get their land-AI handoff
                    // from processTacticalOrders() in battlefield_commands.js
                    // instead (smart target + getCityNavTarget steering).

                    // 2. LADDERS DEPLOYED (GATE INTACT) -> STORM THE LADDERS (Two-Phase Charge)
                    if (areLaddersDeployed && canUseSiegeEngines(unit)) {
                        
                        // Find the closest active ladder to use as our "Centroid"
                        let activeLadders = typeof siegeEquipment !== 'undefined' ? 
                                            siegeEquipment.ladders.filter(l => l.isDeployed && l.hp > 0) : [];
                        let bestLadder = activeLadders[0] || {x: gateCentroid.x, y: gateCentroid.y};
                        
                        if (activeLadders.length > 0) {
                            bestLadder = activeLadders.reduce((prev, curr) => 
                                Math.hypot(curr.x - unit.x, curr.y - unit.y) < Math.hypot(prev.x - unit.x, prev.y - unit.y) ? curr : prev
                            );
                        }

                        // Only apply this to units not already locked into climbing
                        if (!unit.isClimbing && !unit.onWall) {
                            unit.siegeRole        = "ladder_charger";
                            unit.hasOrders        = true;
                            unit.orderType        = "move_to_point";
                            unit.breachRush       = true;
                            unit.priorityOverride = true; // tells processAction to skip engagement logic

                            const _centroidX = bestLadder.x;
                            const _centroidY = bestLadder.y - 10; // Aim right at the ladder's base
                            const _distToCentroid = Math.hypot(unit.x - _centroidX, unit.y - _centroidY);

                            if (_distToCentroid > 20) {
                                // PHASE A — march directly to the ladder base
                                unit.target = { 
                                    x: _centroidX, 
                                    y: _centroidY,
                                    hp: 9999, 
                                    isDummy: true, 
                                    priority: "ladder_centroid",
                                    isLadderAssault: true // Hooks into the fast-track climbing physics
                                };
                            } else {
                                // PHASE B — once at the ladder, push through to the city plaza
                                unit.target = plazaTarget;
                            }
                            return;
                        }
                    }

                    // 3. PRE-BREACH & PRE-LADDER -> RANGED FORMATIONS HOLD LINE
                    if (!canUseSiegeEngines(unit)) {
                        let wallY = typeof SiegeTopography !== 'undefined' ? SiegeTopography.wallPixelY : 2000;
                        unit.target = {
                            x: unit.x,
                            y: wallY + 120,
                            hp: 9999,
                            isDummy: true,
                            priority: "wall_shoot_line"
                        };
                        return;
                    }
               
            }
						
		// ==========================================
            // DEFENDER COMMON GOAL (PATCHED)
            // ==========================================
            if (unit.side === "enemy") {
                // NOTE: the old "gate just breached -> rush to the plaza"
                // dummy-point assignment that used to live here is dead code
                // by construction now — this whole DEFENDER COMMON GOAL
                // section only runs while `!isGateBreached` (see the
                // guaranteed guard on the enclosing block above). The instant
                // the gate goes down, defenders get the real smart land-AI
                // targeting (with getCityNavTarget steering) from the block
                // near the top of this function instead of a plaza waypoint.
                {
                    const duty = siegeDefenseRoll(unit);
                    const ranged = isSiegeRangedDefender(unit);
                    const siegeCrew = canUseSiegeEngines(unit);
                    let wallY = typeof SiegeTopography !== 'undefined' ? SiegeTopography.wallPixelY : gateY;

                    // --- 1. ENGINE CREW ALLOCATION ---
                    let availableEngines = [];
                    if (typeof siegeEquipment !== 'undefined') {
                        if (siegeEquipment.trebuchets) availableEngines.push(...siegeEquipment.trebuchets.filter(t => t.side === 'enemy' && t.hp > 0));
                        if (siegeEquipment.ballistas) availableEngines.push(...siegeEquipment.ballistas.filter(b => b.side === 'enemy' && b.hp > 0));
                    }
                    if (availableEngines.length > 0 && duty < 50) { 
                        let engine = availableEngines[duty % availableEngines.length];
                        unit.target = engine; 
                        unit.siegeRole = "engine_crew";
                        unit.disableAICombat = true; 
                        return;
                    }

                    // Scan for real threats to establish Aggro Radius
                    let nearestEnemy = null;
                    let nearestDist = Infinity;
                    units.forEach(other => {
                        if (other.side !== unit.side && other.hp > 0 && !other.isDummy) {
                            const d = Math.hypot(unit.x - other.x, unit.y - other.y);
                            if (d < nearestDist) {
                                nearestDist = d;
                                nearestEnemy = other;
                            }
                        }
                    });

                    // --- 2. RANGED LOGIC ---
                    if (ranged) {
                        if (nearestEnemy && nearestDist < unit.stats.range + 100) {
                            unit.target = nearestEnemy; // Engage if in range
                        } else {
                            // Defenders stand on the PARAPET (inner/north face of the combined
                            // wall+wood scaffold) before shooting.
                            // wallThick=10 tiles, woodThick=7 tiles → combinedThick=17 tiles.
                            // parapetY = wallPixelY - combinedThick * BATTLE_TILE_SIZE
                            // This puts archers on top of the wooden walkway, looking south
                            // at the attackers rather than wandering south of the wall.
                            let _ts = (typeof BATTLE_TILE_SIZE !== 'undefined') ? BATTLE_TILE_SIZE : 8;
                            let parapetY = wallY - (17 * _ts); // 17 = wallThick(10) + woodThick(7)
                            unit.target = {
                                x: gateX + ((Math.random() - 0.5) * 1600), 
                                y: parapetY,
                                hp: 9999, isDummy: true, priority: "ranged_line"
                            };
                        }
                        return;
                    }

                    // --- 3. LADDER RUSH ---
                    let activeLadders = typeof siegeEquipment !== 'undefined' && siegeEquipment.ladders 
                                        ? siegeEquipment.ladders.filter(l => l.isDeployed && l.hp > 0) : [];

                    if (activeLadders.length > 0 && !ranged && !siegeCrew) {
                        let bestLadder = activeLadders.reduce((prev, curr) => 
                            Math.hypot(curr.x - unit.x, curr.y - unit.y) < Math.hypot(prev.x - unit.x, prev.y - unit.y) ? curr : prev
                        );
                        unit.target = { x: bestLadder.x, y: wallY + 10, hp: 9999, isDummy: true, priority: "ladder_defense" };
                        return;
                    }

                    // --- 4. MELEE FORMATION (WITH AGGRO RADIUS) ---
                    // If an enemy gets extremely close (e.g., climbs the wall), break formation and attack!
                    if (nearestEnemy && nearestDist < 120) {
                        unit.target = nearestEnemy;
                        return;
                    }

                    // Otherwise, hold the line indefinitely (No more 3-second disabling!)
                    if (siegeCrew || duty < 3) { 
                        unit.target = { x: gateX + ((duty % 2 === 0 ? -1 : 1) * 80), y: wallY - 50, hp: 9999, isDummy: true, priority: "gate_plug" };
                        return;
                    }
                    if (duty < 10) { 
                        unit.target = { x: gateX + ((Math.random() - 0.5) * 1600), y: wallY - 50, hp: 9999, isDummy: true, priority: "gate_patrol" };
                        return;
                    }
                }
            }
        }
 
		// ==========================================
        // COUNTER-BATTERY TARGET OVERRIDE
        // ==========================================
        if (unit.siegeRole === "counter_battery" && !unit.disableAICombat) {
            let bestSnipeTarget = null;
            let bestSnipeScore = Infinity; // Lower score is better

            units.forEach(other => {
                if (other.side !== unit.side && other.hp > 0 && !other.isDummy) {
                    let isEnemyRanged = other.stats?.isRanged || String(other.stats?.role || "").toLowerCase().includes("archer");
                    let dist = Math.hypot(unit.x - other.x, unit.y - other.y);

                    let score = isEnemyRanged ? (dist - 5000) : dist;
                    
                    if (score < bestSnipeScore) {
                        bestSnipeScore = score;
                        bestSnipeTarget = other;
                    }
                }
            });

            if (bestSnipeTarget) {
                unit.target = bestSnipeTarget;
                return;
            }
        }
 
        let currentTargetDist = (unit.target && unit.target.hp > 0 && !unit.target.isDummy) 
            ? Math.hypot(unit.x - unit.target.x, unit.y - unit.target.y) 
            : Infinity;

// PERFORMANCE: Only re-scan for a new target if the current one is gone, or on a low-probability random check.
        // Skip the scan entirely if this unit has a healthy real target — saves many CPU cycles per frame.
        const hasHealthyTarget = unit.target && unit.target.hp > 0 && !unit.target.isDummy;
        if (!hasHealthyTarget || Math.random() < 0.008 || (unit.target.isDummy && Math.random() < 0.04)) {
            let nearestDist = Infinity;
            let nearestEnemy = null;
            units.forEach(other => {

                if (other.side !== unit.side && other.hp > 0 && !other.isDummy) {
                    let dist = Math.hypot(unit.x - other.x, unit.y - other.y);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestEnemy = other;
                    }
                }
            });
            
            if (nearestEnemy && nearestDist < currentTargetDist) {
                unit.target = nearestEnemy;
            }
        }
    },

processAction: function(unit, battleEnv, currentBattleData, player) {

// ---> FORMATION-LOCK: player-drawn drag formations override ALL AI <---
// While a unit is marching to a waypoint assigned by the Total War-style
// drag formation (see battlefield_commands.js's executeBoxFormationMove),
// it ignores every other AI system entirely — no targeting, no combat, no
// siege ladder hand-off, no HOLD/SHIELD/SKIRM/CHARGE tactic logic further
// down, nothing below this point runs. This is a harder guarantee than
// relying on orderType==='move_to_point' being respected everywhere else
// in this function: it runs before ANYTHING else, so no future branch can
// accidentally reintroduce a stop-to-fight case, and it holds even for
// cases that specific priority doesn't cover (e.g. isRocketLocked units).
// Clears itself the instant the unit arrives. Arrival now hands the unit
// straight to hold_position and returns (see below) instead of falling
// through to whatever AI/tactic was left — the unit stops, holds that
// exact spot facing the direction the arrow pointed, and only fights back
// if something comes within its hold_position aggro range. Any tactic the
// unit had before this order (skirmish/stand_ground/etc.) was already
// cleared when the order was issued (executeBoxFormationMove), so there's
// nothing left to resume. Cmd.stop(), cancelAiTactic(), and setAiTactic()
// in RTSControls.js all clear this flag directly too, so a player-issued
// HOLD/STOP/cancel/any-other-tactic interrupts the march immediately
// instead of waiting for arrival.
if (unit._formationLocked) {
    if (!unit.orderTargetPoint) {
        unit._formationLocked = false;
    } else {
        let fdx = unit.orderTargetPoint.x - unit.x;
        let fdy = unit.orderTargetPoint.y - unit.y;
        let fdist = Math.hypot(fdx, fdy);
        const FORMATION_ARRIVAL_THRESHOLD = 14;
        if (fdist <= FORMATION_ARRIVAL_THRESHOLD) {
            // ARRIVED — Total War-style drag-waypoint march is complete.
            //
            // FIX ("destinations slightly off / not landing on the
            // waypoint often"): this used to just zero velocity wherever
            // physics/collision happened to leave the unit inside the 14px
            // tolerance ring and stop there. Snap directly onto the exact
            // ordered point instead — never more than
            // FORMATION_ARRIVAL_THRESHOLD px of correction, so it reads as
            // the unit finishing its step cleanly, not teleporting.
            unit.x = unit.orderTargetPoint.x;
            unit.y = unit.orderTargetPoint.y;
            unit.vx = 0;
            unit.vy = 0;
            unit._formationLocked = false;

            // FIX ("arrow direction should be the FINAL facing, not
            // whatever way the unit happened to be walking when it
            // stopped"): troop_draw.js derives facingDir/facingDirY purely
            // from this-frame-vs-last-frame position deltas, so a unit
            // that just stops keeps whatever facing its last moving frame
            // produced — the approach angle into its formation slot, which
            // is usually NOT the direction the player actually drew.
            // executeBoxFormationMove (battlefield_commands.js) stamps the
            // resolved formation angle onto every unit via
            // calculateFormationOffsets; reuse that same 0-rad-is-"up"
            // fx/fy convention (matches renderFormationArrowPreview's
            // preview-arrow math exactly) to resolve a final facing here.
            //
            // Also re-stamp _prevX/_prevY to the SAME snapped position so
            // troop_draw.js's next per-frame delta computes to zero this
            // frame — otherwise the position snap above (up to 14px) would
            // itself register as "movement" the instant troop_draw.js next
            // runs, and its own delta-based logic could immediately
            // recompute (and stomp) the facing we're about to set here,
            // undoing this fix on the very frame it takes effect.
            if (typeof unit._formationFacingAngle === 'number') {
                const _fa = unit._formationFacingAngle;
                const _ffx = Math.sin(_fa), _ffy = -Math.cos(_fa);
                if (Math.abs(_ffx) >= Math.abs(_ffy)) {
                    unit.facingDir  = _ffx >= 0 ? 1 : -1;
                    unit.facingDirY = 0;
                } else {
                    unit.facingDirY = _ffy >= 0 ? 1 : -1;
                }
                unit._flipTick  = 0;
                unit._vFlipTick = 0;
            }
            unit._prevX = unit.x;
            unit._prevY = unit.y;

            // STOP — hand off to the exact same "hold this spot, still
            // fight anyone who gets close" behavior the E/STOP command and
            // the HOLD tactic's own arrival both use
            // (processTacticalOrders' hold_position branch in
            // battlefield_commands.js): ranged units engage out to their
            // full range, melee units get a 70px self-defense radius, and
            // with nobody in range the unit just stands fast right here.
            // This unit's own leftover AI tactic (skirmish/stand_ground/
            // etc, if any) was already cleared the moment this order was
            // issued — see executeBoxFormationMove — so there's nothing
            // else left that should resume.
            unit.hasOrders        = true;
            unit.orderType        = "hold_position";
            unit.orderTargetPoint = null;
            unit.target            = null;
            unit.formationTimer    = 0;
            unit.state              = "idle";
            return;
        } else {
            this._handleMovement(unit, fdx, fdy, fdist, battleEnv);
            unit.state = "moving";
            return;
        }
    }
}

// ---> REMOVED: camera-visibility AI skip <---
// This used to early-return for any unit not currently on screen, which
// meant off-camera units never got processAction (movement/combat) called
// at all -- they sat completely frozen until the player zoomed/panned far
// enough out for isOnScreen() to return true for them. isOnScreen() /
// VIEW_PADDING is a RENDER-ONLY helper (see battlefield_launch.js /
// optimization-battles.js) and must never gate simulation logic -- only
// drawing (troop_draw.js already culls render the right way). Simulation
// must keep running for every unit regardless of camera position.

// ---> SURGERY: Evaluate the gate status FIRST before the ladder logic
        // Now sourced from the single canonical isSiegeGateBreached() helper
        // (see the top of this file) instead of a local recompute.
        let isGateBreached = isSiegeGateBreached();

if (!isGateBreached && unit.side === "player" && unit.target && !unit.target.isDummy && unit.onWall !== unit.target.onWall && canUseSiegeEngines(unit)) {
	

    if (!unit.onWall) { 
        const activeLadders = typeof siegeEquipment !== 'undefined' ? 
            siegeEquipment.ladders.filter(l => l.isDeployed && l.hp > 0) : [];
        
        if (activeLadders.length > 0) {
            let bestLadder = activeLadders.reduce((prev, curr) => {
                let scorePrev = Math.hypot(prev.x - unit.x, prev.y - unit.y) + (Math.random() * 50);
                let scoreCurr = Math.hypot(curr.x - unit.x, curr.y - unit.y) + (Math.random() * 50);
                return scoreCurr < scorePrev ? curr : prev;
            });

            unit.target = { 
                x: bestLadder.x, 
                y: bestLadder.y - 20, // Always point to the base to climb up
                onWall: true, 
                isDummy: true,
                isLadderAssault: true
            };
            unit.state = "moving";
            unit.hasOrders = true;
			
		 unit.targetLadder = bestLadder;  // cache ref so X-lock always has it
            // Snap ladder-specialists into the correct approach lane immediately
            if (unit.siegeRole === "ladder_fanatic" || unit.siegeRole === "ladder_carrier") {
				const _maxNudge = (unit.stats?.speed ?? 2) * 1.5; // max px per frame
				const _rawNudge = (bestLadder.x - unit.x) * 0.20;
				unit.x += Math.max(-_maxNudge, Math.min(_maxNudge, _rawNudge));
            }
        }
    }
}
		let oldX = unit.x;
        let oldY = unit.y;
        
        let inSiege = typeof inSiegeBattle !== "undefined" && inSiegeBattle;

        // =========================================================
        // ---> FIX: UNCOMMANDED SIEGE ATTACKER HARD FREEZE (ALL ROLES) <---
        // =========================================================
        // Root cause: with no orders yet, processTargeting()'s generic fallback
        // scan still hands this unit a live unit.target (nearest enemy) purely
        // from proximity/line-of-sight, and the "Land battles" block inside
        // _handleMovement (unit.side === "player" && !unit.hasOrders, further
        // down this file) then lets EVERY type creep toward that target with
        // no siege check at all — melee close the whole distance to the gate,
        // and even ranged units advance to their "auto-assigned position near
        // the wall" (dist < 20 before it holds). That block was written for
        // open-field battles, where "walk toward the enemy by default" is
        // correct; it was never given a siege exclusion, so it fires here too.
        // RESERVES REMOVED (explicit request): this used to also carry a
        // separate "cavalry_reserve" freeze case above this one, parking every
        // mounted unit motionless at camp until the gate broke. That entire
        // reserve mechanism — along with the two OTHER independent reserve/
        // freeze systems that used to exist (a random 2% whole-army draft in
        // executeSiegeAssaultAI, and a second competing AI driver in
        // siegeEngineLogic.js) — has been removed. See battlefield_commands.js's
        // executeSiegeAssaultAI for the current model: every unit is either a
        // ranged shooter, a ram pusher, or ladder crew (active or queued),
        // permanently, with nothing ever routed back to a reserve/camp state.
        // Fix: freeze every player siege unit outright — melee, ranged,
        // gunpowder, cavalry alike — the instant it has no orders, before it
        // ever reaches that fallback or _handleMovement. Land battles are
        // completely untouched (inSiege gates this entirely), and this stands
        // down the moment the player selects the unit and issues any real
        // command (hasOrders flips true, orderType gets set — see
        // executeSiegeAssaultAI / the Q-E-R-F handlers in
        // battlefield_commands.js), at which point normal siege AI resumes.
        if (inSiege && unit.side === "player" && !unit.hasOrders && !unit.isCommander) {
            unit.vx = 0;
            unit.vy = 0;
            unit.state = "idle";
            // Same stamina-regen courtesy as before — resting, not fighting.
            if (unit.stats.stamina < 100 && Math.random() > 0.9) unit.stats.stamina++;
            return;
        }
  
       // ---> SURGERY 2: THE COMBAT/ACTION HARD BLOCK <---
        // Kept the hard block ONLY for pure pacifist roles like ladder carriers
        if (unit.disableAICombat || unit.orderType === "ladder_crew") {
            if (unit.target) {
                let dx = unit.target.x - unit.x;
                let dy = unit.target.y - unit.y;
                let dist = Math.hypot(dx, dy);
                this._handleMovement(unit, dx, dy, dist, battleEnv);
                let hasMoved = Math.abs(unit.x - oldX) > 0.1 || Math.abs(unit.y - oldY) > 0.1;
                unit.state = hasMoved ? "moving" : "idle";
            }
            return; 
        }

// SURGERY 2: Add 'follow' and 'retreat' so units don't drop into combat logic against their own waypoints
        //
        // BUGFIX ("ram pushers/gate-freed units permanently stuck at the
        // broken gate, immune to new orders"): priorityOverride was set
        // once (siegeEngineLogic.js's gate-breach hand-off, ai_categories.js's
        // own gate_charger hand-off) and never cleared anywhere in the
        // codebase. Once true, this branch short-circuited on its own
        // FIRST clause every tick forever, steering the unit at a frozen
        // one-time dummy target (siegeEngineLogic.js line ~166: gateX,
        // gateY-20) with no logic anywhere to ever hand the unit a new
        // waypoint once it arrived — _handleMovement is a pure physics
        // integrator with no re-targeting of its own. Manual player move
        // orders (battlefield_commands.js) only ever write orderTargetPoint/
        // orderType, never touch priorityOverride or unit.target directly,
        // so a freed unit kept re-locking onto the stale gate point every
        // frame no matter what the player clicked — reading as "collision"
        // when it was really a dead waypoint with no continuation.
        //
        // Fix: priorityOverride/dummy-target lock only holds while it's
        // actually still driving toward genuinely unclaimed navigation —
        // the moment something has supplied a real (non-dummy) target, or
        // the player has issued a fresh point via orderTargetPoint, that's
        // real re-aiming and the override should stand down instead of
        // being sticky forever. We detect "fresh player order" by orderType
        // no longer being one of the funnel/dummy order types, or by
        // orderTargetPoint having been set to something new since the
        // dummy target was assigned.
        if (unit.priorityOverride && unit.target && !unit.target.isDummy) {
            // Something (seek_engage resolving a live enemy, a manual
            // attack-move, etc.) has already given this unit a real target.
            // The dummy-funnel job is done — release the lock instead of
            // re-deriving movement from a target that's no longer a dummy
            // waypoint we own.
            unit.priorityOverride = false;
        } else if (unit.priorityOverride && unit.orderTargetPoint &&
            (!unit.target || unit.orderTargetPoint.x !== unit.target.x || unit.orderTargetPoint.y !== unit.target.y)) {
            // The player (or formation logic) issued a fresh destination
            // that doesn't match the frozen dummy point — honor it and
            // drop the override so this unit is no longer immune to orders.
            unit.priorityOverride = false;
            unit.target = { x: unit.orderTargetPoint.x, y: unit.orderTargetPoint.y, hp: 9999, isDummy: true };
        }

        if (unit.priorityOverride || ((["siege_assault", "move_to_point", "follow", "retreat"].includes(unit.orderType)) && unit.target && unit.target.isDummy)) {

             let dx = unit.target.x - unit.x;
             let dy = unit.target.y - unit.y;
             let dist = Math.hypot(dx, dy);
             this._handleMovement(unit, dx, dy, dist, battleEnv);
             let hasMoved = Math.abs(unit.x - oldX) > 0.1 || Math.abs(unit.y - oldY) > 0.1;
             unit.state = hasMoved ? "moving" : "idle";

             // DEBUG: [DUMMY-LOCK] logs every tick a unit spends inside this
             // branch, throttled to a couple times a second per unit so it
             // doesn't flood the console. If a stuck unit is logging this
             // with dist staying roughly constant and NOT shrinking over
             // several seconds, it's stuck on approach (something else —
             // e.g. the GATE-CLAMP snap in siegeEngineLogic.js, or plain
             // unit-vs-unit collision — is preventing it from ever closing
             // the distance to its own target). If dist is near 0 and
             // staying there, it means this branch's own dist<20 release
             // below isn't firing — check hasMoved/unit.state in that case.
             if (window.__SIEGE_DEBUG_GATE__) {
                 unit.__debugLastLog = unit.__debugLastLog || 0;
                 if (Date.now() - unit.__debugLastLog > 500) {
                     unit.__debugLastLog = Date.now();
                     console.log(
                         "%c[DUMMY-LOCK] unit driving toward dummy/override target",
                         "color:#000;background:#f1c40f;font-weight:bold;padding:2px 4px;",
                         {
                             unitId: unit.id ?? unit.name ?? "(no id)",
                             siegeRole: unit.siegeRole,
                             orderType: unit.orderType,
                             priorityOverride: unit.priorityOverride,
                             unitX: Math.round(unit.x),
                             unitY: Math.round(unit.y),
                             targetX: Math.round(unit.target.x),
                             targetY: Math.round(unit.target.y),
                             dist: Math.round(dist),
                             hasMoved,
                             state: unit.state
                         }
                     );
                 }
             }

             // BUGFIX continued: arriving at the dummy point used to be a
             // dead end (dist collapses toward 0, _handleMovement zeroes
             // velocity, nothing ever supplies a next waypoint). Once truly
             // close, release the lock and hand the unit to normal
             // seek_engage targeting instead of leaving it parked forever.
             if (dist < 20 && unit.target && unit.target.isDummy) {
                 // ── AI TACTIC: HOLD — FORMATION LOCK-IN ─────────────────
                 // A stand_ground (HOLD)-tagged unit walking to its
                 // calculateFormationOffsets() slot (see RTSControls.js's
                 // Cmd.setAiTactic 'stand_ground' branch: move_to_point +
                 // a dummy target at cx+offsetX/cy+offsetY) is still just a
                 // dummy-target arrival exactly like siege_assault/follow/
                 // retreat funnel through above — but it must NOT fall into
                 // the generic seek_engage hand-off below like they do.
                 // "Formation king: never chases, prioritizes staying
                 // together" (RTSControls.js doc comment) means arriving at
                 // the slot should lock the unit into actually holding it,
                 // not immediately release it to chase the nearest enemy.
                 // Also covers the formationTimer running out before actual
                 // arrival (a crowded/blocked slot) so a Hold unit can't get
                 // stuck marching forever either way.
                 if (unit.aiTacticGroup === 'stand_ground') {
                     unit.priorityOverride = false;
                     unit.target = null;
                     unit.orderType = "hold_position";
                     unit.hasOrders = true;
                     unit.formationTimer = 0;
                     return;
                 }
                 if (window.__SIEGE_DEBUG_GATE__) {
                     console.log(
                         "%c[DUMMY-LOCK] released — handing off to seek_engage",
                         "color:#fff;background:#27ae60;font-weight:bold;padding:2px 4px;",
                         { unitId: unit.id ?? unit.name ?? "(no id)", finalDist: Math.round(dist) }
                     );
                 }
                 unit.priorityOverride = false;
                 unit.target = null;
                 unit.orderType = "seek_engage";
                 unit.hasOrders = true;
             } else if (unit.aiTacticGroup === 'stand_ground' && unit.formationTimer === 0 &&
                        unit.target && unit.target.isDummy) {
                 // formationTimer expired (decremented once per tick near the
                 // top of this function) before the unit actually reached its
                 // slot — e.g. a blocked/crowded formation position. Lock into
                 // hold_position wherever it currently stands rather than
                 // marching indefinitely toward an unreachable point.
                 unit.priorityOverride = false;
                 unit.target = null;
                 unit.orderType = "hold_position";
                 unit.hasOrders = true;
             }
             return;
        }
         
        const txt = String(
            (unit.unitType || "") + " " +
            (unit.stats?.role || "") + " " +
            (unit.stats?.name || "")
        ).toLowerCase();

        const isMountedOrLarge = Boolean(
            unit.stats?.isLarge ||
            unit.isMounted ||
            /\b(cav|horse|mounted|camel|eleph|lancer)\b/.test(txt)
        );

        // Horse archers / mounted ranged: must ALWAYS maintain gap unless out of ammo.
        // This flag bypasses the stop-dead-to-shoot velocity zero further below so
        // microLightCav's kite orderMove vectors actually execute frame-to-frame.
        const isRangedCav = isMountedOrLarge && !!(unit.stats?.isRanged) &&
            (unit.stats?.ammo > 0 || unit.ammo > 0);

        // ROCKET HARD LOCK — per direct request: "once its shooting, its in
        // machine gun mode and CANNOT switch to any other orientation until
        // all ammunition is exhausted. it cannot move, it cannot stop
        // shooting until all rounds fired for specifically rocket." Unlike
        // every other ranged unit type (which can still reposition/chase
        // while in statusrange — see the dist > rangeThreshold movement
        // branch below), a Rocket unit that's actively in ranged stance
        // with live ammo is fully pinned in place for the whole volley:
        // no movement, no orientation change (paired with infscript.js's
        // own _rocketLocked direction lock, which already holds the
        // up/down pose for the same duration — this is the AI-side
        // counterpart that stops the unit's actual x/y from changing
        // too). The lock releases the instant ammo hits 0 (updateStance
        // demotes currentStance to "statusmelee" on its own, so this
        // condition naturally goes false and normal melee-closing
        // movement resumes automatically — no separate release logic
        // needed here).
        //
        // FIX — added `unit.state === "attacking"`: currentStance flips to
        // "statusrange" the moment the unit has ammo and is outside melee
        // distance (15), which is true from far across the map, long before
        // it's within its actual weapon range. Without this clause the lock
        // was already true on approach, forcing `!isRocketLocked` to false in
        // the `dist > rangeThreshold` check below regardless of real distance —
        // the unit skipped movement entirely and fired from wherever it
        // happened to be. `unit.state` only becomes "attacking" inside the
        // else-branch below, i.e. after a prior frame already confirmed the
        // unit was within rangeThreshold — so the lock now only grabs hold
        // once the unit has legitimately closed to range.
        const isRocketLocked = unit.unitType === "Rocket" &&
            unit.stats?.currentStance === "statusrange" &&
            unit.state === "attacking" &&
            unit.stats?.ammo > 0;

        if (unit.target) {
            if (inSiege && unit.side === "player" && isMountedOrLarge) {
                if (unit.target.isDummy || unit.target.hp <= 0) {
                    
                    // Look for enemies if safe, otherwise chill
                    let nearestEnemy = null;
                    let nearestDist = Infinity;
                    if (battleEnv && battleEnv.units) {
                        for (let other of battleEnv.units) {
                            if (!other || other.hp <= 0 || other.side === unit.side || other.isDummy) continue;
                            let d = Math.hypot(other.x - unit.x, other.y - unit.y);
                            if (d < nearestDist) { nearestDist = d; nearestEnemy = other; }
                        }
                    }

                    if (nearestEnemy && nearestDist < 400) { // Only engage if relatively close
                        unit.target = nearestEnemy;
                    } else {
                        unit.state = "idle";
                        if (unit.stats.stamina < 100 && Math.random() > 0.9) unit.stats.stamina++;
                        return;
                    }
                }
            }

            let dx = unit.target.x - unit.x;
            let dy = unit.target.y - unit.y;
            let dist = Math.hypot(dx, dy);

            // ── AI TACTIC: SKIRMISH KITING ──────────────────────────────
            // Skirmish-tagged units (and auto-tagged ranged units, which
            // pick skirmish for themselves — see RTSControls.js's
            // Cmd.setAiTactic doc comment) retreat once a live enemy target
            // closes inside a "danger zone" fraction of their weapon range,
            // rather than standing still or advancing into melee. This
            // trades one frame's attack for survivability — genuine
            // hit-and-run skirmishing, not simultaneous walk+shoot (this
            // engine's attack execution and movement are mutually
            // exclusive per frame, so that's not available without a much
            // larger change). Gated on !inSiege: getSiegePathfindingVector
            // further down in this function steers using unit.target's
            // real position regardless of the dx/dy passed to
            // _handleMovement, which would fight a reversed retreat vector
            // during a siege specifically — every other battle type
            // (land/river/naval/survival) has no such conflict.
            //
            // FIX ("it also flickers with ranged units"): this used to be a
            // single hard threshold — the instant dist crossed
            // _kiteThreshold the unit retreated, and the instant it drifted
            // back over that exact same line (even by a sub-pixel amount,
            // e.g. from the retreat step itself, or the enemy's own
            // movement) kiting simply stopped firing with no minimum
            // commitment at all. Sitting right at that boundary — which is
            // exactly where a retreating unit naturally ends up, since
            // retreating IS what pushes dist back across the line — flipped
            // the behavior every single frame: retreat one frame, stop the
            // next, retreat again, read as a flicker/vibration in place.
            // Same class of bug as the melee poke-and-run flicker fixed
            // just above (search "FIX" near AI TACTIC: SKIRMISH
            // POKE-AND-RUN) and fixed the same way: real hysteresis instead
            // of one shared line. _kiteThreshold is now only the point that
            // STARTS a retreat; once retreating, the unit commits until
            // EITHER it's opened a clear KITE_STOP_MARGIN of extra distance
            // past that threshold, OR its own minimum commitment timer
            // expires — whichever comes first — so a single frame of
            // crossing back over the original line can't instantly cancel
            // the retreat.
            const _onRangedSiegeDuty = ['treb_crew', 'trebuchet_crew', 'engine_crew', 'counter_battery'].indexOf(unit.siegeRole) !== -1;
            const _wantsSkirmish = unit.aiTacticGroup === 'skirmish' ||
                (unit.aiTacticGroup === 'auto' && unit.stats.isRanged);
            const _hasAmmo = !(unit.stats.ammo !== undefined && unit.stats.ammo <= 0);
            if (_wantsSkirmish && !inSiege && !_onRangedSiegeDuty && unit.stats.isRanged && _hasAmmo &&
                !unit.target.isDummy && unit.target.hp > 0) {
                const _kiteThreshold  = (unit.stats.range || 200) * 0.55;
                const _kiteStopMargin = (unit.stats.range || 200) * 0.12; // extra clearance before a commitment retreat is satisfied
                const _kiteNow = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

                const _alreadyKiting = unit._skirmKiteUntil && _kiteNow < unit._skirmKiteUntil;
                const _shouldStartKiting = dist < _kiteThreshold && dist > 0.1;
                // Once started, stay committed until either real clearance
                // is opened up or the timer runs out — not just one frame
                // back over the starting line.
                const _shouldContinueKiting = _alreadyKiting && dist < (_kiteThreshold + _kiteStopMargin) && dist > 0.1;

                if (_shouldStartKiting || _shouldContinueKiting) {
                    if (!_alreadyKiting) {
                        // Freshly starting a retreat beat — commit for a
                        // short randomized window so a single frame of
                        // wobble right at the threshold can't cancel it
                        // immediately. Mirrors the melee poke-and-run
                        // timing above.
                        unit._skirmKiteUntil = _kiteNow + 300 + Math.random() * 300; // ~0.3–0.6s commitment
                    }
                    let _kx = -dx, _ky = -dy;
                    // WATER-AVOIDANCE (per direct request: "skirmish command
                    // in a ship will always try to not jump to the water if
                    // possible, charge doesn't care"). Straight-back kiting
                    // on a ship deck can walk a unit right off the edge into
                    // open water. Only relevant on naval maps — on land there
                    // is no deck edge to fall off, so this is fully skipped
                    // there. CHARGE is deliberately untouched: it never
                    // routes through this block at all, and no equivalent
                    // check was added to its rangeThreshold override above —
                    // "charge doesn't care" per direct request.
                    if (window.inNavalBattle) {
                        const _retreatMag = Math.hypot(_kx, _ky) || 1;
                        const _stepBack = (_kx / _retreatMag) * 24;
                        const _stepBackY = (_ky / _retreatMag) * 24;
                        if (_isOnAnyDeck(unit.x + _stepBack, unit.y + _stepBackY)) {
                            // Straight retreat stays on deck — use it as-is.
                        } else {
                            // Straight retreat would step into water. Try a
                            // handful of alternate retreat headings (still
                            // net "away from the enemy", just angled) and use
                            // the first one that keeps the unit on deck.
                            // Falls back to the original straight-back vector
                            // (still better than standing still and eating
                            // melee) only if literally every angle tried is
                            // water — e.g. a unit already cornered at the
                            // ship's edge with the enemy blocking the only
                            // dry direction.
                            let _found = false;
                            const _baseAngle = Math.atan2(_ky, _kx);
                            const _angleOffsets = [0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6];
                            for (let _ai = 0; _ai < _angleOffsets.length; _ai++) {
                                const _tryAngle = _baseAngle + _angleOffsets[_ai];
                                const _tx = Math.cos(_tryAngle) * 24;
                                const _ty = Math.sin(_tryAngle) * 24;
                                if (_isOnAnyDeck(unit.x + _tx, unit.y + _ty)) {
                                    _kx = Math.cos(_tryAngle) * _retreatMag;
                                    _ky = Math.sin(_tryAngle) * _retreatMag;
                                    _found = true;
                                    break;
                                }
                            }
                            // if nothing dry was found, _kx/_ky stay as the
                            // original straight-back vector (deliberate
                            // last-resort fallback, see comment above).
                        }
                    }
                    this._handleMovement(unit, _kx, _ky, dist, battleEnv);
                    unit.state = "moving";
                    return;
                } else if (unit._skirmKiteUntil) {
                    // No longer starting or continuing a kite — clear the
                    // stale commitment timer so a later re-entry into range
                    // starts a fresh randomized window rather than
                    // inheriting an old timestamp.
                    unit._skirmKiteUntil = 0;
                }
            }

            // ── AI TACTIC: SKIRMISH POKE-AND-RUN (melee) ────────────────
            // Per direct request: "for the skirmish all melee units once
            // reach 200 pixels or less should almost never try to attack
            // but instead try to poke and run back giving ground, the goal
            // is to get near the enemy and then run away but if gap too
            // large come close again to keep trying to do that with slight
            // randomness." Keeps last turn's isolation targeting completely
            // untouched (battlefield_commands.js still picks WHICH enemy a
            // melee skirmish unit goes after) — this only changes what the
            // unit does once it's near that target: approach normally while
            // far, then once within ~200px cycle poke-forward /
            // retreat-back instead of settling into a stationary melee
            // trade. A small per-unit state machine (_skirmPokeUntil,
            // _skirmPokeMode) avoids flickering every single frame right at
            // the 200px boundary — once a mode is chosen it holds for a
            // short randomized duration before re-evaluating.
            //
            // FIX ("a little too jerky as if its trying to move forward and
            // backwards same time or something or just flickering while
            // retreating"): the original version let 'poke' close the
            // ENTIRE remaining gap every beat (all the way to point-blank,
            // dist≈0) before the timer flipped it to 'retreat' — two
            // problems followed from that. First, at dist≈0 the retreat
            // angle (atan2(-dy,-dx)) becomes numerically unstable: tiny
            // sub-pixel position deltas swing the angle wildly frame to
            // frame, which reads as flickering/vibrating rather than a
            // clean about-face. Second, ramming to point-blank every poke
            // beat left basically no gap for 'retreat' to open before its
            // own timer expired and flipped back to 'poke' again, so the
            // unit visibly looked like it was doing both at once. Fixed
            // with real hysteresis instead of pure time-limiting: 'poke'
            // now stops advancing once it reaches POKE_FLOOR (~55px, close
            // enough to look aggressive without ever reaching dist≈0), and
            // 'retreat' stops retreating once it's opened DIST past
            // POKE_RANGE by RETREAT_MARGIN (~40px clear buffer, not just
            // barely crossing back under 200). Each mode can now also exit
            // EARLY (before its timer) once it's reached its own distance
            // goal, and a mode is only picked when the timer expires AND
            // the current mode has nothing left to accomplish — so a unit
            // that reaches the poke floor early just holds there smoothly
            // (jittering isn't needed once already at the target distance)
            // instead of ping-ponging. Also guards the near-zero-distance
            // case directly: if dist ever drops below a tiny epsilon,
            // treats it as "already at the poke floor" rather than
            // computing a noisy direction from a near-zero vector.
            //
            // Gated on !inSiege for the same reason as the ranged kiting
            // block above (getSiegePathfindingVector overrides steering
            // during a siege) — and per direct request ("during a siege all
            // these ai logic is secondary to operating siege equipment"),
            // also skips a unit currently holding a committed siege role so
            // that work is never interrupted.
            const _wantsMeleeSkirmish = unit.aiTacticGroup === 'skirmish' && !unit.stats.isRanged;
            const _onSiegeDuty = ['ladder_carrier', 'ram_pusher', 'trebuchet_crew'].indexOf(unit.siegeRole) !== -1;
            if (_wantsMeleeSkirmish && !inSiege && !_onSiegeDuty &&
                !unit.target.isDummy && unit.target.hp > 0) {
                const POKE_RANGE     = 200;
                const POKE_FLOOR     = 55;  // how close 'poke' is willing to press in — never point-blank
                const RETREAT_MARGIN = 40;  // how far past POKE_RANGE 'retreat' opens up before it's satisfied
                const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

                if (dist <= POKE_RANGE) {
                    const timerExpired = !unit._skirmPokeUntil || now >= unit._skirmPokeUntil;
                    // A mode is also considered "done" once it's reached its
                    // own distance goal — this is what stops poke/retreat
                    // from overshooting into each other's territory (and
                    // into the dist≈0 instability) even if the randomized
                    // timer hasn't expired yet.
                    const modeSatisfied =
                        (unit._skirmPokeMode === 'poke'    && dist <= POKE_FLOOR) ||
                        (unit._skirmPokeMode === 'retreat' && dist >= POKE_RANGE + RETREAT_MARGIN);

                    if (!unit._skirmPokeMode || timerExpired || modeSatisfied) {
                        // Time to re-roll. Slight randomness per direct
                        // request ("with slight randomness") — both which
                        // mode comes next and how long it holds. Biased
                        // toward whichever direction still has room to move
                        // so it doesn't immediately re-pick a mode that's
                        // already satisfied (e.g. dist already at the poke
                        // floor shouldn't have much chance of rolling
                        // 'poke' again).
                        const canPoke    = dist > POKE_FLOOR + 5;
                        const canRetreat = dist < POKE_RANGE + RETREAT_MARGIN - 5;
                        if (canPoke && canRetreat) {
                            unit._skirmPokeMode = (Math.random() < 0.5) ? 'poke' : 'retreat';
                        } else if (canPoke) {
                            unit._skirmPokeMode = 'poke';
                        } else if (canRetreat) {
                            unit._skirmPokeMode = 'retreat';
                        } else {
                            // Sitting right between both floors with no room
                            // to move either way — hold still this beat
                            // rather than force a direction that would just
                            // immediately re-satisfy and flip again.
                            unit._skirmPokeMode = 'hold';
                        }
                        unit._skirmPokeUntil = now + 350 + Math.random() * 400; // ~0.35–0.75s per beat
                    }

                    if (unit._skirmPokeMode === 'hold' || dist < 1) {
                        // Guards the degenerate near-zero-distance case
                        // directly (see fix comment above) — no direction
                        // computed at all, unit just stands its ground for
                        // this frame rather than risk a noisy atan2 result.
                        unit.vx = 0;
                        unit.vy = 0;
                        updateSpeedRamp(unit, false);
                    } else if (unit._skirmPokeMode === 'retreat') {
                        // "run back giving ground" — small randomized angle
                        // off the direct retreat line so a whole squad of
                        // skirmishers doesn't all back away in perfect
                        // unison.
                        const jitter = (Math.random() - 0.5) * 0.6; // ± ~17°
                        const baseAngle = Math.atan2(-dy, -dx);
                        const ang = baseAngle + jitter;
                        this._handleMovement(unit, Math.cos(ang) * dist, Math.sin(ang) * dist, dist, battleEnv);
                    } else {
                        // "poke" — close toward the target (a real approach,
                        // not a full commit to melee) with the same slight
                        // angular jitter, but only down to POKE_FLOOR — see
                        // fix comment above for why this no longer rams all
                        // the way to point-blank. Even so, this deliberately
                        // does NOT let the unit's state fall through to the
                        // normal attack branch below — "almost never try to
                        // attack" is satisfied by simply never handing
                        // control past this point while poke-and-run is
                        // active. A unit that's already engaged in POKE mode
                        // right at its own attack range will still
                        // occasionally land a hit via the brief window each
                        // cycle where dist naturally closes past the
                        // engine's own melee trigger elsewhere — "almost
                        // never," not "literally never," matching the
                        // wording of the request.
                        const jitter = (Math.random() - 0.5) * 0.4; // tighter jitter than retreat — still basically closing in
                        const baseAngle = Math.atan2(dy, dx);
                        const ang = baseAngle + jitter;
                        this._handleMovement(unit, Math.cos(ang) * dist, Math.sin(ang) * dist, dist, battleEnv);
                    }
                    unit.state = "moving";
                    return;
                } else {
                    // "if gap too large come close again" — outside 200px,
                    // clear any stale poke/retreat state and let normal
                    // seek_engage movement (later in this function) close
                    // the distance like it already does for every other
                    // seek_engage unit; the cycle picks back up naturally
                    // once dist drops back under POKE_RANGE.
                    unit._skirmPokeUntil = 0;
                    unit._skirmPokeMode  = null;
                }
            }

// ---> SURGERY: Prevent crash on loaded saves (Hydration Fix)
if (typeof unit.stats.updateStance === 'function') {
    unit.stats.updateStance(dist);
} else {
    // Fallback logic: if the function was lost during JSON load,
    // we manually determine the stance so the AI doesn't break.
    //
    // AMMO CHECK ADDED — per direct bug report ("almost all units seem
    // to have infinite ammo"). This fallback used to decide stance from
    // DISTANCE ALONE, completely ignoring ammo:
    //     unit.stats.currentStance = (dist < meleeRange) ? "statusmelee" : "statusrange";
    // Every other stance-setter in this codebase (troop_system.js's
    // real updateStance() method, and handlePlayerOverride's own
    // fallback just above in this same file) correctly forces melee
    // once ammo hits 0. This was the one path that didn't. Whenever
    // THIS fallback runs — updateStance isn't a callable function on
    // unit.stats, e.g. for any unit whose stats object isn't a live
    // Troop class instance — a ranged unit sitting outside melee range
    // would get reset to "statusrange" here on literally every single
    // frame, even the instant after _handleCombatExecution had just
    // correctly demoted it to "statusmelee" for having 0 ammo. Since
    // ammo only decrements inside the "statusrange" branch, that
    // per-frame reset let it re-enter and decrement indefinitely below
    // zero — the unit visually never stops firing. Now mirrors the
    // exact ammo-first logic used everywhere else: melee if unarmed-of-
    // ammo OR within melee engagement distance, range otherwise.
    if (!unit.stats.isRanged) {
        unit.stats.currentStance = "statusmelee";
    } else {
        const MELEE_ENGAGEMENT_DISTANCE = 15;
        if ((unit.stats.ammo !== undefined && unit.stats.ammo <= 0) || dist <= MELEE_ENGAGEMENT_DISTANCE) {
            unit.stats.currentStance = "statusmelee";
        } else {
            unit.stats.currentStance = "statusrange";
        }
    }
}

            let effectiveRange = unit.stats.currentStance === "statusmelee" ? 30 : unit.stats.range;

			let isAlreadyAttacking = (unit.state === "attacking" && unit.stats.currentStance === "statusrange");
            let rangeThreshold = isAlreadyAttacking ? (effectiveRange * 0.95) : (effectiveRange * 0.8);

            // ---> SURGERY: HOLD & FOLLOW CAN ENGAGE AT 100% MAXIMUM DEFINED RANGE <---
            if ((unit.orderType === "hold_position" || unit.orderType === "follow") && unit.stats.currentStance === "statusrange") {
                rangeThreshold = effectiveRange;
            }

            // ── AI TACTIC: CHARGE ────────────────────────────────────────
            // melee_charge (CHARGE)-tagged ranged units close aggressively
            // to ~20% of their own weapon range instead of stopping at the
            // normal 80-95% engagement band above — see RTSControls.js's
            // Cmd.setAiTactic doc comment ("Ranged units get an aggressive
            // override... that closes to ~20% of their own range"). Melee/
            // cavalry units already fight aggressively under plain
            // seek_engage (no ranged engagement band applies to them at
            // all), so this only needs to touch isRanged units. Checked
            // after the HOLD/FOLLOW override above so a unit can never be
            // simultaneously tagged both — aiTacticGroup is a single value
            // per unit — and deliberately does not touch effectiveRange
            // itself (melee stance/self-defense radius logic upstream is
            // untouched), only how close the unit is willing to press in
            // before it's satisfied with its position.
            if (unit.aiTacticGroup === 'melee_charge' && unit.stats.isRanged &&
                unit.stats.currentStance === "statusrange") {
                rangeThreshold = effectiveRange * 0.2;
            }

            // FIX ("ranged units... may just charge very close to the enemy
            // instead of at a range reasonable distance... charge have a
            // shortened range distance of half instead of melee distance
            // for RANGE units. melee units continue to charge" — direct
            // request): a plain ADVANCE order (seek_engage, no aiTacticGroup
            // at all) has no dedicated engagement-distance rule of its own —
            // it was falling through to whatever effectiveRange*0.8/0.95
            // computed above, or drifting closer over successive attacking
            // frames via the 0.95 isAlreadyAttacking branch. Ranged units
            // given a bare ADVANCE (no CHARGE/HOLD/FOLLOW/SKIRM tag) now get
            // a hard floor: never press closer than half their own weapon
            // range. Melee units are untouched — effectiveRange for them is
            // already the fixed 30px melee-engagement constant from the
            // stance block above, not a real weapon range, so "half range"
            // has no meaningful equivalent for them and they keep charging
            // exactly as before. CHARGE's existing 20%-of-range override
            // above is a distinct, deliberate tactic and takes priority
            // whenever aiTacticGroup is actually 'melee_charge' — this only
            // fills the previously-unhandled PLAIN-seek_engage-no-tactic
            // case, so tagging a unit CHARGE still closes to 20% as
            // documented, not diluted to 50%.
            if (!unit.aiTacticGroup && unit.orderType === "seek_engage" &&
                unit.stats.isRanged && unit.stats.currentStance === "statusrange") {
                rangeThreshold = Math.min(rangeThreshold, effectiveRange * 0.5);
            }

			if (dist > rangeThreshold && !isRocketLocked) {
                // ── AI TACTIC: HOLD — NEVER CHARGE, NEVER RETREAT ────────
                // FIX ("Hold command need to ignore everything and just form
                // a circle. After circle is formed then attack. Will not
                // charge or retreat" / hold units still visibly closing a
                // few steps toward a melee target): this used to only root
                // a hold_position unit in place when !isMeleeSelfDefense —
                // so a MELEE unit whose target was inside the 70px emergency
                // self-defense radius (battlefield_commands.js's
                // pickSmartCombatTarget aggroLimit for melee) but still
                // beyond its real effectiveRange (30px melee reach) fell
                // into the movement branch below and walked forward to close
                // the gap. That's a small but real "charge" — exactly what a
                // locked Hold unit must never do. A holding unit now always
                // roots in place once it has an order and simply doesn't
                // fight anything outside its real reach — it does not
                // advance to close distance under any circumstance. This
                // does not change WHICH target a melee hold unit acquires
                // (still the existing 70px aggroLimit upstream in
                // battlefield_commands.js — a wide "will engage if it comes
                // close enough" radius is fine and intentional), only
                // whether the unit is allowed to walk toward it while
                // acquired-but-not-yet-in-range.
                if (unit.orderType === "hold_position") {
                    unit.vx = 0;
                    unit.vy = 0;
                    unit.state = "idle";
                } else {
                    // ---> SURGERY: STANDARD MOVEMENT FOR ALL <---
                    this._handleMovement(unit, dx, dy, dist, battleEnv);
                }
			} else if (unit.orderType === "move_to_point" && !isRocketLocked) {
                // FIX: a unit under an active player move order used to fall
                // straight into the "in range, stop and shoot" branch below the
                // instant any enemy came within firing range — the move command
                // was silently dropped and the unit froze to fight instead. That
                // is still correct default behavior with NO explicit order, but
                // a player-issued move_to_point should be honored: keep moving
                // toward the ordered destination instead of stopping dead.
                // (Naval made this especially bad — ships are cramped, so ranged
                // units were almost always "in range" of something and
                // effectively never obeyed a move command at all.)
                this._handleMovement(unit, dx, dy, dist, battleEnv);
            } else {
// EXTREME STOP: For ranged units in range, kill velocity completely so the animation locks cleanly
                if (unit.stats.currentStance === "statusrange") {
                    
                    // ---> SURGERY: ALL ARCHERS STOP DEAD TO SHOOT <---
                    // RANGED_CAV EXCEPTION: horse archers / mounted ranged keep their
                    // velocity so microLightCav's kite orderMove actually executes.
                    // They shoot while moving — that is the entire point of the unit type.
                    // Only zero velocity for grounded ranged units. ROCKET EXCEPTION TO
                    // THE EXCEPTION: isRocketLocked always stops dead even if somehow
                    // also flagged isRangedCav (Rocket isn't cavalry today, but this
                    // keeps the lock airtight if that ever changes) — a firing Rocket
                    // never moves, full stop, no kiting.
                    if (!isRangedCav || isRocketLocked) {
                        unit.vx = 0;
                        unit.vy = 0;
                        // Force state to prevent the engine from jittering the animation if residual velocity exists
                        unit.state = "attacking";
                    }
                    // -----------------------------------------
                    
                }
                this._handleCombatExecution(unit, dx, dy, dist, battleEnv, player);
            }
			
			
            let hasMoved = Math.abs(unit.x - oldX) > 0.1 || Math.abs(unit.y - oldY) > 0.1;
            if (hasMoved) {
                unit.state = "moving";
            } else if (unit.state !== "attacking") {
                unit.state = "idle";
            }
        } else {
            if (!unit.isCommander) unit.state = "idle";
            if (unit.stats.stamina < 100 && Math.random() > 0.9) unit.stats.stamina++;
        }
		
		
// --- MOUNT & INFANTRY AUDIO ---
        const nameStrCheck = String(unit.unitType).toLowerCase();
        const isCannon = unit.stats && unit.stats.role === (typeof ROLES !== 'undefined' ? ROLES.MOUNTED_GUNNER : "mounted_gunner"); // FIX: was nameStrCheck.includes("camel cannon") — that "unchanged internal id" premise stopped holding the moment the roster key became "Cannon", so this silently went false, isAnimal fell through to true via unit.stats.isLarge, and the Cannon started playing horse gallop/idle mount sounds. Role-driven now (unique to this unit), matching every other fix in this codebase from the same rename.
        const isAnimal = !isCannon && (unit.stats?.isLarge || unit.isMounted || nameStrCheck.match(/(cav|horse|camel|eleph)/));
        
        if (isAnimal && unit.state !== "FLEEING") {
            let mType = "horse";
            let nameStr = nameStrCheck;
            if (nameStr.includes("elephant")) mType = "elephant";
            else if (nameStr.includes("camel")) mType = "camel";

            if (unit.state === "idle") {
                BattleAudio.playMountIdle(unit.x, unit.y, mType);
            } else if (unit.state === "moving" && mType === "horse") {
                // Throttle handles the spam, just pass the requested speed
                let currentSpeed = Math.hypot(unit.vx || 0, unit.vy || 0);
                let speedType = (currentSpeed > 1.2) ? "gallop" : "trot";
                BattleAudio.playMountMove(unit.x, unit.y, speedType);
            }
        } else if (!isAnimal && unit.state === "moving") {
            // INFANTRY FOOTSTEPS ONLY (No idle sounds)
            let wTier = unit.stats?.weightTier || 1; // Default to light infantry if undefined
            BattleAudio.playFootmarch(unit.x, unit.y, wTier);
        }
		
    },

    // --- INTERNAL HELPER FUNCTIONS ---

    _handleBrokenFleeing: function(unit, currentBattleData) {
        unit.state = "FLEEING";
        let inSiege = typeof inSiegeBattle !== 'undefined' && inSiegeBattle;

        if (!unit.escapePoint || unit.escapeType !== "OUTER") {
            unit.escapeType = "OUTER";
            unit.fleeTimer = 0;

            if (inSiege && unit.side === "enemy") {
                // SIEGE DEFENDERS flee NORTH — deeper into the city away from the
                // attackers.  Y = -500 is well off the top of the map so the unit
                // runs until it exits the battlefield and is marked "retreated".
                // Scatter X so the whole defending army doesn't pile onto one pixel.
                let _mw = typeof BATTLE_WORLD_WIDTH !== 'undefined' ? BATTLE_WORLD_WIDTH : 2400;
                let _scatterX = unit.x + (Math.random() - 0.5) * 500;
                _scatterX = Math.max(80, Math.min(_mw - 80, _scatterX));
                unit.escapePoint = { x: _scatterX, y: -500 };
            } else {
                let distToLeft = unit.x;
                let distToRight = BATTLE_WORLD_WIDTH - unit.x;
                let distToTop = unit.y;
                let distToBottom = BATTLE_WORLD_HEIGHT - unit.y;
                let minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
                let padding = -2000;

                if (minDist === distToLeft) unit.escapePoint = { x: padding, y: unit.y };
                else if (minDist === distToRight) unit.escapePoint = { x: BATTLE_WORLD_WIDTH - padding, y: unit.y };
                else if (minDist === distToTop) unit.escapePoint = { x: unit.x, y: padding };
                else unit.escapePoint = { x: unit.x, y: BATTLE_WORLD_HEIGHT - padding };
            }
        }

// Check if we are in a siege and the unit is a defender (enemy)
if (inSiege && unit.side === "enemy" && typeof battleEnvironment !== 'undefined' && battleEnvironment.cityGates) {
    
    // Find the North Gate
    const northGate = battleEnvironment.cityGates.find(g => g.side === "north");

    // Only proceed if the gate exists, is currently CLOSED, and has valid hitboxes
    if (northGate && !northGate.isOpen && northGate.pixelRect) {
        
        // Calculate center once using the pixelRect
        const gateCenterX = northGate.pixelRect.x + (northGate.pixelRect.w / 2);
        const gateCenterY = northGate.pixelRect.y + (northGate.pixelRect.h / 2);
        
        // Use squared distance for better performance (avoids Math.sqrt/hypot every frame)
        const distSq = Math.pow(unit.x - gateCenterX, 2) + Math.pow(unit.y - gateCenterY, 2);

        if (distSq < 10000) { // 100 * 100 = 10000
            // 1. Flip the state immediately to prevent other units from re-triggering this loop
            northGate.isOpen = true; 
            northGate.hp = 0; // Ensure it's treated as "destroyed" by targeting AI

            // 2. Update the Pathfinding Grid
            const bounds = northGate.bounds;
            if (bounds && battleEnvironment.grid) {
                for (let x = bounds.x0; x <= bounds.x1; x++) {
                    // Check if column exists
                    if (!battleEnvironment.grid[x]) continue;

                    for (let y = bounds.y0; y <= bounds.y1; y++) {
                        // Keep the pillars solid, but make the gate pathable (1)
                        const isPillar = (x === bounds.x0 || x === bounds.x1);
                        if (!isPillar) {
                            battleEnvironment.grid[x][y] = 1; 
                        }
                    }
                }
            }

            console.log("Defenders have thrown open the North Gate to escape!");
            
            // 3. Audio/Visual feedback (Optional)
            if (typeof playSound === 'function') playSound("gate_creak");
        }
    }
}
        let dx = unit.escapePoint.x - unit.x;
        let dy = unit.escapePoint.y - unit.y;
        let dist = Math.hypot(dx, dy);

        if (dist > 8) {
            unit.x += (dx / dist + (Math.random() - 0.5) * 0.3) * (unit.stats.speed * 2.5);
            unit.y += (dy / dist + (Math.random() - 0.5) * 0.3) * (unit.stats.speed * 2.5);
        }

        let isOutsideBorder = unit.x < 0 || unit.x > BATTLE_WORLD_WIDTH || unit.y < 0 || unit.y > BATTLE_WORLD_HEIGHT;
        if (isOutsideBorder) {
            unit.fleeTimer = (unit.fleeTimer || 0) + 1;
            if (unit.fleeTimer >= 300) {
                unit.state = "retreated";
                unit.removeFromBattle = true;
                unit.target = null;
                unit.cooldown = 0;

                let sideTotal = currentBattleData.initialCounts[unit.side] || 0;
                let scale = sideTotal > 300 ? 5 : 1;
                currentBattleData.fledCounts[unit.side] += scale;
            }
        }
    },

    _handleWavering: function(unit) {
        unit.state = "WAVERING";
        let _inSiege = typeof inSiegeBattle !== 'undefined' && inSiegeBattle;

        if (!unit.escapePoint || unit.escapeType !== "INNER") {
            // SIEGE DEFENDER OVERRIDE: wavering defenders scatter NORTH —
            // away from the attackers at the wall.  A small random X spread
            // keeps them from all running to the exact same pixel.
            if (_inSiege && unit.side === "enemy") {
                let _mw = typeof BATTLE_WORLD_WIDTH !== 'undefined' ? BATTLE_WORLD_WIDTH : 2400;
                let _scatterX = unit.x + (Math.random() - 0.5) * 300;
                _scatterX = Math.max(40, Math.min(_mw - 40, _scatterX));
                unit.escapePoint = { x: _scatterX, y: 20 };
            } else {
                let distToLeft = unit.x;
                let distToRight = BATTLE_WORLD_WIDTH - unit.x;
                let distToTop = unit.y;
                let distToBottom = BATTLE_WORLD_HEIGHT - unit.y;
                let minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
                let p = 20;

                if (minDist === distToLeft) unit.escapePoint = { x: p, y: unit.y };
                else if (minDist === distToRight) unit.escapePoint = { x: BATTLE_WORLD_WIDTH - p, y: unit.y };
                else if (minDist === distToTop) unit.escapePoint = { x: unit.x, y: p };
                else unit.escapePoint = { x: unit.x, y: BATTLE_WORLD_HEIGHT - p };
            }

            unit.escapeType = "INNER";
        }

        let dx = unit.escapePoint.x - unit.x;
        let dy = unit.escapePoint.y - unit.y;
        let dist = Math.hypot(dx, dy);

        if (dist > 8) {
            unit.x += (dx / dist) * (unit.stats.speed * 1.5);
            unit.y += (dy / dist) * (unit.stats.speed * 1.5);
        } else {
            unit.state = "idle";
        }
    },
    
_handleMovement: function(unit, dx, dy, dist, battleEnv) {
        if (unit.isCommander) return;
        // If distance is microscopically small, halt movement to prevent NaN math corruption
        if (dist < 0.1) {
            unit.vx = 0;
            unit.vy = 0;
            updateSpeedRamp(unit, false); // stopped — begin decelerating the ramp too
            return;
        }

        // Advance the mounted-unit acceleration ramp once per call. Every
        // early-return branch below (climbing, settling, shouldHold, etc.)
        // either wants full commitment (climbing/settling — ramp toward 1)
        // or is explicitly stationary (shouldHold — ramp toward 0). This
        // call defaults to "wants to move" since reaching this point means
        // the unit has a real dx/dy toward a target; branches that actually
        // hold still re-call updateSpeedRamp(unit, false) themselves below.
        updateSpeedRamp(unit, true);
		
		
        let shouldHold = false;
        let inSiege = typeof inSiegeBattle !== 'undefined' && inSiegeBattle;
        let speedMod = 1.0;
        let isLargeUnit = unit.stats?.isLarge || unit.isMounted || (unit.unitType && unit.unitType.toLowerCase().includes("cav"));

// AFTER — catches ALL climbing units regardless of siege role:
if (unit.isClimbing) {
	
	// ============================================================================
// 1. LADDER SUPER-GLUE (Prevent Sideways Pushing)
// ============================================================================
if (unit.isClimbing && unit.targetLadder) {
    // 1. Force the unit's X coordinate to perfectly match the ladder's center X
    const _ldrHalfW = (unit.targetLadder.width != null) ? unit.targetLadder.width / 2 : (typeof BATTLE_TILE_SIZE !== 'undefined' ? BATTLE_TILE_SIZE / 2 : 8);
    unit.x = Math.max(unit.targetLadder.x - _ldrHalfW, Math.min(unit.targetLadder.x + _ldrHalfW, unit.x));
	
    
    // 2. Kill any horizontal velocity so physics don't fight the lock
    if (unit.vx !== undefined) {
        unit.vx = 0; 
    }
    
    // 3. Temporarily make them ignore being pushed by other units
    // (Depending on your engine, you might need to set a flag here)
    unit.ignoreSeparation = true; 
} else {
    // Turn normal bumping back on when they finish climbing
    unit.ignoreSeparation = false; 
}
        
        // 1. Calculate the Centroid of the current ladder tile
        // This ensures they are perfectly aligned with the gap in the wall
        if (typeof BATTLE_TILE_SIZE !== 'undefined') {
            let tx = Math.floor(unit.x / BATTLE_TILE_SIZE);
            let ladderCenterX = (tx * BATTLE_TILE_SIZE) + (BATTLE_TILE_SIZE / 2);
            
            // Physical Snap: Force X to the center of the rail
            unit.x = ladderCenterX;
        }

        // 2. Kill all horizontal velocity
        unit.vx = 0; 
        
        // 3. Force strictly upward momentum (Negative Y)
        // We use Math.abs to ensure no "falling" logic can override this
        let baseSpeed = unit.stats?.speed || 1;
        unit.vy = -Math.abs(baseSpeed * 1.4); 

        // 3a. THE ACTUAL CLIMB (this was missing entirely — see BUGFIX note
        // below). Resolve the landing Y first so it's available both for the
        // clamp and the exit check.
        //
        // SURGERY (post-climb settle): instead of handing full-speed
        // seek_engage immediately on landing, first drift a further
        // 100-200px north at half speed (settleTargetY / settling flag
        // below). This clears the unit off the crowded ladder-top tile
        // before it starts fighting, and matches the requested behavior —
        // climb, settle north a bit slower, then fight at normal speed.
        // The settle phase is consumed in the "SETTLE PHASE" block further
        // down this function (right before the normal movement resolves).
        let _climbTargetY = (unit.climbTargetY != null) ? unit.climbTargetY
            : (typeof SiegeTopography !== 'undefined' ? SiegeTopography.wallPixelY - 20 : unit.y - 20);

        // BUGFIX (THE ACTUAL "STUCK ON LADDER" BUG): every tick above computed
        // unit.vy but nothing ever added it to unit.y — this whole branch
        // hard-returns at the bottom before reaching any shared movement-
        // integration code, so a climbing unit's position never moved at all.
        // isClimbing latched true forever, unit.y stayed pinned at its climb-
        // entry height, and the unit just stood there indefinitely — the
        // "invisible wall on the ladder" the rest of the codebase has been
        // patching around (applyStuckExtractor's exclusion, the STUCK
        // PREVENTION ladder branch, etc.) instead of fixing directly. This is
        // that fix: actually advance the climb, every tick, strictly upward.
        // No collision check on purpose — collisions are fully off for the
        // whole ascent (this branch never calls isBattleCollision), and no
        // other system can pull them back south: applyWallGravity excludes
        // isClimbing outright, applyUnitCollisions `continue`s climbing units
        // out of the push-resolution loop entirely, and vy is unconditionally
        // negative (Math.abs above) so there is no code path left that can
        // move a climbing unit south. Clamped to _climbTargetY so a fast tick
        // can never overshoot past the landing spot.
        unit.y = Math.max(_climbTargetY, unit.y + unit.vy);

        if (unit.y <= _climbTargetY) {
            unit.y            = _climbTargetY;
            unit.isClimbing   = false;
            unit.onWall       = true;
            unit.vy           = 0;
            unit.ignoreSeparation = false;
            unit.hasOrders    = true;
            unit.settling     = true; // consumed below: drift north, then release
            unit.settleTargetY = unit.y - (100 + Math.random() * 100); // 100-200px further north
            // NOTE: deliberately NOT "hold_position" — that orderType triggers
            // active combat-aggro targeting elsewhere (battlefield_commands.js,
            // ~line 1321), which would make a settling unit start fighting
            // mid-drift instead of just walking north. "settling_post_climb" is
            // a placeholder no other code path checks; processTargeting picks a
            // real order once settle completes below.
            unit.orderType    = "settling_post_climb";
            unit.target       = null; // let processTargeting acquire a real target once settled
        }

        // 4. Hard Block: Prevent any other movement logic from running
        return;
	}

        // ============================================================================
        // POST-CLIMB SETTLE PHASE
        // ============================================================================
        // Consumes unit.settling, set by the climb-exit block above. Drives the unit
        // straight north (never south, never sideways beyond a tiny visual shake) at
        // half speed until it clears unit.settleTargetY, then hands off to real
        // seek_engage at normal speed. Placed here — immediately after the isClimbing
        // block closes, BEFORE the tile-detection block below — so tile-based
        // onWall/isClimbing flips (e.g. drifting onto a ground tile as the unit walks
        // further into the city) can never interfere with a settling unit mid-tick.
        // The hard return guarantees nothing past this point runs for a settling unit.
        if (unit.settling) {
            let baseSpeed = unit.stats?.speed || 1;
            if (unit.y > unit.settleTargetY) {
                unit.vx = (Math.random() - 0.5) * 0.3; // tiny cosmetic side-shake only
                unit.vy = -Math.abs(baseSpeed * 0.5);   // strictly north, half speed
                unit.x += unit.vx;
                unit.y += unit.vy;
            } else {
                // Settle complete — release to real siege AI at full speed.
                //
                // BUGFIX (post-climb dead-end): this used to hand off
                // orderType "seek_engage" directly, which just fights
                // whatever's nearest forever. That skips the "WALL-CLIMB ->
                // GATE RUSH" logic in processTacticalOrders
                // (battlefield_commands.js) entirely — the code that makes an
                // onWall unit walk to the gate and force it open if it's
                // still shut, or funnel through and push into the plaza once
                // it's breached — because that logic only runs for
                // orderType "siege_assault". And because autoAttack.js's
                // needsAssignment filter (correctly) excludes any onWall unit
                // from ever being re-categorized, nothing downstream would
                // ever correct the orderType later either — a landed climber
                // was permanently stuck in plain seek_engage. Handing off
                // "siege_assault" here instead — with onWall already true and
                // siegeRole left as whatever it was (ladder_carrier, etc.,
                // which that logic doesn't key on for onWall units) — lets it
                // fall straight into the real gate-rush/plaza-rush behavior
                // on the very next tick.
                unit.y         = unit.settleTargetY;
                unit.settling  = false;
                unit.vx        = 0;
                unit.vy        = 0;
                unit.hasOrders = true;
                unit.orderType = "siege_assault";
                unit.target    = null; // let processTacticalOrders acquire a real target/waypoint
            }
            return;
        }

        // --- 1. LADDER TRANSITION STATE CHECK ---
        let isOnLadderTile = false;
        if (inSiege && unit.side === "player" && canUseSiegeEngines(unit) && battleEnv.grid && typeof BATTLE_TILE_SIZE !== 'undefined') {
            let tx = Math.floor(unit.x / BATTLE_TILE_SIZE);
            let ty = Math.floor(unit.y / BATTLE_TILE_SIZE);
            let currentTile = (battleEnv.grid[tx] && battleEnv.grid[tx][ty] !== undefined) ? battleEnv.grid[tx][ty] : 0;

            if (currentTile === 9) {
                isOnLadderTile = true;
                // REAL CLIMB ENTRY (replaces the old instant teleport-to-wall-top
                // "pop"). That pop skipped the climb animation entirely and left
                // units standing on the wall with no real order, which is why
                // they'd get knocked/walked back down by other systems (wall
                // clamps, collision, re-targeting) a moment later — the unit
                // never actually passed through a protected "climbing" state.
                // Now touching the ladder base just starts a genuine multi-frame
                // ascent via the isClimbing branch above, which locks the unit
                // to the ladder rail and drives it straight up. See the matching
                // exit condition inside that branch for how climbing ends.
                // Infantry only — never cavalry/large units. isBattleCollision
                // already denies large units the tile-9 square in the first
                // place (battlefield_logic.js), so in practice a mounted unit
                // can't physically be standing here — but that's an indirect,
                // cross-file guarantee. Checking isLargeUnit explicitly here
                // too means this entry condition is correct on its own, in
                // this file, without depending on a rule enforced elsewhere.
                if (!unit.onWall && !unit.isClimbing && !isLargeUnit && unit.side === "player") {
                    unit.isClimbing  = true;
                    unit.targetLadder = unit.targetLadder || unit.target || { x: unit.x };
                    let wallY = typeof SiegeTopography !== 'undefined' ? SiegeTopography.wallPixelY : (unit.y - 160);
                    unit.climbTargetY = wallY - 20; // matches the old landing-pad Y
                }
            }
            // ---> SURGERY: Safeguard 'onWall' stripping <---
            else if (currentTile === 1 || currentTile === 5 || currentTile === 0) {
                // ONLY strip 'onWall' if they are clearly SOUTH of the wall. 
                // If they are physically north of the boundary, let them stay on the wall.
                if (!(inSiege && unit.y <= SiegeTopography.wallPixelY)) {
                    unit.onWall = false; 
                }
            }
else if (currentTile === 8 || currentTile === 10) unit.onWall = true;  
            
            if (currentTile === 4) speedMod = 0.4; 
            if (currentTile === 7) speedMod = 0.6; 
        }

        // === DEFENDER WALL DETECTION (mirrors the attacker block above for enemy units) ===
        if (inSiege && unit.side === "enemy" && battleEnv.grid && typeof BATTLE_TILE_SIZE !== 'undefined') {
            let defTx = Math.floor(unit.x / BATTLE_TILE_SIZE);
            let defTy = Math.floor(unit.y / BATTLE_TILE_SIZE);
            let defTile = (battleEnv.grid[defTx] && battleEnv.grid[defTx][defTy] !== undefined) ? battleEnv.grid[defTx][defTy] : 0;
            if (defTile === 8 || defTile === 10) {
                unit.onWall = true;
            } else if (defTile === 0 || defTile === 1 || defTile === 5) {
                unit.onWall = false;
            }
        }

		if (unit.side === "player" && !unit.hasOrders) {
			
			
	    // =========================================================
        // NAVAL AI OVERRIDE (Hold Ship Position / Avoid Water)
        // =========================================================
        if (typeof inNavalBattle !== 'undefined' && inNavalBattle) {
            let isRanged = unit.stats.isRanged;
            // Cavalry & Commanders are completely paralyzed so they don't drown
            let isCavalry = isLargeUnit || unit.isCommander || String(unit.unitType).toLowerCase().includes("cav");
            
            if (isCavalry) {
                shouldHold = true;
                unit.vx = 0; unit.vy = 0;
            } else if (isRanged) {
                // Ranged units hold firm unless explicitly commanded, avoiding the plank gap
                if (dist > 30 && !unit.hasOrders) {
                    shouldHold = true;
                    unit.vx = 0; unit.vy = 0;
                }
            } else {
                // Melee units hold the choke point near the planks. 
                // They will only pursue if an enemy gets extremely close (150px)
                if (dist > 150 && !unit.hasOrders) {
                    shouldHold = true;
                    unit.vx = 0; unit.vy = 0;
                }
            }
        }
        // =========================================================
		// Land battles  (unit.side === "player" && !unit.hasOrders) 
		// =========================================================
				
            // Allow archers to move to their auto-assigned positions near the wall
            if (unit.stats.isRanged) {
                // Only hold if they are already close to their waypoint
                if (dist < 20) shouldHold = true; 
            }
            else if (dist > 50) shouldHold = true; 
        }

        // =========================================================
        // NAVAL AI OVERRIDE - ENEMY TROOPS
        // Enemy units hold on their ship until player ship is within 200px,
        // then they attack. Swimming units are never frozen.
        // =========================================================
        if (typeof inNavalBattle !== 'undefined' && inNavalBattle &&
            unit.side === 'enemy' && !unit.isCommander) {

            // Find nearest player unit and player ship
            var _nearestPlayer = null, _nearestPlayerDist = Infinity;
            if (typeof battleEnvironment !== 'undefined' && battleEnvironment.units) {
                battleEnvironment.units.forEach(function(pu) {
                    if (pu.side !== 'player' || pu.hp <= 0) return;
                    var _pd = Math.hypot(unit.x - pu.x, unit.y - pu.y);
                    if (_pd < _nearestPlayerDist) { _nearestPlayerDist = _pd; _nearestPlayer = pu; }
                });
            }
            var _playerShipDist = Infinity;
            if (typeof navalEnvironment !== 'undefined' && navalEnvironment.ships) {
                var _pShipObj = navalEnvironment.ships.find(function(s) { return s.side === 'player'; });
                if (_pShipObj) _playerShipDist = Math.hypot(unit.x - _pShipObj.x, unit.y - _pShipObj.y);
            }
            var _threatDist = Math.min(_nearestPlayerDist, _playerShipDist);
            var _isSwimming = unit.isSwimming || false;
            var _isCav = isLargeUnit || String(unit.unitType || '').toLowerCase().includes('cav');
            var _navalAggroRange = (window.NAVAL_AI_SETTINGS ? window.NAVAL_AI_SETTINGS.troopAggroRange : 200);

            if (_isSwimming) {
                // Swimming: unfreeze and seek nearest player
                shouldHold = false;
                if (_nearestPlayer) { unit.target = _nearestPlayer; unit.orderType = 'seek_engage'; }

            } else if (_threatDist <= _navalAggroRange) {
                // AGGRO: player ship/unit within aggro range - wake up and attack!
                // BUGFIX: cavalry previously had its own unconditional freeze branch
                // ABOVE this check ("paralysed to prevent drowning"), so it could
                // never reach this aggro-range unfreeze at all — melee cavalry would
                // stand frozen through an entire boarding action no matter how close
                // the player got. Cavalry now shares the exact same aggro-range gate
                // infantry already used correctly; it only differs in WHERE it holds
                // (see the "else" hold branch below) so it still doesn't wander into
                // the water and drown while waiting.
                // Range is configurable via window.NAVAL_AI_SETTINGS.troopAggroRange (default 200px).
                shouldHold = false;
                if (_nearestPlayer) {
                    unit.target = _nearestPlayer;
                    unit.orderType = 'seek_engage';
                    unit.hasOrders = true;
                }

            } else if (_isCav) {
                // Cavalry out of aggro range: paralysed in place to prevent drowning.
                // (Previously this was checked FIRST and unconditionally, before the
                // aggro-range branch above ever got a chance to run for cavalry.)
                shouldHold = true; unit.vx = 0; unit.vy = 0;

            } else {
                // Out of aggro range: hold position on deck
                var _surf = typeof window.getNavalSurfaceAt === 'function'
                    ? window.getNavalSurfaceAt(unit.x, unit.y) : 'DECK';
                if (_surf === 'DECK' || _surf === 'PLANK') {
                    shouldHold = true; unit.vx = 0; unit.vy = 0;
                }
            }
        }

			// =========================================================
			// SIEGE MOVEMENT & ANTI-STUCK OVERHAUL
			// =========================================================
			if (inSiege) {

						// ---> SURGERY: DETECT CLIMBING TILE <---
						let tx = Math.floor(unit.x / BATTLE_TILE_SIZE);
						let ty = Math.floor(unit.y / BATTLE_TILE_SIZE);
						let currentTile = (battleEnvironment.grid[tx] && battleEnvironment.grid[tx][ty]) ? battleEnvironment.grid[tx][ty] : 0;
						isOnLadderTile = (currentTile === 9 || currentTile === 12);
						
						// Determine if unit is cavalry/large
					  
					  // If they are on the wall, their target is on the ground, and they are out of range, STOP moving.
			if (unit.onWall && unit.target && !unit.target.onWall && !unit.target.isDummy) {
				let effRange = unit.stats.currentStance === "statusmelee" ? 30 : unit.stats.range;
				if (dist > effRange * 0.8) {
					
					// SURGERY: Only DEFENDERS should hold the wall. Attackers must push inward!
					if (unit.side === "enemy") { 
						shouldHold = true;
						unit.vx = 0; 
						unit.vy = 0;
					}
				}
			}
            // Anti-Stuck Tracking: Monitors physical coordinate changes over time
            if (!unit.stuckLog) unit.stuckLog = { x: unit.x, y: unit.y, ticks: 0 };
            
            let distMovedInLog = Math.hypot(unit.x - unit.stuckLog.x, unit.y - unit.stuckLog.y);
            if (distMovedInLog < 1.0) {
                unit.stuckLog.ticks++;
            } else {
                unit.stuckLog.x = unit.x;
                unit.stuckLog.y = unit.y;
                unit.stuckLog.ticks = 0;
            }

// DEFENDER COHESION
if (unit.side === "enemy") {
    // Now sourced from the single canonical isSiegeGateBreached() helper —
    // this used to only check `!southGate || southGate.isOpen`, missing the
    // gateHP<=0 and global-flag cases other systems already checked, which
    // could leave this specific movement behavior disagreeing with
    // processTargeting about whether the gate was actually down.
    let isGateBreached = isSiegeGateBreached();
    
    if (!isGateBreached) {
        // Pre-Breach: Form an organized shield wall. 
        // We removed the Math.random() jitter here. They now smoothly march to the coordinates assigned in targeting!
        if (unit.target && unit.target.isDummy) {
            dx = unit.target.x - unit.x;
            dy = unit.target.y - unit.y;
            dist = Math.hypot(dx, dy);
        }

        if (dist < 30) shouldHold = true; 

        let isMelee = !unit.stats.isRanged;
        // Defend the line - hold formation
        if (isMelee && !unit.onWall && dist < 40) {
            shouldHold = true;
            unit.vx = 0; 
            unit.vy = 0;
        }

    } else {
                    // Post-Breach Fallback
                    if (!unit.breachTimestamp) unit.breachTimestamp = Date.now();
                    if (Date.now() - unit.breachTimestamp < 10000) speedMod *= 1.30; 

                    let plazaX = typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelX : BATTLE_WORLD_WIDTH / 2;
                    let plazaY = typeof SiegeTopography !== 'undefined' ? SiegeTopography.plazaPixelY : BATTLE_WORLD_HEIGHT / 2;
                    let distToPlaza = Math.hypot(plazaX - unit.x, plazaY - unit.y);

                    if (distToPlaza > 200) {
                        shouldHold = false;
                        if (unit.onWall && !isOnLadderTile && typeof cityLadders !== 'undefined' && cityLadders.length > 0) {
                            let closestLadder = cityLadders.reduce((prev, curr) => Math.hypot(curr.x - unit.x, curr.y - unit.y) < Math.hypot(prev.x - unit.x, prev.y - unit.y) ? curr : prev);
                            dx = closestLadder.x - unit.x;
                            dy = closestLadder.y - unit.y;
                            dist = Math.hypot(dx, dy);
                        } 
                    } else {
                        // Organized Stand at Plaza
                        if (unit.target && unit.target.priority === "plaza") shouldHold = true; 
                    }
                }
            }
        }
        // =========================================================

        if (shouldHold) {
            unit.state = "idle";
            updateSpeedRamp(unit, false); // holding position — wind the ramp down
            if (unit.stats.stamina < 100 && Math.random() > 0.9) unit.stats.stamina++;
        } else {
            if (Math.random() > 0.9) unit.stats.stamina = Math.max(0, unit.stats.stamina - 1);
            
            let moveVector = { dx: dx, dy: dy, dist: dist };
            if (inSiege && typeof getSiegePathfindingVector === 'function') {
                moveVector = getSiegePathfindingVector(unit, unit.target, dx, dy, dist);
            }

// ... (Inside _handleMovement, below the moveVector calculation) ...
            
            // Calculate base velocity — mounted units ramp up via
            // getRampedSpeed() (see updateSpeedRamp above); infantry get
            // unit.stats.speed back unmodified, so this line is a no-op
            // change for them.
            let vx = (moveVector.dx / moveVector.dist) * (getRampedSpeed(unit) * speedMod);
            let vy = (moveVector.dy / moveVector.dist) * (getRampedSpeed(unit) * speedMod);

            // ---> SURGERY: LADDER PHYSICS ENGINE <---
            if (isOnLadderTile) {
                if (isLargeUnit) {
                    vx = 0; vy = 0; unit.vx = 0; unit.vy = 0;
                } else {
                    vx = 0; 
                    vy *= 0.30;
                }
            }

            if (unit.stats.morale > 3 && unit.stats.morale < 10) {
                // SURGERY: drift toward this side's own assigned rear
                // direction (was hardcoded: player drifts toward larger Y,
                // enemy toward smaller Y). Falls back to the old fixed
                // behavior if the spawn assignment isn't available.
                const _geo = window.battleSpawnAssignment && window.battleSpawnAssignment[unit.side];
                if (_geo) {
                    const retreatedDist = (unit.x - _geo.ax) * _geo.rear.x + (unit.y - _geo.ay) * _geo.rear.y;
                    const notAtEdge = retreatedDist < 0; // hasn't reached its own spawn line yet

                    if (notAtEdge) {
                        const speed = unit.stats.speed * speedMod * 0.5;
                        const _jitter = (Math.random() - 0.5);
                        vx = _geo.rear.x * speed + _geo.across.x * _jitter;
                        vy = _geo.rear.y * speed + _geo.across.y * _jitter;
                    } else {
                        vx = 0; vy = 0;
                    }
                } else {
                    let dir = unit.side === "player" ? 1 : -1;
                    let safeEdge = unit.side === "player" ? BATTLE_WORLD_HEIGHT - 100 : 100;
                    let notAtEdge = unit.side === "player" ? unit.y < safeEdge : unit.y > safeEdge;

                    if (notAtEdge) {
                        vy = (unit.stats.speed * speedMod * 0.5) * dir;
                        vx = (Math.random() - 0.5);
                    } else {
                        vx = 0; vy = 0;
                    }
                }
            }

// --- EXTREME RANDOMNESS FOR ATTACKERS NEAR THE GATE ---
// BUGFIX ("ladder climbers get yanked ~400px south on approach"): this
// block used to fire for ANY player unit within 50px of the gate,
// including units queued at (or walking to) a ladder that happens to sit
// near the gate. Once triggered it re-rolls a fresh chaotic vx/vy addition
// of up to +/-(speed * 4.5) on EVERY tick the condition holds — not a
// one-time nudge — which is large enough to overpower the small legitimate
// ladder-approach vector for several ticks in a row and read as "sprinting
// away, then wandering back." Ladder-context units (assigned to a ladder,
// actively climbing, already on the wall, or standing on the ladder tile
// itself) are now excluded outright — per the standing rule elsewhere in
// this function, nothing is allowed to push a ladder unit south. This is a
// last-resort unstick for units that are NOT part of the ladder pipeline
// (e.g. milling around the open gate post-breach); those already have
// their own dedicated, forward-only unstick handling in the STUCK
// PREVENTION OVERHAUL block right below.
if (inSiege && unit.side === "player" &&
    !unit.isClimbing && !unit.onWall && !isOnLadderTile &&
    !(unit.siegeRole && unit.siegeRole.includes('ladder'))) {
    let southGate = typeof battleEnvironment !== 'undefined' && battleEnvironment.cityGates ? battleEnvironment.cityGates.find(g => g.side === "south") : null;
    let gateX = southGate && southGate.pixelRect ? southGate.pixelRect.x + (southGate.pixelRect.w / 2) : (typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelX : BATTLE_WORLD_WIDTH / 2);
    let gateY = southGate && southGate.pixelRect ? southGate.pixelRect.y + (southGate.pixelRect.h / 2) : (typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelY : BATTLE_WORLD_HEIGHT / 2);
    
    let distToGate = Math.hypot(unit.x - gateX, unit.y - gateY);

    // FIX: Only trigger the "Panic Shuffle" if the unit hasn't moved for at least 1 second (60 ticks)
    if (distToGate < 50 && unit.stuckLog && unit.stuckLog.ticks > 160) {
        // Massive, chaotic movement around the breach as a last resort
        let panicKickX = (Math.random() - 0.5) * (unit.stats.speed * 4.5);
        let panicKickY = (Math.random() - 0.5) * (unit.stats.speed * 4.5);

        // SURGERY (pillar tunneling): isBattleCollision only samples the
        // destination point each tick, not the swept path between old and
        // new position. An uncapped kick here can be several times an 8px
        // tile's width in a single tick — for infantry that's harmless
        // (nothing that thin needs protecting), but for a large unit stuck
        // right up against a still-solid broken-gate pillar, it's exactly
        // enough to land the unit clean on the far side of that pillar in
        // one frame, reading as walking straight through solid stone. Cap
        // large units' kick well under any solid tile's width so this
        // still unsticks a genuine crowd-jam without ever being able to
        // clip through collision geometry.
        if (isLargeUnit) {
            const MAX_LARGE_PANIC_KICK = 3; // px/tick
            panicKickX = Math.max(-MAX_LARGE_PANIC_KICK, Math.min(MAX_LARGE_PANIC_KICK, panicKickX));
            panicKickY = Math.max(-MAX_LARGE_PANIC_KICK, Math.min(MAX_LARGE_PANIC_KICK, panicKickY));
        }

        vx += panicKickX;
        vy += panicKickY;
    }
}

// --- STUCK PREVENTION OVERHAUL (STRICTER & CALIBRATED) ---
            if (inSiege && unit.stuckLog) {
                
                // 1. LADDER SPECIFIC UNSTICK FALLBACK
                // Added !unit.unstickCooldown to ensure we don't trigger while already recovering
                //
                // SURGERY (per request: ladder units must never be sent south): the old
                // Phase 1 here stripped isClimbing/onWall and slid the unit ~24-120px
                // south, ejecting it from the climb pipeline entirely — that's the
                // exact "jump off ladder" behavior being removed. Replaced with a
                // forward-push: nudge the unit toward the ladder's X center and give
                // it a brief northward nudge toward the wall, without touching
                // isClimbing/onWall/climbTargetY at all. A unit mid-climb (isClimbing
                // true) never reaches this branch anyway — _handleMovement hard-returns
                // before here whenever isClimbing is set — so this only ever fires for
                // isOnLadderTile (queued at the base) or onWall (just landed) units
                // that have gone stationary too long. Both cases are fixed by "push
                // toward the wall," never by "push away from it."
                if ((isOnLadderTile || unit.isClimbing || unit.onWall) && !unit.unstickCooldown) {
                    
                    if (unit.stuckLog.ticks > 300) {
                        // Push forward toward the ladder/wall instead of ejecting south.
                        let _pushLdr = unit.targetLadder;
                        if (_pushLdr && typeof _pushLdr.x === 'number') {
                            unit.x += (_pushLdr.x > unit.x ? 1 : -1) * (unit.stats.speed * 0.6);
                        }
                        // North nudge: toward the wall, never south. onWall units are
                        // already at the wall, so this only meaningfully moves
                        // isOnLadderTile units still queued at the base.
                        unit.y -= unit.stats.speed * 0.6;

                        unit.stuckLog.ticks = 0;
                        unit.unstickCooldown = 90; // brief 1.5s rest so this doesn't spam every tick
                    }
                } 
// 2. STANDARD LATERAL OVERRIDE FOR GROUND UNITS (1 SEC)
                // SURGERY: Ignore lateral unstick if actively retreating to stop border sliding
                // Also excluded: any ladder-context unit (isOnLadderTile / isClimbing / onWall)
                // — those are handled exclusively by branch 1 above now, since this branch's
                // omnidirectional vx/vy jitter could otherwise still push a ladder unit south.
                else if (!(isOnLadderTile || unit.isClimbing || unit.onWall) && unit.stuckLog.ticks > 60 && !unit.unstickCooldown && unit.orderType !== "retreat") {
                    let perpX = -vy;
                    let perpY = vx;
                    vx = perpX * 1.5 + ((Math.random() - 0.5) * unit.stats.speed);
                    vy = perpY * 1.5 + ((Math.random() - 0.5) * unit.stats.speed);
                    
                    if (unit.stuckLog.ticks > 180) {
                        unit.target = null;
                        unit.stuckLog.ticks = 0;
                        unit.unstickCooldown = 120; // Short 2-second rest
                    }
                }
            } 

            // Tick down the cooldown
            if (unit.unstickCooldown > 0) {
                unit.unstickCooldown--;
            }

                       // --- LADDER approach VECTOR (Fast-Track for specialists) ---
            if (inSiege && unit.side === "player" && !unit.onWall && unit.target && unit.target.isLadderAssault) {
                const _isSpecialist = (unit.siegeRole === "ladder_fanatic" || unit.siegeRole === "ladder_carrier");
                const _ldrRef  = unit.targetLadder || unit.target;
                const _ftDx    = _ldrRef.x - unit.x;
                const _ftDy    = (_ldrRef.y != null ? _ldrRef.y - 10 : unit.target.y - 15) - unit.y;
                const _ftDist  = Math.hypot(_ftDx, _ftDy) || 1;

                if (_isSpecialist && _ftDist < 280) {
                    // FAST-TRACK: bypass flocking — perfectly straight line to ladder base
                    unit.ignoreSeparation = true;
                    vx = (_ftDx / _ftDist) * (unit.stats.speed * 1.6);
                    vy = (_ftDy / _ftDist) * (unit.stats.speed * 1.6);
                } else {
                    unit.ignoreSeparation = false;
                    vx = (_ftDx / _ftDist) * (unit.stats.speed * 1.2);
                    vy = (_ftDy / _ftDist) * (unit.stats.speed * 1.2);
                }
            }

            // (Random-panic and vertical-ladder-slide recovery blocks removed —
            // see the STUCK PREVENTION OVERHAUL block above for the replacement
            // forward-push-toward-wall behavior. Ladder units are never pushed
            // south or given omnidirectional panic movement anymore.)

         let nextX = unit.x + vx;
            let nextY = unit.y + vy;

            // SURGERY: THE IRON CAGE (Universal Boundary Clamp)
            // Mathematically forbids flocking from pushing units into the void
            if (unit.state !== "FLEEING" && unit.state !== "retreated") {
                const mapMargin = 15; 
                const maxW = typeof BATTLE_WORLD_WIDTH !== 'undefined' ? BATTLE_WORLD_WIDTH : 2400;
                const maxH = typeof BATTLE_WORLD_HEIGHT !== 'undefined' ? BATTLE_WORLD_HEIGHT : 1600;

                if (nextX < mapMargin) { nextX = mapMargin; vx = 0; }
                if (nextX > maxW - mapMargin) { nextX = maxW - mapMargin; vx = 0; }
                if (nextY < mapMargin) { nextY = mapMargin; vy = 0; }
                if (nextY > maxH - mapMargin) { nextY = maxH - mapMargin; vy = 0; }
            }

// SURGERY 3: Defender Hard-Line — EXTREME MEASURE (NO EXCEPTIONS)
            if (inSiege && unit.side === "enemy" && !unit.isFalling) {
				
                // Now sourced from the single canonical isSiegeGateBreached()
                // helper instead of a local recompute.
                let isGateBreached = isSiegeGateBreached();
                
                // If the gate is still alive, absolutely NO defender crosses the wall boundary.
                if (!isGateBreached) {
                    const StrictWallY = (typeof SiegeTopography !== 'undefined' ? SiegeTopography.wallPixelY : 2000) - 15; // 85px safety buffer
                    
                    if (nextY > StrictWallY) {
                        nextY = StrictWallY; // Hard mathematical clamp
                        vy = 0;              // Destroy forward momentum
                        
                        // For melee units that hit the invisible wall, force them to stop walking entirely
                        if (!unit.stats.isRanged) {
                            unit.vx = 0; 
                            unit.state = "idle";
                        }
                    }
                }
            }


			if (typeof isBattleCollision === 'function') {
                // 1. Determine if this unit should phase through others (Ladders/Stairs)
                // Tile 9 = Ground Ladders, Tile 12 = Tower Wrap-around Ladders
                let ignoreCollision = (unit.siegeRole === "ladder_fanatic" || isOnLadderTile);

                // 2. SURGERY: CAVALRY BAN LOGIC
                // If the unit is large/mounted and they are on a ladder tile, 
                // we FORCE canMove to false so they cannot overlap with the ladder.
                let isBlockedCavalry = (isLargeUnit && isOnLadderTile);

                // 3. SURGERY: BREACHED-GATE BYPASS CORRIDOR (parity with the player)
                // sandboxmode_update.js already gives the player-controlled commander
                // a bypassGateCollision escape hatch (45px X / 250px Y around the gate,
                // active once __SIEGE_GATE_BREACHED__ is set) so he never depends on the
                // collision grid actually being carved open at the gate — he just skips
                // isBattleCollision entirely in that box. Regular troops had no such
                // exemption: they rely purely on triggerGateBreach()'s grid carve, which
                // only opens the ~11-tile lane between the (still-solid) pillar columns.
                // A wide formation funneling in gets jostled by unit-separation physics
                // toward those pillar edges and reads a real wall tile there, so they
                // pile up at the threshold while the general strolls through his private
                // bypass box. Mirroring the exact same corridor here fixes the parity gap.
                // SURGERY: Large/mounted units (general, cavalry, elephants,
                // camels) never get the gate-breach bypass. That corridor
                // exists to stop crowded INFANTRY formations from jostling
                // into the still-solid pillar columns while funneling through
                // a breach; a large unit relying on it would also ghost
                // straight through those pillars and through siege engines.
                // Large units always resolve through real isBattleCollision
                // below (which already lets them through the actual open
                // gate lane, and now also collides them with siege engines).
                let bypassGateCollision = false;
                if (inSiege && window.__SIEGE_GATE_BREACHED__ && typeof SiegeTopography !== 'undefined' && !isLargeUnit) {
                    let distToGateX = Math.abs(nextX - SiegeTopography.gatePixelX);
                    let distToGateY = Math.abs(nextY - SiegeTopography.gatePixelY);
                    if (distToGateX < 45 && distToGateY < 250) bypassGateCollision = true;
                }

                let canMoveX = !isBlockedCavalry && (ignoreCollision || bypassGateCollision || !isBattleCollision(nextX, unit.y, unit.onWall, unit));
                let canMoveY = !isBlockedCavalry && (ignoreCollision || bypassGateCollision || !isBattleCollision(unit.x, nextY, unit.onWall, unit));

                if (canMoveX) unit.x = nextX;
                if (canMoveY) unit.y = nextY;

                // 3. SURGERY: STUCK PROTECTION FOR LADDERS
                // If a large unit somehow ends up stuck inside Tile 12, push them
                // toward the wall (north), never south — per the standing rule
                // that any stuck-recovery nudge in a siege ladder context moves a
                // unit forward toward the wall. Previously this pushed south
                // ("nudge them slightly south to get them off the ladder tile"),
                // which is exactly the kind of unwanted southward drift being
                // removed everywhere else in this function.
                if (isBlockedCavalry) {
                    unit.vx = 0; unit.vy = 0;
                    unit.y -= 2; // nudge toward the wall, not away from it
                }

            } else {
                // Fallback for when collision function is missing
                if (!(isLargeUnit && isOnLadderTile)) {
                    unit.x = nextX;
                    unit.y = nextY;
                }
            }

            if (typeof applyPinballEscape === 'function') {
                applyPinballEscape(unit);
            }
        }
    },
_handleCombatExecution: function(unit, dx, dy, dist, battleEnv, player) {
        // HARD GUARD: Abort combat if target is a dummy, an engine, or lacks stats entirely
        if (!unit.target || unit.target.isDummy || !unit.target.stats) {
            if (!unit.isCommander) unit.state = "idle";
            if (unit.stats && unit.stats.stamina < 100 && Math.random() > 0.9) unit.stats.stamina++;
            return;
        }

        if (!unit.isCommander || !player.isMoving) {
            unit.state = "attacking";
        }

        if (unit.cooldown <= 0) {
            if (unit.stats.currentStance === "statusrange" && unit.stats.ammo <= 0) {
                unit.stats.currentStance = "statusmelee";
            }

          if (unit.stats.currentStance === "statusrange") {
                
                // --- UNIVERSAL MAGAZINE SURGERY ---
                // 1. Get the max magazine size (Defaults to 1 for standard archers)
                let maxMag = (unit.stats && unit.stats.magazine) ? unit.stats.magazine : 1;
                
                // 2. Initialize current magazine if it doesn't exist
                if (unit.currentMag === undefined) {
                    unit.currentMag = maxMag;
                }

                // 3. Spend ammo
                unit.currentMag--;
                unit.stats.ammo--;

                // 4. Cooldown Routing
                if (unit.currentMag <= 0) {
                    // Magazine Empty: Trigger the full reload (e.g., 300 for repeater, 170 for archers)
                    unit.cooldown = getReloadTime(unit);
                    unit.currentMag = maxMag; // Refill the internal magazine
                } else {
                    // Magazine has ammo: Trigger the rapid burst
                    unit.cooldown = 50; 
                }
                // ----------------------------------

                let spread = (100 - unit.stats.accuracy) * 2.5;
                let targetX = unit.target.x + (Math.random() - 0.5) * spread;
                let targetY = unit.target.y + (Math.random() - 0.5) * spread;
                let angle = Math.atan2(targetY - unit.y, targetX - unit.x);
                let speed = 12; 

                battleEnv.projectiles.push({
                    x: unit.x, y: unit.y,
                    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                    startX: unit.x, startY: unit.y,
                    maxRange: unit.stats.range + 50,
                    attackerStats: unit.stats,
                    side: unit.side,
                    projectileType: (unit.unitType === "Rocket") ? "Archer" : unit.unitType,
                    isFire: ["Firelance", "Bomb", "Rocket"].includes(unit.unitType)
                });

				const ut = String(unit.unitType).toLowerCase();
                const ur = String(unit.stats?.role || "").toLowerCase();
                
                if (ut === "bomb") BattleAudio.playBombChain(unit.x, unit.y, 1);
                else if (ut.includes("firelance")) BattleAudio.playFirelanceBurst(unit.x, unit.y, ut.includes("heavy"));
                else if (ut.includes("rocket")) BattleAudio.playRocketVolley(unit.x, unit.y, 5); 
                else if (ur.includes("gunner") || ut.includes("cannon")) BattleAudio.playGunpowderShot(unit.x, unit.y, ut.includes("cannon"));
                else if (ur.includes("crossbow") || ur.includes("repeater")) BattleAudio.playCrossbowRelease(unit.x, unit.y);
                else if (ur.includes("throwing") || ut.includes("slinger") || ut.includes("javelin")) BattleAudio.playSlingerRelease(unit.x, unit.y);
                else BattleAudio.playArcheryRelease(unit.x, unit.y);

            } else {
                unit.cooldown = getReloadTime(unit);
             let stateStr = "melee_attack";

                // SURGERY: Timer-based Charge Bonus (Prevents infinite charging)
                if (typeof ROLES !== 'undefined' ) {
                    if (typeof unit.engagedTicks === 'undefined') unit.engagedTicks = 0;
                    unit.engagedTicks++;
                    
                    // Charge bonus lasts for the first ~3 seconds of melee contact (roughly 180 frames)
                    if (unit.engagedTicks < 180) {
                        stateStr += " charging";
                    }
                }
                
                if (typeof isFlanked !== 'undefined' && isFlanked(unit, unit.target)) stateStr += " flanked";
                
                let dmg = typeof calculateDamageReceived !== 'undefined' ? calculateDamageReceived(unit.stats, unit.target.stats, stateStr) : 10;
                unit.target.hp -= dmg;

                if (unit.side === "player" && unit.stats.gainExperience) {
                    let baseExp = unit.isCommander ? 0.05 : 0.35;
                    if (unit.target.hp <= 0) baseExp *= 3;
                    unit.stats.gainExperience(baseExp);

                    if (unit.isCommander && typeof gainPlayerExperience === 'function') {
                        gainPlayerExperience(baseExp);
                    }
                }

                if (dmg > (unit.target.stats.health * 0.25)) {
                    unit.target.stats.morale -= 5;
                }

				const utMelee = String(unit.unitType).toLowerCase();
                const urMelee = String(unit.stats?.role || "").toLowerCase();
                const isHeavy = urMelee.includes("two_handed") || urMelee.includes("heavy");
                
                // 1. Attack Swing/Thrust
                if (urMelee.includes("pike") || utMelee.includes("glaive") || utMelee.includes("spear")) {
                    BattleAudio.playPolearm(unit.x, unit.y, urMelee.includes("pike"));
                } else if (unit.unitType === "War Elephant") {
                    BattleAudio.playMountIdle(unit.x, unit.y, "elephant"); 
                } else {
                    BattleAudio.playMeleeAttack(unit.x, unit.y, isHeavy);
                }

                // 2. Impact
                if (dmg > 0) {
                    let armorType = unit.target.stats.armor > 10 ? "armor" : "flesh";
                    BattleAudio.playMeleeHit(unit.x, unit.y, armorType);
                } else {
                    BattleAudio.playMeleeParry(unit.x, unit.y);
                }

                unit.target.x += (dx / dist) * 5;
                unit.target.y += (dy / dist) * 5;
            }
        }
    
	},
	
	processProjectilesAndCleanup: function(battleEnvironment) {
        // ---> PROJECTILE/GROUND-EFFECT LINGER CLEANUP <---
        // Duration (ms) that stuck arrows/bolts/javelins/stones remain visible
        // on the ground or embedded in corpses before being removed. Tunable
        // via the Graphics Quality settings (LOW/MED/HIGH/MAX). Default
        // preserves the original hardcoded behaviour (30 seconds) if the
        // settings system hasn't initialised this global yet.
        const LINGER_MS = (typeof window.projectileLingerMs === 'number') ? window.projectileLingerMs : 30000;
        const nowTime = Date.now();
        let units = battleEnvironment.units;

        if (battleEnvironment.groundEffects) {
            battleEnvironment.groundEffects = battleEnvironment.groundEffects.filter(g => (nowTime - g.timestamp) < LINGER_MS);
        }

        units.forEach(u => {
            if (u.stuckProjectiles) {
                u.stuckProjectiles = u.stuckProjectiles.filter(sp => (nowTime - sp.timestamp) < LINGER_MS);
            }
        });

        // ── NAVAL DECK TEST ──────────────────────────────────────────────────
        // Returns the ship whose deck currently covers world point (x,y), or
        // null if the point is over open water. Mirrors the rotated-superellipse
        // on-deck test naval_battles.js already uses to decide which units ride
        // along with a ship, so "is this point on the ship" agrees everywhere.
        function _shipUnderPoint(x, y) {
            if (!window.inNavalBattle || typeof navalEnvironment === 'undefined' || !navalEnvironment.ships) return null;
            const swayX = navalEnvironment.shipSwayX || 0;
            const swayY = navalEnvironment.shipSwayY || 0;
            for (let k = 0; k < navalEnvironment.ships.length; k++) {
                const s = navalEnvironment.ships[k];
                const sx = s.x + swayX;
                const sy = s.y + swayY;
                const cosInv = Math.cos(-(s.heading || 0));
                const sinInv = Math.sin(-(s.heading || 0));
                const wx = x - sx;
                const wy = y - sy;
                const lx = wx * cosInv - wy * sinInv;
                const ly = wx * sinInv + wy * cosInv;
                const rx = s.width  * 0.55;
                const ry = s.height * 0.55;
                if ((Math.pow(Math.abs(lx) / rx, 2.5) + Math.pow(Math.abs(ly) / ry, 2.5)) <= 1.0) {
                    return s;
                }
            }
            return null;
        }

/* 4. UPDATE PROJECTILES (PHYSICS BASED COLLISION) */
        for (let i = battleEnvironment.projectiles.length - 1; i >= 0; i--) {
            let p = battleEnvironment.projectiles[i];

            // 1. Save previous position for Continuous Collision Detection
            let prevX = p.x;
            let prevY = p.y;

            // Move projectile along its vector
            p.x += p.vx;
            p.y += p.vy;

            let role = p.attackerStats ? p.attackerStats.role : "";
            let name = p.attackerStats ? p.attackerStats.name : "";

            let isJavelin = name === "Javelinier";
            let isBolt = role === "crossbow" || role === "crossbowman";
            let isArrow = role === "archer" || role === "horse_archer";
            let isSlinger = name === "Slinger";
            let isRocket = (p.projectileType === "rocket") || (p.attackerStats && p.attackerStats.name.includes("Rocket"));
            let isBomb = role === "bomb" || name === "Bomb";

            // 2. Range & Bounds Check (Hit the Ground)
            let distFlown = Math.hypot(p.x - p.startX, p.y - p.startY);
            if (distFlown > p.maxRange ||
                p.x < -200 || p.x > (typeof BATTLE_WORLD_WIDTH !== 'undefined' ? BATTLE_WORLD_WIDTH : 2000) + 200 ||
                p.y < -200 || p.y > (typeof BATTLE_WORLD_HEIGHT !== 'undefined' ? BATTLE_WORLD_HEIGHT : 2000) + 200) {

                // ── NAVAL WATER vs DECK CHECK ──────────────────────────────
                // On naval maps, a projectile that runs out of range/flight
                // normally lands in open water and should vanish immediately
                // (no stuck decal — there's nothing solid for it to stick
                // to). If it happens to land on a ship's deck instead, it
                // sticks like normal and is tagged with the ship it landed
                // on (+ a ship-local offset) so naval_battles.js's existing
                // "drag things with the ship" pass can carry it along, the
                // same way it already drags units standing on deck.
                let landedOnShip = window.inNavalBattle ? _shipUnderPoint(p.x, p.y) : null;
                let skipDecal = window.inNavalBattle && !landedOnShip;

                if (!skipDecal && (isJavelin || isBolt || isArrow || isSlinger || isRocket || isBomb)) {
                    if (!battleEnvironment.groundEffects) battleEnvironment.groundEffects = [];
                    if (battleEnvironment.groundEffects.length < 400) {

                        let effectType = isJavelin ? "javelin"
                            : (isBolt ? "bolt"
                                : (isSlinger ? "stone"
                                    : (isRocket ? "rocket"
                                        : (isBomb ? "bomb_crater" : "arrow"))));

                        const bounceChance = 0.30;
                        const landedX = p.x + (Math.random() - 0.5) * 18;
                        const landedY = p.y + (Math.random() - 0.5) * 18;

                        let landedAngle = Math.atan2(p.vy, p.vx) + (Math.random() - 0.5) * 0.9;

                        // 30% of the time, add a stronger "bounce" style angle shift
                        if (Math.random() < bounceChance) {
                            landedAngle += (Math.random() > 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.7);
                        }

                        let ge = {
                            type: effectType,
                            x: landedX,
                            y: landedY,
                            angle: landedAngle,
                            timestamp: Date.now(),
                            // FIX (ship flicker): freeze the visual-variant seed at
                            // spawn time. Ship-stuck decals get x/y re-derived every
                            // frame from the ship's sway/rock wobble (see naval_battles.js
                            // section 7b) so they can track the moving deck — but if the
                            // sprite-variant picker in drawStuckProjectileOrEffect() reads
                            // its seed from that same live x/y, the variant changes every
                            // frame and the decal flickers between sprites. Storing a
                            // one-time seed here means the variant is picked once and
                            // never changes again, while x/y stay free to update.
                            seed: Math.random()
                        };

                        if (landedOnShip) {
                            // Ship-local offset, captured at CURRENT heading so
                            // naval_battles.js can re-derive world x/y every
                            // frame as the ship moves/turns (same pattern used
                            // for units riding the deck).
                            const cosInv = Math.cos(-(landedOnShip.heading || 0));
                            const sinInv = Math.sin(-(landedOnShip.heading || 0));
                            const wx = landedX - landedOnShip.x;
                            const wy = landedY - landedOnShip.y;
                            ge.parentShip = landedOnShip;
                            ge.shipLocalX = wx * cosInv - wy * sinInv;
                            ge.shipLocalY = wx * sinInv + wy * cosInv;
                            ge.shipLocalAngle = landedAngle - (landedOnShip.heading || 0);
                        }

                        battleEnvironment.groundEffects.push(ge);
                    }
                }

				if (isBomb) {
                    BattleAudio.playBombChain(p.x, p.y, 1);
                } else if (isRocket || p.projectileType === "firelance") {
                    BattleAudio.playFirelanceBurst(p.x, p.y, false);
                } else {
                    BattleAudio.playProjectileHit(p.x, p.y, "miss");
                }
				
				
                battleEnvironment.projectiles.splice(i, 1);
                continue;
            }
// 3. Physical Hitbox Collision (Upgraded to Raycasting)
            let hitMade = false;

            for (let j = 0; j < units.length; j++) {
                let u = units[j];

                // Only check living enemies
                if (u.hp > 0 && u.side !== p.side && !u.isFalling) {
                    let hitbox = u.stats && u.stats.isLarge ? 16 : 8;
                    
                    // Raycast from the previous frame's coordinates to the current coordinates
                    let isHit = lineIntersectsCircle(prevX, prevY, p.x, p.y, u.x, u.y, hitbox);

                    if (isHit) {
                        // 1. Anti-Multi-Hit Guard: Prevent piercing projectiles from hitting the same unit every frame
                        if (!p.hitList) p.hitList = new Set();
                        if (p.hitList.has(u.id || u)) continue; // Use u.id if available, fallback to object ref

                        // 2. Pass-Through (Pierce) Logic
                        let inSiege = typeof inSiegeBattle !== 'undefined' && inSiegeBattle;
                        let pierceChance = inSiege ? 0.30 : 0.10; // 10% pierce on land, 30% in siege
                        let doesPierce = Math.random() < pierceChance;

                        // Deal Damage
                        let dmg = typeof calculateDamageReceived === 'function' ? calculateDamageReceived(p.attackerStats, u.stats, "ranged_attack") : 1;
                        u.hp -= dmg;
                        
                        p.hitList.add(u.id || u); // Mark unit as hit

                        // 3. Handle Stopping vs Piercing
                        if (!doesPierce) {
                            hitMade = true; // Mark to destroy the projectile later

                            // Stick to Unit Bodies ONLY if the projectile stops inside them
                            if (isJavelin || isBolt || isArrow || isRocket) {
                                if (!u.stuckProjectiles) u.stuckProjectiles = [];
                                if (u.stuckProjectiles.length < 4) {
                                    let effectType = isJavelin ? "javelin" : (isBolt ? "bolt" : (isSlinger ? "stone" : (isRocket ? "rocket" : "arrow")));
                                    u.stuckProjectiles.push({
                                        type: effectType,
                                        offsetX: p.x - u.x,
                                        offsetY: p.y - u.y,
                                        angle: Math.atan2(p.vy, p.vx),
                                        timestamp: Date.now()
                                    });
                                }
                            }
                        }

                        // Bomb direct hits create craters directly under the unit (Always happens)
                        if (isBomb) {
                            if (!battleEnvironment.groundEffects) battleEnvironment.groundEffects = [];
                            const craterGe = {
                                type: "bomb_crater",
                                x: p.x, y: p.y, angle: 0, timestamp: Date.now(),
                                seed: Math.random() // frozen seed — see note above on flicker fix
                            };
                            if (window.inNavalBattle) {
                                const craterShip = _shipUnderPoint(p.x, p.y);
                                if (craterShip) {
                                    const cosInv = Math.cos(-(craterShip.heading || 0));
                                    const sinInv = Math.sin(-(craterShip.heading || 0));
                                    const wx = p.x - craterShip.x;
                                    const wy = p.y - craterShip.y;
                                    craterGe.parentShip     = craterShip;
                                    craterGe.shipLocalX     = wx * cosInv - wy * sinInv;
                                    craterGe.shipLocalY     = wx * sinInv + wy * cosInv;
                                    craterGe.shipLocalAngle = -(craterShip.heading || 0);
                                }
                            }
                            battleEnvironment.groundEffects.push(craterGe);
                        }

                        // 4. EXP and Audio Logic
                        let attackerUnit = units.find(a => a.stats === p.attackerStats);
                        if (attackerUnit && attackerUnit.side === "player" && p.attackerStats.gainExperience) {
                            let baseExp = attackerUnit.isCommander ? 0.05 : 0.35;
                            if (u.hp <= 0) baseExp *= 3;
                            p.attackerStats.gainExperience(baseExp);
                            if (attackerUnit.isCommander && typeof gainPlayerExperience === 'function') gainPlayerExperience(baseExp);
                        }

					if (isBomb) {
                            BattleAudio.playBombChain(p.x, p.y, 1);
                        } else {
                            let armorType = u.stats.armor > 10 ? "armor" : "flesh";
                            if (dmg > 0) {
                                BattleAudio.playProjectileHit(p.x, p.y, armorType);
                            } else {
                                BattleAudio.playProjectileHit(p.x, p.y, "shield");
                            }
                        }
						
                        // If it stopped, break the loop. If it pierced, keep checking other units behind them!
                        if (!doesPierce) {
                            break; 
                        }
                    }
                }
            }

            // ════════════════════════════════════════════════════════════════
            // STRUCTURE COLLISION — Walls, Towers, Walkways, Siege Engines
            // Runs only if the projectile didn't already hit a unit.
            // ════════════════════════════════════════════════════════════════
            
            let minStickDist = (isArrow || isBolt) ? 100 : 30;
            let canHitStructure = distFlown >= minStickDist;

            // ── NAVAL GUARD ──────────────────────────────────────────────────
            // battleEnvironment.grid is reused on naval maps to hold purely
            // COSMETIC water terrain (generateNavalMap(): 12=reef, 13=rocks,
            // 14=algae, 15=dark water — scattered across open ocean via noise,
            // nothing to do with ships). This block's tile===8/12 check means
            // "walkway" on land/siege maps, so a projectile flying over a reef
            // patch mid-flight (well before maxRange) was being misread as a
            // walkway hit and stuck as a plain static {x,y} decal with no
            // parentShip tag — bypassing the water-vs-deck / drag-with-ship
            // logic in the range-miss branch above entirely. Walls, towers,
            // walkways, and siege engines don't exist in naval battles, so
            // this whole block is simply inert there.
            if (!hitMade && canHitStructure && !window.inNavalBattle && typeof BATTLE_TILE_SIZE !== 'undefined' && battleEnvironment.grid) {
                let ptx  = Math.floor(p.x / BATTLE_TILE_SIZE);
                let pty  = Math.floor(p.y / BATTLE_TILE_SIZE);
                let tile = (battleEnvironment.grid[ptx] && battleEnvironment.grid[ptx][pty] !== undefined)
                           ? battleEnvironment.grid[ptx][pty] : -1;

                let hitsWall     = (tile === 6 || tile === 7); 
                let hitsWalkway  = (tile === 8 || tile === 12); 
                let impactAngle = Math.atan2(p.vy, p.vx);

                // ── WALL & WALKWAY collision ──────────────────────────────────
                if (hitsWall || hitsWalkway) {
                    let stickChance = 0;
                    if (p.side === "enemy") {
                        stickChance = 0.05; 
                    } else {
                        stickChance = hitsWall ? 0.10 : 0.20;
                    }
                    
                    if (Math.random() <= stickChance) {
                        hitMade = true;
                        if (!battleEnvironment.groundEffects) battleEnvironment.groundEffects = [];

                        if (isBomb) {
                            if (battleEnvironment.groundEffects.length < 500) {
                                battleEnvironment.groundEffects.push({
                                    type: "bomb_crater", x: p.x, y: p.y, angle: 0,
                                    stuckOnStructure: true, structureTile: tile, timestamp: Date.now()
                                });
                            }
                            if (window.cityTowerPositions) {
                                for (let twr of window.cityTowerPositions) {
                                    let d = Math.hypot(twr.pixelX - p.x, twr.pixelY - p.y);
                                    if (d < 90) {
                                        if ((twr.hp ?? 300) <= 0) continue; 
                                        twr.hp = (twr.hp ?? 300) - 70;
                                        if (twr.hp < 0) twr.hp = 0;
                                    }
                                }
                            }
							
						
// GOOD
BattleAudio.playBombChain(p.x, p.y, 1);


                        } else if (p.projectileType === "firelance" || (p.projectileType && p.projectileType.includes("Firelance"))) {
                            if (battleEnvironment.groundEffects.length < 500) {
                                battleEnvironment.groundEffects.push({
                                    type: "scorch_wall", x: p.x, y: p.y, angle: impactAngle,
                                    stuckOnStructure: true, structureTile: tile, timestamp: Date.now()
                                });
                            }
                        } else if (isJavelin || isBolt || isRocket || isSlinger || isArrow) {
                            let efType = isJavelin ? "javelin" : isBolt ? "bolt" : isRocket ? "rocket" : isSlinger ? "stone" : "arrow";
                            if (battleEnvironment.groundEffects.length < 500) {
                                battleEnvironment.groundEffects.push({
                                    type: efType, x: p.x, y: p.y, angle: impactAngle,
                                    stuckOnStructure: true, structureTile: tile, timestamp: Date.now()
                                });
                            }
                        }
                    }
                }

               // ── SIEGE ENGINE collision ────────────────────────────────────
                if (!hitMade && typeof siegeEquipment !== 'undefined') {
                    let hitModifier = (p.side === "player") ? 0.05 : 1.0;

                    if (siegeEquipment.ladders) {
                        for (let ldr of siegeEquipment.ladders) {
                            if (!ldr.isDeployed || ldr.hp <= 0) continue;
                            let d = Math.hypot(p.x - ldr.x, p.y - ldr.y);
                            if (d < 16) {
                                let hitChance = (p.side === "player") ? 0.05 : 0.95;
                                
                                if (Math.random() <= hitChance) {
                                    hitMade = true;
                                    ldr.hp -= isBomb ? 60 : 12;
                                    
                                    let isStickingProjectile = isJavelin || isBolt || isArrow;
                                    if (isStickingProjectile && battleEnvironment.groundEffects && battleEnvironment.groundEffects.length < 500) {
                                        let efType = isJavelin ? "javelin" : isBolt ? "bolt" : "arrow";
                                        battleEnvironment.groundEffects.push({
                                            type: efType, x: p.x, y: p.y, angle: impactAngle,
                                            stuckOnStructure: true, structureTile: 98, timestamp: Date.now()
                                        });
                                    }
                                }
                                break; 
                            }
                        }
                    }
                    if (!hitMade && siegeEquipment.rams) {
                        for (let ram of siegeEquipment.rams) {
                            if (ram.hp <= 0) continue;
                            let d = Math.hypot(p.x - ram.x, p.y - ram.y);
                            if (d < 20) {
                                if (Math.random() <= (0.60 * hitModifier)) {
                                    hitMade = true;
                                    ram.hp -= isBomb ? 80 : 10;
                                    if (battleEnvironment.groundEffects && battleEnvironment.groundEffects.length < 500) {
                                        let efType = isJavelin ? "javelin" : isBolt ? "bolt" : isArrow ? "arrow" : "stone";
                                        battleEnvironment.groundEffects.push({
                                            type: efType, x: p.x, y: p.y, angle: impactAngle,
                                            stuckOnStructure: true, structureTile: 98, timestamp: Date.now()
                                        });
                                    }
                                }
                                break;
                            }
                        }
                    }
                }
            } // <--- FIX: This bracket safely closes the Structure Collision block

            // ════════════════════════════════════════════════════════════════
            // THE FIX: Deletion is now outside the structure block!
            // ════════════════════════════════════════════════════════════════
            if (hitMade) {
                battleEnvironment.projectiles.splice(i, 1);
            }
        }
    }
};
 // This closing brace for the AICategories object was missing!

// =========================================================
// AI PINBALL ESCAPE SYSTEM (Anti-Stuck Fallback)
// =========================================================

function applyPinballEscape(unit) {
    // 1. Initialize trackers
    if (!unit.positionHistory) unit.positionHistory = [];
    if (!unit.pinballTimer) unit.pinballTimer = 0;

// 2. Are we currently in Pinball Mode?
    if (unit.pinballTimer > 0) {
        // Violently bounce them in the saved random direction
        unit.x += unit.pinballVector.x;
        unit.y += unit.pinballVector.y;
        
        // SURGERY: Clamp pinball bounces so they don't blast through the map border
        const mapMargin = 15; 
        const maxW = typeof BATTLE_WORLD_WIDTH !== 'undefined' ? BATTLE_WORLD_WIDTH : 2400;
        const maxH = typeof BATTLE_WORLD_HEIGHT !== 'undefined' ? BATTLE_WORLD_HEIGHT : 1600;
        
        if (unit.x < mapMargin) unit.x = mapMargin;
        if (unit.x > maxW - mapMargin) unit.x = maxW - mapMargin;
        if (unit.y < mapMargin) unit.y = mapMargin;
        if (unit.y > maxH - mapMargin) unit.y = maxH - mapMargin;

        unit.pinballTimer--;
        return true; // We moved them, skip normal movement this frame!
    }
    // 3. Track their history (Save last 30 frames)
    unit.positionHistory.push({ x: unit.x, y: unit.y });
    if (unit.positionHistory.length > 30) {
        unit.positionHistory.shift(); // Keep array size small
    }

    // 4. Check if they are stuck
    // If they have a target but haven't moved more than 5 pixels in 30 frames
    if (unit.positionHistory.length === 30 && unit.hasOrders) {
        let oldPos = unit.positionHistory[0];
        let dx = unit.x - oldPos.x;
        let dy = unit.y - oldPos.y;
        let distanceMovedSq = (dx * dx) + (dy * dy);
	if (distanceMovedSq < 9) { // 5 pixels squared
            
// Replace the old isDummy block with this:

if (unit.target && unit.target.isDummy) {
    // Increased from 16 to 45 to accommodate the 40px 'shouldHold' formation radius
    let distToDummy = Math.hypot(unit.x - unit.target.x, unit.y - unit.target.y);
    if (distToDummy < 45) { 
        unit.positionHistory = []; 
        return false; 
    }
}

// ---> ADD THIS CRITICAL SAFEGUARD HERE <---
// Never pinball a unit that is actively climbing a ladder, or mid-settle
// just after finishing a climb (unit.settling — see _handleMovement's
// SETTLE PHASE block). In practice a settling unit already returns out of
// _handleMovement before reaching applyPinballEscape's call site, but this
// guard is kept in sync anyway so a south-bounce can never reach a
// ladder-context unit even if that call ordering changes later.
if (unit.isClimbing || unit.settling) {
    unit.positionHistory = [];
    return false;
}

// --- NEW GUARD: DO NOT BOUNCE INTENTIONALLY IDLE UNITS OR LADDER SWARMERS! ---
// Added "hold_position" alongside retreat to prevent units from bouncing into the abyss.
//
// BUGFIX ("units run south for a few seconds with NO walking animation, a
// bit after they start trying to climb"): a unit QUEUED at a ladder
// (siegeRole ladder_carrier/ladder_fanatic, waiting behind the crew cap —
// see LADDER_CREW_CAP_MATCH below) is SUPPOSED to hold still at its
// waiting spot while its turn comes up — see battlefield_commands.js's
// queue handling — which is indistinguishable from "stuck" to the
// position-history check above once positionHistory fills (30 frames) and
// the unit is more than the 45px isDummy-proximity threshold from its
// exact waypoint (easily true with the queue's own +/-24px stagger
// jitter, or whenever queue rank shifts and recomputes the waypoint).
// Neither of the two guards above this one covers that role, so a
// legitimately-queued unit falls straight through into the "UNIT IS
// STUCK! INITIATE PINBALL BOUNCE!" branch below — which, for every
// non-defender unit, launches a HARD-CODED south-biased bounce
// (bounceAngle between 45 and 135 degrees — see "EVERYONE ELSE BOUNCES
// SOUTH" below) for 5 consecutive frames, with this function's `return
// true` causing _handleMovement to skip normal movement (and therefore
// the walk-state/animation flip) entirely on each of those frames.
//
// REGRESSION FIX ("ladder climbers stuck at the base, never climbing
// further"): the first version of this exclusion covered EVERY
// ladder_carrier/ladder_fanatic unconditionally, including the ACTIVE
// crew (queuePos null or below the crew cap) who are genuinely walking
// toward the ladder, not holding in queue. The ladder gap is a single
// tile column flanked by solid wall tiles on both sides — a real, narrow
// pinch point — and this rescue mechanism (which forcibly displaces a
// stuck unit) was the actual thing letting an active-crew unit work its
// way through that geometry onto tile 9. Excluding them entirely removed
// their only way through, so they piled up at the base and never
// transitioned into isClimbing. Fix: only exclude units that are actually
// QUEUED (queuePos at/beyond LADDER_CREW_CAP, matching the cap used in
// battlefield_commands.js's ladder_carrier case) — active crew keep the
// normal stuck-rescue behavior so they can still push through to the
// ladder tile. Note this rescue still can't bounce them south past the
// isClimbing/settling guard above once they actually start climbing.
const LADDER_CREW_CAP_MATCH = 2; // must match LADDER_CREW_CAP in battlefield_commands.js
const isQueuedAtLadder = (unit.siegeRole === "ladder_carrier" || unit.siegeRole === "ladder_fanatic") &&
    unit.queuePos != null && unit.queuePos >= LADDER_CREW_CAP_MATCH;

if ( unit.state === "idle" || unit.state === "attacking" || unit.disableAICombat || unit.orderType === "retreat" || unit.orderType === "hold_position" || unit.siegeRole === "treb_crew" || unit.siegeRole === "trebuchet_crew" || unit.siegeRole === "engine_crew" || isQueuedAtLadder) {
    unit.positionHistory = []; // Clear history to prevent memory bloat
    return false; // Abort the pinball logic entirely for this unit
}
// UNIT IS STUCK! INITIATE PINBALL BOUNCE!
            let bounceAngle;
            // BUGFIX (post-breach gate-jam / STUCK-WATCH loop): this branch
            // never had the isSiegeGateBreached()/siegeRole==="assault_complete"
            // awareness that every other stuck/clamp system in the codebase
            // already carries (see siegeEngineLogic.js's GATE-CLAMP exemption
            // at ~line 95/137, autoAttack.js's needsAssignment filter,
            // battlefield_commands.js line ~2050). A packed crowd funneling
            // through the ~80-160px gate gap easily nets <5px of movement
            // over 30 frames purely from unit-vs-unit jostling, which is
            // exactly what trips the stuck check just above this block —
            // it doesn't mean the unit is actually failing to path. The old
            // unconditional "EVERYONE ELSE BOUNCES SOUTH" then launched a
            // hard 5-frame bounce straight back toward the siege camp,
            // directly away from the gate/plaza these units are supposed to
            // be pushing into, with _handleMovement's `return true` also
            // skipping normal seek_engage movement for those same frames.
            // Repeated every time the crowd re-compresses, this is what
            // produced the STUCK-WATCH oscillation right at the gate x-line:
            // the "rescue" was actively fighting the direction these units
            // needed to travel. Same root-cause pattern already called out
            // in the isBlockedCavalry ladder fix a few lines above this one
            // ("previously this pushed south ... exactly the kind of
            // unwanted southward drift being removed everywhere else in
            // this function") — this just closes the one remaining branch
            // that still had it.
            //
            // Fix: once the gate is breached, an assault_complete player
            // unit that trips the stuck check bounces NORTH (deeper into
            // the city, same bearing defenders already use) instead of
            // south back toward camp — a real nudge that actually helps it
            // clear the jam in the direction it's trying to go. Every other
            // case (pre-breach attackers, defenders, non-siege battles) is
            // completely unchanged.
            let isPostBreachAssault = typeof inSiegeBattle !== 'undefined' && inSiegeBattle &&
                unit.side === "player" && unit.siegeRole === "assault_complete" &&
                typeof isSiegeGateBreached === 'function' && isSiegeGateBreached();

            if (typeof inSiegeBattle !== 'undefined' && inSiegeBattle && unit.side === "enemy") {
                // DEFENDERS BOUNCE NORTH (Between -45 and -135 degrees)
                bounceAngle = -Math.PI/2 + ((Math.random() - 0.5) * Math.PI/2);
            } else if (isPostBreachAssault) {
                // POST-BREACH ATTACKERS ALSO BOUNCE NORTH — same bearing as
                // defenders, since "forward" for these units is now further
                // into the city, not back toward the camp.
                bounceAngle = -Math.PI/2 + ((Math.random() - 0.5) * Math.PI/2);
            } else {
                // EVERYONE ELSE (pre-breach attackers, non-siege battles)
                // BOUNCES SOUTH, unchanged.
                bounceAngle = (Math.PI / 4) + (Math.random() * (Math.PI / 2));
            }
            let bounceForce = 1.3;
unit.pinballVector = {
    x: Math.cos(bounceAngle) * bounceForce,
    y: Math.sin(bounceAngle) * bounceForce
};

unit.pinballTimer = 5; 
unit.positionHistory = []; 

return true; // Use a semicolon here, NOT a comma.
        }
    }
    
    return false; // Not stuck, proceed with normal movement
}

// Add this helper function at the bottom of the file
function lineIntersectsCircle(x1, y1, x2, y2, cx, cy, r) {
    let dx = x2 - x1;
    let dy = y2 - y1;
    let fx = x1 - cx;
    let fy = y1 - cy;

    let a = dx * dx + dy * dy;
    let b = 2 * (fx * dx + fy * dy);
    let c = (fx * fx + fy * fy) - (r * r);

    let discriminant = b * b - 4 * a * c;
    
    // No intersection
    if (discriminant < 0) return false;

    // Ray didn't miss, check if the intersection is within the segment length
    discriminant = Math.sqrt(discriminant);
    let t1 = (-b - discriminant) / (2 * a);
    let t2 = (-b + discriminant) / (2 * a);

    // If either t1 or t2 is between 0 and 1, the projectile passed through the circle this frame
    return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

// =========================================================
// TACTICAL AI ROLE TRANSLATOR
// =========================================================
window.getTacticalRole = function(unit) {
    if (!unit || !unit.stats) return 'INFANTRY';
    
    const roleStr = String(unit.stats.role || "").toUpperCase();
    const typeStr = String(unit.unitType || unit.stats.name || "").toUpperCase();
    
    // Cavalry Check
    if (unit.stats.isLarge || unit.isMounted || /(CAV|HORSE|MOUNTED|CAMEL|ELEPH|LANCER|KESHIG)/.test(typeStr) || /(CAVALRY)/.test(roleStr)) {
        return 'CAVALRY';
    }
    // Gunpowder Check
    if (/(FIRELANCE|BOMB|ROCKET|GUNNER|HAND CANNONEER|MUSKET)/.test(typeStr) || /(BOMB|GUNPOWDER)/.test(roleStr)) {
        return 'GUNPOWDER';
    }
    // Standard Ranged Check
    if (unit.stats.isRanged || /(ARCHER|BOW|CROSSBOW|SLINGER)/.test(typeStr) || /(RANGED)/.test(roleStr)) {
        return 'RANGED';
    }
    // Default everyone else to Infantry
    return 'INFANTRY';
};