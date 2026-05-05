//P1 P2 P3 ALL COMBINED CUZ IM LAZY


// ============================================================================
// SCENARIO EDITOR PATCH — Phase 1  (1A · 1B · 1C)
// scenario_editor_patch_p1.js
//
// Drop-in extension for scenario_editor.js. Zero edits to existing files.
// Load AFTER scenario_editor.js, scenario_tools_panel.js, scenario_triggers.js.
//
//   <script src="story/scenario_editor_patch_p1.js"></script>
//
// What this adds to the 🛠 Tools menu:
//   1A · 🗨  Parler Lines  — per-role NPC dialogue overrides
//   1B · 📜  Quest Manager — CRUD editor for scenario.storyQuests[]
//   1C · 🚫  Spawn Bans    — startingNpcBans + proceduralAITendency rates
//
// Public API:
//   window.ScenarioEditorPatch.openParlerEditor()
//   window.ScenarioEditorPatch.openQuestManager()
//   window.ScenarioEditorPatch.openSpawnBans()
//   window.ScenarioEditorPatch.VERSION
// ============================================================================

window.ScenarioEditorPatch = (function () {
"use strict";

const VERSION = "1.0.0";

// ── Design tokens (match scenario_editor.js palette) ────────────────────────
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
    hoverDark: "#1a3a5a"
};

let _topZ = 10200;

// ── Scenario accessor ────────────────────────────────────────────────────────
function _s() {
    return window.ScenarioEditor && window.ScenarioEditor._state
        ? window.ScenarioEditor._state.scenario
        : (window.__activeScenario || null);
}

// ── Shared CSS ───────────────────────────────────────────────────────────────
function _ensureCSS() {
    if (document.getElementById("sep-p1-css")) return;
    const st = document.createElement("style");
    st.id = "sep-p1-css";
    st.textContent = `
        .sep-btn{background:#1e3a5a;border:1px solid #3a5a7a;color:#cfd8dc;
            padding:4px 10px;cursor:pointer;border-radius:3px;
            font:11px Tahoma,Verdana,sans-serif;margin:2px;transition:background .12s;}
        .sep-btn:hover{background:#2a5a8c;color:#fff;}
        .sep-btn.pri{background:#1565c0;border-color:#4aafd8;color:#fff;}
        .sep-btn.pri:hover{background:#1976d2;}
        .sep-btn.dan{background:#5c1a1a;border-color:#c0392b;color:#ff8a80;}
        .sep-btn.dan:hover{background:#7c2a2a;}
        .sep-inp{background:#0d1520;border:1px solid #3a5a7a;color:#cfd8dc;
            padding:4px 8px;border-radius:3px;font:12px Tahoma,Verdana,sans-serif;
            box-sizing:border-box;}
        .sep-inp:focus{outline:none;border-color:#4aafd8;}
        .sep-tab{background:none;border:none;border-bottom:2px solid transparent;
            color:#7a9ab8;padding:6px 12px;cursor:pointer;
            font:11px Tahoma,Verdana,sans-serif;white-space:nowrap;}
        .sep-tab:hover{color:#cfd8dc;}
        .sep-tab.on{color:#f5d76e;border-bottom-color:#f5d76e;}
        .sep-sec{border:1px solid #2a3f5a;border-radius:3px;padding:8px 10px;margin-bottom:10px;}
        .sep-sec-title{color:#7a9ab8;font-size:10px;text-transform:uppercase;
            letter-spacing:1px;font-weight:bold;margin-bottom:6px;}
        .sep-note{font-size:10px;color:#4a6a7a;margin-top:6px;line-height:1.5;}
        .sep-lbl{display:block;font-size:10px;color:#7a9ab8;text-transform:uppercase;
            letter-spacing:0.5px;margin-bottom:3px;}
    `;
    document.head.appendChild(st);
}

// ── Panel factory ────────────────────────────────────────────────────────────
function _panel(id, title, w, h) {
    const old = document.getElementById(id);
    if (old) old.remove();

    const p = document.createElement("div");
    p.id = id;
    Object.assign(p.style, {
        position:"fixed", top:"70px", left:"160px",
        width:w+"px", height:h+"px",
        background:T.bg, border:"1px solid "+T.border, borderRadius:"4px",
        zIndex: ++_topZ, fontFamily:"Tahoma,Verdana,sans-serif", fontSize:"12px",
        color:T.text, display:"flex", flexDirection:"column",
        boxShadow:"0 10px 30px rgba(0,0,0,.75)", overflow:"hidden",
        minWidth:"320px", minHeight:"200px"
    });
    p.addEventListener("mousedown", () => { p.style.zIndex = ++_topZ; });

    // Title bar
    const bar = document.createElement("div");
    Object.assign(bar.style, {
        background:T.bar, borderBottom:"1px solid "+T.border,
        padding:"0 8px", height:"28px",
        display:"flex", alignItems:"center", flexShrink:"0",
        cursor:"move", userSelect:"none"
    });
    const titleEl = document.createElement("span");
    Object.assign(titleEl.style, {
        flex:"1", fontWeight:"bold", color:T.accent, fontSize:"12px"
    });
    titleEl.textContent = title;
    bar.appendChild(titleEl);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    Object.assign(closeBtn.style, {
        background:"none", border:"none", color:T.text,
        cursor:"pointer", padding:"0 4px", fontSize:"14px", lineHeight:"1"
    });
    closeBtn.onclick = () => p.remove();
    bar.appendChild(closeBtn);
    p.appendChild(bar);

    // Body
    const body = document.createElement("div");
    Object.assign(body.style, { flex:"1", overflow:"auto", padding:"10px" });
    p.appendChild(body);

    // Resize grip
    const grip = document.createElement("div");
    Object.assign(grip.style, {
        position:"absolute", right:"0", bottom:"0", width:"14px",
        height:"14px", cursor:"se-resize"
    });
    grip.innerHTML = `<svg width="14" height="14"><path d="M14 14L0 14L14 0Z" fill="#3a5a7a" opacity=".5"/></svg>`;
    p.appendChild(grip);

    // Drag
    let dx=0,dy=0,dl=0,dt=0,dragging=false;
    bar.addEventListener("mousedown", e => {
        if (e.target === closeBtn) return;
        dragging=true; dx=e.clientX; dy=e.clientY;
        dl=p.offsetLeft; dt=p.offsetTop; e.preventDefault();
    });
    document.addEventListener("mousemove", e => {
        if (dragging) { p.style.left=(dl+e.clientX-dx)+"px"; p.style.top=(dt+e.clientY-dy)+"px"; }
    });
    document.addEventListener("mouseup", () => { dragging=false; });

    // Resize
    let rx=0,ry=0,rw=0,rh=0,resizing=false;
    grip.addEventListener("mousedown", e => {
        resizing=true; rx=e.clientX; ry=e.clientY;
        rw=p.offsetWidth; rh=p.offsetHeight; e.preventDefault(); e.stopPropagation();
    });
    document.addEventListener("mousemove", e => {
        if (resizing) {
            p.style.width  = Math.max(320, rw+e.clientX-rx)+"px";
            p.style.height = Math.max(200, rh+e.clientY-ry)+"px";
        }
    });
    document.addEventListener("mouseup", () => { resizing=false; });

    document.body.appendChild(p);
    return { panel:p, body };
}

// ── Small helpers ────────────────────────────────────────────────────────────
function _btn(txt, cls, fn) {
    const b = document.createElement("button");
    b.className = "sep-btn" + (cls ? " "+cls : "");
    b.textContent = txt;
    if (fn) b.onclick = fn;
    return b;
}
function _inp(val, placeholder, width) {
    const i = document.createElement("input");
    i.className = "sep-inp";
    i.value = val !== undefined ? val : "";
    if (placeholder) i.placeholder = placeholder;
    if (width) i.style.width = width;
    return i;
}
function _ta(val, h, placeholder) {
    const t = document.createElement("textarea");
    t.className = "sep-inp";
    t.value = val || "";
    t.style.height = (h||80)+"px";
    t.style.width = "100%";
    t.style.resize = "vertical";
    t.style.display = "block";
    if (placeholder) t.placeholder = placeholder;
    return t;
}
function _row(items, gap) {
    const d = document.createElement("div");
    d.style.cssText = `display:flex;align-items:center;gap:${gap||6}px;flex-wrap:wrap;`;
    items.forEach(i => i && d.appendChild(i));
    return d;
}
function _lbl(text) {
    const l = document.createElement("label");
    l.className = "sep-lbl";
    l.textContent = text;
    return l;
}
function _sep() {
    const d = document.createElement("div");
    d.style.cssText = `border-top:1px solid ${T.border2};margin:8px 0;`;
    return d;
}

// ============================================================================
// ██████████████████████████████ 1A — PARLER LINES ███████████████████████████
// ============================================================================

const ROLES = ["Civilian","Patrol","Military","Trader","Bandit","Special"];
const ROLE_COLOR = {
    Civilian:"#aaa", Patrol:"#4aafd8", Military:"#e74c3c",
    Trader:"#f5d76e", Bandit:"#ff8a80", Special:"#ce93d8"
};

const SAMPLES = {
    Civilian: [
        "The harvest was poor this year. We pray for peace.",
        "Have you heard the news from the capital?",
        "My children sleep better now that [faction] soldiers patrol the road.",
        "These roads were safer before the troubles began.",
        "A merchant from the south passed through yesterday with strange goods.",
        "I heard screaming from the east hills last night. The soldiers said nothing of it.",
        "Our village owes much to the [faction] garrison. They kept the bandits at bay.",
        "The fields will need tending soon, war or no war."
    ],
    Patrol: [
        "Halt. State your business on this road.",
        "Move along. These are troubled times.",
        "We have reports of bandits to the east. Stay on the main road.",
        "I answer to [faction] and to none other.",
        "With [troops] men you look like trouble. Keep walking.",
        "The roads are watched. Do not mistake our patience for weakness.",
        "Pass. But know that [faction] eyes are everywhere.",
        "We march at dawn. If you value your life, find shelter before then."
    ],
    Military: [
        "Stand aside. [faction] forces move with urgency.",
        "I have orders. I have no time for conversation.",
        "Those [troops] men behind you — are they well trained?",
        "We march at dawn. If you value your life, find shelter.",
        "War changes a man. It changes everything.",
        "The generals speak of victory. The soldiers speak of the dead.",
        "Keep your blade sheathed and your feet on this road.",
        "[playerFaction] approaches. What message do you carry?"
    ],
    Trader: [
        "Excellent timing! I have goods fresh from the southern provinces.",
        "The roads are dangerous but profit waits for no one.",
        "I have [troops] guards — enough for most bandits.",
        "The market at the capital is three days east. The goods are worth the risk.",
        "You look like you could use provisions. I have food, at a fair price.",
        "Silk from Hangzhou, spices from Malacca — if you have gold, I have wares.",
        "I have traded under [faction] banners before. Good people, as long as you pay taxes.",
        "A [playerFaction] convoy? Good. Bandits are less bold around soldiers."
    ],
    Bandit: [
        "Your gold or your life. Choose quickly.",
        "I used to be a farmer. Then [faction] took my land.",
        "There are more of us in those trees. Reconsider.",
        "Put your weapon down slowly. We do not have to make this ugly.",
        "The road belongs to whoever is stronger. That is us today.",
        "I do not enjoy this. But a man must eat.",
        "You [playerFaction] people always look so surprised.",
        "We take from those who have too much. Today, that is you."
    ],
    Special: [
        "I have been waiting for someone like you.",
        "The stars showed me this meeting. Do not waste it.",
        "What you seek is not what you think you need.",
        "I know who you are. I have known for some time.",
        "These roads remember every foot that has walked them.",
        "Speak carefully. Words carry weight in these lands.",
        "You travel with purpose. I respect that.",
        "Not many come this far. Fewer still leave unchanged."
    ]
};

// Patch RandomDialogue.generateHello so scenario.parlerLines takes priority
function _hookRandomDialogue() {
    if (window._sepParlerHooked) return;

    function _tryPatch() {
        if (typeof window.RandomDialogue === "undefined" ||
            typeof window.RandomDialogue.generateHello !== "function") {
            setTimeout(_tryPatch, 600);
            return;
        }
        const _orig = window.RandomDialogue.generateHello.bind(window.RandomDialogue);
        window.RandomDialogue.generateHello = function(opts, npc) {
            const scenario = _s();
            if (scenario && scenario.parlerLines) {
                const role = opts.npcType || (npc && npc.role) || "";
                const bucket = scenario.parlerLines[role] || [];
                if (bucket.length > 0) {
                    let line = bucket[Math.floor(Math.random() * bucket.length)];
                    line = line
                        .replace(/\[faction\]/g,       opts.faction       || "")
                        .replace(/\[playerFaction\]/g, opts.playerFaction || "")
                        .replace(/\[troops\]/g,        opts.npcNumbers    || "");
                    return line;
                }
            }
            return _orig(opts, npc);
        };
        window._sepParlerHooked = true;
        console.log("[SEP] RandomDialogue.generateHello hooked — parlerLines active.");
    }
    _tryPatch();
}

function openParlerEditor() {
    _ensureCSS();
    const s = _s();
    if (!s) { alert("No active scenario. Open a scenario first."); return; }
    if (!s.parlerLines || typeof s.parlerLines !== "object") s.parlerLines = {};
    ROLES.forEach(r => { if (!Array.isArray(s.parlerLines[r])) s.parlerLines[r] = []; });

    const { body } = _panel("sep-parler", "🗨 Parler Lines Editor", 550, 490);

    let activeRole = ROLES[0];

    function render() {
        body.innerHTML = "";

        // Info bar
        const info = document.createElement("div");
        info.style.cssText = `color:${T.dim};font-size:11px;margin-bottom:8px;line-height:1.6;`;
        info.innerHTML =
            `Override <code style="color:${T.blue}">RandomDialogue.generateHello</code> per NPC role. ` +
            `When a bucket has lines, a random one is returned instead of the default.<br>` +
            `Tokens: <code style="color:${T.accent}">[faction]</code> ` +
            `<code style="color:${T.accent}">[playerFaction]</code> ` +
            `<code style="color:${T.accent}">[troops]</code>`;
        body.appendChild(info);

        // Tabs
        const tabs = document.createElement("div");
        tabs.style.cssText = `display:flex;border-bottom:1px solid ${T.border2};margin-bottom:10px;flex-wrap:wrap;`;
        ROLES.forEach(role => {
            const t = document.createElement("button");
            t.className = "sep-tab" + (role === activeRole ? " on" : "");
            const n = s.parlerLines[role].length;
            const nc = n > 0 ? T.green : "#555";
            t.innerHTML = `${role}&thinsp;<span style="color:${nc};font-size:10px">${n||"—"}</span>`;
            t.onclick = () => { activeRole = role; render(); };
            tabs.appendChild(t);
        });
        body.appendChild(tabs);

        const lines = s.parlerLines[activeRole];
        const isActive = lines.length > 0;

        // Status
        const status = document.createElement("div");
        status.style.cssText = `font-size:11px;margin-bottom:6px;padding:5px 8px;border-radius:3px;` +
            `background:${isActive ? "#0d2010" : "#111"};border:1px solid ${isActive ? "#2a5a2a" : T.border2};`;
        status.innerHTML = isActive
            ? `<span style="color:${T.green}">●</span> &nbsp;<strong style="color:${T.green}">${lines.length} line${lines.length!==1?"s":""}</strong> defined — <span style="color:${T.green}">OVERRIDES</span> RandomDialogue for ${activeRole}`
            : `<span style="color:#555">●</span> &nbsp;No lines — falls through to default RandomDialogue`;
        body.appendChild(status);

        // Textarea
        const ta = _ta(lines.join("\n"), 200,
            `Enter one dialogue line per line...\nExample: The road is clear today.\nExample: [faction] soldiers hold this pass.`);
        body.appendChild(ta);

        // Buttons
        body.appendChild(document.createElement("br"));
        const btnRow = _row([
            _btn("💾 Save", "pri", () => {
                const raw = ta.value.split("\n").map(l => l.trim()).filter(Boolean);
                s.parlerLines[activeRole] = raw;
                _hookRandomDialogue();
                render();
            }),
            _btn("📋 Add Samples", null, () => {
                const existing = ta.value.trim();
                const samples = SAMPLES[activeRole].join("\n");
                ta.value = existing ? existing + "\n" + samples : samples;
            }),
            _btn("🗑 Clear", "dan", () => {
                if (!confirm(`Clear all ${activeRole} lines?`)) return;
                ta.value = "";
                s.parlerLines[activeRole] = [];
                render();
            })
        ]);
        body.appendChild(btnRow);

        body.appendChild(_sep());

        // Export preview
        const exportBtn = _btn("📋 Copy all roles as JSON", null, () => {
            try {
                navigator.clipboard.writeText(JSON.stringify(s.parlerLines, null, 2));
                exportBtn.textContent = "✓ Copied!";
                setTimeout(() => { exportBtn.textContent = "📋 Copy all roles as JSON"; }, 1800);
            } catch(e) { alert(JSON.stringify(s.parlerLines, null, 2)); }
        });
        body.appendChild(exportBtn);

        const note = document.createElement("div");
        note.className = "sep-note";
        note.textContent = "💡 The RandomDialogue hook installs itself as soon as RandomDialogue is available. " +
            "Changes are live immediately — no reload needed.";
        body.appendChild(note);
    }

    render();
    _hookRandomDialogue();
}

// ============================================================================
// ████████████████████████████ 1B — QUEST MANAGER ████████████████████████████
// ============================================================================

function _blankQuest() {
    return {
        id: "sq_" + Date.now(),
        title: "New Quest",
        description: "",
        x: 2000, y: 1500, radius: 320,
        triggerOnArrive: "",
        varOnArrive: "",
        isMain: false,
        autoActivate: false,
        noAutoComplete: false,
        dependsOn: ""
    };
}

function openQuestManager() {
    _ensureCSS();
    const s = _s();
    if (!s) { alert("No active scenario. Open a scenario first."); return; }
    if (!Array.isArray(s.storyQuests)) s.storyQuests = [];

    const { panel, body } = _panel("sep-quests", "📜 Quest Manager", 680, 520);
    body.style.cssText = "flex:1;overflow:hidden;padding:0;display:flex;";

    let sel = -1;

    function render() {
        body.innerHTML = "";
        body.style.flexDirection = "row";

        // ── LEFT LIST ────────────────────────────────────────────────────────
        const left = document.createElement("div");
        Object.assign(left.style, {
            width:"200px", flexShrink:"0",
            borderRight:"1px solid "+T.border2,
            display:"flex", flexDirection:"column", overflow:"hidden"
        });

        const listHdr = document.createElement("div");
        listHdr.style.cssText = `background:${T.bar};padding:7px 10px;border-bottom:1px solid ${T.border2};font-size:10px;color:${T.dim};text-transform:uppercase;letter-spacing:1px;`;
        listHdr.textContent = `Quests (${s.storyQuests.length})`;
        left.appendChild(listHdr);

        const listBody = document.createElement("div");
        listBody.style.cssText = "flex:1;overflow-y:auto;";

        if (!s.storyQuests.length) {
            const empty = document.createElement("div");
            empty.style.cssText = `padding:18px 12px;color:#555;font-size:11px;text-align:center;line-height:1.7;`;
            empty.innerHTML = `<div style="font-size:22px;margin-bottom:6px">📜</div>No quests yet.<br>Click <strong>+ New</strong> below.`;
            listBody.appendChild(empty);
        }

        s.storyQuests.forEach((q, i) => {
            const item = document.createElement("div");
            const active = i === sel;
            item.style.cssText = `
                padding:7px 10px;cursor:pointer;border-bottom:1px solid ${T.bar};
                background:${active ? T.hover : "none"};
                color:${active ? "#fff" : T.text};
            `;
            item.innerHTML = `
                <div style="font-weight:bold;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    ${q.isMain?"⭐ ":""}${q.title||q.id}
                </div>
                <div style="color:#555;font-size:10px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${q.id}</div>
            `;
            item.onmouseenter = () => { if (i!==sel) item.style.background = T.hoverDark; };
            item.onmouseleave = () => { if (i!==sel) item.style.background = "none"; };
            item.onclick = () => { sel = i; render(); };
            listBody.appendChild(item);
        });
        left.appendChild(listBody);

        const listFoot = document.createElement("div");
        listFoot.style.cssText = `padding:6px;border-top:1px solid ${T.border2};display:flex;gap:4px;`;
        listFoot.appendChild(_btn("+ New", "pri", () => {
            s.storyQuests.push(_blankQuest());
            sel = s.storyQuests.length - 1;
            render();
        }));
        const delBtn = _btn("🗑", "dan", () => {
            if (sel < 0) return;
            if (!confirm("Delete quest '" + s.storyQuests[sel].title + "'?")) return;
            s.storyQuests.splice(sel, 1);
            sel = Math.min(sel, s.storyQuests.length - 1);
            render();
        });
        delBtn.title = "Delete selected quest";
        listFoot.appendChild(delBtn);
        left.appendChild(listFoot);
        body.appendChild(left);

        // ── RIGHT EDITOR ─────────────────────────────────────────────────────
        const right = document.createElement("div");
        Object.assign(right.style, { flex:"1", overflow:"auto", padding:"12px" });

        if (sel < 0 || sel >= s.storyQuests.length) {
            const ph = document.createElement("div");
            ph.style.cssText = `color:#555;text-align:center;margin-top:60px;font-size:13px;line-height:1.8;`;
            ph.innerHTML = `<div style="font-size:32px;margin-bottom:8px">📜</div>Select a quest to edit<br>or click <strong>+ New</strong> to create one.`;
            right.appendChild(ph);
            body.appendChild(right);
            return;
        }

        const q = s.storyQuests[sel];

        // Helper: labeled field row
        function _field(label, key, type, opts) {
            opts = opts || {};
            const wrap = document.createElement("div");
            wrap.style.marginBottom = "8px";
            wrap.appendChild(_lbl(label));

            if (type === "bool") {
                const lbl = document.createElement("label");
                lbl.style.cssText = "display:flex;align-items:center;gap:7px;cursor:pointer;font-size:12px;";
                const cb = document.createElement("input");
                cb.type = "checkbox"; cb.checked = !!q[key];
                cb.onchange = () => { q[key] = cb.checked; _refreshPreview(); };
                lbl.appendChild(cb);
                lbl.appendChild(document.createTextNode(opts.desc || ""));
                wrap.appendChild(lbl);
            } else if (type === "longtext") {
                const ta = _ta(q[key]||"", opts.h||55, opts.ph||"");
                ta.onchange = () => { q[key] = ta.value; _refreshPreview(); };
                ta.oninput  = () => { q[key] = ta.value; _refreshPreview(); };
                wrap.appendChild(ta);
            } else if (type === "number") {
                const i = _inp(q[key]!==undefined?q[key]:"", opts.ph||"", "100%");
                i.type = "number";
                i.onchange = () => { q[key] = parseFloat(i.value)||0; _refreshPreview(); };
                wrap.appendChild(i);
            } else {
                const i = _inp(q[key]||"", opts.ph||"", "100%");
                i.oninput  = () => { q[key] = i.value; _refreshPreview(); };
                i.onchange = () => { q[key] = i.value; _refreshPreview(); };
                wrap.appendChild(i);
            }
            return wrap;
        }

        right.appendChild(_field("Quest ID", "id", "text", {ph:"sq_my_quest"}));
        right.appendChild(_field("Title (quest banner header)", "title", "text", {ph:"Reach the fortress"}));
        right.appendChild(_field("Description (banner subtext)", "description", "longtext", {h:50, ph:"March north to Mizuki fortress."}));

        // Coords grid
        const cGrid = document.createElement("div");
        cGrid.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;";
        ["World X","World Y","Arrive Radius"].forEach((lbl, idx) => {
            const key = ["x","y","radius"][idx];
            const wrap = document.createElement("div");
            const l = document.createElement("label"); l.className = "sep-lbl"; l.textContent = lbl;
            const i = document.createElement("input"); i.type="number"; i.className="sep-inp";
            i.style.width="100%"; i.value = q[key]!==undefined ? q[key] : 0;
            i.onchange = () => { q[key] = parseFloat(i.value)||0; _refreshPreview(); };
            wrap.appendChild(l); wrap.appendChild(i);
            cGrid.appendChild(wrap);
        });
        right.appendChild(cGrid);

        right.appendChild(_field("Fire trigger on arrive (ID)", "triggerOnArrive", "text", {ph:"my_trigger_id"}));
        right.appendChild(_field("Set var on arrive (name=value)", "varOnArrive", "text", {ph:"phase=fort"}));
        right.appendChild(_field("Depends on quest ID", "dependsOn", "text", {ph:"sq_previous_quest"}));

        // Flags
        const flagRow = document.createElement("div");
        flagRow.style.cssText = "display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px;";
        [
            ["isMain",         "⭐ Main Quest (highlighted in UI)"],
            ["autoActivate",   "⚡ Auto-Activate on load"],
            ["noAutoComplete", "🔒 No Auto-Complete on arrival"]
        ].forEach(([key, label]) => {
            const lbl = document.createElement("label");
            lbl.style.cssText = "display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;";
            const cb = document.createElement("input");
            cb.type="checkbox"; cb.checked=!!q[key];
            cb.onchange = () => { q[key]=cb.checked; _refreshPreview(); };
            lbl.appendChild(cb);
            lbl.appendChild(document.createTextNode(label));
            flagRow.appendChild(lbl);
        });
        right.appendChild(flagRow);

        // Live preview card
        const preview = document.createElement("div");
        preview.id = "sep-quest-preview";
        Object.assign(preview.style, {
            background:T.bar, border:"1px solid "+T.border2, borderRadius:"4px",
            padding:"8px 12px", marginBottom:"10px"
        });
        right.appendChild(preview);
        function _refreshPreview() {
            preview.innerHTML = `
                <div style="font-size:10px;color:${T.dim};margin-bottom:4px;">PREVIEW</div>
                <div style="font-weight:bold;color:${T.accent};">${q.isMain?"⭐ ":""}${q.title||"—"}</div>
                <div style="color:#aaa;font-size:11px;margin-top:2px;">${q.description||"(no description)"}</div>
                <div style="color:#555;font-size:10px;margin-top:5px;">
                    📍 (${q.x||0}, ${q.y||0}) · radius&nbsp;${q.radius||0}px &nbsp;|&nbsp; id: <code>${q.id}</code>
                    ${q.dependsOn ? `<br>↳ depends on: <code>${q.dependsOn}</code>` : ""}
                    ${q.triggerOnArrive ? `<br>→ fires trigger: <code>${q.triggerOnArrive}</code>` : ""}
                    ${q.varOnArrive    ? `<br>→ sets var: <code>${q.varOnArrive}</code>`          : ""}
                </div>`;
        }
        _refreshPreview();

        // Action buttons
        const actRow = _row([
            _btn("⎘ Duplicate", null, () => {
                const copy = JSON.parse(JSON.stringify(q));
                copy.id = q.id + "_copy";
                copy.title = q.title + " (Copy)";
                s.storyQuests.push(copy);
                sel = s.storyQuests.length - 1;
                render();
            }),
            _btn("↑ Move Up", null, () => {
                if (sel < 1) return;
                [s.storyQuests[sel], s.storyQuests[sel-1]] = [s.storyQuests[sel-1], s.storyQuests[sel]];
                sel--; render();
            }),
            _btn("↓ Move Down", null, () => {
                if (sel >= s.storyQuests.length-1) return;
                [s.storyQuests[sel], s.storyQuests[sel+1]] = [s.storyQuests[sel+1], s.storyQuests[sel]];
                sel++; render();
            })
        ]);
        right.appendChild(actRow);

        const note = document.createElement("div");
        note.className = "sep-note";
        note.textContent = "💡 storyQuests[] are pre-defined quest catalog entries. Use story_quest_set {id} in a trigger " +
            "to activate one at runtime, or set autoActivate:true to show it immediately on scenario boot.";
        right.appendChild(note);

        body.appendChild(right);
    }

    render();
}

// ============================================================================
// ████████████████████████ 1C — SPAWN BANS & AI RATES ████████████████████████
// ============================================================================

const PROC_ROLES = ["Civilian","Patrol","Military","Commerce","Bandit"];
const ROLE_COLORS_BAN = {
    Civilian:"#aaa", Patrol:"#4aafd8", Military:"#e74c3c",
    Commerce:"#f5d76e", Bandit:"#ff8a80"
};
const FALLBACK_COLORS = ["#e74c3c","#3498db","#27ae60","#f39c12","#9b59b6","#1abc9c","#e67e22","#2ecc71"];

function openSpawnBans() {
    _ensureCSS();
    const s = _s();
    if (!s) { alert("No active scenario. Open a scenario first."); return; }

    // Ensure schema
    if (!s.startingNpcBans || typeof s.startingNpcBans !== "object")
        s.startingNpcBans = { factions:[], roles:[] };
    if (!Array.isArray(s.startingNpcBans.factions)) s.startingNpcBans.factions = [];
    if (!Array.isArray(s.startingNpcBans.roles))    s.startingNpcBans.roles    = [];
    if (!s.proceduralAITendency || typeof s.proceduralAITendency !== "object")
        s.proceduralAITendency = {};

    const { body } = _panel("sep-spawnbans", "🚫 Spawn Bans & AI Rates", 500, 580);

    function _facList() {
        if (!s.factions || typeof s.factions !== "object") return [];
        return Object.keys(s.factions);
    }
    function _facColor(name) {
        if (s.factions && s.factions[name] && s.factions[name].color) return s.factions[name].color;
        const idx = _facList().indexOf(name) % FALLBACK_COLORS.length;
        return FALLBACK_COLORS[idx >= 0 ? idx : 0];
    }

    function render() {
        body.innerHTML = "";
        const bans = s.startingNpcBans;
        const facs = _facList();

        // ── ROLE BANS ────────────────────────────────────────────────────────
        const roleSec = document.createElement("div");
        roleSec.className = "sep-sec";

        const roleTR = _row([
            Object.assign(document.createElement("div"), {
                className:"sep-sec-title", textContent:"ROLE BANS",
                style: Object.assign(document.createElement("div").style, {flex:"1"})
            }),
            _btn("Ban All", null, () => { bans.roles = PROC_ROLES.slice(); render(); }),
            _btn("Unban All", null, () => { bans.roles = []; render(); })
        ]);
        // Fix: the title div needs proper flex styling
        const roleTitleDiv = document.createElement("div");
        roleTitleDiv.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;";
        const roleTitleLabel = document.createElement("div");
        roleTitleLabel.className = "sep-sec-title";
        roleTitleLabel.style.margin = "0";
        roleTitleLabel.textContent = "ROLE BANS";
        roleTitleDiv.appendChild(roleTitleLabel);
        const roleBtnGrp = _row([
            _btn("Ban All", null, () => { bans.roles = PROC_ROLES.slice(); render(); }),
            _btn("Unban All", null, () => { bans.roles = []; render(); })
        ], 4);
        roleTitleDiv.appendChild(roleBtnGrp);
        roleSec.appendChild(roleTitleDiv);

        const roleDesc = document.createElement("div");
        roleDesc.style.cssText = `font-size:10px;color:#4a6080;margin-bottom:8px;`;
        roleDesc.textContent = "Banned roles will not spawn procedurally for ANY faction. Story-spawned NPCs (spawn_important_npc) are unaffected.";
        roleSec.appendChild(roleDesc);

        const roleGrid = document.createElement("div");
        roleGrid.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;";

        PROC_ROLES.forEach(role => {
            const banned = bans.roles.includes(role);
            const item = document.createElement("label");
            item.style.cssText = `
                display:flex;align-items:center;gap:7px;cursor:pointer;padding:6px 8px;
                border-radius:3px;font-size:11px;
                background:${banned ? T.redDark : T.input};
                border:1px solid ${banned ? T.red : T.border2};
                transition:background .1s,border-color .1s;
            `;
            const cb = document.createElement("input");
            cb.type = "checkbox"; cb.checked = banned;
            cb.onchange = () => {
                if (cb.checked) { if (!bans.roles.includes(role)) bans.roles.push(role); }
                else { bans.roles = bans.roles.filter(r => r !== role); }
                render();
            };
            const colorDot = document.createElement("span");
            colorDot.style.cssText = `width:7px;height:7px;border-radius:50%;background:${ROLE_COLORS_BAN[role]||"#888"};flex-shrink:0;`;
            item.appendChild(cb);
            item.appendChild(colorDot);
            const nameEl = document.createElement("span");
            nameEl.style.color = banned ? "#ff8a80" : T.text;
            nameEl.textContent = role;
            item.appendChild(nameEl);
            roleGrid.appendChild(item);
        });

        roleSec.appendChild(roleGrid);
        body.appendChild(roleSec);

        // ── FACTION BANS ─────────────────────────────────────────────────────
        const facSec = document.createElement("div");
        facSec.className = "sep-sec";

        const facTitleDiv = document.createElement("div");
        facTitleDiv.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;";
        const facTitleLabel = document.createElement("div");
        facTitleLabel.className = "sep-sec-title";
        facTitleLabel.style.margin = "0";
        facTitleLabel.textContent = "FACTION BANS";
        facTitleDiv.appendChild(facTitleLabel);
        const facBtnGrp = _row([
            _btn("Ban All", null, () => { bans.factions = facs.slice(); render(); }),
            _btn("Unban All", null, () => { bans.factions = []; render(); })
        ], 4);
        facTitleDiv.appendChild(facBtnGrp);
        facSec.appendChild(facTitleDiv);

        const facDesc = document.createElement("div");
        facDesc.style.cssText = `font-size:10px;color:#4a6080;margin-bottom:8px;`;
        facDesc.textContent = "Banned factions will not spawn any procedural NPCs (Commerce, Patrol, Military, Civilian) for the entire session.";
        facSec.appendChild(facDesc);

        if (!facs.length) {
            const nf = document.createElement("div");
            nf.style.cssText = `color:#555;font-size:11px;padding:4px;`;
            nf.textContent = "No factions defined in this scenario yet.";
            facSec.appendChild(nf);
        } else {
            const facGrid = document.createElement("div");
            facGrid.style.cssText = "display:flex;flex-direction:column;gap:4px;";
            facs.forEach(name => {
                const banned = bans.factions.includes(name);
                const color  = _facColor(name);
                const item   = document.createElement("label");
                item.style.cssText = `
                    display:flex;align-items:center;gap:8px;cursor:pointer;
                    padding:5px 8px;border-radius:3px;font-size:11px;
                    background:${banned ? T.redDark : T.input};
                    border:1px solid ${banned ? T.red : T.border2};
                    transition:background .1s,border-color .1s;
                `;
                const cb = document.createElement("input");
                cb.type="checkbox"; cb.checked=banned;
                cb.onchange = () => {
                    if (cb.checked) { if (!bans.factions.includes(name)) bans.factions.push(name); }
                    else { bans.factions = bans.factions.filter(f=>f!==name); }
                    render();
                };
                const dot = document.createElement("span");
                dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;`;
                const nameEl = document.createElement("span");
                nameEl.style.cssText = `flex:1;color:${banned?"#ff8a80":T.text};`;
                nameEl.textContent = name;
                item.appendChild(cb); item.appendChild(dot); item.appendChild(nameEl);
                if (banned) {
                    const badge = document.createElement("span");
                    badge.style.cssText = `color:${T.red};font-size:10px;font-weight:bold;`;
                    badge.textContent = "BANNED";
                    item.appendChild(badge);
                }
                facGrid.appendChild(item);
            });
            facSec.appendChild(facGrid);
        }

        body.appendChild(facSec);

        // ── AI RATE MULTIPLIERS ───────────────────────────────────────────────
        const rateSec = document.createElement("div");
        rateSec.className = "sep-sec";

        const rateTitleLabel = document.createElement("div");
        rateTitleLabel.className = "sep-sec-title";
        rateTitleLabel.textContent = "AI SPAWN RATE MULTIPLIERS (per faction)";
        rateSec.appendChild(rateTitleLabel);

        const rateDesc = document.createElement("div");
        rateDesc.style.cssText = `font-size:10px;color:#4a6080;margin-bottom:8px;`;
        rateDesc.textContent = "1.0× = default spawn frequency. 0× = effectively disabled. Stored in proceduralAITendency[faction].rate.";
        rateSec.appendChild(rateDesc);

        if (!facs.length) {
            const nf = document.createElement("div");
            nf.style.cssText = `color:#555;font-size:11px;padding:4px;`;
            nf.textContent = "No factions defined.";
            rateSec.appendChild(nf);
        } else {
            facs.forEach(name => {
                if (!s.proceduralAITendency[name]) s.proceduralAITendency[name] = { rate:1.0 };
                const cur   = parseFloat(s.proceduralAITendency[name].rate) || 1.0;
                const color = _facColor(name);

                const row = document.createElement("div");
                row.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:5px;";

                const dot = document.createElement("span");
                dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;`;

                const nameEl = document.createElement("span");
                nameEl.style.cssText = `font-size:11px;min-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
                nameEl.textContent = name;

                const slider = document.createElement("input");
                slider.type="range"; slider.min="0"; slider.max="3";
                slider.step="0.1"; slider.value=cur;
                slider.style.cssText = `flex:1;accent-color:${T.blue};`;

                const valEl = document.createElement("span");
                valEl.style.cssText = `font-size:11px;color:${T.accent};min-width:36px;text-align:right;font-variant-numeric:tabular-nums;`;
                function _updateVal(v) {
                    valEl.textContent = parseFloat(v).toFixed(1) + "×";
                    valEl.style.color = v == 0 ? T.red : v > 1.5 ? "#ff8a80" : T.accent;
                }
                _updateVal(cur);
                slider.oninput = () => {
                    const v = parseFloat(slider.value);
                    s.proceduralAITendency[name].rate = v;
                    _updateVal(v);
                };

                row.appendChild(dot); row.appendChild(nameEl);
                row.appendChild(slider); row.appendChild(valEl);
                rateSec.appendChild(row);
            });
        }

        body.appendChild(rateSec);

        // Footer note
        const note = document.createElement("div");
        note.className = "sep-note";
        note.textContent = "✅ All changes write directly to the scenario document and take effect on the next game boot. " +
            "For live session bans use the set_npc_spawn_ban trigger action.";
        body.appendChild(note);
    }

    render();
}

// ============================================================================
// ██████████████████████████ MENU INJECTION ███████████████████████████████████
// ============================================================================

let _injected = false;

function _makeMenuItem(dd, emoji, label, desc, fn) {
    const item = document.createElement("div");
    item.style.cssText = `
        padding:5px 14px 5px 12px;cursor:pointer;color:${T.text};
        border-bottom:1px solid ${T.bar};font-size:12px;font-family:Tahoma,Verdana,sans-serif;
    `;
    item.innerHTML = `<span style="font-size:13px;">${emoji}</span>&nbsp;${label}` +
        (desc ? `<div style="color:#4a6080;font-size:10px;margin-top:1px;">${desc}</div>` : "");
    item.onmouseenter = () => { item.style.background=T.hover; item.style.color="#fff"; };
    item.onmouseleave = () => { item.style.background="none"; item.style.color=T.text; };
    item.onclick = () => { dd.style.display="none"; fn(); };
    dd.appendChild(item);
}

function _injectMenu() {
    const titleEl = document.getElementById("se-menu-title");
    if (!titleEl) return false;
    if (document.getElementById("sep-tools-wrap")) return true;

    const bar = titleEl.parentElement;
    if (!bar) return false;

    const wrap = document.createElement("div");
    wrap.id = "sep-tools-wrap";
    wrap.style.cssText = "display:flex;position:relative;";

    const btn = document.createElement("button");
    btn.textContent = "🛠 Tools ▾";
    Object.assign(btn.style, {
        background:"none", border:"none", color:T.text,
        padding:"0 14px", cursor:"pointer", fontSize:"11px",
        height:"30px", fontFamily:"Tahoma,Verdana,sans-serif"
    });

    const dd = document.createElement("div");
    Object.assign(dd.style, {
        display:"none", position:"absolute", top:"29px", left:"0",
        background:T.bg, border:"1px solid "+T.border,
        minWidth:"260px", zIndex:"10201",
        boxShadow:"0 6px 18px rgba(0,0,0,.7)"
    });

    // Header helper
    function _ddHeader(text) {
        const h = document.createElement("div");
        h.style.cssText = `padding:5px 12px 2px;color:${T.dim};font-size:10px;text-transform:uppercase;letter-spacing:1px;pointer-events:none;`;
        h.textContent = text;
        dd.appendChild(h);
    }
    function _ddSep() {
        const d = document.createElement("div");
        d.style.cssText = `border-top:1px solid ${T.border2};margin:3px 0;`;
        dd.appendChild(d);
    }
    function _ddNote(text) {
        const n = document.createElement("div");
        n.style.cssText = `padding:3px 14px 6px;color:#3a5060;font-size:10px;font-style:italic;`;
        n.textContent = text;
        dd.appendChild(n);
    }

    _ddHeader("Phase 1 — Story Data");
    _makeMenuItem(dd, "🗨", "Parler Lines",         "Role-based NPC dialogue overrides",        openParlerEditor);
    _makeMenuItem(dd, "📜", "Quest Manager",          "CRUD editor for scenario.storyQuests[]",    openQuestManager);
    _makeMenuItem(dd, "🚫", "Spawn Bans & AI Rates",  "startingNpcBans + proceduralAITendency",    openSpawnBans);

    _ddSep();
    _ddHeader("Phase 2 — Presentation");
    _ddNote("🎬 Movies Editor   🏰 Wall Overrides   (coming next)");

    _ddSep();
    _ddHeader("Phase 3 — Export & Targeting");
    _ddNote("🎯 Visual Coord Picker   📤 JS Export   ❓ FAQ   (coming next)");

    btn.onclick = e => { e.stopPropagation(); dd.style.display = dd.style.display==="none"?"block":"none"; };
    btn.onmouseenter = () => { btn.style.background="#2a5a8c"; };
    btn.onmouseleave = () => { btn.style.background="none"; };

    document.addEventListener("click", () => { dd.style.display="none"; });
    dd.addEventListener("click", e => e.stopPropagation());

    wrap.appendChild(btn);
    wrap.appendChild(dd);

    // Insert before the last child (Exit button wrapper)
    if (bar.lastElementChild) {
        bar.insertBefore(wrap, bar.lastElementChild);
    } else {
        bar.appendChild(wrap);
    }

    _injected = true;
    console.log("[ScenarioEditorPatch] 🛠 Tools menu injected.");
    return true;
}

// Poll for editor open/reopen
(function _poll() {
    setInterval(() => {
        const hasEditor = !!document.getElementById("se-menu-title");
        const hasMenu   = !!document.getElementById("sep-tools-wrap");
        if (hasEditor && !hasMenu) { _injected=false; _injectMenu(); _hookRandomDialogue(); }
        if (!hasEditor)            { _injected=false; }
    }, 650);
})();

// ── Public API ────────────────────────────────────────────────────────────────
return { VERSION, openParlerEditor, openQuestManager, openSpawnBans };

})();

console.log("[ScenarioEditorPatch] Phase 1 (1A · 1B · 1C) v" + window.ScenarioEditorPatch.VERSION + " loaded.");


// ============================================================================
// SCENARIO EDITOR PATCH — Phase 2  (2A · 2B)
// scenario_editor_patch_p2.js
//
// Drop-in extension — load AFTER scenario_editor_patch_p1.js.
//
//   2A · 🏰  City Wall Overrides  — per-city isVillage control
//   2B · 🎬  Movies Editor        — standalone cinematic editor with
//                                   URL art input + Wrap Art with Fades
//
// Public API (merged into window.ScenarioEditorPatch):
//   ScenarioEditorPatch.openWallOverrides()
//   ScenarioEditorPatch.openMoviesEditor()
// ============================================================================

(function () {
"use strict";

// ── Ensure P1 base is present ─────────────────────────────────────────────────
if (!window.ScenarioEditorPatch) {
    console.error("[SEP-P2] scenario_editor_patch_p1.js must load first.");
    return;
}

// ── Design tokens (same as P1) ───────────────────────────────────────────────
const T = {
    bg:"#141d2c", bar:"#1a2538", border:"#3a5a7a", border2:"#2a3f5a",
    text:"#cfd8dc", dim:"#7a9ab8", accent:"#f5d76e", blue:"#4aafd8",
    green:"#8bc34a", red:"#e74c3c", redDark:"#3c1a1a", input:"#0d1520",
    hover:"#1e4a7a", hoverDark:"#1a3a5a"
};
let _topZ = 10210;

function _s() {
    return window.ScenarioEditor && window.ScenarioEditor._state
        ? window.ScenarioEditor._state.scenario
        : (window.__activeScenario || null);
}

// ── Shared helpers (thin wrappers — avoid depending on P1 internals) ─────────
function _ensureCSS2() {
    if (document.getElementById("sep-p2-css")) return;
    const st = document.createElement("style");
    st.id = "sep-p2-css";
    st.textContent = `
        .sep2-btn{background:#1e3a5a;border:1px solid #3a5a7a;color:#cfd8dc;
            padding:4px 10px;cursor:pointer;border-radius:3px;
            font:11px Tahoma,Verdana,sans-serif;margin:2px;transition:background .12s;}
        .sep2-btn:hover{background:#2a5a8c;color:#fff;}
        .sep2-btn.pri{background:#1565c0;border-color:#4aafd8;color:#fff;}
        .sep2-btn.pri:hover{background:#1976d2;}
        .sep2-btn.dan{background:#5c1a1a;border-color:#c0392b;color:#ff8a80;}
        .sep2-btn.dan:hover{background:#7c2a2a;}
        .sep2-btn.gold{background:#5a3a00;border-color:#f5d76e;color:#f5d76e;}
        .sep2-btn.gold:hover{background:#7a5200;}
        .sep2-inp{background:#0d1520;border:1px solid #3a5a7a;color:#cfd8dc;
            padding:4px 8px;border-radius:3px;font:12px Tahoma,Verdana,sans-serif;
            box-sizing:border-box;}
        .sep2-inp:focus{outline:none;border-color:#4aafd8;}
        .sep2-sec{border:1px solid #2a3f5a;border-radius:3px;padding:8px 10px;margin-bottom:10px;}
        .sep2-sec-title{color:#7a9ab8;font-size:10px;text-transform:uppercase;
            letter-spacing:1px;font-weight:bold;margin-bottom:6px;}
        .sep2-lbl{display:block;font-size:10px;color:#7a9ab8;text-transform:uppercase;
            letter-spacing:.5px;margin-bottom:3px;}
        .sep2-item-card{border:1px solid #2a3f5a;border-radius:3px;padding:6px 8px;
            margin-bottom:6px;background:#0e1520;}
        .sep2-item-card.art-card{border-color:#5a2a4a;}
        .sep2-item-card.fade-card{border-color:#5a4a2a;}
        .sep2-item-card.title-card{border-color:#3a5475;}
        .sep2-item-card.dialogue-card{border-color:#2a5a3a;}
        .sep2-type-badge{display:inline-block;padding:1px 7px;border-radius:3px;
            font-size:10px;font-weight:bold;text-transform:uppercase;color:#fff;margin-right:6px;}
        .sep2-note{font-size:10px;color:#4a6a7a;margin-top:6px;line-height:1.5;}
    `;
    document.head.appendChild(st);
}

function _panel2(id, title, w, h) {
    const old = document.getElementById(id);
    if (old) old.remove();
    const p = document.createElement("div");
    p.id = id;
    Object.assign(p.style, {
        position:"fixed", top:"80px", left:"180px",
        width:w+"px", height:h+"px",
        background:T.bg, border:"1px solid "+T.border, borderRadius:"4px",
        zIndex: ++_topZ, fontFamily:"Tahoma,Verdana,sans-serif", fontSize:"12px",
        color:T.text, display:"flex", flexDirection:"column",
        boxShadow:"0 10px 30px rgba(0,0,0,.75)", overflow:"hidden",
        minWidth:"340px", minHeight:"200px"
    });
    p.addEventListener("mousedown", () => { p.style.zIndex = ++_topZ; });

    const bar = document.createElement("div");
    Object.assign(bar.style, {
        background:T.bar, borderBottom:"1px solid "+T.border,
        padding:"0 8px", height:"28px",
        display:"flex", alignItems:"center", flexShrink:"0",
        cursor:"move", userSelect:"none"
    });
    const titleEl = document.createElement("span");
    Object.assign(titleEl.style, {flex:"1",fontWeight:"bold",color:T.accent,fontSize:"12px"});
    titleEl.textContent = title;
    bar.appendChild(titleEl);
    const xBtn = document.createElement("button");
    xBtn.textContent = "✕";
    Object.assign(xBtn.style, {background:"none",border:"none",color:T.text,cursor:"pointer",padding:"0 4px",fontSize:"14px",lineHeight:"1"});
    xBtn.onclick = () => p.remove();
    bar.appendChild(xBtn);
    p.appendChild(bar);

    const body = document.createElement("div");
    Object.assign(body.style, {flex:"1",overflow:"auto",padding:"10px"});
    p.appendChild(body);

    const grip = document.createElement("div");
    Object.assign(grip.style, {position:"absolute",right:"0",bottom:"0",width:"14px",height:"14px",cursor:"se-resize"});
    grip.innerHTML = `<svg width="14" height="14"><path d="M14 14L0 14L14 0Z" fill="#3a5a7a" opacity=".5"/></svg>`;
    p.appendChild(grip);

    let dx,dy,dl,dt,drag=false;
    bar.addEventListener("mousedown",e=>{if(e.target===xBtn)return;drag=true;dx=e.clientX;dy=e.clientY;dl=p.offsetLeft;dt=p.offsetTop;e.preventDefault();});
    document.addEventListener("mousemove",e=>{if(drag){p.style.left=(dl+e.clientX-dx)+"px";p.style.top=(dt+e.clientY-dy)+"px";}});
    document.addEventListener("mouseup",()=>{drag=false;});

    let rx,ry,rw,rh,rsz=false;
    grip.addEventListener("mousedown",e=>{rsz=true;rx=e.clientX;ry=e.clientY;rw=p.offsetWidth;rh=p.offsetHeight;e.preventDefault();e.stopPropagation();});
    document.addEventListener("mousemove",e=>{if(rsz){p.style.width=Math.max(340,rw+e.clientX-rx)+"px";p.style.height=Math.max(200,rh+e.clientY-ry)+"px";}});
    document.addEventListener("mouseup",()=>{rsz=false;});

    document.body.appendChild(p);
    return {panel:p,body};
}

function _btn2(txt,cls,fn) {
    const b=document.createElement("button");
    b.className="sep2-btn"+(cls?" "+cls:"");
    b.textContent=txt;
    if(fn) b.onclick=fn;
    return b;
}
function _sel(options, current, onChange) {
    const s=document.createElement("select");
    s.className="sep2-inp";
    s.style.cssText="padding:3px 6px;";
    options.forEach(([val,lbl])=>{
        const o=document.createElement("option");
        o.value=val; o.textContent=lbl;
        if(val===current) o.selected=true;
        s.appendChild(o);
    });
    s.onchange=()=>onChange(s.value);
    return s;
}

// ============================================================================
// ████████████████████████ 2A — CITY WALL OVERRIDES ██████████████████████████
// ============================================================================
//
// Stores:  city.wallOverride = "default" | "walls" | "noWalls"
// Applies: city.isVillage directly (read by enterCity → generateCity)
//
// isVillage:
//   true  = no stone walls (village look)
//   false = full walled city
//   (unset = auto-computed from population by sandboxmode_npc_system.js)
// ============================================================================

function _wallLabel(ov) {
    return ov === "walls"   ? "🏰 Force Walls"
         : ov === "noWalls" ? "🌾 No Walls"
         :                    "⚙ Default (auto)";
}
function _wallColor(ov) {
    return ov === "walls"   ? "#8bc34a"
         : ov === "noWalls" ? "#f5d76e"
         :                    T.dim;
}
function _applyWallOverride(city) {
    if (city.wallOverride === "walls")   { city.isVillage = false; }
    else if (city.wallOverride === "noWalls") { city.isVillage = true; }
    else { delete city.isVillage; }  // let sandboxmode auto-compute
}

// Runtime hook — patches enterCity to apply wallOverride before generateCity
function _hookEnterCity() {
    if (window._sepWallHooked) return;
    function _tryHook() {
        if (typeof window.enterCity !== "function") { setTimeout(_tryHook, 800); return; }
        const _orig = window.enterCity;
        window.enterCity = function(factionName, playerObj) {
            // Apply wallOverride from the live cities_sandbox array
            if (typeof window.activeCity !== "undefined" && window.activeCity) {
                const city = window.activeCity;
                if (city.wallOverride === "walls")   city.isVillage = false;
                else if (city.wallOverride === "noWalls") city.isVillage = true;
                // "default" → leave isVillage alone, let generateCity decide
            }
            return _orig.apply(this, arguments);
        };
        window._sepWallHooked = true;
        console.log("[SEP] enterCity hooked — wallOverride applied on city entry.");
    }
    _tryHook();
}

function openWallOverrides() {
    _ensureCSS2();
    const s = _s();
    if (!s) { alert("No active scenario. Open a scenario first."); return; }
    if (!Array.isArray(s.cities)) s.cities = [];

    const {body} = _panel2("sep-walls","🏰 City Wall Overrides",560,500);

    function _factionColor(name) {
        return s.factions && s.factions[name] && s.factions[name].color
            ? s.factions[name].color : "#888";
    }
    function _popToStr(pop) {
        return pop >= 1000 ? (pop/1000).toFixed(1)+"k" : String(pop);
    }
    function _autoWallStr(city) {
        // Mirrors sandboxmode_npc_system logic: pop < 3000-5000 = village
        if (city.pop === undefined) return "?";
        if (city.pop < 3000) return "likely no walls";
        if (city.pop >= 5000) return "likely walled";
        return "borderline (random)";
    }

    function render() {
        body.innerHTML = "";

        // ── Header info ──────────────────────────────────────────────────────
        const info = document.createElement("div");
        info.style.cssText = `color:${T.dim};font-size:11px;margin-bottom:10px;line-height:1.6;`;
        info.innerHTML =
            `Controls whether each city generates with stone walls or a village layout when entered.<br>` +
            `<strong style="color:${T.accent}">Default</strong> = auto from population (pop &lt; 3000–5000 → no walls). ` +
            `Overrides write to <code style="color:${T.blue}">city.isVillage</code> directly.`;
        body.appendChild(info);

        // ── Quick-set row ────────────────────────────────────────────────────
        const quickRow = document.createElement("div");
        quickRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;align-items:center;";
        const qLabel = document.createElement("span");
        qLabel.style.cssText = `font-size:11px;color:${T.dim};`;
        qLabel.textContent = "Set all cities:";
        quickRow.appendChild(qLabel);
        quickRow.appendChild(_btn2("⚙ All Default","",()=>{
            s.cities.forEach(c=>{c.wallOverride="default";_applyWallOverride(c);});render();
        }));
        quickRow.appendChild(_btn2("🏰 All Walls","",()=>{
            s.cities.forEach(c=>{c.wallOverride="walls";_applyWallOverride(c);});render();
        }));
        quickRow.appendChild(_btn2("🌾 All Villages","",()=>{
            s.cities.forEach(c=>{c.wallOverride="noWalls";_applyWallOverride(c);});render();
        }));
        body.appendChild(quickRow);

        // ── City list ────────────────────────────────────────────────────────
        if (!s.cities.length) {
            const empty = document.createElement("div");
            empty.style.cssText = `color:#555;text-align:center;padding:30px;font-size:13px;`;
            empty.innerHTML = `<div style="font-size:28px;margin-bottom:8px">🏰</div>No cities in this scenario yet.`;
            body.appendChild(empty);
            return;
        }

        // Group by faction
        const byFaction = {};
        s.cities.forEach(c => {
            const k = c.faction || "(unassigned)";
            if (!byFaction[k]) byFaction[k] = [];
            byFaction[k].push(c);
        });

        Object.entries(byFaction).forEach(([facName, cities]) => {
            const sec = document.createElement("div");
            sec.className = "sep2-sec";

            const facColor = _factionColor(facName);
            const secTitle = document.createElement("div");
            secTitle.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px;";
            secTitle.innerHTML = `
                <span style="width:10px;height:10px;border-radius:50%;background:${facColor};display:inline-block;flex-shrink:0;"></span>
                <span style="font-weight:bold;font-size:11px;color:${facColor};">${facName}</span>
                <span style="color:#555;font-size:10px;">(${cities.length} cit${cities.length!==1?"ies":"y"})</span>
                <span style="margin-left:auto;font-size:10px;color:${T.dim};">Wall override</span>
            `;
            sec.appendChild(secTitle);

            const grid = document.createElement("div");
            grid.style.cssText = "display:flex;flex-direction:column;gap:4px;";

            cities.forEach(city => {
                if (!city.wallOverride) city.wallOverride = "default";

                const row = document.createElement("div");
                row.style.cssText = `
                    display:flex;align-items:center;gap:8px;padding:5px 8px;
                    border-radius:3px;border:1px solid ${T.border2};background:${T.input};
                `;

                const nameEl = document.createElement("span");
                nameEl.style.cssText = `flex:1;font-size:12px;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
                nameEl.textContent = city.name || "(unnamed)";

                const popEl = document.createElement("span");
                popEl.style.cssText = `color:#555;font-size:10px;min-width:40px;text-align:right;`;
                popEl.textContent = _popToStr(city.pop||0);

                const autoEl = document.createElement("span");
                autoEl.style.cssText = `color:#4a6080;font-size:10px;min-width:110px;text-align:center;`;
                autoEl.textContent = city.wallOverride === "default" ? _autoWallStr(city) : "";

                const sel = _sel(
                    [["default","⚙ Default"], ["walls","🏰 Force Walls"], ["noWalls","🌾 Force Village"]],
                    city.wallOverride,
                    val => {
                        city.wallOverride = val;
                        _applyWallOverride(city);
                        row.style.borderColor = _wallColor(val);
                        autoEl.textContent = val === "default" ? _autoWallStr(city) : "";
                        nameEl.style.color = val === "default" ? T.text : _wallColor(val);
                    }
                );
                sel.style.minWidth = "150px";
                if (city.wallOverride !== "default") {
                    row.style.borderColor = _wallColor(city.wallOverride);
                    nameEl.style.color = _wallColor(city.wallOverride);
                }

                row.appendChild(nameEl);
                row.appendChild(popEl);
                row.appendChild(autoEl);
                row.appendChild(sel);
                grid.appendChild(row);
            });

            sec.appendChild(grid);
            body.appendChild(sec);
        });

        const note = document.createElement("div");
        note.className = "sep2-note";
        note.innerHTML = `💡 Changes write to <code>city.isVillage</code> immediately. ` +
            `A runtime hook on <code>enterCity</code> re-applies the override on every city entry, ` +
            `so saves and reloads won't revert it. Flush the city cache (re-enter) to see the new layout.`;
        body.appendChild(note);
    }

    render();
    _hookEnterCity();
}

// ============================================================================
// ████████████████████████ 2B — MOVIES EDITOR ████████████████████████████████
// ============================================================================
//
// Standalone panel with:
//   - Movie tab-bar (add / duplicate / delete / enable)
//   - Movie settings (letterbox, typewriterCps, fadeMs, fadeColor)
//   - Item list: fade / title / art / dialogue
//   - Art items: URL input + file picker + image preview
//   - 🎞 Wrap Art with Fades — inserts fade-out before / fade-in after every art
//   - ▶ Test Movie — calls window._playMoviePatch if available
// ============================================================================

const TYPE_COLOR = {
    fade:"#5a4a2a", title:"#3a5475", art:"#5a2a4a", dialogue:"#2a5a3a"
};
const TYPE_EMOJI = {
    fade:"🌑", title:"📋", art:"🖼", dialogue:"💬"
};

function _typeSummary(it) {
    if (it.type==="fade")
        return `${it.direction||"in"}  ${it.fadeMs||0}ms  ${it.fadeColor||"#000"}`;
    if (it.type==="title")
        return `"${(it.title||"").slice(0,30)}"${it.subtitle?" — "+it.subtitle.slice(0,20):""} · ${it.ms||0}ms`;
    if (it.type==="art")
        return `${it.art ? "[art]" : "(no image)"} · ${it.artMs||0}ms${it.kenburns?" · ken-burns":""}`;
    if (it.type==="dialogue")
        return `${it.name||"?"}: "${(it.text||"").slice(0,40)}${it.text&&it.text.length>40?"…":""}"`;
    return "";
}

function _newMovie2(name) {
    return {
        id: "movie_"+Date.now()+"_"+Math.floor(Math.random()*9999),
        name: name||"Movie",
        enabled: true,
        items: [],
        letterbox: true,
        typewriterCps: 0,
        fadeMs: 1200,
        fadeColor: "#000000"
    };
}

// ── 🎞 Wrap Art with Fades ───────────────────────────────────────────────────
// Inserts fade-out(ms) BEFORE and fade-in(ms) AFTER each art item that isn't
// already bordered by fade items of the right direction.
function _wrapArtWithFades(movie) {
    const ms    = movie.fadeMs    || 900;
    const color = movie.fadeColor || "#000000";
    const src   = movie.items;
    const out   = [];

    for (let i = 0; i < src.length; i++) {
        const it   = src[i];
        const prev = out.length ? out[out.length-1] : null;
        const next = src[i+1] || null;

        if (it.type === "art") {
            // Ensure preceding fade-out
            if (!prev || prev.type !== "fade" || (prev.direction||"out") !== "out") {
                out.push({ type:"fade", direction:"out", fadeMs:ms, fadeColor:color });
            }
            out.push(it);
            // Ensure following fade-in (unless next is already a fade-in)
            if (!next || next.type !== "fade" || (next.direction||"out") !== "in") {
                out.push({ type:"fade", direction:"in", fadeMs:ms, fadeColor:color });
            }
        } else {
            out.push(it);
        }
    }
    movie.items = out;
    return out.length - src.length;  // return number of fades inserted
}

function openMoviesEditor() {
    _ensureCSS2();
    const s = _s();
    if (!s) { alert("No active scenario. Open a scenario first."); return; }

    // Ensure movies array exists
    if (!Array.isArray(s.movies) || !s.movies.length) {
        s.movies = [_newMovie2("Intro")];
    }

    const {body} = _panel2("sep-movies","🎬 Movies Editor",700,620);
    body.style.padding = "0";
    body.style.display = "flex";
    body.style.flexDirection = "column";

    let curIdx = 0;

    function _cur() { return s.movies[curIdx] || null; }

    // ── Tab bar ──────────────────────────────────────────────────────────────
    const tabArea = document.createElement("div");
    Object.assign(tabArea.style, {
        background:T.bar, borderBottom:"1px solid "+T.border,
        padding:"6px 10px", display:"flex", alignItems:"center",
        gap:"4px", flexWrap:"wrap", flexShrink:"0"
    });

    const tabBar = document.createElement("div");
    Object.assign(tabBar.style, { display:"flex", gap:"3px", flexWrap:"wrap", flex:"1" });
    tabArea.appendChild(tabBar);

    const addMovieBtn  = _btn2("+ Movie","pri",()=>{ s.movies.push(_newMovie2("Movie "+(s.movies.length+1))); curIdx=s.movies.length-1; render(); });
    tabArea.appendChild(addMovieBtn);
    body.appendChild(tabArea);

    // ── Movie body ───────────────────────────────────────────────────────────
    const movieArea = document.createElement("div");
    Object.assign(movieArea.style, { flex:"1", overflow:"auto", padding:"10px" });
    body.appendChild(movieArea);

    function _renderTabBar() {
        tabBar.innerHTML = "";
        s.movies.forEach((m, i) => {
            const btn = document.createElement("div");
            const active = i === curIdx;
            btn.style.cssText = `
                padding:4px 12px;cursor:pointer;border-radius:3px 3px 0 0;font-size:11px;
                border:1px solid ${active ? T.accent : T.border};
                background:${active ? "#3a2a0a" : "#0e1520"};
                color:${active ? T.accent : T.text};
                font-weight:${active ? "bold" : "normal"};user-select:none;
            `;
            btn.textContent = (m.enabled===false ? "⊘ " : "") + (m.name || `Movie ${i+1}`);
            btn.title = `id: ${m.id}\n${m.items.length} item(s)\nDbl-click to rename`;
            btn.onclick = () => { curIdx=i; render(); };
            btn.ondblclick = e => { e.stopPropagation(); _renameMovie(); };
            tabBar.appendChild(btn);
        });
    }

    function _renameMovie() {
        const m = _cur(); if (!m) return;
        const nm = prompt("Movie name:", m.name||"");
        if (nm == null) return;
        m.name = nm.trim() || ("Movie "+(curIdx+1));
        render();
    }

    function render() {
        _renderTabBar();
        _renderMovieBody();
    }

    function _renderMovieBody() {
        movieArea.innerHTML = "";
        const m = _cur();
        if (!m) { movieArea.innerHTML = `<div style="color:#555;padding:20px;">No movie selected.</div>`; return; }

        // ── Settings row ─────────────────────────────────────────────────────
        const settingsSec = document.createElement("div");
        settingsSec.className = "sep2-sec";
        settingsSec.style.marginBottom = "8px";

        const settingsTitle = document.createElement("div");
        settingsTitle.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;";

        const leftTitle = document.createElement("div");
        leftTitle.className = "sep2-sec-title";
        leftTitle.style.margin = "0";
        leftTitle.textContent = (m.name||"Movie").toUpperCase() + " — Settings";
        settingsTitle.appendChild(leftTitle);

        const movieBtns = document.createElement("div");
        movieBtns.style.display = "flex";
        movieBtns.style.gap = "4px";

        movieBtns.appendChild(_btn2("Rename","",_renameMovie));
        movieBtns.appendChild(_btn2("⎘ Duplicate","",()=>{
            const copy = JSON.parse(JSON.stringify(m));
            copy.id = "movie_"+Date.now()+"_"+Math.floor(Math.random()*9999);
            copy.name = (m.name||"Movie")+" (copy)";
            s.movies.splice(curIdx+1,0,copy);
            curIdx++;
            render();
        }));
        movieBtns.appendChild(_btn2("🗑 Delete","dan",()=>{
            if (s.movies.length<=1) { alert("At least one movie must exist. Disable it instead."); return; }
            if (!confirm(`Delete movie "${m.name||"Movie"}"?`)) return;
            s.movies.splice(curIdx,1);
            curIdx=Math.min(curIdx,s.movies.length-1);
            render();
        }));

        settingsTitle.appendChild(movieBtns);
        settingsSec.appendChild(settingsTitle);

        const settingsGrid = document.createElement("div");
        settingsGrid.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;align-items:center;";

        function _checkSetting(label, key) {
            const lbl = document.createElement("label");
            lbl.style.cssText = "display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;";
            const cb = document.createElement("input");
            cb.type="checkbox"; cb.checked = m[key]!==false;
            cb.onchange = () => { m[key]=cb.checked; };
            lbl.appendChild(cb);
            lbl.appendChild(document.createTextNode(label));
            return lbl;
        }
        function _numSetting(label, key, w) {
            const wrap = document.createElement("label");
            wrap.style.cssText = "display:flex;align-items:center;gap:6px;font-size:12px;";
            wrap.textContent = label+" ";
            const i = document.createElement("input");
            i.type="number"; i.className="sep2-inp"; i.value=m[key]||0;
            i.style.width=(w||60)+"px"; i.min="0";
            i.oninput = () => { m[key]=+i.value||0; };
            wrap.appendChild(i);
            return wrap;
        }
        function _colorSetting(label, key) {
            const wrap = document.createElement("label");
            wrap.style.cssText = "display:flex;align-items:center;gap:6px;font-size:12px;";
            wrap.textContent = label+" ";
            const i = document.createElement("input");
            i.type="color"; i.value=m[key]||"#000000";
            i.oninput = () => { m[key]=i.value; };
            wrap.appendChild(i);
            return wrap;
        }

        settingsGrid.appendChild(_checkSetting("✓ Enabled", "enabled"));
        settingsGrid.appendChild(_checkSetting("📺 Letterbox", "letterbox"));
        settingsGrid.appendChild(_numSetting("Typewriter CPS:", "typewriterCps", 60));
        settingsGrid.appendChild(_numSetting("Default Fade ms:", "fadeMs", 70));
        settingsGrid.appendChild(_colorSetting("Fade color:", "fadeColor"));
        settingsSec.appendChild(settingsGrid);

        movieArea.appendChild(settingsSec);

        // ── Items header ──────────────────────────────────────────────────────
        const itemsHeader = document.createElement("div");
        itemsHeader.style.cssText = "display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;";

        const addBtns = [
            ["+ Fade",    ()=>m.items.push({type:"fade",direction:"out",fadeMs:m.fadeMs||900,fadeColor:m.fadeColor||"#000"})],
            ["+ Title",   ()=>m.items.push({type:"title",title:"Chapter I",subtitle:"",ms:3500})],
            ["+ Art",     ()=>m.items.push({type:"art",art:"",artMs:5000,kenburns:false,artCaption:""})],
            ["+ Dialogue",()=>m.items.push({type:"dialogue",name:"Narrator",text:"...",side:"left",portrait:"",color:"#d4b886",narrator:true})],
        ];
        addBtns.forEach(([lbl,fn])=>{
            itemsHeader.appendChild(_btn2(lbl,"pri",()=>{fn();renderItems();}));
        });

        const spacer = document.createElement("span"); spacer.style.flex="1";
        itemsHeader.appendChild(spacer);

        // 🎞 Wrap Art with Fades — headline feature
        const wrapBtn = _btn2("🎞 Wrap Art w/ Fades","gold",()=>{
            if (!m.items.some(x=>x.type==="art")) {
                alert("No art items found in this movie. Add an Art item first.");
                return;
            }
            const added = _wrapArtWithFades(m);
            renderItems();
            wrapBtn.textContent = `✓ Added ${added} fades`;
            setTimeout(()=>{wrapBtn.textContent="🎞 Wrap Art w/ Fades";},2200);
        });
        wrapBtn.title = "Inserts fade-out before and fade-in after every Art item that isn't already bordered by fades.";
        itemsHeader.appendChild(wrapBtn);

        // ▶ Test
        const testBtn = _btn2("▶ Test","",async ()=>{
            if (!window.StoryPresentation) { alert("StoryPresentation not available in editor."); return; }
            // Try to call _playMovie via the trigger module
            if (window.ScenarioTriggers && typeof window.ScenarioTriggers._playMoviePub === "function") {
                await window.ScenarioTriggers._playMoviePub(m);
            } else if (typeof window._playMoviePatch === "function") {
                await window._playMoviePatch(m);
            } else {
                alert("Test requires the game to be running with StoryPresentation loaded.\nOpen the scenario in-game and use the play_movie trigger action instead.");
            }
        });
        itemsHeader.appendChild(testBtn);

        movieArea.appendChild(itemsHeader);

        // ── Items list ────────────────────────────────────────────────────────
        const itemsList = document.createElement("div");
        itemsList.id = "sep-movies-items";
        movieArea.appendChild(itemsList);

        function renderItems() {
            itemsList.innerHTML = "";
            if (!m.items.length) {
                itemsList.innerHTML = `<div style="color:#555;padding:12px;text-align:center;font-size:12px;">
                    No items yet — use the buttons above to add Fade / Title / Art / Dialogue items.
                </div>`;
                return;
            }
            m.items.forEach((it, idx) => {
                itemsList.appendChild(_buildItemCard(it, idx));
            });
        }

        function _buildItemCard(it, idx) {
            const card = document.createElement("div");
            card.className = `sep2-item-card ${it.type}-card`;
            if (it.enabled===false) card.style.opacity="0.45";

            // ── Card header ──────────────────────────────────────────────────
            const head = document.createElement("div");
            head.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;";

            const numBadge = document.createElement("span");
            numBadge.style.cssText = `background:#3a2a0a;color:${T.accent};padding:1px 6px;border-radius:3px;font-size:10px;font-weight:bold;`;
            numBadge.textContent = "#"+(idx+1);

            const typeBadge = document.createElement("span");
            typeBadge.className = "sep2-type-badge";
            typeBadge.style.background = TYPE_COLOR[it.type]||"#444";
            typeBadge.textContent = (TYPE_EMOJI[it.type]||"")+" "+it.type;

            const summary = document.createElement("span");
            summary.style.cssText = `flex:1;color:${T.dim};font-size:11px;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
            summary.textContent = _typeSummary(it);

            // Reorder buttons
            const upBtn   = _btn2("▲","",()=>{ if(idx===0)return; [m.items[idx-1],m.items[idx]]=[m.items[idx],m.items[idx-1]]; renderItems(); });
            const downBtn = _btn2("▼","",()=>{ if(idx>=m.items.length-1)return; [m.items[idx+1],m.items[idx]]=[m.items[idx],m.items[idx+1]]; renderItems(); });
            const dupBtn  = _btn2("⎘","",()=>{ m.items.splice(idx+1,0,JSON.parse(JSON.stringify(it))); renderItems(); });
            const togBtn  = _btn2(it.enabled===false?"○":"✓","",()=>{ it.enabled=(it.enabled===false); renderItems(); });
            togBtn.title  = "Enable/disable this item";
            const delBtn  = _btn2("✕","dan",()=>{ if(!confirm("Delete this item?"))return; m.items.splice(idx,1); renderItems(); });
            if (idx===0)           upBtn.disabled=true;
            if (idx===m.items.length-1) downBtn.disabled=true;

            head.appendChild(numBadge);
            head.appendChild(typeBadge);
            head.appendChild(summary);
            head.appendChild(upBtn);
            head.appendChild(downBtn);
            head.appendChild(dupBtn);
            head.appendChild(togBtn);
            head.appendChild(delBtn);
            card.appendChild(head);

            // ── Per-type editor ───────────────────────────────────────────────
            const editor = _buildItemEditor(it, ()=>{ summary.textContent=_typeSummary(it); });
            card.appendChild(editor);
            return card;
        }

        function _buildItemEditor(it, onChange) {
            const wrap = document.createElement("div");

            if (it.type === "fade") {
                wrap.innerHTML = `
                    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                        <label style="display:flex;align-items:center;gap:6px;font-size:12px;">Direction:
                            <select class="sep2-inp mi-dir" style="padding:3px 6px;">
                                <option value="out" ${(it.direction||"out")==="out"?"selected":""}>Fade OUT (cover to color)</option>
                                <option value="in"  ${it.direction==="in"?"selected":""}>Fade IN (reveal from color)</option>
                            </select>
                        </label>
                        <label style="display:flex;align-items:center;gap:6px;font-size:12px;">Duration:
                            <input type="number" class="sep2-inp mi-fadems" value="${it.fadeMs||0}" style="width:70px;" min="0">ms
                        </label>
                        <label style="display:flex;align-items:center;gap:6px;font-size:12px;">Color:
                            <input type="color" class="mi-fadecolor" value="${it.fadeColor||"#000000"}">
                        </label>
                    </div>`;
                wrap.querySelector(".mi-dir").onchange       = e=>{ it.direction=e.target.value; onChange(); };
                wrap.querySelector(".mi-fadems").oninput     = e=>{ it.fadeMs=+e.target.value||0; onChange(); };
                wrap.querySelector(".mi-fadecolor").oninput  = e=>{ it.fadeColor=e.target.value; onChange(); };

            } else if (it.type === "title") {
                wrap.innerHTML = `
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px;">
                        <div><label class="sep2-lbl">Title</label>
                            <input type="text" class="sep2-inp mi-title" value="${_esc(it.title||"")}" style="width:100%;"></div>
                        <div><label class="sep2-lbl">Subtitle</label>
                            <input type="text" class="sep2-inp mi-subtitle" value="${_esc(it.subtitle||"")}" style="width:100%;"></div>
                    </div>
                    <label style="font-size:12px;">Hold (ms):
                        <input type="number" class="sep2-inp mi-titlems" value="${it.ms||3500}" style="width:80px;" min="0">
                    </label>`;
                wrap.querySelector(".mi-title").oninput    = e=>{ it.title=e.target.value; onChange(); };
                wrap.querySelector(".mi-subtitle").oninput = e=>{ it.subtitle=e.target.value; onChange(); };
                wrap.querySelector(".mi-titlems").oninput  = e=>{ it.ms=+e.target.value||0; onChange(); };

            } else if (it.type === "art") {
                // URL + file picker + preview
                const previewSrc = it.art || "";
                wrap.innerHTML = `
                    <div style="display:flex;gap:8px;align-items:flex-start;">
                        <div style="flex:1;">
                            <label class="sep2-lbl">Image URL or path (relative to game root)</label>
                            <input type="text" class="sep2-inp mi-art-url" value="${_esc(previewSrc.startsWith("data:")?"":(previewSrc||""))}" 
                                   placeholder="art/story1/story1_art1.jpg" style="width:100%;margin-bottom:4px;">
                            <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
                                <label style="font-size:11px;color:${T.dim};">Or upload:</label>
                                <input type="file" class="mi-art-file" accept="image/*">
                                <button class="sep2-btn mi-art-clear" style="padding:2px 8px;">Clear</button>
                            </div>
                        </div>
                        <div class="mi-art-preview" style="width:120px;height:80px;border:1px solid ${T.border2};background:#000 center/contain no-repeat;flex-shrink:0;
                            ${previewSrc?"background-image:url('"+previewSrc+"');":""}"></div>
                    </div>
                    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:6px;">
                        <label style="font-size:12px;">Hold (ms):
                            <input type="number" class="sep2-inp mi-artms" value="${it.artMs||5000}" style="width:70px;" min="0">
                        </label>
                        <label style="font-size:12px;display:flex;align-items:center;gap:6px;">
                            <input type="checkbox" class="mi-kenburns" ${it.kenburns?"checked":""}> Ken-Burns zoom
                        </label>
                    </div>
                    <div style="margin-top:6px;">
                        <label class="sep2-lbl">Caption (optional)</label>
                        <textarea class="sep2-inp mi-artcaption" rows="2" style="width:100%;resize:vertical;">${_esc(it.artCaption||"")}</textarea>
                    </div>`;

                const urlInput   = wrap.querySelector(".mi-art-url");
                const fileInput  = wrap.querySelector(".mi-art-file");
                const clearBtn2  = wrap.querySelector(".mi-art-clear");
                const preview    = wrap.querySelector(".mi-art-preview");
                const artMsInput = wrap.querySelector(".mi-artms");
                const kbCheck    = wrap.querySelector(".mi-kenburns");
                const capInput   = wrap.querySelector(".mi-artcaption");

                function _setArtUrl(url) {
                    it.art = url;
                    preview.style.backgroundImage = url ? `url('${url}')` : "";
                    if (!url.startsWith("data:")) urlInput.value = url;
                    onChange();
                }

                urlInput.oninput  = ()=>{ _setArtUrl(urlInput.value); };
                urlInput.onblur   = ()=>{ _setArtUrl(urlInput.value); };
                clearBtn2.onclick = ()=>{ _setArtUrl(""); urlInput.value=""; fileInput.value=""; };
                artMsInput.oninput = ()=>{ it.artMs=+artMsInput.value||0; onChange(); };
                kbCheck.onchange  = ()=>{ it.kenburns=kbCheck.checked; onChange(); };
                capInput.oninput  = ()=>{ it.artCaption=capInput.value; onChange(); };

                fileInput.onchange = e=>{
                    const f=e.target.files[0]; if(!f) return;
                    const reader=new FileReader();
                    reader.onload=ev=>{ _setArtUrl(ev.target.result); };
                    reader.readAsDataURL(f);
                };

            } else if (it.type === "dialogue") {
                wrap.innerHTML = `
                    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px;">
                        <label style="font-size:12px;">Side:
                            <select class="sep2-inp mi-dlg-side" style="padding:3px 6px;">
                                <option value="left"  ${it.side!=="right"?"selected":""}>Left</option>
                                <option value="right" ${it.side==="right"?"selected":""}>Right</option>
                            </select>
                        </label>
                        <label style="font-size:12px;">Speaker:
                            <input type="text" class="sep2-inp mi-dlg-name" value="${_esc(it.name||"")}" style="width:130px;">
                        </label>
                        <label style="font-size:12px;">Color:
                            <input type="color" class="mi-dlg-color" value="${it.color||"#d4b886"}">
                        </label>
                        <label style="font-size:12px;display:flex;align-items:center;gap:5px;">
                            <input type="checkbox" class="mi-dlg-narr" ${it.narrator?"checked":""}> Narrator
                        </label>
                    </div>
                    <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px;">
                        <div style="flex:1;">
                            <label class="sep2-lbl">Portrait URL or path</label>
                            <input type="text" class="sep2-inp mi-dlg-portrait-url" value="${_esc((it.portrait&&!it.portrait.startsWith("data:"))?it.portrait:"")}" 
                                   placeholder="art/story1/highrank_samurai.jpg" style="width:100%;margin-bottom:4px;">
                            <input type="file" class="mi-dlg-portrait-file" accept="image/*">
                        </div>
                        <div class="mi-dlg-portrait-thumb" style="width:40px;height:40px;border:1px solid ${T.border2};
                            background:#000 center/cover no-repeat;flex-shrink:0;
                            ${it.portrait?"background-image:url('"+it.portrait+"');":""}"></div>
                    </div>
                    <div>
                        <label class="sep2-lbl">Dialogue text</label>
                        <textarea class="sep2-inp mi-dlg-text" rows="3" style="width:100%;resize:vertical;">${_esc(it.text||"")}</textarea>
                    </div>`;

                const thumb = wrap.querySelector(".mi-dlg-portrait-thumb");

                wrap.querySelector(".mi-dlg-side").onchange  = e=>{ it.side=e.target.value; onChange(); };
                wrap.querySelector(".mi-dlg-name").oninput   = e=>{ it.name=e.target.value; onChange(); };
                wrap.querySelector(".mi-dlg-color").oninput  = e=>{ it.color=e.target.value; onChange(); };
                wrap.querySelector(".mi-dlg-narr").onchange  = e=>{ it.narrator=e.target.checked; onChange(); };
                wrap.querySelector(".mi-dlg-text").oninput   = e=>{ it.text=e.target.value; onChange(); };

                const portUrl = wrap.querySelector(".mi-dlg-portrait-url");
                portUrl.oninput = ()=>{
                    it.portrait=portUrl.value;
                    thumb.style.backgroundImage=portUrl.value?`url('${portUrl.value}')`:""
                    onChange();
                };
                wrap.querySelector(".mi-dlg-portrait-file").onchange = e=>{
                    const f=e.target.files[0]; if(!f) return;
                    const reader=new FileReader();
                    reader.onload=ev=>{
                        it.portrait=ev.target.result;
                        thumb.style.backgroundImage=`url('${ev.target.result}')`;
                        onChange();
                    };
                    reader.readAsDataURL(f);
                };
            }
            return wrap;
        }

        renderItems();

        // ── Footer note ────────────────────────────────────────────────────
        const note = document.createElement("div");
        note.className = "sep2-note";
        note.innerHTML = `💡 <strong>movies[0]</strong> plays at scenario boot. Others fire via the <code>play_movie</code> trigger action. ` +
            `Use the Trigger Editor's <em>Story</em> tab for an alternative view of this same data.`;
        movieArea.appendChild(note);
    }

    render();
}

// ── Tiny helper: escape HTML ──────────────────────────────────────────────────
function _esc(s) {
    return String(s||"")
        .replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ============================================================================
// ████████████████████████ UPDATE MENU INJECTION ██████████████████████████████
// ============================================================================
// Upgrades the Phase 1 "🛠 Tools ▾" dropdown in-place,
// replacing the Phase 2 placeholder note with real menu items.
// ============================================================================

function _upgradeMenu() {
    const dd = document.querySelector("#sep-tools-wrap > div:last-child");
    if (!dd) return false;

    // Remove the Phase 2 placeholder line
    dd.querySelectorAll("div").forEach(el => {
        if (el.textContent && el.textContent.includes("Movies Editor") && el.textContent.includes("coming next")) {
            el.remove();
        }
    });

    // Find the Phase 2 header (text = "Phase 2 — Presentation")
    let p2Header = null;
    dd.querySelectorAll("div").forEach(el => {
        if (el.textContent && el.textContent.trim() === "Phase 2 — Presentation") p2Header = el;
    });
    if (!p2Header) return false;

    function _insertAfter(ref, newEl) {
        ref.parentNode.insertBefore(newEl, ref.nextSibling);
    }

    function _menuItem2(emoji, label, desc, fn) {
        const item = document.createElement("div");
        item.style.cssText = `
            padding:5px 14px 5px 12px;cursor:pointer;color:#cfd8dc;
            border-bottom:1px solid #1a2538;font-size:12px;
            font-family:Tahoma,Verdana,sans-serif;
        `;
        item.innerHTML = `<span style="font-size:13px;">${emoji}</span>&nbsp;${label}` +
            (desc ? `<div style="color:#4a6080;font-size:10px;margin-top:1px;">${desc}</div>` : "");
        item.onmouseenter = ()=>{ item.style.background="#1e4a7a"; item.style.color="#fff"; };
        item.onmouseleave = ()=>{ item.style.background="none"; item.style.color="#cfd8dc"; };
        item.onclick = ()=>{ dd.style.display="none"; fn(); };
        return item;
    }

    // Insert after Phase 2 header
    const wallItem   = _menuItem2("🏰","City Wall Overrides","Force walls on/off per city",    openWallOverrides);
    const moviesItem = _menuItem2("🎬","Movies Editor","Cinematics, art cards, dialogue + Wrap Fades", openMoviesEditor);

    _insertAfter(p2Header, moviesItem);
    _insertAfter(p2Header, wallItem);

    return true;
}

// Poll until menu is ready, then upgrade it
(function _pollUpgrade() {
    const id = setInterval(()=>{
        if (document.getElementById("sep-tools-wrap")) {
            if (_upgradeMenu()) clearInterval(id);
        }
    }, 700);
})();

// ── Expose to public API ──────────────────────────────────────────────────────
const p = window.ScenarioEditorPatch;
p.openWallOverrides  = openWallOverrides;
p.openMoviesEditor   = openMoviesEditor;
p.VERSION_P2         = "2.0.0";

})();

console.log("[ScenarioEditorPatch] Phase 2 (2A · 2B) loaded.");


// ============================================================================
// SCENARIO EDITOR PATCH — Phase 3  (3A · 3B · 3C)
// scenario_editor_patch_p3.js
//
// Load AFTER p1 and p2.
//
//   3A · 🎯  Visual Coord Picker  — click-to-pick world coords from the map
//   3B · 📤  ES6+ JS Export       — full scenario export, named consts + comments
//   3C · ❓  FAQ / Help panel     — reference for all 7 patch tools
//
// Public API (merged into window.ScenarioEditorPatch):
//   ScenarioEditorPatch.openCoordPicker()
//   ScenarioEditorPatch.openJsExport()
//   ScenarioEditorPatch.openFaq()
// ============================================================================

(function () {
"use strict";

if (!window.ScenarioEditorPatch) {
    console.error("[SEP-P3] scenario_editor_patch_p1.js must load first.");
    return;
}

// ── Design tokens ────────────────────────────────────────────────────────────
const T = {
    bg:"#141d2c", bar:"#1a2538", border:"#3a5a7a", border2:"#2a3f5a",
    text:"#cfd8dc", dim:"#7a9ab8", accent:"#f5d76e", blue:"#4aafd8",
    green:"#8bc34a", red:"#e74c3c", input:"#0d1520",
    hover:"#1e4a7a", mono:"Consolas,\"Courier New\",monospace"
};
let _topZ = 10220;

function _s() {
    return window.ScenarioEditor && window.ScenarioEditor._state
        ? window.ScenarioEditor._state.scenario
        : (window.__activeScenario || null);
}
function _cam() {
    return window.ScenarioEditor && window.ScenarioEditor._state
        ? window.ScenarioEditor._state.cam : null;
}

// ── CSS ───────────────────────────────────────────────────────────────────────
function _ensureCSS3() {
    if (document.getElementById("sep-p3-css")) return;
    const st = document.createElement("style");
    st.id = "sep-p3-css";
    st.textContent = `
        .sep3-btn{background:#1e3a5a;border:1px solid #3a5a7a;color:#cfd8dc;
            padding:4px 10px;cursor:pointer;border-radius:3px;
            font:11px Tahoma,Verdana,sans-serif;margin:2px;transition:background .12s;}
        .sep3-btn:hover{background:#2a5a8c;color:#fff;}
        .sep3-btn.pri{background:#1565c0;border-color:#4aafd8;color:#fff;}
        .sep3-btn.pri:hover{background:#1976d2;}
        .sep3-btn.dan{background:#5c1a1a;border-color:#c0392b;color:#ff8a80;}
        .sep3-btn.gold{background:#5a3a00;border-color:#f5d76e;color:#f5d76e;}
        .sep3-btn.gold:hover{background:#7a5200;}
        .sep3-btn.act{background:#145a14;border-color:#4aaa4a;color:#b8ffb8;}
        .sep3-btn.act:hover{background:#1a7a1a;}
        .sep3-inp{background:#0d1520;border:1px solid #3a5a7a;color:#cfd8dc;
            padding:4px 8px;border-radius:3px;font:12px Tahoma,Verdana,sans-serif;
            box-sizing:border-box;}
        .sep3-inp:focus{outline:none;border-color:#4aafd8;}
        .sep3-code{background:#0d1520;border:1px solid #2a3f5a;color:#c5e1a5;
            padding:10px;border-radius:3px;font:11px ${T.mono};
            white-space:pre;overflow:auto;display:block;width:100%;
            box-sizing:border-box;resize:vertical;}
        .sep3-sec{border:1px solid #2a3f5a;border-radius:3px;padding:8px 10px;margin-bottom:10px;}
        .sep3-sec-title{color:#7a9ab8;font-size:10px;text-transform:uppercase;
            letter-spacing:1px;font-weight:bold;margin-bottom:6px;}
        .sep3-note{font-size:10px;color:#4a6a7a;margin-top:6px;line-height:1.5;}
        .sep3-faq h3{color:${T.accent};font-size:12px;margin:14px 0 5px;border-bottom:1px solid #2a3f5a;padding-bottom:3px;}
        .sep3-faq h4{color:${T.blue};font-size:11px;margin:10px 0 3px;}
        .sep3-faq p,.sep3-faq li{color:${T.text};font-size:11px;line-height:1.7;margin:3px 0;}
        .sep3-faq code{background:#0d1520;color:#80cbc4;padding:1px 5px;border-radius:2px;font-family:${T.mono};}
        .sep3-faq ul{margin:4px 0 6px 18px;padding:0;}
        .sep3-faq .warn{color:#ff8a80;background:#2a0d0d;border:1px solid #5c1a1a;
            padding:5px 8px;border-radius:3px;font-size:11px;margin:6px 0;}
        .sep3-faq .tip{color:#b8ffb8;background:#0a2a0a;border:1px solid #145a14;
            padding:5px 8px;border-radius:3px;font-size:11px;margin:6px 0;}
        #sep-coord-crosshair{pointer-events:none;position:fixed;z-index:10500;}
    `;
    document.head.appendChild(st);
}

// ── Panel factory ─────────────────────────────────────────────────────────────
function _panel3(id, title, w, h) {
    const old = document.getElementById(id);
    if (old) old.remove();
    const p = document.createElement("div");
    p.id = id;
    Object.assign(p.style, {
        position:"fixed", top:"90px", left:"200px",
        width:w+"px", height:h+"px",
        background:T.bg, border:"1px solid "+T.border, borderRadius:"4px",
        zIndex:++_topZ, fontFamily:"Tahoma,Verdana,sans-serif", fontSize:"12px",
        color:T.text, display:"flex", flexDirection:"column",
        boxShadow:"0 10px 30px rgba(0,0,0,.75)", overflow:"hidden",
        minWidth:"300px", minHeight:"180px"
    });
    p.addEventListener("mousedown", ()=>{ p.style.zIndex=++_topZ; });

    const bar = document.createElement("div");
    Object.assign(bar.style, {
        background:T.bar, borderBottom:"1px solid "+T.border,
        padding:"0 8px", height:"28px",
        display:"flex", alignItems:"center", flexShrink:"0",
        cursor:"move", userSelect:"none"
    });
    const titleEl = document.createElement("span");
    Object.assign(titleEl.style, {flex:"1",fontWeight:"bold",color:T.accent,fontSize:"12px"});
    titleEl.textContent = title;
    bar.appendChild(titleEl);
    const xBtn = document.createElement("button");
    xBtn.textContent="✕";
    Object.assign(xBtn.style,{background:"none",border:"none",color:T.text,cursor:"pointer",padding:"0 4px",fontSize:"14px",lineHeight:"1"});
    xBtn.onclick=()=>p.remove();
    bar.appendChild(xBtn);
    p.appendChild(bar);

    const body = document.createElement("div");
    Object.assign(body.style, {flex:"1",overflow:"auto",padding:"10px"});
    p.appendChild(body);

    const grip = document.createElement("div");
    Object.assign(grip.style,{position:"absolute",right:"0",bottom:"0",width:"14px",height:"14px",cursor:"se-resize"});
    grip.innerHTML=`<svg width="14" height="14"><path d="M14 14L0 14L14 0Z" fill="#3a5a7a" opacity=".5"/></svg>`;
    p.appendChild(grip);

    let dx,dy,dl,dt,drag=false;
    bar.addEventListener("mousedown",e=>{if(e.target===xBtn)return;drag=true;dx=e.clientX;dy=e.clientY;dl=p.offsetLeft;dt=p.offsetTop;e.preventDefault();});
    document.addEventListener("mousemove",e=>{if(drag){p.style.left=(dl+e.clientX-dx)+"px";p.style.top=(dt+e.clientY-dy)+"px";}});
    document.addEventListener("mouseup",()=>{drag=false;});
    let rx,ry,rw,rh,rsz=false;
    grip.addEventListener("mousedown",e=>{rsz=true;rx=e.clientX;ry=e.clientY;rw=p.offsetWidth;rh=p.offsetHeight;e.preventDefault();e.stopPropagation();});
    document.addEventListener("mousemove",e=>{if(rsz){p.style.width=Math.max(300,rw+e.clientX-rx)+"px";p.style.height=Math.max(180,rh+e.clientY-ry)+"px";}});
    document.addEventListener("mouseup",()=>{rsz=false;});

    document.body.appendChild(p);
    return {panel:p,body};
}

function _btn3(txt,cls,fn) {
    const b=document.createElement("button");
    b.className="sep3-btn"+(cls?" "+cls:"");
    b.textContent=txt;
    if(fn)b.onclick=fn;
    return b;
}

// ============================================================================
// ████████████████████████ 3A — VISUAL COORD PICKER ██████████████████████████
// ============================================================================
//
// Click-to-pick world coordinates directly from the editor map canvas.
// Shows live cursor coords while hovering, locks on click.
// Supports Point mode (x, y) and Region mode (x, y, radius via drag).
// Crosshair + radius circle drawn as an SVG overlay on the canvas.
// ============================================================================

let _pickActive     = false;   // whether pick mode is currently on
let _pickMode       = "point"; // "point" | "region"
let _pickCallback   = null;    // fn({x,y,radius?}) called on pick
let _liveX          = 0;
let _liveY          = 0;
let _pickedX        = null;
let _pickedY        = null;
let _pickedRadius   = null;
let _dragStartX     = null;
let _dragStartY     = null;
let _isDragging     = false;

// Screen coords → world coords using editor camera
function _screenToWorld(sx, sy) {
    const cam = _cam();
    if (!cam) return {x:Math.round(sx), y:Math.round(sy)};
    return {
        x: Math.round(sx / cam.zoom + cam.x),
        y: Math.round(sy / cam.zoom + cam.y)
    };
}

// SVG crosshair overlay
function _ensureCrosshair() {
    let el = document.getElementById("sep-coord-crosshair");
    if (!el) {
        el = document.createElementNS("http://www.w3.org/2000/svg","svg");
        el.id = "sep-coord-crosshair";
        el.style.cssText = "pointer-events:none;position:fixed;top:0;left:0;width:100%;height:100%;z-index:10490;display:none;";
        document.body.appendChild(el);
    }
    return el;
}

function _drawCrosshair(screenX, screenY, radius, isDragPreview) {
    const svg = _ensureCrosshair();
    svg.style.display = "block";
    const clr  = isDragPreview ? "#f5d76e" : "#4aafd8";
    const clr2 = isDragPreview ? "rgba(245,215,110,0.15)" : "rgba(74,175,216,0.12)";
    let html = `
        <line x1="${screenX-16}" y1="${screenY}" x2="${screenX+16}" y2="${screenY}" stroke="${clr}" stroke-width="1.5" stroke-dasharray="4,3"/>
        <line x1="${screenX}" y1="${screenY-16}" x2="${screenX}" y2="${screenY+16}" stroke="${clr}" stroke-width="1.5" stroke-dasharray="4,3"/>
        <circle cx="${screenX}" cy="${screenY}" r="5" fill="none" stroke="${clr}" stroke-width="1.5"/>
    `;
    if (radius && radius > 0) {
        const cam = _cam();
        const screenR = cam ? radius * cam.zoom : radius;
        html += `<circle cx="${screenX}" cy="${screenY}" r="${screenR}" fill="${clr2}" stroke="${clr}" stroke-width="1.5" stroke-dasharray="6,4"/>`;
    }
    svg.innerHTML = html;
}

function _hideCrosshair() {
    const svg = document.getElementById("sep-coord-crosshair");
    if (svg) svg.style.display = "none";
}

function _stopPickMode() {
    _pickActive = false;
    _hideCrosshair();
    const canvas = document.getElementById("se-canvas");
    if (canvas) {
        canvas.removeEventListener("mousemove",  _pickMouseMove);
        canvas.removeEventListener("mousedown",  _pickMouseDown);
        canvas.removeEventListener("mouseup",    _pickMouseUp);
        canvas.style.cursor = "";
    }
    document.removeEventListener("keydown", _pickEscape);
}

function _pickMouseMove(e) {
    const canvas = document.getElementById("se-canvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const {x,y} = _screenToWorld(sx,sy);
    _liveX = x; _liveY = y;

    // Update live display in the coord picker panel
    const liveEl = document.getElementById("sep-coord-live");
    if (liveEl) liveEl.textContent = `${x.toLocaleString()}, ${y.toLocaleString()}`;

    if (_isDragging && _pickMode === "region" && _dragStartX !== null) {
        // Show drag radius preview
        const cam = _cam();
        const startScreenX = cam ? (_dragStartX - cam.x) * cam.zoom : _dragStartX;
        const startScreenY = cam ? (_dragStartY - cam.y) * cam.zoom : _dragStartY;
        const r = Math.round(Math.hypot(x - _dragStartX, y - _dragStartY));
        const liveRel = document.getElementById("sep-coord-live-r");
        if (liveRel) liveRel.textContent = r;
        _drawCrosshair(startScreenX + canvas.getBoundingClientRect().left,
                       startScreenY + canvas.getBoundingClientRect().top,
                       r, true);
    } else {
        _drawCrosshair(e.clientX, e.clientY, _pickedRadius, false);
    }
}

function _pickMouseDown(e) {
    if (_pickMode === "region") {
        const canvas = document.getElementById("se-canvas");
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const {x,y} = _screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        _dragStartX = x; _dragStartY = y; _isDragging = true;
    }
}

function _pickMouseUp(e) {
    const canvas = document.getElementById("se-canvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const {x,y} = _screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    if (_pickMode === "region" && _isDragging && _dragStartX !== null) {
        _pickedX = _dragStartX;
        _pickedY = _dragStartY;
        _pickedRadius = Math.round(Math.hypot(x - _dragStartX, y - _dragStartY));
        _isDragging = false; _dragStartX = null; _dragStartY = null;
    } else {
        _pickedX = x; _pickedY = y;
    }

    // Update display
    const xEl = document.getElementById("sep-coord-x");
    const yEl = document.getElementById("sep-coord-y");
    const rEl = document.getElementById("sep-coord-r");
    if (xEl) xEl.value = _pickedX;
    if (yEl) yEl.value = _pickedY;
    if (rEl && _pickedRadius !== null) rEl.value = _pickedRadius;
    _updatePickResult();

    if (_pickCallback) { _pickCallback({x:_pickedX, y:_pickedY, radius:_pickedRadius}); }
    if (_pickMode === "point") _stopPickMode();
    // Region mode stays active for re-drag
    _drawCrosshair(e.clientX, e.clientY, _pickedRadius, false);
}

function _pickEscape(e) {
    if (e.key === "Escape") _stopPickMode();
}

function _startPickMode(mode) {
    _pickMode = mode || "point";
    _pickActive = true;
    _isDragging = false;
    _dragStartX = null;

    const canvas = document.getElementById("se-canvas");
    if (!canvas) { alert("Editor canvas (#se-canvas) not found. Make sure the scenario editor is open."); _pickActive=false; return; }

    canvas.addEventListener("mousemove",  _pickMouseMove);
    canvas.addEventListener("mousedown",  _pickMouseDown);
    canvas.addEventListener("mouseup",    _pickMouseUp);
    document.addEventListener("keydown",  _pickEscape);
    canvas.style.cursor = "crosshair";
}

function _updatePickResult() {
    const res = document.getElementById("sep-coord-result");
    if (!res) return;
    const x = parseInt(document.getElementById("sep-coord-x")?.value)||0;
    const y = parseInt(document.getElementById("sep-coord-y")?.value)||0;
    const r = parseInt(document.getElementById("sep-coord-r")?.value)||0;
    const mode = document.getElementById("sep-coord-mode")?.value || "point";
    let txt = "";
    if (mode === "region")   txt = `x: ${x}, y: ${y}, radius: ${r}`;
    else if (mode === "npc") txt = `x: ${x}, y: ${y}`;
    else                     txt = `x: ${x}, y: ${y}`;
    res.value = txt;
    // Redraw crosshair at last screen position if editor state is known
    const cam = _cam();
    if (cam) {
        const sx = (x - cam.x) * cam.zoom;
        const sy = (y - cam.y) * cam.zoom;
        const canvas = document.getElementById("se-canvas");
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            _drawCrosshair(rect.left + sx, rect.top + sy, r > 0 ? r : null, false);
        }
    }
}

function openCoordPicker() {
    _ensureCSS3();
    const {body} = _panel3("sep-coords","🎯 Visual Coord Picker",420,400);

    // Mode selector
    const modeRow = document.createElement("div");
    modeRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:10px;";
    const modeLabel = document.createElement("span");
    modeLabel.style.cssText = `font-size:11px;color:${T.dim};`;
    modeLabel.textContent = "Mode:";
    const modeSel = document.createElement("select");
    modeSel.id = "sep-coord-mode";
    modeSel.className = "sep3-inp";
    [["point","📍 Point  (x, y)"],["region","⭕ Region  (x, y, radius)"],["npc","🧍 NPC Waypoint  (x, y)"]].forEach(([v,l])=>{
        const o=document.createElement("option"); o.value=v; o.textContent=l; modeSel.appendChild(o);
    });
    modeRow.appendChild(modeLabel);
    modeRow.appendChild(modeSel);
    body.appendChild(modeRow);

    // Pick buttons
    const pickRow = document.createElement("div");
    pickRow.style.cssText = "display:flex;gap:6px;margin-bottom:12px;align-items:center;flex-wrap:wrap;";

    const pickBtn = _btn3("🎯 Pick on Map","act",()=>{
        _startPickMode(modeSel.value);
        pickBtn.textContent="🔴 Picking…  (ESC to cancel)";
        pickBtn.className = "sep3-btn dan";
        const restore = ()=>{
            pickBtn.textContent="🎯 Pick on Map";
            pickBtn.className="sep3-btn act";
        };
        // Watch for stop
        const watcher = setInterval(()=>{
            if(!_pickActive){ clearInterval(watcher); restore(); }
        },200);
        setTimeout(()=>{ clearInterval(watcher); restore(); }, 60000);
    });

    const cancelBtn = _btn3("✕ Cancel","",()=>{ _stopPickMode(); });
    cancelBtn.title = "Stop pick mode (also: Escape key)";

    pickRow.appendChild(pickBtn);
    pickRow.appendChild(cancelBtn);

    const liveWrap = document.createElement("div");
    liveWrap.style.cssText = `font-size:11px;color:${T.dim};margin-left:6px;`;
    liveWrap.innerHTML = `Cursor: <span id="sep-coord-live" style="color:${T.accent};font-family:${T.mono};">—</span>`;
    pickRow.appendChild(liveWrap);
    body.appendChild(pickRow);

    // Coord fields
    const coordSec = document.createElement("div");
    coordSec.className = "sep3-sec";
    coordSec.innerHTML = `
        <div class="sep3-sec-title">COORDINATES</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
            <div>
                <label style="display:block;font-size:10px;color:${T.dim};margin-bottom:2px;">WORLD X</label>
                <input type="number" id="sep-coord-x" class="sep3-inp" value="${_pickedX||2000}" style="width:100%;">
            </div>
            <div>
                <label style="display:block;font-size:10px;color:${T.dim};margin-bottom:2px;">WORLD Y</label>
                <input type="number" id="sep-coord-y" class="sep3-inp" value="${_pickedY||1500}" style="width:100%;">
            </div>
            <div>
                <label style="display:block;font-size:10px;color:${T.dim};margin-bottom:2px;">RADIUS <span id="sep-coord-live-r" style="color:${T.accent}"></span></label>
                <input type="number" id="sep-coord-r" class="sep3-inp" value="${_pickedRadius||400}" style="width:100%;">
            </div>
        </div>
    `;
    body.appendChild(coordSec);

    ["sep-coord-x","sep-coord-y","sep-coord-r"].forEach(id=>{
        const el = coordSec.querySelector("#"+id);
        if(el) el.oninput = _updatePickResult;
    });

    // Result / copy
    const resultSec = document.createElement("div");
    resultSec.className = "sep3-sec";
    resultSec.innerHTML = `<div class="sep3-sec-title">COPY AS TRIGGER PARAM</div>`;

    const resultTa = document.createElement("textarea");
    resultTa.id = "sep-coord-result";
    resultTa.className = "sep3-inp";
    resultTa.rows = 2;
    resultTa.readOnly = true;
    resultTa.style.cssText = "width:100%;resize:none;font-family:"+T.mono+";color:"+T.accent+";";
    resultSec.appendChild(resultTa);

    const copyRow = document.createElement("div");
    copyRow.style.cssText = "display:flex;gap:6px;margin-top:6px;";

    const copyXYBtn = _btn3("Copy x,y","",()=>{
        const x=document.getElementById("sep-coord-x")?.value||0;
        const y=document.getElementById("sep-coord-y")?.value||0;
        _clip(`x: ${x}, y: ${y}`, copyXYBtn);
    });
    const copyAllBtn = _btn3("Copy x,y,radius","",()=>{
        const x=document.getElementById("sep-coord-x")?.value||0;
        const y=document.getElementById("sep-coord-y")?.value||0;
        const r=document.getElementById("sep-coord-r")?.value||0;
        _clip(`x: ${x}, y: ${y}, radius: ${r}`, copyAllBtn);
    });
    const showBtn = _btn3("📍 Show on Map","gold",()=>{
        _updatePickResult();
    });
    copyRow.appendChild(copyXYBtn);
    copyRow.appendChild(copyAllBtn);
    copyRow.appendChild(showBtn);
    resultSec.appendChild(copyRow);
    body.appendChild(resultSec);

    const note = document.createElement("div");
    note.className = "sep3-note";
    note.innerHTML =
        `💡 <strong>Point mode</strong>: single click to lock coords. ` +
        `<strong>Region mode</strong>: click-drag to set center + radius (matches <code>player_in_region</code>). ` +
        `Press <kbd>ESC</kbd> to exit pick mode. Values write directly into the fields above — ` +
        `copy them into the Trigger Editor's param inputs.`;
    body.appendChild(note);

    _updatePickResult();
}

function _clip(text, btn) {
    try {
        navigator.clipboard.writeText(text);
        const orig = btn.textContent;
        btn.textContent = "✓ Copied!";
        setTimeout(()=>{btn.textContent=orig;},1800);
    } catch(e) {
        prompt("Copy this:", text);
    }
}

// ============================================================================
// ████████████████████████ 3B — ES6+ JS EXPORT ███████████████████████████████
// ============================================================================
//
// Generates a clean ES6+ scenario module file covering all scenario fields:
//   triggers, importantNpcs, playerSetup, movies, parlerLines, storyQuests,
//   startingNpcBans, proceduralAITendency, scenarioVars, winLose,
//   factions, cities, initialDiplomacy
//
// Each trigger becomes a named const with inline action/condition labels.
// ============================================================================

function _triggerToES6(t, condCatalog, actCatalog) {
    const condLines = (t.conditions||[]).map(c=>{
        const def = condCatalog[c.type];
        const lbl = def ? def.label : c.type;
        return `    // CONDITION: ${lbl}\n    ${_jsVal(c)}`;
    }).join(",\n");

    const actLines = (t.actions||[]).map(a=>{
        const def = actCatalog[a.type];
        const lbl = def ? def.label : a.type;
        return `    // ACTION: ${lbl}\n    ${_jsVal(a)}`;
    }).join(",\n");

    const safeName = (t.id||"trigger")
        .replace(/[^a-zA-Z0-9_]/g,"_")
        .replace(/^(\d)/,"T_$1");

    return (
        `// ── ${t.name||t.id||"Trigger"} ` + "─".repeat(Math.max(0,56-(t.name||t.id||"Trigger").length)) + "\n" +
        `const TRIG_${safeName} = {\n` +
        `  id:           ${JSON.stringify(t.id||"")},\n` +
        `  name:         ${JSON.stringify(t.name||"")},\n` +
        `  enabled:      ${t.enabled!==false},\n` +
        `  once:         ${t.once!==false},\n` +
        `  activatedBy:  ${t.activatedBy ? JSON.stringify(t.activatedBy) : "null"},\n` +
        `  conditions: [\n${condLines||"    // (always fires)"}\n  ],\n` +
        `  actions: [\n${actLines||"    // (no actions)"}\n  ]\n` +
        `};\n`
    );
}

function _jsVal(obj) {
    return JSON.stringify(obj, null, 2)
        .split("\n").join("\n    ");
}

function _esc3(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

function _buildES6Export(s) {
    const safeName = ((s.meta?.name||"MyScenario").replace(/[^a-zA-Z0-9]/g,""))||"MyScenario";
    const date = new Date().toISOString();
    const cats = window.ScenarioTriggers?.getCatalogs?.() || {conditions:{},actions:{}};
    const condCat = cats.conditions || {};
    const actCat  = cats.actions    || {};

    const trigBlocks = (s.triggers||[])
        .map(t => _triggerToES6(t, condCat, actCat))
        .join("\n");

    const trigArray = (s.triggers||[]).map(t=>{
        const safeName = (t.id||"t").replace(/[^a-zA-Z0-9_]/g,"_").replace(/^(\d)/,"T_$1");
        return `  TRIG_${safeName}`;
    }).join(",\n");

    const otherFields = JSON.stringify({
        meta:                 s.meta,
        playerSetup:          s.playerSetup,
        importantNpcs:        s.importantNpcs,
        movies:               s.movies,
        storyIntro:           s.storyIntro,
        parlerLines:          s.parlerLines,
        storyQuests:          s.storyQuests,
        startingNpcBans:      s.startingNpcBans,
        proceduralAITendency: s.proceduralAITendency,
        scenarioVars:         s.scenarioVars,
        winLose:              s.winLose,
        initialDiplomacy:     s.initialDiplomacy,
        timeline:             s.timeline,
        factions:             s.factions,
        cities:               s.cities
    }, null, 2);

    return (
`// ${"=".repeat(78)}
// ${s.meta?.name||"Custom Scenario"} — ES6+ export
// Author : ${s.meta?.author||"Unknown"}
// Desc   : ${(s.meta?.description||"").slice(0,80)}
// Date   : ${date}
// Tool   : ScenarioEditorPatch v${window.ScenarioEditorPatch?.VERSION||"?"} Phase 3B
// ${"=".repeat(78)}
//
// Drop this after scenario_triggers.js in your index.html, then call:
//   window.${safeName}.install();
//
// All triggers, story data, parler lines, quest catalog, spawn bans,
// movies, player setup, and world configuration are included.
// ${"=".repeat(78)}

"use strict";

// ${"─".repeat(78)}
// TRIGGERS  (${(s.triggers||[]).length} total)
// Each trigger is a named const for readability and IDE type-hints.
// ${"─".repeat(78)}

${trigBlocks||"// (no triggers defined)\n"}

// ${"─".repeat(78)}
// SCENARIO DATA  (all fields)
// ${"─".repeat(78)}

const _SCENARIO_DATA = ${otherFields};

// ${"─".repeat(78)}
// MODULE
// ${"─".repeat(78)}

window.${safeName} = (function () {

  const triggers = [
${trigArray||"    // (none)"}
  ];

  function install(scenarioDoc) {
    const s = scenarioDoc
      || window.__activeScenario
      || (window.ScenarioEditor && window.ScenarioEditor._state?.scenario);

    if (!s) {
      console.warn("[${safeName}] No active scenario found — pass a scenario doc to install(scenarioDoc).");
      return;
    }

    // ── Triggers ────────────────────────────────────────────────────────────
    s.triggers = (s.triggers || []).concat(triggers);

    // ── Important NPCs ───────────────────────────────────────────────────────
    if (Array.isArray(_SCENARIO_DATA.importantNpcs) && _SCENARIO_DATA.importantNpcs.length)
      s.importantNpcs = (s.importantNpcs || []).concat(_SCENARIO_DATA.importantNpcs);

    // ── Player setup ─────────────────────────────────────────────────────────
    if (_SCENARIO_DATA.playerSetup)
      s.playerSetup = Object.assign(s.playerSetup || {}, _SCENARIO_DATA.playerSetup);

    // ── Movies (cinematics) ──────────────────────────────────────────────────
    if (Array.isArray(_SCENARIO_DATA.movies) && _SCENARIO_DATA.movies.length)
      s.movies = _SCENARIO_DATA.movies;

    // ── Parler lines ─────────────────────────────────────────────────────────
    if (_SCENARIO_DATA.parlerLines && typeof _SCENARIO_DATA.parlerLines === "object")
      s.parlerLines = Object.assign(s.parlerLines || {}, _SCENARIO_DATA.parlerLines);

    // ── Story quests ──────────────────────────────────────────────────────────
    if (Array.isArray(_SCENARIO_DATA.storyQuests) && _SCENARIO_DATA.storyQuests.length)
      s.storyQuests = _SCENARIO_DATA.storyQuests;

    // ── Spawn bans ────────────────────────────────────────────────────────────
    if (_SCENARIO_DATA.startingNpcBans)
      s.startingNpcBans = _SCENARIO_DATA.startingNpcBans;

    // ── Procedural AI tendency ───────────────────────────────────────────────
    if (_SCENARIO_DATA.proceduralAITendency)
      s.proceduralAITendency = Object.assign(
        s.proceduralAITendency || {}, _SCENARIO_DATA.proceduralAITendency);

    // ── Scenario vars ────────────────────────────────────────────────────────
    if (_SCENARIO_DATA.scenarioVars)
      s.scenarioVars = Object.assign(s.scenarioVars || {}, _SCENARIO_DATA.scenarioVars);

    // ── Win / lose ────────────────────────────────────────────────────────────
    if (_SCENARIO_DATA.winLose)
      s.winLose = _SCENARIO_DATA.winLose;

    // ── Timeline ──────────────────────────────────────────────────────────────
    if (Array.isArray(_SCENARIO_DATA.timeline) && _SCENARIO_DATA.timeline.length)
      s.timeline = _SCENARIO_DATA.timeline;

    // ── Start the trigger engine if available ────────────────────────────────
    if (window.ScenarioTriggers?.start) {
      window.ScenarioTriggers.start(s);
    }

    console.log("[${safeName}] install() complete — " + triggers.length + " trigger(s) loaded.");
  }

  // Auto-install when the game boots if this is a standalone include
  if (document.readyState === "complete") {
    // Page already loaded — install immediately if a scenario is active
    if (window.__activeScenario) install(window.__activeScenario);
  } else {
    window.addEventListener("load", () => {
      if (window.__activeScenario) install(window.__activeScenario);
    });
  }

  return { install, triggers, data: _SCENARIO_DATA };

})();
`);
}

function openJsExport() {
    _ensureCSS3();
    const s = _s();
    if (!s) { alert("No active scenario. Open a scenario first."); return; }

    const {body} = _panel3("sep-jsexport","📤 ES6+ Scenario Export",680,560);
    body.style.padding = "10px";

    const desc = document.createElement("div");
    desc.style.cssText = `color:${T.dim};font-size:11px;margin-bottom:8px;line-height:1.6;`;
    desc.innerHTML =
        `Exports the full scenario as a clean ES6+ module. ` +
        `Triggers become named <code style="color:${T.blue}">const TRIG_…</code> with inline labels. ` +
        `All patch fields included: parlerLines, storyQuests, startingNpcBans, movies, etc.`;
    body.appendChild(desc);

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;align-items:center;";

    const genBtn = _btn3("⚙ Generate","pri",()=>{
        const code = _buildES6Export(s);
        ta.value = code;
        lineCount.textContent = code.split("\n").length + " lines";
    });
    const copyBtn = _btn3("⎘ Copy","",()=>{
        if(!ta.value) ta.value = _buildES6Export(s);
        _clip(ta.value, copyBtn);
    });
    const dlBtn = _btn3("💾 Download .js","gold",()=>{
        if(!ta.value) ta.value = _buildES6Export(s);
        const safeName = ((s.meta?.name||"scenario").replace(/[^a-zA-Z0-9_]/g,"_"))||"scenario";
        const blob = new Blob([ta.value],{type:"text/javascript"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href=url; a.download=safeName+"_es6.js";
        document.body.appendChild(a); a.click();
        setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},100);
    });
    const lineCount = document.createElement("span");
    lineCount.style.cssText = `color:${T.dim};font-size:10px;margin-left:6px;`;

    btnRow.appendChild(genBtn);
    btnRow.appendChild(copyBtn);
    btnRow.appendChild(dlBtn);
    btnRow.appendChild(lineCount);
    body.appendChild(btnRow);

    const ta = document.createElement("textarea");
    ta.className = "sep3-code";
    ta.style.height = "420px";
    ta.spellcheck = false;
    body.appendChild(ta);

    // Auto-generate on open
    const code = _buildES6Export(s);
    ta.value = code;
    lineCount.textContent = code.split("\n").length + " lines";
}

// ============================================================================
// ███████████████████████████ 3C — FAQ / HELP ████████████████████████████████
// ============================================================================

function openFaq() {
    _ensureCSS3();
    const {body} = _panel3("sep-faq","❓ Scenario Editor Patch — FAQ & Help",640,580);
    body.style.padding = "0";
    body.style.overflow = "hidden";
    body.style.display = "flex";
    body.style.flexDirection = "column";

    // Section tabs
    const TABS = ["Overview","1A Parler","1B Quests","1C Spawn Bans","2A Walls","2B Movies","3A Coords","3B Export","Runtime Notes"];
    const tabBar = document.createElement("div");
    tabBar.style.cssText = `background:${T.bar};border-bottom:1px solid ${T.border};padding:4px 8px;display:flex;flex-wrap:wrap;gap:2px;flex-shrink:0;`;

    const content = document.createElement("div");
    content.style.cssText = "flex:1;overflow:auto;padding:14px 16px;";
    content.className = "sep3-faq";

    let _activeTab = "Overview";

    const CONTENT = {
        "Overview": `
<h3>Scenario Editor Patch — All 7 Tools</h3>
<p>This patch adds seven new editing tools to the Scenario Editor <strong>🛠 Tools ▾</strong> menu without modifying any existing game files. Load after your other scenario scripts:</p>
<pre style="background:#0d1520;padding:8px;border-radius:3px;font-size:11px;color:#80cbc4;overflow:auto;">&lt;script src="story/scenario_editor_patch_p1.js"&gt;&lt;/script&gt;
&lt;script src="story/scenario_editor_patch_p2.js"&gt;&lt;/script&gt;
&lt;script src="story/scenario_editor_patch_p3.js"&gt;&lt;/script&gt;</pre>
<h4>Tool Summary</h4>
<ul>
  <li><strong>🗨 Parler Lines</strong> — per-role NPC dialogue overrides (Phase 1A)</li>
  <li><strong>📜 Quest Manager</strong> — CRUD editor for storyQuests[] (Phase 1B)</li>
  <li><strong>🚫 Spawn Bans & AI Rates</strong> — startingNpcBans + spawn rate sliders (Phase 1C)</li>
  <li><strong>🏰 City Wall Overrides</strong> — force walls on/off per city (Phase 2A)</li>
  <li><strong>🎬 Movies Editor</strong> — standalone cinematic editor with URL art + wrap-fades (Phase 2B)</li>
  <li><strong>🎯 Visual Coord Picker</strong> — click-to-pick world coordinates from the map (Phase 3A)</li>
  <li><strong>📤 ES6+ JS Export</strong> — full scenario export with named trigger consts (Phase 3B)</li>
</ul>
<div class="tip">All tools read/write directly to the live scenario document. No save-and-reload needed for most changes.</div>
<div class="warn">⚠ <code>_restoreScenarioFromCompact()</code> in scenario_editor.js does <em>not</em> include <code>startingNpcBans</code>. If you use the editor's own Load flow, this field will reset to empty. Add it to the compact restore manually, or set bans via a trigger action at runtime.</div>`,

        "1A Parler": `
<h3>🗨 Parler Lines Editor</h3>
<p>Overrides <code>RandomDialogue.generateHello()</code> per NPC role. When a bucket has entries, a random line is returned instead of the default.</p>
<h4>Roles</h4>
<ul><li>Civilian · Patrol · Military · Trader · Bandit · Special</li></ul>
<h4>Tokens</h4>
<ul>
  <li><code>[faction]</code> — the NPC's faction name</li>
  <li><code>[playerFaction]</code> — the player's faction</li>
  <li><code>[troops]</code> — NPC's troop count (from opts.npcNumbers)</li>
</ul>
<h4>How it works</h4>
<p>The runtime hook wraps <code>window.RandomDialogue.generateHello</code>. If the scenario's parlerLines bucket for the NPC's role is non-empty, a random line from that bucket is picked and tokens are replaced. Otherwise, control falls through to the original RandomDialogue logic.</p>
<div class="tip">Click "Add Samples" to populate a role with historically-appropriate starter lines. Edit or delete freely.</div>
<div class="warn">The hook polls for RandomDialogue every 600ms. If RandomDialogue loads after this script, the hook still applies. Check the console for: <em>[SEP] RandomDialogue.generateHello hooked — parlerLines active.</em></div>`,

        "1B Quests": `
<h3>📜 Quest Manager</h3>
<p>Full CRUD editor for <code>scenario.storyQuests[]</code> — the catalog of named quests that can be activated by triggers at runtime.</p>
<h4>Quest fields</h4>
<ul>
  <li><strong>id</strong> — unique string, used by <code>story_quest_set</code> and <code>story_quest_complete</code> trigger actions</li>
  <li><strong>title</strong> — shown in the quest banner header</li>
  <li><strong>description</strong> — shown as banner subtext</li>
  <li><strong>x, y, radius</strong> — world pixel coords for arrive detection</li>
  <li><strong>triggerOnArrive</strong> — trigger ID to fire when player enters radius</li>
  <li><strong>varOnArrive</strong> — <code>varName=value</code> to set when player arrives</li>
  <li><strong>isMain ⭐</strong> — highlights the quest in the UI</li>
  <li><strong>autoActivate</strong> — makes the quest active at scenario boot</li>
  <li><strong>dependsOn</strong> — another quest ID that must complete first</li>
</ul>
<h4>Activating a quest at runtime</h4>
<p>Use the trigger action <code>story_quest_set</code> with <code>{ id: "your_quest_id" }</code> to show the quest banner and start arrive-detection.</p>`,

        "1C Spawn Bans": `
<h3>🚫 Spawn Bans & AI Rates</h3>
<p>Controls which factions/roles spawn procedurally at scenario start.</p>
<h4>Role Bans — <code>scenario.startingNpcBans.roles[]</code></h4>
<p>Checked roles won't spawn procedurally for any faction. Story-spawned NPCs (via <code>spawn_important_npc</code>) are never affected.</p>
<h4>Faction Bans — <code>scenario.startingNpcBans.factions[]</code></h4>
<p>Checked factions won't spawn any procedural NPCs (Commerce, Patrol, Military, Civilian) for the entire session.</p>
<h4>AI Rate Multipliers — <code>scenario.proceduralAITendency[faction].rate</code></h4>
<p>Per-faction slider from 0× (effectively disabled) to 3× (triple spawn rate). 1.0× = default.</p>
<div class="warn">As noted in Overview: <code>_restoreScenarioFromCompact()</code> doesn't persist <code>startingNpcBans</code>. Use the <code>set_npc_spawn_ban</code> trigger action as a runtime fallback.</div>`,

        "2A Walls": `
<h3>🏰 City Wall Overrides</h3>
<p>Controls whether each city generates with stone walls (city) or the village layout when entered.</p>
<h4>How walls are decided (default)</h4>
<p>In <code>sandboxmode_npc_system.js</code>, cities with population below a random threshold (3000–5000) are flagged <code>isVillage=true</code> and get no walls. Above the threshold, they get walls.</p>
<h4>Override options</h4>
<ul>
  <li><strong>⚙ Default</strong> — auto from population (removes the override)</li>
  <li><strong>🏰 Force Walls</strong> — sets <code>city.isVillage = false</code></li>
  <li><strong>🌾 Force Village</strong> — sets <code>city.isVillage = true</code></li>
</ul>
<h4>Runtime hook</h4>
<p>A hook on <code>window.enterCity</code> re-applies the override every time the player enters, so it survives saves and reloads.</p>
<div class="tip">After changing a city's override, re-enter the city to see the new layout. The city interior is cached per-faction, so the first re-entry regenerates it.</div>`,

        "2B Movies": `
<h3>🎬 Movies Editor</h3>
<p>Standalone editor for <code>scenario.movies[]</code>. <code>movies[0]</code> plays at scenario boot; others are triggered via <code>play_movie</code>.</p>
<h4>Item types</h4>
<ul>
  <li><strong>Fade</strong> — fade-in or fade-out over N milliseconds</li>
  <li><strong>Title</strong> — full-screen title card with title, subtitle, hold duration</li>
  <li><strong>Art</strong> — image display with URL/file input, ken-burns, caption, hold duration</li>
  <li><strong>Dialogue</strong> — dialogue card: speaker, text, side, portrait URL/file, color, narrator mode</li>
</ul>
<h4>🎞 Wrap Art with Fades</h4>
<p>One-click inserts <code>fade-out (900ms)</code> before and <code>fade-in (900ms)</code> after every Art item that isn't already bordered by matching fades. This prevents hard-cuts between images.</p>
<h4>Art URL vs file upload</h4>
<p>Art and portrait fields accept either a URL/path relative to the game root (e.g. <code>art/story1/scene.jpg</code>) or a file upload that embeds as a base64 data URI. URLs are smaller; base64 is self-contained.</p>
<div class="tip">This panel covers the same data as the Trigger Editor's <em>Story</em> tab — they read/write the same <code>scenario.movies[]</code>. Use either; they stay in sync.</div>`,

        "3A Coords": `
<h3>🎯 Visual Coord Picker</h3>
<p>Click anywhere on the editor map to pick exact world coordinates, without needing to manually read pixel values.</p>
<h4>Modes</h4>
<ul>
  <li><strong>📍 Point</strong> — single click → locks x, y. Use for <code>set_player_pos</code> and <code>set_npc_waypoint</code></li>
  <li><strong>⭕ Region</strong> — click-drag → sets center x, y and radius from drag distance. Use for <code>player_in_region</code></li>
  <li><strong>🧍 NPC Waypoint</strong> — same as Point but labeled for NPC use</li>
</ul>
<h4>Workflow</h4>
<ol>
  <li>Select mode, click <strong>🎯 Pick on Map</strong></li>
  <li>Hover to preview live coords (shown in gold above the buttons)</li>
  <li>Click (or drag for region) to lock the coordinates</li>
  <li>Click <strong>Copy x,y</strong> or <strong>Copy x,y,radius</strong></li>
  <li>Paste into the Trigger Editor's param fields</li>
  <li>Press <kbd>ESC</kbd> or the Cancel button to exit pick mode</li>
</ol>
<p>A blue crosshair SVG overlay is drawn on the canvas showing the picked position. For region mode, a dashed circle shows the radius at the map's current zoom level.</p>`,

        "3B Export": `
<h3>📤 ES6+ JS Export</h3>
<p>Exports the complete scenario as a clean, self-contained ES6+ module.</p>
<h4>What's exported</h4>
<ul>
  <li>Every trigger → a named <code>const TRIG_myTrigger = { … }</code> with inline condition/action label comments</li>
  <li>All scenario data fields: importantNpcs, playerSetup, movies, parlerLines, storyQuests, startingNpcBans, proceduralAITendency, scenarioVars, winLose, factions, cities, initialDiplomacy, timeline</li>
</ul>
<h4>Using the output</h4>
<p>Drop the file after your other scenario scripts. Call <code>window.MyScenario.install()</code> to merge everything into the active scenario. The auto-install stub at the bottom fires immediately if a scenario is already running, or on <code>window.load</code> otherwise.</p>
<div class="tip">Trigger condition and action labels come from <code>ScenarioTriggers.getCatalogs()</code>, so they're always accurate even if new trigger types have been added.</div>`,

        "Runtime Notes": `
<h3>Runtime Hooks Active After Loading Patch</h3>
<p>Three hooks are installed automatically:</p>
<h4>1. RandomDialogue.generateHello (Parler Lines)</h4>
<p>Wraps the function to check <code>scenario.parlerLines[role][]</code> first. Falls through to original if empty. Hook confirmed by: <em>[SEP] RandomDialogue.generateHello hooked</em></p>
<h4>2. window.enterCity (Wall Overrides)</h4>
<p>Re-applies <code>city.wallOverride</code> → <code>city.isVillage</code> before calling <code>generateCity</code>. Hook confirmed by: <em>[SEP] enterCity hooked — wallOverride applied on city entry</em></p>
<h4>3. Menu injection</h4>
<p>Polls for <code>#se-menu-title</code> every 650ms. Injects 🛠 Tools ▾ dropdown into the menubar when the editor opens. Re-injects if the editor is closed and reopened.</p>
<h4>Schema fields written by this patch</h4>
<ul>
  <li><code>scenario.parlerLines</code> — <code>{ Civilian:[], Patrol:[], Military:[], Trader:[], Bandit:[], Special:[] }</code></li>
  <li><code>scenario.storyQuests</code> — <code>[]</code></li>
  <li><code>scenario.startingNpcBans</code> — <code>{ factions:[], roles:[] }</code></li>
  <li><code>scenario.proceduralAITendency</code> — <code>{ [faction]: { rate:1.0 } }</code></li>
  <li><code>city.wallOverride</code> — <code>"default" | "walls" | "noWalls"</code></li>
  <li><code>city.isVillage</code> — written immediately on override selection</li>
</ul>
<div class="warn">⚠ <code>scenario.parlerLines</code>, <code>scenario.storyQuests</code>, and <code>scenario.startingNpcBans</code> are already in the scenario schema (scenario_editor.js v3). The patch does NOT add new schema fields — it only adds UI for fields that existed but had no editor.</div>`
    };

    function _renderTab(name) {
        _activeTab = name;
        content.innerHTML = `<div class="sep3-faq">${CONTENT[name]||"<p>No content.</p>"}</div>`;
        tabBar.querySelectorAll(".sep3-faq-tab").forEach(b=>{
            b.style.borderBottomColor = b.dataset.tab === name ? T.accent : "transparent";
            b.style.color = b.dataset.tab === name ? T.accent : T.dim;
        });
    }

    TABS.forEach(name=>{
        const btn = document.createElement("button");
        btn.className = "sep3-btn sep3-faq-tab";
        btn.dataset.tab = name;
        btn.textContent = name;
        btn.style.cssText += `border-radius:3px 3px 0 0;border-bottom:2px solid transparent;padding:4px 9px;`;
        btn.onclick = ()=>_renderTab(name);
        tabBar.appendChild(btn);
    });

    body.appendChild(tabBar);
    body.appendChild(content);
    _renderTab("Overview");
}

// ============================================================================
// ████████████████████ UPDATE MENU — ADD P3 ITEMS ████████████████████████████
// ============================================================================

function _upgradeMenuP3() {
    const dd = document.querySelector("#sep-tools-wrap > div:last-child");
    if (!dd) return false;

    // Remove Phase 3 placeholder
    dd.querySelectorAll("div").forEach(el => {
        if (el.textContent && el.textContent.includes("Visual Coord Picker") && el.textContent.includes("coming next")) {
            el.remove();
        }
    });

    let p3Header = null;
    dd.querySelectorAll("div").forEach(el => {
        if (el.textContent && el.textContent.trim() === "Phase 3 — Export & Targeting") p3Header = el;
    });
    if (!p3Header) return false;

    function _mi(emoji, label, desc, fn) {
        const item = document.createElement("div");
        item.style.cssText = `
            padding:5px 14px 5px 12px;cursor:pointer;color:#cfd8dc;
            border-bottom:1px solid #1a2538;font-size:12px;
            font-family:Tahoma,Verdana,sans-serif;
        `;
        item.innerHTML = `<span style="font-size:13px;">${emoji}</span>&nbsp;${label}` +
            (desc?`<div style="color:#4a6080;font-size:10px;margin-top:1px;">${desc}</div>`:"");
        item.onmouseenter=()=>{item.style.background="#1e4a7a";item.style.color="#fff";};
        item.onmouseleave=()=>{item.style.background="none";item.style.color="#cfd8dc";};
        item.onclick=()=>{dd.style.display="none";fn();};
        return item;
    }

    function _insertAfter(ref, newEl) { ref.parentNode.insertBefore(newEl, ref.nextSibling); }

    const faqItem    = _mi("❓","FAQ & Help",              "Reference for all 7 patch tools",          openFaq);
    const exportItem = _mi("📤","ES6+ JS Export",           "Full scenario module with named triggers",  openJsExport);
    const coordItem  = _mi("🎯","Visual Coord Picker",      "Click map to pick world coordinates",       openCoordPicker);

    _insertAfter(p3Header, faqItem);
    _insertAfter(p3Header, exportItem);
    _insertAfter(p3Header, coordItem);

    return true;
}

(function _pollP3() {
    const id = setInterval(()=>{
        if (document.getElementById("sep-tools-wrap")) {
            if (_upgradeMenuP3()) clearInterval(id);
        }
    }, 750);
})();

// ── Expose ────────────────────────────────────────────────────────────────────
const p = window.ScenarioEditorPatch;
p.openCoordPicker = openCoordPicker;
p.openJsExport    = openJsExport;
p.openFaq         = openFaq;
p.VERSION_P3      = "3.0.0";

})();

console.log("[ScenarioEditorPatch] Phase 3 (3A · 3B · 3C) loaded — all 7 tools active.");