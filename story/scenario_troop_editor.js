// =============================================================================
// SCENARIO TROOP EDITOR — Phase 1 (stats only, no appearance)
// File:        story/scenario_troop_editor.js
// Loads after: story/scenario_editor.js, story/scenario_update.js,
//              battle_engine/troop_system.js, core/troopGUI.js
// =============================================================================
//
// PURPOSE
//   Lets a scenario designer add/edit *custom* troops on top of the vanilla
//   roster.  Vanilla troops (Militia, Spearman, Crossbowman, etc.) are NEVER
//   deleted or mutated — they remain available in sandbox mode untouched.
//   Customs live entirely inside scenario JSON (scenario.customTroops +
//   scenario.customHierarchy) and are applied to the live engine ONLY when
//   the player launches that scenario.
//
// FILE ROUND-TRIP
//   • The scenario editor's File → Save / File → Load already serialise the
//     full scenario object, so customs go in/out automatically once
//     scenario_editor.js was patched to preserve those two new fields.
//   • This editor also offers an INDEPENDENT "troop pack" import/export so
//     designers can share roster mods without sharing the entire scenario.
//
// PHASE BOUNDARIES (per project plan)
//   • Phase 1 (this file)  — stats GUI, JSON I/O, runtime application.
//                            Visual rendering uses the existing role-based
//                            dispatch in troop_draw.js — custom troops
//                            inherit the look of their chosen ROLE.
//   • Phase 2+ (later)     — sprite/appearance painter, attack-animation
//                            authoring.  An `appearance: null` placeholder
//                            is stored on every custom troop today so the
//                            schema is forward-compatible.
//
// HARD-CODED INVARIANTS (do not change in this editor — they are
//                        engine-wide constants)
//   • Set of ROLES                    (gunner, shield, pike, archer, …)
//   • Set of WEIGHT_CLASSES           (LIGHT_INF, HEAVY_INF, CAV, HEAVY_CAV,
//                                      ELEPHANT)
//   • The Troop class constructor stat list (matches troop_system.js)
//   These are exposed as read-only dropdowns in the UI.
// =============================================================================

window.ScenarioTroopEditor = (function () {
"use strict";

const VERSION = "1.0.0-phase1";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ DESIGN TOKENS — match scenario_editor.js + scenario_editor_patch_p1.js   ║
// ╚══════════════════════════════════════════════════════════════════════════╝
const T = {
    bg:        "#141d2c",
    bar:       "#1a2538",
    border:    "#3a5a7a",
    border2:   "#2a3f5a",
    text:      "#cfd8dc",
    dim:       "#7a9ab8",
    accent:    "#f5d76e",
    blue:      "#4aafd8",
    green:     "#8bc34a",
    red:       "#e74c3c",
    redDark:   "#3c1a1a",
    input:     "#0d1520",
    hover:     "#1e4a7a",
    hoverDark: "#1a3a5a",
    custom:    "#ce93d8",  // tint used to identify custom (non-vanilla) troops
    vanilla:   "#90caf9"   // tint used to identify vanilla troops
};

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ INVARIANT TABLES — duplicated from troop_system.js so the editor keeps   ║
// ║ working even if load-order ever changes.  Values must stay in sync with  ║
// ║ the source of truth (troop_system.js).                                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// Roles, with friendly labels for the dropdown.  Values are EXACT matches
// for the strings used in troop_system.js's ROLES dictionary — these strings
// are what the role-based draw dispatcher in troop_draw.js compares against.
const ROLE_OPTIONS = [
    { value: "infantry",        label: "Infantry — generic melee" },
    { value: "shield",          label: "Shield Infantry — line-holder w/ shield" },
    { value: "pike",            label: "Pike — anti-cavalry spear" },
    { value: "two_handed",      label: "Two-Handed — heavy melee shock" },
    { value: "cavalry",         label: "Cavalry — mounted melee charger" },
    { value: "horse_archer",    label: "Horse Archer — mounted skirmisher" },
    { value: "mounted_gunner",  label: "Mounted Gunner — mounted firearm" },
    { value: "archer",          label: "Archer — foot bow" },
    { value: "crossbow",        label: "Crossbow — foot crossbow" },
    { value: "throwing",        label: "Thrown — javelin/sling" },
    { value: "gunner",          label: "Gunner — hand cannon / firearm" },
    { value: "firelance",       label: "Firelance — proto-firearm + spear" },
    { value: "bomb",            label: "Bomb — thrown gunpowder ordnance" },
    { value: "Rocket",          label: "Rocket — area-fire panic weapon" }
];

// Weight classes — these map to the WEIGHT_CLASSES dictionary in troop_system.
// The `tier`/`mass`/`radius` here are the canonical values; at runtime we
// prefer the live `WEIGHT_CLASSES` if available so any future tweaks in
// troop_system.js automatically propagate.
const WEIGHT_OPTIONS = {
    LIGHT_INF: { tier: 1, mass: 10,  radius: 5  },
    HEAVY_INF: { tier: 2, mass: 25,  radius: 7  },
    CAV:       { tier: 3, mass: 80,  radius: 10 },
    HEAVY_CAV: { tier: 4, mass: 150, radius: 12 },
    ELEPHANT:  { tier: 5, mass: 500, radius: 18 }
};

// Armor tier presets — convenience labels next to the numeric input.
const ARMOR_PRESETS = [
    { v: 2,  label: "Cloth (2)" },
    { v: 8,  label: "Leather/Gambeson (8)" },
    { v: 15, label: "Partial Lamellar (15)" },
    { v: 25, label: "Full Lamellar (25)" },
    { v: 40, label: "Super Heavy (40)" },
    { v: 60, label: "Juggernaut/Elephant (60)" }
];

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ STATE                                                                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝
const state = {
    panelEl:       null,   // root DOM node of the editor modal
    selectedId:    null,   // currently-edited custom troop id (or vanilla name preview)
    listFilter:    "",     // search box text
    showVanilla:   true,   // toggle for showing vanilla troops in the list
    runtimeHooked: false   // guards against double-wrapping ScenarioRuntime.launch
};

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ UTILITIES                                                                ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// Public scenario accessor — same trick ScenarioEditorPatch uses.
function _scenario() {
    return window.ScenarioEditor && window.ScenarioEditor._state
        ? window.ScenarioEditor._state.scenario
        : (window.__activeScenario || null);
}

// Make sure the scenario actually has the customTroops/customHierarchy fields.
// Older scenarios (pre-patch) might not — heal them silently.
function _ensureCustomFields(s) {
    if (!s) return;
    if (!Array.isArray(s.customTroops))                        s.customTroops    = [];
    if (!s.customHierarchy || typeof s.customHierarchy !== "object") s.customHierarchy = {};
}

// Slug a string for use in id-like contexts.  Keeps it ASCII and safe.
function _slugify(str) {
    return String(str || "")
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .substring(0, 32) || "troop";
}

// Generate a unique id for a new custom troop within a scenario.
function _newId(s, baseName) {
    const slug = _slugify(baseName);
    let n = 1;
    let candidate = `ct_${slug}`;
    const taken = new Set(s.customTroops.map(t => t.id));
    while (taken.has(candidate)) {
        n++;
        candidate = `ct_${slug}_${n}`;
    }
    return candidate;
}

// Numeric coercion that survives empty strings and NaN.
function _num(v, fallback, min, max) {
    if (v === "" || v === null || v === undefined) return fallback;
    const n = Number(v);
    if (!isFinite(n)) return fallback;
    if (typeof min === "number" && n < min) return min;
    if (typeof max === "number" && n > max) return max;
    return n;
}

// HTML-escape for attribute interpolation.
function _esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
                    .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Look up the live ROLES dictionary if troop_system.js exposed one (it
// declares `const ROLES` at top-level so it IS visible by name across
// scripts — but if for any reason it isn't, fall back to our role list).
function _resolveRoleString(roleVal) {
    // The role string we store ("infantry", "cavalry", …) is exactly what the
    // ROLES dictionary maps TO, so it can be passed straight through to
    // UnitRoster.create() without translation.
    return roleVal;
}

// Resolve a weight-class key ("HEAVY_INF") to its concrete object {tier,…}.
function _resolveWeightClass(wKey) {
    if (typeof WEIGHT_CLASSES !== "undefined" && WEIGHT_CLASSES[wKey]) {
        return WEIGHT_CLASSES[wKey];
    }
    return WEIGHT_OPTIONS[wKey] || WEIGHT_OPTIONS.LIGHT_INF;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ TROOP DEFAULTS                                                           ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// Brand-new blank troop scaffold.  Sensible defaults for a generic infantry.
function _blankTroop(s) {
    return {
        // Identity
        id:           _newId(s, "Troop"),
        name:         "Custom Troop",

        // Classification
        role:         "infantry",
        weightClass:  "LIGHT_INF",
        isLarge:      false,
        isRanged:     false,

        // Hierarchy / availability
        upgradeFrom:  "Militia",     // empty string = recruit-only / unique
        availableTo:  [],            // faction names; empty array = all factions

        // Core stats
        health:           100,
        meleeAttack:      10,
        meleeDefense:     10,
        armor:             5,
        morale:           50,
        speed:           0.8,
        range:            20,
        cost:             40,
        chargeBonus:       0,
        antiLargeDamage:   0,
        bonusVsLarge:      0,
        shieldBlockChance: 0,
        hasShield:        false,
        isCommander:      false,

        // Ranged-only (still serialised even if not ranged — keeps schema flat)
        ammo:               0,
        accuracy:           0,
        missileBaseDamage:  0,
        missileAPDamage:    0,

        // Description
        desc: "A custom troop. Edit the description to give your unit some flavour.",

        // Forward-compat for Phase 2
        appearance: null
    };
}

// Snapshot a vanilla UnitRoster entry into the same schema we use for customs.
// Used by the "Duplicate Vanilla → Custom" workflow.
function _vanillaToTroopSchema(s, vanillaName) {
    if (typeof UnitRoster === "undefined" || !UnitRoster.allUnits[vanillaName]) {
        return _blankTroop(s);
    }
    const v = UnitRoster.allUnits[vanillaName];

    // Reverse-engineer a weight-class key from the troop's tier/radius.  We
    // pick the WEIGHT_OPTIONS entry whose tier matches; first match wins.
    let wKey = "LIGHT_INF";
    for (const k of Object.keys(WEIGHT_OPTIONS)) {
        if (WEIGHT_OPTIONS[k].tier === v.weightTier) { wKey = k; break; }
    }

    return {
        id:           _newId(s, v.name + "_copy"),
        name:         v.name + " (Copy)",
        role:         v.role || "infantry",
        weightClass:  wKey,
        isLarge:      !!v.isLarge,
        isRanged:     !!v.isRanged,

        upgradeFrom:  "Militia",
        availableTo:  [],

        health:            +v.health            || 100,
        meleeAttack:       +v.meleeAttack       || 0,
        meleeDefense:      +v.meleeDefense      || 0,
        armor:             +v.armor             || 0,
        morale:            +v.morale            || 50,
        speed:             +v.speed             || 0.8,
        range:             +v.range             || 20,
        cost:              +v.cost              || 40,
        chargeBonus:       +v.chargeBonus       || 0,
        antiLargeDamage:   +v.antiLargeDamage   || 0,
        bonusVsLarge:      +v.bonusVsLarge      || 0,
        shieldBlockChance: +v.shieldBlockChance || 0,
        hasShield:         !!v.hasShield,
        isCommander:       !!v.isCommander,

        ammo:              +v.ammo              || 0,
        accuracy:          +v.accuracy          || 0,
        missileBaseDamage: +v.missileBaseDamage || 0,
        missileAPDamage:   +v.missileAPDamage   || 0,

        desc:        v.desc || "",
        appearance:  null
    };
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ STYLES                                                                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _ensureCSS() {
    if (document.getElementById("ste-css")) return;
    const css = document.createElement("style");
    css.id = "ste-css";
    css.textContent = `
        .ste-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7);
            z-index:10500; display:flex; align-items:center; justify-content:center;
            font-family:Tahoma,Verdana,sans-serif; }
        .ste-modal { background:${T.bg}; border:1px solid ${T.border};
            border-radius:6px; width:min(1200px,96vw); height:min(820px,94vh);
            display:flex; flex-direction:column; box-shadow:0 16px 60px rgba(0,0,0,0.85);
            color:${T.text}; overflow:hidden; }
        .ste-titlebar { background:${T.bar}; border-bottom:1px solid ${T.border};
            padding:8px 14px; display:flex; align-items:center; gap:10px; flex-shrink:0; }
        .ste-titlebar h2 { margin:0; color:${T.accent}; font-size:14px; flex:1; }
        .ste-toolbar { background:${T.bar}; border-bottom:1px solid ${T.border};
            padding:6px 10px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;
            flex-shrink:0; }
        .ste-body { flex:1; display:flex; min-height:0; overflow:hidden; }
        .ste-sidebar { width:300px; border-right:1px solid ${T.border};
            display:flex; flex-direction:column; flex-shrink:0; background:${T.bg}; }
        .ste-search-row { padding:8px; border-bottom:1px solid ${T.border2};
            display:flex; gap:5px; align-items:center; }
        .ste-list { flex:1; overflow-y:auto; padding:4px 0; }
        .ste-list-item { padding:6px 10px; cursor:pointer; border-left:3px solid transparent;
            border-bottom:1px solid ${T.border2}; transition:background .1s; }
        .ste-list-item:hover { background:${T.hoverDark}; }
        .ste-list-item.selected { background:${T.hover}; border-left-color:${T.accent}; }
        .ste-list-item .ste-li-name { font-weight:bold; font-size:12px; color:${T.text}; }
        .ste-list-item .ste-li-meta { font-size:10px; color:${T.dim}; margin-top:2px; }
        .ste-li-tag { display:inline-block; padding:1px 6px; border-radius:3px;
            font-size:9px; font-weight:bold; letter-spacing:0.5px; margin-right:4px; }
        .ste-li-tag.vanilla { background:#1e3a5a; color:${T.vanilla}; }
        .ste-li-tag.custom  { background:#3a1e4e; color:${T.custom}; }
        .ste-editor { flex:1; overflow-y:auto; padding:14px 18px; min-width:0; }
        .ste-editor.empty { display:flex; align-items:center; justify-content:center;
            color:${T.dim}; font-style:italic; }
        .ste-section { border:1px solid ${T.border2}; border-radius:4px;
            padding:10px 12px; margin-bottom:12px; background:rgba(0,0,0,0.15); }
        .ste-section-title { color:${T.dim}; font-size:10px; text-transform:uppercase;
            letter-spacing:1.5px; font-weight:bold; margin:-2px 0 8px; padding-bottom:5px;
            border-bottom:1px solid ${T.border2}; }
        .ste-grid { display:grid; gap:8px 12px; }
        .ste-grid.cols-2 { grid-template-columns:1fr 1fr; }
        .ste-grid.cols-3 { grid-template-columns:1fr 1fr 1fr; }
        .ste-grid.cols-4 { grid-template-columns:1fr 1fr 1fr 1fr; }
        @media (max-width:740px) { .ste-grid.cols-3, .ste-grid.cols-4 { grid-template-columns:1fr 1fr; } }
        .ste-field { display:flex; flex-direction:column; gap:3px; min-width:0; }
        .ste-field > label { font-size:10px; color:${T.dim}; text-transform:uppercase;
            letter-spacing:0.5px; }
        .ste-inp { background:${T.input}; border:1px solid ${T.border}; color:${T.text};
            padding:5px 8px; border-radius:3px; font:12px Tahoma,Verdana,sans-serif;
            box-sizing:border-box; width:100%; }
        .ste-inp:focus { outline:none; border-color:${T.blue}; }
        .ste-inp:disabled { opacity:0.5; cursor:not-allowed; }
        .ste-ta { background:${T.input}; border:1px solid ${T.border}; color:${T.text};
            padding:6px 8px; border-radius:3px; font:12px Tahoma,Verdana,sans-serif;
            width:100%; height:80px; resize:vertical; box-sizing:border-box; }
        .ste-chk { display:flex; align-items:center; gap:5px; cursor:pointer;
            font-size:11px; color:${T.text}; }
        .ste-chk input { cursor:pointer; }
        .ste-btn { background:#1e3a5a; border:1px solid ${T.border}; color:${T.text};
            padding:5px 11px; cursor:pointer; border-radius:3px;
            font:11px Tahoma,Verdana,sans-serif; transition:background .12s;
            white-space:nowrap; }
        .ste-btn:hover:not(:disabled) { background:#2a5a8c; color:#fff; }
        .ste-btn:disabled { opacity:0.4; cursor:not-allowed; }
        .ste-btn.pri { background:#1565c0; border-color:${T.blue}; color:#fff; }
        .ste-btn.pri:hover { background:#1976d2; }
        .ste-btn.dan { background:#5c1a1a; border-color:#c0392b; color:#ff8a80; }
        .ste-btn.dan:hover:not(:disabled) { background:#7c2a2a; }
        .ste-btn.gn  { background:#2e5d35; border-color:#5b9b66; color:#c8e6c9; }
        .ste-btn.gn:hover:not(:disabled) { background:#3d7a45; }
        .ste-tag { display:inline-block; padding:1px 5px; border-radius:3px;
            font-size:9px; font-weight:bold; letter-spacing:0.5px; }
        .ste-readonly-banner { background:#3a1e1e; border:1px solid #7a4a4a;
            color:#ffcdd2; padding:6px 10px; border-radius:3px; font-size:11px;
            margin-bottom:12px; }
        .ste-faction-grid { display:grid; gap:4px 8px;
            grid-template-columns:repeat(auto-fill,minmax(170px,1fr));
            max-height:140px; overflow-y:auto; padding:4px; background:rgba(0,0,0,0.2);
            border:1px solid ${T.border2}; border-radius:3px; }
        .ste-fac-row { display:flex; align-items:center; gap:5px; font-size:11px; }
        .ste-fac-dot { width:10px; height:10px; border-radius:2px; flex-shrink:0;
            border:1px solid #000; }
       
        .ste-phase2 { padding:14px; border:2px dashed ${T.border};
            border-radius:4px; text-align:center; color:${T.dim};
            background:rgba(0,0,0,0.25); font-size:11px; line-height:1.6; }
        .ste-phase2 strong { color:${T.accent}; }
    `;
    document.head.appendChild(css);
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ MENU INJECTION — adds the "🪖 Troops" button into the editor's menu bar  ║
// ╚══════════════════════════════════════════════════════════════════════════╝
let _injected = false;

function _injectMenuButton() {
    const titleEl = document.getElementById("se-menu-title");
    if (!titleEl) return false;
    if (document.getElementById("ste-menu-btn-wrap")) { _injected = true; return true; }

    const bar = titleEl.parentElement;
    if (!bar) return false;

    const wrap = document.createElement("div");
    wrap.id = "ste-menu-btn-wrap";
    wrap.style.cssText = "display:flex;position:relative;";

const btn = document.createElement("button");
    btn.textContent = "🪖 Troops";
    btn.title = "Open the Troop Editor (custom roster mods for this scenario)";
    Object.assign(btn.style, {
        background:  "none",
        border:      "none",
        color:       "#cfd8dc",
        padding:     "0 15px",
        cursor:      "pointer",
        fontSize:    "11px",
        height:      "30px",
        fontFamily:  "Tahoma,Verdana,sans-serif"
    });
    btn.onclick      = (e) => { e.stopPropagation(); openEditor(); };
    btn.onmouseenter = () => { btn.style.background = "#2a5a8c"; };
    btn.onmouseleave = () => { btn.style.background = "none"; };
    wrap.appendChild(btn);

    // Insert just before the Exit wrapper (last child of the menu bar).
    if (bar.lastElementChild) {
        bar.insertBefore(wrap, bar.lastElementChild);
    } else {
        bar.appendChild(wrap);
    }
    _injected = true;
    console.log("[ScenarioTroopEditor] 🪖 Troops menu button injected.");
    return true;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ MAIN EDITOR PANEL                                                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function openEditor() {
    const s = _scenario();
    if (!s) {
        alert("No scenario is currently open in the editor.\n\n" +
              "Create a new scenario or load one before opening the Troop Editor.");
        return;
    }
    _ensureCustomFields(s);
    _ensureCSS();

    if (state.panelEl) {
        // Already open — just refocus
        state.panelEl.style.display = "flex";
        return;
    }

    // ── Build root nodes ────────────────────────────────────────────────────
    const overlay = document.createElement("div");
    overlay.className = "ste-overlay";
    overlay.onclick = (e) => { if (e.target === overlay) closeEditor(); };

    const modal = document.createElement("div");
    modal.className = "ste-modal";
    overlay.appendChild(modal);

    // ── Title bar ───────────────────────────────────────────────────────────
    const titlebar = document.createElement("div");
    titlebar.className = "ste-titlebar";
    titlebar.innerHTML = `
        <h2>🪖 Troop Editor — Custom Roster for "${_esc(s.meta && s.meta.name || "Untitled")}"</h2>
        <span style="color:${T.dim};font-size:11px;">v${VERSION}</span>
    `;
    const closeBtn = document.createElement("button");
    closeBtn.className = "ste-btn";
    closeBtn.textContent = "✕ Close";
    closeBtn.onclick = closeEditor;
    titlebar.appendChild(closeBtn);
    modal.appendChild(titlebar);

    // ── Toolbar ─────────────────────────────────────────────────────────────
    const toolbar = document.createElement("div");
    toolbar.className = "ste-toolbar";
    toolbar.innerHTML = `
        <button class="ste-btn gn"  data-act="new">🆕 New Blank</button>
        <button class="ste-btn"     data-act="dup">⎘ Duplicate Selected</button>
        <button class="ste-btn dan" data-act="del">🗑 Delete Custom</button>
        <span style="flex:1;"></span>
        <button class="ste-btn pri" data-act="exp">📤 Export Pack…</button>
        <button class="ste-btn"     data-act="imp">📥 Import Pack…</button>
    `;
    toolbar.querySelector('[data-act="new"]').onclick = _newBlank;
    toolbar.querySelector('[data-act="dup"]').onclick = _duplicateSelected;
    toolbar.querySelector('[data-act="del"]').onclick = _deleteSelected;
    toolbar.querySelector('[data-act="exp"]').onclick = _exportPack;
    toolbar.querySelector('[data-act="imp"]').onclick = _importPack;
    modal.appendChild(toolbar);

    // ── Body: list + editor ─────────────────────────────────────────────────
    const body = document.createElement("div");
    body.className = "ste-body";
    modal.appendChild(body);

    const sidebar = document.createElement("div");
    sidebar.className = "ste-sidebar";
    body.appendChild(sidebar);

    const searchRow = document.createElement("div");
    searchRow.className = "ste-search-row";
    searchRow.innerHTML = `
        <input class="ste-inp" placeholder="Filter…" style="flex:1;"
               id="ste-search">
        <label class="ste-chk" title="Show vanilla (built-in) troops in the list">
            <input type="checkbox" id="ste-show-vanilla" ${state.showVanilla ? "checked" : ""}>
            Vanilla
        </label>
    `;
    sidebar.appendChild(searchRow);

    const list = document.createElement("div");
    list.className = "ste-list";
    list.id = "ste-list";
    sidebar.appendChild(list);

    const editor = document.createElement("div");
    editor.className = "ste-editor empty";
    editor.id = "ste-editor";
    editor.textContent = "Select a troop on the left, or click 🆕 New Blank to begin.";
    body.appendChild(editor);

    // ── Wire search + filter ────────────────────────────────────────────────
    searchRow.querySelector("#ste-search").oninput = (e) => {
        state.listFilter = e.target.value.toLowerCase();
        _renderList();
    };
    searchRow.querySelector("#ste-show-vanilla").onchange = (e) => {
        state.showVanilla = !!e.target.checked;
        _renderList();
    };

    // ── Append + render ─────────────────────────────────────────────────────
    document.body.appendChild(overlay);
    state.panelEl = overlay;
    _renderList();
}

function closeEditor() {
    if (state.panelEl && state.panelEl.parentNode) {
        state.panelEl.parentNode.removeChild(state.panelEl);
    }
    state.panelEl    = null;
    state.selectedId = null;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ LIST RENDERING (left sidebar)                                            ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _renderList() {
    const listEl = document.getElementById("ste-list");
    if (!listEl) return;
    const s = _scenario();
    if (!s) return;
    _ensureCustomFields(s);

    listEl.innerHTML = "";
    const filt = state.listFilter || "";

    // ── Custom troops first ─────────────────────────────────────────────────
    const customs = s.customTroops.slice().sort((a, b) =>
        (a.name || "").localeCompare(b.name || ""));
    customs.forEach(t => {
        if (filt && !(t.name || "").toLowerCase().includes(filt)
                 && !(t.role || "").toLowerCase().includes(filt)) return;
        listEl.appendChild(_renderListItem(t, /*isVanilla=*/false));
    });

    // ── Vanilla troops (read-only preview) ──────────────────────────────────
    if (state.showVanilla && typeof UnitRoster !== "undefined" && UnitRoster.allUnits) {
        const vanilla = Object.values(UnitRoster.allUnits)
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        vanilla.forEach(v => {
            // Skip if a custom with the same name already exists (it overrides)
            if (customs.some(c => c.name === v.name)) return;
            if (filt && !(v.name || "").toLowerCase().includes(filt)
                     && !(v.role || "").toLowerCase().includes(filt)) return;
            listEl.appendChild(_renderListItem(v, /*isVanilla=*/true));
        });
    }

    if (!listEl.firstChild) {
        const empty = document.createElement("div");
        empty.style.cssText = `padding:18px;color:${T.dim};text-align:center;font-style:italic;font-size:11px;`;
        empty.textContent = filt ? "No troops match the filter." : "No troops found.";
        listEl.appendChild(empty);
    }
}

function _renderListItem(t, isVanilla) {
    const item = document.createElement("div");
    item.className = "ste-list-item";
    if ((isVanilla ? ("v:" + t.name) : t.id) === state.selectedId) {
        item.classList.add("selected");
    }
    const tagCls = isVanilla ? "vanilla" : "custom";
    const tagTxt = isVanilla ? "VANILLA" : "CUSTOM";

    item.innerHTML = `
        <div class="ste-li-name">${_esc(t.name)}</div>
        <div class="ste-li-meta">
            <span class="ste-li-tag ${tagCls}">${tagTxt}</span>
            <span>${_esc(t.role || "—")}</span>
            <span style="color:${T.dim};">·</span>
            <span>${t.isRanged ? "ranged" : "melee"}</span>
            ${t.isLarge ? `<span style="color:${T.dim};">·</span><span>large</span>` : ""}
        </div>
    `;
    item.onclick = () => {
        state.selectedId = isVanilla ? ("v:" + t.name) : t.id;
        _renderList();      // refresh selection styling
        _renderEditor(isVanilla, t);
    };
    return item;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ EDITOR PANE (right side) — renders fields for the selected troop          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// `isVanilla` true → render a read-only inspector view of a vanilla troop.
// `isVanilla` false → render the full editable form for a custom troop.
function _renderEditor(isVanilla, troop) {
    const ed = document.getElementById("ste-editor");
    if (!ed) return;
    ed.classList.remove("empty");
    ed.innerHTML = "";
    const s = _scenario();

    // Header banner — vanilla troops show a read-only notice with quick actions.
    if (isVanilla) {
        const banner = document.createElement("div");
        banner.className = "ste-readonly-banner";
        banner.innerHTML = `
            <strong>📖 Vanilla troop — read-only.</strong>
            Vanilla troops are baked into the engine and cannot be edited or
            deleted from inside a scenario.  To customise this unit for THIS
            scenario, click <em>Duplicate to Custom</em> below — that creates a
            new editable copy named "<em>${_esc(troop.name)} (Copy)</em>".
        `;
        ed.appendChild(banner);

        const dupBtn = document.createElement("button");
        dupBtn.className = "ste-btn pri";
        dupBtn.textContent = `⎘ Duplicate "${troop.name}" to Custom`;
        dupBtn.onclick = () => {
            const fresh = _vanillaToTroopSchema(s, troop.name);
            s.customTroops.push(fresh);
            state.selectedId = fresh.id;
            _renderList();
            _renderEditor(false, fresh);
        };
        ed.appendChild(dupBtn);
        ed.appendChild(_buildReadOnlyView(troop));
        return;
    }

    // ── EDITABLE FORM (custom troop) ────────────────────────────────────────

    // 1. Identity & Classification
    const sec1 = _section("Identity & Classification");
    const grid1 = document.createElement("div");
    grid1.className = "ste-grid cols-2";
    grid1.appendChild(_textField(troop, "name",   "Display Name",
        "Used in-game and as the key for upgrade hierarchy lookups."));
    grid1.appendChild(_displayField("ID", troop.id,
        "Auto-generated, used internally — not visible in-game."));
    grid1.appendChild(_selectField(troop, "role", "Role",
        ROLE_OPTIONS,
        "Determines how the unit fights AND which sprite the renderer picks " +
        "(role-based dispatch).  Cannot be a free-form string — must be one " +
        "of the engine's known ROLES."));
    grid1.appendChild(_selectField(troop, "weightClass", "Weight Class",
        Object.keys(WEIGHT_OPTIONS).map(k => ({
            value: k,
            label: `${k}  (tier ${WEIGHT_OPTIONS[k].tier}, mass ${WEIGHT_OPTIONS[k].mass}, r ${WEIGHT_OPTIONS[k].radius})`
        })),
        "Affects pushing/shoving in the physical battle layer. Cannot be a " +
        "custom value — must be one of the engine's WEIGHT_CLASSES."));
    sec1.appendChild(grid1);

    const flagRow = document.createElement("div");
    flagRow.style.cssText = "display:flex;gap:18px;margin-top:8px;flex-wrap:wrap;";
    flagRow.appendChild(_checkField(troop, "isLarge",
        "Large unit (e.g. cavalry, elephant — affects bonus-vs-large damage)"));
    flagRow.appendChild(_checkField(troop, "isRanged",
        "Ranged unit (enables ammo + missile fields below)"));
    flagRow.appendChild(_checkField(troop, "hasShield",
        "Has shield (enables block chance)"));
    flagRow.appendChild(_checkField(troop, "isCommander",
        "Is a commander/general"));
    sec1.appendChild(flagRow);
    ed.appendChild(sec1);

    // 2. Hierarchy & Faction
    const sec2 = _section("Hierarchy & Faction Availability");

    const upgradeRow = document.createElement("div");
    upgradeRow.className = "ste-grid cols-2";
    upgradeRow.appendChild(_selectField(troop, "upgradeFrom",
        "Upgrades from (parent unit)",
        _allTroopOptions(s, /*includeBlank=*/true, troop.name),
        "When this scenario launches, this troop is appended to the parent's " +
        "upgrade list in the troop hierarchy.  Pick \"— None —\" to make this " +
        "troop recruit-only (only reachable as a faction unique)."));
    upgradeRow.appendChild(_displayField("Hierarchy Note",
        "Upgrades are GLOBAL in Phase 1.",
        "All factions who can recruit the parent will see this troop as an " +
        "upgrade option, regardless of the per-faction availability checkboxes " +
        "below.  Phase 2 will add per-faction hierarchy enforcement."));
    sec2.appendChild(upgradeRow);

    sec2.appendChild(_subHeading("Available to Factions",
        "Tick the factions that should have this troop in this scenario. " +
        "Empty list = available to ALL enabled factions.  This list is " +
        "metadata for now (Phase 1) — enforcement comes in a later phase. " +
        "What DOES work today: setting this troop as a single faction's " +
        "uniqueTroop in the Factions panel."));
    sec2.appendChild(_factionGrid(troop, s));

    // Faction-unique assignment row.  This bridges around the hardcoded
    // ALL_TROOP_TYPES list in scenario_editor.js's Factions panel — which
    // does NOT know about custom troops.  Picking a faction here writes
    // directly to scenario.factions[picked].uniqueTroop, which the runtime
    // already pipes into troopGUI.faction_uniques on launch.
    sec2.appendChild(_subHeading("Assign as a Faction's Unique Troop",
        "Optional. If set, the chosen faction's recruitment screen will offer " +
        "this troop in its 'Unique' slot when the scenario launches.  Each " +
        "faction can only have ONE unique troop — picking a faction here " +
        "overwrites that faction's previous unique pick."));
    sec2.appendChild(_factionUniquePicker(troop, s));

    ed.appendChild(sec2);

    // 3. Core Stats
    const sec3 = _section("Core Stats");
    const grid3 = document.createElement("div");
    grid3.className = "ste-grid cols-3";
    grid3.appendChild(_numField(troop, "health",
        "Health (HP)", { min: 1, max: 9999, hint: "Total hit points." }));
    grid3.appendChild(_numField(troop, "morale",
        "Morale (max)", { min: 0, max: 200, hint: "Higher = harder to rout." }));
    grid3.appendChild(_numField(troop, "speed",
        "Speed", { min: 0.1, max: 3.0, step: 0.05, hint: "Movement speed multiplier. Infantry ~0.7, light cav ~1.5–2.0." }));
    grid3.appendChild(_numField(troop, "meleeAttack",
        "Melee Attack", { min: 0, max: 200, hint: "Attack rating in melee combat." }));
    grid3.appendChild(_numField(troop, "meleeDefense",
        "Melee Defense", { min: 0, max: 200, hint: "Defense rating in melee combat." }));
    grid3.appendChild(_numField(troop, "armor",
        "Armor", { min: 0, max: 200, hint: "Damage reduction. See preset values below." },
        ARMOR_PRESETS));
    grid3.appendChild(_numField(troop, "range",
        "Engagement Range", { min: 5, max: 1500, hint: "How close before it engages — for ranged, also fire range." }));
    grid3.appendChild(_numField(troop, "cost",
        "Recruitment Cost", { min: 0, max: 9999, hint: "Gold cost to recruit/upgrade." }));
    grid3.appendChild(_numField(troop, "shieldBlockChance",
        "Shield Block %", { min: 0, max: 100, hint: "Only applies if 'Has shield' is on." }));
    grid3.appendChild(_numField(troop, "chargeBonus",
        "Charge Bonus", { min: 0, max: 100, hint: "Extra damage when charging into combat." }));
    grid3.appendChild(_numField(troop, "antiLargeDamage",
        "Anti-Large Damage", { min: 0, max: 100, hint: "Extra damage vs large units (cav/elephants)." }));
    grid3.appendChild(_numField(troop, "bonusVsLarge",
        "Anti-Large Bonus %", { min: 0, max: 100, hint: "Pike multiplier vs charging large units." }));
    sec3.appendChild(grid3);
    ed.appendChild(sec3);

    // 4. Ranged stats (always visible — disabled when not ranged)
    const sec4 = _section("Ranged Stats");
    const ngrid = document.createElement("div");
    ngrid.className = "ste-grid cols-4";
    ngrid.appendChild(_numField(troop, "ammo",
        "Ammo", { min: 0, max: 999, hint: "Shots per battle." }, null, !troop.isRanged));
    ngrid.appendChild(_numField(troop, "accuracy",
        "Accuracy", { min: 0, max: 100, hint: "Higher = more shots hit. 0–100." }, null, !troop.isRanged));
    ngrid.appendChild(_numField(troop, "missileBaseDamage",
        "Missile Base Dmg", { min: 0, max: 999, hint: "Raw damage per shot before AP." }, null, !troop.isRanged));
    ngrid.appendChild(_numField(troop, "missileAPDamage",
        "Missile AP Dmg", { min: 0, max: 999, hint: "Armor-piercing component of the missile." }, null, !troop.isRanged));
    if (!troop.isRanged) {
        const note = document.createElement("div");
        note.style.cssText = `font-size:10px;color:${T.dim};margin-top:6px;font-style:italic;`;
        note.textContent = "Tick \"Ranged unit\" above to enable these fields.";
        sec4.appendChild(note);
    }
    sec4.appendChild(ngrid);
    ed.appendChild(sec4);

    // 5. Description
    const sec5 = _section("Description / Lore");
    const ta = document.createElement("textarea");
    ta.className = "ste-ta";
    ta.value = troop.desc || "";
    ta.placeholder = "Shown in the troop card. Markdown is NOT supported — plain text only.";
    ta.oninput = () => { troop.desc = ta.value; };
    sec5.appendChild(ta);
    ed.appendChild(sec5);

    // 6. Appearance section — wired to Phase 2 v2 parametric appearance system
    const sec6 = _section("Appearance / Animations");
    const appWrap = document.createElement("div");
    appWrap.style.cssText = "display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;";

    // ── Thumbnail column ────────────────────────────────────────────────────
    const thumbCol = document.createElement("div");
    thumbCol.style.cssText = "display:flex;flex-direction:column;gap:5px;align-items:center;flex-shrink:0;";

    const thumb = document.createElement("canvas");
    thumb.width  = 120;
    thumb.height = 150;
    thumb.style.cssText = "border:1px solid #3a5a7a;background:#1a2230;border-radius:3px;";

    // Helper: draw or show fallback text
    const _refreshThumb = () => {
        const ctx = thumb.getContext("2d");
        ctx.clearRect(0, 0, thumb.width, thumb.height);
        ctx.fillStyle = "#1a2230";
        ctx.fillRect(0, 0, thumb.width, thumb.height);
        // Ground line
        ctx.fillStyle = "#2a3f2a";
        ctx.fillRect(0, thumb.height - 20, thumb.width, 20);

        if (typeof window.ScenarioTroopAppearance === "undefined") {
            ctx.fillStyle = "#7a9ab8"; ctx.font = "10px Tahoma,sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("appearance", thumb.width/2, thumb.height/2 - 6);
            ctx.fillText("module not loaded", thumb.width/2, thumb.height/2 + 8);
            return;
        }

        const fc = (s.factions && s.factions[0] && s.factions[0].color) ? s.factions[0].color : "#c62828";
        if (!troop.appearance || !window.ScenarioTroopAppearance.hasAppearance(troop)) {
            ctx.fillStyle = "#7a9ab8"; ctx.font = "10px Tahoma,sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("Default / vanilla", thumb.width/2, thumb.height/2 - 6);
            ctx.fillStyle = "#4aafd8"; ctx.font = "9px Tahoma,sans-serif";
            ctx.fillText("role: " + (troop.role || "infantry"), thumb.width/2, thumb.height/2 + 8);
            ctx.fillText("click Edit to customise", thumb.width/2, thumb.height/2 + 22);
            return;
        }

        // Try vanilla draw at the thumbnail — it may not be available in editor mode,
        // so we attempt it and fall back gracefully.
        try {
            window.ScenarioTroopAppearance.drawAppearanceThumbnail(thumb, troop.appearance, fc);
        } catch (e) {
            ctx.fillStyle = "#7a9ab8"; ctx.font = "10px Tahoma,sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("Preview unavailable", thumb.width/2, thumb.height/2);
        }
    };
    _refreshThumb();
    thumbCol.appendChild(thumb);

    // Refresh button under thumb
    const thumbRefreshBtn = document.createElement("button");
    thumbRefreshBtn.className = "ste-btn";
    thumbRefreshBtn.style.cssText = "font-size:10px;padding:2px 8px;";
    thumbRefreshBtn.textContent = "↺ Refresh";
    thumbRefreshBtn.onclick = _refreshThumb;
    thumbCol.appendChild(thumbRefreshBtn);

    appWrap.appendChild(thumbCol);

    // ── Right column: status + buttons + info ───────────────────────────────
    const appRight = document.createElement("div");
    appRight.style.cssText = "flex:1;min-width:220px;display:flex;flex-direction:column;gap:7px;";

    const appStatus = document.createElement("div");
    appStatus.style.cssText = "font-size:11px;color:#aaa;background:rgba(0,0,0,0.2);padding:5px 8px;border-radius:3px;border:1px solid #2a3f5a;";
    const _formatStatus = (tr) => {
        if (typeof window.ScenarioTroopAppearance === "undefined") return "(appearance module not loaded)";
        if (!window.ScenarioTroopAppearance.hasAppearance(tr)) return "Default — uses role-based vanilla look.";
        const a = tr.appearance;
        const poseLabel = (window.ScenarioTroopAppearance.POSE_TYPES.find(p => p.value === a.poseType) || {}).label || a.poseType;
        const armorNote = (typeof tr.armor === "number") ? "Armor " + tr.armor : "";
        return "✓ Custom: " + a.styleFaction + " — " + poseLabel +
               (a.sizeScale !== 1 ? " · " + a.sizeScale + "× size" : "") +
               (armorNote ? " · " + armorNote : "");
    };
    appStatus.textContent = _formatStatus(troop);
    appRight.appendChild(appStatus);

    // Appearance info grid — shows current weapon/armor values prominently
    const appInfoGrid = document.createElement("div");
    appInfoGrid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;font-size:10px;color:#7a9ab8;";
    const _infoKV = (k, v) => {
        const row = document.createElement("div");
        row.innerHTML = `<span style="color:#4aafd8;font-weight:bold;">${_esc(k)}:</span> ${_esc(String(v))}`;
        return row;
    };
    appInfoGrid.appendChild(_infoKV("Role", troop.role || "—"));
    appInfoGrid.appendChild(_infoKV("Armor", troop.armor || 0));
    appInfoGrid.appendChild(_infoKV("Weapon", troop.isRanged ? (troop.role || "ranged") : "melee"));
    appInfoGrid.appendChild(_infoKV("Pose", (troop.appearance && troop.appearance.poseType) || "(default)"));
    appInfoGrid.appendChild(_infoKV("Style", (troop.appearance && troop.appearance.styleFaction) || "(none set)"));
    appInfoGrid.appendChild(_infoKV("Size ×", (troop.appearance && troop.appearance.sizeScale) || "1.0"));
    appRight.appendChild(appInfoGrid);

    // Buttons row
    const appBtns = document.createElement("div");
    appBtns.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";

    const editSprBtn = document.createElement("button");
    editSprBtn.className = "ste-btn pri";
    editSprBtn.textContent = "🎨 Appearance Editor";
    editSprBtn.title = "Opens the full appearance painter — choose cultural style (helmet, armor, weapon look), pose, size, and attack animation curve.";
    editSprBtn.onclick = () => {
        if (typeof window.ScenarioTroopAppearance === "undefined") {
            alert("ScenarioTroopAppearance is not loaded.\nMake sure scenario_troop_appearance.js is included in index.html after scenario_troop_editor.js.");
            return;
        }
        window.ScenarioTroopAppearance.openPainter(troop, (updated) => {
            _refreshThumb();
            appStatus.textContent = _formatStatus(updated);
            // Refresh the info grid
            appInfoGrid.innerHTML = "";
            appInfoGrid.appendChild(_infoKV("Role", updated.role || "—"));
            appInfoGrid.appendChild(_infoKV("Armor", updated.armor || 0));
            appInfoGrid.appendChild(_infoKV("Weapon", updated.isRanged ? (updated.role || "ranged") : "melee"));
            appInfoGrid.appendChild(_infoKV("Pose", (updated.appearance && updated.appearance.poseType) || "(default)"));
            appInfoGrid.appendChild(_infoKV("Style", (updated.appearance && updated.appearance.styleFaction) || "(none set)"));
            appInfoGrid.appendChild(_infoKV("Size ×", (updated.appearance && updated.appearance.sizeScale) || "1.0"));
        });
    };
    appBtns.appendChild(editSprBtn);

    // Test Animation button — opens inline animation preview in the editor
    const testAnimBtn = document.createElement("button");
    testAnimBtn.className = "ste-btn gn";
    testAnimBtn.textContent = "🧪 Test Animation";
    testAnimBtn.title = "Open a live animation test overlay — preview Idle, Walking, and Attacking states for this troop without launching a battle.";
    testAnimBtn.onclick = () => _openAnimTestOverlay(troop, s);
    appBtns.appendChild(testAnimBtn);

    appRight.appendChild(appBtns);

    const appHint = document.createElement("div");
    appHint.style.cssText = "font-size:10px;color:#5a7a8a;line-height:1.5;";
    appHint.innerHTML =
        "<strong style='color:#7a9ab8;'>Style faction</strong> picks the helmet, armor, and weapon look (e.g. Yamato kabuto, Mongol lamellar). " +
        "<strong style='color:#7a9ab8;'>Pose</strong> sets the weapon silhouette (spear, bow, sword+shield…). " +
        "<strong style='color:#7a9ab8;'>Attack curve</strong> retimes the swing frame-by-frame. " +
        "The unit's actual team color stays driven by their faction in battle.";
    appRight.appendChild(appHint);

    appWrap.appendChild(appRight);
    sec6.appendChild(appWrap);
    ed.appendChild(sec6);

    // 7. Bottom action row
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;margin-top:14px;justify-content:flex-end;";
    const delBtn = document.createElement("button");
    delBtn.className = "ste-btn dan";
    delBtn.textContent = "🗑 Delete this Custom Troop";
    delBtn.onclick = () => {
        if (!confirm(`Delete "${troop.name}"?\nThis cannot be undone.`)) return;
        const idx = s.customTroops.findIndex(t => t.id === troop.id);
        if (idx >= 0) s.customTroops.splice(idx, 1);
        state.selectedId = null;
        _renderList();
        const ed2 = document.getElementById("ste-editor");
        if (ed2) {
            ed2.classList.add("empty");
            ed2.innerHTML = "Select a troop on the left, or click 🆕 New Blank to begin.";
        }
    };
    actions.appendChild(delBtn);
    ed.appendChild(actions);
}

// ── Read-only view of a vanilla troop ──────────────────────────────────────
function _buildReadOnlyView(v) {
    const wrap = document.createElement("div");
    const sec = _section("Stats Snapshot (Vanilla)");
    const grid = document.createElement("div");
    grid.className = "ste-grid cols-3";
    const fields = [
        ["Role", v.role || "—"], ["isLarge", String(!!v.isLarge)],
        ["isRanged", String(!!v.isRanged)],
        ["Health", v.health], ["Melee Atk", v.meleeAttack],
        ["Melee Def", v.meleeDefense],
        ["Armor", v.armor], ["Morale", v.morale],
        ["Speed", v.speed],
        ["Range", v.range], ["Cost", v.cost],
        ["Shield Block %", v.shieldBlockChance || 0],
        ["Charge Bonus", v.chargeBonus || 0],
        ["Anti-Large Dmg", v.antiLargeDamage || 0],
        ["Anti-Large %", v.bonusVsLarge || 0]
    ];
    if (v.isRanged) {
        fields.push(["Ammo", v.ammo], ["Accuracy", v.accuracy],
                    ["Missile Base", v.missileBaseDamage],
                    ["Missile AP", v.missileAPDamage]);
    }
    fields.forEach(([k, val]) => grid.appendChild(_displayField(k, val)));
    sec.appendChild(grid);

    if (v.desc) {
        const dsec = _section("Description (Vanilla)");
        const p = document.createElement("div");
        p.style.cssText = `font-size:11px;color:${T.text};line-height:1.55;white-space:pre-wrap;`;
        p.textContent = v.desc;
        dsec.appendChild(p);
        wrap.appendChild(sec);
        wrap.appendChild(dsec);
        return wrap;
    }
    wrap.appendChild(sec);
    return wrap;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ FORM-CONTROL HELPERS                                                     ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _section(title) {
    const sec = document.createElement("div");
    sec.className = "ste-section";
    const h = document.createElement("div");
    h.className = "ste-section-title";
    h.textContent = title;
    sec.appendChild(h);
    return sec;
}

function _subHeading(title, hint) {
    const w = document.createElement("div");
    w.style.cssText = "margin:10px 0 6px;";
    const h = document.createElement("div");
    h.style.cssText = `font-size:11px;color:${T.text};font-weight:bold;`;
    h.textContent = title;
    w.appendChild(h);
    if (hint) {
        const p = document.createElement("div");
        p.style.cssText = `font-size:10px;color:${T.dim};margin-top:2px;line-height:1.4;`;
        p.textContent = hint;
        w.appendChild(p);
    }
    return w;
}

function _displayField(label, value, hint) {
    const f = document.createElement("div");
    f.className = "ste-field";
    const l = document.createElement("label");
    l.textContent = label;
    f.appendChild(l);
    const v = document.createElement("div");
    v.style.cssText = `padding:5px 8px;background:${T.bg};border:1px dashed ${T.border2};border-radius:3px;font-size:11px;color:${T.dim};`;
    v.textContent = (value === null || value === undefined) ? "—" : String(value);
    f.appendChild(v);
    if (hint) f.appendChild(_hint(hint));
    return f;
}

function _textField(obj, key, label, hint) {
    const f = document.createElement("div");
    f.className = "ste-field";
    const l = document.createElement("label");
    l.textContent = label;
    f.appendChild(l);
    const i = document.createElement("input");
    i.className = "ste-inp";
    i.type = "text";
    i.value = obj[key] || "";
    i.oninput = () => { obj[key] = i.value; };
    i.onchange = () => {
        // On blur — if name changed, refresh the list to reflect it
        if (key === "name") _renderList();
    };
    f.appendChild(i);
    if (hint) f.appendChild(_hint(hint));
    return f;
}

function _selectField(obj, key, label, options, hint) {
    const f = document.createElement("div");
    f.className = "ste-field";
    const l = document.createElement("label");
    l.textContent = label;
    f.appendChild(l);
    const sel = document.createElement("select");
    sel.className = "ste-inp";
    options.forEach(o => {
        const opt = document.createElement("option");
        opt.value = o.value;
        opt.textContent = o.label;
        if (obj[key] === o.value) opt.selected = true;
        sel.appendChild(opt);
    });
    sel.onchange = () => {
        obj[key] = sel.value;
        // Re-render after role/weight change so dependent fields refresh.
        if (key === "role" || key === "weightClass" || key === "isRanged" || key === "isLarge") {
            const ed = document.getElementById("ste-editor");
            if (ed) _renderEditor(false, obj);
        }
    };
    f.appendChild(sel);
    if (hint) f.appendChild(_hint(hint));
    return f;
}

function _checkField(obj, key, label) {
    const lbl = document.createElement("label");
    lbl.className = "ste-chk";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!obj[key];
    cb.onchange = () => {
        obj[key] = cb.checked;
        // Some flags (isRanged, isLarge) change visible fields.
        if (key === "isRanged" || key === "isLarge") {
            _renderEditor(false, obj);
        }
    };
    lbl.appendChild(cb);
    const span = document.createElement("span");
    span.textContent = label;
    lbl.appendChild(span);
    return lbl;
}

// `presetList`: optional [{v, label}] preset chips rendered below the input.
function _numField(obj, key, label, opts, presetList, disabled) {
    opts = opts || {};
    const f = document.createElement("div");
    f.className = "ste-field";
    const l = document.createElement("label");
    l.textContent = label;
    f.appendChild(l);
    const i = document.createElement("input");
    i.className = "ste-inp";
    i.type = "number";
    if (typeof opts.min === "number")  i.min = opts.min;
    if (typeof opts.max === "number")  i.max = opts.max;
    i.step = opts.step || 1;
    i.value = (obj[key] !== undefined && obj[key] !== null) ? obj[key] : "";
    if (disabled) i.disabled = true;
    i.oninput = () => {
        obj[key] = _num(i.value, 0, opts.min, opts.max);
    };
    f.appendChild(i);
    if (presetList && presetList.length) {
        const presets = document.createElement("div");
        presets.style.cssText = "display:flex;gap:3px;flex-wrap:wrap;margin-top:3px;";
        presetList.forEach(p => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "ste-btn";
            chip.style.cssText = "padding:1px 5px;font-size:9px;";
            chip.textContent = p.label;
            chip.onclick = () => {
                if (disabled) return;
                obj[key] = p.v;
                i.value = p.v;
            };
            presets.appendChild(chip);
        });
        f.appendChild(presets);
    }
    if (opts.hint) f.appendChild(_hint(opts.hint));
    return f;
}

function _hint(text) {
    const p = document.createElement("div");
    p.style.cssText = `font-size:10px;color:${T.dim};margin-top:2px;line-height:1.4;`;
    p.textContent = text;
    return p;
}

// Build the option list for the upgrade-parent dropdown — vanilla units +
// other custom troops, minus the current troop itself.
function _allTroopOptions(s, includeBlank, excludeName) {
    const out = [];
    if (includeBlank) out.push({ value: "", label: "— None (recruit-only) —" });
    const seen = new Set();

    // Vanilla units first
    if (typeof UnitRoster !== "undefined" && UnitRoster.allUnits) {
        Object.keys(UnitRoster.allUnits).sort().forEach(k => {
            const v = UnitRoster.allUnits[k];
            if (v.name === excludeName) return;
            if (seen.has(v.name)) return;
            seen.add(v.name);
            out.push({ value: v.name, label: v.name + "  (vanilla)" });
        });
    }
    // Then customs (so designers can chain custom → custom upgrades)
    s.customTroops.forEach(t => {
        if (t.name === excludeName) return;
        if (seen.has(t.name)) return;
        seen.add(t.name);
        out.push({ value: t.name, label: t.name + "  (custom)" });
    });
    return out;
}

// Render a checkbox grid of all factions in the scenario.  Toggling updates
// the troop's availableTo array.
function _factionGrid(troop, s) {
    const grid = document.createElement("div");
    grid.className = "ste-faction-grid";
    if (!s.factions || !Object.keys(s.factions).length) {
        const empty = document.createElement("div");
        empty.style.cssText = `padding:8px;color:${T.dim};font-style:italic;font-size:11px;`;
        empty.textContent = "No factions defined yet — set up factions first in the Factions panel.";
        grid.appendChild(empty);
        return grid;
    }
    const sortedFactions = Object.entries(s.factions)
        .sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
    sortedFactions.forEach(([fName, fData]) => {
        const row = document.createElement("label");
        row.className = "ste-fac-row";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = (troop.availableTo || []).includes(fName);
        cb.onchange = () => {
            troop.availableTo = troop.availableTo || [];
            const idx = troop.availableTo.indexOf(fName);
            if (cb.checked && idx === -1) troop.availableTo.push(fName);
            if (!cb.checked && idx !== -1) troop.availableTo.splice(idx, 1);
        };
        const dot = document.createElement("span");
        dot.className = "ste-fac-dot";
        dot.style.background = fData.color || "#888";
        const txt = document.createElement("span");
        txt.textContent = fName;
        row.appendChild(cb);
        row.appendChild(dot);
        row.appendChild(txt);
        grid.appendChild(row);
    });
    return grid;
}

// Render a row showing which faction (if any) currently has this troop set
// as its uniqueTroop.  Lets the user toggle a faction's uniqueTroop to point
// at this custom troop, or clear it back to whatever was there before.
//
// This is the ONE bridge that actually makes a custom troop appear at runtime
// without relying on per-faction hierarchy enforcement (which is Phase 2+).
function _factionUniquePicker(troop, s) {
    const wrap = document.createElement("div");
    if (!s.factions || !Object.keys(s.factions).length) {
        const empty = document.createElement("div");
        empty.style.cssText = `padding:8px;color:${T.dim};font-style:italic;font-size:11px;`;
        empty.textContent = "No factions defined yet.";
        wrap.appendChild(empty);
        return wrap;
    }
    // Find any faction whose uniqueTroop currently points at this troop's name.
    const sortedFactions = Object.entries(s.factions)
        .sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
    const currentlyUniqueFor = sortedFactions
        .filter(([fName, fData]) => fData.uniqueTroop === troop.name)
        .map(([fName]) => fName);

    if (currentlyUniqueFor.length) {
        const note = document.createElement("div");
        note.style.cssText = `font-size:11px;color:${T.green};margin-bottom:6px;`;
        note.innerHTML = `✓ Currently set as the unique troop for: <strong>${
            currentlyUniqueFor.map(_esc).join(", ")}</strong>`;
        wrap.appendChild(note);
    }

    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;";

    const select = document.createElement("select");
    select.className = "ste-inp";
    select.style.maxWidth = "260px";
    const blankOpt = document.createElement("option");
    blankOpt.value = "";
    blankOpt.textContent = "— Pick a faction —";
    select.appendChild(blankOpt);
    sortedFactions.forEach(([fName, fData]) => {
        const opt = document.createElement("option");
        opt.value = fName;
        const cur = fData.uniqueTroop || "(none)";
        opt.textContent = `${fName}   [current unique: ${cur}]`;
        select.appendChild(opt);
    });

    const setBtn = document.createElement("button");
    setBtn.className = "ste-btn pri";
    setBtn.textContent = "🎯 Set as this faction's unique";
    setBtn.onclick = () => {
        const f = select.value;
        if (!f) { alert("Pick a faction in the dropdown first."); return; }
        const cur = s.factions[f].uniqueTroop;
        if (cur && cur !== troop.name) {
            if (!confirm(`"${f}" currently has "${cur}" as its unique troop.\n\n` +
                         `Replace it with "${troop.name}"?`)) return;
        }
        s.factions[f].uniqueTroop = troop.name;
        // Also keep the live window.FACTIONS in sync if it exists (so the
        // Factions panel's display reflects the change immediately when the
        // user goes back there).
        if (window.FACTIONS && window.FACTIONS[f]) {
            window.FACTIONS[f].uniqueTroop = troop.name;
        }
        _renderEditor(false, troop);   // refresh the "currently unique for…" line
    };

    const clearBtn = document.createElement("button");
    clearBtn.className = "ste-btn dan";
    clearBtn.textContent = "✖ Clear all";
    clearBtn.title = "Remove this troop from every faction's unique slot.";
    clearBtn.onclick = () => {
        let cleared = 0;
        sortedFactions.forEach(([fName, fData]) => {
            if (fData.uniqueTroop === troop.name) {
                fData.uniqueTroop = "";
                if (window.FACTIONS && window.FACTIONS[fName]) {
                    window.FACTIONS[fName].uniqueTroop = "";
                }
                cleared++;
            }
        });
        if (!cleared) {
            alert("This troop is not set as a unique for any faction.");
            return;
        }
        _renderEditor(false, troop);
    };

    row.appendChild(select);
    row.appendChild(setBtn);
    row.appendChild(clearBtn);
    wrap.appendChild(row);
    return wrap;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ ANIMATION TEST OVERLAY                                                   ║
// ║ A standalone animated preview of a troop launched from the editor —      ║
// ║ no need to start a full battle.  Shows Idle / Walking / Attacking.       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function _openAnimTestOverlay(troop, s) {
    // Remove any existing test overlay
    const existing = document.getElementById("ste-anim-test-overlay");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    const overlay = document.createElement("div");
    overlay.id = "ste-anim-test-overlay";
    overlay.style.cssText = `
        position:fixed; inset:0; background:rgba(0,0,0,0.75);
        z-index:11000; display:flex; align-items:center; justify-content:center;
        font-family:Tahoma,Verdana,sans-serif;
    `;
    overlay.onclick = (e) => { if (e.target === overlay) _closeAnimTest(); };

    const box = document.createElement("div");
    box.style.cssText = `
        background:#141d2c; border:1px solid #3a5a7a; border-radius:6px;
        padding:16px; min-width:360px; max-width:480px;
        box-shadow:0 12px 48px rgba(0,0,0,0.9); color:#cfd8dc;
    `;

    // Title
    const ttl = document.createElement("div");
    ttl.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:12px;";
    ttl.innerHTML = `<span style="color:#f5d76e;font-size:13px;font-weight:bold;flex:1;">🧪 Animation Test — ${_esc(troop.name)}</span>`;
    const xBtn = document.createElement("button");
    xBtn.className = "ste-btn";
    xBtn.textContent = "✕ Close";
    xBtn.onclick = _closeAnimTest;
    ttl.appendChild(xBtn);
    box.appendChild(ttl);

    // Canvas
    const cv = document.createElement("canvas");
    cv.width  = 320;
    cv.height = 220;
    cv.style.cssText = "border:1px solid #2a3f5a;border-radius:3px;background:#1a2230;display:block;margin:0 auto 10px;width:100%;";
    box.appendChild(cv);

    // Mode controls
    const modeRow = document.createElement("div");
    modeRow.style.cssText = "display:flex;gap:6px;justify-content:center;margin-bottom:8px;";

    let _animMode = "idle";
    let _animFrame = 0;
    let _animIv = null;

    const modes = [
        { id: "idle",      label: "⬛ Idle" },
        { id: "moving",    label: "🚶 Walking" },
        { id: "attacking", label: "⚔️ Attacking" }
    ];

    const modeBtns = {};
    modes.forEach(m => {
        const b = document.createElement("button");
        b.className = "ste-btn" + (m.id === "idle" ? " pri" : "");
        b.textContent = m.label;
        b.onclick = () => {
            _animMode  = m.id;
            _animFrame = 0;
            Object.values(modeBtns).forEach(btn => btn.classList.remove("pri"));
            b.classList.add("pri");
        };
        modeBtns[m.id] = b;
        modeRow.appendChild(b);
    });
    box.appendChild(modeRow);

    // Team color row
    const colorRow = document.createElement("div");
    colorRow.style.cssText = "display:flex;gap:5px;justify-content:center;margin-bottom:8px;flex-wrap:wrap;";
    let _teamColor = (s && s.factions && s.factions[0] && s.factions[0].color) ? s.factions[0].color : "#c62828";
    const teamColors = ["#c62828","#1565c0","#2e7d32","#ef6c00","#ffffff","#9c27b0"];
    const teamNames  = ["Red","Blue","Green","Amber","White","Purple"];
    const teamBtns   = {};
    teamColors.forEach((hex, i) => {
        const b = document.createElement("button");
        b.className = "ste-btn";
        b.style.cssText = "font-size:10px;padding:2px 7px;border-left:3px solid " + hex + ";";
        b.textContent = teamNames[i];
        if (hex === _teamColor) b.classList.add("pri");
        b.onclick = () => {
            _teamColor = hex;
            Object.values(teamBtns).forEach(btn => btn.classList.remove("pri"));
            b.classList.add("pri");
        };
        teamBtns[hex] = b;
        colorRow.appendChild(b);
    });
    box.appendChild(colorRow);

    const infoTxt = document.createElement("div");
    infoTxt.style.cssText = "text-align:center;font-size:10px;color:#5a7a8a;";
    const appModule = typeof window.ScenarioTroopAppearance !== "undefined";
    const drawAvail = typeof window.drawInfantryUnit === "function" || typeof window.drawCavalryUnit === "function";
    infoTxt.textContent = appModule && drawAvail
        ? "Showing full custom appearance · uses real vanilla draw functions"
        : (!drawAvail ? "⚠ Vanilla draw functions not loaded — showing placeholder art" : "⚠ Appearance module not loaded");
    box.appendChild(infoTxt);

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // ── Animation draw loop ──────────────────────────────────────────────────
    const app = troop.appearance && window.ScenarioTroopAppearance &&
                window.ScenarioTroopAppearance.hasAppearance(troop) ? troop.appearance : null;

    function _drawAnimFrame() {
        const ctx = cv.getContext("2d");
        ctx.clearRect(0, 0, cv.width, cv.height);

        // Background
        ctx.fillStyle = "#1a2230";
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = "#2a3f2a";
        ctx.fillRect(0, cv.height - 30, cv.width, 30);

        const isCav  = app && window.ScenarioTroopAppearance &&
                       window.ScenarioTroopAppearance.POSE_TYPES &&
                       ["cavalry","horse_archer","camel","elephant"].includes(app.poseType);
        const drawFn = isCav ? window.drawCavalryUnit : window.drawInfantryUnit;
        const anchorX = cv.width / 2;
        const anchorY = cv.height - 30;

        if (typeof drawFn !== "function") {
            // Fallback: draw a simple coloured silhouette so the test overlay
            // still shows something useful when the vanilla draw isn't loaded yet.
            ctx.fillStyle = _teamColor;
            const bx = anchorX - 10, by = anchorY - 55;
            // Head
            ctx.beginPath();
            ctx.arc(anchorX, by - 8, 10, 0, Math.PI * 2);
            ctx.fill();
            // Body
            ctx.fillRect(bx, by, 20, 30);
            // Legs (with wobble if moving)
            const legOff = (_animMode !== "idle") ? Math.sin(_animFrame * 0.18) * 6 : 0;
            ctx.fillRect(bx,      by + 30, 8, 18 + legOff);
            ctx.fillRect(bx + 12, by + 30, 8, 18 - legOff);
            // Weapon stub
            if (_animMode === "attacking") {
                const swingAngle = Math.sin(_animFrame * 0.25) * 0.8;
                ctx.save();
                ctx.translate(anchorX + 10, by + 10);
                ctx.rotate(swingAngle);
                ctx.strokeStyle = "#aaa";
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(30, -20);
                ctx.stroke();
                ctx.restore();
            }
            ctx.fillStyle = "#7a9ab8";
            ctx.font = "9px Tahoma,sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("(vanilla draw not available)", anchorX, 14);
            _animFrame++;
            return;
        }

        const moving      = (_animMode === "moving" || _animMode === "attacking");
        const isAttacking = (_animMode === "attacking");
        const maxCd       = 100;
        const cycleP      = isAttacking ? ((_animFrame % 60) / 60) : 0;
        const realCd      = isAttacking ? Math.round(maxCd * (1 - cycleP)) : 0;

        let useCd = realCd;
        if (isAttacking && app && window.ScenarioTroopAppearance) {
            const inten = window.ScenarioTroopAppearance.getAttackIntensity(app, realCd, maxCd);
            // phantom cd
            useCd = Math.round(maxCd * (1 - Math.max(0, Math.min(1, inten))));
        }

        const styleColor = (app && window.ScenarioTroopAppearance)
            ? (window.ScenarioTroopAppearance.resolveStyleColor(app) || _teamColor)
            : _teamColor;
        const pose  = (app && app.poseType) || (troop.role || "shortsword");
        const scale = (app && app.sizeScale) || 1.0;
        const wm    = (app && app.walkSpeedMul) || 1.0;
        const adjFr = _animFrame * wm;

        const fakeStats = {
            role: pose, isRanged: !!troop.isRanged,
            ammo: troop.ammo || 5, fireRate: maxCd,
            armor: troop.armor || 15, health: troop.health || 100,
            _customAppearance: null   // prevent wrapper recursion in preview
        };
        const fakeUnit = {
            stats: fakeStats, side: "player", unitType: troop.name || "Preview",
            x: 0, y: 0, facingDir: 1, color: _teamColor,
            cooldown: useCd, ammo: 5, hp: 100
        };

        try {
            ctx.save();
            if (scale !== 1.0) {
                ctx.translate(anchorX, anchorY);
                ctx.scale(scale, scale);
                ctx.translate(-anchorX, -anchorY);
            }
            if (isCav) {
                drawFn(ctx, anchorX, anchorY, moving, adjFr,
                    styleColor, isAttacking, pose, "player",
                    troop.name || "Preview", false, useCd, 5, fakeUnit, 0);
            } else {
                drawFn(ctx, anchorX, anchorY, moving, adjFr,
                    styleColor, pose, isAttacking, "player",
                    troop.name || "Preview", false, useCd, 5, fakeUnit, 0);
            }
            ctx.restore();
        } catch (e) {
            ctx.restore();
            ctx.fillStyle = "#e74c3c"; ctx.font = "10px Tahoma,sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("Draw error: " + e.message, anchorX, anchorY - 60);
        }
        _animFrame++;
    }

    _animIv = setInterval(_drawAnimFrame, 1000 / 30);

    function _closeAnimTest() {
        if (_animIv) { clearInterval(_animIv); _animIv = null; }
        const el = document.getElementById("ste-anim-test-overlay");
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    // Store close fn so overlay click can reach it
    overlay._closeAnimTest = _closeAnimTest;
    overlay.onclick = (e) => { if (e.target === overlay) _closeAnimTest(); };
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ TOOLBAR ACTIONS                                                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function _newBlank() {
    const s = _scenario();
    if (!s) return;
    _ensureCustomFields(s);
    const t = _blankTroop(s);
    s.customTroops.push(t);
    state.selectedId = t.id;
    _renderList();
    _renderEditor(false, t);
}

function _duplicateSelected() {
    const s = _scenario();
    if (!s) return;
    if (!state.selectedId) {
        alert("Select a troop in the left list first.");
        return;
    }
    if (state.selectedId.startsWith("v:")) {
        // It's a vanilla — clone its stats into a new custom
        const vName = state.selectedId.slice(2);
        const fresh = _vanillaToTroopSchema(s, vName);
        s.customTroops.push(fresh);
        state.selectedId = fresh.id;
        _renderList();
        _renderEditor(false, fresh);
        return;
    }
    // Otherwise duplicate the existing custom
    const src = s.customTroops.find(t => t.id === state.selectedId);
    if (!src) return;
    const fresh = JSON.parse(JSON.stringify(src));
    fresh.id   = _newId(s, src.name + "_copy");
    fresh.name = src.name + " (Copy)";
    s.customTroops.push(fresh);
    state.selectedId = fresh.id;
    _renderList();
    _renderEditor(false, fresh);
}

function _deleteSelected() {
    const s = _scenario();
    if (!s) return;
    if (!state.selectedId || state.selectedId.startsWith("v:")) {
        alert("Vanilla troops cannot be deleted.\n\n" +
              "Select a CUSTOM troop (purple tag) to delete it.");
        return;
    }
    const idx = s.customTroops.findIndex(t => t.id === state.selectedId);
    if (idx < 0) return;
    const tName = s.customTroops[idx].name;
    if (!confirm(`Delete custom troop "${tName}"?\nThis cannot be undone.`)) return;
    s.customTroops.splice(idx, 1);
    state.selectedId = null;
    _renderList();
    const ed = document.getElementById("ste-editor");
    if (ed) {
        ed.classList.add("empty");
        ed.innerHTML = "Select a troop on the left, or click 🆕 New Blank to begin.";
    }
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ IMPORT / EXPORT — standalone troop pack JSON files                       ║
// ║                                                                          ║
// ║ Pack format:                                                             ║
// ║   {                                                                      ║
// ║     "format":  "dog_troop_pack",                                         ║
// ║     "version": 1,                                                        ║
// ║     "name":    "My Custom Pack",                                         ║
// ║     "author":  "...",                                                    ║
// ║     "exported":"2024-...",                                               ║
// ║     "troops":  [ { …troop schema… }, … ],                                ║
// ║     "hierarchy":{ "Spearman": ["My Custom Halberdier"] }                 ║
// ║   }                                                                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _exportPack() {
    const s = _scenario();
    if (!s) return;
    _ensureCustomFields(s);
    if (!s.customTroops.length) {
        alert("Nothing to export — there are no custom troops in this scenario yet.");
        return;
    }

    // Collect faction→uniqueTroop assignments that reference our custom troops
    const customNames = new Set(s.customTroops.map(t => t.name));
    const factionAssignments = {};
    if (s.factions && typeof s.factions === "object") {
        Object.entries(s.factions).forEach(([fName, fData]) => {
            if (fData && fData.uniqueTroop && customNames.has(fData.uniqueTroop)) {
                factionAssignments[fName] = fData.uniqueTroop;
            }
        });
    }

    const pack = {
        format:   "dog_troop_pack",
        version:  2,                // bumped: now includes appearance + factionAssignments
        name:     (s.meta && s.meta.name ? s.meta.name : "Untitled") + " — Troop Pack",
        author:   (s.meta && s.meta.author) || "Unknown",
        exported: new Date().toISOString(),
        troops:    JSON.parse(JSON.stringify(s.customTroops)),  // includes .appearance
        hierarchy: JSON.parse(JSON.stringify(s.customHierarchy || {})),
        factionAssignments  // which faction has which troop as its unique
    };
    const json = JSON.stringify(pack, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = (pack.name.replace(/[^a-z0-9_-]/gi, "_") || "troop_pack")
                 + ".dog_troopack.json";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    alert(`Exported ${pack.troops.length} custom troop(s) to your Downloads folder.\n` +
          `Appearance data and faction assignments are included.`);
}

function _importPack() {
    const s = _scenario();
    if (!s) return;
    _ensureCustomFields(s);

    const inp = document.createElement("input");
    inp.type   = "file";
    inp.accept = ".json,application/json";
    inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
            let pack;
            try { pack = JSON.parse(r.result); }
            catch (e) { alert("That file is not valid JSON:\n" + e.message); return; }

            if (pack.format !== "dog_troop_pack") {
                if (!confirm("This file does not have the 'dog_troop_pack' marker. " +
                             "Import anyway? (Most likely it will fail or import nothing.)")) {
                    return;
                }
            }
            const incoming = Array.isArray(pack.troops) ? pack.troops : [];
            if (!incoming.length) {
                alert("This pack contains zero troops — nothing to import.");
                return;
            }

            // Merge strategy: ask the user.
            const choice = confirm(
                `Import ${incoming.length} troop(s)?\n\n` +
                `OK = MERGE  (add the imported troops to your existing list — ` +
                `duplicate names get renamed)\n` +
                `Cancel = REPLACE  (wipe your existing custom troops first)`
            );
            if (!choice) {
                if (!confirm(`This will DELETE all ${s.customTroops.length} ` +
                             `existing custom troop(s) before importing. ` +
                             `Are you sure?`)) return;
                s.customTroops    = [];
                s.customHierarchy = {};
            }

            const existingNames = new Set(s.customTroops.map(t => t.name));
            const existingIds   = new Set(s.customTroops.map(t => t.id));
            let added = 0;
            incoming.forEach(raw => {
                const t = _normalizeTroopSchema(raw);
                // Re-id if collision
                while (existingIds.has(t.id)) {
                    t.id = _newId(s, t.name);
                    existingIds.add(t.id);
                }
                // Rename if duplicate
                if (existingNames.has(t.name)) {
                    let n = 2;
                    while (existingNames.has(t.name + " (" + n + ")")) n++;
                    t.name = t.name + " (" + n + ")";
                }
                existingIds.add(t.id);
                existingNames.add(t.name);
                s.customTroops.push(t);
                added++;
            });
            // Merge hierarchy too
            if (pack.hierarchy && typeof pack.hierarchy === "object") {
                for (const parent of Object.keys(pack.hierarchy)) {
                    const arr = Array.isArray(pack.hierarchy[parent]) ? pack.hierarchy[parent] : [];
                    s.customHierarchy[parent] = (s.customHierarchy[parent] || []).concat(arr)
                        .filter((v, i, a) => a.indexOf(v) === i);
                }
            }

            // Restore faction → uniqueTroop assignments (v2 packs only)
            let factionsRestored = 0;
            if (pack.factionAssignments && typeof pack.factionAssignments === "object" &&
                s.factions && typeof s.factions === "object") {
                const availTroopNames = new Set(s.customTroops.map(t => t.name));
                Object.entries(pack.factionAssignments).forEach(([fName, troopName]) => {
                    // Only apply if this troop was actually imported and the faction exists
                    if (!availTroopNames.has(troopName)) return;
                    if (!s.factions[fName]) return;
                    const cur = s.factions[fName].uniqueTroop;
                    if (cur && cur !== troopName) return;  // don't clobber existing different assignment
                    s.factions[fName].uniqueTroop = troopName;
                    if (window.FACTIONS && window.FACTIONS[fName]) {
                        window.FACTIONS[fName].uniqueTroop = troopName;
                    }
                    factionsRestored++;
                });
            }

            const facMsg = factionsRestored > 0
                ? `\n${factionsRestored} faction unique-troop assignment(s) also restored.`
                : "";
            alert(`Imported ${added} troop(s) successfully.${facMsg}\nAppearance data (styles, poses, attack curves) is included.`);
            _renderList();
        };
        r.readAsText(f);
    };
    inp.click();
}

// Repair any missing fields in an externally-supplied troop object so it
// matches our schema.  Forwards-compatible: unknown extra fields are kept
// untouched (so future Phase 2 appearance data survives a round-trip even
// when a Phase 1 build imports the pack).
function _normalizeTroopSchema(raw) {
    const blank = _blankTroop({ customTroops: [] });
    const out = { ...blank, ...raw };
    // Force key types
    out.id            = String(out.id || blank.id);
    out.name          = String(out.name || blank.name);
    out.role          = String(out.role || blank.role);
    out.weightClass   = String(out.weightClass || blank.weightClass);
    out.upgradeFrom   = String(out.upgradeFrom == null ? blank.upgradeFrom : out.upgradeFrom);
    out.availableTo   = Array.isArray(out.availableTo) ? out.availableTo.slice() : [];
    out.isLarge       = !!out.isLarge;
    out.isRanged      = !!out.isRanged;
    out.hasShield     = !!out.hasShield;
    out.isCommander   = !!out.isCommander;
    [
      "health","meleeAttack","meleeDefense","armor","morale","speed","range","cost",
      "chargeBonus","antiLargeDamage","bonusVsLarge","shieldBlockChance",
      "ammo","accuracy","missileBaseDamage","missileAPDamage"
    ].forEach(k => { out[k] = _num(out[k], blank[k], 0); });
    out.desc = String(out.desc || "");
    // Preserve appearance data — validate its structure if the appearance module is available,
    // otherwise keep it verbatim so it survives a round-trip even in a Phase-1-only environment.
    if (raw.appearance && typeof raw.appearance === "object") {
        if (typeof window.ScenarioTroopAppearance !== "undefined" &&
            typeof window.ScenarioTroopAppearance.normalizeAppearance === "function") {
            out.appearance = window.ScenarioTroopAppearance.normalizeAppearance(raw.appearance);
        } else {
            // Appearance module not loaded — keep the raw object verbatim so the data
            // isn't lost. Basic sanity guard: must at least have a string styleFaction.
            out.appearance = (typeof raw.appearance.styleFaction === "string") ? raw.appearance : null;
        }
    } else {
        out.appearance = null;
    }
    return out;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ RUNTIME APPLICATION                                                      ║
// ║                                                                          ║
// ║ Wraps window.ScenarioRuntime.launch so customTroops are injected into    ║
// ║ UnitRoster + troopGUI.hierarchy BEFORE the engine starts using them.     ║
// ║                                                                          ║
// ║ NOTE: Vanilla troops are NEVER deleted.  customTroops are layered on     ║
// ║ top, identified by their `name` (the same key UnitRoster.allUnits uses). ║
// ║ If a custom troop's name collides with a vanilla one, the custom wins    ║
// ║ for THIS scenario only (sandbox is unaffected because _exit reloads the  ║
// ║ page, restoring vanilla state from troop_system.js's init()).            ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function _hookRuntime() {
    if (state.runtimeHooked) return;
    if (typeof window.ScenarioRuntime === "undefined" ||
        typeof window.ScenarioRuntime.launch !== "function") return;
    const orig = window.ScenarioRuntime.launch.bind(window.ScenarioRuntime);
    window.ScenarioRuntime.launch = function (scenarioDoc) {
        try { _applyCustomsAtRuntime(scenarioDoc); }
        catch (err) { console.error("[ScenarioTroopEditor] applyCustomsAtRuntime failed:", err); }
        return orig(scenarioDoc);
    };
    state.runtimeHooked = true;
    console.log("[ScenarioTroopEditor] Hooked into ScenarioRuntime.launch.");
}

function _applyCustomsAtRuntime(scenarioDoc) {
    if (!scenarioDoc) return;
    const customs = Array.isArray(scenarioDoc.customTroops) ? scenarioDoc.customTroops : [];
    const hierOverlay = (scenarioDoc.customHierarchy && typeof scenarioDoc.customHierarchy === "object")
        ? scenarioDoc.customHierarchy : {};

    if (typeof UnitRoster === "undefined" || !UnitRoster.allUnits) {
        console.warn("[ScenarioTroopEditor] UnitRoster not available — skipping custom troop injection.");
        return;
    }
    if (typeof Troop !== "function") {
        console.warn("[ScenarioTroopEditor] Troop class not available — skipping custom troop injection.");
        return;
    }

    // 1. Register every custom troop in UnitRoster.allUnits.
    //
    //    IMPORTANT: We do NOT route through UnitRoster.create() here.
    //    create() auto-nerfs ranged units' melee stats (×0.85) and missile
    //    stats (×0.7 unless it's a cannon/fire weapon). That nerf is intended
    //    to be applied ONCE — to the raw human-authored numbers in
    //    troop_system.js's init().  Vanilla troops have already had it
    //    applied by the time the editor reads them, so re-running create()
    //    on saved customs would double-nerf them.
    //
    //    Treat the values stored in scenario.customTroops as FINAL in-game
    //    values (what you see in the editor is exactly what the unit ships
    //    with).  Build the Troop instance manually, mirroring everything
    //    else create() does (description, weight class mapping, stance,
    //    morale max).
    customs.forEach(t => {
        try {
            const wc = _resolveWeightClass(t.weightClass);
            const inst = new Troop(t.name, _resolveRoleString(t.role),
                                   !!t.isLarge, "Generic");

            // Numeric stats (final, no auto-balance)
            inst.health            = +t.health            || 100;
            inst.meleeAttack       = +t.meleeAttack       || 0;
            inst.meleeDefense      = +t.meleeDefense      || 0;
            inst.armor             = +t.armor             || 0;
            inst.morale            = +t.morale            || 50;
            inst.maxMorale         = inst.morale;
            inst.speed             = +t.speed             || 0.8;
            inst.range             = +t.range             || 20;
            inst.cost              = +t.cost              || 40;
            inst.chargeBonus       = +t.chargeBonus       || 0;
            inst.antiLargeDamage   = +t.antiLargeDamage   || 0;
            inst.bonusVsLarge      = +t.bonusVsLarge      || 0;
            inst.shieldBlockChance = +t.shieldBlockChance || 0;
            inst.hasShield         = !!t.hasShield;
            inst.isCommander       = !!t.isCommander;
            inst.isRanged          = !!t.isRanged;

            // Ranged sub-stats (still set when not ranged — they default to 0)
            inst.ammo              = +t.ammo              || 0;
            inst.accuracy          = +t.accuracy          || 0;
            inst.missileBaseDamage = +t.missileBaseDamage || 0;
            inst.missileAPDamage   = +t.missileAPDamage   || 0;

            // Description
            inst.desc = t.desc || "Custom troop.";

            // Weight class — mirrors create()'s behavior (lines 159-163)
            inst.weightTier = wc.tier;
            inst.mass       = wc.mass;
            inst.radius     = wc.radius;

            // Stance — mirrors create() line 167
            inst.currentStance = inst.isRanged ? "statusrange" : "statusmelee";

            // Source-tracking flag
            inst._customScenarioSource = true;

            // Appearance — copy onto stats so the Phase 2 draw hook can read it.
            // The hook checks unit.stats._customAppearance; setting it here
            // means it flows through every system that already holds a stats ref
            // (Object.assign in battlefield_launch.js spawn copies it through).
            // v2 schema check: needs styleFaction + poseType + useCustomDraw.
            if (t.appearance && typeof t.appearance === "object" &&
                typeof t.appearance.styleFaction === "string" &&
                typeof t.appearance.poseType === "string" &&
                t.appearance.useCustomDraw !== false) {
                inst._customAppearance = t.appearance;
            }

            // Use the troop's display NAME as the UnitRoster key — every other
            // system (player.roster entries, recruit calls, hierarchy lookups)
            // references troops by name string.
            UnitRoster.allUnits[t.name] = inst;
            console.log(`[ScenarioTroopEditor] Injected custom troop: ${t.name} (${t.role})`);
        } catch (err) {
            console.error("[ScenarioTroopEditor] Failed to inject custom troop:", t, err);
        }
    });

    // 2. Apply per-custom upgradeFrom into troopGUI.hierarchy. This must NOT
    //    clobber existing children of the parent — vanilla upgrade paths must
    //    keep working alongside the custom branches.
    if (typeof troopGUI !== "undefined" && troopGUI.hierarchy) {
        customs.forEach(t => {
            const parent = (t.upgradeFrom || "").trim();
            if (!parent) return;   // recruit-only / unique troop — no hierarchy entry
            if (!Array.isArray(troopGUI.hierarchy[parent])) {
                troopGUI.hierarchy[parent] = [];
            }
            if (troopGUI.hierarchy[parent].indexOf(t.name) === -1) {
                troopGUI.hierarchy[parent].push(t.name);
            }
            // Also ensure the new troop has a (possibly empty) own entry so
            // recursive lookups don't crash.
            if (!Array.isArray(troopGUI.hierarchy[t.name])) {
                troopGUI.hierarchy[t.name] = [];
            }
        });

        // 3. Apply the standalone hierarchy overlay (allows hand-authored
        //    "MyTroop -> [MyOtherTroop]" branches without going through a
        //    custom troop's upgradeFrom field).
        for (const parent of Object.keys(hierOverlay)) {
            const children = Array.isArray(hierOverlay[parent]) ? hierOverlay[parent] : [];
            if (!Array.isArray(troopGUI.hierarchy[parent])) {
                troopGUI.hierarchy[parent] = [];
            }
            children.forEach(c => {
                if (troopGUI.hierarchy[parent].indexOf(c) === -1) {
                    troopGUI.hierarchy[parent].push(c);
                }
            });
        }

        // 4. Refresh the hierarchy snapshot used by Story1/Sandbox toggles so
        //    enableStory1Mode() doesn't blow away our additions when toggled.
        // (We only update the *sandbox* snapshot — Story 1 has its own restricted set.)
        if (typeof troopGUI._sandboxHierarchy === "object") {
            troopGUI._sandboxHierarchy = JSON.parse(JSON.stringify(troopGUI.hierarchy));
        }
    }
    console.log(`[ScenarioTroopEditor] Applied ${customs.length} custom troop(s) to live engine.`);
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ POLLER — wait for editor to open, then inject menu button                ║
// ╚══════════════════════════════════════════════════════════════════════════╝
(function _poll() {
    setInterval(() => {
        const hasEditor = !!document.getElementById("se-menu-title");
        const hasMenu   = !!document.getElementById("ste-menu-btn-wrap");
        if (hasEditor && !hasMenu) { _injected = false; _injectMenuButton(); }
        if (!hasEditor)            { _injected = false; }
        // Try to hook the runtime as soon as it's available
        if (!state.runtimeHooked && typeof window.ScenarioRuntime !== "undefined") {
            _hookRuntime();
        }
    }, 600);
})();

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ PUBLIC API                                                               ║
// ╚══════════════════════════════════════════════════════════════════════════╝
return {
    VERSION,
    open:  openEditor,
    close: closeEditor,
    // Useful for tests / debug consoles:
    _applyCustomsAtRuntime,
    _normalizeTroopSchema,
    _blankTroop
};
})();

console.log("[ScenarioTroopEditor] Phase 1 v" + window.ScenarioTroopEditor.VERSION + " loaded.");