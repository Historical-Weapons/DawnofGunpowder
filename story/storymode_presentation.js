// ============================================================================
// STORY MODE PRESENTATION  —  storymode_presentation.js
// ============================================================================
// A presentation-layer module for cinematic story moments: portrait dialogues,
// full-screen fades, art card displays, title cards, and "letterbox" cinematic
// bars.  All visual transitions return Promises so trigger chains can await
// them sequentially.
//
// PUBLIC API  (window.StoryPresentation)
// ─────────────────────────────────────────────────────────────────────────
//   showDialogue(lines, opts)        Display a sequence of NPC dialogue lines
//                                    with portraits, name plates, and a
//                                    typewriter effect.  Auto-advance with
//                                    Click / Space / Enter / tap.
//                                    lines = [{ portrait, name, text,
//                                               side, color, voice }]
//
//   fadeIn(durationMs, color)        Fade FROM color TO transparent
//   fadeOut(durationMs, color)       Fade FROM transparent TO color (and stay)
//   fadeFlash(color, ms)             Quick screen flash
//
//   showArt(url, opts)               Full-screen image card (Ken-Burns optional)
//                                    Returns a Promise that resolves when the
//                                    user dismisses (or auto-dismisses).
//
//   showTitle({title, subtitle, ms}) Big title card (e.g. "Chapter I — Hakata")
//
//   showLetterbox(on)                Toggle cinematic black bars on top/bottom
//
//   showSubtitle(text, ms, color)    Bottom-of-screen subtitle (no portrait)
//
//   skip()                           Skip the currently-playing animation
//   isBusy()                         True while a presentation is on screen
//
//   registerPortrait(name, url)      Cache a portrait URL by NPC name so you
//                                    don't have to pass it in every line
//
//   _state                           Exposed for debugging
//
// NO LIBRARIES.  Pure DOM + CSS.  Mobile-friendly (tap to advance, responsive
// portrait sizing, scales subtitles for narrow viewports).
// ============================================================================

window.StoryPresentation = (function () {
"use strict";

// ── Internal state ──────────────────────────────────────────────────────────
const sp = {
    rootEl:        null,    // The full-screen presentation container
    fadeEl:        null,    // The opaque fade overlay
    letterboxTop:  null,    // Top cinematic bar
    letterboxBot:  null,    // Bottom cinematic bar
    dialogueEl:    null,    // The dialogue card container
    artEl:         null,    // The art card container
    titleEl:       null,    // The title card container
    subtitleEl:    null,    // The persistent subtitle line
    busy:          false,   // True while any presentation is in progress
    skipReq:       false,   // Skip the current animation if true
    activeAdvance: null,    // Function to call to advance dialogue (cleared on close)

    // Portrait registry: NPC name → URL (data: or http:)
    portraits:     {},

    // Letterbox state
    letterboxOn:   false
};

// ── Style injection (one-shot, idempotent) ──────────────────────────────────
function _injectCss() {
    if (document.getElementById("storymode-presentation-css")) return;

    const style = document.createElement("style");
    style.id = "storymode-presentation-css";
    style.textContent = `
        #sp-root {
            position: fixed; inset: 0;
            pointer-events: none;
            z-index: 18000;
            font-family: 'Georgia', 'Palatino', serif;
            color: #f0e0c0;
            overflow: hidden;
        }
        #sp-fade {
            position: absolute; inset: 0;
            background: #000;
            opacity: 0;
            pointer-events: none;
            transition: opacity 1s ease-in-out;
            z-index: 18001;
        }
        .sp-letterbox {
            position: absolute; left: 0; right: 0;
            height: 0;
            background: #000;
            transition: height 0.6s cubic-bezier(.55,.05,.45,.95);
            pointer-events: none;
            z-index: 18002;
        }
        .sp-letterbox.top    { top: 0; }
        .sp-letterbox.bot    { bottom: 0; }
        .sp-letterbox.active { height: 12vh; }

        /* Dialogue card --------------------------------------------------- */
        #sp-dialogue {
            position: absolute;
            left: 5%; right: 5%;
            bottom: 6%;
            max-width: 1100px;
            margin: 0 auto;
            min-height: 180px;
            background: linear-gradient(
                to bottom,
                rgba(20,15,8,0.92), rgba(35,25,15,0.96)
            );
            border: 3px solid #8a6a3a;
            border-radius: 8px;
            box-shadow:
                0 0 40px rgba(0,0,0,0.85),
                inset 0 0 24px rgba(0,0,0,0.6);
            padding: 18px 22px 22px 22px;
            display: none;
            pointer-events: auto;
            cursor: pointer;
            opacity: 0;
            transform: translateY(40px);
            transition: opacity 0.4s ease, transform 0.4s ease;
        }
        #sp-dialogue.shown {
            opacity: 1;
            transform: translateY(0);
            display: block;
        }
        #sp-dialogue .sp-portrait-frame {
            position: absolute;
            top: -50px;
            width: 110px; height: 110px;
            border: 3px solid #8a6a3a;
            border-radius: 6px;
            background: #1a1208 center/cover no-repeat;
            box-shadow: 0 4px 16px rgba(0,0,0,0.8);
        }
        #sp-dialogue .sp-portrait-frame.left  { left: 18px; }
        #sp-dialogue .sp-portrait-frame.right { right: 18px; }
        #sp-dialogue .sp-portrait-frame.empty {
            display: flex; align-items: center; justify-content: center;
            color: #8a6a3a; font-size: 38px; font-weight: bold;
        }

        #sp-dialogue .sp-name-plate {
            position: absolute; top: -22px;
            background: linear-gradient(to bottom, #8a6a3a, #5a4220);
            color: #fff; font-weight: bold;
            padding: 4px 14px;
            border-radius: 4px;
            font-size: 14px;
            letter-spacing: 1px;
            text-shadow: 1px 1px 2px #000;
            box-shadow: 0 2px 6px rgba(0,0,0,0.6);
            white-space: nowrap;
        }
        #sp-dialogue .sp-name-plate.left  { left: 140px; }
        #sp-dialogue .sp-name-plate.right { right: 140px; }

        #sp-dialogue .sp-text-body {
            font-size: 18px;
            line-height: 1.55;
            color: #f5e6c8;
            min-height: 80px;
            padding: 14px 130px 0 130px;
            text-shadow: 1px 1px 2px #000;
            word-wrap: break-word;
            white-space: pre-wrap;
        }

        #sp-dialogue .sp-prompt {
            position: absolute;
            bottom: 8px; right: 16px;
            color: #d4b886;
            font-size: 12px;
            font-style: italic;
            opacity: 0.65;
            animation: spPulse 1.2s ease-in-out infinite;
        }
        @keyframes spPulse {
            0%, 100% { opacity: 0.35; }
            50%      { opacity: 0.95; }
        }

        /* Title card ------------------------------------------------------ */
        #sp-title {
            position: absolute;
            inset: 0;
            display: none;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            pointer-events: auto;
            z-index: 18003;
            background: rgba(0,0,0,0.4);
            opacity: 0;
            transition: opacity 0.8s ease;
        }
        #sp-title.shown { display: flex; opacity: 1; }
        #sp-title .sp-title-main {
            font-size: clamp(32px, 6vw, 72px);
            font-weight: bold;
            letter-spacing: 4px;
            color: #f5e6c8;
            text-shadow: 0 0 24px #000, 2px 2px 4px #000;
            text-align: center;
            padding: 0 20px;
        }
        #sp-title .sp-title-sub {
            font-size: clamp(16px, 2.4vw, 26px);
            color: #d4b886;
            letter-spacing: 2px;
            margin-top: 14px;
            font-style: italic;
            text-shadow: 1px 1px 3px #000;
            text-align: center;
            padding: 0 20px;
        }

        /* Art card -------------------------------------------------------- */
        #sp-art {
            position: absolute; inset: 0;
            display: none;
            background: #000 center/contain no-repeat;
            pointer-events: auto;
            cursor: pointer;
            opacity: 0;
            transition: opacity 1s ease;
            z-index: 18002;
        }
        #sp-art.shown { display: block; opacity: 1; }
        #sp-art.kenburns {
            animation: spKenBurns 12s ease-in-out forwards;
        }
        @keyframes spKenBurns {
            0%   { transform: scale(1.0); }
            100% { transform: scale(1.12); }
        }

        /* Subtitle (bottom of screen, no portrait) ------------------------ */
        #sp-subtitle {
            position: absolute;
            left: 10%; right: 10%; bottom: 14vh;
            font-size: clamp(14px, 2vw, 22px);
            color: #f5e6c8;
            background: rgba(0,0,0,0.55);
            padding: 8px 18px;
            border-radius: 4px;
            text-align: center;
            pointer-events: none;
            text-shadow: 1px 1px 2px #000;
            display: none;
            opacity: 0;
            transition: opacity 0.4s ease;
            z-index: 18002;
        }
        #sp-subtitle.shown { display: block; opacity: 1; }

        /* Mobile / narrow tweaks ----------------------------------------- */
        @media (max-width: 720px) {
            #sp-dialogue {
                min-height: 200px;
                left: 2%; right: 2%;
                bottom: 4%;
                padding: 14px 14px 16px 14px;
            }
            #sp-dialogue .sp-portrait-frame {
                width: 70px; height: 70px;
                top: -34px;
            }
            #sp-dialogue .sp-portrait-frame.left  { left: 10px; }
            #sp-dialogue .sp-portrait-frame.right { right: 10px; }
            #sp-dialogue .sp-name-plate.left  { left: 88px; }
            #sp-dialogue .sp-name-plate.right { right: 88px; }
            #sp-dialogue .sp-text-body {
                font-size: 14px;
                padding: 8px 80px 0 80px;
                min-height: 60px;
            }
            #sp-dialogue .sp-prompt { font-size: 10px; }
        }
    `;
    document.head.appendChild(style);
}

// ── DOM bootstrap ───────────────────────────────────────────────────────────
function _ensureRoot() {
    if (sp.rootEl) return sp.rootEl;
    _injectCss();

    const root = document.createElement("div");
    root.id = "sp-root";

    // Fade overlay
    const fade = document.createElement("div");
    fade.id = "sp-fade";
    root.appendChild(fade);
    sp.fadeEl = fade;

    // Letterbox bars
    const lbT = document.createElement("div");
    lbT.className = "sp-letterbox top";
    const lbB = document.createElement("div");
    lbB.className = "sp-letterbox bot";
    root.appendChild(lbT); root.appendChild(lbB);
    sp.letterboxTop = lbT; sp.letterboxBot = lbB;

    // Art card
    const art = document.createElement("div");
    art.id = "sp-art";
    root.appendChild(art);
    sp.artEl = art;

    // Title card
    const title = document.createElement("div");
    title.id = "sp-title";
    title.innerHTML = `
        <div class="sp-title-main"></div>
        <div class="sp-title-sub"></div>
    `;
    root.appendChild(title);
    sp.titleEl = title;

    // Subtitle
    const sub = document.createElement("div");
    sub.id = "sp-subtitle";
    root.appendChild(sub);
    sp.subtitleEl = sub;

    // Dialogue card
    const dlg = document.createElement("div");
    dlg.id = "sp-dialogue";
    dlg.innerHTML = `
        <div class="sp-portrait-frame left"  style="display:none;"></div>
        <div class="sp-portrait-frame right" style="display:none;"></div>
        <div class="sp-name-plate left"  style="display:none;"></div>
        <div class="sp-name-plate right" style="display:none;"></div>
        <div class="sp-text-body"></div>
        <div class="sp-prompt">▶ click / space to continue</div>
    `;
    root.appendChild(dlg);
    sp.dialogueEl = dlg;

    document.body.appendChild(root);
    sp.rootEl = root;

    // Global advance keys for dialogue
    window.addEventListener("keydown", (e) => {
        if (!sp.activeAdvance) return;
        if (e.key === " " || e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            sp.activeAdvance(e.key === "Escape");
        }
    });

    return root;
}

// ── Sleep / animation helper ────────────────────────────────────────────────
function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ FADE / FLASH                                                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function fadeOut(durationMs, color) {
    _ensureRoot();
    color = color || "#000000";
    durationMs = (typeof durationMs === "number") ? durationMs : 1000;

    sp.fadeEl.style.background = color;
    sp.fadeEl.style.transition = `opacity ${durationMs}ms ease-in-out`;
    // Force reflow before changing opacity to make sure transition kicks in
    void sp.fadeEl.offsetWidth;
    sp.fadeEl.style.opacity = "1";

    return _sleep(durationMs);
}

function fadeIn(durationMs, color) {
    _ensureRoot();
    color = color || "#000000";
    durationMs = (typeof durationMs === "number") ? durationMs : 1000;

    sp.fadeEl.style.background = color;
    sp.fadeEl.style.transition = `opacity ${durationMs}ms ease-in-out`;
    void sp.fadeEl.offsetWidth;
    sp.fadeEl.style.opacity = "0";

    return _sleep(durationMs);
}

async function fadeFlash(color, ms) {
    _ensureRoot();
    color = color || "#ffffff";
    ms = ms || 200;

    sp.fadeEl.style.transition = "opacity 60ms linear";
    sp.fadeEl.style.background = color;
    void sp.fadeEl.offsetWidth;
    sp.fadeEl.style.opacity = "0.85";
    await _sleep(60);
    sp.fadeEl.style.transition = `opacity ${ms}ms ease-out`;
    sp.fadeEl.style.opacity = "0";
    await _sleep(ms);
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ LETTERBOX                                                                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function showLetterbox(on) {
    _ensureRoot();
    sp.letterboxOn = !!on;
    sp.letterboxTop.classList.toggle("active", sp.letterboxOn);
    sp.letterboxBot.classList.toggle("active", sp.letterboxOn);
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ TITLE CARD                                                                ║
// ╚══════════════════════════════════════════════════════════════════════════╝
async function showTitle(opts) {
    _ensureRoot();
    opts = opts || {};
    const title    = opts.title    || "";
    const subtitle = opts.subtitle || "";
    const ms       = (typeof opts.ms === "number") ? opts.ms : 3500;

    sp.titleEl.querySelector(".sp-title-main").textContent = title;
    sp.titleEl.querySelector(".sp-title-sub").textContent  = subtitle;

    sp.busy = true;
    sp.titleEl.classList.add("shown");

    // Hold, then dismiss
    await _sleep(ms);

    sp.titleEl.classList.remove("shown");
    await _sleep(800);  // wait for fade-out CSS transition
    sp.busy = false;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ ART CARD                                                                  ║
// ║                                                                           ║
// ║   showArt(url, { ms, kenburns, clickToAdvance })                          ║
// ║                                                                           ║
// ║   url can be a data: URI (so scenarios can ship art inside the JSON)     ║
// ║   or a regular http(s) URL.                                               ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function showArt(url, opts) {
    return new Promise(resolve => {
        _ensureRoot();
        opts = opts || {};
        const ms        = (typeof opts.ms === "number") ? opts.ms : 4000;
        const kenburns  = !!opts.kenburns;
        const clickAdv  = (opts.clickToAdvance !== false);

        sp.busy = true;
        sp.artEl.style.backgroundImage = `url("${url}")`;
        sp.artEl.classList.toggle("kenburns", kenburns);
        sp.artEl.classList.add("shown");

        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            sp.artEl.removeEventListener("click", finish);
            sp.artEl.classList.remove("shown");
            setTimeout(() => {
                sp.artEl.classList.remove("kenburns");
                sp.artEl.style.backgroundImage = "";
                sp.busy = false;
                resolve();
            }, 1000);
        };

        if (clickAdv) sp.artEl.addEventListener("click", finish, { once: true });
        if (ms > 0) setTimeout(finish, ms);
    });
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ SUBTITLE                                                                  ║
// ╚══════════════════════════════════════════════════════════════════════════╝
async function showSubtitle(text, ms, color) {
    _ensureRoot();
    sp.subtitleEl.textContent = text;
    if (color) sp.subtitleEl.style.color = color;
    else sp.subtitleEl.style.color = "";
    sp.subtitleEl.classList.add("shown");
    if (typeof ms === "number" && ms > 0) {
        await _sleep(ms);
        sp.subtitleEl.classList.remove("shown");
    }
}
function hideSubtitle() {
    if (sp.subtitleEl) sp.subtitleEl.classList.remove("shown");
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ DIALOGUE                                                                  ║
// ║                                                                           ║
// ║   showDialogue(lines, opts)                                               ║
// ║                                                                           ║
// ║   lines = [{                                                              ║
// ║     portrait: "data:image/png;base64,..." | "url" | null,                ║
// ║     name:     "Hojo Tokimune",                                            ║
// ║     text:     "We must hold the bay.",                                    ║
// ║     side:     "left" | "right"  (default "left"),                        ║
// ║     color:    "#ffd700"  (name-plate background tint)                     ║
// ║   }, ...]                                                                 ║
// ║                                                                           ║
// ║   opts = {                                                                ║
// ║     typewriterCps: 40,        // chars per second; 0 disables typewriter ║
// ║     autoAdvanceMs: 0,         // 0 = wait for click; >0 = auto-advance   ║
// ║     onLine: function(idx, line),                                          ║
// ║     dimGame: true,            // dim the game canvas while talking       ║
// ║     letterbox: true           // show cinematic bars                      ║
// ║   }                                                                       ║
// ║                                                                           ║
// ║   Returns: Promise<void>  (resolves when all lines are dismissed)         ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function showDialogue(lines, opts) {
    return new Promise(async (resolve) => {
        _ensureRoot();
        opts = opts || {};
        if (!Array.isArray(lines)) lines = [lines];
        if (lines.length === 0) { resolve(); return; }

        const cps           = (typeof opts.typewriterCps === "number") ? opts.typewriterCps : 40;
        const autoAdvance   = (typeof opts.autoAdvanceMs === "number") ? opts.autoAdvanceMs : 0;
        const showLetterbox_= (opts.letterbox !== false);
        const onLine        = typeof opts.onLine === "function" ? opts.onLine : null;

        if (showLetterbox_) showLetterbox(true);

        sp.busy = true;
        sp.dialogueEl.classList.add("shown");

        let idx = 0;
        let typewriterTimer = null;
        let lineDone = false;
        let resolveLine = null;

        // Set up the global advance hook
        sp.activeAdvance = (escape) => {
            if (escape) {
                // ESC = bail entire sequence
                if (typewriterTimer) clearInterval(typewriterTimer);
                if (resolveLine) resolveLine("skip-all");
            } else {
                if (!lineDone) {
                    // Skip the typewriter: instantly print full text
                    if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; }
                    sp.dialogueEl.querySelector(".sp-text-body").textContent = lines[idx].text || "";
                    lineDone = true;
                } else {
                    // Advance to next line
                    if (resolveLine) resolveLine("next");
                }
            }
        };

        // Click anywhere on the dialogue to advance
        const clickHandler = () => sp.activeAdvance(false);
        sp.dialogueEl.addEventListener("click", clickHandler);

        // Process each line sequentially
        for (idx = 0; idx < lines.length; idx++) {
            const line = lines[idx];
            const portraitFrameL = sp.dialogueEl.querySelector(".sp-portrait-frame.left");
            const portraitFrameR = sp.dialogueEl.querySelector(".sp-portrait-frame.right");
            const nameplateL     = sp.dialogueEl.querySelector(".sp-name-plate.left");
            const nameplateR     = sp.dialogueEl.querySelector(".sp-name-plate.right");
            const body           = sp.dialogueEl.querySelector(".sp-text-body");
            const prompt         = sp.dialogueEl.querySelector(".sp-prompt");

            // Resolve portrait URL: explicit > registered-by-name > fallback initial
            let portraitUrl = line.portrait || sp.portraits[line.name] || null;
            const side      = (line.side === "right") ? "right" : "left";

            // Hide both portraits, then show only the active side
            portraitFrameL.style.display = "none";
            portraitFrameR.style.display = "none";
            nameplateL.style.display     = "none";
            nameplateR.style.display     = "none";

            const activeFrame = (side === "left") ? portraitFrameL : portraitFrameR;
            const activePlate = (side === "left") ? nameplateL     : nameplateR;

            if (portraitUrl) {
                activeFrame.style.backgroundImage = `url("${portraitUrl}")`;
                activeFrame.classList.remove("empty");
                activeFrame.textContent = "";
            } else {
                activeFrame.style.backgroundImage = "";
                activeFrame.classList.add("empty");
                activeFrame.textContent = (line.name || "?").charAt(0).toUpperCase();
            }
            activeFrame.style.display = "block";

            if (line.name) {
                activePlate.textContent = line.name;
                if (line.color) {
                    activePlate.style.background =
                        `linear-gradient(to bottom, ${line.color}, ${_darken(line.color, 0.5)})`;
                } else {
                    activePlate.style.background = "";
                }
                activePlate.style.display = "block";
            }

            if (onLine) {
                try { onLine(idx, line); } catch (e) { console.warn("onLine error:", e); }
            }

            // Typewriter
            body.textContent = "";
            lineDone = false;
            const fullText = line.text || "";

            if (cps > 0 && fullText.length > 0) {
                const intervalMs = Math.max(8, Math.floor(1000 / cps));
                let pos = 0;
                typewriterTimer = setInterval(() => {
                    pos++;
                    body.textContent = fullText.substring(0, pos);
                    if (pos >= fullText.length) {
                        clearInterval(typewriterTimer);
                        typewriterTimer = null;
                        lineDone = true;
                    }
                }, intervalMs);
            } else {
                body.textContent = fullText;
                lineDone = true;
            }

            // Wait for advance signal
            const result = await new Promise(r => {
                resolveLine = r;
                if (autoAdvance > 0) {
                    setTimeout(() => { if (resolveLine) r("auto"); }, autoAdvance + (fullText.length * 1000 / Math.max(1, cps)));
                }
            });
            resolveLine = null;
            if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; }

            if (result === "skip-all") break;
        }

        // Cleanup
        sp.dialogueEl.removeEventListener("click", clickHandler);
        sp.activeAdvance = null;
        sp.dialogueEl.classList.remove("shown");
        if (showLetterbox_) showLetterbox(false);

        await _sleep(450);
        sp.busy = false;
        resolve();
    });
}

// ── Color helper ────────────────────────────────────────────────────────────
function _darken(hex, factor) {
    if (!hex || hex[0] !== "#") return hex || "#000";
    let r = parseInt(hex.substr(1, 2), 16);
    let g = parseInt(hex.substr(3, 2), 16);
    let b = parseInt(hex.substr(5, 2), 16);
    r = Math.floor(r * (1 - factor));
    g = Math.floor(g * (1 - factor));
    b = Math.floor(b * (1 - factor));
    return "#" +
        r.toString(16).padStart(2, "0") +
        g.toString(16).padStart(2, "0") +
        b.toString(16).padStart(2, "0");
}

// ── Portrait registry ───────────────────────────────────────────────────────
function registerPortrait(name, url) {
    if (!name) return;
    sp.portraits[name] = url || null;
}
function registerPortraitsBulk(map) {
    if (!map || typeof map !== "object") return;
    Object.assign(sp.portraits, map);
}
function clearPortraits() { sp.portraits = {}; }

// ── Skip / status ───────────────────────────────────────────────────────────
function skip() {
    if (sp.activeAdvance) sp.activeAdvance(true);
}
function isBusy() { return !!sp.busy; }

function clear() {
    if (sp.dialogueEl) sp.dialogueEl.classList.remove("shown");
    if (sp.titleEl)    sp.titleEl.classList.remove("shown");
    if (sp.artEl)      sp.artEl.classList.remove("shown");
    if (sp.subtitleEl) sp.subtitleEl.classList.remove("shown");
    sp.activeAdvance = null;
    sp.busy = false;
    showLetterbox(false);
}

// ── Public API ──────────────────────────────────────────────────────────────
return {
    showDialogue,
    fadeIn,
    fadeOut,
    fadeFlash,
    showArt,
    showTitle,
    showLetterbox,
    showSubtitle,
    hideSubtitle,
    skip,
    isBusy,
    clear,
    registerPortrait,
    registerPortraitsBulk,
    clearPortraits,
    _state: sp
};

})();

console.log("[StoryPresentation] storymode_presentation.js loaded — ready.");
