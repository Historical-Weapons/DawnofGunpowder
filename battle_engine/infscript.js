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
    //     placed"): wheels spread side-by-side instead of the side
    //     view's front/back framing, launch box repositioned below the
    //     operator (toward the viewer), rockets pointing down. All key
    //     offsets pulled into named constants (CART_DOWN_Y etc.) so a
    //     future pass can tune the layout without re-deriving the
    //     geometry. cavscript.js's camel-cannon got the same re-layout
    //     treatment — good side-by-side reference if this needs
    //     revisiting.
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
    const DOWN_AIM_OFFSET = 15;             // shared px offset (was 30 for bow / 10 for head)
    const DOWN_AIM_ROT    = 0.4 * (Math.PI / 2); // shared cant angle (was 45° for bow, 0° for head)

    // Archer-only head dip: shifts head+headgear down AND rotates them
    // around the SAME pivot the bow/arrow/hand use below, so the whole
    // assembly (head included) moves as one rigid unit and can't drift
    // apart again. Deliberately narrow (type==="archer" only) so it
    // can't affect any other unit's rendering. Wraps section 4+5 below
    // (Head Base + all headgear variants) in one translate+rotate —
    // every headgear branch keeps its existing relative coordinates and
    // needs no individual changes, since they all move together.
    const headBowOffset = (type === "archer" && facingDown) ? DOWN_AIM_OFFSET : 0;
    const headBowRot    = (type === "archer" && facingDown) ? DOWN_AIM_ROT : 0;

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
    const facingUp = (unit && unit.facingDirY === -1);
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

        const shaftStartX = facingDown ? (V_START_X * dir) : (-7 * dir);
        const shaftStartY = facingDown ? V_START_Y          : 4;

        // Base coordinates before rotation
        // side view : baseEndX carries the dir-reach + thrust; baseEndY carries the lift wobble.
        // down view : baseEndY carries the down-screen reach + thrust; baseEndX carries the lift wobble.
        const baseEndX = facingDown
            ? (lift * dir)
            : ((28 + wBobSpear + thrust) * dir);
        const baseEndY = facingDown
            ? (V_REACH + wBobSpear + thrust)
            : (-24 + wBobSpear + lift);

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
	// again. DOWN_AIM_ANGLE/DOWN_Y_OFFSET below are kept as local
	// aliases (not duplicated numbers) specifically so this branch's
	// own math below doesn't need to be hand-edited in more than one
	// place if the shared constants change again.
	const DOWN_AIM_ANGLE = DOWN_AIM_ROT;   // alias — shared with head (see top-of-function)
	const DOWN_Y_OFFSET = DOWN_AIM_OFFSET; // alias — shared with head (see top-of-function)
	const pivotY = facingDown ? (handY + DOWN_Y_OFFSET) : handY;

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
	ctx.rotate(bowKhatra + (facingDown ? DOWN_AIM_ANGLE : 0)); 
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
		const arrowPt = facingDown ? rotateAroundPivot(drawHandX, drawHandY, DOWN_AIM_ANGLE) : { x: drawHandX, y: drawHandY };
		ctx.save();
		ctx.translate(arrowPt.x, arrowPt.y);
		ctx.rotate(arrowAngle + (facingDown ? DOWN_AIM_ANGLE : 0));
		
		ctx.fillStyle = "#8d6e63"; ctx.fillRect(0, -0.5, 14, 1); // Shaft
		ctx.fillStyle = "#9e9e9e"; ctx.beginPath(); ctx.moveTo(14, -1); ctx.lineTo(18, 0); ctx.lineTo(14, 1); ctx.fill(); // Head
		ctx.fillStyle = "#d32f2f"; ctx.fillRect(0, -1.5, 3, 1); ctx.fillRect(0, 0.5, 3, 1); // Feathers
		ctx.restore();
	}

	// --- DRAWING HAND ---
	const handPt = facingDown ? rotateAroundPivot(drawHandX, drawHandY, DOWN_AIM_ANGLE) : { x: drawHandX, y: drawHandY };
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
        let currentAmmo = (typeof unit !== 'undefined' && unit.ammo !== undefined) ? unit.ammo : 4;
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
        // DOWNWARD FACING (facingDirY===1) — ported this session, per
        // explicit user request: the thrown/held javelin should aim
        // perpendicular to the X axis (i.e. purely vertical) when
        // facing down, rather than at the small side-view throw angles
        // javRotation normally cycles through (wind-up/snap/follow-
        // through, roughly ±30-90°).
        //
        // This is cheap because the shaft's LOCAL rest orientation is
        // already vertical before any rotation is applied — moveTo(0,10)
        // to lineTo(0,-12), head at the negative end — javRotation just
        // tilts that vertical shaft to the various side-view throw
        // angles. For facingDown, replacing javRotation with a fixed
        // Math.PI (regardless of throw phase) keeps the shaft on that
        // same local Y-axis but flips it from pointing up-screen (the
        // rotation=0 default) to down-screen (perpendicular to X,
        // toward the viewer) — same "local rest is already the right
        // axis, just needs a half-turn" situation as the shortsword-
        // style blades elsewhere in this file.
        //
        // The reach itself (thrustX in the original side-view code —
        // the arm pulling back then snapping forward, shared by both
        // the isMelee stab and the throwing wind-up/snap above) is
        // redirected from the X translate component to the Y translate
        // component, since "forward" is now down-screen instead of
        // sideways — same axis-swap idea as spearman's thrust. This
        // applies uniformly to both isMelee and throwing, since they
        // share this exact render block; a down-facing melee stab
        // reads correctly with the same fix.
        // ═══════════════════════════════════════════════════════════
        const javDownRotation = Math.PI;
        const activeJavX = facingDown ? handX : (handX + (thrustX * dir));
        const activeJavY = facingDown ? (handY + thrustX) : (handY + thrustY);
        const activeJavRotation = facingDown ? javDownRotation : javRotation;

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
            // DOWNWARD FACING (facingDirY===1) — ported this session,
            // per explicit user clarification: reloading (the box-mag
            // drop-in above, AND the lever push/pull cycling that
            // chambers each bolt) can ONLY ever be shown side-on — it
            // never redirects, regardless of facing. Only "shooting"
            // (holding the weapon aimed/idle, and the brief snap/recoil
            // right as a bolt releases) redirects down.
            //
            // isRepeaterReloading below is true for exactly the two
            // states that must stay side-view: box-mag reload
            // (loadingMag), and the push+pull chambering portion of the
            // burst (isRepeaterBurst && p<0.95) — deliberately NOT true
            // for idle (handOnLever alone doesn't distinguish idle from
            // actively cycling, which is why this exists instead of
            // reusing handOnLever) or for the final p>=0.95 snap/recoil,
            // both of which count as "shooting" and are allowed to
            // redirect.
            //
            // The fix is ONE new rotation added right after the
            // existing translate, before the "100% UNTOUCHED" rendering
            // begins — nothing inside that block (body/bow, magazine,
            // lever, bolt, hand) is touched at all, only wrapped.
            // ═══════════════════════════════════════════════════════
            let isRepeaterReloading = loadingMag || (isRepeaterBurst && p < 0.95);
            const repeaterDownRot = (facingDown && !isRepeaterReloading) ? DOWN_QUADRANT_ANGLE : 0;

            // --- RENDERING --- (100% UNTOUCHED below this point, aside
            // from the one added ctx.rotate(repeaterDownRot) line)
			
    ctx.save();
    ctx.translate(wobbleX, 8 + wobbleY);
    ctx.rotate(repeaterDownRot);

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
        const crossbowDownRot = (facingDown && isAimedState) ? DOWN_QUADRANT_ANGLE : 0;

        ctx.save();
        // APPLY SHIFT: The man now "steps up" into the stirrup
        ctx.translate(0, bodyDip + b + bodyShift); 
        
        ctx.save();
      ctx.translate(weaponX, weaponY - 10); ctx.rotate(weaponRot + crossbowDownRot); ctx.translate(0, 10);
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
    ctx.save();
    ctx.rotate(facingDown ? DOWN_QUADRANT_ANGLE : 0);

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
        let maxCd = 300;
        let cd = cooldown || 0;
        let cycle = isAttacking ? (maxCd - cd) / maxCd : 1.0;

        let gunRot = 0;
        let shakeRot = 0;
        let recoilX = 0;

        // Determine Gun Angle & Shake based on specific reload phase
        if (isAttacking && cd > 0) {
            if (cycle < 0.05) {
                // 0% - 5%: FIRING! (Heavy recoil, shaking only happens here)
                gunRot = (-Math.PI / 10) * dir;
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
        // DOWNWARD FACING (facingDirY===1) — ported this session.
        // This is the SIMPLE case, same single-rotation-wrapper pattern
        // as two_handed/peasant/the cavalry lance: the tiller, barrel,
        // every reload-phase hand position, AND the muzzle flash/smoke
        // are ALL drawn inside this one ctx.rotate(gunRot+shakeRot)
        // wrapper (confirmed by reading to its ctx.restore() — nothing
        // in this branch is drawn outside it, unlike archer/horse_archer
        // which needed a second manual-rotation technique for their
        // arrow+hand). So a single +90° base offset redirects the whole
        // reload animation — barrel angle, every reach-for-powder/ball/
        // wadding/ramrod/fuse hand position, and the muzzle flash — at
        // once. recoilX (the firing-phase kickback) is left as a
        // dir-based X offset unchanged; like the melee weapons' small
        // handedness offsets, the global ctx.scale(facingDir) still
        // mirrors it sensibly and it reads as a minor, plausible wobble
        // either way rather than needing its own axis swap.
        // ═══════════════════════════════════════════════════════════
        const gunBaseRot = facingDown ? DOWN_QUADRANT_ANGLE : 0;

        ctx.save();
        ctx.translate(recoilX, weaponBob); // Removed random bobbing; keeping it smooth
        ctx.rotate(gunRot + shakeRot + gunBaseRot);

        // Tiller (Wooden Stock) - NO TRIGGER
        ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(6 * dir, -5); ctx.stroke();
        
        // Barrel (Iron)
        ctx.strokeStyle = "#424242"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(6 * dir, -5); ctx.lineTo(16 * dir, -5); ctx.stroke();

        // Hands & Elaborate Reloading Action
        ctx.fillStyle = "#ffccbc";
        ctx.beginPath(); ctx.arc(2 * dir, -5, 2, 0, Math.PI*2); ctx.fill(); // Back hand holding tiller
        
        if (isAttacking && cd > 0) {
            if (cycle >= 0.15 && cycle < 0.25) { 
                // 1. Pouring Powder
                let drop = (cycle - 0.15) * 10; // Animation progress (0 to 1)
                ctx.beginPath(); ctx.arc(18 * dir, -12, 2, 0, Math.PI*2); ctx.fill(); // Hand
                ctx.fillStyle = "#795548"; ctx.fillRect(16 * dir, -16, 4 * dir, 6); // Flask
                ctx.fillStyle = "#212121"; ctx.fillRect(17.5 * dir, -10 + (drop * 4), 1.5 * dir, 2); // Powder falling
            } 
            else if (cycle >= 0.25 && cycle < 0.32) { 
                // 2. Inserting Projectile
                let drop = (cycle - 0.25) * 14; 
                ctx.beginPath(); ctx.arc(18 * dir, -10, 2, 0, Math.PI*2); ctx.fill(); // Hand
                ctx.fillStyle = "#424242"; ctx.beginPath(); ctx.arc(18 * dir, -8 + (drop * 3), 1.5, 0, Math.PI*2); ctx.fill(); // Iron ball
            } 
            else if (cycle >= 0.32 && cycle < 0.40) { 
                // 3. Inserting Wadding
                let drop = (cycle - 0.32) * 12; 
                ctx.beginPath(); ctx.arc(18 * dir, -10, 2, 0, Math.PI*2); ctx.fill(); // Hand
                ctx.fillStyle = "#d7ccc8"; ctx.beginPath(); ctx.arc(18 * dir, -8 + (drop * 3), 1.5, 0, Math.PI*2); ctx.fill(); // Wadding
            } 
            else if (cycle >= 0.40 && cycle < 0.65) { 
                // 4. Ramming down the barrel
                let ramMove = Math.sin((cycle - 0.40) * Math.PI * 12) * 5; // Up and down motions
                ctx.beginPath(); ctx.arc((18 + ramMove) * dir, -5, 2, 0, Math.PI*2); ctx.fill(); // Hand
                ctx.strokeStyle = "#8d6e63"; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo((18 + ramMove) * dir, -5); ctx.lineTo((8 + ramMove) * dir, -5); ctx.stroke(); // Ramrod
            } 
            else if (cycle >= 0.65 && cycle < 0.75) { 
                // 5. Priming the touchhole
                ctx.beginPath(); ctx.arc(6 * dir, -8, 2, 0, Math.PI*2); ctx.fill(); // Hand at breech
                ctx.fillStyle = "#212121"; ctx.fillRect(5.5 * dir, -6, 1.5 * dir, 1.5); // Pinch of powder
            } 
            else if (cycle >= 0.90 && cycle < 1.0) { 
                // 6. Lighting the fuse
                ctx.beginPath(); ctx.arc(6 * dir, -8, 2, 0, Math.PI*2); ctx.fill(); // Hand bringing fuse down
                ctx.strokeStyle = "#e65100"; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(6 * dir, -8); ctx.lineTo(7 * dir, -5.5); ctx.stroke(); // Slow match
                ctx.fillStyle = "#ffeb3b"; ctx.beginPath(); ctx.arc(7 * dir, -5.5, 1.5 + Math.random(), 0, Math.PI*2); ctx.fill(); // Sparks!
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
        if (isAttacking && cycle < 0.05) { 
            ctx.fillStyle = "#ffeb3b"; // Core flash
            ctx.beginPath(); ctx.arc(18 * dir, -5, 3 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
            
            ctx.fillStyle = "#ff5722"; // Secondary flame
            ctx.beginPath(); ctx.arc(22 * dir, -5, 6 + Math.random() * 4, 0, Math.PI * 2); ctx.fill();
            
            ctx.fillStyle = "rgba(140, 140, 140, 0.6)"; // Smoke expanding
            ctx.beginPath(); ctx.arc(26 * dir, -5, 8 + Math.random() * 5, 0, Math.PI * 2); ctx.fill();
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
    let currentAmmo = 0;
    if (typeof unit !== 'undefined' && unit.ammo !== undefined) {
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
    // 1. Logic Setup
    // Use 'unitAmmo' from the function arguments, not 'unit.ammo'
    const currentAmmo = (typeof unitAmmo !== 'undefined') ? unitAmmo : 0;
    const hasAmmo = currentAmmo > 0;
    const thrust = (isAttacking && hasAmmo) ? (Math.random() * 2) : 0; 
    let wheelSpin = moving ? (Date.now() / 100) : 0;

    // ═══════════════════════════════════════════════════════════════
    // DOWNWARD FACING (facingDirY===1) — ported this session, per
    // explicit user request (a genuine re-layout, not just a rotation
    // of the side-view art — the user specifically asked for the
    // wheels and handle to be "appropriately placed").
    //
    // This is a PUSHED HANDCART operated by a walking person, not a
    // mount-integrated vehicle — structurally much simpler than the
    // camel-cannon's wheeled gun carriage (still deferred, see that
    // branch's notes: welded to a mount, raises real "does a wheel
    // read facing the viewer" design questions this handcart mostly
    // avoids by being small and simple).
    //
    // DESIGN, for a future session to tune (all key offsets pulled
    // into named constants right below, specifically so they're easy
    // to nudge without re-deriving the geometry):
    //   - The operator pushes the cart AHEAD of them in their direction
    //     of travel. Facing down = moving toward the viewer, so the
    //     cart body sits BELOW the operator (larger Y = closer to
    //     camera), with the handle (closest to the operator's hands)
    //     at the smallest Y offset and the launch box/wheels furthest.
    //   - The two wheels, side-by-side in the side view only by
    //     accident (the original code's `sideOffset` loop variable is
    //     never actually used in the translate — both wheels are drawn
    //     stacked on the same spot; a pre-existing quirk, left
    //     unchanged there since it's out of scope for this fix), are
    //     properly spread LEFT and RIGHT here instead, since a cart
    //     viewed from behind/above as it's pushed away from the
    //     operator would show both wheels flanking the frame.
    //   - The launch box sits centered, further down-screen than the
    //     wheels (the box is at the FRONT of the cart, furthest from
    //     the operator in the side view's `-12*dir` framing).
    //   - Rockets point straight down (toward the viewer/target)
    //     instead of sideways.
    // ═══════════════════════════════════════════════════════════════
    const CART_DOWN_Y = 22;        // how far below the operator the whole cart sits
    const CART_WHEEL_SPAN = 8;     // left/right spread of the two wheels
    const CART_WHEEL_Y = 6;        // wheels sit slightly behind (above-screen from) the box
    const CART_BOX_Y = -6;         // launch box's near edge, relative to the cart origin
    const CART_BOX_H = 14;         // launch box height (matches side-view's box height)
    const CART_BOX_W = 14;         // launch box width

    if (facingDown) {
        ctx.save();
        ctx.translate(0, CART_DOWN_Y);

        // Wheels — side by side instead of the side-view's front/back framing
        ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 2;
        for (let wheelX of [-CART_WHEEL_SPAN, CART_WHEEL_SPAN]) {
            ctx.save();
            ctx.translate(wheelX, CART_WHEEL_Y);
            ctx.rotate(wheelSpin); // spin still reads fine without dir mirroring, wheel is centered now
            ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke();
            ctx.restore();
        }

        // Frame — short struts connecting each wheel up to the box,
        // replacing the side view's long horizontal frame (which
        // represented the cart's LENGTH, now foreshortened to near-
        // nothing since we're looking at the cart roughly end-on).
        ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-CART_WHEEL_SPAN, CART_WHEEL_Y); ctx.lineTo(-CART_WHEEL_SPAN, CART_BOX_Y + CART_BOX_H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(CART_WHEEL_SPAN, CART_WHEEL_Y); ctx.lineTo(CART_WHEEL_SPAN, CART_BOX_Y + CART_BOX_H); ctx.stroke();

        // Launch Box — centered, spanning between the wheels
        ctx.fillStyle = "#4e342e";
        ctx.fillRect(-CART_BOX_W / 2, CART_BOX_Y - CART_BOX_H, CART_BOX_W, CART_BOX_H);
        ctx.strokeStyle = "#212121"; ctx.lineWidth = 1;
        ctx.strokeRect(-CART_BOX_W / 2, CART_BOX_Y - CART_BOX_H, CART_BOX_W, CART_BOX_H);

        // Rockets — tips pointing down-screen (toward the viewer/target)
        // instead of sideways, arranged in the same rows/cols grid.
        if (hasAmmo) {
            ctx.fillStyle = "#212121";
            let rows = 6, cols = 5, spacing = 2, count = 0;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (count < currentAmmo) {
                        let ax = -CART_BOX_W / 2 + 2 + (r * spacing);
                        let ay = CART_BOX_Y - 2 + thrust;
                        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + 1, ay + 4); ctx.lineTo(ax + 2, ay); ctx.fill();
                    }
                    count++;
                }
            }
            if (isAttacking) {
                ctx.fillStyle = "rgba(255, 160, 0, 0.8)";
                ctx.beginPath(); ctx.arc(0, CART_BOX_Y + 2, 4 + Math.random() * 4, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = "rgba(150, 150, 150, 0.5)";
                ctx.beginPath(); ctx.arc(0, CART_BOX_Y, 6 + Math.random() * 6, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.restore();

        // Handle — reaches down toward the near end of the cart (the
        // push-bar closest to the operator), instead of the side
        // view's sideways-reaching hand.
        ctx.fillStyle = "#ffccbc";
        ctx.beginPath();
        ctx.arc(0, 10 + bob, 2.5, 0, Math.PI * 2);
        ctx.fill();

    } else {
    // 2. Draw the Cart (ISOLATED TRANSLATION)
    ctx.save(); 
    ctx.translate(15 * dir, 2 + bob); // Move to cart position

    // Wheels
    ctx.strokeStyle = "#3e2723"; ctx.lineWidth = 2;
    for (let sideOffset of [-8, 8]) {
        ctx.save();
        ctx.translate(0, 6);
        ctx.rotate(wheelSpin * dir);
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke();
        ctx.restore();
    }

    // Main Frame
    ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-12 * dir, 2); ctx.lineTo(8 * dir, 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-12 * dir, 2); ctx.lineTo(-18 * dir, -4); ctx.stroke();

    // The Launch Box
    ctx.fillStyle = "#4e342e";
    ctx.fillRect(-6 * dir, -12, 12 * dir, 14);
    ctx.strokeStyle = "#212121"; ctx.lineWidth = 1;
    ctx.strokeRect(-6 * dir, -12, 12 * dir, 14);

    // Rocket Tips & Firing Effects
    if (hasAmmo) {
        ctx.fillStyle = "#212121";
        let rows = 6, cols = 5, spacing = 2, count = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (count < currentAmmo) {
                    let ax = (6 * dir) + (thrust * dir);
                    let ay = -10 + (r * spacing);
                    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + (4 * dir), ay + 1); ctx.lineTo(ax, ay + 2); ctx.fill();
                }
                count++;
            }
        }
        if (isAttacking) {
            ctx.fillStyle = "rgba(255, 160, 0, 0.8)";
            ctx.beginPath(); ctx.arc(10 * dir, -6, 4 + Math.random() * 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "rgba(150, 150, 150, 0.5)";
            ctx.beginPath(); ctx.arc(8 * dir, -4, 6 + Math.random() * 6, 0, Math.PI * 2); ctx.fill();
        }
    }
    ctx.restore(); // <--- CRITICAL: Returns coordinates back to the Man's center

    // 3. Draw the Operator (The Man)
  //  ctx.fillStyle = factionColor; 
//ctx.fillRect(-3, -10 + bob, 6, 10); // Body

    // Forward Hand (Holding cart handle)
    ctx.fillStyle = "#ffccbc";
    ctx.beginPath(); 
    ctx.arc(4 * dir, -2 + bob, 2.5, 0, Math.PI * 2); 
    ctx.fill();
    }

    // 4. Draw the Spear (Opposite Hand / Back Hand)
    // ═══════════════════════════════════════════════════════════
    // DOWNWARD FACING — same shared-blade-convention fix as the
    // shortsword-style weapons elsewhere in this file: this spear's
    // shaft is drawn locally along Y (moveTo(0,8) to lineTo(0,-28),
    // head at the negative end), so at rest (spearRot small) it
    // already points mostly up-screen — Math.PI flips that to
    // down-screen. The stab reach (stabX in the side view) swaps from
    // the X translate component to the Y translate component, since
    // "forward" is now down-screen instead of sideways — same axis-
    // swap idea used throughout this session.
    // ═══════════════════════════════════════════════════════════
    let stabX = 0, stabY = 0;
    let spearRot = (Math.PI / -6) * dir;

    if (!hasAmmo && isAttacking) {
        let stabCycle = (Date.now() / 200) % 1.0; 
        stabX = Math.sin(stabCycle * Math.PI) * 12;
        stabY = Math.sin(stabCycle * Math.PI) * 2;
        spearRot = (Math.PI / 12) * dir;
    }

    const spearPivotX = facingDown ? 0 : ((-8 + stabX) * dir);
    const spearPivotY = facingDown ? (-8 + bob + stabX) : (-8 + bob + stabY);
    const spearFinalRot = facingDown ? Math.PI : spearRot;

    ctx.save(); 
    ctx.translate(spearPivotX, spearPivotY);
    ctx.rotate(spearFinalRot);
    
    // Spear Shaft & Head
    ctx.strokeStyle = "#4e342e"; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, -28); ctx.stroke();
    ctx.fillStyle = "#bdbdbd";
    ctx.beginPath(); ctx.moveTo(-1.5, -28); ctx.lineTo(0, -36); ctx.lineTo(1.5, -28); ctx.fill();
    ctx.restore(); // <--- CRITICAL: Returns coordinates back to the Man's center

    // 5. Spear Hand (Drawn last so it's on top)
    ctx.fillStyle = "#ffccbc";
    ctx.beginPath();
    ctx.arc(spearPivotX, spearPivotY, 2.5, 0, Math.PI * 2);
    ctx.fill();

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