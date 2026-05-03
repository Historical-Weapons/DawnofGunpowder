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
    rootEl:        null,
    fadeEl:        null,
    letterboxTop:  null,
    letterboxBot:  null,
    dialogueEl:    null,
    artEl:         null,
    artCaptionEl:  null,
    titleEl:       null,
    subtitleEl:    null,
    busy:          false,
    skipReq:       false,
    activeAdvance: null,
    portraits:     {},
    letterboxOn:   false,
    artFinish:     null,
    artGen:        0,       // increments each showArt call; lets finish() detect staleness

    // ── Step 8: Global FIFO presentation mutex ───────────────────────────
    // All public show*/fade* methods route through _enqueue so only ONE
    // presentation runs at a time and calls play in the order they were made.
    _queue:          [],
    _queueRunning:   false,

    // Tracks when the last showDialogue() finished — used by Parler to
    // enforce a 1-second cooldown (Step 10).
    _lastDialogueEndedAt: 0,

    // Step 8: text-pop default. Set typewriterCps > 0 per-call to re-enable
    // the typewriter effect for a specific dialogue sequence.
    defaultTypewriterCps: 0
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
            /* z-index 18004 sits ABOVE #sp-fade (18001), the title card (18003),
               letterbox bars and art (18002), so the dialogue card is visible
               when the storyIntro fades to opaque black before any dialogue.
               Without this, the card mounts BEHIND the fade and the player sees
               a permanent black screen. */
            z-index: 18004;
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
        /* Step 8: Narrator lines render at TOP of screen. Toggle by adding
           .narrator-top class to #sp-dialogue for that specific line. */
        #sp-dialogue.narrator-top {
            top: 6%;
            bottom: auto;
            transform: translateY(-40px);
        }
        #sp-dialogue.narrator-top.shown {
            transform: translateY(0);
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
        /* Caption rendered BELOW the art (over a translucent black band).
           Uses a sibling element rather than a child of #sp-art so the
           ken-burns scale transform on the image doesn't also stretch the
           text. z-index 18003 sits above the art image. */
        #sp-art-caption {
            position: absolute;
            left: 6%; right: 6%;
            bottom: 8%;
            display: none;
            z-index: 18003;
            padding: 14px 22px;
            background: linear-gradient(
                to bottom,
                rgba(0,0,0,0.75), rgba(20,15,8,0.92)
            );
            border-top: 2px solid #8a6a3a;
            border-bottom: 2px solid #8a6a3a;
            color: #f5d76e;
            font-family: Georgia, "Times New Roman", serif;
            font-size: 17px;
            line-height: 1.45;
            text-align: center;
            text-shadow: 0 2px 6px rgba(0,0,0,0.95);
            opacity: 0;
            transition: opacity 0.5s ease 0.4s;  /* fade in slightly after art */
            pointer-events: none;
            max-height: 28vh;
            overflow: auto;
        }
        #sp-art-caption.shown { display: block; opacity: 1; }
        @media (max-width: 520px) {
            #sp-art-caption {
                font-size: 14px;
                padding: 10px 14px;
                bottom: 5%;
            }
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

// ── Step 8: Global FIFO presentation mutex ────────────────────────────────
// Every public show*/fade* method calls _enqueue(asyncFn) instead of running
// directly. The queue runner awaits each job before starting the next, so
// two triggers that call showDialogue in quick succession will play in order
// with no overlap. The queue is drained serially; errors in one job don't
// block subsequent jobs.
function _enqueue(jobFn) {
    return new Promise((resolve, reject) => {
        sp._queue.push({ fn: jobFn, resolve, reject });
        _drainQueue();
    });
}
async function _drainQueue() {
    if (sp._queueRunning) return;
    sp._queueRunning = true;
    while (sp._queue.length > 0) {
        const { fn, resolve, reject } = sp._queue.shift();
        try   { resolve(await fn()); }
        catch (e) {
            console.warn("[StoryPresentation] queued job error:", e);
            try { reject(e); } catch (_) {}
        }
    }
    sp._queueRunning = false;
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

    // Art caption — sibling of art so kenburns scale on art doesn't stretch text
    const artCap = document.createElement("div");
    artCap.id = "sp-art-caption";
    root.appendChild(artCap);
    sp.artCaptionEl = artCap;

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

    // Hide the phase-2 loading overlay as soon as the first cinematic frame appears.
    const _p2 = document.getElementById("sp-phase2-loading");
    if (_p2) { _p2.style.opacity = "0"; setTimeout(function(){ if(_p2.parentNode) _p2.parentNode.removeChild(_p2); }, 500); }

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
        const caption   = opts.caption || "";
        // Background art (ms:0 + no click-advance) doesn't own the busy flag —
        // it coexists with dialogue. Blocking art (ms>0 or clickable) sets busy.
        const ownsBusy  = !(opts.ms === 0 && !clickAdv) && opts.background !== true;

        if (ownsBusy) sp.busy = true;

        // Pre-cache: load the image first so the user actually sees it (not a
        // black screen while the file is still being fetched). If load fails
        // we still fall through and try to display — better than hanging.
        const preload = new Image();
        let resolved = false;

        // Each showArt call gets its own generation id. The 1-second delayed
        // cleanup in finish() checks that it still "owns" the art element before
        // clearing backgroundImage — this prevents Art 1's stale cleanup timer
        // from wiping Art 2's image when the cross-fade delay is < 1000 ms.
        sp.artGen += 1;
        const myGen = sp.artGen;

        const _begin = () => {
            // ── Kenburns reset: force the animation to restart from scale(1.0) ──
            // If a previous art used kenburns on the same element, the CSS
            // `forwards` fill-mode leaves it frozen at scale(1.12). Toggling the
            // class without a reflow doesn't restart the animation.  We remove the
            // class, force a reflow, then re-add it so it plays from frame 0.
            if (kenburns) {
                sp.artEl.classList.remove("kenburns");
                void sp.artEl.offsetWidth; // force reflow
            }
            sp.artEl.style.backgroundImage = `url("${url}")`;
            sp.artEl.classList.toggle("kenburns", kenburns);
            sp.artEl.classList.add("shown");

            // Caption (sibling element so kenburns scale doesn't distort it)
            if (caption && sp.artCaptionEl) {
                sp.artCaptionEl.textContent = caption;
                // Force reflow so the .shown transition fires reliably
                void sp.artCaptionEl.offsetWidth;
                sp.artCaptionEl.classList.add("shown");
            } else if (sp.artCaptionEl) {
                sp.artCaptionEl.classList.remove("shown");
                sp.artCaptionEl.textContent = "";
            }

            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                sp.artFinish = null;
                sp.artEl.removeEventListener("click", finish);
                sp.artEl.classList.remove("shown");
                if (sp.artCaptionEl) sp.artCaptionEl.classList.remove("shown");
                setTimeout(() => {
                    // ── Generation guard: only wipe the DOM if we still own it ──
                    // If a newer showArt call has already started (_begin() ran
                    // and set a new backgroundImage), myGen < sp.artGen and we
                    // must NOT clear the element — that would wipe the new art.
                    if (sp.artGen !== myGen) {
                        // A newer art owns the element; just resolve our Promise.
                        if (ownsBusy) sp.busy = false;
                        if (!resolved) { resolved = true; resolve(); }
                        return;
                    }
                    sp.artEl.classList.remove("kenburns");
                    sp.artEl.style.backgroundImage = "";
                    if (sp.artCaptionEl) sp.artCaptionEl.textContent = "";
                    if (ownsBusy) sp.busy = false;
                    if (!resolved) { resolved = true; resolve(); }
                }, 1000);
            };

            if (clickAdv) sp.artEl.addEventListener("click", finish, { once: true });
            if (ms > 0) setTimeout(finish, ms);
            // Register so dismissArt() can close a persistent background art
            sp.artFinish = finish;
        };

        // Cap the preload at 1500ms — if the file's slow we still want to show.
        const failsafe = setTimeout(_begin, 1500);
        preload.onload  = () => { clearTimeout(failsafe); _begin(); };
        preload.onerror = () => {
            clearTimeout(failsafe);
            console.warn("[StoryPresentation] Art failed to load:", url, "— showing anyway");
            _begin();
        };
        preload.src = url;
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

        // Step 8: default is 0 (instant pop). Pass typewriterCps>0 to re-enable.
        const cps = (typeof opts.typewriterCps === "number") ? opts.typewriterCps : sp.defaultTypewriterCps;
        const autoAdvance   = (typeof opts.autoAdvanceMs === "number") ? opts.autoAdvanceMs : 0;
        const showLetterbox_= (opts.letterbox !== false);
        const onLine        = typeof opts.onLine === "function" ? opts.onLine : null;

        // ── Minimum display guard ─────────────────────────────────────────────
        // Each dialogue line must be visible for at least this long before the
        // player can advance (click / key / tap).  Prevents accidental skips
        // when the dialogue card first appears.
        const MIN_LINE_SHOW_MS = 2000;
        let lineAppearTime = 0;       // timestamp when the current line appeared
        let lineReadyTimer = null;    // setTimeout handle for showing the prompt

        if (showLetterbox_) showLetterbox(true);

        sp.busy = true;
        sp.dialogueEl.classList.add("shown");

        let idx = 0;
        let typewriterTimer = null;
        let lineDone = false;
        let resolveLine = null;

        // Helper: show/hide the "▶ click to continue" prompt based on the
        // 2-second minimum guard.  Also sets pointer-events so the card itself
        // gives a visual "not ready" cue (cursor: default while locked).
        const _setPromptReady = (ready) => {
            const prompt = sp.dialogueEl.querySelector(".sp-prompt");
            if (!prompt) return;
            if (ready) {
                prompt.style.visibility = "";
                sp.dialogueEl.style.cursor = "pointer";
            } else {
                prompt.style.visibility = "hidden";
                sp.dialogueEl.style.cursor = "default";
            }
        };

        // Set up the global advance hook
        sp.activeAdvance = (escape) => {
            if (escape) {
                // ESC = bail entire sequence — always allowed regardless of guard
                if (typewriterTimer) clearInterval(typewriterTimer);
                if (resolveLine) resolveLine("skip-all");
            } else {
                // ── 2-second guard: ignore all advance input until line has shown ──
                if ((Date.now() - lineAppearTime) < MIN_LINE_SHOW_MS) return;

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
        // Guard: activeAdvance may be null if clear() is called externally while
        // the dialogue card is still mounted (e.g. a fade-out races the cleanup).
        const clickHandler = () => { if (sp.activeAdvance) sp.activeAdvance(false); };
        sp.dialogueEl.addEventListener("click", clickHandler);

        // Also capture clicks on the rest of the overlay so the user can click
        // ANYWHERE on screen to advance (not just the small card), AND so
        // clicks don't leak through to the game canvas underneath while
        // dialogue is on screen. We temporarily switch the root from
        // pointer-events:none to pointer-events:auto for this; the original
        // value is restored on cleanup.
        const prevRootPointerEvents = sp.rootEl.style.pointerEvents;
        sp.rootEl.style.pointerEvents = "auto";
        const rootClickHandler = (e) => {
            // Don't double-fire when the click also bubbles from the card
            if (sp.dialogueEl && sp.dialogueEl.contains(e.target)) return;
            if (sp.activeAdvance) sp.activeAdvance(false);
        };
        sp.rootEl.addEventListener("click", rootClickHandler);

        // Process each line sequentially
        for (idx = 0; idx < lines.length; idx++) {
            const line = lines[idx];

            // Step 8: Narrator lines mount at TOP; everyone else at bottom.
            const isNarrator = !!line.narrator || line.name === "Narrator";
            sp.dialogueEl.classList.toggle("narrator-top", isNarrator);

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

            // ── Stamp appear time for the 2-second guard ──────────────────────
            lineAppearTime = Date.now();
            _setPromptReady(false);   // hide prompt / lock cursor immediately

            // Re-enable the prompt exactly when the guard expires
            if (lineReadyTimer) { clearTimeout(lineReadyTimer); lineReadyTimer = null; }
            lineReadyTimer = setTimeout(() => {
                lineReadyTimer = null;
                _setPromptReady(true);
            }, MIN_LINE_SHOW_MS);

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
                    // When cps=0 (instant pop) there's no read-time bonus.
                    const readTimeMs = (cps > 0) ? (fullText.length * 1000 / cps) : 0;
                    setTimeout(() => { if (resolveLine) r("auto"); }, autoAdvance + readTimeMs);
                }
            });
            resolveLine = null;
            if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; }

            if (result === "skip-all") break;
        }

        // Cleanup
        sp.dialogueEl.removeEventListener("click", clickHandler);
        sp.rootEl.removeEventListener("click", rootClickHandler);
        sp.rootEl.style.pointerEvents = prevRootPointerEvents || "";
        sp.activeAdvance = null;
        sp.dialogueEl.classList.remove("shown");
        sp.dialogueEl.classList.remove("narrator-top"); // Step 8 reset
        // Clear the prompt-ready timer and reset prompt / cursor state
        if (lineReadyTimer) { clearTimeout(lineReadyTimer); lineReadyTimer = null; }
        _setPromptReady(true);
        if (showLetterbox_) showLetterbox(false);

        await _sleep(450);
        sp.busy = false;
        sp._lastDialogueEndedAt = Date.now(); // Step 10: Parler cooldown gate
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
    // ── FIX: drain any in-flight showDialogue promise BEFORE nulling activeAdvance ──
    // When clear() is called externally (e.g. from _onIntroDone) while a
    // showDialogue() await is still suspended on a line Promise, nulling
    // activeAdvance leaves that Promise forever pending.  showDialogue never
    // reaches its own cleanup block (lines that remove rootClickHandler and
    // restore sp.rootEl.style.pointerEvents), so #sp-root stays
    // pointer-events:auto and invisibly swallows every game-UI click.
    //
    // Calling activeAdvance(true) first signals "escape / skip-all", which
    // resolves the pending Promise and lets showDialogue run its full cleanup
    // (removeEventListener + restore pointer-events) before we overwrite state
    // here.  The synchronous pointer-events reset below is kept as a belt-and-
    // suspenders guard for any path where activeAdvance is not set.
    if (typeof sp.activeAdvance === "function") sp.activeAdvance(true);

    if (sp.dialogueEl)    sp.dialogueEl.classList.remove("shown");
    if (sp.titleEl)       sp.titleEl.classList.remove("shown");
    if (sp.artEl)         sp.artEl.classList.remove("shown");
    if (sp.artCaptionEl)  { sp.artCaptionEl.classList.remove("shown"); sp.artCaptionEl.textContent = ""; }
    if (sp.subtitleEl)    sp.subtitleEl.classList.remove("shown");
    if (sp.rootEl)        sp.rootEl.style.pointerEvents = "";
    sp.activeAdvance = null;
    sp.busy = false;
    showLetterbox(false);
}

// ── Public API ──────────────────────────────────────────────────────────────
return {
    // ── Step 8: All cinematic methods route through _enqueue so only ONE
    // presentation runs at a time and calls play in the order they were made.
    showDialogue:  (lines, opts) => _enqueue(async () => {
        try   { return await showDialogue(lines, opts); }
        finally { sp._lastDialogueEndedAt = Date.now(); }
    }),
    // showArt: if called in background mode (ms:0 + clickToAdvance:false OR
    // background:true), it fires WITHOUT queuing — it lives alongside dialogue.
    // Otherwise it queues and blocks like any other cinematic.
    showArt: (url, opts) => {
        opts = opts || {};
        const isBackground = opts.background === true ||
                             (opts.ms === 0 && opts.clickToAdvance === false);
        if (isBackground) {
            // Background art: fire immediately, don't queue.
            // dismissArt() will close it when dialogue is done.
            return showArt(url, opts);
        }
        return _enqueue(() => showArt(url, opts));
    },
    showTitle:     (opts)           => _enqueue(() => showTitle(opts)),
    fadeIn:        (ms, color)      => _enqueue(() => fadeIn(ms, color)),
    fadeOut:       (ms, color)      => _enqueue(() => fadeOut(ms, color)),
    fadeFlash:     (color, ms)      => _enqueue(() => fadeFlash(color, ms)),

    // Non-blocking (don't hold the queue):
    showSubtitle,
    hideSubtitle,
    showLetterbox,
    skip,
    clear,
    dismissArt: function () {
        if (typeof sp.artFinish === "function") { sp.artFinish(); sp.artFinish = null; }
    },

    // ── Busy helpers ────────────────────────────────────────────────────────
    // isBusy / busy reflect whether something is VISUALLY ON SCREEN right now
    // (sp.busy = true while dialogue, art, or title is showing). Queue depth
    // is NOT included — otherwise parler stays blocked forever while the intro
    // dialogue waits for the user to click through on mobile.
    isBusy:    () => !!sp.busy,
    busy:      () => !!sp.busy,
    queueDepth: () => sp._queue.length,
    // ms elapsed since the last showDialogue() finished (or 0 if never run)
    msSinceDialogue: () => sp._lastDialogueEndedAt > 0
                            ? Date.now() - sp._lastDialogueEndedAt : Infinity,
    lastDialogueEndedAt: () => sp._lastDialogueEndedAt,
    // Re-enable typewriter at a given CPS (0 = instant pop, the new default)
    setDefaultTypewriterCps: (n) => { sp.defaultTypewriterCps = +n || 0; },

    // Portrait cache
    registerPortrait,
    registerPortraitsBulk,
    clearPortraits,

    // ── Phase-2 loading overlay ─────────────────────────────────────────────
    // Shows a subtle "Loading scenario…" spinner over the black fade so the
    // player has visual feedback during the ~0.5–1.5s between the map-load
    // fadeOut and the cinematic's first frame. Auto-hides when the cinematic
    // starts (hidePhase2Loading is called by _onIntroDone in scenario_triggers).
    showPhase2Loading: function() {
        let el = document.getElementById("sp-phase2-loading");
        if (!el) {
            el = document.createElement("div");
            el.id = "sp-phase2-loading";
            el.innerHTML = [
                '<div style="',
                    'display:flex;flex-direction:column;align-items:center;',
                    'justify-content:center;gap:16px;',
                '">',
                '<div style="',
                    'width:38px;height:38px;',
                    'border:4px solid rgba(212,184,134,0.25);',
                    'border-top-color:#d4b886;',
                    'border-radius:50%;',
                    'animation:sp-spin 0.9s linear infinite;',
                '"></div>',
                '<div style="',
                    'color:#d4b886;font-family:Georgia,serif;',
                    'font-size:14px;letter-spacing:2px;',
                    'text-shadow:0 0 8px rgba(0,0,0,0.9);',
                    'opacity:0.85;',
                '">Loading scenario…</div>',
                '</div>'
            ].join("");
            el.style.cssText = [
                "position:fixed",
                "inset:0",
                "display:flex",
                "align-items:center",
                "justify-content:center",
                "z-index:18999",
                "pointer-events:none",
                "transition:opacity 0.4s ease",
                "opacity:1"
            ].join(";");
            // Inject keyframe if not already present
            if (!document.getElementById("sp-spin-style")) {
                const s = document.createElement("style");
                s.id = "sp-spin-style";
                s.textContent = "@keyframes sp-spin{to{transform:rotate(360deg)}}";
                document.head.appendChild(s);
            }
            document.body.appendChild(el);
        }
        el.style.opacity = "1";
        el.style.display = "flex";
    },
    hidePhase2Loading: function() {
        const el = document.getElementById("sp-phase2-loading");
        if (!el) return;
        el.style.opacity = "0";
        setTimeout(function() {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 500);
    },

    _state: sp
};

})();

console.log("[StoryPresentation] storymode_presentation.js loaded — ready.");