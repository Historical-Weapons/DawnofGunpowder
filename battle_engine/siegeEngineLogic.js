let siegeAITick = 0;

// DEBUG TOGGLE: set window.__SIEGE_DEBUG_GATE__ = true in the browser
// console (or flip the default below) to turn on the [GATE-CLAMP],
// [RAM-RELEASE], [DUMMY-LOCK], and [STUCK-WATCH] console logs used to
// pin down the post-breach gate-stuck bug. Leave false for normal play —
// these run a per-unit, per-tick check and will spam the console.
if (typeof window !== 'undefined' && window.__SIEGE_DEBUG_GATE__ === undefined) {
    window.__SIEGE_DEBUG_GATE__ = false;
}

function processSiegeEngines() {
    if (!inSiegeBattle) return;
    
    siegeAITick++; 

    let units = battleEnvironment.units;
    let playerUnits = units.filter(u => u.side === "player" && u.hp > 0);
    let allAliveEnemies = units.filter(u => u.side === "enemy" && u.hp > 0);
    let wallEnemies = allAliveEnemies.filter(u => u.onWall);

    let southGate = battleEnvironment.cityGates 
        ? battleEnvironment.cityGates.find(g => g.side === "south") 
        : null;

    // TRUE breach detection
    let isGateBreached = window.__SIEGE_GATE_BREACHED__ || !southGate || southGate.isOpen || southGate.gateHP <= 0;
    let activeLadders = siegeEquipment.ladders.filter(l => l.isDeployed && l.hp > 0);
    let isWallBreached = activeLadders.length > 0;

    // DEBUG: [STUCK-WATCH] catch-all, path-agnostic stuck detector. Doesn't
    // assume WHICH code path is holding a unit — just flags any player unit
    // within ~150px of the gate x-line, post-breach, that hasn't meaningfully
    // moved (>5px) in over 2 seconds. If a unit logs here WITHOUT also
    // logging [DUMMY-LOCK] or [GATE-CLAMP] around the same time, the stuck
    // mechanism is neither of the two fixed/instrumented paths — something
    // else entirely (e.g. plain unit-vs-unit crowd collision, a third
    // targeting branch, or a stale reference) is responsible, and that's
    // the next place to look.
    if (window.__SIEGE_DEBUG_GATE__ && isGateBreached && typeof SiegeTopography !== 'undefined') {
        battleEnvironment.units.forEach(u => {
            if (u.side !== "player" || u.hp <= 0 || u.isCommander) return;
            if (Math.abs(u.x - SiegeTopography.gatePixelX) > 150) return;

            u.__stuckWatchLastPos = u.__stuckWatchLastPos || { x: u.x, y: u.y, t: Date.now() };
            let moved = Math.hypot(u.x - u.__stuckWatchLastPos.x, u.y - u.__stuckWatchLastPos.y);

            if (moved > 5) {
                u.__stuckWatchLastPos = { x: u.x, y: u.y, t: Date.now() };
            } else if (Date.now() - u.__stuckWatchLastPos.t > 2000) {
                u.__stuckWatchLogLast = u.__stuckWatchLogLast || 0;
                if (Date.now() - u.__stuckWatchLogLast > 1500) {
                    u.__stuckWatchLogLast = Date.now();
                    console.log(
                        "%c[STUCK-WATCH] player unit near gate hasn't moved in 2s+",
                        "color:#fff;background:#8e44ad;font-weight:bold;padding:2px 4px;",
                        {
                            unitId: u.id ?? u.name ?? "(no id)",
                            siegeRole: u.siegeRole,
                            orderType: u.orderType,
                            priorityOverride: u.priorityOverride,
                            hasOrders: u.hasOrders,
                            disableAICombat: u.disableAICombat,
                            isClimbing: u.isClimbing,
                            onWall: u.onWall,
                            x: Math.round(u.x),
                            y: Math.round(u.y),
                            wallPixelY: Math.round(SiegeTopography.wallPixelY),
                            gatePixelX: Math.round(SiegeTopography.gatePixelX),
                            target: u.target ? { x: Math.round(u.target.x), y: Math.round(u.target.y), isDummy: !!u.target.isDummy } : null,
                            secondsStuck: Math.round((Date.now() - u.__stuckWatchLastPos.t) / 100) / 10
                        }
                    );
                }
            }
        });
    }

    // HARD NPC COLLISION CLAMP (Funneling logic)
    let wallPixelY = SiegeTopography.wallPixelY; 
    let westWallX = 45 * BATTLE_TILE_SIZE; 
    let eastWallX = (BATTLE_COLS - 45) * BATTLE_TILE_SIZE;
 let gateHalfWidth = 80; // SURGERY: Massively widened so they don't clip the gate frame

    battleEnvironment.units.forEach(u => {
        if (!u.onWall && u.hp > 0) {
			
			  // SURGERY 2-E: never apply gate-magnet slide to a climbing/ladder unit
            // SURGERY 2-F: nor to a unit that's already charging through a breached
            // gate — battlefield_commands.js reassigns siegeRole to "assault_complete"
            // the instant the gate breaks, so without this the clamp below re-grabs
            // them (they no longer match the 'ladder' check) and snaps them back to
            // wallPixelY+20 unless their x is within a narrow window of the gate that
            // frame, which reads as units being stuck/pushed back right at the gate.
            if (u.isClimbing || (u.siegeRole && (u.siegeRole.includes('ladder') || u.siegeRole === 'assault_complete'))) return;

            // BUGFIX ("units gather in front of the gate and get stuck there
            // after it breaks, even though the general can walk through
            // fine"): this function runs BEFORE processTacticalOrders every
            // tick (see updateBattleUnits's call order), so this clamp gets
            // first say over every non-ladder/non-assault_complete unit's
            // position each frame — including a unit that's correctly
            // walking toward battlefield_commands.js's Stage-1 gate_funnel
            // dummy target. The 2-E/2-F fix above already recognized this
            // and gave ladder/assault_complete units a full, unconditional
            // exemption once tagged — no x-window check at all. Every other
            // unit instead depends on atOpenGate re-passing its 80px
            // x-alignment check FRESH every single tick, with no persistence
            // or grace period. With dozens of units all converging on the
            // same ~60px-wide funnel point at once, ordinary crowd jostling
            // can easily push a unit's x outside that 80px window for a
            // tick — at which point it gets clamp-reset straight back to
            // wallPixelY + 20, discarding real forward progress. Repeated
            // across a packed crowd, this becomes a self-sustaining jam: the
            // congestion that pushes units off-center is itself partly
            // caused by this same clamp resetting others nearby.
            //
            // Separately — and this is the mechanism the request specifically
            // asked about ("perhaps we need to kill the old target dummy
            // after gate open"): even a unit that DOES stay inside the 80px
            // window and dodges the Y-clamp still hits the `u.x += dirX *
            // 1.8` nudge on line ~53 below every tick it's in the gate zone.
            // That's a second, independent x-steering driver layered on top
            // of whatever battlefield_commands.js's funnel target / seek_engage
            // targeting already computed for this unit that same frame — the
            // "old target dummy" logic here was never actually retired once
            // the gate opened, it just kept running in parallel and fighting
            // the real steering with small competing corrections.
            //
            // Fix: once the gate is breached, this clamp has no further job
            // to do for ANY player unit near the gate — same reasoning as
            // the existing ladder/assault_complete exemption, just no longer
            // restricted to those two roles. Units still approaching a
            // genuinely closed gate, or clamped against the wall elsewhere,
            // are completely unaffected — this only widens the exemption
            // that already exists for the post-breach population.
            if (isGateBreached && u.side === "player" && Math.abs(u.x - SiegeTopography.gatePixelX) < gateHalfWidth) return;
            
            let atOpenGate = (isGateBreached && Math.abs(u.x - SiegeTopography.gatePixelX) < gateHalfWidth);
            let atLadder = activeLadders.some(l => Math.abs(u.x - l.x) < 24);

         // 1. FRONT WALL COLLISION
                    if (u.side === "player" && !u.isCommander) {
                        if (u.y < wallPixelY + 20 && !atLadder && !atOpenGate) {
                            // DEBUG: [GATE-CLAMP] fires whenever this per-tick,
                            // no-persistence 80px x-window check re-snaps a
                            // player unit back to the wall line. If a unit
                            // reported as "stuck at the gate" is logging this
                            // repeatedly every frame, THIS clamp — not
                            // targeting/waypoints — is what's holding it.
                            // xOffsetFromGate tells you how far outside the
                            // gateHalfWidth (80px) window the unit's x had
                            // drifted at the moment it got snapped.
                            if (window.__SIEGE_DEBUG_GATE__) {
                                console.log(
                                    "%c[GATE-CLAMP] unit re-snapped to wall line",
                                    "color:#fff;background:#c0392b;font-weight:bold;padding:2px 4px;",
                                    {
                                        unitId: u.id ?? u.name ?? "(no id)",
                                        siegeRole: u.siegeRole,
                                        orderType: u.orderType,
                                        priorityOverride: u.priorityOverride,
                                        x: Math.round(u.x),
                                        gatePixelX: Math.round(SiegeTopography.gatePixelX),
                                        xOffsetFromGate: Math.round(Math.abs(u.x - SiegeTopography.gatePixelX)),
                                        gateHalfWidth,
                                        y_before: Math.round(u.y),
                                        y_after: wallPixelY + 20,
                                        isGateBreached
                                    }
                                );
                            }
                            u.y = wallPixelY + 20; // Hard clamp on the Y axis
                            
                            // NEW SURGERY: Slide towards the ladder if assigned, otherwise slide to gate
                            if (u.target && u.target.isLadderAssault) {
                                let dirX = (u.target.x > u.x) ? 1 : -1;
                                u.x += dirX * 1.8;
                            } else {
                                let dirX = (SiegeTopography.gatePixelX > u.x) ? 1 : -1;
                                u.x += dirX * 1.8; 
                            }
                        }
                    } else if (u.side === "enemy") {
                if (u.y > wallPixelY - 20 && !atOpenGate) {
                    u.y = wallPixelY - 20; 
                }
            }

            // 2. SIDE WALL COLLISION
            if (u.y < wallPixelY) { 
                if (u.x < westWallX) u.x = westWallX; 
                if (u.x > eastWallX) u.x = eastWallX; 
            }
        }
    });

    // ============================================================================
  // A. RAM ASSAULT LOGIC
    // ============================================================================
    siegeEquipment.rams.forEach(ram => {
        if (ram.hp <= 0) return;

        // BUGFIX ("ram pushers stuck after the gate breaks, can't detach"):
        // hoisted up from further down in this function. Previously
        // "isGateBroken" was only computed after the crew-presence/auto-
        // refill/Y-clamp logic below had already run using ram.hp alone —
        // and ram.hp does NOT drop to 0 just because the GATE broke. The
        // gate has its own separate gateHP. So a ram that successfully
        // breached the gate is still fully alive and still passes every
        // "am I a valid ram to crew" check below, forever. Nothing anywhere
        // previously connected "the gate is now open" to "release the
        // pushers" — computing it here lets every block below skip clamping/
        // refilling/holding crew in place once the breach has happened.
        const isGateBroken = !ram.targetGate || ram.targetGate.gateHP <= 0 || window.__SIEGE_GATE_BREACHED__;

        // BUGFIX: release existing ram_pusher crew the instant the gate
        // breaks, instead of leaving them assigned to a ram that has
        // nothing left to batter.
        //
        // FOLLOW-UP FIX ("pushers still look stuck while the ram is backing
        // off"): the first version of this handed freed units bare
        // seek_engage and relied on processTacticalOrders' seek_engage
        // handler (battlefield_commands.js) to pick a live enemy target.
        // Right after a breach, though, defenders are simultaneously being
        // set to retreatToPlaza (see triggerGateBreach in
        // siege_function_helpers.js) and can legitimately be out of range/
        // not yet resolvable for a tick or several — pickSmartCombatTarget
        // and the nearest-enemy fallback both return null in that window,
        // so unit.target stays null and the freed unit just stands exactly
        // where it was crewing the ram, with nowhere to go, while the ram
        // itself visibly retreats south out from under it. That reads as
        // "stuck," even though the unit is technically free.
        // Fix: give freed pushers the same immediate gate-directed waypoint
        // triggerGateBreach already hands every other unit (move_to_point +
        // priorityOverride, aimed at the gate centroid) so they have
        // somewhere to walk to on the very same tick they're released,
        // with real walking animation, regardless of whether a live enemy
        // target is resolvable yet. Once they arrive, normal seek_engage
        // targeting (already working) takes over as usual.
        if (isGateBroken && typeof battleEnvironment !== 'undefined' && battleEnvironment.units) {
            battleEnvironment.units.forEach(u => {
                if (u.side === "player" && u.hp > 0 && u.siegeRole === "ram_pusher" && u.siegeTarget === ram) {
                    u.siegeRole = null;
                    u.siegeTarget = null;
                    u.hasOrders = true;
                    // BUGFIX ("ram pushers permanently stuck at the broken
                    // gate"): this used to hand freed pushers orderType =
                    // "move_to_point" with priorityOverride = true and a
                    // ONE-TIME dummy target frozen at gateY-20. That target
                    // was never re-issued or advanced by anything —
                    // battlefield_commands.js's Stage-1/Stage-2 funnel
                    // (gate_funnel -> isInsideCity -> seek_engage handoff)
                    // only runs for orderType === "siege_assault", which
                    // these units never had. The result: pushers walked to
                    // the frozen point and then had nowhere left to go,
                    // forever — reading as a collision jam right at the
                    // gate gap, and immune to new player orders since
                    // priorityOverride was never cleared by anything either
                    // (see the companion fix in ai_categories.js's
                    // processAction, which now also releases the lock on a
                    // fresh order or on arrival as a safety net).
                    //
                    // Fix: route freed pushers through "siege_assault" like
                    // every other attacker, so they get the SAME proven
                    // Stage-1 (funnel to gate) -> Stage-2 (seek_engage /
                    // getCityNavTarget, actually walks them to the plaza)
                    // handoff that already works correctly for the rest of
                    // the assault force, instead of a bespoke dead-end path.
                    u.orderType = "siege_assault";
                    u.priorityOverride = false;
                    let gateX = typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelX : ram.x;
                    let gateY = typeof SiegeTopography !== 'undefined' ? SiegeTopography.gatePixelY : ram.y - 100;
                    u.target = {
                        x: gateX + (Math.random() - 0.5) * 80,
                        y: gateY - 20,
                        hp: 9999,
                        isDummy: true,
                        priority: "gate_centroid"
                    };

                    // DEBUG: [RAM-RELEASE] fires exactly once per unit, the
                    // tick a ram_pusher is freed after the gate breaks. If a
                    // unit that later gets stuck never logs this, it isn't a
                    // freed ram_pusher at all — the stuck mechanism for it
                    // lives somewhere else entirely (different siegeRole/
                    // orderType), and the fix in this function doesn't apply
                    // to it.
                    if (window.__SIEGE_DEBUG_GATE__) {
                        console.log(
                            "%c[RAM-RELEASE] ram_pusher freed at gate breach",
                            "color:#fff;background:#2471a3;font-weight:bold;padding:2px 4px;",
                            {
                                unitId: u.id ?? u.name ?? "(no id)",
                                orderType: u.orderType,
                                priorityOverride: u.priorityOverride,
                                targetX: Math.round(u.target.x),
                                targetY: Math.round(u.target.y),
                                unitX: Math.round(u.x),
                                unitY: Math.round(u.y)
                            }
                        );
                    }
                }
            });
        }

        // ---> CREW PRESENCE REQUIRED AGAIN <---
        // Rams only move/attack while at least one non-commander player unit
        // that is legally allowed to operate siege engines is in body contact
        // with it. Same 60px radius used previously for the cosmetic clamp;
        // now it's load-bearing again.
        // RAM CREW CAP: 5 — this is the top limit for the whole player siege
        // attacker AI. Only the 5 closest count as crew (units beyond that
        // won't push/speed the ram, won't be marked "busy" via carriedBy).
        // BUGFIX: once the gate is broken there is no more crew job at all —
        // physicallyPresentCrew is forced empty so the auto-refill block
        // below and the "busy, don't retarget me" flag on the ram both stand
        // down immediately, instead of continuing to treat nearby units as
        // ram crew just because they haven't walked away from the ram's
        // former position yet.
        const RAM_CREW_CAP = 5;
        let physicallyPresentCrew = isGateBroken ? [] : playerUnits.filter(u => 
            !u.isCommander && 
            canUseSiegeEngines(u) &&
            Math.hypot(u.x - ram.x, u.y - ram.y) < 60
        ).sort((a, b) => Math.hypot(a.x - ram.x, a.y - ram.y) - Math.hypot(b.x - ram.x, b.y - ram.y))
         .slice(0, RAM_CREW_CAP);
        let ramIsManned = physicallyPresentCrew.length > 0;

        // AUTO-REFILL: if the ram is under its 5-crew cap (a pusher died),
        // pull the nearest eligible player unit not already on ram duty and
        // send them in — the ram never sits under-crewed just because its
        // assigned pushers thinned out. Prefers reserve/ladder units over
        // pulling someone off another active job.
        // BUGFIX: gated on !isGateBroken — refilling ram crew after the gate
        // is already down would just create brand-new stuck pushers.
        if (!isGateBroken && physicallyPresentCrew.length < RAM_CREW_CAP && typeof battleEnvironment !== 'undefined' && battleEnvironment.units) {
            const alreadyOnThisRam = new Set(physicallyPresentCrew);
            const ramPusherCount = battleEnvironment.units.filter(u =>
                u.side === "player" && u.hp > 0 && u.siegeRole === "ram_pusher" && u.siegeTarget === ram
            ).length;
            const slotsOpen = RAM_CREW_CAP - ramPusherCount;
            if (slotsOpen > 0) {
                const candidates = battleEnvironment.units
                    .filter(u => u.side === "player" && u.hp > 0 && !u.isCommander && !alreadyOnThisRam.has(u) &&
                        !u.disableAICombat && // frozen units (siege start, no orders yet) must never be auto-pulled onto a ram
                        canUseSiegeEngines(u) &&
                        u.siegeRole === "ladder_carrier") // RESERVES REMOVED: infantry_reserve no longer
                                                           // exists. ranged_support is deliberately excluded
                                                           // too — shooters stay shooters in the new 3-bucket
                                                           // model (ranged / ram / ladder); only ladder-bound
                                                           // units (including those still queued waiting for a
                                                           // ladder slot) are valid ram-refill candidates.
                    .sort((a, b) => Math.hypot(a.x - ram.x, a.y - ram.y) - Math.hypot(b.x - ram.x, b.y - ram.y))
                    .slice(0, slotsOpen);
                candidates.forEach(u => {
                    u.siegeRole = "ram_pusher";
                    u.siegeTarget = ram;
                    u.hasOrders = true;
                    u.orderType = "siege_assault";
                });
            }
        }
        // Persist this tick's crew onto the ram itself so the general attacker-AI
        // block below (isOperatingEquipment check) can recognize these units as
        // busy and skip retargeting them onto a nearby enemy instead.
        ram.carriedBy = physicallyPresentCrew;
        // ---------------------------------------------

        // --- RAM PUSHER Y-CLAMP ---
        // The north tip of the battering log head sits at ram.y - 45 (draw geometry).
        // Pushers may not exceed 10px south of that tip (i.e. y < ram.y - 35) UNTIL the
        // ram begins its attack swing. This prevents crew from running in front of the ram.
        // BUGFIX: added `!isGateBroken` — this clamp fires whenever
        // `!ram.isBreaking`, which is also true the entire time the ram is
        // "retreating"/"idle" post-breach (see the RETREATING branch further
        // down, which explicitly sets ram.isBreaking = false). Since
        // physicallyPresentCrew is now already forced empty post-breach this
        // loop is a no-op either way, but the explicit guard keeps the intent
        // readable and safe even if crew detection above ever changes.
        if (!ram.isBreaking && !isGateBroken) {
            const ramNorthTip = ram.y - 45;
            const pusherFloorY  = ramNorthTip + 10; // 10 south of the tip
            physicallyPresentCrew.forEach(u => {
                if (u.y < pusherFloorY) {
                    u.y = pusherFloorY;
                    // Also kill any northward momentum so they don't jitter
                    if (u.vy < 0) u.vy = 0;
                }
            });
        }
        // --- END RAM PUSHER Y-CLAMP ---

        const exactGateY = SiegeTopography.gatePixelY;
        // SURGERY (30% retreat distance, per direct request): the ram used
        // to retreat all the way to exactGateY+150 starting from its attack
        // position at exactGateY+30 — a 120px backup. Now it only backs up
        // 30% of that original distance (36px), i.e. to exactGateY+66.
        const ORIGINAL_RETREAT_DISTANCE = 120; // exactGateY+150 minus exactGateY+30
        const safeRetreatY = exactGateY + 30 + (ORIGINAL_RETREAT_DISTANCE * 0.3);
        const ramSpeed = ram.speed || ram.stats?.speed || 0.3;

        // NOTE: intentionally NOT nulling ram.targetGate to detect "broken" —
        // that made the ram permanently forget the gate the first time it ever
        // retreated (crew died / ran off), even if the gate still had HP left.
        // Breach is now judged purely from live gate state. (isGateBroken
        // itself is now computed once, at the top of this forEach — see the
        // BUGFIX comment there — so it isn't redeclared here anymore.)
        
        if (!isGateBroken && ramIsManned) {
            if (ram.y > exactGateY+30) {
                ram.state = "moving_to_gate";
                ram.isBreaking = false;
                // SURGERY: halt instead of pushing through a large unit
                // (general/horse/elephant/camel) standing exactly where the
                // ram is about to advance into — resumes the instant that
                // unit clears out of the way.
                let nextRamY = ram.y - ramSpeed;
                if (typeof isLargeUnitBlockingEngineMove === 'function' && isLargeUnitBlockingEngineMove(ram, ram.x, nextRamY)) {
                    ram.state = "waiting_for_clearance";
                } else {
                    ram.y = nextRamY;
BattleAudio.playSiegeMovement(ram.x, ram.y, true);
                }
            } else {
                ram.y = exactGateY+30; 
                ram.state = "attacking_gate";
                ram.isBreaking = true;
                
                if (Math.random() > 0.99) { 
                    ram.targetGate.gateHP -= 235;  //slow
BattleAudio.playRamHit(ram.x, ram.y);
                    
                    if (ram.targetGate.gateHP <= 0) {
                        triggerGateBreach(ram.targetGate);
                        // Gate is destroyed — no more work for this ram, so it's
                        // safe to clear the reference now (breach already latched
                        // via triggerGateBreach's global flag + gate.gateHP <= 0).
                        ram.targetGate = null; 
                    }
                }
            }
        } else if (!isGateBroken && !ramIsManned) {
            // Gate still stands but nobody is pushing — ram simply waits in place.
            // Do NOT retreat and do NOT touch targetGate; crew can walk back up
            // and resume the attack right where it left off.
            ram.isBreaking = false;
            ram.state = "idle_unmanned";
        } else {
            // RETREATING — gate is genuinely broken (real HP <= 0 or global flag)
            ram.isBreaking = false;
            ram.hasOrders = true;  
            ram.stuckTicks = 0;
            if (ram.path) ram.path = null;

            if (ram.y < safeRetreatY) {
                // SURGERY: halt instead of pushing through a large unit
                // standing exactly where the ram is about to retreat into —
                // resumes the instant that unit clears out of the way.
                let nextRamY = ram.y + (ramSpeed * 0.5);
                if (typeof isLargeUnitBlockingEngineMove === 'function' && isLargeUnitBlockingEngineMove(ram, ram.x, nextRamY)) {
                    ram.state = "retreating_blocked";
                } else {
                    ram.state = "retreating";
                    ram.y = nextRamY;
                }
            } else {
                ram.state = "idle";
                ram.hasOrders = false; 
            }
        }
    });

// RAM SHIELD INTERCEPTION
    for (let i = battleEnvironment.projectiles.length - 1; i >= 0; i--) {
        let p = battleEnvironment.projectiles[i];
        if (p.stuck) continue; 

        // Enemies hitting from the front, OR Players hitting the back (5% chance)
        let hitChance = (p.side === "enemy" && p.vy > 0) ? 1.0 : ((p.side === "player" && Math.random() < 0.05) ? 1.0 : 0);

        if (hitChance > 0) {
            for (let ram of siegeEquipment.rams) {
                if (ram.hp <= 0 || ram.shieldHP <= 0) continue;

                const shieldX = ram.x + (ram.shieldOffsetX || 0);
                const shieldY = ram.y + (ram.shieldOffsetY || 0);

                if (Math.abs(p.x - shieldX) < (ram.shieldW || 54) / 2 && Math.abs(p.y - shieldY) < (ram.shieldH || 28) / 2) {
                    ram.shieldHP -= p.attackerStats?.missileBaseDamage || 10;
                    
                    // ---> VISUAL STICKING <---
                    if (battleEnvironment.groundEffects && battleEnvironment.groundEffects.length < 500) {
                        let role = p.attackerStats?.role || "";
                        let isBolt = role === "crossbow" || role === "crossbowman";
                        let isJavelin = p.attackerStats?.name === "Javelinier";
                        let efType = isJavelin ? "javelin" : isBolt ? "bolt" : "arrow";
                        
                        battleEnvironment.groundEffects.push({
                            type: efType, x: p.x, y: p.y, angle: Math.atan2(p.vy, p.vx),
                            stuckOnStructure: true, structureTile: 98, timestamp: Date.now()
                        });
                    }

                    battleEnvironment.projectiles.splice(i, 1);
                    if (ram.shieldHP <= 0) ram.shieldHP = 0;
                    break;
                }
            }
        }
    }

   // ============================================================================
    // B. LADDER ASSAULT LOGIC (UPGRADED FLY-SWARM AI)
    // ============================================================================
    let undeployedLadders = siegeEquipment.ladders.filter(l => !l.isDeployed && l.hp > 0);

    // 1. Force the  Ladder Fanatics to swarm undeployed ladders
    playerUnits.forEach(u => {
        if (u.siegeRole === "ladder_fanatic") {
            if (undeployedLadders.length > 0) {
                // Find the absolute closest ladder
                let closestLadder = undeployedLadders.reduce((prev, curr) => 
                    Math.hypot(curr.x - u.x, curr.y - u.y) < Math.hypot(prev.x - u.x, prev.y - u.y) ? curr : prev
                );
                
               // Only update the target if the unit does not already have a stable one pointing here
                let distToLadder = Math.hypot(u.x - closestLadder.x, u.y - closestLadder.y);
                if (!u.target || u.target.isDummy === undefined || distToLadder > 80) {
                    u.target = { x: closestLadder.x, y: closestLadder.y, isDummy: true };
                }
                u.state = "moving";
                u.hasOrders = true;
                u.disableAICombat = true;
                u.orderType = "ladder_crew";
            } else {
                // Ladders are up or destroyed! Revert back to bloodthirsty mode.
                u.siegeRole = "normal";
                u.disableAICombat = false;
                u.orderType = "siege_assault";
            }
        }
    });

// 2. Process physical ladder movement and deployment
    siegeEquipment.ladders.forEach(ladder => {
        if (ladder.hp <= 0 || ladder.isDeployed) return;

        // A. Assign exactly 2 crew members if we have shortages
        if (ladder.crewAssigned.length < 2) {
            let available = playerUnits.filter(u => 
                u.orderType === "ladder_crew" && 
                u.hp > 0 && 
                !u.onWall &&
                !siegeEquipment.ladders.some(l => l.crewAssigned.includes(u)) // Not already on a ladder
            );
            
            // Push closest available men into the crew
            for (let i = 0; i < available.length && ladder.crewAssigned.length < 2; i++) {
                ladder.crewAssigned.push(available[i]);
            }
        }

        // B. Filter out dead crew
        ladder.crewAssigned = ladder.crewAssigned.filter(u => u.hp > 0);

// C. Only units that CAN legally operate siege equipment AND are within 28px
        //    (tight body-contact radius matching the ladder's visual width ~25px).
        //    canUseSiegeEngines() hard-blocks archers/ranged without a siege role,
        //    preventing them from being dragged along when standing nearby.
        let activePushers = playerUnits.filter(u => 
            !u.isCommander &&
            !u.onWall &&
            canUseSiegeEngines(u) &&
            Math.hypot(u.x - ladder.x, u.y - ladder.y) < 28
        );

        let targetPixelY = SiegeTopography.wallPixelY - 5;
        
        // D. Move only while someone is actually touching it (crew required again)
        if (activePushers.length > 0 && ladder.y > targetPixelY) {
            // SURGERY: halt instead of pushing through a large unit
            // (general/horse/elephant/camel) standing exactly where this
            // ladder is about to advance into — resumes the instant that
            // unit clears out of the way. Pushers hold with it rather than
            // getting dragged into the same spot this tick.
            let nextLadderY = ladder.y - ladder.speed;
            if (typeof isLargeUnitBlockingEngineMove === 'function' && isLargeUnitBlockingEngineMove(ladder, ladder.x, nextLadderY)) {
                ladder.state = "waiting_for_clearance";
            } else {
                ladder.y = nextLadderY;
                ladder.lastY = ladder.y;
               BattleAudio.playSiegeMovement(ladder.x, ladder.y, true); 
                // Pull touching pushers along with the ladder.
                // While pushing (pre-deploy), unit targets the ladder centroid so they
                // converge toward it rather than drifting off to the side.
                // After deployment the normal AI resumes (this block no longer runs).
                activePushers.forEach(u => {
                    u.target = { x: ladder.x, y: ladder.y, isDummy: true }; // centroid
                    u.y -= ladder.speed;
                });
            }
        }

        if (ladder.y <= targetPixelY && !ladder.isDeployed) {
            deployAssaultLadder(ladder);
            return; 
        }
    });
// ============================================================================
    // C. MANTLET, LADDER, TREBUCHET & BALLISTA PROJECTILE INTERCEPTION
    // ============================================================================
    for (let i = battleEnvironment.projectiles.length - 1; i >= 0; i--) {
        let p = battleEnvironment.projectiles[i];
        if (p.stuck) continue;

        let hitEngine = false;

        // 1. MANTLET LOGIC (Directional Blocking)
        let mantletHitChance = (p.side === "enemy" && p.vy > 0) ? 1.0 : ((p.side === "player" && Math.random() < 0.05) ? 1.0 : 0);
        if (mantletHitChance > 0) {
            for (let m of siegeEquipment.mantlets) {
                if (m.hp > 0 && Math.abs(p.x - m.x) < 30 && Math.abs(p.y - m.y) < 20) {
                    if (Math.random() < 0.50) { 
                        m.hp -= p.attackerStats?.missileBaseDamage || 10;
                        hitEngine = true;
                        break; 
                    }
                }
            }
        }

        // 2. LADDERS, TREBUCHETS, BALLISTAS (Bulky Multi-Directional Hitboxes)
        if (!hitEngine) {
            // "attacker projectiles only have a 5% chance to stick where enemy projectiles have a 80 % chance to stick"
            let stickChance = (p.side === "enemy") ? 0.80 : 0.25;

            if (Math.random() <= stickChance) {
                // Check Ladders
                for (let l of siegeEquipment.ladders) {
                    if (l.hp > 0 && Math.abs(p.x - l.x) < 25 && Math.abs(p.y - l.y) < 45) {
                        l.hp -= p.attackerStats?.missileBaseDamage || 10;
                        hitEngine = true; break;
                    }
                }
// Check Trebuchets
                if (!hitEngine) {
                    for (let t of siegeEquipment.trebuchets) {
                        if (t.hp > 0 && Math.abs(p.x - t.x) < 25 && Math.abs(p.y - t.y) < 40) {
                            if (p.startX === t.x && p.startY === t.y) continue; // <--- ADD THIS FIX
                            t.hp -= p.attackerStats?.missileBaseDamage || 10;
                            hitEngine = true; break;
                        }
                    }
                }
                // Check Ballistas
                if (!hitEngine) {
                    for (let b of siegeEquipment.ballistas) {
                        if (b.hp > 0 && Math.abs(p.x - b.x) < 20 && Math.abs(p.y - b.y) < 25) {
                            if (p.startX === b.x && p.startY === b.y) continue; // <--- ADD THIS FIX
                            b.hp -= p.attackerStats?.missileBaseDamage || 10;
                            hitEngine = true; break;
                        }
                    }
                }
            }
        }

        if (hitEngine) {
            // ---> VISUAL STICKING <---
            if (battleEnvironment.groundEffects && battleEnvironment.groundEffects.length < 500) {
                let role = p.attackerStats?.role || "";
                let isBolt = role === "crossbow" || role === "crossbowman";
                let isJavelin = p.attackerStats?.name === "Javelinier";
                let efType = isJavelin ? "javelin" : isBolt ? "bolt" : "arrow";
                
                battleEnvironment.groundEffects.push({
                    type: efType, x: p.x, y: p.y, angle: Math.atan2(p.vy, p.vx),
                    stuckOnStructure: true, structureTile: 98, timestamp: Date.now()
                });
            }

            battleEnvironment.projectiles.splice(i, 1); 
        }
    }
// ============================================================================
    // TREBUCHET LOGIC & CREW AI MANAGER
    // ============================================================================
// ============================================================================
// TREBUCHET LOGIC & VISUAL CREW (NO REAL UNIT REQUIREMENT)
// ============================================================================
siegeEquipment.trebuchets.forEach(treb => {
    if (treb.hp <= 0) {
        treb.isManned = false;
        return;
    }

    const isEnemyTreb = treb.side === "enemy";
    const targetPool = isEnemyTreb
        ? playerUnits
        : (wallEnemies.length > 0 ? wallEnemies : allAliveEnemies);

    // Crew is visual only now. No live-unit presence check.
    treb.isManned = true;
    treb.cooldown = Math.max(0, treb.cooldown - 1);

    if (targetPool.length > 0 && treb.cooldown <= 0) {
        treb.cooldown = treb.fireRate;

        let target = targetPool[Math.floor(Math.random() * targetPool.length)];
        let dx = target.x - treb.x;
        let dy = target.y - treb.y;
        let dist = Math.hypot(dx, dy);
        let speed = 6;

        battleEnvironment.projectiles.push({
            x: treb.x, y: treb.y,
            vx: (dx / dist) * speed, vy: (dy / dist) * speed,
            startX: treb.x, startY: treb.y,
            maxRange: 1000,
            attackerStats: {
                role: "bomb",
                missileAPDamage: 1,
                missileBaseDamage: 35,
                name: "Trebuchet Boulder",
                currentStance: "statusrange",
                isRanged: true
            },
            side: treb.side,
            projectileType: "Bomb",
            isFire: false
        });

 
    }
});

 
// ============================================================================
// BALLISTA LOGIC & VISUAL 1-MAN CREW
// ============================================================================
siegeEquipment.ballistas.forEach(bal => {
    if (bal.hp <= 0) {
        bal.isManned = false;
        return;
    }

    const targetPool = playerUnits;

    // Crew is visual only now. No live-unit presence check.
    bal.isManned = true;
    bal.cooldown = Math.max(0, bal.cooldown - 1);

    if (targetPool.length > 0) {
        let target = targetPool.reduce((prev, curr) =>
            Math.hypot(curr.x - bal.x, curr.y - bal.y) < Math.hypot(prev.x - bal.x, prev.y - bal.y) ? curr : prev
        );

        let rawAngle = Math.atan2(target.y - bal.y, target.x - bal.x);

        let minAngle = 10 * Math.PI / 180;
        let maxAngle = 170 * Math.PI / 180;

        if (rawAngle < 0) {
            rawAngle = (rawAngle > -Math.PI / 2) ? minAngle : maxAngle;
        }

        bal.aimAngle = Math.max(minAngle, Math.min(maxAngle, rawAngle));

        if (bal.cooldown <= 0) {
            bal.cooldown = bal.fireRate;
            let speed = 15;

            let projVx = Math.cos(bal.aimAngle) * speed;
            let projVy = Math.sin(bal.aimAngle) * speed;

            battleEnvironment.projectiles.push({
                x: bal.x, y: bal.y,
                vx: projVx, vy: projVy,
                startX: bal.x, startY: bal.y,
                maxRange: 700,
                attackerStats: {
                    role: "crossbowman",
                    missileAPDamage: 12,
                    missileBaseDamage: 30,
                    name: "Crossbowman",
                    currentStance: "statusrange",
                    isRanged: true
                },
                side: bal.side,
                projectileType: "arrow",
                isFire: false
            });

// Point to the instance created in soundeffects.js
BattleAudio.playCrossbowRelease(bal.x, bal.y);
        }
    }
});
	// ============================================================================
// 2. DEFENDER AI (ENEMY)
// ============================================================================
if (siegeAITick % 6 === 0) {
    allAliveEnemies.forEach(u => {
        
        if (u.siegeRole === "treb_crew") return;
        
        let roleStr = String((u.stats?.role || "") + " " + (u.unitType || "") + " " + (u.stats?.name || "")).toLowerCase();
        let isLarge = u.stats?.isLarge || roleStr.match(/(cav|horse|mount|camel|eleph)/);

        // ---> PIN WALL DEFENDERS TO THEIR POSTS (Upgraded Aggro) <---
        if (u.siegeRole === "wall_defender") {
            let localThreats = battleEnvironment.units.filter(p => 
                p.side === "player" && p.hp > 0 && 
                Math.hypot(p.x - u.x, p.y - u.y) < 250
            );
            
            if (localThreats.length === 0) {
                let distToStart = Math.hypot(u.startX - u.x, u.startY - u.y);
                if (distToStart > 10) {
                    u.target = { x: u.startX, y: u.startY, isDummy: true }; 
                    u.state = "moving";
                } else {
                    u.state = "idle";
                }
                u.hasOrders = true; 
                return; 
            }
        }

        // ---> HOLD RESERVE UNTIL BREACH <---
        // ---> HOLD RESERVE UNTIL BREACH <---
        if (u.siegeRole === "gate_reserve") {
            let southGate = overheadCityGates.find(g => g.side === "south");
            if (southGate && !southGate.isOpen && southGate.gateHP > 200) {
                let emergencyThreat = playerUnits.find(p => Math.hypot(p.x - u.x, p.y - u.y) < 100);
                if (!emergencyThreat) {
                    u.target = { x: u.startX, y: u.startY, isDummy: true };
                    u.hasOrders = true;
                    return;
                }
            }
        }

        if (!isGateBreached) {
            // GATE INTACT
if (u.onWall) {
                if (Math.random() < 0.2 && (u.state === "idle" || !u.hasOrders)) {
                    u.target = { 
                        x: SiegeTopography.gatePixelX + (Math.random() - 0.5) * 600, 
                        y: SiegeTopography.wallPixelY - 100, 
                        isDummy: true 
                    };
                    u.state = "moving";
                    u.hasOrders = true;
                }
        } else {
                // ---> NEW SURGERY: WIDE PATROL & PROXIMITY AGGRO <---
                let attackRange = isSiegeRangedDefender(u) ? (u.stats.range || 400) : 50;
                let closestAttacker = null;
                let minDist = Infinity;
                
// 1. Scan for nearby enemies to aggro — GROUND ONLY, skip wall climbers
                for (let i = 0; i < playerUnits.length; i++) {
                    let attacker = playerUnits[i];
                    // Never chase attackers who are on the wall scaffold — defenders can't follow them up there
                    if (attacker.onWall) continue;
                    let dist = Math.hypot(u.x - attacker.x, u.y - attacker.y);
                    if (dist < minDist) { minDist = dist; closestAttacker = attacker; }
                }

                // 2. If a ground enemy is within range, attack immediately
                if (closestAttacker && minDist <= attackRange) {
                    u.target = closestAttacker;
                    u.state = "attacking";
                    u.hasOrders = true;
                }
                // 3. Otherwise, perform a wide patrol behind the wall
                else {
                    let isPatrolling = (u.state === "moving" && u.target && u.target.isDummy);
                    
                    if (u.state === "idle" || !u.hasOrders || !isPatrolling) {
                        // Patrol tightly around the gate instead of 80% of the
                        // full map width — that width was why defenders kept
                        // drifting far north on every idle tick regardless of
                        // where deploySiegeDefenders spawned them; this ties
                        // patrol to the same gate anchor the spawn point uses.
                        // SURGERY: was wallPixelY - 150 - random(100), a
                        // separate north-biased formula that fought the
                        // spawn point every time a unit went idle. Now reads
                        // the same shared SiegeTopography.defenderRallyPixelY
                        // as the spawn/rally logic, with a small jitter band
                        // instead of a one-directional (always more-north) offset.
                        let spreadWidth = 300; // was BATTLE_WORLD_WIDTH * 0.8
                        let targetX = SiegeTopography.gatePixelX + ((Math.random() - 0.5) * spreadWidth);
                        let targetY = SiegeTopography.defenderRallyPixelY + ((Math.random() - 0.5) * 100);

                        u.target = { x: targetX, y: targetY, isDummy: true };
                        u.state = "moving";
                        u.hasOrders = true;
                    } else {
                        // Stop moving once they reach their random patrol waypoint
                        let distToTarget = Math.hypot(u.x - u.target.x, u.y - u.target.y);
                        if (distToTarget < 30) {
                            u.state = "idle";
                            u.target.x = u.x;
                            u.target.y = u.y;
                            u.vx = 0; 
                            u.vy = 0;
                        }
                    }
                }
		}}
		else {
            // GATE IS BROKEN: FALLBACK TO PLAZA OR ATTACK
            // Anchored to SiegeTopography.defenderRallyPixelY (the shared
            // anchor) rather than plazaPixelY (wallPixelY - 600, the old
            // far-north point that caused the same drift bug as the patrol
            // logic above) or a locally-hardcoded gatePixelY - 200 — this
            // keeps the post-breach rally point consistent with wherever
            // deploySiegeDefenders actually spawns defenders now.
            let plazaX = SiegeTopography.gatePixelX;
            let plazaY = SiegeTopography.defenderRallyPixelY;
            let distToPlaza = Math.hypot(plazaX - u.x, plazaY - u.y);

            // ---> LARGE UNITS EARLY PLAZA RETURN <---
            if (isLarge && distToPlaza > 150) {
                // Force cavalry/elephants out of the gate choke point immediately
                u.target = {
                    x: plazaX + (Math.random() - 0.5) * 400, 
                    y: plazaY + (Math.random() - 0.5) * 200, 
                    isDummy: true
                };
                u.state = "moving";
                u.hasOrders = true;
            } else {
                // Standard Infantry Aggro / Hysteresis
                let closestAttacker = null;
                let minDist = Infinity;
                
                let currentTargetDist = (u.target && !u.target.isDummy && u.target.hp > 0) 
                    ? Math.hypot(u.x - u.target.x, u.y - u.target.y) 
                    : Infinity;
                
                for (let i = 0; i < playerUnits.length; i++) {
                    let attacker = playerUnits[i];
                    let dist = Math.hypot(u.x - attacker.x, u.y - attacker.y);
                    if (dist < minDist) { minDist = dist; closestAttacker = attacker; }
                }

                let stickToCurrentTarget = (currentTargetDist < minDist + 40) && currentTargetDist < 300;

                if (stickToCurrentTarget) {
                    u.state = "attacking"; 
                } else if (closestAttacker && minDist < 400) { 
                    u.target = closestAttacker; 
                    u.state = "moving";
                    u.hasOrders = true;
                } else if (distToPlaza > 250 && !u.onWall) {
                    u.target = {
                        x: plazaX + (Math.random() - 0.5) * 350, 
                        y: plazaY + (Math.random() - 0.5) * 200, 
                        isDummy: true
                    };
                    u.state = "moving";
                    u.hasOrders = true;
                } else if (u.state === "idle" || !u.hasOrders) {
                    u.target = { x: u.x + (Math.random() - 0.5) * 20, y: u.y + (Math.random() - 0.5) * 20, isDummy: true };
                    u.state = "idle";
                    u.hasOrders = true;
                }
            }
        }

        // ========================================================================
        // ---> ABSOLUTE LAVA OVERRIDE (NEVER WALK SOUTH OF THIS LINE) <---
        // ========================================================================
        let lavaBoundaryY = SiegeTopography.gatePixelY + 5; // <<<<<<< TWEAK BUFFER HERE

if (u.y > lavaBoundaryY) {
            u.target = { x: u.x, y: SiegeTopography.wallPixelY - 120, isDummy: true };
            u.state = "moving";
            u.hasOrders = true;
        }
        // 2. If their target is past the line, intercept their movement
        else if (u.target && u.target.y > lavaBoundaryY) {
            let isRanged = roleStr.includes("ranged") || roleStr.includes("archer");
            
            if (isRanged) {
                // Ranged units keep their target so they can shoot down, but we kill their velocity at the edge
                if (u.y > lavaBoundaryY - 20) {
                    u.state = "idle";
                    u.vx = 0; 
                    u.vy = 0;
                }
            } else {
                // Melee units must abandon the target and hold the line at the edge
                u.target = { x: u.target.x, y: lavaBoundaryY - 15, isDummy: true };
                if (u.state === "attacking") u.state = "moving";
                u.hasOrders = true;
            }
        }

    });

    // ========================================================================
    // ---> LAST SIEGE DEFENDER RESORT <---
    // Runs after every branch above has had its turn, path-agnostic — same
    // idea as the [STUCK-WATCH] debug detector further up: don't assume
    // WHICH code path put a defender far from the gate (spawn math, the
    // patrol branch, the post-breach fallback, or something not yet found),
    // just catch the end state and correct it. Backstop only — 600px is 2x
    // the 300px patrol spreadWidth above, so this stays quiet during normal
    // patrol movement and only fires once something has actually gone wrong.
    // ========================================================================
    if (typeof SiegeTopography !== 'undefined') {
        const RESORT_TRIGGER_DIST = 600;
        const RESORT_BAND_X = 300; // matches patrol spreadWidth above
        const RESORT_BAND_Y = 100; // matches patrol depth range above

        allAliveEnemies.forEach(u => {
            if (u.isCommander) return;
            let distFromGate = Math.hypot(u.x - SiegeTopography.gatePixelX, u.y - SiegeTopography.gatePixelY);
            if (distFromGate > RESORT_TRIGGER_DIST) {
                if (window.__SIEGE_DEBUG_GATE__) {
                    console.log("[LAST-RESORT] pulling defender back to gate", {
                        id: u.id,
                        distFromGate: Math.round(distFromGate),
                        from: { x: Math.round(u.x), y: Math.round(u.y) }
                    });
                }
                u.target = {
                    x: SiegeTopography.gatePixelX + (Math.random() - 0.5) * RESORT_BAND_X,
                    y: (SiegeTopography.wallPixelY - 150) + (Math.random() - 0.5) * RESORT_BAND_Y,
                    isDummy: true
                };
                u.state = "moving";
                u.hasOrders = true;
            }
        });
    }
}
// ============================================================================
// 3. ATTACKER AI (PLAYER) — REMOVED
// ============================================================================
// BUGFIX ("ladder climbers approach, get yanked far south, then come back
// to try again"): this entire block used to be a SECOND, fully independent
// siege-attacker AI, running on its own "every 4 ticks" cadence completely
// separate from processTacticalOrders (battlefield_commands.js) and
// executeSiegeAssaultAI's role assignment (also battlefield_commands.js,
// invoked from autoAttack.js). Two independent systems were both writing
// to the same unit.target/unit.state/unit.hasOrders every few ticks, each
// with its OWN idea of who counts as reserve/cavalry/equipment-crew:
//   - This block classified "equipment crew" as `u.id % 5 === 0` — units
//     were sorted into rams/ladders/ranged support based on the low digit
//     of a random ID, with zero relation to what siegeRole the OTHER
//     system (executeSiegeAssaultAI) had actually assigned them.
//   - This block also maintained its OWN separate "reserve line" standing
//     spot (wallY + 450, well south of the wall) independent of the
//     cavalry_reserve/camp mechanism that used to live in
//     battlefield_commands.js.
// The result: a unit mid-walk to a ladder under one system's orders could
// have its target silently overwritten by this block on its own
// independent tick, get rerouted to this block's reserve line or back
// toward a ram/ladder base, then get reclaimed by the other system later —
// which is exactly the "approach, get pulled far away, come back and try
// again" loop being reported. It was also the last real source of the
// "reserve" concept in the codebase (see executeSiegeAssaultAI in
// battlefield_commands.js, which has been rewritten to remove reserves
// entirely — every non-ranged, non-ram unit is now a ladder crew member,
// either actively climbing or queued waiting at a ladder for a free slot).
// processTacticalOrders (battlefield_commands.js) already owns targeting/
// movement for every siege_assault/seek_engage/ladder_crew unit — this
// file's OWN interval-driven re-targeting of the same units was pure
// redundant duplication of that responsibility, not a distinct feature.
// The ram-crew management earlier in this function (crew presence,
// Y-clamp, auto-refill, gate-breach release) is untouched — that logic is
// specific to ram physics and has no equivalent elsewhere.
}

function applyDamageToGate(gateId, damageAmount) {
    // Find the specific gate being attacked
    const gateIndex = battleEnvironment.cityGates.findIndex(g => g.id === gateId || g.side === gateId);
    if (gateIndex === -1) return; 

    const targetGate = battleEnvironment.cityGates[gateIndex];
    targetGate.gateHP -= damageAmount;

    // Check for destruction
    if (targetGate.gateHP <= 0) {
        targetGate.isOpen = true; // Signals render to draw open/destroyed

        // STEP 1: Erase the collision
        let bounds = targetGate.bounds;
        if (bounds) {
            for (let x = bounds.x0; x <= bounds.x1; x++) {
                for (let y = bounds.y0; y <= bounds.y1; y++) {
                    let isPillar = (x === bounds.x0 || x === bounds.x1);
                    if (!isPillar && battleEnvironment.grid[x] && battleEnvironment.grid[x][y] !== undefined) {
                        battleEnvironment.grid[x][y] = 1; // 1 = Road
                    }
                }
            }
        }
    }
}

function deployAssaultLadder(ladder) {
    ladder.isDeployed = true;
    
    if (ladder.carriedBy && isNeverLadderCarrier(ladder.carriedBy)) {
        ladder.carriedBy.disableAICombat = false;
        ladder.carriedBy = null;
    }

    let tileX = Math.floor(ladder.x / BATTLE_TILE_SIZE);
    let tileY = Math.floor(ladder.y / BATTLE_TILE_SIZE); 

    // ---> SURGERY 1: Paint the ladder deep into the dirt (y + 6) so ground troops can actually step on it!
    for (let x = tileX - 2; x <= tileX + 2; x++) {
        for (let y = tileY - 8; y <= tileY + 6; y++) {
            if (battleEnvironment.grid[x] && battleEnvironment.grid[x][y] !== undefined) {
                battleEnvironment.grid[x][y] = 9; // 9 = Ladder Tile
            }
        }
    }

    if (typeof cityLadders !== 'undefined') {
        cityLadders.push({ x: ladder.x, y: ladder.y - 20 });
    }

    // SURGERY: Remove the '- 20' offset so it carves the TRUE outer lip of the wall
    let wallTileY = Math.floor(SiegeTopography.wallPixelY / BATTLE_TILE_SIZE); 
    prepareLadderLanding(ladder, wallTileY);
}