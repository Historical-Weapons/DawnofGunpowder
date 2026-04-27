(function () {
"use strict";

// ─── CE ACCESSOR ─────────────────────────────────────────────────────────────
// camp_system.js exposes its state bag via window._CAMP_CE (surgical patch #1).
function _CE() { return window._CAMP_CE; }

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const CAMP_CX             = 700;
const CAMP_CY             = 700;
const CAMP_W              = 1800;
const CAMP_H              = 1800;
const PAL_RADIUS          = 460;

const MELEE_ENGAGE_RANGE  = 34;   // px — same as existing bandit AI
const RANGED_ENGAGE_MAX   = 240;  // max fire range for camp ranged troops
const RANGED_ENGAGE_MIN   = 58;   // archers/crossbows keep this distance from target
const CHARGE_SPEED        = 1.15; // px/frame for melee troops charging
const RETREAT_SPEED       = 0.60; // px/frame for ranged troops backing off
const PROJ_BASE_SPEED     = 4.4;  // px/frame for projectiles

const CHAIR_SIT_PROB      = 0.0009; // per-frame probability an idle troop picks a chair
const CHAIR_UNSIT_MIN_F   = 260;    // minimum frames before unsitting (≈4.3 s at 60 fps)
const CHAIR_UNSIT_MAX_F   = 600;    // maximum frames before unsitting (≈10 s)
const CHAIR_SEEK_RADIUS   = 90;     // px — troop must be within this range to claim a chair

// ─── BANDIT ARCHETYPES ────────────────────────────────────────────────────────
//
// visType   → string passed to drawInfantryUnit() as the role argument.
//             Must match a type the existing renderer recognises.
// label     → shown in the small red name tag above the unit.
// isRanged  → true  → this bandit stands off and fires projectiles
//             false → this bandit charges into melee
// armor     → damage absorption (low for bandits — they wear rags)
// atk       → base attack value used for both melee damage and projectile damage
// meleeRange→ px at which a melee bandit is considered "in combat"
// ammo      → shots before the bandit is forced into melee (ranged only)
// rangedMax → maximum px range at which a ranged bandit will fire
// rangedMin → minimum px — closer than this and they back away
//
const BANDIT_ARCHETYPES = [
// ── MELEE (6) ──
    { visType:"peasant",     label:"Club Bandit",       isRanged:false, armor:2,  atk:8,  meleeRange:34 },
    { visType:"peasant",     label:"Hatchet Bandit",    isRanged:false, armor:3,  atk:11, meleeRange:34 },
    { visType:"peasant",     label:"Pitchfork Bandit",  isRanged:false, armor:2,  atk:9,  meleeRange:40 },
    { visType:"spearman",    label:"Spear Bandit",      isRanged:false, armor:4,  atk:10, meleeRange:42 },
    { visType:"sword_shield",label:"Stolen Sword Bandit",isRanged:false, armor:8,  atk:13, meleeRange:34 },
    { visType:"peasant",     label:"Axe Bandit",        isRanged:false, armor:3,  atk:14, meleeRange:34 },
    // ── RANGED (4) ──
    { visType:"archer",      label:"Ranged Bandit",         isRanged:true,  armor:2,  atk:12, ammo:8,  rangedMax:320, rangedMin:60 },
    { visType:"throwing",    label:"Ranged Bandit",      isRanged:true,  armor:2,  atk:7,  ammo:4, rangedMax:160, rangedMin:40 },
    { visType:"crossbow",    label:"Ranged Bandit",   isRanged:true,  armor:4,  atk:18, ammo:5,  rangedMax:370, rangedMin:72 },
    { visType:"throwing",    label:"Ranged Bandit",     isRanged:true,  armor:2,  atk:16, ammo:3,  rangedMax:145, rangedMin:45 },
];

// Relative weights for random selection — melee dominant
const _ARCH_WEIGHTS  = [18, 16, 12, 14, 10, 12,   // melee
                          8,  7,  6,  9];           // ranged
const _ARCH_W_TOTAL  = _ARCH_WEIGHTS.reduce((a,b) => a+b, 0);

function _randomArchetype() {
    let r = Math.random() * _ARCH_W_TOTAL;
    for (let i = 0; i < BANDIT_ARCHETYPES.length; i++) {
        r -= _ARCH_WEIGHTS[i];
        if (r <= 0) return BANDIT_ARCHETYPES[i];
    }
    return BANDIT_ARCHETYPES[0];
}

// Bandit head-counts per tier  [min, max]
const BANDIT_COUNT = { 1:[5,9], 2:[10,16], 3:[16,26] };

// ─── COMBAT DIALOGUE ─────────────────────────────────────────────────────────
//
// These conversations replace ALL normal camp chatter the moment an ambush
// triggers.  Troops do NOT stop moving to deliver them (only normal TALK-state
// pausing applies to the post-battle lines).
//
const COMBAT_TALKS = [
    ["BANDITS! TO ARMS!", "With me, brothers!", "Hold the line!", "For the camp!"],
    ["Sound the alarm!", "They are in the camp!", "How did they get past the watch?!", "Fight!"],
    ["Ambush! Everyone up!", "Save the supplies!", "I count six — maybe more.", "Kill them all."],
    ["There are too many—", "Stand firm. Do NOT break!", "Archers, fall back and fire!", "NOW!"],
    ["I have bad weapon—", "Take mine, I have two.", "Then use a rock. Use anything!", "...Right."],
    ["They struck from the trees!", "Spears to the front!", "Do not let them reach the commander!", "Move!"],
    ["My arm—", "Can you still swing?", "I can still swing.", "Then swing."],
    ["Where are they coming from?", "The ridge — the treeline—", "Everywhere.", "Back to back!"],
    ["This is not my first ambush.", "What do you do?", "You do not panic. That is the whole trick.", "Simple."],
    ["Drive them back!", "Whoever is alive, push forward!", "We are winning — do NOT stop!", "For our camp!"],
    ["They are well-armed for bandits.", "Agreed.", "Less talk, more stabbing.", "Agreed."],
    ["I can hear them shouting.", "They expected easy prey.", "They were wrong.", "Show them how wrong."],
];

// Post-battle reaction lines (fire ~2 s after victory)
const POSTCOMBAT_TALKS = [
    ["That was close.", "Too close. Who is hurt?", "Just a scratch.", "Check everyone."],
    ["Are they all dead?", "Ran. Some ran.", "Good enough.", "Next time there may be more."],
    ["Someone check the tents.", "Supplies are intact.", "Small mercy.", "Clean up the bodies. Now."],
    ["That was good fighting.", "I was terrified.", "So was I.", "Terrified men fight well."],
    ["My hands are still shaking.", "They will stop.", "When?", "Give it a moment. They always stop."],
    ["I thought we were finished.", "We were not.", "Lucky.", "Skilled. Mostly. But yes — lucky too."],
    ["Someone killed four of them alone.", "I only killed one.", "Then you owe someone dinner.", "A fair debt."],
    ["Where did they come from?", "The road south, I think.", "We need better watches.", "Agreed."],
];

// ─── CAMP PROJECTILE MINI-SYSTEM ─────────────────────────────────────────────
//
// Entirely separate from battlefield_logic.js projectiles.
// Lives in this module's closure — no globals polluted.
//
let _campProjs = []; // { x,y,vx,vy,type,damage,fromBandit,lifespan,hit }

function _spawnCampProjectile(shooter, targetObj) {
    // targetObj can be a bandit unit OR a { x, y, isPlayer, isTroop, ref } lookup struct
    const tx = (targetObj.ref ? targetObj.ref.x : targetObj.x) || targetObj.x;
    const ty = (targetObj.ref ? targetObj.ref.y : targetObj.y) || targetObj.y;
    const dx = tx - shooter.x;
    const dy = ty - shooter.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) return;

    // Small angular spread to prevent perfect laser accuracy
    const spread = (Math.random() - 0.5) * 0.22;
    const cosS   = Math.cos(spread), sinS = Math.sin(spread);
    const ndx    = dx/dist, ndy = dy/dist;
    const vx     = (ndx*cosS - ndy*sinS) * PROJ_BASE_SPEED;
    const vy     = (ndx*sinS + ndy*cosS) * PROJ_BASE_SPEED - PROJ_BASE_SPEED * 0.15;

    const role   = shooter.combatRole || {};
    const visT   = role.visType || shooter._projType || "throwing";
    const dmg    = (role.atk || 10) * (0.65 + Math.random() * 0.7);

	_campProjs.push({
        x: shooter.x, y: shooter.y - 8,
        vx, vy,
        type: visT,
        damage: dmg,
        fromBandit: !!shooter._isBandit,
        shooterId: shooter.id, // <-- NEW: Tag the arrow with the shooter's specific ID
        lifespan: 72,
        hit: false,
    });
}

function _updateCampProjectiles(dt) {
    const CE = _CE();
    if (!CE) return;

    _campProjs = _campProjs.filter(p => {
        if (p.hit || p.lifespan <= 0) return false;
        p.x      += p.vx;
        p.y      += p.vy;
        p.vy     += 0.055; // gentle arc gravity
        p.lifespan--;

        if (p.fromBandit) {
            // Bandit projectile → can hurt player and friendly troops
            if (typeof player !== "undefined" && player.hp > 0) {
                if (Math.hypot(p.x - player.x, p.y - player.y) < 20) {
                    const armor   = player.armor || 20;
                    const finalDmg = Math.max(1, p.damage - armor * 0.18);
                    player.hp     = Math.max(0, (player.hp || 0) - finalDmg);
                    p.hit = true;
                    return false;
                }
            }
            for (const t of CE.troops) {
                if (t.hp <= 0 || t.state === "in_tent") continue;
                if (Math.hypot(p.x - t.x, p.y - t.y) < 15) {
                    const armor   = (t.stats && t.stats.armor) || 8;
                    const finalDmg = Math.max(1, p.damage - armor * 0.14);
                    t.hp          = Math.max(0, (t.hp || 100) - finalDmg);
                    if (t.hp <= 0) t.state = "in_tent";
                    p.hit = true;
                    return false;
                }
            }
		} else {
            // Troop or player projectile → can hurt bandits
            for (const b of CE.ambushUnits) {
                if (b.hp <= 0) continue;
                if (Math.hypot(p.x - b.x, p.y - b.y) < 17) {
                    const armor    = (b.stats && b.stats.armor) || 3;
                    const finalDmg = Math.max(1, p.damage - armor * 0.1);
                    b.hp           = Math.max(0, b.hp - finalDmg);
                    
                    // --- NEW: RANGED KILL EXP ---
                    if (b.hp <= 0 && p.shooterId !== undefined && typeof player !== "undefined" && player.roster && player.roster[p.shooterId]) {
                        player.roster[p.shooterId].exp = (player.roster[p.shooterId].exp || 0) + 25; // 25 XP per kill
                        console.log(`[CampCombat] Archer #${p.shooterId} got a ranged kill! +25 EXP`);
                    }
                    
                    p.hit = true;
                    return false;
                }
            }
        }
        return true;
    });
}

function _renderCampProjectiles(ctx) {
    _campProjs.forEach(p => {
        const angle = Math.atan2(p.vy, p.vx);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);

        if (p.type === "archer") {
            // Arrow shaft + head + fletching
            ctx.strokeStyle = "#6b4c24"; ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke();
            ctx.fillStyle = "#9e9e9e";
            ctx.beginPath(); ctx.moveTo(8,0); ctx.lineTo(4,-2.2); ctx.lineTo(4,2.2); ctx.closePath(); ctx.fill();
            ctx.fillStyle = "#8b5e30";
            ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(-5,-2); ctx.lineTo(-5,2); ctx.closePath(); ctx.fill();

        } else if (p.type === "crossbow") {
            // Crossbow bolt — shorter, heavier
            ctx.strokeStyle = "#3e2a0a"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(9, 0); ctx.stroke();
            ctx.fillStyle = "#8b8b8b";
            ctx.beginPath(); ctx.moveTo(9,0); ctx.lineTo(5,-2); ctx.lineTo(5,2); ctx.closePath(); ctx.fill();

        } else if (p.fromBandit) {
            // Bandit thrown object — reddish stone/hatchet silhouette
            ctx.fillStyle = "#8d2b0b";
            ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = "#4a1408"; ctx.lineWidth = 0.8; ctx.stroke();

        } else {
            // Friendly thrown rock / generic
            ctx.fillStyle = "#888888";
            ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI*2); ctx.fill();
        }

        ctx.restore();
    });
}

// ─── CHAIR DRAWING ────────────────────────────────────────────────────────────
//
// Pixel-art wooden stool with back-rest. Drawn in world-space each frame via
// campCombatRender (not burned into bgCanvas because chairs are added after
// bgCanvas is already built in launchCamp).
//
window.campDrawChair = function (ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);

    // Drop shadow
    ctx.fillStyle = "rgba(0,0,0,0.26)";
    ctx.beginPath(); ctx.ellipse(0, 3, 11, 4.5, 0, 0, Math.PI*2); ctx.fill();

    // Seat
    const sg = ctx.createLinearGradient(-9, -7, 9, 1);
    sg.addColorStop(0, "#8b5e30"); sg.addColorStop(1, "#5d3d1a");
    ctx.fillStyle = sg;
    ctx.fillRect(-9, -7, 18, 6);
    ctx.strokeStyle = "#3e2a0a"; ctx.lineWidth = 0.9; ctx.strokeRect(-9, -7, 18, 6);

    // Seat wood grain lines
    ctx.strokeStyle = "rgba(0,0,0,0.12)"; ctx.lineWidth = 0.5;
    [-4, 0, 4].forEach(gx => {
        ctx.beginPath(); ctx.moveTo(gx, -7); ctx.lineTo(gx+1, -1); ctx.stroke();
    });

    // Back-rest cross-bar
    ctx.fillStyle = "#7a4e28";
    ctx.fillRect(-9, -19, 18, 5);
    ctx.strokeStyle = "#3e2a0a"; ctx.lineWidth = 0.9; ctx.strokeRect(-9, -19, 18, 5);

    // Vertical slats in back-rest
    ctx.strokeStyle = "#6b4224"; ctx.lineWidth = 1.2;
    [-4, 0, 4].forEach(sx => {
        ctx.beginPath(); ctx.moveTo(sx, -14); ctx.lineTo(sx, -19); ctx.stroke();
    });

    // Two upright back posts
    ctx.strokeStyle = "#3e2a0a"; ctx.lineWidth = 2.2;
    [-8, 8].forEach(px => {
        ctx.beginPath(); ctx.moveTo(px, -1); ctx.lineTo(px, -20); ctx.stroke();
    });

    // Four legs — slightly angled outward
    ctx.strokeStyle = "#3e2a0a"; ctx.lineWidth = 1.8;
    const legs = [[-8,-1,-10,9],[8,-1,10,9],[-8,-1,-6,9],[8,-1,6,9]];
    legs.forEach(([x1,y1,x2,y2]) => {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    });

    // Cross-brace
    ctx.strokeStyle = "#5d3d1a"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-8, 3); ctx.lineTo(8, 3); ctx.stroke();

    ctx.restore();
};

// ─── CHAIR PLACEMENT ─────────────────────────────────────────────────────────
let _chairDecos = []; // mirrors the chair entries in CE.decos

function _addChairsToDecos(CE) {
    _chairDecos = [];
    const numPerFire = CE.tier === 1 ? 2 : CE.tier === 2 ? 3 : 4;
    const extraLoose  = CE.tier === 1 ? 2 : CE.tier === 2 ? 4 : 7;

    // Place chairs in arcs around every fire — they share real estate with log seats
    CE.fires.forEach((fire, fi) => {
        for (let c = 0; c < numPerFire; c++) {
            // Offset angle so chairs interleave with log seats
            const a = (c / numPerFire) * Math.PI * 2 + fi * 1.1 + 0.35;
            const r = 42 + Math.random() * 18;
            const obj = { x: fire.x + Math.cos(a)*r, y: fire.y + Math.sin(a)*r, kind:"chair", _occupiedBy:null };
            CE.decos.push(obj);
            _chairDecos.push(obj);
        }
    });

    // Scatter a few extra chairs near tents / around camp
    for (let e = 0; e < extraLoose; e++) {
        const a = Math.random() * Math.PI * 2;
        const r = 80 + Math.random() * 200;
        const obj = { x: CAMP_CX + Math.cos(a)*r, y: CAMP_CY + Math.sin(a)*r, kind:"chair", _occupiedBy:null };
        CE.decos.push(obj);
        _chairDecos.push(obj);
    }
}

// ─── CHAIR SITTING LOGIC ─────────────────────────────────────────────────────
//
// Runs every frame outside of combat. An idle wandering troop may notice a
// nearby unoccupied chair, claim it, walk over, and sit. A sit timer counts
// down; when it reaches zero the troop releases the chair and resumes wandering.
//

function _updateChairSitting(CE, dt) {
    // During active ambush, no one sits down
    if (CE.ambushActive || window._CAMP_COMBAT_ACTIVE) return;
    if (_chairDecos.length === 0) return;

    CE.troops.forEach(t => {
        if (t.hp <= 0) return;

        // ── TROOP IS WALKING TO A CLAIMED CHAIR ────────────────────────────
        if (t._chairTarget) {
            const dx = t._chairTarget.x - t.x;
            const dy = t._chairTarget.y - t.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 6) {
                // Arrived — snap, sit, start timer
                t.x = t._chairTarget.x;
                t.y = t._chairTarget.y;
                t.isMoving = false;
                t.state    = "sit";
                if (!t._chairSitTimer) {
                    t._chairSitTimer = CHAIR_UNSIT_MIN_F + Math.floor(Math.random() * (CHAIR_UNSIT_MAX_F - CHAIR_UNSIT_MIN_F));
                }
            } else {
                // Still walking — move at troop speed (same as _setWanderTarget motion)
                t.x      += (dx/dist) * 0.8;
                t.y      += (dy/dist) * 0.8;
                t.isMoving = true;
                t.dir      = dx > 0 ? 1 : -1;
            }
        }

        // ── TROOP IS SEATED ON A CHAIR ──────────────────────────────────────
        if (t.state === "sit" && t._chairTarget) {
            t._chairSitTimer = (t._chairSitTimer || CHAIR_UNSIT_MIN_F) - 1;
            if (t._chairSitTimer <= 0) {
                // Stand up — free the chair, wander away
                if (t._chairTarget._occupiedBy === t.id) t._chairTarget._occupiedBy = null;
                t._chairTarget   = null;
                t._chairSitTimer = 0;
                // Pick a wander target a little distance away so they move off the chair
                const a = Math.random() * Math.PI * 2;
                const r = 70 + Math.random() * 130;
                t.targetX  = Math.max(80, Math.min(CAMP_W-80, t.x + Math.cos(a)*r));
                t.targetY  = Math.max(80, Math.min(CAMP_H-80, t.y + Math.sin(a)*r));
                t.state    = "wander";
                t.timer    = 180 + Math.floor(Math.random() * 260);
                t.isMoving = false;
            }
            return; // Don't try to claim another chair while seated
        }

        // ── IDLE TROOP — MAYBE SIT ON A NEARBY CHAIR ────────────────────────
        if (t._chairTarget) return; // Already claimed one
        if (t.state !== "wander" && t.state !== "sit") return;
        if (t.state === "sit" && !t._chairTarget) return; // Log-seat sit, not chair
        if (Math.random() > CHAIR_SIT_PROB) return;

        // Find nearest unoccupied chair within reach
        let best = null, bestDist = CHAIR_SEEK_RADIUS;
        _chairDecos.forEach(ch => {
            if (ch._occupiedBy !== null && ch._occupiedBy !== t.id) return;
            const d = Math.hypot(t.x - ch.x, t.y - ch.y);
            if (d < bestDist) { bestDist = d; best = ch; }
        });

        if (best) {
            best._occupiedBy  = t.id;
            t._chairTarget    = best;
            t._chairSitTimer  = 0; // will be set when they arrive
            t.state           = "wander"; // use wander locomotion to walk there
        }
    });
}

// ─── TROOP STATE SNAPSHOT (regroup after battle) ─────────────────────────────
let _troopSnapshots = {}; // keyed by troop id

function _snapshotTroopStates(CE) {
    _troopSnapshots = {};
    CE.troops.forEach(t => {
        _troopSnapshots[t.id] = {
            state:    t.state,
            targetX:  t.targetX,
            targetY:  t.targetY,
            tentIdx:  t.tentIdx,
            dialogueId: t.dialogueId,
            hasChair: !!t._chairTarget,
        };
    });
}

function _restoreTroopStates(CE) {
    CE.troops.forEach(t => {
        if (t.hp <= 0) return;

        // Partial HP recovery from adrenaline drop
        t.hp         = Math.min((t.stats && t.stats.health) || 100, (t.hp || 0) + 22);
        t.attackTimer = 0;
        t.combatRole  = null;
        t._isCombatting = false;

        // Release any chair held before combat (we'll let them find a new one naturally)
        if (t._chairTarget) {
            if (t._chairTarget._occupiedBy === t.id) t._chairTarget._occupiedBy = null;
            t._chairTarget   = null;
            t._chairSitTimer = 0;
        }

        const snap = _troopSnapshots[t.id];
        if (!snap) {
            // New troop or missing snapshot — just wander
            _giveWanderTarget(t);
            return;
        }

        // Restore the saved state, but gracefully: everything becomes wander first,
        // then the normal _updateCampTroops logic will nudge them back into sit/tend/talk.
        if (snap.state === "in_tent" && snap.tentIdx >= 0 && CE.tents[snap.tentIdx]) {
            const tent = CE.tents[snap.tentIdx];
            t.targetX   = tent.entX;
            t.targetY   = tent.entY;
            t.tentIdx   = snap.tentIdx;
            t.state     = "tend";
            t.timer     = 400 + Math.floor(Math.random() * 300);
        } else {
            // Wander back toward where they were
            t.targetX   = snap.targetX || CAMP_CX;
            t.targetY   = snap.targetY || CAMP_CY;
            t.state     = "wander";
            t.timer     = 250 + Math.floor(Math.random() * 350);
        }
        t.dialogueId  = null;
        t.isMoving    = false;
    });

    // Release ALL chairs (fresh state)
    _chairDecos.forEach(ch => { ch._occupiedBy = null; });
    console.log("[CampCombat] Troops regrouped after ambush.");
}

function _giveWanderTarget(t) {
    const a = Math.random() * Math.PI * 2;
    const r = 40 + Math.random() * 180;
    t.targetX  = Math.max(80, Math.min(CAMP_W-80, CAMP_CX + Math.cos(a)*r));
    t.targetY  = Math.max(80, Math.min(CAMP_H-80, CAMP_CY + Math.sin(a)*r));
    t.state    = "wander";
    t.timer    = 260 + Math.floor(Math.random() * 300);
    t.isMoving = false;
}

// ─── BANDIT SPAWN (OVERRIDE) ─────────────────────────────────────────────────
//
// Called immediately after window.campCombatOnTrigger() fires, REPLACING the
// basic CE.ambushUnits array that _triggerAmbush() already built.
//
function _rebuildBanditsWithVariety(CE) {
    const tier    = CE.tier || 1;
    const [min,mx]= BANDIT_COUNT[tier] || [4,8];
    const count   = min + Math.floor(Math.random() * (mx - min + 1));
    const spawnR  = tier === 3 ? PAL_RADIUS - 12 : Math.min(CAMP_W, CAMP_H) * 0.37;
    let nMelee = 0, nRanged = 0;

    CE.ambushUnits = [];

    for (let i = 0; i < count; i++) {
        const a = (Math.PI*2 / count) * i + (Math.random() - 0.5) * 0.9;
        const r = spawnR + Math.random() * 55;

        // ~65 % melee, ~35 % ranged — but cap ranged at 40 % of total
        let arch;
        const wantMelee = Math.random() < 0.65 || nRanged >= Math.ceil(count * 0.40);
        if (wantMelee) {
            const pool = BANDIT_ARCHETYPES.filter(a => !a.isRanged);
            arch = pool[Math.floor(Math.random() * pool.length)];
            nMelee++;
        } else {
            const pool = BANDIT_ARCHETYPES.filter(a => a.isRanged);
            arch = pool[Math.floor(Math.random() * pool.length)];
            nRanged++;
        }

        const hpBase = 36 + tier * 10 + Math.floor(Math.random() * 20);

        CE.ambushUnits.push({
            x: CAMP_CX + Math.cos(a) * r,
            y: CAMP_CY + Math.sin(a) * r,
            hp: hpBase, maxHp: hpBase,
            anim:        Math.random() * 60,
            state:       "approach",
            attackTimer: Math.random() * 1.2,
            _isBandit:   true,
            combatRole:  arch,
            ammo:        arch.ammo || 0,
            stats: {
                armor:     arch.armor  || 3,
                health:    hpBase,
                isRanged:  arch.isRanged,
                ammo:      arch.ammo   || 0,
                morale:    50,
                role:      arch.isRanged ? "archer" : "infantry",
                radius:    5,
                mass:      10,
                weightTier:1,
            },
        });
    }

    console.log(`[CampCombat] Spawned ${count} bandits — ${nMelee} melee, ${nRanged} ranged — Tier ${tier}`);
}

// ─── TROOP COMBAT AI ─────────────────────────────────────────────────────────
//
// Runs every frame during an ambush. ALL troops engage, bypassing the legacy
// 70 px proximity gate (which is disabled via the _CAMP_COMBAT_ACTIVE flag in
// camp_system.js — see surgical patch #6).
//
// Melee troops  → sprint toward nearest live bandit, attack when adjacent.
// Ranged troops → stand off at RANGED_ENGAGE_MAX, back off at RANGED_ENGAGE_MIN,
//                 fire projectiles on an archetype-appropriate reload timer.
//
function _runTroopCombatAI(CE, dt) {
    if (!CE.ambushActive) return;
    const liveBandits = CE.ambushUnits.filter(b => b.hp > 0);
    if (liveBandits.length === 0) return;

    CE.troops.forEach(t => {
        if ((t.hp || 0) <= 0) return;
        if (t.state === "in_tent") return;

        // Find nearest live bandit
        let nearest = null, nearestDist = Infinity;
        liveBandits.forEach(b => {
            const d = Math.hypot(t.x - b.x, t.y - b.y);
            if (d < nearestDist) { nearestDist = d; nearest = b; }
        });
        if (!nearest) return;

// Kill active normal dialogue, but spare combat shouts!
        if (t.dialogueId !== null) {
            const d = CE.dialogues.find(d => d.id === t.dialogueId);
            if (d && !d._isCombatLine) {
                d.done = true;
                t.dialogueId = null;
            } else if (!d) {
                t.dialogueId = null;
            }
        }

        t.dir = nearest.x > t.x ? 1 : -1;

        const role      = t.role || "peasant";
        const isRanged  = role === "archer" || role === "crossbow" || role === "throwing";
        const mRange    = MELEE_ENGAGE_RANGE;
        const rMax      = isRanged ? RANGED_ENGAGE_MAX : mRange;
        const rMin      = isRanged ? RANGED_ENGAGE_MIN : 0;

        if (isRanged) {
            if (nearestDist > rMax) {
                // Advance until in fire range
                _troopMoveToward(t, nearest.x, nearest.y, CHARGE_SPEED * 0.65);
            } else if (nearestDist < rMin) {
                // Too close — back off so ranged unit can operate
                const dx = t.x - nearest.x, dy = t.y - nearest.y;
                const dLen = Math.hypot(dx,dy) || 1;
                t.x += (dx/dLen) * RETREAT_SPEED;
                t.y += (dy/dLen) * RETREAT_SPEED;
                t.isMoving = true;
            } else {
                // In fire window — stand and shoot
                t.isMoving  = false;
                t.attackTimer = (t.attackTimer || 0) + dt;
                const reloadSec = role === "crossbow" ? 2.6 : role === "archer" ? 1.9 : 1.3;
                if (t.attackTimer >= reloadSec) {
                    t.attackTimer = 0;
                    // Attach a temporary combatRole so _spawnCampProjectile knows the vis type
                    const savedRole = t.combatRole;
                    t.combatRole = { visType: role, atk: 12, isRanged: true };
                    _spawnCampProjectile(t, { x: nearest.x, y: nearest.y });
                    t.combatRole = savedRole;
                }
            }
        } else {
            if (nearestDist > mRange) {
                // Charge
                _troopMoveToward(t, nearest.x, nearest.y, CHARGE_SPEED);
			} else {
                // Melee strike
                t.isMoving  = false;
                t.attackTimer = (t.attackTimer || 0) + dt;
                if (t.attackTimer >= 1.1) {
                    t.attackTimer = 0;
                    const dmg = 5 + Math.random() * 7;
                    nearest.hp = Math.max(0, nearest.hp - dmg);
                    
                    // --- NEW: MELEE KILL EXP ---
                    if (nearest.hp <= 0 && typeof player !== "undefined" && player.roster && player.roster[t.id]) {
                        player.roster[t.id].exp = (player.roster[t.id].exp || 0) + 25; // 25 XP per kill
                        console.log(`[CampCombat] Troop #${t.id} got a melee kill! +25 EXP`);
                    }
                }
            }
        }
    });
}

function _troopMoveToward(t, tx, ty, speed) {
    const dx = tx - t.x, dy = ty - t.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    t.x      += (dx/dist) * speed;
    t.y      += (dy/dist) * speed;
    t.isMoving = true;
    t.dir      = dx > 0 ? 1 : -1;
}

// ─── RANGED BANDIT AI ─────────────────────────────────────────────────────────
//
// The existing _tickAmbushSystem in camp_system.js handles melee bandit AI.
// This layer adds ranged-bandit behaviour: stand off, fire projectiles.
// It runs BEFORE camp_system.js processes the same unit, so if a ranged bandit
// fires here their attackTimer is already at zero and the legacy melee code
// will simply not engage until next tick.
//
function _runRangedBanditAI(CE, dt) {
    CE.ambushUnits.forEach(b => {
        if (!b.combatRole || !b.combatRole.isRanged) return;
        if ((b.hp || 0) <= 0) return;
        if (b.ammo <= 0) return; // Out of ammo → fall into normal melee path

        // Nearest target (player priority if close)
        let nearestTarget = null, nearestDist = Infinity;
        if (typeof player !== "undefined" && (player.hp||0) > 0) {
            const d = Math.hypot(b.x - player.x, b.y - player.y);
            if (d < nearestDist) { nearestDist = d; nearestTarget = { x:player.x, y:player.y, isPlayer:true, ref:player }; }
        }
        CE.troops.forEach(t => {
            if (t.state === "in_tent" || (t.hp||0) <= 0) return;
            const d = Math.hypot(b.x - t.x, b.y - t.y);
            if (d < nearestDist) { nearestDist = d; nearestTarget = { x:t.x, y:t.y, isTroop:true, ref:t }; }
        });
        if (!nearestTarget) return;

        const rMax = b.combatRole.rangedMax || 220;
        const rMin = b.combatRole.rangedMin || 55;

        if (nearestDist < rMin) {
            // Back away
            const dx = b.x - nearestTarget.x, dy = b.y - nearestTarget.y;
            const d = Math.hypot(dx,dy) || 1;
            b.x += (dx/d) * 0.55; b.y += (dy/d) * 0.55;
            b.state = "approach";
        } else if (nearestDist <= rMax) {
            // Stand off and fire
            b.state = "attack";
            b.attackTimer = (b.attackTimer || 0) + dt;
            const shootCooldown = b.combatRole.visType === "crossbow" ? 2.2 : 1.5;
            if (b.attackTimer >= shootCooldown) {
                b.attackTimer = 0;
                b.ammo = Math.max(0, b.ammo - 1);
                _spawnCampProjectile(b, nearestTarget);
            }
        }
        // If beyond rMax the normal chase AI in camp_system.js will move them closer
    });
}

// ─── VARIED BANDIT DRAWING ─────────────────────────────────────────────────
//
// The original camp_system.js draws all bandits as "spearman". We override
// that by drawing ON TOP using each bandit's actual combatRole.visType.
// The original draw (from camp_system.js) is suppressed via surgical patch #10:
//   if (!window._CAMP_COMBAT_ACTIVE) _drawAmbushUnits(ctx);
// So in combat addon mode, only this function draws the bandits.
//
function _drawVariedBandits(ctx) {
    const CE = _CE();
    if (!CE) return;

    CE.ambushUnits.forEach(b => {
        if ((b.hp || 0) <= 0) return;

        const role     = b.combatRole || {};
        const visType  = role.visType || "spearman";
const isMoving = b.state === "approach";
        const isAttack = b.state === "attack";

        if (typeof drawInfantryUnit === "function") {
            drawInfantryUnit(ctx,
                b.x, b.y, isMoving, b.anim,
                "#8d2b0b", visType, isAttack,
                "enemy", role.label || "Bandit",
                false, 60, b.ammo || 0, b, 0); // Pass 'b' directly so _weaponSeed persists!
        } else {
            // Fallback — simple stick figure
            ctx.save(); ctx.translate(b.x, b.y);
            ctx.fillStyle = "#8d2b0b";
            ctx.beginPath(); ctx.arc(0,-12,3.5,0,Math.PI*2); ctx.fill();
            ctx.fillRect(-3,-9,6,9);
            ctx.restore();
        }

        // HP bar
        const barW = 24, barH = 4;
        const pct  = Math.max(0, b.hp / b.maxHp);
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.fillRect(b.x - barW/2, b.y - 32, barW, barH);
        ctx.fillStyle = pct > 0.5 ? "#ff5252" : "#d50000";
        ctx.fillRect(b.x - barW/2, b.y - 32, barW * pct, barH);

        // Role label
        ctx.save();
        ctx.font = "bold 8px Georgia"; ctx.textAlign = "center";
        ctx.fillStyle = "#ff5252";
        ctx.fillText(role.label || "BANDIT", b.x, b.y - 36);
        ctx.restore();
    });
}

// ─── COMBAT DIALOGUE ENGINE ───────────────────────────────────────────────────
let _combatDialogueTimer = 0;

function _enterCombatDialogueMode(CE) {
    // Flush all current dialogues and lock normal spawning
    CE.dialogues.forEach(d => { d.done = true; });
    CE.troops.forEach(t => { t.dialogueId = null; });
    CE.combatDialogueMode = true; // surgical patch #2 added this field
    _combatDialogueTimer = 0;

    // Immediately spawn one urgent shout
    _spawnCombatLine(CE, COMBAT_TALKS);
}

function _tickCombatDialogue(CE, dt) {
    if (!CE.combatDialogueMode) return;
    _combatDialogueTimer += dt;
    // New combat shout every 5-9 s
    if (_combatDialogueTimer > 5 + Math.random() * 4) {
        _combatDialogueTimer = 0;
        _spawnCombatLine(CE, COMBAT_TALKS);
    }
}

function _leaveCombatDialogueMode(CE) {
    CE.combatDialogueMode = false;
    _combatDialogueTimer  = 0;
    // Spawn a short post-combat reaction exchange
    setTimeout(() => {
        if (!window.inCampMode) return;
        _spawnCombatLine(CE, POSTCOMBAT_TALKS);
    }, 2200);
}

function _spawnCombatLine(CE, pool) {
    // Pick two live troops
    const cands = CE.troops.filter(t => t.hp > 0 && t.state !== "in_tent" && t.dialogueId === null);
    if (cands.length < 2) return;
    cands.sort(() => Math.random() - 0.5);
    const ta = cands[0], tb = cands[1];

    const conv = pool[Math.floor(Math.random() * pool.length)];
    const did  = CE._nextDialogueId++;

    CE.dialogues.push({
        id: did, ta: ta.id, tb: tb.id,
        lines: conv, lineIdx: 0,
        lineTimer: 110 + conv[0].length * 3.5,
        done: false,
        _isCombatLine: true,
    });

    ta.dialogueId = did;
    tb.dialogueId = did;
    // During combat lines, troops do NOT freeze into TALK state — they keep fighting.
    // Post-combat lines DO freeze them (normal TALK state).
    if (pool === POSTCOMBAT_TALKS) {
        ta.state = "talk";
        tb.state = "talk";
    }
}

// ─── PUBLIC HOOK FUNCTIONS ────────────────────────────────────────────────────
//
// These are called by camp_system.js via the surgical patch points.
//

window._CAMP_COMBAT_ACTIVE = false;

window.campCombatOnTrigger = function () {
    const CE = _CE();
    if (!CE) return;

    window._CAMP_COMBAT_ACTIVE = true;
    _campProjs = []; // clear any stale projectiles

    // --- NEW: Disable Pack Up Button ---
    const pbtn = document.getElementById("packup-btn");
    if (pbtn) {
        pbtn.disabled = true;
        pbtn.textContent = "⚠️ UNDER ATTACK!";
        pbtn.style.opacity = "0.5";
    }

    // 1. Snapshot what troops were doing so we can restore them after
    _snapshotTroopStates(CE);

    // 2. Replace the basic bandit spawn with the varied version
    _rebuildBanditsWithVariety(CE);

    // 3. Release chair claims — everyone stands up for battle
    CE.troops.forEach(t => {
        if (t._chairTarget) {
            if (t._chairTarget._occupiedBy === t.id) t._chairTarget._occupiedBy = null;
            t._chairTarget   = null;
            t._chairSitTimer = 0;
        }
        t.attackTimer = 0;
    });

    // 4. Switch to combat dialogue
    _enterCombatDialogueMode(CE);
};

window.campCombatOnVictory = function () {
    const CE = _CE();
    if (!CE) return;

    window._CAMP_COMBAT_ACTIVE = false;
    _campProjs = []; // clear all projectiles on victory

    // --- NEW: Re-enable Pack Up Button ---
    const pbtn = document.getElementById("packup-btn");
    if (pbtn && !CE.packingUp) {
        pbtn.disabled = false;
        pbtn.textContent = "📦 PACK UP CAMP";
        pbtn.style.opacity = "1";
    }
    // Regroup troops after a short delay
    setTimeout(() => {
        if (!window.inCampMode) return;
        _restoreTroopStates(_CE());
    }, 1400);

    // Resume normal dialogue after regrouping
    _leaveCombatDialogueMode(CE);
};

// Hook [C] — Called each frame from _campTick() in camp_system.js
window.campCombatTick = function (dt) {
    const CE = _CE();
    if (!CE || !window.inCampMode) return;

    if (CE.ambushActive) {
        // ── ACTIVE COMBAT ───────────────────────────────────────────────────
        _runRangedBanditAI(CE, dt);     // ranged bandits stand off and fire
        _runTroopCombatAI(CE, dt);      // ALL troops charge or fire (overrides legacy 70 px gate)
        _updateCampProjectiles(dt);     // move and resolve projectiles
        _tickCombatDialogue(CE, dt);    // spawn periodic combat shouts
    } else {
        // ── PEACEFUL CAMP ───────────────────────────────────────────────────
        _updateChairSitting(CE, dt);    // random sit/stand on chairs
    }
};

// Hook [D] — Called from inside the world-space block of _campRender() in camp_system.js
// Runs AFTER _drawAmbushUnits, which is suppressed by surgical patch #10 during combat.
window.campCombatRender = function (ctx) {
    const CE = _CE();
    if (!CE || !ctx) return;
 

    // 2. Draw seated-on-chair indicator (subtle shadow under the troop)
    CE.troops.forEach(t => {
        if (!t._chairTarget || t.state !== "sit") return;
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle   = "#1a1005";
        ctx.beginPath();
        ctx.ellipse(t.x, t.y + 1, 9, 4, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    });

    // 3. Draw varied bandits (replaces the uniform "spearman" draw from camp_system.js)
    if (CE.ambushActive || CE.ambushUnits.some(b => b.hp > 0)) {
        _drawVariedBandits(ctx);
    }

    // 4. Draw camp projectiles (arrows, bolts, rocks arcing through camp)
    _renderCampProjectiles(ctx);
};

// ─── PATCH window.launchCamp ─────────────────────────────────────────────────
//
// Wraps the existing launchCamp to inject chairs and reset addon state.
// Runs AFTER the original, so CE is already fully populated.
//
(function () {
    const _orig = window.launchCamp;
    if (!_orig) {
        console.warn("[CampCombat] window.launchCamp not found — will retry in 900 ms.");
        setTimeout(() => {
            const _orig2 = window.launchCamp;
            if (_orig2) {
                window.launchCamp = _wrapLaunchCamp(_orig2);
            }
        }, 900);
        return;
    }
    window.launchCamp = _wrapLaunchCamp(_orig);
})();

function _wrapLaunchCamp(originalFn) {
    return function () {
        originalFn.apply(this, arguments);
        const CE = _CE();
        if (!CE) {
            console.warn("[CampCombat] _CAMP_CE not available after launchCamp — surgical patch #1 missing?");
            return;
        }
        // Fresh addon state
        _campProjs             = [];
        _chairDecos            = [];
        _troopSnapshots        = {};
        window._CAMP_COMBAT_ACTIVE = false;
        _combatDialogueTimer   = 0;
        CE.combatDialogueMode  = false;

        // Inject chairs
        _addChairsToDecos(CE);
        console.log(`[CampCombat] Addon ready — ${_chairDecos.length} chairs placed in Tier ${CE.tier} camp.`);
    };
}

// ─── INIT LOG ─────────────────────────────────────────────────────────────────
console.log("[CampCombat] camp_system_combat.js loaded and waiting for launchCamp().");

})(); // end IIFE


// ============================================================================
// ═══════════════════  HOOKING GUIDE  ════════════════════════════════════════
// ============================================================================
//
//  Load order in your HTML:
//
//    <script src="troop_system.js"></script>
//    <script src="troop_draw.js"></script>
//    <script src="battlefield_logic.js"></script>
//    <script src="camp_system.js"></script>       ← PATCHED (10 edits below)
//    <script src="camp_system_combat.js"></script> ← ADD THIS AFTER camp_system
//    <script src="update.js"></script>
//    <script src="infscript.js"></script>
//    ...
//
// ─────────────────────────────────────────────────────────────────────────────
// PATCH 1 — Expose CE on window so camp_system_combat.js can read/write it.
//
//   Location: camp_system.js, line 84 (the line AFTER the closing `};` of
//             the CE = { ... } object literal).
//
//   ADD THIS LINE:
//     window._CAMP_CE = CE;   // COMBAT ADDON: exposes state to camp_system_combat.js
//

// PATCH 2 — Add combatDialogueMode flag to CE's initial definition.
//
//   Location: camp_system.js, inside the CE = { ... } object literal (around
//             line 83), add one key before the final `};`:
//
//     combatDialogueMode: false,   // COMBAT ADDON: true during ambush dialogue override
//
// ─────────────────────────────────────────────────────────────────────────────
// PATCH 3 — Gate normal dialogue spawning during combat.
//
//   Location: camp_system.js, _updateCampTroops() function, line ≈1468.
//
//   FIND:
//     if (CE.dialogues.length < 5 && Math.random() < 0.015) {
//
//   REPLACE WITH:
//     if (!CE.combatDialogueMode && CE.dialogues.length < 5 && Math.random() < 0.015) {
//
// ─────────────────────────────────────────────────────────────────────────────
// PATCH 4 — Guard _tryStartDialogue against running during combat.
//
//   Location: camp_system.js, top of _tryStartDialogue() function, line ≈1532.
//
//   ADD AS FIRST LINE of the function body:
//     if (CE.combatDialogueMode) return;  // COMBAT ADDON: no normal chat during ambush
//
// ─────────────────────────────────────────────────────────────────────────────
// PATCH 5 — Disable the legacy 70 px proximity gate so camp_system_combat.js
//           handles all troop-fight-back logic with full-camp engagement.
//
//   Location: camp_system.js, _tickAmbushSystem(), inside the
//             "Camp troops fight back" CE.troops.forEach block (line ≈1757).
//
//   FIND the opening of the forEach callback:
//     CE.troops.forEach(t => {
//         if (t.state === TROOP_STATES.IN_TENT || (t.hp || 0) <= 0) return;
//
//   ADD ONE LINE immediately after those two existing guards:
//         if (window._CAMP_COMBAT_ACTIVE) return;  // COMBAT ADDON: handled by campCombatTick
//
// ─────────────────────────────────────────────────────────────────────────────
// PATCH 6 — Call the trigger hook at the end of _triggerAmbush().
//
//   Location: camp_system.js, _triggerAmbush(), line ≈1830 (just before the
//             closing `}` of the function).
//
//   ADD:
//     // COMBAT ADDON: notify camp_system_combat.js — it will replace ambushUnits
//     if (typeof window.campCombatOnTrigger === "function") window.campCombatOnTrigger();
//
// ─────────────────────────────────────────────────────────────────────────────
// PATCH 7 — Call the victory hook when the ambush is declared repelled.
//
//   Location: camp_system.js, _tickAmbushSystem(), right after the line
//             `CE.ambushActive = false;` in the ambushUnits.length === 0 block
//             (line ≈1672).
//
//   ADD:
//     // COMBAT ADDON: notify camp_system_combat.js to regroup troops and restore dialogue
//     if (typeof window.campCombatOnVictory === "function") window.campCombatOnVictory();
//
// ─────────────────────────────────────────────────────────────────────────────
// PATCH 8 — Drive camp_system_combat.js logic each frame from _campTick().
//
//   Location: camp_system.js, _campTick(), right after the line
//             `_tickAmbushSystem(dt);` (line ≈2210).
//
//   ADD:
//     if (typeof window.campCombatTick === "function") window.campCombatTick(dt);
//
// ─────────────────────────────────────────────────────────────────────────────
// PATCH 9 — Inject the render hook inside the world-space block of _campRender().
//
//   Location: camp_system.js, _campRender(), right AFTER this line (≈2302):
//             if (CE.ambushActive || CE.ambushUnits.length > 0) _drawAmbushUnits(ctx);
//
//   REPLACE THAT ENTIRE LINE WITH:
//     // COMBAT ADDON: suppress original uniform-spearman draw; addon renders varied roles
//     if (!window._CAMP_COMBAT_ACTIVE &&
//         (CE.ambushActive || CE.ambushUnits.length > 0)) _drawAmbushUnits(ctx);
//     if (typeof window.campCombatRender === "function") window.campCombatRender(ctx);
//
//   (This one edit both gates the original draw AND inserts the addon render.)
//
// ─────────────────────────────────────────────────────────────────────────────
// PATCH 10 — (Optional but recommended) Make camp-generated bgCanvas aware of
//            the "chair" deco kind so future static renders work.
//            Chairs in this addon are drawn dynamically, so this patch is a
//            safety net / future-proofing only.
//
//   Location: camp_system.js, _buildBgCanvas(), inside the CE.decos.forEach
//             switch statement (≈line 1052). Find the last `case` before the
//             closing `}` of the switch.
//
//   ADD:
//     case "chair":
//         if (typeof window.campDrawChair === "function") window.campDrawChair(c, d.x, d.y);
//         break;
//
// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY — 10 total edits, all additive (no deletions):
//
//   #1  After line 84   → window._CAMP_CE = CE;
//   #2  Inside CE {}    → combatDialogueMode: false,
//   #3  Line ≈1468      → add !CE.combatDialogueMode && guard on dialogue spawn
//   #4  Line ≈1532      → if (CE.combatDialogueMode) return; at top of _tryStartDialogue
//   #5  Line ≈1757      → if (window._CAMP_COMBAT_ACTIVE) return; in troops fight-back loop
//   #6  Line ≈1830      → campCombatOnTrigger call at end of _triggerAmbush
//   #7  Line ≈1672      → campCombatOnVictory call after CE.ambushActive = false
//   #8  Line ≈2210      → campCombatTick call after _tickAmbushSystem
//   #9  Line ≈2302      → gate _drawAmbushUnits + insert campCombatRender call
//  #10  Line ≈1052      → chair case in bgCanvas switch (optional safety net)
//
// ============================================================================
