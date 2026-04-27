// ==========================================
// DAWN OF GUNPOWDER - CAMERA EFFECTS ENGINE
// ==========================================

window.isZoomAnimating = false;

window.triggerEpicZoom = function(startZoom = 0.2, endZoom = 4.0, durationMs = 1500) {
    window.isZoomAnimating = true;
    window.zoom = startZoom; // Set the global zoom to the "clouds" level

    let startTime = performance.now();

    function animateCamera(currentTime) {
        let elapsed = currentTime - startTime;
        let progress = elapsed / durationMs;

        if (progress >= 1) {
            window.zoom = endZoom;
            window.isZoomAnimating = false;
            return; // Kill the animation loop
        }

        // Cubic Ease-Out formula (Starts fast, slows down smoothly at the end)
        let easeOut = 1 - Math.pow(1 - progress, 3);
        
        // Update the global zoom variable your draw() function uses
        window.zoom = startZoom + ((endZoom - startZoom) * easeOut);

        // Keep animating
        if (window.isZoomAnimating) {
            requestAnimationFrame(animateCamera);
        }
    }

    requestAnimationFrame(animateCamera);
};