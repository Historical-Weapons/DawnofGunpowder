// =============================================================================
//  INVENTORY MANAGEMENT PATCH  (inventory_patch.js)
//  Load order: AFTER mobile_ui.js, leave_battle_roster.js, parler_system.js
//
//  What this file does (zero edits to existing files):
//    1. Injects a "📦 Manage Inventory" button into the Detail Drawer.
//    2. Intercepts leaveBattlefield → captures enemy cargo before auto-loot
//       → shows a paused overworld loot-picker screen (Bannerlord style).
//    3. Intercepts displayAutoresolveResults → same capture trick →
//       hooks the Continue button so the picker appears after parle closes.
//    4. Both post-battle modes: two-column UI (Your Cargo | Enemy Loot)
//       with Take-1 / Take-All / Drop-1 / Drop-All controls + cargo bar.
//    5. Single-column "manage" mode for the Detail Drawer button.
//    6. "Finish & Return" button unpauses the game.
//    7. Safely handles Defeats (Inventory UI skips opening, but penalties apply).
// =============================================================================
(function () {
    "use strict";

    // =========================================================================
    // 0. SHARED STATE
    // =========================================================================
    const _state = {
        mode: null,           // "manage" | "loot"
        pendingLoot: {},      // { rid: qty } — enemy cargo player can take
        lootNpcRef: null,     // NPC ref (for post-close cleanup if needed)
        onFinish: null,       // optional callback after Finish
        isOpen: false,
    };

    // =========================================================================
    // 1. CSS — injected once
    // =========================================================================
    function injectCSS() {
        if (document.getElementById("inv-patch-styles")) return;
        const s = document.createElement("style");
        s.id = "inv-patch-styles";
        s.textContent = `
/* ── Overlay ── */
#inv-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,.85); z-index: 99500;
    align-items: center; justify-content: center;
    touch-action: none;
}
#inv-overlay.open { display: flex; }

/* ── Panel ── */
#inv-panel {
    position: relative;
    background: linear-gradient(160deg, #1a0d0d 0%, #0c0704 100%);
    border: 2px solid #d4b886;
    border-radius: 6px;
    width: clamp(300px, 96vw, 900px);
    max-height: 94vh;
    display: flex; flex-direction: column;
    font-family: 'Georgia', serif; color: #d4b886;
    box-shadow: 0 10px 48px rgba(0,0,0,.95), inset 0 1px 0 rgba(212,184,134,.12);
    overflow: hidden;
}

/* ── Header ── */
#inv-header {
    flex-shrink: 0;
    background: linear-gradient(to bottom, #7b1a1a, #4a0a0a);
    border-bottom: 2px solid #ffca28;
    height: 54px; padding: 0 18px;
    display: flex; align-items: center; justify-content: space-between;
}
#inv-header .inv-title {
    font-size: 15px; font-weight: bold;
    color: #f5d76e; text-transform: uppercase; letter-spacing: 3px;
}
#inv-close-x {
    background: transparent; border: 1px solid #d4b886;
    color: #f5d76e; width: 36px; height: 36px; border-radius: 4px;
    font-size: 20px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    touch-action: manipulation;
}
#inv-close-x:hover { background: rgba(212,184,134,.15); }

/* ── Body ── */
#inv-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; min-height: 0; }

/* ── Two-column ── */
#inv-two-col { display: flex; flex: 1; min-height: 0; }
.inv-col { flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.inv-col + .inv-col { border-left: 2px solid #3e2723; }

.inv-col-head {
    flex-shrink: 0;
    background: rgba(0,0,0,.45);
    border-bottom: 1px solid #3e2723;
    padding: 10px 14px 8px;
    font-size: 11px; font-weight: bold;
    color: #888; text-transform: uppercase; letter-spacing: 2px;
    display: flex; justify-content: space-between; align-items: center;
}
.inv-col-scroll {
    flex: 1; overflow-y: auto; padding: 6px 8px;
    scrollbar-width: thin; scrollbar-color: #5d4037 transparent;
}

/* ── Item row ── */
.inv-row {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px; border-radius: 3px;
    border-bottom: 1px solid rgba(62,39,35,.4);
    transition: background .12s;
}
.inv-row:hover { background: rgba(212,184,134,.06); }
.inv-row-label { flex: 1; font-size: 13px; color: #e0c9a0; }
.inv-row-qty { min-width: 34px; text-align: right; font-size: 15px; font-weight: bold; color: #fff; }
.inv-row-btns { display: flex; gap: 4px; flex-shrink: 0; }

.inv-btn {
    background: rgba(0,0,0,.5); border: 1px solid #5d4037;
    border-radius: 3px; color: #d4b886;
    padding: 4px 9px; font-size: 12px; cursor: pointer;
    min-height: 30px; min-width: 30px;
    font-family: 'Georgia', serif;
    touch-action: manipulation; transition: background .1s, border-color .1s;
}
.inv-btn:hover { background: rgba(93,64,55,.55); border-color: #d4b886; }
.inv-btn:disabled { opacity: .35; cursor: not-allowed; }
.inv-take { border-color: #2e7d32; color: #8bc34a; }
.inv-take:hover:not(:disabled) { background: rgba(46,125,50,.3); border-color: #8bc34a; }
.inv-drop { border-color: #7b1a1a; color: #ef5350; }
.inv-drop:hover:not(:disabled) { background: rgba(123,26,26,.35); border-color: #ef5350; }

/* ── Capacity strip ── */
.inv-cap-strip {
    flex-shrink: 0; padding: 7px 14px 9px;
    background: rgba(0,0,0,.3); border-top: 1px solid #2a1a14;
    font-size: 11px; color: #666;
}
.inv-cap-track { background: #150e06; height: 5px; border-radius: 3px; margin-top: 5px; overflow: hidden; }
.inv-cap-fill  { height: 100%; border-radius: 3px; transition: width .2s, background .2s; }

/* ── Empty message ── */
.inv-empty { padding: 22px 14px; color: #4a3528; font-size: 12px; text-align: center; font-style: italic; }

/* ── Footer ── */
#inv-footer {
    flex-shrink: 0; padding: 12px 20px;
    background: rgba(0,0,0,.55); border-top: 2px solid #3e2723;
    display: flex; justify-content: center;
}
#inv-finish-btn {
    width: 100%; max-width: 360px;
    background: linear-gradient(to bottom, #2e7d32, #1b5e20);
    color: #c8e6c9; border: 2px solid #4caf50;
    border-radius: 5px; padding: 14px 28px;
    font-family: 'Georgia', serif; font-size: 14px;
    font-weight: bold; text-transform: uppercase; letter-spacing: 2px;
    cursor: pointer; touch-action: manipulation;
    box-shadow: 0 4px 14px rgba(0,0,0,.6);
    transition: background .15s;
}
#inv-finish-btn:hover { background: linear-gradient(to bottom, #388e3c, #2e7d32); }

/* ── Single-column manage mode ── */
#inv-single-col { flex: 1; display: flex; flex-direction: column; min-height: 0; }

/* ── Mobile stack ── */
@media (max-width: 580px) {
    #inv-two-col { flex-direction: column; }
    .inv-col + .inv-col { border-left: none; border-top: 2px solid #3e2723; max-height: 45vh; }
}
        `;
        document.head.appendChild(s);
    }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================
    function getPlayer()  { return (typeof player  !== "undefined") ? player  : null; }
    function getCatalog() { return (typeof RESOURCE_CATALOG !== "undefined") ? RESOURCE_CATALOG : {}; }

    function cargoUsed(inv) {
        if (!inv) return 0;
        return Object.values(inv).reduce((s, v) => s + (v || 0), 0);
    }

    function cargoMax(p) {
        if (!p) return 10;
        return p.cargoCapacity || Math.max(10, (p.troops || (p.roster ? p.roster.length : 0)) * 2);
    }

    function capBar(used, max) {
        const pct = Math.min(100, (used / Math.max(1, max)) * 100);
        const col = used >= max ? "#ef5350" : used > max * 0.75 ? "#ffa726" : "#8bc34a";
        return { pct, col };
    }

    // =========================================================================
    // 3. DOM BUILD — create modal skeleton once
    // =========================================================================
    function ensureModal() {
        if (document.getElementById("inv-overlay")) return;
        injectCSS();

        const overlay = document.createElement("div");
        overlay.id = "inv-overlay";
        overlay.innerHTML = `
            <div id="inv-panel">
                <div id="inv-header">
                    <span class="inv-title" id="inv-title-text"></span>
                    <button id="inv-close-x" aria-label="Close">✕</button>
                </div>
                <div id="inv-body"></div>
                <div id="inv-footer">
                    <button id="inv-finish-btn">✓ Finish &amp; Return</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById("inv-close-x").addEventListener("click", () => _close(false));
        document.getElementById("inv-finish-btn").addEventListener("click", () => _close(true));
    }

    // =========================================================================
    // 4. RENDER
    // =========================================================================
    function render() {
        const body  = document.getElementById("inv-body");
        const title = document.getElementById("inv-title-text");
        if (!body || !title) return;

        const p    = getPlayer();
        const cat  = getCatalog();
        const inv  = (p && p.inventory) ? p.inventory : {};
        const cMax = cargoMax(p);
        const used = cargoUsed(inv);
        const { pct, col } = capBar(used, cMax);

        if (_state.mode === "manage") {
            title.textContent = "🎒 Manage Inventory";
            body.innerHTML = buildManageHTML(inv, used, cMax, pct, col, cat);
        } else {
            title.textContent = "⚔️ Post-Battle Spoils";
            body.innerHTML = buildLootHTML(inv, used, cMax, pct, col, cat);
        }

        // Wire action buttons
        body.querySelectorAll("[data-act]").forEach(btn => {
            btn.addEventListener("click", function () {
                handleAction(this.dataset.act, this.dataset.rid, parseInt(this.dataset.qty || "1", 10));
            });
        });
    }

    // ── 4a. Manage mode (single column, drop only) ──
    function buildManageHTML(inv, used, cMax, pct, col, cat) {
        const entries = Object.keys(inv).filter(r => inv[r] > 0);

        let rows = "";
        if (entries.length === 0) {
            rows = `<div class="inv-empty">Your cargo hold is empty.</div>`;
        } else {
            entries.forEach(rid => {
                const qty = inv[rid];
                const res = cat[rid] || { emoji: "📦", label: rid };
                rows += `
                    <div class="inv-row">
                        <span class="inv-row-label">${res.emoji} ${res.label}</span>
                        <span class="inv-row-qty">${qty}</span>
                        <div class="inv-row-btns">
                            <button class="inv-btn inv-drop"
                                data-act="drop1" data-rid="${rid}" data-qty="1" title="Drop 1">−1</button>
                            <button class="inv-btn inv-drop"
                                data-act="dropall" data-rid="${rid}" data-qty="${qty}" title="Drop All">✕ All</button>
                        </div>
                    </div>`;
            });
        }

        return `
            <div id="inv-single-col">
                <div class="inv-col-scroll">${rows}</div>
                <div class="inv-cap-strip">
                    Cargo Load: <strong style="color:${col}">${used} / ${cMax}</strong>
                    <div class="inv-cap-track">
                        <div class="inv-cap-fill" style="width:${pct}%; background:${col}"></div>
                    </div>
                </div>
            </div>`;
    }

    // ── 4b. Loot mode (two columns) ──
    function buildLootHTML(inv, used, cMax, pct, col, cat) {
        // LEFT — player's cargo
        const invEntries  = Object.keys(inv).filter(r => inv[r] > 0);
        const lootEntries = Object.keys(_state.pendingLoot).filter(r => _state.pendingLoot[r] > 0);

        let playerRows = "";
        if (invEntries.length === 0) {
            playerRows = `<div class="inv-empty">Your cargo hold is empty.</div>`;
        } else {
            invEntries.forEach(rid => {
                const qty = inv[rid];
                const res = cat[rid] || { emoji: "📦", label: rid };
                playerRows += `
                    <div class="inv-row">
                        <span class="inv-row-label">${res.emoji} ${res.label}</span>
                        <span class="inv-row-qty">${qty}</span>
                        <div class="inv-row-btns">
                            <button class="inv-btn inv-drop"
                                data-act="drop1" data-rid="${rid}" data-qty="1">−1</button>
                            <button class="inv-btn inv-drop"
                                data-act="dropall" data-rid="${rid}" data-qty="${qty}">✕</button>
                        </div>
                    </div>`;
            });
        }

        // RIGHT — enemy loot
        let lootRows = "";
        const totalLootItems = lootEntries.reduce((s, r) => s + _state.pendingLoot[r], 0);
        if (lootEntries.length === 0) {
            lootRows = `<div class="inv-empty">No enemy cargo to plunder.</div>`;
        } else {
            const freeSpace = cMax - used;
            lootEntries.forEach(rid => {
                const qty  = _state.pendingLoot[rid];
                const res  = cat[rid] || { emoji: "📦", label: rid };
                const can1 = freeSpace >= 1;
                const canA = freeSpace >= 1;
                lootRows += `
                    <div class="inv-row">
                        <span class="inv-row-label">${res.emoji} ${res.label}</span>
                        <span class="inv-row-qty" style="color:#f5d76e">${qty}</span>
                        <div class="inv-row-btns">
                            <button class="inv-btn inv-take"
                                data-act="take1" data-rid="${rid}" data-qty="1"
                                ${can1 ? "" : "disabled"}>+1</button>
                            <button class="inv-btn inv-take"
                                data-act="takeall" data-rid="${rid}" data-qty="${qty}"
                                ${canA ? "" : "disabled"}>All</button>
                        </div>
                    </div>`;
            });
        }

        return `
            <div id="inv-two-col">
                <div class="inv-col">
                    <div class="inv-col-head">
                        <span>🎒 Your Cargo</span>
                        <span style="color:${col};font-weight:bold">${used} / ${cMax}</span>
                    </div>
                    <div class="inv-col-scroll">${playerRows}</div>
                    <div class="inv-cap-strip" style="font-size:10px">
                        Capacity
                        <div class="inv-cap-track">
                            <div class="inv-cap-fill" style="width:${pct}%; background:${col}"></div>
                        </div>
                    </div>
                </div>

                <div class="inv-col">
                    <div class="inv-col-head">
                        <span>⚔️ Enemy Loot</span>
                        <span style="color:#f5d76e;font-weight:bold">${totalLootItems} items</span>
                    </div>
                    <div class="inv-col-scroll">${lootRows}</div>
                    <div class="inv-cap-strip" style="font-size:10px;color:#555">
                        Click items to claim. Unclaimed loot is left behind.
                    </div>
                </div>
            </div>`;
    }

    // =========================================================================
    // 5. ACTION HANDLER
    // =========================================================================
    function handleAction(act, rid, qty) {
        if (!rid) return;
        const p = getPlayer();
        if (!p) return;
        if (!p.inventory) p.inventory = {};

        const cMax = cargoMax(p);

        if (act === "drop1") {
            const curr = p.inventory[rid] || 0;
            const drop = Math.min(1, curr);
            if (drop > 0) {
                p.inventory[rid] -= drop;
                if (p.inventory[rid] <= 0) delete p.inventory[rid];
                // Return dropped item to loot pool if in loot mode
                if (_state.mode === "loot") {
                    _state.pendingLoot[rid] = (_state.pendingLoot[rid] || 0) + drop;
                }
            }
        } else if (act === "dropall") {
            const curr = p.inventory[rid] || 0;
            if (curr > 0) {
                delete p.inventory[rid];
                if (_state.mode === "loot") {
                    _state.pendingLoot[rid] = (_state.pendingLoot[rid] || 0) + curr;
                }
            }
        } else if (act === "take1") {
            const avail = _state.pendingLoot[rid] || 0;
            const free  = cMax - cargoUsed(p.inventory);
            const take  = Math.min(1, avail, free);
            if (take > 0) {
                p.inventory[rid] = (p.inventory[rid] || 0) + take;
                _state.pendingLoot[rid] -= take;
                if (_state.pendingLoot[rid] <= 0) delete _state.pendingLoot[rid];
            }
        } else if (act === "takeall") {
            const avail = _state.pendingLoot[rid] || 0;
            const free  = cMax - cargoUsed(p.inventory);
            const take  = Math.min(avail, free);
            if (take > 0) {
                p.inventory[rid] = (p.inventory[rid] || 0) + take;
                _state.pendingLoot[rid] -= take;
                if (_state.pendingLoot[rid] <= 0) delete _state.pendingLoot[rid];
            }
        }

        render();
    }

    // =========================================================================
    // 6. OPEN / CLOSE (HARD PAUSE OVERWORLD HOOKS)
    // =========================================================================
    function _open() {
        ensureModal();
        
        // Base pause flag
        if (typeof window.isPaused !== "undefined") window.isPaused = true;

        // ── STRICT PAUSE HOOKS ─────────────────────────────────────────────
        // We trick sandboxmode_update.js into halting all logic by flagging 
        // inTradeMode and stopping player map traversal natively.
        window.__invPrevTradeMode = window.inTradeMode;
        window.inTradeMode = true; 
        
        const p = getPlayer();
        if (p) p.isMapPaused = true;

        _state.isOpen = true;
        document.getElementById("inv-overlay").classList.add("open");
        render();
    }

    function _close(doFinish) {
        const overlay = document.getElementById("inv-overlay");
        if (overlay) overlay.classList.remove("open");
        _state.isOpen = false;

        // Unpause base flag
        if (typeof window.isPaused !== "undefined") window.isPaused = false;

        // ── UNFREEZE OVERWORLD HOOKS ───────────────────────────────────────
        if (typeof window.__invPrevTradeMode !== "undefined") {
            window.inTradeMode = window.__invPrevTradeMode;
        } else {
            window.inTradeMode = false;
        }
        
        const p = getPlayer();
        if (p) p.isMapPaused = false;

        if (doFinish && typeof _state.onFinish === "function") {
            _state.onFinish();
        }

        // Reset transient state
        _state.pendingLoot = {};
        _state.lootNpcRef  = null;
        _state.onFinish    = null;
        _state.mode        = null;
    }

    // =========================================================================
    // 7. PUBLIC API — exposed on window.InventoryManager
    // =========================================================================
    window.InventoryManager = {
        /**
         * Single-column manage mode (Detail Drawer "Manage Inventory" button).
         */
        openManage() {
            _state.mode        = "manage";
            _state.pendingLoot = {};
            _state.lootNpcRef  = null;
            _state.onFinish    = null;
            _open();
        },

        /**
         * Two-column loot-picker mode (post-battle / autoresolve).
         * @param {Object} availableLoot  { rid: qty } — what enemy had
         * @param {Object} npcRef         Reference to enemy NPC (informational)
         * @param {Function} [onFinish]   Optional callback fired when Finish is clicked
         */
        openLootPicker(availableLoot, npcRef, onFinish) {
            _state.mode        = "loot";
            _state.lootNpcRef  = npcRef || null;
            _state.onFinish    = onFinish || null;

            // Deep-copy and sanitise the loot pool
            _state.pendingLoot = {};
            if (availableLoot) {
                Object.keys(availableLoot).forEach(rid => {
                    const q = availableLoot[rid];
                    if (typeof q === "number" && q > 0) _state.pendingLoot[rid] = q;
                });
            }

            _open();
        },

        /** Force-close without finish callback. */
        forceClose() { _close(false); }
    };

    // =========================================================================
    // 8. PATCH: mobile_ui.js — inject "Manage Inventory" button into drawer
    // =========================================================================
    function patchMobileDrawer() {
        if (!window.mobileUI || !window.mobileUI.refreshDetailDrawer) return false;
        if (window.mobileUI.__invPatched) return true;
        window.mobileUI.__invPatched = true;

        const orig = window.mobileUI.refreshDetailDrawer;

        function patchedRefresh() {
            orig.call(this);

            const body = document.getElementById("mob-detail-body");
            if (!body || body.querySelector("#mob-inv-btn")) return;

            const btn = document.createElement("button");
            btn.id        = "mob-inv-btn";
            btn.className = "menu-btn";
            btn.style.cssText = [
                "width:100%","margin-top:6px","padding:12px 10px",
                "background:linear-gradient(to bottom,#1a2e4a,#0a1520)",
                "border:1px solid #42a5f5","color:#90caf9",
                "font-family:'Georgia',serif","font-size:13px",
                "font-weight:bold","text-transform:uppercase",
                "letter-spacing:1px","cursor:pointer","border-radius:4px",
                "touch-action:manipulation"
            ].join(";");
            btn.textContent = "📦 Manage Inventory";
            btn.addEventListener("click", () => {
                if (window.mobileUI) window.mobileUI.closeDetailDrawer();
                window.InventoryManager.openManage();
            });

            const sections = body.querySelectorAll(".mob-section-title");
            let insertBefore = null;
            sections.forEach(sec => {
                if (sec.textContent.includes("Cargo")) {
                    let node = sec.nextSibling;
                    while (node) {
                        if (node.nodeType === 1 && node.classList.contains("mob-section-title")) {
                            insertBefore = node;
                            break;
                        }
                        node = node.nextSibling;
                    }
                }
            });

            if (insertBefore) {
                body.insertBefore(btn, insertBefore);
            } else {
                sections.forEach(sec => {
                    if (sec.textContent.includes("Army Roster")) insertBefore = sec;
                });
                body.insertBefore(btn, insertBefore || body.firstChild);
            }
        }

        window.mobileUI.refreshDetailDrawer = patchedRefresh;
        console.log("[InventoryPatch] mobile_ui drawer patched ✓");
        return true;
    }

    // =========================================================================
    // 9. HOOK: leaveBattlefield (leave_battle_roster.js wrapper)
    // =========================================================================
    function hookLeaveBattlefield() {
        if (typeof leaveBattlefield === "undefined") return false;
        if (window.__invPatch_lbHooked) return true;
        window.__invPatch_lbHooked = true;

        const prev = leaveBattlefield; 

        leaveBattlefield = function invPatch_leaveBattlefield(playerObj) {

            if (window.__IS_CUSTOM_BATTLE__) {
                return prev(playerObj);
            }

            // ── 0) Verify Victory State to Prevent Menu on Defeat ────────────
            let didPlayerWin = false;
            let enemyRef = (typeof currentBattleData !== "undefined" && currentBattleData) ? currentBattleData.enemyRef : null;

            if (typeof battleEnvironment !== "undefined" && battleEnvironment && battleEnvironment.units) {
                let eInitial = (currentBattleData && currentBattleData.trueInitialCounts && currentBattleData.trueInitialCounts.enemy) 
                    ? currentBattleData.trueInitialCounts.enemy : 1;
                let eSurvivors = battleEnvironment.units.filter(u => u.side === "enemy" && u.hp > 0);
                
                let isPlayerDead = (currentBattleData && currentBattleData.playerDefeatedText) || (playerObj && playerObj.hp <= 0);
                if (typeof cachedCommander !== "undefined" && cachedCommander && cachedCommander.hp <= 0) isPlayerDead = true;
                
                let isEnemyRouted = (eSurvivors.length < 5 || (eSurvivors.length / Math.max(1, eInitial)) < 0.15);
                didPlayerWin = !isPlayerDead && (eSurvivors.length === 0 || isEnemyRouted);
            }

            // ── a) Snapshot enemy cargo (ONLY IF WON) ────────────────────────
            const snapshot = {};
            let hadCargo = false;
            
            if (didPlayerWin && enemyRef && enemyRef.cargo) {
                Object.keys(enemyRef.cargo).forEach(rid => {
                    if ((enemyRef.cargo[rid] || 0) > 0) snapshot[rid] = enemyRef.cargo[rid];
                });
                hadCargo = Object.keys(snapshot).length > 0;
                
                // b) Prevent auto-transfer so we can pick loot manually
                if (hadCargo) enemyRef.cargo = {};
            }

            // ── c) Run the original logic (Handles stats/penalties safely) ───
            prev(playerObj);

            // ── d) Show loot picker (ONLY IF WON) ────────────────────────────
            if (didPlayerWin) {
                // Restore for reference
                if (enemyRef && hadCargo) enemyRef.cargo = snapshot;

                setTimeout(() => {
                    window.InventoryManager.openLootPicker(snapshot, enemyRef, null);
                }, 380);
            }
        };

        console.log("[InventoryPatch] leaveBattlefield hooked ✓");
        return true;
    }

    // =========================================================================
    // 10. HOOK: displayAutoresolveResults (parler_system.js)
    // =========================================================================
    function hookAutoresolve() {
        if (typeof displayAutoresolveResults === "undefined") return false;
        if (window.__invPatch_arHooked) return true;
        window.__invPatch_arHooked = true;

        const prev = displayAutoresolveResults;

        displayAutoresolveResults = function invPatch_autoresolve(npc, playerWon, playerLosses, npcLosses) {

            // ── a) Snapshot NPC cargo (only on victory) ──────────────────────
            const snapshot = {};
            let hadCargo = false;
            if (playerWon && npc && npc.cargo) {
                Object.keys(npc.cargo).forEach(rid => {
                    if ((npc.cargo[rid] || 0) > 0) snapshot[rid] = npc.cargo[rid];
                });
                hadCargo = Object.keys(snapshot).length > 0;
                
                // b) Prevent auto-transfer
                if (hadCargo) npc.cargo = {};
            }

            // ── c) Run original (shows result, calculates penalties) ─────────
            prev(npc, playerWon, playerLosses, npcLosses);

            // Restore for reference
            if (playerWon && npc && hadCargo) npc.cargo = snapshot;

            // ── d) Re-wire the Continue button ───────────────────────────────
            setTimeout(() => {
                const actionBox = document.getElementById("parle-action-box");
                if (!actionBox) return;

                const buttons = actionBox.querySelectorAll("button");
                const continueBtn = buttons[buttons.length - 1];
                if (!continueBtn || continueBtn.dataset.invWired) return;
                continueBtn.dataset.invWired = "1";

                const oldBtn = continueBtn;
                const newBtn = oldBtn.cloneNode(true); 
                oldBtn.parentNode.replaceChild(newBtn, oldBtn);

                newBtn.addEventListener("click", function () {
                    // 1. Run original parle cleanup
                    if (typeof isDiplomacyProcessing !== "undefined") {
                        // eslint-disable-next-line no-undef
                        isDiplomacyProcessing = false;
                    }
                    if (playerWon) {
                        if (typeof WorldMap !== "undefined" && typeof WorldMap.removeEntity === "function") {
                            WorldMap.removeEntity(npc);
                        } else {
                            npc.isDead = true;
                        }
                    }
                    if (typeof leaveParle === "function") leaveParle(typeof player !== "undefined" ? player : null);

                    // 2. Show loot picker ONLY if we won the autoresolve
                    if (playerWon) {
                        setTimeout(() => {
                            window.InventoryManager.openLootPicker(snapshot, npc, null);
                        }, 220);
                    }
                });

            }, 120); 
        };

        console.log("[InventoryPatch] displayAutoresolveResults hooked ✓");
        return true;
    }

    // =========================================================================
    // 11. BOOTSTRAP
    // =========================================================================
    let _retries = 0;

    function tryApplyHooks() {
        injectCSS();

        const mUIDone  = window.mobileUI?.__invPatched        || patchMobileDrawer();
        const lbDone   = window.__invPatch_lbHooked           || hookLeaveBattlefield();
        const arDone   = window.__invPatch_arHooked           || hookAutoresolve();

        if ((!mUIDone || !lbDone || !arDone) && _retries < 40) {
            _retries++;
            setTimeout(tryApplyHooks, 250);
        } else {
            console.log(
                `[InventoryPatch] Bootstrap complete ✓  `+
                `(mobileUI:${!!mUIDone} leaveBattlefield:${!!lbDone} autoresolve:${!!arDone})`
            );
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", tryApplyHooks);
    } else {
        tryApplyHooks();
    }

})();