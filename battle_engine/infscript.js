// =========================================================================
// SURGERY: 4-DIRECTIONAL CENTROID-BASED AIM LOCK
// Used by the Repeater Crossbowman and Rocket cart below (and mirrored
// 1:1 in cavscript.js for the camel-cannon). Replaces the earlier
// battleSpawnAssignment.forward-based guess, which only ever picked
// up/down — per direct request, corner spawns can now put both armies
// side-by-side (east/west) instead of north/south, so a vertical-only
// lock could aim at empty sky in that layout. Looks at where the ENEMY
// SIDE's units currently are ON AVERAGE (their centroid) and locks
// toward whichever axis (X or Y) has the bigger gap: far apart
// vertically -> lock up/down as before; far apart horizontally -> stay
// in the normal side view, but pointed (via unit.facingDir, see each
// call site) at the correct side. battleSpawnAssignment.forward is kept
// only as the last-resort fallback for the practically-never-reached
// case where there are no living enemy units to read a position from.
// =========================================================================
function _computeCentroidLock(unit, side) {
    let fallbackUp = (side === "player");
    if (window.battleSpawnAssignment && window.battleSpawnAssignment[side]) {
        fallbackUp = window.battleSpawnAssignment[side].forward.y < 0;
    }
    if (!unit || typeof unit.x !== 'number' || typeof unit.y !== 'number' ||
        typeof battleEnvironment === 'undefined' || !battleEnvironment.units) {
        return { axis: 'y', dir: fallbackUp ? -1 : 1 };
    }
    const enemySide = (side === "player") ? "enemy" : "player";
    let sumX = 0, sumY = 0, n = 0;
    for (let i = 0; i < battleEnvironment.units.length; i++) {
        const u = battleEnvironment.units[i];
        if (u.side === enemySide && u.hp > 0) { sumX += u.x; sumY += u.y; n++; }
    }
    if (n === 0) return { axis: 'y', dir: fallbackUp ? -1 : 1 };
    const deltaX = (sumX / n) - unit.x;
    const deltaY = (sumY / n) - unit.y;
    // ADDITIVE — per direct request ("NE/NW/SE/SW quadrants... rotate
    // the weapon based on which quadrant", later widened to "no longer
    // restricted to 8 quadrants... rotate relative to what they're
    // aiming"). Everything above this point is 100% unchanged; these
    // two extra fields are appended to the SAME return object so every
    // existing consumer (Repeater/Rocket here, the Cannon in
    // cavscript.js) that only destructures {axis, dir} is completely
    // unaffected — only new call sites that read .angle/.quadrant see
    // this.
    //
    // .angle — continuous signed aim angle in radians, NOT bucketed.
    // atan2 with a non-negative x argument always returns a value in
    // [-PI/2, PI/2], so this is "perpendicular-clamped" by construction
    // (0 = level/side, +PI/2 = straight down, -PI/2 = straight up) with
    // no extra clamping code needed. Used by the continuous-rotation
    // weapons (crossbow/cannon — see _easeAimAngle just below).
    // .quadrant — coarse 8-way bucket (N/S/E/W or NE/NW/SE/SW), kept
    // for the weapons that still snap between a small set of named
    // poses (Rocket's tube) rather than rotating continuously.
    // DIAG_BAND: ratio (smaller delta / larger delta) above which the
    // aim counts as "genuinely diagonal" rather than axis-dominant —
    // 0.5 means the minor axis has to be at least half the major axis,
    // a middling choice with no in-game reference to tune against yet.
    const angle = Math.atan2(deltaY, Math.abs(deltaX));
    let quadrant;
    const DIAG_BAND = 0.5;
    const adx = Math.abs(deltaX), ady = Math.abs(deltaY);
    if (adx < 1e-6 && ady < 1e-6) {
        quadrant = fallbackUp ? 'N' : 'S';
    } else {
        const ratio = Math.min(adx, ady) / (Math.max(adx, ady) || 1e-6);
        const ns = deltaY < 0 ? 'N' : 'S';
        const ew = deltaX < 0 ? 'W' : 'E';
        quadrant = (ratio >= DIAG_BAND) ? (ns + ew) : ((adx > ady) ? ew : ns);
    }
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
        return { axis: 'x', dir: deltaX < 0 ? -1 : 1, deltaX, deltaY, angle, quadrant }; // -1 = west/left, 1 = east/right
    }
    return { axis: 'y', dir: deltaY < 0 ? -1 : 1, deltaX, deltaY, angle, quadrant }; // -1 = up (north), 1 = down (south)
}

// ─────────────────────────────────────────────────────────────────────
// CONTINUOUS AIM-ANGLE EASING — added per direct request: bows/
// crossbows and cannons should rotate freely toward wherever they're
// actually aiming rather than snapping between fixed quadrant poses,
// turning at a capped angular speed so heavier weapons visibly lag
// and catch up instead of instantly snapping frame-to-frame ("a slow
// speed buffer based on mass"). Persists the currently-rendered angle
// on the unit under `stateKey` (a distinct property per weapon system
// sharing a unit, e.g. "_crossbowAimAngle" vs cavscript.js's
// "_cannonAimAngle") and steps it toward `targetAngle` by at most
// `maxStep` radians/frame. Both angles are already confined to
// [-PI/2, PI/2] by _computeCentroidLock's atan2 construction, so the
// difference here is always the short way round — no modular
// wraparound handling needed.
// ─────────────────────────────────────────────────────────────────────
function _easeAimAngle(unit, stateKey, targetAngle, maxStep) {
    if (!unit) return targetAngle;
    if (typeof unit[stateKey] !== 'number' || isNaN(unit[stateKey])) unit[stateKey] = targetAngle;
    const diff = targetAngle - unit[stateKey];
    const step = Math.max(-maxStep, Math.min(maxStep, diff));
    unit[stateKey] += step;
    return unit[stateKey];
}

function drawInfantryUnit(ctx, x, y, moving, frame, factionColor, type, isAttacking, side, unitName, isFleeing, cooldown, unitAmmo, unit, reloadProgress) {
	
	if (!unit || !unit.stats) {
        // If the unit object is missing or stats aren't loaded, 
        // return early to prevent the crash.
        return; 
    }
	
	ctx.save();
    ctx.translate(x, y);

    // ── DIRECTIONAL FLIP ─────────────────────────────────────────
    // facingDir 1 = right (natural), -1 = left (full sprite mirror)
    // ctx.scale(-1,1) flips the entire sprite — no per-element changes needed
    ctx.scale(unit.facingDir || 1, 1);
    // ═══════════════════════════════════════════════════════════════════
    // VERTICAL FACING (bird's-eye up/down overhaul) — SESSION STATUS
    // ═══════════════════════════════════════════════════════════════════
    // unit.facingDirY is computed every frame in troop_draw.js's
    // drawBattleUnits() direction block (hysteresis-gated, same quality
    // bar as the existing left/right facingDir). Values:
    //    1  → unit moving DOWN-screen / toward the player camera.
    //         "Front view" — melee weapons point down-screen and stay
    //         drawn on the SAME layer order as today (weapon after body
    //         = on top), because a weapon aimed at the viewer is closer
    //         to the camera than the body, same as the existing side view.
    //         DONE — see PORTED below, essentially complete.
    //   -1  → unit moving UP-screen / into the canvas, away from camera.
    //         "Back view" — the weapon is aimed AWAY from the viewer,
    //         i.e. further from the camera than the body, so it must be
    //         drawn UNDERNEATH the body (before it) — opposite z-order
    //         from the down case. IN PROGRESS this session — see
    //         BACKSHOT / UP below for what exists so far.
    //    0  → not in vertical mode. Render normal side view (unchanged).
    //
    // Siege crew (ram_pusher/ladder_carrier/ladder_fanatic) are a
    // deliberate, permanent exception: troop_draw.js never computes
    // facingDirY for them (product decision, not a gap) — they keep
    // horizontal-only facing forever.
    //
    // WHY MELEE WAS EASY: the body/head/legs art in this file is already
    // drawn basically front-on (symmetric torso triangle, round head,
    // centered legs) — it was never a true side-profile. The only thing
    // that looked wrong when a unit moved vertically was that its WEAPON
    // still thrust/swung along the horizontal axis. Every melee fix below
    // is localized entirely to each weapon's own aim coordinates.
    //
    // RANGED WAS HARDER, for a specific reason worth remembering: a bow's
    // limb shape has no single "reach" coordinate to swap the way a spear
    // does — instead TWO separate techniques are needed together (see the
    // archer branch's own comments for the full write-up):
    // (1) an ambient rotate-the-whole-shape wrapper for the limbs+string,
    // (2) a manual rotate-a-point-around-the-pivot helper for anything
    // (arrow, hand) drawn in its OWN transform after that wrapper closes.
    // Mixing these up — e.g. redefining the phase-logic's hand-position
    // variables at the source, the technique melee weapons used — would
    // rotate the string TWICE (once from the redefinition, once from the
    // ambient wrapper) and produce a wrong result. This distinction is
    // the main thing to carry into any future ranged-weapon work.
    // Note: after visual feedback, the archer's down-angle changed from
    // a full 90° (straight down, looked disconnected) to 45° with the
    // whole assembly's pivot lowered ~30px — see that branch's own
    // comments (DOWN_AIM_ANGLE / DOWN_Y_OFFSET) for the exact numbers,
    // and horse_archer in cavscript.js for the matching cavalry fix.
    //
    // SOME WEAPONS NEEDED A THIRD TECHNIQUE — adding a wrapper where
    // NONE existed before, rather than redirecting an existing one or
    // swapping axes at the source. Used for "Firelance" (shaft/tubes/
    // spearhead/flame all drawn with plain absolute coordinates, no
    // rotation at all in the original code) and the Repeater crossbow's
    // render call (translate-only, no rotation). In both cases, wrapping
    // the whole existing, unmodified drawing block in a NEW
    // ctx.save()/ctx.rotate()/... was lower-risk than hand-editing many
    // scattered `(N+thrust)*dir`-style coordinates one at a time. Worth
    // trying this first on any future weapon that turns out not to
    // already have a rotation wrapper to piggyback on.
    //
    // PORTED (facingDirY===1 fully handled) — essentially all infantry
    // melee AND ranged weapon types, following a full completeness
    // sweep of every `else if (type === ...)` / unitName-dispatched
    // branch in this file:
    //   Melee:
    //   • type "spearman"      — both spear AND glaive weapon variants.
    //   • type "sword_shield"  — saber redirected. Shield's z-order was
    //     LATER changed per user feedback — see SHIELD PRIORITY note
    //     below, applies to peasant's shields too.
    //   • type "peasant"       — all 10 weapon variants (switch on
    //     weaponType 0-9) fixed via ONE shared translate+rotate change,
    //     since they all draw in that one rotated local frame.
    //   • type "two_handed"    — overhead swing rotation gets a +90°
    //     offset so the strike lands down-screen instead of forward-side;
    //     motion-blur streak redirected to match.
    //   • "Firelance" (unitName-dispatched) — found via user report
    //     after being missed in the original pass; see the THIRD
    //     TECHNIQUE note above.
    //   • rocket cart / Hwacha (unitName-dispatched) — its melee spear
    //     fallback (for when out of ammo) redirected with the usual
    //     Math.PI + thrust-axis-swap trick. The cart itself is really a
    //     ranged weapon (see below) but is listed here too since both
    //     live in the same branch.
    //   • "javelinier" (nested under type "throwing") — REVISED per
    //     direct user follow-up (originally grouped under the "satisfied
    //     as-is" exclusion, then specifically requested once the user
    //     saw the archer's downward aim in action). Both its melee-stab
    //     and throwing sub-modes share one render block; the javelin's
    //     local shaft is already Y-aligned at rest, so facingDown locks
    //     its rotation to a constant Math.PI (perpendicular to the X
    //     axis, per the user's explicit phrasing) instead of the side
    //     view's small phase-based tilts, and swaps the reach (thrustX)
    //     from the X to the Y translate component.
    //   • "shortsword" melee fallback — the branch used by ranged units
    //     without their own dedicated out-of-ammo handling (archer,
    //     crossbow, and the rocket cart's spear all have their OWN
    //     inline fallback instead — check who actually reaches this
    //     shared branch before assuming it's live for a given unit).
    //   Ranged:
    //   • type "archer"        — inline melee fallback AND full ranged
    //     bow-draw cycle (nock/draw/hold/release), including the 45°/
    //     30px angle revision above.
    //   • type "gun"           — the hand-cannon reload cycle. Simplest
    //     case: everything already drawn inside ONE rotation wrapper,
    //     so a single +90° base offset redirects the whole animation.
    //   • type "crossbow"      — BOTH sub-mechanisms (Repeater, and
    //     Standard/Poison/Heavy), unblocked by explicit user
    //     clarification: reloading (box-mag drop-in, lever chambering,
    //     AND the foot-stirrup spanning motion) is ALWAYS shown side-on
    //     regardless of facing — only the aim/idle and brief recoil-
    //     snap bookend states redirect down. The Repeater's "100%
    //     UNTOUCHED"-flagged render code was wrapped, not edited (see
    //     THIRD TECHNIQUE above); the Standard/Poison/Heavy variant
    //     piggybacked its redirect onto its EXISTING weaponRot rotate
    //     call, since that variable is already ~0 during exactly the
    //     two states that should redirect. Its inline melee fallback is
    //     also ported now (same Math.PI trick as archer's).
    //   • rocket cart / Hwacha — NOT a rotation, a genuine RE-LAYOUT per
    //     explicit user request ("wheels and handle appropriately
    //     placed"). REVISED again this session: facingUp is now a real
    //     pose too (previously missing entirely — it fell through to
    //     the side view), sharing one drawVerticalCart(signY) renderer
    //     with facingDown so the two can't drift apart. Also fixed:
    //     the stray hand that used to float at the box's center, the
    //     handle (now real geometry with a bigger operator-to-cart
    //     gap, CART_GAP_Y), the wheels (bird's-eye tread rectangles for
    //     both facings), and the rocket grid (both loop axes now move,
    //     so ammo count reads as a real grid instead of ~6 overlapping
    //     marks). Also new: while isLaunching (attacking with ammo)
    //     the cart is locked to the up/down pose only, never the side
    //     view, until ammo runs out; firing now has a distinct
    //     ignition-spark phase before the flame, and smoke drifts as
    //     several fading puffs instead of one static circle, recurring
    //     every fire pulse. All key offsets are still named constants
    //     (CART_GAP_Y, CART_BOX_H/W, CART_WHEEL_W/IN, FIRE_CYCLE_MS) so
    //     a future pass can tune without re-deriving the geometry.
    //     cavscript.js's camel-cannon got the earlier re-layout
    //     treatment — good side-by-side reference if that one needs
    //     the same up-facing/bugfix pass someday.
    //
    // SHIELD PRIORITY (sword_shield, peasant weaponType 4/5/8) — per
    // user feedback, shields now draw AFTER their weapon (visual
    // priority, "like a blanket") instead of before, and shift slightly
    // aside + up specifically while attacking with facingDown active,
    // so a downward stab isn't fully hidden behind the shield. Off in
    // every other case (side-view idle/attacking, or facingDown but not
    // attacking) — search "shieldExtraX" / "shieldExtraY" (peasant) and
    // the sword_shield branch's own shield code for the exact gating.
    //
    // Every ported branch keeps the blade/limb/curve SHAPE code itself
    // completely unchanged — only pivot/anchor coordinates and base
    // rotation angles were redirected (the rocket cart and cavscript.js's
    // camel-cannon are the two exceptions: genuine re-layouts, since
    // they're vehicles, not held weapons). None of this has been
    // visually tested (no way to render canvas output in this
    // environment); several branches carry explicit inline NOTE
    // comments flagging swing amplitudes/arcs/first-pass layout numbers
    // — search this file for "NOTE (" to find the tagged ones.
    //
    // NOT PORTED / OUT OF SCOPE:
    //   • Slinger and Bomber (both under "throwing"/unitName dispatch)
    //     — still EXCLUDED, confirmed by direct user decision: their
    //     current throwing/lobbing animation already reads fine facing
    //     the viewer as-is. Javelinier was revised out of this
    //     exclusion (see PORTED above) but Slinger/Bomber were not —
    //     don't assume the javelin revision extends to them without
    //     checking with the user first.
    //   • Backshot / up (facingDirY===-1) for every type above — IN
    //     PROGRESS, see BACKSHOT / UP below.
    //
    // DONE elsewhere: cavscript.js — all melee AND ranged rider weapons
    // (default lancer, horse_archer's lance fallback + full bow cycle,
    // camel-cannon's shortsword fallback + MODE B ranged cannon
    // re-layout) are redirected, following these same patterns. Mount
    // bodies (horse/camel/elephant) stay side-view-only — see that
    // file's top-of-function notes.
    //
    // DONE elsewhere: optimization-mobile-battles.js's sprite-cache key
    // now includes facingDirY (both infantry and cavalry cache builders),
    // so the LOW-quality mobile cache path won't serve a stale pose when
    // a unit's vertical facing changes.
    //
    // ═══════════════════════════════════════════════════════════════════
    // BROADER ROADMAP NOTE (kept in sync with the matching block at the
    // top of drawCavalryUnit in cavscript.js — check there too):
    //
    // RANGED WEAPONS DOWN-FACING — DONE, see PORTED above. A full sweep
    // of every dispatch branch in this file turned up "gun" and
    // "Firelance" (both missed in the original pass) alongside the
    // already-known archer/crossbow/rocket-cart work.
    //
    // JAVELINIER — REVISED, no longer excluded. See PORTED above.
    //
    // SLINGER / BOMBER — still explicitly EXCLUDED, not a gap. Per
    // direct user confirmation, their current throwing/lobbing
    // animation is considered acceptable as-is for the down-facing case.
    // (Their eventual up/backshot treatment, if any, is a separate
    // future decision — not addressed by this note.)
    //
    // BACKSHOT / UP (facingDirY===-1) — IN PROGRESS this session, per
    // explicit user request: "make sure the armor/clothing/weapons etc
    // get shown [from] the back... the body [should not be] overlapping
    // the weapon or shield while only the back of the armor... is
    // shown." Two separate problems were identified before starting:
    //
    // PROBLEM 1 — Z-ORDER IS NOT A ONE-LINE FIX.
    // The obvious-looking shortcut — set
    // `ctx.globalCompositeOperation = 'destination-over'` around the
    // weapon-drawing calls when facing up, so they land behind whatever
    // is already on the canvas — is UNSAFE in this codebase and should
    // NOT be used. Confirmed by reading troop_draw.js's drawBattleUnits:
    // the SAME `ctx` is shared across the whole frame — supply lines,
    // terrain, and every unit are painted onto it in sequence, with
    // drawInfantryUnit/drawCavalryUnit receiving that shared ctx
    // directly (ctx.save()/ctx.translate(x,y), no offscreen buffer
    // created per unit). `destination-over` draws behind EVERYTHING
    // already rendered to that canvas this frame — not just this unit's
    // own body — so a facing-up unit's weapon could vanish behind
    // supply lines or an unrelated unit drawn earlier in the same pass.
    // A per-unit offscreen canvas (draw body, then draw weapon with
    // destination-over onto that small isolated canvas, then blit the
    // composited result) WOULD be safe, but adds a new canvas-alloc
    // path with no caching applied to it, hitting hardest exactly on
    // attacking units — the one case optimization-mobile-battles.js's
    // existing sprite cache deliberately bypasses already. Given this
    // codebase already treats per-unit render cost as a first-class
    // concern (the whole cache/LOD system in the optimization-*.js
    // files), introducing that without being able to benchmark it
    // seemed like a bad trade. THE FIX ACTUALLY USED (see IMPLEMENTATION
    // STATUS below): physically draw the weapon-drawing code BEFORE the
    // shared body/head/legs code for facing-up units, by restructuring
    // control flow.
    //
    // PROBLEM 2 — THE BODY ART DOESN'T EXIST YET, AND MOST OF IT ISN'T
    // A SIMPLE MIRROR JOB.
    // The shared body/head/legs code has no face drawn at all (just a
    // flat-colored head circle) — the sprite reads as "facing the
    // viewer" almost entirely because of FRONT-ANATOMY-SPECIFIC
    // headgear details: chin straps running under the chin, forehead
    // bands, and chin-tie bows sitting at the collar. At least 4
    // distinct faction/tier helmet designs read this way (Japan/Kabuto,
    // Mongol/Jinlord spiked helmet, the purple-faction Munjatugu, Dali
    // Kingdom's leather helmet+plume). None of these have an obvious
    // "just rotate/mirror it" fix — each needs an actual back-of-helmet
    // design (nape guard, back of the dome, hair/topknot instead of a
    // face). CHOSEN STARTING POINT: the LOW ARMOR TIER body (armorVal<8,
    // "left as the standard cloth tunic," no special headgear at all) —
    // it turns out this specific body ALREADY has zero front-only
    // detail (plain tunic, no design; the "SIMPLE HAIR" fallback is a
    // generic hair dome with no face) — so it doubles as a valid back
    // view with NO new art needed at all. See IMPLEMENTATION STATUS.
    //
    // IMPLEMENTATION STATUS — sections 1-5 below (legs, tunic, armor
    // layering, head base, headgear — everything that used to run
    // unconditionally before section 6's weapon dispatch) are now
    // wrapped in a closure, `drawBody`, defined right after
    // useBackView. This lets the EXACT SAME body-drawing code run at
    // EITHER of two points depending on facing:
    //   - Normal case (includes facing-up units at armorVal>=8, which
    //     don't have a back view yet): `drawBody()` runs BEFORE the
    //     weapon dispatch, exactly like before this session — a
    //     readable-but-not-backshot-correct placeholder for higher
    //     tiers, not a crash or missing body.
    //   - useBackView case (facing up AND armorVal<8): `drawBody()` is
    //     SKIPPED at its old location, the weapon dispatch chain (still
    //     completely unchanged in content) draws directly onto blank
    //     space, THEN `drawBody()` runs a second time at the very end
    //     of the function — same generic low-tier art, now landing on
    //     top of the already-drawn weapon.
    // Two of the weapon-dispatch branches (archer's and crossbow's
    // inline out-of-ammo melee fallbacks) `return` early rather than
    // falling through to the function's normal end — both needed an
    // explicit `if (useBackView) { drawBody(); }` inserted right before
    // their `return`, or a facing-up low-tier archer/crossbowman out of
    // ammo would render with NO BODY AT ALL (weapon drawn, then an
    // immediate return before the body ever gets its turn). Worth
    // checking for the same trap in any future branch that gains its
    // own early return.
    // KNOWN LIMITATION (see the big comment right above `drawBody`'s
    // definition for the full writeup): weapon-dispatch branches often
    // also draw a hand gripping the weapon, which — under useBackView —
    // ends up UNDER the body along with the weapon shaft, when
    // arguably a hand reaching to a weapon held behind the body should
    // sit ON TOP of the torso instead. Not fixed this pass (would need
    // a third z-order layer, splitting hand-drawing out of every
    // dispatch branch); flagged rather than silently accepted.
    // NOT YET DONE: higher armor tiers and every faction-specific
    // helmet (see PROBLEM 2) still don't have real back-view art, so
    // they render front-view even when facing up. cavscript.js's riders
    // got the same low-armor-tier-only treatment as this file (a later
    // session, same session-numbering as the rest of this file's
    // history) — see that file's own notes for its version of this
    // section; higher-tier riders and every faction helmet there are
    // still front-view-only for the same reason as here.
    //
    // MOUNT UP/DOWN POSES — deferred, whole feature (except the camel-
    // cannon's wheeled gun carriage, done per explicit user request —
    // see cavscript.js). Horse/elephant bodies stay side-view-only
    // regardless of facingDirY, for both the down case and the eventual
    // up case. Deferred to a later session, tokens permitting.
    // ═══════════════════════════════════════════════════════════════════

   // --- DYNAMIC ARMOR RETRIEVAL ---
    let armorVal = 2; 
    if (typeof UnitRoster !== 'undefined' && UnitRoster.allUnits[unitName]) {
        armorVal = UnitRoster.allUnits[unitName].armor;
    } else if (unitName && (unitName.includes("Elite") || type === "cataphract")) {
        armorVal = 40; // Elite/Super Heavy fallback
    } else if (unitName && unitName.includes("Heavy")) {
        armorVal = 25; // Standard Heavy fallback (matches Heavy Horse Archer)
    }

    if (unitName === "PLAYER" || unitName === "Commander") armorVal = Math.max(armorVal, 40);

    // Scenario 1 (Hakata Bay): player-side units use Japanese visuals regardless of factionColor.
    // Mirrors the same flag used for the Yumi bow. Has zero effect in sandbox.
    const isJapan = (factionColor === "#c2185b") || (window.__campaignStory1Active && unit && unit.side === 'player');

    let legSwing = moving ? Math.sin(frame * 0.3) * 6 : 0;
    let bob = moving ? Math.abs(Math.sin(frame * 0.3)) * 2 : 0;
    // dir is always 1 — ctx.scale(facingDir) above handles all mirroring.
    // Keeping dir in code so all weapon/arm offset math below compiles unchanged.
    let dir = 1;

    // Shared vertical-facing flag — see the VERTICAL FACING comment block
    // above for full context. Read by every ported melee/ranged branch
    // below (search "facingDown" to find them all).
    const facingDown = (unit && unit.facingDirY === 1);
    // Declared here (rather than down near UP_QUADRANT_ANGLE, where it
    // used to live) because the head-pivot fix right below now needs it
    // too — see BUGFIX note under headBowOffset/headBowRot.
    const facingUp = (unit && unit.facingDirY === -1);

    // ═══════════════════════════════════════════════════════════════
    // SHARED DOWN-AIM CONSTANTS — archer's bow, arrow, hand, AND head
    // now all read from these same two numbers, sharing the same pivot
    // point, so nothing can drift independently out of sync again.
    // Previous bug: the bow/arrow/hand pivoted around (handX, handY+30)
    // rotated 45°, while the head only translated straight down 10px
    // with NO rotation and NO shared pivot — two unrelated coordinate
    // systems that happened to both be called "down aim." At normal
    // scale the bow assembly (pivoting far below origin, rotated 45°)
    // ended up well below/beside a head that barely moved, reading as
    // "the bow is offset from the archer" and, since the barely-moved
    // head sits right at the tunic's top edge with no compensating
    // rotation, as "the head falls off" (it's not detached, it's just
    // uncorrelated with everything else that moved).
    // FIX (per explicit spec): 15px offset, ~40% of a quarter turn
    // (0.4 * 90°  = 36°) instead of 45°/30px — a canted aim rather than
    // a near-diagonal one, keeping the assembly closer to the body so
    // it doesn't read as detached.
    // ═══════════════════════════════════════════════════════════════
    const DOWN_AIM_OFFSET = 5;              // was 15 — pulled 10px closer to the body per report; used by the bow/arrow/hand only now
    const DOWN_AIM_ROT    = 0.4 * (Math.PI / 2); // shared cant angle, used by the bow/arrow/hand only now

    // NEW — per direct follow-up request ("check... archers... yes do
    // it all"): AIM_OFFSET/AIM_ROT below used to be a fixed facingDown/
    // facingUp (movement-based) switch, computed unconditionally here
    // for every unit type even though only the archer branch actually
    // reads them. They're now `let`, defaulting to 0, and reassigned
    // to a continuous, target-tracked value INSIDE the archer branch
    // itself (search "CONTINUOUS AIM" in the archer section below) —
    // both so the aim math only ever runs for archers (the same
    // "aiming/shooting pays for atan2, nothing else does" optimization
    // used throughout this file) and because computing a live target
    // angle needs `unit.target`, which isn't meaningfully checked this
    // early for every unit type.
    let AIM_OFFSET = 0;
    let AIM_ROT    = 0;

    // BUGFIX (archer head detaches / "falls off"): headBowOffset/Rot
    // used to shift+rotate the head to follow the bow's AIM_OFFSET/
    // AIM_ROT, on the theory that head and bow needed a shared pivot so
    // neither drifted from the other. In practice this reads as the
    // head itself leaving the neck and traveling off with the bow,
    // which looks worse than the original disconnect it was meant to
    // fix — a head has no visible "joint" geometry to sell a 36° swing
    // away from the torso the way a hand or arrow can. Per direct
    // report, the head now stays put at its normal position for BOTH
    // facings; only the bow/arrow/hand (via AIM_OFFSET/AIM_ROT below)
    // aim down or up. No other unit type ever moved its head to aim —
    // archers shouldn't either.
    const headBowOffset = 0;
    const headBowRot    = 0;

    // ═══════════════════════════════════════════════════════════════
    // BACKSHOT / UP (facingDirY===-1) — infrastructure, this session.
    // See the big VERTICAL FACING comment block at the top of this
    // function (PROBLEM 1 / PROBLEM 2 / IMPLEMENTATION STATUS) for the
    // full reasoning. Short version:
    //
    // facingUp is true when the unit is moving up-screen / into the
    // canvas (away from the camera). For a genuine "seen from behind"
    // pose, the weapon (held away from the viewer) needs to render
    // BEHIND the body, not on top of it — the opposite z-order from
    // facingDown. That requires physically drawing the weapon-dispatch
    // code (section 6 below) BEFORE the body/head/legs code (sections
    // 1-5), which is why sections 1-5 are wrapped in the `drawBody`
    // closure below instead of running inline as one linear pass: it
    // lets the SAME body-drawing code be called at two different points
    // in the sequence depending on facingUp, without duplicating it.
    //
    // useBackView additionally gates this on armorVal < 8 (low armor
    // tier). This is deliberate, not a shortcut: low-tier units use the
    // plain "standard cloth tunic" torso (no pauldrons/lamellar) and the
    // generic "SIMPLE HAIR" head fallback (no helmet, no chin straps,
    // no forehead band) — see sections 3 and 5 below. Neither has any
    // front-anatomy-specific detail, so this SAME art is already valid
    // as a back view with zero redesign. Every other armor tier still
    // has front-only helmet details (chin straps, forehead bands, etc
    // — see PROBLEM 2 above) that a genuine back view would need to
    // replace, which hasn't been designed yet — so higher tiers
    // deliberately fall through to the normal front-view z-order
    // (drawBody runs BEFORE the weapon, same as today) even when
    // facingUp, as a readable-but-not-yet-correct placeholder rather
    // than attempting art this session can't visually verify.
    //
    // KNOWN LIMITATION: the weapon-dispatch code below often also draws
    // a hand (skin-colored circle) gripping the weapon. Under
    // useBackView, that hand is drawn as part of the "weapon first"
    // pass, meaning it ends up UNDER the body too — arguably a real
    // hand reaching out to a weapon held behind them would sit ON TOP
    // of their back/torso, not underneath it. Properly layering
    // hand-over-body-over-weapon would need a third z-order pass
    // (splitting "hand" out from "weapon shaft" in every dispatch
    // branch), which is significantly more invasive than this pass
    // attempts. Flagged here rather than silently accepted — worth
    // revisiting once the low-tier back view has been seen in-game.
    // ═══════════════════════════════════════════════════════════════
    // facingUp itself is now declared up near facingDown (needed
    // earlier by the head-pivot fix) — just useBackView lives here.
    // BACKSHOT COVERAGE UPDATE (this session): previously gated to
    // armorVal < 8 because only the low-tier "plain tunic / simple
    // hair" body had no front-only detail. Real back-helmet art now
    // exists for every tier/faction (see drawBackHeadgear below), so
    // the tier restriction is dropped — useBackView is now just
    // facingUp. All existing z-order plumbing below (drawBody run
    // twice, early-return guards, weapon dispatch) keys off this same
    // flag and needs no further changes.
    const useBackView = facingUp;

    // ═══════════════════════════════════════════════════════════════
    // QUADRANT-BASED AIM ANGLE — shared constant, added per explicit
    // user request: weapon aim should reflect the actual heading
    // quadrant (Q1-Q4: up-right/up-left/down-left/down-right), not
    // snap to a rigid vertical/horizontal cardinal direction.
    //
    // A PURE 90° rotation (used by several weapons in an earlier pass
    // of this session) is the bug this fixes: rotating a horizontal
    // reach axis by exactly 90° produces a shaft with constant screen-X
    // — dead vertical, no lean left/right at all, even when the unit is
    // ALSO moving left/right (facingDir). 45° instead keeps the shaft's
    // screen-X varying with its reach, producing a genuine diagonal.
    //
    // This single 45° constant, combined with the EXISTING global
    // ctx.scale(unit.facingDir,1) mirror at the very top of this
    // function, is sufficient to cover all 4 quadrants without any
    // extra per-quadrant code: the local rotation is always computed
    // as if facingDir were +1 (heading right), and the global mirror
    // flips the entire already-rotated result to the left-heading case
    // for free when facingDir is -1. So "Q1 to Q4" here isn't 4
    // separate code paths — it's this one angle plus the facingDir
    // hysteresis that was already driving left/right mirroring before
    // this session even started.
    //
    // Used by every "aimed reach" weapon (peasant, gun, firelance, the
    // crossbow's aim/recoil bookends, all three cavalry lance/gun
    // spots) in place of the Math.PI/2 each originally used — search
    // this file for DOWN_QUADRANT_ANGLE to find every consumer.
    //
    // NOT applied to the shortsword-style melee blades (archer/crossbow
    // inline fallbacks, the shared shortsword fallback, rocket cart's
    // spear) — those use a full Math.PI (180°) flip of an already-
    // vertical local rest pose for a reason specific to that trick: cos
    // and sin of +π and -π are identical, which is what makes that
    // rotation dir-invariant without needing *dir anywhere. Switching
    // those to 45° would reintroduce a dir-dependence that hasn't been
    // worked out yet — left as pure vertical stabs for now, worth
    // revisiting for full quadrant consistency in a future pass.
    // ═══════════════════════════════════════════════════════════════
    const DOWN_QUADRANT_ANGLE = Math.PI / 4;

    // UP_QUADRANT_ANGLE — the facingUp counterpart, added this session
    // alongside the backshot z-order work. -45° (negative) so that for
    // facingDir=1 (heading right), a local reach point (L,0) rotates to
    // (positive-x, negative-y) — i.e. up-and-right (Q1), matching
    // DOWN_QUADRANT_ANGLE's down-and-right (Q4) but mirrored vertically
    // instead of flipped 180°, keeping the same "which side does it
    // lean" logic consistent between the two facings.
    //
    // IMPORTANT — this is gated by `&& useBackView` at every call site,
    // NOT just `facingUp` alone. Reasoning: useBackView is only true for
    // low-armor-tier units, where the BODY z-order also correctly flips
    // (weapon drawn first, body drawn on top — see drawBody/useBackView
    // above). For higher-tier facingUp units, the body still renders in
    // its normal FRONT view (no back-view art exists for them yet), so
    // aiming the weapon "up" there would produce a broken-looking
    // mismatch: a weapon pointing away from the viewer, sitting on top
    // of a body that's still visually facing the viewer. Those units
    // deliberately keep the weapon in its normal side-view pose instead
    // — consistent, if not backshot-correct, same philosophy as the
    // body itself falling back to front-view for them.
    const UP_QUADRANT_ANGLE = -Math.PI / 4;

    // ═══════════════════════════════════════════════════════════════
    // BACK-VIEW HEADGEAR (facingUp / useBackView) — full sweep, this
    // session. Mirrors the front headgear if/else chain 1:1 (same
    // armorVal tier split, same faction branches, same order) so it's
    // easy to keep the two in sync if a front design ever changes.
    // Design principle per branch: helmet BOWLS/domes/cones are mostly
    // left-right symmetric already, so they're kept as-is. What gets
    // changed is anything that was drawn as an explicitly front-facing
    // detail — forehead bands, chin straps/ties, chin-strap rivets,
    // and any plate/segment lines that visually terminate "at the
    // face" — which are removed and replaced with a rear equivalent:
    // a neck guard / nape flare, since a real helmet's practical
    // hardware (lamellar neck lames, cloth or leather flaps) is
    // usually heaviest at the BACK of the neck, not the front. Where a
    // faction's front design already had a functional neck/ear guard
    // (the purple Munjatugu, Dali's ear flaps), that piece is kept
    // and slightly extended since it was already back-appropriate.
    // Medium-tier hats (mostly simple cones/domes) needed the least
    // rework — most have no front-only rivet or tie detail at all.
    // ═══════════════════════════════════════════════════════════════
    const drawBackHeadgear = () => {
        if (armorVal >= 25) {
            // --- HIGH TIER -> HEAVY HELMETS, BACK VIEW ---
            if (isJapan) {
                // Kabuto — bowl is symmetric, so keep it, but drop the
                // frontal horns (kuwagata) and add the shikoro: a
                // fanned lamellar neck-guard, the actual back-of-kabuto
                // signature piece.
                ctx.fillStyle = "#212121";
                ctx.beginPath(); ctx.arc(0, -13, 4, Math.PI, 0); ctx.fill();
                // Shikoro — 3 overlapping lame bands flaring outward
                ctx.fillStyle = "#3a3a3a"; ctx.strokeStyle = "#111111"; ctx.lineWidth = 0.4;
                [[-13.2, 5.2], [-12.2, 4.4], [-11.2, 3.6]].forEach(([y, half]) => {
                    ctx.beginPath();
                    ctx.moveTo(-half, y); ctx.lineTo(half, y);
                    ctx.lineTo(half - 0.6, y + 1.4); ctx.lineTo(-(half - 0.6), y + 1.4);
                    ctx.closePath(); ctx.fill(); ctx.stroke();
                });
            } else if (factionColor === "#1976d2" || factionColor === "#455a64") {
                // Mongol / Jinlord — bowl + top spike are symmetric,
                // keep both. The front flaps were cheek/chin flaps
                // (frontal); replace with a single continuous neck
                // lame curtain at the rear.
                ctx.fillStyle = "#9e9e9e"; ctx.strokeStyle = "#424242"; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(0, -14, 4.5, Math.PI, 0); ctx.fill(); ctx.stroke();
                ctx.fillStyle = "#616161";
                ctx.beginPath(); ctx.moveTo(-1.5, -18.5); ctx.lineTo(1.5, -18.5); ctx.lineTo(0, -23); ctx.fill();
                // Rear neck curtain (replaces the two forward cheek flaps)
                ctx.fillStyle = "#4e342e";
                ctx.beginPath();
                ctx.moveTo(-4, -14); ctx.lineTo(4, -14);
                ctx.lineTo(3, -8); ctx.lineTo(-3, -8);
                ctx.closePath(); ctx.fill();
            } else if (factionColor === "#7b1fa2") {
                // Munjatugu — bowl, segment lines, and top spike are
                // symmetric, keep all. The forehead band + rivets and
                // chin strap were explicitly frontal; the padded cloth
                // guards were ALREADY a rear-ish neck guard, so keep
                // and slightly widen them instead of adding new parts.
                ctx.fillStyle = "#37474f";
                ctx.beginPath();
                ctx.moveTo(-4, -13);
                ctx.quadraticCurveTo(-4, -20.5, 0, -21.5);
                ctx.quadraticCurveTo(4, -20.5, 4, -13);
                ctx.closePath(); ctx.fill();
                ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 0.3;
                [-2.5, -0.8, 0.8, 2.5].forEach(sx => {
                    ctx.beginPath(); ctx.moveTo(sx, -13); ctx.lineTo(sx * 0.5, -21.5); ctx.stroke();
                });
                ctx.fillStyle = "#37474f";
                ctx.fillRect(-0.8, -22, 1.6, 0.5);
                ctx.beginPath(); ctx.moveTo(-0.3, -22); ctx.lineTo(0, -24); ctx.lineTo(0.3, -22); ctx.fill();
                // Widened padded neck guard (was two side guards, now
                // one continuous rear panel)
                ctx.fillStyle = "#4a148c";
                ctx.beginPath();
                ctx.moveTo(-4, -13); ctx.lineTo(-4.5, -6.5);
                ctx.lineTo(4.5, -6.5); ctx.lineTo(4, -13);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = "#757575";
                [[-3, -9.5], [-1, -8.5], [1, -8.5], [3, -9.5]].forEach(s => {
                    ctx.beginPath(); ctx.arc(s[0], s[1], 0.2, 0, Math.PI * 2); ctx.fill();
                });
            } else if (factionColor === "#00838f") {
                // Dali — bowl symmetric, keep. Ear flaps already read
                // fine from behind, keep as-is. Drop the front red band
                // and white chin-tie (both explicitly frontal); the
                // plume sits on the centerline so it's kept unchanged.
                ctx.fillStyle = "#8d6e63";
                ctx.beginPath();
                ctx.arc(-2.8, -13.5, 1.2, 0, Math.PI * 2);
                ctx.arc(2.8, -13.5, 1.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#a1887f";
                ctx.beginPath(); ctx.arc(0, -15, 3.5, Math.PI, 0);
                ctx.lineTo(3.5, -13.5); ctx.lineTo(-3.5, -13.5); ctx.closePath(); ctx.fill();
                ctx.fillStyle = "#1a1a1a";
                ctx.beginPath();
                ctx.moveTo(-0.5, -18.5); ctx.lineTo(-1.2, -19.8);
                ctx.lineTo(0.2, -19.5); ctx.lineTo(0.8, -20.2); ctx.lineTo(0.5, -18.5);
                ctx.fill();
                ctx.fillStyle = "#fbc02d";
                ctx.beginPath();
                ctx.moveTo(-0.8, -18.5); ctx.quadraticCurveTo(0, -19.5, 0.8, -18.5);
                ctx.lineTo(0.5, -17.5); ctx.lineTo(-0.5, -17.5); ctx.closePath(); ctx.fill();
                // Leather back-flap replacing the frontal red band/tie
                ctx.fillStyle = "#8d6e63";
                ctx.fillRect(-3.2, -13.5, 6.4, 4.5);
                ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 0.15; ctx.stroke();
            } else {
                // Default (Chinese/Korean) — dome is symmetric, keep.
                // The front lamellar strip becomes a full neck guard
                // wrapping the rear.
                ctx.fillStyle = "#9e9e9e";
                ctx.beginPath(); ctx.arc(0, -14, 4, Math.PI, 0); ctx.fill(); ctx.stroke();
                ctx.fillStyle = factionColor;
                ctx.fillRect(-4.5, -14, 9, 1.5);
                ctx.fillStyle = "#757575";
                ctx.fillRect(-4, -12.5, 8, 3);
            }
        } else if (armorVal >= 8) {
            // --- MEDIUM TIER -> LIGHT HATS, BACK VIEW ---
            // Every medium-tier hat here is already a cone or simple
            // dome with no front-only rivet/tie detail, so these are
            // kept visually identical to the front version — genuinely
            // just a mirror job for this tier, unlike high tier.
            if (isJapan) {
                ctx.fillStyle = "#212121"; ctx.strokeStyle = "#424242"; ctx.lineWidth = 0.5;
                ctx.beginPath(); ctx.moveTo(-6, -13); ctx.lineTo(0, -16); ctx.lineTo(6, -13);
                ctx.closePath(); ctx.fill(); ctx.stroke();
            } else if (factionColor === "#1976d2" || factionColor === "#455a64") {
                const isEliteMongolBack = unitName && (unitName.includes("Heavy") || unitName.includes("Elite") || unitName.includes("Mangadai"));
                if (isEliteMongolBack || armorVal >= 25) {
                    ctx.fillStyle = "#9e9e9e"; ctx.strokeStyle = "#424242"; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.arc(0, -13, 4.5, Math.PI, 0); ctx.fill(); ctx.stroke();
                    ctx.fillStyle = "#616161";
                    ctx.beginPath(); ctx.moveTo(-1.5, -17.5); ctx.lineTo(1.5, -17.5); ctx.lineTo(0, -22); ctx.fill();
                    ctx.fillStyle = "#4e342e";
                    ctx.fillRect(-4, -13, 8, 5); // single rear curtain vs. two front flaps
                } else {
                    ctx.fillStyle = "#5d4037";
                    ctx.fillRect(-4.5, -14, 9, 3);
                    ctx.fillStyle = factionColor;
                    ctx.beginPath(); ctx.moveTo(-4, -13); ctx.lineTo(0, -19); ctx.lineTo(4, -13); ctx.fill();
                    ctx.fillStyle = "#d32f2f";
                    ctx.fillRect(-0.5, -20, 1, 2);
                }
            } else if (factionColor === "#00838f") {
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(-3.2, -14.5, 6.4, 0.8);
                ctx.fillStyle = "#1a1a1a";
                ctx.beginPath();
                ctx.moveTo(-3.2, -14.5); ctx.lineTo(3.2, -14.5);
                ctx.lineTo(3.8, -16.5); ctx.quadraticCurveTo(2, -19, -1, -18.5);
                ctx.lineTo(-3.5, -16); ctx.closePath(); ctx.fill();
                // No floral motifs or fold-line on the back — those
                // were decorative face-side embroidery, not structural.
            } else if (factionColor === "#388e3c") {
                ctx.fillStyle = "#8d6e63"; ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(-6, -13); ctx.lineTo(0, -21); ctx.lineTo(6, -13);
                ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.fillStyle = "#5d4037";
                ctx.fillRect(-1, -22, 2, 2);
            } else {
                ctx.fillStyle = "#8d6e63";
                ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(0, -16); ctx.lineTo(6, -12);
                ctx.quadraticCurveTo(0, -13.5, -6, -12); ctx.fill(); ctx.stroke();
            }
        } else {
            // --- LOW TIER: SIMPLE HAIR — already back-safe, unchanged ---
            ctx.fillStyle = "#212121";
            ctx.beginPath(); ctx.arc(0, -13.5, 3.6, Math.PI, 0); ctx.fill();
            ctx.fillRect(-3.8, -12, 0.8, 2.5);
            ctx.fillRect(3.0, -12, 0.8, 2.5);
        }
    };

    const drawBody = () => {
    // 1. Legs
    ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(-3 - legSwing, 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(3 + legSwing, 9); ctx.stroke();

    ctx.translate(0, -bob); 
    
    // 2. Body: Base Faction Tunic (Mobs always wear faction color underneath)
    ctx.fillStyle = factionColor; ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.lineTo(3, -10); ctx.lineTo(-3, -10);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    
    // 3. ARMOR LAYERING
    if (armorVal >= 25) {
        // --- HEAVY TIER (25+): Steel Lamellar & SQUARE Pauldrons ---
        ctx.fillStyle = "#9e9e9e"; // Steel/Iron color
        ctx.beginPath(); ctx.moveTo(-4, -1); ctx.lineTo(4, -1); ctx.lineTo(3, -9); ctx.lineTo(-3, -9);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        
        // Steel Lamellar Texture (Lines)
        ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 0.5;
        for(let i = -8; i < -1; i+=2.5) {
            ctx.beginPath(); ctx.moveTo(-3, i); ctx.lineTo(3, i); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-1.5, i); ctx.lineTo(-1.5, i+2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(1.5, i); ctx.lineTo(1.5, i+2); ctx.stroke();
        }

        // SQUARE Asian-style Pauldrons — crimson if Japanese scenario player unit
        ctx.fillStyle = isJapan ? "#c2185b" : factionColor; 
        ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1;
        // Left pauldron
        ctx.fillRect(-6.5, -9.5, 3, 4.5); ctx.strokeRect(-6.5, -9.5, 3, 4.5);
        // Right pauldron
        ctx.fillRect(3.5, -9.5, 3, 4.5); ctx.strokeRect(3.5, -9.5, 3, 4.5);
        
        // Lamellar lines on the square pauldrons
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath(); ctx.moveTo(-6.5, -7.5); ctx.lineTo(-3.5, -7.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(3.5, -7.5); ctx.lineTo(6.5, -7.5); ctx.stroke();

} else if (armorVal >= 8) {
        // --- MEDIUM TIER (8-24): Smooth Leather + FACTION PAULDRONS ---
        ctx.fillStyle = "#5d4037"; // Dark smooth leather/cloth vest
        ctx.beginPath(); ctx.moveTo(-4, -1); ctx.lineTo(4, -1); ctx.lineTo(2.5, -9); ctx.lineTo(-2.5, -9);
        ctx.closePath(); ctx.fill(); ctx.stroke();

        // ADDED: Square Pauldrons for Medium Tier (Faction Color / crimson if Japanese scenario)
        ctx.fillStyle = isJapan ? "#c2185b" : factionColor; 
        ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1;
        // Left pauldron
        ctx.fillRect(-6, -9, 2.5, 4); ctx.strokeRect(-6, -9, 2.5, 4);
        // Right pauldron
        ctx.fillRect(3.5, -9, 2.5, 4); ctx.strokeRect(3.5, -9, 2.5, 4);
    }
    // Low tier (<8) is left as the standard cloth tunic.

    // 4. Head Base
    // headBowOffset/headBowRot wrapper opens here (see declaration
    // above) — shifts AND cants Head Base + ALL of section 5's
    // headgear variants together, pivoting around a point that's the
    // head's own base point (0,-12) shifted down by headBowOffset,
    // rather than the local origin at (0,0) or the bare head-base point.
    // Order: move TO that combined pivot, rotate, move back by the
    // EXACT negative — so the head cants around its own (offset) center
    // instead of swinging on an arc around the shoulders. Every
    // faction/tier branch below keeps working unchanged relative to
    // this new, shifted+rotated origin.
    //
    // BUGFIX (head offsets far from body when facing down): the old
    // sequence was translate(0,-12) -> rotate -> translate(0,+12) ->
    // translate(0, headBowOffset). Canvas transforms compose in the
    // CURRENT (already-rotated) frame, so translate(0,+12) does NOT
    // return to the original origin once a rotation is active — and the
    // trailing translate(0, headBowOffset) then gets dragged along by
    // that same still-active rotation too, kicking the head sideways as
    // well as down instead of a clean drop. That produced the
    // floating/detached head seen in testing.
    // FIX: fold headBowOffset into the pivot itself (same trick the
    // bow's own `pivotY = handY + DOWN_Y_OFFSET` already uses) so there
    // is exactly ONE translate-to-pivot and ONE exact-negative
    // translate-back, with nothing extra layered inside the rotated
    // frame.
    const headPivotY = -12 + headBowOffset;
    ctx.save();
    ctx.translate(0, headPivotY);
    ctx.rotate(headBowRot);
    ctx.translate(0, -headPivotY);
    ctx.fillStyle = "#d4b886"; 
    ctx.beginPath(); ctx.arc(0, -12, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    
    // 5. DYNAMIC HEADGEAR BY ARMOR TIER AND FACTION
    if (useBackView) {
        // Back view: dispatch to the dedicated back-headgear renderer
        // above instead of the front chain below. This is the ONLY
        // change to this dispatch point — the front chain itself
        // (everything in the else branch) is completely untouched.
        drawBackHeadgear();
    } else {
    if (armorVal >= 25) {
        // --- HIGH TIER -> HEAVY HELMETS ---
        if (isJapan) { 
            // Yamato / Hakata Bay player → Samurai Kabuto Helmet with Horns
            ctx.fillStyle = "#212121";
            ctx.beginPath(); ctx.arc(0, -13, 4, Math.PI, 0); ctx.fill(); 
            ctx.fillRect(-5, -13, 10, 2); 
            ctx.strokeStyle = "#fbc02d"; ctx.lineWidth = 1.5; 
            ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(-4, -19); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(4, -19); ctx.stroke();
        } else if (factionColor === "#1976d2" || factionColor === "#455a64") { 
            // Mongol / Jinlord -> Heavy Spiked Steel Helmet with flaps
            ctx.fillStyle = "#9e9e9e"; ctx.strokeStyle = "#424242"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(0, -14, 4.5, Math.PI, 0); ctx.fill(); ctx.stroke(); 
            ctx.fillStyle = "#616161";
            ctx.beginPath(); ctx.moveTo(-1.5, -18.5); ctx.lineTo(1.5, -18.5); ctx.lineTo(0, -23); ctx.fill(); 
            ctx.fillStyle = "#4e342e"; 
            ctx.fillRect(-5, -14, 3, 5); ctx.fillRect(2, -14, 3, 5);
}

else if (factionColor === "#7b1fa2") {

    // 1. The Neck/Ear Guards (Practical Padded Cloth) - Shifted Up
    ctx.fillStyle = "#4a148c"; // Darker purple for the fabric base
    ctx.beginPath();
    ctx.moveTo(-3.5, -12.5);
    ctx.lineTo(-4.5, -6.5);
    ctx.lineTo(-1, -6.5); // Rear guard
    ctx.lineTo(-0.5, -12.5);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0.5, -12.5);
    ctx.lineTo(1, -6.5);
    ctx.lineTo(4, -6.5); // Side guard
    ctx.lineTo(3.5, -13.5);
    ctx.fill();

    // Simple Iron Rivets on guards
    ctx.fillStyle = "#757575"; // Iron gray rivets
    const ironStuds = [[-3, -9.5], [-2.5, -8], [2, -9.5], [2.5, -8]];
    ironStuds.forEach(s => {
        ctx.beginPath();
        ctx.arc(s[0], s[1], 0.2, 0, Math.PI * 2);
        ctx.fill();
    });

    // 2. The Segmented Iron Bowl (Munjatugu)
    ctx.fillStyle = "#37474f"; // Wrought iron/dark steel
    ctx.beginPath();
    ctx.moveTo(-4, -13);
    ctx.quadraticCurveTo(-4, -20.5, 0, -21.5); 
    ctx.quadraticCurveTo(4, -20.5, 4, -13);
    ctx.closePath();
    ctx.fill();

    // 3. Vertical Plate Segments
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 0.3;
    const segments = [-2.5, -0.8, 0.8, 2.5];
    segments.forEach(x => {
        ctx.beginPath();
        ctx.moveTo(x, -13);
        ctx.lineTo(x * 0.5, -21.5); 
        ctx.stroke();
    });

    // 4. Iron Forehead Band & Rivets
    ctx.fillStyle = "#455a64"; 
    ctx.fillRect(-4.1, -14, 8.2, 1); // Structural rim band
    
    ctx.fillStyle = "#9e9e9e"; // Lighter iron for rivets
    const rimRivets = [-3.5, -2, 0, 2, 3.5];
    rimRivets.forEach(x => {
        ctx.beginPath();
        ctx.arc(x, -13.5, 0.15, 0, Math.PI * 2);
        ctx.fill();
    });

    // 5. The Top Finial (Functional Iron Spike)
    ctx.fillStyle = "#37474f";
    // Base plate
    ctx.fillRect(-0.8, -22, 1.6, 0.5);
    // Simple spike
    ctx.beginPath();
    ctx.moveTo(-0.3, -22);
    ctx.lineTo(0, -24);
    ctx.lineTo(0.3, -22);
    ctx.fill();

    // 6. Chin Strap (Functional)
    ctx.strokeStyle = "#eeeeee";
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(-3, -12.5);
    ctx.quadraticCurveTo(0, -9.5, 3, -12.5);
    ctx.stroke();

}

 else if (factionColor === "#00838f") {

// Dali Kingdom - Heavy Leather Helmet
// Features: Reinforced bowl, ear guards, and ceremonial plume

// 1. Side Ear Flaps (Rounded Leather)
ctx.fillStyle = "#8d6e63"; // Medium-dark leather brown
ctx.beginPath();
ctx.arc(-2.8, -13.5, 1.2, 0, Math.PI * 2); // Left flap
ctx.arc(2.8, -13.5, 1.2, 0, Math.PI * 2);  // Right flap
ctx.fill();

// 2. Main Helmet Bowl
ctx.fillStyle = "#a1887f"; // Slightly lighter leather for the crown
ctx.beginPath();
ctx.arc(0, -15, 3.5, Math.PI, 0); // Large rounded top
ctx.lineTo(3.5, -13.5);
ctx.lineTo(-3.5, -13.5);
ctx.closePath();
ctx.fill();

// 3. The Prominent Red Band (Forehead Guard)
ctx.fillStyle = "#c62828"; // Deep historical red
ctx.fillRect(-3.6, -14.8, 7.2, 1); 

// 4. The Top Finial & Plume (Golden Base + Black Brush)
// Plume (The dark hair/brush)
ctx.fillStyle = "#1a1a1a";
ctx.beginPath();
ctx.moveTo(-0.5, -18.5);
ctx.lineTo(-1.2, -19.8); // Individual strands effect
ctx.lineTo(0.2, -19.5);
ctx.lineTo(0.8, -20.2);
ctx.lineTo(0.5, -18.5);
ctx.fill();

// Golden Base (The ornament holding the plume)
ctx.fillStyle = "#fbc02d"; 
ctx.beginPath();
ctx.moveTo(-0.8, -18.5);
ctx.quadraticCurveTo(0, -19.5, 0.8, -18.5);
ctx.lineTo(0.5, -17.5);
ctx.lineTo(-0.5, -17.5);
ctx.closePath();
ctx.fill();
// 5. The White Chin Tie (Lowered to collar/chest level)
ctx.strokeStyle = "#ffffff";
ctx.fillStyle = "#ffffff";
ctx.lineWidth = 0.4;

// The bow/knot - Shifted south to -8.5
ctx.beginPath();
ctx.arc(-0.5, -8.5, 0.4, 0, Math.PI * 2); // Left loop
ctx.arc(0.5, -8.5, 0.4, 0, Math.PI * 2);  // Right loop
ctx.fill();

// The dangling ends - Starting at -8.5 and extending to -7.5
ctx.beginPath();
ctx.moveTo(0, -8.5);
ctx.lineTo(-0.8, -7.5);
ctx.moveTo(0, -8.5);
ctx.lineTo(0.8, -7.5);
ctx.stroke();
// 6. Leather Texture/Outline Detail
ctx.strokeStyle = "rgba(0,0,0,0.2)";
ctx.lineWidth = 0.15;
ctx.stroke(); // Adds a subtle edge to the last path

} else {
    // Default (Chinese/Korean) -> Steel Dome with Lamellar Neck Guard
    ctx.fillStyle = "#9e9e9e";
    ctx.beginPath(); ctx.arc(0, -14, 4, Math.PI, 0); ctx.fill(); ctx.stroke();
    
    // Fixed: Shorter guard (1.5 height) so it doesn't cover the eyes
    ctx.fillStyle = factionColor; 
    ctx.fillRect(-4.5, -14, 9, 1.5); 
}
    } else if (armorVal >= 8) {
  // --- MEDIUM TIER -> FACTION SPECIFIC LIGHT HATS ---
        if (isJapan) { 
            // Yamato / Hakata Bay player → Ashigaru Jingasa (Peasant Style: Iron/Black Wood)
            // Removed gold stroke; used a dark grey outline for a worn metal look
            ctx.fillStyle = "#212121"; 
            ctx.strokeStyle = "#424242"; 
            ctx.lineWidth = 0.5;

            // Revised coordinates: Lowered slightly to avoid gaps
            ctx.beginPath(); 
            ctx.moveTo(-6, -13); 
            ctx.lineTo(0, -16); 
            ctx.lineTo(6, -13);
            ctx.closePath(); 
            ctx.fill(); 
            ctx.stroke();
        
        } 
		
		
else if (factionColor === "#1976d2" || factionColor === "#455a64") {

			
// --- SURGERY: Replace the Mongol/Nomad helmet logic in infscript.js ---

// Identify if this is an elite/heavy unit that should keep its default armor
const isEliteMongol = unitName && (unitName.includes("Heavy") || unitName.includes("Elite") || unitName.includes("Mangadai"));
const isMongolFaction = (factionColor === "#1976d2" || factionColor === "#455a64");

if (isMongolFaction) {
    if (isEliteMongol || armorVal >= 25) {
        // DEFAULT: Heavy Spiked Steel Helmet (for elites/heavy)
        ctx.fillStyle = "#9e9e9e"; ctx.strokeStyle = "#424242"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, -13, 4.5, Math.PI, 0); ctx.fill(); ctx.stroke(); 
        ctx.fillStyle = "#616161";
        ctx.beginPath(); ctx.moveTo(-1.5, -17.5); ctx.lineTo(1.5, -17.5); ctx.lineTo(0, -22); ctx.fill(); 
        ctx.fillStyle = "#4e342e"; 
        ctx.fillRect(-5, -13, 3, 5); ctx.fillRect(2, -13, 3, 5); // Flaps
    } else {
        // NEW: Universal Mongol Hat (Conical fur cap)
        // 1. Fur Brim
        ctx.fillStyle = "#5d4037"; 
        ctx.fillRect(-4.5, -14, 9, 3);
        // 2. Conical Top (Faction colored)
        ctx.fillStyle = factionColor;
        ctx.beginPath();
        ctx.moveTo(-4, -13);
        ctx.lineTo(0, -19);
        ctx.lineTo(4, -13);
        ctx.fill();
        // 3. Small Red Tassel
        ctx.fillStyle = "#d32f2f";
        ctx.fillRect(-0.5, -20, 1, 2);
    }
}
        
} else if (factionColor === "#00838f") {
// Dali Kingdom (Historical Structured Cap)
// This replaces the "turban" look with the authentic tapered cap silhouette

// 1. The White Banded Base (The "Stripes" at the bottom)
ctx.fillStyle = "#ffffff";
ctx.fillRect(-3.2, -14.5, 6.4, 0.8); // Primary thick white band
ctx.fillStyle = "#d1d1d1"; 
ctx.fillRect(-3.2, -13.8, 6.4, 0.2); // Thin accent line for texture

// 2. The Main Cap Body (Dark Indigo/Black)
ctx.fillStyle = "#1a1a1a"; // Using a near-black indigo for historical dye depth
ctx.beginPath();
ctx.moveTo(-3.2, -14.5);           // Bottom Left
ctx.lineTo(3.2, -14.5);            // Bottom Right
ctx.lineTo(3.8, -16.5);            // Slight flare on the right
ctx.quadraticCurveTo(2, -19, -1, -18.5); // The soft, structured "peak"
ctx.lineTo(-3.5, -16);             // Tapering back to the left
ctx.closePath();
ctx.fill();

// 3. The Floral Designs (Circular Silver/White Motifs)
ctx.fillStyle = "#e0e0e0"; 
const flowerPositions = [
    {x: -1.8, y: -15.8},
    {x: 0.8, y: -15.5},
    {x: 2.5, y: -16.2},
    {x: 0.2, y: -17.5},
    {x: -1.2, y: -17.2}
];

flowerPositions.forEach(pos => {
    // Draw the main flower circle
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 0.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Add a tiny dark center for the "floral" look
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e0e0e0"; // Reset for next iteration
});

// 4. Final Detail: Soft fold line to give it dimension
ctx.strokeStyle = "rgba(255,255,255,0.1)";
ctx.lineWidth = 0.1;
ctx.beginPath();
ctx.moveTo(-1, -18.5);
ctx.lineTo(1, -16);
ctx.stroke();
} else if (factionColor === "#388e3c") { //vietnam rice hat
		           
            ctx.fillStyle = "#8d6e63";   // Dark Lacquered Rattan
            ctx.strokeStyle = "#5d4037"; // Deep brown for the weave lines
            ctx.lineWidth = 0.5;

            // 1. The main conical structure of the rattan helm
            ctx.beginPath();
            ctx.moveTo(-6, -13); // Bottom Left
            ctx.lineTo(0, -21);  // High Point (Conical peak)
            ctx.lineTo(6, -13);  // Bottom Right
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 2. Add the Woven Texture (Cross-hatching)
            // This adds small detail lines to make it look like organic material
            ctx.beginPath();
            // Horizontal bands
            ctx.moveTo(-3, -16); ctx.lineTo(3, -16);
            ctx.moveTo(-4.5, -14.5); ctx.lineTo(4.5, -14.5);
            // Vertical supports
            ctx.moveTo(-2, -13); ctx.lineTo(-0.5, -20);
            ctx.moveTo(2, -13); ctx.lineTo(0.5, -20);
            ctx.stroke();

            // 3. The Top Knob (Traditional finish for these hats/helms)
            ctx.fillStyle = "#5d4037";
            ctx.fillRect(-1, -22, 2, 2);	
		}
		else {
            // Default/Chinese -> simplified Rice Hat
            ctx.fillStyle = "#8d6e63"; 
            ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(0, -16); ctx.lineTo(6, -12);
            ctx.quadraticCurveTo(0, -13.5, -6, -12); ctx.fill(); ctx.stroke();
        }
    } else {
// --- SIMPLE HAIR (clean + safe) ---
ctx.fillStyle = "#212121";

// top cap
ctx.beginPath();
ctx.arc(0, -13.5, 3.6, Math.PI, 0);
ctx.fill();

// small side hints (optional, very subtle)
ctx.fillRect(-3.8, -12, 0.8, 2.5);
ctx.fillRect(3.0, -12, 0.8, 2.5);
    }
    } // end of outer useBackView-dispatch else (front headgear chain)
    // headBowOffset wrapper closes here — nothing in the weapons logic
    // below is affected; only Head Base + headgear were shifted.
    ctx.restore();
    }; // end of drawBody closure

    // Normal order: body first, then weapon on top (unchanged today for
    // every unit that isn't a facing-up, low-armor-tier unit).
    if (!useBackView) {
        drawBody();
    }

// 6. WEAPONS LOGIC (Preserved perfectly)
    let weaponBob = isAttacking ? Math.sin(frame * 0.8) * 4 : 0;
    
    if (isFleeing) {
        ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(2 * dir, -4); ctx.lineTo(4 * dir, -22 + weaponBob); ctx.stroke(); 
        ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#cccccc"; ctx.lineWidth = 0.5;
        let flap = moving ? Math.sin(frame * 1.5) * 3 : 0; 
        ctx.beginPath();
        ctx.moveTo(4 * dir, -21 + weaponBob); 
        ctx.quadraticCurveTo((-4 * dir), -22 + weaponBob + flap, (-10 * dir), -18 + weaponBob); 
        ctx.quadraticCurveTo((-6 * dir), -14 + weaponBob - flap, 3 * dir, -12 + weaponBob); 
        ctx.closePath(); ctx.fill(); ctx.stroke();
    } 
	//PEASANTS
	
else if (type === "peasant") {
		
				const isMilitia = unitName === "Militia";
				
			// 1. RESILIENT SEED GENERATION & THEMATIC BANDIT WEAPONS
				let weaponType = 0;
				
				if (unitName === "Club Bandit") {
					weaponType = 7; // Sledgehammer/Club
				} else if (unitName === "Hatchet Bandit") {
					weaponType = 8; // Meat Cleaver (works well as a hatchet)
				} else if (unitName === "Pitchfork Bandit") {
					weaponType = 0; // Pitchfork
				} else if (unitName === "Axe Bandit") {
					weaponType = 2; // Woodcutter's Axe
				} else {
					let seed = 0;
					if (typeof unit !== 'undefined' && unit !== null) {
						if (typeof unit.id === 'number') {
							seed = Math.abs(unit.id);
						} else if (typeof unit.id === 'string') {
							for (let i = 0; i < unit.id.length; i++) {
								seed += unit.id.charCodeAt(i);
							}
						} else {
							if (typeof unit._weaponSeed === 'undefined') {
								unit._weaponSeed = Math.floor(Math.random() * 1000);
							}
							seed = unit._weaponSeed;
						}
					}
					weaponType = seed % 10;
				}
			 

				let wBob = (typeof weaponBob !== 'undefined') ? weaponBob : (typeof bob !== 'undefined' ? bob : 0);
				let maxCd = 300;
				let currentCd = (typeof cooldown !== 'undefined') ? cooldown : 0;
				let cycle = isAttacking ? (maxCd - currentCd) / maxCd : 0;

				// Separate animation profiles based on the weapon
				let isThrusting = (weaponType === 0 || weaponType === 1 || weaponType === 4);
				
				let thrust = 0;
				let swingAngle = 0;

				if (isAttacking) {
					if (isThrusting) {
						// Snappy, rapid thrust animation
						thrust = cycle < 0.2 ? (cycle / 0.2) * 12 : 12 * (1 - (cycle - 0.2) / 0.8);
					} else {
						// Heavy overhead/side swinging animation (used by axes, hammers, scythes)
						swingAngle = Math.sin(cycle * Math.PI) * (Math.PI / 1.5);
					}
				}

				// --- DRAWING MAIN WEAPON ---
				ctx.save();

				// ═══════════════════════════════════════════════════════
				// DOWNWARD FACING (facingDirY===1) — ported this session.
				// This is the "easiest of the remaining types" case flagged
				// in the top-of-file notes: every one of the 10 weapon
				// shapes below (switch on weaponType) is drawn in THIS
				// translate+rotate's local frame, always extending along
				// local +X (e.g. `ctx.lineTo(18*dir,0)`). Redirecting just
				// the pivot and base rotation angle here re-aims all 10
				// shapes at once — the switch-case bodies below need ZERO
				// changes.
				//
				// Side view: pivot sits up-left of the torso (pivotX=-2*dir,
				// pivotY=-4+wBob) and baseAngle (~-60° to -72°) rotates the
				// local +X "forward" axis up and out over the shoulder.
				// Thrust nudges the pivot further along dir (a lunge);
				// swingAngle adds an extra rotation for chopping weapons.
				//
				// Down view: pivot moves down near the hip, centered
				// (small dir offset only, since the body faces the
				// camera symmetrically), and baseAngle uses
				// DOWN_QUADRANT_ANGLE (45°, was a pure 90° originally —
				// see the firelance branch's comments for why 90° was
				// wrong: it produces a shaft with constant screen-X, no
				// lean left/right even when facingDir also indicates
				// the unit is heading diagonally. 45° combined with the
				// existing global facingDir mirror correctly lands in
				// whichever of the 4 heading quadrants applies) so
				// local +X — the same axis every weapon shape extends
				// along — now points down-and-to-the-side instead of
				// up-and-sideways. Thrust becomes a downward lunge
				// (added to pivotY instead of pivotX). swingAngle is
				// kept as an additional rotation exactly as before —
				// for chopping weapons this now swings the down-pointing
				// tool side to side instead of up/across, which is a
				// reasonable first-pass chop toward the viewer.
				//
				// NOTE (peasant, facingDown only): swingAngle's amplitude (Math.PI/1.5, set above)
				// was tuned by eye against the side-view base angle, same
				// caveat as the spearman glaive — if the down-facing chop
				// arc looks too wide/narrow once visually tested, tune it
				// specifically for facingDown rather than assuming it
				// transfers unchanged.
				// ═══════════════════════════════════════════════════════
				// ═══════════════════════════════════════════════════════
				// FACING UP (backshot, gated by useBackView — see the
				// UP_QUADRANT_ANGLE comment above for why): mirrors the
				// facingDown branch, but thrust now SUBTRACTS from
				// pivotY (lunging further away from the viewer, up-
				// screen, instead of toward them) and uses
				// UP_QUADRANT_ANGLE instead of DOWN_QUADRANT_ANGLE.
				// ═══════════════════════════════════════════════════════
				let pivotX, pivotY, baseAngle;
				if (facingDown) {
					pivotX = 1 * dir;
					pivotY = -1 + wBob + (thrust * 0.8);
					baseAngle = DOWN_QUADRANT_ANGLE;
				} else if (facingUp && useBackView) {
					pivotX = 1 * dir;
					pivotY = -1 + wBob - (thrust * 0.8);
					baseAngle = UP_QUADRANT_ANGLE;
				} else {
					pivotX = -2 * dir;
					pivotY = -4 + wBob;
					baseAngle = isThrusting ? -Math.PI / 3 : -Math.PI / 2.5;
				}

				const peasantVerticalMode = facingDown || (facingUp && useBackView);
				ctx.translate(pivotX + (peasantVerticalMode ? 0 : thrust * dir), pivotY);
				ctx.rotate(baseAngle + (swingAngle * dir));

				let woodColor = "#5d4037";
				let metalColor = isMilitia ? "#bdbdbd" : "#757575";

				switch(weaponType) {
					case 0: // Pitchfork
						ctx.strokeStyle = woodColor; ctx.lineWidth = 1.6; ctx.lineCap = "round";
						ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18 * dir, 0); ctx.stroke();
						ctx.strokeStyle = metalColor; ctx.lineWidth = 1.2;
						let pHeadX = 18 * dir;
						ctx.beginPath(); ctx.moveTo(pHeadX, -3); ctx.lineTo(pHeadX, 3); ctx.stroke();
						for (let i = -1; i <= 1; i++) {
							ctx.beginPath(); ctx.moveTo(pHeadX, i * 2.5); ctx.lineTo(pHeadX + (6 * dir), i * 2.5); ctx.stroke();
						}
						ctx.fillStyle = "#3e2723"; ctx.fillRect(pHeadX - (2 * dir), -1.5, 2 * dir, 3);
						break;

					case 1: // Bamboo Spear
						ctx.strokeStyle = "#827717"; ctx.lineWidth = 1.8;
						ctx.beginPath(); ctx.moveTo(-2 * dir, 0); ctx.lineTo(18 * dir, 0); ctx.stroke();
						ctx.strokeStyle = "#558b2f"; ctx.lineWidth = 1;
						ctx.beginPath(); ctx.moveTo(4 * dir, -1.5); ctx.lineTo(4 * dir, 1.5); ctx.stroke();
						ctx.beginPath(); ctx.moveTo(10 * dir, -1.5); ctx.lineTo(10 * dir, 1.5); ctx.stroke();
						ctx.fillStyle = "#4e342e";
						ctx.beginPath(); ctx.moveTo(18 * dir, -1.2); ctx.lineTo(24 * dir, 0); ctx.lineTo(18 * dir, 1.2); ctx.fill();
						break;

					case 2: // Woodcutter's Axe
						ctx.strokeStyle = woodColor; ctx.lineWidth = 2;
						ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(12 * dir, 0); ctx.stroke();
						ctx.fillStyle = metalColor;
						ctx.beginPath(); ctx.moveTo(10 * dir, -1); ctx.lineTo(13 * dir, -5); ctx.lineTo(14 * dir, 2); ctx.lineTo(10 * dir, 1); ctx.fill();
						break;

					case 3: // Mining Pickaxe
						ctx.strokeStyle = woodColor; ctx.lineWidth = 2;
						ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14 * dir, 0); ctx.stroke();
						ctx.strokeStyle = metalColor; ctx.lineWidth = 2.5; ctx.lineCap = "square";
						ctx.beginPath(); ctx.moveTo(13 * dir, -6); ctx.quadraticCurveTo(15 * dir, 0, 13 * dir, 6); ctx.stroke();
						break;

					case 4: // Small Dagger
						ctx.strokeStyle = woodColor; ctx.lineWidth = 1.5;
						ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(3 * dir, 0); ctx.stroke();
						ctx.fillStyle = metalColor;
						ctx.beginPath(); ctx.moveTo(3 * dir, -1); ctx.lineTo(9 * dir, 0); ctx.lineTo(3 * dir, 1); ctx.fill();
						break;

					case 5: // Sickle
						ctx.strokeStyle = woodColor; ctx.lineWidth = 1.5;
						ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(8 * dir, 0); ctx.stroke();
						ctx.strokeStyle = metalColor; ctx.lineWidth = 2; ctx.lineCap = "round";
						ctx.beginPath(); ctx.moveTo(7 * dir, 0); ctx.quadraticCurveTo(12 * dir, -2, 9 * dir, -6); ctx.stroke();
						break;

					case 6: // Farming Hoe
						ctx.strokeStyle = woodColor; ctx.lineWidth = 2;
						ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(15 * dir, 0); ctx.stroke();
						ctx.fillStyle = metalColor;
						ctx.fillRect(13 * dir, 0, 2 * dir, 5); // Flat metal blade extending downwards
						break;

					case 7: // Blacksmith Sledgehammer
						ctx.strokeStyle = woodColor; ctx.lineWidth = 2.2;
						ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14 * dir, 0); ctx.stroke();
						ctx.fillStyle = metalColor;
						ctx.fillRect(12 * dir, -3, 4 * dir, 6); // Heavy block head
						break;

					case 8: // Meat Cleaver
						ctx.strokeStyle = woodColor; ctx.lineWidth = 1.8;
						ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(4 * dir, 0); ctx.stroke();
						ctx.fillStyle = metalColor;
						ctx.fillRect(4 * dir, -3, 6 * dir, 5); // Broad rectangular blade
						ctx.beginPath(); ctx.arc(9 * dir, -2, 0.5, 0, Math.PI*2); ctx.fillStyle = "#424242"; ctx.fill(); // Hole in the cleaver
						break;

					case 9: // War Scythe
						ctx.strokeStyle = woodColor; ctx.lineWidth = 2;
						ctx.beginPath(); ctx.moveTo(-2 * dir, 0); ctx.lineTo(18 * dir, 0); ctx.stroke(); // Long pole
						ctx.strokeStyle = metalColor; ctx.lineWidth = 1.5; ctx.lineCap = "round";
						ctx.beginPath(); ctx.moveTo(17 * dir, 0); ctx.quadraticCurveTo(19 * dir, -8, 14 * dir, -10); ctx.stroke(); // Hooking blade
						break;
				}

				ctx.restore();

				// --- DRAWING OFF-HAND / SHIELD ---
				// MOVED per user feedback: shield now draws AFTER the
				// main weapon (was before), so it takes visual priority
				// over the weapon like a blanket, instead of the weapon
				// drawing on top of it as before.
				//
				// To keep a downward stab from being completely hidden
				// behind that priority, the shield shifts away — further
				// out to the side AND up — specifically while attacking
				// with facingDown active (shieldExtraX/shieldExtraY,
				// both 0 in every other case: normal side-view idle,
				// side-view attacking, or facingDown but not attacking).
				// This is on top of the existing small `shieldPush` (already
				// present before this session, a minor sideways nudge for
				// ANY attack regardless of facing) rather than replacing it.
				if ([4, 5, 8].includes(weaponType)) {
					ctx.save();
					let shieldPush = isAttacking ? 2 : 0;
					let shieldExtraX = (facingDown && isAttacking) ? 3 : 0;
					let shieldExtraY = (facingDown && isAttacking) ? -3 : 0;
					ctx.translate((2 + shieldPush + shieldExtraX) * dir, -3 + wBob + shieldExtraY);
					
					if (weaponType === 4) {
			 
							// --- Chinese Tengpai (Woven Rattan Shield) ---
							ctx.save();
							let shieldRadius = 8; // Medium-large circular shield
							
							// 1. Base Rattan Color (Light Straw/Gold)
							ctx.fillStyle = "#e3c58d"; 
							ctx.beginPath();
							ctx.arc(0, 0, shieldRadius, 0, Math.PI * 1.5);
							ctx.fill();

							// 2. Woven Coils (Concentric rings to show the rattan wrap)
							ctx.strokeStyle = "#a0522d"; // Golden brown
							ctx.lineWidth = 0.6;
							for (let r = 1; r <= shieldRadius; r += 1.5) {
								ctx.beginPath();
								ctx.arc(0, 0, r, 0, Math.PI * 2);
								ctx.stroke();
							}

							// 3. The Radial Weave (The "Star" pattern that binds the coils)
							ctx.strokeStyle = "#6d4c41"; // Darker brown for depth
							ctx.lineWidth = 0.4;
							for (let i = 0; i < 12; i++) {
								let angle = (i * Math.PI) / 6;
								ctx.beginPath();
								ctx.moveTo(0, 0);
								// We use a slight curve or dashed line to simulate weaving over/under
								ctx.lineTo(Math.cos(angle) * shieldRadius, Math.sin(angle) * shieldRadius);
								ctx.stroke();
							}

							// 4. Central "Peak" (The reinforced center point)
							ctx.fillStyle = "#8d6e63";
							ctx.beginPath();
							ctx.arc(0, 0, 2, 0, Math.PI * 2);
							ctx.fill();
							// Tiny highlight on the peak
							ctx.fillStyle = "#ffe0b2";
							ctx.beginPath();
							ctx.arc(-0.5 * dir, -0.5, 0.5, 0, Math.PI * 2);
							ctx.fill();

							// 5. Reinforced Outer Rim
							ctx.strokeStyle = "#5d4037";
							ctx.lineWidth = 1.2;
							ctx.beginPath();
							ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
							ctx.stroke();

							ctx.restore();
			}
					

					else if (weaponType === 5) {
				// --- Improvised Plank Shield (Worn/Scrap Wood) ---
				ctx.save();
				
				let sW = 7;  // Total width
				let sH = 12; // Total height
				let xOff = -3.5 * dir; // Center the shield on the arm
				
				// 1. Draw 3 individual vertical planks
				let plankWidth = sW / 3;
				let woodColors = ["#795548", "#6d4c41", "#8d6e63"]; // Slight variations in wood tone
				
				for (let i = 0; i < 3; i++) {
					ctx.fillStyle = woodColors[i];
					ctx.fillRect(xOff + (i * plankWidth * dir), -sH/2, plankWidth * dir, sH);
					
					// Plank gaps/outlines
					ctx.strokeStyle = "#3e2723";
					ctx.lineWidth = 0.5;
					ctx.strokeRect(xOff + (i * plankWidth * dir), -sH/2, plankWidth * dir, sH);
				}

				// 2. Horizontal Cross-Braces (The "Battens" holding them together)
				ctx.fillStyle = "#5d4037";
				// Top brace
				ctx.fillRect(xOff - (0.5 * dir), -4, (sW + 1) * dir, 2);
				// Bottom brace
				ctx.fillRect(xOff - (0.5 * dir), 2, (sW + 1) * dir, 2);

				// 3. Iron Nails (Tiny silver dots on the braces)
				ctx.fillStyle = "#bdbdbd";
				for (let row = -3; row <= 3; row += 6) { // Top and bottom brace
					for (let col = 0; col < 3; col++) { // One nail per plank
						let nailX = xOff + (col * plankWidth + plankWidth/2) * dir;
						ctx.beginPath();
						ctx.arc(nailX, row, 0.4, 0, Math.PI * 2);
						ctx.fill();
					}
				}

				// 4. Rough/Chipped Edges (Optional: adds a jagged look)
				ctx.strokeStyle = "#3e2723";
				ctx.lineWidth = 1;
				ctx.strokeRect(xOff, -sH/2, sW * dir, sH);

				ctx.restore();
			}
			else if (weaponType === 8) {
				// --- Chinese Steamer Lid (Flipped/Inside View) ---
				ctx.save();
				let shieldRadius = 9; // Large, prominent size
				
				// 1. The Main Circular Base
				ctx.fillStyle = "#d2b48c"; // Bamboo Tan
				ctx.beginPath();
				ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
				ctx.fill();

				// 2. The "Blanks" (Radial Bamboo Support Slats)
				// We draw lines from the center to the edge to look like the internal structure
				ctx.strokeStyle = "#a0522d"; // Darker bamboo brown
				ctx.lineWidth = 1;
				for (let i = 0; i < 8; i++) {
					let angle = (i * Math.PI) / 4;
					ctx.beginPath();
					ctx.moveTo(0, 0);
					ctx.lineTo(Math.cos(angle) * shieldRadius, Math.sin(angle) * shieldRadius);
					ctx.stroke();
				}

				// 3. Inner Binding Rings
				// These hold the slats together
				ctx.beginPath();
				ctx.arc(0, 0, shieldRadius * 0.4, 0, Math.PI * 2);
				ctx.stroke();
				
				ctx.beginPath();
				ctx.arc(0, 0, shieldRadius * 0.7, 0, Math.PI * 2);
				ctx.stroke();

				// 4. Thick Outer Rim (The deep edge of the lid)
				ctx.strokeStyle = "#8b4513";
				ctx.lineWidth = 1.8;
				ctx.beginPath();
				ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
				ctx.stroke();

				ctx.restore();
			}
			ctx.restore();
				}
}
else if (type === "spearman") {
        const safeName = unitName || "";
        const isGlaive = safeName === "Glaiveman" || safeName.includes("Glaive");

        // --- 1. Improved Attack Animations ---
        const attackProgress = isAttacking ? (Math.sin(frame * 0.8) * 0.5 + 0.5) : 0;
        
        let thrust = 0;
        let lift = 0;
        let swingAngleOffset = 0;

        if (isGlaive) {
            // GLAIVE: Weighted downward swing/chop
            thrust = isAttacking ? 5 * attackProgress : 0; // Less forward movement
            lift = isAttacking ? 8 * Math.sin(frame * 0.8) : 0; // Drops the tip
            swingAngleOffset = isAttacking ? (Math.sin(frame * 0.8) * 0.6) * dir : 0; // Rotates the shaft
        } else {
            // SPEAR: Sharp linear forward stab
            thrust = isAttacking ? 16 * Math.pow(attackProgress, 1.5) : 0; // Snappy thrust
            lift = isAttacking ? -2 * attackProgress : 0; // Keeps it mostly level
            swingAngleOffset = 0;
        }

        // --- 2. Shaft Placement & Pivot ---
        // ═══════════════════════════════════════════════════════════
        // DOWNWARD FACING (facingDirY===1) — v1, this session.
        // Everything below this comment through the shaftAngle line is
        // the ONLY thing that changes for the down-facing pose. The
        // atan2/hypot/cos/sin math two lines down, the shaft stroke,
        // the blade-head drawing (translate+rotate to finalEndX/Y), the
        // socket, and the shield are all generic w.r.t. angle and need
        // ZERO changes — they already work for any shaftAngle, because
        // they were written in terms of the computed endpoint rather
        // than assuming a horizontal orientation. That's what makes
        // this branch cheap to redirect.
        //
        // Normal (side-view) stance: hand starts behind+below the torso
        // (shaftStartX=-7*dir, Y=4) and the tip reaches up-and-forward
        // over the shoulder (baseEndX out along dir, baseEndY=-24, i.e.
        // well above the body) — thrust/lift modulate that reach along
        // X and wobble it along Y respectively.
        //
        // Down-facing stance: the character is drawn facing the camera
        // (see the big VERTICAL FACING comment above — the body art is
        // already front-on), so the natural thrust direction is now
        // toward the viewer = down-screen = +Y. Hand starts near the
        // hip (small dir offset, roughly centered), tip reaches DOWN
        // past the feet. thrust/lift now modulate along Y/X instead of
        // X/Y — i.e. the two axes are swapped relative to the side view:
        //   side view : reach = X * dir (+thrust), wobble = Y (+lift)
        //   down view : reach = Y       (+thrust), wobble = X * dir (+lift)
        // V_START_X/Y and V_REACH are tunable — chosen to visually land
        // the spear tip a bit beyond the feet at idle, same relative
        // proportions as the side-view idle reach. Future session: eyeball
        // these against the actual sprite scale and adjust if the tip
        // looks too short/long or the hand sits at the wrong height.
        const wBobSpear = (typeof weaponBob !== 'undefined' ? weaponBob : 0);

        const V_START_X = 2;   // hip offset, *dir for subtle handedness (mirrors with facingDir)
        const V_START_Y = 3;   // hand height, near the hip
        const V_REACH   = 24;  // idle reach down-screen before thrust/wobble is applied

        // BUGFIX (facingUp — spear/glaive didn't point up): shaftStartX/Y
        // and baseEndX/Y used to only branch on facingDown vs side-view,
        // so a facingUp spearman/glaiveman fell through to the SIDE-VIEW
        // numbers and kept thrusting sideways instead of up-screen. The
        // facingUp branch below mirrors the facingDown one vertically —
        // same V_START_X/V_START_Y/V_REACH constants, just negated on Y
        // (hand sits just above the hip instead of below it, tip reaches
        // up past the head instead of down past the feet) — using the
        // same reasoning peasant's pivotY already uses (thrust subtracts
        // instead of adds when facing away from the camera).
        const shaftStartX = facingDown ? (V_START_X * dir) : (facingUp ? (V_START_X * dir) : (-7 * dir));
        const shaftStartY = facingDown ? V_START_Y          : (facingUp ? -V_START_Y : 4);

        // Base coordinates before rotation
        // side view : baseEndX carries the dir-reach + thrust; baseEndY carries the lift wobble.
        // down/up view : baseEndY carries the reach (down- or up-screen) + thrust; baseEndX carries the lift wobble.
        const baseEndX = facingDown
            ? (lift * dir)
            : (facingUp ? (lift * dir) : ((28 + wBobSpear + thrust) * dir));
        const baseEndY = facingDown
            ? (V_REACH + wBobSpear + thrust)
            : (facingUp ? -(V_REACH + wBobSpear + thrust) : (-24 + wBobSpear + lift));

        // NOTE (glaive, facingDown only): swingAngleOffset's amplitude
        // (±0.6 rad, set in step 1 above) was tuned by eye against the
        // side-view base angle. It's applied identically here since the
        // math is angle-agnostic, but nobody has visually confirmed the
        // chop still reads well swinging around a ~90°-down base instead
        // of the original ~diagonal-up base. If the down-facing glaive
        // chop looks off (too wide/narrow an arc), tune this amplitude
        // specifically for facingDown rather than assuming it transfers.
        let shaftAngle = Math.atan2(baseEndY - shaftStartY, baseEndX - shaftStartX);
        shaftAngle += swingAngleOffset; // Apply the glaive's rotational swing

        // Calculate final end coordinates using the new angle to keep the shaft connected
        const length = Math.hypot(baseEndX - shaftStartX, baseEndY - shaftStartY);
        const finalEndX = shaftStartX + Math.cos(shaftAngle) * length;
        const finalEndY = shaftStartY + Math.sin(shaftAngle) * length;

        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // --- 3. Draw Shaft (Standard Wood) ---
        ctx.strokeStyle = "#4e342e";
        ctx.lineWidth = 2.2; 
        ctx.beginPath();
        ctx.moveTo(shaftStartX, shaftStartY);
        ctx.lineTo(finalEndX, finalEndY);
        ctx.stroke();

        // --- 4. Draw Head (Small, Cheap Iron) ---
        ctx.fillStyle = "#757575"; 
        ctx.strokeStyle = "#424242";
        ctx.lineWidth = 0.5;
        
        ctx.save();
        ctx.translate(finalEndX, finalEndY);
        ctx.rotate(shaftAngle);

        ctx.beginPath();
        if (isGlaive) {
            // Glaive: Slightly shorter and more curved
            ctx.moveTo(0, -1.5);
            ctx.quadraticCurveTo(8, -4, 12, 0); 
            ctx.lineTo(10, 2); 
            ctx.lineTo(0, 1.5);
        } else {
            // Spear: Small needle-point leaf blade
            ctx.moveTo(-2, 0);    
            ctx.lineTo(0, -2);    
            ctx.lineTo(7, 0);     
            ctx.lineTo(0, 2);     
            ctx.closePath();
        }
        ctx.fill();
        ctx.stroke();

        // Socket binding
        ctx.fillStyle = "#2b1b17";
        ctx.fillRect(-2, -1.2, 3, 2.4);
        
        ctx.restore();

        // --- 5. Shield (Only if applicable) ---
        if (safeName.includes("Shield")) {
            ctx.fillStyle = "#5d4037";
            ctx.strokeStyle = "#3e2723";
            ctx.lineWidth = 1;
            const wB = (typeof weaponBob !== 'undefined' ? weaponBob : 0);
            const shieldX = (6 + wB / 2) * dir;
            const shieldY = -4 + (isAttacking ? 2 : 0);

            ctx.beginPath();
            ctx.arc(shieldX, shieldY, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            ctx.fillStyle = "#757575";
            ctx.beginPath();
            ctx.arc(shieldX, shieldY, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
    else if (type === "sword_shield") {
    const attackPulse = isAttacking ? (Math.sin(frame * 0.9) + 1) * 0.5 : 0;
    const wBobSS = (typeof weaponBob !== 'undefined') ? weaponBob : 0;

    // ═══════════════════════════════════════════════════════════
    // DOWNWARD FACING (facingDirY===1) — ported this session.
    // Same approach as spearman: only the saber's local start/end
    // points and the translate/tilt wrapper change axis; the fill
    // style, stroke, and the shield block below are untouched.
    //
    // Side view: blade runs from a fixed shoulder point (0,-6) out
    // to (X*dir, Y) where X carries reach+bob and Y is mostly fixed
    // (a diagonal cut up-and-out). swingX/swingY nudge the WHOLE
    // blade sideways/up during the attack pulse; tilt adds a small
    // extra rotation.
    //
    // Down view: blade should swing toward the viewer instead, so
    // the fixed point moves down near the hip and the reach goes
    // down-screen (+Y) with a small dir-based sideways wobble (X)
    // for the cut's arc. The attack-pulse nudge (swingX/swingY) is
    // likewise swapped: down-screen push instead of sideways push.
    // Tilt keeps the same small-rotation role in both cases.
    // ═══════════════════════════════════════════════════════════
    const swingX = facingDown
        ? (isAttacking ? 1 * attackPulse : 0)
        : (isAttacking ? 4 * attackPulse : 0);
    const swingY = facingDown
        ? (isAttacking ? 3 * attackPulse : 0)
        : (isAttacking ? -2 * attackPulse : 0);
    const tilt = isAttacking ? -0.25 * attackPulse * dir : 0;

    ctx.save();

    // --- SWORD (same shape, just transformed) ---
    ctx.strokeStyle = "#9e9e9e";
    ctx.lineWidth = 2.5;

    ctx.save();
    ctx.translate(swingX * dir, swingY);
    ctx.rotate(tilt);

    ctx.beginPath();
    if (facingDown) {
        ctx.moveTo(0, -2);
        ctx.lineTo((3 + wBobSS * 0.3) * dir, 15 + wBobSS);
    } else {
        ctx.moveTo(0, -6);
        ctx.lineTo((14 + wBobSS) * dir, -12 + (wBobSS / 2));
    }
    ctx.stroke();

    ctx.restore();

    // --- SHIELD (very minor reactive movement) ---
    // Left untouched for facingDown: a shield strapped to the off-arm
    // still reasonably reads as held to one side even facing the
    // camera, and it isn't a "delicate weapon animation" — no need to
    // redirect a static accessory position. Revisit if it looks wrong
    // once this is visually tested.
    const shieldX = (6 + wBobSS / 2) * dir + (isAttacking ? -1.5 * attackPulse * dir : 0);
    const shieldY = -4 + (isAttacking ? 1 * attackPulse : 0);

    ctx.fillStyle = "#5d4037";
    ctx.strokeStyle = "#3e2723";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.arc(shieldX, shieldY, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#424242";
    ctx.beginPath();
    ctx.arc(shieldX, shieldY, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}
else if (type === "two_handed") {
    const attackPulse = isAttacking ? (Math.sin(frame * 0.7) + 1) * 0.5 : 0;
    const wBobTH = (typeof weaponBob !== 'undefined') ? weaponBob : 0;

    // Big, heavy swing
    const swingArc = isAttacking ? attackPulse : 0;
    const lift = isAttacking ? -10 * (1 - swingArc) : 0;   // wind-up
    const drop = isAttacking ? 14 * swingArc : 0;          // strike

    // ═══════════════════════════════════════════════════════════
    // DOWNWARD FACING (facingDirY===1) — ported this session.
    // The blade geometry itself (moveTo/quadraticCurveTo below) is
    // UNCHANGED — this weapon already draws its curve through a
    // rotation, so redirecting is just adding a quarter-turn to that
    // rotation, same trick as peasant's baseAngle change.
    //
    // Side view: `rotation` sweeps roughly -63° to +52° during the
    // attack (wind-up raised behind/above → struck forward-down at
    // roughly torso height) — a diagonal overhead cut.
    // Down view: adding +90° (Math.PI/2) to that SAME sweep moves the
    // strike pose (full swingArc) to point almost straight down-screen
    // (~28 units below the anchor, computed by hand), and the wind-up
    // pose to a raised-and-to-one-side pose (not perfectly centered
    // overhead — this reuses the existing dir-dependent sweep rather
    // than a from-scratch symmetric redesign, so the wind-up leans to
    // whichever side `dir` last faced, which reads fine as "wound up
    // over one shoulder before striking down at the viewer" but hasn't
    // been visually confirmed). The translate's lift/drop (anchor
    // raises on wind-up, lowers on strike) stays on the Y axis
    // unchanged for both views — that motion still makes sense facing
    // the camera.
    // NOTE (two_handed, facingDown only): like the other overhead/chop weapons ported this session,
    // this specific rotation sweep was carried over as-is rather than
    // re-tuned for facingDown; flag for visual re-tuning next pass if
    // the wind-up/strike arc looks off.
    // ═══════════════════════════════════════════════════════════
    const baseRotation = isAttacking ? (-1.1 + 2.0 * swingArc) : -0.15;
    const rotation = facingDown
        ? (Math.PI / 2) + (baseRotation * dir)
        : (baseRotation * dir);

    ctx.save();

    // Move weapon anchor for full-body swing feel
    ctx.translate(2 * dir, lift + drop);
    ctx.rotate(rotation);

    // --- MAIN WEAPON (unchanged geometry) ---
    ctx.strokeStyle = "#757575";
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.moveTo(-2 * dir, -4);
    ctx.quadraticCurveTo(
        (10 + wBobTH) * dir,
        -10 + wBobTH,
        (18 + wBobTH) * dir,
        -22 + wBobTH
    );
    ctx.stroke();

    // --- HANDLE / GRIP ---
    ctx.strokeStyle = "#212121";
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(2 * dir, -7);
    ctx.stroke();

    ctx.restore();

    // Optional: subtle motion blur line during attack
    // Redirected for facingDown: the blur streak should follow the
    // blade's new mostly-vertical strike direction instead of the
    // side view's horizontal-diagonal one, or it would look like a
    // sideways smear on a downward-striking weapon.
    if (isAttacking) {
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (facingDown) {
            ctx.moveTo(-3 * dir, -8);
            ctx.lineTo(3 * dir, 14);
        } else {
            ctx.moveTo(-4 * dir, -6);
            ctx.lineTo(12 * dir, 6);
        }
        ctx.stroke();
    }
} else if (type === "archer") {
	    let b = (typeof bob !== 'undefined') ? bob : 0; 
	    let ammo = (typeof unitAmmo !== 'undefined') ? unitAmmo : 1; 

	    ctx.save();
	    ctx.translate(0, b); // Apply global bob to the whole unit

	    // --- THE QUIVER (On the back, visible in both modes) ---
	    ctx.fillStyle = "#3e2723"; ctx.fillRect(-5, -6, 4, 10);
	    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 0.5;
	    ctx.beginPath(); ctx.moveTo(-3, -6); ctx.lineTo(-1, -12); ctx.stroke(); 

	    // --- OUT OF AMMO: Melee Fallback ---
	    if (ammo <= 0) {
	        let meleeCycle = isAttacking ? (Date.now() / 600) % 1.0 : 0;
	        let swingAngle = isAttacking ? Math.sin(meleeCycle * Math.PI) * (Math.PI / 1.5) : 0;

// 1. Draw Stowed Bow on the back
// Left untouched for facingDown — a bow strapped across the back is a
// static prop (same reasoning as the quiver/shields elsewhere), not
// part of the active melee weapon that needs to aim at anything.
	        ctx.save();
	        ctx.translate(-3, -1);
	        ctx.rotate(Math.PI / 1.2); 
	        
	        let isJapanBack = (factionColor === "#c2185b") || (window.__campaignStory1Active && unit && unit.side === 'player');
	        let stowTopY = isJapanBack ? -28 : -18; // Yumi extra long top limb
	        let stowBotY = isJapanBack ? 12 : 18;   // Yumi shorter bottom limb
	        let stowTopDip = isJapanBack ? -10 : -6;
	        
	        // Bow Limbs
	        ctx.strokeStyle = isJapanBack ? "#1a1a1a" : "#4e342e"; // Dark lacquer for Japan
	        ctx.lineWidth = 2;
	        ctx.beginPath(); 
	        ctx.moveTo(-5, stowTopY); 
	        ctx.quadraticCurveTo(3, stowTopDip, -1, 0); 
	        ctx.quadraticCurveTo(3, 6, -5, stowBotY);  
	        ctx.stroke();
	        
	        // Taut Bowstring
	        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)"; ctx.lineWidth = 0.6;
	        ctx.beginPath(); ctx.moveTo(-5, stowTopY); ctx.lineTo(-5, stowBotY); ctx.stroke();
	        ctx.restore();
	        // 2. Draw Shortsword & Hand
	        // Same Math.PI base-rotation trick as the shared "shortsword"
	        // fallback branch elsewhere in this file — this blade is drawn
	        // along the same local -Y convention (fillRect(-1.5,-14,3,14),
	        // i.e. pointing straight up at rest), so a half-turn aims it
	        // down-screen instead, dir-invariant for the same reason
	        // (cos/sin of +-pi are identical).
	        ctx.save();
	        ctx.translate(4, -8); 
	        ctx.rotate(swingAngle + (facingDown ? Math.PI : 0));
	        
	        ctx.fillStyle = "#ffccbc"; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI*2); ctx.fill(); 
	        ctx.fillStyle = "#9e9e9e"; ctx.fillRect(-1.5, -14, 3, 14); 
	        ctx.beginPath(); ctx.moveTo(-1.5, -14); ctx.lineTo(0, -17); ctx.lineTo(1.5, -14); ctx.fill(); 
	        ctx.fillStyle = "#5d4037"; ctx.fillRect(-1, 0, 2, 4); 
	        ctx.fillStyle = "#e0e0e0"; ctx.fillRect(-3, -2, 6, 2); 
	        ctx.restore();

	        ctx.restore(); 
	        // This branch returns early (bypassing the normal end-of-
	        // function backshot dispatch below) — if we don't also draw
	        // the body here for the useBackView case, a facing-up,
	        // low-armor-tier archer out of ammo would render with NO
	        // BODY AT ALL (weapon drawn, then immediate return, function
	        // exits before ever reaching `if (useBackView) drawBody()`
	        // near the very end of drawInfantryUnit). Mirror that same
	        // call here so this path stays consistent with every other
	        // exit from the weapons-dispatch chain.
	        if (useBackView) { drawBody(); }
	        return; 
	    }

// --- RANGED COMBAT ---
	
	// SURGERY: Dynamically fetch reload time so future tweaks never break sync
	let maxCool = (typeof getReloadTime === 'function' && typeof unit !== 'undefined') ? getReloadTime(unit) : 170; 
	let cdown = (typeof cooldown !== 'undefined') ? cooldown : 0;
	
	// ---> THE FIX: DECOUPLE FROM FLAWED ENGINE VARIABLE <---
	// troop_system.js turns 'isAttacking' false when cooldown hits 30!
	// We MUST ignore it and track the cooldown directly to 0, just like the Horse Archer.
	let isActionActive = (unit.state === "attacking" && cdown > 0); 
	if (isActionActive) unit._lastBowActiveMs = Date.now();
	
	// cycle progresses perfectly from 0.0 (attack starts) to 1.0 (projectile spawns)
	let cycle = isActionActive ? Math.max(0, Math.min(1.0, 1.0 - (cdown / maxCool))) : 0;
	let handX = 6, handY = -8;
	
	// Strict Anchor Points
	let restX = handX - 5; 
	let restY = handY;
	let quiverX = -2;
	let quiverY = -12;
	let fullDrawX = handX - 16;
	let fullDrawY = handY;

	// State Variables
	let drawHandX = restX;
	let drawHandY = restY;
	let stringX = restX;
	let stringY = restY;
	let hasArrow = false;
	let arrowAngle = 0;
	let bowKhatra = 0;

	// Phase Logic
// --- SURGERY: INITIAL STATE NOCKED & READY ---
	if (!isActionActive) {
		// Post-shot ready: 30% draw. After 1.5s of no shooting: ~10% draw (genuinely relaxed).
		let _msIdle = Date.now() - (unit._lastBowActiveMs || 0);
		let readyPull = (_msIdle < 1500) ? 0.3 : 0.1;
		drawHandX = restX + (fullDrawX - restX) * readyPull;
		drawHandY = restY;
		stringX = drawHandX; 
		stringY = drawHandY;
		hasArrow = true;
		arrowAngle = 0; // Pointing straight forward
	} else if (cycle < 0.15) {
        // ... (rest of your phases)
		// 1. Reach back to quiver
		let ph = cycle / 0.15;
		drawHandX = restX + (quiverX - restX) * ph; 
		drawHandY = restY + (quiverY - restY) * ph;
	} else if (cycle < 0.35) { 
		// 2. Pull arrow out and bring to string (Nocking)
		let ph = (cycle - 0.15) / 0.20;
		drawHandX = quiverX + (restX - quiverX) * ph; 
		drawHandY = quiverY + (restY - quiverY) * ph;
		hasArrow = true;
		arrowAngle = (-Math.PI / 1.5) * (1 - ph); // Rotate arrow into position
	} else if (cycle < 0.75) { 
		// 3. Draw the bow
		let ph = (cycle - 0.35) / 0.40; 
		let easeOut = 1 - Math.pow(1 - ph, 3); // Smooth pull
		drawHandX = restX + (fullDrawX - restX) * easeOut;
		drawHandY = restY + (fullDrawY - restY) * easeOut;
		hasArrow = true;
		stringX = drawHandX; // String follows hand
		stringY = drawHandY;
} else if (cycle < 0.95) { 
		// 4. Hold full draw (Tightened to match Horse Archer timing)
		drawHandX = fullDrawX;
		drawHandY = fullDrawY;
		hasArrow = true; // Arrow stays NOCKED during the hold
		stringX = fullDrawX; 
		stringY = fullDrawY;
	} else { 
		// 5. Loose / Khatra (The "Snap" window: 0.95 to 1.0)
		let ph = (cycle - 0.95) / 0.05; 
		
		// SURGERY: The arrow vanishes instantly the moment the string snaps forward.
		// This restores the perfect visual sync seen in the Horse Archer.
		hasArrow = false; 
		
		// The String snaps to rest instantly (snappy feel)
		stringX = restX; 
		stringY = restY;

		// The Hand follows through more realistically
		drawHandX = fullDrawX + (restX - fullDrawX) * ph;
		drawHandY = fullDrawY + (restY - fullDrawY) * ph;

		// Khatra (Bow Twist) - Peak twist mid-release
		bowKhatra = 0.4 * Math.sin(ph * Math.PI); 
	}

// --- BOW RENDERING (With dynamic limb tension) ---
	let tension = (restX - stringX) / (restX - fullDrawX); // 0 at rest, 1 at full draw
	let tipX = (handX - 5) - (tension * 4); // Limbs bend back up to 4px
	let dipX = (handX + 4) - (tension * 2); // Belly flattens slightly

	// isJapan already declared at top of function
	let topTipY = isJapan ? -38 : -23; // Extreme asymmetric upper limb for Yumi
	let botTipY = isJapan ? 2 : 7;     // Shorter lower limb
	let topDipY = isJapan ? -20 : -13; // Adjust upper bending curve
	let botDipY = isJapan ? -4 : -3;   // Adjust lower bending curve

	// ═══════════════════════════════════════════════════════════════
	// DOWNWARD FACING (facingDirY===1) — ranged aiming, ported this
	// session. This is a genuinely different problem from the melee
	// redirects done earlier: a bow's limb shape is ALREADY drawn
	// mostly along the vertical axis (topTipY/botTipY span a tall
	// range) with only a slight horizontal belly-bend (tipX/dipX) —
	// unlike a melee weapon's clear single "reach" axis, there's no
	// one coordinate to swap. Instead, TWO SEPARATE techniques are
	// used here for two separate pieces of geometry, and it matters
	// which one goes where:
	//
	// (1) LIMBS + STRING — drawn entirely inside the existing
	//     `ctx.translate(handX,handY); ctx.rotate(bowKhatra);
	//     ctx.translate(-handX,-handY);` wrapper, which already
	//     rotates the whole bow shape around the grip point for the
	//     release-twist wobble. Adding a fixed +90° (Math.PI/2) to
	//     that SAME rotation turns the bow's tall vertical silhouette
	//     into a wide horizontal one, held up perpendicular to a
	//     downward-flying arrow — exactly the shape a top-down bow
	//     aimed at the viewer should have. tipX/dipX/topTipY/botTipY/
	//     stringX/stringY below are all left completely unchanged —
	//     the ambient wrapper handles the redirect for everything
	//     drawn inside it, same "leave the shape generic" approach
	//     used throughout this session.
	//
	// (2) ARROW + DRAW HAND — drawn in their OWN separate transform,
	//     AFTER this wrapper's ctx.restore() has already run, so they
	//     do NOT get the above rotation for free. If the phase-logic
	//     variables above (restX/fullDrawX/quiverX etc.) were instead
	//     redefined to swap X/Y at the source — the approach used for
	//     the melee weapons earlier — the string vertex (which reuses
	//     those same drawHandX/drawHandY-derived values HERE and is
	//     ALSO caught by the wrapper in (1)) would get rotated TWICE
	//     and end up wrong. So instead, drawHandX/drawHandY are left
	//     completely untouched by the phase logic above (all 5 phases,
	//     unmodified), and only rotated MANUALLY, once, at the point
	//     they're actually used below for the arrow and hand — via
	//     rotate90AroundHand, a simple rotate-a-point-around-the-grip
	//     helper local to this branch. This keeps a single source of
	//     truth for "where is the string/hand" and applies the aim
	//     redirect exactly once, in exactly the right place.
	//
	// NOTE: the quiver reach phase (cycle<0.15) flows through this
	// same manual rotation automatically (it's just another value
	// drawHandX/drawHandY passes through), so the hand appears to
	// reach up-and-behind the grip for that beat rather than to the
	// side — not perfectly anatomically justified (a real quiver stays
	// on the back regardless of aim direction) but close enough to
	// read fine for a fast 15%-of-cycle transition. Flag for revisit
	// if it looks wrong once visually tested.
	// NOTE: because this is a literal rotation of the SAME coordinates
	// (not hand-authored down-facing constants like the melee weapons
	// got), the rotated bow ends up centered slightly above/behind the
	// grip rather than perfectly bisected by it — a minor cosmetic
	// side effect of the asymmetric upper/lower limb lengths, expected
	// to need a small manual offset once seen in-game.
	// ═══════════════════════════════════════════════════════════════
	// NOTE (SECOND revision — offset/head-drop bug fix): v1 rotated the
	// bow a full 90° straight down (looked disconnected, aiming at own
	// feet). v2 changed that to 45°/30px but introduced a NEW bug: the
	// head's down-dip (headBowOffset, declared near the top of this
	// function) used a completely separate, unrotated 10px translate
	// with no shared pivot — so at normal scale the bow (pivoting 30px
	// below origin, rotated a full 45°) ended up visibly detached from
	// a head that only nudged down 10px with no matching rotation. This
	// is the "bow is offset from the archer" / "head falls off" bug.
	// FIX: bow, arrow, hand, AND head now all share ONE offset (15px)
	// and ONE rotation (~40% of a quarter-turn = 36°) via the
	// DOWN_AIM_OFFSET / DOWN_AIM_ROT constants declared once near the
	// top of this function — keeping the whole assembly closer to the
	// body (15px vs 30px) and using the same pivot math (see
	// rotateAroundPivot below, and the head wrapper up in drawBody)
	// prevents any piece from drifting out of sync with the others
	// again.
	// BUGFIX (facingUp — "detached head"): this branch used to check
	// facingDown ONLY, so a facingUp archer got a flat 0 here and drew
	// its normal SIDE-VIEW bow/arrow/hand — while the head (elsewhere
	// in this function) rendered in its correct back-view spot. Those
	// two uncorrelated poses is exactly what produced the stray
	// skin-tone "second head" floating near the real one. AIM_ANGLE/
	// AIM_Y_OFFSET below now read from the shared AIM_ROT/AIM_OFFSET
	// (declared near the top of this function alongside headBowOffset/
	// headBowRot), which already mirror negative for facingUp — so bow,
	// arrow, hand, and head all move as one rigid unit for BOTH facings
	// now, not just facingDown.
	//
	// CONTINUOUS AIM — per direct follow-up request ("check... archers
	// ... yes do it all"): AIM_ROT/AIM_OFFSET (declared as `let 0` near
	// the top of this function) are reassigned here to a continuous,
	// speed-buffered angle tracked off this archer's own live target —
	// same atan2/_easeAimAngle approach as the gun (individual
	// unit.target, not a side-wide centroid), but SCALED down to this
	// bow's own already-tuned maximum (36°/5px — chosen, see the
	// comment block near DOWN_AIM_ROT's declaration, specifically
	// because a full 90° swing read as disconnected) instead of the
	// ±90° range those other weapons use directly. No reload exclusion
	// is needed — like the javelin, a bow has no disconnected reload
	// phase to exclude; nock/draw/hold/loose are all part of the aiming
	// act itself. This still only pays for atan2 when there's an actual
	// target (the check below), same optimization as everywhere else.
	const ARCHER_AIM_TURN_RATE = 0.09; // radians/frame, in the FULL ±PI/2 range below (scaled down after easing) — same rate as the gun, another light one-person weapon
	let archerTargetAngle = 0;
	if (unit && unit.target && typeof unit.x === 'number' && typeof unit.target.x === 'number'
		&& typeof unit.y === 'number' && typeof unit.target.y === 'number') {
		const _adx = unit.target.x - unit.x;
		const _ady = unit.target.y - unit.y;
		archerTargetAngle = Math.atan2(_ady, Math.abs(_adx));
		if (Math.abs(_adx) > 0.0001) unit.facingDir = _adx < 0 ? -1 : 1;
	}
	const archerAimAngleFull = unit ? _easeAimAngle(unit, '_archerAimAngle', archerTargetAngle, ARCHER_AIM_TURN_RATE) : archerTargetAngle;
	const archerAimFraction = archerAimAngleFull / (Math.PI / 2); // -1 (full up) .. 0 (level) .. 1 (full down)
	AIM_OFFSET = archerAimFraction * DOWN_AIM_OFFSET;
	AIM_ROT    = archerAimFraction * DOWN_AIM_ROT;

	const AIM_ANGLE = AIM_ROT;      // alias — shared with head (see top-of-function)
	const AIM_Y_OFFSET = AIM_OFFSET; // alias — shared with head (see top-of-function)
	// No longer gated on facingDown||facingUp — AIM_Y_OFFSET is now
	// continuous and already ~0 for a level target, so applying it
	// unconditionally is safe and correctly covers the diagonal case
	// that binary gate used to miss entirely.
	const pivotY = handY + AIM_Y_OFFSET;

	// rotateAroundPivot replaces the old rotate90AroundHand: same idea
	// (manually rotate a point drawn OUTSIDE the bow's own rotation
	// wrapper — see technique (2) in the comment block above), but now
	// takes a general angle since 45° needs the full rotation formula
	// rather than the simplified 90°-only shortcut (cos90=0/sin90=1)
	// the old version relied on. Both this AND the bow-limb wrapper
	// below must rotate around the exact same pivot (handX, pivotY) or
	// the arrow/hand will visually detach from the bow.
	const rotateAroundPivot = (px, py, angle) => {
		const ddx = px - handX, ddy = py - pivotY;
		const cosA = Math.cos(angle), sinA = Math.sin(angle);
		return {
			x: handX + (ddx * cosA - ddy * sinA),
			y: pivotY + (ddx * sinA + ddy * cosA)
		};
	};

	ctx.save();
	ctx.translate(handX, pivotY); 
	ctx.rotate(bowKhatra + AIM_ANGLE); 
	ctx.translate(-handX, -pivotY);
	
	// Bow Body
	ctx.strokeStyle = isJapan ? "#1a1a1a" : "#4e342e"; // Dark lacquer for Japan, wood for others
	ctx.lineWidth = 2;
	ctx.beginPath(); 
	ctx.moveTo(tipX, topTipY); // Top Tip
	ctx.quadraticCurveTo(dipX, topDipY, handX - 1, handY); // Handle dip
	ctx.quadraticCurveTo(dipX, botDipY, tipX, botTipY);    // Bottom Tip
	ctx.stroke();
	
	// Yumi specific grip/rattan wrap details
	if (isJapan) {
	    ctx.strokeStyle = "#e0e0e0"; 
	    ctx.lineWidth = 2.5;
	    ctx.beginPath();
	    ctx.moveTo(handX - 1, handY - 1.5);
	    ctx.lineTo(handX - 1, handY + 1.5);
	    ctx.stroke();
	}
	
	// Bowstring
	ctx.strokeStyle = "rgba(255, 255, 255, 0.5)"; ctx.lineWidth = 0.6;
	ctx.beginPath(); 
	ctx.moveTo(tipX, topTipY); 
	ctx.lineTo(stringX, stringY); 
	ctx.lineTo(tipX, botTipY); 
	ctx.stroke();
	ctx.restore();

	// --- ARROW RENDERING ---
	if (hasArrow) {
		// Gate changed from the old (facingDown || facingUp) to a direct
		// AIM_ANGLE check — now that AIM_ANGLE is continuous (target-
		// based) rather than tied to those movement-based flags, a unit
		// can have a meaningful diagonal AIM_ANGLE while facingDown AND
		// facingUp are both false, and the old gate would have skipped
		// the rotation entirely in exactly that case.
		const arrowPt = (AIM_ANGLE !== 0) ? rotateAroundPivot(drawHandX, drawHandY, AIM_ANGLE) : { x: drawHandX, y: drawHandY };
		ctx.save();
		ctx.translate(arrowPt.x, arrowPt.y);
		ctx.rotate(arrowAngle + AIM_ANGLE);
		
		ctx.fillStyle = "#8d6e63"; ctx.fillRect(0, -0.5, 14, 1); // Shaft
		ctx.fillStyle = "#9e9e9e"; ctx.beginPath(); ctx.moveTo(14, -1); ctx.lineTo(18, 0); ctx.lineTo(14, 1); ctx.fill(); // Head
		ctx.fillStyle = "#d32f2f"; ctx.fillRect(0, -1.5, 3, 1); ctx.fillRect(0, 0.5, 3, 1); // Feathers
		ctx.restore();
	}

	// --- DRAWING HAND ---
	// Same gate fix as arrowPt above.
	const handPt = (AIM_ANGLE !== 0) ? rotateAroundPivot(drawHandX, drawHandY, AIM_ANGLE) : { x: drawHandX, y: drawHandY };
	ctx.fillStyle = "#ffccbc";
	ctx.beginPath();
	ctx.arc(handPt.x, handPt.y, 2, 0, Math.PI * 2);
	ctx.fill();

	ctx.restore(); // Restore global unit translate (for the bob)
	}
else if (type === "throwing") {
        // ═══════════════════════════════════════════════════════════
        // DOWNWARD FACING (facingDirY===1) — MIXED within this branch,
        // updated per user revision.
        //
        // Slinger (below) — still EXCLUDED, confirmed by direct user
        // decision: their current throwing/lobbing animation already
        // reads fine facing the viewer as-is. Do not port by analogy
        // with the javelinier fix just below — it was deliberately
        // skipped, not missed.
        //
        // "else // JAVELINIER" branch further down — now PORTED (this
        // was a revision of the original exclusion: the user initially
        // grouped javelin in with "satisfied as-is", then asked for it
        // specifically once they saw the archer's downward aim in
        // action). See that branch's own comments for the fix — the
        // active javelin (both its melee-stab and throwing sub-modes,
        // which share one render block) now aims perpendicular to the
        // X axis when facing down. Its own separate out-of-ammo melee-
        // stab sub-mode uses that same shared render block, so it's
        // covered by the same fix, not the shared shortsword fallback
        // elsewhere in this file.
        //
        // Bomber is a separate unitName-dispatched branch (search
        // "unitName.includes(\"Bomb\")"), not nested here — still
        // EXCLUDED per the user's original "javelin bomb slinger"
        // note, which was NOT revised for Bomber the way it was for
        // javelin. If Bomber's exclusion should also be revisited,
        // that hasn't been requested yet — check with the user first
        // rather than assuming the javelin revision extends to it.
        // ═══════════════════════════════════════════════════════════
        if (unitName === "Slinger") {
            // --- SURGERY START: Synchronized Slinger Timing ---
            // Slinger timing is snappy. 1.5s cycle.
            let slingerTime = Date.now() / 1500;
            let cycle = isAttacking ? slingerTime % 1.0 : 0;
            // --- SURGERY END ---
            
            let handX = 4, handY = -8;
            let stoneX, stoneY;
            let isVisible = true;

            // --- THE POUCH (At waist) ---
            ctx.fillStyle = "#5d4037"; ctx.beginPath();
            ctx.ellipse(-2, 2, 3, 4, 0, 0, Math.PI*2); ctx.fill();

            // 3-Phase Animation State Machine
            if (cycle < 0.3) { 
                // Phase 1: RELOAD - Reach for pouch (0.0 to 0.3)
                let p = cycle / 0.3;
                handX = 4 - (p * 6); handY = -8 + (p * 10);
                stoneX = handX; stoneY = handY;
            } 
            // --- SURGERY START: Extended Centrifugal Spin ---
            // We now extend the spin all the way to 0.95 (95% of the cooldown).
            // This ensures the stone stays in the sling until the moment of release.
            else if (cycle < 0.95) { 
                let p = (cycle - 0.3) / 0.65; // Normalized over the longer 65% window
                let spinAngle = p * Math.PI * 10; // Faster spin (5 full rotations) for more "oomph"
                handX = 6; handY = -10;
                
                // The stone orbits the hand in an elliptical path
                stoneX = handX + Math.cos(spinAngle) * 12;
                stoneY = handY + Math.sin(spinAngle) * 4; 
            } 
            // --- SURGERY START: Precision Snap Release ---
            else { 
                // Phase 3: THROW - High velocity snap (0.95 to 1.0)
                // This tiny 5% window mimics a real sling release.
                let p = (cycle - 0.95) / 0.05; 
                handX = 6 + (p * 10); handY = -10 - (p * 4);
                
                isVisible = false; // Stone is released exactly as the projectile spawns
            }
            // --- SURGERY END ---

            // Draw Sling Cord
            ctx.strokeStyle = "#d4b886"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(handX, handY);
            if (isVisible) {
                ctx.lineTo(stoneX, stoneY);
            } else {
                // --- SURGERY START: Cord Momentum ---
                // When invisible (released), the cord flails forward following the hand's path
                ctx.lineTo(handX + 12, handY + 6); 
                // --- SURGERY END ---
            }
            ctx.stroke();

            // Draw Stone/Bullet
            if (isVisible) {
                ctx.fillStyle = "#9e9e9e";
                ctx.beginPath(); ctx.arc(stoneX, stoneY, 2, 0, Math.PI*2); ctx.fill();
            }

            // Draw Hand (Drawn last so it sits on top of the sling cord)
            ctx.fillStyle = "#ffccbc"; 
            ctx.beginPath(); 
            ctx.arc(handX, handY, 2, 0, Math.PI*2); 
            ctx.fill();
        }
   else { //  JAVELINIER
     // 1. Context & State Retrieval
        // BUGFIX: was reading unit.ammo (a spawn-time snapshot that never
        // updates — real combat only decrements unit.stats.ammo, see
        // ai_categories.js's _handleCombatExecution). Same bug already
        // found and fixed in this file's Rocket and Bomb branches — read
        // the live stat first.
        let currentAmmo = (typeof unit !== 'undefined' && unit.stats && typeof unit.stats.ammo === 'number')
            ? unit.stats.ammo
            : ((typeof unit !== 'undefined' && unit.ammo !== undefined) ? unit.ammo : 4);
        let isMelee = false;
        
        // Distance Check for Melee Stabbing vs Throwing
        if (typeof unit !== 'undefined' && unit.target) {
            let distToTarget = Math.hypot(unit.target.x - unit.x, unit.target.y - unit.y);
            // Threshold for "too close" - forces melee to defend themselves
            if (distToTarget < 35) {
                isMelee = true;
            }
        }

        // --- AMMO = 0 OVERRIDE ---
        // If out of ammo, they can't throw. Force melee mode using their final spear.
        if (currentAmmo <= 0) {
            isMelee = true;
        }

        // --- DRAW SHIELD (True Hmong Rattan Weave) ---
        ctx.save();
        // Positioned slightly forward on the body
        ctx.translate(4 * dir, -5 + (typeof weaponBob !== 'undefined' ? weaponBob : 0)); 
        ctx.rotate((Math.PI / 12) * dir); 

        // Off-hand explicitly gripping the back/side of the shield to show it's held
        ctx.fillStyle = "#ffccbc";
        ctx.beginPath();
        ctx.arc(-2 * dir, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Rattan base color (richer, natural tan)
        ctx.fillStyle = "#cbb593"; 
        ctx.beginPath();
        ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Authentic woven rattan texture (Radial spokes + Concentric loops)
        ctx.strokeStyle = "#8b5a2b"; 
        ctx.lineWidth = 0.5;
        
        // 1. Radial spokes (the frame)
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * 7.5, Math.sin(angle) * 7.5);
            ctx.stroke();
        }
        
        // 2. Concentric woven loops
        for (let r = 1.5; r <= 7.5; r += 1.5) {
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        // Outer thick bound rim
        ctx.strokeStyle = "#4a3018"; 
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
        ctx.stroke();

        // Center binding/reinforcement knot
        ctx.fillStyle = "#4a3018";
        ctx.beginPath();
        ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
// --- DRAW STORED JAVELINS (On Back) ---
        // CLAMPED LOGIC: ammo 4 = 3 on back, ammo 1 = 0 on back. 
        // Math.min(3, ...) ensures we never render infinite javelins in UI/Unit Cards.
        let backJavelinsCount = Math.max(0, Math.min(3, currentAmmo - 1));
        
        for (let i = 0; i < backJavelinsCount; i++) {
            ctx.save();
            // Spacing and angle logic
            let offsetX = (-2.5 - i * 1.5) * dir;
            let angle = (-0.1 - i * 0.05) * dir;
            
            // Dampened weaponBob to stop the wobbling
            ctx.translate(offsetX, -4 + (typeof weaponBob !== 'undefined' ? weaponBob * 0.3 : 0));
            ctx.rotate(angle);

            // Thinner Shaft (Shaved down)
            ctx.strokeStyle = "#4e342e"; 
            ctx.lineWidth = 1.0; // Thinned further for sleek look
            ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(0, -16); ctx.stroke();

            // EVEN SMALLER Symmetrical Head
            ctx.fillStyle = "#bdbdbd";
            ctx.beginPath();
            ctx.moveTo(0, -16);    // base center
            ctx.lineTo(-0.8, -14); // Ultra-thin left barb
            ctx.lineTo(0, -18.5);  // Sharp tip
            ctx.lineTo(0.8, -14);  // Ultra-thin right barb
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // --- ANIMATION LOGIC (Spear Thrust vs Throw) ---
        let handX = -1 * dir; 
        let handY = -7 + (typeof weaponBob !== 'undefined' ? weaponBob : 0);
        let javRotation = 0;
        let thrustX = 0;
        let thrustY = 0;
        let isVisible = true;
        
        let maxCd = 1600;
        let cycle = isAttacking ? (Date.now() % maxCd) / maxCd : 0;

        if (isMelee) {
            // PHASE: STRICTLY MELEE STAB (Last Javelin held as Spear)
            javRotation = (Math.PI / 2.2) * dir; 
            if (isAttacking) {
                if (cycle < 0.3) {
                    // Windup / Pull back behind the shield
                    let p = cycle / 0.3;
                    thrustX = -4 * p;
                    thrustY = -1 * p;
                } else if (cycle < 0.5) {
                    // Heavy Spear Thrust forward
                    let p = (cycle - 0.3) / 0.2;
                    thrustX = -4 + (p * 18);
                    thrustY = -1 + (p * 2);
                } else {
                    // Retract back to stance
                    let p = (cycle - 0.5) / 0.5;
                    thrustX = 14 * (1 - p);
                    thrustY = 1 * (1 - p);
                }
            }
        } else {
            // PHASE: THROWING (Safe distance)
            if (isAttacking) {
                if (cycle < 0.7) { 
                    // Wind-up
                    let p = cycle / 0.7;
                    thrustX = -(p * 8); 
                    javRotation = ((-Math.PI / 6) - (p * Math.PI / 4)) * dir; 
                } else if (cycle < 0.95) { 
                    // The Throw Snap
                    let p = (cycle - 0.7) / 0.25;
                    thrustX = -8 + (p * 20); 
                    javRotation = ((-Math.PI / 4) + (p * Math.PI / 1.5)) * dir; 
                    isVisible = true;
                } else { 
                    // Follow-through & Release
                    let p = (cycle - 0.95) / 0.05;
                    thrustX = 12 + (p * 4); 
                    javRotation = (Math.PI / 3) * dir;
                    isVisible = false; 
                }
            }
        }

        // --- DRAW ACTIVE JAVELIN ---
        // ═══════════════════════════════════════════════════════════
        // CONTINUOUS AIM — per direct follow-up request ("check
        // javelinmen... aiming and shooting phase... yes do it all"),
        // replacing the old binary "facingDown ? Math.PI : 0" (which
        // only ever handled straight-down and nothing else — no
        // facingUp case existed at all) with the same continuous,
        // speed-buffered atan2 tracking used for the gun/crossbows/
        // rocket/cannon elsewhere in this file. javBaseRot is ADDED to
        // the existing javRotation (the wind-up/snap/follow-through
        // throw motion, or the melee stab lean — both left completely
        // unchanged in magnitude/timing) rather than replacing it,
        // same "aim + motion combine additively" pattern as the gun's
        // ctx.rotate(gunRot + shakeRot + gunBaseRot).
        //
        // No separate "reload" exclusion is needed here — unlike a
        // gun/cannon, a thrown javelin has no disconnected reload
        // sequence to exclude from tracking; isAttacking's whole cycle
        // (wind-up through follow-through, or the melee stab) IS the
        // aiming/throwing act, so tracking stays on throughout it
        // (and while idle-but-targeted, matching the gun's same
        // choice for its own idle/ready phase). This still satisfies
        // the "only aiming/shooting pays for atan2" optimization: with
        // no target, the check below short-circuits before Math.atan2
        // ever runs.
        const JAVELIN_AIM_TURN_RATE = 0.09; // radians/frame — light thrown weapon, same brisk rate as the hand cannon
        let javTargetAngle = 0;
        if (unit && unit.target && typeof unit.x === 'number' && typeof unit.target.x === 'number'
            && typeof unit.y === 'number' && typeof unit.target.y === 'number') {
            const _jdx = unit.target.x - unit.x;
            const _jdy = unit.target.y - unit.y;
            javTargetAngle = Math.atan2(_jdy, Math.abs(_jdx));
            if (Math.abs(_jdx) > 0.0001) unit.facingDir = _jdx < 0 ? -1 : 1;
        }
        const javBaseRot = unit ? _easeAimAngle(unit, '_javAimAngle', javTargetAngle, JAVELIN_AIM_TURN_RATE) : javTargetAngle;
        const activeJavX = handX + (thrustX * dir);
        const activeJavY = handY + thrustY;
        const activeJavRotation = javRotation + javBaseRot;

        if (isVisible || !isAttacking) {
            ctx.save();
            ctx.translate(activeJavX, activeJavY);
            ctx.rotate(activeJavRotation);

            // Thinner Shaft
            ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 1.5; 
            ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -12); ctx.stroke();
            
            // EVEN SMALLER Active Javelin Head
            ctx.fillStyle = "#bdbdbd";
            ctx.beginPath();
            ctx.moveTo(0, -12);      // base center
            ctx.lineTo(-1.0, -10.5); // left barb
            ctx.lineTo(0, -15);      // sharp tip
            ctx.lineTo(1.0, -10.5);  // right barb
            ctx.closePath();
            ctx.fill();
            
            ctx.restore();
        }

        // --- DRAW MAIN HAND ---
        // Draws on top of the javelin shaft so the grip is solid
        ctx.fillStyle = "#ffccbc";
        ctx.beginPath();
        ctx.arc(activeJavX, activeJavY, 2.5, 0, Math.PI * 2);
        ctx.fill();
} // End of Javelinier block
}

else if (type === "crossbow") { 
    // ═══════════════════════════════════════════════════════════════
    // DOWNWARD FACING (facingDirY===1) — DONE, both sub-mechanisms and
    // the inline melee fallback. Originally deferred (see git history /
    // prior session notes if kept) because the "foot-stirrup spanning"
    // reload looked like it needed a real body-crouch redesign to
    // redirect — that concern is now resolved by explicit user
    // clarification: reloading (both the Repeater's box-mag/lever
    // cycling AND the Standard/Poison/Heavy foot-stirrup spanning) is
    // ALWAYS shown side-on, never redirected, regardless of facing.
    // Only "shooting" — holding the weapon aimed/idle, and the brief
    // recoil right as a bolt releases — redirects down. This is a much
    // smaller problem than a full crouch-redesign, and both variants'
    // "100% UNTOUCHED" rendering code was left completely unmodified —
    // only a conditional rotation was added AROUND it, gated by state
    // computed outside that block:
    //
    // (1) "Repeater Crossbowman" — its render block (marked "100%
    //     UNTOUCHED" by a previous developer) draws body/bow, magazine,
    //     lever, bolt, and hand together under one translate with NO
    //     existing rotation. Added `isRepeaterReloading` (true during
    //     box-mag reload AND the lever push/pull chambering, false
    //     during idle/aimed and the final snap/recoil) and a single new
    //     `ctx.rotate(repeaterDownRot)` right after the existing
    //     translate — nothing inside the flagged block was touched,
    //     only wrapped.
    //
    // (2) Standard / Poison / Heavy — ALREADY had a `ctx.rotate(weaponRot)`
    //     wrapper (weaponRot drives the tip-to-the-ground spanning
    //     motion, 0→π/2→0 across the reload phases). Since weaponRot is
    //     already ~0 during exactly the two states that should redirect
    //     (p<0.05 recoil-snap, p>=0.90 resting-aimed) and actively
    //     animating away from 0 during every reload phase in between,
    //     piggybacking a `crossbowDownRot` onto that SAME existing
    //     rotate call was enough — during reload it stays 0 and never
    //     interferes with the spanning motion; it only ever adds to
    //     weaponRot when weaponRot is already near 0.
    //
    // Both sub-variants' out-of-ammo melee fallback (the inline
    // stowed-crossbow + shortsword block a few lines below) is also
    // ported now, using the same Math.PI trick as archer's inline melee
    // fallback and the shared shortsword branch — the stowed-crossbow
    // prop itself stays untouched (static accessory, same as every
    // other stowed prop this session).
    // ═══════════════════════════════════════════════════════════════
    let b = (typeof bob !== 'undefined') ? bob : 0; 
    let ammo = (typeof unitAmmo !== 'undefined') ? unitAmmo : 1; 

    // --- QUIVER (Back/Hip) - Revised: Smaller for Bolts ---
    ctx.save();
    ctx.translate(-5, -4 + b); 
    ctx.rotate(-Math.PI / 8);  
    
    // Smaller pouch-style quiver
    ctx.fillStyle = "#3e2723"; 
    ctx.fillRect(-2, -4, 4, 8);
    ctx.strokeStyle = "#1a1007"; ctx.lineWidth = 0.5; ctx.strokeRect(-2, -4, 4, 8);

    // Tiny bolt fletchings
    let visibleBolts = Math.max(0, Math.min(3, ammo));
    ctx.fillStyle = "#eeeeee"; 
    for (let i = 0; i < visibleBolts; i++) {
        ctx.fillRect(-1.5 + (i * 1.2), -6, 0.8, 2); 
    }
    ctx.restore();

    // --- OUT OF AMMO: Melee Fallback ---
    if (ammo <= 0) {
        let meleeCycle = isAttacking ? (Date.now() / 600) % 1.0 : 0;
        let swingAngle = isAttacking ? Math.sin(meleeCycle * Math.PI) * (Math.PI / 1.5) : 0;

        ctx.save();
        ctx.translate(0, b);
        // Stowed crossbow prop — left untouched for facingDown, same
        // reasoning as every other stowed/strapped prop this session
        // (quivers, stowed bows): a strapped weapon doesn't need to aim.
        ctx.save();
        ctx.translate(-4, -6);
        ctx.rotate(Math.PI / 1.5); 
        ctx.fillStyle = "#5d4037"; ctx.fillRect(0, -10, 16, 3);
        
        if (unitName === "Repeater Crossbowman") {
            ctx.fillStyle = "#5d4037"; ctx.fillRect(5, -13, 10, 5); 
            ctx.strokeStyle = "#2b1b17"; ctx.lineWidth = 0.8; ctx.strokeRect(5, -13, 10, 5);
        } else {
            let scale = (unitName === "Poison Crossbowman") ? 0.8 : (unitName === "Heavy Crossbowman" ? 1.3 : 1.0);
            ctx.strokeStyle = "#000000"; ctx.lineWidth = (unitName === "Heavy Crossbowman") ? 3 : 2;
            ctx.beginPath(); ctx.moveTo(14, -10 - (6 * scale));
            ctx.quadraticCurveTo(14 + (4 * scale), -10, 14, -10 + (6 * scale)); 
            ctx.stroke();
        }
        ctx.restore();

        // Shortsword & hand — same Math.PI base-rotation trick as the
        // shared "shortsword" fallback and archer's inline fallback:
        // this blade is drawn along the same local -Y convention
        // (fillRect(-1.5,-14,3,14), pointing straight up at rest), so a
        // half-turn aims it down-screen instead, dir-invariant for the
        // same reason (cos/sin of +-pi are identical).
        ctx.save();
        ctx.translate(4, -8); ctx.rotate(swingAngle + (facingDown ? Math.PI : 0));
        ctx.fillStyle = "#ffccbc"; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI*2); ctx.fill(); 
        ctx.fillStyle = "#9e9e9e"; ctx.fillRect(-1.5, -14, 3, 14); 
        ctx.fillStyle = "#5d4037"; ctx.fillRect(-1, 0, 2, 4); 
        ctx.restore();
        ctx.restore();
        // Same reasoning as archer's melee fallback above: this branch
        // returns early, bypassing the normal end-of-function backshot
        // dispatch — draw the body here too so a facing-up, low-armor-
        // tier crossbowman out of ammo doesn't render with no body.
        if (useBackView) { drawBody(); }
        return; 
    }
	
	
	// --- RANGED COMBAT: Engine Sync ---
        let cdown = (typeof cooldown !== 'undefined') ? cooldown : 0;

        // 1. Dynamically grab the unit's true max cooldown to future-proof tweaks
        let maxCool = (typeof getReloadTime === 'function' && typeof unit !== 'undefined') ? getReloadTime(unit) : 300;
        
        // 2. Isolate the Repeater's 50-tick burst so it doesn't infect standard crossbows!
        let isRepeaterBurst = (unitName === "Repeater Crossbowman" && cdown <= 50 && cdown > 0);
        if (isRepeaterBurst) maxCool = 50; 

        // Smooth 0.0 to 1.0 cycle for EVERY unit
        let p = Math.max(0, Math.min(1.0, 1.0 - (cdown / maxCool)));

        if (unitName === "Repeater Crossbowman") {
            let leverMove = 0, boltInTray = false, stringPull = 0, handX = 0, handY = 0;
            let loadingMag = false, handOnLever = false, wobbleX = 0, wobbleY = 0, magOffset = 0;

            // --- PHASE 1: BOX MAG RELOAD ---
            if (!isRepeaterBurst && cdown > 0) {
                loadingMag = true;
                // Normalize progress for the remaining ticks above 50
                let reloadRange = Math.max(1, maxCool - 50); 
                let reloadP = Math.max(0, Math.min(1, 1 - ((cdown - 50) / reloadRange)));
                
                let dropCycle = (reloadP * 5) % 1; 
                handX = dropCycle < 0.5 ? -2 : 10; 
                handY = dropCycle < 0.5 ? 5 : -4;   
            } 
            // --- PHASE 2: INDIVIDUAL BOLT FIRE ---
            else if (isRepeaterBurst) {
                handOnLever = true;
                let shotP = p; // Already normalized 0.0 to 1.0 by the maxCool override

                if (shotP < 0.4) { // Push
                    leverMove = (shotP / 0.4) * 5;
                    boltInTray = shotP > 0.1;
                } else if (shotP < 0.95) { // Pull
                    let drawP = (shotP - 0.4) / 0.55;
                    leverMove = 5 - (drawP * 5);
                    stringPull = drawP * 8;
                    boltInTray = true;
                } else { // Snap/Recoil
                    wobbleX = (Math.random() - 0.5) * 3;
                    wobbleY = (Math.random() - 0.5) * 3;
                    boltInTray = false; 
                }
                magOffset = leverMove * 0.8;
            } else {
                // Idle
                handOnLever = true;
                boltInTray = true;
            }

            // ═══════════════════════════════════════════════════════
            // BIRD'S-EYE SHOOTING POSE (facingDirY===±1, not reloading)
            // — REVISED this session, per explicit report that rotating
            // the side-view silhouette 90° doesn't read as a top-down
            // view: the magazine and lever are asymmetric parts (mag on
            // top of the receiver, lever off to one side), so spinning
            // the whole side silhouette swings them out to the side
            // instead of showing what a repeater crossbow actually looks
            // like from directly above — stock running straight along
            // the aim axis, bow limbs splayed symmetrically LEFT/RIGHT
            // at the muzzle (perpendicular to the aim axis, per the
            // earlier perpendicular-angle fix), magazine centered ON the
            // stock's centerline, lever kept to one side of the stock.
            // This is now a real second geometry, not a rotation of the
            // first — drawRepeaterTopDown(signY) below is the single
            // shared renderer for both facingDown (signY=1) and facingUp
            // (signY=-1), so they can't drift out of sync the way two
            // hand-maintained copies could.
            //
            // Reload (box-mag drop-in AND lever push/pull chambering)
            // still ONLY ever renders side-on, unchanged from before —
            // isRepeaterReloading below gates which geometry is used,
            // it doesn't change.
            //
            // ANCHOR DISTANCE FIX: the old rotate-in-place approach
            // anchored at a fixed (0, 8) and then rotated the ENTIRE
            // side silhouette (whose horizontal reach — stock body all
            // the way out to the bow tip — is ~18-24px) into a vertical
            // reach, so the weapon ended up floating far below/above the
            // body. The new geometry anchors much tighter to the body
            // (TOPDOWN_ANCHOR_Y below, close to the hands) with its own
            // muzzle/limb reach tuned for a top-down silhouette instead
            // of inheriting the side view's horizontal proportions.
            // ═══════════════════════════════════════════════════════
            // FLICKER FIX: isRepeaterReloading used to also include
            // `isRepeaterBurst && p < 0.95`, which is TRUE for 95% of
            // EVERY individual bolt-fire cycle within an active burst
            // (lever push/pull/snap while the magazine still has
            // rounds loaded) — not just the real box-magazine reload.
            // That routed almost the entire burst to the side-view
            // geometry, with the top-down pose only flashing in for the
            // last 5% of each shot's cycle — read as constant
            // side-view with brief up/down flicker, the exact opposite
            // of the spec. Per explicit spec, side-view should ONLY
            // ever appear during the real 10-round box-magazine reload
            // (loadingMag, cdown>50) — the lever-cycling motion between
            // shots (isRepeaterBurst, cdown<=50) is NOT reloading and
            // must stay in the top-down pose for its entire cycle.
            let isRepeaterReloading = loadingMag;

            // ═══════════════════════════════════════════════════════
            // PERSISTENT FIRING LOCK (this session, per explicit report
            // that the up/down pose only held for a few frames before
            // reverting to side view — read as glitchy instead of smooth).
            //
            // ROOT CAUSE: repeaterShootingDown/Up were driven straight off
            // facingDown/facingUp (unit.facingDirY), which is a MOVEMENT
            // hysteresis signal computed in troop_draw.js — it tracks
            // which way the unit was recently WALKING, not which way
            // it's actually AIMING. Two separate failures fall out of
            // that:
            //   1. A unit that approached its firing spot via horizontal
            //      or diagonal movement may never accumulate the 3
            //      consecutive dominant-vertical frames troop_draw.js
            //      requires to set facingDirY at all — so it's stuck in
            //      side view the whole time it's stationary and firing,
            //      no matter where the target actually is.
            //   2. Even once facingDirY IS set, troop_draw.js's "cancel
            //      to horizontal" path (|dx| >= H_DOMINANT_THRESH) has NO
            //      hysteresis — a single frame of jostling from a packed
            //      formation snaps it back to 0 instantly, and
            //      re-committing needs another 3 consecutive frames of
            //      real vertical movement that a stationary, firing unit
            //      will rarely produce again. That's the "only a few
            //      frames" flicker.
            //
            // FIX: same persistent-lock pattern already used for the
            // Rocket's tube (unit._rocketLocked/_rocketAimAngle, above in
            // this file) — decoupled from movement entirely. The lock
            // ENGAGES the instant the unit is actively firing (ranged
            // stance + ammo, not reloading), picks up/down from the
            // TARGET's actual position (falling back to the movement
            // hint only when no target y is available), then HOLDS that
            // direction for the unit's entire firing engagement. It only
            // RELEASES when the unit truly stops firing (target lost,
            // ammo out, switched to melee, or a real magazine reload
            // starts) — never mid-burst, never from a stray jostle.
            // ═══════════════════════════════════════════════════════
            if (unit) {
                // "HAS FIRED" GATE — per explicit report, the lock was
                // engaging the moment the unit entered ranged combat
                // (state==="attacking" + statusrange), which can go true
                // as soon as a target is acquired — BEFORE the very
                // first bolt has actually fired (e.g. still closing
                // distance, or waiting out the first reload). That
                // showed the hand+lever+top-down pose while the unit
                // was only just moving into position, not yet shooting.
                // isAttacking (the narrow per-shot windup flash) is a
                // reliable "a real shot is happening RIGHT NOW" signal —
                // used here as a one-time trigger to mark that this
                // engagement has genuinely started firing, then held for
                // the rest of the engagement so it doesn't need to
                // re-fire every individual shot (which would reintroduce
                // the original per-shot flicker this lock exists to
                // prevent).
                if (isAttacking && unit.stats && unit.stats.currentStance === "statusrange") {
                    unit._repeaterHasFired = true;
                }
                if (unit.stats && unit.stats.currentStance !== "statusrange") {
                    unit._repeaterHasFired = false; // fully disengaged — next engagement starts clean
                }

                const isRepeaterFiring = unit._repeaterHasFired &&
                    unit.state === "attacking" &&
                    unit.stats && unit.stats.currentStance === "statusrange" &&
                    !isRepeaterReloading;

                // DEBOUNCE — per explicit report ("prevent sudden
                // switches... too frequently... humans cannot rotate
                // that quickly"), require a short minimum hold before
                // flipping the lock in EITHER direction, so a one-frame
                // blip in the underlying signals can't cause a rapid
                // re-flicker between side and top-down.
                const REPEATER_LOCK_DEBOUNCE_MS = 300;
                if (typeof unit._repeaterLockChangeAt !== 'number') unit._repeaterLockChangeAt = 0;
                const sinceRepeaterChange = Date.now() - unit._repeaterLockChangeAt;

                if (isRepeaterFiring && !unit._repeaterLocked && sinceRepeaterChange >= REPEATER_LOCK_DEBOUNCE_MS) {
                    // ENGAGE — SURGERY: direction now comes from the ENEMY
                    // SIDE's live centroid (see _computeCentroidLock at the
                    // top of this file) instead of a spawn-corner guess,
                    // and can now lock horizontal (side-by-side spawns)
                    // as well as vertical. Re-rolled fresh every reload,
                    // since RELEASE below already fires on every reload start.
                    const _repLock = _computeCentroidLock(unit, side);
                    unit._repeaterFacingY = (_repLock.axis === 'y') ? _repLock.dir : 0;
                    unit._repeaterFacingX = (_repLock.axis === 'x') ? _repLock.dir : 0;
                    unit._repeaterLocked = true;
                    unit._repeaterLockChangeAt = Date.now();
                } else if (!isRepeaterFiring && unit._repeaterLocked && sinceRepeaterChange >= REPEATER_LOCK_DEBOUNCE_MS) {
                    // RELEASE — stopped firing (reload started, ammo out, target lost, melee)
                    unit._repeaterLocked = false;
                    unit._repeaterLockChangeAt = Date.now();
                }
            }

            // CONTINUOUS AIM ROTATION — per direct follow-up request
            // ("no longer restricted to 8 quadrants... rotate relative
            // to what they aiming... with a slow speed buffer based on
            // mass"), replacing the old snapshot-once-at-ENGAGE axis/dir
            // with a live-tracked, speed-capped angle recomputed every
            // frame while locked (see _easeAimAngle up top). The
            // ENGAGE/RELEASE gate above still decides WHETHER the
            // repeater is currently redirecting at all — unchanged
            // reasoning, avoids flicker of entering/leaving the
            // redirected pose entirely; this only changes WHAT ANGLE it
            // eases toward while that's true. Eases back toward 0 (side
            // rest) at the same capped rate when not locked instead of
            // snapping straight back, same "no instant pose changes"
            // reasoning extended consistently.
            //
            // CROSSBOW_AIM_TURN_RATE — a repeater's stock+magazine
            // assembly is a held weapon, lighter than the wagon-mounted
            // Cannon (see CANNON_AIM_TURN_RATE in cavscript.js), so it's
            // given a brisker turn rate. Best-judgment value — no
            // in-game reference to calibrate against; tune here if it
            // reads too fast/slow.
            const CROSSBOW_AIM_TURN_RATE = 0.06; // radians/frame
            let repeaterAimAngle = 0;
            if (unit) {
                let repTargetAngle = 0;
                if (unit._repeaterLocked) {
                    const _repLive = _computeCentroidLock(unit, side);
                    repTargetAngle = _repLive.angle;
                    // SURGERY (kept): force the mirror toward the enemy's
                    // live horizontal side every frame while locked, same
                    // as before, just no longer gated to the axis==='x'
                    // case only — a continuously-tracked diagonal needs
                    // this exactly as much as a pure horizontal lock did.
                    if (Math.abs(_repLive.deltaX) > 0.0001) {
                        unit.facingDir = _repLive.deltaX < 0 ? -1 : 1;
                    }
                }
                repeaterAimAngle = _easeAimAngle(unit, '_repeaterAimAngle', repTargetAngle, CROSSBOW_AIM_TURN_RATE);
            }

            // REPEATER_TOPDOWN_ZONE — the hand-built top-down pose below
            // (magazine/lever/bow re-anchored, not a rotation of shared
            // geometry — see TOPDOWN_ANCHOR_Y a few lines down) can't
            // be built from scratch at every angle, so it's still
            // reserved for steep aims only; anything shallower rotates
            // the ordinary side-view geometry continuously instead (see
            // the `else` branch below). Set to exactly 45° per direct
            // clarification ("if the enemy is around 45 degrees from u,
            // ur not aiming sideways or upwards, ur aiming 45 degrees")
            // — the side pose's own continuous rotation (repeaterSideRot
            // below) already reaches exactly that far, so the handoff
            // point matches the example precisely.
            const REPEATER_TOPDOWN_ZONE = Math.PI / 4; // radians (45°)
            const repeaterInTopdownZone = !isRepeaterReloading && Math.abs(repeaterAimAngle) >= REPEATER_TOPDOWN_ZONE;
            const repeaterShootingDown = repeaterInTopdownZone && repeaterAimAngle > 0;
            const repeaterShootingUp   = repeaterInTopdownZone && repeaterAimAngle < 0;
            // Applied to the side-view wrapper in the `else` branch below;
            // explicitly zeroed during reload so reload stays side-on
            // regardless of where the eased angle currently sits (belt-
            // and-suspenders with the lock's own !isRepeaterReloading
            // gating above, same style already used at the Cannon's
            // ammo-out release check in cavscript.js).
            const repeaterSideRot = isRepeaterReloading ? 0 : repeaterAimAngle;
            // NEW — per direct follow-up request: "the weapon can rotate
            // within 90 degrees as long as its within that quadrant...
            // make the weapon continue to rotate" even once the
            // animation has switched to this top-down pose. Since the
            // pose itself can't be rebuilt continuously, this is a small
            // EXTRA rotation layered on top of it (applied right after
            // the ctx.translate below) equal to how far past exactly
            // ±90° the live eased angle actually is — 0 right at the
            // 45°→pose handoff (where this pose's "canonical" ±90° lean
            // would otherwise be too steep) and growing toward 0 again
            // as the aim approaches true vertical.
            const repeaterTopdownResidualRot = repeaterInTopdownZone
                ? (repeaterAimAngle - (repeaterShootingDown ? 1 : -1) * (Math.PI / 2))
                : 0;

            if (repeaterShootingDown || repeaterShootingUp) {
                const signY = repeaterShootingDown ? 1 : -1;
                // Anchor gap tuning (see TOPDOWN_ANCHOR_Y just below for
                // the actual per-direction values and why they differ).
                // ANCHOR: split by direction. A single numeric value (3)
                // was tried for both, but the VISUAL gap isn't symmetric
                // even at equal numbers: facingUp draws the body/hat
                // AFTER this weapon block (useBackView z-order), so the
                // hat visually overlaps/covers the near end of the
                // weapon, shortening the apparent gap. facingDown draws
                // the body FIRST (normal z-order) — nothing covers the
                // near end, so the full anchor distance reads as open
                // space between the body and the visible stock. Per
                // explicit report that the up gap is now perfect and the
                // down gap is way too large by comparison, the down
                // anchor is pulled in tighter to compensate for that
                // z-order difference rather than matching the up value.
                //
                // BUGFIX 2: that first tightening pass (1) was still wrong
                // by an order of magnitude — it only pulled the origin down
                // to just below the HIP (abs Y=1), so with stockNearY added
                // the grip sat at abs Y=3 and the muzzle end reached all
                // the way to abs Y=19, well past the feet (drawBody's legs
                // end around Y=9, see the rocket tube's own scale-reference
                // comment). None of that is anywhere near the chest. The
                // side-view geometry, for comparison, sits the weapon
                // cluster at roughly abs Y=-10 (magazine) to Y=-3 (bow) —
                // chest/shoulder height. -8 anchors the down-facing grip at
                // abs Y=-6 (chest) while the muzzle still correctly reaches
                // down toward the feet, matching what "aiming down at a
                // target below" should look like without floating the
                // whole weapon off the body. Per screenshot report.
                const TOPDOWN_ANCHOR_Y = repeaterShootingUp ? 3 : -8;

                // WALK BOB: previously this mount stayed perfectly static
                // while the unit walked, even though the body itself bobs
                // up/down each step (see `b`, drawBody's own walk-cycle
                // bob a few hundred lines up). That mismatch is what read
                // as "the repeater is still sideways while human walks" —
                // the weapon wasn't tracking the same per-step vertical
                // motion as the rest of the body. Adding `b` here makes
                // the top-down-mounted repeater ride the body's bob just
                // like the side-view weapon block already does (see
                // `ctx.translate(wobbleX, 8 + wobbleY)` a bit further down
                // for the side-view sibling — that one never had this gap
                // since 8+wobbleY there is layered under drawBody's own
                // translate elsewhere; here the weapon block sits in its
                // own coordinate space so `b` has to be added explicitly).
                ctx.save();
                ctx.translate(wobbleX, TOPDOWN_ANCHOR_Y * signY + wobbleY + b);
                ctx.rotate(repeaterTopdownResidualRot);

                // COORDINATE CONVENTION: signY=+1 means facingDown — "far"
                // is positive y (below the shooter on screen). signY=-1 means
                // facingUp — "far" is negative y (above the shooter on screen).
                // Every "far" coordinate must therefore be signY * +16 (positive
                // constant), so it correctly flips direction with signY.
                //
                // BUGFIX: the original code had muzzleY = signY * -16, which
                // gives muzzleY = +16 (below) when signY=-1 (upward) — the exact
                // opposite of what "up" means. The bow limbs were therefore drawn
                // ~16px BELOW the body origin when the unit faced up, then
                // drawBody() (deferred via useBackView) would paint the body and
                // hat on top of that — the limbs appeared to poke through BELOW
                // the hat, not behind it. Changing to signY * +16 puts the muzzle
                // at y=+16 when facingDown and y=-16 when facingUp, matching the
                // established convention. Every dependent calculation (limbForwardY,
                // magFarY, leverPivotY) was identically broken and is fixed here
                // with the same sign correction.
                const stockNearY = signY * 2;    // butt end, near the shooter's hands
                // BUGFIX: was signY*18, stretching stock+limbs+magazine
                // across a full 16-unit span from chest almost to the
                // feet. Per explicit report + the "Gemini" reference
                // image (compact, tightly-held crossbow, weapon mass
                // essentially AT the chest, bow-limbs providing the
                // visual "crossbow" read via their LEFT/RIGHT spread
                // rather than the stock's length): a true bird's-eye
                // view foreshortens length ALONG the aim axis (we're
                // looking almost straight down the barrel), while the
                // perpendicular bow-limb spread stays fully visible —
                // the old design did the opposite, stretching the
                // foreshortened axis and leaving the limb spread
                // unchanged. 7 keeps a short, still-legible stock
                // (5 wide, per MAG_W/stock-width comments below, so
                // 7-2=5 long keeps it roughly square rather than
                // either a thin rod or a tiny dot) with everything —
                // stock, limb attachment, magazine — landing within a
                // few px of the chest instead of reaching toward the
                // feet.
                const muzzleY    = signY * 7;    // muzzle end, far from the shooter — WAS signY * 18 (way too long for a foreshortened bird's-eye view)

                // Stock — runs from near to far along the aim axis
                ctx.fillStyle = "#4e342e";
                ctx.fillRect(-2.5, Math.min(stockNearY, muzzleY), 5, Math.abs(muzzleY - stockNearY));

                // Bow limbs + string — splayed symmetrically left/right at the
                // muzzle, perpendicular to the aim axis.
                const limbSpread    = 6.5;
                // BOW LENGTH +40%: J asked for the up/down (top-down-facing)
                // repeater's bow to reach 40% further along the aim axis —
                // sideways (limbSpread, left/right) explicitly left alone.
                // Both Y-axis offsets that define how far the limb curve
                // reaches from the muzzle are scaled by 1.4 so the bow reads
                // as visibly longer without touching its left/right spread.
                const limbForwardY  = muzzleY + signY * 1.5 * 1.4; // WAS signY * -1.5 (inverted); *1.4 = +40% length
                ctx.strokeStyle = "#000"; ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(-limbSpread, limbForwardY);
                ctx.quadraticCurveTo(0, muzzleY + signY * 3.5 * 1.4, limbSpread, limbForwardY); // WAS signY * -3.5; *1.4 = +40% length
                ctx.stroke();
                ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 0.6;
                ctx.beginPath();
                ctx.moveTo(-limbSpread, limbForwardY);
                ctx.lineTo(0, muzzleY - signY * stringPull * 0.5); // WAS + (inverted pull)
                ctx.lineTo(limbSpread, limbForwardY);
                ctx.stroke();

                // Magazine — centered on the stock's centerline, slides fore/aft
                // with magOffset as the lever cycles.
                // SIZE: shrunk in two passes — 10x7 (original) → 7x5 →
                // now 6x4, per a follow-up report that 7x5 still read too
                // wide even after the first shrink. Sized against the
                // stock's own width (5px, see fillRect(-2.5,...,5,...)
                // above) instead of guessing further — a box magazine
                // should sit close to the width of the receiver it clips
                // onto, just slightly wider to read as a distinct part,
                // not dominate the whole silhouette.
                const MAG_W = 6, MAG_H = 4;
                const magFarY = muzzleY - signY * 5 + signY * magOffset; // WAS wrong signs
                const magTop  = Math.min(magFarY, magFarY + signY * MAG_H);
                ctx.fillStyle = "#5d4037";
                ctx.fillRect(-MAG_W / 2, magTop, MAG_W, MAG_H);
                // BUGFIX: wall thickness halved per explicit spec (0.8 -> 0.4)
                ctx.strokeStyle = "#2b1b17"; ctx.lineWidth = 0.4;
                ctx.strokeRect(-MAG_W / 2, magTop, MAG_W, MAG_H);

                // Lever — offset to one side of the stock, swings along the aim
                // axis as it cycles.
                // BUGFIX: a +6 offset from stockNearY put the lever/hand
                // ~40% of the way toward the muzzle for BOTH directions.
                // Combined with the old too-low anchor that read as roughly
                // body-adjacent by accident for facingUp, but for
                // facingDown it put the hand out past the body entirely.
                // Per screenshot report ("lever and hand should be...
                // closer to the body"), tightened the down case to +2 so
                // it sits right next to the grip near the chest instead of
                // out toward the limbs. facingUp keeps the original +6,
                // unchanged, since that direction was already confirmed
                // correct.
                const leverPivotY = stockNearY + signY * (repeaterShootingUp ? 6 : 2);
                const leverSwing  = handOnLever ? (leverMove / 5) : 0;
                // BUGFIX: fixed +4 put the lever on the wrong side for
                // facingDown specifically ("flipped... off the guy's
                // arm"). facingUp renders via useBackView (the
                // character's BACK), facingDown via the normal front
                // view -- front vs back mirrors on-screen left/right for
                // the SAME physical hand. Per report that up already
                // reads correctly, down needs the opposite sign to track
                // that same hand instead of drifting to the anatomically
                // wrong side once the view flips.
                const leverSideX = repeaterShootingUp ? 4 : -4;
                ctx.save();
                ctx.translate(leverSideX, leverPivotY);
                ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 3; ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(3, signY * 9 * (1 - leverSwing * 0.5)); // WAS signY * -9 (inverted)
                ctx.stroke();
                ctx.restore();

                // No bolt-in-tray: the bolt sits inside the box magazine and is
                // not externally visible in this top-down view.

                // Hand — same side-flip as the lever above (leverSideX),
                // so it stays visually on the lever instead of drifting
                // to the opposite side once the lever itself flipped.
                ctx.fillStyle = "#ffccbc";
                if (handOnLever) {
                    ctx.beginPath();
                    ctx.arc(Math.sign(leverSideX) * (3 + 3 * (1 - leverSwing * 0.3)),
                            leverPivotY + signY * 9 * (1 - leverSwing * 0.5), // WAS signY * -9
                            1.5, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.restore();
            } else {
    // --- RENDERING --- (below this point is the original side-view
    // geometry, used for the default side-on facing AND for both reload
    // phases regardless of facing, per spec above — genuinely untouched
    // except for the one new ctx.rotate() line just below, which
    // continuously tilts this SAME unmodified geometry toward the live
    // aim angle rather than redrawing anything; see repeaterSideRot
    // above for why it's forced to 0 during reload)
    ctx.save();
    ctx.translate(wobbleX, 8 + wobbleY);
    ctx.rotate(repeaterSideRot);

    // Body & Bow
    ctx.fillStyle = "#4e342e"; ctx.fillRect(3, -11, 18, 3);
    ctx.strokeStyle = "#000"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(21, -15); ctx.quadraticCurveTo(24 - stringPull*0.2, -11, 21, -7); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(21, -15); ctx.lineTo(21 - stringPull, -11); ctx.lineTo(21, -7); ctx.stroke();
    
    // Magazine Box
    ctx.fillStyle = "#5d4037"; ctx.fillRect(7 + magOffset, -18, 10, 7);
    ctx.strokeRect(7 + magOffset, -18, 10, 7);

    // Lever
    ctx.save();
    ctx.translate(15 + magOffset, -10);
    ctx.rotate(handOnLever ? (leverMove / 5) * -0.7 : 0);
    ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-12, -8); ctx.stroke();
    ctx.restore();

    if (boltInTray) {
        ctx.fillStyle = "#5d4037"; ctx.fillRect(11, -11, 6, 1); 
        ctx.fillStyle = "#9e9e9e"; ctx.beginPath(); 
        ctx.moveTo(17, -11.5); ctx.lineTo(20, -10.5); ctx.lineTo(17, -9.5); ctx.fill();
    }
    
    // Hand Logic
    ctx.fillStyle = "#ffccbc";
    if (loadingMag) { 
        ctx.beginPath(); ctx.arc(handX, handY-16, 1.5, 0, Math.PI * 2); ctx.fill(); 
    } else if (handOnLever) { 
        let arcX = (15 + magOffset) + Math.cos(Math.PI + 0.6 + (leverMove / 5) * -0.7) * 14;
        let arcY = -10 + Math.sin(Math.PI + 0.6 + (leverMove / 5) * -0.7) * 14;
        ctx.beginPath(); ctx.arc(arcX, arcY, 1.5, 0, Math.PI * 2); ctx.fill(); 
    }
    ctx.restore(); 
            }
}
    else {
        // --- STANDARD / POISON / HEAVY: FOOT-STIRRUP SPANNING ---
        let weaponRot = 0, weaponX = 0, weaponY = 0, bodyDip = 0, bodyShift = 0, stringPull = 0;
        let hasBolt = false, loadHand = false, hX = 0, hY = 0, showFoot = false;
        let isHeavy = (unitName === "Heavy Crossbowman");
        let isPoison = (unitName === "Poison Crossbowman");

        // PHASE LOGIC: Added dynamic recoil snap
        if (p < 0.05) { 
            // SURGERY: Active kickback phase immediately following the shot
            let ph = p / 0.05;
            weaponX = -3 * (1 - ph); 
            weaponRot = -0.1 * (1 - ph); 
            stringPull = 0;
            hasBolt = false;
            bodyShift = -5; // Keep aimed stance
            weaponY = 5;
        }
        else if (p < 0.20) { 
            let ph = (p - 0.05) / 0.15; 
            weaponRot = ph * (Math.PI / 2); 
            weaponY = ph * 12; 
            weaponX = ph * 4; 
            bodyDip = ph * 5; 
            bodyShift = ph * -11; // Shift body UP as weapon goes DOWN
        } 
        else if (p < 0.45) { 
            let ph = (p - 0.20) / 0.25; 
            weaponRot = Math.PI / 2; weaponY = 12; weaponX = 4; bodyDip = 5; 
            bodyShift = -11; // Maintain high position during spanning
            stringPull = ph * 8; showFoot = true; 
        } 
        else if (p < 0.60) { 
    let ph = (p - 0.45) / 0.15; 
    weaponRot = (Math.PI / 2) * (1 - ph); 
    // Instead of going to 0 (Neck), we go to 5 (Chest/Hip)
    weaponY = 12 - (ph * 7);   // 12 down to 5
    weaponX = 4 * (1 - ph); 
    bodyDip = 5 * (1 - ph); 
    // Instead of going to 0 (Teleport), we go to -5 (Slightly raised stance)
    bodyShift = -11 + (ph * 6); // -11 up to -5
    stringPull = 8; 
} 
else if (p < 0.75) { 
    stringPull = 8; loadHand = true; let ph = (p - 0.60) / 0.15; hX = -4 - (ph * 4); hY = 2 - (ph * 6);
    weaponY = 5; bodyShift = -5; // Keep the lower position while loading bolt
} 
else if (p < 0.90) { 
    stringPull = 8; loadHand = true; let ph = (p - 0.75) / 0.15; hX = -8 + (ph * 18); hY = -4 + (ph * 6);
    weaponY = 5; bodyShift = -5; // Keep the lower position while moving hand
} 
else { 
    stringPull = 8; hasBolt = true; 
    weaponY = 5; // Final resting position (No more teleporting!)
    bodyShift = -5; 
}

        // ═══════════════════════════════════════════════════════════
        // DOWNWARD FACING (facingDirY===1) — ported this session, per
        // explicit user clarification: the foot-stirrup spanning reload
        // (every phase above except the two bookends — recoil-snap at
        // p<0.05, and the p>=0.90 resting-aimed state) can ONLY ever be
        // shown side-on. Only "shooting" (holding aimed, and the brief
        // recoil right after a bolt releases) redirects down.
        //
        // isAimedState below is deliberately the same two bookend
        // ranges as the p<0.05 / p>=0.90 branches above — both already
        // leave weaponRot at (or very near) 0, since spanning is what
        // drives weaponRot away from 0 in the first place. That's what
        // makes this cheap: piggyback the redirect onto the EXISTING
        // weaponRot/ctx.rotate() below rather than adding a new wrapper,
        // since during the reload phases (weaponRot actively animating
        // 0→π/2→0 for the tip-to-the-ground spanning motion)
        // crossbowDownRot stays 0 and doesn't interfere with that
        // motion at all — it only ever adds to weaponRot when weaponRot
        // is already ~0 (the two aimed/recoil bookends).
        // ═══════════════════════════════════════════════════════════
        let isAimedState = (p < 0.05) || (p >= 0.90);

        // CONTINUOUS AIM ROTATION — per direct follow-up request ("no
        // longer restricted to 8 quadrants... rotate relative to what
        // they aiming... slow speed buffer based on mass"), replacing
        // the movement-based facingDown/facingUp + fixed 45°/90° split
        // above with a live-tracked, speed-capped angle off the enemy
        // centroid — same _computeCentroidLock/_easeAimAngle the
        // Repeater above now uses, so every crossbow variant tracks the
        // enemy consistently instead of just the last walked direction.
        // isAimedState still gates this to the two aim/recoil bookends
        // exactly as before — reload still animates through weaponRot
        // alone, completely untouched.
        // CROSSBOW_AIM_TURN_RATE — same value as the Repeater's own
        // (see that section, same file, above): both are held crossbow
        // mechanisms, so given the same "mass" for this pass rather
        // than inventing an unjustified difference between variants.
        const CROSSBOW_AIM_TURN_RATE = 0.06; // radians/frame
        let crossbowAimAngle = 0;
        if (unit) {
            let cbTargetAngle = 0;
            if (isAimedState) {
                const _cbLive = _computeCentroidLock(unit, side);
                cbTargetAngle = _cbLive.angle;
                if (Math.abs(_cbLive.deltaX) > 0.0001) {
                    unit.facingDir = _cbLive.deltaX < 0 ? -1 : 1;
                }
            }
            // Eases toward 0 during spanning/reload too (cbTargetAngle
            // left at 0 above), so the next aimed bookend doesn't
            // inherit a stale tilt from several phases ago.
            crossbowAimAngle = _easeAimAngle(unit, '_crossbowAimAngle', cbTargetAngle, CROSSBOW_AIM_TURN_RATE);
        }
        const crossbowDownRot = isAimedState ? crossbowAimAngle : 0;
        // Folded into crossbowDownRot above (now one continuous signed
        // angle covering both directions) — kept as a named 0 rather
        // than removed so the ctx.rotate(weaponRot + crossbowDownRot +
        // crossbowUpRot) sum just below needs no restructuring.
        const crossbowUpRot = 0;

        ctx.save();
        // APPLY SHIFT: The man now "steps up" into the stirrup
        ctx.translate(0, bodyDip + b + bodyShift); 
        
        ctx.save();
      ctx.translate(weaponX, weaponY - 10); ctx.rotate(weaponRot + crossbowDownRot + crossbowUpRot); ctx.translate(0, 10);
	  // --- STOCK ---
        ctx.fillStyle = "#5d4037"; 
        ctx.fillRect(0, -10, 16, 3); // The wooden body
        
        // --- MOUNTING POINT FOR PROD ---
        // This ensures the bow limbs meet the wood BEFORE the stirrup starts
        let mountX = 16;
        // --- THE STIRRUP (FULL CIRCLE AT FRONT) ---
        let stirrupX = 16;       // At the very tip of the stock
        let stirrupY = -8.5;     // Centered vertically with the bolt/prod
        let stirrupRadius = 3.5; // Adjusted size to look like a hoop
        
        ctx.strokeStyle = "#424242"; 
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        // Drawing a nearly full circle (0 to 1.8 PI) to leave a tiny gap where it meets the wood
        ctx.arc(stirrupX + stirrupRadius, stirrupY, stirrupRadius, 0, Math.PI * 2);
        ctx.stroke();

        
        if (showFoot) { 
            // Foot inside stirrup - adjusted color to match boots
            ctx.fillStyle = "#3e2723"; ctx.beginPath(); ctx.arc(17.5, -8.5, 2.5, 0, Math.PI*2); ctx.fill(); 
        }

        // ... (rest of the Prod Render code remains the same)
     // --- PROD RENDER (REVISED: ALIGNED & COMPACT) ---
        let scale = isPoison ? 0.8 : (isHeavy ? 1.4 : 1.0); // Slightly tighter scale for heavy
        ctx.strokeStyle = "#1a1a1a"; 
        ctx.lineWidth = isHeavy ? 2.5 : 2; 

  
        let anchorX = mountX - (4.5 * scale); 
        
        let tY = -8.5 - (6.5 * scale), bY = -8.5 + (6.5 * scale); // Limbs slightly shorter for "smaller" look
        let flex = (stringPull * 0.3); 
        
        ctx.beginPath();
if (isHeavy) {
 
 

            // --- 2. HEAVY RECURVE (The Prod) ---
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = "#3e2723"; 
            ctx.lineCap = "round";

            let cpX = mountX + (3.5 * scale) - flex; 
            let cpYOffset = 4.0 * scale; 

            ctx.beginPath();
            ctx.moveTo(anchorX, tY); 
            ctx.quadraticCurveTo(cpX, -8.5 - cpYOffset, mountX, -8.5);
            ctx.quadraticCurveTo(cpX, -8.5 + cpYOffset, anchorX, bY);
            ctx.stroke();

            // --- 3. REINFORCEMENT BINDINGS (Drawn Last - "On Top") ---
            // These now act as the "seal" to hide the junction
            ctx.strokeStyle = "#212121";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            for (let i = -1.0; i <= 1.0; i += 1.0) {
                // Shortened slightly to -10 and -7 so they look like they are 
                // biting into the wood of the prod rather than floating past it
                ctx.moveTo(mountX + i, -10);
                ctx.lineTo(mountX + i, -7);
            }
            ctx.stroke();
        }
		 else {
// STANDARD ARC (REVISED)
// tipOffset adds length to the vertical spread of the bow limbs
let tipOffset = 1.7 * scale; 

ctx.lineWidth = 1.7;
ctx.strokeStyle = "#5d4037"; // Dark wood tone
ctx.lineCap = "round";

ctx.beginPath();
// Starts at top tip with added length
ctx.moveTo(anchorX, tY - tipOffset);

// Control point pulled slightly further to accommodate the longer limbs
// mountX remains the center pivot to maintain stock alignment
ctx.quadraticCurveTo(
    mountX + (3.5 * scale) - flex, // Control point
    -8.5,                          // Center Y
    anchorX, bY + tipOffset        // End at bottom tip with added length
);
ctx.stroke();

// --- REINFORCED BINDINGS ---
// Adds visual weight to the junction where the prod is lashed to the stock
ctx.strokeStyle = "#263238"; // Charcoal color for sinew/cord
ctx.lineWidth = 1.2;
ctx.beginPath();

// Drawing three distinct wraps for a detailed "lashed" appearance
for (let i = -1.5; i <= 1.5; i += 1.5) {
    ctx.moveTo(mountX + i, -11.5);
    ctx.lineTo(mountX + i, -5.5);
}
ctx.stroke();
        }
        ctx.stroke();
        
        // 2. STRING (Anchored to new tip positions)
        ctx.strokeStyle = "rgba(220, 220, 220, 0.9)"; ctx.lineWidth = 0.9;
        ctx.beginPath(); 
        ctx.moveTo(anchorX, tY); 
        ctx.lineTo(anchorX - stringPull, -8.5); 
        ctx.lineTo(anchorX, bY); 
        ctx.stroke();

        // 3. BOLT (Anchored to string)
        if (hasBolt) {
            ctx.save(); 
            ctx.translate(anchorX - stringPull, -8.5);
            ctx.fillStyle = "#3e2723"; ctx.fillRect(0, -0.5, 9, 1); 
            ctx.fillStyle = isPoison ? "#4caf50" : "#9e9e9e";
            ctx.beginPath(); ctx.moveTo(9, -1.2); ctx.lineTo(13, 0); ctx.lineTo(9, 1.2); ctx.fill();
            ctx.restore();
        }

        ctx.restore();  
        ctx.restore();  
	}
}

else if (unitName && unitName.includes("Firelance")) {
	
const isHeavy = unitName.includes("Heavy");
    const hasAmmo = (typeof unit !== 'undefined' && unit.ammo > 0);
    
    // --- NEW: THE PER-BATTLE FUSE LOGIC ---
    const burnLimit = isHeavy ? 3000 : 1000; // 3 seconds for Heavy, 1 for Normal
    
    // Initialize a permanent timestamp on the unit the very first time they attack
    if (isAttacking && hasAmmo && !unit.firstFireTime) {
        unit.firstFireTime = Date.now();
    }

    // Check if the fuse has blown: 
    // If they haven't fired yet, or if they started firing less than [burnLimit] ago.
    let fuseIsActive = false;
    if (unit.firstFireTime) {
        let elapsed = Date.now() - unit.firstFireTime;
        if (elapsed < burnLimit) {
            fuseIsActive = true;
        }
    }
    // ------
    
    let animDuration = 300; 
    let cycle = 1.0; // Default to idle state
    
    if (isAttacking) {
        // Ideal scenario: Your unit object tracks when the attack started
        if (typeof unit !== 'undefined' && unit.lastAttackTime) {
            // Clamps the animation between 0.0 and 1.0, stopping cleanly when finished
            cycle = Math.min((Date.now() - unit.lastAttackTime) / animDuration, 1.0);
        } else {
            // Fallback: If you don't track start time, this uses modulo to loop 
            // the animation cleanly as long as 'isAttacking' is true.
            cycle = (Date.now() % animDuration) / animDuration;
        }
    }

    // 2. REVISED PHYSICS: Snap-Thrust & Dynamic Swing
    let isSwing = (typeof unit !== 'undefined' && unit.id && unit.id % 4 === 0) || (!hasAmmo);
    
    let thrust = 0;
    let swingY = 0; // Vertical displacement for swings

    if (isAttacking && cycle < 1.0) {
        if (cycle < 0.2) {
            // Explosive forward lunge (0% to 20% of animation)
            thrust = (cycle / 0.2) * 22; 
        } else {
            // Slower, guarded retraction (20% to 100% of animation)
            thrust = 22 * (1 - (cycle - 0.2) / 0.8);
        }
        
        // If it's a swinging strike, we add a deep vertical drop that peaks with the thrust
        if (isSwing) {
            swingY = Math.sin(cycle * Math.PI) * 10; 
        }
    }

    // Base Y offset applied to all weapon parts to simulate the swing angle
    let baseY = -8 + swingY;

    // ═══════════════════════════════════════════════════════════════
    // DOWNWARD FACING (facingDirY===1) — ported this session (this
    // branch was missed in the original ranged-weapons pass; found via
    // user report and fixed here).
    //
    // Unlike gun/peasant/the cavalry lance, this weapon's shaft/tubes/
    // spearhead/flame-jet are NOT already drawn inside a rotation
    // wrapper — every piece uses `(N + thrust) * dir` for its reach and
    // a shared `baseY` for its perpendicular position, drawn directly
    // with absolute moveTo/lineTo/fillRect coordinates. Rather than
    // hand-editing every one of those coordinates individually (shaft,
    // both tube variants' ties, the spearhead, the flame gradient, the
    // spark shower — high risk of missing one), this ADDS a new
    // rotation wrapper around the whole block instead, rotating
    // everything around the origin for facingDown.
    //
    // UPDATED per explicit user follow-up ("attack direction for
    // weapons such as firelances [should] point to the direction at
    // which you're heading based on the Q1-Q4 quadrant"): a pure +90°
    // rotation puts the shaft on a perfectly constant screen-X
    // coordinate (verified by hand: local points (-4,baseY) and
    // (21+thrust,baseY) both rotate to the SAME x, only y differs) —
    // i.e. dead vertical, with NO lean left or right even when the
    // unit is also moving left/right (facingDir). That's the bug: it
    // ignores the horizontal component of the actual heading entirely.
    // DOWN_QUADRANT_ANGLE (45°, matching the archer fix from earlier
    // feedback) fixes this — rotating by 45° instead of 90° makes the
    // shaft's screen X vary WITH its reach again, producing a genuine
    // diagonal line. Combined with the existing global
    // ctx.scale(unit.facingDir,1) mirror at the very top of this
    // function (which already flips this whole rotated block for
    // free), this correctly lands in whichever of the 4 heading
    // quadrants the unit is actually moving toward: facingDir=1 (right)
    // + facingDown → aims down-right (Q4); facingDir=-1 (left) +
    // facingDown → mirrors to down-left (Q3) automatically, no extra
    // code needed for that half. This is the same fix applied to every
    // other "pure 90°" weapon this session — search this file for
    // DOWN_QUADRANT_ANGLE to find them all.
    // ═══════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════
    // BUGFIX (facingUp — firelance didn't point up): same gap as gun/
    // spearman — only facingDown was ever checked, so a facingUp
    // firelancer kept aiming in the default side-view direction.
    // UP_QUADRANT_ANGLE is the facingUp counterpart to
    // DOWN_QUADRANT_ANGLE (declared alongside it near the top of this
    // function) — same reasoning, same quadrant-consistent lean.
    ctx.save();
    ctx.rotate(facingDown ? DOWN_QUADRANT_ANGLE : (facingUp ? UP_QUADRANT_ANGLE : 0));

    // Draw the Wooden Shaft
    ctx.strokeStyle = "#5d4037"; 
    ctx.lineWidth = 2; // Slightly thicker for a heavy polearm
    ctx.beginPath(); 
    ctx.moveTo(-4 * dir, baseY); 
    ctx.lineTo((21 + thrust) * dir, baseY); 
    ctx.stroke();

    // 3. Draw the Historical Bamboo/Paper Tubes
    ctx.fillStyle = "#2b2b2b"; // Charred bamboo look
    let tubeTopY = baseY - 3.5;
    let tubeBotY = baseY + 0.5;

    if (isHeavy) {
        // Heavy: Two tubes tied to the top and bottom of the shaft
        ctx.fillRect((14 + thrust) * dir, tubeTopY, 8 * dir, 3.5); 
        ctx.fillRect((14 + thrust) * dir, tubeBotY, 8 * dir, 3.5);  
        
        // Hemp twine ties (Moving dynamically with thrust)
        ctx.strokeStyle = "#8d6e63"; 
        ctx.lineWidth = 1.2;
        
        // Front Tie
        ctx.beginPath(); 
        ctx.moveTo((15 + thrust) * dir, tubeTopY - 0.5); 
        ctx.lineTo((15 + thrust) * dir, tubeBotY + 4); 
        ctx.stroke();
        
        // Back Tie
        ctx.beginPath(); 
        ctx.moveTo((20 + thrust) * dir, tubeTopY - 0.5); 
        ctx.lineTo((20 + thrust) * dir, tubeBotY + 4); 
        ctx.stroke();
    } else {
        // Standard: Single tube lashed securely to the top
        ctx.fillRect((14 + thrust) * dir, tubeTopY, 8 * dir, 4);
        
        ctx.strokeStyle = "#8d6e63"; 
        ctx.lineWidth = 1.2;
        ctx.beginPath(); 
        ctx.moveTo((16 + thrust) * dir, tubeTopY - 0.5); 
        ctx.lineTo((16 + thrust) * dir, baseY + 1); 
        ctx.stroke();
        ctx.beginPath(); 
        ctx.moveTo((20 + thrust) * dir, tubeTopY - 0.5); 
        ctx.lineTo((20 + thrust) * dir, baseY + 1); 
        ctx.stroke();
    }

    // 4. The Spearhead
    ctx.fillStyle = "#bdbdbd"; 
    ctx.beginPath(); 
    ctx.moveTo((21 + thrust) * dir, baseY); 
    ctx.lineTo((24 + thrust) * dir, baseY - 2.5); 
    ctx.lineTo((31 + thrust) * dir, baseY); // Sharper, longer point
    ctx.lineTo((24 + thrust) * dir, baseY + 2.5); 
    ctx.closePath(); 
    ctx.fill();

    // 5. ENHANCED FIRE & EFFECTS (HUGE FLAMES)
// --- CHANGE THIS LINE ---
if (isAttacking && hasAmmo && fuseIsActive && cycle < 1.0) { 
    // Your flame drawing code...

        let firePos = isHeavy ? tubeTopY + 1.5 : tubeTopY + 2; 
        let showFire = true;
        let isIgniting = false;

        if (isHeavy) {
            // Instant Reload: A tiny gap in the animation cycle for a flash ignition
            if (cycle > 0.48 && cycle < 0.52) {
                showFire = false;
                isIgniting = true;
                firePos = tubeBotY + 1.5; // Snap to bottom tube
            } else if (cycle >= 0.52) {
                firePos = tubeBotY + 1.5; // Bottom tube firing
            }
        }

        if (isIgniting) {
            // Fast, blinding ignition spark between tubes
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc((22 + thrust) * dir, firePos, 4 + Math.random() * 3, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = "#ffeb3b";
            ctx.beginPath();
            ctx.arc((22 + thrust) * dir, firePos, 2 + Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
        } else if (showFire) {
            // MASSIVE Flame Jet (Historical gunpowder payload)
            let flameLen = 80 + Math.random() * 120; // Pushed from ~20 to ~200 max length!
            let flameWidth = 15 + Math.random() * 15; // Wide, billowing blast
            
            let grd = ctx.createLinearGradient((22 + thrust) * dir, firePos, (22 + thrust + flameLen) * dir, firePos);
            grd.addColorStop(0, "#ffffff"); // Blinding core
            grd.addColorStop(0.1, "#fff59d"); // Yellow hot
            grd.addColorStop(0.3, "#ff9800"); // Expanding orange
            grd.addColorStop(0.7, "#f44336"); // Searing red edges
            grd.addColorStop(1, "rgba(33, 33, 33, 0)"); // Smoky dispersion

            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.moveTo((22 + thrust) * dir, firePos);
            // Drastically widened quadratic curves for a funnel-shaped blast
            ctx.quadraticCurveTo((30 + thrust + flameLen/3) * dir, firePos - flameWidth, (22 + thrust + flameLen) * dir, firePos);
            ctx.quadraticCurveTo((30 + thrust + flameLen/3) * dir, firePos + flameWidth, (22 + thrust) * dir, firePos);
            ctx.fill();

            // Heavy shower of cinders & sparks
            ctx.fillStyle = "#ffeb3b";
            for(let i = 0; i < 12; i++) {
                let sparkX = (22 + thrust + Math.random() * (flameLen * 0.8)) * dir;
                let sparkY = firePos + (Math.random() * flameWidth - flameWidth/2);
                ctx.fillRect(sparkX, sparkY, 2 + Math.random()*2, 2 + Math.random()*2);
            }
        }
    } 

    ctx.restore();
}

	else if (type === "gun") {
        // SURGERY: Complete Hand Cannon Reload Cycle & Direct Ignition
        // SANYANCHONG (Ming triple-barrel hand cannon) — added this
        // session for the new unit of the same name (see
        // units_expansion.js). Reuses this whole branch like Tanegashima
        // does, but needs more than a cosmetic re-skin: the getReloadTime()
        // special case in troop_system.js gives it a quick 60-tick cycle
        // between its 3 pre-loaded barrels and a much longer 420-tick
        // cycle once all three are spent (mirrored here via the SAME
        // ammo%3 check, since this render code has no direct call into
        // that function) — so maxCd, and the phase animation it drives,
        // both need to branch on which of those two states this is.
        const isSanyanchong = (unitName === "Sanyanchong");
        const sanyanchongAmmo = (isSanyanchong && unit && unit.stats && typeof unit.stats.ammo === 'number') ? unit.stats.ammo : null;
        // Mirrors troop_system.js's getReloadTime() check exactly — true
        // for the quick between-barrels reload, false for the full
        // 3-barrel reload (or for any non-Sanyanchong gun).
        const isSanyanchongBarrelCycle = isSanyanchong && sanyanchongAmmo !== null && ((sanyanchongAmmo % 3) !== 0);
        // Which barrel (0/1/2, top/mid/bottom in the geometry below) is
        // currently loaded and about to fire — counts shots already
        // taken out of the current group of 3 by reading ammo's own
        // position within that group, so it stays correct without any
        // separate counter to keep in sync.
        const sanyanchongBarrelIndex = isSanyanchong && sanyanchongAmmo !== null
            ? ((3 - (((sanyanchongAmmo % 3) + 3) % 3)) % 3)
            : 0;

        let maxCd = isSanyanchong ? (isSanyanchongBarrelCycle ? 60 : 420) : 300;
        let cd = cooldown || 0;
        let cycle = isAttacking ? (maxCd - cd) / maxCd : 1.0;

        let gunRot = 0;
        let shakeRot = 0;
        let recoilX = 0;

        // Determine Gun Angle & Shake based on specific reload phase
        if (isAttacking && cd > 0) {
            if (isSanyanchong && isSanyanchongBarrelCycle) {
                // QUICK BARREL-CYCLE (60 ticks) — the next barrel is
                // already loaded, so there's no powder/ball/wadding/
                // ramrod sequence to animate at all here (that only
                // happens once all three are spent — see the FULL
                // RELOAD phases below, shared with the elaborate
                // sequence other guns use). Just a firing flash, then a
                // brief settle as the gunner's grip shifts to bring the
                // next barrel to bear.
                if (cycle < 0.15) {
                    gunRot = 0;
                    shakeRot = (Math.random() - 0.5) * 0.2;
                    recoilX = -3 * dir;
                } else {
                    gunRot = 0;
                }
            } else if (cycle < 0.05) {
                // 0% - 5%: FIRING! Per report, the barrel should be
                // perfectly straight at the moment of the shot — this
                // used to add a (-π/10)*dir cant here, which is now
                // removed. shakeRot (recoil jitter) and recoilX (kickback)
                // are left as-is, since those read as the shot's kick
                // rather than a held aim angle. Because gunRot is shared
                // by all three aim poses (up/down/side — see gunBaseRot
                // below, now target-based rather than facingDown/
                // facingUp-based, but the sharing itself is unchanged),
                // zeroing it here makes ALL THREE poses shoot straight,
                // not just the side view.
                gunRot = 0;
                shakeRot = (Math.random() - 0.5) * 0.2; 
                recoilX = -4 * dir;
            } else if (cycle < 0.15) {
                // 5% - 15%: Transition to reload position
                gunRot = (Math.PI / 6) * dir; 
            } else if (cycle < 0.65) {
                // 15% - 65%: Gun pointed steeply up for loading down the muzzle
                gunRot = (Math.PI / 3) * dir; 
            } else if (cycle < 0.75) {
                // 65% - 75%: Lowering slightly to access the touchhole (priming)
                gunRot = (Math.PI / 8) * dir; 
            } else {
                // 75% - 100%: Leveling out, holding fuse, lighting
                gunRot = 0; 
            }
        }

        // ═══════════════════════════════════════════════════════════
        // AIM DIRECTION & ANGLE — per direct follow-up request,
        // REPLACED again this session: "all ranged weapons when aiming
        // and shooting (not reloading) should aim at the exact angle
        // ...at the target" — continuous tracking, not a fixed 0°/45°/
        // 90° snap. Gun only ever had ONE rotation wrapper for its
        // whole weapon (ctx.rotate(gunRot + shakeRot + gunBaseRot)
        // below) — there's no separate up/down "pose" to switch
        // between, so unlike the Repeater/Cannon (which have genuinely
        // different hand-built geometry for steep angles) gun needs no
        // quadrant/zone logic at all: the same rotated geometry works
        // at any angle from -90° to +90°, so gunBaseRot can just BE
        // the live tracked angle directly.
        //
        // isGunReloading — the four sub-phases above (roughly 5%-75%
        // of the cycle) where gunRot is actively animating its own
        // reload motion (barrel swung up to load, lowered to prime,
        // etc.). Aim tracking is suspended for exactly this window per
        // "not reloading" — forcing gunBaseRot to a hard 0 rather than
        // layering a leftover aim angle on top of gunRot's own big
        // reload-phase rotation, which would fight with it visually.
        // The persisted _gunAimAngle itself is left untouched (not
        // decayed) during this window, so aim doesn't have to re-earn
        // the angle from scratch once reload finishes.
        //
        // GUN_AIM_TURN_RATE — a hand cannon is a light, one-handed-
        // braced weapon, so it's given the brisker end of the turn
        // rates used across these weapons (compare CROSSBOW_AIM_
        // TURN_RATE = 0.06 and CANNON_AIM_TURN_RATE = 0.02 in
        // cavscript.js). Best-judgment value, no in-game reference to
        // calibrate against yet.
        // ═══════════════════════════════════════════════════════════
        const GUN_AIM_TURN_RATE = 0.09; // radians/frame
        const isGunReloading = isAttacking && cd > 0 && cycle >= 0.05 && cycle < 0.75;

        let gunTargetAngle = 0;
        // OPTIMIZATION — per direct warning: reload phases must not
        // compute atan2 at all (not just discard its result); aiming/
        // shooting is the only state that needs it. The Math.atan2
        // call (and the facingDir mirror update next to it) is now
        // INSIDE the !isGunReloading check, not just the easing call
        // below it.
        if (!isGunReloading && unit && unit.target && typeof unit.x === 'number' && typeof unit.target.x === 'number'
            && typeof unit.y === 'number' && typeof unit.target.y === 'number') {
            const _gdx = unit.target.x - unit.x;
            const _gdy = unit.target.y - unit.y;
            gunTargetAngle = Math.atan2(_gdy, Math.abs(_gdx));
            if (Math.abs(_gdx) > 0.0001) {
                unit.facingDir = _gdx < 0 ? -1 : 1;
            }
        }
        if (unit && !isGunReloading) {
            _easeAimAngle(unit, '_gunAimAngle', gunTargetAngle, GUN_AIM_TURN_RATE);
        }
        const gunBaseRot = (!isGunReloading && unit && typeof unit._gunAimAngle === 'number')
                          ? unit._gunAimAngle
                          : 0;

        ctx.save();
        ctx.translate(0, weaponBob); // Removed random bobbing; keeping it smooth. recoilX no longer applied here — see below.
        ctx.rotate(gunRot + shakeRot + gunBaseRot);

        // RECOIL — per direct request, REVISED this session to be
        // axis-aware ("realistic based on quadrant and tube angle").
        // Previously recoilX (-4*dir at the firing instant) was applied
        // via the ctx.translate ABOVE, i.e. BEFORE ctx.rotate — a flat
        // screen-space X shift. That's correct only for the side pose
        // (barrel along screen-X, so a backward-X kick reads as
        // "kicks back toward the gunner"). Once gunBaseRot can be a
        // true ±90° (see AIM DIRECTION & ANGLE above), the barrel's own
        // axis is screen-Y at the up/down poses, so the same flat
        // screen-X shift read as an unrelated sideways jiggle instead
        // of a kickback — exactly the bug flagged after the perpendicular-
        // aim fix.
        //
        // FIX: recoil is now a translate along LOCAL +X — the same axis
        // the barrel itself is drawn along (Barrel: moveTo(6*dir,-5) ->
        // lineTo(16*dir,-5), i.e. local +X is always "toward the
        // muzzle," regardless of pose) — applied AFTER ctx.rotate, so
        // it inherits whichever pose's rotation is active automatically,
        // the same way the barrel/hands/muzzle-flash already do. A
        // backward kick is local -X (opposite the muzzle), same sign/
        // magnitude/timing as the original (-4*dir at the firing
        // instant, 0 otherwise) — only which axis it travels along has
        // changed. Verified: at gunBaseRot=0 (side) this reduces to the
        // exact same screen-space (-4*dir, 0) as before, so the side
        // pose's feel is unchanged; at ±90° it now lands purely on
        // screen-Y (up for the down pose, down for the up pose) —
        // backward along the barrel in both cases, with no diagonal
        // bleed into the other axis.
        ctx.translate(recoilX, 0);

        // TANEGASHIMA (Japanese matchlock) — visual variant added this
        // session for the new unit of the same name (see
        // units_expansion.js). Reuses this ENTIRE branch — aim system,
        // reload timing/phase structure, hand positions — unchanged;
        // only the stock/barrel proportions+colors and the ignition
        // detail differ, gated on unitName so the vanilla Hand
        // Cannoneer is completely unaffected.
        const isMatchlock = (unitName === "Tanegashima");
        // Shared "where is the muzzle" x-coordinate — the reload phases
        // below (powder/ball/wadding/ramrod) all anchor to this instead
        // of a hardcoded 16, so the matchlock's longer barrel doesn't
        // reintroduce the "hand floats past the gun's own tip" bug that
        // was fixed for the hand cannon (see the BUGFIX comments on
        // those phases below — they predate this variable but the fix
        // they describe is exactly why this exists). Sanyanchong's
        // triple barrels run a little SHORTER per-tube than the hand
        // cannon's single one (historically stubbier, bundled for
        // volume of fire rather than one long reach), at 14 — but see
        // stickBackX just below for where its OWN distinguishing length
        // actually goes.
        const muzzleX = isMatchlock ? 22 : (isSanyanchong ? 14 : 16);
        // Where the stock/barrel join (touchhole/pan position) sits —
        // the hand cannon's plain breech-priming spot, the matchlock's
        // serpentine pan, and the point the 3 barrels above bundle
        // together for Sanyanchong. Matches the Tiller draw's own
        // length below.
        const breechX = isMatchlock ? 5 : 6;
        // SANYANCHONG ONLY — how far the haft protrudes BEHIND the grip
        // (negative local x, i.e. away from the muzzle), per direct
        // request ("triple barreled hand cannon with a stick
        // protruding"). The hand cannon/matchlock stocks above both run
        // from x=0 (the grip) forward to the breech; this adds a second
        // stretch running backward from x=0, long enough for a two-
        // handed grip and for the whole thing to double as a
        // quarterstaff once all three barrels are spent (see the
        // shortsword-fallback dispatch elsewhere in this file for how
        // out-of-ammo gunners switch weapons — Sanyanchong instead
        // keeps and swings this same haft, drawn once below).
        const stickBackX = -11;

        // Tiller (Wooden Stock) - NO TRIGGER
        // Matchlock stock: shorter and dark-lacquered (same "#1a1a1a"
        // convention as the archer branch's Yumi bow, elsewhere in this
        // file) rather than the hand cannon's plain brown, since a
        // tanegashima's stock is laid along the cheek rather than
        // gripped like a simple pole — reads better a little shorter
        // and slimmer relative to its (longer, below) barrel.
        ctx.strokeStyle = isMatchlock ? "#1a1a1a" : "#5d4037";
        ctx.lineWidth = isMatchlock ? 3 : 3.5;
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo((isMatchlock ? 5 : 6) * dir, -5); ctx.stroke();

        if (isSanyanchong) {
            // Protruding rear haft — see stickBackX above. Drawn as its
            // own stroke rather than folded into the Tiller line above
            // so its color/weight can read as "plain gripping wood"
            // distinct from the touchhole end.
            ctx.strokeStyle = "#6d4c41"; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(stickBackX * dir, -5); ctx.stroke();
            // Iron collar binding the haft to the barrel cluster, right
            // at the grip — reads as "this is one rigid weapon", not a
            // stick loosely lashed to three separate tubes.
            ctx.strokeStyle = "#616161"; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(-1 * dir, -7); ctx.lineTo(-1 * dir, -3); ctx.stroke();
        }
        
        // Barrel (Iron)
        // Matchlock barrel: noticeably longer than the hand cannon's
        // (real tanegashima barrels ran proportionally long for
        // accuracy — the whole point of the serpentine/pan mechanism
        // below is freeing the gunner's hand to actually sight down
        // one) and a cooler blued-steel tone rather than plain iron.
        //
        // Sanyanchong: THREE parallel barrels bundled at y=-7/-5/-3
        // instead of the single y=-5 tube every other gun here uses —
        // the actual defining feature of the weapon per direct request
        // ("triple barreled hand cannon"). The currently-loaded one
        // (sanyanchongBarrelIndex, tracked off the unit's own ammo
        // count — see its declaration above) is drawn brighter/thicker
        // so it's readable which tube is about to fire; the other two
        // stay a duller cast-bronze tone.
        if (isSanyanchong) {
            for (let bi = 0; bi < 3; bi++) {
                const by = -7 + bi * 2; // -7, -5, -3
                const isActiveBarrel = (bi === sanyanchongBarrelIndex);
                ctx.strokeStyle = isActiveBarrel ? "#8d6e63" : "#5d4e46"; // bronze — brighter for the loaded/firing tube
                ctx.lineWidth = isActiveBarrel ? 2.4 : 2;
                ctx.beginPath(); ctx.moveTo(breechX * dir, by); ctx.lineTo(muzzleX * dir, by); ctx.stroke();
            }
        } else {
            ctx.strokeStyle = isMatchlock ? "#37474f" : "#424242";
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(breechX * dir, -5); ctx.lineTo(muzzleX * dir, -5); ctx.stroke();
        }

        // Hands & Elaborate Reloading Action
        ctx.fillStyle = "#ffccbc";
        ctx.beginPath(); ctx.arc((isSanyanchong ? -6 : 2) * dir, -5, 2, 0, Math.PI*2); ctx.fill(); // Back hand — on the protruding haft for Sanyanchong's two-handed grip, on the tiller otherwise
        
        if (isSanyanchong && isSanyanchongBarrelCycle) {
            // QUICK BARREL-CYCLE hand animation — no powder/ball/wadding/
            // ramrod here (see the gunRot phase block above for why);
            // just the back hand steadying the haft and the front hand
            // shifting slightly along the barrel cluster as the gunner's
            // grip re-settles onto the next tube.
            const settle = Math.min(1, Math.max(0, (cycle - 0.15) / 0.85));
            ctx.beginPath(); ctx.arc((6 + settle * 2) * dir, -5 + (sanyanchongBarrelIndex - 1) * 0.6, 2, 0, Math.PI*2); ctx.fill();
        } else if (isAttacking && cd > 0) {
            if (cycle >= 0.15 && cycle < 0.25) { 
                // 1. Pouring Powder
                // BUGFIX (realistic reload): hand/flask/powder used to sit
                // at x=18*dir, 2 units past the barrel's actual muzzle
                // (the barrel runs 6*dir->16*dir, per the Barrel draw
                // above — so 16*dir is the true open end), floating past
                // the gun's own tip instead of pouring into it. Moved to
                // x=16*dir, matching the flask (already correctly at
                // 16*dir) and the muzzle flash fix below.
                let drop = (cycle - 0.15) * 10; // Animation progress (0 to 1)
                ctx.beginPath(); ctx.arc(muzzleX * dir, -12, 2, 0, Math.PI*2); ctx.fill(); // Hand
                ctx.fillStyle = "#795548"; ctx.fillRect(muzzleX * dir, -16, 4 * dir, 6); // Flask
                ctx.fillStyle = "#212121"; ctx.fillRect((muzzleX - 0.5) * dir, -10 + (drop * 4), 1.5 * dir, 2); // Powder falling
            } 
            else if (cycle >= 0.25 && cycle < 0.32) { 
                // 2. Inserting Projectile
                // BUGFIX (realistic reload): same 2-unit muzzle offset as
                // the powder phase above — moved to the true muzzle
                // (muzzleX*dir) so the ball actually drops into the
                // barrel, not beside it.
                let drop = (cycle - 0.25) * 14; 
                ctx.beginPath(); ctx.arc(muzzleX * dir, -10, 2, 0, Math.PI*2); ctx.fill(); // Hand
                ctx.fillStyle = "#424242"; ctx.beginPath(); ctx.arc(muzzleX * dir, -8 + (drop * 3), 1.5, 0, Math.PI*2); ctx.fill(); // Iron ball
            } 
            else if (cycle >= 0.32 && cycle < 0.40) { 
                // 3. Inserting Wadding
                // BUGFIX (realistic reload): same fix, true muzzle at
                // muzzleX*dir.
                let drop = (cycle - 0.32) * 12; 
                ctx.beginPath(); ctx.arc(muzzleX * dir, -10, 2, 0, Math.PI*2); ctx.fill(); // Hand
                ctx.fillStyle = "#d7ccc8"; ctx.beginPath(); ctx.arc(muzzleX * dir, -8 + (drop * 3), 1.5, 0, Math.PI*2); ctx.fill(); // Wadding
            } 
            else if (cycle >= 0.40 && cycle < 0.65) { 
                // 4. Ramming down the barrel
                // BUGFIX (realistic reload): ramrod hand start position
                // moved from 18*dir to 16*dir (true muzzle) to match —
                // the rod's TRAVEL (down to 8*dir, near the breech) was
                // already correct, only its starting anchor was off.
                let ramMove = Math.sin((cycle - 0.40) * Math.PI * 12) * 5; // Up and down motions
                ctx.beginPath(); ctx.arc((muzzleX + ramMove) * dir, -5, 2, 0, Math.PI*2); ctx.fill(); // Hand
                ctx.strokeStyle = "#8d6e63"; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo((muzzleX + ramMove) * dir, -5); ctx.lineTo((8 + ramMove) * dir, -5); ctx.stroke(); // Ramrod
            } 
            else if (cycle >= 0.65 && cycle < 0.75) { 
                // 5. Priming the touchhole
                // breechX (= the stock/barrel joint, where the touchhole/
                // pan sits) mirrors muzzleX's reasoning above — the
                // matchlock's shorter stock (5*dir vs 6*dir, see the
                // Tiller draw) moves this point too.
                ctx.beginPath(); ctx.arc(breechX * dir, -8, 2, 0, Math.PI*2); ctx.fill(); // Hand at breech
                ctx.fillStyle = "#212121"; ctx.fillRect((breechX - 0.5) * dir, -6, 1.5 * dir, 1.5); // Pinch of powder
            } 
            else if (cycle >= 0.90 && cycle < 1.0) { 
                // 6. Lighting the fuse
                if (isMatchlock) {
                    // TANEGASHIMA — the defining feature of a matchlock
                    // over a plain hand cannon: a pivoting serpentine arm
                    // (holding the lit match) lowers onto the pan by
                    // itself, rather than a free hand bringing an open
                    // flame down. Drawn as a small curved metal arm
                    // pivoting from just behind the pan down onto it,
                    // with the same spark/glow to sell contact.
                    const serpAngle = -0.3 + (Math.random() * 0.05); // slight tremor, mostly settled onto the pan by this point in the phase
                    ctx.save();
                    ctx.translate(breechX * dir, -9);
                    ctx.rotate(serpAngle * dir);
                    ctx.strokeStyle = "#616161"; ctx.lineWidth = 1.2;
                    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(3 * dir, 3); ctx.stroke(); // serpentine arm
                    ctx.fillStyle = "#e65100"; ctx.beginPath(); ctx.arc(3 * dir, 3, 1, 0, Math.PI * 2); ctx.fill(); // match tip
                    ctx.restore();
                    ctx.fillStyle = "#ffccbc"; ctx.beginPath(); ctx.arc(2 * dir, -9, 1.6, 0, Math.PI*2); ctx.fill(); // steadying hand near the lock, not on the flame
                    ctx.fillStyle = "#ffeb3b"; ctx.beginPath(); ctx.arc((breechX + 1) * dir, -6.5, 1.5 + Math.random(), 0, Math.PI*2); ctx.fill(); // Sparks!
                } else {
                    ctx.beginPath(); ctx.arc(breechX * dir, -8, 2, 0, Math.PI*2); ctx.fill(); // Hand bringing fuse down
                    ctx.strokeStyle = "#e65100"; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(breechX * dir, -8); ctx.lineTo((breechX + 1) * dir, -5.5); ctx.stroke(); // Slow match
                    ctx.fillStyle = "#ffeb3b"; ctx.beginPath(); ctx.arc((breechX + 1) * dir, -5.5, 1.5 + Math.random(), 0, Math.PI*2); ctx.fill(); // Sparks!
                }
            } 
            else {
                // Idle / Resting / Waiting for next phase
                ctx.beginPath(); ctx.arc(8 * dir, -5, 2, 0, Math.PI*2); ctx.fill(); 
            }
        } else {
            // Not attacking - Normal front hand resting
            ctx.beginPath(); ctx.arc(8 * dir, -5, 2, 0, Math.PI*2); ctx.fill(); 
        }

        // Muzzle Flash & Smoke (Only triggers in the first 5% of the cooldown cycle)
        // BUGFIX (realistic reload/firing): flash/flame/smoke used to
        // erupt from x=18/22/26*dir, all 2 units past the barrel's real
        // muzzle (16*dir) — same offset as the reload phases above, now
        // consistently anchored to the true muzzle and its outward
        // direction from there.
        if (isAttacking && cycle < 0.05) { 
            // Sanyanchong: flash erupts from whichever of the 3 barrels
            // is actually loaded/firing (sanyanchongBarrelIndex — see
            // its declaration above), not the single fixed y=-5 every
            // other gun here uses.
            const flashY = isSanyanchong ? (-7 + sanyanchongBarrelIndex * 2) : -5;
            ctx.fillStyle = "#ffeb3b"; // Core flash
            ctx.beginPath(); ctx.arc(muzzleX * dir, flashY, 3 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
            
            ctx.fillStyle = "#ff5722"; // Secondary flame
            ctx.beginPath(); ctx.arc((muzzleX + 4) * dir, flashY, 6 + Math.random() * 4, 0, Math.PI * 2); ctx.fill();
            
            ctx.fillStyle = "rgba(140, 140, 140, 0.6)"; // Smoke expanding
            ctx.beginPath(); ctx.arc((muzzleX + 8) * dir, flashY, 8 + Math.random() * 5, 0, Math.PI * 2); ctx.fill();
        }

        ctx.restore();
    }
	else if (unitName && unitName.includes("Bomb")) {
    // ═══════════════════════════════════════════════════════════
    // DOWNWARD FACING (facingDirY===1) — EXCLUDED, confirmed by
    // direct user decision, same as the "throwing" type branch above
    // (Slinger/Javelinier). Correction to this file's earlier notes:
    // Bomber is dispatched via unitName here, NOT nested inside the
    // "throwing" type branch — it's its own separate dispatch, but
    // covered by the same user confirmation ("javelin bomb slinger...
    // satisfied with their current animation as down"). Not a gap,
    // don't port by analogy with archer/gun above.
    // ═══════════════════════════════════════════════════════════
    // Ammo lookup
    // BUGFIX: unit.ammo is a one-time snapshot taken at spawn in
    // battlefield_launch.js and never updated again — real combat only
    // ever decrements unit.stats.ammo (see ai_categories.js's
    // _handleCombatExecution). Reading the stale unit.ammo here made
    // hasAmmo permanently true regardless of the real ammo pool — same
    // bug already identified and fixed in this file's Rocket branch
    // (search "BUGFIX: the `unitAmmo` param"). Read the LIVE value off
    // unit.stats.ammo when we have a real unit; fall back to the passed
    // unitAmmo param only for preview/no-unit renders.
    let currentAmmo = 0;
    if (unit && unit.stats && typeof unit.stats.ammo === 'number') {
        currentAmmo = unit.stats.ammo;
    } else if (typeof unit !== 'undefined' && unit && unit.ammo !== undefined) {
        currentAmmo = unit.ammo;
    } else if (typeof unitAmmo !== 'undefined') {
        currentAmmo = unitAmmo;
    }

    const hasAmmo = currentAmmo > 0;
    const isNull = currentAmmo <= 0; // last ammo spent -> null/catch state

    // Safer bob fallback
    let weaponBob = (typeof bob !== 'undefined') ? bob : 0;

    // --- 1. OFF-HAND & BOMB LOGIC ---
    let offHandX = -4 * dir;
    let offHandY = -4 + weaponBob;

    // When out of ammo, drop into the null/catch pose
    if (isNull) {
        offHandX = -2.5 * dir;
        offHandY = -1 + weaponBob;
    }

    if (hasAmmo) {
        // Optional throw movement while ammo remains
        let maxCd = 1200;
        let currentCd = (typeof cooldown !== 'undefined') ? cooldown : 0;

        if (isAttacking && currentCd > 0) {
            let throwCycle = (maxCd - currentCd) / maxCd;
            if (throwCycle < 0.3) {
                offHandX -= 2 * dir;
                offHandY -= 2;
            } else if (throwCycle < 0.6) {
                offHandX += 4 * dir;
                offHandY -= 4;
            }
        }

        // Bomb body
        ctx.fillStyle = "#546e7a";
        let bombRadius = 3.5;

        ctx.beginPath();
        ctx.arc(offHandX, offHandY - 3, bombRadius, 0, Math.PI * 2);
        ctx.fill();

        // Spikes
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            let angle = (i / 8) * Math.PI * 2;
            let spikeX = offHandX + Math.cos(angle) * (bombRadius + 1.5);
            let spikeY = (offHandY - 3) + Math.sin(angle) * (bombRadius + 1.5);
            ctx.moveTo(offHandX, offHandY - 3);
            ctx.lineTo(spikeX, spikeY);
        }
        ctx.strokeStyle = "#455a64";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Fuse
        ctx.strokeStyle = "#5d4037";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(offHandX, offHandY - 6);
        ctx.bezierCurveTo(
            offHandX - 2 * dir, offHandY - 10,
            offHandX - 5 * dir, offHandY - 8,
            offHandX - 6 * dir, offHandY - 12
        );
        ctx.stroke();
    }

    // Hand always draws, including null state
    ctx.fillStyle = "#ffccbc";
    ctx.beginPath();
    ctx.arc(offHandX, offHandY, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // --- 2. MAIN HAND: THE SHORT DAO ---
    let meleeSpeed = 130;
    let currentCd = (typeof cooldown !== 'undefined') ? cooldown : 0;

    let cycle = 0;
    if (isAttacking) {
        cycle = Math.min(1, (meleeSpeed - (currentCd % meleeSpeed)) / meleeSpeed);
        if (currentCd > meleeSpeed) cycle = 0;
    }

    let thrust = 0, swing = 0, handOffsetY = 0;
    let attackSeed = (unit && unit.id) ? (unit.id % 3) : (Math.floor(x + y) % 3);

    if (isAttacking && cycle > 0 && cycle < 1) {
        if (cycle < 0.15) {
            let p = cycle / 0.15;
            if (attackSeed === 0) {
                thrust = -5 * p;
                swing = -0.2 * p;
            } else if (attackSeed === 1) {
                thrust = -2 * p;
                swing = -Math.PI / 1.8 * p;
                handOffsetY = -5 * p;
            } else {
                thrust = -2 * p;
                swing = Math.PI / 1.2 * p;
            }
        } else if (cycle < 0.45) {
            let p = (cycle - 0.15) / 0.3;
            let ease = p * (2 - p);
            if (attackSeed === 0) {
                thrust = -5 + (ease * 18);
                swing = -0.2 + (ease * 0.5);
            } else if (attackSeed === 1) {
                thrust = -2 + (ease * 8);
                swing = -Math.PI / 1.8 + (ease * Math.PI * 0.9);
                handOffsetY = -5 + (ease * 10);
            } else {
                thrust = -2 + (ease * 12);
                swing = Math.PI / 1.2 - (ease * Math.PI * 1.4);
            }
        } else {
            let p = (cycle - 0.45) / 0.55;
            let recoveryEase = Math.pow(1 - p, 2);
            thrust = (attackSeed === 0 ? 13 : 6) * recoveryEase;
            swing = (attackSeed === 1 ? 0.4 : 0) * recoveryEase;
            handOffsetY = (attackSeed === 1 ? 5 : 0) * recoveryEase;
        }
    }

    ctx.save();
    ctx.translate((4 + thrust) * dir, (-6 + handOffsetY) + weaponBob);

    let baseRotation = (attackSeed === 2) ? -Math.PI / 1.6 : Math.PI / 4;
    ctx.rotate((baseRotation + swing) * dir);

    // Shadow / depth
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(0, 0, 1.5 * dir, -12);

    // Blade
    ctx.fillStyle = (unit && unit.id % 5 === 0) ? "#8d8d8d" : "#a1a1a1";
    ctx.beginPath();
    ctx.moveTo(-1.3, 0);
    ctx.lineTo(-1.3, -13);
    ctx.lineTo(1.5, -10);
    ctx.lineTo(1.5, 0);
    ctx.closePath();
    ctx.fill();

    // Edge detail
    ctx.strokeStyle = "#cfd8dc";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(1.5, 0);
    ctx.lineTo(1.5, -10);
    ctx.stroke();

    // Guard
    ctx.strokeStyle = "#263238";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-2.5, 0);
    ctx.lineTo(2.5, 0);
    ctx.stroke();

    // Grip
    ctx.strokeStyle = "#4e342e";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 5);
    ctx.stroke();

    // Ring pommel
    ctx.strokeStyle = "#263238";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 7, 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();

    // Main hand
    ctx.fillStyle = "#ffccbc";
    ctx.beginPath();
    ctx.arc((4 + thrust) * dir, (-6 + handOffsetY) + weaponBob, 2.8, 0, Math.PI * 2);
    ctx.fill();
}

 else if (unitName?.toLowerCase().includes("ocket") || unitName?.includes("Hwacha") || type === "rocket" || type === "hwacha") {
    // ═══════════════════════════════════════════════════════════════
    // REDESIGNED this session, per explicit request: the wheeled/
    // handled launch CART (bird's-eye box + wooden push-handle,
    // launch-locked to up/down-only while firing because a cart drawn
    // side-on doesn't read as aimed) is replaced entirely with a
    // hand-held tube launcher — same family as `type === "gun"` (the
    // hand cannon) just above: a single thick wooden tube gripped in
    // both hands, no wheels, no handle, no cart body at all.
    //
    // WHY THIS REMOVES THE ANGLE-LOCK PROBLEM: the old cart's box/
    // wheels/handle silhouette only read correctly from directly above
    // or directly below (hence hwachaShowUp/hwachaShowDown forcing out
    // the side view entirely while isLaunching). A held tube has no
    // such restriction — exactly like the hand cannon's barrel, it's a
    // simple rod shape that reads correctly rotated to ANY angle. So
    // this uses the same single-rotation-wrapper pattern as
    // `type === "gun"` (tubeBaseRot = facingDown ? DOWN_QUADRANT_ANGLE
    // : facingUp ? UP_QUADRANT_ANGLE : 0) — no separate top-down
    // geometry needed, one drawing rotated for every facing. A
    // DIRECTION LOCK (see below) still deliberately forces this to
    // up/down-only WHILE ACTUALLY FIRING, per explicit spec — that's a
    // gameplay-driven constraint on WHEN tubeBaseRot is allowed to be
    // the side-view 0, not a limitation of the tube art itself.
    //
    // Ignition -> launch flame -> drifting smoke is carried over
    // unchanged in spirit from the old cart (same 3-phase fireCycle
    // timing), just re-anchored to the tube's muzzle instead of the
    // box's mouth.
    // ═══════════════════════════════════════════════════════════════
    // BUGFIX: the `unitAmmo` param (unit.ammo) is a one-time snapshot taken
    // at spawn in battlefield_launch.js and never updated again — real
    // combat only ever decrements unit.stats.ammo (see ai_categories.js
    // _handleCombatExecution's "UNIVERSAL MAGAZINE SURGERY"). Reading the
    // stale unit.ammo here made hasAmmo permanently true, so the launcher
    // never stopped showing loaded rockets / re-igniting regardless of the
    // real ammo pool (read as "infinite ammo"). Read the LIVE value off
    // unit.stats.ammo when we have a real unit; fall back to the passed
    // unitAmmo param only for preview/no-unit renders.
    const currentAmmo = (unit && unit.stats && typeof unit.stats.ammo === 'number')
        ? unit.stats.ammo
        : ((typeof unitAmmo !== 'undefined') ? unitAmmo : 0);
    const hasAmmo = currentAmmo > 0;

    // ── GROUND DROP: the empty tube falls and lingers, then disappears ──
    // Per explicit spec: once ammo hits 0 the tube shouldn't keep
    // silently existing in the unit's hands forever, nor pop away
    // instantly — it drops to the ground and lingers there briefly
    // before fully disappearing, and only THEN does the unit switch to
    // its backup axe (see the "Backup weapon" section far below).
    //
    // ROCKET_DROP_LINGER_MS picked to match the SAME 450ms scale
    // already used for the backup weapon's own swing cycle just below
    // in this file, for a consistent feel — "a fraction of a second".
    //
    // unit._rocketDropTime / unit._rocketDropped are stamped on the
    // FIRST frame hasAmmo goes false (an edge-detect, not "ammo is
    // currently 0", so we don't restart the clock every frame while
    // depleted). Defensively reset if ammo is ever seen positive again
    // (no resupply mechanic currently spends it back up, but this
    // keeps the drop from getting stuck "used up" if one is ever
    // added later).
    const ROCKET_DROP_LINGER_MS = 450;
    if (unit) {
        if (!hasAmmo && !unit._rocketDropped) {
            unit._rocketDropTime = Date.now();
            unit._rocketDropped = true;
        } else if (hasAmmo && unit._rocketDropped) {
            unit._rocketDropped = false;
            unit._rocketDropTime = 0;
        }
    }
    const msSinceDrop = (unit && unit._rocketDropTime) ? (Date.now() - unit._rocketDropTime) : 0;
    // Tube is still on-screen (held OR lying dropped) during this window;
    // once it passes, the tube stops rendering entirely ("disappears").
    const showDroppedTube = !hasAmmo && !!(unit && unit._rocketDropped) && msSinceDrop < ROCKET_DROP_LINGER_MS;

    // BUGFIX: isAttacking (unit.state === "attacking" && unit.cooldown > 30)
    // is a brief PER-SHOT windup flash — for Rocket's 42-tick reload that's
    // only true ~12 ticks (~28%) of each shot's cycle, so the direction lock
    // engaged then immediately released back to side view for the other
    // ~72% between every single shot, reading as "always sideways" with
    // occasional flicker. isLaunching needs to span the WHOLE ranged
    // engagement (every shot of the volley), not just each shot's windup —
    // unit.state stays "attacking" continuously for the entire engagement
    // (set unconditionally in _handleCombatExecution), so pair it with the
    // ranged stance instead of the narrow cooldown gate.
    const isRangedEngaged = unit && unit.stats
        ? (unit.state === "attacking" && unit.stats.currentStance === "statusrange")
        : isAttacking;
    // "HAS FIRED" GATE — proactive consistency fix, same reasoning as
    // the Repeater's ENGAGE block (top-down block, troop_draw.js call
    // site above): isRangedEngaged alone (state+stance) can go true the
    // instant a target is acquired, before the very first shot actually
    // fires. Not a reported rocket bug this round, but the identical
    // underlying mechanism has the same theoretical hole, so applying
    // the same fix here rather than leaving it inconsistent between the
    // two units.
    //
    // TIMER BACKUP — added this session per direct request: "animation
    // is after the first shot, with a backup based on a timer just in
    // case the launcher keeps shooting." The primary trigger above
    // (isAttacking flipping true while in statusrange) is the normal
    // path, but if for any reason that per-shot flag never pulses true
    // while the unit is still clearly locked into a ranged engagement
    // with live ammo (e.g. an AI state desync where cooldown/attacking
    // timing drifts out of step with the stance), the tube would sit
    // frozen in its unfired/idle art forever even though ammo is
    // actually ticking down in the background. unit._rocketEngageSince
    // stamps the moment statusrange engagement began (edge-detected, so
    // it doesn't reset every frame); if ROCKET_FIRE_TIMEOUT_MS elapses
    // while still engaged-with-ammo and the primary trigger still
    // hasn't fired, force _rocketHasFired true anyway so the animation
    // catches up. Timeout picked at 2x FIRE_CYCLE_MS-to-be (300ms,
    // defined a few lines below as 150ms) — long enough that a normal
    // first shot's isAttacking pulse always wins first, short enough
    // that the fallback is barely noticeable if it ever does kick in.
    const ROCKET_FIRE_TIMEOUT_MS = 300;
    if (unit && unit.stats) {
        if (isAttacking && unit.stats.currentStance === "statusrange") {
            unit._rocketHasFired = true;
        }
        if (unit.stats.currentStance !== "statusrange") {
            unit._rocketHasFired = false;
            unit._rocketEngageSince = 0;
        } else {
            // Engaged in ranged stance — stamp the FIRST frame we see
            // this (edge-detect via the 0 sentinel) so the timeout
            // measures from engagement start, not from every frame.
            if (!unit._rocketEngageSince) unit._rocketEngageSince = Date.now();
            if (!unit._rocketHasFired && hasAmmo &&
                (Date.now() - unit._rocketEngageSince) >= ROCKET_FIRE_TIMEOUT_MS) {
                unit._rocketHasFired = true;
            }
        }
    }
    const hasFiredOnce = unit ? !!unit._rocketHasFired : isAttacking;
    const isLaunching = isRangedEngaged && hasAmmo && hasFiredOnce;
    let weaponBob = (typeof bob !== 'undefined') ? bob : 0;

    // ── DIRECTION LOCK ─────────────────────────────────────────────
    // Per spec: while the unit is actively firing (isLaunching true —
    // isAttacking with ammo remaining), the tube is LOCKED to a single
    // up or down pose, chosen once when firing starts and held for as
    // long as firing continues uninterrupted. The lock is state-based,
    // not time-based:
    //   - ENGAGE: the instant isLaunching flips from false to true
    //     (first shot of a fresh volley), pick up or down (never side
    //     — side view is never a valid outcome while locked) by
    //     checking the actual target's position relative to the unit,
    //     falling back to faction preference (player prefers up, enemy
    //     prefers down) if the target is roughly level or unavailable.
    //   - HOLD: the SAME direction is reused every frame isLaunching
    //     stays continuously true — no re-roll mid-burst, so the tube
    //     doesn't flicker between up/down shot to shot.
    //   - RELEASE: the instant isLaunching goes false — either a pause
    //     (isAttacking false: target lost, repositioning, cooldown gap
    //     between bursts) or genuinely out of ammo (hasAmmo false) —
    //     the lock clears immediately and the tube is free to fall
    //     back to a normal side view (or re-lock fresh on the next
    //     volley) rather than staying pinned to a stale direction.
    //
    // Stored on unit._rocketLocked (bool) and unit._rocketAimAngle
    // (radians, only meaningful while _rocketLocked is true).
    //
    // We must be defensive about `unit` being undefined (e.g. during
    // early frames or preview renders) — in that case fall back to a
    // simple facing read with no persistence.
    // ──────────────────────────────────────────────────────────────
    // SURGERY FIX: removed the old ROCKET_PLAYER_PREFERS_UP hardcoded
    // constant (same two bugs as the Repeater's lock above in this file:
    // side is a string compared to the number 1 — always false — AND a
    // fixed player=up/enemy=down default no longer holds with randomized
    // spawn corners). preferUp is now derived per-battle from this unit's
    // own spawn-geometry forward vector, computed inline at ENGAGE below.

    let rocketRenderAngle = 0; // precise continuous angle actually rendered (tubeBaseRot below) — replaces the old lockedFacingY/rocketIsDiagonal bucketing

    if (unit) {
        // DEBOUNCE — proactive consistency fix matching the Repeater's
        // lock (same reasoning: prevent a single-frame signal blip from
        // causing a rapid re-flicker between side and locked up/down).
        const ROCKET_LOCK_DEBOUNCE_MS = 300;
        if (typeof unit._rocketLockChangeAt !== 'number') unit._rocketLockChangeAt = 0;
        const sinceRocketChange = Date.now() - unit._rocketLockChangeAt;

        if (isLaunching && !unit._rocketLocked && sinceRocketChange >= ROCKET_LOCK_DEBOUNCE_MS) {
            // ENGAGE — fresh volley just started this frame. Direction
            // comes from the ENEMY SIDE's live centroid
            // (_computeCentroidLock), chosen ONCE here and held for the
            // whole volley until ammo runs out — unchanged, per direct
            // request ("the rocket just has the one volley"). NEW this
            // pass: stores the exact continuous angle (.angle, atan2-
            // based) rather than bucketing into a fixed 0°/45°/90°
            // choice — per direct follow-up request ("aim at the exact
            // angle...at the target its aiming"), so the one-time lock
            // is now precise instead of rounded to the nearest named
            // direction.
            const _rocketLock = _computeCentroidLock(unit, side);
            unit._rocketAimAngle = _rocketLock.angle;
            unit._rocketAimDirX = (_rocketLock.deltaX < 0) ? -1 : 1;
            unit._rocketLocked  = true;
            unit._rocketLockChangeAt = Date.now();
        } else if (!hasAmmo && unit._rocketLocked) {
            // RELEASE — per direct request: "cannot switch to any other
            // orientation until all ammunition is exhausted." Release is
            // now gated on hasAmmo specifically (ammo truly hit 0), not
            // the broader isLaunching flag (which could also drop from a
            // momentary target-loss or state hiccup mid-volley — exactly
            // the kind of transient blip that shouldn't be allowed to
            // break the lock early). No debounce needed on this path:
            // "ammo is exhausted" is a hard, unambiguous, one-way event,
            // not a noisy signal that needs settling time like the
            // isLaunching-based ENGAGE trigger above.
            unit._rocketLocked = false;
            unit._rocketLockChangeAt = Date.now();
        }

        rocketRenderAngle = unit._rocketLocked ? (unit._rocketAimAngle || 0) : 0;

        // SURGERY: force the mirror toward the enemy's side captured at
        // ENGAGE, for as long as the volley's lock holds, so the tube
        // (and the dagger it falls back to once ammo runs out — see
        // "current state" below) visibly points at the enemy.
        if (unit._rocketLocked && unit._rocketAimDirX) {
            unit.facingDir = unit._rocketAimDirX;
        }
    } else {
        // No unit object (preview / early frame) — read live facing,
        // same simple perpendicular fallback as before.
        rocketRenderAngle = facingDown ? (Math.PI / 2) : (facingUp ? -(Math.PI / 2) : 0);
    }

    // ROCKET-SPECIFIC ANGLE — per direct request: "upward and downward
    // angles should have the launcher perpendicular to the x axis,
    // temporarily while shooting the firework," later refined to "aim
    // at the exact angle...at the target" (continuous, not bucketed).
    // rocketRenderAngle above is only ever non-zero while
    // unit._rocketLocked is true, and that lock only ever engages
    // during isLaunching (see the ENGAGE/RELEASE block above) — so
    // this IS already exactly "temporarily while shooting"; once
    // firing stops the lock releases and tubeBaseRot falls back to 0
    // (side view) on its own. Still a single ctx.rotate(tubeBaseRot),
    // so this remains "merely a rotation of the weapon" with no
    // relayout involved — gun (same file, above) and this tube are the
    // two weapons simple enough for that; the body itself never
    // rotates, only this wrapped geometry does.
    const tubeBaseRot = rocketRenderAngle;

    // FIRE_CYCLE_MS — matched 1:1 to the Rocket's reload time in
    // troop_system.js's getReloadTime (9 ticks @ ~16.67ms/tick ≈
    // 150ms), per direct request that ammo burn through fast enough to
    // read as fireworks (20 rounds in 2-10 seconds — at 150ms/shot
    // that's a 3.0 second burst). Ignition/launch phase boundaries
    // below are scaled to still read as two distinct beats at this
    // much faster pace instead of blurring into one flash.
    const FIRE_CYCLE_MS = 150; // one ignite -> launch pulse, repeats every shot while isLaunching
    const fireSeed = (unit && unit.id ? unit.id : 0) * 137 % FIRE_CYCLE_MS; // desyncs multiple launchers
    const fireCycle = isLaunching ? (((Date.now() + fireSeed) % FIRE_CYCLE_MS) / FIRE_CYCLE_MS) : 0;
    // Recoil kick straight back along the tube's own axis at the instant of
    // launch — slightly stronger than a hand cannon's (this is a much
    // heavier weapon), still along the same rotated axis either way.
    const recoilKick = (isLaunching && fireCycle < 0.2) ? -4 * (1 - fireCycle / 0.2) : 0;

    // ═══════════════════════════════════════════════════════════════
    // "NEST OF BEES" REDESIGN — per explicit reference (a faceted,
    // banded hexagonal tube) and explicit sizing note ("roughly the
    // size of a child"). This isn't a rifle-scale barrel anymore: it's
    // a bulky, faceted CONTAINER bundling many rocket-arrows, fired as
    // one swarm — the historical "one nest of bees" (一窩蜂) launcher.
    // Scale reference: drawBody's own legs run 0->9 and torso 0->-10
    // with the head topping out around -15.5, so the adult figure this
    // weapon is held against is roughly 24-25px tall. TUBE_FAR_X here
    // puts the container's own length at ~19px near-to-far — read as
    // "roughly child-sized" next to that figure — and TUBE_HALF_W (4.5)
    // makes it nearly as wide as the torso itself (8px across), so it
    // reads as bulk you'd need both arms to cradle, not a barrel you'd
    // aim one-handed.
    //
    // The faceted look from the reference is approximated with a
    // two-tone fill (lighter top facet / darker lower facet, faking a
    // hex prism's lit and shaded faces) plus two cross-bands at even
    // intervals along the tube's length, matching the reference's
    // segmented hex-panel construction. The rear end is capped with a
    // small point (matching the reference's pointed hex cap); the front
    // stays open, since that's where the rockets actually launch from.
    //
    // "Nest of bees" also means MANY rockets bundled in the one
    // container, not a single loaded round — the old single triangular
    // rocket-nose is now a small CLUSTER of three, spread across the
    // muzzle's width, and ignition/launch/smoke all widen to match.
    //
    // Grip changed to match: instead of a rifle-style rear-hand + close
    // forward-hand, the two hands now sit further apart (near the rear
    // cap and just past the midpoint) — cradling a heavy container
    // rather than sighting down a barrel. Still uses the same single
    // ctx.rotate(tubeBaseRot) wrapper as before, so there is still no
    // angle-lock: this reads correctly rotated to any facing.
    // ═══════════════════════════════════════════════════════════════
    const TUBE_NEAR_X = 2;    // rear end, closest to the body
    const TUBE_FAR_X  = 21;   // muzzle end — ~19px container length, "roughly a child's size" against the ~24px figure
    const TUBE_HALF_W = 4.5;  // chunky container width — nearly as wide as the torso (8px)
    const TUBE_MID_Y  = -5;   // vertical center of the tube, chest height on the figure
    const CAP_X = TUBE_NEAR_X - 3; // rear pointed cap tip

    if (hasAmmo || showDroppedTube) {
        ctx.save();
        if (hasAmmo) {
            ctx.translate(recoilKick * dir, weaponBob);
            ctx.rotate(tubeBaseRot);
        } else {
            // GROUND DROP POSE — the RELEASE logic above (see DIRECTION
            // LOCK) already zeroes the up/down lock the SAME frame ammo
            // hits 0 (isLaunching depends on hasAmmo too), so tubeBaseRot
            // is already back to its natural side/0 orientation by the
            // time we get here — no locked angle to unwind first. Lands
            // it near the feet (drawBody's legs run 0->9, see the scale-
            // reference comment near the top of this weapon) with a
            // fixed haphazard tilt, then fades out over the final quarter
            // of the linger window for a clean exit instead of an abrupt
            // pop the instant the timer runs out.
            const dropFadeStart = ROCKET_DROP_LINGER_MS * 0.75;
            const dropAlpha = (msSinceDrop > dropFadeStart)
                ? Math.max(0, 1 - (msSinceDrop - dropFadeStart) / (ROCKET_DROP_LINGER_MS - dropFadeStart))
                : 1;
            ctx.globalAlpha = dropAlpha;
            ctx.translate(4 * dir, 9);
            ctx.rotate(0.35 * dir);
        }

    // Main container body — lighter top-facet fill + capped rear point
    ctx.fillStyle = "#6d4c3a";
    ctx.strokeStyle = "#2b1b14"; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(CAP_X * dir, TUBE_MID_Y);
    ctx.lineTo(TUBE_NEAR_X * dir, TUBE_MID_Y - TUBE_HALF_W);
    ctx.lineTo(TUBE_FAR_X * dir, TUBE_MID_Y - TUBE_HALF_W);
    ctx.lineTo(TUBE_FAR_X * dir, TUBE_MID_Y + TUBE_HALF_W);
    ctx.lineTo(TUBE_NEAR_X * dir, TUBE_MID_Y + TUBE_HALF_W);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Darker lower-half facet — fakes the hex prism's shaded side face
    ctx.fillStyle = "#4e342e";
    ctx.beginPath();
    ctx.moveTo(TUBE_NEAR_X * dir, TUBE_MID_Y);
    ctx.lineTo(TUBE_FAR_X * dir, TUBE_MID_Y);
    ctx.lineTo(TUBE_FAR_X * dir, TUBE_MID_Y + TUBE_HALF_W);
    ctx.lineTo(TUBE_NEAR_X * dir, TUBE_MID_Y + TUBE_HALF_W);
    ctx.closePath();
    ctx.fill();

    // Segment bands — two seams across the container's width, evenly
    // spaced along its length, matching the reference's banded hex
    // panels (the "nest" of bundled sections, not one smooth tube).
    ctx.strokeStyle = "#2b1b14"; ctx.lineWidth = 1;
    const bandSpan = TUBE_FAR_X - TUBE_NEAR_X;
    for (const bf of [0.35, 0.7]) {
        const bx = (TUBE_NEAR_X + bandSpan * bf) * dir;
        ctx.beginPath();
        ctx.moveTo(bx, TUBE_MID_Y - TUBE_HALF_W);
        ctx.lineTo(bx, TUBE_MID_Y + TUBE_HALF_W);
        ctx.stroke();
    }

    // Loaded rockets — a CLUSTER of three noses spread across the open
    // muzzle, selling "many rockets bundled in one container" rather
    // than a single loaded round.
    if (hasAmmo) {
        ctx.fillStyle = "#212121";
        for (const oy of [-TUBE_HALF_W * 0.55, 0, TUBE_HALF_W * 0.55]) {
            ctx.beginPath();
            ctx.moveTo(TUBE_FAR_X * dir, TUBE_MID_Y + oy - 1.1);
            ctx.lineTo((TUBE_FAR_X + 3) * dir, TUBE_MID_Y + oy);
            ctx.lineTo(TUBE_FAR_X * dir, TUBE_MID_Y + oy + 1.1);
            ctx.fill();
        }
    }

    // ONE hand visible — at the lower-rear portion of the tube (near
    // the capped/butt end, lower edge), matching the single-hand spec.
    // The two-hand "cradling" version was removed because it produced
    // three visible hands total once the section-4 weapon hand was also
    // counted. Section 4 no longer draws its own hand either (see below).
    // Gated to hasAmmo: a dropped tube lying on the ground isn't being
    // held by anyone, so no hand should render on it during the linger.
    if (hasAmmo) {
        ctx.fillStyle = "#ffccbc";
        ctx.beginPath();
        ctx.arc((TUBE_NEAR_X + 2) * dir, TUBE_MID_Y + TUBE_HALF_W * 0.7, 2.2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Ignition -> launch, anchored at the (now wider) muzzle. Still tied
    // to the tight per-shot fireCycle (now ~150ms) — at this speed the
    // rapid ignite/flash flicker READS as a firecracker string, which
    // is the desired effect now that shots fire this fast.
    if (isLaunching) {
        if (fireCycle < 0.35) {
            // IGNITION — spark catching before the launch
            let ip = fireCycle / 0.35;
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.beginPath(); ctx.arc(TUBE_FAR_X * dir, TUBE_MID_Y, 1 + ip * 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#ffeb3b";
            ctx.beginPath(); ctx.arc(TUBE_FAR_X * dir, TUBE_MID_Y, 1 + ip * 4, 0, Math.PI * 2); ctx.fill();
        } else {
            // LAUNCH — flame burst as the volley fires out
            ctx.fillStyle = "rgba(255, 160, 0, 0.85)";
            ctx.beginPath(); ctx.arc((TUBE_FAR_X + 2) * dir, TUBE_MID_Y, 5 + Math.random() * 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#ffeb3b";
            ctx.beginPath(); ctx.arc((TUBE_FAR_X + 4) * dir, TUBE_MID_Y, 2.5 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
        }
    }

    // SMOKE — REDESIGNED this session per direct request: "the smoke
    // should keep playing once in a while randomly just like a
    // fireworks launcher." The old smoke was a deterministic function
    // of fireCycle alone (always on for the back 75% of every cycle) —
    // that worked at the old 700ms cadence, but now that FIRE_CYCLE_MS
    // is ~150ms, tying smoke to fireCycle would make it flicker on/off
    // in lockstep with every single shot — far too fast to read as
    // drifting smoke, and not the "occasional random puff" look of a
    // real firework stand.
    //
    // Replaced with a persistent, randomly-reseeded puff SYSTEM stored
    // on the unit itself (unit._rocketSmokePuffs), independent of the
    // per-shot fireCycle:
    //   - A NEW puff spawns at a random moment while isLaunching, not
    //     every shot — unit._rocketNextSmokeAt holds the timestamp for
    //     the next spawn, itself re-randomized after each spawn
    //     (roughly every 80-220ms — "once in a while" relative to the
    //     150ms shot cadence, not locked to it 1:1).
    //   - Each puff independently ages, drifts outward, and fades over
    //     its own ~600-900ms lifetime — several puffs from DIFFERENT
    //     shots can be visible and overlapping at once, exactly like a
    //     real firework launcher's smoke trail rather than one puff
    //     resetting per shot.
    //   - Puffs are pruned once fully faded so the array doesn't grow
    //     unbounded across a multi-second burst.
    // Falls back to skipping smoke entirely when `unit` isn't available
    // (preview/no-unit render) so this never crashes there — ignition/
    // launch flash above still renders fine without it.
    if (unit) {
        if (!Array.isArray(unit._rocketSmokePuffs)) unit._rocketSmokePuffs = [];
        if (typeof unit._rocketNextSmokeAt !== 'number') unit._rocketNextSmokeAt = 0;

        const nowMsSmoke = Date.now();
        if (isLaunching && nowMsSmoke >= unit._rocketNextSmokeAt) {
            unit._rocketSmokePuffs.push({
                born: nowMsSmoke,
                life: 600 + Math.random() * 300,       // 600-900ms lifetime
                oy: (Math.random() * 2 - 1) * TUBE_HALF_W * 1.3, // random vertical offset off the muzzle
                size: 4 + Math.random() * 3,
            });
            // Next spawn "once in a while" — randomized, deliberately
            // NOT locked to FIRE_CYCLE_MS, so puffs don't sync 1:1 with
            // shots (some shots get a puff, some don't, some get an
            // extra one between shots — reads as organic/random).
            unit._rocketNextSmokeAt = nowMsSmoke + 80 + Math.random() * 140;
        }

        for (let i = unit._rocketSmokePuffs.length - 1; i >= 0; i--) {
            const puff = unit._rocketSmokePuffs[i];
            const age = nowMsSmoke - puff.born;
            if (age >= puff.life) {
                unit._rocketSmokePuffs.splice(i, 1);
                continue;
            }
            const sp = age / puff.life; // 0 (just spawned) -> 1 (fully faded)
            const drift = sp * 14;
            const fade = Math.max(0, 0.5 * (1 - sp));
            if (fade <= 0) continue;
            ctx.fillStyle = `rgba(150, 150, 150, ${fade.toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(TUBE_FAR_X * dir + dir * drift, TUBE_MID_Y + puff.oy, puff.size + sp * 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.restore();
    }

    // 4. Backup weapon — DAGGER (SWAPPED BACK from the small axe this
    // session, per direct request: "switch to a dagger". The axe had
    // itself replaced an earlier dagger per a prior explicit spec — this
    // reverses that, back to the double-taper stabbing blade (bare grip,
    // no cross guard). Grip length also reverts to match (a dagger's
    // grip reads shorter than the axe's longer haft).
    // ═══════════════════════════════════════════════════════════
    // Gated to !hasAmmo && !showDroppedTube: the dagger only appears
    // once the empty tube has fully finished its ground-drop/linger
    // (see GROUND DROP above) and disappeared — otherwise the unit
    // would read as dual-wielding a dropped tube AND a drawn dagger at
    // the same time. Same 3-phase wind-up/strike/recovery swing timing
    // as before (untouched — only the drawn weapon geometry changed,
    // not the attack motion).
    //
    // No separate hand circle after ctx.restore() — the single hand
    // already drawn on the tube body above is this unit's only visible
    // hand, fixing the three-hands-visible bug.
    // ═══════════════════════════════════════════════════════════
    if (!hasAmmo && !showDroppedTube) {
        let stabX = 0, stabY = 0;
        let daggerRot = (Math.PI / -5) * dir;

        if (isAttacking) {
            let swingCycle = (Date.now() / 450) % 1.0;
            if (swingCycle < 0.2) {                   // wind-up
                let p = swingCycle / 0.2;
                stabX = -4 * p;
                stabY = 1 * p;
                daggerRot = ((Math.PI / -5) - 0.3 * p) * dir;
            } else if (swingCycle < 0.5) {             // strike
                let p = (swingCycle - 0.2) / 0.3;
                let ease = p * (2 - p);
                stabX = -4 + ease * 12;
                stabY = 1 - ease * 2;
                daggerRot = ((Math.PI / -5) - 0.3 + ease * 0.6) * dir;
            } else {                                   // recovery
                let p = (swingCycle - 0.5) / 0.5;
                let rec = Math.pow(1 - p, 2);
                stabX = 8 * rec;
                stabY = -1 * rec;
                daggerRot = ((Math.PI / -5) + 0.3 * rec) * dir;
            }
        }

        const daggerPivotX = (-6 + stabX) * dir;
        const daggerPivotY = -2 + bob + stabY; // waist height, lower than spear

        ctx.save();
        ctx.translate(daggerPivotX, daggerPivotY);
        ctx.rotate(daggerRot);

        // Grip — short bare handle, shorter than the axe's haft
        ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(0, -3); ctx.stroke();

        // Blade — double taper, symmetric diamond profile coming to a
        // point, classic straight stabbing dagger silhouette.
        ctx.fillStyle = "#9e9e9e";
        ctx.strokeStyle = "#616161"; ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(0, -3);
        ctx.lineTo(1.6, -6.5);
        ctx.lineTo(0, -12);
        ctx.lineTo(-1.6, -6.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Center-line highlight along the blade
        ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(0, -3.5); ctx.lineTo(0, -11); ctx.stroke();

        ctx.restore();
    }

}

else if (type === "shortsword" || (typeof unit !== 'undefined' && unit.stats && unit.stats.isRanged && unit.stats.ammo <= 0 && type !== "javelinier")) {
    
    // --- 1. OVERRIDE SLOW RELOAD TIMING ---
    // Even if the unit is a Bomber (1200ms), the SWING should only take 600ms.
    let meleeSpeed = 130; 
    let currentCd = (typeof cooldown !== 'undefined') ? cooldown : 0;
    
    // We 'clamp' the cycle so the sword swing finishes quickly even if the reload is slow
    let cycle = 0;
    if (isAttacking) {
        // This math ensures the animation completes in the first 600ms of the cooldown
        cycle = Math.min(1, (meleeSpeed - (currentCd % meleeSpeed)) / meleeSpeed);
        // If the actual cooldown is much longer than meleeSpeed, stay in 'idle' after one swing
        if (currentCd > meleeSpeed) cycle = 0; 
    }
    
    let thrust = 0, swing = 0, handOffsetY = 0;
    let attackSeed = (unit && unit.id) ? (unit.id % 3) : (Math.floor(x + y) % 3);

    // --- 2. COMBAT REALISTIC ANIMATION ---
    if (isAttacking && cycle > 0 && cycle < 1) {
        if (cycle < 0.15) { // Snappier wind-up
            let p = cycle / 0.15;
            if (attackSeed === 0) { thrust = -5 * p; swing = -0.2 * p; } // Deep Stab Prep
            else if (attackSeed === 1) { thrust = -2 * p; swing = -Math.PI/1.8 * p; handOffsetY = -5 * p; } // High Overhead
            else { thrust = -2 * p; swing = Math.PI/1.2 * p; } // Backhand Flip
        } else if (cycle < 0.45) { // Explosive Strike
            let p = (cycle - 0.15) / 0.3;
            let ease = p * (2 - p); // Power easing
            if (attackSeed === 0) { thrust = -5 + (ease * 18); swing = -0.2 + (ease * 0.5); }
            else if (attackSeed === 1) { thrust = -2 + (ease * 8); swing = -Math.PI/1.8 + (ease * Math.PI * 0.9); handOffsetY = -5 + (ease * 10); }
            else { thrust = -2 + (ease * 12); swing = Math.PI/1.2 - (ease * Math.PI * 1.4); }
        } else { // Realistic Recovery (Slow down at the end)
            let p = (cycle - 0.45) / 0.55;
            let recoveryEase = Math.pow(1 - p, 2);
            thrust = (attackSeed === 0 ? 13 : 6) * recoveryEase;
            swing = (attackSeed === 1 ? 0.4 : 0) * recoveryEase;
            handOffsetY = (attackSeed === 1 ? 5 : 0) * recoveryEase;
        }
    }

    const bobSSF = (typeof bob !== 'undefined') ? bob : 0;

    // ═══════════════════════════════════════════════════════════
    // DOWNWARD FACING (facingDirY===1) — ported this session.
    // High-value branch: ANY ranged unit (archer/crossbow/bomber/etc)
    // falls into this exact code once its ammo hits 0, so this one
    // change covers many unit types at once.
    //
    // The blade shape (moveTo/lineTo block below) is drawn in a local
    // frame where the blade's own length runs along local -Y (from
    // (x,0) up to (x,-13)) — i.e. at rotation=0 the blade points
    // straight UP on screen. Side view rotates that by ~+45°
    // (Math.PI/4) or ~-112° (flipped grip) to angle it up-and-out to
    // one side. For facingDown we want it pointing straight DOWN
    // instead — a half turn (Math.PI) from the local "up" rest pose.
    // Unlike the peasant/two_handed +90° trick, a full 180° rotation
    // is dir-invariant on its own (cos/sin of +π and -π are identical),
    // so no *dir multiplication is needed on the base angle itself —
    // it points down the same way regardless of which side the unit
    // last faced horizontally. The attack-cycle `swing` value is
    // simply added on top, same role as the side view.
    //
    // The wrist/hand anchor (translate below, and the separate hand
    // circle drawn after ctx.restore() near the end of this branch)
    // also swaps which axis "thrust" lands on: side view lunges the
    // wrist sideways along dir; down view lunges it down-screen
    // instead, since "forward" for a camera-facing unit is downward.
    //
    // NOTE (shortsword fallback, facingDown only): the three attackSeed
    // swing styles (Deep Stab / High Overhead / Backhand Flip) sweep
    // `swing` through large angles for styles 1 and 2 — those sweeps
    // were tuned against the side view's base angle and layered on top
    // of the new Math.PI base unchanged. Whether "High Overhead" and
    // "Backhand Flip" still read well swinging toward the viewer instead
    // of sideways hasn't been visually confirmed — flag for re-tuning if
    // they look odd.
    // The "flipped grip" (attackSeed===2) distinction is also
    // collapsed to the same Math.PI base for facingDown, since a full
    // 180° base makes the earlier ±dir-based grip-style split moot;
    // revisit if the two styles need to stay visually distinct here too.
    // ═══════════════════════════════════════════════════════════
    ctx.save();
    let pivotX, pivotY, rotAngle;
    if (facingDown) {
        pivotX = (2 * dir) + (handOffsetY * 0.4 * dir);
        pivotY = -2 + (thrust * 0.8) + bobSSF;
        rotAngle = Math.PI + swing;
    } else {
        pivotX = (4 + thrust) * dir;
        pivotY = (-6 + handOffsetY) + bobSSF;
        // Base rotation depends on style (Style 2 is a "flipped" grip)
        let baseRotation = (attackSeed === 2) ? -Math.PI / 1.6 : Math.PI / 4;
        rotAngle = (baseRotation + swing) * dir;
    }
    ctx.translate(pivotX, pivotY);
    ctx.rotate(rotAngle);

    // --- 3. DRAW REALISTIC STRAIGHT DAO ---
    // (or, for Sanyanchong specifically, its own spent weapon — see
    // isSanyanchongFallback branch just below)

    // NEW — per direct follow-up request ("improve them"): Sanyanchong,
    // once its three barrels are spent, keeps and swings the SAME haft
    // it fired from (see infscript.js's "gun" branch, stickBackX) rather
    // than drawing a generic shortsword like every other ranged unit
    // falling into this branch does. Reuses ALL of the swing/thrust/
    // pivot/timing math above completely unchanged — the blade-drawing
    // block just below is the only thing that differs, gated on
    // unitName so nothing else in this shared fallback is touched.
    const isSanyanchongFallback = (typeof unitName !== 'undefined' && unitName === "Sanyanchong");

    if (isSanyanchongFallback) {
        // Shaft — noticeably longer and plain wood-colored, no blade
        // silhouette, since this is the same haft (see stickBackX in
        // the "gun" branch) now doubling as a two-handed club.
        ctx.strokeStyle = "#6d4c41"; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -15); ctx.stroke();
        // Spent barrel cluster bunched at the striking end — three
        // short dulled-bronze stubs, echoing the live triple-barrel
        // geometry without redrawing it in full.
        ctx.strokeStyle = "#5d4e46"; ctx.lineWidth = 1.6;
        [-1.6, 0, 1.6].forEach(ox => {
            ctx.beginPath(); ctx.moveTo(ox, -13); ctx.lineTo(ox, -18); ctx.stroke();
        });
        // Iron collar binding the cluster to the haft, matching the
        // live weapon's own collar.
        ctx.strokeStyle = "#616161"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-2.2, -12.5); ctx.lineTo(2.2, -12.5); ctx.stroke();
    } else {
    
    // Shadow/Blade Depth
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(0, 0, 1.5 * dir, -12);

    // Blade (Single Edge, Straight Back, Cheap Iron)
    ctx.fillStyle = (unit && unit.id % 5 === 0) ? "#8d8d8d" : "#a1a1a1"; // Variable wear
    ctx.beginPath();
    ctx.moveTo(-1.3, 0);       
    ctx.lineTo(-1.3, -13);     // Straight back
    ctx.lineTo(1.5, -10);      // Clipped tip
    ctx.lineTo(1.5, 0);        // Cutting edge
    ctx.closePath();
    ctx.fill();
    
    // The "Cheap" Edge Detail
    ctx.strokeStyle = "#cfd8dc"; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(1.5, 0); ctx.lineTo(1.5, -10); ctx.stroke();

    // Guard (Small, thick iron disc)
    ctx.strokeStyle = "#263238"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-2.5, 0); ctx.lineTo(2.5, 0); ctx.stroke();
    }

    // Grip
    ctx.strokeStyle = "#4e342e"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 5); ctx.stroke();

    // Ring Pommel
    ctx.strokeStyle = "#263238"; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 7, 2, 0, Math.PI * 2); 
    ctx.stroke();

    ctx.restore();

    // 4. Draw Hand (Properly layered)
    // Anchor must match the translate() used above for the blade,
    // recomputed here since ctx.restore() already popped that transform.
    ctx.fillStyle = "#ffccbc";
    ctx.beginPath();
    if (facingDown) {
        ctx.arc((2 * dir) + (handOffsetY * 0.4 * dir), -2 + (thrust * 0.8) + bobSSF, 2.8, 0, Math.PI * 2);
    } else {
        ctx.arc((4 + thrust) * dir, (-6 + handOffsetY) + bobSSF, 2.8, 0, Math.PI * 2);
    }
    ctx.fill();
}

// Backshot z-order: for facing-up, low-armor-tier units, the body was
// deliberately NOT drawn earlier (see useBackView above) — draw it now,
// on top of everything the weapon-dispatch chain above just drew, so
// the weapon reads as held behind/away from the viewer. Every other
// unit already drew its body before the dispatch chain and does
// nothing here (drawBody() only runs once per call, either here or
// earlier, never both).
if (useBackView) {
    drawBody();
}

ctx.restore(); // 2. CRITICAL: Restores the GLOBAL unit position save from the top of the function
} // End of drawInfantryUnit function