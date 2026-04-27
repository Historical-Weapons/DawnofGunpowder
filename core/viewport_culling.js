// viewport_culling.js
// Universal Camera Optimization System
// Only extracts the visible Field of View from massive background canvases.

const CAMERA_SETTINGS = {
    // <<<<<<,,,TWeak this TO BALANCE OPTIMIZATION TO VIEW Details.
    // Padding (in pixels) around the exact screen edge.
    // Higher = safer from pop-in during fast travel.
    // Lower = better performance.
    CULL_PADDING: 400,
};

/**
 * Universally draws only the visible portion of a large map canvas.
 * @param {CanvasRenderingContext2D} ctx - The main screen context
 * @param {HTMLCanvasElement} bgCanvas - The massive pre-rendered world map
 * @param {number} playerX - Focal point X
 * @param {number} playerY - Focal point Y
 * @param {number} screenWidth - Physical canvas width
 * @param {number} screenHeight - Physical canvas height
 * @param {number} currentZoom - Camera zoom level
 */
function drawOptimizedBackground(ctx, bgCanvas, playerX, playerY, screenWidth, screenHeight, currentZoom) {
    if (!bgCanvas) return;

    // 1. Calculate the true world-space dimensions of what the screen can currently see
    let viewWidth = screenWidth / currentZoom;
    let viewHeight = screenHeight / currentZoom;

    // 2. Define the exact box to cut out of the massive background, including our safety padding
    let sx = playerX - (viewWidth / 2) - CAMERA_SETTINGS.CULL_PADDING;
    let sy = playerY - (viewHeight / 2) - CAMERA_SETTINGS.CULL_PADDING;
    let sw = viewWidth + (CAMERA_SETTINGS.CULL_PADDING * 2);
    let sh = viewHeight + (CAMERA_SETTINGS.CULL_PADDING * 2);

    // 3. HARD CLAMPING: We cannot ask the canvas to draw pixels that exist outside the bgCanvas bounds.
    // If we do, the browser throws an IndexSizeError and crashes the render loop.
    if (sx < 0) { sw += sx; sx = 0; }
    if (sy < 0) { sh += sy; sy = 0; }
    if (sx + sw > bgCanvas.width) { sw = bgCanvas.width - sx; }
    if (sy + sh > bgCanvas.height) { sh = bgCanvas.height - sy; }

    // Safety catch: if the math somehow results in a 0 or negative box, abort drawing
    if (sw <= 0 || sh <= 0) return;

    // 4. Set Destination Coordinates.
    // Because your main ctx has ALREADY been translated and scaled in update.js
    // to follow the player, the destination coordinates must exactly match the source coordinates.
    let dx = sx;
    let dy = sy;
    let dw = sw;
    let dh = sh;

    // 5. The GPU Saver: drawImage(image, sourceX, sourceY, sourceW, sourceH, destX, destY, destW, destH)
    ctx.drawImage(bgCanvas, sx, sy, sw, sh, dx, dy, dw, dh);
}