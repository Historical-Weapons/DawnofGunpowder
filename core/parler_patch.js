// ============================================================================
// PARLER PATCH — parler_patch.js          (Step 10)
// ============================================================================
//
// Drop-in patch for parler_system.js that adds three behaviours:
//
//   1. BUSY GATE — The Parler UI cannot open while a movie / dialogue /
//      art card is playing (StoryPresentation.busy() === true).  Any parle
//      initiated while busy is silently cancelled; the player can try again
//      once the story element finishes.
//
//   2. COOLDOWN GATE — After any showDialogue() ends the Parler is locked
//      for 1 second so the player doesn't accidentally trigger an NPC
//      conversation mid-cut-scene transition.  The cooldown uses
//      StoryPresentation.msSinceDialogue().
//
//   3. SCENARIO-SPECIFIC LINES — Before falling through to RandomDialogue,
//      the patch checks scenario.parlerLines[npc.role] (set in the Parler
//      tab of the Scenario Editor).  If that array is non-empty, a random
//      entry is used instead.  Token substitutions:
//          {npc.name}        {npc.faction}     {npc.role}   {npc.count}
//          {player.faction}  {player.troops}   {relation}
//      {relation} resolves to "ally" / "enemy" / "neutral" automatically.
//
// LOAD ORDER in index.html — must come AFTER parler_system.js:
//   <script src="core/parler_system.js"></script>
//   <script src="core/parler_patch.js"></script>   ← new
//
// ============================================================================

(function () {
"use strict";

const PARLER_COOLDOWN_MS = 1000;

// ── Token substitution helper ────────────────────────────────────────────────
function _substituteTokens(template, npc) {
    if (!template || typeof template !== "string") return "";
    const p = window.player || {};
    const pFac = p.faction || "Unknown";
    const pTrp = (p.troops != null) ? p.troops : (Array.isArray(p.roster) ? p.roster.length : "?");

    let relation = "neutral";
    if (typeof window.isHostile === "function" && npc) {
        if (window.isHostile(npc.faction, pFac)) relation = "enemy";
        else if (typeof window.getRelation === "function") {
            const rel = window.getRelation(npc.faction, pFac);
            if (rel === "Ally")  relation = "ally";
            if (rel === "Peace") relation = "neutral";
            if (rel === "War")   relation = "enemy";
        }
    }

    return template
        .replace(/\{npc\.name\}/g,      (npc && npc.name)    || "stranger")
        .replace(/\{npc\.faction\}/g,   (npc && npc.faction) || "Unknown")
        .replace(/\{npc\.role\}/g,      (npc && npc.role)    || "Unknown")
        .replace(/\{npc\.count\}/g,     (npc && npc.count != null) ? npc.count : "?")
        .replace(/\{player\.faction\}/g, pFac)
        .replace(/\{player\.troops\}/g,  pTrp)
        .replace(/\{relation\}/g,        relation);
}

// ── Scenario parler lines lookup ─────────────────────────────────────────────
// Returns a resolved line string or null (fall through to RandomDialogue).
function _getScenarioLine(npc) {
    const s = window.__activeScenario;
    if (!s || !s.parlerLines) return null;
    const role = (npc && npc.role) ? npc.role : "Civilian";
    const pool = s.parlerLines[role];
    if (!Array.isArray(pool) || pool.length === 0) return null;
    const raw = pool[Math.floor(Math.random() * pool.length)];
    return _substituteTokens(raw, npc);
}

// ── Main gate function ────────────────────────────────────────────────────────
// Returns true if parle is allowed right now, false if blocked.
// ── Log throttle (to avoid 200+ identical messages in console) ───────────────
let _lastBlockLog = 0;
function _logBlocked(reason) {
    const now = Date.now();
    if (now - _lastBlockLog > 5000) {          // max once per 5 seconds
        _lastBlockLog = now;
        console.log("[ParlerPatch] Parle blocked —", reason);
    }
}

function _parlerAllowed() {
    const SP = window.StoryPresentation;
    if (SP) {
        // Only check sp.busy (something is visually on screen).
        // Do NOT check queueDepth or _queueRunning — those would block
        // parler permanently if intro dialogue is waiting for a click.
        if (typeof SP.busy  === "function" && SP.busy())   return false;
        if (typeof SP.isBusy === "function" && SP.isBusy()) return false;

        // Also check cooldown: 1s after dialogue ends
        if (typeof SP.msSinceDialogue === "function" &&
            SP.msSinceDialogue() < PARLER_COOLDOWN_MS) return false;
    }

    // Also respect the scenario trigger runtime's storyPlaying flag
    // (e.g. a play_movie action is running from a trigger).
    const rt = window.ScenarioTriggers && window.ScenarioTriggers._state
                ? window.ScenarioTriggers._state.rt : null;
    if (rt && rt.storyPlaying) return false;

    return true;
}

// ── Wrap the parler entry-point functions ─────────────────────────────────────
//
// parler_system.js typically exposes one or more of:
//    window.initiateParle(npc)
//    window.openParleWithNPC(npc)
//    window.startParle(npc)
//
// We wrap each that exists.  The wrapper:
//   a) Checks the busy/cooldown gates.
//   b) Attempts a scenario-specific line first.
//   c) Falls through to the original function if no scenario line.
//
// The wrapping is deferred until DOMContentLoaded (or immediate if already
// loaded) to give parler_system.js time to register its globals.
//
function _patchParler() {
    // Try all known entry-point names
    const NAMES = ["initiateParle", "openParleWithNPC", "startParle", "initiateParleWithNPC"];
    let patched = 0;

    NAMES.forEach(fnName => {
        const orig = window[fnName];
        if (typeof orig !== "function" || orig.__parlerPatched) return;

        window[fnName] = function (npc) {
            // ── Gate: busy or in cooldown ────────────────────────────────────
            if (!_parlerAllowed()) {
                _logBlocked("StoryPresentation is active or in cooldown.");
                return;
            }

            // ── Gate: specific trigger/script override ───────────────────────
            // If the NPC has a customAI or customScript that explicitly set
            // npc.__allowParler = true, skip the gate (special NPCs can talk
            // during scripted sequences).
            if (npc && npc.__allowParler !== true) {
                // Re-check (in case a movie just started between the player
                // pressing interact and this executing).
                if (!_parlerAllowed()) return;
            }

            // ── Scenario-specific line injection ─────────────────────────────
            const scenarioLine = _getScenarioLine(npc);
            if (scenarioLine) {
                // Inject the line so the original function displays it.
                // We store it on the NPC temporarily; parler_system.js reads
                // npc.__overrideLine if present (or we patch generateNPCDialogue).
                if (npc) npc.__overrideLine = scenarioLine;
                try {
                    orig.call(this, npc);
                } finally {
                    if (npc) delete npc.__overrideLine;
                }
                return;
            }

            // ── Default: run original ─────────────────────────────────────────
            orig.call(this, npc);
        };

        window[fnName].__parlerPatched = true;
        patched++;
        console.log("[ParlerPatch] Patched:", fnName);
    });

    // Also patch generateNPCDialogue if it exists, to consume __overrideLine.
    const origGen = window.generateNPCDialogue;
    if (typeof origGen === "function" && !origGen.__parlerPatched) {
        window.generateNPCDialogue = function (npc, choice) {
            if (npc && npc.__overrideLine) return npc.__overrideLine;
            return origGen.call(this, npc, choice);
        };
        window.generateNPCDialogue.__parlerPatched = true;
        patched++;
        console.log("[ParlerPatch] Patched: generateNPCDialogue");
    }

    if (patched === 0) {
        console.warn("[ParlerPatch] No parler functions found to patch. " +
                     "Ensure parler_system.js loads before parler_patch.js.");
    }
    return patched;
}

// Run when DOM is ready (parler_system.js may register globals at DOMContentLoaded)
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        _patchParler();
        // Retry once after a short delay in case parler registers late.
        setTimeout(_patchParler, 500);
    });
} else {
    _patchParler();
    setTimeout(_patchParler, 500);
}

// ── Public API ────────────────────────────────────────────────────────────────
window.ParlerPatch = {
    VERSION:        "1.0.0",
    allowed:        _parlerAllowed,
    getScenarioLine: _getScenarioLine,
    substituteTokens: _substituteTokens,
    COOLDOWN_MS:    PARLER_COOLDOWN_MS,
    repatch:        _patchParler
};

console.log("[ParlerPatch] v1.0.0 loaded — Parler gates: busy + " + PARLER_COOLDOWN_MS + "ms cooldown + scenario lines.");

})();