window.attritionDifficultyMultiplier = window.attritionDifficultyMultiplier ?? 1.0;

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

        modal.innerHTML = `
            <h2 style="margin-top:0; color:#d4af37;">OPTIONS</h2>
            
            <div style="margin: 20px 0;">
                <label>MUSIC VOLUME</label><br>
                <input type="range" id="music-slider" min="0" max="2" step="0.1" value="1" 
                    style="width:100%; height:30px; margin:10px 0;">
            </div>

            <div style="margin: 20px 0;">
                <label>SFX VOLUME</label><br>
                <input type="range" id="sfx-slider" min="0" max="2" step="0.1" value="1" 
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
        const sfxSlider = document.getElementById("sfx-slider");
        const diffSlider = document.getElementById("diff-slider");
        const diffVal = document.getElementById("diff-val");

        // Set initial values based on current state
        if (typeof AudioManager !== 'undefined') {
            musicSlider.value = AudioManager.masterMusicVolume / 0.15; // Normalized
            sfxSlider.value = AudioManager.masterSfxVolume / 0.5;
        }

musicSlider.addEventListener("input", (e) => {
            const val = parseFloat(e.target.value);
            if (typeof AudioManager !== 'undefined') {
                AudioManager.masterMusicVolume = 0.15 * val;
                AudioManager.mp3Volume = AudioManager.masterMusicVolume; // <--- KEEP PLAYLIST SYNCED
                // Update active MP3 volume immediately
                if (AudioManager.currentMp3) AudioManager.currentMp3.volume = AudioManager.masterMusicVolume;
            }
        });
        sfxSlider.addEventListener("input", (e) => {
            const val = parseFloat(e.target.value);
            if (typeof AudioManager !== 'undefined') {
                AudioManager.masterSfxVolume = 0.5 * val;
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