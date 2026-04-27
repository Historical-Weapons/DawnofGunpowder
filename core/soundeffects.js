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

class SoundEffectsSystem {
    constructor() {
        this.sfxVolume = AudioManager.masterSfxVolume || 0.5;
        this.list = RAW_SFX_LIST;
        
        this.activeSfxCount = 0;
        this.MAX_CONCURRENT_SFX = 24; 
        this.lastPlayedMap = new Map(); 
        
        // ---> SURGERY: Add a registry to hold actively playing SFX
        this.activeAudios = new Set(); 
        
        this.listenerEntity = null; 
        this.MAX_HEARING_DISTANCE = 1000; 
    }

    setListener(entity) {
        this.listenerEntity = entity;
    }

    _getDistanceMultiplier(sourceX, sourceY) {
        if (!this.listenerEntity || sourceX === undefined || sourceY === undefined) return 1.0;
        
        const dx = sourceX - this.listenerEntity.x;
        const dy = sourceY - this.listenerEntity.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > this.MAX_HEARING_DISTANCE) return 0; 
        
        return Math.pow(1 - (dist / this.MAX_HEARING_DISTANCE), 2);
    }

    /**
     * CORE PLAY FUNCTION - Culling, Throttling, Spatial distance, and Pitch/Vol Variance
     */
play(soundKey, x = undefined, y = undefined, volMultiplier = 1.0, throttleMs = 50, pitchVariance = 0.1, volVariance = 0.1, duration = 0) {
    const timestamp = Date.now(); 
    if (AudioManager._sfxGateTime && timestamp < AudioManager._sfxGateTime) return;
    
    if (this.activeSfxCount >= this.MAX_CONCURRENT_SFX) return;
    const distVol = this._getDistanceMultiplier(x, y);
    if (distVol <= 0.01) return; 

    const perfNow = performance.now(); // Renamed to avoid conflict
    const lastPlayed = this.lastPlayedMap.get(soundKey) || 0;
    if (perfNow - lastPlayed < throttleMs) return; 

    this.lastPlayedMap.set(soundKey, perfNow);
    // ... rest of the function ...

        const url = this.list[soundKey];
        if (!url) {
            console.warn(`SFX key "${soundKey}" not found in RAW_SFX_LIST!`);
            return;
        }

        const sfx = new Audio(url);
        // ---> SURGERY: Register the audio so we can track it
        this.activeAudios.add(sfx);
        // Apply volume variance + distance scaling
        const randomVolMod = 1.0 - volVariance + (Math.random() * volVariance * 2);
        sfx.volume = Math.min(Math.max(this.sfxVolume * volMultiplier * distVol * randomVolMod, 0), 1);
        
        this.activeSfxCount++;
        
        // Apply pitch variance
        const randomPitchMod = 1.0 - pitchVariance + (Math.random() * pitchVariance * 2);
        try { sfx.playbackRate = Math.max(0.1, randomPitchMod); } catch(e) {}

        sfx.play().catch(err => {});

// NEW: Duration Clamp (The "Crisp" Factor)
    // If a duration is provided, we force a fade-out after that time
    if (duration > 0) {
        setTimeout(() => {
            if (sfx && !sfx.paused) {
                // Rapid 150ms fade-out for a clean finish
                const fadeInterval = setInterval(() => {
                    if (sfx.volume > 0.05) {
                        sfx.volume -= 0.05;
                    } else {
                        sfx.pause();
                        this._cleanupSfx(sfx); // Extract cleanup to a helper
                        clearInterval(fadeInterval);
                    }
                }, 20);
            }
        }, duration);
    }
sfx.addEventListener('ended', () => {
            this.activeSfxCount--;
            this.activeAudios.delete(sfx); // ---> SURGERY: Unregister
            sfx.removeAttribute('src');
            sfx.load();
        }, { once: true });
    }

    // Helper to ensure activeSfxCount stays accurate
    _cleanupSfx(sfx) {
        if (sfx.src) {
            this.activeSfxCount--;
            this.activeAudios.delete(sfx); // ---> SURGERY: Unregister
            sfx.removeAttribute('src');
            sfx.load();
        }
    }

    // ---> SURGERY: Add the master kill switch
    stopAll() {
        this.activeAudios.forEach(sfx => {
            sfx.pause();
            sfx.removeAttribute('src'); // Dumps it from browser memory
            sfx.load();
        });
        this.activeAudios.clear();
        this.activeSfxCount = 0;
        this.lastPlayedMap.clear();
    }
}

// Global instance to be called anywhere in your game logic
const SfxManager = new SoundEffectsSystem();

// ============================================================================
// BATTLEFIELD AUDIO MANAGER 
// Dedicated wrappers for weapon loops, bursts, volleys, and melee interactions
// ============================================================================

class BattlefieldAudioSystem {
    constructor() {
        // Categorized arrays for random picking
        this.meleeSwings = ["melee_swing", "melee_swing2", "melee_swing3"];
        this.meleeHits = ["melee_hit1", "melee_hit2", "melee_hit3", "melee_hit4_long", "melee_hit5"];
        this.meleeParries = ["melee_parry", "melee_parry2"];
        this.bowSnaps = ["bowstring_snap", "bowstring_snap2"];
        this.crossbowSnaps = ["crossbowstring_snap", "bowstring_snap2"];
		
        this.slingers = ["slinger_release1", "slinger_release2", "slinger_release3"]; //Javelin throws use same sfx cuz IM LAZY
		
        this.coldHits = ["coldprojectile_hit1", "coldprojectile_hit2", "coldprojectile_hit3", "coldprojectile_hit4"]; 
		//this is a general projectile hit from non-gunpowder weapons 
		
        this.bombExplosions = ["bomb_blown1", "bomb_blown2", "bomb_blown3", "bomb_blown4"];
        this.polearms = ["polearm_general", "spear_glaive_swing2", "spear_glaive_stab"];
        this.firelances = ["firelance1_hit", "firelance2_hit", "firelance_aftermath"];
    }

    _pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // --- MELEE WEAPONS (60-72 SPM variations) ---
playMeleeAttack(x, y, isHeavy = false) {
    const sound = isHeavy ? "melee_swing3" : this._pickRandom(this.meleeSwings);
    // Added 1000ms duration at the end
    SfxManager.play(sound, x, y, isHeavy ? 1.2 : 0.8, 100, 0.15, 0.10, 1000); 
}

playMeleeHit(x, y, targetArmorType = "flesh") {
    if (targetArmorType === "wood" || targetArmorType === "shield") {
        SfxManager.play(this._pickRandom(["projectile_hit_wood", "projectile_hit_wood2"]), x, y, 1.0, 80, 0.05, 0.10, 1000);
    } else {
        SfxManager.play(this._pickRandom(this.meleeHits), x, y, 0.9, 60, 0.20, 0.15, 1000);
    }
}

playMeleeParry(x, y) {
    SfxManager.play(this._pickRandom(this.meleeParries), x, y, 1.1, 150, 0.1, 0.1, 1000);
}

    playPolearm(x, y, isStab = true) {
        const sound = isStab ? "spear_glaive_stab" : this._pickRandom(this.polearms);
        SfxManager.play(sound, x, y, 1.0, 100);
    }

    // --- RANGED WEAPONS (12-30 RPM variations) ---

playArcheryRelease(x, y) {
        // High pitch variance (15%) makes 5 identical snap files sound like a 20-man volley
        SfxManager.play(this._pickRandom(this.bowSnaps), x, y, 0.8, 150, 0.15, 0.10);
    }

    playCrossbowRelease(x, y) {
        // Mechanical weapon, lower variance (5%)
        SfxManager.play(this._pickRandom(this.crossbowSnaps), x, y, 1.0, 200, 0.05, 0.05);
    }

    playSlingerRelease(x, y) {
        SfxManager.play(this._pickRandom(this.slingers), x, y, 0.7, 100);
    }
playGunpowderShot(x, y, isHeavy = false) {
        // Explosions should vary significantly in volume (20%), moderately in pitch (10%)
        SfxManager.play("gunshot1", x, y, isHeavy ? 1.5 : 1.0, 250, 0.10, 0.20);
    }
	
	

    playProjectileHit(x, y, hitSurface) {
        if (hitSurface === "miss") {
            SfxManager.play("arrow_miss", x, y, 0.5, 50);
        } else if (hitSurface === "wood" || hitSurface === "shield") {
            SfxManager.play(this._pickRandom(["projectile_hit_wood", "projectile_hit_wood2"]), x, y, 0.8, 80);
        } else {
            SfxManager.play(this._pickRandom(this.coldHits), x, y, 0.7, 50);
        }
    }

    // --- COMPLEX / BURST WEAPONS (Rockets, Bombs, Firelances) ---

    playRocketVolley(x, y, numRockets = 30) {
        // Rockets are 240 RPM (super fast). Playing 30 sounds will crash the browser.
        // We simulate the volley by playing 4-6 overlapping sounds rapidly.
        const burstsToPlay = Math.min(Math.floor(numRockets / 5) + 1, 6);
        
        for (let i = 0; i < burstsToPlay; i++) {
            setTimeout(() => {
                // Notice the throttle is 0 here to force them to overlap specifically for this burst
                SfxManager.play("single_one_rocket_launch", x, y, 0.8, 0); 
            }, i * 60 + (Math.random() * 20)); // Stagger by ~60ms with slight randomization
        }
    }

    playFirelanceBurst(x, y, isHeavy = false) {
        // Initial blast
        SfxManager.play(isHeavy ? "firelance2_hit" : "firelance1_hit", x, y, 1.0, 100);
        
        // Aftermath sizzle played shortly after
        setTimeout(() => {
            SfxManager.play("firelance_aftermath", x, y, 0.6, 200);
        }, 150);
    }

    playBombChain(x, y, explosionCount = 1) {
        // Bombs can cause chain reactions. 
        // We cap it to max 5 to save ears, staggering them by 100-300ms.
        const actualExplosions = Math.min(explosionCount, 5);

        for (let i = 0; i < actualExplosions; i++) {
            setTimeout(() => {
                SfxManager.play(this._pickRandom(this.bombExplosions), x, y, 1.2, 0);
            }, i * 150 + (Math.random() * 100));
        }
    }

    // --- SIEGE / MOVEMENT ---

    playSiegeMovement(x, y, isMoving = true) {
        // Use a longer throttle (1000ms) so the grinding wheel sound loops naturally as it pushes
        if (isMoving) {
            SfxManager.play("siege_pushing_wheel_long", x, y, 0.7, 1000);
        }
    }

    playRamHit(x, y) {
        SfxManager.play("single_battering_ram_hit", x, y, 1.5, 500); // 500ms throttle, rams are slow
    }

playMountIdle(x, y, mountType) {
    // Dynamic throttles applied per-call to keep the battlefield sounding natural
    if (mountType === "elephant") {
        const noises = ["elephant_noise1", "elephant_noise2", "elephant_noise3"];
        // Random throttle between 40 and 60 seconds
        const randomThrottle = 40000 + (Math.random() * 20000); 
        SfxManager.play(this._pickRandom(noises), x, y, 1.0, randomThrottle); 
        
    } else if (mountType === "camel") {
        // Random throttle between 30 and 50 seconds
        const randomThrottle = 30000 + (Math.random() * 20000);
        SfxManager.play("camel_noise", x, y, 0.8, randomThrottle);
        
    } else if (mountType === "horse") {
        const noises = ["horse_random_1_30", "horse_random_5_40"];
        // Random throttle between 20 and 40 seconds
        const randomThrottle = 20000 + (Math.random() * 20000);
        SfxManager.play(this._pickRandom(noises), x, y, 0.6, randomThrottle);
    }
}

playMountMove(x, y, speed) {
    // 1. IDENTITY & BASE SETTINGS
    const isTrot = speed === "trot";
    const soundKey = isTrot ? "horsetrot1" : this._pickRandom(["horse_canter", "horse_canter2"]);
    const baseVol = isTrot ? 0.24 : 0.36;
    const baseThrottle = isTrot ? 300 : 200;

    // 2. PROXIMITY FADING (The "Fade In/Out" mechanism)
    // Adjusts volume based on distance from the camera
    const camX = window.camera?.x || 0; 
    const camY = window.camera?.y || 0;
    const dist = Math.hypot(x - camX, y - camY);
    
    const maxAudibleDist = 1200; // Horses are louder than men; slightly larger radius
    const distanceFactor = Math.max(0, 1 - (dist / maxAudibleDist));

    // 3. EQUINE JITTER (Randomization)
    // Volume varies slightly per hoofbeat (0.85 to 1.15)
    const volJitter = 0.85 + (Math.random() * 0.3);
    
    // Throttle Jitter: Horses aren't metronomes. 
    // We vary the timing by +/- 15% to simulate natural gait variations.
    const throttleJitter = (Math.random() * 0.3) - 0.15; 
    const organicThrottle = baseThrottle * (1 + throttleJitter);

    // 4. CALCULATE FINAL VOLUME
    const finalVol = baseVol * distanceFactor * volJitter;

    // 5. EXECUTION
    // Culling: If the volume is too low or unit is off-screen, don't fire the sound
    if (finalVol > 0.01) {
        SfxManager.play(soundKey, x, y, finalVol, organicThrottle);
    }
}
	
playFootmarch(x, y, weightTier) {
    // 1. Determine base identity
    const isHeavy = weightTier >= 2;
    const soundKey = isHeavy ? "footmarch_heavy" : "footmarch_light";
    
    // 2. PROXIMITY FADING (The "Fade In/Out" feel)
    // We calculate distance to the camera/player. 
    // If they are far away, the march should naturally be quieter.
    const camX = window.camera?.x || 0; // Adjust based on your engine's camera name
    const camY = window.camera?.y || 0;
    const dist = Math.hypot(x - camX, y - camY);
    
    const maxAudibleDist = 1000; // Pixels until sound is silent
    const distanceFactor = Math.max(0, 1 - (dist / maxAudibleDist));

    // 3. HUMANIZATION (Randomization)
    // Real soldiers don't step with the exact same force every time.
    const volumeJitter = 0.8 + (Math.random() * 0.4); // 80% to 120% variation
    
    // 4. CALCULATE FINAL VOLUME
    const baseVol = isHeavy ? 0.18 : 0.14;
    const finalVol = baseVol * distanceFactor * volumeJitter;

    // 5. THROTTLE JITTER (Breaking the mechanical rhythm)
    // Instead of exactly 300ms, we vary it slightly (e.g., 280ms to 320ms).
    // This prevents that "machine gun" sound.
    const organicThrottle = 280 + (Math.random() * 40);

    // 6. EXECUTION
    // Only play if it's actually audible to save performance
    if (finalVol > 0.005) {
        SfxManager.play(soundKey, x, y, finalVol, organicThrottle);
    }
}
	
	// --- WATER & DROWNING ---
    
    playWaterSplash(x, y, isEntering = true) {
        const sound = isEntering ? "jump_intowater" : "jump_outof_water";
        // 10% pitch and volume variance for natural sounding splashes
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