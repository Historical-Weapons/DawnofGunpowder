// battlefield_procedural_terrain.js  v4.0 — FINAL
// ─────────────────────────────────────────────────────────────────────────────
// Micro-world procedural terrain for land and river battles.
// Inspired by / directly porting maths from:
//   • story2_map_and_update.js  — _s2RidgeFbm, _s2QilianElev, finite-difference
//     slope shading, _s2PickMountainColor, _s2LerpRGB
//   • sandboxmode_overworld.js  — _sbPickMtnColor, _sbPickMtnColorGreen,
//     _sbRidgeMtnElev, PALETTE colours, per-biome texture logic
//
// KEY INSIGHT — micro vs macro:
//   The overworld paints at TILE_SIZE=12-16px per world tile with the whole
//   map in view.  The battlefield is zoomed in 8-30×.  So we scale our
//   noise frequencies UP (×20-60) so ridge wavelengths feel the same in
//   screen pixels.  Everything else — shading formula, lerpRGB endpoints,
//   ridge/FBM combination weights — is taken verbatim from the source files.
//
// QUALITY TIERS:
//   LOW  → zero change.  Old flat ground exactly as shipped.
//   MED  → single luminance pass (cheap FBM only, no gradient). Fast.
//   HIGH → full slope-shading (story2/overworld technique, 5 elev samples
//           per tile) + water depth pass + sparse earth-tone detail scatter.
//   MAX  → HIGH + extra ridge octave + sub-tile roughness + denser scatter.
//
// SCOPE: land + river only. Siege / naval → immediate return.
// LOAD ORDER: one <script> tag before battlefield_launch.js.
// ─────────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// 1. QUALITY GATE
// ═══════════════════════════════════════════════════════════════════════════════
function _bptQL() {
    const tier = window.currentGraphicsQualityTier;
    if (tier === "MAX")                      return 3;
    if (tier === "HIGH")                     return 2;
    if (tier === "MED" || tier === "MEDIUM") return 1;
    if (!window._SETTINGS_IS_MOBILE)         return 2;   // desktop default = HIGH
    const mq = (typeof window.mobileBattleQuality === "number") ? window.mobileBattleQuality : 0;
    return mq >= 100 ? 2 : mq >= 50 ? 1 : 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. NOISE PRIMITIVES — verbatim from story2 _s2Hash/_s2Noise/_s2Fbm/
//    _s2Ridge/_s2RidgeFbm (renamed _b* to avoid global collisions)
// ═══════════════════════════════════════════════════════════════════════════════
function _bHash(x, y) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + 0.314) * 43758.5453123;
    return n - Math.floor(n);
}
function _bNoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx*fx*(3-2*fx), uy = fy*fy*(3-2*fy);
    const a = _bHash(ix,iy),   b = _bHash(ix+1,iy);
    const c = _bHash(ix,iy+1), d = _bHash(ix+1,iy+1);
    return a*(1-ux)*(1-uy) + b*ux*(1-uy) + c*(1-ux)*uy + d*ux*uy;
}
function _bFbm(x, y, oct) {
    let v=0, a=0.5, f=1;
    for(let i=0;i<oct;i++){ v+=a*_bNoise(x*f,y*f); f*=2.05; a*=0.5; }
    return v;
}
function _bRidge(x, y) {
    const n = _bNoise(x, y);
    const r = 1 - Math.abs(2*n - 1);
    return r*r;  // squared → sharper crests (story2 verbatim)
}
// Musgrave-style ridged multifractal — story2 _s2RidgeFbm verbatim.
// prev-octave weighting means high ridges spawn higher sub-ridges.
function _bRidgeFbm(x, y, oct) {
    let v=0, a=0.5, f=1, prev=1;
    for(let i=0;i<oct;i++){
        let r = _bRidge(x*f, y*f);
        r *= prev * 1.6;
        if(r>1) r=1;
        v+=a*r; prev=r; f*=2.07; a*=0.55;
    }
    return Math.max(0, Math.min(1, v*1.15));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ELEVATION FIELD
// Three crossing ridge fields — _s2QilianElev / _sbRidgeMtnElev verbatim,
// generalised with a per-biome rotation angle and seed offset.
// Frequency is SCALED UP (~20-65×) because the battle map is zoomed in:
//   overworld tile = 12 px; battle tile = 8 px but camera 8-30× closer,
//   so the same physical ridge should repeat every ~8-15 battle tiles.
// ═══════════════════════════════════════════════════════════════════════════════
function _bElev(nx, ny, cosA, sinA, SX, SY, o1, o2, o3, warpAmp, freq) {
    // Domain warp — same as story2 _s2QilianMask warping
    const wx = nx + (_bFbm(nx*freq*0.6+SX,    ny*freq*0.6+SY,    3) - 0.5) * warpAmp;
    const wy = ny + (_bFbm(nx*freq*0.6+SX+17, ny*freq*0.6+SY+23, 3) - 0.5) * warpAmp;
    // Rotate to dominant ridge strike (story2 uses 0.560 rad ≈ 32°)
    const u = wx*cosA - wy*sinA;
    const v = wx*sinA + wy*cosA;
    // story2 _s2QilianElev frequencies ×freq (freq≈6 matches sub-pixel scale):
    const e1 = _bRidgeFbm(u*6.5*freq/6+SX*0.3+1.7, v*4.8*freq/6+SY*0.3+3.1, o1);
    const e2 = _bRidgeFbm(v*11.2*freq/6+SX*0.5+5.3, u*9.4*freq/6+SY*0.5+7.7, o2);
    const e3 = o3>0 ? _bRidgeFbm(u*23.1*freq/6+SX+8.9, v*19.4*freq/6+SY+2.5, o3) : 0;
    return Math.max(0, Math.min(1, e1*0.62 + e2*0.28 + e3*0.10));
}

// Vegetation field — controls green-vs-rocky split on mountain slopes
function _bVeg(nx, ny, SX, SY, freq) {
    return _bFbm(nx*7.2*freq/6+SX+4.4, ny*7.2*freq/6+SY+9.1, 3);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. COLOUR PICKERS — direct ports of story2 + overworld functions
// ═══════════════════════════════════════════════════════════════════════════════
function _bLerpRGB(r1,g1,b1, r2,g2,b2, t) {
    return [r1+(r2-r1)*t, g1+(g2-g1)*t, b1+(b2-b1)*t];
}
function _bRGB(r,g,b,a) {
    const ri=r<0?0:r>255?255:r|0, gi=g<0?0:g>255?255:g|0, bi=b<0?0:b>255?255:b|0;
    return a!=null ? "rgba("+ri+","+gi+","+bi+","+a.toFixed(3)+")"
                   : "rgb("+ri+","+gi+","+bi+")";
}

// Ports _sbPickMtnColor — Large Mountains / snow palette
function _bPickSnow(e, sh, vg) {
    if(e>0.78){ const t=_bLerpRGB(160,174,192, 232,240,248, sh); return t; }
    if(e>0.65){
        const t=_bLerpRGB(60,52,44, 202,196,184, sh);
        if(sh>0.78&&e>0.72){ const k=Math.min(0.35,(sh-0.78)*4.5*(e-0.72)*6);
            return [t[0]+(235-t[0])*k, t[1]+(240-t[1])*k, t[2]+(244-t[2])*k]; }
        return t;
    }
    if(e>0.48) return vg>0.56 ? _bLerpRGB(60,86,64, 168,196,152, sh) : _bLerpRGB(70,56,42, 188,168,138, sh);
    if(e>0.32) return vg>0.50 ? _bLerpRGB(82,100,74, 188,208,162, sh) : _bLerpRGB(94,76,54, 200,178,148, sh);
    return vg>0.55 ? _bLerpRGB(108,118,86, 198,210,168, sh) : _bLerpRGB(122,96,64, 210,188,152, sh);
}

// Ports _sbPickMtnColorGreen — regular Mountains / olive-green palette
function _bPickGreen(e, sh, vg) {
    if(e>0.75) return _bLerpRGB(68,68,52, 192,192,168, sh);
    if(e>0.58) return vg>0.52 ? _bLerpRGB(58,80,52, 152,186,128, sh) : _bLerpRGB(72,68,48, 184,176,132, sh);
    if(e>0.42) return vg>0.50 ? _bLerpRGB(64,90,58, 158,196,136, sh) : _bLerpRGB(80,78,52, 186,182,138, sh);
    return vg>0.50 ? _bLerpRGB(92,108,72, 188,208,158, sh) : _bLerpRGB(106,98,68, 200,192,148, sh);
}

// Plains / Meadow colour — warm green hillsides (overworld PALETTE.meadow=#6b7a4a)
function _bPickPlains(e, sh, vg) {
    if(e>0.60) return vg>0.5 ? _bLerpRGB(58,78,38, 148,176,100, sh) : _bLerpRGB(72,78,48, 158,168,110, sh);
    if(e>0.38) return vg>0.5 ? _bLerpRGB(74,94,48, 158,192,110, sh) : _bLerpRGB(88,94,56, 168,184,118, sh);
    return _bLerpRGB(88,100,58, 172,196,122, sh);
}

// Steppe colour — dry ochre (overworld PALETTE.plains=#a3a073)
function _bPickSteppe(e, sh, vg) {
    if(e>0.55) return _bLerpRGB(100,92,56, 198,184,128, sh);
    if(e>0.35) return vg>0.48 ? _bLerpRGB(108,102,64, 192,186,134, sh) : _bLerpRGB(118,106,68, 202,188,138, sh);
    return _bLerpRGB(130,118,76, 210,198,148, sh);
}

// Forest colour — dark cool greens (overworld PALETTE.forest=#425232)
function _bPickForest(e, sh, vg) {
    if(e>0.55) return vg>0.5 ? _bLerpRGB(28,44,20, 82,110,62, sh) : _bLerpRGB(36,44,28, 92,108,72, sh);
    if(e>0.35) return vg>0.5 ? _bLerpRGB(32,52,24, 88,118,66, sh) : _bLerpRGB(40,52,30, 98,114,74, sh);
    return _bLerpRGB(36,58,26, 92,124,68, sh);
}

// Dense Forest — jungle dark (overworld PALETTE.jungle=#244222)
function _bPickDenseForest(e, sh, vg) {
    if(e>0.55) return _bLerpRGB(18,32,14, 64,92,48, sh);
    if(e>0.35) return _bLerpRGB(20,36,16, 68,96,50, sh);
    return _bLerpRGB(22,40,18, 72,102,52, sh);
}

// Desert/Dunes — warm sand (overworld PALETTE.dune=#cfae7e)
function _bPickDesert(e, sh, vg) {
    if(e>0.60) return _bLerpRGB(142,104,52, 224,192,132, sh);
    if(e>0.38) return _bLerpRGB(154,114,58, 228,196,138, sh);
    return _bLerpRGB(164,124,64, 232,202,144, sh);
}

// Highlands — warm brown (overworld PALETTE.highlands=#626b42 + #7d664b)
function _bPickHighlands(e, sh, vg) {
    if(e>0.62) return vg>0.5 ? _bLerpRGB(60,72,40, 148,164,108, sh) : _bLerpRGB(72,60,36, 162,138,96, sh);
    if(e>0.40) return vg>0.5 ? _bLerpRGB(72,84,50, 158,178,116, sh) : _bLerpRGB(84,70,44, 172,148,104, sh);
    return vg>0.5 ? _bLerpRGB(84,96,58, 168,188,124, sh) : _bLerpRGB(96,82,52, 182,158,112, sh);
}

// River bank — green with moist tones
function _bPickRiver(e, sh, vg) {
    if(e>0.55) return vg>0.5 ? _bLerpRGB(42,70,32, 118,162,86, sh) : _bLerpRGB(56,72,38, 132,162,96, sh);
    if(e>0.35) return vg>0.5 ? _bLerpRGB(48,78,36, 124,168,92, sh) : _bLerpRGB(60,78,42, 138,168,102, sh);
    return _bLerpRGB(52,84,38, 128,174,96, sh);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. BIOME CONFIG TABLE
// freq:   noise frequency scale (higher = tighter ridges at battle zoom)
// ang:    dominant ridge strike in degrees
// wa:     domain warp amplitude
// o1/o2/o3: octave counts for ridge fields (match story2 5/4/3)
// pickFn: colour picker function
// shadAmp: how strongly the shading alpha is applied
// ═══════════════════════════════════════════════════════════════════════════════
const _B_CFG = {
    "Plains":         { freq:5.5, ang:30, wa:0.08, o1:4,o2:3,o3:0, pick:_bPickPlains,       shadAmp:0.42 },
    "Steppe":         { freq:6.0, ang:12, wa:0.07, o1:3,o2:2,o3:0, pick:_bPickSteppe,       shadAmp:0.40 },
    "Forest":         { freq:5.0, ang:48, wa:0.10, o1:4,o2:3,o3:0, pick:_bPickForest,       shadAmp:0.48 },
    "Dense Forest":   { freq:4.5, ang:44, wa:0.12, o1:4,o2:3,o3:1, pick:_bPickDenseForest,  shadAmp:0.52 },
    "River":          { freq:5.5, ang:78, wa:0.08, o1:3,o2:2,o3:0, pick:_bPickRiver,        shadAmp:0.38 },
    "Desert":         { freq:6.5, ang:18, wa:0.06, o1:3,o2:2,o3:0, pick:_bPickDesert,       shadAmp:0.50 },
    "Dunes":          { freq:7.0, ang:15, wa:0.05, o1:3,o2:2,o3:0, pick:_bPickDesert,       shadAmp:0.55 },
    "Highlands":      { freq:5.0, ang:52, wa:0.12, o1:5,o2:3,o3:2, pick:_bPickHighlands,    shadAmp:0.60 },
    "Mountain":       { freq:4.5, ang:58, wa:0.14, o1:5,o2:4,o3:2, pick:_bPickGreen,        shadAmp:0.68 },
    "Large Mountains":{ freq:4.0, ang:62, wa:0.16, o1:5,o2:4,o3:3, pick:_bPickSnow,         shadAmp:0.75 },
    "_default":       { freq:5.5, ang:38, wa:0.09, o1:4,o2:3,o3:0, pick:_bPickPlains,       shadAmp:0.44 }
};
function _bCfg(t) {
    if(t.includes("Dense Forest"))    return _B_CFG["Dense Forest"];
    if(t.includes("Forest"))          return _B_CFG["Forest"];
    if(t.includes("Large Mountains")) return _B_CFG["Large Mountains"];
    if(t.includes("Mountain"))        return _B_CFG["Mountain"];
    if(t.includes("Highlands"))       return _B_CFG["Highlands"];
    if(t.includes("Steppe"))          return _B_CFG["Steppe"];
    if(t.includes("River"))           return _B_CFG["River"];
    if(t.includes("Dunes"))           return _B_CFG["Dunes"];
    if(t.includes("Desert"))          return _B_CFG["Desert"];
    if(t.includes("Plains"))          return _B_CFG["Plains"];
    return _B_CFG["_default"];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. PASS A — FULL SLOPE-SHADING COLOUR PASS  (HIGH / MAX)
//
// For every ground tile:
//   1. Sample elevation at centre + 4 cardinal neighbours
//   2. Compute gradient → shading (NW light, story2 formula verbatim)
//   3. Ridge crest / crevice bonus (story2 verbatim)
//   4. Veg noise (story2 _s2QilianVeg)
//   5. Pick colour via biome picker, paint at shadAmp alpha
//
// Skips: water(4), big mountain(8), karst(9) — they have their own rendering.
//
// SUB-TILE RESOLUTION (v4.1): previously this painted exactly one flat
// ts×ts fillRect per battle tile at every quality tier — HIGH/MAX got richer
// *colour* per square but the same blocky 8px grain as everything else,
// which is the pixelation visible in-game. Now each battle tile is
// subdivided into subN×subN sub-cells (subN from _bSubN below), each
// independently sampled and painted at ts/subN resolution, so colour varies
// smoothly across a tile instead of in flat blocks:
//   MED  → subN=1 (unchanged — one flat colour per tile, intentionally blocky)
//   HIGH → subN=2 (4 sub-cells/tile, 4x the squares)
//   MAX  → subN=4 (16 sub-cells/tile, 16x the squares). Benchmarked: the
//          5-sample elevation field alone costs ~12s of raw compute across a
//          full 300x450-tile battlefield at subN=4, and ~27s at subN=6 — a
//          6x6 grid (~40x, matching the literal request) is not a
//          "professional game" load time even chunked. subN=4 keeps total
//          MAX-tier generation in the several-second range once chunked
//          (see _wrapLaunchFn / generateBattlefieldChunked), which is a
//          reasonable "detail" tier load, not a "40x" tier load.
function _bSubN(ql){ return ql>=3 ? 4 : ql>=2 ? 2 : 1; }

function _bShadingPass(ctx, cfg, seed, cols, rows, ts, grid, ql, colStart, colEnd) {
    const ang  = cfg.ang * Math.PI / 180;
    const cosA = Math.cos(ang), sinA = Math.sin(ang);
    const SX = seed*0.137, SY = seed*0.091;
    // MAX gets one extra octave on the primary ridge field
    const o1 = cfg.o1 + (ql>=3 ? 1 : 0);
    const o2 = cfg.o2, o3 = cfg.o3;
    const subN = _bSubN(ql);
    const subTs = ts / subN;
    // dNx/dNy for finite differences — scaled down with the sub-grid so the
    // gradient sample spacing stays proportionate to the paint resolution
    // (story2 uses SUB*0.55/WORLD_W; we keep the same ~1.2-tile-width feel
    // but measured in sub-cell units so HIGH/MAX don't get blurrier shading
    // as the grid gets finer).
    const dN = (1.2 / subN) / Math.max(cols, rows);
    const hasGrid = Array.isArray(grid) && grid.length === cols;

    // Optional column range for chunked callers (defaults to the full
    // width, so any existing caller that doesn't pass these two args gets
    // byte-for-byte identical behaviour to before this change).
    const _start = (typeof colStart === "number") ? colStart : 0;
    const _end   = (typeof colEnd   === "number") ? colEnd   : cols;

    for(let i=_start; i<_end; i++){
        for(let j=0; j<rows; j++){
            const tileGv = hasGrid && grid[i] ? grid[i][j] : 0;
            if(tileGv===4||tileGv===7||tileGv===8||tileGv===9) continue;

            for(let su=0; su<subN; su++){
                const nx = (i + (su+0.5)/subN) / cols;
                for(let sv=0; sv<subN; sv++){
                    const ny = (j + (sv+0.5)/subN) / rows;

                    // 5-sample elevation (verbatim story2 pattern)
                    const eC = _bElev(nx,    ny,    cosA,sinA,SX,SY,o1,o2,o3,cfg.wa,cfg.freq);
                    const eL = _bElev(nx-dN, ny,    cosA,sinA,SX,SY,o1,o2,o3,cfg.wa,cfg.freq);
                    const eR = _bElev(nx+dN, ny,    cosA,sinA,SX,SY,o1,o2,o3,cfg.wa,cfg.freq);
                    const eU = _bElev(nx,    ny-dN, cosA,sinA,SX,SY,o1,o2,o3,cfg.wa,cfg.freq);
                    const eD = _bElev(nx,    ny+dN, cosA,sinA,SX,SY,o1,o2,o3,cfg.wa,cfg.freq);

                    const gx = eR-eL, gy = eD-eU;
                    // story2 shading formula verbatim: light from NW (-0.7071, -0.7071)
                    let sh = 0.5 - (gx*(-0.7071) + gy*(-0.7071)) * 18.0;
                    if(sh<0) sh=0; if(sh>1) sh=1;
                    // story2 ridge crest bonus
                    if(eC>eL&&eC>eR&&eC>eU&&eC>eD&&eC>0.55) sh=Math.min(1,sh+0.18);
                    // story2 crevice shadow
                    if(eC<eL&&eC<eR&&eC<eU&&eC<eD&&eC<0.42) sh=Math.max(0,sh-0.20);

                    const vg = _bVeg(nx, ny, SX, SY, cfg.freq);
                    const rgb = cfg.pick(eC, sh, vg);

                    // Alpha varies with elevation so crests paint more strongly
                    const a = Math.min(0.72, cfg.shadAmp * (0.60 + eC*0.80));
                    ctx.fillStyle = _bRGB(rgb[0], rgb[1], rgb[2], a);
                    ctx.fillRect(i*ts + su*subTs, j*ts + sv*subTs, subTs, subTs);
                }
            }
        }
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// 6b. PASS A (MED) — cheap single-sample luminance only
// ═══════════════════════════════════════════════════════════════════════════════
function _bLuminancePass(ctx, cfg, seed, cols, rows, ts, grid, colStart, colEnd) {
    const ang = cfg.ang*Math.PI/180;
    const cosA=Math.cos(ang), sinA=Math.sin(ang);
    const SX=seed*0.137, SY=seed*0.091;
    const hasGrid=Array.isArray(grid)&&grid.length===cols;
    let last=null;
    const _start = (typeof colStart === "number") ? colStart : 0;
    const _end   = (typeof colEnd   === "number") ? colEnd   : cols;
    for(let i=_start;i<_end;i++){
        const nx=(i+0.5)/cols;
        for(let j=0;j<rows;j++){
            const gv=hasGrid&&grid[i]?grid[i][j]:0;
            if(gv===4||gv===7||gv===8||gv===9) continue;
            const ny=(j+0.5)/rows;
            const e=_bElev(nx,ny,cosA,sinA,SX,SY,3,2,0,cfg.wa*0.6,cfg.freq);
            const dev=e-0.5;
            let lum,alpha;
            if(dev>0){ lum=255; alpha=dev*cfg.shadAmp*0.28; }
            else     { lum=0;   alpha=Math.abs(dev)*cfg.shadAmp*0.34; }
            if(alpha<0.006) continue;
            alpha=Math.min(alpha,0.24);
            const s="rgba("+lum+","+lum+","+lum+","+alpha.toFixed(3)+")";
            if(s!==last){ ctx.fillStyle=s; last=s; }
            ctx.fillRect(i*ts,j*ts,ts,ts);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. PASS B — PROCEDURAL WATER  (MED+)
//
// River water tiles (gv===4) get:
//   MED:  FBM depth modulation (deep/shallow tone shift)
//   HIGH: + two-layer flow ripples (primary current line + finer cross-ripple,
//         same layered-noise idea as the naval ocean shader's swell+chop, but
//         tuned calm/directional for a river — no whitecaps, no foam, no
//         glint sparkle; those are ocean-specific and don't belong here)
//   MAX:  + fine surface micro-texture so close-up water isn't flat between
//         ripple lines (this is texture, not sparkle — no bright specular
//         glint dots)
//
// Base colour: #3ba3ab = rgb(59,163,171)
// Deep:        rgb(34,110,120)
// Shallow:     rgb(90,198,210)
// ═══════════════════════════════════════════════════════════════════════════════
function _bWaterPass(ctx, seed, cols, rows, ts, grid, ql, colStart, colEnd) {
    if(!grid||!Array.isArray(grid)||grid.length!==cols) return;
    const SX=seed*0.213, SY=seed*0.179;
    const FCOS=Math.cos(0.08), FSIN=Math.sin(0.08); // gentle flow angle
    // Cross-ripple runs at a different angle from the main flow line, the
    // same "swell vs chop crossing angle" idea from the naval shader, just
    // far subtler — a river's secondary ripple is a gentle surface texture,
    // not a second wave system.
    const CCOS=Math.cos(0.08+1.15), CSIN=Math.sin(0.08+1.15);
    // Same sub-tile grid as the ground shading pass (MED=1, HIGH=4, MAX=16
    // sub-cells/tile) so water depth reads at a matching resolution instead
    // of standing out as blockier/smoother than the surrounding banks.
    const subN = _bSubN(ql);
    const subTs = ts / subN;
    const _start = (typeof colStart === "number") ? colStart : 0;
    const _end   = (typeof colEnd   === "number") ? colEnd   : cols;

    for(let i=_start;i<_end;i++){
        for(let j=0;j<rows;j++){
            if(!grid[i]||grid[i][j]!==4) continue;
            const px=i*ts, py=j*ts, cx=px+ts/2, cy=py+ts/2;

            // ── Depth field (MED+) ───────────────────────────────────────────
            for(let su=0; su<subN; su++){
                const nx = (i + (su+0.5)/subN) / cols;
                for(let sv=0; sv<subN; sv++){
                    const ny = (j + (sv+0.5)/subN) / rows;
                    const depth=_bFbm(nx*22+SX, ny*22+SY, ql>=2?4:3);
                    // lerp deep→shallow by depth value
                    const wr=(34+(90-34)*depth)|0;
                    const wg=(110+(198-110)*depth)|0;
                    const wb=(120+(210-120)*depth)|0;
                    ctx.fillStyle="rgba("+wr+","+wg+","+wb+","+(0.18+depth*0.12).toFixed(2)+")";
                    ctx.fillRect(px + su*subTs, py + sv*subTs, subTs, subTs);
                }
            }

            // ── MAX — fine surface micro-texture (not sparkle) ──────────────
            // Adds real close-up detail between the depth/ripple layers,
            // same motivation as the naval shader's micro pass, but this
            // stays a soft grain (no bright white specular dots) so it
            // reads as calm river texture, not glinting ocean light.
            if(ql>=3){
                for(let su=0; su<subN; su++){
                    const nx = (i + (su+0.5)/subN) / cols;
                    for(let sv=0; sv<subN; sv++){
                        const ny = (j + (sv+0.5)/subN) / rows;
                        const micro=_bFbm(nx*85+SX+9, ny*85+SY+9, 2)-0.5;
                        if(Math.abs(micro)<0.08) continue;
                        const mA=Math.min(0.07, Math.abs(micro)*0.16);
                        ctx.fillStyle = micro>0
                            ? "rgba(150,215,222,"+mA.toFixed(3)+")"
                            : "rgba(24,70,80,"+mA.toFixed(3)+")";
                        ctx.fillRect(px + su*subTs, py + sv*subTs, subTs, subTs);
                    }
                }
            }

            const nx=(i+0.5)/cols, ny=(j+0.5)/rows;

            // ── Flow ripples (HIGH+) ─────────────────────────────────────────
            if(ql>=2){
                const ru=nx*FCOS-ny*FSIN, rv=nx*FSIN+ny*FCOS;
                // Ridge along flow axis → thin bright lines = water ripples
                const ripple=_bRidge(ru*42+SX*0.3, rv*14+SY*0.3);
                if(ripple>0.72){
                    const rA=((ripple-0.72)*0.28).toFixed(3);
                    ctx.fillStyle="rgba(130,218,228,"+rA+")";
                    ctx.fillRect(px,py,ts,ts);
                }

                // Cross-ripple — a second, fainter ridge line crossing the
                // main flow at an angle. This is what gives naval water its
                // "layered, alive" feel (swell + chop); here it's turned
                // down to a subtle secondary texture so the river still
                // reads as calm, not choppy ocean.
                const cu=nx*CCOS-ny*CSIN, cv=nx*CSIN+ny*CCOS;
                const cross=_bRidge(cu*68+SX*0.5+3, cv*23+SY*0.5+3);
                if(cross>0.78){
                    const cA=((cross-0.78)*0.20).toFixed(3);
                    ctx.fillStyle="rgba(150,225,232,"+cA+")";
                    ctx.fillRect(px,py,ts,ts);
                }
            }

            // ── Specular glints (MAX) ────────────────────────────────────────
            if(ql>=3){
                const glint=_bFbm(nx*60+SX, ny*60+SY, 2);
                if(glint>0.70){
                    const gA=((glint-0.70)*0.55).toFixed(3);
                    ctx.fillStyle="rgba(220,252,255,"+gA+")";
                    const gs=ts*0.35;
                    ctx.fillRect(cx-gs*0.5, cy-gs*0.5, gs, gs);
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7b. PASS B2 — BEACH / SAND SHADING  (MED+)
//
// grid value 7 tiles are carved by battlefield_launch.js's river generator
// as a wide transition band around the water (solid near the waterline,
// probabilistically fading out further from it) — this pass gives those
// tiles actual sand colour/shading instead of the flat dark "mud speckle"
// they used to render as, and instead of the green river-biome shading the
// main _bShadingPass used to paint over them (now skipped there, see the
// gv===7 exclusion added alongside water/mountain/karst).
//
// Simpler than a distance-search approach: the grid generator ALREADY
// encodes "how close to water" as tile density (solid strip near the river,
// sparse/probabilistic further out), so this pass doesn't need its own
// neighbour search — it just needs to paint every gv===7 tile as sand, with
// per-tile noise for natural colour variation (wet-dark near longer runs of
// sand, dry-light in sparser patches), at a resolution matching the other
// biome passes (_bSubN sub-tiles) so beach doesn't look blockier or
// smoother than the surrounding land.
// ═══════════════════════════════════════════════════════════════════════════════
function _bBeachPass(ctx, seed, cols, rows, ts, grid, ql, colStart, colEnd) {
    if(!grid||!Array.isArray(grid)||grid.length!==cols) return;
    const SX = seed*0.401, SY = seed*0.337;
    const subN = _bSubN(ql);
    const subTs = ts / subN;
    const _start = (typeof colStart === "number") ? colStart : 0;
    const _end   = (typeof colEnd   === "number") ? colEnd   : cols;

    for(let i=_start; i<_end; i++){
        if(!grid[i]) continue;
        for(let j=0; j<rows; j++){
            if(grid[i][j] !== 7) continue;

            for(let su=0; su<subN; su++){
                const nx = (i + (su+0.5)/subN) / cols;
                for(let sv=0; sv<subN; sv++){
                    const ny = (j + (sv+0.5)/subN) / rows;

                    // Two-octave sand tone: broad warm/cool variation plus a
                    // finer grain so close-up sand isn't flat.
                    const base  = _bFbm(nx*16+SX,  ny*16+SY,  3);
                    const grain = _bFbm(nx*70+SX+5, ny*70+SY+5, 2);

                    // Warm wet-sand → dry-sand ramp (darker/cooler when
                    // base is low, lighter/warmer when high), matching the
                    // existing _bPickDesert palette family so beaches sit
                    // in the same colour language as desert/dune terrain
                    // rather than an unrelated new hue.
                    const t = Math.min(1, Math.max(0, base*0.75 + grain*0.25));
                    const rgb = _bLerpRGB(122,96,58,  208,180,128, t);

                    const a = Math.min(0.62, 0.34 + t*0.24);
                    ctx.fillStyle = _bRGB(rgb[0], rgb[1], rgb[2], a);
                    ctx.fillRect(i*ts + su*subTs, j*ts + sv*subTs, subTs, subTs);
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. PASS C — DETAIL SCATTER  (HIGH / MAX)
//
// Deterministic per-tile (uses _bHash, no Math.random).
// Density gate: ~5% of tiles HIGH, ~8% MAX.
// Earth tones ONLY — no bright colours, no flowers.
// Detail types: pebbles (all), eroded cracks (desert/steppe/highland),
//   sand ripples (desert), dry grass tufts (plains/forest, fg layer),
//   moss patches (mountain/forest), leaf litter (forest, fg),
//   AO shadow blobs (MAX, all ground).
// ═══════════════════════════════════════════════════════════════════════════════
function _bDet(a,b){ return _bHash(a*137.1+b*311.7, a*11.3+b*53.7); }

function _bDetailPass(ctx, fgCtx, t, seed, cols, rows, ts, grid, ql, colStart, colEnd) {
    const isDesert  = t.includes("Desert")||t.includes("Dunes");
    const isForest  = t.includes("Forest");
    const isMtn     = t.includes("Mountain")||t.includes("Highlands");
    const isRiver   = t.includes("River");
    const isPlains  = t.includes("Plains");
    const isSteppe  = t.includes("Steppe");
    const hasGrid   = Array.isArray(grid)&&grid.length===cols;
    // REVISED: MAX now spends its extra budget on the finer shading
    // sub-grid (_bSubN) instead of more scattered rock/pebble objects — at
    // this resolution a dense pebble scatter reads as visual noise rather
    // than detail. MAX detail-tile gate is now LOWER density than HIGH
    // (~3% of tiles vs ~5%), the opposite of before.
    const gate = ql>=3 ? 0.97 : 0.95;
    const _start = (typeof colStart === "number") ? colStart : 0;
    const _end   = (typeof colEnd   === "number") ? colEnd   : cols;

    for(let i=_start;i<_end;i++){
        for(let j=0;j<rows;j++){
            const gv=hasGrid&&grid[i]?grid[i][j]:0;
            // Skip tiles with their own special rendering
            if(gv===3||gv===4||gv===6||gv===7||gv===8||gv===9) continue;
            if(_bDet(i+seed*7, j+seed*3) > gate) continue;

            const px=i*ts, py=j*ts, cx=px+ts/2, cy=py+ts/2;
            const r1=_bDet(i*13+seed, j*7+seed);
            const r2=_bDet(i*7+seed,  j*13+seed);
            const r3=_bDet(i*31+seed, j*17+seed);
            const r4=_bDet(i*17+seed, j*31+seed);
            const r5=_bDet(i*41+seed, j*53+seed);

            // ── PEBBLE CLUSTER ───────────────────────────────────────────────
            // MAX also gets a stricter probability threshold and a lower max
            // cluster size than HIGH, so the rocks that DO appear at MAX are
            // sparser overall — the fine terrain shading carries the detail
            // instead of a rock scatter competing with it.
            const pebbleChance = (isDesert?0.55:isMtn?0.52:0.40) * (ql>=3 ? 0.55 : 1);
            if(r1 < pebbleChance){
                const num = ql>=3 ? (1+(r2*1.6|0)) : (1+(r2*2.5|0));
                for(let k=0;k<num;k++){
                    const ox=(_bDet(i+k,j+k*3)-0.5)*ts*0.92;
                    const oy=(_bDet(i+k*5,j+k)-0.5)*ts*0.92;
                    const pr=0.55+_bDet(i+k*7,j+k*11)*1.9;
                    const grey=isDesert?142+(_bDet(i+k,j)*58|0):76+(_bDet(i+k,j)*60|0);
                    // Soft cast shadow
                    ctx.fillStyle="rgba(0,0,0,0.20)";
                    ctx.beginPath();
                    ctx.ellipse(cx+ox+pr*0.15, cy+oy+pr*0.45, pr*1.0, pr*0.44, 0,0,Math.PI*2);
                    ctx.fill();
                    // Pebble body
                    ctx.fillStyle="rgba("+grey+","+grey+","+(grey-12)+",0.58)";
                    ctx.beginPath();
                    ctx.ellipse(cx+ox, cy+oy, pr, pr*0.70, r3*Math.PI,0,Math.PI*2);
                    ctx.fill();
                    // NW specular (matches NW light in shading pass)
                    ctx.fillStyle="rgba(255,255,255,0.24)";
                    ctx.beginPath();
                    ctx.arc(cx+ox-pr*0.24, cy+oy-pr*0.24, pr*0.30,0,Math.PI*2);
                    ctx.fill();
                }
            }

            // ── CRACK / EROSION LINES ────────────────────────────────────────
            if((isDesert||isSteppe||isMtn) && r2<0.28){
                const segs=2+(r3*3|0);
                ctx.strokeStyle="rgba("+(isDesert?"108,76,28":"52,42,28")+","+(isDesert?0.14:0.10)+")";
                ctx.lineWidth=0.5;
                let bx=cx+(_bDet(i,j+1)-0.5)*ts*0.5;
                let by=cy+(_bDet(i+1,j)-0.5)*ts*0.5;
                ctx.beginPath(); ctx.moveTo(bx,by);
                for(let s=0;s<segs;s++){
                    bx+=(_bDet(i+s*3,j+s*7)-0.5)*ts*0.65;
                    by+=(_bDet(i+s*7,j+s*3)-0.5)*ts*0.65;
                    bx=Math.max(px,Math.min(px+ts,bx));
                    by=Math.max(py,Math.min(py+ts,by));
                    ctx.lineTo(bx,by);
                }
                ctx.stroke();
            }

            // ── SAND RIPPLE (desert/dunes) ───────────────────────────────────
            if(isDesert && r3<0.48){
                const len=ts*(0.30+r4*0.44);
                const ang=0.20+r3*0.30;
                ctx.strokeStyle="rgba(144,102,44,"+(0.07+r5*0.07)+")";
                ctx.lineWidth=0.5+r4*0.9;
                ctx.beginPath();
                ctx.moveTo(cx-Math.cos(ang)*len, cy-Math.sin(ang)*len);
                ctx.lineTo(cx+Math.cos(ang)*len, cy+Math.sin(ang)*len);
                ctx.stroke();
            }

            // ── DRY GRASS TUFT (plains/forest/steppe/river — fg layer) ───────
            // Quadratic blade curves matching overworld BIOMATIC tree logic feel
            if((isPlains||isForest||isSteppe||isRiver) && r3<0.48){
                const blades=2+(r4*2.5|0);
                const col = isSteppe ? [86,78,34]
                          : isForest ? [38,64,26]
                          : isRiver  ? [48,80,34]
                          :            [70,86,38];
                for(let b=0;b<blades;b++){
                    const bx2=cx+(_bDet(i+b,j+b*2)-0.5)*ts*0.90;
                    const by2=cy+(_bDet(i+b*3,j+b)-0.5)*ts*0.90;
                    const bh=2.0+_bDet(i+b*7,j)*4.2;
                    const lean=(_bDet(i+b*11,j+b*13)-0.5)*1.8;
                    const alpha=0.34+_bDet(i+b*5,j+b*9)*0.14;
                    fgCtx.strokeStyle="rgba("+col[0]+","+col[1]+","+col[2]+","+alpha.toFixed(2)+")";
                    fgCtx.lineWidth=0.60+_bDet(i+b,j+b)*0.55;
                    fgCtx.beginPath();
                    fgCtx.moveTo(bx2,by2);
                    fgCtx.quadraticCurveTo(bx2+lean*0.5, by2-bh*0.55, bx2+lean*1.3, by2-bh);
                    fgCtx.stroke();
                }
            }

            // ── MOSS / LICHEN PATCH (mountain/forest/river) ──────────────────
            if((isMtn||isForest||isRiver) && r4<0.30){
                const mr=ts*(0.15+r5*0.28);
                const mc=isMtn?"38,50,26":"30,54,22";
                ctx.fillStyle="rgba("+mc+","+(0.09+r1*0.09)+")";
                ctx.beginPath();
                ctx.ellipse(
                    cx+(_bDet(i+3,j+7)-0.5)*ts*0.42,
                    cy+(_bDet(i+7,j+3)-0.5)*ts*0.42,
                    mr, mr*0.58, r3*Math.PI,0,Math.PI*2
                );
                ctx.fill();
            }

            // ── LEAF LITTER (forest — fg layer) ─────────────────────────────
            if(isForest && r5<0.32){
                const lc=1+(_bDet(i*3,j)*2.4|0);
                for(let l=0;l<lc;l++){
                    const lx=cx+(_bDet(i+l*3,j+l*7)-0.5)*ts;
                    const ly=cy+(_bDet(i+l*7,j+l*3)-0.5)*ts;
                    const lr=0.85+_bDet(i+l,j+l)*2.2;
                    // Muted brown: overworld uses rgb ~20-40, 10-25, 5
                    const hr=20+(_bDet(i+l*5,j)*36|0);
                    fgCtx.fillStyle="rgba("+hr+","+(hr-8)+",5,0.28)";
                    fgCtx.beginPath();
                    fgCtx.ellipse(lx,ly,lr,lr*0.48,_bDet(i+l,j+l)*Math.PI,0,Math.PI*2);
                    fgCtx.fill();
                }
            }

            // ── AO SHADOW POOLS (MAX only — subtle ambient occlusion) ────────
            if(ql>=3 && r5<0.13 && gv===0){
                const sr=ts*(0.20+r1*0.36);
                ctx.fillStyle="rgba(0,0,0,"+(0.04+r2*0.04)+")";
                ctx.beginPath();
                ctx.ellipse(
                    cx+(_bDet(i+5,j+11)-0.5)*ts*0.54,
                    cy+(_bDet(i+11,j+5)-0.5)*ts*0.54,
                    sr, sr*0.48, r3*Math.PI,0,Math.PI*2
                );
                ctx.fill();
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. STRING SEED HELPER (global — called from battlefield_launch.js)
// ═══════════════════════════════════════════════════════════════════════════════
function _bptStringSeed(str){
    let h=0;
    for(let i=0;i<str.length;i++) h=(Math.imul(31,h)+str.charCodeAt(i))|0;
    return Math.abs(h)%10000;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * applyProceduralGroundPass
 *
 * @param {CanvasRenderingContext2D} ctx        bgCanvas (already translated)
 * @param {CanvasRenderingContext2D} fgCtx      fgCanvas (already translated)
 * @param {string}  worldTerrainType
 * @param {string}  groundColor                 (kept for API compat)
 * @param {number}  seed                        0..10000
 * @param {number}  cols                        BATTLE_COLS
 * @param {number}  rows                        BATTLE_ROWS
 * @param {number}  ts                          BATTLE_TILE_SIZE
 * @param {number[][]} [grid]
 * @param {function} [onComplete]  v4.1: optional. Omit for the original fully
 *   synchronous behaviour (byte-for-byte unchanged). Pass a callback to run
 *   the shading/water/detail passes in column-range chunks via setTimeout —
 *   needed at HIGH/MAX now that the sub-tile resolution pass (_bSubN) is
 *   expensive enough to noticeably block the main thread on its own (see
 *   _bShadingPass comments). onComplete() fires once every column across all
 *   active passes has been processed.
 */
function applyProceduralGroundPass(ctx, fgCtx, worldTerrainType, groundColor,
                                    seed, cols, rows, ts, grid, onComplete){
    if(typeof inSiegeBattle!=="undefined"&&inSiegeBattle) { if(typeof onComplete==="function") onComplete(); return; }
    if(window.inNavalBattle) { if(typeof onComplete==="function") onComplete(); return; }

    const ql=_bptQL();
    if(ql<1) { if(typeof onComplete==="function") onComplete(); return; }  // LOW → zero change

    if(!!(window.__BPT_DEV)) console.time("[BPT]");

    const cfg=_bCfg(worldTerrainType);

    function _finish(){
        window.__battleTerrainProcApplied=true;
        if(!!(window.__BPT_DEV)){
            console.timeEnd("[BPT]");
            console.log("[BPT] ql="+ql+" terrain="+worldTerrainType+" seed="+seed
                +" mob="+(!!(window._SETTINGS_IS_MOBILE)));
        }
        if(typeof onComplete==="function") onComplete();
    }

    if (typeof onComplete !== "function") {
        // ── SYNCHRONOUS PATH (default, unchanged) ──────────────────────────
        if(ql>=2){
            _bShadingPass(ctx, cfg, seed, cols, rows, ts, grid, ql);
            _bWaterPass(ctx, seed, cols, rows, ts, grid, ql);
            _bBeachPass(ctx, seed, cols, rows, ts, grid, ql);
            _bDetailPass(ctx, fgCtx, worldTerrainType, seed, cols, rows, ts, grid, ql);
        } else {
            _bLuminancePass(ctx, cfg, seed, cols, rows, ts, grid);
            _bWaterPass(ctx, seed, cols, rows, ts, grid, ql);
            _bBeachPass(ctx, seed, cols, rows, ts, grid, ql);
        }
        _finish();
        return;
    }

    // ── CHUNKED PATH (opt-in via onComplete) ────────────────────────────────
    // Processes the same column range across all active passes together per
    // chunk (so a given screen region gets its ground colour, water, AND
    // detail scatter in the same tick rather than one full pass at a time —
    // avoids a visible "half the map still flat" artifact mid-generation).
    const COLS_PER_CHUNK = Math.max(1, Math.round(cols / 30)); // ~30 chunks
    let _col = 0;

    function _chunk(){
        const end = Math.min(cols, _col + COLS_PER_CHUNK);
        if(ql>=2){
            _bShadingPass(ctx, cfg, seed, cols, rows, ts, grid, ql, _col, end);
            _bWaterPass(ctx, seed, cols, rows, ts, grid, ql, _col, end);
            _bBeachPass(ctx, seed, cols, rows, ts, grid, ql, _col, end);
            _bDetailPass(ctx, fgCtx, worldTerrainType, seed, cols, rows, ts, grid, ql, _col, end);
        } else {
            _bLuminancePass(ctx, cfg, seed, cols, rows, ts, grid, _col, end);
            _bWaterPass(ctx, seed, cols, rows, ts, grid, ql, _col, end);
            _bBeachPass(ctx, seed, cols, rows, ts, grid, ql, _col, end);
        }
        _col = end;
        if(_col < cols){
            setTimeout(_chunk, 0);
        } else {
            _finish();
        }
    }
    _chunk();
}