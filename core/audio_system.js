// ============================================================================
// EMPIRE OF THE 13TH CENTURY - PURE JS SYNTH AUDIO SYSTEM (ZERO ASSETS) + MP3
// ============================================================================

class AudioManagerSystem {
    constructor() {
        this.ctx = null;
        this.masterMusicVolume = 0.015; // Kept lower so it doesn't overpower SFX
        this.masterSfxVolume = 0.5;
        this.initialized = false;

        // MP3 state
        this.currentMp3 = null;
        this.mp3Volume = 0.2; // Default volume for MP3 tracks
        this.fadeInterval = null; // Used for smooth transitions
        this._activeTracks = new Set(); // CRITICAL: Initialize this!
        this._playSessionId = 0;        // CRITICAL: Initialize this!
        // Playlist state
        this.currentPlaylist = [];
        this.isPlaylistMode = false;
        this.mp3Volume = 0.2; // Default volume for MP3 tracks
        this.fadeInterval = null; // Used for smooth transitions
        // Sequencer state
        this.currentTrack = null;
        this.isPlaying = false;
        this.nextNoteTime = 0;
        this.currentStep = 0;
        this.timerID = null;
        this.activeOscillators = [];
        // --- Inside constructor() ---
        this._sfxGateTime = 0;       // Timestamp when all SFX are allowed
        this._combatGateTime = 0;    // Timestamp when combat SFX are allowed
        // --- MUSICAL SCALES (Offsets from root note) ---
        const SCALES = {
            majorPentatonic: [0, 2, 4, 7, 9, 12, 14], // Bright, Eastern (Hong, Xiaran)
            minorPentatonic: [0, 3, 5, 7, 10, 12, 15], // Nomadic, Gritty (Khaganate, Jinlord)
            harmonicMinor: [0, 2, 3, 5, 7, 8, 11, 12], // Middle Eastern (Iransar)
            hirajoshi: [0, 2, 3, 7, 8, 12, 14],        // Japanese (Yamato)
            dorian: [0, 2, 3, 5, 7, 9, 10, 12],        // Medieval European/Neutral
            chromatic: [0, 1, 2, 3, 4, 5, 6, 7],       // Chaos/Bandits
            drone: [0, 7, 12, 0, 7, 12, 0]             // Static/Tension
        };

        // --- PROCEDURAL MUSIC PROFILES ---
        this.tracks = {
            // Factions
            "Hong Dynasty":          { scale: SCALES.majorPentatonic, root: 60, tempo: 140, wave: 'triangle', pattern: [0,2,4,2, 5,4,2,-1] },
            "Shahdom of Iransar":    { scale: SCALES.harmonicMinor, root: 58, tempo: 110, wave: 'sine',     pattern: [0,1,2,1, 4,3,2,-1] },
            "Great Khaganate":       { scale: SCALES.minorPentatonic,root: 50, tempo: 160, wave: 'sawtooth', pattern: [0,0,3,0, 5,0,3,-1] }, 
            "Jinlord Confederacy":   { scale: SCALES.minorPentatonic,root: 55, tempo: 130, wave: 'square',   pattern: [0,-1,2,-1, 4,2,0,-1] },
            "Vietan Realm":          { scale: SCALES.majorPentatonic, root: 65, tempo: 120, wave: 'triangle', pattern: [0,3,5,6, 5,3,0,-1] }, 
            "Goryun Kingdom":        { scale: SCALES.dorian,          root: 57, tempo: 100, wave: 'square',   pattern: [0,2,4,2, 0,-1,-1,-1] },
            "Xiaran Dominion":       { scale: SCALES.majorPentatonic, root: 62, tempo: 150, wave: 'sine',     pattern: [4,3,2,0, 2,0,-1,-1] },
            "High Plateau Kingdoms": { scale: SCALES.majorPentatonic, root: 53, tempo: 90,  wave: 'triangle', pattern: [0,-1,2,-1, 4,-1,-1,-1] },
            "Yamato Clans":          { scale: SCALES.hirajoshi,       root: 60, tempo: 115, wave: 'square',   pattern: [0,1,3,4, 3,1,0,-1] },
            "Bandits": { 
                scale: SCALES.chromatic,       
                root: 55, 
                tempo: 220, 
                wave: 'sawtooth', 
                pattern: [
                    0,3,1,7, 2,9,3,-1,
                    11,4,6,8, 10,-1,7,5,
                    12,10,8,6, 4,2,0,-1,
                    3,6,9,12, 11,7,5,3,
                    0,-1,12,7, 3,10,-1,6,
                    8,5,2,9, 11,-1,4,1,
                    13,11,9,7, 5,3,1,-1,
                    0,4,8,12, 7,3,-1,10
                ] 
            }, 
            "Independent":           { scale: SCALES.dorian,          root: 60, tempo: 100, wave: 'triangle', pattern: [0,2,4,-1, 4,2,0,-1] },
            
            // General Game States
            "MainMenu":              { scale: SCALES.dorian,          root: 55, tempo: 110, wave: 'square',   pattern: [0,4,7,4, 0,7,12,-1] },
            "WorldMap_Calm":         { scale: SCALES.dorian,          root: 60, tempo: 108, wave: 'triangle', pattern: [0,2,4,5, 4,2,0,-1, 2,4,5,7, 5,4,2,-1, 4,5,7,9, 7,5,4,-1, 5,7,9,10, 9,7,5,-1, 7,5,4,2, 4,5,7,-1, 9,7,5,4, 5,4,2,-1, 0,2,4,7, 5,4,2,-1, 4,5,7,9, 7,5,4,-1, 9,7,5,4, 2,0,-2,-1, 0,2,4,5, 4,2,0,-1, 2,4,5,7, 9,7,5,-1, 7,5,4,2, 0,-1,-2,-1, 0,2,4,5, 4,2,0,-1, 2,4,5,7, 5,4,2,-1] },
            "WorldMap_Tension":      { scale: SCALES.drone,           root: 48, tempo: 140, wave: 'sawtooth', pattern: [0,-1,1,-1, 0,-1,-1,-1, 0,1,0,-1, 2,-1,1,-1, 0,-1,1,2, 1,-1,0,-1, -1,-1,0,1, 0,-1,-1,-1, 0,1,2,1, 0,-1,1,-1, 2,-1,3,-1, 2,1,0,-1, 0,-1,1,-1, 2,-1,1,-1, 0,-1,-2,-1, -1,-1,0,-1, 0,1,0,1, 2,1,0,-1, 1,-1,2,-1, 3,-1,2,-1, 0,-1,1,2, 3,-1,2,-1, 1,-1,0,-1, -1,-1,-2,-1, 0,1,2,3, 2,1,0,-1, 1,-1,0,-1, 0,-1,-1,-1] },
            "Battle_Skirmish":       { scale: SCALES.minorPentatonic, root: 58, tempo: 168, wave: 'square',   pattern: [0,2,4,2, 0,2,4,7, 4,2,0,2, 4,7,4,2, 4,7,9,7, 4,7,9,12, 9,7,4,7, 9,7,4,2, 7,5,4,2, 4,5,7,9, 7,5,4,2, 0,2,4,2, 0,2,4,5, 7,9,7,5, 4,2,0,2, 4,2,0,-1, 2,4,7,4, 2,4,7,9, 7,4,2,4, 7,9,7,4, 4,7,9,10, 12,10,9,7, 9,7,5,4, 2,0,2,-1, 0,2,4,2, 0,2,4,7, 4,2,0,2, 4,2,0,-1] },
            "Battle_Massive":        { scale: SCALES.harmonicMinor,   root: 50, tempo: 148, wave: 'sawtooth', pattern: [0,0,3,5, 7,5,3,0, 0,3,5,7, 8,7,5,3, 3,5,7,8, 10,8,7,5, 7,8,10,12, 10,8,7,5, 12,10,8,7, 5,3,2,0, 3,5,7,5, 3,2,0,-1, 0,3,7,10, 8,7,5,3, 5,7,8,10, 12,10,8,7, 7,7,8,10, 12,10,8,7, 5,5,7,8, 10,8,7,5, 8,10,12,13, 15,13,12,10, 12,10,8,7, 5,3,2,-1, 0,3,5,7, 8,7,5,3, 5,3,2,0, 0,-1,0,-1] },        
            "Battle_Gunpowder":      { scale: SCALES.chromatic,       root: 45, tempo: 208, wave: 'square',   pattern: [0,1,0,2, 1,3,2,4, 3,5,4,3, 2,1,0,-1, 0,2,3,5, 6,5,7,8, 7,6,5,3, 2,1,0,-1, 4,2,5,3, 6,4,7,5, 8,6,9,7, 6,5,3,2, 0,1,2,3, 4,5,6,7, 8,9,10,9, 8,7,6,5, 10,8,9,7, 8,6,7,5, 6,4,5,3, 4,2,3,1, 0,3,1,4, 2,5,3,6, 4,7,5,8, 6,5,4,2, 7,9,10,12, 11,13,12,11, 10,9,8,7, 6,5,4,3, 0,1,0,1, 2,1,2,3, 1,0,1,2, 0,-1,0,-1, 5,4,3,2, 3,2,1,0, 2,1,0,-2, -1,0,-1,-1] },      
            "City_Ambient":          { scale: SCALES.majorPentatonic, root: 64, tempo: 112, wave: 'triangle', pattern: [0,2,4,2, 0,2,4,7, 4,2,0,-1, 2,4,2,-1, 2,4,7,9, 7,4,2,-1, 4,7,9,11, 9,7,4,-1, 0,-1,2,4, 2,0,-1,-1, 0,2,4,2, 0,-1,0,-1, 7,9,11,9, 7,9,7,4, 9,11,12,11, 9,7,4,-1, 0,2,4,7, 4,2,0,-1, 2,4,7,9, 7,4,2,-1, 4,2,0,2, 4,7,4,2, 7,9,7,4, 2,0,-1,-1, 9,11,12,11, 9,7,9,11, 12,14,12,11, 9,7,4,-1, 7,4,2,0, 2,4,2,0, 0,-1,0,-1, -2,-1,0,-1, 2,4,7,4, 2,4,7,9, 7,4,2,-1, 0,2,0,-1, 0,2,4,2, 0,2,4,7, 4,2,0,-1, 0,-1,0,-1] }, 
            "Victory":               { scale: SCALES.majorPentatonic, root: 60, tempo: 120, wave: 'square',   pattern: [0,2,4,7, 9,-1,-1,-1] },
            "Defeat":                { scale: SCALES.harmonicMinor,   root: 55, tempo: 60,  wave: 'sawtooth', pattern: [4,3,2,0, -1,-1,-1,-1] },
            
            "gold_buy":              { scale: SCALES.majorPentatonic, root: 72, tempo: 200, wave: 'sine',     pattern: [0, 2, 4, 7, -1, -1, -1, -1] },
            "error":                 { scale: SCALES.harmonicMinor,   root: 40, tempo: 180, wave: 'sawtooth', pattern: [1, 0, 1, 0, -1, -1, -1, -1] },
            "ui_click":              { scale: SCALES.majorPentatonic, root: 80, tempo: 240, wave: 'sine',     pattern: [0, -1, -1, -1, -1, -1, -1, -1] },
            
            "Level_Up":              { scale: SCALES.majorPentatonic, root: 60, tempo: 160, wave: 'square',   pattern: [0, 2, 4, 7, 12, 7, 12, -1] },
            "Quest_Complete":        { scale: SCALES.dorian,          root: 62, tempo: 130, wave: 'triangle', pattern: [0, 4, 2, 5, 7, -1, -1, -1] },
            "Discovery":             { scale: SCALES.majorPentatonic, root: 67, tempo: 90,  wave: 'sine',     pattern: [0, 7, 12, 14, -1, -1, -1, -1] },
            "Danger_Nearby":         { scale: SCALES.drone,           root: 45, tempo: 140, wave: 'sawtooth', pattern: [0, 1, 0, 1, 0, 1, -1, -1] },
            "Item_Pickup":           { scale: SCALES.majorPentatonic, root: 75, tempo: 200, wave: 'sine',     pattern: [0, 4, 7, -1, -1, -1, -1, -1] },
            "Resting_Theme":         { scale: SCALES.majorPentatonic, root: 55, tempo: 60,  wave: 'triangle', pattern: [0, -1, 4, -1, 2, -1, 0, -1] },
            "Infiltration":          { scale: SCALES.minorPentatonic, root: 50, tempo: 110, wave: 'square',   pattern: [0, -1, 3, -1, 0, -1, 2, -1] },
            "Trade_Menu":            { scale: SCALES.majorPentatonic, root: 65, tempo: 100, wave: 'sine',     pattern: [0, 2, 0, 4, 2, 0, -1, -1] },
            "Ambush":                { scale: SCALES.chromatic,       root: 52, tempo: 190, wave: 'sawtooth', pattern: [0, 1, 2, 1, 0, 1, 2, -1] },
            "Tavern_Jingle":         { scale: SCALES.dorian,          root: 58, tempo: 140, wave: 'triangle', pattern: [0, 2, 4, 0, 5, 4, 2, 0] }
        };
    }

    init() {
        if (this.initialized) return;
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.initialized = true;
        console.log("Procedural Audio System Initialized");
    }

 playMP3(url, loop = true) {
        
        // ---> SURGERY: Prevent double-play if the exact track is already active
        if (this.currentTrack === url && this.currentMp3 && !this.currentMp3.paused) {
            console.log("Audio System: Track already playing, skipping duplicate call ->", url);
            return;
        }
		
        // 1. Stop all current music and increment the session ID to kill pending callbacks
        this.stopMusic(); // Synth killer
        this.stopMP3();   // MP3 killer

        const currentSession = this._playSessionId;
        this.isPlaylistMode = false;
        this.currentTrack = url; 
        
        // ... (rest of your logic) ...
        const newAudio = new Audio(url);
        this._trackAudio(newAudio); // Add to our global kill-list
        
this.currentMp3 = newAudio;
        newAudio.volume = 0; // Start at 0 for fade in
        newAudio.loop = loop;
        
        // BULLETPROOF LOOP FIX FOR LOCAL FILES (file:///)
        if (loop) {
            newAudio.addEventListener('ended', function() {
                this.currentTime = 0;
                this.play().catch(e => console.warn("Manual loop restart failed:", e));
            }, false);
        }
        
        newAudio.play().then(() => {
            // RACE CONDITION CHECK: Did another file stop/change the music while this was buffering?
            if (this._playSessionId !== currentSession) {
                this._nukeAudio(newAudio);
                return;
            }
            this._fadeMP3(newAudio, this.mp3Volume, 1000); // 1 sec fade in
        }).catch(err => {
            console.warn("Browser blocked audio playback or file not found:", err);
        });
        
        console.log("Playing MP3:", url);
    }
    
    // --- Playlist Logic ---
    
    playRandomMP3List(trackArray) {
        if (!trackArray || trackArray.length === 0) return;
        
        // Use a generic ID for the current track so external update loops don't restart it
        if (this.currentTrack === "PLAYLIST_MODE") return; 
        
        this.stopMusic();
        this.stopMP3(); // Increments session ID, kills all active tracks
        
        this.isPlaylistMode = true;
        this.currentPlaylist = trackArray;
        this.currentTrack = "PLAYLIST_MODE";
        
        this._playNextInList();
    }
    
    _playNextInList(previousTrack = null) {
        if (!this.isPlaylistMode || !this.currentPlaylist || this.currentPlaylist.length === 0) return;

        const currentSession = this._playSessionId;

        // Pick a random track that isn't the one that just played
        let nextTrackUrl;
        if (this.currentPlaylist.length > 1) {
            do {
                nextTrackUrl = this.currentPlaylist[Math.floor(Math.random() * this.currentPlaylist.length)];
            } while (nextTrackUrl === previousTrack);
        } else {
            nextTrackUrl = this.currentPlaylist[0];
        }

        console.log("Playlist playing:", nextTrackUrl);

        const currentAudio = new Audio(nextTrackUrl);
        this._trackAudio(currentAudio); // Add to global kill-list
        
        this.currentMp3 = currentAudio;
        currentAudio.volume = 0;
        currentAudio.loop = false;

        // Wait for the browser to load the track's duration before skipping
        currentAudio.addEventListener('loadedmetadata', () => {
            if (this._playSessionId !== currentSession) return; // Abort if music changed

            const minPlayableSeconds = 30; 
            if (currentAudio.duration > minPlayableSeconds) {
                const maxStartTime = currentAudio.duration - minPlayableSeconds;
                currentAudio.currentTime = Math.random() * maxStartTime;
            }
        });

        currentAudio.play().then(() => {
            if (this._playSessionId !== currentSession) {
                this._nukeAudio(currentAudio);
                return;
            }
            this._fadeMP3(currentAudio, this.mp3Volume, 2000);
        }).catch(err => {
            console.warn("Playlist error:", err);
            if (this.isPlaylistMode && this._playSessionId === currentSession) {
                this.playlistTimeout = setTimeout(() => this._playNextInList(nextTrackUrl), 2000);
            }
        });

        const MIN_PLAY_MS = 60000; // 1 minute minimum before switching
        let advanced = false;

        const advanceToNext = () => {
            // Abort if already advanced OR if another file interrupted the session
            if (advanced || !this.isPlaylistMode || this._playSessionId !== currentSession) return;
            advanced = true;

            if (this.playlistTimeout) {
                clearTimeout(this.playlistTimeout);
                this.playlistTimeout = null;
            }

            const fadingTrack = currentAudio;
            
            // 1. Fade out the current track completely
            this._fadeMP3(fadingTrack, 0, 1900, () => {
                // 2. Destroy the old track completely
                this._nukeAudio(fadingTrack);
                
                if (this.currentMp3 === fadingTrack) {
                    this.currentMp3 = null;
                }
                
                // 3. Start the next track ONLY if we are still in the exact same session
                if (this.isPlaylistMode && this._playSessionId === currentSession) {
                    this._playNextInList(nextTrackUrl);
                }
            });
        };

        this.playlistTimeout = setTimeout(advanceToNext, MIN_PLAY_MS);

        currentAudio.addEventListener('ended', () => {
            advanceToNext();
        }, { once: true });
    }
    
    // --- Helper Methods ---

_fadeMP3(audioObj, targetVolume, duration, callback = null) {
        if (!audioObj) {
            if (callback) callback();
            return;
        }
        
        if (audioObj._fadeInterval) clearInterval(audioObj._fadeInterval);
        
        // If it's already paused or at target volume, just snap and callback instantly
        if (audioObj.paused || audioObj.volume === targetVolume) {
            audioObj.volume = targetVolume;
            if (callback) callback();
            return;
        }

        let steps = 20; 
        let timeStep = duration / steps;
        let volumeStep = (targetVolume - audioObj.volume) / steps;
        
        // Failsafe: Prevent infinite loops if volume step is effectively zero
        if (volumeStep === 0) {
            if (callback) callback();
            return;
        }

        audioObj._fadeInterval = setInterval(() => {
            // Failsafe: if audio gets destroyed or paused midway (e.g. track ended)
            if (!audioObj || audioObj.paused) {
                clearInterval(audioObj._fadeInterval);
                audioObj._fadeInterval = null;
                if (callback) callback();
                return;
            }
            
            let newVol = audioObj.volume + volumeStep;
            
            if (newVol > 1.0) newVol = 1.0;
            if (newVol < 0.0) newVol = 0.0;
            
            audioObj.volume = newVol;
            
            // Check if we reached or overshot the target
            if ((volumeStep > 0 && audioObj.volume >= targetVolume - 0.01) || 
                (volumeStep < 0 && audioObj.volume <= targetVolume + 0.01)) {
                
                audioObj.volume = targetVolume;
                clearInterval(audioObj._fadeInterval);
                audioObj._fadeInterval = null;
                if (callback) callback();
            }
        }, timeStep);
    }

    // NEW: Keeps track of all created audios to prevent ghosts
    _trackAudio(audioObj) {
        if (!this._activeTracks) this._activeTracks = new Set();
        this._activeTracks.add(audioObj);
    }

    // NEW: The ultimate weapon against zombie audio elements
    _nukeAudio(audioObj) {
        if (!audioObj) return;
        
        if (audioObj._fadeInterval) {
            clearInterval(audioObj._fadeInterval);
            audioObj._fadeInterval = null;
        }
        
        audioObj.pause();
        audioObj.removeAttribute('src'); // Forces browser to dump the memory
        audioObj.load();
        
        if (this._activeTracks) {
            this._activeTracks.delete(audioObj);
        }
    }

    stopMP3() {
        this.isPlaylistMode = false; 
        this.currentTrack = null;
        
        // Increment session ID to instantly invalidate any pending timeouts or fade callbacks
        this._playSessionId = (this._playSessionId || 0) + 1;
        
        if (this.playlistTimeout) {
            clearTimeout(this.playlistTimeout);
            this.playlistTimeout = null;
        }
        
        // Nuke EVERY track that was ever created and hasn't been cleaned up yet
        if (this._activeTracks) {
            this._activeTracks.forEach(audio => this._nukeAudio(audio));
            this._activeTracks.clear();
        }
        
        this.currentMp3 = null;
    }
    // ========================================================================
    // MUSIC GENERATOR (THE MINI-SEQUENCER)
    // ========================================================================
    
    // Convert MIDI note to Frequency
    midiToFreq(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    playMusic(trackName) {
        if (!this.initialized || !this.tracks[trackName] || this.currentTrack === trackName) return;
        
        // Stop MP3 if one is playing so they don't clash
        this.stopMP3();

        this.stopMusic();
        this.currentTrack = trackName;
        this.isPlaying = true;
        this.currentStep = 0;
        this.nextNoteTime = this.ctx.currentTime + 0.1;
        
        this.scheduler();
    }

    stopMusic() {
        this.isPlaying = false;
        clearTimeout(this.timerID);
        this.activeOscillators.forEach(osc => {
            try { osc.stop(); } catch(e){}
        });
        this.activeOscillators = [];
        this.currentTrack = null;
    }

    scheduler() {
        // Schedule notes slightly ahead of time for perfect rhythm
        while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
            this.playNextNote();
        }
        if (this.isPlaying) {
            this.timerID = setTimeout(() => this.scheduler(), 25);
        }
    }

// Add this inside the AudioManagerSystem class in audio_system.js

playCityPlaylist() {
    // SECURITY CHECK 1: If we are already playing city music, DO NOT RESTART.
    if (this.currentMusicType === "city") return;

    // SECURITY CHECK 2: If we are in the middle of a fade transition, wait.
    if (this.isTransitioning) return;

    console.log("🏙️ Entering City: Starting playlist.");

    // Set the type so this function 'locks' itself
    this.currentMusicType = "city";

    // Use your existing function for the city tracks 1-6
    if (typeof this.playRandomMP3List === 'function') {
        this.playRandomMP3List([
            'music/city1.mp3', 'music/city2.mp3', 'music/city3.mp3', 
            'music/city4.mp3', 'music/city5.mp3', 'music/city6.mp3'
        ]);
    }
}

    playNextNote() {
        const track = this.tracks[this.currentTrack];
        const secondsPerBeat = 60.0 / track.tempo;
        
        const noteIndex = track.pattern[this.currentStep];
        
        if (noteIndex !== -1 && noteIndex !== undefined) {
            // SURGERY: We use a "Double Modulo" to ensure negative pattern numbers 
            // still point to a valid index in the scale array.
            const scaleLen = track.scale.length;
            const safeIndex = ((noteIndex % scaleLen) + scaleLen) % scaleLen;
            
            const midiNote = track.root + track.scale[safeIndex];
            const freq = this.midiToFreq(midiNote);
            
            // Final safety check: ensure freq is a real number
            if (isFinite(freq)) {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                
                osc.type = track.wave;
                osc.frequency.value = freq;
                
                gain.gain.setValueAtTime(0, this.nextNoteTime);
                gain.gain.linearRampToValueAtTime(this.masterMusicVolume, this.nextNoteTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, this.nextNoteTime + secondsPerBeat - 0.05);

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                
                osc.start(this.nextNoteTime);
                osc.stop(this.nextNoteTime + secondsPerBeat);
                
                this.activeOscillators.push(osc);
                setTimeout(() => {
                    this.activeOscillators = this.activeOscillators.filter(o => o !== osc);
                }, secondsPerBeat * 1000 + 100);
            }
        }

        this.nextNoteTime += secondsPerBeat;
        this.currentStep++;
        if (this.currentStep >= track.pattern.length) {
            this.currentStep = 0; 
        }
    }

// ========================================================================
    // PROCEDURAL SOUND EFFECTS (10 EFFECTS) - NOW WITH VARIANCE
    // ========================================================================
    
    /**
     * @param {string} effect - The name of the sound to play
     * @param {number} pitchVariance - e.g., 0.15 for +/- 15% pitch randomness
     * @param {number} volVariance - e.g., 0.10 for +/- 10% volume randomness
     */
	 
playSound(effect, pitchVariance = 0.15, volVariance = 0.10) {
    const wallClockNow = Date.now(); 
    if (wallClockNow < this._sfxGateTime) return;
    if (effect === 'charge' && wallClockNow < this._combatGateTime) return;
    
    if (!this.initialized || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    const ctxTime = this.ctx.currentTime; // Renamed to avoid conflict
    // ... update the rest of the switch cases to use ctxTime instead of now ...

        // SURGERY: Helper function to apply +/- percentage variance to any value
        const vary = (baseValue, variance) => {
            const min = baseValue * (1 - variance);
            const max = baseValue * (1 + variance);
            return min + Math.random() * (max - min);
        };

        // Calculate final randomized volume for this instance
        const finalVol = vary(this.masterSfxVolume, volVariance);

        switch(effect) {
            case 'sword_clash':
                osc.type = 'triangle';
                // SURGERY: Randomize the starting frequency
                osc.frequency.setValueAtTime(vary(1200, pitchVariance), ctxTime);
                osc.frequency.exponentialRampToValueAtTime(vary(100, pitchVariance), ctxTime + 0.1);
                gain.gain.setValueAtTime(finalVol, ctxTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctxTime + 0.2);
                osc.start(ctxTime); osc.stop(ctxTime + 0.2);
                break;
                
            case 'firelance': 
                this._createNoise(ctxTime, 0.3, 'lowpass', vary(1000, pitchVariance));
                osc.type = 'square';
                osc.frequency.setValueAtTime(vary(150, pitchVariance), ctxTime);
                osc.frequency.exponentialRampToValueAtTime(vary(40, pitchVariance), ctxTime + 0.2);
                gain.gain.setValueAtTime(finalVol, ctxTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctxTime + 0.3);
                osc.start(ctxTime); osc.stop(ctxTime + 0.3);
                break;

            case 'bomb': 
                this._createNoise(ctxTime, 1.0, 'lowpass', vary(400, pitchVariance));
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(vary(80, pitchVariance), ctxTime);
                osc.frequency.exponentialRampToValueAtTime(vary(20, pitchVariance), ctxTime + 1.0);
                gain.gain.setValueAtTime(finalVol, ctxTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctxTime + 1.0);
                osc.start(ctxTime); osc.stop(ctxTime + 1.0);
                break;

            case 'arrow': 
                this._createNoise(ctxTime, 0.2, 'bandpass', vary(2500, pitchVariance));
                break;

            case 'shield_block': 
                osc.type = 'sine';
                osc.frequency.setValueAtTime(vary(150, pitchVariance), ctxTime);
                osc.frequency.exponentialRampToValueAtTime(vary(50, pitchVariance), ctxTime + 0.1);
                gain.gain.setValueAtTime(finalVol, ctxTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctxTime + 0.15);
                osc.start(ctxTime); osc.stop(ctxTime + 0.15);
                break;

            case 'horse_trot': 
                osc.type = 'square';
                osc.frequency.setValueAtTime(vary(400, pitchVariance), ctxTime);
                osc.frequency.exponentialRampToValueAtTime(vary(100, pitchVariance), ctxTime + 0.05);
                gain.gain.setValueAtTime(finalVol * 0.4, ctxTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctxTime + 0.05);
                osc.start(ctxTime); osc.stop(ctxTime + 0.05);
                break;

            case 'elephant': 
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(vary(300, pitchVariance), ctxTime);
                osc.frequency.linearRampToValueAtTime(vary(500, pitchVariance), ctxTime + 0.2);
                osc.frequency.linearRampToValueAtTime(vary(250, pitchVariance), ctxTime + 0.7);
                gain.gain.setValueAtTime(0, ctxTime);
                gain.gain.linearRampToValueAtTime(finalVol, ctxTime + 0.1);
                gain.gain.exponentialRampToValueAtTime(0.01, ctxTime + 0.7);
                osc.start(ctxTime); osc.stop(ctxTime + 0.7);
                break;

            case 'charge': 
                this._createNoise(ctxTime, 0.5, 'bandpass', vary(600, pitchVariance));
                break;

            case 'hit': 
                this._createNoise(ctxTime, 0.1, 'lowpass', vary(800, pitchVariance));
                osc.type = 'sine';
                osc.frequency.setValueAtTime(vary(100, pitchVariance), ctxTime);
                gain.gain.setValueAtTime(finalVol, ctxTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctxTime + 0.1);
                osc.start(ctxTime); osc.stop(ctxTime + 0.1);
                break;

            case 'ui_click': 
                // UI clicks usually shouldn't vary much so they feel responsive and consistent
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, ctxTime);
                gain.gain.setValueAtTime(this.masterSfxVolume * 0.3, ctxTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctxTime + 0.05);
                osc.start(ctxTime); osc.stop(ctxTime + 0.05);
                break;
        }
    }

    // Helper for complex noise (gunpowder, explosions)
    _createNoise(time, duration, filterType, freq) {
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.value = freq;
        const gain = this.ctx.createGain();
        
        gain.gain.setValueAtTime(this.masterSfxVolume, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(time);
    }
	
clearAllSFXForBattle() {
    const now = Date.now();
    this._sfxGateTime = now + 3000;    // 3 second global block
    this._combatGateTime = now + 3000; // 3 second combat block

    // Stop all currently playing synth/buffer oscillators
    this.activeOscillators.forEach(osc => {
        try { osc.stop(); } catch(e) {}
    });
    this.activeOscillators = [];
    
    console.log("Audio Cleared: SFX and Combat Silenced for 3s.");
}

}



// Global instance to be used across all your files
const AudioManager = new AudioManagerSystem();

// Ensure this is at the end of audio_system.js
if (typeof window.AudioManager === 'undefined') {
    window.AudioManager = new AudioManagerSystem();
}//The AudioManagerSystem is usually instantiated as AudioManager. Make sure it's accessible globally. At the very bottom of your audio_system.js, ensure you have: