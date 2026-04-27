// viewport_culling_battles.js
// Universal Camera Optimization System for Tactical Battles
// Extracts only the visible Field of View from massive background/foreground canvases.

const BATTLE_CAMERA_SETTINGS = {
    // <<<<<<,,,TWeak this TO BALANCE OPTIMIZATION TO VIEW Details.
    // Padding (in pixels) drawn outside the camera bounds. 
    // Higher = safer from pop-in during fast cavalry movement. 
    // Lower = better framerate on weak mobile GPUs.
    CULL_PADDING: 350, 
};

/**
 * Universally draws only the visible portion of a battle map canvas.
 * @param {CanvasRenderingContext2D} ctx - The main screen context
 * @param {HTMLCanvasElement} sourceCanvas - The pre-rendered terrain/cache
 * @param {number} playerX - Focal point X (Camera center)
 * @param {number} playerY - Focal point Y (Camera center)
 * @param {number} screenWidth - Physical canvas width
 * @param {number} screenHeight - Physical canvas height
 * @param {number} currentZoom - Camera zoom level
 * @param {number} offsetX - World X coordinate where the canvas starts (e.g., -padding)
 * @param {number} offsetY - World Y coordinate where the canvas starts
 */
function drawOptimizedBattleCanvas(ctx, sourceCanvas, playerX, playerY, screenWidth, screenHeight, currentZoom, offsetX = 0, offsetY = 0) {
    if (!sourceCanvas) return;

    // 1. True world-space dimensions of the screen
    let viewWidth = screenWidth / currentZoom;
    let viewHeight = screenHeight / currentZoom;

    // 2. Viewport Top-Left in World Space
    let viewX = playerX - (viewWidth / 2);
    let viewY = playerY - (viewHeight / 2);

    // 3. Convert World Space Viewport to the Source Canvas's Local Space
    // We subtract the offset because if the canvas is drawn at -200, 
    // world coordinate 0 is actually pixel 200 on the canvas.
    let sx = viewX - offsetX - BATTLE_CAMERA_SETTINGS.CULL_PADDING;
    let sy = viewY - offsetY - BATTLE_CAMERA_SETTINGS.CULL_PADDING;
    let sw = viewWidth + (BATTLE_CAMERA_SETTINGS.CULL_PADDING * 2);
    let sh = viewHeight + (BATTLE_CAMERA_SETTINGS.CULL_PADDING * 2);

    // 4. HARD CLAMPING to prevent IndexSizeError crashes
    if (sx < 0) { sw += sx; sx = 0; }
    if (sy < 0) { sh += sy; sy = 0; }
    if (sx + sw > sourceCanvas.width) { sw = sourceCanvas.width - sx; }
    if (sy + sh > sourceCanvas.height) { sh = sourceCanvas.height - sy; }

    // Abort if completely off-screen
    if (sw <= 0 || sh <= 0) return;

    // 5. Map back to World Space for the destination draw
    let dx = sx + offsetX;
    let dy = sy + offsetY;
    let dw = sw;
    let dh = sh;

    // 6. Draw the surgical slice
    ctx.drawImage(sourceCanvas, sx, sy, sw, sh, dx, dy, dw, dh);
}