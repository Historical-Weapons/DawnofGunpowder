// ============================================================================
// EMPIRE OF THE 13TH CENTURY - EXTERNAL SFX MANAGER (RAW LIST)
// Hooks into the global AudioManager to handle MP3 sound effects safely
// ============================================================================

const RAW_SFX_LIST = {
    "melee_parry": "music/sfx/melee_parry.mp3",
    "melee_parry2": "music/sfx/melee_parry2.mp3",
    "melee_swing3": "music/sfx/melee_Swing_3.mp3",
    "melee_swing2": "music/sfx/melee_swing2.mp3",
    "melee_swing": "music/sfx/melee_swing.mp3",
    "firelance_aftermath": "music/sfx/firelance_aftermath_fire_brief.mp3",
    "projectile_hit_wood2": "music/sfx/projectile_hit_wood2.mp3",
    "projectile_hit_wood": "music/sfx/projectile_hit_wood.mp3",
    "jump_outof_water": "music/sfx/jump_outof_water.mp3",
    "jump_intowater": "music/sfx/jump_intowater.mp3",
    "drowning2": "music/sfx/drowning2.mp3",
    "drowning": "music/sfx/drowning.mp3",
    "single_one_rocket_launch": "music/sfx/single_one_rocket_launch.mp3",
    "single_battering_ram_hit": "music/sfx/single_battering_ram_hitsound.mp3",
    "siege_ram_pushing_wheel": "music/sfx/siege_ram_pushing_wheel.mp3",
    "siege_pushing_wheel_long": "music/sfx/siege_pushing_wheel_sound_long.mp3",
    "footstep_wood": "music/sfx/1_footstep_ladder_or_wood_berandomizedforfootsteps.mp3",
    "slinger_release3": "music/sfx/slinger_release3.mp3",
    "slinger_release2": "music/sfx/slinger_release_2.mp3",
    "slinger_release1": "music/sfx/slinger_release1.mp3",
    "polearm_general": "music/sfx/polearm_general_melee.mp3",
    "spear_glaive_swing2": "music/sfx/spear_glaive_swing_melee2.mp3",
    "spear_glaive_stab": "music/sfx/spear_glaive_stab_melee.mp3",
    "bowstring_snap2": "music/sfx/bowstring_snap2.mp3",
    "melee_hit5": "music/sfx/melee_hit5.mp3",
    "horse_canter2": "music/sfx/horse_canter2.mp3",
    "horse_random_5_40": "music/sfx/horse_random_sounds_5-40seconds.mp3",
    "horsetrot1": "music/sfx/horsetrot1.mp3",
    "horse_random_1_30": "music/sfx/horse_random_sounds_1-30seconds.mp3",
    "horse_canter": "music/sfx/horse_canter.mp3",
    "crossbowstring_snap": "music/sfx/crossbowstring_snap.mp3",
    "bowstring_snap": "music/sfx/bowstring_snap.mp3",
    "melee_hit4_long": "music/sfx/melee_hit4_long_duration.mp3",
    "firelance2_hit": "music/sfx/firelance2_hit.mp3",
    "firelance1_hit": "music/sfx/firelance1_hit.mp3",
    "elephant_noise3": "music/sfx/elephant_noise3_random_5-45_seconds.mp3",
    "elephant_noise2": "music/sfx/elephant_noise2_random_1-60_seconds.mp3",
    "elephant_noise1": "music/sfx/elephant_noise_random_1-30_seconds.mp3",
    "camel_noise": "music/sfx/camel_noise_random_1-20_seconds.mp3",
    "melee_hit3": "music/sfx/melee_hit3.mp3",
    "melee_hit2": "music/sfx/melee_hit2.mp3",
    "melee_hit1": "music/sfx/melee_hit1.mp3",
    "coldprojectile_release2": "music/sfx/coldprojectile_release2.mp3",
    "coldprojectile_release1": "music/sfx/coldprojectile_release1.mp3",
    "coldprojectile_hit4": "music/sfx/coldprojectile_hit4.mp3",
    "coldprojectile_hit3": "music/sfx/coldprojectile_hit3.mp3",
    "coldprojectile_hit2": "music/sfx/coldprojectile_hit2.mp3",
    "arrow_miss": "music/sfx/arrow_miss.mp3",
    "coldprojectile_hit1": "music/sfx/coldprojectile_hit1.mp3",
    "bomb_blown4": "music/sfx/bomb_blown4.mp3",
    "bomb_blown3": "music/sfx/bomb_blown3.mp3",
    "bomb_blown2": "music/sfx/bomb_blown2.mp3",
    "bomb_blown1": "music/sfx/bomb_blown1.mp3",
    "footmarch_light": "music/sfx/footmarch_light.mp3",
    "footmarch_heavy": "music/sfx/footmarch_heavy.mp3",
    "gunshot1": "music/sfx/gunshot1.mp3"
};

// ============================================================================
// SOUND EFFECTS SYSTEM
// Pool-based, mobile-adaptive, gate-guarded audio engine.
// ============================================================================

class SoundEffectsSystem {
    constructor() {
        // ── Mobile Detection ────────────────────────────────────────────────
        // Detect low-powered devices to downscale polyphony & pool sizes.
        this._isMobile = (
            /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
            (navigator.maxTouchPoints > 1 && window.innerWidth < 1024)
        );

        // ── Adaptive Limits ─────────────────────────────────────────────────
        // Mobile phones can't handle 24 simultaneous audio decode streams.
        // Dropping to 6 keeps it smooth; 18 is safe for modern desktops.
        this.MAX_CONCURRENT_SFX = this._isMobile ? 6 : 18;

        // Max Audio instances kept alive per sound key.
        // Smaller pool on mobile = less decoded audio held in RAM.
        this._poolMax = this._isMobile ? 2 : 4;

        // Throttle multiplier: all per-call throttleMs values are scaled up on mobile,
        // naturally reducing call density without changing any call-site numbers.
        this._throttleMult = this._isMobile ? 2.5 : 1.0;

        // ── Audio Pool ──────────────────────────────────────────────────────
        // Map<soundKey, Audio[]>
        // Instead of `new Audio(url)` on every play call, we reuse idle instances.
        // This eliminates GC pressure, decode latency, and iOS audio context limits.
        this._pool = new Map();

        // ── State ───────────────────────────────────────────────────────────
        this.sfxVolume = 0.5;             // Overridden by AudioManager.masterSfxVolume at runtime
        this.activeSfxCount = 0;          // How many sounds are currently playing
        this.lastPlayedMap = new Map();   // soundKey → performance.now() of last play (throttle)
        this.list = RAW_SFX_LIST;

        // ── Gate Timestamps ─────────────────────────────────────────────────
        // All SFX are blocked until Date.now() exceeds these values.
        // Set via setSilence() from clearAllSFXForBattle() on battle launch.
        this._globalGateUntil = 0;    // Blocks ALL sfx (including march/mount)
        this._combatGateUntil = 0;    // Blocks ONLY melee, projectile, and gunpowder sfx

        // ── Spatial Listener ────────────────────────────────────────────────
        this.listenerEntity = null;
        this.MAX_HEARING_DISTANCE = this._isMobile ? 800 : 1000;
    }

    // ── Public API ──────────────────────────────────────────────────────────

    setListener(entity) {
        this.listenerEntity = entity;
    }

    /**
     * Called by AudioManager.clearAllSFXForBattle() on every battle launch.
     * Immediately stops all playing sounds and arms two gates:
     *   globalMs  - how long ALL sfx are blocked (brief cleanup window)
     *   combatMs  - how long COMBAT sfx (melee/projectile) are blocked
     *
     * This is the primary fix for the sandbox coordinate ghost-trigger bug.
     * Units are placed at world-map coordinates for a few frames before the
     * battle engine repositions them; this window silences any proximity
     * triggers that fire during that window.
     */
    setSilence(globalMs, combatMs) {
        const now = Date.now();
        this._globalGateUntil  = now + globalMs;
        this._combatGateUntil  = now + combatMs;
        this.stopAll();
        // Debug aid: easy to grep in console
        console.log(`[SfxManager] Gate armed: global=${globalMs}ms, combat=${combatMs}ms`);
    }

    // ── Core Play Function ──────────────────────────────────────────────────

    /**
     * @param {string}  soundKey       - Key from RAW_SFX_LIST
     * @param {number}  [x]            - World X position of source (for spatial cull)
     * @param {number}  [y]            - World Y position of source (for spatial cull)
     * @param {number}  [volMultiplier=1.0]
     * @param {number}  [throttleMs=50]  - Min ms between plays of the same key
     * @param {number}  [pitchVariance=0.1] - +/- % pitch randomness
     * @param {number}  [volVariance=0.1]   - +/- % volume randomness
     * @param {number}  [duration=0]    - If >0, force-stop after this many ms
     */
    play(soundKey, x, y, volMultiplier = 1.0, throttleMs = 50, pitchVariance = 0.1, volVariance = 0.1, duration = 0) {

        // ── GATE CHECKS (fastest-fail first) ────────────────────────────────
        const now = Date.now();
        if (now < this._globalGateUntil) return;           // Battle start blackout
        if (this.activeSfxCount >= this.MAX_CONCURRENT_SFX) return; // Polyphony cap

        // ── SPATIAL CULL ────────────────────────────────────────────────────
        const distVol = this._getDistanceMultiplier(x, y);
        if (distVol <= 0.01) return;

        // ── PER-KEY THROTTLE ────────────────────────────────────────────────
        const perfNow = performance.now();
        const effectiveThrottle = throttleMs * this._throttleMult;
        if (perfNow - (this.lastPlayedMap.get(soundKey) || 0) < effectiveThrottle) return;
        this.lastPlayedMap.set(soundKey, perfNow);

        // ── ACQUIRE FROM POOL ────────────────────────────────────────────────
        const sfx = this._acquireFromPool(soundKey);
        if (!sfx) return; // Pool exhausted at this key's max concurrency

        // ── VOLUME ───────────────────────────────────────────────────────────
        // Read masterSfxVolume fresh each frame (user might adjust mid-battle).
        const masterVol = (typeof AudioManager !== 'undefined' && AudioManager.masterSfxVolume != null)
            ? AudioManager.masterSfxVolume
            : this.sfxVolume;
        const volRand = 1.0 - volVariance + (Math.random() * volVariance * 2);
        sfx.volume = Math.min(1, Math.max(0, masterVol * volMultiplier * distVol * volRand));

        // ── PITCH ────────────────────────────────────────────────────────────
        const pitchRand = 1.0 - pitchVariance + (Math.random() * pitchVariance * 2);
        try { sfx.playbackRate = Math.min(2.0, Math.max(0.5, pitchRand)); } catch(e) {}

        this.activeSfxCount++;

        // ── DURATION CLAMP ────────────────────────────────────────────────────
        // If caller wants the sound cut off at a fixed time, schedule a stop.
        // Skip the fade-out on mobile (setInterval is expensive); just hard-stop.
        let durationTimeout = null;
        if (duration > 0) {
            durationTimeout = setTimeout(() => {
                if (!sfx.paused) {
                    sfx.pause();
                    sfx.currentTime = 0;
                    this._release(sfx);
                }
            }, duration);
        }

        // ── CLEANUP HANDLER ───────────────────────────────────────────────────
        // { once: true } ensures we never double-attach this listener if the
        // audio element gets reused from the pool before 'ended' fired.
        sfx.addEventListener('ended', () => {
            if (durationTimeout) { clearTimeout(durationTimeout); durationTimeout = null; }
            this._release(sfx);
        }, { once: true });

        // ── PLAY ───────────────────────────────────────────────────────────────
        sfx.play().catch(() => {
            // Browser blocked it (autoplay policy, etc.) — release immediately.
            if (durationTimeout) { clearTimeout(durationTimeout); durationTimeout = null; }
            this._release(sfx);
        });
    }

    // ── Pool Management ────────────────────────────────────────────────────

    /**
     * Returns an idle Audio from the pool for this key, or creates a new one
     * if the pool has room.  Returns null if all instances are busy (sound is culled).
     */
    _acquireFromPool(soundKey) {
        const url = this.list[soundKey];
        if (!url) {
            console.warn(`[SfxManager] Key "${soundKey}" not found in RAW_SFX_LIST`);
            return null;
        }

        if (!this._pool.has(soundKey)) this._pool.set(soundKey, []);
        const pool = this._pool.get(soundKey);

        // Find an idle instance (not currently playing).
        for (const a of pool) {
            if (!a._sfxBusy) {
                a._sfxBusy = true;
                a.currentTime = 0;
                return a;
            }
        }

        // No idle instance found — create a new one if under the per-key cap.
        if (pool.length < this._poolMax) {
            const a = new Audio(url);
            a._sfxBusy = true;
            pool.push(a);
            return a;
        }

        // All instances busy and pool is at capacity — cull this sound.
        return null;
    }

    /**
     * Mark an audio element as idle and decrement the global active count.
     * Guard flag prevents double-decrement if both 'ended' and duration timeout fire.
     */
    _release(sfx) {
        if (sfx._sfxReleasing) return; // Double-release guard
        sfx._sfxReleasing = true;

        sfx._sfxBusy = false;
        this.activeSfxCount = Math.max(0, this.activeSfxCount - 1);

        // Clear the guard after a short tick so the element can be reused.
        setTimeout(() => { sfx._sfxReleasing = false; }, 32);
    }

    // ── Spatial Attenuation ───────────────────────────────────────────────

    _getDistanceMultiplier(sourceX, sourceY) {
        if (!this.listenerEntity || sourceX === undefined || sourceY === undefined) return 1.0;

        // Use squared distance to skip sqrt until we know we're in range.
        const dx = sourceX - this.listenerEntity.x;
        const dy = sourceY - this.listenerEntity.y;
        const distSq = dx * dx + dy * dy;
        const maxDistSq = this.MAX_HEARING_DISTANCE * this.MAX_HEARING_DISTANCE;

        if (distSq >= maxDistSq) return 0;

        const ratio = Math.sqrt(distSq) / this.MAX_HEARING_DISTANCE;
        return (1 - ratio) * (1 - ratio); // Quadratic falloff — same feel as before, no sqrt branch on miss
    }

    // ── Master Kill Switch ─────────────────────────────────────────────────

    /**
     * Immediately stops ALL currently playing SFX and returns all pool entries
     * to idle state.  Called automatically by setSilence() and can be called
     * directly when exiting battle.
     */
    stopAll() {
        this._pool.forEach(pool => {
            pool.forEach(sfx => {
                try {
                    if (!sfx.paused) sfx.pause();
                    sfx.currentTime = 0;
                } catch(e) {}
                sfx._sfxBusy = false;
                sfx._sfxReleasing = false;
            });
        });
        this.activeSfxCount = 0;
        this.lastPlayedMap.clear();
    }

    /**
     * Completely destroys all pool entries and frees audio memory.
     * Call when leaving battle entirely (not just between rounds).
     */
    purgePool() {
        this._pool.forEach(pool => {
            pool.forEach(sfx => {
                try {
                    sfx.pause();
                    sfx.removeAttribute('src');
                    sfx.load(); // Forces browser to release decoded audio memory
                } catch(e) {}
            });
        });
        this._pool.clear();
        this.activeSfxCount = 0;
        this.lastPlayedMap.clear();
    }
}

// Global instance — single source of truth for all SFX playback.
const SfxManager = new SoundEffectsSystem();


// ============================================================================
// BATTLEFIELD AUDIO SYSTEM
// High-level wrappers that translate game events → SfxManager calls.
// All combat methods (melee, projectile, gunpowder) check _isCombatBlocked()
// before playing.  Non-combat sounds (march, mount, water) do NOT — they
// can start immediately after the brief global gate window clears.
// ============================================================================

class BattlefieldAudioSystem {
    constructor() {
        // Categorized arrays for random picking
        this.meleeSwings   = ["melee_swing", "melee_swing2", "melee_swing3"];
        this.meleeHits     = ["melee_hit1", "melee_hit2", "melee_hit3", "melee_hit4_long", "melee_hit5"];
        this.meleeParries  = ["melee_parry", "melee_parry2"];
        this.bowSnaps      = ["bowstring_snap", "bowstring_snap2"];
        this.crossbowSnaps = ["crossbowstring_snap", "bowstring_snap2"];
        this.slingers      = ["slinger_release1", "slinger_release2", "slinger_release3"]; // Javelin throws reuse same sfx
        this.coldHits      = ["coldprojectile_hit1", "coldprojectile_hit2", "coldprojectile_hit3", "coldprojectile_hit4"];
        this.bombExplosions = ["bomb_blown1", "bomb_blown2", "bomb_blown3", "bomb_blown4"];
        this.polearms      = ["polearm_general", "spear_glaive_swing2", "spear_glaive_stab"];
        this.firelances    = ["firelance1_hit", "firelance2_hit", "firelance_aftermath"];
    }

    _pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    /**
     * Guard for ALL combat-class sounds (melee, projectile, gunpowder, rockets, bombs).
     * Returns true if the combat gate is still active → caller should return immediately.
     *
     * This is the core fix for the sandbox launch bug:
     * - On battle launch, AudioManager.clearAllSFXForBattle() calls SfxManager.setSilence()
     * - setSilence() arms _combatGateUntil for 3 seconds
     * - Every combat method calls this guard first, preventing any ghost triggers
     *   from stale sandbox world-map coordinates leaking into the battle engine.
     */
    _isCombatBlocked() {
        return Date.now() < SfxManager._combatGateUntil;
    }

    // ── MELEE ──────────────────────────────────────────────────────────────

    playMeleeAttack(x, y, isHeavy = false) {
        if (this._isCombatBlocked()) return;
        const sound = isHeavy ? "melee_swing3" : this._pickRandom(this.meleeSwings);
        SfxManager.play(sound, x, y, isHeavy ? 1.2 : 0.8, 100, 0.15, 0.10, 1000);
    }

    playMeleeHit(x, y, targetArmorType = "flesh") {
        if (this._isCombatBlocked()) return;
        if (targetArmorType === "wood" || targetArmorType === "shield") {
            SfxManager.play(this._pickRandom(["projectile_hit_wood", "projectile_hit_wood2"]), x, y, 1.0, 80, 0.05, 0.10, 1000);
        } else {
            SfxManager.play(this._pickRandom(this.meleeHits), x, y, 0.9, 60, 0.20, 0.15, 1000);
        }
    }

    playMeleeParry(x, y) {
        if (this._isCombatBlocked()) return;
        SfxManager.play(this._pickRandom(this.meleeParries), x, y, 1.1, 150, 0.1, 0.1, 1000);
    }

    playPolearm(x, y, isStab = true) {
        if (this._isCombatBlocked()) return;
        const sound = isStab ? "spear_glaive_stab" : this._pickRandom(this.polearms);
        SfxManager.play(sound, x, y, 1.0, 100);
    }

    // ── RANGED WEAPONS ─────────────────────────────────────────────────────

    playArcheryRelease(x, y) {
        if (this._isCombatBlocked()) return;
        // High pitch variance (15%) makes 5 identical snap files sound like a 20-man volley
        SfxManager.play(this._pickRandom(this.bowSnaps), x, y, 0.8, 150, 0.15, 0.10);
    }

    playCrossbowRelease(x, y) {
        if (this._isCombatBlocked()) return;
        // Mechanical weapon — lower variance (5%)
        SfxManager.play(this._pickRandom(this.crossbowSnaps), x, y, 1.0, 200, 0.05, 0.05);
    }

    playSlingerRelease(x, y) {
        if (this._isCombatBlocked()) return;
        SfxManager.play(this._pickRandom(this.slingers), x, y, 0.7, 100);
    }

    playGunpowderShot(x, y, isHeavy = false) {
        if (this._isCombatBlocked()) return;
        // Explosions vary significantly in volume (20%), moderately in pitch (10%)
        SfxManager.play("gunshot1", x, y, isHeavy ? 1.5 : 1.0, 250, 0.10, 0.20);
    }

    playProjectileHit(x, y, hitSurface) {
        if (this._isCombatBlocked()) return;
        if (hitSurface === "miss") {
            SfxManager.play("arrow_miss", x, y, 0.5, 50);
        } else if (hitSurface === "wood" || hitSurface === "shield") {
            SfxManager.play(this._pickRandom(["projectile_hit_wood", "projectile_hit_wood2"]), x, y, 0.8, 80);
        } else {
            SfxManager.play(this._pickRandom(this.coldHits), x, y, 0.7, 50);
        }
    }

    // ── COMPLEX / BURST WEAPONS ────────────────────────────────────────────

    playRocketVolley(x, y, numRockets = 30) {
        if (this._isCombatBlocked()) return;
        // Rockets are 240 RPM (super fast).  Simulate the volley with 4–6 overlapping sounds.
        const burstsToPlay = Math.min(Math.floor(numRockets / 5) + 1, 6);
        for (let i = 0; i < burstsToPlay; i++) {
            setTimeout(() => {
                // throttle=0 to force overlap specifically for this burst effect
                SfxManager.play("single_one_rocket_launch", x, y, 0.8, 0);
            }, i * 60 + (Math.random() * 20));
        }
    }

    playFirelanceBurst(x, y, isHeavy = false) {
        if (this._isCombatBlocked()) return;
        SfxManager.play(isHeavy ? "firelance2_hit" : "firelance1_hit", x, y, 1.0, 100);
        setTimeout(() => {
            // Aftermath sizzle follows shortly — also combat-blocked
            if (!this._isCombatBlocked()) {
                SfxManager.play("firelance_aftermath", x, y, 0.6, 200);
            }
        }, 150);
    }

    playBombChain(x, y, explosionCount = 1) {
        if (this._isCombatBlocked()) return;
        // Cap chain reactions at 5 to save ears; stagger by 100–300ms.
        const actualExplosions = Math.min(explosionCount, 5);
        for (let i = 0; i < actualExplosions; i++) {
            setTimeout(() => {
                if (!this._isCombatBlocked()) {
                    SfxManager.play(this._pickRandom(this.bombExplosions), x, y, 1.2, 0);
                }
            }, i * 150 + (Math.random() * 100));
        }
    }

    // ── SIEGE & MOVEMENT ──────────────────────────────────────────────────
    // These are NOT combat-gated — they can play as soon as the brief
    // global gate clears (≈500ms after launch).

    playSiegeMovement(x, y, isMoving = true) {
        if (isMoving) {
            // Long throttle (1000ms) lets the grinding wheel sound loop naturally
            SfxManager.play("siege_pushing_wheel_long", x, y, 0.7, 1000);
        }
    }

    playRamHit(x, y) {
        if (this._isCombatBlocked()) return;
        SfxManager.play("single_battering_ram_hit", x, y, 1.5, 500);
    }

    // ── MOUNT SOUNDS ───────────────────────────────────────────────────────

    playMountIdle(x, y, mountType) {
        if (mountType === "elephant") {
            const randomThrottle = 40000 + (Math.random() * 20000);
            SfxManager.play(this._pickRandom(["elephant_noise1", "elephant_noise2", "elephant_noise3"]), x, y, 1.0, randomThrottle);
        } else if (mountType === "camel") {
            const randomThrottle = 30000 + (Math.random() * 20000);
            SfxManager.play("camel_noise", x, y, 0.8, randomThrottle);
        } else if (mountType === "horse") {
            const randomThrottle = 20000 + (Math.random() * 20000);
            SfxManager.play(this._pickRandom(["horse_random_1_30", "horse_random_5_40"]), x, y, 0.6, randomThrottle);
        }
    }

    playMountMove(x, y, speed) {
        const isTrot = speed === "trot";
        const soundKey   = isTrot ? "horsetrot1" : this._pickRandom(["horse_canter", "horse_canter2"]);
        const baseVol    = isTrot ? 0.24 : 0.36;
        const baseThrottle = isTrot ? 300 : 200;

        // Proximity fading relative to camera
        const camX = window.camera?.x || 0;
        const camY = window.camera?.y || 0;
        const dist = Math.hypot(x - camX, y - camY);
        const distanceFactor = Math.max(0, 1 - (dist / 1200));

        // Natural gait jitter
        const volJitter = 0.85 + (Math.random() * 0.30);
        const throttleJitter = (Math.random() * 0.30) - 0.15;
        const organicThrottle = baseThrottle * (1 + throttleJitter);

        const finalVol = baseVol * distanceFactor * volJitter;
        if (finalVol > 0.01) {
            SfxManager.play(soundKey, x, y, finalVol, organicThrottle);
        }
    }

    // ── INFANTRY MARCH ────────────────────────────────────────────────────

    playFootmarch(x, y, weightTier) {
        const isHeavy  = weightTier >= 2;
        const soundKey = isHeavy ? "footmarch_heavy" : "footmarch_light";

        // Proximity fading relative to camera
        const camX = window.camera?.x || 0;
        const camY = window.camera?.y || 0;
        const dist = Math.hypot(x - camX, y - camY);
        const distanceFactor = Math.max(0, 1 - (dist / 1000));

        // Real soldiers don't step with the same force every time
        const volumeJitter = 0.8 + (Math.random() * 0.40);
        const baseVol  = isHeavy ? 0.18 : 0.14;
        const finalVol = baseVol * distanceFactor * volumeJitter;

        // Organic throttle: break the metronomic rhythm with slight variance
        const organicThrottle = 280 + (Math.random() * 40);

        if (finalVol > 0.005) {
            SfxManager.play(soundKey, x, y, finalVol, organicThrottle);
        }
    }

    // ── WATER & DROWNING ───────────────────────────────────────────────────

    playWaterSplash(x, y, isEntering = true) {
        const sound = isEntering ? "jump_intowater" : "jump_outof_water";
        SfxManager.play(sound, x, y, 0.8, 300, 0.10, 0.10);
    }

    playDrowning(x, y) {
        const sound = this._pickRandom(["drowning", "drowning2"]);
        // Heavy throttle (2000ms) prevents spam if multiple units drown simultaneously
        SfxManager.play(sound, x, y, 1.0, 2000, 0.05, 0.10);
    }
}

// Global instance
const BattleAudio = new BattlefieldAudioSystem();