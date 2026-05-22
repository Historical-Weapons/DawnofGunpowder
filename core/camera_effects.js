// ==========================================
// DAWN OF GUNPOWDER - CAMERA EFFECTS ENGINE
// ==========================================

window.isZoomAnimating = false;

window.triggerEpicZoom = function(startZoom = 0.2, endZoom = 4.0, durationMs = 1500) {
    // DISABLED: Animation removed — snap directly to the target zoom so all
    // callers still receive the correct final zoom value without the cinematic
    // fly-in playing before battle starts. Re-enable by restoring the rAF loop.
    window.isZoomAnimating = false;
    window.zoom = endZoom;
};