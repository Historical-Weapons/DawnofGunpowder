// ============================================================================
// EMPIRE OF THE 13TH CENTURY - SPATIAL TEXT-TO-SPEECH ENGINE
// Handles browser unlock policies, dynamic pitch/rate, spatial volume,
// and strictly filters for East Asian / Middle Eastern accents.
// ============================================================================

(function() {
    "use strict";

    const TTS_STATE = {
        initialized: false,
        voices: [],
        maxHearingDistance: 500, // Slightly increased to allow more ambient queuing
        voiceProfiles: new WeakMap() 
    };

    // ------------------------------------------------------------------------
    // Initialization (Bypassing Browser Autoplay Blocks)
    // ------------------------------------------------------------------------
    function unlockAudio() {
        if (TTS_STATE.initialized) return;

        const synth = window.speechSynthesis;
        const utterance = new SpeechSynthesisUtterance('');
        utterance.volume = 0; 
        synth.speak(utterance);
        
        TTS_STATE.initialized = true;
        console.log("🗣️ City TTS Engine Unlocked & Ready.");

        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
    }

    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

    // ------------------------------------------------------------------------
    // Voice Filtering East Asian 
    // ------------------------------------------------------------------------
function loadVoices() {
    const allVoices = window.speechSynthesis.getVoices();
    
    // Tier 1: Specific Regional Chinese & Asian Accents
    // Includes: Mainland, HK, Taiwan, Macau, plus SG/HK English, Japanese, Korean, Vietnamese, Thai
//const regionalRegex = /zh|ja|ko|vi|th|ms|id|fil|hi|bn|ta|te|mr|gu|kn|ar|fa|ur|he|tr|az|kk|uz|ky|ru|uk|be|en-HK|en-SG|en-IN|en-PH/i;
const regionalRegex = /en/i;
    let selectedVoices = allVoices.filter(v => regionalRegex.test(v.lang));

    // Tier 2: Broad Chinese Fallback
    // If no specific regions are found, grab anything labeled "zh" (Chinese)
  //  if (selectedVoices.length === 0) {
 //       selectedVoices = allVoices.filter(v => v.lang.toLowerCase().startsWith('zh'));
//    }

    // Tier 3: General English Failsafe
    // If the system has zero Chinese language packs, use available English
    //if (selectedVoices.length === 0) {
    //    console.warn("TTS: No regional or Chinese voices found. Falling back to English.");
        selectedVoices = allVoices.filter(v => v.lang.includes('en'));
   // }

    TTS_STATE.voices = selectedVoices;
    
    // Debug: Log the specific voices found to the console
    if (TTS_STATE.voices.length > 0) {
        console.log(`TTS: Loaded ${TTS_STATE.voices.length} voices.`, 
            TTS_STATE.voices.map(v => `${v.name} (${v.lang})`));
    }
}

// Ensure voices are loaded when the browser is ready
if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
}
loadVoices();
    // ------------------------------------------------------------------------
    // Voice Profile Generator
    // ------------------------------------------------------------------------
    function getOrAssignVoiceProfile(npcRef) {
        if (TTS_STATE.voiceProfiles.has(npcRef)) {
            return TTS_STATE.voiceProfiles.get(npcRef);
        }

        const profile = {
            voiceIndex: Math.floor(Math.random() * Math.max(1, TTS_STATE.voices.length)),
            pitch: 0.6 + (Math.random() * 0.8), // Wider variety: 0.6 (Very Deep) to 1.4 (High)
            rate: 0.8 + (Math.random() * 0.35)  // 0.8 (Slow) to 1.15 (Fast)
        };

        TTS_STATE.voiceProfiles.set(npcRef, profile);
        return profile;
    }

    // ------------------------------------------------------------------------
    // Spatial Speech Execution
    // ------------------------------------------------------------------------
    function speakSpatial(text, npcRef, playerObj) {
        if (!TTS_STATE.initialized || !window.speechSynthesis) return;

        // If distance/objects are null, route to the Global announcer
        if (!npcRef || !playerObj) {
            speakGlobal(text);
            return;
        }

        const dist = Math.hypot(npcRef.x - playerObj.x, npcRef.y - playerObj.y);
        
        if (dist > TTS_STATE.maxHearingDistance) return;

        // Queue Management: If the market is insanely busy (more than 4 people queued up to speak),
        // drop this new line UNLESS the NPC is right next to the player.
        if (window.speechSynthesis.pending && window.speechSynthesis.getVoices().length > 4) {
            if (dist > 150) return; // Drop distant voices to keep the queue healthy
        }

        let rawVol = 1.0 - (dist / TTS_STATE.maxHearingDistance);
        let spatialVolume = Math.max(0.05, Math.min(1.0, rawVol));

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.volume = spatialVolume;

        const profile = getOrAssignVoiceProfile(npcRef);
        utterance.pitch = profile.pitch;
        utterance.rate = profile.rate;
        
        if (TTS_STATE.voices.length > 0) {
            let safeIndex = profile.voiceIndex % TTS_STATE.voices.length;
            utterance.voice = TTS_STATE.voices[safeIndex];
        }

        // We DO NOT cancel the queue here anymore. Let them talk sequentially to simulate the crowd!
        window.speechSynthesis.speak(utterance);
    }

    // ------------------------------------------------------------------------
    // Global Speech Execution (For UI, Narrator, or Null Distance)
    // ------------------------------------------------------------------------
    function speakGlobal(text) {
        if (!TTS_STATE.initialized || !window.speechSynthesis) return;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.volume = 1.0;
        utterance.pitch = 1.0; // Standard neutral pitch
        utterance.rate = 1.0;
        
        // Try to find a clear English voice for the narrator, ignoring the accent filter
        const allVoices = window.speechSynthesis.getVoices();
        const narratorVoice = allVoices.find(v => v.lang === 'en-GB' || v.lang === 'en-US');
        if (narratorVoice) {
            utterance.voice = narratorVoice;
        }

        window.speechSynthesis.speak(utterance);
    }

    // Expose to global window
    window.cityTTSEngine = {
        speakSpatial,
        speakGlobal,
        unlockAudio,
        stopAll: () => window.speechSynthesis.cancel() // Handy helper if you need to shut everyone up
    };

})();