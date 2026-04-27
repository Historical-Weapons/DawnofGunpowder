// ============================================================================
// DROWNING VISUALS  —  drowning_visuals.js
// ============================================================================
// Drop-in companion for naval_battles.js / infscript.js / cavscript.js.
//
// HOOKS (2 function wraps + 1 draw call):
//   • Wraps  window.drawInfantryUnit  — infantry drowning stages
//   • Wraps  window.drawCavalryUnit   — cavalry / elephant / camel sinking
//   • Exports window.drawDrowningEffects(ctx) — call once per frame,
//       inside your camera-transformed context, to draw splash particles
//       and blood pools.
//
// STAGES:
//   Infantry:
//     [0] overboardTimer  1-119  → splash burst + body sinking progressively
//     [1] isSwimming=true        → head only visible, animated waterline
//     [2] drownTimer > threshold → silent disappear + spreading blood pool
//
//   Cavalry / Elephant / Camel:
//     [0] overboardTimer  1-119  → splash burst + bottom 0→30% clips away
//     [1] isSwimming=true        → permanent 30% clip from bottom
//     [2] drownTimer > threshold → silent disappear + spreading blood pool
// ============================================================================

;(function () {
    'use strict';

    // ─── SPRITE GEOMETRY CONSTANTS ────────────────────────────────────────────
    // All values are in LOCAL unit-space (after translate to x,y).

    // Infantry (infscript.js):  head at (0, -12) r=3.5,  feet at (0, +9)
    //   Show-head clip: world rect from (y - 20) to (y - 6)  →  just the head
    const INF_HEAD_LOCAL_TOP  = -20;   // a little above the head
    const INF_HEAD_LOCAL_BOT  = -6;    // just below the chin / neck
    const INF_FEET_LOCAL      =  9;    // ankle tips

    // Cavalry (cavscript.js):   rider crown ≈ (0, -52),  hooves ≈ (0, +22)
    // Elephant:                 rider crown ≈ (0, -95),  feet   ≈ (0, +28)
    // Camel:                    rider crown ≈ (0, -58),  feet   ≈ (0, +22)
    const CAV_SPRITE_TOP      = -100;  // safe upper bound for all cavalry types
    const CAV_SPRITE_BOT_HORSE= +22;
    const CAV_SPRITE_BOT_ELEPH= +30;
    const CAV_SPRITE_BOT_CAMEL= +24;
    const CAV_SUBMERGE_FRAC   = 0.30;  // 30 % of the sprite disappears

    // ─── SHARED STATE ────────────────────────────────────────────────────────
    const _splashMap  = new Map();  // unitId → [{x,y,vx,vy,life,maxLife}]
    const _bloodPools = [];         // [{x,y,born,phase}]
	window.spawnFishBlood = function (x, y) {
    _bloodPools.push({
        x,
        y,
        born: Date.now(),
        phase: 'spread'
    });
};
    const _unitState  = new Map();  // unitId → {wasInWater, wasSwimming, drowned}

    // ─── UNIT ID ─────────────────────────────────────────────────────────────
    let _uidCounter = 0;
    function _getId(unit) {
        if (unit._drowningId === undefined) unit._drowningId = ++_uidCounter;
        return unit._drowningId;
    }

function _spawnSplash(wx, wy, id, scale) {
    scale = (scale || 0.4) * 0.6;

    const ps = [];
    const COUNT = Math.floor(5 + scale * 5);
    const spdMult = 0.20 + scale * 0.30;

    for (let i = 0; i < COUNT; i++) {
        const a   = (-Math.PI * 0.90) + Math.random() * (Math.PI * 0.80);
        const spd = (0.5 + Math.random() * 1.0) * spdMult;

        ps.push({
            baseX: wx,
            baseY: wy,
            ox    : (Math.random() - 0.5) * (6 * scale),
            oy    : 0,
            vx    : Math.cos(a) * spd * 0.6,
            vy    : Math.sin(a) * spd - 0.35,
            life  : 0,
            maxLife: 10 + Math.random() * 12,
            big   : Math.random() > 0.82,
            scale : scale
        });
    }

    _splashMap.set(id, ps);
}

// ─── DEATH EFFECT: 90% bubbles-only, 10% shark blood ────────────────────
    const _bubblePools = [];    // [{x, y, born, bubbles:[{ox,oy,r,speed,phase}]}]
	
	// --- SURGERY: Adjust Bubble Count and Size ---
function _spawnDeathEffect(wx, wy) {
    const bubbles = [];
    // Only 1 to 3 bubbles per unit
    const COUNT = 1 + Math.floor(Math.random() * 3); 

    for (let i = 0; i < COUNT; i++) {
        bubbles.push({
            ox: (Math.random() - 0.5) * 4,
            oy: (Math.random() - 0.5) * 2,
            r: 0.01 + Math.random() * 0.05, // 1/4 scale (was 1.5-3.5)
            speed: 0.01 + Math.random() * 0.05, // Reduced speed to prevent "beam" effect
            wobble: Math.random() * Math.PI * 2
        });
    }

    _bubblePools.push({ x: wx, y: wy, born: Date.now(), bubbles });
}

function _track(unit, wx, wy, splashScale) {
        const id  = _getId(unit);
        let   st  = _unitState.get(id);
        if (!st) {
            st = { wasInWater: false, wasSwimming: false, drowned: false };
            _unitState.set(id, st);
        }

        const inWater    = !!(unit.overboardTimer && unit.overboardTimer > 0);
        const isSwimming = !!unit.isSwimming;
        const dead       = unit.hp <= 0;

        // First frame in water → fire splash, sized to this unit's mass
        if (inWater && !st.wasInWater) {
            _spawnSplash(wx, wy, id, splashScale || 0.4);
  // ---> ADD THIS LINE <---
            if (typeof BattleAudio !== 'undefined') BattleAudio.playWaterSplash(wx, wy, true);
        }

// Drowned this frame (hp just became 0 while swimming)
        if (dead && st.wasSwimming && !st.drowned) {
            st.drowned = true;
            _spawnDeathEffect(wx, wy);
if (typeof BattleAudio !== 'undefined') BattleAudio.playDrowning(wx, wy);
        }

        st.wasInWater  = inWater;
        st.wasSwimming = isSwimming;
        return st;
    }

    // ─── WATER SURFACE LINE ───────────────────────────────────────────────────
    // Draws an animated wavy waterline at world-space (wx, wyLine).
    function _drawWaterLine(ctx, wx, wyLine, halfWidth) {
        const t       = Date.now() / 700;
        const wc      = (window.navalEnvironment && navalEnvironment.waterColor) || '#2b4a5f';

        ctx.save();
        ctx.globalAlpha = 0.70;

        // Main coloured wave
        ctx.strokeStyle = wc;
        ctx.lineWidth   = 2.5;
        ctx.beginPath();
        let first = true;
        for (let dx = -halfWidth; dx <= halfWidth; dx += 2) {
            const wy = wyLine + Math.sin(dx * 0.28 + t) * 2.2;
            first ? ctx.moveTo(wx + dx, wy) : ctx.lineTo(wx + dx, wy);
            first = false;
        }
        ctx.stroke();

        // Foam highlight
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth   = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        first = true;
        for (let dx = -halfWidth + 3; dx <= halfWidth - 3; dx += 2) {
            const wy = wyLine - 2 + Math.sin(dx * 0.35 + t + 1.2) * 1.5;
            first ? ctx.moveTo(wx + dx, wy) : ctx.lineTo(wx + dx, wy);
            first = false;
        }
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.restore();
    }

    // ─── ENTRY RIPPLE RING ────────────────────────────────────────────────────
    function _drawRipple(ctx, wx, wy, overboardTimer) {
        const prog = Math.min(1, overboardTimer / 40);
        const r    = prog * 28;
        ctx.save();
        ctx.globalAlpha = (1 - prog) * 0.65;
        ctx.strokeStyle = 'rgba(160,220,255,0.9)';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.ellipse(wx, wy, r, r * 0.30, 0, 0, Math.PI * 2);
        ctx.stroke();
        // Second ring, slightly delayed
        if (prog > 0.25) {
            const r2 = (prog - 0.25) * 0.75 * 28;
            ctx.globalAlpha = (1 - prog) * 0.35;
            ctx.beginPath();
            ctx.ellipse(wx, wy, r2, r2 * 0.25, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ─── GLOBAL EFFECTS DRAW — call inside camera-transform each frame ────────
    window.drawDrowningEffects = function (ctx) {
        const now = Date.now();

        // 1. Splash particles
		_splashMap.forEach((ps, id) => {
			let anyAlive = false;

			for (let i = 0; i < ps.length; i++) {
				const p = ps[i];
				if (p.life >= p.maxLife) continue;

				anyAlive = true;

				p.ox += p.vx;
				p.oy += p.vy;

				p.vy += 0.10;     // gentler gravity
				p.vx *= 0.92;     // horizontal damping

				// Keep splash tightly localized
				p.ox = Math.max(-8, Math.min(8, p.ox));     // 16 px wide total
				p.oy = Math.max(-20, Math.min(0, p.oy));    // 20 px tall total

				p.life++;

				const t = p.life / p.maxLife;
				ctx.globalAlpha = (1 - t) * 0.90;
				ctx.fillStyle   = t < 0.5 ? '#ceeef8' : '#8bbfd4';

				const r = (p.big ? 2.2 : 1.2) * (p.scale || 0.4) * (1 - t * 0.4);
				const bx = p.baseX + p.ox;
				const by = p.baseY + p.oy;

				ctx.beginPath();
				ctx.arc(bx, by, r, 0, Math.PI * 2);
				ctx.fill();
			}

			if (!anyAlive) _splashMap.delete(id);
		});
		ctx.globalAlpha = 1;

 
		
		
	// 3. Rising bubble pools (normal drowning)
const now2 = Date.now();
for (let i = _bubblePools.length - 1; i >= 0; i--) {
    const bp  = _bubblePools[i];
    const age = (now2 - bp.born) / 1000;

    if (age > 3.5) { _bubblePools.splice(i, 1); continue; }

    const t = age / 3.5;

    bp.bubbles.forEach(b => {
        b.oy = Math.max(-20, Math.min(-1, (b.oy || 0) - b.speed));
        b.ox = Math.max(-10, Math.min(10, (b.ox || 0) + Math.sin(now2 / 400 + b.wobble) * 0.15));

        const swayX = Math.sin(now2 / 400 + b.wobble) * 2.5;
        const bx    = bp.x + b.ox + swayX;
        const by    = bp.y + b.oy;
        const alpha = (1 - t) * 0.75;

        ctx.save();
        ctx.globalAlpha = alpha;

        ctx.strokeStyle = 'rgba(160, 220, 255, 0.9)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.arc(bx, by, b.r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(220, 245, 255, 0.35)';
        ctx.beginPath();
        ctx.arc(bx - b.r * 0.28, by - b.r * 0.28, b.r * 0.38, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    });

        }
    };

    // =========================================================================
    // INFANTRY WRAPPER
    // =========================================================================
    // Signature mirror of drawInfantryUnit(ctx,x,y,moving,frame,factionColor,
    //   type,isAttacking,side,unitName,isFleeing,cooldown,unitAmmo,unit,reloadProgress)

    // Store reference to original — works whether the script was loaded before
    // or after this file, thanks to the deferred hook below.
    let _origInfantry = null;
function _infantryWrapper(ctx, x, y, moving, frame, factionColor,
                              type, isAttacking, side, unitName,
                              isFleeing, cooldown, unitAmmo, unit, reloadProgress) {

// Non-naval/river battles and missing unit objects — pass through untouched
        if (!window.inNavalBattle && !window.inRiverBattle) return _origInfantry.apply(this, arguments);
        if (!unit) {
            return _origInfantry.apply(this, arguments);
        }
        const inWater = unit.overboardTimer && unit.overboardTimer > 0;
        if (!inWater && !unit.isSwimming) {
            return _origInfantry.apply(this, arguments);
        }
        
        // ── GEOMETRIC SAFETY CHECK: never show drowning on ship deck or plank ──
        if (window.getNavalSurfaceAt) {
            const surface = window.getNavalSurfaceAt(x, y);
            // If they are safe on the deck or a plank, draw normally.
            // 'EDGE' triggers partial submersion (Stage B), 'WATER' triggers full (Stage C).
            if (surface === 'DECK' || surface === 'PLANK') {
                return _origInfantry.apply(this, arguments);
            }
        }

        // Splash scale: infantry is small. Archers/spear match, commanders slightly bigger.
        const _infScale = (unit.isCommander) ? 0.55 : 0.35;
 
        const st = _track(unit, x, y, _infScale);

        // ── STAGE 2: DROWNED — draw nothing (blood pool is already in _bloodPools)
        if (unit.hp <= 0 && st.drowned) return;

        // ── STAGE 0: INITIAL SPLASH PHASE (overboardTimer 1 – 119, not yet swimming)
        if (!unit.isSwimming) {
            const subFrac   = Math.min(1, unit.overboardTimer / 170);
            // Progressively sink: feet disappear first, then legs, torso starts to go
            // Show from INF_HEAD_LOCAL_TOP down to (INF_HEAD_LOCAL_BOT + remaining body)
            // At subFrac=0: fully visible; at subFrac=1: head-only visible
            const bodyBot   = INF_FEET_LOCAL;   // +9
            const headBot   = INF_HEAD_LOCAL_BOT;  // -6
            const visBot    = bodyBot - (bodyBot - headBot) * subFrac;   // shrinks from +9 → -6

            ctx.save();
            ctx.beginPath();
            ctx.rect(x - 50, y + INF_HEAD_LOCAL_TOP, 100, (visBot - INF_HEAD_LOCAL_TOP));
            ctx.clip();
            _origInfantry.apply(this, arguments);
            ctx.restore();

            // Waterline at the current submersion level
            _drawWaterLine(ctx, x, y + visBot, 20);
            // Entry ripple ring
            _drawRipple(ctx, x, y, unit.overboardTimer);
            return;
        }

        // ── STAGE 1: SWIMMING — show head only ────────────────────────────────
        // Head local coords: centre (0, -12), r=3.5
        // Give a little bob using time so the head looks like it's treading water
        const bobOffset = Math.sin(Date.now() / 380) * 1.8;
        const headBotY  = y + INF_HEAD_LOCAL_BOT + bobOffset;

        ctx.save();
        ctx.beginPath();
        // Clip window: just the head (INF_HEAD_LOCAL_TOP → INF_HEAD_LOCAL_BOT)
        ctx.rect(x - 14, y + INF_HEAD_LOCAL_TOP + bobOffset,
                 28, INF_HEAD_LOCAL_BOT - INF_HEAD_LOCAL_TOP);
        ctx.clip();

        // Shift the draw call to follow the bob
        const argsCopy = Array.from(arguments);
        argsCopy[2] = y + bobOffset;   // shift y for the entire draw call
        _origInfantry.apply(this, argsCopy);
        ctx.restore();

        // Animated waterline just below chin
        _drawWaterLine(ctx, x, headBotY, 18);

        // Tiny panicked arm-splash: just two short curved strokes either side
        _drawSwimStrokes(ctx, x, headBotY);
    }
    // Small cosmetic arm-splash strokes for swimming infantry
    function _drawSwimStrokes(ctx, cx, cy) {
        const t  = Date.now() / 500;
        const lx = cx - 8 + Math.sin(t) * 3;
        const rx = cx + 8 + Math.sin(t + Math.PI) * 3;
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = '#aaddee';
        ctx.lineWidth   = 1.5;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(lx, cy + 1);
        ctx.quadraticCurveTo(lx - 5, cy - 3, lx - 2, cy + 3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(rx, cy + 1);
        ctx.quadraticCurveTo(rx + 5, cy - 3, rx + 2, cy + 3);
        ctx.stroke();
        ctx.restore();
    }

    // =========================================================================
    // CAVALRY WRAPPER
    // =========================================================================
    // Signature mirror of drawCavalryUnit(ctx,x,y,moving,frame,factionColor,
    //   isAttacking,type,side,unitName,isFleeing,cooldown,unitAmmo,unit,reloadProgress)

    let _origCavalry = null;

function _cavalryWrapper(ctx, x, y, moving, frame, factionColor,
                             isAttacking, type, side, unitName,
                             isFleeing, cooldown, unitAmmo, unit, reloadProgress) {

// Non-naval/river battles and missing unit objects — pass through untouched
        if (!window.inNavalBattle && !window.inRiverBattle) return _origCavalry.apply(this, arguments);
        if (!unit) {
            return _origCavalry.apply(this, arguments);
        }

        const inWater = unit.overboardTimer && unit.overboardTimer > 0;
        if (!inWater && !unit.isSwimming) {
            return _origCavalry.apply(this, arguments);
        }
        
        // ── GEOMETRIC SAFETY CHECK: mirrors the infantry wrapper exactly ──────
        // Uses the same canvas-path hit test as physics (via drowning_detector.js
        // or the original getNavalSurfaceAt). Replaces the old tile-number check
        // which used tile values 4 and 8 that don't exist in naval maps.
        if (window.getNavalSurfaceAt) {
            const surface = window.getNavalSurfaceAt(x, y);
            if (surface === 'DECK' || surface === 'PLANK') {
                return _origCavalry.apply(this, arguments);
            }
        }

        // ---> SURGERY: Move these definitions UP so they exist before we calculate _cavScale <---
        const elephantRgx = /eleph|elefa/i;
        const isElephant  = elephantRgx.test(type || '') || elephantRgx.test(unitName || '');
        const isCamel     = (type === 'camel') || /camel/i.test(unitName || '');

        const _cavScale = isElephant ? 1.1 : isCamel ? 0.75 : 0.70;
        const st = _track(unit, x, y, _cavScale);

        // ── STAGE 2: DROWNED
        if (unit.hp <= 0 && st.drowned) return;

        // Determine sprite bottom in LOCAL space based on mount type
        const localBot = isElephant ? CAV_SPRITE_BOT_ELEPH
                       : isCamel    ? CAV_SPRITE_BOT_CAMEL
                       :              CAV_SPRITE_BOT_HORSE;

        const spriteH = localBot - CAV_SPRITE_TOP;   // total sprite height

      

// SURGERY: 10% less drowning for Horses and Camels so they can breathe
        const targetSubmergeFrac = isElephant ? 0.30 : 0.20; 

        // submerge fraction: 0 → Target % during stage 0, locked at Target % during stage 1
        let subFrac;
        if (!unit.isSwimming) {
            subFrac = Math.min(targetSubmergeFrac, (unit.overboardTimer / 190) * targetSubmergeFrac);
        } else {
            subFrac = targetSubmergeFrac;
        }

        // World-space clip bottom = y + localBot − submergePixels
        const submergePixels = spriteH * subFrac;
        const clipBottom     = y + localBot - submergePixels;

        // CLIP: allow only the upper (100 − 30)% of the sprite through
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + CAV_SPRITE_TOP,              // far-left safe bound
                 y + CAV_SPRITE_TOP,
                 Math.abs(CAV_SPRITE_TOP) * 2 + 40,  // wide enough for any weapon
                 (clipBottom) - (y + CAV_SPRITE_TOP));
        ctx.clip();
        _origCavalry.apply(this, arguments);
        ctx.restore();

        // Animated waterline at the clip edge
        _drawWaterLine(ctx, x, clipBottom, 35);

        // Entry ripple during stage 0
        if (!unit.isSwimming) {
            _drawRipple(ctx, x, y, unit.overboardTimer);
        }
    }

    // =========================================================================
    // DEFERRED HOOK INSTALLER
    // Wrapping is deferred to the next tick so it runs after both infscript.js
    // and cavscript.js have finished defining their functions, regardless of
    // script-tag order.
    // =========================================================================
    function _installHooks() {
        if (typeof window.drawInfantryUnit === 'function' && !window.drawInfantryUnit._drowningWrapped) {
            _origInfantry = window.drawInfantryUnit;
            window.drawInfantryUnit = _infantryWrapper;
            window.drawInfantryUnit._drowningWrapped = true;
        }
        if (typeof window.drawCavalryUnit === 'function' && !window.drawCavalryUnit._drowningWrapped) {
            _origCavalry = window.drawCavalryUnit;
            window.drawCavalryUnit = _cavalryWrapper;
            window.drawCavalryUnit._drowningWrapped = true;
        }
    }

    // Try immediately, then retry on DOMContentLoaded and load in case scripts
    // are deferred.
    _installHooks();
    document.addEventListener('DOMContentLoaded', _installHooks);
    window.addEventListener('load', _installHooks);

    // =========================================================================
    // NAVAL PHYSICS PATCH — intercept the drownTimer death to suppress normal
    // blood/death visuals and let our blood pool take over.
    // We patch updateNavalPhysics to tag units right before hp hits 0.
    // =========================================================================
    function _patchNavalPhysics() {
        if (typeof window.updateNavalPhysics !== 'function') return;
        if (window.updateNavalPhysics._drowningPatched) return;

        const _origPhysics = window.updateNavalPhysics;
        window.updateNavalPhysics = function () {
            // Snapshot swimming state before the original runs (so we can detect
            // the exact frame hp transitions to 0).
            if (window.battleEnvironment && battleEnvironment.units) {
                battleEnvironment.units.forEach(u => {
                    if (u.isSwimming && u.hp > 0) u._wasSwimmingPrePhysics = true;
                });
            }
            _origPhysics.apply(this, arguments);
            // After physics: if hp just became 0 and the unit was swimming,
            // mark it for silent removal so the normal death renderer skips it.
            if (window.battleEnvironment && battleEnvironment.units) {
                battleEnvironment.units.forEach(u => {
                   if (u._wasSwimmingPrePhysics && u.hp <= 0 && !u._drownedSilently) {
                        u._drownedSilently = true;
                        // Tag deathRotation to a sentinel value the main engine
                        // can check — keeps it at 0 (the engine's own assignment)
                        // so no spin-out death animation plays.
                        u.deathRotation    = 0;
                        
// Fire death effect from here as well as a safety net
                        // DISABLED: Prevent blood explosion for drowning/environmental deaths
                        // _spawnDeathEffect(u.x, u.y); 
                    }
                    delete u._wasSwimmingPrePhysics;
                });
            }
};
        window.updateNavalPhysics._drowningPatched = true;

        // SURGERY: Do the exact same patch for the newly created River Physics
        if (typeof window.updateRiverPhysics === 'function' && !window.updateRiverPhysics._drowningPatched) {
            const _origRiverPhysics = window.updateRiverPhysics;
            window.updateRiverPhysics = function () {
                if (window.battleEnvironment && battleEnvironment.units) {
                    battleEnvironment.units.forEach(u => {
                        if (u.isSwimming && u.hp > 0) u._wasSwimmingPrePhysics = true;
                    });
                }
                _origRiverPhysics.apply(this, arguments);
                if (window.battleEnvironment && battleEnvironment.units) {
                    battleEnvironment.units.forEach(u => {
                       if (u._wasSwimmingPrePhysics && u.hp <= 0 && !u._drownedSilently) {
                            u._drownedSilently = true;
                            u.deathRotation = 0;
                        }
                        delete u._wasSwimmingPrePhysics;
                    });
                }
            };
            window.updateRiverPhysics._drowningPatched = true;
        }
    }
    // Patch naval physics after load (it may not be defined yet)
    window.addEventListener('load', _patchNavalPhysics);
    if (document.readyState === 'complete') _patchNavalPhysics();

})();