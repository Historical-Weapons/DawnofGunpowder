window.attritionDifficultyMultiplier = window.attritionDifficultyMultiplier ?? 1.0;

// ── FIX 4: Sandbox battle troop cap (per side) ───────────────────────────────
// NOTE: the real device-appropriate default (LOW=80 / MED=160 / HIGH=200 /
// MAX=300) is set further below, right after GRAPHICS_QUALITY_TIERS is
// defined, so this cap starts out matching whichever tier the device
// defaults to (MED on mobile, MAX on desktop) instead of a flat 100 for
// everyone. Left here only as a fallback if this script somehow runs out of
// order. The ?? below means: if a save file already set this, that value wins.
window.maxSandboxBattleTroops = window.maxSandboxBattleTroops ?? 100;

// ── Naval AI aggro thresholds ─────────────────────────────────────────────────
window.NAVAL_AI_SETTINGS = window.NAVAL_AI_SETTINGS ?? {
    troopAggroRange:     1600,
    commanderAggroRange: 1600,
};

// ── Mobile detection (mirrors optimization-mobile-battles.js / optimization-battles.js exactly) ──
var _SETTINGS_IS_MOBILE = (
    window.__FORCE_MOBILE_BATTLES__ === true ||
    typeof window.Capacitor !== 'undefined' ||
    /\bwv\b/.test(navigator.userAgent) ||
    window.AndroidInterface != null ||
    (
        /Android/.test(navigator.userAgent) &&
        !/Chrome\/\d/.test(navigator.userAgent) &&
        !/Firefox\/\d/.test(navigator.userAgent)
    )
);

// ════════════════════════════════════════════════════════════════════════
//  GRAPHICS QUALITY PRESET SYSTEM
// ════════════════════════════════════════════════════════════════════════
//
//  Consolidates every individual optimization constant scattered across
//  optimization-battles.js (desktop LOD), optimization-mobile-battles.js
//  (mobile sprite cache / LOD / throttles), optimization-siege.js (siege
//  projectile + ground-effect caps), and ai_categories.js (dead-body and
//  projectile/groundEffect lingering durations) into four simple presets.
//
//  PC ALWAYS RUNS MAX — there is no LOW/MED/HIGH choice on desktop, mirroring
//  how optimization-battles.js already forces desktopBattleQuality toward
//  100 by default. Mobile gets LOW/MED/HIGH, DEFAULTING TO MED on first run
//  (a deliberate "moderate, untested device" baseline — not the most
//  aggressive tier) until the player picks something else; MAX is
//  desktop-exclusive since it assumes the larger naval map (6× vs 3×) and
//  uncapped-by-comparison projectile/ground-effect ceilings that only
//  desktop hardware can sustain.
//
//  Battlefield / naval map WORLD SIZES are intentionally excluded from every
//  tier — those are fixed by platform in optimization-battles.js (PB3) and
//  cannot be adjusted here. They're shown read-only in the Advanced section
//  so the player can see what they're working with.
// ────────────────────────────────────────────────────────────────────────

window.GRAPHICS_QUALITY_TIERS = {
    // ── LOW ─────────────────────────────────────────────────────────────────
    // "Shitty phone" mode. Every CPU-saving throttle is turned on. OPT-IN ONLY
    // — not the device default (see MED below, which is). A player drops
    // here when they've already noticed stutter and want maximum savings.
    //
    // This is the ONLY tier where simulation/render frame rate is ever cut,
    // and the ONLY tier with a hard camera/zoom lock:
    //
    // What this does in optimization-mobile-battles.js (reads mobileBattleQuality < 40):
    //   MB1  Sprite cache ACTIVE  — 4 animation frames (choppy but cheap).
    //        All identical unit types share one cache entry per frame.
    //   MB2  LOD dot zone = 250 px from nearest player unit. Units further
    //        than that render as a single filled circle — zero canvas overhead.
    //   MB5  AI + physics runs at 30 Hz (every other frame). Halves all JS
    //        simulation cost. Projectiles also update at 30 Hz as a result.
    //        ↳ THE ONLY FRAME-RATE CUT IN THE ENTIRE TIER SYSTEM. MED/HIGH/MAX
    //          always run AI + physics + projectiles at full 60 Hz — see MED.
    //   MB16 Viewport cull margin = 0 px. Pixel-perfect: only units inside
    //        the camera rect are drawn at all. (MED uses a wider, "moderate"
    //        150px margin — see MED comment — never this tight.)
    //   MB17 Zoom LOCKED to 0.7–2.5 — the camera lock. Can't zoom out far
    //        enough to see the whole battlefield, which is what keeps MB16's
    //        cull and MB2's dot zone effective. MED/HIGH/MAX never lock zoom.
    //   MB18 Projectile draw radius = 500 px from player. Arrows outside
    //        this radius are skipped before any canvas state changes happen.
    //   MB19 Off-screen units run AI 1-in-8 frames instead of every frame.
    //        On-screen units always run at full rate.
    //   Naval equivalents (naval_battles.js, gated the same way — see
    //   _navGetQual() there): fish/wave/seagull counts cut hardest, their
    //   per-frame update+draw runs at 30 Hz alongside MB5, and they're
    //   viewport-culled with the same 0px pixel-perfect margin as MB16.
    LOW: {
        label: "LOW",
        platform: "mobile",
        battleQuality: 0,
        bodyLingerMs: 1000,
        projectileLingerMs: 15000,
        siegeProjectileCap: 60,
        siegeGroundEffectCap: 90,
        maxBattleTroops: 80,
    },

    // ── MED ─────────────────────────────────────────────────────────────────
    // ★ DEVICE DEFAULT on mobile ★ — what every phone starts on before the
    // player touches a setting. "Moderate" is the operative word: smooth
    // enough on phones with 3 GB+ RAM, but nothing here is as aggressive as
    // LOW and nothing here is as expensive as HIGH/MAX.
    //
    // FRAME RATE: all throttles OFF — simulation, units, and projectiles run
    // at full 60 Hz, identical to desktop. MED/HIGH/MAX never cut frame rate;
    // LOW (above) is the only tier that does.
    //
    // VIEWPORT CULLING: moderate, not absent and not pixel-perfect. MB16's
    // 150px margin and the matching naval cull margin give units/ships room
    // to exist just past the camera edge — wider than LOW's 0px, narrower
    // than HIGH/MAX's 300px.
    //
    // CAMERA: no zoom lock. The player can zoom out as far as the engine
    // normally allows — only LOW restricts this.
    //
    //   MB1  Sprite cache ACTIVE  — up to 12 animation frames (smooth).
    //   MB2  LOD dot zone = 550 px.
    //   MB5  FULL RATE — no skip. AI and projectiles identical to desktop.
    //   MB16 Viewport cull margin = 150 px (moderate).
    //   MB17 / MB18 / MB19  DISABLED (no zoom lock, no projectile cull, no AI skip).
    //   Naval: fish/wave/seagull counts at the desktop-equivalent rate, full
    //   60 Hz update, moderate (150px) viewport cull on their draw calls.
    //   UNIT COUNT: raised well above LOW — MED's spare CPU budget (since
    //   nothing is frame-rate-throttled here) goes toward fielding more
    //   troops instead, per its core design goal.
    MED: {
        label: "MED",
        platform: "mobile",
        battleQuality: 50,
        bodyLingerMs: 1000,
        projectileLingerMs: 30000,
        siegeProjectileCap: 75,
        siegeGroundEffectCap: 115,
        maxBattleTroops: 160,
    },

    // ── HIGH ────────────────────────────────────────────────────────────────
    // Full desktop visual quality on mobile. All caches and throttles OFF.
    //
    //   MB1  Sprite cache BYPASSED — raw draw function every frame.
    //        Full smooth animation, no frame quantization.
    //   MB2  LOD dot zone = 800 px.
    //   MB5  FULL RATE.
    //   MB16 Viewport cull margin = 300 px.
    //   MB17 / MB18 / MB19  DISABLED.
    //   Only difference from PC MAX: PB3 naval map is still the smaller
    //   mobile-sized battlefield (3× base vs 6× on desktop).
    HIGH: {
        label: "HIGH",
        platform: "mobile",
        battleQuality: 100,
        bodyLingerMs: 2000,
        projectileLingerMs: 30000,
        siegeProjectileCap: 90,
        siegeGroundEffectCap: 140,
        maxBattleTroops: 200,
    },

    // ── MAX ─────────────────────────────────────────────────────────────────
    // Desktop always runs here. Identical to HIGH for every opt-file setting,
    // but desktop also gets the 6× naval battlefield (PB3 in optimization-
    // battles.js) and the full desktop LOD system (desktopBattleQuality=100).
    MAX: {
        label: "MAX",
        platform: "desktop",
        battleQuality: 100,
        bodyLingerMs: 3000,
        projectileLingerMs: 45000,
        siegeProjectileCap: 90,
        siegeGroundEffectCap: 140,
        maxBattleTroops: 300,
    },
};

// ── Live battle quality globals (also initialised in their respective opt files) ──
// Mobile defaults to MED ("moderate") on first run — not LOW. LOW is reserved
// for the player explicitly opting into max-savings mode on hardware they
// already know is struggling; an untested device gets the middle tier first.
window.mobileBattleQuality  = window.mobileBattleQuality  ?? window.GRAPHICS_QUALITY_TIERS.MED.battleQuality;
window.desktopBattleQuality = window.GRAPHICS_QUALITY_TIERS.MAX.battleQuality; // Desktop is always max — see _lockDesktopToMax() below.

// ── Lingering-duration globals (read live by ai_categories.js) ──────────────
// Mobile fallback uses MED, matching the new device default above (LOW is
// opt-in only, not what an untested phone should silently start on).
window.bodyLingerMs = window.bodyLingerMs ?? (
    _SETTINGS_IS_MOBILE ? window.GRAPHICS_QUALITY_TIERS.MED.bodyLingerMs : window.GRAPHICS_QUALITY_TIERS.MAX.bodyLingerMs
);
window.projectileLingerMs = window.projectileLingerMs ?? (
    _SETTINGS_IS_MOBILE ? window.GRAPHICS_QUALITY_TIERS.MED.projectileLingerMs : window.GRAPHICS_QUALITY_TIERS.MAX.projectileLingerMs
);

// ── Siege cap globals (read live by optimization-siege.js) ──────────────────
window.siegeProjectileCap = window.siegeProjectileCap ?? (
    _SETTINGS_IS_MOBILE ? window.GRAPHICS_QUALITY_TIERS.MED.siegeProjectileCap : window.GRAPHICS_QUALITY_TIERS.MAX.siegeProjectileCap
);
window.siegeGroundEffectCap = window.siegeGroundEffectCap ?? (
    _SETTINGS_IS_MOBILE ? window.GRAPHICS_QUALITY_TIERS.MED.siegeGroundEffectCap : window.GRAPHICS_QUALITY_TIERS.MAX.siegeGroundEffectCap
);

// ── Max battle troops per side, device-appropriate default ──────────────────
// Overrides the flat 100-default set near the top of this file, now that the
// tier table exists to pull a real device-correct number from.
window.maxSandboxBattleTroops = (window.maxSandboxBattleTroops === 100 || window.maxSandboxBattleTroops == null) ? (
    _SETTINGS_IS_MOBILE ? window.GRAPHICS_QUALITY_TIERS.MED.maxBattleTroops : window.GRAPHICS_QUALITY_TIERS.MAX.maxBattleTroops
) : window.maxSandboxBattleTroops;

// ── Naval viewport-cull margin default ───────────────────────────────────────
// Same idea as BATTLE_CANVAS_CULL_PADDING in viewport_culling_battles.js —
// device-correct value before any tier switch happens. Read live by the
// naval fish/wave/seagull/ship draw culling added to naval_battles.js.
window.NAVAL_CULL_PADDING = window.NAVAL_CULL_PADDING ?? (
    _SETTINGS_IS_MOBILE ? 200 : 400
);

// ── Currently active tier name (or "CUSTOM" once an Advanced value is hand-edited) ──
window.currentGraphicsQualityTier = window.currentGraphicsQualityTier ?? (_SETTINGS_IS_MOBILE ? "MED" : "MAX");

/**
 * Applies every value in a preset tier bundle to the live globals that
 * ai_categories.js, optimization-battles.js, optimization-mobile-battles.js,
 * and optimization-siege.js read from at call-time. Safe to call mid-battle —
 * every consumer re-reads these globals on its next tick rather than caching
 * them at install time.
 */
function applyGraphicsQualityTier(tierName) {
    const tier = window.GRAPHICS_QUALITY_TIERS[tierName];
    if (!tier) return;

    if (tier.platform === "mobile") {
        window.mobileBattleQuality = tier.battleQuality;
    } else {
        window.desktopBattleQuality = tier.battleQuality;
    }

    window.bodyLingerMs          = tier.bodyLingerMs;
    window.projectileLingerMs    = tier.projectileLingerMs;
    window.siegeProjectileCap    = tier.siegeProjectileCap;
    window.siegeGroundEffectCap  = tier.siegeGroundEffectCap;
    window.maxSandboxBattleTroops = tier.maxBattleTroops;
    window.currentGraphicsQualityTier = tierName;

    // ── Sync the top-level "MAX BATTLE TROOPS" slider/label, if present ──────
    // That control lives outside the gq-section DOM subtree (rendered once in
    // createMenu(), not by _renderGraphicsQualitySection()), so a tier switch
    // has to push the new value into it directly.
    const _maxTroopsSlider = document.getElementById("maxtroops-slider");
    const _maxTroopsVal    = document.getElementById("maxtroops-val");
    if (_maxTroopsSlider) _maxTroopsSlider.value = tier.maxBattleTroops;
    if (_maxTroopsVal)    _maxTroopsVal.innerText = tier.maxBattleTroops;

    // ── Terrain canvas cull padding (viewport_culling_battles.js) ───────────
    // LOW keeps the slice very tight (zoom is also restricted by MB17, so the
    // camera rect is small and pop-in is rare).  MED/HIGH/MAX use a generous
    // buffer so cavalry and fast projectiles don't pop in at the edge.
    const q = tier.battleQuality;
    window.BATTLE_CANVAS_CULL_PADDING = q < 40 ? 80 : q < 80 ? 250 : 400;

    // ── Naval viewport-cull margin (naval_battles.js) ────────────────────────
    // Mirrors MB16's land-battle philosophy: LOW = tight pixel-near margin
    // (paired with the camera/zoom lock so pop-in is rare), MED = moderate,
    // HIGH/MAX = generous. Read live by _navGetQual()-gated draw loops for
    // fish/waves/seagulls/ships in naval_battles.js.
    window.NAVAL_CULL_PADDING = q < 40 ? 50 : q < 80 ? 200 : 400;
}

// ── Naval world size lookup (READ-ONLY — cannot be changed from Options) ────
// Mirrors PB_NAVAL_W / PB_NAVAL_H in optimization-battles.js exactly.
function _getNavalMapSizeLabel() {
    return _SETTINGS_IS_MOBILE ? "9600 × 7200 (3× base)" : "19200 × 14400 (6× base)";
}

// ── Volume mapping constants ─────────────────────────────────────────────────
const MUSIC_DEFAULT = 0.075;
const MUSIC_MAX     = 0.30;
const SFX_DEFAULT   = 0.25;
const SFX_MAX       = 1.00;
const SLIDER_PIVOT  = 7;
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

function sliderToPct(v) {
    return Math.round((v / SLIDER_PIVOT) * 100);
}


window.SettingsUI = {
    isOpen: false,
    _advancedExpanded: false,

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
            minWidth: "280px", borderRadius: "10px", fontFamily: "monospace",
            maxHeight: "85vh", overflowY: "auto"
        });

        const initMusicSlider = (typeof AudioManager !== 'undefined')
            ? musicVolToSlider(AudioManager.masterMusicVolume).toFixed(1)
            : SLIDER_PIVOT;
        const initSfxSlider = (typeof AudioManager !== 'undefined')
            ? sfxVolToSlider(AudioManager.masterSfxVolume).toFixed(1)
            : SLIDER_PIVOT;

        const initTroopAggro = window.NAVAL_AI_SETTINGS.troopAggroRange;
        const initCmdrAggro  = window.NAVAL_AI_SETTINGS.commanderAggroRange;

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

            <div style="margin: 20px 0; border-top: 1px solid #5d4037; padding-top: 15px;">
                <label>MAX BATTLE TROOPS PER SIDE (<span id="maxtroops-val">${window.maxSandboxBattleTroops}</span>)</label><br>
                <input type="range" id="maxtroops-slider" min="20" max="300" step="10" value="${window.maxSandboxBattleTroops}"
                    style="width:100%; height:30px; margin:10px 0;">
                <div style="font-size: 0.7rem; color: #aaa; margin-top: 6px; font-style: italic;">
                    Sandbox / story only. Larger armies scale down with their original ratio preserved.
                    Auto-set by the Graphics Quality preset below (MED+ raises this since the spare
                    CPU budget goes toward more troops instead of a frame-rate cut) — drag it
                    yourself to override.
                </div>
            </div>

            <div id="gq-section" style="margin: 20px 0; border-top: 1px solid #5d4037; padding-top: 15px;">
                ${this._renderGraphicsQualitySection()}
            </div>

            <div style="margin: 20px 0; border-top: 1px solid #5d4037; padding-top: 15px;">
                <label style="color:#7ec8e3;">⚓ NAVAL AI — AGGRO RANGE</label>
                <div style="font-size: 0.65rem; color: #888; font-style: italic; margin: 4px 0 10px 0; line-height:1.4;">
                    Distance (px) at which enemies leave their "hold on deck" freeze and start attacking.
                    Changes take effect immediately mid-battle.
                </div>

                <label style="font-size:0.8rem;">TROOP AGGRO RANGE (<span id="troop-aggro-val">${initTroopAggro}</span>px)</label><br>
                <input type="range" id="troop-aggro-slider" min="50" max="6400" step="50" value="${initTroopAggro}"
                    style="width:100%; height:30px; margin:6px 0 12px 0;">

                <label style="font-size:0.8rem;">COMMANDER AGGRO RANGE (<span id="cmdr-aggro-val">${initCmdrAggro}</span>px)</label><br>
                <input type="range" id="cmdr-aggro-slider" min="50" max="6400" step="50" value="${initCmdrAggro}"
                    style="width:100%; height:30px; margin:6px 0 4px 0;">
            </div>

            <button id="close-settings" style="
                background: #d4af37; border: none; padding: 10px 20px; 
                cursor: pointer; font-weight: bold; width: 100%; margin-top:10px;
            ">CLOSE</button>
        `;

        document.body.appendChild(modal);

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
                AudioManager.mp3Volume = AudioManager.masterMusicVolume;
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

        const maxTroopsSlider = document.getElementById("maxtroops-slider");
        const maxTroopsVal    = document.getElementById("maxtroops-val");
        if (maxTroopsSlider) {
            maxTroopsSlider.addEventListener("input", (e) => {
                const cap = parseInt(e.target.value, 10);
                window.maxSandboxBattleTroops = cap;
                if (maxTroopsVal) maxTroopsVal.innerText = cap;

                // Hand-editing this slider drifts it off whichever preset set
                // it, exactly like an Advanced slider edit — same CUSTOM
                // treatment (gold preset badge → yellow CUSTOM).
                window.currentGraphicsQualityTier = "CUSTOM";
                this._refreshGraphicsQualitySection();
            });
        }

        this._bindGraphicsQualitySection();

        const troopAggroSlider = document.getElementById("troop-aggro-slider");
        const troopAggroVal    = document.getElementById("troop-aggro-val");
        if (troopAggroSlider) {
            troopAggroSlider.addEventListener("input", (e) => {
                const val = parseInt(e.target.value, 10);
                window.NAVAL_AI_SETTINGS.troopAggroRange = val;
                if (troopAggroVal) troopAggroVal.innerText = val;
            });
        }

        const cmdrAggroSlider = document.getElementById("cmdr-aggro-slider");
        const cmdrAggroVal    = document.getElementById("cmdr-aggro-val");
        if (cmdrAggroSlider) {
            cmdrAggroSlider.addEventListener("input", (e) => {
                const val = parseInt(e.target.value, 10);
                window.NAVAL_AI_SETTINGS.commanderAggroRange = val;
                if (cmdrAggroVal) cmdrAggroVal.innerText = val;
            });
        }

        document.getElementById("close-settings").onclick = () => {
            modal.style.display = "none";
            this.isOpen = false;
        };
    },

    _renderGraphicsQualitySection() {
        const current = window.currentGraphicsQualityTier;
        const isCustom = current === "CUSTOM";

        // CUSTOM gets its own distinct bright yellow, separate from the gold
        // (#d4af37) used for a clean active preset — so it's visually obvious
        // you've drifted off a preset the moment you touch an Advanced slider.
        const CUSTOM_YELLOW = "#ffd54f";
        const PRESET_GOLD   = "#d4af37";

        let presetButtonsHtml;
        if (_SETTINGS_IS_MOBILE) {
            presetButtonsHtml = ["LOW", "MED", "HIGH"].map(name => {
                const isActive = current === name; // never true while isCustom, by design
                return `
                    <button class="gq-preset-btn" data-tier="${name}" style="
                        flex:1; padding:10px 4px; margin:0 3px; cursor:pointer;
                        font-family:monospace; font-weight:bold; font-size:0.85rem;
                        border-radius:6px; border:2px solid ${isActive ? PRESET_GOLD : '#5d4037'};
                        background:${isActive ? PRESET_GOLD : '#2a2a2a'};
                        color:${isActive ? '#1a1a1a' : '#ccc'};
                    ">${name}</button>`;
            }).join("");
        } else {
            // Desktop's locked badge turns yellow too while CUSTOM, since the
            // Advanced sliders are still hand-editable even with MAX forced.
            presetButtonsHtml = `
                <button disabled style="
                    flex:1; padding:10px 4px; cursor:not-allowed;
                    font-family:monospace; font-weight:bold; font-size:0.85rem;
                    border-radius:6px; border:2px solid ${isCustom ? CUSTOM_YELLOW : PRESET_GOLD};
                    background:${isCustom ? CUSTOM_YELLOW : PRESET_GOLD}; color:#1a1a1a;
                ">${isCustom ? "CUSTOM" : "MAX"}</button>`;
        }

        const tierHint = _SETTINGS_IS_MOBILE
            ? "LOW: max savings — 30 Hz AI/naval, 4-frame sprites, locked-in zoom, fewer troops, pixel-tight cull (siege + naval included) &nbsp;·&nbsp; MED (default): full 60 Hz on every unit/projectile/ship — no frame-rate cuts at all — more troops instead, moderate cull &nbsp;·&nbsp; HIGH: full desktop visual quality, most troops"
            : "Desktop always runs at maximum quality (locked). No LOD, sprite caching, or culling shortcuts are applied.";

        const customNotice = isCustom
            ? `<div style="font-size:0.65rem; color:${CUSTOM_YELLOW}; margin-top:6px; font-style:italic;">
                   CUSTOM — one or more Advanced values have been hand-edited and no longer match a preset.
               </div>`
            : "";

        // Device-correct default for the Reset button's label/target.
        // Mobile resets to MED (moderate baseline), not LOW — LOW is an
        // opt-in choice for players who already know their device struggles.
        const deviceDefaultTier = _SETTINGS_IS_MOBILE ? "MED" : "MAX";

        return `
            <label>GRAPHICS QUALITY — <span id="gq-tier-label" style="color:${isCustom ? CUSTOM_YELLOW : PRESET_GOLD};">${current}</span></label>
            <div id="gq-preset-buttons" style="display:flex; margin:10px 0 6px 0;">
                ${presetButtonsHtml}
            </div>
            <div style="font-size: 0.65rem; color: #888; font-style: italic; line-height:1.4;">
                ${tierHint}
            </div>
            ${customNotice}

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px;">
                <div id="gq-advanced-toggle" style="
                    cursor:pointer; color:#7ec8e3; font-size:0.75rem;
                    user-select:none; text-align:left;
                ">${this._advancedExpanded ? "▼" : "▶"} Advanced (individual settings)</div>

                <button id="gq-reset-default-btn" data-default-tier="${deviceDefaultTier}" style="
                    padding:5px 10px; cursor:pointer; font-family:monospace;
                    font-size:0.65rem; font-weight:bold; border-radius:5px;
                    border:1px solid #7ec8e3; background:transparent; color:#7ec8e3;
                ">↺ RESET TO DEFAULT (${deviceDefaultTier})</button>
            </div>

            <div id="gq-advanced-panel" style="
                display:${this._advancedExpanded ? "block" : "none"};
                text-align:left; margin-top:10px; padding:10px; background:rgba(255,255,255,0.04);
                border-radius:6px; font-size:0.7rem;
            ">
                ${this._renderAdvancedRows()}
            </div>
        `;
    },

    _renderAdvancedRows() {
        const rows = [
            {
                id: "gq-adv-battlequality", label: "Battle Quality (LOD %)",
                value: _SETTINGS_IS_MOBILE ? window.mobileBattleQuality : window.desktopBattleQuality,
                min: 0, max: 100, step: 1,
                // LOCKED on desktop — desktop always runs at MAX (100%). Letting
                // this slider drop desktopBattleQuality below 100 here would
                // silently contradict "desktop is always max" everywhere else
                // in this file, so the input itself is disabled rather than
                // just documented as a convention.
                locked: !_SETTINGS_IS_MOBILE,
                desc: _SETTINGS_IS_MOBILE
                    ? "0% (LOW): 4-frame sprite cache, 30 Hz AI, tight zoom + cull. 50% (MED): 12-frame cache, full 60 Hz, no restrictions. 100% (HIGH): cache bypassed, full desktop animation."
                    : "Locked at 100% on desktop. Desktop hardware always runs at maximum battle quality — there is no LOD or sprite caching to trade away.",
            },
            {
                id: "gq-adv-bodylinger", label: "Dead Body Lingering (ms)",
                value: window.bodyLingerMs,
                min: 500, max: 5000, step: 100,
                desc: "How long a corpse stays on the battlefield before being removed. Commanders never decay.",
            },
            {
                id: "gq-adv-projlinger", label: "Projectile Lingering (ms)",
                value: window.projectileLingerMs,
                min: 5000, max: 60000, step: 1000,
                desc: "How long stuck arrows / bolts / javelins / stones remain visible on the ground or in corpses.",
            },
            {
                id: "gq-adv-siegeproj", label: "Siege Projectile Cap",
                value: window.siegeProjectileCap,
                min: 30, max: 150, step: 5,
                desc: "Max projectiles allowed in-flight during a siege. Oldest are trimmed once exceeded.",
            },
            {
                id: "gq-adv-siegeground", label: "Siege Ground Effect Cap",
                value: window.siegeGroundEffectCap,
                min: 50, max: 250, step: 5,
                desc: "Max stuck-arrow/blood/decal entries allowed during a siege before oldest are evicted.",
            },
        ];

        const editableRowsHtml = rows.map(r => `
            <div style="margin-bottom:10px; ${r.locked ? "opacity:0.55;" : ""}">
                <div style="display:flex; justify-content:space-between; align-items:baseline;">
                    <span>${r.label}${r.locked ? ' <span style="font-size:0.6rem; color:#888;">(locked)</span>' : ""}</span>
                    <span id="${r.id}-val" style="color:#d4af37;">${r.value}</span>
                </div>
                <input type="range" class="gq-adv-input" id="${r.id}" 
                    min="${r.min}" max="${r.max}" step="${r.step}" value="${r.value}"
                    ${r.locked ? "disabled" : ""}
                    style="width:100%; height:24px; margin:4px 0 2px 0; ${r.locked ? "cursor:not-allowed;" : ""}">
                <div style="color:#888; font-style:italic; line-height:1.3;">${r.desc}</div>
            </div>
        `).join("");

        return `
            ${editableRowsHtml}
            <div style="margin-top:6px; padding-top:8px; border-top:1px solid #444;">
                <div style="display:flex; justify-content:space-between;">
                    <span>Naval Battlefield Size</span>
                    <span style="color:#888;">${_getNavalMapSizeLabel()}</span>
                </div>
                <div style="color:#888; font-style:italic; line-height:1.3; margin-top:2px;">
                    Fixed by platform. Battlefield sizes cannot be adjusted.
                </div>
            </div>
        `;
    },

    _bindGraphicsQualitySection() {
        const section = document.getElementById("gq-section");
        if (!section) return;

        section.querySelectorAll(".gq-preset-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                applyGraphicsQualityTier(btn.dataset.tier);
                this._refreshGraphicsQualitySection();
            });
        });

        const advToggle = document.getElementById("gq-advanced-toggle");
        if (advToggle) {
            advToggle.addEventListener("click", () => {
                this._advancedExpanded = !this._advancedExpanded;
                this._refreshGraphicsQualitySection();
            });
        }

        // ── Reset to Default ──────────────────────────────────────────────
        // Snaps every graphics-related global back to whichever tier is
        // correct for THIS device — LOW on mobile, MAX on desktop — read
        // from data-default-tier set at render time in
        // _renderGraphicsQualitySection (deviceDefaultTier), so this never
        // needs its own separate mobile/desktop branch to drift out of sync.
        const resetBtn = document.getElementById("gq-reset-default-btn");
        if (resetBtn) {
            resetBtn.addEventListener("click", () => {
                applyGraphicsQualityTier(resetBtn.dataset.defaultTier);
                this._refreshGraphicsQualitySection();
            });
        }

        this._bindAdvancedInputs();
    },

    _bindAdvancedInputs() {
        const bindings = [
            {
                id: "gq-adv-battlequality",
                apply: (v) => {
                    // DEFENSE IN DEPTH: the input is `disabled` on desktop (see
                    // _renderAdvancedRows' `locked` flag) so this branch should
                    // never actually fire there — disabled inputs don't emit
                    // `input` events. Kept anyway so desktopBattleQuality can
                    // never be set below MAX even if something else dispatches
                    // a synthetic event on this element.
                    if (_SETTINGS_IS_MOBILE) {
                        window.mobileBattleQuality = v;
                    } else {
                        window.desktopBattleQuality = window.GRAPHICS_QUALITY_TIERS.MAX.battleQuality;
                    }
                },
            },
            { id: "gq-adv-bodylinger",    apply: (v) => { window.bodyLingerMs = v; } },
            { id: "gq-adv-projlinger",   apply: (v) => { window.projectileLingerMs = v; } },
            { id: "gq-adv-siegeproj",    apply: (v) => { window.siegeProjectileCap = v; } },
            { id: "gq-adv-siegeground",  apply: (v) => { window.siegeGroundEffectCap = v; } },
        ];

        bindings.forEach(b => {
            const input  = document.getElementById(b.id);
            if (!input) return;
            if (input.disabled) return; // locked row (desktop battle quality) — nothing to bind

            input.addEventListener("input", (e) => {
                const val = parseFloat(e.target.value);
                b.apply(val);
                window.currentGraphicsQualityTier = "CUSTOM";

                // Re-render the whole section from the single source of truth
                // (_renderGraphicsQualitySection) rather than hand-patching
                // individual DOM nodes here. Hand-patching two places to mean
                // the same thing is exactly how the tier label, the preset
                // buttons, and the desktop locked badge previously drifted
                // out of sync on color — this keeps it impossible to miss a
                // spot. We re-read the just-applied value back out of the
                // input's own `value` so the slider position the user is
                // actively dragging isn't reset mid-drag by the re-render.
                this._refreshGraphicsQualitySection();
            });
        });
    },

    _refreshGraphicsQualitySection() {
        const section = document.getElementById("gq-section");
        if (!section) return;
        section.innerHTML = this._renderGraphicsQualitySection();
        this._bindGraphicsQualitySection();
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