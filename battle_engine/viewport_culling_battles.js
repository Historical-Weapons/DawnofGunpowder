// viewport_culling_battles.js
// Surgical terrain-canvas slice renderer for land battles.
//
// PURPOSE — this file serves ONE job that nothing else does:
//   Drawing bgCanvas / fgCanvas (pre-rendered terrain, trees, shadows)
//   by blitting ONLY the visible slice instead of the whole massive canvas.
//   A 6400×4800 bgCanvas costs ~5ms to ctx.drawImage() in full; the surgical
//   slice costs ~0.3ms.  That saving is real and permanent — it is NOT
//   covered by MB16 (unit cull), MB18 (projectile cull), or MB19 (AI skip),
//   which target units/projectiles/simulation respectively.
//
// WHAT IS *NOT* HERE ANYMORE:
//   The old BATTLE_CAMERA_SETTINGS.CULL_PADDING constant (was a magic number
//   350 px hardcoded for all quality tiers).  Padding is now quality-aware
//   and read from window.BATTLE_CANVAS_CULL_PADDING which settings_ui /
//   optimization-mobile-battles sets per tier at startup.
//
// LOAD ORDER (confirmed in index.html):
//   viewport_culling_battles.js  (line 494)
//   → sandboxmode_update.js      (line 495)  ← calls drawOptimizedBattleCanvas
//   → settings_ui.js             (line 496)
//   → optimization-mobile-battles.js (line 519)
//
//   settings_ui.js and optimization-mobile-battles.js load AFTER this file,
//   so the padding fallback default here must be sensible on its own.

// ── Quality-aware padding ────────────────────────────────────────────────────
// Set by settings_ui applyGraphicsQualityTier() at tier-switch time.
// Defaults here are used on first paint before any tier is applied.
//   LOW  (q<40)  →  80 px  : tiny buffer, very tight.  Works well because
//     MB17 keeps zoom locked in so the camera rect is small; pop-in at the
//     edge is rare and acceptable.
//   MED  (q40-79) → 250 px : comfortable pop-in buffer.
//   HIGH / MAX   → 400 px  : generous buffer, no pop-in even at max zoom-out.
window.BATTLE_CANVAS_CULL_PADDING = window.BATTLE_CANVAS_CULL_PADDING ?? 250;

/**
 * Draws only the visible slice of a pre-rendered terrain canvas.
 * Called by sandboxmode_update.js for bgCanvas (background terrain) and
 * fgCanvas (foreground trees / canopy) on every land-battle frame.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} sourceCanvas  — pre-rendered terrain cache
 * @param {number} playerX   — camera focal X (world coords)
 * @param {number} playerY   — camera focal Y (world coords)
 * @param {number} screenW   — physical canvas pixel width
 * @param {number} screenH   — physical canvas pixel height
 * @param {number} zoom      — current camera zoom level
 * @param {number} [offsetX] — world X where the source canvas origin sits
 *                             (e.g. -visualPadding). Defaults to 0.
 * @param {number} [offsetY] — world Y where the source canvas origin sits.
 */
function drawOptimizedBattleCanvas(ctx, sourceCanvas, playerX, playerY,
                                    screenW, screenH, zoom,
                                    offsetX, offsetY) {
    if (!sourceCanvas || sourceCanvas.width <= 0 || sourceCanvas.height <= 0) return;

    offsetX = offsetX || 0;
    offsetY = offsetY || 0;

    // Read quality-aware padding live so a tier change mid-session is respected
    // immediately on the next frame without restarting.
    var pad = (typeof window.BATTLE_CANVAS_CULL_PADDING === 'number')
        ? window.BATTLE_CANVAS_CULL_PADDING
        : 250;

    // 1. World-space dimensions visible through the camera.
    var viewW = screenW / zoom;
    var viewH = screenH / zoom;

    // 2. Top-left of the visible world rectangle.
    var viewX = playerX - viewW * 0.5;
    var viewY = playerY - viewH * 0.5;

    // 3. Convert world-space viewport to source-canvas local pixel coords.
    //    offsetX/offsetY is the world position of pixel (0,0) on the canvas;
    //    subtract it so we get the right pixel index.
    var sx = (viewX - offsetX) - pad;
    var sy = (viewY - offsetY) - pad;
    var sw = viewW + pad * 2;
    var sh = viewH + pad * 2;

    // 4. Clamp to valid pixel range (prevents IndexSizeError on canvas edges).
    if (sx < 0) { sw += sx; sx = 0; }
    if (sy < 0) { sh += sy; sy = 0; }
    if (sw <= 0 || sh <= 0) return;
    if (sx + sw > sourceCanvas.width)  sw = sourceCanvas.width  - sx;
    if (sy + sh > sourceCanvas.height) sh = sourceCanvas.height - sy;
    if (sw <= 0 || sh <= 0) return;

    // 5. The destination world-coords for this slice: undo the offset so the
    //    slice lands at the correct world position when the camera transform
    //    is already applied by the caller (sandboxmode_update applies
    //    ctx.translate + ctx.scale for zoom/pan before calling us).
    var dx = sx + offsetX;
    var dy = sy + offsetY;

    ctx.drawImage(sourceCanvas, sx, sy, sw, sh, dx, dy, sw, sh);
}