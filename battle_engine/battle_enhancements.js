// =============================================================================
//  BATTLE_ENHANCEMENTS_DEBUG.js  —  Verbose proof edition
//  Swap this in place of battle_enhancements.js temporarily to verify all
//  5 systems are firing correctly.  REMOVE or swap back to the release version
//  before shipping — the logging is intentionally heavy.
// =============================================================================

const BE = {
    ANTI_LARGE_MODIFIER:       0.75,
    CHARGE_DMG_PER_POINT:      0.50,
    CHARGE_MORALE_PER_POINT:   0.40,
    CHARGE_MORALE_CAP:         12,
    COHESION_RADIUS:           80,
    COHESION_MAX_ALLIES:       6,
    COHESION_MORALE_PER_ALLY:  0.003,
    COHESION_DEFENSE_PER_ALLY: 1.0,
    COHESION_MAX_DEFENSE:      6,
};

// ── Debug throttle — each feature group logs at most once every N ms ─────────
const _DBG_COOLDOWN_MS = 1500;  // Raise this if logs are too spammy (e.g. 3000)
const _dbgTimers = { f1:0, f2:0, f3:0, f4:0, f5block:0, f5miss:0, cohesionTick:0 };
function _canLog(key) {
    const now = Date.now();
    if (now - _dbgTimers[key] >= _DBG_COOLDOWN_MS) { _dbgTimers[key] = now; return true; }
    return false;
}

// ── Styled group helpers ──────────────────────────────────────────────────────
function _header(feat, label) {
   // console.group(`%c[BE Feature ${feat}] ${label}`, "color:#fff;background:#1a1a2e;padding:2px 6px;border-radius:3px;font-weight:bold");
}
function _ok(msg)   { 
//console.log(`%c  ✅ ${msg}`, "color:#4ade80"); 
}
function _warn(msg) {
//	console.log(`%c  ⚠️  ${msg}`, "color:#fbbf24"); 
}
function _math(msg) {
//	console.log(`%c  🔢 ${msg}`, "color:#93c5fd;font-family:monospace"); 
}
function _result(msg){
//	console.log(`%c  ➜  ${msg}`, "color:#f472b6;font-weight:bold"); 
}

// =============================================================================
//  FEATURE 1 + 2 + 3 — ENHANCED calculateDamageReceived (with debug logging)
// =============================================================================

const _ANTI_LARGE_RE =
    /\b(camel|horse|mounted|lancer|keshig|cavalry|cataphract|general|commander|player)\b/;

function calculateDamageReceived(rawAttacker, rawDefender, stateString) {
    const states = stateString.split(" ");
    let totalDamage = 0;

    // SURGERY: Normalize inputs (Handles both 'unit' and 'unit.stats' payloads)
    const attackerStats = rawAttacker.stats || rawAttacker;
    const defenderStats = rawDefender.stats || rawDefender;
    
    // ---> FIX 1: Declare the missing variables to prevent the ReferenceError <---
    const attacker = attackerStats;
    const defender = defenderStats;

    // Safely extract coordinates (defaults to 0 if missing to prevent NaN crashes)
    const defX = rawDefender.x !== undefined ? rawDefender.x : 0;
    const defY = rawDefender.y !== undefined ? rawDefender.y : 0;

    const isActuallyRangedAttacking =
        states.includes("ranged_attack") && attackerStats.currentStance === "statusrange";

    // ... (rest of the function continues normally) ...

    let attackValue  = attackerStats.meleeAttack  || 10;
    let defenseValue = defenderStats.meleeDefense || 10;

    attackValue  += ((attackerStats.experienceLevel || 0) * 2);
    defenseValue += ((defenderStats.experienceLevel || 0) * 2);
    
    // ... [Rest of the function continues using attackerStats and defenderStats] ...

    // Feature 3 cohesion defense
    const cohesionDef = defender._cohesionDefenseBonus || 0;
    defenseValue += cohesionDef;

    if (states.includes("flanked")) defenseValue *= 0.5;

    // ── Feature 2: Charge Bonus ───────────────────────────────────────────────
    const chargeBonus = (attacker.chargeBonus != null && !isNaN(attacker.chargeBonus))
        ? Math.max(0, Number(attacker.chargeBonus)) : 0;
    let chargeMoraleDrain = 0;

    if (states.includes("charging")) {
        const chargeDmgAdd = chargeBonus * BE.CHARGE_DMG_PER_POINT;
        attackValue += 15 + chargeDmgAdd;

        chargeMoraleDrain = Math.min(
            chargeBonus * BE.CHARGE_MORALE_PER_POINT,
            BE.CHARGE_MORALE_CAP
        );

        if (_canLog("f2")) {
            _header(2, "CHARGE BONUS TRIGGERED");
            const attackerName = attacker.name || attacker.unitType || "Unknown";
            const defenderName = defender.name || defender.unitType || "Unknown";
            _math(`Attacker: ${attackerName}  |  Defender: ${defenderName}`);
            _math(`chargeBonus stat         = ${chargeBonus}`);
            _math(`Flat charge bonus        = +5`);
            _math(`Scaled damage bonus      = ${chargeBonus} × ${BE.CHARGE_DMG_PER_POINT} = +${chargeDmgAdd.toFixed(2)}`);
            _math(`Total charge attack add  = 15 + ${chargeDmgAdd.toFixed(2)} = +${(15 + chargeDmgAdd).toFixed(2)}`);
            _math(`Morale drain (pre-cap)   = ${chargeBonus} × ${BE.CHARGE_MORALE_PER_POINT} = ${(chargeBonus * BE.CHARGE_MORALE_PER_POINT).toFixed(2)}`);
            _math(`Morale drain (capped)    = min(${(chargeBonus * BE.CHARGE_MORALE_PER_POINT).toFixed(2)}, ${BE.CHARGE_MORALE_CAP}) = ${chargeMoraleDrain.toFixed(2)}`);
            _result(`attackValue is now ${attackValue.toFixed(2)}  |  moraleDrain on hit = ${chargeMoraleDrain.toFixed(2)}`);
            
			console.groupEnd();
        }
    }

    // Firelance
    const safeName    = attacker.unitType || (attacker.stats && attacker.stats.name) || "";
    const safeRole    = (attacker.stats && attacker.stats.role) || attacker.role || "";
    const isFirelance = safeName.includes("Firelance") ||
                        (attacker.name && attacker.name.includes("Firelance"));
    if (isFirelance && attacker.ammo > 0) {
        if (attacker.lastAmmoDrainTick !== Date.now()) {
            attacker.ammo -= 1;
            attacker.lastAmmoDrainTick = Date.now();
        }
        attackValue += 40;
    }

    if (isActuallyRangedAttacking) {
        // Ranged path
        if (states.includes("shielded_front") &&
            Math.random() * 100 < (defender.shieldBlockChance || 0)) {
            return 0;
        }

        let effectiveArmor  = Math.max(0, defender.armor - (attacker.missileAPDamage || 0));
        let baseDamageDealt = Math.max(0, (attacker.missileBaseDamage || 0) - (effectiveArmor * 0.5));
        totalDamage = baseDamageDealt + (attacker.missileAPDamage || 0);

        const isBomb = (safeName === "Bomb" || safeRole === "bomb") ||
                       (attacker.name === "Bomb" || attacker.role === "bomb");
        const isTrebuchet = safeName.includes("Trebuchet") ||
                            (attacker.name && attacker.name.includes("Trebuchet"));

if (isBomb || isTrebuchet) {
            totalDamage *= 3.5;
            const blastRadius  = isTrebuchet ? 50 : 30;
            const maxAoEDamage = isTrebuchet ? 70 : 50;
            if (typeof battleEnvironment !== 'undefined' && battleEnvironment.units) {
                battleEnvironment.units.forEach(u => {
                    // ---> FIX 2: Compare stats to prevent double-damage, and use defX/defY <---
                    if (u.hp <= 0 || u.stats === defender) return; 
                    
                    const dd = Math.hypot(u.x - defX, u.y - defY);
                    
                    if (dd <= blastRadius) {
                        const dropoff = Math.pow(Math.E, -4 * (dd / blastRadius));
                        const splash  = Math.floor(maxAoEDamage * dropoff);
                        if (splash > 0) u.hp -= splash;
                    }
                });
            }
        }

        if (defender.isLarge && attacker.name &&
            attacker.name.toLowerCase().includes("rocket")) {
            totalDamage += 30;
        }

    } else {
        // ── MELEE path ────────────────────────────────────────────────────────
        const hitChance = Math.max(10, Math.min(90, 40 + (attackValue - defenseValue)));

        if (Math.random() * 100 < hitChance) {

            // ── Feature 1: Anti-Large ─────────────────────────────────────────
            const defText = String(
                (defender.unitType || "") + " " +
                (defender.name     || "") + " " +
                (defender.role     || "")
            ).toLowerCase();

            const defenderIsLarge = !!(defender.isLarge || _ANTI_LARGE_RE.test(defText));
            const rawAntiLarge = (attacker.antiLargeDamage != null &&
                                  !isNaN(attacker.antiLargeDamage))
                ? Math.max(0, Number(attacker.antiLargeDamage)) : 0;

            const antiLargeBonus = defenderIsLarge
                ? rawAntiLarge * BE.ANTI_LARGE_MODIFIER : 0;

            const legacyBonus = defenderIsLarge ? (attacker.bonusVsLarge || 0) : 0;

            if (_canLog("f1")) {
                _header(1, "ANTI-LARGE DAMAGE CHECK");
                const attackerName = attacker.name || attacker.unitType || "Unknown";
                const defenderName = defender.name || defender.unitType || "Unknown";
                _math(`Attacker: ${attackerName}  |  Defender: ${defenderName}`);
                _math(`Defender text scanned     = "${defText.trim()}"`);
                _math(`Keyword regex match       = ${_ANTI_LARGE_RE.test(defText)}  |  isLarge flag = ${!!defender.isLarge}`);
                _math(`defenderIsLarge result    = ${defenderIsLarge}`);
                _math(`attacker.antiLargeDamage  = ${attacker.antiLargeDamage} (raw) → ${rawAntiLarge} (safe)`);
                _math(`ANTI_LARGE_MODIFIER       = ${BE.ANTI_LARGE_MODIFIER}`);
                _math(`antiLargeBonus            = ${rawAntiLarge} × ${BE.ANTI_LARGE_MODIFIER} = ${antiLargeBonus.toFixed(2)}`);
                _math(`legacyBonusVsLarge        = ${legacyBonus}`);
                if (defenderIsLarge && rawAntiLarge > 0) {
                    _ok(`Anti-large bonus APPLIED: +${antiLargeBonus.toFixed(2)} damage`);
                } else if (!defenderIsLarge) {
                    _warn(`Defender is NOT large — anti-large bonus skipped`);
                } else {
                    _warn(`antiLargeDamage is 0/null — bonus is 0 (safe no-op)`);
                }
                console.groupEnd();
            }

            const weaponDamage = attackValue + antiLargeBonus + legacyBonus;
            totalDamage = Math.max(15, weaponDamage - (defender.armor * 0.3));

            // ── Feature 2 morale drain on confirmed hit ───────────────────────
            if (chargeMoraleDrain > 0) {
                const moraleBefore = defender.stats?.morale ?? defender.morale ?? "n/a";
                if (typeof defender.morale === "number") {
                    defender.morale = Math.max(0, defender.morale - chargeMoraleDrain);
                }
                if (defender.stats && typeof defender.stats.morale === "number") {
                    defender.stats.morale = Math.max(0, defender.stats.morale - chargeMoraleDrain);
                }
                const moraleAfter = defender.stats?.morale ?? defender.morale ?? "n/a";
                if (_canLog("f2")) {
                    _header(2, "CHARGE MORALE DRAIN APPLIED");
                    _math(`Defender morale before = ${moraleBefore}`);
                    _math(`Morale drain           = -${chargeMoraleDrain.toFixed(2)}`);
                    _result(`Defender morale after  = ${moraleAfter}`);
                    console.groupEnd();
                }
            }

            // ── Log full melee math summary ───────────────────────────────────
            if (_canLog("f1") || _canLog("f2")) {
                _header("1+2", "MELEE DAMAGE SUMMARY");
                _math(`attackValue (final)  = ${attackValue.toFixed(2)}`);
                _math(`defenseValue (final) = ${defenseValue.toFixed(2)}  (cohesion +${cohesionDef})`);
                _math(`hitChance            = max(10, min(90, 40 + (${attackValue.toFixed(1)} - ${defenseValue.toFixed(1)}))) = ${hitChance.toFixed(1)}%`);
                _math(`weaponDamage         = ${attackValue.toFixed(2)} + ${antiLargeBonus.toFixed(2)} (antiLarge) + ${legacyBonus} (legacy) = ${weaponDamage.toFixed(2)}`);
                _math(`armorReduction       = ${defender.armor} × 0.3 = ${(defender.armor * 0.3).toFixed(2)}`);
                _math(`totalDamage          = max(15, ${weaponDamage.toFixed(2)} - ${(defender.armor * 0.3).toFixed(2)}) = ${totalDamage.toFixed(2)}`);
                if (attacker.stamina < 30) { _warn(`Stamina penalty applied (stamina=${attacker.stamina}): ×0.7`); }
                _result(`FINAL DAMAGE = ${Math.floor(attacker.stamina < 30 ? totalDamage * 0.7 : totalDamage)}`);
                console.groupEnd();
            }
        }
    }

    if (attacker.stamina < 30) totalDamage *= 0.7;
    return Math.floor(totalDamage);
}


// =============================================================================
//  FEATURE 3 — COHESION BONUS (with periodic summary log)
// =============================================================================

function applyCohesionBonuses(units) {
    if (!units || units.length === 0) return;

    const alive = units.filter(u => u && u.hp > 0 && !u.isDummy && u.stats);
    let debugEntries = [];

    for (let i = 0; i < alive.length; i++) {
        const unit = alive[i];
        let allyCount = 0;

        for (let j = 0; j < alive.length; j++) {
            if (i === j) continue;
            const other = alive[j];
            if (other.side !== unit.side) continue;
            if (Math.hypot(unit.x - other.x, unit.y - other.y) <= BE.COHESION_RADIUS) {
                allyCount++;
                if (allyCount >= BE.COHESION_MAX_ALLIES) break;
            }
        }

        const defenseBonus = Math.min(
            allyCount * BE.COHESION_DEFENSE_PER_ALLY,
            BE.COHESION_MAX_DEFENSE
        );
        const moraleGain = allyCount * BE.COHESION_MORALE_PER_ALLY;

        unit.stats._cohesionDefenseBonus = defenseBonus;

        if (allyCount > 0) {
            if (typeof unit.stats.morale === "number") {
                unit.stats.morale = Math.min(20, unit.stats.morale + moraleGain);
            }
            if (typeof unit.morale === "number") {
                unit.morale = Math.min(20, unit.morale + moraleGain);
            }
        }

        // Collect sample entries for the periodic log (only show units with allies)
        if (allyCount > 0 && debugEntries.length < 5) {
            debugEntries.push({
                name:    unit.unitType || unit.stats?.name || `unit_${i}`,
                side:    unit.side,
                allies:  allyCount,
                defBonus: defenseBonus,
                moraleGain: moraleGain.toFixed(5),
                morale:  (unit.stats?.morale ?? "?").toFixed ? (unit.stats.morale).toFixed(2) : "?",
            });
        }
    }

    // Periodic summary — fires every COHESION_LOG_INTERVAL ms
    if (_canLog("cohesionTick") && debugEntries.length > 0) {
        _header(3, `COHESION TICK — ${debugEntries.length} sample units (radius=${BE.COHESION_RADIUS}px)`);
        _math(`Formula: defBonus = min(allies × ${BE.COHESION_DEFENSE_PER_ALLY}, ${BE.COHESION_MAX_DEFENSE})`);
        _math(`Formula: moraleGain/tick = allies × ${BE.COHESION_MORALE_PER_ALLY}`);
       
	   console.table(debugEntries.map(e => ({
            "Unit":          e.name,
            "Side":          e.side,
            "Nearby Allies": e.allies,
            "Def Bonus":     `+${e.defBonus}`,
            "Morale +/tick": e.moraleGain,
            "Morale Now":    e.morale,
        })));
		
        _ok(`These defense bonuses are injected into calculateDamageReceived as defender._cohesionDefenseBonus`);
        console.groupEnd();
    }
}

(function _hookCohesion() {
    if (typeof updateBattleUnits !== 'function') {
        setTimeout(_hookCohesion, 200);
        return;
    }
    const _origUpdate = updateBattleUnits;
    window.updateBattleUnits = function() {
        if (typeof battleEnvironment !== 'undefined' && battleEnvironment.units) {
            applyCohesionBonuses(battleEnvironment.units);
        }
        _origUpdate();
    };
  //  console.log("%c[BE Feature 3] ✅ Cohesion hook installed on updateBattleUnits", "color:#4ade80;font-weight:bold");
})();


// =============================================================================
//  FEATURE 4 — ENHANCED FLANKING LOGIC (with debug logging)
// =============================================================================

function isFlanked(attacker, defender) {
    if (!attacker || !defender)               return false;
    if (attacker.hp <= 0 || defender.hp <= 0) return false;
    if (attacker.isDummy || defender.isDummy)  return false;

    let fx, fy;
    let facingSource = "";

    const facingTarget = defender.target;
    if (facingTarget && facingTarget.hp > 0 && !facingTarget.isDummy) {
        fx = facingTarget.x - defender.x;
        fy = facingTarget.y - defender.y;
        facingSource = "active target";
    } else {
        const side = defender.side || (defender.stats && defender.stats.side) || "player";
        fx = 0;
        fy = (side === "player") ? -1 : 1;
        facingSource = `fallback (${side} side → faces ${side === "player" ? "NORTH" : "SOUTH"})`;
    }

    const ax = attacker.x - defender.x;
    const ay = attacker.y - defender.y;
    const fMag = Math.hypot(fx, fy);
    const aMag = Math.hypot(ax, ay);

    if (fMag < 0.001 || aMag < 0.001) return false;

    let cosTheta = (fx * ax + fy * ay) / (fMag * aMag);
    cosTheta = Math.max(-1, Math.min(1, cosTheta));
    const angleDeg = Math.acos(cosTheta) * (180 / Math.PI);
    const flanked  = angleDeg >= 120;

    if (flanked && _canLog("f4")) {
        _header(4, "FLANK DETECTED!");
        const aName = attacker.unitType || attacker.stats?.name || "Attacker";
        const dName = defender.unitType || defender.stats?.name || "Defender";
        _math(`Attacker: ${aName} at (${attacker.x.toFixed(0)}, ${attacker.y.toFixed(0)})`);
        _math(`Defender: ${dName} at (${defender.x.toFixed(0)}, ${defender.y.toFixed(0)})`);
        _math(`Facing source  = ${facingSource}`);
        _math(`Facing vector  = (${fx.toFixed(2)}, ${fy.toFixed(2)})`);
        _math(`Attack vector  = (${ax.toFixed(2)}, ${ay.toFixed(2)})`);
        _math(`dot product    = ${(fx * ax + fy * ay).toFixed(3)}`);
        _math(`cos(θ)         = ${cosTheta.toFixed(4)}`);
        _math(`θ (degrees)    = ${angleDeg.toFixed(1)}°  ← must be ≥ 120° to flank`);
        _result(`✅ FLANKED — defender melee defense will be halved (×0.5)`);
        console.groupEnd();
    }

    return flanked;
}


// =============================================================================
//  FEATURE 5 — DIRECTIONAL SHIELD BLOCK (with debug logging)
// =============================================================================

(function _patchProjectileLoop() {
    if (typeof AICategories === 'undefined') {
        console.warn("[BE Feature 5] AICategories not found — shield patch skipped.");
        return;
    }

    AICategories.processProjectilesAndCleanup = function(battleEnvironment) {
        const THIRTY_SECONDS = 30000;
        const nowTime = Date.now();
        const units   = battleEnvironment.units;

        if (battleEnvironment.groundEffects) {
            battleEnvironment.groundEffects = battleEnvironment.groundEffects
                .filter(g => (nowTime - g.timestamp) < THIRTY_SECONDS);
        }
        units.forEach(u => {
            if (u.stuckProjectiles) {
                u.stuckProjectiles = u.stuckProjectiles
                    .filter(sp => (nowTime - sp.timestamp) < THIRTY_SECONDS);
            }
        });

        for (let i = battleEnvironment.projectiles.length - 1; i >= 0; i--) {
            const p = battleEnvironment.projectiles[i];
            let prevX = p.x, prevY = p.y;
            p.x += p.vx; p.y += p.vy;

            const role = p.attackerStats ? p.attackerStats.role : "";
            const name = p.attackerStats ? p.attackerStats.name : "";

            const isJavelin = name === "Javelinier";
            const isBolt    = role === "crossbow" || role === "crossbowman";
            const isArrow   = role === "archer"   || role === "horse_archer";
            const isSlinger = name === "Slinger";
            const isRocket  = (p.projectileType === "rocket") ||
                              (p.attackerStats?.name && p.attackerStats.name.includes("Rocket"));
            const isBomb    = role === "bomb" || name === "Bomb";

            const distFlown = Math.hypot(p.x - p.startX, p.y - p.startY);
            const wLimit    = typeof BATTLE_WORLD_WIDTH  !== 'undefined' ? BATTLE_WORLD_WIDTH  : 2000;
            const hLimit    = typeof BATTLE_WORLD_HEIGHT !== 'undefined' ? BATTLE_WORLD_HEIGHT : 2000;

            if (distFlown > p.maxRange ||
                p.x < -200 || p.x > wLimit + 200 ||
                p.y < -200 || p.y > hLimit + 200) {

                if (isJavelin || isBolt || isArrow || isSlinger || isRocket || isBomb) {
                    if (!battleEnvironment.groundEffects) battleEnvironment.groundEffects = [];
                    if (battleEnvironment.groundEffects.length < 400) {
                        const effectType = isJavelin ? "javelin" : isBolt ? "bolt"
                            : isSlinger ? "stone" : isRocket ? "rocket"
                            : isBomb ? "bomb_crater" : "arrow";
                        battleEnvironment.groundEffects.push({
                            type: effectType,
                            x: p.x + (Math.random() - 0.5) * 18,
                            y: p.y + (Math.random() - 0.5) * 18,
                            angle: Math.atan2(p.vy, p.vx) + (Math.random() - 0.5) * 0.9,
                            timestamp: Date.now()
                        });
                    }
                }
                if (isBomb) BattleAudio.playBombChain(p.x, p.y, 1);
                else if (isRocket || p.projectileType === "firelance") BattleAudio.playFirelanceBurst(p.x, p.y, false);
                else BattleAudio.playProjectileHit(p.x, p.y, "miss");

                battleEnvironment.projectiles.splice(i, 1);
                continue;
            }

            let hitMade = false;

            for (let j = 0; j < units.length; j++) {
                const u = units[j];
                if (u.hp <= 0 || u.side === p.side || u.isFalling) continue;

                const hitbox = (u.stats && u.stats.isLarge) ? 16 : 8;
                const isHit  = lineIntersectsCircle(prevX, prevY, p.x, p.y, u.x, u.y, hitbox);
                if (!isHit) continue;

                if (!p.hitList) p.hitList = new Set();
                if (p.hitList.has(u.id || u)) continue;
// ── FEATURE 5: Direction check ────────────────────────────────
                const hasShield = u.stats &&
                    (u.stats.shieldBlockChance > 0 || u.stats.hasShield === true);

                let rangedStateStr = "ranged_attack";
                let shieldDirectionResult = "no shield";

                if (hasShield) {
                    // SURGERY: True Directional Shield Block
                    let hitsFront = false;

                    if (u.target && u.target.hp > 0 && !u.target.isDummy) {
                        // If the unit is fighting someone, they are facing their target.
                        let faceDx = u.target.x - u.x;
                        let faceDy = u.target.y - u.y;
                        
                        // Dot product to determine if the projectile vector opposes the facing vector
                        let dotProduct = (faceDx * p.vx) + (faceDy * p.vy);
                        hitsFront = dotProduct < 0; // If negative, the projectile is flying INTO their face
                    } else {
                        // Fallback: If idle, rely on rank direction (1 = facing South, -1 = facing North)
                        let facingDir = u.direction || (u.side === "player" ? -1 : 1);
                        hitsFront = (facingDir === -1 && p.vy > 0) || (facingDir === 1 && p.vy < 0);
                    }

                    // --- DON'T FORGET THIS PART! ---
                    // This is what actually tells the damage calculator the shield worked
                    if (hitsFront) {
                        rangedStateStr = "ranged_attack shielded_front";
                        shieldDirectionResult = `✅ FRONT HIT — shielded_front injected`;
                    } else {
                        shieldDirectionResult = `❌ REAR/SIDE HIT — shield cannot block`;
                    }
                
                }

                const inSiege    = typeof inSiegeBattle !== 'undefined' && inSiegeBattle;
                const pierceChance = inSiege ? 0.30 : 0.10;
                const doesPierce   = Math.random() < pierceChance;

                const dmg = typeof calculateDamageReceived === 'function'
                    ? calculateDamageReceived(p.attackerStats, u.stats, rangedStateStr) : 1;

                const wasBlocked = (dmg === 0 && rangedStateStr.includes("shielded_front"));

                // ── Debug log for shield events ───────────────────────────────
                if (hasShield) {
                    const logKey = wasBlocked ? "f5block" : "f5miss";
                    if (_canLog(logKey)) {
                        _header(5, wasBlocked ? "SHIELD BLOCK!" : "SHIELD — NO BLOCK");
                        const uName  = u.unitType || u.stats?.name || "Defender";
                        const pType  = isArrow ? "Arrow" : isBolt ? "Bolt" : isJavelin ? "Javelin"
                                      : isRocket ? "Rocket" : isSlinger ? "Stone" : "Projectile";
                        _math(`Defender: ${uName} (side="${u.side}")`);
                        _math(`Projectile type  = ${pType}`);
                        _math(`Projectile vy    = ${p.vy.toFixed(3)}`);
                        _math(`Direction rule   = player blocks vy>0 | enemy blocks vy<0`);
                        _math(`Direction check  = vy=${p.vy.toFixed(3)} for side="${u.side}" → ${shieldDirectionResult}`);
                        _math(`shieldBlockChance = ${u.stats.shieldBlockChance || 0}%`);
                        _math(`stateString passed to damage = "${rangedStateStr}"`);
                        if (wasBlocked) {
                            _ok(`BLOCKED! dmg=0 → playing projectile_hit_wood/wood2 sound`);
                        } else if (rangedStateStr.includes("shielded_front")) {
                            _warn(`Direction OK but RNG didn't roll a block (dmg=${dmg}) — arrow gets through`);
                        } else {
                            _warn(`Hit from wrong direction — shielded_front NOT injected — no block possible`);
                        }
                        _result(`Final dmg dealt = ${dmg}`);
                        console.groupEnd();
                    }
                }

                u.hp -= dmg;
                p.hitList.add(u.id || u);

                if (!doesPierce) {
                    hitMade = true;
                    if (isJavelin || isBolt || isArrow || isRocket) {
                        if (!u.stuckProjectiles) u.stuckProjectiles = [];
                        if (u.stuckProjectiles.length < 4) {
                            const efType = isJavelin ? "javelin" : isBolt ? "bolt"
                                : isRocket ? "rocket" : "arrow";
                            u.stuckProjectiles.push({
                                type: efType,
                                offsetX: p.x - u.x, offsetY: p.y - u.y,
                                angle: Math.atan2(p.vy, p.vx),
                                timestamp: Date.now()
                            });
                        }
                    }
                }

                if (isBomb) {
                    if (!battleEnvironment.groundEffects) battleEnvironment.groundEffects = [];
                    battleEnvironment.groundEffects.push({
                        type: "bomb_crater", x: p.x, y: p.y, angle: 0, timestamp: Date.now()
                    });
                }

                // EXP
                const attackerUnit = units.find(a => a.stats === p.attackerStats);
                if (attackerUnit && attackerUnit.side === "player" && p.attackerStats.gainExperience) {
                    let baseExp = attackerUnit.isCommander ? 0.05 : 0.35;
                    if (u.hp <= 0) baseExp *= 3;
                    p.attackerStats.gainExperience(baseExp);
                    if (attackerUnit.isCommander && typeof gainPlayerExperience === 'function') {
                        gainPlayerExperience(baseExp);
                    }
                }

                // Audio
                if (isBomb) {
                    BattleAudio.playBombChain(p.x, p.y, 1);
                } else if (wasBlocked) {
                    BattleAudio.playProjectileHit(p.x, p.y, "shield");   // → projectile_hit_wood
                } else {
                    const armorType = (u.stats && u.stats.armor > 10) ? "armor" : "flesh";
                    BattleAudio.playProjectileHit(p.x, p.y, dmg > 0 ? armorType : "shield");
                }

                if (!doesPierce) break;
            }

            // Structure collision — unchanged
            const minStickDist    = (isArrow || isBolt) ? 100 : 30;
            const canHitStructure = distFlown >= minStickDist;

            if (!hitMade && canHitStructure &&
                typeof BATTLE_TILE_SIZE !== 'undefined' && battleEnvironment.grid) {

                const ptx  = Math.floor(p.x / BATTLE_TILE_SIZE);
                const pty  = Math.floor(p.y / BATTLE_TILE_SIZE);
                const tile = (battleEnvironment.grid[ptx] &&
                              battleEnvironment.grid[ptx][pty] !== undefined)
                             ? battleEnvironment.grid[ptx][pty] : -1;

                const hitsWall    = (tile === 6 || tile === 7);
                const hitsWalkway = (tile === 8 || tile === 12);
                const impactAngle = Math.atan2(p.vy, p.vx);

                if (hitsWall || hitsWalkway) {
                    const stickChance = p.side === "enemy" ? 0.05 : (hitsWall ? 0.10 : 0.20);
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
                                for (const twr of window.cityTowerPositions) {
                                    if (Math.hypot(twr.pixelX - p.x, twr.pixelY - p.y) < 90) {
                                        if ((twr.hp ?? 300) <= 0) continue;
                                        twr.hp = (twr.hp ?? 300) - 70;
                                        if (twr.hp < 0) twr.hp = 0;
                                    }
                                }
                            }
                            BattleAudio.playBombChain(p.x, p.y, 1);
                        } else if (p.projectileType === "firelance" ||
                                   (p.projectileType && p.projectileType.includes("Firelance"))) {
                            if (battleEnvironment.groundEffects.length < 500) {
                                battleEnvironment.groundEffects.push({
                                    type: "scorch_wall", x: p.x, y: p.y, angle: impactAngle,
                                    stuckOnStructure: true, structureTile: tile, timestamp: Date.now()
                                });
                            }
                        } else if (isJavelin || isBolt || isRocket || isSlinger || isArrow) {
                            const efType = isJavelin ? "javelin" : isBolt ? "bolt"
                                : isRocket ? "rocket" : isSlinger ? "stone" : "arrow";
                            if (battleEnvironment.groundEffects.length < 500) {
                                battleEnvironment.groundEffects.push({
                                    type: efType, x: p.x, y: p.y, angle: impactAngle,
                                    stuckOnStructure: true, structureTile: tile, timestamp: Date.now()
                                });
                            }
                        }
                    }
                }

                if (!hitMade && typeof siegeEquipment !== 'undefined') {
                    const hitModifier = (p.side === "player") ? 0.05 : 1.0;
                    if (siegeEquipment.ladders) {
                        for (const ldr of siegeEquipment.ladders) {
                            if (!ldr.isDeployed || ldr.hp <= 0) continue;
                            if (Math.hypot(p.x - ldr.x, p.y - ldr.y) < 16) {
                                if (Math.random() <= ((p.side === "player") ? 0.05 : 0.95)) {
                                    hitMade = true;
                                    ldr.hp -= isBomb ? 60 : 12;
                                    if ((isJavelin || isBolt || isArrow) &&
                                        battleEnvironment.groundEffects &&
                                        battleEnvironment.groundEffects.length < 500) {
                                        const efType = isJavelin ? "javelin" : isBolt ? "bolt" : "arrow";
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
                        for (const ram of siegeEquipment.rams) {
                            if (ram.hp <= 0) continue;
                            if (Math.hypot(p.x - ram.x, p.y - ram.y) < 20) {
                                if (Math.random() <= (0.60 * hitModifier)) {
                                    hitMade = true;
                                    ram.hp -= isBomb ? 80 : 10;
                                    if (battleEnvironment.groundEffects &&
                                        battleEnvironment.groundEffects.length < 500) {
                                        const efType = isJavelin ? "javelin" : isBolt ? "bolt"
                                            : isArrow ? "arrow" : "stone";
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
            }

            if (hitMade) battleEnvironment.projectiles.splice(i, 1);
        }
    };

   // console.log("%c[BE Feature 5] ✅ Directional shield projectile loop patched", "color:#4ade80;font-weight:bold");
})();


// =============================================================================
//  BOOT SUMMARY
// =============================================================================
console.group("%c[BATTLE_ENHANCEMENTS_DEBUG] Boot Report", "color:#fff;background:#7c3aed;padding:3px 8px;border-radius:4px;font-weight:bold;font-size:13px");
console.log("%c All 5 systems loaded. Logs throttled to once every " + _DBG_COOLDOWN_MS + "ms per feature.", "color:#a78bfa");
console.log("%c What to look for in the console:", "color:#e2e8f0;font-weight:bold");
console.log("  %c[BE Feature 1]%c Anti-large bonus — fires on melee hits vs cavalry/mounted/etc.", "color:#4ade80;font-weight:bold","color:#ccc");
console.log("  %c[BE Feature 2]%c Charge bonus    — fires when stateString includes 'charging'",    "color:#fb923c;font-weight:bold","color:#ccc");
console.log("  %c[BE Feature 3]%c Cohesion table  — console.table() every ~1.5s showing nearby-ally data","color:#38bdf8;font-weight:bold","color:#ccc");
console.log("  %c[BE Feature 4]%c Flank detected  — logs angle math when ≥120° flank is confirmed","color:#a78bfa;font-weight:bold","color:#ccc");
console.log("  %c[BE Feature 5]%c Shield block    — logs vy direction check and block/miss result","color:#f472b6;font-weight:bold","color:#ccc");
console.log("%c Tuning knobs (BE object):", "color:#e2e8f0;font-weight:bold");

console.table({
    "ANTI_LARGE_MODIFIER":       BE.ANTI_LARGE_MODIFIER,
    "CHARGE_DMG_PER_POINT":      BE.CHARGE_DMG_PER_POINT,
    "CHARGE_MORALE_PER_POINT":   BE.CHARGE_MORALE_PER_POINT,
    "CHARGE_MORALE_CAP":         BE.CHARGE_MORALE_CAP,
    "COHESION_RADIUS":           BE.COHESION_RADIUS,
    "COHESION_MAX_ALLIES":       BE.COHESION_MAX_ALLIES,
    "COHESION_MORALE_PER_ALLY":  BE.COHESION_MORALE_PER_ALLY,
    "COHESION_DEFENSE_PER_ALLY": BE.COHESION_DEFENSE_PER_ALLY,
    "COHESION_MAX_DEFENSE":      BE.COHESION_MAX_DEFENSE,
});
console.groupEnd();
