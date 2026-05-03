



// ============================================================================
// scenario_import_patch.js
// ----------------------------------------------------------------------------
// Adds an "⬇ Import from .js Scenario" button to the Trigger Editor's Triggers
// tab.  When clicked, it auto-discovers any window.*Scenario module that
// exposes a DATA object (e.g. window.HakataBayScenario.DATA) and lets the user
// pick which one to merge into the scenario currently open in the editor.
//
// What gets imported (merged, never destructive):
//   • triggers          — deduped by id; new triggers appended
//   • importantNpcs     — deduped by id; new NPCs appended
//   • playerSetup       — destination-wins per-key; src fills only blank keys
//   • storyIntro        — replaced ONLY if dst has no enabled intro
//   • scenarioVars      — Object.assign(src first, then dst overrides)
//   • winLose           — replaced ONLY if dst has zero rules
//
// Install order:
//   <script src="story/scenario_update.js"></script>
//   <script src="story/storymode_presentation.js"></script>
//   <script src="story/scenario_triggers.js"></script>
//   <script src="story/scenarios/hakata_bay_scenario.js"></script>
//   <script src="story/scenario_import_patch.js"></script>   <!-- LAST -->
//
// Public API:
//   window.ScenarioImport.register(name, dataObj)   — register a custom source
//   window.ScenarioImport.discover()                — list discovered sources
//   window.ScenarioImport.importInto(scenario, src) — programmatic import
//   window.ScenarioImport.openPicker()              — open the picker manually
// ============================================================================

window.ScenarioImport = (function () {
"use strict";

// ── Manually-registered import sources (in addition to auto-discovery) ──────
const _registered = {};   // name → dataObj

function register(name, dataObj) {
    if (!name || !dataObj) return;
    _registered[name] = dataObj;
    console.log("[ScenarioImport] Registered source:", name);
}

// ── Auto-discover any window.*Scenario.DATA the page has loaded ─────────────
function discover() {
    const found = [];

    // 1) Auto: anything matching /Scenario$/ on window with a DATA payload
    Object.keys(window).forEach(k => {
        if (!/Scenario$/.test(k)) return;
        const mod = window[k];
        if (!mod || typeof mod !== "object") return;
        const data = mod.DATA;
        if (!data || typeof data !== "object") return;

        // Accept anything that has at least ONE useful field
        const hasContent = Array.isArray(data.triggers)
                        || Array.isArray(data.importantNpcs)
                        || data.storyIntro
                        || data.playerSetup
                        || data.winLose;
        if (!hasContent) return;

        found.push({
            key:   k,
            label: _humanize(k),
            data:  data,
            version: mod.VERSION || ""
        });
    });

    // 2) Manually-registered sources
    Object.keys(_registered).forEach(name => {
        // Skip if already discovered automatically
        if (found.some(f => f.key === name)) return;
        found.push({
            key:   name,
            label: _humanize(name),
            data:  _registered[name],
            version: ""
        });
    });

    return found;
}

function _humanize(k) {
    // "HakataBayScenario" → "Hakata Bay"
    return k.replace(/Scenario$/, "")
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .replace(/_/g, " ")
            .trim();
}

// ── The merge core (also callable programmatically) ─────────────────────────
function importInto(dst, src) {
    if (!dst || !src) {
        return { triggersAdded: 0, npcsAdded: 0, error: "missing dst or src" };
    }

    let triggersAdded = 0, npcsAdded = 0;
    const replaced = [];

    // ── Triggers (dedup by id) ──────────────────────────────────────────────
    if (Array.isArray(src.triggers)) {
        if (!Array.isArray(dst.triggers)) dst.triggers = [];
        const ids = new Set(dst.triggers.map(t => t && t.id).filter(Boolean));
        src.triggers.forEach(t => {
            if (!t || !t.id) return;
            if (ids.has(t.id)) return;
            dst.triggers.push(_deepClone(t));
            ids.add(t.id);
            triggersAdded++;
        });
    }

    // ── Important NPCs (dedup by id) ────────────────────────────────────────
    if (Array.isArray(src.importantNpcs)) {
        if (!Array.isArray(dst.importantNpcs)) dst.importantNpcs = [];
        const ids = new Set(dst.importantNpcs.map(n => n && n.id).filter(Boolean));
        src.importantNpcs.forEach(n => {
            if (!n || !n.id) return;
            if (ids.has(n.id)) return;
            dst.importantNpcs.push(_deepClone(n));
            ids.add(n.id);
            npcsAdded++;
        });
    }

    // ── Player setup (dst wins per-key, src fills blanks) ───────────────────
    if (src.playerSetup && typeof src.playerSetup === "object") {
        if (!dst.playerSetup) dst.playerSetup = {};
        Object.keys(src.playerSetup).forEach(k => {
            const cur = dst.playerSetup[k];
            const isBlank = (cur === undefined || cur === null || cur === "" ||
                             (Array.isArray(cur) && cur.length === 0));
            if (isBlank) dst.playerSetup[k] = _deepClone(src.playerSetup[k]);
        });
    }

    // ── Story intro (replace ONLY if dst is empty/disabled) ─────────────────
    if (src.storyIntro) {
        const dstIntro = dst.storyIntro;
        const dstHasIntro = dstIntro && dstIntro.enabled &&
                            ((dstIntro.lines || []).length > 0 ||
                             (dstIntro.titleCard && dstIntro.titleCard.title));
        if (!dstHasIntro) {
            dst.storyIntro = _deepClone(src.storyIntro);
            replaced.push("storyIntro");
        }
    }

    // ── Scenario vars (src first, dst overrides) ────────────────────────────
    if (src.scenarioVars && typeof src.scenarioVars === "object") {
        dst.scenarioVars = Object.assign({}, _deepClone(src.scenarioVars),
                                         dst.scenarioVars || {});
    }

    // ── Win / Lose (replace ONLY if dst has no rules) ───────────────────────
    if (src.winLose) {
        const wl = dst.winLose || {};
        const dstHasRules = ((wl.winRules  || []).length > 0) ||
                            ((wl.loseRules || []).length > 0);
        if (!dstHasRules) {
            dst.winLose = _deepClone(src.winLose);
            replaced.push("winLose");
        }
    }

    return {
        triggersAdded:  triggersAdded,
        npcsAdded:      npcsAdded,
        replaced:       replaced
    };
}

function _deepClone(o) {
    try { return JSON.parse(JSON.stringify(o)); }
    catch (e) { console.warn("[ScenarioImport] clone failed:", e); return o; }
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ UI — Picker modal                                                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _injectCss() {
    if (document.getElementById("si-picker-css")) return;
    const s = document.createElement("style");
    s.id = "si-picker-css";
    s.textContent = `
        .si-overlay {
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.65);
            z-index: 17000;
            display: flex; align-items: center; justify-content: center;
            font-family: Tahoma, Verdana, sans-serif;
        }
        .si-modal {
            background: #1a1f2a;
            border: 2px solid #4a8fa8;
            border-radius: 6px;
            min-width: 460px;
            max-width: 90vw;
            max-height: 80vh;
            overflow: hidden;
            display: flex; flex-direction: column;
            color: #cfd8dc;
            box-shadow: 0 8px 32px rgba(0,0,0,0.7);
        }
        .si-header {
            padding: 12px 16px;
            background: linear-gradient(to bottom, #3a5475, #1e2d40);
            border-bottom: 1px solid #4a6680;
            display: flex; align-items: center; justify-content: space-between;
        }
        .si-header h3 { margin: 0; color: #f5d76e; font-size: 14px; letter-spacing: 0.6px; }
        .si-close-x {
            background: #4a1515; color: #ffcccc; border: none;
            padding: 4px 10px; border-radius: 3px; cursor: pointer; font-weight: bold;
        }
        .si-close-x:hover { background: #6a2020; color: #fff; }
        .si-body { padding: 14px 16px; overflow: auto; }
        .si-help {
            font-size: 11px; color: #8aa; margin-bottom: 12px; line-height: 1.5;
        }
        .si-list {
            display: flex; flex-direction: column; gap: 8px;
        }
        .si-source {
            border: 1px solid #4a6680;
            background: #232a36;
            border-radius: 4px;
            padding: 10px 12px;
            cursor: pointer;
            transition: all 0.15s;
        }
        .si-source:hover {
            border-color: #6aaadd;
            background: #2a3445;
            transform: translateX(2px);
        }
        .si-source-title {
            color: #f5d76e; font-weight: bold; font-size: 13px;
            margin-bottom: 4px;
        }
        .si-source-meta { font-size: 11px; color: #99b; }
        .si-source-key { font-size: 10px; color: #667; font-family: monospace; margin-top: 4px; }
        .si-empty {
            padding: 20px; text-align: center; color: #888; font-size: 12px;
            border: 1px dashed #555; border-radius: 4px;
        }
        .si-empty code { color: #f5d76e; }
    `;
    document.head.appendChild(s);
}

let _modalEl = null;
function _closePicker() {
    if (_modalEl && _modalEl.parentNode) _modalEl.parentNode.removeChild(_modalEl);
    _modalEl = null;
}

function openPicker() {
    _injectCss();
    _closePicker();

    // Locate the editor's current scenario via the public state hook
    const ed = window.ScenarioTriggers && window.ScenarioTriggers._editor
               ? window.ScenarioTriggers._editor() : null;
    const scenario = ed && ed.scenario;
    if (!scenario) {
        alert("No scenario open in the Trigger Editor. Open one first, then try Import again.");
        return;
    }

    const sources = discover();

    const overlay = document.createElement("div");
    overlay.className = "si-overlay";
    overlay.addEventListener("click", e => {
        if (e.target === overlay) _closePicker();
    });

    const modal = document.createElement("div");
    modal.className = "si-modal";

    modal.innerHTML = `
        <div class="si-header">
            <h3>⬇ Import from .js Scenario</h3>
            <button class="si-close-x" id="si-close">✕</button>
        </div>
        <div class="si-body">
            <div class="si-help">
                Pick a scenario module to merge into the one you're editing.
                Triggers and important NPCs are <b>deduped by id</b> (existing entries are kept).
                Player setup, story intro, scenario vars, and win/lose conditions are only
                pulled in where the destination is empty.
            </div>
            <div class="si-list" id="si-list"></div>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    _modalEl = overlay;

    modal.querySelector("#si-close").onclick = _closePicker;

    const listEl = modal.querySelector("#si-list");

    if (sources.length === 0) {
        listEl.innerHTML = `
            <div class="si-empty">
                No importable scenario modules detected.<br><br>
                Make sure the scenario script (e.g. <code>hakata_bay_scenario.js</code>)
                is loaded BEFORE this patch, and that it exposes a
                <code>window.&lt;Name&gt;Scenario.DATA</code> object containing
                <code>triggers</code>, <code>importantNpcs</code>, etc.
            </div>
        `;
        return;
    }

    sources.forEach(src => {
        const item = document.createElement("div");
        item.className = "si-source";
        const trigCount = (src.data.triggers      || []).length;
        const npcCount  = (src.data.importantNpcs || []).length;
        const hasIntro  = src.data.storyIntro && src.data.storyIntro.enabled;
        const hasWL     = src.data.winLose &&
                          (((src.data.winLose.winRules || []).length) ||
                           ((src.data.winLose.loseRules || []).length));
        const hasPlayer = !!src.data.playerSetup;

        item.innerHTML = `
            <div class="si-source-title">
                ${_esc(src.label)}${src.version ? ' <span style="color:#99b;font-weight:normal;font-size:11px;">v' + _esc(src.version) + '</span>' : ''}
            </div>
            <div class="si-source-meta">
                ${trigCount} triggers · ${npcCount} important NPCs
                ${hasIntro  ? " · story intro" : ""}
                ${hasPlayer ? " · player setup" : ""}
                ${hasWL     ? " · win/lose"   : ""}
            </div>
            <div class="si-source-key">window.${_esc(src.key)}.DATA</div>
        `;
        item.onclick = () => {
            _doImport(scenario, src);
        };
        listEl.appendChild(item);
    });
}

function _doImport(scenario, src) {
    const result = importInto(scenario, src.data);
    _closePicker();

    // Re-render the editor's active tab so the new content shows up immediately
    try {
        // Public re-render hook: the editor's _switchTab is hidden, but switching
        // tabs via the click we trigger here forces a re-render.
        const root = document.getElementById("st-editor-root");
        if (root) {
            const ed = window.ScenarioTriggers._editor && window.ScenarioTriggers._editor();
            const cur = ed && ed.currentTab;
            const tabEl = root.querySelector('.st-tab[data-tab="' + cur + '"]');
            if (tabEl) tabEl.click();
        }
    } catch (e) { console.warn("[ScenarioImport] re-render failed:", e); }

    const lines = [
        "Imported from " + src.label + ":",
        "  • " + result.triggersAdded + " new triggers",
        "  • " + result.npcsAdded + " new important NPCs"
    ];
    if (result.replaced && result.replaced.length) {
        lines.push("  • Replaced empty sections: " + result.replaced.join(", "));
    }
    lines.push("", "Switch tabs to verify, then File → Save in the Scenario Editor when ready.");
    alert(lines.join("\n"));
    console.log("[ScenarioImport] Import complete:", result);
}

function _esc(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ INSTALL THE BUTTON IN THE TRIGGER EDITOR'S TRIGGERS TAB                  ║
// ║                                                                          ║
// ║ scenario_triggers.js builds a toolbar at the top of the Triggers tab     ║
// ║ that contains "+ New Trigger", "Duplicate", "Move Up/Down", "Delete".    ║
// ║ We watch for that toolbar appearing and inject our button at its end.    ║
// ║ This is poll-based to avoid having to monkey-patch _renderTriggersTab.   ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _installButton() {
    setInterval(() => {
        // The "+ New Trigger" button's id is `trg-add` (set in scenario_triggers.js).
        // We attach our import button as a sibling of it, exactly once.
        const addBtn = document.getElementById("trg-add");
        if (!addBtn) return;
        const bar = addBtn.parentNode;
        if (!bar) return;
        if (bar.querySelector("#si-import-btn")) return; // already installed

        const btn = document.createElement("button");
        btn.id = "si-import-btn";
        btn.className = "st-btn";
        btn.textContent = "⬇ Import from .js Scenario";
        btn.style.background = "#1a4a5a";
        btn.style.borderColor = "#4a8fa8";
        btn.style.color = "#bce6ff";
        btn.style.fontWeight = "bold";
        btn.style.marginLeft = "12px";
        btn.title = "Pull triggers / NPCs / story intro from a loaded .js scenario module " +
                    "(e.g. window.HakataBayScenario.DATA)";
        btn.onclick = openPicker;

        // Insert just before the "X triggers total" text node, or append at end
        const totalSpan = bar.querySelector("span");
        if (totalSpan) bar.insertBefore(btn, totalSpan);
        else bar.appendChild(btn);

        console.log("[ScenarioImport] Import button installed in Trigger Editor.");
    }, 800);
}

_installButton();

// ── Public API ──────────────────────────────────────────────────────────────
return {
    register:    register,
    discover:    discover,
    importInto:  importInto,
    openPicker:  openPicker,
    VERSION:     "1.0.0"
};

})();

console.log("[ScenarioImport] scenario_import_patch.js v" +
            window.ScenarioImport.VERSION + " loaded — ready.");