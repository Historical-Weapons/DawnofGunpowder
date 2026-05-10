window.attritionDifficultyMultiplier = window.attritionDifficultyMultiplier ?? 1.0;

// ── Volume mapping constants ─────────────────────────────────────────────────
// Sliders run 0–10. The pivot at 7 (70% of bar) = the new default volume.
// Below 7: fine-grained lowering (70% of travel). Above 7: modest boost (30%).
// New defaults are 50% lower than the old defaults (music: 0.075, sfx: 0.25).
const MUSIC_DEFAULT = 0.075;   // was 0.15  (50 % reduction)
const MUSIC_MAX     = 0.30;    // ceiling kept the same as before
const SFX_DEFAULT   = 0.25;    // was 0.50  (50 % reduction)
const SFX_MAX       = 1.00;    // ceiling kept the same as before
const SLIDER_PIVOT  = 7;       // 70 % of 0–10 range
const SLIDER_MAX    = 10;

function sliderToMusicVol(v) {
    if (v <= SLIDER_PIVOT)
        return (v / SLIDER_PIVOT) * MUSIC_DEFAULT;
    return MUSIC_DEFAULT + ((v - SLIDER_PIVOT) / (SLIDER_MAX - SLIDER_PIVOT)) * (MUSIC_MAX - MUSIC_DEFAULT);
}

function sliderToSfxVol(v) {
    if (v <= SLIDER_PIVOT)
        return (v / SLIDER_PIVOT) * SFX_DEFAULT;
    return SFX_DEFAULT + ((v - SLIDER_PIVOT) / (SLIDER_MAX - SLIDER_PIVOT)) * (SFX_MAX - SFX_DEFAULT);
}

function musicVolToSlider(vol) {
    if (vol <= MUSIC_DEFAULT)
        return (vol / MUSIC_DEFAULT) * SLIDER_PIVOT;
    return SLIDER_PIVOT + ((vol - MUSIC_DEFAULT) / (MUSIC_MAX - MUSIC_DEFAULT)) * (SLIDER_MAX - SLIDER_PIVOT);
}

function sfxVolToSlider(vol) {
    if (vol <= SFX_DEFAULT)
        return (vol / SFX_DEFAULT) * SLIDER_PIVOT;
    return SLIDER_PIVOT + ((vol - SFX_DEFAULT) / (SFX_MAX - SFX_DEFAULT)) * (SLIDER_MAX - SLIDER_PIVOT);
}

// ── Percentage label: 100 % = default, scales linearly for display ───────────
function sliderToPct(v) {
    return Math.round((v / SLIDER_PIVOT) * 100);
}

window.SettingsUI = {
    isOpen: false,

    createMenu() {
        if (document.getElementById("settings-modal")) return;

        const modal = document.createElement("div");
        modal.id = "settings-modal";
        Object.assign(modal.style, {
            position: "fixed", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            backgroundColor: "rgba(0, 0, 0, 0.9)",
            border: "2px solid #d4af37", padding: "20px",
            zIndex: "20000", color: "white", textAlign: "center",
            minWidth: "280px", borderRadius: "10px", fontFamily: "monospace"
        });

        const initMusicSlider = (typeof AudioManager !== 'undefined')
            ? musicVolToSlider(AudioManager.masterMusicVolume).toFixed(1)
            : SLIDER_PIVOT;
        const initSfxSlider = (typeof AudioManager !== 'undefined')
            ? sfxVolToSlider(AudioManager.masterSfxVolume).toFixed(1)
            : SLIDER_PIVOT;

        modal.innerHTML = `
            <h2 style="margin-top:0; color:#d4af37;">OPTIONS</h2>
            
            <div style="margin: 20px 0;">
                <label>MUSIC VOLUME (<span id="music-pct">${sliderToPct(initMusicSlider)}%</span>)</label><br>
                <input type="range" id="music-slider" min="0" max="${SLIDER_MAX}" step="0.1" value="${initMusicSlider}" 
                    style="width:100%; height:30px; margin:10px 0;">
            </div>

            <div style="margin: 20px 0;">
                <label>SFX VOLUME (<span id="sfx-pct">${sliderToPct(initSfxSlider)}%</span>)</label><br>
                <input type="range" id="sfx-slider" min="0" max="${SLIDER_MAX}" step="0.1" value="${initSfxSlider}" 
                    style="width:100%; height:30px; margin:10px 0;">
            </div>

            <div style="margin: 20px 0;">
                <label>ATTRITION RATE (<span id="diff-val">${Math.round(window.attritionDifficultyMultiplier * 100)}%</span>)</label><br>
                <input type="range" id="diff-slider" min="0" max="2" step="0.1" value="${window.attritionDifficultyMultiplier}" 
                    style="width:100%; height:30px; margin:10px 0;">
            </div>

            <button id="close-settings" style="
                background: #d4af37; border: none; padding: 10px 20px; 
                cursor: pointer; font-weight: bold; width: 100%; margin-top:10px;
            ">CLOSE</button>
        `;

        document.body.appendChild(modal);

        // --- HOOKS TO AUDIO & GAME SYSTEMS ---
        const musicSlider = document.getElementById("music-slider");
        const sfxSlider   = document.getElementById("sfx-slider");
        const diffSlider  = document.getElementById("diff-slider");
        const diffVal     = document.getElementById("diff-val");
        const musicPct    = document.getElementById("music-pct");
        const sfxPct      = document.getElementById("sfx-pct");

        musicSlider.addEventListener("input", (e) => {
            const v = parseFloat(e.target.value);
            musicPct.innerText = sliderToPct(v) + "%";
            if (typeof AudioManager !== 'undefined') {
                AudioManager.masterMusicVolume = sliderToMusicVol(v);
                AudioManager.mp3Volume = AudioManager.masterMusicVolume; // Keep playlist synced
                if (AudioManager.currentMp3) AudioManager.currentMp3.volume = AudioManager.masterMusicVolume;
            }
        });

        sfxSlider.addEventListener("input", (e) => {
            const v = parseFloat(e.target.value);
            sfxPct.innerText = sliderToPct(v) + "%";
            if (typeof AudioManager !== 'undefined') {
                AudioManager.masterSfxVolume = sliderToSfxVol(v);
            }
        });

        if (diffSlider) {
            diffSlider.addEventListener("input", (e) => {
                const val = parseFloat(e.target.value);
                window.attritionDifficultyMultiplier = val;
                diffVal.innerText = Math.round(val * 100) + "%";
            });
        }

        document.getElementById("close-settings").onclick = () => {
            modal.style.display = "none";
            this.isOpen = false;
        };
    },

    toggle() {
        const modal = document.getElementById("settings-modal");
        if (!modal) {
            this.createMenu();
        } else {
            modal.style.display = modal.style.display === "none" ? "block" : "none";
        }
        this.isOpen = (modal?.style.display !== "none");
    }
};