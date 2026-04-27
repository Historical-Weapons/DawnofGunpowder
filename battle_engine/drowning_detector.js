
;(function () {
    'use strict';

    // ── Scratch canvas for isPointInPath() ───────────────────────────────────
    // Only 2×2 — isPointInPath() does not clip to canvas dimensions.
    // No transforms are ever applied; local coords are passed directly.
    const _oc  = document.createElement('canvas');
    _oc.width  = 2;
    _oc.height = 2;
    const _sc  = _oc.getContext('2d');

    // ── Path cache ───────────────────────────────────────────────────────────
    // Key: "<side>_<width>_<height>"  (stable for the life of a battle)
    // Value: { hull: Path2D, safe: Path2D }
    //   hull — the outermost ship boundary (waterline perimeter)
    //   safe — deck surface + all raised castle platforms (no drowning inside)
    const _cache = new Map();

    // ─────────────────────────────────────────────────────────────────────────
    // _buildPaths(ship)
    //
    // Constructs Path2D objects in SHIP-LOCAL SPACE (centered at 0,0) using
    // the EXACT SAME coordinates as drawNavalShips() in naval_battles.js.
    //
    // IF drawNavalShips() is ever edited, keep these in sync.
    // Search for: "── 2. ANTI-FOULING WATERLINE" and "── 5. DECK SURFACE"
    // and "── 6. STERN CASTLE" and "── 7. BOW CASTLE" in naval_battles.js.
    // ─────────────────────────────────────────────────────────────────────────
    function _buildPaths(s) {
        const w = s.width;
        const h = s.height;

        // ── HULL PATH ────────────────────────────────────────────────────────
        // Matches the "ANTI-FOULING WATERLINE" block — this is the outermost
        // visible ship boundary. Everything outside is water.
        // (The main hull is drawn just inside this; using the wider waterline
        //  path gives a small tolerance buffer at the ship edge, which prevents
        //  units snapping to water the moment they touch the visual rim.)
        const hull = new Path2D();
        hull.moveTo(-w*0.470, -h*0.375);
        hull.quadraticCurveTo(-w*0.08, -h*0.595,  w*0.390, -h*0.298);
        hull.lineTo( w*0.480, -h*0.120);
        hull.lineTo( w*0.480,  h*0.120);
        hull.lineTo( w*0.390,  h*0.298);
        hull.quadraticCurveTo(-w*0.08,  h*0.595, -w*0.470,  h*0.375);
        hull.lineTo(-w*0.545,  0);
        hull.closePath();

        // ── SAFE PATH ────────────────────────────────────────────────────────
        // Union of every area where a unit should NOT drown.
        // Uses multiple closed subpaths in one Path2D — isPointInPath returns
        // true if the point is inside ANY of them (nonzero winding rule).

        const safe = new Path2D();

        // 1. Main deck surface — matches "── 5. DECK SURFACE" in drawNavalShips
        safe.moveTo(-w*0.402, -h*0.272);
        safe.quadraticCurveTo(-w*0.02, -h*0.432,  w*0.300, -h*0.196);
        safe.lineTo( w*0.435, -h*0.080);
        safe.lineTo( w*0.435,  h*0.080);
        safe.lineTo( w*0.300,  h*0.196);
        safe.quadraticCurveTo(-w*0.02,  h*0.432, -w*0.402,  h*0.272);
        safe.lineTo(-w*0.442,  0);
        safe.closePath();

        // 2. Stern castle / 艉樓 — matches "Tier 1 base" in drawNavalShips
        //    This is the raised fighting platform at the stern (-X end).
        safe.moveTo(-w*0.462, -h*0.292);
        safe.lineTo(-w*0.196, -h*0.292);
        safe.lineTo(-w*0.176,  0);
        safe.lineTo(-w*0.196,  h*0.292);
        safe.lineTo(-w*0.462,  h*0.292);
        safe.lineTo(-w*0.512,  0);
        safe.closePath();

        // 3. Bow castle / 前樓 — matches "── 7. BOW CASTLE" in drawNavalShips
        //    The forward fire platform at the bow (+X end).
        safe.moveTo( w*0.216, -h*0.178);
        safe.lineTo( w*0.415, -h*0.070);
        safe.lineTo( w*0.415,  h*0.070);
        safe.lineTo( w*0.216,  h*0.178);
        safe.closePath();

        return { hull, safe };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // _getPaths(ship) — returns cached paths, building them on first access
    // ─────────────────────────────────────────────────────────────────────────
    function _getPaths(s) {
        // Key is stable: ships never resize during a battle
        const key = s.side + '_' + s.width + '_' + s.height;
        if (!_cache.has(key)) {
            _cache.set(key, _buildPaths(s));
        }
        return _cache.get(key);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // _hit(path, lx, ly) — point-in-path test in ship local space
    //
    // The scratch context has an identity transform (never modified),
    // so lx/ly are tested directly against path coordinates.
    // isPointInPath() is fast — O(segments), hardware-assisted in V8/SpiderMonkey.
    // ─────────────────────────────────────────────────────────────────────────
    function _hit(path, lx, ly) {
        return _sc.isPointInPath(path, lx, ly);
    }

window.getNavalSurfaceAt = function (worldX, worldY) {

    // ── Guard: If it's a standard land battle (no flags), everything is safe.
    // This protects all other game modes from being affected.
    if (!window.inNavalBattle && !window.inRiverBattle) return 'DECK';

// AFTER (fixed):
const _tileSize = (typeof BATTLE_TILE_SIZE !== 'undefined') ? BATTLE_TILE_SIZE : 0;
if (_tileSize && window.battleEnvironment && battleEnvironment.grid) {
    const tx = Math.floor(worldX / _tileSize);
    const ty = Math.floor(worldY / _tileSize);
    
    const _cols = (typeof BATTLE_COLS !== 'undefined') ? BATTLE_COLS : 0;
    const _rows = (typeof BATTLE_ROWS !== 'undefined') ? BATTLE_ROWS : 0;
    if (tx < 0 || ty < 0 || tx >= (_cols || 0) || ty >= (_rows || 0)) {
            if (window.inRiverBattle) return 'DECK'; 
        }

        const row = battleEnvironment.grid[tx];
        if (row) {
            const tile = row[ty];
            // If the tile is NOT River Water (4) and NOT Ocean Water (11), it's safe ground.
            if (tile !== 4 && tile !== 11) {
                return 'DECK'; 
            }
        } else if (window.inRiverBattle) {
            return 'DECK'; // Safety for missing columns
        }
    }

    // ── 2. SHIP HULL CHECK ─────────────────────────────────────────
    const env = window.navalEnvironment;
    if (env && env.ships && env.ships.length > 0) {
        const swayX = env.shipSwayX || 0;
        const swayY = env.shipSwayY || 0;

        // Path2D Deck Check (Loops through ships if they exist)
        for (const s of env.ships) {
            const lx = worldX - (s.x + swayX);
            const ly = worldY - (s.y + swayY);

            // Optimization: Skip if way outside ship bounds
            if (Math.abs(lx) > s.width * 0.68 || Math.abs(ly) > s.height * 0.68) continue;

            const paths = _getPaths(s);
            if (_hit(paths.hull, lx, ly)) {
                return 'DECK'; // Unit is safely on a ship deck
            }
        }
    }

    // ── 3. FINAL FALLBACK ───────────────────────────────────────
    // If we are in a River/Naval mode, over a water tile, and not on a ship... they drown.
    return 'WATER';
};

    // ── Cache hygiene ─────────────────────────────────────────────────────────
    // Clear cached paths when a new battle starts. Custom launcher calls
    // cleanupCustomBattleEnvironments(); campaign path triggers initNavalBattle().
    // Clearing is safe because _getPaths rebuilds on next access. Ships are
    // always re-generated at battle start, so old cache keys won't collide.

    const _wrapCleanup = function () {
        const orig = window.cleanupCustomBattleEnvironments;
        if (typeof orig === 'function' && !orig._detectorPatched) {
            window.cleanupCustomBattleEnvironments = function () {
                _cache.clear();
                orig.apply(this, arguments);
            };
            window.cleanupCustomBattleEnvironments._detectorPatched = true;
        }
    };

    const _wrapInit = function () {
        if (typeof window.initNavalBattle === 'function' && !window.initNavalBattle._detectorPatched) {
            const orig = window.initNavalBattle;
            window.initNavalBattle = function () {
                _cache.clear();
                orig.apply(this, arguments);
            };
            window.initNavalBattle._detectorPatched = true;
        }
    };

    // Try immediately (if scripts already loaded) and again on load
    _wrapCleanup();
    _wrapInit();
    document.addEventListener('DOMContentLoaded', function () { _wrapCleanup(); _wrapInit(); });
    window.addEventListener('load', function () { _wrapCleanup(); _wrapInit(); });

})();
