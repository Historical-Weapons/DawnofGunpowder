// how to shrink all units to fit the screen for a stadard laptop; but still have a scroll bar just in case // menu-units-guide.js
(function () {
  if (window.__unitsGuideInstalled) return;
  window.__unitsGuideInstalled = true;

  const STAT_ORDER = [
    "weightClass",
    "isRanged",
    "ammo",
    "health",
    "meleeAttack",
    "meleeDefense",
    "missileBaseDamage",
    "missileAPDamage",
    "accuracy",
    "armor",
    "bonusVsLarge",
    "speed",
    "range",
    "morale",
    "cost"
  ];

  const STAT_LABELS = {
    weightClass: "Weight",
    isRanged: "Ranged",
    ammo: "Ammo",
    health: "Health",
    meleeAttack: "Melee Atk",
    meleeDefense: "Melee Def",
    missileBaseDamage: "Missile Dmg",
    missileAPDamage: "AP Dmg",
    accuracy: "Accuracy",
    armor: "Armor",
    bonusVsLarge: "Bonus vs Large",
    speed: "Moving Speed",
    range: "Effective Range (m)",
    morale: "Morale",
    cost: "Cost"
  };

  function waitForElement(selector, cb, timeout = 20000) {
    const start = Date.now();
    const tick = () => {
      const el = document.querySelector(selector);
      if (el) return cb(el);
      if (Date.now() - start > timeout) return;
      requestAnimationFrame(tick);
    };
    tick();
  }

  function create(tag, style) {
    const el = document.createElement(tag);
    if (style) Object.assign(el.style, style);
    return el;
  }

function prettyValue(key, value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || typeof value === "undefined") return "—";

  if (typeof value === "number") {
    // 🎯 SPECIAL CASE: round range to nearest 5 meters
    if (key === "range") {
      return String(Math.round(value / 5) * 5);
    }

    return Number.isInteger(value)
      ? String(value)
      : value.toFixed(2).replace(/\.00$/, "");
  }

  return String(value);
}

  function makeStatGrid(stats) {
    const items = [];
    for (const key of STAT_ORDER) {
      if (!(key in stats)) continue;
      items.push(`
        <div style="display:flex; justify-content:space-between; gap:10px; padding:5px 8px; border:1px solid rgba(212,184,134,0.14); border-radius:6px; background:rgba(255,255,255,0.03);">
          <span style="color:#d4b886; font-weight:700; white-space:nowrap;">${STAT_LABELS[key]}</span>
          <span style="color:#fff; text-align:right; white-space:nowrap;">${prettyValue(key, stats[key])}</span>
        </div>
      `);
    }
    return items.join("");
  }

  function sizeCanvas(canvas, cssW, cssH) {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    return canvas.getContext("2d");
  }

  function drawGreenTerrain(ctx, w, h) {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#cbe9ff");
    sky.addColorStop(0.45, "#9ed38f");
    sky.addColorStop(1, "#3f7f36");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const hill1 = ctx.createLinearGradient(0, h * 0.35, 0, h);
    hill1.addColorStop(0, "rgba(104, 151, 71, 0.55)");
    hill1.addColorStop(1, "rgba(56, 102, 38, 0.95)");
    ctx.fillStyle = hill1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.58);
    ctx.quadraticCurveTo(w * 0.18, h * 0.42, w * 0.34, h * 0.58);
    ctx.quadraticCurveTo(w * 0.55, h * 0.79, w * 0.72, h * 0.58);
    ctx.quadraticCurveTo(w * 0.88, h * 0.46, w, h * 0.62);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (let i = 0; i < 22; i++) {
      const x = (i * w) / 21;
      const y = h * 0.62 + Math.sin(i * 0.75) * 4;
      ctx.fillRect(x, y, 1.5, 10 + (i % 5));
    }

    ctx.strokeStyle = "rgba(28, 82, 20, 0.25)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 28; i++) {
      const x = (i * w) / 27;
      ctx.beginPath();
      ctx.moveTo(x, h * 0.62);
      ctx.quadraticCurveTo(x + 4, h * 0.58 - (i % 3), x + 6, h * 0.62 + 12);
      ctx.stroke();
    }
  }

function resolvePreviewSpec(unit) {
  const name = (unit?.name || "").trim();
  const lower = name.toLowerCase();
  const stats = unit?.stats || {};
  const ammo = typeof stats.ammo === "number" ? stats.ammo : (typeof unit?.ammo === "number" ? unit.ammo : 0);

  // Special cases first
  if (lower === "bomb") {
    return { mode: "infantry", type: "bomb", ammo, zoom: 1.9, xBias: 0.48, yBias: 0.73 };
  }

  if (lower.includes("rocket") || lower.includes("hwacha")) {
    return { mode: "infantry", type: "rocket", ammo, zoom: 1.8, xBias: 0.47, yBias: 0.74 };
  }

  if (lower.includes("firelance")) {
    return { mode: "infantry", type: "firelance", ammo, zoom: 1.8, xBias: 0.47, yBias: 0.72 };
  }

  if (lower === "glaiveman" || lower.includes("glaive")) {
    return { mode: "infantry", type: "spearman", ammo, zoom: 1.75, xBias: 0.47, yBias: 0.72 };
  }

  if (lower.includes("repeater crossbowman")) {
    return { mode: "infantry", type: "crossbow", ammo, zoom: 1.75, xBias: 0.47, yBias: 0.72 };
  }

  if (lower.includes("heavy crossbowman")) {
    return { mode: "infantry", type: "crossbow", ammo, zoom: 1.78, xBias: 0.47, yBias: 0.72 };
  }

  if (lower.includes("crossbowman") || lower.includes("poison crossbowman")) {
    return { mode: "infantry", type: "crossbow", ammo, zoom: 1.72, xBias: 0.47, yBias: 0.72 };
  }

  if (lower.includes("hand cannoneer")) {
    return { mode: "infantry", type: "gun", ammo, zoom: 1.75, xBias: 0.47, yBias: 0.72 };
  }

  if (lower.includes("slinger") || lower.includes("javelinier")) {
    return { mode: "infantry", type: "throwing", ammo, zoom: 1.72, xBias: 0.47, yBias: 0.72 };
  }

  if (lower.includes("archer") && !lower.includes("horse")) {
    return { mode: "infantry", type: "archer", ammo, zoom: 1.72, xBias: 0.47, yBias: 0.72 };
  }

  if (lower.includes("shielded infantry")) {
    return { mode: "infantry", type: "sword_shield", ammo, zoom: 1.72, xBias: 0.47, yBias: 0.72 };
  }

  if (lower.includes("two handed")) {
    return { mode: "infantry", type: "two_handed", ammo, zoom: 1.74, xBias: 0.47, yBias: 0.72 };
  }

  if (lower.includes("spearman")) {
    return { mode: "infantry", type: "spearman", ammo, zoom: 1.72, xBias: 0.47, yBias: 0.72 };
  }

  if (lower === "militia") {
    return { mode: "infantry", type: "peasant", ammo, zoom: 1.72, xBias: 0.47, yBias: 0.72 };
  }

if (lower.includes("camel cannon")) {
  return { 
    mode: "cavalry",
    type: "camel",              // ✅ THIS is the mount
    subtype: "camel_cannon",    // ✅ weapon/platform
    ammo,
    zoom: 1.42,
    xBias: 0.44,
    yBias: 0.74
  };
}

  if (lower.includes("war elephant") || lower.includes("elephant")) {
    return { mode: "cavalry", type: "elephant", ammo, zoom: 1.22, xBias: 0.42, yBias: 0.76 };
  }

  if (lower.includes("keshig") || lower.includes("horse archer")) {
    return { mode: "cavalry", type: "horse_archer", ammo, zoom: 1.45, xBias: 0.44, yBias: 0.74 };
  }

  if (lower.includes("lancer")) {
    return { mode: "cavalry", type: "lancer", ammo, zoom: 1.45, xBias: 0.44, yBias: 0.74 };
  }

  // Fallback
  return {
    mode: unit?.mounted ? "cavalry" : "infantry",
    type: unit?.renderType || (unit?.mounted ? "lancer" : "peasant"),
    ammo,
    zoom: unit?.mounted ? 1.45 : 1.72,
    xBias: unit?.mounted ? 0.44 : 0.47,
    yBias: 0.72
  };
}

function renderPortrait(canvas, unit) {
  if (!canvas || !unit) return;
  const ctx = canvas.getContext("2d");

  const cssW = canvas.clientWidth || 480;
  const cssH = canvas.clientHeight || 280;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.max(1, Math.floor(cssW * dpr));
  canvas.height = Math.max(1, Math.floor(cssH * dpr));

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  // Green terrain background
  const sky = ctx.createLinearGradient(0, 0, 0, cssH);
  sky.addColorStop(0, "#d7f0c7");
  sky.addColorStop(0.48, "#8bc46a");
  sky.addColorStop(1, "#3f7f36");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cssW, cssH);

  ctx.fillStyle = "rgba(255,255,255,0.12)";
  for (let i = 0; i < 18; i++) {
    const x = (i * cssW) / 17;
    ctx.fillRect(x, cssH * 0.42 + Math.sin(i * 0.8) * 5, 2, 14 + (i % 6));
  }

  ctx.fillStyle = "rgba(55, 110, 40, 0.92)";
  ctx.beginPath();
  ctx.moveTo(0, cssH * 0.62);
  ctx.quadraticCurveTo(cssW * 0.20, cssH * 0.48, cssW * 0.38, cssH * 0.62);
  ctx.quadraticCurveTo(cssW * 0.58, cssH * 0.80, cssW * 0.78, cssH * 0.62);
  ctx.quadraticCurveTo(cssW * 0.90, cssH * 0.54, cssW, cssH * 0.65);
  ctx.lineTo(cssW, cssH);
  ctx.lineTo(0, cssH);
  ctx.closePath();
  ctx.fill();

  const spec = resolvePreviewSpec(unit);
  const factionColor = "#1976d2";

  // Bigger portrait scale, centered higher so the unit and stats feel balanced
  const baseX = cssW * spec.xBias;
  const baseY = cssH * spec.yBias;

  ctx.save();
  ctx.translate(baseX, baseY);
  ctx.scale(spec.zoom, spec.zoom);

  try {
    if (spec.mode === "cavalry" && typeof drawCavalryUnit === "function") {
      drawCavalryUnit(
        ctx,
        0,
        0,
        false,
        0,
        factionColor,
        false,
        spec.type,
        "player",
        unit.name,
        false,
        0,
        spec.ammo,
        { id: unit.name, lastAttackTime: 0, stats: unit.stats || {} },
        0
      );
    } else if (typeof drawInfantryUnit === "function") {
      drawInfantryUnit(
        ctx,
        0,
        0,
        false,
        0,
        factionColor,
        spec.type,
        false,
        "player",
        unit.name,
        false,
        0,
        spec.ammo,
        { id: unit.name, lastAttackTime: 0, stats: unit.stats || {} },
        0
      );
    } else {
      ctx.fillStyle = "#fff";
      ctx.font = "16px Georgia, serif";
      ctx.fillText("Render functions not loaded", 12, 20);
    }
  } catch (err) {
    console.warn("Unit portrait render failed:", unit.name, err);
    ctx.fillStyle = "#fff";
    ctx.font = "16px Georgia, serif";
    ctx.fillText("Render failed: " + unit.name, 12, 20);
  }

  ctx.restore();

  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(0, cssH - 34, cssW, 34);
  ctx.fillStyle = "#f5d76e";
  ctx.font = "700 13px Georgia, serif";
  ctx.fillText(`Preview: ${spec.mode} / ${spec.type}`, 12, cssH - 12);
}

function createUnitsGuide() {
  const existing = document.getElementById("units-guide-modal");
  if (existing) return existing;
  
  // ---> PULL DYNAMIC DATA HERE <---
  const liveUnitData = window.getEncyclopediaData();



  const modal = create("div", {
    position: "fixed",
    inset: "0",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.62)",
    zIndex: "99999",
    padding: "10px",
    boxSizing: "border-box"
  });
  modal.id = "units-guide-modal";
  
const panel = create("div", {
  position: "relative",
  /* SURGERY: Fluid clamping ensures it fits tiny laptops (85vh) down to phones */
  width: "clamp(320px, 85vw, 1000px)", 
  height: "clamp(400px, 85vh, 800px)",
  maxHeight: "95vh", /* Prevents vertical clipping */
  display: "flex",
  flexDirection: "row",
  background: "linear-gradient(180deg, rgba(28, 16, 16, 0.98), rgba(12, 10, 10, 0.98))",
  border: "2px solid #d4b886",
  borderRadius: "10px",
  boxShadow: "0 20px 60px rgba(0,0,0,0.85)",
  overflow: "hidden", // Inner children will handle their own scroll
  color: "#fff",
  fontFamily: "Georgia, serif",
  boxSizing: "border-box"
});

const left = create("div", {
  /* SURGERY: Uses flex percentages to yield space on laptops */
  flex: "0 0 30%",
  minWidth: "220px",
  maxWidth: "350px", 
  display: "flex",
  flexDirection: "column",
  borderRight: "1px solid rgba(212,184,134,0.28)",
  background: "rgba(255,255,255,0.02)"
});
left.id = "units-guide-left"; // Keep ID for CSS targeting

const right = create("div", {
  flex: "1", /* SURGERY: Dynamically fills remaining space */
  minWidth: "0",
  display: "flex",
  flexDirection: "column",
  gap: "8px", /* Tighter gap */
  padding: "10px",
  boxSizing: "border-box",
  position: "relative",
  overflowY: "auto" /* SURGERY: Master scrollbar for the right side just in case! */
});
right.id = "units-guide-right"; // Keep ID for CSS targeting
 

  const leftHeader = create("div", {
    padding: "14px 14px 10px 14px",
    borderBottom: "1px solid rgba(212,184,134,0.18)"
  });
  leftHeader.innerHTML = `
    <div style="font-size:24px; line-height:1; letter-spacing:2px; color:#f5d76e; font-weight:700;">UNITS</div>
    <div style="margin-top:6px; color:#d4b886; font-size:12px; line-height:1.35;">
      Tap a unit name to preview its portrait and stats.
    </div>
  `;

  const leftList = create("div", {
    flex: "1",
    overflowY: "auto",
    padding: "10px"
  });

  const rightTop = create("div", {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: "10px",
    alignItems: "start"
  });

  const titleWrap = create("div", {
    minWidth: "0"
  });
  titleWrap.innerHTML = `
    <div id="units-selected-name" style="font-size:24px; font-weight:700; color:#f5d76e; letter-spacing:1px; line-height:1.1;">Militia</div>
    <div id="units-selected-desc" style="margin-top:4px; color:#e8d9b6; font-size:13px; line-height:1.35;">Cheap starter infantry.</div>
  `;

  const renderTag = create("div", {
    padding: "8px 10px",
    borderRadius: "8px",
    border: "1px solid rgba(212,184,134,0.25)",
    background: "rgba(255,255,255,0.03)",
    color: "#d4b886",
    fontSize: "12px",
    whiteSpace: "nowrap",
    alignSelf: "start"
	
  });
  renderTag.textContent = "";
  renderTag.style.visibility = "hidden";

const portraitWrap = create("div", {
  /* SURGERY: Allows portrait to squish down safely without breaking layout */
  flex: "0 1 clamp(120px, 35vh, 300px)", 
  minHeight: "120px",
  background: "linear-gradient(180deg, #b9e0a7 0%, #7ab260 50%, #3f7f36 100%)",
  border: "1px solid rgba(212,184,134,0.34)",
  borderRadius: "8px",
  overflow: "hidden",
  position: "relative"
});
portraitWrap.id = "units-guide-portrait";
  
  const canvas = create("canvas", {
    display: "block",
    width: "100%",
    height: "100%"
  });
  portraitWrap.appendChild(canvas);

  const statsPanel = create("div", {
    flex: "1",
    minHeight: "0",
    display: "flex",
    flexDirection: "column",
    border: "1px solid rgba(212,184,134,0.18)",
    borderRadius: "8px",
    background: "rgba(0,0,0,0.16)",
    overflow: "hidden"
  });

  const statsHeader = create("div", {
    padding: "8px 12px",
    borderBottom: "1px solid rgba(212,184,134,0.16)",
    color: "#d4b886",
    fontWeight: "700",
    letterSpacing: "1px",
    fontSize: "12px"
  });
  statsHeader.textContent = "UNIT STATS";

const statsScroll = create("div", {
  flex: "1",
  overflowY: "auto",
  padding: "8px",
  display: "grid",
  /* SURGERY: Auto-fit grid! 1 column on phones, multiple on PC */
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", 
  gap: "6px",
  boxSizing: "border-box"
});
  
  
const closeBtn = document.createElement("button");
closeBtn.textContent = "Close";
closeBtn.className = "close-btn"; // SURGERY: Protect this from mobile button overrides

// IMPORTANT: set this BEFORE appending children
right.style.position = "relative";
right.style.paddingTop = "50px"; // moves content below the close button
rightTop.style.position = "relative";

// SURGERY: Make close button red, larger, and more prominent
Object.assign(closeBtn.style, {
  position: "absolute",
  top: "15px",
  right: "15px",
  transform: "none",
  zIndex: "10000",
  pointerEvents: "auto",
  
  // Size and Color Updates
  padding: "8px 20px",            // Larger padding
  fontSize: "16px",               // Larger font
  background: "#b71c1c",          // Red background
  color: "#ffffff",               // White text for better contrast on red
  border: "2px solid #ff5252",    // Thicker, lighter red border
  
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: "700",
  boxShadow: "0 2px 10px rgba(0,0,0,0.5)" // Added shadow to make it pop
});
closeBtn.onclick = () => {
  modal.style.display = "none";

  const menu = document.getElementById("main-menu");
  if (menu) {
    menu.style.visibility = "visible";
    menu.style.pointerEvents = "auto";
  }
};

right.appendChild(rightTop);
right.appendChild(portraitWrap);
right.appendChild(statsPanel);

  statsPanel.appendChild(statsHeader);
  statsPanel.appendChild(statsScroll);
rightTop.appendChild(titleWrap);
rightTop.appendChild(renderTag);
rightTop.style.position = "relative";
  
  panel.appendChild(left);
  panel.appendChild(right);
  panel.appendChild(closeBtn); // Appended to panel so it overlays everything flawlessly
  modal.appendChild(panel);

function selectUnit(unit) {
	
	if (!unit) {
    console.warn("Units Guide: Attempted to select an undefined unit.");
    return;
  }
  
modal.currentUnit = unit; // SURGERY: Track current unit for resizing
    const nameEl = modal.querySelector("#units-selected-name");
	
    const descEl = modal.querySelector("#units-selected-desc");

    if (nameEl) nameEl.textContent = unit.name;

    if (descEl) {
        descEl.textContent = unit.desc;
        descEl.style.marginTop = "4px"; // <-- adds space below the name
    }

    const stats = unit.stats || {};
    statsScroll.innerHTML = Object.entries(stats)
      .filter(([k]) => STAT_ORDER.includes(k))
      .map(([k, v]) => `
        <div style="display:flex; justify-content:space-between; gap:8px; padding:6px 8px; border:1px solid rgba(212,184,134,0.14); border-radius:6px; background:rgba(255,255,255,0.03); font-size:12px; min-width:0;">
          <span style="color:#d4b886; font-weight:700;">${STAT_LABELS[k]}</span>
          <span style="color:#fff; text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${prettyValue(k, v)}</span>
        </div>
      `).join("");

    renderPortrait(canvas, unit);
  }

 // Change UNIT_DATA.map to liveUnitData.map
  const list = liveUnitData.map((unit) => {
    const row = document.createElement("button");
    row.type = "button";
    row.dataset.unit = unit.name;
    // ... keep your styling ...
    row.textContent = unit.name;
    Object.assign(row.style, {
      display: "block",
      width: "100%",
      textAlign: "left",
      padding: "10px 10px",
      margin: "0 0 7px 0",
      background: "rgba(255,255,255,0.03)",
      color: "#fff",
      border: "1px solid rgba(212,184,134,0.18)",
      borderRadius: "8px",
      cursor: "pointer",
      fontSize: "14px",
      fontWeight: "700",
      boxSizing: "border-box"
    });

    const subtitle = document.createElement("div");
    subtitle.style.marginTop = "3px";
    subtitle.style.fontWeight = "400";
    subtitle.style.fontSize = "11px";
    subtitle.style.color = "#cfcfcf";
    subtitle.textContent = unit.mounted ? "Mounted" : "Foot";
    row.appendChild(subtitle);

    row.addEventListener("click", () => selectUnit(unit));
    return row;
  });

  leftList.append(...list);
  left.appendChild(leftHeader);
  left.appendChild(leftList);

modal.selectUnit = selectUnit;
// Change UNIT_DATA[0] to liveUnitData[0]
  modal.setInitial = () => {
      if (liveUnitData && liveUnitData.length > 0) {
          selectUnit(liveUnitData[0]);
      } else {
          console.warn("Units Guide: No units found to set as initial.");
      }
  };

// SURGERY: Redraw the canvas portrait when the browser window is maximized/minimized
  window.addEventListener('resize', () => {
      if (modal.style.display !== 'none' && modal.currentUnit) {
          // Slight delay allows the flex container to finish snapping before reading canvas dimensions
          setTimeout(() => {
              renderPortrait(canvas, modal.currentUnit);
          }, 50);
      }
  });
  
  return modal;
}

function injectIntoMenu() {
  const menu = document.getElementById("main-menu");
  if (!menu || menu.__unitsGuideHooked) return;

  const modal = createUnitsGuide();
  if (!modal.isConnected) document.body.appendChild(modal);

  // Find the actual UI button column instead of guessing a random div
  const buttonsContainer =
    Array.from(menu.children).find((el) => el.tagName === "DIV" && el.querySelector("button")) || menu;

  if (buttonsContainer.__unitsGuideButtonAdded) return;
  buttonsContainer.__unitsGuideButtonAdded = true;

 const unitsBtn = document.createElement("button");
  unitsBtn.id = "units-guide-btn";
  unitsBtn.textContent = "Units";
  Object.assign(unitsBtn.style, {
    display: "none", // Hidden until Manual is clicked
    width: "min(280px, 82vw)",
    margin: "10px 0 0 0",
    padding: "15px 40px",
    background: "linear-gradient(to bottom, #7b1a1a, #4a0a0a)",
    color: "#f5d76e",
    border: "2px solid #d4b886",
    borderRadius: "4px",
    cursor: "pointer",
    fontFamily: "Georgia, serif",
    fontSize: "1.2rem",
    fontWeight: "bold",
    textTransform: "uppercase",
    boxShadow: "0 4px 6px rgba(0,0,0,0.5)",
    transition: "all 0.2s",
    boxSizing: "border-box"
  });

  unitsBtn.onmouseenter = () => {
    unitsBtn.style.transform = "scale(1.05)";
    unitsBtn.style.background = "linear-gradient(to bottom, #b71c1c, #7b1a1a)";
    unitsBtn.style.color = "#fff";
    unitsBtn.style.boxShadow = "0 0 20px #d4b886";
  };

  unitsBtn.onmouseleave = () => {
    unitsBtn.style.transform = "scale(1)";
    unitsBtn.style.background = "linear-gradient(to bottom, #7b1a1a, #4a0a0a)";
    unitsBtn.style.color = "#f5d76e";
    unitsBtn.style.boxShadow = "0 4px 6px rgba(0,0,0,0.5)";
  };
unitsBtn.onclick = () => {
    modal.style.display = "flex";
    menu.style.visibility = "hidden";
    menu.style.pointerEvents = "none";

    // FIXED: The delay allows the browser to calculate the width/height 
    // of the canvas container before we try to render the 3D models.
    setTimeout(() => {
      if (typeof modal.setInitial === "function") {
        modal.setInitial();
      }
    }, 100); 
  };

  // Add an ID so menu.js can find it to unlock it
  unitsBtn.id = "units-guide-btn";
  unitsBtn.style.display = "none"; 

  buttonsContainer.appendChild(unitsBtn);
  menu.__unitsGuideHooked = true;
modal.__unitsGuideReady = true;}
function addStyles() {
  if (document.getElementById("units-guide-styles")) return;
  const style = document.createElement("style");
  style.id = "units-guide-styles";
  style.textContent = `
    #units-guide-modal {
      box-sizing: border-box;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      
      justify-content: center !important;
      align-items: flex-start !important; 
      padding-top: 60px !important;       
      
      background: #000000;
      z-index: 10000 !important;           
      overflow-y: auto;
      pointer-events: auto;
    }

    #units-guide-modal ::-webkit-scrollbar { width: 10px; height: 10px; }
    #units-guide-modal ::-webkit-scrollbar-track { background: #241614; border-radius: 8px; }
    #units-guide-modal ::-webkit-scrollbar-thumb { background: #d4b886; border-radius: 8px; }
    #units-guide-modal ::-webkit-scrollbar-thumb:hover { background: #f5d76e; }

    #units-guide-modal button:not(.close-btn):hover {
      background: rgba(212,184,134,0.10) !important;
    }

    @media (max-width: 900px) {
      #units-guide-modal {
        padding-top: 10px !important; /* Maximize top screen real estate */
        padding-left: 5px !important;
        padding-right: 5px !important;
        align-items: center !important;
      }

      /* The main UI Panel */
      #units-guide-modal > div {
        width: 100vw !important;
        height: 95vh !important; /* Near full screen */
        max-height: none !important;
        flex-direction: column !important;
      }

      /* Left Panel (The scrollable list) */
      #units-guide-left {
        width: 100% !important;
        max-width: none !important;
        flex: 0 0 35% !important; /* Takes exact top 35% of the screen */
        border-right: 0 !important;
        border-bottom: 2px solid rgba(212,184,134,0.5) !important;
      }

      /* Right Panel (Portrait + Stats) */
      #units-guide-right {
        width: 100% !important;
        flex: 1 !important; /* Takes remaining 65% */
        padding-top: 45px !important; /* Room for close button */
        overflow-y: auto !important; /* Allows interior scrolling if needed */
      }

      /* Allow portrait to shrink further on landscape phones */
      #units-guide-portrait {
        flex-basis: 120px !important;
      }

      /* Protect the Close button from the old mobile stretching bug */
      #units-guide-modal .close-btn {
        top: 8px !important;
        right: 8px !important;
        padding: 6px 12px !important;
        font-size: 14px !important;
        width: auto !important; /* Overrides the 'button { width: min(...) }' rule */
      }
    }
  `;
  document.head.appendChild(style);
}

addStyles();
//waitForElement("#main-menu", injectIntoMenu);
window.injectUnitsGuide = injectIntoMenu;

})();